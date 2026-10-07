import type { Built } from "../buildings";
import { C, E, G, hash, rand, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";

// ---- plaza furniture shared by the needle, mall, marina and gardens (voxel scale k aware) --------

/** Metres to model voxels at scale k. */
export const mv = (metres: number, k: number) => Math.max(1, Math.round((metres * 6) / k));

/** Date palm: ringed trunk with a slight lean, a crown of drooping fronds, dates under the crown. */
export function palm(m: VoxelModel, x: number, y0: number, z: number, k: number, seed: number, hMetres = 7) {
  const r = rand(seed);
  const h = mv(hMetres, k);
  const lean = (r() - 0.5) * 0.25;
  const leanZ = (r() - 0.5) * 0.25;
  const bark = shades(["#7a6448", "#6a5640", "#86704f"], 1, seed);
  const ring = C("#5a4834");
  const tw = k >= 3 ? 1 : 2;
  let tx = x,
    tz = z;
  for (let y = 0; y < h; y++) {
    tx = x + lean * y;
    tz = z + leanZ * y;
    m.box(tx, y0 + y, tz, tx + tw, y0 + y + 1, tz + tw, y % 3 === 0 ? ring : bark);
  }
  const cy = y0 + h;
  const cx = tx + tw / 2,
    cz = tz + tw / 2;
  m.box(cx - 1, cy - 1, cz - 1, cx + 1, cy + 1, cz + 1, C("#4a6a2a"));
  const frond = shades(["#3d7a3a", "#2f6a30", "#4a8a40", "#2a5a2c"], 1, seed + 3);
  const L = mv(3.2, k);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.4;
    const ca = Math.cos(a),
      sa = Math.sin(a);
    for (let s = 0; s <= L; s++) {
      const t = s / L;
      const yy = cy + Math.round(Math.sin(t * Math.PI * 0.7) * L * 0.35 - t * t * L * 0.55);
      m.set(cx + ca * s, yy, cz + sa * s, frond);
      if (s > 1 && s < L - 1 && k < 3) m.set(cx + ca * s - sa, yy - 1, cz + sa * s + ca, frond);
    }
  }
  for (let i = 0; i < 4; i++) m.set(cx + (r() - 0.5) * 3, cy - 2, cz + (r() - 0.5) * 3, C("#c07a2a"));
}

/** Leafy tree in a grate: trunk, a few branches and a lumpy canopy. */
export function leafTree(m: VoxelModel, x: number, y0: number, z: number, k: number, seed: number, hMetres = 6, leaves: Paint = shades(["#2f6b3c", "#3d8a4a", "#285c33", "#4a9a52"], 1, 5)) {
  const r = rand(seed);
  const h = mv(hMetres * 0.45, k);
  const R = mv(hMetres * 0.3, k);
  m.box(x - 1, y0, z - 1, x + 2, y0 + 1, z + 2, C("#3a3a40"));
  m.box(x, y0, z, x + 1, y0 + h, z + 1, shades(["#4a3426", "#3e2c20"], 1, 8));
  m.blob(x + 0.5, y0 + h + R * 0.7, z + 0.5, R, leaves, 0.3, seed);
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    m.blob(x + 0.5 + Math.cos(a) * R * 0.6, y0 + h + R * (0.4 + r() * 0.5), z + 0.5 + Math.sin(a) * R * 0.6, R * 0.65, leaves, 0.35, seed + i);
  }
}

/** Plaza lamp post with a glowing head (light points the caller can add to `lights`). */
export function lampPost(m: VoxelModel, x: number, y0: number, z: number, k: number, color = "#ffd08a", hMetres = 4.5) {
  const h = mv(hMetres, k);
  const pole = C("#24222a");
  m.box(x - (k < 3 ? 1 : 0), y0, z - (k < 3 ? 1 : 0), x + (k < 3 ? 2 : 1), y0 + 1, z + (k < 3 ? 2 : 1), pole);
  m.box(x, y0, z, x + 1, y0 + h, z + 1, pole);
  m.box(x - 1, y0 + h, z - 1, x + 2, y0 + h + 1, z + 2, C("#1c1b21"));
  m.box(x - 1, y0 + h - 1, z - 1, x + 2, y0 + h, z + 2, E(color, 2.6));
  return [x + 0.5, y0 + h - 1, z + 0.5] as [number, number, number];
}

