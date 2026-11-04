import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Auth, AuthError } from '../src/auth.ts';

const dir = (): Promise<string> => mkdtemp(join(tmpdir(), 'do-auth-'));
const rejects = (p: Promise<unknown>, status: number) =>
  assert.rejects(p, (e: unknown) => e instanceof AuthError && e.status === status);

test('sem arquivo: modo setup e nada liberado', async () => {
  const a = new Auth(await dir());
  await a.load();
  assert.equal(a.mode, 'setup');
  assert.equal(a.check(''), false);
});

test('escolher "aberto" libera tudo e persiste', async () => {
  const d = await dir();
  const a = new Auth(d);
  await a.load();
  assert.equal(await a.setup('open'), '');
  assert.equal(a.check(''), true);
  const b = new Auth(d);
  await b.load();
  assert.equal(b.mode, 'open');
  await rejects(b.setup('password', 'outra-senha'), 409); // não reconfigura por cima
});

test('senha: sessão válida, senha errada recusada, nada em texto puro no disco', async () => {
  const d = await dir();
  const a = new Auth(d);
  await a.load();
  await rejects(a.setup('password', 'curta'), 400);
  const session = await a.setup('password', 'senha-forte-123');
  assert.equal(a.check(session), true);
  assert.equal(a.check(''), false);
  assert.equal(a.check('123.abc'), false);
  const raw = await readFile(join(d, 'auth.json'), 'utf8');
  assert.ok(!raw.includes('senha-forte-123'));
  assert.equal((await stat(join(d, 'auth.json'))).mode & 0o777, 0o600);

  const b = new Auth(d); // reinício do servidor: sessões continuam valendo
  await b.load();
  assert.equal(b.check(session), true);
  await rejects(b.login('errada', '1.2.3.4'), 401);
  assert.equal(b.check(await b.login('senha-forte-123', '1.2.3.4')), true);
});

test('sessão adulterada ou vencida é recusada', async () => {
  const a = new Auth(await dir());
  await a.load();
  const s = await a.setup('password', 'senha-forte-123');
  const [, sig] = s.split('.');
  assert.equal(a.check(`${Date.now() + 1e12}.${sig}`), false); // estende a validade sem o segredo
  assert.equal(a.check(`${Date.now() - 1000}.${sig}`), false);
});

test('limita tentativas por IP', async () => {
  const a = new Auth(await dir());
  await a.load();
  await a.setup('password', 'senha-forte-123');
  for (let i = 0; i < 10; i++) await rejects(a.login('x', '9.9.9.9'), 401);
  await rejects(a.login('senha-forte-123', '9.9.9.9'), 429); // até a certa fica bloqueada por um tempo
  assert.ok(a.check(await a.login('senha-forte-123', '8.8.8.8'))); // outro IP segue normal
});

test('DOCKER_OFFICE_TOKEN tem prioridade sobre o arquivo', async () => {
  const d = await dir();
  const open = new Auth(d);
  await open.load();
  await open.setup('open');
  const a = new Auth(d, 'token-do-ambiente-1234');
  await a.load();
  assert.equal(a.mode, 'token');
  assert.equal(a.check(''), false);
  assert.equal(a.check('token-do-ambiente-1234'), true);
  assert.equal(await a.login('token-do-ambiente-1234', 'ip'), 'token-do-ambiente-1234');
});
