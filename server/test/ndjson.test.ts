import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NdjsonSplitter } from '../src/docker/ndjson.ts';

const FIXTURE = readFileSync(new URL('./fixtures/events-lifecycle.ndjson', import.meta.url));

test('junta linhas quebradas em pedaços arbitrários (stream real fragmentado)', () => {
  for (const size of [1, 7, 64, 1000]) {
    const out: unknown[] = [];
    const s = new NdjsonSplitter((o) => out.push(o));
    for (let i = 0; i < FIXTURE.length; i += size) s.push(FIXTURE.subarray(i, i + size));
    s.end();
    assert.equal(out.length, 17, `chunks de ${size} bytes`);
  }
});

test('vários eventos num chunk e última linha sem \\n', () => {
  const out: unknown[] = [];
  const s = new NdjsonSplitter((o) => out.push(o));
  s.push('{"a":1}\n{"a":2}\n{"a"');
  s.push(':3}');
  assert.equal(out.length, 2);
  s.end();
  assert.deepEqual(out, [{ a: 1 }, { a: 2 }, { a: 3 }]);
});

test('linha inválida não derruba o parser', () => {
  const out: unknown[] = [], bad: string[] = [];
  const s = new NdjsonSplitter((o) => out.push(o), (l) => bad.push(l));
  s.push('lixo\n{"ok":true}\n');
  assert.deepEqual(out, [{ ok: true }]);
  assert.deepEqual(bad, ['lixo']);
});

test('caracteres multibyte (UTF-8) divididos entre chunks', () => {
  const out: Array<{ n: string }> = [];
  const s = new NdjsonSplitter((o) => out.push(o as { n: string }));
  const buf = Buffer.from('{"n":"ação"}\n');
  s.push(buf.subarray(0, 9));
  s.push(buf.subarray(9));
  assert.equal(out[0]?.n, 'ação');
});
