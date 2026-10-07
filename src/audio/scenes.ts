/**
 * Every place's soundscape, by preset. `presetFor(key, floor, name)` picks one from the place and
 * the floor you are on (by its name: "Casino", "Spa", "Trading floor"…), and `PRESETS[id]` builds
 * it into a fresh `Scene`: a room (its reverb), looping beds, random one-shots, a little music,
 * and handlers for the place's events (a goal, a blow in the arena, a new block).
 */
import {
  band,
  bed,
  bell,
  brass,
  burst,
  clank,
  clap,
  drip,
  drone,
  drum,
  fountain,
  lapping,
  murmur,
  note,
  type Room,
  type Scene,
  shh,
  tone,
  vowel,
  walker,
  whistle,
  wind,
} from "./lib";

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

// rooms
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
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const side = () => Math.random() * 1.6 - 0.8;

// ───────────────────────── shared pieces ─────────────────────────

/** The city heard through glass: a low muffled rumble. */
function cityBelow(s: Scene, level: number) {
  bed(s, "city-muffled", { kind: "brown", type: "lowpass", f: 140, gain: level, am: [[0.05, 0.3]] });
}

/** Air conditioning: a soft hiss and a low motor. */
function aircon(s: Scene, level: number) {
  bed(s, "aircon", { kind: "pink", type: "lowpass", f: 1800, gain: level * 0.5, f2: { type: "highpass", f: 200 } });
  drone(s, "aircon-motor", [[60, 1], [120, 0.4]], "sine", 300, level * 0.15);
}

/** A jazz lounge trio: piano comping ii–V–I, a walking bass, brushes. */
function lounge(s: Scene, vol: number, wet: number) {
  band(s, "lounge-jazz", {
    bpm: 84,
    beats: 4,
    chords: [
      [50, 60, 65, 69, 72],
      [55, 59, 65, 69, 71],
      [48, 59, 64, 67, 71],
      [57, 60, 64, 67, 71],
      [50, 60, 65, 69, 72],
      [55, 60, 65, 69, 71],
      [52, 59, 62, 67, 71],
      [57, 61, 64, 67, 71],
    ],
    inst: "piano",
    bassInst: "harp",
    vol,
    wet,
    comp: [1.5, 3],
    melody: "piano",
    melodyProb: 0.3,
    swish: true,
  });
}

/** Soft background music for shops: a Rhodes on a slow loop. */
function shopMusic(s: Scene, vol: number) {
  band(s, "shop-music", {
    bpm: 92,
    beats: 4,
    chords: [
      [53, 57, 60, 64, 67],
      [55, 59, 62, 65, 69],
      [52, 55, 59, 62, 64],
      [57, 60, 64, 67, 71],
    ],
    inst: "rhodes",
    bassInst: "rhodes",
    vol,
    wet: 0.2,
    comp: [0, 2.5],
    melody: "rhodes",
    melodyProb: 0.25,
  });
}

/** Glasses and cutlery now and then. */
function clinks(s: Scene, min: number, max: number, vol: number) {
  s.every("glass-clink", min, max, (t) => {
    const f = rnd(2400, 3600);
    tone(s, t, f, "sine", vol, 0.25, 0.3, { pan: side() });
    if (Math.random() < 0.5) tone(s, t + 0.09, f * 1.1, "sine", vol * 0.7, 0.2, 0.3, { pan: side() });
  });
}

/** The lift arrives: a soft ding. */
function liftDing(s: Scene, min: number, max: number, vol: number) {
  s.every("lift-ding", min, max, (t) => bell(s, t, 1318, 1.2, vol, 0.4, side()));
}

/**
 * A big crowd: a broadband roar (two formant bands and a stomping rumble), breathing in swells.
 * Returns the gain of its body, which events push up.
 */
function crowdBed(s: Scene, level: number, wet: number, bright = 0.3) {
  const body = bed(s, "crowd-roar", { kind: "pink", type: "bandpass", f: 650 + bright * 250, q: 0.55, gain: level, wet, am: [[0.11, 0.25], [0.37, 0.12]] });
  bed(s, "crowd-voices", { kind: "white", type: "bandpass", f: 1500 + bright * 500, q: 1.3, gain: level * 0.22, wet, am: [[0.17, 0.3], [0.9, 0.15]] });
  bed(s, "crowd-stomp", { kind: "brown", type: "lowpass", f: 200, gain: level * 0.9, am: [[0.08, 0.4]] });
  s.knobs.crowd = body.gain;
  s.every("crowd-swell", 3, 8, (t) => {
    body.gain.setTargetAtTime(level * rnd(1.3, 2), t, 0.4);
    body.gain.setTargetAtTime(level, t + rnd(1.2, 2.5), 0.9);
    // "ooooh!": the stands rise as one
    if (Math.random() < 0.35) vowel(s, t, rnd(180, 240), 1.6, level * 0.25, [600, 1000], wet, 4);
  });
  return body;
}

/** The crowd goes wild: a burst on the roar, cheers, air horns. */
function eruption(s: Scene, t: number, level: number, wet: number, big: boolean) {
  const k = s.knobs.crowd;
  if (k) {
    k.cancelScheduledValues(t);
    k.setTargetAtTime(level * (big ? 4.5 : 2.5), t, 0.08);
    k.setTargetAtTime(level, t + (big ? 4 : 1.8), 1.6);
  }
  burst(s, t, "pink", "bandpass", 1200, 0.5, level * (big ? 2.4 : 1.4), big ? 4 : 2, wet, 0, 0.15);
  vowel(s, t + 0.1, 260, big ? 2.6 : 1.4, level * 0.5, [750, 1200], wet, 5);
  if (big)
    for (let i = 0; i < 3; i++) {
      const at = t + 0.4 + i * 0.55;
      for (const f of [233, 294, 349]) brass(s, at, f, 0.4, level * 0.1, wet, 1800);
    }
}

