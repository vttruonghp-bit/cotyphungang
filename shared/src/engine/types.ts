import type { DeckKind, KeepableCard } from '../types';

export type PlayerStatus = 'active' | 'bankrupt' | 'surrendered';

export interface HeldCard {
  cardId: string;
  kind: KeepableCard;
}

export interface PlayerState {
  id: string;
  name: string;
  /** Chỉ số màu 0–7. */
  color: number;
  /** Chỉ số biểu tượng 0–19. */
  icon: number;
  cash: number;
  position: number;
  inJail: boolean;
  /** Số lần đã thử đổ đôi trong tù. */
  jailAttempts: number;
  heldCards: HeldCard[];
  status: PlayerStatus;
}

export interface TileState {
  owner: string | null;
  /** 0 = đất trống, 1–4 = số nhà, 5 = khách sạn (chỉ đất màu). */
  level: number;
  mortgaged: boolean;
  /** Số lượt lúc mua, để chặn nâng cấp ngay trong lượt mua. */
  boughtTurn: number | null;
}

export interface Creditor {
  /** null = Ngân hàng. */
  playerId: string | null;
  amount: number;
}

export type PayReason =
  'rent' | 'tax' | 'card' | 'jailBail' | 'purchase' | 'upgrade' | 'fortuneMirror' | 'swapPenalty';

/** Việc ván đang chờ một người chơi làm. */
export type Pending =
  /** Đầu lượt hoặc lượt thêm sau đổ đôi: nút Sục. */
  | { type: 'roll'; playerId: string }
  | { type: 'rollCardDice'; playerId: string }
  | { type: 'confirmCardDice'; playerId: string }
  /** Đầu lượt khi đang ở tù: thử đổ đôi, trả 50Đ, hoặc dùng thẻ. */
  | { type: 'jail'; playerId: string }
  /** Lần thử thứ 3 không ra đôi và có thẻ ra tù: chọn trả 50Đ hoặc dùng thẻ, rồi đi `steps`. */
  | { type: 'jailRelease'; playerId: string; steps: number }
  | { type: 'buy'; playerId: string; tile: number }
  /** Card is drawn; player must roll and confirm before its effect changes game state. */
  | { type: 'cardDice'; playerId: string; cardId: string; dice: number[] | null; highwayTile?: number }
  /** Dừng ở đất của mình: nâng 1 cấp, hoặc chuộc (+ nâng lên 1 nhà nếu là đất màu). */
  | { type: 'upgrade'; playerId: string; tile: number; mode: 'build' | 'redeemBuild' | 'redeem' }
  | { type: 'metro'; playerId: string }
  /** Khoản phải trả. `confirm` = người chơi phải tự bấm (Trả tiền / Là nó). */
  | {
      type: 'pay';
      playerId: string;
      creditors: Creditor[];
      total: number;
      reason: PayReason;
      confirm: boolean;
      /** Ô được nhận sau khi trả (thẻ bắt buộc mua). */
      grantTile?: number;
      /** Voluntary house upgrade performed only after payment is completed. */
      upgradeTile?: number;
      /** Dòng nhật ký khi trả, ví dụ "Trả thuê Hội An". */
      label?: string;
    }
  | {
      type: 'chooseTile';
      playerId: string;
      purpose: 'highway' | 'gambleUp' | 'gambleDown';
      options: number[];
    }
  | { type: 'ended' };

/** Việc đã xếp hàng, chưa tới lượt xử lý. */
export type Step =
  | Pending
  /** Di chuyển ra khỏi tù sau khi trả bảo lãnh ở lần thử thứ 3. */
  | { type: 'moveAfterJail'; playerId: string; steps: number }
  /** Kẻ khóc người cười, tính sau khi thẻ của người rút làm xong. */
  | { type: 'fortuneMirror'; drawerId: string; net: number };

export interface LogEntry {
  turn: number;
  playerId: string | null;
  text: string;
  /** Thay đổi tiền của người thực hiện (nếu có). */
  amount?: number;
}

