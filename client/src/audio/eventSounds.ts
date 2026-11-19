import { useEffect, useRef } from 'react';
import type { GameState } from '@cotiphu/shared';
import { walkOf } from '../components/Board';
import { playCoinSound, sayLine } from './gameAudio';

/** Câu nói khi quân đến ô. */
export const LINES = {
  rent: 'Ôi thôi chết!',
  tax: 'Là nó!',
  jail: 'Vào tù là rõ!',
} as const;

export interface EventCue {
  /** Có người vừa mua đất hay xây nhà: tiếng tiền rơi. */
  coins: boolean;
  line: keyof typeof LINES | null;
  /** Chờ bao lâu (ms) cho xúc xắc lăn và quân chạy xong rồi mới nói. */
  delay: number;
}

/** Thời gian xúc xắc lăn, quân nhún và chạy từng ô (giống Board). */
const walkMs = (steps: number) => 3000 + 200 + steps * 200;

/** Âm thanh cho thao tác vừa áp dụng (`previous` → `game`). */
export function cueOf(game: GameState, previous: GameState | null): EventCue {
  const none: EventCue = { coins: false, line: null, delay: 0 };
  if (!previous) return none;
  const coins = game.tiles.some((t, i) => {
    const before = previous.tiles[i];
    if (!t || t.owner === null) return false;
    const bought = !before || before.owner === null;
    return bought || (before.owner === t.owner && t.level > before.level);
  });
  const pd = game.pending;
  const was = previous.pending;
  const newPay = (reason: string) =>
    pd.type === 'pay' &&
    pd.reason === reason &&
    !(was.type === 'pay' && was.reason === reason && was.playerId === pd.playerId);
  const line: EventCue['line'] = game.events.some((e) => e.type === 'jail')
    ? 'jail'
    : newPay('rent')
      ? 'rent'
      : newPay('tax')
        ? 'tax'
        : null;
  const walk = walkOf(game, previous);
  return { coins, line, delay: walk ? walkMs(walk.steps) : 0 };
}

/** Phát tiếng tiền rơi và câu nói theo từng thao tác mới của ván (mọi máy đều nghe). */
export function useEventSounds(game: GameState, previous: GameState | null, actions: number) {
  const first = useRef(true);
  useEffect(() => {
    // Mở trang giữa ván thì không phát lại âm thanh của thao tác cũ.
    if (first.current) {
      first.current = false;
      return;
    }
    const cue = cueOf(game, previous);
    if (cue.coins) playCoinSound();
    const line = cue.line;
    if (!line) return;
    const t = setTimeout(() => sayLine(LINES[line]), cue.delay);
    return () => clearTimeout(t);
    // Chỉ chạy khi có thao tác mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);
}
