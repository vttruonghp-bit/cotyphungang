import { describe, expect, it } from 'vitest';
import type { GameState } from '../../src';
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
} from './helpers';

// Bảng giá mục 7 của docs/luat-choi.md, chép tay từ tài liệu (không lấy từ board.ts):
// giá mua, tiền thuê [trống, 1–4 nhà, khách sạn], giá xây 1 cấp, tiền chuộc (55% làm tròn xuống).
interface Land {
  tile: number;
  name: string;
  price: number;
  rents: number[];
  build: number;
  redeem: number;
}

const LANDS: Land[] = [
  { tile: 1, name: 'Phố Cổ', price: 60, rents: [2, 10, 30, 90, 160, 250], build: 50, redeem: 33 },
  {
    tile: 3,
    name: 'Chợ Đồng Xuân',
    price: 60,
    rents: [2, 10, 30, 90, 160, 250],
    build: 50,
    redeem: 33,
  },
  {
    tile: 6,
    name: 'Bưu Điện Hà Nội',
    price: 100,
    rents: [6, 30, 90, 270, 400, 550],
    build: 50,
    redeem: 55,
  },
  {
    tile: 8,
    name: 'Nhà Hát Lớn',
    price: 100,
    rents: [6, 30, 90, 270, 400, 550],
    build: 50,
    redeem: 55,
  },
  {
    tile: 9,
    name: 'Tháp Rùa',
    price: 120,
    rents: [8, 40, 100, 300, 450, 600],
    build: 50,
    redeem: 66,
  },
  {
    tile: 11,
    name: 'Quảng Trường Ba Đình',
    price: 140,
    rents: [10, 50, 150, 450, 625, 750],
    build: 100,
    redeem: 77,
  },
  {
    tile: 13,
    name: 'Hoàng Thành',
    price: 140,
    rents: [10, 50, 150, 450, 625, 750],
    build: 100,
    redeem: 77,
  },
  {
    tile: 14,
    name: 'Văn Miếu',
    price: 160,
    rents: [12, 60, 180, 500, 700, 900],
    build: 100,
    redeem: 88,
  },
  {
    tile: 16,
    name: 'Vịnh Hạ Long',
    price: 180,
    rents: [14, 70, 200, 550, 750, 950],
    build: 100,
    redeem: 99,
  },
  {
    tile: 18,
    name: 'Sơn Đoòng',
    price: 180,
    rents: [14, 70, 200, 550, 750, 950],
    build: 100,
    redeem: 99,
  },
  {
    tile: 19,
    name: 'Tràng An',
    price: 200,
    rents: [16, 80, 220, 600, 800, 1000],
    build: 100,
    redeem: 110,
  },
  {
    tile: 21,
    name: 'Cầu Rồng Đà Nẵng',
    price: 220,
    rents: [18, 90, 250, 700, 875, 1050],
    build: 150,
    redeem: 121,
  },
  {
    tile: 23,
    name: 'Cung Đình Huế',
    price: 220,
    rents: [18, 90, 250, 700, 875, 1050],
    build: 150,
    redeem: 121,
  },
  {
    tile: 24,
    name: 'Hội An',
    price: 240,
    rents: [20, 100, 300, 750, 925, 1100],
    build: 150,
    redeem: 132,
  },
  {
    tile: 26,
    name: 'Dinh Độc Lập',
    price: 260,
    rents: [22, 110, 330, 800, 975, 1150],
    build: 150,
    redeem: 143,
  },
  {
    tile: 27,
    name: 'Nhà Thờ Đức Bà',
    price: 260,
    rents: [22, 110, 330, 800, 975, 1150],
    build: 150,
    redeem: 143,
  },
  {
    tile: 29,
    name: 'Bến Nhà Rồng',
    price: 280,
    rents: [24, 120, 360, 850, 1025, 1200],
    build: 150,
    redeem: 154,
  },
  {
    tile: 31,
    name: 'Chợ Bến Thành',
    price: 300,
    rents: [26, 130, 390, 900, 1100, 1275],
    build: 200,
    redeem: 165,
  },
  {
    tile: 32,
    name: 'Landmark 81',
    price: 300,
    rents: [26, 130, 390, 900, 1100, 1275],
    build: 200,
    redeem: 165,
  },
  {
    tile: 34,
    name: 'Bitexco',
    price: 320,
    rents: [28, 150, 450, 1000, 1200, 1400],
    build: 200,
    redeem: 176,
  },
  {
    tile: 37,
    name: 'Tháp Chăm',
    price: 350,
    rents: [35, 175, 500, 1100, 1300, 1500],
    build: 200,
    redeem: 192,
  },
  {
    tile: 39,
    name: 'Phú Quốc',
    price: 400,
    rents: [50, 200, 600, 1400, 1700, 2000],
    build: 200,
    redeem: 220,
  },
];

const STATIONS = [5, 15, 25, 35];
const UTILITIES = [12, 28];
const STATION_PRICE = 200;
const STATION_REDEEM = 110;
const UTILITY_PRICE = 150;
const UTILITY_REDEEM = 82;

const OWNABLE: { tile: number; name: string; price: number }[] = [
  ...LANDS.map(({ tile, name, price }) => ({ tile, name, price })),
  ...STATIONS.map((tile) => ({ tile, name: `ga ô ${tile}`, price: STATION_PRICE })),
  ...UTILITIES.map((tile) => ({ tile, name: `nhà máy ô ${tile}`, price: UTILITY_PRICE })),
];

const RENT_WAIVER = 'chance-rent-waiver';

const buy = (s: GameState, id = 'a') => act(s, { type: 'buy', playerId: id });
const declineBuy = (s: GameState, id = 'a') => act(s, { type: 'declineBuy', playerId: id });
const upgrade = (s: GameState, id = 'a') => act(s, { type: 'upgrade', playerId: id });
const skipUpgrade = (s: GameState, id = 'a') => act(s, { type: 'skipUpgrade', playerId: id });
const pay = (s: GameState, id = 'a') => act(s, { type: 'pay', playerId: id });
const timeout = (s: GameState) => act(s, { type: 'timeout' });

/** Đặt `a` cách ô `tile` 3 bước rồi đổ 1 + 2 (không phải đôi) để dừng đúng ô đó. */
function landA(s: GameState, tile: number, ...extra: number[]): GameState {
  setPlayer(s, 'a', { position: (tile + 37) % 40 });
  return roll(s, 1, 2, ...extra);
}

/** Cho `id` giữ thẻ Miễn thuế nhà đất (rút khỏi chồng Cơ Hội như khi rút thật). */
function giveRentWaiver(s: GameState, id: string): GameState {
  s.decks.chance = s.decks.chance.filter((c) => c !== RENT_WAIVER);
  player(s, id).heldCards.push({ cardId: RENT_WAIVER, kind: 'rentWaiver' });
  return s;
}

const holdsWaiver = (s: GameState, id: string) =>
  player(s, id).heldCards.some((c) => c.kind === 'rentWaiver');

/** Nếu ván đang chờ `id` bấm Trả tiền thì bấm (dùng khi luật không nói rõ có bước xác nhận hay không). */
function settle(s: GameState, id = 'a'): GameState {
  return s.pending.type === 'pay' && s.pending.playerId === id ? pay(s, id) : s;
}

const rentPending = (payer: string, owner: string, amount: number) => ({
  type: 'pay',
  playerId: payer,
  reason: 'rent',
  confirm: true,
  total: amount,
  creditors: [{ playerId: owner, amount }],
});