// ───────────────────────── the places ─────────────────────────

const stadium: Preset = {
  room: BOWL,
  rain: 0.6,
  build(s, e) {
    const L = e.name.startsWith("Pitch") ? 0.5 : 0.6;
    crowdBed(s, L, 0.4, 0.3);
    // the drummers' steady beat behind the goal
    let next = s.now + 1;
    s.seq((until) => {
      while (next < until) {
        drum(s, next, 70, 0.22, 0.4, -0.5);
        if (Math.random() < 0.5) drum(s, next + 0.3, 90, 0.12, 0.4, -0.5);
        next += 0.75;
      }
    });
    s.layers.push("drums");
    // the chant: clap-clap-clap, "SHIELD-ED!"
    s.every("chant", 9, 16, (t) => {
      for (let r = 0; r < 3; r++) {
        const t0 = t + r * 1.5;
        for (let i = 0; i < 3; i++) clap(s, t0 + i * 0.25, 0.22, 0.4, 5);
        vowel(s, t0 + 0.78, 196, 0.32, 0.26, [500, 900], 0.5, 6);
        vowel(s, t0 + 1.12, 220, 0.28, 0.24, [550, 1750], 0.5, 6);
      }
    });
    s.every("whistle", 12, 28, (t) => whistle(s, t, 0.06, rnd(0.25, 0.5), 0.5));
    // the PA: a two-tone chime and the announcer's echoing voice
    s.every(
      "pa-announcer",
      30,
      60,
      (t) => {
        bell(s, t, 784, 1.4, 0.05, 0.8);
        bell(s, t + 0.45, 622, 1.6, 0.05, 0.8);
        for (let i = 0; i < 9; i++) vowel(s, t + 1.3 + i * 0.23, rnd(120, 160), 0.2, 0.09, pick([[700, 1200], [400, 2200], [500, 900]]) as [number, number], 0.9);
      },
      8,
    );
    s.on.goal = (t, up) => {
      eruption(s, t, L, 0.4, true);
      whistle(s, t, 0.08, 0.6, 0.5);
      if (up !== false) for (let i = 0; i < 8; i++) drum(s, t + 0.6 + i * 0.18, 75, 0.3, 0.4);
    };
    s.on.block = (t) => whistle(s, t, 0.08, 0.35, 0.5);
  },
};

const colosseum: Preset = {
  room: OPEN,
  rain: 1,
  build(s) {
    crowdBed(s, 0.45, 0.25, 0.5);
    s.every("cavea-cheer", 7, 15, (t) => burst(s, t, "pink", "bandpass", 1300, 0.6, 0.25, 1.4, 0.3, side(), 0.3));
    const fanfare = (t: number, notes: number[], tuba = true) => {
      notes.forEach((n, i) => brass(s, t + i * 0.22, 440 * Math.pow(2, (n - 69) / 12), i === notes.length - 1 ? 0.9 : 0.18, 0.07, 0.35));
      if (tuba) brass(s, t, 440 * Math.pow(2, (notes[0] - 93) / 12), 0.22 * notes.length + 0.6, 0.12, 0.3, 700);
    };
    s.on.rise = (t) => fanfare(t, [67, 67, 72, 76, 79, 84]);
    s.on.hit = (t) => {
      clank(s, t, rnd(620, 900), 0.22, 0.9, 0.3, side());
      eruption(s, t + 0.05, 0.45, 0.25, false);
    };
    s.on.result = (t) => {
      eruption(s, t, 0.45, 0.25, true);
      fanfare(t + 0.4, [72, 76, 79, 84, 79, 84]);
    };
    s.on.block = (t) => fanfare(t, [67, 72, 76, 79], false);
    // when no bout is on, the gladiators train somewhere below
    s.every("training-clash", 6, 14, (t) => clank(s, t, rnd(700, 1000), 0.06, 0.6, 0.4, side()));
  },
};

const hypogeum: Preset = {
  room: STONE,
  rain: 0,
  build(s) {
    // the games above, through the floor
    const above = bed(s, "crowd-above", { kind: "pink", type: "lowpass", f: 260, gain: 0.35, am: [[0.12, 0.4]] });
    s.knobs.crowd = above.gain;
    drone(s, "cellar-air", [[48, 1], [72, 0.4]], "sine", 200, 0.03);
    s.every("torch", 0.12, 0.5, (t) => burst(s, t, "white", "highpass", 3000, 0.7, rnd(0.01, 0.04), 0.02, 0.2, side()));
    s.every("growl", 8, 18, (t) => {
      const f = rnd(55, 90);
      tone(s, t, f, "sawtooth", 0.12, 1.4, 0.5, { a: 0.3, hold: 0.6, to: f * 0.8, lp: 500, pan: side() });
      burst(s, t, "brown", "lowpass", 400, 0.7, 0.3, 1.6, 0.5, 0, 0.3);
    });
    s.every("chains", 7, 15, (t) => {
      for (let i = 0; i < 6; i++) tone(s, t + i * rnd(0.04, 0.09), rnd(2800, 4200), "sine", 0.03, 0.12, 0.5);
    });
    s.every("lift-winch", 15, 30, (t) => {
      for (let i = 0; i < 14; i++) burst(s, t + i * 0.16, "white", "bandpass", 900, 4, 0.08, 0.05, 0.5);
    });
    s.every("drip", 1.5, 4, (t) => drip(s, t, 0.04, 0.6));
    s.on.hit = (t) => clank(s, t, rnd(600, 800), 0.06, 0.6, 0.6);
    s.on.result = (t) => {
      above.gain.setTargetAtTime(1.2, t, 0.1);
      above.gain.setTargetAtTime(0.35, t + 2.5, 1);
    };
  },
};

