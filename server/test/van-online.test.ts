import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHANCE_CARDS, COMMUNITY_CARDS, type RoomView } from '@cotiphu/shared';
import { profile, scriptRng, startServer, type Phone, type TestServer } from './helpers';

let server: TestServer;
let rng: ReturnType<typeof scriptRng>;

beforeEach(async () => {
  rng = scriptRng(7);
  server = await startServer({ rng });
});

afterEach(async () => {
  await server.close();
});

/** Phòng `n` người đã vào ván. `turn` = các điện thoại theo thứ tự đi, bắt đầu từ người đi trước. */
async function playing(n: number) {
  const host = await server.phone();
  const { code } = await host.create(n, profile('Chủ', 0, 0));
  const phones: Phone[] = [host];
  for (let i = 1; i < n; i++) {
    const p = await server.phone();
    await p.join(code, profile(`Người ${i}`, i, i));
    phones.push(p);
  }
  expect(await host.call('room:start')).toEqual({ ok: true });
  const v = await server.settle(code, phones);
  const first = v.game!.current;
  const turn = phones.map((_, k) => phones[(first + k) % n]!);
  return { code, phones, turn };
}

const player = (v: RoomView, id: string) => v.game!.players.find((p) => p.id === id)!;

describe('thao tác trong ván', () => {
  it('chỉ người đang tới lượt thao tác được, và chỉ cho chính mình', async () => {
    const { turn } = await playing(3);
    const [a, b] = turn as [Phone, Phone];
    expect(await b.act({ type: 'roll', playerId: b.id })).toEqual({
      ok: false,
      error: 'Chưa tới lượt bạn',
    });
    expect(await b.act({ type: 'roll', playerId: a.id })).toEqual({
      ok: false,
      error: 'Bạn chỉ được thao tác cho chính mình',
    });
    expect(await b.act({ type: 'surrender', playerId: a.id })).toEqual({
      ok: false,
      error: 'Bạn chỉ được thao tác cho chính mình',
    });
    expect(await a.act({ type: 'roll', playerId: a.id })).toEqual({ ok: true });
  });

  it('không ai gửi được thao tác hết giờ', async () => {
    const { turn, code } = await playing(2);
    const before = server.app.rooms.get(code)!.version;
    for (const p of turn) {
      expect(await p.call('game:action', { type: 'timeout' })).toEqual({
        ok: false,
        error: 'Chỉ máy chủ được báo hết giờ',
      });
      expect(await p.call('game:action', { type: 'timeout', playerId: p.id })).toEqual({
        ok: false,
        error: 'Chỉ máy chủ được báo hết giờ',
      });
    }
    expect(server.app.rooms.get(code)!.version).toBe(before);
  });

  it('bộ thẻ chỉ gửi số lá, không gửi thứ tự; vé không bao giờ bị gửi đi', async () => {
    const { turn, code, phones } = await playing(3);
    const a = turn[0]!;
    rng.queue.push(3, 4); // ô 7: Cơ Hội, rút một lá
    expect(await a.act({ type: 'roll', playerId: a.id })).toEqual({ ok: true });
    const v = await server.settle(code, phones);
    const real = server.app.rooms.get(code)!.game!;
    expect(v.game!.decks).toEqual({
      chance: real.decks.chance.length,
      community: real.decks.community.length,
    });
    expect(v.game!.decks.chance).toBeLessThanOrEqual(CHANCE_CARDS.length);
    expect(v.game!.decks.community).toBeLessThanOrEqual(COMMUNITY_CARDS.length);
    expect(typeof v.previous!.decks.chance).toBe('number');

    const everything = JSON.stringify(phones.flatMap((p) => p.states));
    for (const p of phones) expect(everything).not.toContain(p.ticket!.token);
    // Không lộ thứ tự các lá còn lại của bộ thẻ.
    expect(everything).not.toContain(JSON.stringify(real.decks.community));
    expect(everything).not.toContain('socketId');
  });

  it('dữ liệu thao tác sai kiểu thì báo lỗi, trường thừa bị bỏ qua', async () => {
    const { turn, code, phones } = await playing(2);
    const a = turn[0]!;
    const cases: [unknown, string][] = [
      [null, 'Thao tác không hợp lệ'],
      [{ type: 'fly', playerId: a.id }, 'Thao tác không hợp lệ'],
      [{ type: 'roll' }, 'Thao tác không hợp lệ'],
      [{ type: 'manage', playerId: a.id, ops: 'tất cả' }, 'Chưa có thay đổi nào'],
      [
        { type: 'manage', playerId: a.id, ops: [{ op: 'burn', tile: 1 }] },
        'Thao tác Ụp/Mở không hợp lệ',
      ],
      [
        { type: 'manage', playerId: a.id, ops: [{ op: 'sell', tile: 40 }] },
        'Thao tác Ụp/Mở không hợp lệ',
      ],
      [{ type: 'metro', playerId: a.id, destination: 99 }, 'Ô đích Metro không hợp lệ'],
      [{ type: 'metro', playerId: a.id }, 'Ô đích Metro không hợp lệ'],
      [{ type: 'chooseTile', playerId: a.id, tile: 1.5 }, 'Không chọn được ô này'],
      [{ type: 'changeAppearance', playerId: a.id, color: 9, icon: 0 }, 'Màu không hợp lệ'],
      [{ type: 'changeAppearance', playerId: a.id, color: 5, icon: -2 }, 'Biểu tượng không hợp lệ'],
    ];
    for (const [action, error] of cases) {
      expect(await a.call('game:action', action), JSON.stringify(action)).toEqual({
        ok: false,
        error,
      });
    }
    rng.queue.push(1, 2);
    const res = await a.call('game:action', { type: 'roll', playerId: a.id, cash: 99999 });
    expect(res).toEqual({ ok: true });
    const v = await server.settle(code, phones);
    expect(player(v, a.id).cash).toBe(500);
  });

  it('bộ luật lỗi bất ngờ thì máy chủ không sập và ván giữ nguyên', async () => {
    const { turn, code, phones } = await playing(2);
    const a = turn[0]!;
    const before = JSON.stringify(server.app.rooms.get(code)!.game);
    rng.queue.push(9); // ngoài [1, 6]: nguồn ngẫu nhiên ném lỗi
    expect(await a.act({ type: 'roll', playerId: a.id })).toEqual({
      ok: false,
      error: 'Máy chủ gặp lỗi, thao tác chưa được thực hiện',
    });
    expect(JSON.stringify(server.app.rooms.get(code)!.game)).toBe(before);
    rng.queue.length = 0;
    expect(await a.act({ type: 'roll', playerId: a.id })).toEqual({ ok: true });
    await server.settle(code, phones);
  });
});

