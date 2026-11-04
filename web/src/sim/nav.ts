/** Grade de navegação + A* (8 direções, sem cortar quinas). */

export interface P2 {
  x: number;
  z: number;
}

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;
  readonly width: number;
  readonly depth: number;
  readonly cell: number;

  constructor(width: number, depth: number, cell = 0.25) {
    this.width = width;
    this.depth = depth;
    this.cell = cell;
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(depth / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  /** Bloqueia um retângulo (centro + meias-dimensões) em coordenadas do mundo. */
  blockRect(cx: number, cz: number, hw: number, hd: number): void {
    const c0 = Math.max(0, Math.floor((cx - hw) / this.cell));
    const c1 = Math.min(this.cols - 1, Math.floor((cx + hw) / this.cell));
    const r0 = Math.max(0, Math.floor((cz - hd) / this.cell));
    const r1 = Math.min(this.rows - 1, Math.floor((cz + hd) / this.cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.blocked[r * this.cols + c] = 1;
  }

  isFree(p: P2): boolean {
    const c = Math.floor(p.x / this.cell);
    const r = Math.floor(p.z / this.cell);
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.blocked[r * this.cols + c] === 0;
  }

  randomFree(rand: () => number = Math.random): P2 {
    for (let i = 0; i < 200; i++) {
      const p = { x: rand() * this.width, z: rand() * this.depth };
      if (this.isFree(p) && this.isFree({ x: p.x + 0.4, z: p.z }) && this.isFree({ x: p.x - 0.4, z: p.z })) return p;
    }
    return { x: this.width / 2, z: this.depth / 2 };
  }

  /** Caminho de `from` até `to`. Origem/destino podem estar em células bloqueadas (ex.: cadeira). */
  findPath(from: P2, to: P2): P2[] {
    const { cols, rows, cell } = this;
    const clampC = (v: number): number => Math.min(cols - 1, Math.max(0, Math.floor(v / cell)));
    const clampR = (v: number): number => Math.min(rows - 1, Math.max(0, Math.floor(v / cell)));
    const start = clampR(from.z) * cols + clampC(from.x);
    const goal = clampR(to.z) * cols + clampC(to.x);
    if (start === goal) return [to];

    const free = (i: number): boolean => this.blocked[i] === 0 || i === start || i === goal;
    const g = new Float32Array(cols * rows).fill(Infinity);
    const came = new Int32Array(cols * rows).fill(-1);
    const closed = new Uint8Array(cols * rows);
    const heap = new MinHeap();
    const gx = goal % cols, gz = Math.floor(goal / cols);
    const h = (i: number): number => {
      const dx = Math.abs((i % cols) - gx), dz = Math.abs(Math.floor(i / cols) - gz);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    g[start] = 0;
    heap.push(start, h(start));
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]] as const;

    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % cols, cz = Math.floor(cur / cols);
      for (const [dx, dz, cost] of DIRS) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
        const ni = nz * cols + nx;
        if (!free(ni) || closed[ni]) continue;
        if (dx && dz && (!free(cz * cols + nx) || !free(nz * cols + cx))) continue; // sem cortar quina
        const ng = g[cur]! + cost;
        if (ng < g[ni]!) {
          g[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + h(ni));
        }
      }
    }
    if (!found) return [to];

    const cells: number[] = [];
    for (let i = goal; i !== -1; i = came[i]!) cells.push(i);
    cells.reverse();

    // "Puxa o barbante": de cada ponto, pula direto para o mais distante que dá para ver em linha
    // reta (com folga para o corpo). Troca o zigue-zague de 45° da grade por retas naturais.
    const center = (i: number): P2 => ({ x: ((i % cols) + 0.5) * cell, z: (Math.floor(i / cols) + 0.5) * cell });
    const freeAt = (x: number, z: number): boolean => {
      const c = Math.floor(x / cell), r = Math.floor(z / cell);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
      return free(r * cols + c);
    };
    const clear = (a: P2, b: P2): boolean => {
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      if (len < 1e-6) return true;
      const nx = (-dz / len) * 0.12, nz = (dx / len) * 0.12; // folga lateral de 12 cm
      const n = Math.ceil(len / (cell * 0.3));
      for (let k = 0; k <= n; k++) {
        const x = a.x + (dx * k) / n, z = a.z + (dz * k) / n;
        if (!freeAt(x, z) || !freeAt(x + nx, z + nz) || !freeAt(x - nx, z - nz)) return false;
      }
      return true;
    };
    const way: P2[] = [...cells.slice(1, -1).map(center), to];
    const pts: P2[] = [];
    let anchor: P2 = from;
    let i = 0;
    while (i < way.length) {
      let j = way.length - 1;
      while (j > i && !clear(anchor, way[j]!)) j--;
      pts.push(way[j]!);
      anchor = way[j]!;
      i = j + 1;
    }
    return pts;
  }
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, p: number): void {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent]! <= this.prio[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.items[0]!;
    const lastI = this.items.pop()!;
    const lastP = this.prio.pop()!;
    if (this.items.length) {
      this.items[0] = lastI;
      this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l]! < this.prio[m]!) m = l;
        if (r < this.items.length && this.prio[r]! < this.prio[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.prio[a], this.prio[b]] = [this.prio[b]!, this.prio[a]!];
  }
}
