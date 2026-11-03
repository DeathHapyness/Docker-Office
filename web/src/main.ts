import type { CharacterProfile } from './characters/types.js';
import type { ContainerView } from './model.js';
import { OfficeScene, type CameraPreset } from './scene/office-scene.js';
import { Tooltip } from './ui/tooltip.js';
import { LogPanel } from './ui/log-panel.js';
import { Search } from './ui/search.js';
import { Notifier } from './ui/notify.js';
import { runDemo } from './demo/run.js';
import { LiveSource, probe } from './net/live.js';

const TOKEN_KEY = 'docker-office:token';

/** Token de acesso: vem uma vez na URL (?token=), fica salvo neste navegador e sai da barra de endereço. */
function takeToken(params: URLSearchParams): string {
  const fromUrl = params.get('token');
  if (fromUrl) {
    try { localStorage.setItem(TOKEN_KEY, fromUrl); } catch { /* modo privado: segue só nesta aba */ }
    params.delete('token');
    const q = params.toString();
    history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
    return fromUrl;
  }
  try { return localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
}

function setMode(text: string, kind: 'live' | 'demo' | 'error', title = ''): void {
  const el = document.getElementById('mode')!;
  el.textContent = text;
  el.dataset.kind = kind;
  el.title = title;
}

async function main(): Promise<void> {
  const res = await fetch('config/characters.json');
  const { profiles } = (await res.json()) as { profiles: CharacterProfile[] };

  const params = new URLSearchParams(location.search);
  const token = takeToken(params);

  const host = document.getElementById('office')!;
  const office = new OfficeScene(host, profiles);
  const tooltip = new Tooltip(document.body);
  office.onHover = (c, a, ev) => tooltip.show(c, a, ev);
  (window as unknown as { office: OfficeScene }).office = office; // depuração no console

  const logPanel = new LogPanel(office.log, document.getElementById('log-btn') as HTMLButtonElement);
  logPanel.onPick = (id) => office.focusOn(id);
  new Notifier(office.log, document.getElementById('notify-btn') as HTMLButtonElement);
  const search = new Search(document.getElementById('search') as HTMLInputElement, () => office.directory());
  search.onPick = (id) => office.focusOn(id);

  // ?wallpaper=1 → papel de parede (sem interface, câmera girando, 20 FPS). &fps=N &orbit=0
  if (params.has('wallpaper') && params.get('wallpaper') !== '0') {
    document.body.classList.add('wallpaper');
    office.setWallpaper(Number(params.get('fps') ?? 20) || 20, params.get('orbit') !== '0');
  } else if (params.has('fps')) {
    office.setWallpaper(Number(params.get('fps')) || 0, false);
  }
  const cam = params.get('cam') as CameraPreset | null;
  if (cam) office.setPreset(cam);
  const time = params.get('time');
  if (time === 'day' || time === 'night') office.forceTime(time);

  // ?focus=<nome do container>: aplicado assim que o container existir
  let focus = params.get('focus');
  const applyFocus = (list: readonly ContainerView[]): void => {
    if (!focus) return;
    const c = list.find((x) => x.name === focus || x.id.startsWith(focus!));
    if (c && office.focusOn(c.id)) focus = null;
  };

  /* Fonte dos dados: servidor ao vivo, ou demonstração se não houver backend */
  const health = params.get('demo') === '1' ? undefined : await probe(token);
  if (health === 'unauthorized') {
    setMode('SEM ACESSO', 'error', 'Abra o endereço com ?token=SEU_TOKEN');
    office.setEngine('down', 'token inválido ou ausente');
    host.dataset.message = 'Token inválido ou ausente — abra com ?token=…';
  } else if (health?.mode === 'live') {
    setMode('AO VIVO', 'live', `Docker Office ${health.version}`);
    const live = new LiveSource(token, {
      onContainers: (list) => { office.sync(list); applyFocus(list); },
      onEngine: (s, reason) => office.setEngine(s, reason),
      onLink: (up) => {
        if (!up) office.setEngine('reconnecting', 'sem conexão com o servidor do Docker Office');
        setMode(up ? 'AO VIVO' : 'RECONECTANDO', up ? 'live' : 'error');
      },
    });
    live.start();
  } else {
    setMode('DEMO', 'demo', 'Dados simulados: nenhum servidor com acesso ao Docker respondeu');
    applyFocus(runDemo(office, host));
  }

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
}

main().catch((err) => {
  const pre = document.createElement('pre');
  pre.className = 'fatal';
  pre.textContent = `Erro ao iniciar: ${String(err)}`; // texto puro: a mensagem pode conter dados externos
  document.body.append(pre);
});
