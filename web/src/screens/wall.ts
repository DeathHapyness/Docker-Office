/** Telas grandes do escritório, desenhadas em canvas com dados reais do ambiente. */
import * as THREE from 'three';
import type { VisualState } from '../model.js';
import { clock, mem, since } from '../util/format.js';

export interface OfficeEntry {
  name: string;
  accent: string;
  visual: VisualState;
  cpu: number;
  memBytes: number;
  startedAt?: string;
  history: readonly number[];
}

export interface OfficeEvent {
  at: number;
  text: string;
}

export interface OfficeSnapshot {
  entries: readonly OfficeEntry[];
  events: readonly OfficeEvent[];
  engineUp: boolean;
}

const FONT = 'system-ui, "Segoe UI", Roboto, Ubuntu, sans-serif';
const MONO = 'ui-monospace, "DejaVu Sans Mono", monospace';
const STATE_COLOR: Record<VisualState, string> = { working: '#22c55e', busy: '#f59e0b', stopped: '#6b7280', error: '#ef4444' };

abstract class CanvasPanel {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  protected readonly c: CanvasRenderingContext2D;
  private last = -1;

  constructor(readonly w: number, readonly h: number, private readonly fps: number) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.c = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  update(s: OfficeSnapshot, t: number): void {
    const slot = Math.floor(t * this.fps);
    if (slot === this.last) return;
    this.last = slot;
    if (!s.engineUp) this.off(t);
    else this.draw(s, t);
    this.texture.needsUpdate = true;
  }

  protected off(t: number): void {
    const c = this.c;
    c.fillStyle = '#050505';
    c.fillRect(0, 0, this.w, this.h);
    // chiado
    for (let i = 0; i < 400; i++) {
      const v = Math.floor(Math.random() * 60);
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.fillRect(Math.random() * this.w, Math.random() * this.h, 3, 2);
    }
    c.fillStyle = Math.sin(t * 4) > 0 ? '#f87171' : '#7f1d1d';
    c.font = `bold 28px ${FONT}`;
    c.textAlign = 'center';
    c.fillText('SEM SINAL DO DOCKER', this.w / 2, this.h / 2);
    c.textAlign = 'left';
  }

  protected abstract draw(s: OfficeSnapshot, t: number): void;
}

/** TV da copa: canal "Docker News" com resumo, ranking e notícias passando. */
export class NewsTv extends CanvasPanel {
  constructor() {
    super(640, 360, 12);
  }

  protected draw(s: OfficeSnapshot, t: number): void {
    const c = this.c;
    const { w, h } = this;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b1f4a');
    g.addColorStop(1, '#081226');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);

    // vinheta do canal
    c.fillStyle = '#dc2626';
    c.fillRect(0, 0, 210, 40);
    c.fillStyle = '#ffffff';
    c.font = `900 22px ${FONT}`;
    c.fillText('DOCKER NEWS', 14, 28);
    c.fillStyle = Math.sin(t * 3) > 0 ? '#ef4444' : '#7f1d1d';
    c.beginPath();
    c.arc(w - 92, 20, 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.font = `bold 15px ${FONT}`;
    c.fillText('AO VIVO', w - 80, 26);
    c.font = `bold 15px ${MONO}`;
    c.fillText(clock(), w - 80, 52);

    const slide = Math.floor(t / 9) % 3;
    if (slide === 0) this.summary(s);
    else if (slide === 1) this.ranking(s);
    else this.employee(s);

    // letreiro de notícias
    c.fillStyle = '#facc15';
    c.fillRect(0, h - 44, 120, 44);
    c.fillStyle = '#111827';
    c.font = `900 15px ${FONT}`;
    c.fillText('URGENTE', 18, h - 16);
    c.fillStyle = '#111827';
    c.fillRect(120, h - 44, w - 120, 44);
    const text = s.events.length
      ? s.events.slice(-8).reverse().map((e) => `${new Date(e.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ${e.text}`).join('   •   ')
      : 'Nenhuma ocorrência. Escritório tranquilo hoje.';
    c.save();
    c.beginPath();
    c.rect(120, h - 44, w - 120, 44);
    c.clip();
    c.font = `bold 17px ${FONT}`;
    c.fillStyle = '#ffffff';
    const tw = c.measureText(text).width + 80;
    const x = w - ((t * 70) % (tw + w - 120));
    c.fillText(text, x, h - 16);
    c.restore();
  }

  private summary(s: OfficeSnapshot): void {
    const c = this.c;
    const count = (v: VisualState): number => s.entries.filter((e) => e.visual === v).length;
    c.fillStyle = '#ffffff';
    c.font = `bold 26px ${FONT}`;
    c.fillText('Como está o escritório agora', 30, 92);
    const items: Array<[string, number, string]> = [
      ['Trabalhando', count('working'), STATE_COLOR.working],
      ['Ocupados', count('busy'), STATE_COLOR.busy],
      ['Parados', count('stopped'), '#9ca3af'],
      ['Com erro', count('error'), STATE_COLOR.error],
    ];
    items.forEach(([label, n, col], i) => {
      const x = 30 + i * 150;
      c.fillStyle = 'rgb(255 255 255 / 0.06)';
      c.fillRect(x, 112, 136, 150);
      c.fillStyle = col;
      c.fillRect(x, 112, 136, 6);
      c.font = `900 64px ${FONT}`;
      c.fillText(String(n), x + 16, 200);
      c.fillStyle = '#cbd5e1';
      c.font = `bold 17px ${FONT}`;
      c.fillText(label, x + 16, 240);
    });
  }

