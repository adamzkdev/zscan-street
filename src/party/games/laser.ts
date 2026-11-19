/**
 * LASER SWEEP: a round arena floating high over the night city, a proving core in its middle and a
 * laser arm sweeping round from the core. The PINK beam runs low, at the shins: jump it (A). The
 * CYAN beam runs high, at the head: stay on the ground and it passes over (a jumping snark gets
 * hit). Run round the disc with the arrows. A glow on the floor leads every beam; the beams speed
 * up, turn back (a flash and a klaxon first), change height (a blink and a sweep first), and from
 * 24 s a second arm sweeps the other way: where the two cross, a pink and a cyan close together
 * can't both be dodged, so move. Two hits and you're flung off the disc. The last one standing
 * wins; at 60 s the survivors rank by hits left.
 *
 * B shoves: a wind-up you can see (the shover leans back, its fists glow, an arrow in its colour
 * lights the floor), a short lunge, and whoever it meets slides off a step, pops up a little and
 * can't jump for a moment: shoved just before a pink (or caught just leaving the ground for it), it
 * can't clear it; popped up under a cyan, it gets its head in it. A hop or a step aside dodges a shove (A always jumps, even out of your own
 * wind-up); two shoves that meet CLASH. One just shoved (or blinking from a hit) can't be shoved again
 * for a moment, and may shove back once up. The AIs shove when a beam is about to reach a rival, the
 * good ones well timed and never into their own pink; they see a wind-up coming and hop (unless a
 * cyan is coming), step aside or shove back.
 *
 * Three arenas (laser-levels/: the data in levels.ts, the decks and worlds in scenery.ts): NEON CORE
 * (the classic, over the night city), ORBIT RING (a ring deck in space: low gravity, so jumps float and
 * a cyan just after a pink catches you in the air; shoves slide further) and PROOF FACTORY (a turntable:
 * its outer ring carries you round and turns back on a horn, its arrows blinking amber first). Same
 * rules everywhere; `make()` without a level draws one with the seed.
 */