/** Bench along x (or z when `alongZ`). */
export function bench(m: VoxelModel, x: number, y0: number, z: number, k: number, alongZ = false) {
  const L = mv(1.8, k);
  const wood = shades(["#8a6440", "#7e5a38", "#956c46"], 1, 4);
  const leg = C("#2b2933");
  if (alongZ) {
    m.box(x, y0, z, x + 1, y0 + 1, z + 1, leg);
    m.box(x, y0, z + L - 1, x + 1, y0 + 1, z + L, leg);
    m.box(x, y0 + 1, z, x + (k < 3 ? 2 : 1), y0 + 2, z + L, wood);
  } else {
    m.box(x, y0, z, x + 1, y0 + 1, z + 1, leg);
    m.box(x + L - 1, y0, z, x + L, y0 + 1, z + 1, leg);
    m.box(x, y0 + 1, z, x + L, y0 + 2, z + (k < 3 ? 2 : 1), wood);
  }
}

/** Raised planter box with a hedge or flowers. */
export function planterBox(m: VoxelModel, x0: number, y0: number, z0: number, x1: number, z1: number, seed: number, flowers = true) {
  m.box(x0, y0, z0, x1, y0 + 2, z1, C("#9a958c"));
  m.box(x0 + 1, y0 + 1, z0 + 1, x1 - 1, y0 + 2, z1 - 1, C("#3a2a20"));
  const leaf = shades(["#2f6b3c", "#3d8a4a", "#285c33"], 1, seed);
  const fl = ["#e05a8a", "#f0c040", "#f0f0f0", "#c060e0", "#ff7a4a"];
  for (let x = x0 + 1; x < x1 - 1; x++)
    for (let z = z0 + 1; z < z1 - 1; z++) {
      const h = hash(x, z, seed);
      m.set(x, y0 + 2, z, leaf);
      if (h > 0.45) m.set(x, y0 + 3, z, flowers && h > 0.75 ? C(fl[Math.floor(hash(z, x, seed) * fl.length)]) : leaf);
    }
}

// ---- ZEC NEEDLE ----------------------------------------------------------------------------------

/**
 * ZEC NEEDLE, the city's tallest tower (~160 m): a Burj-style Y plan whose three wings step back
 * in a spiral as it rises, silver-blue glass between continuous vertical fins, a gold-lit
 * observation deck at two thirds of the height, a lit ZEC crown and a long spire with a red tip.
 * At its foot a grand lobby in the front wing and pools with fountain jets between the wings.
 *
 * Points (model voxels, scale 2):
 *  - `deck`: centre of the observation deck floor (inside the tower axis).
 *  - `tip`: top of the spire (the red light).
 *  - `lobby`: inside the grand lobby, behind the doors.
 *  - `fountainL`, `fountainR`: centres of the two front pools (for water shows).
 *  - `camPos` / `camLook`: a nice exterior viewpoint.
 */
