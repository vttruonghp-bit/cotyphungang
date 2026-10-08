import { useEffect, useRef, type ReactNode } from 'react';
import {
  BOARD,
  CHANCE_CARDS,
  COMMUNITY_CARDS,
  GO_REWARD,
  HOTEL_LEVEL,
  getCard,
  type Card,
  type CardDetail,
  type DeckKind,
  type GameEvent,
  type GameState,
  type LogEntry,
  type PlayerState,
} from '@cotiphu/shared';
import { Dice } from '../components/Dice';
import { Sheet, SheetGlyph } from '../components/Sheet';
import { TokenIcon } from '../components/TokenIcon';
import { levelText, money, numbered, playerById, signed, tileName } from '../game/format';
import { useMeId } from '../online/mode';
import { colorOf } from '../theme';
import type { CardEvent, HighwayEvent, SheetProps } from './types';
import './card-sheet.css';

/** Một lần rút thẻ, hoặc một lần gieo xúc xắc Cao tốc. */
type Draw = CardEvent | HighwayEvent;
type MoveEvent = Extract<GameEvent, { type: 'move' }>;

const DECK_NAME: Record<DeckKind, string> = { chance: 'Cơ Hội', community: 'Khí Vận' };
const DECK_CARDS: Record<DeckKind, readonly Card[]> = {
  chance: CHANCE_CARDS,
  community: COMMUNITY_CARDS,
};

const HIGHWAY_STEPS = (() => {
  const e = COMMUNITY_CARDS.find((c) => c.effect.type === 'highway')?.effect;
  if (e?.type !== 'highway') throw new Error('Thiếu thẻ Mở đường cao tốc');
  return e.stepsByDie;
})();

const isDraw = (e: GameEvent): e is Draw => e.type === 'card' || e.type === 'highway';

/** Lá thẻ vừa rút và kết quả của nó (hình 3). */
export function CardSheet({
  game,
  previous,
  event,
  onContinue,
}: SheetProps & { event: CardEvent | HighwayEvent; onContinue: () => void }) {
  const found = game.events.filter(isDraw);
  const draws = found.includes(event) ? found : [event];
  const k = draws.indexOf(event);
  const result = drawResults(game, previous, draws)[k]!;
  const online = useMeId() !== null;
  // Lá thẻ kế tiếp hiện trong cùng màn: cuộn về đầu để thấy lá mới.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.closest('.sheet-body')?.scrollTo({ top: 0 });
  }, [event]);
  const drawer = playerById(game, event.playerId)!;
  const card = event.type === 'card' ? getCard(event.cardId) : null;
  const deck: DeckKind = card?.deck ?? 'community';
  // Màu người rút cho xúc xắc và ô kết quả được chọn.
  const whoStyle = {
    ['--who' as string]: colorOf(drawer.color).main,
    ['--who-soft' as string]: colorOf(drawer.color).soft,
  };

  const footer = (
    <div className="draw-footer">
      <p className="draw-next">
        <span className="eyebrow">Tiếp theo</span>
        <span>{nextText(game, draws, k, online)}</span>
      </p>
      <button
        type="button"
        className={`btn ${deck === 'chance' ? 'btn-orange' : 'btn-blue'}`}
        onClick={onContinue}
      >
        Tiếp tục
      </button>
    </div>
  );

  // Lượt có thể đã sang người sau, nhưng máy vẫn đang ở tay người rút.
  const who = {
    playerId: drawer.id,
    text: `${drawer.name} ${event.type === 'highway' ? 'gieo' : 'rút'}`,
  };

  if (event.type === 'highway') {
    return (
      <Sheet
        game={game}
        who={who}
        icon={
          <SheetGlyph color="var(--red)">
            <RoadGlyph />
          </SheetGlyph>
        }
        title="Khí Vận · Cao tốc"
        subtitle={`${drawer.name} gieo 1 viên từ ô ${numbered(event.tile)}`}
        label={`Kết quả Cao tốc của ${drawer.name}`}
        footer={footer}
      >
        <div
          className="draw-body"
          key={`h-${k}-${event.tile}-${event.die}`}
          style={whoStyle}
          ref={bodyRef}
        >
          <HighwayView game={game} event={event} drawer={drawer} />
          <ResultBox game={game} result={result} card={null} drawer={drawer} />
        </div>
      </Sheet>
    );
  }

  const c = card!;
  const list = DECK_CARDS[c.deck];
  const number = list.findIndex((x) => x.id === c.id) + 1;
  const moves = result.events.filter(
    (e): e is MoveEvent => e.type === 'move' && e.playerId === drawer.id,
  );
  const jailed = result.events.some((e) => e.type === 'jail' && e.playerId === drawer.id);

  return (
    <Sheet
      game={game}
      who={who}
      icon={
        <SheetGlyph color={c.deck === 'chance' ? 'var(--orange)' : 'var(--red)'}>
          {c.deck === 'chance' ? <StarGlyph /> : <GiftGlyph />}
        </SheetGlyph>
      }
      title={`Thẻ ${DECK_NAME[c.deck]}`}
      subtitle={`${drawer.name} rút ở ô ${numbered(result.from)} · thẻ số ${pad(number)}/${list.length}`}
      label={`Thẻ ${DECK_NAME[c.deck]}: ${c.title}`}
      footer={footer}
    >
      <div className="draw-body" key={`c-${k}-${c.id}`} style={whoStyle} ref={bodyRef}>
        <div className="draw-stage">
          <article className={`draw-card draw-card-${c.deck}`}>
            <div className="draw-card-top">
              <span className="draw-card-deck">
                {DECK_NAME[c.deck]} · {pad(number)}
              </span>
              <span className="draw-card-who">
                <TokenIcon icon={drawer.icon} color={drawer.color} size={22} />
                <span>{drawer.name} rút</span>
              </span>
            </div>
            <h3 className="draw-card-title">{c.title}</h3>
            <p className="draw-card-text">{c.description}</p>
          </article>
        </div>
        {event.detail && (
          <DetailView game={game} card={c} detail={event.detail} drawer={drawer} result={result} />
        )}
        {moves.length > 0 && c.effect.type !== 'flyDice' && <Route moves={moves} jailed={jailed} />}
        <Explain game={game} card={c} drawer={drawer} result={result} />
        <ResultBox
          game={game}
          result={result}
          card={c}
          drawer={drawer}
          jailShown={jailed && moves.length > 0 && c.effect.type !== 'flyDice'}
        />
      </div>
    </Sheet>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "3,33" theo cách viết số của Việt Nam. */
const decimal = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// Kết quả của từng lần rút trong thao tác vừa rồi
// ---------------------------------------------------------------------------

interface MoneyRow {
  id: string;
  before: number;
  after: number;
}

interface DrawResult {
  /** Dòng nhật ký của riêng lần rút này (không gồm dòng "Rút thẻ"). */
  log: LogEntry[];
  /** Những người đổi tiền vì lần rút này. */
  money: MoneyRow[];
  /** Di chuyển, vào tù… xảy ra sau lần rút, trước lần rút kế tiếp. */
  events: GameEvent[];
  /** Ô người rút đứng lúc rút. */
  from: number;
}

const sameEntry = (a: LogEntry, b: LogEntry) =>
  a.turn === b.turn && a.playerId === b.playerId && a.text === b.text && a.amount === b.amount;

/** Các dòng nhật ký thao tác cuối thêm vào (nhật ký chỉ giữ 100 dòng nên dò chỗ hai bản khớp nhau). */
function newEntries(game: GameState, previous: GameState): LogEntry[] {
  const a = previous.log;
  const b = game.log;
  for (let cut = 0; cut <= a.length; cut++) {
    const keep = a.length - cut;
    if (keep > b.length) continue;
    let same = true;
    for (let i = 0; i < keep && same; i++) same = sameEntry(a[cut + i]!, b[i]!);
    if (same) return b.slice(keep);
  }
  return b;
}

/** Dòng nhật ký mở đầu một lần rút (bộ luật ghi đúng các câu này). */
function isStart(e: LogEntry, d: Draw): boolean {
  if (e.playerId !== d.playerId) return false;
  if (d.type === 'card') {
    const c = getCard(d.cardId);
    return e.text === `Rút thẻ ${DECK_NAME[c.deck]}: ${c.title}`;
  }
  return e.text.startsWith(`Cao tốc từ ${tileName(d.tile)}, gieo ${d.die}:`);
}

function sumByPlayer(entries: LogEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    if (e.playerId && e.amount) out.set(e.playerId, (out.get(e.playerId) ?? 0) + e.amount);
  }
  return out;
}

