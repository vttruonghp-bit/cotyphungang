import { describe, expect, it } from 'vitest';
import { PLAYER_NAME_MAX } from '@cotiphu/shared';
import {
  MAX_MANAGE_OPS,
  parseAction,
  parsePlayers,
  parseRole,
  parseCode,
  parseName,
  parseProfile,
  parseTicket,
} from '../src/validate';

const error = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error);

describe('tên người chơi', () => {
  it('bỏ khoảng trắng thừa, gộp khoảng trắng giữa, chuẩn hóa dấu tiếng Việt', () => {
    expect(parseName('  Lan \t  Anh  ')).toEqual({ ok: true, value: 'Lan Anh' });
    // "Đức" gõ kiểu dấu rời (NFD) thành dạng dựng sẵn (NFC).
    expect(parseName('\u0110u\u031b\u0301c')).toEqual({ ok: true, value: 'Đức' });
    expect(parseName('A\u200bB\u0007')).toEqual({ ok: true, value: 'AB' });
  });

  it(`từ 1 đến ${PLAYER_NAME_MAX} kí tự (đếm theo chữ, kể cả biểu tượng cảm xúc)`, () => {
    expect(parseName('Nguyễn Thị Hà')).toEqual({ ok: false, error: 'Tên dài tối đa 12 kí tự' });
    expect(parseName('Nguyễn Thị H')).toEqual({ ok: true, value: 'Nguyễn Thị H' });
    expect(parseName('😀'.repeat(12)).ok).toBe(true);
    expect(error(parseName(''))).toBe('Hãy nhập tên');
    expect(error(parseName('   '))).toBe('Hãy nhập tên');
    expect(error(parseName(undefined))).toBe('Tên không hợp lệ');
    expect(error(parseName('x'.repeat(1000)))).toBe('Tên không hợp lệ');
  });

  it('hồ sơ chỉ giữ tên, màu, biểu tượng', () => {
    expect(parseProfile({ name: 'An', color: 9, icon: 30, isHost: true })).toEqual({
      ok: true,
      value: { name: 'An', color: 9, icon: 30 },
    });
    expect(error(parseProfile({ name: 'An', color: 1.5, icon: 0 }))).toBe('Màu không hợp lệ');
    expect(error(parseProfile({ name: 'An', color: NaN, icon: 0 }))).toBe('Màu không hợp lệ');
    expect(error(parseProfile({ name: 'An', color: 0, icon: 31 }))).toBe('Biểu tượng không hợp lệ');
    expect(error(parseProfile('An'))).toBe('Thiếu tên, màu hoặc biểu tượng');
  });
});

describe('số người, mã phòng, vé', () => {
  it('chơi chung một máy: 2–6 người, mỗi người đủ tên, màu, kí hiệu', () => {
    const p = (name: string, k: number) => ({ name, color: k, icon: k });
    expect(parsePlayers([p('A', 0), p(' B ', 1)])).toEqual({
      ok: true,
      value: [p('A', 0), p('B', 1)],
    });
    for (const bad of [[p('A', 0)], Array.from({ length: 7 }, (_, k) => p('A', k)), 'A', null]) {
      expect(error(parsePlayers(bad))).toBe('Số người phải từ 2 đến 6');
    }
    expect(error(parsePlayers([p('A', 0), p('', 1)]))).toBe('Hãy nhập tên');
  });

  it('vai chỉ là người chơi hoặc khách quan sát', () => {
    expect(parseRole('player')).toEqual({ ok: true, value: 'player' });
    expect(parseRole('spectator')).toEqual({ ok: true, value: 'spectator' });
    for (const bad of ['bot', '', null, 1]) expect(parseRole(bad).ok).toBe(false);
  });

  it('mã phòng 6 kí tự trong bảng chữ, nhận chữ thường và khoảng trắng', () => {
    expect(parseCode(' abc 234 ')).toEqual({ ok: true, value: 'ABC234' });
    for (const bad of ['ABC23', 'ABC2345', 'ABCDE0', 'ABCDEO', 'ABCDE1', 'ABCDEI', 'ABCDEL', 5]) {
      expect(parseCode(bad).ok, String(bad)).toBe(false);
    }
  });

  it('vé phải đủ mã phòng, mã ghế, token dạng chuỗi', () => {
    expect(parseTicket({ code: 'abc234', playerId: 'p1', token: 't' })).toEqual({
      ok: true,
      value: { code: 'ABC234', playerId: 'p1', token: 't' },
    });
    const bad = [
      { code: 'ABC234', playerId: 'p1' },
      { code: 'ABC234', playerId: '', token: 't' },
      { code: 'ABC234', playerId: 'p1', token: 'x'.repeat(129) },
      { code: 'ABC', playerId: 'p1', token: 't' },
      'ABC234',
    ];
    for (const t of bad) expect(error(parseTicket(t))).toBe('Vé vào phòng không hợp lệ');
  });
});

describe('thao tác trong ván', () => {
  it('dựng lại thao tác sạch, bỏ trường thừa', () => {
    expect(parseAction({ type: 'roll', playerId: 'p1', dice: [6, 6] })).toEqual({
      ok: true,
      value: { type: 'roll', playerId: 'p1' },
    });
    expect(parseAction({ type: 'metro', playerId: 'p1', destination: null })).toEqual({
      ok: true,
      value: { type: 'metro', playerId: 'p1', destination: null },
    });
    expect(
      parseAction({ type: 'manage', playerId: 'p1', ops: [{ op: 'mortgage', tile: 3, cash: 1 }] }),
    ).toEqual({
      ok: true,
      value: { type: 'manage', playerId: 'p1', ops: [{ op: 'mortgage', tile: 3 }] },
    });
  });

  it('cho phép hoàn tác mua tự nguyện qua máy chủ', () => {
    expect(parseAction({ type: 'cancelPurchase', playerId: 'p1' })).toEqual({
      ok: true,
      value: { type: 'cancelPurchase', playerId: 'p1' },
    });
  });

  it('không nhận hết giờ, mã người chơi phải là chuỗi ngắn', () => {
    expect(error(parseAction({ type: 'timeout' }))).toBe('Chỉ máy chủ được báo hết giờ');
    for (const playerId of [undefined, '', 5, 'x'.repeat(33)]) {
      expect(error(parseAction({ type: 'pay', playerId }))).toBe('Thao tác không hợp lệ');
    }
    expect(error(parseAction({ type: 'toString', playerId: 'p1' }))).toBe('Thao tác không hợp lệ');
  });

  it('bản nháp Ụp/Mở có giới hạn độ dài', () => {
    const ops = Array.from({ length: MAX_MANAGE_OPS + 1 }, () => ({ op: 'sell', tile: 1 }));
    expect(error(parseAction({ type: 'manage', playerId: 'p1', ops }))).toBe('Bản nháp quá dài');
  });
});
