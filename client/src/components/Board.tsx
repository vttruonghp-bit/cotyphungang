import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BOARD,
  BOARD_SIZE,
  HOTEL_LEVEL,
  gridPosition,
  type GameState,
  type PlayerState,
  type Tile,
} from '@cotiphu/shared';
import { SHORT_NAMES, playerById } from '../game/format';
import { colorOf } from '../theme';
import { TokenIcon } from './TokenIcon';
import './board.css';

interface BoardProps {
  game: GameState;
  previous?: GameState | null;
  /** Ô đang được làm nổi (thường là ô người tới lượt đang đứng). */
  focus?: number | null;
  onTileClick?: (index: number) => void;
  /** Nội dung ô trung tâm 9×9. */
  children?: ReactNode;
  /** Báo cho màn chính biết quân đang chạy để khóa thao tác. */
  onWalkChange?: (walking: boolean, destination: number | null) => void;
}

/** Nhịp đi thích ứng: hành trình ngắn nhanh, hành trình dài tối đa khoảng 4 giây. */
const walkDuration = (steps: number) => {
  if (steps <= 1) return 520;
  if (steps <= 3) return 700 + (steps - 1) * 180;
  if (steps <= 6) return 1200 + (steps - 4) * 190;
  if (steps <= 9) return 1800 + (steps - 7) * 180;
  return Math.min(2800, 2300 + (steps - 10) * 120);
};

/** Ba ô cuối chiếm nhiều thời gian hơn để tạo cảm giác giảm tốc. */
function stepDelays(steps: number): number[] {
  if (steps <= 0) return [];
  const total = walkDuration(steps);
  const weights = Array.from({ length: steps }, (_, i) => {
    const left = steps - i;
    if (left === 1) return 1.7;
    if (left === 2) return 1.45;
    if (left === 3) return 1.2;
    return 0.88 + i * 0.02;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.round((total * w) / sum));
}

function cornerSide(tile: Tile): string {
  const { row, col } = gridPosition(tile.index);
  if (row === 10) return 'bottom';
  if (row === 0) return 'top';
  if (col === 0) return 'left';
  return 'right';
}

/** Dải trên ô đất: 5 đoạn (4 nhà + khách sạn), tô đậm theo màu chủ đến cấp hiện tại. */
function LevelStrip({ level, color }: { level: number; color: string | null }) {
  return (
    <span className="strip" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((k) => (
        <span
          key={k}
          className="strip-seg"
          style={
            color
              ? { background: color, opacity: level >= k ? 1 : 0.28 }
              : { background: '#d9dee7' }
          }
        />
      ))}
    </span>
  );
}

interface Walk {
  playerId: string;
  from: number;
  steps: number;
}

