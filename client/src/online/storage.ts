import {
  PLAYER_COLOR_COUNT,
  PLAYER_ICON_COUNT,
  PLAYER_NAME_MAX,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type Profile,
  type SeatTicket,
} from '@cotiphu/shared';

const TICKET_KEY = 'cotiphu.online.v1';
const PROFILE_KEY = 'cotiphu.profile.v1';

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Trình duyệt chặn lưu trữ: vẫn chơi được, chỉ không tự vào lại khi tải lại trang.
  }
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

const isIndex = (n: unknown, total: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < total;

/** Vé vào lại ghế đã lưu (sau khi tạo hoặc vào phòng). */
export function loadTicket(): SeatTicket | null {
  const t = read(TICKET_KEY) as Partial<SeatTicket> | null;
  return t && isText(t.code) && isText(t.playerId) && isText(t.token)
    ? { code: t.code, playerId: t.playerId, token: t.token }
    : null;
}

export const saveTicket = (t: SeatTicket | null) => write(TICKET_KEY, t);

/** Chuẩn hóa mã phòng người dùng gõ: chữ hoa, bỏ kí tự không có trong bảng mã. */
export function cleanCode(text: string): string {
  return [...text.toUpperCase()]
    .filter((ch) => ROOM_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);
}

/** Mã phòng trong đường dẫn mời (?phong=CODE), null nếu không có. */
export function codeFromUrl(): string | null {
  const raw = new URLSearchParams(location.search).get('phong');
  const code = raw ? cleanCode(raw) : '';
  return code.length === ROOM_CODE_LENGTH ? code : null;
}

/** Bỏ ?phong= khỏi thanh địa chỉ (đã vào phòng hoặc đã thôi), giữ các tham số khác. */
export function dropCodeFromUrl() {
  const url = new URL(location.href);
  if (!url.searchParams.has('phong')) return;
  url.searchParams.delete('phong');
  history.replaceState(null, '', url);
}

/** Đường dẫn mời vào phòng. */
export const inviteLink = (code: string) => `${location.origin}/?phong=${code}`;

/** Tên gọn: bỏ khoảng trắng thừa, tối đa PLAYER_NAME_MAX kí tự. */
export const cleanName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').slice(0, PLAYER_NAME_MAX);

const randomIndex = (total: number) => Math.floor(Math.random() * total);

/** Hồ sơ lần trước trên máy này; lần đầu chọn ngẫu nhiên màu và kí hiệu để ít trùng. */
export function loadProfile(): Profile {
  const p = read(PROFILE_KEY) as Partial<Profile> | null;
  if (
    p &&
    typeof p.name === 'string' &&
    isIndex(p.color, PLAYER_COLOR_COUNT) &&
    isIndex(p.icon, PLAYER_ICON_COUNT)
  ) {
    return { name: p.name.slice(0, PLAYER_NAME_MAX), color: p.color, icon: p.icon };
  }
  return { name: '', color: randomIndex(PLAYER_COLOR_COUNT), icon: randomIndex(PLAYER_ICON_COUNT) };
}

export const saveProfile = (p: Profile) => write(PROFILE_KEY, p);
