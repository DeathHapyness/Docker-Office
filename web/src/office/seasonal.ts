/**
 * Decoração sazonal do escritório (Natal, Ano Novo, Carnaval, Junina…), toda gerada em código.
 * Peças de parede vão como filhas das paredes (somem junto quando a câmera passa por elas);
 * o resto fica num grupo próprio. Nada usa o voxelMaterial → não entra no bakeStatic e pode
 * ser trocado no meio do dia sem reconstruir o escritório.
 */
import * as THREE from 'three';
import type { Holiday } from '../util/calendar.js';
import type { OfficeLayout } from './layout.js';
import { PolyBuilder } from '../three/lowpoly.js';

export interface Walls {
  back: THREE.Object3D;
  left: THREE.Object3D;
  right: THREE.Object3D;
  front: THREE.Object3D;
}

export interface Decor {
  readonly holiday: Holiday;
  /** Grupo das peças soltas (as de parede ficam nas paredes); quem chama adiciona na cena. */
  readonly root: THREE.Group;
  update(t: number): void;
  dispose(): void;
}

const decorMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
const cordMaterial = new THREE.LineBasicMaterial({ color: '#3b3b3b' });

type P3 = [number, number, number];

/** Ponto de um cordão que pende entre `a` e `b` (catenária aproximada por parábola). */
function sag(a: P3, b: P3, k: number, depth: number): P3 {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - depth * 4 * k * (1 - k), a[2] + (b[2] - a[2]) * k];
}

/** Pontos ao longo de vários vãos que pendem entre apoios (~`span` m cada). */
function festoon(a: P3, b: P3, span: number, depth: number, step: number): P3[] {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const spans = Math.max(1, Math.round(len / span));
  const out: P3[] = [];
  for (let s = 0; s < spans; s++) {
    const pa = sag(a, b, s / spans, 0), pb = sag(a, b, (s + 1) / spans, 0);
    const n = Math.max(2, Math.round(len / spans / step));
    for (let i = s === 0 ? 0 : 1; i <= n; i++) out.push(sag(pa, pb, i / n, depth));
  }
  return out;
}

class Kit {
  readonly group = new THREE.Group();
  private readonly attached: THREE.Object3D[] = [];
  private readonly ticks: Array<(t: number) => void> = [];
  private readonly dispose: Array<() => void> = [];

  constructor(readonly L: OfficeLayout, readonly walls: Walls) {}

