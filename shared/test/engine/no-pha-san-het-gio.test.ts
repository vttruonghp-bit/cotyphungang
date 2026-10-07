import { describe, expect, it } from 'vitest';
import {
  isGameOver,
  maxLiquidationValue,
  waitingFor,
  winners,
  type Action,
  type GameState,
  type KeepableCard,
  type ManageOp,
  type PlayerState,
  type TileState,
} from '../../src';
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

// Ụp/Mở, xử lý nợ, phá sản, đầu hàng, hết giờ: docs/luat-choi.md mục 3, 7, 10, 11.
// Giá trị mong đợi chép tay từ bảng giá mục 7 của tài liệu luật, không lấy từ mã engine.

// ---------------------------------------------------------------------------
// Tiện ích riêng cho file này
// ---------------------------------------------------------------------------

const op = (kind: ManageOp['op'], tile: number): ManageOp => ({ op: kind, tile });

/** Xác nhận bản nháp Ụp/Mở (phải được chấp nhận). */
const manage = (s: GameState, playerId: string, ...ops: ManageOp[]): GameState =>
  act(s, { type: 'manage', playerId, ops });

/** Bản nháp Ụp/Mở phải bị từ chối (trạng thái giữ nguyên). */
const manageBiTuChoi = (s: GameState, playerId: string, ...ops: ManageOp[]): string =>
  reject(s, { type: 'manage', playerId, ops });

const pay = (s: GameState, playerId: string): GameState => act(s, { type: 'pay', playerId });

const timeout = (s: GameState, dice: number[] = []): GameState => act(s, { type: 'timeout' }, dice);

const surrender = (s: GameState, playerId: string): GameState =>
  act(s, { type: 'surrender', playerId });

const tile = (s: GameState, i: number): TileState => {
  const t = s.tiles[i];
  if (!t) throw new Error(`Ô ${i} không mua được`);
  return t;
};

const ids = (ps: PlayerState[]): string[] => ps.map((p) => p.id);

/** Cho người chơi giữ một thẻ (lấy thẻ ra khỏi chồng của nó). */
function giuThe(s: GameState, id: string, cardId: string, kind: KeepableCard): GameState {
  const deck = cardId.startsWith('chance-') ? 'chance' : 'community';
  s.decks[deck] = s.decks[deck].filter((c) => c !== cardId);
  player(s, id).heldCards.push({ cardId, kind });
  return s;
}

/** Người đang chờ đổ đứng ở ô 14, thẻ Khí Vận `cardId` nằm trên cùng, đổ 1 + 2 tới ô 17. */
function rutKhiVan(s: GameState, cardId: string, extra: number[] = []): GameState {
  setPlayer(s, who(s), { position: 14 });
  topCard(s, cardId);
  return roll(s, 1, 2, ...extra);
}

/** Người đang chờ đổ đứng ở ô 00, thẻ Cơ Hội `cardId` nằm trên cùng, đổ 3 + 4 tới ô 07. */
function rutCoHoi(s: GameState, cardId: string, extra: number[] = []): GameState {
  setPlayer(s, who(s), { position: 0 });
  topCard(s, cardId);
  return roll(s, 3, 4, ...extra);
}

/** Ván 4 người, người `c` (ghế thứ 3) đang chờ đổ. */
function vanLuotC(): GameState {
  const s = newGame(4);
  s.current = 2;
  s.pending = { type: 'roll', playerId: 'c' };
  return s;
}

/** Đặt người chơi vào tù, đang chờ quyết định đầu lượt trong tù. */
function oTu(s: GameState, id: string, patch: Partial<PlayerState> = {}): GameState {
  setPlayer(s, id, { position: 10, inJail: true, jailAttempts: 0, ...patch });
  s.pending = { type: 'jail', playerId: id };
  return s;
}

// ---------------------------------------------------------------------------
// Mục 7: giá trị từng thao tác Ụp/Mở
// ---------------------------------------------------------------------------

describe('Ụp/Mở: giá trị từng thao tác (mục 7)', () => {
  it('Hạ khách sạn về 4 nhà, nhận 50% giá xây (Phú Quốc: 100Đ)', () => {
    const s = manage(own(newGame(), 'a', 39, { level: 5 }), 'a', op('downgrade', 39));
    expect(tile(s, 39)).toMatchObject({ owner: 'a', level: 4, mortgaged: false });
    expect(cash(s, 'a')).toBe(600);
  });

  it.each([
    [1, 25],
    [6, 25],
    [9, 25],
    [11, 50],
    [19, 50],
    [21, 75],
    [29, 75],
    [31, 100],
    [37, 100],
    [39, 100],
  ])('Hạ 1 cấp ở ô %i nhận %iĐ (cột "Hạ 1 cấp")', (i, refund) => {
    const s = manage(own(newGame(), 'a', i, { level: 2 }), 'a', op('downgrade', i));
    expect(tile(s, i).level).toBe(1);
    expect(cash(s, 'a')).toBe(500 + refund);
  });

  it('Hạ nhiều cấp trong một bản nháp: mỗi cấp nhận 50% giá xây', () => {
    const s0 = own(newGame(), 'a', 13, { level: 3 });
    const s = manage(s0, 'a', op('downgrade', 13), op('downgrade', 13), op('downgrade', 13));
    expect(tile(s, 13).level).toBe(0);
    expect(cash(s, 'a')).toBe(650);
  });

  it.each([
    [1, 30],
    [9, 60],
    [14, 80],
    [24, 120],
    [37, 175],
    [39, 200],
    [5, 100],
    [12, 75],
    [28, 75],
  ])('Cắm ô %i nhận %iĐ (50% giá mua), vẫn là của mình', (i, value) => {
    const s = manage(own(newGame(), 'a', i), 'a', op('mortgage', i));
    expect(tile(s, i)).toMatchObject({ owner: 'a', mortgaged: true, level: 0 });
    expect(cash(s, 'a')).toBe(500 + value);
  });

  it('Cắm đất còn nhà bị từ chối: phải hạ hết công trình trước', () => {
    manageBiTuChoi(own(newGame(), 'a', 6, { level: 1 }), 'a', op('mortgage', 6));
    manageBiTuChoi(own(newGame(), 'a', 39, { level: 5 }), 'a', op('mortgage', 39));
  });

  it('Hạ hết nhà rồi cắm trong cùng một bản nháp', () => {
    const s0 = own(newGame(), 'a', 6, { level: 2 });
    const s = manage(s0, 'a', op('downgrade', 6), op('downgrade', 6), op('mortgage', 6));
    expect(tile(s, 6)).toMatchObject({ owner: 'a', level: 0, mortgaged: true });
    expect(cash(s, 'a')).toBe(500 + 25 + 25 + 50);
  });

  it.each([
    [1, 33],
    [6, 55],
    [11, 77],
    [21, 121],
    [37, 192],
    [39, 220],
    [5, 110],
    [12, 82],
  ])('Chuộc ô %i trả %iĐ (55% giá mua, làm tròn xuống)', (i, cost) => {
    const s = manage(own(newGame(), 'a', i, { mortgaged: true }), 'a', op('redeem', i));
    expect(tile(s, i)).toMatchObject({ owner: 'a', mortgaged: false });
    expect(cash(s, 'a')).toBe(500 - cost);
  });

  it('Chuộc khi tiền mặt vừa đúng bằng tiền chuộc: còn 0Đ', () => {
    const s0 = setPlayer(own(newGame(), 'a', 28, { mortgaged: true }), 'a', { cash: 82 });
    const s = manage(s0, 'a', op('redeem', 28));
    expect(cash(s, 'a')).toBe(0);
    expect(tile(s, 28).mortgaged).toBe(false);
  });

  it('Thiếu 1Đ thì không chuộc được', () => {
    const s = setPlayer(own(newGame(), 'a', 28, { mortgaged: true }), 'a', { cash: 81 });
    manageBiTuChoi(s, 'a', op('redeem', 28));
  });

  it.each([
    [1, 33],
    [9, 66],
    [24, 132],
    [37, 192],
    [39, 220],
    [15, 110],
    [28, 82],
  ])('Bán ô %i chưa cắm nhận %iĐ (55%), ô trở lại vô chủ', (i, value) => {
    const s = manage(own(newGame(), 'a', i), 'a', op('sell', i));
    expect(tile(s, i)).toMatchObject({ owner: null, level: 0, mortgaged: false });
    expect(cash(s, 'a')).toBe(500 + value);
  });

  it.each([
    [1, 3],
    [9, 6],
    [24, 12],
    [37, 17],
    [39, 20],
    [15, 10],
    [28, 7],
  ])('Bán ô %i đang cắm chỉ nhận %iĐ (5%), ô trở lại vô chủ và hết cắm', (i, value) => {
    const s = manage(own(newGame(), 'a', i, { mortgaged: true }), 'a', op('sell', i));
    expect(tile(s, i)).toMatchObject({ owner: null, level: 0, mortgaged: false });
    expect(cash(s, 'a')).toBe(500 + value);
  });

  it('Cắm rồi bán cũng chỉ bằng bán thẳng (Tháp Chăm 192Đ, Nhà Máy Điện 82Đ)', () => {
    const s0 = own(own(newGame(), 'a', 37), 'a', 12);
    const s = manage(
      s0,
      'a',
      op('mortgage', 37),
      op('sell', 37),
      op('mortgage', 12),
      op('sell', 12),
    );
    expect(cash(s, 'a')).toBe(500 + 192 + 82);
    expect(tile(s, 37).owner).toBeNull();
    expect(tile(s, 12).owner).toBeNull();
  });

  it('Bán đất còn công trình bị từ chối', () => {
    manageBiTuChoi(own(newGame(), 'a', 1, { level: 1 }), 'a', op('sell', 1));
  });

  it('Khách sạn phải hạ đủ 5 cấp rồi mới bán được trong cùng bản nháp', () => {
    const s0 = own(newGame(), 'a', 39, { level: 5 });
    const ha = (n: number) => Array.from({ length: n }, () => op('downgrade', 39));
    manageBiTuChoi(s0, 'a', ...ha(4), op('sell', 39));
    const s = manage(s0, 'a', ...ha(5), op('sell', 39));
    expect(cash(s, 'a')).toBe(500 + 5 * 100 + 220);
    expect(tile(s, 39)).toMatchObject({ owner: null, level: 0, mortgaged: false });
  });

  it('Đất đã bán chỉ mua lại được khi dừng ở ô đó, theo giá gốc', () => {
    const s1 = manage(own(newGame(), 'a', 6), 'a', op('sell', 6));
    expect(cash(s1, 'a')).toBe(555);
    const s2 = roll(s1, 2, 4);
    expect(s2.pending).toEqual({ type: 'buy', playerId: 'a', tile: 6 });
    const s3 = act(s2, { type: 'buy', playerId: 'a' });
    expect(tile(s3, 6).owner).toBe('a');
    expect(cash(s3, 'a')).toBe(455);
  });

  it('Nhà đã hạ chỉ xây lại được khi dừng ở ô đó (1 cấp, trả đủ giá xây)', () => {
    const s1 = manage(own(newGame(), 'a', 6, { level: 2 }), 'a', op('downgrade', 6));
    expect(tile(s1, 6).level).toBe(1);
    expect(cash(s1, 'a')).toBe(525);
    const s2 = roll(s1, 2, 4);
    expect(s2.pending).toMatchObject({ type: 'upgrade', playerId: 'a', tile: 6, mode: 'build' });
    const s3 = act(s2, { type: 'upgrade', playerId: 'a' });
    expect(tile(s3, 6).level).toBe(2);
    expect(cash(s3, 'a')).toBe(475);
  });

  it('Cắm Phố Cổ vẫn giữ quyền Người thủ đô; bán Phố Cổ thì quyền hết hiệu lực', () => {
    const s0 = giuThe(own(newGame(), 'a', 1), 'a', 'chance-capital-citizen', 'taxWaiver');
    const s1 = manage(s0, 'a', op('mortgage', 1));
    expect(player(s1, 'a').heldCards.map((c) => c.kind)).toEqual(['taxWaiver']);
    const s2 = manage(s1, 'a', op('sell', 1));
    expect(player(s2, 'a').heldCards).toEqual([]);
    expect(cash(s2, 'a')).toBe(500 + 30 + 3);
    // Dừng ô 04 sau đó phải nộp thuế như thường.
    const s3 = roll(s2, 1, 3);
    expect(s3.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 200, reason: 'tax' });
  });
});

