import { useEffect, useState } from 'react';
import {
  MAX_BOTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type Profile,
  type RoomView,
  type Seat,
  type SeatRole,
} from '@cotiphu/shared';
import type { Appearance } from '../components/IconPicker';
import { TokenIcon } from '../components/TokenIcon';
import { ProfileEditor } from '../online/ProfileEditor';
import { canShare, copyRoomLink, shareRoom } from '../online/share';
import { cleanName, inviteLink, loadProfile, saveProfile } from '../online/storage';
import { ICON_NAMES, colorOf } from '../theme';
import './setup-screen.css';
import './lobby-screen.css';

interface LobbyScreenProps {
  room: RoomView;
  meId: string;
  onProfile: (profile: Profile) => Promise<string | null>;
  onRole: (role: SeatRole) => Promise<string | null>;
  onAddBot: () => Promise<string | null>;
  onRemoveBot: (id: string) => Promise<string | null>;
  onStart: () => Promise<string | null>;
  onLeave: () => Promise<string | null>;
}

/**
 * Phòng chờ online: mã phòng, người chơi (kể cả bot), khách quan sát, hồ sơ của mình.
 * Ai vào cũng là người chơi (tối đa 6), tự chuyển sang xem được; chủ phòng thêm bot rồi bắt đầu.
 */
