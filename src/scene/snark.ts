import * as THREE from "three";
import { pxPerMetre } from "./farview";
import type { NftItem, Tx, TxKind } from "../data/types";
import { ZScan } from "../data/zscan";
import { blobTexture } from "./textures";
import { sayAt } from "./speech";
import { GRID, POSE, bubbleSprite, drawHat, drawVest, hatClear, lapSprite, legSprite, poseSprites, type Emote, type Hat, type HeadFit, type ItemKind, type PoseSpec, type Px } from "./sprites";

/** Parcel colours per transaction kind: restrained, readable at a glance. */
export const KIND_COLOR: Record<TxKind, string> = {
  shielded: "#3ee08f",
  migration: "#b07bff",
  shielding: "#8f7bff",
  deshielding: "#ffcf4a",
  transparent: "#ff9a3c",
  mixed: "#7fd3ff",
  coinbase: "#f4b728",
};

interface Art {
  texture: THREE.Texture;
  /** Clothing colour at the bottom of the bust (sRGB hex): trousers a shade darker, sleeves as is. */
  cloth: string;
  /** The face's colour (sRGB hex), for the hands. */
  skin: string;
  /** Which of the 26×26 portrait cells are drawn (row-major): where hats and vests may go. */
  mask?: Uint8Array;
  /** Copies of the portrait with a uniform painted on (see `dressedTexture`), by outfit. */
  dressed?: Map<string, THREE.Texture>;
}

const artCache = new Map<number, Promise<Art>>();

/**
 * The NFT exactly as minted, minus its flat black background: the portrait sits on a 26×26 grid
 * (20 px cells) over pure black, so black pixels connected to the border are made transparent.
 * Nothing else is touched.
 */
export function loadArt(id: number): Promise<Art> {
  let p = artCache.get(id);
  if (!p) {
    p = (async () => {
      // the image API rate-limits bursts (a 429 shows up as a CORS failure): a couple of retries
      // with a growing pause, so a busy moment doesn't leave people missing for the whole visit
      let res: Response | null = null;
      for (let k = 0; ; k++) {
        try {
          res = await fetch(ZScan.zkSnarkImage(id));
          if (res.ok || res.status === 404 || k >= 2) break;
        } catch (e) {
          if (k >= 2) throw e;
        }
        await new Promise((r) => setTimeout(r, 1500 * (k + 1) + Math.random() * 1000));
      }
      if (!res?.ok) throw new Error(`zkSNARK #${id}: HTTP ${res?.status}`);
      const bmp = await createImageBitmap(await res.blob());
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      const img = ctx.getImageData(0, 0, c.width, c.height);
      keyOutBackground(img);
      ctx.putImageData(img, 0, 0);
      // the art is pixel art on a 26×26 grid, drawn up with nearest filtering: four texels per cell
      // look the same as the 520 px original, at a 25th of the memory (100 people on the street
      // took 140 MB of textures and made phones run out)
      const small = document.createElement("canvas");
      small.width = small.height = GRID * 4;
      const sg = small.getContext("2d", { willReadFrequently: true })!;
      sg.imageSmoothingEnabled = false;
      const cell = c.width / GRID;
      for (let r = 0; r < GRID; r++)
        for (let q = 0; q < GRID; q++) {
          const k = (Math.floor((r + 0.5) * cell) * c.width + Math.floor((q + 0.5) * cell)) * 4;
          const a = img.data[k + 3];
          if (!a) continue;
          sg.fillStyle = `rgba(${img.data[k]},${img.data[k + 1]},${img.data[k + 2]},${a / 255})`;
          sg.fillRect(q * 4, r * 4, 4, 4);
        }
      // the full-size canvas is done with: let its memory go now, not whenever the collector
      // gets to it (iOS caps the memory of all canvases together, and a street full of new
      // people left a hundred of these lying about during the boot)
      c.width = c.height = 0;
      const texture = new THREE.CanvasTexture(small);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      const cloth = clothOf(img);
      return { texture, cloth, skin: skinOf(img, cloth), mask: cellMask(img) };
    })();
    artCache.set(id, p);
    p.catch(() => artCache.delete(id));
    void p.then((a) => artIds.set(a, id), () => {});
  }
  return p;
}

