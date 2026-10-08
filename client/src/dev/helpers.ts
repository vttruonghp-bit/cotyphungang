/** Hàm dựng tình huống cho `?scenario=` (chỉ dùng khi phát triển). */
import {
  applyAction,
  createGame,
  scriptedRng,
  seededRng,
  type Action,
  type GameState,
  type Rng,
} from '@cotiphu/shared';
import { DEFAULT_PLAYERS } from '../theme';

const players = (n: number) =>
  DEFAULT_PLAYERS.slice(0, n).map((p, i) => ({ id: `p${i + 1}`, ...p }));

/** Ván mới n người, người 1 (Linh) đi trước. */
export function fresh(n = 6): GameState {
  const s = createGame(players(n), seededRng(1));
  s.current = 0;
  s.pending = { type: 'roll', playerId: 'p1' };
  return s;
}

export function act(s: GameState, action: Action, rng: Rng): GameState {
  const r = applyAction(s, action, rng);
  if (!r.ok) throw new Error(`${JSON.stringify(action)}: ${r.error}`);
  return r.state;
}

/** Đổ xúc xắc kịch bản cho người đang được chờ. */
export const roll = (s: GameState, ...dice: number[]) =>
  act(s, { type: 'roll', playerId: who(s) }, scriptedRng(dice));

export const who = (s: GameState) => ('playerId' in s.pending ? s.pending.playerId : 'p1');

/** Tự chơi đơn giản `steps` thao tác để có bàn cờ, tiền và nhật ký giống giữa ván. */
export function autoplay(s: GameState, steps: number, seed: number): GameState {
  const rng = seededRng(seed);
  for (let k = 0; k < steps && s.pending.type !== 'ended'; k++) {
    const pd = s.pending;
    const id = who(s);
    const me = s.players.find((p) => p.id === id)!;
    let a: Action;
    switch (pd.type) {
      case 'roll':
      case 'jail':
        a = { type: 'roll', playerId: id };
        break;
      case 'jailRelease':
        a = { type: 'useJailCard', playerId: id };
        break;
      case 'buy':
        a = { type: 'buy', playerId: id };
        break;
      case 'upgrade':
        a = { type: 'upgrade', playerId: id };
        break;
      case 'metro':
        a = { type: 'metro', playerId: id, destination: null };
        break;
      case 'pay':
        a = me.cash >= pd.total ? { type: 'pay', playerId: id } : { type: 'timeout' };
        break;
      case 'cardDice':
        a = { type: pd.dice === null ? 'rollCardDice' : 'confirmCardDice', playerId: id };
        break;
      case 'chooseTile':
        a = { type: 'chooseTile', playerId: id, tile: pd.options[0]! };
        break;
    }
    s = act(s, a, rng);
  }
  return s;
}

/** Bàn giữa ván: 6 người, nhiều đất, có nhà, khách sạn, đất cắm, nhật ký đầy. */
export function mid(): GameState {
  let s = autoplay(fresh(6), 150, 7);
  // Dừng ở đầu lượt của một người còn đủ tiền để màn chính dễ nhìn.
  for (let k = 0; k < 40 && s.pending.type !== 'roll'; k++) s = autoplay(s, 1, 100 + k);
  return s;
}

/** Đặt người đang chờ đứng ở `from` để lần đổ kế tiếp tới đúng ô cần xem. */
export function at(s: GameState, from: number, cash?: number): GameState {
  const p = s.players.find((x) => x.id === who(s))!;
  p.position = from;
  p.inJail = false;
  if (cash !== undefined) p.cash = cash;
  return s;
}

export function own(
  s: GameState,
  owner: string | null,
  tile: number,
  level = 0,
  mortgaged = false,
) {
  Object.assign(s.tiles[tile]!, { owner, level, mortgaged, boughtTurn: null });
  return s;
}

export function top(s: GameState, cardId: string) {
  const deck = cardId.startsWith('chance-') ? 'chance' : 'community';
  s.decks[deck] = [cardId, ...s.decks[deck].filter((c) => c !== cardId)];
  return s;
}

/** Bàn mẫu có sẵn chủ đất, dùng cho các tình huống cụ thể (giống hình mẫu). */
export function sample(): GameState {
  const s = fresh(6);
  own(s, 'p2', 24, 2);
  own(s, 'p2', 34, 5);
  own(s, 'p2', 1);
  own(s, 'p1', 16, 2);
  own(s, 'p1', 21, 0, true);
  own(s, 'p1', 12, 0, true);
  own(s, 'p1', 5);
  own(s, 'p1', 3);
  own(s, 'p1', 26, 5);
  own(s, 'p3', 9, 3);
  own(s, 'p3', 15);
  own(s, 'p4', 39, 1);
  own(s, 'p5', 14, 3);
  own(s, 'p6', 28);
  const cash = [480, 220, 360, 270, 400, 310];
  s.players.forEach((p, i) => (p.cash = cash[i]!));
  return s;
}
