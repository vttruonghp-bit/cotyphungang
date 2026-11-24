import { useEffect, useState } from 'react';
import { needsOrderRoll, type GameState, type OrderRolls, type PlayerState } from '@cotiphu/shared';
import { colorOf } from '../theme';
import { Dice } from './Dice';
import { TokenIcon } from './TokenIcon';
import './order-panel.css';

/** Xúc xắc chọn thứ tự lăn bao lâu trước khi hiện điểm. */
export const ORDER_ROLL_MS = 3000;

interface OrderPanelProps {
  game: GameState;
  /** Các lần đổ tới giờ (lúc đang chọn) hoặc của cả lượt chọn (lúc vừa chọn xong). */
  rolls: OrderRolls;
  /** Thứ tự đi khi đã chọn xong; null khi còn người phải đổ. */
  order: string[] | null;
  /** Chỗ của từng người trong ô trung tâm (giữ nguyên từ lúc đổ tới lúc hiện xếp hạng). */
  layout: readonly string[];
  /** Máy này được bấm Xúc xắc cho người này không. */
  canRoll: (playerId: string) => boolean;
  onRoll: (playerId: string) => void;
  busy: boolean;
  /** Đã chọn xong: bỏ qua bảng xếp hạng, vào ván ngay. */
  onClose?: () => void;
}

/**
 * Ô trung tâm lúc mở ván: mỗi người chơi một vùng có tên, cặp xúc xắc và nút Xúc xắc của riêng
 * người đó. Đổ cao hơn đi trước; bằng điểm thì những người bằng nhau đổ lại.
 */
export function OrderPanel({
  game,
  rolls,
  order,
  layout,
  canRoll,
  onRoll,
  busy,
  onClose,
}: OrderPanelProps) {
  const n = game.players.length;
  const ids = game.players.map((p) => p.id);
  const shown = layout.flatMap((id) => game.players.filter((p) => p.id === id));
  // Điện thoại xoay ngang: ô trung tâm nhỏ nên xúc xắc nhỏ theo (3D cần từ 28px).
  const small = typeof window !== 'undefined' && window.matchMedia?.('(max-height: 550px)').matches;
  const diceSize = small ? (n <= 2 ? 36 : 28) : n <= 2 ? 50 : n <= 4 ? 38 : 32;
  return (
    <div className={`center order-panel order-${n}`}>
      <div className="order-head">
        <strong>{order ? 'Thứ tự đi' : 'Đổ xúc xắc chọn thứ tự'}</strong>
        <span>
          {order ? 'Người đổ cao nhất đi trước' : 'Ai đổ cao hơn đi trước. Bằng điểm thì đổ lại.'}
        </span>
      </div>
      <div className="order-grid">
        {shown.map((p) => (
          <OrderZone
            key={p.id}
            game={game}
            player={p}
            rolls={rolls}
            rank={order ? order.indexOf(p.id) + 1 : null}
            waiting={!order && needsOrderRoll(rolls, p.id, ids)}
            enabled={!busy && canRoll(p.id)}
            onRoll={() => onRoll(p.id)}
            diceSize={diceSize}
          />
        ))}
      </div>
      {order && onClose && (
        <button type="button" className="btn btn-teal order-go" onClick={onClose}>
          Vào ván ›
        </button>
      )}
    </div>
  );
}

function OrderZone({
  game,
  player,
  rolls,
  rank,
  waiting,
  enabled,
  onRoll,
  diceSize,
}: {
  game: GameState;
  player: PlayerState;
  rolls: OrderRolls;
  rank: number | null;
  waiting: boolean;
  enabled: boolean;
  onRoll: () => void;
  diceSize: number;
}) {
  const mine = rolls[player.id] ?? [];
  const last = mine.at(-1) ?? null;
  // Lần đổ vừa rồi của người này: lăn xúc xắc rồi mới hiện điểm.
  const fresh = game.events.some((e) => e.type === 'orderRoll' && e.playerId === player.id);
  const [rollingCount, setRollingCount] = useState(fresh ? mine.length : null);
  useEffect(() => {
    if (fresh) setRollingCount(mine.length);
  }, [fresh, mine.length]);
  useEffect(() => {
    if (rollingCount === null) return;
    const t = setTimeout(() => setRollingCount(null), ORDER_ROLL_MS);
    return () => clearTimeout(t);
  }, [rollingCount]);
  const rolling = rollingCount !== null;
  const color = colorOf(player.color);
  const sums = mine.map(([a, b]) => a + b);
  const status = rolling
    ? 'Đang lăn…'
    : rank !== null
      ? `Đi thứ ${rank}`
      : waiting && mine.length > 0
        ? 'Bằng điểm, đổ lại'
        : waiting
          ? 'Chưa đổ'
          : 'Đã đổ, chờ người khác';
  return (
    <div
      className={`order-zone${rank === 1 && !rolling ? ' is-first' : ''}`}
      style={{ ['--zone-color' as string]: color.main, ['--zone-soft' as string]: color.soft }}
    >
      <div className="order-name">
        <TokenIcon icon={player.icon} color={player.color} size={22} />
        <strong>{player.name}</strong>
      </div>
      <div className="order-dice">
        <Dice
          key={mine.length}
          values={last ?? [1, 1]}
          color={color.main}
          size={diceSize}
          rolling={rolling}
        />
      </div>
      <div className="order-score" aria-live="polite">
        {sums.length > 0 && !rolling ? <b>{sums.join(' / ')}</b> : <b>&nbsp;</b>}
        <span>{status}</span>
      </div>
      {waiting && (
        <button
          type="button"
          className="btn btn-teal order-roll"
          disabled={!enabled || rolling}
          onClick={onRoll}
        >
          Xúc xắc
        </button>
      )}
    </div>
  );
}
