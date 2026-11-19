import { describe, expect, it } from 'vitest';
import { act, cash, newGame, own, roll, setPlayer, topCard, reject } from './helpers';

/** Thẻ không cần xúc xắc dừng ở bước Xác nhận; thẻ cần xúc xắc đi thẳng vào bước Sục. */
const drawPick = (s: ReturnType<typeof newGame>) => {
  if (s.pending.type !== 'drawCard') return s;
  return act(s, { type: 'drawCard', playerId: s.pending.playerId });
};

describe('Card is shown on landing and applied only after Xác nhận', () => {
  it('landing on Cơ Hội reveals the card but changes nothing until confirmed', () => {
    let s = newGame();
    s.stagedDiceCards = true;
    topCard(s, 'chance-go');
    const before = s.decks.chance.length;
    s = roll(s, 3, 4);
    expect(s.pending).toMatchObject({
      type: 'drawCard',
      playerId: 'a',
      deck: 'chance',
      cardId: 'chance-go',
    });
    expect(s.decks.chance.length).toBe(before - 1);
    expect(s.events.some((e) => e.type === 'card')).toBe(false);
    expect(s.players[0]!.position).toBe(7);
    expect(cash(s, 'a')).toBe(500);
    expect(reject(s, { type: 'drawCard', playerId: 'b' })).toBe('Chưa tới lượt bạn');
    s = act(s, { type: 'drawCard', playerId: 'a' });
    expect(s.decks.chance.length).toBe(before - 1);
    expect(s.events.some((e) => e.type === 'card' && e.cardId === 'chance-go')).toBe(true);
    expect(s.players[0]!.position).toBe(0);
  });

  it('a dice card goes straight to Sục, without a separate confirm', () => {
    let s = newGame();
    s.stagedDiceCards = true;
    topCard(s, 'chance-lottery');
    const before = s.decks.chance.length;
    s = roll(s, 3, 4);
    expect(s.pending).toMatchObject({ type: 'cardDice', cardId: 'chance-lottery', dice: null });
    expect(s.decks.chance.length).toBe(before - 1);
    expect(cash(s, 'a')).toBe(500);
  });

  it('timeout confirms the revealed card for the player', () => {
    let s = newGame();
    s.stagedDiceCards = true;
    topCard(s, 'chance-go');
    s = roll(s, 3, 4);
    s = act(s, { type: 'timeout' });
    expect(s.events.some((e) => e.type === 'card' && e.cardId === 'chance-go')).toBe(true);
  });
});

describe('Card dice are rolled and confirmed before effects in live games', () => {
  it('lottery requires the actual drawer to roll and confirm before receiving a prize', () => {
    let s = newGame();
    s.stagedDiceCards = true;
    topCard(s, 'chance-lottery');
    s = roll(s, 3, 4);
    s = drawPick(s);
    expect(s.pending).toMatchObject({
      type: 'cardDice',
      playerId: 'a',
      cardId: 'chance-lottery',
      dice: null,
    });
    expect(cash(s, 'a')).toBe(500);
    expect(reject(s, { type: 'confirmCardDice', playerId: 'a' })).toBe(
      'Phải bấm Sục trước khi xác nhận',
    );
    expect(reject(s, { type: 'rollCardDice', playerId: 'b' })).toBe('Chưa tới lượt bạn');
    s = act(s, { type: 'rollCardDice', playerId: 'a' }, [3]);
    expect(s.pending).toMatchObject({ type: 'cardDice', dice: [3] });
    expect(cash(s, 'a')).toBe(500);
    s = act(s, { type: 'confirmCardDice', playerId: 'a' });
    expect(cash(s, 'a')).toBeGreaterThan(500);
    expect(s.events.some((e) => e.type === 'card' && e.cardId === 'chance-lottery')).toBe(true);
  });

  it('nearest-property card does not move or charge until confirmation', () => {
    let s = newGame();
    s.stagedDiceCards = true;
    own(s, 'b', 8);
    topCard(s, 'chance-nearest-property');
    s = roll(s, 3, 4);
    s = drawPick(s);
    expect(s.pending.type).toBe('cardDice');
    expect(s.players[0]!.position).toBe(7);
    s = act(s, { type: 'rollCardDice', playerId: 'a' }, [2, 3]);
    expect(s.players[0]!.position).toBe(7);
    expect(cash(s, 'a')).toBe(500);
    s = act(s, { type: 'confirmCardDice', playerId: 'a' });
    expect(s.players[0]!.position).toBe(8);
    expect(s.pending).toMatchObject({ type: 'pay', playerId: 'a', total: 50 });
    s = act(s, { type: 'pay', playerId: 'a' });
    expect(cash(s, 'a')).toBe(450);
  });

  it('highway choice waits for Sục and Xác nhận before moving', () => {
    let s = newGame();
    s.stagedDiceCards = true;
    topCard(s, 'community-highway');
    setPlayer(s, 'a', { position: 14 });
    s = roll(s, 1, 2);
    s = drawPick(s);
    expect(s.pending).toMatchObject({ type: 'chooseTile', purpose: 'highway' });
    s = act(s, { type: 'chooseTile', playerId: 'a', tile: 6 });
    expect(s.pending).toMatchObject({
      type: 'cardDice',
      cardId: 'community-highway',
      highwayTile: 6,
      dice: null,
    });
    expect(s.players[0]!.position).toBe(17);
    s = act(s, { type: 'rollCardDice', playerId: 'a' }, [4]);
    expect(s.players[0]!.position).toBe(17);
    s = act(s, { type: 'confirmCardDice', playerId: 'a' });
    expect(s.players[0]!.position).toBe(6);
  });
  it('Thằng Bờm leaves owners unchanged until dice are confirmed', () => {
    let s = newGame();
    s.stagedDiceCards = true;
    own(s, 'a', 3);
    own(s, 'a', 39);
    own(s, 'b', 6);
    own(s, 'b', 37);
    topCard(s, 'community-swap');
    setPlayer(s, 'a', { position: 14 });
    s = roll(s, 1, 2);
    s = drawPick(s);
    expect(s.pending).toMatchObject({ type: 'cardDice', dice: null });
    s = act(s, { type: 'rollCardDice', playerId: 'a' }, [1, 4]);
    expect(s.tiles[3]!.owner).toBe('a');
    expect(s.tiles[6]!.owner).toBe('b');
    s = act(s, { type: 'confirmCardDice', playerId: 'a' });
    expect(s.tiles[3]!.owner).toBe('b');
    expect(s.tiles[6]!.owner).toBe('a');
  });

  it('fire cannot reduce a house before confirming the rolls of all players', () => {
    let s = newGame();
    s.stagedDiceCards = true;
    own(s, 'b', 11, { level: 2 });
    topCard(s, 'chance-neighbor-fire');
    s = roll(s, 3, 4);
    s = drawPick(s);
    expect(s.pending).toMatchObject({ type: 'cardDice', dice: null });
    s = act(s, { type: 'rollCardDice', playerId: 'a' }, [1, 1, 1, 1]);
    expect(s.tiles[11]!.level).toBe(2);
    s = act(s, { type: 'confirmCardDice', playerId: 'a' });
    expect(s.tiles[11]!.level).toBe(1);
  });
});
