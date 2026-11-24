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

/** Chủ phòng tạo phòng `capacity` người, thêm người vào cho đủ `joined` ghế. */
async function lobby(capacity: number, joined = capacity) {
  const host = await server.phone();
  const ticket = await host.create(capacity, profile('Chủ', 0, 0));
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
    const ticket = await host.create(3, profile('  Lan   Anh ', 2, 5));
    expect(ticket.code).toHaveLength(ROOM_CODE_LENGTH);
    for (const ch of ticket.code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    expect(ticket.token.length).toBeGreaterThanOrEqual(24);

    const v = await host.waitFor((x) => x.seats.length === 1);
    expect(v).toMatchObject({ code: ticket.code, phase: 'lobby', capacity: 3, game: null });
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
    });
  });

  it('vào phòng bằng mã (nhận cả chữ thường), cả phòng thấy người mới', async () => {
    const { host, code } = await lobby(3, 1);
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

  it('phòng đủ người thì không vào được nữa', async () => {
    const { code } = await lobby(2);
    const late = await server.phone();
    const r = await late.call('room:join', { code, profile: profile('Muộn', 5, 5) });
    expect(r).toEqual({ ok: false, error: 'Phòng đã đủ người' });
  });

  it('vào phòng lần nữa khi đang ở trong phòng đó thì báo lỗi', async () => {
    const { guests, code } = await lobby(3, 2);
    const r = await guests[0]!.call('room:join', { code, profile: profile('Lại', 6, 6) });
    expect(r).toEqual({ ok: false, error: 'Bạn đã ở trong phòng này' });
  });
});

describe('màu và biểu tượng không trùng', () => {
  it('người vào sau chọn trùng thì được màu, biểu tượng trống đầu tiên', async () => {
    const { host, code } = await lobby(4, 1); // chủ: màu 0, biểu tượng 0
    const a = await server.phone();
    await a.join(code, profile('A', 0, 0));
    const b = await server.phone();
    await b.join(code, profile('B', 0, 3));
    const v = await server.settle(code, [host, a, b]);
    expect(v.seats.map((s) => [s.color, s.icon])).toEqual([
      [0, 0],
      [1, 1],
      [2, 3],
    ]);
  });

  it('đổi hồ sơ sang màu hoặc biểu tượng đã có người chọn thì bị từ chối', async () => {
    const { host, guests, code } = await lobby(3, 2);
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
    const { host, code } = await lobby(2, 1);
    expect(await host.call('room:profile', profile('Chủ mới', 0, 0))).toEqual({ ok: true });
    const v = await server.settle(code, [host]);
    expect(v.seats[0]!.name).toBe('Chủ mới');
  });
});

describe('số người và bắt đầu', () => {
  it('chủ phòng đổi số người, không giảm dưới số ghế đang có', async () => {
    const { host, guests, code } = await lobby(4, 3);
    expect(await host.call('room:capacity', 2)).toEqual({
      ok: false,
      error: 'Phòng đang có 3 người, không giảm xuống 2 được',
    });
    expect(await host.call('room:capacity', 7)).toEqual({
      ok: false,
      error: 'Số người phải từ 2 đến 6',
    });
    expect(await guests[0]!.call('room:capacity', 5)).toEqual({
      ok: false,
      error: 'Chỉ chủ phòng được đổi số người',
    });
    expect(await host.call('room:capacity', 3)).toEqual({ ok: true });
    const v = await server.settle(code, [host, ...guests]);
    expect(v.capacity).toBe(3);
  });

  it('chỉ chủ phòng bắt đầu được, và chỉ khi đủ người', async () => {
    const { host, guests, code, all } = await lobby(3, 2);
    expect(await host.call('room:start')).toEqual({
      ok: false,
      error: 'Cần đủ 3 người, phòng mới có 2',
    });
    const third = await server.phone();
    await third.join(code, profile('Ba', 4, 4));
    expect(await guests[0]!.call('room:start')).toEqual({
      ok: false,
      error: 'Chỉ chủ phòng được bắt đầu ván',
    });
    expect(await host.call('room:start')).toEqual({ ok: true });
    const v = await server.settle(code, [...all, third]);
    expect(v.phase).toBe('playing');
    expect(v.game!.players.map((p) => p.id)).toEqual(v.seats.map((s) => s.id));
    expect(v.game!.players.map((p) => p.name)).toEqual(['Chủ', 'Khách 1', 'Ba']);
    // Thứ tự đi do đổ chọn lượt quyết định.
    expect(v.game!.log.filter((l) => l.text.startsWith('Đổ chọn lượt')).length).toBeGreaterThan(2);
    expect(await host.call('room:start')).toEqual({ ok: false, error: 'Ván đã bắt đầu rồi' });
  });

  it('sau khi vào ván thì không vào phòng, không đổi hồ sơ hay số người được nữa', async () => {
    const { host, guests, code } = await lobby(2);
    expect(await host.call('room:start')).toEqual({ ok: true });
    const late = await server.phone();
    expect(await late.call('room:join', { code, profile: profile('Muộn', 5, 5) })).toEqual({
      ok: false,
      error: 'Phòng này đã vào ván',
    });
    expect(await guests[0]!.call('room:profile', profile('X', 6, 6))).toEqual({
      ok: false,
      error: 'Chỉ đổi được tên, màu, biểu tượng ở phòng chờ',
    });
    expect(await host.call('room:capacity', 3)).toEqual({
      ok: false,
      error: 'Ván đã bắt đầu, không đổi được số người',
    });
  });
});