// ---------------------------------------------------------------------------
// Mục 4: mua ô vô chủ
// ---------------------------------------------------------------------------

describe('mua đất, ga, nhà máy vô chủ (mục 4)', () => {
  it('dừng ở đất vô chủ thì được hỏi mua; mua theo đúng giá gốc', () => {
    let s = roll(newGame(), 1, 2);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 3 });
    s = buy(s);
    expect(cash(s, 'a')).toBe(440);
    expect(s.tiles[3]).toMatchObject({ owner: 'a', level: 0, mortgaged: false });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it.each(OWNABLE)('mua ô $tile ($name) đúng giá $price', ({ tile, price }) => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 1000 });
    s = landA(s, tile);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile });
    const before = cash(s, 'a');
    s = buy(s);
    expect(cash(s, 'a')).toBe(before - price);
    expect(s.tiles[tile]).toMatchObject({ owner: 'a', level: 0, mortgaged: false });
  });

  it('mua đất: tiền vào Ngân hàng, tổng tiền người chơi giảm đúng giá', () => {
    let s = roll(newGame(), 1, 2);
    const before = totalCash(s);
    s = buy(s);
    expect(totalCash(s)).toBe(before - 60);
    expect(cash(s, 'b')).toBe(500);
  });

  it('không mua thì ô vẫn vô chủ, người sau dừng ở đó vẫn được hỏi mua', () => {
    let s = roll(newGame(), 1, 2);
    s = declineBuy(s);
    expect(s.tiles[3]).toMatchObject({ owner: null, level: 0, mortgaged: false });
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'b', tile: 3 });
  });

  it('thiếu 1Đ so với giá vẫn được hỏi mua', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 59 });
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 3 });
    expect(s.tiles[3]!.owner).toBeNull();
    expect(cash(s, 'a')).toBe(59);
  });

  it('tiền mặt vừa đúng giá thì vẫn mua được, còn 0Đ', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 60 });
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 3 });
    s = buy(s);
    expect(cash(s, 'a')).toBe(0);
    expect(player(s, 'a').status).toBe('active');
    expect(s.tiles[3]!.owner).toBe('a');
  });

  it('Phú Quốc: đủ đúng 400Đ mua ngay; 399Đ vẫn được hỏi mua', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 400 });
    s = buy(landA(s, 39));
    expect(cash(s, 'a')).toBe(0);
    expect(s.tiles[39]!.owner).toBe('a');

    let t = newGame();
    setPlayer(t, 'a', { cash: 399 });
    t = landA(t, 39);
    expect(t.pending).toEqual({ type: 'buy', playerId: 'a', tile: 39 });
    expect(t.tiles[39]!.owner).toBeNull();
  });

  it('ga và nhà máy vô chủ: thiếu tiền vẫn được hỏi mua', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 199 });
    s = landA(s, 5);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 5 });

    let t = newGame();
    setPlayer(t, 'a', { cash: 149 });
    t = landA(t, 12);
    expect(t.pending).toEqual({ type: 'buy', playerId: 'a', tile: 12 });
  });

  it('qua ô 00 nhận 200Đ trước, rồi mới xét đủ tiền mua', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 0 });
    s = landA(s, 1); // từ ô 38 tiến 3 ô, qua ô 00
    expect(cash(s, 'a')).toBe(200);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 1 });
    s = buy(s);
    expect(cash(s, 'a')).toBe(140);
  });

  it('thiếu tiền mặt vẫn hỏi mua; sau khi chọn mua mới vào xử lý nợ', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 50 });
    own(s, 'a', 39);
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 3 });
    s = buy(s);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 60, reason: 'purchase' });
    expect(s.tiles[3]!.owner).toBeNull();
  });

  it('đang được hỏi mua thì không được Ụp/Mở', () => {
    const s = newGame();
    own(s, 'a', 39);
    const t = roll(s, 1, 2);
    expect(t.pending.type).toBe('buy');
    reject(t, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 39 }] });
  });

  it('mua bằng lần đổ đôi thì mua xong vẫn được đổ tiếp', () => {
    let s = roll(newGame(), 3, 3);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 6 });
    s = buy(s);
    expect(cash(s, 'a')).toBe(400);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('mua được nhiều ô trong cùng một chuỗi đổ đôi', () => {
    let s = buy(roll(newGame(), 3, 3)); // ô 6
    s = roll(s, 1, 2); // 6 → 9
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 9 });
    s = buy(s);
    expect(cash(s, 'a')).toBe(500 - 100 - 120);
    expect(s.tiles[6]!.owner).toBe('a');
    expect(s.tiles[9]!.owner).toBe('a');
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('chỉ người đang được hỏi mới bấm mua được', () => {
    const s = roll(newGame(), 1, 2);
    reject(s, { type: 'buy', playerId: 'b' });
  });

  it('không đang được hỏi mua thì thao tác mua bị từ chối', () => {
    reject(newGame(), { type: 'buy', playerId: 'a' });
  });

  it('hết giờ khi đang hỏi mua thì coi như không mua', () => {
    let s = roll(newGame(), 1, 2);
    s = timeout(s);
    expect(s.tiles[3]!.owner).toBeNull();
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });
});

// ---------------------------------------------------------------------------
// Mục 4 + bảng mục 7: tiền thuê đất màu
// ---------------------------------------------------------------------------

