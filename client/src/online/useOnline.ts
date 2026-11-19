import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  CHAT_HISTORY_MAX,
  type Ack,
  type Action,
  type ChatMessage,
  type GameState,
  type Profile,
  type RoomView,
  type SeatRole,
  type SeatTicket,
} from '@cotiphu/shared';
import { getSocket, request, whenConnected, type GameSocket } from './socket';
import { toGameState } from './view';
import { loadTicket, saveTicket } from './storage';

/** idle: chưa cần máy chủ (chưa vào phòng). offline: đã vào phòng nhưng đang rớt mạng. */
export type ConnStatus = 'idle' | 'connecting' | 'online' | 'offline';

/** Ván online ở dạng màn ván dùng (giống chơi chung một máy). */
export interface OnlineGame {
  game: GameState;
  previous: GameState | null;
  /** Tăng mỗi khi ván đổi (không tính đổi kết nối), để màn ván biết có thao tác mới. */
  actions: number;
}

export interface Online {
  status: ConnStatus;
  /** Vé ghế của máy này, có ngay từ lúc tải trang nếu đã lưu. */
  ticket: SeatTicket | null;
  /** Phòng của vé, null khi chưa nhận được trạng thái từ máy chủ. */
  room: RoomView | null;
  view: OnlineGame | null;
  /** Lời nhắn cho màn đầu: phòng đã đóng, không vào lại được… */
  notice: string | null;
  /** Tin nhắn gần đây trong phòng, cũ trước mới sau. */
  chat: readonly ChatMessage[];
  /** Gửi tin nhắn; trả lỗi hoặc null khi máy chủ đã nhận. */
  sendChat(text: string): Promise<string | null>;
  create(profile: Profile): Promise<string | null>;
  /** Chơi chung một máy cho khách xem: tạo phòng và vào ván ngay. */
  createLocal(players: Profile[]): Promise<string | null>;
  join(code: string, profile: Profile): Promise<string | null>;
  profile(profile: Profile): Promise<string | null>;
  role(role: SeatRole): Promise<string | null>;
  addBot(): Promise<string | null>;
  removeBot(id: string): Promise<string | null>;
  start(): Promise<string | null>;
  leave(): Promise<string | null>;
  /** Gửi thao tác trong ván; trả lỗi hoặc null khi máy chủ đã nhận (và đã gửi trạng thái mới). */
  action(action: Action): Promise<string | null>;
  /** Bỏ vé và về màn đầu (Ván mới sau khi ván kết thúc, hoặc thôi ván cũ để vào phòng mới). */
  forget(): void;
  /** Thôi chờ vào lại: báo rời phòng nếu còn mạng (phòng chờ thì nhả ghế), rồi bỏ vé. */
  abandon(): Promise<void>;
  clearNotice(): void;
}

const OFFLINE = 'Mất kết nối với máy chủ, đang nối lại…';
const NO_SERVER = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
const SLOW = 'Máy chủ không trả lời. Thử lại nhé.';
/** Đợi trạng thái mới sau khi máy chủ nhận thao tác, tối đa chừng này. */
const STATE_WAIT_MS = 1500;
const RESUME_RETRY_MS = 2000;
/** Bỏ ghế: chờ máy chủ nhận lời rời phòng tối đa chừng này rồi vẫn bỏ vé. */
const ABANDON_WAIT_MS = 2000;

interface Data {
  room: RoomView | null;
  view: OnlineGame | null;
}

type Send<T> = (s: GameSocket, done: (res: T) => void) => void;

