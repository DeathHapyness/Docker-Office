import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_API, pickApiVersion } from '../src/docker/api.ts';

test('Engine novo: limita à maior versão testada', () => {
  assert.equal(pickApiVersion({ ApiVersion: '1.60', MinAPIVersion: '1.44' }), MAX_API);
});

test('Engine igual ao testado: usa a versão dele', () => {
  assert.equal(pickApiVersion({ ApiVersion: '1.56', MinAPIVersion: '1.44' }), '1.56');
});

test('Engine antigo (Docker 19.03, API 1.40): usa 1.40', () => {
  assert.equal(pickApiVersion({ ApiVersion: '1.40', MinAPIVersion: '1.12' }), '1.40');
});

test('Mínimo do Engine acima do nosso teto: respeita o mínimo', () => {
  assert.equal(pickApiVersion({ ApiVersion: '2.3', MinAPIVersion: '2.0' }), '2.0');
});

test('Sem informação: sem prefixo (o Engine usa a dele)', () => {
  assert.equal(pickApiVersion({}), undefined);
  assert.equal(pickApiVersion({ ApiVersion: 'abc' }), undefined);
});

test('compara numericamente (1.9 < 1.41)', () => {
  assert.equal(pickApiVersion({ ApiVersion: '1.9' }), '1.9');
});
