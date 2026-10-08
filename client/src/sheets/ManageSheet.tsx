import { useMemo, useRef, useState } from 'react';
import {
  BOARD,
  BOARD_SIZE,
  CHANCE_CARDS,
  JAIL_INDEX,
  type GameState,
  type ManageOp,
  type Pending,
} from '@cotiphu/shared';
import { Sheet } from '../components/Sheet';
import { arrivalAt, tileNumber } from '../components/TileGrid';
import { TokenIcon } from '../components/TokenIcon';
import {
  buildDraft,
  canConfirm,
  pressMinus,
  pressPlus,
  type AssetDraft,
  type AssetState,
  type Draft,
  type DraftMove,
} from '../game/draft';
import {
  SHORT_NAMES,
  levelText,
  money,
  playerById,
  rentText,
  signed,
  tileName,
} from '../game/format';
import { useMeId } from '../online/mode';
import { colorOf } from '../theme';
import type { SheetProps } from './types';
import './manage-sheet.css';

export type ManageMode = 'manage' | 'debt' | 'view';

type PayPending = Extract<Pending, { type: 'pay' }>;

interface ManageSheetProps extends SheetProps {
  mode: ManageMode;
  playerId: string;
  /** Xử lý nợ không đóng được; nút này tạm ẩn màn để xem bàn cờ. */
  onShowBoard?: () => void;
}

/** Tên ngắn cho thẻ tài sản: đất màu dùng tên ngắn của bàn cờ, ga và nhà máy giữ tên đủ. */
const assetName = (tile: number): string =>
  BOARD[tile]!.kind === 'property' ? SHORT_NAMES[tile]! : BOARD[tile]!.name;

function stateText(tile: number, st: AssetState): string {
  if (!st.owned) return 'Đã bán';
  if (st.mortgaged) return 'Đang cắm';
  return BOARD[tile]!.kind === 'property' ? levelText(st.level) : 'Hoạt động';
}

const MOVE_VERB: Record<DraftMove['kind'], string> = {
  downgrade: 'Hạ',
  mortgage: 'Cắm',
  sell: 'Bán',
  redeem: 'Chuộc',
  undo: 'Hoàn',
};

const MOVE_HELP: Record<DraftMove['kind'], string> = {
  downgrade: 'Hạ 1 cấp',
  mortgage: 'Cắm',
  sell: 'Bán cho Ngân hàng',
  redeem: 'Chuộc',
  undo: 'Hoàn lại bước vừa làm ở',
};

/** Tiền sau dự thảo có thể âm: dùng dấu trừ thật như phần còn lại của giao diện. */
const cashText = (n: number): string => (n < 0 ? signed(n) : money(n));

/** Thẻ Người thủ đô: quyền miễn thuế mất khi không còn sở hữu ô này (Phố Cổ). */
const CAPITAL = (() => {
  const c = CHANCE_CARDS.find((x) => x.effect.type === 'capitalCitizen');
  if (c?.effect.type !== 'capitalCitizen') throw new Error('Thiếu thẻ Người thủ đô');
  return { title: c.title, tile: c.effect.requiredTile };
})();

/** Tên người nhận khoản nợ ("Ngân hàng" hoặc tên người chơi). */
const creditorText = (game: GameState, pd: PayPending): string =>
  pd.creditors
    .map((c) => (c.playerId === null ? 'Ngân hàng' : (playerById(game, c.playerId)?.name ?? '')))
    .join(', ');

