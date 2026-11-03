/**
 * Arquivos estáticos do frontend (somente leitura): web/ e libs em node_modules (/vendor/<pacote>/).
 * gzip em memória + ETag/304; bloqueia path traversal.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.map': 'application/json',
};
const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.svg', '.map']);

export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  // Só a própria página ou a extensão de nova aba (extras/newtab-extension) podem embutir o app.
  'content-security-policy': "frame-ancestors 'self' chrome-extension: moz-extension:",
};

interface Cached { etag: string; body: Buffer; gz: Buffer | null }
const cache = new Map<string, Cached>();

async function load(path: string): Promise<Cached> {
  const st = await stat(path);
  const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  const hit = cache.get(path);
  if (hit?.etag === etag) return hit;
  const body = await readFile(path);
  const entry = { etag, body, gz: COMPRESS.has(extname(path)) && body.length > 1024 ? gzipSync(body, { level: 6 }) : null };
  cache.set(path, entry);
  return entry;
}

/** true se `path` está dentro de `base` (evita o falso positivo de prefixo: web vs web-outra). */
const inside = (base: string, path: string): boolean => path === base || path.startsWith(base + sep);

export function createStatic(root: string, vendor: ReadonlyMap<string, string>) {
  return async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const vm = /^\/vendor\/([^/]+)\/(.*)$/.exec(pathname);
    const base = vm ? vendor.get(vm[1]!) : root;
    let code = 404;
    try {
      if (!base) throw 404;
      if (pathname.includes('\0')) throw 400;
      let path = normalize(join(base, vm ? vm[2]! : pathname));
      if (!inside(base, path)) throw 403;
      if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
      const file = await load(path);
      const headers: Record<string, string | number> = {
        ...SECURITY_HEADERS,
        'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
        // libs versionadas podem ficar em cache; o app revalida sempre (barato: 304)
        'cache-control': vm ? 'public, max-age=86400' : 'no-cache',
        etag: file.etag,
        vary: 'accept-encoding',
      };
      if (req.headers['if-none-match'] === file.etag) {
        res.writeHead(304, headers).end();
        return;
      }
      const gzip = file.gz && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
      const body = gzip ? file.gz! : file.body;
      if (gzip) headers['content-encoding'] = 'gzip';
      headers['content-length'] = body.length;
      res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : body);
      return;
    } catch (err) {
      code = typeof err === 'number' ? err : 404;
    }
    const text = { 400: 'Requisição inválida', 403: 'Proibido' }[code as 400 | 403] ?? 'Não encontrado';
    res.writeHead(code, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' }).end(text);
  };
}
