import { BOARD, getTile, nearestAhead } from '../board';
import { CHANCE_CARDS, COMMUNITY_CARDS } from '../cards';
import { BOARD_SIZE, HOTEL_LEVEL } from '../constants';
import { redeemCost } from '../finance';
import type { Card, DeckKind } from '../types';
import {
  activeCount,
  activePlayers,
  addLog,
  cheapestProperty,
  expireTaxWaivers,
  hasCard,
  moveBack,
  moveForward,
  moveForwardTo,
  ownableTile,
  ownedProperties,
  othersInSeatOrder,
  sendToJail,
  stationRent,
  takeCard,
  utilityMultiplier,
} from './core';
import { rollDie, shuffle, type Rng } from './rng';
import type { CardDetail, Creditor, GameEvent, GameState, PlayerState, Step } from './types';

const ALL_CARDS: Record<DeckKind, readonly Card[]> = {
  chance: CHANCE_CARDS,
  community: COMMUNITY_CARDS,
};
const CARD_BY_ID = new Map([...CHANCE_CARDS, ...COMMUNITY_CARDS].map((c) => [c.id, c]));

export function getCard(id: string): Card {
  const c = CARD_BY_ID.get(id);
  if (!c) throw new Error(`Không có thẻ ${id}`);
  return c;
}

const bankPay = (
  p: PlayerState,
  amount: number,
  reason: 'tax' | 'card' | 'purchase',
  confirm: boolean,
  label?: string,
  grantTile?: number,
): Step => ({
  type: 'pay',
  playerId: p.id,
  creditors: [{ playerId: null, amount }],
  total: amount,
  reason,
  confirm,
  ...(label === undefined ? {} : { label }),
  ...(grantTile === undefined ? {} : { grantTile }),
});

interface LandOptions {
  /** Thẻ Đất gần nhất / Ga gần nhất: vô chủ thì bắt buộc mua, của người khác trả `multiplier` × 2 viên mới. */
  nearestMultiplier?: number;
}

/** Kết quả xử lý ô hoặc thẻ: các bước cần làm tiếp và tiền ròng thẻ tác động trực tiếp lên người rút. */
interface Outcome {
  steps: Step[];
  net: number;
}

/** Xử lý ô người chơi vừa dừng. */
export function land(s: GameState, p: PlayerState, rng: Rng, opts: LandOptions = {}): Outcome {
  const tile = getTile(p.position);
  switch (tile.kind) {
    case 'go':
    case 'parking':
      return { steps: [], net: 0 };
    case 'jail':
      return { steps: p.inJail ? [] : [{ type: 'metro', playerId: p.id }], net: 0 };
    case 'goToJail':
      sendToJail(s, p);
      return { steps: [], net: 0 };
    case 'tax':
      expireTaxWaivers(s);
      if (hasCard(p, 'taxWaiver')) {
        takeCard(s, p, 'taxWaiver');
        addLog(s, p.id, `Dùng quyền Người thủ đô, miễn ${tile.name}`);
        return { steps: [], net: 0 };
      }
      return { steps: [bankPay(p, tile.amount, 'tax', true, `Nộp ${tile.name}`)], net: 0 };
    case 'chance':
    case 'community':
      return drawCard(s, p, tile.kind, rng);
    default:
      return landOwnable(s, p, p.position, rng, opts);
  }
}

