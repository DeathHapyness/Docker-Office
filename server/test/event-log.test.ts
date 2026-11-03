import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../../web/src/state/event-log.ts';
import type { ContainerView } from '../../web/src/model.ts';

const who = { name: 'Sonarr', accent: '#0ff' };
const c = (p: Partial<ContainerView>): ContainerView => ({ id: 's', name: 'sonarr', image: 'i', dockerState: 'running', visualState: 'working', ...p });

test('primeira observação gera resumo; mudanças seguintes viram entradas', () => {
  const log = new EventLog();
  log.observe([{ c: c({}), who }]);
  assert.equal(log.entries.length, 1);
  assert.equal(log.entries[0]!.kind, 'system');
  log.observe([{ c: c({ dockerState: 'exited', visualState: 'error', exitCode: 1, lastEvent: { action: 'die', at: '2026-11-03T12:00:00Z' } }), who }]);
  const texts = log.entries.map((e) => e.text);
  assert.ok(texts.includes('parou de responder'));
  assert.ok(texts.includes('trabalhando → com erro'));
  assert.equal(log.entries.find((e) => e.text === 'parou de responder')!.detail, 'docker die · exit 1');
});

test('métricas mudando sem trocar estado não geram ruído no log', () => {
  const log = new EventLog();
  log.observe([{ c: c({ metrics: { cpu: 1, memBytes: 1 } }), who }]);
  log.observe([{ c: c({ metrics: { cpu: 30, memBytes: 2 } }), who }]);
  assert.equal(log.entries.length, 1);
});
