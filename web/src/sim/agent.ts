/**
 * Agente = personagem + comportamento. Decide o que fazer a partir do estado do container
 * (visualState + CPU) e anima o rig. Regras:
 *   error   → corre para a mesa e entra em pânico
 *   stopped → vai dormir no sofá (ou na mesa, se o sofá estiver cheio)
 *   busy    → corre para a mesa e digita rápido
 *   working → CPU ≥ limiar: digita na mesa | CPU baixa (ocioso): café, janela, conversa, manias…
 */
import * as THREE from 'three';
import type { Rig } from '../characters/rig.js';
import type { CharacterProfile, Signature } from '../characters/types.js';
import type { ContainerView, VisualState } from '../model.js';
import type { DeskSlot, Spot, SpotKind } from '../office/layout.js';
import { SEAT_Y, SOFA_SEAT_Y } from '../office/furniture.js';
import { propMesh } from '../office/props3d.js';
import type { P2 } from './nav.js';

export type Pose =
  | 'stand' | 'type' | 'sleep' | 'panic' | 'drink' | 'look' | 'talk' | 'stretch'
  | 'flex' | 'point' | 'film' | 'guard' | 'watch' | 'dance';

type Held = 'mug' | 'prop' | null;

type Task =
  | { kind: 'go'; to: P2; run: boolean; label: string }
  | { kind: 'act'; pose: Pose; dur: number; face?: number; sitY?: number; at?: P2; label: string; held?: Held; speed?: number; release?: Spot };

export interface World {
  findPath(from: P2, to: P2): P2[];
  claimSpot(kinds: SpotKind[], who: string): Spot | undefined;
  releaseSpot(s: Spot): void;
  randomFree(): P2;
  agents(): readonly Agent[];
}

export const IDLE_CPU = 2; // % abaixo do qual o serviço é considerado ocioso
const HIP = 8 * 0.075;

const LABEL: Record<Signature, string> = {
  patrol: 'Vigiando a porta',
  flex: 'Mostrando os músculos',
  'watch-tv': 'Assistindo TV',
  'point-dashboard': 'Analisando o painel',
  film: 'Filmando o escritório',
  pace: 'Andando pela sala',
  dance: 'Dançando',
  photo: 'Tirando fotos',
  shelf: 'Procurando um livro',
  window: 'Olhando pela janela',
  coffee: 'Tomando café',
  whiteboard: 'Rabiscando no quadro',
  print: 'Esperando a impressão',
};

export class Agent {
  readonly id: string;
  visual: VisualState = 'working';
  cpu = 0;
  activity = '';
  bubble = '';
  data!: ContainerView;

  private tasks: Task[] = [];
  private cur: Task | undefined;
  private path: P2[] = [];
  private actT = 0;
  private walkPhase = 0;
  private moving = 0; // 0 parado · 1 andando · 2 correndo
  private rotY = 0;
  private sitting: number | null = null;
  private pose: Pose = 'stand';
  private held: Held = null;
  private readonly mug: THREE.Object3D;
  private readonly heldProp: THREE.Object3D;
  private lookAt: number | null = null; // ângulo para virar a cabeça (conversa)
  private rand: () => number;

  constructor(
    readonly rig: Rig,
    readonly profile: CharacterProfile,
    readonly desk: DeskSlot,
    private readonly world: World,
    seed: number,
  ) {
    this.id = profile.id + ':' + desk.x.toFixed(2) + desk.z.toFixed(2);
    this.rand = mulberry32(seed);
    rig.root.position.set(desk.seat.x, 0, desk.seat.z);
    this.mug = propMesh({ kind: 'mug', color: '#f5f5f5' }, 0.6);
    this.heldProp = propMesh(profile.prop, 0.55);
    for (const o of [this.mug, this.heldProp]) {
      o.visible = false;
      o.position.set(0, -0.06, 0.08);
      rig.handR.add(o);
    }
    this.sitAtDesk();
  }

  get position(): THREE.Vector3 {
    return this.rig.root.position;
  }