// Every transaction brings a new zkSNARK to the street, so over a long visit thousands of portraits
// were loaded and none ever let go (1 MB canvas + 1.4 MB of GPU texture each). Portraits are counted
// by the characters wearing them; the unused ones are kept for a while (people come back), then the
// oldest are released.
const artIds = new Map<Art, number>();
const artUsers = new Map<Art, number>();
const idleArt = new Set<Art>();
const IDLE_MAX = 160;
function holdArt(a: Art) {
  artUsers.set(a, (artUsers.get(a) ?? 0) + 1);
  idleArt.delete(a);
}
function releaseArt(a: Art) {
  const n = (artUsers.get(a) ?? 1) - 1;
  if (n > 0) return void artUsers.set(a, n);
  artUsers.delete(a);
  idleArt.add(a);
  for (const old of idleArt) {
    if (idleArt.size <= IDLE_MAX) break;
    idleArt.delete(old);
    const id = artIds.get(old);
    artIds.delete(old);
    if (id !== undefined) artCache.delete(id);
    old.texture.dispose();
    for (const t of old.dressed?.values() ?? []) t.dispose();
    old.dressed = undefined;
  }
}

function keyOutBackground(img: ImageData) {
  const { width: w, height: h, data } = img;
  const isBg = (i: number) => data[i] <= 6 && data[i + 1] <= 6 && data[i + 2] <= 6;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    if (!isBg(p * 4)) continue;
    data[p * 4 + 3] = 0;
    const x = p % w,
      y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
}

/** The portrait's cells that are drawn (alpha at each cell's centre). */
function cellMask(img: ImageData) {
  const { width: w, data } = img;
  const cell = w / GRID;
  const m = new Uint8Array(GRID * GRID);
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++) m[r * GRID + c] = data[(Math.floor((r + 0.5) * cell) * w + Math.floor((c + 0.5) * cell)) * 4 + 3] > 127 ? 1 : 0;
  return m;
}

/**
 * The forehead's span on this portrait: the run of drawn cells through the face's centre on the
 * cheek row (16, under any glasses or mask), clamped to the shared head template.
 */
function headFit(a: Art): HeadFit {
  // no mask (a portrait made in code): the shared template
  const on = (c: number, r: number) => (a.mask ? a.mask[r * GRID + c] === 1 : c >= 9 && c <= 20);
  const row = 16;
  let R = 15;
  while (R < GRID - 1 && on(R + 1, row)) R++;
  let L = 15;
  while (L > 0 && on(L - 1, row)) L--;
  return { L: Math.min(11, Math.max(9, L)), R: Math.min(21, Math.max(18, R)) };
}

/** What a zkSNARK wears over its own portrait: a uniform hat (and its colour), a hi-vis vest. */
export interface Outfit {
  hat?: Hat | null;
  color?: string;
  vest?: string | null;
}

/**
 * The portrait with a uniform painted on, cell for cell: the old headwear cleared where the hat
 * goes, the hat drawn to this head's width (sprites.ts drawHat), a vest on the bust. Shared by
 * everyone wearing the same portrait and outfit; freed with the portrait.
 */
function dressedTexture(a: Art, o: Outfit): THREE.Texture {
  const key = `${o.hat ?? ""}|${o.color ?? ""}|${o.vest ?? ""}`;
  a.dressed ??= new Map();
  let t = a.dressed.get(key);
  if (t) return t;
  const src = a.texture.image as HTMLCanvasElement;
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  const cell = c.width / GRID;
  const px: Px = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(Math.round(x * cell), Math.round(y * cell), Math.round(w * cell), Math.round(h * cell));
  };
  if (o.hat) {
    const fit = headFit(a);
    const clr = hatClear(o.hat);
    g.clearRect(clr.col * cell, 0, c.width - clr.col * cell, clr.rows * cell);
    // the tip of an old cap's peak, out in front on the forehead row
    if (clr.rows === 11) g.clearRect((fit.R + 1) * cell, 11 * cell, c.width, cell);
    drawHat(px, o.hat, fit, o.color);
  }
  if (o.vest) drawVest(px, (cc, r) => (a.mask ? a.mask[r * GRID + cc] === 1 : cc >= 6 && cc <= 21 && r >= 19), o.vest);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  a.dressed.set(key, t);
  return t;
}

/**
 * Seated people are drawn as if a little nearer the camera than they are: depth only (same size,
 * same place on screen), so a chair's back or a bench's rail right behind the cut-out no longer
 * slices through it from the side. `bias` (metres) is the snark's own uniform; 0 when standing.
 */
const NEAR_GLSL = `
  if (uNear > 0.0) {
    vec4 nq = projectionMatrix * vec4(mvPosition.xy, mvPosition.z + min(uNear, -mvPosition.z * 0.5), 1.0);
    gl_Position.z = nq.z / nq.w * gl_Position.w;
  }`;
