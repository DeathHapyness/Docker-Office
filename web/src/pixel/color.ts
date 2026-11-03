/** Clareia (amount > 0) ou escurece (amount < 0) uma cor #rrggbb. amount ∈ [-1, 1]. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const ch = (shift: number): string => {
    const c = (n >> shift) & 0xff;
    return Math.round(c + (target - c) * t).toString(16).padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** Hash estável (FNV-1a) para derivar variações determinísticas a partir de um nome. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
