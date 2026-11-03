/**
 * Dados fictícios dos 32 serviços da stack real (nomes, imagens, projetos e portas
 * copiados dos composes de ~/Projects/self-hosted-media-server em 2026-11-03).
 * Estados e CPU variam só para a demonstração.
 */
import type { ContainerView, VisualState } from '../model.js';

const MB = 1024 * 1024;
const ago = (min: number): string => new Date(Date.now() - min * 60_000).toISOString();

type Row = [name: string, project: string, image: string, ports: string[], memMB: number];

const ROWS: Row[] = [
  ['adguardhome', 'adguard', 'adguard/adguardhome', ['53/tcp', '53/udp', '80/tcp'], 95],
  ['cadvisor', 'monitoring', 'gcr.io/cadvisor/cadvisor:latest', ['8080/tcp'], 140],
  ['dozzle', 'dozzle', 'amir20/dozzle:latest', ['8080/tcp'], 22],
  ['filebrowser', 'filebrowser', 'filebrowser/filebrowser:latest', ['80/tcp'], 30],
  ['forgejo', 'forgejo', 'codeberg.org/forgejo/forgejo:16', ['3000/tcp', '22/tcp'], 210],
  ['freshrss', 'freshrss', 'docker.io/freshrss/freshrss:latest', ['80/tcp'], 60],
  ['glances', 'glances', 'nicolargo/glances:latest-full', ['61208/tcp'], 90],
  ['grafana', 'monitoring', 'grafana/grafana:latest', ['3000/tcp'], 180],
  ['homepage', 'homepage', 'ghcr.io/gethomepage/homepage:latest', ['3000/tcp'], 110],
  ['immich_machine_learning', 'immich-app', 'ghcr.io/immich-app/immich-machine-learning:release', [], 1400],
  ['immich_postgres', 'immich-app', 'ghcr.io/immich-app/postgres:14-vectorchord0.4.3-pgvectors0.2.0', ['5432/tcp'], 320],
  ['immich_redis', 'immich-app', 'docker.io/valkey/valkey:9', ['6379/tcp'], 18],
  ['immich_server', 'immich-app', 'ghcr.io/immich-app/immich-server:release', ['2283/tcp'], 620],
  ['jellyfin', 'jellyfin', 'jellyfin/jellyfin:latest', ['8096/tcp'], 175],
  ['jellyseerr', 'jellyseerr', 'fallenbagel/jellyseerr:latest', ['5055/tcp'], 240],
  ['juice-shop', 'juice-shop', 'bkimminich/juice-shop:latest', ['3000/tcp'], 160],
  ['kopia', 'kopia', 'kopia/kopia:latest', ['51515/tcp'], 85],
  ['librespeed', 'librespeed', 'lscr.io/linuxserver/librespeed:latest', ['80/tcp'], 25],
  ['links-hub', 'links-hub', 'ghcr.io/deathhapyness/links-hub:latest', ['5000/tcp'], 40],
  ['mat2-web', 'mat2-web', 'mat2-web:local', ['8080/tcp'], 55],
  ['n8n', 'n8n', 'docker.n8n.io/n8nio/n8n:latest', ['5678/tcp'], 260],
  ['navidrome', 'navidrome', 'deluan/navidrome:latest', ['4533/tcp'], 70],
  ['node-exporter', 'monitoring', 'prom/node-exporter:latest', ['9100/tcp'], 15],
  ['ntopng', 'ntopng', 'ntop/ntopng:latest', ['3000/tcp'], 230],
  ['ntopng-redis', 'ntopng', 'redis:7-alpine', ['6379/tcp'], 12],
  ['prometheus', 'monitoring', 'prom/prometheus:latest', ['9090/tcp'], 290],
  ['prowlarr', 'prowlarr', 'lscr.io/linuxserver/prowlarr:latest', ['9696/tcp'], 150],
  ['qbittorrent', 'qbittorrent', 'lscr.io/linuxserver/qbittorrent:latest', ['8080/tcp', '6881/tcp', '6881/udp'], 330],
  ['radarr', 'radarr', 'lscr.io/linuxserver/radarr:latest', ['7878/tcp'], 200],
  ['scrutiny', 'scrutiny', 'ghcr.io/analogj/scrutiny:master-omnibus', ['8080/tcp'], 120],
  ['sonarr', 'sonarr', 'lscr.io/linuxserver/sonarr:latest', ['8989/tcp'], 410],
  ['speedtest-tracker', 'speedtest-tracker', 'lscr.io/linuxserver/speedtest-tracker:latest', ['80/tcp'], 130],
];

/** Estado inicial da demo: maioria trabalhando, alguns ociosos, um busy, um parado e um com erro. */
const SCENARIO: Record<string, { visual: VisualState; cpu: number }> = {
  sonarr: { visual: 'busy', cpu: 82 },
  immich_machine_learning: { visual: 'busy', cpu: 91 },
  radarr: { visual: 'stopped', cpu: 0 },
  'juice-shop': { visual: 'stopped', cpu: 0 },
  scrutiny: { visual: 'error', cpu: 0 },
};

export const mockContainers: ContainerView[] = ROWS.map(([name, project, image, ports, memMB], i) => {
  const s = SCENARIO[name] ?? { visual: 'working' as VisualState, cpu: i % 3 === 0 ? 0.5 : 5 + ((i * 37) % 40) };
  const started = 20 + ((i * 263) % 9000);
  const base: ContainerView = {
    id: `c-${name}`, name, service: name, project, image, roomId: 'office', ports,
    dockerState: 'running', visualState: s.visual, restartCount: 0, startedAt: ago(started),
    lastEvent: { action: 'start', at: ago(started) },
    metrics: { cpu: s.cpu, memBytes: memMB * MB },
  };
  if (s.visual === 'stopped') {
    return { ...base, dockerState: 'exited', exitCode: 0, reason: 'Parado (exit 0)', metrics: undefined,
      startedAt: undefined, finishedAt: ago(18), lastEvent: { action: 'stop', at: ago(18) } };
  }
  if (s.visual === 'error') {
    return { ...base, dockerState: 'exited', exitCode: 1, reason: 'exit 1', restartCount: 3, metrics: undefined,
      startedAt: undefined, finishedAt: ago(4), lastEvent: { action: 'die', at: ago(4) } };
  }
  return base;
});
