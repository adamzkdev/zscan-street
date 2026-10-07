/**
 * The street's districts, each with its own layer over the city mix: Shibuya's crossing (chatter,
 * the "piyo" signal, the giant screens' jingles), the river and the bay (water lapping, gulls,
 * a ferry's horn), Central Park (birds by day, crickets at night, the fountain), the Proof Factory
 * district (an industrial hum), Block Stadium (a distant roar). Each district's weight comes from
 * how close the ear is to it; a district's scene is built when you get near, torn down after you
 * have been away a while.
 */
import { BAY, GRID, LOTS, PARK, RIVER } from "../scene/city/plan";
import { bed, bell, bird, brass, burst, clank, cricket, drum, fountain, gull, lapping, murmur, type Room, Scene, tone, wind, type Bufs } from "./lib";

const OPEN: Room = { len: 1.4, decay: 3.5, tone: 0.4, wet: 0.25 };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const side = () => Math.random() * 1.6 - 0.8;

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
const lot = (k: string): Rect => LOTS.find((l) => l.kind === k) ?? { x0: 1e6, x1: 1e6, z0: 1e6, z1: 1e6 };
/** Distance from a point to a rectangle (0 inside). */
const dRect = (r: Rect, x: number, z: number) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
const fall = (d: number, reach: number) => Math.max(0, 1 - d / reach);

export interface StreetEar {
  x: number;
  z: number;
  near: number;
  night: boolean;
}

interface District {
  /** 0..1 at the ear. */
  weight: (e: StreetEar) => number;
  build: (s: Scene, e: StreetEar) => void;
  /** Per-update tweaks (the fountain louder as you walk up to it). */
  update?: (s: Scene, e: StreetEar) => void;
}

const SHIBUYA = lot("shibuya");
const STADIUM = lot("stadium");
const PORT = lot("port");
const PARKR = { x0: GRID.park.x0, x1: GRID.park.x1, z0: GRID.park.z0, z1: GRID.park.z1 };

const DISTRICTS: Record<string, District> = {
  shibuya: {
    weight: (e) => fall(dRect(SHIBUYA, e.x, e.z), 45),
    build(s) {
      murmur(s, "scramble-chatter", 0.1, 0.25, 0.2);
      // the scramble: the crossing's "piyo-piyo" while everyone walks, then the cars' turn
      let next = s.now + 1;
      let phase = 0;
      s.seq((until) => {
        while (next < until) {
          const walk = phase % 60 < 22;
          if (walk) {
            for (const dt of [0, 0.17]) tone(s, next + dt, 2300, "sine", 0.025, 0.12, 0.2, { to: 3300, pan: -0.3 });
            next += 0.62;
            phase += 0.62;
          } else {
            next += 1;
            phase += 1;
          }
        }
      });
      s.layers.push("piyo-signal");
      // the giant screens' jingles and ads
      s.every("screen-jingle", 10, 22, (t) => {
        const tunes = [
          [72, 76, 79, 84, 79],
          [67, 72, 74, 76, 79, 76],
          [76, 74, 72, 74, 76, 76, 76],
        ];
        const tune = tunes[Math.floor(Math.random() * tunes.length)];
        const pan = side();
        tune.forEach((n, i) => tone(s, t + i * 0.16, 440 * Math.pow(2, (n - 69) / 12), "square", 0.012, 0.14, 0.5, { lp: 2500, pan }));
        drum(s, t, 60, 0.05, 0.5, pan);
      });
      s.every("station-melody", 30, 60, (t) => [659, 784, 988, 880, 1047].forEach((f, i) => bell(s, t + i * 0.14, f, 0.5, 0.02, 0.5, 0.6)));
    },
  },
  river: {
    weight: (e) => fall(Math.max(0, Math.abs(e.z - (RIVER.z0 + RIVER.z1) / 2) - (RIVER.z1 - RIVER.z0) / 2), 28),
    build(s, e) {
      lapping(s, 0.16, 0.1);
      if (!e.night) s.every("gulls", 6, 16, (t) => gull(s, t, 0.02, side()));
      s.every("boat-engine", 25, 50, (t) => tone(s, t, 58, "sawtooth", 0.03, 2, 0.2, { a: 3, hold: 4, lp: 220, pan: side() }));
    },
  },
  bay: {
    weight: (e) => fall(Math.max(0, BAY.z0 - 8 - e.z), 50),
    build(s, e) {
      lapping(s, 0.2, 0.15);
      wind(s, 0.04);
      s.every("gulls", e.night ? 20 : 4, e.night ? 40 : 11, (t) => gull(s, t, 0.03, side()));
      // the ferry's deep horn across the water
      s.every(
        "ferry-horn",
        30,
        70,
        (t) => {
          for (const f of [110, 138.6]) brass(s, t, f, 2.2, 0.035, 0.7, 600);
        },
        10,
      );
      s.every("buoy-bell", 12, 25, (t) => bell(s, t, 660, 2.5, 0.015, 0.6, side()));
    },
  },
  park: {
    weight: (e) => fall(dRect(PARKR, e.x, e.z), 22),
    build(s, e) {
      bed(s, "leaves", { kind: "pink", type: "highpass", f: 2500, gain: 0.03, am: [[0.13, 0.6]] });
      if (e.night) {
        s.every("crickets", 0.3, 1.2, (t) => cricket(s, t, 0.012, side()));
        s.every("owl", 25, 50, (t) => {
          tone(s, t, 420, "sine", 0.03, 0.4, 0.4, { a: 0.05, hold: 0.15, to: 380 });
          tone(s, t + 0.7, 420, "sine", 0.025, 0.6, 0.4, { a: 0.05, hold: 0.3, to: 370 });
        });
      } else {
        s.every("birds", 0.5, 2.5, (t) => bird(s, t, 0.018, side()));
        s.every("ducks", 20, 45, (t) => {
          for (let i = 0; i < 3; i++) tone(s, t + i * 0.18, rnd(500, 600), "sawtooth", 0.02, 0.12, 0.1, { lp: 1600, to: 380 });
        });
      }
      // the fountain terrace: louder as you walk up to it
      const f = s.child("park-fountain");
      fountain(f, 1, 0.2);
      s.layers.push("fountain");
      s.knobs.fountain = f.out.gain;
    },
    update(s, e) {
      s.knobs.fountain?.setTargetAtTime(parkFountainLevel(e), s.now, 0.5);
    },
  },
  factory: {
    weight: (e) => fall(dRect(PORT, e.x, e.z), 40),
    build(s) {
      bed(s, "industrial-hum", { kind: "brown", type: "lowpass", f: 160, gain: 0.25 });
      bed(s, "vents", { kind: "pink", type: "bandpass", f: 500, q: 0.7, gain: 0.08, am: [[4, 0.1]] });
      s.every("machine-clank", 3, 8, (t) => clank(s, t, rnd(150, 220), 0.05, 0.8, 0.4, side()));
      s.every("steam", 10, 20, (t) => burst(s, t, "white", "highpass", 3000, 0.7, 0.05, 1, 0.3, side(), 0.05));
      s.every("truck-reverse", 15, 35, (t) => {
        for (let i = 0; i < 5; i++) tone(s, t + i * 0.8, 1000, "square", 0.01, 0.03, 0.3, { hold: 0.4, lp: 3000, pan: side() });
      });
    },
  },
  stadium: {
    weight: (e) => fall(dRect(STADIUM, e.x, e.z), 90),
    build(s) {
      const roar = bed(s, "distant-roar", { kind: "pink", type: "lowpass", f: 650, gain: 0.18, am: [[0.1, 0.3], [0.31, 0.15]] });
      s.knobs.crowd = roar.gain;
      s.every("distant-swell", 4, 10, (t) => {
        roar.gain.setTargetAtTime(0.3, t, 0.5);
        roar.gain.setTargetAtTime(0.18, t + 2, 1);
      });
      s.every("distant-drums", 8, 16, (t) => {
        for (let i = 0; i < 8; i++) drum(s, t + i * 0.375, 70, 0.05, 0.5);
      });
      s.on.goal = (t) => {
        roar.gain.cancelScheduledValues(t);
        roar.gain.setTargetAtTime(0.7, t, 0.15);
        roar.gain.setTargetAtTime(0.18, t + 3.5, 1.5);
      };
    },
  },
};

