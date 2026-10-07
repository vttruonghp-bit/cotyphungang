import { describe, expect, it } from 'vitest';
import type { GameState, KeepableCard, ManageOp } from '../../src';
import {
  act,
  cash,
  newGame,
  own,
  player,
  reject,
  roll,
  setPlayer,
  topCard,
  totalCash,
  who,
} from './helpers';

// Thẻ Khí Vận, docs/luat-choi.md mục 9 (và mục 10 cho các khoản nợ ngoài lượt).
// Ô Khí Vận: 02, 17, 33. Giá trị mong đợi lấy từ tài liệu luật, không lấy từ mã engine.

// ---------------------------------------------------------------------------
// Tiện ích riêng cho file này
// ---------------------------------------------------------------------------

/** 22 đất màu theo bảng mục 2 (chép tay từ tài liệu). */
const DAT_MAU = [1, 3, 6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24, 26, 27, 29, 31, 32, 34, 37, 39];

/** 21 thẻ Khí Vận (mục 9). */
const THE_KHI_VAN = [
  'community-birthday',
  'community-wrong-transfer',
  'community-god-of-wealth',
  'community-singing',
  'community-go',
  'community-turnaround',
  'community-inheritance',
  'community-found-money',
  'community-naive',
  'community-help-the-poor',
  'community-water',
  'community-dog-bite',
  'community-jail-free',
  'community-burglar',
  'community-election',
  'community-fortune-mirror',
  'community-flood',
  'community-jail',
  'community-bank-restructure',
  'community-highway',
  'community-swap',
];

/**
 * Người đang chờ đổ đứng ở `from`, thẻ `cardId` nằm trên cùng, đổ d1 + d2.
 * Mặc định: từ ô 14 đổ 1 + 2 tới ô Khí Vận 17 (không đôi, không qua ô 00).
 * `extra` là các số ngẫu nhiên thẻ cần thêm (xúc xắc của thẻ).
 */
function rut(
  s: GameState,
  cardId: string,
  extra: number[] = [],
  from = 14,
  d1 = 1,
  d2 = 2,
): GameState {
  setPlayer(s, who(s), { position: from });
  topCard(s, cardId);
  return roll(s, d1, d2, ...extra);
}

/** Lượt nhanh của người đang chờ đổ: đứng ở ô 15, đổ 2 + 3 tới Bãi Đỗ Xe (20), hết lượt. */
function luotNhanh(s: GameState): GameState {
  expect(s.pending.type).toBe('roll');
  setPlayer(s, who(s), { position: 15 });
  return roll(s, 2, 3);
}

/** Cho người chơi giữ một thẻ (rút khỏi chồng). Sửa trực tiếp `s`. */
function giuThe(s: GameState, id: string, cardId: string, kind: KeepableCard): GameState {
  player(s, id).heldCards.push({ cardId, kind });
  const deck = cardId.startsWith('chance-') ? 'chance' : 'community';
  s.decks[deck] = s.decks[deck].filter((c) => c !== cardId);
  return s;
}

const giuGuong = (s: GameState, id: string) =>
  giuThe(s, id, 'community-fortune-mirror', 'fortuneMirror');

const coThe = (s: GameState, id: string, kind: KeepableCard) =>
  player(s, id).heldCards.some((c) => c.kind === kind);

const chon = (s: GameState, id: string, tile: number, dice: number[]) =>
  act(s, { type: 'chooseTile', playerId: id, tile }, dice);

const tra = (s: GameState, id: string) => act(s, { type: 'pay', playerId: id });

const quanLy = (s: GameState, id: string, ops: ManageOp[]) =>
  act(s, { type: 'manage', playerId: id, ops });

const chu = (s: GameState, tile: number) => s.tiles[tile]!.owner;

// ---------------------------------------------------------------------------
// Thẻ nhận / trả số tiền cố định
// ---------------------------------------------------------------------------

