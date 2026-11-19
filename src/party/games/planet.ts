/**
 * PLANET GRAB (星球抢旗): the four zkSNARKs sprint round a tiny voxel planet floating in space and
 * snag the flags that pop up on it, each under a beam of light. Most flags in 40 s wins (a tie:
 * whoever got to that count first); the rare golden Z flag is worth 3. From 8 s meteors fall, each
 * marked first by a red ring on the ground that fills up as it comes (and a whistle): a hit stuns,
 * flings and knocks a flag loose for anyone to snatch. A dashes: a short lunge that bumps a rival
 * off a flag and knocks one of theirs loose. The last 10 s: HURRY!, three flags at once, a shower.
 *
 * Three worlds (LEVELS): GENESIS MEADOW (the grassy first one: a pond, the ZK TOWER, trees),
 * ORCHARD TIDE (a bigger ringed ocean world at dusk: its moon sweeps over it, and inside the moon's
 * glowing circle you are dragged toward its middle and float) and PROOF FACTORY (a small steel world
 * wrapped by two conveyor belts that carry runners and flags, and reverse on a klaxon).
 *
 * The sphere: a runner is a spot `n` on the unit sphere, a heading `f` and a velocity `v` (both
 * tangent there) and a height over the ground. A move turns `n` round the axis n × v and carries
 * the tangents with it (parallel transport), so nothing drifts or jitters; the snark's root is
 * the basis (n × f, n, f). The camera keeps a frame of its own (up `cn`, forward `cf`), eased
 * toward the human and carried the same way: the arrows are that frame's, so "up" always runs
 * away from the camera wherever on the planet the human is.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T } from "../../i18n/lang";
import { FONT, H, HUD, W, backOut, clamp, ease, fpx, inputOf, isLocal, lerp, rankBy, rng, rr, sfx, shout, sound, text, zoom, type Input, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { music, type SongKey } from "../music";
import { markGlow, postQuality } from "../post";
import { SHADOWS_FORCED, SHADOWS_OFF } from "../shadows";
import { actIcon, actsOf } from "../acts";
import { touchy } from "../hud";
import { Avatar, CamRig, GEO, banner, canvasTex, clock, cornerSpot, corners, disposeScene, glow, outline, qBlock, short, tag, toScreen, toon, toonSteps, world } from "../k3";
import type { AmbienceKind } from "../../audio/kinds";
import { spaceDome, starShell, sunBake } from "./planet-levels/sky";
import { CELLS, TONE, cellUv, tileAtlas, waveTex } from "./planet-levels/ground";
import { SEE, WIND, seeThrough, sway } from "./planet-levels/mats";

type Vec = THREE.Vector3;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** The game (s). */
const TIME = 40;
/** The planet's radius (m): the level's (set when a game is made, and again on each step). */
let R = 8;
/** Running: the human's top speed (m/s), the grip (per s), the grip in the air (share), the pull down. */
const SPEED = 7.2;
const ACC = 11;
const AIR = 0.35;
const G = 28;
/** A runner's radius (m), the reach of a flag (m). */
const PR = 0.42;
const GRAB = 1.0;
/** The dash: its speed, how long, the wait after it, the reach of its bump. */
const DASH_V = 13.5;
const DASH_T = 0.22;
const DASH_CD = 1.15;
const TACKLE = 1.1;
/** Meteors: the blast's radius (m), the first one (s). */
const MET_R = 1.75;
const MET_AT = 8;
/** The last stretch starts here (10 s left). */
const HURRY_AT = TIME - 10;
/** The golden flags (s). */
const GOLD_AT = [12, 23.5, 33];
/** The play camera: up, back, the look ahead (m). */
const CAM_UP = 8.6;
const CAM_BACK = 6.6;
const CAM_AHEAD = 2.4;

const FLAG_C = ["#a98bff", "#2fe0c4"];
const GOLD_C = "#ffd23f";
const ACCENT = "#a98bff";

const S_OFF = 0;
const S_RISE = 1;
const S_LIVE = 2;
const S_TAKEN = 3;
const S_FLY = 4;

const UP = v3(0, 1, 0);
const XX = v3(1, 0, 0);
const cols = (...h: string[]) => h.map((c) => new THREE.Color(c));
const CONF = cols("#ffffff", "#ffd23f", "#a98bff", "#2fe0c4", "#ff8fc8");
const GOLDS = cols("#ffd23f", "#fff4c4", "#ffb300", "#ffffff");
const ROCKS = cols("#5b3b4f", "#8a5468", "#3a2433", "#b07a6a");
const FIRE = cols("#ffd23f", "#ff8a2a", "#ff4b2b", "#fff1b0");
const DUST = cols("#e9f7d8", "#c9eab0", "#ffffff");
const WATER = cols("#bff0ff", "#7fd8ff", "#ffffff");
const STARS = cols("#fff27a", "#ffffff", "#ffd23f");

// ---- the levels: a planet (radius, ground, pieces), a sky and its light, a twist ---------------------

type LevelKey = "meadow" | "tide" | "foundry";
interface Level {
  key: LevelKey;
  title: string;
  titleZh: string;
  /** Its twist, in one line. */
  tag: string;
  tagZh: string;
  song: SongKey;
  ambience: AmbienceKind;
  /** The planet's radius (m). */
  r: number;
  /** The sky (top, low), the sky light (sky, ground, intensity), the sun's intensity. */
  sky: [string, string];
  hemi: [string, string, number];
  sun: number;
  /** Where its sun stands (latitude, longitude): the sky is painted from it, the planet's day side leans to it. */
  sunAt: [number, number];
  /** The key light's colour on the day side and on the far side; the sky light's likewise. */
  keyTone: [string, string];
  fillTone: [string, string];
  /** How dark a cast shadow is (1: the stage's). */
  shade: number;
  /** A coloured light from ahead (the rims of things), its intensity; the shooting stars' colour; the footsteps' bits. */
  rim: [string, number];
  shoot: string;
  /** The meteors' gaps, scaled (1: the meadow's). */
  metGap: number;
}
const LEVELS: Level[] = [
  {
    key: "meadow",
    title: "GENESIS MEADOW",
    titleZh: "创世草原",
    tag: "The first little world: grass, a pond and the ZK TOWER. Dodge the meteor rings.",
    tagZh: "第一颗小星球：草地、池塘和 ZK 塔。躲开流星红圈。",
    song: "lattice",
    ambience: "meadow",
    r: 8,
    sky: ["#05041a", "#22185a"],
    hemi: ["#efeaff", "#4a3a8a", 1.55],
    sun: 2.4,
    sunAt: [-20, 66],
    keyTone: ["#fff0d8", "#d4dcff"],
    fillTone: ["#efeaff", "#c9ccff"],
    shade: 0.95,
    rim: ["#b9a0ff", 0.45],
    shoot: "#fff6c4",
    metGap: 1,
  },
  {
    key: "tide",
    title: "ORCHARD TIDE",
    titleZh: "果园潮汐",
    tag: "A ringed ocean world at dusk: the passing moon's glowing circle drags you in and you float.",
    tagZh: "黄昏的环形海洋星球：月亮掠过，发光圈会把你拉向中心，还让你飘起来。",
    song: "marina",
    ambience: "sea",
    r: 8.8,
    sky: ["#1d1650", "#ff9a78"],
    hemi: ["#fff0e6", "#4a3f8a", 1.6],
    sun: 2.3,
    sunAt: [-23, 31],
    keyTone: ["#ffd6ac", "#c4ccff"],
    fillTone: ["#ffe9dc", "#bfbcf4"],
    shade: 0.9,
    rim: ["#9fc8ff", 0.8],
    shoot: "#ffd0e8",
    metGap: 1.05,
  },
  {
    key: "foundry",
    title: "PROOF FACTORY",
    titleZh: "证明工厂",
    tag: "A small steel world of provers: two conveyor belts carry you and the flags, and reverse on the klaxon.",
    tagZh: "钢铁小星球：两条传送带载着你和旗子跑，警报一响就反转。",
    song: "funk",
    ambience: "foundry",
    r: 7.4,
    sky: ["#0d0508", "#4a1512"],
    hemi: ["#fff1e2", "#5a2a24", 1.7],
    sun: 2.4,
    sunAt: [-24, -34],
    keyTone: ["#ffd9b8", "#c2cdf0"],
    fillTone: ["#ffeede", "#c6cce6"],
    shade: 1,
    rim: ["#5fe0ff", 0.75],
    shoot: "#ffb35a",
    metGap: 1.1,
  },
];

/** ORCHARD TIDE: the moon's circle (m), its pull (m/s, then in the last stretch), its orbit (s a lap, then), how far it is (m). */
const TIDE_R = 6.0;
const TIDE_PULL = [2.7, 3.4];
const MOON_LAP = [24, 17];
const MOON_D = 38;
/** PROOF FACTORY: a belt's half width (m), its speed (m/s, then in the last stretch), when the belts reverse (s), the warning before (s). */
const BELT_HW = 1.45;
const BELT_V = [3.1, 3.9];
const BELT_FLIP = [11, 20, 27.5, 33.5];
const BELT_WARN = 1.7;
/** The belts' axes: two great circles crossing ahead of the start and behind it, both far from the start. */
const BELT_AX = [sph(52, 90), sph(52, -90)];
/** Which way each belt runs (round its axis). */
const BELT_DIR = [1, -1];
/** ORCHARD TIDE's islands (latitude, longitude, radius in m): the start's at the north pole. */
const TIDE_ISLES: [number, number, number][] = [
  [90, 0, 3.7],
  [27, 18, 3.4],
  [18, 140, 3.0],
  [12, -100, 3.2],
  [-20, 62, 3.0],
  [-26, -40, 2.9],
  [-30, 176, 3.2],
  [-74, 10, 3.6],
  [48, -150, 2.6],
  [44, 92, 2.4],
];
/** The lagoons' floor (m under the ground), the sea's shell over them. */
const LAGOON = -0.2;
const SEA = -0.07;

// ---- the sphere's maths (module temps: no allocations in the loops) ------------------------------

/** The way along the surface from `n` toward `d` (both unit), into `out` (unit, or zero); returns the angle. */
function toward(n: Vec, d: Vec, out: Vec) {
  const c = clamp(n.dot(d), -1, 1);
  out.copy(d).addScaledVector(n, -c);
  const l = out.length();
  if (l < 1e-7) out.set(0, 0, 0);
  else out.multiplyScalar(1 / l);
  return Math.acos(c);
}
/** The distance between two spots on the surface (m). */
const arcM = (a: Vec, b: Vec) => Math.acos(clamp(a.dot(b), -1, 1)) * R;

const sAx = v3();
const sQ = new THREE.Quaternion();
/** Move the spot `n` along the surface toward the tangent `dir` by `ang` (rad); `c1`, `c2` turn with it. */
function slide(n: Vec, dir: Vec, ang: number, c1?: Vec, c2?: Vec) {
  if (Math.abs(ang) < 1e-9) return;
  sAx.crossVectors(n, dir);
  const l = sAx.length();
  if (l < 1e-9) return;
  sQ.setFromAxisAngle(sAx.multiplyScalar(1 / l), ang);
  n.applyQuaternion(sQ).normalize();
  c1?.applyQuaternion(sQ);
  c2?.applyQuaternion(sQ);
}
/** Keep `v` tangent at `n`. */
const flat = (v: Vec, n: Vec) => v.addScaledVector(n, -v.dot(n));

/** The great-circle blend of two unit vectors. */
function slerpN(a: Vec, b: Vec, k: number, out: Vec) {
  const th = Math.acos(clamp(a.dot(b), -1, 1));
  if (th < 1e-5) return out.copy(b);
  const s = Math.sin(th);
  const wa = Math.sin((1 - k) * th) / s;
  const wb = Math.sin(k * th) / s;
  return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb).normalize();
}

const oX = v3();
const oZ = v3();
const oM = new THREE.Matrix4();
/** The rotation of something standing at `n` facing `f` (its +y up the normal, its +z along f). */
function stand(q: THREE.Quaternion, n: Vec, f: Vec) {
  oZ.copy(f).addScaledVector(n, -f.dot(n));
  if (oZ.lengthSq() < 1e-8) oZ.crossVectors(n, Math.abs(n.y) < 0.9 ? UP : XX);
  oZ.normalize();
  oX.crossVectors(n, oZ);
  oM.makeBasis(oX, n, oZ);
  return q.setFromRotationMatrix(oM);
}

/** A spot from latitude / longitude (degrees; the north pole is +y, longitude 0 is +z). */
function sph(lat: number, lon: number, out = v3()) {
  const a = (lat * Math.PI) / 180;
  const b = (lon * Math.PI) / 180;
  return out.set(Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b));
}

// ---- the planet's tiles: a cube-sphere, NT × NT tiles a face -------------------------------------

const NT = 12;
const FACES = [
  [v3(1, 0, 0), v3(0, 0, -1), v3(0, 1, 0)],
  [v3(-1, 0, 0), v3(0, 0, 1), v3(0, 1, 0)],
  [v3(0, 1, 0), v3(1, 0, 0), v3(0, 0, -1)],
  [v3(0, -1, 0), v3(1, 0, 0), v3(0, 0, 1)],
  [v3(0, 0, 1), v3(1, 0, 0), v3(0, 1, 0)],
  [v3(0, 0, -1), v3(-1, 0, 0), v3(0, 1, 0)],
];
function cubeDir(face: number, a: number, b: number, out: Vec) {
  const [n, u, v] = FACES[face];
  const k = Math.PI / 4;
  return out.copy(n).addScaledVector(u, Math.tan(a * k)).addScaledVector(v, Math.tan(b * k)).normalize();
}
/** Which tile a spot is on. */
function tileOf(d: Vec) {
  const ax = Math.abs(d.x),
    ay = Math.abs(d.y),
    az = Math.abs(d.z);
  const face = ax >= ay && ax >= az ? (d.x > 0 ? 0 : 1) : ay >= az ? (d.y > 0 ? 2 : 3) : d.z > 0 ? 4 : 5;
  const [n, u, v] = FACES[face];
  const s = 1 / Math.abs(d.dot(n));
  const a = (Math.atan(d.dot(u) * s) * 4) / Math.PI;
  const b = (Math.atan(d.dot(v) * s) * 4) / Math.PI;
  const i = Math.min(NT - 1, Math.max(0, Math.floor(((a + 1) / 2) * NT)));
  const j = Math.min(NT - 1, Math.max(0, Math.floor(((b + 1) / 2) * NT)));
  return face * NT * NT + j * NT + i;
}

const K_GRASS = 0;
const K_SAND = 1;
const K_WATER = 2;
const K_FLOWER = 3;
const K_PLAZA = 4;
/** The pond's floor, under the ground (m). */
const POND = -0.2;

/** A band (or a disc, inner 0) lying on the planet round its +y pole, `lift` over the ground: angles in metres along the surface. */
function capGeo(outer: number, inner = 0, lift = 0.08, seg = 40, rings = 5) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rr0 = R + lift;
  for (let r = 0; r <= rings; r++) {
    const m = inner + ((outer - inner) * r) / rings;
    const a = m / R;
    for (let s = 0; s <= seg; s++) {
      const b = (s / seg) * Math.PI * 2;
      const x = Math.sin(a) * Math.cos(b),
        z = Math.sin(a) * Math.sin(b),
        y = Math.cos(a);
      pos.push(x * rr0, y * rr0, z * rr0);
      uv.push(0.5 + (Math.cos(b) * m) / (2 * outer), 0.5 + (Math.sin(b) * m) / (2 * outer));
    }
  }
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s,
        b = a + 1,
        c = a + seg + 1,
        d = c + 1;
      // (wound to face out, away from the planet: seen from above, not culled)
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A shore's band on the planet round its +y pole, from `inner` out to `outer` (m along the surface): v counts the
 * metres out from the shore (the swell's lines slide along it), u goes round; it fades out to sea (the corners' alpha).
 */
function shoreGeo(inner: number, outer: number, lift: number, seg = 56, rings = 4) {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const rr0 = R + lift;
  const round = Math.max(3, Math.round((Math.PI * 2 * inner) / 1.7));
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const m = inner + (outer - inner) * t;
    const a = m / R;
    for (let s = 0; s <= seg; s++) {
      const b = (s / seg) * Math.PI * 2;
      pos.push(Math.sin(a) * Math.cos(b) * rr0, Math.cos(a) * rr0, Math.sin(a) * Math.sin(b) * rr0);
      uv.push((s / seg) * round, (m - inner) / 0.9);
      col.push(1, 1, 1, t < 0.25 ? 0.55 + t * 1.8 : 1 - (t - 0.25) / 0.75);
    }
  }
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s,
        b = a + 1,
        c = a + seg + 1,
        d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

/** A flag's cloth: a strip of quads, its front and its back (so the Q reads right from both sides). */
function clothGeo(w = 0.95, h = 0.62, seg = 8) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const nx = seg + 1;
  for (let side = 0; side < 2; side++)
    for (let r = 0; r < 2; r++)
      for (let i = 0; i <= seg; i++) {
        pos.push((w * i) / seg, r * h, 0);
        uv.push(side ? 1 - i / seg : i / seg, r);
      }
  for (let side = 0; side < 2; side++) {
    const o = side * nx * 2;
    for (let i = 0; i < seg; i++) {
      const a = o + i,
        b = o + i + 1,
        c = o + nx + i + 1,
        d = o + nx + i;
      if (side) idx.push(a, c, b, a, d, c);
      else idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---- sounds of its own ---------------------------------------------------------------------------

function beep(f: number, dur: number, type: OscillatorType, vol: number, slideTo = 0, delay = 0) {
  const s = sound();
  if (!s || vol <= 0.001) return;
  const t = s.ac.currentTime + delay;
  const o = s.ac.createOscillator();
  const g = s.ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(s.bus);
  o.start(t);
  o.stop(t + dur + 0.03);
}
let noiseBuf: AudioBuffer | null = null;
function hiss(dur: number, vol: number, kind: BiquadFilterType, freq: number, delay = 0, to = 0) {
  const s = sound();
  if (!s || vol <= 0.001) return;
  if (!noiseBuf || noiseBuf.sampleRate !== s.ac.sampleRate) {
    noiseBuf = s.ac.createBuffer(1, Math.floor(s.ac.sampleRate * 1.2), s.ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = s.ac.currentTime + delay;
  const src = s.ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = s.ac.createBiquadFilter();
  f.type = kind;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = s.ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(s.bus);
  src.start(t);
  src.stop(t + dur + 0.05);
}
const snd = {
  /** A flag pops up: a bright bell. */
  ping(gold: boolean, vol = 0.3) {
    beep(1568, 0.1, "sine", vol);
    beep(2349, 0.35, "sine", vol * 0.8, 0, 0.07);
    if (gold) [1047, 1319, 1568, 2093, 2637].forEach((f, i) => beep(f, 0.16, "square", 0.16, 0, 0.12 + i * 0.06));
  },
  grab(gold: boolean) {
    if (gold) (sfx.star(), beep(2093, 0.4, "triangle", 0.3, 0, 0.32));
    else (beep(1319, 0.06, "square", 0.3), beep(1976, 0.16, "square", 0.3, 0, 0.06));
  },
  /** A rival's flag: softer, lower. */
  rival(vol: number) {
    beep(784, 0.05, "triangle", vol);
    beep(1175, 0.08, "triangle", vol, 0, 0.05);
  },
  /** A meteor coming: a falling whistle. */
  whistle(dur: number, vol: number) {
    const s = sound();
    if (!s || vol <= 0.001) return;
    const t = s.ac.currentTime;
    const o = s.ac.createOscillator();
    const g = s.ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(2300, t);
    o.frequency.exponentialRampToValueAtTime(420, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * 0.5, t + 0.15);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    o.connect(g).connect(s.bus);
    o.start(t);
    o.stop(t + dur + 0.08);
  },
  boom(vol: number) {
    hiss(0.55, vol, "lowpass", 1400, 0, 200);
    beep(120, 0.5, "sine", vol * 1.3, 32);
    beep(70, 0.6, "triangle", vol * 0.8, 30, 0.02);
  },
  dash(vol: number) {
    hiss(0.2, vol, "bandpass", 1800, 0, 5200);
  },
  splash(vol: number) {
    hiss(0.14, vol, "bandpass", 2600, 0, 900);
  },
  bonk(vol: number) {
    beep(520, 0.09, "square", vol, 180);
    hiss(0.1, vol, "highpass", 1500);
  },
};

// ---- particles that fall toward the planet (Fx3's fall along −y: wrong on a ball) ------------------

type Burst = { speed?: number; up?: Vec; kick?: number; grav?: number; size?: number; life?: number; drag?: number; bounce?: boolean; dir?: Vec };
/** The bursts made every frame, their options made once (`up` set at the call). */
const B_TRAIL: Burst = { speed: 1.2, grav: 0, size: 0.4, life: 0.35, drag: 2, bounce: false };
const B_SPARK: Burst = { speed: 1, up: undefined, kick: 1.5, grav: 0, size: 0.12, life: 0.7, bounce: false };
const B_SPLASH: Burst = { speed: 1.6, up: undefined, kick: 3.5, grav: 16, size: 0.12, life: 0.5 };
/** ORCHARD TIDE's motes rising in the moon's circle; PROOF FACTORY's smoke. */
const B_MOTE: Burst = { speed: 0.3, up: undefined, kick: 1.4, grav: -1.4, size: 0.13, life: 1.4, drag: 0.6, bounce: false };
const B_SMOKE: Burst = { speed: 0.6, up: undefined, kick: 2.2, grav: -0.7, size: 0.75, life: 1.9, drag: 0.4, bounce: false };
const MOTES = cols("#c9f4ff", "#ffffff", "#9fdcff");
/** Embers rising (torches, vents), a fish's leap, sparks (the press, the furnace, the belts), a footstep's puff. */
const B_EMBER: Burst = { speed: 0.4, up: undefined, kick: 1.6, grav: -0.9, size: 0.09, life: 1.2, drag: 0.8, bounce: false };
const B_FISH: Burst = { speed: 0.6, up: undefined, kick: 5.5, grav: 15, size: 0.16, life: 0.75, drag: 0.2, bounce: false };
const B_SPARK2: Burst = { speed: 3.2, up: undefined, kick: 3.2, grav: 12, size: 0.08, life: 0.6, drag: 0.6 };
const B_STEP: Burst = { speed: 0.9, up: undefined, kick: 1.1, grav: 6, size: 0.13, life: 0.4, drag: 2.2, bounce: false };
const FISH = cols("#ff8a5a", "#ffb36b", "#ffd0a0");
const SPARKS = cols("#ffd23f", "#ff8a2a", "#ffffff", "#ffb35a");
const SANDS = cols("#fff1c9", "#ffe2a8", "#ffffff");
const SMOKE = cols("#6a6070", "#8a8090", "#4a4452", "#7a6a70");

class SFx {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private P: Float32Array;
  private Vl: Float32Array;
  /** life, max, size, spin, grav, drag, bounce */
  private D: Float32Array;
  private C: Float32Array;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = v3();
  private s = v3();
  private c = new THREE.Color();

  constructor(
    scene: THREE.Scene,
    private cap = 1000,
  ) {
    this.mesh = new THREE.InstancedMesh(GEO.box, markGlow(new THREE.MeshBasicMaterial({ color: 0xffffff }), 0.4), cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.mesh.setColorAt(0, this.c.set(0xffffff));
    this.P = new Float32Array(cap * 3);
    this.Vl = new Float32Array(cap * 3);
    this.D = new Float32Array(cap * 7);
    this.C = new Float32Array(cap * 3);
    scene.add(this.mesh);
  }

  /** `n` bits from `at`: up (the normal there) and kick give them a push off the ground. */
  burst(at: Vec, n: number, colors: readonly THREE.Color[], o: Burst = {}) {
    const sp0 = o.speed ?? 5;
    for (let i = 0; i < n && this.n < this.cap; i++) {
      const k = this.n++;
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const sp = sp0 * (0.35 + Math.random() * 0.65);
      let vx = Math.cos(a) * r * sp,
        vy = u * sp,
        vz = Math.sin(a) * r * sp;
      if (o.up) {
        const kk = (o.kick ?? 3) * (0.5 + Math.random() * 0.5);
        vx += o.up.x * kk;
        vy += o.up.y * kk;
        vz += o.up.z * kk;
      }
      if (o.dir) ((vx += o.dir.x), (vy += o.dir.y), (vz += o.dir.z));
      this.P[k * 3] = at.x;
      this.P[k * 3 + 1] = at.y;
      this.P[k * 3 + 2] = at.z;
      this.Vl[k * 3] = vx;
      this.Vl[k * 3 + 1] = vy;
      this.Vl[k * 3 + 2] = vz;
      const d = k * 7;
      this.D[d] = 0;
      this.D[d + 1] = (o.life ?? 0.8) * (0.6 + Math.random() * 0.7);
      this.D[d + 2] = (o.size ?? 0.16) * (0.6 + Math.random() * 0.8);
      this.D[d + 3] = (Math.random() - 0.5) * 16;
      this.D[d + 4] = o.grav ?? 16;
      this.D[d + 5] = o.drag ?? 0.8;
      this.D[d + 6] = o.bounce === false ? 0 : 1;
      const cc = colors[i % colors.length];
      this.C[k * 3] = cc.r;
      this.C[k * 3 + 1] = cc.g;
      this.C[k * 3 + 2] = cc.b;
    }
  }

  update(dt: number) {
    const { P, Vl, D, C } = this;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const d = i * 7;
      D[d] += dt;
      if (D[d] >= D[d + 1]) continue;
      let px = P[i * 3],
        py = P[i * 3 + 1],
        pz = P[i * 3 + 2];
      let vx = Vl[i * 3],
        vy = Vl[i * 3 + 1],
        vz = Vl[i * 3 + 2];
      const r = Math.hypot(px, py, pz) || 1;
      const g = (D[d + 4] * dt) / r;
      vx -= px * g;
      vy -= py * g;
      vz -= pz * g;
      const dr = Math.exp(-D[d + 5] * dt);
      vx *= dr;
      vy *= dr;
      vz *= dr;
      px += vx * dt;
      py += vy * dt;
      pz += vz * dt;
      const size = D[d + 2];
      if (D[d + 6]) {
        const r2 = Math.hypot(px, py, pz) || 1;
        const fl = R + size * 0.5;
        if (r2 < fl) {
          const k = fl / r2;
          px *= k;
          py *= k;
          pz *= k;
          const vr = (vx * px + vy * py + vz * pz) / fl;
          if (vr < 0) {
            const b = (-vr * 1.35) / fl;
            vx += px * b;
            vy += py * b;
            vz += pz * b;
            vx *= 0.6;
            vy *= 0.6;
            vz *= 0.6;
            D[d + 3] *= 0.5;
          }
        }
      }
      const o = w * 3,
        od = w * 7;
      P[o] = px;
      P[o + 1] = py;
      P[o + 2] = pz;
      Vl[o] = vx;
      Vl[o + 1] = vy;
      Vl[o + 2] = vz;
      if (w !== i) {
        for (let j = 0; j < 7; j++) D[od + j] = D[d + j];
        C[o] = C[i * 3];
        C[o + 1] = C[i * 3 + 1];
        C[o + 2] = C[i * 3 + 2];
      }
      const life = D[od],
        k = 1 - life / D[od + 1];
      const s = size * Math.min(1, k * 2.5);
      this.e.set(life * D[od + 3], life * D[od + 3] * 0.7, 0);
      this.m.compose(this.p.set(px, py, pz), this.q.setFromEuler(this.e), this.s.set(s, s, s));
      this.mesh.setMatrixAt(w, this.m);
      this.mesh.setColorAt(w, this.c.setRGB(C[o], C[o + 1], C[o + 2]));
      w++;
    }
    this.n = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---- static props merged into three draws -------------------------------------------------------

/** The low-poly shapes the bake builds with (a unit box, a 12-sided drum, a ball, a pyramid). */
const BK = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  ball: new THREE.SphereGeometry(0.5, 12, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 4),
  cone8: new THREE.ConeGeometry(0.5, 1, 8),
};
type BKind = keyof typeof BK;

/**
 * Static pieces merged into three draws: cel colours (vertex coloured), unlit glows, and the ink hulls.
 * `absorb()` takes a prop already built of k3 boxes and their outlines (what has a texture, glows see
 * through or moves stays as it was); `add()` puts a shape straight in.
 */
class Bake {
  private toon: THREE.BufferGeometry[] = [];
  private lit: THREE.BufferGeometry[] = [];
  private ink: THREE.BufferGeometry[] = [];
  private c = new THREE.Color();
  private m = new THREE.Matrix4();
  private m2 = new THREE.Matrix4();
  private e = new THREE.Euler();
  private q = new THREE.Quaternion();
  private p = v3();
  private s = v3();

  private push(list: THREE.BufferGeometry[], src: THREE.BufferGeometry, mat: THREE.Matrix4, color: THREE.Color | null) {
    const g = src.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && (k !== "normal" || !color)) g.deleteAttribute(k);
    g.applyMatrix4(mat);
    if (color) {
      const n = g.getAttribute("position").count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) ((a[i * 3] = color.r), (a[i * 3 + 1] = color.g), (a[i * 3 + 2] = color.b));
      g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    }
    if (!g.index) g.setIndex([...Array(g.getAttribute("position").count).keys()]);
    list.push(g);
  }

  /** A shape in the frame `f` (a spot on the planet): at (x, y, z), `sx·sy·sz`, turned (rx, ry, rz); an ink hull `ink` thick; `lit`: unlit, bright. */
  add(f: THREE.Matrix4, kind: BKind, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ink = 0.035, lit = false, rx = 0, ry = 0, rz = 0) {
    this.q.setFromEuler(this.e.set(rx, ry, rz));
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.m2.multiplyMatrices(f, this.m);
    this.push(lit ? this.lit : this.toon, BK[kind], this.m2, this.c.set(color));
    if (ink > 0) {
      this.m.compose(this.p, this.q, this.s.set(sx + 2 * ink, sy + 2 * ink, sz + 2 * ink));
      this.m2.multiplyMatrices(f, this.m);
      this.push(this.ink, BK[kind], this.m2, null);
    }
  }

  /** Take in a built prop: its plain cel boxes and ink hulls merge, the rest stays where it was. */
  absorb(root: THREE.Object3D, keep: Set<THREE.Material> = new Set()) {
    root.updateMatrixWorld(true);
    const gone: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (o as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
      const mat = m.material;
      if (keep.has(mat)) return;
      if (mat instanceof THREE.MeshBasicMaterial && mat.side === THREE.BackSide && !mat.transparent) {
        this.push(this.ink, m.geometry, m.matrixWorld, null);
        gone.push(m);
      } else if (mat instanceof THREE.MeshToonMaterial && !mat.map && !mat.transparent) {
        const em = mat.emissive;
        if (em.r + em.g + em.b > 0.3) this.push(this.lit, m.geometry, m.matrixWorld, this.c.copy(mat.color).lerp(em, 0.35));
        else this.push(this.toon, m.geometry, m.matrixWorld, mat.color);
        gone.push(m);
      } else if (mat instanceof THREE.MeshBasicMaterial && !mat.transparent && !mat.map && mat.side !== THREE.BackSide) {
        this.push(this.lit, m.geometry, m.matrixWorld, mat.color);
        gone.push(m);
      }
    });
    // (what stays: lifted off the merged pieces onto their parents, where it was)
    for (const m of gone) {
      const par = m.parent;
      if (!par) continue;
      for (const k of [...m.children]) if (!gone.includes(k as THREE.Mesh)) (k.applyMatrix4(m.matrix), par.add(k));
      par.remove(m);
    }
  }

  build(scene: THREE.Object3D) {
    const mk = (list: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (!list.length) return;
      const g = mergeGeometries(list, false);
      for (const x of list) x.dispose();
      list.length = 0;
      if (!g) return;
      const mesh = new THREE.Mesh(g, mat);
      mesh.raycast = () => {};
      scene.add(mesh);
    };
    // (what stands between the camera and the runner opens: mats.ts)
    mk(this.toon, seeThrough(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonSteps() })));
    mk(this.lit, seeThrough(markGlow(new THREE.MeshBasicMaterial({ vertexColors: true }), 0.75)));
    mk(this.ink, seeThrough(new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide })));
  }
}

