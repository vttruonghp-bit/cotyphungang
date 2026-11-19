/**
 * Ván trong một phòng: tạo ván khi chủ phòng bắt đầu và áp dụng thao tác của từng ghế.
 * Xúc xắc và thẻ do máy chủ quyết, bằng nguồn ngẫu nhiên mật mã.
 */
import { randomInt } from 'node:crypto';
import {
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
  if (room.seats.length !== room.capacity) {
    return fail(`Cần đủ ${room.capacity} người, phòng mới có ${room.seats.length}`);
  }
  const players: NewPlayer[] = room.seats.map(({ id, name, color, icon }) => ({
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

/** Áp dụng thao tác (đã kiểm tra dạng) của ghế `seat`. */
export function playAction(room: Room, seat: SeatRecord, action: Action, rng: Rng): Result {
  if (room.phase === 'lobby' || !room.game) return fail('Ván chưa bắt đầu');
  if (room.phase === 'ended') return fail('Ván đã kết thúc');
  if (action.type === 'timeout' || action.playerId !== seat.id) {
    return fail('Bạn chỉ được thao tác cho chính mình');
  }
  return commit(room, room.game, action, rng);
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
