/**
 * The eight mascots in 3D, in the toon look, animated by code.
 *
 *   const a = new Avatar("zip");          // or a CharInfo
 *   scene.add(a.root);
 *   a.pos.set(x, 0, z);  a.yaw = …;       // feet on the ground, facing +z at yaw 0
 *   a.anim = "run"; a.speed = 1;          // idle | run | jump | fall | win | lose | stun | swim | push | throw | sit | dance | hold | hit
 *   a.mood = "happy";                     // optional: force a facial expression (cinematics), null → follows the animation
 *   a.update(dt);                         // every frame
 *
 * Total height ≈ 1.45 units to the top of the head (scale with `new Avatar(id, { scale })`).
 * The models live in ./chars/ (cast.ts: the characters, face.ts: painted faces, kit.ts: building blocks).
 */
import * as THREE from "three";
import { type CharId, type CharInfo, charOf } from "../shared/chars";
import { GEO, blobShadow, flat, starGeo } from "./gfx";
import { angDiff, clamp } from "./util";
import { makeSnarkBody, type SnarkBody } from "../../../scene/snarkbody";
import { personImage } from "../../people";

/** A part that swings on its own (kept from the mascots' rig; a zkSNARK has none). */
interface Jig {
  o: THREE.Object3D;
  bx: number;
  bz: number;
  fx: number;
  ux: number;
  sz: number;
  uz: number;
  sway: number;
  freq: number;
  wag: number;
  ph: number;
  k: number;
  d: number;
  ax: number;
  az: number;
  vx: number;
  vz: number;
}
/** The rig the animations pose: a zkSNARK's own bones (scene/snarkbody.ts). */
interface Built {
  body: THREE.Object3D;
  head: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  /** The body pivot's rest height in its parent (the chest sits on the hips: 0). */
  hip: number;
  torso: THREE.Object3D;
  jigs: Jig[];
  wings: { o: THREE.Object3D; s: number; base: number }[];
  spinner?: THREE.Object3D;
  tail?: THREE.Object3D;
  ears?: THREE.Object3D[];
}

/**
 * zkSNARK #id as the rig the party's animations pose: the chest (on the hips) is the body, the
 * neck the head, the shoulders the arms, the hips' legs the legs. The animations name the limbs as
 * seen from the front (armL is at −x, the zkSNARK's own right), so they swap with the body's.
 */
function snarkRig(parent: THREE.Object3D, id: number): { b: Built; snark: SnarkBody } {
  const snark = makeSnarkBody(id);
  // (the mascots were 1.45 m tall; a zkSNARK is a little taller: the same size in the arenas)
  snark.root.scale.setScalar(0.94);
  parent.add(snark.root);
  snark.holdArms(true);
  const [, chest, , shR, elR, shL, elL, legR, , legL] = snark.puppet.rig.bones;
  // (the elbows a little bent, as the street's own walk holds them)
  elR.rotation.x = -0.25;
  elL.rotation.x = -0.25;
  const torso = chest.children[0] ?? chest;
  return {
    snark,
    b: { body: chest, head: snark.head, armL: shR, armR: shL, legL: legR, legR: legL, hip: 0, torso, jigs: [], wings: [] },
  };
}

export type Anim = "idle" | "run" | "jump" | "fall" | "win" | "lose" | "stun" | "swim" | "push" | "throw" | "sit" | "dance" | "hold" | "hit";
/** A facial expression forced on the avatar (null: the animation picks it). */
export type Mood = "happy" | "sad" | "surprised" | "angry" | "dizzy" | "neutral" | null;

export interface Rig {
  body: THREE.Object3D;
  head: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  tail?: THREE.Object3D;
  ears?: THREE.Object3D[];
}

type Expr = "happyMood" | "neutral" | "smile" | "determined" | "surprised" | "scared" | "joy" | "happy" | "sad" | "dizzy" | "effort" | "angry" | "hurt" | "yawn" | "whistle" | "curious";

let starGeoCache: THREE.BufferGeometry | null = null;

