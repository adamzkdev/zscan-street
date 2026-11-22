import * as THREE from "three";
import { makeSnarkBody, preloadSnarks, type SnarkBody } from "./snarkbody";

/**
 * The Titan: once a day (src/game/titanday.ts) the day's biggest shielding (public ZEC going into
 * the shielded pool, the one moment the amount shows) brings a zkSNARK 85 to 140 metres tall out
 * of the bay: it wades ashore and
 * walks up Boulevard East to the Needle, the ground shaking under each step. It climbs the tower,
 * raises its fist and fires a gold beam into the sky while a shield closes over the city (and the
 * city's power goes), slides back down and walks into the sea again. Which zkSNARK: the
 * transaction picks it; how tall: the amount.
 *
 *   titan.call({ id, zec, txid, height }, dueAt?); titan.update(dt, eye); titan.shake(dt, eye)
 */

/** Boulevard East, the bay's open water, the Needle (src/scene/city/plan.ts GRID, BAY; the needle lot). */
const BLVD = 122;
const SEA_Z = 214;
const SHORE_Z = 146;
const QUAY_Z = 136;
const BED = -3.2;
const NEEDLE = { x: 141.5, z: -136.5, half: 12.5 };
/**
 * Which side of the Needle it climbs: west-south-west, so the map camera (from the south, a little
 * east) sees it in profile against the tower, and it comes to it straight off the boulevard.
 */
const SIDE = new THREE.Vector2(-0.83, 0.56).normalize();

export interface TitanCall {
  /** The zkSNARK (1 … 10,000). */
  id: number;
  /** ZEC shielded. */
  zec: number;
  txid: string;
  height?: number | null;
}

export interface TitanHooks {
  /** A footstep: `k` how hard (1 = a 70 m Titan on land), `dist` from the camera (m). */
  stomp(at: THREE.Vector3, k: number, dist: number): void;
  roar(dist: number): void;
  /** People near `at` look up. */
  react(at: THREE.Vector3): void;
  /** The city's power goes round `at`. */
  dark(at: THREE.Vector3, radius: number): void;
  /** The beam: the amount is in the shielded pool. */
  shielded(c: TitanCall): void;
  /** It came out of the sea (once per Titan). */
  risen(c: TitanCall): void;
  /** The Needle's building, for where its face is at each height. */
  needle(): THREE.Object3D | null;
  night(): boolean;
}

type Mode = "off" | "rise" | "walk" | "turnIn" | "climb" | "top" | "down" | "turnOut" | "back" | "sink";

const ease = (k: number) => 0.5 - Math.cos(Math.PI * THREE.MathUtils.clamp(k, 0, 1)) / 2;
const easeIn = (k: number) => THREE.MathUtils.clamp(k, 0, 1) ** 2;

/** A path of points on the ground: where you are `s` metres along it, and which way it goes. */
class Path {
  private len: number[] = [0];
  constructor(readonly pts: THREE.Vector2[]) {
    for (let i = 1; i < pts.length; i++) this.len.push(this.len[i - 1] + pts[i].distanceTo(pts[i - 1]));
  }
  get length() {
    return this.len[this.len.length - 1];
  }
  at(s: number, out: THREE.Vector2) {
    s = THREE.MathUtils.clamp(s, 0, this.length);
    let i = 1;
    while (i < this.len.length - 1 && this.len[i] < s) i++;
    const k = (s - this.len[i - 1]) / Math.max(1e-6, this.len[i] - this.len[i - 1]);
    return out.copy(this.pts[i - 1]).lerp(this.pts[i], k);
  }
  heading(s: number) {
    s = THREE.MathUtils.clamp(s, 0, this.length - 0.01);
    let i = 1;
    while (i < this.len.length - 1 && this.len[i] < s) i++;
    const d = this.pts[i].clone().sub(this.pts[i - 1]);
    return Math.atan2(d.x, d.y);
  }
}

// ---- the spray: voxel cubes of foam and dust ---------------------------------------------------------

const MAX_BITS = 700;

