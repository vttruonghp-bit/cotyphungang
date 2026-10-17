import { useState } from 'react';
import {
  CHANCE_CARDS,
  COMMUNITY_CARDS,
  type Card,
  type DeckKind,
  type GameState,
} from '@cotiphu/shared';
import './card-list-panel.css';

/** Các lá đã bốc (không còn trong chồng) từ lần xáo gần nhất. */
function drawnIds(game: GameState, deck: DeckKind, all: readonly Card[]): Set<string> {
  if (game.drawnCards) return new Set(game.drawnCards[deck]);
  const left = new Set(game.decks[deck]);
  return new Set(all.filter((c) => !left.has(c.id)).map((c) => c.id));
}

/** Hai cột tên lá Cơ Hội / Khí Vận theo thứ tự luật; lá đã bốc bị gạch ngang. */
export function CardListPanel({ game }: { game: GameState }) {
  const [open, setOpen] = useState<string | null>(null);
  const column = (deck: DeckKind, title: string, cards: readonly Card[]) => {
    const drawn = drawnIds(game, deck, cards);
    return (
      <div className={`card-list-col card-list-${deck}`}>
        <h3>{title}</h3>
        <ol>
          {cards.map((c) => (
            <li key={c.id} className="card-list-item">
              <button
                type="button"
                className={drawn.has(c.id) ? 'is-drawn' : ''}
                aria-expanded={open === c.id}
                onClick={() => setOpen((v) => (v === c.id ? null : c.id))}
              >
                {c.title}
              </button>
              {open === c.id && (
                <div className="card-list-tip" role="tooltip">
                  <strong>{c.title}</strong>
                  <span>{c.description}</span>
                  {drawn.has(c.id) && <em>Đã bốc</em>}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  };
  return (
    <div className="card-list-panel" aria-label="Danh sách thẻ Cơ Hội và Khí Vận">
      {column('chance', 'Cơ Hội', CHANCE_CARDS)}
      {column('community', 'Khí Vận', COMMUNITY_CARDS)}
    </div>
  );
}
