import { describe, expect, it } from 'vitest';
import { CHANCE_CARDS, applyAction, type GameState, type KeepableCard, type Rng } from '../../src';
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

// Thẻ Cơ Hội: docs/luat-choi.md mục 8 (kèm mục 1 về ô 00, mục 4 về nhà máy, mục 10 về nợ).
// Số tiền trong test lấy từ tài liệu luật và bảng giá mục 7, không lấy từ code engine.

// ---------------------------------------------------------------------------
// Tiện ích riêng cho file này
// ---------------------------------------------------------------------------

type OCoHoi = 7 | 22 | 36;

/**
 * `a` đứng trước ô Cơ Hội `at` 7 ô, đặt `card` lên đầu chồng rồi đổ 3 + 4 (không đôi) tới đó.
 * `extra` là các số ngẫu nhiên thẻ dùng sau 2 viên đi.
 */
function rut(s: GameState, card: string, at: OCoHoi = 7, extra: number[] = []): GameState {
  expect(who(s)).toBe('a');
  setPlayer(s, 'a', { position: at - 7 });
  topCard(s, card);
  return roll(s, 3, 4, ...extra);
}

/** Như `rut` nhưng tới ô Cơ Hội bằng đổ đôi 2 + 2 (được thêm lượt nếu không vào tù). */
function rutDoi(s: GameState, card: string, at: OCoHoi = 7, extra: number[] = []): GameState {
  expect(who(s)).toBe('a');
  setPlayer(s, 'a', { position: at - 4 });
  topCard(s, card);
  return roll(s, 2, 2, ...extra);
}

const tra = (s: GameState): GameState => act(s, { type: 'pay', playerId: who(s) });

/** Trả các khoản đang chờ mà người phải trả đủ tiền mặt (kể cả khoản cần bấm nút). */
function traHet(s: GameState): GameState {
  while (s.pending.type === 'pay' && cash(s, s.pending.playerId) >= s.pending.total) s = tra(s);
  return s;
}

/** Cho người chơi giữ sẵn một thẻ (rút khỏi chồng của nó). Sửa trực tiếp `s`. */
function giuThe(s: GameState, id: string, cardId: string, kind: KeepableCard): GameState {
  player(s, id).heldCards.push({ cardId, kind });
  s.decks.chance = s.decks.chance.filter((c) => c !== cardId);
  s.decks.community = s.decks.community.filter((c) => c !== cardId);
  return s;
}

const theDangGiu = (s: GameState, id: string): KeepableCard[] =>
  player(s, id).heldCards.map((c) => c.kind);

/** Lượt nhanh của người đang chờ đổ: từ ô 15 đổ 2 + 3 tới Bãi Đỗ Xe (20), hết lượt. */
function luotNhanh(s: GameState): GameState {
  expect(s.pending.type).toBe('roll');
  setPlayer(s, who(s), { position: 15 });
  return roll(s, 2, 3);
}

const capO = (s: GameState, i: number): number => s.tiles[i]!.level;
const chuO = (s: GameState, i: number): string | null => s.tiles[i]!.owner;

const LUOT_B = { type: 'roll', playerId: 'b' } as const;
const LUOT_A = { type: 'roll', playerId: 'a' } as const;

const TAT_CA_THE_CO_HOI = CHANCE_CARDS.map((c) => c.id);

// ---------------------------------------------------------------------------
// Thẻ đi đến ô cố định: 01 Ga Sài Gòn, 02 Phú Quốc, 04 Bưu Điện, 12 Tháp Rùa, 16 Landmark 81
// ---------------------------------------------------------------------------

describe('thẻ 01 Đi đến Ga Sài Gòn (mục 8, mục 1)', () => {
  it.each([7, 22] as const)('từ ô %i tiến tới ô 35, không qua ô 00 nên không nhận 200Đ', (at) => {
    const s = rut(newGame(), 'chance-ga-sai-gon', at);
    expect(player(s, 'a').position).toBe(35);
    expect(cash(s, 'a')).toBe(500);
  });

  it('từ ô 36 phải tiến vòng qua ô 00 tới ô 35: nhận 200Đ', () => {
    const s = rut(newGame(), 'chance-ga-sai-gon', 36);
    expect(player(s, 'a').position).toBe(35);
    expect(cash(s, 'a')).toBe(700);
  });

  it('ga vô chủ: xử lý như bình thường, được mời mua (tự nguyện, không bắt buộc)', () => {
    let s = rut(newGame(), 'chance-ga-sai-gon', 7);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 35 });
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(chuO(s, 35)).toBeNull();
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('ga của người khác: trả tiền thuê ga bình thường theo số ga đang hoạt động, không gieo thêm', () => {
    const s0 = newGame();
    own(s0, 'b', 35);
    own(s0, 'b', 5);
    own(s0, 'b', 15, { mortgaged: true });
    let s = rut(s0, 'chance-ga-sai-gon', 7);
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      total: 50,
      creditors: [{ playerId: 'b', amount: 50 }],
    });
    s = tra(s);
    expect(cash(s, 'a')).toBe(450);
    expect(cash(s, 'b')).toBe(550);
  });
});

describe('thẻ 02 Đi đến Phú Quốc (mục 8)', () => {
  it.each([7, 22, 36] as const)('từ ô %i tiến tới ô 39, không qua ô 00, mời mua 400Đ', (at) => {
    let s = rut(newGame(), 'chance-phu-quoc', at);
    expect(player(s, 'a').position).toBe(39);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 39 });
    s = act(s, { type: 'buy', playerId: 'a' });
    expect(chuO(s, 39)).toBe('a');
    expect(cash(s, 'a')).toBe(100);
  });

  it('Phú Quốc của người khác có khách sạn (2000Đ), không đủ khả năng trả: phá sản ngay', () => {
    const s0 = newGame();
    own(s0, 'b', 39, { level: 5 });
    const s = rut(s0, 'chance-phu-quoc', 36);
    expect(s.pending.type).toBe('ended');
    expect(s.loserId).toBe('a');
    expect(player(s, 'a').status).toBe('bankrupt');
  });

  it('Phú Quốc của người khác đang cắm: không trả gì', () => {
    const s0 = newGame();
    own(s0, 'b', 39, { mortgaged: true });
    const s = rut(s0, 'chance-phu-quoc', 22);
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(s.pending).toEqual(LUOT_B);
  });
});

describe('thẻ 04 Đi đến Bưu Điện Hà Nội (mục 8, mục 1)', () => {
  it.each([7, 22, 36] as const)('từ ô %i tiến vòng qua ô 00 tới ô 06: nhận 200Đ', (at) => {
    const s = rut(newGame(), 'chance-buu-dien', at);
    expect(player(s, 'a').position).toBe(6);
    expect(cash(s, 'a')).toBe(700);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 6 });
  });

  it('Bưu Điện của người khác (1 nhà): nhận 200Đ rồi trả tiền thuê 30Đ', () => {
    const s0 = newGame();
    own(s0, 'b', 6, { level: 1 });
    let s = rut(s0, 'chance-buu-dien', 7);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 30 });
    s = tra(s);
    expect(cash(s, 'a')).toBe(670);
    expect(cash(s, 'b')).toBe(530);
  });
});

describe('thẻ 12 Đi đến Tháp Rùa (mục 8, mục 1)', () => {
  it('từ ô 07 tiến tới ô 09, không qua ô 00', () => {
    const s = rut(newGame(), 'chance-thap-rua', 7);
    expect(player(s, 'a').position).toBe(9);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 9 });
  });

  it.each([22, 36] as const)('từ ô %i tiến vòng qua ô 00 tới ô 09: nhận 200Đ', (at) => {
    const s = rut(newGame(), 'chance-thap-rua', at);
    expect(player(s, 'a').position).toBe(9);
    expect(cash(s, 'a')).toBe(700);
  });

  it('Tháp Rùa của người khác (2 nhà): trả 100Đ tiền thuê', () => {
    const s0 = newGame();
    own(s0, 'b', 9, { level: 2 });
    let s = rut(s0, 'chance-thap-rua', 7);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 100 });
    s = tra(s);
    expect(cash(s, 'a')).toBe(400);
    expect(cash(s, 'b')).toBe(600);
  });
});

describe('thẻ 16 Đi đến Landmark 81 (mục 8, mục 1, mục 3)', () => {
  it.each([
    [7, 500],
    [22, 500],
    [36, 700],
  ] as const)('từ ô %i tới ô 32, tiền còn %iĐ (chỉ từ ô 36 mới qua ô 00)', (at, expected) => {
    const s = rut(newGame(), 'chance-landmark', at);
    expect(player(s, 'a').position).toBe(32);
    expect(cash(s, 'a')).toBe(expected);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 32 });
  });

  it('Landmark 81 của mình: được nâng 1 cấp như bình thường (200Đ)', () => {
    const s0 = newGame();
    own(s0, 'a', 32, { level: 1 });
    let s = rut(s0, 'chance-landmark', 7);
    expect(s.pending).toMatchObject({ type: 'upgrade', playerId: 'a', tile: 32 });
    s = act(s, { type: 'upgrade', playerId: 'a' });
    expect(capO(s, 32)).toBe(2);
    expect(cash(s, 'a')).toBe(300);
  });

  it('đất vừa mua trong cùng chuỗi đổ đôi: thẻ đưa về lại cũng chưa được nâng', () => {
    let s = newGame();
    setPlayer(s, 'a', { position: 28 });
    s = roll(s, 2, 2); // tới ô 32, đổ đôi
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 32 });
    s = act(s, { type: 'buy', playerId: 'a' });
    expect(s.pending).toEqual(LUOT_A);
    topCard(s, 'chance-landmark');
    s = roll(s, 1, 3); // tới ô 36, rút thẻ, tiến vòng qua ô 00 về ô 32
    expect(player(s, 'a').position).toBe(32);
    expect(cash(s, 'a')).toBe(400);
    expect(capO(s, 32)).toBe(0);
    expect(s.pending).toEqual(LUOT_B);
  });
});

