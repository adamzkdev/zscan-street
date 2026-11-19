/**
 * Walking into a place plays a short film: black bars slide in, the place's title card comes up,
 * and the camera sweeps the room before settling into your eyes. A different shot each time
 * (an orbit from either side, a crane down, a reverse reveal), always kept inside the walls by a
 * few rays. Any key or click cuts it short; the walker takes over the moment it ends.
 *
 * The app asks `update(dt, live)` every frame while inside: a camera to draw with while the film
 * plays (it lands exactly on `live`, the walker's own view), null once it is over.
 */
import * as THREE from "three";
import "./cinematic.css";
import { master } from "../audio/master";
import { T } from "../i18n/lang";
import { TOUCH } from "../scene/quality";

export interface CineCard {
  title: string;
  sub?: string;
  eyebrow?: string;
  color: string;
}

const DUR = 3.1;
const SHORT = 1.5;

/** Shots, taken in turn: the orbit's start angle round the room's middle (0: a crane down). */
const SHOTS = [1.9, -1.6, 0, 2.6, -2.3, 1.2, -0.9];

const up = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const q1 = new THREE.Quaternion();

export class EntryCinematic {
  readonly camera = new THREE.PerspectiveCamera(56, 1, 0.05, 600);
  private el: HTMLElement;
  private t = 0;
  private dur = DUR;
  private on = false;
  private shot = Math.floor(Math.random() * SHOTS.length);
  private ray = new THREE.Raycaster();
  /** The film's path: the room's middle, the start's angle, radius and height. */
  private path: { focus: THREE.Vector3; back: THREE.Vector3; a0: number; r0: number; r1: number; h0: number; h1: number; still: boolean } | null = null;
  private ended: (() => void) | null = null;
  private off: (() => void)[] = [];

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "cine";
    this.el.innerHTML = `<i class="cine-bar top"></i><i class="cine-bar bot"></i>
      <div class="cine-card"><span class="cine-eyebrow"></span><b class="cine-title"></b><i class="cine-rule"></i><span class="cine-sub"></span></div>
      <div class="cine-skip"></div>`;
    parent.append(this.el);
    this.ray.far = 40;
  }

  get playing() {
    return this.on;
  }

  /**
   * Play the film for the place in `scene`, ending on the walker's camera `eye` (looking along
   * `yaw`, 0 = toward −z). `still`: the title card only (reduced motion), the camera stays put.
   */
  play(scene: THREE.Scene, eye: THREE.PerspectiveCamera, yaw: number, card: CineCard, ended: () => void, still = false) {
    this.stop(false);
    this.on = true;
    this.t = 0;
    this.dur = still ? SHORT : DUR;
    this.ended = ended;
    this.camera.fov = eye.fov;
    this.camera.aspect = eye.aspect;
    this.camera.near = eye.near;
    this.camera.far = eye.far;
    this.camera.updateProjectionMatrix();
    this.path = still ? null : this.plan(scene, eye, yaw);
    // the card
    const $ = (s: string) => this.el.querySelector<HTMLElement>(s)!;
    $(".cine-title").textContent = card.title;
    $(".cine-eyebrow").textContent = card.eyebrow ?? "";
    $(".cine-sub").textContent = card.sub ?? "";
    // (a touch screen has no keys: a tap skips)
    $(".cine-skip").textContent = TOUCH ? T("Tap to skip", "点一下跳过") : T("Click or press any key to skip", "点击或按任意键跳过");
    this.el.style.setProperty("--c", card.color);
    this.el.style.setProperty("--dur", `${this.dur}s`);
    this.el.classList.remove("on", "out", "still");
    void this.el.offsetWidth;
    this.el.classList.add("on");
    if (still) this.el.classList.add("still");
    document.documentElement.classList.add("cine-on");
    sting();
    // any key or press cuts it short (the key itself goes on to the walker)
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      if (e.key === "Escape") (e.stopImmediatePropagation(), e.preventDefault());
      this.stop(true);
    };
    const press = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest?.("#ui .hud, button, a")) return;
      e.stopImmediatePropagation();
      this.stop(true);
    };
    // (a moment's grace: the key that walked you in is still held)
    const arm = setTimeout(() => {
      window.addEventListener("keydown", key, true);
      window.addEventListener("pointerdown", press, true);
    }, 250);
    this.off = [() => clearTimeout(arm), () => window.removeEventListener("keydown", key, true), () => window.removeEventListener("pointerdown", press, true)];
  }

  /** Cut it short (`done`: the walker takes over). */
  stop(done = true) {
    if (!this.on) return;
    this.on = false;
    for (const f of this.off) f();
    this.off = [];
    this.el.classList.add("out");
    this.el.classList.remove("on");
    document.documentElement.classList.remove("cine-on");
    const e = this.ended;
    this.ended = null;
    if (done) e?.();
  }

  /** The camera to draw with this frame, or null when the film is over. */
  update(dt: number, live: THREE.PerspectiveCamera): THREE.PerspectiveCamera | null {
    if (!this.on) return null;
    this.t += dt;
    const k = Math.min(1, this.t / this.dur);
    const cam = this.camera;
    cam.aspect = live.aspect;
    if (!this.path) {
      cam.position.copy(live.position);
      cam.quaternion.copy(live.quaternion);
    } else {
      const p = this.path;
      // the move eases in and out; the last stretch hands over to the live eye
      const m = easeInOut(Math.min(1, k / 0.86));
      const a = p.a0 * (1 - m);
      const r = THREE.MathUtils.lerp(p.r0, p.r1, m);
      const h = THREE.MathUtils.lerp(p.h0, p.h1, easeOut(m));
      v1.copy(p.back).applyAxisAngle(up, a).multiplyScalar(r);
      cam.position.copy(p.focus).add(v1).setY(p.focus.y + h);
      // looking at the room's middle first, then where the eyes look
      v2.copy(live.position).addScaledVector(live.getWorldDirection(v1), 6);
      const look = v1.copy(p.focus).lerp(v2, easeInOut(Math.min(1, k / 0.9)));
      m4.lookAt(cam.position, look, up);
      cam.quaternion.setFromRotationMatrix(m4);
      // the hand-over: onto the eye, its exact place and turn
      const hand = THREE.MathUtils.smoothstep(k, 0.72, 1);
      if (hand > 0) {
        cam.position.lerp(live.position, hand);
        q1.copy(cam.quaternion).slerp(live.quaternion, hand);
        cam.quaternion.copy(q1);
      }
      cam.fov = THREE.MathUtils.lerp(46, live.fov, easeInOut(k));
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    if (k >= 1) {
      this.stop(true);
      return null;
    }
    return cam;
  }

  /** Lay the shot out in this room: the middle, a start that the walls allow. */
  private plan(scene: THREE.Scene, eye: THREE.PerspectiveCamera, yaw: number) {
    const e = eye.position.clone();
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    scene.updateMatrixWorld(true);
    this.ray.camera = eye;
    const free = (from: THREE.Vector3, dir: THREE.Vector3, max: number) => {
      this.ray.set(from, dir);
      this.ray.far = max;
      const hit = this.ray.intersectObject(scene, true).find((h) => solid(h.object));
      return hit ? hit.distance : max;
    };
    // how far the room goes ahead, and how high
    const ahead = free(e, fwd, 30);
    const roof = free(e, up, 12);
    const d = THREE.MathUtils.clamp(ahead * 0.45, 1.6, 7);
    const focus = e.clone().addScaledVector(fwd, d);
    focus.y = e.y - 0.25;
    const back = fwd.clone().negate();
    const h1 = e.y - focus.y;
    const hMax = Math.max(0.3, Math.min(roof - 0.45, 4.2));
    const pick = SHOTS[this.shot++ % SHOTS.length];
    // try the shot, smaller and smaller, until its whole path is clear; else a crane straight down
    for (const shrink of [1, 0.75, 0.55, 0.4]) {
      const a0 = pick * (shrink < 1 ? 0.8 : 1);
      const r0 = d * (pick === 0 ? 0.55 : 1.05 + 0.35 * shrink);
      const h0 = Math.min(hMax, (pick === 0 ? 3.4 : 2.2) * shrink + 0.5);
      if (this.clear(focus, back, a0, r0, d, h0, h1, free)) return { focus, back, a0, r0, r1: d, h0, h1, still: false };
    }
    return { focus, back, a0: 0, r0: d * 0.7, r1: d, h0: Math.min(hMax, 1.6), h1, still: false };
  }

  /** Is every point of the path in the open (seen from the room's middle)? */
  private clear(focus: THREE.Vector3, back: THREE.Vector3, a0: number, r0: number, r1: number, h0: number, h1: number, free: (f: THREE.Vector3, d: THREE.Vector3, m: number) => number) {
    const p = new THREE.Vector3();
    const dir = new THREE.Vector3();
    for (let i = 0; i <= 6; i++) {
      const m = i / 6;
      p.copy(back)
        .applyAxisAngle(up, a0 * (1 - m))
        .multiplyScalar(THREE.MathUtils.lerp(r0, r1, m))
        .add(focus);
      p.y = focus.y + THREE.MathUtils.lerp(h0, h1, m);
      dir.subVectors(p, focus);
      const len = dir.length();
      if (len < 0.05) continue;
      dir.normalize();
      if (free(focus, dir, len + 0.6) < len + 0.45) return false;
    }
    return true;
  }
}

