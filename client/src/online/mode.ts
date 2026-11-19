import { createContext, useContext } from 'react';
import type { ChatMessage, Seat } from '@cotiphu/shared';
import type { Voice } from './useVoice';

/**
 * Cách chơi của màn ván: chung một máy (người cầm máy là người ván đang chờ), hoặc online
 * (mỗi người một máy, `meId` là người cầm máy này).
 */
export type PlayMode =
  | { kind: 'hotseat' }
  | {
      kind: 'online';
      meId: string;
      /** Ghế trong phòng, để biết ai đang mất kết nối. */
      seats: readonly Seat[];
      /** Máy này đang nối với máy chủ. */
      connected: boolean;
      /** Tin nhắn trong phòng, cũ trước mới sau. */
      chat: readonly ChatMessage[];
      sendChat(text: string): Promise<string | null>;
      voice: Voice;
      /** Mã phòng, để mời thêm người vào xem. */
      code: string;
      /** Khách quan sát: chỉ xem, chat và nói chuyện, không có lượt. */
      spectator: boolean;
      /** Chủ phòng chơi chung một máy: máy này đi cho mọi người chơi (như chơi chung một máy). */
      controlsAll: boolean;
    };

export const HOT_SEAT: PlayMode = { kind: 'hotseat' };

export const PlayModeContext = createContext<PlayMode>(HOT_SEAT);

export const usePlayMode = (): PlayMode => useContext(PlayModeContext);

/** Người cầm máy này khi chơi online; null khi chơi chung một máy (kể cả có khách xem). */
export function useMeId(): string | null {
  const mode = usePlayMode();
  return mode.kind === 'online' && !mode.controlsAll ? mode.meId : null;
}