/** Lần đi theo 2 xúc xắc trong thao tác vừa rồi; đi bằng thẻ, Metro, vào tù thì nhảy thẳng. */
function walkOf(game: GameState, previous?: GameState | null): Walk | null {
  // Only animate the move made by this action, never a historical dice roll.
  if (!previous || game.events.length <= previous.events.length) return null;
  const ev = game.events.slice(previous.events.length);
  for (let i = 0; i + 1 < ev.length; i++) {
    const r = ev[i]!;
    const m = ev[i + 1]!;
    if (r.type !== 'roll' || m.type !== 'move' || m.playerId !== r.playerId) continue;
    const steps = (m.to - m.from + BOARD_SIZE) % BOARD_SIZE;
    if (steps > 0 && steps === r.dice[0] + r.dice[1]) {
      return { playerId: m.playerId, from: m.from, steps };
    }
  }
  return null;
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Quân vừa đổ xúc xắc đi từng ô tới chỗ mới; trả về ô đang vẽ của quân đó trong lúc đi. */
function useWalk(
  game: GameState,
  previous?: GameState | null,
  onWalkChange?: (walking: boolean, destination: number | null) => void,
): { playerId: string; at: number; stomp: number } | null {
  const walk = useMemo(() => (reducedMotion() ? null : walkOf(game, previous)), [game, previous]);
  const [progress, setProgress] = useState({ game, step: 0 });
  const step = progress.game === game ? progress.step : 0;
  const walking = walk !== null && step < walk.steps;
  const delays = useMemo(() => (walk ? stepDelays(walk.steps) : []), [walk]);
  useEffect(() => {
    if (!walk) return;
    onWalkChange?.(walking, (walk.from + walk.steps) % BOARD_SIZE);
    if (!walking) return;
    const t = setTimeout(() => setProgress({ game, step: step + 1 }), delays[step] ?? 120);
    return () => clearTimeout(t);
  }, [walking, walk, game, step, delays, onWalkChange]);
  if (!walk || !walking) return null;
  const at = (walk.from + step) % BOARD_SIZE;
  return { playerId: walk.playerId, at, stomp: at };
}

/** Quân trên một ô ở cạnh dưới; đông người thì xếp chồng, ô góc chia 2 hàng. */
function Tokens({
  players,
  currentId,
  walkerId,
  corner,
}: {
  players: PlayerState[];
  currentId: string | undefined;
  walkerId: string | undefined;
  corner: boolean;
}) {
  const split = corner && players.length > 3 ? Math.ceil(players.length / 2) : players.length;
  const rows = [players.slice(0, split), players.slice(split)].filter((r) => r.length > 0);
  return (
    <span className="tokens">
      {rows.map((row, k) => (
        <span className="tokens-row" key={k}>
          {row.map((p) => (
            <span
              key={p.id}
              className={[
                'token-slot',
                p.id === currentId ? 'is-current' : '',
                p.id === walkerId ? 'is-walking' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <TokenIcon
                icon={p.icon}
                color={p.color}
                size="var(--tk)"
                blink={p.id === currentId}
                title={p.name}
              />
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

export function Board({ game, previous, focus, onTileClick, children, onWalkChange }: BoardProps) {
  const walk = useWalk(game, previous, onWalkChange);
  const currentId = game.players[game.current]?.id;
  const positionOf = (p: PlayerState) => (walk?.playerId === p.id ? walk.at : p.position);
  return (
    <div className="board" role="group" aria-label="Bàn cờ">
      {BOARD.map((tile) => {
        const { row, col } = gridPosition(tile.index);
        const st = game.tiles[tile.index];
        const owner = playerById(game, st?.owner);
        const ownerColor = owner ? colorOf(owner.color) : null;
        const here = game.players.filter(
          (p) => p.status === 'active' && positionOf(p) === tile.index,
        );
        const corner = tile.index % 10 === 0;
        const hotel = tile.kind === 'property' && st?.level === HOTEL_LEVEL;
        const name = SHORT_NAMES[tile.index]!;
        // Từ dài (Landmark) thu nhỏ chữ một chút để không bị ngắt giữa từ.
        const tight = name.split(' ').some((w) => w.length >= 8);
        const classes = [
          'tile',
          `tile-${tile.kind}`,
          corner ? 'tile-corner' : '',
          hotel ? 'tile-hotel' : '',
          st?.mortgaged ? 'tile-mortgaged' : '',
          focus === tile.index ? 'tile-focus' : '',
          walk?.stomp === tile.index ? 'tile-stomp' : '',
          `side-${cornerSide(tile)}`,
        ]
          .filter(Boolean)
          .join(' ');
        const style: Record<string, string | number> = { gridRow: row + 1, gridColumn: col + 1 };
        if (ownerColor) {
          style['--owner'] = ownerColor.main;
          style['--owner-soft'] = ownerColor.soft;
        }
        const label = [
          tile.name,
          owner ? `chủ ${owner.name}` : null,
          st?.mortgaged ? 'đang cắm' : null,
          here.length > 0 ? `có ${here.map((p) => p.name).join(', ')}` : null,
        ]
          .filter(Boolean)
          .join(', ');
        return (
          <button
            type="button"
            key={tile.index}
            className={classes}
            style={style}
            onClick={onTileClick ? () => onTileClick(tile.index) : undefined}
            aria-label={label}
          >
            {tile.kind === 'property' && (
              <LevelStrip level={st?.level ?? 0} color={ownerColor?.main ?? null} />
            )}
            {(tile.kind === 'station' || tile.kind === 'utility') && (
              <span
                className="strip strip-solid"
                aria-hidden="true"
                style={{ background: ownerColor?.main ?? 'transparent' }}
              />
            )}
            <span className="tile-up">
              {tile.kind === 'property' && st && st.level > 0 && (
                <img
                  className="tile-house"
                  src={hotel ? '/assets/khach-san.png' : `/assets/nha-${st.level}.png`}
                  alt=""
                />
              )}
              <span className={tight ? 'tile-name tile-name-tight' : 'tile-name'}>{name}</span>
              {here.length > 0 && (
                <Tokens
                  players={here}
                  currentId={currentId}
                  walkerId={walk?.playerId}
                  corner={corner}
                />
              )}
            </span>
          </button>
        );
      })}
      {children && <div className="board-center">{children}</div>}
    </div>
  );
}
