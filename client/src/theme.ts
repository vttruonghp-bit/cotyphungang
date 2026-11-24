/** Một màu người chơi. `paint` là nền CSS (màu trơn hoặc dải chuyển màu), `stops` để tô hình SVG. */
export interface PlayerColor {
  name: string;
  /** Màu trơn cho viền, chữ, dải chủ (màu chuyển sắc lấy một màu đại diện). */
  main: string;
  /** Nền nhạt (nhật ký, thẻ người chơi). */
  soft: string;
  /** Nền CSS dùng cho viền quân, ô chọn màu, viền thẻ người chơi. */
  paint: string;
  /** Các điểm màu khi tô chuyển sắc; một màu trơn thì chỉ có một điểm. */
  stops: readonly string[];
}

const solid = (name: string, main: string, soft: string): PlayerColor => ({
  name,
  main,
  soft,
  paint: `linear-gradient(${main}, ${main})`,
  stops: [main],
});

const gradient = (name: string, main: string, soft: string, stops: string[]): PlayerColor => ({
  name,
  main,
  soft,
  paint: `linear-gradient(135deg, ${stops.join(', ')})`,
  stops,
});

/**
 * 10 màu người chơi: 8 màu trơn rồi 2 màu chuyển sắc (Lục sắc, Xanh vàng). `main` cho viền, chữ,
 * dải chủ; `soft` cho nền nhạt.
 */
export const PLAYER_COLORS: readonly PlayerColor[] = [
  solid('Xanh ngọc', '#12876f', '#e5f3ee'),
  solid('Tím', '#7b4fc0', '#f0eafa'),
  solid('Cam', '#dc7533', '#fcefe4'),
  solid('Xanh dương', '#3f78c2', '#e8f0fa'),
  solid('Hồng', '#c0518a', '#f9e9f1'),
  solid('Xám than', '#4c566a', '#eceef2'),
  solid('Vàng', '#d39b12', '#fbf2d9'),
  solid('Đỏ', '#d33d48', '#fbe7e8'),
  gradient('Lục sắc', '#5b3fd6', '#efeafd', [
    '#e53935',
    '#fb8c00',
    '#fdd835',
    '#43a047',
    '#1e88e5',
    '#8e24aa',
  ]),
  gradient('Xanh vàng', '#3f7d1c', '#eef5e2', ['#1565c0', '#26a69a', '#f9c80e']),
];

/** 31 kí hiệu quân cờ, cùng thứ tự với hình vẽ trong TokenIcon. */
export const ICON_NAMES = [
  'Lá',
  'Trăng',
  'Ô tô',
  'Thuyền',
  'Tàu hoả',
  'Mây',
  'Gió',
  'Chiếc giày',
  'Cái mũ',
  'Bàn tay',
  'Thỏ',
  'Táo cắn dở',
  'Ngôi nhà',
  'Nam sinh',
  'Nữ sinh',
  'Chữ thập',
  'Chữ vạn',
  'Búa liềm',
  'Ngôi sao',
  'Tên lửa',
  'Con chó',
  'Con bướm',
  'Con chim',
  'Bông hoa',
  'Máy bay',
  'Bác sĩ',
  'Mũ cử nhân',
  'Cái ghế',
  'Xe máy',
  'Thanh gươm',
  'Khẩu súng',
] as const;

/** Người chơi gợi ý khi tạo ván (tên, màu, kí hiệu khác nhau). */
export const DEFAULT_PLAYERS = [
  { name: 'Linh', color: 0, icon: 0 },
  { name: 'Minh', color: 1, icon: 1 },
  { name: 'An', color: 2, icon: 2 },
  { name: 'Vy', color: 3, icon: 3 },
  { name: 'Huy', color: 4, icon: 4 },
  { name: 'Nam', color: 5, icon: 10 },
] as const;

export const colorOf = (index: number): PlayerColor => PLAYER_COLORS[index] ?? PLAYER_COLORS[0]!;
