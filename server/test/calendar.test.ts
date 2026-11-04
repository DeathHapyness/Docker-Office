import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easter, holidayOn, newYearCountdown, OfficeClock } from '../../web/src/util/calendar.ts';

const d = (y: number, m: number, day: number, h = 12, mi = 0, s = 0): Date => new Date(y, m - 1, day, h, mi, s);

test('Páscoa em anos conhecidos', () => {
  assert.deepEqual(easter(2026), d(2026, 4, 5, 0));
  assert.deepEqual(easter(2027), d(2027, 3, 28, 0));
  assert.deepEqual(easter(2025), d(2025, 4, 20, 0));
});

test('datas comemorativas', () => {
  assert.equal(holidayOn(d(2026, 11, 4)), null);
  assert.equal(holidayOn(d(2026, 12, 1)), 'natal');
  assert.equal(holidayOn(d(2026, 12, 25)), 'natal');
  assert.equal(holidayOn(d(2026, 12, 26)), 'anonovo');
  assert.equal(holidayOn(d(2027, 1, 2)), 'anonovo');
  assert.equal(holidayOn(d(2027, 1, 3)), null);
  assert.equal(holidayOn(d(2026, 2, 17)), 'carnaval'); // terça de carnaval 2026
  assert.equal(holidayOn(d(2026, 2, 18)), 'carnaval'); // quarta de cinzas
  assert.equal(holidayOn(d(2026, 2, 19)), null);
  assert.equal(holidayOn(d(2026, 4, 5)), 'pascoa');
  assert.equal(holidayOn(d(2026, 6, 12)), 'namorados');
  assert.equal(holidayOn(d(2026, 6, 24)), 'junina');
  assert.equal(holidayOn(d(2026, 9, 7)), 'independencia');
  assert.equal(holidayOn(d(2026, 10, 31)), 'halloween');
});

test('contagem do Ano Novo só nos 7 dias antes', () => {
  assert.equal(newYearCountdown(d(2026, 12, 24, 23, 59, 59)), null);
  const c = newYearCountdown(d(2026, 12, 25, 0, 0, 0));
  assert.ok(c);
  assert.equal(c.year, 2027);
  assert.equal(c.ms, 7 * 86_400_000);
  assert.equal(newYearCountdown(d(2026, 12, 31, 23, 59, 59))?.ms, 1000);
  assert.deepEqual(newYearCountdown(d(2027, 1, 1, 0, 0, 0)), { year: 2027, ms: 0, arrived: true });
  assert.equal(newYearCountdown(d(2027, 1, 2, 0, 0, 0)), null);
  assert.equal(newYearCountdown(d(2026, 11, 4)), null);
});

test('relógio simulado', () => {
  const c = new OfficeClock();
  assert.equal(c.simulate('lixo'), false);
  assert.equal(c.simulated, false);
  assert.ok(c.simulate('2026-12-31T23:59:30'));
  const n = c.now();
  assert.equal(n.getFullYear(), 2026);
  assert.equal(n.getMonth(), 11);
  assert.equal(n.getMinutes(), 59);
});
