import * as THREE from "three";
import { loadArt } from "../../scene/snark";
import { GOLD, MONO, SILVER } from "./layout";

/**
 * The footballers: blocky athletes in the club kits (gold Shielded, silver Transparent) whose
 * heads are their zkSNARK portraits, cut out and always turned to the camera like everyone in
 * ZStreet. Legs and arms swing with the run; they can dive (keepers) and celebrate.
 */

export type Kit = "gold" | "silver" | "goldGk" | "silverGk" | "ref";

const KITS: Record<Kit, { shirt: string; sleeve: string; shorts: string; socks: string; num: string }> = {
  gold: { shirt: GOLD, sleeve: "#1b1a21", shorts: "#141318", socks: GOLD, num: "#141318" },
  silver: { shirt: SILVER, sleeve: "#2a3040", shorts: "#2a3040", socks: SILVER, num: "#2a3040" },
  goldGk: { shirt: "#16151b", sleeve: GOLD, shorts: "#16151b", socks: "#16151b", num: GOLD },
  silverGk: { shirt: "#2f8f74", sleeve: "#1d5c4b", shorts: "#1d2a28", socks: "#2f8f74", num: "#0d1a17" },
  ref: { shirt: "#e8ff4a", sleeve: "#0d0d10", shorts: "#0d0d10", socks: "#0d0d10", num: "#0d0d10" },
};

const SKINS = ["#e8b48f", "#c98e64", "#9a6440", "#6a4128", "#f0c7a8"];

function colored(g: THREE.BufferGeometry, color: string) {
  const n = g.toNonIndexed();
  const c = new THREE.Color(color);
  const a = new Float32Array(n.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i);
  n.setAttribute("color", new THREE.BufferAttribute(a, 3));
  n.deleteAttribute("uv");
  return n;
}
function merge(parts: THREE.BufferGeometry[]) {
  const pos: number[] = [],
    nor: number[] = [],
    col: number[] = [];
  for (const p of parts) {
    pos.push(...(p.attributes.position.array as Float32Array));
    nor.push(...(p.attributes.normal.array as Float32Array));
    col.push(...(p.attributes.color.array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}
const B = (w: number, h: number, d: number, x: number, y: number, z: number, c: string) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}

const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });

export class Footballer {
  readonly g = new THREE.Group();
  private hipL = new THREE.Group();
  private hipR = new THREE.Group();
  private shL = new THREE.Group();
  private shR = new THREE.Group();
  private body = new THREE.Group();
  readonly head: THREE.Mesh;
  private phase = Math.random() * 6;
  /** 0..1: arms up, jumping. */
  cheer = 0;
  /** Keeper's dive: -1..1 sideways (0 = standing). */
  dive = 0;
  /** A kick just happened: the right leg swings through. */
  kick = 0;
  /** Sitting (substitutes) or standing still. */
  speed = 0;