  put(obj: THREE.Object3D, parent?: THREE.Object3D): THREE.Object3D {
    (parent ?? this.group).add(obj);
    if (parent) this.attached.push(obj);
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) this.dispose.push(() => o.geometry.dispose());
      if (o instanceof THREE.InstancedMesh) this.dispose.push(() => o.dispose());
    });
    return obj;
  }

  tick(f: (t: number) => void): void {
    this.ticks.push(f);
  }

  mesh(b: PolyBuilder, shadows = false): THREE.Mesh {
    return b.mesh(decorMaterial, shadows);
  }

  cord(points: P3[], parent?: THREE.Object3D): void {
    const g = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
    this.put(new THREE.Line(g, cordMaterial), parent);
  }

  /** Bandeirinhas (triângulo ou retângulo) penduradas num cordão. */
  bunting(points: P3[], colors: readonly string[], shape: 'tri' | 'rect', parent?: THREE.Object3D, size = 0.16): void {
    this.cord(points, parent);
    const pos: number[] = [], col: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i + 1 < points.length; i++) {
      const [a, b] = [points[i]!, points[i + 1]!];
      c.set(colors[i % colors.length]!);
      const h = size * (shape === 'tri' ? 1.25 : 0.95);
      const tri = (p: P3[]): void => {
        for (const v of p) { pos.push(...v); col.push(c.r, c.g, c.b); }
      };
      const bl: P3 = [a[0], a[1] - h, a[2]], br: P3 = [b[0], b[1] - h, b[2]];
      if (shape === 'tri') tri([a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - h, (a[2] + b[2]) / 2]]);
      else { tri([a, b, br]); tri([a, br, bl]); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.put(new THREE.Mesh(g, decorMaterial), parent);
  }

  /** Pisca-pisca: lâmpadas que trocam de cor em sequência. */
  lights(points: P3[], colors: readonly string[], parent?: THREE.Object3D, mode: 'chase' | 'twinkle' = 'chase'): void {
    this.cord(points, parent);
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.032, 0), new THREE.MeshBasicMaterial(), points.length);
    const m = new THREE.Matrix4();
    points.forEach((p, i) => im.setMatrixAt(i, m.makeTranslation(p[0], p[1] - 0.04, p[2])));
    const c = new THREE.Color();
    const dark = colors.map((k) => new THREE.Color(k).multiplyScalar(0.25));
    let last = -1;
    const paint = (t: number): void => {
      const step = Math.floor(t / 0.6);
      if (step === last) return;
      last = step;
      for (let i = 0; i < points.length; i++) {
        const k = i % colors.length;
        const on = mode === 'chase' ? (i + step) % 3 !== 0 : ((i * 7 + step * 3) % 5) > 1;
        im.setColorAt(i, on ? c.set(colors[k]!) : dark[k]!);
      }
      im.instanceColor!.needsUpdate = true;
    };
    paint(0);
    this.tick(paint);
    this.put(im, parent);
  }

  /** Cordões pelas quatro paredes, logo abaixo do teto. */
  aroundWalls(draw: (pts: P3[], parent: THREE.Object3D) => void, y = 2.82, step = 0.22, depth = 0.22): void {
    const { width: W, depth: D } = this.L;
    const i = 0.06;
    draw(festoon([0.3, y, i], [W - 0.3, y, i], 2.6, depth, step), this.walls.back);
    draw(festoon([i, y, 0.3], [i, y, D - 0.3], 2.6, depth, step), this.walls.left);
    draw(festoon([W - i, y, 0.3], [W - i, y, D - 0.3], 2.6, depth, step), this.walls.right);
    draw(festoon([0.3, y, D - i], [W - 0.3, y, D - i], 2.6, depth, step), this.walls.front);
  }

  /** Cordões cruzando o teto (estilo arraial). */
  acrossCeiling(draw: (pts: P3[]) => void, y = 2.9): void {
    const { width: W, depth: D } = this.L;
    for (let z = 1.5; z < D - 0.5; z += 3) draw(festoon([0.1, y, z], [W - 0.1, y, z], W / 3, 0.35, 0.24));
    for (let x = 2; x < W - 1; x += 4) draw(festoon([x, y, 0.1], [x + 2, y, D - 0.1], D / 2, 0.4, 0.24));
  }

  /** Cacho de balões com fitas, balançando devagar. */
  balloons(x: number, z: number, colors: readonly string[], n = 7): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const b = new PolyBuilder(1);
    const strings: P3[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i, r = 0.12 + (i % 3) * 0.08;
      const p: P3 = [Math.cos(a) * r, 1.55 + ((i * 37) % 7) * 0.08, Math.sin(a) * r];
      b.ball(0.16, colors[i % colors.length]!, p, 1, { scale: [1, 1.22, 1] });
      b.add(new THREE.ConeGeometry(0.03, 0.05, 5), colors[i % colors.length]!, [p[0], p[1] - 0.21, p[2]], { rot: [Math.PI, 0, 0] });
      strings.push([p[0], p[1] - 0.23, p[2]], [0, 0.12, 0]);
    }
    b.cyl(0.07, 0.09, 0.12, '#9ca3af', [0, 0.06, 0], 6); // peso
    g.add(this.mesh(b, true));
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(strings.map((p) => new THREE.Vector3(...p))), cordMaterial));
    const seed = x * 3 + z;
    this.tick((t) => { g.rotation.y = Math.sin(t * 0.4 + seed) * 0.25; g.rotation.z = Math.sin(t * 0.7 + seed) * 0.02; });
    this.put(g);
  }

  /** Confete espalhado pelo chão da copa. */
  confetti(colors: readonly string[], n = 420): void {
    const { width: W, lounge } = this.L;
    const pos: number[] = [], col: number[] = [];
    const c = new THREE.Color();
    let s = 7;
    const rnd = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const x = 0.4 + rnd() * (W - 0.8), z = 0.5 + rnd() * (lounge - 0.6), a = rnd() * Math.PI, r = 0.025;
      c.set(colors[i % colors.length]!);
      const p = (k: number): P3 => [x + Math.cos(a + k) * r, 0.006, z + Math.sin(a + k) * r];
      for (const v of [p(0), p(2.1), p(4.2)]) { pos.push(...v); col.push(c.r, c.g, c.b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, decorMaterial);
    m.receiveShadow = true;
    this.put(m);
  }

  /** Objeto plano encostado numa parede (recebe x/z/rotY do mesmo jeito que os pôsteres). */
  onWall(obj: THREE.Object3D, wall: keyof Walls, along: number, y: number): void {
    const { width: W, depth: D } = this.L;
    const at = {
      back: [along, 0.03, 0], front: [along, D - 0.03, Math.PI],
      left: [0.03, along, Math.PI / 2], right: [W - 0.03, along, -Math.PI / 2],
    }[wall] as P3;
    obj.position.set(at[0], y, at[1]);
    obj.rotation.y = at[2];
    this.put(obj, this.walls[wall]);
  }

  build(h: Holiday): Decor {
    const ticks = this.ticks, disposers = this.dispose, attached = this.attached, group = this.group;
    return {
      holiday: h,
      root: group,
      update: (t) => { for (const f of ticks) f(t); },
      dispose: () => {
        group.removeFromParent();
        for (const o of attached) o.removeFromParent();
        for (const d of disposers) d();
      },
    };
  }
}

