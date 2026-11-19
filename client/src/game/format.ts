import {
  BOARD,
  HOTEL_LEVEL,
  STATION_RENTS,
  UTILITY_MULTIPLIERS,
  downgradeRefund,
  sellValue,
  type GameState,
  type PlayerState,
  type Tile,
} from '@cotiphu/shared';

/** Số tiền: "480Đ". */
export const money = (n: number): string => `${n}Đ`;

/** Số tiền có dấu: "+200Đ", "−150Đ" (dấu trừ thật để dễ đọc). */
export const signed = (n: number): string => (n > 0 ? `+${n}Đ` : n < 0 ? `−${-n}Đ` : '0Đ');

/** Tên ngắn để vừa ô bàn cờ trên điện thoại. */
export const SHORT_NAMES: readonly string[] = [
  'Xuất phát',
  'Phố Cổ',
  'Khí Vận',
  'Đồng Xuân',
  'Thuế lương',
  'Ga Hà Nội',
  'Bưu Điện',
  'Cơ Hội',
  'Nhà Hát',
  'Tháp Rùa',
  'Metro · Tù',
  'Ba Đình',
  'Điện',
  'Hoàng Thành',
  'Văn Miếu',
  'Ga Vinh',
  'Hạ Long',
  'Khí Vận',
  'Sơn Đoòng',
  'Tràng An',
  'Bãi đỗ xe',
  'Cầu Rồng',
  'Cơ Hội',
  'Cung Đình',
  'Hội An',
  'Ga Đà Nẵng',
  'Dinh Độc Lập',
  'Đức Bà',
  'Nước',
  'Bến Nhà Rồng',
  'Vào Tù',
  'Bến Thành',
  'Landmark 81',
  'Khí Vận',
  'Bitexco',
  'Ga Sài Gòn',
  'Cơ Hội',
  'Tháp Chăm',
  'Thuế lợi tức',
  'Phú Quốc',
];

/** "05 Ga Hà Nội" cho lưới chọn ô. */
export const numbered = (i: number): string => `${String(i).padStart(2, '0')} ${SHORT_NAMES[i]}`;

export const tileName = (i: number): string => BOARD[i]!.name;

export function levelText(level: number): string {
  if (level <= 0) return 'Đất trống';
  if (level >= HOTEL_LEVEL) return 'Khách sạn';
  return `${level} nhà`;
}

export const playerById = (s: GameState, id: string | null | undefined): PlayerState | undefined =>
  id ? s.players.find((p) => p.id === id) : undefined;

/** Số ô (đất, ga, nhà máy) người chơi đang sở hữu. */
export const assetCount = (s: GameState, id: string): number =>
  s.tiles.filter((t) => t?.owner === id).length;

/** Tiền mặt nếu bán hết: hạ hết nhà / khách sạn rồi bán từng ô cho ngân hàng (ô đang cắm bán 5%). */
export function liquidationValue(s: GameState, id: string): number {
  const p = s.players.find((x) => x.id === id);
  let total = p?.cash ?? 0;
  s.tiles.forEach((t, i) => {
    const tile = BOARD[i]!;
    if (!t || t.owner !== id || !isOwnableTile(tile)) return;
    if (tile.kind === 'property') total += t.level * downgradeRefund(tile.upgradeCost);
    total += sellValue(tile.price, t.mortgaged);
  });
  return total;
}

export const isOwnableTile = (t: Tile): t is Extract<Tile, { price: number }> =>
  t.kind === 'property' || t.kind === 'station' || t.kind === 'utility';

/** Tiền thuê hiện tại của một ô để hiển thị (nhà máy là hệ số × tổng xúc xắc). */
export function rentText(s: GameState, i: number): string | null {
  const tile = BOARD[i]!;
  const t = s.tiles[i];
  if (!t || t.owner === null) return null;
  if (t.mortgaged) return 'Đang cắm · 0Đ';
  const active = (kind: Tile['kind']) =>
    s.tiles.filter((x, k) => x?.owner === t.owner && !x.mortgaged && BOARD[k]!.kind === kind)
      .length;
  if (tile.kind === 'property') return money(tile.rents[t.level]!);
  if (tile.kind === 'station') return money(STATION_RENTS[active('station')] ?? 0);
  if (tile.kind === 'utility') return `${UTILITY_MULTIPLIERS[active('utility')] ?? 0} × xúc xắc`;
  return null;
}
