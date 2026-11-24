import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { profile, scriptRng, startServer, type Phone, type TestServer } from './helpers';

let server: TestServer;
let rng: ReturnType<typeof scriptRng>;

afterEach(async () => {
  await server.close();
});

/** Phòng `n` người đã vào ván. `turn` = các điện thoại theo thứ tự đi, bắt đầu từ người đi trước. */
async function playing(n: number) {
  const host = await server.phone();
  const { code } = await host.create(profile('Chủ', 0, 0));
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
  return { code, phones, turn, view: v };
}

describe('rời ván quá hạn thì máy chủ chơi hộ', () => {
  beforeEach(async () => {
    rng = scriptRng(5);
    // Vắng 40ms là chơi hộ, nhịp 10ms: test không phải chờ 3 phút như lúc chạy thật.
    server = await startServer({ rng, autoPlayAfterMs: 40, autoPlayEveryMs: 10 });
  });

  it('đi hộ người đang giữ lượt, và trả quyền khi người đó quay lại', async () => {
    const { code, turn, view } = await playing(2);
    const [away, watcher] = turn as [Phone, Phone];
    const ticket = away.ticket!;
    const turnBefore = view.game!.turnNumber;

    away.socket.disconnect();
    const taken = await watcher.waitFor((v) =>
      v.seats.some((s) => s.id === ticket.playerId && s.auto),
    );
    expect(taken.seats.find((s) => s.id === ticket.playerId)).toMatchObject({
      connected: false,
      auto: true,
    });

    // Bot đi hết lượt của người vắng mặt rồi chuyển lượt, nên ván không tắc.
    const moved = await watcher.waitFor((v) => v.game!.turnNumber > turnBefore);
    expect(moved.game!.log.length).toBeGreaterThan(view.game!.log.length);

    // Quay lại: ghế có kết nối lại và máy chủ thôi chơi hộ ngay.
    const back = await server.phone();
    await back.resume(ticket);
    const returned = await back.waitFor((v) =>
      v.seats.every((s) => s.id !== ticket.playerId || (s.connected && !s.auto)),
    );
    expect(returned.code).toBe(code);
  });
});

describe('chưa quá hạn thì không ai chơi hộ', () => {
  beforeEach(async () => {
    rng = scriptRng(5);
    server = await startServer({ rng, autoPlayAfterMs: 60_000, autoPlayEveryMs: 10 });
  });

  it('mất kết nối một lúc vẫn giữ nguyên lượt của người chơi', async () => {
    const { code, turn, view } = await playing(2);
    const [away, watcher] = turn as [Phone, Phone];
    const ticket = away.ticket!;

    away.socket.disconnect();
    await watcher.waitFor((v) => v.seats.some((s) => s.id === ticket.playerId && !s.connected));
    await new Promise((r) => setTimeout(r, 120));

    const room = server.app.rooms.get(code)!;
    expect(room.seats.find((s) => s.id === ticket.playerId)!.auto).toBe(false);
    expect(room.game!.turnNumber).toBe(view.game!.turnNumber);
    expect(room.game!.pending.type).toBe('roll');
  });
});