describe('thẻ đi đến ô cố định khi đổ đôi (mục 3)', () => {
  it('đổ đôi tới ô Cơ Hội, thẻ đưa đi ô khác: vẫn được thêm lượt', () => {
    let s = rutDoi(newGame(), 'chance-thap-rua', 7);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 9 });
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(s.pending).toEqual(LUOT_A);
  });
});

// ---------------------------------------------------------------------------
// Thẻ 07 Về điểm xuất phát
// ---------------------------------------------------------------------------

describe('thẻ 07 Về điểm xuất phát (mục 8, mục 1)', () => {
  it.each([7, 22, 36] as const)('từ ô %i đến ô 00, nhận đúng 200Đ một lần', (at) => {
    const s = rut(newGame(), 'chance-go', at);
    expect(player(s, 'a').position).toBe(0);
    expect(cash(s, 'a')).toBe(700);
    expect(totalCash(s)).toBe(1200);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('đổ đôi rồi rút thẻ: nhận 200Đ, được đổ tiếp từ ô 00 và không nhận thêm khi rời ô 00', () => {
    let s = rutDoi(newGame(), 'chance-go', 7);
    expect(cash(s, 'a')).toBe(700);
    expect(s.pending).toEqual(LUOT_A);
    s = roll(s, 1, 2);
    expect(player(s, 'a').position).toBe(3);
    expect(cash(s, 'a')).toBe(700);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 3 });
  });
});

// ---------------------------------------------------------------------------
// Thẻ 03 Đất gần nhất
// ---------------------------------------------------------------------------

describe('thẻ 03 Đất gần nhất: đất vô chủ bắt buộc mua (mục 8, mục 10)', () => {
  it.each([
    [7, 8, 100],
    [22, 23, 220],
    [36, 37, 350],
  ] as const)('từ ô %i tới ô %i vô chủ: tự động mua %iĐ, không hỏi', (at, target, price) => {
    const s = rut(newGame(), 'chance-nearest-property', at);
    expect(player(s, 'a').position).toBe(target);
    expect(chuO(s, target)).toBe('a');
    expect(s.tiles[target]).toMatchObject({ level: 0, mortgaged: false });
    expect(cash(s, 'a')).toBe(500 - price);
    expect(totalCash(s)).toBe(1000 - price);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('vừa đủ tiền mặt (350Đ cho Tháp Chăm): mua xong còn 0Đ', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 350 });
    const s = rut(s0, 'chance-nearest-property', 36);
    expect(chuO(s, 37)).toBe('a');
    expect(cash(s, 'a')).toBe(0);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('thiếu tiền: thành nợ Ngân hàng, Xử lý nợ rồi trả đủ mới nhận đất', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 300 });
    own(s0, 'a', 6);
    let s = rut(s0, 'chance-nearest-property', 36);
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      total: 350,
      creditors: [{ playerId: null, amount: 350 }],
    });
    expect(chuO(s, 37)).toBeNull();
    reject(s, { type: 'pay', playerId: 'a' });
    s = act(s, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 6 }] });
    expect(cash(s, 'a')).toBe(350);
    s = tra(s);
    expect(chuO(s, 37)).toBe('a');
    expect(cash(s, 'a')).toBe(0);
    expect(cash(s, 'b')).toBe(500);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('thẻ Đất gần nhất: không thể hoàn tác mua khi thiếu tiền', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 300 });
    own(s0, 'a', 6);
    const s = rut(s0, 'chance-nearest-property', 36);
    reject(s, { type: 'cancelPurchase', playerId: 'a' });
    expect(s.pending).toMatchObject({ type: 'pay', reason: 'purchase', grantTile: 37 });
  });

  it('thẻ Ga gần nhất: không thể hoàn tác mua khi thiếu tiền', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 150 });
    own(s0, 'a', 9);
    const s = rut(s0, 'chance-nearest-station', 36);
    reject(s, { type: 'cancelPurchase', playerId: 'a' });
    expect(s.pending).toMatchObject({ type: 'pay', reason: 'purchase', grantTile: 5 });
  });

  it('đang nợ tiền mua thì chưa sở hữu ô đó nên không cắm được nó để trả', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 300 });
    own(s0, 'a', 6);
    const s = rut(s0, 'chance-nearest-property', 36);
    reject(s, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 37 }] });
  });

  it('tiền mặt cộng giá thanh lý tối đa (bán 55%) nhỏ hơn giá đất 1Đ: phá sản ngay', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 96 }); // 96 + 220 (bán Phú Quốc) + 33 (bán Phố Cổ) = 349 < 350
    own(s0, 'a', 39);
    own(s0, 'a', 1);
    const s = rut(s0, 'chance-nearest-property', 36);
    expect(s.pending.type).toBe('ended');
    expect(s.loserId).toBe('a');
  });

  it('tiền mặt cộng giá thanh lý tối đa vừa bằng giá đất: không phá sản, bán hết để trả', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 97 }); // 97 + 220 + 33 = 350
    own(s0, 'a', 39);
    own(s0, 'a', 1);
    let s = rut(s0, 'chance-nearest-property', 36);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 350 });
    s = act(s, {
      type: 'manage',
      playerId: 'a',
      ops: [
        { op: 'sell', tile: 39 },
        { op: 'sell', tile: 1 },
      ],
    });
    expect(cash(s, 'a')).toBe(350);
    s = tra(s);
    expect(cash(s, 'a')).toBe(0);
    expect(chuO(s, 37)).toBe('a');
    expect(chuO(s, 39)).toBeNull();
    expect(chuO(s, 1)).toBeNull();
  });

  it('hết giờ khi đang nợ tiền mua: máy chủ cắm ô rẻ trước đến khi đủ rồi tự trả (mục 11)', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 300 });
    own(s0, 'a', 1);
    own(s0, 'a', 3);
    let s = rut(s0, 'chance-nearest-property', 36);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 350 });
    s = act(s, { type: 'timeout' });
    expect(chuO(s, 37)).toBe('a');
    expect(cash(s, 'a')).toBe(10);
    expect(s.tiles[1]).toMatchObject({ owner: 'a', mortgaged: true });
    expect(s.tiles[3]).toMatchObject({ owner: 'a', mortgaged: true });
    expect(s.pending).toEqual(LUOT_B);
  });

  it('đất bắt buộc mua tính là vừa mua: dừng lại nó trong cùng lượt (Metro) chưa được nâng', () => {
    let s = rutDoi(newGame(), 'chance-nearest-property', 7);
    expect(chuO(s, 8)).toBe('a');
    expect(cash(s, 'a')).toBe(400);
    expect(s.pending).toEqual(LUOT_A);
    s = roll(s, 1, 1); // ô 8 → ô 10, đôi lần 2
    expect(s.pending).toEqual({ type: 'metro', playerId: 'a' });
    s = act(s, { type: 'metro', playerId: 'a', destination: 8 });
    expect(cash(s, 'a')).toBe(200);
    expect(capO(s, 8)).toBe(0);
    expect(s.pending).toEqual(LUOT_A);
  });
});

