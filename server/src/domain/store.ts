/**
 * Estado canônico dos containers em memória. Recebe JSON do Docker (inspect), eventos e
 * amostras de stats; devolve ContainerView prontos para o frontend. Sem I/O.
 */
import type { ContainerView, DockerState } from '../../../web/src/model.ts';
import { classify } from './classifier.ts';
import { type BusyState, type CpuSample, type RawStats, type Usage, cpuSample, nextBusy, usage } from './metrics.ts';

/** Subconjunto do JSON de GET /containers/{id}/json. */
export interface Inspect {
  Id: string;
  Name?: string;
  Config?: { Image?: string; Labels?: Record<string, string> | null };
  State?: {
    Status?: string;
    OOMKilled?: boolean;
    ExitCode?: number;
    StartedAt?: string;
    FinishedAt?: string;
    Health?: { Status?: string };
  };
  RestartCount?: number;
  HostConfig?: { NanoCpus?: number };
  NetworkSettings?: { Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null> | null };
}

/** Evento do stream /events. */
export interface DockerEvent {
  Type?: string;
  Action?: string;
  Actor?: { ID?: string; Attributes?: Record<string, string> };
  time?: number;
  timeNano?: number;
}

interface Rec {
  id: string;
  name: string;
  image: string;
  labels: Record<string, string>;
  ports: string[];
  dockerState: DockerState;
  health?: 'starting' | 'healthy' | 'unhealthy';
  exitCode?: number;
  oomKilled?: boolean;
  restartCount: number;
  restartTimes: number[];
  startedAt?: string;
  finishedAt?: string;
  nanoCpus: number;
  lastEvent?: { action: string; at: string };
  stopRequestedAt?: number;
  userStopped?: boolean;
  busy: BusyState;
  prevCpu?: CpuSample;
  usage?: Usage;
}

/** Ações que não mudam o estado (o healthcheck gera exec_* a cada 30 s). */
const NOISE = /^(exec_|attach|detach|resize|top|export|commit|copy|archive-path|extract-to-dir)/;
const STATES = new Set<DockerState>(['created', 'running', 'paused', 'restarting', 'exited', 'dead']);
const RESTART_WINDOW_MS = 5 * 60_000;
const ZERO_DATE = /^0001-/;

export class Store {
  private readonly recs = new Map<string, Rec>();

  has(id: string): boolean {
    return this.recs.has(id);
  }

  ids(): string[] {
    return [...this.recs.keys()];
  }

  running(): Array<{ id: string; nanoCpus: number }> {
    return [...this.recs.values()].filter((r) => r.dockerState === 'running').map((r) => ({ id: r.id, nanoCpus: r.nanoCpus }));
  }

