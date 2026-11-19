import { BOARD } from './board';
import { redeemCost } from './finance';
import type { Action, GameState, ManageOp } from './engine/types';

/**
 * Người máy (bot): mỗi lần chọn một thao tác cho `playerId`, theo đúng luật như người thật.
 * Không ngẫu nhiên để dễ đoán và dễ kiểm tra. Trả null khi ván không chờ người này.
 */
export function chooseBotAction(s: GameState, playerId: string): Action | null {
  const pending = s.pending;
  if (pending.type === 'ended' || pending.playerId !== playerId) return null;
  const p = s.players.find((x) => x.id === playerId);
  if (!p) return null;
  const cash = p.cash;
  const owned = s.tiles.flatMap((t, i) => (t?.owner === playerId ? [i] : []));
  switch (pending.type) {
    case 'roll':
      return { type: 'roll', playerId };
    case 'jail':
      if (p.heldCards.some((c) => c.kind === 'jailFree')) return { type: 'useJailCard', playerId };
      return { type: 'roll', playerId };
    case 'jailRelease':
      return p.heldCards.some((c) => c.kind === 'jailFree')
        ? { type: 'useJailCard', playerId }
        : { type: 'payBail', playerId };
    case 'buy': {
      const cost = buyPrice(pending.tile);
      // Mua khi mua xong vẫn còn một khoản dự phòng.
      return { type: cash >= cost + reserve(cash) ? 'buy' : 'declineBuy', playerId };
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
      return { type: cash >= cost + reserve(cash) ? 'upgrade' : 'skipUpgrade', playerId };
    }
    case 'pay':
      if (cash >= pending.total) return { type: 'pay', playerId };
      if (pending.reason === 'upgrade') return { type: 'cancelUpgrade', playerId };
      // Thiếu tiền: bán nhà, cầm đất, bán đất lần lượt (không đụng ô đang nâng cấp dở).
      for (const i of owned) {
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
      return { type: pending.dice === null ? 'rollCardDice' : 'confirmCardDice', playerId };
    case 'metro':
      return { type: 'metro', playerId, destination: null };
    case 'chooseTile': {
      if (!pending.options.length) return { type: 'timeout' };
      const sorted = [...pending.options].sort((a, b) =>
        pending.purpose === 'gambleDown' ? buyPrice(a) - buyPrice(b) : buyPrice(b) - buyPrice(a),
      );
      return { type: 'chooseTile', playerId, tile: sorted[0]! };
    }
  }
}

function buyPrice(i: number): number {
  const tile = BOARD[i];
  return tile && 'price' in tile ? tile.price : 0;
}

const reserve = (cash: number) => Math.max(100, Math.floor(cash * 0.22));