describe('thẻ 03 Đất gần nhất: đất đã có chủ (mục 8)', () => {
  it('của người khác đang hoạt động: gieo 2 viên mới, trả 10 × tổng (không phải tiền thuê)', () => {
    const s0 = newGame();
    own(s0, 'b', 37, { level: 5 }); // tiền thuê khách sạn 1500Đ không được dùng
    let s = rut(s0, 'chance-nearest-property', 36, [5, 6]);
    s = traHet(s);
    expect(cash(s, 'a')).toBe(390);
    expect(cash(s, 'b')).toBe(610);
    expect(chuO(s, 37)).toBe('b');
    expect(capO(s, 37)).toBe(5);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('dùng 2 viên mới chứ không dùng 2 viên vừa đổ để đi', () => {
    const s0 = newGame();
    own(s0, 'b', 8);
    let s = rut(s0, 'chance-nearest-property', 7, [1, 1]);
    s = traHet(s);
    expect(cash(s, 'a')).toBe(480);
    expect(cash(s, 'b')).toBe(520);
  });

  it('của người khác đang cắm: 0Đ, không gieo xúc xắc', () => {
    const s0 = newGame();
    own(s0, 'b', 23, { mortgaged: true });
    const s = rut(s0, 'chance-nearest-property', 22);
    expect(player(s, 'a').position).toBe(23);
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('đất của mình: 0Đ và vẫn được nâng 1 cấp như bình thường', () => {
    const s0 = newGame();
    own(s0, 'a', 8, { level: 1 });
    let s = rut(s0, 'chance-nearest-property', 7);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toMatchObject({ type: 'upgrade', playerId: 'a', tile: 8 });
    s = act(s, { type: 'upgrade', playerId: 'a' });
    expect(capO(s, 8)).toBe(2);
    expect(cash(s, 'a')).toBe(450);
  });

  it('đất của mình đang cắm: 0Đ, được chuộc và xây 1 nhà cùng lúc (55 + 50)', () => {
    const s0 = newGame();
    own(s0, 'a', 8, { mortgaged: true });
    let s = rut(s0, 'chance-nearest-property', 7);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toMatchObject({ type: 'upgrade', playerId: 'a', tile: 8 });
    s = act(s, { type: 'upgrade', playerId: 'a' });
    expect(s.tiles[8]).toMatchObject({ owner: 'a', mortgaged: false, level: 1 });
    expect(cash(s, 'a')).toBe(395);
  });

  it('thiếu tiền trả 10 × xúc xắc: nợ người chủ, cắm đủ mới trả được', () => {
    const s0 = newGame();
    own(s0, 'b', 8);
    own(s0, 'a', 9);
    own(s0, 'a', 6);
    setPlayer(s0, 'a', { cash: 50 });
    let s = rut(s0, 'chance-nearest-property', 7, [6, 6]);
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      total: 120,
      creditors: [{ playerId: 'b', amount: 120 }],
    });
    s = act(s, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 9 }] });
    expect(cash(s, 'a')).toBe(110);
    reject(s, { type: 'pay', playerId: 'a' });
    s = act(s, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 6 }] });
    s = tra(s);
    expect(cash(s, 'a')).toBe(40);
    expect(cash(s, 'b')).toBe(620);
  });

  it('không đủ khả năng trả 10 × xúc xắc: phá sản ngay', () => {
    const s0 = newGame();
    own(s0, 'b', 8);
    setPlayer(s0, 'a', { cash: 100 });
    const s = rut(s0, 'chance-nearest-property', 7, [6, 5]);
    expect(s.pending.type).toBe('ended');
    expect(s.loserId).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// Thẻ 10 Đến ga gần nhất
// ---------------------------------------------------------------------------

describe('thẻ 10 Đến ga gần nhất (mục 8, mục 10)', () => {
  it.each([
    [7, 15],
    [22, 25],
  ] as const)('từ ô %i tới ga %i vô chủ: bắt buộc mua 200Đ', (at, target) => {
    const s = rut(newGame(), 'chance-nearest-station', at);
    expect(player(s, 'a').position).toBe(target);
    expect(chuO(s, target)).toBe('a');
    expect(cash(s, 'a')).toBe(300);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('từ ô 36 tiến qua ô 00 tới ga 05: không nhận 200Đ', () => {
    const s = rut(newGame(), 'chance-nearest-station', 36);
    expect(player(s, 'a').position).toBe(5);
    expect(chuO(s, 5)).toBe('a');
    expect(cash(s, 'a')).toBe(300);
  });

  it('từ ô 36 với 150Đ: không có 200Đ qua ô 00 nên thiếu tiền mua ga, thành nợ', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 150 });
    own(s0, 'a', 9); // bán được 66Đ, đủ để không phá sản ngay
    const s = rut(s0, 'chance-nearest-station', 36);
    expect(cash(s, 'a')).toBe(150);
    expect(chuO(s, 5)).toBeNull();
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      total: 200,
      creditors: [{ playerId: null, amount: 200 }],
    });
  });

  it('vừa đủ 200Đ: mua xong còn 0Đ', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 200 });
    const s = rut(s0, 'chance-nearest-station', 7);
    expect(chuO(s, 15)).toBe('a');
    expect(cash(s, 'a')).toBe(0);
  });

  it('không đủ khả năng mua ga (100 + 33 < 200): phá sản ngay', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 100 });
    own(s0, 'a', 1);
    const s = rut(s0, 'chance-nearest-station', 7);
    expect(s.pending.type).toBe('ended');
    expect(s.loserId).toBe('a');
  });

  it('ga của người khác đang hoạt động: gieo 2 viên mới, trả 10 × tổng (không phải 25Đ)', () => {
    const s0 = newGame();
    own(s0, 'b', 15);
    let s = rut(s0, 'chance-nearest-station', 7, [2, 3]);
    s = traHet(s);
    expect(cash(s, 'a')).toBe(450);
    expect(cash(s, 'b')).toBe(550);
  });

  it('chủ có đủ 4 ga: vẫn chỉ trả 10 × xúc xắc (không phải 200Đ)', () => {
    const s0 = newGame();
    for (const i of [5, 15, 25, 35]) own(s0, 'b', i);
    let s = rut(s0, 'chance-nearest-station', 22, [1, 1]);
    s = traHet(s);
    expect(cash(s, 'a')).toBe(480);
    expect(cash(s, 'b')).toBe(520);
  });

  it('ga của người khác đang cắm: không trả gì, không gieo', () => {
    const s0 = newGame();
    own(s0, 'b', 15, { mortgaged: true });
    const s = rut(s0, 'chance-nearest-station', 7);
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('ga của mình: không trả gì, không gieo', () => {
    const s0 = newGame();
    own(s0, 'a', 25);
    const s = rut(s0, 'chance-nearest-station', 22);
    expect(player(s, 'a').position).toBe(25);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual(LUOT_B);
  });
});

// ---------------------------------------------------------------------------
// Thẻ 05 Tàu bay xúc xắc
// ---------------------------------------------------------------------------

describe('thẻ 05 Tàu bay xúc xắc (mục 8, mục 1, mục 4)', () => {
  it('hai viên chẵn: tiến 2 rồi tiến 4 (07 → 09 → 13)', () => {
    const s = rut(newGame(), 'chance-fly-dice', 7, [2, 4]);
    expect(player(s, 'a').position).toBe(13);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 13 });
  });

  it('hai viên lẻ: lùi 1 rồi lùi 3 (07 → 06 → 03)', () => {
    const s = rut(newGame(), 'chance-fly-dice', 7, [1, 3]);
    expect(player(s, 'a').position).toBe(3);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 3 });
  });

  it('chỉ xử lý ô cuối: ô dừng giữa chừng (khách sạn của người khác) không thu tiền', () => {
    const s0 = newGame();
    own(s0, 'b', 9, { level: 5 });
    own(s0, 'b', 6);
    let s = rut(s0, 'chance-fly-dice', 7, [2, 3]); // 07 → 09 → 06
    expect(player(s, 'a').position).toBe(6);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 6 });
    s = tra(s);
    expect(cash(s, 'a')).toBe(494);
    expect(cash(s, 'b')).toBe(506);
  });

  it('dừng đúng ô 00 ở viên 1 rồi lùi: vẫn nhận 200Đ (36 → 00 → 37)', () => {
    const s = rut(newGame(), 'chance-fly-dice', 36, [4, 3]);
    expect(player(s, 'a').position).toBe(37);
    expect(cash(s, 'a')).toBe(700);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 37 });
  });

  it('thứ tự viên 1 rồi viên 2: (1, 4) từ ô 36 không qua ô 00, còn (4, 1) thì có', () => {
    const s1 = rut(newGame(), 'chance-fly-dice', 36, [1, 4]); // 36 → 35 → 39
    expect(player(s1, 'a').position).toBe(39);
    expect(cash(s1, 'a')).toBe(500);
    const s2 = rut(newGame(), 'chance-fly-dice', 36, [4, 1]); // 36 → 00 → 39
    expect(player(s2, 'a').position).toBe(39);
    expect(cash(s2, 'a')).toBe(700);
  });

  it('tiến qua ô 00 rồi lùi qua ô 00: chỉ nhận 200Đ một lần, lùi không mất và không nhận', () => {
    const s = rut(newGame(), 'chance-fly-dice', 36, [6, 3]); // 36 → 02 → 39
    expect(player(s, 'a').position).toBe(39);
    expect(cash(s, 'a')).toBe(700);
  });

  it('lùi trước rồi tiến qua ô 00: nhận 200Đ (36 → 35 → 01)', () => {
    const s = rut(newGame(), 'chance-fly-dice', 36, [1, 6]);
    expect(player(s, 'a').position).toBe(1);
    expect(cash(s, 'a')).toBe(700);
  });

  it('hai lần tiến, lần 2 dừng đúng ô 00: nhận 200Đ đúng một lần (36 → 38 → 00)', () => {
    const s = rut(newGame(), 'chance-fly-dice', 36, [2, 2]);
    expect(player(s, 'a').position).toBe(0);
    expect(cash(s, 'a')).toBe(700);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('ô thuế dừng giữa chừng không thu; ô cuối là Khí Vận thì rút thẻ Khí Vận', () => {
    const s0 = newGame();
    topCard(s0, 'community-singing');
    const s = rut(s0, 'chance-fly-dice', 36, [2, 5]); // 36 → 38 → 33
    expect(player(s, 'a').position).toBe(33);
    expect(cash(s, 'a')).toBe(530);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('ô cuối là Vào Tù (30): vào tù, không nhận 200Đ', () => {
    const s = rut(newGame(), 'chance-fly-dice', 36, [1, 5]); // 36 → 35 → 30
    expect(player(s, 'a').position).toBe(10);
    expect(player(s, 'a').inJail).toBe(true);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('ô cuối là ô 10 khi không bị giam: được chọn Metro', () => {
    const s = rut(newGame(), 'chance-fly-dice', 7, [4, 1]); // 07 → 11 → 10
    expect(player(s, 'a').position).toBe(10);
    expect(player(s, 'a').inJail).toBe(false);
    expect(s.pending).toEqual({ type: 'metro', playerId: 'a' });
  });

  it('ô cuối là nhà máy của người khác: gieo 2 viên mới để tính (× 4)', () => {
    const s0 = newGame();
    own(s0, 'b', 12);
    let s = rut(s0, 'chance-fly-dice', 7, [6, 1, 5, 6]); // 07 → 13 → 12, gieo 5 + 6
    expect(player(s, 'a').position).toBe(12);
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      total: 44,
      creditors: [{ playerId: 'b', amount: 44 }],
    });
    s = tra(s);
    expect(cash(s, 'a')).toBe(456);
    expect(cash(s, 'b')).toBe(544);
  });

  it('ô cuối là nhà máy, chủ có cả 2 nhà máy: 2 viên mới × 10', () => {
    const s0 = newGame();
    own(s0, 'b', 12);
    own(s0, 'b', 28);
    let s = rut(s0, 'chance-fly-dice', 36, [5, 3, 1, 2]); // 36 → 31 → 28, gieo 1 + 2
    expect(player(s, 'a').position).toBe(28);
    s = traHet(s);
    expect(cash(s, 'a')).toBe(470);
    expect(cash(s, 'b')).toBe(530);
  });

  it('xúc xắc của thẻ ra đôi không cho thêm lượt (lần đổ đi không phải đôi)', () => {
    let s = rut(newGame(), 'chance-fly-dice', 7, [2, 2]); // 07 → 09 → 11
    expect(player(s, 'a').position).toBe(11);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 11 });
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(s.pending).toEqual(LUOT_B);
  });
});