/** Mọi người theo vòng ghế, bắt đầu từ `id`. */
function seatOrder(game: GameState, id: string): PlayerState[] {
  const start = Math.max(
    0,
    game.players.findIndex((p) => p.id === id),
  );
  return game.players.map((_, k) => game.players[(start + k) % game.players.length]!);
}

/**
 * Tách thao tác cuối theo từng lần rút. Nhật ký chỉ ghi tiền của người trả, nên khi có trạng thái
 * trước thao tác thì lần rút cuối lấy chênh lệch tiền thật của mọi người (gồm cả người nhận),
 * trừ phần đã ghi trước nó. Không có trạng thái trước (mới nạp ván) thì dựa vào nhật ký.
 */
function drawResults(game: GameState, previous: GameState | null, draws: Draw[]): DrawResult[] {
  const log = previous ? newEntries(game, previous) : game.log;
  const starts: number[] = [];
  const marked: boolean[] = [];
  let end = log.length;
  for (let k = draws.length - 1; k >= 0; k--) {
    let i = end - 1;
    while (i >= 0 && !isStart(log[i]!, draws[k]!)) i--;
    marked[k] = i >= 0;
    starts[k] = i >= 0 ? i : end;
    end = starts[k]!;
  }
  const segments = draws.map((_, k) =>
    log.slice(starts[k]! + (marked[k] ? 1 : 0), starts[k + 1] ?? log.length),
  );
  const deltas = segments.map((seg, k) =>
    previous ? sumByPlayer(seg) : addCredits(sumByPlayer(seg), game, draws[k]!, seg),
  );
  const last = draws.length - 1;
  if (previous && last >= 0) {
    const earlier = sumByPlayer(log.slice(0, starts[last]));
    const d = new Map<string, number>();
    for (const p of game.players) {
      const was = playerById(previous, p.id)?.cash ?? p.cash;
      const v = p.cash - was - (earlier.get(p.id) ?? 0);
      if (v !== 0) d.set(p.id, v);
    }
    deltas[last] = d;
  }

  return draws.map((d, k) => {
    const money: MoneyRow[] = [];
    for (const p of seatOrder(game, d.playerId)) {
      const delta = deltas[k]!.get(p.id) ?? 0;
      if (delta === 0) continue;
      let after = p.cash;
      for (let j = k + 1; j < draws.length; j++) after -= deltas[j]!.get(p.id) ?? 0;
      money.push({ id: p.id, before: after - delta, after });
    }
    const at = game.events.indexOf(d);
    const next = draws[k + 1];
    const until = next ? game.events.indexOf(next) : game.events.length;
    let from: number | undefined;
    for (let i = at - 1; i >= 0 && from === undefined; i--) {
      const e = game.events[i]!;
      if (e.type === 'move' && e.playerId === d.playerId) from = e.to;
    }
    from ??=
      playerById(previous ?? game, d.playerId)?.position ?? playerById(game, d.playerId)!.position;
    return {
      log: segments[k]!,
      money,
      events: at < 0 ? [] : game.events.slice(at + 1, until < 0 ? undefined : until),
      from,
    };
  });
}

