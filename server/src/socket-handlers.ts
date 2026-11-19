/**
 * Nối các sự kiện Socket.IO với danh sách phòng. Mỗi socket giữ tối đa một ghế,
 * mỗi ghế chỉ một socket: socket mới thay socket cũ, socket cũ lặng lẽ bị tách khỏi phòng
 * (không gửi `room:closed`, vì trang cũ sẽ xóa vé dùng chung trong trình duyệt).
 * Sau mỗi thay đổi, cả phòng nhận `room:state` mới; phản hồi (ack) luôn đi trước trạng thái.
 */
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, Rng, ServerToClientEvents } from '@cotiphu/shared';
import { fail, ok, toAck, type Result } from './result';
import { ticketOf, type Room, type Rooms, type SeatAt } from './rooms';
import {
  isRecord,
  parseAction,
  parseChatText,
  parseCode,
  parsePlayers,
  parseProfile,
  parseRole,
  parseSignal,
  parseTicket,
} from './validate';
import { roomView } from './view';

export interface SocketData {
  /** Ghế socket đang giữ, null khi chưa vào phòng nào. */
  seat: { code: string; playerId: string } | null;
  /** Ghế của socket này đã được mở ở trang khác. */
  replaced: boolean;
}

type NoEvents = Record<string, never>;
export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, NoEvents, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, NoEvents, SocketData>;
/** Socket nhìn như dữ liệu thô: tham số từ trình duyệt chưa được tin. */
type RawSocket = { on(event: string, fn: (...args: unknown[]) => void): void };

/** Lí do đóng phòng gửi kèm `room:closed`. */
export const CLOSED_HOST_LEFT = 'Chủ phòng đã rời phòng';

export const NOT_SEATED = 'Bạn chưa vào phòng nào';
export const SEAT_OPENED_ELSEWHERE =
  'Ghế của bạn đang mở ở trang khác. Tải lại trang để chơi ở đây.';

const notSeated = (socket: IoSocket) =>
  fail(socket.data.replaced ? SEAT_OPENED_ELSEWHERE : NOT_SEATED);

/** Kênh Socket.IO của phòng (đặt tiền tố để không trùng mã socket). */
const channel = (code: string) => `phong:${code}`;

/** Một lần xử lý: các phòng đã đổi sẽ được gửi trạng thái sau khi trả lời. */
type Handler = (socket: IoSocket, payload: unknown, changed: Set<Room>) => Result<unknown>;

/**
 * Bot chờ bao lâu (ms) trước khi đi thao tác kế tiếp, để mọi người kịp xem xúc xắc lăn,
 * quân chạy (giống thời gian vẽ trên trình duyệt) và đọc thẻ.
 */
export function botDelay(room: Room): number {
  const game = room.game;
  if (!game) return 0;
  const roll = game.events.find((e) => e.type === 'roll');
  const move = game.events.find((e) => e.type === 'move');
  if (roll && move?.type === 'move') {
    const steps = (move.to - move.from + 40) % 40;
    return 3000 + 200 + steps * 200 + 1200;
  }
  if (roll) return 3800;
  // Thẻ Cơ hội / Khí vận hiện ngay khi vào ô: để mọi người đọc rồi bot mới xác nhận.
  if (game.pending.type === 'drawCard') return 2600;
  return 1300;
}

export interface RoomHandlers {
  /** Dừng mọi lượt bot đang hẹn giờ (khi tắt máy chủ). */
  stop(): void;
}

