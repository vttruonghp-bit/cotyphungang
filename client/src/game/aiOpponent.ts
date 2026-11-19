import { chooseBotAction, type Action, type GameState } from '@cotiphu/shared';

/** Người máy khi chơi trên một máy (Đấu với ChatGPT AI); cùng cách chơi với bot của máy chủ. */
export const AI_PLAYER_ID = 'ai-chatgpt';

/** Một thao tác mỗi lần để xúc xắc, thẻ và lịch sử vẫn kịp hiện ra. */
export const chooseAiAction = (s: GameState): Action | null => chooseBotAction(s, AI_PLAYER_ID);
