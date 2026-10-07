import { C, E, G, hash, shades, VoxelModel } from "../../scene/voxel/model";

/**
 * Voxel pieces of the Louvre. Fine pieces are drawn 12 voxels a metre (placed at k = 0.5), the
 * statue 6 a metre. Every model faces +z, stands on y = 0 and is centred on x and z.
 */

const m = (w: number, h: number, d: number) => new VoxelModel(w, h, d);
const gilt = shades(["#c9982e", "#b8862a", "#d6a83a"], 1, 11);
const giltLit = E("#ffd890", 1.4);
const velvet = shades(["#7a1220", "#6e101c", "#861828"], 1, 12);
const white = shades(["#eeeae2", "#e4dfd6", "#f6f2ea", "#dcd6cc"], 1, 13);
const greyStone = shades(["#5e5a54", "#56524c", "#66625a"], 2, 14);
const walnut = shades(["#4a3020", "#422a1c", "#54382a"], 1, 15);

/** A Louvre banquette: red velvet seat, gilt rail and legs (2.4 m, 12/m). */
export function banquette(len = 2.4) {
  const L = Math.round(len * 12);
  const v = m(L, 6, 8);
  for (const x of [0, L - 2]) for (const z of [0, 6]) v.box(x, 0, z, x + 2, 3, z + 2, gilt);
  v.box(0, 3, 0, L, 4, 8, gilt);
  v.box(1, 4, 1, L - 1, 6, 7, velvet);
  for (let x = 4; x < L - 3; x += 5) v.set(x, 5, 0, C("#4a0a12"));
  return v;
}

/** A guard's chair (12/m). */
export function guardChair() {
  const v = m(7, 12, 7);
  for (const [x, z] of [[0, 0], [6, 0], [0, 6], [6, 6]]) v.box(x, 0, z, x + 1, 5, z + 1, C("#2a2620"));
  v.box(0, 5, 0, 7, 6, 7, C("#3a3530"));
  v.box(0, 6, 0, 7, 12, 1, C("#3a3530"));
  return v;
}

/** Brass stanchion with a red velvet rope to the next one, `len` metres (12/m). */
export function stanchions(len: number) {
  const L = Math.max(2, Math.round(len * 12));
  const v = m(L + 2, 12, 2);
  for (const x of [0, L]) {
    v.box(x, 0, 0, x + 2, 1, 2, gilt);
    v.box(x, 1, 0, x + 2, 11, 1, gilt);
    v.box(x, 11, 0, x + 2, 12, 2, giltLit);
  }
  for (let x = 2; x < L; x++) {
    const t = (x - 1) / L;
    const y = Math.round(10 - Math.sin(t * Math.PI) * 3);
    v.box(x, y, 0, x + 1, y + 1, 1, C("#9a1424"));
  }
  return v;
}

/** Crystal chandelier: three tiers of gilt rings, candles, crystal drops (12/m). `r` metres radius. */
export function chandelier(r = 0.9, drop = 1.6) {
  const R = Math.round(r * 12),
    H = Math.round(drop * 12) + 26;
  const W = 2 * R + 3;
  const v = m(W, H, W);
  const c = W / 2;
  const top = H;
  // the chain and the stem
  v.box(c - 0.5, top - Math.round(drop * 12), c - 0.5, c + 0.5, top, c + 0.5, gilt);
  const y0 = 2;
  v.box(c - 1, y0, c - 1, c + 1, y0 + 22, c + 1, gilt);
  v.box(c - 2, y0, c - 2, c + 2, y0 + 3, c + 2, gilt);
  const tier = (rr: number, y: number, n: number) => {
    for (let k = 0; k < n * 6; k++) {
      const a = (k / (n * 6)) * Math.PI * 2;
      v.set(c + Math.cos(a) * rr, y, c + Math.sin(a) * rr, gilt);
    }
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = c + Math.cos(a) * rr,
        z = c + Math.sin(a) * rr;
      // arm, candle, flame
      v.set(x, y + 1, z, gilt);
      v.set(x, y + 2, z, C("#f4efe4"));
      v.set(x, y + 3, z, C("#f4efe4"));
      v.set(x, y + 4, z, E("#ffd27a", 2.4));
      // crystal drops under the ring
      for (let d = 1; d <= 3; d++) v.set(c + Math.cos(a + 0.2) * rr, y - d, c + Math.sin(a + 0.2) * rr, d === 3 ? E("#fff4e0", 1.6) : G("#f0f4ff"));
    }
    // spokes back to the stem
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      for (let t = 1; t < rr; t++) v.set(c + Math.cos(a) * t, y - Math.round(Math.sin((t / rr) * Math.PI) * 2), c + Math.sin(a) * t, gilt);
    }
  };
  tier(R, y0 + 6, 16);
  tier(R * 0.66, y0 + 12, 10);
  tier(R * 0.36, y0 + 18, 6);
  // swags of crystal from tier to tier
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    for (let t = 0; t <= 6; t++) {
      const rr = R * (1 - t * 0.06);
      v.set(c + Math.cos(a) * rr, y0 + 6 + t, c + Math.sin(a) * rr, G("#e8f0ff"));
    }
  }
  // the pendant drop at the bottom, lit
  v.box(c - 1, 0, c - 1, c + 1, 2, c + 1, E("#fff2d0", 1.8));
  return v;
}

