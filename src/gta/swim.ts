import * as THREE from "three";
import type { AudioOut } from "./sound";

/**
 * In the sea (src/gta): what tells you you are in the water — rings spreading round you on the
 * surface as you wade and swim, a splash of droplets when you run in or at each stroke, and under the
 * surface the picture turning blue-green and the city's sound muffled. Its own few draws.
 */

const RIPPLES = 10;
const DROPS = 48;

export type SwimState = "dry" | "wade" | "swim";

export class SwimFx {
  readonly group = new THREE.Group();
  state: SwimState = "dry";
  private ripples: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; life: number; grow: number }[] = [];
  private nextRipple = 0;
  private drops: THREE.InstancedMesh;
  private dv: THREE.Vector3[] = [];
  private dp: THREE.Vector3[] = [];
  private dt: number[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private under = false;
  private veil: HTMLElement;
  private strokeT = 0;
  private lastDepth = 0;

  constructor(
    scene: THREE.Scene,
    ui: HTMLElement,
    private audio: () => AudioOut | null,
    private muffle: (on: boolean) => void,
  ) {
    this.group.name = "gta:swim";
    this.group.userData.noField = true;
    scene.add(this.group);
    const geo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < RIPPLES; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: "#f4f8f6", transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.ripples.push({ mesh, mat, t: 1, life: 1, grow: 1 });
    }
    this.drops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: "#eaf6f8", transparent: true, opacity: 0.85, toneMapped: false }), DROPS);
    this.drops.frustumCulled = false;
    for (let i = 0; i < DROPS; i++) {
      this.drops.setMatrixAt(i, this.zero);
      this.dv.push(new THREE.Vector3());
      this.dp.push(new THREE.Vector3());
      this.dt.push(-1);
    }
    this.group.add(this.drops);
    this.veil = document.createElement("div");
    this.veil.className = "gta-underwater";
    Object.assign(this.veil.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 0.18s",
      background: "radial-gradient(ellipse at 50% 30%, rgba(60,170,180,0.42), rgba(8,62,84,0.78) 75%)",
      mixBlendMode: "multiply",
      zIndex: "4",
    });
    ui.append(this.veil);
  }

  /**
   * Each frame on foot: where you are, how deep the water is there (0 dry), your speed and heading,
   * the camera (and the water's depth under it, or null off the sea).
   */
  update(dt: number, at: THREE.Vector3, depth: number, speed: number, facing: number, surface: number, cam: THREE.Camera, camDepth: number | null) {
    const was = this.state;
    this.state = depth > 1.05 ? "swim" : depth > 0.18 ? "wade" : "dry";
    // into the water at a run: a splash
    if (was === "dry" && this.state !== "dry" && speed > 2) this.splash(at, surface, 14, 2.4);
    if (this.state !== "dry") {
      // rings: more of them, quicker, the faster you go
      this.nextRipple -= dt * (0.6 + Math.min(1, speed / 2.5) * 1.6);
      if (this.nextRipple <= 0) {
        this.nextRipple = 0.42;
        this.ripple(at.x - Math.sin(facing) * -0.15, surface, at.z - Math.cos(facing) * -0.15, this.state === "swim" ? 1.6 : 1.1, this.state === "swim" ? 1.5 : 1.1);
      }
      // a crawl's strokes throw a little water
      if (this.state === "swim" && speed > 0.8) {
        this.strokeT -= dt;
        if (this.strokeT <= 0) {
          this.strokeT = 0.48;
          const fx = -Math.sin(facing),
            fz = -Math.cos(facing);
          this.splash(new THREE.Vector3(at.x + fx * 0.7, 0, at.z + fz * 0.7), surface, 5, 1.4);
          this.sound(0.05, 900);
        }
      }
      if (this.state === "wade" && speed > 2.5 && Math.random() < dt * 6) this.splash(at, surface, 3, 1.6);
    }
    if (depth > 0.5 && this.lastDepth <= 0.5 && speed > 1.5) this.sound(0.14, 600);
    this.lastDepth = depth;
    // the ripples spread and fade
    for (const r of this.ripples) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar(0.35 + k * r.grow);
      r.mat.opacity = 0.55 * (1 - k) * (1 - k);
    }
    // the drops fly and fall back in
    for (let i = 0; i < DROPS; i++) {
      if (this.dt[i] < 0) continue;
      this.dt[i] += dt;
      const v = this.dv[i],
        p = this.dp[i];
      v.y -= 9.8 * dt;
      p.addScaledVector(v, dt);
      if (p.y < surface - 0.05 || this.dt[i] > 1.4) {
        this.dt[i] = -1;
        this.drops.setMatrixAt(i, this.zero);
        continue;
      }
      this.m.compose(p, this.q, this.s.setScalar(1 - this.dt[i] * 0.4));
      this.drops.setMatrixAt(i, this.m);
    }
    this.drops.instanceMatrix.needsUpdate = true;
    // the camera under the surface: blue-green, muffled
    const under = camDepth !== null && camDepth > 0.15 && cam.position.y < surface - 0.04;
    if (under !== this.under) {
      this.under = under;
      this.veil.style.opacity = under ? "1" : "0";
      this.muffle(under);
    }
  }

  /** A body into the water at (x, z) from above (off a yacht's side): a big splash, its sound. */
  splashAt(x: number, surface: number, z: number) {
    this.splash(new THREE.Vector3(x, 0, z), surface, 22, 3);
    this.sound(0.16, 520);
  }

  /** Out of the water for good (the game stopped, a car): everything off. */
  reset() {
    this.state = "dry";
    for (const r of this.ripples) r.mesh.visible = false;
    for (let i = 0; i < DROPS; i++) ((this.dt[i] = -1), this.drops.setMatrixAt(i, this.zero));
    this.drops.instanceMatrix.needsUpdate = true;
    if (this.under) {
      this.under = false;
      this.veil.style.opacity = "0";
      this.muffle(false);
    }
  }

  private ripple(x: number, y: number, z: number, grow: number, life: number) {
    const r = this.ripples.find((q) => !q.mesh.visible) ?? this.ripples.reduce((a, b) => (a.t > b.t ? a : b));
    r.mesh.position.set(x, y + 0.03, z);
    r.mesh.visible = true;
    r.t = 0;
    r.life = life;
    r.grow = grow;
  }

  private splash(at: THREE.Vector3, surface: number, n: number, up: number) {
    for (let k = 0; k < n; k++) {
      const i = this.dt.findIndex((t) => t < 0);
      if (i < 0) return;
      this.dt[i] = 0;
      const a = Math.random() * Math.PI * 2,
        r = 0.6 + Math.random() * 1.2;
      this.dp[i].set(at.x + Math.cos(a) * 0.25, surface + 0.05, at.z + Math.sin(a) * 0.25);
      this.dv[i].set(Math.cos(a) * r, up * (0.6 + Math.random() * 0.6), Math.sin(a) * r);
    }
    this.sound(0.09, 1400);
  }

  /** A splash's sound: filtered noise, short. */
  private sound(level: number, freq: number) {
    const a = this.audio();
    if (!a || a.ctx.state !== "running") return;
    const ctx = a.ctx;
    const len = 0.35;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq * (0.8 + Math.random() * 0.4);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(bp).connect(g).connect(a.out);
    src.start();
    src.onended = () => g.disconnect();
  }
}