/* ───────── Peças ───────── */

function christmasTree(): THREE.Mesh {
  const b = new PolyBuilder(1);
  b.cyl(0.07, 0.09, 0.3, '#6b4423', [0, 0.15, 0], 6);
  b.cyl(0.28, 0.24, 0.12, '#b91c1c', [0, 0.06, 0], 8); // vaso
  const tiers: Array<[number, number, number]> = [[0.62, 0.7, 0.62], [0.5, 0.6, 1.0], [0.36, 0.5, 1.34], [0.22, 0.42, 1.62]];
  tiers.forEach(([r, h, y], i) => b.add(new THREE.ConeGeometry(r, h, 7), i % 2 ? '#15803d' : '#166534', [0, y, 0], { rot: [0, i * 0.4, 0] }));
  const balls = ['#dc2626', '#facc15', '#2563eb', '#f8fafc', '#db2777'];
  for (let i = 0; i < 22; i++) {
    const y = 0.45 + (i / 22) * 1.3, r = 0.6 * (1 - (y - 0.35) / 1.6) + 0.02, a = i * 2.4;
    b.ball(0.035, balls[i % balls.length]!, [Math.cos(a) * r, y, Math.sin(a) * r], 0);
  }
  b.add(new THREE.OctahedronGeometry(0.11, 0), '#fde047', [0, 1.92, 0], { scale: [1, 1.3, 0.5] });
  const gifts: Array<[number, number, number, string, string]> = [
    [0.42, 0.2, 0.18, '#dc2626', '#facc15'], [-0.4, 0.28, 0.16, '#2563eb', '#f8fafc'], [0.05, -0.48, 0.2, '#16a34a', '#dc2626'],
  ];
  for (const [x, z, s, k, ribbon] of gifts) {
    b.box(s, s * 0.8, s, k, [x, s * 0.4, z], { rot: [0, x * 2, 0] });
    b.box(s * 1.02, s * 0.82, s * 0.18, ribbon, [x, s * 0.4, z], { rot: [0, x * 2, 0] });
    b.box(s * 0.18, s * 0.82, s * 1.02, ribbon, [x, s * 0.4, z], { rot: [0, x * 2, 0] });
  }
  return b.mesh(decorMaterial, true);
}

function wreath(): THREE.Mesh {
  const b = new PolyBuilder(1);
  b.add(new THREE.TorusGeometry(0.2, 0.07, 5, 10), '#166534', [0, 0, 0]);
  for (let i = 0; i < 6; i++) b.ball(0.025, '#dc2626', [Math.cos(i) * 0.2, Math.sin(i) * 0.2, 0.06], 0);
  b.box(0.14, 0.07, 0.03, '#dc2626', [0, -0.21, 0.07]);
  return b.mesh(decorMaterial);
}

