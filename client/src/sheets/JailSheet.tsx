import { useEffect, useState, type ReactNode } from 'react';
import { BOARD_SIZE, JAIL_BAIL, JAIL_INDEX, MAX_JAIL_TURNS, type GameState } from '@cotiphu/shared';
import { Dice } from '../components/Dice';
import { Sheet, SheetGlyph } from '../components/Sheet';
import { arrivalAt, tileNumber } from '../components/TileGrid';
import { money, playerById, tileName } from '../game/format';
import { colorOf } from '../theme';
import type { SheetProps } from './types';
import './move-sheets.css';

type Way = 'roll' | 'bail' | 'card';

/** `extra`: nút Đầu hàng / Đen vl của màn chính, vì màn này che chúng. */
type JailSheetProps = SheetProps & { onOpenManage: () => void; extra?: ReactNode };

/**
 * Màn đang ở tù (hình 2, dưới trái). `jail`: thử đổ đôi, trả 50Đ hoặc dùng thẻ;
 * `jailRelease`: lần thử thứ 3 không ra đôi mà có thẻ, phải trả 50Đ hoặc dùng thẻ rồi đi.
 * `onOpenManage` mở Ụp/Mở ở đầu lượt.
 */
export function JailSheet(props: JailSheetProps) {
  const { game } = props;
  const pd = game.pending;
  if (pd.type !== 'jail' && pd.type !== 'jailRelease') return null;
  const p = playerById(game, pd.playerId)!;
  // Mỗi lượt trong tù là một lựa chọn mới.
  const key = `${p.id}-${pd.type}-${p.jailAttempts}-${game.turnNumber}`;
  return <JailChooser key={key} {...props} id={p.id} />;
}

