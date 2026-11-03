/**
 * Layout automático do escritório aberto:
 *  - fundo (z pequeno): copa/área comum (sofá + TV, café, painel de gráficos, estante,
 *    quadro branco, impressora, bebedouro);
 *  - frente: baias individuais em grade (uma por container), ordenadas por nome;
 *  - parede esquerda com janelas, porta na parede direita.
 * Nada é posicionado à mão por container: tudo sai da contagem.
 */
import { NavGrid, type P2 } from '../sim/nav.js';

export type SpotKind =
  | 'coffee' | 'window' | 'cooler' | 'sofa' | 'tv' | 'dashboard' | 'door' | 'shelf' | 'whiteboard' | 'printer';

export interface Spot extends P2 {
  kind: SpotKind;
  /** Rotação Y para onde o personagem olha (0 = +Z). */
  face: number;
  sit?: boolean;
  takenBy?: string;
}

export interface DeskSlot {
  /** Centro da mesa. */
  x: number;
  z: number;
  /** Assento (personagem olha para +Z). */
  seat: P2;
}

export type FixtureKind =
  | 'sofa' | 'tv' | 'coffee' | 'cooler' | 'dashboard' | 'shelf' | 'plant' | 'window' | 'door'
  | 'whiteboard' | 'printer' | 'clock' | 'poster';

export interface Fixture {
  kind: FixtureKind;
  x: number;
  z: number;
  rotY: number;
  /** Pôster: qual arte (índice em POSTERS) e em qual parede está. */
  variant?: number;
  wall?: 'back' | 'left' | 'right' | 'front';
}

export interface OfficeLayout {
  width: number;
  depth: number;
  wallHeight: number;
  /** Profundidade da copa (piso de madeira). */
  lounge: number;
  desks: Map<string, DeskSlot>;
  spots: Spot[];
  fixtures: Fixture[];
  nav: NavGrid;
}

export const CUBE = { dx: 2.6, dz: 3.2, back: -1.35, side: -1.09 } as const;
const LOUNGE = 5.4;

