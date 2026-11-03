/** Modo demonstração: dados simulados + botões "Simular" da barra de cima (sem backend). */
import type { ContainerView, VisualState } from '../model.js';
import type { OfficeScene } from '../scene/office-scene.js';
import { mockContainers } from './mock.js';

const MB = 1024 * 1024;

export function runDemo(office: OfficeScene, host: HTMLElement): ContainerView[] {
  const containers: ContainerView[] = mockContainers.map((c) => ({ ...c }));
  const sync = (): void => office.sync(containers);
  sync();

  const nav = document.getElementById('demo')!;
  nav.hidden = false;
  nav.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-set]');
    if (!b) return;
    const v = b.dataset.set!;
    if (v === 'offline') {
      const down = host.dataset.engine !== 'down';
      office.setEngine(down ? 'down' : 'connected');
      b.setAttribute('aria-pressed', String(down));
      return;
    }
    const states: VisualState[] = ['working', 'busy', 'stopped', 'error'];
    for (const c of containers) {
      const pickState = v === 'mix' ? states[Math.floor(Math.random() * 4)]! : v === 'idle' || v === 'active' ? 'working' : (v as VisualState);
      apply(c, pickState, v === 'idle' ? 0.3 : v === 'active' ? 25 : undefined);
    }
    sync();
  });

  // Métricas simuladas a cada 3 s (como o lote `metrics` do servidor).
  setInterval(() => {
    for (const c of containers) {
      if (c.dockerState !== 'running') continue;
      const cpu = c.metrics?.cpu ?? 1;
      const jitter = cpu < 2 ? cpu : cpu * (0.9 + Math.random() * 0.2);
      c.metrics = { cpu: Math.min(100, jitter), memBytes: (c.metrics?.memBytes ?? 120 * MB) * (0.99 + Math.random() * 0.02) };
    }
    sync();
  }, 3000);
  return containers;
}

function apply(c: ContainerView, s: VisualState, cpu?: number): void {
  c.visualState = s;
  c.reason = undefined;
  const now = new Date().toISOString();
  switch (s) {
    case 'working':
      c.dockerState = 'running';
      c.health = c.health ? 'healthy' : undefined;
      c.startedAt ??= now;
      c.metrics = { cpu: cpu ?? (Math.random() < 0.5 ? 0.4 : 20), memBytes: c.metrics?.memBytes ?? 150 * MB };
      c.lastEvent = { action: 'start', at: now };
      break;
    case 'busy':
      c.dockerState = 'running';
      c.metrics = { cpu: 75 + Math.random() * 20, memBytes: c.metrics?.memBytes ?? 300 * MB };
      break;
    case 'stopped':
      c.dockerState = 'exited';
      c.exitCode = 0;
      c.metrics = undefined;
      c.startedAt = undefined;
      c.reason = 'Parado (exit 0)';
      c.lastEvent = { action: 'stop', at: now };
      break;
    case 'error':
      c.dockerState = 'exited';
      c.exitCode = 1;
      c.metrics = undefined;
      c.reason = 'Caiu! exit 1';
      c.restartCount = (c.restartCount ?? 0) + 1;
      c.lastEvent = { action: 'die', at: now };
      break;
  }
}
