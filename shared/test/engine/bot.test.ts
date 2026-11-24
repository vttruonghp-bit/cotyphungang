import { describe, expect, it } from 'vitest';
import { applyAction, chooseBotAction, createGame, isGameOver, seededRng } from '../../src';
import { checkInvariants } from './sim';
import { PLAYERS } from './players';

describe('bot tự chơi', () => {
  it('ván toàn bot: mọi thao tác bot chọn đều đúng luật, ván chạy tới hết', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rng = seededRng(seed);
      const players = PLAYERS.slice(0, 2 + (seed % 5));
      let s = createGame(players, rng);
      let steps = 0;
      while (!isGameOver(s) && steps < 6000) {
        if (s.pending.type === 'ended') break;
        const action = chooseBotAction(s, s.pending.playerId);
        expect(action, `seed ${seed}: không có thao tác cho ${s.pending.type}`).not.toBeNull();
        const r = applyAction(s, action!, rng);
        if (!r.ok) throw new Error(`seed ${seed}, ${s.pending.type}: ${r.error}`);
        s = r.state;
        checkInvariants(s);
        steps += 1;
      }
      expect(steps, `seed ${seed}`).toBeGreaterThan(20);
    }
  });

  it('không chọn thao tác cho người khác hay khi ván đã xong', () => {
    const s = createGame(PLAYERS.slice(0, 2), seededRng(3));
    const pending = s.pending;
    if (pending.type === 'ended') throw new Error('ván không thể xong ngay');
    const other = s.players.find((p) => p.id !== pending.playerId)!;
    expect(chooseBotAction(s, other.id)).toBeNull();
    expect(chooseBotAction(s, 'không-có')).toBeNull();
  });
});
