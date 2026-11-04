/**
 * Docker Office — servidor: frontend estático + API somente leitura (/api/health, /api/events).
 * Roda direto com Node ≥ 22.18 (TypeScript sem build): `node server/src/index.ts`.
 */
import { createServer, type IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import { Auth, AuthError, MIN_PASSWORD } from './auth.ts';
import { loadConfig } from './config.ts';
import { DockerApi } from './docker/api.ts';
import { Engine } from './docker/engine.ts';
import { Store } from './domain/store.ts';
import { SseHub } from './http/sse.ts';
import { SECURITY_HEADERS, createStatic } from './http/static.ts';

const cfg = loadConfig();
const ROOT = resolve(import.meta.dirname, '..', '..');
const serveStatic = createStatic(resolve(ROOT, 'web'), new Map([['three', resolve(ROOT, 'node_modules', 'three')]]));
const VERSION = '0.3.0';
const auth = new Auth(cfg.dataDir, cfg.token);

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

function given(url: URL, req: IncomingMessage): string {
  return url.searchParams.get('token') ?? req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
}

/** Corpo JSON pequeno. Exigir application/json barra formulários de outros sites (CSRF sem preflight). */
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new AuthError(415, 'Envie JSON');
  const origin = req.headers.origin;
  if (origin && origin !== 'null') {
    let host = '';
    try { host = new URL(origin).host; } catch { /* inválido */ }
    if (host !== req.headers.host) throw new AuthError(403, 'Origem não permitida');
  }
  let body = '';
  for await (const c of req) {
    body += c;
    if (body.length > 4096) throw new AuthError(413, 'Corpo grande demais');
  }
  try {
    const v = JSON.parse(body) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch { /* cai no erro abaixo */ }
  throw new AuthError(400, 'JSON inválido');
}

const json = (status: number, body: unknown) => [status, {
  ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
}, JSON.stringify(body)] as const;

const server = createServer(async (req, res) => {
  const isPost = req.method === 'POST';
  if (req.method !== 'GET' && req.method !== 'HEAD' && !isPost) {
    res.writeHead(405, { ...SECURITY_HEADERS, allow: 'GET, HEAD, POST' }).end('Método não permitido');
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
  const send = (status: number, body: unknown): void => {
    const [s, h, b] = json(status, body);
    res.writeHead(s, h).end(b);
  };
  if (!pathname.startsWith('/api/')) {
    if (isPost) return send(405, { error: 'método não permitido' });
    return serveStatic(req, res, pathname);
  }

  // Acesso: público, para a página saber se mostra a configuração inicial ou o login
  if (pathname === '/api/auth' && !isPost) {
    return send(200, { mode: auth.mode, authed: auth.check(given(url, req)), minPassword: MIN_PASSWORD });
  }
  if (isPost && (pathname === '/api/setup' || pathname === '/api/login')) {
    try {
      const body = await readJson(req);
      const pw = typeof body.password === 'string' ? body.password : '';
      if (pathname === '/api/setup') {
        const choice = body.mode === 'open' ? 'open' : body.mode === 'password' ? 'password' : undefined;
        if (!choice) throw new AuthError(400, 'Escolha "open" ou "password"');
        const token = await auth.setup(choice, pw);
        console.log(`[auth] acesso configurado: ${choice === 'open' ? 'aberto (sem senha)' : 'com senha'} (por ${req.socket.remoteAddress ?? '?'} · ${req.headers['user-agent'] ?? 'sem user-agent'})`);
        return send(200, { mode: auth.mode, token });
      }
      return send(200, { token: await auth.login(pw, req.socket.remoteAddress ?? '?') });
    } catch (err) {
      const status = err instanceof AuthError ? err.status : 500;
      if (status === 500) console.error('[auth]', err);
      return send(status, { error: (err as Error).message });
    }
  }
  if (isPost) return send(404, { error: 'não encontrado' });

  if (!auth.check(given(url, req))) {
    return send(401, { error: auth.mode === 'setup' ? 'acesso ainda não configurado' : 'senha ou token ausente/inválido', mode: auth.mode });
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

const ACCESS: Record<string, string> = {
  setup: 'acesso ainda não configurado: a primeira pessoa a abrir a página escolhe senha ou aberto',
  open: 'acesso aberto (sem senha)',
  password: 'acesso com senha',
  token: 'token exigido em /api (DOCKER_OFFICE_TOKEN)',
};

await auth.load();
server.listen(cfg.port, cfg.host, () => {
  console.log(`Docker Office em http://${cfg.host}:${cfg.port} — modo ${cfg.demo ? 'demonstração' : 'ao vivo'} · ${ACCESS[auth.mode]}`);
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
