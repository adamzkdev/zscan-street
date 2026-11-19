/**
 * BUMPER SNARKS, in 3D: a bumper-ball brawl on a giant ⓩ coin floating high over the city. Each
 * zkSNARK balances on a big ball striped in their seat's colour. Roll with the arrows (screen-relative:
 * up rolls away from the camera). Hold A to wind up a ram (the ball digs in and spins, an arrow on
 * the floor shows its aim and grows with the charge), let go to launch: a tap jabs, a full charge
 * sends whoever it meets flying.
 *
 * Points, so nobody sits out: bonk a rival off +1 (the crowned leader +2), fall off −1, and the
 * fallen drop back in from the sky a moment later (a ghost for a second and a half: no spawn
 * camping). Power-ups drop in capsules (a glowing ring marks where): EQUIHASH HEAVY (three times the
 * mass, a bigger ball), HALO RAM (every ram at full charge, at once, and it breaks through heavies
 * and shields), ORCHARD SHIELD (nothing knocks you, and it saves you from one fall).
 *
 * The coin escalates, every hazard telegraphed: BUMPERS rise at 10 s (a pink ring round a
 * dark hatch shows where, 1.6 s first; touch one and it pongs you away), the coin TILTS at 20 s and
 * 28 s (orange chevrons on the floor point downhill before it leans), and at 36 s NU7 (a siren, a
 * red flash, the sky turns to alarm): no more respawns, the rim crumbles ring by ring (each ring
 * flashes red first), and whoever is still on at the end gets +1. Most points wins; ties go to
 * whoever lasted longer, then the most knockouts. (The bench: `&bumperbot` puts the game on
 * window.__bumper for a scripted human; `bot` drives the human's seat in a Node sim.)
 *
 * Physics: momentum on a slick floor, springy ball-to-ball bounces with masses; a ram adds a shove.
 * The AI (from the old 2D sumo, grown): it minds its own edge first (the tilt included), sidesteps a
 * wind-up aimed at it, rams first when someone rolls in fast, grabs power-ups (some are greedier),
 * picks on whoever is near an edge, takes revenge on whoever just rammed it, and sometimes gangs up
 * on the leader. The human gets a little more grip near the rim, takes a little less knockback, and
 * the AIs leave them be for the first seconds.
 *
 * Three arenas (bumper-levels/levels.ts; their settings in scenery.ts): SKY COIN (all of the above),
 * FROZEN LAKE RING (a ring of slick ice with a hole in the middle, blizzard gusts instead of tilts, no
 * bumpers) and MARINA LILIES (seven lily pads on the bay that drift apart three times, rams hop the
 * gaps, NU7 sinks the outer pads one by one). The floor's shape is behind solid() and edgeAt():
 * the AI, the drops and the camera only ask how far the edge is and which way is out.
 */
import * as THREE from "three";
import { T } from "../../i18n/lang";
import { HUD, clamp, ease, grow, offThumbs, rng, rr, sfx, sound, text, type Input, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { actWord } from "../acts";
import { music } from "../music";
import { crown, numeral, touchy } from "../hud";
import { drawMark } from "../theme";
import { Avatar, CamRig, Fx3, GEO, banner, blob, canvasTex, clock, corners, disposeScene, glow, outline, qBlock, short, tag, toScreen, toon, toonSteps, world, yawOf, type World } from "../k3";
import { LEVELS, type BumperLevel } from "./bumper-levels/levels";
import { WATER_Y, astanaScenery, coinScenery, marinaScenery, type Scenery } from "./bumper-levels/scenery";

// ---- the rules -------------------------------------------------------------------------------------

/** Respawns until NU7 (s); the time cap (s). */
const BRAWL = 36;
const LIMIT = 58;
/** Points: a knockout, the leader's knockout, a fall, still on at the end. */
const KO_PTS = 1;
const LEAD_PTS = 2;
const FALL_PTS = -1;
const LAST_PTS = 1;
/** A fall counts for whoever bumped you last, this recently (s). */
const CREDIT = 3;
/** A ball's radius, the snark's size on it. */
const BR = 0.85;
const MS = 1.0;
/** The arena's slab's thickness (its rings and their sizes are the level's). */
const TH = 1.1;
/** The lily pads: the middle one's radius, the six round it (their radius, how far out their centres sit), their slabs' thickness. */
const PAD_C = 3.8;
const PAD_R = 3.2;
const PAD_D = 5.8;
const PAD_TH = 0.5;
/** A drift: its warning (s), the way out, the hold apart, the way back. */
const DRIFT_WARN = 1.7;
const DRIFT_OUT = 1.3;
const DRIFT_HOLD = 4.6;
const DRIFT_BACK = 1.3;
/** NU7: the first ring goes QD_LEAD s in, then one every QD_STEP s, each WARN s flashing first; RIPPLE: its tiles go one after another. */
const QD_LEAD = 2.6;
const QD_STEP = 3;
const WARN = 1.8;
const RIPPLE = 0.8;
/** (Rolling: the push and the floor's drag are the level's: on the coin 15 m/s² and 2.1/s, a top speed ≈ 7 m/s.) */
/** The ram: the wind-up to full (s), how long a full one may be held, its speed (DASH0 + DASH1 × charge), how long it hits hard, the wait after. */
const WIND = 0.55;
const HOLD_MAX = 0.6;
const DASH0 = 8;
const DASH1 = 7;
const DASH_T = 0.26;
const COOLDOWN = 0.95;
/** Bumps: the bounce (restitution), a pop so balls always spring apart, the faster one's extra shove (much more in a ram). */
const BOUNCE = 0.88;
const POP = 0.7;
const KNOCK_DASH = 0.15;
const KNOCK_BUMP = 0.06;
const G = 24;
/** Back in: the wait after a fall, the drop from the sky (s, from DROP_H m), the ghost time after. */
const RESPAWN = 2.0;
const DROP = 0.75;
const DROP_H = 15;
const SAFE = 1.6;
/** Flung off at this speed: a star KO (it flies off into the sky and twinkles). */
const STAR_V = 12.5;
/** BUMPERS: up at POSTS_AT (rings show where POST_WARN before), their radius, the pong's speed. */
const POSTS_AT = 10;
const POST_WARN = 1.6;
const POST_R = 0.72;
const POST_V = 10.5;
/** The tilts (gusts): the arrows TILT_WARN before, then it leans in over TILT_IN (when, how far, how long, how hard: the level's). */
const TILT_WARN = 1.5;
const TILT_IN = 0.9;
/** Power-ups: the first drop, then about every POW_EVERY s; how long one waits on the floor, its fall from the sky. */
const POW_FIRST = 3;
const POW_EVERY = 5.5;
const POW_LIFE = 9;
const POW_FALL = 1.1;
const NCAP = 2;
const HEAVY = 1;
const SHOR = 2;
const SHIELD = 3;
/** How long each lasts (s), its colour. */
const PW_T = [0, 6, 7, 6];
const PW_C = ["#ffffff", "#ffb02e", "#ff4b2b", "#3ee0ff"];
/** The city, far below. */
const CITY_Y = -72;

const pwName = (k: number) => (k === HEAVY ? T("EQUIHASH HEAVY", "Equihash 重球") : k === SHOR ? T("HALO RAM", "Halo 冲撞") : k === SHIELD ? T("ORCHARD SHIELD", "Orchard 护盾") : "");
const pwShort = (k: number) => (k === HEAVY ? T("HEAVY", "重球") : k === SHOR ? T("HALO RAM", "Halo 冲撞") : k === SHIELD ? T("SHIELD", "护盾") : "");

const WARN_C = new THREE.Color("#ff4b4b");
const PIP_OFF = new THREE.Color("#3a4170");
const PIP_CHARGE = new THREE.Color("#ffffff");
const BULB_RED = new THREE.Color("#ff3030");
const BULB_DRIFT = new THREE.Color("#3ee0ff");
const WHITE = new THREE.Color("#ffffff");
const RING_C = new THREE.Color("#8fd0ff");
const FLAME = new THREE.Color("#ff6a2b");
const QD_FOG = new THREE.Color("#ff8a5c");
const QD_HEMI = new THREE.Color("#ffd6c8");
const QD_SUN = new THREE.Color("#ffb38a");

interface Ball {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** The hop: how high its bottom is over the floor (below it, falling), and its speed. */
  y: number;
  vy: number;
  /** Its radius (a heavy one is bigger), and where it eases to. */
  r: number;
  /** Facing: a ram with no arrow held goes there. */
  fx: number;
  fz: number;
  cd: number;
  dash: number;
  /** The charge of the ram under way (0…1). */
  power: number;
  stun: number;
  /** The wind-up: its charge (0…1; −1: none), how long it has been full, where it aims; an AI's wanted charge. */
  charge: number;
  full: number;
  aimx: number;
  aimz: number;
  windGoal: number;
  /** A press of A a moment before the ram was ready (kept a little); A still held since that press. */
  buf: number;
  arm: boolean;
  /** Who bumped it last, and when. */
  by: number;
  byAt: number;
  /** Seconds since it went over the edge (-1: on). */
  fall: number;
  /** NU7: gone for good (when). */
  out: boolean;
  outAt: number;
  /** Back in: where it will land (chosen a moment early, for the marker), the drop's time left, the ghost's. */
  sx: number;
  sz: number;
  spot: boolean;
  drop: number;
  safe: number;
  /** Its power-up, the time left of it. */
  pw: number;
  pwT: number;
  score: number;
  kos: number;
  falls: number;
  /** A streak of knockouts (the last one's time). */
  combo: number;
  comboAt: number;
  /** Flung off hard: a star KO. */
  star: boolean;
  /** Where it pushes (unit) and how hard (0…1). */
  ax: number;
  az: number;
  thr: number;
  /** An AI's next think, its victim, the capsule it is after; teetering; cross (it was just rammed). */
  think: number;
  target: number;
  goal: number;
  panic: number;
  angry: number;
  /** The squash on a bonk (a spring), the snark's lean (world, a spring). */
  sq: number;
  sqv: number;
  lx: number;
  lz: number;
  lvx: number;
  lvz: number;
  /** Over the edge: the snark thrown off its ball, tumbling; the ball's own spin. */
  mx: number;
  my: number;
  mz: number;
  mvx: number;
  mvy: number;
  mvz: number;
  spinA: number;
  spinB: number;
  roll: THREE.Vector3;
  /** (cosmetic timers: sweat, flames) */
  fxT: number;
  /** Into the bay: the ball has splashed, the snark has. */
  wet: boolean;
  mwet: boolean;
  /** (MARINA LILIES, an AI: going for a hop over the water to this pad, -1: no) */
  hopTo: number;
  /** In the air from a ram's hop (its landing stomps). */
  air: boolean;
  /** (an AI: the drift it has made up its mind about, and whether it will hop in it) */
  hopK: number;
  hopYes: boolean;
}

const ball = (x: number, z: number, think: number): Ball => ({
  x,
  z,
  vx: 0,
  vz: 0,
  y: 0,
  vy: 0,
  r: BR,
  fx: -Math.sign(x),
  fz: -Math.sign(z),
  cd: 0,
  dash: 0,
  power: 0,
  stun: 0,
  charge: -1,
  full: 0,
  aimx: 0,
  aimz: 1,
  windGoal: 0,
  buf: 0,
  arm: false,
  by: -1,
  byAt: -9,
  fall: -1,
  out: false,
  outAt: 0,
  sx: 0,
  sz: 0,
  spot: false,
  drop: 0,
  safe: 0,
  pw: 0,
  pwT: 0,
  score: 0,
  kos: 0,
  falls: 0,
  combo: 0,
  comboAt: -9,
  star: false,
  ax: 0,
  az: 0,
  thr: 0,
  think,
  target: -1,
  goal: -1,
  panic: 0,
  angry: 0,
  sq: 0,
  sqv: 0,
  lx: 0,
  lz: 0,
  lvx: 0,
  lvz: 0,
  mx: 0,
  my: 0,
  mz: 0,
  mvx: 0,
  mvy: 0,
  mvz: 0,
  spinA: 0,
  spinB: 0,
  roll: new THREE.Vector3(1, 0, 0),
  fxT: 0,
  wet: false,
  mwet: false,
  hopTo: -1,
  air: false,
  hopK: -1,
  hopYes: false,
});

/**
 * A lily pad: where it rests and its way out (a drift), its size, where it is now and how fast it
 * moves, where it will be at the coming drift's widest, the height of its top (they overlap: a hair
 * apart), how far it has sunk. NU7: st 0 afloat, 1 flashing, 2 sinking, 3 gone.
 */
interface Pad {
  x0: number;
  z0: number;
  ux: number;
  uz: number;
  r: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  fx: number;
  fz: number;
  h: number;
  sink: number;
  st: number;
  warnAt: number;
  dropAt: number;
}

/**
 * The floor of the pads as a field: how far a spot is from the edge of their union (circles), and
 * which way is out. Inside, the nearest edge is a pad's rim straight out from its centre (when no other
 * pad covers that point) or a corner where two rims cross (when no third covers it).
 */
class PadField {
  n = 0;
  x = new Float64Array(8);
  z = new Float64Array(8);
  r = new Float64Array(8);
  private jx = new Float64Array(64);
  private jz = new Float64Array(64);
  private nj = 0;
  reset() {
    this.n = 0;
  }
  add(x: number, z: number, r: number) {
    const i = this.n++;
    this.x[i] = x;
    this.z[i] = z;
    this.r[i] = r;
  }
  private covered(px: number, pz: number, a: number, b: number) {
    for (let k = 0; k < this.n; k++) if (k !== a && k !== b && Math.hypot(px - this.x[k], pz - this.z[k]) < this.r[k] - 0.02) return true;
    return false;
  }
  /** After the pads are in: the corners of the union. */
  prep() {
    this.nj = 0;
    for (let i = 0; i < this.n; i++)
      for (let j = i + 1; j < this.n; j++) {
        const dx = this.x[j] - this.x[i],
          dz = this.z[j] - this.z[i];
        const d = Math.hypot(dx, dz);
        const ri = this.r[i],
          rj = this.r[j];
        if (d >= ri + rj || d <= Math.abs(ri - rj) || d < 1e-6) continue;
        const a = (ri * ri - rj * rj + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, ri * ri - a * a));
        const mx = this.x[i] + (a * dx) / d,
          mz = this.z[i] + (a * dz) / d;
        for (let s = 1; s >= -1; s -= 2) {
          const px = mx - (s * h * dz) / d,
            pz = mz + (s * h * dx) / d;
          if (!this.covered(px, pz, i, j) && this.nj < 64) ((this.jx[this.nj] = px), (this.jz[this.nj] = pz), this.nj++);
        }
      }
  }
  /** The distance to the edge (positive on the pads, negative off them), the way out into `o`. */
  edge(px: number, pz: number, o: number[]) {
    let inside = false,
      best = Infinity,
      outE = -Infinity;
    o[0] = o[1] = 0;
    let ox = 0,
      oz = 0;
    for (let i = 0; i < this.n; i++) {
      const dx = px - this.x[i],
        dz = pz - this.z[i];
      const d = Math.hypot(dx, dz);
      const ri = this.r[i];
      if (d < ri) {
        inside = true;
        if (d < 1e-6) continue;
        const qx = this.x[i] + (dx / d) * ri,
          qz = this.z[i] + (dz / d) * ri;
        if (ri - d < best && !this.covered(qx, qz, i, i)) ((best = ri - d), (o[0] = dx / d), (o[1] = dz / d));
      } else if (ri - d > outE) ((outE = ri - d), (ox = d > 1e-6 ? dx / d : 0), (oz = d > 1e-6 ? dz / d : 0));
    }
    if (!inside) {
      o[0] = ox;
      o[1] = oz;
      return this.n ? outE : -9;
    }
    for (let k = 0; k < this.nj; k++) {
      const dx = this.jx[k] - px,
        dz = this.jz[k] - pz;
      const d = Math.hypot(dx, dz);
      if (d < best && d > 1e-6) ((best = d), (o[0] = dx / d), (o[1] = dz / d));
    }
    return best === Infinity ? 9 : best;
  }
}

/** A ring of tiles: one instanced draw (top and sides). st: 0 whole, 1 flashing, 2 falling, 3 gone. */
interface Band {
  ri: number;
  ro: number;
  mid: number;
  n: number;
  seg: number;
  mesh: THREE.InstancedMesh;
  base: THREE.Color[];
  st: number;
  warnAt: number;
  dropAt: number;
  /** Each tile: <0 the wait before it goes, ≥0 how long it has been falling. */
  tt: Float32Array;
  ax: Float32Array;
  az: Float32Array;
}

/** A BUMPER: st 0 down, 1 its ring warns, 2 up (solid), 3 sinking. */
interface Post {
  x: number;
  z: number;
  st: number;
  t: number;
  flash: number;
  g: THREE.Group;
  cap: THREE.Object3D;
  band: THREE.Mesh;
  ring: THREE.Mesh;
  hatch: THREE.Mesh;
}

/** A power-up capsule: st 0 none, 1 falling from the sky (its ring marks the spot), 2 on the floor. */
interface Cap {
  kind: number;
  x: number;
  z: number;
  st: number;
  t: number;
  g: THREE.Group;
  box: THREE.Mesh;
  ring: THREE.Mesh;
  shadow: THREE.Mesh;
}

/** An AI's temper (seeded): how much it wants power-ups, picks on the leader, risks its own edge. */
interface Temper {
  greed: number;
  bully: number;
  nerve: number;
}

// ---- textures --------------------------------------------------------------------------------------

/** A tile of a ring: an annular sector `2·half` wide, its top at y = 0, centred on its own middle (on +x). */
function tileGeo(ri: number, ro: number, half: number) {
  const gap = 0.045,
    bv = 0.08;
  const a = ri + gap + bv,
    b = ro - gap - bv;
  const ha = half - (gap + bv) / a,
    hb = half - (gap + bv) / b;
  const sh = new THREE.Shape();
  sh.moveTo(a * Math.cos(-ha), a * Math.sin(-ha));
  sh.lineTo(b * Math.cos(-hb), b * Math.sin(-hb));
  sh.absarc(0, 0, b, -hb, hb, false);
  sh.lineTo(a * Math.cos(ha), a * Math.sin(ha));
  sh.absarc(0, 0, a, ha, -ha, true);
  const g = new THREE.ExtrudeGeometry(sh, { depth: TH - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  g.translate(-(ri + ro) / 2, -(TH - bv), 0);
  return g;
}

/** A flat arrow on the floor pointing +z (its base at the origin, 1 long). */
function arrowGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.24, 0);
  s.lineTo(0.24, 0);
  s.lineTo(0.24, -0.52);
  s.lineTo(0.52, -0.52);
  s.lineTo(0, -1);
  s.lineTo(-0.52, -0.52);
  s.lineTo(-0.24, -0.52);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A fat chevron on the floor pointing +z (the tilt's "downhill"). */
function chevronGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.62, 0);
  s.lineTo(0, -0.6);
  s.lineTo(0.62, 0);
  s.lineTo(0.62, -0.34);
  s.lineTo(0, -0.94);
  s.lineTo(-0.62, -0.34);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  // (2D −y → +z, its face up, centred)
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -0.47);
  return g;
}

/** A ball's skin: its seat's colour, a white band round its middle and two white hoops across it. */
function ballTex(c: string, dark: string) {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = c;
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = "#ffffff";
    g.fillRect(0, 51, 256, 26);
    for (const u of [56, 184]) g.fillRect(u, 0, 16, 128);
    g.fillStyle = dark;
    g.fillRect(0, 48, 256, 3);
    g.fillRect(0, 77, 256, 3);
    g.fillStyle = dark;
    for (const u of [0, 128, 256]) star(g, u, 64, 15, 6.5);
  });
}

