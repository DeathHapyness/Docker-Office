/**
 * Construtor de geometria low poly: junta primitivas de poucos lados (cilindros, cones, esferas
 * facetadas) numa só BufferGeometry com cor por vértice e sombreamento chapado (faces visíveis).
 * Mesmo princípio do VoxelBuilder: uma malha por parte → poucos draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { U } from './voxel.js';

type V3 = readonly [number, number, number];

export interface Placement {
  rot?: V3;
  scale?: V3 | number;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

export class PolyBuilder {
  private parts: THREE.BufferGeometry[] = [];

  /** `unit`: tamanho de 1 unidade das coordenadas (padrão: 1 voxel, igual ao rig voxel). */
  constructor(private readonly unit = U) {}

  /** Acrescenta uma primitiva (em unidades) centrada em `at`, com rotação/escala opcionais. */
  add(geo: THREE.BufferGeometry, color: string, at: V3, o: Placement = {}): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    const s = typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] as const : o.scale ?? [1, 1, 1];
    tmpQ.setFromEuler(tmpE.set(...(o.rot ?? [0, 0, 0])));
    tmpM.compose(tmpP.set(...at), tmpQ, tmpS.set(...s));
    g.applyMatrix4(tmpM);
    g.scale(this.unit, this.unit, this.unit);
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g.computeVertexNormals(); // sem índice → normal por face (visual facetado)
    const c = new THREE.Color(color);
    const n = g.attributes.position!.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  /** Mesma primitiva espelhada em X. */
  sym(make: () => THREE.BufferGeometry, color: string, at: V3, o: Placement = {}): this {
    this.add(make(), color, at, o);
    const rot = o.rot ? [o.rot[0], -o.rot[1], -o.rot[2]] as const : undefined;
    return this.add(make(), color, [-at[0], at[1], at[2]], { ...o, rot });
  }

  /* Atalhos de primitivas (dimensões em unidades) */
  box(w: number, h: number, d: number, color: string, at: V3, o?: Placement): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, at, o);
  }

  cyl(rTop: number, rBot: number, h: number, color: string, at: V3, seg = 6, o?: Placement): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1), color, at, o);
  }

  ball(r: number, color: string, at: V3, detail = 1, o?: Placement): this {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, at, o);
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  geometry(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false) ?? new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }

  mesh(material: THREE.Material = lowPolyMaterial, shadows = true): THREE.Mesh {
    const m = new THREE.Mesh(this.geometry(), material);
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    return m;
  }
}

/** Material dos modelos low poly: cor nos vértices, faces chapadas. */
export const lowPolyMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
