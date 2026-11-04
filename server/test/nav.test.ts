import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavGrid, type P2 } from '../../web/src/sim/nav.ts';

/** Confere, em passos de 2 cm, que nenhum trecho do caminho passa por célula bloqueada. */
function walkable(nav: NavGrid, from: P2, path: P2[]): boolean {
  let a = from;
  for (const b of path) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.02);
    for (let k = 0; k <= n; k++) {
      if (!nav.isFree({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n })) return false;
    }
    a = b;
  }
  return true;
}

test('campo aberto: uma reta só, mesmo na diagonal fora de 45°', () => {
  const nav = new NavGrid(10, 10);
  const from = { x: 1, z: 1 }, to = { x: 8.6, z: 3.3 };
  const path = nav.findPath(from, to);
  assert.deepEqual(path, [to]);
});

test('contorna obstáculo sem atravessar e sem zigue-zague', () => {
  const nav = new NavGrid(10, 10);
  nav.blockRect(5, 5, 0.5, 3); // parede vertical no meio
  const from = { x: 2, z: 5 }, to = { x: 8, z: 5 };
  const path = nav.findPath(from, to);
  assert.ok(walkable(nav, from, path), 'atravessou o obstáculo');
  assert.ok(path.length <= 3, `pontos demais: ${path.length}`);
  assert.deepEqual(path.at(-1), to);
});