const museum: Preset = {
  room: HALL,
  rain: 0.05,
  build(s) {
    murmur(s, "hushed-murmur", 0.05, 0.7);
    bed(s, "hall-air", { kind: "brown", type: "lowpass", f: 90, gain: 0.08 });
    s.every("footsteps", 2, 5, (t) => walker(s, t, "hard", 0.07, 0.6));
    s.every("shh", 22, 50, (t) => shh(s, t, 0.035, 0.6));
    s.every("cough", 30, 70, (t) => {
      burst(s, t, "pink", "bandpass", 900, 1.2, 0.08, 0.12, 0.7, side());
      burst(s, t + 0.22, "pink", "bandpass", 850, 1.2, 0.06, 0.1, 0.7, side());
    });
    // a string quartet somewhere down the gallery: Pachelbel-like ground, D major
    band(s, "string-quartet", {
      bpm: 60,
      beats: 4,
      chords: [
        [50, 62, 66, 69],
        [45, 61, 64, 69],
        [47, 62, 66, 71],
        [42, 61, 66, 69],
        [43, 62, 67, 71],
        [38, 62, 66, 69],
        [43, 62, 67, 71],
        [45, 61, 64, 69],
      ],
      inst: "strings",
      bassInst: "strings",
      vol: 0.03,
      wet: 0.8,
      comp: [0],
      compDur: 3.6,
      melody: "strings",
      melodyProb: 0.35,
    });
  },
};

/** A quieter hall: a small museum, a reading room, a gallery of money. */
const quietHall: Preset = {
  room: HALL,
  rain: 0.05,
  build(s) {
    bed(s, "hall-air", { kind: "brown", type: "lowpass", f: 90, gain: 0.07 });
    murmur(s, "murmur", 0.025, 0.6);
    s.every("footsteps", 4, 9, (t) => walker(s, t, "hard", 0.06, 0.5));
    s.every("shh", 40, 80, (t) => shh(s, t, 0.03, 0.6));
  },
};

const hotelLobby: Preset = {
  room: LOBBY,
  rain: 0.05,
  build(s) {
    murmur(s, "lobby-chatter", 0.05, 0.4);
    fountain(s, 0.06, 0.3, 0.3);
    lounge(s, 0.05, 0.35);
    clinks(s, 4, 10, 0.02);
    liftDing(s, 15, 35, 0.025);
    s.every("footsteps", 3, 7, (t) => walker(s, t, "hard", 0.04, 0.4));
    s.every("luggage", 20, 45, (t) => {
      for (let i = 0; i < 12; i++) burst(s, t + i * 0.09, "white", "bandpass", 700, 2, 0.02, 0.06, 0.2);
    });
  },
};

const atrium: Preset = {
  room: HALL,
  rain: 0.05,
  build(s, e) {
    hotelLobby.build(s, e);
    // the dancing fountain: louder, with bursts when its jets leap
    const jet = bed(s, "dancing-fountain", { kind: "white", type: "bandpass", f: 2400, q: 0.5, gain: 0.04, wet: 0.5 });
    s.every("fountain-leap", 3, 7, (t) => {
      jet.gain.setTargetAtTime(0.16, t, 0.1);
      jet.gain.setTargetAtTime(0.04, t + 1.2, 0.5);
    });
  },
};

const casino: Preset = {
  room: LOBBY,
  rain: 0,
  build(s) {
    murmur(s, "casino-chatter", 0.08, 0.35, 0.3);
    drone(s, "machines-hum", [[220, 1], [330, 0.6], [440, 0.4]], "triangle", 900, 0.006, 0.4, [0.3, 0.4]);
    // the slots: endless little pentatonic runs
    const pent = [72, 74, 76, 79, 81, 84, 86, 88];
    s.every("slot-chimes", 0.6, 2.2, (t) => {
      const n = 3 + Math.floor(Math.random() * 6);
      const pan = side();
      for (let i = 0; i < n; i++) note(s, "chip", t + i * 0.07, pick(pent), 0.05, 0.012, 0.3, pan);
    });
    s.every("jackpot", 20, 45, (t) => {
      for (let i = 0; i < 16; i++) bell(s, t + i * 0.08, 440 * Math.pow(2, (pent[i % pent.length] - 69) / 12), 0.5, 0.025, 0.4);
      for (let i = 0; i < 30; i++) tone(s, t + 0.4 + i * 0.05, rnd(3000, 4000), "sine", 0.015, 0.06, 0.3);
    });
    s.every("chips", 2, 5, (t) => {
      for (let i = 0; i < 6; i++) burst(s, t + i * rnd(0.02, 0.05), "white", "bandpass", 4200, 3, 0.04, 0.02, 0.2, side());
    });
    s.every("roulette", 15, 30, (t) => {
      let at = t;
      for (let i = 0; i < 22; i++) {
        at += 0.05 + i * i * 0.0012;
        burst(s, at, "white", "bandpass", 3200, 5, 0.03, 0.015, 0.2, 0.4);
      }
    });
    shopMusic(s, 0.03);
  },
};

const spa: Preset = {
  room: LOBBY,
  rain: 0,
  build(s) {
    fountain(s, 0.04, 0.5);
    bed(s, "spa-water", { kind: "pink", type: "lowpass", f: 700, gain: 0.08, am: [[0.2, 0.4]] });
    band(s, "calm-pad", {
      bpm: 40,
      beats: 4,
      chords: [
        [53, 65, 69, 72, 76],
        [48, 64, 67, 71, 74],
        [50, 62, 65, 69, 74],
        [48, 64, 67, 72, 76],
      ],
      inst: "pad",
      bassInst: "pad",
      vol: 0.04,
      wet: 0.6,
      comp: [0],
      compDur: 7,
    });
    s.every("singing-bowl", 18, 35, (t) => bell(s, t, 220, 7, 0.04, 0.6));
    s.every("drip", 3, 7, (t) => drip(s, t, 0.02, 0.6));
  },
};