  private ranking(s: OfficeSnapshot): void {
    const c = this.c;
    c.fillStyle = '#ffffff';
    c.font = `bold 26px ${FONT}`;
    c.fillText('Quem está trabalhando mais (CPU)', 30, 92);
    const top = [...s.entries].sort((a, b) => b.cpu - a.cpu).slice(0, 6);
    const max = Math.max(5, ...top.map((e) => e.cpu));
    top.forEach((e, i) => {
      const y = 116 + i * 30;
      c.fillStyle = '#e2e8f0';
      c.font = `bold 16px ${FONT}`;
      c.fillText(e.name, 30, y + 17);
      c.fillStyle = 'rgb(255 255 255 / 0.08)';
      c.fillRect(220, y + 3, 330, 18);
      c.fillStyle = e.accent;
      c.fillRect(220, y + 3, (330 * e.cpu) / max, 18);
      c.fillStyle = '#ffffff';
      c.font = `bold 14px ${MONO}`;
      c.fillText(`${e.cpu.toFixed(1)}%`, 560, y + 17);
    });
  }

  private employee(s: OfficeSnapshot): void {
    const c = this.c;
    const up = s.entries.filter((e) => e.startedAt && e.visual !== 'stopped' && e.visual !== 'error');
    const best = up.sort((a, b) => Date.parse(a.startedAt!) - Date.parse(b.startedAt!))[0];
    c.fillStyle = '#ffffff';
    c.font = `bold 26px ${FONT}`;
    c.fillText('Funcionário do mês', 30, 92);
    if (!best) return;
    c.fillStyle = best.accent;
    c.fillRect(30, 115, 140, 140);
    c.fillStyle = '#ffffff';
    c.font = `900 70px ${FONT}`;
    c.textAlign = 'center';
    c.fillText(best.name.slice(0, 1).toUpperCase(), 100, 210);
    c.textAlign = 'left';
    c.font = `900 34px ${FONT}`;
    c.fillText(best.name, 200, 160);
    c.fillStyle = '#cbd5e1';
    c.font = `bold 19px ${FONT}`;
    c.fillText(`No ar há ${since(best.startedAt!)} sem parar`, 200, 196);
    c.fillText(`Usando ${mem(best.memBytes)} de memória`, 200, 226);
    c.fillStyle = '#facc15';
    c.font = `900 30px ${FONT}`;
    c.fillText('★ ★ ★', 200, 262);
  }
}

/** Painel de métricas (estilo Grafana) com CPU real de cada serviço ao longo do tempo. */
export class MetricsBoard extends CanvasPanel {
  constructor() {
    super(640, 400, 2);
  }

