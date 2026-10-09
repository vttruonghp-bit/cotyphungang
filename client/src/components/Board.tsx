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

/** Three-second roll, one-second token anticipation, 0.4s per crossed tile. */
const ROLL_MS = 3000;
const ANTICIPATION_MS = 1000;
const STEP_MS = 400;
const LAND_MS = 1000;

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

/** Render the complete roll → pulse → walk → landing sequence locally. */
function useWalk(
  game: GameState,
  previous?: GameState | null,
  onWalkChange?: (walking: boolean, destination: number | null) => void,
): {
  playerId: string;
  at: number;
  stomp: number | null;
  anticipating: boolean;
  landing: boolean;
} | null {
  const walk = useMemo(() => (reducedMotion() ? null : walkOf(game, previous)), [game, previous]);
  // -2 rolls dice, -1 pulses starting token, 0..steps enters each tile,
  // steps waits on destination for one second.
  const [progress, setProgress] = useState({ game, step: -2 });
  const step = progress.game === game ? progress.step : -2;
  const walking = walk !== null && step < walk.steps;
  useEffect(() => {
    if (!walk) return;
    const destination = (walk.from + walk.steps) % BOARD_SIZE;
    onWalkChange?.(walking, destination);
    if (!walking) return;
    const delay =
      step === -2
        ? ROLL_MS
        : step === -1
          ? ANTICIPATION_MS
          : step === walk.steps - 1
            ? LAND_MS
            : STEP_MS;
    const timer = setTimeout(() => setProgress({ game, step: step + 1 }), delay);
    return () => clearTimeout(timer);
  }, [walking, walk, game, step, onWalkChange]);
  if (!walk || !walking) return null;
  const stepsMoved = Math.max(0, Math.min(step + 1, walk.steps));
  const at = (walk.from + stepsMoved) % BOARD_SIZE;
  return {
    playerId: walk.playerId,
    at,
    stomp: step >= 0 ? at : null,
    anticipating: step === -1,
    landing: step === walk.steps - 1,
  };
}

/** Quân trên một ô ở cạnh dưới; đông người thì xếp chồng, ô góc chia 2 hàng. */
function Tokens({
  players,
  currentId,
  walkerId,
  corner,
  anticipating,
}: {
  players: PlayerState[];
  currentId: string | undefined;
  walkerId: string | undefined;
  corner: boolean;
  anticipating: boolean;
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
                p.id === walkerId && anticipating ? 'is-anticipating' : '',
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
          walk?.landing && walk.at === tile.index ? 'tile-landing' : '',
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
            data-tile-index={tile.index}
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
                  anticipating={walk?.anticipating ?? false}
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