function nearer(mat: THREE.Material, bias: { value: number }) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNear = bias;
    sh.vertexShader = "uniform float uNear;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>" + NEAR_GLSL);
  };
  mat.customProgramCacheKey = () => "snark-near";
}
/** A stand-in camera for the seat finder's raycasts (Snark.findSeat). */
const SEAT_CAM = new THREE.PerspectiveCamera();
/** How much nearer seated people are drawn (see NEAR_GLSL). */
const SEAT_NEAR = 0.32;

/** The lower cheek, where every portrait shows its face; void faces fall back on the sleeve. */
function skinOf(img: ImageData, cloth: string) {
  const { width: w, data } = img;
  const cell = w / GRID;
  const i = (Math.floor(17.5 * cell) * w + Math.floor(17.5 * cell)) * 4;
  if (data[i + 3] === 0) return cloth;
  const c = new THREE.Color().setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, THREE.SRGBColorSpace);
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  if (hsl.l < 0.07) return `#${new THREE.Color(cloth).multiplyScalar(1.25).getHexString()}`;
  return `#${[0, 1, 2].map((k) => data[i + k].toString(16).padStart(2, "0")).join("")}`;
}

function clothOf(img: ImageData) {
  const { width: w, height: h, data } = img;
  // bottom rows, right of centre (the bust; the dissolve trail is on the left)
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let y = h - 30; y < h - 4; y += 3)
    for (let x = Math.floor(w * 0.5); x < w * 0.8; x += 5) {
      const i = (y * w + x) * 4;
      if (data[i + 3] === 0) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  if (!n) return "#3e3c4a";
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

const BODY = 1.75;
/** One portrait pixel in world units: legs, hands and items are drawn on the same grid. */
const PX = BODY / GRID;
/** Height of the hips: legs are 8 px, the bust covers their top 2 px. */
const LEG_H = 6 * PX;
const shadowTex = blobTexture();
/** Where the bust's centre sits on the portrait (the dissolve trail fills the left). */
const BUST_X = 2.5 * PX;
/** Below this many screen pixels per metre (the overview), the small parts are skipped. */
const FAR_PX_PER_M = 4.5;

function pixelPlane(t: { texture: THREE.Texture; w: number; h: number }, z: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(t.w * PX, t.h * PX), new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, alphaTest: 0.5 }));
  m.position.z = z;
  return m;
}
/** Free a pixel plane's own geometry and material (its sprite texture is shared and kept). */
function dropPlane(m: THREE.Mesh) {
  m.parent?.remove(m);
  m.geometry.dispose();
  (m.material as THREE.Material).dispose();
}
const snap = (v: number) => Math.round(v / PX) * PX;
/** The arms' plane, laid on the portrait's grid (POSE in portrait cells; row 32 is the ground). */
const POSE_GEO = new THREE.PlaneGeometry(POSE.w * PX, POSE.h * PX).translate((POSE.x0 + POSE.w / 2 - GRID / 2) * PX, (32 - POSE.y0 - POSE.h / 2) * PX, 0);
const tmpQ = new THREE.Quaternion();

/** Silhouette glow drawn behind the selected sprite: the art's alpha, filled with one colour. */
function glowMaterial(map: THREE.Texture, near: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, color: { value: new THREE.Color(0.35, 0.9, 1.6) }, uNear: near },
    vertexShader: `uniform float uNear; varying vec2 vUv; void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition; ${NEAR_GLSL} }`,
    fragmentShader:
      "uniform sampler2D map; uniform vec3 color; varying vec2 vUv; void main(){ float a = texture2D(map, vUv).a; if (a < 0.5) discard; gl_FragColor = vec4(color, 1.0); }",
    toneMapped: false,
  });
}

export type SnarkState =
  | "arriving"
  | "shopping"
  | "waiting"
  | "boarding"
  | "riding"
  | "leaving"
  | "resident"
  /** Big visible amount: arrives by car, picks the case up, rides to the block in the car. */
  | "vip"
  | "chauffeured"
  /** One of the rarest zkSNARKs, escorting a limousine passenger. */
  | "guard";

