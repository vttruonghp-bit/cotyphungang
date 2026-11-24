import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type TestServer } from './helpers';

let dist: string;
let server: TestServer;

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'cotiphu-dist-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Cờ tỉ phú</title>');
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
  writeFileSync(join(dist, 'favicon.svg'), '<svg/>');
  server = await startServer({ clientDist: dist });
});

afterAll(async () => {
  await server.close();
  rmSync(dist, { recursive: true, force: true });
});

/** Gửi đúng đường dẫn thô (fetch tự bỏ "..", nên dùng http.request). */
function raw(path: string, method = 'GET') {
  return new Promise<{ status: number; type: string; cache: string; body: string }>(
    (resolve, reject) => {
      const { hostname, port } = new URL(server.url);
      const req = request({ hostname, port, path, method }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (body += c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            type: String(res.headers['content-type'] ?? ''),
            cache: String(res.headers['cache-control'] ?? ''),
            body,
          }),
        );
      });
      req.on('error', reject);
      req.end();
    },
  );
}

describe('máy chủ phục vụ giao diện đã build', () => {
  it('/health trả ok', async () => {
    const r = await raw('/health');
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ ok: true });
  });

  it('trang chủ và link mời /?phong=MÃ đều trả index.html', async () => {
    for (const path of ['/', '/?phong=ABC234', '/phong/ABC234']) {
      const r = await raw(path);
      expect(r.status, path).toBe(200);
      expect(r.type).toBe('text/html; charset=utf-8');
      expect(r.cache).toBe('no-cache');
      expect(r.body).toContain('Cờ tỉ phú');
    }
  });

  it('tệp tĩnh có đúng loại, tệp trong assets được lưu đệm lâu', async () => {
    const js = await raw('/assets/app-abc123.js');
    expect(js).toMatchObject({ status: 200, type: 'text/javascript; charset=utf-8' });
    expect(js.cache).toContain('immutable');
    expect(js.body).toBe('console.log(1)');
    const svg = await raw('/favicon.svg');
    expect(svg).toMatchObject({ status: 200, type: 'image/svg+xml', cache: 'no-cache' });
    const head = await raw('/favicon.svg', 'HEAD');
    expect(head).toMatchObject({ status: 200, body: '' });
  });

  it('tệp không có thì 404, không trả nhầm index.html', async () => {
    expect((await raw('/assets/khong-co.js')).status).toBe(404);
  });

  it('không đọc được tệp ngoài thư mục giao diện', async () => {
    for (const path of [
      '/../package.json',
      '/%2e%2e/%2e%2e/package.json',
      '/..%2f..%2fpackage.json',
      '/assets/..%2f..%2f..%2fpackage.json',
    ]) {
      const r = await raw(path);
      expect(r.status, path).toBe(404);
      expect(r.body).not.toContain('"name"');
    }
    expect((await raw('/%E0%A4%A')).status).toBe(404);
    expect((await raw('/a%00.js')).status).toBe(404);
  });

  it('chỉ nhận GET và HEAD', async () => {
    expect((await raw('/', 'POST')).status).toBe(405);
  });

  it('Socket.IO vẫn chạy cùng cổng', async () => {
    const p = await server.phone();
    const t = await p.create({ name: 'A', color: 0, icon: 0 });
    expect(t.code).toHaveLength(6);
  });
});

describe('khi chưa build giao diện', () => {
  it('báo cần chạy npm run build', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'cotiphu-empty-'));
    const s = await startServer({ clientDist: empty });
    try {
      const res = await fetch(`${s.url}/`);
      expect(res.status).toBe(404);
      expect(await res.text()).toContain('npm run build');
      expect((await fetch(`${s.url}/health`)).status).toBe(200);
    } finally {
      await s.close();
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
