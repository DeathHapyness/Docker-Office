/** Tipos de domínio vistos pelo frontend (espelham o protocolo previsto em AGENTS.md §5). */

export type VisualState = 'working' | 'busy' | 'stopped' | 'error';
export type DockerState = 'created' | 'running' | 'paused' | 'restarting' | 'exited' | 'dead';

export interface ContainerMetrics {
  cpu: number; // % normalizado por núcleo
  memBytes: number;
}

export interface ContainerView {
  id: string;
  name: string;
  image: string;
  project?: string;
  service?: string;
  roomId: string;
  dockerState: DockerState;
  health?: 'starting' | 'healthy' | 'unhealthy';
  exitCode?: number;
  restartCount?: number;
  startedAt?: string;
  finishedAt?: string;
  ports?: string[];
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