// ---------------------------------------------------------------------------
// Kiểm tra hợp lệ, thứ tự và tính nguyên khối của bản nháp
// ---------------------------------------------------------------------------

describe('Ụp/Mở: kiểm tra hợp lệ, áp dụng theo thứ tự, sai một bỏ cả', () => {
  it('Ô của người khác hoặc ô vô chủ không Ụp/Mở được', () => {
    const s = own(own(newGame(), 'b', 39, { level: 2 }), 'b', 5, { mortgaged: true });
    manageBiTuChoi(s, 'a', op('downgrade', 39));
    manageBiTuChoi(s, 'a', op('sell', 39));
    manageBiTuChoi(s, 'a', op('redeem', 5));
    manageBiTuChoi(s, 'a', op('mortgage', 1));
    manageBiTuChoi(s, 'a', op('sell', 1));
  });

  it('Ô không mua được (Bắt Đầu, Thuế, Khí Vận, Tù) bị từ chối', () => {
    const s = newGame();
    for (const i of [0, 2, 4, 10, 30]) {
      manageBiTuChoi(s, 'a', op('mortgage', i));
      manageBiTuChoi(s, 'a', op('sell', i));
    }
  });

  it('Cắm ô đang cắm bị từ chối', () => {
    manageBiTuChoi(own(newGame(), 'a', 9, { mortgaged: true }), 'a', op('mortgage', 9));
  });

  it('Chuộc ô không bị cắm bị từ chối', () => {
    manageBiTuChoi(own(newGame(), 'a', 9), 'a', op('redeem', 9));
    manageBiTuChoi(own(newGame(), 'a', 5), 'a', op('redeem', 5));
  });

  it('Hạ cấp đất trống, ga hay nhà máy bị từ chối', () => {
    const s = own(own(own(newGame(), 'a', 9), 'a', 5), 'a', 12);
    manageBiTuChoi(s, 'a', op('downgrade', 9));
    manageBiTuChoi(s, 'a', op('downgrade', 5));
    manageBiTuChoi(s, 'a', op('downgrade', 12));
  });

  it('Các thao tác áp dụng lần lượt: tiền cắm ô trước dùng để chuộc ô sau', () => {
    const s0 = own(own(newGame(), 'a', 1, { mortgaged: true }), 'a', 3);
    setPlayer(s0, 'a', { cash: 3 });
    const s = manage(s0, 'a', op('mortgage', 3), op('redeem', 1));
    expect(cash(s, 'a')).toBe(0);
    expect(tile(s, 3).mortgaged).toBe(true);
    expect(tile(s, 1).mortgaged).toBe(false);
  });

  it('Một thao tác sai thì cả bản nháp bị bỏ, tiền và tài sản không đổi', () => {
    const s = own(own(own(newGame(), 'a', 1), 'a', 6, { level: 1 }), 'b', 39);
    manageBiTuChoi(s, 'a', op('mortgage', 1), op('downgrade', 6), op('sell', 39));
    expect(cash(s, 'a')).toBe(500);
    expect(tile(s, 1).mortgaged).toBe(false);
    expect(tile(s, 6).level).toBe(1);
    // Bản nháp đúng (bỏ thao tác sai) thì được.
    const s2 = manage(s, 'a', op('mortgage', 1), op('downgrade', 6));
    expect(cash(s2, 'a')).toBe(555);
  });

  it('Sai thứ tự (cắm trước khi hạ nhà) thì cả bản nháp bị từ chối', () => {
    const s = own(newGame(), 'a', 6, { level: 1 });
    manageBiTuChoi(s, 'a', op('mortgage', 6), op('downgrade', 6));
    manageBiTuChoi(s, 'a', op('sell', 6), op('downgrade', 6));
  });

  it('Cắm hai lần cùng một ô trong một bản nháp bị từ chối', () => {
    manageBiTuChoi(own(newGame(), 'a', 1), 'a', op('mortgage', 1), op('mortgage', 1));
  });

  it('Số ô ngoài bàn cờ bị từ chối', () => {
    const s = own(newGame(), 'a', 1);
    manageBiTuChoi(s, 'a', op('mortgage', 40));
    manageBiTuChoi(s, 'a', op('mortgage', -1));
    manageBiTuChoi(s, 'a', op('mortgage', 1), op('sell', 99));
  });

  it('Ụp/Mở không đổi tiền hay tài sản của người khác', () => {
    const s0 = own(own(newGame(), 'a', 39, { level: 2 }), 'b', 37, { level: 1 });
    const s = manage(s0, 'a', op('downgrade', 39), op('downgrade', 39), op('sell', 39));
    expect(cash(s, 'b')).toBe(500);
    expect(tile(s, 37)).toMatchObject({ owner: 'b', level: 1, mortgaged: false });
  });

  it('Bán xong thì ô không còn là của mình: thao tác sau trên ô đó bị từ chối', () => {
    manageBiTuChoi(own(newGame(), 'a', 1), 'a', op('sell', 1), op('mortgage', 1));
  });
});

