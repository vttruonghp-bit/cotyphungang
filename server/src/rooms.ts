/**
 * Danh sách phòng trong bộ nhớ: mã phòng, ghế, vé, số người, phòng chờ và dọn phòng bỏ không.
 * Không biết gì về socket; lớp socket gọi vào đây rồi gửi trạng thái cho cả phòng.
 */
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  CHAT_HISTORY_MAX,
  PLAYER_COLOR_COUNT,
  PLAYER_ICON_COUNT,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type Action,
  type ChatMessage,
  type GameState,
  type Profile,
  type Rng,
  type RoomPhase,
  type SeatTicket,
} from '@cotiphu/shared';
import { playAction, startGame } from './game-room';
import { done, fail, ok, type Result } from './result';

/** Một ghế phía máy chủ: thêm vé bí mật và socket đang giữ ghế (không bao giờ gửi đi). */
export interface SeatRecord extends Profile {
  id: string;
  token: string;
  /** null khi người ngồi ghế không mở trang. */
  socketId: string | null;
  /** Đang ở kênh nói chuyện / đang bật mic; về false khi đổi hay mất kết nối. */
  voice: boolean;
  mic: boolean;
  /** Thời điểm các tin gửi gần đây (chống gửi dồn dập). */
  chatTimes: number[];
}

export interface Room {
  code: string;
  phase: RoomPhase;
  capacity: number;
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

  create(capacity: number, host: Profile): SeatAt {
    const room: Room = {
      code: this.newCode(),
      phase: 'lobby',
      capacity,
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
    const seat = this.addSeat(room, host);
    room.hostId = seat.id;
    this.byCode.set(room.code, room);
    return { room, seat };
  }

  /** Phòng `code` còn nhận người mới không. */
  joinable(code: string): Result<Room> {
    const room = this.byCode.get(code);
    if (!room) return fail(`Không tìm thấy phòng ${code}`);
    if (room.phase !== 'lobby') return fail('Phòng này đã vào ván');
    if (room.seats.length >= room.capacity) return fail('Phòng đã đủ người');
    return ok(room);
  }

  /** Thêm ghế; màu hay biểu tượng đã có người dùng thì lấy cái còn trống đầu tiên. */
  addSeat(room: Room, profile: Profile): SeatRecord {
    room.seatCounter += 1;
    const seat: SeatRecord = {
      id: `p${room.seatCounter}`,
      token: randomBytes(24).toString('base64url'),
      name: profile.name,
      color: firstFree(
        room.seats.map((s) => s.color),
        profile.color,
        PLAYER_COLOR_COUNT,
      ),
      icon: firstFree(
        room.seats.map((s) => s.icon),
        profile.icon,
        PLAYER_ICON_COUNT,
      ),
      socketId: null,
      voice: false,
      mic: false,
      chatTimes: [],
    };
    room.seats.push(seat);
    this.touch(room);
    return seat;
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
    const others = room.seats.filter((s) => s !== seat);
    if (others.some((s) => s.color === profile.color)) return fail('Màu này đã có người chọn');
    if (others.some((s) => s.icon === profile.icon)) return fail('Biểu tượng này đã có người chọn');
    seat.name = profile.name;
    seat.color = profile.color;
    seat.icon = profile.icon;
    this.touch(room);
    return done;
  }

  setCapacity(room: Room, seat: SeatRecord, capacity: number): Result {
    if (seat.id !== room.hostId) return fail('Chỉ chủ phòng được đổi số người');
    if (room.phase !== 'lobby') return fail('Ván đã bắt đầu, không đổi được số người');
    if (capacity < room.seats.length) {
      return fail(`Phòng đang có ${room.seats.length} người, không giảm xuống ${capacity} được`);
    }
    if (capacity !== room.capacity) {
      room.capacity = capacity;
      this.touch(room);
    }
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

/** `wanted` nếu chưa ai dùng, không thì số nhỏ nhất còn trống. */
function firstFree(used: number[], wanted: number, count: number): number {
  if (!used.includes(wanted)) return wanted;
  for (let i = 0; i < count; i++) if (!used.includes(i)) return i;
  return wanted;
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