describe('tiền thuê đất màu (mục 4, bảng giá mục 7)', () => {
  it.each(LANDS)('ô $tile ($name): tiền thuê đúng bảng ở mọi cấp', ({ tile, rents }) => {
    for (let level = 0; level <= 5; level++) {
      let s = newGame();
      setPlayer(s, 'a', { cash: 5000 });
      own(s, 'b', tile, { level });
      s = landA(s, tile);
      const rent = rents[level]!;
      expect(s.pending, `cấp ${level}`).toMatchObject(rentPending('a', 'b', rent));
      const [ca, cb] = [cash(s, 'a'), cash(s, 'b')];
      s = pay(s);
      expect(cash(s, 'a'), `cấp ${level}`).toBe(ca - rent);
      expect(cash(s, 'b'), `cấp ${level}`).toBe(cb + rent);
    }
  });

  it('tiền thuê chờ bấm Trả tiền dù đủ tiền; trước khi bấm chưa chuyển đồng nào', () => {
    const s = newGame();
    own(s, 'b', 3, { level: 1 });
    const t = roll(s, 1, 2);
    expect(t.pending).toMatchObject(rentPending('a', 'b', 10));
    expect(cash(t, 'a')).toBe(500);
    expect(cash(t, 'b')).toBe(500);
    const u = pay(t);
    expect(cash(u, 'a')).toBe(490);
    expect(cash(u, 'b')).toBe(510);
    expect(u.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('đang chờ Trả tiền thì khóa thao tác khác: người khác không đổ được, đủ tiền thì không được Ụp/Mở', () => {
    const s = newGame();
    own(s, 'b', 3, { level: 1 });
    own(s, 'a', 39);
    const t = roll(s, 1, 2);
    expect(t.pending.type).toBe('pay');
    reject(t, { type: 'roll', playerId: 'b' });
    reject(t, { type: 'roll', playerId: 'a' });
    reject(t, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 39 }] });
    reject(t, { type: 'pay', playerId: 'b' });
  });

  it('đang chờ Trả tiền thì không đầu hàng được', () => {
    const s = newGame();
    own(s, 'b', 3, { level: 1 });
    reject(roll(s, 1, 2), { type: 'surrender', playerId: 'a' });
  });

  it('tiền thuê chỉ chuyển giữa người chơi, tổng tiền không đổi', () => {
    let s = newGame();
    own(s, 'b', 3, { level: 4 });
    s = roll(s, 1, 2);
    const before = totalCash(s);
    s = pay(s);
    expect(totalCash(s)).toBe(before);
    expect(cash(s, 'a')).toBe(340);
    expect(cash(s, 'b')).toBe(660);
  });

  it('không có nhóm màu: chủ có cả Phố Cổ và Chợ Đồng Xuân thì đất trống vẫn chỉ thu 2Đ', () => {
    const s = newGame();
    own(s, 'b', 1);
    own(s, 'b', 3);
    const t = roll(s, 1, 2);
    expect(t.pending).toMatchObject(rentPending('a', 'b', 2));
  });

  it('ô đang cắm không thu tiền thuê, lượt chuyển luôn', () => {
    const s = newGame();
    own(s, 'b', 3, { mortgaged: true });
    const t = roll(s, 1, 2);
    expect(t.pending).toEqual({ type: 'roll', playerId: 'b' });
    expect(cash(t, 'a')).toBe(500);
    expect(cash(t, 'b')).toBe(500);
    expect(t.tiles[3]).toMatchObject({ owner: 'b', mortgaged: true });
  });

  it('Phú Quốc đang cắm cũng không thu', () => {
    const s = newGame();
    own(s, 'b', 39, { mortgaged: true });
    const t = landA(s, 39);
    expect(t.pending).toEqual({ type: 'roll', playerId: 'b' });
    expect(cash(t, 'a')).toBe(500);
  });

  it('chủ đang ở tù vẫn thu tiền thuê', () => {
    let s = newGame();
    setPlayer(s, 'b', { position: 10, inJail: true });
    own(s, 'b', 3, { level: 2 });
    s = roll(s, 1, 2);
    expect(s.pending).toMatchObject(rentPending('a', 'b', 30));
    s = pay(s);
    expect(cash(s, 'a')).toBe(470);
    expect(cash(s, 'b')).toBe(530);
  });

  it('ván 3 người: tiền thuê chỉ chuyển cho chủ ô', () => {
    let s = newGame(3);
    own(s, 'c', 3, { level: 1 });
    s = roll(s, 1, 2);
    expect(s.pending).toMatchObject(rentPending('a', 'c', 10));
    s = pay(s);
    expect([cash(s, 'a'), cash(s, 'b'), cash(s, 'c')]).toEqual([490, 500, 510]);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('tiền mặt vừa đúng tiền thuê thì trả được, còn 0Đ, không phá sản', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 30 });
    own(s, 'b', 3, { level: 2 });
    s = roll(s, 1, 2);
    expect(s.pending).toMatchObject(rentPending('a', 'b', 30));
    s = pay(s);
    expect(cash(s, 'a')).toBe(0);
    expect(cash(s, 'b')).toBe(530);
    expect(player(s, 'a').status).toBe('active');
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('thiếu tiền thuê và không còn gì để thanh lý thì phá sản ngay', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 29 });
    own(s, 'b', 3, { level: 2 });
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'ended' });
    expect(s.loserId).toBe('a');
    expect(player(s, 'a').status).toBe('bankrupt');
  });

  it('thiếu tiền thuê nhưng còn tài sản: chưa trả được cho tới khi Xử lý nợ đủ tiền', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 20 });
    own(s, 'a', 39);
    own(s, 'b', 3, { level: 2 });
    s = roll(s, 1, 2);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 30 });
    reject(s, { type: 'pay', playerId: 'a' });
    s = act(s, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 39 }] });
    expect(cash(s, 'a')).toBe(220);
    if (s.pending.type === 'pay') s = pay(s);
    expect(cash(s, 'a')).toBe(190);
    expect(cash(s, 'b')).toBe(530);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('dừng đất người khác bằng lần đổ đôi: trả xong vẫn được đổ tiếp', () => {
    let s = newGame();
    own(s, 'b', 6);
    s = roll(s, 3, 3);
    expect(s.pending).toMatchObject(rentPending('a', 'b', 6));
    s = pay(s);
    expect(cash(s, 'a')).toBe(494);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('đến đất người khác bằng Metro: trả tiền thuê như thường', () => {
    let s = newGame();
    own(s, 'b', 39);
    setPlayer(s, 'a', { position: 3 });
    s = roll(s, 3, 4); // 3 → 10
    s = act(s, { type: 'metro', playerId: 'a', destination: 39 });
    expect(cash(s, 'a')).toBe(250);
    expect(s.pending).toMatchObject(rentPending('a', 'b', 50));
    s = pay(s);
    expect(cash(s, 'a')).toBe(200);
    expect(cash(s, 'b')).toBe(550);
  });

  it('hết giờ khi đang chờ Trả tiền thì máy chủ tự trả', () => {
    let s = newGame();
    own(s, 'b', 3, { level: 1 });
    s = timeout(roll(s, 1, 2));
    expect(cash(s, 'a')).toBe(490);
    expect(cash(s, 'b')).toBe(510);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });
});

// ---------------------------------------------------------------------------
// Mục 4: nâng cấp đất của mình
// ---------------------------------------------------------------------------

