import { useState } from 'react';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLOR_COUNT,
  PLAYER_ICON_COUNT,
  type NewPlayer,
} from '@cotiphu/shared';
import { IconPicker, buttonColor } from '../components/IconPicker';
import { Sheet } from '../components/Sheet';
import { TokenIcon } from '../components/TokenIcon';
import type { SetupScreenProps } from '../sheets/types';
import { DEFAULT_PLAYERS, ICON_NAMES, PLAYER_COLORS, colorOf } from '../theme';
import './setup-screen.css';

const STORAGE_KEY = 'cotiphu.setup.v1';
const NAME_MAX = 12;
const DEFAULT_COUNT = 4;

interface Draft {
  name: string;
  color: number;
  icon: number;
}

/** Luôn giữ đủ 6 người; chỉ `count` người đầu vào ván. */
interface Setup {
  count: number;
  players: Draft[];
}

const defaults = (): Draft[] => DEFAULT_PLAYERS.map((p) => ({ ...p }));

/** Số chưa ai dùng, ưu tiên `prefer`. */
function firstFree(total: number, used: readonly number[], prefer: number): number {
  if (!used.includes(prefer)) return prefer;
  for (let i = 0; i < total; i++) if (!used.includes(i)) return i;
  return prefer;
}

/** Sửa màu và kí hiệu trùng của `count` người đầu (khi thêm người hoặc nạp lại). */
function fit(players: Draft[], count: number): Draft[] {
  const out = players.map((p) => ({ ...p }));
  for (let i = 1; i < count; i++) {
    const before = out.slice(0, i);
    const p = out[i]!;
    p.color = firstFree(
      PLAYER_COLOR_COUNT,
      before.map((x) => x.color),
      p.color,
    );
    p.icon = firstFree(
      PLAYER_ICON_COUNT,
      before.map((x) => x.icon),
      p.icon,
    );
  }
  return out;
}

const COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

const isIndex = (n: unknown, total: number) =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < total;

/** Lần tạo ván trước trên máy này, để chơi lại chỉ cần một chạm. */
function loadSetup(): Setup {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Setup | null;
    const ok =
      saved &&
      COUNTS.includes(saved.count) &&
      Array.isArray(saved.players) &&
      saved.players.length === MAX_PLAYERS &&
      saved.players.every(
        (p) =>
          typeof p?.name === 'string' &&
          isIndex(p.color, PLAYER_COLOR_COUNT) &&
          isIndex(p.icon, PLAYER_ICON_COUNT),
      );
    if (ok) return { count: saved.count, players: fit(saved.players, saved.count) };
  } catch {
    // Dữ liệu cũ hỏng hoặc trình duyệt chặn lưu trữ: dùng mặc định.
  }
  return { count: DEFAULT_COUNT, players: defaults() };
}

function saveSetup(s: Setup) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Không lưu được thì lần sau dùng mặc định.
  }
}