class Spray {
  readonly mesh: THREE.InstancedMesh;
  private p = new Float32Array(MAX_BITS * 3);
  private v = new Float32Array(MAX_BITS * 3);
  private life = new Float32Array(MAX_BITS);
  private size = new Float32Array(MAX_BITS);
  private next = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private at = new THREE.Vector3();
  private c = new THREE.Color();

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_BITS);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX_BITS; i++) {
      this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, this.c.set(0xffffff));
    }
  }

  /** `n` bits from round `at` (within `r`), thrown up at `up` m/s and out at `out`. */
  burst(at: THREE.Vector3, n: number, r: number, up: number, out: number, colors: number[], size: number) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX_BITS;
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r;
      this.p[i * 3] = at.x + Math.cos(a) * d;
      this.p[i * 3 + 1] = at.y + Math.random() * 1.5;
      this.p[i * 3 + 2] = at.z + Math.sin(a) * d;
      const o = out * (0.4 + Math.random() * 0.8);
      this.v[i * 3] = Math.cos(a) * o;
      this.v[i * 3 + 1] = up * (0.5 + Math.random() * 0.7);
      this.v[i * 3 + 2] = Math.sin(a) * o;
      this.life[i] = 1.2 + Math.random() * 1.6;
      this.size[i] = size * (0.5 + Math.random());
      this.mesh.setColorAt(i, this.c.setHex(colors[(Math.random() * colors.length) | 0]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Water running off a body: bits dropping from round `at`. */
  drip(at: THREE.Vector3, n: number, r: number, h: number) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX_BITS;
      const a = Math.random() * Math.PI * 2;
      this.p[i * 3] = at.x + Math.cos(a) * r * (0.6 + Math.random() * 0.4);
      this.p[i * 3 + 1] = at.y + Math.random() * h;
      this.p[i * 3 + 2] = at.z + Math.sin(a) * r * (0.6 + Math.random() * 0.4);
      this.v[i * 3] = Math.cos(a) * 1.5;
      this.v[i * 3 + 1] = -2 - Math.random() * 3;
      this.v[i * 3 + 2] = Math.sin(a) * 1.5;
      this.life[i] = 1.5 + Math.random();
      this.size[i] = 0.7 + Math.random() * 0.8;
      this.mesh.setColorAt(i, this.c.setHex(Math.random() < 0.5 ? 0xe8f6ff : 0x9fd4f0));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < MAX_BITS; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0));
        continue;
      }
      this.v[i * 3 + 1] -= 18 * dt;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      // into the water or onto the ground: gone a little later
      if (this.p[i * 3 + 1] < -1.6) this.life[i] = Math.min(this.life[i], 0.15);
      const k = Math.min(1, this.life[i] / 0.5) * this.size[i];
      this.at.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
      this.mesh.setMatrixAt(i, this.m4.compose(this.at, this.q, this.s.setScalar(k)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---- light: the searchlights, the beam, the shield ----------------------------------------------------

const coneMat = (color: string, alpha: number) =>
  new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, alpha: { value: alpha } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 color; uniform float alpha; varying vec2 vUv; void main(){ float a = alpha * pow(1.0 - vUv.y, 0.7); gl_FragColor = vec4(color * a, a); }",
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

/** The shield closing over the city: a gold dome of hexagons. */
const domeMat = () =>
  new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color("#f4b728") }, alpha: { value: 0 }, front: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform vec3 color; uniform float alpha; uniform float front; varying vec2 vUv;
      float hexd(vec2 p){ vec2 r = vec2(1.0, 1.7320508); vec2 h = r * 0.5; vec2 a = mod(p, r) - h; vec2 b = mod(p - h, r) - h; vec2 g = dot(a,a) < dot(b,b) ? a : b; vec2 q = abs(g); return max(dot(q, normalize(r)), q.x); }
      void main(){
        // it unrolls from the top down to the ground: nothing below its edge yet, its edge the brightest
        if (vUv.y < front) discard;
        float d = hexd(vec2(vUv.x * 72.0, vUv.y * 26.0));
        float edge = smoothstep(0.40, 0.5, d);
        float band = 1.0 - smoothstep(0.0, 0.05, vUv.y - front);
        float a = alpha * (0.04 + edge * 0.42 + band * 0.9);
        gl_FragColor = vec4(color * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

/** The Titan: see the top of the file. */
export class Titan {
  readonly group = new THREE.Group();
  private body: SnarkBody | null = null;
  private holder = new THREE.Group();
  private spray = new Spray();
  private mode: Mode = "off";
  private t = 0;
  private call_: TitanCall | null = null;
  private scale = 40;
  private tall = 70;
  private depth = 10;
  private path: Path | null = null;
  private s = 0;
  private v = 0;
  private stepPhase = 0;
  private lastFoot = 0;
  private y = 0;
  private heading = Math.PI;
  private climbTop = 110;
  private faces: { y: number; z: number }[] = [];
  private shakeAmp = 0;
  private shakeT = 0;
  private offset = new THREE.Vector3();
  private v2 = new THREE.Vector2();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private selfLit = { value: 0 };
  private lights: { at: THREE.Vector3; cone: THREE.Mesh; aim: THREE.Vector3 }[] = [];
  private beam: THREE.Group;
  private beamMats: THREE.ShaderMaterial[] = [];
  private dome: THREE.Mesh;
  private domeT = -1;
  private loading = false;
  private reacted = 0;
  /** When the last one walked back into the sea (ms). */
  lastEnd = 0;

  constructor(
    scene: THREE.Scene,
    private hooks: TitanHooks,
  ) {
    this.group.name = "titan";
    this.group.visible = false;
    this.group.add(this.holder, this.spray.mesh);
    // three searchlights on the boulevard and round the Needle's plaza, on the Titan all the way
    for (const [x, z] of [
      [108, 30],
      [160, -60],
      [110, -110],
    ]) {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.12, 1, 28, 1, true).translate(0, 0.5, 0), coneMat("#dfe9ff", 0.16));
      cone.raycast = () => {};
      cone.frustumCulled = false;
      cone.visible = false;
      this.group.add(cone);
      this.lights.push({ at: new THREE.Vector3(x, 0.5, z), cone, aim: new THREE.Vector3(BLVD, 40, 60) });
    }
    // the beam: a white core in a gold sheath
    this.beam = new THREE.Group();
    for (const [r, color, a] of [
      [3.5, "#fff6d8", 0.95],
      [9, "#f4b728", 0.42],
      [22, "#f4b728", 0.14],
    ] as const) {
      const m = coneMat(color, a);
      this.beamMats.push(m);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 24, 1, true).translate(0, 0.5, 0), m);
      c.raycast = () => {};
      c.frustumCulled = false;
      this.beam.add(c);
    }
    this.beam.visible = false;
    this.group.add(this.beam);
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 24, 0, Math.PI * 2, 0, Math.PI / 2), domeMat());
    this.dome.raycast = () => {};
    this.dome.frustumCulled = false;
    this.dome.visible = false;
    this.group.add(this.dome);
    scene.add(this.group);
  }

  get active() {
    return this.mode !== "off" || this.loading;
  }

  /** What is happening, for the films and tests. */
  get state() {
    return { mode: this.mode, t: Math.round(this.t * 10) / 10, id: this.call_?.id ?? null, zec: this.call_?.zec ?? null, tall: Math.round(this.tall) };
  }

  /** Where it is (its chest), for a camera. */
  where(out = new THREE.Vector3()) {
    return out.set(this.holder.position.x, this.holder.position.y + this.tall * 0.55, this.holder.position.z);
  }

  get height() {
    return this.tall;
  }

  /** What a camera should hold now: the point at the middle of the action, and how many metres tall a view it needs. */
  frame(): { at: THREE.Vector3; view: number } {
    const p = this.holder.position;
    if (this.mode === "climb" || this.mode === "top" || this.mode === "down") return { at: new THREE.Vector3(NEEDLE.x - 20, 160, NEEDLE.z + 10), view: 380 };
    return { at: new THREE.Vector3(p.x, Math.max(0, p.y) + this.tall * 0.5, p.z), view: this.tall * 1.9 };
  }

  /**
   * A Titan for this shielding (ignored while one is out). `since`: when it was due (ms); a
   * visitor who comes in late meets it where it has got to by now (run on, silently).
   */
  async call(c: TitanCall, since?: number) {
    if (this.active) return false;
    this.loading = true;
    try {
      await preloadSnarks([c.id], 9000);
      this.start(c);
      const late = since ? (Date.now() - since) / 1000 : 0;
      if (late > 1) {
        const real = this.hooks;
        const quiet = () => {};
        this.hooks = { ...real, stomp: quiet, roar: quiet, react: quiet, dark: quiet, shielded: quiet };
        const far = new THREE.Vector3(0, 5000, 0);
        for (let k = 0; k < late && this.mode !== "off"; k += 0.1) this.update(0.1, far);
        this.hooks = real;
        this.shakeAmp = 0;
      }
    } finally {
      this.loading = false;
    }
    return true;
  }

  private start(c: TitanCall) {
    this.call_ = c;
    this.body?.dispose();
    const b = makeSnarkBody(c.id);
    this.body = b;
    b.holdArms(true);
    // its materials light up a little at night (the searchlights on it)
    b.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m || !(m instanceof THREE.MeshToonMaterial)) return;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.selfLit = this.selfLit;
        sh.fragmentShader = sh.fragmentShader.replace("void main() {", "uniform float selfLit;\nvoid main() {").replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * selfLit;");
      };
      m.customProgramCacheKey = () => "titan";
      m.needsUpdate = true;
    });
    // 85 m for 10 ZEC, 115 m for 100, 140 m from about 700: over the boulevard's towers
    this.tall = THREE.MathUtils.clamp(85 + 30 * Math.log10(Math.max(1, c.zec) / 10), 85, 140);
    this.scale = this.tall / b.height;
    b.root.scale.setScalar(this.scale);
    this.depth = Math.max(b.chest.d / 2, b.headBox.max.z) * this.scale + 3;
    this.holder.clear();
    this.holder.add(b.root);
    this.climbTop = Math.min(130, 279 - this.tall * 1.15);
    this.measureNeedle();
    const foot = this.off(this.tall * 0.5) + this.depth + 4;
    this.path = new Path([new THREE.Vector2(BLVD, SEA_Z), new THREE.Vector2(BLVD, -90), new THREE.Vector2(NEEDLE.x + SIDE.x * foot, NEEDLE.z + SIDE.y * foot)]);
    this.s = 0;
    this.v = 0;
    this.t = 0;
    this.y = -this.tall * 1.05;
    this.heading = Math.PI;
    this.stepPhase = 0;
    this.lastFoot = 0;
    this.reacted = 0;
    this.mode = "rise";
    this.group.visible = true;
    this.domeT = -1;
    this.dome.visible = false;
    this.beam.visible = false;
  }

  /** How far the Needle's face on the Titan's side is from its axis, at each height (rays from that side). */
  private measureNeedle() {
    this.faces = [];
    const obj = this.hooks.needle();
    if (!obj) return;
    obj.updateWorldMatrix(true, true);
    const ray = new THREE.Raycaster();
    const across = new THREE.Vector3(-SIDE.y, 0, SIDE.x);
    const dir = new THREE.Vector3(-SIDE.x, 0, -SIDE.y);
    for (let y = 2; y < 280; y += 8) {
      let best = Infinity;
      for (const a of [-4, 0, 4]) {
        ray.set(new THREE.Vector3(NEEDLE.x + SIDE.x * 120, y, NEEDLE.z + SIDE.y * 120).addScaledVector(across, a), dir);
        const hit = ray.intersectObject(obj, true).find((h) => (h.object as THREE.Mesh).isMesh);
        if (hit) best = Math.min(best, hit.distance);
      }
      if (best < Infinity) this.faces.push({ y, z: 120 - best });
    }
  }

  /** The face's distance from the axis round height y: the widest over the span of its body. */
  private off(y: number) {
    let d = -Infinity;
    for (const f of this.faces) if (f.y >= y - this.tall * 0.35 && f.y <= y + this.tall * 0.45) d = Math.max(d, f.z);
    return d === -Infinity ? NEEDLE.half : d;
  }

  /** Stop it (tests, a film's reset). */
  clear() {
    this.mode = "off";
    this.group.visible = false;
    this.body?.dispose();
    this.body = null;
    this.call_ = null;
  }

  /** The shake to add to the camera this frame (take it back after drawing), or null. */
  shake(dt: number) {
    if (this.shakeAmp <= 0.01) return null;
    this.shakeT += dt;
    this.shakeAmp *= Math.exp(-dt * 4.5);
    const a = this.shakeAmp;
    this.offset.set(Math.sin(this.shakeT * 61) * a, Math.sin(this.shakeT * 47 + 1) * a * 0.7, Math.cos(this.shakeT * 53) * a);
    return this.offset;
  }

  private foot(k: number) {
    if (!this.body) return;
    const at = this.holder.position;
    const dist = at.distanceTo(this.eye);
    this.shakeAmp = Math.max(this.shakeAmp, (k * 1.3) / (1 + dist / 70));
    this.hooks.stomp(at, k, dist);
    const water = at.z > SHORE_Z - 8;
    const side = this.lastFoot % 2 ? 1 : -1;
    this.tmp.set(Math.cos(this.heading) * side * this.tall * 0.12, 0, -Math.sin(this.heading) * side * this.tall * 0.12).add(at);
    this.tmp.y = water ? -1.6 : 0.2;
    if (water) this.spray.burst(this.tmp, 60, this.tall * 0.12, 26 * k, 9 * k, [0xffffff, 0xe8f6ff, 0x9fd4f0, 0x5fb4ee], 1.6);
    else this.spray.burst(this.tmp, 36, this.tall * 0.1, 9 * k, 12 * k, [0x8a8278, 0x6d665e, 0xa59d92], 1.3);
    this.lastFoot++;
    if (performance.now() - this.reacted > 4000 && !water) {
      this.reacted = performance.now();
      this.hooks.react(at);
    }
  }

  update(dt: number, eye: THREE.Vector3) {
    if (!this.group.visible) return;
    this.spray.update(dt);
    this.eye.copy(eye);
    this.updateDome(dt);
    if (this.mode === "off" || !this.body || !this.path) return;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const b = this.body;
    const bones = b.puppet.rig.bones;
    const [hips, chest, neck, shR, elR, shL, elL, legR, , legL] = bones;
    const night = this.hooks.night();
    this.selfLit.value += ((night ? 0.32 : 0.06) - this.selfLit.value) * Math.min(1, dt * 2);
    let walkRate = 0;
    let groundY = 0;

    switch (this.mode) {
      case "rise": {
        // out of the water, wading as it comes up
        const k = this.t / 9;
        this.v = 2 + 7 * ease(k);
        this.y = THREE.MathUtils.lerp(-this.tall * 1.05, BED, ease(k));
        walkRate = 0.24;
        if (Math.random() < dt * 30) this.spray.drip(this.tmp.set(this.holder.position.x, Math.max(-1.6, this.y + this.tall * 0.4), this.holder.position.z), 6, this.tall * 0.22, this.tall * 0.5);
        if (this.t > 1.2 && this.t - dt <= 1.2) {
          this.spray.burst(this.tmp.set(this.holder.position.x, -1.6, this.holder.position.z), 220, this.tall * 0.3, 34, 14, [0xffffff, 0xe8f6ff, 0x9fd4f0], 2.2);
          this.hooks.roar(this.holder.position.distanceTo(eye));
          this.shakeAmp = Math.max(this.shakeAmp, 0.6 / (1 + this.holder.position.distanceTo(eye) / 120));
        }
        if (k >= 1) {
          this.mode = "walk";
          this.t = 0;
          this.hooks.risen(this.call_!);
        }
        break;
      }
      case "walk": {
        this.v += (11 - this.v) * Math.min(1, dt);
        walkRate = 0.32;
        if (this.s >= this.path.length - 0.5) {
          this.mode = "turnIn";
          this.t = 0;
        }
        break;
      }
      case "turnIn": {
        this.v = 0;
        walkRate = 0;
        if (this.t > 1.2) {
          this.mode = "climb";
          this.t = 0;
          this.hooks.roar(this.holder.position.distanceTo(eye));
        }
        break;
      }
      case "climb":
      case "top":
      case "down":
        break;
      case "turnOut": {
        this.v = 0;
        if (this.t > 2) {
          this.mode = "back";
          this.t = 0;
          const from = new THREE.Vector2(this.holder.position.x, this.holder.position.z);
          this.path = new Path([from, new THREE.Vector2(BLVD, -96), new THREE.Vector2(BLVD, SEA_Z + 10)]);
          this.s = 0;
        }
        break;
      }
      case "back": {
        this.v += (14 - this.v) * Math.min(1, dt);
        walkRate = 0.38;
        if (this.holder.position.z > SEA_Z - 30) {
          this.mode = "sink";
          this.t = 0;
        }
        break;
      }
      case "sink": {
        this.v = 6;
        walkRate = 0.24;
        this.y = THREE.MathUtils.lerp(BED, -this.tall * 1.1, easeIn(this.t / 6));
        if (Math.random() < dt * 20) this.spray.burst(this.tmp.set(this.holder.position.x, -1.6, this.holder.position.z), 10, this.tall * 0.25, 10, 6, [0xffffff, 0x9fd4f0], 1.4);
        if (this.t > 6.5) {
          this.mode = "off";
          this.group.visible = this.domeT >= 0;
          this.lastEnd = Date.now();
          b.dispose();
          this.body = null;
          return;
        }
        break;
      }
    }

    // ---- on foot: along the path, the stride in step with the ground it covers
    if (this.mode === "rise" || this.mode === "walk" || this.mode === "back" || this.mode === "sink") {
      const p = this.path;
      this.s = Math.min(p.length, this.s + this.v * dt);
      p.at(this.s, this.v2);
      const want = p.heading(this.s);
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 1.5);
      if (this.mode === "walk" || this.mode === "back") {
        // the shore: from the bay's bed up onto the quay
        const z = this.v2.y;
        groundY = z > SHORE_Z ? BED : z > QUAY_Z ? THREE.MathUtils.lerp(0, BED, (z - QUAY_Z) / (SHORE_Z - QUAY_Z)) : 0;
        this.y += (groundY - this.y) * Math.min(1, dt * 3);
      }
      this.holder.position.set(this.v2.x, this.y, this.v2.y);
      this.holder.rotation.y = this.heading;
      const before = this.stepPhase;
      this.stepPhase = (this.stepPhase + walkRate * dt) % 1;
      // a foot comes down at each quarter turn of the stride
      for (const at of [0.25, 0.75]) if ((before < at && this.stepPhase >= at) || (before > this.stepPhase && at > before)) this.foot(this.mode === "rise" || this.mode === "sink" ? 0.5 : this.tall / 70);
      const m = b.puppet.motion;
      const sp = 2.2;
      // (update() moves the phase on by its own rule: start it that much behind ours)
      m.phase = (this.stepPhase - (sp / this.scale) * dt * 0.95 + 1) % 1;
      b.update(dt, { speed: sp, grounded: true });
      // heavy arms, swinging against the legs
      const st = Math.sin(this.stepPhase * Math.PI * 2);
      shR.rotation.set(-st * 0.45, 0, 0.16);
      shL.rotation.set(st * 0.45, 0, -0.16);
      elR.rotation.set(-0.5, 0, 0);
      elL.rotation.set(-0.5, 0, 0);
      chest.rotation.z = st * 0.05;
      neck.rotation.x = -0.08 + Math.sin(this.t * 0.7) * 0.06;
      neck.rotation.y = Math.sin(this.t * 0.31) * 0.35;
    } else if (this.mode === "turnIn" || this.mode === "turnOut") {
      const want = this.mode === "turnIn" ? Math.atan2(-SIDE.x, -SIDE.y) : Math.atan2(BLVD - this.holder.position.x, 60);
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 3);
      this.holder.rotation.y = this.heading;
      b.update(dt, { speed: 0, grounded: true });
      shR.rotation.set(this.mode === "turnIn" ? -1.2 * ease(this.t / 1.2) : 0, 0, 0.16);
      shL.rotation.set(this.mode === "turnIn" ? -1.2 * ease(this.t / 1.2) : 0, 0, -0.16);
      neck.rotation.x = this.mode === "turnIn" ? -0.4 * ease(this.t / 1.2) : 0;
    } else if (this.mode === "climb") {
      // hand over hand up the tower: each pull lifts it a few metres
      const T = 14;
      const pulls = 7;
      const k = this.t / T;
      const ph = k * pulls;
      const within = ph % 1;
      const lift = (Math.floor(ph) + ease(Math.min(1, within / 0.55))) / pulls;
      this.y = this.climbTop * Math.min(1, lift);
      const right = Math.floor(ph) % 2 === 0;
      const reach = ease(Math.min(1, within / 0.55));
      const a = -2.9 + 0.7 * reach,
        bb = -2.2 - 0.7 * reach;
      shR.rotation.set(right ? a : bb, 0, 0.25);
      shL.rotation.set(right ? bb : a, 0, -0.25);
      elR.rotation.set(-0.3, 0, 0);
      elL.rotation.set(-0.3, 0, 0);
      b.update(dt, { speed: 0, grounded: true });
      legR.rotation.set(right ? -0.6 * reach : -0.2, 0, 0.1);
      legL.rotation.set(right ? -0.2 : -0.6 * reach, 0, -0.1);
      chest.rotation.set(-0.12, 0, (right ? 1 : -1) * 0.06 * reach);
      neck.rotation.set(-0.35, 0, 0);
      this.place();
      if (within < 0.55 && ((ph - dt * (pulls / T)) % 1) > within) {
        // a grip: the tower shudders
        this.shakeAmp = Math.max(this.shakeAmp, (0.5 * this.tall) / 70 / (1 + this.holder.position.distanceTo(eye) / 90));
        this.hooks.stomp(this.holder.position, 0.35, this.holder.position.distanceTo(eye));
      }
      if (this.t >= T) {
        this.mode = "top";
        this.t = 0;
      }
    } else if (this.mode === "top") {
      // a roar at the sky, then the fist up and the beam
      b.update(dt, { speed: 0, grounded: true });
      const up = ease(this.t / 1.4);
      shL.rotation.set(-2.6, 0, -0.25);
      elL.rotation.set(-0.3, 0, 0);
      shR.rotation.set(THREE.MathUtils.lerp(-2.2, -3.1, up), 0, THREE.MathUtils.lerp(0.25, 0.05, up));
      elR.rotation.set(THREE.MathUtils.lerp(-0.3, 0, up), 0, 0);
      neck.rotation.set(this.t < 1.4 ? -0.7 * ease(this.t / 0.8) : -0.5, 0, 0);
      legR.rotation.set(-0.25, 0, 0.1);
      legL.rotation.set(-0.15, 0, -0.1);
      this.place();
      if (this.t > 0.2 && this.t - dt <= 0.2) this.hooks.roar(this.holder.position.distanceTo(eye));
      if (this.t > 1.4 && this.t - dt <= 1.4) {
        this.beam.visible = true;
        this.domeT = 0;
        this.dome.visible = true;
        this.shakeAmp = Math.max(this.shakeAmp, 1.2 / (1 + this.holder.position.distanceTo(eye) / 200));
        this.hooks.dark(new THREE.Vector3(NEEDLE.x, 0, NEEDLE.z), 260);
        this.hooks.shielded(this.call_!);
      }
      if (this.beam.visible) {
        b.handR.getWorldPosition(this.tmp);
        const fade = THREE.MathUtils.clamp((9 - this.t) / 2, 0, 1) * Math.min(1, (this.t - 1.4) / 0.25);
        this.beam.position.copy(this.tmp);
        this.beam.scale.set(1 + Math.sin(this.t * 31) * 0.08, 2200, 1 + Math.sin(this.t * 31) * 0.08);
        this.beamMats.forEach((m, i) => (m.uniforms.alpha.value = [0.95, 0.42, 0.14][i] * fade));
      }
      if (this.t > 9) {
        this.beam.visible = false;
        this.mode = "down";
        this.t = 0;
      }
    } else if (this.mode === "down") {
      // slides down the tower
      const k = easeIn(this.t / 4.5);
      this.y = this.climbTop * (1 - k);
      b.update(dt, { speed: 0, grounded: true });
      shR.rotation.set(-2.7, 0, 0.25);
      shL.rotation.set(-2.7, 0, -0.25);
      legR.rotation.set(-0.3, 0, 0.15);
      legL.rotation.set(-0.3, 0, -0.15);
      neck.rotation.set(0.15, 0, 0);
      this.place();
      // sparks where its hands scrape the tower
      if (Math.random() < dt * 25) this.spray.burst(this.tmp.set(this.holder.position.x - SIDE.x * this.depth * 0.8, this.y + this.tall * 0.8, this.holder.position.z - SIDE.y * this.depth * 0.8), 4, 6, 2, 6, [0xffd27a, 0xffffff, 0xf4b728], 0.8);
      if (this.t >= 4.5) {
        this.y = 0;
        this.foot(1.6 * (this.tall / 70));
        this.foot(1.2 * (this.tall / 70));
        this.mode = "turnOut";
        this.t = 0;
      }
    }
    void hips;
    this.aimLights(dt, night);
  }

  /** On the tower: against its face at the height it has climbed to, facing it. */
  private place() {
    const d = this.off(this.y + this.tall * 0.5) + this.depth;
    this.holder.position.set(NEEDLE.x + SIDE.x * d, this.y, NEEDLE.z + SIDE.y * d);
    this.holder.rotation.y = this.heading = Math.atan2(-SIDE.x, -SIDE.y);
  }

  private aimLights(dt: number, night: boolean) {
    const on = night && this.mode !== "rise" && this.mode !== "sink";
    const target = this.where(this.tmp2);
    for (const l of this.lights) {
      l.cone.visible = on;
      if (!on) {
        l.aim.copy(target);
        continue;
      }
      // a searchlight lags a little behind what it follows
      l.aim.lerp(target, Math.min(1, dt * 1.6));
      const dir = this.tmp.copy(l.aim).sub(l.at);
      const len = dir.length() + 30;
      dir.normalize();
      l.cone.position.copy(l.at);
      l.cone.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, dir);
      const r = len * 0.075 + 3;
      l.cone.scale.set(r, len, r);
    }
  }

  private updateDome(dt: number) {
    if (this.domeT < 0) return;
    this.domeT += dt;
    const T = this.domeT;
    // over the whole city, the Needle at its middle, from the zenith down to the ground in three seconds
    this.dome.position.set(NEEDLE.x, 0, NEEDLE.z);
    this.dome.scale.set(380, 320, 380);
    const m = this.dome.material as THREE.ShaderMaterial;
    m.uniforms.alpha.value = Math.min(1, T / 0.3) * THREE.MathUtils.clamp((8 - T) / 2.5, 0, 1);
    m.uniforms.front.value = 1 - ease(T / 3.2);
    if (T > 8) {
      this.domeT = -1;
      this.dome.visible = false;
      if (this.mode === "off") this.group.visible = false;
    }
  }

  /** The traffic stops for its feet (points on the road round it), when it is on land. */
  blockers(): { x: number; z: number }[] {
    if (this.mode !== "walk" && this.mode !== "back") return [];
    const p = this.holder.position;
    if (p.z > QUAY_Z) return [];
    const out: { x: number; z: number }[] = [];
    for (let dz = -40; dz <= 40; dz += 10) for (const dx of [-8, 0, 8]) out.push({ x: p.x + dx, z: p.z + dz });
    return out;
  }
}
