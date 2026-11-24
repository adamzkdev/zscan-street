import * as THREE from "three";
import { box, bodyShape, CHROME, cyl, GLASS, GLASS_CLEAR, Kit, LAMP, LAMPS, paint, profile, rbox, T, TRIM, wheel, WHEEL, wheelGeometry, type Slot } from "./carkit";

/**
 * The street's vehicles, realistic (no more voxels): every car is a body of rounded panels — a tub
 * extruded from its side profile with the wheel arches cut out, a cabin leaning in toward the roof,
 * flush dark glass, bumpers, grille, lamps, mirrors, door seams and handles — in a clear-coated
 * paint, on real wheels (tyre, alloy, hub) that turn and steer.
 *
 * The street's convention as before: the front points to +x, the passenger side is +z, the footprint
 * centred on the origin, the ground at y = 0, the lengths and widths of the voxel models they
 * replace (lanes, collisions, riders and doors keep working).
 *
 *   carObject(kind, { paint, accent, … }) → THREE.Group (its body in a child named "body", its wheels
 *   as pivots named "wheel": `spinWheels(group, metres)` rolls them; `src/gta/vehicle.ts` steers them)
 */

export type CarKind = "sedan" | "taxi" | "police" | "limo" | "sports" | "gt" | "convertible" | "suv" | "pickup" | "van" | "ambulance" | "truck";

type Form = "saloon" | "fastback" | "wagon" | "open" | "pickup" | "van";

/** A car's shape (metres): see `carBody`. */
export interface CarDef {
  form: Form;
  L: number;
  W: number;
  H: number;
  /** Ground clearance, wheel radius, tyre width, the axles' x (rear, front). */
  clear: number;
  wr: number;
  tw: number;
  ax: [number, number];
  /** The beltline (top of the doors), the bonnet's height at the nose, the boot's at the tail. */
  belt: number;
  nose: number;
  tail: number;
  /** The windscreen's base (x), the rear window's base, the roof's flat run (front x, back x). */
  cowl: number;
  deck: number;
  roof: [number, number];
  /** The cabin's lean (m each side at the roof), the taper toward the ends seen from above. */
  tumble: number;
  plan: number;
  bevel: number;
  wheel: "alloy" | "steel" | "sport" | "truck";
}

const D = (o: Omit<CarDef, "bevel" | "plan" | "tumble" | "tw" | "wheel"> & Partial<CarDef>): CarDef => ({ bevel: 0.1, plan: 0.07, tumble: 0.13, tw: 0.22, wheel: "alloy", ...o });

/** Every kind's shape, at the voxel models' sizes (L × W). */
export const CARS: Record<Exclude<CarKind, "truck">, CarDef> = {
  sedan: D({ form: "saloon", L: 4.0, W: 1.8, H: 1.42, clear: 0.18, wr: 0.33, ax: [-1.3, 1.24], belt: 0.88, nose: 0.7, tail: 0.9, cowl: 0.62, deck: -1.05, roof: [0.06, -0.62], tumble: 0.16 }),
  taxi: D({ form: "saloon", L: 4.5, W: 1.8, H: 1.5, clear: 0.19, wr: 0.31, ax: [-1.46, 1.42], belt: 0.93, nose: 0.76, tail: 0.95, cowl: 0.78, deck: -1.26, roof: [0.16, -0.78], wheel: "steel" }),
  police: D({ form: "saloon", L: 4.33, W: 1.8, H: 1.47, clear: 0.19, wr: 0.32, ax: [-1.4, 1.36], belt: 0.93, nose: 0.75, tail: 0.95, cowl: 0.72, deck: -1.18, roof: [0.12, -0.72], wheel: "steel" }),
  limo: D({ form: "saloon", L: 7.6, W: 1.95, H: 1.5, clear: 0.18, wr: 0.33, ax: [-2.85, 2.82], belt: 0.95, nose: 0.78, tail: 0.96, cowl: 1.6, deck: -2.55, roof: [0.95, -2.05], plan: 0.045 }),
  sports: D({ form: "fastback", L: 4.33, W: 1.85, H: 1.22, clear: 0.13, wr: 0.32, tw: 0.26, ax: [-1.36, 1.32], belt: 0.8, nose: 0.62, tail: 0.88, cowl: 0.36, deck: -1.6, roof: [-0.12, -0.55], tumble: 0.17, plan: 0.11, wheel: "sport" }),
  gt: D({ form: "fastback", L: 4.5, W: 1.98, H: 1.18, clear: 0.12, wr: 0.33, tw: 0.28, ax: [-1.44, 1.4], belt: 0.8, nose: 0.6, tail: 0.9, cowl: 0.42, deck: -1.62, roof: [0.0, -0.58], tumble: 0.18, plan: 0.12, wheel: "sport" }),
  convertible: D({ form: "open", L: 4.17, W: 1.83, H: 1.22, clear: 0.16, wr: 0.32, tw: 0.24, ax: [-1.32, 1.3], belt: 0.84, nose: 0.68, tail: 0.88, cowl: 0.5, deck: -0.85, roof: [0.4, -0.6], plan: 0.09, wheel: "sport" }),
  suv: D({ form: "wagon", L: 4.5, W: 2.0, H: 1.78, clear: 0.27, wr: 0.38, tw: 0.26, ax: [-1.38, 1.38], belt: 1.1, nose: 0.98, tail: 1.08, cowl: 0.92, deck: -2.18, roof: [0.38, -2.02], tumble: 0.1, plan: 0.05 }),
  pickup: D({ form: "pickup", L: 5.0, W: 2.0, H: 1.86, clear: 0.3, wr: 0.39, tw: 0.27, ax: [-1.7, 1.5], belt: 1.08, nose: 1.0, tail: 1.06, cowl: 1.12, deck: -0.32, roof: [0.78, -0.24], tumble: 0.09, plan: 0.05, wheel: "steel" }),
  van: D({ form: "van", L: 5.17, W: 2.0, H: 2.42, clear: 0.2, wr: 0.36, tw: 0.24, ax: [-1.78, 1.62], belt: 1.05, nose: 0.96, tail: 1.05, cowl: 1.92, deck: -2.55, roof: [1.25, -2.5], tumble: 0.05, plan: 0.04, wheel: "steel" }),
  ambulance: D({ form: "van", L: 5.33, W: 2.0, H: 2.75, clear: 0.22, wr: 0.37, tw: 0.25, ax: [-1.85, 1.7], belt: 1.08, nose: 1.0, tail: 1.08, cowl: 2.02, deck: -2.64, roof: [1.4, -2.6], tumble: 0.03, plan: 0.04, wheel: "steel" }),
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The tub's side profile: the bumpers' faces, the arches, the sills, the boot, the beltline, the bonnet. */
function tubProfile(d: CarDef, b: number): [number, number][] {
  const L = d.L / 2 - b;
  const y0 = d.clear + b;
  const pts: [number, number][] = [];
  const noseY = d.nose - b,
    tailY = d.tail - b,
    belt = d.belt - b;
  // the body's top over an axle (the bonnet's slope in front, the boot behind): an arch never cuts through it
  const topAt = (x: number) => (x > d.cowl ? belt + (noseY - belt) * Math.min(1, (x - d.cowl) / (L - d.cowl)) ** 1.6 : x < d.deck ? Math.min(belt, tailY) : belt);
  const archR = (ax: number) => Math.min(d.wr + 0.045, topAt(ax) - d.wr - 0.06) + b;
  // the front face, down to the chin
  pts.push([L, noseY - 0.1], [L + 0.01, (noseY + y0) / 2], [L - 0.03, y0 + 0.06], [L - 0.14, y0]);
  // the bottom, back past the arches
  for (const ax of [d.ax[1], d.ax[0]]) {
    const ra = archR(ax);
    const dy = y0 - d.wr;
    const dx = Math.sqrt(Math.max(0, ra * ra - dy * dy));
    const a0 = Math.atan2(dy, dx),
      a1 = Math.PI - a0;
    for (let i = 0; i <= 10; i++) {
      const a = a0 + ((a1 - a0) * i) / 10;
      pts.push([ax + ra * Math.cos(a), d.wr + ra * Math.sin(a)]);
    }
  }
  pts.push([-L + 0.14, y0], [-L + 0.02, y0 + 0.06], [-L - 0.01, (tailY + y0) / 2]);
  // the tail and the boot, up to the rear window's base
  pts.push([-L, tailY - 0.08], [-L + 0.06, tailY - 0.015], [-L + 0.2, tailY]);
  if (d.form === "saloon") pts.push([d.deck - 0.25, (tailY + belt) / 2 + 0.01], [d.deck, belt]);
  else pts.push([Math.min(d.deck, -L + 0.3), belt]);
  // the beltline to the windscreen's base, the bonnet down to the nose
  pts.push([d.cowl, belt]);
  const hoodLen = L - d.cowl;
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    // (a slight crown: the bonnet falls away toward the nose)
    pts.push([d.cowl + hoodLen * t * 0.97, belt + (noseY - belt) * t ** 1.6]);
  }
  pts.push([L - 0.01, noseY - 0.03]);
  return pts;
}

