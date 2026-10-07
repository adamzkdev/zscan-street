import type { Built } from "../buildings";
import { C, E, G, hash, rand, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, lampPost, leafTree } from "./needle";

/**
 * TOUR EIFFEL: Gustave Eiffel's wrought-iron tower (~80 m with its antenna) standing in a narrow
 * Champ-de-Mars garden. Four latticed legs on stone piers curve up to the first floor (a square
 * ring with its frieze, glass pavilions and the hollow centre), carry the great arches between
 * them, join the second floor and taper into one long shaft to the enclosed summit, Eiffel's
 * campanile with the beacon and the antenna. Bronze-brown iron with gold lamps along the edges;
 * lawns, gravel alleys of trees, a carousel, kiosks, benches and the ticket booths at the feet.
 *
 * The tower is modelled in real metres (324 m) and squeezed to the lot: VS voxels a real metre up,
 * HS across (slimmer than life so the 125 m base fits a 27 m deep lot).
 *
 * Points (model voxels, scale 2):
 *  - `floor1`, `floor2`, `summit`: centre of each platform's deck (summit = top terrace).
 *  - `beacon`: the rotating lighthouse beacon on the campanile.
 *  - `door` / `keeper`: the ticket booth at the front east leg.
 *  - `carousel`: centre of the carousel (top of its roof).
 *  - `camPos` / `camLook`: a nice exterior viewpoint.
 */