  /** Atualiza (ou cria) a partir do inspect. Retorna a view, ou undefined se o container deve ficar oculto. */
  upsert(j: Inspect, now = Date.now()): ContainerView | undefined {
    const labels = j.Config?.Labels ?? {};
    if (labels['com.docker.compose.oneoff']?.toLowerCase() === 'true') return undefined; // `compose run` avulso
    const prev = this.recs.get(j.Id);
    const st = j.State ?? {};
    // "removing" (durante o rm -f) não é um estado de trabalho: trata como encerrado
    const status = (st.Status === 'removing' ? 'exited' : st.Status ?? 'created') as DockerState;
    const restartCount = j.RestartCount ?? 0;
    const restartTimes = (prev?.restartTimes ?? []).filter((t) => now - t < RESTART_WINDOW_MS);
    if (prev && restartCount > prev.restartCount) {
      for (let i = prev.restartCount; i < restartCount; i++) restartTimes.push(now);
    }
    const h = st.Health?.Status;
    const r: Rec = {
      id: j.Id,
      name: (j.Name ?? j.Id.slice(0, 12)).replace(/^\//, ''),
      image: j.Config?.Image ?? '',
      labels,
      ports: formatPorts(j.NetworkSettings?.Ports),
      dockerState: STATES.has(status) ? status : 'created',
      health: h === 'starting' || h === 'healthy' || h === 'unhealthy' ? h : undefined,
      exitCode: st.ExitCode,
      oomKilled: st.OOMKilled || undefined,
      restartCount,
      restartTimes,
      startedAt: st.StartedAt && !ZERO_DATE.test(st.StartedAt) ? st.StartedAt : undefined,
      finishedAt: st.FinishedAt && !ZERO_DATE.test(st.FinishedAt) ? st.FinishedAt : undefined,
      nanoCpus: j.HostConfig?.NanoCpus ?? 0,
      lastEvent: prev?.lastEvent,
      stopRequestedAt: prev?.stopRequestedAt,
      userStopped: prev?.userStopped,
      busy: status === 'running' ? (prev?.busy ?? { busy: false, high: 0, low: 0 }) : { busy: false, high: 0, low: 0 },
      prevCpu: status === 'running' ? prev?.prevCpu : undefined,
      usage: status === 'running' ? prev?.usage : undefined,
    };
    this.recs.set(r.id, r);
    return this.view(r);
  }

  remove(id: string): boolean {
    return this.recs.delete(id);
  }

  /**
   * Registra um evento. Retorna o que fazer: 'inspect' (reler o container), 'remove' ou null (ruído).
   * Ordem real observada num `docker stop`: kill → stop → die (fixture events-lifecycle.ndjson).
   */
  event(e: DockerEvent): 'inspect' | 'remove' | null {
    const id = e.Actor?.ID;
    const action = e.Action ?? '';
    if (e.Type !== 'container' || !id || !action || NOISE.test(action)) return null;
    const at = e.timeNano ? e.timeNano / 1e6 : (e.time ?? Date.now() / 1000) * 1000;
    if (action === 'destroy') return 'remove';
    const r = this.recs.get(id);
    if (r) {
      // após reconectar, `since` reenvia eventos antigos: não deixa o "último evento" voltar no tempo
      if (!r.lastEvent || at >= Date.parse(r.lastEvent.at)) r.lastEvent = { action, at: new Date(at).toISOString() };
      if (action === 'kill' || action === 'stop') r.stopRequestedAt = at;
      if (action === 'die') r.userStopped = r.stopRequestedAt !== undefined && at - r.stopRequestedAt < 60_000;
      if (action === 'start') {
        r.userStopped = false;
        r.stopRequestedAt = undefined;
      }
    }
    return 'inspect';
  }

  /** Aplica uma amostra de stats. Retorna a view se o estado visual mudou (busy entrou/saiu). */
  stats(id: string, raw: RawStats): { changed: boolean; view?: ContainerView } {
    const r = this.recs.get(id);
    if (!r || r.dockerState !== 'running') return { changed: false };
    const before = this.view(r).visualState;
    r.usage = usage(raw, r.prevCpu, r.nanoCpus);
    // primeira amostra só serve de base (CPU = 0): não conta para a histerese
    if (r.prevCpu) r.busy = nextBusy(r.busy, r.usage.cpuNorm, r.usage.memPct);
    r.prevCpu = cpuSample(raw);
    const view = this.view(r);
    return { changed: view.visualState !== before, view };
  }

  metrics(): Array<{ id: string; cpu: number; memBytes: number; memLimit: number }> {
    const out = [];
    for (const r of this.recs.values()) {
      if (r.usage && r.dockerState === 'running') out.push({ id: r.id, cpu: r.usage.cpu, memBytes: r.usage.memBytes, memLimit: r.usage.memLimit });
    }
    return out;
  }

  views(): ContainerView[] {
    return [...this.recs.values()].map((r) => this.view(r));
  }

  get(id: string): ContainerView | undefined {
    const r = this.recs.get(id);
    return r && this.view(r);
  }

  private view(r: Rec, now = Date.now()): ContainerView {
    const c = classify({
      dockerState: r.dockerState, exitCode: r.exitCode, oomKilled: r.oomKilled, health: r.health,
      recentRestarts: r.restartTimes.filter((t) => now - t < RESTART_WINDOW_MS).length,
      userStopped: r.userStopped, busy: r.busy.busy, cpu: r.usage?.cpu,
    });
    const l = r.labels;
    return {
      id: r.id,
      name: r.name,
      image: r.image,
      project: l['com.docker.compose.project'],
      service: l['com.docker.compose.service'],
      character: l['docker-office.character'],
      dockerState: r.dockerState,
      health: r.health,
      exitCode: r.dockerState === 'running' ? undefined : r.exitCode,
      oomKilled: r.oomKilled,
      restartCount: r.restartCount,
      startedAt: r.dockerState === 'running' ? r.startedAt : undefined,
      finishedAt: r.dockerState === 'running' ? undefined : r.finishedAt,
      ports: r.ports,
      lastEvent: r.lastEvent,
      visualState: c.visual,
      reason: c.reason,
      metrics: r.usage && r.dockerState === 'running'
        ? { cpu: r.usage.cpu, memBytes: r.usage.memBytes, memLimit: r.usage.memLimit } : undefined,
    };
  }
}

/** Portas publicadas como "8181→80/tcp"; sem nenhuma publicada, lista as expostas. */
export function formatPorts(ports: NonNullable<Inspect['NetworkSettings']>['Ports']): string[] {
  const entries = Object.entries(ports ?? {});
  const published = new Set<string>();
  for (const [key, binds] of entries) for (const b of binds ?? []) if (b.HostPort) published.add(`${b.HostPort}→${key}`);
  const list = published.size ? [...published] : entries.map(([k]) => k);
  return list.sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
}
