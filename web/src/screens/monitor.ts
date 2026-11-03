/**
 * Tela do monitor de cada personagem (CanvasTexture redesenhada ~2×/s).
 * Metade esquerda: interface "no estilo" do app do serviço; direita: dados REAIS do container
 * (CPU com histórico, memória, tempo no ar, saúde, último evento).
 */
import * as THREE from 'three';
import type { ContainerView } from '../model.js';
import type { ScreenTheme } from '../characters/types.js';
import { clock, mem, since } from '../util/format.js';
import { hash } from '../pixel/color.js';

export const SCREEN_W = 256;
export const SCREEN_H = 160;

export interface MonitorInput {
  name: string;
  accent: string;
  theme: ScreenTheme;
  data: ContainerView;
  atDesk: boolean;
  history: readonly number[];
  engineUp: boolean;
  /** Serviços que mais usam CPU agora (o tema "dashboard" plota o histórico real deles). */
  peers?: ReadonlyArray<{ name: string; accent: string; history: readonly number[] }>;
}

const MONO = 'ui-monospace, "DejaVu Sans Mono", monospace';

export class MonitorScreen {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private last = -1;
  private readonly seed: number;

  constructor(seedName: string) {
    this.canvas.width = SCREEN_W;
    this.canvas.height = SCREEN_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.seed = hash(seedName);
  }

  /** Redesenha no máximo a cada `interval` segundos (escalonado por personagem). */
  update(input: MonitorInput, t: number, interval = 0.5): void {
    const slot = Math.floor(t / interval + (this.seed % 97) / 97);
    if (slot === this.last) return;
    this.last = slot;
    this.draw(input, t);
    this.texture.needsUpdate = true;
  }

  private draw(d: MonitorInput, t: number): void {
    const c = this.ctx;
    const { visualState } = d.data;
    if (!d.engineUp) return this.noSignal(t);
    if (visualState === 'stopped') {
      c.fillStyle = '#050608';
      c.fillRect(0, 0, SCREEN_W, SCREEN_H);
      c.fillStyle = '#1b1f27';
      c.fillRect(10, 10, 40, 4);
      return;
    }
    if (visualState === 'error') return this.crash(d, t);
    if (!d.atDesk && visualState === 'working') return this.saver(d, t);

    c.fillStyle = '#0e1117';
    c.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // barra de título
    c.fillStyle = d.accent;
    c.fillRect(0, 0, SCREEN_W, 16);
    c.fillStyle = '#ffffff';
    c.font = `bold 11px ${MONO}`;
    c.textBaseline = 'middle';
    c.fillText(d.name, 6, 8.5);
    c.textAlign = 'right';
    c.fillText(clock(), SCREEN_W - 6, 8.5);
    c.textAlign = 'left';

    c.save();
    c.beginPath();
    c.rect(0, 16, 160, SCREEN_H - 16);
    c.clip();
    this.app(d, t);
    c.restore();
    this.stats(d, t);
  }

  /* ───────── painel com dados reais ───────── */

  private stats(d: MonitorInput, t: number): void {
    const c = this.ctx;
    const x = 162, w = SCREEN_W - x - 4;
    c.fillStyle = '#161b24';
    c.fillRect(x - 2, 18, w + 4, SCREEN_H - 20);
    const cpu = d.data.metrics?.cpu ?? 0;
    const busy = d.data.visualState === 'busy';
    c.font = `9px ${MONO}`;
    c.fillStyle = '#8b95a7';
    c.fillText('CPU', x + 2, 27);
    c.font = `bold 15px ${MONO}`;
    c.fillStyle = busy ? (Math.sin(t * 8) > 0 ? '#f87171' : '#fbbf24') : '#4ade80';
    c.fillText(`${cpu.toFixed(cpu < 10 ? 1 : 0)}%`, x + 2, 41);
    // sparkline
    const h = d.history.slice(-40);
    const gy = 52, gh = 26;
    c.strokeStyle = '#263041';
    c.strokeRect(x + 1, gy, w - 2, gh);
    if (h.length > 1) {
      const max = Math.max(10, ...h);
      c.beginPath();
      h.forEach((v, i) => {
        const px = x + 2 + (i / (h.length - 1)) * (w - 4);
        const py = gy + gh - 1 - (v / max) * (gh - 3);
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      });
      c.strokeStyle = busy ? '#fbbf24' : '#4ade80';
      c.lineWidth = 1.5;
      c.stroke();
    }
    const rows: Array<[string, string]> = [
      ['RAM', d.data.metrics ? mem(d.data.metrics.memBytes) : '—'],
      ['UP', d.data.startedAt ? since(d.data.startedAt) : '—'],
      ['HC', d.data.health ?? 'n/d'],
    ];
    c.font = `9px ${MONO}`;
    rows.forEach(([k, v], i) => {
      const y = 92 + i * 14;
      c.fillStyle = '#8b95a7';
      c.fillText(k, x + 2, y);
      c.fillStyle = k === 'HC' && v === 'unhealthy' ? '#f87171' : '#e5e7eb';
      c.fillText(v, x + 24, y);
    });
    if (busy && Math.sin(t * 6) > 0) {
      c.fillStyle = '#7c2d12';
      c.fillRect(x - 2, SCREEN_H - 18, w + 4, 16);
      c.fillStyle = '#fde68a';
      c.font = `bold 9px ${MONO}`;
      c.fillText('ALTA CARGA', x + 6, SCREEN_H - 9);
    }
  }