/** Ụp/Mở (mode manage), Xử lý nợ (mode debt) hoặc chỉ xem tài sản (mode view). Hình 2, bên phải. */
export function ManageSheet({
  game,
  dispatch,
  onClose,
  mode,
  playerId,
  onShowBoard,
}: ManageSheetProps) {
  const p = playerById(game, playerId)!;
  const [ops, setOps] = useState<ManageOp[]>([]);
  // Đang chờ thao tác trước xong (online phải đợi máy chủ): chặn bấm lần hai.
  const busy = useRef(false);
  const draft = useMemo(
    () =>
      buildDraft(game, playerId, mode === 'view' ? [] : ops, mode === 'debt' ? 'debt' : 'manage'),
    [game, playerId, ops, mode],
  );
  const pd = game.pending;
  const debt = mode === 'debt' && pd.type === 'pay' && pd.playerId === playerId ? pd : null;

  const once = (run: () => Promise<void>) => async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await run();
    } finally {
      busy.current = false;
    }
  };

  const confirm = once(async () => {
    if ((await dispatch({ type: 'manage', playerId, ops: draft.ops })) === null) onClose();
  });

  // Thanh lý theo dự thảo rồi trả luôn: lệnh trả chỉ gửi khi thanh lý đã xong.
  const cancelPurchase = once(async () => {
    setOps([]);
    if ((await dispatch({ type: 'cancelPurchase', playerId })) === null) onClose();
  });

  const cancelUpgrade = once(async () => {
    setOps([]);
    if ((await dispatch({ type: 'cancelUpgrade', playerId })) === null) onClose();
  });

  const settle = once(async () => {
    if (draft.ops.length > 0) {
      if ((await dispatch({ type: 'manage', playerId, ops: draft.ops })) !== null) return;
      setOps([]);
    }
    if ((await dispatch({ type: 'pay', playerId })) === null) onClose();
  });

  const offTurn = game.players[game.current]?.id !== playerId;
  const online = useMeId() !== null;
  // Bán Phố Cổ trong dự thảo thì quyền Người thủ đô đang giữ hết hiệu lực.
  const losesCapital =
    p.heldCards.some((h) => h.kind === 'taxWaiver') &&
    draft.assets.some((a) => a.tile === CAPITAL.tile && a.start.owned && !a.now.owned);
  const warning = losesCapital
    ? `Bán ${assetName(CAPITAL.tile)} sẽ mất quyền ${CAPITAL.title} đang giữ.`
    : null;
  const title = mode === 'debt' ? 'Xử lý nợ' : mode === 'manage' ? 'Ụp / Mở' : 'Tài sản';
  const subtitle =
    mode === 'debt'
      ? offTurn
        ? `${p.name} thiếu tiền ngoài lượt`
        : `${p.name} thiếu tiền · bấm − để thanh lý`
      : mode === 'manage'
        ? `${p.name} · bấm − / + để tạo dự thảo`
        : `${p.name} · chỉ xem, Ụp/Mở ở đầu lượt`;

  return (
    <Sheet
      game={game}
      icon={<TokenIcon icon={p.icon} color={p.color} size={44} blink />}
      title={title}
      subtitle={subtitle}
      label={`${title} của ${p.name}`}
      footer={
        <Footer
          mode={mode}
          draft={draft}
          debt={debt}
          warning={warning}
          onClose={onClose}
          onShowBoard={onShowBoard}
          onConfirm={confirm}
          onSettle={settle}
          onCancelUpgrade={debt?.reason === 'upgrade' ? cancelUpgrade : undefined}
          onCancelPurchase={
            debt?.reason === 'purchase' && !debt.label?.includes('(thẻ)')
              ? cancelPurchase
              : undefined
          }
        />
      }
    >
      <div className="manage-body compact-manage-body">
        {/* Nợ ngoài lượt khi chơi chung một máy: người giữ máy phải đưa máy cho người nợ. */}
        {debt && offTurn && !online && (
          <p
            className="handoff"
            style={{ background: colorOf(p.color).soft, color: colorOf(p.color).main }}
          >
            Chuyển máy cho <b>{p.name}</b>: {p.name} thiếu tiền trả {money(debt.total)} cho{' '}
            {creditorText(game, debt)}
          </p>
        )}
        {debt ? (
          <DebtBox game={game} debt={debt} draft={draft} />
        ) : (
          <CashBox draft={draft} view={mode === 'view'} />
        )}

        {draft.assets.length === 0 ? (
          <p className="manage-empty muted">{p.name} chưa có tài sản nào.</p>
        ) : (
          <ul className="manage-assets" aria-label="Tài sản">
            {draft.assets.map((a) => (
              <AssetCard
                key={a.tile}
                game={game}
                asset={a}
                view={mode === 'view'}
                onMinus={() => setOps(pressMinus(draft, a.tile))}
                onPlus={() => setOps(pressPlus(draft, a.tile))}
                onAction={(kind) => setOps((current) => [...current, { op: kind, tile: a.tile }])}
                onUndo={() => setOps((current) => { const i = current.map((op) => op.tile).lastIndexOf(a.tile); return i < 0 ? current : current.filter((_, j) => i !== j); })}
              />
            ))}
          </ul>
        )}

        {mode !== 'view' && <DraftSummary draft={draft} debt={debt} onReset={() => setOps([])} />}
      </div>
    </Sheet>
  );
}