describe('nâng cấp đất của mình (mục 4)', () => {
  it('dừng ở đất trống của mình (mua từ lượt trước): nâng lên 1 nhà, trả giá xây', () => {
    let s = newGame();
    own(s, 'a', 3);
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 3, mode: 'build' });
    s = upgrade(s);
    expect(s.tiles[3]).toMatchObject({ owner: 'a', level: 1, mortgaged: false });
    expect(cash(s, 'a')).toBe(450);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it.each(LANDS)('ô $tile ($name): nâng 1 cấp tốn đúng $build', ({ tile, build }) => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 1000 });
    own(s, 'a', tile);
    s = landA(s, tile);
    expect(s.pending).toEqual({ type: 'upgrade', playerId: 'a', tile, mode: 'build' });
    const before = cash(s, 'a');
    s = upgrade(s);
    expect(cash(s, 'a')).toBe(before - build);
    expect(s.tiles[tile]!.level).toBe(1);
  });

  it('mọi cấp đều tốn cùng giá xây, kể cả từ 4 nhà lên khách sạn (Phú Quốc)', () => {
    for (let level = 0; level < 5; level++) {
      let s = newGame();
      own(s, 'a', 39, { level });
      s = landA(s, 39);
      expect(s.pending, `cấp ${level}`).toEqual({
        type: 'upgrade',
        playerId: 'a',
        tile: 39,
        mode: 'build',
      });
      s = upgrade(s);
      expect(s.tiles[39]!.level, `cấp ${level}`).toBe(level + 1);
      expect(cash(s, 'a'), `cấp ${level}`).toBe(300);
    }
  });

  it('khách sạn là cấp cao nhất: dừng ở khách sạn của mình không được hỏi nâng', () => {
    const s = newGame();
    own(s, 'a', 3, { level: 5 });
    const t = roll(s, 1, 2);
    expect(t.pending).toEqual({ type: 'roll', playerId: 'b' });
    expect(t.tiles[3]!.level).toBe(5);
    expect(cash(t, 'a')).toBe(500);
  });

  it('mỗi lần dừng chỉ nâng tối đa 1 cấp', () => {
    let s = newGame();
    own(s, 'a', 3, { level: 2 });
    s = upgrade(roll(s, 1, 2));
    expect(s.tiles[3]!.level).toBe(3);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
    reject(s, { type: 'upgrade', playerId: 'a' });
  });

  it('chỉ đi ngang qua đất của mình thì không được nâng', () => {
    const s = newGame();
    own(s, 'a', 3);
    const t = roll(s, 2, 3); // 0 → 5, đi qua ô 3
    expect(t.pending).toEqual({ type: 'buy', playerId: 'a', tile: 5 });
    expect(t.tiles[3]!.level).toBe(0);
  });

  it('đến đất của mình bằng thẻ Đi đến Tháp Rùa: được hỏi nâng như thường', () => {
    const s = newGame();
    own(s, 'a', 9);
    topCard(s, 'chance-thap-rua');
    const t = roll(s, 3, 4); // 0 → 7 Cơ Hội → 9
    expect(player(t, 'a').position).toBe(9);
    expect(t.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 9, mode: 'build' });
  });

  it('thẻ Đất gần nhất đưa tới đất của mình: không trả gì, vẫn được hỏi nâng (mặc định)', () => {
    const s = newGame();
    own(s, 'a', 8);
    topCard(s, 'chance-nearest-property');
    const t = roll(s, 3, 4); // 0 → 7 Cơ Hội → 8
    expect(player(t, 'a').position).toBe(8);
    expect(cash(t, 'a')).toBe(500);
    expect(t.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 8, mode: 'build' });
  });

  it('đến đất của mình bằng Metro: xét đủ tiền xây sau khi đã trả phí Metro', () => {
    let s = newGame();
    own(s, 'a', 3);
    setPlayer(s, 'a', { position: 3, cash: 99 });
    s = roll(s, 3, 4); // 3 → 10
    s = act(s, { type: 'metro', playerId: 'a', destination: 3 }); // phí 49Đ, còn 50Đ
    expect(cash(s, 'a')).toBe(50);
    expect(s.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 3, mode: 'build' });
    s = upgrade(s);
    expect(cash(s, 'a')).toBe(0);
    expect(s.tiles[3]!.level).toBe(1);

    let t = newGame();
    own(t, 'a', 3);
    setPlayer(t, 'a', { position: 3, cash: 98 });
    t = roll(t, 3, 4);
    t = act(t, { type: 'metro', playerId: 'a', destination: 3 }); // phí 49Đ, còn 49Đ
    expect(cash(t, 'a')).toBe(49);
    expect(t.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('thiếu 1Đ so với giá xây thì không được hỏi nâng', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 49 });
    own(s, 'a', 3);
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
    expect(s.tiles[3]!.level).toBe(0);
    expect(cash(s, 'a')).toBe(49);
  });

  it('tiền mặt vừa đúng giá xây thì nâng được, còn 0Đ', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 50 });
    own(s, 'a', 3, { level: 4 });
    s = roll(s, 1, 2);
    expect(s.pending).toMatchObject({ type: 'upgrade', mode: 'build' });
    s = upgrade(s);
    expect(s.tiles[3]!.level).toBe(5);
    expect(cash(s, 'a')).toBe(0);
  });

  it('không được Ụp/Mở giữa lượt để lấy tiền nâng: thiếu tiền mặt thì không được hỏi dù còn tài sản', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 49 });
    own(s, 'a', 39);
    own(s, 'a', 3);
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('bỏ qua nâng cấp thì giữ nguyên cấp và tiền', () => {
    let s = newGame();
    own(s, 'a', 3, { level: 2 });
    s = skipUpgrade(roll(s, 1, 2));
    expect(s.tiles[3]!.level).toBe(2);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('hết giờ khi đang hỏi nâng cấp thì bỏ qua', () => {
    let s = newGame();
    own(s, 'a', 3, { level: 2 });
    s = timeout(roll(s, 1, 2));
    expect(s.tiles[3]!.level).toBe(2);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('nâng cấp: tiền vào Ngân hàng, tổng tiền giảm đúng giá xây', () => {
    let s = newGame();
    own(s, 'a', 24, { level: 1 });
    s = landA(s, 24);
    const before = totalCash(s);
    s = upgrade(s);
    expect(totalCash(s)).toBe(before - 150);
  });

  it('lượt vừa mua chưa được nâng, kể cả quay lại ô đó trong cùng chuỗi đổ đôi (Nhảy lò cò)', () => {
    let s = newGame();
    setPlayer(s, 'a', { position: 13 });
    s = roll(s, 3, 3); // 13 → 19 Tràng An
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 19 });
    s = buy(s);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
    topCard(s, 'chance-hopscotch');
    s = roll(s, 1, 2); // 19 → 22 Cơ Hội, lùi 3 ô về 19
    expect(player(s, 'a').position).toBe(19);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
    expect(s.tiles[19]!.level).toBe(0);
    expect(cash(s, 'a')).toBe(300);
  });

  it('lượt vừa mua chưa được nâng: quay lại bằng Metro trong cùng chuỗi đổ đôi', () => {
    let s = newGame();
    setPlayer(s, 'a', { position: 4 });
    s = buy(roll(s, 1, 1)); // 4 → 6 Bưu Điện Hà Nội
    expect(cash(s, 'a')).toBe(400);
    s = roll(s, 2, 2); // 6 → 10 Metro
    expect(s.pending).toEqual({ type: 'metro', playerId: 'a' });
    s = act(s, { type: 'metro', playerId: 'a', destination: 6 });
    expect(player(s, 'a').position).toBe(6);
    expect(cash(s, 'a')).toBe(200);
    expect(s.pending.type).not.toBe('upgrade');
    expect(s.tiles[6]!.level).toBe(0);
  });

  it('đất nhận do thẻ Đất gần nhất bắt buộc mua cũng là vừa mua: quay lại bằng Metro trong lượt đó không được nâng', () => {
    let s = newGame();
    setPlayer(s, 'a', { position: 5 });
    topCard(s, 'chance-nearest-property');
    s = settle(roll(s, 1, 1)); // 5 → 7 Cơ Hội → 8 vô chủ, bắt buộc mua
    expect(s.tiles[8]!.owner).toBe('a');
    expect(cash(s, 'a')).toBe(400);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
    s = roll(s, 1, 1); // 8 → 10 Metro
    s = act(s, { type: 'metro', playerId: 'a', destination: 8 });
    expect(player(s, 'a').position).toBe(8);
    expect(s.pending.type).not.toBe('upgrade');
    expect(s.tiles[8]!.level).toBe(0);
  });

  it('đất mua ở lượt trước thì sang lượt sau dừng lại được nâng', () => {
    let s = buy(roll(newGame(), 1, 2)); // a mua ô 3
    s = declineBuy(roll(s, 4, 5), 'b'); // b đến ô 9, không mua
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
    setPlayer(s, 'a', { position: 0 });
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 3, mode: 'build' });
    s = upgrade(s);
    expect(s.tiles[3]!.level).toBe(1);
    expect(cash(s, 'a')).toBe(390);
  });

  it('dừng 2 lần ở đất của mình trong một chuỗi đổ đôi thì mỗi lần được nâng 1 cấp', () => {
    let s = newGame();
    own(s, 'a', 19);
    setPlayer(s, 'a', { position: 13 });
    s = roll(s, 3, 3); // 13 → 19
    expect(s.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 19, mode: 'build' });
    s = upgrade(s);
    expect(s.tiles[19]!.level).toBe(1);
    topCard(s, 'chance-hopscotch');
    s = roll(s, 1, 2); // 19 → 22, lùi về 19
    expect(player(s, 'a').position).toBe(19);
    expect(s.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 19, mode: 'build' });
    s = upgrade(s);
    expect(s.tiles[19]!.level).toBe(2);
    expect(cash(s, 'a')).toBe(300);
  });

  it('nâng cấp bằng lần đổ đôi thì nâng xong vẫn được đổ tiếp', () => {
    let s = newGame();
    own(s, 'a', 6);
    s = roll(s, 3, 3);
    expect(s.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 6, mode: 'build' });
    s = upgrade(s);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('ga của mình (không cắm): không có gì để nâng, lượt chuyển luôn', () => {
    const s = newGame();
    own(s, 'a', 5);
    const t = landA(s, 5);
    expect(t.pending).toEqual({ type: 'roll', playerId: 'b' });
    expect(cash(t, 'a')).toBe(500);
  });

  it('nhà máy của mình (không cắm): không có gì để nâng, lượt chuyển luôn', () => {
    const s = newGame();
    own(s, 'a', 12);
    const t = landA(s, 12);
    expect(t.pending).toEqual({ type: 'roll', playerId: 'b' });
    expect(cash(t, 'a')).toBe(500);
  });

  it('không đang được hỏi nâng thì thao tác nâng bị từ chối', () => {
    reject(newGame(), { type: 'upgrade', playerId: 'a' });
    const s = newGame();
    own(s, 'a', 3);
    reject(roll(s, 1, 2), { type: 'upgrade', playerId: 'b' });
  });
});