/** Something the camera must not pass through: a drawn mesh, not a beam, a haze or a sprite. */
function solid(o: THREE.Object3D) {
  const m = o as THREE.Mesh;
  if (!m.isMesh || m.userData.door) return false;
  const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material | undefined;
  if (mat && (mat.blending === THREE.AdditiveBlending || (mat.transparent && mat.opacity < 0.5))) return false;
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** The film's sound: a soft swell and two warm notes. */
let ac: AudioContext | null = null;
function sting() {
  if (!master.on) return;
  try {
    ac ??= new AudioContext();
    if (ac.state === "suspended") void ac.resume();
    const t = ac.currentTime;
    const out = ac.createGain();
    out.gain.value = 0.12;
    out.connect(ac.destination);
    // the swell: filtered noise rising
    const n = Math.floor(ac.sampleRate * 1.2);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / n) * Math.PI);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 1.1);
    const g = ac.createGain();
    g.gain.value = 0.5;
    src.connect(f).connect(g).connect(out);
    src.start(t);
    for (const [freq, at] of [
      [392, 0.55],
      [587.3, 0.7],
    ]) {
      const o = ac.createOscillator();
      const og = ac.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      og.gain.setValueAtTime(0.0001, t + at);
      og.gain.exponentialRampToValueAtTime(0.5, t + at + 0.04);
      og.gain.exponentialRampToValueAtTime(0.0001, t + at + 1.6);
      o.connect(og).connect(out);
      o.start(t + at);
      o.stop(t + at + 1.7);
    }
  } catch {
    /* no sound here */
  }
}
