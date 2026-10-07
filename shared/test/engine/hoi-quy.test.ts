import { describe, expect, it } from 'vitest';
import type { GameState } from '../../src';
import { act, cash, newGame, own, player, reject, roll, setPlayer, topCard } from './helpers';

/** `a` đang ở tù, đã thử trượt 2 lần, giữ thẻ ra tù; ván chờ `a` ở đầu lượt trong tù. */
function aTrongTuLan3(cashA: number): GameState {
  const s = newGame(2);
  setPlayer(s, 'a', {
    cash: cashA,
    position: 10,
    inJail: true,
    jailAttempts: 2,
    heldCards: [{ cardId: 'community-jail-free', kind: 'jailFree' }],
  });
  s.decks.community = s.decks.community.filter((c) => c !== 'community-jail-free');
  s.pending = { type: 'jail', playerId: 'a' };
  return s;
}

describe('các lỗi đã sửa ở Bước 1', () => {
  it('Trả tiền điện khi người rút là chủ Nhà Máy Điện: chỉ nợ Ngân hàng phần 80%', () => {
    const s0 = own(own(setPlayer(newGame(), 'a', { cash: 90 }), 'a', 12), 'a', 1, { level: 5 });
    topCard(s0, 'chance-electricity');
    const s = roll(s0, 3, 4);
    // Phí 100Đ (1 khách sạn), 20Đ là phần của chính mình: trả 80Đ, không phải vào Xử lý nợ.
    expect(cash(s, 'a')).toBe(10);
    expect(s.tiles[12]!.mortgaged).toBe(false);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('lần thử thứ 3 trượt, có thẻ mà thiếu 50Đ: vẫn được chọn thẻ để ra tù', () => {
    const s = roll(aTrongTuLan3(40), 1, 2);
    expect(s.pending).toEqual({ type: 'jailRelease', playerId: 'a', steps: 3 });
    const s2 = act(s, { type: 'useJailCard', playerId: 'a' });
    expect(player(s2, 'a')).toMatchObject({ inJail: false, position: 13, cash: 40 });
  });

  it('đang chọn trả 50Đ hay dùng thẻ ra tù thì không đầu hàng được', () => {
    const s = roll(aTrongTuLan3(100), 1, 2);
    reject(s, { type: 'surrender', playerId: 'a' });
    reject(s, { type: 'surrender', playerId: 'b' });
  });

  it('Ụp/Mở: bản nháp chỉ cần tiền sau toàn bộ thao tác không âm', () => {
    const s0 = own(
      own(setPlayer(newGame(), 'a', { cash: 0 }), 'a', 1, { mortgaged: true }),
      'a',
      39,
    );
    const s = act(s0, {
      type: 'manage',
      playerId: 'a',
      ops: [
        { op: 'redeem', tile: 1 },
        { op: 'mortgage', tile: 39 },
      ],
    });
    expect(cash(s, 'a')).toBe(200 - 33);
    expect(s.tiles[1]!.mortgaged).toBe(false);
    expect(s.tiles[39]!.mortgaged).toBe(true);
    reject(s0, { type: 'manage', playerId: 'a', ops: [{ op: 'redeem', tile: 1 }] });
  });

  it('Ụp/Mở: cắm rồi chuộc cùng một ô trong một bản nháp bị từ chối (phải dùng nút + để hoàn lại)', () => {
    const s0 = own(newGame(), 'a', 1);
    reject(s0, {
      type: 'manage',
      playerId: 'a',
      ops: [
        { op: 'mortgage', tile: 1 },
        { op: 'redeem', tile: 1 },
      ],
    });
  });

  it('Ụp/Mở: thao tác lạ bị từ chối', () => {
    const s0 = own(newGame(), 'a', 1);
    const ops = [{ op: 'build', tile: 1 }] as unknown as [{ op: 'sell'; tile: number }];
    reject(s0, { type: 'manage', playerId: 'a', ops });
  });

  it('thẻ đang giữ dùng xong khi chồng đã rút hết: không thành lá duy nhất trong chồng', () => {
    const s0 = aTrongTuLan3(100);
    s0.decks.community = [];
    const s = act(s0, { type: 'useJailCard', playerId: 'a' });
    // Lần rút sau sẽ xáo lại toàn bộ thẻ không ai giữ, gồm cả thẻ ra tù này.
    expect(s.decks.community).toEqual([]);
    expect(player(s, 'a').heldCards).toEqual([]);
  });

  it('đất màu của mình đang cắm, chỉ đủ tiền chuộc: được chuộc riêng (Wins chốt câu 1: B)', () => {
    const s0 = own(setPlayer(newGame(), 'a', { cash: 40 }), 'a', 3, { mortgaged: true });
    const s1 = roll(s0, 1, 2);
    expect(s1.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 3, mode: 'redeem' });
    const s = act(s1, { type: 'upgrade', playerId: 'a' });
    expect(cash(s, 'a')).toBe(40 - 33);
    expect(s.tiles[3]).toMatchObject({ owner: 'a', level: 0, mortgaged: false });
  });

  it('đủ tiền chuộc + xây thì vẫn là chuộc + xây 1 nhà', () => {
    const s0 = own(setPlayer(newGame(), 'a', { cash: 83 }), 'a', 3, { mortgaged: true });
    expect(roll(s0, 1, 2).pending).toMatchObject({ mode: 'redeemBuild' });
  });
});