function pumpkin(scale: number, face: boolean): THREE.Mesh {
  const b = new PolyBuilder(1);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.ball(0.13, i % 2 ? '#ea580c' : '#f97316', [Math.cos(a) * 0.05, 0.11, Math.sin(a) * 0.05], 1, { scale: [0.8, 0.85, 0.8] });
  }
  b.cyl(0.015, 0.025, 0.08, '#3f6212', [0, 0.25, 0], 5, { rot: [0.2, 0, 0.15] });
  if (face) {
    b.add(new THREE.ConeGeometry(0.025, 0.035, 3), '#fde047', [-0.045, 0.14, 0.135], { rot: [Math.PI / 2, 0, 0] });
    b.add(new THREE.ConeGeometry(0.025, 0.035, 3), '#fde047', [0.045, 0.14, 0.135], { rot: [Math.PI / 2, 0, 0] });
    b.box(0.1, 0.022, 0.01, '#fde047', [0, 0.08, 0.142]);
  }
  const m = b.mesh(decorMaterial, true);
  m.scale.setScalar(scale);
  return m;
}

function bat(): THREE.Mesh {
  const b = new PolyBuilder(1);
  b.ball(0.035, '#18181b', [0, 0, 0], 0, { scale: [1, 1.2, 0.6] });
  b.sym(() => new THREE.ConeGeometry(0.06, 0.16, 3), '#27272a', [0.09, 0.01, 0], { rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.2] });
  return b.mesh(decorMaterial);
}

function heart(color: string, s = 1): THREE.Mesh {
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.1);
  sh.bezierCurveTo(-0.16, 0.0, -0.1, 0.13, 0, 0.05);
  sh.bezierCurveTo(0.1, 0.13, 0.16, 0.0, 0, -0.1);
  const b = new PolyBuilder(1);
  b.add(new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false, curveSegments: 3 }), color, [0, 0, 0], { scale: s });
  return b.mesh(decorMaterial);
}

function egg(color: string, stripe: string): PolyBuilder {
  const b = new PolyBuilder(1);
  b.ball(0.06, color, [0, 0.07, 0], 1, { scale: [0.8, 1.15, 0.8] });
  b.cyl(0.05, 0.05, 0.02, stripe, [0, 0.075, 0], 7);
  return b;
}

function campfire(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const b = new PolyBuilder(1);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.cyl(0.04, 0.05, 0.55, '#7c4a24', [Math.cos(a) * 0.08, 0.2, Math.sin(a) * 0.08], 5, { rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] });
  }
  for (let i = 0; i < 9; i++) b.ball(0.07, '#78716c', [Math.cos(i * 0.7) * 0.32, 0.04, Math.sin(i * 0.7) * 0.32], 0);
  g.add(kit.mesh(b, true));
  const flame = new PolyBuilder(1)
    .add(new THREE.ConeGeometry(0.16, 0.42, 5), '#f97316', [0, 0.32, 0])
    .add(new THREE.ConeGeometry(0.09, 0.3, 5), '#fde047', [0.02, 0.3, 0.02], { rot: [0, 0.6, 0] })
    .mesh(new THREE.MeshBasicMaterial({ vertexColors: true }), false);
  g.add(flame);
  kit.tick((t) => {
    flame.scale.set(1 + Math.sin(t * 11) * 0.06, 1 + Math.sin(t * 7.3) * 0.12, 1 + Math.cos(t * 9) * 0.06);
    flame.rotation.y = t * 0.8;
  });
  return g;
}

function mask(color: string, trim: string): THREE.Mesh {
  const b = new PolyBuilder(1);
  b.ball(0.12, color, [0, 0, 0], 1, { scale: [1.3, 0.6, 0.2] });
  b.sym(() => new THREE.CircleGeometry(0.035, 6), '#111827', [0.06, 0.005, 0.03]);
  b.add(new THREE.ConeGeometry(0.03, 0.22, 4), trim, [0.14, 0.12, 0], { rot: [0, 0, -0.5] });
  b.add(new THREE.ConeGeometry(0.03, 0.2, 4), shadeHex(trim), [0.1, 0.13, 0], { rot: [0, 0, -0.2] });
  return b.mesh(decorMaterial);
}

