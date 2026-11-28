import * as THREE from "three";
import { add, bands, box, glass, gloss, hull, lamp, matte, object, railing, rbox, steel, teak, type Parts } from "../scene/real/boats";
import { VILLA, SEA_Y } from "../scene/keys/plan";

/**
 * YOUR YACHT (the game, src/gta): a 26 m motor yacht moored at your villa's dock (plan.ts
 * VILLA.yacht), one you go aboard and sail.
 *
 *  - Aboard: E at the dock by its stern (or swimming up to its swim platform) puts you on the
 *    platform; steps up the transom to the aft deck, its sofas and table; through the open glass
 *    doors into the saloon (the U sofa, the dining table, the galley, the lower helm forward); the
 *    side decks along it to the foredeck's sunpad. Walked like any floor (`floorAt`, `blocked`: the
 *    rails, the saloon's walls and furniture, a step up of a stair's riser at most).
 *  - At the helm (F): it is yours to sail — throttle, astern, the rudder, a heavy hull that carries
 *    its way and turns slowly, the stern sliding out in a hard turn; the bow lifting with speed, a
 *    lean into the turn, a wake of foam behind. Only where the water is deep enough (the game's solid
 *    shape: a hole or a floor well under the surface); land, a quay, a pier's piles stop it.
 *  - F again: you stand up from the helm, the yacht drifting to a stop; E ashore where land is
 *    within a few steps (the dock, a quay, a beach), or into the sea where it can be swum.
 *
 * The model: a lofted hull in dark gunmetal over the antifouling, a white superstructure (the
 * saloon in dark glass, the flybridge on its roof under a hardtop on posts, the radar arch), teak
 * decks, steel rails, navigation lights, warm lights inside by night. Front +x, centred, y = 0 the
 * waterline; merged per material (a dozen draw calls).
 */

/** Length and beam of the hull (m), its main deck's height over the water at the stern. */
const L = 26,
  W = 6.4,
  TOP = 1.7;
/** The swim platform: its top over the water, how far aft of the transom it reaches. */
const PLAT_Y = 0.45,
  PLAT = 2.6;
/** The stair up the transom: from the platform, six risers of 0.2 m, |z| under this. */
const STAIR_HALF = 1.0,
  STAIR_RUN = 1.2;
/** The saloon: from S0 to S1 along, SW its half width (the side decks outside it). */
const S0 = -8.2,
  S1 = 5.4,
  SW = 2.35;
/** The saloon's ceiling over the deck, the flybridge's floor on its roof. */
const ROOF = 2.35;
/** Where you stand at the lower helm (the wheel forward of you). */
const HELM = { x: 3.15, z: 1.15 };
/** Top speed ahead and astern (m/s), thrust (m/s²). */
const VMAX = 13.3,
  ASTERN = 4,
  THRUST = 3.2;

/** The hull's half width at x along (the stations of the lofted hull), at the sheer. */
const STATIONS = hull(L, W, TOP, 1.5).st;
function halfWidth(x: number) {
  if (x <= STATIONS[0].x) return STATIONS[0].hw;
  for (let i = 1; i < STATIONS.length; i++) {
    const a = STATIONS[i - 1],
      b = STATIONS[i];
    if (x <= b.x) return a.hw + ((b.hw - a.hw) * (x - a.x)) / (b.x - a.x);
  }
  return 0;
}
/** The main deck's height over the water at x along (its sheer rises a little toward the bow). */
function deckY(x: number) {
  const t = Math.max(0, Math.min(1, (x + L / 2) / L));
  return TOP - 0.04 + 0.18 * t * t;
}

/** What stands on the decks and stops you (local boxes: x0, x1, z0, z1). */
const FURNITURE: [number, number, number, number][] = [
  // the aft deck: two sofas along the sides, the table between them
  [-12.4, -9.6, 2.0, 3.0],
  [-12.4, -9.6, -3.0, -2.0],
  [-11.7, -10.5, -0.55, 0.55],
  // the saloon: the U sofa and its table to port, the dining table to starboard, the galley's counter, the helm's console, the lounge seat forward
  [-7.4, -4.4, -2.3, -1.45],
  [-7.6, -7.0, -2.3, -0.5],
  [-6.5, -5.3, -1.05, -0.25],
  [-3.6, -1.6, 0.35, 1.35],
  [-3.2, 1.0, -2.3, -1.6],
  [3.9, 5.3, 0.3, 2.3],
  [3.6, 5.3, -2.3, -0.7],
  // the foredeck's sunpad
  [6.6, 9.6, -1.6, 1.6],
];

