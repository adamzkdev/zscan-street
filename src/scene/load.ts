import * as THREE from "three";
import { isStill, napBranches, naps } from "./matrices";

/**
 * The processor's share of the frame, adapted. quality.ts trades pixels and shadow maps for a slow
 * GPU; a slow processor gains nothing from those, its frame is held up by the page's own work (the
 * street's people and cars, the screens' redraws, the shadow pass's draws). Here that work is cut
 * where the eye does not follow it:
 *
 * - level 0 (a quick machine): everything as it is, every frame. Only waste is skipped at any
 *   level, the same picture either way (what stands outside the camera's view is not animated or
 *   redrawn: it is brought up to date the frame it comes into view).
 * - level 1: the shadow map is drawn every other frame, the screens and boards redraw at a lower
 *   rate and only nearer, the far people and the minimap move on alternate frames.
 * - level 2: a third of the rate for all of these.
 * - level 3 (a weak processor, some five times slower than a quick one): a quarter of the rate;
 *   the small things (props, lamps, benches, signs, under 4 m round) the fog has mostly taken are no
 *   longer drawn (thrift.ts, cut()); the still branches of the street are brought up to date on
 *   alternate frames (whatever moves in one wakes it up, matrices.ts naps) and those out of the
 *   picture are skipped whole by the drawing's walk (hideUnseen); the far people's poses come
 *   on alternate frames or one in three.
 * - level 4: a fifth of the rate (the shadow map too, one frame in five), the small things drawn
 *   as far as the fog's first half only, the medium ones (under 9 m) as far as its last third;
 *   the still branches brought up to date one frame in three.
 *
 * The level climbs within a few seconds of a slow frame rate whose frames are filled by the page's
 * own work (two levels for a window under 35 fps, one for a window under 45 or two in a row under
 * 56: a weak processor is at level 4 some ten seconds after the street is up), comes back down after twenty
 * seconds of full-rate frames done in half their time (a passing hitch on a quick machine), and stops changing after a few moves. `?cpu=n`
 * holds it at n (0: the full work, always).
 */
const WINDOW = 1;
/** After a level change or a transition, frames are not measured for this long (s). */
const SETTLE = 1;
/** Frame work over this (ms per frame, the page's own): the processor is what holds the frame. */
const HEAVY = 9;
/** Frame work under this (ms), at a full frame rate: there is room for the level above. */
const LIGHT = 8;
const CLIMB_AFTER = 20;
const MAX_CHANGES = 8;
export const LEVELS = 4;
/** The redraw rate's share at each level (screens, boards, tickers). */
const RATE = [1, 0.5, 0.34, 0.25, 0.2];
/** At levels 3 and 4: how far into the fog (0 its start, 1 where it is whole) small things stop being drawn, and medium ones. */
const CUT_SMALL = [2, 2, 2, 0.72, 0.45];
const CUT_MEDIUM = [2, 2, 2, 2, 0.7];

const m = new THREE.Matrix4();
const s = new THREE.Sphere();

export class Load {
  level = 0;
  changes = 0;
  /** Frames drawn since the start: who skips frames does so on its own turn. */
  frame = 0;
  /** The view of the camera that draws this frame (see view()). */
  readonly frustum = new THREE.Frustum();
  /** Where that camera stands. */
  readonly eye = new THREE.Vector3();
  /** Something heavy and short-lived is going on (as quality.busy): frames are not measured. */
  busy: () => boolean = () => false;
  private fixed = false;
  private acc = 0;
  private frames = 0;
  private work = 0;
  private settle = SETTLE;
  private slow = 0;
  private good = 0;
  /** The last window's frame work (ms per frame). */
  workMs = 0;
  /** The scene whose still branches nap at levels 3 and 4 (see watch()). */
  private scene: THREE.Object3D | null = null;
  private napAt = -1e9;
  /** The fog of this frame (see fog()). */
  private fogNear = 1e9;
  private fogFar = 1e9;

  constructor() {
    const q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("cpu") : null;
    if (q !== null) {
      this.fixed = true;
      this.level = Math.max(0, Math.min(LEVELS, Number(q) || 0));
    }
  }