// ---------------------------------------------------------------------------
// Thẻ 06 Trả tiền điện
// ---------------------------------------------------------------------------

describe('thẻ 06 Trả tiền điện (mục 8)', () => {
  it('không có nhà nào (đất trống, đất cắm): không trả gì', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    own(s0, 'a', 6, { mortgaged: true });
    own(s0, 'b', 12);
    const s = rut(s0, 'chance-electricity', 7);
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('5 nhà, Nhà Máy Điện vô chủ: trả 125Đ, toàn bộ cho Ngân hàng', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { level: 3 });
    own(s0, 'a', 6, { level: 2 });
    const s = rut(s0, 'chance-electricity', 7);
    expect(cash(s, 'a')).toBe(375);
    expect(cash(s, 'b')).toBe(500);
    expect(totalCash(s)).toBe(875);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('khách sạn tính 100Đ (không cộng thêm 4 nhà); 4 nhà tính 100Đ', () => {
    const s0 = newGame();
    own(s0, 'a', 9, { level: 5 });
    own(s0, 'a', 3, { level: 4 });
    const s = rut(s0, 'chance-electricity', 22);
    expect(cash(s, 'a')).toBe(300);
  });

  it('chủ Nhà Máy Điện đang hoạt động (người khác) nhận 20%, còn lại trả Ngân hàng', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { level: 3 });
    own(s0, 'a', 6, { level: 2 });
    own(s0, 'b', 12);
    const s = rut(s0, 'chance-electricity', 7);
    expect(cash(s, 'a')).toBe(375);
    expect(cash(s, 'b')).toBe(525);
    expect(totalCash(s)).toBe(900);
  });

  it('Nhà Máy Điện đang cắm: chủ không nhận gì, trả hết cho Ngân hàng', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { level: 3 });
    own(s0, 'a', 6, { level: 2 });
    own(s0, 'b', 12, { mortgaged: true });
    const s = rut(s0, 'chance-electricity', 7);
    expect(cash(s, 'a')).toBe(375);
    expect(cash(s, 'b')).toBe(500);
  });

  it('chủ Nhà Máy Nước (28) không được chia tiền điện', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { level: 3 });
    own(s0, 'a', 6, { level: 2 });
    own(s0, 'b', 28);
    const s = rut(s0, 'chance-electricity', 7);
    expect(cash(s, 'a')).toBe(375);
    expect(cash(s, 'b')).toBe(500);
  });

  it('người rút là chủ Nhà Máy Điện: vẫn nhận 20% của chính mình (trả ròng 100 trên 125)', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { level: 3 });
    own(s0, 'a', 6, { level: 2 });
    own(s0, 'a', 12);
    const s = rut(s0, 'chance-electricity', 7);
    expect(cash(s, 'a')).toBe(400);
    expect(cash(s, 'b')).toBe(500);
  });

  it('chỉ tính nhà của người rút; 3 người, chủ nhà máy là người thứ ba', () => {
    const s0 = newGame(3);
    own(s0, 'a', 1, { level: 1 });
    own(s0, 'b', 11, { level: 3 });
    own(s0, 'c', 12);
    const s = rut(s0, 'chance-electricity', 7);
    expect(cash(s, 'a')).toBe(475);
    expect(cash(s, 'b')).toBe(500);
    expect(cash(s, 'c')).toBe(505);
  });

  it('thiếu tiền: thành nợ, hạ nhà để trả', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 50 });
    own(s0, 'a', 1, { level: 3 });
    let s = rut(s0, 'chance-electricity', 7);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 75 });
    expect(cash(s, 'a')).toBe(50);
    s = act(s, { type: 'manage', playerId: 'a', ops: [{ op: 'downgrade', tile: 1 }] });
    s = tra(s);
    expect(cash(s, 'a')).toBe(0);
    expect(capO(s, 1)).toBe(2);
    expect(s.pending).toEqual(LUOT_B);
  });
});

// ---------------------------------------------------------------------------
// Thẻ 08 Miễn thuế nhà đất
// ---------------------------------------------------------------------------

