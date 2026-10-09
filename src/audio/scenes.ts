/**
 * Every place's soundscape, by preset. `presetFor(key, floor, name)` picks one from the place and
 * the floor you are on (by its name: "Casino", "Spa", "Trading floor"…), and `PRESETS[id]` builds
 * it into a fresh `Scene`: real field recordings looped as beds (./samples.ts, public/audio), mixed
 * per place (a museum's hush, the stadium's chants, the wind at the top of a tower), plus the few
 * one-shots of the place (a cell door slamming, the goal roar, Big Ben on the hour, the lift's
 * ding) and handlers for its events (a goal, a blow in the arena, a new block).
 */
import { bell, brass, clank, type Room, type Scene, tone, whistle } from "./lib";
import { loop, preload, shot } from "./samples";
import { pyramidMusic } from "./egypt";

export interface SceneEnv {
  night: boolean;
  floor: number;
  name: string;
}

export interface Preset {
  room: Room | null;
  /** How loud the street's rain still is in here (0 sealed … 1 outdoors). */
  rain: number;
  build: (s: Scene, e: SceneEnv) => void;
}

// rooms (for the synthesised one-shots: the recordings carry their own space)
const HALL: Room = { len: 3.2, decay: 2.4, tone: 0.45, wet: 0.55 };
const LOBBY: Room = { len: 1.9, decay: 3, tone: 0.5, wet: 0.35 };
const SMALL: Room = { len: 0.9, decay: 3.5, tone: 0.5, wet: 0.25 };
const STONE: Room = { len: 4, decay: 2, tone: 0.3, wet: 0.6 };
const METAL: Room = { len: 3, decay: 2.2, tone: 0.7, wet: 0.55, slap: 0.21 };
const BOWL: Room = { len: 2.6, decay: 2.2, tone: 0.4, wet: 0.45, slap: 0.38 };
const OPEN: Room = { len: 1.2, decay: 4, tone: 0.4, wet: 0.2 };
const CATHEDRAL: Room = { len: 5, decay: 1.8, tone: 0.35, wet: 0.6 };
const SHED: Room = { len: 2.2, decay: 2.2, tone: 0.6, wet: 0.45, slap: 0.12 };

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const side = () => Math.random() * 1.6 - 0.8;

// ───────────────────────── shared pieces ─────────────────────────

/** The city heard from up high or through glass (night or day traffic), muffled by `lp`. */
function cityBelow(s: Scene, e: SceneEnv, level: number, lp = 900) {
  return loop(s, e.night ? "city-night" : "city-day", level, { lp });
}

/** The lift arrives: a soft ding. */
function liftDing(s: Scene, min: number, max: number, vol: number) {
  s.every("lift-ding", min, max, (t) => bell(s, t, 1318, 1.2, vol, 0.4, side()));
}

/** A crowd's level pushed up for a moment (a goal, a blow, the result). */
function swell(g: GainNode, t: number, base: number, peak: number, hold: number) {
  g.gain.cancelScheduledValues(t);
  g.gain.setTargetAtTime(peak, t, 0.12);
  g.gain.setTargetAtTime(base, t + hold, 1.5);
}

/** London's hour: Big Ben strikes it (on London time), `level` by how close the bell is. */
export function bigBenHours(s: Scene, level: number, opts: { lp?: number; wet?: number } = {}) {
  preload(s.ctx, "bigben-bong");
  const london = () => {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
    const n = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0);
    return { h: n("hour") % 24, m: n("minute") };
  };
  let last = london().h;
  const strike = (t: number, n: number) => {
    for (let i = 0; i < n; i++) shot(s, "bigben-bong", t + i * 4.3, level, opts);
  };
  s.every("bigben-hour", 1, 1, (t) => {
    const { h, m } = london();
    if (h !== last && m === 0) strike(t, h % 12 || 12);
    last = h;
  });
  // `sound.event("hour")`: strike the current hour now (for tests and the curious)
  s.on.hour = (t) => strike(t, london().h % 12 || 12);
  s.on.bong = (t) => strike(t, 1);
}

