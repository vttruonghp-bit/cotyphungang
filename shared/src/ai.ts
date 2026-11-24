/**
 * Bot chọn nước đi cho một người chơi bất kỳ: dùng cho đối thủ máy khi chơi một mình, và để
 * máy chủ chơi hộ ghế vắng mặt quá lâu trong ván online. Chỉ đọc ván và trả về một nước;
 * mọi nước vẫn đi qua bộ luật như thao tác của người thật.
 */
import { BOARD } from './board';
import { redeemCost } from './finance';
import { waitingOn } from './engine/order';
import type { Action, GameState, ManageOp } from './engine/types';

const owned = (s: GameState, playerId: string) =>
  s.tiles.flatMap((t, i) => (t?.owner === playerId ? [i] : []));
const buyPrice = (i: number) => {
  const tile = BOARD[i];
  return tile && 'price' in tile ? tile.price : 0;
};
const spendReserve = (cash: number) => Math.max(100, Math.floor(cash * 0.22));

/**
 * Một nước mỗi lần gọi, để xúc xắc, thẻ và nhật ký vẫn xem được.
 * null khi ván không chờ `playerId` (hoặc người này không còn trong ván).
 */
export function chooseBotAction(s: GameState, playerId: string): Action | null {
  const pending = s.pending;
  if (pending.type === 'order') {
    // Chọn thứ tự trước ván: đổ phần mình nếu còn phải đổ.
    return waitingOn(s).includes(playerId) ? { type: 'orderRoll', playerId } : null;
  }
  if (pending.type === 'ended' || pending.playerId !== playerId) return null;
  const p = s.players.find((x) => x.id === playerId);
  if (!p || p.status !== 'active') return null;
  const cash = p.cash;
  switch (pending.type) {
    case 'roll': {
      // Redeem mortgaged property only with a safe cash buffer, once per turn.
      // Main bot flow rolls immediately, preserving a snappy game.
      return { type: 'roll', playerId };
    }
    case 'jail':
      if (p.heldCards.some((c) => c.kind === 'jailFree')) return { type: 'useJailCard', playerId };
      return { type: 'roll', playerId };
    case 'jailRelease':
      return p.heldCards.some((c) => c.kind === 'jailFree')
        ? { type: 'useJailCard', playerId }
        : { type: 'payBail', playerId };
    case 'buy': {
      const cost = buyPrice(pending.tile);
      const canAfford = cash >= cost + spendReserve(cash);
      // Cheap lots or stations remain interesting if cash stays adequate.
      return { type: canAfford ? 'buy' : 'declineBuy', playerId };
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
        playerId,
      };
    }
    case 'pay':
      if (cash >= pending.total) return { type: 'pay', playerId };
      if (pending.reason === 'upgrade') return { type: 'cancelUpgrade', playerId };
      // Sell/mortgage in legal order, never try to liquidate the pending upgrade tile.
      for (const i of owned(s, playerId)) {
        if (pending.upgradeTile === i) continue;
        const t = s.tiles[i]!;
        const op: ManageOp['op'] = t.level > 0 ? 'downgrade' : t.mortgaged ? 'sell' : 'mortgage';
        return { type: 'manage', playerId, ops: [{ op, tile: i }] };
      }
      return { type: 'timeout' };
    case 'endTurn':
      return { type: 'endTurn', playerId };
    case 'drawCard':
      return { type: 'drawCard', playerId };
    case 'cardDice':
      return {
        type: pending.dice === null ? 'rollCardDice' : 'confirmCardDice',
        playerId,
      };
    case 'metro':
      return { type: 'metro', playerId, destination: null };
    case 'chooseTile': {
      if (!pending.options.length) return { type: 'timeout' };
      const sorted = [...pending.options].sort((a, b) => {
        if (pending.purpose === 'gambleDown') return buyPrice(a) - buyPrice(b);
        return buyPrice(b) - buyPrice(a);
      });
      return { type: 'chooseTile', playerId, tile: sorted[0]! };
    }
  }
}