/** EQUIHASH HEAVY's skin: riveted steel, the seat's colour round its middle. */
function heavyTex(c: string, dark: string) {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = "#6c7590";
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = "#8a94b0";
    for (let y = 0; y < 128; y += 32) g.fillRect(0, y + 4, 256, 12);
    g.fillStyle = c;
    g.fillRect(0, 48, 256, 32);
    g.fillStyle = dark;
    g.fillRect(0, 46, 256, 3);
    g.fillRect(0, 79, 256, 3);
    for (let u = 8; u < 256; u += 32)
      for (const v of [26, 102]) {
        g.fillStyle = "#3b4157";
        g.beginPath();
        g.arc(u + 1, v + 1.5, 5.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#dfe6f6";
        g.beginPath();
        g.arc(u, v, 4.5, 0, Math.PI * 2);
        g.fill();
      }
    g.font = `900 26px Geist, Roboto, ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#ffffff";
    for (const u of [64, 192]) g.fillText("3×", u, 65);
  });
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r1: number, r0: number, n = 5) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 ? r0 : r1;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

function hexPath(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

/** The disc's face: a deep-blue sunburst, rings, and the big golden ⓩ mark. */
function emblemTex() {
  return canvasTex(512, 512, (g) => {
    const c = 256;
    for (let i = 0; i < 24; i++) {
      g.fillStyle = i % 2 ? "#2b5fe0" : "#3a78f2";
      g.beginPath();
      g.moveTo(c, c);
      g.arc(c, c, 260, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2);
      g.closePath();
      g.fill();
    }
    g.lineWidth = 14;
    g.strokeStyle = "#ffffff";
    g.beginPath();
    g.arc(c, c, 246, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 6;
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.beginPath();
    g.arc(c, c, 176, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#1d3fae";
    g.beginPath();
    g.arc(c, c, 150, 0, Math.PI * 2);
    g.fill();
    // (ZStreet's ⓩ: a dark outline all round, a deep-gold drop, then the gold, a glint on the ring)
    for (let k = 0; k < 12; k++) drawMark(g, c + Math.cos((k / 12) * Math.PI * 2) * 8, c + Math.sin((k / 12) * Math.PI * 2) * 8, 330, "#0e1a4a", "#0e1a4a");
    drawMark(g, c + 4, c + 8, 330, "#c98a00", "#c98a00");
    drawMark(g, c, c, 330, "#ffd23f", "#ffd23f");
    g.lineCap = "round";
    g.lineWidth = 9;
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.beginPath();
    g.arc(c, c, 132, Math.PI * 1.12, Math.PI * 1.36);
    g.stroke();
  });
}

/** The coin's milled edge: gold with dark reeds. */
function reedTex() {
  return canvasTex(
    64,
    32,
    (g) => {
      g.fillStyle = "#ffc93a";
      g.fillRect(0, 0, 64, 32);
      g.fillStyle = "#c98a00";
      for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 3, 32);
      g.fillStyle = "#fff0a8";
      g.fillRect(0, 0, 64, 4);
      g.fillStyle = "#8a5a00";
      g.fillRect(0, 28, 64, 4);
    },
    true,
  );
}

/** A comic "bonk" burst: a yellow star with a white core. */
function powTex() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = "#ff8a1c";
    star(g, 64, 64, 62, 30, 9);
    g.fillStyle = "#ffe14a";
    star(g, 64, 64, 52, 24, 9);
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(64, 64, 18, 0, Math.PI * 2);
    g.fill();
  });
}

/** A star KO's twinkle: a four-pointed sparkle. */
function sparkTex() {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 60);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(255,240,160,0.7)");
    gr.addColorStop(1, "rgba(255,200,80,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#ffffff";
    star(g, 64, 64, 62, 9, 4);
  });
}

/** ORCHARD SHIELD's bubble: a mesh of hexagons. */
function hexTex() {
  return canvasTex(256, 128, (g) => {
    g.clearRect(0, 0, 256, 128);
    g.strokeStyle = "rgba(190,250,255,1)";
    g.lineWidth = 3.5;
    const r = 16;
    const w = r * Math.sqrt(3);
    for (let row = -1; row < 7; row++)
      for (let col = -1; col < 11; col++) {
        hexPath(g, col * w + (row % 2 ? w / 2 : 0), row * r * 1.5, r - 1.5);
        g.stroke();
      }
  });
}

/** A power-up's face: a rounded tile of its colour and its sign (a weight, a bolt, a hexagon). */
function iconTex(kind: number) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = "#1a1033";
    rr(g, 2, 2, 124, 124, 26);
    g.fill();
    g.fillStyle = PW_C[kind];
    rr(g, 8, 8, 112, 112, 22);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.35)";
    rr(g, 18, 13, 92, 12, 6);
    g.fill();
    g.lineJoin = "round";
    g.lineCap = "round";
    if (kind === HEAVY) {
      g.lineWidth = 10;
      g.strokeStyle = "#3a2208";
      g.beginPath();
      g.arc(64, 50, 15, Math.PI, 0);
      g.stroke();
      g.fillStyle = "#3a2208";
      g.beginPath();
      g.moveTo(30, 104);
      g.lineTo(98, 104);
      g.lineTo(86, 52);
      g.lineTo(42, 52);
      g.closePath();
      g.fill();
      g.font = `900 30px Geist, Roboto, ui-sans-serif, system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ffe0a0";
      g.fillText("3×", 64, 81);
    } else if (kind === SHOR) {
      g.beginPath();
      g.moveTo(74, 14);
      g.lineTo(32, 70);
      g.lineTo(58, 70);
      g.lineTo(46, 114);
      g.lineTo(96, 52);
      g.lineTo(68, 52);
      g.lineTo(82, 14);
      g.closePath();
      g.lineWidth = 7;
      g.strokeStyle = "#4a0a00";
      g.stroke();
      g.fillStyle = "#fff36b";
      g.fill();
    } else {
      hexPath(g, 64, 66, 38);
      g.lineWidth = 11;
      g.strokeStyle = "#0b3b52";
      g.stroke();
      g.lineWidth = 6;
      g.strokeStyle = "#ffffff";
      g.stroke();
      hexPath(g, 64, 66, 17);
      g.fillStyle = "#ffffff";
      g.fill();
    }
  });
}

/** A BUMPER's top: a hot-pink cap with a white star and ring. */
/** A toy's shine: a soft white spot, brighter in the middle. */
function glossTex() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,0.85)");
    gr.addColorStop(0.35, "rgba(255,255,255,0.38)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/** Black ice: frost, blade scores in long arcs, a few sparkles (tiled: a texel is a centimetre or so). */
function iceTex(R: Rnd) {
  return canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 256, 256);
      g.lineCap = "round";
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = i % 3 ? "rgba(120,180,230,0.32)" : "rgba(255,255,255,0.9)";
        g.lineWidth = 1 + (i % 4 === 0 ? 1.5 : 0);
        const cx = R() * 256,
          cy = R() * 256,
          r = 60 + R() * 160,
          a = R() * Math.PI * 2;
        for (const ox of [-256, 0, 256])
          for (const oy of [-256, 0, 256]) {
            g.beginPath();
            g.arc(cx + ox, cy + oy, r, a, a + 0.5 + R() * 0.6);
            g.stroke();
          }
      }
      for (let i = 0; i < 40; i++) {
        g.fillStyle = i % 2 ? "rgba(170,215,255,0.5)" : "#ffffff";
        g.fillRect(R() * 256, R() * 256, 2, 2);
      }
    },
    true,
  );
}

/** A lily pad's top: green, a paler heart, veins from the middle, a darker rolled rim. */
function padTex(light: string, dark: string) {
  return canvasTex(512, 512, (g) => {
    // (drawn at 256 and doubled: a pad is 7 m across, a texel 1.5 cm)
    g.scale(2, 2);
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, "#b6ee7a");
    gr.addColorStop(0.35, light);
    gr.addColorStop(0.9, dark);
    gr.addColorStop(1, "#2f7a2a");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(220,255,170,0.55)";
    g.lineWidth = 3;
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      g.beginPath();
      g.moveTo(128, 128);
      g.quadraticCurveTo(128 + Math.cos(a + 0.12) * 70, 128 + Math.sin(a + 0.12) * 70, 128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124);
      g.stroke();
    }
    g.strokeStyle = "rgba(20,60,15,0.6)";
    g.lineWidth = 7;
    g.beginPath();
    g.arc(128, 128, 122, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(255,240,180,0.85)";
    g.beginPath();
    g.arc(128, 128, 9, 0, Math.PI * 2);
    g.fill();
  });
}

/** A pad's shade on the water: a soft dark edge round it. */
function shadeTex() {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 40, 64, 64, 64);
    gr.addColorStop(0, "rgba(2,5,20,0.55)");
    gr.addColorStop(0.7, "rgba(2,5,20,0.42)");
    gr.addColorStop(1, "rgba(2,5,20,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

function postTopTex() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = "#ff4fa0";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 9;
    g.beginPath();
    g.arc(64, 64, 46, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#ffffff";
    star(g, 64, 64, 30, 13, 5);
  });
}

// ---- sound -----------------------------------------------------------------------------------------

/** A rubbery bonk: a quick drop in pitch and a click (k: how hard, 0…1). */
function bonk(k: number, vol: number) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  const t = ac.currentTime;
  const f0 = 720 - k * 320;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.38, t + 0.17);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + 0.25);
  const c = ac.createOscillator();
  const cg = ac.createGain();
  c.type = "square";
  c.frequency.setValueAtTime(f0 * 2.4, t);
  cg.gain.setValueAtTime(vol * 0.3, t);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
  c.connect(cg).connect(bus);
  c.start(t);
  c.stop(t + 0.05);
  if (k > 0.55) sfx.thud();
}

/** A pinball bumper's pong: two bright blips up a fifth. */
function pong(vol: number) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  const t = ac.currentTime;
  for (const [f, d] of [
    [988, 0],
    [1480, 0.045],
  ]) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(f, t + d);
    o.frequency.exponentialRampToValueAtTime(f * 1.06, t + d + 0.08);
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(vol, t + d + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.14);
    o.connect(g).connect(bus);
    o.start(t + d);
    o.stop(t + d + 0.16);
  }
}

/** The long falling whistle. */
function whistle(vol: number) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(1500, t);
  o.frequency.exponentialRampToValueAtTime(300, t + 1.2);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
  g.gain.setValueAtTime(vol, t + 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + 1.3);
}

/** A snark's scream as it flies off: a wobbling "waaah" (pitch: who it is). */
function scream(vol: number, pitch: number) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  o.type = "sawtooth";
  const f0 = 430 * pitch;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f0 * 1.7, t + 0.14);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 1.05);
  const lfo = ac.createOscillator();
  const lg = ac.createGain();
  lfo.frequency.value = 10;
  lg.gain.value = 34 * pitch;
  lfo.connect(lg).connect(o.frequency);
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1150;
  f.Q.value = 1.4;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
  g.gain.setValueAtTime(vol, t + 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  o.connect(f).connect(g).connect(bus);
  o.start(t);
  o.stop(t + 1.15);
  lfo.start(t);
  lfo.stop(t + 1.15);
}

/** A high glassy ding (the star KO's twinkle, the shield's ping). */
function ding(vol: number, f = 2093) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  const t = ac.currentTime;
  for (const k of [1, 2.01]) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.value = f * k;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol / k, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6 / k);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.65);
  }
}

/** A siren's two tones (NU7), or a creak (a tilt): a slow bend of a low saw. */
function siren(vol: number, creak = false) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = creak ? "sawtooth" : "square";
  if (creak) {
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(52, t + 0.9);
  } else
    for (let i = 0; i < 4; i++) {
      o.frequency.setValueAtTime(i % 2 ? 620 : 880, t + i * 0.28);
    }
  const d = creak ? 0.95 : 1.12;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
  g.gain.setValueAtTime(vol, t + d - 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = creak ? 500 : 2400;
  o.connect(f).connect(g).connect(bus);
  o.start(t);
  o.stop(t + d + 0.02);
}

/** A splash: a burst of noise, low-passed and falling, and a plop. */
function splashSnd(vol: number) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  const t = ac.currentTime;
  const n = Math.floor(ac.sampleRate * 0.5);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(3200, t);
  f.frequency.exponentialRampToValueAtTime(400, t + 0.45);
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(bus);
  src.start(t);
  const o = ac.createOscillator();
  const og = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(320, t);
  o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(vol * 0.8, t + 0.01);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(og).connect(bus);
  o.start(t);
  o.stop(t + 0.18);
}

/** The human's ball rolling: a low rumble that follows its speed. */
class Rumble {
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  start() {
    const s = sound();
    if (!s || this.src) return;
    const { ac, bus } = s;
    const n = ac.sampleRate;
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) d[i] = (last = last * 0.97 + (Math.random() * 2 - 1) * 0.03) * 7;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 260;
    const g = ac.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(bus);
    src.start();
    this.src = src;
    this.gain = g;
  }
  set(v: number) {
    if (this.gain) this.gain.gain.setTargetAtTime(v, this.gain.context.currentTime, 0.08);
  }
  stop() {
    try {
      this.src?.stop();
    } catch {
      /* (never started) */
    }
    this.src?.disconnect();
    this.gain?.disconnect();
    this.src = this.gain = null;
  }
}

// ---- the game --------------------------------------------------------------------------------------

/** A ball's mass against another: a heavy one three, a shield all but immovable (a HALO RAM breaks through both). */
const massOf = (o: Ball, other: Ball) => (other.pw === SHOR && other.dash > 0 ? 1 : o.pw === SHIELD ? 6 : o.pw === HEAVY ? 3 : 1);

const rot = (x: number, z: number, a: number, out: number[]) => {
  out[0] = x * Math.cos(a) - z * Math.sin(a);
  out[1] = x * Math.sin(a) + z * Math.cos(a);
  return out;
};

