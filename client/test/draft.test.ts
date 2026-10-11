import { describe, expect, it } from 'vitest';
import {
  applyAction,
  BOARD,
  createGame,
  downgradeRefund,
  maxLiquidationValue,
  mortgageValue,
  redeemCost,
  scriptedRng,
  seededRng,
  sellValue,
  type Action,
  type GameState,
  type ManageOp,
} from '@cotiphu/shared';
import {
  buildDraft,
  debtorOf,
  canConfirm,
  manageMode,
  pressMinus,
  pressPlus,
  type Draft,
  type DraftMode,
} from '../src/game/draft';

// Bản nháp Ụp/Mở và Xử lý nợ của giao diện (docs/luat-choi.md mục 7, 10).
// Mọi bản nháp đều được gửi thử qua bộ luật để chắc số tiền dự đoán đúng bằng kết quả thật.

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------

const PLAYERS = [
  { id: 'a', name: 'An', color: 0, icon: 0 },
  { id: 'b', name: 'Bình', color: 1, icon: 1 },
  { id: 'c', name: 'Chi', color: 2, icon: 2 },
];

/** Ván mới `n` người, `a` đi trước và đang chờ đổ. */
function newGame(n = 3): GameState {
  const s = createGame(PLAYERS.slice(0, n), seededRng(1));
  s.current = 0;
  s.pending = { type: 'roll', playerId: 'a' };
  return s;
}

function own(s: GameState, id: string, tile: number, level = 0, mortgaged = false): GameState {
  Object.assign(s.tiles[tile]!, { owner: id, level, mortgaged, boughtTurn: null });
  return s;
}

const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;
const cash = (s: GameState, id: string) => player(s, id).cash;
const setCash = (s: GameState, id: string, n: number) => ((player(s, id).cash = n), s);

function act(s: GameState, action: Action, dice: number[] = []): GameState {
  const r = applyAction(s, action, scriptedRng(dice));
  if (!r.ok) throw new Error(`${JSON.stringify(action)}: ${r.error}`);
  return r.state;
}

const rejects = (s: GameState, action: Action) =>
  expect(applyAction(s, action, scriptedRng([])).ok).toBe(false);

const priceOf = (i: number) => {
  const t = BOARD[i]!;
  if (!('price' in t)) throw new Error(`Ô ${i} không mua được`);
  return t.price;
};

const buildCostOf = (i: number) => {
  const t = BOARD[i]!;
  if (t.kind !== 'property') throw new Error(`Ô ${i} không phải đất màu`);
  return t.upgradeCost;
};

/** Bấm lần lượt các nút, ví dụ '-39' là nút − của ô 39, '+21' là nút + của ô 21. */
function press(game: GameState, playerId: string, mode: DraftMode, ...keys: string[]): Draft {
  let d = buildDraft(game, playerId, [], mode);
  for (const k of keys) {
    const tile = Number(k.slice(1));
    d = buildDraft(game, playerId, k[0] === '-' ? pressMinus(d, tile) : pressPlus(d, tile), mode);
  }
  return d;
}

const asset = (d: Draft, tile: number) => d.assets.find((a) => a.tile === tile)!;

/** Gửi bản nháp cho bộ luật; tiền và từng ô phải đúng như bản nháp dự đoán. */
function confirm(game: GameState, d: Draft): GameState {
  const s = act(game, { type: 'manage', playerId: d.playerId, ops: d.ops });
  expect(cash(s, d.playerId)).toBe(d.cashAfter);
  for (const a of d.assets) {
    const t = s.tiles[a.tile]!;
    expect({ owned: t.owner === d.playerId, level: t.level, mortgaged: t.mortgaged }).toEqual(
      a.now,
    );
  }
  return s;
}

/**
 * Đầu lượt của `a`, 100Đ: Phú Quốc khách sạn (39), Hạ Long 2 nhà (16), Cầu Rồng đang cắm (21),
 * Ga Hà Nội (05), Nhà Máy Điện (12), Nhà Máy Nước đang cắm (28).
 */
function startOfTurn(): GameState {
  const s = newGame();
  own(s, 'a', 39, 5);
  own(s, 'a', 16, 2);
  own(s, 'a', 21, 0, true);
  own(s, 'a', 5);
  own(s, 'a', 12);
  own(s, 'a', 28, 0, true);
  own(s, 'b', 24, 2);
  return setCash(s, 'a', 100);
}