/** The cabin's side profile: the windscreen, the roof (a little crowned), the rear window. */
function cabinProfile(d: CarDef, b: number): [number, number][] {
  const base = d.belt - b - 0.04,
    top = d.H - b;
  const [r0, r1] = d.roof;
  const pts: [number, number][] = [[d.cowl + 0.02, base]];
  pts.push([d.deck - 0.02, base]);
  if (d.form === "fastback") {
    // the rear window falls in a long curve to the tail
    for (let i = 1; i <= 5; i++) {
      const t = i / 5;
      pts.push([d.deck + (r1 - d.deck) * t, base + (top - base) * Math.sin((t * Math.PI) / 2)]);
    }
  } else pts.push([r1 - 0.06, top - 0.06], [r1, top - 0.01]);
  pts.push([(r0 + r1) / 2, top + 0.018]);
  pts.push([r0, top - 0.01], [r0 + 0.06, top - 0.05]);
  return pts;
}

/** The x where a line through (x0, y0)–(x1, y1) reaches height y. */
const along = (x0: number, y0: number, x1: number, y1: number, y: number) => x0 + ((x1 - x0) * (y - y0)) / (y1 - y0 || 1e-6);

export interface CarStyle {
  paint?: THREE.ColorRepresentation;
  /** The cabin's colour (two-tone), the stripes, the livery. */
  accent?: THREE.ColorRepresentation;
  finish?: "metal" | "solid" | "matte";
  /** A neon strip under the sills (the street's tuned cars). */
  glow?: THREE.ColorRepresentation;
  /** A pickup's load in its bed. */
  load?: boolean;
  /** The convertible's seats. */
  seats?: THREE.ColorRepresentation;
}

interface Built {
  geos: Partial<Record<Slot, THREE.BufferGeometry>>;
  extras: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[] }[];
  def: CarDef;
  wheels: { x: number; z: number; r: number; w: number; front: boolean }[];
  style: CarDef["wheel"];
}