  protected draw(s: OfficeSnapshot): void {
    const c = this.c;
    const { w, h } = this;
    c.fillStyle = '#0b0f17';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e5e7eb';
    c.font = `bold 17px ${FONT}`;
    c.fillText('Docker Office · Métricas ao vivo', 14, 26);
    c.fillStyle = '#6b7280';
    c.font = `13px ${MONO}`;
    c.fillText(clock(), w - 60, 26);

    // stats
    const running = s.entries.filter((e) => e.visual === 'working' || e.visual === 'busy');
    const cpu = running.reduce((a, e) => a + e.cpu, 0);
    const ram = running.reduce((a, e) => a + e.memBytes, 0);
    const errors = s.entries.filter((e) => e.visual === 'error').length;
    const stats: Array<[string, string, string]> = [
      ['Containers no ar', `${running.length}/${s.entries.length}`, '#22c55e'],
      ['CPU total', `${cpu.toFixed(1)}%`, '#60a5fa'],
      ['Memória total', mem(ram), '#a78bfa'],
      ['Com erro', String(errors), errors ? '#ef4444' : '#22c55e'],
    ];
    stats.forEach(([k, v, col], i) => {
      const x = 14 + i * 155;
      c.fillStyle = '#121826';
      c.fillRect(x, 40, 145, 70);
      c.fillStyle = '#9ca3af';
      c.font = `12px ${FONT}`;
      c.fillText(k, x + 10, 60);
      c.fillStyle = col;
      c.font = `bold 26px ${FONT}`;
      c.fillText(v, x + 10, 96);
    });

    // gráfico de linhas: CPU por serviço
    const gx = 14, gy = 124, gw = 400, gh = 262;
    c.fillStyle = '#121826';
    c.fillRect(gx, gy, gw, gh);
    c.fillStyle = '#9ca3af';
    c.font = `12px ${FONT}`;
    c.fillText('CPU · top 6 serviços (%) · últimos 2 min', gx + 10, gy + 18);
    // só os 6 que mais consomem agora (32 linhas viram espaguete); o ponto mais novo fica à direita
    const series = s.entries.filter((e) => e.history.length > 1)
      .sort((a, b) => b.cpu - a.cpu).slice(0, 6);
    const max = Math.max(10, ...series.flatMap((e) => e.history));
    const top0 = gy + 66, plotH = gh - 78, right = gx + gw - 40, step = (right - (gx + 8)) / 59;
    c.strokeStyle = '#1f2937';
    c.lineWidth = 1;
    c.fillStyle = '#4b5563';
    c.font = `10px ${MONO}`;
    for (let i = 0; i <= 4; i++) {
      const y = top0 + (plotH * i) / 4;
      c.beginPath();
      c.moveTo(gx + 8, y);
      c.lineTo(right, y);
      c.stroke();
      c.fillText(`${Math.round(max * (1 - i / 4))}`, right + 4, y + 3);
    }
    series.forEach((e, k) => {
      const hst = e.history.slice(-60);
      c.beginPath();
      hst.forEach((v, i) => {
        const x = right - (hst.length - 1 - i) * step;
        const y = top0 + plotH - (v / max) * plotH;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      });
      c.strokeStyle = e.accent;
      c.lineWidth = 2;
      c.stroke();
      // legenda
      const lx = gx + 10 + (k % 3) * 128, ly = gy + 36 + Math.floor(k / 3) * 15;
      c.fillStyle = e.accent;
      c.fillRect(lx, ly - 8, 8, 8);
      c.fillStyle = '#d1d5db';
      c.font = `11px ${FONT}`;
      c.fillText(`${e.name.slice(0, 11)} ${e.cpu.toFixed(0)}%`, lx + 12, ly);
    });

    // barras de memória
    const bx = 424, bw = 202;
    c.fillStyle = '#121826';
    c.fillRect(bx, gy, bw, gh);
    c.fillStyle = '#9ca3af';
    c.fillText('Memória (top 9)', bx + 10, gy + 18);
    const top = [...s.entries].sort((a, b) => b.memBytes - a.memBytes).slice(0, 9);
    const mmax = Math.max(1, ...top.map((e) => e.memBytes));
    top.forEach((e, i) => {
      const y = gy + 32 + i * 25;
      c.fillStyle = '#d1d5db';
      c.font = `11px ${FONT}`;
      c.fillText(e.name.slice(0, 14), bx + 10, y + 9);
      c.fillStyle = e.accent;
      c.fillRect(bx + 10, y + 13, ((bw - 20) * e.memBytes) / mmax, 6);
    });
  }
}

/** Relógio de parede com a hora real. */
export class WallClock extends CanvasPanel {
  constructor() {
    super(128, 128, 1);
  }

  protected off(): void {
    this.draw();
  }

  protected draw(): void {
    const c = this.c;
    c.clearRect(0, 0, 128, 128);
    c.fillStyle = '#1f2937';
    c.beginPath();
    c.arc(64, 64, 62, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#f9fafb';
    c.beginPath();
    c.arc(64, 64, 55, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#111827';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.fillRect(64 + Math.sin(a) * 46 - 2, 64 - Math.cos(a) * 46 - 2, 4, 4);
    }
    const d = new Date();
    const hand = (frac: number, len: number, width: number, color: string): void => {
      const a = frac * Math.PI * 2;
      c.strokeStyle = color;
      c.lineWidth = width;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(64, 64);
      c.lineTo(64 + Math.sin(a) * len, 64 - Math.cos(a) * len);
      c.stroke();
    };
    hand(((d.getHours() % 12) + d.getMinutes() / 60) / 12, 28, 5, '#111827');
    hand((d.getMinutes() + d.getSeconds() / 60) / 60, 40, 3.5, '#111827');
    hand(d.getSeconds() / 60, 44, 1.5, '#dc2626');
  }
}

/** Paisagem urbana vista pelas janelas (textura compartilhada). */
export function skylineTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 192;
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, 192);
  g.addColorStop(0, '#7cc0ef');
  g.addColorStop(1, '#d6ecfa');
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 192);
  c.fillStyle = 'rgb(255 255 255 / 0.85)';
  for (const [x, y, w] of [[30, 30, 50], [150, 22, 70], [200, 50, 40]] as const) {
    c.fillRect(x, y, w, 8);
    c.fillRect(x + 8, y - 6, w - 20, 6);
  }
  let x = 0, i = 0;
  while (x < 256) {
    const bw = 18 + ((i * 37) % 30), bh = 60 + ((i * 53) % 90);
    c.fillStyle = ['#64748b', '#475569', '#7b8794', '#556170'][i % 4]!;
    c.fillRect(x, 192 - bh, bw, bh);
    c.fillStyle = 'rgb(255 236 179 / 0.7)';
    for (let wy = 192 - bh + 6; wy < 186; wy += 9) for (let wx = x + 3; wx < x + bw - 4; wx += 6) if ((wx * 7 + wy * 3 + i) % 5 < 2) c.fillRect(wx, wy, 3, 4);
    x += bw + 2;
    i++;
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
