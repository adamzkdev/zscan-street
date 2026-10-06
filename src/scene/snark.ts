import * as THREE from "three";
import type { NftItem, Tx, TxKind } from "../data/types";
import { ZScan } from "../data/zscan";
import { blobTexture } from "./textures";
import { GRID, bubbleSprite, handSprite, itemSprite, legSprite, umbrellaSprite, type Emote, type ItemKind } from "./sprites";

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
      const res = await fetch(ZScan.zkSnarkImage(id));
      if (!res.ok) throw new Error(`zkSNARK #${id}: HTTP ${res.status}`);
      const bmp = await createImageBitmap(await res.blob());
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0);
      const img = ctx.getImageData(0, 0, c.width, c.height);
      keyOutBackground(img);
      ctx.putImageData(img, 0, 0);
      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      return { texture, cloth: clothOf(img) };
    })();
    artCache.set(id, p);
    p.catch(() => artCache.delete(id));
  }
  return p;
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
const snap = (v: number) => Math.round(v / PX) * PX;
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
  /** What it carries, held in both hands in front of the bust. */
  private hold = new THREE.Group();
  private cloth: string;
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
    const trouser = new THREE.Color(art.cloth).multiplyScalar(0.62);
    const leg = legSprite(`#${trouser.getHexString()}`);
    for (const dx of [BUST_X - 3 * PX, BUST_X + 3 * PX]) {
      const l = pixelPlane(leg, -0.01);
      l.position.set(snap(dx), 4 * PX, -0.01);
      l.userData.x = l.position.x;
      this.legs.push(l);
      this.visual.add(l);
    }
    this.hold.position.set(snap(BUST_X), LEG_H + 4 * PX, 0.03);
    this.visual.add(this.glow, this.body, this.hold);
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

  /** Item in both hands; a second one peeks out behind when it carries more than one. */
  redrawHold() {
    this.hold.clear();
    if (!this.txs.length && !this.carry) return;
    const kinds: ItemKind[] = this.carry ? [this.carry] : this.txs.slice(0, 2).map((t) => t.kind);
    kinds.forEach((k, i) => {
      const it = pixelPlane(itemSprite(k), -i * 0.005);
      it.position.set(i ? -2 * PX : 0, i ? 4 * PX : 0, -i * 0.01);
      this.hold.add(it);
    });
    const hand = handSprite(this.cloth);
    for (const side of [-1, 1]) {
      const h = pixelPlane(hand, 0.01);
      h.position.set(side * 6 * PX, -1 * PX, 0.01);
      this.hold.add(h);
    }
  }

  /** Items stay hidden until they are picked up at the shop. */
  showParcels(on: boolean) {
    this.hold.visible = on;
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

  private umbrella: THREE.Mesh | null = null;
  /** Open an umbrella over the head (rain), or fold it away. */
  setUmbrella(color: string | null) {
    if (this.umbrella) this.visual.remove(this.umbrella);
    this.umbrella = null;
    if (!color) return;
    const u = pixelPlane(umbrellaSprite(color), 0.04);
    // the stick ends in the hands, the canopy clears the head
    u.position.set(snap(BUST_X + PX), LEG_H + BODY + 2 * PX, 0.04);
    this.umbrella = u;
    this.visual.add(u);
  }

  private bubble: THREE.Mesh | null = null;
  private bubbleFor = 0;
  private bubbleAge = 0;
  /** A pixel speech bubble over the head for a few seconds: a reaction, never words. */
  emote(e: Emote, seconds = 2.6) {
    if (this.bubble) this.visual.remove(this.bubble);
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
        this.visual.remove(this.bubble);
        this.bubble = null;
      }
    }
    this.glow.position.y = this.body.position.y;
    this.glow.rotation.z = this.body.rotation.z;
    this.hold.position.y = LEG_H + 4 * PX + (this.body.position.y - base);
    this.hold.rotation.z = this.body.rotation.z * 0.6;
    this.visual.scale.set(this.facing * this.scaleK, this.scaleK, this.scaleK);
    this.ring.rotation.z += dt;
  }
}
