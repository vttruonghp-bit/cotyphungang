import { useCallback, useRef, useState } from 'react';
import {
  applyAction,
  createGame,
  seededRng,
  type Action,
  type GameState,
  type NewPlayer,
} from '@cotiphu/shared';

const STORAGE_KEY = 'cotiphu.hotseat.v1';

/** Ván đang chơi trên máy này: hạt giống + số thao tác đã làm, để mỗi thao tác có nguồn ngẫu nhiên riêng. */
export interface HotSeatGame {
  version: 1;
  seed: number;
  actions: number;
  game: GameState;
  /** Trạng thái ngay trước thao tác cuối (để hiện "trước → sau"). */
  previous: GameState | null;
}

/** Nguồn ngẫu nhiên cho thao tác thứ `k`, tái lập được từ hạt giống. */
const rngFor = (seed: number, k: number) => seededRng((seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0);

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]!;
}

function load(): HotSeatGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as HotSeatGame;
    return saved.version === 1 && Array.isArray(saved.game?.events) ? saved : null;
  } catch {
    return null;
  }
}

function save(g: HotSeatGame | null) {
  try {
    if (g) localStorage.setItem(STORAGE_KEY, JSON.stringify(g));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Trình duyệt chặn lưu trữ: ván vẫn chơi được, chỉ không giữ lại khi tải lại trang.
  }
}

export interface HotSeat {
  current: HotSeatGame | null;
  /** Tạo ván mới. Trả thông báo lỗi nếu người chơi không hợp lệ. */
  start(players: NewPlayer[]): string | null;
  /** Gửi một thao tác. Trả thông báo lỗi nếu luật không cho phép. */
  dispatch(action: Action): string | null;
  /** Bỏ ván đang chơi, về màn tạo ván. */
  quit(): void;
  /** Nạp sẵn một trạng thái (dùng cho ?scenario= khi phát triển). */
  load(game: GameState): void;
}

export function useHotSeat(): HotSeat {
  const [current, setCurrent] = useState<HotSeatGame | null>(load);
  // Bản mới nhất ngay sau mỗi thao tác: hai thao tác gửi liền nhau trong một lần bấm nối tiếp nhau.
  const latest = useRef(current);

  const commit = useCallback((g: HotSeatGame | null) => {
    save(g);
    latest.current = g;
    setCurrent(g);
  }, []);

  const start = useCallback(
    (players: NewPlayer[]) => {
      const seed = randomSeed();
      try {
        // Mở ván bằng lượt đổ xúc xắc chọn thứ tự: mỗi người tự bấm Xúc xắc của mình.
        const game = createGame(players, rngFor(seed, 0), true, true);
        commit({ version: 1, seed, actions: 1, game, previous: null });
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Không tạo được ván';
      }
    },
    [commit],
  );

  const dispatch = useCallback(
    (action: Action) => {
      const cur = latest.current;
      if (!cur) return 'Chưa có ván';
      const result = applyAction(cur.game, action, rngFor(cur.seed, cur.actions));
      if (!result.ok) return result.error;
      commit({
        ...cur,
        actions: cur.actions + 1,
        game: result.state,
        previous: cur.game,
      });
      return null;
    },
    [commit],
  );

  const quit = useCallback(() => commit(null), [commit]);

  const loadGame = useCallback((game: GameState) => {
    const g: HotSeatGame = { version: 1, seed: randomSeed(), actions: 1, game, previous: null };
    latest.current = g;
    setCurrent(g);
  }, []);

  return { current, start, dispatch, quit, load: loadGame };
}