// ---------------------------------------------------------------------------
// Mục 4, 7: đất của mình đang cắm
// ---------------------------------------------------------------------------

describe('dừng ở tài sản của mình đang cắm (mục 4, 7)', () => {
  it('đất màu đang cắm: chuộc và lên 1 nhà cùng lúc, trả 55% giá mua (làm tròn xuống) + giá xây', () => {
    let s = newGame();
    own(s, 'a', 3, { mortgaged: true });
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 3, mode: 'redeemBuild' });
    s = upgrade(s);
    expect(s.tiles[3]).toMatchObject({ owner: 'a', level: 1, mortgaged: false });
    expect(cash(s, 'a')).toBe(500 - 33 - 50);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it.each(LANDS)(
    'ô $tile ($name): chuộc + nâng tốn đúng $redeem + $build',
    ({ tile, redeem, build }) => {
      let s = newGame();
      setPlayer(s, 'a', { cash: 1000 });
      own(s, 'a', tile, { mortgaged: true });
      s = landA(s, tile);
      expect(s.pending).toEqual({ type: 'upgrade', playerId: 'a', tile, mode: 'redeemBuild' });
      const before = cash(s, 'a');
      s = upgrade(s);
      expect(cash(s, 'a')).toBe(before - redeem - build);
      expect(s.tiles[tile]).toMatchObject({ level: 1, mortgaged: false });
    },
  );

  it('vừa đủ tiền chuộc + xây thì làm được, còn 0Đ', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 83 });
    own(s, 'a', 3, { mortgaged: true });
    s = upgrade(roll(s, 1, 2));
    expect(cash(s, 'a')).toBe(0);
    expect(s.tiles[3]).toMatchObject({ level: 1, mortgaged: false });
  });

  it('thiếu 1Đ so với chuộc + xây thì không được chuộc + nâng', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 82 });
    own(s, 'a', 3, { mortgaged: true });
    s = roll(s, 1, 2);
    expect(s.pending).not.toMatchObject({ type: 'upgrade', mode: 'redeemBuild' });
    if (s.pending.type === 'upgrade') s = skipUpgrade(s);
    expect(s.tiles[3]).toMatchObject({ level: 0, mortgaged: true });
  });

  it('bỏ qua thì đất vẫn cắm, không mất tiền', () => {
    let s = newGame();
    own(s, 'a', 3, { mortgaged: true });
    s = skipUpgrade(roll(s, 1, 2));
    expect(s.tiles[3]).toMatchObject({ level: 0, mortgaged: true });
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('hết giờ khi đang hỏi chuộc + nâng thì bỏ qua', () => {
    let s = newGame();
    own(s, 'a', 3, { mortgaged: true });
    s = timeout(roll(s, 1, 2));
    expect(s.tiles[3]).toMatchObject({ level: 0, mortgaged: true });
    expect(cash(s, 'a')).toBe(500);
  });

  it('ga đang cắm chỉ được chuộc: trả 110Đ, không có công trình', () => {
    let s = newGame();
    own(s, 'a', 5, { mortgaged: true });
    s = landA(s, 5);
    expect(s.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 5, mode: 'redeem' });
    s = upgrade(s);
    expect(s.tiles[5]).toMatchObject({ owner: 'a', level: 0, mortgaged: false });
    expect(cash(s, 'a')).toBe(500 - STATION_REDEEM);
  });

  it('nhà máy đang cắm chỉ được chuộc: trả 82Đ (55% của 150 làm tròn xuống)', () => {
    let s = newGame();
    own(s, 'a', 28, { mortgaged: true });
    s = landA(s, 28);
    expect(s.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 28, mode: 'redeem' });
    s = upgrade(s);
    expect(s.tiles[28]).toMatchObject({ owner: 'a', level: 0, mortgaged: false });
    expect(cash(s, 'a')).toBe(500 - UTILITY_REDEEM);
  });

  it('ga đang cắm: vừa đủ 110Đ thì chuộc được, 109Đ thì không được hỏi', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 110 });
    own(s, 'a', 15, { mortgaged: true });
    s = upgrade(landA(s, 15));
    expect(cash(s, 'a')).toBe(0);
    expect(s.tiles[15]!.mortgaged).toBe(false);

    let t = newGame();
    setPlayer(t, 'a', { cash: 109 });
    own(t, 'a', 15, { mortgaged: true });
    t = landA(t, 15);
    expect(t.pending).toEqual({ type: 'roll', playerId: 'b' });
    expect(t.tiles[15]!.mortgaged).toBe(true);
  });

  it('bỏ qua chuộc ga thì ga vẫn cắm', () => {
    let s = newGame();
    own(s, 'a', 5, { mortgaged: true });
    s = skipUpgrade(landA(s, 5));
    expect(s.tiles[5]!.mortgaged).toBe(true);
    expect(cash(s, 'a')).toBe(500);
  });

  it('hết giờ khi đang hỏi chuộc ga thì bỏ qua', () => {
    let s = newGame();
    own(s, 'a', 5, { mortgaged: true });
    s = timeout(landA(s, 5));
    expect(s.tiles[5]!.mortgaged).toBe(true);
    expect(cash(s, 'a')).toBe(500);
  });

  it('thẻ Đất gần nhất đưa tới đất của mình đang cắm: được chuộc + nâng như thường (mặc định)', () => {
    const s = newGame();
    own(s, 'a', 8, { mortgaged: true });
    topCard(s, 'chance-nearest-property');
    const t = roll(s, 3, 4);
    expect(t.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 8, mode: 'redeemBuild' });
  });

  it('đất vừa mua, bị cắm để trả nợ rồi quay lại trong cùng lượt: không được chuộc + nâng', () => {
    let s = newGame();
    setPlayer(s, 'a', { position: 5, cash: 250 });
    own(s, 'b', 13, { level: 2 }); // thuê 150Đ
    s = buy(roll(s, 2, 2)); // 5 → 9 Tháp Rùa, mua 120Đ
    expect(cash(s, 'a')).toBe(130);
    s = roll(s, 2, 2); // 9 → 13, nợ 150Đ
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 150 });
    s = act(s, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 9 }] });
    s = pay(s);
    expect(cash(s, 'a')).toBe(40);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
    topCard(s, 'chance-thap-rua');
    s = roll(s, 4, 5); // 13 → 22 Cơ Hội → 9, qua ô 00
    expect(player(s, 'a').position).toBe(9);
    expect(cash(s, 'a')).toBe(240);
    expect(s.pending).not.toMatchObject({ type: 'upgrade', mode: 'redeemBuild' });
    expect(s.pending).not.toMatchObject({ type: 'upgrade', mode: 'build' });
    if (s.pending.type === 'upgrade') s = upgrade(s);
    expect(s.tiles[9]!.level).toBe(0);
  });

  it('ga vừa mua, bị cắm để trả nợ rồi quay lại trong cùng lượt: vẫn được chuộc (chỉ cấm nâng)', () => {
    let s = newGame();
    setPlayer(s, 'a', { position: 33, cash: 300 });
    own(s, 'b', 39, { level: 1 }); // thuê 200Đ
    s = buy(roll(s, 1, 1)); // 33 → 35 Ga Sài Gòn, mua 200Đ
    expect(cash(s, 'a')).toBe(100);
    s = roll(s, 2, 2); // 35 → 39, nợ 200Đ
    s = act(s, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 35 }] });
    s = pay(s);
    expect(cash(s, 'a')).toBe(0);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
    topCard(s, 'chance-ga-sai-gon');
    s = roll(s, 3, 5); // 39 → 7 Cơ Hội (qua ô 00, +200) → 35
    expect(player(s, 'a').position).toBe(35);
    expect(cash(s, 'a')).toBe(200);
    expect(s.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 35, mode: 'redeem' });
  });
});