function landOwnable(
  s: GameState,
  p: PlayerState,
  index: number,
  rng: Rng,
  opts: LandOptions,
  ev?: Extract<GameEvent, { type: 'card' }>,
): Outcome {
  const tile = ownableTile(index);
  const t = s.tiles[index]!;
  const none: Outcome = { steps: [], net: 0 };

  if (t.owner === null) {
    if (opts.nearestMultiplier !== undefined) {
      addLog(s, p.id, `Bắt buộc mua ${tile.name}`);
      return {
        steps: [bankPay(p, tile.price, 'purchase', false, `Mua ${tile.name} (thẻ)`, index)],
        net: 0,
      };
    }
    // Luôn hỏi mua dù tiền mặt hiện tại chưa đủ. Nếu người chơi chọn mua,
    // engine sẽ cho họ vào luồng xử lý nợ/thanh lý tài sản để đủ tiền.
    return { steps: [{ type: 'buy', playerId: p.id, tile: index }], net: 0 };
  }

  if (t.owner === p.id) {
    if (tile.kind === 'property') {
      // Lượt vừa mua chưa được nâng; chuộc thì không phải nâng cấp nên vẫn được.
      const justBought = t.boughtTurn === s.turnNumber;
      if (t.mortgaged) {
        const redeem = redeemCost(tile.price);
        // Đủ tiền thì chuộc + xây 1 nhà; chỉ đủ tiền chuộc thì chuộc riêng.
        const mode =
          !justBought && p.cash >= redeem + tile.upgradeCost
            ? 'redeemBuild'
            : p.cash >= redeem
              ? 'redeem'
              : null;
        return mode
          ? { steps: [{ type: 'upgrade', playerId: p.id, tile: index, mode }], net: 0 }
          : none;
      }
      if (justBought) return none;
      return t.level < HOTEL_LEVEL
        ? { steps: [{ type: 'upgrade', playerId: p.id, tile: index, mode: 'build' }], net: 0 }
        : none;
    }
    return t.mortgaged && p.cash >= redeemCost(tile.price)
      ? { steps: [{ type: 'upgrade', playerId: p.id, tile: index, mode: 'redeem' }], net: 0 }
      : none;
  }

  if (t.mortgaged) {
    addLog(s, p.id, `${tile.name} đang cắm, không trả tiền`);
    return none;
  }
  const owner = t.owner;
  let amount: number;
  let net = 0;
  if (opts.nearestMultiplier !== undefined) {
    const d1 = rollDie(rng);
    const d2 = rollDie(rng);
    amount = (d1 + d2) * opts.nearestMultiplier;
    net = -amount;
    if (ev) ev.detail = { kind: 'dice', dice: [d1, d2] };
    addLog(s, p.id, `Gieo ${d1} + ${d2}, trả ${opts.nearestMultiplier} × ${d1 + d2}`);
  } else if (tile.kind === 'property') {
    if (hasCard(p, 'rentWaiver')) {
      takeCard(s, p, 'rentWaiver');
      addLog(s, p.id, `Dùng thẻ Miễn thuế nhà đất ở ${tile.name}`);
      return none;
    }
    amount = tile.rents[t.level]!;
  } else if (tile.kind === 'station') {
    amount = stationRent(s, owner);
  } else {
    let sum: number;
    if (s.arrivedByRoll && s.lastDice) {
      sum = s.lastDice[0] + s.lastDice[1];
    } else {
      const d1 = rollDie(rng);
      const d2 = rollDie(rng);
      sum = d1 + d2;
      addLog(s, p.id, `Gieo ${d1} + ${d2} để tính tiền ${tile.name}`);
    }
    amount = sum * utilityMultiplier(s, owner);
  }
  if (amount <= 0) return { steps: [], net };
  return {
    steps: [
      {
        type: 'pay',
        playerId: p.id,
        creditors: [{ playerId: owner, amount }],
        total: amount,
        reason: opts.nearestMultiplier !== undefined ? 'card' : 'rent',
        confirm: true,
        label: `${opts.nearestMultiplier !== undefined ? 'Trả' : 'Trả thuê'} ${tile.name}`,
      },
    ],
    net,
  };
}

function drawCard(s: GameState, p: PlayerState, deck: DeckKind, rng: Rng): Outcome {
  if (s.decks[deck].length === 0) {
    const held = new Set(s.players.flatMap((x) => x.heldCards.map((c) => c.cardId)));
    s.decks[deck] = shuffle(
      ALL_CARDS[deck].map((c) => c.id).filter((id) => !held.has(id)),
      rng,
    );
  }
  const card = getCard(s.decks[deck].shift()!);
  addLog(s, p.id, `Rút thẻ ${deck === 'chance' ? 'Cơ Hội' : 'Khí Vận'}: ${card.title}`);
  // Live sessions pause before any random effect. The actual effect is applied only
  // after the drawer rolls and explicitly confirms the server-generated dice.
  const e = card.effect;
  const needsDice =
    e.type === 'lottery' ||
    e.type === 'flyDice' ||
    e.type === 'neighborFire' ||
    e.type === 'swapProperty' ||
    (e.type === 'advanceToNearest' &&
      (() => {
        const target = nearestAhead(p.position, e.target).index;
        const owner = s.tiles[target]?.owner;
        return (
          owner !== null && owner !== undefined && owner !== p.id && !s.tiles[target]!.mortgaged
        );
      })());
  if (s.stagedDiceCards && needsDice) {
    return { steps: [{ type: 'cardDice', playerId: p.id, cardId: card.id, dice: null }], net: 0 };
  }
  const ev: Extract<GameEvent, { type: 'card' }> = {
    type: 'card',
    playerId: p.id,
    cardId: card.id,
  };
  s.events.push(ev);
  const out = applyCard(s, p, card, rng, ev);
  for (const step of out.steps) {
    if (step.type === 'pay' && step.label === undefined) step.label = `Thẻ ${card.title}`;
  }
  if (out.net !== 0) out.steps.push({ type: 'fortuneMirror', drawerId: p.id, net: out.net });
  return out;
}