describe('thẻ 08 Miễn thuế nhà đất (mục 8)', () => {
  it('rút: giữ thẻ, thẻ không còn trong chồng, tiền không đổi', () => {
    const s = rut(newGame(), 'chance-rent-waiver', 7);
    expect(player(s, 'a').heldCards).toEqual([
      { cardId: 'chance-rent-waiver', kind: 'rentWaiver' },
    ]);
    expect(s.decks.chance).not.toContain('chance-rent-waiver');
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('lần trả tiền thuê đất màu của người khác kế tiếp: tự động miễn, thẻ quay lại chồng', () => {
    const s0 = newGame();
    own(s0, 'b', 11, { level: 1 });
    let s = rut(s0, 'chance-rent-waiver', 7);
    s = luotNhanh(s);
    s = roll(s, 1, 3); // ô 07 → 11, tiền thuê 50Đ
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(player(s, 'a').heldCards).toEqual([]);
    expect(s.decks.chance).toContain('chance-rent-waiver');
    expect(s.pending).toEqual(LUOT_B);
  });

  it('bắt buộc dùng cả khi tiền thuê chỉ 2Đ (Phố Cổ đất trống)', () => {
    const s0 = newGame();
    giuThe(s0, 'a', 'chance-rent-waiver', 'rentWaiver');
    own(s0, 'b', 1);
    setPlayer(s0, 'a', { position: 38 });
    const s = roll(s0, 1, 2); // 38 → 01, qua ô 00
    expect(cash(s, 'a')).toBe(700);
    expect(cash(s, 'b')).toBe(500);
    expect(theDangGiu(s, 'a')).toEqual([]);
  });

  it('không dùng cho ga: trả tiền thuê ga, vẫn giữ thẻ', () => {
    const s0 = newGame();
    giuThe(s0, 'a', 'chance-rent-waiver', 'rentWaiver');
    own(s0, 'b', 5);
    let s = roll(s0, 2, 3);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 25 });
    s = tra(s);
    expect(cash(s, 'a')).toBe(475);
    expect(theDangGiu(s, 'a')).toEqual(['rentWaiver']);
  });

  it('không dùng cho nhà máy: trả tiền nhà máy, vẫn giữ thẻ', () => {
    const s0 = newGame();
    giuThe(s0, 'a', 'chance-rent-waiver', 'rentWaiver');
    own(s0, 'b', 12);
    setPlayer(s0, 'a', { position: 7 });
    let s = roll(s0, 2, 3); // tới ô 12, 5 × 4 = 20
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 20 });
    s = tra(s);
    expect(cash(s, 'a')).toBe(480);
    expect(theDangGiu(s, 'a')).toEqual(['rentWaiver']);
  });

  it('đất màu của người khác đang cắm: không có tiền thuê nên không dùng thẻ', () => {
    const s0 = newGame();
    giuThe(s0, 'a', 'chance-rent-waiver', 'rentWaiver');
    own(s0, 'b', 11, { mortgaged: true });
    setPlayer(s0, 'a', { position: 7 });
    const s = roll(s0, 1, 3);
    expect(cash(s, 'a')).toBe(500);
    expect(theDangGiu(s, 'a')).toEqual(['rentWaiver']);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('đất của mình: không dùng thẻ', () => {
    const s0 = newGame();
    giuThe(s0, 'a', 'chance-rent-waiver', 'rentWaiver');
    own(s0, 'a', 11);
    setPlayer(s0, 'a', { position: 7 });
    let s = roll(s0, 1, 3);
    expect(s.pending).toMatchObject({ type: 'upgrade', playerId: 'a', tile: 11 });
    s = act(s, { type: 'skipUpgrade', playerId: 'a' });
    expect(theDangGiu(s, 'a')).toEqual(['rentWaiver']);
  });

  it('dùng được khi thẻ khác đưa tới đất người khác (Đi đến Tháp Rùa)', () => {
    const s0 = newGame();
    giuThe(s0, 'a', 'chance-rent-waiver', 'rentWaiver');
    own(s0, 'b', 9, { level: 2 });
    const s = rut(s0, 'chance-thap-rua', 7);
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(theDangGiu(s, 'a')).toEqual([]);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('không áp dụng cho khoản 10 × xúc xắc của thẻ Đất gần nhất: trả và vẫn giữ thẻ', () => {
    const s0 = newGame();
    giuThe(s0, 'a', 'chance-rent-waiver', 'rentWaiver');
    own(s0, 'b', 8);
    let s = rut(s0, 'chance-nearest-property', 7, [2, 3]);
    s = traHet(s);
    expect(cash(s, 'a')).toBe(450);
    expect(cash(s, 'b')).toBe(550);
    expect(theDangGiu(s, 'a')).toEqual(['rentWaiver']);
  });
});

// ---------------------------------------------------------------------------
// Thẻ 09 Xổ số, 11 Hỏng đường ray, 13 Diễn kịch giỏi
// ---------------------------------------------------------------------------

describe('thẻ 09 Xổ số kiến thiết (mục 8)', () => {
  it.each([
    [1, 5],
    [2, 50],
    [3, 150],
    [4, 5],
    [5, 50],
    [6, 150],
  ] as const)('gieo %i: nhận %iĐ từ Ngân hàng', (die, prize) => {
    const s = rut(newGame(), 'chance-lottery', 7, [die]);
    expect(cash(s, 'a')).toBe(500 + prize);
    expect(cash(s, 'b')).toBe(500);
    expect(player(s, 'a').position).toBe(7);
    expect(s.pending).toEqual(LUOT_B);
  });
});

describe('thẻ 11 Hỏng đường ray (mục 8)', () => {
  it('không có ga: không trả gì', () => {
    const s = rut(newGame(), 'chance-railway-repair', 7);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual(LUOT_B);
  });

  it.each([
    [1, 25],
    [2, 50],
    [3, 100],
    [4, 200],
  ] as const)('%i ga đang hoạt động: trả Ngân hàng %iĐ', (n, fee) => {
    const s0 = newGame();
    for (const i of [5, 15, 25, 35].slice(0, n)) own(s0, 'a', i);
    const s = rut(s0, 'chance-railway-repair', 7);
    expect(cash(s, 'a')).toBe(500 - fee);
    expect(cash(s, 'b')).toBe(500);
  });

  it('ga đang cắm không tính: 3 ga, 1 ga cắm → trả 50Đ', () => {
    const s0 = newGame();
    own(s0, 'a', 5);
    own(s0, 'a', 15);
    own(s0, 'a', 25, { mortgaged: true });
    const s = rut(s0, 'chance-railway-repair', 7);
    expect(cash(s, 'a')).toBe(450);
  });

  it('cả 4 ga đều cắm: không trả gì', () => {
    const s0 = newGame();
    for (const i of [5, 15, 25, 35]) own(s0, 'a', i, { mortgaged: true });
    const s = rut(s0, 'chance-railway-repair', 22);
    expect(cash(s, 'a')).toBe(500);
  });

  it('ga của người khác không tính cho người rút', () => {
    const s0 = newGame();
    for (const i of [5, 15, 25, 35]) own(s0, 'b', i);
    const s = rut(s0, 'chance-railway-repair', 7);
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
  });

  it('thiếu tiền: thành nợ Ngân hàng; số tiền đã tính lúc rút, cắm ga sau đó không giảm nợ', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 10 });
    own(s0, 'a', 5);
    own(s0, 'a', 15);
    let s = rut(s0, 'chance-railway-repair', 7);
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      total: 50,
      creditors: [{ playerId: null, amount: 50 }],
    });
    s = act(s, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 5 }] });
    s = tra(s);
    expect(cash(s, 'a')).toBe(60);
    expect(s.pending).toEqual(LUOT_B);
  });
});

describe('thẻ 13 Diễn kịch giỏi (mục 8)', () => {
  it('nhận 50Đ từ Ngân hàng, đứng yên ở ô Cơ Hội', () => {
    const s = rut(newGame(), 'chance-acting', 36);
    expect(cash(s, 'a')).toBe(550);
    expect(totalCash(s)).toBe(1050);
    expect(player(s, 'a').position).toBe(36);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('đổ đôi rồi rút: nhận 50Đ và vẫn được thêm lượt', () => {
    const s = rutDoi(newGame(), 'chance-acting', 22);
    expect(cash(s, 'a')).toBe(550);
    expect(s.pending).toEqual(LUOT_A);
  });

  it('người khác giữ Kẻ khóc người cười: người rút nhận 50Đ thì người giữ trả họ 40Đ (mục 9)', () => {
    const s0 = newGame();
    giuThe(s0, 'b', 'community-fortune-mirror', 'fortuneMirror');
    const s = rut(s0, 'chance-acting', 7);
    expect(cash(s, 'a')).toBe(590);
    expect(cash(s, 'b')).toBe(460);
    expect(theDangGiu(s, 'b')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Thẻ 14 Nhảy lò cò
// ---------------------------------------------------------------------------

describe('thẻ 14 Nhảy lò cò (mục 8)', () => {
  it('từ ô 07 lùi 3 ô tới ô 04: xử lý ô thuế 200Đ, không nhận 200Đ', () => {
    let s = rut(newGame(), 'chance-hopscotch', 7);
    expect(player(s, 'a').position).toBe(4);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      total: 200,
      creditors: [{ playerId: null, amount: 200 }],
    });
    s = tra(s);
    expect(cash(s, 'a')).toBe(300);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('từ ô 22 lùi tới ô 19 vô chủ: được mời mua', () => {
    const s = rut(newGame(), 'chance-hopscotch', 22);
    expect(player(s, 'a').position).toBe(19);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 19 });
  });

  it('từ ô 22 lùi tới ô 19 của người khác (1 nhà): trả 80Đ', () => {
    const s0 = newGame();
    own(s0, 'b', 19, { level: 1 });
    let s = rut(s0, 'chance-hopscotch', 22);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 80 });
    s = tra(s);
    expect(cash(s, 'a')).toBe(420);
    expect(cash(s, 'b')).toBe(580);
  });

  it('từ ô 36 lùi tới ô 33: rút thẻ Khí Vận và làm theo', () => {
    const s0 = newGame();
    topCard(s0, 'community-singing');
    const s = rut(s0, 'chance-hopscotch', 36);
    expect(player(s, 'a').position).toBe(33);
    expect(cash(s, 'a')).toBe(530);
    expect(s.decks.community).not.toContain('community-singing');
  });
});

// ---------------------------------------------------------------------------
// Thẻ 15 Vào tù là rõ
// ---------------------------------------------------------------------------

describe('thẻ 15 Vào tù là rõ (mục 8)', () => {
  it.each([7, 22, 36] as const)(
    'từ ô %i: đến ô 10, bị giam, không nhận 200Đ, không Metro',
    (at) => {
      let s = rut(newGame(), 'chance-jail', at);
      expect(player(s, 'a').position).toBe(10);
      expect(player(s, 'a').inJail).toBe(true);
      expect(cash(s, 'a')).toBe(500);
      expect(s.pending).toEqual(LUOT_B);
      s = luotNhanh(s);
      expect(s.pending).toEqual({ type: 'jail', playerId: 'a' });
    },
  );

  it('rút khi đang đổ đôi: vào tù nên mất lượt thêm', () => {
    const s = rutDoi(newGame(), 'chance-jail', 7);
    expect(player(s, 'a').inJail).toBe(true);
    expect(s.pending).toEqual(LUOT_B);
  });
});

// ---------------------------------------------------------------------------
// Thẻ 17 Người thủ đô
// ---------------------------------------------------------------------------

describe('thẻ 17 Người thủ đô (mục 8)', () => {
  it('đang sở hữu Phố Cổ khi rút: giữ quyền miễn thuế, thẻ không còn trong chồng', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    const s = rut(s0, 'chance-capital-citizen', 7);
    expect(theDangGiu(s, 'a')).toEqual(['taxWaiver']);
    expect(s.decks.chance).not.toContain('chance-capital-citizen');
    expect(cash(s, 'a')).toBe(500);
  });

  it('Phố Cổ đang cắm vẫn tính là sở hữu', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { mortgaged: true });
    const s = rut(s0, 'chance-capital-citizen', 22);
    expect(theDangGiu(s, 'a')).toEqual(['taxWaiver']);
  });

  it('không sở hữu Phố Cổ (vô chủ): thẻ không có tác dụng', () => {
    const s = rut(newGame(), 'chance-capital-citizen', 7);
    expect(theDangGiu(s, 'a')).toEqual([]);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('Phố Cổ của người khác: thẻ không có tác dụng với ai', () => {
    const s0 = newGame();
    own(s0, 'b', 1);
    const s = rut(s0, 'chance-capital-citizen', 7);
    expect(theDangGiu(s, 'a')).toEqual([]);
    expect(theDangGiu(s, 'b')).toEqual([]);
  });

  it('tự dùng ở lần kế tiếp dừng ô 04: không trả thuế, quyền hết', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    giuThe(s0, 'a', 'chance-capital-citizen', 'taxWaiver');
    const s = roll(s0, 1, 3);
    expect(player(s, 'a').position).toBe(4);
    expect(cash(s, 'a')).toBe(500);
    expect(theDangGiu(s, 'a')).toEqual([]);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('tự dùng ở lần kế tiếp dừng ô 38', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    giuThe(s0, 'a', 'chance-capital-citizen', 'taxWaiver');
    setPlayer(s0, 'a', { position: 34 });
    const s = roll(s0, 1, 3);
    expect(player(s, 'a').position).toBe(38);
    expect(cash(s, 'a')).toBe(500);
    expect(theDangGiu(s, 'a')).toEqual([]);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('chỉ miễn một lần: lần dừng ô thuế sau đó phải trả', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    giuThe(s0, 'a', 'chance-capital-citizen', 'taxWaiver');
    let s = roll(s0, 1, 3); // ô 04, dùng quyền
    s = luotNhanh(s);
    setPlayer(s, 'a', { position: 34 });
    s = roll(s, 1, 3); // ô 38
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 100 });
  });

  it('bán Phố Cổ trước khi dùng: quyền hết hiệu lực, dừng ô 04 phải trả 200Đ', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    giuThe(s0, 'a', 'chance-capital-citizen', 'taxWaiver');
    let s = act(s0, { type: 'manage', playerId: 'a', ops: [{ op: 'sell', tile: 1 }] });
    expect(cash(s, 'a')).toBe(533);
    expect(theDangGiu(s, 'a')).toEqual([]);
    s = roll(s, 1, 3);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 200 });
    s = tra(s);
    expect(cash(s, 'a')).toBe(333);
  });

  it('cắm Phố Cổ sau khi rút: vẫn sở hữu nên quyền vẫn còn', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    let s = rut(s0, 'chance-capital-citizen', 7);
    s = luotNhanh(s);
    s = act(s, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 1 }] });
    expect(cash(s, 'a')).toBe(530);
    setPlayer(s, 'a', { position: 34 });
    s = roll(s, 1, 3);
    expect(player(s, 'a').position).toBe(38);
    expect(cash(s, 'a')).toBe(530);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('dùng cả khi tới ô thuế bằng thẻ Nhảy lò cò (07 → 04)', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    giuThe(s0, 'a', 'chance-capital-citizen', 'taxWaiver');
    const s = rut(s0, 'chance-hopscotch', 7);
    expect(player(s, 'a').position).toBe(4);
    expect(cash(s, 'a')).toBe(500);
    expect(theDangGiu(s, 'a')).toEqual([]);
    expect(s.pending).toEqual(LUOT_B);
  });
});

