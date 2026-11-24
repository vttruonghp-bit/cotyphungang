import type { GameState } from '@cotiphu/shared';

/** Thao tác vừa rồi có người mua đất hoặc xây thêm nhà (để phát tiếng tiền rơi). */
export function boughtOrBuilt(previous: GameState | null, game: GameState): boolean {
  if (!previous) return false;
  return game.tiles.some((t, i) => {
    const before = previous.tiles[i];
    if (!t || t.owner === null) return false;
    if (!before || before.owner === null) return true;
    return before.owner === t.owner && t.level > before.level;
  });
}

/**
 * Lượt nào đang chờ bấm "Kết thúc" (mỗi lượt chỉ nhắc một lần), hoặc null nếu ván không chờ
 * việc đó. Dùng làm khóa: cùng lượt, cùng người thì không nhắc lại.
 */
export function endTurnKey(game: GameState): string | null {
  const pd = game.pending;
  return pd.type === 'endTurn' ? `${game.turnNumber}:${pd.playerId}` : null;
}