/** A car's body for a kind and its options, built once. */
function buildCar(kind: Exclude<CarKind, "truck">, o: CarStyle): Built {
  const d = CARS[kind];
  const k = new Kit();
  const b = d.bevel;
  const W = d.W,
    L = d.L / 2;
  const extras: Built["extras"] = [];
  const cabSlot: Slot = kind === "police" || kind === "gt" ? "accent" : "paint";
  // ---- the tub
  k.add("paint", profile(tubProfile(d, b), W, b, 3), undefined, true, 0.5);
  // the dark wells behind the wheels (the arches are cut right through the tub)
  for (const ax of d.ax) k.add("trim", box((d.wr + 0.06) * 2, d.wr + 0.06 + d.wr - d.clear, W - 2 * d.tw - 0.12, ax, (d.clear + d.wr * 2 + 0.06) / 2, 0), T.liner, false);
  // ---- the cabin (paint), its glass laid on flush
  const top = d.H;
  if (d.form !== "open") {
    const Wc = W - 0.1;
    const cb = 0.09;
    k.add(cabSlot, profile(cabinProfile(d, cb), Wc, cb, 3), undefined, true, 0.5);
    const yb = d.belt + 0.03,
      yt = top - cb - 0.09;
    const [r0, r1] = d.roof;
    // the windscreen's and the rear window's lines (the cabin's faces)
    const fx = (y: number) => along(d.cowl + 0.02, d.belt - cb - 0.04, r0 + 0.06, top - cb - 0.05, y);
    const rx = (y: number) => (d.form === "fastback" ? along(d.deck, d.belt - cb, r1, top - cb, y) : along(d.deck - 0.02, d.belt - cb - 0.04, r1 - 0.06, top - cb - 0.06, y));
    // side windows: between the A and C pillars, split by the B pillar (the van's only up front)
    const aw = 0.1,
      cw = d.form === "fastback" ? 0.1 : d.form === "wagon" ? 0.12 : 0.16;
    const xf = (y: number) => fx(y) - aw,
      xr = (y: number) => rx(y) + cw;
    const panes: [number, number][][] = [];
    const bx = d.form === "van" ? xf(yb) - 0.85 : d.form === "pickup" ? (xf(yb) + xr(yb)) / 2 + 0.25 : xf(yb) - (xf(yb) - xr(yb)) * 0.46;
    if (d.form === "van") panes.push([[xf(yb), yb], [xf(yt), yt], [bx, yt], [bx, yb]]);
    else if (d.form === "fastback") panes.push([[xf(yb), yb], [xf(yt), yt], [xr(yt), yt], [xr(yb), yb]]);
    else {
      panes.push([[xf(yb), yb], [xf(yt), yt], [bx + 0.05, yt], [bx + 0.05, yb]]);
      panes.push([[bx - 0.05, yb], [bx - 0.05, yt], [xr(yt), yt], [xr(yb), yb]]);
      // a wagon's or a limo's third window behind
      if (d.form === "wagon" || kind === "limo") {
        const x3 = xr(yb) + (kind === "limo" ? 1.3 : 0.55);
        panes[1] = [[bx - 0.05, yb], [bx - 0.05, yt], [x3 + 0.05, yt], [x3 + 0.05, yb]];
        panes.push([[x3 - 0.05, yb], [x3 - 0.05, yt], [xr(yt), yt], [xr(yb), yb]]);
      }
    }
    for (const pane of panes) {
      const g = profile(pane, 0.012, 0, 1);
      for (const side of [-1, 1]) k.add("glass", g.clone().translate(0, 0, side * (Wc / 2 + 0.005)));
    }
    // the black seal round the side glass, the chrome line under it
    k.add("trim", box(xf(yb) - xr(yb) + 0.1, 0.025, Wc + 0.016, (xf(yb) + xr(yb)) / 2, yb - 0.02, 0), T.black);
    k.add("chrome", box(xf(yb) - xr(yb), 0.012, Wc + 0.02, (xf(yb) + xr(yb)) / 2, yb - 0.045, 0));
    // windscreen and rear window: panes along the cabin's sloped faces, just proud of them
    const slopePane = (x0: number, y0: number, x1: number, y1: number, inset: number) => {
      const nx = y1 - y0,
        ny = -(x1 - x0);
      const l = Math.hypot(nx, ny) || 1;
      const sgn = x1 > x0 ? 1 : -1;
      const ox = ((nx / l) * (cb + 0.006)) * -sgn,
        oy = ((ny / l) * (cb + 0.006)) * -sgn;
      const t = 0.012;
      const px = (nx / l) * t * -sgn,
        py = (ny / l) * t * -sgn;
      const pts: [number, number][] = [
        [x0 + ox, y0 + oy],
        [x1 + ox, y1 + oy],
        [x1 + ox + px, y1 + oy + py],
        [x0 + ox + px, y0 + oy + py],
      ];
      return profile(pts, Wc - 2 * (cb + inset), 0, 1);
    };
    k.add("glass", slopePane(d.cowl + 0.02, d.belt - cb + 0.02, r0 + 0.07, top - cb - 0.07, 0.04));
    if (d.form !== "van" && d.form !== "wagon") k.add("glass", slopePane(r1 - 0.04, top - cb - 0.08, d.deck + 0.03, d.belt - cb + 0.03, 0.06));
    else {
      // the tailgate's window, upright
      k.add("glass", box(0.012, top - d.belt - 0.32, Wc - 0.42, -L + 0.012, (top + d.belt) / 2 - 0.04, 0));
    }
    // wipers
    k.add("trim", box(0.02, 0.02, 0.55, d.cowl - 0.02, d.belt + 0.02, -0.25), T.black);
    k.add("trim", box(0.02, 0.02, 0.55, d.cowl - 0.02, d.belt + 0.02, 0.32), T.black);
  } else {
    // ---- open: the windscreen in its frame, the cockpit, the seats and their headrests
    const ws = 0.42;
    const pts: [number, number][] = [
      [d.cowl, d.belt - 0.02],
      [d.cowl - ws * 0.6, d.belt + ws],
      [d.cowl - ws * 0.6 - 0.02, d.belt + ws],
      [d.cowl - 0.02, d.belt - 0.02],
    ];
    k.add("glass", profile(pts, W - 0.32, 0, 1));
    k.add("chrome", box(0.03, 0.025, W - 0.3, d.cowl - ws * 0.6, d.belt + ws, 0));
    for (const z of [-1, 1]) k.add("chrome", profile(pts.map(([x, y]) => [x, y] as [number, number]), 0.03, 0, 1).translate(0, 0, z * (W / 2 - 0.16)));
    const seat = o.seats ?? "#5a2a22";
    k.add("trim", box(d.cowl - d.deck - 0.1, 0.02, W - 0.34, (d.cowl + d.deck) / 2 - 0.05, d.belt + 0.002, 0), T.interior, false);
    const sc = new THREE.Color(seat);
    for (const x of [d.cowl - 0.62, d.cowl - 1.25])
      for (const z of [-0.4, 0.4]) {
        k.add("trim", rbox(0.48, 0.14, 0.48, 0.05, x, d.belt + 0.06, z), sc, false);
        k.add("trim", rbox(0.12, 0.5, 0.46, 0.05, x - 0.22, d.belt + 0.3, z), sc, false);
        k.add("trim", rbox(0.1, 0.16, 0.26, 0.04, x - 0.24, d.belt + 0.62, z), sc, false);
      }
    k.add("trim", new THREE.TorusGeometry(0.17, 0.02, 6, 16).rotateY(Math.PI / 2).rotateZ(-0.4).translate(d.cowl - 0.28, d.belt + 0.25, -0.4), T.black, false);
  }
  // ---- the pickup's bed: a liner inside the tub, the tailgate's seam, a load
  if (d.form === "pickup") {
    const bx0 = d.deck - 0.12,
      bx1 = -L + 0.1;
    k.add("trim", box(bx0 - bx1, 0.02, W - 0.22, (bx0 + bx1) / 2, d.belt + 0.002, 0), T.plastic, false);
    k.add("trim", box(0.012, 0.02, W - 0.1, -L + 0.12, d.belt - 0.15, 0), T.black);
    if (o.load) {
      k.add("trim", rbox(0.7, 0.55, 0.8, 0.03, bx0 - 0.6, d.belt + 0.28, -0.35), T.wood, false);
      k.add("trim", rbox(0.6, 0.45, 0.6, 0.03, bx0 - 1.4, d.belt + 0.23, 0.4), 0x8a6236, false);
    }
  }
  // ---- the nose: grille, lamps, bumper, plate
  const nY = d.nose;
  k.add("trim", rbox(0.14, 0.22, W - 0.14, 0.06, L - 0.05, d.clear + 0.14, 0), T.plastic);
  k.add("trim", box(0.04, kind === "suv" || kind === "pickup" ? 0.32 : 0.16, W * (kind === "suv" || kind === "pickup" ? 0.5 : 0.4), L + 0.0, nY - 0.22, 0), T.black);
  k.add("chrome", box(0.035, 0.022, W * 0.42, L + 0.006, nY - 0.11, 0));
  k.add("trim", box(0.02, 0.11, 0.5, L + 0.03, d.clear + 0.2, 0), T.plate);
  for (const z of [-1, 1]) {
    k.add("lamps", rbox(0.09, 0.1, 0.36, 0.03, L - 0.04, nY - 0.11, z * (W / 2 - 0.28)), LAMP.head);
    k.add("lamps", box(0.03, 0.02, 0.3, L - 0.02, nY - 0.05, z * (W / 2 - 0.3)), LAMP.drl);
    k.add("lamps", box(0.05, 0.05, 0.12, L - 0.05, d.clear + 0.18, z * (W / 2 - 0.25)), LAMP.amber);
  }
  // ---- the tail: lamps (a bar across the sporty ones), bumper, plate, exhaust
  const tY = d.tail;
  k.add("trim", rbox(0.14, 0.22, W - 0.14, 0.06, -L + 0.05, d.clear + 0.14, 0), T.plastic);
  k.add("trim", box(0.02, 0.11, 0.5, -L - 0.02, d.clear + 0.3, 0), T.plate);
  if (d.form === "fastback") k.add("lamps", box(0.03, 0.04, W - 0.36, -L + 0.02, tY - 0.12, 0), LAMP.tail);
  for (const z of [-1, 1]) k.add("lamps", rbox(0.08, d.form === "van" ? 0.32 : 0.11, 0.38, 0.03, -L + 0.035, d.form === "van" ? tY + 0.25 : tY - 0.13, z * (W / 2 - 0.27)), LAMP.tail);
  k.add("chrome", cyl(0.04, 0.16, "x", -L - 0.02, d.clear + 0.1, d.form === "fastback" ? 0.4 : -0.55, 10));
  if (d.form === "fastback") k.add("chrome", cyl(0.04, 0.16, "x", -L - 0.02, d.clear + 0.1, -0.4, 10));
  // ---- the sides: sills, door seams and handles, mirrors
  const sx0 = d.ax[0] + d.wr + 0.12,
    sx1 = d.ax[1] - d.wr - 0.12;
  for (const z of [-1, 1]) {
    k.add("trim", box(sx1 - sx0, 0.07, 0.04, (sx0 + sx1) / 2, d.clear + 0.05, z * (W / 2 - 0.02)), T.plastic);
    const seams = d.form === "van" ? [d.cowl - 0.12, d.cowl - 1.05] : d.form === "fastback" || d.form === "open" ? [d.cowl - 0.05, d.deck + 0.35] : [d.cowl - 0.05, (d.cowl + d.deck) / 2 - 0.05, d.deck + 0.05];
    for (const x of seams) k.add("trim", box(0.008, d.belt - d.clear - 0.2, 0.006, x, (d.belt + d.clear + 0.12) / 2, z * (W / 2 + 0.002)), T.black);
    for (const x of seams.slice(0, -1)) k.add("chrome", box(0.13, 0.025, 0.02, x - 0.3, d.belt - 0.13, z * (W / 2 + 0.008)));
    if (d.form !== "open") {
      k.add(cabSlot === "accent" ? "accent" : "paint", rbox(0.16, 0.11, 0.17, 0.03, d.cowl - 0.12, d.belt + 0.09, z * (W / 2 + 0.06)));
      k.add("trim", box(0.06, 0.03, 0.08, d.cowl - 0.1, d.belt + 0.03, z * (W / 2 + 0.0)), T.black);
    }
  }
  // ---- the kinds' own things
  if (kind === "taxi") {
    // the roof lamp, a checker line along the doors
    k.add("lamps", rbox(0.36, 0.16, 0.7, 0.05, (d.roof[0] + d.roof[1]) / 2, top + 0.08, 0), new THREE.Color(2.4, 1.9, 0.6));
    for (const z of [-1, 1]) k.add("trim", box(sx1 - sx0 + 0.6, 0.05, 0.006, (sx0 + sx1) / 2, d.belt - 0.2, z * (W / 2 + 0.003)), T.black);
  }
  if (kind === "police") {
    // the light bar's base (the lamps that flash are the street's own, see POLICE_BAR)
    k.add("trim", rbox(0.34, 0.07, 1.3, 0.03, POLICE_BAR.x, top + 0.02, 0), T.black);
    k.add("clear", rbox(0.3, 0.09, 1.24, 0.04, POLICE_BAR.x, top + 0.09, 0));
  }
  if (kind === "sports" || kind === "gt") {
    // the wing on its posts, the side intakes
    k.add(kind === "gt" ? "accent" : "trim", rbox(0.3, 0.04, W - 0.3, 0.015, -L + 0.18, tY + 0.2, 0), kind === "gt" ? undefined : T.black);
    for (const z of [-0.55, 0.55]) k.add("trim", box(0.08, 0.2, 0.03, -L + 0.22, tY + 0.1, z), T.black);
    for (const z of [-1, 1]) k.add("trim", box(0.5, 0.12, 0.02, d.ax[0] + 0.75, d.belt - 0.3, z * (W / 2 + 0.003)), T.black);
  }
  if (kind === "gt") {
    // the bonnet's twin vents in the dark accent, the Zcash gold line along the sills
    for (const z of [-0.32, 0.32]) k.add("trim", box(0.42, 0.012, 0.2, d.cowl + 0.45, d.belt - 0.035, z), T.black);
  }
  if (o.glow) for (const z of [-1, 1]) k.add("lamps", box(sx1 - sx0, 0.02, 0.04, (sx0 + sx1) / 2, d.clear - 0.02, z * (W / 2 - 0.1)), new THREE.Color(o.glow).multiplyScalar(2.2), false);
  if (d.form === "wagon") {
    // roof rails, the spare wheel on the tailgate
    for (const z of [-1, 1]) k.add("trim", box(d.roof[0] - d.roof[1], 0.04, 0.05, (d.roof[0] + d.roof[1]) / 2, top + 0.03, z * (W / 2 - 0.22)), T.black);
    extras.push({ geo: wheelGeometry(d.wr, d.tw, "steel").clone().rotateY(Math.PI / 2).translate(-L - 0.12, d.belt + 0.05, 0), mat: WHEEL });
  }
  if (d.form === "van") {
    // the livery band along the side (the accent), the roof's light units
    if (o.accent) for (const z of [-1, 1]) k.add("accent", box(L * 2 - 0.5, 0.18, 0.008, -0.1, d.belt + 0.15, z * (W / 2 + 0.004)), undefined, false);
  }
  const shape = bodyShape({ half: W / 2, len: d.L, plan: d.plan, belt: d.belt, top, tumble: d.tumble, clear: d.clear });
  const geos = k.build(shape);
  const track = W / 2 - d.tw / 2 - 0.035;
  const wheels = [d.ax[0], d.ax[1]].flatMap((x) => [-1, 1].map((s) => ({ x, z: s * track, r: d.wr, w: d.tw, front: x > 0 })));
  return { geos, extras, def: d, wheels, style: d.wheel };
}

