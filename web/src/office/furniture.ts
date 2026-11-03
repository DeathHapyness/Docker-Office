/** Móveis em voxel. Todos com origem no centro da base, frente voltada para +Z. */
import * as THREE from 'three';
import { U, VoxelBuilder, voxels } from '../three/voxel.js';
import { shade } from '../pixel/color.js';
import type { CharacterProfile, DeskStyle } from '../characters/types.js';
import { decorMesh, propMesh } from './props3d.js';
import { CUBE } from './layout.js';
import { MonitorScreen } from '../screens/monitor.js';

const DESK_COLORS: Record<DeskStyle, { top: string; body: string }> = {
  wood: { top: '#c8925a', body: '#8a5a32' },
  dark: { top: '#5a463b', body: '#2f2520' },
  white: { top: '#ecebe6', body: '#b9bcc4' },
  metal: { top: '#a3acba', body: '#5b6474' },
};

export const SEAT_Y = 7 * U; // altura do assento da cadeira
export const SOFA_SEAT_Y = 5 * U;

export interface Workstation {
  group: THREE.Group;
  screen: MonitorScreen;
  /** Faixa na parte de trás do monitor (visível pela câmera) com a cor do estado. */
  status: THREE.MeshBasicMaterial;
}

/**
 * Baia individual do serviço: divisórias (fundo + lateral esquerda) com faixa na cor do
 * personagem, mural, mesa no estilo do perfil, monitor com tela real, objeto e decorações.
 * O personagem senta do lado -Z, olhando para +Z; a lateral direita fica aberta (saída).
 */
export function buildWorkstation(p: CharacterProfile, seedName: string): Workstation {
  const g = new THREE.Group();
  const style = p.desk?.style ?? 'wood';
  const c = DESK_COLORS[style];
  const accent = p.accent;
  const fabric = '#8a93a3';

  // Divisórias + mural de cortiça (com "pôster" na cor do serviço)
  g.add(voxels((b) => {
    const back = CUBE.back / U, side = CUBE.side / U;
    b.box(side, 0, back - 0.4, -2 * side, 15, 0.8, fabric)
      .box(side, 15, back - 0.6, -2 * side, 0.7, 1.2, accent)
      .box(side - 0.4, 0, back - 0.4, 0.8, 15, 24, fabric)
      .box(side - 0.6, 15, back - 0.4, 1.2, 0.7, 24, accent)
      .box(side - 0.6, 0, back - 0.6, 1.2, 0.6, 24.4, '#4b5563')
      .box(side, 0, back - 0.6, -2 * side, 0.6, 1.2, '#4b5563')
      .box(-7, 7, back + 0.4, 14, 6.5, 0.3, '#c9a26b')
      .box(-6, 8, back + 0.7, 4, 4.5, 0.1, accent).box(-1, 9.5, back + 0.7, 3, 2.5, 0.1, '#fef08a')
      .box(3, 8.5, back + 0.7, 3, 3.5, 0.1, '#f5f5f5').box(3.5, 10.5, back + 0.8, 2, 0.3, 0.05, '#9ca3af')
      .box(-5.2, 9, back + 0.8, 2.4, 2.4, 0.05, shade(accent, 0.45));
  }));

  // Tapete da cadeira
  g.add(voxels((b) => b.box(-6, 0, -15, 12, 0.1, 10, '#c7ccd3'), false));

  // Mesa
  g.add(voxels((b) => {
    b.box(-10, 9.2, -5, 20, 0.8, 10, c.top).box(-10, 9.0, -5, 20, 0.3, 10, shade(c.top, -0.2))
      .sym(9, 0, -5, 1, 9.2, 10, c.body).box(-9, 3, 4, 18, 6, 0.8, c.body)
      .box(-9, 0, -4, 6, 9, 8, shade(c.body, 0.12)).box(-8.5, 5.5, -4.1, 5, 0.3, 0.1, c.top)
      .box(-6.5, 6.6, -4.2, 1, 0.4, 0.2, '#e0c08f').box(-6.5, 3, -4.2, 1, 0.4, 0.2, '#e0c08f')
      .box(-3, 10, -4, 6, 0.4, 2, '#d5dae3').box(-2.7, 10.4, -3.7, 5.4, 0.1, 1.4, '#aeb6c4')
      .box(4, 10, -3.6, 1, 0.4, 1.4, '#d5dae3').box(5, 0, -1, 2.4, 3, 2.4, '#4b5563');
  }));

  // Monitor: tela com conteúdo real (canvas) + faixa de estado nas costas
  const screen = new MonitorScreen(seedName);
  const status = new THREE.MeshBasicMaterial({ color: '#22c55e' });
  const mon = new THREE.Group();
  mon.add(voxels((b) => b.box(-2, 0, -1.5, 4, 0.4, 3, '#262b36').box(-0.5, 0.4, -0.5, 1, 3, 1, '#262b36')
    .box(-4.5, 3, -0.5, 9, 5.8, 1, '#262b36')));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(8.4 * U, 5.25 * U), new THREE.MeshBasicMaterial({ map: screen.texture }));
  scr.position.set(0, 5.9 * U, 0.52 * U);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(7 * U, 0.35 * U, 0.1 * U), status);
  strip.position.set(0, 8.4 * U, -0.56 * U);
  mon.add(scr, strip);
  mon.position.set(4.6 * U, 10 * U, 0.6 * U);
  mon.rotation.y = Math.PI - 0.4;
  g.add(mon);

  const prop = propMesh(p.prop);
  prop.position.set(-5.5 * U, 10 * U, -1 * U);
  g.add(prop);
  const decor = p.desk?.decor ?? [];
  const spots: Array<[number, number, number]> = [[-1, 3, 0.3], [-8.4, 3, -0.4], [8.6, -3.2, 0]];
  decor.slice(0, 3).forEach((d, i) => {
    const m = decorMesh(d, accent);
    const [x, z, ry] = spots[i]!;
    m.position.set(x * U, 10 * U, z * U);
    m.rotation.y = ry;
    g.add(m);
  });

  const chair = voxels((b) => b.box(-3.5, 6, -3.5, 7, 1, 7, accent).box(-3.5, 7, -4.6, 7, 8, 1.1, accent)
    .box(-3, 8, -3.6, 6, 6, 0.2, shade(accent, 0.2)).box(-0.5, 1, -0.5, 1, 5, 1, '#4b5563')
    .box(-3, 0, -0.5, 6, 1, 1, '#374151').box(-0.5, 0, -3, 1, 1, 6, '#374151'));
  chair.position.z = -10 * U;
  g.add(chair);

  return { group: g, screen, status };
}