// ───────────────────────── the places ─────────────────────────

const stadium: Preset = {
  room: BOWL,
  rain: 0.6,
  build(s, e) {
    preload(s.ctx, "goal");
    const L = e.name.startsWith("Pitch") ? 0.8 : 1;
    const crowd = loop(s, "stadium", L);
    s.knobs.crowd = crowd.gain;
    s.on.goal = (t, up) => {
      shot(s, "goal", t, up === false ? 0.7 : 1.1);
      swell(crowd, t, L, L * 1.3, 4);
      whistle(s, t, 0.08, 0.6, 0.5);
    };
    s.on.block = (t) => whistle(s, t, 0.08, 0.35, 0.5);
  },
};

/** The Colosseum: a big crowd in the cavea, brass fanfares for the bouts. */
const colosseum: Preset = {
  room: OPEN,
  rain: 1,
  build(s, e) {
    preload(s.ctx, "goal");
    const L = e.name.toLowerCase().includes("podium") ? 0.8 : 0.9;
    const crowd = loop(s, "crowd-arena", L);
    const fanfare = (t: number, notes: number[], tuba = true) => {
      notes.forEach((n, i) => brass(s, t + i * 0.22, 440 * Math.pow(2, (n - 69) / 12), i === notes.length - 1 ? 0.9 : 0.18, 0.05, 0.35));
      if (tuba) brass(s, t, 440 * Math.pow(2, (notes[0] - 93) / 12), 0.22 * notes.length + 0.6, 0.08, 0.3, 700);
    };
    s.on.rise = (t) => fanfare(t, [67, 67, 72, 76, 79, 84]);
    s.on.hit = (t) => {
      clank(s, t, rnd(620, 900), 0.18, 0.9, 0.3, side());
      swell(crowd, t, L, L * 1.5, 1.5);
    };
    s.on.result = (t) => {
      shot(s, "goal", t, 0.9);
      swell(crowd, t, L, L * 1.4, 4);
      fanfare(t + 0.4, [72, 76, 79, 84, 79, 84]);
    };
    s.on.block = (t) => fanfare(t, [67, 72, 76, 79], false);
  },
};

/** Under the arena: stone, drips, the crowd above through the floor. */
const hypogeum: Preset = {
  room: STONE,
  rain: 0,
  build(s) {
    loop(s, "cave", 0.8);
    const above = loop(s, "crowd-arena", 0.45, { lp: 350 });
    s.knobs.crowd = above.gain;
    s.on.hit = (t) => clank(s, t, rnd(600, 800), 0.05, 0.6, 0.6);
    s.on.result = (t) => swell(above, t, 0.45, 1, 2.5);
  },
};

/** The zkSNARK Museum: a big quiet gallery (the MET, recorded). */
const museum: Preset = {
  room: HALL,
  rain: 0.05,
  build(s) {
    loop(s, "museum", 1);
  },
};

/** A quieter hall: a small museum, a reading room, a gallery of money. */
const quietHall: Preset = {
  room: HALL,
  rain: 0.05,
  build(s) {
    loop(s, "museum", 0.7);
  },
};

const hotelLobby: Preset = {
  room: LOBBY,
  rain: 0.05,
  build(s) {
    loop(s, "lobby", 1);
    loop(s, "foyer", 0.3);
    liftDing(s, 15, 35, 0.04);
  },
};

/** The Burj Al Arab's gold atrium: the lobby and its dancing fountain. */
const atrium: Preset = {
  room: HALL,
  rain: 0.05,
  build(s) {
    loop(s, "lobby", 0.9);
    const jet = loop(s, "waterfall", 0.3, { hp: 300 });
    s.every("fountain-leap", 6, 12, (t) => swell(jet, t, 0.3, 0.6, 2));
    liftDing(s, 20, 40, 0.035);
  },
};

const casino: Preset = {
  room: LOBBY,
  rain: 0,
  build(s) {
    loop(s, "casino", 1);
    loop(s, "lobby", 0.3);
  },
};

