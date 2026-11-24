import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import {
  seededRng,
  type Ack,
  type Action,
  type ClientToServerEvents,
  type Profile,
  type Rng,
  type RoomView,
  type SeatTicket,
  type ServerToClientEvents,
} from '@cotiphu/shared';
import { createAppServer, type AppOptions, type AppServer } from '../src/app';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
/** Gửi dữ liệu tùy ý (kể cả sai kiểu) như một trình duyệt xấu. */
type RawEmit = { emit(event: string, ...args: unknown[]): void };

/** Chờ đến khi `fn` trả giá trị khác rỗng. */
export async function until<T>(fn: () => T | null | undefined | false, ms = 2000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('Hết thời gian chờ');
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Nguồn ngẫu nhiên cho test: lấy số trong `queue` trước, hết thì dùng bản có hạt giống. */
export function scriptRng(seed = 1): Rng & { queue: number[] } {
  const base = seededRng(seed);
  const queue: number[] = [];
  return {
    queue,
    int(min, max) {
      const v = queue.shift();
      if (v === undefined) return base.int(min, max);
      if (v < min || v > max) throw new Error(`Số kịch bản ${v} nằm ngoài [${min}, ${max}]`);
      return v;
    },
  };
}

/** Một điện thoại: một kết nối Socket.IO, nhớ mọi trạng thái và thông báo đóng phòng đã nhận. */
export class Phone {
  readonly states: RoomView[] = [];
  readonly closed: string[] = [];
  ticket: SeatTicket | null = null;

  constructor(readonly socket: ClientSocket) {
    socket.on('room:state', (v) => this.states.push(v));
    socket.on('room:closed', (r) => this.closed.push(r));
  }

  get view(): RoomView | undefined {
    return this.states[this.states.length - 1];
  }

  get id(): string {
    if (!this.ticket) throw new Error('Chưa có ghế');
    return this.ticket.playerId;
  }

  /** Gửi một sự kiện kèm ack; tham số không cần đúng kiểu. */
  call<T = void>(event: string, ...args: unknown[]): Promise<Ack<T>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Không có phản hồi cho ${event}`)), 2000);
      (this.socket as unknown as RawEmit).emit(event, ...args, (res: Ack<T>) => {
        clearTimeout(timer);
        resolve(res);
      });
    });
  }

  /** Gửi không kèm ack. */
  send(event: string, ...args: unknown[]): void {
    (this.socket as unknown as RawEmit).emit(event, ...args);
  }

  private async seat(res: Promise<Ack<SeatTicket>>): Promise<SeatTicket> {
    const r = await res;
    if (!r.ok) throw new Error(r.error);
    this.ticket = r.data;
    return r.data;
  }

  create(profile: Profile): Promise<SeatTicket> {
    return this.seat(this.call<SeatTicket>('room:create', { profile }));
  }

  /** Chơi chung một máy cho khách xem: người đầu là chủ phòng (máy này). */
  local(players: Profile[]): Promise<SeatTicket> {
    return this.seat(this.call<SeatTicket>('room:local', { players }));
  }

  join(code: string, profile: Profile): Promise<SeatTicket> {
    return this.seat(this.call<SeatTicket>('room:join', { code, profile }));
  }

  resume(ticket: SeatTicket): Promise<SeatTicket> {
    return this.seat(this.call<SeatTicket>('room:resume', ticket));
  }

  act(action: Action): Promise<Ack> {
    return this.call('game:action', action);
  }

  /** Chờ trạng thái mới nhất thỏa `pred`. */
  waitFor(pred: (v: RoomView) => boolean): Promise<RoomView> {
    return until(() => (this.view && pred(this.view) ? this.view : undefined));
  }
}

export interface TestServer {
  app: AppServer;
  url: string;
  phone(): Promise<Phone>;
  /** Chờ mọi điện thoại trong phòng nhận được trạng thái mới nhất của máy chủ. */
  settle(code: string, phones: Phone[]): Promise<RoomView>;
  close(): Promise<void>;
}

export async function startServer(options: AppOptions = {}): Promise<TestServer> {
  const app = createAppServer({ clientDist: null, ...options });
  await new Promise<void>((r) => app.httpServer.listen(0, '127.0.0.1', r));
  const { port } = app.httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const sockets: ClientSocket[] = [];

  return {
    app,
    url,
    async phone() {
      const socket: ClientSocket = connect(url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });
      sockets.push(socket);
      await until(() => socket.connected);
      return new Phone(socket);
    },
    async settle(code, phones) {
      const room = app.rooms.get(code);
      if (!room) throw new Error(`Không có phòng ${code}`);
      await until(() => phones.every((p) => p.view?.version === room.version));
      return phones[0]!.view!;
    },
    async close() {
      for (const s of sockets) s.disconnect();
      await app.close();
    },
  };
}

export const profile = (name: string, color: number, icon: number): Profile => ({
  name,
  color,
  icon,
});