describe('Khí Vận: thẻ nhận tiền cố định (mục 9, thẻ 03, 04, 07, 08, 17)', () => {
  it.each([
    ['community-god-of-wealth', 100],
    ['community-singing', 30],
    ['community-inheritance', 100],
    ['community-found-money', 200],
    ['community-flood', 50],
  ])('%s: nhận %iĐ từ Ngân hàng, người khác không đổi, hết lượt', (card, amount) => {
    let s = newGame(2);
    s = rut(s, card);
    expect(player(s, 'a').position).toBe(17);
    expect(cash(s, 'a')).toBe(500 + amount);
    expect(cash(s, 'b')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('rút được ở cả ô 02 (đổ đôi 1 + 1 từ ô 00): nhận tiền rồi vẫn được đổ thêm', () => {
    let s = newGame(2);
    s = rut(s, 'community-singing', [], 0, 1, 1);
    expect(player(s, 'a').position).toBe(2);
    expect(cash(s, 'a')).toBe(530);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('rút ở ô 33', () => {
    let s = newGame(2);
    s = rut(s, 'community-flood', [], 29, 1, 3);
    expect(player(s, 'a').position).toBe(33);
    expect(cash(s, 'a')).toBe(550);
  });

  it('đi qua ô 00 tới ô 02 rồi rút thẻ nhận tiền: được cả 200Đ và tiền thẻ', () => {
    let s = newGame(2);
    s = rut(s, 'community-god-of-wealth', [], 38, 1, 3);
    expect(player(s, 'a').position).toBe(2);
    expect(cash(s, 'a')).toBe(500 + 200 + 100);
  });
});

describe('Khí Vận: thẻ trả tiền cố định cho Ngân hàng (mục 9, thẻ 02, 09, 12, 14)', () => {
  it.each([
    ['community-wrong-transfer', 100],
    ['community-naive', 50],
    ['community-dog-bite', 20],
    ['community-burglar', 30],
  ])('%s: trả %iĐ cho Ngân hàng, đủ tiền thì tự trả', (card, amount) => {
    let s = newGame(2);
    s = rut(s, card);
    expect(cash(s, 'a')).toBe(500 - amount);
    expect(cash(s, 'b')).toBe(500);
    expect(totalCash(s)).toBe(1000 - amount);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it.each([
    ['community-wrong-transfer', 100],
    ['community-naive', 50],
    ['community-dog-bite', 20],
    ['community-burglar', 30],
  ])('%s: tiền mặt đúng bằng %iĐ thì trả hết, còn 0Đ, không phá sản', (card, amount) => {
    let s = newGame(2);
    setPlayer(s, 'a', { cash: amount });
    s = rut(s, card);
    expect(cash(s, 'a')).toBe(0);
    expect(player(s, 'a').status).toBe('active');
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('thiếu tiền nhưng thanh lý được: vào Xử lý nợ, cắm đất rồi trả (mục 10)', () => {
    let s = newGame(2);
    setPlayer(s, 'a', { cash: 60 });
    own(s, 'a', 39);
    s = rut(s, 'community-wrong-transfer');
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      total: 100,
      creditors: [{ playerId: null, amount: 100 }],
    });
    expect(cash(s, 'a')).toBe(60);
    // Chưa đủ tiền thì không trả được
    reject(s, { type: 'pay', playerId: 'a' });
    s = quanLy(s, 'a', [{ op: 'mortgage', tile: 39 }]);
    expect(cash(s, 'a')).toBe(260);
    s = tra(s, 'a');
    expect(cash(s, 'a')).toBe(160);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('tiền mặt + giá trị thanh lý tối đa đúng bằng khoản nợ: chưa phá sản, bán rồi trả', () => {
    let s = newGame(2);
    // 67 + bán Phố Cổ 33 = 100
    setPlayer(s, 'a', { cash: 67 });
    own(s, 'a', 1);
    s = rut(s, 'community-wrong-transfer');
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 100 });
    s = quanLy(s, 'a', [{ op: 'sell', tile: 1 }]);
    expect(cash(s, 'a')).toBe(100);
    s = tra(s, 'a');
    expect(cash(s, 'a')).toBe(0);
    expect(player(s, 'a').status).toBe('active');
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('hết giờ Xử lý nợ của người rút: máy chủ cắm ô rẻ nhất rồi tự trả (mục 11)', () => {
    let s = newGame(2);
    setPlayer(s, 'a', { cash: 0 });
    own(s, 'a', 9);
    own(s, 'a', 39);
    s = rut(s, 'community-naive');
    s = act(s, { type: 'timeout' });
    expect(s.tiles[9]!.mortgaged).toBe(true);
    expect(s.tiles[39]!.mortgaged).toBe(false);
    expect(cash(s, 'a')).toBe(10);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('tiền mặt + thanh lý vẫn thiếu: phá sản ngay, ván kết thúc', () => {
    let s = newGame(2);
    // 66 + bán Phố Cổ 33 = 99 < 100
    setPlayer(s, 'a', { cash: 66 });
    own(s, 'a', 1);
    s = rut(s, 'community-wrong-transfer');
    expect(s.pending).toEqual({ type: 'ended' });
    expect(s.loserId).toBe('a');
    expect(player(s, 'a').status).toBe('bankrupt');
    expect(cash(s, 'b')).toBe(500);
  });

  it('thiếu tiền khi đổ đôi: trả xong nợ vẫn được đổ thêm', () => {
    let s = newGame(2);
    setPlayer(s, 'a', { cash: 10 });
    own(s, 'a', 39);
    s = rut(s, 'community-naive', [], 15, 1, 1);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 50 });
    s = quanLy(s, 'a', [{ op: 'mortgage', tile: 39 }]);
    s = tra(s, 'a');
    expect(cash(s, 'a')).toBe(160);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });
});

// ---------------------------------------------------------------------------
// Về điểm xuất phát
// ---------------------------------------------------------------------------

describe('Khí Vận: Về điểm xuất phát (mục 9, thẻ 05)', () => {
  it('từ ô 17: đến ô 00, nhận 200Đ', () => {
    let s = newGame(2);
    s = rut(s, 'community-go');
    expect(player(s, 'a').position).toBe(0);
    expect(cash(s, 'a')).toBe(700);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('từ ô 33: nhận đúng 200Đ một lần', () => {
    let s = newGame(2);
    s = rut(s, 'community-go', [], 29, 1, 3);
    expect(player(s, 'a').position).toBe(0);
    expect(cash(s, 'a')).toBe(700);
  });

  it('vừa qua ô 00 bằng xúc xắc tới ô 02 rồi rút thẻ: nhận 200Đ hai lần', () => {
    let s = newGame(2);
    s = rut(s, 'community-go', [], 38, 1, 3);
    expect(player(s, 'a').position).toBe(0);
    expect(cash(s, 'a')).toBe(900);
  });
});

// ---------------------------------------------------------------------------
// Lật ngược tình thế
// ---------------------------------------------------------------------------

describe('Khí Vận: Lật ngược tình thế (mục 9, thẻ 06)', () => {
  it.each([
    [0, 400],
    [1, 400],
    [99, 400],
    [100, 50],
    [250, 50],
    [499, 50],
    [500, 10],
    [501, 10],
    [2000, 10],
  ])('tiền mặt %iĐ: nhận %iĐ', (start, bonus) => {
    let s = newGame(2);
    setPlayer(s, 'a', { cash: start });
    s = rut(s, 'community-turnaround');
    expect(cash(s, 'a')).toBe(start + bonus);
    expect(cash(s, 'b')).toBe(500);
  });

  it('tiền mặt tính sau khi nhận 200Đ qua ô 00: 299 + 200 = 499 → nhận 50Đ', () => {
    let s = newGame(2);
    setPlayer(s, 'a', { cash: 299 });
    s = rut(s, 'community-turnaround', [], 38, 1, 3);
    expect(cash(s, 'a')).toBe(549);
  });

  it('tiền mặt sau 200Đ qua ô 00: 300 + 200 = 500 → nhận 10Đ', () => {
    let s = newGame(2);
    setPlayer(s, 'a', { cash: 300 });
    s = rut(s, 'community-turnaround', [], 38, 1, 3);
    expect(cash(s, 'a')).toBe(510);
  });
});

// ---------------------------------------------------------------------------
// Mừng sinh nhật (và mục 10: nhiều người cùng nợ ngoài lượt)
// ---------------------------------------------------------------------------

describe('Khí Vận: Mừng sinh nhật (mục 9, thẻ 01; mục 10)', () => {
  it('2 người: nhận 10Đ từ người kia', () => {
    let s = newGame(2);
    s = rut(s, 'community-birthday');
    expect(cash(s, 'a')).toBe(510);
    expect(cash(s, 'b')).toBe(490);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('4 người: nhận 10Đ từ mỗi người, tổng tiền không đổi', () => {
    let s = newGame(4);
    s = rut(s, 'community-birthday');
    expect(cash(s, 'a')).toBe(530);
    for (const id of ['b', 'c', 'd']) expect(cash(s, id)).toBe(490);
    expect(totalCash(s)).toBe(2000);
  });

  it('người trả có đúng 10Đ: tự trả, còn 0Đ', () => {
    let s = newGame(3);
    setPlayer(s, 'b', { cash: 10 });
    s = rut(s, 'community-birthday');
    expect(cash(s, 'b')).toBe(0);
    expect(player(s, 'b').status).toBe('active');
    expect(cash(s, 'a')).toBe(520);
  });

  it('người thiếu tiền nhưng thanh lý được: Xử lý nợ riêng, người sau chưa trả', () => {
    let s = newGame(3);
    setPlayer(s, 'b', { cash: 5 });
    own(s, 'b', 1);
    s = rut(s, 'community-birthday');
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'b',
      total: 10,
      creditors: [{ playerId: 'a', amount: 10 }],
    });
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'c')).toBe(500);
    s = quanLy(s, 'b', [{ op: 'mortgage', tile: 1 }]);
    expect(cash(s, 'b')).toBe(35);
    s = tra(s, 'b');
    expect(cash(s, 'b')).toBe(25);
    expect(cash(s, 'c')).toBe(490);
    expect(cash(s, 'a')).toBe(520);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('xử lý theo vòng ghế bắt đầu từ người ngồi sau người rút (c rút: d, a, b)', () => {
    let s = newGame(4);
    s = luotNhanh(s); // a
    s = luotNhanh(s); // b
    expect(who(s)).toBe('c');
    // a thiếu tiền: d đã trả, a đang Xử lý nợ, b chưa trả
    setPlayer(s, 'a', { cash: 0 });
    own(s, 'a', 39);
    s = rut(s, 'community-birthday');
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 10 });
    expect(cash(s, 'd')).toBe(490);
    expect(cash(s, 'b')).toBe(500);
    expect(cash(s, 'c')).toBe(510);
    s = quanLy(s, 'a', [{ op: 'mortgage', tile: 39 }]);
    s = tra(s, 'a');
    expect(cash(s, 'a')).toBe(190);
    expect(cash(s, 'b')).toBe(490);
    expect(cash(s, 'c')).toBe(530);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'd' });
  });

  it('người đầu tiên không trả nổi: phá sản, ván kết thúc, khoản đã trả giữ nguyên', () => {
    let s = newGame(4);
    setPlayer(s, 'c', { cash: 5 });
    s = rut(s, 'community-birthday');
    expect(s.pending).toEqual({ type: 'ended' });
    expect(s.loserId).toBe('c');
    expect(player(s, 'c').status).toBe('bankrupt');
    expect(cash(s, 'a')).toBe(510);
    expect(cash(s, 'b')).toBe(490);
    expect(cash(s, 'd')).toBe(500);
    expect(player(s, 'd').status).toBe('active');
  });

  it('tiền mặt + thanh lý đúng bằng 10Đ: chưa phá sản (7 + bán đất cắm 3)', () => {
    let s = newGame(2);
    setPlayer(s, 'b', { cash: 7 });
    own(s, 'b', 1, { mortgaged: true });
    s = rut(s, 'community-birthday');
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'b', total: 10 });
    s = quanLy(s, 'b', [{ op: 'sell', tile: 1 }]);
    s = tra(s, 'b');
    expect(cash(s, 'b')).toBe(0);
    expect(chu(s, 1)).toBeNull();
    expect(cash(s, 'a')).toBe(510);
  });

  it('đang chờ người nợ ngoài lượt: người rút không đổ và không Ụp/Mở được', () => {
    let s = newGame(3);
    setPlayer(s, 'b', { cash: 5 });
    own(s, 'b', 1);
    own(s, 'a', 3);
    s = rut(s, 'community-birthday');
    expect(who(s)).toBe('b');
    reject(s, { type: 'roll', playerId: 'a' });
    reject(s, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 3 }] });
    reject(s, { type: 'pay', playerId: 'c' });
  });

  it('hết giờ Xử lý nợ ngoài lượt: máy chủ cắm ô rẻ nhất rồi tự trả (mục 11)', () => {
    let s = newGame(3);
    setPlayer(s, 'b', { cash: 5 });
    own(s, 'b', 1);
    own(s, 'b', 6);
    s = rut(s, 'community-birthday');
    s = act(s, { type: 'timeout' });
    expect(s.tiles[1]!.mortgaged).toBe(true);
    expect(s.tiles[6]!.mortgaged).toBe(false);
    expect(cash(s, 'b')).toBe(25);
    expect(cash(s, 'c')).toBe(490);
    expect(cash(s, 'a')).toBe(520);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('đổ đôi tới Khí Vận: mọi người trả xong, người rút đổ tiếp', () => {
    let s = newGame(3);
    s = rut(s, 'community-birthday', [], 15, 1, 1);
    expect(cash(s, 'a')).toBe(520);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('người đang Xử lý nợ ngoài lượt không đầu hàng được', () => {
    let s = newGame(3);
    setPlayer(s, 'b', { cash: 5 });
    own(s, 'b', 1);
    s = rut(s, 'community-birthday');
    expect(who(s)).toBe('b');
    reject(s, { type: 'surrender', playerId: 'b' });
  });

  it('đang có người Xử lý nợ ngoài lượt: người thứ ba không đầu hàng được (thao tác khác bị khóa)', () => {
    let s = newGame(3);
    setPlayer(s, 'b', { cash: 5 });
    own(s, 'b', 1);
    s = rut(s, 'community-birthday');
    expect(who(s)).toBe('b');
    reject(s, { type: 'surrender', playerId: 'c' });
  });

  it('đang có người Xử lý nợ ngoài lượt: người rút (chủ nợ) không đầu hàng được', () => {
    let s = newGame(3);
    setPlayer(s, 'b', { cash: 5 });
    own(s, 'b', 1);
    s = rut(s, 'community-birthday');
    expect(who(s)).toBe('b');
    reject(s, { type: 'surrender', playerId: 'a' });
  });

  it('người nợ ngoài lượt: chỉ được hạ cấp, cắm, bán; không chuộc; chưa đủ thì không trả được', () => {
    let s = newGame(3);
    setPlayer(s, 'b', { cash: 0 });
    own(s, 'b', 6, { level: 1 });
    own(s, 'b', 3, { mortgaged: true });
    s = rut(s, 'community-birthday');
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'b', total: 10 });
    reject(s, { type: 'pay', playerId: 'b' });
    reject(s, { type: 'manage', playerId: 'b', ops: [{ op: 'redeem', tile: 3 }] });
    s = quanLy(s, 'b', [{ op: 'downgrade', tile: 6 }]);
    expect(cash(s, 'b')).toBe(25);
    expect(s.tiles[6]!.level).toBe(0);
    s = tra(s, 'b');
    expect(cash(s, 'b')).toBe(15);
    expect(cash(s, 'a')).toBe(520);
  });

  it('6 người: nhận 50Đ', () => {
    let s = newGame(6);
    s = rut(s, 'community-birthday');
    expect(cash(s, 'a')).toBe(550);
    for (const id of ['b', 'c', 'd', 'e', 'f']) expect(cash(s, id)).toBe(490);
  });
});

// ---------------------------------------------------------------------------
// Ủng hộ người nghèo
// ---------------------------------------------------------------------------

describe('Khí Vận: Ủng hộ người nghèo (mục 9, thẻ 10)', () => {
  it('người rút ít tiền nhất: nhận 20Đ từ mỗi người', () => {
    let s = newGame(3);
    setPlayer(s, 'a', { cash: 100 });
    setPlayer(s, 'c', { cash: 300 });
    s = rut(s, 'community-help-the-poor');
    expect(cash(s, 'a')).toBe(140);
    expect(cash(s, 'b')).toBe(480);
    expect(cash(s, 'c')).toBe(280);
  });

  it('người rút đồng hạng ít tiền nhất: vẫn nhận 20Đ từ mỗi người (kể cả người đồng hạng)', () => {
    let s = newGame(3);
    setPlayer(s, 'a', { cash: 300 });
    setPlayer(s, 'b', { cash: 300 });
    s = rut(s, 'community-help-the-poor');
    expect(cash(s, 'a')).toBe(340);
    expect(cash(s, 'b')).toBe(280);
    expect(cash(s, 'c')).toBe(480);
  });

  it('mọi người bằng tiền nhau: người rút cũng là ít nhất, nhận 20Đ từ mỗi người', () => {
    let s = newGame(4);
    s = rut(s, 'community-help-the-poor');
    expect(cash(s, 'a')).toBe(560);
    for (const id of ['b', 'c', 'd']) expect(cash(s, id)).toBe(480);
  });

  it('không ít tiền nhất: trả 50Đ cho người ít tiền nhất', () => {
    let s = newGame(3);
    setPlayer(s, 'b', { cash: 200 });
    setPlayer(s, 'c', { cash: 300 });
    s = rut(s, 'community-help-the-poor');
    expect(cash(s, 'a')).toBe(450);
    expect(cash(s, 'b')).toBe(250);
    expect(cash(s, 'c')).toBe(300);
  });

  it('hơn người nghèo nhất đúng 1Đ: vẫn phải trả 50Đ', () => {
    let s = newGame(2);
    setPlayer(s, 'a', { cash: 101 });
    setPlayer(s, 'b', { cash: 100 });
    s = rut(s, 'community-help-the-poor');
    expect(cash(s, 'a')).toBe(51);
    expect(cash(s, 'b')).toBe(150);
  });

  it('2 người đồng hạng ít nhất: mỗi người 25Đ', () => {
    let s = newGame(3);
    setPlayer(s, 'b', { cash: 100 });
    setPlayer(s, 'c', { cash: 100 });
    s = rut(s, 'community-help-the-poor');
    expect(cash(s, 'a')).toBe(450);
    expect(cash(s, 'b')).toBe(125);
    expect(cash(s, 'c')).toBe(125);
  });

  it('3 người đồng hạng: mỗi người 16Đ, phần lẻ 2Đ trả Ngân hàng', () => {
    let s = newGame(4);
    for (const id of ['b', 'c', 'd']) setPlayer(s, id, { cash: 100 });
    s = rut(s, 'community-help-the-poor');
    expect(cash(s, 'a')).toBe(450);
    for (const id of ['b', 'c', 'd']) expect(cash(s, id)).toBe(116);
    expect(totalCash(s)).toBe(800 - 2);
  });

  it('4 người đồng hạng: mỗi người 12Đ, phần lẻ 2Đ trả Ngân hàng', () => {
    let s = newGame(5);
    for (const id of ['b', 'c', 'd', 'e']) setPlayer(s, id, { cash: 100 });
    s = rut(s, 'community-help-the-poor');
    expect(cash(s, 'a')).toBe(450);
    for (const id of ['b', 'c', 'd', 'e']) expect(cash(s, id)).toBe(112);
  });

  it('5 người đồng hạng: mỗi người 10Đ, không có phần lẻ', () => {
    let s = newGame(6);
    for (const id of ['b', 'c', 'd', 'e', 'f']) setPlayer(s, id, { cash: 100 });
    s = rut(s, 'community-help-the-poor');
    expect(cash(s, 'a')).toBe(450);
    for (const id of ['b', 'c', 'd', 'e', 'f']) expect(cash(s, id)).toBe(110);
    expect(totalCash(s)).toBe(1000);
  });

  it('so tiền mặt sau khi nhận 200Đ qua ô 00 (250 + 200 > 300): trả 50Đ', () => {
    let s = newGame(2);
    setPlayer(s, 'a', { cash: 250 });
    setPlayer(s, 'b', { cash: 300 });
    s = rut(s, 'community-help-the-poor', [], 38, 1, 3);
    expect(cash(s, 'a')).toBe(400);
    expect(cash(s, 'b')).toBe(350);
  });

  it('trả 50Đ khi tiền mặt đúng 50Đ: còn 0Đ', () => {
    let s = newGame(2);
    setPlayer(s, 'a', { cash: 50 });
    setPlayer(s, 'b', { cash: 10 });
    s = rut(s, 'community-help-the-poor');
    expect(cash(s, 'a')).toBe(0);
    expect(cash(s, 'b')).toBe(60);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('đồng hạng mà thiếu tiền: một khoản nợ 50Đ, chưa trả phần nào trước khi đủ', () => {
    let s = newGame(3);
    setPlayer(s, 'a', { cash: 40 });
    setPlayer(s, 'b', { cash: 10 });
    setPlayer(s, 'c', { cash: 10 });
    own(s, 'a', 39);
    s = rut(s, 'community-help-the-poor');
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 50 });
    expect(cash(s, 'b')).toBe(10);
    expect(cash(s, 'c')).toBe(10);
    s = quanLy(s, 'a', [{ op: 'mortgage', tile: 39 }]);
    s = tra(s, 'a');
    expect(cash(s, 'a')).toBe(190);
    expect(cash(s, 'b')).toBe(35);
    expect(cash(s, 'c')).toBe(35);
  });

  it('không trả nổi 50Đ: phá sản, người nghèo nhất không nhận phần nào', () => {
    let s = newGame(3);
    setPlayer(s, 'a', { cash: 40 });
    setPlayer(s, 'b', { cash: 30 });
    setPlayer(s, 'c', { cash: 30 });
    s = rut(s, 'community-help-the-poor');
    expect(s.pending).toEqual({ type: 'ended' });
    expect(s.loserId).toBe('a');
    expect(cash(s, 'b')).toBe(30);
    expect(cash(s, 'c')).toBe(30);
  });

  it('nhận 20Đ: người không trả nổi phá sản, khoản đã trả giữ nguyên (mục 10)', () => {
    let s = newGame(3);
    setPlayer(s, 'a', { cash: 5 });
    setPlayer(s, 'c', { cash: 15 });
    s = rut(s, 'community-help-the-poor');
    expect(s.pending).toEqual({ type: 'ended' });
    expect(s.loserId).toBe('c');
    expect(cash(s, 'a')).toBe(25);
    expect(cash(s, 'b')).toBe(480);
  });

  it('nhận 20Đ: người thiếu tiền nhưng thanh lý được thì Xử lý nợ lần lượt', () => {
    let s = newGame(3);
    setPlayer(s, 'a', { cash: 5 });
    setPlayer(s, 'b', { cash: 15 });
    own(s, 'b', 6);
    s = rut(s, 'community-help-the-poor');
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'b',
      total: 20,
      creditors: [{ playerId: 'a', amount: 20 }],
    });
    expect(cash(s, 'c')).toBe(500);
    s = quanLy(s, 'b', [{ op: 'mortgage', tile: 6 }]);
    s = tra(s, 'b');
    expect(cash(s, 'b')).toBe(45);
    expect(cash(s, 'c')).toBe(480);
    expect(cash(s, 'a')).toBe(45);
  });
});

// ---------------------------------------------------------------------------
// Trả tiền nước
// ---------------------------------------------------------------------------

describe('Khí Vận: Trả tiền nước (mục 9, thẻ 11)', () => {
  it('không có nhà: không trả gì', () => {
    let s = newGame(2);
    own(s, 'a', 1);
    own(s, 'b', 28);
    s = rut(s, 'community-water');
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('mỗi nhà 40Đ, mỗi khách sạn 120Đ; Nhà Máy Nước vô chủ thì trả hết Ngân hàng', () => {
    let s = newGame(2);
    own(s, 'a', 1, { level: 2 }); // 80
    own(s, 'a', 3, { level: 5 }); // khách sạn 120
    own(s, 'a', 6, { level: 4 }); // 160
    s = rut(s, 'community-water');
    expect(cash(s, 'a')).toBe(500 - 360);
    expect(totalCash(s)).toBe(1000 - 360);
  });

  it('nhà trên đất của người khác không tính cho người rút', () => {
    let s = newGame(2);
    own(s, 'b', 6, { level: 3 });
    s = rut(s, 'community-water');
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
  });

  it('chủ Nhà Máy Nước (người khác) đang hoạt động nhận 20%, còn lại trả Ngân hàng', () => {
    let s = newGame(2);
    own(s, 'a', 1, { level: 3 }); // 120
    own(s, 'b', 28);
    s = rut(s, 'community-water');
    expect(cash(s, 'a')).toBe(380);
    expect(cash(s, 'b')).toBe(524);
  });

  it('khách sạn: chủ Nhà Máy Nước nhận 20% của 120 = 24Đ', () => {
    let s = newGame(3);
    own(s, 'a', 39, { level: 5 });
    own(s, 'c', 28);
    s = rut(s, 'community-water');
    expect(cash(s, 'a')).toBe(380);
    expect(cash(s, 'c')).toBe(524);
    expect(cash(s, 'b')).toBe(500);
  });

  it('Nhà Máy Nước đang cắm: chủ không nhận, trả hết Ngân hàng', () => {
    let s = newGame(2);
    own(s, 'a', 1, { level: 3 });
    own(s, 'b', 28, { mortgaged: true });
    s = rut(s, 'community-water');
    expect(cash(s, 'a')).toBe(380);
    expect(cash(s, 'b')).toBe(500);
  });

  it('người rút là chủ Nhà Máy Nước: phần 20% về chính mình', () => {
    let s = newGame(2);
    own(s, 'a', 1, { level: 3 }); // 120, 20% = 24
    own(s, 'a', 28);
    s = rut(s, 'community-water');
    expect(cash(s, 'a')).toBe(500 - 120 + 24);
    expect(cash(s, 'b')).toBe(500);
  });

  it('chủ Nhà Máy Điện không nhận gì từ tiền nước', () => {
    let s = newGame(2);
    own(s, 'a', 1, { level: 1 });
    own(s, 'b', 12);
    s = rut(s, 'community-water');
    expect(cash(s, 'a')).toBe(460);
    expect(cash(s, 'b')).toBe(500);
  });

  it('thiếu tiền: vào Xử lý nợ, cắm đất khác rồi trả', () => {
    let s = newGame(2);
    setPlayer(s, 'a', { cash: 30 });
    own(s, 'a', 1, { level: 2 });
    own(s, 'a', 39);
    s = rut(s, 'community-water');
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 80 });
    s = quanLy(s, 'a', [{ op: 'mortgage', tile: 39 }]);
    s = tra(s, 'a');
    expect(cash(s, 'a')).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Thẻ ra tù miễn phí
// ---------------------------------------------------------------------------

describe('Khí Vận: Thẻ ra tù miễn phí (mục 9, thẻ 13; mục 6)', () => {
  it('rút được thì giữ lại, không còn trong chồng thẻ, tiền không đổi', () => {
    let s = newGame(2);
    s = rut(s, 'community-jail-free');
    expect(player(s, 'a').heldCards).toEqual([{ cardId: 'community-jail-free', kind: 'jailFree' }]);
    expect(s.decks.community).not.toContain('community-jail-free');
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('giữ qua nhiều lượt, dùng để ra tù ngay rồi đổ bình thường; thẻ quay lại chồng Khí Vận', () => {
    let s = newGame(2);
    s = rut(s, 'community-jail-free');
    s = luotNhanh(s); // b
    setPlayer(s, 'a', { position: 25 });
    s = roll(s, 2, 3); // ô 30: vào tù
    expect(player(s, 'a').inJail).toBe(true);
    s = luotNhanh(s); // b
    expect(s.pending).toEqual({ type: 'jail', playerId: 'a' });
    s = act(s, { type: 'useJailCard', playerId: 'a' });
    expect(player(s, 'a').inJail).toBe(false);
    expect(player(s, 'a').heldCards).toEqual([]);
    expect(s.decks.community).toContain('community-jail-free');
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
    s = roll(s, 2, 4);
    expect(player(s, 'a').position).toBe(16);
  });

  it('lần thử thứ 3 không ra đôi: dùng thẻ thay 50Đ rồi đi theo tổng, thẻ quay lại chồng', () => {
    let s = newGame(2);
    giuThe(s, 'a', 'community-jail-free', 'jailFree');
    s = rut(s, 'community-jail');
    s = luotNhanh(s); // b, tới lượt a trong tù
    for (let k = 0; k < 2; k++) {
      s = roll(s, 1, 2); // a trượt liên tiếp, không xen lượt b
    }
    topCard(s, 'community-singing');
    s = roll(s, 3, 4); // lần 3 trượt: chọn bảo lãnh hoặc thẻ
    expect(s.pending).toEqual({ type: 'jailRelease', playerId: 'a', steps: 7 });
    s = act(s, { type: 'useJailCard', playerId: 'a' });
    expect(player(s, 'a').position).toBe(17);
    expect(cash(s, 'a')).toBe(530);
    expect(coThe(s, 'a', 'jailFree')).toBe(false);
    expect(s.decks.community).toContain('community-jail-free');
  });

  it('hết giờ ở lần thử thứ 3: dùng thẻ ra tù nếu có (mục 11)', () => {
    let s = newGame(2);
    giuThe(s, 'a', 'community-jail-free', 'jailFree');
    s = rut(s, 'community-jail');
    s = luotNhanh(s); // b, tới lượt a trong tù
    for (let k = 0; k < 2; k++) {
      s = roll(s, 1, 2);
    }
    s = roll(s, 2, 3);
    expect(s.pending).toEqual({ type: 'jailRelease', playerId: 'a', steps: 5 });
    s = act(s, { type: 'timeout' });
    expect(player(s, 'a').position).toBe(15);
    expect(player(s, 'a').inJail).toBe(false);
    expect(cash(s, 'a')).toBe(500);
    expect(s.decks.community).toContain('community-jail-free');
  });

  it('người không có thẻ thì không dùng được', () => {
    let s = newGame(2);
    s = rut(s, 'community-jail-free'); // a giữ
    s = luotNhanh(s); // b
    s = luotNhanh(s); // a
    setPlayer(s, 'b', { position: 25 });
    s = roll(s, 2, 3); // b vào tù
    s = luotNhanh(s); // a
    expect(s.pending).toEqual({ type: 'jail', playerId: 'b' });
    reject(s, { type: 'useJailCard', playerId: 'b' });
  });
});

// ---------------------------------------------------------------------------
// Bầu tổng thống
// ---------------------------------------------------------------------------

describe('Khí Vận: Bầu tổng thống (mục 9, thẻ 15)', () => {
  it('2 người: trả 30Đ cho người kia', () => {
    let s = newGame(2);
    s = rut(s, 'community-election');
    expect(cash(s, 'a')).toBe(470);
    expect(cash(s, 'b')).toBe(530);
    expect(totalCash(s)).toBe(1000);
  });

  it('4 người: trả 30Đ cho mỗi người (tổng 90Đ)', () => {
    let s = newGame(4);
    s = rut(s, 'community-election');
    expect(cash(s, 'a')).toBe(410);
    for (const id of ['b', 'c', 'd']) expect(cash(s, id)).toBe(530);
  });

  it('tiền mặt đúng 90Đ (4 người): trả hết, còn 0Đ', () => {
    let s = newGame(4);
    setPlayer(s, 'a', { cash: 90 });
    s = rut(s, 'community-election');
    expect(cash(s, 'a')).toBe(0);
    expect(player(s, 'a').status).toBe('active');
  });

  it('thiếu tiền: một khoản nợ tổng 90Đ, chưa ai nhận phần nào trước khi trả đủ', () => {
    let s = newGame(4);
    setPlayer(s, 'a', { cash: 50 });
    own(s, 'a', 39);
    s = rut(s, 'community-election');
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 90 });
    for (const id of ['b', 'c', 'd']) expect(cash(s, id)).toBe(500);
    s = quanLy(s, 'a', [{ op: 'mortgage', tile: 39 }]);
    s = tra(s, 'a');
    expect(cash(s, 'a')).toBe(160);
    for (const id of ['b', 'c', 'd']) expect(cash(s, id)).toBe(530);
  });

  it('không trả nổi tổng 90Đ: phá sản, không ai nhận phần nào', () => {
    let s = newGame(4);
    setPlayer(s, 'a', { cash: 80 });
    s = rut(s, 'community-election');
    expect(s.pending).toEqual({ type: 'ended' });
    expect(s.loserId).toBe('a');
    for (const id of ['b', 'c', 'd']) expect(cash(s, id)).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Vào tù là rõ
// ---------------------------------------------------------------------------

describe('Khí Vận: Vào tù là rõ (mục 9, thẻ 18)', () => {
  it('từ ô 33: đến ô 10, bị giam, không nhận 200Đ', () => {
    let s = newGame(2);
    s = rut(s, 'community-jail', [], 29, 1, 3);
    expect(player(s, 'a').position).toBe(10);
    expect(player(s, 'a').inJail).toBe(true);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('rút khi đổ đôi: không được đổ thêm', () => {
    let s = newGame(2);
    s = rut(s, 'community-jail', [], 15, 1, 1);
    expect(player(s, 'a').inJail).toBe(true);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('lượt sau đang ở tù: chờ xử lý tù, không phải Metro', () => {
    let s = newGame(2);
    s = rut(s, 'community-jail');
    s = luotNhanh(s);
    expect(s.pending).toEqual({ type: 'jail', playerId: 'a' });
  });

  it('đang giữ thẻ ra tù: vẫn vào tù, lượt sau dùng thẻ ra', () => {
    let s = newGame(2);
    giuThe(s, 'a', 'community-jail-free', 'jailFree');
    s = rut(s, 'community-jail');
    expect(player(s, 'a').inJail).toBe(true);
    expect(coThe(s, 'a', 'jailFree')).toBe(true);
    s = luotNhanh(s);
    s = act(s, { type: 'useJailCard', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });
});

// ---------------------------------------------------------------------------
// Ngân hàng tái cơ cấu
// ---------------------------------------------------------------------------

describe('Khí Vận: Ngân hàng tái cơ cấu (mục 9, thẻ 19)', () => {
  it('2 người: tiền người rút giảm về phần nguyên trung bình, người khác không đổi', () => {
    let s = newGame(2);
    setPlayer(s, 'b', { cash: 201 });
    s = rut(s, 'community-bank-restructure');
    expect(cash(s, 'a')).toBe(350); // (500 + 201) / 2 = 350,5
    expect(cash(s, 'b')).toBe(201);
  });

  it('3 người: người rút nghèo hơn thì tăng lên mức trung bình', () => {
    let s = newGame(3);
    setPlayer(s, 'a', { cash: 100 });
    setPlayer(s, 'c', { cash: 600 });
    s = rut(s, 'community-bank-restructure');
    expect(cash(s, 'a')).toBe(400);
    expect(cash(s, 'b')).toBe(500);
    expect(cash(s, 'c')).toBe(600);
  });

  it('làm tròn xuống: (500 + 0 + 0) / 3 → 166', () => {
    let s = newGame(3);
    setPlayer(s, 'b', { cash: 0 });
    setPlayer(s, 'c', { cash: 0 });
    s = rut(s, 'community-bank-restructure');
    expect(cash(s, 'a')).toBe(166);
  });

  it('làm tròn xuống khi tăng: (0 + 1 + 2 + 4) / 4 → 1', () => {
    let s = newGame(4);
    setPlayer(s, 'a', { cash: 0 });
    setPlayer(s, 'b', { cash: 1 });
    setPlayer(s, 'c', { cash: 2 });
    setPlayer(s, 'd', { cash: 4 });
    s = rut(s, 'community-bank-restructure');
    expect(cash(s, 'a')).toBe(1);
  });

  it('tiền mặt người rút tính cả 200Đ vừa qua ô 00: (300 + 200 + 100) / 2 = 300', () => {
    let s = newGame(2);
    setPlayer(s, 'a', { cash: 300 });
    setPlayer(s, 'b', { cash: 100 });
    s = rut(s, 'community-bank-restructure', [], 38, 1, 3);
    expect(cash(s, 'a')).toBe(300);
  });

  it('đã bằng trung bình: không đổi', () => {
    let s = newGame(3);
    setPlayer(s, 'b', { cash: 400 });
    setPlayer(s, 'c', { cash: 600 });
    s = rut(s, 'community-bank-restructure');
    expect(cash(s, 'a')).toBe(500);
  });

  it('không giảm thành nợ: tiền mặt được đặt thẳng, không chờ trả tiền', () => {
    let s = newGame(2);
    setPlayer(s, 'a', { cash: 1000 });
    setPlayer(s, 'b', { cash: 0 });
    s = rut(s, 'community-bank-restructure');
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });
});

// ---------------------------------------------------------------------------
// Mở đường cao tốc
// ---------------------------------------------------------------------------

describe('Khí Vận: Mở đường cao tốc (mục 9, thẻ 20)', () => {
  it('chờ người rút chọn 1 trong 22 đất màu', () => {
    let s = newGame(2);
    s = rut(s, 'community-highway');
    expect(s.pending).toMatchObject({ type: 'chooseTile', playerId: 'a' });
    const pd = s.pending as Extract<GameState['pending'], { type: 'chooseTile' }>;
    expect([...pd.options].sort((x, y) => x - y)).toEqual(DAT_MAU);
  });

  it.each([0, 2, 4, 5, 7, 10, 12, 15, 17, 20, 28, 30, 33, 38])(
    'không chọn được ô %i (không phải đất màu)',
    (tile) => {
      let s = newGame(2);
      s = rut(s, 'community-highway');
      reject(s, { type: 'chooseTile', playerId: 'a', tile }, [4]);
    },
  );

  it('người khác không chọn thay được', () => {
    let s = newGame(2);
    s = rut(s, 'community-highway');
    reject(s, { type: 'chooseTile', playerId: 'b', tile: 6 }, [4]);
  });

  it.each([
    [1, 11],
    [2, 21],
    [3, 31],
  ])('gieo %i: đi đến ô cách ô chọn (01) tương ứng 10/20/30 bước → ô %i', (die, dest) => {
    let s = newGame(2);
    s = rut(s, 'community-highway');
    s = chon(s, 'a', 1, [die]);
    expect(player(s, 'a').position).toBe(dest);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: dest });
    expect(cash(s, 'a')).toBe(500);
  });

  it.each([4, 5, 6])('gieo %i: đứng tại ô chọn', (die) => {
    let s = newGame(2);
    s = rut(s, 'community-highway');
    s = chon(s, 'a', 6, [die]);
    expect(player(s, 'a').position).toBe(6);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 6 });
  });

  it('không nhận 200Đ khi vượt qua ô 00 (từ ô 33 chọn 39, gieo 1 → ô 09)', () => {
    let s = newGame(2);
    s = rut(s, 'community-highway', [], 29, 1, 3);
    s = chon(s, 'a', 39, [1]);
    expect(player(s, 'a').position).toBe(9);
    expect(cash(s, 'a')).toBe(500);
  });

  it('không nhận 200Đ khi ô chọn nằm sau người rút (từ ô 33 chọn 01, đứng tại chỗ)', () => {
    let s = newGame(2);
    s = rut(s, 'community-highway', [], 29, 1, 3);
    s = chon(s, 'a', 1, [5]);
    expect(player(s, 'a').position).toBe(1);
    expect(cash(s, 'a')).toBe(500);
  });

  it('không nhận 200Đ khi đi 30 bước vòng qua ô 00 (chọn 21, gieo 3 → ô 11)', () => {
    let s = newGame(2);
    s = rut(s, 'community-highway');
    s = chon(s, 'a', 21, [3]);
    expect(player(s, 'a').position).toBe(11);
    expect(cash(s, 'a')).toBe(500);
  });

  it('chọn đất đang cắm của người khác: đứng đó không trả tiền', () => {
    let s = newGame(2);
    own(s, 'b', 6, { mortgaged: true });
    s = rut(s, 'community-highway');
    s = chon(s, 'a', 6, [4]);
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('đến đất có nhà của người khác: trả tiền thuê, phải bấm Trả tiền', () => {
    let s = newGame(2);
    own(s, 'b', 9, { level: 2 });
    s = rut(s, 'community-highway');
    s = chon(s, 'a', 9, [6]);
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      total: 100,
      creditors: [{ playerId: 'b', amount: 100 }],
      confirm: true,
    });
    s = tra(s, 'a');
    expect(cash(s, 'a')).toBe(400);
    expect(cash(s, 'b')).toBe(600);
  });

  it('đến ô đích (ô chọn + 10) là đất khách sạn của người khác', () => {
    let s = newGame(2);
    own(s, 'b', 29, { level: 5 });
    setPlayer(s, 'a', { cash: 2000 });
    s = rut(s, 'community-highway');
    s = chon(s, 'a', 19, [1]);
    expect(player(s, 'a').position).toBe(29);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 1200 });
  });

  it('đến đất đang cắm của mình: được chuộc và nâng lên 1 nhà', () => {
    let s = newGame(2);
    own(s, 'a', 6, { mortgaged: true });
    s = rut(s, 'community-highway');
    s = chon(s, 'a', 6, [4]);
    expect(s.pending).toMatchObject({ type: 'upgrade', playerId: 'a', tile: 6 });
    s = act(s, { type: 'upgrade', playerId: 'a' });
    expect(s.tiles[6]).toMatchObject({ owner: 'a', level: 1, mortgaged: false });
    expect(cash(s, 'a')).toBe(500 - 55 - 50);
  });

  it('đến đất của mình: được nâng cấp như bình thường', () => {
    let s = newGame(2);
    own(s, 'a', 6, { level: 1 });
    s = rut(s, 'community-highway');
    s = chon(s, 'a', 6, [4]);
    expect(s.pending).toMatchObject({ type: 'upgrade', playerId: 'a', tile: 6 });
  });

  it('đến Nhà Máy Nước của người khác: gieo 2 viên mới để tính tiền (3 + 4) × 4 = 28', () => {
    let s = newGame(2);
    own(s, 'b', 28);
    s = rut(s, 'community-highway');
    s = chon(s, 'a', 18, [1, 3, 4]);
    expect(player(s, 'a').position).toBe(28);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 28 });
  });

  it('đến Nhà Máy Điện (chọn 32, gieo 2) của chủ có cả 2 nhà máy: (5 + 6) × 10', () => {
    let s = newGame(2);
    own(s, 'b', 12);
    own(s, 'b', 28);
    s = rut(s, 'community-highway');
    s = chon(s, 'a', 32, [2, 5, 6]);
    expect(player(s, 'a').position).toBe(12);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 110 });
  });

  it('đến ô thuế 04 (chọn 34, gieo 1): trả 200Đ, không nhận 200Đ qua ô 00', () => {
    let s = newGame(2);
    s = rut(s, 'community-highway');
    s = chon(s, 'a', 34, [1]);
    expect(player(s, 'a').position).toBe(4);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 200, confirm: true });
    s = tra(s, 'a');
    expect(cash(s, 'a')).toBe(300);
  });

  it('đến ô Cơ Hội 07 (chọn 37, gieo 1): rút thẻ Cơ Hội và làm ngay', () => {
    let s = newGame(2);
    s = rut(s, 'community-highway');
    topCard(s, 'chance-acting');
    s = chon(s, 'a', 37, [1]);
    expect(player(s, 'a').position).toBe(7);
    expect(cash(s, 'a')).toBe(550);
  });

  it('đến ô Khí Vận 33 (chọn 23, gieo 1): rút tiếp thẻ Khí Vận', () => {
    let s = newGame(2);
    topCard(s, 'community-found-money');
    s = rut(s, 'community-highway'); // Cao tốc trên cùng, Nhặt được của rơi kế tiếp
    s = chon(s, 'a', 23, [1]);
    expect(player(s, 'a').position).toBe(33);
    expect(cash(s, 'a')).toBe(700);
  });

  it('đến ô Khí Vận 17 (chọn 37, gieo 2): rút tiếp thẻ Khí Vận', () => {
    let s = newGame(2);
    topCard(s, 'community-singing');
    s = rut(s, 'community-highway', [], 29, 1, 3);
    s = chon(s, 'a', 37, [2]);
    expect(player(s, 'a').position).toBe(17);
    expect(cash(s, 'a')).toBe(530);
  });

  it('hết giờ: chọn đất màu đầu tiên phía trước người rút (ô 17 → 18)', () => {
    let s = newGame(2);
    s = rut(s, 'community-highway');
    s = act(s, { type: 'timeout' }, [4]);
    expect(player(s, 'a').position).toBe(18);
    // Mua đất là tự nguyện: chờ người chơi quyết định
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 18 });
  });

  it('hết giờ ở ô 33: chọn 34 rồi gieo 1 → ô 04 (thuế)', () => {
    let s = newGame(2);
    s = rut(s, 'community-highway', [], 29, 1, 3);
    s = act(s, { type: 'timeout' }, [1]);
    expect(player(s, 'a').position).toBe(4);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 200 });
  });

  it('hết giờ ở ô 02: chọn ô 03', () => {
    let s = newGame(2);
    s = rut(s, 'community-highway', [], 0, 1, 1);
    s = act(s, { type: 'timeout' }, [6]);
    expect(player(s, 'a').position).toBe(3);
  });

  it('rút khi đổ đôi: xử lý ô đích xong vẫn được đổ thêm', () => {
    let s = newGame(2);
    s = rut(s, 'community-highway', [], 15, 1, 1);
    s = chon(s, 'a', 6, [5]);
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });
});