/** Gym: a pumping beat, iron clanks, treadmills. */
const gym: Preset = {
  room: SMALL,
  rain: 0,
  build(s) {
    let next = s.now + 0.5;
    let k = 0;
    s.seq((until) => {
      while (next < until) {
        drum(s, next, 55, 0.12, 0.1);
        if (k % 2) burst(s, next, "white", "bandpass", 1800, 1, 0.04, 0.1, 0.2);
        burst(s, next + 0.25, "white", "highpass", 7000, 0.7, 0.02, 0.04, 0.1);
        if (k % 8 === 0) note(s, "chip", next, pick([57, 60, 64]), 0.4, 0.01, 0.2);
        next += 0.48;
        k++;
      }
    });
    s.layers.push("gym-beat");
    drone(s, "treadmills", [[90, 1], [180, 0.3]], "sawtooth", 400, 0.006);
    s.every("weights", 3, 8, (t) => clank(s, t, rnd(280, 380), 0.05, 0.4, 0.2, side()));
  },
};

const pool: Preset = {
  room: SHED,
  rain: 0,
  build(s) {
    lapping(s, 0.12, 0.5);
    fountain(s, 0.025, 0.5);
    murmur(s, "pool-chatter", 0.03, 0.6);
    s.every("splash", 6, 14, (t) => burst(s, t, "white", "bandpass", 1500, 0.6, 0.12, 0.6, 0.6, side(), 0.01));
  },
};

/** A hotel or flat room: quiet, a little air, the city far below. */
const room: Preset = {
  room: SMALL,
  rain: 0.2,
  build(s) {
    cityBelow(s, 0.08);
    aircon(s, 0.05);
    liftDing(s, 40, 80, 0.008);
    s.every("door-far", 30, 70, (t) => burst(s, t, "brown", "lowpass", 180, 0.7, 0.15, 0.25, 0.3));
  },
};

/** High up and outside: wind, the city below, `howl` round the structure. */
const heights = (level: number, howl: number, extra?: (s: Scene) => void): Preset => ({
  room: OPEN,
  rain: 1,
  build(s) {
    wind(s, level, howl);
    cityBelow(s, 0.06);
    extra?.(s);
  },
});

const skyPool: Preset = {
  room: OPEN,
  rain: 1,
  build(s) {
    wind(s, 0.1, 0.05);
    lapping(s, 0.1, 0.2);
    murmur(s, "pool-chatter", 0.03, 0.2);
    lounge(s, 0.03, 0.25);
    cityBelow(s, 0.05);
  },
};

const skyLounge: Preset = {
  room: LOBBY,
  rain: 0.15,
  build(s) {
    wind(s, 0.03, 0.08);
    murmur(s, "lounge-chatter", 0.04, 0.4);
    lounge(s, 0.05, 0.35);
    clinks(s, 3, 8, 0.02);
  },
};

const restaurant: Preset = {
  room: LOBBY,
  rain: 0.1,
  build(s) {
    murmur(s, "diners", 0.06, 0.4);
    clinks(s, 1.5, 4, 0.025);
    s.every("cutlery", 1, 3, (t) => tone(s, t, rnd(4000, 5500), "sine", 0.01, 0.08, 0.3, { pan: side() }));
    lounge(s, 0.04, 0.35);
  },
};

const aquarium: Preset = {
  room: LOBBY,
  rain: 0,
  build(s) {
    bed(s, "deep-water", { kind: "brown", type: "lowpass", f: 220, gain: 0.25, am: [[0.06, 0.4]], fm: [0.05, 80] });
    s.every("bubbles", 0.6, 2, (t) => {
      for (let i = 0; i < 4; i++) tone(s, t + i * rnd(0.04, 0.12), rnd(400, 900), "sine", 0.02, 0.06, 0.5, { to: rnd(1200, 1800) });
    });
    murmur(s, "diners", 0.035, 0.5);
    clinks(s, 3, 7, 0.015);
    band(s, "aquarium-pad", { bpm: 48, beats: 4, chords: [[45, 57, 64, 69, 72], [41, 57, 60, 65, 69]], inst: "pad", bassInst: "pad", vol: 0.03, wet: 0.7, comp: [0], compDur: 7 });
  },
};

const office: Preset = {
  room: SMALL,
  rain: 0.1,
  build(s) {
    aircon(s, 0.06);
    murmur(s, "office-talk", 0.025, 0.2);
    s.every("typing", 1, 3, (t) => {
      const n = 6 + Math.floor(Math.random() * 14);
      const pan = side();
      for (let i = 0; i < n; i++) burst(s, t + i * rnd(0.06, 0.14), "white", "bandpass", rnd(2500, 3500), 3, 0.025, 0.015, 0.1, pan);
    });
    s.every("phone", 25, 60, (t) => {
      for (let r = 0; r < 2; r++) for (const f of [440, 480]) tone(s, t + r * 0.6, f, "sine", 0.015, 0.05, 0.2, { hold: 0.35 });
    });
  },
};

/** The boardroom: a ticking clock, the city through the glass. */
const executive: Preset = {
  room: SMALL,
  rain: 0.15,
  build(s) {
    cityBelow(s, 0.07);
    aircon(s, 0.03);
    let next = s.now + 0.5;
    let k = 0;
    s.seq((until) => {
      while (next < until) {
        burst(s, next, "white", "bandpass", k++ % 2 ? 3200 : 2700, 6, 0.03, 0.015, 0.3);
        next += 1;
      }
    });
    s.layers.push("clock-tick");
  },
};

