/** Configuração por variáveis de ambiente (nada de arquivo com segredo no repositório). */
import { parseDockerHost, type DockerTarget } from './docker/api.ts';

export interface Config {
  port: number;
  host: string;
  docker: DockerTarget;
  /** Token exigido em /api/* (?token= ou Authorization: Bearer). Vazio = sem token. */
  token: string;
  /** Modo demonstração: não acessa o Docker; o frontend usa dados simulados. */
  demo: boolean;
  metricsMs: number;
  maxClients: number;
}

function int(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} deve ser um inteiro entre ${min} e ${max}`);
  return n;
}

export function loadConfig(): Config {
  const token = process.env.DOCKER_OFFICE_TOKEN ?? '';
  if (token && token.length < 16) throw new Error('DOCKER_OFFICE_TOKEN precisa ter pelo menos 16 caracteres');
  return {
    port: int('PORT', 8420, 1, 65535),
    host: process.env.HOST ?? '0.0.0.0',
    docker: parseDockerHost(process.env.DOCKER_HOST || undefined),
    token,
    demo: /^(1|true|yes)$/i.test(process.env.DOCKER_OFFICE_DEMO ?? ''),
    metricsMs: int('METRICS_INTERVAL_MS', 3000, 1000, 60_000),
    maxClients: int('MAX_CLIENTS', 50, 1, 1000),
  };
}