class Bumper implements Mini {
  private w: World;
  /** The setting round it (it animates itself). */
  private scenery: Scenery;
  /** MARINA LILIES: the pads (0 the middle one), their one draw, the floor as fields (afloat now; not about to sink; at the coming drift's widest). */
  pads: Pad[] = [];
  private padMesh: THREE.InstancedMesh | null = null;
  private ripples: THREE.InstancedMesh | null = null;
  private padShade: THREE.InstancedMesh | null = null;
  private fNow = new PadField();
  private fSafe = new PadField();
  private fNext = new PadField();
  /** The pads joined to each other (the same number: you can roll across). */
  private comp = new Int8Array(7);
  /** The drift now (m out), whether the pads are apart, whether the next one is coming. */
  private driftNow = 0;
  private apart = false;
  private driftSoon = false;
  /** (scratch: a way out) */
  en = [0, 0];
  private en2 = [0, 0];
  /** Everything on the coin (it tilts), the coin's own parts. */
  private tilt = new THREE.Group();
  private av: Avatar[];
  b: Ball[];
  private temper: Temper[];
  private holders: THREE.Group[] = [];
  private balls: THREE.Mesh[] = [];
  private hulls: THREE.Mesh[] = [];
  private ballMats: THREE.MeshToonMaterial[] = [];
  private heavyMats: THREE.MeshToonMaterial[] = [];
  private shadows: THREE.Mesh[] = [];
  private shields: THREE.Mesh[] = [];
  private aims: THREE.Mesh[] = [];
  private aimMats: THREE.MeshBasicMaterial[] = [];
  private marks: THREE.Mesh[] = [];
  private fx: Fx3;
  private cam: CamRig;
  private bands: Band[] = [];
  private bulbs!: THREE.InstancedMesh;
  private bulbC: THREE.Color[];
  private bulbR: number;
  private pips!: THREE.InstancedMesh;
  private pows: { m: THREE.Mesh; t: number }[] = [];
  private shocks: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; s: number }[] = [];
  private sparks: { m: THREE.Mesh; t: number; s: number }[] = [];
  private qbs: THREE.Mesh[] = [];
  private glowRing!: THREE.Mesh;
  private gloss: THREE.InstancedMesh;
  private glints: THREE.InstancedMesh | null = null;
  private glintT = new Float32Array(14);
  private glintX = new Float32Array(14);
  private glintZ = new Float32Array(14);
  private CR = new THREE.Vector3();
  private CU = new THREE.Vector3();
  private CB = new THREE.Vector3();
  posts: Post[] = [];
  caps: Cap[] = [];
  private capMats: THREE.MeshToonMaterial[] = [];
  private chevrons!: THREE.InstancedMesh;
  private chevMat!: THREE.MeshBasicMaterial;
  private chevInk!: THREE.InstancedMesh;
  private chevInkMat!: THREE.MeshBasicMaterial;
  /** Materials and textures that are not always in the scene (disposed by hand). */
  private spare: (THREE.Material | THREE.Texture)[] = [];
  /** Game time (it stops once decided). */
  t = 0;
  /** NU7 has begun: no more respawns. */
  qday = false;
  /** Seats in the order they went out for good (NU7). */
  out: number[] = [];
  order: number[] = [];
  /** Seconds since decided (-1: playing). */
  over = -1;
  private done: number[] | null = null;
  private clock = 0;
  private hitCool = 0;
  private freeze = 0;
  private zoom = 0;
  private bannerY = 112;
  /** NU7's sky (swapped in), the day's (kept to free), the fade toward it, the red flash over the HUD. */
  private qSky: THREE.Texture;
  private daySky: THREE.Texture;
  private qk = 0;
  private flash = 0;
  private fog0 = new THREE.Color();
  private hemi0 = new THREE.Color();
  private sun0 = new THREE.Color();
  private alarm = 0;
  private news: { s: string; c: string; t: number; d: number }[] = [];
  private said = { posts: false, tilt: [] as boolean[], tiltGo: [] as boolean[], drift: [] as boolean[], driftGo: [] as boolean[], driftBack: [] as boolean[], hop: false, qsoon: false, qday: false, two: false, pow: false, crumble: false };
  private pops: { s: string; c: string; x: number; y: number; z: number; t: number; big: boolean }[] = [];
  private nextCap = POW_FIRST;
  private lastKind = 0;
  /** The tilt now: downhill (unit) and how far over (0…1); the arrows' state (0 hidden … 1 shown). */
  tiltX = 0;
  tiltZ = 1;
  tiltK = 0;
  private tiltDir: number[] = [];
  private arrowsK = 0;
  private tickAt = -1;
  private rumble = new Rumble();
  private human: number;
  private started = false;
  private countFrom: { eye: THREE.Vector3; at: THREE.Vector3 } | null = null;
  /** (the bench: a seat skill for an autopilot on the human's seat, in a Node sim) */
  bot = -1;
  /** The decor's own random (the frost, the icicles, the glints, the sparks): never the game's. */
  private deco = rng(0xb0b1ce);
  // (scratch, so the frame makes no garbage)
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private at = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private m4 = new THREE.Matrix4();
  private sc = new THREE.Vector3();
  private col = new THREE.Color();
  private seatC: THREE.Color[];
  private ghosts: THREE.Mesh[][] = [];
  private ghostMats: THREE.MeshBasicMaterial[] = [];
  private outs = [false, false, false, false];
  private vals = ["", "", "", ""];
  private subs = ["", "", "", ""];
  private leads: number[] = [];
  private r2 = [0, 0];
  private UP = new THREE.Vector3(0, 1, 0);
  private AX = new THREE.Vector3();

  constructor(
    private players: Player[],
    private rnd: Rnd,
    readonly L: BumperLevel,
  ) {
    this.w = world({ sky: L.sky, fog: L.fog, post: L.finish });
    const s = this.w.scene;
    this.human = players.findIndex((p) => p.human);
    this.seatC = players.map((p) => new THREE.Color(p.color));
    this.bulbC = L.bulbs.map((c) => new THREE.Color(c));
    this.bulbR = L.rIn + L.bw * L.nb - 0.16;
    this.w.sun.position.set(...L.sun[2]);
    this.w.sun.color.set(L.sun[0]);
    this.w.sun.intensity = L.sun[1];
    this.w.hemi.color.set(L.hemi[0]);
    this.w.hemi.groundColor.set(L.hemi[1]);
    this.w.hemi.intensity = L.hemi[2];
    for (const _ of L.tiltAt) (this.said.tilt.push(false), this.said.tiltGo.push(false), this.tiltDir.push(0));
    for (const _ of L.driftAt) (this.said.drift.push(false), this.said.driftGo.push(false), this.said.driftBack.push(false));
    this.daySky = s.background as THREE.Texture;
    this.qSky = canvasTex(4, 256, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, L.qSky[0]);
      gr.addColorStop(0.55, L.qSky[1]);
      gr.addColorStop(0.8, L.qSky[2]);
      gr.addColorStop(1, L.qSky[2]);
      g.fillStyle = gr;
      g.fillRect(0, 0, 4, 256);
    });
    if (s.fog) this.fog0.copy((s.fog as THREE.Fog).color);
    this.hemi0.copy(this.w.hemi.color);
    this.sun0.copy(this.w.sun.color);
    s.add(this.tilt);
    if (L.shape === "pads") this.buildPads(this.tilt, s);
    else this.buildArena(this.tilt, s);
    this.scenery = L.key === "astana" ? astanaScenery(s, CITY_Y, this.w.sun.position) : L.key === "marina" ? marinaScenery(s, this.w.sun.position) : coinScenery(s, CITY_Y, this.w.sun.position);
    // (the sun's cast shadows, shadows.ts: how dark on this floor, by the level's light)
    s.userData.shadowK = L.shadowK;
    // the four, each on a ball, facing the middle (you at the front); on the pads, on four of the six round the middle
    const spots =
      L.shape === "pads"
        ? [90, 150, 270, 330].map((d) => [Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)])
        : [
            [0, 1],
            [-1, 0],
            [0, -1],
            [1, 0],
          ];
    const sr = L.shape === "pads" ? PAD_D - 0.5 : L.shape === "ring" ? (L.hole + L.rIn + L.bw * L.nb) / 2 : 5.2;
    this.b = players.map((_, i) => ball(spots[i][0] * sr, spots[i][1] * sr, 0.3 + rnd() * 0.4));
    this.temper = players.map(() => ({ greed: 0.25 + rnd() * 0.75, bully: rnd(), nerve: rnd() }));
    const ink = new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide });
    const shieldMat = new THREE.MeshBasicMaterial({ map: hexTex(), color: 0x9ff4ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    const aimG = arrowGeo();
    this.av = players.map((p, i) => {
      const h = new THREE.Group();
      const mat = new THREE.MeshToonMaterial({ map: ballTex(p.color, p.dark), gradientMap: toonSteps() });
      const hv = new THREE.MeshToonMaterial({ map: heavyTex(p.color, p.dark), gradientMap: toonSteps(), emissive: 0x111522 });
      this.ballMats.push(mat);
      this.heavyMats.push(hv);
      this.spare.push(mat, hv, mat.map!, hv.map!);
      const m = new THREE.Mesh(GEO.ball, mat);
      m.scale.setScalar(BR * 2);
      m.rotation.set(rnd() * 3, rnd() * 3, 0);
      h.add(m);
      const hull = new THREE.Mesh(GEO.ball, ink);
      hull.scale.setScalar(BR * 2 + 0.09);
      h.add(hull);
      this.tilt.add(h);
      this.holders.push(h);
      this.balls.push(m);
      this.hulls.push(hull);
      const sh = blob(BR * 1.05);
      this.tilt.add(sh);
      this.shadows.push(sh);
      // its ORCHARD bubble (hidden until it has one)
      const bub = new THREE.Mesh(GEO.ball, shieldMat);
      bub.visible = false;
      bub.renderOrder = 6;
      this.tilt.add(bub);
      this.shields.push(bub);
      // the wind-up's aim on the floor
      const am = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
      this.aimMats.push(am);
      const arrow = new THREE.Mesh(aimG, am);
      arrow.visible = false;
      arrow.renderOrder = 3;
      this.tilt.add(arrow);
      this.aims.push(arrow);
      // where it will drop back in
      const mk = new THREE.Mesh(GEO.ring, glow(p.color, 0.9));
      mk.rotation.x = -Math.PI / 2;
      mk.visible = false;
      mk.renderOrder = 3;
      this.tilt.add(mk);
      this.marks.push(mk);
      // a ram's after-images
      const gm = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.3, depthWrite: false });
      this.ghostMats.push(gm);
      this.ghosts.push(
        [0, 1, 2].map(() => {
          const gh = new THREE.Mesh(GEO.ball, gm);
          gh.scale.setScalar(BR * 2);
          gh.visible = false;
          this.tilt.add(gh);
          return gh;
        }),
      );
      const a = new Avatar(s, p, { scale: MS, ring: false, shadow: false, marker: false });
      this.tilt.add(a.root);
      a.yaw = yawOf(-this.b[i].x, -this.b[i].z);
      this.b[i].fx = Math.sin(a.yaw);
      this.b[i].fz = Math.cos(a.yaw);
      this.b[i].aimx = this.b[i].fx;
      this.b[i].aimz = this.b[i].fz;
      return a;
    });
    // the ram's charge: pips round each ball on the floor
    this.pips = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), 4 * 12);
    this.pips.frustumCulled = false;
    this.pips.setColorAt(0, this.col.set(0xffffff));
    this.tilt.add(this.pips);
    // the bonks' bursts, the star KOs' twinkles, the shock rings (billboards and floor rings)
    const pm = new THREE.MeshBasicMaterial({ map: powTex(), transparent: true, depthTest: false, depthWrite: false });
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(GEO.plane, pm);
      m.visible = false;
      m.renderOrder = 10;
      this.tilt.add(m);
      this.pows.push({ m, t: 9 });
    }
    const spm = new THREE.MeshBasicMaterial({ map: sparkTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(GEO.plane, spm);
      m.visible = false;
      m.renderOrder = 11;
      s.add(m);
      this.sparks.push({ m, t: 9, s: 1 });
    }
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(GEO.ring, mat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 4;
      this.tilt.add(m);
      this.shocks.push({ m, mat, t: 9, s: 1 });
    }
    this.buildPosts();
    this.buildCaps();
    // the tilt's arrows (one draw)
    const cg = chevronGeo();
    this.chevMat = new THREE.MeshBasicMaterial({ color: L.tiltColor, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.chevInkMat = new THREE.MeshBasicMaterial({ color: 0x1a1033, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.chevrons = new THREE.InstancedMesh(cg, this.chevMat, 9);
    this.chevInk = new THREE.InstancedMesh(cg, this.chevInkMat, 9);
    for (const m of [this.chevrons, this.chevInk]) {
      m.visible = false;
      m.frustumCulled = false;
      this.tilt.add(m);
    }
    this.chevInk.renderOrder = 3;
    this.chevrons.renderOrder = 4;
    this.fx = new Fx3(s);
    this.tilt.add(this.fx.mesh);
    // a toy's shine on each ball (one draw: soft white spots that face the camera), glints on the ice
    this.gloss = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: glossTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 8);
    this.gloss.frustumCulled = false;
    this.gloss.renderOrder = 5;
    this.tilt.add(this.gloss);
    if (L.glints) {
      this.glints = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: sparkTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: "#dff6ff" }), 14);
      this.glints.frustumCulled = false;
      this.glints.renderOrder = 4;
      this.tilt.add(this.glints);
      for (let k = 0; k < 14; k++) this.glintT[k] = this.deco() * 2;
    }
    this.cam = new CamRig(this.w.camera);
    this.cardCam(0);
    this.cam.apply(0);
    this.visual(0);
    // (the bench: a scripted human reads the game here)
    if (typeof location !== "undefined" && /bumperbot/.test(location.search)) (window as unknown as { __bumper: unknown }).__bumper = this;
  }

  // ---- building ------------------------------------------------------------------------------------

  private buildArena(s: THREE.Group, scene: THREE.Scene) {
    const L = this.L;
    const R_IN = L.rIn,
      BW = L.bw,
      NB = L.nb;
    const ice = L.shape === "ring";
    this.glowRing = new THREE.Mesh(GEO.ring, glow("#7fe0ff", 0.55, true));
    this.glowRing.rotation.x = -Math.PI / 2;
    this.glowRing.position.y = 0.02;
    this.glowRing.scale.setScalar(3.1 * 2);
    s.add(this.glowRing);
    let top: THREE.Material = toon("#ffffff");
    let side: THREE.Material;
    if (!ice) {
      // the inner disc with its emblem (it never falls), and what holds it up
      const reed = new THREE.MeshToonMaterial({ map: reedTex(), gradientMap: toonSteps(), emissive: 0x2a1a00 });
      reed.map!.repeat.set(26, 1);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(R_IN - 0.05, R_IN - 0.05, TH, 64, 1), [reed, new THREE.MeshToonMaterial({ map: emblemTex(), gradientMap: toonSteps(), emissive: 0x0a1030 }), toon("#2a3580")]);
      disc.position.y = -TH / 2;
      disc.rotation.y = Math.PI / 2;
      s.add(disc);
      const under = new THREE.Mesh(new THREE.CylinderGeometry(R_IN - 0.4, 1.6, 3.4, 32, 1), toon("#2a3580"));
      under.position.y = -TH - 1.7;
      s.add(under);
      const keel = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.5, 1.6, 24, 1), toon("#ffd23f", "#5a3c00"));
      keel.position.y = -TH - 4.2;
      s.add(keel);
      const jet = new THREE.Mesh(GEO.disc, glow("#7fe0ff", 0.8, true));
      jet.rotation.x = Math.PI / 2;
      jet.scale.setScalar(1.3);
      jet.position.y = -TH - 5.05;
      s.add(jet);
      // the rings of tiles: a checker of white and periwinkle, their sides the coin's milled gold edge
      const reedSide = new THREE.MeshToonMaterial({ map: reedTex(), gradientMap: toonSteps(), emissive: 0x2a1a00 });
      reedSide.map!.repeat.set(0.5, 1);
      side = reedSide;
    } else {
      // black ice: frosty tops scored by blades, blue sides; the inner ring (two rings of tiles) never
      // breaks; under it a golden hoop and icicles; round the hole a cold glow
      const frost = new THREE.MeshToonMaterial({ map: iceTex(this.deco), gradientMap: toonSteps(), emissive: 0x0c1c30 });
      frost.map!.repeat.set(0.32, 0.32);
      top = frost;
      side = toon(L.side ?? "#5fb6f0", "#0a2a4a");
      const inner = 2;
      const w = (R_IN - L.hole) / inner;
      for (let b = 0; b < inner; b++) {
        const ri = L.hole + b * w,
          ro = ri + w,
          mid = (ri + ro) / 2;
        const n = 2 * Math.round((Math.PI * 2 * mid) / 4.4);
        const seg = (Math.PI * 2) / n;
        const mesh = new THREE.InstancedMesh(tileGeo(ri, ro, seg / 2), [top, side], n);
        for (let k = 0; k < n; k++) {
          const a = k * seg;
          this.q.setFromAxisAngle(this.UP, a);
          this.m4.compose(this.v.set(Math.cos(a) * mid, 0, -Math.sin(a) * mid), this.q, this.sc.set(1, 1, 1));
          mesh.setMatrixAt(k, this.m4);
          mesh.setColorAt(k, this.col.set((k + b + 1) % 2 ? L.floor[0] : L.floor[1]));
        }
        s.add(mesh);
      }
      const hoop = new THREE.Mesh(new THREE.TorusGeometry((L.hole + R_IN) / 2, 0.42, 10, 64), toon("#ffc23a", "#5a3000"));
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = -TH - 0.2;
      s.add(hoop);
      const NI = 30;
      const icicles = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 1, 5), toon("#cfefff", "#1a4a7a"), NI);
      for (let k = 0; k < NI; k++) {
        const a = (k / NI) * Math.PI * 2 + this.deco() * 0.1,
          r = L.hole + 0.35 + this.deco() * (R_IN - L.hole - 0.7);
        const len = 0.7 + this.deco() * 1.6;
        this.q.setFromAxisAngle(this.v2.set(1, 0, 0), Math.PI);
        this.m4.compose(this.v.set(Math.cos(a) * r, -TH - len / 2 + 0.05, Math.sin(a) * r), this.q, this.sc.set(1, len, 1));
        icicles.setMatrixAt(k, this.m4);
      }
      s.add(icicles);
      // (a cold glow under the ice, seen round its rim and down the hole)
      const under = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ map: glossTex(), color: "#5fb6f0", transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
      under.rotation.x = -Math.PI / 2;
      under.scale.setScalar((R_IN + BW * NB) * 2.3);
      under.position.y = -TH - 1.6;
      s.add(under);
      this.glowRing.scale.setScalar((L.hole + 0.12) * 2.5);
    }
    for (let b = 0; b < NB; b++) {
      const ri = R_IN + b * BW,
        ro = ri + BW,
        mid = (ri + ro) / 2;
      const n = 2 * Math.round((Math.PI * 2 * mid) / 4.4);
      const seg = (Math.PI * 2) / n;
      const mesh = new THREE.InstancedMesh(tileGeo(ri, ro, seg / 2), [top, side], n);
      const base: THREE.Color[] = [];
      for (let k = 0; k < n; k++) {
        const c = new THREE.Color((k + b) % 2 ? L.floor[0] : L.floor[1]);
        base.push(c);
        mesh.setColorAt(k, c);
      }
      const dropAt = BRAWL + QD_LEAD + (NB - 1 - b) * QD_STEP;
      const band: Band = { ri, ro, mid, n, seg, mesh, base, st: 0, warnAt: dropAt - WARN, dropAt, tt: new Float32Array(n), ax: new Float32Array(n), az: new Float32Array(n) };
      for (let k = 0; k < n; k++) {
        const a = this.deco() * Math.PI * 2;
        band.ax[k] = Math.cos(a);
        band.az[k] = Math.sin(a);
        this.placeTile(band, k, 0, 0);
      }
      mesh.instanceMatrix.needsUpdate = true;
      s.add(mesh);
      this.bands.push(band);
    }
    this.buildDecor(s, scene);
  }

  /** The rim's chase lights (they follow the edge in as it crumbles; on the pads, round each pad), the Z-Blocks floating round it (to the sides and behind: never between it and the camera). */
  private buildDecor(s: THREE.Group, scene: THREE.Scene) {
    this.bulbs = new THREE.InstancedMesh(GEO.ball, new THREE.MeshBasicMaterial({ color: 0xffffff }), 72);
    this.bulbs.frustumCulled = false;
    this.bulbs.setColorAt(0, this.col.set(0xffffff));
    s.add(this.bulbs);
    this.L.qbs.forEach(([x, y, z], i) => {
      const q = qBlock(1.3);
      q.position.set(x, y, z);
      q.userData.a = i * 1.7;
      q.userData.y = y;
      scene.add(q);
      this.qbs.push(q);
    });
  }

  /**
   * MARINA LILIES: seven pads (the big one in the middle, six round it, overlapping a little at rest:
   * one floor), one instanced draw (rims, tops, bottoms), each a hair lower than the last so their
   * overlaps never flicker.
   */
  private buildPads(s: THREE.Group, scene: THREE.Scene) {
    const L = this.L;
    const top = new THREE.MeshToonMaterial({ map: padTex(L.floor[0], L.floor[1]), gradientMap: toonSteps(), emissive: 0x0a2008 });
    const side = toon(L.side ?? "#2f7a2a", "#06200a");
    this.padMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, PAD_TH, 48, 1), [side, top, side], 7);
    this.padMesh.frustumCulled = false;
    for (let k = 0; k < 7; k++) {
      const a = k ? ((90 + (k - 1) * 60) * Math.PI) / 180 : 0;
      const ux = k ? Math.cos(a) : 0,
        uz = k ? Math.sin(a) : 0;
      const r = k ? PAD_R : PAD_C;
      const p: Pad = { x0: ux * PAD_D, z0: uz * PAD_D, ux, uz, r, x: ux * PAD_D, z: uz * PAD_D, vx: 0, vz: 0, fx: ux * PAD_D, fz: uz * PAD_D, h: k ? -0.02 - (k % 2) * 0.02 : 0, sink: 0, st: 0, warnAt: 1e9, dropAt: 1e9 };
      this.pads.push(p);
      this.padMesh.setColorAt(k, this.col.set(0xffffff));
    }
    s.add(this.padMesh);
    // a lotus bud on the middle pad's centre would be in the way: the middle pad gets the ⓩ instead (a glow ring)
    this.glowRing = new THREE.Mesh(GEO.ring, glow("#ffe7a0", 0.5, true));
    this.glowRing.rotation.x = -Math.PI / 2;
    this.glowRing.position.y = 0.03;
    s.add(this.glowRing);
    // the water's rings spreading from each pad (two each, fading as they widen: one draw), each pad's shade on the water
    this.ripples = new THREE.InstancedMesh(new THREE.RingGeometry(0.955, 1, 56), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 14);
    this.ripples.frustumCulled = false;
    this.ripples.renderOrder = 2;
    this.ripples.setColorAt(0, this.col.set(0x000000));
    scene.add(this.ripples);
    this.padShade = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: shadeTex(), transparent: true, depthWrite: false }), 7);
    this.padShade.frustumCulled = false;
    this.padShade.renderOrder = 2;
    scene.add(this.padShade);
    this.padsMove(0);
    this.buildDecor(s, scene);
  }

  private buildPosts() {
    const topMat = new THREE.MeshToonMaterial({ map: postTopTex(), gradientMap: toonSteps(), emissive: 0x2a0016 });
    const capMats = [toon("#ff4fa0", "#3a0020"), topMat, toon("#ff4fa0")];
    for (let i = 0; i < this.L.posts; i++) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(GEO.cyl, toon("#2a3580"));
      base.scale.set(POST_R * 2 + 0.3, 0.3, POST_R * 2 + 0.3);
      base.position.y = 0.15;
      g.add(base);
      const body = new THREE.Mesh(GEO.cyl, toon("#ffffff"));
      body.scale.set(POST_R * 2, 1.0, POST_R * 2);
      body.position.y = 0.75;
      g.add(body);
      const band = new THREE.Mesh(GEO.cyl, new THREE.MeshBasicMaterial({ color: 0x7fe0ff }));
      band.scale.set(POST_R * 2 + 0.06, 0.22, POST_R * 2 + 0.06);
      band.position.y = 0.72;
      g.add(band);
      const cap = new THREE.Mesh(GEO.cyl, capMats);
      cap.scale.set(POST_R * 2 + 0.26, 0.34, POST_R * 2 + 0.26);
      cap.position.y = 1.36;
      outline(cap, 0.05);
      g.add(cap);
      g.visible = false;
      this.tilt.add(g);
      const ring = new THREE.Mesh(GEO.ring, glow("#ff2f8e"));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      ring.visible = false;
      ring.renderOrder = 3;
      this.tilt.add(ring);
      const hatch = new THREE.Mesh(GEO.disc, glow("#1d2466", 0.55));
      hatch.rotation.x = -Math.PI / 2;
      hatch.position.y = 0.04;
      hatch.visible = false;
      hatch.renderOrder = 2;
      this.tilt.add(hatch);
      this.posts.push({ x: 0, z: 0, st: 0, t: 0, flash: 0, g, cap, band, ring, hatch });
    }
  }

  private buildCaps() {
    for (let k = 1; k <= 3; k++) {
      const m = new THREE.MeshToonMaterial({ map: iconTex(k), gradientMap: toonSteps(), emissive: new THREE.Color(PW_C[k]).multiplyScalar(0.25) });
      this.capMats.push(m);
      this.spare.push(m, m.map!);
    }
    for (let i = 0; i < NCAP; i++) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(GEO.box, this.capMats[0]);
      box.scale.setScalar(0.95);
      outline(box, 0.05);
      g.add(box);
      g.visible = false;
      this.tilt.add(g);
      const ring = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      ring.visible = false;
      ring.renderOrder = 3;
      this.tilt.add(ring);
      const shadow = blob(0.55);
      shadow.visible = false;
      this.tilt.add(shadow);
      this.caps.push({ kind: 1, x: 0, z: 0, st: 0, t: 0, g, box, ring, shadow });
    }
  }

  /** Put tile k of a ring in place: dropped `y` metres, tumbled by `spin`. */
  private placeTile(band: Band, k: number, y: number, spin: number, out = 0) {
    const a = k * band.seg;
    const r = band.mid + out;
    this.q.setFromAxisAngle(this.UP, a);
    if (spin) this.q.multiply(this.q2.setFromAxisAngle(this.v2.set(band.ax[k], 0, band.az[k]), spin));
    this.m4.compose(this.v.set(Math.cos(a) * r, y, -Math.sin(a) * r), this.q, this.sc.set(1, 1, 1));
    band.mesh.setMatrixAt(k, this.m4);
  }

  // ---- the floor -----------------------------------------------------------------------------------

  /** Is there floor under this spot? */
  private solid(x: number, z: number) {
    const L = this.L;
    if (L.shape === "pads") {
      for (const p of this.pads) if (p.st < 2 && Math.hypot(x - p.x, z - p.z) < p.r) return true;
      return false;
    }
    const r = Math.hypot(x, z);
    if (r < L.hole) return false;
    if (r <= L.rIn) return true;
    const bi = Math.floor((r - L.rIn) / L.bw);
    if (bi >= L.nb) return false;
    const band = this.bands[bi];
    if (band.st < 2) return true;
    if (band.st === 3) return false;
    let a = Math.atan2(-z, x);
    if (a < 0) a += Math.PI * 2;
    const k = Math.round(a / band.seg) % band.n;
    return band.tt[k] < 0;
  }

  /** The edge's radius: of what still stands (for the camera, the human's grip)… */
  private get rNow() {
    let n = 0;
    while (n < this.L.nb && this.bands[n].st < 2) n++;
    return this.L.rIn + n * this.L.bw;
  }
  /** …and of what is not about to fall (for the AIs, the lights, the drops). */
  get rSafe() {
    let n = 0;
    while (n < this.L.nb && this.bands[n].st < 1) n++;
    return this.L.rIn + n * this.L.bw;
  }

  /**
   * How far (x, z) is from the edge (positive on the floor, negative off it), and the way out (unit,
   * into `o`; none at the very middle of the coin). `safe`: the edge of what is not about to go (a
   * ring flashing, a pad flashing or about to drift away), for the AIs and the drops; else of what
   * still stands (the camera, your grip, a shield's save, a fall's way out).
   */
  edgeAt(x: number, z: number, safe: boolean, o: number[] = this.en) {
    const L = this.L;
    if (L.shape === "pads") {
      if (!safe) return this.fNow.edge(x, z, o);
      const e = this.fSafe.edge(x, z, o);
      if (!this.driftSoon) return e;
      const e2 = this.fNext.edge(x, z, this.en2);
      if (e2 < e) ((o[0] = this.en2[0]), (o[1] = this.en2[1]));
      return Math.min(e, e2);
    }
    const r = Math.hypot(x, z);
    const eo = (safe ? this.rSafe : this.rNow) - r;
    if (L.shape === "ring" && r - L.hole < eo) {
      // (nearer the hole: out is toward the middle)
      if (r > 1e-6) ((o[0] = -x / r), (o[1] = -z / r));
      else ((o[0] = 1), (o[1] = 0));
      return r - L.hole;
    }
    if (r > 1e-6) ((o[0] = x / r), (o[1] = z / r));
    else o[0] = o[1] = 0;
    return eo;
  }

  /** How big the floor is now (the camera frames it). */
  private extent() {
    if (this.L.shape !== "pads") return this.rNow;
    let R = PAD_C;
    for (const p of this.pads) if (p.st < 2) R = Math.max(R, Math.hypot(p.x, p.z) + p.r);
    return R;
  }

  /** The pad under (x, z) (the one it is deepest in; -1: none). */
  padOf(x: number, z: number) {
    let best = 0,
      bi = -1;
    for (let k = 0; k < this.pads.length; k++) {
      const p = this.pads[k];
      if (p.st >= 2) continue;
      const e = p.r - Math.hypot(x - p.x, z - p.z);
      if (e > best) ((best = e), (bi = k));
    }
    return bi;
  }

  /** The drift at time t (m out), and how far out the pads will be at the coming one's widest. */
  private driftAt(t: number) {
    const L = this.L;
    let now = 0,
      next = 0;
    for (let k = 0; k < L.driftAt.length; k++) {
      const u = t - L.driftAt[k],
        by = L.driftBy[k];
      if (u < -DRIFT_WARN || u > DRIFT_OUT + DRIFT_HOLD + DRIFT_BACK) continue;
      if (u < 0) next = by;
      else if (u < DRIFT_OUT) ((now = ease(u / DRIFT_OUT) * by), (next = by));
      else if (u < DRIFT_OUT + DRIFT_HOLD) ((now = by), (next = by));
      else now = ease(1 - (u - DRIFT_OUT - DRIFT_HOLD) / DRIFT_BACK) * by;
    }
    this.driftSoon = next > now + 0.05;
    return now;
  }

  /** The pads to where the drift puts them (their speeds, the fields, which are joined), and their draw. */
  private padsMove(dt: number) {
    const d = this.over >= 0 ? this.driftNow : this.driftAt(this.t);
    this.driftNow = d;
    let fut = d;
    if (this.driftSoon) for (let k = 0; k < this.L.driftAt.length; k++) if (this.t >= this.L.driftAt[k] - DRIFT_WARN && this.t < this.L.driftAt[k] + DRIFT_OUT) fut = this.L.driftBy[k];
    this.fNow.reset();
    this.fSafe.reset();
    this.fNext.reset();
    for (const p of this.pads) {
      const x = p.x0 + p.ux * d,
        z = p.z0 + p.uz * d;
      p.vx = dt > 0 ? (x - p.x) / dt : 0;
      p.vz = dt > 0 ? (z - p.z) / dt : 0;
      p.x = x;
      p.z = z;
      p.fx = p.x0 + p.ux * fut;
      p.fz = p.z0 + p.uz * fut;
      if (p.st < 2) this.fNow.add(p.x, p.z, p.r);
      if (p.st < 1) (this.fSafe.add(p.x, p.z, p.r), this.fNext.add(p.fx, p.fz, p.r));
    }
    this.fNow.prep();
    this.fSafe.prep();
    this.fNext.prep();
    // (joined: overlapping enough to roll across; with a drift coming, as they will be at its widest:
    // nobody starts across a seam about to open)
    const n = this.pads.length;
    const soon = this.driftSoon;
    for (let k = 0; k < n; k++) this.comp[k] = k;
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const a = this.pads[i],
            b = this.pads[j];
          if (a.st >= 2 || b.st >= 2 || (soon ? Math.hypot(a.fx - b.fx, a.fz - b.fz) : Math.hypot(a.x - b.x, a.z - b.z)) > a.r + b.r - 0.4) continue;
          const m = Math.min(this.comp[i], this.comp[j]);
          for (let k = 0; k < n; k++) if (this.comp[k] === this.comp[i] || this.comp[k] === this.comp[j]) this.comp[k] = m;
        }
    let apart = false;
    for (let k = 1; k < n; k++) if (this.pads[k].st < 2 && this.comp[k] !== this.comp[0]) apart = true;
    this.apart = apart;
  }

  /** The drift under way (its index; -1: none). */
  private driftK() {
    const L = this.L;
    for (let k = 0; k < L.driftAt.length; k++) if (this.t >= L.driftAt[k] - DRIFT_WARN && this.t < L.driftAt[k] + DRIFT_OUT + DRIFT_HOLD + DRIFT_BACK) return k;
    return -1;
  }

  /** Can a ball roll from pad a to pad b (joined now)? */
  private joined(a: number, b: number) {
    return !this.apart || a < 0 || b < 0 || this.comp[a] === this.comp[b];
  }

  /** NU7 on the pads: the six round the middle sink one by one (each flashing red first), in a drawn order. */
  private sinkOrder() {
    const order = [1, 2, 3, 4, 5, 6];
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(this.rnd() * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
    order.forEach((pi, k) => {
      const p = this.pads[pi];
      p.dropAt = BRAWL + QD_LEAD + k * QD_STEP;
      p.warnAt = p.dropAt - WARN;
    });
  }

  private sinkPads(dt: number, now: number) {
    for (let k = 0; k < this.pads.length; k++) {
      const p = this.pads[k];
      if (p.st === 3) continue;
      if (p.st === 0 && this.t >= p.warnAt && this.over < 0) {
        p.st = 1;
        if (!this.said.crumble) {
          this.said.crumble = true;
          this.say(T(...this.L.crumbleSay), "#ff6b6b", 1.6);
        }
        sfx.tick();
      }
      if (p.st === 1) {
        const u = clamp((this.t - p.warnAt) / WARN, 0, 1);
        if ((this.alarm -= dt) <= 0) ((this.alarm = 0.42 - u * 0.28), sfx.tick());
        this.padMesh!.setColorAt(k, this.col.copy(WHITE).lerp(WARN_C, Math.sin(now * (12 + u * 16)) > 0 ? 0.3 + u * 0.55 : 0.05));
        this.padMesh!.instanceColor!.needsUpdate = true;
        if (this.t >= p.dropAt) {
          p.st = 2;
          p.sink = 0;
          this.padMesh!.setColorAt(k, this.col.copy(WHITE).lerp(WARN_C, 0.35));
          this.splash(p.x, p.z, 30, p.r);
          sfx.thud();
          this.cam.shake(0.18);
        }
      } else if (p.st === 2 && (p.sink += dt) > 1.8) p.st = 3;
    }
  }

  private crumble(dt: number, now: number) {
    if (this.L.shape === "pads") return this.sinkPads(dt, now);
    const fl = this.L.floor;
    for (let bi = 0; bi < this.L.nb; bi++) {
      const band = this.bands[bi];
      if (band.st === 3) continue;
      if (band.st === 0 && this.t >= band.warnAt && this.over < 0) {
        band.st = 1;
        if (!this.said.crumble) {
          this.said.crumble = true;
          this.say(T(...this.L.crumbleSay), "#ff6b6b", 1.6);
        }
        sfx.tick();
      }
      if (band.st === 1) {
        const k = clamp((this.t - band.warnAt) / WARN, 0, 1);
        // (an alarm ticking faster as it is about to go)
        if ((this.alarm -= dt) <= 0) ((this.alarm = 0.42 - k * 0.28), sfx.tick());
        const blink = Math.sin(now * (12 + k * 16)) > 0 ? 0.25 + k * 0.6 : 0.05;
        for (let i = 0; i < band.n; i++) {
          band.mesh.setColorAt(i, this.col.copy(band.base[i]).lerp(WARN_C, blink));
          this.placeTile(band, i, -k * k * 0.12 + Math.sin(now * 50 + i * 1.7) * 0.025 * k, Math.sin(now * 37 + i) * 0.02 * k);
        }
        band.mesh.instanceColor!.needsUpdate = true;
        band.mesh.instanceMatrix.needsUpdate = true;
        if (this.t >= band.dropAt) {
          // it goes, round from one spot
          band.st = 2;
          const a0 = this.rnd() * Math.PI * 2;
          for (let i = 0; i < band.n; i++) {
            let d = Math.abs(i * band.seg - a0) % (Math.PI * 2);
            if (d > Math.PI) d = Math.PI * 2 - d;
            band.tt[i] = -(d / Math.PI) * RIPPLE - 0.001;
            band.mesh.setColorAt(i, this.col.copy(band.base[i]).lerp(WARN_C, 0.35));
          }
          band.mesh.instanceColor!.needsUpdate = true;
          sfx.thud();
          this.cam.shake(0.18);
        }
      } else if (band.st === 2) {
        let all = true;
        for (let i = 0; i < band.n; i++) {
          const was = band.tt[i];
          band.tt[i] += dt;
          const tt = band.tt[i];
          if (tt < 0) {
            all = false;
            this.placeTile(band, i, Math.sin(now * 50 + i) * 0.03, 0);
            continue;
          }
          if (was < 0) {
            // it breaks off: a puff of bits, a crack
            const a = i * band.seg;
            this.fx.burst(this.v.set(Math.cos(a) * band.mid, 0.1, -Math.sin(a) * band.mid), 5, [fl[0], fl[1], this.L.shape === "ring" ? "#ffffff" : "#ffc93a"], { speed: 3, up: 3, gravity: 20, size: 0.22, life: 0.8 });
            if (i % 4 === 0) sfx.roll();
          }
          if (tt < 3) all = false;
          this.placeTile(band, i, -0.5 * 16 * tt * tt, tt * 2.2, tt * 1.6);
        }
        band.mesh.instanceMatrix.needsUpdate = true;
        if (all) ((band.st = 3), (band.mesh.visible = false));
      }
    }
  }

  // ---- the events: NU7, the bumpers, the tilts, the capsules -------------------------------------

  private events(dt: number) {
    const t = this.t;
    if (this.over >= 0) {
      this.tiltK = Math.max(0, this.tiltK - dt * 1.5);
      return;
    }
    // NU7: a warning five seconds out (a tick a second), then the siren
    if (!this.said.qsoon && t >= BRAWL - 5) {
      this.said.qsoon = true;
      this.say(T("NU7 IN 5!", "NU7 倒计时 5！"), "#ff9a3c", 1.4);
      this.tickAt = BRAWL - 4;
    }
    if (this.tickAt > 0 && t >= this.tickAt && t < BRAWL) ((this.tickAt += 1), sfx.count());
    if (!this.qday && t >= BRAWL) {
      this.qday = true;
      this.say(T("NU7! NO MORE RESPAWNS", "NU7！不再复活"), "#ff4b4b", 2.0);
      siren(0.32);
      this.cam.shake(0.35);
      this.w.scene.background = this.qSky;
      this.flash = 1;
      music.rate(1.15);
      for (const p of this.posts) if (p.st === 2 || p.st === 1) ((p.st = 3), (p.t = 0));
      if (this.L.shape === "pads") this.sinkOrder();
      this.fx.burst(this.v.set(0, 0.5, 0), 40, ["#ff4b4b", "#ffd23f", "#ffffff"], { speed: 9, up: 6, size: 0.24, life: 1.1 });
    }
    // the BUMPERS: rings first, then up
    const NPOST = this.posts.length;
    if (!this.said.posts && NPOST && t >= POSTS_AT - POST_WARN) {
      this.said.posts = true;
      const a0 = this.rnd() * Math.PI * 2;
      for (let i = 0; i < NPOST; i++) {
        const p = this.posts[i];
        const a = a0 + (i / NPOST) * Math.PI * 2 + (this.rnd() - 0.5) * 0.5;
        const r = 5.3 + this.rnd() * 1.4;
        p.x = Math.cos(a) * r;
        p.z = Math.sin(a) * r;
        p.st = 1;
        p.t = 0;
      }
      siren(0.12, true);
    }
    for (const p of this.posts) {
      p.t += dt;
      p.flash = Math.max(0, p.flash - dt * 4);
      if (p.st === 1 && t >= POSTS_AT) {
        p.st = 2;
        p.t = 0;
        this.fx.burst(this.v.set(p.x, 0.3, p.z), 16, ["#ff4fa0", "#7fe0ff", "#ffffff"], { speed: 5, up: 6, size: 0.22, life: 0.8 });
        this.shock(p.x, p.z, "#7fe0ff", 3.2);
        // (whoever stands on it is popped off)
        for (let i = 0; i < 4; i++) {
          const b = this.b[i];
          if (!this.active(i)) continue;
          const dx = b.x - p.x,
            dz = b.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d < POST_R + b.r) this.ponged(i, p, d > 0.01 ? dx / d : 1, d > 0.01 ? dz / d : 0);
        }
        if (p === this.posts[0]) {
          this.say(T("BUMPERS UP!", "弹柱升起！"), "#ff4fa0", 1.3);
          sfx.thud();
          this.cam.shake(0.2);
        }
      }
      if (p.st === 3 && p.t > 0.7) p.st = 0;
    }
    // the tilts (the gusts): arrows show downhill (downwind), then it leans (blows), holds, and comes back level (calm)
    const L = this.L;
    const HOLD = L.tiltHold;
    this.tiltK = 0;
    let arrows = 0;
    for (let k = 0; k < L.tiltAt.length; k++) {
      const s0 = L.tiltAt[k];
      if (t < s0 - TILT_WARN) continue;
      if (!this.said.tilt[k]) {
        this.said.tilt[k] = true;
        const a = k === 0 ? this.rnd() * Math.PI * 2 : this.tiltDir[k - 1] + Math.PI + (this.rnd() < 0.5 ? -1 : 1) * (0.5 + this.rnd() * 0.6);
        this.tiltDir[k] = a;
        this.tiltX = Math.cos(a);
        this.tiltZ = Math.sin(a);
        siren(0.16, true);
        if (!L.tiltLean) sfx.whoosh();
        this.say(T(...L.tiltSay), L.tiltLean ? "#ffd23f" : "#bff0ff", 1.2);
      }
      const u = t - s0;
      const len = TILT_IN * 2 + HOLD;
      if (u < 0) arrows = Math.max(arrows, 1);
      else if (u < len) {
        this.tiltK = u < TILT_IN ? ease(u / TILT_IN) : u < TILT_IN + HOLD ? 1 : ease(1 - (u - TILT_IN - HOLD) / TILT_IN);
        arrows = Math.max(arrows, u < TILT_IN + HOLD ? 1 : 0);
        if (!this.said.tiltGo[k]) {
          this.said.tiltGo[k] = true;
          this.cam.shake(0.2);
          if (L.tiltLean) sfx.thud();
          else (sfx.whoosh(), whistle(0.05));
          // (the coin's low rim throws up sparks; a gust comes in as a wall of snow from upwind)
          const R = this.rSafe;
          for (let j = -2; j <= 2; j++) {
            const px = -this.tiltZ * j * 2.6,
              pz = this.tiltX * j * 2.6;
            if (L.tiltLean) this.fx.burst(this.v.set(this.tiltX * R + px, 0.2, this.tiltZ * R + pz), 6, ["#ffd23f", "#ffffff", "#ff9a3c"], { speed: 3, up: 3, size: 0.18, life: 0.7 });
            else this.fx.burst(this.v.set(-this.tiltX * (R + 1) + px, 0.6, -this.tiltZ * (R + 1) + pz), 8, ["#ffffff", "#dff6ff", "#bfe8ff"], { speed: 2, up: 0.6, gravity: 1.5, size: 0.15, life: 1.3, drag: 0.2, dir: this.v2.set(this.tiltX * 10, 0, this.tiltZ * 10) });
          }
        }
      }
    }
    // the drifts (the lilies): the outer pads glow and arrows point out, then they float apart, hold, and come back
    for (let k = 0; k < L.driftAt.length; k++) {
      const s0 = L.driftAt[k];
      if (t < s0 - DRIFT_WARN) continue;
      const u = t - s0;
      if (!this.said.drift[k]) {
        this.said.drift[k] = true;
        siren(0.16, true);
        this.say(T(...L.tiltSay), "#3ee0ff", 1.2);
        for (let p = 1; p < 7; p++) this.splash(this.pads[p].x - this.pads[p].ux * this.pads[p].r, this.pads[p].z - this.pads[p].uz * this.pads[p].r, 0, 1.2);
      }
      if (u < 0) arrows = Math.max(arrows, 1);
      else if (u < DRIFT_OUT) arrows = Math.max(arrows, 1 - u / DRIFT_OUT);
      if (u >= 0 && !this.said.driftGo[k]) {
        this.said.driftGo[k] = true;
        this.seamSpray();
        this.cam.shake(0.15);
        sfx.whoosh();
        if (!this.said.hop) {
          this.said.hop = true;
          this.say(T("RAM TO HOP THE GAP!", "冲撞跳过水缝！"), "#ffd23f", 1.6);
        }
      }
      if (u >= DRIFT_OUT + DRIFT_HOLD && !this.said.driftBack[k]) {
        this.said.driftBack[k] = true;
        this.say(T("CLOSING UP!", "合拢了！"), "#8ee35b", 1.0);
        sfx.blip(2);
        this.seamSpray();
      }
      if (u >= DRIFT_OUT + DRIFT_HOLD + DRIFT_BACK - 0.05 && u < DRIFT_OUT + DRIFT_HOLD + DRIFT_BACK + dt) (sfx.thud(), this.cam.shake(0.12));
    }
    this.arrowsK += (arrows - this.arrowsK) * Math.min(1, dt * 6);
    // the capsules: one falls about every POW_EVERY s (no more than two waiting)
    if (t >= this.nextCap) {
      const c = this.caps.find((q) => q.st === 0);
      if (c) this.spawnCap(c);
      this.nextCap = t + POW_EVERY * (0.85 + this.rnd() * 0.3);
    }
    for (const c of this.caps) {
      if (c.st === 0) continue;
      c.t += dt;
      if (c.st === 1 && c.t >= POW_FALL) {
        c.st = 2;
        c.t = 0;
        this.fx.burst(this.v.set(c.x, 0.4, c.z), 12, [PW_C[c.kind], "#ffffff"], { speed: 4, up: 3, size: 0.2, life: 0.6 });
        sfx.chips();
      } else if (c.st === 2 && (c.t >= POW_LIFE || !this.solid(c.x, c.z))) {
        c.st = 0;
        this.fx.burst(this.v.set(c.x, 0.8, c.z), 10, [PW_C[c.kind], "#ffffff"], { speed: 2.5, up: 2, size: 0.16, life: 0.5 });
      }
    }
  }

  private spawnCap(c: Cap) {
    // (a different one from the last; HALO RAM a touch rarer)
    let kind = 1 + Math.floor(this.rnd() * 3);
    if (kind === this.lastKind || (kind === SHOR && this.rnd() < 0.3)) kind = 1 + ((kind + Math.floor(this.rnd() * 2)) % 3);
    if (kind === this.lastKind) kind = 1 + (kind % 3);
    this.lastKind = kind;
    // somewhere safe, away from the bumpers; often near whoever is behind (a little help)
    let lo = 0;
    for (let i = 1; i < 4; i++) if (this.b[i].score < this.b[lo].score || (this.b[i].score === this.b[lo].score && this.rnd() < 0.5)) lo = i;
    // (off the coin: anywhere on the floor well in from its edges, the middle of the ring or of the middle pad at worst)
    const disc = this.L.shape === "disc";
    const R = disc ? Math.max(1.5, this.rSafe - 1.6) : this.extent();
    const near = this.rnd() < 0.4 && this.active(lo) && this.t > 6;
    let best = -Infinity;
    if (!disc) ((c.x = this.L.shape === "ring" ? (this.L.hole + this.rSafe) / 2 : 0), (c.z = 0));
    for (let k = 0; k < (disc ? 14 : 24); k++) {
      let x: number, z: number;
      if (near) {
        const a = this.rnd() * Math.PI * 2,
          d = 2.2 + this.rnd() * 2;
        x = this.b[lo].x + Math.cos(a) * d;
        z = this.b[lo].z + Math.sin(a) * d;
      } else {
        const a = this.rnd() * Math.PI * 2,
          d = Math.sqrt(this.rnd()) * R;
        x = Math.cos(a) * d;
        z = Math.sin(a) * d;
      }
      if (disc) {
        const r = Math.hypot(x, z);
        if (r > R) ((x *= R / r), (z *= R / r));
      } else if (this.edgeAt(x, z, true, this.en2) < 1.4) continue;
      let sc = 0;
      for (const p of this.posts) if (p.st === 1 || p.st === 2) sc -= Math.max(0, 3 - Math.hypot(x - p.x, z - p.z)) * 4;
      for (const o of this.caps) if (o !== c && o.st) sc -= Math.max(0, 4 - Math.hypot(x - o.x, z - o.z)) * 2;
      let nearest = 9;
      for (const b of this.b) if (b.fall < 0) nearest = Math.min(nearest, Math.hypot(x - b.x, z - b.z));
      sc += Math.min(nearest, near ? 2.5 : 3.5) + this.rnd() * 0.5;
      if (sc > best) ((best = sc), (c.x = x), (c.z = z));
    }
    c.kind = kind;
    c.st = 1;
    c.t = 0;
    c.box.material = this.capMats[kind - 1];
    (c.ring.material as THREE.MeshBasicMaterial).color.set(PW_C[kind]);
    sfx.blip(4);
    if (!this.said.pow) {
      this.said.pow = true;
      this.say(T("POWER-UP!", "道具来了！"), PW_C[kind], 1.1);
    }
  }

  // ---- the AI --------------------------------------------------------------------------------------

  /** On the floor and in play (not falling, not out, not dropping back in). */
  private active(i: number) {
    const b = this.b[i];
    return b.fall < 0 && !b.out && b.drop <= 0;
  }
  /** Worth bumping: in play, and not a ghost just back in. */
  private bumpable(i: number) {
    return this.active(i) && this.b[i].safe <= 0;
  }
  private alive(i: number) {
    return !this.b[i].out;
  }
  private skillOf(i: number) {
    return this.players[i].human ? this.bot : this.players[i].skill;
  }
  /** The top score now (and whether anybody has scored at all). */
  private topScore() {
    let m = -99;
    for (const b of this.b) m = Math.max(m, b.score);
    return m;
  }

  private dashOf(i: number, dx: number, dz: number, power: number) {
    const b = this.b[i];
    const shor = b.pw === SHOR;
    if (shor) power = 1;
    const sp = (DASH0 + DASH1 * power) * this.L.dash;
    b.vx = b.vx * 0.3 + dx * sp;
    b.vz = b.vz * 0.3 + dz * sp;
    b.fx = dx;
    b.fz = dz;
    b.cd = shor ? COOLDOWN * 0.5 : COOLDOWN;
    b.dash = DASH_T * (0.8 + 0.6 * power);
    b.power = power;
    b.charge = -1;
    if (b.y <= 0.01) ((b.vy = this.L.hop[0] + power * this.L.hop[1]), (b.air = this.L.airSafe));
    b.lvx -= dx * (3 + power * 4);
    b.lvz -= dz * (3 + power * 4);
    b.sqv -= 4 + power * 6;
    const human = this.players[i].human;
    this.fx.burst(this.v.set(b.x - dx * b.r, 0.15, b.z - dz * b.r), 8 + Math.round(power * 14), ["#ffffff", shor ? "#ff4b2b" : this.players[i].color, shor ? "#ffd23f" : "#ffffff"], { speed: 3 + power * 3, up: 1.5, gravity: 6, size: 0.24, life: 0.5 });
    if (human) (sfx.whoosh(), power > 0.7 && bonk(0.1, 0.18));
    else if (power > 0.7) sfx.whoosh();
    if (power > 0.8 && human) this.cam.shake(0.12);
    // those near see it coming (a pro in a blink, in time to sidestep)
    for (let j = 0; j < 4; j++) {
      const o = this.b[j];
      const react = 0.03 + (1 - this.skillOf(j)) * 0.3 + this.rnd() * 0.04;
      if (j !== i && !this.isHuman(j) && Math.hypot(o.x - b.x, o.z - b.z) < 6) o.think = Math.min(o.think, react);
    }
  }

  /** The human's seat when a real human plays it (not the bench's autopilot). */
  private isHuman(i: number) {
    return this.players[i].human && this.bot < 0;
  }

  private startCharge(i: number, ax: number, az: number) {
    const b = this.b[i];
    b.charge = b.pw === SHOR ? 1 : 0;
    b.full = 0;
    b.aimx = ax;
    b.aimz = az;
    b.buf = 0;
    b.arm = false;
    if (this.players[i].human) sfx.blip(1);
  }

  /** Accelerate toward a wanted velocity; a tourist half forgets how fast it already goes (and overshoots). */
  private steer(b: Ball, wx: number, wz: number, s: number) {
    const k = 0.3 + s * 0.7;
    // (minus the slide the tilt gives: a pro leans into it)
    const sl = this.tiltK * this.L.tiltAcc * 0.12 * s;
    const [sx, sz] = rot(wx - b.vx * k - this.tiltX * sl, wz - b.vz * k - this.tiltZ * sl, (this.rnd() - 0.5) * (1 - s) * 0.8, this.r2);
    const m = Math.hypot(sx, sz);
    if (m < 0.14) return void (b.thr = 0);
    b.ax = sx / m;
    b.az = sz / m;
    b.thr = Math.min(1, m / 2.1);
  }

  /** Its own safety first, then dodge, then a power-up, then pick a victim and push it outward from the centre side. */
  private think(i: number) {
    const me = this.b[i],
      s = this.skillOf(i),
      L = this.L,
      rnd = this.rnd,
      tp = this.temper[i],
      n = this.en;
    // (a small floor keeps a pro on its toes: it thinks more often)
    me.think = (0.1 + (1 - s) * 0.3 + rnd() * 0.08) * (L.shape === "disc" ? 1 : 1 - s * 0.3);
    if (me.charge >= 0) return;
    const pads = L.shape === "pads";
    const myPad = pads ? this.padOf(me.x, me.z) : -1;
    // (the lilies: on the way to a hop over the water to another pad)
    if (me.hopTo >= 0 && this.hopThink(i, s)) return;
    me.hopTo = -1;
    // where the slide takes me in a moment (a pro looks further ahead; a tourist sometimes forgets to look)
    const look = (0.08 + s * 0.5) * L.look;
    const sl = this.tiltK * L.tiltAcc;
    const px = me.x + me.vx * look + this.tiltX * sl * look * look * 0.5,
      pz = me.z + me.vz * look + this.tiltZ * sl * look * look * 0.5;
    let pe = this.edgeAt(px, pz, true, n);
    // (a floor that is not convex, the ring round its hole, the pads: the way there counts too)
    if (L.shape !== "disc")
      for (let k = 1; k <= 2; k++) {
        const u = k / 3;
        const e = this.edgeAt(me.x + (px - me.x) * u, me.z + (pz - me.z) * u, true, this.en2);
        if (e < pe) ((pe = e), (n[0] = this.en2[0]), (n[1] = this.en2[1]));
      }
    const nx = n[0],
      nz = n[1];
    // (a shield saves one fall: bolder near the edge)
    const margin = me.r * (s * 2.6 - 0.2) * L.margin + this.tiltK * (0.4 + s * 0.8) - tp.nerve * 0.3 - (me.pw === SHIELD ? 0.6 : 0);
    if (pe < margin && rnd() > (1 - s) * (1 - s) * 0.5) {
      const out = me.vx * nx + me.vz * nz;
      if (out > 3.2 && pe < 0.5) me.panic = 0.7;
      // (off the coin's very middle there is always a way in; elsewhere, back the way it came)
      if (nx === 0 && nz === 0) return this.steer(me, -me.vx, -me.vz, s);
      return this.steer(me, -nx * 8.1, -nz * 8.1, s);
    }
    // a bumper in my way: round it (a pro)
    for (const p of this.posts) {
      if (p.st !== 2) continue;
      const dx = px - p.x,
        dz = pz - p.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < POST_R + me.r + 0.5 && rnd() < s * 0.8) return this.steer(me, (dx / d) * 6 - nx * 2, (dz / d) * 6 - nz * 2, s);
    }
    // (the way in from where I am: a sidestep goes that side)
    this.edgeAt(me.x, me.z, true, this.en2);
    const mx = this.en2[0],
      mz = this.en2[1];
    // somebody winding up at me, or ramming straight at me: sidestep (toward the centre)
    for (let j = 0; j < 4; j++) {
      const o = this.b[j];
      if (j === i || !this.active(j)) continue;
      const rx = me.x - o.x,
        rz = me.z - o.z;
      const rd = Math.hypot(rx, rz) || 1;
      if (o.charge >= 0 && rd < 6 && (rx * o.aimx + rz * o.aimz) / rd > 0.86 && rnd() < s * 0.55) {
        const side = -o.aimz * mx + o.aimx * mz > 0 ? -1 : 1;
        return this.steer(me, -o.aimz * side * 7.5, o.aimx * side * 7.5, s);
      }
      if (o.dash > 0 && me.cd <= 0) {
        const vs = Math.hypot(o.vx, o.vz) || 1;
        if (rd < 6 && (rx * o.vx + rz * o.vz) / (rd * vs) > 0.9 && rnd() < s * 0.7) {
          const side = -o.vz * mx + o.vx * mz > 0 ? -1 : 1;
          return this.dashOf(i, (-o.vz / vs) * side, (o.vx / vs) * side, 0.1);
        }
      }
    }
    // somebody rolling in on me fast: a good one rams first (whoever rams wins the bonk)
    if (me.cd <= 0 && this.t > 1.5) {
      for (let j = 0; j < 4; j++) {
        const o = this.b[j];
        if (j === i || !this.bumpable(j)) continue;
        const rx = o.x - me.x,
          rz = o.z - me.z;
        const rd = Math.hypot(rx, rz) || 1;
        const closing = -((o.vx - me.vx) * rx + (o.vz - me.vz) * rz) / rd;
        if (rd < 2.6 && closing > 2.2 && rnd() < s * s * 0.8) {
          const ax = rx / rd,
            az = rz / rd;
          if (this.edgeAt(me.x + ax * 2.5, me.z + az * 2.5, true, this.en2) > 0.2) return this.dashOf(i, ax, az, 0.15);
        }
      }
    }
    // a power-up lying near (the greedy ones go further for it), unless a rival is closer to it (or it is on another pad, out of reach)
    if (me.goal >= 0 && this.caps[me.goal].st === 0) me.goal = -1;
    if (me.goal < 0 && me.pw === 0 && this.t > 1) {
      let best = 4 + tp.greed * 6;
      for (let k = 0; k < NCAP; k++) {
        const c = this.caps[k];
        if (c.st !== 2 && !(c.st === 1 && c.t > POW_FALL * 0.4)) continue;
        if (this.edgeAt(c.x, c.z, true, this.en2) < 0.8) continue;
        if (pads && !this.joined(myPad, this.padOf(c.x, c.z))) continue;
        const d = Math.hypot(c.x - me.x, c.z - me.z);
        let rival = 99;
        for (let j = 0; j < 4; j++) if (j !== i && this.active(j)) rival = Math.min(rival, Math.hypot(c.x - this.b[j].x, c.z - this.b[j].z));
        const sc = d + (rival < d - 1 ? 3 * s : 0) + rnd() * 1.5;
        if (sc < best) ((best = sc), (me.goal = k));
      }
    }
    if (me.goal >= 0) {
      const c = this.caps[me.goal];
      const dx = c.x - me.x,
        dz = c.z - me.z;
      const d = Math.hypot(dx, dz) || 1;
      if (this.edgeAt(c.x, c.z, true, this.en2) > 0.6 && (!pads || this.joined(myPad, this.padOf(c.x, c.z))) && rnd() > 0.08) {
        const sp = Math.min(8, d * (1.6 + s * 1.4));
        return this.steer(me, (dx / d) * sp, (dz / d) * sp, s);
      }
      me.goal = -1;
    }
    // a victim: near me, better still near the edge (a pro picks on the edge more), not the one
    // another AI is already after (mostly), the leader for a bully, who just rammed me for anyone
    // (the lilies: one on my own island, mostly)
    if (me.target < 0 || !this.bumpable(me.target) || rnd() < 0.05) {
      if (me.angry <= 0 || me.target < 0 || !this.bumpable(me.target)) {
        let best = Infinity;
        const top = this.topScore();
        for (let j = 0; j < 4; j++) {
          if (j === i || !this.bumpable(j)) continue;
          const o = this.b[j];
          let taken = 0;
          for (let k = 0; k < 4; k++) if (k !== i && this.b[k].target === j && !this.players[k].human && this.alive(k)) taken++;
          // (the first seconds, nobody goes for the human: time to find the controls; a weak AI
          // would rather pick on another AI: easy tables are easy)
          const grace = this.players[j].human ? (this.t < 3 ? 14 : 0) + 7 * (1 - s) : 0;
          // (the leader, a couple of points clear: a bully gangs up on it)
          const lead = o.score >= top && o.score >= me.score + 2 ? tp.bully * 3.2 : 0;
          const away = pads && !this.joined(myPad, this.padOf(o.x, o.z)) ? 7 : 0;
          const sc = Math.hypot(o.x - me.x, o.z - me.z) + this.edgeAt(o.x, o.z, true, this.en2) * (0.3 + s * 1.2) + taken * 2.1 * (1 - tp.bully * 0.6) + rnd() * 2.8 * (1 - s) + grace - lead + (o.pw === HEAVY || o.pw === SHIELD ? 2.5 : 0) + away;
          if (sc < best) ((best = sc), (me.target = j));
        }
      }
    }
    if (me.target < 0 || !this.bumpable(me.target)) return this.goHome(me, s);
    const t = this.b[me.target];
    // (on another island: a pro hops over to it, the others wait in the middle of theirs)
    if (pads) {
      const tPad = this.padOf(t.x, t.z);
      if (!this.joined(myPad, tPad)) {
        // (once a drift, it makes up its mind: a pro often hops, a tourist never)
        const dk = this.driftK();
        if (dk >= 0 && me.hopK !== dk) ((me.hopK = dk), (me.hopYes = s > 0.4 && rnd() < s * 0.55));
        if (myPad >= 0 && tPad >= 0 && !this.driftSoon && me.hopYes && me.cd <= 0) {
          me.hopTo = tPad;
          if (this.hopThink(i, s)) return;
          me.hopTo = -1;
        }
        return this.goHome(me, s);
      }
    }
    const tr = Math.hypot(t.x, t.z);
    const dx = t.x - me.x,
      dz = t.z - me.z;
    const d = Math.hypot(dx, dz) || 1;
    // "outward" through the victim (straight at it, when it holds the centre)
    const te = this.edgeAt(t.x, t.z, true, this.en2);
    const deep = L.shape === "disc" ? tr <= 1.1 : (this.en2[0] === 0 && this.en2[1] === 0) || te > 4;
    const ux = deep ? dx / d : this.en2[0],
      uz = deep ? dz / d : this.en2[1];
    // wind up when lined up: a jab up close, a long charge from further; a tourist misjudges that,
    // hesitates, and does not always look where a miss would leave it
    const warm = this.t > 0.8 + (1 - s) * 0.6;
    const shor = me.pw === SHOR;
    const reach = ((shor ? 4.6 : 4.4) - s * 0.6 + (1 - s) * rnd() * 2.4) * (0.5 + L.dash * 0.5);
    if (warm && me.cd <= 0 && d < reach && (dx * ux + dz * uz) / d > 0.8 - (1 - s) * 0.5 - (L.shape === "disc" ? 0 : 0.3)) {
      const lead = (d / 16) * s;
      let [ax, az] = rot(t.x + t.vx * lead - me.x, t.z + t.vz * lead - me.z, (rnd() - 0.5) * (1 - s) * 1.1, this.r2);
      const m = Math.hypot(ax, az) || 1;
      ax /= m;
      az /= m;
      const probe = (2.1 + 3.9 * s) * L.probe;
      const safe = d < 2.3 || (this.edgeAt(me.x + ax * probe, me.z + az * probe, true, this.en2) > 0.35 && (L.shape !== "ring" || this.edgeAt(me.x + ax * probe * 0.5, me.z + az * probe * 0.5, true, this.en2) > 0.35)) || rnd() < (1 - s) * 0.3 + tp.nerve * 0.1;
      if (safe && rnd() < 0.2 + s * 0.8) {
        // (how long to wind: by the distance; a pro a touch shorter, so it lands before the victim slips away)
        const goal = d < 2.1 ? 0.08 + rnd() * 0.15 : clamp((d - 1.7) / 2.4, 0.2, 1) * (0.85 + rnd() * 0.3) - s * 0.08 + (rnd() - 0.5) * (1 - s) * 0.5;
        me.windGoal = clamp(goal, 0.05, 1);
        this.startCharge(i, ax, az);
        return;
      }
    }
    // get on its centre side (round it, when I am on its outer side); a tourist often just rams it
    const smart = rnd() < 0.3 + s * 0.7;
    let wx = t.x - (smart ? ux * (BR * 2 + 1.1) : 0) - me.x,
      wz = t.z - (smart ? uz * (BR * 2 + 1.1) : 0) - me.z;
    if (smart && (me.x - t.x) * ux + (me.z - t.z) * uz > -BR) {
      const side = -(me.x - t.x) * uz + (me.z - t.z) * ux >= 0 ? 1 : -1;
      wx -= uz * side * 3.2;
      wz += ux * side * 3.2;
    }
    // (the ring: never straight over the hole; round it, the shorter way, a pro sooner)
    if (L.shape === "ring" && rnd() < 0.4 + s * 0.6) {
      const gx = me.x + wx,
        gz = me.z + wz;
      const ll = wx * wx + wz * wz || 1;
      const u = clamp(-(me.x * wx + me.z * wz) / ll, 0, 1);
      if (Math.hypot(me.x + wx * u, me.z + wz * u) < L.hole + 1.4) {
        const am = Math.atan2(me.z, me.x),
          ag = Math.atan2(gz, gx);
        let da = ag - am;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const a = am + Math.sign(da || 1) * Math.min(Math.abs(da), 1.1);
        const mid = (L.hole + this.rSafe) / 2;
        wx = Math.cos(a) * mid - me.x;
        wz = Math.sin(a) * mid - me.z;
      }
    }
    const wm = Math.hypot(wx, wz) || 1;
    let sp = Math.min(8.5, wm * (1.5 + s * 1.5)) * (me.angry > 0 ? 1.15 : 1);
    // (off the coin a pro slows down near an edge: no overshooting a small pad)
    if (L.shape !== "disc") sp *= 1 - s * 0.55 * (1 - clamp(this.edgeAt(me.x, me.z, true, this.en2) / 2.4, 0, 1));
    this.steer(me, (wx / wm) * sp, (wz / wm) * sp, s);
  }

  /** Nothing to do: back toward the safe middle (of the coin; of the ring's ice; of my pad). */
  private goHome(me: Ball, s: number) {
    const L = this.L;
    let hx = 0,
      hz = 0;
    if (L.shape === "ring") {
      const r = Math.hypot(me.x, me.z) || 1,
        mid = (L.hole + this.rSafe) / 2;
      hx = (me.x / r) * mid;
      hz = (me.z / r) * mid;
    } else if (L.shape === "pads") {
      const k = this.padOf(me.x, me.z);
      if (k >= 0) ((hx = this.pads[k].x), (hz = this.pads[k].z));
    }
    return this.steer(me, (hx - me.x) * 0.6, (hz - me.z) * 0.6, s);
  }

  /**
   * The lilies, apart: get to my pad's rim facing the pad I want, then a ram just strong enough to hop
   * the water (a pro judges it well, a tourist less). False: no hop from here (too far, it closed).
   */
  private hopThink(i: number, s: number) {
    const me = this.b[i];
    const from = this.padOf(me.x, me.z),
      to = me.hopTo;
    if (from < 0 || to < 0 || from === to || this.joined(from, to) || this.pads[to].st >= 1 || this.qday || this.driftSoon) return false;
    const a = this.pads[from],
      b = this.pads[to];
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const dd = Math.hypot(dx, dz) || 1;
    const gap = dd - a.r - b.r;
    if (gap > 2.2) return false;
    const ux = dx / dd,
      uz = dz / dd;
    // the launch: in from my rim by 1.2 m, on the line between the pads
    const lx = a.x + ux * (a.r - 1.2),
      lz = a.z + uz * (a.r - 1.2);
    const ld = Math.hypot(lx - me.x, lz - me.z);
    const sp = Math.hypot(me.vx, me.vz);
    if (ld < 0.55 + (1 - s) * 0.3 && sp < 2.5 && me.cd <= 0) {
      // (the water to clear: from here to 1.4 m onto the far pad)
      const need = ld + 1.2 + gap + 1.4;
      me.windGoal = clamp((need - 2.6) / 2.6 + (this.rnd() - 0.5) * (1 - s) * 0.5, 0.05, 1);
      me.target = -1;
      this.startCharge(i, ux, uz);
      me.hopTo = -1;
      return true;
    }
    const k = Math.min(1, ld / 2);
    this.steer(me, ((lx - me.x) / (ld || 1)) * (1.5 + 4 * k), ((lz - me.z) / (ld || 1)) * (1.5 + 4 * k), s);
    return true;
  }

  /** An AI winding up: it tracks its victim (a pro better) and lets go at the charge it wanted. */
  private aiWind(i: number, dt: number) {
    const me = this.b[i],
      s = this.skillOf(i);
    me.thr = 0;
    const tg = me.target >= 0 && this.bumpable(me.target) ? this.b[me.target] : null;
    if (tg) {
      const lead = (Math.hypot(tg.x - me.x, tg.z - me.z) / 16) * s;
      const dx = tg.x + tg.vx * lead - me.x,
        dz = tg.z + tg.vz * lead - me.z;
      const d = Math.hypot(dx, dz) || 1;
      const k = Math.min(1, dt * (2 + s * 10));
      me.aimx += (dx / d - me.aimx) * k;
      me.aimz += (dz / d - me.aimz) * k;
      const m = Math.hypot(me.aimx, me.aimz) || 1;
      me.aimx /= m;
      me.aimz /= m;
      // (it slipped away: let go now, or give up)
      if (d > 7) me.windGoal = Math.min(me.windGoal, me.charge);
    }
    // (my own edge comes first: a pro gives up the wind-up)
    // (a chance per second, not per frame: what it was at 60 frames a second, now the same at 30 or 120)
    if (this.edgeAt(me.x, me.z, true, this.en2) < me.r * 0.8 && this.rnd() < 1 - Math.pow(1 - s * 0.2, dt * 60)) {
      me.charge = -1;
      me.cd = 0.3;
      me.think = 0;
      return;
    }
    if (me.charge >= me.windGoal || me.full > 0.2) this.dashOf(i, me.aimx, me.aimz, Math.max(0.1, me.charge));
  }

  // ---- the frame -----------------------------------------------------------------------------------

  update(dt: number, input: Input) {
    // (the host's first frame can hand a hair below zero: rAF's stamp is older than its start)
    dt = Math.max(0, dt);
    const real = dt;
    if (!this.started) {
      this.started = true;
      if (this.human >= 0) this.rumble.start();
    }
    // (a big hit freezes the moment, a blink)
    if (this.freeze > 0) {
      this.freeze -= real;
      dt *= 0.12;
    }
    this.clock += dt;
    this.hitCool -= dt;
    if (this.over < 0) this.t = Math.min(LIMIT, this.t + dt);
    else if ((this.over += dt) > 0.5 && !this.done) this.done = this.order;
    this.events(dt);
    this.crumble(dt, this.clock);
    if (this.L.shape === "pads") {
      this.padsMove(dt);
      // (what lies on a drifting pad goes with it: the capsules, where the fallen will land)
      for (const c of this.caps) {
        if (c.st === 0) continue;
        const k = this.padOf(c.x, c.z);
        if (k > 0) ((c.x += this.pads[k].vx * dt), (c.z += this.pads[k].vz * dt));
      }
      for (const b of this.b) {
        if (!((b.fall >= 0 && b.spot) || b.drop > 0)) continue;
        const k = this.padOf(b.sx, b.sz);
        if (k <= 0) continue;
        b.sx += this.pads[k].vx * dt;
        b.sz += this.pads[k].vz * dt;
        if (b.drop > 0) ((b.x = b.sx), (b.z = b.sz));
      }
    }
    // the controls: your arrows (as the camera sees them) and A, the AIs' minds
    const cam = this.w.camera;
    cam.getWorldDirection(this.v);
    const fl = Math.hypot(this.v.x, this.v.z) || 1;
    const fwx = this.v.x / fl,
      fwz = this.v.z / fl;
    for (let i = 0; i < 4; i++) {
      const b = this.b[i];
      const hu = this.isHuman(i);
      // (your ram charged again: a ding)
      if (b.cd > 0 && b.cd <= dt && hu && this.active(i) && this.over < 0) sfx.blip(6);
      b.cd = Math.max(0, b.cd - dt);
      b.dash = Math.max(0, b.dash - dt);
      b.stun = Math.max(0, b.stun - dt);
      b.safe = Math.max(0, b.safe - dt);
      b.panic = Math.max(0, b.panic - dt);
      b.buf = Math.max(0, b.buf - dt);
      if (b.angry > 0 && (b.angry -= dt) <= 0) this.av[i].angry = false;
      if (b.pw && b.fall < 0 && this.over < 0 && (b.pwT -= dt) <= 0) this.endPower(i);
      if (!this.active(i) || this.over >= 0) {
        b.thr = 0;
        b.charge = -1;
        continue;
      }
      if (b.charge >= 0) {
        const was = b.charge;
        b.charge = Math.min(1, b.charge + dt / WIND);
        if (b.charge >= 1) b.full += dt;
        if (hu && was < 0.5 && b.charge >= 0.5) sfx.blip(3);
        if (hu && was < 1 && b.charge >= 1) (sfx.blip(8), ding(0.08, 1568));
      }
      if (hu) {
        const a = input.axis();
        // right on screen, and away from the camera for "up"
        const mx = -fwz * a.x + fwx * -a.y,
          mz = fwx * a.x + fwz * -a.y;
        const m = Math.hypot(mx, mz);
        // (a stick's tilt is the push, full from four fifths out; the arrows: all of it)
        b.thr = Math.min(1, m / 0.8);
        if (m) ((b.ax = mx / m), (b.az = mz / m), (b.fx = b.ax), (b.fz = b.az));
        if (input.pressed("a")) ((b.buf = 0.22), (b.arm = true));
        if (!input.held("a")) b.arm = false;
        if (b.charge < 0) {
          if ((b.buf > 0 || b.arm) && b.cd <= 0) {
            this.startCharge(i, b.fx, b.fz);
            // (a tap shorter than a frame: a jab at once)
            if (!input.held("a")) this.dashOf(i, b.aimx, b.aimz, 0.12);
          }
        } else {
          if (m) ((b.aimx = b.ax), (b.aimz = b.az));
          if (!input.held("a") || b.full > HOLD_MAX) this.dashOf(i, b.aimx, b.aimz, Math.max(0.12, b.charge));
        }
      } else {
        if ((b.think -= dt) <= 0) this.think(i);
        if (b.charge >= 0) this.aiWind(i, dt);
      }
    }
    // the physics, in small steps so a ram never jumps through anyone
    const n = Math.ceil(dt / (1 / 120)),
      h = dt / n;
    const L = this.L;
    const pads = L.shape === "pads";
    const sl = this.tiltK * L.tiltAcc;
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < 4; i++) {
        const b = this.b[i];
        if (!this.active(i)) continue;
        const heavy = b.pw === HEAVY;
        const wind = b.charge >= 0;
        const push = b.stun <= 0 && this.over < 0 ? b.thr * L.acc * (wind ? 0.3 : 1) * (heavy ? 0.82 : 1) * h : 0;
        // (the human's assist, as party games do: more grip near the rim, so a drift is not a fall)
        const grip = this.players[i].human && this.edgeAt(b.x, b.z, false, this.en2) < 1.2 ? L.grip : 1;
        const f = Math.exp(-(this.over >= 0 ? 4 : L.drag * grip * (wind ? 1.8 : 1)) * h);
        b.vx = (b.vx + b.ax * push + this.tiltX * sl * h) * f;
        b.vz = (b.vz + b.az * push + this.tiltZ * sl * h) * f;
        b.x += b.vx * h;
        b.z += b.vz * h;
        // (on a drifting pad: carried along)
        if (pads && b.y <= 0.02) {
          const pk = this.padOf(b.x, b.z);
          if (pk > 0) ((b.x += this.pads[pk].vx * h), (b.z += this.pads[pk].vz * h));
        }
        if (b.y > 0 || b.vy > 0) {
          b.vy -= G * h;
          b.y += b.vy * h;
          if (b.y <= 0) {
            // (the lilies: a ram's hop lands with a stomp)
            if (b.air && b.vy < -2.5) this.stomp(i);
            b.air = false;
            b.y = 0;
            b.vy = b.vy < -2.5 ? -b.vy * 0.3 : 0;
          }
        }
        for (const p of this.posts) {
          if (p.st !== 2) continue;
          const dx = b.x - p.x,
            dz = b.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d < POST_R + b.r && d > 0.001) this.ponged(i, p, dx / d, dz / d);
        }
        // (the lilies: a ball in the air over the water flies on; it falls if it comes down on it)
        if (!this.solid(b.x, b.z) && !(L.airSafe && b.y > 0.02)) {
          if (b.pw === SHIELD && this.over < 0) this.saved(i);
          else this.fallOff(i);
        }
      }
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (this.bumpable(i) && this.bumpable(j)) this.collide(i, j);
    }
    // the capsules: whoever rolls into one takes it
    for (const c of this.caps) {
      if (c.st !== 2 || this.over >= 0) continue;
      for (let i = 0; i < 4; i++) {
        const b = this.b[i];
        if (!this.active(i) || Math.hypot(b.x - c.x, b.z - c.z) > b.r + 0.6) continue;
        this.take(i, c);
        break;
      }
    }
    // over the edge: the ball and its snark drop toward the city (or fly off to the stars), then
    // drop back in; dropping in from the sky
    for (let i = 0; i < 4; i++) {
      const b = this.b[i];
      if (b.drop > 0) {
        b.drop = Math.max(0, b.drop - dt);
        const u = 1 - b.drop / DROP;
        b.y = DROP_H * (1 - u * u);
        b.vy = (-2 * DROP_H * u) / DROP;
        if (b.drop <= 0) this.land(i);
        continue;
      }
      if (b.fall < 0) continue;
      b.fall += dt;
      const d = Math.exp(-(b.star ? 0.05 : 0.25) * dt);
      b.vx *= d;
      b.vz *= d;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.vy -= (b.star ? G * 0.35 : G) * dt;
      b.y += b.vy * dt;
      b.mvy -= (b.star ? G * 0.3 : G * 0.85) * dt;
      b.mx += b.mvx * dt;
      b.my += b.mvy * dt;
      b.mz += b.mvz * dt;
      // (into the bay: a splash, and down slowly, the snark after it)
      if (this.L.water && !b.star) {
        if (!b.wet && b.y < WATER_Y) ((b.wet = true), this.splash(b.x, b.z, 18, 1, this.players[i].human ? 0.4 : 0.22));
        if (b.wet) {
          const k = Math.exp(-5 * dt);
          b.vx *= k;
          b.vz *= k;
          b.vy = Math.max(b.vy, -2);
        }
        if (!b.mwet && b.my < WATER_Y + 0.3 && b.mvy < 0) ((b.mwet = true), this.splash(b.mx, b.mz, 12, 0.6, 0.12));
        if (b.mwet) {
          const k = Math.exp(-5 * dt);
          b.mvx *= k;
          b.mvz *= k;
          b.mvy = Math.max(b.mvy, -1.6);
        }
      }
      if (b.star && b.fall >= 0.95 && b.fall - dt < 0.95) this.twinkle(i);
      if (!b.out && this.over < 0) {
        if (!b.spot && b.fall >= RESPAWN - 0.7) this.pickSpot(i);
        if (b.fall >= RESPAWN) this.respawn(i);
      }
    }
    // decided: NU7 and one left (or none), or the time is up; whoever is still on gets the bonus
    if (this.over < 0) {
      let left = 0;
      for (let i = 0; i < 4; i++) if (this.alive(i)) left++;
      if ((this.qday && left <= 1) || this.t >= LIMIT) this.finish(left);
    }
    // (the announcer says one thing at a time, the rest wait their turn)
    if (this.news.length && (this.news[0].t += real) > this.news[0].d) this.news.shift();
    if (this.news.length > 3) this.news.splice(1, this.news.length - 3);
    for (const p of this.pops) p.t += real;
    while (this.pops.length && this.pops[0].t > 1.3) this.pops.shift();
    this.zoom = Math.max(0, this.zoom - real * 1.6);
    this.flash = Math.max(0, this.flash - real * 2.2);
    if (this.qday && this.qk < 1) {
      this.qk = Math.min(1, this.qk + real * 0.9);
      const fog = this.w.scene.fog as THREE.Fog | null;
      if (fog) fog.color.copy(this.fog0).lerp(QD_FOG, this.qk * 0.8);
      this.w.hemi.color.copy(this.hemi0).lerp(QD_HEMI, this.qk);
      this.w.sun.color.copy(this.sun0).lerp(QD_SUN, this.qk);
      this.scenery.alarm(this.qk);
    }
    this.visual(dt);
    this.playCam(this.eye, this.at);
    this.cam.to(this.eye, this.at, real, 2.2);
    this.cam.apply(real);
    this.fx.update(dt);
    const hb = this.human >= 0 ? this.b[this.human] : null;
    this.rumble.set(hb && this.active(this.human) && hb.y < 0.05 ? Math.min(0.5, Math.hypot(hb.vx, hb.vz) * 0.06) : 0);
  }

  private finish(left: number) {
    const on: number[] = [];
    for (let i = 0; i < 4; i++) if (this.alive(i)) on.push(i);
    for (const i of on) {
      const b = this.b[i];
      b.score += LAST_PTS;
      this.pop(i, `+${LAST_PTS}`, "#ffd23f", true);
    }
    if (left === 1) {
      const w = on[0];
      this.say(this.players[w].human ? T(`YOU'RE THE LAST ON! +${LAST_PTS}`, `你坚持到最后！+${LAST_PTS}`) : T(`${short(this.players[w])} LAST ON! +${LAST_PTS}`, `${short(this.players[w])} 坚持到最后！+${LAST_PTS}`), this.players[w].color, 1.6);
      sfx.star();
    } else if (left > 1) {
      this.say(T(`TIME! STILL ON +${LAST_PTS}`, `时间到！留在台上 +${LAST_PTS}`), "#ffffff", 1.6);
      sfx.fanfare();
    } else this.say(T("NOBODY LEFT!", "全掉下去了！"), "#ffffff", 1.4);
    const key = (i: number) => this.b[i];
    this.order = [0, 1, 2, 3].sort((a, c) => {
      const A = key(a),
        C = key(c);
      return C.score - A.score || (C.out ? C.outAt : 1e9) - (A.out ? A.outAt : 1e9) || C.kos - A.kos || A.falls - C.falls || Math.hypot(A.x, A.z) - Math.hypot(C.x, C.z) || a - c;
    });
    this.over = 0;
    const win = this.order[0];
    if (this.active(win)) this.av[win].cheer(3);
    for (let i = 0; i < 4; i++) if (i !== win && this.active(i) && i === this.order[1]) this.av[i].angry = true;
  }

  private collide(i: number, j: number) {
    const a = this.b[i],
      c = this.b[j];
    const dx = c.x - a.x,
      dz = c.z - a.z;
    const d = Math.hypot(dx, dz);
    const rs = a.r + c.r;
    if (d >= rs || d === 0) return;
    const nx = dx / d,
      nz = dz / d;
    const vrel = (a.vx - c.vx) * nx + (a.vz - c.vz) * nz;
    // who hits whom: the faster one along the line
    const aFast = a.vx * nx + a.vz * nz > -(c.vx * nx + c.vz * nz);
    const hit = aFast ? i : j,
      hurt = aFast ? j : i;
    const hb = this.b[hit],
      vb = this.b[hurt];
    const shor = hb.pw === SHOR && hb.dash > 0;
    const ma = massOf(a, c),
      mc = massOf(c, a);
    const lap = rs - d;
    a.x -= nx * lap * (mc / (ma + mc));
    a.z -= nz * lap * (mc / (ma + mc));
    c.x += nx * lap * (ma / (ma + mc));
    c.z += nz * lap * (ma / (ma + mc));
    if (vrel <= 0) return;
    // a springy bounce, then the faster one shoves the other
    const mu = (ma * mc) / (ma + mc);
    const J = (1 + BOUNCE) * vrel * mu + (vrel > 1 ? POP * 2 * mu : 0);
    a.vx -= (nx * J) / ma;
    a.vz -= (nz * J) / ma;
    c.vx += (nx * J) / mc;
    c.vz += (nz * J) / mc;
    const sx = aFast ? nx : -nx,
      sz = aFast ? nz : -nz;
    const rammed = hb.dash > 0;
    let kick = vrel * (rammed ? KNOCK_DASH * (0.55 + 0.9 * hb.power) : KNOCK_BUMP);
    kick *= (shor ? 1.5 : 1) * (hb.pw === HEAVY ? 1.4 : 1) * (this.players[hurt].human ? this.L.soft : 1);
    if (!shor && vb.pw === HEAVY) kick *= 0.3;
    const shielded = !shor && vb.pw === SHIELD;
    if (shielded) {
      // (it bounces off the shield)
      hb.vx -= sx * (2 + vrel * 0.2);
      hb.vz -= sz * (2 + vrel * 0.2);
      if (vrel > 2 && this.hitCool <= 0) ding(0.1, 1760);
    } else {
      vb.vx += sx * kick;
      vb.vz += sz * kick;
    }
    if (shor && vb.pw === SHIELD) {
      // HALO RAM breaks the shield
      this.endPower(hurt);
      this.say(T("SHIELD BROKEN!", "护盾被破！"), PW_C[SHOR], 1.0);
      this.fx.burst(this.v.set(vb.x, vb.r + 0.4, vb.z), 24, ["#9ff4ff", "#ffffff"], { speed: 7, up: 4, size: 0.2, life: 0.8 });
    }
    // a ram lands once: the one hit is dazed a moment, then gets its wits back (quick for a pro)
    if (rammed) ((vb.stun = shielded ? 0 : 0.15), (hb.dash = 0));
    if (!this.isHuman(hurt)) vb.think = Math.min(vb.think, vb.stun + 0.04 + (1 - this.skillOf(hurt)) * 0.3);
    vb.by = hit;
    vb.byAt = this.t;
    if (vrel < 1.6) return;
    // the bonk: both squash, the one hit hops and reels, bits fly, the camera shakes
    const k = clamp((vrel - 1.6) / 9, 0, 1);
    a.sqv += 2 + k * 9;
    c.sqv += 2 + k * 9;
    if (vb.y <= 0.02 && !shielded) vb.vy = 1.4 + k * 4.5;
    vb.lvx += sx * (2 + k * 10);
    vb.lvz += sz * (2 + k * 10);
    hb.lvx -= sx * 2;
    hb.lvz -= sz * 2;
    const mx = (a.x + c.x) / 2,
      mz = (a.z + c.z) / 2,
      my = BR + Math.max(a.y, c.y);
    this.fx.burst(this.v.set(mx, my, mz), 6 + Math.round(k * 22), ["#ffffff", "#ffd23f", this.players[hit].color], { speed: 3 + k * 7, up: 3 + k * 3, size: 0.17, life: 0.7 });
    if (k > 0.15 || rammed) {
      this.av[hurt].hit();
      this.pow(mx, my + 0.3, mz, 0.9 + k * 1.6);
    }
    // (a real ram: the victim gets cross, and may come for revenge)
    if (rammed && hb.power > 0.3 && !this.isHuman(hurt) && this.rnd() < 0.45 + this.temper[hurt].bully * 0.4) {
      vb.target = hit;
      vb.angry = 2.5;
      this.av[hurt].angry = true;
    }
    const near = this.players[i].human || this.players[j].human;
    this.cam.shake((near ? 0.12 : 0.05) + k * (near ? 0.45 : 0.22));
    if (rammed && k > 0.45 && (near ? hb.power > 0.55 : hb.power > 0.85)) this.freeze = 0.05 + hb.power * 0.05;
    if (this.hitCool <= 0) {
      this.hitCool = 0.07;
      bonk(k, near ? 0.55 : 0.3);
    }
  }

  /** Off a BUMPER: flung away from it, the cap flashes, a pong. */
  private ponged(i: number, p: Post, nx: number, nz: number) {
    const b = this.b[i];
    const d = POST_R + b.r;
    b.x = p.x + nx * (d + 0.01);
    b.z = p.z + nz * (d + 0.01);
    const vn = b.vx * nx + b.vz * nz;
    const want = POST_V * (b.pw === HEAVY ? 0.6 : 1);
    if (vn < want) ((b.vx += nx * (want - vn)), (b.vz += nz * (want - vn)));
    if (b.y <= 0.02) b.vy = 3;
    b.sqv += 8;
    b.lvx += nx * 8;
    b.lvz += nz * 8;
    b.stun = 0.12;
    p.flash = 1;
    this.fx.burst(this.v.set(p.x + nx * POST_R, 1.0, p.z + nz * POST_R), 12, ["#ff4fa0", "#ffffff", "#7fe0ff"], { speed: 5, up: 3, size: 0.18, life: 0.5 });
    this.pow(p.x + nx * POST_R, 1.3, p.z + nz * POST_R, 1.1);
    this.av[i].hit();
    if (this.hitCool <= 0) {
      this.hitCool = 0.06;
      pong(this.players[i].human ? 0.22 : 0.12);
    }
    this.cam.shake(this.players[i].human ? 0.22 : 0.1);
    if (!this.isHuman(i)) b.think = Math.min(b.think, 0.12 + (1 - this.skillOf(i)) * 0.25);
  }

  /** Into a capsule: its power, a flash, a pop over the head. */
  private take(i: number, c: Cap) {
    const b = this.b[i],
      p = this.players[i];
    if (b.pw === HEAVY && c.kind !== HEAVY) this.balls[i].material = this.ballMats[i];
    b.pw = c.kind;
    b.pwT = PW_T[c.kind];
    if (c.kind === HEAVY) this.balls[i].material = this.heavyMats[i];
    c.st = 0;
    for (const o of this.b) if (o.goal >= 0 && this.caps[o.goal] === c) o.goal = -1;
    this.fx.burst(this.v.set(c.x, 1, c.z), 26, [PW_C[c.kind], "#ffffff", "#ffd23f"], { speed: 6, up: 5, size: 0.22, life: 0.9 });
    this.shock(b.x, b.z, PW_C[c.kind], 3.4);
    this.pop(i, pwShort(c.kind) + "!", PW_C[c.kind], false);
    if (p.human) {
      this.say(pwName(c.kind) + "!", PW_C[c.kind], 1.2);
      sfx.coin();
      ding(0.07, 1318);
      this.cam.shake(0.12);
    } else sfx.coin();
    b.sqv += 6;
    this.av[i].body.jump();
  }

  private endPower(i: number) {
    const b = this.b[i];
    if (b.pw === HEAVY) this.balls[i].material = this.ballMats[i];
    if (b.pw === SHIELD) this.fx.burst(this.v.set(b.x, b.r + 0.5, b.z), 14, ["#9ff4ff", "#ffffff"], { speed: 4, up: 2, size: 0.16, life: 0.6 });
    b.pw = 0;
    b.pwT = 0;
    if (this.isHuman(i) && this.over < 0 && b.fall < 0) sfx.blip(-2);
  }

  /** The shield caught a fall: it shatters and throws you back on. */
  private saved(i: number) {
    const b = this.b[i];
    // (back in over the edge it crossed, 0.35 m, and thrown inward)
    const e = this.edgeAt(b.x, b.z, false, this.en2);
    const ox = this.en2[0],
      oz = this.en2[1];
    if (e < 0.35) ((b.x -= ox * (0.35 - e)), (b.z -= oz * (0.35 - e)));
    b.vx = -ox * 8.5;
    b.vz = -oz * 8.5;
    b.vy = 6;
    b.sqv += 8;
    this.endPower(i);
    this.fx.burst(this.v.set(b.x, b.r + 0.4, b.z), 30, ["#9ff4ff", "#ffffff", "#3ee0ff"], { speed: 8, up: 5, size: 0.22, life: 0.9 });
    this.shock(b.x, b.z, "#3ee0ff", 3.5);
    this.pop(i, T("SAVED!", "得救！"), "#3ee0ff", false);
    if (this.players[i].human) this.say(T("SHIELD SAVED YOU!", "护盾救了你！"), "#3ee0ff", 1.2);
    ding(0.12, 1760);
    this.cam.shake(0.2);
  }

  private pow(x: number, y: number, z: number, s: number) {
    let p = this.pows[0];
    for (const q of this.pows) if (q.t > p.t) p = q;
    p.t = 0;
    p.m.position.set(x, y, z);
    p.m.userData.s = s;
    p.m.visible = true;
  }

  /** The lilies parting or closing: water squirts up all along the seams round the middle pad. */
  private seamSpray() {
    for (let p = 1; p < 7; p++) {
      const pad = this.pads[p];
      const r = PAD_C + 0.2 + this.driftNow * 0.5;
      for (let j = -1; j <= 1; j++) {
        const ax = pad.ux * Math.cos(j * 0.35) - pad.uz * Math.sin(j * 0.35),
          az = pad.ux * Math.sin(j * 0.35) + pad.uz * Math.cos(j * 0.35);
        this.fx.burst(this.v.set(ax * r, WATER_Y + 0.2, az * r), 4, ["#ffffff", "#bfe8ff", "#7fd0ff"], { speed: 1.6, up: 4.5, gravity: 16, size: 0.16, life: 0.7 });
      }
    }
    splashSnd(0.12);
  }

  /** Water thrown up (a fall into the bay, a pad going under), a ripple racing out, the sound (vol 0: none). */
  private splash(x: number, z: number, n: number, s: number, vol = 0) {
    if (n) this.fx.burst(this.v.set(x, WATER_Y + 0.15, z), n, ["#ffffff", "#bfe8ff", "#7fd0ff"], { speed: 2.5 + s * 2, up: 5 + s * 2, gravity: 18, size: 0.2, life: 0.8 });
    this.shock(x, z, "#bfe8ff", 1.6 + s * 1.4, WATER_Y + 0.04);
    if (vol) splashSnd(vol);
  }

  /** A ring of light racing out over the floor. */
  private shock(x: number, z: number, c: string, s: number, y = 0.08) {
    let p = this.shocks[0];
    for (const q of this.shocks) if (q.t > p.t) p = q;
    p.t = 0;
    p.s = s;
    p.m.position.set(x, y, z);
    p.mat.color.set(c);
    p.m.visible = true;
  }

  /** "+1", "−1", "HEAVY!" over a head (a moment, rising). */
  private pop(i: number, s: string, c: string, big: boolean) {
    const b = this.b[i];
    const a = this.av[i];
    const y = b.fall >= 0 ? Math.max(b.y, -2) + 2.4 : b.y + b.r * 2 + 2.2;
    this.pops.push({ s, c, x: b.fall >= 0 ? b.x : a.pos.x, y, z: b.fall >= 0 ? b.z : a.pos.z, t: 0, big });
    if (this.pops.length > 8) this.pops.shift();
  }

  private twinkle(i: number) {
    const b = this.b[i];
    let p = this.sparks[0];
    for (const q of this.sparks) if (q.t > p.t) p = q;
    p.t = 0;
    this.v.set(b.mx, b.my + 0.8, b.mz).applyMatrix4(this.tilt.matrixWorld);
    p.m.position.copy(this.v);
    p.s = 3.2;
    p.m.visible = true;
    ding(this.players[i].human ? 0.16 : 0.1);
  }

  private fallOff(i: number) {
    const b = this.b[i],
      p = this.players[i];
    b.fall = 0;
    b.charge = -1;
    b.dash = 0;
    b.spot = false;
    b.wet = b.mwet = b.air = false;
    b.hopTo = -1;
    // (off the rim's lip, outward: it never sinks through the side)
    this.edgeAt(b.x, b.z, false, this.en2);
    let ox = this.en2[0],
      oz = this.en2[1];
    if (ox === 0 && oz === 0) {
      const sp0 = Math.hypot(b.vx, b.vz) || 1;
      ox = b.vx / sp0;
      oz = b.vz / sp0;
    }
    const vo = b.vx * ox + b.vz * oz;
    const sp = Math.hypot(b.vx, b.vz);
    const credit = b.by >= 0 && b.by !== i && this.t - b.byAt < CREDIT ? b.by : -1;
    // flung off hard: a launch (and from a big ram, off to the stars)
    b.star = credit >= 0 && sp >= STAR_V;
    if (vo < 2.6) ((b.vx += ox * (2.6 - vo)), (b.vz += oz * (2.6 - vo)));
    if (b.star) {
      b.vx *= 1.4;
      b.vz *= 1.4;
      b.vy = 13;
    } else b.vy = Math.max(b.vy, credit >= 0 && sp > 7 ? 3 + sp * 0.4 : 1.5);
    // the snark thrown off it, flailing
    b.mx = b.x;
    b.my = b.y + b.r * 2;
    b.mz = b.z;
    b.mvx = b.vx * (b.star ? 1.05 : 0.7) + ox * 1.2;
    b.mvz = b.vz * (b.star ? 1.05 : 0.7) + oz * 1.2;
    b.mvy = b.star ? 14 : 6.5;
    b.spinA = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 4);
    b.spinB = (Math.random() - 0.5) * 6;
    b.roll.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const a = this.av[i];
    a.out = true;
    a.hit();
    a.body.jump();
    this.aims[i].visible = false;
    if (b.pw) this.endPower(i);
    if (this.over >= 0) return;
    // the score: −1 for the fall, +1 for whoever bumped it (+2 for the leader's fall)
    const top = this.topScore();
    const wasLead = b.score >= top && b.score >= 1;
    b.falls++;
    b.score += FALL_PTS;
    this.pop(i, `${FALL_PTS}`.replace("-", "−"), "#ff6b6b", true);
    if (this.qday) {
      b.out = true;
      b.outAt = this.t;
      this.out.push(i);
    }
    this.fx.burst(this.v.set(b.x, 0.4, b.z), 26, [p.color, "#ffffff", "#ffd23f"], { speed: 7, up: 6, size: 0.22, life: 1 });
    let said = false;
    if (credit >= 0) {
      const cb = this.b[credit],
        cp = this.players[credit];
      const pts = wasLead ? LEAD_PTS : KO_PTS;
      cb.score += pts;
      cb.kos++;
      cb.combo = this.t - cb.comboAt < 4 ? cb.combo + 1 : 1;
      cb.comboAt = this.t;
      this.pop(credit, `+${pts}`, wasLead ? "#ffd23f" : "#8ee35b", true);
      if (this.active(credit) && !this.isHuman(credit)) this.av[credit].cheer(0.9);
      if (cb.combo >= 2) {
        said = true;
        this.say(cb.combo === 2 ? T(`${cp.human ? "YOU: " : short(cp) + ": "}DOUBLE BONK!`, `${short(cp)}：双杀！`) : T(`${cp.human ? "YOU: " : short(cp) + ": "}TRIPLE BONK!`, `${short(cp)}：三连撞！`), cp.color, 1.3);
        sfx.star();
      } else if (b.star) {
        said = true;
        this.say(T("STAR KO!", "飞到天边！"), "#ffd23f", 1.2);
      } else if (cp.human) {
        said = true;
        this.say(wasLead ? T(`LEADER BONKED! +${pts}`, `撞飞领先者！+${pts}`) : T(`BONK! +${pts}`, `撞飞！+${pts}`), cp.color, 1.0);
      } else if (wasLead) {
        said = true;
        this.say(T(`LEADER DOWN! ${short(cp)} +${pts}`, `领先者落台！${short(cp)} +${pts}`), cp.color, 1.1);
      }
    }
    if (!said && this.qday) this.say(p.human ? T("YOU'RE OUT!", "你出局了！") : T(`${short(p)} OUT!`, `${short(p)} 出局！`), p.color, 1.2);
    else if (!said && p.human) this.say(T("RING OUT! −1", "掉下去了！−1"), "#ff6b6b", 1.0);
    if (this.qday) {
      let left = 0;
      for (let k = 0; k < 4; k++) if (this.alive(k)) left++;
      if (left === 2 && !this.said.two) ((this.said.two = true), this.say(T("2 LEFT!", "只剩两个！"), "#ffd23f", 1.2));
    }
    this.cam.shake(p.human ? 0.5 : 0.25);
    this.zoom = Math.max(this.zoom, p.human || (credit >= 0 && this.players[credit].human) ? 1 : 0.5);
    if (p.human) sfx.lose();
    else sfx.whoosh();
    scream(p.human ? 0.09 : 0.05, 0.8 + i * 0.13);
    if (!b.star) whistle(p.human ? 0.16 : 0.08);
  }

  /** Back in soon: where it will land (clear of the others, the bumpers, the edge). */
  private pickSpot(i: number) {
    const b = this.b[i];
    // (off the coin: anywhere well in from every edge; the middle of the ring's ice or of the middle pad at worst)
    const disc = this.L.shape === "disc";
    const R = disc ? Math.max(1.2, this.rSafe - 1.8) : this.extent();
    let best = -Infinity;
    if (!disc) ((b.sx = this.L.shape === "ring" ? (this.L.hole + this.rSafe) / 2 : 0), (b.sz = 0));
    for (let k = 0; k < (disc ? 16 : 26); k++) {
      const a = this.rnd() * Math.PI * 2,
        d = Math.sqrt(0.08 + this.rnd() * 0.92) * R;
      const x = Math.cos(a) * d,
        z = Math.sin(a) * d;
      const e = disc ? 9 : this.edgeAt(x, z, true, this.en2);
      if (e < 1.5) continue;
      let near = 9;
      for (let j = 0; j < 4; j++) if (j !== i && this.b[j].fall < 0 && !this.b[j].out) near = Math.min(near, Math.hypot(x - this.b[j].x, z - this.b[j].z));
      for (const p of this.posts) if (p.st === 1 || p.st === 2) near = Math.min(near, Math.hypot(x - p.x, z - p.z) - 0.5);
      const sc = Math.min(near, 4.5) - (disc ? d * 0.12 : -Math.min(e, 3) * 0.25) + this.rnd() * 0.3;
      if (sc > best) ((best = sc), (b.sx = x), (b.sz = z));
    }
    b.spot = true;
  }

  private respawn(i: number) {
    const b = this.b[i];
    if (!b.spot) this.pickSpot(i);
    b.x = b.sx;
    b.z = b.sz;
    b.vx = b.vz = 0;
    b.y = DROP_H;
    b.vy = 0;
    b.fall = -1;
    b.star = false;
    b.drop = DROP;
    b.spot = false;
    b.charge = -1;
    b.cd = 0.4;
    b.by = -1;
    b.target = -1;
    b.goal = -1;
    b.r = BR;
    const a = this.av[i];
    a.out = false;
    a.root.visible = true;
    this.holders[i].visible = true;
    a.body.root.rotation.set(0, 0, 0);
    a.body.root.position.set(0, 0, 0);
    a.yaw = yawOf(-b.x, -b.z);
    b.fx = Math.sin(a.yaw);
    b.fz = Math.cos(a.yaw);
    if (this.players[i].human) sfx.whoosh();
  }

  /** A ram's hop lands (the lilies): a thump that shoves whoever is close (it counts as their bump). */
  private stomp(i: number) {
    const b = this.b[i];
    this.shock(b.x, b.z, this.players[i].color, 3);
    this.fx.burst(this.v.set(b.x, 0.15, b.z), 12, ["#ffffff", this.players[i].color, "#b6ee7a"], { speed: 4.5, up: 2.5, gravity: 14, size: 0.2, life: 0.55 });
    b.sqv += 10;
    for (let j = 0; j < 4; j++) {
      if (j === i || !this.bumpable(j)) continue;
      const o = this.b[j];
      const dx = o.x - b.x,
        dz = o.z - b.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 2.7) continue;
      const k = (1 - d / 2.7) * (this.players[j].human ? 4.2 : 5);
      o.vx += (dx / d) * k;
      o.vz += (dz / d) * k;
      o.vy = Math.max(o.vy, 1.5);
      o.by = i;
      o.byAt = this.t;
      this.av[j].hit();
    }
    sfx.thud();
    this.cam.shake(this.players[i].human ? 0.22 : 0.1);
  }

  /** Down from the sky: a thump that shoves whoever is close, then a moment as a ghost. */
  private land(i: number) {
    const b = this.b[i];
    b.y = 0;
    b.vy = 0;
    b.safe = SAFE;
    b.sqv += 12;
    this.av[i].body.land(8);
    this.shock(b.x, b.z, this.players[i].color, 4.2);
    this.fx.burst(this.v.set(b.x, 0.2, b.z), 20, ["#ffffff", this.players[i].color, "#ffd23f"], { speed: 6, up: 3, gravity: 14, size: 0.22, life: 0.7 });
    for (let j = 0; j < 4; j++) {
      if (j === i || !this.active(j)) continue;
      const o = this.b[j];
      const dx = o.x - b.x,
        dz = o.z - b.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 2.8) {
        const k = (1 - d / 2.8) * 5;
        o.vx += (dx / d) * k;
        o.vz += (dz / d) * k;
        o.vy = Math.max(o.vy, 2);
      }
    }
    sfx.thud();
    this.cam.shake(this.players[i].human ? 0.3 : 0.14);
  }

  private say(s: string, c: string, d: number) {
    this.news.push({ s, c, t: 0, d });
  }

  // ---- the look ------------------------------------------------------------------------------------

  /** Place and pose everything from the state. */
  private visual(dt: number) {
    const now = this.clock;
    // the coin leans with the tilt
    const ta = this.L.tiltLean * this.tiltK;
    if (ta > 0.0001) this.tilt.quaternion.setFromAxisAngle(this.AX.set(this.tiltZ, 0, -this.tiltX), ta);
    else this.tilt.quaternion.identity();
    this.tilt.updateMatrixWorld();
    for (let i = 0; i < 4; i++) {
      const b = this.b[i],
        a = this.av[i],
        h = this.holders[i],
        m = this.balls[i],
        sh = this.shadows[i];
      const sp = Math.hypot(b.vx, b.vz);
      // the size (a heavy ball swells)
      const rT = b.pw === HEAVY ? BR * 1.22 : BR;
      b.r += (rT - b.r) * Math.min(1, dt * 8);
      const rk = b.r / BR;
      // the squash spring
      b.sqv += (-b.sq * 220 - b.sqv * 14) * dt;
      b.sq += b.sqv * dt;
      const sq = clamp(b.sq * 0.05, -0.12, 0.2) - (b.charge >= 0 ? b.charge * 0.06 : 0);
      // (a ghost just back in: blinking)
      const blink = b.safe > 0 && Math.floor(now * 14) % 2 === 0;
      if (b.fall < 0) {
        h.visible = !blink;
        a.root.visible = !blink;
        h.position.set(b.x, b.y + b.r * (1 - sq), b.z);
        h.scale.set(rk * (1 + sq * 0.6), rk * (1 - sq), rk * (1 + sq * 0.6));
        // it rolls with the move; winding up, it spins in place, digging in
        if (b.charge >= 0) {
          this.v.set(b.aimz, 0, -b.aimx);
          this.q.setFromAxisAngle(this.v, (8 + b.charge * 26) * dt);
          m.quaternion.premultiply(this.q);
          if ((b.fxT -= dt) <= 0) {
            b.fxT = 0.06;
            this.fx.burst(this.v.set(b.x - b.aimx * b.r, 0.1, b.z - b.aimz * b.r), 2, ["#ffffff", "#d8d0ff"], { speed: 2 + b.charge * 3, up: 1.5, gravity: 8, size: 0.16 + b.charge * 0.08, life: 0.4, dir: this.v2.set(-b.aimx * 2.5, 0.5, -b.aimz * 2.5) });
          }
        } else if (sp > 0.01) {
          this.v.set(b.vz / sp, 0, -b.vx / sp);
          this.q.setFromAxisAngle(this.v, (sp * dt) / b.r);
          m.quaternion.premultiply(this.q);
        }
        sh.visible = true;
        sh.position.set(b.x, 0.03, b.z);
        const ss = b.r * 2.1 * Math.max(0.35, 1 - b.y * 0.06);
        sh.scale.set(ss, ss, 1);
        // (under the sun's real shadow, shadows.ts: only a soft contact patch is left of the blob)
        (sh.material as THREE.MeshBasicMaterial).opacity = this.w.scene.userData.sunShadows === true ? 0.45 : 1;
        // the snark on top: facing its push (or its aim, or where it rolls), its legs running the ball round
        if (b.charge >= 0) a.face(yawOf(b.aimx, b.aimz), dt, 14);
        else if (b.thr > 0.2) a.face(yawOf(b.ax, b.az), dt, 9);
        else if (sp > 1.2) a.face(yawOf(b.vx, b.vz), dt, 3);
        a.pos.set(b.x, b.y + b.r * 2 * (1 - sq), b.z);
        a.legs = this.over >= 0 && i === this.order[0] ? 0 : b.charge >= 0 ? 9 : Math.min(8, Math.max(sp, b.thr * 4));
        a.grounded = b.y < 0.05 && b.drop <= 0;
        a.vy = b.vy;
        // a lean into the push (back, winding up), knocked about by the bonks (a spring); teetering, a wobble
        const wob = b.panic > 0 ? Math.sin(now * 22 + i) * 0.22 : 0;
        const tx = b.thr * b.ax * 0.16 - b.vx * 0.006 - (b.charge >= 0 ? b.aimx * b.charge * 0.3 : 0) + wob * b.az,
          tz = b.thr * b.az * 0.16 - b.vz * 0.006 - (b.charge >= 0 ? b.aimz * b.charge * 0.3 : 0) - wob * b.ax;
        b.lvx += ((tx - b.lx) * 90 - b.lvx * 9) * dt;
        b.lvz += ((tz - b.lz) * 90 - b.lvz * 9) * dt;
        b.lx = clamp(b.lx + b.lvx * dt, -0.7, 0.7);
        b.lz = clamp(b.lz + b.lvz * dt, -0.7, 0.7);
        const sy = Math.sin(a.yaw),
          cy = Math.cos(a.yaw);
        a.body.root.rotation.set(b.lx * sy + b.lz * cy, 0, -b.lx * cy + b.lz * sy);
        a.body.root.position.set(0, 0, 0);
        // the power-ups' looks: HALO RAM's flames, a teetering snark's sweat
        if (b.fxT <= 0 || b.charge < 0) {
          if (b.pw === SHOR && (b.fxT -= dt) <= 0) {
            b.fxT = 0.05;
            this.fx.burst(this.v.set(b.x + (this.deco() - 0.5) * b.r, b.y + b.r * 0.6, b.z + (this.deco() - 0.5) * b.r), 2, ["#ff4b2b", "#ffb02e", "#fff36b"], { speed: 1.2, up: 3, gravity: -2, size: 0.2, life: 0.45 });
          } else if (b.panic > 0 && (b.fxT -= dt) <= 0) {
            b.fxT = 0.16;
            this.fx.burst(this.v.set(b.x, b.y + b.r * 2 + 1.5, b.z), 1, ["#9fdcff", "#ffffff"], { speed: 2, up: 3, gravity: 14, size: 0.12, life: 0.5 });
          }
        }
      } else {
        // tumbling down toward the city (or up and away), the snark off on its own
        const water = this.L.water && !b.star;
        const gone = b.star ? b.fall > 0.95 : water ? b.y < WATER_Y - 2.4 : b.y < CITY_Y + 24;
        h.visible = !gone;
        a.root.visible = water ? b.my > WATER_Y - 1.7 : !gone && (b.star || b.my > CITY_Y + 24);
        h.position.set(b.x, b.y + b.r, b.z);
        h.scale.setScalar(rk);
        this.q.setFromAxisAngle(b.roll, dt * 7);
        m.quaternion.premultiply(this.q);
        sh.visible = false;
        a.pos.set(b.mx, b.my, b.mz);
        a.legs = 0;
        a.grounded = false;
        a.vy = b.mvy;
        a.body.root.rotation.set(b.fall * b.spinA, 0, b.fall * b.spinB);
        // (round its middle)
        this.v.set(0, 0.75 * MS, 0).applyQuaternion(a.body.root.quaternion);
        a.body.root.position.set(0, 0.75 * MS, 0).sub(this.v);
      }
      a.sync(dt, now);
      // the wind-up's arrow: longer with the charge, white-hot when full
      const ar = this.aims[i];
      ar.visible = b.charge >= 0 && b.fall < 0;
      if (ar.visible) {
        const c = b.charge;
        ar.position.set(b.x + b.aimx * (b.r + 0.15), 0.05, b.z + b.aimz * (b.r + 0.15));
        ar.rotation.y = yawOf(b.aimx, b.aimz);
        ar.scale.set(0.8 + c * 0.5, 1, 0.7 + c * 2.1);
        const mt = this.aimMats[i];
        if (c >= 1 && Math.floor(now * 16) % 2 === 0) mt.color.copy(WHITE);
        else mt.color.copy(this.seatC[i]).lerp(WHITE, c * 0.35);
        mt.opacity = 0.55 + c * 0.4;
      }
      // ORCHARD SHIELD's bubble
      const bub = this.shields[i];
      bub.visible = b.pw === SHIELD && b.fall < 0 && !(b.pwT < 1.5 && Math.floor(now * 10) % 2 === 0);
      if (bub.visible) {
        bub.position.set(b.x, b.y + b.r + 0.55, b.z);
        bub.scale.setScalar(b.r * 2 + 1.7 + Math.sin(now * 6) * 0.06);
        bub.rotation.y = now * 0.8;
      }
      // where it drops back in: a ring closing on the spot
      const mk = this.marks[i];
      const pend = (b.fall >= 0 && b.spot && !b.out) || b.drop > 0;
      mk.visible = pend && Math.floor(now * 8) % 4 !== 0;
      if (pend) {
        const k = b.drop > 0 ? b.drop / DROP : 1;
        mk.position.set(b.drop > 0 ? b.x : b.sx, 0.06, b.drop > 0 ? b.z : b.sz);
        mk.scale.setScalar(BR * 2.2 + k * 2.2);
        if (b.drop <= 0) {
          sh.visible = true;
          sh.position.set(b.sx, 0.03, b.sz);
          sh.scale.set(0.6, 0.6, 1);
        }
      }
      // HALO RAM's emissive glow (a ball on fire)
      const bm = this.balls[i].material as THREE.MeshToonMaterial;
      if (b.pw === SHOR) bm.emissive.setRGB(0.35 + Math.sin(now * 18) * 0.15, 0.08, 0);
      else bm.emissive.setRGB(b.pw === HEAVY ? 0.07 : 0, b.pw === HEAVY ? 0.08 : 0, b.pw === HEAVY ? 0.13 : 0);
    }
    // the charge pips round each ball: lit as the ram recharges, white as it winds up, all bright when ready
    for (let i = 0; i < 4; i++) {
      const b = this.b[i];
      const on = b.fall < 0 && b.drop <= 0 && !b.out;
      const ready = b.cd <= 0;
      const winding = b.charge >= 0;
      const lit = winding ? Math.floor(b.charge * 12) : ready ? 12 : Math.floor((1 - b.cd / COOLDOWN) * 12);
      const pulse = ready ? 0.75 + Math.sin(now * 8 + i) * 0.25 : 1;
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        const r = b.r + 0.36;
        this.q.setFromAxisAngle(this.UP, -ang);
        this.m4.compose(this.v.set(b.x + Math.cos(ang) * r, 0.05, b.z + Math.sin(ang) * r), this.q, on ? this.sc.set(0.2, 0.07, 0.36) : this.sc.set(0, 0, 0));
        this.pips.setMatrixAt(i * 12 + k, this.m4);
        this.pips.setColorAt(i * 12 + k, k < lit ? (winding ? PIP_CHARGE : this.col.copy(this.seatC[i]).multiplyScalar(pulse).addScalar(ready ? 0.15 : 0)) : PIP_OFF);
      }
    }
    this.pips.instanceMatrix.needsUpdate = true;
    this.pips.instanceColor!.needsUpdate = true;
    // the rim lights: a chase round the edge; red and blinking when the next ring is about to go (the
    // ring: round its hole too; the lilies: round each pad, cyan before a drift, red before it sinks)
    const BULB = this.bulbC;
    const qblink = this.qday && this.over < 0 && Math.sin(now * 5) > 0.6;
    const blink = Math.sin(now * 14) > 0;
    const ph0 = Math.floor(Math.max(0, now) * 10);
    if (this.L.shape !== "pads") {
      const target = this.rSafe - 0.16;
      this.bulbR += (target - this.bulbR) * Math.min(1, dt * 5);
      let warn = false;
      for (const band of this.bands) if (band.st === 1) warn = true;
      const nIn = this.L.shape === "ring" ? 18 : 0;
      for (let k = 0; k < 72; k++) {
        const inner = k >= 72 - nIn;
        const kk = inner ? k - (72 - nIn) : k;
        const ang = (kk / (inner ? nIn : 72 - nIn)) * Math.PI * 2;
        const r = inner ? this.L.hole + 0.16 : this.bulbR;
        this.m4.compose(this.v.set(Math.cos(ang) * r, 0.1, Math.sin(ang) * r), this.q.identity(), this.sc.setScalar(0.3));
        this.bulbs.setMatrixAt(k, this.m4);
        const ph = (kk + ph0) % 4;
        this.bulbs.setColorAt(k, !inner && (warn || qblink) ? (blink === (k % 2 === 0) ? BULB_RED : BULB[0]) : BULB[ph]);
      }
    } else {
      let k = 0;
      for (let pi = 0; pi < 7; pi++) {
        const p = this.pads[pi];
        const nn = pi ? 9 : 18;
        const y = this.padTop(p, pi, now) + 0.1;
        for (let j = 0; j < nn; j++, k++) {
          const ang = (j / nn) * Math.PI * 2 + pi * 0.35;
          const r = p.r - 0.18;
          this.m4.compose(this.v.set(p.x + Math.cos(ang) * r, y, p.z + Math.sin(ang) * r), this.q.identity(), this.sc.setScalar(p.st >= 2 ? 0 : 0.28));
          this.bulbs.setMatrixAt(k, this.m4);
          const ph = (j + ph0) % 4;
          this.bulbs.setColorAt(k, p.st === 1 || (qblink && pi > 0 && p.st === 0) ? (blink === (j % 2 === 0) ? BULB_RED : BULB[0]) : pi > 0 && this.driftSoon ? (blink === (j % 2 === 0) ? BULB_DRIFT : BULB[0]) : BULB[ph]);
        }
      }
    }
    this.bulbs.instanceMatrix.needsUpdate = true;
    this.bulbs.instanceColor!.needsUpdate = true;
    // the shine on the balls (from up-left of the camera, toward it), a big one and a pin-point
    this.CR.set(1, 0, 0).applyQuaternion(this.w.camera.quaternion);
    this.CU.set(0, 1, 0).applyQuaternion(this.w.camera.quaternion);
    this.CB.set(0, 0, 1).applyQuaternion(this.w.camera.quaternion);
    for (let i = 0; i < 4; i++) {
      const b = this.b[i],
        h = this.holders[i];
      const on = h.visible && b.fall < 0;
      for (let k = 0; k < 2; k++) {
        const r = b.r * h.scale.y;
        const ox = k ? -0.42 : -0.3,
          oy = k ? 0.5 : 0.36,
          s = on ? r * (k ? 0.26 : 0.95) : 0;
        this.v.copy(h.position).addScaledVector(this.CR, ox * r).addScaledVector(this.CU, oy * r).addScaledVector(this.CB, r * 0.92);
        this.m4.compose(this.v, this.w.camera.quaternion, this.sc.set(s, s * 0.8, s));
        this.gloss.setMatrixAt(i * 2 + k, this.m4);
      }
      // (a fast ball throws up bits of the floor: sparks on the coin, frost on the ice, spray on the pads)
      const sp = Math.hypot(b.vx, b.vz);
      if (on && b.y < 0.05 && b.drop <= 0 && sp > 5.2 && this.deco() < dt * (sp - 4) * 3) {
        this.v2.set(-b.vx / sp, 0, -b.vz / sp);
        this.fx.burst(this.v.set(b.x - (b.vx / sp) * b.r * 0.7, 0.08, b.z - (b.vz / sp) * b.r * 0.7), 2, this.L.trail, { speed: 1.5, up: 1.6, gravity: 9, size: 0.13, life: 0.4, dir: this.v2.multiplyScalar(sp * 0.25) });
      }
    }
    this.gloss.instanceMatrix.needsUpdate = true;
    // glints coming and going on the ice (only where there is ice)
    if (this.glints) {
      for (let k = 0; k < 14; k++) {
        this.glintT[k] -= dt;
        if (this.glintT[k] <= 0) {
          this.glintT[k] = 0.6 + this.deco() * 1.6;
          const a = this.deco() * Math.PI * 2,
            r = this.L.hole + 0.4 + this.deco() * (this.rSafe - this.L.hole - 0.6);
          this.glintX[k] = Math.cos(a) * r;
          this.glintZ[k] = Math.sin(a) * r;
        }
        const u = this.glintT[k];
        const s = u < 0.5 && this.solid(this.glintX[k], this.glintZ[k]) ? Math.sin((u / 0.5) * Math.PI) * 0.55 : 0;
        this.q.copy(this.w.camera.quaternion);
        this.m4.compose(this.v.set(this.glintX[k], 0.12, this.glintZ[k]), this.q, this.sc.set(s, s, s));
        this.glints.setMatrixAt(k, this.m4);
      }
      this.glints.instanceMatrix.needsUpdate = true;
    }
    // the rams' after-images (HALO RAM's in flame)
    for (let i = 0; i < 4; i++) {
      const b = this.b[i];
      const on = b.dash > 0 && b.fall < 0;
      const gm = this.ghostMats[i];
      gm.opacity = 0.55 * (b.dash / (DASH_T * 1.4));
      if (on) gm.color.copy(b.pw === SHOR ? FLAME : this.seatC[i]);
      for (let k = 0; k < 3; k++) {
        const gh = this.ghosts[i][k];
        gh.visible = on;
        if (on) (gh.position.set(b.x - b.vx * 0.065 * (k + 1), b.r + b.y, b.z - b.vz * 0.065 * (k + 1)), gh.scale.setScalar(b.r * 2 * (1 - k * 0.12)));
      }
    }
    // the bonks' bursts, the twinkles, the shock rings
    for (const p of this.pows) {
      if (!p.m.visible) continue;
      p.t += dt;
      const k = p.t / 0.32;
      if (k >= 1) {
        p.m.visible = false;
        continue;
      }
      p.m.quaternion.copy(this.w.camera.quaternion);
      p.m.rotateZ(p.t * 3);
      p.m.scale.setScalar(p.m.userData.s * (0.4 + Math.min(1, k * 3) * 0.6) * (1 - k * k * 0.3));
    }
    for (const p of this.sparks) {
      if (!p.m.visible) continue;
      p.t += dt;
      const k = p.t / 0.6;
      if (k >= 1) {
        p.m.visible = false;
        continue;
      }
      p.m.quaternion.copy(this.w.camera.quaternion);
      p.m.rotateZ(p.t * 4);
      p.m.scale.setScalar(p.s * Math.sin(k * Math.PI) * (1 + k * 0.3));
    }
    for (const p of this.shocks) {
      if (!p.m.visible) continue;
      p.t += dt;
      const k = p.t / 0.45;
      if (k >= 1) {
        p.m.visible = false;
        continue;
      }
      p.m.scale.setScalar(1 + p.s * 2 * Math.sqrt(k));
      p.mat.opacity = 0.9 * (1 - k);
    }
    // the bumpers: rings first (pulsing), then up with a bounce, flashing when hit
    for (const p of this.posts) {
      p.g.visible = p.st >= 2;
      p.ring.visible = p.st === 1 || (p.st === 2 && p.t < 0.3);
      p.hatch.visible = p.st === 1;
      if (p.ring.visible) {
        const k = p.st === 1 ? clamp(p.t / POST_WARN, 0, 1) : 1;
        p.ring.position.set(p.x, 0.05, p.z);
        p.ring.scale.setScalar((POST_R * 2 + 0.7) * (1.25 - k * 0.15 + Math.sin(now * 14) * 0.05));
        p.hatch.position.set(p.x, 0.04, p.z);
        p.hatch.scale.setScalar((POST_R * 2 + 0.3) * (0.4 + ease(k) * 0.6));
        if (p.st === 1 && Math.floor(now * (5 + k * 9)) % 3 === 0) p.ring.visible = false;
        // (a rumble of bits as it comes)
        if (p.st === 1 && this.deco() < dt * 14) this.fx.burst(this.v.set(p.x + (this.deco() - 0.5), 0.1, p.z + (this.deco() - 0.5)), 1, ["#ff4fa0", "#ffffff"], { speed: 1, up: 2 + k * 3, gravity: 10, size: 0.14, life: 0.4 });
      }
      if (!p.g.visible) continue;
      let y = 0;
      if (p.st === 2) y = p.t < 0.35 ? -1.8 * (1 - ease(p.t / 0.35)) + Math.sin((p.t / 0.35) * Math.PI) * 0.3 : 0;
      else y = -1.8 * ease(clamp(p.t / 0.7, 0, 1));
      p.g.position.set(p.x, y, p.z);
      const f = p.flash;
      p.cap.scale.set(POST_R * 2 + 0.26 + f * 0.35, 0.34 + f * 0.12, POST_R * 2 + 0.26 + f * 0.35);
      (p.band.material as THREE.MeshBasicMaterial).color.setRGB(0.5 + f * 0.5 + Math.sin(now * 6) * 0.1, 0.88 + f * 0.12, 1);
      p.cap.rotation.y = now * 1.4;
    }
    // the capsules: falling to their ring, then bobbing and spinning (blinking before they go)
    for (const c of this.caps) {
      const on = c.st !== 0;
      c.ring.visible = on;
      c.shadow.visible = on;
      c.g.visible = on && !(c.st === 2 && c.t > POW_LIFE - 2 && Math.floor(now * 10) % 2 === 0);
      if (!on) continue;
      const fallK = c.st === 1 ? clamp(c.t / POW_FALL, 0, 1) : 1;
      const y = c.st === 1 ? 0.95 + 12 * (1 - fallK * fallK) : 0.95 + Math.sin(now * 3 + c.x) * 0.15;
      c.g.position.set(c.x, y, c.z);
      c.g.rotation.set(0.35, now * 2.2, 0.2);
      const s = c.st === 2 && c.t < 0.25 ? 1 + Math.sin((c.t / 0.25) * Math.PI) * 0.3 : 1;
      c.g.scale.setScalar(s);
      c.ring.position.set(c.x, 0.05, c.z);
      c.ring.scale.setScalar(c.st === 1 ? 1.4 + (1 - fallK) * 1.6 : 1.5 + Math.sin(now * 5) * 0.08);
      c.shadow.position.set(c.x, 0.04, c.z);
      const ss = c.st === 1 ? 0.4 + fallK * 0.7 : 1.1;
      c.shadow.scale.set(ss, ss, 1);
    }
    // the tilt's (the gust's) arrows: rows of chevrons marching downhill (downwind; never over the
    // ring's hole); the drift's: one on each seam round the middle pad, marching out
    const ak = this.arrowsK;
    const L = this.L;
    this.chevrons.visible = this.chevInk.visible = ak > 0.02;
    if (this.chevrons.visible && L.shape === "pads") {
      const scroll = (now * 1.6) % 1.4;
      for (let k = 0; k < 9; k++) {
        const p = this.pads[1 + (k % 6)];
        const r = PAD_C - 0.7 + scroll + this.driftNow * 0.5;
        this.q.setFromAxisAngle(this.UP, yawOf(p.ux, p.uz));
        this.v.set(p.ux * r, 0.07, p.uz * r);
        this.m4.compose(this.v, this.q, k < 6 ? this.sc.setScalar(1.4) : this.sc.setScalar(0));
        this.chevrons.setMatrixAt(k, this.m4);
        this.v.y = 0.06;
        this.m4.compose(this.v, this.q, k < 6 ? this.sc.setScalar(1.75) : this.sc.setScalar(0));
        this.chevInk.setMatrixAt(k, this.m4);
      }
      this.chevrons.instanceMatrix.needsUpdate = true;
      this.chevInk.instanceMatrix.needsUpdate = true;
      const op = ak * (Math.sin(now * 12) > -0.3 ? 0.95 : 0.4);
      this.chevMat.opacity = op;
      this.chevInkMat.opacity = op * 0.85;
    } else if (this.chevrons.visible) {
      const dx = this.tiltX,
        dz = this.tiltZ;
      const scroll = (now * 1.8) % 2.8;
      const yaw = yawOf(dx, dz);
      this.q.setFromAxisAngle(this.UP, yaw);
      let n = 0;
      for (let u = -1; u <= 1; u++)
        for (let w = -1; w <= 1; w++) {
          const along = u * 2.8 + scroll - 1.4,
            side = w * 2.9;
          // (the middle column a row ahead: a wedge)
          const a2 = along + (w === 0 ? 0.6 : 0);
          this.v.set(dx * a2 - dz * side, 0.07, dz * a2 + dx * side);
          const hide = L.hole > 0 && Math.hypot(this.v.x, this.v.z) < L.hole + 0.7;
          this.m4.compose(this.v, this.q, this.sc.setScalar(hide ? 0 : 1.55));
          this.chevrons.setMatrixAt(n, this.m4);
          this.v.y = 0.06;
          this.m4.compose(this.v, this.q, this.sc.setScalar(hide ? 0 : 1.9));
          this.chevInk.setMatrixAt(n++, this.m4);
        }
      this.chevrons.instanceMatrix.needsUpdate = true;
      this.chevInk.instanceMatrix.needsUpdate = true;
      const op = ak * (this.tiltK > 0.05 ? 0.9 : Math.sin(now * 12) > -0.3 ? 0.95 : 0.35);
      this.chevMat.opacity = op;
      this.chevInkMat.opacity = op * 0.85;
    }
    // the decor
    for (const q of this.qbs) {
      q.rotation.y = now * 0.8 + q.userData.a;
      q.position.y = q.userData.y + Math.sin(now * 1.6 + q.userData.a * 3) * 0.35;
    }
    this.glowRing.scale.setScalar(L.shape === "pads" ? 3.4 + Math.sin(now * 2.5) * 0.08 : L.shape === "ring" ? (L.hole + 0.12) * 2.5 + Math.sin(now * 2.5) * 0.1 : (3.1 + Math.sin(now * 2.5) * 0.06) * 2);
    // the lilies afloat (bobbing a hair, shaking before they sink, going under), the water's rings round them
    if (this.padMesh && this.ripples) {
      for (let k = 0; k < 7; k++) {
        const p = this.pads[k];
        const top = this.padTop(p, k, now);
        if (p.st >= 2) this.q.setFromAxisAngle(this.v2.set(p.uz, 0, -p.ux), Math.min(0.5, p.sink * 0.35));
        else this.q.identity();
        this.m4.compose(this.v.set(p.x, top - PAD_TH / 2, p.z), this.q, p.st === 3 ? this.sc.set(0, 0, 0) : this.sc.set(p.r, 1, p.r));
        this.padMesh.setMatrixAt(k, this.m4);
        const afloat = p.st < 2;
        this.q.setFromAxisAngle(this.v2.set(1, 0, 0), -Math.PI / 2);
        for (let j = 0; j < 2; j++) {
          // (a ring leaves the rim, widens and fades, then the next)
          const f = (now * 0.3 + k * 0.37 + j * 0.5) % 1;
          const rs = afloat ? p.r + 0.12 + f * 1.25 : 0;
          this.m4.compose(this.v.set(p.x, WATER_Y + 0.02, p.z), this.q, this.sc.set(rs, rs, rs));
          this.ripples.setMatrixAt(k * 2 + j, this.m4);
          this.ripples.setColorAt(k * 2 + j, this.col.copy(RING_C).multiplyScalar((1 - f) * (1 - f) * 0.55));
        }
        // (its shade on the water, on the side away from the moon)
        const ss = afloat ? (p.r + 0.55) * 2 : 0;
        this.m4.compose(this.v.set(p.x + 0.4, WATER_Y + 0.018, p.z - 0.2), this.q, this.sc.set(ss, ss, 1));
        this.padShade!.setMatrixAt(k, this.m4);
      }
      this.padMesh.instanceMatrix.needsUpdate = true;
      this.ripples.instanceMatrix.needsUpdate = true;
      this.ripples.instanceColor!.needsUpdate = true;
      this.padShade!.instanceMatrix.needsUpdate = true;
    }
    this.scenery.update(now, dt, this.tiltX, this.tiltZ, Math.max(this.tiltK, this.arrowsK * 0.3));
  }

  /** A pad's top now: a hair under the middle one, shaking before it sinks, then going under. */
  private padTop(p: Pad, k: number, now: number) {
    return p.h - (p.st >= 2 ? p.sink * p.sink * 1.3 : 0) + (p.st === 1 ? Math.sin(now * 50 + k * 1.7) * 0.03 : 0);
  }

  /** The play camera: high, three-quarter, framing the balls still on (closer as the arena shrinks), a little toward you. */
  private playCam(eye: THREE.Vector3, at: THREE.Vector3) {
    let cx = 0,
      cz = 0,
      n = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.b[i];
      if (b.out || (b.fall >= 0 && !b.spot)) continue;
      const x = b.fall >= 0 ? b.sx : b.x,
        z = b.fall >= 0 ? b.sz : b.z;
      const w = this.players[i].human ? 2 : 1;
      cx += x * w;
      cz += z * w;
      n += w;
    }
    if (n) ((cx /= n), (cz /= n));
    at.set(cx * 0.25, 0.9, cz * 0.25);
    const R = this.extent();
    let F = 0;
    for (const b of this.b) if (b.fall < 0 && !b.out) F = Math.max(F, Math.hypot(b.x - at.x, b.z - at.z) + 2.6);
    F = clamp(F, R * 0.85 + 1.2, R + 1.6);
    const D = (F * 2.1 + 2.5) * (1 - ease(Math.min(1, this.zoom)) * 0.07);
    const PITCH = this.L.pitch;
    eye.set(at.x, at.y + D * Math.sin(PITCH), at.z + D * Math.cos(PITCH));
  }

  private cardCam(k: number) {
    this.cam.orbit(this.v.set(0, -0.5, 0), 0.5 + k * 0.28, 23, 7.5);
  }

  idle(dt: number, phase: "card" | "count", k: number) {
    dt = Math.max(0, dt);
    this.clock += dt;
    if (phase === "card") this.cardCam(k);
    else {
      // down from the fly-over onto the game's own camera
      if (!this.countFrom) this.countFrom = { eye: this.cam.eye.clone(), at: this.cam.at.clone() };
      this.playCam(this.eye, this.at);
      const e = ease(k);
      this.cam.eye.lerpVectors(this.countFrom.eye, this.eye, e);
      this.cam.at.lerpVectors(this.countFrom.at, this.at, e);
    }
    this.cam.apply(dt);
    this.visual(dt);
    this.fx.update(dt);
  }

  view() {
    return this.w;
  }

  /** A spot on the coin (its own frame) on the HUD. */
  private screen(x: number, y: number, z: number) {
    return toScreen(this.v.set(x, y, z).applyMatrix4(this.tilt.matrixWorld), this.w.camera);
  }

  draw(g: CanvasRenderingContext2D) {
    const cam = this.w.camera;
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,70,70,${(this.flash * 0.45).toFixed(3)})`;
      g.fillRect(0, 0, 960, 540);
    }
    const top = this.topScore();
    this.leads.length = 0;
    if (top >= 1) for (let i = 0; i < 4; i++) if (this.b[i].score === top) this.leads.push(i);
    let ys = 0,
      ny = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.b[i];
      if (b.fall >= 0 || b.out) continue;
      const ap = this.av[i].pos;
      this.v.set(ap.x, ap.y + 2.05 * MS, ap.z).applyMatrix4(this.tilt.matrixWorld);
      const s = toScreen(this.v, cam);
      if (!s.on) continue;
      // (the far side: a tag that would sit under the clock drops below it)
      if (Math.abs(s.x - 480) < 92 && s.y < 104) s.y = 104;
      g.save();
      g.globalAlpha = b.safe > 0 ? 0.6 : 1;
      tag(g, this.players[i], s.x, s.y - 4);
      g.restore();
      if (this.leads.includes(i)) crown(g, s.x, s.y - 18, 22, Math.sin(this.clock * 5 + i) * 1.5);
      // (teetering: a "!" beside the tag)
      if (b.panic > 0 && Math.floor(this.clock * 6) % 2 === 0) {
        g.beginPath();
        g.arc(s.x + 30, s.y - 6, 10, 0, Math.PI * 2);
        g.fillStyle = "#ffd23f";
        g.fill();
        g.lineWidth = 2.5;
        g.strokeStyle = "#1a1033";
        g.stroke();
        text(g, "!", s.x + 30, s.y - 5, 15, "#1a1033", "center", 900);
      }
      // (a power-up: its name under the tag, its colour)
      if (b.pw) {
        const label = pwShort(b.pw);
        const pw = b.pw;
        // (a small screen: the whole chip grows from its top, so its letters stay inside it)
        grow(g, s.x, s.y + 17, 10, () => {
          g.font = `900 10px Geist, Roboto, ui-sans-serif, system-ui, sans-serif`;
          const w = g.measureText(label).width + 12;
          rr(g, s.x - w / 2, s.y + 17, w, 15, 7.5);
          g.fillStyle = PW_C[pw];
          g.fill();
          g.lineWidth = 2;
          g.strokeStyle = "#1a1033";
          g.stroke();
          text(g, label, s.x, s.y + 25, 10, "#1a1033", "center", 900);
        });
      }
      ys += s.y;
      ny++;
    }
    // (the announcer keeps off the fight: high when it is low on the screen, low when it is high)
    // (a touch screen: the clock's label is grown under it, so the top line sits lower)
    const by = ny && ys / ny < 230 ? 420 : HUD.min ? 128 : 112;
    this.bannerY += (by - this.bannerY) * 0.2;
    for (let i = 0; i < 4; i++) {
      const b = this.b[i];
      this.outs[i] = b.out;
      this.vals[i] = b.score < 0 ? `−${-b.score}` : `${b.score}`;
      this.subs[i] = b.out ? "" : b.fall >= 0 || b.drop > 0 ? T("BACK IN…", "马上回来…") : b.pw ? `${pwShort(b.pw)} ${Math.ceil(b.pwT)}` : b.kos ? T(`${b.kos} KO`, `撞飞 ${b.kos}`) : "";
    }
    corners(g, this.players, this.vals, { out: this.outs, lead: this.leads, sub: this.subs });
    // the clock: to NU7, then to the end
    const qd = this.t >= BRAWL;
    clock(g, qd ? LIMIT - this.t : BRAWL - this.t);
    const lbl = qd ? T("NU7!", "NU7！") : T("TO NU7", "距 NU7");
    // (a small screen: the label grows down from under the clock, so its letters read)
    grow(g, 480, 62, 11, () => {
      g.font = `900 11px Geist, Roboto, ui-sans-serif, system-ui, sans-serif`;
      const lw = g.measureText(lbl).width + 16;
      rr(g, 480 - lw / 2, 61, lw, 17, 8.5);
      g.fillStyle = qd ? "#ff3d5a" : "rgba(12,9,28,0.72)";
      g.fill();
      text(g, lbl, 480, 70, 11, "#fff", "center", 900);
    });
    // the pops: "+1", "−1", "HEAVY!"
    for (const p of this.pops) {
      const s = this.screen(p.x, p.y + p.t * 1.2, p.z);
      if (!s.on) continue;
      const k = p.t / 1.3;
      g.save();
      g.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      const sz = (p.big ? 30 : 17) * (k < 0.12 ? 0.6 + (k / 0.12) * 0.5 : 1.1 - Math.min(0.1, k * 0.2));
      numeral(g, p.s, s.x, s.y, sz, p.c, "center");
      g.restore();
    }
    // the announcer
    const n = this.news[0];
    if (n) banner(g, n.s, n.t / n.d, n.c, this.bannerY, n.s.length > 14 ? 44 : 56);
    // you fell: back in a moment
    const hb = this.human >= 0 ? this.b[this.human] : null;
    if (hb && !hb.out && hb.fall >= 0 && this.over < 0) {
      const left = Math.max(0, RESPAWN + DROP - hb.fall);
      const y = offThumbs(480, 472, 220, 40);
      rr(g, 480 - 110, y - 20, 220, 40, 20);
      g.fillStyle = "rgba(12,9,28,0.78)";
      g.fill();
      text(g, T(`BACK IN ${left.toFixed(1)}`, `${left.toFixed(1)} 秒后回来`), 480, y + 1, 20, "#fff", "center", 900);
    }
    // (the opening hint; not while you are falling: the "back in" line has that spot)
    if (this.human >= 0 && this.t < 4.5 && this.over < 0 && !(hb && hb.fall >= 0)) {
      g.globalAlpha = clamp(4.5 - this.t, 0, 1);
      // (a touch screen: the arrows are a stick there, and the button says what it does)
      const ram = actWord("ram");
      const hint = touchy() ? T(`Stick rolls · hold ${ram} to wind up, let go to launch!`, `摇杆滚动 · 按住「${ram}」蓄力，松开冲撞！`) : T("Arrows roll · hold A to wind up a ram, let go to launch!", "方向键滚动 · 按住 A 蓄力，松开冲撞！");
      // (the strip is as wide as its line; on a touch screen it stays between the thumbs, or goes over the pad)
      g.font = `800 15px Geist, Roboto, ui-sans-serif, system-ui, sans-serif`;
      const hw = Math.min(900, g.measureText(hint).width + 44);
      const hy = offThumbs(480, 487, hw, 34);
      rr(g, 480 - hw / 2, hy - 17, hw, 34, 17);
      g.fillStyle = "rgba(12,9,28,0.72)";
      g.fill();
      text(g, hint, 480, hy + 1, 15, "#fff", "center", 800);
      g.globalAlpha = 1;
    }
  }

  result() {
    return this.done;
  }

  /** You are out for good (NU7) and the rivals play on: the host may fast-forward. */
  humanOut() {
    return this.human >= 0 && this.b[this.human].out && this.over < 0;
  }

  dispose() {
    this.rumble.stop();
    for (const a of this.av) a.dispose();
    disposeScene(this.w.scene);
    // (what may not have been in the scene at the end: the spare skins, the capsules' faces, the other sky)
    for (const m of this.spare) m.dispose();
    this.qSky.dispose();
    this.daySky.dispose();
  }
}

export const BUMPER: MiniDef = {
  key: "bumper",
  title: "BUMPER SNARKS",
  titleZh: "碰碰球",
  tag: "Bonk rivals off the arena, then survive NU7",
  tagZh: "把对手撞下场地，再撑过 NU7",
  help: "Hold A to wind up a ram, let go to launch. Bonk a rival off: +1 (the crowned leader: +2). Fall: −1, then you drop back in. At 36 s, NU7: no respawns, the arena shrinks, last one on +1.",
  helpZh: "按住 A 蓄力，松开冲撞。把对手撞下台 +1（撞飞头顶皇冠的领先者 +2）；掉下去 −1，随后重新落回。36 秒起 NU7：不再复活，场地缩小，坚持到最后 +1。",
  pad: ["up", "down", "left", "right", "a"],
  tap: false,
  color: "#3ec6ff",
  song: "bouncy",
  ambience: "city-day",
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `bumper-${l.key}`, ...(l.song ? { song: l.song } : {}), ambience: l.ambience })),
  make: (players, rnd, variant) => new Bumper(players, rnd, LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]),
};
export default BUMPER;