/**
 * `a` (50Đ) từ ô 20 đổ 1 + 3 tới Hội An của `b` (2 nhà, thuê 300Đ): phải xử lý nợ.
 * Tài sản của `a`: Hạ Long 2 nhà (16), Ga Hà Nội (05), Cầu Rồng đang cắm (21).
 */
function inDebt(): GameState {
  const s = newGame();
  own(s, 'b', 24, 2);
  own(s, 'a', 16, 2);
  own(s, 'a', 5);
  own(s, 'a', 21, 0, true);
  setCash(s, 'a', 50);
  player(s, 'a').position = 20;
  return act(s, { type: 'roll', playerId: 'a' }, [1, 3]);
}

// ---------------------------------------------------------------------------
// Khi nào được mở bảng
// ---------------------------------------------------------------------------

describe('manageMode giống điều kiện của bộ luật', () => {
  const op: ManageOp = { op: 'mortgage', tile: 5 };

  it('đầu lượt của mình trước khi đổ: Ụp/Mở', () => {
    const s = startOfTurn();
    expect(manageMode(s, 'a')).toBe('manage');
    act(s, { type: 'manage', playerId: 'a', ops: [op] });
  });

  it('không phải lượt mình, hoặc đã đổ: không được', () => {
    const s = own(startOfTurn(), 'b', 15);
    expect(manageMode(s, 'b')).toBeNull();
    rejects(s, { type: 'manage', playerId: 'b', ops: [{ op: 'mortgage', tile: 15 }] });
    player(s, 'a').position = 0;
    const rolled = act(s, { type: 'roll', playerId: 'a' }, [1, 2]); // ô 03 vô chủ, đang chờ mua
    expect(rolled.pending.type).toBe('buy');
    expect(manageMode(rolled, 'a')).toBeNull();
    rejects(rolled, { type: 'manage', playerId: 'a', ops: [op] });
  });

  it('đầu lượt trong tù: Ụp/Mở', () => {
    const s = startOfTurn();
    Object.assign(player(s, 'a'), { position: 10, inJail: true });
    s.pending = { type: 'jail', playerId: 'a' };
    expect(manageMode(s, 'a')).toBe('manage');
    act(s, { type: 'manage', playerId: 'a', ops: [op] });
  });

  it('thiếu tiền cho khoản phải trả: Xử lý nợ', () => {
    const s = inDebt();
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 300 });
    expect(manageMode(s, 'a')).toBe('debt');
    expect(manageMode(s, 'b')).toBeNull();
  });

  it('ván đã kết thúc: không được', () => {
    const s = act(startOfTurn(), { type: 'surrender', playerId: 'b' });
    expect(manageMode(s, 'a')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Nút −
// ---------------------------------------------------------------------------

describe('nút −: hạ từng cấp, rồi cắm, rồi bán', () => {
  it('Phú Quốc khách sạn: 5 lần hạ 100Đ, cắm 200Đ, bán khi đang cắm 20Đ (bảng giá mục 7)', () => {
    const s = startOfTurn();
    const amounts: number[] = [];
    let d = buildDraft(s, 'a', [], 'manage');
    for (let k = 0; k < 7; k++) {
      const m = asset(d, 39).minus!;
      amounts.push(m.amount);
      d = buildDraft(s, 'a', pressMinus(d, 39), 'manage');
    }
    expect(amounts).toEqual([100, 100, 100, 100, 100, 200, 20]);
    expect(d.ops.map((o) => o.op)).toEqual([
      'downgrade',
      'downgrade',
      'downgrade',
      'downgrade',
      'downgrade',
      'mortgage',
      'sell',
    ]);
    expect(asset(d, 39).minus).toBeNull();
    expect(asset(d, 39).now).toEqual({ owned: false, level: 0, mortgaged: false });
    expect(d.cashAfter).toBe(100 + 720);
    confirm(s, d);
  });

  it('số tiền lấy từ hàm tài chính của bộ luật', () => {
    const s = startOfTurn();
    const d = buildDraft(s, 'a', [], 'manage');
    expect(asset(d, 16).minus).toEqual({
      kind: 'downgrade',
      amount: downgradeRefund(buildCostOf(16)),
    });
    expect(asset(d, 5).minus).toEqual({ kind: 'mortgage', amount: mortgageValue(priceOf(5)) });
    expect(asset(d, 21).minus).toEqual({ kind: 'sell', amount: sellValue(priceOf(21), true) });
  });

  it('cắm rồi bán trong cùng bản nháp bằng đúng bán thẳng (55%)', () => {
    for (const t of BOARD) {
      if (!('price' in t)) continue;
      const s = own(newGame(), 'a', t.index);
      const d = press(s, 'a', 'manage', `-${t.index}`, `-${t.index}`);
      expect(d.cashAfter - d.cash).toBe(sellValue(t.price, false));
      confirm(s, d);
    }
  });

  it('ga: cắm 100Đ rồi bán 10Đ; ô đã bán thì nút − tắt', () => {
    const s = startOfTurn();
    const d = press(s, 'a', 'manage', '-5', '-5');
    expect(d.steps.map((x) => x.amount)).toEqual([100, 10]);
    expect(asset(d, 5).minus).toBeNull();
    confirm(s, d);
  });

  it('bấm − đến hết mọi ô = tiền mặt + giá trị thanh lý tối đa của bộ luật', () => {
    const s = startOfTurn();
    let d = buildDraft(s, 'a', [], 'manage');
    for (;;) {
      const a = d.assets.find((x) => x.minus && x.minus.kind !== 'undo');
      if (!a) break;
      d = buildDraft(s, 'a', pressMinus(d, a.tile), 'manage');
    }
    expect(d.cashAfter).toBe(100 + maxLiquidationValue(s, 'a'));
    confirm(s, d);
  });
});

// ---------------------------------------------------------------------------
// Nút +
// ---------------------------------------------------------------------------

describe('nút +: hoàn lại bước nháp cuối, hoặc chuộc ô đã cắm từ trước', () => {
  it('hoàn lại đúng số tiền của bước cuối, không lên quá cấp lúc đầu', () => {
    const s = startOfTurn();
    expect(asset(buildDraft(s, 'a', [], 'manage'), 16).plus).toBeNull();
    let d = press(s, 'a', 'manage', '-16', '-16', '-16');
    expect(asset(d, 16).now).toEqual({ owned: true, level: 0, mortgaged: true });
    expect(asset(d, 16).plus).toEqual({ kind: 'undo', amount: -mortgageValue(priceOf(16)) });
    d = buildDraft(s, 'a', pressPlus(d, 16), 'manage');
    expect(asset(d, 16).plus).toEqual({ kind: 'undo', amount: -downgradeRefund(buildCostOf(16)) });
    d = buildDraft(s, 'a', pressPlus(d, 16), 'manage');
    d = buildDraft(s, 'a', pressPlus(d, 16), 'manage');
    expect(d.ops).toEqual([]);
    expect(d.cashAfter).toBe(d.cash);
    expect(asset(d, 16).now).toEqual(asset(d, 16).start);
    expect(asset(d, 16).plus).toBeNull();
  });

  it('hoàn lại chỉ bỏ bước cuối của ô đó, các ô khác giữ nguyên thứ tự', () => {
    const s = startOfTurn();
    const d = press(s, 'a', 'manage', '-16', '-5', '-16', '+16');
    expect(d.ops).toEqual([
      { op: 'downgrade', tile: 16 },
      { op: 'mortgage', tile: 5 },
    ]);
    confirm(s, d);
  });

  it('ô đang cắm từ trước: + là chuộc 55% (Cầu Rồng 121Đ), chuộc rồi thì − bỏ chuộc', () => {
    const s = startOfTurn();
    const d0 = buildDraft(s, 'a', [], 'manage');
    expect(asset(d0, 21).plus).toEqual({ kind: 'redeem', amount: -redeemCost(priceOf(21)) });
    expect(redeemCost(priceOf(21))).toBe(121);
    const d1 = press(s, 'a', 'manage', '+21');
    expect(asset(d1, 21).now.mortgaged).toBe(false);
    expect(asset(d1, 21).plus).toBeNull();
    expect(asset(d1, 21).minus).toEqual({ kind: 'undo', amount: 121 });
    expect(d1.cashAfter).toBe(100 - 121);
    expect(canConfirm(d1)).toBe(false);
    rejects(s, { type: 'manage', playerId: 'a', ops: d1.ops });
    const d2 = press(s, 'a', 'manage', '+21', '-21');
    expect(d2.ops).toEqual([]);
    expect(asset(d2, 21).minus).toEqual({ kind: 'sell', amount: 11 });
  });

  it('chuộc rồi thanh lý ô khác cho đủ tiền: bộ luật chỉ xét tiền sau cả bản nháp', () => {
    const s = setCash(startOfTurn(), 'a', 0);
    const d = press(s, 'a', 'manage', '+21', '-5', '-12');
    expect(d.cashAfter).toBe(-121 + 100 + 75);
    expect(canConfirm(d)).toBe(true);
    confirm(s, d);
  });

  it('ô đang cắm từ trước: bán 5% rồi + hoàn lại, + lần nữa mới là chuộc', () => {
    const s = startOfTurn();
    const d = press(s, 'a', 'manage', '-28');
    expect(d.steps).toEqual([{ op: { op: 'sell', tile: 28 }, amount: 7 }]);
    expect(asset(d, 28).plus).toEqual({ kind: 'undo', amount: -7 });
    const back = press(s, 'a', 'manage', '-28', '+28');
    expect(asset(back, 28).plus).toEqual({ kind: 'redeem', amount: -82 });
  });

  it('bản nháp trống không xác nhận được', () => {
    const d = buildDraft(startOfTurn(), 'a', [], 'manage');
    expect(canConfirm(d)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bộ luật nhận mọi bản nháp giao diện tạo ra
// ---------------------------------------------------------------------------

describe('bấm ngẫu nhiên: bộ luật luôn nhận và ra đúng số tiền dự đoán', () => {
  const tiles = [39, 16, 21, 5, 12, 28];

  function randomDraft(s: GameState, mode: DraftMode, seed: number): Draft {
    const rng = seededRng(seed);
    let d = buildDraft(s, 'a', [], mode);
    const n = rng.int(1, 20);
    for (let k = 0; k < n; k++) {
      const tile = tiles[rng.int(0, tiles.length - 1)]!;
      d = buildDraft(s, 'a', rng.int(1, 10) <= 6 ? pressMinus(d, tile) : pressPlus(d, tile), mode);
    }
    return d;
  }

  it('đầu lượt: 400 bản nháp ngẫu nhiên', () => {
    const base = startOfTurn();
    const seen = { accepted: 0, rejected: 0, redeem: 0, sellMortgaged: 0 };
    // Nhiều tiền để thử cả bản nháp có chuộc; ít tiền để thử cả trường hợp bị chặn vì âm tiền.
    for (const money of [2000, 0]) {
      const s = setCash(structuredClone(base), 'a', money);
      // Tiền thật rất lớn: mọi bản nháp phải được nhận, chỉ khác điều kiện tiền.
      const rich = setCash(structuredClone(base), 'a', 100_000);
      for (let seed = 1; seed <= 200; seed++) {
        const d = randomDraft(s, 'manage', seed);
        if (d.ops.length === 0) continue;
        const r = act(rich, { type: 'manage', playerId: 'a', ops: d.ops });
        expect(cash(r, 'a')).toBe(100_000 + d.cashAfter - d.cash);
        if (canConfirm(d)) {
          confirm(s, d);
          seen.accepted++;
        } else {
          rejects(s, { type: 'manage', playerId: 'a', ops: d.ops });
          seen.rejected++;
        }
        if (d.ops.some((o) => o.op === 'redeem')) seen.redeem++;
        if (d.steps.some((x) => x.op.op === 'sell' && x.amount < 20)) seen.sellMortgaged++;
      }
    }
    expect(Object.values(seen).every((n) => n > 10)).toBe(true);
  });

  it('đang nợ: không bao giờ có chuộc, đủ tiền thì thanh lý rồi trả được', () => {
    const base = inDebt();
    // Thêm tài sản để có nhiều đường thanh lý.
    own(base, 'a', 39, 5);
    own(base, 'a', 12);
    own(base, 'a', 28, 0, true);
    let paid = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const d = randomDraft(base, 'debt', seed);
      expect(d.ops.some((o) => o.op === 'redeem')).toBe(false);
      if (d.ops.length === 0) continue;
      const s = confirm(base, d);
      if (d.cashAfter >= 300) {
        const after = act(s, { type: 'pay', playerId: 'a' });
        expect(cash(after, 'a')).toBe(d.cashAfter - 300);
        paid++;
      } else {
        rejects(s, { type: 'pay', playerId: 'a' });
      }
    }
    expect(paid).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Xử lý nợ
// ---------------------------------------------------------------------------

describe('xử lý nợ', () => {
  it('thuê 300Đ khi có 50Đ: hạ 2 nhà, cắm ga, bán ga, cắm Hạ Long rồi trả', () => {
    const s = inDebt();
    const d = press(s, 'a', 'debt', '-16', '-16', '-5', '-5', '-16');
    expect(d.steps.map((x) => x.amount)).toEqual([50, 50, 100, 10, 90]);
    expect(d.cashAfter).toBe(350);
    const paid = act(confirm(s, d), { type: 'pay', playerId: 'a' });
    expect(cash(paid, 'a')).toBe(50);
    expect(cash(paid, 'b')).toBe(cash(s, 'b') + 300);
  });

  it('đang nợ thì ô đã cắm không có nút chuộc', () => {
    const d = buildDraft(inDebt(), 'a', [], 'debt');
    expect(asset(d, 21).plus).toBeNull();
    expect(asset(d, 21).minus).toEqual({ kind: 'sell', amount: 11 });
  });

  it('Mừng sinh nhật: người nợ không phải người đang chơi lượt', () => {
    const s0 = newGame();
    own(s0, 'b', 1);
    setCash(s0, 'b', 5);
    player(s0, 'a').position = 14;
    s0.decks.community = [
      'community-birthday',
      ...s0.decks.community.filter((c) => c !== 'community-birthday'),
    ];
    const s1 = act(s0, { type: 'roll', playerId: 'a' }, [1, 2]);
    expect(s1.pending).toMatchObject({ type: 'drawCard', playerId: 'a', deck: 'community' });
    const s = act(s1, { type: 'drawCard', playerId: 'a' });
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'b', total: 10 });
    expect(s.players[s.current]!.id).toBe('a');
    expect(manageMode(s, 'b')).toBe('debt');
    expect(manageMode(s, 'a')).toBeNull();
    const d = press(s, 'b', 'debt', '-1');
    expect(d.cashAfter).toBe(5 + 30);
    const after = act(confirm(s, d), { type: 'pay', playerId: 'b' });
    expect(cash(after, 'b')).toBe(25);
    // Chi đủ tiền nên tự trả; hết lượt An, tới Bình.
    expect(cash(after, 'a')).toBe(cash(s0, 'a') + 20);
    expect(after.pending).toMatchObject({ type: 'roll', playerId: 'b' });
  });

  it('không đủ dù thanh lý hết: bộ luật tuyên bố phá sản ngay, không có bảng Xử lý nợ', () => {
    const s0 = newGame();
    own(s0, 'b', 39, 5);
    own(s0, 'a', 1);
    setCash(s0, 'a', 100);
    player(s0, 'a').position = 37;
    const s = act(s0, { type: 'roll', playerId: 'a' }, [1, 1]);
    expect(s.pending.type).toBe('ended');
    expect(s.loserId).toBe('a');
    expect(manageMode(s, 'a')).toBeNull();
  });

  it('debtorOf: giữ màn Xử lý nợ từ lúc thiếu tiền đến khi trả xong', () => {
    const s = inDebt();
    expect(debtorOf(s, null)).toBe('a');
    const d = press(s, 'a', 'debt', '-16', '-16', '-5', '-5', '-16');
    // Vừa thanh lý đủ nhưng chưa trả: vẫn là người nợ để màn trả luôn.
    const liquidated = confirm(s, d);
    expect(debtorOf(liquidated, s)).toBe('a');
    expect(debtorOf(liquidated, null)).toBeNull();
    const paid = act(liquidated, { type: 'pay', playerId: 'a' });
    expect(debtorOf(paid, liquidated)).toBeNull();
  });

  it('debtorOf: khoản phải trả đủ tiền thì không phải nợ', () => {
    const s0 = newGame();
    own(s0, 'b', 24, 2);
    player(s0, 'a').position = 20;
    const s = act(s0, { type: 'roll', playerId: 'a' }, [1, 3]);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 300 });
    expect(debtorOf(s, s0)).toBeNull();
  });
});