  get atDesk(): boolean {
    return this.sitting !== null && this.near(this.desk.seat, 0.05);
  }

  /** Atualiza dados do container. Mudanças de estado interrompem o plano atual. */
  setData(c: ContainerView): void {
    this.data = c;
    const prevVisual = this.visual;
    const wasIdle = this.visual === 'working' && this.cpu < IDLE_CPU;
    this.visual = c.visualState;
    this.cpu = c.metrics?.cpu ?? 0;
    const isIdle = this.visual === 'working' && this.cpu < IDLE_CPU;
    if (prevVisual !== this.visual || (wasIdle && !isIdle && this.visual === 'working')) this.replan();
  }

  replan(): void {
    if (this.cur?.kind === 'act' && this.cur.release) this.world.releaseSpot(this.cur.release);
    for (const t of this.tasks) if (t.kind === 'act' && t.release) this.world.releaseSpot(t.release);
    this.tasks = [];
    this.cur = undefined;
  }

  /** Interlocutor chega: vira a cabeça para quem está falando por alguns segundos. */
  listenTo(from: P2, seconds: number): void {
    const dx = from.x - this.position.x, dz = from.z - this.position.z;
    this.lookAt = Math.atan2(dx, dz);
    this.listenT = seconds;
  }
  private listenT = 0;

  update(dt: number, t: number): void {
    if (!this.cur) {
      if (!this.tasks.length) this.decide();
      this.cur = this.tasks.shift();
      this.actT = 0;
      if (this.cur?.kind === 'go') {
        this.standUp();
        this.path = this.world.findPath(this.position, this.cur.to);
      }
    }
    const task = this.cur;
    if (task?.kind === 'go') this.stepWalk(dt, task);
    else if (task?.kind === 'act') this.stepAct(dt, task);

    if (this.listenT > 0) {
      this.listenT -= dt;
      if (this.listenT <= 0) this.lookAt = null;
    }
    this.animate(dt, t);
  }

  /* ───────── Decisão ───────── */

  private decide(): void {
    const seat = this.desk.seat;
    const p = this.profile;
    const say = (k: VisualState | 'idle'): string => pick(p.bubbles?.[k] ?? [], this.rand);
    switch (this.visual) {
      case 'error':
        this.bubble = this.data?.reason ?? say('error');
        this.goDesk(true, 'Correndo para a mesa');
        this.tasks.push({ kind: 'act', pose: 'panic', dur: Infinity, at: seat, face: 0, label: 'Em pânico!' });
        return;
      case 'stopped': {
        this.bubble = 'Zzz…';
        const sofa = this.world.claimSpot(['sofa'], this.id);
        if (sofa) {
          this.tasks.push({ kind: 'go', to: sofa, run: false, label: 'Indo descansar' });
          this.tasks.push({ kind: 'act', pose: 'sleep', dur: Infinity, at: sofa, face: sofa.face, sitY: SOFA_SEAT_Y, label: 'Dormindo no sofá', release: sofa });
        } else {
          this.goDesk(false, 'Voltando para a mesa');
          this.tasks.push({ kind: 'act', pose: 'sleep', dur: Infinity, at: seat, face: 0, sitY: SEAT_Y, label: 'Cochilando na mesa' });
        }
        return;
      }
      case 'busy':
        this.bubble = say('busy');
        this.goDesk(true, 'Correndo para a mesa');
        this.tasks.push({ kind: 'act', pose: 'type', dur: 12, at: seat, face: 0, sitY: SEAT_Y, speed: 22, label: 'Digitando sem parar' });
        return;
      case 'working':
        break;
    }

    if (this.cpu >= IDLE_CPU) {
      this.bubble = '';
      this.goDesk(false, 'Voltando ao trabalho');
      this.tasks.push({ kind: 'act', pose: 'type', dur: 6 + this.rand() * 10, at: seat, face: 0, sitY: SEAT_Y, speed: 11, label: 'Trabalhando' });
      return;
    }

    // Ocioso: escolhe uma atividade com pesos (as manias do perfil pesam mais).
    const sig = p.behavior?.signature ?? [];
    const options: Array<[number, () => boolean]> = [
      [3, () => this.planDesk()],
      [2, () => this.planSpot(['coffee'], 'drink', 'Tomando café', 'mug')],
      [1.5, () => this.planSpot(['window'], 'look', 'Olhando pela janela')],
      [1, () => this.planSpot(['cooler'], 'drink', 'Bebendo água')],
      [1, () => this.planSpot(['shelf'], 'look', 'Procurando um livro')],
      [1.5, () => this.planChat()],
      [1, () => this.planStretch()],
      [0.6, () => this.planSpot(['printer'], 'look', LABEL.print)],
      [0.6, () => this.planSpot(['whiteboard'], 'point', LABEL.whiteboard)],
      ...sig.map((s): [number, () => boolean] => [3.5, () => this.planSignature(s)]),
    ];
    for (let tries = 0; tries < 4; tries++) {
      const total = options.reduce((a, [w]) => a + w, 0);
      let r = this.rand() * total;
      for (const [w, fn] of options) {
        r -= w;
        if (r <= 0) {
          if (fn()) {
            this.bubble = this.rand() < 0.35 ? say('idle') : '';
            return;
          }
          break;
        }
      }
    }
    this.planDesk();
  }

