import { describe, expect, it } from 'vitest';
import { applyAction, createGame, seededRng, type GameState, type Rng } from '@cotiphu/shared';
import { cueOf } from '../src/audio/eventSounds';

// Âm thanh theo thao tác: tiền rơi khi mua / xây, câu nói khi vào đất người khác, ô thuế, vào tù.

/** Đổ ra đúng hai mặt `a`, `b` rồi dùng nguồn có hạt giống. */
function dice(a: number, b: number): Rng {
  const queue = [a, b];
  const base = seededRng(5);
  return { int: (min, max) => queue.shift() ?? base.int(min, max) };
}

/** Ván 2 người, người đang tới lượt đứng ở Xuất phát, sẵn sàng đổ. */
function ready(): { s: GameState; me: string; other: string } {
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
  s.pending = { type: 'roll', playerId: me };
  return { s, me, other };
}

function roll(s: GameState, me: string, a: number, b: number): GameState {
  const r = applyAction(s, { type: 'roll', playerId: me }, dice(a, b));
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('âm thanh theo thao tác', () => {
  it('vào đất người khác: "Ôi thôi chết" sau khi quân chạy xong 3 ô', () => {
    const { s, me, other } = ready();
    s.tiles[3] = { owner: other, level: 0, mortgaged: false };
    const after = roll(s, me, 1, 2);
    expect(after.pending).toMatchObject({ type: 'pay', reason: 'rent' });
    expect(cueOf(after, s)).toEqual({ coins: false, line: 'rent', delay: 3000 + 200 + 3 * 200 });
  });

  it('vào ô thuế: "Là nó"', () => {
    const { s, me } = ready();
    const after = roll(s, me, 1, 3);
    expect(after.pending).toMatchObject({ type: 'pay', reason: 'tax' });
    expect(cueOf(after, s).line).toBe('tax');
  });

  it('mua đất: tiếng tiền rơi, không nói gì', () => {
    const { s, me } = ready();
    const landed = roll(s, me, 1, 2);
    expect(landed.pending.type).toBe('buy');
    expect(cueOf(landed, s)).toMatchObject({ coins: false, line: null });
    let next = applyAction(landed, { type: 'buy', playerId: me }, seededRng(2));
    if (!next.ok) throw new Error(next.error);
    let state = next.state;
    let before = landed;
    // Mua có thể qua bước trả tiền.
    if (state.pending.type === 'pay') {
      before = state;
      next = applyAction(state, { type: 'pay', playerId: me }, seededRng(2));
      if (!next.ok) throw new Error(next.error);
      state = next.state;
    }
    expect(state.tiles[3]!.owner).toBe(me);
    expect(cueOf(state, before).coins).toBe(true);
  });

  it('vào ô Vào Tù: "Vào tù là rõ"', () => {
    const { s, me } = ready();
    const p = s.players.find((x) => x.id === me)!;
    p.position = 24;
    const after = roll(s, me, 2, 4);
    expect(after.players.find((x) => x.id === me)!.inJail).toBe(true);
    expect(cueOf(after, s).line).toBe('jail');
  });

  it('không có trạng thái trước thì im lặng', () => {
    const { s } = ready();
    expect(cueOf(s, null)).toEqual({ coins: false, line: null, delay: 0 });
  });
});
