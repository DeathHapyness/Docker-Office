/**
 * Personagem voxel articulado, montado a partir do perfil (dados).
 * Coordenadas em voxels; origem nos pés, olhando para +Z.
 *
 *   root ─ body(hips) ─┬ torso (+ roupa/acessórios, capa)
 *                      ├ head ─ rosto (variações de olhos/boca), cabelo, chapéu, óculos
 *                      ├ armL / armR (pivô no ombro) ─ hand (ponto para segurar objetos)
 *                      └ legL / legR (pivô no quadril)
 */
import * as THREE from 'three';
import { U, VoxelBuilder, voxelMaterial } from '../three/voxel.js';
import { shade } from '../pixel/color.js';
import type { CharacterProfile, FacialKind, Gear } from './types.js';

const SKIN: Record<CharacterProfile['skin'], string> = {
  light: '#f8dcc8',
  fair: '#f1c48f',
  tan: '#d9a066',
  brown: '#a86b3c',
  dark: '#6e4529',
};
const INK = '#231a18';

const BUILD = {
  normal: { tw: 6, td: 3, aw: 2 },
  slim: { tw: 5, td: 3, aw: 2 },
  muscle: { tw: 8, td: 4, aw: 3 },
} as const;

export type Face = 'open' | 'closed' | 'shock';

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  cape?: THREE.Group;
  handR: THREE.Group;
  /** Caixa invisível usada para hover/clique. */
  hit: THREE.Mesh;
  setFace(f: Face): void;
  /** Altura do ombro (mundo), usada para posicionar balões. */
  height: number;
}