/** The saloon's glass: tinted dark from outside, seen through from inside (the strait, the city). */
let tintMat: THREE.Material | null = null;
function tint() {
  if (!tintMat) {
    tintMat = new THREE.MeshPhysicalMaterial({ color: "#1c2a36", roughness: 0.05, metalness: 0.25, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 });
    tintMat.userData.shared = true;
  }
  return tintMat;
}

/** The model (built once, shared by every copy: there is one). */
function model() {
  return object("yacht:yours", () => {
    const parts: Parts = new Map();
    const h = hull(L, W, TOP, 1.5);
    const [under, boot, topside] = bands(h.side, -0.05, 0.14);
    add(parts, matte("#1a2233", 0.75), under);
    add(parts, gloss("#c9a45a"), boot);
    add(parts, gloss("#222b37"), topside);
    add(parts, teak(), h.deck);
    const white = gloss("#f4f4f2"),
      dark = glass(),
      cream = matte("#ece5d6", 0.9),
      wood = teak(),
      chrome = steel(),
      black = matte("#15171c", 0.5),
      stone = matte("#f2f0ea", 0.35);
    // the hull's windows (the cabins under the deck): long dark strips along both sides
    for (const s of [-1, 1])
      for (const [x0, x1] of [
        [-7.5, -3.5],
        [-2.5, 1.5],
        [2.5, 5.5],
      ]) {
        const xm = (x0 + x1) / 2,
          hw = halfWidth(xm) * 0.955 + 0.02;
        add(parts, dark, rbox(x1 - x0, 0.32, 0.04, 0.015, xm, 0.78, s * hw));
      }
    // a steel rubbing strake along the sheer
    for (const s of [-1, 1])
      for (let i = 1; i < STATIONS.length - 2; i++) {
        const a = STATIONS[i],
          b = STATIONS[i + 1];
        const len = Math.hypot(b.x - a.x, b.hw - a.hw);
        const g = new THREE.BoxGeometry(len, 0.06, 0.05).rotateY(-s * Math.atan2(b.hw - a.hw, b.x - a.x));
        add(parts, chrome, g.translate((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.12, s * ((a.hw + b.hw) / 2 + 0.02)));
      }
    // the rails round the main deck (from the aft deck's corners to the bow)
    for (const s of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < STATIONS.length - 1; i++) {
        const st = STATIONS[i];
        pts.push(new THREE.Vector3(Math.max(st.x, -L / 2 + 0.15), st.y - 0.04, s * Math.max(0.05, st.hw - 0.1)));
      }
      pts.push(new THREE.Vector3(L / 2 - 0.35, deckY(L / 2), 0));
      railing(parts, pts, 0.85);
    }
    // the swim platform aft, the stair up the transom to the aft deck (white cheeks either side)
    add(parts, white, box(PLAT, 0.18, W - 0.8, -L / 2 - PLAT / 2, PLAT_Y - 0.18, 0));
    add(parts, wood, box(PLAT, 0.03, W - 0.9, -L / 2 - PLAT / 2, PLAT_Y - 0.01, 0));
    for (let k = 0; k < 6; k++) {
      const x0 = -L / 2 - STAIR_RUN + k * (STAIR_RUN / 6);
      const y1 = PLAT_Y + 0.2 * (k + 1);
      add(parts, wood, box(-L / 2 - x0 + 0.05, y1 - PLAT_Y, STAIR_HALF * 2, (x0 - L / 2) / 2 + 0.02, PLAT_Y, 0));
    }
    for (const s of [-1, 1]) add(parts, white, box(STAIR_RUN, deckY(-L / 2) - PLAT_Y + 0.45, 0.12, -L / 2 - STAIR_RUN / 2, PLAT_Y, s * (STAIR_HALF + 0.06)));
    // the underwater lights and the stern light
    add(parts, lamp("#4fd8ff", 2.2), box(0.04, 0.12, 0.6, -L / 2 - 0.02, -0.35, 1.6));
    add(parts, lamp("#4fd8ff", 2.2), box(0.04, 0.12, 0.6, -L / 2 - 0.02, -0.35, -1.6));
    // ---- the aft deck: sofas, the table, the saloon's overhang above with its downlights
    for (const s of [-1, 1]) {
      add(parts, cream, rbox(2.8, 0.42, 0.95, 0.08, -11, deckY(-11), s * 2.5));
      add(parts, cream, rbox(2.8, 0.45, 0.22, 0.06, -11, deckY(-11) + 0.42, s * 2.9));
    }
    add(parts, wood, box(1.2, 0.08, 1.1, -11.1, deckY(-11) + 0.66, 0));
    add(parts, chrome, new THREE.CylinderGeometry(0.06, 0.08, 0.66, 10).translate(-11.1, deckY(-11) + 0.33, 0));
    // ---- the saloon
    const f0 = deckY(S0),
      top = f0 + ROOF;
    // its roof (the flybridge's floor), reaching aft over the aft deck as a shade
    add(parts, white, rbox(S1 - S0 + 1.6, 0.18, SW * 2 + 0.6, 0.06, (S0 + S1) / 2 - 0.9, top, 0));
    for (let x = S0 - 1.2; x < S0 + 0.2; x += 0.7) for (const z of [-1.5, 0, 1.5]) add(parts, lamp("#fff1d8", 1.8), new THREE.CircleGeometry(0.06, 10).rotateX(Math.PI / 2).translate(x, top - 0.01, z));
    // the sides: white under the glass and over it, dark glass full length, slim white mullions
    for (const s of [-1, 1]) {
      const z = s * (SW - 0.05);
      add(parts, white, box(S1 - S0, 0.7, 0.1, (S0 + S1) / 2, f0, z));
      add(parts, white, box(S1 - S0, ROOF - 2.15, 0.1, (S0 + S1) / 2, f0 + 2.15, z));
      add(parts, tint(), box(S1 - S0 - 0.1, 1.45, 0.04, (S0 + S1) / 2, f0 + 0.7, z));
      for (let x = S0; x <= S1 + 0.01; x += (S1 - S0) / 6) add(parts, white, box(0.12, 1.45, 0.12, x, f0 + 0.7, z));
    }
    // the aft face: white panels either side of the open glass doors (slid aside), the header over them
    for (const s of [-1, 1]) {
      add(parts, white, box(0.1, ROOF, SW - 1.25, S0, f0, s * (1.25 + (SW - 1.25) / 2)));
      add(parts, tint(), box(0.04, 2.05, 1.15, S0 + 0.12, f0 + 0.05, s * (1.25 + 0.55)));
    }
    add(parts, white, box(0.1, ROOF - 2.15, 2.5, S0, f0 + 2.15, 0));
    // the front: a white base, the raked windscreen over it
    add(parts, white, box(0.1, 1.0, SW * 2, S1, f0, 0));
    {
      const rake = new THREE.BoxGeometry(0.05, Math.hypot(ROOF - 1.0, 0.8), SW * 2 - 0.1).rotateZ(Math.atan2(0.8, ROOF - 1.0));
      add(parts, tint(), rake.translate(S1 - 0.4, f0 + 1.0 + (ROOF - 1.0) / 2, 0));
    }
    // inside: the U sofa and its table (port, aft), the dining table and chairs (starboard), the galley, the helm, the lounge seat
    add(parts, cream, rbox(3.0, 0.45, 0.85, 0.08, -5.9, f0, -1.87));
    add(parts, cream, rbox(3.0, 0.5, 0.2, 0.06, -5.9, f0 + 0.45, -2.2));
    add(parts, cream, rbox(0.6, 0.45, 1.8, 0.08, -7.3, f0, -1.4));
    add(parts, wood, box(1.2, 0.4, 0.8, -5.9, f0, -0.65));
    add(parts, wood, box(2.0, 0.06, 1.0, -2.6, f0 + 0.74, 0.85));
    add(parts, chrome, new THREE.CylinderGeometry(0.05, 0.12, 0.74, 10).translate(-2.6, f0 + 0.37, 0.85));
    for (const [x, z] of [
      [-3.2, 0.1],
      [-2.0, 0.1],
      [-3.2, 1.6],
      [-2.0, 1.6],
    ])
      add(parts, cream, rbox(0.45, 0.48, 0.45, 0.06, x, f0, z));
    add(parts, white, box(4.2, 0.92, 0.7, -1.1, f0, -1.95));
    add(parts, stone, box(4.25, 0.04, 0.75, -1.1, f0 + 0.92, -1.95));
    add(parts, black, box(0.6, 0.02, 0.4, -0.2, f0 + 0.96, -1.95));
    for (const x of [-2.4, -1.6, -0.8]) add(parts, chrome, new THREE.CylinderGeometry(0.17, 0.05, 0.7, 10).translate(x, f0 + 0.35, -1.35));
    // the lower helm: its console with two screens, the wheel, the captain's chair
    add(parts, black, rbox(1.4, 1.0, 2.0, 0.08, 4.6, f0, 1.3));
    add(parts, lamp("#6fd6ff", 0.9), box(0.03, 0.38, 0.6, 4.05, f0 + 1.0, 0.9).rotateZ(0).translate(0, 0, 0));
    add(parts, lamp("#6fd6ff", 0.9), box(0.03, 0.38, 0.6, 4.05, f0 + 1.0, 1.7));
    add(parts, chrome, new THREE.TorusGeometry(0.24, 0.025, 8, 24).rotateY(Math.PI / 2).rotateZ(0.5).translate(3.95, f0 + 1.15, HELM.z));
    add(parts, cream, rbox(0.6, 0.55, 0.6, 0.1, HELM.x - 0.35, f0 + 0.1, HELM.z));
    add(parts, cream, rbox(0.12, 0.7, 0.6, 0.05, HELM.x - 0.68, f0 + 0.6, HELM.z));
    add(parts, chrome, new THREE.CylinderGeometry(0.06, 0.18, 0.12, 10).translate(HELM.x - 0.35, f0 + 0.04, HELM.z));
    add(parts, cream, rbox(1.6, 0.45, 1.5, 0.08, 4.45, f0, -1.5));
    // the ceiling: pale panels under the roof (lit by its lights)
    add(parts, matte("#efece6", 0.9), box(S1 - S0 - 0.3, 0.03, SW * 2 - 0.25, (S0 + S1) / 2, top - 0.05, 0));
    // the ceiling's lights (warm; bright by night)
    for (let x = S0 + 1; x < S1 - 0.6; x += 1.6) for (const z of [-1.1, 1.1]) add(parts, lamp("#ffe2b0", 1.4), new THREE.CircleGeometry(0.07, 10).rotateX(Math.PI / 2).translate(x, top - 0.06, z));
    // ---- the flybridge on the roof
    const fly = top + 0.18;
    add(parts, white, rbox(1.3, 1.0, 2.8, 0.1, 2.2, fly, 0));
    add(parts, dark, box(0.05, 0.4, 2.6, 2.95, fly + 0.9, 0).rotateZ(0));
    add(parts, chrome, new THREE.TorusGeometry(0.22, 0.022, 8, 24).rotateY(Math.PI / 2).rotateZ(0.5).translate(1.5, fly + 1.05, 0.6));
    add(parts, lamp("#6fd6ff", 0.9), box(0.03, 0.3, 0.9, 1.53, fly + 1.0, -0.2));
    add(parts, cream, rbox(3.2, 0.42, 0.9, 0.08, -0.8, fly, 1.85));
    add(parts, cream, rbox(0.9, 0.42, 2.8, 0.08, -2.0, fly, 0.9));
    add(parts, wood, box(1.4, 0.06, 0.9, -0.6, fly + 0.66, 0.9));
    for (const z of [-1.0, 1.0]) add(parts, cream, rbox(1.9, 0.22, 1.5, 0.1, -6.1, fly, z * 1.05));
    // the hardtop on its four posts, the radar arch, the dome and the mast's lights
    for (const [x, z] of [
      [2.4, -2.1],
      [2.4, 2.1],
      [-3.0, -2.1],
      [-3.0, 2.1],
    ])
      add(parts, white, new THREE.CylinderGeometry(0.07, 0.07, 2.2, 10).translate(x, fly + 1.1, z));
    add(parts, white, rbox(6.4, 0.16, 4.9, 0.08, -0.3, fly + 2.2, 0));
    add(parts, matte("#c8c8c4", 0.6), rbox(0.25, 0.9, 3.2, 0.08, -2.2, fly + 2.36, 0));
    add(parts, white, new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(-2.2, fly + 3.26, 0.9));
    add(parts, chrome, new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6).translate(-2.2, fly + 3.9, -0.9));
    add(parts, lamp("#ffffff", 2.4), new THREE.SphereGeometry(0.06, 8, 6).translate(-2.2, fly + 4.58, -0.9));
    // the flybridge's rails
    for (const s of [-1, 1]) railing(parts, [new THREE.Vector3(-7.3, fly, s * (SW + 0.15)), new THREE.Vector3(-3.5, fly, s * (SW + 0.15)), new THREE.Vector3(1.0, fly, s * (SW + 0.15)), new THREE.Vector3(3.6, fly, s * (SW - 0.4))], 0.9);
    railing(parts, [new THREE.Vector3(-7.3, fly, -(SW + 0.15)), new THREE.Vector3(-7.3, fly, SW + 0.15)], 0.9);
    // ---- the foredeck: the sunpad, the windlass, the bow light; the navigation lights by the windscreen
    add(parts, cream, rbox(3.0, 0.24, 3.2, 0.1, 8.1, deckY(8), 0));
    add(parts, chrome, new THREE.CylinderGeometry(0.16, 0.16, 0.3, 12).rotateX(Math.PI / 2).translate(11.2, deckY(11.2) + 0.2, 0));
    add(parts, lamp("#fff6e0", 2.4), new THREE.SphereGeometry(0.06, 8, 6).translate(L / 2 - 0.4, deckY(L / 2) + 0.3, 0));
    add(parts, lamp("#ff3030", 2.4), box(0.2, 0.12, 0.05, S1 - 0.2, f0 + 1.1, -(SW + 0.03)));
    add(parts, lamp("#30ff60", 2.4), box(0.2, 0.12, 0.05, S1 - 0.2, f0 + 1.1, SW + 0.03));
    return parts;
  });
}