/** Resolve a rolled card from its previously shown dice; never roll new card dice at confirmation. */
export function resolveCardDice(
  s: GameState,
  p: PlayerState,
  cardId: string,
  dice: number[],
  rng: Rng,
): Outcome {
  const card = getCard(cardId);
  let index = 0;
  const diceRng: Rng = {
    int(min, max) {
      if (min === 1 && max === 6 && index < dice.length) return dice[index++]!;
      return rng.int(min, max);
    },
  };
  const ev: Extract<GameEvent, { type: 'card' }> = {
    type: 'card',
    playerId: p.id,
    cardId,
  };
  s.events.push(ev);
  const out = applyCard(s, p, card, diceRng, ev);
  for (const step of out.steps) {
    if (step.type === 'pay' && step.label === undefined) step.label = `Thẻ ${card.title}`;
  }
  if (out.net !== 0) out.steps.push({ type: 'fortuneMirror', drawerId: p.id, net: out.net });
  return out;
}

function applyCard(
  s: GameState,
  p: PlayerState,
  card: Card,
  rng: Rng,
  ev: Extract<GameEvent, { type: 'card' }>,
): Outcome {
  const e = card.effect;
  const detail = (d: CardDetail) => {
    ev.detail = d;
  };
  const received = (amount: number): Outcome => {
    p.cash += amount;
    addLog(s, p.id, card.title, amount);
    return { steps: [], net: amount };
  };
  const arrive = () => {
    s.arrivedByRoll = false;
    return land(s, p, rng);
  };
  switch (e.type) {
    case 'moveTo':
      moveForwardTo(s, p, e.target, true);
      return { ...arrive(), net: 0 };
    case 'advanceToNearest': {
      const target = nearestAhead(p.position, e.target).index;
      moveForwardTo(s, p, target, e.collectGo);
      s.arrivedByRoll = false;
      return landOwnable(s, p, target, rng, { nearestMultiplier: e.diceMultiplier }, ev);
    }
    case 'moveBack':
      moveBack(s, p, e.steps);
      return { ...arrive(), net: 0 };
    case 'flyDice': {
      const dice = [rollDie(rng), rollDie(rng)];
      detail({ kind: 'dice', dice });
      for (const d of dice) {
        if (d % 2 === 0) moveForward(s, p, d, true);
        else moveBack(s, p, d);
      }
      addLog(s, p.id, `Tàu bay: ${dice.join(', ')}`);
      return { ...arrive(), net: 0 };
    }
    case 'goToJail':
      sendToJail(s, p);
      return { steps: [], net: 0 };
    case 'receive':
      return received(e.amount);
    case 'pay':
      return { steps: [bankPayCard(p, e.amount)], net: -e.amount };
    case 'collectFromEach': {
      const others = othersInSeatOrder(s, p.id);
      return {
        steps: others.map((o) => ({
          type: 'pay' as const,
          playerId: o.id,
          creditors: [{ playerId: p.id, amount: e.amount }],
          total: e.amount,
          reason: 'card' as const,
          confirm: false,
        })),
        net: e.amount * others.length,
      };
    }
    case 'payEach': {
      const others = othersInSeatOrder(s, p.id);
      if (others.length === 0) return { steps: [], net: 0 };
      const creditors = others.map((o) => ({ playerId: o.id, amount: e.amount }));
      return { steps: [cardPay(p, creditors)], net: -e.amount * others.length };
    }
    case 'buildingFee': {
      let total = 0;
      for (const i of ownedProperties(s, p.id)) {
        const level = s.tiles[i]!.level;
        if (level === HOTEL_LEVEL) total += e.perHotel;
        else total += level * e.perHouse;
      }
      if (total === 0) return { steps: [], net: 0 };
      const u = s.tiles[e.utilityIndex]!;
      const share =
        u.owner !== null && !u.mortgaged ? Math.floor((total * e.ownerPercent) / 100) : 0;
      // Người rút là chủ nhà máy thì phần 20% của mình không phải trả: chỉ nợ Ngân hàng phần còn lại.
      const creditors: Creditor[] = [{ playerId: null, amount: total - share }];
      if (share > 0 && u.owner !== p.id) creditors.unshift({ playerId: u.owner, amount: share });
      const owed = creditors.reduce((a, c) => a + c.amount, 0);
      return { steps: [cardPay(p, creditors)], net: -owed };
    }
    case 'payPerStation': {
      const amount = e.amounts[activeCount(s, p.id, 'station')] ?? 0;
      return amount > 0 ? { steps: [bankPayCard(p, amount)], net: -amount } : { steps: [], net: 0 };
    }
    case 'lottery': {
      const d = rollDie(rng) as 1 | 2 | 3 | 4 | 5 | 6;
      detail({ kind: 'dice', dice: [d] });
      addLog(s, p.id, `Xổ số ra ${d}`);
      return received(e.payouts[d]);
    }
    case 'cashBrackets': {
      const b = e.brackets.find((x) => x.maxCash === null || p.cash <= x.maxCash)!;
      return received(b.amount);
    }
    case 'helpThePoor': {
      const actives = activePlayers(s);
      const min = Math.min(...actives.map((x) => x.cash));
      const others = othersInSeatOrder(s, p.id);
      if (p.cash === min) {
        return {
          steps: others.map((o) => ({
            type: 'pay' as const,
            playerId: o.id,
            creditors: [{ playerId: p.id, amount: e.collectFromEach }],
            total: e.collectFromEach,
            reason: 'card' as const,
            confirm: false,
          })),
          net: e.collectFromEach * others.length,
        };
      }
      const poorest = others.filter((o) => o.cash === min);
      const each = Math.floor(e.payToPoorest / poorest.length);
      const creditors: Creditor[] = poorest.map((o) => ({ playerId: o.id, amount: each }));
      const rest = e.payToPoorest - each * poorest.length;
      if (rest > 0) creditors.push({ playerId: null, amount: rest });
      return { steps: [cardPay(p, creditors)], net: -e.payToPoorest };
    }
    case 'keep':
      p.heldCards.push({ cardId: card.id, kind: e.card });
      return { steps: [], net: 0 };
    case 'capitalCitizen':
      if (s.tiles[e.requiredTile]?.owner === p.id) {
        p.heldCards.push({ cardId: card.id, kind: 'taxWaiver' });
      } else {
        addLog(s, p.id, 'Không sở hữu Phố Cổ, thẻ không có tác dụng');
      }
      return { steps: [], net: 0 };
    case 'buildingGamble': {
      const actives = activePlayers(s);
      const counts = actives.map((x) => ownedProperties(s, x.id).length);
      const average = counts.reduce((a, b) => a + b, 0) / actives.length;
      const mine = ownedProperties(s, p.id).length;
      detail({ kind: 'gamble', mine, average });
      if (mine === average) return { steps: [], net: 0 };
      const up = mine < average;
      const options = ownedProperties(s, p.id).filter((i) => {
        const t = s.tiles[i]!;
        return up ? !t.mortgaged && t.level < HOTEL_LEVEL : t.level >= 1;
      });
      if (options.length === 0) {
        addLog(s, p.id, 'Không có đất hợp lệ, không đổi');
        return { steps: [], net: 0 };
      }
      return {
        steps: [
          { type: 'chooseTile', playerId: p.id, purpose: up ? 'gambleUp' : 'gambleDown', options },
        ],
        net: 0,
      };
    }
    case 'neighborFire': {
      let total = 0;
      const rolls: { playerId: string; dice: [number, number] }[] = [];
      for (const x of [p, ...othersInSeatOrder(s, p.id)]) {
        const d1 = rollDie(rng);
        const d2 = rollDie(rng);
        total += d1 + d2;
        rolls.push({ playerId: x.id, dice: [d1, d2] });
        addLog(s, x.id, `Gieo ${d1} + ${d2}`);
      }
      const target = (p.position + total) % BOARD_SIZE;
      const t = s.tiles[target];
      const hit = BOARD[target]!.kind === 'property' && !!t && t.level >= 1;
      detail({ kind: 'fire', rolls, total, target, hit });
      if (hit && t) {
        t.level -= 1;
        addLog(s, p.id, `Cháy ${BOARD[target]!.name}: hạ 1 cấp`);
      } else {
        addLog(s, p.id, `Đếm ${total} ô tới ${BOARD[target]!.name}: không có tác dụng`);
      }
      return { steps: [], net: 0 };
    }
    case 'bankRestructure': {
      const actives = activePlayers(s);
      const average = Math.floor(actives.reduce((a, x) => a + x.cash, 0) / actives.length);
      detail({
        kind: 'restructure',
        cash: actives.map((x) => ({ playerId: x.id, cash: x.cash })),
        average,
        before: p.cash,
      });
      const delta = average - p.cash;
      p.cash = average;
      addLog(s, p.id, 'Ngân hàng tái cơ cấu', delta);
      return { steps: [], net: delta };
    }
    case 'highway':
      return {
        steps: [
          {
            type: 'chooseTile',
            playerId: p.id,
            purpose: 'highway',
            options: BOARD.filter((t) => t.kind === 'property').map((t) => t.index),
          },
        ],
        net: 0,
      };
    case 'swapProperty': {
      const opponents = othersInSeatOrder(s, p.id);
      if (opponents.length === 0) return { steps: [], net: 0 };
      const die1 = [rollDie(rng)];
      while (die1.at(-1)! > opponents.length) die1.push(rollDie(rng));
      const d1 = die1.at(-1)!;
      const opp = opponents[d1 - 1]!;
      const d2 = rollDie(rng);
      const mine = cheapestProperty(s, p.id);
      let theirs: number | null;
      if (d2 % 2 === 0) {
        theirs = cheapestProperty(s, opp.id);
      } else {
        theirs = null;
        for (let k = 1; k <= BOARD_SIZE; k++) {
          const i = (p.position + k) % BOARD_SIZE;
          const kind = BOARD[i]!.kind;
          if ((kind === 'station' || kind === 'utility') && s.tiles[i]!.owner === opp.id) {
            theirs = i;
            break;
          }
        }
      }
      addLog(s, p.id, `Thằng Bờm: viên 1 ra ${d1} (${opp.name}), viên 2 ra ${d2}`);
      detail({ kind: 'swap', opponentId: opp.id, die1, die2: d2, mine, theirs });
      if (mine === null || theirs === null) {
        return {
          steps: [
            {
              type: 'pay',
              playerId: opp.id,
              creditors: [{ playerId: p.id, amount: e.penalty }],
              total: e.penalty,
              reason: 'swapPenalty',
              confirm: false,
              label: 'Phạt Thằng Bờm',
            },
          ],
          net: e.penalty,
        };
      }
      s.tiles[mine]!.owner = opp.id;
      s.tiles[theirs]!.owner = p.id;
      // Đổi chủ không phải mua đất trong lượt này: không giữ cờ mua của chủ cũ.
      // Trạng thái cắm và cấp nhà vẫn chuyển theo tài sản; chủ mới có quyền chuộc.
      s.tiles[mine]!.boughtTurn = null;
      s.tiles[theirs]!.boughtTurn = null;
      addLog(s, p.id, `Đổi ${BOARD[mine]!.name} lấy ${BOARD[theirs]!.name}`);
      expireTaxWaivers(s);
      return { steps: [], net: 0 };
    }
  }
}

const cardPay = (p: PlayerState, creditors: Creditor[]): Step => ({
  type: 'pay',
  playerId: p.id,
  creditors,
  total: creditors.reduce((a, c) => a + c.amount, 0),
  reason: 'card',
  confirm: false,
});

const bankPayCard = (p: PlayerState, amount: number): Step => bankPay(p, amount, 'card', false);
