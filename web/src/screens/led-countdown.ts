/**
 * Painel de LED de 7 segmentos com a contagem para o Ano Novo.
 * Segmentos apagados ficam levemente visíveis (como num painel de verdade) e os acesos brilham.
 */
import * as THREE from 'three';
import type { Countdown } from '../util/calendar.js';
import { U, voxels } from '../three/voxel.js';

const W = 640, H = 200;
const ON = '#ff3b2f', GLOW = 'rgb(255 70 50 / 0.9)', OFF = '#2b0b0a';
const GOLD = '#ffc53d', GOLD_GLOW = 'rgb(255 200 60 / 0.9)';
const MONO = 'ui-monospace, "DejaVu Sans Mono", monospace';

//        a
//      f   b
//        g
//      e   c
//        d
const DIGITS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd',
  '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', ' ': '',
};

export class LedCountdown {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  private readonly c: CanvasRenderingContext2D;
  private lastKey = '';

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.c = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  /** Redesenha só quando o texto muda (1×/s, ou 4×/s para piscar). */
  update(cd: Countdown, now: Date): void {
    const blink = Math.floor(now.getTime() / 500) % 2 === 0;
    const key = cd.arrived ? `a${blink}` : `${Math.ceil(cd.ms / 1000)}${cd.ms < 60_000 ? blink : ''}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.draw(cd, blink);
    this.texture.needsUpdate = true;
  }

  private draw(cd: Countdown, blink: boolean): void {
    const c = this.c;
    c.fillStyle = '#070606';
    c.fillRect(0, 0, W, H);
    // grade de pontos do painel
    c.fillStyle = '#120808';
    for (let y = 4; y < H; y += 6) for (let x = 4; x < W; x += 6) c.fillRect(x, y, 2, 2);

    const final = !cd.arrived && cd.ms < 60_000; // último minuto: dourado piscando
    const on = cd.arrived || final ? GOLD : ON;
    const glow = cd.arrived || final ? GOLD_GLOW : GLOW;

    if (cd.arrived) {
      this.label(`FELIZ ANO NOVO`, W / 2, 34, on, glow, 22, blink);
      const s = String(cd.year);
      const dw = 70, gap = 24, total = s.length * dw + (s.length - 1) * gap;
      [...s].forEach((ch, i) => this.digit(ch, (W - total) / 2 + i * (dw + gap), 56, dw, 120, blink ? on : OFF, glow));
      return;
    }

    const sec = Math.ceil(cd.ms / 1000);
    const parts = [Math.floor(sec / 86400), Math.floor(sec / 3600) % 24, Math.floor(sec / 60) % 60, sec % 60];
    this.label(`CONTAGEM PARA ${cd.year}`, W / 2, 30, on, glow, 18, true);
    const dw = 50, dh = 96, inner = 12, group = 2 * dw + inner, colon = 34;
    const total = 4 * group + 3 * colon;
    let x = (W - total) / 2;
    const y = 50;
    const names = ['DIAS', 'HORAS', 'MIN', 'SEG'];
    parts.forEach((v, i) => {
      const s = String(v).padStart(2, '0');
      const lit = final && !blink ? OFF : on;
      this.digit(s[0]!, x, y, dw, dh, lit, glow);
      this.digit(s[1]!, x + dw + inner, y, dw, dh, lit, glow);
      this.label(names[i]!, x + group / 2, y + dh + 34, on, glow, 15, true);
      x += group;
      if (i < 3) {
        const cx = x + colon / 2;
        const dot = sec % 2 === 0 ? on : OFF; // dois-pontos piscam a cada segundo
        this.led(cx - 4, y + dh * 0.3, 8, 8, dot, glow);
        this.led(cx - 4, y + dh * 0.68, 8, 8, dot, glow);
        x += colon;
      }
    });
  }

  private label(text: string, x: number, y: number, color: string, glow: string, size: number, lit: boolean): void {
    const c = this.c;
    c.font = `bold ${size}px ${MONO}`;
    c.textAlign = 'center';
    c.fillStyle = lit ? color : OFF;
    c.shadowColor = glow;
    c.shadowBlur = lit ? 10 : 0;
    c.fillText(text, x, y);
    c.shadowBlur = 0;
    c.textAlign = 'left';
  }

  private led(x: number, y: number, w: number, h: number, color: string, glow: string): void {
    const c = this.c;
    c.fillStyle = color;
    c.shadowColor = glow;
    c.shadowBlur = color === OFF ? 0 : 14;
    c.fillRect(x, y, w, h);
    c.shadowBlur = 0;
  }

  /** Dígito de 7 segmentos com cantos chanfrados e leve inclinação, como nos painéis de LED. */
  private digit(ch: string, x: number, y: number, w: number, h: number, color: string, glow: string): void {
    const c = this.c;
    const lit = DIGITS[ch] ?? '';
    const t = Math.max(6, w * 0.17); // espessura
    const half = h / 2;
    const slant = 0.08;
    const seg = (name: string, sx: number, sy: number, horizontal: boolean, len: number): void => {
      const isOn = lit.includes(name) && color !== OFF;
      c.fillStyle = isOn ? color : OFF;
      c.shadowColor = glow;
      c.shadowBlur = isOn ? 16 : 0;
      c.beginPath();
      const k = t / 2;
      const pts: Array<[number, number]> = horizontal
        ? [[sx, sy], [sx + k, sy - k], [sx + len - k, sy - k], [sx + len, sy], [sx + len - k, sy + k], [sx + k, sy + k]]
        : [[sx, sy], [sx + k, sy + k], [sx + k, sy + len - k], [sx, sy + len], [sx - k, sy + len - k], [sx - k, sy + k]];
      pts.forEach(([px, py], i) => {
        const ox = x + px + (h - py) * slant;
        if (i === 0) c.moveTo(ox, y + py);
        else c.lineTo(ox, y + py);
      });
      c.closePath();
      c.fill();
    };
    const g = 2; // folga entre segmentos
    seg('a', t / 2 + g, t / 2, true, w - t - 2 * g);
    seg('g', t / 2 + g, half, true, w - t - 2 * g);
    seg('d', t / 2 + g, h - t / 2, true, w - t - 2 * g);
    seg('f', t / 2, t / 2 + g, false, half - t / 2 - 2 * g);
    seg('e', t / 2, half + g, false, half - t / 2 - 2 * g);
    seg('b', w - t / 2, t / 2 + g, false, half - t / 2 - 2 * g);
    seg('c', w - t / 2, half + g, false, half - t / 2 - 2 * g);
    c.shadowBlur = 0;
  }
}

/** Moldura de metal escuro com o painel; origem no centro do painel, encostado na parede. */
export function ledPanel(tex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const w = 1.7, h = (w * H) / W;
  const fw = w / U, fh = h / U;
  g.add(voxels((b) => b.box(-fw / 2 - 0.8, -fh / 2 - 0.8, 0, fw + 1.6, fh + 1.6, 1.2, '#1c1d22')
    .box(-fw / 2 - 0.9, -fh / 2 - 0.9, 0.9, fw + 1.8, 0.5, 0.5, '#3a3c44')
    .box(-0.4, fh / 2 + 0.8, 0.2, 0.8, 3, 0.4, '#3a3c44')));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.z = 1.25 * U;
  g.add(screen);
  return g;
}
