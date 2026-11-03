/**
 * Cliente mínimo da API do Docker Engine sobre node:http — sem dockerode.
 * Só faz GET (somente leitura). Alvo: socket Unix (dev) ou TCP do docker-socket-proxy (deploy).
 */
import { request, type IncomingMessage } from 'node:http';
import { NdjsonSplitter } from './ndjson.ts';

export interface DockerTarget {
  socketPath?: string;
  host?: string;
  port?: number;
}

/** Interpreta DOCKER_HOST: unix:///var/run/docker.sock (padrão) ou tcp://socket-proxy:2375. */
export function parseDockerHost(value = 'unix:///var/run/docker.sock'): DockerTarget {
  if (value.startsWith('unix://')) return { socketPath: value.slice('unix://'.length) };
  const m = /^(?:tcp|http):\/\/([^:/]+)(?::(\d+))?\/?$/.exec(value);
  if (m) return { host: m[1], port: Number(m[2] ?? 2375) };
  throw new Error(`DOCKER_HOST inválido: ${value} (use unix:///caminho ou tcp://host:porta)`);
}

/** Maior versão de API testada. Engines mais novos aceitam versões antigas dentro de [MinAPIVersion, ApiVersion]. */
export const MAX_API = '1.56';

const num = (v: string): number[] => v.split('.').map((x) => Number(x) || 0);
const cmp = (a: string, b: string): number => {
  const [x, y] = [num(a), num(b)];
  return (x[0]! - y[0]!) || ((x[1] ?? 0) - (y[1] ?? 0));
};

/**
 * Escolhe a versão de API: a do Engine, limitada à maior que testamos, sem ficar abaixo do mínimo
 * que ele aceita. Assim funciona tanto num Docker antigo (API < 1.41) quanto num novo que já
 * recusa versões velhas (o Engine 29 recusa < 1.44 por padrão).
 */
export function pickApiVersion(server: { ApiVersion?: string; MinAPIVersion?: string }): string | undefined {
  const max = server.ApiVersion;
  if (!max || !/^\d+\.\d+$/.test(max)) return undefined; // sem info: requisição sem versão (o Engine usa a dele)
  let v = cmp(max, MAX_API) > 0 ? MAX_API : max;
  const min = server.MinAPIVersion;
  if (min && /^\d+\.\d+$/.test(min) && cmp(v, min) < 0) v = min;
  return v;
}

export class DockerApi {
  private readonly target: DockerTarget;
  private prefix?: Promise<string>;
  /** Versão negociada (para log e /api/health). */
  version = '';

  constructor(target: DockerTarget) {
    this.target = target;
  }

  /** Esquece a versão negociada: o Engine pode ter sido atualizado enquanto estava fora. */
  renegotiate(): void {
    this.prefix = undefined;
  }

  private versionPrefix(): Promise<string> {
    this.prefix ??= (async () => {
      // /version sem prefixo é aceito por qualquer Engine (e liberado no socket-proxy com VERSION=1)
      const res = await this.raw('/version', 5000);
      const info = JSON.parse(await readAll(res)) as { ApiVersion?: string; MinAPIVersion?: string; Version?: string };
      const v = pickApiVersion(info);
      if (v !== this.version) console.log(`[docker] Engine ${info.Version ?? '?'} · API ${v ?? 'padrão do Engine'}`);
      this.version = v ?? '';
      return v ? `/v${v}` : '';
    })();
    this.prefix.catch(() => { this.prefix = undefined; }); // falhou: tenta de novo na próxima chamada
    return this.prefix;
  }

  private async open(path: string, timeoutMs: number, signal?: AbortSignal): Promise<IncomingMessage> {
    return this.raw((await this.versionPrefix()) + path, timeoutMs, signal);
  }

  private raw(path: string, timeoutMs: number, signal?: AbortSignal): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
      const req = request({
        ...this.target,
        path,
        method: 'GET',
        headers: { host: 'docker', accept: 'application/json' },
        signal,
      }, (res) => {
        if ((res.statusCode ?? 500) >= 400) {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (d: string) => { if (body.length < 2000) body += d; });
          res.on('end', () => reject(new DockerError(res.statusCode ?? 500, body.trim() || res.statusMessage || 'erro')));
          return;
        }
        resolve(res);
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout de ${timeoutMs} ms em ${path}`)));
      req.on('error', reject);
      req.end();
    });
  }

  async json<T>(path: string, timeoutMs = 10_000): Promise<T> {
    return JSON.parse(await readAll(await this.open(path, timeoutMs))) as T;
  }

  /**
   * Stream NDJSON (ex.: /events). Resolve quando o Engine fecha o stream; rejeita em erro.
   * Sem timeout de inatividade: o stream de eventos pode ficar quieto por horas.
   */
  async stream(path: string, onObject: (o: unknown) => void, signal?: AbortSignal): Promise<void> {
    const res = await this.open(path, 10_000, signal);
    res.socket.setTimeout(0);
    const split = new NdjsonSplitter(onObject);
    await new Promise<void>((resolve, reject) => {
      res.on('data', (c: Buffer) => split.push(c));
      res.on('end', () => { split.end(); resolve(); });
      res.on('error', reject);
      res.on('aborted', () => reject(new Error('stream de eventos interrompido')));
    });
  }
}

async function readAll(res: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of res) {
    size += (c as Buffer).length;
    if (size > 32 * 1024 * 1024) throw new Error('resposta grande demais do Docker');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export class DockerError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`Docker ${status}: ${message}`);
    this.status = status;
  }
}
