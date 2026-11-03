/**
 * Pôsteres de papel da cultura dev, desenhados em canvas (sem imagens externas).
 * Cada pôster: papel envelhecido + arte + texto. A ordem importa: os primeiros vão para
 * as paredes visíveis na câmera padrão.
 */
import * as THREE from 'three';
import { seeded } from './monitor.js';

export const POSTER_W = 240;
export const POSTER_H = 320;

const SERIF = 'Georgia, "DejaVu Serif", "Times New Roman", serif';
const SANS = 'system-ui, "Segoe UI", Roboto, Ubuntu, sans-serif';
const MONO = 'ui-monospace, "DejaVu Sans Mono", monospace';

type Ctx = CanvasRenderingContext2D;
type Draw = (c: Ctx, rnd: () => number) => void;

/* ───────── utilidades ───────── */

function paper(c: Ctx, rnd: () => number, base: string, edge = 'rgb(120 90 40 / 0.35)'): void {
  c.fillStyle = base;
  c.fillRect(0, 0, POSTER_W, POSTER_H);
  // manchas e pontinhos de papel velho
  for (let i = 0; i < 260; i++) {
    c.fillStyle = `rgb(110 80 40 / ${0.03 + rnd() * 0.06})`;
    c.fillRect(rnd() * POSTER_W, rnd() * POSTER_H, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // borda escurecida
  const g = c.createRadialGradient(POSTER_W / 2, POSTER_H / 2, POSTER_H * 0.3, POSTER_W / 2, POSTER_H / 2, POSTER_H * 0.72);
  g.addColorStop(0, 'rgb(0 0 0 / 0)');
  g.addColorStop(1, edge);
  c.fillStyle = g;
  c.fillRect(0, 0, POSTER_W, POSTER_H);
}

/** Dobra horizontal (pôster que veio dobrado). */
function fold(c: Ctx, y: number): void {
  c.fillStyle = 'rgb(0 0 0 / 0.07)';
  c.fillRect(0, y, POSTER_W, 2);
  c.fillStyle = 'rgb(255 255 255 / 0.25)';
  c.fillRect(0, y + 2, POSTER_W, 1);
}

function text(c: Ctx, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center'): void {
  c.font = font;
  c.fillStyle = color;
  c.textAlign = align;
  c.fillText(s, x, y);
}

/** Texto com quebra de linha automática; retorna o y depois da última linha. */
function wrap(c: Ctx, s: string, x: number, y: number, maxW: number, lh: number, font: string, color: string): number {
  c.font = font;
  c.fillStyle = color;
  c.textAlign = 'center';
  let line = '';
  for (const w of s.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (c.measureText(t).width > maxW && line) {
      c.fillText(line, x, y);
      y += lh;
      line = w;
    } else line = t;
  }
  c.fillText(line, x, y);
  return y + lh;
}

/* ───────── pôsteres ───────── */

const claude: Draw = (c, rnd) => {
  paper(c, rnd, '#f3ead9');
  // asterisco/explosão laranja
  const cx = POSTER_W / 2, cy = 112;
  c.strokeStyle = '#d97757';
  c.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.1;
    const r = 44 + (i % 3) * 10;
    c.lineWidth = 11 - (i % 2) * 3;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
    c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    c.stroke();
  }
  text(c, 'Claude', cx, 222, `bold 50px ${SERIF}`, '#1f1e1b');
  text(c, 'pense passo a passo.', cx, 252, `italic 17px ${SERIF}`, '#5b5346');
  c.fillStyle = '#d97757';
  c.fillRect(40, 270, POSTER_W - 80, 3);
  text(c, '> o seu par de programação', cx, 296, `13px ${MONO}`, '#5b5346');
};

const wanted: Draw = (c, rnd) => {
  paper(c, rnd, '#e6cf9f', 'rgb(90 50 10 / 0.6)');
  text(c, 'PROCURA-SE', POSTER_W / 2, 46, `bold 29px ${SERIF}`, '#3b2412');
  text(c, 'VIVO OU MORTO', POSTER_W / 2, 66, `bold 13px ${SERIF}`, '#5b3a1e');
  // "foto": o bug
  c.fillStyle = '#d9c08a';
  c.fillRect(42, 78, 156, 120);
  c.strokeStyle = '#3b2412';
  c.lineWidth = 3;
  c.strokeRect(42, 78, 156, 120);
  const px = (x: number, y: number, w: number, h: number, col: string): void => {
    c.fillStyle = col;
    c.fillRect(120 + x * 6, 138 + y * 6, w * 6, h * 6);
  };
  px(-5, -3, 10, 7, '#7f1d1d'); px(-1, -3, 2, 7, '#3b0a0a'); px(-3, -6, 6, 3, '#1f1f1f');
  px(-2, -5, 1, 1, '#fde047'); px(1, -5, 1, 1, '#fde047');
  for (const y of [-2, 0, 2]) { px(-7, y, 2, 1, '#1f1f1f'); px(5, y, 2, 1, '#1f1f1f'); }
  px(-3, -8, 1, 2, '#1f1f1f'); px(2, -8, 1, 2, '#1f1f1f');
  text(c, 'NullPointerException', POSTER_W / 2, 226, `bold 18px ${MONO}`, '#3b2412');
  text(c, 'visto pela última vez em produção', POSTER_W / 2, 246, `italic 12px ${SERIF}`, '#5b3a1e');
  text(c, 'RECOMPENSA', POSTER_W / 2, 278, `bold 16px ${SERIF}`, '#3b2412');
  text(c, '1.000.000 cafés', POSTER_W / 2, 304, `bold 20px ${SERIF}`, '#7f1d1d');
};

const friday: Draw = (c, rnd) => {
  paper(c, rnd, '#fde68a');
  for (let i = -2; i < 12; i++) {
    c.fillStyle = '#1f1f1f';
    c.beginPath();
    c.moveTo(i * 28, 0); c.lineTo(i * 28 + 14, 0); c.lineTo(i * 28 - 6, 22); c.lineTo(i * 28 - 20, 22);
    c.fill();
    c.beginPath();
    c.moveTo(i * 28, POSTER_H - 22); c.lineTo(i * 28 + 14, POSTER_H - 22); c.lineTo(i * 28 - 6, POSTER_H); c.lineTo(i * 28 - 20, POSTER_H);
    c.fill();
  }
  text(c, 'ATENÇÃO', POSTER_W / 2, 62, `bold 34px ${SANS}`, '#b91c1c');
  // calendário com X
  c.fillStyle = '#fff';
  c.fillRect(70, 82, 100, 92);
  c.fillStyle = '#b91c1c';
  c.fillRect(70, 82, 100, 24);
  text(c, 'SEXTA', 120, 100, `bold 16px ${SANS}`, '#fff');
  text(c, '18h', 120, 154, `bold 38px ${SANS}`, '#1f1f1f');
  c.strokeStyle = '#b91c1c';
  c.lineWidth = 8;
  c.beginPath(); c.moveTo(62, 76); c.lineTo(178, 182); c.moveTo(178, 76); c.lineTo(62, 182); c.stroke();
  wrap(c, 'NÃO FAÇA DEPLOY NA SEXTA-FEIRA', POSTER_W / 2, 220, 200, 30, `bold 24px ${SANS}`, '#1f1f1f');
  text(c, 'nem que o chefe peça', POSTER_W / 2, 284, `italic 13px ${SERIF}`, '#44403c');
};

const myMachine: Draw = (c, rnd) => {
  paper(c, rnd, '#f8f6f0');
  const cx = POSTER_W / 2, cy = 120;
  c.fillStyle = '#1d4ed8';
  c.beginPath();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2, r = i % 2 ? 76 : 84;
    c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  c.fill();
  c.fillStyle = '#f8f6f0';
  c.beginPath(); c.arc(cx, cy, 62, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#1d4ed8'; c.lineWidth = 3;
  c.beginPath(); c.arc(cx, cy, 56, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#16a34a'; c.lineWidth = 12; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx - 26, cy + 2); c.lineTo(cx - 6, cy + 22); c.lineTo(cx + 28, cy - 20); c.stroke();
  text(c, 'WORKS ON', cx, 238, `bold 30px ${SANS}`, '#1e3a8a');
  text(c, 'MY MACHINE', cx, 270, `bold 30px ${SANS}`, '#1e3a8a');
  text(c, 'certificado oficial · não garantido em prod', cx, 300, `10px ${SANS}`, '#475569');
};

const keepCalm: Draw = (c, rnd) => {
  paper(c, rnd, '#c81e1e', 'rgb(60 0 0 / 0.45)');
  // baleia de contêineres
  const cx = POSTER_W / 2;
  c.fillStyle = '#f5f0e6';
  for (const [x, y] of [[-30, 0], [-12, 0], [6, 0], [-21, -14], [-3, -14], [-12, -28]] as const) c.fillRect(cx + x, 70 + y, 15, 12);
  c.beginPath();
  c.moveTo(cx - 52, 86); c.lineTo(cx + 44, 86); c.quadraticCurveTo(cx + 60, 74, cx + 56, 64);
  c.lineTo(cx + 64, 68); c.quadraticCurveTo(cx + 54, 120, cx - 20, 118); c.quadraticCurveTo(cx - 50, 116, cx - 52, 86);
  c.fill();
  c.fillStyle = '#c81e1e';
  c.beginPath(); c.arc(cx - 30, 98, 3, 0, Math.PI * 2); c.fill();
  text(c, 'KEEP', cx, 170, `bold 34px ${SERIF}`, '#f5f0e6');
  text(c, 'CALM', cx, 206, `bold 34px ${SERIF}`, '#f5f0e6');
  text(c, 'AND', cx, 232, `bold 16px ${SERIF}`, '#f5f0e6');
  text(c, 'docker compose', cx, 266, `bold 20px ${MONO}`, '#f5f0e6');
  text(c, 'up -d', cx, 292, `bold 20px ${MONO}`, '#f5f0e6');
};

const helloWorld: Draw = (c, rnd) => {
  paper(c, rnd, '#16181d', 'rgb(0 0 0 / 0.6)');
  c.fillStyle = '#0b0d10';
  c.fillRect(20, 40, 200, 150);
  c.strokeStyle = '#374151'; c.lineWidth = 4;
  c.strokeRect(20, 40, 200, 150);
  c.textAlign = 'left';
  c.font = `14px ${MONO}`;
  c.fillStyle = '#4ade80';
  ['$ gcc hello.c', '$ ./a.out', 'Hello, World!', '$ █'].forEach((l, i) => c.fillText(l, 34, 72 + i * 26));
  text(c, 'TODO MUNDO', POSTER_W / 2, 238, `bold 26px ${SANS}`, '#e5e7eb');
  text(c, 'COMEÇOU AQUI', POSTER_W / 2, 270, `bold 26px ${SANS}`, '#4ade80');
  text(c, 'desde 1978', POSTER_W / 2, 298, `italic 12px ${SERIF}`, '#9ca3af');
};

const noCloud: Draw = (c, rnd) => {
  paper(c, rnd, '#e0f2fe');
  const cl = (x: number, y: number, s: number): void => {
    c.fillStyle = '#fff';
    for (const [dx, dy, r] of [[0, 0, 26], [28, -10, 32], [58, 0, 24], [30, 10, 26]] as const) {
      c.beginPath(); c.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); c.fill();
    }
  };
  cl(62, 90, 1.2);
  // servidor "escondido" na nuvem
  c.fillStyle = '#334155';
  c.fillRect(98, 70, 46, 54);
  for (let i = 0; i < 4; i++) {
    c.fillStyle = '#475569'; c.fillRect(102, 74 + i * 12, 38, 9);
    c.fillStyle = i % 2 ? '#22c55e' : '#f59e0b'; c.fillRect(134, 77 + i * 12, 3, 3);
  }
  text(c, 'NÃO EXISTE', POSTER_W / 2, 186, `bold 26px ${SANS}`, '#0c4a6e');
  text(c, 'NUVEM', POSTER_W / 2, 222, `bold 40px ${SANS}`, '#0369a1');
  wrap(c, 'é só o computador de outra pessoa', POSTER_W / 2, 256, 190, 20, `italic 16px ${SERIF}`, '#0c4a6e');
};

const forcePush: Draw = (c, rnd) => {
  paper(c, rnd, '#fafaf9');
  const cx = POSTER_W / 2, cy = 120;
  c.fillStyle = '#1f1f1f';
  c.fillRect(cx - 60, cy - 14, 120, 28);
  text(c, 'push --force', cx, cy + 6, `bold 16px ${MONO}`, '#fafaf9');
  c.strokeStyle = '#dc2626'; c.lineWidth = 14;
  c.beginPath(); c.arc(cx, cy, 72, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(cx - 50, cy - 50); c.lineTo(cx + 50, cy + 50); c.stroke();
  text(c, 'PROIBIDO', cx, 238, `bold 34px ${SANS}`, '#dc2626');
  text(c, 'na main. Nunca. Jamais.', cx, 266, `14px ${SANS}`, '#292524');
  text(c, '— a gerência', cx, 296, `italic 12px ${SERIF}`, '#57534e');
};

const duck: Draw = (c, rnd) => {
  paper(c, rnd, '#fef9c3');
  const cx = POSTER_W / 2;
  c.fillStyle = '#facc15';
  c.beginPath(); c.ellipse(cx + 6, 150, 62, 40, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(cx - 30, 96, 32, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f97316';
  c.beginPath(); c.moveTo(cx - 60, 96); c.lineTo(cx - 84, 104); c.lineTo(cx - 58, 110); c.fill();
  c.fillStyle = '#1f1f1f';
  c.beginPath(); c.arc(cx - 38, 88, 4, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#eab308';
  c.beginPath(); c.ellipse(cx + 20, 146, 30, 16, -0.3, 0, Math.PI * 2); c.fill();
  text(c, 'EXPLIQUE', cx, 228, `bold 30px ${SANS}`, '#1f1f1f');
  text(c, 'PARA O PATO', cx, 262, `bold 26px ${SANS}`, '#a16207');
  text(c, 'rubber duck debugging', cx, 292, `italic 13px ${SERIF}`, '#57534e');
};

const coffee404: Draw = (c, rnd) => {
  paper(c, rnd, '#f5ebe0');
  text(c, '404', POSTER_W / 2, 110, `bold 84px ${SANS}`, '#7c2d12');
  const cx = POSTER_W / 2;
  c.fillStyle = '#fff';
  c.fillRect(cx - 34, 130, 68, 62);
  c.strokeStyle = '#7c2d12'; c.lineWidth = 5;
  c.strokeRect(cx - 34, 130, 68, 62);
  c.beginPath(); c.arc(cx + 42, 160, 14, -1.2, 1.2); c.stroke();
  c.strokeStyle = '#a8a29e'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(cx - 30, 150); c.lineTo(cx + 30, 150); c.stroke();
  text(c, 'CAFÉ NÃO', cx, 236, `bold 28px ${SANS}`, '#7c2d12');
  text(c, 'ENCONTRADO', cx, 268, `bold 28px ${SANS}`, '#7c2d12');
  text(c, 'tente novamente após recarregar a garrafa', cx, 298, `10px ${SANS}`, '#57534e');
};

const openSource: Draw = (c, rnd) => {
  paper(c, rnd, '#ecfccb');
  // grafo de branches
  c.strokeStyle = '#3f6212'; c.lineWidth = 6; c.lineCap = 'round';
  c.beginPath(); c.moveTo(80, 50); c.lineTo(80, 180); c.moveTo(80, 90); c.quadraticCurveTo(160, 90, 160, 130); c.lineTo(160, 150);
  c.quadraticCurveTo(160, 170, 80, 170); c.stroke();
  for (const [x, y, col] of [[80, 50, '#65a30d'], [80, 110, '#65a30d'], [160, 130, '#ea580c'], [80, 180, '#65a30d']] as const) {
    c.fillStyle = col; c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = '#dc2626';
  c.beginPath(); c.moveTo(178, 72); c.bezierCurveTo(178, 56, 200, 56, 200, 72); c.bezierCurveTo(200, 56, 222, 56, 222, 72);
  c.bezierCurveTo(222, 88, 200, 98, 200, 104); c.bezierCurveTo(200, 98, 178, 88, 178, 72); c.fill();
  text(c, 'CÓDIGO ABERTO', POSTER_W / 2, 230, `bold 24px ${SANS}`, '#365314');
  text(c, 'PRs bem-vindos', POSTER_W / 2, 260, `bold 20px ${MONO}`, '#3f6212');
  text(c, 'leia o CONTRIBUTING.md antes :)', POSTER_W / 2, 292, `11px ${SANS}`, '#44403c');
};

const tabsSpaces: Draw = (c, rnd) => {
  paper(c, rnd, '#ede9fe');
  text(c, 'O GRANDE DEBATE', POSTER_W / 2, 44, `bold 20px ${SERIF}`, '#4c1d95');
  c.fillStyle = '#7c3aed'; c.fillRect(24, 64, 86, 110);
  c.fillStyle = '#0d9488'; c.fillRect(130, 64, 86, 110);
  text(c, '→|', 67, 130, `bold 40px ${MONO}`, '#fff');
  text(c, '· · ·', 173, 126, `bold 40px ${MONO}`, '#fff');
  text(c, 'TABS', 67, 198, `bold 20px ${SANS}`, '#4c1d95');
  text(c, 'ESPAÇOS', 173, 198, `bold 20px ${SANS}`, '#115e59');
  text(c, 'VS', POSTER_W / 2, 126, `bold 22px ${SANS}`, '#1f1f1f');
  wrap(c, 'Discussão marcada para sexta, 18h, logo depois do deploy.', POSTER_W / 2, 238, 196, 20, `italic 14px ${SERIF}`, '#3b0764');
};

export const POSTERS: readonly Draw[] = [
  claude, wanted, friday, myMachine, keepCalm, duck, helloWorld, noCloud, forcePush, coffee404, openSource, tabsSpaces,
];

export function posterTexture(index: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = POSTER_W * 2; // 2× para ficar nítido no tamanho grande
  cv.height = POSTER_H * 2;
  const c = cv.getContext('2d')!;
  c.scale(2, 2);
  const i = ((index % POSTERS.length) + POSTERS.length) % POSTERS.length;
  const rnd = seeded(1000 + i * 77);
  POSTERS[i]!(c, rnd);
  if (i % 3 === 1) fold(c, POSTER_H / 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
