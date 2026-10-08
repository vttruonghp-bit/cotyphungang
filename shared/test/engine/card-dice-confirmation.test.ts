import { describe, expect, it } from 'vitest';
import { act, cash, newGame, own, roll, setPlayer, topCard, reject } from './helpers';

describe('Card dice are rolled and confirmed before effects in live games', () => {
  it('lottery requires the actual drawer to roll and confirm before receiving a prize', () => {
    let s = newGame();
    s.stagedDiceCards = true;
    topCard(s, 'chance-lottery');
    s = roll(s, 3, 4);
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
    expect(reject(s, { type: 'rollCardDice', playerId: 'b' })).toBe('Không phải lượt của bạn');
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
    expect(s.pending.type).toBe('cardDice');
    expect(s.players[0]!.position).toBe(7);
    s = act(s, { type: 'rollCardDice', playerId: 'a' }, [2, 3]);
    expect(s.players[0]!.position).toBe(7);
    expect(cash(s, 'a')).toBe(500);
    s = act(s, { type: 'confirmCardDice', playerId: 'a' });
    expect(s.players[0]!.position).toBe(8);
    expect(cash(s, 'a')).toBe(450);
  });

  it('highway choice waits for Sục and Xác nhận before moving', () => {
    let s = newGame();
    s.stagedDiceCards = true;
    topCard(s, 'community-highway');
    setPlayer(s, 'a', { position: 14 });
    s = roll(s, 1, 2);
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
});
