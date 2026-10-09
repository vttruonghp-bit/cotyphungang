import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { GameState } from '@cotiphu/shared';
import { money, playerById } from '../game/format';
import { useMeId } from '../online/mode';
import { colorOf } from '../theme';
import './sheet.css';

interface SheetProps {
  /** Ván đang chơi, để hiện "Lượt X · tiền" ở đầu màn. Bỏ trống ở màn tạo ván. */
  game?: GameState | null;
  /** Biểu tượng tròn bên trái tiêu đề (TokenIcon hoặc SheetGlyph). */
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  /** Các nút cuối màn (thường là `.btn-row`). */
  footer?: ReactNode;
  children: ReactNode;
  /** Nhãn cho trình đọc màn hình. */
  label?: string;
  /** Thay "Lượt X" ở đầu màn bằng người khác, ví dụ "Linh rút" khi lượt đã sang người sau. */
  who?: { playerId: string; text: string };
  compactManage?: boolean;
}

/** Màn phụ phủ toàn bộ khung điện thoại, giống các hình mẫu trong bản 3.2. */
export function Sheet({
  game,
  icon,
  title,
  subtitle,
  footer,
  children,
  label,
  who,
  compactManage,
}: SheetProps) {
  const surface = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!game || !surface.current) return;
    const pd = game.pending;
    const tileIndex = 'tile' in pd && typeof pd.tile === 'number'
      ? pd.tile
      : game.players[game.current]?.position;
    if (tileIndex === undefined) return;
    const source = document.querySelector<HTMLElement>(
      `.land .board .tile[data-tile-index="${tileIndex}"]`,
    );
    if (!source) return;
    const from = source.getBoundingClientRect();
    const to = surface.current.getBoundingClientRect();
    surface.current.style.setProperty('--sheet-origin-x', `${from.left + from.width / 2 - to.left}px`);
    surface.current.style.setProperty('--sheet-origin-y', `${from.top + from.height / 2 - to.top}px`);
  }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className={`sheet-backdrop${compactManage ? ' sheet-backdrop-manage' : ''}`}>
      <section ref={surface} className="sheet" role="dialog" aria-modal="true" aria-label={label ?? title}>
        <header className="app-header">
          <h1 className="app-title">CỜ TỶ PHÚ</h1>
          {game && game.pending.type !== 'ended' && <TurnLine game={game} who={who} />}
        </header>
        <div className="sheet-card">
          <div className="sheet-head">
            {icon && <span className="sheet-icon">{icon}</span>}
            <div>
              <h2 className="sheet-title">{title}</h2>
              {subtitle && <p className="sheet-subtitle">{subtitle}</p>}
            </div>
          </div>
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-footer">{footer}</div>}
        </div>
      </section>
    </div>
  );
}

/**
 * Đầu màn: "Lượt X · tiền của X". Online thêm tiền của chính mình: "Lượt X · Bạn 480Đ",
 * hoặc "Lượt của bạn · 480Đ".
 */
export function TurnLine({ game, who }: { game: GameState; who?: SheetProps['who'] }) {
  const meId = useMeId();
  const shown = who && playerById(game, who.playerId);
  const cur = shown ?? game.players[game.current]!;
  const text = shown ? who!.text : `Lượt ${cur.name}`;
  const me = playerById(game, meId);
  const curColor = colorOf(cur.color).main;
  if (!me || me.id === cur.id) {
    const mine = me && !shown;
    return (
      <span className="app-turn" style={{ color: curColor }}>
        {mine ? 'Lượt của bạn' : text} · {money(cur.cash)}
      </span>
    );
  }
  return (
    <span className="app-turn">
      <span style={{ color: curColor }}>{text}</span>
      <span className="app-turn-sep"> · </span>
      <span style={{ color: colorOf(me.color).main }}>Bạn {money(me.cash)}</span>
    </span>
  );
}

/** Biểu tượng tròn cho tiêu đề màn phụ khi không gắn với một người chơi. */
export function SheetGlyph({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className="sheet-glyph" style={{ color, ['--glow' as string]: color }}>
      {children}
    </span>
  );
}
