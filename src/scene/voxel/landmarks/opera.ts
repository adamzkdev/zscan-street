import type { Built } from "../buildings";
import { C, E, G, hash, rand, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { lampPost } from "./needle";

/**
 * SYDNEY OPERA HOUSE on its granite pier in the bay. A podium of red-brown granite panels carries
 * the two halls, side by side: the Concert Hall (west, the bigger) and the Joan Sutherland
 * Theatre, each a row of three nested white shells opening on the bay (-z) and a small one turned
 * back over the steps. The shells are ceramic tile lids in the chevron pattern (gloss white and
 * matte cream), ribbed concrete underneath; their mouths are closed by pleated topaz glass walls,
 * lit warm at the foyer levels. The Bennelong restaurant's three little shells sit on the west
 * wing, open to the city. In front: the monumental steps (the full width of the podium), the
 * forecourt where the promenade from the quay arrives, lamps and people.
 *
 * Points (model voxels, scale 2): `keeper` at the foot of the steps, `sail1` / `sail2` the tips of
 * the two main shells, `camPos` / `camLook` a nice exterior viewpoint.
 */
export function opera(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 96;
  const m = new VoxelModel(W, H, D);
  const r = rand(seed);
  const lights: Built["lights"] = [];
  const walls: NonNullable<Built["walls"]> = [];
  const signs: SignSpot[] = [];
  const mid = Math.floor(W / 2);

  // ---- ground: the granite broadwalk round the podium, big slabs -------------------------------
  const slab: Paint = (x, _y, z) => {
    if (x % 6 === 0 || z % 6 === 0) return C("#a29a90");
    const h = hash(x >> 1, 0, z >> 1, seed);
    return C(h < 0.33 ? "#c9c1b5" : h < 0.66 ? "#c2baae" : "#cec6ba");
  };
  m.box(0, 0, 0, W, 1, D, slab);
  // the sea wall's edge and its bronze railing (open where the promenade comes in)
  const rail = C("#8a7454"),
    post = C("#4a4038");
  const edge = (x0: number, z0: number, x1: number, z1: number) => {
    m.box(x0, 0, z0, x1, 1, z1, C("#8f877c"));
    for (let x = x0; x < x1; x++)
      for (let z = z0; z < z1; z++) {
        if ((x + z) % 6 === 0) m.box(x, 1, z, x + 1, 4, z + 1, post);
        m.set(x, 4, z, rail);
      }
  };
  const gap0 = mid - 15,
    gap1 = mid + 15;
  edge(0, 0, W, 1);
  edge(0, 0, 1, D);
  edge(W - 1, 0, W, D);
  edge(0, D - 1, gap0, D);
  edge(gap1, D - 1, W, D);

  // ---- the podium -----------------------------------------------------------------------------
  const PX0 = 7,
    PX1 = W - 7,
    PZ0 = 5,
    PZ1 = 78,
    PY = 13;
  const podium: Paint = (x, y, z) => {
    // pre-cast granite-aggregate panels: grooves every 3 rows, joints every 8
    if (y % 3 === 0) return C("#6a4e42");
    if ((x + z) % 8 === 0) return C("#6f5346");
    const h = hash(x >> 2, y >> 1, z >> 2, seed + 3);
    return C(h < 0.33 ? "#8a6656" : h < 0.66 ? "#83604f" : "#91705e");
  };
  m.box(PX0, 1, PZ0, PX1, PY, PZ1, podium);
  // a cornice and the broadwalk on top
  m.box(PX0 - 1, PY - 1, PZ0 - 1, PX1 + 1, PY, PZ1, C("#9a7a68"));
  const deck: Paint = (x, _y, z) => {
    if (x % 5 === 0 || z % 5 === 0) return C("#b4a596");
    const h = hash(x, 1, z, seed + 4);
    return C(h < 0.5 ? "#cdbfae" : "#c6b8a7");
  };
  m.box(PX0, PY, PZ0, PX1, PY + 1, PZ1, deck);
  const PT = PY + 1;
  // doors, service openings and lit windows in the podium sides
  for (let z = PZ0 + 8; z < PZ1 - 6; z += 12) {
    for (const x of [PX0 - 1, PX1]) {
      m.box(x, 1, z, x + 1, 7, z + 4, C("#2a2220"));
      m.box(x, 2, z + 1, x + 1, 6, z + 3, E("#ffc87a", 1.1));
    }
  }
  for (let x = PX0 + 6; x < PX1 - 6; x += 10) {
    m.box(x, 3, PZ0 - 1, x + 5, 8, PZ0, G("#2a2a32"));
    m.box(x, 4, PZ0 - 1, x + 5, 5, PZ0, E("#ffd49a", 0.9));
  }
  // broadwalk railing round the deck (bronze)
  for (let x = PX0; x < PX1; x++)
    for (const z of [PZ0]) {
      if (x % 6 === 0) m.box(x, PT, z, x + 1, PT + 3, z + 1, post);
      m.set(x, PT + 3, z, rail);
    }
  for (let z = PZ0; z < PZ1; z++)
    for (const x of [PX0, PX1 - 1]) {
      if (z % 6 === 0) m.box(x, PT, z, x + 1, PT + 3, z + 1, post);
      m.set(x, PT + 3, z, rail);
    }

  // ---- the monumental steps and the Bennelong wing ---------------------------------------------
  const SX0 = 34,
    SX1 = PX1;
  const stepP: Paint = (x, y, z) => {
    if ((z + y) % 2 === 0) return C("#b8a898");
    return C(hash(x >> 2, y, z, seed + 5) < 0.5 ? "#cdbfae" : "#c8baa9");
  };
  const NSTEP = PY;
  for (let i = 0; i < NSTEP; i++) {
    const y1 = PT - i,
      z0 = PZ1 + i * 2;
    m.box(SX0, 1, z0, SX1, y1, z0 + 2, podium);
    m.box(SX0, y1 - 1, z0, SX1, y1, z0 + 2, stepP);
  }
  const SZ1 = PZ1 + NSTEP * 2;
  // bronze handrails running down the steps
  for (const hx of [SX0 + 2, SX0 + 24, mid + 14, SX1 - 26, SX1 - 3]) {
    for (let i = 0; i < NSTEP; i++) {
      const y1 = PT - i,
        z0 = PZ1 + i * 2;
      if (i % 2 === 0) m.box(hx, y1, z0, hx + 1, y1 + 3, z0 + 1, post);
      m.box(hx, y1 + 3, z0, hx + 1, y1 + 4, z0 + 2, rail);
    }
  }
  // the west wing under the restaurant: granite with a glazed front onto the forecourt
  const BX0 = PX0,
    BX1 = SX0,
    BZ1 = PZ1 + 20;
  m.box(BX0, 1, PZ1, BX1, PY, BZ1, podium);
  m.box(BX0, PY, PZ1, BX1, PY + 1, BZ1, deck);
  m.box(BX0 + 3, 2, BZ1 - 1, BX1 - 3, 10, BZ1, G("#2c2a30"));
  for (let x = BX0 + 3; x < BX1 - 3; x += 4) m.box(x, 2, BZ1 - 1, x + 1, 10, BZ1, C("#3a3128"));
  m.box(BX0 + 3, 3, BZ1 - 1, BX1 - 3, 4, BZ1, E("#ffcf8a", 1.2));
  for (let x = BX0; x < BX1; x++) {
    if (x % 3 === 0) m.box(x, PT, BZ1 - 1, x + 1, PT + 3, BZ1, post);
    m.set(x, PT + 3, BZ1 - 1, rail);
  }
  // the box office doors under the steps' west end
  m.box(SX0, 1, SZ1 - 3, SX0 + 2, 9, SZ1, C("#6a4e42"));

  // ---- the shells ---------------------------------------------------------------------------------
  interface Shell {
    cx: number;
    /** z of the tip, the mouth's foot (behind the tip) and the back. */
    zt: number;
    zm: number;
    zb: number;
    h: number;
    w: number;
    /** -1: opens to -z (the bay); +1: opens to +z. */
    dir: -1 | 1;
    y0: number;
    glass?: boolean;
  }
  // a pointed (gothic) arch: two circular arcs meeting at the ridge
  const AR = 1.7,
    A0 = Math.sqrt(AR * AR - (AR - 1) ** 2);
  const arch = (u: number) => Math.sqrt(Math.max(0, AR * AR - (u + AR - 1) ** 2)) / A0;
  /** Is (x, y, z) inside the shell grown inwards by `t` voxels (the mouth stays open)? */
  /** The sides between a shell's feet are arched open (the glazed louvres): the edge's height. */
  const sideCut = (s: Shell, b: number) => {
    const L = Math.abs(s.zb - s.zt),
      bm = Math.abs(s.zm - s.zt);
    if (b <= bm || b >= L) return 0;
    return s.h * 0.3 * Math.pow(Math.sin((Math.PI * (b - bm)) / (L - bm)), 0.7);
  };
  const inside = (s: Shell, x: number, y: number, z: number, t: number, cut = true) => {
    const L = Math.abs(s.zb - s.zt);
    const b = (z + 0.5 - s.zt) * (s.dir < 0 ? 1 : -1);
    if (b < 0 || b > L) return false;
    const yr = y + 0.5 - s.y0;
    if (yr < 0 || yr > s.h) return false;
    const bm = Math.abs(s.zm - s.zt);
    if (cut && b < bm * Math.pow(1 - yr / s.h, 0.62)) return false;
    if (cut && yr < sideCut(s, b)) return false;
    const tb = 1 - b / L;
    const rb = s.h * Math.pow(tb, 0.8) - t;
    if (rb <= 0) return false;
    const wb = s.w * (1 - 0.32 * (b / L)) - t;
    if (wb <= 0) return false;
    const u = Math.abs(x + 0.5 - s.cx) / wb;
    if (u >= 1) return false;
    return yr <= rb * arch(u);
  };
  const gloss = [C("#f7f5ef"), C("#f4f1ea"), C("#f7f5ef")],
    matte = C("#e6dcc6"),
    lid = C("#d0c2a4"),
    under = [C("#d9d0c0"), C("#cfc5b4")],
    rib = C("#bdb19e");
  const shell = (s: Shell) => {
    const z0 = Math.min(s.zt, s.zb) - 1,
      z1 = Math.max(s.zt, s.zb) + 1;
    const x0 = Math.floor(s.cx - s.w - 1),
      x1 = Math.ceil(s.cx + s.w + 1),
      y1 = s.y0 + s.h + 1;
    // the uncut shell, solid, on a grid (below the podium counts as inside: no skin on the floor)
    const GW = x1 - x0 + 1,
      GH = y1 - s.y0 + 1,
      GD = z1 - z0 + 1;
    const full = new Uint8Array(GW * GH * GD);
    for (let z = z0; z <= z1; z++)
      for (let y = s.y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) full[x - x0 + GW * (y - s.y0 + GH * (z - z0))] = inside(s, x, y, z, 0, false) ? 1 : 0;
    const isIn = (x: number, y: number, z: number) => {
      if (y < s.y0) y = s.y0;
      if (x < x0 || x > x1 || y > y1 || z < z0 || z > z1) return false;
      return full[x - x0 + GW * (y - s.y0 + GH * (z - z0))] === 1;
    };
    for (let z = z0; z <= z1; z++)
      for (let y = s.y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          if (!isIn(x, y, z) || !inside(s, x, y, z, 0)) continue;
          // a skin three voxels thick (so the far, half-size copy keeps it whole): the outer
          // layer is tiled, the inner two are the ribbed underside
          let dist = 3;
          for (let dz = -2; dz <= 2 && dist > 1; dz++)
            for (let dy = -2; dy <= 2 && dist > 1; dy++)
              for (let dx = -2; dx <= 2; dx++) {
                if (isIn(x + dx, y + dy, z + dz)) continue;
                const d = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
                if (d < dist) dist = d;
                if (dist === 1) break;
              }
          if (dist > 2) continue;
          const near = dist === 1;
          const dx = Math.abs(x + 0.5 - s.cx);
          if (near) {
            // outer tiles: lids in a chevron pattern, cream borders between them
            const yr = y - s.y0;
            const L = Math.abs(s.zb - s.zt);
            const b = (z - s.zt) * (s.dir < 0 ? 1 : -1);
            const wb = s.w * (1 - 0.32 * (b / L));
            const u = dx / wb;
            if (Math.abs(u * 5 - Math.round(u * 5)) < 0.07 && u > 0.1) m.set(x, y, z, lid);
            else if (Math.floor(yr + dx * 0.9) % 6 === 0) m.set(x, y, z, matte);
            else m.set(x, y, z, gloss[Math.floor(hash(x, y, z, seed + 7) * 3)]);
          } else {
            // the ribbed concrete underside, seen in the mouths
            const u = dx / s.w;
            m.set(x, y, z, Math.abs(u * 10 - Math.round(u * 10)) < 0.12 ? rib : under[(x + y) & 1]);
          }
        }
    if (!s.glass) return;
    // the glass wall closing the mouth: pleated topaz panels in bronze mullions, foyers lit warm
    const bm = Math.abs(s.zm - s.zt);
    for (let y = s.y0; y < s.y0 + s.h; y++) {
      const yr = y + 0.5 - s.y0;
      const bf = bm * Math.pow(1 - yr / s.h, 0.62);
      for (let x = Math.floor(s.cx - s.w); x <= Math.ceil(s.cx + s.w); x++) {
        const dx = x - Math.floor(s.cx);
        const pleat = ((dx % 6) + 6) % 6 < 3 ? 0 : 1;
        const b = Math.ceil(bf) + 2 + pleat;
        const z = s.zt + (s.dir < 0 ? b : -b);
        if (!inside(s, x, y, z, 2.2) || m.get(x, y, z)) continue;
        const yy = y - s.y0;
        const mull = ((dx % 6) + 6) % 6 === 0 || ((dx % 6) + 6) % 6 === 3 || yy % 6 === 0;
        const lit = (yy === 2 || yy === 3 || yy === 9) && !mull;
        m.set(x, y, z, mull ? C("#4a3a28") : lit ? E("#ffcf8a", 1.15) : G(yy < 12 ? "#3a3026" : "#2c2a30"));
        // the floors of the foyers behind
        if (yy === 1 || yy === 8) for (let q = 1; q < 5; q++) if (!m.get(x, y, z + (s.dir < 0 ? q : -q))) m.set(x, y, z + (s.dir < 0 ? q : -q), C("#2a201a"));
      }
    }
    // the side louvres: glass under the arched edge between the feet
    for (let z = z0 + 1; z < z1; z++) {
      const b = (z + 0.5 - s.zt) * (s.dir < 0 ? 1 : -1);
      const top = sideCut(s, b);
      for (let y = s.y0; y < s.y0 + top; y++) {
        let x = Math.floor(s.cx);
        if (!inside(s, x, y, z, 2.2, false)) continue;
        while (inside(s, x + 1, y, z, 2.2, false)) x++;
        const off = x - Math.floor(s.cx);
        const yy = y - s.y0;
        const c = z % 5 === 0 || yy % 6 === 0 ? C("#6a5236") : yy === 2 || yy === 3 ? E("#ffcf8a", 1.0) : G("#4a3e32");
        for (const gx of [Math.floor(s.cx) + off, Math.floor(s.cx) - off - (s.cx % 1 ? 0 : 1)]) if (!m.get(gx, y, z)) m.set(gx, y, z, c);
      }
    }
  };
  // Concert Hall (west) and Joan Sutherland Theatre (east)
  const CH = 46,
    JS = 98;
  const halls: Shell[] = [
    // the small shells turned back over the steps
    { cx: CH, zt: PZ1 - 1, zm: PZ1 - 8, zb: PZ1 - 20, h: 22, w: 13, dir: 1, y0: PT, glass: true },
    { cx: JS, zt: PZ1 - 1, zm: PZ1 - 8, zb: PZ1 - 18, h: 19, w: 11, dir: 1, y0: PT, glass: true },
    // the nested shells, smallest behind
    { cx: CH, zt: 40, zm: 50, zb: 66, h: 40, w: 17, dir: -1, y0: PT, glass: true },
    { cx: JS, zt: 43, zm: 52, zb: 66, h: 34, w: 15, dir: -1, y0: PT, glass: true },
    { cx: CH, zt: 23, zm: 36, zb: 54, h: 56, w: 20, dir: -1, y0: PT, glass: true },
    { cx: JS, zt: 27, zm: 39, zb: 56, h: 48, w: 17, dir: -1, y0: PT, glass: true },
    { cx: CH, zt: 6, zm: 22, zb: 40, h: 72, w: 23, dir: -1, y0: PT, glass: true },
    { cx: JS, zt: 11, zm: 25, zb: 42, h: 62, w: 20, dir: -1, y0: PT, glass: true },
  ];
  for (const s of halls) shell(s);
  // the Bennelong restaurant: three little shells open to the city
  const BC = (BX0 + BX1) / 2;
  for (const s of [
    { cx: BC, zt: PZ1 + 4, zm: PZ1 - 3, zb: PZ1 - 16, h: 13, w: 9, dir: 1 as const, y0: PT },
    { cx: BC, zt: PZ1 + 12, zm: PZ1 + 5, zb: PZ1 - 8, h: 19, w: 11, dir: 1 as const, y0: PT, glass: true },
    { cx: BC, zt: PZ1 + 19, zm: PZ1 + 12, zb: PZ1 - 2, h: 25, w: 12, dir: 1 as const, y0: PT, glass: true },
  ])
    shell(s);

  // ---- floodlights at the shells' feet (they glow white at night) ---------------------------------
  for (const [x, z] of [
    [CH - 18, 30],
    [CH + 18, 30],
    [JS - 15, 32],
    [JS + 15, 32],
    [CH, PZ1 + 1],
    [JS, PZ1 + 1],
  ]) {
    m.box(x - 1, PT, z - 1, x + 1, PT + 1, z + 1, C("#2a2830"));
    m.set(x, PT + 1, z, E("#fff4e2", 2.4));
  }
  lights.push([CH, PT + 14, 10, "#ffe2b0"], [JS, PT + 12, 14, "#ffe2b0"], [mid, PT + 6, PZ1 + 6, "#ffd8a0"], [BC, PT + 8, BZ1 + 2, "#ffcf8a"]);

  // ---- the forecourt: lamps, a sign, people ---------------------------------------------------------
  for (const x of [SX0 + 4, mid - 18, mid + 18, SX1 - 4]) {
    const p = lampPost(m, x, 1, SZ1 + 4, k, "#fff0d0", 4.2);
    if (x === mid - 18 || x === mid + 18) lights.push([p[0], p[1], p[2], "#ffe2b0"]);
  }
  for (let z = 10; z < D - 6; z += 22) {
    lampPost(m, 3, 1, z, k, "#fff0d0", 3.6);
    lampPost(m, W - 4, 1, z, k, "#fff0d0", 3.6);
  }
  // a low granite plinth with the name, at the head of the promenade
  m.box(BX0 + 2, 1, D - 7, BX1 - 2, 4, D - 4, C("#6a4e42"));
  m.box(BX0 + 2, 4, D - 7, BX1 - 2, 5, D - 4, C("#9a7a68"));
  signs.push({ text: "SYDNEY OPERA HOUSE", color: "#f4efe4", x: (BX0 + BX1) / 2, y: 2.5, z: D - 4, w: BX1 - BX0 - 6, h: 3, vertical: false, facing: "front" });

  // people: voxel figures on the forecourt, sitting on the steps, at the broadwalk railing
  const shirts = ["#f4b728", "#2a2a33", "#e8e4dc", "#3a6ea5", "#b03a48", "#3e8a5a", "#7a4a9a", "#c8732a", "#1d1c23", "#d8c8a8"];
  const skins = ["#e8c4a0", "#c89670", "#8a5a3c", "#f0d0b4"];
  const person = (x: number, y: number, z: number, sit = false) => {
    const shirt = C(shirts[Math.floor(r() * shirts.length)]);
    const legs = C(r() < 0.5 ? "#2a2a38" : "#4a4050");
    if (sit) {
      m.box(x, y, z, x + 2, y + 1, z + 2, legs);
      m.box(x, y + 1, z, x + 2, y + 3, z + 1, shirt);
      m.set(x + (r() < 0.5 ? 0 : 1), y + 3, z, C(skins[Math.floor(r() * skins.length)]));
    } else {
      m.box(x, y, z, x + 1, y + 2, z + 1, legs);
      m.box(x, y + 2, z, x + 1, y + 4, z + 1, shirt);
      m.set(x, y + 4, z, C(skins[Math.floor(r() * skins.length)]));
    }
  };
  for (let i = 0; i < 26; i++) {
    const x = SX0 + 3 + Math.floor(r() * (SX1 - SX0 - 6));
    const step = Math.floor(r() * NSTEP);
    person(x, PT - step, PZ1 + step * 2, true);
  }
  for (let i = 0; i < 22; i++) {
    const x = 6 + Math.floor(r() * (W - 12));
    const z = SZ1 + 2 + Math.floor(r() * (D - SZ1 - 5));
    if (m.get(x, 1, z) || m.get(x, 1, z + 1)) continue;
    person(x, 1, z);
  }
  for (let i = 0; i < 18; i++) {
    const x = PX0 + 2 + Math.floor(r() * (PX1 - PX0 - 4));
    const z = PZ0 + 1 + Math.floor(r() * 6);
    if (m.get(x, PT, z)) continue;
    person(x, PT, z);
  }
  for (let i = 0; i < 12; i++) {
    const z = 4 + Math.floor(r() * (D - 30));
    const x = r() < 0.5 ? 2 + Math.floor(r() * 3) : W - 5 + Math.floor(r() * 3);
    if (m.get(x, 1, z)) continue;
    person(x, 1, z);
  }

  walls.push([PX0, PZ0, PX1, PZ1], [SX0, PZ1, SX1, SZ1], [BX0, PZ1, BX1, BZ1], [BX0 + 2, D - 7, BX1 - 2, D - 4]);
  return {
    model: m,
    signs,
    door: [mid, D],
    body: [0, 0, W, D],
    walls,
    lights,
    scale: k,
    points: {
      keeper: [mid, 1, SZ1 + 3],
      sail1: [CH, PT + 72, 7],
      sail2: [JS, PT + 62, 11],
      camPos: [-120, 150, D + 200],
      camLook: [mid, 34, 44],
    },
  };
}