/** A soft round dot (the wake's foam). */
let foamTex: THREE.Texture | null = null;
function foam() {
  if (foamTex) return foamTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,0.9)");
  r.addColorStop(0.5, "rgba(255,255,255,0.45)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return (foamTex = new THREE.CanvasTexture(c));
}

const PUFFS = 90;

export interface BoatControls {
  throttle: number;
  brake: number;
  steer: number;
}

export class Yacht {
  /** The yacht's pose (at the waterline, turned by its heading); its body pitches, rolls and bobs in it. */
  readonly group = new THREE.Group();
  private body: THREE.Group;
  /** The wake's foam on the water (world coordinates). */
  readonly wake: THREE.InstancedMesh;
  private puffs: { x: number; z: number; vx: number; vz: number; age: number; life: number; s0: number; s1: number }[] = [];
  private puffT = 0;
  x = VILLA.yacht.x;
  z = VILLA.yacht.z;
  yaw = VILLA.yacht.yaw;
  /** Speed ahead (m/s, negative astern), the stern's slide sideways, the turn rate (rad/s). */
  v = 0;
  side = 0;
  rate = 0;
  /** The engines (0…1, for the sound), what the throttle asks. */
  rpm = 0;
  throttle = 0;
  /** Someone at the helm. */
  helm = false;
  /** Into something this frame: how fast; and how many times so far (the tests count them). */
  hit: number | null = null;
  bumps = 0;
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  static readonly LENGTH = L;