export interface AvatarOpts {
  scale?: number;
  /** A coloured ring under the feet (the player's colour), default off. */
  ring?: string | null;
  /** The soft blob shadow under the feet (default on). */
  blob?: boolean;
}


/** Pose targets, reused every frame (no allocation). */
class Pose {
  by = 0;
  bz = 0;
  bx = 0;
  bry = 0;
  brz = 0;
  hx = 0;
  hy = 0;
  hz = 0;
  aLx = 0;
  aRx = 0;
  aLz = -0.25;
  aRz = 0.25;
  aLy = 0;
  aRy = 0;
  lLx = 0;
  lRx = 0;
  lLz = 0;
  lRz = 0;
  my = 0;
  mrx = 0;
  mry = 0;
  mrz = 0;
  /** squash target (+ stretch, − squash) */
  sq = 0;
  /** smoothing rate */
  k = 16;
  reset() {
    this.by = this.bz = this.bx = this.bry = this.brz = 0;
    this.hx = this.hy = this.hz = 0;
    this.aLx = this.aRx = this.aLy = this.aRy = 0;
    this.aLz = -0.25;
    this.aRz = 0.25;
    this.lLx = this.lRx = this.lLz = this.lRz = 0;
    this.my = this.mrx = this.mry = this.mrz = 0;
    this.sq = 0;
    this.k = 16;
  }
}

export class Avatar {
  readonly char: CharInfo;
  /** Add this to the scene. Its position is the feet. */
  readonly root = new THREE.Group();
  /** The model (child of root): rotate/scale effects go here. */
  readonly model = new THREE.Group();
  readonly rig: Rig;
  anim: Anim = "idle";
  /** 0..1: how fast the run cycle goes. */
  speed = 1;
  /** Facing (radians, 0 → +z). Set directly, or with `face()`. */
  yaw = 0;
  /** Height of the ground under the avatar, for the blob shadow (default 0). */
  groundY = 0;
  /** The game poses `model` itself (lying down, spinning…): the animations leave its position/rotation alone. */
  manual = false;
  /** Show the soft blob shadow (default true). */
  shadowOn = true;
  /** Force a facial expression (cinematics, results…); null: the animation decides. */
  mood: Mood = null;
  private t = Math.random() * 10;
  private animT = 0;
  private lastAnim: Anim = "idle";
  private flashT = 0;
  private stars: THREE.Group | null = null;
  private blob: THREE.Mesh | null = null;
  private ring: THREE.Mesh | null = null;
  private scale: number;
  private b: Built;
  /** The zkSNARK's voxel body (its bones are the rig). */
  readonly snark: SnarkBody;
  /** squash & stretch: a spring between the model and the body */
  private sqG = new THREE.Group();
  private sq = 0;
  private sqv = 0;
  private P = new Pose();
  // motion estimate
  private lastX = 0;
  private lastY = 0;
  private lastZ = 0;
  private lastYaw = 0;
  private fresh = true;
  private vF = 0;
  private vS = 0;
  private vU = 0;
  private yawV = 0;
  private lastBob = 0;
  private bobV = 0;
  private runPh = 0;
  // face
  blinkIn = 1.6 + Math.random() * 2.5;
  blinkT = -1;
  // idle fidgets
  private fidget = -1;
  private fidgetT = 0;
  private fidgetLen = 0;
  private fidgetIn = 3 + Math.random() * 4;
  private hopPh = 0;
  private hitKick = false;

  constructor(c: CharId | CharInfo, o: AvatarOpts = {}) {
    this.char = typeof c === "string" ? charOf(c) : c;
    this.scale = o.scale ?? 1;
    this.root.add(this.model);
    this.model.add(this.sqG);
    this.model.scale.setScalar(this.scale);
    const built = snarkRig(this.sqG, this.char.snark);
    this.b = built.b;
    this.snark = built.snark;
    const b = this.b;
    this.rig = { body: b.body, head: b.head, armL: b.armL, armR: b.armR, legL: b.legL, legR: b.legR, tail: b.tail, ears: b.ears };
    if (o.blob !== false) {
      this.blob = blobShadow(0.42 * this.scale, 0.3);
      this.root.add(this.blob);
      this.blob.position.y = 0.02;
    }
    if (o.ring) this.setRing(o.ring);
  }

