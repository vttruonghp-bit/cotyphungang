import { useState } from 'react';
import { ROOM_CODE_LENGTH, type GameState, type Profile } from '@cotiphu/shared';
import { TokenIcon } from '../components/TokenIcon';
import { money } from '../game/format';
import { ProfileEditor } from '../online/ProfileEditor';
import { cleanCode, cleanName, loadProfile, saveProfile } from '../online/storage';
import './setup-screen.css';
import './home-screen.css';

interface HomeScreenProps {
  /** Mã phòng trong đường dẫn mời (?phong=): nút Vào phòng hiện lên trước. */
  inviteCode: string | null;
  /** Lời nhắn từ lần trước: phòng đã đóng, không vào lại được… */
  notice: string | null;
  onDismissNotice: () => void;
  onCreate: (profile: Profile) => Promise<string | null>;
  onJoin: (code: string, profile: Profile) => Promise<string | null>;
  /** Ván chơi chung một máy đang dở trên máy này. */
  hotSeatGame: GameState | null;
  onHotSeat: () => void;
}

/**
 * Màn đầu: chọn tên, màu, kí hiệu rồi Tạo phòng (vào phòng chờ, thêm bot, chờ bạn bè),
 * vào phòng bằng mã, hoặc Chơi trên 1 máy.
 */
export function HomeScreen({
  inviteCode,
  notice,
  onDismissNotice,
  onCreate,
  onJoin,
  hotSeatGame,
  onHotSeat,
}: HomeScreenProps) {
  const [profile, setProfile] = useState(loadProfile);
  const [code, setCode] = useState(inviteCode ?? '');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameMissing, setNameMissing] = useState(false);

  const change = (next: Profile) => {
    setProfile(next);
    saveProfile(next);
    setError(null);
    if (next.name.trim()) setNameMissing(false);
  };

  /** Kiểm tra tên rồi gửi yêu cầu tạo hoặc vào phòng. */
  const go = async (what: 'create' | 'join', run: (p: Profile) => Promise<string | null>) => {
    const p = { ...profile, name: cleanName(profile.name) };
    if (!p.name) {
      setNameMissing(true);
      document.getElementById('home-name')?.focus();
      return setError('Nhập tên của bạn trước đã.');
    }
    saveProfile(p);
    setProfile(p);
    setBusy(what);
    setError(null);
    onDismissNotice();
    const err = await run(p);
    setBusy(null);
    if (err) setError(err);
  };

  const create = () => void go('create', onCreate);
  const codeReady = code.length === ROOM_CODE_LENGTH;
  const join = () => {
    if (codeReady) void go('join', (p) => onJoin(code, p));
  };

  const hotCur = hotSeatGame?.players[hotSeatGame.current];

  const createBtn = (
    <button
      type="button"
      className={`btn ${inviteCode ? 'btn-outline' : 'btn-teal'} home-go`}
      disabled={busy !== null}
      onClick={create}
    >
      {busy === 'create' ? 'Đang tạo phòng…' : 'Tạo phòng'}
    </button>
  );

  return (
    <main className="phone home-screen">
      <header className="app-header">
        <h1 className="app-title">CỜ TỶ PHÚ</h1>
        <span className="app-turn muted">Chơi online hoặc trên 1 máy</span>
      </header>

      {notice && (
        <div className="box box-red home-notice" role="alert">
          <span>{notice}</span>
          <button type="button" aria-label="Đóng thông báo" onClick={onDismissNotice}>
            ✕
          </button>
        </div>
      )}

      <section className="home-card">
        <div className="setup-head home-head">
          <TokenIcon icon={18} color={0} size={44} title="Cờ tỷ phú" />
          <div>
            <h2 className="setup-title">{inviteCode ? `Vào phòng ${inviteCode}` : 'Bạn là ai?'}</h2>
            <p className="setup-subtitle">
              {inviteCode
                ? 'Bạn được mời. Chọn tên, màu, kí hiệu rồi vào.'
                : 'Chọn tên, màu và kí hiệu (bấm vào quân để đổi)'}
            </p>
          </div>
        </div>

        <ProfileEditor
          id="home-name"
          label="Bạn là"
          value={profile}
          onChange={change}
          invalid={nameMissing}
        />

        {!inviteCode && createBtn}

        <div className="home-join">
          <label className="eyebrow setup-label" htmlFor="home-code">
            {inviteCode ? 'Mã phòng' : 'Có mã phòng? Vào phòng bạn bè'}
          </label>
          <div className="home-join-row">
            <input
              id="home-code"
              className="home-code"
              value={code}
              placeholder="VD: K7M2QX"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              onChange={(e) => {
                setCode(cleanCode(e.target.value));
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') join();
              }}
            />
            <button
              type="button"
              className="btn btn-blue home-join-go"
              disabled={busy !== null || !codeReady}
              onClick={join}
            >
              {busy === 'join' ? 'Đang vào…' : 'Vào phòng'}
            </button>
          </div>
        </div>

        {inviteCode && createBtn}

        {error && (
          <p className="box box-red home-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <div className="home-or" aria-hidden="true">
        <span>hoặc</span>
      </div>
      <button type="button" className="btn btn-outline home-hotseat" onClick={onHotSeat}>
        {hotCur ? (
          <>
            <span>Tiếp tục ván trên 1 máy</span>
            <span className="home-hotseat-sub">
              Lượt {hotCur.name} · {money(hotCur.cash)}
            </span>
          </>
        ) : (
          <>
            <span>Chơi trên 1 máy</span>
            <span className="home-hotseat-sub">Chuyền tay một máy, có thể cho khách xem</span>
          </>
        )}
      </button>
    </main>
  );
}
