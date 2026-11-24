import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  seededRng,
  type Action,
  type GameState,
  type Rng,
} from '@cotiphu/shared';
import { fireworksDelay, lostMoney } from '../src/game/effects';

// Pháo hoa khi được tiền từ ô Xuất phát / thẻ, tiếng khóc khi bị trừ tiền (không tính thuế, tự mua).

function dice(a: number, b: number): Rng {
  const queue = [a, b];
  const base = seededRng(5);
  return { int: (min, max) => queue.shift() ?? base.int(min, max) };
}

/** Ván 2 người, người tới lượt đứng ở ô `from`, sẵn sàng đổ. */
function ready(from = 0): { s: GameState; me: string; other: string } {
  const s = createGame(
    [
      { id: 'a', name: 'An', color: 0, icon: 0 },
      { id: 'b', name: 'Bình', color: 1, icon: 1 },
    ],
    seededRng(1),
  );
  const me = s.players[s.current]!.id;
  const other = s.players.find((p) => p.id !== me)!.id;
  for (const p of s.players) p.position = 0;
  s.players.find((p) => p.id === me)!.position = from;
  s.pending = { type: 'roll', playerId: me };
  return { s, me, other };
}

function act(s: GameState, action: Action, rng: Rng = seededRng(2)): GameState {
  const r = applyAction(s, action, rng);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('pháo hoa', () => {
  it('qua ô Xuất phát: bắn lúc quân bước vào ô 00', () => {
    const { s, me } = ready(37);
    const after = act(s, { type: 'roll', playerId: me }, dice(1, 3));
    expect(after.players.find((p) => p.id === me)!.position).toBe(1);
    expect(fireworksDelay(s, after)).toBe(3000 + 200 + 3 * 200);
  });

  it('lá Khí vận cho tiền: bắn ngay khi áp dụng', () => {
    const { s, me } = ready(0);
    s.decks.community = [
      'community-god-of-wealth',
      ...s.decks.community.filter((c) => c !== 'community-god-of-wealth'),
    ];
    const landed = act(s, { type: 'roll', playerId: me }, dice(1, 1));
    expect(landed.pending).toMatchObject({ type: 'drawCard', playerId: me });
    expect(fireworksDelay(s, landed)).toBeNull();
    const applied = act(landed, { type: 'drawCard', playerId: me });
    expect(fireworksDelay(landed, applied)).toBe(0);
  });

  it('đi bình thường, không qua ô Xuất phát: không bắn', () => {
    const { s, me } = ready(0);
    const after = act(s, { type: 'roll', playerId: me }, dice(1, 2));
    expect(fireworksDelay(s, after)).toBeNull();
    expect(fireworksDelay(null, after)).toBeNull();
  });
});

describe('tiếng khóc khi bị trừ tiền', () => {
  it('trả tiền thuê cho người khác: khóc', () => {
    const { s, me, other } = ready(0);
    s.tiles[3] = { owner: other, level: 0, mortgaged: false, boughtTurn: null };
    const landed = act(s, { type: 'roll', playerId: me }, dice(1, 2));
    expect(landed.pending).toMatchObject({ type: 'pay', reason: 'rent' });
    expect(lostMoney(s, landed)).toBe(false);
    const paid = act(landed, { type: 'pay', playerId: me });
    expect(lostMoney(landed, paid)).toBe(true);
  });

  it('nộp thuế: không khóc', () => {
    const { s, me } = ready(0);
    const landed = act(s, { type: 'roll', playerId: me }, dice(1, 3));
    expect(landed.pending).toMatchObject({ type: 'pay', reason: 'tax' });
    const paid = act(landed, { type: 'pay', playerId: me });
    expect(paid.players.find((p) => p.id === me)!.cash).toBeLessThan(500);
    expect(lostMoney(landed, paid)).toBe(false);
  });

  it('tự mua đất: không khóc', () => {
    const { s, me } = ready(0);
    const landed = act(s, { type: 'roll', playerId: me }, dice(1, 2));
    let before = landed;
    let state = act(landed, { type: 'buy', playerId: me });
    expect(lostMoney(before, state)).toBe(false);
    if (state.pending.type === 'pay') {
      before = state;
      state = act(state, { type: 'pay', playerId: me });
      expect(lostMoney(before, state)).toBe(false);
    }
    expect(state.tiles[3]!.owner).toBe(me);
  });
});
