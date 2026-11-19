/**
 * LASER SWEEP's three arenas, as data (the game is laser.ts, the scenery scenery.ts):
 * - NEON CORE: the classic, a neon disc high over the night city.
 * - ORBIT RING: a ring-shaped deck on a space station over the Earth, the core on spokes in the hole
 *   in its middle. LOW GRAVITY: jumps float (jump earlier, you stay up longer), so a cyan just after a
 *   pink catches you in the air (the crossings' hazard stripes grow), and shoves slide further.
 * - PROOF FACTORY: a steel turntable in the Proof Factory's mining hall over a river of molten metal. Its OUTER RING
 *   TURNS and carries whoever stands on it (big arrows show the way); it turns back on a horn (the
 *   arrows blink amber first). Ride it with the beam and the beam comes round less often.
 */
import type { SongKey } from "../../music";
import type { AmbienceKind } from "../../../audio/kinds";

export type LaserKey = "neon" | "orbit" | "foundry";

/** The deck's outer radius (every level: the camera and the beams are made for it). */
export const R = 7.5;

export interface LaserLevel {
  key: LaserKey;
  title: string;
  titleZh: string;
  /** Its twist in one line. */
  tag: string;
  tagZh: string;
  song: SongKey;
  ambience: AmbienceKind;
  /** The inner rail: nobody stands closer to the core (a ring deck's hole is inside it). */
  rin: number;
  /** A ring deck (a hole round the core) rather than a disc. */
  ring: boolean;
  /** How far from the axis the four start. */
  spawn: number;
  /** Gravity (m/s²), the jump's speed, the ideal lead (s: about the time to the top of a jump). */
  grav: number;
  jumpV: number;
  lead: number;
  /** The gravity of one flung off (it drifts away in space). */
  outGrav: number;
  /** How fast a knock dies away (/s): lower slides further. */
  grip: number;
  /** The beams' speed against the classic's; when the second arm comes (s). */
  speed: number;
  twoAt: number;
  /** The turntable: its outer ring from this radius turns (0: none), at about this speed (rad/s). */
  band: number;
  bandSpeed: number;
  /** The floor's rings of tiles (radii), tiles per ring. */
  rings: number[];
  tiles: number;
  look: {
    sky: [string, string];
    /** Fog near/far (0, 0: none). */
    fog: [number, number];
    hemi: [string, string, number];
    sun: [string, number, [number, number, number]];
    floor: { base: string; a: string; b: string; seam: string; bevel: string; stripe: string; stripeBg: string; rim: string; rimInk: string; stud: string };
    side: { base: string; top: string; bottom: string; panel: string };
    lip: string;
    lipGlow: string;
    turret: string;
    core: { base: string; gold: string; pylon: string; band: string; orb: string; halo: string; light: string; idle: string };
    bulbs: { on: string; off: string };
  };
}

export const NEON: LaserLevel = {
  key: "neon",
  title: "NEON CORE",
  titleZh: "霓虹核心",
  tag: "The classic: a neon disc high over the night city",
  tagZh: "经典：夜城上空的霓虹圆台",
  song: "neon",
  ambience: "city-night",
  rin: 1.6,
  ring: false,
  spawn: 4.6,
  grav: 30,
  jumpV: 9.5,
  lead: 0.31,
  outGrav: 30,
  grip: 5,
  speed: 1,
  twoAt: 24,
  band: 0,
  bandSpeed: 0,
  rings: [1.75, 2.7, 3.65, 4.6, 5.55, 6.45, 6.95],
  tiles: 24,
  look: {
    sky: ["#0b0826", "#2e1d63"],
    fog: [46, 175],
    hemi: ["#d6d0ff", "#4a3a6e", 2.1],
    // (the moon's side: the shadows fall to the right across the disc)
    sun: ["#fff1fa", 1.9, [-22, 30, 10]],
    floor: { base: "#1c1640", a: "#544bc4", b: "#483fae", seam: "#2a2274", bevel: "rgba(255,255,255,0.10)", stripe: "#ffd23f", stripeBg: "#1a1430", rim: "#ffbf2e", rimInk: "#c98a00", stud: "#fff3c4" },
    side: { base: "#c92f86", top: "#ffffff", bottom: "#8c1d5e", panel: "#e8509f" },
    lip: "#efe4ff",
    lipGlow: "#a77bff",
    turret: "#3a2f8a",
    core: { base: "#30276f", gold: "#ffd23f", pylon: "#f4f0ff", band: "#ff7ad1", orb: "#ffb3e6", halo: "#ff5fc8", light: "#d9a6ff", idle: "#b98cff" },
    bulbs: { on: "#fff3a0", off: "#6a4a9a" },
  },
};

