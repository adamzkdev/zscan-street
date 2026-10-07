import * as THREE from "three";

/**
 * Comic speech bubbles: a white rounded box with a black outline and a tail, bold text inside.
 * Sprites, so they always face the camera and never read backwards (the characters' cut-outs
 * flip to face where they walk; the words must not). `tone` colours the text.
 */
export type Tone = "talk" | "shout" | "honk";

const cache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();
const CACHE_MAX = 120;

/** Break a line into a few short lines, at spaces. */
function wrap(text: string, max = 22) {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    if (line && (line + " " + w).length > max) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out.slice(0, 4);
}

function texture(text: string, tone: Tone) {
  const key = `${tone}|${text}`;
  let t = cache.get(key);
  if (t) {
    // most recently used last: the oldest lines are the ones let go
    cache.delete(key);
    cache.set(key, t);
    return t;
  }
  // lines carry live numbers (heights, amounts): without a cap the canvases piled up all day
  while (cache.size >= CACHE_MAX) {
    const [k0, old] = cache.entries().next().value!;
    cache.delete(k0);
    old.tex.dispose();
  }
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = `${tone === "talk" ? 600 : 900} 40px "DotGothic16", "JetBrains Mono", monospace`;
  g.font = font;
  const lines = wrap(text);
  const lh = 46;
  const tw = Math.max(...lines.map((l) => g.measureText(l).width));
  const w = Math.ceil(tw) + 60;
  const h = lines.length * lh + 40;
  c.width = w + 8;
  c.height = h + 30;
  g.font = font;
  const r = 24;
  const fill = tone === "honk" ? "#ffe24a" : tone === "shout" ? "#fff4d6" : "#fbf8f0";
  // a soft drop shadow, then the bubble: rounded box with its tail bottom left
  const path = (dx: number, dy: number) => {
    g.beginPath();
    g.moveTo(r + 3 + dx, 3 + dy);
    g.arcTo(w - 3 + dx, 3 + dy, w - 3 + dx, h - 3 + dy, r);
    g.arcTo(w - 3 + dx, h - 3 + dy, 3 + dx, h - 3 + dy, r);
    g.lineTo(56 + dx, h - 3 + dy);
    g.lineTo(28 + dx, h + 24 + dy);
    g.lineTo(36 + dx, h - 3 + dy);
    g.arcTo(3 + dx, h - 3 + dy, 3 + dx, 3 + dy, r);
    g.arcTo(3 + dx, 3 + dy, w - 3 + dx, 3 + dy, r);
    g.closePath();
  };
  g.fillStyle = "rgba(10,8,20,0.35)";
  path(6, 6);
  g.fill();
  g.fillStyle = fill;
  g.strokeStyle = tone === "shout" ? "#d0202a" : "#16141c";
  g.lineWidth = tone === "shout" ? 7 : 5;
  path(0, 0);
  g.fill();
  g.stroke();
  g.fillStyle = tone === "shout" ? "#d0202a" : "#16141c";
  g.textBaseline = "middle";
  lines.forEach((l, i) => g.fillText(l, 30, 20 + lh / 2 + i * lh + 2));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  t = { tex, aspect: c.width / c.height };
  cache.set(key, t);
  return t;
}


/** A bubble sprite: bottom-left corner (the tail) at its position. `height` in metres (one line). */
export function speechSprite(text: string, tone: Tone = "talk", height = 0.85) {
  const { tex, aspect } = texture(text, tone);
  // drawn over everything once shown: whether it is shown at all is the occlusion probe's call
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  s.center.set(0.1, 0);
  // `height` is a one-line bubble's (metres); more lines make it taller, the letters stay the same
  const px = (tex.image as HTMLCanvasElement).height;
  const k = height / 116;
  s.scale.set(k * px * aspect, k * px, 1);
  s.renderOrder = 6;
  s.userData.speech = true;
  s.userData.lines = px / 116;
  s.userData.aspect = aspect;
  return s;
}