  /* ───────── interfaces por tipo de serviço ───────── */

  private app(d: MonitorInput, t: number): void {
    const c = this.ctx;
    const rnd = seeded(this.seed);
    const speed = d.data.visualState === 'busy' ? 4 : 1;
    switch (d.theme) {
      case 'media-grid': {
        c.fillStyle = '#9ca3af';
        c.font = `9px ${MONO}`;
        c.fillText('Continuar assistindo', 6, 27);
        const sel = Math.floor(t * 0.5) % 8;
        for (let i = 0; i < 8; i++) {
          const px = 6 + (i % 4) * 38, py = 34 + Math.floor(i / 4) * 60;
          c.fillStyle = `hsl(${Math.floor(rnd() * 360)} 45% 40%)`;
          c.fillRect(px, py, 32, 46);
          c.fillStyle = 'rgb(255 255 255 / 0.15)';
          c.fillRect(px + 4, py + 6, 24, 18);
          c.fillStyle = '#d1d5db';
          c.fillRect(px, py + 49, 22 + rnd() * 8, 3);
          if (i === sel) {
            c.strokeStyle = d.accent;
            c.lineWidth = 2;
            c.strokeRect(px - 1, py - 1, 34, 48);
          }
        }
        break;
      }
      case 'calendar': {
        const days = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
        c.font = `9px ${MONO}`;
        days.forEach((dd, i) => {
          c.fillStyle = '#9ca3af';
          c.fillText(dd, 10 + i * 21, 27);
          for (let r = 0; r < 4; r++) {
            const px = 4 + i * 21, py = 34 + r * 30;
            c.fillStyle = '#1a202b';
            c.fillRect(px, py, 19, 27);
            if (rnd() < 0.45) {
              c.fillStyle = rnd() < 0.7 ? d.accent : '#22c55e';
              c.fillRect(px + 2, py + 4, 15, 6);
              c.fillStyle = '#6b7280';
              c.fillRect(px + 2, py + 13, 11, 3);
            }
          }
        });
        const today = (Math.floor(t * 0.2) % 7) * 21 + 4;
        c.strokeStyle = '#fbbf24';
        c.strokeRect(today, 33, 20, 120);
        break;
      }
      case 'list': {
        c.font = `9px ${MONO}`;
        for (let i = 0; i < 7; i++) {
          const y = 22 + i * 19;
          c.fillStyle = i % 2 ? '#121722' : '#161c28';
          c.fillRect(0, y, 160, 18);
          c.fillStyle = `hsl(${Math.floor(rnd() * 360)} 40% 45%)`;
          c.fillRect(4, y + 2, 10, 14);
          c.fillStyle = '#e5e7eb';
          c.fillRect(18, y + 4, 50 + rnd() * 50, 3);
          const prog = (rnd() + t * 0.02 * speed * (i < 3 ? 1 : 0)) % 1;
          c.fillStyle = '#374151';
          c.fillRect(18, y + 11, 100, 3);
          c.fillStyle = prog > 0.98 ? '#22c55e' : d.accent;
          c.fillRect(18, y + 11, 100 * prog, 3);
        }
        break;
      }
      case 'dns': {
        const q = 18000 + Math.floor(t * 3 * speed) + (this.seed % 5000);
        c.fillStyle = '#9ca3af';
        c.font = `9px ${MONO}`;
        c.fillText('Consultas hoje', 6, 28);
        c.fillStyle = '#e5e7eb';
        c.font = `bold 18px ${MONO}`;
        c.fillText(q.toLocaleString('pt-BR'), 6, 45);
        c.font = `9px ${MONO}`;
        c.fillStyle = '#9ca3af';
        c.fillText('Bloqueadas 17,3%', 6, 62);
        c.fillStyle = '#374151';
        c.fillRect(6, 67, 148, 5);
        c.fillStyle = d.accent;
        c.fillRect(6, 67, 148 * 0.173, 5);
        const domains = ['ads.tracker.net', 'api.github.com', 'cdn.jellyfin.org', 'telemetry.app', 'ntp.ubuntu.com', 'pixel.ads.io', 'dns.google'];
        for (let i = 0; i < 5; i++) {
          const dm = domains[(i + Math.floor(t * speed)) % domains.length]!;
          const blocked = /ads|telemetry|tracker/.test(dm);
          const y = 84 + i * 15;
          c.fillStyle = '#d1d5db';
          c.fillText(dm, 6, y);
          c.fillStyle = blocked ? '#ef4444' : '#22c55e';
          c.fillText(blocked ? 'BLOQ' : 'OK', 128, y);
        }
        break;
      }
      case 'dashboard': {
        // 4 painéis com o histórico real de CPU dos serviços mais ativos do escritório
        const peers = d.peers ?? [];
        for (let p = 0; p < 4; p++) {
          const px = 4 + (p % 2) * 78, py = 20 + Math.floor(p / 2) * 68;
          c.fillStyle = '#161b24';
          c.fillRect(px, py, 74, 64);
          const peer = peers[p];
          if (!peer) continue;
          const h = peer.history.slice(-20);
          const max = Math.max(10, ...h);
          c.fillStyle = '#9ca3af';
          c.font = `8px ${MONO}`;
          c.fillText(`${peer.name.slice(0, 9)} ${Math.round(h.at(-1) ?? 0)}%`, px + 4, py + 10);
          c.beginPath();
          h.forEach((v, i) => {
            const xx = px + 70 - (h.length - 1 - i) * 3.4, yy = py + 60 - (v / max) * 44;
            if (i) c.lineTo(xx, yy);
            else c.moveTo(xx, yy);
          });
          c.strokeStyle = peer.accent;
          c.lineWidth = 1.5;
          c.stroke();
        }
        break;
      }
      case 'terminal':
      default: {
        c.font = `9px ${MONO}`;
        const lines = 12;
        const scroll = Math.floor(t * 2 * speed);
        for (let i = 0; i < lines; i++) {
          const n = scroll + i;
          const r = seeded(this.seed + n);
          const status = r() < 0.9 ? 200 : 404;
          c.fillStyle = status === 200 ? '#86efac' : '#fca5a5';
          c.fillText(`GET /api/${['status', 'items', 'health', 'queue'][n % 4]} ${status}`, 4, 26 + i * 11);
        }
      }
    }
  }

