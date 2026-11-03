import type { VisualState } from '../model.js';

export type SkinTone = 'light' | 'fair' | 'tan' | 'brown' | 'dark';
export type Build = 'normal' | 'muscle' | 'slim';
export type HairStyle =
  | 'short' | 'spiky' | 'messy' | 'long' | 'bun' | 'curly' | 'side' | 'bald' | 'ponytail';
export type TopStyle = 'tee' | 'hoodie' | 'labcoat' | 'suit';

export type HeadGearKind =
  | 'beret' | 'cap' | 'fedora' | 'hardhat' | 'headband' | 'headset' | 'headphones' | 'laurel';
export type FaceGearKind = 'glasses' | 'bigglasses' | 'sunglasses' | 'mask';
export type FacialKind = 'mustache' | 'beard' | 'stubble' | 'eyebags';
export type BodyGearKind =
  | 'cape' | 'shield' | 'tie' | 'badge' | 'scarf' | 'apron' | 'camera' | 'stethoscope' | 'vest';
export type PropKind =
  | 'popcorn' | 'clapper' | 'tv' | 'chart' | 'dumbbell' | 'mug' | 'plant' | 'papers' | 'box'
  | 'magnifier' | 'ticket' | 'vinyl' | 'photos' | 'robot' | 'bolt' | 'database' | 'cone' | 'anvil'
  | 'newspaper' | 'binoculars' | 'bell' | 'safe' | 'folders' | 'stopwatch' | 'speedometer' | 'chain'
  | 'shredder' | 'juice' | 'flowchart' | 'torch' | 'clipboard' | 'container' | 'hdd';
export type DeskStyle = 'wood' | 'dark' | 'white' | 'metal';
export type DeskDecor = 'lamp' | 'frame' | 'figurine' | 'sticky' | 'books' | 'cactus' | 'trophy' | 'snacks' | 'poster';

/** Manias de cada personagem quando está ocioso. */
export type Signature =
  | 'patrol' | 'flex' | 'watch-tv' | 'point-dashboard' | 'film' | 'pace' | 'dance' | 'photo'
  | 'shelf' | 'window' | 'coffee' | 'whiteboard' | 'print';

/** Interface desenhada no monitor (metade esquerda da tela). */
export type ScreenTheme = 'media-grid' | 'calendar' | 'list' | 'dns' | 'dashboard' | 'terminal';

export interface Gear<K extends string> {
  kind: K;
  color: string;
  color2?: string;
}

/**
 * Perfil visual + comportamental de um serviço — dado puro (config/characters.json).
 * Nenhum serviço tem código próprio: tudo é combinação de partes e comportamentos.
 */
export interface CharacterProfile {
  id: string;
  displayName: string;
  /** "Cargo" do personagem no escritório. */
  role: string;
  match: { names?: string[]; images?: string[] };
  skin: SkinTone;
  build: Build;
  hair: { style: HairStyle; color: string };
  top: { style: TopStyle; color: string; color2?: string };
  pants?: string;
  head?: Gear<HeadGearKind>;
  face?: Gear<FaceGearKind>;
  facial?: Gear<FacialKind>[];
  body?: Gear<BodyGearKind>[];
  /** Objeto característico em cima da mesa (e que às vezes ele carrega). */
  prop: Gear<PropKind>;
  desk?: { style: DeskStyle; decor?: DeskDecor[] };
  screen?: ScreenTheme;
  behavior?: { signature?: Signature[]; walkSpeed?: number };
  accent: string;
  bubbles?: Partial<Record<VisualState | 'idle', string[]>>;
}