function CashBox({ draft, view }: { draft: Draft; view: boolean }) {
  const delta = draft.cashAfter - draft.cash;
  return (
    <div className="manage-cash box box-teal">
      <div>
        <span className="eyebrow">Tiền hiện có</span>
        <b className="money-big">{money(draft.cash)}</b>
      </div>
      {!view && (
        <div className="right">
          <span className="eyebrow">Sau dự thảo</span>
          <b
            className={`money-big ${draft.cashAfter < 0 || delta < 0 ? 'down' : delta > 0 ? 'up' : ''}`}
          >
            {cashText(draft.cashAfter)}
          </b>
        </div>
      )}
      {view && (
        <div className="right">
          <span className="eyebrow">Tài sản</span>
          <b className="money-big">{draft.assets.length}</b>
        </div>
      )}
    </div>
  );
}

function DebtBox({ game, debt, draft }: { game: GameState; debt: PayPending; draft: Draft }) {
  const missing = debt.total - draft.cashAfter;
  const to = creditorText(game, debt);
  return (
    <div className="manage-debt box box-red">
      <span className="eyebrow">Khoản bắt buộc phải trả</span>
      <div className="manage-debt-main">
        <b className="manage-debt-total">{money(debt.total)}</b>
        <span className="manage-debt-label">
          {debt.label ?? 'Khoản phải trả'}
          {to && ` · cho ${to}`}
        </span>
      </div>
      <dl className="manage-debt-side">
        <div>
          <dt>Hiện có</dt>
          <dd>{money(draft.cash)}</dd>
        </div>
        <div>
          <dt>Sau dự thảo</dt>
          <dd className={draft.cashAfter > draft.cash ? 'up' : undefined}>
            {money(draft.cashAfter)}
          </dd>
        </div>
        <div>
          {missing > 0 ? (
            <>
              <dt>Còn thiếu</dt>
              <dd className="down">{money(missing)}</dd>
            </>
          ) : (
            <>
              <dt>Còn lại sau trả</dt>
              <dd className="up">{money(-missing)}</dd>
            </>
          )}
        </div>
      </dl>
      {debt.reason === 'jailBail' && (
        <JailBailNote game={game} playerId={debt.playerId} cash={draft.cashAfter - debt.total} />
      )}
    </div>
  );
}

/** Bảo lãnh sau lần thử đôi cuối: xúc xắc vừa gieo và ô sẽ tới khi trả xong (luật mục 6). */
function JailBailNote({
  game,
  playerId,
  cash,
}: {
  game: GameState;
  playerId: string;
  cash: number;
}) {
  const p = playerById(game, playerId)!;
  const move = game.queue.find((x) => x.type === 'moveAfterJail' && x.playerId === playerId);
  if (move?.type !== 'moveAfterJail') return null;
  const roll = [...game.events]
    .reverse()
    .find((e) => e.type === 'roll' && e.jail && e.playerId === playerId);
  const to = (JAIL_INDEX + move.steps) % BOARD_SIZE;
  const arrival = arrivalAt(game, p, to, Math.max(0, cash));
  return (
    <p className="manage-jail">
      <span>
        {roll?.type === 'roll'
          ? `Lần thử cuối không ra đôi (${roll.dice[0]} + ${roll.dice[1]}). `
          : 'Lần thử cuối không ra đôi. '}
        Trả xong sẽ đi {move.steps} ô tới{' '}
        <b>
          {tileNumber(to)} {tileName(to)}
        </b>
        .
      </span>
      <span className={arrival.tone ? 'down' : undefined}>{arrival.text}</span>
    </p>
  );
}