function shadeHex(k: string): string {
  return '#' + new THREE.Color(k).offsetHSL(0.08, 0, 0.05).getHexString();
}

function brazilFlag(): THREE.Mesh {
  const cv = document.createElement('canvas');
  cv.width = 280;
  cv.height = 196;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#009c3b';
  c.fillRect(0, 0, 280, 196);
  c.fillStyle = '#ffdf00';
  c.beginPath(); c.moveTo(140, 17); c.lineTo(263, 98); c.lineTo(140, 179); c.lineTo(17, 98); c.closePath(); c.fill();
  c.fillStyle = '#002776';
  c.beginPath(); c.arc(140, 98, 49, 0, Math.PI * 2); c.fill();
  c.save();
  c.beginPath(); c.arc(140, 98, 49, 0, Math.PI * 2); c.clip();
  c.strokeStyle = '#ffffff'; c.lineWidth = 8;
  c.beginPath(); c.arc(124, 180, 100, -Math.PI * 0.62, -Math.PI * 0.2); c.stroke();
  c.fillStyle = '#ffffff';
  for (let i = 0; i < 18; i++) c.fillRect(105 + ((i * 41) % 70), 100 + ((i * 23) % 40), 2, 2);
  c.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.77), new THREE.MeshLambertMaterial({ map: tex }));
}

/* ───────── Temas ───────── */

/** Lugar livre na copa (canto entre a estante e a janela) para a peça principal do tema. */
const CENTER = { x: 1.3, z: 4.1 };