  constructor() {
    this.body = model();
    this.body.traverse((o) => (o.userData.noField = true));
    this.group.add(this.body);
    this.group.name = "gta:yacht";
    this.wake = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: foam(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), PUFFS);
    this.wake.frustumCulled = false;
    this.wake.userData.noField = true;
    this.wake.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS * 3), 3);
    for (let i = 0; i < PUFFS; i++) this.wake.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    this.berth();
  }

  /** Back at its berth, still. */
  berth() {
    const Y = VILLA.yacht;
    this.x = Y.x;
    this.z = Y.z;
    this.yaw = Y.yaw;
    this.v = this.side = this.rate = 0;
    this.pose();
  }

  /** The dock's spot where you step aboard at the berth (plan.ts VILLA.yacht.board). */
  get dock() {
    return VILLA.yacht.board;
  }

  get speed() {
    return Math.abs(this.v);
  }

  /** At its berth (moored, within a few metres of it). */
  get moored() {
    return Math.hypot(this.x - VILLA.yacht.x, this.z - VILLA.yacht.z) < 4 && this.speed < 0.5;
  }

  /** World (x, z) to the yacht's own frame (along: +x to the bow; across: +z to starboard). */
  local(x: number, z: number): [number, number] {
    const dx = x - this.x,
      dz = z - this.z;
    const c = Math.cos(this.yaw),
      s = Math.sin(this.yaw);
    return [dx * c - dz * s, dx * s + dz * c];
  }
  world(lx: number, lz: number): [number, number] {
    const c = Math.cos(this.yaw),
      s = Math.sin(this.yaw);
    return [this.x + lx * c + lz * s, this.z - lx * s + lz * c];
  }

  /** The floor aboard at local (lx, lz) over the water, or null off the yacht. */
  private floorLocal(lx: number, lz: number) {
    const az = Math.abs(lz);
    // the swim platform, and the stair up the transom in its middle
    if (lx < -L / 2 && lx > -L / 2 - PLAT && az < W / 2 - 0.45) {
      if (lx > -L / 2 - STAIR_RUN && az < STAIR_HALF) return PLAT_Y + 0.2 * Math.min(6, Math.floor((lx + L / 2 + STAIR_RUN) / (STAIR_RUN / 6)) + 1);
      return PLAT_Y;
    }
    if (lx >= -L / 2 && lx < L / 2 - 0.6 && az < halfWidth(lx) - 0.3) return deckY(lx);
    return null;
  }

  /** On foot aboard: the floor's height at world (x, z), or null off the yacht. */
  floorAt(x: number, z: number) {
    const [lx, lz] = this.local(x, z);
    const f = this.floorLocal(lx, lz);
    return f === null ? null : SEA_Y + f;
  }

  /** Is world (x, z) over the yacht at all (its hull, its platform)? */
  over(x: number, z: number, m = 0) {
    const [lx, lz] = this.local(x, z);
    return lx > -L / 2 - PLAT - m && lx < L / 2 + m && Math.abs(lz) < Math.max(halfWidth(Math.max(-L / 2, lx)), W / 2 - 0.4) + m;
  }

  /** On foot aboard, from a floor of `floor`: is (x, z) out of reach (off the deck, a wall, a seat, a step up too high)? */
  blocked(x: number, z: number, floor: number) {
    const [lx, lz] = this.local(x, z);
    const f = this.floorLocal(lx, lz);
    if (f === null) return true;
    if (SEA_Y + f > floor + 0.45) return true;
    const az = Math.abs(lz);
    // the saloon's walls: its sides, the aft face either side of the doors, the front
    if (lx > S0 - 0.12 && lx < S1 + 0.05) {
      if (az > SW - 0.22 && az < SW + 0.08) return true;
      if (lx < S0 + 0.18 && az > 1.15 && az < SW + 0.08) return true;
      if (lx > S1 - 0.45 && az < SW) return true;
    }
    for (const [x0, x1, z0, z1] of FURNITURE) if (lx > x0 - 0.2 && lx < x1 + 0.2 && lz > z0 - 0.2 && lz < z1 + 0.2) return true;
    return false;
  }

  /** Where you stand at the helm (world), and the way it faces. */
  helmSpot() {
    const [x, z] = this.world(HELM.x, HELM.z);
    return { x, z, y: SEA_Y + deckY(HELM.x), facing: this.yaw - Math.PI / 2 };
  }

  /** The swim platform's middle (world), and where you stand on it coming aboard. */
  platform() {
    const [x, z] = this.world(-L / 2 - PLAT * 0.55, -(STAIR_HALF + 0.9));
    return { x, z, y: SEA_Y + PLAT_Y, facing: this.yaw - Math.PI / 2 };
  }

  /** Inside the saloon (under its roof) at world (x, z). */
  inSaloon(x: number, z: number) {
    const [lx, lz] = this.local(x, z);
    return lx > S0 && lx < S1 && Math.abs(lz) < SW;
  }

  /**
   * For the camera on foot aboard: what is a wall to it. In the saloon, everything outside it (the
   * camera stays under its roof, looking round the room); outside, the saloon itself.
   */
  camWall(x: number, z: number, inside: boolean) {
    return inside ? !this.inSaloon(x, z) : this.inSaloon(x, z);
  }

  /** Near enough the helm to take it. */
  atHelm(x: number, z: number) {
    const [lx, lz] = this.local(x, z);
    return Math.hypot(lx - HELM.x, lz - HELM.z) < 1.3;
  }

  /**
   * One step at the helm (or adrift: no hand on it). `water(x, z)`: deep enough there for the hull.
   * Returns the yacht's pose moved; `hit` says how hard it ran into something.
   */
  update(dt: number, ctl: BoatControls | null, water: (x: number, z: number) => boolean) {
    this.t += dt;
    this.hit = null;
    const thr = ctl ? ctl.throttle : 0,
      brk = ctl ? ctl.brake : 0,
      steer = ctl ? ctl.steer : 0;
    this.throttle = thr;
    // ahead and astern: the screws' thrust, the water's drag (heavier the faster); adrift, it carries its way
    let acc = thr * THRUST - (brk > 0 ? (this.v > 0.4 ? brk * 4.2 : brk * 1.8) : 0);
    acc -= this.v * (0.08 + Math.abs(this.v) * 0.012) * (ctl ? 1 : 1.6);
    const was = this.v;
    this.v = Math.max(-ASTERN, Math.min(VMAX, this.v + acc * dt));
    // (adrift and slow: still)
    if (!ctl && Math.abs(this.v) < 0.05) this.v = 0;
    // the rudder: a turn rate that grows with the way on her (the bow thruster turns her slowly at rest)
    const auth = Math.max(0.35, Math.min(1, Math.abs(this.v) / 5));
    const want = -steer * 0.34 * auth * (this.v < -0.2 ? -1 : 1);
    this.rate += (want - this.rate) * Math.min(1, dt * 1.3);
    // in a hard turn the stern slides out
    this.side += (this.rate * this.v * 0.22 - this.side) * Math.min(1, dt * 1.1);
    this.rpm += (Math.min(1, 0.1 + thr * 0.55 + brk * 0.25 + Math.abs(this.v) / VMAX * 0.3) - this.rpm) * Math.min(1, dt * 2.5);
    // move, then look along the hull's outline: anything not deep water stops her where she was
    const px = this.x,
      pz = this.z,
      pyaw = this.yaw;
    /** Try a move (the turn, the way ahead, the slide): true when the hull is clear after it. */
    const tryMove = (turn: number, ahead: number, slide: number) => {
      this.yaw = pyaw + turn * dt;
      const c = Math.cos(this.yaw),
        s = Math.sin(this.yaw);
      this.x = px + (c * ahead + s * slide) * dt;
      this.z = pz + (-s * ahead + c * slide) * dt;
      return this.clear(water);
    };
    // the full move; else along a wall she touches (no slide, then no turn: she glides along it, a
    // scrape); else she stops where she was, a knock
    if (tryMove(this.rate, this.v, this.side)) {
      // clear
    } else if (tryMove(this.rate, this.v * 0.9, 0) || tryMove(0, this.v * 0.85, 0)) {
      this.side = 0;
      this.v *= 1 - Math.min(1, dt * 1.5);
    } else if (tryMove(this.rate * 0.5, 0, 0)) {
      // (head on into it: she stops, a knock felt)
      if (Math.abs(this.v) > 1.5) {
        this.hit = Math.abs(this.v);
        this.bumps++;
      }
      this.side = 0;
      this.v *= -0.1;
    } else {
      this.x = px;
      this.z = pz;
      this.yaw = pyaw;
      this.hit = Math.hypot(this.v, this.side);
      if (this.hit > 0.5) this.bumps++;
      this.v *= -0.15;
      this.side = 0;
      this.rate *= 0.3;
    }
    this.pose((this.v - was) / Math.max(dt, 1e-3));
    this.stepWake(dt);
  }

  /** The hull's outline (the bow, the shoulders, the sides, the platform's corners) all over deep water. */
  private clear(water: (x: number, z: number) => boolean) {
    const pts: [number, number][] = [[L / 2 - 0.4, 0]];
    for (const lx of [9, 4, -2, -8, -12.6]) {
      const hw = halfWidth(lx) - 0.1;
      pts.push([lx, hw], [lx, -hw]);
    }
    pts.push([-L / 2 - PLAT + 0.2, W / 2 - 0.5], [-L / 2 - PLAT + 0.2, -(W / 2 - 0.5)]);
    for (const [lx, lz] of pts) {
      const [x, z] = this.world(lx, lz);
      if (!water(x, z)) return false;
    }
    return true;
  }

  private pose(accel = 0) {
    this.group.position.set(this.x, SEA_Y, this.z);
    this.group.rotation.y = this.yaw;
    // the bow lifts with her speed (and as she pushes on), a lean into the turn, the swell under her
    const k = Math.max(0, this.v) / VMAX;
    const pitch = k * 0.03 + Math.max(-0.01, Math.min(0.015, accel * 0.004));
    const roll = Math.max(-0.08, Math.min(0.08, -this.rate * Math.abs(this.v) * 0.012));
    const t = this.t;
    this.body.rotation.set(roll + 0.006 * Math.sin(t * 0.9 + 1), 0, pitch + 0.004 * Math.sin(t * 0.7));
    this.body.position.y = 0.04 * Math.sin(t * 1.1) + 0.02 * Math.sin(t * 1.7 + 1) + k * 0.12;
  }

  /** The wake: foam thrown off the stern's quarters and the bow's shoulders, spreading and fading. */
  private stepWake(dt: number) {
    const sp = Math.abs(this.v);
    if (sp > 1.0) {
      this.puffT -= dt * (0.6 + sp / 4);
      while (this.puffT <= 0) {
        this.puffT += 0.09;
        const c = Math.cos(this.yaw),
          s = Math.sin(this.yaw);
        const back = Math.sign(this.v) || 1;
        for (const side of [-1, 1]) {
          // (the stern's quarters: the screws' wash; the bow's shoulders when fast: its waves)
          const spots: [number, number, number][] = [[back > 0 ? -L / 2 - 0.4 : L / 2 - 1, side * (W / 2 - 1.1), 1.2 + sp * 0.12]];
          if (sp > 5 && back > 0) spots.push([L / 2 - 5, side * (halfWidth(L / 2 - 5) + 0.1), 0.9 + sp * 0.06]);
          for (const [lx, lz, s0] of spots) {
            const [x, z] = this.world(lx, lz);
            // (out sideways, a little back: the V of a wake)
            const ox = s * side,
              oz = c * side;
            const p = this.puffs.length < PUFFS ? (this.puffs.push({ x, z, vx: 0, vz: 0, age: 0, life: 1, s0: 1, s1: 1 }), this.puffs[this.puffs.length - 1]) : this.puffs.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
            p.x = x;
            p.z = z;
            p.vx = ox * (0.6 + sp * 0.08) - c * back * sp * 0.15;
            p.vz = oz * (0.6 + sp * 0.08) + s * back * sp * 0.15;
            p.age = 0;
            p.life = 2.6 + Math.random() * 1.2;
            p.s0 = s0;
            p.s1 = s0 * 3 + sp * 0.25;
          }
        }
      }
    }
    let i = 0;
    for (const p of this.puffs) {
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        this.wake.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        i++;
        continue;
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.vx *= 1 - dt * 0.6;
      p.vz *= 1 - dt * 0.6;
      const sz = p.s0 + (p.s1 - p.s0) * Math.sqrt(k);
      this.m.compose(this.s.set(p.x, SEA_Y + 0.04, p.z), this.q.identity(), this.s.clone().set(sz, 1, sz));
      this.wake.setMatrixAt(i, this.m);
      const a = (1 - k) * (1 - k) * 0.55;
      this.wake.setColorAt(i, this.c.setRGB(a, a, a));
      i++;
    }
    for (; i < PUFFS; i++) this.wake.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    this.wake.instanceMatrix.needsUpdate = true;
    if (this.wake.instanceColor) this.wake.instanceColor.needsUpdate = true;
  }

  /** Adrift (no one at the helm): the wake still fades, the swell still moves her. */
  idle(dt: number, water: (x: number, z: number) => boolean) {
    if (this.speed > 0.01 || this.puffs.some((p) => p.age < p.life)) this.update(dt, null, water);
    else {
      this.t += dt;
      this.pose();
    }
  }
}