/**
 * Every speech bubble of the street and the walk-in places goes through here, one policy for all:
 *  - shown only when its speaker can be seen: a tiny invisible probe at the bubble's tail is drawn
 *    after the solid geometry inside a GPU occlusion query (any sample passing the depth test). A
 *    speaker behind a wall, a building, a floor: the bubble fades out. Once shown it is drawn on
 *    top of everything (no depth test), so it never sinks into a wall or a ceiling either;
 *  - a steady size on screen (Big Ben's first-person bubbles: readable, never huge), whatever the
 *    distance or the camera;
 *  - kept inside the screen and apart from each other (pushed up above the one below);
 *  - a few at once: the nearest, most in front, and the people you talk to first.
 * Other systems that own their bubbles (the stadium's crowd shouts, visitors' emojis) can `track`
 * them to get the same occlusion (opacity × visibility; their own `userData.alpha`).
 */
interface Entry {
  s: THREE.Sprite;
  parent: THREE.Object3D;
  probe: THREE.Sprite;
  /** A `sayAt` bubble: timed, sized and laid out here. Else only faded by occlusion. */
  own: boolean;
  tone: Tone | null;
  age: number;
  life: number;
  q: WebGLQuery | null;
  pending: boolean;
  active: boolean;
  askedAt: number;
  asked: number;
  drawn: number;
  seen: boolean;
  vis: number;
  dx: number;
  dy: number;
  // this frame
  x: number;
  y: number;
  w: number;
  h: number;
  mpp: number;
  dist: number;
  score: number;
  ok: boolean;
}

const PROBE = new THREE.SpriteMaterial({ colorWrite: false, depthWrite: false, depthTest: true, transparent: true, fog: false });
const noRaycast = () => {};
const v = new THREE.Vector3();
const camPos = new THREE.Vector3();

class Bubbles {
  /** At most this many `sayAt` bubbles on screen. */
  max = 4;
  /** One-line bubble height as a share of the view's height: [min, max] (perspective), ortho. */
  size: [number, number] = [0.06, 0.095];
  orthoSize = 0.055;
  /** Farther speakers (metres, perspective cameras) get no bubble. */
  range = 70;
  private gl: WebGL2RenderingContext | null = null;
  private cam: THREE.Camera | null = null;
  private frame = 0;
  private t = 0;
  private list: Entry[] = [];
  private addressed = new WeakMap<THREE.Object3D, number>();
  private H = typeof window !== "undefined" ? window.innerHeight : 800;