/** Assento da mesa em coordenadas locais da estação. */
export const SEAT_OFFSET_Z = -10 * U;

export function sofa(color: string): THREE.Mesh {
  return voxels((b) => b.box(-12, 1, -4, 24, 3, 8, color).box(-11, 4, -3, 22, 1, 6.5, shade(color, 0.15))
    .box(-12, 4, -4, 24, 7, 2, shade(color, -0.1)).sym(10, 4, -4, 2, 3, 8, shade(color, -0.15))
    .sym(10.5, 0, -3.5, 1, 1, 1, '#3f3f46').sym(10.5, 0, 2.5, 1, 1, 1, '#3f3f46'));
}

export function coffeeCounter(): THREE.Mesh {
  return voxels((b) => {
    b.box(-16, 0, -4, 32, 12, 8, '#f1f0ea').box(-16.5, 12, -4.5, 33, 1, 9, '#3b3f4a');
    for (const x of [-15, -7, 1, 9]) b.box(x, 2, 4, 6.5, 9, 0.2, '#e3e1d8').box(x + 5, 6, 4.1, 0.5, 2, 0.2, '#9ca3af');
    // cafeteira
    b.box(-4, 13, -3, 7, 8, 5, '#1f2937').box(-3.5, 18, 2, 6, 2, 0.3, '#b91c1c')
      .box(-2.5, 14, 0.5, 4, 0.5, 2, '#9ca3af').box(-1.5, 14.5, 0.8, 2, 2, 1.6, '#f5f5f5')
      .box(-1, 17, 2.1, 1, 0.5, 0.2, '#22c55e');
    // xícaras e açúcar
    b.box(6, 13, -1, 2, 2, 2, '#f5f5f5').box(9, 13, -1, 2, 2, 2, '#60a5fa').box(-12, 13, -2, 3, 3, 3, '#d97706');
  });
}

