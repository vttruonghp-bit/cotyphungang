// Các hằng số luật chơi (xem docs/luat-choi.md).

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export const BOARD_SIZE = 40;
export const GO_INDEX = 0;
/** Ô 10 vừa là Tù vừa là ga Metro (chỉ dùng Metro khi không bị giam). */
export const JAIL_INDEX = 10;
export const METRO_INDEX = JAIL_INDEX;
export const GO_TO_JAIL_INDEX = 30;

export const START_MONEY = 500;
export const GO_REWARD = 200;

export const JAIL_BAIL = 50;
export const MAX_JAIL_TURNS = 3;
export const MAX_DOUBLES_BEFORE_JAIL = 3;

/** Cấp công trình: 0 = đất trống, 1–4 = số nhà, 5 = khách sạn. */
export const MAX_BUILDING_LEVEL = 5;
export const HOTEL_LEVEL = MAX_BUILDING_LEVEL;

/** Tiền thuê ga theo số ga chưa bị cắm của chủ (chỉ số = số ga). */
export const STATION_RENTS = [0, 25, 50, 100, 200] as const;

/** Hệ số nhân tổng xúc xắc theo số nhà máy chưa bị cắm của chủ. */
export const UTILITY_MULTIPLIERS = [0, 4, 10] as const;

/** Tỉ lệ tính bằng phần trăm để giữ phép tính là số nguyên. */
export const MORTGAGE_PERCENT = 50;
export const REDEEM_PERCENT = 55;
export const SELL_PERCENT = 55;
/** Bán khi đang cắm: 5%, để cắm (50%) rồi bán bằng đúng bán thẳng (55%). */
export const SELL_MORTGAGED_PERCENT = 5;
export const DOWNGRADE_PERCENT = 50;

/** Phí đi Metro: một nửa tiền mặt hiện có, làm tròn xuống. */
export const METRO_FEE_PERCENT = 50;

/** Thời gian chờ mặc định cho mỗi thao tác (giây). */
export const ACTION_TIMEOUT_SECONDS = 60;

/** Số giao dịch gần nhất hiển thị trong nhật ký. */
export const LOG_VISIBLE_ENTRIES = 15;

/** Số màu và số biểu tượng người chơi được chọn. */
export const PLAYER_COLOR_COUNT = 10;
export const PLAYER_ICON_COUNT = 31;
