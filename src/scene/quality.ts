/**
 * Adaptive render quality. The full look (retina resolution, 4K shadow map, bloom, tilt-shift)
 * is too much for phones and modest laptops, and a slow frame rate made the whole city crawl.
 *
 * The tier is sticky: every change costs (new shader variants, a resized shadow map, a hitch), so
 * flipping back and forth on a borderline machine was worse than either tier. It drops fast when
 * the frame rate really falls (one window under 25 fps, or two in a row under 40), climbs back only
 * after a full minute of easy frames, never to a tier it already had to leave, and stops changing
 * after a few moves per session. Frames measured while something heavy and short-lived happens
 * (entering a place, a camera flight, a hidden tab) say nothing about the device and are skipped.
 */
export interface Tier {
  /** Cap on the device pixel ratio. */
  dpr: number;
  /** Shadow map size; 0 turns shadows off. */
  shadow: number;
  bloom: boolean;
  tilt: boolean;
  /** Screen-space ambient occlusion. */
  ao: boolean;
  /** Screen-space reflections. */
  ssr: boolean;
}

export const TIERS: Tier[] = [
  { dpr: 2, shadow: 4096, bloom: true, tilt: true, ao: true, ssr: true },
  { dpr: 1.5, shadow: 2048, bloom: true, tilt: true, ao: true, ssr: true },
  { dpr: 1, shadow: 2048, bloom: true, tilt: false, ao: false, ssr: false },
  { dpr: 1, shadow: 1024, bloom: false, tilt: false, ao: false, ssr: false },
  { dpr: 0.75, shadow: 0, bloom: false, tilt: false, ao: false, ssr: false },
];

const TOUCH = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/** Length of one measuring window (s). */
const WINDOW = 2.5;
/** Easy windows in a row before trying the richer tier (24 × 2.5 s = a minute). */
const CLIMB_AFTER = 24;
/** Tier changes allowed per session; past that the tier stays where it is. */
const MAX_CHANGES = 4;
/** After a transition ends, its aftermath (uploads, first draws) is not measured either (s). */
const SETTLE = 2;

export class Quality {
  /** Index into TIERS. Phones start mid-way; desktops at the top. */
  level: number;
  /** Tier changes so far this session. */
  changes = 0;
  /**
   * Something heavy and short-lived is going on (an entry, a camera flight...): frames are not
   * measured. Set by the app.
   */
  busy: () => boolean = () => false;
  private fixed: boolean;
  private acc = 0;
  private frames = 0;
  private good = 0;
  private slow = 0;
  private settle = 0;
  private left = new Set<number>();

  constructor(private apply: (t: Tier) => void) {
    const q = new URLSearchParams(location.search).get("quality");
    this.fixed = q !== null;
    this.level = q !== null ? Math.max(0, Math.min(TIERS.length - 1, Number(q) || 0)) : TOUCH ? 2 : 0;
    apply(TIERS[this.level]);
  }

  get tier() {
    return TIERS[this.level];
  }

  /** Feed the real (unclamped) time of each rendered frame. */
  sample(dt: number) {
    if (this.fixed || this.changes >= MAX_CHANGES) return;
    // a hidden tab, a hitch or a transition says nothing about the device: drop the window
    if (dt <= 0 || dt > 0.5 || (typeof document !== "undefined" && document.hidden) || this.busy()) {
      this.acc = this.frames = 0;
      this.settle = SETTLE;
      return;
    }
    if (this.settle > 0) {
      this.settle -= dt;
      return;
    }
    this.acc += dt;
    this.frames++;
    if (this.acc < WINDOW) return;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    const last = TIERS.length - 1;
    if (fps < 40 && this.level < last) {
      this.good = 0;
      // really slow: drop now; borderline: only when the next window is slow too
      if (fps < 25 || ++this.slow >= 2) {
        this.slow = 0;
        this.left.add(this.level);
        this.set(this.level + 1);
      }
      return;
    }
    this.slow = 0;
    if (fps > 57 && this.level > 0 && !this.left.has(this.level - 1)) {
      if (++this.good >= CLIMB_AFTER) {
        this.good = 0;
        this.set(this.level - 1);
      }
    } else this.good = 0;
  }

  private set(level: number) {
    this.level = level;
    this.changes++;
    this.settle = SETTLE;
    this.apply(TIERS[level]);
    console.info(`render quality → tier ${level}`, TIERS[level]);
  }
}
