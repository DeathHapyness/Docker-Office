/**
 * Construtor de geometria "voxel": acumula caixas coloridas e gera UMA BufferGeometry
 * (cores por vértice). Cada parte do personagem/móvel vira uma única malha → poucos draw calls.
 */
import * as THREE from 'three';

/** Tamanho de 1 voxel em unidades do mundo (≈ metros). */
export const U = 0.075;

export class VoxelBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private readonly c = new THREE.Color();

  constructor(private readonly unit = U) {}

  /** Caixa com canto mínimo (x,y,z) e tamanho (w,h,d), em voxels. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string): this {
    const u = this.unit;
    const x0 = x * u, y0 = y * u, z0 = z * u;
    const x1 = (x + w) * u, y1 = (y + h) * u, z1 = (z + d) * u;
    this.c.set(color);
    const quads: Array<[number[], number[], number[], number[], [number, number, number]]> = [
      [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]],
      [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
    ];
    for (const [a, b, cc, dd, n] of quads) {
      const base = this.pos.length / 3;
      for (const v of [a, b, cc, dd]) {
        this.pos.push(v[0]!, v[1]!, v[2]!);
        this.nor.push(n[0], n[1], n[2]);
        this.col.push(this.c.r, this.c.g, this.c.b);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }

  /** Caixa e sua cópia espelhada em X (simetria esquerda/direita). */
  sym(x: number, y: number, z: number, w: number, h: number, d: number, color: string): this {
    return this.box(x, y, z, w, h, d, color).box(-x - w, y, z, w, h, d, color);
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }

  mesh(material: THREE.Material = voxelMaterial, shadows = true): THREE.Mesh {
    const m = new THREE.Mesh(this.geometry(), material);
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    return m;
  }
}

/** Material compartilhado por todas as malhas voxel (cor vem dos vértices). */
export const voxelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

/** Atalho: constrói uma malha a partir de uma função que desenha caixas. */
export function voxels(draw: (b: VoxelBuilder) => void, shadows = true): THREE.Mesh {
  const b = new VoxelBuilder();
  draw(b);
  return b.mesh(voxelMaterial, shadows);
}