describe('rời phòng chờ', () => {
  it('khách rời phòng thì nhường ghế, vé cũ hết dùng được', async () => {
    const { host, guests, code } = await lobby(3, 3);
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
    const { host, guests, code } = await lobby(3, 3);
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
    const { host, guests, code } = await lobby(3, 2);
    const g = guests[0]!;
    const t = await g.create(2, profile('Chủ 2', 0, 0));
    expect(t.code).not.toBe(code);
    const v = await host.waitFor((x) => x.seats.length === 1);
    expect(v.seats[0]!.name).toBe('Chủ');
  });
});

describe('vào lại bằng vé', () => {
  it('mất kết nối chỉ đánh dấu, vào lại bằng vé thì giữ nguyên ghế', async () => {
    const { host, guests, code } = await lobby(3, 2);
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
    const { host } = await lobby(2, 1);
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
    const { host, guests, code } = await lobby(2, 2);
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
    const { host } = await lobby(2, 1);
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
      [{ capacity: 1, profile: profile('A', 0, 0) }, 'Số người phải từ 2 đến 6'],
      [{ capacity: 7, profile: profile('A', 0, 0) }, 'Số người phải từ 2 đến 6'],
      [{ capacity: '3', profile: profile('A', 0, 0) }, 'Số người phải từ 2 đến 6'],
      [{ capacity: 2.5, profile: profile('A', 0, 0) }, 'Số người phải từ 2 đến 6'],
      [{ capacity: 3 }, 'Thiếu tên, màu hoặc biểu tượng'],
      [{ capacity: 3, profile: profile('   ', 0, 0) }, 'Hãy nhập tên'],
      [{ capacity: 3, profile: profile('Nguyễn Văn Bình', 0, 0) }, 'Tên dài tối đa 12 kí tự'],
      [{ capacity: 3, profile: { name: 42, color: 0, icon: 0 } }, 'Tên không hợp lệ'],
      [{ capacity: 3, profile: profile('A', 10, 0) }, 'Màu không hợp lệ'],
      [{ capacity: 3, profile: profile('A', -1, 0) }, 'Màu không hợp lệ'],
      [{ capacity: 3, profile: profile('A', 0, 31) }, 'Biểu tượng không hợp lệ'],
      [{ capacity: 3, profile: { name: 'A', color: 0, icon: '1' } }, 'Biểu tượng không hợp lệ'],
    ];
    for (const [req, error] of cases) {
      expect(await p.call('room:create', req), JSON.stringify(req)).toEqual({ ok: false, error });
    }
    expect(server.app.rooms.size).toBe(0);
  });

  it('gửi không kèm ack hay sự kiện lạ thì máy chủ vẫn chạy bình thường', async () => {
    const p = await server.phone();
    p.send('room:create', { capacity: 2, profile: profile('A', 0, 0) });
    p.send('room:start');
    p.send('game:action', { type: 'roll' });
    p.send('room:không-có');
    p.send('room:join');
    await until(() => server.app.rooms.size === 1);
    expect(await p.call('room:capacity', 3)).toEqual({ ok: true });
    expect(await p.call('room:join', undefined)).toEqual({
      ok: false,
      error: 'Yêu cầu không hợp lệ',
    });
    expect(await p.call('room:capacity', { capacity: 3 })).toEqual({
      ok: false,
      error: 'Số người phải từ 2 đến 6',
    });
  });

  it('chưa vào phòng thì không đổi hồ sơ, số người, bắt đầu hay thao tác được', async () => {
    const p = await server.phone();
    const error = 'Bạn chưa vào phòng nào';
    expect(await p.call('room:profile', profile('A', 0, 0))).toEqual({ ok: false, error });
    expect(await p.call('room:capacity', 3)).toEqual({ ok: false, error });
    expect(await p.call('room:start')).toEqual({ ok: false, error });
    expect(await p.call('game:action', { type: 'roll', playerId: 'p1' })).toEqual({
      ok: false,
      error,
    });
  });
});
