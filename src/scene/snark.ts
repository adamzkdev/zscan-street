import * as THREE from "three";
import type { NftItem, Tx, TxKind } from "../data/types";
import { ZScan } from "../data/zscan";
import { blobTexture } from "./textures";
import { sayAt } from "./speech";
import { GRID, POSE, bubbleSprite, legSprite, policeCapSprite, poseSprites, type Emote, type ItemKind, type PoseSpec } from "./sprites";

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
      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      const cloth = clothOf(img);
      return { texture, cloth, skin: skinOf(img, cloth) };
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
function glowMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, color: { value: new THREE.Color(0.35, 0.9, 1.6) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
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
    this.body = new THREE.Mesh(new THREE.PlaneGeometry(BODY, BODY), mat);
    this.body.position.y = LEG_H + BODY / 2;
    this.body.userData.snark = this;
    this.root.userData.snarkRef = this;
    this.glow = new THREE.Mesh(this.body.geometry, glowMaterial(art.texture));
    this.glow.position.copy(this.body.position);
    this.glow.position.z = -0.02;
    this.glow.scale.setScalar(1.09);
    this.glow.visible = false;
    this.cloth = art.cloth;
    this.skin = art.skin ?? art.cloth;
    const trouser = new THREE.Color(art.cloth).multiplyScalar(0.62);
    const leg = legSprite(`#${trouser.getHexString()}`);
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
    this.legs.forEach((l) => (l.visible = false));
    return this.visual;
  }

  /** Open an umbrella over the head (rain), or fold it away: the near hand grips its shaft. */
  setUmbrella(color: string | null) {
    this.umbrellaColor = color;
    this.refreshPose();
  }

  /** A police cap on the head. */
  setCap() {
    const c = pixelPlane(policeCapSprite(), 0.05);
    c.position.set(snap(BUST_X + PX), LEG_H + BODY - 1.5 * PX, 0.05);
    this.visual.add(c);
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

  private perchY = 0;
  /** Sit on a bench (legs dangling) at `height` above the ground under it; 0 stands back up. */
  perch(height: number) {
    this.perchY = height ? height - LEG_H + PX : 0;
    this.visual.position.y = this.perchY;
  }

  get isPerched() {
    return this.perchY !== 0;
  }

  private seated = false;
  /** Sit down on a bus seat (legs tucked away) or stand in the aisle holding a strap. */
  sit(seated: boolean) {
    this.seated = seated;
    this.refreshPose();
    this.legs.forEach((l) => (l.visible = !seated));
    this.visual.position.y = seated ? -LEG_H * 0.75 : 0;
  }

  /** Riders are shrunk a little so they fit the cabin. */
  setScale(k: number) {
    this.visual.scale.set(this.facing * k, k, k);
    this.scaleK = k;
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
    // billboard in world space, whatever the root is parented to (the street or a bus)
    this.visual.quaternion.copy(this.root.getWorldQuaternion(tmpQ).invert().multiply(camQuat));
    let moving = false;
    if (this.walking && this.path.length) {
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
