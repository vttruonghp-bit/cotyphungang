import { describe, expect, it } from 'vitest';
import {
  applyAction,
  chooseBotAction,
  createGame,
  isGameOver,
  scriptedRng,
  seededRng,
  waitingOn,
  type Action,
  type GameState,
  type Rng,
} from '../../src';
import { PLAYERS } from './players';
import { checkInvariants, chooseAction } from './sim';

// Trước ván: mỗi người tự bấm đổ 2 xúc xắc, điểm cao đi trước; bằng điểm thì những người đó đổ lại.

const ordering = (n: number) => createGame(PLAYERS.slice(0, n), seededRng(1), true, true);

function act(s: GameState, a: Action, rng: Rng): GameState {
  const r = applyAction(s, a, rng);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const roll = (s: GameState, id: string, a: number, b: number) =>
  act(s, { type: 'orderRoll', playerId: id }, scriptedRng([a, b]));

function error(s: GameState, a: Action, rng: Rng = seededRng(2)): string {
  const r = applyAction(s, a, rng);
  if (r.ok) throw new Error('đáng lẽ bị từ chối');
  return r.error;
}

describe('đổ xúc xắc chọn thứ tự trước ván', () => {
  it('ván mới chờ mọi người đổ, chưa ai có lượt', () => {
    const s = ordering(3);
    expect(s.pending).toEqual({ type: 'order', rolls: {} });
    expect(waitingOn(s)).toEqual(['a', 'b', 'c']);
    expect(s.log).toEqual([]);
  });

  it('điểm cao đi trước, xếp cả thứ tự đi theo điểm', () => {
    let s = ordering(3);
    s = roll(s, 'b', 2, 3);
    expect(s.events).toEqual([{ type: 'orderRoll', playerId: 'b', dice: [2, 3] }]);
    expect(waitingOn(s)).toEqual(['a', 'c']);
    s = roll(s, 'c', 6, 5);
    s = roll(s, 'a', 4, 4);
    expect(s.players.map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(s.current).toBe(0);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'c' });
    expect(s.events.at(-1)).toMatchObject({ type: 'order', order: ['c', 'a', 'b'] });
    expect(s.log.at(-1)!.text).toBe('Thứ tự: Chi 11 → An 8 → Bình 5');
    checkInvariants(s);
  });

  it('bằng điểm thì chỉ những người bằng nhau đổ lại', () => {
    let s = ordering(3);
    s = roll(s, 'a', 3, 4);
    s = roll(s, 'b', 5, 2);
    // An và Bình cùng 7: chờ cả hai đổ lại, Chi vẫn phải đổ lần đầu.
    expect(waitingOn(s)).toEqual(['a', 'b', 'c']);
    s = roll(s, 'c', 6, 6);
    expect(waitingOn(s)).toEqual(['a', 'b']);
    s = roll(s, 'b', 1, 2);
    // Bình đã có lần đổ lại; An chưa, nên chỉ còn chờ An.
    expect(waitingOn(s)).toEqual(['a']);
    expect(error(s, { type: 'orderRoll', playerId: 'b' })).toBe('Bạn đã đổ xong, chờ người khác');
    s = roll(s, 'a', 2, 2);
    expect(s.players.map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(s.log.at(-1)!.text).toBe('Thứ tự: Chi 12 → An 7/4 → Bình 7/3');
  });

  it('đổ lại vẫn bằng thì đổ thêm lần nữa', () => {
    let s = ordering(2);
    s = roll(s, 'a', 3, 3);
    s = roll(s, 'b', 4, 2);
    s = roll(s, 'a', 1, 1);
    s = roll(s, 'b', 1, 1);
    expect(s.pending.type).toBe('order');
    expect(waitingOn(s)).toEqual(['a', 'b']);
    s = roll(s, 'a', 2, 3);
    s = roll(s, 'b', 2, 2);
    expect(s.players.map((p) => p.id)).toEqual(['a', 'b']);
    expect(s.log.at(-1)!.text).toBe('Thứ tự: An 6/2/5 → Bình 6/2/4');
  });

  it('người lạ, người đã đổ xong, hay đầu hàng lúc chọn thứ tự đều bị từ chối', () => {
    let s = ordering(2);
    expect(error(s, { type: 'orderRoll', playerId: 'z' })).toBeTruthy();
    s = roll(s, 'a', 6, 6);
    expect(error(s, { type: 'orderRoll', playerId: 'a' })).toBe('Bạn đã đổ xong, chờ người khác');
    expect(error(s, { type: 'surrender', playerId: 'b' })).toBe('Chờ đổ xong thứ tự đã');
    expect(error(s, { type: 'roll', playerId: 'a' })).toBeTruthy();
  });

  it('hết giờ: máy chủ đổ hộ mọi người còn thiếu cho tới khi đủ thứ tự', () => {
    let s = ordering(4);
    s = roll(s, 'c', 1, 2);
    s = act(s, { type: 'timeout' }, seededRng(9));
    expect(s.pending.type).toBe('roll');
    expect(s.players.map((p) => p.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(s.events.filter((e) => e.type === 'orderRoll').length).toBeGreaterThanOrEqual(3);
    checkInvariants(s);
  });

  it('bot đổ phần mình, đổ xong thì chờ', () => {
    let s = ordering(2);
    expect(chooseBotAction(s, 'a')).toEqual({ type: 'orderRoll', playerId: 'a' });
    s = roll(s, 'a', 2, 2);
    expect(chooseBotAction(s, 'a')).toBeNull();
    expect(chooseBotAction(s, 'b')).toEqual({ type: 'orderRoll', playerId: 'b' });
  });

  it('chơi ngẫu nhiên từ lúc chọn thứ tự tới hết ván không bị kẹt', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seededRng(seed);
      let s = createGame(PLAYERS.slice(0, 2 + (seed % 5)), rng, true, true);
      let steps = 0;
      while (!isGameOver(s) && steps < 3000) {
        s = act(s, chooseAction(s, rng), rng);
        checkInvariants(s);
        steps += 1;
      }
      expect(s.pending.type, `seed ${seed}`).not.toBe('order');
    }
  });
});