const spa: Preset = {
  room: LOBBY,
  rain: 0,
  build(s) {
    loop(s, "waterfall", 0.35, { lp: 2500 });
    loop(s, "pool", 0.25, { lp: 1800 });
    s.every("singing-bowl", 18, 35, (t) => bell(s, t, 220, 7, 0.05, 0.6));
  },
};

const gym: Preset = {
  room: SMALL,
  rain: 0,
  build(s) {
    loop(s, "gym", 1.1);
  },
};

const pool: Preset = {
  room: SHED,
  rain: 0,
  build(s) {
    loop(s, "pool", 1);
  },
};

/** A hotel or flat room: quiet, the city far below through the glass. */
const room: Preset = {
  room: SMALL,
  rain: 0.2,
  build(s, e) {
    cityBelow(s, e, 0.35, 500);
    liftDing(s, 40, 80, 0.015);
  },
};

/** High up and outside: the wind, the city far below. */
const heights = (wind: number, city: number, extra?: (s: Scene, e: SceneEnv) => void): Preset => ({
  room: OPEN,
  rain: 1,
  build(s, e) {
    if (wind) loop(s, "wind", wind);
    if (city) cityBelow(s, e, city, 700);
    extra?.(s, e);
  },
});

/** The Marina Bay SkyPark: the infinity pool's terrace bar, a breeze, the city below. */
const skyPool: Preset = {
  room: OPEN,
  rain: 1,
  build(s, e) {
    loop(s, "restaurant", 0.45);
    loop(s, "wind", 0.35);
    loop(s, "waterfall", 0.12, { hp: 600 });
    cityBelow(s, e, 0.3, 700);
  },
};

const skyLounge: Preset = {
  room: LOBBY,
  rain: 0.15,
  build(s) {
    loop(s, "restaurant", 0.9);
    loop(s, "wind", 0.12, { lp: 800 });
  },
};

const restaurant: Preset = {
  room: LOBBY,
  rain: 0.1,
  build(s) {
    loop(s, "restaurant", 1);
  },
};

/** Al Mahara: diners round the aquarium, the sea's rumble through the glass. */
const aquarium: Preset = {
  room: LOBBY,
  rain: 0,
  build(s) {
    loop(s, "restaurant", 0.7);
    loop(s, "waves", 0.5, { lp: 260 });
    s.every("bubbles", 2, 6, (t) => {
      for (let i = 0; i < 4; i++) tone(s, t + i * rnd(0.04, 0.12), rnd(400, 900), "sine", 0.012, 0.06, 0.5, { to: rnd(1200, 1800) });
    });
  },
};

const office: Preset = {
  room: SMALL,
  rain: 0.1,
  build(s) {
    loop(s, "office", 1);
  },
};

/** The boardroom: hushed, the city through the glass. */
const executive: Preset = {
  room: SMALL,
  rain: 0.15,
  build(s, e) {
    loop(s, "office", 0.45);
    cityBelow(s, e, 0.25, 500);
  },
};

const arcade: Preset = {
  room: SMALL,
  rain: 0,
  build(s) {
    loop(s, "arcade", 1);
  },
};

const bowling: Preset = {
  room: SHED,
  rain: 0,
  build(s) {
    loop(s, "arcade", 0.7);
    loop(s, "foyer", 0.35);
  },
};

const mall = (vortex: number, kind: "shops" | "hawker" | "cinema"): Preset => ({
  room: HALL,
  rain: 0.05,
  build(s) {
    if (kind === "hawker") {
      loop(s, "restaurant", 0.9);
      loop(s, "mall", 0.45);
    } else if (kind === "cinema") {
      loop(s, "arcade", 0.75);
      loop(s, "mall", 0.35);
    } else loop(s, "mall", 1);
    // the Rain Vortex: a 40 m waterfall into the canal
    if (vortex > 0) loop(s, "waterfall", vortex);
    // the mall jingle before an announcement
    s.every(
      "mall-jingle",
      50,
      90,
      (t) => [72, 76, 79, 84].forEach((n, i) => bell(s, t + i * 0.28, 440 * Math.pow(2, (n - 69) / 12), 1.6, 0.03, 0.7)),
      15,
    );
  },
});