// ---------------------------------------------------------------------------
// Mục 4: ga
// ---------------------------------------------------------------------------

describe('tiền thuê ga (mục 4)', () => {
  it.each([
    [1, 25],
    [2, 50],
    [3, 100],
    [4, 200],
  ])('chủ có %i ga đang hoạt động: thuê %iĐ', (n, rent) => {
    let s = newGame();
    for (const st of STATIONS.slice(0, n)) own(s, 'b', st);
    s = landA(s, 5);
    expect(s.pending).toMatchObject(rentPending('a', 'b', rent));
    s = pay(s);
    expect(cash(s, 'a')).toBe(500 - rent);
    expect(cash(s, 'b')).toBe(500 + rent);
  });

  it('ga đang cắm của chủ không được đếm: có 4 ga, cắm 2 thì thuê 50Đ', () => {
    const s = newGame();
    for (const st of STATIONS) own(s, 'b', st);
    own(s, 'b', 15, { mortgaged: true });
    own(s, 'b', 25, { mortgaged: true });
    const t = landA(s, 35);
    expect(t.pending).toMatchObject(rentPending('a', 'b', 50));
  });

  it('chủ có 4 ga, cắm 3: ga còn lại thu 25Đ', () => {
    const s = newGame();
    for (const st of STATIONS) own(s, 'b', st, { mortgaged: st !== 25 });
    const t = landA(s, 25);
    expect(t.pending).toMatchObject(rentPending('a', 'b', 25));
  });

  it('ga đang cắm mà người chơi dừng: không thu', () => {
    const s = newGame();
    for (const st of STATIONS) own(s, 'b', st);
    own(s, 'b', 5, { mortgaged: true });
    const t = landA(s, 5);
    expect(t.pending).toEqual({ type: 'roll', playerId: 'b' });
    expect(cash(t, 'a')).toBe(500);
  });

  it('chỉ đếm ga của chính chủ ô, không đếm ga của người khác', () => {
    let s = newGame(3);
    own(s, 'b', 5);
    own(s, 'c', 15);
    own(s, 'c', 25);
    own(s, 'a', 35);
    s = landA(s, 5);
    expect(s.pending).toMatchObject(rentPending('a', 'b', 25));
    s = pay(s);
    expect([cash(s, 'a'), cash(s, 'b'), cash(s, 'c')]).toEqual([475, 525, 500]);
  });

  it('tiền thuê ga không phụ thuộc xúc xắc', () => {
    const s = newGame();
    own(s, 'b', 15);
    own(s, 'b', 35);
    setPlayer(s, 'a', { position: 9 });
    const t = roll(s, 2, 4); // 9 → 15
    expect(t.pending).toMatchObject(rentPending('a', 'b', 50));
  });
});

// ---------------------------------------------------------------------------
// Mục 4: nhà máy
// ---------------------------------------------------------------------------

