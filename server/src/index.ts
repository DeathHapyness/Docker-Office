/**
 * Docker Office — servidor: frontend estático + API somente leitura (/api/health, /api/events).
 * Roda direto com Node ≥ 22.18 (TypeScript sem build): `node server/src/index.ts`.
 */
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { loadConfig } from './config.ts';
import { DockerApi } from './docker/api.ts';
import { Engine } from './docker/engine.ts';
import { Store } from './domain/store.ts';
import { SseHub } from './http/sse.ts';
import { SECURITY_HEADERS, createStatic } from './http/static.ts';

const cfg = loadConfig();
const ROOT = resolve(import.meta.dirname, '..', '..');
const serveStatic = createStatic(resolve(ROOT, 'web'), new Map([['three', resolve(ROOT, 'node_modules', 'three')]]));
const VERSION = '0.2.0';

const store = new Store();
const hub = new SseHub(cfg.maxClients);
const engine = cfg.demo ? undefined : new Engine(new DockerApi(cfg.docker), store, {
  snapshot: () => hub.broadcast('snapshot', snapshot()),
  upsert: (v) => hub.broadcast('upsert', v),
  remove: (id) => hub.broadcast('remove', { id }),
  metrics: (items) => hub.broadcast('metrics', items),
  engine: (status, reason) => hub.broadcast('engine', { status, reason }),
}, cfg.metricsMs);

function snapshot(): unknown {
  return { engine: engine?.status ?? 'connected', reason: engine?.reason, containers: store.views() };
}

function authorized(url: URL, auth: string | undefined): boolean {
  if (!cfg.token) return true;
  const given = url.searchParams.get('token') ?? auth?.replace(/^Bearer\s+/i, '') ?? '';
  const a = Buffer.from(given), b = Buffer.from(cfg.token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const json = (status: number, body: unknown) => [status, {
  ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
}, JSON.stringify(body)] as const;

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...SECURITY_HEADERS, allow: 'GET, HEAD' }).end('Método não permitido');
    return;
  }
  let url: URL, pathname: string;
  try {
    url = new URL(req.url ?? '/', 'http://x');
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, SECURITY_HEADERS).end('Requisição inválida');
    return;
  }
  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  if (!authorized(url, req.headers.authorization)) {
    const [s, h, b] = json(401, { error: 'token inválido ou ausente' });
    res.writeHead(s, h).end(b);
    return;
  }
  if (pathname === '/api/health') {
    const [s, h, b] = json(200, {
      ok: true, version: VERSION, mode: cfg.demo ? 'demo' : 'live',
      engine: engine?.status ?? 'connected', reason: engine?.reason || undefined,
      containers: store.ids().length, clients: hub.size, metricsMs: cfg.metricsMs,
    });
    res.writeHead(s, h).end(b);
    return;
  }
  if (pathname === '/api/events' && !cfg.demo) {
    hub.open(req, res, [['hello', { version: VERSION, metricsMs: cfg.metricsMs }], ['snapshot', snapshot()]]);
    return;
  }
  const [s, h, b] = json(404, { error: 'não encontrado' });
  res.writeHead(s, h).end(b);
});

server.listen(cfg.port, cfg.host, () => {
  console.log(`Docker Office em http://${cfg.host}:${cfg.port} — modo ${cfg.demo ? 'demonstração' : 'ao vivo'}` +
    (cfg.token ? ' (token exigido em /api)' : ''));
  engine?.start();
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    engine?.stop();
    hub.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