/** The fountain's distance in Central Park, for its own level. */
export const parkFountainLevel = (e: StreetEar) => fall(Math.hypot(e.x - PARK.fountain.x, e.z - PARK.fountain.z), 30) * 0.08 + 0.005;

interface Live {
  scene: Scene;
  away: number;
}

/** The districts' layers, kept in step with the ear. */
export class Districts {
  private live = new Map<string, Live>();
  weights: Record<string, number> = {};

  constructor(
    private ctx: AudioContext,
    private bufs: Bufs,
    private dest: AudioNode,
  ) {}

  update(e: StreetEar, dt: number) {
    for (const [key, d] of Object.entries(DISTRICTS)) {
      const w = d.weight(e) * e.near;
      this.weights[key] = Math.round(w * 100) / 100;
      let l = this.live.get(key);
      if (!l && w > 0.03) {
        const s = new Scene(this.ctx, this.bufs, this.dest, "street:" + key, OPEN);
        d.build(s, e);
        l = { scene: s, away: 0 };
        this.live.set(key, l);
      }
      if (!l) continue;
      l.away = w > 0.01 ? 0 : l.away + dt;
      d.update?.(l.scene, e);
      l.scene.out.gain.setTargetAtTime(w, this.ctx.currentTime, 0.6);
      if (l.away > 8) {
        l.scene.close(0.5);
        this.live.delete(key);
      }
    }
  }

  tick() {
    for (const l of this.live.values()) l.scene.tick();
  }

  event(name: string, arg?: unknown) {
    const t = this.ctx.currentTime + 0.05;
    for (const l of this.live.values()) l.scene.on[name]?.(t, arg);
  }

  /** Leaving the street: fade them all out (rebuilt on the way back). */
  closeAll(s = 1.2) {
    for (const l of this.live.values()) l.scene.close(s);
    this.live.clear();
  }

  layers() {
    const out: Record<string, string[]> = {};
    for (const [k, l] of this.live) out[k] = l.scene.layers;
    return out;
  }
}
