import type { CharacterProfile } from './characters/types.js';
import type { ContainerView, VisualState } from './model.js';
import { OfficeScene, type CameraPreset } from './scene/office-scene.js';
import { Tooltip } from './ui/tooltip.js';
import { mockContainers } from './demo/mock.js';

const MB = 1024 * 1024;

async function main(): Promise<void> {
  const res = await fetch('config/characters.json');
  const { profiles } = (await res.json()) as { profiles: CharacterProfile[] };

  const host = document.getElementById('office')!;
  const office = new OfficeScene(host, profiles);
  const tooltip = new Tooltip(document.body);
  office.onHover = (c, a, ev) => tooltip.show(c, a, ev);
  (window as unknown as { office: OfficeScene }).office = office; // depuração no console

  const containers: ContainerView[] = mockContainers.map((c) => ({ ...c }));
  const sync = (): void => office.sync(containers);
  sync();

  // Parâmetros de URL: ?cam=top|iso|side|below|free  &focus=<nome do container>
  const params = new URLSearchParams(location.search);
  const cam = params.get('cam') as CameraPreset | null;
  if (cam) office.setPreset(cam);
  const focus = params.get('focus');
  if (focus) office.focusOn(containers.find((c) => c.name === focus)?.id ?? focus);

  /* Câmeras */
  const camBar = document.getElementById('cameras')!;
  const markCam = (): void => {
    for (const b of camBar.querySelectorAll<HTMLButtonElement>('button[data-cam]')) {
      b.setAttribute('aria-pressed', String(b.dataset.cam === office.currentPreset));
    }
  };
  camBar.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.cam) office.setPreset(b.dataset.cam as CameraPreset);
    if (b.dataset.toggle === 'pixel') {
      office.setPixelMode(!office.pixelMode);
      b.setAttribute('aria-pressed', String(office.pixelMode));
    }
    markCam();
  });
  setInterval(markCam, 500);

  /* Simulação de estados (substituída pelo backend real nas próximas etapas) */
  document.getElementById('demo')!.addEventListener('click', (ev) => {
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

  // Métricas simuladas a cada 3 s (como fará o metrics.batch do backend).
  setInterval(() => {
    for (const c of containers) {
      if (c.dockerState !== 'running') continue;
      const cpu = c.metrics?.cpu ?? 1;
      const jitter = cpu < 2 ? cpu : cpu * (0.9 + Math.random() * 0.2);
      c.metrics = { cpu: Math.min(100, jitter), memBytes: (c.metrics?.memBytes ?? 120 * MB) * (0.99 + Math.random() * 0.02) };
    }
    sync();
  }, 3000);
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

main().catch((err) => {
  const pre = document.createElement('pre');
  pre.className = 'fatal';
  pre.textContent = `Erro ao iniciar: ${String(err)}`; // texto puro: a mensagem pode conter dados externos
  document.body.append(pre);
});