// ---------------------------------------------------------------------------
// Thằng Bờm đổi quạt mo
// ---------------------------------------------------------------------------

describe('Khí Vận: Thằng Bờm đổi quạt mo (mục 9, thẻ 21)', () => {
  it('2 người: viên 1 lớn hơn 1 thì gieo lại; viên 2 chẵn: đổi đất màu rẻ nhất hai bên', () => {
    let s = newGame(2);
    own(s, 'a', 3);
    own(s, 'a', 39);
    own(s, 'b', 6);
    own(s, 'b', 37);
    s = rut(s, 'community-swap', [4, 2, 6, 1, 2]);
    expect(chu(s, 3)).toBe('b');
    expect(chu(s, 6)).toBe('a');
    expect(chu(s, 39)).toBe('a');
    expect(chu(s, 37)).toBe('b');
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('đổi đất giữ nguyên cấp nhà và trạng thái cắm', () => {
    let s = newGame(2);
    own(s, 'a', 3, { level: 2 });
    own(s, 'a', 39);
    own(s, 'b', 6, { mortgaged: true });
    own(s, 'b', 37);
    s = rut(s, 'community-swap', [1, 4]);
    expect(s.tiles[3]).toMatchObject({ owner: 'b', level: 2, mortgaged: false });
    expect(s.tiles[6]).toMatchObject({ owner: 'a', level: 0, mortgaged: true });
  });

  it('đất rẻ nhất đang cắm vẫn được tính', () => {
    let s = newGame(2);
    own(s, 'a', 1, { mortgaged: true });
    own(s, 'a', 39);
    own(s, 'b', 37);
    s = rut(s, 'community-swap', [1, 6]);
    expect(s.tiles[1]).toMatchObject({ owner: 'b', mortgaged: true });
    expect(chu(s, 37)).toBe('a');
    expect(chu(s, 39)).toBe('a');
  });

  it('nhiều ô cùng rẻ nhất thì lấy ô có số nhỏ hơn', () => {
    let s = newGame(2);
    own(s, 'a', 3);
    own(s, 'a', 1);
    own(s, 'b', 8);
    own(s, 'b', 6);
    s = rut(s, 'community-swap', [1, 2]);
    expect(chu(s, 1)).toBe('b');
    expect(chu(s, 3)).toBe('a');
    expect(chu(s, 6)).toBe('a');
    expect(chu(s, 8)).toBe('b');
  });

  it('rẻ nhất theo giá, không theo số ô (Tháp Rùa 120 < Phú Quốc 400, dù 39 > 9)', () => {
    let s = newGame(2);
    own(s, 'a', 39);
    own(s, 'a', 9);
    own(s, 'b', 37);
    own(s, 'b', 11);
    s = rut(s, 'community-swap', [1, 2]);
    expect(chu(s, 9)).toBe('b');
    expect(chu(s, 11)).toBe('a');
  });

  it('4 người, a rút: viên 1 = 2 chọn c (người kế tiếp là 1)', () => {
    let s = newGame(4);
    own(s, 'a', 3);
    own(s, 'b', 1);
    own(s, 'c', 8);
    own(s, 'd', 6);
    s = rut(s, 'community-swap', [2, 2]);
    expect(chu(s, 3)).toBe('c');
    expect(chu(s, 8)).toBe('a');
    expect(chu(s, 1)).toBe('b');
    expect(chu(s, 6)).toBe('d');
  });

  it('4 người, c rút: đếm từ người ngồi sau (d = 1, a = 2, b = 3)', () => {
    let s = newGame(4);
    s = luotNhanh(s); // a
    s = luotNhanh(s); // b
    expect(who(s)).toBe('c');
    own(s, 'c', 39);
    own(s, 'b', 37);
    own(s, 'a', 1);
    own(s, 'd', 3);
    s = rut(s, 'community-swap', [3, 4]);
    expect(chu(s, 39)).toBe('b');
    expect(chu(s, 37)).toBe('c');
    expect(chu(s, 1)).toBe('a');
    expect(chu(s, 3)).toBe('d');
  });

  it('3 người: viên 1 ra 3 hoặc 6 (lớn hơn 2 đối thủ) thì gieo lại', () => {
    let s = newGame(3);
    own(s, 'a', 3);
    own(s, 'b', 1);
    own(s, 'c', 8);
    s = rut(s, 'community-swap', [3, 6, 2, 6]);
    expect(chu(s, 3)).toBe('c');
    expect(chu(s, 8)).toBe('a');
    expect(chu(s, 1)).toBe('b');
  });

  it('viên 2 lẻ: đổi đất màu rẻ nhất lấy ga gần nhất phía trước người rút của đối thủ', () => {
    let s = newGame(2);
    own(s, 'a', 3);
    own(s, 'a', 39);
    own(s, 'b', 5);
    own(s, 'b', 12);
    own(s, 'b', 25);
    s = rut(s, 'community-swap', [1, 1]); // a ở ô 17: ga 25 gần nhất phía trước
    expect(chu(s, 25)).toBe('a');
    expect(chu(s, 3)).toBe('b');
    expect(chu(s, 5)).toBe('b');
    expect(chu(s, 12)).toBe('b');
    expect(chu(s, 39)).toBe('a');
  });

  it('viên 2 lẻ: nhà máy gần hơn ga thì lấy nhà máy (a ở ô 02, b có 12 và 15)', () => {
    let s = newGame(2);
    own(s, 'a', 3);
    own(s, 'b', 12);
    own(s, 'b', 15);
    s = rut(s, 'community-swap', [1, 3], 0, 1, 1);
    expect(chu(s, 12)).toBe('a');
    expect(chu(s, 3)).toBe('b');
    expect(chu(s, 15)).toBe('b');
  });

  it('viên 2 lẻ: gần nhất phía trước tính vòng qua ô 00 (a ở ô 33, b có 05 và 15)', () => {
    let s = newGame(2);
    own(s, 'a', 3);
    own(s, 'b', 15);
    own(s, 'b', 5);
    s = rut(s, 'community-swap', [1, 5], 29, 1, 3);
    expect(chu(s, 5)).toBe('a');
    expect(chu(s, 15)).toBe('b');
    expect(chu(s, 3)).toBe('b');
  });

  it('viên 2 lẻ: bỏ qua ga/nhà máy của người khác không phải đối thủ được chọn', () => {
    let s = newGame(3);
    own(s, 'a', 3);
    own(s, 'b', 25); // gần hơn nhưng của b
    own(s, 'c', 35);
    s = rut(s, 'community-swap', [2, 1]); // viên 1 = 2 → c
    expect(chu(s, 35)).toBe('a');
    expect(chu(s, 3)).toBe('c');
    expect(chu(s, 25)).toBe('b');
  });

  it('viên 2 lẻ, đối thủ không có ga/nhà máy: đối thủ trả người rút 100Đ, không đổi đất', () => {
    let s = newGame(2);
    own(s, 'a', 3);
    own(s, 'b', 6);
    s = rut(s, 'community-swap', [1, 3]);
    expect(cash(s, 'a')).toBe(600);
    expect(cash(s, 'b')).toBe(400);
    expect(chu(s, 3)).toBe('a');
    expect(chu(s, 6)).toBe('b');
  });

  it('viên 2 chẵn, người rút không có đất màu: đối thủ trả người rút 100Đ', () => {
    let s = newGame(2);
    own(s, 'a', 5); // ga không tính
    own(s, 'b', 6);
    s = rut(s, 'community-swap', [1, 4]);
    expect(cash(s, 'a')).toBe(600);
    expect(cash(s, 'b')).toBe(400);
    expect(chu(s, 6)).toBe('b');
    expect(chu(s, 5)).toBe('a');
  });

  it('viên 2 chẵn, đối thủ không có đất màu: đối thủ trả người rút 100Đ', () => {
    let s = newGame(2);
    own(s, 'a', 3);
    own(s, 'b', 12);
    s = rut(s, 'community-swap', [1, 2]);
    expect(cash(s, 'a')).toBe(600);
    expect(cash(s, 'b')).toBe(400);
    expect(chu(s, 3)).toBe('a');
  });

  it('viên 2 lẻ, người rút không có đất màu dù đối thủ có ga: đối thủ trả 100Đ', () => {
    let s = newGame(2);
    own(s, 'b', 25);
    s = rut(s, 'community-swap', [1, 5]);
    expect(cash(s, 'a')).toBe(600);
    expect(cash(s, 'b')).toBe(400);
    expect(chu(s, 25)).toBe('b');
  });

  it('cả hai không có gì: đối thủ trả 100Đ', () => {
    let s = newGame(3);
    s = rut(s, 'community-swap', [2, 2]);
    expect(cash(s, 'a')).toBe(600);
    expect(cash(s, 'c')).toBe(400);
    expect(cash(s, 'b')).toBe(500);
  });

  it('đối thủ thiếu tiền trả 100Đ nhưng thanh lý được: Xử lý nợ ngoài lượt', () => {
    let s = newGame(2);
    setPlayer(s, 'b', { cash: 50 });
    own(s, 'b', 5);
    s = rut(s, 'community-swap', [1, 2]);
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'b',
      total: 100,
      creditors: [{ playerId: 'a', amount: 100 }],
    });
    s = quanLy(s, 'b', [{ op: 'mortgage', tile: 5 }]);
    s = tra(s, 'b');
    expect(cash(s, 'b')).toBe(50);
    expect(cash(s, 'a')).toBe(600);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('đối thủ không trả nổi 100Đ: phá sản, ván kết thúc', () => {
    let s = newGame(2);
    setPlayer(s, 'b', { cash: 50 });
    s = rut(s, 'community-swap', [1, 2]);
    expect(s.pending).toEqual({ type: 'ended' });
    expect(s.loserId).toBe('b');
    expect(cash(s, 'a')).toBe(500);
  });

  it('đổi mất Phố Cổ: quyền Người thủ đô của người rút hết hiệu lực (mục 8, thẻ 17)', () => {
    let s = newGame(2);
    giuThe(s, 'a', 'chance-capital-citizen', 'taxWaiver');
    own(s, 'a', 1);
    own(s, 'a', 39);
    own(s, 'b', 37);
    s = rut(s, 'community-swap', [1, 2]);
    expect(chu(s, 1)).toBe('b');
    expect(coThe(s, 'a', 'taxWaiver')).toBe(false);
    expect(coThe(s, 'b', 'taxWaiver')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Kẻ khóc người cười
// ---------------------------------------------------------------------------

describe('Khí Vận: Kẻ khóc người cười (mục 9, thẻ 16; mục 10)', () => {
  /** Ván 2 người, a giữ thẻ; a đi một lượt nhanh, chờ b đổ. */
  function aGiuGuong(n = 2): GameState {
    let s = newGame(n);
    giuGuong(s, 'a');
    s = luotNhanh(s);
    expect(who(s)).toBe('b');
    return s;
  }

  it('rút được thì giữ lại, không còn trong chồng thẻ, tiền không đổi', () => {
    let s = newGame(2);
    s = rut(s, 'community-fortune-mirror');
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(true);
    expect(s.decks.community).not.toContain('community-fortune-mirror');
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
  });

  it('người khác rút thẻ nhận tiền: người giữ trả họ 40Đ, rồi trả thẻ về chồng', () => {
    let s = aGiuGuong();
    s = rut(s, 'community-god-of-wealth');
    expect(cash(s, 'b')).toBe(640);
    expect(cash(s, 'a')).toBe(460);
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(false);
    expect(s.decks.community).toContain('community-fortune-mirror');
  });

  it('người khác rút thẻ trả tiền: họ trả người giữ 40Đ', () => {
    let s = aGiuGuong();
    s = rut(s, 'community-naive');
    expect(cash(s, 'b')).toBe(410);
    expect(cash(s, 'a')).toBe(540);
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(false);
  });

  it('chỉ kích hoạt một lần: lần rút tiền kế tiếp không còn tác dụng', () => {
    let s = aGiuGuong();
    s = rut(s, 'community-god-of-wealth');
    s = luotNhanh(s); // a
    s = rut(s, 'community-flood');
    expect(cash(s, 'b')).toBe(640 + 50);
    expect(cash(s, 'a')).toBe(460);
  });

  it('thẻ Cơ Hội nhận tiền (Diễn kịch giỏi) cũng kích hoạt', () => {
    let s = aGiuGuong();
    s = rut(s, 'chance-acting', [], 4, 1, 2);
    expect(player(s, 'b').position).toBe(7);
    expect(cash(s, 'b')).toBe(590);
    expect(cash(s, 'a')).toBe(460);
  });

  it('Về điểm xuất phát (chỉ có 200Đ qua ô 00): không kích hoạt, vẫn giữ thẻ', () => {
    let s = aGiuGuong();
    s = rut(s, 'community-go');
    expect(cash(s, 'b')).toBe(700);
    expect(cash(s, 'a')).toBe(500);
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(true);
  });

  it('Vào tù là rõ (không đổi tiền): không kích hoạt', () => {
    let s = aGiuGuong();
    s = rut(s, 'community-jail');
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(true);
  });

  it('Cao tốc tới đất người giữ: tiền thuê ở ô đến không tính, không kích hoạt', () => {
    let s = aGiuGuong();
    own(s, 'a', 9);
    s = rut(s, 'community-highway');
    s = chon(s, 'b', 9, [4]);
    s = tra(s, 'b');
    expect(cash(s, 'b')).toBe(492);
    expect(cash(s, 'a')).toBe(508);
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(true);
  });

  it('Cao tốc tới ô thuế: thuế ở ô đến không tính, không kích hoạt', () => {
    let s = aGiuGuong();
    s = rut(s, 'community-highway');
    s = chon(s, 'b', 34, [1]);
    s = tra(s, 'b');
    expect(cash(s, 'b')).toBe(300);
    expect(cash(s, 'a')).toBe(500);
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(true);
  });

  it('Trả tiền nước khi không có nhà (ròng 0): không kích hoạt', () => {
    let s = aGiuGuong();
    s = rut(s, 'community-water');
    expect(cash(s, 'a')).toBe(500);
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(true);
  });

  it('Ngân hàng tái cơ cấu không đổi tiền (ròng 0): không kích hoạt', () => {
    let s = aGiuGuong();
    s = rut(s, 'community-bank-restructure');
    expect(cash(s, 'b')).toBe(500);
    expect(cash(s, 'a')).toBe(500);
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(true);
  });

  it('Ngân hàng tái cơ cấu làm giảm tiền: tính là trả tiền, người rút trả người giữ 40Đ', () => {
    let s = newGame(2);
    giuGuong(s, 'a');
    setPlayer(s, 'a', { cash: 100 });
    s = luotNhanh(s);
    s = rut(s, 'community-bank-restructure');
    expect(cash(s, 'b')).toBe(300 - 40);
    expect(cash(s, 'a')).toBe(140);
  });

  it('Thằng Bờm đổi đất (không có tiền): không kích hoạt', () => {
    let s = aGiuGuong();
    own(s, 'a', 6);
    own(s, 'b', 3);
    s = rut(s, 'community-swap', [1, 2]);
    expect(chu(s, 3)).toBe('a');
    expect(chu(s, 6)).toBe('b');
    expect(cash(s, 'a')).toBe(500);
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(true);
  });

  it('Thằng Bờm phạt 100Đ (người rút nhận tiền): người giữ trả thêm 40Đ', () => {
    let s = aGiuGuong();
    own(s, 'b', 39);
    s = rut(s, 'community-swap', [1, 2]); // a không có đất màu
    expect(cash(s, 'a')).toBe(500 - 100 - 40);
    expect(cash(s, 'b')).toBe(500 + 100 + 40);
  });

  it('người giữ tự rút thẻ tiền: không kích hoạt, vẫn giữ', () => {
    let s = newGame(2);
    giuGuong(s, 'a');
    s = rut(s, 'community-god-of-wealth');
    expect(cash(s, 'a')).toBe(600);
    expect(cash(s, 'b')).toBe(500);
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(true);
  });

  it('bỏ qua thẻ ròng 0, kích hoạt ở thẻ tiền kế tiếp của người khác', () => {
    let s = aGiuGuong(3);
    s = rut(s, 'community-go'); // b: ròng 0
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(true);
    s = rut(s, 'community-singing'); // c: nhận 30
    expect(cash(s, 'c')).toBe(570);
    expect(cash(s, 'a')).toBe(460);
    expect(cash(s, 'b')).toBe(700);
  });

  it('Bầu tổng thống (3 người): người rút trả 30Đ mỗi người rồi trả người giữ 40Đ', () => {
    let s = aGiuGuong(3);
    s = rut(s, 'community-election');
    expect(cash(s, 'b')).toBe(500 - 60 - 40);
    expect(cash(s, 'a')).toBe(570);
    expect(cash(s, 'c')).toBe(530);
  });

  it('Ủng hộ người nghèo: người giữ nghèo nhất nhận 50Đ rồi nhận thêm 40Đ', () => {
    let s = newGame(2);
    giuGuong(s, 'a');
    setPlayer(s, 'a', { cash: 100 });
    s = luotNhanh(s);
    s = rut(s, 'community-help-the-poor');
    expect(cash(s, 'a')).toBe(190);
    expect(cash(s, 'b')).toBe(410);
  });

  it('Sinh nhật: 40Đ chuyển sau khi mọi người trả xong thẻ', () => {
    let s = aGiuGuong(3);
    setPlayer(s, 'c', { cash: 5 });
    own(s, 'c', 1);
    s = rut(s, 'community-birthday'); // b rút: c rồi a trả
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'c', total: 10 });
    expect(cash(s, 'a')).toBe(500);
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(true);
    s = quanLy(s, 'c', [{ op: 'mortgage', tile: 1 }]);
    s = tra(s, 'c');
    expect(cash(s, 'b')).toBe(500 + 10 + 10 + 40);
    expect(cash(s, 'a')).toBe(450);
    expect(cash(s, 'c')).toBe(25);
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(false);
  });

  it('người rút trả tiền xong không còn đủ 40Đ: Xử lý nợ rồi trả người giữ', () => {
    let s = aGiuGuong();
    setPlayer(s, 'b', { cash: 60 });
    own(s, 'b', 39);
    s = rut(s, 'community-naive');
    expect(cash(s, 'b')).toBe(10);
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'b',
      total: 40,
      creditors: [{ playerId: 'a', amount: 40 }],
    });
    s = quanLy(s, 'b', [{ op: 'mortgage', tile: 39 }]);
    s = tra(s, 'b');
    expect(cash(s, 'b')).toBe(170);
    expect(cash(s, 'a')).toBe(540);
  });

  it('người giữ thiếu 40Đ nhưng thanh lý được: Xử lý nợ ngoài lượt', () => {
    let s = newGame(2);
    giuGuong(s, 'a');
    setPlayer(s, 'a', { cash: 30 });
    own(s, 'a', 39);
    s = luotNhanh(s);
    s = rut(s, 'community-found-money');
    expect(cash(s, 'b')).toBe(700);
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      total: 40,
      creditors: [{ playerId: 'b', amount: 40 }],
    });
    s = quanLy(s, 'a', [{ op: 'mortgage', tile: 39 }]);
    s = tra(s, 'a');
    expect(cash(s, 'a')).toBe(190);
    expect(cash(s, 'b')).toBe(740);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('người giữ không trả nổi 40Đ: phá sản, ván kết thúc, người rút giữ tiền thẻ', () => {
    let s = newGame(2);
    giuGuong(s, 'a');
    setPlayer(s, 'a', { cash: 30 });
    s = luotNhanh(s);
    s = rut(s, 'community-found-money');
    expect(s.pending).toEqual({ type: 'ended' });
    expect(s.loserId).toBe('a');
    expect(cash(s, 'b')).toBe(700);
  });
});

// ---------------------------------------------------------------------------
// Chồng thẻ Khí Vận
// ---------------------------------------------------------------------------

describe('Khí Vận: chồng thẻ (mục 8 đầu mục, mục 9)', () => {
  it('chồng có đủ 21 thẻ Khí Vận khi bắt đầu ván', () => {
    const s = newGame(2);
    expect([...s.decks.community].sort()).toEqual([...THE_KHI_VAN].sort());
  });

  it('rút thẻ thường: thẻ rời khỏi chồng cho đến khi xáo lại', () => {
    let s = newGame(2);
    s = rut(s, 'community-singing');
    expect(s.decks.community).toHaveLength(20);
    expect(s.decks.community).not.toContain('community-singing');
  });

  it('hết thẻ thì xáo lại, không gồm thẻ đang được giữ', () => {
    let s = newGame(2);
    giuGuong(s, 'a');
    giuThe(s, 'b', 'community-jail-free', 'jailFree');
    s.decks.community = [];
    // 19 thẻ còn lại: xáo Fisher–Yates cần 18 số int(0, i), i = 18…1; chọn j = i (giữ thứ tự)
    const xao = Array.from({ length: 18 }, (_, k) => 18 - k);
    setPlayer(s, 'a', { position: 14 });
    s = roll(s, 1, 2, ...xao);
    expect(s.decks.community).toHaveLength(18);
    expect(s.decks.community).not.toContain('community-fortune-mirror');
    expect(s.decks.community).not.toContain('community-jail-free');
    expect(coThe(s, 'a', 'fortuneMirror')).toBe(true);
    expect(coThe(s, 'b', 'jailFree')).toBe(true);
    const daRut = THE_KHI_VAN.filter(
      (c) =>
        c !== 'community-fortune-mirror' &&
        c !== 'community-jail-free' &&
        !s.decks.community.includes(c),
    );
    expect(daRut).toHaveLength(1);
  });
});