/** Where the street's police light bars go on the cruiser's roof (car frame). */
export const POLICE_BAR = { x: -0.25, y: CARS.police.H + 0.1 };

// ---- the box truck ---------------------------------------------------------------------------------

export const TRUCK = { L: 6.67, W: 2.25, H: 3.0, cab: 1.95, wr: 0.42, ax: [-2.15, 2.2] as [number, number] };

const labels = new Map<string, THREE.MeshStandardMaterial>();
/** The box's livery: the operator's name painted along it (a canvas, one per livery). */
function liveryMaterial(livery: string, label: "proof" | "depot") {
  const key = `${livery}|${label}`;
  let m = labels.get(key);
  if (m) return m;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 384;
  const g = c.getContext("2d")!;
  g.fillStyle = livery;
  g.fillRect(0, 0, c.width, c.height);
  const band = label === "proof" ? "#f4b728" : "#ffffff";
  g.fillStyle = band;
  g.fillRect(0, 250, c.width, 34);
  g.fillStyle = label === "proof" ? "#f4b728" : "#ffffff";
  g.font = "900 104px Archivo, Roboto, sans-serif";
  g.textBaseline = "middle";
  g.fillText(label === "proof" ? "PROOF FACTORY" : "ZEC DEPOT", 70, 150);
  g.font = "600 44px Archivo, Roboto, sans-serif";
  g.fillText(label === "proof" ? "zk proofs · delivered" : "deliveries · 24/7", 74, 330);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.1 });
  m.userData.shared = true;
  labels.set(key, m);
  return m;
}

