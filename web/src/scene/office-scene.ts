/**
 * Cena 3D do escritório: monta tudo a partir do layout, roda o loop e expõe
 * câmeras pré-definidas + câmera livre (OrbitControls, 360° inclusive por baixo).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ContainerView } from '../model.js';
import type { CharacterProfile } from '../characters/types.js';
import { buildRig } from '../characters/rig.js';
import { resolveProfile } from '../characters/resolve.js';
import { computeLayout, type OfficeLayout, type Spot, type SpotKind } from '../office/layout.js';
import {
  bigPlant, bookshelf, buildWorkstation, coffeeCounter, dashboardWall, door, printer, sofa, wallClock, wallTv,
  wallPoster, waterCooler, whiteboard, windowPane, type Workstation,
} from '../office/furniture.js';
import { Agent, type World } from '../sim/agent.js';
import { hash } from '../pixel/color.js';
import { U, voxelMaterial } from '../three/voxel.js';
import { posterTexture } from '../screens/posters.js';
import { EventLog } from '../state/event-log.js';
import { MetricsBoard, NewsTv, WallClock, skylineTexture, type OfficeEvent, type OfficeSnapshot } from '../screens/wall.js';

export type CameraPreset = 'free' | 'top' | 'iso' | 'side' | 'below' | 'follow';

interface Entry {
  agent: Agent;
  ws: Workstation;
  label: HTMLElement;
  bubble: HTMLElement;
  history: number[];
}

const HISTORY = 60; // amostras de CPU (a cada 2 s → 2 min)
const STATE_COLOR = { working: '#22c55e', busy: '#f59e0b', stopped: '#111318', error: '#ef4444' } as const;
export class OfficeScene {
  readonly renderer: THREE.WebGLRenderer;
  private readonly labels: CSS2DRenderer;
  private readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly timer = new THREE.Timer();
  private readonly hemi = new THREE.HemisphereLight('#f4f6ff', '#6b6359', 1.35);
  private readonly sun = new THREE.DirectionalLight('#fff3e0', 1.9);
  private office = new THREE.Group();
  private layout!: OfficeLayout;
  private entries = new Map<string, Entry>();
  private walls: Array<{ obj: THREE.Object3D; hidden: (c: THREE.Vector3) => boolean }> = [];
  private floorMats: THREE.MeshLambertMaterial[] = [];
  private membership = '';
  private engine: 'connected' | 'reconnecting' | 'down' = 'connected';
  private preset: CameraPreset = 'iso';
  private follow: Agent | null = null;
  private tween: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; k: number } | null = null;
  private pixel = false;
  private readonly news = new NewsTv();
  private readonly board = new MetricsBoard();
  private readonly clockFace = new WallClock();
  private readonly sky = skylineTexture();
  /** Log de tudo que mudou nos containers e no Engine (painel "Log" e ticker da TV). */
  readonly log = new EventLog();
  private readonly events: OfficeEvent[] = [];
  /** Modo papel de parede: limite de FPS (0 = sem limite) e órbita lenta automática. */
  private fpsCap = 0;
  private lastRender = -1;
  private frameNo = 0;
  private sampleT = 2; // primeira amostra já no primeiro quadro

  /** Chamado quando o mouse passa sobre um personagem (null ao sair). */
  onHover: (data: ContainerView | null, agent: Agent | null, ev: PointerEvent) => void = () => {};

  constructor(private readonly host: HTMLElement, private readonly profiles: readonly CharacterProfile[]) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // atualizada 1 a cada 3 quadros no loop
    this.renderer.domElement.className = 'gl';
    host.append(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels';
    host.append(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 250);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI; // permite ir por baixo do chão
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 90;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('start', () => {
      this.tween = null;
      if (this.preset !== 'follow') this.preset = 'free';
    });

    this.scene.background = new THREE.Color('#1b1e2b');
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.office);

    this.timer.connect(document);
    this.log.subscribe((e) => {
      if (e.kind === 'system') return;
      this.events.push({ at: e.at, text: e.who ? `${e.who} ${e.text}` : e.text });
      if (this.events.length > 30) this.events.shift();
    });
    this.setPixelMode(false);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.bindPointer();
    this.renderer.setAnimationLoop((ts) => this.frame(ts));
  }

  /* ───────── Dados ───────── */

  sync(containers: readonly ContainerView[]): void {
    const usable = containers
      .map((c) => ({ c, p: resolveProfile(c, this.profiles) }))
      .filter((x): x is { c: ContainerView; p: CharacterProfile } => !!x.p)
      .sort((a, b) => a.p.displayName.localeCompare(b.p.displayName));
    const key = usable.map(({ c }) => c.id).join(',');
    if (key !== this.membership) {
      this.membership = key;
      this.rebuild(usable);
    }
    for (const { c } of usable) {
      const e = this.entries.get(c.id);
      if (!e) continue;
      e.agent.setData(c);
      e.label.dataset.state = c.visualState;
    }
    this.log.observe(usable.map(({ c, p }) => ({ c, who: { name: p.displayName, accent: p.accent } })));
  }

  setEngine(status: 'connected' | 'reconnecting' | 'down'): void {
    if (status !== this.engine) this.log.engine(status);
    this.engine = status;
    this.host.dataset.engine = status;
  }

  setPixelMode(on: boolean): void {
    this.pixel = on;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(on ? Math.max(0.5, dpr / 2.5) : dpr);
    this.renderer.domElement.style.imageRendering = on ? 'pixelated' : 'auto';
    this.resize();
  }

  /** Papel de parede: sem interface, FPS limitado e câmera girando devagar. */
  setWallpaper(fps: number, orbit: boolean): void {
    this.fpsCap = fps;
    this.controls.autoRotate = orbit;
    this.controls.autoRotateSpeed = 0.35;
  }

  get pixelMode(): boolean {
    return this.pixel;
  }

  /* ───────── Câmera ───────── */

  setPreset(p: CameraPreset, agent?: Agent): void {
    this.preset = p;
    if (p === 'follow' && agent) this.follow = agent;
    if (p !== 'follow') this.follow = null;
    if (!this.layout || p === 'free') return;
    const { width: W, depth: D } = this.layout;
    const c = new THREE.Vector3(W / 2, 0.6, D / 2);
    const span = Math.max(W, D);
    if (p === 'follow') {
      const a = this.follow;
      if (!a) return;
      // Sentado: por cima do ombro, para ver a tela; andando: de frente.
      const t = a.atDesk ? deskView(a) : a.position.clone().setY(1);
      const off = a.atDesk ? new THREE.Vector3(0.55, 0.75, -1.45) : new THREE.Vector3(1.8, 1.7, 2.8);
      this.animateTo(t.clone().add(off), t);
      return;
    }
    const pos = {
      top: new THREE.Vector3(W / 2, span * 1.15, D / 2 + 0.01),
      iso: new THREE.Vector3(W / 2 + span * 0.36, span * 0.55, D + span * 0.28),
      side: new THREE.Vector3(-span * 0.5, 2.4, D / 2),
      below: new THREE.Vector3(W / 2, -span * 0.5, D / 2 + span * 0.3),
    }[p];
    this.animateTo(pos, c);
  }

  /** Segue o personagem de um container (usado por ?focus= na URL). */
  focusOn(containerId: string): boolean {
    const e = this.entries.get(containerId);
    if (e) this.setPreset('follow', e.agent);
    return !!e;
  }

  get currentPreset(): CameraPreset {
    return this.preset;
  }

  private animateTo(pos: THREE.Vector3, target: THREE.Vector3): void {
    this.tween = { from: this.camera.position.clone(), to: pos, tFrom: this.controls.target.clone(), tTo: target, k: 0 };
  }

  /* ───────── Construção ───────── */

  private rebuild(usable: Array<{ c: ContainerView; p: CharacterProfile }>): void {
    const firstBuild = !this.layout;
    const oldHistory = new Map([...this.entries].map(([id, e]) => [id, e.history]));
    this.scene.remove(this.office);
    this.office.traverse((o) => {
      if (o instanceof CSS2DObject) o.element.remove();
    });
    this.office = new THREE.Group();
    this.scene.add(this.office);
    this.entries.clear();
    this.walls = [];

    const L = (this.layout = computeLayout(usable.map(({ c }) => c.id)));
    this.buildRoom(L);

    const world: World = {
      findPath: (a, b) => L.nav.findPath(a, b),
      claimSpot: (kinds: SpotKind[], who: string) => {
        const free = L.spots.filter((s) => kinds.includes(s.kind) && !s.takenBy);
        const s = free[Math.floor(Math.random() * free.length)];
        if (s) s.takenBy = who;
        return s;
      },
      releaseSpot: (s: Spot) => { s.takenBy = undefined; },
      randomFree: () => L.nav.randomFree(),
      agents: () => [...this.entries.values()].map((e) => e.agent),
    };

    for (const { c, p } of usable) {
      const slot = L.desks.get(c.id);
      if (!slot) continue;
      const ws = buildWorkstation(p, c.name);
      ws.group.position.set(slot.x, 0, slot.z);
      this.office.add(ws.group);

      const rig = buildRig(p);
      rig.hit.userData.containerId = c.id;
      this.office.add(rig.root);
      const agent = new Agent(rig, p, slot, world, hash(c.name));
      agent.setData(c);

      const label = document.createElement('div');
      label.className = 'label';
      label.dataset.state = c.visualState;
      label.style.setProperty('--accent', p.accent);
      label.innerHTML = '<p class="bubble"></p><div class="tag"><i class="dot"></i><b></b></div>';
      label.querySelector('b')!.textContent = p.displayName;
      const obj = new CSS2DObject(label);
      obj.position.set(0, 9.5 * U, 0);
      obj.center.set(0.5, 1);
      rig.head.add(obj);
      this.entries.set(c.id, {
        agent, ws, label, bubble: label.querySelector('.bubble') as HTMLElement, history: oldHistory.get(c.id) ?? [],
      });
    }

    this.bakeStatic(new Set([...this.entries.values()].map((e) => e.agent.rig.root)));

    const span = Math.max(L.width, L.depth);
    this.sun.position.set(L.width * 0.2, span * 1.1, L.depth * 0.95);
    this.sun.target.position.set(L.width / 2, 0, L.depth / 2);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -span * 0.75;
    sc.right = sc.top = span * 0.75;
    sc.far = span * 4;
    sc.updateProjectionMatrix();
    if (firstBuild) {
      this.setPreset('iso');
      if (this.tween) {
        this.camera.position.copy(this.tween.to);
        this.controls.target.copy(this.tween.tTo);
        this.tween = null;
      }
    }
  }

  /**
   * Funde todas as malhas voxel estáticas (mesas, divisórias, cadeiras, objetos, copa) numa só
   * por tipo de sombra: ~400 draw calls viram 2. Personagens e paredes (que somem com a câmera)
   * ficam de fora.
   */
  private bakeStatic(skip: Set<THREE.Object3D>): void {
    for (const w of this.walls) skip.add(w.obj);
    this.office.updateMatrixWorld(true);
    const groups = { cast: [] as THREE.BufferGeometry[], flat: [] as THREE.BufferGeometry[] };
    const doomed: THREE.Mesh[] = [];
    const walk = (o: THREE.Object3D): void => {
      if (skip.has(o)) return;
      if (o instanceof THREE.Mesh && o.material === voxelMaterial) {
        groups[o.castShadow ? 'cast' : 'flat'].push(o.geometry.clone().applyMatrix4(o.matrixWorld));
        doomed.push(o);
      }
      for (const c of o.children) walk(c);
    };
    walk(this.office);
    for (const m of doomed) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    for (const [kind, list] of Object.entries(groups)) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, voxelMaterial);
      mesh.castShadow = kind === 'cast';
      mesh.receiveShadow = true;
      mesh.name = `static-${kind}`;
      this.office.add(mesh);
    }
  }

  private buildRoom(L: OfficeLayout): void {
    const { width: W, depth: D, wallHeight: H } = L;
    this.floorMats = [];

    // Piso: carpete em placas na área de trabalho, madeira na copa
    const work = D - L.lounge;
    const mkFloor = (tex: THREE.Texture, d: number, z: number, y: number): void => {
      const m = new THREE.MeshLambertMaterial({ map: tex, transparent: true });
      this.floorMats.push(m);
      const f = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, d), m);
      f.position.set(W / 2, y, z);
      f.receiveShadow = true;
      this.office.add(f);
    };
    mkFloor(floorTexture('carpet', W / 1, work / 1), work, L.lounge + work / 2, -0.05);
    mkFloor(floorTexture('wood', W / 1.6, L.lounge / 1.6), L.lounge, L.lounge / 2, -0.049);

    // Paredes (somem quando ficam entre a câmera e o escritório)
    const wallMat = new THREE.MeshLambertMaterial({ color: '#e7e5df' });
    const bandMat = new THREE.MeshLambertMaterial({ color: '#c9d3dc' });
    const trimMat = new THREE.MeshLambertMaterial({ color: '#55606e' });
    const mkWall = (w: number, d: number, x: number, z: number, hidden: (c: THREE.Vector3) => boolean): THREE.Group => {
      const g = new THREE.Group();
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
      wall.position.set(x, H / 2, z);
      wall.receiveShadow = true;
      const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.9, d + 0.01), bandMat);
      band.position.set(x, 0.45, z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.12, d + 0.04), trimMat);
      base.position.set(x, 0.06, z);
      const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.06, d + 0.04), trimMat);
      top.position.set(x, H, z);
      g.add(wall, band, base, top);
      this.office.add(g);
      this.walls.push({ obj: g, hidden });
      return g;
    };
    const back = mkWall(W + 0.4, 0.2, W / 2, -0.1, (c) => c.z < 0);
    const front = mkWall(W + 0.4, 0.2, W / 2, D + 0.1, (c) => c.z > D);
    const left = mkWall(0.2, D, -0.1, D / 2, (c) => c.x < 0);
    const right = mkWall(0.2, D, W + 0.1, D / 2, (c) => c.x > W);

    const posters = new Map<number, THREE.Texture>();
    for (const f of L.fixtures) {
      let obj: THREE.Object3D;
      let parent: THREE.Object3D = this.office;
      let x = f.x;
      switch (f.kind) {
        case 'sofa': obj = sofa('#3f5c7a'); break;
        case 'tv': obj = wallTv(this.news.texture); break;
        case 'coffee': obj = coffeeCounter(); break;
        case 'cooler': obj = waterCooler(); break;
        case 'dashboard': obj = dashboardWall(this.board.texture); break;
        case 'shelf': obj = bookshelf(); break;
        case 'plant': obj = bigPlant(); break;
        case 'whiteboard': obj = whiteboard(); parent = back; break;
        case 'printer': obj = printer(); break;
        case 'clock': obj = wallClock(this.clockFace.texture); parent = back; break;
        case 'window': obj = windowPane(1.9, 1.4, this.sky); obj.position.y = 0.95; parent = left; x = 0.01; break;
        case 'door': obj = door(); parent = right; x = W - 0.01; break;
        case 'poster': {
          const v = f.variant ?? 0;
          let tex = posters.get(v % 12);
          if (!tex) posters.set(v % 12, (tex = posterTexture(v)));
          obj = wallPoster(tex, v);
          obj.position.y = 1.85;
          parent = { back, left, right, front }[f.wall ?? 'back'];
          break;
        }
      }
      obj.position.x = x;
      obj.position.z = f.z;
      obj.rotation.y = f.rotY;
      parent.add(obj);
    }
  }

  /* ───────── Loop ───────── */

  private frame(ts: number): void {
    if (this.fpsCap > 0) {
      if (this.lastRender >= 0 && ts - this.lastRender < 1000 / this.fpsCap - 2) return;
      this.lastRender = ts;
    }
    this.timer.update(ts);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const t = this.timer.getElapsed();
    if (!this.layout) return;
    const up = this.engine === 'connected';

    // Amostra CPU para os gráficos a cada 2 s
    this.sampleT += dt;
    const sample = this.sampleT >= 2;
    if (sample) this.sampleT = 0;

    const peers = [...this.entries.values()]
      .filter((e) => e.history.length > 1)
      .sort((x, y) => (y.agent.data.metrics?.cpu ?? 0) - (x.agent.data.metrics?.cpu ?? 0))
      .slice(0, 4)
      .map((e) => ({ name: e.agent.profile.displayName, accent: e.agent.profile.accent, history: e.history }));
    for (const e of this.entries.values()) {
      const a = e.agent;
      a.update(dt, t);
      if (sample) {
        e.history.push(a.data.metrics?.cpu ?? 0);
        if (e.history.length > HISTORY) e.history.shift();
      }
      e.ws.screen.update({
        name: a.profile.displayName, accent: a.profile.accent, theme: a.profile.screen ?? 'terminal',
        data: a.data, atDesk: a.atDesk, history: e.history, engineUp: up, peers,
      }, t, this.camera.position.distanceToSquared(a.position) > 81 ? 2 : 0.5); // longe (> 9 m): ilegível, redesenha menos
      e.ws.status.color.set(up ? STATE_COLOR[a.visual] : '#111318');
      if (e.bubble.textContent !== a.bubble) e.bubble.textContent = a.bubble;
    }

    const snap: OfficeSnapshot = {
      engineUp: up,
      events: this.events,
      entries: [...this.entries.values()].map(({ agent: a, history }) => ({
        name: a.profile.displayName, accent: a.profile.accent, visual: a.visual,
        cpu: a.data.metrics?.cpu ?? 0, memBytes: a.data.metrics?.memBytes ?? 0, startedAt: a.data.startedAt, history,
      })),
    };
    this.news.update(snap, t);
    this.board.update(snap, t);
    this.clockFace.update(snap, t);

    // Câmera
    if (this.tween) {
      this.tween.k = Math.min(1, this.tween.k + dt / 0.9);
      const k = 1 - Math.pow(1 - this.tween.k, 3);
      this.camera.position.lerpVectors(this.tween.from, this.tween.to, k);
      this.controls.target.lerpVectors(this.tween.tFrom, this.tween.tTo, k);
      if (this.tween.k >= 1) this.tween = null;
    } else if (this.preset === 'follow' && this.follow) {
      const f = this.follow;
      const target = f.atDesk ? deskView(f) : f.position.clone().setY(1);
      const delta = target.sub(this.controls.target).multiplyScalar(Math.min(1, dt * 4));
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    }
    this.controls.update(dt);

    const cam = this.camera.position;
    for (const w of this.walls) w.obj.visible = !w.hidden(cam);
    for (const m of this.floorMats) {
      m.opacity = cam.y < 0 ? 0.25 : 1;
      m.depthWrite = cam.y >= 0;
    }

    const dim = up ? 1 : 0.25;
    this.hemi.intensity = 1.35 * dim;
    this.sun.intensity = 1.9 * dim;

    if (++this.frameNo % 3 === 0 || this.frameNo < 3) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  /* ───────── Mouse ───────── */

  private bindPointer(): void {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hovered: string | null = null;
    const pickAt = (ev: MouseEvent): Entry | undefined => {
      const r = this.renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const hits = ray.intersectObjects([...this.entries.values()].map((e) => e.agent.rig.hit), false);
      const id = hits[0]?.object.userData.containerId as string | undefined;
      return id ? this.entries.get(id) : undefined;
    };
    this.renderer.domElement.addEventListener('pointermove', (ev) => {
      const e = pickAt(ev);
      const id = e?.agent.data.id ?? null;
      if (id !== hovered) {
        if (hovered) this.entries.get(hovered)?.label.classList.remove('hover');
        e?.label.classList.add('hover');
        hovered = id;
      }
      this.renderer.domElement.style.cursor = e ? 'pointer' : '';
      this.onHover(e?.agent.data ?? null, e?.agent ?? null, ev);
    });
    this.renderer.domElement.addEventListener('pointerleave', (ev) => this.onHover(null, null, ev));
    this.renderer.domElement.addEventListener('click', (ev) => {
      const e = pickAt(ev);
      if (e) this.setPreset('follow', e.agent);
    });
  }

  private resize(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
  }
}

