/**
 * Những gì trình duyệt được thấy. Dựng từng trường một (không sao chép cả đối tượng)
 * để vé, socket hay thứ tự bộ thẻ không bao giờ lọt ra ngoài.
 */
import {
  CHANCE_CARDS,
  COMMUNITY_CARDS,
  type GameState,
  type PublicGameState,
  type RoomView,
  type Seat,
} from '@cotiphu/shared';
import type { Room } from './rooms';

/** Giấu thứ tự bộ thẻ, chỉ còn số lá. */
export function publicGame(game: GameState): PublicGameState {
  const { decks, ...rest } = game;
  return {
    ...rest,
    decks: { chance: decks.chance.length, community: decks.community.length },
    // Lá nào đã bốc (không còn trong chồng) thì ai cũng thấy; thứ tự lá còn lại vẫn giấu.
    drawnCards: {
      chance: CHANCE_CARDS.map((c) => c.id).filter((id) => !decks.chance.includes(id)),
      community: COMMUNITY_CARDS.map((c) => c.id).filter((id) => !decks.community.includes(id)),
    },
  };
}

export function roomView(room: Room): RoomView {
  const seats: Seat[] = room.seats.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    icon: s.icon,
    connected: s.socketId !== null,
    isHost: s.id === room.hostId,
  }));
  return {
    code: room.code,
    phase: room.phase,
    capacity: room.capacity,
    seats,
    game: room.game && publicGame(room.game),
    previous: room.previous && publicGame(room.previous),
    version: room.version,
  };
}