export function buildDecor(h: Holiday, L: OfficeLayout, walls: Walls): Decor {
  const kit = new Kit(L, walls);
  const { width: W, depth: D } = L;
  L.nav.blockRect(CENTER.x, CENTER.z, 0.55, 0.55);
  const at = (o: THREE.Object3D, x: number, z: number): THREE.Object3D => { o.position.set(x, 0, z); return kit.put(o); };
  const doorZ = D - 2.2;

  switch (h) {
    case 'natal': {
      at(christmasTree(), CENTER.x, CENTER.z);
      kit.aroundWalls((p, w) => kit.lights(p, ['#ef4444', '#22c55e', '#facc15', '#3b82f6'], w));
      const wr = wreath();
      wr.position.set(W - 0.07, 1.62, doorZ);
      wr.rotation.y = -Math.PI / 2;
      kit.put(wr, walls.right);
      break;
    }
    case 'anonovo': {
      const gold = ['#facc15', '#e5e7eb', '#fbbf24', '#f8fafc', '#d4a017'];
      kit.balloons(CENTER.x, CENTER.z, gold, 9);
      kit.balloons(W - 1.2, 4.6, gold, 6);
      kit.aroundWalls((p, w) => kit.bunting(p, ['#facc15', '#f8fafc', '#cbd5e1'], 'tri', w), 2.85);
      kit.aroundWalls((p, w) => kit.lights(p, ['#fde68a', '#fff7ed'], w, 'twinkle'), 2.55, 0.3, 0.12);
      kit.confetti(['#facc15', '#f8fafc', '#fbbf24', '#cbd5e1']);
      break;
    }
    case 'carnaval': {
      const fest = ['#ec4899', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#f97316'];
      kit.acrossCeiling((p) => kit.bunting(p, fest, 'tri'));
      kit.balloons(CENTER.x, CENTER.z, fest, 8);
      kit.confetti(fest, 600);
      const m1 = mask('#a855f7', '#facc15'), m2 = mask('#ec4899', '#22c55e'), m3 = mask('#facc15', '#3b82f6');
      kit.onWall(m1, 'back', W * 0.48, 2.35);
      kit.onWall(m2, 'left', 4.0, 2.2);
      kit.onWall(m3, 'right', 5.0, 2.2);
      break;
    }
    case 'pascoa': {
      const pastel = ['#f9a8d4', '#a5f3fc', '#fde68a', '#bbf7d0', '#c4b5fd'];
      kit.aroundWalls((p, w) => kit.bunting(p, pastel, 'tri', w), 2.85);
      const basket = new PolyBuilder(1).cyl(0.26, 0.2, 0.16, '#a16207', [0, 0.08, 0], 8)
        .add(new THREE.TorusGeometry(0.2, 0.015, 4, 10, Math.PI), '#854d0e', [0, 0.16, 0]);
      const g = new THREE.Group();
      g.add(kit.mesh(basket, true));
      for (let i = 0; i < 6; i++) {
        const e = kit.mesh(egg(pastel[i % 5]!, pastel[(i + 2) % 5]!), true);
        e.position.set(Math.cos(i) * 0.12, 0.1, Math.sin(i) * 0.12);
        e.rotation.z = Math.sin(i * 3) * 0.4;
        g.add(e);
      }
      at(g, CENTER.x, CENTER.z);
      // ovos escondidos pelo escritório
      for (const [x, z] of [[0.7, D - 0.6], [W - 0.8, 0.8], [W - 0.6, D - 0.8], [W * 0.5, D - 0.4], [0.5, LOUNGE_EDGE(L) + 0.3]] as const) {
        at(kit.mesh(egg(pastel[(x * 7) % 5 | 0]!, '#ffffff'), true), x, z);
      }
      break;
    }
    case 'namorados': {
      kit.aroundWalls((p, w) => kit.bunting(p, ['#f43f5e', '#fda4af', '#ffffff'], 'tri', w), 2.85);
      kit.balloons(CENTER.x, CENTER.z, ['#e11d48', '#f43f5e', '#fb7185'], 7);
      for (let i = 0; i < 7; i++) kit.onWall(heart(i % 2 ? '#e11d48' : '#fb7185', 1 + (i % 3) * 0.4), 'back', 0.8 + i * ((W - 1.6) / 6), 2.45 - (i % 2) * 0.12);
      for (let i = 0; i < 4; i++) kit.onWall(heart('#f43f5e', 1.3), 'left', 2 + i * ((D - 3) / 3), 2.5);
      break;
    }
    case 'junina': {
      const flags = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#f97316', '#ec4899'];
      kit.acrossCeiling((p) => kit.bunting(p, flags, 'rect'));
      at(campfire(kit), CENTER.x, CENTER.z);
      kit.aroundWalls((p, w) => kit.lights(p, ['#fde68a', '#fb923c'], w, 'twinkle'), 2.6, 0.3, 0.14);
      break;
    }
    case 'independencia': {
      kit.aroundWalls((p, w) => kit.bunting(p, ['#009c3b', '#ffdf00', '#002776', '#ffffff'], 'rect', w), 2.85);
      kit.onWall(brazilFlag(), 'left', LOUNGE_EDGE(L) - 1.2, 1.9);
      kit.balloons(CENTER.x, CENTER.z, ['#009c3b', '#ffdf00', '#002776'], 7);
      break;
    }
    case 'halloween': {
      kit.aroundWalls((p, w) => kit.bunting(p, ['#f97316', '#18181b', '#7c3aed'], 'tri', w), 2.85);
      const pile = new THREE.Group();
      for (const [x, z, s] of [[0, 0, 1.5], [0.28, 0.18, 1], [-0.24, 0.22, 0.8], [0.1, -0.28, 0.9]] as const) {
        const p = pumpkin(s, s > 0.95);
        p.position.set(x, 0, z);
        p.rotation.y = x * 3;
        pile.add(p);
      }
      at(pile, CENTER.x, CENTER.z);
      for (const [x, z] of [[W - 1.1, 0.7], [0.9, D - 0.5], [W - 0.7, D - 0.6]] as const) at(pumpkin(1.1, true), x, z);
      for (let i = 0; i < 9; i++) {
        const bt = bat();
        kit.onWall(bt, i % 3 === 0 ? 'left' : 'back', i % 3 === 0 ? 1.5 + i * 0.8 : 1 + i * (W / 9), 2.3 + ((i * 37) % 5) * 0.08);
        bt.rotation.z = ((i * 13) % 7 - 3) * 0.08;
        const base = bt.position.y;
        kit.tick((t) => { bt.position.y = base + Math.sin(t * 1.5 + i) * 0.03; });
      }
      break;
    }
  }
  return kit.build(h);
}

function LOUNGE_EDGE(L: OfficeLayout): number {
  return L.lounge;
}