/** A marble bust on a pedestal (12/m), seeded so every bust differs a little. */
export function bust(seed = 1) {
  const v = m(12, 30, 12);
  v.box(1, 0, 1, 11, 2, 11, C("#3a3632"));
  v.box(2, 2, 2, 10, 15, 10, shades(["#6a1a1a", "#5a1414", "#7a2424"], 1, seed));
  v.box(1, 15, 1, 11, 16, 11, C("#3a3632"));
  v.box(2, 16, 3, 10, 20, 9, white);
  v.box(4, 20, 4, 8, 22, 8, white);
  v.box(3, 22, 3, 9, 29, 9, white);
  v.box(3, 27 + Math.round(hash(seed, 1, 1) * 2), 3, 9, 30, 9, white);
  v.set(4, 25, 9, C("#9a948a"));
  v.set(7, 25, 9, C("#9a948a"));
  return v;
}

/** Ticket machine (12/m): blue-grey body, a lit screen, a card slot. */
export function ticketMachine() {
  const v = m(9, 20, 7);
  v.box(0, 0, 0, 9, 20, 7, C("#2a3240"));
  v.box(1, 11, 7, 8, 18, 7, C("#0e1014"));
  v.box(2, 12, 7, 7, 17, 7, E("#6ab8ff", 1.2));
  v.box(3, 8, 7, 6, 9, 7, E("#3ee08f", 1.4));
  v.box(1, 19, 0, 8, 20, 7, C("#c9a227"));
  return v;
}

/** Round "borne" sofa of the Napoleon III salon: crimson buttoned seats round a gilt column (12/m). */
export function borne() {
  const v = m(36, 30, 36);
  const c = 18;
  v.cylinder(c, 0, c, 17, 2, C("#2a1a10"));
  v.cylinder(c, 2, c, 17, 4, velvet);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    v.set(c + Math.cos(a) * 16.5, 5, c + Math.sin(a) * 16.5, C("#4a0a12"));
  }
  v.cylinder(c, 6, c, 9, 6, velvet);
  v.cylinder(c, 12, c, 5, 2, gilt);
  v.cylinder(c, 14, c, 2.5, 12, gilt);
  v.cylinder(c, 26, c, 4, 2, gilt);
  // a jardinière of flowers on top
  v.blob(c, 28, c, 4, shades(["#2f7a3a", "#d83a5a", "#f4e0a0", "#2a6a30"], 1, 3), 0.3, 4);
  return v;
}

/** Gilt armchair, Second Empire (12/m). */
export function giltChair() {
  const v = m(8, 14, 8);
  for (const [x, z] of [[0, 0], [7, 0], [0, 7], [7, 7]]) v.box(x, 0, z, x + 1, 5, z + 1, gilt);
  v.box(0, 5, 0, 8, 7, 8, velvet);
  v.box(0, 7, 0, 8, 14, 1, gilt);
  v.box(1, 8, 1, 7, 13, 1, velvet);
  for (const x of [0, 7]) v.box(x, 7, 0, x + 1, 10, 8, gilt);
  return v;
}

