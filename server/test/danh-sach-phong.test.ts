import { describe, expect, it } from 'vitest';
import { seededRng } from '@cotiphu/shared';
import { ROOM_IDLE_MS, Rooms } from '../src/rooms';
import { roomView } from '../src/view';

const profile = (name: string, color: number, icon: number) => ({ name, color, icon });

describe('dọn phòng bỏ không', () => {
  it('xóa phòng không ai mở trang sau 2 giờ, giữ phòng còn người', () => {
    let now = 1_000_000;
    const rooms = new Rooms(() => now);
    const empty = rooms.create(2, profile('A', 0, 0));
    const busy = rooms.create(2, profile('B', 0, 0));
    rooms.setSocket(busy.room, busy.seat, 'socket-1');

    now += ROOM_IDLE_MS - 1;
    expect(rooms.sweep()).toEqual([]);
    now += 1;
    expect(rooms.sweep().map((r) => r.code)).toEqual([empty.room.code]);
    expect(rooms.get(empty.room.code)).toBeUndefined();
    expect(rooms.get(busy.room.code)).toBe(busy.room);

    // Người cuối rời đi: tính lại từ lúc đó.
    rooms.setSocket(busy.room, busy.seat, null);
    now += ROOM_IDLE_MS - 1;
    expect(rooms.sweep()).toEqual([]);
    now += 1;
    expect(rooms.sweep()).toHaveLength(1);
    expect(rooms.size).toBe(0);
  });
});

describe('trạng thái gửi cho trình duyệt', () => {
  it('không có vé, socket hay thứ tự bộ thẻ', () => {
    const rooms = new Rooms();
    const { room, seat } = rooms.create(2, profile('Chủ', 0, 0));
    const guest = rooms.addSeat(room, profile('Khách', 1, 1));
    rooms.setSocket(room, seat, 'socket-bí-mật');
    expect(rooms.start(room, seat, seededRng(3))).toEqual({ ok: true, value: undefined });

    const view = roomView(room);
    const json = JSON.stringify(view);
    for (const secret of [seat.token, guest.token, 'socket-bí-mật', 'socketId', 'token']) {
      expect(json).not.toContain(secret);
    }
    expect(view.game!.decks).toEqual({
      chance: room.game!.decks.chance.length,
      community: room.game!.decks.community.length,
    });
    expect(json).not.toContain(JSON.stringify(room.game!.decks.chance));
    expect(view.seats).toEqual([
      {
        id: seat.id,
        name: 'Chủ',
        color: 0,
        icon: 0,
        connected: true,
        auto: false,
        isHost: true,
        voice: false,
        mic: false,
      },
      {
        id: guest.id,
        name: 'Khách',
        color: 1,
        icon: 1,
        connected: false,
        auto: false,
        isHost: false,
        voice: false,
        mic: false,
      },
    ]);
  });

  it('mã phòng không trùng, vé mỗi ghế khác nhau', () => {
    const rooms = new Rooms();
    const codes = new Set<string>();
    const tokens = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { room, seat } = rooms.create(2, profile('A', 0, 0));
      codes.add(room.code);
      tokens.add(seat.token);
    }
    expect(codes.size).toBe(200);
    expect(tokens.size).toBe(200);
  });
});