// ---------------------------------------------------------------------------
// Mục 3: lúc nào được Ụp/Mở
// ---------------------------------------------------------------------------

describe('Ụp/Mở: lúc nào được dùng (mục 3)', () => {
  it('Đầu lượt trước khi đổ: được, và xác nhận nhiều lần vẫn được', () => {
    const s0 = own(own(newGame(), 'a', 1), 'a', 3);
    const s1 = manage(s0, 'a', op('mortgage', 1));
    const s2 = manage(s1, 'a', op('mortgage', 3));
    const s3 = manage(s2, 'a', op('redeem', 1));
    expect(cash(s3, 'a')).toBe(500 + 30 + 30 - 33);
    // Vẫn đổ bình thường sau đó.
    expect(roll(s3, 2, 4).pending).toEqual({ type: 'buy', playerId: 'a', tile: 6 });
  });

  it('Đang ở tù, đầu lượt trước khi đổ: được Ụp/Mở (gom tiền bảo lãnh)', () => {
    const s0 = oTu(own(newGame(), 'a', 1), 'a', { cash: 30 });
    reject(s0, { type: 'payBail', playerId: 'a' });
    const s1 = manage(s0, 'a', op('mortgage', 1));
    expect(cash(s1, 'a')).toBe(60);
    const s2 = act(s1, { type: 'payBail', playerId: 'a' });
    expect(cash(s2, 'a')).toBe(10);
    expect(player(s2, 'a').inJail).toBe(false);
    expect(s2.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('Người không tới lượt không Ụp/Mở được', () => {
    const s = own(newGame(3), 'b', 9);
    manageBiTuChoi(s, 'b', op('mortgage', 9));
  });

  it('Sau khi đổ (đang chờ mua đất) không Ụp/Mở được để lấy tiền', () => {
    const s = roll(own(newGame(), 'a', 39), 1, 2);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 3 });
    manageBiTuChoi(s, 'a', op('mortgage', 39));
  });

  it('Sau khi đổ, đang chờ nâng cấp: không Ụp/Mở được', () => {
    const s = roll(own(own(newGame(), 'a', 39), 'a', 6, { level: 1 }), 2, 4);
    expect(s.pending).toMatchObject({ type: 'upgrade', playerId: 'a', tile: 6 });
    manageBiTuChoi(s, 'a', op('mortgage', 39));
  });

  it('Giữa các lần đổ đôi không Ụp/Mở được', () => {
    const s1 = roll(own(newGame(), 'a', 39), 3, 3);
    const s2 = act(s1, { type: 'declineBuy', playerId: 'a' });
    expect(s2.pending).toEqual({ type: 'roll', playerId: 'a' });
    manageBiTuChoi(s2, 'a', op('mortgage', 39));
  });

  it('Đang chờ bấm Trả tiền mà đủ tiền (không nợ) thì không Ụp/Mở được', () => {
    const s = roll(own(own(newGame(), 'b', 6), 'a', 39), 2, 4);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 6 });
    manageBiTuChoi(s, 'a', op('mortgage', 39));
  });

  it('Sang lượt người khác: người vừa chơi không Ụp/Mở được, người mới thì được', () => {
    const s0 = own(own(newGame(), 'a', 9), 'b', 11);
    const s1 = act(roll(s0, 1, 2), { type: 'declineBuy', playerId: 'a' });
    expect(s1.pending).toEqual({ type: 'roll', playerId: 'b' });
    manageBiTuChoi(s1, 'a', op('mortgage', 9));
    const s2 = manage(s1, 'b', op('mortgage', 11));
    expect(cash(s2, 'b')).toBe(570);
  });

  it('Lần thử thứ 3 trong tù thất bại, đang chọn trả 50Đ hay dùng thẻ: không còn là đầu lượt', () => {
    const s0 = oTu(own(newGame(), 'a', 1), 'a', { jailAttempts: 2 });
    giuThe(s0, 'a', 'community-jail-free', 'jailFree');
    const s1 = roll(s0, 1, 2);
    expect(s1.pending).toMatchObject({ type: 'jailRelease', playerId: 'a' });
    manageBiTuChoi(s1, 'a', op('mortgage', 1));
  });

  it('Đổ đôi gặp tiền thuê thiếu tiền: được Xử lý nợ để trả, rồi lượt thêm lại bị khóa Ụp/Mở', () => {
    const s0 = own(own(newGame(), 'b', 6, { level: 3 }), 'a', 39);
    setPlayer(s0, 'a', { cash: 100 });
    const s1 = roll(s0, 3, 3);
    expect(s1.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      total: 270,
      reason: 'rent',
      creditors: [{ playerId: 'b', amount: 270 }],
    });
    const s2 = manage(s1, 'a', op('mortgage', 39));
    expect(cash(s2, 'a')).toBe(300);
    const s3 = pay(s2, 'a');
    expect(cash(s3, 'a')).toBe(30);
    expect(cash(s3, 'b')).toBe(770);
    expect(s3.pending).toEqual({ type: 'roll', playerId: 'a' });
    manageBiTuChoi(s3, 'a', op('sell', 39));
  });

  it('Đang nợ không được chuộc; bản nháp có chuộc bị bỏ cả', () => {
    const s0 = own(own(own(newGame(), 'b', 6, { level: 3 }), 'a', 39), 'a', 3, { mortgaged: true });
    setPlayer(s0, 'a', { cash: 100 });
    const s1 = roll(s0, 2, 4);
    expect(s1.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 270 });
    manageBiTuChoi(s1, 'a', op('redeem', 3));
    manageBiTuChoi(s1, 'a', op('mortgage', 39), op('redeem', 3));
    // Hạ cấp, cắm, bán thì được.
    const s2 = manage(s1, 'a', op('mortgage', 39));
    expect(cash(s2, 'a')).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// Mục 10: xử lý nợ trong lượt
// ---------------------------------------------------------------------------

describe('Xử lý nợ (mục 10)', () => {
  /** b có Phú Quốc 2 nhà (thuê 600Đ); a đứng ở ô 34, đổ 2 + 3 tới ô 39. */
  const thuePhuQuoc = (aCash: number, ...aTiles: [number, Partial<TileState>?][]): GameState => {
    const s = own(newGame(), 'b', 39, { level: 2 });
    for (const [i, patch] of aTiles) own(s, 'a', i, patch ?? {});
    setPlayer(s, 'a', { position: 34, cash: aCash });
    return roll(s, 2, 3);
  };

  it('Tiền thuê lớn hơn tiền mặt: chờ trả, Ụp/Mở gom đủ rồi trả, lượt chuyển tiếp', () => {
    const s1 = thuePhuQuoc(450, [37]);
    expect(s1.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      total: 600,
      reason: 'rent',
      creditors: [{ playerId: 'b', amount: 600 }],
    });
    const s2 = manage(s1, 'a', op('mortgage', 37));
    expect(cash(s2, 'a')).toBe(625);
    const s3 = pay(s2, 'a');
    expect(cash(s3, 'a')).toBe(25);
    expect(cash(s3, 'b')).toBe(1100);
    expect(s3.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Chỉ thanh toán khi đủ toàn bộ: gom từng phần, chưa đủ thì Trả tiền bị từ chối', () => {
    const s1 = thuePhuQuoc(300, [37], [24]);
    reject(s1, { type: 'pay', playerId: 'a' });
    const s2 = manage(s1, 'a', op('mortgage', 37));
    expect(cash(s2, 'a')).toBe(475);
    reject(s2, { type: 'pay', playerId: 'a' });
    const s3 = manage(s2, 'a', op('mortgage', 24));
    expect(cash(s3, 'a')).toBe(595);
    reject(s3, { type: 'pay', playerId: 'a' });
    expect(cash(s3, 'b')).toBe(500);
    const s4 = manage(s3, 'a', op('sell', 37));
    expect(cash(s4, 'a')).toBe(612);
    expect(tile(s4, 37).owner).toBeNull();
    const s5 = pay(s4, 'a');
    expect(cash(s5, 'a')).toBe(12);
    expect(cash(s5, 'b')).toBe(1100);
  });

  it('Tiền mặt vừa đúng tiền thuê: không nợ, bấm Trả tiền còn 0Đ', () => {
    const s1 = thuePhuQuoc(600, [37]);
    expect(s1.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 600, confirm: true });
    manageBiTuChoi(s1, 'a', op('mortgage', 37));
    const s2 = pay(s1, 'a');
    expect(cash(s2, 'a')).toBe(0);
    expect(cash(s2, 'b')).toBe(1100);
    expect(isGameOver(s2)).toBe(false);
  });

  it('Thiếu 1Đ: vào Xử lý nợ', () => {
    const s1 = thuePhuQuoc(599, [1]);
    const s2 = manage(s1, 'a', op('mortgage', 1));
    expect(cash(pay(s2, 'a'), 'a')).toBe(29);
  });

  it('Tiền mặt + giá trị thanh lý tối đa < nợ: phá sản ngay, ván kết thúc, mọi người còn lại thắng', () => {
    const s0 = own(newGame(3), 'b', 39, { level: 2 });
    own(s0, 'a', 1, { level: 1 });
    setPlayer(s0, 'a', { position: 34, cash: 100 });
    const s = roll(s0, 2, 3);
    expect(isGameOver(s)).toBe(true);
    expect(s.pending).toEqual({ type: 'ended' });
    expect(player(s, 'a').status).toBe('bankrupt');
    expect(s.loserId).toBe('a');
    expect(ids(winners(s))).toEqual(['b', 'c']);
    // Không thanh toán một phần.
    expect(cash(s, 'b')).toBe(500);
  });

  it('Biên: tiền mặt + thanh lý tối đa đúng bằng nợ thì không phá sản; thanh lý hết rồi trả về 0Đ', () => {
    // Phố Cổ 1 nhà: hạ 25Đ + bán 33Đ = 58Đ; 542 + 58 = 600.
    const s1 = thuePhuQuoc(542, [1, { level: 1 }]);
    expect(isGameOver(s1)).toBe(false);
    expect(s1.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 600 });
    const s2 = manage(s1, 'a', op('downgrade', 1), op('sell', 1));
    expect(cash(s2, 'a')).toBe(600);
    const s3 = pay(s2, 'a');
    expect(cash(s3, 'a')).toBe(0);
    expect(cash(s3, 'b')).toBe(1100);
  });

  it('Biên: tiền mặt + thanh lý tối đa thiếu 1Đ thì phá sản ngay', () => {
    const s = thuePhuQuoc(541, [1, { level: 1 }]);
    expect(isGameOver(s)).toBe(true);
    expect(player(s, 'a').status).toBe('bankrupt');
  });

  it('Thuế thiếu tiền: Xử lý nợ rồi trả Ngân hàng', () => {
    const s0 = setPlayer(own(newGame(), 'a', 39), 'a', { cash: 150 });
    const s1 = roll(s0, 1, 3);
    expect(s1.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      total: 200,
      reason: 'tax',
      creditors: [{ playerId: null, amount: 200 }],
    });
    const s2 = pay(manage(s1, 'a', op('mortgage', 39)), 'a');
    expect(cash(s2, 'a')).toBe(150);
    expect(cash(s2, 'b')).toBe(500);
    expect(s2.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Thuế không trả nổi (không tài sản): phá sản ngay', () => {
    const s = roll(setPlayer(newGame(), 'a', { cash: 150 }), 1, 3);
    expect(isGameOver(s)).toBe(true);
    expect(player(s, 'a').status).toBe('bankrupt');
  });

  it('Thẻ trả Ngân hàng thiếu tiền: Xử lý nợ rồi bấm trả', () => {
    const s0 = setPlayer(own(newGame(), 'a', 6), 'a', { cash: 60 });
    const s1 = rutKhiVan(s0, 'community-wrong-transfer');
    expect(s1.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 100, reason: 'card' });
    const s2 = pay(manage(s1, 'a', op('mortgage', 6)), 'a');
    expect(cash(s2, 'a')).toBe(10);
    expect(s2.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Thẻ trả Ngân hàng vừa đủ tiền: tự trả ngay, còn 0Đ', () => {
    const s = rutKhiVan(setPlayer(newGame(), 'a', { cash: 100 }), 'community-wrong-transfer');
    expect(cash(s, 'a')).toBe(0);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Thẻ bắt buộc mua đất mà thiếu tiền: xử lý như nợ Ngân hàng, trả xong mới nhận đất', () => {
    const s0 = setPlayer(own(newGame(), 'a', 39), 'a', { cash: 50 });
    const s1 = rutCoHoi(s0, 'chance-nearest-property');
    expect(player(s1, 'a').position).toBe(8);
    expect(s1.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      total: 100,
      creditors: [{ playerId: null, amount: 100 }],
    });
    expect(tile(s1, 8).owner).toBeNull();
    const s2 = pay(manage(s1, 'a', op('mortgage', 39)), 'a');
    expect(cash(s2, 'a')).toBe(150);
    expect(tile(s2, 8)).toMatchObject({ owner: 'a', level: 0, mortgaged: false });
  });

  it('Thẻ Đến ga gần nhất, ga vô chủ, thiếu tiền: Xử lý nợ rồi trả 200Đ và nhận ga', () => {
    const s0 = setPlayer(own(newGame(), 'a', 37), 'a', { cash: 100 });
    const s1 = rutCoHoi(s0, 'chance-nearest-station');
    expect(player(s1, 'a').position).toBe(15);
    expect(s1.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 200 });
    const s2 = pay(manage(s1, 'a', op('mortgage', 37)), 'a');
    expect(cash(s2, 'a')).toBe(75);
    expect(tile(s2, 15).owner).toBe('a');
  });

  it('Đang nợ: một bản nháp gom dư so với khoản nợ vẫn được chấp nhận', () => {
    const s1 = thuePhuQuoc(450, [37], [24]);
    const s2 = manage(s1, 'a', op('mortgage', 37), op('mortgage', 24));
    expect(cash(s2, 'a')).toBe(745);
    expect(cash(pay(s2, 'a'), 'a')).toBe(145);
  });

  it('Đang nợ: không trả được thay cho người khác, người khác không bấm Trả tiền thay', () => {
    const s1 = thuePhuQuoc(450, [37]);
    reject(s1, { type: 'pay', playerId: 'b' });
    manageBiTuChoi(s1, 'b', op('downgrade', 39));
  });

  it('Thẻ bắt buộc mua đất mà tiền + thanh lý không đủ: phá sản, đất vẫn vô chủ', () => {
    const s = rutCoHoi(setPlayer(newGame(), 'a', { cash: 50 }), 'chance-nearest-property');
    expect(isGameOver(s)).toBe(true);
    expect(player(s, 'a').status).toBe('bankrupt');
    expect(tile(s, 8).owner).toBeNull();
  });

  it('Bảo lãnh bắt buộc ở lần thử thứ 3 thiếu tiền: Xử lý nợ, trả 50Đ rồi đi theo tổng', () => {
    const s0 = oTu(own(newGame(), 'a', 1), 'a', { jailAttempts: 2, cash: 20 });
    let s1 = roll(s0, 1, 2);
    expect(s1.pending).toEqual({ type: 'jailRelease', playerId: 'a', steps: 3 });
    s1 = act(s1, { type: 'payBail', playerId: 'a' });
    expect(s1.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 50 });
    const s2 = manage(s1, 'a', op('mortgage', 1));
    expect(cash(s2, 'a')).toBe(50);
    const s3 = pay(s2, 'a');
    expect(player(s3, 'a')).toMatchObject({ position: 13, inJail: false, cash: 0 });
    expect(s3.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Bảo lãnh bắt buộc ở lần thử thứ 3 không trả nổi: phá sản', () => {
    let s = roll(oTu(newGame(), 'a', { jailAttempts: 2, cash: 20 }), 1, 2);
    expect(s.pending).toEqual({ type: 'jailRelease', playerId: 'a', steps: 3 });
    s = act(s, { type: 'payBail', playerId: 'a' });
    expect(isGameOver(s)).toBe(true);
    expect(player(s, 'a').status).toBe('bankrupt');
  });

  it('Phá sản giữa chuỗi đổ đôi: không còn lượt thêm, hàng chờ bị hủy', () => {
    const s0 = setPlayer(own(newGame(), 'b', 6, { level: 5 }), 'a', { cash: 100 });
    const s = roll(s0, 3, 3);
    expect(s.pending).toEqual({ type: 'ended' });
    expect(s.queue).toEqual([]);
    expect(player(s, 'a').status).toBe('bankrupt');
    expect(waitingFor(s)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Mục 10: nhiều người cùng nợ ngoài lượt
// ---------------------------------------------------------------------------

describe('Nợ ngoài lượt theo vòng ghế (mục 10)', () => {
  it('Sinh nhật: người ngồi sau người rút trả trước; không trả nổi thì thua, người sau không bị thu', () => {
    const s0 = setPlayer(newGame(3), 'b', { cash: 5 });
    const s = rutKhiVan(s0, 'community-birthday');
    expect(isGameOver(s)).toBe(true);
    expect(player(s, 'b').status).toBe('bankrupt');
    expect(s.loserId).toBe('b');
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'c')).toBe(500);
    expect(player(s, 'c').status).toBe('active');
    expect(ids(winners(s))).toEqual(['a', 'c']);
  });

  it('Sinh nhật: khoản đã trả giữ nguyên khi người sau phá sản', () => {
    const s0 = setPlayer(newGame(3), 'c', { cash: 5 });
    const s = rutKhiVan(s0, 'community-birthday');
    expect(isGameOver(s)).toBe(true);
    expect(s.loserId).toBe('c');
    expect(cash(s, 'a')).toBe(510);
    expect(cash(s, 'b')).toBe(490);
    expect(ids(winners(s))).toEqual(['a', 'b']);
  });

  it('Thứ tự bắt đầu từ người ngồi sau người rút, vòng qua cuối bàn (c rút: d, a, b)', () => {
    const s0 = vanLuotC();
    setPlayer(s0, 'a', { cash: 5 });
    setPlayer(s0, 'd', { cash: 5 });
    const s = rutKhiVan(s0, 'community-birthday');
    expect(isGameOver(s)).toBe(true);
    expect(s.loserId).toBe('d');
    expect(player(s, 'a').status).toBe('active');
    expect(cash(s, 'a')).toBe(5);
    expect(cash(s, 'b')).toBe(500);
  });

  it('Thứ tự vòng ghế: người đầu tiên trả được thì trả, người kế không trả nổi là người thua duy nhất', () => {
    const s0 = vanLuotC();
    setPlayer(s0, 'a', { cash: 5 });
    setPlayer(s0, 'b', { cash: 5 });
    const s = rutKhiVan(s0, 'community-birthday');
    expect(s.loserId).toBe('a');
    expect(cash(s, 'd')).toBe(490);
    expect(cash(s, 'c')).toBe(510);
    expect(player(s, 'b').status).toBe('active');
    expect(ids(winners(s))).toEqual(['b', 'c', 'd']);
  });

  it('Người nợ ngoài lượt còn tài sản: Xử lý nợ riêng, người khác bị khóa, trả xong mới tới người sau', () => {
    const s0 = own(own(own(newGame(3), 'b', 1), 'c', 3), 'a', 9);
    setPlayer(s0, 'b', { cash: 5 });
    setPlayer(s0, 'c', { cash: 5 });
    const s1 = rutKhiVan(s0, 'community-birthday');
    expect(s1.pending).toMatchObject({
      type: 'pay',
      playerId: 'b',
      total: 10,
      creditors: [{ playerId: 'a', amount: 10 }],
    });
    // Người khác bị khóa.
    manageBiTuChoi(s1, 'a', op('mortgage', 9));
    manageBiTuChoi(s1, 'c', op('mortgage', 3));
    reject(s1, { type: 'roll', playerId: 'a' });
    reject(s1, { type: 'pay', playerId: 'c' });
    // Chưa đủ thì b chưa trả được.
    reject(s1, { type: 'pay', playerId: 'b' });
    const s2 = pay(manage(s1, 'b', op('mortgage', 1)), 'b');
    expect(cash(s2, 'b')).toBe(25);
    expect(cash(s2, 'a')).toBe(510);
    expect(s2.pending).toMatchObject({ type: 'pay', playerId: 'c', total: 10 });
    const s3 = pay(manage(s2, 'c', op('mortgage', 3)), 'c');
    expect(cash(s3, 'c')).toBe(25);
    expect(cash(s3, 'a')).toBe(520);
    expect(s3.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Xét phá sản: đất đang cắm chỉ tính 5% (5 + 3 < 10 thì phá sản)', () => {
    const s0 = own(setPlayer(newGame(), 'b', { cash: 5 }), 'b', 1, { mortgaged: true });
    const s = rutKhiVan(s0, 'community-birthday');
    expect(isGameOver(s)).toBe(true);
    expect(player(s, 'b').status).toBe('bankrupt');
  });

  it('Xét phá sản: 5Đ + bán đất đang cắm 5Đ đúng bằng 10Đ thì không phá sản, bán rồi trả', () => {
    const s0 = own(setPlayer(newGame(), 'b', { cash: 5 }), 'b', 6, { mortgaged: true });
    const s1 = rutKhiVan(s0, 'community-birthday');
    expect(isGameOver(s1)).toBe(false);
    expect(s1.pending).toMatchObject({ type: 'pay', playerId: 'b', total: 10 });
    const s2 = pay(manage(s1, 'b', op('sell', 6)), 'b');
    expect(cash(s2, 'b')).toBe(0);
    expect(cash(s2, 'a')).toBe(510);
    expect(tile(s2, 6).owner).toBeNull();
  });

  it('Ủng hộ người nghèo: người rút nghèo nhất thu 20Đ mỗi người, ai không trả nổi thì thua', () => {
    const s0 = newGame(3);
    setPlayer(s0, 'a', { cash: 10 });
    setPlayer(s0, 'b', { cash: 15 });
    const s = rutKhiVan(s0, 'community-help-the-poor');
    expect(isGameOver(s)).toBe(true);
    expect(s.loserId).toBe('b');
    expect(cash(s, 'a')).toBe(10);
    expect(cash(s, 'c')).toBe(500);
  });

  it('Bầu tổng thống: tính tổng trước, không trả nổi tổng thì phá sản, không ai nhận một phần', () => {
    const s = rutKhiVan(setPlayer(newGame(3), 'a', { cash: 50 }), 'community-election');
    expect(isGameOver(s)).toBe(true);
    expect(player(s, 'a').status).toBe('bankrupt');
    expect(cash(s, 'b')).toBe(500);
    expect(cash(s, 'c')).toBe(500);
  });

  it('Bầu tổng thống thiếu tiền nhưng còn tài sản: Xử lý nợ rồi trả đủ cho từng người', () => {
    const s0 = own(setPlayer(newGame(3), 'a', { cash: 50 }), 'a', 1);
    const s1 = rutKhiVan(s0, 'community-election');
    expect(s1.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 60 });
    const s2 = pay(manage(s1, 'a', op('mortgage', 1)), 'a');
    expect(cash(s2, 'a')).toBe(20);
    expect(cash(s2, 'b')).toBe(530);
    expect(cash(s2, 'c')).toBe(530);
  });

  it('Kẻ khóc người cười: người giữ thẻ phải trả 40Đ mà không trả nổi thì thua', () => {
    const s0 = giuThe(newGame(), 'b', 'community-fortune-mirror', 'fortuneMirror');
    setPlayer(s0, 'b', { cash: 10 });
    const s = rutKhiVan(s0, 'community-god-of-wealth');
    expect(isGameOver(s)).toBe(true);
    expect(s.loserId).toBe('b');
    expect(cash(s, 'a')).toBe(600);
  });

  it('Kẻ khóc người cười: người giữ thẻ thiếu tiền nhưng còn tài sản thì Xử lý nợ rồi trả 40Đ', () => {
    const s0 = giuThe(own(newGame(), 'b', 9), 'b', 'community-fortune-mirror', 'fortuneMirror');
    setPlayer(s0, 'b', { cash: 10 });
    const s1 = rutKhiVan(s0, 'community-god-of-wealth');
    expect(s1.pending).toMatchObject({
      type: 'pay',
      playerId: 'b',
      total: 40,
      creditors: [{ playerId: 'a', amount: 40 }],
    });
    const s2 = pay(manage(s1, 'b', op('mortgage', 9)), 'b');
    expect(cash(s2, 'b')).toBe(30);
    expect(cash(s2, 'a')).toBe(640);
  });

  it('Phá sản ngoài lượt hủy các hiệu ứng còn chờ (Kẻ khóc người cười chưa kích hoạt)', () => {
    const s0 = giuThe(newGame(3), 'c', 'community-fortune-mirror', 'fortuneMirror');
    setPlayer(s0, 'b', { cash: 5 });
    const s = rutKhiVan(s0, 'community-birthday');
    expect(s.loserId).toBe('b');
    expect(s.queue).toEqual([]);
    expect(cash(s, 'c')).toBe(500);
    expect(cash(s, 'a')).toBe(500);
  });

  it('Ủng hộ người nghèo: người nợ ngoài lượt còn tài sản thì Xử lý nợ rồi trả 20Đ', () => {
    const s0 = own(newGame(), 'b', 3);
    setPlayer(s0, 'a', { cash: 10 });
    setPlayer(s0, 'b', { cash: 15 });
    const s1 = rutKhiVan(s0, 'community-help-the-poor');
    expect(s1.pending).toMatchObject({
      type: 'pay',
      playerId: 'b',
      total: 20,
      creditors: [{ playerId: 'a', amount: 20 }],
    });
    const s2 = pay(manage(s1, 'b', op('mortgage', 3)), 'b');
    expect(cash(s2, 'b')).toBe(25);
    expect(cash(s2, 'a')).toBe(30);
  });

  it('Thằng Bờm: đối thủ phải trả 100Đ phạt mà không trả nổi thì thua', () => {
    // 2 người: viên 1 = 1 (b), viên 2 = 2 (chẵn, đổi đất rẻ nhất); a không có đất nên b trả phạt.
    const s = rutKhiVan(setPlayer(newGame(), 'b', { cash: 50 }), 'community-swap', [1, 2]);
    expect(isGameOver(s)).toBe(true);
    expect(s.loserId).toBe('b');
    expect(cash(s, 'a')).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Giá trị thanh lý tối đa
// ---------------------------------------------------------------------------

describe('Giá trị thanh lý tối đa (mục 10)', () => {
  it('Không có tài sản: 0Đ', () => {
    expect(maxLiquidationValue(newGame(), 'a')).toBe(0);
  });

  it('Hạ hết công trình (50% giá xây mỗi cấp) rồi bán (55%, hoặc 5% nếu đang cắm); không tính ô người khác', () => {
    const s = newGame();
    own(s, 'a', 39, { level: 5 }); // 5 × 100 + 220
    own(s, 'a', 5, { mortgaged: true }); // 10
    own(s, 'a', 12); // 82
    own(s, 'a', 1, { level: 2 }); // 2 × 25 + 33
    own(s, 'b', 37, { level: 3 });
    expect(maxLiquidationValue(s, 'a')).toBe(500 + 220 + 10 + 82 + 50 + 33);
    expect(maxLiquidationValue(s, 'b')).toBe(3 * 100 + 192);
  });

  it('Bằng đúng số tiền gom được khi tự tay thanh lý hết', () => {
    const s0 = newGame();
    own(s0, 'a', 39, { level: 5 });
    own(s0, 'a', 5, { mortgaged: true });
    own(s0, 'a', 12);
    own(s0, 'a', 1, { level: 2 });
    const max = maxLiquidationValue(s0, 'a');
    const ha = (i: number, n: number) => Array.from({ length: n }, () => op('downgrade', i));
    const s = manage(
      s0,
      'a',
      ...ha(39, 5),
      op('sell', 39),
      op('sell', 5),
      op('mortgage', 12),
      op('sell', 12),
      ...ha(1, 2),
      op('sell', 1),
    );
    expect(cash(s, 'a') - 500).toBe(max);
    expect(maxLiquidationValue(s, 'a')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Đầu hàng và kết thúc ván
// ---------------------------------------------------------------------------

describe('Đầu hàng (mục 10)', () => {
  it('Người đang có lượt đầu hàng: thua, tất cả người còn lại thắng, ván kết thúc ngay', () => {
    const s = surrender(newGame(3), 'a');
    expect(isGameOver(s)).toBe(true);
    expect(player(s, 'a').status).toBe('surrendered');
    expect(s.loserId).toBe('a');
    expect(ids(winners(s))).toEqual(['b', 'c']);
    expect(waitingFor(s)).toBeNull();
  });

  it('Người không tới lượt cũng đầu hàng được khi không có khoản phải trả', () => {
    const s = surrender(newGame(3), 'c');
    expect(isGameOver(s)).toBe(true);
    expect(player(s, 'c').status).toBe('surrendered');
    expect(ids(winners(s))).toEqual(['a', 'b']);
  });

  it('Đang chờ bấm Trả tiền thuê (đủ tiền) thì không ai đầu hàng được (thao tác khác bị khóa)', () => {
    const s = roll(own(newGame(3), 'b', 6), 2, 4);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a' });
    reject(s, { type: 'surrender', playerId: 'a' });
    reject(s, { type: 'surrender', playerId: 'b' });
    reject(s, { type: 'surrender', playerId: 'c' });
    // Trả xong thì đầu hàng được.
    const s2 = surrender(act(s, { type: 'pay', playerId: 'a' }), 'b');
    expect(s2.loserId).toBe('b');
  });

  it('Đang nợ (Xử lý nợ) thì không đầu hàng được', () => {
    const s0 = setPlayer(own(own(newGame(), 'b', 6, { level: 3 }), 'a', 39), 'a', { cash: 100 });
    const s = roll(s0, 2, 4);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 270 });
    reject(s, { type: 'surrender', playerId: 'a' });
  });

  it('Đang nợ ngoài lượt thì chính người nợ không đầu hàng được', () => {
    const s0 = own(setPlayer(newGame(3), 'b', { cash: 5 }), 'b', 1);
    const s = rutKhiVan(s0, 'community-birthday');
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'b' });
    reject(s, { type: 'surrender', playerId: 'b' });
  });

  it('Đang chờ thuế đủ tiền (nút Là nó) thì không đầu hàng được', () => {
    const s = roll(newGame(), 1, 3);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', reason: 'tax' });
    reject(s, { type: 'surrender', playerId: 'a' });
  });

  it('Đầu hàng hủy các hiệu ứng đang chờ (đang chờ mua, còn lượt đổ đôi)', () => {
    const s1 = roll(newGame(), 3, 3);
    expect(s1.pending).toEqual({ type: 'buy', playerId: 'a', tile: 6 });
    const s2 = surrender(s1, 'b');
    expect(s2.pending).toEqual({ type: 'ended' });
    expect(s2.queue).toEqual([]);
    expect(tile(s2, 6).owner).toBeNull();
    expect(cash(s2, 'a')).toBe(500);
    reject(s2, { type: 'buy', playerId: 'a' });
    reject(s2, { type: 'roll', playerId: 'a' });
  });

  it('Chủ nợ cũng không đầu hàng được khi người khác đang Xử lý nợ (thao tác khác bị khóa)', () => {
    const s0 = setPlayer(own(own(newGame(), 'b', 6, { level: 3 }), 'a', 39), 'a', { cash: 100 });
    const s1 = roll(s0, 2, 4);
    expect(s1.pending).toMatchObject({ type: 'pay', playerId: 'a' });
    reject(s1, { type: 'surrender', playerId: 'b' });
  });

  it('Người còn khoản trả ngoài lượt đang xếp hàng không đầu hàng được', () => {
    // Sinh nhật 3 người: b đang nợ, khoản 10Đ của c còn xếp hàng phía sau.
    const s0 = own(setPlayer(newGame(3), 'b', { cash: 5 }), 'b', 1);
    const s = rutKhiVan(s0, 'community-birthday');
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'b' });
    reject(s, { type: 'surrender', playerId: 'c' });
  });

  it('Đầu hàng khi đang ở tù (chưa đổ): được', () => {
    const s = surrender(oTu(newGame(), 'a'), 'a');
    expect(s.loserId).toBe('a');
  });

  it('Người đang có lượt đầu hàng khi đang chờ mua: thua, đất không được mua', () => {
    const s = surrender(roll(newGame(), 1, 2), 'a');
    expect(s.loserId).toBe('a');
    expect(tile(s, 3).owner).toBeNull();
  });
});

describe('Kết thúc ván (mục 10)', () => {
  const vanDaKetThuc = (): GameState => {
    const s0 = setPlayer(own(own(newGame(3), 'b', 6, { level: 5 }), 'c', 9), 'a', { cash: 100 });
    return roll(s0, 3, 3);
  };

  it('Sau khi ván kết thúc, mọi thao tác đều bị từ chối', () => {
    const s = vanDaKetThuc();
    expect(isGameOver(s)).toBe(true);
    const actions: Action[] = [
      { type: 'roll', playerId: 'a' },
      { type: 'roll', playerId: 'b' },
      { type: 'pay', playerId: 'a' },
      { type: 'buy', playerId: 'b' },
      { type: 'manage', playerId: 'b', ops: [op('downgrade', 6)] },
      { type: 'manage', playerId: 'c', ops: [op('mortgage', 9)] },
      { type: 'surrender', playerId: 'b' },
      { type: 'surrender', playerId: 'a' },
      { type: 'payBail', playerId: 'b' },
      { type: 'metro', playerId: 'b', destination: 5 },
      { type: 'chooseTile', playerId: 'b', tile: 1 },
      { type: 'changeAppearance', playerId: 'b', color: 7, icon: 19 },
      { type: 'timeout' },
    ];
    for (const a of actions) reject(s, a, [1, 2]);
  });

  it('Người thua là người phá sản; tất cả người còn lại thắng; không còn chờ ai', () => {
    const s = vanDaKetThuc();
    expect(s.loserId).toBe('a');
    expect(player(s, 'a').status).toBe('bankrupt');
    expect(player(s, 'b').status).toBe('active');
    expect(player(s, 'c').status).toBe('active');
    expect(ids(winners(s))).toEqual(['b', 'c']);
    expect(waitingFor(s)).toBeNull();
  });

  it('Ván chưa kết thúc thì chưa có người thắng', () => {
    const s = newGame(3);
    expect(isGameOver(s)).toBe(false);
    expect(winners(s)).toEqual([]);
    expect(waitingFor(s)).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// Mục 11: hết giờ
// ---------------------------------------------------------------------------

describe('Hết giờ: gieo và xác nhận bắt buộc được làm thay, lựa chọn tự nguyện bị bỏ qua (mục 11)', () => {
  it('Hết giờ lúc chờ đổ: máy chủ tự đổ', () => {
    const s = timeout(newGame(), [1, 2]);
    expect(player(s, 'a').position).toBe(3);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 3 });
  });

  it('Hết giờ lúc chờ mua: bỏ qua, ô vẫn vô chủ, lượt chuyển tiếp', () => {
    const s = timeout(roll(newGame(), 1, 2));
    expect(tile(s, 3).owner).toBeNull();
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Hết giờ lúc chờ nâng cấp: bỏ qua', () => {
    const s = timeout(roll(own(newGame(), 'a', 6, { level: 1 }), 2, 4));
    expect(tile(s, 6).level).toBe(1);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Hết giờ ở Metro: ở lại ô 10, không mất tiền', () => {
    const s1 = roll(newGame(), 4, 6);
    expect(s1.pending).toEqual({ type: 'metro', playerId: 'a' });
    const s = timeout(s1);
    expect(player(s, 'a').position).toBe(10);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Hết giờ ở tù: thử đổ đôi, không tự trả 50Đ', () => {
    const s = timeout(oTu(newGame(), 'a'), [1, 2]);
    expect(player(s, 'a')).toMatchObject({
      inJail: true,
      position: 10,
      cash: 500,
      jailAttempts: 1,
    });
    expect(s.pending).toEqual({ type: 'jail', playerId: 'a' });
  });

  it('Hết giờ ở tù, đổ ra đôi: ra tù, đi theo số đó, không có lượt thêm', () => {
    const s = timeout(oTu(newGame(), 'a'), [2, 2]);
    expect(player(s, 'a')).toMatchObject({ inJail: false, position: 14, cash: 500 });
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 14 });
    expect(timeout(s).pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Hết giờ lần thử thứ 3 thất bại, có thẻ ra tù: dùng thẻ rồi đi theo tổng', () => {
    const s0 = giuThe(
      oTu(newGame(), 'a', { jailAttempts: 2 }),
      'a',
      'community-jail-free',
      'jailFree',
    );
    const s1 = timeout(s0, [1, 2]);
    const s = s1.pending.type === 'jailRelease' ? timeout(s1) : s1;
    expect(player(s, 'a')).toMatchObject({ inJail: false, position: 13, cash: 500, heldCards: [] });
    expect(s.decks.community).toContain('community-jail-free');
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 13 });
  });

  it('Hết giờ lần thử thứ 3 thất bại: dừng ở lựa chọn bắt buộc; hết giờ lần nữa mới tự trả 50Đ', () => {
    const s1 = timeout(oTu(newGame(), 'a', { jailAttempts: 2 }), [1, 2]);
    expect(s1.pending).toEqual({ type: 'jailRelease', playerId: 'a', steps: 3 });
    const s = timeout(s1);
    expect(player(s, 'a')).toMatchObject({ inJail: false, position: 13, cash: 450 });
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 13 });
  });

  it('Hết giờ khi chờ bấm Trả tiền thuê đủ tiền: tự trả, không đụng tài sản', () => {
    const s1 = roll(own(own(newGame(), 'b', 6, { level: 3 }), 'a', 39), 2, 4);
    const s = timeout(s1);
    expect(cash(s, 'a')).toBe(230);
    expect(cash(s, 'b')).toBe(770);
    expect(tile(s, 39)).toMatchObject({ owner: 'a', mortgaged: false });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Hết giờ ở ô thuế: tự bấm Là nó', () => {
    const s = timeout(roll(newGame(), 1, 3));
    expect(cash(s, 'a')).toBe(300);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Hết giờ khi chọn ô Cao tốc: chọn đất màu đầu tiên phía trước người rút', () => {
    const s0 = newGame();
    setPlayer(s0, 'a', { position: 30 });
    topCard(s0, 'community-highway');
    const s1 = roll(s0, 1, 2);
    expect(s1.pending).toMatchObject({ type: 'chooseTile', playerId: 'a', purpose: 'highway' });
    const s = timeout(s1, [4]);
    expect(player(s, 'a').position).toBe(34);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 34 });
  });

  it('Hết giờ ở Canh bạc xây dựng: nâng đất hợp lệ có số ô nhỏ nhất', () => {
    const s0 = newGame(3);
    for (const i of [9, 6]) own(s0, 'a', i);
    for (const i of [11, 13, 14]) own(s0, 'b', i);
    for (const i of [16, 18, 19]) own(s0, 'c', i);
    const s1 = rutCoHoi(s0, 'chance-building-gamble');
    expect(s1.pending).toMatchObject({ type: 'chooseTile', playerId: 'a', purpose: 'gambleUp' });
    const s = timeout(s1);
    expect(tile(s, 6).level).toBe(1);
    expect(tile(s, 9).level).toBe(0);
    expect(cash(s, 'a')).toBe(500);
  });

  it('Hết giờ ở Canh bạc xây dựng (nhiều đất hơn): hạ 1 cấp đất có công trình có số ô nhỏ nhất', () => {
    const s0 = newGame(2);
    own(s0, 'a', 9, { level: 1 });
    own(s0, 'a', 8, { level: 2 });
    own(s0, 'a', 39);
    const s1 = rutCoHoi(s0, 'chance-building-gamble');
    expect(s1.pending).toMatchObject({ type: 'chooseTile', playerId: 'a', purpose: 'gambleDown' });
    const s = timeout(s1);
    expect(tile(s, 8).level).toBe(1);
    expect(tile(s, 9).level).toBe(1);
    expect(cash(s, 'a')).toBe(500);
  });

  it('Hết giờ ở lượt thêm sau đổ đôi: máy chủ tự đổ', () => {
    const s1 = act(roll(newGame(), 3, 3), { type: 'declineBuy', playerId: 'a' });
    expect(s1.pending).toEqual({ type: 'roll', playerId: 'a' });
    const s = timeout(s1, [1, 2]);
    expect(player(s, 'a').position).toBe(9);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 9 });
  });
});