  get pos() {
    return this.root.position;
  }

  /** A coloured ring on the ground under the feet (null removes it). */
  setRing(color: string | null) {
    if (this.ring) {
      this.root.remove(this.ring);
      (this.ring.material as THREE.Material).dispose();
      this.ring = null;
    }
    if (!color) return;
    this.ring = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.scale.setScalar(0.55 * this.scale);
    this.ring.position.y = 0.03;
    this.ring.renderOrder = 2;
    this.root.add(this.ring);
  }

  /** Turn smoothly toward a yaw (rate: radians per second, default fast). */
  face(yaw: number, dt: number, rate = 14) {
    const d = angDiff(this.yaw, yaw);
    const step = rate * dt;
    this.yaw += Math.abs(d) < step ? d : Math.sign(d) * step;
  }
  /** Turn toward a point on the ground. */
  faceTo(x: number, z: number, dt: number, rate = 14) {
    const dx = x - this.pos.x,
      dz = z - this.pos.z;
    if (dx * dx + dz * dz > 1e-6) this.face(Math.atan2(dx, dz), dt, rate);
  }

  /** Start an animation from its beginning, even if it is already playing (a second "hit", "throw"…). */
  play(anim: Anim) {
    this.onAnimChange(this.anim, anim);
    this.anim = anim;
    this.lastAnim = anim;
    this.animT = 0;
  }

  /** A short wobble and a pained face (got hit). */
  flash() {
    this.flashT = 0.4;
    this.sqv -= 2.6;
  }

  setVisible(v: boolean) {
    this.root.visible = v;
  }

  private onAnimChange(from: Anim, to: Anim) {
    if (to === "jump") this.sqv += 3.2;
    if ((from === "jump" || from === "fall") && to !== "jump" && to !== "fall") this.sqv -= 3.6;
    if (to === "hit" || to === "throw") this.hitKick = false;
    if (to === "win") this.hopPh = 0;
    this.fidget = -1;
  }

