import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@cotiphu/shared';
import { CLOSED_HOST_LEFT, SEAT_OPENED_ELSEWHERE } from '../src/socket-handlers';
import { profile, startServer, until, type Phone, type TestServer } from './helpers';

let server: TestServer;

beforeEach(async () => {
  server = await startServer();
});

afterEach(async () => {
  await server.close();
});

/** Chủ phòng tạo phòng, thêm người vào cho đủ `joined` ghế. */
async function lobby(joined: number) {
  const host = await server.phone();
  const ticket = await host.create(profile('Chủ', 0, 0));
  const guests: Phone[] = [];
  for (let i = 1; i < joined; i++) {
    const g = await server.phone();
    await g.join(ticket.code, profile(`Khách ${i}`, i, i));
    guests.push(g);
  }
  return { host, guests, code: ticket.code, all: [host, ...guests] };
}

describe('tạo phòng và vào phòng', () => {
  it('tạo phòng: trả vé, mã 6 kí tự đúng bảng chữ, chủ phòng ngồi ghế đầu', async () => {
    const host = await server.phone();
    const ticket = await host.create(profile('  Lan   Anh ', 2, 5));
    expect(ticket.code).toHaveLength(ROOM_CODE_LENGTH);
    for (const ch of ticket.code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    expect(ticket.token.length).toBeGreaterThanOrEqual(24);

    const v = await host.waitFor((x) => x.seats.length === 1);
    expect(v).toMatchObject({ code: ticket.code, kind: 'online', phase: 'lobby', game: null });
    expect(v.seats[0]).toEqual({
      id: ticket.playerId,
      name: 'Lan Anh',
      color: 2,
      icon: 5,
      connected: true,
      auto: false,
      isHost: true,
      voice: false,
      mic: false,
      role: 'player',
      bot: false,
      local: false,
    });
  });

  it('vào phòng bằng mã (nhận cả chữ thường), cả phòng thấy người mới', async () => {
    const { host, code } = await lobby(1);
    const guest = await server.phone();
    const t = await guest.join(` ${code.toLowerCase()} `, profile('Minh', 1, 1));
    expect(t.code).toBe(code);
    expect(t.playerId).not.toBe(host.id);
    const v = await server.settle(code, [host, guest]);
    expect(v.seats.map((s) => [s.name, s.isHost, s.connected])).toEqual([
      ['Chủ', true, true],
      ['Minh', false, true],
    ]);
  });

  it('mã phòng sai hoặc không có phòng thì báo lỗi', async () => {
    const p = await server.phone();
    expect(await p.call('room:join', { code: 'ABC', profile: profile('A', 0, 0) })).toEqual({
      ok: false,
      error: 'Mã phòng không đúng',
    });
    expect(await p.call('room:join', { code: 'ABCDE0', profile: profile('A', 0, 0) })).toEqual({
      ok: false,
      error: 'Mã phòng không đúng',
    });
    const r = await p.call('room:join', { code: 'ABCDEF', profile: profile('A', 0, 0) });
    expect(r).toEqual({ ok: false, error: 'Không tìm thấy phòng ABCDEF' });
  });

  it('người vào phòng chờ là người chơi; đủ 6 người chơi thì người sau là khách quan sát', async () => {
    const { all, code } = await lobby(6);
    const late = await server.phone();
    await late.join(code, profile('Muộn', 5, 5));
    const v = await server.settle(code, [...all, late]);
    expect(v.seats.map((s) => s.role)).toEqual([...Array(6).fill('player'), 'spectator']);
  });

  it('vào phòng lần nữa khi đang ở trong phòng đó thì báo lỗi', async () => {
    const { guests, code } = await lobby(2);
    const r = await guests[0]!.call('room:join', { code, profile: profile('Lại', 6, 6) });
    expect(r).toEqual({ ok: false, error: 'Bạn đã ở trong phòng này' });
  });
});

describe('màu và biểu tượng không trùng', () => {
  it('người vào sau chọn trùng thì máy chủ đổi sang màu, biểu tượng trống ngẫu nhiên', async () => {
    const { host, code } = await lobby(1); // chủ: màu 0, biểu tượng 0
    const a = await server.phone();
    await a.join(code, profile('A', 0, 0));
    const b = await server.phone();
    await b.join(code, profile('B', 0, 3));
    const v = await server.settle(code, [host, a, b]);
    expect(v.seats[0]).toMatchObject({ color: 0, icon: 0 });
    expect(v.seats[2]!.icon).toBe(3); // không trùng thì giữ nguyên
    expect(new Set(v.seats.map((s) => s.color)).size).toBe(3);
    expect(new Set(v.seats.map((s) => s.icon)).size).toBe(3);
  });

  it('đổi hồ sơ sang màu hoặc biểu tượng đã có người chọn thì bị từ chối', async () => {
    const { host, guests, code } = await lobby(2);
    const g = guests[0]!;
    expect(await g.call('room:profile', profile('Khách', 0, 9))).toEqual({
      ok: false,
      error: 'Màu này đã có người chọn',
    });
    expect(await g.call('room:profile', profile('Khách', 7, 0))).toEqual({
      ok: false,
      error: 'Biểu tượng này đã có người chọn',
    });
    expect(await g.call('room:profile', profile('Khách mới', 7, 9))).toEqual({ ok: true });
    const v = await server.settle(code, [host, g]);
    expect(v.seats[1]).toMatchObject({ name: 'Khách mới', color: 7, icon: 9 });
  });

  it('giữ nguyên màu của mình khi chỉ đổi tên', async () => {
    const { host, code } = await lobby(1);
    expect(await host.call('room:profile', profile('Chủ mới', 0, 0))).toEqual({ ok: true });
    const v = await server.settle(code, [host]);
    expect(v.seats[0]!.name).toBe('Chủ mới');
  });
});

describe('khách quan sát, bot và bắt đầu', () => {
  it('tự chuyển sang khách quan sát và vào chơi lại; màu trùng thì được đổi', async () => {
    const { host, guests, code, all } = await lobby(2);
    const g = guests[0]!;
    expect(await g.call('room:role', 'spectator')).toEqual({ ok: true });
    let v = await server.settle(code, all);
    expect(v.seats[1]).toMatchObject({ role: 'spectator' });
    // Khách quan sát không có quân: màu, kí hiệu trùng cũng được.
    expect(await g.call('room:profile', profile('Xem', 0, 0))).toEqual({ ok: true });
    expect(await g.call('room:role', 'player')).toEqual({ ok: true });
    v = await server.settle(code, all);
    expect(v.seats[1]).toMatchObject({ role: 'player', name: 'Xem' });
    expect(v.seats[1]!.color).not.toBe(0);
    expect(v.seats[1]!.icon).not.toBe(0);
    expect(await g.call('room:role', 'bot')).toEqual({ ok: false, error: 'Vai không hợp lệ' });
    expect(host.closed).toEqual([]);
  });

  it('khách quan sát không vào chơi được khi đã đủ 6 người chơi', async () => {
    const { code, all } = await lobby(6);
    const late = await server.phone();
    await late.join(code, profile('Muộn', 5, 5));
    expect(await late.call('room:role', 'player')).toEqual({
      ok: false,
      error: 'Đã đủ 6 người chơi',
    });
    expect(await all[1]!.call('room:role', 'spectator')).toEqual({ ok: true });
    expect(await late.call('room:role', 'player')).toEqual({ ok: true });
  });

  it('chủ phòng thêm tối đa 2 bot, bỏ được bot; người khác thì không', async () => {
    const { host, guests, code, all } = await lobby(2);
    expect(await guests[0]!.call('room:addBot')).toEqual({
      ok: false,
      error: 'Chỉ chủ phòng được thêm bot',
    });
    expect(await host.call('room:addBot')).toEqual({ ok: true });
    expect(await host.call('room:addBot')).toEqual({ ok: true });
    expect(await host.call('room:addBot')).toEqual({ ok: false, error: 'Tối đa 2 bot' });
    let v = await server.settle(code, all);
    const bots = v.seats.filter((s) => s.bot);
    expect(bots.map((b) => [b.name, b.role, b.connected])).toEqual([
      ['Bot 1', 'player', true],
      ['Bot 2', 'player', true],
    ]);
    expect(new Set(v.seats.map((s) => s.color)).size).toBe(4);
    expect(new Set(v.seats.map((s) => s.icon)).size).toBe(4);
    expect(await guests[0]!.call('room:removeBot', bots[0]!.id)).toEqual({
      ok: false,
      error: 'Chỉ chủ phòng được bỏ bot',
    });
    expect(await host.call('room:removeBot', guests[0]!.id)).toEqual({
      ok: false,
      error: 'Không có bot này',
    });
    expect(await host.call('room:removeBot', bots[0]!.id)).toEqual({ ok: true });
    v = await server.settle(code, all);
    expect(v.seats.map((s) => s.name)).toEqual(['Chủ', 'Khách 1', 'Bot 2']);
    // Bot chiếm chỗ người chơi: đủ 6 thì không thêm được nữa.
    for (let i = 0; i < 3; i++) await (await server.phone()).join(code, profile(`N${i}`, 0, 0));
    expect(await host.call('room:addBot')).toEqual({ ok: false, error: 'Đã đủ 6 người chơi' });
  });

  it('chỉ chủ phòng bắt đầu được, khi có từ 2 người chơi; khách quan sát không vào ván', async () => {
    const { host, code } = await lobby(1);
    expect(await host.call('room:start')).toEqual({
      ok: false,
      error: 'Cần ít nhất 2 người chơi (thêm bot hoặc chờ người vào)',
    });
    const two = await server.phone();
    await two.join(code, profile('Hai', 4, 4));
    const watcher = await server.phone();
    await watcher.join(code, profile('Xem', 5, 5));
    expect(await watcher.call('room:role', 'spectator')).toEqual({ ok: true });
    expect(await two.call('room:start')).toEqual({
      ok: false,
      error: 'Chỉ chủ phòng được bắt đầu ván',
    });
    expect(await host.call('room:start')).toEqual({ ok: true });
    const v = await server.settle(code, [host, two, watcher]);
    expect(v.phase).toBe('playing');
    expect(v.game!.players.map((p) => p.name)).toEqual(['Chủ', 'Hai']);
    // Thứ tự đi do đổ chọn lượt quyết định.
    expect(v.game!.log.filter((l) => l.text.startsWith('Đổ chọn lượt')).length).toBeGreaterThan(1);
    expect(await host.call('room:start')).toEqual({ ok: false, error: 'Ván đã bắt đầu rồi' });
    expect(await watcher.act({ type: 'roll', playerId: watcher.id })).toEqual({
      ok: false,
      error: 'Bạn đang xem, không có lượt trong ván này',
    });
  });

  it('vào phòng đang chơi thì là khách quan sát; không đổi hồ sơ, vai hay bot được nữa', async () => {
    const { host, guests, code, all } = await lobby(2);
    expect(await host.call('room:start')).toEqual({ ok: true });
    const late = await server.phone();
    await late.join(code, profile('Muộn', 5, 5));
    let v = await server.settle(code, [...all, late]);
    expect(v.seats[2]).toMatchObject({ name: 'Muộn', role: 'spectator', connected: true });
    expect(v.game!.players).toHaveLength(2);
    expect(await guests[0]!.call('room:profile', profile('X', 6, 6))).toEqual({
      ok: false,
      error: 'Chỉ đổi được tên, màu, biểu tượng ở phòng chờ',
    });
    expect(await late.call('room:role', 'player')).toEqual({
      ok: false,
      error: 'Chỉ đổi được vai ở phòng chờ',
    });
    expect(await host.call('room:addBot')).toEqual({
      ok: false,
      error: 'Chỉ thêm được bot ở phòng chờ',
    });
    // Khách quan sát rời giữa ván thì nhả ghế; người chơi thì phải đầu hàng.
    expect(await guests[0]!.call('room:leave')).toEqual({
      ok: false,
      error: 'Đang trong ván, muốn rời thì dùng Đầu hàng',
    });
    expect(await late.call('room:leave')).toEqual({ ok: true });
    v = await host.waitFor((x) => x.seats.length === 2);
    expect(v.seats.map((s) => s.name)).toEqual(['Chủ', 'Khách 1']);
  });
});

describe('rời phòng chờ', () => {
  it('khách rời phòng thì nhường ghế, vé cũ hết dùng được', async () => {
    const { host, guests, code } = await lobby(3);
    const leaver = guests[0]!;
    const old = leaver.ticket!;
    expect(await leaver.call('room:leave')).toEqual({ ok: true });
    const v = await host.waitFor((x) => x.seats.length === 2);
    expect(v.seats.map((s) => s.name)).toEqual(['Chủ', 'Khách 2']);
    expect(await leaver.call('room:resume', old)).toEqual({
      ok: false,
      error: 'Vé vào phòng không hợp lệ',
    });
    // Ghế trống lại: người mới vào được, mã ghế không trùng người cũ.
    const next = await server.phone();
    const t = await next.join(code, profile('Mới', 1, 1));
    expect(t.playerId).not.toBe(old.playerId);
  });

  it('chủ phòng rời phòng chờ thì phòng đóng, mọi người nhận room:closed', async () => {
    const { host, guests, code } = await lobby(3);
    expect(await host.call('room:leave')).toEqual({ ok: true });
    for (const g of guests) await until(() => g.closed.length > 0);
    expect(guests[0]!.closed).toEqual([CLOSED_HOST_LEFT]);
    expect(host.closed).toEqual([]);
    expect(server.app.rooms.get(code)).toBeUndefined();
    expect(await guests[0]!.call('room:start')).toEqual({
      ok: false,
      error: 'Bạn chưa vào phòng nào',
    });
  });

  it('rời khi chưa vào phòng nào thì vẫn ổn', async () => {
    const p = await server.phone();
    expect(await p.call('room:leave')).toEqual({ ok: true });
  });

  it('tạo phòng mới khi đang ở phòng chờ khác thì rời phòng cũ', async () => {
    const { host, guests, code } = await lobby(2);
    const g = guests[0]!;
    const t = await g.create(profile('Chủ 2', 0, 0));
    expect(t.code).not.toBe(code);
    const v = await host.waitFor((x) => x.seats.length === 1);
    expect(v.seats[0]!.name).toBe('Chủ');
  });
});

describe('vào lại bằng vé', () => {
  it('mất kết nối chỉ đánh dấu, vào lại bằng vé thì giữ nguyên ghế', async () => {
    const { host, guests, code } = await lobby(2);
    const g = guests[0]!;
    const ticket = g.ticket!;
    g.socket.disconnect();
    let v = await host.waitFor((x) => x.seats[1]?.connected === false);
    expect(v.seats).toHaveLength(2);

    const again = await server.phone();
    expect(await again.resume(ticket)).toEqual(ticket);
    v = await server.settle(code, [host, again]);
    expect(v.seats[1]).toMatchObject({ id: ticket.playerId, connected: true });
  });

  it('vé sai token, sai mã ghế hay phòng không còn thì bị từ chối', async () => {
    const { host } = await lobby(1);
    const t = host.ticket!;
    const p = await server.phone();
    const bad = { ok: false, error: 'Vé vào phòng không hợp lệ' };
    expect(await p.call('room:resume', { ...t, token: t.token.slice(1) + 'x' })).toEqual(bad);
    expect(await p.call('room:resume', { ...t, playerId: 'p9' })).toEqual(bad);
    expect(await p.call('room:resume', { ...t, token: 5 })).toEqual(bad);
    expect(await p.call('room:resume', null)).toEqual(bad);
    expect(await p.call('room:resume', { ...t, code: 'ZZZZZZ' })).toEqual({
      ok: false,
      error: 'Phòng không còn nữa',
    });
  });

  it('mở ghế ở trang mới thì trang cũ bị tách ra lặng lẽ (một socket mỗi ghế)', async () => {
    const { host, guests, code } = await lobby(2);
    const oldTab = guests[0]!;
    const seen = oldTab.states.length;
    const newTab = await server.phone();
    await newTab.resume(oldTab.ticket!);
    await server.settle(code, [host, newTab]);
    // Không gửi room:closed: trang cũ sẽ xóa vé dùng chung trong trình duyệt.
    expect(oldTab.closed).toEqual([]);
    const error = SEAT_OPENED_ELSEWHERE;
    expect(await oldTab.call('room:profile', profile('Cũ', 5, 5))).toEqual({ ok: false, error });
    expect(await oldTab.call('room:leave')).toEqual({ ok: false, error });
    expect(await newTab.call('room:profile', profile('Mới', 5, 5))).toEqual({ ok: true });
    let v = await server.settle(code, [host, newTab]);
    expect(oldTab.states.length).toBe(seen);
    // Trang cũ đóng hẳn cũng không làm ghế thành mất kết nối.
    oldTab.socket.disconnect();
    await new Promise((r) => setTimeout(r, 50));
    v = await server.settle(code, [host, newTab]);
    expect(v.seats[1]).toMatchObject({ name: 'Mới', connected: true });
    // Trang cũ tải lại thì lấy lại ghế.
    const reloaded = await server.phone();
    await reloaded.resume(newTab.ticket!);
    expect(await newTab.call('room:start')).toEqual({ ok: false, error });
  });

  it('vào lại khi socket đang giữ chính ghế đó thì không đổi gì', async () => {
    const { host } = await lobby(1);
    expect(await host.call('room:resume', host.ticket)).toEqual({ ok: true, data: host.ticket });
    expect(host.closed).toEqual([]);
  });
});

describe('dữ liệu sai không làm hỏng máy chủ', () => {
  it('tạo phòng với dữ liệu sai thì trả lỗi tiếng Việt', async () => {
    const p = await server.phone();
    const cases: [unknown, string][] = [
      [null, 'Yêu cầu không hợp lệ'],
      ['phòng', 'Yêu cầu không hợp lệ'],
      [[1, 2], 'Yêu cầu không hợp lệ'],
      [{}, 'Thiếu tên, màu hoặc biểu tượng'],
      [{ profile: profile('   ', 0, 0) }, 'Hãy nhập tên'],
      [{ profile: profile('Nguyễn Văn Bình', 0, 0) }, 'Tên dài tối đa 12 kí tự'],
      [{ profile: { name: 42, color: 0, icon: 0 } }, 'Tên không hợp lệ'],
      [{ profile: profile('A', 10, 0) }, 'Màu không hợp lệ'],
      [{ profile: profile('A', -1, 0) }, 'Màu không hợp lệ'],
      [{ profile: profile('A', 0, 31) }, 'Biểu tượng không hợp lệ'],
      [{ profile: { name: 'A', color: 0, icon: '1' } }, 'Biểu tượng không hợp lệ'],
    ];
    for (const [req, error] of cases) {
      expect(await p.call('room:create', req), JSON.stringify(req)).toEqual({ ok: false, error });
    }
    expect(server.app.rooms.size).toBe(0);
  });

  it('gửi không kèm ack hay sự kiện lạ thì máy chủ vẫn chạy bình thường', async () => {
    const p = await server.phone();
    p.send('room:create', { profile: profile('A', 0, 0) });
    p.send('room:start');
    p.send('game:action', { type: 'roll' });
    p.send('room:không-có');
    p.send('room:join');
    await until(() => server.app.rooms.size === 1);
    expect(await p.call('room:role', 'spectator')).toEqual({ ok: true });
    expect(await p.call('room:join', undefined)).toEqual({
      ok: false,
      error: 'Yêu cầu không hợp lệ',
    });
    expect(await p.call('room:role', { role: 'player' })).toEqual({
      ok: false,
      error: 'Vai không hợp lệ',
    });
    expect(await p.call('room:removeBot', { id: 1 })).toEqual({
      ok: false,
      error: 'Không có bot này',
    });
  });

  it('chưa vào phòng thì không đổi hồ sơ, vai, bot, bắt đầu hay thao tác được', async () => {
    const p = await server.phone();
    const error = 'Bạn chưa vào phòng nào';
    expect(await p.call('room:profile', profile('A', 0, 0))).toEqual({ ok: false, error });
    expect(await p.call('room:role', 'player')).toEqual({ ok: false, error });
    expect(await p.call('room:addBot')).toEqual({ ok: false, error });
    expect(await p.call('room:start')).toEqual({ ok: false, error });
    expect(await p.call('game:action', { type: 'roll', playerId: 'p1' })).toEqual({
      ok: false,
      error,
    });
  });
});