  /** The redraw rate's share at this level (screens, boards, tickers). */
  get rate() {
    return RATE[this.level];
  }
  /** The fog this frame is drawn with (from the eye): where the far small things may stop being drawn. */
  fog(near: number, far: number) {
    this.fogNear = near;
    this.fogFar = far;
  }
  /**
   * Beyond this distance from the eye (to its nearest side) a thing of radius `r` is not drawn at
   * this level (Infinity: drawn): small things (under 4 m round) once the fog has mostly taken them,
   * medium ones (under 9 m) at level 4 a little further. Never at levels 0 to 2.
   */
  cut(r: number) {
    if (this.level < 3 || r >= 9) return Infinity;
    const k = r < 4 ? CUT_SMALL[this.level] : CUT_MEDIUM[this.level];
    return k > 1 ? Infinity : this.fogNear + k * (this.fogFar - this.fogNear);
  }
  /** One frame of this many does the work that may skip frames. */
  get stride() {
    return this.level + 1;
  }
  /** Whether the frame-skipping work of slot `slot` runs this frame. */
  turn(slot = 0) {
    return (this.frame + slot) % (this.level + 1) === 0;
  }

  /** The street's scene: at levels 3 and 4 its still branches are brought up to date on alternate frames (matrices.ts naps). */
  watch(scene: THREE.Object3D) {
    this.scene = scene;
    if (this.fixed) this.apply();
  }

  /** The camera that draws this frame: called once a frame, before the street is updated. */
  view(cam: THREE.Camera) {
    this.frame++;
    naps.frame = this.frame;
    // (what came into the street since is marked too, now and then)
    if (naps.every > 1 && this.scene && this.frame - this.napAt > 900) {
      this.napAt = this.frame;
      napBranches(this.scene);
      this.balls = ballsOf(this.scene);
    }
    this.cam = cam;
    cam.updateMatrixWorld();
    this.eye.setFromMatrixPosition(cam.matrixWorld);
    m.multiplyMatrices(cam.projectionMatrix, m.copy(cam.matrixWorld).invert());
    this.frustum.setFromProjectionMatrix(m, cam.coordinateSystem);
  }
  /**
   * Right before the street is drawn by the frame's camera (the scene's onBeforeRender), at levels 3
   * and 4: a still branch whose ball is out of the picture is hidden for the drawing's walk, its
   * children not visited one by one (they would all be culled). Shown again before the shadow
   * map's pass (unhide), which sees from elsewhere.
   */
  hideUnseen(cam: THREE.Camera) {
    if (naps.every <= 1 || cam !== this.cam) return;
    let fresh = 0;
    for (const b of this.balls) {
      const o = b.o;
      if (!o.visible || !o.parent) continue;
      if (!isStill(o)) {
        b.stale = true;
        continue;
      }
      if (b.stale) {
        // (still again: its ball made again, a few a frame)
        if (fresh++ > 12) continue;
        ballOf(o, b.s);
        b.stale = false;
      }
      if (!this.frustum.intersectsSphere(b.s)) {
        o.visible = false;
        this.hidden.push(o);
      }
    }
  }
  /** Everything hideUnseen hid, shown again. */
  unhide() {
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
  }
  private cam: THREE.Camera | null = null;
  private balls: Ball[] = [];
  private hidden: THREE.Object3D[] = [];

  /** A ball at `p` of radius `r` is (or may be) in the picture. */
  sees(p: THREE.Vector3, r: number) {
    s.center.copy(p);
    s.radius = r;
    return this.frustum.intersectsSphere(s);
  }

  /** Feed each rendered frame's real time (s) and the page's own work on the last one (ms). */
  sample(dt: number, busyMs: number) {
    if (this.fixed || this.changes >= MAX_CHANGES) return;
    if (dt <= 0 || dt > 0.5 || (typeof document !== "undefined" && document.hidden) || this.busy()) {
      this.acc = this.frames = this.work = 0;
      this.settle = SETTLE;
      return;
    }
    if (this.settle > 0) {
      this.settle -= dt;
      return;
    }
    this.acc += dt;
    this.frames++;
    this.work += busyMs;
    if (this.acc < WINDOW) return;
    const fps = this.frames / this.acc;
    const work = (this.workMs = this.work / this.frames);
    this.acc = this.frames = this.work = 0;
    if (fps < 56 && work > HEAVY && this.level < LEVELS) {
      this.good = 0;
      // (far too slow: two levels at once; slow: one; a little short of the full rate, twice in a row: one)
      if (fps < 35) this.set(Math.min(LEVELS, this.level + 2));
      else if (fps < 45 || ++this.slow >= 2) this.set(this.level + 1);
      return;
    }
    this.slow = 0;
    if (this.level > 0 && fps >= 58 && work < LIGHT) {
      if (++this.good >= CLIMB_AFTER) this.set(this.level - 1);
    } else this.good = 0;
  }

