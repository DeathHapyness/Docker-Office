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

const API = '/v1.41'; // mínimo que tem stats one-shot; o Engine 29 aceita de 1.40 a 1.56

export class DockerApi {
  private readonly target: DockerTarget;

  constructor(target: DockerTarget) {
    this.target = target;
  }

  private open(path: string, timeoutMs: number, signal?: AbortSignal): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
      const req = request({
        ...this.target,
        path: API + path,
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
    const res = await this.open(path, timeoutMs);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of res) {
      size += (c as Buffer).length;
      if (size > 32 * 1024 * 1024) throw new Error('resposta grande demais do Docker');
      chunks.push(c as Buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
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

export class DockerError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`Docker ${status}: ${message}`);
    this.status = status;
  }
}