  private goDesk(run: boolean, label: string): void {
    if (!this.near(this.desk.seat, 0.05)) this.tasks.push({ kind: 'go', to: this.desk.seat, run, label });
  }

  private planDesk(): boolean {
    this.goDesk(false, 'Voltando para a mesa');
    this.tasks.push({ kind: 'act', pose: 'type', dur: 5 + this.rand() * 8, at: this.desk.seat, face: 0, sitY: SEAT_Y, speed: 5, label: 'Navegando sem pressa' });
    return true;
  }

  private planSpot(kinds: SpotKind[], pose: Pose, label: string, held: Held = null): boolean {
    const s = this.world.claimSpot(kinds, this.id);
    if (!s) return false;
    this.tasks.push({ kind: 'go', to: s, run: false, label: 'Caminhando' });
    this.tasks.push({ kind: 'act', pose, dur: 5 + this.rand() * 6, at: s, face: s.face, sitY: s.sit ? SOFA_SEAT_Y : undefined, label, held, release: s });
    return true;
  }

  private planStretch(): boolean {
    this.goDesk(false, 'Voltando para a mesa');
    const beside = { x: this.desk.seat.x - 0.55, z: this.desk.seat.z - 0.1 };
    this.tasks.push({ kind: 'go', to: beside, run: false, label: 'Levantando' });
    this.tasks.push({ kind: 'act', pose: 'stretch', dur: 3 + this.rand() * 2, at: beside, face: 0, label: 'Se espreguiçando' });
    return true;
  }

  private planChat(): boolean {
    const others = this.world.agents().filter((a) => a !== this && a.visual === 'working' && a.atDesk);
    const other = others[Math.floor(this.rand() * others.length)];
    if (!other) return false;
    const spot = { x: other.desk.seat.x + 0.62, z: other.desk.seat.z + 0.05 };
    const dur = 5 + this.rand() * 4;
    this.tasks.push({ kind: 'go', to: spot, run: false, label: `Indo falar com ${other.profile.displayName}` });
    this.tasks.push({ kind: 'act', pose: 'talk', dur, at: spot, face: -Math.PI / 2, label: `Conversando com ${other.profile.displayName}` });
    this.onArrive = () => other.listenTo(spot, dur);
    return true;
  }
  private onArrive: (() => void) | null = null;

