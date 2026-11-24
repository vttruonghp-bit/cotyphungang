/**
 * Ván trong một phòng: tạo ván khi chủ phòng bắt đầu và áp dụng thao tác của từng ghế.
 * Xúc xắc và thẻ do máy chủ quyết, bằng nguồn ngẫu nhiên mật mã.
 */
import { randomInt } from 'node:crypto';
import {
  MIN_PLAYERS,
  RuleError,
  applyAction,
  chooseBotAction,
  createGame,
  isGameOver,
  type Action,
  type GameState,
  type NewPlayer,
  type Rng,
} from '@cotiphu/shared';
import type { Room, SeatRecord } from './rooms';
import { done, fail, type Result } from './result';

/**
 * Nguồn ngẫu nhiên mật mã cho mọi ván online. Không dùng hạt giống 32 bit
 * vì nhìn đủ nhiều lần đổ là dò ra được hạt giống, rồi biết trước thẻ và xúc xắc.
 */
export const cryptoRng: Rng = { int: (min, max) => randomInt(min, max + 1) };

export function startGame(room: Room, seat: SeatRecord, rng: Rng): Result {
  if (seat.id !== room.hostId) return fail('Chỉ chủ phòng được bắt đầu ván');
  if (room.phase !== 'lobby') return fail('Ván đã bắt đầu rồi');
  const seats = room.seats.filter((s) => s.role === 'player');
  if (seats.length < MIN_PLAYERS) {
    return fail(`Cần ít nhất ${MIN_PLAYERS} người chơi (thêm bot hoặc chờ người vào)`);
  }
  const players: NewPlayer[] = seats.map(({ id, name, color, icon }) => ({
    id,
    name,
    color,
    icon,
  }));
  try {
    room.game = createGame(players, rng);
  } catch (err) {
    if (err instanceof RuleError) return fail(err.message);
    throw err;
  }
  room.previous = null;
  room.phase = 'playing';
  return done;
}

/**
 * Ghế `seat` được thao tác cho người chơi `playerId` không: cho chính mình, hoặc chủ phòng chơi
 * chung một máy thao tác cho mọi người chơi trên máy mình.
 */
function controls(room: Room, seat: SeatRecord, playerId: string): boolean {
  if (seat.role !== 'player' || seat.bot) return false;
  if (playerId === seat.id) return true;
  return (
    room.kind === 'local' &&
    seat.id === room.hostId &&
    room.seats.some((s) => s.id === playerId && s.local)
  );
}

/** Áp dụng thao tác (đã kiểm tra dạng) của ghế `seat`. */
export function playAction(room: Room, seat: SeatRecord, action: Action, rng: Rng): Result {
  if (room.phase === 'lobby' || !room.game) return fail('Ván chưa bắt đầu');
  if (room.phase === 'ended') return fail('Ván đã kết thúc');
  if (seat.role === 'spectator') return fail('Bạn đang xem, không có lượt trong ván này');
  if (action.type === 'timeout' || !controls(room, seat, action.playerId)) {
    return fail('Bạn chỉ được thao tác cho chính mình');
  }
  return commit(room, room.game, action, rng);
}

/** Bot `bot` đi một thao tác; thao tác bot chọn bị luật từ chối thì coi như hết giờ. */
export function playBot(room: Room, bot: SeatRecord, rng: Rng): Result {
  if (room.phase !== 'playing' || !room.game) return fail('Ván không còn chạy');
  const game = room.game;
  const action = chooseBotAction(game, bot.id) ?? { type: 'timeout' };
  const res = commit(room, game, action, rng);
  return res.ok || action.type === 'timeout' ? res : commit(room, game, { type: 'timeout' }, rng);
}

/**
 * Chơi hộ một nước cho ghế vắng mặt: bot chọn nước rồi áp dụng như thao tác của chính ghế đó,
 * nên ván vẫn chạy đúng luật. Người chơi quay lại thì không ai gọi hàm này nữa.
 */
export function playForSeat(room: Room, seat: SeatRecord, rng: Rng): Result {
  if (room.phase !== 'playing' || !room.game) return fail('Ván chưa bắt đầu');
  const action = chooseBotAction(room.game, seat.id);
  if (!action) return fail('Ván không chờ ghế này');
  return commit(room, room.game, action, rng);
}

/** Đưa một nước qua bộ luật rồi ghi lại vào phòng. */
function commit(room: Room, game: GameState, action: Action, rng: Rng): Result {
  const result = applyAction(game, action, rng);
  if (!result.ok) return fail(result.error);
  room.previous = game;
  room.game = result.state;
  if (isGameOver(result.state)) room.phase = 'ended';
  // Đổi màu/biểu tượng trong ván thì ghế cũng đổi theo.
  for (const p of result.state.players) {
    const s = room.seats.find((x) => x.id === p.id);
    if (s) {
      s.color = p.color;
      s.icon = p.icon;
    }
  }
  return done;
}
