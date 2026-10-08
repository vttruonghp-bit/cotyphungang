/**
 * Bản nháp Ụp/Mở và Xử lý nợ (docs/luat-choi.md mục 7, 10): các thao tác chưa xác nhận.
 * Tiền lấy từ hàm tài chính của bộ luật; điều kiện kiểm tra chép đúng manage() trong
 * shared/src/engine/game.ts để giao diện không đưa ra thao tác nào bộ luật sẽ từ chối.
 */
import {
  BOARD,
  downgradeRefund,
  mortgageValue,
  redeemCost,
  sellValue,
  type GameState,
  type ManageOp,
} from '@cotiphu/shared';

/** manage: đầu lượt (−, + và chuộc). debt: đang nợ (chỉ − và hoàn lại, không chuộc). */
export type DraftMode = 'manage' | 'debt';

export type ManageKind = ManageOp['op'];

/** Trạng thái một tài sản trong bản nháp. */
export interface AssetState {
  owned: boolean;
  /** 0 = đất trống, 1–4 nhà, 5 = khách sạn (ga, nhà máy luôn 0). */
  level: number;
  mortgaged: boolean;
}

/** Một thao tác của bản nháp và tiền mặt nó làm đổi: + nhận, − trả. */
export interface DraftStep {
  op: ManageOp;
  amount: number;
}

/** Việc nút − hoặc + sẽ làm. `undo` bỏ bước nháp cuối trên ô, đúng bằng số tiền của bước đó. */
export interface DraftMove {
  kind: ManageKind | 'undo';
  /** Tiền mặt đổi khi bấm: + nhận, − trả. */
  amount: number;
}

export interface AssetDraft {
  tile: number;
  /** Lúc mở bảng. */
  start: AssetState;
  /** Sau các bước nháp. */
  now: AssetState;
  /** Các bước nháp trên ô này, theo thứ tự bấm. */
  steps: DraftStep[];
  /** Tổng tiền các bước trên ô này. */
  amount: number;
  minus: DraftMove | null;
  plus: DraftMove | null;
  mortgage: DraftMove | null;
  sell: DraftMove | null;
  undo: DraftMove | null;
}

export interface Draft {
  playerId: string;
  mode: DraftMode;
  /** Gửi nguyên danh sách này trong thao tác `manage`. */
  ops: ManageOp[];
  steps: DraftStep[];
  /** Mọi tài sản người chơi có lúc mở bảng, theo thứ tự ô trên bàn cờ. */
  assets: AssetDraft[];
  cash: number;
  cashAfter: number;
}

/**
 * Bảng Ụp/Mở nào người chơi được dùng lúc này (giống điều kiện của manage() trong bộ luật):
 * đầu lượt của mình trước khi đổ, hoặc đang thiếu tiền cho khoản phải trả của mình.
 */
export function manageMode(game: GameState, playerId: string): DraftMode | null {
  const p = game.players.find((x) => x.id === playerId);
  if (!p || p.status !== 'active') return null;
  const pd = game.pending;
  if (pd.type === 'pay' && pd.playerId === p.id && p.cash < pd.total) return 'debt';
  const startOfTurn =
    game.players[game.current]?.id === p.id &&
    !game.rolled &&
    (pd.type === 'roll' || pd.type === 'jail');
  return startOfTurn ? 'manage' : null;
}

/**
 * Người phải mở Xử lý nợ lúc này: đang thiếu tiền cho khoản phải trả, hoặc vừa thanh lý đủ
 * (thao tác trước là Ụp/Mở lúc nợ) mà chưa trả, để màn giữ nguyên và trả luôn.
 */
export function debtorOf(game: GameState, previous: GameState | null): string | null {
  const pd = game.pending;
  if (pd.type !== 'pay') return null;
  const cashOf = (s: GameState) => s.players.find((p) => p.id === pd.playerId)?.cash ?? 0;
  if (cashOf(game) < pd.total) return pd.playerId;
  const before = previous?.pending;
  const justLiquidated =
    previous !== null &&
    before?.type === 'pay' &&
    before.playerId === pd.playerId &&
    before.total === pd.total &&
    cashOf(previous) < before.total;
  return justLiquidated ? pd.playerId : null;
}