  private planSignature(s: Signature): boolean {
    switch (s) {
      case 'patrol': {
        const d = this.world.claimSpot(['door'], this.id);
        if (!d) return false;
        this.tasks.push({ kind: 'go', to: d, run: false, label: 'Indo para a porta' });
        this.tasks.push({ kind: 'act', pose: 'guard', dur: 7 + this.rand() * 6, at: d, face: d.face, label: LABEL.patrol, release: d });
        return true;
      }
      case 'flex': {
        const p = this.world.randomFree();
        this.tasks.push({ kind: 'go', to: p, run: false, label: 'Procurando plateia' });
        this.tasks.push({ kind: 'act', pose: 'flex', dur: 4 + this.rand() * 3, at: p, face: 0, label: LABEL.flex, held: 'prop' });
        return true;
      }
      case 'watch-tv': {
        const s2 = this.world.claimSpot(['sofa', 'tv'], this.id);
        if (!s2) return false;
        this.tasks.push({ kind: 'go', to: s2, run: false, label: 'Indo para a TV' });
        this.tasks.push({ kind: 'act', pose: 'watch', dur: 8 + this.rand() * 8, at: s2, face: s2.face, sitY: s2.sit ? SOFA_SEAT_Y : undefined, label: LABEL['watch-tv'], held: 'prop', release: s2 });
        return true;
      }
      case 'point-dashboard':
        return this.planSpot(['dashboard'], 'point', LABEL['point-dashboard']);
      case 'film': {
        const p = this.world.randomFree();
        this.tasks.push({ kind: 'go', to: p, run: false, label: 'Procurando um ângulo' });
        this.tasks.push({ kind: 'act', pose: 'film', dur: 5 + this.rand() * 4, at: p, face: this.rand() * Math.PI * 2, label: LABEL.film, held: 'prop' });
        return true;
      }
      case 'pace': {
        for (let i = 0; i < 3; i++) this.tasks.push({ kind: 'go', to: this.world.randomFree(), run: false, label: LABEL.pace });
        return true;
      }
      case 'dance': {
        const p = this.world.randomFree();
        this.tasks.push({ kind: 'go', to: p, run: false, label: 'Procurando a pista' });
        this.tasks.push({ kind: 'act', pose: 'dance', dur: 5 + this.rand() * 4, at: p, face: 0, label: LABEL.dance });
        return true;
      }
      case 'photo': {
        const p = this.world.randomFree();
        this.tasks.push({ kind: 'go', to: p, run: false, label: 'Procurando um ângulo' });
        this.tasks.push({ kind: 'act', pose: 'film', dur: 4 + this.rand() * 3, at: p, face: this.rand() * Math.PI * 2, label: LABEL.photo });
        return true;
      }
      case 'shelf': return this.planSpot(['shelf'], 'look', LABEL.shelf);
      case 'window': return this.planSpot(['window'], 'look', LABEL.window);
      case 'coffee': return this.planSpot(['coffee'], 'drink', LABEL.coffee, 'mug');
      case 'whiteboard': return this.planSpot(['whiteboard'], 'point', LABEL.whiteboard);
      case 'print': return this.planSpot(['printer'], 'look', LABEL.print);
    }
  }

  /* ───────── Execução ───────── */