import * as THREE from "three";
import { FONT, H, HUD, W, between, clamp, ease, fpx, grow, lerp, rr, sfx, shout, sound, text, type Input, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { T } from "../../i18n/lang";
import { music } from "../music";
import { actIcon, actWord, actsOf } from "../acts";
import { touchy } from "../hud";
import { Avatar, CamRig, Fx3, GEO, banner, block, canvasTex, clock, cornerSpot, corners, disposeScene, glow, outline, short, tag, toScreen, toon, world, yawOf } from "../k3";
import { LEVELS, R, type LaserLevel } from "./laser-levels/levels";
import { buildArena, type Arena } from "./laser-levels/scenery";

const TAU = Math.PI * 2;
const LIMIT = 60;
/** (The disc's radius R comes with the levels; nobody stands closer to the core than the level's `rin`.) */
const SCALE = 1.2;
const LIVES = 2;
const INVULN = 1.5;
const RUN = 4.8;
/** The two beams' heights: 0 low (pink, jump it), 1 high (cyan, stay down). */
type Kind = 0 | 1;
const BEAM_Y = [0.46, 2.32];
/** Feet above CLEAR_LOW clear the low beam; feet above CLEAR_HIGH put the head in the high one. */
const CLEAR_LOW = 0.55;
const CLEAR_HIGH = 0.18;
/** The beam's half thickness and a body's radius (the hit). */
const BEAM_W = 0.2;
const BODY_R = 0.32;
/** (The ideal jump, this long before the beam's middle reaches you, is the level's `lead`.) */
/**
 * The shove (B): the wind-up (telegraphed), the lunge (speed, time), the wait before the next; the
 * knock it gives (a slide, the moment it can't act, the pop up), the guard after it (no shove twice in
 * a row), the stumble after.
 */
const WIND = 0.34;
const LUNGE_V = 8.5;
const LUNGE_T = 0.15;
const SHOVE_CD = 1.5;
const KNOCK = 7;
const SHOVE_STUN = 0.5;
const POP = 4.2;
const GUARD_T = 1.1;
const REC_T = 0.2;
/** Centre to centre, the lunge lands; its reach (the floor arrow's length); how far a hit slides one. */
const CONTACT = 1.05;
const REACH = LUNGE_V * LUNGE_T + CONTACT;
/** The beam drawn from…to (metres from the axis); it fades out past the rim. */
const X0 = 0.8;
const X1 = R + 3.2;
const HEX = ["#ff2d6f", "#2ee6ff"] as const;
const COL = [new THREE.Color(HEX[0]), new THREE.Color(HEX[1])];
const WHITE = new THREE.Color("#ffffff");
const SPARK = [
  [HEX[0], "#ffffff", "#ffe36b"],
  [HEX[1], "#ffffff", "#c8fbff"],
] as const;
const REV_SPARK = ["#ffffff", "#ffe36b", "#fff3b0"] as const;
const DUST = ["#ffffff", "#e6e0ff", "#c8c0e8"] as const;
const PLAY_EYE = new THREE.Vector3(0, 13.3, 10.8);
const PLAY_AT = new THREE.Vector3(0, 0.2, 0.55);
/** Where the beam starts (just past you), the four start spots (you in front). */
const START_ANG = Math.PI * 0.62 + 0.3;
const SPOT = [0.62, 1.12, 1.62, 0.12].map((k) => k * Math.PI);

const NOVALS = ["", "", "", ""];
const wrapPi = (a: number) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
const mod = (a: number) => ((a % TAU) + TAU) % TAU;

// ---- the sounds of the beams ----------------------------------------------------------------------

function beep(freq: number, dur: number, type: OscillatorType = "square", vol = 0.3, slide = 0, delay = 0) {
  const s = sound();
  if (!s) return;
  const t = s.ac.currentTime + delay;
  const o = s.ac.createOscillator();
  const g = s.ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(s.bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}
const zz = {
  /** The beam is going up (high, cyan) / down (low, pink). */
  rise: () => (beep(260, 0.55, "sawtooth", 0.14, 4.5), beep(520, 0.55, "square", 0.07, 4.5, 0.04)),
  fall: () => (beep(1150, 0.55, "sawtooth", 0.14, 0.22), beep(2300, 0.55, "square", 0.06, 0.22, 0.04)),
  klaxon: () => [0, 0.15, 0.3, 0.45].forEach((d, i) => beep(i % 2 ? 620 : 930, 0.12, "square", 0.2, 0, d)),
  ignite: () => (beep(70, 0.7, "sawtooth", 0.25, 7), beep(140, 0.5, "square", 0.08, 5, 0.1)),
  zap: () => (beep(1500, 0.28, "sawtooth", 0.22, 0.12), beep(90, 0.3, "square", 0.25, 0.5)),
  boing: () => beep(330, 0.13, "square", 0.13, 2.2),
  nice: () => (beep(1318, 0.05, "square", 0.12), beep(1976, 0.09, "square", 0.12, 0, 0.05)),
};

/** The turntable's horn: two low blasts (it is about to turn the other way). */
function horn() {
  for (const d of [0, 0.32]) (beep(155, 0.26, "sawtooth", 0.2, 0.96, d), beep(233, 0.26, "square", 0.08, 0.96, d));
}
/** How long before a switch of the turntable it is told. */
const BAND_WARN = 1.6;

// ---- the pieces -----------------------------------------------------------------------------------

type Ev = { at: number; type: "kind" | "rev" | "spawn" | "fast"; arm: number; warned: boolean };
/** How long before it each event is told (the telegraph). */
const WARN = { kind: 1.0, rev: 0.9, spawn: 1.5, fast: 0 };

interface Arm {
  /** Lit and in play (B joins later: a harmless ghost first, from ghostAt). */
  live: boolean;
  ghostAt: number;
  bornAt: number;
  ang: number;
  prev: number;
  /** Where it turns (±1), the signed factor it turns with now (eases through a reversal), its speed against the base. */
  dir: number;
  cur: number;
  mul: number;
  mulT: number;
  /** Its spin-up 0…1 once it shows. */
  spin: number;
  kind: Kind;
  /** A change of height at chAt (−1: none), from…to. */
  chAt: number;
  chFrom: Kind;
  chTo: Kind;
  /** A reversal at revAt (−1: none). */
  revAt: number;
  y: number;
  pow: number;
  spark: number;
  col: THREE.Color;
  g: THREE.Group;
  beam: THREE.Group;
  /** inner, glow, haze, flat sheet, standing sheet, lens, tip, ladder. */
  m: THREE.MeshBasicMaterial[];
  /** A low beam's one hot line; a high beam's ladder (two rails and their rungs): told apart by shape, not by colour alone. */
  core: THREE.Mesh;
  ladder: THREE.InstancedMesh;
  tip: THREE.Mesh;
  light: THREE.PointLight;
}

interface P {
  av: Avatar;
  lives: number;
  out: boolean;
  outT: number;
  lastHit: number;
  dodges: number;
  inv: number;
  stun: number;
  buf: number;
  kx: number;
  kz: number;
  spinYaw: number;
  tumble: number;
  tumbleV: number;
  /** Per arm: in its reach last frame (a pass ends → a dodge). */
  touching: boolean[];
  /** The shove: the wait before the next, the wind-up, the lunge, the stumble after, its aim; the human's B held a moment. */
  cd: number;
  wind: number;
  lunge: number;
  rec: number;
  sx: number;
  sz: number;
  bbuf: number;
  /** An AI's wish to shove this frame (a seat, -1: none) and its aim. */
  want: number;
  wx: number;
  wz: number;
  /** Shoved: the flail left, safe from another shove a moment; by whom, how long ago. */
  shk: number;
  guard: number;
  by: number;
  byT: number;
  lean: number;
  /** The telegraph: the arrow on the floor (its fill, its ink), the glow at the fists, the after-glow of a lunge; the HUD's B. */
  arrow: THREE.Group;
  arrowM: THREE.MeshBasicMaterial;
  inkM: THREE.MeshBasicMaterial;
  fist: THREE.Mesh;
  fistM: THREE.MeshBasicMaterial;
  tint: THREE.Color;
  glowK: number;
  ready: number;
  /** The AI's shove: when it looks next, how keen it is; the rival winding up at it, the wait and how it reacts (0 not, 1 a hop, 2 a step aside, 3 a shove back), the step's spot. */
  sCheck: number;
  aggro: number;
  threat: number;
  dodgeT: number;
  dodge: number;
  evade: number;
  ex: number;
  ez: number;
  /** Closing in on a rival a pink is about to reach (-1: none), until when. */
  hunt: number;
  huntT: number;
  huntDir: number;
  /** How it moved last frame (an AI leads its shove with it). */
  vx: number;
  vz: number;
  // the AI's
  tx: number;
  tz: number;
  think: number;
  check: number;
  plan: number[];
  planKind: number[];
  planned: boolean[];
  sees: boolean[];
  lastTau: number[];
}

const VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vP = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
/** The floor's light: each beam's line under it and the wedge of glow that leads it (none inside the rail `rin`). */
const frag = (rin: number) => /* glsl */ `
uniform vec4 uA[2];
uniform vec3 uC[2];
uniform float uW[2];
uniform float uK[2];
uniform float uT;
varying vec2 vP;
const float TAU = 6.2831853;
vec3 arm(vec4 a, vec3 col, float warn, float hi, float r, float phi) {
  if (a.w <= 0.001) return vec3(0.0);
  float d = mod(a.y * (phi - a.x), TAU);
  float b = TAU - d;
  float lead = a.z;
  float k = 0.0;
  if (d < lead) {
    float u = d / lead;
    // (a low beam sweeps a full wedge of light with running bands; a high one only a faint one: it is overhead)
    k += pow(1.0 - u, 1.5) * mix(0.4, 0.14, hi);
    float band = fract(u * 7.0 + uT * 3.0);
    k += smoothstep(0.0, 0.06, band) * smoothstep(0.3, 0.12, band) * 0.16 * (1.0 - u) * (1.0 - hi);
    k += smoothstep(0.09, 0.0, abs(d - lead) * r) * 0.35;
  }
  if (warn > 0.0 && b < lead) {
    float u = b / lead;
    k += (pow(1.0 - u, 1.5) * 0.5 + smoothstep(0.09, 0.0, abs(b - lead) * r) * 0.35) * warn;
  }
  float m = min(d, b) * r;
  // (under a low beam, a solid line of light on the floor; under a high one, its shadow in dashes)
  float line = smoothstep(0.42, 0.0, m) * 1.1;
  float dash = step(0.42, fract(r * 1.15)) * smoothstep(0.3, 0.0, m) * 0.9;
  k += mix(line, dash, hi);
  if (b < 0.7) k += (1.0 - b / 0.7) * 0.16 * (1.0 - hi);
  return col * k * a.w;
}
void main() {
  float r = length(vP);
  float phi = atan(vP.y, vP.x);
  vec3 c = arm(uA[0], uC[0], uW[0], uK[0], r, phi) + arm(uA[1], uC[1], uW[1], uK[1], r, phi);
  c *= smoothstep(${R.toFixed(2)}, ${(R - 0.3).toFixed(2)}, r) * smoothstep(${(rin - 0.35).toFixed(2)}, ${rin.toFixed(2)}, r);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

/** Where a pink and a cyan will cross too close together to dodge both: yellow-and-black hazard stripes. */
const trapFrag = (rin: number) => /* glsl */ `
uniform vec4 uX[2];
uniform float uT;
varying vec2 vP;
const float TAU = 6.2831853;
const float PI = 3.14159265;
void main() {
  float r = length(vP);
  float phi = atan(vP.y, vP.x);
  float a = 0.0;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec4 x = uX[i];
    if (x.z <= 0.0) continue;
    float dd = abs(mod(phi - x.x + PI, TAU) - PI);
    if (dd > x.y) continue;
    float edge = smoothstep(x.y, x.y * 0.85, dd);
    float st = step(0.5, fract((vP.x + vP.y) * 0.7 - uT * 1.4));
    float side = smoothstep(0.16, 0.0, abs(dd - x.y * 0.94) * r);
    float k = x.z * (0.82 + 0.18 * sin(uT * 11.0));
    col = mix(vec3(0.06, 0.035, 0.0), vec3(1.0, 0.75, 0.04), max(st, side));
    a = max(a, k * max(edge * 0.62, side));
  }
  a *= smoothstep(${R.toFixed(2)}, ${(R - 0.3).toFixed(2)}, r) * smoothstep(${(rin - 0.35).toFixed(2)}, ${rin.toFixed(2)}, r);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

/** The beam's light along its length (0 at the core … 1 at the far end): full to the rim, then gone. */
function along(v: number) {
  const f = (R - X0) / (X1 - X0);
  const a = v < 0.03 ? v / 0.03 : 1;
  return v <= f ? a : Math.pow(Math.max(0, 1 - (v - f) / (1 - f)), 1.7);
}

class Laser implements Mini {
  private w: ReturnType<typeof world>;
  /** The deck and the world round it (the turntable, its arrows). */
  private arena: Arena;
  /** Air time against the classic's (a cyan catches a floating jumper longer; crossings trap wider). */
  private airK: number;
  /** The turntable: its turn (rad), its speed (rad/s), the way it is set to go, its switches (the first one starts it). */
  private bandAng = 0;
  private bandW = 0;
  private bandDir = 0;
  private bandEvs: { at: number; dir: number; warned: boolean }[] = [];
  private bandWarn = -1;
  private ps: P[];
  private arms: Arm[];
  private fx: Fx3;
  private cam: CamRig;
  private t = 0;
  private it = 0;
  private over: number[] | null = null;
  private endT = 0;
  private evs: Ev[] = [];
  private bans: { s: string; sub: string; c: string; d: number; size: number; out?: boolean }[] = [];
  private banT = 0;
  private flash = 0;
  private flashC = HEX[0] as string;
  private pops: { x: number; y: number; z: number; s: string; c: string; t: number; big?: boolean }[] = [];
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  /** The ring of the last shove on the floor. */
  private boom: THREE.Mesh;
  private boomM: THREE.MeshBasicMaterial;
  private boomT = 1;
  /** What the shoves did (the bench reads it). */
  readonly stats = { shoves: 0, hits: 0, clashes: 0, misses: 0, cancels: 0, shovedIn: 0, shovedOut: 0, byHuman: 0, onHuman: 0, humanShovedIn: 0, shovedInByHuman: 0 };
  private outs = [false, false, false, false];
  private lead: number[] = [];
  private c0 = new THREE.Color();
  /** The next two crossings of the arms that trap (angle, half width, how near, 0). */
  private traps = [new THREE.Vector4(), new THREE.Vector4()];
  private ov: THREE.ShaderMaterial;
  private trapM: THREE.ShaderMaterial;
  private ringMats: THREE.MeshBasicMaterial[] = [];
  private rings: THREE.Mesh[] = [];
  private bulbs!: THREE.InstancedMesh;
  private bulbFlash = 0;
  private orb!: THREE.Mesh;
  private halo!: THREE.Mesh;
  private coreLight!: THREE.PointLight;
  private hum: { ac: AudioContext; o1: OscillatorNode; o2: OscillatorNode; f: BiquadFilterNode; g: GainNode } | null = null;
  private human: number;
  private started = false;
  private torusG = new THREE.TorusGeometry(1, 0.2, 8, 32);
  private thinG = new THREE.TorusGeometry(1, 0.055, 6, 64);
  private tubeG = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
  private ink = new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide });

  constructor(
    private players: Player[],
    private rnd: Rnd,
    readonly lv: LaserLevel,
  ) {
    const L = lv.look;
    this.w = world({ night: true, sky: L.sky, fog: L.fog });
    this.airK = lv.jumpV / lv.grav / (9.5 / 30);
    const s = this.w.scene;
    this.human = players.findIndex((p) => p.human);
    // a brighter night than the kit's: the toy colours must sing
    this.w.hemi.color.set(L.hemi[0]);
    this.w.hemi.groundColor.set(L.hemi[1]);
    this.w.hemi.intensity = L.hemi[2];
    this.w.sun.color.set(L.sun[0]);
    this.w.sun.intensity = L.sun[1];
    this.w.sun.position.set(...L.sun[2]);

    this.arena = buildArena(lv, s);
    this.build();
    const ov = (this.ov = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: frag(lv.rin),
      uniforms: {
        uA: { value: [new THREE.Vector4(), new THREE.Vector4()] },
        uC: { value: [new THREE.Color(), new THREE.Color()] },
        uW: { value: [0, 0] },
        uK: { value: [0, 0] },
        uT: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    const om = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.05, lv.rin - 0.4), R, 120, 1), ov);
    om.rotation.x = -Math.PI / 2;
    om.position.y = 0.012;
    om.renderOrder = 1.5;
    s.add(om);
    this.trapM = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: trapFrag(lv.rin), uniforms: { uX: { value: this.traps }, uT: ov.uniforms.uT }, transparent: true, depthWrite: false });
    const tm = new THREE.Mesh(om.geometry, this.trapM);
    tm.rotation.x = -Math.PI / 2;
    tm.position.y = 0.01;
    tm.renderOrder = 1;
    s.add(tm);

    const fade = this.fadeTex();
    const sheet = this.sheetTex();
    this.arms = [this.makeArm(fade, sheet), this.makeArm(fade, sheet)];
    const A = this.arms[0];
    A.ghostAt = A.bornAt = 0.25;
    A.ang = A.prev = START_ANG;
    A.dir = A.cur = 1;
    A.kind = 0;
    A.y = BEAM_Y[0];
    const B = this.arms[1];
    B.ghostAt = B.bornAt = Infinity;

    const aFill = arrowGeo(0);
    const aInk = arrowGeo(0.11);
    this.ps = players.map((p, i) => {
      const av = new Avatar(s, p, { scale: SCALE });
      const a = SPOT[i];
      av.pos.set(Math.cos(a) * lv.spawn, 0, Math.sin(a) * lv.spawn);
      av.yaw = 0;
      av.sync(0);
      // the shove's telegraph: an arrow on the floor in the seat's colour over its ink, a glow at the fists
      const arrow = new THREE.Group();
      const inkM = new THREE.MeshBasicMaterial({ color: 0x0c0820, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const arrowM = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const ink = new THREE.Mesh(aInk, inkM);
      ink.renderOrder = 3;
      const fill = new THREE.Mesh(aFill, arrowM);
      fill.position.y = 0.006;
      fill.renderOrder = 4;
      arrow.add(ink, fill);
      arrow.visible = false;
      s.add(arrow);
      const fistM = new THREE.MeshBasicMaterial({ color: p.color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
      const fist = new THREE.Mesh(GEO.ball, fistM);
      fist.position.set(0, 0.95 * SCALE, 0.42 * SCALE);
      fist.visible = false;
      fist.renderOrder = 7;
      av.root.add(fist);
      return {
        av,
        lives: LIVES,
        out: false,
        outT: 0,
        lastHit: -1,
        dodges: 0,
        inv: 0,
        stun: 0,
        buf: 0,
        kx: 0,
        kz: 0,
        spinYaw: 0,
        tumble: 0,
        tumbleV: 0,
        touching: [false, false],
        tx: av.pos.x,
        tz: av.pos.z,
        think: 0.5 + i * 0.3,
        check: 0,
        plan: [NaN, NaN],
        planKind: [-1, -1],
        planned: [false, false],
        sees: [false, false],
        lastTau: [99, 99],
        cd: 0,
        wind: 0,
        lunge: 0,
        rec: 0,
        sx: 0,
        sz: 1,
        bbuf: 0,
        want: -1,
        wx: 0,
        wz: 1,
        shk: 0,
        guard: 0,
        by: -1,
        byT: 99,
        lean: 0,
        arrow,
        arrowM,
        inkM,
        fist,
        fistM,
        tint: new THREE.Color(p.color),
        glowK: 0,
        ready: 0,
        sCheck: 1 + this.rnd(),
        aggro: 0.7 + this.rnd() * 0.6,
        threat: -1,
        dodgeT: 0,
        dodge: 0,
        evade: 0,
        ex: 0,
        ez: 0,
        hunt: -1,
        huntT: 0,
        huntDir: 1,
        vx: 0,
        vz: 0,
      };
    });
    this.fx = new Fx3(s, 700);
    this.boomM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.boom = new THREE.Mesh(GEO.ring, this.boomM);
    this.boom.rotation.x = -Math.PI / 2;
    this.boom.renderOrder = 5;
    this.boom.visible = false;
    s.add(this.boom);
    this.cam = new CamRig(this.w.camera);
    this.cam.set(this.v.set(0, 9, 19), this.v2.set(0, 1, 0));
    this.schedule();
    if (import.meta.env.DEV) (window as unknown as { __laser?: unknown }).__laser = this;
  }

  // ---- the arena ----------------------------------------------------------------------------------

  /** The rim's bulbs and the proving core, in the level's colours (the deck and the world: scenery.ts). */
  private build() {
    const s = this.w.scene;
    const L = this.lv.look;
    // the bulbs on the side (on a turntable, they turn with it)
    const NB = 40;
    this.bulbs = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), NB);
    const m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      sc = new THREE.Vector3(0.22, 0.22, 0.1);
    for (let i = 0; i < NB; i++) {
      const a = (i / NB) * TAU;
      q.setFromAxisAngle(this.v.set(0, 1, 0), -a + Math.PI / 2);
      m4.compose(this.v2.set(Math.cos(a) * (R + 0.14), -0.42, Math.sin(a) * (R + 0.14)), q, sc);
      this.bulbs.setMatrixAt(i, m4);
      this.bulbs.setColorAt(i, this.c0.set("#ffffff"));
    }
    this.bulbs.raycast = () => {};
    (this.arena.spin ?? s).add(this.bulbs);

    // the proving core: a base, a white pylon, a cap, the orb and its rings
    const C = L.core;
    const cyl = (color: string, r: number, h: number, y: number, ink = 0.05) => {
      const m = new THREE.Mesh(GEO.cyl, toon(color));
      m.scale.set(r * 2, h, r * 2);
      m.position.y = y;
      s.add(m);
      if (ink) {
        const o = new THREE.Mesh(GEO.cyl, this.ink);
        o.scale.set(1 + ink / r, 1 + (ink * 2) / h, 1 + ink / r);
        m.add(o);
      }
      return m;
    };
    cyl(C.base, 1.25, 0.34, 0.17);
    cyl(C.gold, 1.05, 0.12, 0.4, 0.035);
    cyl(C.pylon, 0.4, 2.95, 0.32 + 1.475);
    for (const y of [1.2, 1.55, 2.75]) {
      const band = new THREE.Mesh(GEO.cyl, glow(C.band));
      band.scale.set(0.86, 0.06, 0.86);
      band.position.y = y;
      s.add(band);
    }
    cyl(C.base, 0.66, 0.26, 3.36);
    cyl(C.gold, 0.5, 0.1, 3.53, 0.03);
    this.orb = new THREE.Mesh(GEO.ball, glow(C.orb));
    this.orb.scale.setScalar(0.78);
    this.orb.position.y = 4.15;
    s.add(this.orb);
    this.halo = new THREE.Mesh(GEO.ball, glow(C.halo, 0.32, true));
    this.halo.scale.setScalar(1.6);
    this.halo.position.y = 4.15;
    s.add(this.halo);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: i === 2 ? "#ffffff" : HEX[i] });
      const ring = new THREE.Mesh(this.thinG, mat);
      ring.position.y = 4.15;
      ring.scale.setScalar(0.85 + i * 0.22);
      s.add(ring);
      this.rings.push(ring);
      this.ringMats.push(mat);
    }
    this.coreLight = new THREE.PointLight(C.light, 9, 9, 1.4);
    this.coreLight.position.set(0, 3.4, 0);
    s.add(this.coreLight);
  }

  private fadeTex() {
    return canvasTex(4, 128, (g) => {
      const d = g.createImageData(4, 128);
      for (let y = 0; y < 128; y++) {
        const k = Math.round(along(1 - (y + 0.5) / 128) * 255);
        for (let x = 0; x < 4; x++) d.data.set([k, k, k, 255], (y * 4 + x) * 4);
      }
      g.putImageData(d, 0, 0);
    });
  }
  private sheetTex() {
    return canvasTex(256, 64, (g) => {
      const d = g.createImageData(256, 64);
      for (let y = 0; y < 64; y++) {
        const e = (y - 31.5) / 32;
        const across = Math.exp(-e * e * 6);
        for (let x = 0; x < 256; x++) {
          const k = Math.round(along((x + 0.5) / 256) * across * 255);
          d.data.set([k, k, k, 255], (y * 256 + x) * 4);
        }
      }
      g.putImageData(d, 0, 0);
    });
  }

  private makeArm(fade: THREE.Texture, sheet: THREE.Texture): Arm {
    const s = this.w.scene;
    const g = new THREE.Group();
    s.add(g);
    const add = (map: THREE.Texture | null) => new THREE.MeshBasicMaterial({ color: 0xffffff, map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const m = [add(fade), add(fade), add(fade), add(sheet), add(sheet), new THREE.MeshBasicMaterial({ color: 0xffffff }), add(null), add(null)];
    // the collar round the pylon, the turret, its lens
    const collar = new THREE.Mesh(this.torusG, toon(this.lv.look.turret));
    collar.rotation.x = Math.PI / 2;
    collar.scale.setScalar(0.5);
    g.add(collar);
    const tur = block(this.lv.look.turret, 0.66, 0.36, 0.42, 0.7, 0, 0, g);
    outline(tur, 0.035);
    block("#ffffff", 0.5, 0.07, 0.44, 0.68, 0.19, 0, g, m[5]);
    const lens = new THREE.Mesh(GEO.disc, m[5]);
    lens.scale.setScalar(0.3);
    lens.rotation.y = Math.PI / 2;
    lens.position.x = 1.045;
    g.add(lens);
    // the beam: a hot core, its glow, a haze, two sheets of light, a flare where it crosses the rim
    const beam = new THREE.Group();
    g.add(beam);
    const len = X1 - X0,
      mid = (X0 + X1) / 2;
    let core!: THREE.Mesh;
    for (const [i, rad] of [
      [0, 0.085],
      [1, 0.2],
      [2, 0.42],
    ] as const) {
      const t = new THREE.Mesh(this.tubeG, m[i]);
      t.rotation.z = -Math.PI / 2;
      t.scale.set(rad, len, rad);
      t.position.x = mid;
      t.renderOrder = 6;
      beam.add(t);
      if (i === 0) core = t;
    }
    // a high beam's ladder: two rails to the rim, a rung every stride (one draw; shown instead of the line)
    const L1 = R + 0.5,
      NR = Math.floor((L1 - X0 - 0.5) / 0.95);
    const ladder = new THREE.InstancedMesh(GEO.box, m[7], 2 + NR);
    const lm = new THREE.Matrix4();
    for (const k of [0, 1]) ladder.setMatrixAt(k, lm.makeScale(L1 - X0, 0.075, 0.075).setPosition((X0 + L1) / 2, 0, k ? 0.27 : -0.27));
    for (let i = 0; i < NR; i++) ladder.setMatrixAt(2 + i, lm.makeScale(0.07, 0.07, 0.54).setPosition(X0 + 0.7 + i * 0.95, 0, 0));
    ladder.renderOrder = 6;
    ladder.raycast = () => {};
    ladder.visible = false;
    beam.add(ladder);
    const sh = new THREE.Mesh(GEO.plane, m[3]);
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(len, 1.9, 1);
    sh.position.x = mid;
    sh.renderOrder = 6;
    const sv = new THREE.Mesh(GEO.plane, m[4]);
    sv.scale.set(len, 1.3, 1);
    sv.position.x = mid;
    sv.renderOrder = 6;
    beam.add(sh, sv);
    const tip = new THREE.Mesh(GEO.ball, m[6]);
    tip.position.x = R + 0.1;
    tip.scale.setScalar(0.62);
    tip.renderOrder = 6;
    beam.add(tip);
    const light = new THREE.PointLight(0xffffff, 0, 7.5, 1.3);
    light.position.set(3.9, 0.35, 0);
    g.add(light);
    g.visible = false;
    return { live: false, ghostAt: Infinity, bornAt: Infinity, ang: 0, prev: 0, dir: 1, cur: 1, mul: 1, mulT: 1, spin: 0, kind: 0, chAt: -1, chFrom: 0, chTo: 0, revAt: -1, y: BEAM_Y[0], pow: 0, spark: 0, col: new THREE.Color(), g, beam, m, core, ladder, tip, light };
  }

  /** The script: a high beam at 9 s, low again at 15, a reversal, a second arm at 24 (the level's), then a mix. */
  private schedule() {
    const ev = (at: number, type: Ev["type"], arm: number) => this.evs.push({ at, type, arm, warned: false });
    const two = this.lv.twoAt;
    ev(9, "kind", 0);
    ev(15, "kind", 0);
    ev(Math.min(19.5, two - 4.5), "rev", 0);
    ev(two, "spawn", 1);
    ev(38, "fast", -1);
    ev(50, "fast", -1);
    // (what each arm is then, to keep the mix interesting: mostly one pink, one cyan)
    const kind = [0, 1];
    let t = two + 4.5;
    while (t < LIMIT - 2.5) {
      const r = this.rnd();
      if (r < 0.52) {
        // (never two pinks at once: two jumps too close together is a trap everywhere they cross)
        if (kind[0] === kind[1]) {
          const k = this.rnd() < 0.5 ? 0 : 1;
          ev(t, "kind", k);
          kind[k] = 1 - kind[k];
        } else if (this.rnd() < 0.72) {
          ev(t, "kind", -1);
          kind[0] = 1 - kind[0];
          kind[1] = 1 - kind[1];
        } else {
          // a breather: both high
          const k = kind[0] === 0 ? 0 : 1;
          ev(t, "kind", k);
          kind[k] = 1;
        }
      } else if (r < 0.86) ev(t, "rev", this.rnd() < 0.5 ? 0 : 1);
      else ev(t, "rev", -1);
      t += lerp(4.4, 3.0, clamp((t - 28) / 30, 0, 1)) + this.rnd() * 1.1;
    }
    this.evs.sort((a, b) => a.at - b.at);
    if (!this.lv.band) return;
    // the turntable: it starts at 3 s, then turns back every 8 to 10.5 s (never on top of a beam's reversal)
    let dir = this.rnd() < 0.5 ? 1 : -1;
    this.bandEvs.push({ at: 3, dir, warned: false });
    let b = 3 + 8 + this.rnd() * 2.5;
    while (b < LIMIT - 3) {
      for (const e of this.evs) if (e.type === "rev" && Math.abs(e.at - b) < 1.9) b = e.at + 2.2;
      if (b >= LIMIT - 3) break;
      dir = -dir;
      this.bandEvs.push({ at: b, dir, warned: false });
      b += 8 + this.rnd() * 2.5;
    }
  }

  /** The turntable: told BAND_WARN s before (a horn, its arrows blink amber pointing the new way), then it eases round to it. */
  private stepBand(dt: number, playing: boolean) {
    const lv = this.lv;
    if (!lv.band) return;
    const t = this.t;
    this.bandWarn = -1;
    if (playing)
      for (const e of this.bandEvs) {
        if (t >= e.at - BAND_WARN && t < e.at) this.bandWarn = e.at - t;
        if (e.warned || t < e.at - BAND_WARN) continue;
        e.warned = true;
        horn();
        if (e === this.bandEvs[0]) this.say(T("THE FLOOR TURNS!", "地面转动！"), "#ffb000", T("THE OUTER RING CARRIES YOU", "外圈会带着你走"), 1.5, 50);
        else this.say(T("TURNTABLE SWITCH!", "转盘换向！"), "#ffb000", T("WATCH THE ARROWS", "看箭头"), 1.2, 50);
      }
    const was = this.bandDir;
    for (const e of this.bandEvs) if (t >= e.at) this.bandDir = e.dir;
    if (this.bandDir !== was) {
      // (the gears catch: amber sparks all round the groove between what turns and what stands)
      for (let k = 0; k < 10; k++) this.fx.burst(this.v.set(Math.cos((k / 10) * TAU) * lv.band, 0.12, Math.sin((k / 10) * TAU) * lv.band), 4, ["#ffb000", "#ffffff", "#ff7a1a"], { speed: 3.2, up: 2.6, size: 0.12, life: 0.5, gravity: 12 });
      this.cam.shake(0.14);
      sfx.thud();
    }
    // (it picks up speed with the beams; it stops at the end)
    const want = this.over ? 0 : this.bandDir * lv.bandSpeed * (1 + clamp((t - 20) / 40, 0, 1) * 0.25);
    this.bandW += clamp(want - this.bandW, -dt * 0.9, dt * 0.9);
    this.bandAng += this.bandW * dt;
    if (this.arena.spin) this.arena.spin.rotation.y = -this.bandAng;
    const next = this.bandWarn >= 0 ? this.bandEvs.find((e) => e.at > t)?.dir ?? this.bandDir : this.bandDir;
    this.arena.arrows(next || 1, this.bandWarn >= 0, this.bandDir !== 0, this.it);
  }

  /** How fast the floor carries one standing here round the core (rad/s; only on the turntable). */
  carry(x: number, z: number) {
    return this.lv.band && x * x + z * z > this.lv.band * this.lv.band ? this.bandW : 0;
  }

  /** What a spot is worth to an AI for the floor under it (the turntable: with the beams is good, against is bad). */
  spotCost(x: number, z: number, sk: number) {
    const c = this.carry(x, z);
    if (!c) return 0;
    let k = 0;
    for (const a of this.arms) if (this.exists(a)) k += Math.sign(this.omega(a)) || 0;
    return -k * Math.sign(c) * Math.min(1, Math.abs(c) / 0.4) * sk * 0.5;
  }

  // ---- the rules ----------------------------------------------------------------------------------

  /** The base turn speed (rad/s): it creeps up, and jumps at 38 s and 50 s (and the level's pace). */
  private base() {
    const t = this.t;
    return (1.2 + t * 0.021 + (t > 38 ? 0.3 : 0) + (t > 50 ? 0.3 : 0)) * this.lv.speed;
  }
  private omega(a: Arm) {
    return this.base() * a.mul * a.cur * ease(a.spin);
  }
  private exists(a: Arm) {
    return a.live || this.t >= a.ghostAt;
  }
  /** Will the arm be lit (able to hit) at time `at`? */
  private litAt(a: Arm, at: number) {
    if (!this.exists(a) || at < a.bornAt + 0.3) return false;
    return !(a.chAt >= 0 && at > a.chAt + 0.03 && at < a.chAt + 0.52);
  }
  private kindAt(a: Arm, at: number): Kind {
    return a.chAt >= 0 && at >= a.chAt + 0.14 ? a.chTo : a.kind;
  }
  /** Seconds until the arm's beam reaches the angle phi (`look`: knowing its told reversal). */
  private tau(a: Arm, phi: number, look: boolean, wp = 0) {
    const w = this.omega(a);
    if (look && a.revAt >= 0) {
      const toRev = Math.max(0, a.revAt - this.t);
      const s0 = Math.sign(w) || a.dir;
      const d0 = mod(s0 * (phi - a.ang));
      if (Math.abs(w) > 0.1 && d0 / Math.abs(w) < toRev) return d0 / Math.abs(w);
      const angR = a.ang + w * toRev;
      const d1 = mod(-a.dir * (phi - angR));
      return toRev + 0.2 + d1 / (this.base() * a.mul);
    }
    const full = this.base() * a.mul * ease(a.spin);
    // (turning back right now, slow: it comes the new way once it is up to speed again)
    if (Math.abs(w) < full * 0.5 && a.cur * a.dir < 0.95) return (1 - a.cur * a.dir) * 0.1 + mod(a.dir * (phi - a.ang)) / Math.max(0.3, full);
    const rate = Math.abs(w) - Math.sign(w) * wp;
    if (Math.abs(w) < 0.12 || rate < 0.12) return 99;
    return mod(Math.sign(w) * (phi - a.ang)) / rate;
  }

  /**
   * Where the two arms (turning against each other) cross next, while a pink and a cyan: there the
   * two pass too close together to dodge both. Each trap: its angle, its half width, how near (0…1).
   */
  private meet() {
    const [A, B] = this.arms;
    const x = this.traps;
    x[0].set(0, 0, 0, 0);
    x[1].set(0, 0, 0, 0);
    if (!B.live || this.over) return;
    const wa = this.omega(A),
      wb = this.omega(B);
    if (Math.sign(wa) === Math.sign(wb) || Math.abs(wa) < 0.3 || Math.abs(wb) < 0.3) return;
    const close = Math.abs(wa) + Math.abs(wb);
    const d = mod(Math.sign(wa) * (B.ang - A.ang));
    const hw = (0.55 * this.airK) / (1 / Math.abs(wa) + 1 / Math.abs(wb));
    for (let k = 0; k < 2; k++) {
      const tm = (d + k * TAU) / close;
      const at = this.t + tm;
      if (tm > 3.2 || !this.litAt(A, at) || !this.litAt(B, at) || this.kindAt(A, at) === this.kindAt(B, at)) continue;
      x[k].set(A.ang + wa * tm, hw, clamp(1.35 - tm / 2.4, 0.3, 1), 0);
    }
  }
  /** Is this angle inside a trap (how bad, 0…1)? */
  private trapAt(phi: number) {
    let k = 0;
    for (const x of this.traps) if (x.z > 0 && Math.abs(wrapPi(phi - x.x)) < x.y) k = Math.max(k, x.z);
    return k;
  }

  private say(s: string, c: string, sub = "", d = 1.25, size = 56, out = false) {
    if (this.over) return;
    // (two out at once: the count under the first one is the new one too)
    if (out) for (const b of this.bans) if (b.out) b.sub = sub;
    if (this.bans.length >= 2) this.bans.splice(1, 1);
    this.bans.push({ s, sub, c, d, size, out });
  }

  private runEvents() {
    const t = this.t;
    const [A, B] = this.arms;
    for (const e of this.evs) {
      if (e.warned || t < e.at - WARN[e.type]) continue;
      e.warned = true;
      const arms = e.arm < 0 ? this.arms : [this.arms[e.arm]];
      if (e.type === "kind") {
        for (const a of arms) {
          a.chAt = e.at;
          a.chFrom = a.kind;
          a.chTo = a.kind === 0 ? 1 : 0;
        }
        const to = arms[0].chTo;
        if (e.arm < 0) (this.say(T("SWAP!", "交换！"), "#ffd23f", T("PINK ⇄ CYAN", "粉 ⇄ 青"), 1.15, 50), zz.rise(), zz.fall());
        else if (to === 1) (this.say(T("HIGH BEAM!", "高光束！"), HEX[1], T("DON'T JUMP!", "别跳！"), 1.15, 50), zz.rise());
        else (this.say(T("LOW BEAM!", "低光束！"), HEX[0], T("JUMP IT!", "跳过去！"), 1.15, 50), zz.fall());
      } else if (e.type === "rev") {
        let list = arms;
        if (e.arm >= 0 && this.exists(B) && A.dir !== B.dir) {
          // one turning back sets them chasing each other round: only fair half a turn apart (else both turn)
          const l = WARN.rev;
          const sep = mod(A.dir * (B.ang + this.omega(B) * l - A.ang - this.omega(A) * l));
          if (Math.abs(sep - Math.PI) > 0.7) list = this.arms;
        }
        for (const a of list) a.revAt = e.at;
        B.mulT = 0.9 + this.rnd() * 0.15;
        this.say(T("REVERSE!", "反转！"), "#ffd23f", "", 1.1, 52);
        zz.klaxon();
      } else if (e.type === "spawn") {
        B.ghostAt = t;
        B.bornAt = e.at;
        B.ang = B.prev = A.ang + Math.PI;
        B.dir = B.cur = A.dir > 0 ? -1 : 1;
        B.spin = 0.35;
        B.mul = B.mulT = 0.94;
        B.kind = A.kind === 0 ? 1 : 0;
        B.y = BEAM_Y[B.kind];
        this.say(T("TWO BEAMS!", "两道光束！"), "#ffffff", T("WATCH WHERE THEY CROSS!", "小心交汇处！"), 1.6);
        zz.ignite();
      } else {
        this.say(t > 45 ? T("MAX SPEED!", "极速！") : T("FASTER!", "加速！"), t > 45 ? "#ff5a3c" : "#ff9f1c");
        sfx.star();
        // (the core flares: a ring of sparks out of the orb, the rim's bulbs flash)
        for (let k = 0; k < 12; k++) this.fx.burst(this.v.set(Math.cos((k / 12) * TAU) * 0.9, 4.15, Math.sin((k / 12) * TAU) * 0.9), 2, ["#ffb347", "#ffffff", "#ff5a3c"], { speed: 6, up: 1.5, size: 0.14, life: 0.8, gravity: 6 });
        this.bulbFlash = 0.35;
        this.cam.shake(0.12);
      }
    }
  }

  private stepArm(a: Arm, dt: number) {
    a.prev = a.ang;
    const t = this.t;
    if (!a.live && t >= a.bornAt) {
      a.live = true;
      zz.ignite();
      // (it lights up: a burst out of its turret, a big one for the second arm)
      const big = a === this.arms[1];
      this.armFx(a, 1, big ? 34 : 14, SPARK[a.kind], big ? 7 : 4);
      if (big) (this.cam.shake(0.25), this.fx.burst(this.v.set(0, 4.15, 0), 30, [HEX[a.kind], "#ffffff", "#ffe36b"], { speed: 8, up: 3, size: 0.16, life: 0.9 }));
    }
    if (!this.exists(a)) {
      a.pow = 0;
      return;
    }
    if (a.revAt >= 0 && t >= a.revAt) {
      a.dir = -a.dir;
      a.revAt = -1;
      this.bulbFlash = 0.3;
      // (it turns back: sparks fly off its turret and where it crosses the rim)
      this.armFx(a, 1, 14, REV_SPARK, 5);
      this.armFx(a, R, 12, REV_SPARK, 4);
    }
    a.cur += clamp(a.dir - a.cur, -dt * 5, dt * 5);
    a.spin = Math.min(1, a.spin + dt / 1.2);
    if (a === this.arms[1]) {
      // B keeps its own pace; turning the same way as A, it keeps half a turn from it (never a trap everywhere)
      const A = this.arms[0];
      let to = a.mulT;
      if (A.dir === a.dir) to = clamp(1 + (0.45 * (Math.PI - mod(A.dir * (a.ang - A.ang)))) / Math.PI, 0.78, 1.25);
      a.mul += clamp(to - a.mul, -dt * 0.6, dt * 0.6);
    }
    a.ang += this.omega(a) * dt;
    // the power: a ghost before it is born (B), the ignition, the change of height
    const from = a.ghostAt < a.bornAt ? 0.3 : 0;
    let pw = a.live ? lerp(from, 1, clamp((t - a.bornAt) / 0.35, 0, 1)) : 0.22 + 0.12 * Math.sin(t * 22);
    a.y = BEAM_Y[a.kind];
    if (a.chAt >= 0) {
      const k = t - a.chAt;
      if (k >= 0.58) a.chAt = -1;
      else if (k >= 0) {
        // (the jump to the new height: a shower of the new colour all along the beam)
        if (k >= 0.14 && a.kind !== a.chTo) for (const r of [2.2, 3.8, 5.4, 7]) this.armFx(a, r, 6, SPARK[a.chTo], 2.6, BEAM_Y[a.chTo]);
        if (k >= 0.14) a.kind = a.chTo;
        pw *= k < 0.14 ? 1 - k / 0.14 : k < 0.44 ? 0 : (k - 0.44) / 0.14;
        a.y = k < 0.14 ? BEAM_Y[a.chFrom] : lerp(BEAM_Y[a.chFrom], BEAM_Y[a.chTo], ease(clamp((k - 0.14) / 0.3, 0, 1)));
      }
    }
    if (this.over) pw *= Math.max(0, 1 - this.endT / 0.6);
    a.pow = pw;
    // its colour: blinks to the next one before a change, flashes white before a reversal
    a.col.copy(COL[a.kind]);
    if (a.chAt >= 0 && t < a.chAt && Math.floor((a.chAt - t) * 14) % 2 === 0) a.col.copy(COL[a.chTo]);
    if (a.revAt >= 0 && t >= a.revAt - 0.9 && Math.floor((a.revAt - t) * 12) % 2 === 0) a.col.lerp(WHITE, 0.7);
  }

  /** Sparks off an arm, `r` metres out along it (at its height, or `y`). */
  private armFx(a: Arm, r: number, n: number, cols: readonly string[], speed: number, y = a.y) {
    this.fx.burst(this.v.set(Math.cos(a.ang) * r, y, Math.sin(a.ang) * r), n, cols, { speed, up: 2.2, size: 0.12, life: 0.55, gravity: 10 });
  }

  /** Is this player within the arm's reach this frame? −1 no, else the part of the frame it came in at. */
  private touch(a: Arm, av: Avatar) {
    const r = Math.hypot(av.pos.x, av.pos.z);
    if (r > R + 0.3 || r < 0.5) return -1;
    const phi = Math.atan2(av.pos.z, av.pos.x);
    const half = (BEAM_W + BODY_R) / r;
    const d0 = wrapPi(phi - a.prev);
    const dd = wrapPi(a.ang - a.prev);
    const d1 = d0 - dd;
    if (Math.max(d0, d1) < -half || Math.min(d0, d1) > half) return -1;
    if (Math.abs(d0) <= half) return 0;
    return clamp((Math.abs(d0) - half) / Math.max(1e-5, Math.abs(dd)), 0, 1);
  }

  private checkHits(dt: number) {
    for (let i = 0; i < 4; i++) {
      const p = this.ps[i];
      if (p.out) continue;
      for (let k = 0; k < 2; k++) {
        const a = this.arms[k];
        const u = a.pow > 0.75 ? this.touch(a, p.av) : -1;
        if (u < 0) {
          // a pass gone by without a hit: a dodge
          if (p.touching[k] && p.inv <= 0) {
            p.dodges++;
            if (this.players[i].human) this.nice(p, a);
          }
          p.touching[k] = false;
          continue;
        }
        if (p.inv > 0) {
          p.touching[k] = false;
          continue;
        }
        const y = p.av.pos.y;
        if (a.kind === 0 ? y < CLEAR_LOW : y > CLEAR_HIGH) {
          p.touching[k] = false;
          this.hit(i, a, u, dt);
          break;
        }
        p.touching[k] = true;
      }
    }
  }

  private nice(p: P, a: Arm) {
    zz.nice();
    this.fx.burst(this.v.copy(p.av.pos).setY(p.av.pos.y + 0.3), 10, SPARK[a.kind], { speed: 3, up: 3, size: 0.1, life: 0.5 });
    this.pops.push({ x: p.av.pos.x, y: p.av.pos.y + 3.4, z: p.av.pos.z, s: T("NICE!", "漂亮！"), c: HEX[a.kind], t: 0 });
  }

  private hit(i: number, arm: Arm, u: number, dt: number) {
    const p = this.ps[i],
      av = p.av,
      pl = this.players[i];
    const when = this.t - dt + u * dt;
    // (shoved into it a moment ago: the shover's doing)
    const by = p.by >= 0 && p.byT < 1.3 ? p.by : -1;
    p.by = -1;
    if (by >= 0) {
      this.stats.shovedIn++;
      if (pl.human) this.stats.humanShovedIn++;
      if (this.players[by].human) this.stats.shovedInByHuman++;
      if (!this.ps[by].out) this.ps[by].av.cheer(1.2);
      if (this.players[by].human) sfx.star();
    }
    p.lives--;
    p.lastHit = when;
    const w = Math.sign(this.omega(arm)) || 1;
    const phi = Math.atan2(av.pos.z, av.pos.x);
    const tx = -Math.sin(phi) * w,
      tz = Math.cos(phi) * w;
    this.fx.burst(this.v.copy(av.pos).setY(av.pos.y + 0.9), 34, SPARK[arm.kind], { speed: 8, up: 4, size: 0.15, life: 0.75 });
    this.bulbFlash = 0.25;
    sfx.hit();
    zz.zap();
    if (pl.human) {
      this.flash = 1;
      this.flashC = HEX[arm.kind];
    }
    if (p.lives > 0) {
      p.inv = INVULN;
      p.stun = 0.5;
      p.kx = tx * 5;
      p.kz = tz * 5;
      av.vy = Math.max(av.vy, 6.5);
      av.grounded = false;
      p.spinYaw = TAU;
      av.hit();
      this.cam.shake(pl.human ? 0.45 : 0.22);
      // (lower than the BONK still rising, and bigger: the payoff)
      if (by >= 0) this.pops.push({ x: av.pos.x, y: av.pos.y + 2.5, z: av.pos.z, s: T("SHOVED IN!", "被推进去！"), c: this.players[by].color, t: 0, big: true });
      else this.pops.push({ x: av.pos.x, y: av.pos.y + 3.4, z: av.pos.z, s: T("OUCH!", "哎哟！"), c: "#ffffff", t: 0 });
      return;
    }
    // out: batted off the disc, spinning, into the night
    p.out = true;
    p.outT = when;
    av.out = true;
    av.root.visible = true;
    p.wind = p.lunge = 0;
    p.arrow.visible = p.fist.visible = false;
    av.body.root.rotation.z = 0;
    av.body.root.scale.setScalar(SCALE);
    const rx = Math.cos(phi),
      rz = Math.sin(phi);
    av.vel.set(tx * 9 + rx * 8, 0, tz * 9 + rz * 8).setLength(14);
    av.vy = 11;
    av.grounded = false;
    p.tumbleV = (11 + Math.random() * 6) * (Math.random() < 0.5 ? -1 : 1);
    av.hit();
    av.yaw = yawOf(-av.vel.x, -av.vel.z);
    sfx.lose();
    sfx.whoosh();
    this.cam.shake(0.65);
    this.fx.burst(this.v.copy(av.pos).setY(av.pos.y + 1), 30, [pl.color, "#ffffff", "#ffd23f"], { speed: 9, up: 6, size: 0.2, life: 1.1 });
    const left = this.left();
    let name = pl.human ? T("YOU'RE OUT!", "你出局了！") : T(`${short(pl)} OUT!`, `${short(pl)} 出局！`);
    if (by >= 0) {
      this.stats.shovedOut++;
      name = pl.human ? T("SHOVED OUT!", "你被推出局了！") : T(`${short(pl)} SHOVED OUT!`, `${short(pl)} 被推出局！`);
    }
    this.say(name, by >= 0 ? this.players[by].color : pl.color, left >= 2 ? T(`${left} LEFT!`, `剩 ${left} 人！`) : "", 1.5, 60, true);
  }

  private left() {
    let n = 0;
    for (const p of this.ps) if (!p.out) n++;
    return n;
  }

  /** The order: the ones still standing (most hearts, the longest since a hit), then the fallen, last out first. */
  private rank() {
    const ps = this.ps;
    const seats = [0, 1, 2, 3];
    const up = seats.filter((i) => !ps[i].out).sort((a, b) => ps[b].lives - ps[a].lives || ps[a].lastHit - ps[b].lastHit || ps[b].dodges - ps[a].dodges || a - b);
    const down = seats.filter((i) => ps[i].out).sort((a, b) => ps[b].outT - ps[a].outT || a - b);
    return [...up, ...down];
  }

  // ---- the AI -------------------------------------------------------------------------------------

  private gauss() {
    return Math.sqrt(-2 * Math.log(Math.max(1e-6, this.rnd()))) * Math.cos(TAU * this.rnd());
  }

  /** The lead it will jump with for this pass (NaN: it stays down), as good as its skill. */
  private planFor(kind: Kind, sk: number) {
    // (sloppier as the beams speed up)
    const fast = 0.8 + 0.26 * Math.max(0, this.base() - 1.2);
    const sigma = (0.035 + 0.115 * (1 - sk)) * fast;
    const lead = this.lv.lead,
      off = this.airK;
    // (a lapse once the beams fly: even the pros panic now and then)
    if (this.rnd() < (0.03 + 0.06 * (1 - sk)) * Math.max(0, this.base() - 1.5)) return kind === 1 ? lead : this.rnd() < 0.5 ? NaN : lead + (this.rnd() < 0.5 ? -0.28 : 0.3) * off;
    if (kind === 0) return this.rnd() < 0.04 * (1 - sk) ? NaN : lead + this.gauss() * sigma;
    // (a jump at a high beam: the bad habit of the unskilled)
    return this.rnd() < 0.2 * Math.pow(1 - sk, 1.5) * fast ? lead + this.gauss() * sigma * 1.4 : NaN;
  }

  /** How bad a spot is in the next `hor` seconds: a pink and a cyan (or two pinks) too close together there. */
  private danger(x: number, z: number, hor: number) {
    const [A, B] = this.arms;
    if (!this.exists(B)) return 0;
    const wa = Math.abs(this.omega(A)),
      wb = Math.abs(this.omega(B));
    if (wa < 0.3 || wb < 0.3) return 0;
    const phi = Math.atan2(z, x);
    // (on the turntable the beams come round at their speed against the floor's)
    const wp = this.carry(x, z);
    const pa = TAU / Math.max(0.2, wa - Math.sign(this.omega(A)) * wp),
      pb = TAU / Math.max(0.2, wb - Math.sign(this.omega(B)) * wp);
    const now = this.t;
    const k = this.airK;
    let cost = 0;
    for (let ta = this.tau(A, phi, true, wp); ta < hor; ta += pa)
      for (let tb = this.tau(B, phi, true, wp); tb < hor; tb += pb) {
        if (!this.litAt(A, now + ta) || !this.litAt(B, now + tb)) continue;
        const ka = this.kindAt(A, now + ta),
          kb = this.kindAt(B, now + tb);
        const gap = Math.abs(ta - tb);
        const bad = ka === 0 && kb === 0 ? gap > 0.2 * k && gap < 0.68 * k : ka !== kb ? gap < 0.55 * k : false;
        if (bad) cost += 1 - (Math.min(ta, tb) / hor) * 0.5;
      }
    return cost;
  }

  private crowd(i: number, x: number, z: number) {
    let c = 0;
    this.ps.forEach((q, j) => {
      if (j === i || q.out) return;
      c += Math.max(0, 2.4 - Math.hypot(q.av.pos.x - x, q.av.pos.z - z)) * 0.45;
    });
    return c;
  }

  private brain(i: number, dt: number) {
    const p = this.ps[i],
      av = p.av,
      sk = this.players[i].skill;
    const phi = Math.atan2(av.pos.z, av.pos.x);
    // where to stand: skilled ones read where the two arms will cross and leave
    p.think -= dt;
    p.check -= dt;
    const two = this.exists(this.arms[1]);
    if (two && sk > 0.45 && p.check <= 0) {
      p.check = 0.3;
      if ((this.danger(av.pos.x, av.pos.z, 2.4) > 0.6 || this.trapAt(phi) > 0.3) && this.rnd() < sk) p.think = 0;
    }
    if (p.think <= 0) {
      p.think = lerp(2.4, 1.0, sk) * (0.6 + this.rnd() * 0.8);
      const r0 = Math.hypot(av.pos.x, av.pos.z);
      if (this.rnd() < 0.3 * (1 - sk)) {
        p.tx = av.pos.x;
        p.tz = av.pos.z;
      } else {
        let best = Infinity;
        const reads = two && sk > 0.35;
        for (let c = 0; c < 14; c++) {
          const ph = phi + (c === 0 ? 0 : (this.rnd() - 0.5) * 2.4);
          const rin = this.lv.rin;
          const rr = c === 0 ? r0 : clamp(r0 + (this.rnd() - 0.5) * 3.2, rin + 1, R - 1.1);
          const x = Math.cos(ph) * rr,
            z = Math.sin(ph) * rr;
          const cost = (reads ? (this.danger(x, z, 3.4) + this.trapAt(ph) * 1.5) * lerp(0.6, 2.6, sk) : 0) + Math.hypot(x - av.pos.x, z - av.pos.z) * 0.1 + this.crowd(i, x, z) + Math.max(0, rin + 2 - rr) * sk * 0.5 + this.spotCost(x, z, sk) + (this.rnd() - 0.5) * (1 - sk) * 2.2;
          if (cost < best) {
            best = cost;
            p.tx = x;
            p.tz = z;
          }
        }
      }
    }
    let mx = p.tx - av.pos.x,
      mz = p.tz - av.pos.z;
    const d = Math.hypot(mx, mz);
    if (d < 0.25) mx = mz = 0;
    else {
      const k = Math.min(1, d / 0.8) / d;
      mx *= k;
      mz *= k;
    }
    // the jumps: one plan per pass of each arm, as sharp as its skill
    const r2 = Math.max(0.5, av.pos.x * av.pos.x + av.pos.z * av.pos.z);
    const sp = RUN * (0.62 + 0.38 * sk);
    const wp = (sp * (av.pos.x * mz - av.pos.z * mx)) / r2;
    // (the floor's carry on the turntable: everyone feels that one)
    const cw = this.carry(av.pos.x, av.pos.z);
    let jump = false;
    for (let k = 0; k < 2; k++) {
      const arm = this.arms[k];
      if (!this.exists(arm)) continue;
      // (the skilled ones count their own run round the disc in the timing)
      const tk = this.tau(arm, phi, p.sees[k], (p.sees[k] ? wp : 0) + cw);
      // the last pass is behind it: a fresh look at the next one
      if (tk > p.lastTau[k] + 0.25 || Math.abs(tk - p.lastTau[k]) > 2.5) p.planned[k] = false;
      p.lastTau[k] = tk;
      if (!p.planned[k]) {
        p.planned[k] = true;
        p.sees[k] = this.rnd() < 0.3 + sk * 0.7;
        p.planKind[k] = -1;
      }
      // what it believes is coming (the told change, if it reads the signs; it stops rethinking when close)
      const kind = p.sees[k] ? this.kindAt(arm, this.t + tk) : arm.chAt >= 0 && this.t >= arm.chAt + 0.14 ? arm.chTo : arm.kind;
      if (kind !== p.planKind[k] && (tk > 0.55 || p.planKind[k] < 0)) {
        p.planKind[k] = kind;
        p.plan[k] = this.planFor(kind, sk);
      }
      // (in the air still, from another jump: it waits to land, often too late)
      if (p.plan[k] === p.plan[k] && tk <= p.plan[k] + dt * 0.5 && av.grounded) {
        jump = true;
        p.plan[k] = NaN;
      }
    }
    return { mx, mz, jump };
  }

  // ---- the frame ----------------------------------------------------------------------------------

  private stepPlayer(i: number, dt: number, input: Input, playing: boolean) {
    const p = this.ps[i],
      av = p.av,
      pl = this.players[i];
    if (p.out) {
      av.pos.x += av.vel.x * dt;
      av.pos.z += av.vel.z * dt;
      // (in orbit, it drifts away into space, tumbling)
      av.physics(dt, null, this.lv.outGrav);
      p.tumble += p.tumbleV * dt;
      const hp = 0.85 * SCALE;
      av.body.root.rotation.x = p.tumble;
      av.body.root.position.set(0, hp - hp * Math.cos(p.tumble), -hp * Math.sin(p.tumble));
      if (av.pos.y < -40 || av.pos.y > 60) av.root.visible = false;
      return;
    }
    p.inv = Math.max(0, p.inv - dt);
    p.stun -= dt;
    p.buf -= dt;
    let mx = 0,
      mz = 0,
      jump = false;
    p.want = -1;
    // (your A and B are held a moment, even while you're knocked: they go off as soon as you can)
    if (playing && pl.human) {
      if (input.pressed("a")) p.buf = 0.14;
      if (input.pressed("b")) p.bbuf = 0.16;
    }
    if (playing && p.stun <= 0) {
      if (pl.human) {
        const ax = input.axis();
        mx = ax.x;
        mz = ax.y;
        jump = p.buf > 0;
      } else {
        const b = this.brain(i, dt);
        this.aiShove(i, dt, b);
        mx = b.mx;
        mz = b.mz;
        jump = b.jump;
      }
    }
    // the shove: B (or the AI's wish) winds up, the wind-up becomes the lunge; A always jumps, out of either
    const was = p.cd;
    p.cd -= dt;
    if (pl.human && was > 0 && p.cd <= 0) p.ready = 1;
    p.ready = Math.max(0, p.ready - dt * 2.5);
    p.guard -= dt;
    p.bbuf -= dt;
    p.byT += dt;
    p.rec -= dt;
    p.shk -= dt;
    if (!playing) p.wind = p.lunge = 0;
    else if (p.stun <= 0 && p.cd <= 0 && p.wind <= 0 && p.lunge <= 0 && p.rec <= 0 && av.grounded && !(jump && pl.human)) {
      if (pl.human && p.bbuf > 0) {
        const l = Math.hypot(mx, mz);
        if (l > 0.2) this.windUp(i, mx / l, mz / l);
        else this.windUp(i, Math.sin(av.yaw), Math.cos(av.yaw));
      } else if (p.want >= 0) this.windUp(i, p.wx, p.wz);
    }
    let lx = 0,
      lz = 0;
    if (p.wind > 0 || p.lunge > 0) {
      if (jump && av.grounded) {
        p.wind = p.lunge = 0;
        p.cd = Math.max(p.cd, 0.45);
        this.stats.cancels++;
      } else if (p.wind > 0) {
        mx *= 0.3;
        mz *= 0.3;
        p.wind -= dt;
        if (p.wind <= 0) this.lunge(i);
      } else {
        lx = p.sx * LUNGE_V;
        lz = p.sz * LUNGE_V;
        mx = mz = 0;
        p.lunge -= dt;
        if (p.lunge <= 0) ((p.rec = REC_T), this.stats.misses++);
      }
    } else if (p.rec > 0) ((mx *= 0.3), (mz *= 0.3));
    const l = Math.hypot(mx, mz);
    if (l > 1) ((mx /= l), (mz /= l));
    const sp = pl.human ? RUN : RUN * (0.62 + 0.38 * pl.skill);
    p.vx = mx * sp + p.kx + lx;
    p.vz = mz * sp + p.kz + lz;
    // (the turntable carries whoever is on it round the core; its legs show only its own run)
    const cw = playing ? this.carry(av.pos.x, av.pos.z) : 0;
    if (cw) {
      const c = Math.cos(cw * dt),
        sn = Math.sin(cw * dt);
      const x = av.pos.x;
      av.pos.x = x * c - av.pos.z * sn;
      av.pos.z = x * sn + av.pos.z * c;
    }
    if (this.lv.band) av.legs = Math.hypot(p.vx, p.vz) / SCALE;
    av.pos.x += p.vx * dt;
    av.pos.z += p.vz * dt;
    const kd = Math.exp(-this.lv.grip * dt);
    p.kx *= kd;
    p.kz *= kd;
    this.hold(av);
    if (jump && av.jump(this.lv.jumpV)) {
      p.buf = 0;
      if (pl.human) zz.boing();
      // (a puff of dust off the floor; in orbit it hangs in the air)
      this.fx.burst(this.v.set(av.pos.x, 0.08, av.pos.z), 5, DUST, { speed: 1.6, up: 0.5, gravity: this.lv.grav < 25 ? 0.6 : 4, size: 0.11, life: this.lv.grav < 25 ? 0.8 : 0.35, drag: 3 });
    }
    av.physics(dt, 0, this.lv.grav);
    // facing: the shove's aim, where it runs, else the beam that comes
    if (p.wind > 0 || p.lunge > 0) av.face(yawOf(p.sx, p.sz), dt, 26);
    else if (l > 0.1) av.face(yawOf(mx, mz), dt);
    else if (p.spinYaw <= 0 && playing) {
      const phi = Math.atan2(av.pos.z, av.pos.x);
      let best = 99,
        s = 1;
      for (const a of this.arms) {
        if (!this.exists(a)) continue;
        const tk = this.tau(a, phi, false);
        if (tk < best) ((best = tk), (s = Math.sign(this.omega(a)) || 1));
      }
      if (best < 99) av.face(yawOf(s * Math.sin(phi), -s * Math.cos(phi)), dt, 6);
    }
    if (p.spinYaw > 0) {
      const d = Math.min(p.spinYaw, dt * 20);
      av.yaw += d;
      p.spinYaw -= d;
    }
    // the shove's poses: leaning back in the wind-up, into the lunge, flailing back when shoved
    const lean = p.wind > 0 ? -0.3 : p.lunge > 0 ? 0.5 : p.shk > 0 ? -0.45 : p.rec > 0 ? 0.24 : 0;
    p.lean += (lean - p.lean) * Math.min(1, 16 * dt);
    av.body.root.rotation.x = p.lean;
    av.body.root.rotation.z = p.shk > 0 ? Math.sin(this.it * 31 + i) * 0.3 : 0;
    const sq = p.wind > 0 ? 1 - p.wind / WIND : 0;
    av.body.root.scale.set(SCALE * (1 + sq * 0.09), SCALE * (1 - sq * 0.11 + (p.lunge > 0 ? 0.06 : 0)), SCALE * (1 + sq * 0.09));
    this.tele(p, dt);
    av.root.visible = !(p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0);
  }

  // ---- the shove ----------------------------------------------------------------------------------

  /** The nearest rival within `range` in front of seat `i` along (ax, az) (cosine `cos`), or -1. */
  private inCone(i: number, ax: number, az: number, range: number, cos: number) {
    const a = this.ps[i].av;
    let best = -1,
      bd = range;
    for (let j = 0; j < 4; j++) {
      const o = this.ps[j];
      if (j === i || o.out) continue;
      const dx = o.av.pos.x - a.pos.x,
        dz = o.av.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= bd || d < 1e-3 || (dx * ax + dz * az) / d < cos) continue;
      best = j;
      bd = d;
    }
    return best;
  }

  private windUp(i: number, ax: number, az: number) {
    const p = this.ps[i],
      a = p.av;
    // (a little help: the nearest rival in a cone round the aim)
    const j = this.inCone(i, ax, az, REACH + 1, 0.8);
    if (j >= 0) {
      const o = this.ps[j].av;
      const dx = o.pos.x - a.pos.x,
        dz = o.pos.z - a.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      ax = dx / l;
      az = dz / l;
    }
    p.sx = ax;
    p.sz = az;
    p.wind = WIND;
    p.bbuf = 0;
    p.want = -1;
    p.evade = 0;
    this.stats.shoves++;
    const human = this.players[i].human;
    beep(230, 0.22, "square", human ? 0.16 : 0.09, 2.4);
    // (one winding up at you: a warning blip)
    const h = this.ps[this.human];
    if (!human && h && !h.out) {
      const dx = h.av.pos.x - a.pos.x,
        dz = h.av.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < REACH + 0.8 && d > 1e-3 && (dx * ax + dz * az) / d > 0.7) (beep(1250, 0.05, "square", 0.2), beep(1250, 0.05, "square", 0.2, 0, 0.09));
    }
  }

  private lunge(i: number) {
    const p = this.ps[i],
      a = p.av;
    // (a last small correction toward the one in front: small, a step aside still dodges it)
    const j = this.inCone(i, p.sx, p.sz, REACH + 0.3, 0.985);
    if (j >= 0) {
      const o = this.ps[j].av;
      const dx = o.pos.x - a.pos.x,
        dz = o.pos.z - a.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      p.sx = dx / l;
      p.sz = dz / l;
    }
    p.wind = 0;
    p.lunge = LUNGE_T;
    p.cd = SHOVE_CD;
    p.glowK = 1;
    a.yaw = yawOf(p.sx, p.sz);
    p.arrow.rotation.y = a.yaw;
    this.fx.burst(this.v.set(a.pos.x - p.sx * 0.4, 0.15, a.pos.z - p.sz * 0.4), 7, ["#ffffff", "#d6d0ff", this.players[i].color], { speed: 2.4, up: 1.2, gravity: 4, size: 0.16, life: 0.4, drag: 3 });
    sfx.whoosh();
  }

  /** The lunges that land: on whoever is in front (a clash if it shoves back, a bounce off one guarded). */
  private shoveHits() {
    for (let i = 0; i < 4; i++) {
      const A = this.ps[i];
      if (A.lunge <= 0 || A.out) continue;
      for (let j = 0; j < 4; j++) {
        const B = this.ps[j];
        if (j === i || B.out) continue;
        // (one just leaving the ground for a jump is caught too, knocked out of it; a hop in time dodges)
        if (Math.abs(A.av.pos.y - B.av.pos.y) > 0.95) continue;
        const dx = B.av.pos.x - A.av.pos.x,
          dz = B.av.pos.z - A.av.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > CONTACT || d < 1e-4 || (dx * A.sx + dz * A.sz) / d < 0.2) continue;
        if ((B.wind > 0 || B.lunge > 0) && -(dx * B.sx + dz * B.sz) / d > 0.5) this.clash(i, j, dx / d, dz / d);
        else if (B.guard > 0 || B.inv > 0) this.deflect(i, j, dx / d, dz / d);
        else this.landShove(i, j, dx / d, dz / d);
        break;
      }
    }
  }

  /** A lunge meets seat j (n: from the shover to it): it slides off a step, pops up, can't act a moment. */
  private landShove(i: number, j: number, nx: number, nz: number) {
    const A = this.ps[i],
      B = this.ps[j];
    let kx = A.sx * 0.7 + nx * 0.3,
      kz = A.sz * 0.7 + nz * 0.3;
    const kl = Math.hypot(kx, kz) || 1;
    kx /= kl;
    kz /= kl;
    B.kx = kx * KNOCK;
    B.kz = kz * KNOCK;
    // (on the ground it pops up a little; caught just leaving it, it is knocked out of its jump)
    if (B.av.grounded) {
      B.av.vy = POP;
      B.av.grounded = false;
    } else B.av.vy = Math.min(B.av.vy, 1);
    B.stun = Math.max(B.stun, SHOVE_STUN);
    B.shk = SHOVE_STUN + 0.1;
    B.guard = GUARD_T;
    B.wind = B.lunge = B.rec = 0;
    B.buf = 0;
    B.evade = 0;
    // (up again, it may shove straight back)
    B.cd = Math.min(Math.max(B.cd, 0), SHOVE_STUN + 0.12);
    B.spinYaw = TAU * 0.75;
    B.by = i;
    B.byT = 0;
    B.av.hit();
    B.av.angry = true;
    A.lunge = 0;
    A.rec = 0.14;
    this.stats.hits++;
    const ha = this.players[i].human,
      hb = this.players[j].human;
    if (ha) this.stats.byHuman++;
    if (hb) this.stats.onHuman++;
    const mx = A.av.pos.x + nx * CONTACT * 0.55,
      mz = A.av.pos.z + nz * CONTACT * 0.55;
    this.fx.burst(this.v.set(mx, B.av.pos.y + 1.0, mz), 20, ["#ffffff", "#ffe27a", this.players[j].color, this.players[i].color], { speed: 6.5, up: 3, size: 0.17, life: 0.55, gravity: 12, dir: this.v2.set(kx * 2.5, 0, kz * 2.5) });
    this.fx.burst(this.v.set(B.av.pos.x, 0.1, B.av.pos.z), 8, ["#ffffff", "#d6d0ff"], { speed: 3, up: 1, gravity: 4, size: 0.15, life: 0.45, drag: 3 });
    this.boomAt(mx, mz, "#ffffff");
    this.pops.push({ x: B.av.pos.x, y: B.av.pos.y + 3.4, z: B.av.pos.z, s: T("BONK!", "砰！"), c: this.players[i].color, t: 0 });
    sfx.hit();
    beep(150, 0.2, "triangle", 0.5, 0.45);
    beep(520, 0.08, "square", 0.22, 0.6, 0.02);
    this.cam.shake(ha || hb ? 0.32 : 0.14);
  }

  /** Two shoves meet: both bounce back, nobody flies. */
  private clash(i: number, j: number, nx: number, nz: number) {
    const A = this.ps[i],
      B = this.ps[j];
    for (let k = 0; k < 2; k++) {
      const q = k ? B : A,
        s = k ? 1 : -1;
      q.kx = nx * s * KNOCK * 0.6;
      q.kz = nz * s * KNOCK * 0.6;
      q.stun = Math.max(q.stun, 0.16);
      q.shk = 0.2;
      q.guard = 0.6;
      q.wind = q.lunge = q.rec = 0;
      q.cd = 0.8;
      q.av.hit();
    }
    this.stats.clashes++;
    const mx = (A.av.pos.x + B.av.pos.x) / 2,
      mz = (A.av.pos.z + B.av.pos.z) / 2;
    this.fx.burst(this.v.set(mx, 1.1, mz), 28, ["#ffffff", "#ffe27a", "#fff3a8", this.players[i].color, this.players[j].color], { speed: 8, up: 4, size: 0.16, life: 0.6, gravity: 10 });
    this.boomAt(mx, mz, "#ffe27a");
    this.pops.push({ x: mx, y: 3.3, z: mz, s: T("CLASH!", "对撞！"), c: "#ffe27a", t: 0 });
    beep(1568, 0.09, "square", 0.28);
    beep(2093, 0.16, "square", 0.22, 0, 0.05);
    sfx.hit();
    this.cam.shake(this.players[i].human || this.players[j].human ? 0.26 : 0.12);
  }

  /** A lunge into one just shoved (or blinking from a hit): it bounces off. */
  private deflect(i: number, j: number, nx: number, nz: number) {
    const A = this.ps[i],
      B = this.ps[j];
    A.lunge = 0;
    A.rec = REC_T;
    A.kx = -nx * 1.5;
    A.kz = -nz * 1.5;
    this.fx.burst(this.v.set(A.av.pos.x + nx * 0.55, B.av.pos.y + 1, A.av.pos.z + nz * 0.55), 8, ["#ffffff", "#bfe8ff"], { speed: 4, up: 2, size: 0.12, life: 0.4 });
    beep(900, 0.06, "triangle", 0.2);
  }

  private boomAt(x: number, z: number, c: string) {
    this.boom.position.set(x, 0.05, z);
    this.boomM.color.set(c);
    this.boomT = 0;
  }

  /** The telegraph: the arrow on the floor and the glowing fists, through the wind-up, flaring in the lunge. */
  private tele(p: P, dt: number) {
    const a = p.av;
    p.glowK = p.lunge > 0 ? 1 : Math.max(0, p.glowK - dt * 5);
    const on = !p.out && (p.wind > 0 || p.glowK > 0.02);
    p.arrow.visible = on;
    p.fist.visible = on;
    if (!on) {
      if (a.ring) a.ring.scale.setScalar(1.5 * a.scale);
      return;
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.it * 38);
    if (p.wind > 0) {
      const k = 1 - p.wind / WIND;
      // (it follows the shover through the wind-up, and stays where the lunge set off)
      p.arrow.position.set(a.pos.x, 0.035, a.pos.z);
      p.arrow.rotation.y = yawOf(p.sx, p.sz);
      p.arrow.scale.set(0.7 + 0.3 * k, 1, 0.5 + 0.5 * k);
      p.arrowM.opacity = 0.4 + 0.4 * k + 0.18 * pulse;
      p.inkM.opacity = 0.3 + 0.25 * k;
      p.fist.scale.setScalar(0.3 + 0.62 * k + 0.1 * pulse);
      // (its ring on the floor swells and tightens: charging)
      if (a.ring) a.ring.scale.setScalar(1.5 * a.scale * (1.9 - 0.75 * k + 0.12 * pulse));
      p.fistM.color.copy(p.tint).multiplyScalar(0.45 + 0.55 * k);
    } else {
      p.arrow.scale.set(1, 1, 1);
      p.arrowM.opacity = 0.95 * p.glowK;
      p.inkM.opacity = 0.5 * p.glowK;
      p.fist.scale.setScalar(0.12 + 0.8 * p.glowK);
      if (a.ring) a.ring.scale.setScalar(1.5 * a.scale);
      p.fistM.color.copy(p.tint).lerp(WHITE, 0.45).multiplyScalar(p.glowK);
    }
  }

  /** Is a beam of this kind due over the angle phi within `hor` seconds? */
  private beamSoon(phi: number, kind: Kind, hor: number) {
    for (const a of this.arms) {
      if (!this.exists(a)) continue;
      const tk = this.tau(a, phi, true);
      if (tk < hor && this.litAt(a, this.t + tk) && this.kindAt(a, this.t + tk) === kind) return true;
    }
    return false;
  }

  /** An AI and the shove: it sees one coming (a hop, a step aside, a shove back), and looks for one to give. */
  private aiShove(i: number, dt: number, b: { mx: number; mz: number; jump: boolean }) {
    const p = this.ps[i],
      av = p.av,
      sk = this.players[i].skill;
    // ---- a rival winding up at it: it reacts (late, or not at all, the weak ones)
    let th = -1;
    for (let j = 0; j < 4; j++) {
      const o = this.ps[j];
      if (j === i || o.out || o.wind <= 0) continue;
      const dx = av.pos.x - o.av.pos.x,
        dz = av.pos.z - o.av.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-3 || d > REACH + 0.7 || (dx * o.sx + dz * o.sz) / d < 0.75) continue;
      th = j;
    }
    if (th >= 0 && th !== p.threat) {
      p.threat = th;
      p.dodgeT = lerp(0.3, 0.08, sk) + this.rnd() * lerp(0.16, 0.05, sk);
      p.dodge = 0;
      if (this.rnd() < lerp(0.15, 0.78, sk)) {
        const r = this.rnd();
        p.dodge = p.cd <= 0 && sk > 0.5 && r < 0.22 ? 3 : r < 0.55 ? 1 : 2;
      }
    } else if (th < 0 && p.threat >= 0 && this.ps[p.threat].lunge <= 0) p.threat = -1;
    if (p.threat >= 0 && p.dodge) {
      p.dodgeT -= dt;
      if (p.dodgeT <= 0) {
        const o = this.ps[p.threat];
        const how = p.dodge;
        p.dodge = 0;
        // (a hop is no good under a cyan: the good ones look first)
        const hopOk = sk < 0.45 || !this.beamSoon(Math.atan2(av.pos.z, av.pos.x), 1, 0.8 * this.airK);
        if (how === 3 && p.cd <= 0) {
          const dx = o.av.pos.x - av.pos.x,
            dz = o.av.pos.z - av.pos.z;
          const l = Math.hypot(dx, dz) || 1;
          p.want = p.threat;
          p.wx = dx / l;
          p.wz = dz / l;
        } else if (how === 1 && hopOk) b.jump = true;
        else {
          // a step across the shove's line, to the side it is on already (on the disc)
          const side = (av.pos.x - o.av.pos.x) * o.sz - (av.pos.z - o.av.pos.z) * o.sx >= 0 ? 1 : -1;
          let ex = av.pos.x + o.sz * side * 1.4,
            ez = av.pos.z - o.sx * side * 1.4;
          const r = Math.hypot(ex, ez) || 1;
          const rc = clamp(r, this.lv.rin + 0.4, R - 0.8);
          ex *= rc / r;
          ez *= rc / r;
          p.evade = 0.34;
          p.ex = ex;
          p.ez = ez;
        }
      }
    }
    if (p.evade > 0) {
      p.evade -= dt;
      const dx = p.ex - av.pos.x,
        dz = p.ez - av.pos.z;
      const l = Math.hypot(dx, dz);
      if (l > 0.15) ((b.mx = dx / l), (b.mz = dz / l));
      else p.evade = 0;
    } else if (p.hunt >= 0) {
      // closing in: to a step past it the way the beam goes (it reaches the rival first, then it)
      const o = this.ps[p.hunt];
      if (o.out || this.t > p.huntT || p.cd > 0.4) p.hunt = -1;
      else {
        const r = Math.max(this.lv.rin + 0.3, Math.hypot(o.av.pos.x, o.av.pos.z));
        const a = Math.atan2(o.av.pos.z, o.av.pos.x) + p.huntDir * (1.55 / r);
        const dx = Math.cos(a) * r - av.pos.x,
          dz = Math.sin(a) * r - av.pos.z;
        const l = Math.hypot(dx, dz);
        if (l > 0.3) ((b.mx = dx / l), (b.mz = dz / l));
      }
    }
    // ---- one to give: a rival a beam is about to reach (a pink it then can't jump, a cyan it pops up into)
    if (p.cd > 0 || p.wind > 0 || p.lunge > 0 || p.rec > 0 || !av.grounded || p.want >= 0 || b.jump || this.over) return;
    p.sCheck -= dt;
    if (p.sCheck > 0) return;
    p.sCheck = lerp(0.42, 0.14, sk) + this.rnd() * 0.14;
    const myPhi = Math.atan2(av.pos.z, av.pos.x);
    const noise = lerp(0.2, 0.03, sk);
    let best = -1,
      bv = 0,
      bx = 0,
      bz = 0;
    for (let j = 0; j < 4; j++) {
      const o = this.ps[j];
      if (j === i || o.out || o.inv > 0 || o.guard > 0 || o.stun > 0 || o.av.pos.y > 0.3) continue;
      // (where it will be once the wind-up is done, as well as it reads it)
      const lead = WIND * lerp(0.2, 1, sk);
      const px = o.av.pos.x + o.vx * lead,
        pz = o.av.pos.z + o.vz * lead;
      const dx = px - av.pos.x,
        dz = pz - av.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > REACH - 0.15 || d < 0.4) continue;
      const nx = dx / d,
        nz = dz / d;
      const hitAt = WIND + Math.max(0, d - CONTACT) / LUNGE_V;
      // (where the shove leaves it, on the disc)
      const push = KNOCK / this.lv.grip;
      let lx = px + nx * push,
        lz = pz + nz * push;
      const lr = Math.hypot(lx, lz) || 1;
      const lc = clamp(lr, this.lv.rin, R - 0.45);
      lx *= lc / lr;
      lz *= lc / lr;
      const phiL = Math.atan2(lz, lx);
      let v = 0.03;
      for (const arm of this.arms) {
        if (!this.exists(arm)) continue;
        const tk = this.tau(arm, phiL, sk > 0.4) + this.gauss() * noise;
        if (!this.litAt(arm, this.t + tk)) continue;
        const ta = tk - hitAt;
        const kind = this.kindAt(arm, this.t + tk);
        // (a pink: caught on the ground or just leaving it, it can't be over it in time)
        if (kind === 0 && ta > 0.25 && ta < SHOVE_STUN + 0.07) v = Math.max(v, 1);
        else if (kind === 1 && ta > 0.06 && ta < 0.21 * (30 / this.lv.grav)) v = Math.max(v, 0.75);
      }
      // (pushed into a crossing)
      if (this.trapAt(phiL) > 0.4 && this.trapAt(Math.atan2(pz, px)) < 0.3) v = Math.max(v, 0.45);
      // (its own pink while it is in the shove: it would have to let the shove go to jump it)
      for (const arm of this.arms) {
        if (!this.exists(arm)) continue;
        const tk = this.tau(arm, myPhi, true);
        if (tk < hitAt + this.lv.lead + 0.08 && this.litAt(arm, this.t + tk) && this.kindAt(arm, this.t + tk) === 0) v *= 1 - 0.85 * sk;
      }
      if (this.players[j].human) v *= lerp(0.6, 0.85, sk);
      // (a grudge)
      if (p.by === j && p.byT < 3) v *= 1.4;
      if (v > bv) ((bv = v), (best = j), (bx = nx), (bz = nz));
    }
    if (best >= 0 && this.rnd() < bv * lerp(0.3, 0.95, sk) * p.aggro) {
      p.want = best;
      p.wx = bx;
      p.wz = bz;
      p.hunt = -1;
      return;
    }
    // nobody in reach: now and then it goes after one a pink will reach soon (not into a crossing)
    if (p.hunt >= 0 || this.rnd() > lerp(0.2, 0.6, sk) * p.aggro) return;
    let hb = 4.6;
    for (let j = 0; j < 4; j++) {
      const o = this.ps[j];
      if (j === i || o.out || o.inv > 0) continue;
      const d = Math.hypot(o.av.pos.x - av.pos.x, o.av.pos.z - av.pos.z);
      if (d >= hb || d < REACH - 0.3) continue;
      const ophi = Math.atan2(o.av.pos.z, o.av.pos.x);
      let soon = 0;
      for (const arm of this.arms) {
        if (!this.exists(arm)) continue;
        const tk = this.tau(arm, ophi, true);
        if (tk > 0.7 && tk < 1.9 && this.litAt(arm, this.t + tk) && this.kindAt(arm, this.t + tk) === 0) soon = Math.sign(this.omega(arm)) || 1;
      }
      if (!soon || (sk > 0.5 && this.trapAt(ophi) > 0.3) || (this.players[j].human && this.rnd() > lerp(0.45, 0.7, sk))) continue;
      hb = d;
      p.hunt = j;
      p.huntDir = soon;
      p.huntT = this.t + 1.4;
    }
  }

  /** Bodies don't overlap: a gentle push apart. */
  private separate() {
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const a = this.ps[i],
          b = this.ps[j];
        if (a.out || b.out) continue;
        const dx = b.av.pos.x - a.av.pos.x,
          dz = b.av.pos.z - a.av.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.8 || d < 1e-4) continue;
        const k = (0.8 - d) / d / 2;
        a.av.pos.x -= dx * k;
        a.av.pos.z -= dz * k;
        b.av.pos.x += dx * k;
        b.av.pos.z += dz * k;
      }
    // (the rim and the core have the last word: a bump never leaves one past the edge, where no beam reaches)
    for (const p of this.ps) if (!p.out) this.hold(p.av);
  }

  /** The core and the rim hold a snark on the deck. */
  private hold(av: Avatar) {
    const rin = this.lv.rin;
    const r = Math.hypot(av.pos.x, av.pos.z);
    if (r < rin) {
      if (r < 1e-3) av.pos.x = rin;
      else av.pos.multiplyScalar(rin / r).setY(av.pos.y);
    } else if (r > R - 0.45) {
      const k = (R - 0.45) / r;
      av.pos.x *= k;
      av.pos.z *= k;
    }
  }

  idle(dt: number, phase: "card" | "count", k: number) {
    this.it += dt;
    const A = this.arms[0];
    A.prev = A.ang;
    if (phase === "card") {
      this.cam.orbit(this.v.set(0, 1.2, 0), -0.45 + k * 0.2, 18.5, 8.4);
      // a show sweep: the high beam passes over their heads
      A.g.visible = true;
      A.kind = 1;
      A.y = BEAM_Y[1];
      A.pow = 1;
      A.ang += 0.9 * dt;
      A.col.copy(COL[1]);
    } else {
      this.cam.to(PLAY_EYE, PLAY_AT, dt, 3.2);
      if (k < 0.3) {
        A.pow = Math.max(0, 1 - k / 0.3);
        A.ang += 0.9 * dt;
      } else {
        // charged at the start, just past you, low
        A.pow = 0;
        A.ang = A.prev = START_ANG;
        A.kind = 0;
        A.y = BEAM_Y[0];
        A.col.copy(COL[0]);
      }
    }
    this.cam.apply(dt);
    for (const p of this.ps) {
      p.av.face(0, dt, 4);
      p.av.physics(dt, 0, this.lv.grav);
      p.av.sync(dt);
    }
    // (the turntable waits for the start, its arrows unlit, pointing the way it will go)
    if (this.arena.spin) this.arena.arrows(this.bandEvs[0]?.dir ?? 1, false, false, this.it);
    this.paint(dt, this.it, phase === "count" ? k : 0);
    this.fx.update(dt);
  }

  update(dt: number, input: Input) {
    if (!this.started) {
      this.started = true;
      this.startHum();
      const jw = actWord(actsOf("laser").a ?? "jump"),
        sw = actWord(actsOf("laser").b ?? "shove");
      // (a touch screen's buttons say what they do: the hint names them, not a letter)
      this.say(T("JUMP THE PINK!", "跳过粉色光束！"), HEX[0], touchy() ? T(`${jw}: over pink · cyan: stay down · ${sw}: rivals`, `「${jw}」跳过粉色 · 青色：别跳 ·「${sw}」推对手`) : T("A to jump · cyan: stay down · B shoves", "A 键跳 · 青色：别跳 · B 推人"), 1.6, 50);
      if (this.lv.grav < 25) this.say(T("LOW GRAVITY!", "低重力！"), "#7fe0ff", T("JUMP EARLY · YOU FLOAT LONG", "早点跳 · 会飘很久"), 1.5, 50);
    }
    const playing = !this.over;
    if (playing) this.t += dt;
    else this.endT += dt;
    if (playing) this.runEvents();
    for (const a of this.arms) this.stepArm(a, dt);
    this.stepBand(dt, playing);
    this.meet();
    // (an AI's spot on the turntable rides round with it)
    if (this.lv.band && playing)
      for (const p of this.ps) {
        const cw = this.carry(p.tx, p.tz);
        if (!cw || p.out) continue;
        const c = Math.cos(cw * dt),
          sn = Math.sin(cw * dt),
          x = p.tx;
        p.tx = x * c - p.tz * sn;
        p.tz = x * sn + p.tz * c;
      }
    for (let i = 0; i < 4; i++) this.stepPlayer(i, dt, input, playing);
    if (playing) this.shoveHits();
    this.separate();
    if (playing) {
      this.checkHits(dt);
      if (this.left() <= 1 || this.t >= LIMIT) this.finish();
    }
    // the winner's moment
    if (this.over) {
      const wp = this.ps[this.over[0]];
      if (!wp.out) {
        this.cam.to(this.v.copy(wp.av.pos).add(this.v2.set(0, 6.2, 8.2)), this.v3.copy(wp.av.pos).add(this.v2.set(0, 2.3, -0.6)), dt, 2.2);
        if (Math.random() < dt * 6) this.fx.burst(this.v.copy(wp.av.pos).setY(2.6), 6, ["#ffd23f", "#ffffff", this.players[this.over[0]].color], { speed: 5, up: 6, size: 0.14, life: 1 });
      }
    } else {
      const h = this.ps[this.human];
      const ex = h && !h.out ? h.av.pos.x * 0.1 : 0,
        ez = h && !h.out ? h.av.pos.z * 0.06 : 0;
      this.cam.to(this.v.set(PLAY_EYE.x + ex, PLAY_EYE.y, PLAY_EYE.z + ez), this.v2.set(PLAY_AT.x + ex * 1.2, PLAY_AT.y, PLAY_AT.z + ez), dt, 2.5);
    }
    // the banners, the pops, the flash
    if (this.bans.length) {
      this.banT += dt;
      if (this.banT >= this.bans[0].d) ((this.banT = 0), this.bans.shift());
    }
    for (const q of this.pops) q.t += dt;
    if (this.pops.length && this.pops[0].t > 0.9) this.pops.shift();
    this.boomT += dt;
    const bk = Math.min(1, this.boomT / 0.34);
    this.boom.visible = bk < 1;
    if (bk < 1) {
      const r = 0.7 + 2.4 * (1 - Math.pow(1 - bk, 3));
      this.boom.scale.set(r, r, 1);
      this.boomM.opacity = (1 - bk) * 0.9;
    }
    this.flash = Math.max(0, this.flash - dt * 3.5);
    this.it += dt;
    this.paint(dt, this.it, 0);
    this.humStep();
    if (playing) {
      // the song speeds up with the beams; flat out for the last ten seconds and the last two
      music.rate(this.t > LIMIT - 10 || this.left() <= 2 ? 1.16 : 1 + clamp((this.base() - 1.2) * 0.07, 0, 0.12));
    }
    this.fx.update(dt);
    this.cam.apply(dt);
    for (const p of this.ps) {
      p.av.sync(dt);
      // (up in the air the sun's shadow slides aside: the patch under the feet stays dark, it shows the height)
      if (p.av.shadow && !p.av.grounded) (p.av.shadow.material as THREE.MeshBasicMaterial).opacity = 1;
    }
  }

  private finish() {
    this.over = this.rank();
    // (the host says FINISH!: no banner over it)
    this.bans.length = 0;
    const w = this.ps[this.over[0]];
    if (!w.out) {
      w.av.cheer(3);
      w.av.vy = 7;
      w.av.grounded = false;
      w.av.root.visible = true;
      this.fx.burst(this.v.copy(w.av.pos).setY(2), 50, ["#ffd23f", "#ffffff", this.players[this.over[0]].color, "#ff5fa2"], { speed: 7, up: 8, size: 0.18, life: 1.4 });
    }
    this.ps.forEach((p, i) => {
      if (!p.out && i !== this.over![0]) p.av.angry = true;
    });
  }

  /** The look of it all this frame: the arms, the floor's light, the core, the rim, the sparks. */
  private paint(dt: number, t: number, charge: number) {
    const u = this.ov.uniforms;
    const uA = u.uA.value as THREE.Vector4[],
      uC = u.uC.value as THREE.Color[],
      uW = u.uW.value as number[],
      uK = u.uK.value as number[];
    u.uT.value = t;
    this.arms.forEach((a, k) => {
      const show = a.pow > 0.005;
      a.g.visible = show || a === this.arms[0] || this.exists(a);
      a.beam.visible = show;
      a.g.position.y = a.y;
      a.g.rotation.y = -a.ang;
      const w = this.omega(a);
      const fl = 0.9 + 0.1 * Math.sin(t * 57 + k * 2);
      const p = a.pow * fl;
      a.m[0].color.copy(a.col).lerp(WHITE, 0.5).multiplyScalar(p);
      a.m[1].color.copy(a.col).multiplyScalar(p * 0.75);
      a.m[2].color.copy(a.col).multiplyScalar(p * 0.3);
      a.m[3].color.copy(a.col).multiplyScalar(p * 0.32);
      a.m[4].color.copy(a.col).multiplyScalar(p * 0.26);
      // the lens: lit with the beam, charging before the start
      const lensK = Math.max(a.pow, charge * (0.4 + 0.6 * Math.abs(Math.sin(t * 18))), this.exists(a) ? 0.25 : 0.12);
      a.m[5].color.copy(a.col).lerp(WHITE, 0.35).multiplyScalar(0.35 + 0.65 * lensK);
      a.m[6].color.copy(a.col).multiplyScalar(p * (a.kind === 0 ? 0.9 : 0.35));
      // (its shape with its height: one hot line down low, a ladder up high; the floor's light the same)
      const hi = clamp((a.y - BEAM_Y[0]) / (BEAM_Y[1] - BEAM_Y[0]), 0, 1);
      a.ladder.visible = hi > 0.5;
      a.core.visible = hi <= 0.5;
      a.m[7].color.copy(a.col).lerp(WHITE, 0.45).multiplyScalar(p * 0.95);
      uK[k] = hi;
      a.tip.scale.setScalar(0.5 + 0.15 * Math.sin(t * 40 + k));
      a.light.color.copy(a.col);
      a.light.intensity = 7 * a.pow;
      uA[k].set(a.ang, w >= 0 ? 1 : -1, Math.min(1.9, Math.max(0.55, Math.abs(w) * 0.85)), a.pow);
      uC[k].copy(a.col);
      uW[k] = a.revAt >= 0 && this.t >= a.revAt - 0.9 && Math.floor((a.revAt - this.t) * 12) % 2 === 0 ? 1 : 0;
      // sparks: the low beam scorches the floor and grinds the rim; the high one drips embers
      if (a.pow > 0.6 && dt > 0) {
        a.spark += dt * (a.kind === 0 ? 30 : 12);
        const cs = Math.cos(a.ang),
          sn = Math.sin(a.ang);
        while (a.spark >= 1) {
          a.spark -= 1;
          if (a.kind === 0) {
            const r = this.lv.rin + 0.1 + Math.random() * (R - this.lv.rin - 0.3);
            this.fx.burst(this.v.set(cs * r, 0.06, sn * r), 1, SPARK[0], { speed: 2.2, up: 3.4, gravity: 16, size: 0.09, life: 0.45, drag: 2 });
            if (Math.random() < 0.5) this.fx.burst(this.v.set(cs * R, 0.3, sn * R), 1, SPARK[0], { speed: 3, up: 2.5, gravity: 14, size: 0.1, life: 0.45, dir: this.v2.set(cs * 3, 0, sn * 3) });
          } else {
            const r = 1.2 + Math.random() * (R - 1.2);
            this.fx.burst(this.v.set(cs * r, a.y, sn * r), 1, SPARK[1], { speed: 0.8, up: 0, gravity: 6, size: 0.07, life: 0.55, drag: 2 });
          }
        }
      }
    });
    // the core: the rings take the arms' colours and spin with the speed
    const B = this.arms[1];
    const sp = this.started ? this.base() : 1;
    this.ringMats[0].color.copy(this.arms[0].col);
    this.ringMats[1].color.copy(this.exists(B) ? B.col : this.c0.set(this.lv.look.core.idle));
    this.rings[0].rotation.set(Math.PI / 2 + Math.sin(t * 0.7) * 0.5, t * sp * 1.4, 0);
    this.rings[1].rotation.set(t * sp * 1.1, 0.6, Math.PI / 3);
    this.rings[2].rotation.set(-t * sp * 0.8, t * 0.5, -Math.PI / 4);
    const pulse = 1 + Math.sin(t * 6) * 0.05 + charge * 0.2;
    this.orb.scale.setScalar(0.78 * pulse);
    this.halo.scale.setScalar(1.6 * pulse + Math.sin(t * 13) * 0.05);
    this.coreLight.intensity = 9 + Math.sin(t * 6) * 2 + charge * 14;
    // the rim's bulbs chase round, flash on a hit
    this.bulbFlash = Math.max(0, this.bulbFlash - dt);
    const NB = 40;
    const dirS = Math.sign(this.omega(this.arms[0])) || 1;
    for (let i = 0; i < NB; i++) {
      const on = Math.sin((i / NB) * TAU * 5 - t * 7 * dirS) > 0.2;
      if (this.bulbFlash > 0) this.c0.set(Math.floor(this.bulbFlash * 20) % 2 ? "#ffffff" : "#ff5fa2");
      else this.c0.set(on ? (i % 2 ? this.lv.look.bulbs.on : "#ffffff") : this.lv.look.bulbs.off);
      this.bulbs.setColorAt(i, this.c0);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
    this.arena.tick(t, dt, this.bandW);
  }

  // ---- the hum --------------------------------------------------------------------------------------

  private startHum() {
    const s = sound();
    if (!s) return;
    const { ac, bus } = s;
    const o1 = ac.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = 60;
    const o2 = ac.createOscillator();
    o2.type = "square";
    o2.frequency.value = 90.6;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 380;
    f.Q.value = 5;
    const g = ac.createGain();
    g.gain.value = 0;
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(bus);
    o1.start();
    o2.start();
    this.hum = { ac, o1, o2, f, g };
  }
  private humStep() {
    const h = this.hum;
    if (!h) return;
    const now = h.ac.currentTime;
    let near = 0,
      on = 0;
    const hp = this.ps[this.human];
    for (const a of this.arms) {
      on = Math.max(on, a.pow);
      if (hp && !hp.out && a.pow > 0.5) near = Math.max(near, clamp(1 - this.tau(a, Math.atan2(hp.av.pos.z, hp.av.pos.x), false) / 0.9, 0, 1));
    }
    if (!hp) near = 0.25;
    h.g.gain.setTargetAtTime(on * (0.03 + near * 0.12), now, 0.05);
    h.f.frequency.setTargetAtTime(300 + near * 1600, now, 0.05);
    h.o1.frequency.setTargetAtTime(48 + this.base() * 9, now, 0.2);
    h.o2.frequency.setTargetAtTime((48 + this.base() * 9) * 1.51, now, 0.2);
  }
  private stopHum() {
    const h = this.hum;
    if (!h) return;
    this.hum = null;
    try {
      h.o1.stop();
      h.o2.stop();
      h.g.disconnect();
    } catch {
      /* (already gone) */
    }
  }

  // ---- the HUD ----------------------------------------------------------------------------------

  view() {
    return this.w;
  }

  draw(g: CanvasRenderingContext2D, t: number) {
    const cam = this.w.camera;
    if (this.flash > 0) {
      g.save();
      g.globalAlpha = this.flash * 0.3;
      g.fillStyle = this.flashC;
      g.fillRect(0, 0, W, H);
      g.restore();
    }
    this.ps.forEach((p, i) => {
      if (p.out) return;
      const s = toScreen(p.av.head(this.v), cam);
      if (s.on) tag(g, this.players[i], s.x, s.y, p.inv > 0 ? 0.55 : 1);
      if (s.on && i === this.human && this.started && !this.over) this.bPip(g, p, s.x, s.y);
      // a shove winding up: a "!" in its colour over the tag, growing
      if (s.on && p.wind > 0) {
        const k = 1 - p.wind / WIND;
        shout(g, "!", s.x, s.y - 27 - k * 5, 22 + k * 14 + Math.sin(this.it * 40) * 2, this.players[i].color);
      }
    });
    this.cue(g, t);
    for (const q of this.pops) {
      const s = toScreen(this.v.set(q.x, q.y + q.t * 1.2, q.z), cam);
      if (!s.on) continue;
      // (never up under the clock)
      s.y = Math.max(s.y, 78);
      g.save();
      g.globalAlpha = clamp(1 - (q.t - 0.5) / 0.4, 0, 1);
      g.font = `900 ${(q.big ? 24 : 18) + Math.min(1, q.t * 8) * (q.big ? 8 : 4)}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineWidth = 5;
      g.lineJoin = "round";
      g.strokeStyle = "rgba(10,8,24,0.85)";
      g.strokeText(q.s, s.x, s.y);
      g.fillStyle = q.c;
      g.fillText(q.s, s.x, s.y);
      g.restore();
    }
    // the four panels, their hearts
    // (a crown on whoever has the most hearts, once someone has fewer)
    let most = 0,
      less = false;
    for (const p of this.ps) most = Math.max(most, p.out ? 0 : p.lives);
    this.lead.length = 0;
    for (let i = 0; i < 4; i++) {
      const p = this.ps[i];
      this.outs[i] = p.out;
      if (p.out || p.lives < most) less = true;
      else this.lead.push(i);
    }
    if (!less || !this.started) this.lead.length = 0;
    corners(g, this.players, NOVALS, { out: this.outs, lead: this.lead });
    this.ps.forEach((p, i) => {
      if (p.out) return;
      const [x, y] = cornerSpot(i);
      for (let h = 0; h < LIVES; h++) {
        const full = h < p.lives;
        const blink = !full && p.inv > 0 && Math.floor(p.inv * 10) % 2 === 0;
        heart(g, x + 148 + h * 27, y + 30, 10, full ? "#ff3d6e" : blink ? "#ffffff" : "rgba(255,255,255,0.12)");
      }
    });
    if (this.started) clock(g, LIMIT - this.t);
    this.legend(g);
    const b = this.bans[0];
    if (b) {
      const k = this.banT / b.d;
      banner(g, b.s, k, b.c, H * 0.3, b.size);
      if (b.sub) banner(g, b.sub, k, "#ffffff", H * 0.3 + b.size * 0.78, 24);
    }
  }

  /** Over your head when a beam is near: JUMP! for a pink one, STAY! for a cyan one. */
  private cue(g: CanvasRenderingContext2D, t: number) {
    const hp = this.ps[this.human];
    if (!hp || hp.out || !this.started || this.over) return;
    const phi = Math.atan2(hp.av.pos.z, hp.av.pos.x);
    const cw = this.carry(hp.av.pos.x, hp.av.pos.z);
    let best = 9,
      kind: Kind = 0;
    for (const a of this.arms) {
      if (!this.exists(a)) continue;
      const tk = this.tau(a, phi, true, cw);
      if (!this.litAt(a, this.t + tk)) continue;
      if (tk < best) ((best = tk), (kind = this.kindAt(a, this.t + tk)));
    }
    // (standing in a trap, far enough from the next pass to still get out: MOVE!)
    const trap = this.trapAt(phi) > 0.45 && best > 0.55;
    if (best > 1.15 && !trap) return;
    const s = toScreen(hp.av.head(this.v), this.w.camera);
    if (!s.on) return;
    const k = trap ? 1 : clamp((1.15 - best) / 0.35, 0, 1);
    const now = trap || (kind === 0 && best < this.lv.lead + 0.08);
    const sc = 1 + (now ? 0.18 + Math.sin(t * 30) * 0.05 : 0);
    const label = trap ? T("MOVE!", "快跑！") : kind === 0 ? T("JUMP!", "跳！") : T("STAY!", "别跳！");
    const bg = trap ? "#ffb000" : HEX[kind];
    g.save();
    g.globalAlpha = k;
    g.translate(s.x, s.y - 30);
    g.scale(sc, sc);
    g.font = `900 16px ${FONT}`;
    const w = g.measureText(label).width + 26;
    rr(g, -w / 2, -13, w, 26, 13);
    g.fillStyle = bg;
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = "#ffffff";
    g.stroke();
    text(g, label, 0, 1, 16, !trap && kind === 0 ? "#ffffff" : "#1a1206", "center", 900);
    // its little pointer
    g.beginPath();
    g.moveTo(-6, 12);
    g.lineTo(6, 12);
    g.lineTo(0, 19);
    g.closePath();
    g.fillStyle = bg;
    g.fill();
    g.restore();
  }

  /** Your B beside your tag: filling while the shove comes back, lit (and a pop) once it is ready. */
  private bPip(g: CanvasRenderingContext2D, p: P, x: number, y: number) {
    g.font = `800 14px ${FONT}`;
    const px = x + (g.measureText(short(this.players[this.human])).width + 16) / 2 + 15;
    const ready = p.cd <= 0 && p.wind <= 0 && p.lunge <= 0;
    const r = 11 + p.ready * 5;
    g.beginPath();
    g.arc(px, y, r, 0, TAU);
    g.fillStyle = "rgba(14,10,30,0.8)";
    g.fill();
    g.beginPath();
    if (ready) g.arc(px, y, r - 2.5, 0, TAU);
    else {
      g.moveTo(px, y);
      g.arc(px, y, r - 2.5, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(1 - p.cd / SHOVE_CD, 0, 1));
      g.closePath();
    }
    g.fillStyle = ready ? this.players[this.human].color : "rgba(255,255,255,0.26)";
    g.fill();
    g.beginPath();
    g.arc(px, y, r, 0, TAU);
    g.lineWidth = 2;
    g.strokeStyle = ready ? "#ffffff" : "rgba(255,255,255,0.3)";
    g.stroke();
    // (a touch screen's button shows the action, not a letter: the pip shows the same pictogram)
    const act = touchy() ? actsOf("laser").b : undefined;
    if (act) actIcon(g, act, px, y, 14 + p.ready * 4, ready ? "#ffffff" : "rgba(255,255,255,0.55)");
    else text(g, "B", px, y + 1, 12 + p.ready * 4, ready ? "#ffffff" : "rgba(255,255,255,0.55)", "center", 900);
  }

  /**
   * The key, bottom middle: the two beams by their shape (a solid low bar to hop, a ladder overhead to
   * stay under) as well as their colour, and the shove. A touch screen has the shove on its pad, so the
   * strip keeps the two beams, between the stick and the buttons; none once you are out there (the
   * fast-forward is).
   */
  private legend(g: CanvasRenderingContext2D) {
    const touch = HUD.thumbs;
    if (touch && this.humanOut()) return;
    const jump = touchy() ? actWord(actsOf("laser").a ?? "jump") : T("JUMP (A)", "跳 (A)");
    const items: [number, string][] = [
      [0, T(`LOW · ${jump}`, `低 · ${jump}`)],
      [1, T("HIGH · STAY DOWN", "高 · 别跳")],
    ];
    if (!touch) items.push([2, T("B · SHOVE", "B · 推人")]);
    const k = fpx(13) / 13;
    g.font = `800 ${13 * k}px ${FONT}`;
    const ws = items.map(([, s]) => g.measureText(s).width / k);
    const IW = 30,
      GAP = 22;
    const w = 28 + ws.reduce((a, b) => a + b + IW + 8, 0) + GAP * (items.length - 1);
    const cx = touch ? between(W / 2, w * k) : W / 2;
    // (a small screen: the strip grows from its bottom edge, so its words read and keep apart)
    grow(g, cx, H - 14, 13, () => {
      const y = H - 31;
      rr(g, cx - w / 2, y - 17, w, 34, 17);
      g.fillStyle = "rgba(12,9,28,0.78)";
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = "rgba(255,255,255,0.16)";
      g.stroke();
      let x = cx - w / 2 + 14;
      items.forEach(([kind, s], i) => {
        this.keyIcon(g, x, y, kind);
        text(g, s, x + IW + 8, y + 1, 13, "#ffffff", "left", 800);
        x += IW + 8 + ws[i] + GAP;
      });
    });
  }

  /** The key's pictograms, 30 wide: a dot hopping a solid low bar; a dot standing under a ladder; the shove's arrow. */
  private keyIcon(g: CanvasRenderingContext2D, x: number, y: number, kind: number) {
    g.save();
    g.lineCap = "round";
    g.lineJoin = "round";
    if (kind === 0) {
      g.strokeStyle = HEX[0];
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(x + 3, y + 8);
      g.lineTo(x + 27, y + 8);
      g.stroke();
      // (the hop: an arc over the bar, the dot at its top)
      g.strokeStyle = "rgba(255,255,255,0.6)";
      g.lineWidth = 1.6;
      g.setLineDash([2.5, 3]);
      g.beginPath();
      g.arc(x + 15, y + 4, 9, Math.PI * 1.08, Math.PI * 1.92);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(x + 15, y - 5, 3.6, 0, TAU);
      g.fill();
    } else if (kind === 1) {
      g.strokeStyle = HEX[1];
      g.lineWidth = 2;
      g.beginPath();
      for (const dy of [-10, -5]) (g.moveTo(x + 3, y + dy), g.lineTo(x + 27, y + dy));
      for (let i = 0; i < 4; i++) (g.moveTo(x + 6 + i * 6, y - 10), g.lineTo(x + 6 + i * 6, y - 5));
      g.stroke();
      // (staying down: the dot on the ground, under it)
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(x + 15, y + 5, 3.6, 0, TAU);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.6)";
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x + 5, y + 10);
      g.lineTo(x + 25, y + 10);
      g.stroke();
    } else actIcon(g, "shove", x + 15, y, 20, "#ffd23f");
    g.restore();
  }

  result() {
    return this.over;
  }

  /** Out already, only rivals left: the host plays the rest at triple speed. */
  humanOut() {
    return this.human >= 0 && this.ps[this.human].out && !this.over;
  }

  dispose() {
    this.stopHum();
    // (the fists' glow rides on the snark, out of the scene once it goes)
    for (const p of this.ps) (p.av.dispose(), p.fistM.dispose());
    disposeScene(this.w.scene);
    this.torusG.dispose();
    this.thinG.dispose();
    this.tubeG.dispose();
    this.ink.dispose();
    if (import.meta.env.DEV) delete (window as unknown as { __laser?: unknown }).__laser;
  }
}

/** The shove's floor arrow (pointing +z from the feet, as long as the reach); `k` grows it into its ink. */
function arrowGeo(k: number) {
  const s = new THREE.Shape();
  s.moveTo(-0.28 - k, -k);
  s.lineTo(0.28 + k, -k);
  s.lineTo(0.28 + k, 0.95 - k * 0.4);
  s.lineTo(0.62 + k * 1.8, 0.95 - k * 0.4);
  s.lineTo(0, 1.72 + k * 1.7);
  s.lineTo(-0.62 - k * 1.8, 0.95 - k * 0.4);
  s.lineTo(-0.28 - k, 0.95 - k * 0.4);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, REACH - 1.72);
  return g;
}

function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string) {
  g.beginPath();
  g.moveTo(x, y + s * 0.95);
  g.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.8, y - s * 1.25, x, y - s * 0.45);
  g.bezierCurveTo(x + s * 0.8, y - s * 1.25, x + s * 1.5, y - s * 0.1, x, y + s * 0.95);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "rgba(10,8,24,0.9)";
  g.stroke();
}

export const LASER: MiniDef = {
  key: "laser",
  title: "LASER SWEEP",
  titleZh: "激光扫荡",
  tag: "Jump the pink, duck the cyan",
  tagZh: "跳过粉色，躲过青色",
  help: "PINK beam low: JUMP it (A). CYAN beam high: stay down! B shoves a rival into a beam. Last one standing wins.",
  helpZh: "粉色光束低：按 A 跳过。青色光束高：别跳！B 把对手推进光束。最后站着的赢。",
  pad: ["left", "right", "up", "down", "a", "b"],
  tap: true,
  color: "#ff5fa2",
  song: "neon",
  ambience: "city-night",
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `laser-${l.key}`, song: l.song, ambience: l.ambience })),
  make: (players, rnd, variant) => new Laser(players, rnd, LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]),
};
export default LASER;
