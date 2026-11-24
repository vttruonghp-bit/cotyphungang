/**
 * Danh sách phòng trong bộ nhớ: mã phòng, ghế (người chơi, bot, khách quan sát), vé, phòng chờ
 * và dọn phòng bỏ không. Không biết gì về socket; lớp socket gọi vào đây rồi gửi trạng thái
 * cho cả phòng.
 */
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  CHAT_HISTORY_MAX,
  MAX_BOTS,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  MIN_PLAYERS,
  PLAYER_COLOR_COUNT,
  PLAYER_ICON_COUNT,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type Action,
  type ChatMessage,
  type GameState,
  type Profile,
  type Rng,
  type RoomKind,
  type RoomPhase,
  type SeatRole,
  type SeatTicket,
} from '@cotiphu/shared';
import { playAction, playBot, playForSeat, startGame } from './game-room';
import { done, fail, ok, type Result } from './result';

/** Một ghế phía máy chủ: thêm vé bí mật và socket đang giữ ghế (không bao giờ gửi đi). */
export interface SeatRecord extends Profile {
  id: string;
  token: string;
  /** null khi người ngồi ghế không mở trang. */
  socketId: string | null;
  /** Thời điểm mất kết nối gần nhất; null khi đang mở trang. */
  awaySince: number | null;
  /** Máy chủ đang chơi hộ ghế này (vắng mặt quá lâu). */
  auto: boolean;
  /** Đang ở kênh nói chuyện / đang bật mic; về false khi đổi hay mất kết nối. */
  voice: boolean;
  mic: boolean;
  /** Thời điểm các tin gửi gần đây (chống gửi dồn dập). */
  chatTimes: number[];
  role: SeatRole;
  /** Máy chủ tự chơi ghế này (không có người, không có socket). */
  bot: boolean;
  /** Người chơi trên máy của chủ phòng (phòng chơi chung một máy, không có socket riêng). */
  local: boolean;
}

export interface Room {
  code: string;
  kind: RoomKind;
  phase: RoomPhase;
  hostId: string;
  seats: SeatRecord[];
  game: GameState | null;
  previous: GameState | null;
  /** Tăng mỗi khi phòng đổi (ghế, kết nối, ván). */
  version: number;
  /** Đếm để đặt mã ghế p1, p2… không trùng lại kể cả khi có người rời phòng chờ. */
  seatCounter: number;
  lastActivity: number;
  /** Các tin gần nhất (tối đa CHAT_HISTORY_MAX). */
  chat: ChatMessage[];
  chatCounter: number;
}

export interface SeatAt {
  room: Room;
  seat: SeatRecord;
}

/** Gửi tối đa CHAT_BURST tin trong CHAT_WINDOW_MS. */
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 5000;
export const CHAT_TOO_FAST = 'Bạn gửi nhanh quá, đợi một chút nhé';

/** Phòng không ai mở trang quá lâu thì bị xóa. */
export const ROOM_IDLE_MS = 2 * 60 * 60 * 1000;

/** Rời ván quá lâu thì máy chủ chơi hộ, để những người còn lại không phải chờ. */
export const AUTOPLAY_AFTER_MS = 3 * 60 * 1000;

export class Rooms {
  private readonly byCode = new Map<string, Room>();

  constructor(private readonly now: () => number = Date.now) {}

  get size(): number {
    return this.byCode.size;
  }

  get(code: string): Room | undefined {
    return this.byCode.get(code);
  }

  delete(code: string): void {
    this.byCode.delete(code);
  }

  /** Ghi nhận phòng vừa đổi. */
  touch(room: Room): void {
    room.version += 1;
    room.lastActivity = this.now();
  }

  /** Phòng chờ online; chủ phòng là người chơi đầu tiên. */
  create(host: Profile): SeatAt {
    return this.open('online', host);
  }