describe('Hết giờ khi đang nợ: máy chủ thanh lý theo thứ tự mặc định rồi tự trả (mục 11)', () => {
  /** b có Phú Quốc 1 nhà (thuê 200Đ); a đứng ở ô 34 đổ 2 + 3 tới ô 39. */
  const noThuePhuQuoc = (s: GameState, aCash: number): GameState => {
    own(s, 'b', 39, { level: 1 });
    setPlayer(s, 'a', { position: 34, cash: aCash });
    return roll(s, 2, 3);
  };

  it('Cắm ô không có công trình trước, rẻ trước; dừng ngay khi đủ rồi trả', () => {
    const s0 = newGame();
    own(s0, 'a', 1); // 60
    own(s0, 'a', 12); // 150
    own(s0, 'a', 5); // 200
    own(s0, 'a', 37); // 350
    own(s0, 'a', 6, { level: 2 });
    const s1 = noThuePhuQuoc(s0, 150);
    expect(s1.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 200 });
    const s = timeout(s1);
    // 150 + 30 (Phố Cổ) = 180 < 200; + 75 (Nhà Máy Điện) = 255: đủ.
    expect(tile(s, 1).mortgaged).toBe(true);
    expect(tile(s, 12).mortgaged).toBe(true);
    expect(tile(s, 5).mortgaged).toBe(false);
    expect(tile(s, 37).mortgaged).toBe(false);
    expect(tile(s, 6)).toMatchObject({ level: 2, mortgaged: false });
    expect(cash(s, 'a')).toBe(55);
    expect(cash(s, 'b')).toBe(700);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Ga và nhà máy cũng là ô không có công trình: cắm trước khi hạ nhà', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { level: 1 });
    own(s0, 'a', 15); // ga 200
    const s = timeout(noThuePhuQuoc(s0, 150));
    expect(tile(s, 15).mortgaged).toBe(true);
    expect(tile(s, 1)).toMatchObject({ level: 1, mortgaged: false });
    expect(cash(s, 'a')).toBe(50);
  });

  it('Cắm hết ô trống rồi mới hạ từng cấp ở đất có tiền thuê thấp nhất; hạ hết thì cắm đất đó', () => {
    const s0 = newGame();
    own(s0, 'a', 1); // trống
    own(s0, 'a', 6, { level: 1 }); // thuê 30
    own(s0, 'a', 39, { level: 1 }); // thuê 200
    setPlayer(s0, 'a', { cash: 50 });
    const s1 = roll(s0, 1, 3); // thuế 200
    expect(s1.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 200 });
    const s = timeout(s1);
    // 50 +30 (cắm 01) +25 (hạ 06) +50 (cắm 06) +100 (hạ 39) = 255: đủ, không cắm 39.
    expect(tile(s, 1).mortgaged).toBe(true);
    expect(tile(s, 6)).toMatchObject({ owner: 'a', level: 0, mortgaged: true });
    expect(tile(s, 39)).toMatchObject({ owner: 'a', level: 0, mortgaged: false });
    expect(cash(s, 'a')).toBe(55);
  });

  it('Hạ cấp theo tiền thuê hiện tại thấp nhất, không theo giá đất', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { level: 5 }); // khách sạn Phố Cổ: thuê 250
    own(s0, 'a', 37, { level: 1 }); // Tháp Chăm 1 nhà: thuê 175
    setPlayer(s0, 'a', { cash: 150 });
    const s = timeout(roll(s0, 1, 3));
    expect(tile(s, 37)).toMatchObject({ level: 0, mortgaged: false });
    expect(tile(s, 1).level).toBe(5);
    expect(cash(s, 'a')).toBe(50);
  });

  it('Hạ từng cấp một, dừng ngay khi đủ', () => {
    const s0 = setPlayer(own(newGame(), 'a', 39, { level: 5 }), 'a', { cash: 50 });
    const s = timeout(roll(s0, 1, 3));
    expect(tile(s, 39)).toMatchObject({ level: 3, mortgaged: false });
    expect(cash(s, 'a')).toBe(50);
  });

  it('Cuối cùng bán ô đang cắm, rẻ trước', () => {
    const s0 = newGame();
    own(s0, 'a', 1, { mortgaged: true }); // bán 3
    own(s0, 'a', 5, { mortgaged: true }); // bán 10
    own(s0, 'a', 39, { mortgaged: true }); // bán 20
    setPlayer(s0, 'a', { cash: 190 });
    const s = timeout(roll(s0, 1, 3));
    expect(tile(s, 1).owner).toBeNull();
    expect(tile(s, 5).owner).toBeNull();
    expect(tile(s, 39)).toMatchObject({ owner: 'a', mortgaged: true });
    expect(cash(s, 'a')).toBe(3);
  });

  it('Phải thanh lý hết: cắm, hạ, cắm, bán đúng trình tự rồi trả, còn 0Đ', () => {
    const s0 = own(newGame(), 'b', 39, { level: 2 }); // thuê 600
    own(s0, 'a', 1, { level: 1 });
    own(s0, 'a', 5);
    setPlayer(s0, 'a', { position: 34, cash: 432 }); // 432 + 25 + 33 + 110 = 600
    const s1 = roll(s0, 2, 3);
    expect(s1.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 600 });
    const s = timeout(s1);
    expect(tile(s, 1).owner).toBeNull();
    expect(tile(s, 5).owner).toBeNull();
    expect(cash(s, 'a')).toBe(0);
    expect(cash(s, 'b')).toBe(1100);
    expect(isGameOver(s)).toBe(false);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Hết giờ khi đang nợ ngoài lượt: thanh lý người nợ, trả, rồi tới người sau', () => {
    const s0 = newGame(3);
    own(s0, 'b', 1);
    own(s0, 'b', 39);
    setPlayer(s0, 'b', { cash: 5 });
    const s1 = rutKhiVan(s0, 'community-birthday');
    expect(s1.pending).toMatchObject({ type: 'pay', playerId: 'b', total: 10 });
    const s = timeout(s1);
    expect(tile(s, 1).mortgaged).toBe(true);
    expect(tile(s, 39).mortgaged).toBe(false);
    expect(cash(s, 'b')).toBe(25);
    expect(cash(s, 'c')).toBe(490);
    expect(cash(s, 'a')).toBe(520);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Hết giờ khi nợ thẻ bắt buộc mua: thanh lý, trả và nhận đất', () => {
    const s0 = own(setPlayer(newGame(), 'a', { cash: 50 }), 'a', 39);
    const s = timeout(rutCoHoi(s0, 'chance-nearest-property'));
    expect(tile(s, 39).mortgaged).toBe(true);
    expect(tile(s, 8).owner).toBe('a');
    expect(cash(s, 'a')).toBe(150);
  });

  it('Hết giờ khi nợ bảo lãnh lần thử thứ 3: thanh lý, trả 50Đ rồi đi theo tổng', () => {
    const s0 = oTu(own(newGame(), 'a', 1), 'a', { jailAttempts: 2, cash: 20 });
    let s1 = timeout(s0, [1, 2]);
    expect(s1.pending).toEqual({ type: 'jailRelease', playerId: 'a', steps: 3 });
    s1 = timeout(s1);
    expect(s1.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 50 });
    const s = timeout(s1);
    expect(tile(s, 1).mortgaged).toBe(true);
    expect(player(s, 'a')).toMatchObject({ position: 13, inJail: false, cash: 0 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('Hết giờ khi nợ thuế: Phố Cổ và Chợ Đồng Xuân cùng giá thì chỉ cắm một ô nếu đã đủ', () => {
    const s0 = own(own(newGame(), 'a', 3), 'a', 1);
    setPlayer(s0, 'a', { cash: 175 });
    const s = timeout(roll(s0, 1, 3));
    const camCount = [1, 3].filter((i) => tile(s, i).mortgaged).length;
    expect(camCount).toBe(1);
    expect(cash(s, 'a')).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Tiền không tự sinh ra hay mất đi (ngoài Ngân hàng)
// ---------------------------------------------------------------------------

describe('Bảo toàn tiền giữa người chơi', () => {
  it('Trả tiền thuê: tổng tiền mặt không đổi', () => {
    const s1 = roll(own(newGame(3), 'b', 6, { level: 3 }), 2, 4);
    const before = totalCash(s1);
    const s2 = pay(s1, 'a');
    expect(totalCash(s2)).toBe(before);
    expect(cash(s2, 'b') - cash(s1, 'b')).toBe(270);
  });

  it('Sinh nhật 4 người: tổng không đổi, người rút nhận đúng 30Đ', () => {
    const s0 = newGame(4);
    const before = totalCash(s0);
    const s = rutKhiVan(s0, 'community-birthday');
    expect(totalCash(s)).toBe(before);
    expect(cash(s, 'a')).toBe(530);
  });

  it('Bầu tổng thống: tổng không đổi', () => {
    const s0 = newGame(4);
    const before = totalCash(s0);
    const s = rutKhiVan(s0, 'community-election');
    expect(totalCash(s)).toBe(before);
    expect(cash(s, 'a')).toBe(410);
  });

  it('Xử lý nợ tiền thuê: tổng chỉ tăng đúng bằng tiền Ngân hàng trả cho thao tác cắm', () => {
    const s0 = own(own(newGame(), 'b', 39, { level: 2 }), 'a', 37);
    setPlayer(s0, 'a', { position: 34, cash: 450 });
    const before = totalCash(s0);
    const s = pay(manage(roll(s0, 2, 3), 'a', op('mortgage', 37)), 'a');
    expect(totalCash(s)).toBe(before + 175);
  });

  it('Phá sản không làm tiền người khác thay đổi', () => {
    const s0 = setPlayer(own(newGame(3), 'b', 6, { level: 5 }), 'a', { cash: 100 });
    const s = roll(s0, 2, 4);
    expect(isGameOver(s)).toBe(true);
    expect(cash(s, 'b')).toBe(500);
    expect(cash(s, 'c')).toBe(500);
  });
});

describe('Nhật ký giao dịch (mục 11)', () => {
  it('Nhật ký ghi từng thao tác Ụp/Mở với đúng số tiền thay đổi (mục 11)', () => {
    const s0 = own(own(newGame(), 'a', 39, { level: 1 }), 'a', 1, { mortgaged: true });
    const s = manage(s0, 'a', op('downgrade', 39), op('mortgage', 39), op('sell', 1));
    const amounts = s.log.filter((e) => e.playerId === 'a').map((e) => e.amount);
    expect(amounts).toEqual([100, 200, 3]);
    expect(cash(s, 'a') - cash(s0, 'a')).toBe(303);
  });

  it('Nhật ký ghi khoản trả nợ và việc phá sản (mục 11)', () => {
    const s0 = own(own(newGame(), 'b', 39, { level: 2 }), 'a', 37);
    setPlayer(s0, 'a', { position: 34, cash: 450 });
    const s1 = pay(manage(roll(s0, 2, 3), 'a', op('mortgage', 37)), 'a');
    expect(s1.log.some((e) => e.playerId === 'a' && e.amount === -600)).toBe(true);
    const s2 = roll(setPlayer(newGame(), 'a', { cash: 150 }), 1, 3);
    expect(isGameOver(s2)).toBe(true);
    expect(s2.log.length).toBeGreaterThan(0);
    expect(s2.log[s2.log.length - 1]!.playerId).toBe('a');
  });
});