export function attachRoomHandlers(
  io: IoServer,
  rooms: Rooms,
  rng: Rng,
  /** Nhân thời gian chờ của bot (test dùng 0 để bot đi ngay). */
  botSpeed = 1,
): RoomHandlers {
  const socketOf = (id: string | null) => (id === null ? undefined : io.sockets.sockets.get(id));
  /** Lượt bot đã hẹn của mỗi phòng, gắn với trạng thái ván lúc hẹn. */
  const botTimers = new Map<string, { game: unknown; timer: ReturnType<typeof setTimeout> }>();

  function broadcast(room: Room) {
    if (rooms.get(room.code) !== room) return;
    io.to(channel(room.code)).emit('room:state', roomView(room));
    scheduleBot(room);
  }

  /** Ván đang chờ bot thì hẹn giờ cho bot đi; không còn ai mở trang thì bot cũng nghỉ. */
  function scheduleBot(room: Room) {
    const planned = botTimers.get(room.code);
    if (planned?.game === room.game) return;
    if (planned) clearTimeout(planned.timer);
    botTimers.delete(room.code);
    if (!rooms.botToMove(room) || room.seats.every((s) => s.socketId === null)) return;
    const timer = setTimeout(
      () => {
        botTimers.delete(room.code);
        if (rooms.get(room.code) !== room) return;
        try {
          if (rooms.playBot(room, rng).ok) broadcast(room);
        } catch (err) {
          console.error('Lỗi khi bot đi:', err);
        }
      },
      botDelay(room) * botSpeed,
    );
    timer.unref?.();
    botTimers.set(room.code, { game: room.game, timer });
  }

  /** Ghế mà socket đang thực sự giữ (đã bị thay hay phòng đã xóa thì coi như không có). */
  function seated(socket: IoSocket): SeatAt | null {
    const ref = socket.data.seat;
    if (!ref) return null;
    const room = rooms.get(ref.code);
    const seat = room?.seats.find((s) => s.id === ref.playerId);
    if (!room || !seat || seat.socketId !== socket.id) {
      socket.data.seat = null;
      return null;
    }
    return { room, seat };
  }

  function detach(socket: IoSocket, room: Room) {
    socket.data.seat = null;
    void socket.leave(channel(room.code));
  }

  /** Cho socket ngồi ghế; socket cũ của ghế (nếu còn) bị ngắt khỏi phòng. */
  function attach(socket: IoSocket, { room, seat }: SeatAt) {
    if (seat.socketId !== socket.id) {
      const old = socketOf(seat.socketId);
      if (old) {
        detach(old, room);
        old.data.replaced = true;
      }
      rooms.setSocket(room, seat, socket.id);
    }
    socket.data.seat = { code: room.code, playerId: seat.id };
    socket.data.replaced = false;
    void socket.join(channel(room.code));
    // Tin nhắn gần đây cho trang vừa vào (hoặc vào lại).
    socket.emit('chat:history', room.chat);
  }

  function closeRoom(room: Room, reason: string, by: IoSocket) {
    for (const seat of room.seats) {
      const s = socketOf(seat.socketId);
      if (!s) continue;
      detach(s, room);
      if (s !== by) s.emit('room:closed', reason);
    }
    rooms.delete(room.code);
  }

  /**
   * Socket bỏ ghế đang giữ. Phòng chờ: trả ghế, chủ phòng rời thì đóng phòng. Khách quan sát
   * lúc nào cũng trả ghế; chủ phòng chơi chung một máy rời thì đóng phòng.
   * Người chơi trong ván hay ván đã xong: ghế vẫn còn, chỉ coi như mất kết nối.
   */
  function release(socket: IoSocket, changed: Set<Room>) {
    const at = seated(socket);
    if (!at) return;
    const { room, seat } = at;
    const isHost = seat.id === room.hostId;
    if (isHost && (room.phase === 'lobby' || room.kind === 'local')) {
      closeRoom(room, CLOSED_HOST_LEFT, socket);
      changed.delete(room);
      return;
    }
    if (room.phase === 'lobby' || seat.role === 'spectator') rooms.removeSeat(room, seat);
    else rooms.setSocket(room, seat, null);
    detach(socket, room);
    changed.add(room);
  }

  const handlers: Record<keyof ClientToServerEvents, Handler> = {
    'room:create': (socket, req, changed) => {
      if (!isRecord(req)) return fail('Yêu cầu không hợp lệ');
      const profile = parseProfile(req.profile);
      if (!profile.ok) return profile;
      release(socket, changed);
      const at = rooms.create(profile.value);
      attach(socket, at);
      changed.add(at.room);
      return ok(ticketOf(at));
    },

    'room:local': (socket, req, changed) => {
      if (!isRecord(req)) return fail('Yêu cầu không hợp lệ');
      const players = parsePlayers(req.players);
      if (!players.ok) return players;
      const at = rooms.createLocal(players.value, rng);
      if (!at.ok) return at;
      release(socket, changed);
      attach(socket, at.value);
      changed.add(at.value.room);
      return ok(ticketOf(at.value));
    },

    'room:join': (socket, req, changed) => {
      if (!isRecord(req)) return fail('Yêu cầu không hợp lệ');
      const code = parseCode(req.code);
      if (!code.ok) return code;
      const profile = parseProfile(req.profile);
      if (!profile.ok) return profile;
      if (seated(socket)?.room.code === code.value) return fail('Bạn đã ở trong phòng này');
      const joined = rooms.join(code.value, profile.value);
      if (!joined.ok) return joined;
      // Ghế cũ (nếu có) ở phòng khác nên bỏ sau cũng được.
      release(socket, changed);
      const at = joined.value;
      attach(socket, at);
      changed.add(at.room);
      return ok(ticketOf(at));
    },

    'room:resume': (socket, req, changed) => {
      const ticket = parseTicket(req);
      if (!ticket.ok) return ticket;
      const found = rooms.findSeat(ticket.value);
      if (!found.ok) return found;
      const at = found.value;
      if (seated(socket)?.seat !== at.seat) release(socket, changed);
      // Bỏ ghế cũ có thể vừa đóng chính phòng này (người giữ hai vé).
      if (rooms.get(at.room.code) !== at.room || !at.room.seats.includes(at.seat)) {
        return fail('Phòng không còn nữa');
      }
      attach(socket, at);
      changed.add(at.room);
      return ok(ticketOf(at));
    },

    'room:profile': (socket, req, changed) => {
      const at = seated(socket);
      if (!at) return notSeated(socket);
      const profile = parseProfile(req);
      if (!profile.ok) return profile;
      const res = rooms.setProfile(at.room, at.seat, profile.value);
      if (res.ok) changed.add(at.room);
      return res;
    },

    'room:role': (socket, req, changed) => {
      const at = seated(socket);
      if (!at) return notSeated(socket);
      const role = parseRole(req);
      if (!role.ok) return role;
      const res = rooms.setRole(at.room, at.seat, role.value);
      if (res.ok) changed.add(at.room);
      return res;
    },

    'room:addBot': (socket, _req, changed) => {
      const at = seated(socket);
      if (!at) return notSeated(socket);
      const res = rooms.addBot(at.room, at.seat);
      if (res.ok) changed.add(at.room);
      return res;
    },

    'room:removeBot': (socket, req, changed) => {
      const at = seated(socket);
      if (!at) return notSeated(socket);
      if (typeof req !== 'string' || req.length > 32) return fail('Không có bot này');
      const res = rooms.removeBot(at.room, at.seat, req);
      if (res.ok) changed.add(at.room);
      return res;
    },

    'room:start': (socket, _req, changed) => {
      const at = seated(socket);
      if (!at) return notSeated(socket);
      const res = rooms.start(at.room, at.seat, rng);
      if (res.ok) changed.add(at.room);
      return res;
    },

    'room:leave': (socket, _req, changed) => {
      const at = seated(socket);
      // Chưa vào phòng nào thì coi như đã rời; ghế đang mở ở trang khác thì không rời thay được.
      if (!at) return socket.data.replaced ? notSeated(socket) : ok(undefined);
      const { room, seat } = at;
      const free = seat.role === 'spectator' || (room.kind === 'local' && seat.id === room.hostId);
      if (room.phase === 'playing' && !free) {
        return fail('Đang trong ván, muốn rời thì dùng Đầu hàng');
      }
      release(socket, changed);
      return ok(undefined);
    },

    'game:action': (socket, req, changed) => {
      const at = seated(socket);
      if (!at) return notSeated(socket);
      const action = parseAction(req);
      if (!action.ok) return action;
      const res = rooms.act(at.room, at.seat, action.value, rng);
      if (res.ok) changed.add(at.room);
      return res;
    },

    'chat:send': (socket, req) => {
      const at = seated(socket);
      if (!at) return notSeated(socket);
      const text = parseChatText(req);
      if (!text.ok) return text;
      const res = rooms.chat(at.room, at.seat, text.value);
      if (!res.ok) return res;
      io.to(channel(at.room.code)).emit('chat:message', res.value);
      return ok(undefined);
    },

    'voice:join': (socket, _req, changed) => {
      const at = seated(socket);
      if (!at) return notSeated(socket);
      rooms.setVoice(at.room, at.seat, true);
      changed.add(at.room);
      // Máy vào sau gọi tới những máy đã ở trong kênh, nên hai máy không gọi nhau cùng lúc.
      const peers = at.room.seats.filter((s) => s !== at.seat && s.voice && s.socketId !== null);
      return ok(peers.map((s) => s.id));
    },

    'voice:leave': (socket, _req, changed) => {
      const at = seated(socket);
      if (!at) return ok(undefined);
      rooms.setVoice(at.room, at.seat, false);
      changed.add(at.room);
      return ok(undefined);
    },

    'voice:mic': (socket, req, changed) => {
      const at = seated(socket);
      if (!at) return notSeated(socket);
      if (typeof req !== 'boolean') return fail('Yêu cầu không hợp lệ');
      const res = rooms.setMic(at.room, at.seat, req);
      if (res.ok) changed.add(at.room);
      return res;
    },

    'voice:signal': (socket, req) => {
      const at = seated(socket);
      if (!at) return notSeated(socket);
      if (!at.seat.voice) return fail('Chưa vào kênh nói chuyện');
      const msg = parseSignal(req);
      if (!msg.ok) return msg;
      const target = at.room.seats.find((s) => s.id === msg.value.to);
      const to = target?.voice ? socketOf(target.socketId) : undefined;
      if (!to) return fail('Người này không ở trong kênh nói chuyện');
      to.emit('voice:signal', { from: at.seat.id, signal: msg.value.signal });
      return ok(undefined);
    },
  };

  io.on('connection', (socket) => {
    socket.data.seat = null;
    socket.data.replaced = false;
    for (const [event, handler] of Object.entries(handlers) as [string, Handler][]) {
      (socket as unknown as RawSocket).on(event, (...args) => {
        const last = args[args.length - 1];
        const ack = typeof last === 'function' ? (args.pop() as (res: unknown) => void) : null;
        const changed = new Set<Room>();
        let res: Result<unknown>;
        try {
          res = handler(socket, args[0], changed);
        } catch (err) {
          console.error(`Lỗi khi xử lý ${event}:`, err);
          res = fail('Máy chủ gặp lỗi, thao tác chưa được thực hiện');
        }
        ack?.(toAck(res));
        for (const room of changed) broadcast(room);
      });
    }

    socket.on('disconnect', () => {
      const at = seated(socket);
      if (!at) return;
      rooms.setSocket(at.room, at.seat, null);
      broadcast(at.room);
    });
  });

  return {
    stop() {
      for (const { timer } of botTimers.values()) clearTimeout(timer);
      botTimers.clear();
    },
  };
}
