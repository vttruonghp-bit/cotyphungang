import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLOSED_HOST_LEFT } from '../src/socket-handlers';
import { profile, startServer, until, type TestServer } from './helpers';

let server: TestServer;

beforeEach(async () => {
  server = await startServer({ botSpeed: 0 });
});

afterEach(async () => {
  await server.close();
});

describe('bot do máy chủ chơi', () => {
  it('chủ phòng chỉ xem, hai bot tự chơi; không còn ai mở trang thì bot nghỉ', async () => {
    const host = await server.phone();
    const { code } = await host.create(profile('Chủ', 0, 0));
    expect(await host.call('room:addBot')).toEqual({ ok: true });
    expect(await host.call('room:addBot')).toEqual({ ok: true });
    expect(await host.call('room:role', 'spectator')).toEqual({ ok: true });
    expect(await host.call('room:start')).toEqual({ ok: true });
    const v = await host.waitFor((x) => (x.game?.turnNumber ?? 0) >= 4);
    expect(v.game!.players.map((p) => p.name).sort()).toEqual(['Bot 1', 'Bot 2']);
    // Người xem không đi thay bot được.
    const botId = v.game!.players[0]!.id;
    expect(await host.act({ type: 'roll', playerId: botId })).toEqual({
      ok: false,
      error: 'Bạn đang xem, không có lượt trong ván này',
    });

    host.socket.disconnect();
    const room = server.app.rooms.get(code)!;
    await until(() => room.seats.every((s) => s.socketId === null));
    await new Promise((r) => setTimeout(r, 30));
    const stopped = room.version;
    await new Promise((r) => setTimeout(r, 60));
    expect(room.version).toBe(stopped);
  });

  it('bot đi xong thì tới lượt người thật, người thật không đi thay bot được', async () => {
    const host = await server.phone();
    await host.create(profile('Chủ', 0, 0));
    expect(await host.call('room:addBot')).toEqual({ ok: true });
    expect(await host.call('room:start')).toEqual({ ok: true });
    const v = await host.waitFor(
      (x) => x.game?.pending.type === 'roll' && x.game.pending.playerId === host.id,
    );
    const bot = v.game!.players.find((p) => p.id !== host.id)!;
    expect(await host.act({ type: 'roll', playerId: bot.id })).toEqual({
      ok: false,
      error: 'Bạn chỉ được thao tác cho chính mình',
    });
    expect(await host.act({ type: 'roll', playerId: host.id })).toEqual({ ok: true });
  });
});

describe('chơi chung một máy có khách xem', () => {
  it('vào ván ngay; chủ phòng đi cho mọi người; khách xem, chat được nhưng không đi được', async () => {
    const host = await server.phone();
    const { code } = await host.local([
      profile('An', 0, 0),
      profile('Bình', 1, 1),
      profile('Chi', 2, 2),
    ]);
    let v = await host.waitFor((x) => x.phase === 'playing');
    expect(v.kind).toBe('local');
    expect(v.seats.map((s) => [s.name, s.local, s.connected])).toEqual([
      ['An', false, true],
      ['Bình', true, true],
      ['Chi', true, true],
    ]);

    const guest = await server.phone();
    await guest.join(code, profile('Khách', 0, 0));
    v = await server.settle(code, [host, guest]);
    expect(v.seats[3]).toMatchObject({ name: 'Khách', role: 'spectator' });

    // Chủ phòng thao tác cho người đang tới lượt, dù là ai.
    for (let i = 0; i < 3; i++) {
      v = await server.settle(code, [host, guest]);
      const pending = v.game!.pending;
      if (pending.type !== 'roll') break;
      expect(await guest.act({ type: 'roll', playerId: pending.playerId })).toEqual({
        ok: false,
        error: 'Bạn đang xem, không có lượt trong ván này',
      });
      expect(await host.act({ type: 'roll', playerId: pending.playerId })).toEqual({ ok: true });
      v = await server.settle(code, [host, guest]);
      const next = v.game!.pending;
      if (next.type === 'endTurn' || next.type === 'buy') {
        const type = next.type === 'buy' ? 'declineBuy' : 'endTurn';
        await host.act({ type, playerId: next.playerId });
      }
    }

    expect(await guest.call('chat:send', 'Hay quá')).toEqual({ ok: true });

    // Chủ phòng rời thì phòng đóng.
    expect(await host.call('room:leave')).toEqual({ ok: true });
    await until(() => guest.closed.length > 0);
    expect(guest.closed).toEqual([CLOSED_HOST_LEFT]);
    expect(server.app.rooms.get(code)).toBeUndefined();
  });

  it('danh sách người chơi sai thì báo lỗi', async () => {
    const p = await server.phone();
    const cases: [unknown, string][] = [
      [{ players: [profile('A', 0, 0)] }, 'Số người phải từ 2 đến 6'],
      [{ players: [profile('A', 0, 0), profile('B', 0, 1)] }, 'Màu của người chơi phải khác nhau'],
      [
        { players: [profile('A', 0, 0), profile('B', 1, 0)] },
        'Kí hiệu của người chơi phải khác nhau',
      ],
      [{ players: [profile('A', 0, 0), profile('', 1, 1)] }, 'Hãy nhập tên'],
      [null, 'Yêu cầu không hợp lệ'],
    ];
    for (const [req, error] of cases) {
      expect(await p.call('room:local', req), JSON.stringify(req)).toEqual({ ok: false, error });
    }
    expect(server.app.rooms.size).toBe(0);
  });
});
