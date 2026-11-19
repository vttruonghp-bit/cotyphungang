import { chooseBotAction, type Action, type GameState } from '@cotiphu/shared';

/** In-game bot, deliberately deterministic and fully subject to engine rules. */
export const AI_PLAYER_ID = 'ai-chatgpt';

/** Nước đi của đối thủ máy; cùng bộ não với lúc máy chủ chơi hộ ghế vắng mặt. */
export function chooseAiAction(s: GameState): Action | null {
  return chooseBotAction(s, AI_PLAYER_ID);
}