/** Chi tiết riêng của một số thẻ, để giao diện hiện lại diễn biến. */
export type CardDetail =
  /** Xúc xắc thẻ tự gieo: Xổ số (1 viên), Tàu bay, tiền 10 × của thẻ Đất/Ga gần nhất. */
  | { kind: 'dice'; dice: number[] }
  | {
      kind: 'fire';
      rolls: { playerId: string; dice: [number, number] }[];
      total: number;
      target: number;
      /** Ô đích có công trình và bị hạ 1 cấp. */
      hit: boolean;
    }
  | {
      kind: 'restructure';
      cash: { playerId: string; cash: number }[];
      average: number;
      before: number;
    }
  | {
      kind: 'swap';
      opponentId: string;
      /** Các lần gieo viên 1 (gieo lại khi lớn hơn số đối thủ). */
      die1: number[];
      die2: number;
      /** Đất màu rẻ nhất của người rút, null nếu không có. */
      mine: number | null;
      /** Tài sản lấy của đối thủ, null nếu đối thủ không có. */
      theirs: number | null;
    }
  | { kind: 'gamble'; mine: number; average: number };

/** Những gì vừa xảy ra trong thao tác cuối cùng, để giao diện hiện xúc xắc, thẻ và đường đi. */
export type GameEvent =
  /** Đổ 2 xúc xắc để đi, hoặc thử đổ đôi trong tù. */
  | { type: 'roll'; playerId: string; dice: [number, number]; jail: boolean }
  | { type: 'move'; playerId: string; from: number; to: number; passedGo: boolean }
  | { type: 'jail'; playerId: string }
  | { type: 'card'; playerId: string; cardId: string; detail?: CardDetail }
  /** Thẻ Mở đường cao tốc: ô đã chọn, viên xúc xắc và ô đến. */
  | { type: 'highway'; playerId: string; tile: number; die: number; to: number };

export interface GameState {
  players: PlayerState[];
  /** Chỉ số người đang chơi lượt trong `players`. */
  current: number;
  /** Tăng mỗi khi chuyển sang người kế tiếp. */
  turnNumber: number;
  /** Người đang chơi đã đổ xúc xắc trong lượt này chưa (khóa Ụp/Mở đầu lượt). */
  rolled: boolean;
  doublesCount: number;
  /** Lần đổ vừa rồi là đôi và được thêm lượt. */
  extraRoll: boolean;
  lastDice: [number, number] | null;
  /** Ô người chơi vừa đến bằng chính lần đổ 2 xúc xắc (để tính tiền nhà máy). */
  arrivedByRoll: boolean;
  tiles: (TileState | null)[];
  decks: Record<DeckKind, string[]>;
  pending: Pending;
  queue: Step[];
  log: LogEntry[];
  /** Diễn biến của thao tác cuối cùng (xóa đầu mỗi thao tác). */
  events: GameEvent[];
  loserId: string | null;
}

export interface NewPlayer {
  id: string;
  name: string;
  color: number;
  icon: number;
}

export type ManageOp =
  | { op: 'downgrade'; tile: number }
  | { op: 'mortgage'; tile: number }
  | { op: 'sell'; tile: number }
  | { op: 'redeem'; tile: number };

export type Action =
  | { type: 'roll'; playerId: string }
  | { type: 'payBail'; playerId: string }
  | { type: 'useJailCard'; playerId: string }
  | { type: 'buy'; playerId: string }
  | { type: 'declineBuy'; playerId: string }
  | { type: 'cancelPurchase'; playerId: string }
  | { type: 'cancelUpgrade'; playerId: string }
  | { type: 'upgrade'; playerId: string }
  | { type: 'skipUpgrade'; playerId: string }
  /** null = ở lại ô 10. */
  | { type: 'metro'; playerId: string; destination: number | null }
  | { type: 'pay'; playerId: string }
  /** Bản nháp Ụp/Mở đã xác nhận: các thao tác áp dụng lần lượt, sai một thì bỏ cả. */
  | { type: 'manage'; playerId: string; ops: ManageOp[] }
  | { type: 'chooseTile'; playerId: string; tile: number }
  | { type: 'surrender'; playerId: string }
  | { type: 'changeAppearance'; playerId: string; color: number; icon: number }
  /** Máy chủ gửi khi hết 60 giây: làm thay việc đang chờ theo mặc định. */
  | { type: 'timeout' };

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string };
