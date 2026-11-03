/**
 * Personagem para containers sem perfil em characters.json: montado de forma determinística a
 * partir do nome (mesmo container → mesmo visual sempre). Assim todo container aparece com
 * nome próprio, mesmo os que ninguém cadastrou.
 */
import type { ContainerView } from '../model.js';
import { hash } from '../pixel/color.js';
import type {
  Build, CharacterProfile, DeskDecor, DeskStyle, HairStyle, PropKind, ScreenTheme, Signature, SkinTone, TopStyle,
} from './types.js';

const SKINS: SkinTone[] = ['light', 'fair', 'tan', 'brown', 'dark'];
const BUILDS: Build[] = ['normal', 'normal', 'slim', 'muscle'];
const HAIRS: HairStyle[] = ['short', 'spiky', 'messy', 'long', 'bun', 'curly', 'side', 'bald', 'ponytail'];
const HAIR_COLORS = ['#1c1714', '#3b2a20', '#6b4423', '#a0522d', '#d4a017', '#e8d5a3', '#9ca3af', '#7c3aed'];
const TOPS: TopStyle[] = ['tee', 'tee', 'hoodie', 'suit', 'labcoat'];
const PROPS: PropKind[] = ['mug', 'papers', 'box', 'plant', 'clipboard', 'folders', 'container', 'hdd', 'robot', 'stopwatch'];
const DESKS: DeskStyle[] = ['wood', 'dark', 'white', 'metal'];
const DECOR: DeskDecor[] = ['lamp', 'frame', 'figurine', 'sticky', 'books', 'cactus', 'snacks'];
const SCREENS: ScreenTheme[] = ['terminal', 'list', 'dashboard'];
const SIGS: Signature[] = ['coffee', 'window', 'pace', 'whiteboard', 'print', 'shelf'];

const pick = <T>(list: readonly T[], n: number): T => list[n % list.length]!;

/** HSL → #rrggbb (o rig trabalha com hex). */
function hsl(h: number, s: number, l: number): string {
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** "speedtest-tracker" → "Speedtest Tracker". */
export function prettyName(name: string): string {
  return name.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) || name;
}

export function genericProfile(c: Pick<ContainerView, 'name' | 'image'>): CharacterProfile {
  const h = hash(c.name);
  const h2 = hash(c.name + '#');
  const accent = hsl(h % 360, 0.65, 0.55);
  const name = prettyName(c.name);
  return {
    id: `generic:${c.name}`,
    displayName: name,
    role: 'Recém-contratado',
    match: { names: [c.name] },
    skin: pick(SKINS, h >>> 3),
    build: pick(BUILDS, h >>> 6),
    hair: { style: pick(HAIRS, h >>> 9), color: pick(HAIR_COLORS, h >>> 13) },
    top: { style: pick(TOPS, h >>> 17), color: accent, color2: hsl((h % 360 + 180) % 360, 0.5, 0.45) },
    pants: pick(['#2f3542', '#1e3a5f', '#3f3f46', '#4b3621'], h2),
    face: (h2 >>> 4) % 3 === 0 ? { kind: 'glasses', color: '#1f2937' } : undefined,
    prop: { kind: pick(PROPS, h2 >>> 7), color: accent },
    desk: { style: pick(DESKS, h2 >>> 11), decor: [pick(DECOR, h2 >>> 14), pick(DECOR, h2 >>> 18)] },
    screen: pick(SCREENS, h2 >>> 21),
    behavior: { signature: [pick(SIGS, h2 >>> 24), pick(SIGS, h2 >>> 27)] },
    accent,
    bubbles: {
      idle: ['Ainda estou aprendendo onde fica o café', 'Alguém sabe a senha do Wi-Fi?', `Oi, eu sou o ${name}!`],
      working: ['Rodando liso', 'Primeira semana, dando o meu melhor'],
      busy: ['Muita coisa ao mesmo tempo!'],
      stopped: ['Fui pra casa'],
      error: ['Socorro!'],
    },
  };
}