/**
 * Không có trạng thái trước (ván vừa nạp, ví dụ tình huống dev): nhật ký chỉ ghi người trả, nên
 * cộng tiền cho người nhận theo loại thẻ. Ủng hộ người nghèo khi người rút trả thì không đoán được.
 */
function addCredits(
  out: Map<string, number>,
  game: GameState,
  d: Draw,
  entries: LogEntry[],
): Map<string, number> {
  if (d.type !== 'card') return out;
  const card = getCard(d.cardId);
  const e = card.effect;
  const add = (id: string | null | undefined, v: number) => {
    if (id && v) out.set(id, (out.get(id) ?? 0) + v);
  };
  const holder = entries.find((x) => x.text === 'Kẻ khóc người cười kích hoạt')?.playerId;
  for (const x of entries) {
    if (!x.playerId || !x.amount || x.amount > 0) continue;
    const paid = -x.amount;
    if (x.text === 'Kẻ khóc người cười') add(x.playerId === d.playerId ? holder : d.playerId, paid);
    else if (x.text === 'Phạt Thằng Bờm') add(d.playerId, paid);
    else if (x.text !== `Thẻ ${card.title}`) continue;
    else if (x.playerId !== d.playerId) add(d.playerId, paid);
    else if (e.type === 'payEach') {
      for (const o of game.players) {
        if (o.id !== d.playerId && o.status === 'active') add(o.id, e.amount);
      }
    } else if (e.type === 'buildingFee') {
      const u = game.tiles[e.utilityIndex];
      if (u?.owner && !u.mortgaged && u.owner !== d.playerId) {
        add(u.owner, Math.floor((paid * e.ownerPercent) / 100));
      }
    }
  }
  return out;
}

/** Việc kế tiếp sau khi bấm Tiếp tục: lần rút sau, hoặc việc ván đang chờ. */
function nextText(game: GameState, draws: Draw[], k: number, online: boolean): string {
  const next = draws[k + 1];
  if (next) {
    const name = playerById(game, next.playerId)?.name ?? '';
    return next.type === 'card'
      ? `${name} rút tiếp thẻ ${DECK_NAME[getCard(next.cardId).deck]}.`
      : `${name} gieo xúc xắc Cao tốc.`;
  }
  const pd = game.pending;
  const name = 'playerId' in pd ? (playerById(game, pd.playerId)?.name ?? '') : '';
  switch (pd.type) {
    case 'cardDice':
      return pd.dice === null
        ? `${name} cần bấm Sục xúc xắc thẻ.`
        : `${name} cần xác nhận kết quả xúc xắc.`;
    case 'buy': {
      const t = BOARD[pd.tile]!;
      const price = 'price' in t ? ` (${money(t.price)})` : '';
      return `${name} quyết định có mua ${t.name}${price} không.`;
    }
    case 'upgrade':
      return pd.mode === 'build'
        ? `${name} quyết định có nâng cấp ${tileName(pd.tile)} không.`
        : `${name} quyết định có chuộc ${tileName(pd.tile)} không.`;
    case 'pay': {
      const p = playerById(game, pd.playerId)!;
      if (p.cash < pd.total) {
        return p.id !== game.players[game.current]!.id && !online
          ? `Chuyển máy cho ${p.name}: ${p.name} thiếu tiền trả ${money(pd.total)}, vào Xử lý nợ.`
          : `${p.name} thiếu tiền trả ${money(pd.total)}: vào Xử lý nợ.`;
      }
      if (pd.reason === 'tax') return `${p.name} bấm “Là nó” để nộp ${money(pd.total)}.`;
      const to = pd.creditors.map((c) => playerById(game, c.playerId)?.name ?? 'Ngân hàng');
      return `${p.name} bấm “Trả tiền” ${money(pd.total)} cho ${to.join(', ')}.`;
    }
    case 'chooseTile':
      if (pd.purpose === 'highway') return `${name} chọn 1 trong 22 đất màu để mở cao tốc.`;
      return pd.purpose === 'gambleUp'
        ? `${name} chọn một đất được nâng miễn phí 1 cấp.`
        : `${name} chọn một đất bị hạ 1 cấp.`;
    case 'metro':
      return `${name} chọn ở lại hay đi Metro.`;
    case 'roll':
      return pd.playerId === draws[k]?.playerId
        ? `${name} được đổ thêm vì vừa đổ đôi.`
        : `Hết lượt. Tới lượt ${name}.`;
    case 'jail':
      return `Hết lượt. Tới lượt ${name} (đang ở tù).`;
    case 'jailRelease':
      return `${name} trả 50Đ hoặc dùng thẻ ra tù.`;
    case 'ended':
      return 'Ván đã kết thúc.';
  }
}