export function LobbyScreen({
  room,
  meId,
  onProfile,
  onRole,
  onAddBot,
  onRemoveBot,
  onStart,
  onLeave,
}: LobbyScreenProps) {
  const { code, seats } = room;
  const me = seats.find((s) => s.id === meId);
  const players = seats.filter((s) => s.role === 'player');
  const watchers = seats.filter((s) => s.role === 'spectator');
  const others = seats.filter((s) => s.id !== meId);
  const isHost = me?.isHost ?? false;
  const amPlayer = me?.role === 'player';
  const bots = players.filter((s) => s.bot);
  const full = players.length >= MAX_PLAYERS;
  const ready = players.length >= MIN_PLAYERS;

  // Tên đang gõ (chưa gửi); null thì hiện tên trên máy chủ.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  // Màu, kí hiệu vừa chọn, hiện ngay trong lúc chờ máy chủ.
  const [look, setLook] = useState<Appearance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Màu hoặc kí hiệu đã chọn ở màn đầu bị người khác dùng trước: máy chủ đổi sang cái còn trống.
  const [swapped, setSwapped] = useState(() => {
    const want = loadProfile();
    return me !== undefined && (want.color !== me.color || want.icon !== me.icon);
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!confirmLeave) return;
    const t = setTimeout(() => setConfirmLeave(false), 4000);
    return () => clearTimeout(t);
  }, [confirmLeave]);

  if (!me) return null;
  const value: Profile = {
    name: nameDraft ?? me.name,
    color: look?.color ?? me.color,
    icon: look?.icon ?? me.icon,
  };

  const sendProfile = async (p: Profile) => {
    setError(null);
    const err = await onProfile(p);
    if (err) setError(err);
    else saveProfile(p);
    return err;
  };

  const change = (next: Profile) => {
    setSwapped(false);
    if (next.name !== value.name) {
      setNameDraft(next.name);
      return;
    }
    if (next.color === me.color && next.icon === me.icon) return;
    setLook({ color: next.color, icon: next.icon });
    void sendProfile({ ...next, name: me.name }).then(() => setLook(null));
  };

  const nameDone = async () => {
    if (nameDraft === null) return;
    const name = cleanName(nameDraft);
    if (!name) {
      setNameDraft(null);
      setError('Tên không được để trống.');
      return;
    }
    if (name !== me.name) await sendProfile({ name, color: me.color, icon: me.icon });
    setNameDraft(null);
  };

  const run = async (task: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const err = await task();
    setBusy(false);
    if (err) setError(err);
  };

  const leave = () => {
    // Chủ phòng rời phòng chờ thì phòng đóng: hỏi lại một lần khi đã có người khác.
    if (isHost && others.length > 0 && !confirmLeave) {
      setConfirmLeave(true);
      return;
    }
    void run(onLeave);
  };

  const share = async () => {
    const r = await shareRoom(code);
    if (r === 'copied') setToast('Đã chép link mời');
    else if (r === 'failed') setToast('Không chép được, hãy gửi mã phòng');
  };
  const copy = async () => {
    setToast((await copyRoomLink(code)) ? 'Đã chép link mời' : 'Không chép được, hãy gửi mã phòng');
  };

  // Khách quan sát không có quân nên chọn màu nào cũng được.
  const otherPlayers = amPlayer ? players.filter((s) => s.id !== meId) : [];
  const takenColors = otherPlayers.map((s) => s.color);
  const takenIcons = otherPlayers.map((s) => s.icon);
  const playerNumber = (s: Seat) => players.indexOf(s) + 1;
  const canAddBot = isHost && bots.length < MAX_BOTS && !full;

  const editor = (
    <ProfileEditor
      id="lobby-name"
      label={
        <>
          {isHost ? '★ Chủ phòng' : amPlayer ? `Người chơi ${playerNumber(me)}` : 'Khách xem'} · bạn
          <ConnDot on />
        </>
      }
      value={value}
      onChange={change}
      onNameDone={() => void nameDone()}
      takenColors={takenColors}
      takenIcons={takenIcons}
      invalid={nameDraft !== null && !nameDraft.trim()}
    />
  );
  const roleBtn = (
    <button
      type="button"
      className={`btn btn-small ${amPlayer ? 'btn-outline' : 'btn-teal'} lobby-role`}
      disabled={busy || (!amPlayer && full)}
      onClick={() => void run(() => onRole(amPlayer ? 'spectator' : 'player'))}
    >
      {amPlayer ? '👁 Chuyển sang xem' : full ? `Đã đủ ${MAX_PLAYERS} người chơi` : '🎲 Vào chơi'}
    </button>
  );

  return (
    <main className="phone setup-screen lobby-screen">
      <header className="app-header">
        <h1 className="app-title">CỜ TỶ PHÚ</h1>
        <span className="app-turn">
          Phòng chờ · {players.length}/{MAX_PLAYERS} người chơi
          {watchers.length > 0 ? ` · ${watchers.length} xem` : ''}
        </span>
      </header>

      <section className="setup-card">
        <div className="setup-body lobby-body">
          <div className="lobby-code">
            <div className="lobby-code-main">
              <span className="eyebrow">Mã phòng</span>
              <b className="lobby-code-text" aria-label={`Mã phòng ${[...code].join(' ')}`}>
                {code}
              </b>
              <span className="lobby-link">{inviteLink(code).replace(/^https?:\/\//, '')}</span>
            </div>
            <div className="lobby-share">
              {canShare() && (
                <button type="button" className="btn btn-teal btn-small" onClick={share}>
                  Chia sẻ
                </button>
              )}
              <button type="button" className="btn btn-outline btn-small" onClick={copy}>
                Chép link
              </button>
            </div>
          </div>

          <div className="setup-players-head">
            <span className="eyebrow">
              Người chơi · {players.length}/{MAX_PLAYERS}
            </span>
            {amPlayer ? roleBtn : <span className="muted">Màu và kí hiệu không trùng nhau</span>}
          </div>
          <div className="lobby-seats">
            {amPlayer && editor}
            {amPlayer && swapped && (
              <p className="box box-amber lobby-swapped" role="status">
                Màu hoặc kí hiệu bạn chọn đã có người dùng nên được đổi. Bấm quân để chọn lại.
              </p>
            )}
            <div className="lobby-grid">
              {players
                .filter((s) => s.id !== meId)
                .map((s) => (
                  <SeatCard
                    key={s.id}
                    seat={s}
                    number={playerNumber(s)}
                    onRemove={isHost && s.bot ? () => void run(() => onRemoveBot(s.id)) : undefined}
                    busy={busy}
                  />
                ))}
              {canAddBot && (
                <button
                  type="button"
                  className="lobby-seat is-empty lobby-add-bot"
                  disabled={busy}
                  onClick={() => void run(onAddBot)}
                >
                  <span className="lobby-seat-label">Thêm bot · còn {MAX_BOTS - bots.length}</span>
                  <span className="lobby-add-text">🤖 + Bot (máy tự chơi)</span>
                </button>
              )}
              {!full && (
                <div className="lobby-seat is-empty">
                  <span className="lobby-seat-label">Còn {MAX_PLAYERS - players.length} chỗ</span>
                  <span className="lobby-wait">Đang chờ bạn bè…</span>
                </div>
              )}
            </div>
          </div>

          <div className="setup-players-head lobby-watch-head">
            <span className="eyebrow">Khách quan sát · {watchers.length}</span>
            {amPlayer ? <span className="muted">Xem ván, chat và nói chuyện</span> : roleBtn}
          </div>
          {!amPlayer && editor}
          {watchers.some((s) => s.id !== meId) && (
            <ul className="lobby-watchers">
              {watchers
                .filter((s) => s.id !== meId)
                .map((s) => (
                  <li key={s.id} className={s.connected ? '' : 'is-away'}>
                    <TokenIcon icon={s.icon} color={s.color} size={18} />
                    <span>{s.name}</span>
                    {s.isHost && <b>★</b>}
                    <ConnDot on={s.connected} />
                  </li>
                ))}
            </ul>
          )}
          {watchers.length === 0 && (
            <p className="muted lobby-watch-empty">
              Chưa có ai. Ai vào khi đã đủ 6 người cũng thành khách xem.
            </p>
          )}
        </div>

        <div className="setup-footer">
          {error && (
            <p className="box box-red setup-error" role="alert">
              {error}
            </p>
          )}
          {confirmLeave && (
            <p className="lobby-confirm" role="status">
              Chủ phòng rời đi thì phòng đóng, mọi người phải vào phòng khác.
            </p>
          )}
          <div className="btn-row">
            <button
              type="button"
              className={`btn ${confirmLeave ? 'btn-red' : 'btn-outline'}`}
              disabled={busy}
              onClick={leave}
            >
              {confirmLeave ? 'Đóng phòng' : 'Rời phòng'}
            </button>
            {isHost ? (
              <button
                type="button"
                className="btn btn-grow btn-teal"
                disabled={!ready || busy}
                onClick={() => void run(onStart)}
              >
                {ready ? `Bắt đầu ván ${players.length} người` : 'Cần ít nhất 2 người chơi'}
              </button>
            ) : (
              <button type="button" className="btn btn-grow" disabled>
                Chờ chủ phòng bắt đầu…
              </button>
            )}
          </div>
        </div>
      </section>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}

/** Chấm xanh: đang mở trang; xám: mất kết nối. */
function ConnDot({ on }: { on: boolean }) {
  return (
    <span
      className={`lobby-dot${on ? ' is-on' : ''}`}
      role="img"
      aria-label={on ? 'đang kết nối' : 'mất kết nối'}
    />
  );
}

/** Ghế của người chơi khác (hay bot): chỉ xem; chủ phòng bỏ được bot. */
function SeatCard({
  seat,
  number,
  onRemove,
  busy,
}: {
  seat: Seat;
  number: number;
  onRemove?: () => void;
  busy: boolean;
}) {
  const c = colorOf(seat.color);
  return (
    <div
      className={`lobby-seat${seat.connected ? '' : ' is-away'}`}
      style={{ ['--pc' as string]: c.main, ['--pc-soft' as string]: c.soft }}
    >
      <span className="lobby-seat-label">
        {seat.isHost ? '★ Chủ phòng' : seat.bot ? '🤖 Bot' : `Người chơi ${number}`}
        {onRemove ? (
          <button
            type="button"
            className="lobby-remove"
            aria-label={`Bỏ ${seat.name}`}
            disabled={busy}
            onClick={onRemove}
          >
            ✕
          </button>
        ) : (
          <ConnDot on={seat.connected} />
        )}
      </span>
      <span className="lobby-seat-row">
        <TokenIcon icon={seat.icon} color={seat.color} size={28} />
        <span className="lobby-seat-text">
          <b title={seat.name}>{seat.name}</b>
          <span>
            {seat.bot ? 'Máy chủ tự chơi' : seat.connected ? ICON_NAMES[seat.icon] : 'Mất kết nối'}
          </span>
        </span>
      </span>
    </div>
  );
}
