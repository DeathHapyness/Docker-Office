/** Tipos de domínio vistos pelo frontend (espelham o protocolo previsto em AGENTS.md §5). */

export type VisualState = 'working' | 'busy' | 'stopped' | 'error';
export type DockerState = 'created' | 'running' | 'paused' | 'restarting' | 'exited' | 'dead';

export interface ContainerMetrics {
  /** CPU em % de UM núcleo (como no `docker stats`: 200% = 2 núcleos cheios). */
  cpu: number;
  memBytes: number;
  /** Limite de memória do container (ou RAM do host, se não houver limite). */
  memLimit?: number;
}

export interface ContainerView {
  id: string;
  name: string;
  image: string;
  project?: string;
  service?: string;
  roomId?: string;
  dockerState: DockerState;
  health?: 'starting' | 'healthy' | 'unhealthy';
  exitCode?: number;
  oomKilled?: boolean;
  restartCount?: number;
  startedAt?: string;
  finishedAt?: string;
  ports?: string[];
  /** Label `docker-office.character`: força um perfil de personagem. */
  character?: string;
  lastEvent?: { action: string; at: string };
  visualState: VisualState;
  /** Texto curto exibido no balão (motivo do estado). */
  reason?: string;
  metrics?: ContainerMetrics;
}

export interface Room {
  id: string;
  name: string;
  /** Cor de destaque do departamento. */
  color?: string;
}