export function waterCooler(): THREE.Mesh {
  return voxels((b) => b.box(-2.5, 0, -2.5, 5, 10, 5, '#e5e7eb').box(-2, 10, -2, 4, 6, 4, '#93c5fd')
    .box(-1.5, 16, -1.5, 3, 0.6, 3, '#60a5fa').box(-1, 6, 2.5, 0.6, 0.8, 0.6, '#3b82f6')
    .box(0.4, 6, 2.5, 0.6, 0.8, 0.6, '#ef4444'));
}

export function bigPlant(): THREE.Mesh {
  return voxels((b) => b.box(-2.5, 0, -2.5, 5, 5, 5, '#b45f2a').box(-2.8, 4.6, -2.8, 5.6, 0.6, 5.6, '#8f4a20')
    .box(-0.5, 5, -0.5, 1, 8, 1, '#3f9d4a').box(-4, 8, -1, 4, 1.2, 2, '#4fb85a').box(0, 10, -1, 4, 1.2, 2, '#4fb85a')
    .box(-1, 12, -3.5, 2, 1.2, 3.5, '#3f9d4a').box(-1, 11, 0, 2, 1.2, 3.5, '#3f9d4a').box(-1.5, 13, -1.5, 3, 2, 3, '#4fb85a'));
}

export function bookshelf(): THREE.Mesh {
  return voxels((b) => {
    b.box(-8, 0, -2, 16, 24, 4, '#7a5232');
    const colors = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#e11d48'];
    for (let shelf = 0; shelf < 4; shelf++) {
      const y = 1 + shelf * 6;
      b.box(-7.5, y - 0.6, -1.6, 15, 0.6, 3.8, '#5e3e25');
      let x = -7;
      for (let i = 0; x < 6.5; i++) {
        const w = 0.8 + ((i * 7 + shelf * 3) % 3) * 0.4;
        b.box(x, y, -1.2, w, 3.5 + ((i + shelf) % 3) * 0.6, 3, colors[(i + shelf * 2) % colors.length]!);
        x += w + 0.15;
      }
    }
  });
}

/** TV de parede + rack, com a textura do canal de notícias. */
export function wallTv(screen: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  g.add(voxels((b) => b.box(-14, 0, -4, 28, 6, 6, '#3f3f46').box(-13, 1, 2, 12, 4, 0.2, '#52525b')
    .box(1, 1, 2, 12, 4, 0.2, '#52525b').box(-17, 13, -4.6, 34, 20, 1, '#111827')
    .box(-3, 1, 0, 6, 1.5, 1.5, '#1f2937').box(-2.6, 2.5, 0.3, 0.8, 0.3, 0.6, '#22c55e')));
  const s = new THREE.Mesh(new THREE.PlaneGeometry(32 * U, 18 * U), new THREE.MeshBasicMaterial({ map: screen }));
  s.position.set(0, 23 * U, -3.55 * U);
  g.add(s);
  return g;
}

/** Painel de métricas na parede. */
export function dashboardWall(screen: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  g.add(voxels((b) => b.box(-13.5, 13, -0.6, 27, 18, 1, '#111827').box(-1, 10, -0.6, 2, 3, 1, '#111827')));
  const s = new THREE.Mesh(new THREE.PlaneGeometry(26 * U, 16.25 * U), new THREE.MeshBasicMaterial({ map: screen }));
  s.position.set(0, 22 * U, 0.45 * U);
  g.add(s);
  return g;
}

export function wallClock(face: THREE.Texture): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshBasicMaterial({ map: face, transparent: true }));
  m.position.y = 2.55;
  return m;
}

/** Janela com vista da cidade, caixilho e persiana meio aberta. */
export function windowPane(width: number, height: number, sky: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const w = width / U, h = height / U;
  const frame = voxels((b) => {
    b.box(-w / 2, 0, -0.5, w, 1, 1.2, '#f3f4f6').box(-w / 2, h - 1, -0.5, w, 1, 1.2, '#f3f4f6')
      .box(-w / 2, 0, -0.5, 1, h, 1.2, '#f3f4f6').box(w / 2 - 1, 0, -0.5, 1, h, 1.2, '#f3f4f6')
      .box(-0.5, 0, -0.5, 1, h, 1.2, '#f3f4f6').box(-w / 2 - 0.5, -0.8, -0.5, w + 1, 0.8, 2.6, '#e5e7eb');
    // persiana: lâminas na parte de cima
    for (let i = 0; i < 6; i++) b.box(-w / 2 + 1, h - 2 - i * 0.9, 0.5, w - 2, 0.45, 0.25, '#e8e4da');
    b.box(w / 2 - 2, h - 8, 0.8, 0.2, 6, 0.2, '#9ca3af');
  }, false);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: sky }));
  glass.position.set(0, height / 2, 0.01);
  g.add(glass, frame);
  return g;
}