export function needle(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 492;
  const m = new VoxelModel(W, H, D);
  const r = rand(seed);
  const cx = W / 2,
    cz = D / 2 - 3;
  const M = mv(2.6, k); // pavement margin

  // ---- plaza paving: a radial granite pattern with gold inlays pointing at the tower
  const pave = shades(["#cfc9c0", "#c6c0b6", "#d6d0c6"], 2, seed);
  m.box(0, 0, 0, W, 1, D, pave);
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx,
        dz = z + 0.5 - cz;
      const rr = Math.hypot(dx, dz);
      if (Math.abs(rr - 33) < 0.6 || Math.abs(rr - 26) < 0.5) m.set(x, 0, z, C("#8a8478"));
      const a = Math.atan2(dz, dx);
      if (rr > 26 && Math.abs(((a / (Math.PI * 2)) * 24 + 0.5) % 1 - 0.5) < 0.04) m.set(x, 0, z, C("#b89a5a"));
    }

  // ---- the Y plan: three wings at 90° (front), 210°, 330°, each stepping back on its own beat
  const wingA = [Math.PI / 2, (Math.PI * 7) / 6, (Math.PI * 11) / 6];
  const wdir = wingA.map((a) => [Math.cos(a), Math.sin(a)]);
  const top = 360; // top of the glass
  const L0 = 29;
  const wingLen = (i: number, y: number) => {
    // setbacks every 26 voxels, rotating round the wings: the Burj spiral
    let L = L0;
    for (let s = 34 + i * 26; s < y; s += 78) L -= 4.2;
    return L;
  };
  const halfW = (y: number) => 7.2 - (y / top) * 2.6;
  const coreR = (y: number) => (y < 300 ? 9.5 - (y / 300) * 2.5 : 7 - ((y - 300) / (top - 300)) * 3.2);
  const inside = (x: number, z: number, y: number, grow = 0) => {
    const dx = x + 0.5 - cx,
      dz = z + 0.5 - cz;
    if (Math.hypot(dx, dz) <= coreR(y) + grow) return true;
    const hw = halfW(y) + grow;
    for (let i = 0; i < 3; i++) {
      const L = wingLen(i, y);
      if (L < coreR(y) + 1) continue;
      const u = dx * wdir[i][0] + dz * wdir[i][1];
      const v = -dx * wdir[i][1] + dz * wdir[i][0];
      if (u < 0 || Math.abs(v) > hw) continue;
      // rounded wing tip
      if (u <= L - hw + grow) return true;
      if (Math.hypot(u - (L - hw + grow), v) <= hw) return true;
    }
    return false;
  };
  /** Which wing a cell belongs to, and its coordinate along the facade (for fins). */
  const facadeT = (x: number, z: number) => {
    const dx = x + 0.5 - cx,
      dz = z + 0.5 - cz;
    let best = -1,
      bu = -1e9;
    for (let i = 0; i < 3; i++) {
      const u = dx * wdir[i][0] + dz * wdir[i][1];
      if (u > bu) (bu = u), (best = i);
    }
    const v = -dx * wdir[best][1] + dz * wdir[best][0];
    // along the long sides the facade runs along u; round the tip it runs along v
    return { wing: best, u: bu, v };
  };

  const glassA = G("#8fa7c2"),
    glassB = G("#7a93b2"),
    glassC = G("#a3b8cf"),
    spandrel = C("#9aa4b4"),
    fin = C("#c9d0da"),
    finDark = C("#aab2be");
  const warm = [E("#ffd08a", 1.1), E("#ffc070", 1.15)],
    cool = [E("#cfe8ff", 1.0), E("#a8dcff", 1.05)];
  const FL = 9; // a floor: 3 m
  const deckY = 246;

  const gold = E("#f4b728", 2.4);
  const interior = C("#5a6478");
  for (let y = 1; y < top; y++) {
    const floor = Math.floor(y / FL);
    const fy = y % FL;
    const deckBand = y > deckY && y < deckY + FL * 2;
    for (let z = 4; z < D - 4; z++)
      for (let x = 4; x < W - 4; x++) {
        const isIn = inside(x, z, y);
        if (!isIn) {
          // fins stand one voxel proud of the glass; the wing noses carry a gold LED line
          if (y > 22 && inside(x, z, y, 1)) {
            const f = facadeT(x, z);
            const L = wingLen(f.wing, y);
            if (L > coreR(y) + 1 && f.u > L - 1.5 && Math.abs(f.v) < 1.1) {
              m.set(x, y, z, E("#ffd27a", 1.7));
              continue;
            }
            const t = Math.abs(f.v) > halfW(y) - 1.5 ? f.u : f.v;
            if (Math.floor(t + 100) % 3 === 0 && fy !== 0) m.set(x, y, z, floor & 1 ? fin : finDark);
          }
          continue;
        }
        // interior cells only need to exist a little behind the skin
        if (inside(x - 2, z, y) && inside(x + 2, z, y) && inside(x, z - 2, y) && inside(x, z + 2, y)) {
          m.set(x, y, z, interior);
          continue;
        }
        let c: number;
        const f = facadeT(x, z);
        const along = Math.abs(f.v) > halfW(y) - 1.5 ? f.u : f.v + 50;
        if (deckBand) {
          // the observation floors: glazed all round, warmly lit, slim white mullions
          c = (y - deckY) % FL === 0 ? C("#e8eaee") : Math.floor(along + 100) % 4 === 0 ? C("#e8eaee") : E("#ffe2b0", 1.05);
        } else if (fy === 0) c = spandrel;
        else if (fy === FL - 1) c = C("#6c7688");
        else {
          const bay = Math.floor(along / 3);
          const h = hash(bay, floor, f.wing, seed);
          if (h < 0.24) c = (hash(bay, floor, 3, seed) > 0.4 ? cool : warm)[floor & 1];
          else c = h > 0.75 ? glassC : (bay + floor) % 5 === 0 ? glassB : glassA;
        }
        m.set(x, y, z, c);
      }
  }
  // terraces: wherever the plan shrinks, a pale roof, a parapet with a gold edge light, roof gear
  for (let y = 30; y < top; y++)
    for (let z = 4; z < D - 4; z++)
      for (let x = 4; x < W - 4; x++)
        if (inside(x, z, y - 1) && !inside(x, z, y)) {
          const edge = !inside(x - 1, z, y - 1) || !inside(x + 1, z, y - 1) || !inside(x, z - 1, y - 1) || !inside(x, z + 1, y - 1);
          m.set(x, y - 1, z, edge ? E("#f4c860", 1.3) : C("#b8bec8"));
          if (edge) m.set(x, y, z, C("#d8dde4"));
          else if (hash(x, y, z, seed) > 0.97) m.box(x, y, z, x + 2, y + 2, z + 2, C("#e0e0e4"));
        }

  // ---- observation deck: a ring balcony four voxels out, glass balustrade, gold neon under the lip
  for (let z = 4; z < D - 4; z++)
    for (let x = 4; x < W - 4; x++) {
      if (!inside(x, z, deckY, 4) || inside(x, z, deckY, 0)) continue;
      const outer = !inside(x, z, deckY, 3);
      m.set(x, deckY - 1, z, outer ? E("#f4b728", 2.8) : C("#c8ccd4"));
      m.set(x, deckY - 2, z, outer ? C("#9aa2b0") : 0);
      m.set(x, deckY, z, outer ? C("#f0f0f2") : C("#d0c8b8"));
      if (outer) {
        m.box(x, deckY + 1, z, x + 1, deckY + 4, z + 1, G("#d8ecf4"));
        m.set(x, deckY + 4, z, C("#e8eaee"));
      }
      // a few visitors at the rail (the real ones come with the live layer)
      else if (hash(x, z, 77) > 0.94) m.box(x, deckY + 1, z, x + 1, deckY + 5, z + 1, C(["#3a5a8a", "#9a3a3a", "#e0d0b0", "#2a2a30"][Math.floor(hash(z, x, 3) * 4)]));
    }
  // a gold crown band over the deck floors
  for (let z = 4; z < D - 4; z++)
    for (let x = 4; x < W - 4; x++) if (inside(x, z, deckY + FL * 2, 1) && !inside(x, z, deckY + FL * 2, 0)) m.box(x, deckY + FL * 2, z, x + 1, deckY + FL * 2 + 2, z + 1, gold);

  // ---- the ZEC crown: a ribbed lantern above the wings with gold rings, a sign panel front and side
  const crownY = top;
  const crownTop = crownY + 34;
  for (let y = crownY - 6; y < crownTop; y++) {
    const rr = 7.2 - Math.max(0, y - crownY) * 0.07;
    const ring = (y - crownY + 6) % 8 === 0;
    for (let z = Math.floor(cz - 10); z < cz + 10; z++)
      for (let x = Math.floor(cx - 10); x < cx + 10; x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d > rr + (ring ? 0.8 : 0) || d < rr - 1.6) continue;
        const a = Math.atan2(z + 0.5 - cz, x + 0.5 - cx);
        const rib = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 28) % 2 === 0;
        m.set(x, y, z, ring ? gold : rib ? fin : y % 3 === 0 ? G("#9ab4d0") : E("#fff1c8", 1.25));
      }
  }
  m.box(Math.floor(cx - 6), crownTop - 1, Math.floor(cz - 6), Math.ceil(cx + 6), crownTop, Math.ceil(cz + 6), C("#c4cad4"));
  // the sign panels (front +z and side +x)
  const pz = Math.round(cz + 7.4),
    px = Math.round(cx + 7.4);
  const P5 = 5;
  m.box(Math.round(cx - P5), crownY + 4, pz - 3, Math.round(cx + P5), crownY + 20, pz, C("#1a1820"));
  m.box(Math.round(cx - P5) - 1, crownY + 3, pz - 1, Math.round(cx + P5) + 1, crownY + 4, pz + 1, gold);
  m.box(Math.round(cx - P5) - 1, crownY + 20, pz - 1, Math.round(cx + P5) + 1, crownY + 21, pz + 1, gold);
  m.box(px - 3, crownY + 4, Math.round(cz - P5), px, crownY + 20, Math.round(cz + P5), C("#1a1820"));
  m.box(px - 1, crownY + 3, Math.round(cz - P5) - 1, px + 1, crownY + 4, Math.round(cz + P5) + 1, gold);
  m.box(px - 1, crownY + 20, Math.round(cz - P5) - 1, px + 1, crownY + 21, Math.round(cz + P5) + 1, gold);
  // gold corner posts make the sign panels one jewel box
  for (const [qx, qz] of [
    [Math.round(cx - P5) - 1, pz - 1],
    [Math.round(cx + P5), pz - 1],
    [px - 1, Math.round(cz - P5) - 1],
    [px - 1, Math.round(cz + P5)],
  ])
    m.box(qx, crownY + 3, qz, qx + 1, crownY + 21, qz + 1, gold);
  // pinnacle fins rising out of the crown, of different heights
  for (let y = crownTop; y < crownTop + 22; y++) {
    const rr = 4.6 - (y - crownTop) * 0.12;
    for (let z = Math.floor(cz - 6); z < cz + 6; z++)
      for (let x = Math.floor(cx - 6); x < cx + 6; x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d > rr || d < rr - 1.6) continue;
        const a = Math.atan2(z + 0.5 - cz, x + 0.5 - cx);
        const seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12);
        if (y - crownTop < 6 + hash(seg, 1, 1, seed) * 16) m.set(x, y, z, seg % 2 ? C("#c9d0da") : G("#9ab4d0"));
      }
  }
  // spire: stacked tapering segments with service rings, strobes and the red aviation tip
  const sx = Math.floor(cx),
    sz = Math.floor(cz);
  let y = crownTop + 6;
  const spireTop = H - 6;
  m.box(sx - 3, crownTop - 1, sz - 3, sx + 3, y, sz + 3, C("#8a93a2"));
  while (y < spireTop) {
    const t = (y - crownTop) / (spireTop - crownTop);
    const hw = t < 0.35 ? 2 : t < 0.7 ? 1 : 0;
    const seg = 12;
    m.box(sx - hw, y, sz - hw, sx + hw + 1, Math.min(spireTop, y + seg), sz + hw + 1, C("#c4cad4"));
    m.box(sx - hw - 1, y, sz - hw - 1, sx + hw + 2, y + 1, sz + hw + 2, C("#7a8292"));
    if (((y - crownTop) / seg) % 3 === 1) m.box(sx - hw - 1, y + 6, sz - hw - 1, sx + hw + 2, y + 7, sz + hw + 2, E("#ffffff", 1.6));
    y += seg;
  }
  m.box(sx, spireTop, sz, sx + 1, H - 2, sz + 1, C("#c4cad4"));
  m.box(sx - 1, H - 2, sz - 1, sx + 2, H, sz + 2, E("#ff2a2a", 4));
  m.box(sx - 1, crownTop + 50, sz - 1, sx + 2, crownTop + 51, sz + 2, E("#ff2a2a", 3));

  // ---- base: a stone-and-glass skirt round the plan, the grand lobby on the front wing
  const frontTip = Math.round(cz + L0);
  const skirtH = 20;
  for (let yy = 1; yy <= skirtH; yy++)
    for (let z = 4; z < D - 4; z++)
      for (let x = 4; x < W - 4; x++)
        if (inside(x, z, yy, 2) && !inside(x, z, yy, 1)) {
          const pier = (x + z) % 5 === 0;
          m.set(x, yy, z, yy === skirtH ? C("#e2dccf") : yy === skirtH - 1 ? E("#f4c860", 1.2) : yy === 1 ? C("#8a8478") : pier ? C("#d0c8b8") : yy > 13 ? G("#4a5a70") : hash(x, z, 5) > 0.5 ? E("#ffe6c0", 0.9) : G("#3a4658"));
        }
  // lobby: a gold-gridded glass hall pushed out of the front wing
  const lx0 = Math.round(cx - 10),
    lx1 = Math.round(cx + 10);
  const lz1 = frontTip + 3;
  const lobbyH = 24;
  m.box(lx0, 1, frontTip - 8, lx1, lobbyH, lz1, E("#fff0d8", 0.9));
  for (let yy = 1; yy < lobbyH; yy++) {
    for (let x = lx0; x < lx1; x++) {
      const frame = (x - lx0) % 5 === 0 || yy % 6 === 0;
      m.set(x, yy, lz1 - 1, frame ? C("#c8a860") : yy < 13 ? E("#ffeccc", 1.0) : G("#c8d8e4"));
    }
    for (let z = frontTip - 8; z < lz1; z++)
      for (const x of [lx0, lx1 - 1]) m.set(x, yy, z, (z - frontTip) % 5 === 0 || yy % 6 === 0 ? C("#c8a860") : G("#b8ccd8"));
  }
  m.box(lx0 - 1, lobbyH, frontTip - 8, lx1 + 1, lobbyH + 2, lz1 + 1, C("#e8e4dc"));
  m.box(lx0 - 1, lobbyH, lz1, lx1 + 1, lobbyH + 1, lz1 + 1, gold);
  // chandelier strands visible above the doors
  for (let i = 0; i < 9; i++) m.box(lx0 + 2 + i * 2, 16 + (i % 3), lz1 - 2, lx0 + 3 + i * 2, 22, lz1 - 1, E("#fff4d0", 2));
  // revolving door, recessed, and the canopy on slim columns
  const dx0 = Math.round(cx - 3);
  m.clear(dx0, 1, lz1 - 3, dx0 + 6, 9, lz1);
  m.box(dx0, 1, lz1 - 4, dx0 + 6, 9, lz1 - 3, E("#fff0d0", 1.1));
  m.cylinder(cx, 1, lz1 - 1.5, 2.6, 8, G("#d8e8f0"), true);
  m.box(dx0, 1, lz1 - 2, dx0 + 1, 9, lz1 - 1, C("#c8a860"));
  m.box(dx0 - 1, 9, lz1 - 3, dx0 + 7, 10, lz1, C("#c8a860"));
  const cz1 = Math.min(D - 2, lz1 + 8);
  m.box(lx0 + 2, 13, lz1, lx1 - 2, 14, cz1, C("#eceae4"));
  m.box(lx0 + 2, 12, cz1 - 1, lx1 - 2, 13, cz1, gold);
  for (let x = lx0 + 4; x < lx1 - 4; x += 3) m.set(x, 12, Math.round((lz1 + cz1) / 2), E("#fff0d0", 1.6));
  for (const x of [lx0 + 2, lx1 - 3]) m.box(x, 1, cz1 - 2, x + 1, 13, cz1 - 1, C("#b8bec8"));
  // red carpet and brass stanchions
  m.box(dx0, 0, lz1, dx0 + 6, 1, cz1, C("#8a2228"));
  for (let z = lz1 + 1; z < cz1; z += 2) for (const x of [dx0 - 1, dx0 + 6]) m.box(x, 1, z, x + 1, 4, z + 1, C("#c8a860"));

  // pools in the front corners between the wings (Dubai fountain arcs) and a reflecting pool behind
  const water = (x: number, _y: number, z: number) => (hash(x >> 1, z >> 1, 9) > 0.8 ? G("#5ab8d8") : G("#2e86b0"));
  const pool = (x0: number, z0: number, x1: number, z1: number, jets: boolean) => {
    m.box(x0 - 1, 1, z0 - 1, x1 + 1, 2, z1 + 1, C("#e2ddd2"));
    m.box(x0 - 1, 2, z0 - 1, x1 + 1, 3, z1 + 1, C("#cfc8b8"));
    m.clear(x0, 1, z0, x1, 3, z1);
    m.box(x0, 0, z0, x1, 1, z1, water);
    for (let x = x0; x < x1; x += 3) m.set(x, 1, z1, E("#4ad0ff", 1.6));
    for (let x = x0 + 1; x < x1; x += 3) m.set(x, 1, z0 - 1, E("#4ad0ff", 1.6));
    if (!jets) return;
    const ccx = (x0 + x1) / 2,
      ccz = (z0 + z1) / 2;
    const jet = E("#d8f2ff", 1.0),
      spray = E("#cfefff", 0.85);
    // central plume with a spray cloud
    m.box(Math.round(ccx), 1, Math.round(ccz), Math.round(ccx) + 1, 22, Math.round(ccz) + 1, jet);
    for (let yy = 16; yy < 25; yy++)
      for (let zz = -2; zz <= 2; zz++)
        for (let xx = -2; xx <= 2; xx++) if ((xx || zz) && xx * xx + zz * zz < 6 && hash(xx, yy, zz, seed) > 0.8) m.set(Math.round(ccx) + xx, yy - (xx * xx + zz * zz) * 2, Math.round(ccz) + zz, spray);
    m.box(Math.round(ccx) - 1, 1, Math.round(ccz) - 1, Math.round(ccx) + 2, 2, Math.round(ccz) + 2, E("#ffffff", 0.9));
    // a ring of nozzles shooting arcs at the plume
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const nx = ccx + Math.cos(a) * (x1 - x0) * 0.42,
        nz = ccz + Math.sin(a) * (z1 - z0) * 0.4;
      const hmax = 6 + (i % 3) * 3;
      for (let t = 0.15; t <= 0.95; t += 0.035) {
        const ax = nx + (ccx - nx) * t * 0.8,
          az = nz + (ccz - nz) * t * 0.8;
        m.set(ax, 1 + 4 * hmax * t * (1 - t), az, jet);
      }
      m.set(nx, 1, nz, C("#9aa2b0"));
    }
  };
  const pzz = D - M - 2;
  pool(M + 1, pzz - 18, Math.round(cx - 13), pzz, true);
  pool(Math.round(cx + 13), pzz - 18, W - M - 1, pzz, true);
  pool(Math.round(cx - 12), M - 2, Math.round(cx + 12), M + 4, false);

  // palms round the pools, lamps along the front, benches, planters
  const lights: Built["lights"] = [];
  for (const [px2, pz2] of [
    [M, pzz - 22],
    [W - M - 2, pzz - 22],
    [M - 2, M + 2],
    [W - M, M + 2],
    [Math.round(cx - 16), M],
    [Math.round(cx + 15), M],
    [M + 4, D - 4],
    [W - M - 6, D - 4],
  ])
    palm(m, px2, 1, pz2, k, seed + px2 * 7 + pz2, 6 + r() * 3);
  for (const x of [3, W - 4]) {
    const p = lampPost(m, x, 1, D - 3, k, "#ffd08a");
    lights.push([p[0], p[1], p[2], "#ffd08a"]);
  }
  for (const z of [Math.round(cz - 6), Math.round(cz + 6)]) {
    lampPost(m, 3, 1, z, k, "#ffd08a");
    lampPost(m, W - 4, 1, z, k, "#ffd08a");
  }
  bench(m, M + 8, 1, D - 5, k);
  bench(m, W - M - 14, 1, D - 5, k);
  planterBox(m, 2, 1, Math.round(cz - 2), 8, Math.round(cz + 3), seed);
  planterBox(m, W - 8, 1, Math.round(cz - 2), W - 2, Math.round(cz + 3), seed + 1);
  lights.push([cx, 10, cz1, "#ffe6b0"]);
  lights.push([cx, deckY + 4, cz + 26, "#f4b728"]);

  // ---- signs: ZEC on the crown, the tower name on the canopy
  const signs: SignSpot[] = [
    { text: "ZEC", color: "#f4b728", x: cx, y: crownY + 12, z: pz + 0.1, w: 10, h: 14, vertical: false, facing: "front" },
    { text: "ZEC", color: "#f4b728", x: px + 0.1, y: crownY + 12, z: cz, w: 10, h: 14, vertical: false, facing: "side" },
    { text: "ZEC NEEDLE · ニードル", color: "#f4b728", x: cx, y: lobbyH + 1, z: lz1 + 1.1, w: lx1 - lx0, h: 1.8, vertical: false, facing: "front" },
  ];

  return {
    model: m,
    signs,
    door: [cx, cz1],
    body: [0, 0, W, D],
    walls: [
      [Math.round(cx - 24), Math.round(cz - 18), Math.round(cx + 24), Math.round(cz + 10)],
      [lx0, Math.round(cz + 10), lx1, lz1],
    ],
    lights,
    scale: k,
    points: {
      deck: [cx, deckY + 1, cz],
      tip: [sx + 0.5, H - 1, sz + 0.5],
      lobby: [cx, 1, frontTip - 4],
      fountainL: [Math.round((M + 1 + cx - 13) / 2), 1, pzz - 9],
      fountainR: [Math.round((cx + 13 + W - M - 1) / 2), 1, pzz - 9],
      camPos: [cx + 110, 140, D + 200],
      camLook: [cx, 220, cz],
    },
  };
}
