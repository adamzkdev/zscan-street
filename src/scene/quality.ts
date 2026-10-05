/**
 * Adaptive render quality. The full look (retina resolution, 4K shadow map, bloom, tilt-shift)
 * is too much for phones and modest laptops, and a slow frame rate made the whole city crawl.
 * The frame time is watched over a few seconds: when it stays slow the next tier down is applied
 * (resolution first, then shadows, then post effects); when there is plenty of headroom for a
 * while it climbs back, but never past a tier it already had to leave twice.
 */
export interface Tier {
  /** Cap on the device pixel ratio. */
  dpr: number;
  /** Shadow map size; 0 turns shadows off. */
  shadow: number;
  bloom: boolean;
  tilt: boolean;
}

export const TIERS: Tier[] = [
  { dpr: 2, shadow: 4096, bloom: true, tilt: true },
  { dpr: 1.5, shadow: 2048, bloom: true, tilt: true },
  { dpr: 1, shadow: 2048, bloom: true, tilt: false },
  { dpr: 1, shadow: 1024, bloom: false, tilt: false },
  { dpr: 0.75, shadow: 0, bloom: false, tilt: false },
];

const TOUCH = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

export class Quality {
  /** Index into TIERS. Phones start mid-way; desktops at the top. */
  level: number;
  private fixed: boolean;
  private acc = 0;
  private frames = 0;
  private good = 0;
  private drops = new Map<number, number>();

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
    if (this.fixed || dt <= 0 || dt > 0.5) return; // a hidden tab or a hitch says nothing
    this.acc += dt;
    this.frames++;
    if (this.acc < 2.5) return;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (fps < 40 && this.level < TIERS.length - 1) {
      this.drops.set(this.level, (this.drops.get(this.level) ?? 0) + 1);
      this.set(this.level + 1);
      this.good = 0;
    } else if (fps > 57 && this.level > 0 && (this.drops.get(this.level - 1) ?? 0) < 2) {
      // ten seconds of easy frames before trying the richer tier again
      if (++this.good >= 4) {
        this.good = 0;
        this.set(this.level - 1);
      }
    } else this.good = 0;
  }

  private set(level: number) {
    this.level = level;
    this.apply(TIERS[level]);
    console.info(`render quality → tier ${level}`, TIERS[level]);
  }
}