interface AssetCardProps {
  game: GameState;
  asset: AssetDraft;
  view: boolean;
  onMinus: () => void;
  onPlus: () => void;
  onAction: (kind: 'sell' | 'mortgage') => void;
  onUndo: () => void;
}

/** One horizontal line per owned property, with five separate explicit actions. */
function AssetCard({ game, asset: a, view, onMinus, onPlus, onAction, onUndo }: AssetCardProps) {
  const name = assetName(a.tile);
  const kind = BOARD[a.tile]!.kind;
  const changed = a.steps.length > 0;
  const cls = [
    'manage-asset',
    `kind-${kind}`,
    changed && 'is-changed',
    a.now.mortgaged && 'is-mortgaged',
    !a.now.owned && 'is-sold',
  ].filter(Boolean).join(' ');
  const can = (move: DraftMove | null) => !view && move !== null;
  const change = a.steps.reduce((sum, step) => sum + step.amount, 0);
  const state = kind === 'property' ? ` (${a.now.level})` : '';
  return (
    <li className={cls}>
      <span className="manage-asset-name" title={name}>
        {name}{state}
      </span>
      <span className={`manage-asset-delta ${change > 0 ? 'up' : change < 0 ? 'down' : ''}`}>
        {changed ? signed(change) : '—'}
      </span>
      {view ? <span className="manage-asset-view">{a.now.mortgaged ? 'Đang cắm' : rentText(game, a.tile)}</span> : (
        <span className="manage-asset-actions">
          <button type="button" className="manage-mini-action" disabled={!can(a.minus)} onClick={onMinus} title={`Hạ nhà ${name}`}>−</button>
          <button type="button" className="manage-mini-action" disabled={!can(a.plus)} onClick={onPlus} title={`Chuộc ${name}`}>+</button>
          <button type="button" className="manage-mini-action" disabled={!can(a.undo)} onClick={onUndo} title={`Hoàn tác ${name}`}>↶</button>
          <button type="button" className="manage-mini-action manage-mini-sell" disabled={!can(a.sell)} onClick={() => onAction('sell')}>Bán</button>
          <button type="button" className="manage-mini-action manage-mini-mortgage" disabled={!can(a.mortgage)} onClick={() => onAction('mortgage')}>Cắm</button>
        </span>
      )}
    </li>
  );
}

interface DraftSummaryProps {
  draft: Draft;
  debt: PayPending | null;
  onReset: () => void;
}

/** Dự thảo đang áp dụng: mỗi tài sản đã đổi một dòng, rồi tiền trước → sau. */
function DraftSummary({ draft, debt, onReset }: DraftSummaryProps) {
  const changed = draft.assets.filter((a) => a.steps.length > 0);
  // Giữ thứ tự bấm: tài sản nào bấm trước thì đứng trước.
  const order = (a: AssetDraft) => draft.steps.indexOf(a.steps[0]!);
  changed.sort((x, y) => order(x) - order(y));

  return (
    <section className="manage-summary" aria-live="polite">
      <div className="manage-summary-head">
        <span className="eyebrow">{debt ? 'Dự thảo thanh lý' : 'Dự thảo đang áp dụng'}</span>
        {changed.length > 0 && (
          <button type="button" className="manage-reset" onClick={onReset}>
            Làm lại
          </button>
        )}
      </div>
      {changed.length === 0 ? (
        <p className="manage-summary-empty muted">
          {debt
            ? `Chưa có thay đổi. Bấm − đến khi đủ ${money(debt.total)}.`
            : 'Chưa có thay đổi. Bấm − để hạ cấp, cắm hoặc bán; + để hoàn lại hoặc chuộc.'}
        </p>
      ) : (
        <ol className="manage-summary-list">
          {changed.map((a) => (
            <li key={a.tile}>
              <span>
                <b>{assetName(a.tile)}</b> {stateText(a.tile, a.start)} → {stateText(a.tile, a.now)}
              </span>
              <b className={a.amount >= 0 ? 'up' : 'down'}>{signed(a.amount)}</b>
            </li>
          ))}
        </ol>
      )}
      <p className="manage-summary-note muted">
        {debt
          ? `Chỉ trả được khi đủ toàn bộ ${money(debt.total)}.`
          : 'Tiền và quyền sở hữu chỉ đổi khi xác nhận.'}
      </p>
    </section>
  );
}

