import type { GameState, OrderRolls } from './types';

const sums = (rolls: readonly [number, number][] | undefined): number[] =>
  (rolls ?? []).map(([a, b]) => a + b);

/** `a` trùng phần đầu của `b` (hoặc bằng hẳn). */
const isPrefix = (a: number[], b: number[]) =>
  a.length <= b.length && a.every((x, i) => x === b[i]);

/**
 * Người này còn phải đổ chọn thứ tự: chưa đổ lần nào, hoặc các lần đổ của mình đang bằng điểm
 * (từng lần) với một người khác, nên chưa phân được ai trước ai sau.
 */
export function needsOrderRoll(
  rolls: OrderRolls,
  playerId: string,
  ids: readonly string[],
): boolean {
  const mine = sums(rolls[playerId]);
  if (mine.length === 0) return true;
  return ids.some((id) => id !== playerId && isPrefix(mine, sums(rolls[id])));
}

/** So hai dãy điểm: lần đổ đầu cao hơn thì đi trước; bằng nhau thì xét lần đổ lại. */
function compareDesc(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return b[i]! - a[i]!;
  }
  return b.length - a.length;
}

/** Thứ tự đi (mã người chơi, người đi trước đứng đầu) theo các lần đổ. */
export function rankByRolls(rolls: OrderRolls, ids: readonly string[]): string[] {
  return [...ids].sort((x, y) => compareDesc(sums(rolls[x]), sums(rolls[y])));
}

/** Những người ván đang chờ: lúc chọn thứ tự là mọi người còn phải đổ, còn lại là một người. */
export function waitingOn(s: Pick<GameState, 'pending' | 'players'>): string[] {
  const pd = s.pending;
  if (pd.type === 'order') {
    const ids = s.players.map((p) => p.id);
    return ids.filter((id) => needsOrderRoll(pd.rolls, id, ids));
  }
  return 'playerId' in pd ? [pd.playerId] : [];
}