// ---------------------------------------------------------------------------
// Thẻ 18 Canh bạc xây dựng
// ---------------------------------------------------------------------------

describe('thẻ 18 Canh bạc xây dựng (mục 8, mục 11)', () => {
  it('ít đất màu hơn trung bình: nâng miễn phí 1 cấp ở đất mình chọn (đang hoạt động, chưa khách sạn)', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { level: 1 });
    own(s0, 'a', 9, { level: 5 });
    own(s0, 'a', 11, { mortgaged: true });
    for (const i of [3, 6, 8, 13, 14]) own(s0, 'b', i);
    // a: 3, b: 5, trung bình 4
    let s = rut(s0, 'chance-building-gamble', 7);
    expect(s.pending).toEqual({
      type: 'chooseTile',
      playerId: 'a',
      purpose: 'gambleUp',
      options: [1],
    });
    s = act(s, { type: 'chooseTile', playerId: 'a', tile: 1 });
    expect(capO(s, 1)).toBe(2);
    expect(cash(s, 'a')).toBe(500);
    expect(totalCash(s)).toBe(1000);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('nhiều đất màu hơn trung bình: hạ 1 cấp một đất có công trình do mình chọn, không hoàn tiền', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { level: 2 });
    own(s0, 'a', 3);
    own(s0, 'a', 6, { level: 5 });
    own(s0, 'b', 8);
    // a: 3, b: 1, trung bình 2
    let s = rut(s0, 'chance-building-gamble', 7);
    expect(s.pending).toEqual({
      type: 'chooseTile',
      playerId: 'a',
      purpose: 'gambleDown',
      options: [1, 6],
    });
    s = act(s, { type: 'chooseTile', playerId: 'a', tile: 6 });
    expect(capO(s, 6)).toBe(4);
    expect(capO(s, 1)).toBe(2);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('bằng trung bình: không đổi gì', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { level: 1 });
    own(s0, 'a', 3);
    own(s0, 'b', 6);
    own(s0, 'b', 8, { level: 2 });
    const s = rut(s0, 'chance-building-gamble', 7);
    expect(s.pending).toEqual(LUOT_B);
    expect(capO(s, 1)).toBe(1);
    expect(capO(s, 8)).toBe(2);
  });

  it('trung bình không làm tròn: 1 so với 4/3 là ít hơn (làm tròn thì sẽ bằng)', () => {
    const s0 = newGame(3);
    own(s0, 'a', 1);
    own(s0, 'b', 3);
    own(s0, 'c', 6);
    own(s0, 'c', 8);
    const s = rut(s0, 'chance-building-gamble', 7);
    expect(s.pending).toMatchObject({ type: 'chooseTile', purpose: 'gambleUp', options: [1] });
  });

  it('trung bình không làm tròn: 2 so với 5/3 là nhiều hơn (làm tròn thì sẽ bằng)', () => {
    const s0 = newGame(3);
    own(s0, 'a', 1, { level: 1 });
    own(s0, 'a', 3);
    own(s0, 'b', 6);
    own(s0, 'b', 8);
    own(s0, 'c', 9);
    const s = rut(s0, 'chance-building-gamble', 7);
    expect(s.pending).toMatchObject({ type: 'chooseTile', purpose: 'gambleDown', options: [1] });
  });

  it('đất đang cắm vẫn được đếm', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { level: 2 });
    own(s0, 'a', 3, { mortgaged: true });
    own(s0, 'b', 6);
    // a: 2 (kể cả ô cắm), b: 1, trung bình 1,5 → nhiều hơn
    const s = rut(s0, 'chance-building-gamble', 7);
    expect(s.pending).toMatchObject({ type: 'chooseTile', purpose: 'gambleDown', options: [1] });
  });

  it('chỉ đếm đất màu, không đếm ga và nhà máy', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    for (const i of [5, 15, 25, 35, 12, 28]) own(s0, 'a', i);
    for (const i of [3, 6, 8]) own(s0, 'b', i);
    // a: 1 đất màu, b: 3, trung bình 2 → ít hơn
    const s = rut(s0, 'chance-building-gamble', 7);
    expect(s.pending).toMatchObject({ type: 'chooseTile', purpose: 'gambleUp', options: [1] });
  });

  it('nâng từ 4 nhà lên khách sạn', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { level: 4 });
    for (const i of [3, 6, 8]) own(s0, 'b', i);
    let s = rut(s0, 'chance-building-gamble', 7);
    s = act(s, { type: 'chooseTile', playerId: 'a', tile: 1 });
    expect(capO(s, 1)).toBe(5);
  });

  it('ít hơn nhưng không có đất hợp lệ (chỉ có khách sạn và đất cắm): không đổi', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { level: 5 });
    own(s0, 'a', 3, { mortgaged: true });
    for (const i of [6, 8, 9, 11, 13, 14]) own(s0, 'b', i);
    const s = rut(s0, 'chance-building-gamble', 7);
    expect(s.pending).toEqual(LUOT_B);
    expect(capO(s, 1)).toBe(5);
    expect(s.tiles[3]).toMatchObject({ mortgaged: true, level: 0 });
  });

  it('ít hơn vì không có đất nào: không đổi, không nâng đất người khác', () => {
    const s0 = newGame();
    own(s0, 'b', 6, { level: 1 });
    own(s0, 'b', 8);
    const s = rut(s0, 'chance-building-gamble', 7);
    expect(s.pending).toEqual(LUOT_B);
    expect(capO(s, 6)).toBe(1);
    expect(capO(s, 8)).toBe(0);
  });

  it('nhiều hơn nhưng không có công trình nào: không đổi', () => {
    const s0 = newGame();
    for (const i of [1, 3, 6]) own(s0, 'a', i);
    own(s0, 'b', 8, { level: 3 });
    const s = rut(s0, 'chance-building-gamble', 7);
    expect(s.pending).toEqual(LUOT_B);
    expect(capO(s, 8)).toBe(3);
  });

  it('không chọn được đất ngoài danh sách hợp lệ (khách sạn của mình, đất người khác)', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    own(s0, 'a', 9, { level: 5 });
    for (const i of [3, 6, 8, 11, 13]) own(s0, 'b', i);
    const s = rut(s0, 'chance-building-gamble', 7);
    reject(s, { type: 'chooseTile', playerId: 'a', tile: 9 });
    reject(s, { type: 'chooseTile', playerId: 'a', tile: 3 });
    reject(s, { type: 'chooseTile', playerId: 'b', tile: 1 });
  });

  it('hết giờ: hạ đất hợp lệ có số ô nhỏ nhất', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    own(s0, 'a', 9, { level: 2 });
    own(s0, 'a', 6, { level: 2 });
    own(s0, 'b', 3);
    let s = rut(s0, 'chance-building-gamble', 7);
    expect(s.pending).toMatchObject({ type: 'chooseTile', purpose: 'gambleDown' });
    s = act(s, { type: 'timeout' });
    expect(capO(s, 6)).toBe(1);
    expect(capO(s, 9)).toBe(2);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('hết giờ: nâng đất hợp lệ có số ô nhỏ nhất', () => {
    const s0 = newGame();
    own(s0, 'a', 11, { level: 1 });
    own(s0, 'a', 6);
    for (const i of [1, 3, 8, 9, 13, 14]) own(s0, 'b', i);
    let s = rut(s0, 'chance-building-gamble', 7);
    s = act(s, { type: 'timeout' });
    expect(capO(s, 6)).toBe(1);
    expect(capO(s, 11)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Thẻ 19 Cháy nhà hàng xóm
// ---------------------------------------------------------------------------

describe('thẻ 19 Cháy nhà hàng xóm (mục 8)', () => {
  it('2 người gieo 2 viên mỗi người, cộng lại đếm từ người rút: 07 + 6 = 13 bị hạ 1 cấp, không hoàn tiền', () => {
    const s0 = newGame();
    own(s0, 'b', 13, { level: 3 });
    const s = rut(s0, 'chance-neighbor-fire', 7, [1, 2, 1, 2]);
    expect(capO(s, 13)).toBe(2);
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(player(s, 'a').position).toBe(7);
    expect(player(s, 'b').position).toBe(0);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('đất của chính người rút cũng bị cháy', () => {
    const s0 = newGame();
    own(s0, 'a', 13, { level: 1 });
    const s = rut(s0, 'chance-neighbor-fire', 7, [1, 2, 1, 2]);
    expect(capO(s, 13)).toBe(0);
    expect(chuO(s, 13)).toBe('a');
    expect(cash(s, 'a')).toBe(500);
  });

  it('khách sạn bị cháy còn 4 nhà', () => {
    const s0 = newGame();
    own(s0, 'b', 13, { level: 5 });
    const s = rut(s0, 'chance-neighbor-fire', 7, [1, 2, 1, 2]);
    expect(capO(s, 13)).toBe(4);
  });

  it('ô đích là đất trống: không có tác dụng', () => {
    const s0 = newGame();
    own(s0, 'b', 13);
    own(s0, 'b', 11, { level: 2 });
    const s = rut(s0, 'chance-neighbor-fire', 7, [1, 2, 1, 2]);
    expect(s.tiles[13]).toMatchObject({ owner: 'b', level: 0, mortgaged: false });
    expect(capO(s, 11)).toBe(2);
  });

  it('ô đích không phải đất màu (nhà máy): không có tác dụng, đất bên cạnh không bị ảnh hưởng', () => {
    const s0 = newGame();
    own(s0, 'b', 12);
    own(s0, 'b', 11, { level: 2 });
    own(s0, 'b', 13, { level: 3 });
    const s = rut(s0, 'chance-neighbor-fire', 7, [1, 2, 1, 1]); // 07 + 5 = 12
    expect(capO(s, 11)).toBe(2);
    expect(capO(s, 13)).toBe(3);
    expect(cash(s, 'b')).toBe(500);
  });

  it('đếm vòng qua ô 00 (36 + 5 = ô 01): không ai di chuyển, không ai nhận 200Đ', () => {
    const s0 = newGame();
    own(s0, 'b', 1, { level: 2 });
    const s = rut(s0, 'chance-neighbor-fire', 36, [1, 1, 1, 2]);
    expect(capO(s, 1)).toBe(1);
    expect(player(s, 'a').position).toBe(36);
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
  });

  it('3 người: gieo 6 viên (07 + 6 = 13)', () => {
    const s0 = newGame(3);
    own(s0, 'c', 13, { level: 1 });
    const s = rut(s0, 'chance-neighbor-fire', 7, [1, 1, 1, 1, 1, 1]);
    expect(capO(s, 13)).toBe(0);
    expect(cash(s, 'c')).toBe(500);
  });

  it('4 người: gieo 8 viên (07 + 9 = 16)', () => {
    const s0 = newGame(4);
    own(s0, 'd', 16, { level: 2 });
    const s = rut(s0, 'chance-neighbor-fire', 7, [1, 1, 1, 1, 1, 1, 1, 2]);
    expect(capO(s, 16)).toBe(1);
  });

  it('rút khi đổ đôi: sau khi cháy vẫn được thêm lượt', () => {
    const s0 = newGame();
    own(s0, 'b', 13, { level: 3 });
    const s = rutDoi(s0, 'chance-neighbor-fire', 7, [1, 2, 1, 2]);
    expect(capO(s, 13)).toBe(2);
    expect(s.pending).toEqual(LUOT_A);
  });
});

// ---------------------------------------------------------------------------
// Chồng thẻ
// ---------------------------------------------------------------------------

describe('chồng thẻ Cơ Hội (mục 8)', () => {
  it('đầu ván chồng Cơ Hội có đủ 19 thẻ', () => {
    const s = newGame();
    expect([...s.decks.chance].sort()).toEqual([...TAT_CA_THE_CO_HOI].sort());
    expect(TAT_CA_THE_CO_HOI).toHaveLength(19);
  });

  it('thẻ đã rút (không giữ) rời khỏi chồng cho đến khi xáo lại', () => {
    const s = rut(newGame(), 'chance-acting', 7);
    expect(s.decks.chance).toHaveLength(18);
    expect(s.decks.chance).not.toContain('chance-acting');
  });

  it('rút hết thì xáo lại; thẻ đang được giữ không nằm trong chồng mới', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    giuThe(s0, 'b', 'chance-rent-waiver', 'rentWaiver');
    giuThe(s0, 'a', 'chance-capital-citizen', 'taxWaiver');
    s0.decks.chance = [];
    // Xúc xắc lấy theo kịch bản; các lần xáo trả số lớn nhất (giữ nguyên thứ tự).
    const dice = [3, 4];
    let shuffleCalls = 0;
    const rng: Rng = {
      int(min, max) {
        if (min === 1 && max === 6) {
          const v = dice.shift();
          if (v === undefined) throw new Error('Hết xúc xắc kịch bản');
          return v;
        }
        shuffleCalls += 1;
        return max;
      },
    };
    const r = applyAction(s0, { type: 'roll', playerId: 'a' }, rng);
    if (!r.ok) throw new Error(r.error);
    expect(dice).toEqual([]);
    expect(shuffleCalls).toBeGreaterThan(0);
    const s = r.state;
    const expected = TAT_CA_THE_CO_HOI.filter(
      (id) => id !== 'chance-rent-waiver' && id !== 'chance-capital-citizen',
    );
    // Chồng mới có 17 thẻ, đã rút 1 thẻ.
    expect(s.decks.chance).toHaveLength(16);
    expect(new Set(s.decks.chance).size).toBe(16);
    for (const id of s.decks.chance) expect(expected).toContain(id);
    expect(s.decks.chance).not.toContain('chance-rent-waiver');
    expect(s.decks.chance).not.toContain('chance-capital-citizen');
    expect(theDangGiu(s, 'b')).toEqual(['rentWaiver']);
  });
});

// ---------------------------------------------------------------------------
// Bổ sung: các trường hợp biên kết hợp nhiều luật
// ---------------------------------------------------------------------------

describe('thẻ Cơ Hội kết hợp luật ô đến (mục 4, mục 5, mục 8)', () => {
  it('Đến ga gần nhất: ga của mình đang cắm thì xử lý như bình thường, được chuộc (110Đ)', () => {
    const s0 = newGame();
    own(s0, 'a', 15, { mortgaged: true });
    let s = rut(s0, 'chance-nearest-station', 7);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toMatchObject({ type: 'upgrade', playerId: 'a', tile: 15 });
    s = act(s, { type: 'upgrade', playerId: 'a' });
    expect(s.tiles[15]).toMatchObject({ owner: 'a', mortgaged: false });
    expect(cash(s, 'a')).toBe(390);
  });

  it('Đất gần nhất: chủ đang ở tù vẫn thu 10 × xúc xắc', () => {
    const s0 = newGame();
    own(s0, 'b', 8);
    setPlayer(s0, 'b', { position: 10, inJail: true });
    let s = rut(s0, 'chance-nearest-property', 7, [4, 4]);
    s = traHet(s);
    expect(cash(s, 'a')).toBe(420);
    expect(cash(s, 'b')).toBe(580);
  });

  it('Đất gần nhất: 2 viên mới ra đôi không cho thêm lượt', () => {
    const s0 = newGame();
    own(s0, 'b', 8);
    let s = rut(s0, 'chance-nearest-property', 7, [3, 3]);
    s = traHet(s);
    expect(cash(s, 'a')).toBe(440);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('Miễn thuế nhà đất: chủ đang ở tù vẫn là tiền thuê nên thẻ được dùng', () => {
    const s0 = newGame();
    giuThe(s0, 'a', 'chance-rent-waiver', 'rentWaiver');
    own(s0, 'b', 11, { level: 2 });
    setPlayer(s0, 'b', { position: 10, inJail: true });
    setPlayer(s0, 'a', { position: 7 });
    const s = roll(s0, 1, 3);
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(theDangGiu(s, 'a')).toEqual([]);
  });

  it('Tàu bay tới ô 04 (07 → 09 → 04): xử lý ô thuế 200Đ', () => {
    let s = rut(newGame(), 'chance-fly-dice', 7, [2, 5]);
    expect(player(s, 'a').position).toBe(4);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 200 });
    s = tra(s);
    expect(cash(s, 'a')).toBe(300);
  });

  it('Tàu bay tới ô 30 khi đang đổ đôi: vào tù và mất lượt thêm', () => {
    const s = rutDoi(newGame(), 'chance-fly-dice', 36, [1, 5]);
    expect(player(s, 'a').inJail).toBe(true);
    expect(player(s, 'a').position).toBe(10);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('đổ đôi tới Cơ Hội, thẻ tạo nợ: được Xử lý nợ, trả xong vẫn được thêm lượt', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 50 });
    own(s0, 'a', 1, { level: 3 });
    let s = rutDoi(s0, 'chance-electricity', 7);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 75 });
    s = act(s, { type: 'manage', playerId: 'a', ops: [{ op: 'downgrade', tile: 1 }] });
    s = tra(s);
    expect(cash(s, 'a')).toBe(0);
    expect(s.pending).toEqual(LUOT_A);
  });

  it('đi Metro tới ô Cơ Hội: rút thẻ và làm theo (Về điểm xuất phát vẫn nhận 200Đ)', () => {
    let s = roll(newGame(), 4, 6);
    expect(s.pending).toEqual({ type: 'metro', playerId: 'a' });
    topCard(s, 'chance-go');
    s = act(s, { type: 'metro', playerId: 'a', destination: 7 });
    expect(player(s, 'a').position).toBe(0);
    expect(cash(s, 'a')).toBe(450);
    expect(s.pending).toEqual(LUOT_B);
  });
});

describe('Người thủ đô: chỉ dùng khi dừng ở ô thuế, hết hiệu lực khi mất Phố Cổ (mục 8)', () => {
  it('đi qua ô 04 mà không dừng: quyền vẫn còn', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    giuThe(s0, 'a', 'chance-capital-citizen', 'taxWaiver');
    const s = roll(s0, 2, 3);
    expect(player(s, 'a').position).toBe(5);
    expect(theDangGiu(s, 'a')).toEqual(['taxWaiver']);
  });

  it('Tàu bay dừng tạm ở ô 38 rồi đi tiếp: không tính là dừng, quyền vẫn còn', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    giuThe(s0, 'a', 'chance-capital-citizen', 'taxWaiver');
    topCard(s0, 'community-singing');
    const s = rut(s0, 'chance-fly-dice', 36, [2, 5]); // 36 → 38 → 33
    expect(player(s, 'a').position).toBe(33);
    expect(theDangGiu(s, 'a')).toEqual(['taxWaiver']);
  });

  it('Tàu bay dừng cuối ở ô 04: tự dùng quyền, không trả thuế', () => {
    const s0 = newGame();
    own(s0, 'a', 1);
    giuThe(s0, 'a', 'chance-capital-citizen', 'taxWaiver');
    const s = rut(s0, 'chance-fly-dice', 7, [2, 5]);
    expect(player(s, 'a').position).toBe(4);
    expect(cash(s, 'a')).toBe(500);
    expect(theDangGiu(s, 'a')).toEqual([]);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('mất Phố Cổ do thẻ Thằng Bờm đổi đất: quyền hết hiệu lực, dừng ô 04 phải trả', () => {
    let s = newGame();
    own(s, 'a', 1);
    own(s, 'b', 3);
    giuThe(s, 'a', 'chance-capital-citizen', 'taxWaiver');
    s = luotNhanh(s); // a đi tới ô 20
    setPlayer(s, 'b', { position: 10 });
    topCard(s, 'community-swap');
    s = roll(s, 3, 4, 1, 2); // b tới ô 17; viên 1 = 1 (a), viên 2 chẵn: đổi đất rẻ nhất
    expect(chuO(s, 1)).toBe('b');
    expect(chuO(s, 3)).toBe('a');
    expect(theDangGiu(s, 'a')).toEqual([]);
    expect(theDangGiu(s, 'b')).toEqual([]);
    setPlayer(s, 'a', { position: 0 });
    s = roll(s, 1, 3);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 200 });
  });
});