function JailChooser({ game, dispatch, onOpenManage, extra, id }: JailSheetProps & { id: string }) {
  const pd = game.pending;
  const p = playerById(game, id)!;
  const release = pd.type === 'jailRelease' ? pd : null;
  const cards = p.heldCards.filter((c) => c.kind === 'jailFree').length;
  const canBail = p.cash >= JAIL_BAIL;
  const [way, setWay] = useState<Way>(release ? (cards > 0 ? 'card' : 'bail') : 'roll');
  // Ụp/Mở chỉ ở đầu lượt của mình, trước khi đổ (luật mục 3).
  const canManage = !release && game.players[game.current]!.id === id && !game.rolled;
  const attempt = release ? MAX_JAIL_TURNS : p.jailAttempts + 1;
  const last = [...game.events].reverse().find((e) => e.type === 'roll');
  const lastRoll = last?.type === 'roll' ? last : null;
  const jailRoll = lastRoll?.playerId === id && lastRoll.jail ? lastRoll : null;
  const [rollingDice, setRollingDice] = useState(Boolean(jailRoll));
  useEffect(() => {
    if (!jailRoll) {
      setRollingDice(false);
      return;
    }
    setRollingDice(true);
    const timer = setTimeout(() => setRollingDice(false), 2000);
    return () => clearTimeout(timer);
  }, [jailRoll?.dice[0], jailRoll?.dice[1], p.jailAttempts]);

  const run = () => {
    if (way === 'roll') void dispatch({ type: 'roll', playerId: id });
    else if (way === 'bail') void dispatch({ type: 'payBail', playerId: id });
    else void dispatch({ type: 'useJailCard', playerId: id });
  };

  const steps = release?.steps ?? 0;
  const confirm: Record<Way, { label: string; tone: string }> = {
    roll: {
      label: attempt === MAX_JAIL_TURNS ? 'Thử đôi lần cuối' : 'Thử đôi ngay',
      tone: 'btn-blue',
    },
    bail: {
      label: release
        ? `Trả ${money(JAIL_BAIL)} · đi ${steps} ô`
        : `Trả ${money(JAIL_BAIL)} · ra tù`,
      tone: '',
    },
    card: { label: release ? `Dùng thẻ · đi ${steps} ô` : 'Dùng thẻ ra tù', tone: 'btn-teal' },
  };

  const bailNote = canBail
    ? `${money(p.cash)} → ${money(p.cash - JAIL_BAIL)} ${release ? 'rồi đi' : 'trước khi gieo'}`
    : `Cần ${money(JAIL_BAIL)}, ${p.name} có ${money(p.cash)}${
        canManage ? ' · Ụp/Mở để có thêm tiền' : cards > 0 ? ' · hãy dùng thẻ' : ''
      }`;

  return (
    <Sheet
      game={game}
      icon={
        <SheetGlyph color="var(--red)">
          <JailGlyph />
        </SheetGlyph>
      }
      title={release ? 'Hết lượt thử · ô 10' : 'Đang ở tù · ô 10'}
      subtitle={
        release
          ? `${p.name} không ra đôi · bắt buộc ra tù rồi đi`
          : `${p.name} bị giam · không dùng Metro`
      }
      label={`${p.name} đang ở tù`}
      footer={
        <div className="move-footer">
          {!release && (
            <p className="move-note muted">Ra đôi để thoát tù thì không có lượt đi thêm.</p>
          )}
          <div className="btn-row">
            {canManage && (
              <button type="button" className="btn btn-outline" onClick={onOpenManage}>
                Ụp / Mở
              </button>
            )}
            <button
              type="button"
              className={`btn btn-grow ${confirm[way].tone}`}
              disabled={way === 'bail' && !canBail}
              onClick={run}
            >
              {confirm[way].label}
            </button>
          </div>
        </div>
      }
    >
      {lastRoll && lastRoll.playerId !== id && <LastRoll game={game} roll={lastRoll} />}

      {release ? (
        <div className="move-attempt box box-red">
          <div className="move-attempt-head">
            <b>
              Lần thử {MAX_JAIL_TURNS} / {MAX_JAIL_TURNS} không ra đôi
            </b>
          </div>
          {lastRoll && lastRoll.playerId === id && (
            <div className="move-attempt-dice">
              <Dice values={lastRoll.dice} color={colorOf(p.color).main} size={30} />
              <b>
                {lastRoll.dice[0]} + {lastRoll.dice[1]} = {steps}
              </b>
            </div>
          )}
          <p>
            Bắt buộc trả {money(JAIL_BAIL)} hoặc dùng thẻ ra tù, rồi đi {steps} ô theo tổng vừa
            gieo.
          </p>
        </div>
      ) : (
        <div className="move-attempt box box-red">
          <div className="move-attempt-head">
            <b>
              Lần thử đôi {attempt} / {MAX_JAIL_TURNS}
            </b>
            <span className="move-pips" aria-hidden="true">
              {Array.from({ length: MAX_JAIL_TURNS }, (_, k) => (
                <span
                  key={k}
                  className={k < p.jailAttempts ? 'is-used' : k === p.jailAttempts ? 'is-now' : ''}
                />
              ))}
            </span>
          </div>
          {jailRoll && (
            <div className="move-attempt-dice jail-live-dice" aria-live="polite">
              <Dice
                values={jailRoll.dice}
                color={colorOf(p.color).main}
                size={42}
                rolling={rollingDice}
              />
              {!rollingDice && (
                <b>
                  {jailRoll.dice[0]} + {jailRoll.dice[1]} · không ra đôi
                </b>
              )}
            </div>
          )}
          <p>
            {rollingDice
              ? 'Đang gieo xúc xắc…'
              : jailRoll
                ? 'Không ra đôi · xúc xắc được giữ lại để đối chiếu. Chọn cách tiếp theo.'
                : 'Chọn một cách ra tù trước khi đi.'}
          </p>
        </div>
      )}

      <div className="move-options" role="radiogroup" aria-label="Cách ra tù">
        {!release && (
          <WayButton
            way="roll"
            current={way}
            onPick={setWay}
            title="Thử đổ đôi"
            text={`Tự gieo hai viên · không tốn ${money(JAIL_BAIL)}`}
            foot={
              <>
                <Dice values={[3, 3]} color="var(--blue)" size={22} />
                <span>
                  {attempt === MAX_JAIL_TURNS
                    ? 'Lần thử cuối'
                    : `Lượt thử ${attempt} / ${MAX_JAIL_TURNS}`}
                </span>
              </>
            }
          />
        )}
        {release && cards > 0 && <CardWay current={way} onPick={setWay} cards={cards} release />}
        <WayButton
          way="bail"
          current={way}
          onPick={setWay}
          disabled={!canBail}
          title={`Trả bảo lãnh ${money(JAIL_BAIL)}`}
          text={release ? `Trả cho Ngân hàng rồi đi ${steps} ô` : 'Ra tù ngay rồi Sục để đi'}
          foot={<span className={canBail ? 'move-option-strong' : 'down'}>{bailNote}</span>}
        />
        {!release && cards > 0 && <CardWay current={way} onPick={setWay} cards={cards} />}
      </div>

      {release ? (
        <ReleasePreview
          game={game}
          id={id}
          steps={steps}
          cash={way === 'bail' ? p.cash - JAIL_BAIL : p.cash}
        />
      ) : (
        <ThirdTryNote attempt={attempt} cards={cards} canBail={canBail} />
      )}
      {extra}
    </Sheet>
  );
}