describe('tiền thuê nhà máy (mục 4)', () => {
  it('chủ có 1 nhà máy hoạt động: tổng 2 xúc xắc của lần đổ × 4, không gieo thêm', () => {
    let s = newGame();
    own(s, 'b', 12);
    setPlayer(s, 'a', { position: 7 });
    s = roll(s, 2, 3); // 7 → 12, tổng 5
    expect(s.pending).toMatchObject(rentPending('a', 'b', 20));
    s = pay(s);
    expect(cash(s, 'a')).toBe(480);
    expect(cash(s, 'b')).toBe(520);
  });

  it('chủ có cả 2 nhà máy hoạt động: × 10', () => {
    const s = newGame();
    own(s, 'b', 12);
    own(s, 'b', 28);
    setPlayer(s, 'a', { position: 23 });
    const t = roll(s, 2, 3); // 23 → 28
    expect(t.pending).toMatchObject(rentPending('a', 'b', 50));
  });

  it('nhà máy kia của chủ đang cắm thì chỉ × 4', () => {
    const s = newGame();
    own(s, 'b', 12);
    own(s, 'b', 28, { mortgaged: true });
    setPlayer(s, 'a', { position: 7 });
    const t = roll(s, 2, 3);
    expect(t.pending).toMatchObject(rentPending('a', 'b', 20));
  });

  it('nhà máy người chơi dừng đang cắm: không thu', () => {
    const s = newGame();
    own(s, 'b', 12, { mortgaged: true });
    own(s, 'b', 28);
    setPlayer(s, 'a', { position: 7 });
    const t = roll(s, 2, 3);
    expect(t.pending).toEqual({ type: 'roll', playerId: 'b' });
    expect(cash(t, 'a')).toBe(500);
  });

  it('hai nhà máy thuộc hai chủ khác nhau: mỗi chủ chỉ có 1 nên × 4', () => {
    let s = newGame(3);
    own(s, 'b', 12);
    own(s, 'c', 28);
    setPlayer(s, 'a', { position: 23 });
    s = roll(s, 2, 3);
    expect(s.pending).toMatchObject(rentPending('a', 'c', 20));
    s = pay(s);
    expect([cash(s, 'a'), cash(s, 'b'), cash(s, 'c')]).toEqual([480, 500, 520]);
  });

  it('đổ đôi đến nhà máy: dùng đúng 2 viên đó, trả xong vẫn được đổ tiếp', () => {
    let s = newGame();
    own(s, 'b', 12);
    own(s, 'b', 28);
    setPlayer(s, 'a', { position: 6 });
    s = roll(s, 3, 3); // 6 → 12, tổng 6
    expect(s.pending).toMatchObject(rentPending('a', 'b', 60));
    s = pay(s);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('đổ đôi rồi đổ tiếp đến nhà máy: dùng xúc xắc của lần đổ sau cùng', () => {
    let s = newGame();
    own(s, 'b', 12);
    s = pay(roll(s, 2, 2)); // 0 → 4, trả thuế
    s = roll(s, 3, 5); // 4 → 12, tổng 8
    expect(s.pending).toMatchObject(rentPending('a', 'b', 32));
  });

  it('ra tù bằng đổ đôi rồi dừng ở nhà máy: dùng đúng 2 viên vừa đổ để đi', () => {
    let s = newGame();
    own(s, 'b', 12);
    setPlayer(s, 'a', { position: 10, inJail: true });
    s.pending = { type: 'jail', playerId: 'a' };
    s = roll(s, 1, 1); // ra tù, 10 → 12, tổng 2
    expect(player(s, 'a').inJail).toBe(false);
    expect(s.pending).toMatchObject(rentPending('a', 'b', 8));
  });

  it('đến nhà máy bằng thẻ Mở đường cao tốc: gieo 2 viên mới để tính', () => {
    let s = newGame();
    own(s, 'b', 28);
    topCard(s, 'community-highway');
    s = roll(s, 1, 1); // 0 → 2 Khí Vận
    expect(s.pending).toMatchObject({ type: 'chooseTile', playerId: 'a', purpose: 'highway' });
    // Chọn ô 18, viên 1 → đi 10 bước tới ô 28; gieo mới 4 + 5.
    s = act(s, { type: 'chooseTile', playerId: 'a', tile: 18 }, [1, 4, 5]);
    expect(player(s, 'a').position).toBe(28);
    expect(s.pending).toMatchObject(rentPending('a', 'b', 36));
  });

  it('đến nhà máy bằng Metro: máy chủ gieo 2 viên mới để tính', () => {
    let s = newGame();
    own(s, 'b', 12);
    setPlayer(s, 'a', { position: 3 });
    s = roll(s, 3, 4); // 3 → 10
    expect(s.pending).toEqual({ type: 'metro', playerId: 'a' });
    s = act(s, { type: 'metro', playerId: 'a', destination: 12 }, [5, 6]);
    expect(cash(s, 'a')).toBe(250);
    expect(s.pending).toMatchObject(rentPending('a', 'b', 44));
  });

  it('đến nhà máy bằng thẻ Tàu bay xúc xắc: gieo 2 viên mới, không dùng xúc xắc lần đổ', () => {
    let s = newGame();
    own(s, 'b', 12);
    topCard(s, 'chance-fly-dice');
    // Đổ 3 + 4 đến ô 7 (Cơ Hội); tàu bay 6 (tiến 6 → 13) rồi 1 (lùi 1 → 12); gieo mới 5 + 6.
    s = roll(s, 3, 4, 6, 1, 5, 6);
    expect(player(s, 'a').position).toBe(12);
    expect(s.pending).toMatchObject(rentPending('a', 'b', 44));
  });

  it('tiền thuê nhà máy chỉ chuyển giữa người chơi, tổng tiền không đổi', () => {
    let s = newGame();
    own(s, 'b', 28);
    setPlayer(s, 'a', { position: 23 });
    s = roll(s, 2, 3);
    const before = totalCash(s);
    s = pay(s);
    expect(totalCash(s)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Mục 4: thuế
// ---------------------------------------------------------------------------

describe('ô thuế (mục 4)', () => {
  it('ô 04 Thuế Lương Bổng: chờ bấm Là nó rồi trả 200Đ cho Ngân hàng', () => {
    let s = roll(newGame(), 1, 3);
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      reason: 'tax',
      confirm: true,
      total: 200,
      creditors: [{ playerId: null, amount: 200 }],
    });
    expect(cash(s, 'a')).toBe(500);
    const before = totalCash(s);
    s = pay(s);
    expect(cash(s, 'a')).toBe(300);
    expect(cash(s, 'b')).toBe(500);
    expect(totalCash(s)).toBe(before - 200);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('ô 38 Thuế Lợi Tức: trả 100Đ cho Ngân hàng', () => {
    let s = landA(newGame(), 38);
    expect(s.pending).toMatchObject({
      type: 'pay',
      playerId: 'a',
      reason: 'tax',
      confirm: true,
      total: 100,
      creditors: [{ playerId: null, amount: 100 }],
    });
    s = pay(s);
    expect(cash(s, 'a')).toBe(400);
    expect(cash(s, 'b')).toBe(500);
  });

  it('vừa đủ 200Đ thì trả thuế được, còn 0Đ, không phá sản', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 200 });
    s = pay(roll(s, 1, 3));
    expect(cash(s, 'a')).toBe(0);
    expect(player(s, 'a').status).toBe('active');
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('thiếu tiền thuế và không còn gì để thanh lý thì phá sản ngay', () => {
    let s = newGame();
    setPlayer(s, 'a', { cash: 199 });
    s = roll(s, 1, 3);
    expect(s.pending).toEqual({ type: 'ended' });
    expect(s.loserId).toBe('a');
  });

  it('qua ô 00 rồi dừng ô 04: nhận 200Đ rồi trả 200Đ', () => {
    let s = newGame();
    setPlayer(s, 'a', { position: 37 });
    s = roll(s, 3, 4); // 37 → 4
    expect(cash(s, 'a')).toBe(700);
    expect(s.pending).toMatchObject({ type: 'pay', reason: 'tax', total: 200 });
    s = pay(s);
    expect(cash(s, 'a')).toBe(500);
  });

  it('đang chờ Là nó thì người khác không đổ được', () => {
    const s = roll(newGame(), 1, 3);
    reject(s, { type: 'roll', playerId: 'b' });
  });

  it('hết giờ khi chờ Là nó thì máy chủ tự trả thuế', () => {
    const s = timeout(roll(newGame(), 1, 3));
    expect(cash(s, 'a')).toBe(300);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('hết giờ khi chờ Là nó ở ô 38 thì máy chủ tự trả 100Đ', () => {
    const s = timeout(landA(newGame(), 38));
    expect(cash(s, 'a')).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Bảng giá mục 7: các cột hạ cấp, cắm, chuộc, bán (thao tác Ụp/Mở đầu lượt)
// ---------------------------------------------------------------------------

// [ô, hạ 1 cấp (null nếu không có công trình), cắm, chuộc, bán, bán khi đang cắm] theo bảng mục 7.
const MONEY_TABLE: [number, number | null, number, number, number, number][] = [
  [1, 25, 30, 33, 33, 3],
  [3, 25, 30, 33, 33, 3],
  [6, 25, 50, 55, 55, 5],
  [8, 25, 50, 55, 55, 5],
  [9, 25, 60, 66, 66, 6],
  [11, 50, 70, 77, 77, 7],
  [13, 50, 70, 77, 77, 7],
  [14, 50, 80, 88, 88, 8],
  [16, 50, 90, 99, 99, 9],
  [18, 50, 90, 99, 99, 9],
  [19, 50, 100, 110, 110, 10],
  [21, 75, 110, 121, 121, 11],
  [23, 75, 110, 121, 121, 11],
  [24, 75, 120, 132, 132, 12],
  [26, 75, 130, 143, 143, 13],
  [27, 75, 130, 143, 143, 13],
  [29, 75, 140, 154, 154, 14],
  [31, 100, 150, 165, 165, 15],
  [32, 100, 150, 165, 165, 15],
  [34, 100, 160, 176, 176, 16],
  [37, 100, 175, 192, 192, 17],
  [39, 100, 200, 220, 220, 20],
  ...STATIONS.map((t): [number, null, number, number, number, number] => [
    t,
    null,
    100,
    110,
    110,
    10,
  ]),
  ...UTILITIES.map((t): [number, null, number, number, number, number] => [t, null, 75, 82, 82, 7]),
];

describe('bảng giá mục 7: hạ cấp, cắm, chuộc, bán', () => {
  const manage = (s: GameState, op: 'downgrade' | 'mortgage' | 'sell' | 'redeem', tile: number) =>
    act(s, { type: 'manage', playerId: 'a', ops: [{ op, tile }] });

  it.each(MONEY_TABLE)(
    'ô %i: hạ %s, cắm %i, chuộc %i, bán %i, bán khi đang cắm %i',
    (tile, down, mortgage, redeem, sell, sellMortgaged) => {
      if (down !== null) {
        const s = own(newGame(), 'a', tile, { level: 5 });
        const t = manage(s, 'downgrade', tile);
        expect(cash(t, 'a')).toBe(500 + down);
        expect(t.tiles[tile]!.level).toBe(4);
      }
      const m = manage(own(newGame(), 'a', tile), 'mortgage', tile);
      expect(cash(m, 'a')).toBe(500 + mortgage);
      expect(m.tiles[tile]!.mortgaged).toBe(true);

      const r = manage(own(newGame(), 'a', tile, { mortgaged: true }), 'redeem', tile);
      expect(cash(r, 'a')).toBe(500 - redeem);
      expect(r.tiles[tile]!.mortgaged).toBe(false);

      const b = manage(own(newGame(), 'a', tile), 'sell', tile);
      expect(cash(b, 'a')).toBe(500 + sell);
      expect(b.tiles[tile]!.owner).toBeNull();

      const bm = manage(own(newGame(), 'a', tile, { mortgaged: true }), 'sell', tile);
      expect(cash(bm, 'a')).toBe(500 + sellMortgaged);
      expect(bm.tiles[tile]).toMatchObject({ owner: null, mortgaged: false });
    },
  );
});

// ---------------------------------------------------------------------------
// Mục 8, thẻ 08: Miễn thuế nhà đất lúc trả tiền thuê
// ---------------------------------------------------------------------------

describe('thẻ Miễn thuế nhà đất khi trả tiền thuê (mục 8, thẻ 08)', () => {
  it('tự dùng ở lần trả thuê đất màu kế tiếp: không mất tiền, thẻ quay về chồng Cơ Hội', () => {
    let s = newGame();
    giveRentWaiver(s, 'a');
    own(s, 'b', 3, { level: 2 });
    const before = totalCash(s);
    s = settle(roll(s, 1, 2));
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(totalCash(s)).toBe(before);
    expect(holdsWaiver(s, 'a')).toBe(false);
    expect(s.decks.chance).toContain(RENT_WAIVER);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('miễn cả tiền thuê khách sạn Phú Quốc (2000Đ) dù tiền mặt không đủ', () => {
    let s = newGame();
    giveRentWaiver(s, 'a');
    own(s, 'b', 39, { level: 5 });
    s = settle(landA(s, 39));
    expect(player(s, 'a').status).toBe('active');
    expect(cash(s, 'a')).toBe(500);
    expect(cash(s, 'b')).toBe(500);
    expect(holdsWaiver(s, 'a')).toBe(false);
  });

  it('chỉ dùng 1 lần: lần dừng đất người khác sau đó phải trả', () => {
    let s = newGame();
    giveRentWaiver(s, 'a');
    own(s, 'b', 3, { level: 2 });
    s = settle(roll(s, 1, 2));
    s = declineBuy(roll(s, 4, 5), 'b');
    setPlayer(s, 'a', { position: 0 });
    s = roll(s, 1, 2);
    expect(s.pending).toMatchObject(rentPending('a', 'b', 30));
    s = pay(s);
    expect(cash(s, 'a')).toBe(470);
  });

  it('không dùng cho ga: vẫn trả 25Đ, giữ thẻ', () => {
    let s = newGame();
    giveRentWaiver(s, 'a');
    own(s, 'b', 5);
    s = landA(s, 5);
    expect(s.pending).toMatchObject(rentPending('a', 'b', 25));
    s = pay(s);
    expect(cash(s, 'a')).toBe(475);
    expect(holdsWaiver(s, 'a')).toBe(true);
  });

  it('không dùng cho nhà máy: vẫn trả, giữ thẻ', () => {
    let s = newGame();
    giveRentWaiver(s, 'a');
    own(s, 'b', 12);
    setPlayer(s, 'a', { position: 7 });
    s = roll(s, 2, 3);
    expect(s.pending).toMatchObject(rentPending('a', 'b', 20));
    s = pay(s);
    expect(cash(s, 'a')).toBe(480);
    expect(holdsWaiver(s, 'a')).toBe(true);
  });

  it('đất màu người khác đang cắm: không có tiền thuê nên vẫn giữ thẻ', () => {
    let s = newGame();
    giveRentWaiver(s, 'a');
    own(s, 'b', 3, { mortgaged: true });
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
    expect(holdsWaiver(s, 'a')).toBe(true);
  });

  it('đất của mình: giữ thẻ, vẫn được hỏi nâng như thường', () => {
    let s = newGame();
    giveRentWaiver(s, 'a');
    own(s, 'a', 3);
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'upgrade', playerId: 'a', tile: 3, mode: 'build' });
    expect(holdsWaiver(s, 'a')).toBe(true);
  });

  it('không dùng cho ô thuế', () => {
    let s = newGame();
    giveRentWaiver(s, 'a');
    s = pay(roll(s, 1, 3));
    expect(cash(s, 'a')).toBe(300);
    expect(holdsWaiver(s, 'a')).toBe(true);
  });

  it('không dùng cho khoản 10 × xúc xắc của thẻ Đất gần nhất (mặc định)', () => {
    let s = newGame();
    giveRentWaiver(s, 'a');
    own(s, 'b', 8);
    topCard(s, 'chance-nearest-property');
    // Đổ 3 + 4 đến ô 7 (Cơ Hội), thẻ đưa tới ô 8 của b, gieo 2 + 3 → trả 10 × 5 = 50Đ.
    s = settle(roll(s, 3, 4, 2, 3));
    expect(player(s, 'a').position).toBe(8);
    expect(cash(s, 'a')).toBe(450);
    expect(cash(s, 'b')).toBe(550);
    expect(holdsWaiver(s, 'a')).toBe(true);
  });

  it('thẻ chỉ miễn cho người giữ: a không giữ thẻ vẫn phải trả, thẻ của c còn nguyên', () => {
    let s = newGame(3);
    giveRentWaiver(s, 'c');
    own(s, 'b', 3, { level: 1 });
    s = pay(roll(s, 1, 2));
    expect(cash(s, 'a')).toBe(490);
    expect(holdsWaiver(s, 'c')).toBe(true);
  });
});