const arcade: Preset = {
  room: SMALL,
  rain: 0,
  build(s) {
    murmur(s, "players", 0.05, 0.25, 0.4);
    const scale = [60, 62, 64, 67, 69, 72, 74, 76, 79];
    band(s, "chiptune", {
      bpm: 132,
      beats: 4,
      chords: [
        [45, 69, 72, 76],
        [41, 69, 72, 77],
        [43, 67, 71, 74],
        [40, 67, 71, 76],
      ],
      inst: "chip",
      bassInst: "chip",
      vol: 0.02,
      wet: 0.15,
      comp: [0, 1.5, 3],
      compDur: 0.15,
      melody: "chip",
      melodyProb: 0.6,
    });
    s.every("cabinet-bleeps", 0.4, 1.5, (t) => {
      const pan = side();
      for (let i = 0; i < 4; i++) note(s, "chip", t + i * 0.06, pick(scale) + 12, 0.04, 0.008, 0.1, pan);
    });
    s.every("coin", 8, 20, (t) => {
      note(s, "chip", t, 83, 0.06, 0.012, 0.1);
      note(s, "chip", t + 0.07, 88, 0.25, 0.012, 0.1);
    });
  },
};

const bowling: Preset = {
  room: SHED,
  rain: 0,
  build(s, e) {
    arcade.build(s, e);
    s.every("strike", 5, 12, (t) => {
      for (let i = 0; i < 10; i++) burst(s, t + 2 + i * rnd(0.01, 0.04), "white", "bandpass", rnd(1500, 2500), 2, 0.07, 0.12, 0.4, 0.3);
      burst(s, t, "brown", "lowpass", 200, 0.7, 0.2, 2, 0.3, 0.3, 0.2);
    });
  },
};

const mall = (vortex: number, kind: "shops" | "hawker" | "cinema"): Preset => ({
  room: HALL,
  rain: 0.05,
  build(s, e) {
    murmur(s, "mall-chatter", kind === "hawker" ? 0.11 : 0.08, 0.6, 0.2);
    // the escalators' hum
    drone(s, "escalators", [[100, 1], [200, 0.3], [300, 0.15]], "sine", 400, 0.012);
    bed(s, "escalator-rumble", { kind: "brown", type: "lowpass", f: 180, gain: 0.05 });
    // the Rain Vortex: a 40 m waterfall into the canal
    if (vortex > 0) {
      bed(s, "rain-vortex", { kind: "pink", type: "lowpass", f: 3200, gain: 0.45 * vortex, wet: 0.5, am: [[0.3, 0.1]] });
      bed(s, "vortex-thunder", { kind: "brown", type: "lowpass", f: 260, gain: 0.4 * vortex, am: [[0.13, 0.2]] });
    }
    s.every("footsteps", 1.5, 4, (t) => walker(s, t, "hard", 0.04, 0.4));
    // the mall jingle before an announcement
    s.every(
      "mall-jingle",
      40,
      80,
      (t) => [72, 76, 79, 84].forEach((n, i) => bell(s, t + i * 0.28, 440 * Math.pow(2, (n - 69) / 12), 1.6, 0.03, 0.7)),
      12,
    );
    if (kind === "hawker") {
      bed(s, "woks-sizzle", { kind: "white", type: "highpass", f: 4500, gain: 0.03, am: [[5, 0.5], [11, 0.3]] });
      s.every("wok-clang", 1.5, 4, (t) => clank(s, t, rnd(800, 1100), 0.05, 0.35, 0.3, side()));
      clinks(s, 2, 5, 0.02);
    } else if (kind === "cinema") arcade.build(s, e);
    else shopMusic(s, 0.025);
  },
});

const prison: Preset = {
  room: METAL,
  rain: 0.15,
  build(s) {
    drone(s, "cold-air", [[55, 1], [82.5, 0.3]], "sine", 200, 0.04);
    // the strip lights' buzz
    drone(s, "light-buzz", [[100, 1], [200, 0.5], [300, 0.3]], "sawtooth", 2400, 0.003, 0.1, [7, 0.3]);
    s.every("drip", 1, 3, (t) => drip(s, t, 0.05, 0.7));
    s.every("door-slam", 8, 20, (t) => {
      clank(s, t, rnd(150, 210), 0.3, 2.2, 0.8, side());
      burst(s, t, "brown", "lowpass", 300, 0.7, 0.5, 0.4, 0.8);
    });
    s.every("footsteps-steel", 3, 8, (t) => walker(s, t, "steel", 0.06, 0.6));
    s.every("keys", 15, 35, (t) => {
      for (let i = 0; i < 8; i++) tone(s, t + i * rnd(0.03, 0.08), rnd(3500, 5200), "sine", 0.015, 0.1, 0.5, { pan: 0.3 });
    });
    s.every("shout", 25, 60, (t) => vowel(s, t, rnd(140, 200), 0.6, 0.05, [700, 1200], 0.9, 1, side()));
    murmur(s, "inmates", 0.02, 0.8);
  },
};

const reserveHall: Preset = {
  room: HALL,
  rain: 0.05,
  build(s) {
    bed(s, "marble-air", { kind: "brown", type: "lowpass", f: 90, gain: 0.07 });
    murmur(s, "hushed-murmur", 0.035, 0.6);
    s.every("footsteps", 2.5, 6, (t) => walker(s, t, "hard", 0.06, 0.6));
    // the counter's service bell
    s.every("teller-bell", 8, 20, (t) => bell(s, t, 2093, 1.4, 0.035, 0.6, side()));
    s.every("coins", 10, 25, (t) => {
      for (let i = 0; i < 6; i++) tone(s, t + i * rnd(0.04, 0.1), rnd(4500, 6000), "sine", 0.01, 0.12, 0.4);
    });
    s.on.block = (t) => bell(s, t, 2093, 1.6, 0.05, 0.6);
  },
};