interface WayButtonProps {
  way: Way;
  current: Way;
  onPick: (w: Way) => void;
  title: string;
  text: string;
  foot: ReactNode;
  disabled?: boolean;
}

/** Một cách ra tù: bấm để chọn, nút cuối màn làm cách đang chọn. */
function WayButton({ way, current, onPick, title, text, foot, disabled }: WayButtonProps) {
  const on = way === current;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      className={`move-option way-${way}${on ? ' is-on' : ''}`}
      onClick={() => onPick(way)}
    >
      <span className="move-option-title">{title}</span>
      <span className="move-option-text">{text}</span>
      <span className="move-option-foot">{foot}</span>
    </button>
  );
}

function CardWay({
  current,
  onPick,
  cards,
  release = false,
}: {
  current: Way;
  onPick: (w: Way) => void;
  cards: number;
  release?: boolean;
}) {
  return (
    <WayButton
      way="card"
      current={current}
      onPick={onPick}
      title="Dùng thẻ ra tù"
      text={`Đang giữ ${cards} thẻ ra tù${release ? ' · không mất tiền' : ''}`}
      foot={<span className="move-option-strong">Thẻ trở lại chồng Khí Vận sau khi dùng</span>}
    />
  );
}

/** Lời nhắc chuyện xảy ra nếu lần thử thứ ba thất bại (luật mục 6). */
function ThirdTryNote({
  attempt,
  cards,
  canBail,
}: {
  attempt: number;
  cards: number;
  canBail: boolean;
}) {
  const last = attempt === MAX_JAIL_TURNS;
  const text = !last
    ? `Phải dùng thẻ hoặc trả ${money(JAIL_BAIL)}, rồi đi theo tổng vừa gieo.`
    : cards > 0
      ? `Không ra đôi: chọn dùng thẻ hoặc trả ${money(JAIL_BAIL)}, rồi đi theo tổng vừa gieo.`
      : canBail
        ? `Không ra đôi: tự trả ${money(JAIL_BAIL)} rồi đi theo tổng vừa gieo.`
        : `Không ra đôi: phải trả ${money(JAIL_BAIL)}, thiếu tiền thì vào Xử lý nợ, rồi đi theo tổng vừa gieo.`;
  return (
    <div className="move-warn box box-amber">
      <span className="eyebrow">
        {last ? 'Đây là lần thử cuối' : 'Nếu lần thử thứ ba thất bại'}
      </span>
      <p>{text}</p>
    </div>
  );
}

/** Ô sẽ tới sau khi ra tù ở lần thử thứ 3. */
function ReleasePreview({
  game,
  id,
  steps,
  cash,
}: {
  game: GameState;
  id: string;
  steps: number;
  cash: number;
}) {
  const p = playerById(game, id)!;
  const to = (JAIL_INDEX + steps) % BOARD_SIZE;
  const arrival = arrivalAt(game, p, to, cash);
  return (
    <div className="move-dest box box-blue" aria-live="polite">
      <span className="eyebrow">Xem trước · đi {steps} ô</span>
      <span className="move-preview-route">
        Tù 10 <span aria-hidden="true">→</span>{' '}
        <b>
          {tileNumber(to)} {tileName(to)}
        </b>
      </span>
      <span className={`move-preview-effect ${arrival.tone}`}>{arrival.text}</span>
    </div>
  );
}

/** Xúc xắc vừa gieo của người trước, vì màn này che bàn cờ. */
function LastRoll({
  game,
  roll,
}: {
  game: GameState;
  roll: { playerId: string; dice: [number, number]; jail: boolean };
}) {
  const who = playerById(game, roll.playerId);
  if (!who) return null;
  const [a, b] = roll.dice;
  const result = roll.jail ? (a === b ? ' · ra tù' : ' · vẫn ở tù') : a === b ? ' (đôi)' : '';
  return (
    <p className="move-last">
      <Dice values={roll.dice} color={colorOf(who.color).main} size={20} />
      <span>
        Vừa rồi <b style={{ color: colorOf(who.color).main }}>{who.name}</b>{' '}
        {roll.jail ? 'thử đổ đôi' : 'đổ'} {a} + {b}
        {result}
      </span>
    </p>
  );
}

function JailGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M9.3 3v18M14.7 3v18M4 12h16" />
    </svg>
  );
}