describe('một vòng chơi qua 3 điện thoại', () => {
  it('mua đất, trả thuê, nộp thuế, đổ đôi, bỏ qua mua: mọi máy thấy cùng một trạng thái', async () => {
    const { turn, code, phones } = await playing(3);
    const [a, b, c] = turn as [Phone, Phone, Phone];

    // A đổ 1 + 2 đến Chợ Đồng Xuân (ô 3) và mua.
    rng.queue.push(1, 2);
    expect(await a.act({ type: 'roll', playerId: a.id })).toEqual({ ok: true });
    let v = await server.settle(code, phones);
    expect(v.game!.events[0]).toEqual({ type: 'roll', playerId: a.id, dice: [1, 2], jail: false });
    expect(v.game!.pending).toEqual({ type: 'buy', playerId: a.id, tile: 3 });
    expect(v.previous!.players.find((p) => p.id === a.id)!.position).toBe(0);
    expect(player(v, a.id).position).toBe(3);
    expect(await b.act({ type: 'buy', playerId: b.id })).toEqual({
      ok: false,
      error: 'Chưa tới lượt bạn',
    });
    expect(await a.act({ type: 'buy', playerId: a.id })).toEqual({ ok: true });
    v = await server.settle(code, phones);
    expect(v.game!.tiles[3]!.owner).toBe(a.id);
    expect(player(v, a.id).cash).toBe(440);
    // Hết việc: hỏi Kết thúc lượt hay Ụp/Mở trước khi sang người sau.
    expect(v.game!.pending).toEqual({ type: 'endTurn', playerId: a.id });
    expect(await a.act({ type: 'endTurn', playerId: a.id })).toEqual({ ok: true });
    v = await server.settle(code, phones);
    expect(v.game!.pending).toEqual({ type: 'roll', playerId: b.id });

    // B cũng đến ô 3: trả thuê 2Đ cho A.
    rng.queue.push(2, 1);
    expect(await b.act({ type: 'roll', playerId: b.id })).toEqual({ ok: true });
    v = await server.settle(code, phones);
    expect(v.game!.pending).toMatchObject({ type: 'pay', playerId: b.id, total: 2 });
    expect(await b.act({ type: 'pay', playerId: b.id })).toEqual({ ok: true });
    v = await server.settle(code, phones);
    expect(player(v, b.id).cash).toBe(498);
    expect(player(v, a.id).cash).toBe(442);
    expect(await b.act({ type: 'endTurn', playerId: b.id })).toEqual({ ok: true });
    v = await server.settle(code, phones);
    expect(v.game!.pending).toEqual({ type: 'roll', playerId: c.id });

    // C đổ đôi 2 + 2 vào ô Thuế (200Đ), được đổ thêm, rồi 3 + 4 đến ô 11 và không mua.
    rng.queue.push(2, 2);
    expect(await c.act({ type: 'roll', playerId: c.id })).toEqual({ ok: true });
    v = await server.settle(code, phones);
    expect(v.game!.pending).toMatchObject({ type: 'pay', playerId: c.id, total: 200 });
    expect(await c.act({ type: 'pay', playerId: c.id })).toEqual({ ok: true });
    v = await server.settle(code, phones);
    expect(v.game!.pending).toEqual({ type: 'roll', playerId: c.id });
    rng.queue.push(3, 4);
    expect(await c.act({ type: 'roll', playerId: c.id })).toEqual({ ok: true });
    v = await server.settle(code, phones);
    expect(v.game!.pending).toEqual({ type: 'buy', playerId: c.id, tile: 11 });
    expect(await c.act({ type: 'declineBuy', playerId: c.id })).toEqual({ ok: true });
    expect(await c.act({ type: 'endTurn', playerId: c.id })).toEqual({ ok: true });
    v = await server.settle(code, phones);

    expect(v.game!.pending).toEqual({ type: 'roll', playerId: a.id });
    expect(v.game!.turnNumber).toBe(4);
    expect(player(v, c.id)).toMatchObject({ cash: 300, position: 11 });
    expect(v.game!.tiles[11]!.owner).toBeNull();
    // Mọi máy giữ cùng một bản, phiên bản tăng đều.
    for (const p of phones) expect(p.view).toEqual(v);
    expect(v.version).toBe(server.app.rooms.get(code)!.version);
  });

  it('rời phòng giữa ván bị từ chối; đầu hàng thì ván kết thúc, phòng vẫn xem được', async () => {
    const { turn, code, phones } = await playing(3);
    const [a, b] = turn as [Phone, Phone];
    expect(await b.call('room:leave')).toEqual({
      ok: false,
      error: 'Đang trong ván, muốn rời thì dùng Đầu hàng',
    });
    expect(await b.act({ type: 'surrender', playerId: b.id })).toEqual({ ok: true });
    const v = await server.settle(code, phones);
    expect(v.phase).toBe('ended');
    expect(v.game!.pending).toEqual({ type: 'ended' });
    expect(v.game!.loserId).toBe(b.id);
    expect(await a.act({ type: 'roll', playerId: a.id })).toEqual({
      ok: false,
      error: 'Ván đã kết thúc',
    });
    // Ván xong: rời được (ghế vẫn còn, chỉ thành mất kết nối) và vào lại xem được.
    expect(await b.call('room:leave')).toEqual({ ok: true });
    const after = await a.waitFor((x) => x.seats.some((s) => s.id === b.id && !s.connected));
    expect(after.seats).toHaveLength(3);
    const again = await server.phone();
    await again.resume(b.ticket!);
    const seen = await again.waitFor((x) => x.phase === 'ended');
    expect(seen.game!.loserId).toBe(b.id);
  });

  it('đổi màu trong ván: ghế đổi theo, màu của người khác thì bị từ chối', async () => {
    const { turn, code, phones } = await playing(2);
    const [a, b] = turn as [Phone, Phone];
    const theirs = player(phones[0]!.view!, b.id).color;
    expect(
      await a.act({ type: 'changeAppearance', playerId: a.id, color: theirs, icon: 15 }),
    ).toEqual({ ok: false, error: 'Màu đã có người dùng' });
    expect(await a.act({ type: 'changeAppearance', playerId: a.id, color: 6, icon: 15 })).toEqual({
      ok: true,
    });
    const v = await server.settle(code, phones);
    expect(player(v, a.id)).toMatchObject({ color: 6, icon: 15 });
    expect(v.seats.find((s) => s.id === a.id)).toMatchObject({ color: 6, icon: 15 });
  });
});

