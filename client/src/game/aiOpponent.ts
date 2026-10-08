import {
  BOARD,
  JAIL_BAIL,
  redeemCost,
  type Action,
  type GameState,
  type ManageOp,
} from '@cotiphu/shared';

/** In-game bot, deliberately deterministic and fully subject to engine rules. */
export const AI_PLAYER_ID = 'ai-chatgpt';

const me = (s: GameState) => s.players.find((p) => p.id === AI_PLAYER_ID)!;
const owned = (s: GameState) => s.tiles.flatMap((t, i) => (t?.owner === AI_PLAYER_ID ? [i] : []));
const buyPrice = (i: number) => {
  const tile = BOARD[i];
  return tile && 'price' in tile ? tile.price : 0;
};
const spendReserve = (cash: number) => Math.max(100, Math.floor(cash * 0.22));

/** One decision at a time so dice animations, card reveals and logs remain observable. */
export function chooseAiAction(s: GameState): Action | null {
  const pending = s.pending;
  if (pending.type === 'ended' || pending.playerId !== AI_PLAYER_ID) return null;
  const p = me(s);
  const cash = p.cash;
  switch (pending.type) {
    case 'roll': {
      // Redeem mortgaged property only with a safe cash buffer, once per turn.
      // Main bot flow rolls immediately, preserving a snappy game.
      return { type: 'roll', playerId: p.id };
    }
    case 'jail':
      if (p.heldCards.some((c) => c.kind === 'jailFree'))
        return { type: 'useJailCard', playerId: p.id };
      return { type: 'roll', playerId: p.id };
    case 'jailRelease':
      return p.heldCards.some((c) => c.kind === 'jailFree')
        ? { type: 'useJailCard', playerId: p.id }
        : { type: 'payBail', playerId: p.id };
    case 'buy': {
      const cost = buyPrice(pending.tile);
      const canAfford = cash >= cost + spendReserve(cash);
      // Cheap lots or stations remain interesting if cash stays adequate.
      return { type: canAfford ? 'buy' : 'declineBuy', playerId: p.id };
    }
    case 'upgrade': {
      const t = BOARD[pending.tile]!;
      const cost =
        pending.mode === 'build'
          ? t.kind === 'property'
            ? t.upgradeCost
            : Infinity
          : redeemCost(buyPrice(pending.tile)) +
            (pending.mode === 'redeemBuild' && t.kind === 'property' ? t.upgradeCost : 0);
      return {
        type: cash >= cost + spendReserve(cash) ? 'upgrade' : 'skipUpgrade',
        playerId: p.id,
      };
    }
    case 'pay':
      if (cash >= pending.total) return { type: 'pay', playerId: p.id };
      if (pending.reason === 'upgrade') return { type: 'cancelUpgrade', playerId: p.id };
      // Sell/mortgage in legal order, never try to liquidate the pending upgrade tile.
      for (const i of owned(s)) {
        if (pending.upgradeTile === i) continue;
        const t = s.tiles[i]!;
        const op: ManageOp['op'] = t.level > 0 ? 'downgrade' : t.mortgaged ? 'sell' : 'mortgage';
        return { type: 'manage', playerId: p.id, ops: [{ op, tile: i }] };
      }
      return { type: 'timeout' };
    case 'cardDice':
      return {
        type: pending.dice === null ? 'rollCardDice' : 'confirmCardDice',
        playerId: p.id,
      };
    case 'metro':
      return { type: 'metro', playerId: p.id, destination: null };
    case 'chooseTile': {
      if (!pending.options.length) return { type: 'timeout' };
      const sorted = [...pending.options].sort((a, b) => {
        if (pending.purpose === 'gambleDown') return buyPrice(a) - buyPrice(b);
        return buyPrice(b) - buyPrice(a);
      });
      return { type: 'chooseTile', playerId: p.id, tile: sorted[0]! };
    }
  }
}