  private stepWalk(dt: number, task: Extract<Task, { kind: 'go' }>): void {
    this.activity = task.label;
    this.setHeld(null);
    this.pose = 'stand';
    const speed = (task.run ? 2.4 : 1.1) * (this.profile.behavior?.walkSpeed ?? 1);
    let remaining = speed * dt;
    while (remaining > 0 && this.path.length) {
      const target = this.path[0]!;
      const dx = target.x - this.position.x, dz = target.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1e-3) { this.path.shift(); continue; }
      this.rotY = turnTowards(this.rotY, Math.atan2(dx, dz), dt * 10);
      const step = Math.min(dist, remaining);
      this.position.x += (dx / dist) * step;
      this.position.z += (dz / dist) * step;
      remaining -= step;
      if (step === dist) this.path.shift();
    }
    this.moving = task.run ? 2 : 1;
    this.walkPhase += dt * speed * 6.5;
    if (!this.path.length) {
      this.moving = 0;
      this.cur = undefined;
      this.onArrive?.();
      this.onArrive = null;
    }
  }

  private stepAct(dt: number, task: Extract<Task, { kind: 'act' }>): void {
    if (this.actT === 0) {
      if (task.at) this.position.set(task.at.x, 0, task.at.z);
      if (task.sitY !== undefined) this.sitting = task.sitY;
      if (task.face !== undefined) this.rotY = task.face;
    }
    this.actT += dt;
    this.moving = 0;
    this.pose = task.pose;
    this.activity = task.label;
    this.typeSpeed = task.speed ?? 10;
    this.setHeld(task.held ?? null);
    if (this.actT >= task.dur) {
      if (task.release) this.world.releaseSpot(task.release);
      this.cur = undefined;
      if (task.pose === 'drink' || task.pose === 'watch') this.bubble = '';
    }
  }
  private typeSpeed = 10;

  private sitAtDesk(): void {
    this.position.set(this.desk.seat.x, 0, this.desk.seat.z);
    this.sitting = SEAT_Y;
    this.rotY = 0;
  }

  private standUp(): void {
    if (this.sitting !== null) {
      this.sitting = null;
      // Sai da cadeira para trás/lado para não atravessar a mesa.
      if (this.near(this.desk.seat, 0.05)) this.position.z -= 0.15;
    }
  }

  private setHeld(h: Held): void {
    if (h === this.held) return;
    this.held = h;
    this.mug.visible = h === 'mug';
    this.heldProp.visible = h === 'prop';
  }

  private near(p: P2, eps: number): boolean {
    return Math.abs(p.x - this.position.x) < eps && Math.abs(p.z - this.position.z) < eps;
  }

  /* ───────── Animação ───────── */

  private animate(dt: number, t: number): void {
    const r = this.rig;
    const k = 1 - Math.exp(-dt * 12);
    const j = { legL: 0, legR: 0, armLx: 0, armRx: 0, armLz: 0, armRz: 0, headX: 0, headY: 0, bodyX: 0, lift: 0 };
    const sit = this.sitting !== null && this.moving === 0;

    if (this.moving) {
      const amp = this.moving === 2 ? 1 : 0.6;
      const s = Math.sin(this.walkPhase);
      j.legL = amp * s;
      j.legR = -amp * s;
      j.armLx = -amp * 0.85 * s;
      j.armRx = amp * 0.85 * s;
      j.lift = Math.abs(Math.cos(this.walkPhase)) * (this.moving === 2 ? 0.06 : 0.03);
      j.bodyX = this.moving === 2 ? 0.18 : 0.03;
    } else {
      if (sit) j.legL = j.legR = -Math.PI / 2;
      j.armLz = -0.06;
      j.armRz = 0.06;
      j.lift = Math.sin(t * 2) * 0.004;
      switch (this.pose) {
        case 'type': {
          const s = this.typeSpeed;
          j.armLx = -1.15 + 0.12 * Math.max(0, Math.sin(t * s));
          j.armRx = -1.15 + 0.12 * Math.max(0, Math.sin(t * s + Math.PI));
          j.headX = 0.12;
          j.headY = 0.3;
          break;
        }
        case 'sleep':
          j.bodyX = 0.35;
          j.headX = 0.55 + Math.sin(t * 1.3) * 0.04;
          j.armLx = j.armRx = -0.9;
          break;
        case 'panic':
          j.armLx = -2.9 + 0.35 * Math.sin(t * 14);
          j.armRx = -2.9 + 0.35 * Math.sin(t * 14 + 1.5);
          j.armLz = -0.3;
          j.armRz = 0.3;
          j.lift = Math.abs(Math.sin(t * 7)) * 0.13;
          j.headY = 0.35 * Math.sin(t * 9);
          break;
        case 'drink': {
          const sip = Math.max(0, Math.sin(t * 1.1));
          j.armRx = -1.1 - 0.9 * sip;
          j.headX = -0.2 * sip;
          break;
        }
        case 'look':
          j.armLx = j.armRx = 0.35;
          j.armLz = 0.15;
          j.armRz = -0.15;
          j.headY = 0.25 * Math.sin(t * 0.5);
          break;
        case 'talk':
          j.armRx = -0.5 - 0.45 * Math.abs(Math.sin(t * 3));
          j.armLx = -0.3 - 0.3 * Math.abs(Math.sin(t * 2.2 + 1));
          j.headX = 0.08 * Math.sin(t * 4);
          break;
        case 'stretch':
          j.armLx = j.armRx = -2.9 + 0.2 * Math.sin(t * 2);
          j.bodyX = -0.12;
          break;
        case 'flex': {
          const pump = Math.sin(t * 3);
          j.armLz = -(2.2 + 0.2 * pump);
          j.armRz = 2.2 + 0.2 * pump;
          j.lift = 0.02 * Math.max(0, pump);
          break;
        }
        case 'point':
          j.armRx = -1.55 + 0.08 * Math.sin(t * 2);
          j.headY = -0.2;
          break;
        case 'film':
          j.armLx = j.armRx = -1.35;
          j.armLz = 0.2;
          j.armRz = -0.2;
          break;
        case 'guard':
          j.armLx = j.armRx = -1.2;
          j.armLz = 0.65;
          j.armRz = -0.65;
          j.headY = 0.4 * Math.sin(t * 0.6);
          break;
        case 'watch': {
          j.bodyX = sit ? -0.12 : 0;
          const eat = Math.max(0, Math.sin(t * 0.9));
          j.armRx = -0.4 - 1.2 * eat;
          j.armLx = -0.4;
          break;
        }
        case 'dance': {
          const beat = t * 7;
          j.armLz = -(1.2 + 0.9 * Math.max(0, Math.sin(beat)));
          j.armRz = 1.2 + 0.9 * Math.max(0, Math.sin(beat + Math.PI));
          j.legL = 0.35 * Math.max(0, Math.sin(beat));
          j.legR = 0.35 * Math.max(0, Math.sin(beat + Math.PI));
          j.lift = Math.abs(Math.sin(beat)) * 0.06;
          j.headY = 0.25 * Math.sin(beat / 2);
          break;
        }
        case 'stand':
          break;
      }
    }
    if (this.lookAt !== null && !this.moving) j.headY = clampAngle(this.lookAt - this.rotY, 1.1);

    r.legL.rotation.x += (j.legL - r.legL.rotation.x) * k;
    r.legR.rotation.x += (j.legR - r.legR.rotation.x) * k;
    r.armL.rotation.x += (j.armLx - r.armL.rotation.x) * k;
    r.armR.rotation.x += (j.armRx - r.armR.rotation.x) * k;
    r.armL.rotation.z += (j.armLz - r.armL.rotation.z) * k;
    r.armR.rotation.z += (j.armRz - r.armR.rotation.z) * k;
    r.head.rotation.x += (j.headX - r.head.rotation.x) * k;
    r.head.rotation.y += (j.headY - r.head.rotation.y) * k;
    r.body.rotation.x += (j.bodyX - r.body.rotation.x) * k;
    const baseY = sit ? (this.sitting ?? 0) - HIP + 0.02 : 0;
    r.body.position.y += (baseY + j.lift - r.body.position.y) * Math.min(1, k * 1.5);
    r.root.rotation.y = this.rotY;
    if (r.cape) {
      const target = this.moving ? 0.25 + 0.25 * this.moving : sit ? 0.45 : 0.05;
      r.cape.rotation.x += (target + Math.sin(t * 3) * 0.03 - r.cape.rotation.x) * k;
    }
    r.setFace(this.pose === 'sleep' ? 'closed' : this.pose === 'panic' ? 'shock' : 'open');
  }
}

/* ───────── utilitários ───────── */

function turnTowards(cur: number, target: number, maxStep: number): number {
  const d = clampAngle(target - cur, Math.PI);
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}

function clampAngle(a: number, lim: number): number {
  const w = Math.atan2(Math.sin(a), Math.cos(a));
  return Math.max(-lim, Math.min(lim, w));
}

function pick<T>(list: readonly T[], rand: () => number): T | '' {
  return list.length ? list[Math.floor(rand() * list.length)]! : '';
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