export function door(): THREE.Mesh {
  return voxels((b) => b.box(-7, 0, -0.5, 14, 29, 1, '#6b4a2e').box(-6, 0, -0.6, 12, 28, 1.2, '#9a6a3e')
    .box(-5, 15, 0.6, 4, 10, 0.2, '#b07c4a').box(1, 15, 0.6, 4, 10, 0.2, '#b07c4a')
    .box(-5, 2, 0.6, 4, 10, 0.2, '#b07c4a').box(1, 2, 0.6, 4, 10, 0.2, '#b07c4a')
    .box(4, 13, 0.6, 1, 1, 0.8, '#facc15').box(-8, 0, 1, 16, 0.2, 6, '#7f1d1d'));
}

export function whiteboard(): THREE.Mesh {
  return voxels((b) => {
    b.box(-12, 12, -0.6, 24, 14, 0.8, '#d1d5db').box(-11.4, 12.6, 0.2, 22.8, 12.8, 0.1, '#fafafa')
      .box(-12, 11.4, -0.6, 24, 0.6, 2, '#9ca3af');
    // rabiscos: fluxo + lista de tarefas
    b.box(-10, 21, 0.31, 5, 2.5, 0.05, '#3b82f6').box(-3, 21, 0.31, 5, 2.5, 0.05, '#22c55e').box(4, 21, 0.31, 5, 2.5, 0.05, '#ef4444')
      .box(-5, 22, 0.32, 2, 0.3, 0.05, '#111827').box(2, 22, 0.32, 2, 0.3, 0.05, '#111827');
    for (let i = 0; i < 4; i++) b.box(-10, 15 + i * 1.6, 0.31, 9 - i, 0.35, 0.05, '#111827').box(1, 15 + i * 1.6, 0.31, 1, 1, 0.05, '#16a34a');
    b.box(-8, 11.9, 1, 1.4, 0.5, 0.5, '#ef4444').box(-6, 11.9, 1, 1.4, 0.5, 0.5, '#2563eb');
  });
}

export function printer(): THREE.Mesh {
  return voxels((b) => b.box(-6, 0, -4.5, 12, 10, 9, '#e5e7eb').box(-6.3, 10, -4.8, 12.6, 4, 9.6, '#d1d5db')
    .box(-5, 14, -3, 10, 0.4, 5, '#9ca3af').box(-4, 14.4, -2.6, 8, 0.3, 4, '#ffffff')
    .box(-5, 6, 4.5, 10, 2, 1.5, '#6b7280').box(-4, 7.6, 4.6, 8, 0.4, 2, '#ffffff')
    .box(3, 12, 4.9, 2, 1, 0.1, '#22c55e').box(-5, 1, 4.6, 10, 3, 0.1, '#cbd5e1'));
}

/**
 * Pôster de papel preso na parede: fita adesiva nos cantos ou tachinha, levemente torto.
 * Origem no centro do pôster, encostado na parede (frente para +Z).
 */
export function wallPoster(tex: THREE.Texture, seed: number): THREE.Group {
  const g = new THREE.Group();
  const w = 0.56, h = 0.75;
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
  sheet.position.z = 0.012;
  sheet.receiveShadow = true;
  g.add(sheet);
  const tilt = (((seed * 37) % 9) - 4) * 0.012;
  g.rotation.z = tilt;
  if (seed % 2 === 0) {
    // fita adesiva meio transparente nos dois cantos de cima
    const tape = new THREE.MeshLambertMaterial({ color: '#f1e7c4', transparent: true, opacity: 0.8 });
    for (const sx of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.045, 0.004), tape);
      t.position.set(sx * (w / 2 - 0.03), h / 2 - 0.03, 0.016);
      t.rotation.z = sx * -0.7;
      g.add(t);
    }
  } else {
    // tachinha colorida no topo
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10),
      new THREE.MeshLambertMaterial({ color: ['#dc2626', '#2563eb', '#16a34a', '#f59e0b'][seed % 4]! }));
    pin.rotation.x = Math.PI / 2;
    pin.position.set(0, h / 2 - 0.04, 0.024);
    g.add(pin);
  }
  return g;
}
