import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { type DockerEvent, type Inspect, Store } from '../src/domain/store.ts';

const events: DockerEvent[] = readFileSync(new URL('./fixtures/events-lifecycle.ndjson', import.meta.url), 'utf8')
  .trim().split('\n').map((l) => JSON.parse(l));
const idOf = (name: string) => events.find((e) => e.Actor?.Attributes?.name === name)!.Actor!.ID!;

const inspect = (id: string, name: string, state: string, exit = 0, extra: Partial<Inspect> = {}): Inspect => ({
  Id: id, Name: `/${name}`, Config: { Image: `img/${name}`, Labels: { 'com.docker.compose.project': name, 'com.docker.compose.service': name } },
  State: { Status: state, ExitCode: exit, StartedAt: '2026-11-03T10:00:00Z', FinishedAt: '2026-11-03T11:00:00Z' },
  RestartCount: 0, NetworkSettings: { Ports: { '8989/tcp': null } }, ...extra,
});

function replay(name: string, upTo: string): Store {
  const s = new Store();
  const id = idOf(name);
  s.upsert(inspect(id, name, 'running'));
  for (const e of events) {
    if (e.Actor?.ID !== id) continue;
    s.event(e);
    if (e.Action === upTo) break;
  }
  return s;
}

test('healthcheck (exec_*) é ruído', () => {
  const s = new Store();
  assert.equal(s.event(events.find((e) => e.Action?.startsWith('exec_'))!), null);
});

test('docker stop real (kill → stop → die exit 0) → parado', () => {
  const s = replay('sonarr', 'die');
  const v = s.upsert(inspect(idOf('sonarr'), 'sonarr', 'exited', 0))!;
  assert.equal(v.visualState, 'stopped');
  assert.equal(v.lastEvent?.action, 'die');
});

test('docker kill real (kill → die 137) → parado, não erro', () => {
  const s = replay('radarr', 'die');
  assert.equal(s.upsert(inspect(idOf('radarr'), 'radarr', 'exited', 137))!.visualState, 'stopped');
});

test('die com exit 1 sem stop/kill antes → erro', () => {
  const s = new Store();
  s.upsert(inspect('a'.repeat(64), 'x', 'running'));
  s.event({ Type: 'container', Action: 'die', Actor: { ID: 'a'.repeat(64) }, time: 1 });
  assert.equal(s.upsert(inspect('a'.repeat(64), 'x', 'exited', 1))!.visualState, 'error');
});

test('3 reinícios (RestartCount) em 5 min → erro', () => {
  const s = new Store();
  const id = 'b'.repeat(64);
  const t0 = Date.now();
  for (let n = 0; n <= 3; n++) s.upsert(inspect(id, 'y', 'running', 0, { RestartCount: n }), t0 + n);
  assert.equal(s.get(id)!.visualState, 'error');
});

test('compose run avulso (oneoff) fica oculto', () => {
  const s = new Store();
  assert.equal(s.upsert({ Id: 'c'.repeat(64), Config: { Labels: { 'com.docker.compose.oneoff': 'True' } }, State: { Status: 'running' } }), undefined);
});

test('view: projeto/serviço das labels, portas, sem métricas quando parado', () => {
  const s = new Store();
  const v = s.upsert(inspect('d'.repeat(64), 'sonarr', 'exited', 0, { Config: { Image: 'i', Labels: { 'docker-office.character': 'sonarr' } } }))!;
  assert.equal(v.character, 'sonarr');
  assert.deepEqual(v.ports, ['8989/tcp']);
  assert.equal(v.metrics, undefined);
  assert.equal(v.startedAt, undefined);
});

test('destroy remove; eventos antigos (since) não voltam o último evento no tempo', () => {
  const s = new Store();
  const id = 'e'.repeat(64);
  s.upsert(inspect(id, 'z', 'running'));
  s.event({ Type: 'container', Action: 'start', Actor: { ID: id }, time: 200 });
  s.event({ Type: 'container', Action: 'create', Actor: { ID: id }, time: 100 });
  assert.equal(s.get(id)!.lastEvent?.action, 'start');
  assert.equal(s.event({ Type: 'container', Action: 'destroy', Actor: { ID: id }, time: 300 }), 'remove');
});

test('portas: publicadas viram host→container, IPv4/IPv6 sem duplicar', async () => {
  const { formatPorts } = await import('../src/domain/store.ts');
  assert.deepEqual(formatPorts({
    '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8181' }, { HostIp: '::', HostPort: '8181' }],
    '53/udp': [{ HostIp: '0.0.0.0', HostPort: '1053' }], '3000/tcp': null,
  }), ['1053→53/udp', '8181→80/tcp']);
  assert.deepEqual(formatPorts({ '9100/tcp': null }), ['9100/tcp']);
});