export class Snark {
  readonly root = new THREE.Group();
  /** Camera-facing part: the paper cut-out. */
  readonly visual = new THREE.Group();
  readonly body: THREE.Mesh;
  item: NftItem | null = null;
  txs: Tx[] = [];
  state: SnarkState = "arriving";
  /** Slot in the waiting crowd. */
  slot = -1;
  private legs: THREE.Mesh[] = [];
  /** Arms, fists and what they hold: a layer behind the bust and one over it (sprites.ts POSE). */
  private hold = new THREE.Group();
  private armBack: THREE.Mesh;
  private armFront: THREE.Mesh;
  private poseKey = "";
  private itemsShown = true;
  private umbrellaColor: string | null = null;
  private swing: -1 | 0 | 1 = 0;
  private strapOn = false;
  private cloth: string;
  /** Trouser colour (legs, and the lap when seated). */
  private trouser: string;
  /** Depth bias of every part of the cut-out (see `nearer`): set while seated. */
  private readonly near = { value: 0 };
  private skin: string;
  /** Overrides the carried item (briefcases for big visible amounts). */
  carry: ItemKind | null = null;
  /** The car a VIP travels in. */
  ride: "taxi" | "limo" | null = null;
  /** Collection rank, shown for bodyguards. */
  rank: number | null = null;
  /** Home district and shop (for carriers), the bus it rides, a job title for locals. */
  district: import("./city").DistrictKey | null = null;
  shop: import("./city").ShopSite | null = null;
  bus: import("./bus").BlockBus | null = null;
  role: string | null = null;
  /** Staff who walk into loading bays and behind counters skip the wall collisions. */
  noClip = false;
  /** Inside a place: finds the way round walls and furniture for every walk (interior/path.ts). */
  router: { routeAll(from: THREE.Vector3, points: THREE.Vector3[]): THREE.Vector3[] } | null = null;
  private glow: THREE.Mesh;
  private ring: THREE.Mesh;
  private shadow: THREE.Mesh;
  private path: THREE.Vector3[] = [];
  private arrived: (() => void) | null = null;
  private speed = 1.7;
  /** Above 1 when running for the bus. */
  rush = 1;
  /** Which way to look while standing (e.g. toward the head of the queue). */
  faceDir: THREE.Vector3 | null = null;
  /** Stopped where they are (someone is talking to them): the walk resumes after. */
  paused = false;
  private phase = Math.random() * 10;
  private facing = 1;
  private walking = false;
  private idleTurnAt = 0;
  private stuck = 0;
  private lastDist = Infinity;
  /** Seconds left walking through people and props: set when jammed, so nobody stays wedged. */
  private ghostFor = 0;