export function buildRig(p: CharacterProfile): Rig {
  const skin = SKIN[p.skin];
  const skinSh = shade(skin, -0.15);
  const top = p.top.style === 'labcoat' ? '#eef1f5' : p.top.color;
  const topSh = shade(top, -0.22);
  const pants = p.pants ?? '#2f3542';
  const { tw, td, aw } = BUILD[p.build];
  const hair = p.hair.color;
  const front = td / 2;

  const root = new THREE.Group();
  root.name = p.id;
  const body = new THREE.Group();
  root.add(body);

  /* Pernas */
  const legW = Math.min(3.5, tw / 2);
  const mkLeg = (side: -1 | 1): THREE.Group => {
    const g = new THREE.Group();
    g.position.set((side * legW * U) / 2, 8 * U, 0);
    const b = new VoxelBuilder()
      .box(-legW / 2, -7, -1.5, legW, 7, 3, pants)
      .box(-legW / 2, -8, -1.5, legW, 1, 3.8, '#1f2023');
    if (p.top.style === 'labcoat') b.box(-legW / 2 - 0.1, -3.5, -1.6, legW + 0.2, 3.5, 3.2, '#e3e7ee');
    g.add(b.mesh());
    body.add(g);
    return g;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  /* Tronco */
  const t = new VoxelBuilder()
    .box(-tw / 2, 8, -td / 2, tw, 7, td, top)
    .box(-tw / 2, 8, -td / 2, tw, 1, td, pants)
    .box(-1, 15, -1, 2, 1, 2, skinSh)
    .box(-0.6, 14.2, front - 0.05, 1.2, 0.8, 0.15, skin);
  if (p.build === 'muscle') t.sym(0.3, 11.5, front - 0.05, 3, 0.4, 0.2, topSh);
  switch (p.top.style) {
    case 'hoodie':
      t.box(-2.5, 14, -td / 2 - 1, 5, 2, 1.5, topSh)
        .sym(0.6, 11.8, front - 0.05, 0.35, 2.2, 0.25, '#f1f1f1')
        .box(-2, 8.6, front - 0.05, 4, 2, 0.3, topSh);
      break;
    case 'labcoat':
      t.box(-1, 8.5, front - 0.05, 2, 6.5, 0.25, p.top.color2 ?? p.top.color)
        .sym(1, 11, front - 0.08, 0.3, 4, 0.3, '#c9d1dc');
      break;
    case 'suit':
      t.box(-1, 10, front - 0.05, 2, 5, 0.25, '#f5f5f5').sym(1, 10, front - 0.08, 0.3, 5, 0.3, topSh);
      break;
    case 'tee':
      break;
  }
  let cape: THREE.Group | undefined;
  for (const g of p.body ?? []) {
    const k = g.color;
    const k2 = g.color2 ?? '#ffffff';
    switch (g.kind) {
      case 'cape': {
        cape = new THREE.Group();
        cape.position.set(0, 15 * U, (-td / 2 - 0.3) * U);
        cape.add(
          new VoxelBuilder()
            .box(-(tw / 2 + 0.6), -11, -0.5, tw + 1.2, 11, 0.5, k)
            .box(-(tw / 2 + 0.6), -11, -0.55, tw + 1.2, 0.6, 0.6, shade(k, -0.3))
            .mesh(),
        );
        t.sym(tw / 2 - 1.5, 14.2, -td / 2 - 0.2, 1.5, 1, td + 0.4, shade(k, 0.15));
        body.add(cape);
        break;
      }
      case 'shield':
        t.box(-1.5, 10.6, front - 0.05, 3, 3, 0.3, k).box(-1, 9.9, front - 0.05, 2, 0.8, 0.3, k)
          .box(-0.5, 11.2, front + 0.05, 1, 1.6, 0.3, k2).box(-0.9, 12, front + 0.05, 1.8, 0.5, 0.3, k2);
        break;
      case 'tie':
        t.box(-0.5, 9.5, front - 0.05, 1, 5, 0.3, k).box(-0.6, 14, front - 0.05, 1.2, 0.8, 0.35, shade(k, -0.2));
        break;
      case 'badge':
        t.sym(1.2, 11, front - 0.05, 0.3, 4, 0.2, k).box(-1, 9.4, front - 0.05, 2, 2.4, 0.3, '#f5f5f5')
          .box(-0.6, 10.6, front + 0.05, 1.2, 0.5, 0.3, k);
        break;
      case 'scarf':
        t.box(-tw / 2 - 0.2, 14, -td / 2 - 0.2, tw + 0.4, 1.4, td + 0.4, k)
          .box(0.8, 9, front + 0.1, 1.2, 5, 0.4, k)
          .box(0.8, 10, front + 0.15, 1.2, 0.6, 0.4, k2).box(0.8, 12, front + 0.15, 1.2, 0.6, 0.4, k2)
          .box(-tw / 2 - 0.25, 14.4, -td / 2 - 0.25, 1.2, 0.6, td + 0.5, k2);
        break;
      case 'apron':
        t.box(-tw / 2 + 0.5, 8, front - 0.05, tw - 1, 6, 0.3, k).sym(1.5, 14, front - 0.05, 0.4, 1, 0.3, k);
        break;
      case 'camera':
        t.sym(1.4, 11, front - 0.05, 0.3, 4, 0.2, '#2d2f36').box(-1.3, 10, front + 0.1, 2.6, 1.8, 1, '#2d2f36')
          .box(-0.5, 10.4, front + 1.1, 1, 1, 0.6, '#7fb3d5');
        break;
      case 'stethoscope':
        t.sym(1.3, 11, front - 0.05, 0.3, 4, 0.3, k).box(-0.6, 10, front, 1.2, 1.2, 0.4, '#c0c6d0');
        break;
      case 'vest':
        t.box(-tw / 2 - 0.08, 8.5, -td / 2 - 0.08, tw + 0.16, 6.3, td + 0.16, k)
          .box(-tw / 2 - 0.12, 11, -td / 2 - 0.12, tw + 0.24, 0.6, td + 0.24, k2);
        break;
    }
  }
  body.add(t.mesh());

  /* Braços */
  const sleeve = p.build === 'muscle' ? 2 : p.top.style === 'tee' ? 3 : 6;
  const mkArm = (side: -1 | 1): { arm: THREE.Group; hand: THREE.Group } => {
    const g = new THREE.Group();
    g.position.set(side * (tw / 2 + aw / 2) * U, 15 * U, 0);
    const b = new VoxelBuilder()
      .box(-aw / 2, -7, -1, aw, 7 - sleeve, 2, skin)
      .box(-aw / 2, -sleeve, -1, aw, sleeve, 2, top)
      .box(-aw / 2 - 0.05, -sleeve, -1.05, aw + 0.1, 0.4, 2.1, topSh);
    g.add(b.mesh());
    const hand = new THREE.Group();
    hand.position.set(0, -7 * U, 0);
    g.add(hand);
    body.add(g);
    return { arm: g, hand };
  };
  const armL = mkArm(-1).arm;
  const { arm: armR, hand: handR } = mkArm(1);

  /* Cabeça */
  const head = new THREE.Group();
  head.position.set(0, 16 * U, 0);
  body.add(head);
  const hasBeard = (p.facial ?? []).some((f) => f.kind === 'beard');
  const mouthZ = hasBeard ? 3.2 : 2.92;
  const h = new VoxelBuilder()
    .box(-3, 0, -3, 6, 6, 6, skin)
    .box(-3, 0, -3, 6, 0.6, 6, skinSh)
    .sym(3, 2, -0.5, 0.4, 1.3, 1, skinSh)
    .sym(1.8, 1.5, 2.95, 0.9, 0.5, 0.1, shade(skin, -0.1));
  if (p.face?.kind === 'mask') {
    h.box(-3.15, 2.1, -3.15, 6.3, 2, 6.3, p.face.color).sym(0.8, 2.3, 3.1, 1.6, 1.6, 0.1, '#ffffff');
  }
  for (const f of p.facial ?? []) facial(h, f, hair, skin);
  hairStyle(h, p.hair.style, hair, shade(hair, -0.25));
  if (p.face && p.face.kind !== 'mask') faceGear(h, p.face.kind, p.face.color);
  if (p.head) headGear(h, p.head);
  head.add(h.mesh());

  // Variações de rosto: malhas pequenas alternadas por visibilidade.
  const eyeZ = p.face?.kind === 'mask' ? 3.15 : 2.92;
  const faces: Record<Face, THREE.Mesh> = {
    open: new VoxelBuilder().sym(1, 2.5, eyeZ, 1, 1.3, 0.3, INK).sym(1, 3.3, eyeZ + 0.05, 0.4, 0.4, 0.3, '#ffffff')
      .box(-0.75, 1, mouthZ, 1.5, 0.4, 0.3, '#7a2e2e').mesh(voxelMaterial, false),
    closed: new VoxelBuilder().sym(1, 2.8, eyeZ, 1.2, 0.35, 0.3, INK)
      .box(-0.5, 1, mouthZ, 1, 0.3, 0.3, '#7a2e2e').mesh(voxelMaterial, false),
    shock: new VoxelBuilder().sym(0.8, 2.2, eyeZ, 1.6, 1.8, 0.3, '#ffffff').sym(1.3, 2.7, eyeZ + 0.1, 0.6, 0.7, 0.3, INK)
      .box(-0.6, 0.5, mouthZ, 1.2, 1.1, 0.3, '#4a1515').mesh(voxelMaterial, false),
  };
  for (const m of Object.values(faces)) head.add(m);
  const setFace = (f: Face): void => {
    for (const [k, m] of Object.entries(faces)) m.visible = k === f;
  };
  setFace('open');

  /* Hitbox */
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry((tw + 2 * aw + 1) * U, 24 * U, 6 * U),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.y = 12 * U;
  root.add(hit);

  return { root, body, head, armL, armR, legL, legR, cape, handR, hit, setFace, height: 24 * U };
}

/* ───────── Detalhes da cabeça ───────── */

function facial(b: VoxelBuilder, f: Gear<FacialKind>, hair: string, skin: string): void {
  const k = f.color || hair;
  switch (f.kind) {
    case 'mustache':
      b.box(-1.6, 1.45, 2.95, 3.2, 0.6, 0.35, k).sym(1.2, 1, 2.95, 0.4, 0.6, 0.35, k);
      break;
    case 'beard':
      b.box(-3.1, -0.4, 0.5, 6.2, 2, 2.7, k).sym(2.8, 0, -1.5, 0.35, 2.6, 4.5, k).box(-1.5, 1.4, 2.95, 3, 0.5, 0.3, k);
      break;
    case 'stubble':
      b.box(-2.6, 0, 2.95, 5.2, 1.2, 0.2, shade(skin, -0.22));
      break;
    case 'eyebags':
      b.sym(1, 2.05, 2.95, 1.1, 0.35, 0.25, k);
      break;
  }
}

function hairStyle(b: VoxelBuilder, style: CharacterProfile['hair']['style'], h: string, hs: string): void {
  const short = (): void => {
    b.box(-3.3, 5.5, -3.3, 6.6, 1.2, 6.6, h)
      .box(-3.3, 1.5, -3.35, 6.6, 4.2, 1, hs)
      .sym(2.8, 3.5, -3.3, 0.5, 2.2, 5, h)
      .box(-3.3, 4.8, 2.6, 4.2, 1, 0.8, h);
  };
  switch (style) {
    case 'short':
      short();
      break;
    case 'spiky':
      short();
      b.box(-2.6, 6.5, -1.2, 1.3, 1.5, 1.3, h).box(-0.65, 6.5, 0, 1.3, 2.1, 1.3, h)
        .box(1.3, 6.5, -1.2, 1.3, 1.6, 1.3, h).box(-0.65, 6.5, -2.4, 1.3, 1.4, 1.3, h)
        .box(-0.8, 5.6, 2.9, 2.6, 1.2, 0.8, h);
      break;
    case 'messy':
      b.box(-3.6, 5.2, -3.6, 7.2, 1.8, 7.2, h).box(-3.6, 1.2, -3.65, 7.2, 4.5, 1.2, hs)
        .sym(3, 2.5, -3.5, 0.7, 3.2, 5.5, h).box(-2.4, 6.8, -1.5, 1.2, 0.9, 1.2, h)
        .box(0.8, 6.9, 0.4, 1.4, 1, 1.4, h).box(-1, 6.9, 1.5, 1, 0.7, 1, h)
        .box(-3.3, 4.5, 2.7, 1.6, 1.2, 0.8, h).box(0.3, 4.4, 2.7, 1.8, 1.3, 0.8, h);
      break;
    case 'long':
      short();
      b.box(-3.3, -1.5, -3.4, 6.6, 7, 1.2, h).sym(2.8, -0.5, -3.3, 0.7, 5.5, 4, h);
      break;
    case 'bun':
      short();
      b.box(-1.1, 6.5, -2.6, 2.2, 1.7, 2.2, h);
      break;
    case 'curly':
      b.box(-3.8, 4.8, -3.8, 7.6, 2.4, 7.6, h).box(-3.8, 1, -3.85, 7.6, 4, 1.2, hs)
        .sym(3, 2.4, -3.8, 0.8, 2.6, 5.6, h);
      for (const x of [-2.8, -0.6, 1.6]) b.box(x, 4.4, 3.1, 1.2, 0.9, 0.7, h);
      for (const [x, z] of [[-2.5, -2], [0, 0.5], [1.8, -2.6], [-1.2, 2.2]] as const) b.box(x, 7.1, z, 1.3, 0.6, 1.3, h);
      break;
    case 'side':
      b.box(-3.3, 5.5, -3.3, 6.6, 1.1, 6.6, h).box(-3.3, 4.5, 2.6, 4.6, 1.2, 0.8, h)
        .box(-3.3, 3.6, 2.6, 1.5, 1, 0.8, h).box(-3.3, 1.5, -3.35, 6.6, 4.2, 1, hs)
        .sym(2.8, 3.4, -3.3, 0.5, 2.2, 5, h).box(1.3, 6.5, -3.3, 2, 0.4, 6.6, hs);
      break;
    case 'bald':
      b.sym(2.85, 2.5, -2.5, 0.45, 1.6, 4, h).box(-3, 2.5, -3.35, 6, 1.6, 0.4, h).box(-1.5, 6, -1, 2, 0.1, 2, '#ffffff');
      break;
    case 'ponytail':
      short();
      b.box(-0.8, 2.5, -4.6, 1.6, 2, 1.4, h).box(-0.6, -0.5, -4.8, 1.2, 3.2, 1.2, hs);
      break;
  }
}

function faceGear(b: VoxelBuilder, kind: 'glasses' | 'bigglasses' | 'sunglasses', k: string): void {
  switch (kind) {
    case 'glasses':
      b.sym(0.4, 3.9, 3, 2.2, 0.3, 0.3, k).sym(0.4, 2.1, 3, 2.2, 0.3, 0.3, k)
        .sym(0.4, 2.1, 3, 0.3, 2.1, 0.3, k).sym(2.3, 2.1, 3, 0.3, 2.1, 0.3, k)
        .box(-0.4, 3.3, 3, 0.8, 0.3, 0.3, k).sym(3.05, 3.3, -1, 0.3, 0.3, 4.2, k);
      break;
    case 'bigglasses':
      b.sym(0.3, 4.3, 3, 2.8, 0.45, 0.35, k).sym(0.3, 1.7, 3, 2.8, 0.45, 0.35, k)
        .sym(0.3, 1.7, 3, 0.45, 3, 0.35, k).sym(2.65, 1.7, 3, 0.45, 3, 0.35, k)
        .box(-0.3, 3.4, 3, 0.6, 0.35, 0.35, k).sym(3.05, 3.4, -1.2, 0.35, 0.35, 4.5, k);
      break;
    case 'sunglasses':
      b.box(-2.7, 2.3, 3, 5.4, 1.5, 0.35, '#15171c').sym(1.3, 3.1, 3.3, 0.8, 0.3, 0.1, '#5b6476')
        .sym(3.05, 3.1, -1, 0.3, 0.3, 4.2, '#15171c');
      break;
  }
}

function headGear(b: VoxelBuilder, g: Exclude<CharacterProfile['head'], undefined>): void {
  const k = g.color;
  const dk = shade(k, -0.3);
  switch (g.kind) {
    case 'beret':
      b.box(-3.2, 6, -3.6, 7.4, 1.1, 7.2, k).box(-2.8, 7.1, -3, 6.4, 0.4, 6, k)
        .box(-0.3, 7.5, -0.3, 0.6, 0.5, 0.6, dk).box(-3.25, 6, -3.65, 7.5, 0.3, 7.3, dk);
      break;
    case 'cap':
      b.box(-3.4, 5.6, -3.4, 6.8, 1.7, 6.8, k).box(-3, 5.6, 3.4, 6, 0.4, 2.6, dk)
        .box(-0.7, 6.1, 3.4, 1.4, 0.9, 0.1, g.color2 ?? '#ffffff').box(-0.3, 7.3, -0.3, 0.6, 0.3, 0.6, dk);
      break;
    case 'fedora':
      b.box(-4.6, 5.6, -4.6, 9.2, 0.4, 9.2, k).box(-3.2, 6, -3.2, 6.4, 2.4, 6.4, k)
        .box(-3.25, 6, -3.25, 6.5, 0.7, 6.5, g.color2 ?? dk).box(-1.5, 8.2, -3.2, 3, 0.3, 6.4, dk);
      break;
    case 'hardhat':
      b.box(-3.5, 5.5, -3.5, 7, 2, 7, k).box(-4.2, 5.5, -4.2, 8.4, 0.4, 8.4, k)
        .box(-0.5, 7.4, -3.5, 1, 0.3, 7, shade(k, 0.3));
      break;
    case 'headband':
      b.box(-3.4, 4.6, -3.4, 6.8, 0.8, 6.8, k).box(-0.6, 3.6, -4, 1.2, 1.4, 0.6, k);
      break;
    case 'headset':
      b.box(-3.5, 6.2, -0.4, 7, 0.5, 0.8, '#2d2f36').sym(3.2, 3, -0.4, 0.4, 3.4, 0.8, '#2d2f36')
        .sym(3.1, 2, -0.9, 0.8, 2, 1.8, k).box(-3.7, 1.2, 0.6, 0.4, 0.4, 2.4, '#2d2f36')
        .box(-3.5, 1.1, 2.8, 0.7, 0.6, 0.6, '#2d2f36');
      break;
    case 'headphones':
      b.box(-3.7, 6.3, -0.5, 7.4, 0.6, 1, '#23252b').sym(3.3, 3.6, -0.5, 0.4, 2.8, 1, '#23252b')
        .sym(3, 1.8, -1.2, 1.2, 2.8, 2.4, k);
      break;
    case 'laurel':
      for (let i = 0; i < 6; i++) b.sym(3 - i * 0.4, 5 + i * 0.25, 2.4 - i * 1, 0.6, 0.5, 0.8, k);
      break;
  }
}
