/**
 * Dựng máy chủ HTTP + Socket.IO (chưa mở cổng). Dùng chung cho chạy thật và cho test.
 */
import { createServer, type Server as HttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { Rng } from '@cotiphu/shared';
import { cryptoRng } from './game-room';
import { ROOM_IDLE_MS, Rooms } from './rooms';
import { attachRoomHandlers, type IoServer } from './socket-handlers';
import { staticFiles } from './static-files';

/** Giao diện đã build, cạnh thư mục server. */
export const DEFAULT_CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));

/** Vite khi phát triển (các trang khác cùng cổng thì không cần CORS). */
export const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export interface AppOptions {
  /** Thư mục giao diện đã build; null để không phục vụ giao diện. */
  clientDist?: string | null;
  /** Trang ở cổng khác được phép kết nối Socket.IO. */
  corsOrigins?: string[];
  /** Nguồn ngẫu nhiên cho xúc xắc và bộ thẻ (test thay bằng bản có kịch bản). */
  rng?: Rng;
  /** Phòng không ai mở bao lâu thì xóa, và bao lâu kiểm tra một lần. */
  idleMs?: number;
  sweepEveryMs?: number;
  /** Nhân thời gian chờ của bot giữa hai thao tác (test dùng 0). */
  botSpeed?: number;
}

export interface AppServer {
  httpServer: HttpServer;
  io: IoServer;
  rooms: Rooms;
  /** Ngắt mọi kết nối và đóng cổng. */
  close(): Promise<void>;
}

export function createAppServer(options: AppOptions = {}): AppServer {
  const dist = options.clientDist === undefined ? DEFAULT_CLIENT_DIST : options.clientDist;
  const serveClient = dist === null ? null : staticFiles(dist);

  const httpServer = createServer((req, res) => {
    if (req.url === '/health' || req.url?.startsWith('/health?')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (serveClient) return serveClient(req, res);
    res.writeHead(404);
    res.end();
  });

  const io: IoServer = new Server(httpServer, {
    cors: { origin: options.corsOrigins ?? DEV_ORIGINS },
    serveClient: false,
    // Thao tác lớn nhất là bản nháp Ụp/Mở, vài KB là đủ.
    maxHttpBufferSize: 64 * 1024,
  });

  const rooms = new Rooms();
  const handlers = attachRoomHandlers(io, rooms, options.rng ?? cryptoRng, options.botSpeed);

  const idleMs = options.idleMs ?? ROOM_IDLE_MS;
  const sweeper = setInterval(() => rooms.sweep(idleMs), options.sweepEveryMs ?? 10 * 60 * 1000);
  sweeper.unref();

  return {
    httpServer,
    io,
    rooms,
    close: () =>
      new Promise((resolve) => {
        clearInterval(sweeper);
        handlers.stop();
        // io.close() đóng luôn httpServer; lỗi "chưa mở cổng" thì bỏ qua.
        void io.close(() => resolve());
      }),
  };
}
