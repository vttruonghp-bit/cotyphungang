/**
 * Kiểm tra mọi dữ liệu trình duyệt gửi lên. Không tin gì cả: sai kiểu, sai độ dài
 * hay thừa trường đều được xử lý ở đây trước khi chạm vào phòng hoặc bộ luật.
 */
import {
  BOARD_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLOR_COUNT,
  PLAYER_ICON_COUNT,
  PLAYER_NAME_MAX,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type Action,
  type ManageOp,
  type Profile,
  type SeatTicket,
} from '@cotiphu/shared';
import { fail, ok, type Result } from './result';

/** Bản nháp Ụp/Mở dài nhất nhận được (thanh lý cả bàn cờ vẫn dưới mức này). */
export const MAX_MANAGE_OPS = 256;

export const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const isInt = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;

const isTile = (x: unknown): x is number => isInt(x, 0, BOARD_SIZE - 1);

export function parseName(x: unknown): Result<string> {
  if (typeof x !== 'string' || x.length > 200) return fail('Tên không hợp lệ');
  const name = x
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim();
  const length = [...name].length;
  if (length === 0) return fail('Hãy nhập tên');
  if (length > PLAYER_NAME_MAX) return fail(`Tên dài tối đa ${PLAYER_NAME_MAX} kí tự`);
  return ok(name);
}

export function parseProfile(x: unknown): Result<Profile> {
  if (!isRecord(x)) return fail('Thiếu tên, màu hoặc biểu tượng');
  const name = parseName(x.name);
  if (!name.ok) return name;
  if (!isInt(x.color, 0, PLAYER_COLOR_COUNT - 1)) return fail('Màu không hợp lệ');
  if (!isInt(x.icon, 0, PLAYER_ICON_COUNT - 1)) return fail('Biểu tượng không hợp lệ');
  return ok({ name: name.value, color: x.color, icon: x.icon });
}

export function parseCapacity(x: unknown): Result<number> {
  if (!isInt(x, MIN_PLAYERS, MAX_PLAYERS)) {
    return fail(`Số người phải từ ${MIN_PLAYERS} đến ${MAX_PLAYERS}`);
  }
  return ok(x);
}

const CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Mã phòng: bỏ khoảng trắng, nhận cả chữ thường. */
export function parseCode(x: unknown): Result<string> {
  if (typeof x !== 'string' || x.length > 32) return fail('Mã phòng không hợp lệ');
  const code = x.replace(/\s+/g, '').toUpperCase();
  if (!CODE_PATTERN.test(code)) return fail('Mã phòng không đúng');
  return ok(code);
}

export function parseTicket(x: unknown): Result<SeatTicket> {
  const bad = fail('Vé vào phòng không hợp lệ');
  if (!isRecord(x)) return bad;
  const code = parseCode(x.code);
  if (!code.ok) return bad;
  const { playerId, token } = x;
  if (typeof playerId !== 'string' || playerId.length === 0 || playerId.length > 32) return bad;
  if (typeof token !== 'string' || token.length === 0 || token.length > 128) return bad;
  return ok({ code: code.value, playerId, token });
}

const SIMPLE_ACTIONS = new Set([
  'roll',
  'rollCardDice',
  'confirmCardDice',
  'payBail',
  'useJailCard',
  'buy',
  'declineBuy',
  'cancelPurchase',
  'cancelUpgrade',
  'upgrade',
  'skipUpgrade',
  'pay',
  'surrender',
] as const);
type SimpleAction = typeof SIMPLE_ACTIONS extends Set<infer T> ? T : never;
const isSimple = (t: string): t is SimpleAction => SIMPLE_ACTIONS.has(t as SimpleAction);

const MANAGE_OPS = new Set<string>(['downgrade', 'mortgage', 'sell', 'redeem']);

function parseOps(x: unknown): Result<ManageOp[]> {
  if (!Array.isArray(x) || x.length === 0) return fail('Chưa có thay đổi nào');
  if (x.length > MAX_MANAGE_OPS) return fail('Bản nháp quá dài');
  const ops: ManageOp[] = [];
  for (const op of x) {
    if (!isRecord(op) || typeof op.op !== 'string' || !MANAGE_OPS.has(op.op) || !isTile(op.tile)) {
      return fail('Thao tác Ụp/Mở không hợp lệ');
    }
    ops.push({ op: op.op as ManageOp['op'], tile: op.tile });
  }
  return ok(ops);
}

/**
 * Thao tác trong ván của ghế `playerId`. Dựng lại một bản sạch chỉ có các trường
 * bộ luật cần; không nhận 'timeout' (chỉ máy chủ được gửi) và không làm thay người khác.
 */
export function parseAction(x: unknown, playerId: string): Result<Action> {
  if (!isRecord(x) || typeof x.type !== 'string') return fail('Thao tác không hợp lệ');
  if (x.type === 'timeout') return fail('Chỉ máy chủ được báo hết giờ');
  if (typeof x.playerId !== 'string') return fail('Thao tác không hợp lệ');
  if (x.playerId !== playerId) return fail('Bạn chỉ được thao tác cho chính mình');
  const t = x.type;
  if (isSimple(t)) return ok({ type: t, playerId });
  switch (t) {
    case 'metro': {
      const d = x.destination;
      if (d !== null && !isTile(d)) return fail('Ô đích Metro không hợp lệ');
      return ok({ type: 'metro', playerId, destination: d });
    }
    case 'manage': {
      const ops = parseOps(x.ops);
      return ops.ok ? ok({ type: 'manage', playerId, ops: ops.value }) : ops;
    }
    case 'chooseTile':
      if (!isTile(x.tile)) return fail('Không chọn được ô này');
      return ok({ type: 'chooseTile', playerId, tile: x.tile });
    case 'changeAppearance':
      if (!isInt(x.color, 0, PLAYER_COLOR_COUNT - 1)) return fail('Màu không hợp lệ');
      if (!isInt(x.icon, 0, PLAYER_ICON_COUNT - 1)) return fail('Biểu tượng không hợp lệ');
      return ok({ type: 'changeAppearance', playerId, color: x.color, icon: x.icon });
    default:
      return fail('Thao tác không hợp lệ');
  }
}
