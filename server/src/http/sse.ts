/**
 * Server-Sent Events: o navegador abre /api/events com EventSource (nativo, reconecta sozinho).
 * Toda (re)conexão começa com `snapshot`; depois vêm deltas (upsert/remove/metrics/engine).
 * Escolhido em vez de WebSocket: o fluxo é só servidor → cliente e não precisa da lib `ws`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SECURITY_HEADERS } from './static.ts';

export class SseHub {
  private readonly clients = new Set<ServerResponse>();
  private readonly max: number;
  private seq = 0;
  private readonly beat: ReturnType<typeof setInterval>;

  constructor(max = 50) {
    this.max = max;
    // comentário a cada 20 s mantém proxies/NAT sem derrubar a conexão ociosa
    this.beat = setInterval(() => { for (const c of this.clients) c.write(': ping\n\n'); }, 20_000);
    this.beat.unref();
  }

  get size(): number {
    return this.clients.size;
  }

  /** Abre a conexão e manda as mensagens iniciais (hello + snapshot). */
  open(req: IncomingMessage, res: ServerResponse, initial: Array<[string, unknown]>): void {
    if (this.clients.size >= this.max) {
      res.writeHead(503, { ...SECURITY_HEADERS, 'retry-after': '30' }).end('Muitas conexões');
      return;
    }
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    for (const [event, data] of initial) this.write(res, event, data);
    this.clients.add(res);
    req.on('close', () => this.clients.delete(res));
  }

  broadcast(event: string, data: unknown): void {
    if (!this.clients.size) return;
    const msg = this.format(event, data);
    for (const c of this.clients) c.write(msg);
  }

  close(): void {
    clearInterval(this.beat);
    for (const c of this.clients) c.end();
    this.clients.clear();
  }

  private write(res: ServerResponse, event: string, data: unknown): void {
    res.write(this.format(event, data));
  }

  private format(event: string, data: unknown): string {
    return `id: ${++this.seq}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }
}
