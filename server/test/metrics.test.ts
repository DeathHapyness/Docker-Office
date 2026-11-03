import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type BusyState, nextBusy, usage } from '../src/domain/metrics.ts';

const raw = (total: number, system: number, mem = 0, inactive = 0) => ({
  cpu_stats: { cpu_usage: { total_usage: total }, system_cpu_usage: system, online_cpus: 4 },
  memory_stats: { usage: mem, limit: 1000, stats: { inactive_file: inactive } },
});

test('CPU% = Δcontainer/Δsistema × núcleos × 100 (igual ao docker stats)', () => {
  // 4 núcleos; container usou 1/8 do tempo total do sistema → meio núcleo = 50%
  assert.equal(usage(raw(1125, 9000), { total: 1000, system: 8000 }).cpu, 50);
});
test('sem amostra anterior → CPU 0 (base para a próxima)', () => {
  assert.equal(usage(raw(5000, 9000), undefined).cpu, 0);
});
test('limite NanoCpus normaliza a CPU para a regra de busy', () => {
  const u = usage(raw(1125, 9000), { total: 1000, system: 8000 }, 0.5e9); // limite de meio núcleo
  assert.equal(u.cpu, 50);
  assert.equal(u.cpuNorm, 100);
});
test('memória desconta o cache inativo (cgroup v2)', () => {
  const u = usage(raw(0, 0, 600, 200), undefined);
  assert.equal(u.memBytes, 400);
  assert.equal(u.memPct, 40);
});

const run = (cpus: number[], mem = 0) => cpus.reduce<BusyState[]>(
  (acc, c) => [...acc, nextBusy(acc.at(-1) ?? { busy: false, high: 0, low: 0 }, c, mem)], []).map((s) => s.busy);

test('histerese: entra só após 3 amostras ≥ 70%', () => {
  assert.deepEqual(run([80, 80, 60, 80, 80, 80]), [false, false, false, false, false, true]);
});
test('histerese: entre 50 e 70% continua ocupado (não pisca)', () => {
  assert.deepEqual(run([90, 90, 90, 60, 55, 65, 60]).at(-1), true);
});
test('histerese: sai só após 3 amostras < 50%', () => {
  assert.deepEqual(run([90, 90, 90, 40, 40, 60, 40, 40, 40]).slice(3), [true, true, true, true, true, false]);
});
test('memória ≥ 90% do limite → ocupado na hora', () => {
  assert.deepEqual(run([5], 95), [true]);
});