export const ORBIT: LaserLevel = {
  key: "orbit",
  title: "ORBIT RING",
  titleZh: "轨道环",
  tag: "Low gravity on a ring in space: jump early, float long, mind the cyan",
  tagZh: "太空环上的低重力：早点跳、飘得久、小心青色",
  song: "lattice",
  ambience: "space",
  rin: 3.3,
  ring: true,
  spawn: 5.3,
  grav: 18,
  jumpV: 7.8,
  lead: 0.43,
  outGrav: 4,
  grip: 2.4,
  speed: 1.2,
  twoAt: 20,
  band: 0,
  bandSpeed: 0,
  rings: [3.45, 4.2, 4.95, 5.7, 6.45, 6.95],
  tiles: 32,
  look: {
    sky: ["#01020a", "#0c1a4a"],
    fog: [0, 0],
    hemi: ["#dfe8ff", "#1a2238", 1.9],
    sun: ["#ffffff", 2.6, [-18, 26, 14]],
    floor: { base: "#121829", a: "#3b4b76", b: "#33426b", seam: "#1a2240", bevel: "rgba(190,225,255,0.16)", stripe: "#ffd23f", stripeBg: "#121829", rim: "#dfe8f5", rimInk: "#7f8ea8", stud: "#7fe0ff" },
    side: { base: "#e9eef7", top: "#ffffff", bottom: "#9aa6bd", panel: "#4fb8ff" },
    lip: "#ffffff",
    lipGlow: "#4fb8ff",
    turret: "#2a3352",
    core: { base: "#2a3352", gold: "#ffd23f", pylon: "#f4f7ff", band: "#5fd0ff", orb: "#c4f2ff", halo: "#4fc8ff", light: "#9ad8ff", idle: "#7fb8ff" },
    bulbs: { on: "#bfe9ff", off: "#34405e" },
  },
};

export const FOUNDRY: LaserLevel = {
  key: "foundry",
  title: "PROOF FACTORY",
  titleZh: "证明工厂",
  tag: "A turntable floor: the outer ring carries you, and switches on the horn",
  tagZh: "转盘地面：外圈带着你转，号角响起就换向",
  song: "funk",
  ambience: "foundry",
  rin: 1.6,
  ring: false,
  spawn: 5.0,
  grav: 30,
  jumpV: 9.5,
  lead: 0.31,
  outGrav: 30,
  grip: 5,
  speed: 1,
  twoAt: 24,
  band: 4.3,
  bandSpeed: 0.38,
  rings: [1.75, 2.6, 3.45, 4.3],
  tiles: 20,
  look: {
    sky: ["#100a10", "#4a1c12"],
    fog: [32, 140],
    // (cool daylight from the roof's skylights against the river's warm glow from below: the steel keeps its shapes)
    hemi: ["#dfe6ff", "#6a2e14", 1.9],
    sun: ["#f0f4ff", 2.2, [-16, 30, 12]],
    floor: { base: "#26262c", a: "#727684", b: "#666a78", seam: "#30323c", bevel: "rgba(255,255,255,0.14)", stripe: "#ffd23f", stripeBg: "#1d1a1c", rim: "#6a625a", rimInk: "#2a2522", stud: "#ffcf7a" },
    side: { base: "#3d3936", top: "#ffb347", bottom: "#1f1c1a", panel: "#57504a" },
    lip: "#ffe2b8",
    lipGlow: "#ff8a2e",
    turret: "#3b3633",
    core: { base: "#2b2826", gold: "#ffb347", pylon: "#ebe6df", band: "#ff7a1a", orb: "#ffd08a", halo: "#ff7a2e", light: "#ffb070", idle: "#ffb070" },
    bulbs: { on: "#ffd27a", off: "#4a3a2e" },
  },
};

export const LEVELS: LaserLevel[] = [NEON, ORBIT, FOUNDRY];
