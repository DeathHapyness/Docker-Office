/**
 * Log do escritório: compara cada atualização de containers com a anterior e registra o que
 * mudou de verdade (eventos Docker, estado visual, health, reinícios, entradas/saídas e o
 * status do Engine). Atividades simuladas dos personagens (café, janela…) NÃO entram aqui.
 */
import type { ContainerView, VisualState } from '../model.js';

export type LogKind = 'docker' | 'state' | 'engine' | 'system';
export type LogLevel = 'info' | 'ok' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  at: number;
  kind: LogKind;
  level: LogLevel;
  text: string;
  /** Container relacionado (para focar a câmera ao clicar). */
  containerId?: string;
  who?: string;
  accent?: string;
  /** Detalhe técnico curto (ação Docker, código de saída…). */
  detail?: string;
}

export interface Who {
  name: string;
  accent: string;
}

const MAX = 1000;
const STATE_PT: Record<VisualState, string> = { working: 'trabalhando', busy: 'ocupado', stopped: 'parado', error: 'com erro' };
const STATE_LEVEL: Record<VisualState, LogLevel> = { working: 'ok', busy: 'warn', stopped: 'info', error: 'error' };
const ACTION_PT: Record<string, [string, LogLevel]> = {
  create: ['foi contratado (container criado)', 'info'],
  start: ['começou a trabalhar', 'ok'],
  restart: ['reiniciou', 'warn'],
  stop: ['foi para casa', 'info'],
  kill: ['foi interrompido', 'warn'],
  die: ['parou de responder', 'error'],
  oom: ['ficou sem memória (OOM)', 'error'],
  pause: ['pausou', 'info'],
  unpause: ['voltou da pausa', 'ok'],
  destroy: ['saiu da empresa (container removido)', 'info'],
};

interface Seen {
  visual: VisualState;
  docker: ContainerView['dockerState'];
  health?: ContainerView['health'];
  restarts: number;
  event: string;
}

export class EventLog {
  private readonly list: LogEntry[] = [];
  private readonly seen = new Map<string, Seen>();
  private readonly listeners = new Set<(e: LogEntry) => void>();
  private nextId = 1;
  private started = false;

  get entries(): readonly LogEntry[] {
    return this.list;
  }

  subscribe(fn: (e: LogEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  add(e: Omit<LogEntry, 'id' | 'at'> & { at?: number }): void {
    const entry: LogEntry = { ...e, id: this.nextId++, at: e.at ?? Date.now() };
    this.list.push(entry);
    if (this.list.length > MAX) this.list.shift();
    for (const fn of this.listeners) fn(entry);
  }

  clear(): void {
    this.list.length = 0;
  }

  /** Registra as diferenças entre a lista atual e a anterior. */
  observe(containers: ReadonlyArray<{ c: ContainerView; who: Who }>): void {
    const ids = new Set(containers.map(({ c }) => c.id));
    if (!this.started) {
      this.started = true;
      const count = (v: VisualState): number => containers.filter(({ c }) => c.visualState === v).length;
      this.add({
        kind: 'system', level: 'info',
        text: `Escritório aberto com ${containers.length} containers`,
        detail: `${count('working')} trabalhando · ${count('busy')} ocupados · ${count('stopped')} parados · ${count('error')} com erro`,
      });
      for (const { c, who } of containers) {
        if (c.visualState === 'error') this.add({ ...base(c, who), kind: 'state', level: 'error', text: 'já chegou com erro', detail: c.reason });
        this.seen.set(c.id, snapshot(c));
      }
      return;
    }

    for (const { c, who } of containers) {
      const prev = this.seen.get(c.id);
      const now = snapshot(c);
      this.seen.set(c.id, now);
      if (!prev) {
        this.add({ ...base(c, who), kind: 'docker', level: 'info', text: 'entrou no escritório', detail: c.image });
        continue;
      }
      if (now.event !== prev.event && c.lastEvent) {
        const action = c.lastEvent.action;
        const key = action.split(':')[0]!.trim();
        const [text, level] = key === 'health_status' ? [`health: ${action.split(':')[1]?.trim()}`, 'info' as LogLevel]
          : ACTION_PT[key] ?? [`evento ${action}`, 'info' as LogLevel];
        const exit = key === 'die' && c.exitCode !== undefined ? ` · exit ${c.exitCode}` : '';
        this.add({ ...base(c, who), at: Date.parse(c.lastEvent.at) || Date.now(), kind: 'docker', level, text, detail: `docker ${action}${exit}` });
      }
      if (now.visual !== prev.visual) {
        const cpu = c.metrics ? ` · CPU ${c.metrics.cpu.toFixed(0)}%` : '';
        this.add({
          ...base(c, who), kind: 'state', level: STATE_LEVEL[now.visual],
          text: `${STATE_PT[prev.visual]} → ${STATE_PT[now.visual]}`,
          detail: [c.reason, cpu.slice(3)].filter(Boolean).join(' · ') || undefined,
        });
      }
      if (now.health !== prev.health && now.health) {
        this.add({ ...base(c, who), kind: 'state', level: now.health === 'unhealthy' ? 'error' : now.health === 'healthy' ? 'ok' : 'info',
          text: `health ${prev.health ?? '—'} → ${now.health}` });
      }
      if (now.restarts > prev.restarts) {
        this.add({ ...base(c, who), kind: 'docker', level: 'warn', text: `reiniciou (${now.restarts}× no total)` });
      }
    }
    for (const [id] of this.seen) {
      if (!ids.has(id)) {
        this.seen.delete(id);
        this.add({ kind: 'docker', level: 'info', containerId: id, text: 'Um container saiu do escritório', detail: id });
      }
    }
  }

  engine(status: 'connected' | 'reconnecting' | 'down'): void {
    const map = {
      connected: ['Docker Engine conectado — luzes acesas', 'ok'],
      reconnecting: ['Reconectando ao Docker Engine…', 'warn'],
      down: ['Sem conexão com o Docker Engine — luzes apagadas', 'error'],
    } as const;
    const [text, level] = map[status];
    this.add({ kind: 'engine', level, text });
  }
}

function base(c: ContainerView, who: Who): Pick<LogEntry, 'containerId' | 'who' | 'accent'> {
  return { containerId: c.id, who: who.name, accent: who.accent };
}

function snapshot(c: ContainerView): Seen {
  return {
    visual: c.visualState, docker: c.dockerState, health: c.health, restarts: c.restartCount ?? 0,
    event: c.lastEvent ? `${c.lastEvent.action}@${c.lastEvent.at}` : '',
  };
}