  /**
   * Phòng chơi chung một máy cho khách xem: mọi người chơi ngồi trên máy chủ phòng (người đầu),
   * ván bắt đầu ngay.
   */
  createLocal(players: Profile[], rng: Rng): Result<SeatAt> {
    if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
      return fail(`Số người phải từ ${MIN_PLAYERS} đến ${MAX_PLAYERS}`);
    }
    if (new Set(players.map((p) => p.color)).size !== players.length) {
      return fail('Màu của người chơi phải khác nhau');
    }
    if (new Set(players.map((p) => p.icon)).size !== players.length) {
      return fail('Kí hiệu của người chơi phải khác nhau');
    }
    const at = this.open('local', players[0]!);
    for (const p of players.slice(1)) this.addSeat(at.room, p, 'player').local = true;
    const res = startGame(at.room, at.seat, rng);
    if (!res.ok) {
      this.byCode.delete(at.room.code);
      return res;
    }
    this.touch(at.room);
    return ok(at);
  }

  private open(kind: RoomKind, host: Profile): SeatAt {
    const room: Room = {
      code: this.newCode(),
      kind,
      phase: 'lobby',
      hostId: '',
      seats: [],
      game: null,
      previous: null,
      version: 0,
      seatCounter: 0,
      lastActivity: this.now(),
      chat: [],
      chatCounter: 0,
    };
    const seat = this.addSeat(room, host, 'player');
    room.hostId = seat.id;
    this.byCode.set(room.code, room);
    return { room, seat };
  }

  /** Người chơi trong phòng (kể cả bot), theo thứ tự vào phòng. */
  players(room: Room): SeatRecord[] {
    return room.seats.filter((s) => s.role === 'player');
  }

  /**
   * Người mới vào phòng `code`: phòng chờ online còn chỗ thì là người chơi, không thì (đủ 6 người,
   * ván đã bắt đầu, phòng chơi chung một máy) là khách quan sát.
   */
  join(code: string, profile: Profile): Result<SeatAt> {
    const room = this.byCode.get(code);
    if (!room) return fail(`Không tìm thấy phòng ${code}`);
    const canPlay =
      room.kind === 'online' && room.phase === 'lobby' && this.players(room).length < MAX_PLAYERS;
    if (!canPlay && room.seats.filter((s) => s.role === 'spectator').length >= MAX_SPECTATORS) {
      return fail('Phòng đã đủ người xem');
    }
    return ok({ room, seat: this.addSeat(room, profile, canPlay ? 'player' : 'spectator') });
  }

  /** Thêm ghế; người chơi chọn màu hay kí hiệu trùng người chơi khác thì được cái trống ngẫu nhiên. */
  addSeat(room: Room, profile: Profile, role: SeatRole, bot = false): SeatRecord {
    room.seatCounter += 1;
    const seat: SeatRecord = {
      id: `p${room.seatCounter}`,
      token: randomBytes(24).toString('base64url'),
      name: profile.name,
      color: profile.color,
      icon: profile.icon,
      socketId: null,
      awaySince: null,
      auto: false,
      voice: false,
      mic: false,
      chatTimes: [],
      role,
      bot,
      local: false,
    };
    if (role === 'player') this.fitLook(room, seat);
    room.seats.push(seat);
    this.touch(room);
    return seat;
  }

  /** Màu, kí hiệu của người chơi `seat` trùng người chơi khác thì đổi sang cái trống ngẫu nhiên. */
  private fitLook(room: Room, seat: SeatRecord): void {
    const others = this.players(room).filter((s) => s !== seat);
    seat.color = randomFree(
      others.map((s) => s.color),
      seat.color,
      PLAYER_COLOR_COUNT,
    );
    seat.icon = randomFree(
      others.map((s) => s.icon),
      seat.icon,
      PLAYER_ICON_COUNT,
    );
  }

  /** Tự chuyển giữa người chơi và khách quan sát ở phòng chờ. */
  setRole(room: Room, seat: SeatRecord, role: SeatRole): Result {
    if (room.kind !== 'online' || room.phase !== 'lobby') {
      return fail('Chỉ đổi được vai ở phòng chờ');
    }
    if (seat.role === role) return done;
    if (role === 'player' && this.players(room).length >= MAX_PLAYERS) {
      return fail(`Đã đủ ${MAX_PLAYERS} người chơi`);
    }
    seat.role = role;
    if (role === 'player') this.fitLook(room, seat);
    this.touch(room);
    return done;
  }

  addBot(room: Room, seat: SeatRecord): Result {
    if (seat.id !== room.hostId) return fail('Chỉ chủ phòng được thêm bot');
    if (room.kind !== 'online' || room.phase !== 'lobby') {
      return fail('Chỉ thêm được bot ở phòng chờ');
    }
    const bots = room.seats.filter((s) => s.bot);
    if (bots.length >= MAX_BOTS) return fail(`Tối đa ${MAX_BOTS} bot`);
    if (this.players(room).length >= MAX_PLAYERS) return fail(`Đã đủ ${MAX_PLAYERS} người chơi`);
    const names = new Set(bots.map((b) => b.name));
    let n = 1;
    while (names.has(`Bot ${n}`)) n += 1;
    const used = this.players(room);
    const color = randomFree(
      used.map((s) => s.color),
      randomInt(PLAYER_COLOR_COUNT),
      PLAYER_COLOR_COUNT,
    );
    const icon = randomFree(
      used.map((s) => s.icon),
      randomInt(PLAYER_ICON_COUNT),
      PLAYER_ICON_COUNT,
    );
    this.addSeat(room, { name: `Bot ${n}`, color, icon }, 'player', true);
    return done;
  }

  removeBot(room: Room, seat: SeatRecord, botId: string): Result {
    if (seat.id !== room.hostId) return fail('Chỉ chủ phòng được bỏ bot');
    if (room.phase !== 'lobby') return fail('Ván đã bắt đầu, không bỏ bot được');
    const bot = room.seats.find((s) => s.id === botId && s.bot);
    if (!bot) return fail('Không có bot này');
    this.removeSeat(room, bot);
    return done;
  }

  removeSeat(room: Room, seat: SeatRecord): void {
    room.seats = room.seats.filter((s) => s !== seat);
    this.touch(room);
  }

  /** Tìm ghế theo vé; so token theo thời gian cố định. */
  findSeat(ticket: SeatTicket): Result<SeatAt> {
    const room = this.byCode.get(ticket.code);
    if (!room) return fail('Phòng không còn nữa');
    const seat = room.seats.find((s) => s.id === ticket.playerId);
    if (!seat || !sameSecret(seat.token, ticket.token)) return fail('Vé vào phòng không hợp lệ');
    return ok({ room, seat });
  }

  setSocket(room: Room, seat: SeatRecord, socketId: string | null): void {
    if (seat.socketId === socketId) return;
    seat.socketId = socketId;
    // Mất trang: tính giờ vắng mặt từ đây. Mở lại trang: trả quyền cho người chơi ngay.
    seat.awaySince = socketId === null ? this.now() : null;
    if (socketId !== null) seat.auto = false;
    // Trang mới (hay mất trang) phải tự vào lại kênh nói chuyện.
    seat.voice = false;
    seat.mic = false;
    this.touch(room);
  }

  /** Thêm một tin của `seat` (đã kiểm tra nội dung); từ chối khi gửi quá dồn dập. */
  chat(room: Room, seat: SeatRecord, text: string): Result<ChatMessage> {
    const now = this.now();
    seat.chatTimes = seat.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS);
    if (seat.chatTimes.length >= CHAT_BURST) return fail(CHAT_TOO_FAST);
    seat.chatTimes.push(now);
    room.chatCounter += 1;
    const message: ChatMessage = { id: room.chatCounter, from: seat.id, text, at: now };
    room.chat.push(message);
    if (room.chat.length > CHAT_HISTORY_MAX)
      room.chat.splice(0, room.chat.length - CHAT_HISTORY_MAX);
    room.lastActivity = now;
    return ok(message);
  }

  /** Vào / rời kênh nói chuyện; rời kênh thì tắt luôn mic. */
  setVoice(room: Room, seat: SeatRecord, on: boolean): void {
    if (seat.voice === on && (on || !seat.mic)) return;
    seat.voice = on;
    if (!on) seat.mic = false;
    this.touch(room);
  }

  setMic(room: Room, seat: SeatRecord, on: boolean): Result {
    if (on && !seat.voice) return fail('Chưa vào kênh nói chuyện');
    if (seat.mic !== on) {
      seat.mic = on;
      this.touch(room);
    }
    return done;
  }

  setProfile(room: Room, seat: SeatRecord, profile: Profile): Result {
    if (room.phase !== 'lobby') return fail('Chỉ đổi được tên, màu, biểu tượng ở phòng chờ');
    // Khách quan sát không có quân nên màu, kí hiệu trùng cũng không sao.
    const others = seat.role === 'player' ? this.players(room).filter((s) => s !== seat) : [];
    if (others.some((s) => s.color === profile.color)) return fail('Màu này đã có người chọn');
    if (others.some((s) => s.icon === profile.icon)) return fail('Biểu tượng này đã có người chọn');
    seat.name = profile.name;
    seat.color = profile.color;
    seat.icon = profile.icon;
    this.touch(room);
    return done;
  }

  start(room: Room, seat: SeatRecord, rng: Rng): Result {
    const res = startGame(room, seat, rng);
    if (res.ok) this.touch(room);
    return res;
  }

  act(room: Room, seat: SeatRecord, action: Action, rng: Rng): Result {
    const res = playAction(room, seat, action, rng);
    if (res.ok) this.touch(room);
    return res;
  }

  /** Bot đang tới lượt (ván đang chờ bot), null nếu không có. */
  botToMove(room: Room): SeatRecord | null {
    const pending = room.phase === 'playing' ? room.game?.pending : undefined;
    if (!pending || pending.type === 'ended') return null;
    return room.seats.find((s) => s.bot && s.id === pending.playerId) ?? null;
  }

  /** Cho bot đang tới lượt đi một thao tác. */
  playBot(room: Room, rng: Rng): Result {
    const bot = this.botToMove(room);
    if (!bot) return fail('Không phải lượt bot');
    const res = playBot(room, bot, rng);
    if (res.ok) this.touch(room);
    return res;
  }

  /**
   * Bật cờ chơi hộ cho người chơi vắng mặt lâu hơn `afterMs`, và nếu ván đang chờ một ghế như thế
   * thì đi hộ một nước. Trả true khi phòng có gì đổi (để lớp socket gửi trạng thái mới).
   * Bot đã tự chơi, khách xem không có lượt; phòng chơi trên 1 máy thì chủ phòng bấm cho mọi người
   * nên không chơi hộ.
   */
  autoPlay(room: Room, rng: Rng, afterMs: number = AUTOPLAY_AFTER_MS): boolean {
    if (room.phase !== 'playing' || !room.game || room.kind === 'local') return false;
    const now = this.now();
    let changed = false;
    for (const seat of room.seats) {
      const away =
        seat.role === 'player' &&
        !seat.bot &&
        seat.socketId === null &&
        seat.awaySince !== null &&
        now - seat.awaySince >= afterMs;
      if (seat.auto !== away) {
        seat.auto = away;
        changed = true;
      }
    }
    const pending = room.game.pending;
    const waitingId = 'playerId' in pending ? pending.playerId : null;
    const waiting = waitingId === null ? undefined : room.seats.find((s) => s.id === waitingId);
    if (waiting?.auto && playForSeat(room, waiting, rng).ok) changed = true;
    if (changed) this.touch(room);
    return changed;
  }

  /** Các phòng đang trong ván (để đi hộ từng phòng một). */
  playing(): Room[] {
    return [...this.byCode.values()].filter((r) => r.phase === 'playing');
  }

  /** Xóa phòng không ai mở trang trong `idleMs`. Trả các phòng đã xóa. */
  sweep(idleMs: number = ROOM_IDLE_MS): Room[] {
    const removed: Room[] = [];
    const now = this.now();
    for (const room of this.byCode.values()) {
      const empty = room.seats.every((s) => s.socketId === null);
      if (empty && now - room.lastActivity >= idleMs) {
        this.byCode.delete(room.code);
        removed.push(room);
      }
    }
    return removed;
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.byCode.has(code)) return code;
    }
  }
}

/** `wanted` nếu chưa ai dùng, không thì một số còn trống bất kì. */
export function randomFree(used: number[], wanted: number, count: number): number {
  if (!used.includes(wanted)) return wanted;
  const free = Array.from({ length: count }, (_, i) => i).filter((i) => !used.includes(i));
  return free.length ? free[randomInt(free.length)]! : wanted;
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const ticketOf = ({ room, seat }: SeatAt): SeatTicket => ({
  code: room.code,
  playerId: seat.id,
  token: seat.token,
});