/** The cell house on the rock: a real prison's echo, cell doors, the gulls outside. */
const prison: Preset = {
  room: METAL,
  rain: 0.15,
  build(s) {
    preload(s.ctx, "cell-door");
    loop(s, "prison", 0.9);
    loop(s, "gulls", 0.18, { lp: 1500 });
    s.every("cell-door", 14, 32, (t) => shot(s, "cell-door", t, rnd(0.5, 0.9), { pan: side(), wet: 0.3 }), 4);
  },
};

/** A banking hall: marble, murmur, keyboards, the counter's bell. */
const reserveHall: Preset = {
  room: HALL,
  rain: 0.05,
  build(s) {
    loop(s, "museum", 0.55);
    loop(s, "office", 0.6);
    s.every("teller-bell", 10, 24, (t) => bell(s, t, 2093, 1.4, 0.04, 0.6, side()));
    s.on.block = (t) => bell(s, t, 2093, 1.6, 0.05, 0.6);
  },
};

const trading: Preset = {
  room: HALL,
  rain: 0,
  build(s) {
    const pit = loop(s, "foyer", 1);
    loop(s, "office", 0.45);
    s.knobs.crowd = pit.gain;
    // a block: the opening bell rings and the pit erupts
    s.on.block = (t) => {
      for (let i = 0; i < 40; i++) bell(s, t + i * 0.075, 880, 0.35, 0.05, 0.5);
      swell(pit, t + 0.2, 1, 1.6, 4);
    };
  },
};

/** The pyramid: wind through the stone corridors, drips, a low dark air, its music (./egypt.ts). */
const pyramid = (deep: boolean): Preset => ({
  room: STONE,
  rain: 0,
  build(s) {
    loop(s, "cave", deep ? 0.8 : 0.7);
    loop(s, "wind", deep ? 0.12 : 0.22, { lp: 500 });
    pyramidMusic(s, deep);
  },
});

/** The ZK Cemetery's crypt: a stone cellar, the wind at the door, zombies groaning between the tombs. */
const crypt: Preset = {
  room: STONE,
  rain: 0,
  build(s) {
    preload(s.ctx, "groan", "groan2", "groan3");
    loop(s, "cave", 0.8);
    loop(s, "graveyard", 0.22, { lp: 700 });
    loop(s, "zombies", 0.1, { lp: 900 });
    s.every("groan", 5, 12, (t) => shot(s, (["groan", "groan2", "groan3"] as const)[Math.floor(Math.random() * 3)], t, 0.35 + Math.random() * 0.2, { pan: side(), rate: 0.8 + Math.random() * 0.3, wet: 0.5 }), 3);
  },
};

const opera = (foyer: boolean): Preset => ({
  room: foyer ? LOBBY : CATHEDRAL,
  rain: foyer ? 0.15 : 0,
  build(s) {
    preload(s.ctx, "applause");
    if (foyer) {
      loop(s, "foyer", 0.9);
      loop(s, "harbour", 0.2, { lp: 1200 });
      // the hall's music comes through the doors (src/audio/live.ts), its ovation too
      s.on.applause = (t) => shot(s, "applause", t, 0.22, { lp: 900 });
      s.on.interval = (t) => [0, 0.3, 0.6].forEach((dt) => bell(s, t + dt, 1046, 1, 0.03, 0.5));
    } else {
      // between pieces the orchestra tunes; during one only a hush (the piece plays from the
      // stage, positional, src/audio/live.ts), at the end of one the hall applauds for real
      const tuning = loop(s, "tuning", 0.0);
      const hush = loop(s, "foyer", 0.06, { lp: 1500 });
      s.knobs.tuning = tuning.gain;
      s.on.applause = (t) => {
        shot(s, "applause", t, 1.1, { wet: 0.35 });
        swell(hush, t, 0.06, 0.2, 9);
      };
      s.on.interval = (t, dur) => {
        const d = typeof dur === "number" ? dur : 6;
        tuning.gain.cancelScheduledValues(t);
        tuning.gain.setTargetAtTime(0.4, t, 0.6);
        tuning.gain.setTargetAtTime(0, t + d, 0.5);
      };
    }
  },
});

