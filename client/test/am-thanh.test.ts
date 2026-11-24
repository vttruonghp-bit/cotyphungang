import { describe, expect, it } from 'vitest';
import { applyAction, createGame, seededRng, type GameState, type Rng } from '@cotiphu/shared';
import { boughtOrBuilt, endTurnKey } from '../src/audio/cues';

// Tiếng tiền rơi khi mua đất / xây nhà và câu nhắc "Kết thúc đi ạ" khi lượt chờ bấm Kết thúc.

/** Đổ ra đúng hai mặt `a`, `b` rồi dùng nguồn có hạt giống. */
function dice(a: number, b: number): Rng {
  const queue = [a, b];
  const base = seededRng(5);
  return { int: (min, max) => queue.shift() ?? base.int(min, max) };
}

/** Ván 2 người, người đang tới lượt đứng ở Xuất phát, sẵn sàng đổ. */
function ready(): { s: GameState; me: string } {
  const s = createGame(
    [
      { id: 'a', name: 'An', color: 0, icon: 0 },
      { id: 'b', name: 'Bình', color: 1, icon: 1 },
    ],
    seededRng(1),
  );
  const me = s.players[s.current]!.id;
  for (const p of s.players) p.position = 0;
  s.pending = { type: 'roll', playerId: me };
  return { s, me };
}

function act(s: GameState, action: Parameters<typeof applyAction>[1], rng: Rng = seededRng(2)) {
  const r = applyAction(s, action, rng);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('âm thanh theo thao tác', () => {
  it('mua đất: tiếng tiền rơi; chỉ đi tới ô thì chưa', () => {
    const { s, me } = ready();
    const landed = act(s, { type: 'roll', playerId: me }, dice(1, 2));
    expect(landed.pending.type).toBe('buy');
    expect(boughtOrBuilt(s, landed)).toBe(false);
    let before = landed;
    let state = act(landed, { type: 'buy', playerId: me });
    if (state.pending.type === 'pay') {
      before = state;
      state = act(state, { type: 'pay', playerId: me });
    }
    expect(state.tiles[3]!.owner).toBe(me);
    expect(boughtOrBuilt(before, state)).toBe(true);
  });

  it('xây thêm nhà trên đất của mình: tiếng tiền rơi', () => {
    const { s, me } = ready();
    const built = structuredClone(s);
    s.tiles[3] = { owner: me, level: 0, mortgaged: false, boughtTurn: null };
    built.tiles[3] = { owner: me, level: 1, mortgaged: false, boughtTurn: null };
    expect(boughtOrBuilt(s, built)).toBe(true);
    expect(boughtOrBuilt(built, built)).toBe(false);
    expect(boughtOrBuilt(null, built)).toBe(false);
  });

  it('nhắc "Kết thúc đi ạ" đúng một lần cho mỗi lượt chờ bấm Kết thúc', () => {
    const { s, me } = ready();
    expect(endTurnKey(s)).toBeNull();
    const landed = act(s, { type: 'roll', playerId: me }, dice(1, 2));
    const declined = act(landed, { type: 'declineBuy', playerId: me });
    expect(declined.pending).toMatchObject({ type: 'endTurn', playerId: me });
    const key = endTurnKey(declined);
    expect(key).toBe(`${declined.turnNumber}:${me}`);
    const next = act(declined, { type: 'endTurn', playerId: me });
    expect(endTurnKey(next)).toBeNull();
  });
});