const trading: Preset = {
  room: HALL,
  rain: 0,
  build(s) {
    // the pit: a bright, loud roar of shouting traders
    const pit = murmur(s, "pit-roar", 0.16, 0.4, 0.8);
    bed(s, "pit-body", { kind: "pink", type: "bandpass", f: 900, q: 0.7, gain: 0.08, wet: 0.4, am: [[0.21, 0.3]] });
    s.knobs.crowd = pit.gain;
    s.every("shouts", 0.8, 2.5, (t) => vowel(s, t, rnd(150, 230), rnd(0.15, 0.35), 0.03, pick([[700, 1200], [400, 2200], [600, 1000]]) as [number, number], 0.4, 1, side()));
    s.every("phones", 4, 10, (t) => {
      const pan = side();
      for (let r = 0; r < 3; r++) for (const f of [440, 480]) tone(s, t + r * 0.25, f, "square", 0.006, 0.04, 0.2, { hold: 0.15, lp: 2000, pan });
    });
    s.every("ticker", 0.5, 1.5, (t) => tone(s, t, pick([1760, 2093, 2349]), "sine", 0.008, 0.05, 0.2, { pan: side() }));
    // a block: the opening bell rings and the pit erupts
    s.on.block = (t) => {
      for (let i = 0; i < 40; i++) bell(s, t + i * 0.075, 880, 0.35, 0.05, 0.5);
      pit.gain.setTargetAtTime(0.35, t + 0.2, 0.15);
      pit.gain.setTargetAtTime(0.16, t + 4, 1);
    };
  },
};

const pyramid = (deep: boolean): Preset => ({
  room: STONE,
  rain: 0,
  build(s) {
    // an eerie drone, two tones beating slowly
    drone(s, "eerie-drone", deep ? [[41, 1], [41.6, 1], [61.7, 0.5], [123.5, 0.15]] : [[55, 1], [55.4, 1], [82.4, 0.4]], "sawtooth", deep ? 260 : 320, 0.035, 0.6, [0.05, 0.4]);
    // the air through the shafts
    bed(s, "shaft-wind", { kind: "pink", type: "bandpass", f: 300, q: 2, gain: 0.08, wet: 0.5, fm: [0.04, 120], am: [[0.07, 0.6]] });
    // torches
    s.every("torch-crackle", 0.08, 0.4, (t) => burst(s, t, "white", "highpass", 2500, 0.7, rnd(0.008, 0.035), 0.02, 0.15, side()));
    bed(s, "torch-roar", { kind: "brown", type: "lowpass", f: 300, gain: 0.04, am: [[2.3, 0.3]] });
    // stone grinding somewhere in the labyrinth
    s.every("stone-grind", 15, 35, (t) => {
      const f = burst(s, t, "brown", "lowpass", 160, 0.7, 0.5, 3.5, 0.7, side(), 1.2);
      f.frequency.linearRampToValueAtTime(320, t + 2);
      for (let i = 0; i < 20; i++) burst(s, t + 0.3 + i * rnd(0.08, 0.2), "pink", "bandpass", 500, 2, 0.04, 0.06, 0.6);
    });
    s.every("sand-trickle", 6, 14, (t) => burst(s, t, "white", "bandpass", 5000, 1, 0.02, 1.5, 0.5, side(), 0.3));
    s.every("footsteps", 6, 14, (t) => walker(s, t, "stone", 0.04, 0.8));
    if (deep)
      band(s, "chamber-choir", { bpm: 30, beats: 4, chords: [[33, 57, 60, 64], [34, 58, 62, 65]], inst: "pad", bassInst: "pad", vol: 0.025, wet: 0.9, comp: [0], compDur: 7.5 });
  },
});

const opera = (foyer: boolean): Preset => ({
  room: foyer ? LOBBY : CATHEDRAL,
  rain: foyer ? 0.15 : 0,
  build(s) {
    if (foyer) {
      murmur(s, "foyer-chatter", 0.07, 0.4);
      clinks(s, 1.5, 4, 0.025);
      lapping(s, 0.04, 0);
      s.every("interval-bell", 45, 90, (t) => [0, 0.3, 0.6].forEach((dt) => bell(s, t + dt, 1046, 1, 0.025, 0.5)));
    } else {
      // the hall's own quiet: air, programmes rustling, a cough (the orchestra plays on top)
      bed(s, "hall-air", { kind: "brown", type: "lowpass", f: 80, gain: 0.06 });
      murmur(s, "audience", 0.015, 0.8);
      s.every("rustle", 5, 12, (t) => burst(s, t, "white", "bandpass", 3500, 1, 0.012, 0.4, 0.6, side(), 0.1));
      s.every("cough", 15, 40, (t) => burst(s, t, "pink", "bandpass", 900, 1.2, 0.04, 0.12, 0.8, side()));
    }
  },
});

const greatHall: Preset = {
  room: CATHEDRAL,
  rain: 0.1,
  build(s) {
    bed(s, "hall-air", { kind: "brown", type: "lowpass", f: 80, gain: 0.08 });
    murmur(s, "visitors", 0.04, 0.8);
    s.every("footsteps", 2, 5, (t) => walker(s, t, "stone", 0.06, 0.8));
    s.every("shh", 40, 80, (t) => shh(s, t, 0.03, 0.8));
  },
};