  private saver(d: MonitorInput, t: number): void {
    const c = this.ctx;
    c.fillStyle = '#05070c';
    c.fillRect(0, 0, SCREEN_W, SCREEN_H);
    const bw = 96, bh = 30;
    const x = Math.abs(((t * 30) % ((SCREEN_W - bw) * 2)) - (SCREEN_W - bw));
    const y = Math.abs(((t * 22) % ((SCREEN_H - bh) * 2)) - (SCREEN_H - bh));
    c.fillStyle = d.accent;
    c.fillRect(x, y, bw, bh);
    c.fillStyle = '#ffffff';
    c.font = `bold 12px ${MONO}`;
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.fillText(d.name, x + bw / 2, y + bh / 2);
    c.font = `10px ${MONO}`;
    c.fillStyle = '#6b7280';
    c.fillText(`${clock()} · volto já`, SCREEN_W / 2, SCREEN_H - 10);
    c.textAlign = 'left';
  }

  private crash(d: MonitorInput, t: number): void {
    const c = this.ctx;
    c.fillStyle = Math.sin(t * 6) > -0.6 ? '#1e3a8a' : '#7f1d1d';
    c.fillRect(0, 0, SCREEN_W, SCREEN_H);
    c.fillStyle = '#ffffff';
    c.font = `bold 34px ${MONO}`;
    c.textBaseline = 'alphabetic';
    c.fillText(':(', 12, 46);
    c.font = `bold 11px ${MONO}`;
    c.fillText(`${d.name} parou de funcionar`, 12, 70);
    c.font = `10px ${MONO}`;
    const lines = [
      d.data.reason ?? 'falha desconhecida',
      `estado: ${d.data.dockerState}${d.data.exitCode !== undefined ? ` · exit ${d.data.exitCode}` : ''}`,
      `reinícios: ${d.data.restartCount ?? 0}`,
      d.data.lastEvent ? `último evento: ${d.data.lastEvent.action} há ${since(d.data.lastEvent.at)}` : '',
    ];
    lines.forEach((l, i) => c.fillText(l, 12, 92 + i * 15));
    c.textBaseline = 'middle';
  }

  private noSignal(t: number): void {
    const c = this.ctx;
    c.fillStyle = '#0a0a0a';
    c.fillRect(0, 0, SCREEN_W, SCREEN_H);
    c.fillStyle = Math.sin(t * 3) > 0 ? '#9ca3af' : '#4b5563';
    c.font = `bold 14px ${MONO}`;
    c.textAlign = 'center';
    c.fillText('SEM SINAL', SCREEN_W / 2, SCREEN_H / 2);
    c.textAlign = 'left';
  }
}

export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
