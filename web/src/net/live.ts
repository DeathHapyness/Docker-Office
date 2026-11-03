/**
 * Dados ao vivo do servidor via Server-Sent Events (/api/events). O EventSource reconecta
 * sozinho; toda (re)conexão recebe um snapshot completo, então não há estado a reconciliar aqui.
 */
import type { ContainerView } from '../model.js';

export type EngineStatus = 'connected' | 'reconnecting' | 'down';

export interface Health {
  ok: boolean;
  version: string;
  mode: 'live' | 'demo';
  engine: EngineStatus;
  reason?: string;
}

export interface LiveHandlers {
  /** Lista completa após qualquer mudança (agrupada por quadro de animação). */
  onContainers(list: ContainerView[]): void;
  onEngine(status: EngineStatus, reason?: string): void;
  /** Conexão com o próprio servidor do Docker Office (não com o Docker). */
  onLink(up: boolean): void;
}

/** Descobre o modo do servidor. undefined = sem backend (arquivos estáticos puros) → demo. */
export async function probe(token: string): Promise<Health | 'unauthorized' | undefined> {
  try {
    const res = await fetch(withToken('api/health', token), { cache: 'no-store' });
    if (res.status === 401) return 'unauthorized';
    if (!res.ok) return undefined;
    return (await res.json()) as Health;
  } catch {
    return undefined;
  }
}

export function withToken(path: string, token: string): string {
  return token ? `${path}?token=${encodeURIComponent(token)}` : path;
}

export class LiveSource {
  private readonly map = new Map<string, ContainerView>();
  private es?: EventSource;
  private pending = false;
  private readonly token: string;
  private readonly h: LiveHandlers;

  constructor(token: string, handlers: LiveHandlers) {
    this.token = token;
    this.h = handlers;
  }

  start(): void {
    const es = (this.es = new EventSource(withToken('api/events', this.token)));
    es.addEventListener('open', () => this.h.onLink(true));
    es.addEventListener('error', () => this.h.onLink(false));
    es.addEventListener('snapshot', (ev) => {
      const s = parse<{ engine: EngineStatus; reason?: string; containers: ContainerView[] }>(ev);
      if (!s) return;
      this.map.clear();
      for (const c of s.containers) this.map.set(c.id, c);
      this.h.onEngine(s.engine, s.reason);
      this.flush();
    });
    es.addEventListener('upsert', (ev) => {
      const c = parse<ContainerView>(ev);
      if (!c) return;
      // o upsert não traz histórico de métricas; mantém a última amostra até o próximo lote
      this.map.set(c.id, { ...c, metrics: c.metrics ?? (c.dockerState === 'running' ? this.map.get(c.id)?.metrics : undefined) });
      this.flush();
    });
    es.addEventListener('remove', (ev) => {
      const r = parse<{ id: string }>(ev);
      if (r && this.map.delete(r.id)) this.flush();
    });
    es.addEventListener('metrics', (ev) => {
      const items = parse<Array<{ id: string; cpu: number; memBytes: number; memLimit: number }>>(ev);
      if (!items) return;
      for (const m of items) {
        const c = this.map.get(m.id);
        if (c) this.map.set(m.id, { ...c, metrics: { cpu: m.cpu, memBytes: m.memBytes, memLimit: m.memLimit } });
      }
      this.flush();
    });
    es.addEventListener('engine', (ev) => {
      const e = parse<{ status: EngineStatus; reason?: string }>(ev);
      if (e) this.h.onEngine(e.status, e.reason);
    });
  }

  stop(): void {
    this.es?.close();
  }

  private flush(): void {
    if (this.pending) return;
    this.pending = true;
    // agrupa rajadas (ex.: 30 upserts na reconexão) numa única atualização da cena
    requestAnimationFrame(() => {
      this.pending = false;
      this.h.onContainers([...this.map.values()]);
    });
    // aba em segundo plano não roda rAF: garante a atualização mesmo assim
    setTimeout(() => {
      if (!this.pending) return;
      this.pending = false;
      this.h.onContainers([...this.map.values()]);
    }, 1000);
  }
}

function parse<T>(ev: Event): T | undefined {
  try {
    return JSON.parse((ev as MessageEvent<string>).data) as T;
  } catch {
    return undefined;
  }
}