describe('mất kết nối giữa ván', () => {
  it('rớt mạng rồi vào lại bằng vé: giữ ghế, nhận trạng thái và chơi tiếp', async () => {
    const { turn, code, phones } = await playing(3);
    const [a, b, c] = turn as [Phone, Phone, Phone];
    const ticket = b.ticket!;
    b.socket.disconnect();
    let v = await a.waitFor((x) => x.seats.some((s) => s.id === b.id && !s.connected));
    expect(v.phase).toBe('playing');

    // Trong lúc B vắng, A vẫn chơi.
    rng.queue.push(1, 2);
    expect(await a.act({ type: 'roll', playerId: a.id })).toEqual({ ok: true });
    expect(await a.act({ type: 'declineBuy', playerId: a.id })).toEqual({ ok: true });
    expect(await a.act({ type: 'endTurn', playerId: a.id })).toEqual({ ok: true });

    const b2 = await server.phone();
    expect(await b2.resume(ticket)).toEqual(ticket);
    v = await server.settle(code, [a, b2, c]);
    expect(v.seats.find((s) => s.id === b.id)!.connected).toBe(true);
    expect(v.game!.pending).toEqual({ type: 'roll', playerId: b.id });
    rng.queue.push(5, 6);
    expect(await b2.act({ type: 'roll', playerId: b.id })).toEqual({ ok: true });
    v = await server.settle(code, [a, b2, c]);
    expect(player(v, b.id).position).toBe(11);
    // Socket cũ đã ngắt không nhận gì thêm.
    expect(b.view!.version).toBeLessThan(v.version);
    expect(phones).toContain(b);
  });
});