function buildTruck(livery: string, label: "proof" | "depot"): Built {
  const { L: Lt, W, H, cab, wr, ax } = TRUCK;
  const L = Lt / 2;
  const k = new Kit();
  const extras: Built["extras"] = [];
  const bx0 = -L,
    bx1 = L - cab - 0.08;
  // the chassis and its rails, the fuel tank, the side guards
  k.add("trim", box(Lt - 0.3, 0.22, 1.0, 0, 0.62, 0), T.black, false);
  k.add("trim", rbox(0.7, 0.36, 0.4, 0.06, 0.2, 0.62, 0.78), T.grey, false);
  for (const z of [-1, 1]) k.add("trim", box(2.2, 0.06, 0.04, -0.3, 0.5, z * (W / 2 - 0.08)), T.grey, false);
  // the cab: a rounded box, its windscreen and side windows, the bumper and lamps
  k.add("paint", rbox(cab, H - 0.85, W - 0.04, 0.16, L - cab / 2, 0.55 + (H - 0.85) / 2 - 0.08, 0, 3));
  k.add("glass", box(0.02, 0.62, W - 0.32, L + 0.005, 1.95, 0));
  for (const z of [-1, 1]) k.add("glass", box(cab * 0.55, 0.58, 0.02, L - cab * 0.4, 1.92, z * (W / 2 - 0.015)));
  k.add("trim", rbox(0.16, 0.3, W - 0.06, 0.05, L + 0.02, 0.62, 0), T.plastic);
  k.add("trim", box(0.03, 0.42, W * 0.5, L + 0.01, 1.15, 0), T.black);
  for (const z of [-1, 1]) {
    k.add("lamps", rbox(0.06, 0.16, 0.32, 0.03, L + 0.01, 1.02, z * (W / 2 - 0.28)), LAMP.head);
    k.add("trim", box(0.06, 0.32, 0.05, L - 0.25, 2.05, z * (W / 2 + 0.06)), T.black);
    k.add("lamps", box(0.04, 0.05, 0.12, L - 0.3, H - 0.32, z * (W / 2 - 0.3)), LAMP.amber);
  }
  // the box: its frame, its painted sides (the livery: an `extras` mesh with the canvas), the back door
  k.add("trim", box(bx1 - bx0, 0.1, W, (bx0 + bx1) / 2, 0.8, 0), T.grey, false);
  const bh = H - 0.85;
  const side = new THREE.BoxGeometry(bx1 - bx0, bh, W);
  side.translate((bx0 + bx1) / 2, 0.85 + bh / 2, 0);
  // (the livery on the two long sides; the ends and the roof in the box's plain paint)
  const plain = paint(livery, "solid");
  const lv = liveryMaterial(livery, label);
  extras.push({ geo: side, mat: [plain, plain, paint("#e8e4dc", "solid"), plain, lv, lv] });
  k.add("trim", box(bx1 - bx0 + 0.04, 0.06, W + 0.04, (bx0 + bx1) / 2, H - 0.02, 0), 0xd8d4cc, false);
  // the roller door's slats at the back
  for (let y = 0.95; y < H - 0.1; y += 0.12) k.add("trim", box(0.02, 0.06, W - 0.16, bx0 - 0.005, y, 0), 0x9a96a2, false);
  for (const z of [-1, 1]) k.add("lamps", box(0.04, 0.22, 0.14, bx0 - 0.02, 0.95, z * (W / 2 - 0.2)), LAMP.tail);
  // the dark wells
  for (const x of ax) k.add("trim", box(wr * 2 + 0.14, 0.5, W - 0.7, x, 0.62, 0), T.liner, false);
  const geos = k.build(null);
  const track = W / 2 - 0.2;
  const wheels = ax.flatMap((x) => [-1, 1].map((s) => ({ x, z: s * track, r: wr, w: 0.3, front: x > 0 })));
  return { geos, extras, def: { ...CARS.van, L: Lt, W, H, wr, ax }, wheels, style: "truck" };
}