/** Westminster Hall: a vast stone hall, a few visitors. */
const greatHall: Preset = {
  room: CATHEDRAL,
  rain: 0.1,
  build(s) {
    loop(s, "museum", 0.75);
    bigBenHours(s, 0.35, { lp: 900 });
  },
};

/** Inside Big Ben: the Great Clock's going train, ticking; the hour strikes overhead. */
const clockwork = (tick: number, windLevel: number, bong: number): Preset => ({
  room: STONE,
  rain: windLevel > 0 ? 0.6 : 0.1,
  build(s) {
    loop(s, "clockwork", tick);
    if (windLevel > 0) loop(s, "wind", windLevel);
    bigBenHours(s, bong);
  },
});

const stairwell: Preset = {
  room: STONE,
  rain: 0.2,
  build(s) {
    loop(s, "wind", 0.2, { lp: 600 });
    loop(s, "clockwork", 0.15, { lp: 1500 });
    bigBenHours(s, 0.6, { lp: 1500 });
  },
};

/** The Proof Factory: rows of mining rigs (a data centre's fans), machines, forklifts. */
const factory: Preset = {
  room: SHED,
  rain: 0.3,
  build(s, e) {
    preload(s.ctx, "forklift");
    const catwalk = e.name.toLowerCase().includes("catwalk");
    loop(s, "servers", 1);
    loop(s, "industry", catwalk ? 0.25 : 0.4);
    s.every("forklift", 18, 35, (t) => shot(s, "forklift", t, 0.5, { pan: side() }), 6);
    s.on.block = (t) => {
      // a block mined: the klaxon
      for (let i = 0; i < 3; i++) brass(s, t + i * 0.7, 330, 0.45, 0.04, 0.5, 1400);
    };
  },
};

const controlRoom: Preset = {
  room: SMALL,
  rain: 0.1,
  build(s) {
    loop(s, "servers", 0.4, { lp: 700 });
    loop(s, "office", 0.7);
  },
};

/** A shop: the door chime as you come in, the shop floor, the till. */
const shop = (vault = false): Preset => ({
  room: vault ? METAL : SMALL,
  rain: vault ? 0 : 0.25,
  build(s, e) {
    if (vault) {
      loop(s, "servers", 0.3, { lp: 300 });
      loop(s, "clockwork", 0.12, { hp: 1500 });
      return;
    }
    loop(s, "mall", 0.45, { lp: 3500 });
    cityBelow(s, e, 0.15, 400);
    // the door chime as you walk in
    const t0 = s.now + 0.3;
    [1318.5, 1046.5].forEach((f, i) => bell(s, t0 + i * 0.22, f, 0.6, 0.05, 0.2));
    s.every("till", 12, 30, (t) => {
      tone(s, t, 2093, "square", 0.01, 0.05, 0.1, { lp: 3000 });
      tone(s, t + 0.12, 2093, "square", 0.01, 0.05, 0.1, { lp: 3000 });
    });
    s.on.block = (t) => [1318.5, 1568, 2093].forEach((f, i) => bell(s, t + i * 0.15, f, 0.6, 0.035, 0.3));
  },
});

const library = (press: boolean): Preset => ({
  room: press ? SMALL : HALL,
  rain: 0.1,
  build(s) {
    if (press) loop(s, "office", 1);
    else loop(s, "museum", 0.5);
  },
});

const construction: Preset = {
  room: OPEN,
  rain: 1,
  build(s) {
    loop(s, "construction", 1);
    loop(s, "wind", 0.2);
  },
};

/** The Eiffel tower: Paris below (a street with an accordion), the wind higher up. */
const eiffel = (wind: number, paris: number, lp: number): Preset => ({
  room: OPEN,
  rain: 1,
  build(s) {
    loop(s, "paris", paris, { lp });
    if (wind) loop(s, "wind", wind);
  },
});

