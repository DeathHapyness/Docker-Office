/**
 * Orquestra a conexão com o Docker Engine:
 *  1. reconcilia (lista + inspect) → snapshot;
 *  2. acompanha /events (re-inspect por evento, remove no destroy);
 *  3. coleta stats (one-shot) dos containers rodando a cada N s, com concorrência limitada;
 *  4. se o Engine cair: "reconnecting" → backoff exponencial com jitter (1 s → 30 s) →
 *     reabre os eventos com `since` (não perde o que aconteceu no meio) → reconcilia de novo.
 */
import type { ContainerView } from '../../../web/src/model.ts';
import type { DockerApi } from './api.ts';
import { DockerError } from './api.ts';
import type { DockerEvent, Inspect, Store } from '../domain/store.ts';
import type { RawStats } from '../domain/metrics.ts';

export type EngineStatus = 'connected' | 'reconnecting' | 'down';

export interface EngineOutput {
  snapshot(): void;
  upsert(v: ContainerView): void;
  remove(id: string): void;
  metrics(items: ReturnType<Store['metrics']>): void;
  engine(status: EngineStatus, reason?: string): void;
}

const ID = /^[0-9a-f]{12,64}$/;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Executa `fn` em cada item com no máximo `limit` em paralelo. */
async function pool<T>(items: readonly T[], limit: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async (): Promise<void> => {
    while (i < items.length) await fn(items[i++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export class Engine {
  status: EngineStatus = 'reconnecting';
  reason = 'iniciando';
  private readonly api: DockerApi;
  private readonly store: Store;
  private readonly out: EngineOutput;
  private readonly metricsMs: number;
  private since = 0;
  private failures = 0;
  private stopped = false;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;
  private readonly inspecting = new Map<string, Promise<void>>();
  private readonly sent = new Map<string, string>();

  constructor(api: DockerApi, store: Store, out: EngineOutput, metricsMs = 3000) {
    this.api = api;
    this.store = store;
    this.out = out;
    this.metricsMs = metricsMs;
  }

  start(): void {
    void this.loop();
    this.timer = setInterval(() => void this.pollStats(), this.metricsMs);
  }

  stop(): void {
    this.stopped = true;
    this.abort?.abort();
    clearInterval(this.timer);
  }

  private setStatus(s: EngineStatus, reason?: string): void {
    if (s === this.status && reason === this.reason) return;
    this.status = s;
    this.reason = reason ?? '';
    this.out.engine(s, reason);
  }

  private async loop(): Promise<void> {
    let backoff = 1000;
    while (!this.stopped) {
      let reason: string;
      try {
        const since = this.since || Math.floor(Date.now() / 1000) - 1;
        this.api.renegotiate();
        await this.reconcile();
        this.setStatus('connected');
        this.out.snapshot();
        backoff = 1000;
        this.failures = 0;
        this.abort = new AbortController();
        const filters = encodeURIComponent(JSON.stringify({ type: ['container'] }));
        await this.api.stream(`/events?since=${since}&filters=${filters}`, (o) => this.onEvent(o as DockerEvent), this.abort.signal);
        reason = 'o Engine encerrou o stream de eventos';
      } catch (err) {
        reason = err instanceof Error ? err.message : String(err);
      }
      if (this.stopped) break;
      this.failures++;
      this.setStatus(this.failures >= 3 ? 'down' : 'reconnecting', reason);
      console.warn(`[docker] ${reason} — nova tentativa em ~${Math.round(backoff / 1000)} s`);
      await sleep(backoff * (0.8 + Math.random() * 0.4));
      backoff = Math.min(30_000, backoff * 2);
    }
  }

  /** Lista tudo, relê cada container e remove o que sumiu (o snapshot sai logo depois). */
  private async reconcile(): Promise<void> {
    const list = await this.api.json<Array<{ Id: string }>>('/containers/json?all=1');
    const alive = new Set(list.map((c) => c.Id));
    for (const id of this.store.ids()) if (!alive.has(id)) this.store.remove(id);
    this.sent.clear(); // o snapshot que vem a seguir é a nova referência
    await pool(list, 6, async (c) => { await this.inspect(c.Id, false); });
  }

  private onEvent(e: DockerEvent): void {
    if (e.time) this.since = Math.max(this.since, e.time);
    const id = e.Actor?.ID;
    if (!id || !ID.test(id)) return;
    const what = this.store.event(e);
    if (what === 'remove') {
      this.sent.delete(id);
      if (this.store.remove(id)) this.out.remove(id);
    } else if (what === 'inspect') {
      void this.inspect(id, true);
    }
  }

  /** Relê um container (deduplicado: eventos em rajada viram um inspect só por vez). */
  private inspect(id: string, emit: boolean): Promise<void> {
    const running = this.inspecting.get(id);
    if (running) return running.then(() => this.inspect(id, emit));
    const p = (async () => {
      try {
        const j = await this.api.json<Inspect>(`/containers/${id}/json`);
        const view = this.store.upsert(j);
        if (!emit) return;
        if (view) this.emitUpsert(view);
        else if (this.store.remove(id)) this.out.remove(id);
      } catch (err) {
        if (err instanceof DockerError && err.status === 404) {
          if (this.store.remove(id) && emit) this.out.remove(id);
        } else {
          console.warn(`[docker] inspect ${id.slice(0, 12)} falhou: ${(err as Error).message}`);
        }
      } finally {
        this.inspecting.delete(id);
      }
    })();
    this.inspecting.set(id, p);
    return p;
  }

  /** Só envia se algo mudou (stop + die geram dois inspects idênticos). Métricas vão no lote. */
  private emitUpsert(v: ContainerView): void {
    const key = JSON.stringify({ ...v, metrics: undefined });
    if (this.sent.get(v.id) === key) return;
    this.sent.set(v.id, key);
    this.out.upsert(v);
  }

  private async pollStats(): Promise<void> {
    if (this.polling || this.status !== 'connected') return;
    this.polling = true;
    try {
      await pool(this.store.running(), 4, async ({ id }) => {
        try {
          const raw = await this.api.json<RawStats>(`/containers/${id}/stats?stream=false&one-shot=true`, 5000);
          const r = this.store.stats(id, raw);
          if (r.changed && r.view) this.emitUpsert(r.view);
        } catch {
          // container pode ter parado no meio da coleta: o evento `die` cuida disso
        }
      });
      this.out.metrics(this.store.metrics());
    } finally {
      this.polling = false;
    }
  }
}