/** Tạo ván mới (hình 5): chơi chung một máy nên không có mã phòng. */
export function SetupScreen({ onStart, onBack, onStartAi }: SetupScreenProps & { onStartAi?: (human: NewPlayer) => string | null }) {
  const [setup, setSetup] = useState(loadSetup);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { count, players } = setup;
  const shown = players.slice(0, count);

  const update = (i: number, patch: Partial<Draft>) => {
    setSetup((s) => ({
      ...s,
      players: s.players.map((p, k) => (k === i ? { ...p, ...patch } : p)),
    }));
    setError(null);
  };
  const setCount = (n: number) => {
    setSetup((s) => ({ count: n, players: fit(s.players, n) }));
    setError(null);
  };
  const isDefault = shown.every((p, i) => {
    const d = DEFAULT_PLAYERS[i]!;
    return p.name === d.name && p.color === d.color && p.icon === d.icon;
  });

  const start = () => {
    const list: NewPlayer[] = shown.map((p, i) => ({
      id: `p${i + 1}`,
      name: p.name.trim().replace(/\s+/g, ' '),
      color: p.color,
      icon: p.icon,
    }));
    const unnamed = list.findIndex((p) => !p.name);
    if (unnamed >= 0) {
      document.getElementById(`setup-name-${unnamed}`)?.focus();
      return setError(`Người chơi ${unnamed + 1} chưa có tên.`);
    }
    const err = onStart(list);
    if (err) return setError(err);
    saveSetup({ count, players: players.map((p, i) => ({ ...p, name: list[i]?.name ?? p.name })) });
  };

  const others = (i: number) => shown.filter((_, k) => k !== i);
  const edit = editing === null ? null : shown[editing];

  return (
    <main className="phone setup-screen">
      <header className="app-header">
        <span className="app-brand">
          {onBack && (
            <button type="button" className="app-home" onClick={onBack} aria-label="Về màn đầu">
              <span aria-hidden="true">‹</span>
            </button>
          )}
          <h1 className="app-title">CỜ TỶ PHÚ</h1>
        </span>
        <span className="app-turn muted">Chơi chung một máy</span>
      </header>

      <section className="setup-card">
        <div className="setup-body">
          <div className="setup-head">
            <TokenIcon icon={18} color={0} size={44} title="Ván mới" />
            <div>
              <h2 className="setup-title">Tạo ván mới</h2>
              <p className="setup-subtitle">Thiết lập xong rồi bắt đầu ngay</p>
            </div>
          </div>

          <p className="eyebrow setup-label" id="setup-count-label">
            Chọn số người
          </p>
          <div className="setup-count" role="radiogroup" aria-labelledby="setup-count-label">
            {COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={n === count}
                className={`setup-count-btn${n === count ? ' is-on' : ''}`}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="setup-players-head">
            <span className="eyebrow">{count} người chơi</span>
            <span className="muted">Tên · 1 trong 8 màu · 1 kí hiệu</span>
          </div>
          <div className="setup-players">
            {shown.map((p, i) => (
              <PlayerCard
                key={i}
                index={i}
                draft={p}
                takenColors={others(i).map((x) => x.color)}
                onName={(name) => update(i, { name })}
                onEdit={() => setEditing(i)}
              />
            ))}
          </div>

          <div className="box box-teal setup-note">
            <b>Tất cả màu và kí hiệu phải khác nhau trong cùng một ván.</b>
            <span>Chơi chung một điện thoại: tới lượt ai thì chuyển máy cho người đó.</span>
          </div>
        </div>

        <div className="setup-footer">
          {error && (
            <p className="box box-red setup-error" role="alert">
              {error}
            </p>
          )}
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-outline"
              disabled={isDefault}
              onClick={() => {
                setSetup({ count, players: defaults() });
                setError(null);
              }}
            >
              Đặt lại
            </button>
            <button type="button" className="btn btn-grow btn-teal" onClick={start}>
              Bắt đầu ván {count} người
            </button>
            {onStartAi && (
              <button
                type="button"
                className="btn btn-grow"
                onClick={() => {
                  const human = shown[0]!;
                  const name = human.name.trim().replace(/\\s+/g, ' ');
                  if (!name) return setError('Nhập tên người chơi trước khi đấu AI.');
                  const err = onStartAi({ id: 'p1', name, color: human.color, icon: human.icon });
                  if (err) setError(err);
                }}
              >
                🎲 Đấu với ChatGPT AI (1–1)
              </button>
            )
          </div>
        </div>
      </section>

      {edit && editing !== null && (
        <Sheet
          icon={<TokenIcon icon={edit.icon} color={edit.color} size={44} />}
          title={`Quân của ${edit.name.trim() || `người chơi ${editing + 1}`}`}
          subtitle="Màu và kí hiệu chưa ai dùng"
          footer={
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                style={{ background: buttonColor(edit.color) }}
                onClick={() => setEditing(null)}
              >
                Xong
              </button>
            </div>
          }
        >
          <IconPicker
            color={edit.color}
            icon={edit.icon}
            takenColors={others(editing).map((x) => x.color)}
            takenIcons={others(editing).map((x) => x.icon)}
            onChange={(next) => update(editing, next)}
          />
        </Sheet>
      )}
    </main>
  );
}

interface PlayerCardProps {
  index: number;
  draft: Draft;
  takenColors: number[];
  onName: (name: string) => void;
  onEdit: () => void;
}

/** Thẻ một người chơi: tên, quân, dải 8 màu và nút đổi kí hiệu. */
function PlayerCard({ index, draft, takenColors, onName, onEdit }: PlayerCardProps) {
  const c = colorOf(draft.color);
  const id = `setup-name-${index}`;
  const who = draft.name.trim() || `người chơi ${index + 1}`;
  return (
    <div
      className="setup-player"
      style={{ ['--pc' as string]: c.main, ['--pc-soft' as string]: c.soft }}
    >
      <label className="setup-player-label" htmlFor={id}>
        Người chơi {index + 1}
      </label>
      <div className="setup-player-row">
        <input
          id={id}
          className="setup-name"
          value={draft.name}
          maxLength={NAME_MAX}
          placeholder="Tên"
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          aria-invalid={!draft.name.trim()}
          onChange={(e) => onName(e.target.value)}
        />
        <button
          type="button"
          className="setup-token"
          aria-label={`Đổi quân của ${who}`}
          onClick={onEdit}
        >
          <TokenIcon icon={draft.icon} color={draft.color} size={38} />
        </button>
      </div>
      <button
        type="button"
        className="setup-look"
        aria-label={`${c.name}, ${ICON_NAMES[draft.icon]}: đổi màu và kí hiệu của ${who}`}
        onClick={onEdit}
      >
        <span className="setup-dots" aria-hidden="true">
          {PLAYER_COLORS.map((pc, k) => (
            <span
              key={pc.name}
              className={k === draft.color ? 'is-on' : takenColors.includes(k) ? 'is-taken' : ''}
              style={{ background: pc.main }}
            />
          ))}
        </span>
        <span className="setup-look-row" aria-hidden="true">
          <b className="setup-look-name">{ICON_NAMES[draft.icon]}</b>
          <span className="setup-change">Đổi</span>
        </span>
      </button>
    </div>
  );
}