  constructor(
    readonly kit: Kit,
    readonly id: number,
    readonly num: number,
    skinIdx: number,
  ) {
    const k = KITS[kit];
    const skin = SKINS[skinIdx % SKINS.length];
    const leg = cached(`leg-${kit}-${skin}`, () =>
      merge([B(0.17, 0.3, 0.19, 0, -0.17, 0, k.shorts), B(0.15, 0.2, 0.16, 0, -0.42, 0, skin), B(0.15, 0.36, 0.16, 0, -0.68, 0, k.socks), B(0.16, 0.1, 0.28, 0, -0.88, 0.05, "#101014"), B(0.16, 0.02, 0.28, 0, -0.93, 0.05, kit === "silver" ? "#c8ccd8" : GOLD)]),
    );
    const arm = cached(`arm-${kit}-${skin}`, () => merge([B(0.13, 0.24, 0.14, 0, -0.1, 0, k.sleeve), B(0.11, 0.3, 0.12, 0, -0.37, 0, kit.endsWith("Gk") ? "#f4f4f4" : skin), B(0.12, 0.1, 0.13, 0, -0.55, 0, kit.endsWith("Gk") ? (kit === "goldGk" ? GOLD : "#9fe0c8") : skin)]));
    const torso = cached(`torso-${kit}`, () =>
      merge([
        B(0.48, 0.58, 0.27, 0, 1.22, 0, k.shirt),
        B(0.5, 0.2, 0.29, 0, 0.88, 0, k.shorts),
        B(0.18, 0.05, 0.28, 0, 1.49, 0.005, k.sleeve),
        B(0.49, 0.06, 0.28, 0, 1.0, 0, kit === "gold" ? "#1b1a21" : k.sleeve),
        B(0.14, 0.1, 0.14, 0, 1.55, 0, skin),
      ]),
    );
    const tm = new THREE.Mesh(torso, mat);
    this.body.add(tm);
    for (const [hip, x] of [
      [this.hipL, -0.13],
      [this.hipR, 0.13],
    ] as const) {
      hip.position.set(x, 0.93, 0);
      hip.add(new THREE.Mesh(leg, mat));
      this.body.add(hip);
    }
    for (const [sh, x] of [
      [this.shL, -0.31],
      [this.shR, 0.31],
    ] as const) {
      sh.position.set(x, 1.47, 0);
      sh.add(new THREE.Mesh(arm, mat));
      this.body.add(sh);
    }
    // the number on the back
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    x.fillStyle = k.num;
    x.font = `900 46px ${MONO}`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(String(num), 32, 36);
    const nt = new THREE.CanvasTexture(c);
    nt.colorSpace = THREE.SRGBColorSpace;
    const numMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: nt, transparent: true, depthWrite: false }));
    numMesh.position.set(0, 1.25, -0.14);
    numMesh.rotation.y = Math.PI;
    this.body.add(numMesh);
    // the head: the zkSNARK, cut out (top of the portrait), turned to whoever looks
    const hg = new THREE.PlaneGeometry(0.66, 0.66);
    const uv = hg.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.1 + uv.getX(i) * 0.84, 0.16 + uv.getY(i) * 0.84);
    this.head = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: skin, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.head.position.set(0, 1.8, 0);
    this.g.add(this.body, this.head);
    loadArt(id)
      .then((art) => {
        const m = this.head.material as THREE.MeshBasicMaterial;
        m.map = art.texture;
        m.color.set("#ffffff");
        m.needsUpdate = true;
      })
      .catch(() => {});
    this.g.userData.footballer = this;
  }

  /** Every frame: limbs from speed, and the head turned to the camera. */
  animate(dt: number, camPos: THREE.Vector3) {
    const s = this.speed;
    this.phase += dt * (3 + s * 1.9);
    const swing = Math.min(1, s / 5) * 0.85;
    const a = Math.sin(this.phase) * swing;
    this.hipL.rotation.x = a;
    this.hipR.rotation.x = -a - this.kick * 1.6;
    this.shL.rotation.x = -a * 0.8;
    this.shR.rotation.x = a * 0.8;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.07 * Math.min(1, s / 3);
    this.body.rotation.x = Math.min(0.25, s * 0.035);
    if (this.cheer > 0) {
      const up = this.cheer;
      this.shL.rotation.x = THREE.MathUtils.lerp(this.shL.rotation.x, Math.PI * 0.95, up);
      this.shR.rotation.x = THREE.MathUtils.lerp(this.shR.rotation.x, Math.PI * 0.95, up);
      this.shL.rotation.z = -0.35 * up;
      this.shR.rotation.z = 0.35 * up;
      this.body.position.y += Math.abs(Math.sin(this.phase * 1.3)) * 0.35 * up;
    } else this.shL.rotation.z = this.shR.rotation.z = 0;
    // a keeper's dive: the whole body tips over sideways, arms stretched
    this.body.rotation.z = -this.dive * 1.2;
    if (this.dive !== 0) {
      this.body.position.y += Math.abs(this.dive) * 0.35;
      this.shL.rotation.x = this.shR.rotation.x = Math.PI * 0.9 * Math.abs(this.dive);
    }
    this.kick = Math.max(0, this.kick - dt * 5);
    const wp = this.g.position;
    const yaw = Math.atan2(camPos.x - wp.x, camPos.z - wp.z);
    this.head.rotation.y = yaw - this.g.rotation.y;
    const rz = this.body.rotation.z;
    this.head.position.set(-Math.sin(rz) * 1.8, Math.cos(rz) * 1.8 + this.body.position.y, 0);
  }
}