export const PRESETS: Record<string, Preset> = {
  stadium,
  colosseum,
  hypogeum,
  museum,
  "quiet-hall": quietHall,
  "hotel-lobby": hotelLobby,
  atrium,
  casino,
  spa,
  gym,
  pool,
  room,
  "sky-pool": skyPool,
  "sky-lounge": skyLounge,
  restaurant,
  aquarium,
  office,
  executive,
  arcade,
  bowling,
  "wind-high": heights(1, 0.2),
  "wind-mid": heights(0.6, 0.35),
  "sky-garden": heights(0.35, 0.25, (s, e) => loop(s, e.night ? "night-crickets" : "birds", 0.45)),
  /** The Palm: the beach and its bar, the marina, a villa's pool terrace by the sea. */
  beach: heights(0.15, 0, (s) => {
    loop(s, "waves", 1);
    loop(s, "restaurant", 0.2, { lp: 2500 });
  }),
  marina: heights(0.2, 0, (s) => {
    loop(s, "harbour", 0.9);
    loop(s, "gulls", 0.3);
  }),
  villa: heights(0, 0, (s) => {
    loop(s, "waves", 0.55, { lp: 1800 });
    loop(s, "pool", 0.15, { lp: 1500 });
  }),
  /** Gardens by the Bay's domes: the Cloud Forest's waterfall and birds, the Flower Dome's birds and visitors. */
  "cloud-forest": {
    room: HALL,
    rain: 0,
    build(s) {
      loop(s, "waterfall", 0.9);
      loop(s, "birds", 0.45);
      loop(s, "museum", 0.3);
    },
  },
  "flower-dome": {
    room: HALL,
    rain: 0,
    build(s) {
      loop(s, "birds", 0.6);
      loop(s, "museum", 0.45);
      loop(s, "waterfall", 0.12, { lp: 1500 });
    },
  },
  /** The Supertree Grove: open air, birds by day, crickets by night, visitors on the lawn. */
  "supertree-grove": {
    room: OPEN,
    rain: 1,
    build(s, e) {
      loop(s, e.night ? "night-crickets" : "birds", 0.7);
      loop(s, "museum", 0.3);
      cityBelow(s, e, 0.25, 700);
    },
  },
  rooftop: heights(0.4, 0.3, (s) => loop(s, "restaurant", 0.45)),
  helipad: heights(1, 0, (s) => loop(s, "waves", 0.35)),
  "statue-high": heights(0.9, 0, (s) => {
    loop(s, "harbour", 0.3);
    loop(s, "gulls", 0.2);
  }),
  "statue-balcony": heights(0.5, 0, (s) => {
    loop(s, "harbour", 0.5);
    loop(s, "gulls", 0.3);
  }),
  "mall-vortex": mall(0.9, "shops"),
  mall: mall(0, "shops"),
  "mall-hawker": mall(0, "hawker"),
  "mall-cinema": mall(0, "cinema"),
  prison,
  "reserve-hall": reserveHall,
  trading,
  pyramid: pyramid(false),
  crypt,
  "pyramid-chamber": pyramid(true),
  "opera-foyer": opera(true),
  "opera-hall": opera(false),
  "great-hall": greatHall,
  stairwell,
  "clock-room": clockwork(1, 0, 1),
  belfry: clockwork(0.35, 0.5, 1.3),
  factory,
  "control-room": controlRoom,
  shop: shop(),
  vault: shop(true),
  "press-room": library(true),
  stacks: library(false),
  construction,
  "eiffel-ground": eiffel(0, 1, 20000),
  "eiffel-platform": eiffel(0.5, 0.4, 1500),
  "eiffel-summit": eiffel(0.9, 0.15, 800),
};

/** Each soundscape's overall level (the recordings are loudness-matched, so 1 unless a place is meant to be hushed). */
export const LEVEL: Record<string, number> = {
  "quiet-hall": 0.9,
  stacks: 0.8,
  room: 0.9,
};

