import { BOARD_SIZE, type GameState, type PayReason } from '@cotiphu/shared';
import { ANTICIPATION_MS, ROLL_MS, STEP_MS, walkOf } from '../components/Board';

/** Tự mua đất, tự xây nhà, nộp thuế: tiền giảm nhưng không phải "bị trừ tiền" để khóc. */
const NOT_A_LOSS: readonly PayReason[] = ['tax', 'purchase', 'upgrade'];

/**
 * Pháo hoa cho thao tác vừa rồi: được 200Đ khi qua / dừng ô Xuất phát, hoặc lá Cơ hội / Khí vận
 * vừa áp dụng làm người rút có thêm tiền. Trả số ms cần chờ (xúc xắc lăn và quân chạy tới ô
 * Xuất phát), hoặc null nếu không có gì để mừng.
 */
export function fireworksDelay(previous: GameState | null, game: GameState): number | null {
  if (!previous) return null;
  const go = game.events.find((e) => e.type === 'move' && e.passedGo);
  if (go) {
    const walk = walkOf(game, previous);
    if (walk && walk.playerId === go.playerId) {
      // Quân chạy từng ô: pháo hoa lúc quân bước vào ô 00.
      return ROLL_MS + ANTICIPATION_MS + (BOARD_SIZE - walk.from) * STEP_MS;
    }
    return 0;
  }
  const card = game.events.find((e) => e.type === 'card');
  if (card) {
    const before = previous.players.find((p) => p.id === card.playerId);
    const after = game.players.find((p) => p.id === card.playerId);
    if (before && after && after.cash > before.cash) return 0;
  }
  return null;
}

/**
 * Thao tác vừa rồi làm ai đó bị trừ tiền (trả thuê, phạt theo thẻ, nộp tiền ra tù…), không tính
 * nộp thuế, tự mua đất / xây nhà và tự chuộc đất trong Ụp/Mở.
 */
export function lostMoney(previous: GameState | null, game: GameState): boolean {
  if (!previous) return false;
  const was = previous.pending;
  if (was.type === 'buy' || was.type === 'upgrade') return false;
  if (was.type === 'pay' && NOT_A_LOSS.includes(was.reason)) return false;
  // Ụp/Mở giữa lượt (chuộc đất…): ván vẫn chờ đúng việc cũ của đúng người.
  const now = game.pending;
  if (
    was.type !== 'pay' &&
    now.type === was.type &&
    'playerId' in now &&
    'playerId' in was &&
    now.playerId === was.playerId
  ) {
    return false;
  }
  return game.players.some((p) => {
    const before = previous.players.find((x) => x.id === p.id);
    return before !== undefined && p.cash < before.cash;
  });
}