describe('thẻ Cơ Hội và Kẻ khóc người cười (mục 9 thẻ 16)', () => {
  it('Hỏng đường ray: người rút trả tiền thì trả thêm người giữ thẻ 40Đ', () => {
    const s0 = newGame();
    own(s0, 'a', 5);
    giuThe(s0, 'b', 'community-fortune-mirror', 'fortuneMirror');
    const s = rut(s0, 'chance-railway-repair', 7);
    expect(cash(s, 'a')).toBe(435);
    expect(cash(s, 'b')).toBe(540);
    expect(theDangGiu(s, 'b')).toEqual([]);
  });

  it('Đất gần nhất bắt buộc mua: mua đất ở ô đến không tính, không kích hoạt', () => {
    const s0 = newGame();
    giuThe(s0, 'b', 'community-fortune-mirror', 'fortuneMirror');
    const s = rut(s0, 'chance-nearest-property', 7);
    expect(cash(s, 'a')).toBe(400);
    expect(cash(s, 'b')).toBe(500);
    expect(theDangGiu(s, 'b')).toEqual(['fortuneMirror']);
  });

  it('Đi đến Ga Sài Gòn rồi trả tiền thuê ga: tiền thuê không tính, không kích hoạt', () => {
    const s0 = newGame();
    own(s0, 'b', 35);
    giuThe(s0, 'b', 'community-fortune-mirror', 'fortuneMirror');
    const s = traHet(rut(s0, 'chance-ga-sai-gon', 7));
    expect(cash(s, 'a')).toBe(475);
    expect(cash(s, 'b')).toBe(525);
    expect(theDangGiu(s, 'b')).toEqual(['fortuneMirror']);
  });

  it('Cháy nhà hàng xóm và Canh bạc không đổi tiền mặt: không kích hoạt', () => {
    const s0 = newGame();
    own(s0, 'b', 13, { level: 1 });
    giuThe(s0, 'b', 'community-fortune-mirror', 'fortuneMirror');
    const s = rut(s0, 'chance-neighbor-fire', 7, [1, 2, 1, 2]);
    expect(capO(s, 13)).toBe(0);
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(theDangGiu(s, 'b')).toEqual(['fortuneMirror']);
  });
});