// ---- the pieces ----------------------------------------------------------------------------------

interface Runner {
  p: Player;
  seat: number;
  av: Avatar;
  n: Vec;
  f: Vec;
  v: Vec;
  /** Feet over R (m), its speed up, the ground's height here (eased). */
  h: number;
  vh: number;
  gh: number;
  grounded: boolean;
  stun: number;
  /** Can't be hit again for this long. */
  inv: number;
  dash: number;
  cd: number;
  /** A pressed a moment before the dash was ready: kept this long (s), it goes off as soon as it can. */
  buf: number;
  dashDir: Vec;
  spin: number;
  spinV: number;
  lean: number;
  turn: number;
  score: number;
  /** When it first got to each count (the tie-break). */
  reach: number[];
  flash: number;
  bad: number;
  /** Where it means to go (tangent, 0…1). */
  want: Vec;
  goal: Flag | null;
  think: number;
  wob: number;
  splash: number;
  /** Till the next footstep's puff (s). */
  dust: number;
  sulk: number;
}

interface Flag {
  g: THREE.Group;
  sway: THREE.Group;
  cloth: THREE.Mesh;
  pos: Float32Array;
  nrm: Float32Array;
  plinth: THREE.Mesh;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  beam: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  /** The beam's bright core, the glow on the ground round its foot. */
  coreMat: THREE.MeshBasicMaterial;
  halo: THREE.Mesh;
  haloMat: THREE.MeshBasicMaterial;
  n: Vec;
  from: Vec;
  to: Vec;
  state: number;
  t: number;
  gold: boolean;
  loose: boolean;
  value: number;
  col: number;
  by: Runner | null;
  phase: number;
  /** Since it showed (s), and when each seat sees it (the AIs: a reaction, the weak ones late). */
  age: number;
  seen: number[];
}

interface Meteor {
  rock: THREE.Group;
  ring: THREE.Mesh;
  fill: THREE.Mesh;
  fillMat: THREE.MeshBasicMaterial;
  shock: THREE.Mesh;
  shockMat: THREE.MeshBasicMaterial;
  scorch: THREE.Mesh;
  scorchMat: THREE.MeshBasicMaterial;
  n: Vec;
  side: Vec;
  live: boolean;
  t: number;
  T: number;
  /** After the blow (s; −1: idle). */
  after: number;
  /** When each seat sees it (s after it shows; Infinity: never). */
  notice: number[];
}

interface Pop {
  s: string;
  c: string;
  at: Vec;
  t: number;
  size: number;
}

/** The planet's hard pieces (a tree's trunk, the tower): a spot and a radius (m). */
interface Obstacle {
  n: Vec;
  r: number;
}

/** ORCHARD TIDE's moon: its circle's middle on the ground (`sub`), its orbit (axis, the frame P, Q in its plane, the angle) turning slowly round the pole. */
interface Tide {
  moon: THREE.Group;
  zone: THREE.Group;
  beam: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  /** Rings of light rising in the beam (their picture slides up). */
  rise: THREE.Texture;
  discMat: THREE.MeshBasicMaterial;
  edgeMat: THREE.MeshBasicMaterial;
  bands: THREE.MeshBasicMaterial[];
  sub: Vec;
  /** Last frame's (the flags in its light ride along). */
  prev: Vec;
  axis: Vec;
  P: Vec;
  Q: Vec;
  ang: number;
  prec: number;
  pull: number;
  lap: number;
  /** The human was in the circle last frame (a sound on the way in). */
  inside: boolean;
}

/** PROOF FACTORY's belt: a band round the great circle at right angles to `axis`, its chevrons' texture (`tile` m each). */
interface Belt {
  axis: Vec;
  dir: number;
  tex: THREE.Texture;
  mat: THREE.MeshToonMaterial;
  tile: number;
}

/** A toon box in `parent` (an ink edge when `ink`). */
function boxIn(parent: THREE.Object3D, color: string, w: number, h: number, d: number, x: number, y: number, z: number, ink = 0.04, emissive = "#000000") {
  const m = new THREE.Mesh(GEO.box, toon(color, emissive));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  if (ink) outline(m, ink);
  parent.add(m);
  return m;
}