// ---------------------------------------------------------------------------
// Các phần của màn
// ---------------------------------------------------------------------------

function Who({ p, size = 22 }: { p: PlayerState; size?: number }) {
  return (
    <span className="draw-who">
      <TokenIcon icon={p.icon} color={p.color} size={size} />
      <b style={{ color: colorOf(p.color).main }}>{p.name}</b>
    </span>
  );
}

/** Dòng nhật ký đã có phần hiển thị riêng ở trên nên không lặp lại trong Kết quả. */
const SHOWN_ABOVE = [
  /^Gieo \d \+ \d$/,
  /^Gieo \d \+ \d, trả /,
  /^Xổ số ra /,
  /^Tàu bay: /,
  /^Thằng Bờm: /,
  /^Đổi .+ lấy /,
  /^Cháy /,
  /^Đếm \d+ ô /,
  /^Qua ô Bắt Đầu$/,
];

function ResultBox({
  game,
  result,
  card,
  drawer,
  jailShown = false,
}: {
  game: GameState;
  result: DrawResult;
  card: Card | null;
  drawer: PlayerState;
  /** Phần Di chuyển đã ghi "Bị giam" nên bỏ dòng "Vào tù". */
  jailShown?: boolean;
}) {
  const notes = result.log.filter(
    (e) =>
      !SHOWN_ABOVE.some((re) => re.test(e.text)) &&
      !(jailShown && e.text === 'Vào tù') &&
      (!card || (e.text !== card.title && e.text !== `Thẻ ${card.title}`)),
  );
  const held = card ? drawer.heldCards.some((h) => h.cardId === card.id) : false;
  // Không ai đổi tiền và không có gì thêm: phần trên đã đủ, bỏ hẳn khung Kết quả.
  if (result.money.length === 0 && notes.length === 0 && !held) return null;
  return (
    <section className="draw-result" aria-label="Kết quả">
      <h4 className="eyebrow">Kết quả</h4>
      {result.money.length > 0 && (
        <ul className="draw-money">
          {result.money.map((m) => {
            const p = playerById(game, m.id)!;
            const delta = m.after - m.before;
            return (
              <li key={m.id} style={{ background: colorOf(p.color).soft }}>
                <Who p={p} />
                <span className="draw-money-flow">
                  {money(m.before)} <span aria-hidden="true">→</span> {money(m.after)}
                </span>
                <b className={delta > 0 ? 'up' : 'down'}>{signed(delta)}</b>
              </li>
            );
          })}
        </ul>
      )}
      {(notes.length > 0 || held) && (
        <ul className="draw-notes">
          {held && (
            <li>
              <span>
                <b style={{ color: colorOf(drawer.color).main }}>{drawer.name}</b> giữ thẻ này đến
                khi dùng (đang giữ {drawer.heldCards.length} thẻ).
              </span>
            </li>
          )}
          {notes.map((e, i) => {
            const p = playerById(game, e.playerId);
            return (
              <li key={i}>
                <span>
                  {p && <b style={{ color: colorOf(p.color).main }}>{p.name}</b>} {e.text}
                </span>
                {e.amount ? (
                  <b className={e.amount > 0 ? 'up' : 'down'}>{signed(e.amount)}</b>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Route({ moves, jailed }: { moves: MoveEvent[]; jailed: boolean }) {
  return (
    <section className="draw-route" aria-label="Di chuyển">
      <h4 className="eyebrow">Di chuyển</h4>
      <ul>
        {moves.map((m, i) => (
          <li key={i}>
            <span>{numbered(m.from)}</span>
            <span aria-hidden="true" className="draw-arrow">
              →
            </span>
            <b>{numbered(m.to)}</b>
            {m.passedGo && <span className="draw-chip up">+{GO_REWARD}Đ qua Xuất phát</span>}
          </li>
        ))}
      </ul>
      {jailed && <p className="draw-chip down">Bị giam, không nhận {GO_REWARD}Đ</p>}
    </section>
  );
}

interface DetailProps {
  game: GameState;
  card: Card;
  detail: CardDetail;
  drawer: PlayerState;
  result: DrawResult;
}

/** Cách tính tiền của vài thẻ tính theo tài sản hoặc tiền mặt, để người chơi tự kiểm. */
function Explain({
  game,
  card,
  drawer,
  result,
}: {
  game: GameState;
  card: Card;
  drawer: PlayerState;
  result: DrawResult;
}) {
  const e = card.effect;
  const mine = result.money.find((m) => m.id === drawer.id);
  let text: ReactNode = null;
  if (e.type === 'buildingFee') {
    let houses = 0;
    let hotels = 0;
    game.tiles.forEach((t, i) => {
      if (t?.owner !== drawer.id || BOARD[i]!.kind !== 'property') return;
      if (t.level === HOTEL_LEVEL) hotels += 1;
      else houses += t.level;
    });
    const total = houses * e.perHouse + hotels * e.perHotel;
    const u = game.tiles[e.utilityIndex];
    const owner = u && !u.mortgaged ? playerById(game, u.owner) : undefined;
    const share = owner ? Math.floor((total * e.ownerPercent) / 100) : 0;
    text = (
      <>
        {houses} nhà × {money(e.perHouse)} + {hotels} khách sạn × {money(e.perHotel)} ={' '}
        <b>{money(total)}</b>.{' '}
        {total === 0
          ? `${drawer.name} không có công trình nên không phải trả.`
          : !owner
            ? `${tileName(e.utilityIndex)} không có chủ đang hoạt động: trả hết cho Ngân hàng.`
            : owner.id === drawer.id
              ? `${drawer.name} là chủ ${tileName(e.utilityIndex)}: phần ${e.ownerPercent}% (${money(share)}) không phải trả, còn ${money(total - share)} trả Ngân hàng.`
              : `${owner.name} (chủ ${tileName(e.utilityIndex)}) nhận ${e.ownerPercent}% = ${money(share)}, Ngân hàng nhận ${money(total - share)}.`}
      </>
    );
  } else if (e.type === 'payPerStation') {
    const n = game.tiles.filter(
      (t, i) => t?.owner === drawer.id && !t.mortgaged && BOARD[i]!.kind === 'station',
    ).length;
    text = `${drawer.name} có ${n} ga đang hoạt động: trả ${money(e.amounts[n] ?? 0)}.`;
  } else if (e.type === 'cashBrackets' && mine) {
    text = `Tiền mặt lúc rút ${money(mine.before)}: nhận ${money(mine.after - mine.before)}.`;
  } else if (e.type === 'helpThePoor') {
    const poorest = result.money
      .filter((m) => m.id !== drawer.id && m.after > m.before)
      .map((m) => playerById(game, m.id)!.name);
    text =
      mine && mine.after > mine.before
        ? `${drawer.name} ít tiền mặt nhất: mỗi người trả ${money(e.collectFromEach)}.`
        : poorest.length > 0
          ? `Ít tiền mặt nhất: ${poorest.join(', ')}. ${drawer.name} trả ${money(e.payToPoorest)}${poorest.length > 1 ? ', chia đều, phần lẻ cho Ngân hàng' : ''}.`
          : null;
  }
  return text ? <p className="draw-explain">{text}</p> : null;
}

function DetailView(props: DetailProps) {
  switch (props.detail.kind) {
    case 'dice':
      return <DiceDetail {...props} dice={props.detail.dice} />;
    case 'fire':
      return <FireDetail {...props} detail={props.detail} />;
    case 'restructure':
      return <RestructureDetail {...props} detail={props.detail} />;
    case 'swap':
      return <SwapDetail {...props} detail={props.detail} />;
    case 'gamble':
      return <GambleDetail {...props} detail={props.detail} />;
  }
}

/** Xúc xắc thẻ tự gieo: Xổ số, Tàu bay, khoản 10 × xúc xắc của Đất/Ga gần nhất. */
function DiceDetail({ game, card, drawer, result, dice }: DetailProps & { dice: number[] }) {
  const color = colorOf(drawer.color).main;
  const e = card.effect;
  if (e.type === 'lottery') {
    const d = dice[0] as 1 | 2 | 3 | 4 | 5 | 6;
    const groups = new Map<number, number[]>();
    for (const face of [1, 2, 3, 4, 5, 6] as const) {
      groups.set(e.payouts[face], [...(groups.get(e.payouts[face]) ?? []), face]);
    }
    return (
      <section className="draw-detail">
        <DiceLine dice={dice} color={color}>
          <b>Ra {d}</b>
          <span>Nhận {money(e.payouts[d])} từ Ngân hàng</span>
        </DiceLine>
        <ul className="draw-table" style={{ ['--cols' as string]: groups.size }}>
          {[...groups].map(([amount, faces]) => (
            <li key={amount} className={faces.includes(d) ? 'is-hit' : undefined}>
              <span>{faces.join(' hoặc ')}</span>
              <b>{money(amount)}</b>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (e.type === 'flyDice') {
    const moves = result.events.filter(
      (x): x is MoveEvent => x.type === 'move' && x.playerId === drawer.id,
    );
    const lastMove = moves[dice.length - 1];
    return (
      <section className="draw-detail">
        <DiceLine dice={dice} color={color}>
          <b>
            Ra {dice[0]} và {dice[1]}
          </b>
          <span>Viên chẵn tiến, viên lẻ lùi</span>
        </DiceLine>
        <ol className="draw-steps">
          {dice.map((d, i) => {
            const m = moves[i];
            return (
              <li key={i}>
                <span className="draw-step-head">
                  Viên {i + 1} ra {d}: {d % 2 === 0 ? 'tiến' : 'lùi'} {d} ô
                </span>
                {m && (
                  <span className="draw-step-route">
                    {numbered(m.from)} <span aria-hidden="true">→</span> <b>{numbered(m.to)}</b>
                    {m.passedGo && <span className="draw-chip up">+{GO_REWARD}Đ</span>}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {lastMove && (
          <p className="draw-detail-note">
            Chỉ xử lý ô cuối: <b>{numbered(lastMove.to)}</b>
          </p>
        )}
      </section>
    );
  }
  // Đất gần nhất / Đến ga gần nhất rơi vào ô của người khác.
  const mult = e.type === 'advanceToNearest' ? e.diceMultiplier : 1;
  const sum = dice.reduce((a, b) => a + b, 0);
  const tile = drawer.position;
  const owner = playerById(game, game.tiles[tile]?.owner);
  return (
    <section className="draw-detail">
      <DiceLine dice={dice} color={color}>
        <b>
          Gieo {dice.join(' + ')} = {sum}
        </b>
        <span>
          Trả {mult} × {sum} = <b>{money(mult * sum)}</b>
          {owner ? ` cho ${owner.name}` : ''}
        </span>
      </DiceLine>
      <p className="draw-detail-note">
        {numbered(tile)} {owner ? `của ${owner.name}` : ''} đang hoạt động: thay tiền thuê bằng{' '}
        {mult} × tổng 2 viên mới.
      </p>
      {drawer.heldCards.some((h) => h.kind === 'rentWaiver') && (
        <p className="draw-detail-note">
          Thẻ Miễn thuế nhà đất của {drawer.name} không dùng cho khoản này (khoản của thẻ, không
          phải tiền thuê), vẫn giữ lại.
        </p>
      )}
    </section>
  );
}

function DiceLine({
  dice,
  color,
  children,
}: {
  dice: number[];
  color: string;
  children: ReactNode;
}) {
  return (
    <div className="draw-dice">
      <Dice values={dice} color={color} size={40} rolling />
      <div className="draw-dice-text">{children}</div>
    </div>
  );
}

/** Cháy nhà hàng xóm: mỗi người gieo 2 viên, cộng lại, đếm từ chỗ người rút. */
function FireDetail({
  game,
  drawer,
  result,
  detail,
}: DetailProps & { detail: Extract<CardDetail, { kind: 'fire' }> }) {
  const sums = detail.rolls.map((r) => r.dice[0] + r.dice[1]);
  const tile = BOARD[detail.target]!;
  const st = game.tiles[detail.target];
  const owner = playerById(game, st?.owner);
  const miss =
    tile.kind !== 'property'
      ? `${tile.name} không phải đất màu nên không có tác dụng.`
      : `${tile.name} không có nhà nên không có tác dụng.`;
  // Kết quả lên trước để thấy ngay không phải cuộn; cách tính ở dưới.
  return (
    <section className="draw-detail">
      <div className={`draw-burn ${detail.hit ? 'is-hit' : 'is-miss'}`}>
        <span className="eyebrow">{detail.hit ? 'Mảnh đất bị cháy' : 'Không cháy'}</span>
        <div className="draw-burn-main">
          <b>{tile.name}</b>
          {detail.hit && st && (
            <b className="draw-burn-level">
              {levelText(st.level + 1)} <span aria-hidden="true">→</span> {levelText(st.level)}
            </b>
          )}
        </div>
        <p>
          {detail.hit
            ? `${owner ? `Của ${owner.name} · ` : ''}hạ một cấp, không hoàn tiền xây.`
            : miss}
        </p>
      </div>
      <div className="draw-head-row">
        <h4 className="eyebrow">
          {detail.rolls.length} / {detail.rolls.length} người đã gieo
        </h4>
        <span className="draw-pill">Chỉ cháy 1 mảnh đất</span>
      </div>
      <ul className="draw-grid">
        {detail.rolls.map((r) => {
          const p = playerById(game, r.playerId)!;
          return (
            <li key={r.playerId} style={{ background: colorOf(p.color).soft }}>
              <Who p={p} />
              <span className="draw-grid-value">
                {r.dice[0]} + {r.dice[1]} = <b>{r.dice[0] + r.dice[1]}</b>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="draw-sum box box-amber">
        <span className="eyebrow">Tổng xúc xắc cả bàn</span>
        <p className="draw-sum-formula">
          {sums.join(' + ')} = <b className="draw-sum-total">{detail.total} ô</b>
        </p>
        <p className="draw-sum-note">
          Từ ô {numbered(result.from)} của {drawer.name} đếm {detail.total} ô{' '}
          <span aria-hidden="true">→</span> <b className="nowrap">{numbered(detail.target)}</b>
        </p>
      </div>
      <p className="draw-detail-note">Không ai di chuyển.</p>
    </section>
  );
}

/** Ngân hàng tái cơ cấu: tiền người rút thành phần nguyên trung bình tiền của mọi người. */
function RestructureDetail({
  game,
  drawer,
  detail,
}: DetailProps & { detail: Extract<CardDetail, { kind: 'restructure' }> }) {
  const cash = detail.cash.map((c) => c.cash);
  const total = cash.reduce((a, b) => a + b, 0);
  const n = cash.length;
  const change = detail.average - detail.before;
  return (
    <section className="draw-detail">
      <h4 className="eyebrow">Tiền mặt lúc rút thẻ</h4>
      <ul className="draw-grid">
        {detail.cash.map((c) => {
          const p = playerById(game, c.playerId)!;
          return (
            <li key={c.playerId} style={{ background: colorOf(p.color).soft }}>
              <Who p={p} />
              <b className="draw-grid-value" style={{ color: colorOf(p.color).main }}>
                {money(c.cash)}
              </b>
            </li>
          );
        })}
      </ul>
      <div className="draw-sum box box-blue">
        <span className="eyebrow">Tiền trung bình</span>
        <p className="draw-sum-formula">
          ({cash.slice(0, -1).map((v) => `${v} + `)}
          <span className="nowrap">
            {cash.at(-1)}) ÷ {n}
          </span>
        </p>
        <p className="draw-sum-result">
          = <b className="draw-sum-total">{money(detail.average)}</b>
        </p>
        {total % n !== 0 && (
          <p className="draw-sum-note">
            {total} ÷ {n} = {decimal(total / n)}, lấy phần nguyên.
          </p>
        )}
        <p className="draw-sum-note">
          {change < 0 ? (
            <>
              Ngân hàng trừ đúng <b className="down">{money(-change)}</b> của {drawer.name}.
            </>
          ) : change > 0 ? (
            <>
              Ngân hàng cộng thêm <b className="up">{money(change)}</b> cho {drawer.name}.
            </>
          ) : (
            <>Tiền của {drawer.name} đúng bằng trung bình, không đổi.</>
          )}{' '}
          Người chơi khác giữ nguyên tiền.
        </p>
      </div>
    </section>
  );
}

/** Thằng Bờm: viên 1 chọn đối thủ theo vòng ghế, viên 2 quyết định đổi gì. */
function SwapDetail({
  game,
  card,
  drawer,
  detail,
}: DetailProps & { detail: Extract<CardDetail, { kind: 'swap' }> }) {
  const opponents = seatOrder(game, drawer.id).filter(
    (p) => p.id !== drawer.id && p.status === 'active',
  );
  const opp = playerById(game, detail.opponentId)!;
  const d1 = detail.die1.at(-1)!;
  const rerolls = detail.die1.slice(0, -1);
  const even = detail.die2 % 2 === 0;
  const penalty = card.effect.type === 'swapProperty' ? card.effect.penalty : 0;
  const color = colorOf(drawer.color).main;
  // Kết quả lên trước để thấy ngay không phải cuộn; xúc xắc và vòng ghế ở dưới.
  return (
    <section className="draw-detail">
      {detail.mine !== null && detail.theirs !== null ? (
        <>
          <h4 className="eyebrow">Tài sản đã đổi</h4>
          <div className="draw-pair">
            <SwapAsset game={game} giver={drawer} tile={detail.mine} />
            <SwapAsset game={game} giver={opp} tile={detail.theirs} />
          </div>
          <p className="draw-detail-note">
            {drawer.name} nhận {tileName(detail.theirs)} · {opp.name} nhận {tileName(detail.mine)}.
            Cấp nhà và trạng thái cắm giữ nguyên.
          </p>
        </>
      ) : (
        <div className="draw-verdict box box-red">
          <b>Thiếu tài sản, không đổi</b>
          <span>
            {detail.mine === null && `${drawer.name} không có đất màu. `}
            {detail.theirs === null &&
              `${opp.name} không có ${even ? 'đất màu' : 'ga hoặc nhà máy'}. `}
          </span>
          <span>
            {opp.name} trả {drawer.name} {money(penalty)}.
          </span>
        </div>
      )}
      <div className="draw-pair">
        <div className="draw-dice">
          <Dice values={[d1]} color={color} size={36} rolling />
          <div className="draw-dice-text">
            {rerolls.length > 0 && (
              <span className="muted">
                {rerolls.length > 1 ? 'Các lần trước' : 'Lần đầu'} ra {rerolls.join(', ')} (lớn hơn{' '}
                {opponents.length}) nên gieo lại
              </span>
            )}
            <b>Viên 1 = {d1}</b>
            <span>Đối thủ: {opp.name}</span>
          </div>
        </div>
        <div className="draw-dice">
          <Dice values={[detail.die2]} color={color} size={36} rolling />
          <div className="draw-dice-text">
            <b>Viên 2 = {detail.die2}</b>
            <span>{even ? 'Chẵn: đổi đất màu rẻ nhất' : 'Lẻ: lấy ga / nhà máy'}</span>
          </div>
        </div>
      </div>
      <div className="draw-seats box box-purple">
        <span className="eyebrow">Gán số người còn lại</span>
        <ol>
          {opponents.map((p, i) => (
            <li key={p.id} className={p.id === opp.id ? 'is-picked' : undefined}>
              <span className="draw-seat-num">{i + 1}</span>
              <TokenIcon icon={p.icon} color={p.color} size={24} />
              <span className="draw-seat-name">{p.name}</span>
            </li>
          ))}
        </ol>
        {opponents.length < 6 && (
          <p className="draw-sum-note">
            Ra {opponents.length + 1 === 6 ? '6' : `${opponents.length + 1}–6`} thì gieo lại viên 1.
          </p>
        )}
      </div>
    </section>
  );
}

function SwapAsset({ game, giver, tile }: { game: GameState; giver: PlayerState; tile: number }) {
  const t = BOARD[tile]!;
  const st = game.tiles[tile];
  const c = colorOf(giver.color);
  const kind = t.kind === 'station' ? 'Ga tàu' : t.kind === 'utility' ? 'Nhà máy' : null;
  return (
    <div className="draw-asset" style={{ background: c.soft, borderColor: c.main }}>
      <span className="draw-asset-who" style={{ color: c.main }}>
        <TokenIcon icon={giver.icon} color={giver.color} size={22} />
        {giver.name} đưa
      </span>
      <b className="draw-asset-name">{t.name}</b>
      <span className="draw-asset-sub">
        Giá mua {'price' in t ? money(t.price) : ''} · {kind ?? levelText(st?.level ?? 0)}
        {st?.mortgaged ? ' · đang cắm' : ''}
      </span>
    </div>
  );
}

/** Canh bạc xây dựng: số đất màu của mình so với trung bình của cả bàn. */
function GambleDetail({
  game,
  drawer,
  result,
  detail,
}: DetailProps & { detail: Extract<CardDetail, { kind: 'gamble' }> }) {
  const actives = game.players.filter((p) => p.status === 'active').length;
  const total = Math.round(detail.average * actives);
  const verdict =
    detail.mine < detail.average
      ? 'Ít hơn trung bình: được nâng miễn phí 1 cấp ở một đất của mình đang hoạt động, chưa có khách sạn.'
      : detail.mine > detail.average
        ? 'Nhiều hơn trung bình: phải hạ 1 cấp một đất có công trình của mình, không hoàn tiền.'
        : 'Bằng trung bình: không đổi.';
  const none = result.log.some((e) => e.text.startsWith('Không có đất hợp lệ'));
  return (
    <section className="draw-detail">
      <div className="draw-compare box box-amber">
        <div>
          <span className="eyebrow">Đất màu của {drawer.name}</span>
          <b className="money-big">{detail.mine}</b>
        </div>
        <span className="draw-compare-sign" aria-hidden="true">
          {detail.mine < detail.average ? '<' : detail.mine > detail.average ? '>' : '='}
        </span>
        <div className="right">
          <span className="eyebrow">Trung bình</span>
          <b className="money-big">{decimal(detail.average)}</b>
          <span className="draw-sum-note">
            {total} đất ÷ {actives} người
          </span>
        </div>
      </div>
      <p
        className={`draw-verdict ${detail.mine < detail.average ? 'box box-teal' : detail.mine > detail.average ? 'box box-red' : 'box'}`}
      >
        {verdict}
        {none && detail.mine !== detail.average ? ' Không có đất hợp lệ nên không đổi.' : ''}
      </p>
    </section>
  );
}

/** Kết quả viên xúc xắc Cao tốc: ô đã chọn, số bước và ô đến. */
function HighwayView({
  game,
  event,
  drawer,
}: {
  game: GameState;
  event: HighwayEvent;
  drawer: PlayerState;
}) {
  const steps = HIGHWAY_STEPS[event.die as 1 | 2 | 3 | 4 | 5 | 6];
  const outcomes = new Map<number, number[]>();
  for (const face of [1, 2, 3, 4, 5, 6] as const) {
    outcomes.set(HIGHWAY_STEPS[face], [...(outcomes.get(HIGHWAY_STEPS[face]) ?? []), face]);
  }
  const to = BOARD[event.to]!;
  const owner = playerById(game, game.tiles[event.to]?.owner);
  return (
    <>
      <div className="draw-stage">
        <div className="draw-card draw-card-community draw-highway">
          <span className="draw-card-deck">Mở đường cao tốc</span>
          <div className="draw-dice">
            <Dice values={[event.die]} color={colorOf(drawer.color).main} size={52} rolling />
            <div className="draw-dice-text">
              <b className="draw-highway-roll">Ra {event.die}</b>
              <span>
                {steps > 0
                  ? `Tiến ${steps} ô từ ${tileName(event.tile)}`
                  : `Đứng tại ô đã chọn: ${tileName(event.tile)}`}
              </span>
            </div>
          </div>
        </div>
      </div>
      <ul className="draw-table" style={{ ['--cols' as string]: outcomes.size }}>
        {[...outcomes].map(([n, faces]) => (
          <li key={n} className={faces.includes(event.die) ? 'is-hit' : undefined}>
            <span>{faces.join(' · ')}</span>
            <b>{n > 0 ? `${n} bước` : 'tại ô chọn'}</b>
          </li>
        ))}
      </ul>
      <section className="draw-route" aria-label="Đích">
        <h4 className="eyebrow">Đích</h4>
        <ul>
          <li>
            <span>{numbered(event.tile)}</span>
            <span aria-hidden="true" className="draw-arrow">
              →
            </span>
            <b>{numbered(event.to)}</b>
          </li>
        </ul>
        <p className="draw-detail-note">
          {to.name}
          {owner ? ` · của ${owner.name}` : ''}. Không nhận {GO_REWARD}Đ trong hành trình này.
        </p>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Hình nhỏ
// ---------------------------------------------------------------------------

function StarGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.6l2.8 5.8 6.3.8-4.6 4.4 1.2 6.3L12 16.9l-5.7 3 1.2-6.3-4.6-4.4 6.3-.8z"
        fill="currentColor"
      />
    </svg>
  );
}

function GiftGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <rect x="4" y="10" width="16" height="10.5" rx="2" />
      <rect x="3" y="7" width="18" height="4" rx="1.4" />
      <path d="M12 7v13.5" stroke="#fff" strokeWidth="2" />
      <path d="M12 7C10.3 3.8 6.6 3.7 7.1 5.8 7.4 7 9.9 7 12 7zm0 0c1.7-3.2 5.4-3.3 4.9-1.2-.3 1.2-2.8 1.2-4.9 1.2z" />
    </svg>
  );
}

function RoadGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M8.5 3 4.5 21M15.5 3l4 18" />
      <path d="M12 4v3M12 10.5v3M12 17v3" />
    </svg>
  );
}