  /**
   * World height (metres) of a one-line bubble at `at` seen from `camera`, by the same rule as the
   * `sayAt` bubbles (a steady share of the screen), for systems that size their own (crowd shouts).
   */
  metres(camera: THREE.Camera, at: THREE.Vector3, k = 1) {
    const pc = camera as THREE.PerspectiveCamera;
    if (!pc.isPerspectiveCamera) return 1;
    camera.updateMatrixWorld();
    const depth = Math.max(pc.near, -v.copy(at).applyMatrix4(camera.matrixWorldInverse).z);
    const mpp = (2 * depth * Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2)) / (pc.zoom || 1) / this.H;
    return THREE.MathUtils.clamp(0.85 / mpp, this.size[0] * this.H, this.size[1] * this.H) * k * mpp;
  }

  init(renderer: THREE.WebGLRenderer) {
    const gl = renderer.getContext();
    this.gl = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext ? gl : null;
  }

  /** How many bubbles are live (shown or not) and how many shown right now. */
  get stats() {
    return { live: this.list.length, shown: this.list.filter((e) => e.vis > 0.5).length };
  }

  /** Someone the visitor is talking to (clicked): their bubbles win over everyone's for a while. */
  address(o: THREE.Object3D, seconds = 20) {
    this.addressed.set(o, this.t + seconds);
  }

  private isAddressed(o: THREE.Object3D | null) {
    for (let k = 0; o && k < 4; k++, o = o.parent) if ((this.addressed.get(o) ?? -1) > this.t) return true;
    return false;
  }

  private add(s: THREE.Sprite, own: boolean, tone: Tone | null, life: number) {
    const parent = s.parent!;
    const probe = new THREE.Sprite(PROBE);
    probe.raycast = noRaycast;
    // first among the see-through things: tested against the solid geometry only
    probe.renderOrder = -1000;
    probe.position.copy(s.position);
    probe.scale.setScalar(0.2);
    const e: Entry = { s, parent, probe, own, tone, age: 0, life, q: null, pending: false, active: false, askedAt: 0, asked: -1, drawn: -99, seen: false, vis: 0, dx: 0, dy: 0, x: 0, y: 0, w: 1, h: 1, mpp: 0.01, dist: 0, score: 0, ok: false };
    probe.onBeforeRender = (_r, _s, camera) => {
      const gl = this.gl;
      if (camera !== this.cam || !gl) return;
      e.drawn = this.frame;
      if (e.pending || e.active || e.asked === this.frame) return;
      e.q ??= gl.createQuery();
      if (!e.q) return;
      gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, e.q);
      e.active = true;
      e.asked = this.frame;
    };
    probe.onAfterRender = () => {
      if (!e.active || !this.gl) return;
      this.gl.endQuery(this.gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
      e.active = false;
      e.pending = true;
      e.askedAt = this.t;
    };
    parent.add(probe);
    if (!own) (s.material as THREE.SpriteMaterial).depthTest = false;
    this.list.push(e);
    return e;
  }

  /** Occlusion only, for a bubble some other system owns (dropped once hidden or removed). */
  track(s: THREE.Sprite) {
    if (!s.parent || this.list.some((e) => e.s === s)) return;
    this.add(s, false, null, Infinity);
  }

  /** A timed bubble over `parent` (see `sayAt`). One per speaker: the previous one makes way. */
  say(parent: THREE.Object3D, text: string, tone: Tone, y: number, seconds: number, height?: number) {
    for (const e of this.list) if (e.own && e.parent === parent && e.life > e.age + 0.15) e.life = e.age + 0.15;
    const s = speechSprite(text, tone, height);
    s.position.set(0, y, 0);
    s.visible = false;
    parent.add(s);
    this.add(s, true, tone, seconds);
    return s;
  }

  private drop(i: number) {
    const e = this.list[i];
    this.list.splice(i, 1);
    e.probe.removeFromParent();
    if (e.q && this.gl) this.gl.deleteQuery(e.q);
    if (e.own) {
      if (e.s.parent === e.parent) e.parent.remove(e.s);
      e.s.material.dispose();
    } else (e.s.material as THREE.SpriteMaterial).opacity = (e.s.userData.alpha as number | undefined) ?? 1;
  }

  /** Every frame, before the frame is drawn with `camera` (w × h CSS pixels). */
  update(dt: number, camera: THREE.Camera, W: number, H: number) {
    this.frame++;
    this.t += dt;
    this.cam = camera;
    this.H = H;
    if (!this.list.length) return;
    const gl = this.gl;
    camera.updateMatrixWorld();
    camera.getWorldPosition(camPos);
    const pc = camera as THREE.PerspectiveCamera;
    const oc = camera as THREE.OrthographicCamera;
    const persp = !!pc.isPerspectiveCamera;
    const tanH = persp ? Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2) / (pc.zoom || 1) : 0;
    const orthoMpp = oc.isOrthographicCamera ? (oc.top - oc.bottom) / oc.zoom / H : 0;
    const [lo, hi] = this.size;
    const cand: Entry[] = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.s.parent !== e.parent || (e.own ? e.age >= e.life : !e.s.visible)) {
        this.drop(i);
        continue;
      }
      if (e.own) e.age += dt;
      // the GPU's answer (a frame or two late)
      if (e.pending && gl && e.q) {
        if (gl.getQueryParameter(e.q, gl.QUERY_RESULT_AVAILABLE)) {
          e.seen = !!gl.getQueryParameter(e.q, gl.QUERY_RESULT);
          e.pending = false;
        } else if (this.t - e.askedAt > 0.5) e.pending = false;
      }
      e.probe.position.copy(e.s.position);
      e.ok = false;
      e.s.getWorldPosition(v);
      e.dist = v.distanceTo(camPos);
      v.applyMatrix4(camera.matrixWorldInverse);
      const depth = -v.z;
      const near = persp ? pc.near : -Infinity;
      if (depth <= near) continue;
      e.mpp = persp ? (2 * depth * tanH) / H : orthoMpp;
      e.probe.scale.setScalar(Math.max(0.06, 16 * e.mpp));
      v.applyMatrix4(camera.projectionMatrix);
      e.x = ((v.x + 1) / 2) * W;
      e.y = ((v.y + 1) / 2) * H;
      if (e.own) {
        const lines = (e.s.userData.lines as number) ?? 1;
        const one = persp ? THREE.MathUtils.clamp(0.85 / e.mpp, lo * H, hi * H) : this.orthoSize * H;
        e.h = one * lines * (e.tone === "shout" ? 1.08 : 1);
        e.w = e.h * ((e.s.userData.aspect as number) ?? 2);
      }
      // the speaker on screen, near enough, and seen by the probe lately (not behind anything)
      const onScreen = Math.abs(v.x) <= 1.02 && Math.abs(v.y) <= 1.02;
      const fresh = this.frame - e.drawn <= 3;
      e.ok = onScreen && fresh && e.seen && (!persp || e.dist < this.range);
      if (!e.ok || !e.own) continue;
      const off = Math.min(1.5, Math.hypot(v.x, v.y));
      e.score = e.dist * (1 + off);
      // close and in front: someone talking to you
      if (e.dist < 6 && Math.abs(v.x) < 0.7) e.score -= 1e3;
      if (this.isAddressed(e.parent)) e.score -= 1e6;
      cand.push(e);
    }
    // the layout: best first, each kept inside the screen and pushed up above those already placed
    cand.sort((a, b) => a.score - b.score);
    const placed: [number, number, number, number][] = [];
    const M = 8,
      GAP = 4;
    let shown = 0;
    for (const e of cand) {
      if (shown >= this.max) {
        e.ok = false;
        continue;
      }
      const l0 = e.x - 0.1 * e.w,
        b0 = e.y;
      let dx = 0,
        dy = 0;
      if (l0 < M) dx = M - l0;
      else if (l0 + e.w > W - M) dx = Math.max(M - l0, W - M - (l0 + e.w));
      if (b0 + e.h > H - M) dy = H - M - (b0 + e.h);
      for (let k = 0; k < 8; k++) {
        const L = l0 + dx,
          B = b0 + dy;
        const hit = placed.find((r) => L < r[2] + GAP && L + e.w > r[0] - GAP && B < r[3] + GAP && B + e.h > r[1] - GAP);
        if (!hit) break;
        dy = hit[3] + GAP - b0;
      }
      if (dy > e.h * 2.6 || b0 + dy + e.h > H + e.h * 0.3) {
        e.ok = false;
        continue;
      }
      shown++;
      // a closing bubble is not in anyone's way
      if (e.life - e.age > 0.2) placed.push([l0 + dx, b0 + dy, l0 + dx + e.w, b0 + dy + e.h]);
      // slide, unless it is only appearing
      const k = e.vis < 0.05 ? 1 : Math.min(1, dt * 10);
      e.dx += (dx - e.dx) * k;
      e.dy += (dy - e.dy) * k;
    }
    for (const e of this.list) {
      e.vis = e.ok ? Math.min(1, e.vis + dt * 7) : Math.max(0, e.vis - dt * 5);
      const m = e.s.material as THREE.SpriteMaterial;
      if (!e.own) {
        m.opacity = ((e.s.userData.alpha as number | undefined) ?? 1) * e.vis;
        continue;
      }
      // pops in and out
      const pop = Math.max(0.01, Math.min(1, e.age * 7, (e.life - e.age) * 6));
      e.s.scale.set(e.w * e.mpp * pop, e.h * e.mpp * pop, 1);
      e.s.center.set(0.1 - e.dx / e.w, -e.dy / e.h);
      m.opacity = e.vis;
      e.s.visible = e.vis > 0.003;
    }
  }
}

export const bubbles = new Bubbles();

/** Show a bubble over `parent` at height `y` for `seconds`, popping in and out (see `Bubbles`). */
export function sayAt(parent: THREE.Object3D, text: string, tone: Tone, y: number, seconds: number, height?: number) {
  return bubbles.say(parent, text, tone, y, seconds, height);
}

/** Kept for older callers: the bubbles keep their own size on screen now. */
export function setBubbleScale(_k: number) {}

// for the shot scripts (shots/*.mjs): what each bubble is doing
if (typeof window !== "undefined" && new URLSearchParams(location.search).has("debug")) Object.assign(window, { bubbles });
