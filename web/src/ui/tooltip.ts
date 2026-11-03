/** Painel de detalhes que segue o mouse ao passar sobre um personagem. */
import type { ContainerView, VisualState } from '../model.js';
import type { Agent } from '../sim/agent.js';

const STATE: Record<VisualState, string> = {
  working: 'Trabalhando',
  busy: 'Ocupado',
  stopped: 'Parado',
  error: 'Erro',
};

export class Tooltip {
  private readonly el = document.createElement('aside');
  private current: { c: ContainerView; a: Agent } | null = null;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.el.className = 'tooltip';
    this.el.hidden = true;
    parent.append(this.el);
  }

  show(c: ContainerView | null, a: Agent | null, ev: PointerEvent): void {
    if (!c || !a) {
      this.el.hidden = true;
      this.current = null;
      clearInterval(this.timer);
      return;
    }
    if (this.current?.c.id !== c.id) {
      this.current = { c, a };
      clearInterval(this.timer);
      this.timer = window.setInterval(() => this.current && this.render(), 500);
    }
    this.current = { c: a.data, a };
    this.render();
    this.el.hidden = false;
    const pad = 16;
    const { innerWidth: vw, innerHeight: vh } = window;
    const r = this.el.getBoundingClientRect();
    const x = ev.clientX + pad + r.width > vw ? ev.clientX - r.width - pad : ev.clientX + pad;
    const y = Math.min(vh - r.height - 8, Math.max(8, ev.clientY - r.height / 2));
    this.el.style.translate = `${x}px ${y}px`;
  }

  private render(): void {
    if (!this.current) return;
    const { a } = this.current;
    const c = a.data;
    const p = a.profile;
    const rows: Array<[string, string]> = [
      ['Agora', a.activity || '—'],
      ['Docker', [c.dockerState, c.health].filter(Boolean).join(' · ')],
      ['No ar há', c.dockerState === 'running' && c.startedAt ? since(c.startedAt) : '—'],
      ['CPU', c.metrics ? `${c.metrics.cpu.toFixed(1)}%` : '—'],
      ['Memória', c.metrics ? mem(c.metrics.memBytes) : '—'],
      ['Reinícios', String(c.restartCount ?? 0)],
      ['Saída', c.exitCode !== undefined && c.dockerState !== 'running' ? `código ${c.exitCode}` : '—'],
      ['Imagem', c.image],
      ['Projeto', [c.project, c.service].filter(Boolean).join(' / ') || '—'],
      ['Portas', c.ports?.join(', ') || '—'],
      ['Último evento', c.lastEvent ? `${c.lastEvent.action} · ${since(c.lastEvent.at)} atrás` : '—'],
    ];
    this.el.style.setProperty('--accent', p.accent);
    this.el.dataset.state = c.visualState;
    this.el.innerHTML = `
      <header><i class="dot"></i><div><h3></h3><p class="sub"></p></div></header>
      <p class="state"><b></b><span></span></p>
      <dl>${rows.map(() => '<dt></dt><dd></dd>').join('')}</dl>`;
    this.el.querySelector('h3')!.textContent = p.displayName;
    this.el.querySelector('.sub')!.textContent = `${p.role} · ${c.name}`;
    this.el.querySelector('.state b')!.textContent = STATE[c.visualState];
    this.el.querySelector('.state span')!.textContent = c.reason ? ` — ${c.reason}` : '';
    const dts = this.el.querySelectorAll('dt'), dds = this.el.querySelectorAll('dd');
    rows.forEach(([k, v], i) => {
      dts[i]!.textContent = k;
      dds[i]!.textContent = v;
    });
  }
}

function since(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

function mem(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
}