/** Ponto para onde a câmera olha quando o personagem está na mesa: a tela do monitor. */
function deskView(a: Agent): THREE.Vector3 {
  return new THREE.Vector3(a.desk.x + 0.35, 1.15, a.desk.z + 0.05);
}

/** Texturas de piso geradas em canvas (sem assets externos). Uma repetição = 1 m. */
function floorTexture(kind: 'carpet' | 'wood', rx: number, ry: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  if (kind === 'carpet') {
    // 4 placas de 50 cm com a trama alternada, como carpete de escritório
    for (let i = 0; i < 4; i++) {
      const x = (i % 2) * 32, y = Math.floor(i / 2) * 32;
      const alt = i === 0 || i === 3;
      c.fillStyle = alt ? '#5d6878' : '#626d7d';
      c.fillRect(x, y, 32, 32);
      c.fillStyle = 'rgb(255 255 255 / 0.04)';
      for (let k = 0; k < 32; k += 3) {
        if (alt) c.fillRect(x + k, y, 1, 32);
        else c.fillRect(x, y + k, 32, 1);
      }
    }
    c.fillStyle = 'rgb(0 0 0 / 0.12)';
    c.fillRect(0, 31, 64, 1);
    c.fillRect(31, 0, 1, 64);
  } else {
    const tones = ['#a47c56', '#9a7350', '#ad8660', '#97704c'];
    for (let r = 0; r < 4; r++) {
      for (let x = -((r * 23) % 40), k = r; x < 64; x += 40, k++) {
        c.fillStyle = tones[k % 4]!;
        c.fillRect(x, r * 16, 40, 16);
        c.fillStyle = 'rgb(0 0 0 / 0.18)';
        c.fillRect(x, r * 16, 1, 16);
      }
      c.fillStyle = 'rgb(0 0 0 / 0.15)';
      c.fillRect(0, r * 16 + 15, 64, 1);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  t.magFilter = THREE.NearestFilter;
  return t;
}