  update(dt: number) {
    const rdt = dt;
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.t += dt;
    if (this.anim !== this.lastAnim) {
      this.onAnimChange(this.lastAnim, this.anim);
      this.lastAnim = this.anim;
      this.animT = 0;
    }
    this.animT += dt;
    this.root.rotation.y = this.yaw;
    this.motion(dt, rdt);

    const P = this.P;
    P.reset();
    const t = this.t,
      T = this.animT;
    let ex: Expr = "neutral";
    switch (this.anim) {
      case "idle": {
        const br = Math.sin(t * 2.3);
        P.by = br * 0.01;
        P.hx = Math.sin(t * 1.1) * 0.035;
        P.hz = Math.sin(t * 0.7) * 0.03;
        P.aLz = -0.22 - br * 0.04;
        P.aRz = 0.22 + br * 0.04;
        P.aLx = P.aRx = Math.sin(t * 1.15) * 0.04;
        P.sq = br * 0.008;
        ex = this.idleFidget(dt);
        break;
      }
      case "run": {
        const a = 0.35 + 0.65 * clamp(this.speed, 0, 1.4);
        this.runPh += dt * (8 + 8 * this.speed);
        const f = this.runPh;
        const sf = Math.sin(f);
        P.lLx = sf * 1.0 * a;
        P.lRx = -sf * 1.0 * a;
        P.aLx = -sf * 1.1 * a;
        P.aRx = sf * 1.1 * a;
        P.aLz = -0.35;
        P.aRz = 0.35;
        P.by = Math.abs(Math.cos(f)) * 0.075 * a;
        P.bx = 0.2 * a;
        P.bry = sf * 0.16 * a;
        P.brz = Math.cos(f) * 0.04 * a;
        P.hy = -sf * 0.1 * a;
        P.hx = -0.14 * a;
        P.sq = Math.cos(f * 2) * 0.035 * a;
        P.k = 24;
        ex = "determined";
        break;
      }
      case "jump": {
        const up = this.vU > -1;
        P.by = 0.03;
        P.lLx = -0.95;
        P.lRx = 0.35;
        P.aLz = -2.4 + Math.sin(t * 16) * 0.12;
        P.aRz = 2.4 - Math.sin(t * 16) * 0.12;
        P.hx = up ? -0.2 : 0.05;
        P.sq = clamp(Math.abs(this.vU) * 0.025, 0, 0.14);
        ex = "surprised";
        break;
      }
      case "fall": {
        P.aLz = -2.2 + Math.sin(t * 22) * 0.6;
        P.aRz = 2.2 + Math.sin(t * 22 + 1) * 0.6;
        P.lLx = Math.sin(t * 18) * 0.7;
        P.lRx = -Math.sin(t * 18) * 0.7;
        P.hx = 0.25;
        P.sq = clamp(Math.abs(this.vU) * 0.02, 0, 0.12);
        P.k = 22;
        ex = "scared";
        break;
      }
      case "win": {
        // hop hop hop with fist pumps, then a spin, and again
        const cyc = T % 3.2;
        const ph = T * Math.PI * 2.6;
        const hop = Math.abs(Math.sin(ph));
        const prev = this.hopPh;
        this.hopPh = ph % Math.PI;
        if (this.hopPh < prev && T > 0.1) this.sqv -= 2.4;
        if (cyc < 2.35) {
          P.my = hop * 0.38;
          const pump = Math.sin(ph * 2);
          P.aLz = -2.55 + pump * 0.25;
          P.aRz = 2.55 + pump * 0.25;
          P.aLx = P.aRx = -0.2;
          P.lLx = P.lRx = -hop * 0.55;
          P.brz = Math.sin(ph) * 0.1;
          P.hx = -0.22;
          P.hz = Math.sin(ph) * 0.12;
          P.sq = hop * 0.08;
        } else {
          const p = (cyc - 2.35) / 0.85;
          P.my = Math.sin(p * Math.PI) * 0.5;
          P.aLz = -1.6;
          P.aRz = 1.6;
          P.lLx = -0.5;
          P.lRx = 0.2;
          P.hx = -0.25;
          P.sq = 0.1;
        }
        P.k = 22;
        ex = "joy";
        break;
      }
      case "dance": {
        const f = T * Math.PI * 2.2;
        const sf = Math.sin(f);
        P.my = Math.abs(sf) * 0.1;
        P.brz = sf * 0.2;
        P.bry = Math.sin(f * 0.5) * 0.25;
        P.aLz = -1.3 + sf * 1.0;
        P.aRz = 1.3 + sf * 1.0;
        P.aLx = Math.cos(f) * 0.4;
        P.aRx = -Math.cos(f) * 0.4;
        P.lLx = Math.max(0, sf) * -0.65;
        P.lRx = Math.max(0, -sf) * -0.65;
        P.hz = -sf * 0.18;
        P.hx = Math.abs(Math.cos(f)) * -0.12;
        P.mry = Math.sin(T * 1.6) * 0.55;
        P.sq = -Math.abs(Math.cos(f)) * 0.05;
        P.k = 22;
        ex = "happy";
        break;
      }
      case "lose": {
        const sigh = Math.max(0, Math.sin((T % 3.4) * (Math.PI / 1.4))) * (T % 3.4 < 1.4 ? 1 : 0);
        P.bx = 0.3 - sigh * 0.12;
        P.hx = 0.3 - sigh * 0.12 + Math.sin(t * 0.9) * 0.04;
        P.hy = Math.sin(t * 0.85) * 0.16;
        P.aLz = -0.04;
        P.aRz = 0.04;
        P.aLx = P.aRx = 0.12;
        P.by = -0.05 + sigh * 0.035;
        P.lRx = Math.max(0, Math.sin(t * 2.2)) * Math.max(0, Math.sin(t * 0.5)) * -0.35;
        P.sq = -0.05 + sigh * 0.05;
        ex = "sad";
        break;
      }
      case "stun": {
        P.brz = Math.sin(t * 4.5) * 0.2;
        P.bx = Math.cos(t * 4.5) * 0.14;
        P.bz = Math.cos(t * 4.5) * 0.06;
        P.hz = -Math.sin(t * 4.5 + 0.7) * 0.28;
        P.hx = 0.12;
        P.aLz = -0.75 + Math.sin(t * 4.5) * 0.3;
        P.aRz = 0.75 + Math.sin(t * 4.5) * 0.3;
        P.lLz = -0.08;
        P.lRz = 0.08;
        ex = "dizzy";
        break;
      }
      case "swim": {
        P.mrx = 1.2;
        P.my = 0.25;
        const f = t * 9;
        P.aLx = -Math.PI + Math.sin(f) * 1.2;
        P.aRx = -Math.PI - Math.sin(f) * 1.2;
        P.lLx = Math.sin(f * 1.5) * 0.6;
        P.lRx = -Math.sin(f * 1.5) * 0.6;
        P.hx = -0.9;
        ex = "determined";
        break;
      }
      case "push": {
        P.bx = 0.38;
        P.aLx = -1.5;
        P.aRx = -1.5;
        P.aLz = -0.1;
        P.aRz = 0.1;
        P.hx = -0.25;
        this.runPh += dt * (6 + 6 * this.speed);
        const f = this.runPh;
        P.lLx = Math.sin(f) * 0.6 * this.speed;
        P.lRx = -Math.sin(f) * 0.6 * this.speed;
        P.by = Math.abs(Math.cos(f)) * 0.03 * this.speed;
        ex = "effort";
        break;
      }
      case "throw": {
        const p = clamp(T / 0.25, 0, 1);
        P.aRx = p < 1 ? -2.8 + p * 3.6 : 0.8;
        P.aLx = 0.4;
        P.bry = -0.45 + p * 0.9;
        P.bx = p * 0.22;
        P.hy = 0.2 - p * 0.3;
        if (p >= 1 && !this.hitKick) {
          this.hitKick = true;
          this.sqv -= 1.6;
        }
        P.k = 26;
        ex = T < 0.45 ? "effort" : "determined";
        break;
      }
      case "hit": {
        const p = clamp(T / 0.18, 0, 1);
        P.aRx = -2.3 + p * 2.7;
        P.aLx = -2.3 + p * 2.7;
        P.aLz = -0.15;
        P.aRz = 0.15;
        P.bx = 0.28 * p;
        P.hx = 0.1 * p;
        if (p >= 1 && !this.hitKick) {
          this.hitKick = true;
          this.sqv -= 2.2;
        }
        P.k = 28;
        ex = T < 0.4 ? "effort" : "determined";
        break;
      }
      case "hold": {
        P.aLx = -1.4;
        P.aRx = -1.4;
        P.aLz = 0.15;
        P.aRz = -0.15;
        P.by = Math.sin(t * 2.6) * 0.01;
        P.hx = Math.sin(t * 1.1) * 0.03;
        ex = "smile";
        break;
      }
      case "sit": {
        P.my = -0.22;
        P.lLx = -1.5;
        P.lRx = -1.5;
        P.aLz = -0.4;
        P.aRz = 0.4;
        P.aLx = -0.3;
        P.aRx = -0.3;
        P.hx = Math.sin(t * 1.1) * 0.03;
        ex = "neutral";
        break;
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const w = Math.sin(this.flashT * 50) * 0.15 * (this.flashT / 0.4);
      P.brz += w;
      P.mry += w;
      ex = "hurt";
    }
    if (this.mood) ex = this.mood === "happy" ? "happyMood" : this.mood;
    this.apply(dt);
    this.secondary(dt);
    this.expr(ex, dt);
    this.fx();
  }

  // ------------------------------------------------------------------ internals

  /** Velocity of the avatar (local: forward, side, up) from its position, for the swinging parts. */
  private motion(dt: number, rdt: number) {
    const p = this.root.position;
    if (this.fresh || rdt <= 0) {
      this.fresh = rdt <= 0 ? this.fresh : false;
      this.lastX = p.x;
      this.lastY = p.y;
      this.lastZ = p.z;
      this.lastYaw = this.yaw;
      return;
    }
    let vx = (p.x - this.lastX) / rdt,
      vy = (p.y - this.lastY) / rdt,
      vz = (p.z - this.lastZ) / rdt;
    if (vx * vx + vy * vy + vz * vz > 900) vx = vy = vz = 0; // teleported
    this.lastX = p.x;
    this.lastY = p.y;
    this.lastZ = p.z;
    const s = Math.sin(this.yaw),
      c = Math.cos(this.yaw);
    const f = clamp(vx * s + vz * c, -12, 12),
      sd = clamp(vx * c - vz * s, -12, 12);
    const k = 1 - Math.exp(-14 * dt);
    this.vF += (f - this.vF) * k;
    this.vS += (sd - this.vS) * k;
    this.vU += (clamp(vy, -20, 20) - this.vU) * k;
    const yv = clamp(angDiff(this.lastYaw, this.yaw) / rdt, -20, 20);
    this.lastYaw = this.yaw;
    this.yawV += (yv - this.yawV) * k;
  }

  /** Idle: little fidgets now and then. Returns the expression. */
  private idleFidget(dt: number): Expr {
    const P = this.P;
    if (this.fidget < 0) {
      this.fidgetIn -= dt;
      if (this.fidgetIn <= 0) {
        this.fidget = Math.floor(Math.random() * 6);
        this.fidgetT = 0;
        this.fidgetLen = [2.2, 0.55, 2.0, 1.6, 1.9, 1.7][this.fidget];
        if (this.fidget === 1) this.sqv += 2.4;
      }
      return "neutral";
    }
    this.fidgetT += dt;
    const p = this.fidgetT / this.fidgetLen;
    if (p >= 1) {
      if (this.fidget === 1) this.sqv -= 2.6;
      this.fidget = -1;
      this.fidgetIn = 3.5 + Math.random() * 5;
      return "neutral";
    }
    const env = Math.min(1, p * 5, (1 - p) * 5);
    const t = this.t;
    switch (this.fidget) {
      case 0: // look around
        P.hy = Math.sin(p * Math.PI * 2) * 0.6 * env;
        P.hx -= 0.08 * env;
        return "curious";
      case 1: // a little hop
        P.my = Math.sin(p * Math.PI) * 0.16;
        P.aLz = -0.7;
        P.aRz = 0.7;
        P.sq = 0.05;
        return "smile";
      case 2: // stretch and yawn
        P.aLz = -0.25 - 2.45 * env;
        P.aRz = 0.25 + 2.45 * env;
        P.hx = -0.28 * env;
        P.bx = -0.08 * env;
        P.sq = 0.06 * env;
        return p > 0.15 && p < 0.85 ? "yawn" : "neutral";
      case 3: // wave
        P.aRz = 0.25 + 2.25 * env + Math.sin(t * 15) * 0.35 * env;
        P.aRx = -0.3 * env;
        P.hz = -0.1 * env;
        P.brz = 0.05 * env;
        return "happy";
      case 4: // tap a foot, whistling
        P.lRx = -0.15 * env - Math.abs(Math.sin(t * 9)) * 0.22 * env;
        P.hz = Math.sin(t * 9) * 0.06 * env;
        P.aLz = -0.12;
        P.aRz = 0.12;
        P.aLy = P.aRy = 0;
        return "whistle";
      default: // tilt the head, curious
        P.hz = 0.3 * env;
        P.hx = -0.05 * env;
        return "curious";
    }
  }

  private lerpRot(o: THREE.Object3D, ax: "x" | "y" | "z", v: number, s: number) {
    o.rotation[ax] += (v - o.rotation[ax]) * s;
  }

  private apply(dt: number) {
    const P = this.P;
    const { body, head, armL, armR, legL, legR } = this.b;
    const s = 1 - Math.exp(-P.k * dt);
    this.lerpRot(body, "x", P.bx, s);
    this.lerpRot(body, "z", P.brz, s);
    this.lerpRot(body, "y", P.bry, s);
    this.lerpRot(head, "x", P.hx, s);
    this.lerpRot(head, "y", P.hy, s);
    this.lerpRot(head, "z", P.hz, s);
    this.lerpRot(armL, "x", P.aLx, s);
    this.lerpRot(armR, "x", P.aRx, s);
    this.lerpRot(armL, "z", P.aLz, s);
    this.lerpRot(armR, "z", P.aRz, s);
    this.lerpRot(armL, "y", P.aLy, s);
    this.lerpRot(armR, "y", P.aRy, s);
    this.lerpRot(legL, "x", P.lLx, s);
    this.lerpRot(legR, "x", P.lRx, s);
    this.lerpRot(legL, "z", P.lLz, s);
    this.lerpRot(legR, "z", P.lRz, s);
    body.position.y += (this.b.hip + P.by - body.position.y) * s;
    body.position.z += (P.bz - body.position.z) * s;
    if (!this.manual) {
      this.model.position.y += (P.my - this.model.position.y) * s;
      this.lerpRot(this.model, "x", P.mrx, s);
      this.lerpRot(this.model, "z", P.mrz, s);
      // the victory spin is not smoothed: it turns all the way round
      if (this.anim === "win" && this.animT % 3.2 >= 2.35) {
        const p = clamp((this.animT % 3.2 - 2.35) / 0.85, 0, 1);
        this.model.rotation.y = p * p * (3 - 2 * p) * Math.PI * 2;
      } else {
        const ry = this.model.rotation.y;
        if (ry > Math.PI || ry < -Math.PI) this.model.rotation.y = Math.atan2(Math.sin(ry), Math.cos(ry));
        this.lerpRot(this.model, "y", P.mry, s);
      }
    }
    // squash & stretch: a bouncy spring around the target
    const ks = 320,
      ds = 15;
    this.sqv += (ks * (P.sq - this.sq) - ds * this.sqv) * dt;
    this.sq += this.sqv * dt;
    this.sq = clamp(this.sq, -0.3, 0.3);
    const sy = 1 + this.sq,
      sxz = 1 / Math.sqrt(sy);
    this.sqG.scale.set(sxz, sy, sxz);
    // breathing
    const br = this.anim === "idle" || this.anim === "hold" || this.anim === "sit" ? Math.sin(this.t * 2.3) * 0.018 : this.anim === "lose" ? Math.sin(this.t * 1.4) * 0.02 : 0;
    this.b.torso.scale.set(1 + br * 0.6, 1 + br, 1 + br * 0.6);
    // the head's vertical speed, for the floppy bits
    const bob = body.position.y + this.model.position.y;
    const bv = dt > 0 ? (bob - this.lastBob) / dt : 0;
    this.lastBob = bob;
    this.bobV += (clamp(bv, -8, 8) - this.bobV) * (1 - Math.exp(-20 * dt));
    if (this.b.spinner) this.b.spinner.rotation.z += dt * (this.anim === "run" ? 9 : this.anim === "win" || this.anim === "dance" ? 6 : 1.6);
  }

  /** Ears, tails, ribbons, hat tips: damped springs pushed by the motion. Wings flap. */
  private secondary(dt: number) {
    const up = this.vU + this.bobV;
    const fw = this.vF,
      sd = this.vS + this.yawV * 0.35;
    const wagK = this.anim === "run" ? 1.6 : this.anim === "win" || this.anim === "dance" ? 2.2 : this.anim === "lose" ? 0.15 : 1;
    const wagF = this.anim === "run" ? 13 : this.anim === "win" || this.anim === "dance" ? 9 : 3.2;
    const t = this.t;
    const jigs = this.b.jigs;
    for (let i = 0; i < jigs.length; i++) {
      const j: Jig = jigs[i];
      const tx = j.bx + clamp(j.fx * fw + j.ux * up, -1.3, 1.3) + Math.sin(t * j.freq + j.ph) * j.sway;
      const tz = j.bz + clamp(j.sz * sd + j.uz * up, -1.3, 1.3) + Math.sin(t * j.freq * 0.83 + j.ph + 1.3) * j.sway * 0.7 + Math.sin(t * wagF + j.ph) * j.wag * wagK;
      j.vx += (j.k * (tx - j.ax) - j.d * j.vx) * dt;
      j.ax += j.vx * dt;
      j.vz += (j.k * (tz - j.az) - j.d * j.vz) * dt;
      j.az += j.vz * dt;
      j.o.rotation.x = j.ax;
      j.o.rotation.z = j.az;
    }
    const wings = this.b.wings;
    if (wings.length) {
      const flap = this.anim === "jump" || this.anim === "fall" || this.anim === "win" || this.anim === "dance" ? 0.7 : this.anim === "run" ? 0.35 : Math.max(0, Math.sin(t * 0.9)) > 0.97 ? 0.4 : 0.08;
      const f = this.anim === "idle" ? 10 : 18;
      for (let i = 0; i < wings.length; i++) {
        const w = wings[i];
        w.o.rotation.z += (w.s * (w.base + Math.sin(t * f) * flap) - w.o.rotation.z) * (1 - Math.exp(-25 * dt));
      }
    }
  }

  /** 0 open, 1 half, 2 closed (this frame's blink). */
  private blink = 0;
  /** The open / half / closed variant of an expression's eyes, for the blink. */
  bl = (open: number, half: number, closed: number) => (this.blink === 2 ? closed : this.blink === 1 ? half : open);
  /** Alternates every `period` seconds (twinkles, tears, swirls). */
  alt = (period: number) => Math.floor(this.t / period) % 2 === 0;

  /** The face: expression → eye / brow / mouth cells, with blinks and little animations. */
  /** A zkSNARK's face is its art: no painted expressions. */
  private expr(_ex: Expr, _dt: number) {}

  private fx() {
    const t = this.t;
    // stun stars
    if (this.anim === "stun") {
      if (!this.stars) {
        starGeoCache ??= (() => {
          const g = starGeo(0.1, 0.05, 0.45);
          g.userData = { shared: true };
          return g;
        })();
        this.stars = new THREE.Group();
        for (let i = 0; i < 4; i++) this.stars.add(new THREE.Mesh(starGeoCache, flat(i % 2 ? "#fff36a" : "#ffd23a")));
        this.model.add(this.stars);
      }
      this.stars.visible = true;
      this.stars.position.y = 1.78;
      const ch = this.stars.children;
      for (let i = 0; i < ch.length; i++) {
        const m = ch[i];
        const a = t * 5 + (i / 4) * Math.PI * 2;
        m.position.set(Math.cos(a) * 0.42, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.42);
        m.rotation.y = t * 8;
      }
    } else if (this.stars) this.stars.visible = false;

    if (this.blob) {
      const h = Math.max(0, this.pos.y - this.groundY);
      this.blob.position.y = this.groundY - this.pos.y + 0.03;
      const k2 = 1 / (1 + h * 0.6);
      this.blob.scale.set(0.84 * this.scale * k2, 0.84 * this.scale * k2, 1);
      (this.blob.material as THREE.MeshBasicMaterial).opacity = 0.3 * k2;
      this.blob.visible = this.shadowOn && h < 12;
    }
    if (this.ring) this.ring.position.y = this.groundY - this.pos.y + 0.035;
  }

  dispose() {
    this.root.removeFromParent();
    // (the zkSNARK's body frees its own: its voxel models are cached and shared by id)
    this.snark.dispose();
    this.snark.root.removeFromParent();
    const seen = new Set<unknown>();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.userData?.decal) return;
      if (m.geometry && !m.geometry.userData?.shared) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat && !Array.isArray(mat) && !(mat.userData as { shared?: boolean })?.shared && !seen.has(mat)) {
        seen.add(mat);
        mat.dispose();
      }
    });
  }
}

// ----------------------------------------------------------------- portraits

/** Kept for the callers of the mascots' baking: a zkSNARK's portrait is its NFT art, nothing to bake. */
export function bakePortraits(_r: THREE.WebGLRenderer, _ids: CharId[]) {}

/** A player's portrait: its zkSNARK's own pixel art (ZScan's API, CORS-open). */
export const portrait = (id: string) => personImage(charOf(id).snark);
