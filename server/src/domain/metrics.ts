/**
 * Cálculo de CPU/memória a partir do endpoint de stats do Docker (one-shot) e histerese do
 * estado "ocupado". Lógica pura — testada em server/test/metrics.test.ts.
 */

/** Subconjunto do JSON de /containers/{id}/stats que usamos. */
export interface RawStats {
  cpu_stats?: {
    cpu_usage?: { total_usage?: number; percpu_usage?: number[] };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  memory_stats?: {
    usage?: number;
    limit?: number;
    stats?: Record<string, number | undefined>;
  };
}

export interface CpuSample {
  total: number;
  system: number;
}

export interface Usage {
  /** % de UM núcleo (docker stats). */
  cpu: number;
  /** CPU normalizada para a regra de "ocupado": % do limite de CPU (NanoCpus) ou de 1 núcleo. */
  cpuNorm: number;
  memBytes: number;
  memLimit: number;
  memPct: number;
}

export function cpuSample(s: RawStats): CpuSample | undefined {
  const total = s.cpu_stats?.cpu_usage?.total_usage;
  const system = s.cpu_stats?.system_cpu_usage;
  return total === undefined || system === undefined ? undefined : { total, system };
}

/**
 * CPU% = (Δcpu_container / Δcpu_sistema) × núcleos × 100 (fórmula do docker stats).
 * `prev` é a amostra anterior que NÓS guardamos (no modo one-shot o Docker não manda precpu).
 */
export function usage(s: RawStats, prev: CpuSample | undefined, nanoCpus = 0): Usage {
  const cur = cpuSample(s);
  const cores = s.cpu_stats?.online_cpus || s.cpu_stats?.cpu_usage?.percpu_usage?.length || 1;
  let cpu = 0;
  if (cur && prev) {
    const dc = cur.total - prev.total;
    const ds = cur.system - prev.system;
    if (dc > 0 && ds > 0) cpu = (dc / ds) * cores * 100;
  }
  const limitCores = nanoCpus > 0 ? nanoCpus / 1e9 : 1;
  const m = s.memory_stats ?? {};
  // cgroup v2: inactive_file; cgroup v1: total_inactive_file (cache que o kernel libera)
  const inactive = m.stats?.inactive_file ?? m.stats?.total_inactive_file ?? 0;
  const memBytes = Math.max(0, (m.usage ?? 0) - inactive);
  const memLimit = m.limit ?? 0;
  return {
    cpu: round1(cpu),
    cpuNorm: round1(cpu / limitCores),
    memBytes,
    memLimit,
    memPct: memLimit > 0 ? round1((memBytes / memLimit) * 100) : 0,
  };
}

export interface BusyState {
  busy: boolean;
  high: number;
  low: number;
}

export const BUSY = { enterCpu: 70, exitCpu: 50, samples: 3, memPct: 90 } as const;

/**
 * Histerese: entra em "ocupado" após 3 amostras seguidas ≥ 70% (ou memória ≥ 90% do limite)
 * e só sai após 3 amostras seguidas < 50% — evita o personagem ficar piscando.
 */
export function nextBusy(st: BusyState, cpuNorm: number, memPct: number, cfg = BUSY): BusyState {
  const memHigh = memPct >= cfg.memPct;
  const high = cpuNorm >= cfg.enterCpu ? st.high + 1 : 0;
  const low = cpuNorm < cfg.exitCpu ? st.low + 1 : 0;
  let busy = st.busy;
  if (!busy && (high >= cfg.samples || memHigh)) busy = true;
  else if (busy && low >= cfg.samples && !memHigh) busy = false;
  return { busy, high, low };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