/** Kết nối chơi online: phòng, ghế của mình, trạng thái mạng và các yêu cầu gửi máy chủ. */
export function useOnline(): Online {
  const [ticket, setTicketState] = useState<SeatTicket | null>(loadTicket);
  const ticketRef = useRef(ticket);
  const [status, setStatus] = useState<ConnStatus>(ticket ? 'connecting' : 'idle');
  const [data, setData] = useState<Data>({ room: null, view: null });
  const [notice, setNotice] = useState<string | null>(null);
  const [chat, setChat] = useState<readonly ChatMessage[]>([]);
  // Ván lần trước (dạng chuỗi) để chỉ tăng `actions` khi ván thật sự đổi.
  const last = useRef<{ json: string; view: OnlineGame | null }>({ json: '', view: null });
  // Số lần đã nhận trạng thái phòng; ai đang chờ trạng thái mới thì nằm trong `waiters`.
  const states = useRef(0);
  const waiters = useRef<(() => void)[]>([]);
  // Thao tác gửi lần lượt; bấm hai lần cùng một thao tác chỉ gửi một lần.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const inflight = useRef(new Map<string, Promise<string | null>>());

  const setTicket = useCallback((t: SeatTicket | null) => {
    ticketRef.current = t;
    saveTicket(t);
    setTicketState(t);
  }, []);

  const drop = useCallback(
    (why: string | null) => {
      setTicket(null);
      setData({ room: null, view: null });
      setChat([]);
      last.current = { json: '', view: null };
      setNotice(why);
    },
    [setTicket],
  );

  useEffect(() => {
    const s = getSocket();

    const resume = async (t: SeatTicket) => {
      const res = await request<Ack<SeatTicket>>((done) => s.emit('room:resume', t, done));
      if (ticketRef.current !== t) return; // đã bỏ vé trong lúc chờ
      if (res === null) {
        // Máy chủ chậm: thử lại khi vẫn còn kết nối.
        setTimeout(() => {
          if (ticketRef.current === t && s.connected) void resume(t);
        }, RESUME_RETRY_MS);
        return;
      }
      if (res.ok) setTicket(res.data);
      else drop(`Không vào lại được phòng ${t.code}: ${res.error}`);
    };

    const onConnect = () => {
      setStatus('online');
      const t = ticketRef.current;
      if (t) void resume(t);
    };
    const onDisconnect = () => setStatus(ticketRef.current ? 'offline' : 'idle');
    const onError = () => {
      if (ticketRef.current) setStatus('offline');
    };
    const onState = (room: RoomView) => {
      states.current += 1;
      let view: OnlineGame | null = null;
      if (room.game) {
        const json = JSON.stringify(room.game);
        const prev = last.current;
        view =
          json === prev.json && prev.view
            ? prev.view
            : {
                game: toGameState(room.game),
                previous: room.previous ? toGameState(room.previous) : null,
                actions: (prev.view?.actions ?? 0) + 1,
              };
        last.current = { json, view };
      }
      // Vẽ ngay từng trạng thái (không gộp hai trạng thái tới sát nhau), để màn ván không bỏ sót
      // lá thẻ vừa rút khi người khác đi tiếp ngay sau đó.
      flushSync(() => setData({ room, view }));
      for (const wake of waiters.current.splice(0)) wake();
    };
    const onClosed = (reason: string) => drop(reason || 'Phòng đã đóng.');
    const onHistory = (list: ChatMessage[]) => setChat(list.slice(-CHAT_HISTORY_MAX));
    const onMessage = (m: ChatMessage) =>
      setChat((list) =>
        list.some((x) => x.id === m.id) ? list : [...list, m].slice(-CHAT_HISTORY_MAX),
      );

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onError);
    s.on('room:state', onState);
    s.on('room:closed', onClosed);
    s.on('chat:history', onHistory);
    s.on('chat:message', onMessage);
    if (ticketRef.current) {
      if (s.connected) onConnect();
      else s.connect();
    }
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onError);
      s.off('room:state', onState);
      s.off('room:closed', onClosed);
      s.off('chat:history', onHistory);
      s.off('chat:message', onMessage);
    };
  }, [drop, setTicket]);

  /**
   * Máy chủ trả lời trước rồi mới gửi trạng thái phòng: chờ trạng thái tới (tối đa một lúc) để
   * màn vẽ lại và thao tác sau (trả nợ sau khi thanh lý) dựa trên phòng đã đổi.
   */
  const nextState = useCallback((seen: number): Promise<void> => {
    if (states.current !== seen) return Promise.resolve();
    return new Promise((resolve) => {
      waiters.current.push(resolve);
      setTimeout(resolve, STATE_WAIT_MS);
    });
  }, []);

  /** Tạo hoặc vào phòng: tự mở kết nối, nhận vé rồi lưu lại. */
  const enter = useCallback(
    async (send: Send<Ack<SeatTicket>>): Promise<string | null> => {
      const s = getSocket();
      if (!(await whenConnected(s))) {
        if (!ticketRef.current) s.disconnect();
        return NO_SERVER;
      }
      const seen = states.current;
      const res = await request<Ack<SeatTicket>>((done) => send(s, done));
      if (!res) return SLOW;
      if (!res.ok) return res.error;
      await nextState(seen);
      setNotice(null);
      setTicket(res.data);
      setStatus('online');
      return null;
    },
    [setTicket, nextState],
  );

  /**
   * Yêu cầu khi đã ở trong phòng; xong khi máy chủ đã nhận và (nếu `wait`) trạng thái mới đã tới.
   */
  const simple = useCallback(
    async (send: Send<Ack>, wait = true): Promise<string | null> => {
      const s = getSocket();
      if (!s.connected) return OFFLINE;
      const seen = states.current;
      const res = await request<Ack>((done) => send(s, done));
      if (!res) return SLOW;
      if (!res.ok) return res.error;
      if (wait) await nextState(seen);
      return null;
    },
    [nextState],
  );

  const action = useCallback(
    (a: Action): Promise<string | null> => {
      const key = JSON.stringify(a);
      const same = inflight.current.get(key);
      if (same) return same;
      const p = chain.current.then(() => simple((s, done) => s.emit('game:action', a, done)));
      chain.current = p;
      inflight.current.set(key, p);
      void p.finally(() => inflight.current.delete(key));
      return p;
    },
    [simple],
  );

  const create = useCallback(
    (profile: Profile) => enter((s, done) => s.emit('room:create', { profile }, done)),
    [enter],
  );
  const createLocal = useCallback(
    (players: Profile[]) => enter((s, done) => s.emit('room:local', { players }, done)),
    [enter],
  );
  const join = useCallback(
    (code: string, profile: Profile) =>
      enter((s, done) => s.emit('room:join', { code, profile }, done)),
    [enter],
  );
  const profile = useCallback(
    (p: Profile) => simple((s, done) => s.emit('room:profile', p, done)),
    [simple],
  );
  const role = useCallback(
    (r: SeatRole) => simple((s, done) => s.emit('room:role', r, done)),
    [simple],
  );
  const addBot = useCallback(() => simple((s, done) => s.emit('room:addBot', done)), [simple]);
  const removeBot = useCallback(
    (id: string) => simple((s, done) => s.emit('room:removeBot', id, done)),
    [simple],
  );
  const start = useCallback(() => simple((s, done) => s.emit('room:start', done)), [simple]);
  // Tin nhắn không đổi trạng thái phòng nên không chờ `room:state`.
  const sendChat = useCallback(
    (text: string) => simple((s, done) => s.emit('chat:send', text, done), false),
    [simple],
  );
  const leave = useCallback(async () => {
    // Người rời phòng không nhận trạng thái phòng nữa nên không chờ.
    const err = await simple((s, done) => s.emit('room:leave', done), false);
    if (err === null) drop(null);
    return err;
  }, [simple, drop]);

  const forget = useCallback(() => {
    drop(null);
    getSocket().disconnect();
  }, [drop]);
  const abandon = useCallback(async () => {
    // Gửi sau lời vào lại nên máy chủ xử lí sau nó. Đang chơi thì máy chủ từ chối: ghế giữ nguyên.
    const s = getSocket();
    if (s.connected) await request<Ack>((done) => s.emit('room:leave', done), ABANDON_WAIT_MS);
    forget();
  }, [forget]);
  const clearNotice = useCallback(() => setNotice(null), []);

  const room = ticket && data.room?.code === ticket.code ? data.room : null;
  return {
    status,
    ticket,
    room,
    view: room ? data.view : null,
    notice,
    chat: room ? chat : [],
    sendChat,
    create,
    createLocal,
    join,
    profile,
    role,
    addBot,
    removeBot,
    start,
    leave,
    action,
    forget,
    abandon,
    clearNotice,
  };
}