/** A band round the great circle at right angles to `axis`, `hw` m to each side, `lift` over the ground; u runs along it (one per `tile` m), v across. */
function bandGeo(axis: Vec, hw: number, lift: number, tile: number, seg = 144) {
  const P = v3().crossVectors(axis, Math.abs(axis.y) < 0.9 ? UP : XX).normalize();
  const Q = v3().crossVectors(axis, P);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rows = 3;
  const d = v3();
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * Math.PI * 2;
    d.copy(P).multiplyScalar(Math.cos(th)).addScaledVector(Q, Math.sin(th));
    for (let r = 0; r < rows; r++) {
      const t = ((r / (rows - 1)) * 2 - 1) * hw;
      const a = t / R;
      const x = d.x * Math.cos(a) + axis.x * Math.sin(a),
        y = d.y * Math.cos(a) + axis.y * Math.sin(a),
        z = d.z * Math.cos(a) + axis.z * Math.sin(a);
      pos.push(x * (R + lift), y * (R + lift), z * (R + lift));
      uv.push((th * R) / tile, r / (rows - 1));
    }
  }
  for (let i = 0; i < seg; i++)
    for (let r = 0; r < rows - 1; r++) {
      const a = i * rows + r,
        b = a + 1,
        c = a + rows,
        e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

class PlanetGrab implements Mini {
  private w: ReturnType<typeof world>;
  /** The level played (its key, for the bench and the sims). */
  readonly levelKey: LevelKey;
  private cam: CamRig;
  private fx: SFx;
  private run: Runner[];
  private human: Runner | null;
  private flags: Flag[] = [];
  private mets: Meteor[] = [];
  private obst: Obstacle[] = [];
  private ground = new Float32Array(6 * NT * NT);
  private pops: Pop[] = [];
  private t = 0;
  private started = false;
  private over: number[] | null = null;
  private overT = 0;
  private nextFlag = 0;
  private nextMet = MET_AT;
  private goldI = 0;
  private hurry = false;
  private metsOn = false;
  private ban = { s: "", sub: "", c: "#ffd23f", t: 9 };
  /** The camera's own frame. */
  private cn = v3(0, 1, 0);
  private cf = v3(0, 0, 1);
  private camFrom: { eye: Vec; at: Vec; up: Vec } | null = null;
  // the arena's moving bits
  private topQ: THREE.Mesh | null = null;
  private orbits: THREE.Object3D[] = [];
  private crystalMat!: THREE.MeshToonMaterial;
  private dizzy!: THREE.InstancedMesh;
  private beamGeo: THREE.BufferGeometry;
  private beamTex: THREE.Texture;
  private clothMats: THREE.MeshToonMaterial[] = [];
  /** ORCHARD TIDE: the sea's shell, the moon and its circle. */
  private sea: THREE.Mesh | null = null;
  private tide: Tide | null = null;
  /** PROOF FACTORY: the belts, their way (eased, −1…1), the next reversal. */
  private belts: Belt[] = [];
  private beltK = 1;
  private beltSign = 1;
  private flipI = 0;
  private flipWarned = -1;
  private beltV = BELT_V[0];
  private studMat: THREE.MeshToonMaterial | null = null;
  private blinkOn = false;
  private stacks: Vec[] = [];
  private smokeT = 0;
  // set dressing and life (all worlds)
  private bk = new Bake();
  private rim: THREE.DirectionalLight;
  /** The level's sun (unit, fixed in the sky); the key light, the game's own, with shadows of its own (the stage's map takes a flat ground under a sun over +y). */
  private sunDir = v3(0, 1, 0);
  private key: THREE.DirectionalLight;
  private keyC: THREE.Color[];
  private fillC: THREE.Color[];
  private shadowPx = -1;
  /** How open the hole over the runner is (0: the card … 1: play). */
  private seeK = 0;
  /** PROOF FACTORY's embers in the sky. */
  private embers: { pts: THREE.Points; mat: THREE.PointsMaterial; ph: number }[] = [];
  /** The decor's own random stream (never the game's: one more number from that one changes the game). */
  private dr = rng(20261109);
  /** The ink of the props that stand up (a hole opens in them over the runner: mats.ts). */
  private inkSee = seeThrough(new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide }));
  private twinkle: THREE.PointsMaterial[] = [];
  private shoot: { mesh: THREE.InstancedMesh; t: number[]; from: Vec[]; dir: Vec[]; next: number } | null = null;
  private stepCols: THREE.Color[] = DUST;
  private q3 = new THREE.Quaternion();
  // GENESIS MEADOW
  private towerN = sph(31, 8);
  private treeNs: Vec[] = [];
  private sails: THREE.Group | null = null;
  private flies: THREE.InstancedMesh | null = null;
  private flyHome: Vec[] = [];
  private sat: { orbit: THREE.Group; sat: THREE.Group; blink: THREE.Mesh } | null = null;
  // ORCHARD TIDE
  private lighthouse: THREE.Group | null = null;
  private lhBeam: THREE.Group | null = null;
  private foamMat: THREE.MeshBasicMaterial | null = null;
  private glints: THREE.PointsMaterial[] = [];
  private torches: THREE.InstancedMesh | null = null;
  private torchAt: Vec[] = [];
  private torchGlow: THREE.Sprite[] = [];
  private torchN: Vec[] = [];
  private gulls: THREE.InstancedMesh | null = null;
  private buoys: THREE.InstancedMesh | null = null;
  private buoyN: Vec[] = [];
  private fishT = 1;
  // PROOF FACTORY
  private stackNs: Vec[] = [];
  private furnace: THREE.Group | null = null;
  private fuN: Vec | null = null;
  private mouth: Vec | null = null;
  private mouthN = v3(0, 1, 0);
  private vents: Vec[] = [];
  private press: { ham: THREE.Mesh; rod: THREE.Mesh; t: number; n: Vec } | null = null;
  private pressSlam = -1;
  private gears: THREE.Group[] = [];
  private beacons: THREE.InstancedMesh | null = null;
  private drones: THREE.InstancedMesh | null = null;
  private droneLights: THREE.InstancedMesh | null = null;
  // temps
  private a = v3();
  private b = v3();
  private c = v3();
  private d = v3();
  private e = v3();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private m4 = new THREE.Matrix4();
  private sc = v3();

  constructor(
    private players: Player[],
    private rnd: Rnd,
    private lv: Level,
  ) {
    R = lv.r;
    this.levelKey = lv.key;
    this.w = world({ sky: lv.sky, fog: [0, 0], fov: 50 });
    // (the stage's finish: a hotter glow in the foundry)
    if (lv.key === "foundry") this.w.scene.userData.post = { bloom: 1.2 };
    const s = this.w.scene;
    this.w.hemi.color.set(lv.hemi[0]);
    this.w.hemi.groundColor.set(lv.hemi[1]);
    this.w.hemi.intensity = lv.hemi[2];
    // (the key light is the game's own: the stage's sun is put out, and its shadow map with it)
    this.w.sun.visible = false;
    this.sunDir = sph(lv.sunAt[0], lv.sunAt[1]);
    this.keyC = cols(lv.keyTone[1], lv.keyTone[0]);
    this.fillC = cols(lv.fillTone[1], lv.fillTone[0]);
    this.key = new THREE.DirectionalLight(lv.keyTone[0], lv.sun);
    s.add(this.key, this.key.target);
    {
      // (its shadows: a box round the whole planet, whichever way the light leans)
      const sc = this.key.shadow.camera;
      const ext = R + 6.6;
      sc.left = sc.bottom = -ext;
      sc.right = sc.top = ext;
      sc.near = 60 - ext - 2;
      sc.far = 60 + ext + 2;
      sc.updateProjectionMatrix();
      this.key.shadow.bias = -0.0002;
    }
    SEE.floor.value = R + 0.55;
    SEE.r.value = 0;
    this.rim = new THREE.DirectionalLight(lv.rim[0], lv.rim[1]);
    s.add(this.rim, this.rim.target);
    this.beamTex = canvasTex(4, 128, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(0.55, "rgba(120,120,120,0.5)");
      gr.addColorStop(1, "rgba(255,255,255,1)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 4, 128);
    });
    this.beamGeo = new THREE.CylinderGeometry(0.5, 0.62, 16, 18, 1, true).translate(0, 8, 0);
    this.fx = new SFx(s);
    if (lv.key === "tide") {
      this.skyTide(s);
      this.planet(s);
      this.decorTide(s);
      this.dressTide(s);
      this.stepCols = SANDS;
    } else if (lv.key === "foundry") {
      this.skyFoundry(s);
      this.planet(s);
      this.decorFoundry(s);
      this.dressFoundry(s);
      this.stepCols = SPARKS;
    } else {
      this.sky(s);
      this.planet(s);
      this.decor(s);
      this.dressMeadow(s);
    }
    this.bk.build(s);
    this.makeShooting(lv.shoot);
    // the runners: a row at the north pole, facing +z (the tower ahead), you second from the left
    const n0 = v3(0, 1, 0),
      f0 = v3(0, 0, 1),
      r0 = v3(-1, 0, 0);
    const slots = [-0.8, -2.45, 0.85, 2.5];
    this.run = players.map((p, i) => {
      const av = new Avatar(s, p);
      const n = n0.clone(),
        f = f0.clone();
      slide(n, r0, slots[i] / R, f);
      slide(n, f0, -1.2 / R, f);
      const r: Runner = {
        p,
        seat: i,
        av,
        n,
        f: flat(f, n).normalize(),
        v: v3(),
        h: 0,
        vh: 0,
        gh: 0,
        grounded: true,
        stun: 0,
        inv: 0,
        dash: 0,
        cd: 0,
        buf: 0,
        dashDir: v3(),
        spin: 0,
        spinV: 0,
        lean: 0,
        turn: 0,
        score: 0,
        reach: [0],
        flash: 0,
        bad: 0,
        want: v3(),
        goal: null,
        think: 0.2 + rnd() * 0.3,
        wob: rnd() * 6,
        splash: 0,
        dust: Math.random() * 0.2,
        sulk: 0,
      };
      return r;
    });
    this.human = this.run.find((r) => isLocal(r.p)) ?? null;
    const me = this.me();
    this.cn.copy(me.n);
    this.cf.copy(me.f);
    // the dizzy stars over a stunned head (one draw for all)
    this.dizzy = new THREE.InstancedMesh(GEO.box, toon("#ffe066", "#7a5a00"), 12);
    this.dizzy.frustumCulled = false;
    this.dizzy.count = 0;
    s.add(this.dizzy);
    // the cloths: violet, aqua, gold
    const clothTex = (bg: string, dark: string, gold: boolean) =>
      canvasTex(160, 104, (g) => {
        g.fillStyle = bg;
        g.fillRect(0, 0, 160, 104);
        g.fillStyle = dark;
        g.fillRect(0, 0, 12, 104);
        g.fillRect(0, 94, 160, 10);
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.fillRect(12, 0, 148, 8);
        g.font = `900 76px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = dark;
        g.fillText("Z", 88, 58);
        g.fillStyle = "#ffffff";
        g.fillText("Z", 84, 54);
        if (gold) {
          g.font = `900 30px ${FONT}`;
          g.fillStyle = "#9a6200";
          g.fillText("×3", 136, 82);
        }
      });
    this.clothMats = [
      [FLAG_C[0], "#5b3fc4"],
      [FLAG_C[1], "#0f8f7c"],
      [GOLD_C, "#b07800"],
    ].map(([bg, dk], i) => new THREE.MeshToonMaterial({ map: clothTex(bg, dk, i === 2), gradientMap: toonSteps(), emissive: new THREE.Color(bg).multiplyScalar(0.42) }));
    for (let i = 0; i < 10; i++) this.flags.push(this.makeFlag());
    for (let i = 0; i < 8; i++) this.mets.push(this.makeMeteor());
    for (const r of this.run) this.sync(r, 0);
    this.cam = new CamRig(this.w.camera);
    this.cardCam(0);
    this.light();
    this.cam.apply(0);
    if (/partylab/.test(location.pathname)) (window as unknown as Record<string, unknown>).planetLab = this;
  }

  private me() {
    return this.human ?? this.run[0];
  }

  // ---- the backdrop: space all round (a painted dome, stars), the level's sun, far bodies lit by it ----

  /** The level's sun in the sky: a bright ball (it blooms) and its halos (colour, size, opacity). */
  private sunBall(s: THREE.Scene, color: string, size: number, halo: [string, number, number][]) {
    const sun = new THREE.Mesh(GEO.ball, glow(color));
    sun.position.copy(this.sunDir).multiplyScalar(340);
    sun.scale.setScalar(size);
    sun.userData.noShadow = true;
    sun.raycast = () => {};
    s.add(sun);
    for (const [c, sz, op] of halo) this.glowAt(v3().copy(this.sunDir).multiplyScalar(350), sz, c, op);
  }

  /** The stars: dust, stars and a few bright ones (three draws), crowded toward the milky band, drowned near the sun. */
  private starsAll(s: THREE.Scene, seed: number, palette: string[], pole: Vec, dim = 1, reach = 38) {
    const shells: [number, number, number][] = [
      [1300, 2.2, 0.55],
      [220, 4.2, 0.4],
      [44, 6.5, 0],
    ];
    for (const [n, size, k] of shells) {
      const pts = starShell(s, this.dot(), { n, size, palette, dim: dim * (size > 6 ? 1.15 : 1), seed: seed + n, pole, k, sun: this.sunDir, reach });
      this.twinkle.push(pts.material as THREE.PointsMaterial);
    }
  }

  /** A far ball lit by the level's sun for good (baked in its corners: the play light turns with the camera). `frame`: what it is in (its turn counts). */
  private farBall(rad: number, map: THREE.Texture, night: string, frame: THREE.Object3D, bright = 1.2) {
    const geo = new THREE.SphereGeometry(rad, 44, 26);
    frame.updateMatrixWorld(true);
    sunBake(geo, v3().copy(this.sunDir).applyQuaternion(frame.getWorldQuaternion(new THREE.Quaternion()).invert()), night);
    const mat = new THREE.MeshBasicMaterial({ map, vertexColors: true });
    mat.color.setScalar(bright);
    const m = new THREE.Mesh(geo, mat);
    m.userData.noShadow = true;
    m.raycast = () => {};
    frame.add(m);
    return m;
  }

  /** What goes slowly round, far out (a pivot, its axis, radians a second). */
  private drift: { o: THREE.Object3D; ax: Vec; v: number }[] = [];

  /** A convoy far out: three small ships in a line (merged: three draws), going slowly round the planet. */
  private convoy(s: THREE.Scene, dist: number, tilt: [number, number, number], v: number, hull: string, trim: string, fire: string) {
    const pivot = new THREE.Group();
    pivot.rotation.set(tilt[0], tilt[1], tilt[2]);
    const g = new THREE.Group();
    g.position.set(dist, 0, 0);
    pivot.add(g);
    const b = new Bake();
    for (let i = 0; i < 3; i++) {
      const k = 1 - i * 0.14;
      const f = new THREE.Matrix4().makeTranslation(i % 2 ? 2.2 : -1.2, i * 1.4 - 1.4, i * 9 - 9);
      b.add(f, "box", hull, 0, 0, 0, 2.4 * k, 1.3 * k, 5.4 * k, 0.09);
      b.add(f, "box", trim, 0, 0.85 * k, 1.2 * k, 1.5 * k, 0.7 * k, 1.7 * k, 0.07);
      b.add(f, "box", trim, 1.7 * k, -0.1, -0.8 * k, 1.2 * k, 0.16, 2.2 * k, 0.06);
      b.add(f, "box", trim, -1.7 * k, -0.1, -0.8 * k, 1.2 * k, 0.16, 2.2 * k, 0.06);
      b.add(f, "box", fire, 0.6 * k, 0, -2.85 * k, 0.7 * k, 0.7 * k, 0.5, 0, true);
      b.add(f, "box", fire, -0.6 * k, 0, -2.85 * k, 0.7 * k, 0.7 * k, 0.5, 0, true);
      b.add(f, "box", "#fff6c4", 0, 0.95 * k, 2.1 * k, 0.9 * k, 0.3 * k, 0.12, 0, true);
    }
    b.build(g);
    this.glowAt(v3(0, 0, -13), 9, fire, 0.5, g);
    s.add(pivot);
    this.drift.push({ o: pivot, ax: v3(0, 1, 0), v });
    return pivot;
  }

  // GENESIS MEADOW: violet space, a warm sun, the ringed giant (a crescent), the moon and its city, a comet, a convoy

  private sky(s: THREE.Scene) {
    const band = sph(52, -40);
    spaceDome(s, "meadow", {
      seed: 1101,
      sun: this.sunDir,
      tone: ["#2c2478", "#140e42", "#05041a"],
      turn: 0.4,
      glare: ["#a08cff", 0.5, 30],
      clouds: [
        ["#6a3cff", 0.5, 0.48, 0],
        ["#ff3fa4", 0.36, 0.55, 1],
        ["#2fb6ff", 0.3, 0.6, 2],
      ],
      band: { pole: band, color: "#b9a8ff", k: 0.4, width: 0.2 },
      dust: 0.45,
    });
    this.starsAll(s, 1200, ["#ffffff", "#dfe8ff", "#fff1c9", "#cfc2ff", "#bff6ff"], band);
    this.sunBall(s, "#fff4d6", 26, [
      ["#ffe9b0", 110, 0.9],
      ["#ffb86a", 300, 0.34],
    ]);
    const sprite = (at: Vec, size: number, color: string, opacity: number) => this.glowAt(at, size, color, opacity);
    // the planet's own soft halo (only its rim shows round the ball)
    sprite(v3(), R * 3.1, "#8f7bff", 0.55);
    // the ringed giant, ahead of the start, low: a crescent toward the sun
    const giantDir = sph(-24, 22);
    const gg = new THREE.Group();
    gg.position.copy(giantDir).multiplyScalar(250);
    gg.rotation.set(0.2, 0.5, 0.25);
    s.add(gg);
    const bands = canvasTex(8, 256, (g) => {
      const pal = ["#ffcf9a", "#ffb07a", "#f48a72", "#ffd9ae", "#e7799a", "#ffc28a", "#ffe3c0", "#f5967a", "#d86f97", "#ffbf8f"];
      let y = 0;
      let i = 0;
      while (y < 256) {
        const h = 8 + ((i * 37) % 23);
        g.fillStyle = pal[i % pal.length];
        g.fillRect(0, y, 8, h);
        y += h;
        i++;
      }
    });
    this.farBall(46, bands, "#3a1a52", gg);
    const ringTex = canvasTex(256, 256, (g) => {
      for (let r = 128; r > 70; r -= 2) {
        const k = (r - 78) / 50;
        const a = 0.25 + 0.6 * Math.abs(Math.sin(r * 0.37)) * (k > 0.05 && k < 0.95 ? 1 : 0.2);
        g.strokeStyle = `rgba(${255},${200 + ((r * 7) % 50)},${190 + ((r * 13) % 60)},${a})`;
        g.lineWidth = 2.2;
        g.beginPath();
        g.arc(128, 128, r, 0, Math.PI * 2);
        g.stroke();
      }
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(60, 98, 96, 1), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.set(Math.PI / 2 - 0.42, 0.3, 0);
    gg.add(ring);
    sprite(gg.position.clone().multiplyScalar(1.04), 170, "#ff9a7a", 0.3);
    // the moon and its city of light, round to the left and behind
    const mr = rng(1303);
    const moonDir = sph(-18, -128);
    const mg = new THREE.Group();
    mg.position.copy(moonDir).multiplyScalar(200);
    s.add(mg);
    const craters = canvasTex(128, 64, (g) => {
      g.fillStyle = "#c8c0e8";
      g.fillRect(0, 0, 128, 64);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = i % 3 ? "rgba(120,104,170,0.35)" : "rgba(255,255,255,0.3)";
        g.beginPath();
        g.arc(mr() * 128, mr() * 64, 2 + mr() * 7, 0, Math.PI * 2);
        g.fill();
      }
    });
    this.farBall(18, craters, "#2a2254", mg);
    const win = canvasTex(32, 64, (g) => {
      g.fillStyle = "#1c1636";
      g.fillRect(0, 0, 32, 64);
      for (let y = 3; y < 64; y += 6)
        for (let x = 3; x < 32; x += 7) {
          g.fillStyle = mr() < 0.7 ? (mr() < 0.5 ? "#ffe39a" : "#9ff3ff") : "#3a2f66";
          g.fillRect(x, y, 4, 3);
        }
    });
    win.wrapS = win.wrapT = THREE.RepeatWrapping;
    const cityMat = new THREE.MeshToonMaterial({ map: win, emissiveMap: win, emissive: "#ffffff", gradientMap: toonSteps() });
    const nCity = 46;
    const city = new THREE.InstancedMesh(GEO.box, cityMat, nCity);
    city.userData.noShadow = true;
    const face = moonDir.clone().negate();
    const tpos = v3(),
      tn = v3(),
      tq = new THREE.Quaternion(),
      tsc = v3();
    const towerCols = cols("#ffffff", "#d9c9ff", "#ffc9e8", "#c2f2ff");
    for (let i = 0; i < nCity; i++) {
      // round the point facing the planet, the tall ones in the middle
      const a = mr() * Math.PI * 2,
        rr0 = Math.sqrt(mr()) * 0.75;
      tn.copy(face);
      stand(tq, tn, UP);
      tpos.set(Math.cos(a) * rr0, 1, Math.sin(a) * rr0).applyQuaternion(tq).normalize();
      const hgt = (2.5 + mr() * 6) * (1.4 - rr0);
      stand(tq, tpos, UP);
      tsc.set(1.2 + mr() * 1.8, hgt, 1.2 + mr() * 1.8);
      this.m4.compose(tpos.clone().multiplyScalar(18 + hgt / 2 - 0.5), tq, tsc);
      city.setMatrixAt(i, this.m4);
      city.setColorAt(i, towerCols[i % towerCols.length]);
    }
    mg.add(city);
    // its beacon, a gold Q glow
    const beacon = new THREE.Mesh(GEO.ball, glow("#ffd23f"));
    beacon.position.copy(face).multiplyScalar(18 + 11);
    beacon.scale.setScalar(1.6);
    mg.add(beacon);
    sprite(mg.position.clone().addScaledVector(face, 22), 70, "#7ae8ff", 0.5);
    sprite(mg.position.clone().addScaledVector(face, 30), 22, "#ffd23f", 0.8);
    // a small ice moon, the other way
    const ice = new THREE.Group();
    ice.position.copy(sph(38, 150)).multiplyScalar(230);
    s.add(ice);
    const frost = canvasTex(64, 32, (g) => {
      g.fillStyle = "#bfe6ff";
      g.fillRect(0, 0, 64, 32);
      for (let i = 0; i < 26; i++) {
        g.fillStyle = i % 2 ? "rgba(255,255,255,0.5)" : "rgba(110,150,220,0.4)";
        g.fillRect(mr() * 64, mr() * 32, 3 + mr() * 10, 1 + mr() * 3);
      }
    });
    this.farBall(9, frost, "#1c2a5c", ice);
    // a comet, far out: a head, a tail away from the sun; it goes round the sun's own axis, so the tail keeps its way
    const cp = new THREE.Group();
    const comet = new THREE.Group();
    comet.position.copy(this.sunDir).applyAxisAngle(v3().crossVectors(this.sunDir, UP).normalize(), 1.15).multiplyScalar(300);
    const head = new THREE.Mesh(GEO.ball, glow("#e6f8ff"));
    head.scale.setScalar(4.5);
    head.userData.noShadow = true;
    comet.add(head);
    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(10, 1.4, 84, 12, 1, true).translate(0, 42, 0),
      new THREE.MeshBasicMaterial({ map: this.beamTex, color: "#9fdcff", transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    tail.quaternion.setFromUnitVectors(UP, v3().copy(this.sunDir).negate());
    tail.raycast = () => {};
    comet.add(tail);
    this.glowAt(v3(), 30, "#9fe8ff", 0.7, comet);
    cp.add(comet);
    s.add(cp);
    this.drift.push({ o: cp, ax: this.sunDir.clone(), v: 0.012 });
    // a convoy of little ships crossing, far out
    this.convoy(s, 120, [0.5, 1.2, -0.3], 0.02, "#e8e6f4", "#7a6cff", "#7ae8ff");
    // a belt of rocks and two Q-blocks, far out round the planet
    const belt = new THREE.Group();
    const nb = 26;
    const rocks = new THREE.InstancedMesh(GEO.box, toon("#8a7fb0", "#16102e"), nb);
    rocks.userData.noShadow = true;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + mr() * 0.2;
      const d = 34 + mr() * 10;
      tq.setFromEuler(new THREE.Euler(mr() * 3, mr() * 3, mr() * 3));
      const sz = 0.7 + mr() * 1.8;
      this.m4.compose(tpos.set(Math.cos(a) * d, (mr() - 0.5) * 4, Math.sin(a) * d), tq, tsc.set(sz, sz * (0.6 + mr() * 0.5), sz));
      rocks.setMatrixAt(i, this.m4);
    }
    belt.add(rocks);
    belt.rotation.set(0.5, 0, 0.35);
    s.add(belt);
    this.orbits.push(belt);
    const qo = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const qb = qBlock(2.4);
      const a = i * Math.PI + 0.7;
      qb.position.set(Math.cos(a) * 40, 0, Math.sin(a) * 40);
      qo.add(qb);
    }
    qo.rotation.set(-0.6, 0, 0.5);
    s.add(qo);
    this.orbits.push(qo);
  }

  // ---- the planet: grass tiles, a sandy pond, a start plaza ----------------------------------------

  private pondN = sph(-6, 146);

  private kindOf(dc: Vec, id: number) {
    const dp = arcM(dc, this.pondN);
    if (dp < 2.45) return K_WATER;
    if (dp < 3.5) return K_SAND;
    if (dc.y > Math.cos(1.85 / R)) return K_PLAZA;
    const h = Math.abs(Math.sin(id * 91.7 + 3.1) * 43758.5) % 1;
    return h < 0.09 ? K_FLOWER : K_GRASS;
  }

  /** The tile being cut (set by the world's tile…()): its cell in the ground's picture, the tint on its face, whether its picture may be turned. */
  private tileCell = 0;
  private tileTint = new THREE.Color(1, 1, 1);
  private tileTurn = true;
  /** The water's sheets of bright strokes (they slide), a shore's rolling lines. */
  private waves: THREE.Texture[] = [];
  private shoreTex: THREE.Texture | null = null;

  private planet(s: THREE.Scene) {
    const pos: number[] = [];
    const col: number[] = [];
    const uvs: number[] = [];
    const c00 = [v3(), v3(), v3(), v3()];
    const inner = [v3(), v3(), v3(), v3()];
    const outer = [v3(), v3(), v3(), v3()];
    const bottom = [v3(), v3(), v3(), v3()];
    const dc = v3(),
      e1 = v3(),
      e2 = v3(),
      nn = v3(),
      mid = v3(),
      hint = v3();
    const top = new THREE.Color(),
      bev = new THREE.Color(),
      side = new THREE.Color();
    // (the bevels and the sides: the picture's plain cell, their colour from the corners)
    const pb = cellUv(CELLS.plain);
    const pu = (pb[0] + pb[2]) / 2,
      pv = (pb[1] + pb[3]) / 2;
    const cu = [0, 0, 0, 0],
      cw = [0, 0, 0, 0];
    const quad = (a: Vec, b: Vec, cc: Vec, d: Vec, color: THREE.Color, h: Vec, face = false) => {
      e1.subVectors(b, a);
      e2.subVectors(cc, a);
      nn.crossVectors(e1, e2);
      const flip = nn.dot(h) < 0;
      const vs = flip ? [a, d, cc, b] : [a, b, cc, d];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        pos.push(vs[k].x, vs[k].y, vs[k].z);
        col.push(color.r, color.g, color.b);
        const ki = flip ? (4 - k) % 4 : k;
        if (face) uvs.push(cu[ki], cw[ki]);
        else uvs.push(pu, pv);
      }
    };
    for (let face = 0; face < 6; face++)
      for (let j = 0; j < NT; j++)
        for (let i = 0; i < NT; i++) {
          const id = face * NT * NT + j * NT + i;
          const a0 = -1 + (2 * i) / NT,
            a1 = -1 + (2 * (i + 1)) / NT,
            b0 = -1 + (2 * j) / NT,
            b1 = -1 + (2 * (j + 1)) / NT;
          cubeDir(face, a0, b0, c00[0]);
          cubeDir(face, a1, b0, c00[1]);
          cubeDir(face, a1, b1, c00[2]);
          cubeDir(face, a0, b1, c00[3]);
          dc.set(0, 0, 0);
          for (const c of c00) dc.add(c);
          dc.normalize();
          const hash = Math.abs(Math.sin(id * 12.9898 + 78.233) * 43758.5453) % 1;
          const chk = (i + j + face) % 2;
          this.tileTint.setRGB(1, 1, 1);
          this.tileTurn = true;
          const lift = this.lv.key === "tide" ? this.tileTide(dc, id, chk, hash, top, side) : this.lv.key === "foundry" ? this.tileFoundry(dc, id, chk, hash, top, side) : this.tileMeadow(dc, id, chk, hash, top, side);
          bev.copy(top).multiply(this.tileTint).multiplyScalar(0.9);
          // (the face's picture: its cell, turned a quarter or more so no two neighbours read alike)
          const box = cellUv(this.tileCell);
          const turn = this.tileTurn ? Math.floor(hash * 97) % 4 : 0;
          for (let k = 0; k < 4; k++) {
            const kk = (k + turn) % 4;
            cu[k] = kk === 0 || kk === 3 ? box[0] : box[2];
            cw[k] = kk < 2 ? box[1] : box[3];
          }
          const tr = R + lift;
          for (let k = 0; k < 4; k++) {
            inner[k].copy(dc).lerp(c00[k], 0.87).normalize().multiplyScalar(tr);
            outer[k]
              .copy(dc)
              .lerp(c00[k], 0.985)
              .normalize()
              .multiplyScalar(tr - 0.055);
            bottom[k].copy(dc).lerp(c00[k], 0.985).normalize().multiplyScalar(R - 0.75);
          }
          quad(inner[0], inner[1], inner[2], inner[3], this.tileTint, dc, true);
          for (let k = 0; k < 4; k++) {
            const k2 = (k + 1) % 4;
            quad(inner[k], inner[k2], outer[k2], outer[k], bev, dc);
            mid.addVectors(outer[k], outer[k2]).multiplyScalar(0.5);
            hint.copy(mid).addScaledVector(dc, -mid.dot(dc));
            quad(outer[k], outer[k2], bottom[k2], bottom[k], side, hint);
          }
        }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, map: tileAtlas(this.lv.key), gradientMap: toonSteps() }));
    s.add(mesh);
    const core = new THREE.Mesh(GEO.ball, toon(this.lv.key === "foundry" ? "#2c2630" : this.lv.key === "tide" ? "#1f5f9a" : "#3f7a3c"));
    core.scale.setScalar((R - 0.5) * 2);
    s.add(core);
    if (this.lv.key === "tide") {
      // the sea: an opaque shell over the lagoons' tiles (the islands stand out of it), pale in the shallows
      // round the islands, deep blue further out in two blues (opaque: the moon's circle and the meteor rings draw over it)
      const sg = new THREE.SphereGeometry(R + SEA, 96, 64);
      const sp = sg.getAttribute("position") as THREE.BufferAttribute;
      const sc = new Float32Array(sp.count * 3);
      const shallow = new THREE.Color("#86ecdc"),
        deep = new THREE.Color("#2c95dc"),
        deep2 = new THREE.Color("#2277c8"),
        cc = new THREE.Color(),
        nn = v3();
      for (let i = 0; i < sp.count; i++) {
        nn.set(sp.getX(i), sp.getY(i), sp.getZ(i)).normalize();
        const k = clamp((-this.isle(nn) - 0.2) / 2.4, 0, 1);
        const m = 0.5 + 0.5 * Math.sin(nn.x * 4.1 + 1) * Math.sin(nn.y * 3.3 + 2) * Math.sin(nn.z * 3.7 + 0.5);
        cc.copy(deep).lerp(deep2, m);
        cc.lerpColors(shallow, cc, k * k * (3 - 2 * k));
        sc.set([cc.r, cc.g, cc.b], i * 3);
      }
      sg.setAttribute("color", new THREE.BufferAttribute(sc, 3));
      this.sea = new THREE.Mesh(sg, new THREE.MeshToonMaterial({ vertexColors: true, emissive: "#0a3a6a", gradientMap: toonSteps() }));
      s.add(this.sea);
      // its waves: two sheets of bright strokes sliding across each other (the islands stand through them)
      const wg = new THREE.SphereGeometry(R + SEA + 0.012, 64, 40);
      this.waves = [0, 1].map((i) => {
        const tex = waveTex(521 + i, i ? 20 : 30);
        tex.repeat.set(i ? 14 : 20, i ? 7 : 10);
        const m = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: i ? 0.42 : 0.7, depthWrite: false }));
        m.renderOrder = 1;
        m.raycast = () => {};
        s.add(m);
        return tex;
      });
    } else if (this.lv.key === "meadow") {
      // the pond's water, a lid of light blue over its tiles; two sheets of bright strokes slide across it, a rim of foam breathes
      const water = new THREE.Mesh(capGeo(2.95, 0, -0.07, 48, 6), new THREE.MeshToonMaterial({ color: "#63cdf6", emissive: "#12508c", gradientMap: toonSteps(), transparent: true, opacity: 0.8 }));
      water.quaternion.setFromUnitVectors(UP, this.pondN);
      s.add(water);
      this.waves = [0, 1].map((i) => {
        const tex = waveTex(411 + i, i ? 18 : 26);
        tex.repeat.set(i ? 1.6 : 2.3, i ? 1.6 : 2.3);
        const m = new THREE.Mesh(capGeo(2.9, 0, -0.062 + i * 0.004, 40, 4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: i ? 0.45 : 0.75, depthWrite: false }));
        m.quaternion.copy(water.quaternion);
        m.renderOrder = 1;
        m.raycast = () => {};
        s.add(m);
        return tex;
      });
      this.foamMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false });
      const foam = new THREE.Mesh(capGeo(3.0, 2.6, -0.055, 56, 1), this.foamMat);
      foam.quaternion.copy(water.quaternion);
      foam.renderOrder = 1;
      s.add(foam);
    }
  }

  /** GENESIS MEADOW's paths (trodden earth, a tile wide): from the start's plaza to the ZK TOWER, and round to the hut. */
  private pathEnds: [Vec, Vec][] = [
    [v3(0, 1, 0), sph(31, 8)],
    [v3(0, 1, 0), sph(-30, -66)],
  ];
  private onPath(dc: Vec) {
    for (const [a, b] of this.pathEnds) {
      const n = this.a.crossVectors(a, b).normalize();
      if (Math.abs(Math.asin(clamp(dc.dot(n), -1, 1))) * R > 0.62) continue;
      if (this.b.crossVectors(a, dc).dot(n) >= 0 && this.b.crossVectors(dc, b).dot(n) >= 0) return true;
    }
    return false;
  }

  /** GENESIS MEADOW's tiles: grass in wide soft patches (a flowery one here and there), paths, the pond and its sand, the start's plaza. Returns the tile's lift. */
  private tileMeadow(dc: Vec, id: number, chk: number, hash: number, top: THREE.Color, side: THREE.Color) {
    const kind = this.kindOf(dc, id);
    const t = TONE.meadow,
      c = CELLS.meadow;
    let lift = 0.03;
    if (kind === K_WATER) {
      lift = POND + 0.03;
      top.set(t.bed);
      side.set("#1f5fae");
      this.tileCell = c.bed[0];
    } else if (kind === K_SAND) {
      top.set(t.sand);
      side.set("#c9a468");
      this.tileCell = c.sand[hash < 0.3 ? 1 : 0];
      this.tileTint.setScalar(chk ? 1 : 0.97);
    } else if (kind === K_PLAZA) {
      top.set(t.plaza);
      side.set("#b9a6e6");
      lift = 0.05;
      this.tileCell = c.plaza[chk];
      this.tileTurn = false;
    } else if (this.onPath(dc)) {
      top.set(t.path);
      side.set("#a98a5c");
      this.tileCell = c.path[0];
      this.tileTint.setScalar(0.97 + hash * 0.05);
    } else {
      // (wide patches, sunnier or deeper: a slow wave over the ball, not a checker)
      const m = Math.sin(dc.x * 3.1 + 1.3) * Math.sin(dc.y * 2.7 + 0.4) * Math.sin(dc.z * 3.5 + 2.2) + 0.45 * Math.sin(dc.x * 6.3 + dc.z * 5.1 + dc.y * 4.2);
      const k = clamp(m * 0.9, -1, 1);
      top.set(t.grass);
      if (k > 0) this.tileTint.setRGB(1 + k * 0.05, 1 + k * 0.03, 1 - k * 0.1);
      else this.tileTint.setRGB(1 + k * 0.1, 1 + k * 0.035, 1 + k * 0.02);
      this.tileTint.multiplyScalar(0.985 + hash * 0.03);
      this.tileCell = kind === K_FLOWER ? c.flower[0] : c.grass[Math.floor(hash * 31) % c.grass.length];
      side.copy(top).multiplyScalar(0.42);
    }
    this.ground[id] = kind === K_WATER ? POND : 0;
    return lift;
  }

  /** How far into the nearest island a spot is (m; < 0: out in the lagoon). */
  private isle(n: Vec) {
    let best = -Infinity;
    for (const [la, lo, r] of TIDE_ISLES) best = Math.max(best, r - arcM(n, sph(la, lo, this.sc)));
    return best;
  }

  /** ORCHARD TIDE's tiles: sand islands with a green heart, a boardwalk at the start, the lagoons (lower, under the sea's shell). */
  private tileTide(dc: Vec, id: number, chk: number, hash: number, top: THREE.Color, side: THREE.Color) {
    const into = this.isle(dc);
    const pole = arcM(dc, UP);
    const t = TONE.tide,
      c = CELLS.tide;
    this.ground[id] = 0;
    if (pole < 2.3) {
      top.set(t.planks);
      side.set("#9a6238");
      this.tileCell = c.planks[chk];
      this.tileTurn = false;
      this.tileTint.setScalar(0.97 + hash * 0.05);
      return 0.06;
    }
    if (into > 1.15) {
      top.set(t.grass);
      side.set("#c99a5a");
      this.tileCell = c.grass[hash < 0.35 ? 1 : 0];
      this.tileTint.setRGB(0.97 + hash * 0.05, 1, 0.94 + hash * 0.08);
      return 0.05;
    }
    if (into > 0) {
      top.set(t.sand);
      side.set("#d9aa6a");
      this.tileCell = c.sand[hash < 0.2 ? 2 : hash < 0.5 ? 1 : 0];
      // (wet and a shade deeper at the water's edge)
      this.tileTint.setScalar(into < 0.55 ? 0.93 : 0.98 + hash * 0.03);
      return 0.03;
    }
    this.ground[id] = LAGOON;
    top.set(into > -1.6 ? "#7fe6d6" : t.bed);
    side.set("#1f6fae");
    this.tileCell = c.bed[0];
    return LAGOON + 0.03;
  }

  /** PROOF FACTORY's tiles: steel plates (scratched, treaded, grated, a rusted one), the belts' dark beds, a lighter pad at the start. */
  private tileFoundry(dc: Vec, _id: number, chk: number, hash: number, top: THREE.Color, side: THREE.Color) {
    const t = TONE.foundry,
      c = CELLS.foundry;
    this.ground[_id] = 0;
    side.set("#34323f");
    for (const b of BELT_AX)
      if (Math.abs(Math.asin(clamp(dc.dot(b), -1, 1))) * R < BELT_HW + 0.35) {
        top.set(t.bed);
        this.tileCell = c.bed[0];
        return 0.02;
      }
    if (arcM(dc, UP) < 2.2) {
      top.set(t.plaza);
      this.tileCell = c.plaza[chk];
      this.tileTurn = false;
      return 0.05;
    }
    if (hash < 0.06) {
      top.set(t.rust);
      this.tileCell = c.rust[0];
      return 0.04;
    }
    top.set(t.plate);
    this.tileCell = c.plate[hash < 0.62 ? 0 : hash < 0.86 ? 1 : 2];
    this.tileTint.setScalar(0.95 + ((hash * 13) % 1) * 0.09);
    return 0.04;
  }

  /** The ground's height here (m over R): the pond is lower. */
  private groundAt(n: Vec) {
    return this.ground[tileOf(n)];
  }

  // ---- the planet's pieces: the ZK TOWER, trees, a hut, crystals, rocks, tufts, flowers ------------

  private decor(s: THREE.Scene) {
    const place = (o: THREE.Object3D, n: Vec, yaw = 0) => {
      o.position.copy(n).multiplyScalar(R + 0.02);
      o.quaternion.setFromUnitVectors(UP, n).multiply(this.q.setFromAxisAngle(UP, yaw));
      s.add(o);
      return o;
    };
    const box = (color: string, w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D, ink = 0.04, emissive = "#000000") => {
      const m = new THREE.Mesh(GEO.box, toon(color, emissive));
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      if (ink) outline(m, ink);
      parent.add(m);
      return m;
    };
    // the ZK TOWER: stone, two Z-Blocks, one floating and spinning on top
    const towerN = this.towerN;
    const tower = new THREE.Group();
    box("#cfc6f2", 1.7, 0.7, 1.7, 0, 0.35, 0, tower);
    box("#b3a6e8", 1.4, 1.0, 1.4, 0, 1.2, 0, tower);
    const q1 = qBlock(1.2);
    q1.position.y = 2.3;
    tower.add(q1);
    this.topQ = qBlock(1.0);
    this.topQ.position.y = 3.7;
    tower.add(this.topQ);
    seeThrough(q1.material as THREE.Material);
    seeThrough(this.topQ.material as THREE.Material);
    place(tower, towerN, 0.3);
    this.bk.absorb(tower);
    this.obst.push({ n: towerN, r: 0.95 });
    // the hut: a cream cabin, a red roof, a lit window
    const hutN = sph(-36, -70);
    const hut = new THREE.Group();
    box("#fff1d6", 1.9, 1.3, 1.6, 0, 0.65, 0, hut);
    const roofL = box("#ff5a5f", 1.25, 0.22, 1.85, -0.5, 1.55, 0, hut);
    roofL.rotation.z = 0.62;
    const roofR = box("#ff5a5f", 1.25, 0.22, 1.85, 0.5, 1.55, 0, hut);
    roofR.rotation.z = -0.62;
    box("#7a4a2a", 0.5, 0.8, 0.06, 0.35, 0.4, 0.81, hut, 0.02);
    box("#ffd86a", 0.42, 0.36, 0.06, -0.45, 0.8, 0.81, hut, 0.02, "#a07000");
    box("#9c8fb8", 0.26, 0.6, 0.26, 0.55, 1.9, -0.4, hut);
    place(hut, hutN, -0.5);
    this.bk.absorb(hut);
    this.obst.push({ n: hutN, r: 1.25 });
    // the crystals, near the south pole
    const crysN = sph(-76, 40);
    const crys = new THREE.Group();
    this.crystalMat = seeThrough(markGlow(new THREE.MeshToonMaterial({ color: "#b99bff", emissive: "#5a2fc8", gradientMap: toonSteps() }), 0.6));
    const cr: [number, number, number, number, number][] = [
      [0, 0, 0.55, 2.4, 0],
      [0.55, 0.2, 0.4, 1.6, 0.35],
      [-0.5, 0.3, 0.42, 1.8, -0.3],
      [0.1, -0.55, 0.36, 1.3, 0.25],
      [-0.25, -0.4, 0.3, 1.0, -0.45],
    ];
    for (const [x, z, w, h, tilt] of cr) {
      const m = new THREE.Mesh(GEO.box, this.crystalMat);
      m.scale.set(w, h, w);
      m.position.set(x, h / 2 - 0.1, z);
      m.rotation.set(tilt * 0.6, tilt * 2, tilt);
      outline(m, 0.035);
      crys.add(m);
    }
    place(crys, crysN);
    this.bk.absorb(crys, new Set([this.crystalMat]));
    this.obst.push({ n: crysN, r: 0.95 });
    // the trees (instanced: trunks, three tiers of leaves, their ink): a broad skirt, a middle, a crown, each turned
    // a little and a shade lighter going up; the blossom and the autumn ones are rounder
    const trees: [number, number, number][] = [
      [58, -55, 0],
      [52, 118, 1],
      [14, -128, 0],
      [8, 66, 2],
      [-22, 16, 0],
      [-28, 96, 1],
      [-52, -160, 0],
      [22, 178, 3],
      [-12, -36, 1],
      [-60, -20, 0],
      [36, -96, 1],
      [-46, 168, 2],
      [-8, -100, 3],
    ];
    const leafC = [
      ["#2f9a4c", "#41b858", "#63d46e"],
      ["#27894a", "#38a856", "#56c468"],
      ["#f277b4", "#ff9ccd", "#ffc2e0"],
      ["#f09a32", "#ffb650", "#ffd684"],
    ];
    // (their width, height and how high each tier sits: a fir's, then the round ones')
    const tiers = [
      [
        [1.55, 0.62, 1.34],
        [1.18, 0.58, 1.9],
        [0.72, 0.5, 2.4],
      ],
      [
        [1.3, 0.6, 1.36],
        [1.56, 0.66, 1.9],
        [0.98, 0.5, 2.42],
      ],
    ];
    const nL = trees.length * 3;
    const trunks = new THREE.InstancedMesh(GEO.box, this.prop("#9a6236"), trees.length);
    const leaves = new THREE.InstancedMesh(GEO.box, sway(this.prop("#ffffff"), 0.035), nL);
    const ink = this.inkSee;
    const leavesInk = new THREE.InstancedMesh(GEO.box, sway(seeThrough(new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide })), 0.035), nL);
    const trunkInk = new THREE.InstancedMesh(GEO.box, ink, trees.length);
    const pq = new THREE.Quaternion(),
      tq = new THREE.Quaternion(),
      tp = v3(),
      off = v3(),
      tsc = v3(),
      cc = new THREE.Color();
    trees.forEach(([la, lo, kind], i) => {
      const n = sph(la, lo);
      pq.setFromUnitVectors(UP, n).multiply(tq.setFromAxisAngle(UP, i * 1.7));
      const at = (x: number, y: number, z: number) => tp.copy(n).multiplyScalar(R).add(off.set(x, y, z).applyQuaternion(pq));
      this.m4.compose(at(0, 0.6, 0), pq, tsc.set(0.34, 1.2, 0.34));
      trunks.setMatrixAt(i, this.m4);
      this.m4.compose(at(0, 0.6, 0), pq, tsc.set(0.42, 1.28, 0.42));
      trunkInk.setMatrixAt(i, this.m4);
      const big = 1 + (i % 3) * 0.08;
      tiers[kind < 2 ? 0 : 1].forEach(([w, h, y], k) => {
        tq.copy(pq).multiply(this.q2.setFromAxisAngle(UP, k * 0.5 + (i % 2) * 0.3));
        const ox = k === 2 ? 0.08 : 0,
          oz = k === 2 ? -0.06 : 0;
        this.m4.compose(at(ox, y * big, oz), tq, tsc.set(w * big, h * big, w * big));
        leaves.setMatrixAt(i * 3 + k, this.m4);
        leaves.setColorAt(i * 3 + k, cc.set(leafC[kind][k]));
        this.m4.compose(at(ox, y * big, oz), tq, tsc.set(w * big + 0.09, h * big + 0.09, w * big + 0.09));
        leavesInk.setMatrixAt(i * 3 + k, this.m4);
      });
      this.obst.push({ n, r: 0.5 });
      this.treeNs.push(n);
    });
    s.add(trunks, leaves, leavesInk, trunkInk);
    // the rocks
    const rocksAt: [number, number, number][] = [
      [44, 160, 0.7],
      [-62, 86, 0.8],
      [4, -84, 0.6],
      [-22, -150, 0.75],
      [62, 52, 0.55],
    ];
    const rocks = new THREE.InstancedMesh(GEO.box, this.prop("#a59cc4"), rocksAt.length * 2);
    const rocksInk = new THREE.InstancedMesh(GEO.box, ink, rocksAt.length * 2);
    rocksAt.forEach(([la, lo, sz], i) => {
      const n = sph(la, lo);
      pq.setFromUnitVectors(UP, n).multiply(tq.setFromAxisAngle(UP, i * 2.3));
      const at = (x: number, y: number, z: number) => tp.copy(n).multiplyScalar(R).add(off.set(x, y, z).applyQuaternion(pq));
      tq.copy(pq).multiply(this.q2.setFromEuler(new THREE.Euler(0.15, 0.4, 0.1)));
      this.m4.compose(at(0, sz * 0.4, 0), tq, tsc.set(sz * 1.3, sz, sz * 1.1));
      rocks.setMatrixAt(i * 2, this.m4);
      this.m4.compose(at(0, sz * 0.4, 0), tq, tsc.set(sz * 1.3 + 0.08, sz + 0.08, sz * 1.1 + 0.08));
      rocksInk.setMatrixAt(i * 2, this.m4);
      this.m4.compose(at(sz * 0.7, sz * 0.2, sz * 0.4), pq, tsc.set(sz * 0.6, sz * 0.5, sz * 0.6));
      rocks.setMatrixAt(i * 2 + 1, this.m4);
      this.m4.compose(at(sz * 0.7, sz * 0.2, sz * 0.4), pq, tsc.set(sz * 0.6 + 0.07, sz * 0.5 + 0.07, sz * 0.6 + 0.07));
      rocksInk.setMatrixAt(i * 2 + 1, this.m4);
      this.obst.push({ n, r: sz * 0.85 });
    });
    s.add(rocks, rocksInk);
    // small things, no bumps: grass tufts, flowers, mushrooms, lily pads
    const free = (n: Vec, m: number) => !this.blocked(n, m) && arcM(n, this.pondN) > 3.6 && n.y < Math.cos(2.1 / R);
    const rn = v3();
    const randN = () => {
      const z = this.dr() * 2 - 1,
        a = this.dr() * Math.PI * 2,
        k = Math.sqrt(1 - z * z);
      return rn.set(Math.cos(a) * k, z, Math.sin(a) * k);
    };
    const nTuft = 380;
    // (the tufts and the flowers lean in the wind)
    const tufts = new THREE.InstancedMesh(GEO.box, sway(new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonSteps() }), 0.8), nTuft);
    const tuftC = cols("#3fae46", "#5cc94e", "#8ee35b", "#2f9a3e");
    for (let i = 0; i < nTuft; i++) {
      let n = randN();
      for (let k = 0; k < 8 && !free(n, 0.3); k++) n = randN();
      pq.setFromUnitVectors(UP, n).multiply(tq.setFromEuler(new THREE.Euler((this.dr() - 0.5) * 0.5, this.dr() * 6, (this.dr() - 0.5) * 0.5)));
      const h = 0.18 + this.dr() * 0.22;
      this.m4.compose(tp.copy(n).multiplyScalar(R + h / 2), pq, tsc.set(0.07, h, 0.07));
      tufts.setMatrixAt(i, this.m4);
      tufts.setColorAt(i, tuftC[i % tuftC.length]);
    }
    s.add(tufts);
    const nFl = 150;
    const flowers = new THREE.InstancedMesh(GEO.box, sway(new THREE.MeshToonMaterial({ color: "#ffffff", emissive: "#222222", gradientMap: toonSteps() }), 0.24), nFl);
    const flC = cols("#fff27a", "#ffffff", "#ff9ad5", "#9fd3ff", "#ffb36b");
    for (let i = 0; i < nFl; i++) {
      let n = randN();
      for (let k = 0; k < 8 && !free(n, 0.4); k++) n = randN();
      pq.setFromUnitVectors(UP, n).multiply(tq.setFromAxisAngle(UP, this.dr() * 6));
      this.m4.compose(tp.copy(n).multiplyScalar(R + 0.2), pq, tsc.set(0.17, 0.12, 0.17));
      flowers.setMatrixAt(i, this.m4);
      flowers.setColorAt(i, flC[i % flC.length]);
    }
    s.add(flowers);
    const shrooms: [number, number][] = [
      [70, -100],
      [-4, 30],
      [-44, 128],
      [16, -62],
      [40, 140],
      [-70, -110],
      [10, 112],
      [-30, -10],
    ];
    const stems = new THREE.InstancedMesh(GEO.box, toon("#fff3dc"), shrooms.length);
    const caps = new THREE.InstancedMesh(GEO.box, toon("#ff4f5e"), shrooms.length);
    const dots = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), shrooms.length * 2);
    shrooms.forEach(([la, lo], i) => {
      const n = sph(la, lo);
      pq.setFromUnitVectors(UP, n).multiply(tq.setFromAxisAngle(UP, i));
      const at = (x: number, y: number, z: number) => tp.copy(n).multiplyScalar(R).add(off.set(x, y, z).applyQuaternion(pq));
      const k = 0.8 + (i % 3) * 0.25;
      this.m4.compose(at(0, 0.18 * k, 0), pq, tsc.set(0.16 * k, 0.36 * k, 0.16 * k));
      stems.setMatrixAt(i, this.m4);
      this.m4.compose(at(0, 0.42 * k, 0), pq, tsc.set(0.48 * k, 0.2 * k, 0.48 * k));
      caps.setMatrixAt(i, this.m4);
      this.m4.compose(at(0.12 * k, 0.53 * k, 0.08 * k), pq, tsc.set(0.1 * k, 0.04, 0.1 * k));
      dots.setMatrixAt(i * 2, this.m4);
      this.m4.compose(at(-0.1 * k, 0.53 * k, -0.12 * k), pq, tsc.set(0.08 * k, 0.04, 0.08 * k));
      dots.setMatrixAt(i * 2 + 1, this.m4);
    });
    s.add(stems, caps, dots);
    const lily = new THREE.InstancedMesh(GEO.disc, toon("#5fd86a"), 5);
    for (let i = 0; i < 5; i++) {
      const n = this.pondN.clone();
      const dir = v3(Math.cos(i * 1.3), 0, Math.sin(i * 1.3));
      stand(pq, n, UP);
      dir.applyQuaternion(pq);
      flat(dir, n).normalize();
      slide(n, dir, (0.6 + (i % 3) * 0.55) / R);
      pq.setFromUnitVectors(UP, n).multiply(tq.setFromAxisAngle(XX, -Math.PI / 2));
      this.m4.compose(tp.copy(n).multiplyScalar(R - 0.06), pq, tsc.setScalar(0.5 + (i % 2) * 0.2));
      lily.setMatrixAt(i, this.m4);
    }
    s.add(lily);
  }

  // ---- the other worlds' pieces --------------------------------------------------------------------

  /** Stand a piece on the planet at `n`, turned by `yaw` round its up. */
  private put(o: THREE.Object3D, n: Vec, yaw = 0, lift = 0.02) {
    o.position.copy(n).multiplyScalar(R + lift);
    o.quaternion.setFromUnitVectors(UP, n).multiply(this.q.setFromAxisAngle(UP, yaw));
    this.w.scene.add(o);
    return o;
  }

  private softTex: THREE.Texture | null = null;
  /** A soft round glow (the halos' picture). */
  private soft() {
    return (this.softTex ??= canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.4, "rgba(255,255,255,0.35)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    }));
  }
  /** A soft glow sprite (additive) at `at`. */
  private glowAt(at: Vec, size: number, color: string, opacity: number, parent: THREE.Object3D = this.w.scene) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.copy(at);
    sp.scale.setScalar(size);
    parent.add(sp);
    return sp;
  }

  // ORCHARD TIDE: a dusk sky, the sun low, the planet's own rings, voxel clouds, the moon and its circle

  private skyTide(s: THREE.Scene) {
    // the dusk: peach round the low sun, rose and violet across, indigo and its stars on the far side
    const band = sph(40, 100);
    spaceDome(s, "tide", {
      seed: 2202,
      sun: this.sunDir,
      tone: ["#ff9c6c", "#8c4090", "#120f44"],
      turn: 0.37,
      glare: ["#ffd9a0", 0.8, 24],
      clouds: [
        ["#ff7ab8", 0.28, 0.5, 0],
        ["#ffb36b", 0.22, 0.58, 1],
        ["#5a6cff", 0.3, 0.55, 2],
      ],
      band: { pole: band, color: "#c9b8ff", k: 0.34, width: 0.2 },
      dust: 0.3,
    });
    this.starsAll(s, 2300, ["#ffffff", "#ffe9d6", "#d9d0ff"], band, 0.95, 105);
    this.sunBall(s, "#fff1c4", 32, [
      ["#ffd08a", 150, 0.9],
      ["#ff8a5a", 400, 0.42],
    ]);
    this.glowAt(v3(), R * 3.1, "#ffb08a", 0.5);
    // the rings, far round the planet (well out of the camera's way)
    const ringTex = canvasTex(256, 256, (g) => {
      const pal = ["255,214,190", "255,176,150", "206,178,255", "255,198,170", "176,214,255"];
      for (let r = 128; r > 84; r -= 2) {
        const k = (r - 84) / 44;
        const a = (0.12 + 0.3 * Math.abs(Math.sin(r * 0.41))) * (k > 0.06 && k < 0.94 ? 1 : 0.25) * (r > 104 && r < 109 ? 0.15 : 1);
        g.strokeStyle = `rgba(${pal[(r >> 2) % pal.length]},${a})`;
        g.lineWidth = 2.2;
        g.beginPath();
        g.arc(128, 128, r, 0, Math.PI * 2);
        g.stroke();
      }
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(52, 80, 128, 1), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.set(Math.PI / 2 - 0.5, 0.25, 0);
    s.add(ring);
    this.orbits.push(ring);
    // a far twin world, half lit, and a small moon beside it
    const cr = rng(2404);
    const twin = new THREE.Group();
    twin.position.copy(sph(30, -120)).multiplyScalar(260);
    twin.rotation.set(0.3, 0, 0.4);
    s.add(twin);
    const seas = canvasTex(128, 64, (g) => {
      g.fillStyle = "#3aa0e0";
      g.fillRect(0, 0, 128, 64);
      for (let i = 0; i < 30; i++) {
        g.fillStyle = i % 3 ? "#7fe0c8" : "#ffe9b0";
        g.fillRect(cr() * 128, 8 + cr() * 48, 4 + cr() * 14, 2 + cr() * 5);
      }
      g.fillStyle = "rgba(255,255,255,0.75)";
      for (let i = 0; i < 16; i++) g.fillRect(cr() * 128, cr() * 64, 8 + cr() * 22, 2 + cr() * 2);
      g.fillRect(0, 0, 128, 5);
      g.fillRect(0, 59, 128, 5);
    });
    this.farBall(30, seas, "#241a5a", twin);
    this.glowAt(twin.position.clone().multiplyScalar(1.03), 96, "#7fc8ff", 0.3);
    const pebble = new THREE.Group();
    pebble.position.copy(sph(22, -104)).multiplyScalar(240);
    s.add(pebble);
    const grey = canvasTex(64, 32, (g) => {
      g.fillStyle = "#e6dcf0";
      g.fillRect(0, 0, 64, 32);
      for (let i = 0; i < 22; i++) {
        g.fillStyle = i % 2 ? "rgba(150,130,190,0.45)" : "rgba(255,255,255,0.5)";
        g.fillRect(cr() * 64, cr() * 32, 2 + cr() * 7, 2 + cr() * 4);
      }
    });
    this.farBall(7, grey, "#2a2054", pebble);
    // dusk clouds drifting round, beyond the camera's reach: lit peach toward the sun, violet on the far side (one draw)
    const nC = 15;
    const cloudM = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#ffffff" }), nC * 4);
    cloudM.userData.noShadow = true;
    cloudM.frustumCulled = false;
    cloudM.raycast = () => {};
    const cq = new THREE.Quaternion(),
      cp = v3(),
      cs = v3(),
      cn = v3(),
      co = v3(),
      cc = new THREE.Color(),
      warm = new THREE.Color("#ffd2b0"),
      cool = new THREE.Color("#8f7fd6"),
      under = new THREE.Color("#b06a9a");
    for (let i = 0; i < nC; i++) {
      // (low round the planet's waist and under it: never where the card's camera flies)
      sph(-52 + cr() * 58, (i / nC) * 360 + cr() * 14, cn);
      const d = 27 + cr() * 8;
      cq.setFromUnitVectors(UP, cn).multiply(this.q.setFromAxisAngle(UP, cr() * 6));
      const w = 3.2 + cr() * 2.6;
      const day = clamp(cn.dot(this.sunDir) * 0.8 + 0.5, 0, 1);
      for (let k = 0; k < 4; k++) {
        // a long flat base, two humps on it, a small one at the end
        const part: [number, number, number, number, number, number] = k === 0 ? [0, 0, 0, w, 0.7, w * 0.55] : k === 1 ? [-w * 0.14, 0.6, 0, w * 0.5, 0.75, w * 0.42] : k === 2 ? [w * 0.2, 0.5, 0.1, w * 0.36, 0.55, w * 0.34] : [w * 0.52, -0.1, -0.1, w * 0.3, 0.45, w * 0.3];
        cp.copy(cn).multiplyScalar(d).add(co.set(part[0], part[1], part[2]).applyQuaternion(cq));
        this.m4.compose(cp, cq, cs.set(part[3], part[4], part[5]));
        cloudM.setMatrixAt(i * 4 + k, this.m4);
        cc.copy(cool).lerp(warm, day);
        if (k === 0) cc.lerp(under, 0.45);
        cloudM.setColorAt(i * 4 + k, cc);
      }
    }
    const clouds = new THREE.Group();
    clouds.add(cloudM);
    s.add(clouds);
    this.drift.push({ o: clouds, ax: v3(0, 1, 0), v: 0.016 });
    this.convoy(s, 150, [-0.4, 0.3, 0.5], -0.015, "#fff1e0", "#ff8a5a", "#ffd08a");
    this.makeTide(s);
  }

  /** The moon (far up), its light pouring down onto its circle: a soft disc, a rim, three bands that run inward, a beam. */
  private makeTide(s: THREE.Scene) {
    const moon = new THREE.Group();
    const craters = canvasTex(128, 64, (g) => {
      g.fillStyle = "#e8ecff";
      g.fillRect(0, 0, 128, 64);
      for (let i = 0; i < 46; i++) {
        g.fillStyle = i % 3 ? "rgba(140,150,210,0.35)" : "rgba(255,255,255,0.45)";
        g.beginPath();
        g.arc(this.dr() * 128, this.dr() * 64, 2 + this.dr() * 7, 0, Math.PI * 2);
        g.fill();
      }
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(5.5, 32, 20), new THREE.MeshToonMaterial({ map: craters, gradientMap: toonSteps(), emissive: "#4a5aa0" }));
    moon.add(ball);
    this.glowAt(v3(), 24, "#9fe8ff", 0.55, moon);
    s.add(moon);
    const zone = new THREE.Group();
    const fade = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,255,255,0.95)");
      gr.addColorStop(0.75, "rgba(255,255,255,0.45)");
      gr.addColorStop(1, "rgba(255,255,255,0.15)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    const add = (geo: THREE.BufferGeometry, color: string, opacity: number, map: THREE.Texture | null = null, order = 3) => {
      const mat = new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = order;
      m.raycast = () => {};
      zone.add(m);
      return mat;
    };
    // (the moon's shadow: dark indigo on the bright sea and sand, a white rim, violet bands running in)
    const discMat = add(capGeo(TIDE_R, 0, 0.09, 48, 5), "#2a1f7a", 0.34, fade, 2);
    add(capGeo(TIDE_R + 0.12, TIDE_R - 0.34, 0.11, 64, 1), "#3a2a9a", 0.55, null, 3);
    const edgeMat = add(capGeo(TIDE_R - 0.04, TIDE_R - 0.24, 0.13, 64, 1), "#f2fbff", 0.95, null, 4);
    const bands = [0.78, 0.54, 0.3].map((k) => add(capGeo(TIDE_R * k, TIDE_R * k - 0.32, 0.12, 56, 1), "#8f7bff", 0.6, null, 4));
    s.add(zone);
    const beamMat = new THREE.MeshBasicMaterial({ map: this.beamTex, color: "#9fdcff", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const h = MOON_D - R - 4;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, TIDE_R * 0.92, h, 28, 1, true).translate(0, R + h / 2, 0), beamMat);
    beam.raycast = () => {};
    s.add(beam);
    // (rings of light rising in it to the moon: from afar the beam reads as what lifts you, not a stray wedge of light)
    const rise = canvasTex(
      8,
      64,
      (g) => {
        g.clearRect(0, 0, 8, 64);
        const gr = g.createLinearGradient(0, 14, 0, 50);
        gr.addColorStop(0, "rgba(255,255,255,0)");
        gr.addColorStop(0.72, "rgba(255,255,255,0.95)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(0, 14, 8, 36);
      },
      true,
    );
    rise.repeat.set(1, 6);
    const pg = new THREE.CylinderGeometry(2.1, TIDE_R * 0.9, h, 28, 1, true).translate(0, R + h / 2, 0);
    {
      // (they fade toward the moon: the corners' colour, dark at the top)
      const pp = pg.getAttribute("position");
      const pc = new Float32Array(pp.count * 3);
      for (let i = 0; i < pp.count; i++) pc.fill(pp.getY(i) > R + h / 2 ? 0.12 : 1, i * 3, i * 3 + 3);
      pg.setAttribute("color", new THREE.BufferAttribute(pc, 3));
    }
    const rings = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: rise, color: "#bfeaff", vertexColors: true, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    rings.raycast = () => {};
    beam.add(rings);
    this.tide = { moon, zone, beam, beamMat, rise, discMat, edgeMat, bands, sub: v3(0, -1, 0), prev: v3(0, -1, 0), axis: v3(), P: v3(), Q: v3(), ang: -0.8 * Math.PI, prec: 0, pull: TIDE_PULL[0], lap: MOON_LAP[0], inside: false };
    this.tideStep(0, false);
  }

  /** The moon goes round (in play), its circle follows it; the bands' light runs inward. */
  private tideStep(dt: number, live: boolean) {
    const td = this.tide;
    if (!td) return;
    if (live) {
      const hk = this.hurry ? 1 : 0;
      td.lap += (MOON_LAP[hk] - td.lap) * Math.min(1, dt * 0.8);
      td.pull += (TIDE_PULL[hk] - td.pull) * Math.min(1, dt * 0.8);
      td.ang += ((Math.PI * 2) / td.lap) * dt;
      td.prec += dt * 0.11;
    }
    td.prev.copy(td.sub);
    // the orbit: its axis 60° from the pole, turning round it; P its point nearest the pole
    sph(30, 0, td.axis).applyAxisAngle(UP, td.prec);
    td.P.copy(UP).addScaledVector(td.axis, -td.axis.y).normalize();
    td.Q.crossVectors(td.axis, td.P);
    td.sub.copy(td.P).multiplyScalar(Math.cos(td.ang)).addScaledVector(td.Q, Math.sin(td.ang)).normalize();
    // the flags in its light drift along with it (never into a piece)
    if (live && this.started) {
      this.q2.setFromUnitVectors(td.prev, td.sub);
      for (const f of this.flags) {
        if ((f.state !== S_LIVE && f.state !== S_RISE) || arcM(f.n, td.prev) > TIDE_R - 0.4) continue;
        this.a.copy(f.n).applyQuaternion(this.q2).normalize();
        if (!this.blocked(this.a, 0.3)) f.n.copy(this.a);
      }
    }
    td.moon.position.copy(td.sub).multiplyScalar(MOON_D);
    td.moon.rotation.y += dt * 0.3;
    td.zone.quaternion.setFromUnitVectors(UP, td.sub);
    td.beam.quaternion.copy(td.zone.quaternion);
    const t = this.camT + this.t;
    for (let i = 0; i < 3; i++) {
      const ph = (((t * 1.25 - i * 0.22) % 1) + 1) % 1;
      td.bands[i].opacity = 0.1 + 0.8 * Math.max(0, Math.sin(ph * Math.PI)) ** 3;
    }
    td.edgeMat.opacity = 0.8 + Math.sin(t * 6) * 0.18;
    td.discMat.opacity = 0.3 + Math.sin(t * 2.2) * 0.05;
    td.beamMat.opacity = 0.16 + Math.sin(t * 1.7) * 0.04;
    td.rise.offset.y = -t * 0.55;
    // motes rising in it
    if (dt > 0 && Math.random() < dt * 14) {
      this.a.copy(td.sub);
      const a = Math.random() * Math.PI * 2;
      this.b.set(Math.cos(a), Math.sin(a * 1.3), Math.sin(a));
      flat(this.b, td.sub).normalize();
      slide(this.a, this.b, (Math.random() * TIDE_R * 0.95) / R);
      B_MOTE.up = this.a;
      this.fx.burst(this.c.copy(this.a).multiplyScalar(R + 0.2), 1, MOTES, B_MOTE);
    }
  }

  /** The tide at a spot: 0 outside the circle … 1 well inside; the pull (m/s) into `out` (tangent, toward the middle). */
  private tideAt(n: Vec, out: Vec) {
    const td = this.tide;
    out.set(0, 0, 0);
    if (!td || !this.started) return 0;
    const d = arcM(n, td.sub);
    if (d >= TIDE_R) return 0;
    const k = clamp((TIDE_R - d) / 1.1, 0, 1);
    toward(n, td.sub, out);
    out.multiplyScalar(td.pull * clamp(d / 1.4, 0, 1) * (0.45 + 0.55 * k));
    return k;
  }

  private decorTide(s: THREE.Scene) {
    // the lighthouse on the island ahead: white and red, a Z-Block lamp, a glow
    const lhN = sph(30, 14);
    const lh = new THREE.Group();
    boxIn(lh, "#f4f0ea", 1.5, 0.5, 1.5, 0, 0.25, 0);
    for (let i = 0; i < 4; i++) boxIn(lh, i % 2 ? "#ff5a5f" : "#fff8f0", 1.2 - i * 0.12, 0.85, 1.2 - i * 0.12, 0, 0.9 + i * 0.85, 0, 0.035);
    boxIn(lh, "#3a3f66", 1.1, 0.16, 1.1, 0, 4.3, 0, 0.03);
    const lamp = qBlock(0.75);
    lamp.position.y = 4.8;
    lh.add(lamp);
    seeThrough(lamp.material as THREE.Material);
    this.topQ = lamp;
    boxIn(lh, "#ff5a5f", 0.95, 0.3, 0.95, 0, 5.35, 0, 0.03);
    const lg = new THREE.Mesh(GEO.ball, glow("#ffe9a0", 0.45, true));
    lg.scale.setScalar(2.2);
    lg.position.y = 4.8;
    lh.add(lg);
    this.put(lh, lhN, 0.4);
    this.bk.absorb(lh);
    this.lighthouse = lh;
    this.obst.push({ n: lhN, r: 0.95 });
    // a beach hut with a straw roof, on the west island
    const hutN = sph(12, -104);
    const hut = new THREE.Group();
    boxIn(hut, "#ffe7c2", 1.7, 1.1, 1.4, 0, 0.55, 0);
    const r1 = boxIn(hut, "#e9b04a", 1.15, 0.2, 1.7, -0.45, 1.35, 0);
    r1.rotation.z = 0.6;
    const r2 = boxIn(hut, "#e9b04a", 1.15, 0.2, 1.7, 0.45, 1.35, 0);
    r2.rotation.z = -0.6;
    boxIn(hut, "#2fb8c8", 0.5, 0.7, 0.06, 0.3, 0.35, 0.71, 0.02);
    this.put(hut, hutN, 0.9);
    this.bk.absorb(hut);
    this.obst.push({ n: hutN, r: 1.15 });
    // a little sailboat at anchor in a lagoon
    const boatN = sph(-4, 104);
    const boat = new THREE.Group();
    boxIn(boat, "#ffffff", 0.9, 0.4, 2.0, 0, 0.0, 0);
    boxIn(boat, "#ff8a3d", 0.95, 0.12, 2.05, 0, 0.22, 0, 0.02);
    boxIn(boat, "#8a5a3a", 0.1, 2.0, 0.1, 0, 1.2, 0.1, 0.02);
    boxIn(boat, "#fff4e0", 0.06, 1.4, 0.9, 0.06, 1.35, -0.35, 0.02);
    this.put(boat, boatN, 1.2, -0.05);
    this.bk.absorb(boat);
    this.obst.push({ n: boatN, r: 0.9 });
    // palms (instanced: trunk pieces, fronds, coconuts and the ink)
    const palms: [number, number][] = [
      [24, 26],
      [31, 6],
      [20, 134],
      [16, 148],
      [8, -96],
      [-17, 56],
      [-24, 68],
      [-23, -46],
      [-28, -34],
      [-26, 170],
      [-34, -178],
      [-70, 0],
      [-78, 40],
      [-70, -40],
      [46, -146],
      [42, 96],
      [72, 120],
      [70, -60],
    ];
    const nT = palms.length * 3,
      nF = palms.length * 5;
    // (the fronds' tips bob in the wind, their ink with them)
    const trunks = new THREE.InstancedMesh(GEO.box, this.prop("#b57a46"), nT);
    const fronds = new THREE.InstancedMesh(GEO.box, sway(this.prop("#ffffff"), 1.1, "z"), nF);
    const nuts = new THREE.InstancedMesh(GEO.ball, this.prop("#6a3e22"), palms.length * 2);
    const ink = this.inkSee;
    const frondInk = new THREE.InstancedMesh(GEO.box, sway(seeThrough(new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide })), 0.66, "z"), nF);
    const pq = new THREE.Quaternion(),
      tq = new THREE.Quaternion(),
      tp = v3(),
      off = v3(),
      tsc = v3(),
      cc = new THREE.Color(),
      eu = new THREE.Euler();
    const frondC = ["#2fbf5a", "#48d46a", "#3ac85e"];
    palms.forEach(([la, lo], i) => {
      const n = sph(la, lo);
      pq.setFromUnitVectors(UP, n).multiply(tq.setFromAxisAngle(UP, i * 1.9));
      const at = (x: number, y: number, z: number) => tp.copy(n).multiplyScalar(R).add(off.set(x, y, z).applyQuaternion(pq));
      const lean = 0.16 + (i % 3) * 0.05;
      for (let k = 0; k < 3; k++) {
        tq.copy(pq).multiply(this.q2.setFromAxisAngle(XX, lean * (k + 1) * 0.5));
        this.m4.compose(at(0, 0.4 + k * 0.74, lean * k * k * 0.5), tq, tsc.set(0.28 - k * 0.03, 0.8, 0.28 - k * 0.03));
        trunks.setMatrixAt(i * 3 + k, this.m4);
      }
      const topY = 2.25,
        topZ = lean * 4 * 0.5;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + i;
        eu.set(0.62, a, 0, "YXZ");
        tq.copy(pq).multiply(this.q2.setFromEuler(eu));
        const ox = Math.sin(a) * 0.5,
          oz = Math.cos(a) * 0.5;
        this.m4.compose(at(ox, topY - 0.2, topZ + oz), tq, tsc.set(0.36, 0.09, 1.1));
        fronds.setMatrixAt(i * 5 + k, this.m4);
        fronds.setColorAt(i * 5 + k, cc.set(frondC[(i + k) % 3]));
        this.m4.compose(at(ox, topY - 0.2, topZ + oz), tq, tsc.set(0.42, 0.15, 1.16));
        frondInk.setMatrixAt(i * 5 + k, this.m4);
      }
      for (let k = 0; k < 2; k++) {
        this.m4.compose(at(k ? 0.14 : -0.12, topY - 0.3, topZ + (k ? -0.08 : 0.1)), pq, tsc.setScalar(0.2));
        nuts.setMatrixAt(i * 2 + k, this.m4);
      }
      this.obst.push({ n, r: 0.42 });
    });
    s.add(trunks, fronds, frondInk, nuts);
    // rocks in the shallows
    const rocksAt: [number, number, number][] = [
      [40, 50, 0.7],
      [-6, -60, 0.65],
      [-48, 120, 0.8],
      [0, 170, 0.6],
      [-50, -100, 0.7],
    ];
    const rocks = new THREE.InstancedMesh(GEO.box, this.prop("#9aa6c8"), rocksAt.length * 2);
    const rocksInk = new THREE.InstancedMesh(GEO.box, ink, rocksAt.length * 2);
    rocksAt.forEach(([la, lo, sz], i) => {
      const n = sph(la, lo);
      pq.setFromUnitVectors(UP, n).multiply(tq.setFromAxisAngle(UP, i * 2.3));
      const at = (x: number, y: number, z: number) => tp.copy(n).multiplyScalar(R).add(off.set(x, y, z).applyQuaternion(pq));
      tq.copy(pq).multiply(this.q2.setFromEuler(eu.set(0.15, 0.4, 0.1)));
      this.m4.compose(at(0, sz * 0.3, 0), tq, tsc.set(sz * 1.3, sz, sz * 1.1));
      rocks.setMatrixAt(i * 2, this.m4);
      this.m4.compose(at(0, sz * 0.3, 0), tq, tsc.set(sz * 1.3 + 0.08, sz + 0.08, sz * 1.1 + 0.08));
      rocksInk.setMatrixAt(i * 2, this.m4);
      this.m4.compose(at(sz * 0.7, sz * 0.1, sz * 0.4), pq, tsc.set(sz * 0.6, sz * 0.5, sz * 0.6));
      rocks.setMatrixAt(i * 2 + 1, this.m4);
      this.m4.compose(at(sz * 0.7, sz * 0.1, sz * 0.4), pq, tsc.set(sz * 0.6 + 0.07, sz * 0.5 + 0.07, sz * 0.6 + 0.07));
      rocksInk.setMatrixAt(i * 2 + 1, this.m4);
      this.obst.push({ n, r: sz * 0.85 });
    });
    s.add(rocks, rocksInk);
    // small things, no bumps: starfish and shells on the sand, lilies and foam in the lagoons
    const rn = v3();
    const randN = () => {
      const z = this.dr() * 2 - 1,
        a = this.dr() * Math.PI * 2,
        k = Math.sqrt(1 - z * z);
      return rn.set(Math.cos(a) * k, z, Math.sin(a) * k);
    };
    const nS = 60;
    const shells = new THREE.InstancedMesh(GEO.box, toon("#ffffff", "#222222"), nS);
    const shC = cols("#ff7a6a", "#ffd0e0", "#ffb36b", "#fff6e0", "#ff9ad5");
    for (let i = 0; i < nS; i++) {
      let n = randN();
      for (let k = 0; k < 12 && !(this.isle(n) > 0.2 && !this.blocked(n, 0.3) && arcM(n, UP) > 2.4); k++) n = randN();
      pq.setFromUnitVectors(UP, n).multiply(tq.setFromAxisAngle(UP, this.dr() * 6));
      this.m4.compose(tp.copy(n).multiplyScalar(R + 0.08), pq, tsc.set(0.2, 0.07, 0.2));
      shells.setMatrixAt(i, this.m4);
      shells.setColorAt(i, shC[i % shC.length]);
    }
    s.add(shells);
    const nTu = 120;
    const tufts = new THREE.InstancedMesh(GEO.box, sway(new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonSteps() }), 0.8), nTu);
    const tuC = cols("#3fae46", "#5cc94e", "#8ee35b");
    for (let i = 0; i < nTu; i++) {
      let n = randN();
      for (let k = 0; k < 14 && !(this.isle(n) > 1.3 && !this.blocked(n, 0.3)); k++) n = randN();
      pq.setFromUnitVectors(UP, n).multiply(tq.setFromEuler(eu.set((this.dr() - 0.5) * 0.5, this.dr() * 6, (this.dr() - 0.5) * 0.5)));
      const h = 0.18 + this.dr() * 0.22;
      this.m4.compose(tp.copy(n).multiplyScalar(R + h / 2), pq, tsc.set(0.07, h, 0.07));
      tufts.setMatrixAt(i, this.m4);
      tufts.setColorAt(i, tuC[i % tuC.length]);
    }
    s.add(tufts);
    const nL = 26;
    const lilies = new THREE.InstancedMesh(GEO.disc, toon("#ffffff"), nL);
    const liC = cols("#5fd86a", "#ffffff", "#9ff3ff");
    for (let i = 0; i < nL; i++) {
      let n = randN();
      for (let k = 0; k < 12 && !(this.isle(n) < -0.6 && !this.blocked(n, 0.3)); k++) n = randN();
      pq.setFromUnitVectors(UP, n).multiply(tq.setFromAxisAngle(XX, -Math.PI / 2));
      this.m4.compose(tp.copy(n).multiplyScalar(R + SEA + 0.02), pq, tsc.setScalar(i % 3 === 1 ? 0.35 : 0.55));
      lilies.setMatrixAt(i, this.m4);
      lilies.setColorAt(i, liC[i % 3]);
    }
    s.add(lilies);
  }

  // PROOF FACTORY: a forge star, smoke and embers; two conveyor belts round the planet, stacks, ore, a furnace

  private skyFoundry(s: THREE.Scene) {
    // furnace light: a red-hot glow round the forge star, smoke-dark across, black and dim embers of stars behind
    const band = sph(-35, 60);
    spaceDome(s, "foundry", {
      seed: 3303,
      sun: this.sunDir,
      tone: ["#8a2c12", "#34101a", "#090408"],
      turn: 0.36,
      glare: ["#ff7a2a", 0.75, 28],
      clouds: [
        ["#ff3a2a", 0.3, 0.48, 0],
        ["#ff8a2a", 0.22, 0.58, 1],
        ["#7a2aa8", 0.24, 0.55, 2],
      ],
      band: { pole: band, color: "#ffb08a", k: 0.3, width: 0.22 },
      dust: 0.8,
    });
    this.starsAll(s, 3400, ["#ffffff", "#ffd9c4", "#ffb08a"], band, 0.85, 60);
    this.sunBall(s, "#ffe2a8", 44, [
      ["#ffb35a", 190, 0.85],
      ["#ff5a2a", 460, 0.5],
    ]);
    this.glowAt(v3(), R * 3.2, "#ff8a5a", 0.5);
    // a forge moon: dark slag, cracked with fire (the cracks glow on its night side too)
    const fr = rng(3505);
    const moon = new THREE.Group();
    moon.position.copy(sph(-30, 40)).multiplyScalar(210);
    moon.rotation.set(0.4, 0.2, 0.3);
    s.add(moon);
    const cracks: [number, number, number, number][] = [];
    for (let i = 0; i < 26; i++) {
      let x = fr() * 256,
        y = 16 + fr() * 96;
      for (let k = 0; k < 5; k++) {
        const nx = x + (fr() - 0.5) * 46,
          ny = y + (fr() - 0.5) * 26;
        cracks.push([x, y, nx, ny]);
        x = nx;
        y = ny;
      }
    }
    const slag = canvasTex(256, 128, (g) => {
      g.fillStyle = "#4a3640";
      g.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 60; i++) {
        g.fillStyle = i % 2 ? "rgba(30,18,26,0.5)" : "rgba(120,90,96,0.35)";
        g.fillRect(fr() * 256, fr() * 128, 6 + fr() * 26, 3 + fr() * 9);
      }
      g.strokeStyle = "#2a1016";
      g.lineWidth = 5;
      for (const [x, y, nx, ny] of cracks) (g.beginPath(), g.moveTo(x, y), g.lineTo(nx, ny), g.stroke());
    });
    this.farBall(26, slag, "#140a12", moon, 1.1);
    const lava = canvasTex(256, 128, (g) => {
      g.clearRect(0, 0, 256, 128);
      g.lineCap = "round";
      for (const [w, c] of [
        [4, "rgba(255,90,30,0.9)"],
        [1.6, "rgba(255,226,150,1)"],
      ] as const) {
        g.strokeStyle = c;
        g.lineWidth = w;
        for (const [x, y, nx, ny] of cracks) (g.beginPath(), g.moveTo(x, y), g.lineTo(nx, ny), g.stroke());
      }
    });
    const fire = new THREE.Mesh(new THREE.SphereGeometry(26.2, 44, 26), new THREE.MeshBasicMaterial({ map: lava, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    fire.userData.noShadow = true;
    fire.raycast = () => {};
    moon.add(fire);
    this.glowAt(moon.position.clone().multiplyScalar(1.03), 90, "#ff5a2a", 0.34);
    // an orbital rig: a truss, two red-hot radiators, a crane, a tank (merged), slowly turning far out
    const rigP = new THREE.Group();
    rigP.rotation.set(0.6, 0, 0.2);
    const rig = new THREE.Group();
    rig.position.set(95, 0, 0);
    rigP.add(rig);
    const rb = new Bake();
    const I = new THREE.Matrix4();
    rb.add(I, "box", "#5a5f74", 0, 0, 0, 2.2, 2.2, 26, 0.12);
    for (let k = -2; k <= 2; k++) rb.add(I, "box", "#ffb21e", 0, 0, k * 5.2, 2.7, 2.7, 0.7, 0.08);
    rb.add(I, "box", "#ff6a2a", 7, 0, -6, 11, 0.3, 6.5, 0, true);
    rb.add(I, "box", "#ff6a2a", -7, 0, -6, 11, 0.3, 6.5, 0, true);
    rb.add(I, "box", "#3a3f55", 7, 0, -6, 11.6, 0.5, 0.6, 0.08);
    rb.add(I, "box", "#3a3f55", -7, 0, -6, 11.6, 0.5, 0.6, 0.08);
    rb.add(I, "cyl", "#8a90a8", 0, 3.4, 6, 4.4, 4.4, 4.4, 0.12);
    rb.add(I, "cyl", "#5ff0e0", 0, 3.4, 6, 4.6, 0.6, 4.6, 0, true);
    rb.add(I, "box", "#ffd23f", 0, -4.2, 2, 0.9, 6.5, 0.9, 0.08);
    rb.add(I, "box", "#ffd23f", 0, -7.2, 5.5, 0.9, 0.9, 8, 0.08);
    rb.add(I, "box", "#2b2733", 0, -8.8, 9, 1.8, 2.2, 1.8, 0.08);
    rb.add(I, "box", "#ff3355", 0, 1.5, 13.2, 0.7, 0.7, 0.4, 0, true);
    rb.add(I, "box", "#3dff8a", 0, 1.5, -13.2, 0.7, 0.7, 0.4, 0, true);
    rb.build(rig);
    this.glowAt(v3(7, 0, -6), 14, "#ff6a2a", 0.4, rig);
    this.glowAt(v3(-7, 0, -6), 14, "#ff6a2a", 0.4, rig);
    s.add(rigP);
    this.drift.push({ o: rigP, ax: v3(0, 1, 0), v: 0.012 }, { o: rig, ax: v3(0, 0, 1), v: 0.05 });
    // ore barges crossing, far out
    this.convoy(s, 130, [-0.3, 2.2, 0.45], 0.017, "#5a5f74", "#ffb21e", "#ff7a2a");
    // embers rising off the forge: two shells of sparks swell outward in turn and fade (one is always in flight)
    const eC = cols("#ffd23f", "#ff8a2a", "#ff5a2a", "#fff1b0");
    for (let e = 0; e < 2; e++) {
      const n = 150;
      const pos = new Float32Array(n * 3),
        col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const z = fr() * 2 - 1,
          a = fr() * Math.PI * 2,
          k = Math.sqrt(1 - z * z),
          d = R + 16 + fr() * 26;
        pos.set([Math.cos(a) * k * d, z * d, Math.sin(a) * k * d], i * 3);
        const c = eC[i % eC.length],
          b = 0.5 + fr() * 0.5;
        col.set([c.r * b, c.g * b, c.b * b], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({ size: e ? 3 : 4, sizeAttenuation: false, vertexColors: true, map: this.dot(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const pts = new THREE.Points(g, mat);
      pts.frustumCulled = false;
      pts.raycast = () => {};
      s.add(pts);
      this.embers.push({ pts, mat, ph: e * 0.5 });
    }
    // a belt of glowing ore rocks round the planet, and two Z-Blocks
    const belt = new THREE.Group();
    const nb = 30;
    const rocks = new THREE.InstancedMesh(GEO.box, toon("#6a4a5a", "#5a1a08"), nb);
    rocks.userData.noShadow = true;
    const tq = new THREE.Quaternion(),
      tp = v3(),
      tsc = v3();
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + fr() * 0.2;
      const d = 32 + fr() * 10;
      tq.setFromEuler(new THREE.Euler(fr() * 3, fr() * 3, fr() * 3));
      const sz = 0.7 + fr() * 1.8;
      this.m4.compose(tp.set(Math.cos(a) * d, (fr() - 0.5) * 4, Math.sin(a) * d), tq, tsc.set(sz, sz * (0.6 + fr() * 0.5), sz));
      rocks.setMatrixAt(i, this.m4);
    }
    belt.add(rocks);
    belt.rotation.set(-0.45, 0, 0.3);
    s.add(belt);
    this.orbits.push(belt);
    const qo = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const qb = qBlock(2.2);
      const a = i * Math.PI + 0.3;
      qb.position.set(Math.cos(a) * 38, 0, Math.sin(a) * 38);
      qo.add(qb);
    }
    qo.rotation.set(0.7, 0, -0.4);
    s.add(qo);
    this.orbits.push(qo);
  }

  /** Is a spot `m` metres clear of the belts? */
  private offBelt(n: Vec, m: number) {
    for (const b of BELT_AX) if (Math.abs(Math.asin(clamp(n.dot(b), -1, 1))) * R < BELT_HW + m) return false;
    return true;
  }

  /** The belts at a spot: their push (m/s, tangent) into `out`; false when none is under it. */
  private beltAt(n: Vec, out: Vec) {
    out.set(0, 0, 0);
    if (!this.belts.length) return false;
    const lim = Math.sin(BELT_HW / R);
    let on = false;
    for (const b of this.belts) {
      if (Math.abs(n.dot(b.axis)) > lim) continue;
      this.sc.crossVectors(b.axis, n);
      const l = this.sc.length();
      if (l < 1e-6) continue;
      out.addScaledVector(this.sc, (b.dir * this.beltK * this.beltV) / l);
      on = true;
    }
    return on;
  }

  private decorFoundry(s: THREE.Scene) {
    // the belts: chevrons on dark rubber, hazard edges; lit studs along their sides
    const chev = canvasTex(
      256,
      256,
      (g) => {
        // (four texels to each of the old one: the arrows' edges stay sharp under the feet)
        g.scale(4, 4);
        g.fillStyle = "#2b2733";
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = "#3a3544";
        for (let x = 0; x < 64; x += 8) g.fillRect(x, 12, 3, 40);
        g.beginPath();
        g.moveTo(14, 16);
        g.lineTo(30, 16);
        g.lineTo(48, 32);
        g.lineTo(30, 48);
        g.lineTo(14, 48);
        g.lineTo(32, 32);
        g.closePath();
        g.lineJoin = "round";
        g.lineWidth = 3.4;
        g.strokeStyle = "#15121c";
        g.stroke();
        g.fillStyle = "#ffb21e";
        g.fill();
        // (a lit upper half: the arrow reads as a raised, glowing mark)
        g.fillStyle = "#ffd76a";
        g.beginPath();
        g.moveTo(14, 16);
        g.lineTo(30, 16);
        g.lineTo(48, 32);
        g.lineTo(32, 32);
        g.closePath();
        g.fill();
        for (let x = -16; x < 64; x += 16) {
          g.fillStyle = "#ffcf2e";
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x + 8, 0);
          g.lineTo(x + 14, 7);
          g.lineTo(x + 6, 7);
          g.closePath();
          g.fill();
          g.beginPath();
          g.moveTo(x, 57);
          g.lineTo(x + 8, 57);
          g.lineTo(x + 14, 64);
          g.lineTo(x + 6, 64);
          g.closePath();
          g.fill();
        }
        g.fillStyle = "#15121c";
        g.fillRect(0, 7, 64, 3);
        g.fillRect(0, 54, 64, 3);
      },
      true,
    );
    const circ = Math.PI * 2 * R;
    const tile = circ / Math.round(circ / 2.1);
    const nStud = Math.round(circ / 1.25);
    this.studMat = markGlow(new THREE.MeshToonMaterial({ color: "#ffd23f", emissive: "#a05a00", gradientMap: toonSteps() }), 0.5);
    const studs = new THREE.InstancedMesh(GEO.box, this.studMat, BELT_AX.length * 2 * nStud);
    const tq = new THREE.Quaternion(),
      tp = v3(),
      tsc = v3(),
      dn = v3(),
      tg = v3();
    BELT_AX.forEach((axis, bi) => {
      const tex = bi ? chev.clone() : chev;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(BELT_DIR[bi], 1);
      tex.needsUpdate = true;
      // (the arrows glow of their own light: read at once, in the shade too)
      const mat = markGlow(new THREE.MeshToonMaterial({ map: tex, emissiveMap: tex, gradientMap: toonSteps(), side: THREE.DoubleSide, emissive: "#8a8478" }), 0.28);
      const mesh = new THREE.Mesh(bandGeo(axis, BELT_HW, 0.09, tile), mat);
      mesh.renderOrder = 1;
      s.add(mesh);
      this.belts.push({ axis, dir: BELT_DIR[bi], tex, mat, tile });
      const P = v3().crossVectors(axis, Math.abs(axis.y) < 0.9 ? UP : XX).normalize();
      const Q = v3().crossVectors(axis, P);
      for (let i = 0; i < nStud; i++) {
        const th = (i / nStud) * Math.PI * 2;
        for (let side = 0; side < 2; side++) {
          const a = ((side ? 1 : -1) * (BELT_HW + 0.14)) / R;
          dn.copy(P).multiplyScalar(Math.cos(th)).addScaledVector(Q, Math.sin(th));
          tg.crossVectors(axis, dn);
          dn.multiplyScalar(Math.cos(a)).addScaledVector(axis, Math.sin(a)).normalize();
          stand(tq, dn, tg);
          this.m4.compose(tp.copy(dn).multiplyScalar(R + 0.08), tq, tsc.set(0.2, 0.14, 0.42));
          studs.setMatrixAt((bi * 2 + side) * nStud + i, this.m4);
        }
      }
    });
    s.add(studs);
    // the start's pad: a hazard ring round the plaza
    const pad = canvasTex(
      64,
      16,
      (g) => {
        g.fillStyle = "#15121c";
        g.fillRect(0, 0, 64, 16);
        g.fillStyle = "#ffcf2e";
        for (let x = -16; x < 64; x += 16) {
          g.beginPath();
          g.moveTo(x, 16);
          g.lineTo(x + 8, 16);
          g.lineTo(x + 16, 0);
          g.lineTo(x + 8, 0);
          g.closePath();
          g.fill();
        }
      },
      true,
    );
    const ringG = capGeo(2.35, 2.05, 0.07, 64, 1);
    // (the ring's u runs round it: remap the uv to the angle)
    const uv = ringG.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, ((i % 65) / 64) * 16, Math.floor(i / 65));
    const ring = new THREE.Mesh(ringG, new THREE.MeshToonMaterial({ map: pad, gradientMap: toonSteps() }));
    s.add(ring);
    // smokestacks (smoke from their tops), a furnace, ore heaps, crates: all clear of the belts
    const stacksAt: [number, number, number][] = [
      [40, 0, 3.0],
      [-40, 180, 3.4],
      [8, -100, 2.8],
    ];
    for (const [la, lo, h] of stacksAt) {
      const n = sph(la, lo);
      if (!this.offBelt(n, 1.0)) continue;
      const g = new THREE.Group();
      boxIn(g, "#5a5f74", 1.4, 0.4, 1.4, 0, 0.2, 0);
      const st = new THREE.Mesh(GEO.cyl, toon("#b8503e"));
      st.scale.set(1.0, h, 1.0);
      st.position.y = h / 2 + 0.3;
      outline(st, 0.04);
      g.add(st);
      const band = new THREE.Mesh(GEO.cyl, toon("#ffd23f", "#5a3a00"));
      band.scale.set(1.06, 0.22, 1.06);
      band.position.y = h * 0.62;
      g.add(band);
      const rim = new THREE.Mesh(GEO.cyl, toon("#2b2733"));
      rim.scale.set(1.12, 0.2, 1.12);
      rim.position.y = h + 0.32;
      outline(rim, 0.03);
      g.add(rim);
      const fire = new THREE.Mesh(GEO.cyl, glow("#ff8a2a", 0.9));
      fire.scale.set(0.8, 0.05, 0.8);
      fire.position.y = h + 0.43;
      g.add(fire);
      this.put(g, n, la);
      this.bk.absorb(g);
      this.obst.push({ n, r: 0.72 });
      this.stacks.push(v3().copy(n).multiplyScalar(R + h + 0.6));
      this.stackNs.push(n);
    }
    // the furnace: a squat block, a glowing mouth, a Z-Block on top
    const fuN = sph(28, 180);
    if (this.offBelt(fuN, 1.2)) {
      const fu = new THREE.Group();
      boxIn(fu, "#4a4f63", 2.0, 1.5, 1.7, 0, 0.75, 0);
      boxIn(fu, "#2b2733", 2.2, 0.25, 1.9, 0, 1.6, 0, 0.03);
      boxIn(fu, "#ff7a2a", 1.0, 0.6, 0.06, 0, 0.6, 0.86, 0, "#ff5a00");
      const mouth = new THREE.Mesh(GEO.box, glow("#ffb35a", 0.5, true));
      mouth.scale.set(1.6, 1.2, 0.4);
      mouth.position.set(0, 0.6, 1.0);
      fu.add(mouth);
      const qb = qBlock(0.9);
      qb.position.y = 2.25;
      fu.add(qb);
      seeThrough(qb.material as THREE.Material);
      this.topQ = qb;
      this.put(fu, fuN, Math.PI);
      this.bk.absorb(fu);
      this.furnace = fu;
      this.fuN = fuN;
      fu.updateMatrixWorld(true);
      this.mouth = mouth.getWorldPosition(v3());
      this.mouthN.copy(fuN);
      this.obst.push({ n: fuN, r: 1.2 });
    }
    // ore heaps: glowing violet and aqua Q-ore in a pile (instanced)
    const oreAt: [number, number][] = [
      [-60, 90],
      [-62, -90],
      [8, 40],
      [-30, 0],
      [60, 180],
      [-8, 140],
    ];
    const ores = new THREE.InstancedMesh(GEO.box, this.prop("#ffffff", "#3a1a6a"), oreAt.length * 4);
    const oreInk = new THREE.InstancedMesh(GEO.box, this.inkSee, oreAt.length * 4);
    const oreC = cols("#b99bff", "#5ff0e0", "#ffd23f", "#9a8fb8");
    const pq = new THREE.Quaternion(),
      off = v3();
    let k = 0;
    for (const [la, lo] of oreAt) {
      const n = sph(la, lo);
      if (!this.offBelt(n, 0.9) || this.blocked(n, 0.6) || arcM(n, UP) < 3.2) continue;
      pq.setFromUnitVectors(UP, n).multiply(tq.setFromAxisAngle(UP, la + lo));
      const parts: [number, number, number, number][] = [
        [0, 0.35, 0, 0.75],
        [0.45, 0.22, 0.2, 0.5],
        [-0.35, 0.2, 0.3, 0.45],
        [0.05, 0.85, -0.05, 0.45],
      ];
      for (const [x, y, z, sz] of parts) {
        const at = tp.copy(n).multiplyScalar(R).add(off.set(x, y, z).applyQuaternion(pq));
        this.q2.copy(pq).multiply(this.q.setFromAxisAngle(UP, x * 3 + 0.4));
        this.m4.compose(at, this.q2, tsc.setScalar(sz));
        ores.setMatrixAt(k, this.m4);
        ores.setColorAt(k, oreC[k % oreC.length]);
        this.m4.compose(at, this.q2, tsc.setScalar(sz + 0.08));
        oreInk.setMatrixAt(k, this.m4);
        k++;
      }
      this.obst.push({ n, r: 0.75 });
    }
    ores.count = oreInk.count = k;
    s.add(ores, oreInk);
    // crates (instanced), in twos
    const crateAt: [number, number][] = [
      [62, 40],
      [62, -40],
      [-75, 0],
      [-75, 180],
      [30, -150],
      [-20, -160],
    ];
    const crates = new THREE.InstancedMesh(GEO.box, this.prop("#c98a4a"), crateAt.length * 2);
    const crateInk = new THREE.InstancedMesh(GEO.box, this.inkSee, crateAt.length * 2);
    k = 0;
    for (const [la, lo] of crateAt) {
      const n = sph(la, lo);
      if (!this.offBelt(n, 0.9) || this.blocked(n, 0.6) || arcM(n, UP) < 3.2) continue;
      pq.setFromUnitVectors(UP, n).multiply(tq.setFromAxisAngle(UP, lo * 0.05));
      for (let j = 0; j < 2; j++) {
        const sz = j ? 0.6 : 0.85;
        const at = tp.copy(n).multiplyScalar(R).add(off.set(j * 0.1, j ? 1.15 : 0.43, j * 0.05).applyQuaternion(pq));
        this.q2.copy(pq).multiply(this.q.setFromAxisAngle(UP, j * 0.5));
        this.m4.compose(at, this.q2, tsc.setScalar(sz));
        crates.setMatrixAt(k, this.m4);
        this.m4.compose(at, this.q2, tsc.setScalar(sz + 0.07));
        crateInk.setMatrixAt(k, this.m4);
        k++;
      }
      this.obst.push({ n, r: 0.62 });
    }
    crates.count = crateInk.count = k;
    s.add(crates, crateInk);
    // rivets and bolts on the plates, no bumps
    const rn = v3();
    const nR = 140;
    const bolts = new THREE.InstancedMesh(GEO.box, toon("#9aa0b8"), nR);
    for (let i = 0; i < nR; i++) {
      for (let t = 0; t < 12; t++) {
        const z = this.dr() * 2 - 1,
          a = this.dr() * Math.PI * 2,
          kk = Math.sqrt(1 - z * z);
        rn.set(Math.cos(a) * kk, z, Math.sin(a) * kk);
        if (this.offBelt(rn, 0.3) && !this.blocked(rn, 0.3) && arcM(rn, UP) > 2.5) break;
      }
      pq.setFromUnitVectors(UP, rn).multiply(tq.setFromAxisAngle(UP, this.dr() * 6));
      this.m4.compose(tp.copy(rn).multiplyScalar(R + 0.06), pq, tsc.set(0.14, 0.06, 0.14));
      bolts.setMatrixAt(i, this.m4);
    }
    s.add(bolts);
  }

  /** The belts run (and carry the flags on them); before each reversal the klaxon, the studs blink red; then they turn round. */
  private beltStep(dt: number, live: boolean) {
    if (!this.belts.length) return;
    if (live && !this.over) {
      this.beltV += (BELT_V[this.hurry ? 1 : 0] - this.beltV) * Math.min(1, dt * 0.8);
      const ft = BELT_FLIP[this.flipI];
      if (ft !== undefined) {
        if (this.t >= ft - BELT_WARN && this.flipWarned !== this.flipI) {
          this.flipWarned = this.flipI;
          this.flashBan(T("BELTS REVERSE!", "传送带反转！"), T("they turn round", "马上掉头"), "#ffb21e", 1.5);
          for (let i = 0; i < 4; i++) (beep(392, 0.22, "square", 0.16, 0, i * 0.4), beep(311, 0.18, "square", 0.16, 0, i * 0.4 + 0.2));
        }
        if (this.t >= ft) {
          this.flipI++;
          this.beltSign = -this.beltSign;
          sfx.whoosh();
          this.cam.shake(0.12);
          // (sparks fly off the belts near the camera as they turn)
          for (const b of this.belts) {
            this.c.copy(this.cn).addScaledVector(b.axis, -this.cn.dot(b.axis));
            if (this.c.lengthSq() < 1e-4) continue;
            this.c.normalize();
            for (let k = -3; k <= 3; k++) {
              this.d.copy(this.c).applyAxisAngle(b.axis, k * 0.16);
              B_SPARK2.up = this.d;
              this.fx.burst(this.e.copy(this.d).multiplyScalar(R + 0.15), 5, SPARKS, B_SPARK2);
            }
          }
        }
      }
    }
    const was = this.beltK;
    this.beltK += clamp(this.beltSign - this.beltK, -dt * 3.2, dt * 3.2);
    const warn = live && BELT_FLIP[this.flipI] !== undefined && this.t >= BELT_FLIP[this.flipI] - BELT_WARN;
    const blink = warn && Math.sin(this.t * 18) > 0;
    for (const b of this.belts) {
      const sgn = b.dir * this.beltK;
      // (the chevrons point the way it runs: flipped as it goes through still)
      if (Math.sign(sgn) !== Math.sign(b.tex.repeat.x) && sgn !== 0) b.tex.repeat.x = Math.sign(sgn);
      b.tex.offset.x -= (Math.abs(sgn) * this.beltV * dt) / b.tile;
      if (blink !== this.blinkOn) b.mat.color.setHex(blink ? 0xff7a7a : 0xffffff);
    }
    if (this.studMat && blink !== this.blinkOn) {
      this.studMat.color.setHex(blink ? 0xff3355 : 0xffd23f);
      this.studMat.emissive.setHex(blink ? 0xc00020 : 0xa05a00);
    }
    this.blinkOn = blink;
    if (was !== this.beltK && Math.sign(was) !== Math.sign(this.beltK)) snd.bonk(0.08);
    // the flags riding them
    if (!this.started) return;
    for (const f of this.flags) {
      if (f.state !== S_LIVE && f.state !== S_RISE) continue;
      const lim = Math.sin(BELT_HW / R);
      for (const b of this.belts) {
        if (Math.abs(f.n.dot(b.axis)) > lim) continue;
        f.n.applyQuaternion(this.q.setFromAxisAngle(b.axis, (b.dir * this.beltK * this.beltV * dt) / R)).normalize();
      }
    }
    // smoke from the stacks
    this.smokeT -= dt;
    if (this.smokeT <= 0 && this.stacks.length) {
      this.smokeT = 0.09;
      const at = this.stacks[Math.floor(Math.random() * this.stacks.length)];
      B_SMOKE.up = this.a.copy(at).normalize();
      this.fx.burst(at, 1, SMOKE, B_SMOKE);
    }
  }

  // ---- set dressing and background life (all three worlds) -----------------------------------------

  /** A frame standing at `n` (its +y up the normal), turned `yaw`, `lift` up. */
  private frame(n: Vec, yaw = 0, lift = 0) {
    const q = new THREE.Quaternion().setFromUnitVectors(UP, n).multiply(this.q.setFromAxisAngle(UP, yaw));
    return new THREE.Matrix4().compose(v3().copy(n).multiplyScalar(R + lift), q, v3(1, 1, 1));
  }
  /** A frame standing at `n` facing `f` (tangent). */
  private frameF(n: Vec, f: Vec, lift = 0) {
    const q = stand(new THREE.Quaternion(), n, f);
    return new THREE.Matrix4().compose(v3().copy(n).multiplyScalar(R + lift), q, v3(1, 1, 1));
  }
  /** A random spot on the planet that passes `ok` (null after `tries`). */
  private findSpot(ok: (n: Vec) => boolean, tries = 30) {
    const n = v3();
    for (let i = 0; i < tries; i++) {
      const z = this.dr() * 2 - 1,
        a = this.dr() * Math.PI * 2,
        k = Math.sqrt(1 - z * z);
      n.set(Math.cos(a) * k, z, Math.sin(a) * k);
      if (ok(n)) return n;
    }
    return null;
  }
  /** `n` moved `m` metres along the surface toward `to`. */
  private along(n: Vec, to: Vec, m: number) {
    const out = n.clone();
    toward(n, to, this.b);
    if (this.b.lengthSq() > 0.5) slide(out, this.b, m / R);
    return out;
  }

  private dotTex: THREE.Texture | null = null;
  private dot() {
    return (this.dotTex ??= canvasTex(32, 32, (g) => {
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.35, "rgba(255,255,255,0.8)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 32, 32);
    }));
  }

  /** Shooting stars (all worlds): streaks across the sky ahead, now and then. */
  private makeShooting(color: string) {
    const mesh = new THREE.InstancedMesh(GEO.box, glow(color, 0.9, true), 3);
    mesh.frustumCulled = false;
    mesh.count = 3;
    this.w.scene.add(mesh);
    this.shoot = { mesh, t: [9, 9, 9], from: [v3(), v3(), v3()], dir: [v3(), v3(), v3()], next: 1.5 };
    for (let i = 0; i < 3; i++) (this.m4.makeScale(0, 0, 0), mesh.setMatrixAt(i, this.m4));
  }
  private stepShooting(dt: number) {
    const sh = this.shoot;
    if (!sh) return;
    sh.next -= dt;
    if (sh.next <= 0) {
      sh.next = 1.6 + Math.random() * 2.6;
      const i = sh.t.indexOf(Math.max(...sh.t));
      const rt = this.a.crossVectors(this.cf, this.cn);
      sh.from[i]
        .copy(this.cf)
        .multiplyScalar(0.9)
        .addScaledVector(this.cn, 0.15 + Math.random() * 0.35)
        .addScaledVector(rt, (Math.random() - 0.5) * 1.6)
        .normalize()
        .multiplyScalar(260);
      sh.dir[i].copy(rt).multiplyScalar(Math.random() < 0.5 ? -1 : 1).addScaledVector(this.cn, -0.4 - Math.random() * 0.4).normalize();
      sh.t[i] = 0;
    }
    for (let i = 0; i < 3; i++) {
      sh.t[i] += dt;
      const k = sh.t[i] / 0.75;
      if (k >= 1) {
        this.m4.makeScale(0, 0, 0);
      } else {
        this.e.copy(sh.from[i]).addScaledVector(sh.dir[i], k * 120);
        this.q.setFromUnitVectors(ZAX, sh.dir[i]);
        const len = 22 * Math.sin(k * Math.PI);
        this.m4.compose(this.e, this.q, this.sc.set(0.9, 0.9, Math.max(0.01, len)));
      }
      sh.mesh.setMatrixAt(i, this.m4);
    }
    sh.mesh.instanceMatrix.needsUpdate = true;
  }

  // GENESIS MEADOW: a windmill, bushes, flower beds, stepping stones, a picnic, butterflies, a satellite

  private dressMeadow(s: THREE.Scene) {
    const bk = this.bk;
    // the windmill by the hut (its sails turn)
    const wmN = sph(-20, -50);
    if (!this.blocked(wmN, 0.9)) {
      const wm = new THREE.Group();
      this.put(wm, wmN, 0.9);
      const f = this.frame(wmN, 0.9);
      bk.add(f, "cyl", "#e9dcc8", 0, 0.55, 0, 1.15, 1.1, 1.15);
      bk.add(f, "box", "#fff4e2", 0, 1.45, 0, 0.9, 0.8, 0.9);
      bk.add(f, "cone", "#ff6a5f", 0, 2.15, 0, 1.35, 0.7, 1.35, 0.035, false, 0, Math.PI / 4, 0);
      bk.add(f, "box", "#7a4a2a", 0, 0.42, 0.57, 0.36, 0.6, 0.05, 0.02);
      bk.add(f, "box", "#ffd86a", 0, 1.5, 0.46, 0.26, 0.26, 0.05, 0.02, true);
      const sails = new THREE.Group();
      sails.position.set(0, 1.55, 0.55);
      wm.add(sails);
      const sb = new Bake();
      const I = new THREE.Matrix4();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        sb.add(I, "box", "#8a5a3a", -Math.sin(a) * 0.62, Math.cos(a) * 0.62, 0, 0.09, 1.2, 0.05, 0.02, false, 0, 0, a);
        sb.add(I, "box", k % 2 ? "#fff2dc" : "#ffd0c4", -Math.sin(a) * 0.7 + Math.cos(a) * 0.17, Math.cos(a) * 0.7 + Math.sin(a) * 0.17, 0.03, 0.3, 0.95, 0.02, 0.015, false, 0, 0, a);
      }
      sb.add(I, "ball", "#ffd23f", 0, 0, 0.05, 0.24, 0.24, 0.24, 0.02);
      sb.build(sails);
      this.sails = sails;
      this.obst.push({ n: wmN, r: 0.72 });
    }
    // bushes at the trees' feet (inside their bump), flower beds round the tower
    const bushC = ["#2fa84f", "#48c45e", "#3fbf5a", "#5fd86a"];
    this.treeNs.forEach((n, i) => {
      const f = this.frame(n, i * 1.3);
      bk.add(f, "box", bushC[i % 4], 0.42, 0.22, 0.16, 0.5, 0.42, 0.46, 0.03, false, 0, 0.4, 0);
      bk.add(f, "box", bushC[(i + 2) % 4], -0.3, 0.17, -0.36, 0.38, 0.32, 0.36, 0.03, false, 0, -0.3, 0);
      if (i % 3 === 0) bk.add(f, "box", "#ff8fc8", 0.44, 0.47, 0.1, 0.12, 0.08, 0.12, 0, true);
    });
    const fc = ["#ff5fa2", "#ffd23f", "#9fd3ff", "#ffffff", "#ff8a3d"];
    const tf = this.frame(this.towerN, 0.3);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = Math.cos(a) * 1.12,
        z = Math.sin(a) * 1.12;
      bk.add(tf, "box", "#6a4a32", x, 0.05, z, 0.42, 0.1, 0.42, 0);
      bk.add(tf, "box", "#3fae46", x, 0.17, z, 0.06, 0.18, 0.06, 0);
      bk.add(tf, "box", fc[k % 5], x, 0.3, z, 0.16, 0.12, 0.16, 0.015);
    }
    // stepping stones from the plaza to the tower, a ring of pebbles round the pond
    const toTower = arcM(UP, this.towerN);
    for (let d = 2.1, i = 0; d < toTower - 1.5; d += 0.72, i++) {
      const n = this.along(UP, this.towerN, d);
      toward(n, this.towerN, this.c);
      const f = this.frameF(n, this.c);
      bk.add(f, "cyl", i % 2 ? "#e4dcf6" : "#d2c8ee", (i % 2 ? 0.16 : -0.16), 0.03, 0, 0.55, 0.06, 0.45, 0.02);
    }
    for (let k = 0; k < 30; k++) {
      const n = this.pondN.clone();
      stand(this.q2, n, UP);
      this.c.set(Math.cos(k * 0.2094), 0, Math.sin(k * 0.2094)).applyQuaternion(this.q2);
      flat(this.c, n).normalize();
      slide(n, this.c, 3.62 / R);
      if (this.blocked(n, 0.2)) continue;
      bk.add(this.frame(n, k), "box", k % 3 ? "#ece6f6" : "#b9b0d8", 0, 0.04, 0, 0.3 + (k % 2) * 0.1, 0.08, 0.24, 0.015);
    }
    // a picnic by a tree: a checked blanket, a basket, two apples
    const picN = this.along(sph(8, 66), UP, 1.35);
    if (!this.blocked(picN, 0.5)) {
      const f = this.frame(picN, 0.5);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) bk.add(f, "box", (i + j) % 2 ? "#ff5a5f" : "#fff6ea", (i - 1.5) * 0.3, 0.015, (j - 1.5) * 0.3, 0.3, 0.02, 0.3, 0);
      bk.add(f, "box", "#b07a46", 0.25, 0.14, 0.2, 0.34, 0.22, 0.24, 0.02);
      bk.add(f, "box", "#7a4a2a", 0.25, 0.32, 0.2, 0.04, 0.16, 0.24, 0.012);
      bk.add(f, "ball", "#ff3b4f", -0.25, 0.08, -0.2, 0.14, 0.14, 0.14, 0.012);
      bk.add(f, "ball", "#8ee35b", -0.08, 0.08, -0.3, 0.13, 0.13, 0.13, 0.012);
    }
    // flower patches and pebbles all over the grass (merged: free)
    const patchC = ["#fff27a", "#ffffff", "#ff9ad5", "#9fd3ff", "#ffb36b", "#d9b8ff"];
    for (let i = 0; i < 46; i++) {
      const n = this.findSpot((m) => !this.blocked(m, 0.5) && arcM(m, this.pondN) > 3.9 && arcM(m, UP) > 2.2, 20);
      if (!n) continue;
      const f = this.frame(n, i);
      if (i % 3 === 2) {
        for (let k = 0; k < 3; k++) bk.add(f, "box", k % 2 ? "#cfc8e6" : "#e9e4f6", (k - 1) * 0.22, 0.04, (k % 2) * 0.16, 0.2 - k * 0.03, 0.08, 0.16, 0.012, false, 0, k, 0);
        continue;
      }
      const c = patchC[i % patchC.length];
      for (let k = 0; k < 6; k++) {
        const a = k * 1.05 + i,
          d = 0.12 + (k % 3) * 0.13;
        bk.add(f, "box", "#3fae46", Math.cos(a) * d, 0.07, Math.sin(a) * d, 0.04, 0.14, 0.04, 0);
        bk.add(f, "box", k === 5 ? "#ffd23f" : c, Math.cos(a) * d, 0.16, Math.sin(a) * d, 0.11, 0.07, 0.11, 0);
      }
    }
    // butterflies flitting round the flowers
    const nB = 8;
    this.flies = new THREE.InstancedMesh(GEO.box, toon("#ffffff", "#222222"), nB * 2);
    this.flies.frustumCulled = false;
    const bc = cols("#ff8fc8", "#ffd23f", "#9fd3ff", "#ffffff", "#b99bff", "#ff8a3d");
    for (let i = 0; i < nB; i++) {
      const n = this.findSpot((m) => !this.blocked(m, 0.6) && arcM(m, this.pondN) > 3.8 && arcM(m, UP) > 2.5) ?? sph(20, i * 45);
      this.flyHome.push(n.clone());
      this.flies.setColorAt(i * 2, bc[i % bc.length]);
      this.flies.setColorAt(i * 2 + 1, bc[i % bc.length]);
    }
    s.add(this.flies);
    // a little Q satellite going round, its light blinking
    const sat = new THREE.Group();
    const sb2 = new Bake();
    const I = new THREE.Matrix4();
    sb2.add(I, "box", "#e8e6f4", 0, 0, 0, 1.1, 0.8, 0.8, 0.05);
    sb2.add(I, "box", "#3a7bff", 1.55, 0, 0, 1.8, 0.06, 0.8, 0.04, true);
    sb2.add(I, "box", "#3a7bff", -1.55, 0, 0, 1.8, 0.06, 0.8, 0.04, true);
    sb2.add(I, "cone8", "#ffd23f", 0, 0.62, 0, 0.7, 0.4, 0.7, 0.04, false, Math.PI, 0, 0);
    sb2.build(sat);
    const blink = new THREE.Mesh(GEO.ball, glow("#ff4d6d"));
    blink.scale.setScalar(0.3);
    blink.position.set(0, -0.5, 0);
    sat.add(blink);
    const orbit = new THREE.Group();
    sat.position.set(27, 0, 0);
    orbit.add(sat);
    orbit.rotation.set(0.6, 0, -0.4);
    s.add(orbit);
    this.sat = { orbit, sat, blink };
  }

  private lifeMeadow(dt: number, t: number) {
    if (this.sails) this.sails.rotation.z -= dt * 1.5;
    if (this.foamMat) this.foamMat.opacity = 0.42 + Math.sin(t * 1.5) * 0.16;
    if (this.sat) {
      this.sat.orbit.rotation.y += dt * 0.12;
      this.sat.sat.rotation.x += dt * 0.4;
      this.sat.blink.visible = Math.sin(t * 5) > 0.3;
    }
    const fl = this.flies;
    if (fl) {
      for (let i = 0; i < this.flyHome.length; i++) {
        const home = this.flyHome[i];
        const a = t * (0.5 + (i % 3) * 0.12) + i * 2.1;
        stand(this.q2, home, UP);
        this.c.set(Math.cos(a), 0, Math.sin(a)).applyQuaternion(this.q2);
        flat(this.c, home).normalize();
        this.e.copy(home);
        slide(this.e, this.c, (1.1 + Math.sin(t * 0.7 + i) * 0.4) / R);
        this.d.crossVectors(home, this.c).normalize();
        const h = 1.0 + Math.sin(t * 2.3 + i) * 0.3;
        stand(this.q, this.e, this.d);
        const flap = Math.sin(t * 22 + i * 3) * 0.9;
        for (let w = 0; w < 2; w++) {
          const sgn = w ? 1 : -1;
          this.q2.copy(this.q).multiply(this.q3.setFromAxisAngle(ZAX, sgn * flap));
          this.a.set(sgn * 0.09, 0, 0).applyQuaternion(this.q2);
          this.b.copy(this.e).multiplyScalar(R + h).add(this.a);
          this.m4.compose(this.b, this.q2, this.sc.set(0.17, 0.02, 0.14));
          fl.setMatrixAt(i * 2 + w, this.m4);
        }
      }
      fl.instanceMatrix.needsUpdate = true;
    }
  }

  // ORCHARD TIDE: surf round the islands, glints on the sea, gulls, the lighthouse's beam, buoys, coral, a beach

  private dressTide(s: THREE.Scene) {
    const bk = this.bk;
    // the surf: a foam ring round each island and a fainter swell outside it (two draws, they breathe)
    const foam: THREE.BufferGeometry[] = [];
    const swell: THREE.BufferGeometry[] = [];
    const qq = new THREE.Quaternion();
    for (const [la, lo, r] of TIDE_ISLES) {
      qq.setFromUnitVectors(UP, sph(la, lo, this.c));
      foam.push(capGeo(r + 0.45, Math.max(0.2, r - 0.1), SEA + 0.03, 56, 1).applyQuaternion(qq));
      swell.push(shoreGeo(r + 0.1, r + 1.9, SEA + 0.025).applyQuaternion(qq));
    }
    const ring = (list: THREE.BufferGeometry[], color: string, op: number) => {
      const g = mergeGeometries(list, false)!;
      for (const x of list) x.dispose();
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false });
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = 1;
      s.add(m);
      return mat;
    };
    this.foamMat = ring(foam, "#ffffff", 0.6);
    // the swell: lines of foam rolling in onto every island (one draw: their picture slides along the band, inward)
    this.shoreTex = canvasTex(
      64,
      64,
      (g) => {
        g.clearRect(0, 0, 64, 64);
        for (let x = 0; x < 64; x++) {
          const y = 40 + Math.sin((x / 64) * Math.PI * 2) * 5 + Math.sin((x / 64) * Math.PI * 4 + 1) * 2;
          // (the crest, then its wash fading behind it: out to sea, up the picture)
          g.fillStyle = "rgba(255,255,255,0.95)";
          g.fillRect(x, y, 1, 5);
          for (let k = 1; k <= 14; k++) {
            g.fillStyle = `rgba(255,255,255,${(0.42 * (1 - k / 14)).toFixed(3)})`;
            g.fillRect(x, y - k, 1, 1);
          }
        }
      },
      true,
    );
    {
      const g = mergeGeometries(swell, false)!;
      for (const x of swell) x.dispose();
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.shoreTex, vertexColors: true, transparent: true, depthWrite: false }));
      m.renderOrder = 1;
      m.raycast = () => {};
      s.add(m);
    }
    // glints on the water (two twinkling layers)
    this.glints = [0, 1].map(() => {
      const n = 140;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const m = this.findSpot((x) => this.isle(x) < -0.5, 20) ?? v3(0, -1, 0);
        pos.set([m.x * (R + SEA + 0.04), m.y * (R + SEA + 0.04), m.z * (R + SEA + 0.04)], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, color: "#ffffff", map: this.dot(), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
      const pts = new THREE.Points(g, mat);
      pts.raycast = () => {};
      s.add(pts);
      return mat;
    });
    // coral and weed in the shallows (merged)
    const coralC = ["#ff7aa8", "#ffb36b", "#b48cff", "#ff5a7a", "#ffe066"];
    for (let i = 0; i < 70; i++) {
      const n = this.findSpot((x) => {
        const k = this.isle(x);
        return k < -0.15 && k > -1.4 && !this.blocked(x, 0.3);
      }, 24);
      if (!n) continue;
      const f = this.frame(n, i * 0.7, SEA - 0.06);
      if (i % 2) bk.add(f, "box", coralC[i % 5], 0, 0.06, 0, 0.18 + (i % 3) * 0.06, 0.2, 0.16, 0.015, false, 0.2, 0.3, 0.1);
      else for (let k = 0; k < 3; k++) bk.add(f, "box", k % 2 ? "#3fbf6a" : "#2fa85a", (k - 1) * 0.1, 0.16, (k % 2) * 0.06, 0.05, 0.34 - k * 0.06, 0.05, 0, false, (k - 1) * 0.2, 0, (k - 1) * 0.25);
    }
    // the beach by the hut: two umbrellas (their poles bump), towels, a deck chair
    const umbs: [number, number, string][] = [
      [8, -93, "#ff5a5f"],
      [17, -93, "#2fb8c8"],
    ];
    umbs.forEach(([la, lo, c], i) => {
      const n = sph(la, lo);
      if (this.blocked(n, 0.4) || this.isle(n) < 0.4) return;
      const f = this.frame(n, i * 2);
      bk.add(f, "cyl", "#f6f2ff", 0, 0.8, 0, 0.07, 1.6, 0.07, 0.02);
      bk.add(f, "cone8", c, 0, 1.68, 0, 1.6, 0.42, 1.6, 0.03);
      bk.add(f, "cone8", "#ffffff", 0, 1.86, 0, 0.62, 0.2, 0.62, 0.02);
      bk.add(f, "box", i ? "#ffd23f" : "#9fd3ff", 0.55, 0.015, 0.1, 0.55, 0.02, 1.05, 0);
      bk.add(f, "box", "#ffffff", 0.55, 0.02, 0.1, 0.55, 0.02, 0.15, 0);
      if (i === 0) {
        bk.add(f, "box", "#f2e6d0", -0.6, 0.18, 0.1, 0.5, 0.06, 0.9, 0.02, false, -0.25, 0, 0);
        bk.add(f, "box", "#8a5a3a", -0.6, 0.09, 0.1, 0.5, 0.18, 0.06, 0.015);
      }
      this.obst.push({ n, r: 0.2 });
    });
    // tiki torches at the boardwalk's corners (flames flicker)
    this.torches = new THREE.InstancedMesh(GEO.box, glow("#ffb03a", 0.9, true), 4);
    this.torches.frustumCulled = false;
    this.torches.userData.noShadow = true;
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const n = v3(0, 1, 0);
      slide(n, this.c.set(Math.sin(a), 0, Math.cos(a)), 2.25 / R);
      const f = this.frame(n, a);
      bk.add(f, "cyl", "#8a5a3a", 0, 0.65, 0, 0.12, 1.3, 0.12, 0.02);
      bk.add(f, "box", "#e9b04a", 0, 1.36, 0, 0.26, 0.24, 0.26, 0.025, false, 0, 0.6, 0);
      this.torchAt.push(v3().copy(n).multiplyScalar(R + 1.62));
      this.torchN.push(n.clone());
      // (its light: a warm halo that flickers with the flame)
      this.torchGlow.push(this.glowAt(this.torchAt[k], 2.6, "#ffb24a", 0.55));
      this.obst.push({ n, r: 0.2 });
    }
    s.add(this.torches);
    // gulls wheeling over the islands
    const nG = 6;
    this.gulls = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), nG * 3);
    this.gulls.frustumCulled = false;
    const gw = new THREE.Color("#ffffff"),
      gg = new THREE.Color("#c9d2e8");
    for (let i = 0; i < nG; i++) {
      this.gulls.setColorAt(i * 3, gw);
      this.gulls.setColorAt(i * 3 + 1, gg);
      this.gulls.setColorAt(i * 3 + 2, gg);
    }
    s.add(this.gulls);
    // buoys bobbing in the lagoons
    this.buoys = new THREE.InstancedMesh(GEO.cyl, toon("#ffffff"), 12);
    this.buoys.frustumCulled = false;
    for (let i = 0; i < 6; i++) {
      const n = this.findSpot((x) => this.isle(x) < -1.3 && !this.blocked(x, 0.5) && arcM(x, UP) > 4) ?? sph(-10, i * 60);
      this.buoyN.push(n.clone());
      this.buoys.setColorAt(i * 2, new THREE.Color(i % 2 ? "#ff5a5f" : "#ffb21e"));
      this.buoys.setColorAt(i * 2 + 1, gw);
    }
    s.add(this.buoys);
    // the lighthouse's beam, sweeping round
    if (this.lighthouse) {
      const beamMat = new THREE.MeshBasicMaterial({ map: this.beamTex, color: "#fff1b0", transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.12, 9, 16, 1, true).translate(0, -4.5, 0).rotateX(-Math.PI / 2), beamMat);
      beam.raycast = () => {};
      const piv = new THREE.Group();
      piv.position.y = 4.8;
      piv.add(beam);
      this.lighthouse.add(piv);
      this.lhBeam = piv;
    }
  }

  private lifeTide(dt: number, t: number) {
    if (this.foamMat) this.foamMat.opacity = 0.5 + Math.sin(t * 1.6) * 0.18;
    this.glints.forEach((m, i) => (m.opacity = 0.35 + 0.55 * Math.max(0, Math.sin(t * 2.6 + i * Math.PI))));
    if (this.lhBeam) this.lhBeam.rotation.y += dt * 1.1;
    // torches
    const tc = this.torches;
    if (tc) {
      for (let k = 0; k < this.torchAt.length; k++) {
        const fl = 0.85 + Math.sin(t * 17 + k * 2) * 0.12 + Math.sin(t * 29 + k) * 0.08;
        this.q.setFromUnitVectors(UP, this.torchN[k]).multiply(this.q2.setFromAxisAngle(UP, t * 3 + k));
        this.m4.compose(this.torchAt[k], this.q, this.sc.set(0.2 * fl, 0.34 * fl, 0.2 * fl));
        tc.setMatrixAt(k, this.m4);
        this.torchGlow[k].scale.setScalar(2.1 + fl * 0.9);
        this.torchGlow[k].material.opacity = 0.3 + fl * 0.3;
      }
      tc.instanceMatrix.needsUpdate = true;
      if (Math.random() < dt * 6) {
        const k = Math.floor(Math.random() * this.torchAt.length);
        B_EMBER.up = this.torchN[k];
        this.fx.burst(this.torchAt[k], 1, FIRE, B_EMBER);
      }
    }
    // gulls
    const gl = this.gulls;
    if (gl) {
      for (let i = 0; i < 6; i++) {
        const [la, lo] = TIDE_ISLES[(i * 3 + 1) % TIDE_ISLES.length];
        const c = sph(la, lo, this.e);
        stand(this.q2, c, UP);
        const a = t * (0.42 + (i % 2) * 0.1) * (i % 3 ? 1 : -1) + i * 1.7;
        this.c.set(Math.cos(a), 0, Math.sin(a)).applyQuaternion(this.q2);
        flat(this.c, c).normalize();
        slide(c, this.c, 2.8 / R);
        this.d.crossVectors(c, this.c).normalize();
        if (i % 3 === 0) this.d.negate();
        const h = 4.3 + Math.sin(t * 0.9 + i) * 0.35;
        stand(this.q, c, this.d);
        this.q.multiply(this.q3.setFromAxisAngle(ZAX, (i % 3 ? -1 : 1) * 0.35));
        this.b.copy(c).multiplyScalar(R + h);
        this.m4.compose(this.b, this.q, this.sc.set(0.16, 0.12, 0.44));
        gl.setMatrixAt(i * 3, this.m4);
        const flap = Math.sin(t * 7 + i * 2) * 0.55;
        for (let w = 0; w < 2; w++) {
          const sgn = w ? 1 : -1;
          this.q2.copy(this.q).multiply(this.q3.setFromAxisAngle(ZAX, sgn * flap));
          this.a.set(sgn * 0.3, 0.02, 0).applyQuaternion(this.q2);
          this.m4.compose(this.a.add(this.b), this.q2, this.sc.set(0.5, 0.03, 0.17));
          gl.setMatrixAt(i * 3 + 1 + w, this.m4);
        }
      }
      gl.instanceMatrix.needsUpdate = true;
    }
    // buoys
    const by = this.buoys;
    if (by) {
      for (let i = 0; i < this.buoyN.length; i++) {
        const n = this.buoyN[i];
        const bob = Math.sin(t * 2 + i * 1.3) * 0.06;
        this.q.setFromUnitVectors(UP, n).multiply(this.q2.setFromAxisAngle(XX, Math.sin(t * 1.6 + i) * 0.14));
        this.a.set(0, 0.12 + bob, 0).applyQuaternion(this.q);
        this.b.copy(n).multiplyScalar(R + SEA).add(this.a);
        this.m4.compose(this.b, this.q, this.sc.set(0.34, 0.3, 0.34));
        by.setMatrixAt(i * 2, this.m4);
        this.a.set(0, 0.36 + bob, 0).applyQuaternion(this.q);
        this.b.copy(n).multiplyScalar(R + SEA).add(this.a);
        this.m4.compose(this.b, this.q, this.sc.set(0.2, 0.2, 0.2));
        by.setMatrixAt(i * 2 + 1, this.m4);
      }
      by.instanceMatrix.needsUpdate = true;
    }
    // now and then a fish leaps in a lagoon near the camera
    this.fishT -= dt;
    if (this.fishT <= 0) {
      this.fishT = 0.9 + Math.random() * 1.4;
      const n = this.findSpot((x) => this.isle(x) < -1 && arcM(x, this.cn) < 9, 12);
      if (n) {
        this.a.copy(n).multiplyScalar(R + SEA + 0.05);
        B_FISH.up = n;
        this.fx.burst(this.a, 3, FISH, B_FISH);
        B_SPLASH.up = n;
        this.fx.burst(this.a, 5, WATER, B_SPLASH);
      }
    }
  }

  // PROOF FACTORY: vents, pipes, a press, gears, drones, beacons, sparks from the furnace

  private dressFoundry(s: THREE.Scene) {
    const bk = this.bk;
    // floor vents with a glow in their slits (embers rise from them)
    for (let i = 0; i < 26; i++) {
      const n = this.findSpot((x) => this.offBelt(x, 0.5) && !this.blocked(x, 0.7) && arcM(x, UP) > 2.7, 30);
      if (!n) continue;
      const f = this.frame(n, i * 0.9);
      bk.add(f, "box", "#24212c", 0, 0.025, 0, 0.95, 0.05, 0.66, 0.015);
      for (let k = 0; k < 3; k++) bk.add(f, "box", "#ff7a2a", 0, 0.045, (k - 1) * 0.2, 0.74, 0.03, 0.07, 0, true);
      this.vents.push(v3().copy(n).multiplyScalar(R + 0.1));
    }
    // hatches: lighter plates with a dark cross and corner bolts
    for (let i = 0; i < 16; i++) {
      const n = this.findSpot((x) => this.offBelt(x, 0.6) && !this.blocked(x, 0.7) && arcM(x, UP) > 2.7, 30);
      if (!n) continue;
      const f = this.frame(n, i * 1.1);
      bk.add(f, "box", "#9aa1ba", 0, 0.02, 0, 0.9, 0.04, 0.9, 0.015);
      bk.add(f, "box", "#4a4f63", 0, 0.045, 0, 0.82, 0.02, 0.08, 0, false, 0, Math.PI / 4, 0);
      bk.add(f, "box", "#4a4f63", 0, 0.045, 0, 0.82, 0.02, 0.08, 0, false, 0, -Math.PI / 4, 0);
      for (let k = 0; k < 4; k++) bk.add(f, "box", "#ffd23f", (k % 2 ? 1 : -1) * 0.36, 0.05, (k < 2 ? 1 : -1) * 0.36, 0.08, 0.03, 0.08, 0);
    }
    // pipes along the ground from each stack, flanged
    for (const st of this.stackNs) {
      const to = this.fuN ?? UP;
      toward(st, to, this.c);
      const n = st.clone();
      slide(n, this.c, 0.9 / R);
      for (let k = 0; k < 9; k++) {
        if (this.offBelt(n, 0.3) && !this.blocked(n, 0.25) && arcM(n, UP) > 2.5) {
          toward(n, to, this.d);
          if (this.d.lengthSq() < 0.5) break;
          const f = this.frameF(n, this.d);
          bk.add(f, "cyl", "#8a90a8", 0, 0.14, 0, 0.18, 0.56, 0.18, 0.02, false, Math.PI / 2, 0, 0);
          if (k % 2 === 0) bk.add(f, "cyl", "#ffb21e", 0, 0.14, 0.26, 0.26, 0.06, 0.26, 0.015, false, Math.PI / 2, 0, 0);
        } else if (k > 1) break;
        toward(n, to, this.d);
        if (this.d.lengthSq() < 0.5) break;
        slide(n, this.d, 0.56 / R);
      }
    }
    // the press: a frame and its hammer, which slams (sparks, a thud)
    const prN = sph(8, 100);
    if (this.offBelt(prN, 1.0) && !this.blocked(prN, 1.0)) {
      const pr = new THREE.Group();
      this.put(pr, prN, 0.4);
      const f = this.frame(prN, 0.4);
      bk.add(f, "box", "#4a4f63", 0, 0.08, 0, 1.7, 0.16, 1.1, 0.03);
      bk.add(f, "box", "#ffd23f", -0.75, 1.15, 0, 0.24, 2.2, 0.3, 0.03);
      bk.add(f, "box", "#ffd23f", 0.75, 1.15, 0, 0.24, 2.2, 0.3, 0.03);
      bk.add(f, "box", "#2b2733", 0, 2.35, 0, 1.85, 0.36, 0.5, 0.035);
      bk.add(f, "box", "#5a5f74", 0, 0.36, 0, 0.9, 0.4, 0.7, 0.03);
      bk.add(f, "box", "#ff7a2a", 0, 0.57, 0, 0.5, 0.04, 0.4, 0, true);
      const ham = new THREE.Mesh(GEO.box, this.prop("#3a3f55"));
      ham.scale.set(0.85, 0.45, 0.6);
      outline(ham, 0.035).material = this.inkSee;
      pr.add(ham);
      const rod = new THREE.Mesh(GEO.cyl, this.prop("#c9cddc"));
      rod.scale.set(0.16, 1, 0.16);
      pr.add(rod);
      this.press = { ham, rod, t: 0, n: prN };
      this.obst.push({ n: prN, r: 0.9 });
    }
    // the cooling tower: a squat tank, a glowing Q band, a dome, four legs
    const ctN = sph(0, -60);
    if (this.offBelt(ctN, 1.2) && !this.blocked(ctN, 1.2)) {
      const f = this.frame(ctN, 0.3);
      for (let k = 0; k < 4; k++) bk.add(f, "box", "#4a4f63", Math.cos(k * 1.571 + 0.785) * 0.72, 0.3, Math.sin(k * 1.571 + 0.785) * 0.72, 0.18, 0.6, 0.18, 0.025);
      bk.add(f, "cyl", "#8a90a8", 0, 1.15, 0, 1.75, 1.3, 1.75, 0.04);
      bk.add(f, "cyl", "#5ff0e0", 0, 1.15, 0, 1.8, 0.22, 1.8, 0, true);
      bk.add(f, "cyl", "#2b2733", 0, 0.52, 0, 1.6, 0.12, 1.6, 0.025);
      bk.add(f, "ball", "#c9cddc", 0, 1.8, 0, 1.6, 0.8, 1.6, 0.035);
      bk.add(f, "cyl", "#ffd23f", 0, 2.25, 0, 0.3, 0.3, 0.3, 0.025);
      this.obst.push({ n: ctN, r: 1.0 });
      this.stacks.push(v3().copy(ctN).multiplyScalar(R + 2.4));
    }
    // gears turning on the furnace's sides
    if (this.furnace) {
      for (const side of [-1, 1]) {
        const gb = new Bake();
        const I = new THREE.Matrix4();
        gb.add(I, "cyl", "#c9a24a", 0, 0, 0, 0.8, 0.12, 0.8, 0.025, false, 0, 0, Math.PI / 2);
        gb.add(I, "cyl", "#4a4f63", 0, 0, 0, 0.26, 0.16, 0.26, 0.02, false, 0, 0, Math.PI / 2);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          gb.add(I, "box", "#c9a24a", 0, Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.12, 0.16, 0.14, 0.02, false, -a, 0, 0);
        }
        const g = new THREE.Group();
        gb.build(g);
        g.position.set(side * 1.07, 0.85, 0.1);
        this.furnace.add(g);
        this.gears.push(g);
      }
    }
    // hazard paint round every machine's foot (inside its bump: it never lies about where you can run)
    for (const o of this.obst) {
      if (o.r < 0.7) continue;
      const rr0 = o.r + 0.16;
      const nSeg = Math.max(10, Math.round((Math.PI * 2 * rr0) / 0.3));
      stand(this.q2, o.n, UP);
      for (let k = 0; k < nSeg; k++) {
        const a = (k / nSeg) * Math.PI * 2;
        const n = o.n.clone();
        this.c.set(Math.cos(a), 0, Math.sin(a)).applyQuaternion(this.q2);
        flat(this.c, n).normalize();
        slide(n, this.c, rr0 / R);
        if (!this.offBelt(n, 0.1)) continue;
        this.d.crossVectors(n, this.c).normalize();
        bk.add(this.frameF(n, this.d), "box", k % 2 ? "#ffcf2e" : "#1b1820", 0, 0.035, 0, 0.3, 0.025, 0.2, 0);
      }
    }
    // beacons turning on the stacks' rims, drones going round with blinking lights
    this.beacons = new THREE.InstancedMesh(GEO.box, glow("#ffb21e", 0.95, true), this.stacks.length * 2);
    this.beacons.frustumCulled = false;
    s.add(this.beacons);
    const nD = 4;
    this.drones = new THREE.InstancedMesh(GEO.box, toon("#ffd23f", "#3a2a00"), nD * 2);
    this.drones.frustumCulled = false;
    this.droneLights = new THREE.InstancedMesh(GEO.box, glow("#ffffff"), nD);
    this.droneLights.frustumCulled = false;
    for (let i = 0; i < nD; i++) this.droneLights.setColorAt(i, new THREE.Color(i % 2 ? "#3dff8a" : "#ff3355"));
    s.add(this.drones, this.droneLights);
  }

  private lifeFoundry(dt: number, t: number) {
    for (const g of this.gears) g.rotation.x += dt * (g.position.x > 0 ? 1.2 : -1.2);
    // the press: up slowly, down hard
    const pr = this.press;
    if (pr) {
      pr.t += dt;
      const per = 2.4;
      const k = (pr.t % per) / per;
      const y = k < 0.82 ? 0.85 + (k / 0.82) * 1.0 : 1.85 - ((k - 0.82) / 0.18) ** 2 * 1.0;
      pr.ham.position.set(0, y + 0.22, 0);
      pr.rod.position.set(0, (y + 0.45 + 2.2) / 2, 0);
      pr.rod.scale.y = Math.max(0.05, 2.2 - y - 0.45);
      const slam = Math.floor(pr.t / per);
      if (slam !== this.pressSlam && k > 0.995 - 0.01) {
        this.pressSlam = slam;
        this.a.copy(pr.n).multiplyScalar(R + 0.62);
        B_SPARK2.up = pr.n;
        this.fx.burst(this.a, 14, SPARKS, B_SPARK2);
        const d = arcM(this.me().n, pr.n);
        if (d < 9) (snd.bonk(clamp(0.16 - d * 0.016, 0.02, 0.16)), d < 4 && this.cam.shake(0.08));
      }
    }
    // beacons
    const bc = this.beacons;
    if (bc) {
      let j = 0;
      for (const top of this.stacks) {
        this.e.copy(top).normalize();
        for (let w = 0; w < 2; w++) {
          stand(this.q, this.e, UP);
          this.q.multiply(this.q2.setFromAxisAngle(UP, t * 3 + w * Math.PI));
          this.a.set(0, 0.05, 0.42).applyQuaternion(this.q);
          this.b.copy(top).add(this.a);
          const on = Math.sin(t * 6 + j) > -0.3 ? 1 : 0.4;
          this.m4.compose(this.b, this.q, this.sc.set(0.2 * on, 0.16 * on, 0.3 * on));
          bc.setMatrixAt(j++, this.m4);
        }
      }
      bc.instanceMatrix.needsUpdate = true;
    }
    // drones
    const dr = this.drones,
      dl = this.droneLights;
    if (dr && dl) {
      for (let i = 0; i < 4; i++) {
        const a = t * (0.32 + i * 0.05) + i * 1.6;
        this.e.set(Math.cos(a), Math.sin(a * 0.7 + i) * 0.45, Math.sin(a)).normalize();
        this.e.applyAxisAngle(XX, i * 0.7);
        this.d.set(-Math.sin(a), 0, Math.cos(a)).applyAxisAngle(XX, i * 0.7);
        stand(this.q, this.e, this.d);
        this.b.copy(this.e).multiplyScalar(R + 5.4 + Math.sin(t * 1.3 + i) * 0.3);
        this.m4.compose(this.b, this.q, this.sc.set(0.6, 0.2, 0.6));
        dr.setMatrixAt(i * 2, this.m4);
        this.q2.copy(this.q).multiply(this.q3.setFromAxisAngle(UP, t * 30));
        this.a.set(0, 0.13, 0).applyQuaternion(this.q);
        this.m4.compose(this.a.add(this.b), this.q2, this.sc.set(0.8, 0.03, 0.08));
        dr.setMatrixAt(i * 2 + 1, this.m4);
        this.a.set(0, -0.12, 0).applyQuaternion(this.q);
        const on = Math.sin(t * 7 + i * 2) > 0 ? 0.22 : 0.07;
        this.m4.compose(this.a.add(this.b.copy(this.e).multiplyScalar(R + 5.4 + Math.sin(t * 1.3 + i) * 0.3)), this.q, this.sc.setScalar(on));
        dl.setMatrixAt(i, this.m4);
      }
      dr.instanceMatrix.needsUpdate = true;
      dl.instanceMatrix.needsUpdate = true;
    }
    // sparks out of the furnace's mouth, embers from the vents
    if (this.mouth && Math.random() < dt * 14) {
      B_SPARK2.up = this.mouthN;
      this.fx.burst(this.mouth, 1, FIRE, B_SPARK2);
    }
    if (this.vents.length && Math.random() < dt * 9) {
      const v = this.vents[Math.floor(Math.random() * this.vents.length)];
      B_EMBER.up = this.a.copy(v).normalize();
      this.fx.burst(v, 1, FIRE, B_EMBER);
    }
  }

  /** Is this spot inside (or within `m` metres of) a hard piece? */
  private blocked(n: Vec, m = 0) {
    for (const o of this.obst) if (arcM(n, o.n) < o.r + m) return true;
    return false;
  }

  // ---- flags ---------------------------------------------------------------------------------------

  private makeFlag(): Flag {
    const g = new THREE.Group();
    const sway = new THREE.Group();
    g.add(sway);
    const pole = new THREE.Mesh(GEO.cyl, toon("#f6f2ff"));
    pole.scale.set(0.09, 2.2, 0.09);
    pole.position.y = 1.1;
    outline(pole, 0.025);
    sway.add(pole);
    const knob = new THREE.Mesh(GEO.ball, toon("#ffd23f", "#5a3c00"));
    knob.scale.setScalar(0.24);
    knob.position.y = 2.24;
    outline(knob, 0.03);
    sway.add(knob);
    const geo = clothGeo();
    const cloth = new THREE.Mesh(geo, this.clothMats[0]);
    cloth.position.set(0.04, 1.5, 0);
    sway.add(cloth);
    const plinth = new THREE.Mesh(GEO.cyl, toon("#5b3fc4"));
    plinth.scale.set(0.62, 0.18, 0.62);
    plinth.position.y = 0.06;
    outline(plinth, 0.03);
    g.add(plinth);
    const ringMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(GEO.ring, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(GRAB * 2);
    ring.position.y = 0.08;
    ring.renderOrder = 3;
    g.add(ring);
    const beamMat = new THREE.MeshBasicMaterial({ map: this.beamTex, color: "#ffffff", transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(this.beamGeo, beamMat);
    beam.raycast = () => {};
    g.add(beam);
    // (what makes a flag the brightest thing on the planet: a white-hot core up its beam, a pool of its colour at its foot)
    const coreMat = new THREE.MeshBasicMaterial({ map: this.beamTex, color: "#ffffff", transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const core = new THREE.Mesh(this.beamGeo, coreMat);
    core.scale.set(0.3, 1, 0.3);
    core.raycast = () => {};
    beam.add(core);
    const haloMat = new THREE.MeshBasicMaterial({ map: this.soft(), color: "#ffffff", transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    const halo = new THREE.Mesh(GEO.plane, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.scale.setScalar(4.4);
    halo.position.y = 0.11;
    halo.renderOrder = 2;
    halo.raycast = () => {};
    g.add(halo);
    g.visible = false;
    this.w.scene.add(g);
    return {
      g,
      sway,
      cloth,
      pos: (geo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array,
      nrm: (geo.getAttribute("normal") as THREE.BufferAttribute).array as Float32Array,
      plinth,
      ring,
      ringMat,
      beam,
      beamMat,
      coreMat,
      halo,
      haloMat,
      n: v3(0, 1, 0),
      from: v3(),
      to: v3(),
      state: S_OFF,
      t: 0,
      gold: false,
      loose: false,
      value: 1,
      col: 0,
      by: null,
      phase: Math.random() * 6,
      age: 0,
      seen: [0, 0, 0, 0],
    };
  }

  private setLook(f: Flag, gold: boolean, col: number) {
    f.gold = gold;
    f.col = col;
    f.value = gold ? 3 : 1;
    const c = gold ? GOLD_C : FLAG_C[col];
    f.cloth.material = this.clothMats[gold ? 2 : col];
    f.plinth.material = toon(gold ? "#c98a00" : col ? "#11a08a" : "#6a4bd6");
    f.ringMat.color.set(c);
    f.beamMat.color.set(c);
    f.haloMat.color.set(c);
    f.coreMat.color.set(c).lerp(WHITE, 0.6);
    f.g.scale.setScalar(gold ? 1.3 : 1);
  }

  private freeFlag() {
    return this.flags.find((f) => f.state === S_OFF) ?? null;
  }

  /** Pop a flag up here. */
  private spawn(n: Vec, gold: boolean) {
    const f = this.freeFlag();
    if (!f) return;
    this.setLook(f, gold, Math.floor(this.rnd() * 2));
    f.loose = false;
    f.n.copy(n);
    f.state = S_RISE;
    f.t = 0;
    f.by = null;
    f.g.visible = true;
    const me = this.me();
    const d = arcM(me.n, n);
    snd.ping(gold, clamp(0.34 - d * 0.012, 0.1, 0.34));
    this.fx.burst(this.a.copy(n).multiplyScalar(R + 0.3), gold ? 30 : 14, gold ? GOLDS : CONF, { speed: 3, up: n, kick: 6, grav: 12, size: 0.14, life: 0.9 });
    this.notice(f);
  }

  /** When each AI takes in a new flag (s after it shows): a reaction, slow for the weak ones, slower still round the far side. They think again then. */
  private notice(f: Flag, k = 1) {
    f.age = 0;
    const at = this.flagAt(f);
    for (const r of this.run) {
      if (r.p.human) {
        f.seen[r.seat] = 0;
        continue;
      }
      const sk = r.p.skill;
      const far = arcM(r.n, at) > 11 ? (1 - sk) * 0.7 : 0;
      f.seen[r.seat] = k * (lerp(0.95, 0.15, sk) + far + this.rnd() * lerp(0.5, 0.15, sk));
      r.think = Math.min(r.think, f.seen[r.seat] + 0.02);
    }
  }

  /** A good spot for a new flag: off the pieces and the rings, not on top of anyone. */
  private spot(out: Vec, gold: boolean) {
    let best = -1;
    const c = this.c;
    // (ORCHARD TIDE: flags rise in the moonlight about half the time, so the pull is where the fight is)
    const td = this.tide;
    if (td && this.started && !gold && this.rnd() < 0.4)
      for (let i = 0; i < 16; i++) {
        c.copy(td.sub);
        const a = this.rnd() * Math.PI * 2;
        this.b.set(Math.cos(a), Math.sin(a * 1.7), Math.sin(a));
        flat(this.b, c).normalize();
        slide(c, this.b, (this.rnd() * TIDE_R * 0.75) / R);
        if (this.blocked(c, 0.75)) continue;
        let near = false;
        for (const r of this.run) if (arcM(r.n, c) < 2.6) near = true;
        for (const f of this.flags) if (f.state !== S_OFF && f.state !== S_TAKEN && arcM(f.n, c) < 3.5) near = true;
        if (!near) return out.copy(c);
      }
    for (let i = 0; i < 48; i++) {
      const z = this.rnd() * 2 - 1,
        a = this.rnd() * Math.PI * 2,
        k = Math.sqrt(1 - z * z);
      c.set(Math.cos(a) * k, z, Math.sin(a) * k);
      if (this.blocked(c, 0.75)) continue;
      let hot = false;
      for (const m of this.mets) if (m.live && arcM(m.n, c) < MET_R + 0.6) hot = true;
      if (hot) continue;
      let dp = Infinity;
      for (const r of this.run) dp = Math.min(dp, arcM(r.n, c));
      let df = Infinity;
      for (const f of this.flags) if (f.state !== S_OFF && f.state !== S_TAKEN) df = Math.min(df, arcM(f.n, c));
      if (!gold && (dp < 3.4 || df < 5.5)) continue;
      // (the gold: as far from everyone as can be, a race)
      const score = gold ? Math.min(dp, 13) + this.rnd() * 1.5 : this.rnd();
      if (score > best) ((best = score), out.copy(c));
    }
    if (best < 0) {
      // (nowhere good: anywhere off the pieces)
      for (let i = 0; i < 30; i++) {
        const z = this.rnd() * 2 - 1,
          a = this.rnd() * Math.PI * 2,
          k = Math.sqrt(1 - z * z);
        out.set(Math.cos(a) * k, z, Math.sin(a) * k);
        if (!this.blocked(out, 0.6)) break;
      }
    }
    return out;
  }

  /** A flag knocked out of a runner's hands: it flies off, lands and is anyone's. */
  private drop(r: Runner, dir: Vec, dist: number) {
    if (r.score <= 0) return;
    const f = this.freeFlag();
    if (!f) return;
    r.score--;
    r.bad = 1;
    this.pop("-1", "#ff5d73", r.n, r.h + 2.4, 26);
    this.setLook(f, false, Math.floor(this.rnd() * 2));
    f.loose = true;
    f.from.copy(r.n);
    f.to.copy(r.n);
    slide(f.to, dir, dist / R);
    // (off the pieces: pushed clear of them)
    for (let k = 0; k < 6 && this.blocked(f.to, 0.4); k++) slide(f.to, dir, 0.5 / R);
    f.n.copy(f.from);
    f.state = S_FLY;
    f.t = 0;
    f.by = null;
    f.g.visible = true;
    this.notice(f, 0.6);
  }

  private grab(r: Runner, f: Flag) {
    const was = r.score;
    r.score += f.value;
    for (let k = was + 1; k <= r.score; k++) if (r.reach[k] === undefined) r.reach[k] = this.t;
    f.state = S_TAKEN;
    f.t = 0;
    f.by = r;
    r.flash = 1;
    const at = this.a.copy(f.n).multiplyScalar(R + 1.6);
    this.fx.burst(at, f.gold ? 46 : 22, f.gold ? GOLDS : CONF, { speed: f.gold ? 6 : 4.5, up: f.n, kick: 5, grav: 14, size: f.gold ? 0.2 : 0.16, life: 1.0 });
    this.pop(f.gold ? "+3!" : "+1", f.gold ? GOLD_C : r.p.color, r.n, r.h + 2.6, f.gold ? 40 : 30);
    if (r.p.human) (snd.grab(f.gold), this.cam.shake(f.gold ? 0.25 : 0.1));
    else snd.rival(f.gold ? 0.2 : 0.1);
    if (f.gold) (r.av.cheer(1.2), this.flashBan(r.p.human ? T("GOLD! +3", "金旗！+3") : T(`${short(r.p)} GOT THE GOLD!`, `${short(r.p)} 抢到金旗！`), "", GOLD_C, 1.6));
    if (r.grounded) ((r.vh = 3.4), (r.grounded = false));
    if (!f.loose && !f.gold) this.nextFlag = Math.min(this.nextFlag, this.t + 0.5 + this.rnd() * 0.45);
    // the ones who wanted it: annoyed, and off to something else
    for (const o of this.run)
      if (o !== r && o.goal === f) {
        o.goal = null;
        o.think = 0.05 + this.rnd() * 0.25;
        if (!o.p.human && arcM(o.n, f.n) < 3.5) o.sulk = 0.7;
      }
  }

  private grabbable(f: Flag) {
    return (f.state === S_RISE && f.t > 0.18) || f.state === S_LIVE || (f.state === S_FLY && f.t > 0.42);
  }

  /** Where a flag is (or lands, if flying). */
  private flagAt(f: Flag) {
    return f.state === S_FLY ? f.to : f.n;
  }

  private updateFlags(dt: number) {
    // (the cloths face the camera, a little sway)
    this.d.copy(this.cf).negate();
    for (const f of this.flags) {
      if (f.state === S_OFF) continue;
      f.t += dt;
      f.age += dt;
      let scale = f.gold ? 1.3 : 1;
      let lift = 0;
      if (f.state === S_RISE) {
        const k = Math.min(1, f.t / 0.45);
        scale *= Math.max(0.01, backOut(k));
        f.beamMat.opacity = 1 - k * 0.45;
        f.beam.scale.set(1 + (1 - k) * 1.2, 0.3 + k * 0.7, 1 + (1 - k) * 1.2);
        if (k >= 1) ((f.state = S_LIVE), (f.t = 0));
      } else if (f.state === S_LIVE) {
        const p = 0.5 + 0.5 * Math.sin(f.t * 5 + f.phase);
        f.beamMat.opacity = (f.gold ? 0.6 : 0.4) + p * 0.15;
        f.beam.scale.set(1 + p * 0.08, 1, 1 + p * 0.08);
        f.ringMat.opacity = 0.55 + p * 0.4;
        f.ring.scale.setScalar(GRAB * 2 * (0.94 + p * 0.08));
        if (f.gold && Math.random() < dt * 14) ((B_SPARK.up = f.n), this.fx.burst(this.a.copy(f.n).multiplyScalar(R + 0.6 + Math.random() * 2), 1, GOLDS, B_SPARK));
      } else if (f.state === S_FLY) {
        const k = Math.min(1, f.t / 0.6);
        slerpN(f.from, f.to, k, f.n);
        lift = 1.3 * (1 - k) + 3.2 * k * (1 - k);
        f.sway.rotation.y = f.t * 14;
        f.beamMat.opacity = 0.15;
        if (k >= 1) {
          f.state = S_LIVE;
          f.t = 0;
          f.n.copy(f.to);
          f.sway.rotation.y = 0;
          this.fx.burst(this.a.copy(f.n).multiplyScalar(R + 0.1), 8, DUST, { speed: 2, up: f.n, kick: 2, grav: 10, size: 0.12, life: 0.5 });
        }
      } else if (f.state === S_TAKEN) {
        const k = Math.min(1, f.t / 0.42);
        const r = f.by!;
        slerpN(f.n, r.n, Math.min(1, dt * 12), f.n);
        lift = r.h + 0.6 + k * 1.6;
        scale *= Math.max(0.01, 1 - ease(k));
        f.sway.rotation.y = f.t * 22;
        f.beamMat.opacity = 0.5 * (1 - k);
        if (k >= 1) ((f.state = S_OFF), (f.g.visible = false), (f.sway.rotation.y = 0));
      }
      f.g.position.copy(f.n).multiplyScalar(R + this.groundAt(f.n) + 0.02 + lift);
      stand(f.g.quaternion, f.n, this.d);
      f.g.scale.setScalar(scale);
      f.ring.visible = f.halo.visible = f.state === S_LIVE || f.state === S_RISE;
      f.coreMat.opacity = Math.min(0.9, f.beamMat.opacity * 1.5);
      f.haloMat.opacity = (f.gold ? 0.62 : 0.46) + Math.sin(f.t * 5 + f.phase) * 0.14;
      f.sway.rotation.z = Math.sin(this.t * 2.3 + f.phase) * 0.06;
      // the cloth waves: z = 0.1 sin(5x − 8t + φ) · min(1, 1.6x), its normals from the slope (the back side's the other way)
      const p = f.pos,
        nm = f.nrm,
        half = p.length / 2;
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i],
          th = x * 5 - this.t * 8 + f.phase,
          m = Math.min(1, x * 1.6),
          sn = Math.sin(th);
        p[i + 2] = sn * 0.1 * m;
        const sl = 0.1 * (5 * Math.cos(th) * m + (x < 0.625 ? 1.6 * sn : 0));
        const il = (i < half ? 1 : -1) / Math.sqrt(1 + sl * sl);
        nm[i] = -sl * il;
        nm[i + 1] = 0;
        nm[i + 2] = il;
      }
      const geo = f.cloth.geometry;
      geo.getAttribute("position").needsUpdate = true;
      geo.getAttribute("normal").needsUpdate = true;
    }
  }

  // ---- meteors -------------------------------------------------------------------------------------

  private ringGeo: THREE.BufferGeometry | null = null;
  private discGeo: THREE.BufferGeometry | null = null;
  private fillTex: THREE.Texture | null = null;
  private scorchTex: THREE.Texture | null = null;

  private makeMeteor(): Meteor {
    const s = this.w.scene;
    this.ringGeo ??= capGeo(MET_R, MET_R - 0.24, 0.1, 48, 1);
    this.discGeo ??= capGeo(MET_R, 0, 0.09, 40, 6);
    this.fillTex ??= canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.97, "rgba(255,255,255,0.02)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    this.scorchTex ??= canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(30,14,24,0.95)");
      gr.addColorStop(0.6, "rgba(40,20,30,0.6)");
      gr.addColorStop(1, "rgba(40,20,30,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    });
    const rock = new THREE.Group();
    const core = new THREE.Mesh(GEO.box, toon("#6b3f57", "#2a0a14"));
    core.scale.setScalar(1.1);
    outline(core, 0.06);
    rock.add(core);
    const chunk = new THREE.Mesh(GEO.box, toon("#9a5a6c", "#2a0a14"));
    chunk.scale.setScalar(0.62);
    chunk.position.set(0.45, 0.4, -0.3);
    rock.add(chunk);
    const fire = new THREE.Mesh(GEO.box, glow("#ff7a2a", 0.55, true));
    fire.scale.setScalar(1.75);
    rock.add(fire);
    rock.visible = false;
    s.add(rock);
    const ring = new THREE.Mesh(this.ringGeo, glow("#ff2d55", 0.92));
    ring.renderOrder = 4;
    ring.visible = false;
    s.add(ring);
    const fillMat = new THREE.MeshBasicMaterial({ color: "#ff3355", map: this.fillTex, transparent: true, opacity: 0.55, depthWrite: false, alphaTest: 0.5 });
    const fill = new THREE.Mesh(this.discGeo, fillMat);
    fill.renderOrder = 3;
    fill.visible = false;
    s.add(fill);
    const shockMat = new THREE.MeshBasicMaterial({ color: "#ffd2a0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const shock = new THREE.Mesh(GEO.ring, shockMat);
    shock.visible = false;
    s.add(shock);
    const scorchMat = new THREE.MeshBasicMaterial({ map: this.scorchTex, transparent: true, opacity: 0, depthWrite: false });
    const scorch = new THREE.Mesh(this.discGeo, scorchMat);
    scorch.renderOrder = 2;
    scorch.visible = false;
    s.add(scorch);
    return { rock, ring, fill, fillMat, shock, shockMat, scorch, scorchMat, n: v3(0, 1, 0), side: v3(1, 0, 0), live: false, t: 0, T: 1.8, after: -1, notice: [0, 0, 0, 0] };
  }

  private meteor() {
    const m = this.mets.find((x) => !x.live && x.after < 0) ?? this.mets.find((x) => !x.live);
    if (!m) return;
    const n = this.e;
    // a runner (where they are headed), a flag, or anywhere; never right on top of another ring
    for (let tries = 0; tries < 12; tries++) {
      const k = this.rnd();
      if (k < 0.5) {
        const r = this.run[Math.floor(this.rnd() * 4)];
        if (r.stun > 0) continue;
        n.copy(r.n);
        const sp = r.v.length();
        if (sp > 0.5) slide(n, this.a.copy(r.v).multiplyScalar(1 / sp), (sp * 0.4) / R);
      } else if (k < 0.78) {
        let nl = 0;
        for (const f of this.flags) if (f.state === S_LIVE) nl++;
        if (!nl) continue;
        let pickI = Math.floor(this.rnd() * nl);
        for (const f of this.flags) if (f.state === S_LIVE && pickI-- === 0) n.copy(f.n);
      } else {
        const z = this.rnd() * 2 - 1,
          a = this.rnd() * Math.PI * 2,
          kk = Math.sqrt(1 - z * z);
        n.set(Math.cos(a) * kk, z, Math.sin(a) * kk);
      }
      // (a little off the mark)
      const a = this.rnd() * Math.PI * 2;
      this.b.set(Math.cos(a), Math.sin(a), Math.cos(a * 1.7));
      flat(this.b, n).normalize();
      slide(n, this.b, (this.rnd() * 1.1) / R);
      let clash = false;
      for (const o of this.mets) if (o.live && arcM(o.n, n) < MET_R * 1.3) clash = true;
      if (!clash) break;
    }
    m.n.copy(n);
    const a = Math.random() * Math.PI * 2;
    m.side.set(Math.cos(a), Math.sin(a * 1.3), Math.sin(a));
    flat(m.side, n).normalize();
    m.live = true;
    m.t = 0;
    m.T = this.t < 20 ? 1.95 : this.t < HURRY_AT ? 1.65 : 1.4;
    m.after = -1;
    for (const r of this.run) {
      const sk = r.p.skill;
      m.notice[r.seat] = r.p.human ? 0 : this.rnd() < (1 - sk) * 0.42 ? Infinity : lerp(1.0, 0.12, sk) + this.rnd() * 0.3;
    }
    m.rock.visible = m.ring.visible = m.fill.visible = true;
    m.shock.visible = m.scorch.visible = false;
    m.ring.quaternion.setFromUnitVectors(UP, n);
    m.fill.quaternion.copy(m.ring.quaternion);
    m.fill.position.set(0, 0, 0);
    m.ring.position.set(0, 0, 0);
    const d = arcM(this.me().n, n);
    snd.whistle(m.T, clamp(0.2 - d * 0.009, 0.03, 0.2));
  }

  private updateMeteors(dt: number) {
    for (const m of this.mets) {
      if (m.live) {
        m.t += dt;
        const k = Math.min(1, m.t / m.T);
        const hgt = 30 * (1 - k * k);
        this.a.copy(m.n);
        slide(this.a, m.side, (1 - k) * 0.55);
        m.rock.position.copy(this.a).multiplyScalar(R + 0.5 + hgt);
        m.rock.rotation.x += dt * 5;
        m.rock.rotation.y += dt * 3.3;
        m.rock.scale.setScalar(0.85 + k * 0.3);
        // the ring blinks faster as it comes; the red fills it
        const blink = k > 0.7 ? Math.sin(m.t * 40) > -0.2 : true;
        m.ring.visible = blink;
        m.fillMat.alphaTest = Math.max(0.002, 1 - k);
        m.fillMat.opacity = 0.35 + k * 0.4;
        if (Math.random() < 0.9) this.fx.burst(m.rock.position, 2, FIRE, B_TRAIL);
        if (k >= 1) this.impact(m);
      } else if (m.after >= 0) {
        m.after += dt;
        const k1 = Math.min(1, m.after / 0.4);
        m.shock.visible = k1 < 1;
        m.shock.scale.setScalar(MET_R * 2 * (0.5 + easeOutQ(k1) * 1.3));
        m.shockMat.opacity = 0.95 * (1 - k1);
        m.scorchMat.opacity = 0.75 * clamp((3.4 - m.after) / 1.0, 0, 1);
        if (m.after > 3.4) ((m.after = -1), (m.scorch.visible = false));
      }
    }
  }

  private impact(m: Meteor) {
    m.live = false;
    m.after = 0;
    m.rock.visible = m.ring.visible = m.fill.visible = false;
    m.shock.visible = m.scorch.visible = true;
    m.shock.position.copy(m.n).multiplyScalar(R + 0.15);
    stand(m.shock.quaternion, m.n, this.cf);
    m.shock.quaternion.multiply(this.q.setFromAxisAngle(XX, -Math.PI / 2));
    m.scorch.quaternion.setFromUnitVectors(UP, m.n);
    m.scorch.scale.setScalar(0.85);
    const at = this.a.copy(m.n).multiplyScalar(R + 0.4);
    this.fx.burst(at, 26, ROCKS, { speed: 7, up: m.n, kick: 7, grav: 24, size: 0.3, life: 1.3, drag: 0.5 });
    this.fx.burst(at, 22, FIRE, { speed: 6, up: m.n, kick: 4, grav: 3, size: 0.36, life: 0.55, drag: 2.5, bounce: false });
    const me = this.me();
    const d = arcM(me.n, m.n);
    snd.boom(clamp(0.5 - d * 0.03, 0.06, 0.5));
    this.cam.shake(clamp(0.75 - d * 0.06, 0.05, 0.7));
    if (this.over) return;
    for (const r of this.run) {
      const dd = arcM(r.n, m.n);
      if (dd > MET_R + 0.15 || r.h > 1.6 || r.inv > 0) continue;
      toward(m.n, r.n, this.b);
      // (dead centre: thrown any way)
      if (this.b.lengthSq() < 0.5) this.b.copy(r.f).negate();
      toward(r.n, m.n, this.c);
      this.c.negate();
      if (this.c.lengthSq() < 0.5) this.c.copy(r.f).negate();
      this.hurt(r, this.c, 1.3, 7.5, 8.5);
      this.drop(r, this.c, 3.2);
      this.pop(T("OUCH!", "好痛！"), "#ffd23f", r.n, r.h + 3.3, 24);
      if (r.p.human) sfx.hit();
    }
  }

  /** Stunned and thrown along `dir` (tangent, unit). */
  private hurt(r: Runner, dir: Vec, stun: number, speed: number, up: number) {
    r.stun = stun;
    r.inv = stun + 0.7;
    r.dash = 0;
    r.v.copy(dir).multiplyScalar(speed);
    r.vh = up;
    r.grounded = false;
    r.spinV = 15;
    r.av.hit();
    r.goal = null;
  }

  // ---- runners -------------------------------------------------------------------------------------

  private dashOff(r: Runner, dir: Vec) {
    r.dash = DASH_T;
    r.cd = DASH_CD + DASH_T;
    r.dashDir.copy(dir);
    flat(r.dashDir, r.n).normalize();
    r.f.copy(r.dashDir);
    if (r.grounded) ((r.vh = 3), (r.grounded = false));
    const me = this.me();
    snd.dash(r === me ? 0.2 : clamp(0.1 - arcM(me.n, r.n) * 0.006, 0.02, 0.1));
    this.fx.burst(this.a.copy(r.n).multiplyScalar(R + 0.15), 7, DUST, { speed: 2.2, up: r.n, kick: 1.5, grav: 6, size: 0.18, life: 0.45, dir: this.b.copy(r.dashDir).multiplyScalar(-2) });
  }

  private bonk(by: Runner, o: Runner) {
    toward(by.n, o.n, this.b);
    this.b.multiplyScalar(0.6).addScaledVector(by.dashDir, 0.8).normalize();
    this.hurt(o, this.b, 0.85, 7, 6);
    o.spinV = 11;
    by.dash = 0;
    by.v.multiplyScalar(0.25);
    this.drop(o, this.b, 2.3);
    this.c.copy(by.n).add(o.n).normalize();
    this.fx.burst(this.d.copy(this.c).multiplyScalar(R + 1.0), 16, STARS, { speed: 6, up: this.c, kick: 3, grav: 6, size: 0.2, life: 0.6, bounce: false });
    this.pop(T("BONK!", "砰！"), "#ffd23f", this.c, 2.6, 30);
    const mine = by.p.human || o.p.human;
    snd.bonk(mine ? 0.4 : 0.15);
    if (mine) this.cam.shake(0.35);
  }

  /** The human's arrows, in the camera's frame carried to where the human stands. */
  private steer(r: Runner, input: Input) {
    const ax = input.axis();
    r.want.set(0, 0, 0);
    if (input.pressed("a")) r.buf = 0.15;
    if (r.stun > 0 || this.over) return;
    const fw = this.a.copy(this.cf);
    flat(fw, r.n);
    if (fw.lengthSq() < 1e-6) fw.copy(r.f);
    fw.normalize();
    const rt = this.b.crossVectors(fw, r.n);
    r.want.addScaledVector(fw, -ax.y).addScaledVector(rt, ax.x);
    const l = r.want.length();
    if (l > 1) r.want.multiplyScalar(1 / l);
    if (r.buf > 0 && r.cd <= 0 && r.dash <= 0) ((r.buf = 0), this.dashOff(r, l > 0.1 ? r.want : r.f));
  }

  private aiSpeed(r: Runner) {
    return SPEED * (0.8 + 0.2 * r.p.skill);
  }

  /** The AI's pick: the flag worth the most for the time it takes, given who else is nearer. */
  private pick(r: Runner) {
    const sk = r.p.skill;
    const w = clamp((sk - 0.3) / 0.55, 0, 1);
    let best: Flag | null = null;
    let bestS = -1;
    const sp = this.aiSpeed(r);
    for (const f of this.flags) {
      if ((!this.grabbable(f) && f.state !== S_FLY) || f.age < f.seen[r.seat]) continue;
      const at = this.flagAt(f);
      const d = arcM(r.n, at);
      toward(r.n, at, this.a);
      const turn = 1 - r.f.dot(this.a);
      const time = d / sp + turn * 0.12 + 0.2;
      let val = f.value;
      // (the better ones see who will get there first, and leave it)
      for (const o of this.run) {
        if (o === r) continue;
        const to = arcM(o.n, at) / SPEED + o.stun;
        if (to < time * 0.78) val *= 1 - 0.75 * w;
      }
      // (and a ring about to blow on it)
      for (const m of this.mets) if (m.live && m.t >= m.notice[r.seat] && arcM(m.n, at) < MET_R && m.T - m.t > time - 0.4) val *= 1 - 0.5 * w;
      if (f.gold) val *= 1 + (1 - sk) * 0.7;
      let score = (val / (time + 0.7)) * (1 + (this.rnd() - 0.5) * (1 - sk) * 0.7);
      if (f === r.goal) score *= 1.2;
      if (score > bestS) ((bestS = score), (best = f));
    }
    return best;
  }

  private ai(r: Runner, dt: number) {
    const sk = r.p.skill;
    r.want.set(0, 0, 0);
    if (r.stun > 0 || this.over) return;
    r.think -= dt;
    if (r.goal && !this.grabbable(r.goal) && r.goal.state !== S_FLY) r.goal = null;
    if (r.think <= 0 || !r.goal) {
      r.think = lerp(0.6, 0.14, sk) * (0.7 + this.rnd() * 0.6);
      r.goal = this.pick(r);
    }
    const want = r.want;
    let gd = 0;
    if (r.goal && r.sulk <= 0) {
      const at = this.flagAt(r.goal);
      gd = arcM(r.n, at);
      toward(r.n, at, want);
    } else want.copy(r.f).multiplyScalar(r.sulk > 0 ? 0.15 : 0.4);
    // (the weaker ones wander off the line)
    if (want.lengthSq() > 0) {
      const wob = Math.sin(this.t * (1.3 + r.seat * 0.37) + r.wob) * (1 - sk) * 0.55;
      want.applyQuaternion(this.q.setFromAxisAngle(r.n, wob));
    }
    // round the trees and the tower
    for (const o of this.obst) {
      const d = arcM(r.n, o.n);
      const lim = o.r + PR + 1.1;
      if (d > lim) continue;
      toward(r.n, o.n, this.a);
      const ahead = this.a.dot(want);
      if (ahead <= 0) continue;
      const k = (lim - d) / 1.1;
      this.b.crossVectors(r.n, this.a);
      if (this.b.dot(want) < 0) this.b.negate();
      want.addScaledVector(this.a, -k * 0.8).addScaledVector(this.b, k * 1.4 * ahead);
    }
    // away from the rings it has seen (the good ones early, the weak ones late or never)
    for (const m of this.mets) {
      if (!m.live || m.t < m.notice[r.seat]) continue;
      const left = m.T - m.t;
      if (left > 0.45 + sk * 1.5) continue;
      const safe = MET_R + 0.3 + sk * 0.6;
      const d = arcM(r.n, m.n);
      if (d > safe + 0.6) continue;
      toward(r.n, m.n, this.a);
      if (this.a.lengthSq() < 0.5) this.a.copy(r.f).negate();
      want.addScaledVector(this.a, -clamp((safe + 0.6 - d) / 0.6, 0, 1.6) * 2.4);
    }
    // the level's push (the moon's pull, a belt), leaned against: fully by the good ones, barely by the weak
    if (want.lengthSq() > 0.01 && (this.tide ? this.tideAt(r.n, this.a) > 0 : this.belts.length > 0 && this.beltAt(r.n, this.a))) {
      const gl = want.length();
      this.b.copy(this.a).addScaledVector(want, -this.a.dot(want) / (gl * gl));
      want.addScaledVector(this.b, -(0.35 + 0.65 * sk) / this.aiSpeed(r));
    }
    flat(want, r.n);
    const l = want.length();
    if (l > 0.05) want.multiplyScalar(Math.min(1, l) / l);
    // the dash: to a flag just ahead (when someone else wants it, or always for a pro), at a rival who holds flags, or for nothing (the weak ones)
    // (on the ground, or in a low bound under the moon)
    if (r.cd > 0 || r.dash > 0 || (!r.grounded && !(this.tide && r.h - r.gh < 0.5))) return;
    if (r.goal && gd > 1.4 && gd < 3.6 && r.f.dot(want) > 0.9) {
      const at = this.flagAt(r.goal);
      let rival = Infinity;
      for (const o of this.run) if (o !== r) rival = Math.min(rival, arcM(o.n, at));
      const hot = rival < gd + 2.2;
      if ((hot || sk > 0.72) && this.rnd() < dt * (1 + sk * 8) * (hot ? 1.6 : 0.7)) return this.dashOff(r, want);
    }
    if (sk > 0.4)
      for (const o of this.run) {
        if (o === r || o.stun > 0 || o.inv > 0 || o.score === 0) continue;
        const d = arcM(r.n, o.n);
        if (d > 2.6 || d < 0.5) continue;
        toward(r.n, o.n, this.a);
        if (r.f.dot(this.a) > 0.8 && this.rnd() < dt * (sk - 0.4) * 9) return this.dashOff(r, this.a);
      }
    if (this.rnd() < dt * 0.25 * (1 - sk)) this.dashOff(r, r.f);
  }

  /** Run, turn, fall, bump into the pieces. */
  private move(r: Runner, dt: number) {
    r.stun = Math.max(0, r.stun - dt);
    r.inv = Math.max(0, r.inv - dt);
    r.cd = Math.max(0, r.cd - dt);
    r.buf = Math.max(0, r.buf - dt);
    r.sulk = Math.max(0, r.sulk - dt);
    r.flash = Math.max(0, r.flash - dt * 1.8);
    r.bad = Math.max(0, r.bad - dt * 1.8);
    if (r.dash > 0) {
      r.dash -= dt;
      r.v.copy(r.dashDir).multiplyScalar(DASH_V);
    } else {
      const top = r.p.human ? SPEED : this.aiSpeed(r);
      this.a.copy(r.want).multiplyScalar(top);
      const k = r.stun > 0 ? (r.grounded ? 3 : 0.4) : r.grounded ? ACC : ACC * AIR;
      r.v.lerp(this.a, 1 - Math.exp(-k * dt));
    }
    const sp = r.v.length();
    const f0x = r.f.x,
      f0y = r.f.y,
      f0z = r.f.z;
    // (a dash on a slow frame goes in short moves, each against the pieces: never past the middle of
    // a thin one, a lamp post, a palm, at once, which threw it out the far side)
    const n = Math.min(4, Math.ceil(((sp + 4) * dt) / 0.3)) || 1;
    const h = dt / n;
    let gk = 1;
    let tk = 0;
    for (let i = 0; i < n; i++) {
      const sv = i ? r.v.length() : sp;
      if (sv > 1e-4) slide(r.n, this.b.copy(r.v).multiplyScalar(1 / sv), (sv * h) / R, r.v, r.f);
      // the level's push: the moon's pull (in the air too), a belt under the feet
      if (this.tide) {
        tk = this.tideAt(r.n, this.e);
        const pl = this.e.length();
        if (pl > 0.01) slide(r.n, this.e.multiplyScalar(1 / pl), (pl * h) / R, r.v, r.f);
        gk = 1 - 0.68 * tk;
      } else if (this.belts.length && this.started && r.h - r.gh < 0.35 && this.beltAt(r.n, this.e)) {
        const pl = this.e.length();
        if (pl > 0.01) slide(r.n, this.e.multiplyScalar(1 / pl), (pl * h) / R, r.v, r.f);
      }
      flat(r.v, r.n);
      flat(r.f, r.n).normalize();
      // the pieces hold it back (and slide it round)
      for (const o of this.obst) {
        const d = arcM(r.n, o.n);
        const lim = o.r + PR;
        if (d >= lim) continue;
        toward(r.n, o.n, this.c);
        this.c.negate();
        if (this.c.lengthSq() < 0.5) this.c.copy(r.f).negate();
        slide(r.n, this.c, (lim - d) / R, r.v, r.f);
        const vd = r.v.dot(this.c);
        if (vd < 0) r.v.addScaledVector(this.c, -vd);
      }
    }
    // facing: toward where it runs (stunned: it spins)
    const sp2 = r.v.length();
    r.turn = 0;
    if (r.dash <= 0 && r.stun <= 0 && sp2 > 0.6) {
      this.c.copy(r.v).multiplyScalar(1 / sp2);
      const ang = Math.atan2(this.d.crossVectors(r.f, this.c).dot(r.n), r.f.dot(this.c));
      const step = ang * Math.min(1, 15 * dt);
      r.f.applyQuaternion(this.q.setFromAxisAngle(r.n, step));
      flat(r.f, r.n).normalize();
    }
    // (its turn, measured, for the legs)
    this.c.set(f0x, f0y, f0z);
    flat(this.c, r.n);
    if (dt > 0 && this.c.lengthSq() > 1e-6) r.turn = Math.atan2(this.d.crossVectors(this.c.normalize(), r.f).dot(r.n), this.c.dot(r.f)) / dt;
    r.spin += r.spinV * dt;
    r.spinV *= Math.exp(-2.6 * dt);
    if (r.stun <= 0 && Math.abs(r.spinV) < 2) {
      // (back to facing ahead after a spin)
      r.spin = Math.atan2(Math.sin(r.spin), Math.cos(r.spin)) * Math.exp(-10 * dt);
      r.spinV = 0;
    }
    // up and down
    const gnd = this.groundAt(r.n);
    r.gh += (gnd - r.gh) * (1 - Math.exp(-12 * dt));
    if (r.grounded && r.vh <= 0) {
      r.h = r.gh;
      r.vh = 0;
      // (light under the moon: it bounds along as it runs)
      if (tk > 0.35 && sp > 1.5 && r.dash <= 0) ((r.vh = 2.5), (r.grounded = false));
    } else {
      r.vh -= G * gk * dt;
      // (the fall's own half step, so a hop is as high at any frame rate as at 60 a second)
      r.h += (r.vh + 0.5 * G * gk * (dt - 1 / 60)) * dt;
      if (r.h <= r.gh && r.vh <= 0) {
        if (r.vh < -3) r.av.body.land(Math.min(8, -r.vh));
        r.h = r.gh;
        r.vh = 0;
        r.grounded = true;
        if (r.stun > 0) this.fx.burst(this.a.copy(r.n).multiplyScalar(R + 0.1), 8, DUST, { speed: 2.5, up: r.n, kick: 2, grav: 10, size: 0.16, life: 0.5 });
      }
    }
    // splashing through the pond
    if (gnd < 0 && r.grounded && sp2 > 2) {
      r.splash -= dt;
      if (r.splash <= 0) {
        r.splash = 0.12;
        B_SPLASH.up = r.n;
        this.fx.burst(this.a.copy(r.n).multiplyScalar(R), 4, WATER, B_SPLASH);
        const me = this.me();
        if (r === me) snd.splash(0.06);
      }
    }
    // a puff at each few steps on dry ground (sand, dust, sparks on the steel)
    if (gnd >= 0 && r.grounded && sp2 > 4.2 && r.stun <= 0) {
      r.dust -= dt;
      if (r.dust <= 0) {
        r.dust = 0.15 + Math.random() * 0.05;
        B_STEP.up = r.n;
        this.fx.burst(this.a.copy(r.n).multiplyScalar(R + 0.06), 2, this.stepCols, B_STEP);
      }
    }
    const lean = r.dash > 0 ? 0.5 : r.stun > 0 ? -0.15 : clamp(sp2 / SPEED, 0, 1) * 0.08;
    r.lean += (lean - r.lean) * (1 - Math.exp(-14 * dt));
  }

  /** Runners bump each other apart; a dash into one is a bonk. */
  private contacts() {
    const run = this.run;
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const a = run[i],
          b = run[j];
        const d = arcM(a.n, b.n);
        if (!this.over && d < TACKLE && Math.abs(a.h - b.h) < 1.4) {
          const ad = a.dash > 0 && b.inv <= 0 && b.stun <= 0;
          const bd = b.dash > 0 && a.inv <= 0 && a.stun <= 0;
          if (ad && bd) {
            // (both dashing: the one aimed at the other wins; head-on, both go down. It used to be the lower seat's, always)
            toward(a.n, b.n, this.c);
            const qa = a.dashDir.dot(this.c);
            toward(b.n, a.n, this.c);
            const qb = b.dashDir.dot(this.c);
            if (qa > qb + 0.3) this.bonk(a, b);
            else if (qb > qa + 0.3) this.bonk(b, a);
            else {
              this.bonk(a, b);
              // (b is thrown as hard as a: its own tackle must not brake its fall)
              const vx = b.v.x,
                vy = b.v.y,
                vz = b.v.z;
              this.bonk(b, a);
              b.v.set(vx, vy, vz);
            }
          } else if (ad) this.bonk(a, b);
          else if (bd) this.bonk(b, a);
        }
        if (d < PR * 2 && d > 1e-5) {
          const push = (PR * 2 - d) / 2 / R;
          toward(a.n, b.n, this.c);
          this.c.negate();
          slide(a.n, this.c, push, a.v, a.f);
          toward(b.n, a.n, this.c);
          this.c.negate();
          slide(b.n, this.c, push, b.v, b.f);
        }
      }
  }

  /** Place and pose a runner: root on the normal, its shadow and ring hugging the ground. */
  private sync(r: Runner, dt: number) {
    const av = r.av;
    av.root.position.copy(r.n).multiplyScalar(R + r.h);
    stand(av.root.quaternion, r.n, r.f);
    if (r.spin) av.root.quaternion.multiply(this.q.setFromAxisAngle(UP, r.spin));
    if (r.lean) av.root.quaternion.multiply(this.q.setFromAxisAngle(XX, r.lean));
    av.body.update(dt, { speed: Math.min(9, r.dash > 0 ? 9 : r.v.length()), grounded: r.grounded, vy: r.vh, turnRate: clamp(r.turn, -12, 12) });
    av.angry = r.sulk > 0 || r.stun > 0;
    const up = Math.max(0, r.h - r.gh);
    if (av.shadow) {
      av.shadow.position.copy(r.n).multiplyScalar(R + r.gh + 0.05);
      av.shadow.quaternion.setFromUnitVectors(ZAX, r.n);
      const s = 1.1 * Math.max(0.4, 1 - up * 0.14);
      av.shadow.scale.set(s, s, 1);
    }
    if (av.ring) {
      av.ring.visible = up < 1.2;
      av.ring.position.copy(r.n).multiplyScalar(R + r.gh + 0.07);
      av.ring.quaternion.setFromUnitVectors(ZAX, r.n);
      // (blinks while it can't be hit)
      av.ring.visible = up < 1.2 && !(r.inv > 0 && Math.sin(this.t * 30) > 0.3);
    }
    if (av.marker) {
      av.marker.visible = true;
      av.marker.position.y = 2.35 + Math.sin(this.t * 4 + r.seat) * 0.08;
      av.marker.rotation.y = this.t * 2;
    }
  }

  private dizzyStars() {
    let k = 0;
    for (const r of this.run) {
      if (r.stun <= 0) continue;
      const c = this.c.crossVectors(r.n, r.f);
      for (let i = 0; i < 3; i++) {
        const a = this.t * 7 + (i * Math.PI * 2) / 3;
        this.a
          .copy(r.n)
          .multiplyScalar(R + r.h + 1.95)
          .addScaledVector(r.f, Math.cos(a) * 0.45)
          .addScaledVector(c, Math.sin(a) * 0.45);
        this.q.setFromAxisAngle(r.n, a * 2);
        this.m4.compose(this.a, this.q, this.sc.setScalar(0.16));
        this.dizzy.setMatrixAt(k++, this.m4);
      }
    }
    this.dizzy.count = k;
    this.dizzy.instanceMatrix.needsUpdate = true;
  }

  // ---- the camera and the light ------------------------------------------------------------------

  /** The play camera from its frame (`zoom` > 1: further out). */
  private playCam(eye: Vec, at: Vec, zoom = 1) {
    const base = this.d.copy(this.cn).multiplyScalar(R);
    eye.copy(base).addScaledVector(this.cn, CAM_UP * zoom).addScaledVector(this.cf, -CAM_BACK * zoom);
    at.copy(base).addScaledVector(this.cf, CAM_AHEAD).addScaledVector(this.cn, 0.6);
  }

  /** The frame eases toward the human (a little ahead of them), carrying its forward along. */
  private chase(dt: number, k = 5) {
    const me = this.me();
    const tgt = this.e.copy(me.n);
    const sp = me.v.length();
    if (sp > 0.5) slide(tgt, this.a.copy(me.v).multiplyScalar(1 / sp), (sp * 0.12) / R);
    const nn = this.b.copy(this.cn).lerp(tgt, 1 - Math.exp(-k * dt)).normalize();
    this.q.setFromUnitVectors(this.cn, nn);
    this.cf.applyQuaternion(this.q);
    this.cn.copy(nn);
    flat(this.cf, this.cn).normalize();
  }

  private cardCam(k: number) {
    const a = Math.PI * 0.82 + k * 0.22;
    const k2 = R / 8;
    this.cam.set(this.a.set(Math.sin(a) * 25 * k2, 13 * k2, Math.cos(a) * 25 * k2), this.b.set(0, 1.5, 0));
    this.w.camera.up.set(0, 1, 0);
  }

  /** A cel material of the game's own for a prop that stands up (it opens over the runner). */
  private prop(color: string, emissive = "#000000") {
    return seeThrough(new THREE.MeshToonMaterial({ color, emissive, gradientMap: toonSteps() }));
  }

  /** The key light's shadows, by the stage's tier (as shadows.ts deals them: 2048 high, 1024 mid on a computer, none on a touch screen). */
  private shadows() {
    const q = postQuality.quality;
    const px = SHADOWS_OFF ? 0 : q === "high" ? 2048 : SHADOWS_FORCED || (q === "mid" && !touchy()) ? 1024 : 0;
    if (px === this.shadowPx) return;
    this.shadowPx = px;
    const key = this.key;
    key.castShadow = px > 0;
    if (px > 0) {
      key.shadow.mapSize.set(px, px);
      key.shadow.normalBias = ((2 * (R + 6.6)) / px) * 1.6;
      key.shadow.intensity = 0.72 * this.lv.shade;
    }
    // (under a real shadow only a soft contact patch is left of a runner's blob)
    for (const r of this.run) if (r.av.shadow) (r.av.shadow.material as THREE.MeshBasicMaterial).opacity = px > 0 ? 0.4 : 1;
  }

  /**
   * The light. Wherever the human runs it is lit: the key comes from overhead, turning with the camera's
   * frame; but it leans toward the level's sun, so the planet's day side faces the sun in the sky, and
   * toward the far side the key and the sky light cool. The rim comes from across the key.
   */
  private light() {
    const n = this.cn;
    const rt = this.a.crossVectors(this.cf, n);
    const u = this.sunDir.dot(n);
    // (the sun along the ground here: nothing at noon and at midnight, where the key leans as it always did)
    const st = this.b.copy(this.sunDir).addScaledVector(n, -u);
    const k = 1 - st.length();
    const L = this.c
      .copy(n)
      .addScaledVector(st, 0.75)
      .addScaledVector(rt, -0.55 * k)
      .addScaledVector(this.cf, -0.35 * k)
      .normalize();
    this.key.position.copy(L).multiplyScalar(60);
    this.key.target.position.set(0, 0, 0);
    this.key.shadow.camera.up.copy(this.cf);
    const d0 = clamp((u + 0.85) / 0.75, 0, 1);
    const day = d0 * d0 * (3 - 2 * d0);
    this.key.color.copy(this.keyC[0]).lerp(this.keyC[1], day);
    this.key.intensity = this.lv.sun * (0.84 + 0.16 * day);
    this.w.hemi.color.copy(this.fillC[0]).lerp(this.fillC[1], day);
    const t = this.d.copy(L).addScaledVector(n, -L.dot(n));
    if (t.lengthSq() < 1e-6) t.copy(this.cf);
    t.normalize();
    this.rim.position.copy(n).multiplyScalar(0.45).addScaledVector(t, -1).multiplyScalar(60);
    this.rim.target.position.set(0, 0, 0);
    this.w.hemi.position.copy(n);
    this.shadows();
    // the hole in the props over the runner
    const me = this.me();
    SEE.at.value.copy(me.n).multiplyScalar(R + me.h + 0.9);
    SEE.r.value = this.seeK * 1.5;
  }

  private ambient(dt: number) {
    if (this.topQ) this.topQ.rotation.y += dt * 1.6;
    const lt = this.t + this.camT;
    WIND.t.value = lt;
    for (const d of this.drift) d.o.rotateOnAxis(d.ax, dt * d.v);
    for (const e of this.embers) {
      const k = (lt / 11 + e.ph) % 1;
      e.pts.scale.setScalar(0.82 + k * 0.5);
      e.pts.rotation.y = lt * 0.02 + e.ph * 3;
      e.mat.opacity = Math.sin(k * Math.PI) * 0.95;
    }
    // (the water's two sheets slide across each other; a shore's lines roll in)
    if (this.waves.length) (this.waves[0].offset.set(lt * 0.05, lt * 0.028), this.waves[1].offset.set(-lt * 0.036, lt * 0.044));
    if (this.shoreTex) this.shoreTex.offset.y = lt * 0.34;
    for (let i = 0; i < this.twinkle.length; i++) this.twinkle[i].opacity = 0.72 + Math.sin(lt * (1.7 + i * 0.9) + i * 2) * 0.28;
    this.stepShooting(dt);
    if (this.lv.key === "tide") this.lifeTide(dt, lt);
    else if (this.lv.key === "foundry") this.lifeFoundry(dt, lt);
    else this.lifeMeadow(dt, lt);
    if (this.lv.key === "tide") {
      this.orbits[0].rotation.z += dt * 0.012;
      if (this.sea) (this.sea.material as THREE.MeshToonMaterial).emissiveIntensity = 0.9 + Math.sin((this.t + this.camT) * 1.3) * 0.15;
      return;
    }
    this.orbits[0].rotation.y += dt * 0.025;
    this.orbits[1].rotation.y -= dt * 0.04;
    for (const c of this.orbits[1].children) ((c.rotation.x += dt * 0.6), (c.rotation.y += dt * 0.9));
    if (this.lv.key === "meadow") {
      this.topQ!.position.y = 3.75 + Math.sin(this.t * 2.2) * 0.12;
      this.crystalMat.emissiveIntensity = 0.8 + Math.sin(this.t * 2.5) * 0.35;
    }
  }

  // ---- the phases ----------------------------------------------------------------------------------

  private camT = 0;
  private twistSaid = false;

  idle(dt: number, phase: "card" | "count", k: number) {
    R = this.lv.r;
    this.camT += dt;
    this.seeK = phase === "card" ? 0 : ease(k);
    if (phase === "card") this.cardCam(k);
    else {
      if (!this.camFrom) this.camFrom = { eye: this.cam.eye.clone(), at: this.cam.at.clone(), up: this.w.camera.up.clone() };
      const e = ease(k);
      this.playCam(this.c, this.d);
      this.cam.set(this.c.lerp(this.camFrom.eye, 1 - e), this.e.copy(this.d).lerp(this.camFrom.at, 1 - e));
      this.w.camera.up.copy(this.camFrom.up).lerp(this.cn, e).normalize();
    }
    this.light();
    this.cam.apply(dt);
    this.ambient(dt);
    this.tideStep(dt, false);
    this.beltStep(dt, false);
    for (const r of this.run) {
      r.want.set(0, 0, 0);
      this.move(r, dt);
      this.sync(r, dt);
    }
    this.updateFlags(dt);
    this.fx.update(dt);
  }

  update(dt: number, input: Input) {
    R = this.lv.r;
    if (!this.started) {
      this.started = true;
      // the first two: one ahead to the left, one further to the right
      const n0 = v3(0, 1, 0);
      for (const [bear, dist] of [
        [0.55, 6.2],
        [-0.85, 8.6],
      ]) {
        const dir = v3(0, 0, 1).applyAxisAngle(n0, bear + (this.rnd() - 0.5) * 0.2);
        const n = n0.clone();
        slide(n, dir, dist / R);
        for (let k = 0; k < 8 && this.blocked(n, 0.8); k++) slide(n, dir, 0.6 / R);
        this.spawn(n, false);
      }
      this.nextFlag = 1.5;
    }
    this.t += dt;
    if (this.over) this.overT += dt;
    // the clock
    if (!this.over && this.t >= TIME) this.finish();
    // the level's twist: told at the start, then the moon goes round, the belts run
    if (!this.twistSaid && this.t >= 1.2) {
      this.twistSaid = true;
      if (this.tide) (this.flashBan(T("MOON PULL!", "月亮引力！"), T("its glowing circle drags you in · you float", "发光圈会把你拉进去 · 还会飘起来"), "#9fe8ff", 2.4), beep(220, 0.8, "sine", 0.16, 440));
      else if (this.belts.length) (this.flashBan(T("CONVEYOR BELTS!", "传送带！"), T("they carry you and the flags", "载着你和旗子跑"), "#ffb21e", 2.4), beep(330, 0.2, "square", 0.14), beep(440, 0.3, "square", 0.14, 0, 0.18));
    }
    this.tideStep(dt, true);
    this.beltStep(dt, true);
    if (!this.over) {
      if (!this.metsOn && this.t >= MET_AT - 0.6) ((this.metsOn = true), this.flashBan(T("METEORS!", "流星来袭！"), T("dodge the red rings", "躲开红圈"), "#ff5d73", 1.8), sfx.whoosh());
      if (!this.hurry && this.t >= HURRY_AT) {
        this.hurry = true;
        this.flashBan(T("HURRY!", "快点！"), T("more flags · more meteors", "更多旗子 · 更多流星"), "#ffd23f", 1.8);
        music.rate(1.15);
        sfx.go();
      }
      // flags: two up (three at the end), a gold one now and then
      const want = this.hurry ? 3 : 2;
      let up = 0;
      for (const f of this.flags) if ((f.state === S_RISE || f.state === S_LIVE) && !f.loose && !f.gold) up++;
      if (up < want && this.t >= this.nextFlag) {
        this.spawn(this.spot(this.e, false), false);
        this.nextFlag = this.t + 0.35;
      }
      if (this.goldI < GOLD_AT.length && this.t >= GOLD_AT[this.goldI]) {
        this.goldI++;
        this.spawn(this.spot(this.e, true), true);
        this.flashBan(T("GOLDEN FLAG!", "金旗出现！"), T("worth 3", "价值 3 面"), GOLD_C, 1.7);
      }
      // meteors
      if (this.t >= MET_AT && this.t >= this.nextMet && this.t < TIME - 1) {
        this.meteor();
        if (this.hurry && this.rnd() < 0.35) this.meteor();
        const gap = this.t < 20 ? lerp(2.5, 1.7, (this.t - MET_AT) / 12) : this.t < HURRY_AT ? 1.35 : 0.8;
        this.nextMet = this.t + gap * this.lv.metGap * (0.8 + this.rnd() * 0.4);
      }
    }
    // the runners
    for (const r of this.run) {
      if (r.p.human) this.steer(r, inputOf(r.p, input));
      else this.ai(r, dt);
      this.move(r, dt);
    }
    this.contacts();
    // (the human into the moon's circle: a swell)
    if (this.tide && this.human) {
      const inside = this.tideAt(this.human.n, this.d) > 0;
      if (inside && !this.tide.inside) {
        hiss(0.8, 0.14, "lowpass", 260, 0, 1600);
        beep(196, 0.7, "sine", 0.12, 392);
        const h = this.human;
        this.fx.burst(this.a.copy(h.n).multiplyScalar(R + 0.3), 16, MOTES, { speed: 2.2, up: h.n, kick: 2.6, grav: -1.2, size: 0.13, life: 1.1, drag: 1.2, bounce: false });
      }
      this.tide.inside = inside;
    }
    // grabs: the nearest one in reach gets it
    if (!this.over)
      for (const f of this.flags) {
        if (!this.grabbable(f)) continue;
        let who: Runner | null = null;
        let bd = GRAB;
        for (const r of this.run) {
          if (r.stun > 0) continue;
          const d = arcM(r.n, f.n);
          const fh = f.state === S_FLY ? 1.3 * (1 - f.t / 0.6) : 0;
          if (d < bd && Math.abs(r.h - fh) < 1.4) ((bd = d), (who = r));
        }
        if (who) this.grab(who, f);
      }
    this.updateMeteors(dt);
    this.updateFlags(dt);
    // the camera follows (and pulls out at the end)
    this.chase(dt);
    const z = this.over ? 1 + ease(Math.min(1, this.overT / 1.4)) * 0.45 : 1;
    this.playCam(this.c, this.e, z);
    this.cam.set(this.c, this.e);
    this.w.camera.up.copy(this.cn);
    this.seeK = Math.min(1, this.seeK + dt * 3);
    this.light();
    this.cam.apply(dt);
    for (const r of this.run) this.sync(r, dt);
    this.dizzyStars();
    this.ambient(dt);
    this.fx.update(dt);
    let np = 0;
    for (const p of this.pops) if ((p.t += dt) < 1) this.pops[np++] = p;
    this.pops.length = np;
    this.ban.t += dt;
  }

  private finish() {
    const score = this.run.map((r) => r.score);
    const tie = this.run.map((r) => -(r.reach[r.score] ?? 0));
    this.over = rankBy(score, tie);
    const win = this.run[this.over[0]];
    win.av.cheer(3);
    win.vh = 7;
    win.grounded = false;
    this.run[this.over[3]].sulk = 3;
    for (const r of this.run) r.want.set(0, 0, 0);
  }

  private hud = { vals: ["0", "0", "0", "0"], lead: [] as number[], sub: ["", "", "", ""] };
  private dizzyTxt = T("DIZZY!", "晕了！");

  private flashBan(s: string, sub: string, c: string, dur: number) {
    this.ban = { s, sub, c, t: 0 };
    this.banDur = dur;
  }
  private banDur = 1.6;

  private pop(s: string, c: string, n: Vec, h: number, size: number) {
    this.pops.push({ s, c, at: n.clone().multiplyScalar(R + h), t: 0, size });
  }

  view() {
    return this.w;
  }

  // ---- the HUD -------------------------------------------------------------------------------------

  /** Is the point hidden behind the planet from the camera? */
  private behind(p: Vec) {
    const e = this.w.camera.position;
    const dx = p.x - e.x,
      dy = p.y - e.y,
      dz = p.z - e.z;
    const a = dx * dx + dy * dy + dz * dz;
    const b = 2 * (e.x * dx + e.y * dy + e.z * dz);
    const c = e.lengthSq() - (R - 0.3) * (R - 0.3);
    const disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    const t1 = (-b - Math.sqrt(disc)) / (2 * a);
    return t1 > 0 && t1 < 1;
  }

  draw(g: CanvasRenderingContext2D, t: number) {
    R = this.lv.r;
    const cam = this.w.camera;
    const me = this.me();
    // name tags
    for (const r of this.run) {
      const p = this.a.copy(r.n).multiplyScalar(R + r.h + 2.95);
      if (this.behind(p)) continue;
      const s = toScreen(p, cam);
      if (!s.on) continue;
      tag(g, r.p, s.x, s.y);
      if (r === this.human && this.started && !this.over) {
        // (beside the tag as it is drawn: on a small screen the tag grows about its point, and the badge with the HUD)
        const k = fpx(14) / 14;
        const hk = HUD.thumbs ? Math.min(1.35, HUD.k) : 1;
        this.dashBadge(g, s.x + 29 * k + 13 * hk, s.y + 23 - 23 * k, r, hk);
      }
    }
    // the pops (+1, BONK!)
    for (const p of this.pops) {
      if (this.behind(p.at)) continue;
      const s = toScreen(p.at, cam);
      if (!s.on) continue;
      const k = p.t;
      g.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
      shout(g, p.s, s.x, s.y - 34 * ease(Math.min(1, k * 1.6)), p.size * (k < 0.12 ? 0.6 + (k / 0.12) * 0.5 : 1.1 - Math.min(0.1, (k - 0.12) * 0.4)), p.c);
      g.globalAlpha = 1;
    }
    if (this.started && !this.over) this.arrows(g, t, me);
    // the corners: flags held
    const { vals, lead, sub } = this.hud;
    let top = 0;
    for (const r of this.run) top = Math.max(top, r.score);
    lead.length = 0;
    for (const r of this.run) {
      vals[r.seat] = String(r.score);
      sub[r.seat] = r.stun > 0 ? this.dizzyTxt : "";
      if (top > 0 && r.score === top) lead.push(r.seat);
    }
    corners(g, this.players, vals, this.hud);
    for (const r of this.run) {
      const i = r.seat;
      // (a small screen: a panel with a line under the name grows wider, as corners() draws it)
      let pw = 196;
      g.font = `900 27px ${FONT}`;
      const tw = g.measureText(vals[i]).width;
      if (HUD.min && sub[i]) {
        g.font = `700 11px ${FONT}`;
        pw = clamp(Math.ceil(60 + g.measureText(sub[i]).width + tw + 8 + 12), 196, 296);
      }
      const [x, y] = cornerSpot(i, 14, pw);
      flagIcon(g, x + pw - 12 - tw - 15, y + 30, 1.15, r.flash > 0 ? "#ffffff" : ACCENT);
      if (r.flash > 0 || r.bad > 0) {
        g.save();
        g.globalAlpha = Math.max(r.flash, r.bad);
        rr(g, x - 2, y - 2, pw + 4, 62, 18);
        g.strokeStyle = r.flash >= r.bad ? r.p.color : "#ff4d6d";
        g.lineWidth = 4;
        g.stroke();
        g.restore();
      }
    }
    clock(g, this.over ? 0 : TIME - this.t);
    // the banner
    const bk = this.ban.t / this.banDur;
    if (this.ban.s && bk < 1) {
      banner(g, this.ban.s, bk, this.ban.c, H * 0.3, 58);
      if (this.ban.sub) banner(g, this.ban.sub, bk, "#ffffff", H * 0.3 + 48, 22);
    }
  }

  /** The dash, ready (a bright A; the dash's own sign on a touch screen) or cooling (a filling ring), beside the human's tag. */
  private dashBadge(g: CanvasRenderingContext2D, x: number, y: number, r: Runner, k = 1) {
    const ready = r.cd <= 0;
    const act = touchy() ? actsOf("planet").a : undefined;
    g.save();
    g.beginPath();
    g.arc(x, y, 10.5 * k, 0, Math.PI * 2);
    g.fillStyle = ready ? ACCENT : "rgba(14,10,30,0.8)";
    g.fill();
    if (!ready) {
      const c = 1 - r.cd / (DASH_CD + DASH_T);
      g.beginPath();
      g.arc(x, y, 8.5 * k, -Math.PI / 2, -Math.PI / 2 + c * Math.PI * 2);
      g.strokeStyle = "rgba(169,139,255,0.95)";
      g.lineWidth = 3 * k;
      g.stroke();
    } else {
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2 * k;
      g.stroke();
    }
    if (act) actIcon(g, act, x, y, 13 * k, ready ? "#140d2a" : "rgba(255,255,255,0.55)");
    else text(g, "A", x, y + 1, 11.5 * k, ready ? "#140d2a" : "rgba(255,255,255,0.55)", "center", 900);
    g.restore();
  }

  /** Flags out of sight (round the far side, off the screen): a chip round the human that points the way there, the nearest one's distance beside it. */
  private arrows(g: CanvasRenderingContext2D, t: number, me: Runner) {
    const cam = this.w.camera;
    // (a small screen: the chips grow with the HUD's panels, and stand a little further off the runner)
    const hk = HUD.thumbs ? Math.min(1.35, HUD.k) : 1;
    const body = this.b.copy(me.n).multiplyScalar(R + me.h + 0.9);
    const s0 = toScreen(body, cam);
    const x0 = s0.x,
      y0 = s0.y;
    // the nearest flag first
    let near: Flag | null = null;
    let nd = Infinity;
    for (const f of this.flags) {
      if (f.state !== S_LIVE && f.state !== S_RISE && f.state !== S_FLY) continue;
      const d = arcM(me.n, this.flagAt(f));
      if (d < nd) ((nd = d), (near = f));
    }
    for (const f of this.flags) {
      if (f.state !== S_LIVE && f.state !== S_RISE && f.state !== S_FLY) continue;
      const at = this.flagAt(f);
      const p = this.c.copy(at).multiplyScalar(R + 1.3);
      const s = toScreen(p, cam);
      const seen = !this.behind(p) && s.on && s.x > 24 && s.x < W - 24 && s.y > 70 && s.y < H - 20;
      if (seen) continue;
      // the way along the surface, as the screen shows it
      toward(me.n, at, this.d);
      if (this.d.lengthSq() < 0.5) this.d.copy(me.f);
      this.e.copy(me.n);
      slide(this.e, this.d, 1.2 / R);
      this.e.multiplyScalar(R + me.h + 0.9);
      const s1 = toScreen(this.e, cam);
      let dx = s1.x - x0,
        dy = s1.y - y0;
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      const big = f === near || f.gold;
      const sc = hk * (big ? 1.22 : 0.9);
      const rad = ((big ? 82 : 66) + Math.sin(t * 7 + f.phase) * 5) * (hk > 1 ? 1.14 : 1);
      // (inside the frame, under the corner panels and the clock)
      const x = clamp(x0 + dx * rad, 20 * sc + 6, W - 20 * sc - 6),
        y = clamp(y0 + dy * rad, 76 + 20 * sc, H - 20 * sc - 6);
      const c = f.gold ? GOLD_C : FLAG_C[f.col];
      g.save();
      g.globalAlpha = big ? 1 : 0.82;
      zoom(g, x, y, sc, () => {
        g.translate(x, y);
        // a point outside the chip, the way to go
        g.save();
        g.rotate(Math.atan2(dy, dx));
        g.beginPath();
        g.moveTo(30, 0);
        g.lineTo(14, -11);
        g.lineTo(14, 11);
        g.closePath();
        g.lineJoin = "round";
        g.lineWidth = 6;
        g.strokeStyle = "rgba(12,9,28,0.92)";
        g.stroke();
        g.fillStyle = c;
        g.fill();
        g.restore();
        // the chip: a dark disc ringed in the flag's colour, a flag in it
        g.beginPath();
        g.arc(0, 0, 16.5, 0, Math.PI * 2);
        g.fillStyle = "rgba(12,9,28,0.9)";
        g.fill();
        g.lineWidth = 3.5;
        g.strokeStyle = c;
        g.stroke();
        g.beginPath();
        g.arc(0, 0, 19.5, 0, Math.PI * 2);
        g.lineWidth = 1.5;
        g.strokeStyle = "rgba(12,9,28,0.9)";
        g.stroke();
        flagIcon(g, 1, 0, 1.15, c);
        // its line (×3, the metres to go) on the side away from the point
        const ly = dy > 0.25 ? -29 : 30;
        if (f.gold) shout(g, "×3", 0, ly, 14, GOLD_C);
        else if (f === near) shout(g, `${Math.round(nd)}m`, 0, ly, 13.5, "#ffffff");
      });
      g.restore();
    }
  }

  result() {
    return this.over;
  }

  humanOut() {
    return false;
  }

  dispose() {
    for (const r of this.run) r.av.dispose();
    for (const f of this.flags) f.cloth.geometry.dispose();
    disposeScene(this.w.scene);
    const win = window as unknown as Record<string, unknown>;
    if (win.planetLab === this) delete win.planetLab;
  }
}

const ZAX = v3(0, 0, 1);
const WHITE = new THREE.Color("#ffffff");
const easeOutQ = (k: number) => 1 - (1 - k) * (1 - k);

/** A little flag: a pole and a cloth. */
function flagIcon(g: CanvasRenderingContext2D, x: number, y: number, s: number, c: string) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = "#ffffff";
  g.fillRect(-6, -9, 2.5, 18);
  g.beginPath();
  g.moveTo(-3.5, -9);
  g.lineTo(8, -5.5);
  g.lineTo(-3.5, -1);
  g.closePath();
  g.fillStyle = c;
  g.fill();
  g.lineWidth = 1.2;
  g.strokeStyle = "rgba(12,9,28,0.6)";
  g.stroke();
  g.restore();
}

export const PLANET: MiniDef = {
  key: "planet",
  title: "PLANET GRAB",
  titleZh: "星球抢旗",
  tag: "Sprint round a tiny planet and snag the flags: a meadow, an ocean world, a proof factory",
  tagZh: "绕着小星球狂奔，抢下旗子：草原、海洋星球、证明工厂",
  help: "Arrows run · A dashes: bump a rival to knock a flag loose · gold flag = 3 · dodge the red meteor rings",
  helpZh: "方向键跑 · A 冲刺：撞飞对手的旗子 · 金旗值 3 · 躲开红色流星圈",
  pad: ["left", "right", "up", "down", "a"],
  tap: false,
  color: ACCENT,
  song: "lattice",
  ambience: "meadow",
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, song: l.song, ambience: l.ambience })),
  make: (players, rnd, variant) => new PlanetGrab(players, rnd, LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]),
};

export default PLANET;