  private apply() {
    naps.every = this.level >= 4 ? 3 : this.level >= 3 ? 2 : 1;
    this.napAt = -1e9;
  }

  private set(level: number) {
    this.level = level;
    this.apply();
    this.changes++;
    this.slow = this.good = 0;
    this.settle = SETTLE;
    console.info(`processor load → level ${level} (frame work ${this.workMs.toFixed(1)} ms)`);
  }
}

interface Ball {
  o: THREE.Object3D;
  s: THREE.Sphere;
  stale: boolean;
}
const part = new THREE.Sphere();
/** Branches that may be culled whole: only plain things in them, culled by the frustum one by one already. */
const PLAIN = (o: THREE.Object3D) => {
  const x = o as THREE.Mesh & { isInstancedMesh?: boolean; isBatchedMesh?: boolean; isSkinnedMesh?: boolean; isLOD?: boolean; isLight?: boolean; isCamera?: boolean };
  if (x.isLight || x.isCamera || x.isLOD || x.isInstancedMesh || x.isBatchedMesh || x.isSkinnedMesh || x.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
  if (x.isMesh || (x as unknown as THREE.Points).isPoints || (x as unknown as THREE.Line).isLine || (x as unknown as THREE.Sprite).isSprite) return x.frustumCulled;
  return true;
};
/** Its ball in the world (with a margin: the camera may still shake after the frame's view is taken). */
function ballOf(o: THREE.Object3D, out: THREE.Sphere) {
  out.makeEmpty();
  o.traverse((c) => {
    const g = (c as THREE.Mesh).geometry;
    if ((c as THREE.Sprite).isSprite) {
      part.center.setFromMatrixPosition(c.matrixWorld);
      part.radius = c.matrixWorld.getMaxScaleOnAxis() * 0.75;
    } else if (g) {
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (!g.boundingSphere || !Number.isFinite(g.boundingSphere.radius)) return;
      part.copy(g.boundingSphere).applyMatrix4(c.matrixWorld);
    } else return;
    out.isEmpty() ? out.copy(part) : out.union(part);
  });
  if (!out.isEmpty()) out.radius += 3;
  else out.radius = Infinity;
}
/** The branches of the street that hideUnseen may cull: plain, of a few things or more, not too wide. */
function ballsOf(root: THREE.Object3D) {
  const out: Ball[] = [];
  // (each branch once, from its leaves up: plain all through, and how many things)
  const info = new Map<THREE.Object3D, number>();
  const walk = (o: THREE.Object3D): number => {
    let plain = PLAIN(o);
    let n = 1;
    for (const c of o.children) {
      const k = walk(c);
      if (k < 0) plain = false;
      n += Math.abs(k);
    }
    info.set(o, plain ? n : -n);
    return plain ? n : -n;
  };
  walk(root);
  // (from the top: the widest plain branches of a few things; inside one too wide, its own)
  const pick = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (info.get(c)! >= 3) {
        const s = new THREE.Sphere();
        ballOf(c, s);
        if (s.radius < 90) {
          out.push({ o: c, s, stale: false });
          continue;
        }
      }
      if (c.children.length) pick(c);
    }
  };
  pick(root);
  return out;
}

export const load = new Load();

/**
 * Work that may skip frames at a higher level: its time is kept and handed over in one go on its
 * turn (a mover then covers two frames' way at once, never less).
 */
export class Stride {
  private dt = 0;
  constructor(private slot = 0) {}
  /** The time to step by this frame, or 0 when this frame is not its turn. */
  step(dt: number) {
    this.dt += dt;
    if (!load.turn(this.slot)) return 0;
    const d = this.dt;
    this.dt = 0;
    return d;
  }
}
