/**
 * The street's districts, each with its own layer of real recordings over the city's bed: Shibuya's
 * crossing (the crowd on the scramble, the "kakkō" crossing signal, the giant screens' jingles), the
 * river and the bay (a harbour, gulls, a ship's horn), the Golden Gate (wind, the fog horn), the
 * Palm (the sea on the beach), Central Park and the gardens (birds by day, crickets at night, the
 * fountain, the waterfall), the Proof Factory district (machines, forklifts), Block Stadium and the
 * Colosseum (crowds from afar), Paris (a street with an accordion), Westminster (Big Ben on the
 * hour). Each district's weight comes from how close the ear is to it; a district's scene is built
 * when you get near, torn down after you have been away a while.
 */
import { BAY, GRID, LOTS, PARK, RIVER } from "../scene/city/plan";
import { bell, drum, type Room, Scene, tone, type Bufs } from "./lib";
import { loop, preload, shot } from "./samples";
import { bigBenHours } from "./scenes";

const OPEN: Room = { len: 1.4, decay: 3.5, tone: 0.4, wet: 0.25 };
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
const GARDENS = lot("gardens");
const ROME = lot("colosseum");
const PARIS = lot("eiffel");
const WESTMINSTER = lot("parliament");
const PARKR = { x0: GRID.park.x0, x1: GRID.park.x1, z0: GRID.park.z0, z1: GRID.park.z1 };
const PALM = { x0: Math.min(BAY.palm.x0, BAY.arab.x0), x1: Math.max(BAY.palm.x1, BAY.arab.x1), z0: Math.min(BAY.palm.z0, BAY.arab.z0), z1: Math.max(BAY.palm.z1, BAY.arab.z1) };
/** The suspension bridge over the bay's mouth, as a thin strip. */
const BRIDGE = { x0: BAY.bridge.x - 6, x1: BAY.bridge.x + 6, z0: BAY.z0 - 10, z1: BAY.headland.z0 + 10 };

const DISTRICTS: Record<string, District> = {
  shibuya: {
    weight: (e) => fall(dRect(SHIBUYA, e.x, e.z), 45),
    build(s) {
      preload(s.ctx, "crossing-cuckoo");
      loop(s, "shibuya", 1);
      // the scramble's crossing signal while everyone walks
      s.every("crossing-signal", 22, 34, (t) => shot(s, "crossing-cuckoo", t, 0.35, { pan: -0.3 }), 3);
      // the giant screens' jingles and ads
      s.every("screen-jingle", 14, 28, (t) => {
        const tunes = [
          [72, 76, 79, 84, 79],
          [67, 72, 74, 76, 79, 76],
          [76, 74, 72, 74, 76, 76, 76],
        ];
        const tune = tunes[Math.floor(Math.random() * tunes.length)];
        const pan = side();
        tune.forEach((n, i) => tone(s, t + i * 0.16, 440 * Math.pow(2, (n - 69) / 12), "square", 0.008, 0.14, 0.5, { lp: 2500, pan }));
        drum(s, t, 60, 0.04, 0.5, pan);
      });
      s.every("station-melody", 40, 70, (t) => [659, 784, 988, 880, 1047].forEach((f, i) => bell(s, t + i * 0.14, f, 0.5, 0.015, 0.5, 0.6)));
    },
  },
  river: {
    weight: (e) => fall(Math.max(0, Math.abs(e.z - (RIVER.z0 + RIVER.z1) / 2) - (RIVER.z1 - RIVER.z0) / 2), 28),
    build(s) {
      loop(s, "harbour", 0.45, { lp: 2500 });
    },
  },
  bay: {
    weight: (e) => fall(Math.max(0, BAY.z0 - 8 - e.z), 50),
    build(s, e) {
      preload(s.ctx, "ship-horn");
      loop(s, "harbour", 0.85);
      loop(s, "gulls", e.night ? 0.12 : 0.35);
      // the ferry's deep horn across the water
      s.every("ship-horn", 45, 90, (t) => shot(s, "ship-horn", t, 0.45, { pan: side(), lp: 2000 }), 12);
    },
  },
  bridge: {
    weight: (e) => fall(dRect(BRIDGE, e.x, e.z), 45),
    build(s) {
      preload(s.ctx, "foghorn");
      loop(s, "wind", 0.6);
      s.every("foghorn", 25, 45, (t) => shot(s, "foghorn", t, 0.6, { pan: side() }), 4);
    },
  },
  palm: {
    weight: (e) => fall(dRect(PALM, e.x, e.z), 35),
    build(s) {
      loop(s, "waves", 0.9);
      loop(s, "wind", 0.12);
    },
  },
  park: {
    weight: (e) => fall(dRect(PARKR, e.x, e.z), 22),
    build(s, e) {
      loop(s, e.night ? "night-crickets" : "birds", 0.9);
      // the fountain terrace: louder as you walk up to it
      const f = s.child("park-fountain");
      loop(f, "waterfall", 1, { hp: 350 });
      s.layers.push("fountain");
      s.knobs.fountain = f.out.gain;
    },
    update(s, e) {
      s.knobs.fountain?.setTargetAtTime(parkFountainLevel(e), s.now, 0.5);
    },
  },
  gardens: {
    weight: (e) => fall(dRect(GARDENS, e.x, e.z), 30),
    build(s, e) {
      loop(s, e.night ? "night-crickets" : "birds", 0.7);
      loop(s, "waterfall", 0.45);
    },
  },
  factory: {
    weight: (e) => fall(dRect(PORT, e.x, e.z), 40),
    build(s) {
      preload(s.ctx, "forklift");
      loop(s, "industry", 0.8);
      s.every("forklift", 15, 35, (t) => shot(s, "forklift", t, 0.4, { pan: side() }), 5);
    },
  },
  stadium: {
    weight: (e) => fall(dRect(STADIUM, e.x, e.z), 90),
    build(s) {
      preload(s.ctx, "goal");
      const roar = loop(s, "stadium", 0.6, { lp: 900 });
      s.knobs.crowd = roar.gain;
      s.on.goal = (t, up) => {
        shot(s, "goal", t, up === false ? 0.5 : 0.8, { lp: 1400 });
        roar.gain.cancelScheduledValues(t);
        roar.gain.setTargetAtTime(0.9, t, 0.15);
        roar.gain.setTargetAtTime(0.6, t + 3.5, 1.5);
      };
    },
  },
  rome: {
    weight: (e) => fall(dRect(ROME, e.x, e.z), 50),
    build(s) {
      loop(s, "crowd-arena", 0.4, { lp: 800 });
    },
  },
  paris: {
    weight: (e) => fall(dRect(PARIS, e.x, e.z), 35),
    build(s) {
      loop(s, "paris", 0.75);
    },
  },
  westminster: {
    weight: (e) => fall(dRect(WESTMINSTER, e.x, e.z), 140),
    build(s) {
      bigBenHours(s, 0.9, { wet: 0.3 });
    },
  },
};

/** The fountain's distance in Central Park, for its own level. */
export const parkFountainLevel = (e: StreetEar) => fall(Math.hypot(e.x - PARK.fountain.x, e.z - PARK.fountain.z), 30) * 0.45 + 0.02;

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