// ---- the public part -------------------------------------------------------------------------------

const cache = new Map<string, Built>();

/** The materials for a built car's slots. */
function slotMaterial(slot: Slot, o: CarStyle, kind: CarKind): THREE.Material {
  switch (slot) {
    case "paint":
      return paint(o.paint ?? "#c8ccd4", o.finish ?? (kind === "taxi" || kind === "police" || kind === "van" || kind === "ambulance" ? "solid" : "metal"));
    case "accent":
      return paint(o.accent ?? "#111216", kind === "police" ? "solid" : "metal");
    case "glass":
      return GLASS;
    case "clear":
      return GLASS_CLEAR;
    case "chrome":
      return CHROME;
    case "lamps":
      return LAMPS;
    default:
      return TRIM;
  }
}

export interface CarOpts extends CarStyle {
  /** The box truck's livery and its operator. */
  livery?: string;
  label?: "proof" | "depot";
  /** Leave the wheels out (the caller turns its own). */
  noWheels?: boolean;
}

/**
 * A vehicle of `kind` in `o`'s paint: a group with its body (child "body") and its wheels (pivots
 * named "wheel" in the group, `userData.wheel = { r, front }`). Geometry and materials shared.
 */
export function carObject(kind: CarKind, o: CarOpts = {}): THREE.Group {
  const key = `${kind}|${JSON.stringify(o)}`;
  let b = cache.get(key);
  if (!b) {
    b = kind === "truck" ? buildTruck(o.livery ?? "#5a3a8a", o.label ?? "proof") : buildCar(kind, o);
    cache.set(key, b);
  }
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = "body";
  for (const [slot, geo] of Object.entries(b.geos) as [Slot, THREE.BufferGeometry][]) {
    const m = new THREE.Mesh(geo, slotMaterial(slot, o, kind));
    m.castShadow = slot === "paint" || slot === "accent" || (kind === "truck" && slot === "trim");
    m.receiveShadow = slot !== "lamps" && slot !== "glass";
    m.userData.kind = slot;
    body.add(m);
  }
  for (const e of b.extras) {
    const m = new THREE.Mesh(e.geo, e.mat);
    m.castShadow = true;
    m.receiveShadow = true;
    body.add(m);
  }
  g.add(body);
  if (!o.noWheels) for (const w of b.wheels) g.add(wheel(w.r, w.w, b.style, w.x, w.z, w.front, w.z < 0));
  g.userData.realCar = { kind, L: b.def.L, W: b.def.W, H: b.def.H, wr: b.def.wr };
  return g;
}

/** The size and wheels of a kind (for the game's car physics and the riders). */
export function carSize(kind: CarKind) {
  if (kind === "truck") return { L: TRUCK.L, W: TRUCK.W, H: TRUCK.H, wr: TRUCK.wr, ax: TRUCK.ax };
  const d = CARS[kind];
  return { L: d.L, W: d.W, H: d.H, wr: d.wr, ax: d.ax };
}

/** Roll a vehicle's wheels by the distance it moved (m). */
export function spinWheels(g: THREE.Object3D, metres: number) {
  for (const c of g.children)
    if (c.name === "wheel") {
      const w = c.userData.wheel as { r: number };
      c.children[0].rotation.z -= metres / w.r;
    }
}

/** The wheel pivots of a vehicle (for the game's steering). */
export function wheelsOf(g: THREE.Object3D) {
  return g.children.filter((c) => c.name === "wheel");
}

void smoothstep;

// ---- two wheels ---------------------------------------------------------------------------------------

export type BikeKind = "moto" | "scooter";
/** The bikes' sizes and wheels (m): the ZK-R sport bike, the delivery scooter. */
export const BIKES = {
  moto: { L: 2.33, W: 0.7, wr: 0.32, tw: 0.17, ax: [-0.67, 0.83] as [number, number] },
  scooter: { L: 2.0, W: 0.66, wr: 0.21, tw: 0.12, ax: [-0.58, 0.67] as [number, number] },
};