/** Long banquet table set for a dinner (12/m): white cloth, gilt plates, candelabra. */
export function banquetTable(len = 6) {
  const L = Math.round(len * 12);
  const v = m(L, 16, 16);
  for (const x of [1, L / 2, L - 3]) for (const z of [2, 12]) v.box(x, 0, z, x + 2, 9, z + 2, walnut);
  v.box(0, 9, 0, L, 10, 16, C("#f2eee6"));
  v.box(0, 5, 0, L, 9, 1, C("#e8e2d6"));
  v.box(0, 5, 15, L, 9, 16, C("#e8e2d6"));
  for (let x = 4; x < L - 2; x += 8)
    for (const z of [2, 13]) {
      v.box(x, 10, z, x + 3, 10.5, z + 2, gilt);
      v.set(x + 4, 10, z + (z < 8 ? 1 : 0), C("#d8dce4"));
    }
  for (let x = 10; x < L - 6; x += 18) {
    v.box(x, 10, 7, x + 2, 15, 9, gilt);
    for (const dx of [-2, 0, 2]) v.set(x + dx + 1, 15, 8, E("#ffd27a", 2.2));
  }
  return v;
}

/**
 * The Winged Victory: a winged zkSNARK in white marble, striding on the prow of a grey stone ship
 * (6/m; about 5.5 m from the plinth's foot to the wing tips).
 */
export function wingedVictory() {
  const v = m(40, 36, 30);
  const cx = 20;
  // the ship's prow: a stepped grey hull narrowing to the front (+z), on a base
  v.box(6, 0, 2, 34, 3, 28, greyStone);
  for (let y = 3; y < 12; y++) {
    const t = (y - 3) / 9;
    const half = Math.round(10 - t * 2);
    for (let z = 4; z < 28; z++) {
      const narrow = z > 16 ? Math.round(((z - 16) / 12) * half) : 0;
      v.box(cx - half + narrow, y, z, cx + half - narrow, y + 1, z + 1, greyStone);
    }
  }
  v.box(cx - 6, 12, 6, cx + 6, 13, 20, greyStone);
  // the figure: legs striding in clinging drapery, a twisted torso, the zkSNARK head
  const drape = shades(["#f2eee6", "#e6e0d6", "#d8d2c6", "#efe9df"], 1, 21);
  v.box(cx - 3, 13, 12, cx - 1, 19, 15, drape);
  v.box(cx + 1, 13, 9, cx + 3, 19, 12, drape);
  v.box(cx - 4, 18, 9, cx + 4, 22, 15, drape);
  // folds: alternating darker lines down the skirt
  for (let x = cx - 4; x < cx + 4; x += 2) v.paint(x, 13, 9, x + 1, 22, 16, C("#cfc8bc"));
  v.box(cx - 3, 22, 10, cx + 3, 26, 14, white);
  v.box(cx - 4, 25, 10, cx + 4, 26, 14, drape);
  v.box(cx - 2, 26, 11, cx + 2, 27, 13, white);
  // the head (zkSNARKs are all head): a square block with the visor eyes
  v.box(cx - 3, 27, 9, cx + 3, 33, 15, white);
  v.box(cx - 2, 30, 15, cx, 31, 15, C("#b8b2a6"));
  v.box(cx + 1, 30, 15, cx + 3, 31, 15, C("#b8b2a6"));
  v.box(cx - 3, 33, 10, cx + 3, 34, 14, drape);
  // the wings: swept back and up from the shoulders, feathers in rows
  for (const side of [-1, 1]) {
    for (let k = 0; k < 16; k++) {
      const x0 = cx + side * (3 + k);
      const lift = Math.round(k * 0.55);
      const len = Math.round(9 - Math.abs(k - 6) * 0.45);
      const yTop = 25 + lift;
      for (let y = yTop - len; y < yTop; y++) {
        const back = Math.round((yTop - y) * 0.35);
        v.box(x0, y, 4 + back, x0 + 1, y + 1, 9 - Math.round(k * 0.25), (x, yy) => ((yy + (x & 1)) % 3 === 0 ? C("#d0cac0") : C("#f0ece4")));
      }
    }
  }
  return v;
}

/** The little upright stone pyramid under the inverted one (12/m). */
export function stonePyramid() {
  const v = m(16, 9, 16);
  for (let y = 0; y < 9; y++) v.box(y, y, y, 16 - y, y + 1, 16 - y, shades(["#c8bca4", "#bcb098", "#d0c4ac"], 1, 5));
  return v;
}
