import type { Built } from "../buildings";
import { C, E, G, hash, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { glyphs, textWidth } from "./statue-art";

/**
 * The PROOF FACTORY district on the south bank, west of the boulevard: where shielded parcels are
 * proved and shipped. Front (+z) is the river quay with its two ship-to-shore cranes and the boxes
 * waiting for them; behind it the rail siding; then the factory row: the transparent DEPOT, the
 * PROOF FACTORY itself (a giant sawtooth-roofed mining hall, its glazing lit violet, the big live
 * screen and the 証明工場 sign over the entrance, five loading docks), the data centre, and to the
 * west the Equihash power station (turbine hall, boiler house, striped chimneys, cooling tower,
 * switchyard). In front of the row (the model's back, the ring road side) the truck court, with
 * the conveyor bridge carrying new blocks out to the loading tower, the second data centre, the
 * truck gate on the boulevard (east edge) and the visitors' gate on the ring road.
 *
 * Points (model voxels, scale 2): the mining hall's `patrol0..`, `screen`, `hall`, `press`,
 * `beltEnd`, `roof`, `camPos`, `camLook`; the live loading docks `dockProof` / `dockDepot` (wall
 * base at the bay's centre, trucks back onto it from -z) and each one's way out to the gate
 * `proofOut0..` / `depotOut0..`; `gate` the truck gate on the boulevard; `steam0`/`steam1` the
 * chimney tops, `steam2` the cooling tower's mouth.
 */
export function port(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const OVER = 24; // the crane booms reach this far out over the river
  const H = 118;
  const m = new VoxelModel(W, H, D + OVER);
  const pnt = (p: Paint, x: number, y: number, z: number) => (typeof p === "number" ? p : p(x, y, z));
  /** Lettering read from +z (axis x) or from +x (axis z). */
  const text = (s: string, x: number, y: number, z: number, c: Paint, scale = 1, axis: "x" | "z" = "x") =>
    glyphs(s, (px, py) => {
      for (let a = 0; a < scale; a++)
        for (let b = 0; b < scale; b++) {
          const yy = y - py * scale - b;
          if (axis === "x") m.set(x + px * scale + a, yy, z, c);
          else m.set(x, yy, z - px * scale - a, c);
        }
    });
  /** Lettering on a wall facing -z (the ring road side), centred on x = cx, top row at y. */
  const textBack = (s: string, cx: number, y: number, z: number, c: Paint, scale = 1) => {
    const x0 = Math.round(cx + (textWidth(s) * scale) / 2);
    glyphs(s, (px, py) => {
      for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) m.set(x0 - 1 - px * scale - a, y - py * scale - b, z, c);
    });
  };
  /** Lettering on a wall facing -x (the boulevard side), centred on z = cz. */
  const textEast = (s: string, cz: number, y: number, x: number, c: Paint, scale = 1) => {
    const z0 = Math.round(cz - (textWidth(s) * scale) / 2);
    glyphs(s, (px, py) => {
      for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) m.set(x, y - py * scale - b, z0 + px * scale + a, c);
    });
  };

  // ---- layout (voxels; 3 per metre). z = 0 is the ring road, z = D the river ----
  const QUAY = 136; // the quay apron, z QUAY..D
  const RAIL = 125; // rail siding z RAIL..RAIL+8
  const LANE = 26; // the truck lane across the court, gate to docks
  const PS = 204; // the power station, x PS..W
  // the factory row
  const DEP = { x0: 8, x1: 54, z0: 64, z1: 120, h: 30 };
  const HALL = { x0: 62, x1: 176, z0: 60, z1: 122, h: 44 };
  const DCB = { x0: 182, x1: 204, z0: 62, z1: 122, h: 36 };
  const DCA = { x0: 174, x1: 198, z0: 8, z1: 54, h: 36 };
  const MID = 119; // the factory's entrance, the screen and the visitors' gate line up on it
  const BELT = 95; // the conveyor bridge's centre line
  const walls: [number, number, number, number][] = [];
  const lights: [number, number, number, string][] = [];

  // ---- ground ----
  const asphalt = (x: number, _y: number, z: number) => (hash(x >> 4, 0, z >> 4, seed) < 0.2 ? C("#4c4b53") : C("#46454d"));
  m.box(0, 0, 0, W, 1, D, asphalt);
  // quay: concrete slabs with joints, a yellow safety line, the crane rails
  m.box(0, 0, QUAY, W, 1, D, (x, _y, z) => (x % 18 === 0 || (z - QUAY) % 9 === 0 ? C("#7a7680") : C("#8c8892")));
  m.box(0, 0, D - 3, PS, 1, D - 2, C("#e8b830"));
  for (const z of [140, 157]) m.box(0, 1, z, PS, 2, z + 1, C("#5a5862"));
  for (let x = 2; x < W; x += 12) m.box(x, -1, D - 1, x + 3, 1, D + 1, C("#1c1c20"));
  for (let x = 8; x < PS; x += 20) {
    m.box(x, 1, D - 5, x + 2, 3, D - 3, C("#2a2a32"));
    m.box(x - 1, 3, D - 6, x + 3, 4, D - 2, C("#2a2a32"));
  }
  // the court: lane lines, the dock aprons' yellow hatching, the visitors' green walkway with a zebra
  for (let x = 8; x < 172; x++) {
    if (x % 10 < 5) m.set(x, 0, LANE, C("#e8e4dc"));
    m.set(x, 0, LANE - 7, C("#d8d4cc"));
    m.set(x, 0, LANE + 7, C("#d8d4cc"));
  }
  for (let z = 1; z < HALL.z0; z++)
    for (let x = MID - 5; x <= MID + 5; x++) {
      const zebra = z > LANE - 7 && z < LANE + 7;
      m.set(x, 0, z, zebra ? ((x - MID + 5) % 4 < 2 ? C("#ecebe6") : C("#46454d")) : x === MID - 5 || x === MID + 5 ? C("#d8d4cc") : C("#2f7a4a"));
    }
  // rail siding: ballast, sleepers, two rails
  m.box(0, 0, RAIL, PS, 1, RAIL + 8, shades(["#6a645c", "#5e5852", "#746e66"], 1, seed + 1));
  for (let x = 0; x < PS; x += 2) m.box(x, 1, RAIL + 1, x + 1, 2, RAIL + 7, C("#4a3626"));
  for (const z of [RAIL + 2, RAIL + 5]) m.box(0, 1, z, PS, 2, z + 1, C("#8a8890"));

  // ---- helpers ----
  const BOX_COLORS = ["#c0392b", "#2a6db0", "#e0a020", "#2f8a4a", "#d8d4cc", "#7a3a8a", "#e06a20", "#3a3a42", "#1a9a9a", "#a8452a", "#4aa8d8", "#f4b728"];
  const LABELS = ["ZEC", "ZCASH", "ORCHARD", "SAPLING", "SHIELD", "HALO2", "ZSA", "NU7", "SHIELD", "ZIP 32", "ZODL", "ZEC"];
  const dark = (hex: string, f: number) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = (s: number) => Math.min(255, Math.round(((n >> s) & 255) * f));
    return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
  };
  /** A shipping container, 8×8 in section, `len` long along x (or z), ribbed sides, doors, label. */
  const container = (x: number, y: number, z: number, len: number, ci: number, label: string | null, alongZ = false) => {
    const hex = BOX_COLORS[ci % BOX_COLORS.length];
    const base = C(hex),
      rib = C(dark(hex, 0.78)),
      frame = C(dark(hex, 0.55));
    const [w, d] = alongZ ? [8, len] : [len, 8];
    m.box(x, y, z, x + w, y + 8, z + d, (xx, _yy, zz) => ((alongZ ? zz : xx) % 2 ? rib : base));
    m.box(x, y + 7, z, x + w, y + 8, z + d, base);
    for (const [a, b] of [
      [x, z],
      [x + w - 1, z],
      [x, z + d - 1],
      [x + w - 1, z + d - 1],
    ])
      m.box(a, y, b, a + 1, y + 8, b + 1, frame);
    m.box(x, y, z, x + w, y + 1, z + d, frame);
    if (!alongZ) {
      m.box(x + w - 1, y + 1, z + 1, x + w, y + 7, z + d - 1, frame);
      for (const zz of [z + 2, z + 3, z + 5, z + 6]) m.box(x + w - 1, y + 1, zz, x + w, y + 7, zz + 1, C(dark(hex, 0.7)));
    } else {
      m.box(x + 1, y + 1, z + d - 1, x + w - 1, y + 7, z + d, frame);
      for (const xx of [x + 2, x + 3, x + 5, x + 6]) m.box(xx, y + 1, z + d - 1, xx + 1, y + 7, z + d, C(dark(hex, 0.7)));
    }
    if (label && !alongZ && textWidth(label) <= len - 6) {
      const ink = hex === "#d8d4cc" || hex === "#f4b728" || hex === "#e0a020" ? C("#2a2a32") : C("#ecebe6");
      const lx = x + Math.round((len - textWidth(label)) / 2);
      text(label, lx, y + 6, z + d - 1, ink);
      textBack(label, x + len / 2, y + 6, z, ink);
    }
  };
  /**
   * A truck backed onto a dock: its tail at z = `tail`, the cab out towards -z (the court), a box
   * trailer or a container on it. 8 wide (x..x+8), 30 long.
   */
  const truck = (x: number, tail: number, cab: string, cargo: number) => {
    const nose = tail - 30;
    m.box(x + 1, 2, nose + 8, x + 7, 3, tail, C("#2a2a30"));
    for (const zz of [tail - 4, tail - 7, nose + 11]) for (const xx of [x, x + 6]) m.box(xx, 1, zz, xx + 2, 3, zz + 2, C("#141418"));
    if (cargo >= 0) container(x, 3, nose + 9, 21, cargo, null, true);
    else {
      m.box(x, 3, nose + 9, x + 8, 11, tail, C("#d8d6d0"));
      m.box(x, 10, nose + 9, x + 8, 11, tail, C("#c4c2bc"));
      for (let zz = nose + 12; zz < tail - 1; zz += 4) m.box(x, 4, zz, x + 8, 10, zz + 1, C("#bab8b2"));
    }
    const c = C(cab),
      cd = C(dark(cab, 0.7));
    m.box(x, 2, nose, x + 8, 9, nose + 8, c);
    m.box(x, 9, nose + 3, x + 8, 11, nose + 8, c);
    m.box(x + 1, 6, nose, x + 7, 9, nose + 1, G("#2a3448"));
    m.box(x + 2, 2, nose, x + 6, 5, nose + 1, cd);
    m.set(x, 3, nose, E("#fff2d0", 1.2));
    m.set(x + 7, 3, nose, E("#fff2d0", 1.2));
    for (const xx of [x, x + 7]) m.box(xx, 6, nose + 2, xx + 1, 9, nose + 7, G("#2a3448"));
    m.box(x + 7, 9, nose + 8, x + 8, 14, nose + 9, C("#9a98a0"));
    for (const xx of [x, x + 6]) m.box(xx, 1, nose + 3, xx + 2, 3, nose + 6, C("#141418"));
    walls.push([x, nose, x + 8, tail]);
  };
  /** Chain-link: posts, a top rail, see-through mesh and barbed wire on outriggers. */
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const alongX = z0 === z1;
    const n = alongX ? x1 - x0 : z1 - z0;
    for (let i = 0; i < n; i++) {
      const x = alongX ? x0 + i : x0,
        z = alongX ? z0 : z0 + i;
      if (i % 6 === 0) {
        m.box(x, 1, z, x + 1, 9, z + 1, C("#6a6872"));
        m.set(x + (alongX ? 0 : -1), 9, z + (alongX ? -1 : 0), C("#6a6872"));
      }
      m.set(x, 7, z, C("#7a7882"));
      for (let y = 1; y < 7; y++) if ((i + y) % 2 === 0) m.set(x, y, z, C("#9a98a2"));
      if (i % 2 === 0) m.set(x + (alongX ? 0 : -1), 9, z + (alongX ? -1 : 0), C("#4a4852"));
    }
  };
  /** A high-mast floodlight: a tapered pole and a ring of lamps. */
  const mast = (x: number, z: number, h: number) => {
    m.box(x - 1, 1, z - 1, x + 2, 3, z + 2, C("#5a5862"));
    m.box(x, 1, z, x + 1, h, z + 1, C("#7a7882"));
    m.box(x - 3, h, z - 3, x + 4, h + 1, z + 4, C("#3a3842"));
    for (const [a, b] of [
      [-3, -3],
      [3, -3],
      [-3, 3],
      [3, 3],
      [0, -3],
      [0, 3],
      [-3, 0],
      [3, 0],
    ])
      m.set(x + a, h - 1, z + b, E("#fff4dc", 2.2));
    lights.push([x, h - 2, z, "#fff4dc"]);
  };
  /** A roof fan: square housing, dark throat, four blades and a hub. */
  const fan = (x: number, y: number, z: number) => {
    m.box(x, y, z, x + 8, y + 2, z + 8, C("#3a3c46"));
    m.box(x + 1, y + 1, z + 1, x + 7, y + 2, z + 7, C("#101116"));
    m.box(x + 3, y + 2, z + 1, x + 5, y + 3, z + 7, C("#6a6c76"));
    m.box(x + 1, y + 2, z + 3, x + 7, y + 3, z + 5, C("#6a6c76"));
    m.set(x + 4, y + 3, z + 4, C("#9a9ca6"));
    m.box(x, y + 2, z, x + 8, y + 3, z + 1, C("#4a4c56"));
    m.box(x, y + 2, z + 7, x + 8, y + 3, z + 8, C("#4a4c56"));
  };
  /** A data-centre block: charcoal louvred walls, blue LED slits, fans on the roof, plant on top. */
  const dataCentre = (b: { x0: number; x1: number; z0: number; z1: number; h: number }, name: string) => {
    const { x0, x1, z0, z1, h } = b;
    m.box(x0, 1, z0, x1, h, z1, (x, y, z) => (y % 6 === 0 ? C("#26282f") : (x + z) % 2 ? C("#2e3038") : C("#34363f")));
    m.box(x0, 1, z0, x1, 4, z1, C("#4a4852"));
    // louvres and LED slits on the street faces (-z and -x)
    for (let x = x0 + 3; x < x1 - 2; x += 5) {
      m.box(x, 6, z0 - 1, x + 1, h - 12, z0, E("#59e3ff", 1.1));
      for (let y = 7; y < h - 12; y += 2) m.box(x + 1, y, z0 - 1, x + 4, y + 1, z0, C("#1c1d22"));
    }
    for (let z = z0 + 3; z < z1 - 2; z += 5) {
      m.box(x0 - 1, 6, z, x0, h - 12, z + 1, E("#59e3ff", 1.1));
      for (let y = 7; y < h - 12; y += 2) m.box(x0 - 1, y, z + 1, x0, y + 1, z + 4, C("#1c1d22"));
    }
    m.box(x0 - 1, h - 3, z0 - 1, x1, h - 2, z1, E("#3ef0ff", 1.4));
    m.box(x0 - 1, h, z0 - 1, x1 + 1, h + 1, z1 + 1, C("#2a2c34"));
    for (let x = x0 + 2; x + 8 <= x1 - 1; x += 10) for (let z = z0 + 2; z + 8 <= z1 - 1; z += 10) fan(x, h + 1, z);
    textBack(name, (x0 + x1) / 2, h - 5, z0 - 1, E("#e8f6ff", 1.4));
    walls.push([x0, z0, x1, z1]);
  };

  // ---- the PROOF FACTORY: the mining hall ----
  const cabs = ["#c0392b", "#2a6db0", "#e8e4dc", "#2f8a4a", "#e0a020", "#3a3a42"];
  /** Height of the sawtooth roof over row z (the glazed faces look south, onto the court). */
  const T = 10;
  const roofAt = (z: number) => HALL.h + Math.round((1 - ((z - HALL.z0) % T) / (T - 1)) * 9);
  {
    const { x0, x1, z0, z1, h } = HALL;
    const wallP = (x: number, y: number, z: number) => (y % 8 === 0 ? C("#2e2a38") : (x + z) % 2 ? C("#3e3a4a") : C("#46415a"));
    m.box(x0, 1, z0, x1, h, z1, wallP);
    m.box(x0, 1, z0, x1, 4, z1, C("#5a5862"));
    // the sawtooth: teeth along x, a lit glazed face on each looking south, dark metal slopes
    for (let z = z0; z < z1; z++) {
      const top = roofAt(z);
      const p = (z - z0) % T;
      m.box(x0, h, z, x1, top, z + 1, C("#3a3646"));
      m.box(x0, top, z, x1, top + 1, z + 1, p === 0 ? C("#5e5a6a") : C("#4a4656"));
      if (p === 0) m.box(x0 + 1, h + 1, z - 1, x1 - 1, top, z, (x, y) => (x % 4 === 0 || y === top - 1 ? C("#2a2632") : hash(x >> 2, z, 3, seed) < 0.25 ? G("#2a3040") : E("#8f7cc8", 0.32)));
    }
    // gables show the teeth; a violet neon line under the eaves, neon pilasters at the corners
    m.box(x0 - 1, h - 2, z0 - 1, x1 + 1, h - 1, z0, E("#b07bff", 1.8));
    m.box(x0 - 1, h - 2, z0, x0, h - 1, z1, E("#b07bff", 1.8));
    for (const x of [x0 - 1, x1]) m.box(x, 4, z0 - 1, x + 1, h - 2, z0, E("#b07bff", 1.4));
    // the mining floor seen through the glazing: rack after rack of ASICs, their LEDs
    for (let x = x0 + 2; x < x1 - 2; x++)
      for (let y = 17; y < 29; y++) {
        const col = (x - x0) % 7;
        const led = hash(x, y, 7, seed);
        m.set(x, y, z0 - 1, col === 0 ? C("#2a2632") : y === 17 || y === 28 ? C("#2a2632") : col === 3 && led > 0.35 ? (led > 0.93 ? E("#ffb547", 1.4) : E("#3ddc97", 1.1)) : G("#1c2230"));
      }
    // and on the east gable, high up
    for (let z = z0 + 4; z < z1 - 4; z++)
      for (let y = 20; y < 36; y++) {
        const col = (z - z0) % 7;
        const led = hash(z, y, 9, seed);
        m.set(x0 - 1, y, z, col === 0 ? C("#2a2632") : y === 20 || y === 35 ? C("#2a2632") : col === 3 && led > 0.35 ? (led > 0.9 ? E("#ffb547", 1.4) : E("#3ddc97", 1.1)) : G("#1c2230"));
      }
    // the sign board behind the big neon sign
    m.box(x0 + 8, 30, z0 - 2, x1 - 8, 43, z0 - 1, C("#141219"));
    m.box(x0 + 8, 29, z0 - 2, x1 - 8, 30, z0 - 1, E("#b07bff", 1.6));
    // the entrance: a glass lobby, its canopy and downlights
    m.box(MID - 9, 1, z0 - 1, MID + 10, 13, z0, (x, y) => (x === MID - 9 || x === MID + 9 || y === 12 ? C("#2a2632") : x === MID || x === MID + 1 ? C("#3a3646") : E("#ffe6b8", 0.75)));
    m.box(MID - 11, 13, z0 - 10, MID + 12, 15, z0, C("#2a2632"));
    m.box(MID - 11, 15, z0 - 10, MID + 12, 16, z0 - 9, E("#b07bff", 1.6));
    for (const x of [MID - 11, MID + 11]) m.box(x, 1, z0 - 10, x + 1, 13, z0 - 9, C("#5a5862"));
    for (let x = MID - 8; x < MID + 9; x += 4) m.set(x, 12, z0 - 5, E("#fff2d8", 1.6));
    lights.push([MID, 11, z0 - 5, "#ffe6b8"]);
    // the big screen's bezel and ledge (the live wall itself is mounted on it by the city)
    m.box(MID - 5, 20, z0 - 2, MID + 6, 29, z0, C("#121117"));
    for (let x = MID - 5; x < MID + 6; x++) for (const y of [20, 28]) if ((x + y) % 2 === 0) m.set(x, y, z0 - 3, E("#f4b728", 1.6));
    for (let y = 20; y < 29; y++) for (const x of [MID - 5, MID + 5]) if (y % 2 === 0) m.set(x, y, z0 - 3, E("#f4b728", 1.6));
    m.box(MID - 6, 19, z0 - 5, MID + 7, 20, z0, C("#3a3646"));
    // the loading docks: shutters, bumpers, yellow frames, dock lights, a canopy over each run
    const docks = [72, 88, 136, 152, 166];
    for (const bx of docks) {
      const live = bx === 152;
      if (live) {
        // the open bay: a lit recess where the hands bring the parcels out
        m.clear(bx - 5, 1, z0, bx + 5, 13, z0 + 6);
        m.box(bx - 5, 0, z0, bx + 5, 1, z0 + 6, C("#5a5862"));
        m.box(bx - 5, 1, z0 + 6, bx + 5, 13, z0 + 7, E("#e8dcff", 0.8));
        for (let x = bx - 4; x < bx + 4; x += 3) m.box(x, 1, z0 + 4, x + 2, 4, z0 + 6, C("#8a6a44"));
      } else for (let y = 1; y < 13; y++) m.box(bx - 5, y, z0 - 1, bx + 5, y + 1, z0, y % 2 ? C("#8a8692") : C("#76727e"));
      m.box(bx - 6, 13, z0 - 1, bx + 6, 14, z0, C("#e8b830"));
      for (const x of [bx - 6, bx + 5]) m.box(x, 1, z0 - 1, x + 1, 13, z0, C("#e8b830"));
      for (const x of [bx - 6, bx + 5]) m.box(x, 3, z0 - 2, x + 1, 7, z0 - 1, C("#1c1c20"));
      m.set(bx + 6, 10, z0 - 1, E(live ? "#3ddc97" : "#ffd08a", 1.8));
      // yellow hatching on the apron
      for (let z = z0 - 22; z < z0 - 1; z++) for (const x of [bx - 6, bx + 5]) m.set(x, 0, z, C("#e8b830"));
    }
    for (const [a, b] of [
      [x0 + 1, MID - 12],
      [MID + 13, x1 - 1],
    ])
      m.box(a, 14, z0 - 6, b, 15, z0, C("#3a3646"));
    // trucks backed up to the closed docks
    truck(68, z0 - 1, cabs[0], 1);
    truck(84, z0 - 1, cabs[2], -1);
    truck(132, z0 - 1, cabs[4], 11);
    truck(162, z0 - 1, cabs[1], -1);
    // the block press on the wall and the conveyor bridge out over the court to the loading tower
    m.box(BELT - 6, 25, z0 - 4, BELT + 7, 38, z0, C("#2c2836"));
    m.box(BELT - 3, 30, z0 - 5, BELT + 4, 35, z0 - 4, E("#f4b728", 1.8));
    m.box(BELT - 6, 38, z0 - 4, BELT + 7, 39, z0, E("#f4b728", 1.2));
    const b0 = 20,
      b1 = z0 - 4;
    m.box(BELT - 4, 26, b0, BELT + 5, 28, b1, C("#3a3744"));
    m.box(BELT - 3, 28, b0, BELT + 4, 30, b1, (_x, _y, z) => (z % 3 === 0 ? C("#55525e") : C("#141318")));
    for (const x of [BELT - 4, BELT + 4]) {
      m.box(x, 30, b0, x + 1, 31, b1, E("#b07bff", 1.4));
      m.box(x, 36, b0, x + 1, 37, b1, C("#5a5666"));
      for (let z = b0; z < b1; z++) {
        const t = (z - b0) % 12;
        const y = 31 + Math.round(((t < 6 ? t : 12 - t) / 6) * 5);
        m.set(x, y, z, C("#5a5666"));
        if (t === 0) m.box(x, 30, z, x + 1, 36, z + 1, C("#5a5666"));
      }
    }
    for (let z = b0; z < b1; z += 4) m.box(BELT - 4, 37, z, BELT + 5, 38, z + 2, C("#4a4656"));
    walls.push([x0, z0, x1, z1]);
  }
  // ---- the loading tower over the court: the belt drops the new blocks into a waiting box ----
  {
    const x0 = BELT - 11,
      x1 = BELT + 10,
      z0 = 3,
      z1 = 20,
      th = 42;
    for (const [x, z] of [
      [x0, z0],
      [x1 - 2, z0],
      [x0, z1 - 2],
      [x1 - 2, z1 - 2],
    ]) {
      m.box(x, 1, z, x + 2, th, z + 2, C("#c8c4bc"));
      walls.push([x, z, x + 2, z + 2]);
    }
    for (let y = 4; y < 24; y++) {
      const t = y % 10;
      for (const z of [z0, z1 - 1]) m.set(x0 + 2 + Math.round((t / 10) * (x1 - x0 - 5)), y, z, C("#a8a4ac"));
    }
    m.box(x0, 24, z0, x1, 26, z1, C("#5a5862"));
    m.box(x0 + 3, 26, z0 + 2, x1 - 3, 38, z1 - 1, (x, y) => (y % 4 === 0 ? C("#4a4656") : (x + y) % 2 ? C("#5e5a6c") : C("#645f72")));
    m.box(x0 + 3, 33, z0 + 1, x1 - 3, 34, z0 + 2, E("#b07bff", 1.6));
    textBack("OUT", BELT, 31, z0 + 1, E("#f4b728", 1.6), 1);
    m.box(x0, th, z0, x1, th + 1, z1, C("#3a3842"));
    m.set(BELT, th + 1, (z0 + z1) >> 1, E("#ff2a2a", 2.4));
    // the chute and a container on a flatbed under it, ready to go
    m.box(BELT - 2, 14, 10, BELT + 3, 24, 14, C("#3a3744"));
    m.box(x0 - 2, 1, 8, x1 + 6, 3, 16, C("#2a2a30"));
    for (const x of [x0, x0 + 4, x1 - 4]) for (const z of [7, 15]) m.box(x, 1, z, x + 2, 3, z + 2, C("#141418"));
    container(x0 - 1, 3, 8, 21, 11, "ZEC");
    m.box(x1 + 1, 2, 8, x1 + 9, 11, 16, C("#7a52b0"));
    m.box(x1 + 8, 6, 9, x1 + 9, 9, 15, G("#2a3448"));
    walls.push([x0 - 2, 8, x1 + 9, 16]);
  }

  // ---- the transparent DEPOT: a plain shed, clear panels, its open bay ----
  {
    const { x0, x1, z0, z1, h } = DEP;
    m.box(x0, 1, z0, x1, h, z1, (x, y, z) => (y > 16 && y < 22 ? G("#b8d8e8") : (x + z) % 2 ? C("#8e9aa6") : C("#9aa6b2")));
    m.box(x0, 1, z0, x1, 4, z1, C("#5a5862"));
    // a shallow gable roof, ridge along x
    const mid = (z0 + z1) / 2;
    for (let z = z0; z < z1; z++) {
      const top = h + Math.round((1 - Math.abs(z + 0.5 - mid) / ((z1 - z0) / 2)) * 10);
      m.box(x0, h, z, x1, top, z + 1, C("#8e9aa6"));
      m.box(x0 - 1, top, z, x1 + 1, top + 1, z + 1, z % 3 ? C("#b4bcc6") : C("#a2aab4"));
    }
    m.box(x0 - 1, h - 2, z0 - 1, x1 + 1, h - 1, z0, E("#e8f6ff", 1.4));
    const docks = [18, 34, 46];
    for (const bx of docks) {
      if (bx === 34) {
        m.clear(bx - 5, 1, z0, bx + 5, 13, z0 + 6);
        m.box(bx - 5, 0, z0, bx + 5, 1, z0 + 6, C("#5a5862"));
        m.box(bx - 5, 1, z0 + 6, bx + 5, 13, z0 + 7, E("#fff2d8", 0.8));
        for (let x = bx - 4; x < bx + 4; x += 3) m.box(x, 1, z0 + 4, x + 2, 4, z0 + 6, C("#8a6a44"));
      } else for (let y = 1; y < 13; y++) m.box(bx - 5, y, z0 - 1, bx + 5, y + 1, z0, y % 2 ? C("#c4c8d0") : C("#b0b4bc"));
      m.box(bx - 6, 13, z0 - 1, bx + 6, 14, z0, C("#e8b830"));
      m.set(bx + 6, 10, z0 - 1, E(bx === 34 ? "#3ddc97" : "#ffd08a", 1.8));
      for (let z = z0 - 22; z < z0 - 1; z++) for (const x of [bx - 6, bx + 5]) m.set(x, 0, z, C("#e8b830"));
    }
    m.box(x0 + 1, 14, z0 - 6, x1 - 1, 15, z0, C("#5a5862"));
    truck(14, z0 - 1, cabs[3], 4);
    truck(42, z0 - 1, cabs[5], -1);
    walls.push([x0, z0, x1, z1]);
  }

  // ---- the data centres ----
  dataCentre(DCB, "DC-B");
  dataCentre(DCA, "DC-A");
  // the hall's skybridge to DC-B, and cable trays from DC-A to the station
  m.box(HALL.x1, 20, 84, DCB.x0, 27, 98, (x, y) => (y === 23 ? E("#59e3ff", 1.2) : (x + y) % 2 ? C("#3e3a4a") : C("#46415a")));
  for (let x = DCA.x1; x < PS + 4; x++) {
    m.set(x, 24, 40, C("#a8a6ae"));
    m.set(x, 24, 42, C("#59e3ff"));
    if (x % 8 === 0) m.box(x, 1, 39, x + 1, 25, 44, C("#5a5862"));
  }

  // ---- the power station ----
  const steam: [number, number, number][] = [];
  {
    // cooling tower: a hyperboloid shell, ribbed, on slanted legs
    const cx = 240,
      cz = 32;
    const CT = 78;
    const rAt = (y: number) => 20 * Math.sqrt(1 + ((y - 58) / 30) ** 2);
    for (let y = 6; y < CT; y++) {
      const R = rAt(y);
      for (let z = Math.floor(cz - R - 1); z <= cz + R + 1; z++)
        for (let x = Math.floor(cx - R - 1); x <= cx + R + 1; x++) {
          const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
          if (d > R || d < R - 2) continue;
          const ang = Math.atan2(z - cz, x - cx);
          const streak = hash(Math.round(ang * 40), y >> 3, 0, seed) < 0.25;
          m.set(x, y, z, y > CT - 3 ? C("#6e6a74") : Math.round(ang * 40) % 6 === 0 ? C("#9a96a0") : streak ? C("#a6a2ac") : C("#b4b0ba"));
        }
    }
    // the legs: a ring of diagonal columns, the basin inside
    const R0 = rAt(6);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      for (let y = 0; y < 6; y++) {
        const aa = a + (i % 2 ? 1 : -1) * (y / 6) * 0.1;
        m.box(cx + Math.cos(aa) * (R0 - 1), y + 1, cz + Math.sin(aa) * (R0 - 1), cx + Math.cos(aa) * (R0 - 1) + 1, y + 2, cz + Math.sin(aa) * (R0 - 1) + 1, C("#8c8892"));
      }
    }
    m.cylinder(cx, 0, cz, R0 - 1, 2, C("#3a5a6a"));
    steam.push([cx, CT + 4, cz]);

    // turbine hall
    const hx0 = PS + 2,
      hx1 = W - 2,
      hz0 = 66,
      hz1 = 108,
      hh = 48;
    const panel = (x: number, y: number, z: number) => ((x + z) % 2 ? C("#5a6878") : C("#647282"));
    m.box(hx0, 1, hz0, hx1, hh, hz1, panel);
    m.box(hx0, 1, hz0, hx1, 6, hz1, C("#4a4852"));
    // a monitor roof light along the ridge
    m.box(hx0 + 6, hh, hz0 + 14, hx1 - 6, hh + 6, hz1 - 14, C("#4e5c6c"));
    m.box(hx0 + 6, hh + 1, hz0 + 14, hx1 - 6, hh + 4, hz0 + 15, G("#a8bccc"));
    m.box(hx0 + 6, hh + 1, hz1 - 15, hx1 - 6, hh + 4, hz1 - 14, G("#a8bccc"));
    m.box(hx0 - 1, hh, hz0 - 1, hx1 + 1, hh + 1, hz1 + 1, C("#3a3842"));
    // tall windows on the north face, lit at night
    for (let x = hx0 + 4; x < hx1 - 4; x += 8) {
      m.box(x, 10, hz1 - 1, x + 4, 40, hz1, G("#2a3448"));
      for (let y = 12; y < 40; y += 6) if (hash(x, y, 1, seed) > 0.45) m.box(x, y, hz1 - 2, x + 4, y + 4, hz1 - 1, E("#ffe0a8", 0.8));
      m.box(x - 1, 10, hz1, x, 40, hz1 + 1, C("#3a3842"));
    }
    // big doors at the west end for the turbines
    m.box(hx0 - 1, 1, hz0 + 10, hx0, 26, hz0 + 26, (_x, y) => (y % 2 ? C("#8a8692") : C("#76727e")));
    // boiler house: taller, darker, between the hall and the chimneys
    const bx0 = PS + 4,
      bx1 = 248,
      bz0 = hz1,
      bz1 = 132,
      bh = 70;
    m.box(bx0, 1, bz0, bx1, bh, bz1, (x, y, z) => (y % 12 === 0 ? C("#3a3842") : (x + z) % 2 ? C("#4e4a56") : C("#544f5c")));
    for (let x = bx0 + 3; x < bx1 - 3; x += 6) for (let y = 14; y < bh - 6; y += 12) m.box(x, y, bz1 - 1, x + 3, y + 4, bz1, hash(x, y, 2, seed) > 0.5 ? E("#ffb46b", 1.0) : G("#2a3448"));
    // a steel stair tower on the side, ducts to the chimneys
    m.box(bx1, 1, bz0 + 4, bx1 + 6, bh - 4, bz0 + 10, (x, y) => (y % 4 === 0 ? C("#c0392b") : (x + y) % 4 === 0 ? C("#a8352a") : 0));
    m.box(bx1, 40, bz0 + 14, 266, 48, bz0 + 20, C("#7a7882"));
    // the chimneys: tall, red-and-white bands, a gallery, aviation lights
    for (const [sx, sz, sh] of [
      [256, 122, 110],
      [268, 108, 96],
    ]) {
      for (let y = 1; y < sh; y++) {
        const R = 5.5 - (y / sh) * 1.5;
        const band = Math.floor((sh - y) / 9) % 2 === 0 && y > sh - 45;
        m.cylinder(sx, y, sz, R, 1, band ? C("#c0392b") : C(y % 9 === 0 ? "#b8b4ae" : "#d8d4cc"));
      }
      m.cylinder(sx, 1, sz, 7, 6, C("#8c8892"));
      m.cylinder(sx, sh - 14, sz, 6, 1, C("#3a3842"));
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        m.box(sx + Math.cos(ang) * 5.6, sh - 13, sz + Math.sin(ang) * 5.6, sx + Math.cos(ang) * 5.6 + 1, sh - 11, sz + Math.sin(ang) * 5.6 + 1, C("#3a3842"));
      }
      m.cylinder(sx, sh - 1, sz, 4.2, 1, C("#2a2830"));
      m.cylinder(sx, sh - 1, sz, 2.6, 1, C("#121014"));
      for (const [a, b] of [
        [-4, 0],
        [4, 0],
        [0, -4],
        [0, 4],
      ])
        m.set(sx + a, sh, sz + b, E("#ff2a2a", 2.4));
      steam.push([sx, sh + 2, sz]);
    }
    // the switchyard on the quay: transformers, gantries, insulators
    const sx0 = 252,
      sx1 = W - 2,
      sz0 = 136,
      sz1 = D - 4;
    m.box(sx0, 0, sz0, sx1, 1, sz1, shades(["#6a645c", "#5e5852", "#746e66"], 1, seed + 3));
    for (let z = sz0 + 4; z < sz1 - 6; z += 10) {
      m.box(sx0 + 3, 1, z, sx0 + 11, 9, z + 6, C("#4a5a4a"));
      for (let x = sx0 + 3; x < sx0 + 11; x += 2) m.box(x, 2, z - 1, x + 1, 8, z, C("#3a4a3a"));
      for (const x of [sx0 + 4, sx0 + 7, sx0 + 10]) m.box(x, 9, z + 2, x + 1, 13, z + 3, (_x, y) => (y % 2 ? C("#a85a3a") : C("#d8d4cc")));
      m.box(sx0 + 14, 1, z + 2, sx0 + 15, 26, z + 3, C("#8a8892"));
      m.box(sx1 - 2, 1, z + 2, sx1 - 1, 26, z + 3, C("#8a8892"));
      m.box(sx0 + 14, 26, z + 2, sx1 - 1, 27, z + 3, C("#8a8892"));
      for (let x = sx0 + 16; x < sx1 - 2; x += 3) m.set(x, 25, z + 2, C("#c0c4cc"));
    }
    fence(sx0 - 1, sz0 - 1, sx1, sz0 - 1);
    fence(sx0 - 1, sz0 - 1, sx0 - 1, sz1);
    // ground round the station
    m.box(PS, 0, 62, W, 1, 66, C("#8c8892"));
  }

  // ---- the ship-to-shore cranes on the quay ----
  const crane = (x: number, lifting: boolean) => {
    const red = C("#c8322a"),
      redD = C("#9a2620"),
      white = C("#e6e2da"),
      whiteD = C("#c8c4bc");
    const zA = 138,
      zB = 158,
      gx = 26; // legs at x, x+gx; z zA, zB
    const deck = 66;
    for (const dx of [0, gx])
      for (const z of [zA, zB]) {
        m.box(x + dx, 2, z, x + dx + 3, deck, z + 3, (xx, y, zz) => (y % 12 === 0 ? redD : pnt(red, xx, y, zz)));
        m.box(x + dx - 2, 1, z - 2, x + dx + 5, 4, z + 5, C("#3a3842")); // bogies
        for (const ww of [z - 2, z + 3]) m.box(x + dx - 2, 1, ww, x + dx + 5, 2, ww + 1, C("#141418"));
      }
    // sill beams and portal ties
    for (const dx of [0, gx]) {
      m.box(x + dx, 18, zA, x + dx + 3, 21, zB + 3, red);
      m.box(x + dx, deck - 4, zA, x + dx + 3, deck, zB + 3, red);
    }
    for (const z of [zA, zB]) m.box(x, deck - 4, z, x + gx + 3, deck, z + 3, red);
    // diagonal bracing between the legs
    for (let t = 0; t <= 1; t += 0.02) {
      const y = 21 + t * (deck - 25);
      for (const dx of [0, gx]) {
        m.box(x + dx, y, zA + t * (zB - zA), x + dx + 3, y + 1, zA + t * (zB - zA) + 2, redD);
      }
    }
    // the boom: a white box girder from the backreach out over the river, two rails under it
    const b0 = 108,
      b1 = D + OVER - 1;
    m.box(x + 2, deck, b0, x + gx + 1, deck + 2, b1, white);
    m.box(x + 2, deck + 2, b0, x + 4, deck + 7, b1, whiteD);
    m.box(x + gx - 1, deck + 2, b0, x + gx + 1, deck + 7, b1, whiteD);
    for (let z = b0; z < b1; z += 6) {
      m.box(x + 2, deck + 7, z, x + gx + 1, deck + 8, z + 1, whiteD);
    }
    m.box(x + 2, deck + 7, b0, x + 4, deck + 8, b1, white);
    m.box(x + gx - 1, deck + 7, b0, x + gx + 1, deck + 8, b1, white);
    // red bands on the boom
    for (const z of [b0 + 2, D + 2, b1 - 3]) m.box(x + 2, deck, z, x + gx + 1, deck + 8, z + 2, red);
    // machinery house at the back of the boom
    m.box(x + 4, deck + 2, b0 + 1, x + gx - 1, deck + 12, b0 + 16, white);
    m.box(x + 4, deck + 12, b0 + 1, x + gx - 1, deck + 13, b0 + 16, C("#9a98a0"));
    for (let xx = x + 6; xx < x + gx - 3; xx += 4) m.box(xx, deck + 6, b0, xx + 2, deck + 9, b0 + 1, C("#3a3842"));
    text("ZEC", x + 9, deck + 11, b0 + 16, red, 1);
    // the A-frame and its forestays out to the boom tip and back to the house
    const apexY = H - 6,
      apexZ = zB + 1;
    for (const dx of [2, gx - 1]) {
      for (let y = deck + 8; y < apexY; y++) {
        const t = (y - deck - 8) / (apexY - deck - 8);
        m.box(x + dx, y, zA + t * (apexZ - zA), x + dx + 2, y + 1, zA + t * (apexZ - zA) + 2, white);
        m.box(x + dx, y, zB + 8 - t * 8, x + dx + 2, y + 1, zB + 10 - t * 8, white);
      }
    }
    m.box(x + 2, apexY, apexZ - 1, x + gx + 1, apexY + 3, apexZ + 3, red);
    m.set(x + gx / 2, apexY + 3, apexZ, E("#ff2a2a", 2.4));
    for (const dx of [3, gx]) {
      const steps = 200;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        m.set(x + dx, apexY + t * (deck + 8 - apexY), apexZ + t * (b1 - 4 - apexZ), C("#9a98a0"));
        m.set(x + dx, apexY + t * (deck + 13 - apexY), apexZ + t * (b0 + 8 - apexZ), C("#9a98a0"));
      }
    }
    // the trolley with the operator's cab hanging under it, and the spreader
    const tz = lifting ? D + 8 : 150;
    m.box(x + 4, deck - 3, tz - 4, x + gx - 1, deck, tz + 4, C("#3a3842"));
    m.box(x + 6, deck - 9, tz + 2, x + 13, deck - 3, tz + 8, white);
    m.box(x + 6, deck - 8, tz + 7, x + 13, deck - 4, tz + 8, G("#2a3448"));
    m.box(x + 6, deck - 9, tz + 2, x + 13, deck - 8, tz + 8, G("#2a3448"));
    m.set(x + 9, deck - 6, tz + 8, E("#ffe0a8", 1.0));
    const sy = lifting ? 34 : 50;
    for (const dx of [8, gx - 7]) for (const dz of [-3, 3]) m.box(x + dx, sy + 9, tz + dz, x + dx + 1, deck - 3, tz + dz + 1, C("#2a2a30"));
    m.box(x + 4, sy + 8, tz - 4, x + gx - 1, sy + 9, tz + 4, C("#e8b830"));
    if (lifting) container(x + 4, sy, tz - 4, 21, 10, "ZEC");
    // warning lights at the leg tops and a walkway rail along the boom
    for (const dx of [0, gx]) m.set(x + dx + 1, deck, zA - 1, E("#ffb547", 1.6));
    for (let z = b0; z < b1; z += 2) m.set(x + 1, deck + 3, z, C("#c8c4bc"));
    m.box(x + 1, deck + 4, b0, x + 2, deck + 5, b1, C("#c8c4bc"));
    lights.push([x + gx / 2, deck - 4, tz, "#fff4dc"]);
  };
  crane(30, true);
  crane(120, false);

  // a few boxes waiting on the quay under the cranes, and a stack between them
  container(70, 1, 142, 36, 5, "SAPLING");
  container(70, 9, 142, 36, 2, "ZEC");
  container(70, 1, 151, 36, 9, "SHIELD");
  container(160, 1, 146, 18, 7, null);
  for (let i = 0; i < 3; i++) container(208 + i * 2, 1 + i * 8, 140, 36, (i * 5 + 1) % BOX_COLORS.length, LABELS[(i + 5) % LABELS.length]);

  // ---- the rail siding behind the factory: flat wagons with boxes, the shunter ----
  for (let x = 6, i = 0; x + 40 < PS - 20; x += 46, i++) {
    if (i === 2) continue;
    m.box(x, 2, RAIL + 1, x + 40, 4, RAIL + 7, C("#4a3a32"));
    m.box(x, 4, RAIL + 1, x + 40, 5, RAIL + 7, C("#5a4a40"));
    for (const xx of [x + 3, x + 33]) m.box(xx, 1, RAIL + 1, xx + 4, 3, RAIL + 7, C("#1c1c20"));
    m.box(x - 1, 3, RAIL + 3, x, 4, RAIL + 5, C("#2a2a30"));
    container(x + 2, 5, RAIL, 36, (i * 5 + 3) % BOX_COLORS.length, LABELS[(i + 3) % LABELS.length]);
  }
  {
    const x = PS - 34;
    m.box(x, 2, RAIL + 1, x + 26, 4, RAIL + 7, C("#2a2a30"));
    m.box(x + 2, 4, RAIL + 1, x + 18, 12, RAIL + 7, C("#e8b830"));
    m.box(x + 18, 4, RAIL, x + 26, 16, RAIL + 8, C("#c0392b"));
    m.box(x + 19, 11, RAIL, x + 25, 14, RAIL + 8, G("#2a3448"));
    m.box(x + 18, 16, RAIL, x + 26, 17, RAIL + 8, C("#3a3842"));
    for (let xx = x + 2; xx < x + 18; xx += 4) m.box(xx, 4, RAIL + 7, xx + 1, 12, RAIL + 8, C("#2a2a30"));
    m.box(x + 8, 12, RAIL + 3, x + 10, 15, RAIL + 5, C("#3a3842"));
    for (const xx of [x + 2, x + 18]) m.box(xx, 1, RAIL + 1, xx + 6, 3, RAIL + 7, C("#141418"));
    m.set(x + 26, 8, RAIL + 4, E("#fff2d0", 1.6));
  }
  walls.push([0, RAIL, PS, RAIL + 8]);

  // ---- the second conveyor: from the hall's roof over the siding to the shipping hopper on the quay ----
  {
    const cx = 164,
      y0 = 46;
    m.box(cx - 4, y0, HALL.z1 - 6, cx + 5, y0 + 2, 146, C("#3a3744"));
    m.box(cx - 3, y0 + 2, HALL.z1 - 6, cx + 4, y0 + 3, 146, C("#141318"));
    for (const x of [cx - 4, cx + 4]) {
      m.box(x, y0 + 3, HALL.z1 - 6, x + 1, y0 + 4, 146, E("#b07bff", 1.4));
      m.box(x, y0 + 8, HALL.z1 - 6, x + 1, y0 + 9, 146, C("#5a5666"));
      for (let z = HALL.z1 - 6; z < 146; z += 6) m.box(x, y0 + 3, z, x + 1, y0 + 8, z + 1, C("#5a5666"));
    }
    // a trestle over the rails
    m.box(cx - 3, 1, RAIL - 2, cx - 1, y0, RAIL - 0, C("#7a7882"));
    m.box(cx + 2, 1, RAIL - 2, cx + 4, y0, RAIL - 0, C("#7a7882"));
    // the hopper tower on the quay
    const hx0 = cx - 10,
      hx1 = cx + 10,
      hz0 = 140,
      hz1 = 156;
    for (const [x, z] of [
      [hx0, hz0],
      [hx1 - 2, hz0],
      [hx0, hz1 - 2],
      [hx1 - 2, hz1 - 2],
    ])
      m.box(x, 1, z, x + 2, y0 + 12, z + 2, C("#c8c4bc"));
    m.box(hx0 + 2, y0 - 10, hz0 + 1, hx1 - 2, y0 + 10, hz1 - 1, (x, y) => (y % 4 === 0 ? C("#4a4656") : (x + y) % 2 ? C("#5e5a6c") : C("#645f72")));
    m.box(hx0, y0 + 12, hz0, hx1, y0 + 13, hz1, C("#3a3842"));
    m.box(hx0 + 2, y0 + 4, hz0, hx1 - 2, y0 + 5, hz0 + 1, E("#b07bff", 1.6));
    m.box(cx - 2, 12, hz0 + 5, cx + 3, y0 - 10, hz0 + 10, C("#3a3744"));
    container(hx0 + 1, 1, hz0 + 4, 18, 11, null);
    walls.push([hx0, hz0, hx1, hz1]);
  }

  // ---- the truck gate on the boulevard (east edge) ----
  const G0 = LANE - 12,
    G1 = LANE + 12;
  {
    // the canopy over the gate, its pillars, the name on its fascia
    for (const z of [G0 - 2, G1 + 1]) for (const x of [0, 10]) m.box(x, 1, z, x + 1, 18, z + 1, C("#7a7882"));
    m.box(0, 17, G0 - 3, 12, 22, G1 + 3, C("#2a2632"));
    m.box(0, 22, G0 - 3, 12, 23, G1 + 3, C("#3a3646"));
    m.box(0, 21, G0 - 3, 1, 22, G1 + 3, E("#b07bff", 1.6));
    m.box(0, 22, G0 - 3, 12, 23, G0 - 2, E("#b07bff", 1.6));
    m.box(0, 22, G1 + 2, 12, 23, G1 + 3, E("#b07bff", 1.6));
    textEast("GATE 1", (G0 + G1) / 2, 21, 0, E("#ecebe6", 1.4));
    for (let z = G0; z < G1; z += 6) m.box(2, 17, z, 8, 18, z + 3, E("#f0f4ff", 1.6));
    lights.push([5, 15, LANE, "#f0f4ff"]);
    // barrier posts, the arms up (a truck is due any minute)
    for (const z of [G0, G1 - 1]) {
      m.box(12, 1, z, 14, 6, z + 1, C("#3a3842"));
      for (let y = 6; y < 17; y++) m.set(13, y, z, (y >> 1) % 2 ? C("#e8e4dc") : C("#c0392b"));
      m.set(13, 5, z, E("#3ddc97", 1.6));
    }
    // the gatehouse
    const gz = 3;
    m.box(4, 1, gz, 18, 12, gz + 9, C("#d8d4cc"));
    m.box(4, 1, gz, 18, 3, gz + 9, C("#5a5862"));
    m.box(3, 5, gz + 1, 4, 10, gz + 8, G("#2a3448"));
    m.box(5, 5, gz + 9, 17, 10, gz + 10, G("#2a3448"));
    m.box(6, 5, gz + 9, 12, 9, gz + 10, E("#ffe0a8", 0.9));
    m.box(2, 12, gz - 1, 20, 13, gz + 11, C("#3a3842"));
    walls.push([4, gz, 18, gz + 9]);
    // speed bumps
    for (const x of [20, 22]) m.box(x, 1, G0, x + 1, 2, G1, (_x, _y, z) => ((z >> 1) % 2 ? C("#e8b830") : C("#2a2a30")));
  }
  // ---- the visitors' gate on the ring road, in line with the entrance ----
  {
    for (const x of [MID - 7, MID + 7]) m.box(x, 1, 0, x + 1, 18, 2, C("#2a2632"));
    m.box(MID - 8, 18, 0, MID + 9, 23, 2, C("#2a2632"));
    m.box(MID - 8, 23, 0, MID + 9, 24, 2, E("#b07bff", 1.6));
    textBack("VISITORS", MID + 0.5, 22, 0, E("#ecebe6", 1.4));
    // turnstiles
    for (const x of [MID - 4, MID, MID + 4]) {
      m.box(x, 1, 3, x + 1, 5, 7, C("#9a98a2"));
      m.set(x, 5, 3, E("#3ddc97", 1.4));
    }
    lights.push([MID, 16, 2, "#e8dcff"]);
  }

  // ---- fences round the site, with the gates ----
  fence(0, 1, MID - 7, 1);
  fence(MID + 8, 1, PS, 1);
  fence(1, 1, 1, G0 - 2);
  fence(1, G1 + 2, 1, QUAY);
  fence(W - 2, 1, W - 2, QUAY);
  // floodlight masts over the court and on the quay
  mast(58, 6, 64);
  mast(166, 6, 64);
  mast(236, QUAY + 10, 60);

  const signs: SignSpot[] = [
    { text: "EQUIHASH POWER", color: "#f4b728", x: (PS + 2 + W - 2) / 2, y: 44, z: 108.6, w: 56, h: 5, vertical: false, facing: "front" },
    // the big ones face the court and the ring road (-z): the city turns them round
    Object.assign({ text: "PROOF FACTORY · 証明工場", color: "#c89bff", x: (HALL.x0 + HALL.x1) / 2, y: 36.5, z: HALL.z0 - 2.2, w: HALL.x1 - HALL.x0 - 20, h: 11, vertical: false, facing: "front" } as SignSpot, { back: true }),
    Object.assign({ text: "TRANSPARENT DEPOT · 透明", color: "#e8f6ff", x: (DEP.x0 + DEP.x1) / 2, y: 24.5, z: DEP.z0 - 1.2, w: DEP.x1 - DEP.x0 - 4, h: 8, vertical: false, facing: "front" } as SignSpot, { back: true }),
  ];
  const points: Record<string, [number, number, number]> = {
    gate: [0, 0, LANE],
    // the mining hall's city-side bits: miners on the entrance plaza, the live wall, the press
    ...Object.fromEntries(
      [
        [104, 52],
        [MID, 50],
        [128, 52],
        [MID, 50],
        [MID, 40],
        [104, 44],
      ].map(([x, z], i) => [`patrol${i}`, [x, 0, z] as [number, number, number]]),
    ),
    screen: [MID + 0.5, 24, HALL.z0 - 3.4],
    hall: [MID + 0.5, 20, HALL.z0 - 3.2],
    press: [BELT + 0.5, 30, HALL.z0 - 6],
    beltEnd: [BELT + 0.5, 30, 22],
    roof: [(HALL.x0 + HALL.x1) / 2, HALL.h + 9, HALL.z0 + 1],
    camPos: [MID, 70, -60],
    camLook: [MID, 24, HALL.z0],
    // the live docks (wall base, the middle of the bay) and the way out to the gate
    dockProof: [152, 0, HALL.z0],
    dockDepot: [34, 0, DEP.z0],
  };
  [
    [152, LANE + 10],
    [140, LANE],
    [60, LANE],
    [8, LANE],
    [-6, LANE],
  ].forEach(([x, z], i) => (points[`proofOut${i}`] = [x, 0, z]));
  [
    [34, LANE + 10],
    [24, LANE],
    [8, LANE],
    [-6, LANE],
  ].forEach(([x, z], i) => (points[`depotOut${i}`] = [x, 0, z]));
  // steam0/steam1 are the chimneys, steam2 the cooling tower: put the chimneys first
  [steam[1], steam[2], steam[0]].forEach((s, i) => (points[`steam${i}`] = s));
  walls.push([PS, 66, W, 132], [200, 4, W, 66]);
  return {
    model: m,
    signs,
    door: [MID + 0.5, 0],
    body: [0, 0, W, D],
    walls,
    lights: [...lights, [PS + 30, 40, 112, "#ffb46b"], [(DCB.x0 + DCB.x1) / 2, 20, DCB.z0 - 4, "#59e3ff"]],
    points,
    scale: k,
  };
}
