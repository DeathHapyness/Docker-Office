/**
 * Calendário do escritório: data atual (ou simulada com ?date=) e a data comemorativa da vez.
 * Tudo em horário local do navegador.
 */

export type Holiday =
  | 'anonovo' | 'carnaval' | 'pascoa' | 'namorados' | 'junina' | 'independencia' | 'halloween' | 'natal';

export const HOLIDAYS: readonly Holiday[] = [
  'anonovo', 'carnaval', 'pascoa', 'namorados', 'junina', 'independencia', 'halloween', 'natal',
];

export const HOLIDAY_NAME: Record<Holiday, string> = {
  anonovo: 'Ano Novo', carnaval: 'Carnaval', pascoa: 'Páscoa', namorados: 'Dia dos Namorados',
  junina: 'Festa Junina', independencia: 'Independência', halloween: 'Halloween', natal: 'Natal',
};

/** Relógio com deslocamento opcional: `?date=2026-12-31T23:59:30` faz o escritório "viver" nessa data. */
export class OfficeClock {
  private offset = 0;

  /** Aceita AAAA-MM-DD ou AAAA-MM-DDTHH:MM[:SS] (horário local). Retorna false se for inválido. */
  simulate(spec: string): boolean {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(spec.trim());
    if (!m) return false;
    const [, y, mo, d, h, mi, s] = m;
    const at = new Date(Number(y), Number(mo) - 1, Number(d), Number(h ?? 12), Number(mi ?? 0), Number(s ?? 0));
    if (Number.isNaN(at.getTime())) return false;
    this.offset = at.getTime() - Date.now();
    return true;
  }

  get simulated(): boolean {
    return this.offset !== 0;
  }

  now(): Date {
    return new Date(Date.now() + this.offset);
  }
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easter(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const DAY = 86_400_000;
const dayStart = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * Data comemorativa ativa no dia (ou null). Janelas:
 * Ano Novo 26/12–02/01 · Carnaval sáb–quarta de cinzas · Páscoa semana santa · Namorados 10–12/06 ·
 * Junina resto de junho e julho até dia 15 · Independência 01–07/09 · Halloween 24–31/10 · Natal 01–25/12.
 */
export function holidayOn(d: Date): Holiday | null {
  const y = d.getFullYear(), mo = d.getMonth() + 1, day = d.getDate();
  if ((mo === 12 && day >= 26) || (mo === 1 && day <= 2)) return 'anonovo';
  const today = dayStart(d);
  const e = easter(y).getTime();
  if (today >= e - 50 * DAY && today <= e - 46 * DAY) return 'carnaval';
  if (today >= e - 7 * DAY && today <= e) return 'pascoa';
  if (mo === 6 && day >= 10 && day <= 12) return 'namorados';
  if (mo === 6 || (mo === 7 && day <= 15)) return 'junina';
  if (mo === 9 && day <= 7) return 'independencia';
  if (mo === 10 && day >= 24) return 'halloween';
  if (mo === 12) return 'natal';
  return null;
}

export interface Countdown {
  /** Ano que vai começar. */
  year: number;
  /** Milissegundos até a virada (0 no dia 1º). */
  ms: number;
  /** true no dia 1º de janeiro: o painel comemora em vez de contar. */
  arrived: boolean;
}

/** Contagem para o Ano Novo: só existe nos 7 dias antes da virada (25/12 00:00 → 31/12 23:59:59) e no dia 1º. */
export function newYearCountdown(d: Date): Countdown | null {
  const y = d.getFullYear();
  if (d.getMonth() === 0 && d.getDate() === 1) return { year: y, ms: 0, arrived: true };
  const target = new Date(y + 1, 0, 1).getTime();
  const ms = target - d.getTime();
  if (ms > 7 * DAY || ms <= 0) return null;
  return { year: y + 1, ms, arrived: false };
}