export function eiffel(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const VS = 0.72; // voxels per real metre, vertically
  const HS = 0.53; // horizontally
  const H = 244;
  const m = new VoxelModel(W, H, D);
  const r = rand(seed);
  const lights: Built["lights"] = [];
  const cx = W / 2,
    cz = D / 2 - 0.5;
  const vy = (h: number) => Math.round(h * VS);

  // half width of the tower's outer edge (real metres) at real height h: the famous curve
  const hwReal = (h: number) => 4.2 + 58.3 * Math.exp(-h / 82);
  const legReal = (h: number) => Math.max(9, 26 - h * 0.13);
  const hwV = (y: number) => hwReal(y / VS) * HS;
  const legV = (y: number) => legReal(y / VS) * HS;

  const Y1 = vy(57), // first floor deck (top of the platform)
    Y2 = vy(115),
    YT = vy(276),
    YI = vy(196); // the small intermediate gallery

  const iron = shades(["#6e5240", "#664b3a", "#76584a", "#6a4e3e"], 6, seed);
  const ironDark = shades(["#55402f", "#4e3a2b", "#5a4434"], 6, seed + 1);
  const gold = E("#ffc85a", 2.2);
  const goldSoft = E("#ffb648", 1.4);
  // the inner girders carry the warm sodium lighting: brown iron by day, amber at night
  const glowIron = E("#9a6428", 0.75);
  const stone = shades(["#bdb3a0", "#b4aa96", "#c4baa6"], 2, seed);

  // ---- ground: the Champ de Mars ------------------------------------------------------------------
  const gravel = shades(["#d6c8a8", "#cfc0a0", "#dccfb0"], 4, seed + 3);
  const lawn: Paint = (x, _y, z) => (Math.floor((x - z * 0.3) / 5) % 2 ? C("#5f9a44") : C("#56903e"));
  m.box(0, 0, 0, W, 1, D, gravel);
  const baseHW = Math.ceil(hwV(0));
  const gx0 = Math.floor(cx - baseHW - 8),
    gx1 = Math.ceil(cx + baseHW + 8);
  // two parterres each side, cut by a cross of gravel alleys, edged with low box hedges
  const hedge = shades(["#2f6a34", "#336f38", "#2a6030"], 1, seed + 4);
  const parterre = (x0: number, z0: number, x1: number, z1: number) => {
    m.box(x0, 0, z0, x1, 1, z1, lawn);
    for (let x = x0; x < x1; x++) {
      m.set(x, 1, z0, hedge);
      m.set(x, 1, z1 - 1, hedge);
    }
    for (let z = z0; z < z1; z++) {
      m.set(x0, 1, z, hedge);
      m.set(x1 - 1, 1, z, hedge);
    }
  };
  const sideL = [4, gx0 - 3],
    sideR = [gx1 + 3, W - 4];
  for (const [a, b] of [sideL, sideR]) {
    const mid = Math.round((a + b) / 2);
    parterre(a, 12, mid - 3, Math.round(cz) - 2);
    parterre(mid + 3, 12, b, Math.round(cz) - 2);
    parterre(a, Math.round(cz) + 3, mid - 3, D - 12);
    parterre(mid + 3, Math.round(cz) + 3, b, D - 12);
    // flower beds in the middle of each front parterre
    const fl = ["#e05a6a", "#f2c84a", "#f4f0f0", "#c46ad8"];
    for (const [px0, px1] of [
      [a + 4, mid - 7],
      [mid + 7, b - 4],
    ])
      for (let x = px0; x < px1; x++)
        for (let z = Math.round(cz) + 7; z < D - 16; z++) if ((x + z) % 3 !== 0 && hash(x, z, 5) > 0.2) m.set(x, 1, z, C(fl[Math.floor((x - px0) / 3) % fl.length]));
  }
  // the pavement strip along the street, kerb lights
  m.box(0, 0, D - 7, W, 1, D, shades(["#cfcac0", "#c8c3b8"], 2, seed));
  for (let x = 2; x < W; x += 9) m.set(x, 0, D - 7, C("#9a958a"));
  // the esplanade under the tower: stone with a compass rose of darker setts
  for (let z = 6; z < D - 7; z++)
    for (let x = gx0; x < gx1; x++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      const a = Math.atan2(z + 0.5 - cz, x + 0.5 - cx);
      let c: number = (Math.floor(x / 6) + Math.floor(z / 6)) % 2 ? C("#d2c8b4") : C("#cbc1ac");
      if (Math.abs(d - 14) < 0.6 || Math.abs(d - 6) < 0.5) c = C("#8a7f6c");
      else if (d < 14 && Math.abs(((a / (Math.PI * 2)) * 16 + 16.5) % 1 - 0.5) < 0.06) c = C("#a89a7c");
      if (d < 2) c = C("#c9a227");
      m.set(x, 0, z, c);
    }

  // ---- the iron: legs, arches, platforms, shaft ------------------------------------------------------
  /** Is (u along a face of length len, y) a member of the lattice? `P` panel size. */
  const lattice = (u: number, len: number, y: number, P: number, post = 1.5) => {
    if (u < post || u > len - post) return 2; // corner post
    const yy = ((y % P) + P) % P;
    if (yy === 0) return 3;
    const a = (((u + y) % P) + P) % P,
      b = (((u - y) % P) + P) % P;
    return a < 1 || b < 1 ? 1 : 0;
  };
  /** Draw the lattice ring of a square box [x0,x1]×[z0,z1] at layer y. */
  const ring = (x0: number, z0: number, x1: number, z1: number, y: number, P: number, lampEvery = 0, plain: { x?: number; z?: number } = {}) => {
    const X0 = Math.round(x0),
      X1 = Math.round(x1),
      Z0 = Math.round(z0),
      Z1 = Math.round(z1);
    const lx = X1 - X0,
      lz = Z1 - Z0;
    const put = (x: number, z: number, t: number) => {
      if (!t) return;
      if (t === 3) return void m.set(x, y, z, glowIron);
      const lamp = lampEvery && t === 2 && y % lampEvery === 0;
      m.set(x, y, z, lamp ? gold : t === 2 ? ironDark : iron);
    };
    // faces turned to the inside of the tower only get their posts and horizontals
    const simple = (t: number, u: number, len: number) => (u < 1.5 || u > len - 1.5 ? 2 : y % P === 0 ? 3 : t && 0);
    const zx = plain.z === undefined ? -1 : Math.round(plain.z),
      xz = plain.x === undefined ? -1 : Math.round(plain.x);
    for (let x = X0; x <= X1; x++) {
      for (const z of [Z0, Z1]) {
        const t = lattice(x - X0, lx, y, P);
        put(x, z, z === zx ? simple(t, x - X0, lx) : t);
      }
    }
    for (let z = Z0; z <= Z1; z++) {
      for (const x of [X0, X1]) {
        const t = lattice(z - Z0, lz, y + 3, P);
        put(x, z, x === xz ? simple(t, z - Z0, lz) : t);
      }
    }
  };
  const legs: [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  // stone piers at the feet
  const pierH = 4;
  for (const [sx, sz] of legs) {
    const hw = hwV(0),
      lw = legV(0);
    const a = cx + sx * (hw - lw / 2),
      b = cz + sz * (hw - lw / 2);
    m.box(a - lw / 2 - 1, 1, b - lw / 2 - 1, a + lw / 2 + 1, pierH, b + lw / 2 + 1, stone);
    m.box(a - lw / 2 - 1, pierH, b - lw / 2 - 1, a + lw / 2 + 1, pierH + 1, b + lw / 2 + 1, C("#a69c88"));
  }
  // the four legs up to the second floor, then one shaft
  for (let y = pierH; y < YT; y++) {
    const hw = hwV(y);
    const P = y < Y1 ? 9 : y < Y2 ? 8 : 6;
    if (y < Y2 + 4) {
      const lw = Math.min(legV(y), hw);
      for (const [sx, sz] of legs) {
        const xo = cx + sx * hw,
          xi = cx + sx * (hw - lw);
        const zo = cz + sz * hw,
          zi = cz + sz * (hw - lw);
        ring(Math.min(xo, xi), Math.min(zo, zi), Math.max(xo, xi), Math.max(zo, zi), y, P, 0, { x: xi, z: zi });
        // a solid outer corner edge (the main girder), lamps on it
        const ex = Math.round(sx > 0 ? Math.max(xo, xi) : Math.min(xo, xi)),
          ez = Math.round(sz > 0 ? Math.max(zo, zi) : Math.min(zo, zi));
        m.set(ex, y, ez, y % 8 === 0 ? gold : ironDark);
        m.set(ex - sx, y, ez, ironDark);
        m.set(ex, y, ez - sz, ironDark);
      }
    }
    if (y >= Y2 - 2) {
      // above the second floor the legs close into one square shaft
      ring(cx - hw, cz - hw, cx + hw, cz + hw, y, P, 8);
    }
  }
  // the great arches between the legs (decorative, under the first floor), with their spandrels
  const archPlane = hwV(26);
  const archTop = Y1 - 7;
  const archSpring = 10;
  const archHalf = hwV(18) - legV(18) + 1.5;
  for (const side of [0, 1, 2, 3]) {
    for (let u = -Math.ceil(archHalf) - 2; u <= Math.ceil(archHalf) + 2; u++) {
      const t = Math.min(1, Math.abs(u) / archHalf);
      const ya = archSpring + (archTop - archSpring) * Math.sqrt(Math.max(0, 1 - t * t));
      for (let y = Math.floor(ya) - 1; y < Y1 - 4; y++) {
        let c: Paint = 0;
        if (y <= ya + 1) c = ironDark;
        else if (y < ya + 3) c = (u + y) % 3 === 0 ? iron : 0;
        else {
          // the spandrel: a frieze of small diamonds and rings
          const q = ((u % 4) + 4) % 4,
            p = ((y % 4) + 4) % 4;
          c = q === 0 || p === 0 || (q === 2 && p === 2) ? iron : 0;
        }
        if (!c) continue;
        const [x, z] = side === 0 ? [cx + u, cz + archPlane] : side === 1 ? [cx + u, cz - archPlane] : side === 2 ? [cx + archPlane, cz + u] : [cx - archPlane, cz + u];
        m.set(x, y, z, c);
        // the arch is two members deep
        if (y <= ya + 1) m.set(side < 2 ? x : x - Math.sign(x - cx), y, side < 2 ? z - Math.sign(z - cz) : z, ironDark);
      }
      // gold lamps along the arch's underside
      if (Math.abs(u) % 3 === 0 && t < 0.98) {
        const [x, z] = side === 0 ? [cx + u, cz + archPlane] : side === 1 ? [cx + u, cz - archPlane] : side === 2 ? [cx + archPlane, cz + u] : [cx - archPlane, cz + u];
        m.set(x, Math.floor(ya) - 2, z, goldSoft);
      }
    }
  }

  // ---- platforms -----------------------------------------------------------------------------------
  const platform = (yDeck: number, half: number, hole: number, thick: number, frieze: boolean) => {
    const yb = yDeck - thick;
    for (let y = yb; y < yDeck; y++)
      for (let z = Math.floor(cz - half); z <= Math.ceil(cz + half); z++)
        for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
          const dx = Math.abs(x + 0.5 - cx),
            dz = Math.abs(z + 0.5 - cz);
          const d = Math.max(dx, dz);
          if (d > half || d < hole) continue;
          const outer = d > half - 1;
          const innerEdge = d < hole + 1;
          if (outer && frieze) {
            // the frieze: bronze panels with a gold lamp line along the bottom and top
            const along = dx > dz ? z : x;
            m.set(x, y, z, y === yb ? gold : y === yDeck - 1 ? goldSoft : along % 6 === 0 ? ironDark : C("#7a5c46"));
          } else if (outer || innerEdge || y === yDeck - 1) m.set(x, y, z, y === yDeck - 1 && !outer ? C("#8a7a68") : ironDark);
        }
    // little arcades under the frieze
    if (frieze)
      for (let z = Math.floor(cz - half); z <= Math.ceil(cz + half); z++)
        for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
          const dx = Math.abs(x + 0.5 - cx),
            dz = Math.abs(z + 0.5 - cz);
          if (Math.max(dx, dz) > half || Math.max(dx, dz) < half - 1) continue;
          const along = ((dx > dz ? z : x) % 4 + 4) % 4;
          if (along === 0) m.set(x, yb - 1, z, ironDark), m.set(x, yb - 2, z, ironDark);
          else if (along === 1 || along === 3) m.set(x, yb - 1, z, ironDark);
        }
    // the railing: posts, a top rail and a mesh
    for (let z = Math.floor(cz - half); z <= Math.ceil(cz + half); z++)
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const dx = Math.abs(x + 0.5 - cx),
          dz = Math.abs(z + 0.5 - cz);
        const d = Math.max(dx, dz);
        if (d > half || d < half - 1) continue;
        m.set(x, yDeck + 3, z, ironDark);
        if ((x + z) % 3 === 0) m.box(x, yDeck, z, x + 1, yDeck + 3, z + 1, ironDark);
        else m.set(x, yDeck + 1, z, G("#9aa6b0"));
      }
  };

  // first floor: a broad square ring round the open centre
  const P1 = Math.round(hwV(Y1) + 2.5);
  const H1 = Math.round(P1 * 0.42);
  platform(Y1, P1, H1, 6, true);
  // the glass floor round the hole, and the glass pavilions (58 Tour Eiffel, Ferrié)
  for (let z = Math.floor(cz - H1 - 2); z <= Math.ceil(cz + H1 + 2); z++)
    for (let x = Math.floor(cx - H1 - 2); x <= Math.ceil(cx + H1 + 2); x++) {
      const d = Math.max(Math.abs(x + 0.5 - cx), Math.abs(z + 0.5 - cz));
      if (d >= H1 && d < H1 + 2) m.set(x, Y1 - 1, z, G("#b8d8e8"));
    }
  const pav = (x0: number, z0: number, x1: number, z1: number, h: number, warm = true) => {
    for (let y = Y1; y < Y1 + h; y++)
      for (let z = z0; z < z1; z++)
        for (let x = x0; x < x1; x++) {
          const edge = x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1;
          if (!edge) continue;
          const mull = (x + z) % 3 === 0 || y === Y1 + h - 1 || y === Y1;
          m.set(x, y, z, mull ? C("#4a3a30") : y < Y1 + h - 2 && warm && hash(x, y, z, seed) > 0.35 ? E("#ffd9a0", 1.2) : G("#a9c4d4"));
        }
    m.box(x0 - 1, Y1 + h, z0 - 1, x1 + 1, Y1 + h + 1, z1 + 1, C("#3e3028"));
    m.box(x0, Y1 + h + 1, z0, x1, Y1 + h + 2, z1, C("#c8c2b6"));
    // the roof edge glows a little
    for (let x = x0 - 1; x <= x1; x++) m.set(x, Y1 + h, z1, goldSoft);
  };
  const pIn = Math.round(H1 + 3),
    pOut = Math.round(P1 - 3);
  pav(Math.round(cx - pOut), Math.round(cz + pIn), Math.round(cx + pOut), Math.round(cz + pOut), 8); // front: 58 Tour Eiffel
  pav(Math.round(cx - pOut), Math.round(cz - pOut), Math.round(cx + pOut), Math.round(cz - pIn), 7, false); // back: Ferrié pavilion
  lights.push([cx, Y1 + 4, cz + pOut + 1, "#ffcf80"]);

  // second floor: a smaller ring round the elevator well, with a glazed kiosk and two decks
  const P2 = Math.round(hwV(Y2) + 2.5);
  const H2 = 3;
  platform(Y2, P2, H2, 4, true);
  for (let y = Y2; y < Y2 + 6; y++)
    for (let z = Math.round(cz - P2 + 3); z < Math.round(cz + P2 - 2); z++)
      for (let x = Math.round(cx - P2 + 3); x < Math.round(cx + P2 - 2); x++) {
        const d = Math.max(Math.abs(x + 0.5 - cx), Math.abs(z + 0.5 - cz));
        if (d > P2 - 3.5 && d <= P2 - 2.5) m.set(x, y, z, (x + z + y) % 4 === 0 ? C("#4a3a30") : y > Y2 && y < Y2 + 5 && hash(x, y, z, 3) > 0.4 ? E("#ffe0b0", 1.1) : G("#a9c4d4"));
      }
  m.box(Math.round(cx - P2 + 3), Y2 + 6, Math.round(cz - P2 + 3), Math.round(cx + P2 - 2), Y2 + 7, Math.round(cz + P2 - 2), C("#3e3028"));
  // the Jules Verne's dark windows hang just under the second floor
  for (let x = Math.round(cx - P2 + 1); x < Math.round(cx + P2); x++) m.set(x, Y2 - 6, Math.round(cz + P2 - 2), (x % 2 ? E("#ffcf90", 1.3) : C("#2a2420")));

  // intermediate gallery, a thin balcony ring
  const PI = Math.round(hwV(YI) + 1.5);
  for (let z = Math.floor(cz - PI); z <= Math.ceil(cz + PI); z++)
    for (let x = Math.floor(cx - PI); x <= Math.ceil(cx + PI); x++) {
      const d = Math.max(Math.abs(x + 0.5 - cx), Math.abs(z + 0.5 - cz));
      if (d <= PI && d > PI - 2) {
        m.set(x, YI, z, ironDark);
        m.set(x, YI - 1, z, d > PI - 1 ? goldSoft : 0);
        if (d > PI - 1 && (x + z) % 2 === 0) m.set(x, YI + 1, z, ironDark);
      }
    }

  // central elevator rails from the second floor to the summit
  for (let y = Y2; y < YT; y++) m.set(Math.floor(cx), y, Math.floor(cz), C("#3a2e26"));
  // an elevator cabin on its way up (between the floors)
  m.box(Math.floor(cx) - 1, vy(190), Math.floor(cz) - 1, Math.floor(cx) + 2, vy(190) + 4, Math.floor(cz) + 2, C("#d8c070"));
  // the inclined lifts in the legs (yellow cabins) — east legs
  for (const [sx, sz, h] of [
    [1, 1, 30],
    [-1, -1, 22],
    [1, -1, 88],
  ]) {
    const y = vy(h);
    const hw = hwV(y),
      lw = legV(y);
    const a = cx + sx * (hw - lw / 2),
      b = cz + sz * (hw - lw / 2);
    m.box(a - 2, y, b - 2, a + 2, y + 4, b + 2, C("#c8a040"));
    m.box(a - 2, y + 1, b + 1, a + 2, y + 3, b + 2, E("#fff2c8", 1.1));
  }

  // ---- the summit: enclosed lantern, open terrace, Eiffel's campanile, beacon, antenna -----------------
  const PT = Math.round(hwV(YT) + 2);
  m.box(cx - PT, YT - 2, cz - PT, cx + PT + 1, YT, cz + PT + 1, ironDark);
  for (let x = Math.round(cx - PT); x <= Math.round(cx + PT); x++) m.set(x, YT - 2, Math.round(cz + PT), gold);
  // the glazed lower room
  for (let y = YT; y < YT + 5; y++)
    for (let z = Math.round(cz - PT + 1); z <= Math.round(cz + PT - 1); z++)
      for (let x = Math.round(cx - PT + 1); x <= Math.round(cx + PT - 1); x++) {
        const d = Math.max(Math.abs(x - cx), Math.abs(z - cz));
        if (d < PT - 1.5) continue;
        m.set(x, y, z, (x + z) % 3 === 0 ? ironDark : y < YT + 4 ? E("#ffe2b0", 0.9) : G("#a9c4d4"));
      }
  m.box(cx - PT, YT + 5, cz - PT, cx + PT + 1, YT + 6, cz + PT + 1, ironDark);
  // open terrace railing
  for (let z = Math.round(cz - PT); z <= Math.round(cz + PT); z++)
    for (let x = Math.round(cx - PT); x <= Math.round(cx + PT); x++) {
      const d = Math.max(Math.abs(x - cx), Math.abs(z - cz));
      if (d >= PT - 0.5) m.box(x, YT + 6, z, x + 1, YT + ((x + z) % 2 ? 8 : 9), z + 1, ironDark);
    }
  // the campanile: four curved ribs to a little lantern
  const camp = YT + 6;
  for (let y = camp; y < camp + 12; y++) {
    const t = (y - camp) / 12;
    const s = (PT - 1.5) * (1 - t * 0.75);
    for (const [sx, sz] of legs) m.set(cx + sx * s, y, cz + sz * s, ironDark);
    if ((y - camp) % 4 === 0) ring(cx - s, cz - s, cx + s, cz + s, y, 3);
  }
  const by = camp + 12;
  m.box(cx - 2, by, cz - 2, cx + 3, by + 4, cz + 3, (x, y, z) => ((x + z + y) % 2 ? E("#fff1c8", 2.6) : C("#2a2622")));
  m.box(cx - 3, by + 4, cz - 3, cx + 4, by + 5, cz + 4, ironDark);
  m.box(cx - 1, by + 5, cz - 1, cx + 2, by + 7, cz + 2, C("#e8e4dc"));
  // the antenna mast: red and white bands, dishes, a red light on top
  for (let y = by + 7; y < H - 2; y++) {
    const band = Math.floor((y - by) / 3) % 2;
    m.set(cx, y, cz, band ? C("#d8d4cc") : C("#b83a32"));
    if (y < by + 14) m.set(cx + 1, y, cz, C("#cfcac0"));
  }
  m.box(cx - 1, by + 10, cz + 1, cx + 2, by + 12, cz + 2, C("#e8e8e8"));
  m.box(cx + 1, by + 14, cz - 1, cx + 2, by + 16, cz + 1, C("#e8e8e8"));
  m.box(cx, H - 2, cz, cx + 1, H, cz + 1, E("#ff2a2a", 4));

  // ---- under the tower: ticket booths at the feet, queue lines, the security fence -----------------
  const signs: SignSpot[] = [];
  const booth = (bx: number, bz: number, face: 1 | -1, label: boolean) => {
    m.box(bx - 4, 1, bz - 3, bx + 4, 8, bz + 3, C("#5a3e30"));
    for (let x = bx - 3; x < bx + 3; x++) for (let y = 3; y < 7; y++) m.set(x, y, bz + 3 * face - (face > 0 ? 1 : 0), x % 2 ? E("#ffe0a8", 1.2) : G("#a8c0cc"));
    m.box(bx - 5, 8, bz - 4, bx + 5, 9, bz + 4, C("#3e2c24"));
    m.box(bx - 4, 9, bz - 3, bx + 4, 10, bz + 3, C("#6a4c3a"));
    m.box(bx - 4, 8, bz + 4 * face - (face > 0 ? 1 : 0), bx + 4, 9, bz + 4 * face + (face > 0 ? 0 : 1), gold);
    if (label) signs.push({ text: "BILLETS · TICKETS", color: "#f4b728", x: bx, y: 7.5, z: bz + 3 * face + 0.1, w: 8, h: 1.2, vertical: false, facing: "front" });
  };
  const footZ = Math.round(cz + hwV(0) - legV(0) / 2);
  const bxE = Math.round(cx + hwV(0) - legV(0) / 2),
    bxW = Math.round(cx - hwV(0) + legV(0) / 2);
  // booths stand just inside each front leg, facing the street
  booth(bxE - Math.round(legV(0) / 2) - 6, footZ + 2, 1, true);
  booth(bxW + Math.round(legV(0) / 2) + 6, footZ + 2, 1, false);
  // queue: brass posts with ropes snaking in front of the east booth
  const qx0 = bxE - Math.round(legV(0) / 2) - 13;
  for (let row = 0; row < 3; row++) {
    const qz = footZ + 7 + row * 3;
    for (let x = qx0; x < qx0 + 13; x += 3) m.box(x, 1, qz, x + 1, 4, qz + 1, C("#c8a860"));
    for (let x = qx0; x < qx0 + 13; x++) m.set(x, 3, qz, C("#8a2228"));
  }
  // people queueing (simple figures)
  const coat = ["#2a3a5a", "#7a2a2a", "#d8c8a8", "#2a2a30", "#3a6a4a", "#b05a8a", "#e0e0e0"];
  for (let i = 0; i < 16; i++) {
    const x = qx0 + 1 + ((i * 3) % 12),
      z = footZ + 8 + Math.floor(i / 4) * 3 - (i % 2);
    if (z > D - 8) continue;
    m.box(x, 1, z, x + 1, 4, z + 1, C(coat[Math.floor(hash(i, 1, 2, seed) * coat.length)]));
    m.set(x, 4, z, C(["#e8c8a0", "#c89a70", "#8a5a3a"][i % 3]));
    m.set(x, 5, z, C(["#2a2020", "#6a4a2a", "#d8c070"][i % 3]));
  }
  // a low glass security fence round the esplanade, gaps at the front
  for (let x = gx0; x < gx1; x++)
    for (const z of [7, D - 9]) {
      if (z === D - 9 && Math.abs(x - cx) < 12) continue;
      if (z === D - 9 && x > qx0 - 3 && x < qx0 + 16) continue;
      m.set(x, 1, z, x % 4 === 0 ? C("#3a3a40") : G("#c8dce4"));
      m.set(x, 2, z, x % 4 === 0 ? C("#3a3a40") : G("#c8dce4"));
    }

  // ---- the gardens: alleys of trees, carousel, kiosks, benches, lamps -----------------------------------
  const tree = shades(["#3d7a3a", "#2f6a30", "#4a8a40", "#356f35"], 3, seed + 7);
  for (const [a, b] of [sideL, sideR]) {
    for (let x = a + 3; x < b - 2; x += 9) {
      leafTree(m, x, 1, 5, k, seed + x, 7.5, tree);
      leafTree(m, x + 4, 1, D - 10, k, seed + x * 3, 6.5, tree);
    }
    const mid = Math.round((a + b) / 2);
    bench(m, mid - 9, 1, Math.round(cz), k);
    bench(m, mid + 4, 1, Math.round(cz), k);
    const p = lampPost(m, mid, 1, Math.round(cz) + 1, k, "#ffd08a", 4);
    lights.push([p[0], p[1], p[2], "#ffd08a"]);
  }
  // the carousel in the west garden: striped canopy, gold poles, horses, warm bulbs
  const ccx = Math.round((sideL[0] + sideL[1]) / 2),
    ccz = Math.round(cz) + 13;
  const cr = 8;
  m.cylinder(ccx, 1, ccz, cr, 1, C("#d8c8a8"));
  m.cylinder(ccx, 2, ccz, 2, 9, C("#d8b860"));
  for (let y = 11; y < 17; y++) {
    const rr = cr + 1 - (y - 11) * 1.5;
    for (let z = ccz - cr - 2; z <= ccz + cr + 2; z++)
      for (let x = ccx - cr - 2; x <= ccx + cr + 2; x++) {
        const d = Math.hypot(x + 0.5 - ccx, z + 0.5 - ccz);
        if (d > rr || d < rr - 1.6) continue;
        const a = Math.atan2(z - ccz, x - ccx);
        const s = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 16) % 2;
        m.set(x, y, z, y === 11 ? (Math.floor(a * 8) % 2 ? E("#ffe8b0", 2) : C("#c8a040")) : s ? C("#c83a3a") : C("#f0ece4"));
      }
  }
  m.box(ccx, 17, ccz, ccx + 1, 20, ccz + 1, C("#d8b860"));
  m.set(ccx, 20, ccz, E("#ffd060", 2));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = Math.round(ccx + Math.cos(a) * (cr - 1.5)),
      z = Math.round(ccz + Math.sin(a) * (cr - 1.5));
    m.box(x, 2, z, x + 1, 11, z + 1, C("#e8c860"));
    const hc = C(["#f4f0e8", "#3a2a20", "#c8a070", "#e8e0d0"][i % 4]);
    m.box(x - 1, 4 + (i % 2), z, x + 2, 6 + (i % 2), z + 1, hc);
    m.set(x + 1, 6 + (i % 2), z, hc);
  }
  lights.push([ccx, 9, ccz, "#ffd890"]);
  signs.push({ text: "CARROUSEL", color: "#ff6a8a", x: ccx, y: 15, z: ccz + cr - 1.4, w: 9, h: 1.6, vertical: false, facing: "front" });
  // Parisian kiosks (green Morris columns and a crêpes stand) in the east garden
  const kx = Math.round((sideR[0] + sideR[1]) / 2);
  const morris = (x: number, z: number) => {
    m.cylinder(x, 1, z, 2.2, 10, (xx, y) => (y > 2 && y < 9 ? C(["#e8d8a8", "#c84a3a", "#3a5a8a", "#e8e0d0"][(xx + y) % 4]) : C("#2e5a3a")));
    m.cylinder(x, 11, z, 2.8, 1, C("#2e5a3a"));
    m.cylinder(x, 12, z, 1.8, 2, C("#2e5a3a"));
    m.set(x, 14, z, C("#c8a860"));
  };
  morris(kx - 10, Math.round(cz) + 14);
  morris(sideL[1] - 5, Math.round(cz) - 12);
  // crêpes stand: green wooden hut with a striped awning
  const sx0 = kx + 2,
    sz0 = Math.round(cz) + 10;
  m.box(sx0, 1, sz0, sx0 + 10, 9, sz0 + 6, C("#2e5a3a"));
  m.box(sx0 + 1, 4, sz0 + 6, sx0 + 9, 7, sz0 + 7, E("#ffe0a0", 1.3));
  m.box(sx0 - 1, 9, sz0 - 1, sx0 + 11, 10, sz0 + 7, C("#24442e"));
  for (let x = sx0; x < sx0 + 10; x++) for (let z = sz0 + 6; z < sz0 + 9; z++) m.set(x, 8 - (z - sz0 - 6) * 0.5, z, x % 2 ? C("#f0ece4") : C("#2e7a4a"));
  signs.push({ text: "CRÊPES", color: "#ffd080", x: sx0 + 5, y: 8, z: sz0 + 6.2, w: 8, h: 1.2, vertical: false, facing: "front" });
  // a souvenir cart and a few strollers
  m.box(kx - 3, 1, Math.round(cz) - 8, kx + 3, 5, Math.round(cz) - 5, C("#7a2a2a"));
  for (let i = 0; i < 6; i++) m.box(kx - 3 + i, 5, Math.round(cz) - 7, kx - 2 + i, 7 + (i % 2), Math.round(cz) - 6, C("#6e5240"));
  for (let i = 0; i < 22; i++) {
    const side = i % 2 ? sideR : sideL;
    const x = Math.round(side[0] + 4 + r() * (side[1] - side[0] - 8));
    const z = Math.round(cz) + (r() > 0.5 ? 1 : -1);
    m.box(x, 1, z, x + 1, 4, z + 1, C(coat[i % coat.length]));
    m.set(x, 4, z, C(["#e8c8a0", "#c89a70", "#8a5a3a"][i % 3]));
  }
  // lamps along the front pavement
  for (let x = 6; x < W; x += 24) {
    if (Math.abs(x - cx) < 14) continue;
    const p = lampPost(m, x, 1, D - 3, k, "#ffd08a", 4.5);
    if (x < 10 || x > W - 30) lights.push([p[0], p[1], p[2], "#ffd08a"]);
  }
  // floodlights at the feet, pointing up at the iron (glowing heads)
  for (const [sx, sz] of legs) m.box(cx + sx * (hwV(0) + 1.5), 1, cz + sz * (hwV(0) - 3), cx + sx * (hwV(0) + 1.5) + 1, 3, cz + sz * (hwV(0) - 3) + 1, E("#ffc860", 3));
  for (const [sx, sz] of legs) lights.push([cx + sx * (hwV(0) - 4), 18, cz + sz * (hwV(0) - 4), "#ffc060"]);

  const doorX = bxE - Math.round(legV(0) / 2) - 6;
  return {
    model: m,
    signs,
    door: [doorX, D - 1],
    body: [0, 0, W, D],
    // only the four legs (stone piers) and the booths block the way: people walk under the tower
    walls: [
      ...legs.map(([sx, sz]) => {
        const a = cx + sx * (hwV(0) - legV(0) / 2),
          b = cz + sz * (hwV(0) - legV(0) / 2),
          h = legV(0) / 2 + 1;
        return [Math.round(a - h), Math.round(b - h), Math.round(a + h), Math.round(b + h)] as [number, number, number, number];
      }),
      [doorX - 5, footZ - 1, doorX + 5, footZ + 6],
      [bxW + Math.round(legV(0) / 2) + 1, footZ - 1, bxW + Math.round(legV(0) / 2) + 11, footZ + 6],
      [ccx - cr, ccz - cr, ccx + cr, ccz + cr],
    ],
    lights,
    scale: k,
    points: {
      floor1: [cx, Y1, cz + P1 - 2],
      floor2: [cx, Y2, cz + P2 - 2],
      summit: [cx, YT + 6, cz],
      beacon: [cx + 0.5, by + 2, cz + 0.5],
      keeper: [doorX, 1, footZ + 6],
      carousel: [ccx, 17, ccz],
      camPos: [cx + 150, 150, D + 230],
      camLook: [cx, 100, cz],
    },
  };
}