/** Which soundscape a place and floor get. */
export function presetFor(key: string, floor: number, name: string): string {
  const n = name.toLowerCase();
  const has = (...w: string[]) => w.some((x) => n.includes(x));
  switch (key) {
    case "stadium":
      return "stadium";
    case "colosseum":
      return has("hypogeum") ? "hypogeum" : "colosseum";
    case "museum":
      return "museum";
    case "hotel":
      if (has("casino")) return "casino";
      if (has("spa")) return "spa";
      if (has("skypark", "pool")) return "sky-pool";
      if (has("restaurant")) return "sky-lounge";
      if (has("room", "suite")) return "room";
      return "hotel-lobby";
    case "arab":
      if (has("underwater", "mahara")) return "aquarium";
      if (has("helipad")) return "helipad";
      if (has("suite", "bedroom", "salon")) return "room";
      return "atrium";
    case "gardens":
      if (has("skyway")) return "wind-mid";
      if (has("cloud walk", "cloud forest")) return "cloud-forest";
      if (has("flower")) return "flower-dome";
      return "supertree-grove";
    case "tower":
      if (has("office")) return "office";
      if (has("game", "arcade")) return "arcade";
      if (has("bowling", "karaoke")) return "bowling";
      if (has("gym")) return "gym";
      if (has("pool")) return "pool";
      if (has("residence", "flat")) return "room";
      if (has("rooftop", "helipad")) return "rooftop";
      return "hotel-lobby";
    case "needle":
      if (has("residence", "suite")) return "room";
      if (has("lounge", "restaurant")) return "sky-lounge";
      if (has("sky")) return "wind-high";
      if (has("observation", "top")) return "wind-mid";
      return "hotel-lobby";
    case "mall":
      if (has("vortex", "canal")) return "mall-vortex";
      if (has("hawker", "restaurant")) return "mall-hawker";
      if (has("cinema", "arcade")) return "mall-cinema";
      return "mall";
    case "prison":
      return "prison";
    case "reserve":
      if (has("trading")) return "trading";
      if (has("museum")) return "quiet-hall";
      if (has("terrace")) return "wind-mid";
      if (has("vault", "safe", "lockbox")) return "vault";
      if (has("executive", "boardroom")) return "executive";
      return "reserve-hall";
    case "eiffel":
      if (has("summit")) return "eiffel-summit";
      if (floor === 0 || has("esplanade")) return "eiffel-ground";
      return "eiffel-platform";
    case "statue":
      if (has("crown", "torch")) return "statue-high";
      if (has("balcony")) return "statue-balcony";
      return "quiet-hall";
    case "pyramid":
      return has("king", "treasure") ? "pyramid-chamber" : "pyramid";
    case "opera":
      return has("foyer") ? "opera-foyer" : "opera-hall";
    case "bigben":
      if (has("westminster", "hall")) return "great-hall";
      if (has("clock room", "great clock")) return "clock-room";
      if (has("dials", "belfry", "bell")) return "belfry";
      if (has("light", "spire", "roof")) return "wind-high";
      return "stairwell";
    case "factory":
      return has("control") ? "control-room" : "factory";
    case "mempool":
      return "shop";
    case "palm":
      if (has("villa")) return "villa";
      if (has("marina")) return "marina";
      return "beach";
    case "tower-orchard":
    case "tower-sapling":
    case "tower-halo":
    case "zodl":
    case "vizor":
    case "noir":
      if (has("trading")) return "trading";
      if (has("desk", "capital", "coworking")) return "office";
      if (has("rooftop", "pool")) return "sky-pool";
      if (has("jazz", "lounge")) return "sky-lounge";
      if (has("residence")) return "room";
      if (has("helipad", "observatory", "deck")) return "wind-high";
      if (has("sky garden")) return "sky-garden";
      if (has("greenhouse")) return "flower-dome";
      return "hotel-lobby";
    case "cemetery":
      return "crypt";
    case "library":
      return has("press", "news") ? "press-room" : "stacks";
    default:
      return "quiet-hall";
  }
}