/** Các ô (đất, ga, nhà máy) người chơi đang có, theo thứ tự trên bàn cờ. */
export const ownedAssets = (game: GameState, playerId: string): number[] =>
  game.tiles.flatMap((t, i) => (t?.owner === playerId ? [i] : []));

function startState(game: GameState, playerId: string, tile: number): AssetState {
  const t = game.tiles[tile];
  return {
    owned: t?.owner === playerId,
    level: t?.level ?? 0,
    mortgaged: t?.mortgaged ?? false,
  };
}

/** Tiền một thao tác đem lại trên ô đang ở trạng thái `st`, hoặc null nếu bộ luật sẽ từ chối. */
function stepAmount(
  tile: number,
  st: AssetState,
  kind: ManageKind,
  mode: DraftMode,
): number | null {
  const t = BOARD[tile];
  if (!t || !('price' in t) || !st.owned) return null;
  switch (kind) {
    case 'downgrade':
      return t.kind === 'property' && st.level > 0 ? downgradeRefund(t.upgradeCost) : null;
    case 'mortgage':
      return !st.mortgaged && st.level === 0 ? mortgageValue(t.price) : null;
    case 'sell':
      return st.level === 0 ? sellValue(t.price, st.mortgaged) : null;
    case 'redeem':
      return mode === 'manage' && st.mortgaged ? -redeemCost(t.price) : null;
  }
}

function applyKind(st: AssetState, kind: ManageKind): AssetState {
  switch (kind) {
    case 'downgrade':
      return { ...st, level: st.level - 1 };
    case 'mortgage':
      return { ...st, mortgaged: true };
    case 'sell':
      return { owned: false, level: 0, mortgaged: false };
    case 'redeem':
      return { ...st, mortgaged: false };
  }
}

/** Chạy thử các thao tác theo thứ tự; null nếu bộ luật sẽ từ chối một thao tác nào đó. */
function replay(
  game: GameState,
  playerId: string,
  ops: readonly ManageOp[],
  mode: DraftMode,
): { states: Map<number, AssetState>; steps: DraftStep[] } | null {
  const states = new Map<number, AssetState>();
  const mortgagedHere = new Set<number>();
  const steps: DraftStep[] = [];
  for (const op of ops) {
    // Bộ luật không cho chuộc ô vừa cắm trong cùng bản nháp (phải dùng nút + để hoàn lại).
    if (op.op === 'redeem' && mortgagedHere.has(op.tile)) return null;
    if (
      mode === 'debt' &&
      game.pending.type === 'pay' &&
      game.pending.reason === 'upgrade' &&
      game.pending.upgradeTile === op.tile
    )
      return null;
    const st = states.get(op.tile) ?? startState(game, playerId, op.tile);
    const amount = stepAmount(op.tile, st, op.op, mode);
    if (amount === null) return null;
    if (op.op === 'mortgage') mortgagedHere.add(op.tile);
    states.set(op.tile, applyKind(st, op.op));
    steps.push({ op, amount });
  }
  return { states, steps };
}

/**
 * Nút −: bỏ bước chuộc vừa nháp, hoặc bước thanh lý kế tiếp: hạ 1 cấp đến hết công trình,
 * rồi cắm, rồi bán (cắm rồi bán bằng đúng bán thẳng).
 */
function nextMinus(
  tile: number,
  now: AssetState,
  last: DraftStep | undefined,
  mode: DraftMode,
): DraftMove | null {
  if (last?.op.op === 'redeem') return { kind: 'undo', amount: -last.amount };
  for (const kind of ['downgrade'] as const) {
    const amount = stepAmount(tile, now, kind, mode);
    if (amount !== null) return { kind, amount };
  }
  return null;
}

