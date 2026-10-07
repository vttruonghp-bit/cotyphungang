import { describe, expect, it } from 'vitest';
import {
  CHANCE_CARDS,
  COMMUNITY_CARDS,
  createGame,
  isGameOver,
  seededRng,
  waitingFor,
  winners,
  type GameState,
  type NewPlayer,
  type Rng,
} from '../../src';
import {
  PLAYERS,
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

// ---------------------------------------------------------------------------
// Tiện ích riêng cho file này
// ---------------------------------------------------------------------------

/**
 * Nguồn ngẫu nhiên cho createGame: xúc xắc (int(1,6)) lấy theo kịch bản,
 * các lần xáo bài (int(0,i)) luôn trả số nhỏ nhất.
 */
function rngMoDau(dice: number[]): Rng & { remaining(): number } {
  const q = [...dice];
  return {
    int(min, max) {
      if (min === 1 && max === 6) {
        const v = q.shift();
        if (v === undefined) throw new Error('Hết xúc xắc kịch bản khi chọn người đi trước');
        return v;
      }
      return min;
    },
    remaining: () => q.length,
  };
}

/** Tạo ván `n` người với xúc xắc chọn lượt theo kịch bản; báo lỗi nếu thừa xúc xắc. */
function taoVan(n: number, dice: number[]): GameState {
  const rng = rngMoDau(dice);
  const s = createGame(PLAYERS.slice(0, n), rng);
  expect(rng.remaining(), 'còn thừa xúc xắc chọn lượt').toBe(0);
  return s;
}

/** Lượt nhanh của người đang chờ đổ: đặt ở ô 15, đổ 2+3 tới Bãi Đỗ Xe (20), hết lượt. */
function luotNhanh(s: GameState): GameState {
  expect(s.pending.type).toBe('roll');
  setPlayer(s, who(s), { position: 15 });
  return roll(s, 2, 3);
}

/** `a` vào tù qua ô 30, những người khác đi một lượt nhanh: ván đang chờ `a` ở tù. */
function aTrongTu(n = 2): GameState {
  let s = newGame(n);
  setPlayer(s, 'a', { position: 25 });
  s = roll(s, 2, 3);
  while (who(s) !== 'a') s = luotNhanh(s);
  expect(s.pending).toEqual({ type: 'jail', playerId: 'a' });
  return s;
}

/** `a` (đang ở tù) thử đổ trượt `k` lần bằng 1+2 liên tiếp trong cùng lượt. */
function truot(s: GameState, k: number): GameState {
  for (let i = 0; i < k; i++) {
    expect(s.pending).toEqual({ type: 'jail', playerId: 'a' });
    s = roll(s, 1, 2);
  }
  return s;
}

/** Cho người chơi giữ thẻ ra tù (rút khỏi chồng Khí Vận). Sửa trực tiếp `s`. */
function giuTheRaTu(s: GameState, id: string): GameState {
  player(s, id).heldCards.push({ cardId: 'community-jail-free', kind: 'jailFree' });
  s.decks.community = s.decks.community.filter((c) => c !== 'community-jail-free');
  return s;
}

const coTheRaTu = (s: GameState, id: string) =>
  player(s, id).heldCards.some((c) => c.kind === 'jailFree');

/** `a` đi từ ô 0 với 4+6 tới ô 10 (không đôi): ván chờ `a` chọn Metro. */
function aToiMetro(cashA?: number): GameState {
  const s = newGame(2);
  if (cashA !== undefined) setPlayer(s, 'a', { cash: cashA });
  const r = roll(s, 4, 6);
  expect(r.pending).toEqual({ type: 'metro', playerId: 'a' });
  return r;
}

const metro = (s: GameState, destination: number | null, dice: number[] = []) =>
  act(s, { type: 'metro', playerId: 'a', destination }, dice);

const PLAYER_G: NewPlayer = { id: 'g', name: 'Giang', color: 6, icon: 6 };

// ---------------------------------------------------------------------------
// 1. Tạo ván
// ---------------------------------------------------------------------------

describe('tạo ván: kiểm tra người chơi (mục 1)', () => {
  it('cần ít nhất 2 người', () => {
    expect(() => createGame([], seededRng(1))).toThrow();
    expect(() => createGame(PLAYERS.slice(0, 1), seededRng(1))).toThrow();
  });

  it('tối đa 6 người', () => {
    expect(() => createGame([...PLAYERS, PLAYER_G], seededRng(1))).toThrow();
  });

  it('2 người và 6 người đều tạo được ván', () => {
    expect(createGame(PLAYERS.slice(0, 2), seededRng(1)).players).toHaveLength(2);
    expect(createGame(PLAYERS.slice(0, 6), seededRng(1)).players).toHaveLength(6);
  });

  it('mã người chơi không được trùng', () => {
    const ps = [PLAYERS[0]!, { ...PLAYERS[1]!, id: 'a' }];
    expect(() => createGame(ps, seededRng(1))).toThrow();
  });

  it('màu không được trùng', () => {
    const ps = [PLAYERS[0]!, { ...PLAYERS[1]!, color: 0 }];
    expect(() => createGame(ps, seededRng(1))).toThrow();
  });

  it('biểu tượng không được trùng', () => {
    const ps = [PLAYERS[0]!, { ...PLAYERS[1]!, icon: 0 }];
    expect(() => createGame(ps, seededRng(1))).toThrow();
  });

  it('màu phải là 1 trong 8 màu (0–7, số nguyên)', () => {
    for (const color of [-1, 8, 1.5, Number.NaN]) {
      const ps = [{ ...PLAYERS[0]!, color }, PLAYERS[1]!];
      expect(() => createGame(ps, seededRng(1)), `màu ${color}`).toThrow();
    }
    const ok = [{ ...PLAYERS[0]!, color: 7 }, PLAYERS[1]!];
    expect(createGame(ok, seededRng(1)).players[0]!.color).toBe(7);
  });

  it('biểu tượng phải là 1 trong 20 biểu tượng (0–19, số nguyên)', () => {
    for (const icon of [-1, 20, 2.5, Number.NaN]) {
      const ps = [{ ...PLAYERS[0]!, icon }, PLAYERS[1]!];
      expect(() => createGame(ps, seededRng(1)), `biểu tượng ${icon}`).toThrow();
    }
    const ok = [{ ...PLAYERS[0]!, icon: 19 }, PLAYERS[1]!];
    expect(createGame(ok, seededRng(1)).players[0]!.icon).toBe(19);
  });

  it('mỗi người bắt đầu với 500Đ ở ô 00, không ở tù, không giữ thẻ', () => {
    const s = createGame(PLAYERS.slice(0, 4), seededRng(7));
    for (const p of s.players) {
      expect(p.cash).toBe(500);
      expect(p.position).toBe(0);
      expect(p.inJail).toBe(false);
      expect(p.heldCards).toEqual([]);
      expect(p.status).toBe('active');
    }
    expect(s.loserId).toBeNull();
  });

  it('đầu ván mọi ô mua được đều vô chủ, không cắm, không công trình', () => {
    const s = createGame(PLAYERS.slice(0, 2), seededRng(3));
    const ownable = s.tiles.filter((t) => t !== null);
    expect(ownable).toHaveLength(28);
    for (const t of ownable) expect(t).toMatchObject({ owner: null, level: 0, mortgaged: false });
  });

  it('chồng Cơ Hội đủ 19 thẻ và chồng Khí Vận đủ 21 thẻ', () => {
    const s = createGame(PLAYERS.slice(0, 2), seededRng(5));
    expect([...s.decks.chance].sort()).toEqual(CHANCE_CARDS.map((c) => c.id).sort());
    expect([...s.decks.community].sort()).toEqual(COMMUNITY_CARDS.map((c) => c.id).sort());
  });
});

describe('tạo ván: thứ tự đi (mục 1)', () => {
  it('người có tổng 2 xúc xắc cao nhất đi trước', () => {
    // a = 7, b = 11, c = 4
    const s = taoVan(3, [3, 4, 6, 5, 2, 2]);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
    expect(s.players[s.current]!.id).toBe('b');
  });

  it('người cao nhất ngồi đầu bàn vẫn đi trước', () => {
    // a = 12, b = 2
    const s = taoVan(2, [6, 6, 1, 1]);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('bằng nhau ở mức cao nhất thì chỉ những người bằng nhau đổ lại', () => {
    // a = 10, b = 3, c = 10 → a, c đổ lại: a = 5, c = 7 → c
    const s = taoVan(3, [4, 6, 1, 2, 5, 5, 2, 3, 6, 1]);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'c' });
  });

  it('bằng nhau ở mức thấp hơn thì không ai đổ lại', () => {
    // a = 12, b = 6, c = 6 → a đi trước, chỉ dùng 6 viên
    const s = taoVan(3, [6, 6, 3, 3, 3, 3]);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('bằng nhau nhiều vòng thì đổ lại tới khi phân định', () => {
    // vòng 1: 7–7, vòng 2: 4–4, vòng 3: a = 9, b = 8
    const s = taoVan(2, [3, 4, 5, 2, 2, 2, 1, 3, 4, 5, 2, 6]);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('ba người bằng nhau rồi hai người bằng nhau: vòng sau chỉ gồm người còn bằng', () => {
    // a = 8, b = 8, c = 5, d = 8 → a, b, d: a = 6, b = 11, d = 11 → b, d: b = 3, d = 4
    const s = taoVan(4, [4, 4, 2, 6, 1, 4, 3, 5, 1, 5, 5, 6, 6, 5, 1, 2, 2, 2]);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'd' });
  });

  it('cả bàn bằng nhau thì cả bàn đổ lại', () => {
    // a = b = c = 7 → đổ lại: a = 2, b = 4, c = 6
    const s = taoVan(3, [3, 4, 2, 5, 1, 6, 1, 1, 2, 2, 3, 3]);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'c' });
  });

  it('đổ chọn lượt không làm ai di chuyển hay đổi tiền', () => {
    const s = taoVan(3, [6, 6, 1, 1, 2, 2]);
    for (const p of s.players) expect(p).toMatchObject({ position: 0, cash: 500 });
    expect(s.rolled).toBe(false);
  });

  it('sau người đi trước thì đi theo vòng ghế', () => {
    // a = 2, b = 3, c = 12, d = 4 → c đi trước, rồi d, a, b, lại c
    let s = taoVan(4, [1, 1, 1, 2, 6, 6, 2, 2]);
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      order.push(who(s));
      s = luotNhanh(s);
    }
    expect(order).toEqual(['c', 'd', 'a', 'b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// 3–4. Lượt chơi, di chuyển, ô 00
// ---------------------------------------------------------------------------

describe('di chuyển và ô Bắt Đầu (mục 1, 3)', () => {
  it('đổ 2 xúc xắc rồi tiến theo tổng', () => {
    const s = roll(newGame(), 2, 3);
    expect(player(s, 'a').position).toBe(5);
    expect(s.lastDice).toEqual([2, 3]);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 5 });
  });

  it('tiến qua ô 00 nhận 200Đ', () => {
    const s0 = setPlayer(newGame(), 'a', { position: 38 });
    const s = roll(s0, 2, 1);
    expect(player(s, 'a').position).toBe(1);
    expect(cash(s, 'a')).toBe(700);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 1 });
  });

  it('dừng đúng ô 00 nhận 200Đ (một lần) rồi hết lượt', () => {
    const s0 = setPlayer(newGame(), 'a', { position: 36 });
    const s = roll(s0, 1, 3);
    expect(player(s, 'a').position).toBe(0);
    expect(cash(s, 'a')).toBe(700);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('tiền 200Đ ở ô 00 do Ngân hàng trả, người khác không mất tiền', () => {
    const s0 = setPlayer(newGame(), 'a', { position: 36 });
    const s = roll(s0, 1, 3);
    expect(cash(s, 'b')).toBe(500);
    expect(totalCash(s)).toBe(totalCash(s0) + 200);
  });

  it('qua ô 00 rồi dừng ở ô 10 vẫn nhận 200Đ và được chọn Metro', () => {
    const s0 = setPlayer(newGame(), 'a', { position: 39 });
    const s = roll(s0, 5, 6);
    expect(player(s, 'a').position).toBe(10);
    expect(cash(s, 'a')).toBe(700);
    expect(s.pending).toEqual({ type: 'metro', playerId: 'a' });
  });

  it('Bãi Đỗ Xe (20): không có gì, hết lượt', () => {
    const s0 = setPlayer(newGame(), 'a', { position: 15 });
    const s = roll(s0, 2, 3);
    expect(player(s, 'a').position).toBe(20);
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('không đi tiếp khi đang chờ mua: phải quyết định ô vừa dừng trước', () => {
    const s = roll(newGame(), 1, 2);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 3 });
    reject(s, { type: 'roll', playerId: 'a' }, [1, 2]);
  });
});

describe('ô Vào Tù (30) (mục 4)', () => {
  it('dừng ô 30: chuyển tới ô 10, bị giam, không nhận 200Đ, hết lượt', () => {
    const s0 = setPlayer(newGame(), 'a', { position: 25 });
    const s = roll(s0, 2, 3);
    expect(player(s, 'a')).toMatchObject({ position: 10, inJail: true, cash: 500 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('dừng ô 30 bằng đổ đôi: vào tù và mất lượt thêm', () => {
    const s0 = setPlayer(newGame(), 'a', { position: 26 });
    const s = roll(s0, 2, 2);
    expect(player(s, 'a')).toMatchObject({ position: 10, inJail: true, cash: 500 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('vào tù qua ô 30 không được Metro dù đứng ở ô 10', () => {
    const s0 = setPlayer(newGame(), 'a', { position: 25 });
    const s = roll(s0, 2, 3);
    expect(s.pending.type).not.toBe('metro');
    reject(s, { type: 'metro', playerId: 'a', destination: 20 });
  });

  it('người mới vào tù có số lần thử bằng 0', () => {
    const s0 = setPlayer(newGame(), 'a', { position: 25 });
    const s = roll(s0, 2, 3);
    expect(player(s, 'a').jailAttempts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Đổ đôi
// ---------------------------------------------------------------------------

describe('đổ đôi (mục 3)', () => {
  it('đổ đôi được thêm lượt', () => {
    const s0 = setPlayer(newGame(), 'a', { position: 16 });
    const s = roll(s0, 2, 2);
    expect(player(s, 'a').position).toBe(20);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('đôi rồi không đôi thì hết lượt sau khi xử lý ô', () => {
    let s = setPlayer(newGame(), 'a', { position: 16 });
    s = roll(s, 2, 2);
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 23 });
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('đôi rồi dừng ô phải mua: mua/không mua xong mới được đổ lượt thêm', () => {
    let s = setPlayer(newGame(), 'a', { position: 19 });
    s = roll(s, 1, 1);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 21 });
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('đôi lần thứ 3 liên tiếp: vào tù ngay, không di chuyển theo lần đổ đó', () => {
    let s = setPlayer(newGame(), 'a', { position: 31 });
    s = roll(s, 2, 2); // 35
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    s = roll(s, 2, 2); // 39
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    s = roll(s, 3, 3); // lẽ ra tới 5 qua ô 00
    expect(player(s, 'a')).toMatchObject({ position: 10, inJail: true, cash: 500 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('đôi lần 3 không xử lý ô lẽ ra tới (không rút thẻ ở ô Cơ Hội)', () => {
    let s = topCard(setPlayer(newGame(), 'a', { position: 26 }), 'chance-acting');
    s = roll(s, 3, 3); // 32
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    s = roll(s, 1, 1); // 34
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    s = roll(s, 1, 1); // đôi lần 3, lẽ ra tới 36 (Cơ Hội)
    expect(player(s, 'a')).toMatchObject({ position: 10, inJail: true, cash: 500 });
    expect(s.decks.chance[0]).toBe('chance-acting');
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('đếm đôi tính lại mỗi lượt: 2 đôi lượt trước không cộng sang lượt sau', () => {
    let s = setPlayer(newGame(), 'a', { position: 16 });
    s = roll(s, 2, 2); // 20
    s = roll(s, 3, 3); // 26
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    s = roll(s, 1, 2); // 29
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    s = luotNhanh(s); // b
    s = roll(s, 1, 1); // a: 31
    expect(player(s, 'a')).toMatchObject({ position: 31, inJail: false });
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    s = roll(s, 2, 2); // 35
    expect(player(s, 'a')).toMatchObject({ position: 35, inJail: false });
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('đôi qua ô 00 vẫn nhận 200Đ và vẫn được lượt thêm', () => {
    const s0 = setPlayer(newGame(), 'a', { position: 36 });
    const s = roll(s0, 2, 2);
    expect(player(s, 'a').position).toBe(0);
    expect(cash(s, 'a')).toBe(700);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('đôi rồi bị thẻ "Vào tù là rõ" thì mất lượt thêm', () => {
    const s0 = topCard(setPlayer(newGame(), 'a', { position: 3 }), 'chance-jail');
    const s = roll(s0, 2, 2); // 7 Cơ Hội
    expect(player(s, 'a')).toMatchObject({ position: 10, inJail: true, cash: 500 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('trong lượt thêm, người khác không được đổ', () => {
    const s0 = setPlayer(newGame(), 'a', { position: 16 });
    const s = roll(s0, 2, 2);
    reject(s, { type: 'roll', playerId: 'b' }, [1, 2]);
  });

  it('giữa các lần đổ đôi không được Ụp/Mở', () => {
    let s = own(setPlayer(newGame(), 'a', { position: 16 }), 'a', 1);
    s = roll(s, 2, 2);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
    reject(s, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 1 }] });
  });

  it('đầu lượt, trước khi đổ, được Ụp/Mở', () => {
    const s0 = own(newGame(), 'a', 1);
    const s = act(s0, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 1 }] });
    expect(cash(s, 'a')).toBe(530);
    expect(s.tiles[1]!.mortgaged).toBe(true);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });
});

// ---------------------------------------------------------------------------
// 5. Metro
// ---------------------------------------------------------------------------

describe('Metro ở ô 10 (mục 5)', () => {
  it('dừng ô 10 khi không bị giam thì được chọn Metro', () => {
    const s = aToiMetro();
    expect(player(s, 'a')).toMatchObject({ position: 10, inJail: false });
  });

  it('chọn ở lại: không mất gì, hết lượt', () => {
    const s = metro(aToiMetro(), null);
    expect(player(s, 'a')).toMatchObject({ position: 10, inJail: false, cash: 500 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('đi Metro trả đúng một nửa tiền mặt cho Ngân hàng', () => {
    const s0 = aToiMetro();
    const s = metro(s0, 20);
    expect(player(s, 'a').position).toBe(20);
    expect(cash(s, 'a')).toBe(250);
    expect(cash(s, 'b')).toBe(500);
    expect(totalCash(s)).toBe(totalCash(s0) - 250);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('nửa tiền mặt lẻ thì làm tròn xuống (333Đ → trả 166Đ)', () => {
    const s = metro(aToiMetro(333), 20);
    expect(cash(s, 'a')).toBe(167);
  });

  it('có 1Đ thì phí Metro là 0Đ', () => {
    const s = metro(aToiMetro(1), 20);
    expect(cash(s, 'a')).toBe(1);
    expect(player(s, 'a').position).toBe(20);
  });

  it('không có tiền vẫn đi Metro được (phí 0Đ)', () => {
    const s = metro(aToiMetro(0), 20);
    expect(cash(s, 'a')).toBe(0);
    expect(player(s, 'a').position).toBe(20);
  });

  it('chọn đích ô 00 không nhận 200Đ', () => {
    const s = metro(aToiMetro(), 0);
    expect(player(s, 'a').position).toBe(0);
    expect(cash(s, 'a')).toBe(250);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('đích nằm sau ô 00 (vòng qua ô 00) cũng không nhận 200Đ', () => {
    const s = metro(aToiMetro(), 5);
    expect(player(s, 'a').position).toBe(5);
    expect(cash(s, 'a')).toBe(250);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 5 });
  });

  it('đích ô 39 được (ô xa nhất); còn đủ tiền thì được mua', () => {
    // 900Đ → phí 450Đ → còn 450Đ, đủ mua Phú Quốc (400Đ)
    const s = metro(aToiMetro(900), 39);
    expect(player(s, 'a').position).toBe(39);
    expect(cash(s, 'a')).toBe(450);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 39 });
  });

  it('đích ô 30 thì vào tù (đã mất phí Metro)', () => {
    const s = metro(aToiMetro(), 30);
    expect(player(s, 'a')).toMatchObject({ position: 10, inJail: true, cash: 250 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('đích là đất vô chủ: được mua bằng tiền còn lại', () => {
    let s = metro(aToiMetro(), 11);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 11 });
    s = act(s, { type: 'buy', playerId: 'a' });
    expect(cash(s, 'a')).toBe(110);
    expect(s.tiles[11]!.owner).toBe('a');
  });

  it('đích là đất của người khác: trả tiền thuê như bình thường', () => {
    const s0 = own(aToiMetro(), 'b', 39);
    let s = metro(s0, 39);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 50, reason: 'rent' });
    s = act(s, { type: 'pay', playerId: 'a' });
    expect(cash(s, 'a')).toBe(200);
    expect(cash(s, 'b')).toBe(550);
  });

  it('đích là nhà máy của người khác: gieo 2 viên mới để tính tiền', () => {
    const s0 = own(aToiMetro(), 'b', 12);
    let s = metro(s0, 12, [3, 4]);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 28 });
    s = act(s, { type: 'pay', playerId: 'a' });
    expect(cash(s, 'a')).toBe(222);
    expect(cash(s, 'b')).toBe(528);
  });

  it('đích là ô Khí Vận: rút thẻ và làm ngay', () => {
    const s0 = topCard(aToiMetro(), 'community-god-of-wealth');
    const s = metro(s0, 33);
    expect(player(s, 'a').position).toBe(33);
    expect(cash(s, 'a')).toBe(350);
  });

  it('đích là ô thuế: phải trả thuế', () => {
    let s = metro(aToiMetro(), 38);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 100, reason: 'tax' });
    s = act(s, { type: 'pay', playerId: 'a' });
    expect(cash(s, 'a')).toBe(150);
  });

  it('đích không hợp lệ bị từ chối: ô 10, -1, 40, số lẻ', () => {
    const s = aToiMetro();
    for (const d of [10, -1, 40, 2.5, Number.NaN]) {
      reject(s, { type: 'metro', playerId: 'a', destination: d });
    }
  });

  it('mọi ô khác ô 10 (39 ô) đều chọn được', () => {
    // Thẻ trên cùng là thẻ nhận tiền đơn giản để ô thẻ không gieo thêm.
    const s = topCard(topCard(aToiMetro(), 'chance-acting'), 'community-god-of-wealth');
    for (let d = 0; d < 40; d++) {
      if (d === 10) continue;
      const r = act(s, { type: 'metro', playerId: 'a', destination: d });
      expect(player(r, 'a').position, `đích ${d}`).toBe(d === 30 ? 10 : d);
    }
  });

  it('người khác không chọn Metro thay', () => {
    reject(aToiMetro(), { type: 'metro', playerId: 'b', destination: 20 });
  });

  it('không chọn Metro khi đang chờ đổ', () => {
    reject(newGame(), { type: 'metro', playerId: 'a', destination: 20 });
  });

  it('đang chờ Metro thì không được đổ hay Ụp/Mở', () => {
    const s = own(aToiMetro(), 'a', 1);
    reject(s, { type: 'roll', playerId: 'a' }, [1, 2]);
    reject(s, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 1 }] });
  });

  it('ở lại ô 10 (thăm tù) thì lượt sau đổ bình thường, không bị coi là ở tù', () => {
    let s = metro(aToiMetro(), null);
    s = luotNhanh(s); // b
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
    s = roll(s, 1, 2);
    expect(player(s, 'a').position).toBe(13);
  });

  it('đổ đôi tới ô 10, ở lại thì vẫn được lượt thêm', () => {
    let s = setPlayer(newGame(), 'a', { position: 6 });
    s = roll(s, 2, 2);
    expect(s.pending).toEqual({ type: 'metro', playerId: 'a' });
    s = metro(s, null);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('đổ đôi tới ô 10, đi Metro rồi vẫn được lượt thêm', () => {
    let s = setPlayer(newGame(), 'a', { position: 6 });
    s = roll(s, 2, 2);
    s = metro(s, 20);
    expect(player(s, 'a').position).toBe(20);
    expect(cash(s, 'a')).toBe(250);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('đổ đôi tới ô 10, đi Metro tới đất vô chủ: mua xong vẫn được lượt thêm', () => {
    let s = setPlayer(newGame(), 'a', { position: 6 });
    s = roll(s, 2, 2);
    s = metro(s, 11);
    s = act(s, { type: 'buy', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('đổ đôi tới ô 10, Metro tới ô 30 thì vào tù và mất lượt thêm', () => {
    let s = setPlayer(newGame(), 'a', { position: 6 });
    s = roll(s, 2, 2);
    s = metro(s, 30);
    expect(player(s, 'a')).toMatchObject({ position: 10, inJail: true });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('thẻ đưa tới ô 10 (Tàu bay xúc xắc) cũng được chọn Metro', () => {
    const s0 = topCard(setPlayer(newGame(), 'a', { position: 4 }), 'chance-fly-dice');
    // 4 → 7 (Cơ Hội); tàu bay: viên 1 = 4 (chẵn, tiến 4 → 11), viên 2 = 1 (lẻ, lùi 1 → 10)
    const s = roll(s0, 1, 2, 4, 1);
    expect(player(s, 'a')).toMatchObject({ position: 10, inJail: false });
    expect(s.pending).toEqual({ type: 'metro', playerId: 'a' });
  });

  it('thẻ "Vào tù là rõ" đưa tới ô 10 thì bị giam, không có Metro', () => {
    const s0 = topCard(setPlayer(newGame(), 'a', { position: 4 }), 'chance-jail');
    const s = roll(s0, 1, 2);
    expect(player(s, 'a')).toMatchObject({ position: 10, inJail: true, cash: 500 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('hết giờ khi chờ Metro thì ở lại, không mất tiền', () => {
    const s = act(aToiMetro(), { type: 'timeout' });
    expect(player(s, 'a')).toMatchObject({ position: 10, inJail: false, cash: 500 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });
});

// ---------------------------------------------------------------------------
// 6. Ở tù
// ---------------------------------------------------------------------------

describe('ở tù: ra tù trước khi đổ (mục 6)', () => {
  it('lượt của người đang bị giam bắt đầu bằng bước xử lý tù', () => {
    const s = aTrongTu();
    expect(player(s, 'a')).toMatchObject({ position: 10, inJail: true });
    expect(waitingFor(s)).toBe('a');
  });

  it('trả 50Đ để ra ngay rồi đổ đi bình thường', () => {
    let s = act(aTrongTu(), { type: 'payBail', playerId: 'a' });
    expect(player(s, 'a')).toMatchObject({ inJail: false, cash: 450, position: 10 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
    s = roll(s, 2, 3);
    expect(player(s, 'a').position).toBe(15);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 15 });
  });

  it('50Đ bảo lãnh trả cho Ngân hàng', () => {
    const s0 = aTrongTu();
    const s = act(s0, { type: 'payBail', playerId: 'a' });
    expect(cash(s, 'b')).toBe(cash(s0, 'b'));
    expect(totalCash(s)).toBe(totalCash(s0) - 50);
  });

  it('trả 50Đ ra tù rồi đổ đôi thì có lượt thêm', () => {
    let s = act(aTrongTu(), { type: 'payBail', playerId: 'a' });
    s = roll(s, 3, 3); // 16
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('dùng thẻ ra tù để ra ngay (không mất tiền) rồi đổ đi bình thường', () => {
    let s = act(giuTheRaTu(aTrongTu(), 'a'), { type: 'useJailCard', playerId: 'a' });
    expect(player(s, 'a')).toMatchObject({ inJail: false, cash: 500 });
    expect(coTheRaTu(s, 'a')).toBe(false);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
    s = roll(s, 1, 2);
    expect(player(s, 'a').position).toBe(13);
  });

  it('dùng thẻ ra tù rồi đổ đôi thì có lượt thêm', () => {
    let s = act(giuTheRaTu(aTrongTu(), 'a'), { type: 'useJailCard', playerId: 'a' });
    s = roll(s, 3, 3);
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('thẻ ra tù quay lại chồng Khí Vận sau khi dùng', () => {
    const s0 = giuTheRaTu(aTrongTu(), 'a');
    expect(s0.decks.community).toHaveLength(20);
    const s = act(s0, { type: 'useJailCard', playerId: 'a' });
    expect(s.decks.community).toContain('community-jail-free');
    expect(s.decks.community).toHaveLength(21);
    expect(s.decks.chance).toHaveLength(19);
  });

  it('không có thẻ thì không dùng thẻ ra tù được', () => {
    reject(aTrongTu(), { type: 'useJailCard', playerId: 'a' });
  });

  it('đã thử trượt 1 lần, lượt sau vẫn được trả 50Đ để ra rồi đổ', () => {
    let s = truot(aTrongTu(), 1);
    s = act(s, { type: 'payBail', playerId: 'a' });
    expect(player(s, 'a')).toMatchObject({ inJail: false, cash: 450 });
    s = roll(s, 2, 3);
    expect(player(s, 'a').position).toBe(15);
  });

  it('lượt thứ 3 trong tù, trước khi đổ, vẫn được trả 50Đ để ra rồi đổ bình thường', () => {
    let s = act(truot(aTrongTu(), 2), { type: 'payBail', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
    s = roll(s, 3, 3); // đã ra tù nên đôi được lượt thêm
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('lượt thứ 3 trong tù, trước khi đổ, vẫn được dùng thẻ ra tù', () => {
    const s = act(giuTheRaTu(truot(aTrongTu(), 2), 'a'), { type: 'useJailCard', playerId: 'a' });
    expect(player(s, 'a')).toMatchObject({ inJail: false, cash: 500 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('có đúng 50Đ vẫn trả bảo lãnh được, còn 0Đ', () => {
    const s = act(setPlayer(aTrongTu(), 'a', { cash: 50 }), { type: 'payBail', playerId: 'a' });
    expect(player(s, 'a')).toMatchObject({ inJail: false, cash: 0 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('ra tù xong thì số lần thử về 0', () => {
    const s = act(truot(aTrongTu(), 2), { type: 'payBail', playerId: 'a' });
    expect(player(s, 'a').jailAttempts).toBe(0);
  });

  it('thẻ ra tù rút được thì được giữ, không nằm trong chồng', () => {
    const s0 = topCard(newGame(), 'community-jail-free');
    const s = roll(s0, 1, 1); // ô 2 Khí Vận
    expect(coTheRaTu(s, 'a')).toBe(true);
    expect(s.decks.community).not.toContain('community-jail-free');
    expect(s.decks.community).toHaveLength(20);
  });

  it('vào tù khi đang giữ thẻ: thẻ không tự dùng', () => {
    const s0 = giuTheRaTu(setPlayer(newGame(), 'a', { position: 25 }), 'a');
    let s = roll(s0, 2, 3);
    expect(player(s, 'a').inJail).toBe(true);
    expect(coTheRaTu(s, 'a')).toBe(true);
    s = luotNhanh(s);
    expect(s.pending).toEqual({ type: 'jail', playerId: 'a' });
  });

  it('rút thẻ ra tù rồi dùng ở lần vào tù sau: thẻ về lại chồng Khí Vận', () => {
    let s = topCard(newGame(), 'community-jail-free');
    s = roll(s, 1, 1); // ô 2 Khí Vận: giữ thẻ; đôi nên đổ tiếp
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
    setPlayer(s, 'a', { position: 25 });
    s = roll(s, 2, 3); // ô 30 → tù
    s = luotNhanh(s); // b
    s = act(s, { type: 'useJailCard', playerId: 'a' });
    expect(player(s, 'a').inJail).toBe(false);
    expect(coTheRaTu(s, 'a')).toBe(false);
    expect(s.decks.community).toContain('community-jail-free');
    expect(s.decks.community).toHaveLength(21);
  });
});

describe('ở tù: thử đổ đôi (mục 6)', () => {
  it('ra đôi: ra tù, đi theo số đó, không có lượt thêm', () => {
    let s = roll(aTrongTu(), 3, 3);
    expect(player(s, 'a')).toMatchObject({ inJail: false, position: 16, cash: 500 });
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 16 });
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('ra đôi tới ô trống (Bãi Đỗ Xe) thì hết lượt ngay, không lượt thêm', () => {
    const s = roll(aTrongTu(), 5, 5);
    expect(player(s, 'a')).toMatchObject({ inJail: false, position: 20 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('ra đôi xong thì số lần thử về 0, lượt sau đổ bình thường', () => {
    let s = truot(aTrongTu(), 1);
    s = roll(s, 5, 5); // 20
    expect(player(s, 'a').jailAttempts).toBe(0);
    s = luotNhanh(s);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('không ra đôi lần 1: vẫn ở tù, không mất tiền và được thử tiếp ngay', () => {
    const s = roll(aTrongTu(), 1, 2);
    expect(player(s, 'a')).toMatchObject({
      inJail: true,
      position: 10,
      cash: 500,
      jailAttempts: 1,
    });
    expect(s.pending).toEqual({ type: 'jail', playerId: 'a' });
  });

  it('không ra đôi lần 2: vẫn ở tù và được thử lần 3 ngay', () => {
    const s = truot(aTrongTu(), 2);
    expect(player(s, 'a')).toMatchObject({
      inJail: true,
      position: 10,
      cash: 500,
      jailAttempts: 2,
    });
    expect(s.pending).toEqual({ type: 'jail', playerId: 'a' });
  });

  it('lần 3 không ra đôi: dừng thử và bắt buộc chọn trả 50Đ hoặc dùng thẻ', () => {
    const s = roll(truot(aTrongTu(), 2), 2, 4);
    expect(player(s, 'a')).toMatchObject({ inJail: true, position: 10, cash: 500 });
    expect(s.pending).toEqual({ type: 'jailRelease', playerId: 'a', steps: 6 });
  });

  it('lần 3 không ra đôi, trả 50Đ rồi đi thì không có lượt thêm', () => {
    let s = roll(truot(aTrongTu(), 2), 2, 4);
    s = act(s, { type: 'payBail', playerId: 'a' });
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('lần 3 ra đôi: ra tù miễn phí, đi theo số đó, không lượt thêm', () => {
    const s = roll(truot(aTrongTu(), 2), 5, 5);
    expect(player(s, 'a')).toMatchObject({ inJail: false, position: 20, cash: 500 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('lần 3 không ra đôi, có thẻ: được chọn trả 50Đ hoặc dùng thẻ', () => {
    const s = roll(giuTheRaTu(truot(aTrongTu(), 2), 'a'), 1, 2);
    expect(s.pending).toEqual({ type: 'jailRelease', playerId: 'a', steps: 3 });
    expect(player(s, 'a').position).toBe(10);
  });

  it('lần 3 có thẻ, chọn trả 50Đ: giữ thẻ, đi theo tổng', () => {
    let s = roll(giuTheRaTu(truot(aTrongTu(), 2), 'a'), 1, 2);
    s = act(s, { type: 'payBail', playerId: 'a' });
    expect(player(s, 'a')).toMatchObject({ inJail: false, position: 13, cash: 450 });
    expect(coTheRaTu(s, 'a')).toBe(true);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 13 });
  });

  it('lần 3 có thẻ, chọn dùng thẻ: không mất tiền, thẻ về chồng Khí Vận, đi theo tổng', () => {
    let s = roll(giuTheRaTu(truot(aTrongTu(), 2), 'a'), 1, 2);
    s = act(s, { type: 'useJailCard', playerId: 'a' });
    expect(player(s, 'a')).toMatchObject({ inJail: false, position: 13, cash: 500 });
    expect(coTheRaTu(s, 'a')).toBe(false);
    expect(s.decks.community).toContain('community-jail-free');
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 13 });
  });

  it('đang chọn trả/dùng thẻ ở lần 3 thì không được đổ lại', () => {
    const s = roll(giuTheRaTu(truot(aTrongTu(), 2), 'a'), 1, 2);
    reject(s, { type: 'roll', playerId: 'a' }, [1, 1]);
  });

  it('lần 3 có đúng 50Đ: trả hết còn 0Đ rồi đi', () => {
    const s0 = setPlayer(truot(aTrongTu(), 2), 'a', { cash: 50 });
    let s = roll(s0, 1, 2);
    s = act(s, { type: 'payBail', playerId: 'a' });
    expect(player(s, 'a')).toMatchObject({ inJail: false, position: 13, cash: 0 });
  });

  it('lần 3 thiếu tiền nhưng có tài sản: chưa đủ 50Đ thì không thể chọn trả bảo lãnh', () => {
    const s0 = own(setPlayer(truot(aTrongTu(), 2), 'a', { cash: 30 }), 'a', 39);
    const s = roll(s0, 1, 2);
    reject(s, { type: 'payBail', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'jailRelease', playerId: 'a', steps: 3 });
  });

  it('lần 3 chọn trả 50Đ khi thiếu tiền: vào xử lý nợ rồi thanh lý tài sản', () => {
    let s = own(setPlayer(truot(aTrongTu(), 2), 'a', { cash: 30 }), 'a', 39);
    s = roll(s, 1, 2);
    s = act(s, { type: 'payBail', playerId: 'a' });
    s = act(s, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 39 }] });
    if (s.pending.type === 'pay') s = act(s, { type: 'pay', playerId: 'a' });
    expect(player(s, 'a')).toMatchObject({ inJail: false, position: 13 });
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 13 });
  });

  it('lần 3 thiếu tiền và không có thẻ: vẫn dừng ở bước bắt buộc ra tù', () => {
    const s0 = setPlayer(truot(aTrongTu(), 2), 'a', { cash: 30 });
    const s = roll(s0, 1, 2);
    expect(isGameOver(s)).toBe(false);
    expect(s.pending).toEqual({ type: 'jailRelease', playerId: 'a', steps: 3 });
  });

  it('ở tù thì không dùng Metro', () => {
    reject(aTrongTu(), { type: 'metro', playerId: 'a', destination: 20 });
  });

  it('người khác không trả bảo lãnh hay đổ thay', () => {
    const s = aTrongTu();
    reject(s, { type: 'payBail', playerId: 'b' });
    reject(s, { type: 'roll', playerId: 'b' }, [1, 1]);
  });

  it('không ở tù thì không trả bảo lãnh hay dùng thẻ ra tù được', () => {
    const s = giuTheRaTu(newGame(), 'a');
    reject(s, { type: 'payBail', playerId: 'a' });
    reject(s, { type: 'useJailCard', playerId: 'a' });
  });

  it('vào tù do đôi lần 3 thì lượt sau phải xử lý tù', () => {
    let s = setPlayer(newGame(), 'a', { position: 16 });
    s = roll(s, 2, 2); // 20
    s = roll(s, 2, 2); // 24
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    s = roll(s, 1, 1); // đôi lần 3
    expect(player(s, 'a')).toMatchObject({ inJail: true, position: 10, jailAttempts: 0 });
    s = luotNhanh(s);
    expect(s.pending).toEqual({ type: 'jail', playerId: 'a' });
  });

  it('đầu lượt trong tù, trước khi đổ, vẫn được Ụp/Mở', () => {
    const s0 = own(aTrongTu(), 'a', 1);
    const s = act(s0, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 1 }] });
    expect(cash(s, 'a')).toBe(530);
    expect(s.pending).toEqual({ type: 'jail', playerId: 'a' });
  });
});

describe('chủ đang ở tù vẫn thu tiền thuê (mục 4)', () => {
  it('đất màu của người đang bị giam vẫn thu tiền', () => {
    const s0 = own(setPlayer(newGame(), 'b', { position: 10, inJail: true }), 'b', 3);
    let s = roll(s0, 1, 2);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 2, reason: 'rent' });
    s = act(s, { type: 'pay', playerId: 'a' });
    expect(cash(s, 'a')).toBe(498);
    expect(cash(s, 'b')).toBe(502);
  });

  it('ga của người đang bị giam vẫn thu tiền', () => {
    const s0 = own(setPlayer(newGame(), 'b', { position: 10, inJail: true }), 'b', 5);
    let s = roll(s0, 2, 3);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 25 });
    s = act(s, { type: 'pay', playerId: 'a' });
    expect(cash(s, 'b')).toBe(525);
  });
});

// ---------------------------------------------------------------------------
// 11. Hết giờ
// ---------------------------------------------------------------------------

describe('hết giờ: đổ, tù, Metro (mục 11)', () => {
  it('hết giờ ở bước đổ: máy chủ tự đổ', () => {
    const s = act(newGame(), { type: 'timeout' }, [2, 3]);
    expect(player(s, 'a').position).toBe(5);
    expect(s.lastDice).toEqual([2, 3]);
  });

  it('hết giờ ở lượt thêm sau đổ đôi: máy chủ tự đổ', () => {
    let s = setPlayer(newGame(), 'a', { position: 16 });
    s = roll(s, 2, 2);
    s = act(s, { type: 'timeout' }, [1, 2]);
    expect(player(s, 'a').position).toBe(23);
  });

  it('hết giờ ở tù: thử đổ đôi, không ra thì vẫn ở tù (không trả 50Đ)', () => {
    const s = act(aTrongTu(), { type: 'timeout' }, [1, 2]);
    expect(player(s, 'a')).toMatchObject({ inJail: true, cash: 500, jailAttempts: 1 });
    expect(s.pending).toEqual({ type: 'jail', playerId: 'a' });
  });

  it('hết giờ ở tù khi có thẻ: vẫn thử đổ đôi, không tự dùng thẻ ở lần 1', () => {
    const s = act(giuTheRaTu(aTrongTu(), 'a'), { type: 'timeout' }, [1, 2]);
    expect(player(s, 'a')).toMatchObject({ inJail: true, cash: 500 });
    expect(coTheRaTu(s, 'a')).toBe(true);
  });

  it('hết giờ ở tù, ra đôi: ra tù và đi theo số đó', () => {
    const s = act(aTrongTu(), { type: 'timeout' }, [4, 4]);
    expect(player(s, 'a')).toMatchObject({ inJail: false, position: 18, cash: 500 });
  });

  it('hết giờ lần thử 3 thất bại: chuyển sang bước bắt buộc chọn cách ra tù', () => {
    const s = act(giuTheRaTu(truot(aTrongTu(), 2), 'a'), { type: 'timeout' }, [1, 2]);
    expect(player(s, 'a')).toMatchObject({ inJail: true, position: 10, cash: 500 });
    expect(coTheRaTu(s, 'a')).toBe(true);
    expect(s.pending).toEqual({ type: 'jailRelease', playerId: 'a', steps: 3 });
  });

  it('hết giờ ở bước bắt buộc ra tù, không thẻ: tự trả 50Đ', () => {
    let s = act(truot(aTrongTu(), 2), { type: 'timeout' }, [1, 2]);
    s = act(s, { type: 'timeout' });
    expect(player(s, 'a')).toMatchObject({ inJail: false, position: 13, cash: 450 });
  });

  it('hết giờ khi đang chọn trả/dùng thẻ ở lần 3: dùng thẻ', () => {
    let s = roll(giuTheRaTu(truot(aTrongTu(), 2), 'a'), 1, 2);
    s = act(s, { type: 'timeout' });
    expect(player(s, 'a')).toMatchObject({ inJail: false, position: 13, cash: 500 });
    expect(coTheRaTu(s, 'a')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Thao tác sai người, sai bước
// ---------------------------------------------------------------------------

describe('thao tác sai người hoặc sai bước bị từ chối', () => {
  it('người không tới lượt không được đổ', () => {
    const msg = reject(newGame(), { type: 'roll', playerId: 'b' }, [1, 2]);
    expect(msg).toBeTruthy();
  });

  it('mã người chơi không tồn tại bị từ chối', () => {
    reject(newGame(), { type: 'roll', playerId: 'z' }, [1, 2]);
  });

  it('không mua/không bỏ mua khi đang chờ đổ', () => {
    const s = newGame();
    reject(s, { type: 'buy', playerId: 'a' });
    reject(s, { type: 'declineBuy', playerId: 'a' });
  });

  it('không trả tiền khi không có khoản nào', () => {
    reject(newGame(), { type: 'pay', playerId: 'a' });
  });

  it('người khác không mua thay', () => {
    const s = roll(newGame(), 1, 2);
    reject(s, { type: 'buy', playerId: 'b' });
  });

  it('không nâng cấp khi không chờ nâng cấp', () => {
    reject(newGame(), { type: 'upgrade', playerId: 'a' });
  });

  it('không chọn ô khi không chờ chọn ô', () => {
    reject(newGame(), { type: 'chooseTile', playerId: 'a', tile: 1 });
  });

  it('ván kết thúc thì mọi thao tác chơi bị từ chối', () => {
    const s = act(newGame(), { type: 'surrender', playerId: 'a' });
    reject(s, { type: 'roll', playerId: 'b' }, [1, 2]);
    reject(s, { type: 'timeout' }, [1, 2]);
  });
});

// ---------------------------------------------------------------------------
// Đổi quân
// ---------------------------------------------------------------------------

describe('đổi màu và biểu tượng (mục 1, 12)', () => {
  it('đổi sang màu và biểu tượng chưa ai dùng', () => {
    const s = act(newGame(), { type: 'changeAppearance', playerId: 'a', color: 7, icon: 19 });
    expect(player(s, 'a')).toMatchObject({ color: 7, icon: 19 });
  });

  it('giữ màu cũ, chỉ đổi biểu tượng', () => {
    const s = act(newGame(), { type: 'changeAppearance', playerId: 'a', color: 0, icon: 12 });
    expect(player(s, 'a')).toMatchObject({ color: 0, icon: 12 });
  });

  it('không được trùng màu người khác', () => {
    reject(newGame(), { type: 'changeAppearance', playerId: 'a', color: 1, icon: 12 });
  });

  it('không được trùng biểu tượng người khác', () => {
    reject(newGame(), { type: 'changeAppearance', playerId: 'a', color: 7, icon: 1 });
  });

  it('màu/biểu tượng ngoài phạm vi bị từ chối', () => {
    const s = newGame();
    reject(s, { type: 'changeAppearance', playerId: 'a', color: 8, icon: 12 });
    reject(s, { type: 'changeAppearance', playerId: 'a', color: -1, icon: 12 });
    reject(s, { type: 'changeAppearance', playerId: 'a', color: 7, icon: 20 });
    reject(s, { type: 'changeAppearance', playerId: 'a', color: 7, icon: 1.5 });
  });

  it('người không có trong ván không đổi quân được', () => {
    reject(newGame(), { type: 'changeAppearance', playerId: 'z', color: 7, icon: 19 });
  });

  it('đổi quân không làm đổi lượt hay bước đang chờ', () => {
    const s = act(newGame(), { type: 'changeAppearance', playerId: 'a', color: 7, icon: 19 });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
    expect(cash(s, 'a')).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Chuyển lượt và các hàm hỏi trạng thái
// ---------------------------------------------------------------------------

describe('chuyển lượt theo vòng ghế', () => {
  it('3 người: a → b → c → a', () => {
    let s = newGame(3);
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      order.push(who(s));
      s = luotNhanh(s);
    }
    expect(order).toEqual(['a', 'b', 'c', 'a']);
  });

  it('6 người: đủ một vòng rồi quay lại a', () => {
    let s = newGame(6);
    const order: string[] = [];
    for (let i = 0; i < 7; i++) {
      order.push(who(s));
      s = luotNhanh(s);
    }
    expect(order).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'a']);
  });

  it('người đang ở tù vẫn tới lượt, không bị bỏ qua', () => {
    let s = setPlayer(newGame(3), 'b', { position: 10, inJail: true });
    s = luotNhanh(s); // a
    expect(s.pending).toEqual({ type: 'jail', playerId: 'b' });
    s = roll(s, 1, 2); // b trượt lần 1
    expect(s.pending).toEqual({ type: 'jail', playerId: 'b' });
  });

  it('sau lượt có đổ đôi, người kế tiếp theo ghế mới tới lượt', () => {
    let s = setPlayer(newGame(3), 'a', { position: 16 });
    s = roll(s, 2, 2); // 20
    s = roll(s, 1, 2); // 23
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });
});

describe('waitingFor, isGameOver, winners', () => {
  it('waitingFor trả người đang được chờ', () => {
    let s = newGame();
    expect(waitingFor(s)).toBe('a');
    s = roll(s, 1, 2);
    expect(waitingFor(s)).toBe('a');
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(waitingFor(s)).toBe('b');
  });

  it('waitingFor trả người ở tù và người đang chọn Metro', () => {
    expect(waitingFor(aTrongTu())).toBe('a');
    expect(waitingFor(aToiMetro())).toBe('a');
  });

  it('ván mới chưa kết thúc, chưa có người thắng', () => {
    expect(winners(newGame())).toEqual([]);
    expect(isGameOver(newGame())).toBe(false);
  });

  it('đầu hàng: ván kết thúc ngay, người đầu hàng thua, còn lại thắng', () => {
    const s = act(newGame(3), { type: 'surrender', playerId: 'b' });
    expect(isGameOver(s)).toBe(true);
    expect(waitingFor(s)).toBeNull();
    expect(s.loserId).toBe('b');
    expect(player(s, 'b').status).toBe('surrendered');
    expect(winners(s).map((p) => p.id)).toEqual(['a', 'c']);
  });
});

// ---------------------------------------------------------------------------
// Thêm các trường hợp biên
// ---------------------------------------------------------------------------

describe('"lượt" là cả chuỗi đổ đôi và Metro (mục 3.5)', () => {
  it('mua đất ở lần đổ đầu, đôi tới ô 10 rồi Metro quay lại đất đó: chưa được nâng', () => {
    let s = setPlayer(newGame(), 'a', { position: 4 });
    s = roll(s, 1, 1); // 6 Bưu Điện Hà Nội
    s = act(s, { type: 'buy', playerId: 'a' }); // 400Đ
    s = roll(s, 2, 2); // 10
    expect(s.pending).toEqual({ type: 'metro', playerId: 'a' });
    s = metro(s, 6); // phí 200Đ
    expect(cash(s, 'a')).toBe(200);
    expect(s.tiles[6]).toMatchObject({ owner: 'a', level: 0 });
    // Không có bước nâng cấp; vẫn còn lượt thêm từ lần đôi thứ 2.
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('Metro tới đất của mình (mua từ lượt trước): được nâng cấp như bình thường', () => {
    const s0 = own(aToiMetro(), 'a', 11);
    let s = metro(s0, 11); // còn 250Đ, nâng 1 cấp tốn 100Đ
    expect(s.pending).toMatchObject({ type: 'upgrade', playerId: 'a', tile: 11, mode: 'build' });
    s = act(s, { type: 'upgrade', playerId: 'a' });
    expect(s.tiles[11]!.level).toBe(1);
    expect(cash(s, 'a')).toBe(150);
  });

  it('đôi tới ô Cơ Hội, thẻ đưa đi tiếp: vẫn còn lượt thêm', () => {
    const s0 = topCard(setPlayer(newGame(), 'a', { position: 5 }), 'chance-phu-quoc');
    let s = roll(s0, 1, 1); // 7 → Phú Quốc (39)
    expect(player(s, 'a').position).toBe(39);
    expect(s.pending).toEqual({ type: 'buy', playerId: 'a', tile: 39 });
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });

  it('đôi rồi nợ thuế: được Xử lý nợ, trả xong vẫn còn lượt thêm', () => {
    const s0 = own(setPlayer(newGame(), 'a', { cash: 100 }), 'a', 39);
    let s = roll(s0, 2, 2); // ô 04 thuế 200Đ
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 200, reason: 'tax' });
    s = act(s, { type: 'manage', playerId: 'a', ops: [{ op: 'mortgage', tile: 39 }] });
    expect(cash(s, 'a')).toBe(300);
    s = act(s, { type: 'pay', playerId: 'a' });
    expect(cash(s, 'a')).toBe(100);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'a' });
  });
});

describe('Metro: thêm trường hợp biên (mục 5)', () => {
  it('qua ô 00 rồi tới ô 10: phí Metro tính trên tiền đã cộng 200Đ', () => {
    let s = setPlayer(newGame(), 'a', { position: 39 });
    s = roll(s, 5, 6); // 700Đ
    s = metro(s, 20);
    expect(cash(s, 'a')).toBe(350);
  });

  it('đích là đất người khác đang ở tù: vẫn trả tiền thuê', () => {
    const s0 = own(setPlayer(aToiMetro(), 'b', { position: 10, inJail: true }), 'b', 39);
    let s = metro(s0, 39);
    s = act(s, { type: 'pay', playerId: 'a' });
    expect(cash(s, 'b')).toBe(550);
  });

  it('đích là ga: không gieo xúc xắc, tiền thuê theo số ga của chủ', () => {
    const s0 = own(own(aToiMetro(), 'b', 5), 'b', 15);
    let s = metro(s0, 15);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 50 });
    s = act(s, { type: 'pay', playerId: 'a' });
    expect(cash(s, 'a')).toBe(200);
  });
});

describe('ở tù: thêm trường hợp biên (mục 6)', () => {
  it('ra tù bằng đôi tới nhà máy: tính tiền theo chính lần đổ đó, không gieo mới', () => {
    const s0 = own(aTrongTu(), 'b', 12);
    // 1+1 → ô 12; chủ có 1 nhà máy: 2 × 4 = 8Đ. Kịch bản chỉ có 2 viên.
    let s = roll(s0, 1, 1);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 8 });
    s = act(s, { type: 'pay', playerId: 'a' });
    expect(cash(s, 'a')).toBe(492);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('dùng thẻ ra tù ở đầu lượt thì số lần thử về 0', () => {
    let s = giuTheRaTu(truot(aTrongTu(), 1), 'a');
    s = act(s, { type: 'useJailCard', playerId: 'a' });
    expect(player(s, 'a').jailAttempts).toBe(0);
  });

  it('trả 50Đ ra tù rồi đổ đôi 3 lần liên tiếp: vào tù lại', () => {
    let s = act(aTrongTu(), { type: 'payBail', playerId: 'a' });
    s = roll(s, 5, 5); // 20
    s = roll(s, 2, 2); // 24
    s = act(s, { type: 'declineBuy', playerId: 'a' });
    s = roll(s, 3, 3); // đôi lần 3
    expect(player(s, 'a')).toMatchObject({ position: 10, inJail: true });
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });

  it('ba lần thử tù của một người không cho người khác chen lượt', () => {
    let s = roll(aTrongTu(), 1, 2);
    expect(s.pending).toEqual({ type: 'jail', playerId: 'a' });
    reject(s, { type: 'roll', playerId: 'b' }, [2, 3]);
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'jail', playerId: 'a' });
    reject(s, { type: 'roll', playerId: 'b' }, [2, 3]);
    s = roll(s, 1, 2);
    expect(s.pending).toEqual({ type: 'jailRelease', playerId: 'a', steps: 3 });
    expect(player(s, 'a').jailAttempts).toBe(3);
  });

  it('lần 3 trả 50Đ rồi tới đất người khác: trả cả tiền thuê', () => {
    const s0 = own(truot(aTrongTu(), 2), 'b', 13);
    let s = roll(s0, 1, 2); // lần 3 trượt, phải chọn trả 50Đ
    s = act(s, { type: 'payBail', playerId: 'a' });
    expect(cash(s, 'a')).toBe(450);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 10, reason: 'rent' });
    s = act(s, { type: 'pay', playerId: 'a' });
    expect(cash(s, 'a')).toBe(440);
    expect(cash(s, 'b')).toBe(510);
  });
});

describe('thao tác sai bước: thêm (mục 3, 5, 6)', () => {
  it('không bỏ nâng cấp, không đi Metro, không trả bảo lãnh khi đang chờ mua', () => {
    const s = roll(newGame(), 1, 2);
    reject(s, { type: 'skipUpgrade', playerId: 'a' });
    reject(s, { type: 'metro', playerId: 'a', destination: 20 });
    reject(s, { type: 'payBail', playerId: 'a' });
    reject(s, { type: 'useJailCard', playerId: 'a' });
  });

  it('hết giờ khi đang chờ mua: bỏ qua, không mua', () => {
    let s = roll(newGame(), 1, 2);
    s = act(s, { type: 'timeout' });
    expect(s.tiles[3]!.owner).toBeNull();
    expect(cash(s, 'a')).toBe(500);
    expect(s.pending).toEqual({ type: 'roll', playerId: 'b' });
  });
});
