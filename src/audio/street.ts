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
import { load, loop, preload, shot } from "./samples";
import { pyramidMusic } from "./egypt";
import { bigBenHours } from "./scenes";

const OPEN: Room = { len: 1.4, decay: 3.5, tone: 0.4, wet: 0.25 };

/**
 * Music heard from a place as you pass it (the city's recordings, public/audio/music, one after
 * another from a random point): through its doors and walls — a low-pass — and a little room.
 */
function music(s: Scene, tracks: string[], level: number, lp = 2400, wet = 0.2) {
  const ctx = s.ctx;
  const bus = ctx.createGain();
  bus.gain.value = level;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lp;
  f.Q.value = 0.4;
  bus.connect(f);
  s.send(f, wet);
  let src: AudioBufferSourceNode | null = null;
  let i = Math.floor(Math.random() * tracks.length);
  const next = async (first: boolean) => {
    const buf = await load(ctx, `music/${tracks[i % tracks.length]}`);
    if (s.dead) return;
    if (!buf) return;
    const env = ctx.createGain();
    env.gain.value = 0;
    env.connect(bus);
    src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(env);
    const t = ctx.currentTime + 0.05;
    const off = first ? Math.random() * buf.duration * 0.7 : 0;
    src.start(t, off);
    env.gain.linearRampToValueAtTime(1, t + 1.2);
    env.gain.setValueAtTime(1, t + Math.max(1.3, buf.duration - off - 1.5));
    env.gain.linearRampToValueAtTime(0, t + buf.duration - off);
    src.onended = () => {
      env.disconnect();
      if (s.dead) return;
      i++;
      void next(false);
    };
  };
  void next(true);
  s.onClose(() => {
    try {
      src?.stop();
    } catch {}
  });
  s.layers.push(`music:${tracks[0]}`);
  return bus.gain;
}
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
const CEMETERY = lot("cemetery");
const MUSEUM = lot("museum");
const FOODHALL = lot("foodhall");
const MALL = lot("mall");
const PYRAMID = lot("pyramid");
const GAMEHOUSE = lot("gamehouse");
const CONVENTION = lot("convention");
const OPERA = BAY.opera;
/** The bandstand in Central Park, its little stage. */
const BANDSTAND = { x0: PARK.bandstand.x - 4, x1: PARK.bandstand.x + 4, z0: PARK.bandstand.z - 4, z1: PARK.bandstand.z + 4 };
/** The covered shopping street (the shōtengai), its length. */
const SHOTENGAI = { x0: -86 - 6, x1: -86 + 6, z0: -39, z1: 31 };
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
  /** The ZK Cemetery: wind in the dead trees, crows, the zombies groaning (a crowd of them at night). */
  cemetery: {
    weight: (e) => fall(dRect(CEMETERY, e.x, e.z), 40),
    build(s, e) {
      preload(s.ctx, "crow", "crow2", "groan", "groan2", "groan3");
      loop(s, "graveyard", e.night ? 0.9 : 0.55);
      if (e.night) loop(s, "zombies", 0.16, { lp: 1400 });
      s.every("crow", 7, 18, (t) => shot(s, Math.random() < 0.5 ? "crow" : "crow2", t, 0.45, { pan: side() }), 2);
      s.every("groan", e.night ? 4 : 9, e.night ? 10 : 20, (t) => shot(s, (["groan", "groan2", "groan3"] as const)[Math.floor(Math.random() * 3)], t, 0.4 + Math.random() * 0.25, { pan: side(), rate: 0.85 + Math.random() * 0.3, lp: 3000 }), 3);
    },
  },
  westminster: {
    weight: (e) => fall(dRect(WESTMINSTER, e.x, e.z), 140),
    build(s) {
      bigBenHours(s, 0.9, { wet: 0.3 });
    },
  },
  /** The Opera House on its pier: an aria through the glass, the foyer's murmur. */
  opera: {
    weight: (e) => fall(dRect(OPERA, e.x, e.z), 40),
    build(s) {
      music(s, ["op-puccini", "op-traviata", "op-figaro", "op-toreador", "op-swanlake"], 0.55, 2600, 0.35);
      loop(s, "foyer", 0.2, { lp: 2000 });
    },
  },
  /** The museum's steps: a piano from the hall, the visitors. */
  museum: {
    weight: (e) => fall(dRect(MUSEUM, e.x, e.z), 30),
    build(s) {
      music(s, ["piano-gymnopedie", "piano-nocturne", "violin-bach"], 0.42, 2200, 0.35);
      loop(s, "museum", 0.25, { lp: 1800 });
    },
  },
  /** The hawker centre: a band in the corner, plates, the crowd at the stalls. */
  foodhall: {
    weight: (e) => fall(dRect(FOODHALL, e.x, e.z), 28),
    build(s) {
      music(s, ["jazz-dixie", "jazz-combo"], 0.42, 2800, 0.25);
      loop(s, "restaurant", 0.45, { lp: 3000 });
    },
  },
  /** Central Park's bandstand: a saxophone under its roof. */
  bandstand: {
    weight: (e) => fall(dRect(BANDSTAND, e.x, e.z), 26),
    build(s) {
      music(s, ["sax-park", "sax-solo"], 0.6, 5000, 0.3);
    },
  },
  /** The ZK Mall's doors, the Game House's arcade, the convention's hall. */
  mall: {
    weight: (e) => fall(dRect(MALL, e.x, e.z), 22),
    build(s) {
      loop(s, "mall", 0.55, { lp: 2600 });
      music(s, ["jazz-combo", "piano-waltz"], 0.22, 2000, 0.4);
    },
  },
  gamehouse: {
    weight: (e) => fall(dRect(GAMEHOUSE, e.x, e.z), 22),
    build(s) {
      loop(s, "arcade", 0.5, { lp: 2400 });
    },
  },
  convention: {
    weight: (e) => fall(dRect(CONVENTION, e.x, e.z), 24),
    build(s) {
      preload(s.ctx, "applause");
      loop(s, "foyer", 0.4, { lp: 2400 });
      s.every("applause", 20, 45, (t) => shot(s, "applause", t, 0.3, { lp: 1800, pan: side() }), 6);
    },
  },
  /** The covered shopping street: shop jingles, the crowd under the canopy. */
  shotengai: {
    weight: (e) => fall(dRect(SHOTENGAI, e.x, e.z), 14),
    build(s) {
      loop(s, "mall", 0.35, { lp: 3200 });
      s.every("shop-jingle", 9, 20, (t) => {
        const tune = pick([
          [79, 76, 72, 76, 79, 84],
          [72, 76, 79, 76],
          [84, 79, 76, 72, 74, 79],
        ]);
        const pan = side();
        tune.forEach((n, k) => bell(s, t + k * 0.17, 440 * Math.pow(2, (n - 69) / 12), 0.35, 0.012, 0.4, pan));
      });
    },
  },
  /** Giza: the desert's own music, low, from the pyramid's mouth. */
  pyramid: {
    weight: (e) => fall(dRect(PYRAMID, e.x, e.z), 40),
    build(s) {
      const k = s.child("pyramid-music");
      k.out.gain.value = 0.45;
      pyramidMusic(k, false);
      loop(s, "wind", 0.25);
    },
  },
  /** Orchard Keys across the bridge: the surf on its beaches, gulls, a breeze in the palms. */
  keys: {
    weight: (e) => fall(dRect(KEYS_R, e.x, e.z), 30),
    build(s, e) {
      preload(s.ctx, "ship-horn");
      loop(s, "waves", 0.7);
      loop(s, "gulls", e.night ? 0.08 : 0.32);
      loop(s, "wind", 0.15);
      s.every("ship-horn", 70, 140, (t) => shot(s, "ship-horn", t, 0.25, { pan: side(), lp: 1600 }), 20);
    },
  },
  /**
   * Orchard Beach itself: the surf breaking close, louder at the water's edge; the people on the sand
   * (a far-off murmur, children splashing, a whistle from the lifeguards, the volleyball's thump), the
   * beach bars' music drifting over.
   */
  beach: {
    weight: (e) => fall(dRect(BEACH_R, e.x, e.z), 40),
    build(s, e) {
      preload(s.ctx, "applause");
      const surf = loop(s, "waves", 1.0, { hp: 120 });
      s.knobs.surf = surf.gain;
      if (!e.night) {
        loop(s, "pool", 0.22, { lp: 2600 });
        loop(s, "gulls", 0.25);
        // the lifeguard's whistle, now and then
        s.every("whistle", 25, 60, (t) => [0, 0.32].forEach((d) => tone(s, t + d, 2900 + Math.random() * 200, "sine", 0.02, 0.22, 0.35, { pan: side() })), 8);
        // a volleyball being hit
        s.every("volley", 1.3, 2.6, (t) => drum(s, t, 140 + Math.random() * 40, 0.05, 0.4, side() * 0.6), 2);
      }
      music(s, ["jazz-combo", "sax-solo", "jazz-dixie"], e.night ? 0.32 : 0.2, 2200, 0.3);
    },
    update(s, e) {
      // the surf louder the nearer the water's edge
      s.knobs.surf?.setTargetAtTime(0.55 + 0.6 * Math.max(0, 1 - Math.abs(e.z - 492) / 40), s.now, 0.6);
    },
  },
};
/** Orchard Keys (src/scene/keys): the town, its beaches and the bluff behind it. */
const KEYS_R = { x0: 70, x1: 352, z0: 238, z1: 492 };
/** Orchard Beach: the big sand south of the promenade, to the water's edge and the swimmers off it. */
const BEACH_R = { x0: 96, x1: 324, z0: 418, z1: 520 };
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

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