/** Big Ben: the escapement's tick-tock, the going train's whirr. */
const clockwork = (windLevel: number, tickLevel: number): Preset => ({
  room: STONE,
  rain: windLevel > 0 ? 0.6 : 0.1,
  build(s) {
    let next = s.now + 0.4;
    let k = 0;
    s.seq((until) => {
      while (next < until) {
        const tick = k++ % 2 === 0;
        burst(s, next, "white", "bandpass", tick ? 1800 : 1400, 5, tickLevel, 0.03, 0.6);
        tone(s, next, tick ? 620 : 540, "triangle", tickLevel * 0.4, 0.25, 0.6);
        burst(s, next + 0.01, "brown", "lowpass", 200, 0.7, tickLevel * 1.5, 0.08, 0.4);
        next += 1;
      }
    });
    s.layers.push("tick-tock");
    drone(s, "gear-train", [[38, 1], [76, 0.4]], "sawtooth", 260, tickLevel * 0.25, 0.4, [0.5, 0.3]);
    s.every("gear-clunk", 6, 15, (t) => clank(s, t, rnd(180, 260), tickLevel * 0.6, 0.6, 0.6));
    if (windLevel > 0) wind(s, windLevel, 0.15);
  },
});

const stairwell: Preset = {
  room: STONE,
  rain: 0.2,
  build(s) {
    bed(s, "stair-draught", { kind: "pink", type: "bandpass", f: 400, q: 1.5, gain: 0.05, wet: 0.6, fm: [0.05, 150], am: [[0.08, 0.5]] });
    s.every("footsteps", 3, 7, (t) => walker(s, t, "stone", 0.05, 0.8));
    // the clock far above
    let next = s.now + 0.4;
    s.seq((until) => {
      while (next < until) {
        burst(s, next, "white", "bandpass", 1600, 5, 0.006, 0.03, 0.8);
        next += 1;
      }
    });
  },
};

const factory: Preset = {
  room: SHED,
  rain: 0.3,
  build(s) {
    // the machine hum: mains and its harmonics, heavy
    drone(s, "machine-hum", [[50, 1], [100, 0.7], [150, 0.4], [200, 0.2]], "sawtooth", 500, 0.03, 0.3, [0.4, 0.1]);
    bed(s, "fans", { kind: "pink", type: "bandpass", f: 420, q: 0.6, gain: 0.25, wet: 0.3, am: [[6, 0.08]] });
    bed(s, "fans-hiss", { kind: "white", type: "bandpass", f: 2200, q: 0.5, gain: 0.03, wet: 0.3 });
    bed(s, "floor-rumble", { kind: "brown", type: "lowpass", f: 120, gain: 0.3 });
    // the conveyor's clatter
    let next = s.now + 0.3;
    s.seq((until) => {
      while (next < until) {
        burst(s, next, "white", "bandpass", rnd(1400, 2200), 4, rnd(0.02, 0.05), 0.03, 0.3, -0.3);
        next += rnd(0.11, 0.2);
      }
    });
    s.layers.push("conveyor");
    // the forklift reversing
    s.every("forklift-beeps", 10, 22, (t) => {
      const pan = side();
      for (let i = 0; i < 6; i++) tone(s, t + i * 0.8, 1000, "square", 0.015, 0.03, 0.4, { hold: 0.4, lp: 3000, pan });
    });
    s.every("press", 4, 9, (t) => {
      burst(s, t, "brown", "lowpass", 220, 0.7, 0.6, 0.35, 0.5);
      clank(s, t, rnd(140, 180), 0.12, 0.8, 0.5);
    });
    s.every("steam", 12, 25, (t) => burst(s, t, "white", "highpass", 3000, 0.7, 0.08, 1.2, 0.4, side(), 0.05));
    s.on.block = (t) => {
      // a block mined: the klaxon
      for (let i = 0; i < 3; i++) brass(s, t + i * 0.7, 330, 0.45, 0.05, 0.5, 1400);
    };
  },
};

const controlRoom: Preset = {
  room: SMALL,
  rain: 0.1,
  build(s) {
    bed(s, "factory-through-glass", { kind: "pink", type: "lowpass", f: 280, gain: 0.15 });
    drone(s, "machine-hum", [[50, 1], [100, 0.5]], "sawtooth", 200, 0.012);
    aircon(s, 0.04);
    s.every("console-beeps", 2, 6, (t) => tone(s, t, pick([1046, 1318, 1568]), "sine", 0.01, 0.1, 0.2, { pan: side() }));
    s.every("typing", 3, 8, (t) => {
      for (let i = 0; i < 10; i++) burst(s, t + i * rnd(0.06, 0.12), "white", "bandpass", 3000, 3, 0.02, 0.015, 0.1, 0.4);
    });
  },
};

/** A shop: the door chime as you come in, soft music, the fridges, the till. */
const shop = (vault = false): Preset => ({
  room: vault ? METAL : SMALL,
  rain: vault ? 0 : 0.25,
  build(s) {
    if (vault) {
      drone(s, "vault-hum", [[55, 1], [110, 0.3]], "sine", 300, 0.05);
      s.every("vault-tick", 0.9, 1.1, (t) => burst(s, t, "white", "bandpass", 2400, 6, 0.008, 0.02, 0.6));
      s.every("bolt", 20, 45, (t) => clank(s, t, 160, 0.1, 1.5, 0.8));
      return;
    }
    drone(s, "fridges", [[60, 1], [120, 0.5]], "sine", 300, 0.02);
    murmur(s, "customers", 0.025, 0.2);
    shopMusic(s, 0.03);
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
    bed(s, "room-air", { kind: "brown", type: "lowpass", f: 90, gain: 0.06 });
    if (press) {
      murmur(s, "newsroom", 0.04, 0.2);
      s.every("typing", 0.8, 2.5, (t) => {
        const pan = side();
        for (let i = 0; i < 12; i++) burst(s, t + i * rnd(0.06, 0.13), "white", "bandpass", rnd(2200, 3200), 3, 0.03, 0.015, 0.1, pan);
      });
      s.every("printer", 25, 50, (t) => {
        for (let i = 0; i < 18; i++) burst(s, t + i * 0.12, "pink", "bandpass", 900, 2, 0.04, 0.08, 0.2, 0.5);
      });
    } else {
      s.every("page-turn", 3, 9, (t) => burst(s, t, "white", "bandpass", 4000, 0.8, 0.03, 0.25, 0.5, side(), 0.06));
      s.every("footsteps", 6, 14, (t) => walker(s, t, "soft", 0.06, 0.5));
      s.every("shh", 40, 90, (t) => shh(s, t, 0.025, 0.6));
    }
  },
});

