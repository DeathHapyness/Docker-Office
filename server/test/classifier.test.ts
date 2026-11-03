import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, type ClassifyInput } from '../src/domain/classifier.ts';

const base: ClassifyInput = { dockerState: 'running', recentRestarts: 0, busy: false };
const v = (i: Partial<ClassifyInput>) => classify({ ...base, ...i }).visual;

test('running sem nada especial → working', () => assert.equal(v({}), 'working'));
test('health starting → working com selo "Iniciando"', () => {
  assert.deepEqual(classify({ ...base, health: 'starting' }), { visual: 'working', reason: 'Iniciando…' });
});
test('busy → busy; unhealthy vence busy', () => {
  assert.equal(v({ busy: true }), 'busy');
  assert.equal(v({ busy: true, health: 'unhealthy' }), 'error');
});
test('dead, OOM e restarting → error', () => {
  assert.equal(v({ dockerState: 'dead' }), 'error');
  assert.equal(v({ dockerState: 'exited', oomKilled: true, userStopped: true }), 'error');
  assert.equal(v({ dockerState: 'restarting' }), 'error');
});
test('3 reinícios em 5 min → error mesmo rodando', () => assert.equal(v({ recentRestarts: 3 }), 'error'));
test('exited após stop/kill do usuário → stopped (qualquer código)', () => {
  assert.equal(v({ dockerState: 'exited', exitCode: 137, userStopped: true }), 'stopped');
  assert.equal(v({ dockerState: 'exited', exitCode: 1, userStopped: true }), 'stopped');
});
test('exited sozinho com código ≠ 0 → error; com 0 → stopped', () => {
  assert.equal(v({ dockerState: 'exited', exitCode: 1, userStopped: false }), 'error');
  assert.equal(v({ dockerState: 'exited', exitCode: 137, userStopped: false }), 'error');
  assert.equal(v({ dockerState: 'exited', exitCode: 0, userStopped: false }), 'stopped');
});
test('137/143 sem evento observado (backend reiniciou) → stopped', () => {
  assert.equal(v({ dockerState: 'exited', exitCode: 137 }), 'stopped');
  assert.equal(v({ dockerState: 'exited', exitCode: 143 }), 'stopped');
  assert.equal(v({ dockerState: 'exited', exitCode: 2 }), 'error');
});
test('created e paused → stopped', () => {
  assert.equal(v({ dockerState: 'created' }), 'stopped');
  assert.equal(v({ dockerState: 'paused' }), 'stopped');
});
