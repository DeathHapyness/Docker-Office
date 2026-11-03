/**
 * Decide o estado visual (working/busy/stopped/error) e o texto do balão a partir do estado
 * do Docker. Lógica pura — sem I/O — testada em server/test/classifier.test.ts.
 * Ordem de prioridade: error > stopped > busy > working (AGENTS.md §7).
 */
import type { DockerState, VisualState } from '../../../web/src/model.ts';

export interface ClassifyInput {
  dockerState: DockerState;
  exitCode?: number;
  oomKilled?: boolean;
  health?: 'starting' | 'healthy' | 'unhealthy';
  /** Reinícios observados nos últimos 5 minutos. */
  recentRestarts: number;
  /**
   * true: vimos `stop`/`kill` pedido por alguém antes do `die`; false: vimos o `die` sem isso;
   * undefined: não sabemos (o backend acabou de subir).
   */
  userStopped?: boolean;
  busy: boolean;
  cpu?: number;
}

export interface Classification {
  visual: VisualState;
  reason?: string;
}

/** Códigos de saída típicos de SIGKILL/SIGTERM: parada externa, não necessariamente erro. */
const SIGNAL_EXITS = new Set([137, 143]);

export function classify(i: ClassifyInput): Classification {
  if (i.dockerState === 'dead') return { visual: 'error', reason: 'Container morto (dead)' };
  if (i.oomKilled) return { visual: 'error', reason: 'Sem memória (OOM)' };
  if (i.dockerState === 'restarting') return { visual: 'error', reason: 'Reiniciando sem parar' };
  if (i.recentRestarts >= 3) return { visual: 'error', reason: `${i.recentRestarts} reinícios em 5 min` };

  if (i.dockerState === 'exited') {
    const code = i.exitCode ?? 0;
    if (i.userStopped) return { visual: 'stopped', reason: `Parado (exit ${code})` };
    if (code === 0) return { visual: 'stopped', reason: 'Terminou o serviço (exit 0)' };
    if (i.userStopped === undefined && SIGNAL_EXITS.has(code)) return { visual: 'stopped', reason: `Parado (exit ${code})` };
    return { visual: 'error', reason: `Caiu! exit ${code}` };
  }
  if (i.dockerState === 'created') return { visual: 'stopped', reason: 'Contratado, ainda não começou' };
  if (i.dockerState === 'paused') return { visual: 'stopped', reason: 'Pausado' };

  // running
  if (i.health === 'unhealthy') return { visual: 'error', reason: 'Healthcheck falhando (unhealthy)' };
  if (i.busy) return { visual: 'busy', reason: i.cpu !== undefined ? `Alta carga · CPU ${Math.round(i.cpu)}%` : 'Alta carga' };
  if (i.health === 'starting') return { visual: 'working', reason: 'Iniciando…' };
  return { visual: 'working' };
}
