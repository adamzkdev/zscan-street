import type { Built } from "../buildings";
import { C, E, G, hash, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { lampPost, planterBox, bench } from "./needle";

/**
 * ZK TOWER ORCHARD, Midtown's art-deco supertall (~138 m to the tip): an Empire State setback
 * massing in pale limestone — a wide podium, then three tiers stepping back, continuous piers with
 * dark spandrels and lit windows between them — under a Chrysler crown: seven stacked
 * stainless-steel sunburst arches on each face, pierced by triangular windows that glow at night,
 * steel eagles leaning out of the corners below it, and a needle spire with a red tip. At the
 * foot, on the street front (+z), the gilded portal with its canopy and revolving doors, the
 * granite plaza with lamps, planters and benches.
 *
 * Scale 2 (a voxel is a third of a metre). Points: `door`, `keeper`, `lobby`, `deck` (the
 * observatory, at the foot of the crown), `tip`, `camPos`, `camLook`.
 */
export function zkorchard(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 420;
  const m = new VoxelModel(W, H, D);
  const cx = W / 2;
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];

  // ---- palette -----------------------------------------------------------------------------------
  const lime = shades(["#d8d0c0", "#d2cab9", "#ddd6c7", "#cfc6b4"], 2, seed);
  const limeDark = shades(["#b9b09e", "#b2a996"], 2, seed + 1);
  const granite = shades(["#3a3640", "#35323b", "#403c46"], 1, seed + 2);
  const spandrel = C("#3b3d46");
  const spandrelDeco = C("#5a5a62");
  const glass = G("#5a7890");
  const glassDim = G("#3c5468");
  const steel = shades(["#d8dde4", "#cdd3db", "#e4e8ee"], 1, seed + 3);
  const steelDark = C("#9aa2ae");
  const gold = C("#d9b25a");
  const goldDeep = C("#a8822e");
  const warm = ["#ffd9a0", "#ffe6c0", "#fff0d8", "#ffcf8a"];
  const pave = shades(["#cfc9be", "#c7c1b6", "#d6d0c4"], 2, seed + 4);

  // ---- the plaza ---------------------------------------------------------------------------------
  m.box(0, 0, 0, W, 1, D, pave);
  // granite bands radiating to the door, a gold inlay line across the front
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if ((x + z) % 9 === 0 && z > 64) m.set(x, 0, z, C("#a8a298"));
  for (let x = 4; x < W - 4; x++) m.set(x, 0, 72, C("#b89a5a"));

  /** A window bay's paint: piers every 4, a dark spandrel band per floor, lit windows. */
  const FH = 10;
  const facade = (along: number, y: number, face: number, y0: number): number => {
    const col = Math.floor(along / 4);
    if (((along % 4) + 4) % 4 === 0) return typeof lime === "number" ? lime : lime(along, y, face);
    const fy = (y - y0) % FH;
    const fl = Math.floor((y - y0) / FH);
    if (fy < 2) return fy === 0 && (along % 4) === 2 ? spandrelDeco : spandrel;
    if (fy === 9) return spandrel;
    const h = hash(col, fl, face, seed + 7);
    if (h < 0.17) return E(warm[Math.floor(h * 40) % 4], 1.15);
    return h < 0.6 ? glass : glassDim;
  };
  /** A setback tier: a solid block whose four faces carry the facade; a limestone parapet on top. */
  const tier = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, chamfer = 0) => {
    for (let y = y0; y < y1; y++)
      for (let z = z0; z < z1; z++)
        for (let x = x0; x < x1; x++) {
          // notched corners (the Chrysler shaft)
          const ex = Math.min(x - x0, x1 - 1 - x),
            ez = Math.min(z - z0, z1 - 1 - z);
          if (chamfer && ex < chamfer && ez < chamfer) continue;
          const onX = ex === 0,
            onZ = ez === 0;
          const inNotch = chamfer && ((ex === chamfer && ez < chamfer) || (ez === chamfer && ex < chamfer));
          if (!onX && !onZ && !inNotch) {
            if (ex > 1 && ez > 1) continue; // hollow inside
            m.set(x, y, z, limeDark);
            continue;
          }
          // the corners are solid limestone piers
          if ((onX && ez < 2) || (onZ && ex < 2) || inNotch) {
            m.set(x, y, z, (y - y0) % FH === 0 ? limeDark : lime);
            continue;
          }
          const along = onZ ? x - x0 : z - z0;
          const face = onZ ? (z === z0 ? 0 : 1) : x === x0 ? 2 : 3;
          m.set(x, y, z, facade(along, y, face, y0));
        }
    // parapet and cornice
    m.box(x0, y1, z0, x1, y1 + 2, z1, lime);
    m.box(x0 + 1, y1 + 1, z0 + 1, x1 - 1, y1 + 2, z1 - 1, limeDark);
    for (let x = x0; x < x1; x += 3) {
      m.set(x, y1 + 2, z0, lime);
      m.set(x, y1 + 2, z1 - 1, lime);
    }
    for (let z = z0; z < z1; z += 3) {
      m.set(x0, y1 + 2, z, lime);
      m.set(x1 - 1, y1 + 2, z, lime);
    }
    // a gold band under the cornice
    for (let x = x0; x < x1; x++) {
      m.set(x, y1 - 1, z0, gold);
      m.set(x, y1 - 1, z1 - 1, gold);
    }
    for (let z = z0; z < z1; z++) {
      m.set(x0, y1 - 1, z, gold);
      m.set(x1 - 1, y1 - 1, z, gold);
    }
  };

  // ---- the podium --------------------------------------------------------------------------------
  const PX0 = 3,
    PX1 = W - 3,
    PZ0 = 4,
    PZ1 = 64,
    PH = 44;
  // granite base course, then limestone with tall windows
  m.box(PX0, 1, PZ0, PX1, PH, PZ1, (x, y, z) => {
    const onFace = z === PZ1 - 1 || z === PZ0 || x === PX0 || x === PX1 - 1;
    if (!onFace) return C("#2a2830");
    if (y < 4) return typeof granite === "number" ? granite : granite(x, y, z);
    const along = z === PZ1 - 1 || z === PZ0 ? x : z;
    if (along % 6 === 0 || along % 6 === 1) return typeof lime === "number" ? lime : lime(x, y, z);
    const fy = (y - 4) % 13;
    if (fy < 2 || fy > 11) return spandrel;
    return hash(Math.floor(along / 6), Math.floor((y - 4) / 13), x + z, seed + 9) < 0.3 ? E("#ffe2b0", 1.0) : glass;
  });
  m.box(PX0 - 1, PH, PZ0 - 1, PX1 + 1, PH + 2, PZ1 + 1, lime);
  m.box(PX0, PH + 2, PZ0, PX1, PH + 3, PZ1, limeDark);
  for (let x = PX0; x < PX1; x++) m.set(x, PH - 1, PZ1, gold);

  // ---- the grand portal on the front -------------------------------------------------------------
  const DX0 = Math.round(cx - 8),
    DX1 = Math.round(cx + 8);
  const DH = 34;
  // recess the portal 3 deep: a gilded frame, a black-and-gold transom grille with a sunburst
  m.clear(DX0, 1, PZ1 - 3, DX1, DH, PZ1);
  m.box(DX0 - 2, 1, PZ1 - 1, DX0, DH + 2, PZ1 + 1, gold);
  m.box(DX1, 1, PZ1 - 1, DX1 + 2, DH + 2, PZ1 + 1, gold);
  m.box(DX0 - 2, DH, PZ1 - 1, DX1 + 2, DH + 2, PZ1 + 1, gold);
  // stepped deco jambs
  m.box(DX0 - 4, 1, PZ1, DX0 - 2, DH - 4, PZ1 + 1, lime);
  m.box(DX1 + 2, 1, PZ1, DX1 + 4, DH - 4, PZ1 + 1, lime);
  m.box(DX0, 1, PZ1 - 3, DX1, DH, PZ1 - 2, (x, y) => {
    if (y < 12) return E("#ffd9a0", 1.3); // the lit lobby behind the doors
    // the transom: a gold sunburst on black
    const u = x + 0.5 - cx,
      v = y - 16;
    const a = Math.atan2(v, u);
    const r = Math.hypot(u, v);
    if (r < 3) return E("#ffd27a", 1.8);
    if (Math.abs(r - 9) < 0.6 || Math.abs(r - 15) < 0.6) return E("#f4b728", 1.4);
    if (Math.abs(((a / Math.PI) * 12) % 1 - 0.5) < 0.07 && r > 3 && r < 20) return E("#f4b728", 1.3);
    return C("#16141a");
  });
  // the revolving doors: three drums, brass and glass
  for (const dx of [-5, 0, 5]) {
    m.cylinder(cx + dx, 1, PZ1 + 0.5, 2.2, 10, (x, y, z) => (y > 9 ? gold : Math.abs(x + 0.5 - (cx + dx)) < 0.6 || Math.abs(z - PZ1) < 0.6 ? goldDeep : G("#a8c8e0")));
    m.cylinder(cx + dx, 11, PZ1 + 0.5, 2.6, 1, gold);
  }
  // the canopy: gilded, lit underneath, on two bronze posts
  const CZ1 = PZ1 + 8;
  m.box(DX0 - 4, 14, PZ1, DX1 + 4, 16, CZ1, gold);
  m.box(DX0 - 3, 13, PZ1, DX1 + 3, 14, CZ1 - 1, E("#ffe6b0", 1.6));
  m.box(DX0 - 4, 16, CZ1 - 1, DX1 + 4, 17, CZ1, goldDeep);
  for (const x of [DX0 - 3, DX1 + 2]) m.box(x, 1, CZ1 - 2, x + 1, 14, CZ1 - 1, goldDeep);
  // the name over the canopy, gold on the limestone, and a blade sign at the corner
  signs.push({ text: "ZK TOWER ORCHARD", color: "#f4b728", x: cx, y: PH - 4, z: PZ1 + 0.3, w: 50, h: 4.6, vertical: false, facing: "front" });
  // a vertical blade sign on the corner pier
  m.box(PX1 - 3, 18, PZ1, PX1 - 1, 42, PZ1 + 5, C("#16141a"));
  m.box(PX1 - 3, 17, PZ1, PX1 - 1, 18, PZ1 + 5, gold);
  m.box(PX1 - 3, 42, PZ1, PX1 - 1, 43, PZ1 + 5, gold);
  signs.push({ text: "ORCHARD", color: "#f4b728", x: PX1 - 0.8, y: 30, z: PZ1 + 2.5, w: 4, h: 22, vertical: true, facing: "side" });
  // shop windows either side of the portal
  for (const [a, b] of [
    [PX0 + 4, DX0 - 6],
    [DX1 + 6, PX1 - 5],
  ]) {
    m.box(a, 4, PZ1 - 1, b, 14, PZ1, (x, y) => (x % 6 === 0 ? gold : y > 11 ? C("#16141a") : E("#ffe8c8", 1.1)));
    m.box(a, 14, PZ1 - 1, b, 15, PZ1 + 1, goldDeep);
  }

  // ---- the setback tiers -------------------------------------------------------------------------
  const T1 = { x0: 8, z0: 8, x1: W - 8, z1: 60, y0: PH + 3, y1: 180 };
  const T2 = { x0: 15, z0: 13, x1: W - 15, z1: 55, y0: T1.y1 + 2, y1: 270 };
  const T3 = { x0: 22, z0: 18, x1: W - 22, z1: 50, y0: T2.y1 + 2, y1: 330 };
  tier(T1.x0, T1.z0, T1.x1, T1.z1, T1.y0, T1.y1);
  // the tier 1 wings step in once more on the sides halfway (Empire State shoulders)
  tier(T2.x0, T2.z0, T2.x1, T2.z1, T2.y0, T2.y1, 2);
  tier(T3.x0, T3.z0, T3.x1, T3.z1, T3.y0, T3.y1, 3);
  // continuous limestone piers up the middle of each face, from tier 1 to the crown (the
  // Empire State's centre bay), with a gold stripe
  for (let y = T1.y0; y < T3.y1; y++) {
    const t = y < T1.y1 ? T1 : y < T2.y1 + 2 ? T2 : T3;
    for (const dx of [-2, -1, 0, 1]) {
      m.set(Math.round(cx) + dx, y, t.z1, dx === -1 || dx === 0 ? (y % 3 === 0 ? goldDeep : lime) : lime);
      m.set(Math.round(cx) + dx, y, t.z0 - 1, lime);
    }
    const cz = Math.round((t.z0 + t.z1) / 2);
    for (const dz of [-1, 0]) {
      m.set(t.x0 - 1, y, cz + dz, lime);
      m.set(t.x1, y, cz + dz, lime);
    }
  }
  // radiator-cap wings at the tier 1 corners, eagles at the shaft's corners
  const wing = (x: number, y: number, z: number, sx: number, sz: number) => {
    for (let i = 0; i < 5; i++) {
      m.set(x + sx * i, y, z, steel);
      m.set(x, y, z + sz * i, steel);
      if (i < 3) m.set(x + sx * i, y + 1, z + sz * i, steel);
    }
    m.set(x, y + 2, z, steelDark);
  };
  for (const [x, z, sx, sz] of [
    [T2.x0 - 1, T2.z0 - 1, -1, -1],
    [T2.x1, T2.z0 - 1, 1, -1],
    [T2.x0 - 1, T2.z1, -1, 1],
    [T2.x1, T2.z1, 1, 1],
  ] as const)
    wing(x, T1.y1 + 3, z, sx, sz);
  const eagle = (x: number, y: number, z: number, sx: number, sz: number) => {
    // neck leaning out diagonally, the head with its hooked beak, folded wings along the walls
    for (let i = 0; i < 6; i++) m.box(x + sx * i, y + Math.floor(i / 3), z + sz * i, x + sx * i + 1, y + 2 + Math.floor(i / 3), z + sz * i + 1, steel);
    const hx = x + sx * 6,
      hz = z + sz * 6;
    m.box(hx - 1, y + 2, hz - 1, hx + 2, y + 5, hz + 2, steel);
    m.set(hx + sx * 2, y + 3, hz + sz * 2, steelDark);
    m.set(hx + sx * 2, y + 2, hz + sz * 2, steelDark);
    m.set(hx, y + 4, hz + sz, C("#1a1a20"));
    m.set(hx + sx, y + 4, hz, C("#1a1a20"));
    for (let i = 0; i < 5; i++) {
      m.set(x - sx * 0, y - i, z + sz * (i + 1), steel);
      m.set(x + sx * (i + 1), y - i, z, steel);
    }
  };
  for (const [x, z, sx, sz] of [
    [T3.x0, T3.z0, -1, -1],
    [T3.x1 - 1, T3.z0, 1, -1],
    [T3.x0, T3.z1 - 1, -1, 1],
    [T3.x1 - 1, T3.z1 - 1, 1, 1],
  ] as const)
    eagle(x, T3.y1 - 6, z, sx, sz);

  // ---- the observatory terrace on the shaft's top (behind its steel railing) ---------------------
  const DY = T3.y1 + 2;
  for (let x = T3.x0; x < T3.x1; x++)
    for (const z of [T3.z0, T3.z1 - 1]) {
      m.set(x, DY, z, x % 2 ? steel : steelDark);
      m.set(x, DY + 1, z, steel);
    }
  for (let z = T3.z0; z < T3.z1; z++)
    for (const x of [T3.x0, T3.x1 - 1]) {
      m.set(x, DY, z, z % 2 ? steel : steelDark);
      m.set(x, DY + 1, z, steel);
    }

  // ---- the Chrysler crown: seven stacked sunburst arches per face -------------------------------
  const CCX = (T3.x0 + T3.x1) / 2,
    CCZ = (T3.z0 + T3.z1) / 2;
  const CY = DY + 3; // the crown starts above the terrace
  const tiers = Array.from({ length: 6 }, (_, i) => {
    const hw = 12 - i * 1.85;
    return { hw, y: CY + i * 8.5, ah: hw * 0.95 };
  });
  const crownTop = tiers[tiers.length - 1].y + tiers[tiers.length - 1].ah;
  for (let y = CY - 3; y < crownTop + 1; y++)
    for (let z = Math.floor(CCZ - 13); z <= Math.ceil(CCZ + 13); z++)
      for (let x = Math.floor(CCX - 13); x <= Math.ceil(CCX + 13); x++) {
        const dx = x + 0.5 - CCX,
          dz = z + 0.5 - CCZ;
        const a = Math.max(Math.abs(dx), Math.abs(dz));
        const u = Math.abs(dx) >= Math.abs(dz) ? dz : dx;
        let c: Paint | 0 = 0;
        for (let i = 0; i < tiers.length; i++) {
          const t = tiers[i];
          if (a > t.hw) continue;
          if (y < CY - 3) continue;
          const ux = Math.min(1, Math.abs(u) / t.hw);
          const top = t.y + t.ah * Math.sqrt(1 - ux * ux);
          if (y > top) continue;
          // the face of this tier: the voxels within 1.2 of its outline
          if (a > t.hw - 1.2) {
            const ry = y - t.y;
            const r = Math.hypot(u, Math.max(0, ry));
            const edge = top - y < 1.2;
            if (edge) c = E(i % 2 ? "#fff4d8" : "#ffe2a0", 2.2);
            else if (ry > 0 && r > t.hw * 0.42 && r < t.hw * 0.9) {
              // the sunburst: triangular windows between steel ribs
              const ang = Math.atan2(ry, u);
              const s = (ang / Math.PI) * 9;
              const f = Math.abs((s % 1) - 0.5);
              c = f < 0.12 + (r / t.hw) * 0.16 ? E(i < 3 ? "#ffe8b8" : "#fff6e0", 1.7 + i * 0.1) : steel;
            } else c = ry < 0 && (x + z) % 2 === 0 ? steelDark : steel;
          } else c = steelDark;
          break;
        }
        if (c) m.set(x, y, z, c);
      }
  // ---- the spire --------------------------------------------------------------------------------
  const SX = Math.round(CCX - 0.5),
    SZ = Math.round(CCZ - 0.5);
  const S0 = Math.floor(crownTop) - 2;
  const tip = H - 6;
  for (let y = S0; y < tip; y++) {
    const t = (y - S0) / (tip - S0);
    const r = t < 0.3 ? 2 : t < 0.65 ? 1 : 0;
    m.box(SX - r, y, SZ - r, SX + r + 1, y + 1, SZ + r + 1, t < 0.3 && y % 4 === 0 ? E("#fff0c8", 1.6) : steel);
  }
  m.box(SX, tip, SZ, SX + 1, tip + 3, SZ + 1, E("#ff3a2a", 3));
  // aircraft lights on the crown
  for (const [x, z] of [
    [T3.x0, T3.z0],
    [T3.x1 - 1, T3.z1 - 1],
  ])
    m.set(x, DY + 2, z, E("#ff4a3a", 2.4));

  // ---- the plaza: lamps, planters, benches, bollards ---------------------------------------------
  for (const x of [6, 22, W - 23, W - 7]) {
    const p = lampPost(m, x, 1, 70, k, "#ffd08a");
    if (x === 6 || x === W - 7) lights.push([p[0], p[1], p[2], "#ffd08a"]);
  }
  planterBox(m, 2, 1, 66, 14, 70, seed);
  planterBox(m, W - 14, 1, 66, W - 2, 70, seed + 1);
  bench(m, 8, 1, 71, k);
  bench(m, W - 14, 1, 71, k);
  for (let x = DX0 - 6; x <= DX1 + 6; x += 4) if (x < DX0 - 3 || x > DX1 + 3) m.box(x, 1, CZ1 + 2, x + 1, 4, CZ1 + 3, C("#2a2830"));
  // the red carpet to the doors
  m.box(DX0 - 1, 1, PZ1 + 2, DX1 + 1, 1.2, CZ1 + 1, C("#8a1a24"));

  lights.push([cx, 12, PZ1 + 4, "#ffd9a0"]);
  lights.push([CCX, CY + 20, CCZ + 16, "#fff0c8"]);

  return {
    model: m,
    signs,
    door: [cx, D],
    body: [0, 0, W, D],
    walls: [[PX0, PZ0, PX1, PZ1]],
    lights,
    scale: k,
    points: {
      door: [cx, 1, PZ1 + 2],
      keeper: [cx + 6, 1, CZ1 + 1],
      lobby: [cx, 1, PZ1 - 8],
      deck: [CCX, DY, CCZ],
      tip: [SX + 0.5, tip + 2, SZ + 0.5],
      camPos: [cx + 110, 160, D + 210],
      camLook: [cx, 230, 34],
    },
  };
}