const construction: Preset = {
  room: OPEN,
  rain: 1,
  build(s) {
    wind(s, 0.05);
    cityBelow(s, 0.1);
    s.every("hammer", 2, 6, (t) => {
      const n = 3 + Math.floor(Math.random() * 5);
      const pan = side();
      for (let i = 0; i < n; i++) clank(s, t + i * 0.42, rnd(900, 1100), 0.05, 0.25, 0.3, pan);
    });
    s.every("drill", 10, 25, (t) => tone(s, t, 180, "sawtooth", 0.02, 0.2, 0.2, { a: 0.1, hold: rnd(1, 2.5), to: 260, lp: 1500, pan: side() }));
    s.every("crane-beeps", 20, 40, (t) => {
      for (let i = 0; i < 5; i++) tone(s, t + i * 0.6, 1200, "square", 0.008, 0.03, 0.3, { hold: 0.3, lp: 3000 });
    });
  },
};

/** The Eiffel tower's platforms: wind, visitors, a musette waltz from the brasserie. */
const eiffel = (level: number, crowd: number, musette: number): Preset => ({
  room: OPEN,
  rain: 1,
  build(s) {
    wind(s, level, 0.25);
    if (crowd) murmur(s, "visitors", crowd, 0.2);
    band(s, "musette-waltz", {
      bpm: 168,
      beats: 3,
      chords: [
        [45, 69, 72, 76],
        [40, 68, 71, 74],
        [40, 68, 71, 74],
        [45, 69, 72, 76],
        [50, 69, 74, 77],
        [45, 69, 72, 76],
        [40, 68, 71, 74],
        [45, 69, 72, 76],
      ],
      inst: "musette",
      bassInst: "harp",
      vol: musette,
      wet: 0.25,
      comp: [1, 2],
      compDur: 0.5,
      melody: "musette",
      melodyProb: 0.5,
    });
    s.every("lift-machinery", 30, 60, (t) => tone(s, t, 70, "sawtooth", 0.03, 1, 0.2, { a: 1, hold: 4, lp: 300 }));
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
  "wind-high": heights(0.16, 0.35),
  "wind-mid": heights(0.09, 0.15),
  "rooftop": heights(0.08, 0.1, (s) => {
    murmur(s, "bar-chatter", 0.03, 0.2);
    lounge(s, 0.03, 0.2);
  }),
  "helipad": heights(0.2, 0.3),
  "mall-vortex": mall(1, "shops"),
  "mall": mall(0.25, "shops"),
  "mall-hawker": mall(0.1, "hawker"),
  "mall-cinema": mall(0, "cinema"),
  prison,
  "reserve-hall": reserveHall,
  trading,
  pyramid: pyramid(false),
  "pyramid-chamber": pyramid(true),
  "opera-foyer": opera(true),
  "opera-hall": opera(false),
  "great-hall": greatHall,
  stairwell,
  "clock-room": clockwork(0, 0.05),
  "belfry": clockwork(0.1, 0.025),
  factory,
  "control-room": controlRoom,
  shop: shop(),
  vault: shop(true),
  "press-room": library(true),
  "stacks": library(false),
  construction,
  "eiffel-ground": eiffel(0.04, 0.05, 0.03),
  "eiffel-platform": eiffel(0.11, 0.03, 0.022),
  "eiffel-summit": eiffel(0.18, 0.015, 0.012),
};

/** Each soundscape's overall level, balanced against the street's mix (a library is hushed, a stadium is not). */
export const LEVEL: Record<string, number> = {
  "reserve-hall": 2.5,
  "quiet-hall": 2.5,
  museum: 2,
  "opera-foyer": 3,
  "opera-hall": 2,
  "great-hall": 2.5,
  stairwell: 2,
  "clock-room": 4,
  belfry: 1.3,
  "press-room": 3,
  stacks: 2.5,
  arcade: 5,
  bowling: 4.5,
  gym: 6,
  office: 2.5,
  "hotel-lobby": 2.2,
  atrium: 2,
  casino: 3,
  room: 1.3,
  trading: 4,
  executive: 2,
  pool: 2.5,
  "mall-cinema": 2.5,
  mall: 1.3,
  "mall-hawker": 1.5,
  "sky-lounge": 1.8,
  restaurant: 2,
  prison: 1.2,
  shop: 1.3,
  factory: 1.6,
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
      if (has("museum")) return "quiet-hall";
      if (has("crown", "torch")) return "wind-high";
      if (has("balcony")) return "wind-mid";
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
    case "cards":
      return "shop";
    case "bank":
      return has("vault") ? "vault" : "reserve-hall";
    case "zsa":
      return "construction";
    case "library":
      return has("press", "news") ? "press-room" : "stacks";
    default:
      return "quiet-hall";
  }
}
