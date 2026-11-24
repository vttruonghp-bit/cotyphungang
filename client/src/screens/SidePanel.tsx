import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BOARD, CHAT_TEXT_MAX, type ChatMessage, type GameState, type Seat } from '@cotiphu/shared';
import { liquidationValue, money } from '../game/format';
import { colorOf } from '../theme';
import './side-layout.css';

interface PlayerCardsProps {
  game: GameState;
  /** Online: người cầm máy này. */
  meId: string | null;
  /** Online: ghế trong phòng (mất kết nối, mic). */
  seats: readonly Seat[] | null;
}

/**
 * Mỗi người một ô nhỏ 3 dòng: tên; tiền mặt / tiền có nếu bán hết; số đất, ga, nhà máy.
 * Màu đất trên bàn cờ đã cho biết ô nào của ai nên không liệt kê tên từng ô nữa.
 */
export function PlayerCards({ game, meId, seats }: PlayerCardsProps) {
  const cur = game.players[game.current]!;
  const n = game.players.length;
  const columns = n === 4 ? 2 : Math.min(3, n);
  return (
    <section
      className="pcards"
      aria-label="Người chơi"
      style={{ ['--pcard-cols' as string]: columns }}
    >
      {game.players.map((p) => {
        const c = colorOf(p.color);
        const owned = game.tiles.flatMap((t, i) => (t?.owner === p.id ? [BOARD[i]!.kind] : []));
        const count = (kind: string) => owned.filter((k) => k === kind).length;
        const seat = seats?.find((s) => s.id === p.id);
        const turn = p.id === cur.id && game.pending.type !== 'ended';
        return (
          <div
            key={p.id}
            className={`pcard${turn ? ' is-turn' : ''}${p.status !== 'active' ? ' is-out' : ''}`}
            style={{
              ['--pc' as string]: c.main,
              ['--pc-soft' as string]: c.soft,
              ['--pc-paint' as string]: c.paint,
            }}
            aria-current={turn ? 'true' : undefined}
          >
            <div className="pcard-name">
              <span className="pcard-name-text">
                {p.name}
                {p.id === meId ? ' (bạn)' : ''}
              </span>
              {seat && !seat.connected && (
                <span className="pcard-off" title="Mất kết nối" aria-label="Mất kết nối">
                  ⚠
                </span>
              )}
              {seat?.bot && (
                <span className="pcard-mic" title="Máy chủ tự chơi" aria-label="Bot">
                  🤖
                </span>
              )}
              {seat && seat.connected && !seat.bot && !seat.local && (
                <span
                  className="pcard-mic"
                  title={seat.mic ? 'Đang bật mic' : 'Đang tắt mic'}
                  aria-label={seat.mic ? 'Đang bật mic' : 'Đang tắt mic'}
                >
                  {seat.mic ? '🔊' : '🔇'}
                </span>
              )}
            </div>
            <div className="pcard-money" title="Tiền mặt / tiền có nếu bán hết tài sản">
              <b>{money(p.cash)}</b>
              <span> / {money(liquidationValue(game, p.id))}</span>
            </div>
            <div className="pcard-assets" aria-label="Số đất, ga, nhà máy">
              <span title="Đất">🏠{count('property')}</span>
              <span title="Ga">🚉{count('station')}</span>
              <span title="Nhà máy">🏭{count('utility')}</span>
              {p.heldCards.length > 0 && <span title="Thẻ đang giữ">🃏{p.heldCards.length}</span>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

interface ChatPanelProps {
  game: GameState;
  /** Ghế trong phòng: tên, màu của cả khách quan sát. */
  seats: readonly Seat[];
  meId: string;
  messages: readonly ChatMessage[];
  send(text: string): Promise<string | null>;
  /** Tăng mỗi khi bấm nút Chat: đưa con trỏ vào ô gõ. */
  focusKey: number;
}

const clock = (at: number) =>
  new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export function ChatPanel({ game, seats, meId, messages, send, focusKey }: ChatPanelProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  useEffect(() => {
    if (focusKey > 0) input.current?.focus();
  }, [focusKey]);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    const err = await send(value);
    setSending(false);
    if (err) setError(err);
    else setText('');
  };

  return (
    <section className="chat" aria-label="Trò chuyện">
      <ol className="chat-list" ref={list} aria-live="polite">
        {messages.length === 0 && <li className="chat-empty">Chưa có tin nhắn nào.</li>}
        {messages.map((m) => {
          const p = game.players.find((x) => x.id === m.from);
          const seat = seats.find((x) => x.id === m.from);
          const who = p ?? seat;
          const color = who ? colorOf(who.color).main : undefined;
          const watcher = !p && seat?.role === 'spectator';
          return (
            <li key={m.id} className={m.from === meId ? 'chat-msg is-me' : 'chat-msg'}>
              <b style={color ? { color } : undefined}>
                {who?.name ?? 'Ai đó'}
                {watcher ? ' (xem)' : ''}:
              </b>{' '}
              {m.text}
              <time className="chat-time">{clock(m.at)}</time>
            </li>
          );
        })}
      </ol>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
      <form className="chat-form" onSubmit={submit}>
        <input
          ref={input}
          className="chat-input"
          value={text}
          maxLength={CHAT_TEXT_MAX}
          placeholder="Nhắn tin…"
          enterKeyHint="send"
          aria-label="Nội dung tin nhắn"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="chat-send" disabled={sending || !text.trim()}>
          Gửi
        </button>
      </form>
    </section>
  );
}
