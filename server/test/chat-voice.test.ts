import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage, VoiceSignal } from '@cotiphu/shared';
import { CHAT_BURST, CHAT_TOO_FAST } from '../src/rooms';
import { profile, startServer, until, type TestServer } from './helpers';

let server: TestServer;

beforeEach(async () => {
  server = await startServer();
});

afterEach(async () => {
  await server.close();
});

async function room() {
  const a = await server.phone();
  const b = await server.phone();
  const c = await server.phone();
  const inbox = new Map<unknown, ChatMessage[]>();
  const signals = new Map<unknown, { from: string; signal: VoiceSignal }[]>();
  for (const p of [a, b, c]) {
    inbox.set(p, []);
    signals.set(p, []);
    p.socket.on('chat:history', (list) => inbox.set(p, [...list]));
    p.socket.on('chat:message', (m) => inbox.get(p)!.push(m));
    p.socket.on('voice:signal', (m) => signals.get(p)!.push(m));
  }
  const t = await a.create(profile('An', 0, 0));
  await b.join(t.code, profile('Bình', 1, 1));
  await c.join(t.code, profile('Chi', 2, 2));
  return { a, b, c, code: t.code, inbox, signals };
}

describe('chat trong phòng', () => {
  it('tin gửi tới cả phòng, nội dung được làm sạch; người vào lại nhận các tin cũ', async () => {
    const { a, b, c, inbox } = await room();
    expect(await a.call('chat:send', '  Chào   cả nhà \u0007 ')).toEqual({ ok: true });
    for (const p of [a, b, c]) await until(() => inbox.get(p)!.length === 1);
    expect(inbox.get(c)![0]).toMatchObject({ id: 1, from: a.id, text: 'Chào cả nhà' });

    expect(await b.call('chat:send', '   ')).toEqual({ ok: false, error: 'Tin nhắn trống' });
    expect((await b.call('chat:send', 'x'.repeat(201))).ok).toBe(false);
    expect((await b.call('chat:send', 42)).ok).toBe(false);

    // Trang mới của Chi nhận lại các tin gần đây.
    const c2 = await server.phone();
    let history: ChatMessage[] = [];
    c2.socket.on('chat:history', (list) => (history = list));
    await c2.resume(c.ticket!);
    await until(() => history.length === 1);
    expect(history[0]!.text).toBe('Chào cả nhà');
  });

  it('gửi dồn dập quá số tin cho phép thì bị từ chối', async () => {
    const { a } = await room();
    for (let i = 0; i < CHAT_BURST; i++)
      expect((await a.call('chat:send', `tin ${i}`)).ok).toBe(true);
    expect(await a.call('chat:send', 'nữa')).toEqual({ ok: false, error: CHAT_TOO_FAST });
  });

  it('chưa vào phòng thì không chat được', async () => {
    const x = await server.phone();
    expect((await x.call('chat:send', 'hi')).ok).toBe(false);
  });
});

describe('kênh nói chuyện', () => {
  it('máy vào sau nhận danh sách máy đã ở trong kênh; tín hiệu chỉ tới đúng người', async () => {
    const { a, b, c, code, signals } = await room();
    expect(await a.call<string[]>('voice:join')).toEqual({ ok: true, data: [] });
    expect(await b.call<string[]>('voice:join')).toEqual({ ok: true, data: [a.id] });

    const offer: VoiceSignal = { kind: 'offer', sdp: 'v=0 offer' };
    expect(await b.call('voice:signal', { to: a.id, signal: offer })).toEqual({ ok: true });
    await until(() => signals.get(a)!.length === 1);
    expect(signals.get(a)![0]).toEqual({ from: b.id, signal: offer });
    expect(signals.get(c)!).toHaveLength(0);

    // Chi chưa vào kênh: không gửi được, cũng không nhận được.
    expect((await c.call('voice:signal', { to: a.id, signal: offer })).ok).toBe(false);
    expect((await a.call('voice:signal', { to: c.id, signal: offer })).ok).toBe(false);
    // Tín hiệu sai dạng bị chặn.
    expect((await a.call('voice:signal', { to: b.id, signal: { kind: 'x' } })).ok).toBe(false);

    // Bật mic: cả phòng thấy; rời kênh thì mic tắt theo.
    expect(await b.call('voice:mic', true)).toEqual({ ok: true });
    let v = await server.settle(code, [a, b, c]);
    expect(v.seats.find((s) => s.id === b.id)).toMatchObject({ voice: true, mic: true });
    expect((await c.call('voice:mic', true)).ok).toBe(false);
    await b.call('voice:leave');
    v = await server.settle(code, [a, b, c]);
    expect(v.seats.find((s) => s.id === b.id)).toMatchObject({ voice: false, mic: false });

    // Mất kết nối cũng ra khỏi kênh.
    a.socket.disconnect();
    v = await b.waitFor((x) => x.seats.some((s) => s.id === a.id && !s.connected));
    expect(v.seats.find((s) => s.id === a.id)).toMatchObject({ voice: false, mic: false });
  });
});