function buildBike(kind: BikeKind, o: CarStyle): Built {
  const B = BIKES[kind];
  const k = new Kit();
  const [rx, fx] = B.ax;
  if (kind === "moto") {
    // the frame and the engine block between the wheels, the swingarm, the exhaust
    k.add("trim", rbox(0.62, 0.32, 0.3, 0.06, 0.05, 0.42, 0), T.plastic);
    k.add("chrome", rbox(0.4, 0.2, 0.26, 0.04, 0.02, 0.32, 0));
    k.add("trim", box(0.7, 0.06, 0.06, (rx + 0.05) / 2 - 0.05, 0.36, 0.1), T.grey);
    k.add("trim", box(0.7, 0.06, 0.06, (rx + 0.05) / 2 - 0.05, 0.36, -0.1), T.grey);
    k.add("chrome", cyl(0.055, 0.7, "x", -0.45, 0.42, 0.16, 12, 0.07));
    // the tank, the seat, the tail with its light
    k.add("paint", profile([[0.55, 0.62], [0.12, 0.66], [0.02, 0.8], [0.2, 0.92], [0.55, 0.9]], 0.36, 0.06, 4));
    k.add("trim", profile([[0.04, 0.68], [-0.5, 0.7], [-0.55, 0.78], [0.0, 0.79]], 0.26, 0.03, 3), T.seat);
    k.add("paint", profile([[-0.45, 0.66], [-1.02, 0.82], [-1.06, 0.9], [-0.55, 0.84]], 0.22, 0.04, 3));
    k.add("lamps", box(0.03, 0.04, 0.14, -1.06, 0.84, 0), LAMP.tail);
    // the fairing over the front, its screen and headlight, the forks, the bars
    k.add("paint", profile([[0.48, 0.55], [0.95, 0.62], [1.06, 0.82], [0.88, 1.02], [0.6, 0.98], [0.52, 0.82]], 0.42, 0.07, 4));
    k.add("glass", profile([[0.86, 1.0], [0.98, 1.0], [0.82, 1.16], [0.74, 1.14]], 0.3, 0.02, 2));
    k.add("lamps", rbox(0.05, 0.07, 0.18, 1.05, 0.78, 0, 0.02), LAMP.head);
    for (const z of [-0.08, 0.08]) {
      const fork = cyl(0.025, 0.62, "y", 0, 0, 0, 8);
      fork.rotateZ(0.42);
      k.add("chrome", fork.translate(fx - 0.1, B.wr + 0.27, z));
    }
    k.add("trim", box(0.05, 0.04, 0.62, 0.62, 1.0, 0), T.black);
    k.add("trim", cyl(0.025, 0.32, "z", 0.6, 1.0, 0, 6), T.black);
  } else {
    // the step-through: deck, apron and front column, the rear body over the engine, the seat
    k.add("paint", profile([[0.5, 0.28], [-0.25, 0.28], [-0.7, 0.42], [-0.78, 0.62], [-0.2, 0.62], [-0.05, 0.4], [0.45, 0.38]], 0.4, 0.06, 4));
    k.add("paint", profile([[0.42, 0.3], [0.62, 0.32], [0.72, 0.95], [0.56, 1.0], [0.44, 0.5]], 0.42, 0.07, 4));
    k.add("trim", profile([[-0.15, 0.62], [-0.68, 0.64], [-0.7, 0.72], [-0.12, 0.71]], 0.3, 0.03, 3), T.seat);
    k.add("trim", box(0.05, 0.04, 0.6, 0.6, 1.02, 0), T.black);
    k.add("lamps", rbox(0.05, 0.08, 0.16, 0.72, 0.86, 0, 0.02), LAMP.head);
    k.add("lamps", box(0.03, 0.04, 0.12, -0.8, 0.6, 0), LAMP.tail);
    // the delivery box on the rack
    k.add("accent", rbox(0.42, 0.38, 0.44, 0.04, -0.62, 0.93, 0));
    k.add("chrome", cyl(0.035, 0.4, "x", -0.38, 0.3, 0.14, 8));
    k.add("chrome", cyl(0.02, 0.5, "y", B.ax[1] - 0.02, B.wr + 0.22, 0, 6));
  }
  const geos = k.build(null);
  const wheels = [rx, fx].map((x) => ({ x, z: 0, r: B.wr, w: B.tw, front: x > 0 }));
  return { geos, extras: [], def: { ...CARS.sedan, L: B.L, W: B.W, H: 1.2, wr: B.wr, ax: B.ax }, wheels, style: "sport" };
}

/** A bike (`moto` or `scooter`) like `carObject`: its body in "body", its two wheels as "wheel" pivots. */
export function bikeObject(kind: BikeKind, o: CarStyle = {}): THREE.Group {
  const key = `bike:${kind}|${JSON.stringify(o)}`;
  let b = cache.get(key);
  if (!b) cache.set(key, (b = buildBike(kind, o)));
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = "body";
  for (const [slot, geo] of Object.entries(b.geos) as [Slot, THREE.BufferGeometry][]) {
    const m = new THREE.Mesh(geo, slot === "paint" ? paint(o.paint ?? "#e8a91c") : slot === "accent" ? paint(o.accent ?? "#c0303a", "solid") : slotMaterial(slot, o, "sedan"));
    m.castShadow = slot !== "lamps" && slot !== "glass";
    body.add(m);
  }
  g.add(body);
  for (const w of b.wheels) g.add(wheel(w.r, w.w, b.style, w.x, w.z, w.front));
  g.userData.realCar = { kind, L: b.def.L, W: b.def.W, H: 1.2, wr: b.def.wr };
  return g;
}

// ---- the block bus --------------------------------------------------------------------------------

/**
 * The block bus (src/scene/bus.ts) as a realistic coach: a shell of rounded panels in its two tones
 * and the gold line, the window band left open (the riders show; the bus lays its own glass), the
 * door openings on the +z side, a moulded front with its lamps and the windscreen's frame; inside,
 * the floor, the red seats where BUS_SEATS has them, the yellow poles, the lit ceiling, the cab.
 * Dimensions from `BUS` (voxels of 1/6 m): 9 × 3.5 × 2.5 m.
 */
