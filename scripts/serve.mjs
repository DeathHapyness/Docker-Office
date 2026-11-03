// Servidor estático mínimo (node:http) para o frontend — sem dependências.
// Somente leitura: GET/HEAD de arquivos dentro de web/ e das libs em VENDOR.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', 'web');
// Bibliotecas servidas direto de node_modules (sem bundler): /vendor/<pacote>/...
const VENDOR = new Map([['three', resolve(import.meta.dirname, '..', 'node_modules', 'three')]]);
const PORT = Number(process.env.PORT ?? 8420);
// Padrão 0.0.0.0 para acesso pela LAN. Use HOST=127.0.0.1 para restringir à máquina local.
const HOST = process.env.HOST ?? '0.0.0.0';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.map': 'application/json',
};
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "frame-ancestors 'none'",
};

const fail = (code) => Object.assign(new Error(String(code)), { status: code });

/** true se `path` está dentro de `base` (evita o falso positivo de prefixo: web vs web-outra). */
const inside = (base, path) => path === base || path.startsWith(base + sep);

createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw fail(405);
    const url = new URL(req.url ?? '/', 'http://x');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0')) throw fail(400);
    const vendor = /^\/vendor\/([^/]+)\/(.*)$/.exec(pathname);
    const base = vendor ? VENDOR.get(vendor[1]) : ROOT;
    if (!base) throw fail(404);
    let path = normalize(join(base, vendor ? vendor[2] : pathname));
    if (!inside(base, path)) throw fail(403);
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (err) {
    const code = [400, 403, 405].includes(err.status) ? err.status : 404;
    const text = { 400: 'Requisição inválida', 403: 'Proibido', 405: 'Método não permitido', 404: 'Não encontrado' }[code];
    res.writeHead(code, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' });
    res.end(text);
  }
}).listen(PORT, HOST, () => console.log(`Docker Office em http://${HOST}:${PORT}`));