export function computeLayout(ids: readonly string[]): OfficeLayout {
  const n = Math.max(1, ids.length);
  const cols = Math.min(7, Math.max(2, Math.ceil(Math.sqrt(n * 1.4))));
  const rows = Math.ceil(n / cols);
  const gridW = cols * CUBE.dx;
  const width = Math.max(18, gridW + 4.2);
  const x0 = (width - gridW) / 2 - 0.4;
  const z0 = LOUNGE + 1.0;
  const depth = z0 + rows * CUBE.dz + 1.6;

  const desks = new Map<string, DeskSlot>();
  ids.forEach((id, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = x0 + CUBE.dx * (c + 0.5);
    const z = z0 + -CUBE.back + 0.1 + CUBE.dz * r;
    desks.set(id, { x, z, seat: { x, z: z - 0.75 } });
  });

  const fixtures: Fixture[] = [];
  const spots: Spot[] = [];
  const add = (kind: FixtureKind, x: number, z: number, rotY = 0): void => { fixtures.push({ kind, x, z, rotY }); };
  const spot = (kind: SpotKind, x: number, z: number, face: number, sit = false): void => { spots.push({ kind, x, z, face, sit }); };

  // Parede do fundo, da esquerda para a direita
  add('shelf', 1.2, 0.2);
  spot('shelf', 1.2, 1.0, Math.PI);
  add('whiteboard', 3.4, 0.05);
  spot('whiteboard', 3.1, 1.1, Math.PI); spot('whiteboard', 3.9, 1.1, Math.PI);
  const tvX = width * 0.36;
  add('tv', tvX, 0.35);
  add('sofa', tvX, 3.4, Math.PI);
  spot('sofa', tvX - 0.42, 3.35, Math.PI, true); spot('sofa', tvX + 0.42, 3.35, Math.PI, true);
  spot('tv', tvX - 1.7, 2.7, Math.PI); spot('tv', tvX + 1.7, 2.7, Math.PI);
  add('clock', 3.4, 0.02);
  const dashX = width * 0.6;
  add('dashboard', dashX, 0.1);
  spot('dashboard', dashX - 0.6, 1.5, Math.PI); spot('dashboard', dashX + 0.6, 1.6, Math.PI);
  add('printer', width * 0.74, 0.5);
  spot('printer', width * 0.74, 1.3, Math.PI);
  const coffeeX = width - 2.3;
  add('coffee', coffeeX, 0.35);
  spot('coffee', coffeeX - 0.6, 1.35, Math.PI); spot('coffee', coffeeX + 0.6, 1.35, Math.PI);
  add('cooler', width - 0.35, 3.8, -Math.PI / 2);
  spot('cooler', width - 1.05, 3.8, Math.PI / 2);

  add('plant', 0.45, depth - 0.45); add('plant', width - 0.45, 0.45); add('plant', tvX + 2.7, 0.4);
  add('plant', 0.45, LOUNGE + 0.3);

  for (let z = 2.4; z < depth - 1; z += 3.4) {
    add('window', 0, z, Math.PI / 2);
    spot('window', 0.75, z, -Math.PI / 2);
  }
  const doorZ = depth - 2.2;
  add('door', width, doorZ, -Math.PI / 2);
  spot('door', width - 0.9, doorZ, Math.PI / 2); spot('door', width - 0.9, doorZ - 1.6, Math.PI / 2);

  // Pôsteres de papel nos vãos livres das paredes (altura dos olhos, acima dos móveis baixos)
  let poster = 0;
  const addPoster = (wall: 'back' | 'left' | 'right' | 'front', x: number, z: number): void => {
    const rotY = { back: 0, left: Math.PI / 2, right: -Math.PI / 2, front: Math.PI }[wall];
    fixtures.push({ kind: 'poster', x, z, rotY, variant: poster++, wall });
  };
  // fundo: evita estante, quadro, TV, painel e bancada do café (meia-largura + folga)
  const busy: Array<[number, number]> = [
    [1.2, 0.7], [3.4, 1.0], [tvX, 1.4], [dashX, 1.15], [coffeeX, 1.35],
  ];
  for (let x = 0.7; x < width - 0.7; x += 0.1) {
    if (busy.some(([c, h]) => Math.abs(x - c) < h + 0.3)) continue;
    addPoster('back', x, 0.01);
    busy.push([x, 1.0]); // próximo pôster a pelo menos ~1,3 m
  }
  // esquerda: entre as janelas
  for (let z = 2.4 + 1.7; z < depth - 1.2; z += 3.4) addPoster('left', 0.01, z);
  // direita: ao longo da parede, longe da porta
  for (let z = 1.8; z < doorZ - 1.4; z += 4.0) addPoster('right', width - 0.01, z);
  // frente: espaçados
  for (let x = 3; x < width - 2; x += 6) addPoster('front', x, depth - 0.01);

  // Navegação
  const nav = new NavGrid(width, depth);
  nav.blockRect(width / 2, 0.05, width, 0.3);
  nav.blockRect(width / 2, depth, width, 0.3);
  nav.blockRect(0, depth / 2, 0.3, depth);
  nav.blockRect(width, depth / 2, 0.3, depth);
  for (const d of desks.values()) {
    nav.blockRect(d.x, d.z, 0.85, 0.42); // mesa
    nav.blockRect(d.x, d.z + CUBE.back, 1.12, 0.08); // divisória de trás
    nav.blockRect(d.x + CUBE.side, d.z - 0.45, 0.08, 0.92); // divisória lateral (esquerda)
  }
  const size: Partial<Record<FixtureKind, [number, number]>> = {
    sofa: [0.95, 0.4], tv: [1.15, 0.5], coffee: [1.3, 0.45], cooler: [0.25, 0.25], dashboard: [0.9, 0.15],
    shelf: [0.65, 0.25], plant: [0.3, 0.3], whiteboard: [0.9, 0.12], printer: [0.45, 0.35],
  };
  for (const f of fixtures) {
    const s = size[f.kind];
    if (s) nav.blockRect(f.x, f.z, s[0], s[1]);
  }

  return { width, depth, wallHeight: 3, lounge: LOUNGE, desks, spots, fixtures, nav };
}
