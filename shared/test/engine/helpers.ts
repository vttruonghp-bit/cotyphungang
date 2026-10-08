import { expect } from 'vitest';
import {
  applyAction,
  createGame,
  scriptedRng,
  seededRng,
  type Action,
  type GameState,
  type PlayerState,
  type TileState,
} from '../../src';
import { PLAYERS } from './players';

export { PLAYERS };

/**
 * Ván mới `n` người (a, b, c…), người `a` đi trước, đang chờ `a` đổ.
 * Chồng thẻ giữ thứ tự xáo của hạt giống 1; test cần thẻ cụ thể thì gán `s.decks`.
 */
export function newGame(n = 2): GameState {
  const s = createGame(PLAYERS.slice(0, n), seededRng(1), false);
  s.current = 0;
  s.pending = { type: 'roll', playerId: 'a' };
  s.log = [];
  return s;
}

/** Áp dụng thao tác với xúc xắc kịch bản; báo lỗi nếu bị từ chối hoặc không dùng hết kịch bản. */
export function act(s: GameState, action: Action, dice: number[] = []): GameState {
  const rng = scriptedRng(dice);
  const r = applyAction(s, action, rng);
  if (!r.ok) throw new Error(`Thao tác ${JSON.stringify(action)} bị từ chối: ${r.error}`);
  expect(rng.remaining(), 'còn thừa số kịch bản').toBe(0);
  return r.state;
}

/** Thao tác phải bị từ chối; trả lại thông báo lỗi. Trạng thái gốc không đổi. */
export function reject(s: GameState, action: Action, dice: number[] = []): string {
  const before = JSON.stringify(s);
  const r = applyAction(s, action, scriptedRng(dice));
  if (r.ok) throw new Error(`Thao tác ${JSON.stringify(action)} lẽ ra phải bị từ chối`);
  expect(JSON.stringify(s)).toBe(before);
  return r.error;
}

/** Đổ xúc xắc cho người đang được chờ. */
export const roll = (s: GameState, d1: number, d2: number, ...extra: number[]): GameState =>
  act(s, { type: 'roll', playerId: who(s) }, [d1, d2, ...extra]);

export function who(s: GameState): string {
  if (!('playerId' in s.pending)) throw new Error('Ván không chờ ai');
  return s.pending.playerId;
}

export const player = (s: GameState, id: string): PlayerState => {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new Error(`Không có người chơi ${id}`);
  return p;
};

export const cash = (s: GameState, id: string): number => player(s, id).cash;

/** Gán chủ và trạng thái cho một ô mua được (sửa trực tiếp `s`). */
export function own(
  s: GameState,
  id: string | null,
  tile: number,
  patch: Partial<Omit<TileState, 'owner'>> = {},
): GameState {
  const t = s.tiles[tile];
  if (!t) throw new Error(`Ô ${tile} không mua được`);
  Object.assign(t, { level: 0, mortgaged: false, boughtTurn: null, ...patch, owner: id });
  return s;
}

/** Đặt tiền và vị trí cho người chơi (sửa trực tiếp `s`). */
export function setPlayer(s: GameState, id: string, patch: Partial<PlayerState>): GameState {
  Object.assign(player(s, id), patch);
  return s;
}

/** Đặt thẻ nằm trên cùng chồng thẻ (sửa trực tiếp `s`). */
export function topCard(s: GameState, cardId: string): GameState {
  const deck = cardId.startsWith('chance-') ? 'chance' : 'community';
  s.decks[deck] = [cardId, ...s.decks[deck].filter((c) => c !== cardId)];
  return s;
}

/** Tổng tiền mặt của mọi người, để kiểm tra tiền không tự sinh ra hay mất đi. */
export const totalCash = (s: GameState): number => s.players.reduce((a, p) => a + p.cash, 0);