interface FooterProps {
  mode: ManageMode;
  draft: Draft;
  debt: PayPending | null;
  /** Hệ quả cần biết trước khi xác nhận (mất quyền Người thủ đô). */
  warning: string | null;
  onClose: () => void;
  onShowBoard?: () => void;
  onConfirm: () => void;
  onSettle: () => void;
  onCancelPurchase?: () => void;
  onCancelUpgrade?: () => void;
}

/** Dòng tiền luôn hiện ở chân màn, kể cả khi danh sách tài sản đã cuộn qua hộp tiền ở trên. */
function FooterCash({ draft, debt }: { draft: Draft; debt: PayPending | null }) {
  const delta = draft.cashAfter - draft.cash;
  const missing = debt ? debt.total - draft.cashAfter : -draft.cashAfter;
  return (
    <p className="manage-footer-cash" aria-live="polite">
      <span>
        <span className="muted">Tiền</span> {money(draft.cash)} →{' '}
        <b className={draft.cashAfter < 0 || delta < 0 ? 'down' : delta > 0 ? 'up' : undefined}>
          {cashText(draft.cashAfter)}
        </b>
      </span>
      {missing > 0 ? (
        <b className="down">Còn thiếu {money(missing)}</b>
      ) : debt ? (
        <b className="up">Còn lại sau trả {money(-missing)}</b>
      ) : null}
    </p>
  );
}

function Footer({
  mode,
  draft,
  debt,
  warning,
  onClose,
  onShowBoard,
  onConfirm,
  onSettle,
  onCancelPurchase,
  onCancelUpgrade,
}: FooterProps) {
  if (mode === 'view') {
    return (
      <button type="button" className="btn btn-outline manage-close-only" onClick={onClose}>
        Đóng
      </button>
    );
  }
  if (mode === 'debt') {
    const ready = debt !== null && draft.cashAfter >= debt.total;
    return (
      <>
        <FooterCash draft={draft} debt={debt} />
        {warning && <p className="manage-warn">{warning}</p>}
        <div className="btn-row">
          {onCancelUpgrade && (
            <button type="button" className="btn btn-outline" onClick={onCancelUpgrade}>
              Hoàn tác nâng
            </button>
          )}
          {onCancelPurchase && (
            <button type="button" className="btn btn-outline" onClick={onCancelPurchase}>
              Hoàn tác mua
            </button>
          )}
          {onShowBoard && (
            <button type="button" className="btn btn-outline manage-peek" onClick={onShowBoard}>
              Xem bàn cờ
            </button>
          )}
          <button
            type="button"
            className="btn btn-grow btn-red"
            disabled={!ready}
            onClick={onSettle}
          >
            {draft.ops.length === 0 && ready ? 'Trả' : 'Thanh lý & trả'}{' '}
            {debt ? money(debt.total) : ''}
          </button>
        </div>
      </>
    );
  }
  const delta = draft.cashAfter - draft.cash;
  return (
    <>
      <FooterCash draft={draft} debt={null} />
      {warning && <p className="manage-warn">{warning}</p>}
      <div className="btn-row">
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Đóng
        </button>
        <button
          type="button"
          className="btn btn-grow btn-teal"
          disabled={!canConfirm(draft)}
          onClick={onConfirm}
        >
          Xác nhận{draft.ops.length > 0 ? ` · ${signed(delta)}` : ''}
        </button>
      </div>
    </>
  );
}
