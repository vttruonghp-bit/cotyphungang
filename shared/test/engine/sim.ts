import {
  BOARD,
  CHANCE_CARDS,
  COMMUNITY_CARDS,
  HOTEL_LEVEL,
  JAIL_BAIL,
  JAIL_INDEX,
  applyAction,
  createGame,
  isGameOver,
  seededRng,
  type Action,
  type GameState,
  type ManageOp,
  type Rng,
} from '../../src';
import { PLAYERS } from './players';

const MAX_ACTIONS = 5000;

function check(ok: boolean, message: string) {
  if (!ok) throw new Error(message);
}

/** Kiểm tra các bất biến của trạng thái ván; sai thì báo lỗi. */
export function checkInvariants(s: GameState) {
  for (const p of s.players) {
    check(p.cash >= 0, `${p.id} âm tiền: ${p.cash}`);
    check(Number.isInteger(p.cash), `${p.id} tiền lẻ: ${p.cash}`);
    check(Number.isInteger(p.position) && p.position >= 0 && p.position < 40, `${p.id} sai vị trí`);
    check(!p.inJail || p.position === JAIL_INDEX, `${p.id} ở tù mà không ở ô 10`);
  }
  s.tiles.forEach((t, i) => {
    const tile = BOARD[i]!;
    if (!t) return;
    const maxLevel = tile.kind === 'property' ? HOTEL_LEVEL : 0;
    check(t.level >= 0 && t.level <= maxLevel, `ô ${i} sai cấp ${t.level}`);
    check(!t.mortgaged || t.level === 0, `ô ${i} cắm mà còn nhà`);
    if (t.owner === null) {
      check(t.level === 0 && !t.mortgaged, `ô ${i} vô chủ mà còn nhà hoặc đang cắm`);
    } else {
      check(
        s.players.some((p) => p.id === t.owner),
        `ô ${i} có chủ lạ`,
      );
    }
  });
  // Mỗi thẻ chỉ nằm tối đa ở một chỗ: trong chồng hoặc trong tay một người.
  const seen = [
    ...s.decks.chance,
    ...s.decks.community,
    ...s.players.flatMap((p) => p.heldCards.map((c) => c.cardId)),
  ];
  check(new Set(seen).size === seen.length, 'thẻ bị trùng');
  const allIds = new Set([...CHANCE_CARDS, ...COMMUNITY_CARDS].map((c) => c.id));
  for (const id of seen) check(allIds.has(id), `thẻ lạ ${id}`);
  check(s.log.length <= 100, 'nhật ký quá dài');
  const pd = s.pending;
  if (pd.type !== 'ended') {
    const p = s.players.find((x) => x.id === pd.playerId);
    check(p?.status === 'active', 'chờ người không còn chơi');
    check(s.players[s.current]!.status === 'active', 'người giữ lượt không còn chơi');
  } else {
    check(s.loserId !== null && s.queue.length === 0, 'ván kết thúc sai');
  }
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** Một người chơi ngẫu nhiên nhưng chỉ gửi thao tác hợp lệ. */
export function chooseAction(s: GameState, rng: Rng): Action {
  const pd = s.pending;
  if (pd.type === 'ended') throw new Error('Ván đã kết thúc');
  const id = pd.playerId;
  const me = s.players.find((p) => p.id === id)!;
  const mine = s.tiles.flatMap((t, i) => (t?.owner === id ? [i] : []));
  // Thỉnh thoảng để hết giờ cho máy chủ tự xử lý.
  if (rng.int(1, 20) === 1) return { type: 'timeout' };
  switch (pd.type) {
    case 'roll':
    case 'jail': {
      if (!s.rolled && mine.length > 0 && rng.int(1, 6) === 1) {
        const i = pick(rng, mine);
        const t = s.tiles[i]!;
        const op: ManageOp['op'] = t.mortgaged
          ? rng.int(0, 1)
            ? 'redeem'
            : 'sell'
          : t.level > 0
            ? 'downgrade'
            : pick(rng, ['mortgage', 'sell'] as const);
        if (op !== 'redeem' || me.cash >= Math.floor((ownablePrice(i) * 55) / 100)) {
          return { type: 'manage', playerId: id, ops: [{ op, tile: i }] };
        }
      }
      if (pd.type === 'jail') {
        const options: Action[] = [{ type: 'roll', playerId: id }];
        if (me.cash >= JAIL_BAIL) options.push({ type: 'payBail', playerId: id });
        if (me.heldCards.some((c) => c.kind === 'jailFree')) {
          options.push({ type: 'useJailCard', playerId: id });
        }
        return pick(rng, options);
      }
      return { type: 'roll', playerId: id };
    }
    case 'jailRelease': {
      const hasJailCard = me.heldCards.some((c) => c.kind === 'jailFree');
      if (!hasJailCard) return { type: 'payBail', playerId: id };
      return rng.int(0, 1)
        ? { type: 'payBail', playerId: id }
        : { type: 'useJailCard', playerId: id };
    }
    case 'buy':
      return { type: rng.int(1, 10) <= 8 ? 'buy' : 'declineBuy', playerId: id };
    case 'upgrade':
      return { type: rng.int(1, 10) <= 8 ? 'upgrade' : 'skipUpgrade', playerId: id };
    case 'metro':
      return {
        type: 'metro',
        playerId: id,
        destination:
          rng.int(0, 2) === 0
            ? null
            : pick(
                rng,
                [...Array(40).keys()].filter((i) => i !== 10),
              ),
      };
    case 'chooseTile':
      return { type: 'chooseTile', playerId: id, tile: pick(rng, pd.options) };
    case 'pay': {
      if (me.cash >= pd.total) return { type: 'pay', playerId: id };
      // Đang nợ: tự thanh lý một bước ngẫu nhiên hợp lệ, hoặc để máy chủ làm.
      const ops: ManageOp[] = mine.flatMap((i): ManageOp[] => {
        if (pd.reason === 'upgrade' && pd.upgradeTile === i) return [];
        const t = s.tiles[i]!;
        if (t.level > 0) return [{ op: 'downgrade', tile: i }];
        return t.mortgaged
          ? [{ op: 'sell', tile: i }]
          : [
              { op: 'mortgage', tile: i },
              { op: 'sell', tile: i },
            ];
      });
      if (ops.length === 0 || rng.int(1, 4) === 1) return { type: 'timeout' };
      return { type: 'manage', playerId: id, ops: [pick(rng, ops)] };
    }
  }
}

function ownablePrice(i: number): number {
  const t = BOARD[i]!;
  return 'price' in t ? t.price : 0;
}

export function simulate(seed: number, maxActions = MAX_ACTIONS) {
  const rng = seededRng(seed);
  const n = 2 + (seed % 5);
  let s = createGame(PLAYERS.slice(0, n), rng, false);
  checkInvariants(s);
  let actions = 0;
  while (!isGameOver(s) && actions < maxActions) {
    const action = chooseAction(s, rng);
    const r = applyAction(s, action, rng);
    if (!r.ok) {
      throw new Error(
        `Hạt ${seed}, thao tác ${actions}: ${JSON.stringify(action)} bị từ chối (${r.error}); đang chờ ${JSON.stringify(s.pending)}`,
      );
    }
    s = r.state;
    checkInvariants(s);
    actions++;
  }
  return { s, actions, n };
}
