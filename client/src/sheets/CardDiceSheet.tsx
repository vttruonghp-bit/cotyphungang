import { BOARD, getCard, type GameState, type Pending } from '@cotiphu/shared';
import { Dice } from '../components/Dice';
import { Sheet } from '../components/Sheet';
import { money } from '../game/format';
import { colorOf } from '../theme';

type CardDicePending = Extract<Pending, { type: 'cardDice' }>;

interface Props {
  game: GameState;
  pending: CardDicePending;
  enabled: boolean;
  onRoll: () => void;
  onConfirm: () => void;
}

function interpretation(game: GameState, pd: CardDicePending): string {
  const dice = pd.dice;
  if (!dice || dice.length === 0) return 'Bấm Sục để máy chủ gieo xúc xắc.';
  const effect = getCard(pd.cardId).effect;
  if (pd.highwayTile !== undefined && effect.type === 'highway') {
    const steps = effect.stepsByDie[dice[0] as 1 | 2 | 3 | 4 | 5 | 6];
    const to = (pd.highwayTile + steps) % BOARD.length;
    return `Gieo ${dice[0]} → ${steps === 0 ? 'đứng yên' : `đi ${steps} ô`} → ${BOARD[to]!.name}. Chỉ di chuyển khi xác nhận.`;
  }
  if (effect.type === 'lottery') {
    const reward = effect.payouts[dice[0] as 1 | 2 | 3 | 4 | 5 | 6];
    return `Ra ${dice[0]} → thưởng ${money(reward)}. Chỉ cộng tiền khi xác nhận.`;
  }
  if (effect.type === 'flyDice') {
    return dice.map((d, i) => `Viên ${i + 1}: ${d} → ${d % 2 === 0 ? 'tiến' : 'lùi'} ${d} ô`).join(' · ');
  }
  if (effect.type === 'advanceToNearest') {
    return `Gieo ${dice.join(' + ')} = ${dice.reduce((a, d) => a + d, 0)}; nếu ô thuộc người khác, trả ${effect.diceMultiplier} × tổng xúc xắc.`;
  }
  if (effect.type === 'neighborFire') {
    const total = dice.reduce((a, d) => a + d, 0);
    return `Các lượt gieo: ${dice.join(', ')}. Tổng ${total} ô; hiệu ứng cháy chỉ xảy ra khi xác nhận.`;
  }
  if (effect.type === 'swapProperty') {
    return `Viên chọn đối thủ: ${dice.slice(0, -1).join(' → ')}; viên quyết định trao đổi: ${dice.at(-1)} (${dice.at(-1)! % 2 === 0 ? 'chẵn: đất màu' : 'lẻ: ga/nhà máy'}). Xác nhận mới đổi tài sản.`;
  }
  return 'Xác nhận để thực hiện hiệu ứng của thẻ.';
}

/** The dice and the result are public, but only the drawer may roll/confirm. */
export function CardDiceSheet({ game, pending, enabled, onRoll, onConfirm }: Props) {
  const card = getCard(pending.cardId);
  const drawer = game.players.find((p) => p.id === pending.playerId)!;
  const rolled = pending.dice !== null;
  const dice = pending.dice ?? [];
  const color = colorOf(drawer.color).main;
  return (
    <Sheet
      game={game}
      title={`${card.deck === 'chance' ? 'Cơ Hội' : 'Khí Vận'} · Sục xúc xắc`}
      subtitle={`${drawer.name} · ${card.title}`}
      label={`Gieo xúc xắc cho thẻ ${card.title}`}
      footer={
        <div className="btn-row">
          <button className="btn btn-outline" type="button" disabled={!enabled || rolled} onClick={onRoll}>🎲 Sục</button>
          <button className="btn btn-grow btn-teal" type="button" disabled={!enabled || !rolled} onClick={onConfirm}>✓ Xác nhận kết quả</button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 8 }}>
        <strong style={{ fontSize: 22 }}>{card.title}</strong>
        <p>{card.description}</p>
        {rolled && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Dice values={dice.length <= 2 ? dice : dice.slice(0, 2)} color={color} size={56} />
          {dice.length > 2 && <strong>Tất cả xúc xắc: {dice.join(' · ')}</strong>}
        </div>}
        <div className="box" style={{ padding: 14, fontWeight: 800, fontSize: 15, lineHeight: 1.5 }}>
          {interpretation(game, pending)}
        </div>
        {!enabled && <p className="muted">Đang chờ {drawer.name} thực hiện thao tác.</p>}
      </div>
    </Sheet>
  );
}