describe('biên tiền mặt khi thẻ đưa tới ô (mục 1, mục 4, mục 10)', () => {
  it('nhận 200Đ qua ô 00 trước khi xử lý ô đến: 100Đ + 200Đ đủ mời mua Ga Sài Gòn', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 100 });
    let s = rut(s0, 'chance-ga-sai-gon', 36);
    expect(cash(s, 'a')).toBe(300);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 35 });
    s = act(s, { type: 'buy', playerId: 'a' });
    expect(cash(s, 'a')).toBe(100);
  });

  it('thẻ đưa tới đất vô chủ mà không đủ tiền mặt: vẫn được mời mua', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 399 });
    const s = rut(s0, 'chance-phu-quoc', 7);
    expect(player(s, 'a').position).toBe(39);
    expect(chuO(s, 39)).toBeNull();
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 39 });
  });

  it('0Đ tiền mặt, Bưu Điện của người khác: nhận 200Đ trước nên trả được 6Đ', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 0 });
    own(s0, 'b', 6);
    let s = rut(s0, 'chance-buu-dien', 22);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 6 });
    s = tra(s);
    expect(cash(s, 'a')).toBe(194);
  });

  it('Trả tiền điện vừa đủ tiền mặt: tự trả, còn 0Đ, không vào Xử lý nợ', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 125 });
    own(s0, 'a', 1, { level: 3 });
    own(s0, 'a', 6, { level: 2 });
    const s = rut(s0, 'chance-electricity', 7);
    expect(cash(s, 'a')).toBe(0);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('Hỏng đường ray vừa đủ tiền mặt: tự trả, còn 0Đ', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 100 });
    for (const i of [5, 15, 25]) own(s0, 'a', i);
    const s = rut(s0, 'chance-railway-repair', 7);
    expect(cash(s, 'a')).toBe(0);
    expect(s.pending).toEqual(LUOT_B);
  });

  it('đang nợ tiền mua bắt buộc: không đầu hàng được, không chuộc đất được', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { cash: 300 });
    own(s0, 'a', 6);
    own(s0, 'a', 9, { mortgaged: true });
    const s = rut(s0, 'chance-nearest-property', 36);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 350 });
    reject(s, { type: 'surrender', playerId: 'a' });
    reject(s, { type: 'manage', playerId: 'a', ops: [{ op: 'redeem', tile: 9 }] });
  });
});

describe('Kẻ khóc người cười với thẻ nhận tiền (mục 9 thẻ 16)', () => {
  it('Xổ số nhận 5Đ: người giữ thẻ vẫn trả người rút 40Đ', () => {
    const s0 = newGame();
    giuThe(s0, 'b', 'community-fortune-mirror', 'fortuneMirror');
    const s = rut(s0, 'chance-lottery', 7, [1]);
    expect(cash(s, 'a')).toBe(545);
    expect(cash(s, 'b')).toBe(460);
  });

  it('người rút tự giữ Kẻ khóc người cười: không kích hoạt với chính mình', () => {
    const s0 = newGame();
    giuThe(s0, 'a', 'community-fortune-mirror', 'fortuneMirror');
    const s = rut(s0, 'chance-acting', 7);
    expect(cash(s, 'a')).toBe(550);
    expect(cash(s, 'b')).toBe(500);
    expect(theDangGiu(s, 'a')).toEqual(['fortuneMirror']);
  });
});