/** Nút +: hoàn lại bước nháp cuối trên ô; ô đã cắm từ trước (chưa có bước nào) thì là chuộc. */
function nextPlus(
  tile: number,
  now: AssetState,
  last: DraftStep | undefined,
  mode: DraftMode,
): DraftMove | null {
  if (last) return null;
  const amount = stepAmount(tile, now, 'redeem', mode);
  return amount === null ? null : { kind: 'redeem', amount };
}

/** Tính bản nháp. Danh sách thao tác không còn hợp lệ (ván đã đổi) thì coi như bản nháp trống. */
export function buildDraft(
  game: GameState,
  playerId: string,
  ops: readonly ManageOp[],
  mode: DraftMode,
): Draft {
  const valid = replay(game, playerId, ops, mode);
  const run = valid ?? replay(game, playerId, [], mode)!;
  const cash = game.players.find((p) => p.id === playerId)?.cash ?? 0;
  const assets = ownedAssets(game, playerId).map((tile): AssetDraft => {
    const start = startState(game, playerId, tile);
    const now = run.states.get(tile) ?? start;
    const steps = run.steps.filter((s) => s.op.tile === tile);
    const last = steps.at(-1);
    const protectedUpgrade =
      mode === 'debt' &&
      game.pending.type === 'pay' &&
      game.pending.reason === 'upgrade' &&
      game.pending.upgradeTile === tile;
    return {
      tile,
      start,
      now,
      steps,
      amount: steps.reduce((a, s) => a + s.amount, 0),
      minus: protectedUpgrade ? null : nextMinus(tile, now, last, mode),
      plus: protectedUpgrade ? null : nextPlus(tile, now, last, mode),
      mortgage: protectedUpgrade
        ? null
        : (() => {
            const amount = stepAmount(tile, now, 'mortgage', mode);
            return amount === null ? null : { kind: 'mortgage' as const, amount };
          })(),
      sell: protectedUpgrade
        ? null
        : (() => {
            const amount = stepAmount(tile, now, 'sell', mode);
            return amount === null ? null : { kind: 'sell' as const, amount };
          })(),
      undo: last ? { kind: 'undo', amount: -last.amount } : null,
    };
  });
  return {
    playerId,
    mode,
    ops: valid ? [...ops] : [],
    steps: run.steps,
    assets,
    cash,
    cashAfter: cash + run.steps.reduce((a, s) => a + s.amount, 0),
  };
}

/** Bỏ thao tác cuối cùng trên ô `tile`, giữ nguyên thứ tự các thao tác khác. */
function withoutLast(ops: readonly ManageOp[], tile: number): ManageOp[] {
  const i = ops.map((o) => o.tile).lastIndexOf(tile);
  return i < 0 ? [...ops] : [...ops.slice(0, i), ...ops.slice(i + 1)];
}

function press(draft: Draft, tile: number, move: DraftMove | null | undefined): ManageOp[] {
  if (!move) return draft.ops;
  return move.kind === 'undo'
    ? withoutLast(draft.ops, tile)
    : [...draft.ops, { op: move.kind, tile }];
}

/** Danh sách thao tác mới sau khi bấm − ở ô `tile` (không đổi nếu nút đang tắt). */
export const pressMinus = (draft: Draft, tile: number): ManageOp[] =>
  press(draft, tile, draft.assets.find((a) => a.tile === tile)?.minus);

/** Danh sách thao tác mới sau khi bấm + ở ô `tile` (không đổi nếu nút đang tắt). */
export const pressPlus = (draft: Draft, tile: number): ManageOp[] =>
  press(draft, tile, draft.assets.find((a) => a.tile === tile)?.plus);

/** Bản nháp Ụp/Mở xác nhận được: có thay đổi và tiền sau không âm. */
export const canConfirm = (draft: Draft): boolean => draft.ops.length > 0 && draft.cashAfter >= 0;