export function busObject(B: { w: number; h: number; d: number; floor: number; doors: [number, number][]; win: [number, number] }, seats: [number, number][]): THREE.Group {
  const key = "bus";
  let b = cache.get(key);
  if (!b) {
    const V = 1 / 6;
    const L = B.w * V,
      W = B.d * V,
      H = B.h * V,
      fl = B.floor * V,
      w0 = B.win[0] * V,
      w1 = B.win[1] * V;
    const X = (vx: number) => vx * V - L / 2;
    const k = new Kit();
    const t = 0.06;
    const wr = 0.46;
    const axes = [X(10), X(41)];
    // the underbody and the skirts between the arches
    k.add("trim", box(L - 0.4, fl - 0.3, W - 0.3, 0, 0.3 + (fl - 0.3) / 2, 0), T.black, false);
    const skirt = [X(1), axes[0] - wr - 0.12, axes[0] + wr + 0.12, axes[1] - wr - 0.12, axes[1] + wr + 0.12, X(B.w - 1)];
    // the lower body, each side: in runs (the doors cut out on +z)
    const lower = (z: number, cuts: [number, number][]) => {
      let a = -L / 2 + 0.1;
      const runs: [number, number][] = [];
      for (const [c0, c1] of cuts.sort((p, q) => p[0] - q[0])) {
        if (c0 > a) runs.push([a, c0]);
        a = c1;
      }
      runs.push([a, L / 2 - 0.1]);
      for (const [x0, x1] of runs) {
        k.add("paint", rbox(x1 - x0, w0 - 0.3, t, 0.02, (x0 + x1) / 2, 0.3 + (w0 - 0.3) / 2, z));
        k.add("trim", box(x1 - x0, 0.1, t + 0.012, (x0 + x1) / 2, w0 - 0.24, z), 0xf4b728);
      }
      // the skirts' arches: dark wells over the wheels
      for (const ax of axes) k.add("trim", box(wr * 2 + 0.2, 0.08, t + 0.02, ax, wr * 2 + 0.12, z), T.black);
      void skirt;
    };
    const doors = B.doors.map(([a, c]) => [X(a), X(c)] as [number, number]);
    lower(W / 2 - t / 2, doors);
    lower(-W / 2 + t / 2, []);
    // the pillars between the windows, the band over them (the light tone), the roof
    for (let vx = 3; vx < B.w - 3; vx += 6) {
      const x = X(vx);
      if (doors.some(([a, c]) => x > a - 0.05 && x < c + 0.05)) continue;
      for (const z of [W / 2 - t / 2, -W / 2 + t / 2]) k.add("accent", box(0.12, w1 - w0, t, x, (w0 + w1) / 2, z));
    }
    // the doors' frames up to the band
    for (const [a, c] of doors) for (const x of [a, c]) k.add("accent", box(0.1, H - 0.67 - fl, t + 0.01, x, (fl + H - 0.67) / 2, W / 2 - t / 2));
    for (const z of [W / 2 - t / 2, -W / 2 + t / 2]) k.add("accent", rbox(L - 0.2, H - 0.18 - w1, t, 0.02, 0, (w1 + H - 0.18) / 2, z));
    k.add("accent", rbox(L - 0.05, 0.2, W, 0.08, 0, H - 0.1, 0, 3));
    k.add("trim", rbox(1.9, 0.2, W - 0.6, 0.06, X(14), H + 0.08, 0), T.grey);
    k.add("trim", rbox(1.3, 0.18, W - 0.8, 0.06, X(34), H + 0.07, 0), T.grey);
    // the front: a moulded panel under the windscreen, the windscreen's frame, the destination band
    k.add("paint", rbox(0.14, w0 - 0.25 - 0.3, W - 0.04, 0.05, L / 2 - 0.07, 0.3 + (w0 - 0.55) / 2 + 0.1, 0));
    for (const z of [-1, 1]) k.add("accent", box(0.12, H - 0.5 - (w0 - 0.25), 0.14, L / 2 - 0.06, (w0 - 0.25 + H - 0.5) / 2, z * (W / 2 - 0.07)));
    k.add("accent", box(0.12, 0.5, W, L / 2 - 0.06, H - 0.43, 0));
    k.add("trim", rbox(0.16, 0.26, W, 0.05, L / 2, 0.42, 0), T.black);
    for (const z of [-1, 1]) {
      k.add("lamps", rbox(0.05, 0.14, 0.34, 0.03, L / 2 + 0.01, 0.78, z * (W / 2 - 0.3)), LAMP.head);
      k.add("lamps", box(0.04, 0.06, 0.12, L / 2 + 0.01, 0.62, z * (W / 2 - 0.22)), LAMP.amber);
      k.add("trim", box(0.06, 0.4, 0.05, L / 2 - 0.12, w1 - 0.1, z * (W / 2 + 0.12)), T.black);
    }
    // the back: a panel (its window in the dark glass), the lamps
    k.add("paint", rbox(0.1, w0 - 0.3, W, 0.04, -L / 2 + 0.05, 0.3 + (w0 - 0.3) / 2, 0));
    k.add("accent", box(0.1, H - 0.18 - w0, W, -L / 2 + 0.05, (w0 + H - 0.18) / 2, 0));
    k.add("glass", box(0.02, w1 - w0 - 0.1, W - 0.6, -L / 2 - 0.005, (w0 + w1) / 2, 0));
    for (const z of [-1, 1]) k.add("lamps", rbox(0.04, 0.42, 0.18, 0.02, -L / 2 - 0.01, 1.05, z * (W / 2 - 0.2)), LAMP.tail);
    // inside: the floor, the seats, the poles, the lit ceiling, the cab
    k.add("trim", box(L - 0.3, 0.04, W - 0.16, 0, fl, 0), T.grey, false);
    for (const [sx, sz] of seats) {
      const x = X(sx),
        z = sz * V - W / 2;
      k.add("trim", rbox(0.42, 0.12, 0.44, 0.04, x - 0.05, fl + 0.44, z), 0x9a3428, false);
      k.add("trim", rbox(0.1, 0.62, 0.44, 0.04, x - 0.24, fl + 0.78, z), 0x7a2820, false);
      k.add("trim", box(0.06, 0.42, 0.06, x - 0.05, fl + 0.2, z), T.grey, false);
    }
    for (const [a, c] of B.doors)
      for (const vx of [a - 1, c]) {
        const x = X(vx);
        k.add("chrome", cyl(0.025, H - fl - 0.3, "y", x, (fl + H - 0.3) / 2, 10 * V - W / 2 + 0.08, 8));
      }
    for (const z of [-1, 1]) k.add("lamps", box(L - 1.6, 0.03, 0.1, -0.3, H - 0.24, z * 0.55), new THREE.Color(1.6, 1.4, 1.05));
    k.add("trim", rbox(0.5, 0.6, 0.6, 0.05, L / 2 - 1.1, fl + 0.3, -W / 2 + 0.5), T.plastic, false);
    k.add("trim", rbox(0.3, 0.5, W - 0.3, 0.04, L / 2 - 0.45, fl + 0.55, 0), T.plastic, false);
    const geos = k.build(null);
    b = { geos, extras: [], def: { ...CARS.van, L, W, H, wr, ax: axes as [number, number] }, wheels: axes.flatMap((x) => [-1, 1].map((s) => ({ x, z: s * (W / 2 - 0.2), r: wr, w: 0.32, front: x > 0 }))), style: "truck" };
    cache.set(key, b);
  }
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = "body";
  const mats: Partial<Record<Slot, THREE.Material>> = { paint: paint("#2c3140", "solid"), accent: paint("#3a4054", "solid"), glass: GLASS };
  for (const [slot, geo] of Object.entries(b.geos) as [Slot, THREE.BufferGeometry][]) {
    const m = new THREE.Mesh(geo, mats[slot] ?? slotMaterial(slot, {}, "van"));
    m.castShadow = slot === "paint" || slot === "accent";
    m.receiveShadow = slot !== "lamps";
    body.add(m);
  }
  g.add(body);
  for (const w of b.wheels) g.add(wheel(w.r, w.w, b.style, w.x, w.z, w.front));
  return g;
}