  constructor(
    readonly id: number,
    art: Art,
  ) {
    this.art = art;
    holdArt(art);
    const mat = new THREE.MeshBasicMaterial({ map: art.texture, transparent: true, alphaTest: 0.5 });
    nearer(mat, this.near);
    this.body = new THREE.Mesh(new THREE.PlaneGeometry(BODY, BODY), mat);
    this.body.position.y = LEG_H + BODY / 2;
    this.body.userData.snark = this;
    this.root.userData.snarkRef = this;
    this.glow = new THREE.Mesh(this.body.geometry, glowMaterial(art.texture, this.near));
    this.glow.position.copy(this.body.position);
    this.glow.position.z = -0.02;
    this.glow.scale.setScalar(1.09);
    this.glow.visible = false;
    this.cloth = art.cloth;
    this.skin = art.skin ?? art.cloth;
    const trouser = new THREE.Color(art.cloth).multiplyScalar(0.62);
    this.trouser = `#${trouser.getHexString()}`;
    const leg = legSprite(this.trouser);
    for (const dx of [BUST_X - 3 * PX, BUST_X + 3 * PX]) {
      const l = pixelPlane(leg, -0.01);
      // on the portrait's own pixel columns (10–14 and 16–20)
      l.position.set(dx, 4 * PX, -0.01);
      l.userData.x = l.position.x;
      this.legs.push(l);
      this.visual.add(l);
    }
    this.armBack = new THREE.Mesh(POSE_GEO, new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5 }));
    this.armFront = new THREE.Mesh(POSE_GEO, new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5 }));
    for (const m of [this.armBack, this.armFront, ...this.legs]) nearer(m.material as THREE.Material, this.near);
    // the far arm behind the legs and the bust, the near one over everything
    this.armBack.position.z = -0.015;
    this.armFront.position.z = 0.035;
    this.hold.add(this.armBack, this.armFront);
    this.visual.add(this.glow, this.body, this.hold);
    this.refreshPose();
    this.root.add(this.visual);

    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(0.15, 0.015, 0);
    this.root.add(this.shadow);

    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.66, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 2), toneMapped: false, transparent: true, opacity: 0.9 }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(0.15, 0.02, 0);
    this.ring.visible = false;
    this.root.add(this.ring);
    // seen from far up (the whole-city map) a zkSNARK is a few pixels tall: its legs, arms and
    // shadow are under a pixel each, so they are skipped there (five draw calls of six, per person)
    this.body.onBeforeRender = (r, _s, cam) => {
      const far = pxPerMetre(r, cam) < FAR_PX_PER_M;
      if (far !== this.far) {
        this.far = far;
        this.applyDetail();
      }
    };
  }

  /** Seen from far away (see the constructor), and whether its legs show at all (seated, in a bus). */
  private far = false;
  private legsOn = true;
  private applyDetail() {
    const near = !this.far;
    for (const l of this.legs) l.visible = near && this.legsOn;
    if (this.lap) this.lap.visible = near && !!this.seat;
    this.shadow.visible = near;
    // an open umbrella still reads from up there (a dot of colour over the crowd)
    this.hold.visible = near || !!this.umbrellaColor;
  }

  private readonly art: Art;
  private disposed = false;
  /**
   * Gone for good (left the street): free its own geometries and materials and let its portrait
   * go back to the pool. Safe to call twice; shared things (arm planes, shadow, sprites) are kept.
   */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.parent?.remove(this.root);
    if (this.said) {
      this.said.parent?.remove(this.said);
      this.said = null;
    }
    const free = (o: THREE.Object3D) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry !== POSE_GEO) m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    };
    this.root.traverse(free);
    // the visual may sit in a bus seat rather than under the root
    if (this.visual.parent !== this.root) {
      this.visual.traverse(free);
      this.visual.parent?.remove(this.visual);
    }
    releaseArt(this.art);
  }

  get isWalking() {
    return this.walking;
  }

  get name() {
    return `zkSNARK #${this.id}`;
  }

  /** Walk through `points`; resolves on arrival at the last one. */
  walk(points: THREE.Vector3[], speed = 1.7): Promise<void> {
    this.path = (this.router ? this.router.routeAll(this.root.position, points) : points).map((p) => p.clone());
    this.speed = speed;
    this.walking = true;
    this.arrived?.();
    return new Promise((r) => (this.arrived = r));
  }

  setTxs(txs: Tx[]) {
    this.txs = txs;
    this.redrawHold();
  }

  /** Redraw what the hands hold (after `carry` or the transactions change). */
  redrawHold() {
    this.refreshPose();
  }

  /** Items stay hidden until they are picked up at the shop (the hands swing free meanwhile). */
  showParcels(on: boolean) {
    this.itemsShown = on;
    this.refreshPose();
  }

  /** Arms and hands for what it holds now: the parcel against the belly, a cup at the chest, the umbrella over the head… */
  private refreshPose() {
    const items: ItemKind[] = !this.itemsShown ? [] : this.carry ? [this.carry] : this.txs.slice(0, 2).map((t) => t.kind);
    const strap = !!this.bus && this.state === "riding" && !this.seated;
    this.strapOn = strap;
    const spec: PoseSpec = { sleeve: this.cloth, skin: this.skin, items, umbrella: this.umbrellaColor, swing: this.swing, strap };
    const key = `${items.join("+")}|${spec.umbrella}|${spec.swing}|${strap}`;
    if (key === this.poseKey) return;
    this.poseKey = key;
    const s = poseSprites(spec);
    (this.armFront.material as THREE.MeshBasicMaterial).map = s.front.texture;
    (this.armBack.material as THREE.MeshBasicMaterial).map = s.back.texture;
    (this.armFront.material as THREE.MeshBasicMaterial).needsUpdate = true;
    (this.armBack.material as THREE.MeshBasicMaterial).needsUpdate = true;
  }

  setSelected(on: boolean) {
    this.glow.visible = on;
    this.ring.visible = on;
  }

  setVisible(on: boolean) {
    this.root.visible = on;
  }

  /** Detach the cut-out (for seating it in the bus). */
  takeVisual() {
    this.root.remove(this.visual);
    this.visual.position.set(0, 0, 0);
    this.legsOn = false;
    this.applyDetail();
    return this.visual;
  }

  /** Open an umbrella over the head (rain), or fold it away: the near hand grips its shaft. */
  setUmbrella(color: string | null) {
    this.umbrellaColor = color;
    this.refreshPose();
    this.applyDetail();
  }

  /** A police cap on the head (fitted to this portrait's head, its own headwear taken off). */
  setCap(color?: string) {
    this.wear({ hat: "police", color });
  }

  /**
   * Put on a uniform: a hat (police cap, hard hat, chef's toque, laurel) and/or a hi-vis vest,
   * painted onto this zkSNARK's own portrait so it fits that head and moves with it. `{}` takes it off.
   */
  wear(o: Outfit) {
    const t = o.hat || o.vest ? dressedTexture(this.art, o) : this.art.texture;
    (this.body.material as THREE.MeshBasicMaterial).map = t;
    (this.glow.material as THREE.ShaderMaterial).uniforms.map.value = t;
  }

  private said: THREE.Sprite | null = null;
  /** Words in a speech bubble over the head (never mirrored, whichever way it faces). */
  say(text: string, seconds = 3, tone: import("./speech").Tone = "talk") {
    if (this.said) this.root.remove(this.said);
    this.said = sayAt(this.root, text, tone, LEG_H + BODY + 0.3, seconds);
  }

  private bubble: THREE.Mesh | null = null;
  private bubbleFor = 0;
  private bubbleAge = 0;
  /** A pixel speech bubble over the head for a few seconds: a reaction, never words. */
  emote(e: Emote, seconds = 2.6) {
    if (this.bubble) dropPlane(this.bubble);
    const b = pixelPlane(bubbleSprite(e), 0.06);
    b.position.set(snap(BUST_X + 9 * PX), LEG_H + BODY + 3 * PX, 0.06);
    b.scale.setScalar(0.01);
    this.bubble = b;
    this.bubbleFor = seconds;
    this.bubbleAge = 0;
    this.visual.add(b);
  }

  private perchH = 0;
  /**
   * Sit on a bench or a chair whose seat is `height` above the ground the root stands on; 0 stands
   * back up. `feet`: how far below the seat the feet rest (a scooter's footboard), else the ground.
   */
  perch(height: number, feet = height) {
    this.perchH = height;
    this.seatPose(height ? { lift: height, floor: feet } : null);
  }

  get isPerched() {
    return this.perchH !== 0 || this.seekSeat > 0;
  }

  /** Frames left before looking for the seat (perchNear); 0: not looking. */
  private seekSeat = 0;
  /**
   * Sit on whatever seat is under or right behind it (a bench, a sofa, a chair: found by looking
   * down round the spot once the place is built), shifted onto it; nothing there: on the floor,
   * legs out. For people placed by hand next to the furniture of a room, root on the floor.
   */
  perchNear() {
    this.perch(0.45);
    this.perchH = 0;
    this.seekSeat = 3;
  }

  private findSeat() {
    let top: THREE.Object3D = this.root;
    while (top.parent) top = top.parent;
    if (!(top as THREE.Scene).isScene) return false;
    const me = this.root.getWorldPosition(new THREE.Vector3());
    const face = this.faceDir ? this.faceDir.clone().setY(0).normalize() : new THREE.Vector3();
    const rc = new THREE.Raycaster();
    rc.far = 1.1;
    // sprites (speech bubbles, labels) need a camera to be tested at all; they are skipped anyway
    rc.camera = SEAT_CAM;
    const down = new THREE.Vector3(0, -1, 0);
    const from = new THREE.Vector3();
    const n = new THREE.Vector3();
    let best: { x: number; z: number; h: number; score: number } | null = null;
    // people, hidden pick boxes and glass are not seats
    const skip = (o: THREE.Object3D) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if ((o as THREE.Sprite).isSprite || !m || Array.isArray(m) || !m.visible || (m.transparent && m.opacity < 0.5)) return true;
      for (let q: THREE.Object3D | null = o; q; q = q.parent) if (q.userData.snarkRef || !q.visible) return true;
      return false;
    };
    // what is round the spot at seat height: the furniture often opts out of picking
    // (raycast = no-op), so its own geometry is tested directly, after a box check
    const area = new THREE.Box3(new THREE.Vector3(me.x - 0.95, me.y + 0.15, me.z - 0.95), new THREE.Vector3(me.x + 0.95, me.y + 0.75, me.z + 0.95));
    const box = new THREE.Box3();
    const near: THREE.Mesh[] = [];
    top.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || skip(m)) return;
      const im = m as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        if (!im.boundingBox) im.computeBoundingBox();
        box.copy(im.boundingBox!);
      } else {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        box.copy(m.geometry.boundingBox!);
      }
      if (box.applyMatrix4(m.matrixWorld).intersectsBox(area)) near.push(m);
    });
    if (!near.length) {
      this.seatPose({ lift: 0, floor: 0 });
      return true;
    }
    const hits: THREE.Intersection[] = [];
    for (const r of [0, 0.22, 0.45, 0.7])
      for (let k = 0; k < (r ? 8 : 1); k++) {
        const a = (k / 8) * Math.PI * 2;
        const dx = Math.cos(a) * r,
          dz = Math.sin(a) * r;
        rc.set(from.set(me.x + dx, me.y + 1, me.z + dz), down);
        hits.length = 0;
        for (const m of near) ((m as THREE.InstancedMesh).isInstancedMesh ? THREE.InstancedMesh : THREE.Mesh).prototype.raycast.call(m, rc, hits);
        hits.sort((a, b) => a.distance - b.distance);
        for (const h of hits) {
          if (!h.face) continue;
          const y = h.point.y - me.y;
          // the first solid thing under the probe decides: a seat-high flat top, or not
          n.copy(h.face.normal).transformDirection(h.object.matrixWorld);
          if (y < 0.28 || y > 0.62 || n.y < 0.8) break;
          // seats are behind (or beside) where it looks; what is in front is more likely a table
          const ahead = dx * face.x + dz * face.z;
          const score = r + (ahead > 0.1 ? 0.6 : 0);
          if (!best || score < best.score) best = { x: dx, z: dz, h: y, score };
          break;
        }
      }
    if (best) {
      // onto the seat, in the root's own frame (the parent may be rotated)
      const w = me.clone().add(new THREE.Vector3(best.x, 0, best.z));
      this.root.parent!.worldToLocal(w);
      this.root.position.x = w.x;
      this.root.position.z = w.z;
      this.perch(best.h);
    } else this.seatPose({ lift: 0, floor: 0 });
    return true;
  }

  private seated = false;
  /**
   * Sit down with the root ON the seat (a bus seat, a chair `seatH` above the floor; 0: on the
   * floor itself, legs stretched out), or stand back up (bus riders holding a strap).
   */
  sit(seated: boolean, seatH = 0.42) {
    this.seated = seated;
    this.refreshPose();
    this.seatPose(seated ? { lift: 0, floor: seatH } : null);
  }

  /** In water up to the chest (swimmers): no legs, the bust low on the root. */
  wade() {
    this.seated = true;
    this.refreshPose();
    this.seat = null;
    this.legsOn = false;
    this.near.value = 0;
    this.placeSeat();
    this.visual.position.y = -LEG_H * 0.75 * this.scaleK;
    this.applyDetail();
  }

  /** The seat under it: its height over the root (`lift`) and over the floor (`floor`). */
  private seat: { lift: number; floor: number } | null = null;
  private lap: THREE.Mesh | null = null;
  private lapShin = -1;
  private seatPose(p: { lift: number; floor: number } | null) {
    this.seat = p;
    this.legsOn = !p;
    this.near.value = p ? SEAT_NEAR : 0;
    this.placeSeat();
    this.applyDetail();
  }

  /**
   * Seated: the thighs' underside on the seat, shins down to the floor (their length in portrait
   * pixels depends on the scale), the bust on the lap. Redone when the scale changes.
   */
  private placeSeat() {
    const p = this.seat;
    const k = this.scaleK;
    if (!p) {
      this.visual.position.y = 0;
      if (this.lap) this.lap.visible = false;
      return;
    }
    this.visual.position.y = p.lift - (LEG_H - 3 * PX) * k;
    const shin = Math.max(0, Math.min(14, Math.round(p.floor / (PX * k))));
    if (shin !== this.lapShin) {
      this.lapShin = shin;
      if (this.lap) dropPlane(this.lap);
      const { s, up } = lapSprite(this.trouser, shin);
      const m = pixelPlane(s, -0.01);
      nearer(m.material as THREE.Material, this.near);
      // from portrait column 13 (just behind the bust's centre) forward; top at the hips (row 26)
      m.position.set((s.w * PX) / 2, LEG_H + up * PX - (s.h * PX) / 2, -0.01);
      this.lap = m;
      this.visual.add(m);
    }
  }

  /** Riders are shrunk a little so they fit the cabin. */
  setScale(k: number) {
    this.visual.scale.set(this.facing * k, k, k);
    this.scaleK = k;
    if (this.seat) this.placeSeat();
  }
  private scaleK = 1;

  get isSeated() {
    return this.seated;
  }

  /** Walking through others for now (see `ghostFor`): collisions leave this one alone. */
  get ghosting() {
    return this.ghostFor > 0;
  }

  update(dt: number, t: number, camQuat: THREE.Quaternion, camRight: THREE.Vector3) {
    if (this.ghostFor > 0) this.ghostFor -= dt;
    if (this.seekSeat > 0 && --this.seekSeat === 0 && !this.findSeat()) this.seekSeat = 30;
    // billboard in world space, whatever the root is parented to (the street or a bus)
    this.visual.quaternion.copy(this.root.getWorldQuaternion(tmpQ).invert().multiply(camQuat));
    let moving = false;
    if (this.walking && this.path.length && !this.paused) {
      const target = this.path[0];
      const pos = this.root.position;
      const d = new THREE.Vector3().subVectors(target, pos);
      d.y = 0;
      const dist = d.length();
      const step = this.speed * this.rush * dt;
      // someone (or something) in the way that won't move: after a moment, call it reached
      if (dist < this.lastDist - 0.004) this.stuck = 0;
      else this.stuck += dt;
      this.lastDist = dist;
      // jammed further out (a crowd, a corner): slip through for a moment rather than stay wedged
      if (this.stuck > 2 && this.ghostFor <= 0) this.ghostFor = 2.5;
      // still nowhere after that: the leg is done, whatever the obstacle
      if (dist <= step || (this.stuck > 1.2 && dist < 1.2) || this.stuck > 6) {
        this.stuck = 0;
        this.lastDist = Infinity;
        pos.x = target.x;
        pos.z = target.z;
        this.path.shift();
      } else {
        d.multiplyScalar(step / dist);
        pos.add(d);
        const side = d.dot(camRight);
        if (Math.abs(side) > 1e-4) this.facing = side >= 0 ? 1 : -1;
      }
      pos.y = target.y;
      moving = true;
      if (!this.path.length) {
        this.walking = false;
        const a = this.arrived;
        this.arrived = null;
        a?.();
      }
    }

    // Among Us waddle on the pixel grid: legs step in turn, the bust bobs one pixel, all snapped.
    const p = (this.phase += dt * (moving ? 9 * this.rush : 2));
    const base = LEG_H + BODY / 2;
    if (moving) {
      const s = Math.sin(p);
      this.body.rotation.z = s * 0.05;
      this.body.position.y = base + snap(Math.abs(s) * 1.2 * PX);
      this.legs[0].position.y = 4 * PX + snap(Math.max(0, s) * 2 * PX);
      this.legs[1].position.y = 4 * PX + snap(Math.max(0, -s) * 2 * PX);
      this.legs[0].position.x = this.legs[0].userData.x + snap(s * 1.2 * PX);
      this.legs[1].position.x = this.legs[1].userData.x - snap(s * 1.2 * PX);
    } else {
      this.body.rotation.z *= 0.85;
      this.body.position.y = base + snap(Math.max(0, Math.sin(p)) * PX * 0.9);
      this.legs[0].position.y = this.legs[1].position.y = 4 * PX;
      this.legs[0].position.x = this.legs[0].userData.x;
      this.legs[1].position.x = this.legs[1].userData.x;
      if (this.faceDir) {
        const side = this.faceDir.dot(camRight);
        if (Math.abs(side) > 0.05) this.facing = side >= 0 ? 1 : -1;
      } else if (t > this.idleTurnAt) {
        // now and then a resident glances the other way
        this.idleTurnAt = t + 4 + Math.random() * 8;
        if (this.state === "waiting" || this.state === "resident") this.facing *= Math.random() < 0.5 ? -1 : 1;
      }
    }
    if (this.bubble) {
      this.bubbleFor -= dt;
      this.bubbleAge += dt;
      // pops in, bobs, pops out
      this.bubble.scale.setScalar(Math.max(0.01, Math.min(1, this.bubbleAge * 7, this.bubbleFor * 6)));
      this.bubble.position.y = LEG_H + BODY + 3 * PX + snap(Math.max(0, Math.sin(t * 5)) * PX);
      if (this.bubbleFor <= 0) {
        dropPlane(this.bubble);
        this.bubble = null;
      }
    }
    this.glow.position.y = this.body.position.y;
    this.glow.rotation.z = this.body.rotation.z;
    // arms swing in step with the legs: the near arm forward with the far leg
    const sw: -1 | 0 | 1 = moving ? (Math.sin(p) > 0.35 ? 1 : Math.sin(p) < -0.35 ? -1 : 0) : 0;
    if (sw !== this.swing || this.strapOn !== (!!this.bus && this.state === "riding" && !this.seated)) {
      this.swing = sw;
      this.refreshPose();
    }
    this.hold.position.y = this.body.position.y - base;
    this.hold.rotation.z = this.body.rotation.z * 0.5;
    this.visual.scale.set(this.facing * this.scaleK, this.scaleK, this.scaleK);
    this.ring.rotation.z += dt;
  }
}
