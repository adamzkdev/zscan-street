import type { Built } from "../buildings";
import { C, E, G, hash, shades, VoxelModel } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, leafTree } from "./needle";

/**
 * Shibuya's corner on the scramble crossing (the lot's front faces east onto the street, its
 * south side the boulevard, the crossing at its south-east corner):
 *
 *  - ZFRONT, the QFRONT-like glass tower right on the corner: a lit shop floor, the ZK COFFEE café
 *    on the 2nd floor wide open on the crossing (the live layer puts people at its windows), a
 *    curtain wall of glass carrying a GIANT LED screen on the front and a second one on the south
 *    side, an LED ticker band wrapping round the corner, neon on its edges, its name on the roof;
 *  - the 109-like silver cylinder on the boulevard corner behind it, with its sign pylon;
 *  - a mid-rise annex behind both;
 *  - the corner plaza where the crowd waits for the scramble (Hachiko comes with the live layer).
 *
 * Model axes: x runs along the front from the boulevard (x = 0, world south) to the north end,
 * z from the back (west) to the front (east). Scale 2: a voxel is a third of a metre.
 *
 * Points (model voxels): screens as bottom-left / top-right corners on their surface, seen from
 * outside — `scrMainA/B` (front), `scrSideA/B` (south), `tickA/B` and `tickSA/B` (the ticker band,
 * front and south), `p109EA/B` and `p109SA/B` (the 109 pylon's east and south faces); `cafeFa/b`
 * and `cafeSa/b` (lines along the inside of the café's front and south windows, on its floor);
 * `hachi` (the statue's spot on the plaza); `camPos` / `camLook`.
 */
export function shibuya(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 120;
  const m = new VoxelModel(W, H, D);
  const signs: SignSpot[] = [];
  const lights: [number, number, number, string][] = [];
  const points: NonNullable<Built["points"]> = {};

  // ---- ZFRONT: footprint x 12..67, z 27..60 (front wall at z = 59) ---------------------------
  const QX0 = 12,
    QX1 = 67,
    QZ0 = 27,
    QZ1 = 60;
  const TOP = 96;
  const GF = 14; // shop floor
  const CF = 26; // top of the café floor
  const FL = 10; // office floors above
  const inside = C("#24222a");
  m.box(QX0, 0, QZ0, QX1, TOP, QZ1, inside);
  const glass = [G("#5b6f86"), G("#667b93"), G("#506378"), G("#7088a2")];
  const mullion = C("#b9c0ca"),
    spandrel = C("#2b313a"),
    fascia = C("#16151b");
  const litCool = [E("#d8ecff", 1.05), E("#bfe0ff", 1.0)],
    litWarm = [E("#ffd9a0", 1.1), E("#ffe8c4", 1.05)];
  const shopLit = [E("#ffe7c4", 0.75), E("#ffdcb0", 0.7), E("#fff0dc", 0.8)];
  const posters = [E("#ff3e8a", 1.0), E("#3ef0ff", 0.95), E("#f4b728", 1.0), E("#b07bff", 0.95)];
  const shelf = C("#4a4452");
  /** One cell of the skin: `a` runs along the facade (continuous round the corner). */
  const skin = (x: number, y: number, z: number, a: number, front: boolean, open = front) => {
    if (y === 0) return m.set(x, y, z, C("#3a3842"));
    if (y < GF - 2) {
      // the shop floor: tall shop windows, bright inside, slim posts; the entrance on the corner
      const door = front && x >= QX0 + 2 && x < QX0 + 11 && y < 9;
      if (door) return m.set(x, y, z, a % 3 === 0 ? C("#c8ccd2") : E("#fff6e6", 1.7));
      if (a % 5 === 0) return m.set(x, y, z, mullion);
      if (y < 3) return m.set(x, y, z, shelf);
      if (y > 9) return m.set(x, y, z, E("#fff0dc", 0.95));
      const h = hash(Math.floor(a / 5), Math.floor(y / 3), 3, seed);
      return m.set(x, y, z, h < 0.22 ? posters[Math.floor(h * 18) % 4] : h > 0.82 ? shelf : shopLit[Math.floor(hash(a, y, 5, seed) * 3)]);
    }
    if (y < GF) return m.set(x, y, z, y === GF - 1 ? E("#3ef0ff", 2.2) : fascia);
    if (y < CF) {
      // the café: open between slim mullions (filled in below), a warm band under its ceiling
      if (y === GF || y === CF - 1) return m.set(x, y, z, y === GF ? C("#d8d4cc") : E("#ffcf8a", 1.6));
      return m.set(x, y, z, a % 7 === 0 ? mullion : open ? 0 : glass[a % 4]);
    }
    const fy = (y - CF) % FL;
    if (fy === 0) return m.set(x, y, z, spandrel);
    if (a % 6 === 0) return m.set(x, y, z, mullion);
    const bay = Math.floor(a / 6),
      floor = Math.floor((y - CF) / FL);
    const h = hash(bay, floor, front ? 1 : 2, seed);
    if (h < 0.2 && fy > 1 && fy < FL - 1) return m.set(x, y, z, (h < 0.08 ? litWarm : litCool)[floor & 1]);
    m.set(x, y, z, glass[Math.floor(hash(bay, floor, y, seed) * 4)]);
  };
  for (let y = 0; y < TOP; y++) {
    for (let x = QX0; x < QX1; x++) skin(x, y, QZ1 - 1, QZ1 - QZ0 + (x - QX0), true);
    for (let z = QZ0; z < QZ1; z++) skin(QX0, y, z, z - QZ0, false, true);
    for (let z = QZ0; z < QZ1; z++) skin(QX1 - 1, y, z, z - QZ0 + 3, false);
    for (let x = QX0; x < QX1; x++) skin(x, y, QZ0, x - QX0, false);
  }
  // the café inside: 4 m deep along the front and the south side, floor, ceiling, back walls
  const cafeFloor = shades(["#6a4a32", "#62442e", "#704e36"], 1, 11);
  const fz0 = QZ1 - 13,
    sx1 = QX0 + 13;
  for (let y = GF; y < CF; y++)
    for (let z = QZ0 + 1; z < QZ1 - 1; z++)
      for (let x = QX0 + 1; x < QX1 - 1; x++) {
        const inFront = z >= fz0,
          inSide = x < sx1;
        if (!inFront && !inSide) continue;
        if (y === GF) m.set(x, y, z, cafeFloor);
        else if (y === CF - 1) m.set(x, y, z, (x + z) % 6 === 0 ? E("#ffd59a", 1.8) : C("#2c2622"));
        else m.set(x, y, z, 0);
      }
  // back walls: warm plaster, menu boards glowing, a long counter with the coffee machines
  for (let y = GF + 1; y < CF - 1; y++) {
    for (let x = sx1; x < QX1 - 1; x++) m.set(x, y, fz0 - 1, y > GF + 6 && y < GF + 9 && x % 9 < 6 && x > sx1 + 4 ? E("#f6e3c0", 1.3) : C("#b89a74"));
    for (let z = QZ0 + 1; z < fz0; z++) m.set(sx1, y, z, y > GF + 6 && y < GF + 9 && z % 9 < 6 ? E("#f6e3c0", 1.3) : C("#b89a74"));
  }
  m.box(sx1 + 3, GF + 1, fz0, QX1 - 4, GF + 4, fz0 + 2, C("#3a2a20"));
  m.box(sx1 + 3, GF + 4, fz0, QX1 - 4, GF + 5, fz0 + 2, C("#d8d2c8"));
  for (let x = sx1 + 6; x < QX1 - 6; x += 7) m.box(x, GF + 5, fz0, x + 2, GF + 7, fz0 + 1, C("#9aa0a8"));
  // window bar along the glass and little round tables behind it
  const bar = C("#8a6a4a");
  for (let x = QX0 + 1; x < QX1 - 1; x++) m.set(x, GF + 3, QZ1 - 2, bar);
  for (let z = QZ0 + 1; z < QZ1 - 1; z++) m.set(QX0 + 1, GF + 3, z, bar);
  for (let x = sx1 + 3; x < QX1 - 4; x += 6) {
    m.box(x, GF + 1, fz0 + 6, x + 1, GF + 3, fz0 + 7, C("#2a2830"));
    m.box(x - 1, GF + 3, fz0 + 5, x + 2, GF + 4, fz0 + 8, C("#e8e2d6"));
  }
  for (let z = QZ0 + 4; z < fz0 - 2; z += 6) {
    m.box(QX0 + 6, GF + 1, z, QX0 + 7, GF + 3, z + 1, C("#2a2830"));
    m.box(QX0 + 5, GF + 3, z - 1, QX0 + 8, GF + 4, z + 2, C("#e8e2d6"));
  }
  // hanging lamps
  for (let x = QX0 + 4; x < QX1 - 2; x += 8) m.box(x, CF - 3, QZ1 - 5, x + 1, CF - 2, QZ1 - 4, E("#ffc070", 2.2));
  points.cafeFa = [QX0 + 3, GF + 1, QZ1 - 3.2];
  points.cafeFb = [QX1 - 3, GF + 1, QZ1 - 3.2];
  points.cafeSa = [QX0 + 3.2, GF + 1, QZ0 + 3];
  points.cafeSb = [QX0 + 3.2, GF + 1, QZ1 - 6];
  lights.push([QX0 + 20, GF + 6, QZ1 - 6, "#ffc070"]);
  signs.push({ text: "ZK COFFEE 2F", color: "#3ee08f", x: QX1 - 13, y: GF - 1.2, z: QZ1, w: 20, h: 2.2, vertical: false, facing: "front" });

  // ---- the screens and the ticker band (black panels with a frame; the live layer lights them)
  const panel = C("#07070a"),
    frame = C("#2c2c34");
  const plate = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    m.box(x0 - (x1 - x0 > 1 ? 1 : 0), y0 - 1, z0 - (z1 - z0 > 1 ? 1 : 0), x1 + (x1 - x0 > 1 ? 1 : 0), y1 + 1, z1 + (z1 - z0 > 1 ? 1 : 0), frame);
    m.box(x0, y0, z0, x1, y1, z1, panel);
  };
  // front: 15 m × 10.7 m, the city's biggest
  plate(QX0 + 6, 34, QZ1, QX1 - 4, 66, QZ1 + 1);
  points.scrMainA = [QX0 + 6, 34, QZ1 + 1];
  points.scrMainB = [QX1 - 4, 66, QZ1 + 1];
  // south side, towards the boulevard
  plate(QX0 - 1, 37, QZ0 + 4, QX0, 62, QZ1 - 3);
  points.scrSideA = [QX0 - 1, 37, QZ0 + 4];
  points.scrSideB = [QX0 - 1, 62, QZ1 - 3];
  // the ticker band round the corner, over the café
  m.box(QX0 - 1, CF + 2, QZ1, QX1, CF + 6, QZ1 + 1, panel);
  m.box(QX0 - 1, CF + 2, QZ0, QX0, CF + 6, QZ1 + 1, panel);
  points.tickA = [QX0 - 1, CF + 2, QZ1 + 1];
  points.tickB = [QX1, CF + 6, QZ1 + 1];
  points.tickSA = [QX0 - 1, CF + 2, QZ0];
  points.tickSB = [QX0 - 1, CF + 6, QZ1 + 1];
  // neon on the corner edge, up the full height, and along the roof line
  for (let y = CF; y < TOP; y++) {
    m.set(QX0 - 1, y, QZ1, E("#ff3e8a", 2.4));
    m.set(QX1, y, QZ1, E("#3ef0ff", 2));
  }
  for (let x = QX0 - 1; x <= QX1; x++) m.set(x, TOP, QZ1, E("#3ef0ff", 2.2));
  for (let z = QZ0; z <= QZ1; z++) m.set(QX0 - 1, TOP, z, E("#ff3e8a", 2.2));
  // roof: parapet, plant, the name on a frame facing the crossing
  m.box(QX0, TOP, QZ0, QX1, TOP + 1, QZ1, C("#3a3844"));
  for (let x = QX0; x < QX1; x++)
    for (let z = QZ0; z < QZ1; z++) if (x === QX0 || x === QX1 - 1 || z === QZ0 || z === QZ1 - 1) m.box(x, TOP + 1, z, x + 1, TOP + 3, z + 1, C("#4a4854"));
  for (const [x, z] of [
    [QX0 + 8, QZ0 + 6],
    [QX0 + 20, QZ0 + 5],
    [QX0 + 34, QZ0 + 7],
  ])
    m.box(x, TOP + 1, z, x + 6, TOP + 5, z + 5, C("#bcb8c4"));
  const nameZ = QZ1 - 4;
  for (const x of [QX0 + 10, QX1 - 10]) m.box(x, TOP + 1, nameZ, x + 1, TOP + 18, nameZ + 1, C("#2a2832"));
  m.box(QX0 + 8, TOP + 8, nameZ + 1, QX1 - 8, TOP + 18, nameZ + 2, C("#121118"));
  signs.push({ text: "ZFRONT", color: "#ffffff", x: (QX0 + QX1) / 2, y: TOP + 13, z: nameZ + 2, w: QX1 - QX0 - 18, h: 9, vertical: false, facing: "front" });
  // a blade sign at the north end of the front, read from the crossing
  m.box(QX1 - 3, CF + 10, QZ1, QX1 - 2, TOP - 6, QZ1 + 4, C("#18171d"));
  signs.push({ text: "渋谷", color: "#ff3e8a", x: QX1 - 2, y: (CF + 10 + TOP - 6) / 2, z: QZ1 + 2, w: 4, h: TOP - CF - 18, vertical: true, facing: "side" });

  // ---- the 109: a silver cylinder on the boulevard corner, its sign pylon on top ----------------
  const cx = 16.5,
    cz = 13.5,
    R = 11.4,
    T9 = 78;
  const silver = C("#d6dae0"),
    silverDark = C("#aeb4bc"),
    band = C("#8c929c");
  for (let y = 0; y < T9; y++)
    for (let z = Math.floor(cz - R - 1); z <= cz + R + 1; z++)
      for (let x = Math.floor(cx - R - 1); x <= cx + R + 1; x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d > R) continue;
        if (d < R - 2) {
          m.set(x, y, z, inside);
          continue;
        }
        const a = Math.atan2(z + 0.5 - cz, x + 0.5 - cx);
        const rib = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 44);
        if (y < 12) m.set(x, y, z, y === 0 ? C("#3a3842") : rib % 4 === 0 ? silverDark : E(["#ffe6f0", "#fff0e0", "#ffe0ea"][rib % 3], 0.85));
        else if (y < 14) m.set(x, y, z, y === 13 ? E("#ff4fa0", 2.4) : fascia);
        else if ((y - 14) % 9 === 0) m.set(x, y, z, band);
        else m.set(x, y, z, rib % 2 === 0 ? silver : (y - 14) % 9 > 2 && hash(rib, Math.floor(y / 9), 9, seed) > 0.55 ? E("#fff2d8", 1.0) : G("#7d8898"));
      }
  // crown: a lit ring, a flat roof
  for (let z = Math.floor(cz - R - 1); z <= cz + R + 1; z++)
    for (let x = Math.floor(cx - R - 1); x <= cx + R + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d <= R) m.set(x, T9, z, d > R - 1.2 ? E("#ffffff", 1.6) : C("#9a9ea8"));
    }
  // the pylon on the south-east quarter: 2 m × 2 m, 12 m tall, signs on its east and south faces
  const PX0 = 8,
    PX1 = 14,
    PZ0 = 16,
    PZ1 = 22,
    PY = T9 + 1,
    PT = T9 + 37;
  m.box(PX0, PY, PZ0, PX1, PT, PZ1, C("#e8eaee"));
  m.box(PX0 - 1, PT, PZ0 - 1, PX1 + 1, PT + 1, PZ1 + 1, E("#ff4fa0", 2.2));
  points.p109EA = [PX0, PY + 3, PZ1];
  points.p109EB = [PX1, PT - 2, PZ1];
  points.p109SA = [PX0, PY + 3, PZ0];
  points.p109SB = [PX0, PT - 2, PZ1];

  // ---- the annex behind: mid-rise, ribbon windows, rooftop billboard ---------------------------
  const AX0 = 30,
    AX1 = W,
    AZ0 = 0,
    AZ1 = 25,
    AT = 57;
  const clad = shades(["#4c4654", "#47414f", "#514b59"], 2, seed + 4);
  m.box(AX0, 0, AZ0, AX1, AT, AZ1, clad);
  for (let y = 4; y < AT - 2; y++) {
    const fy = y % 10;
    if (fy < 4 || fy > 8) continue;
    const floor = Math.floor(y / 10);
    const paint = (x: number, z: number, a: number) => {
      const h = hash(Math.floor(a / 5), floor, 4, seed);
      m.set(x, y, z, a % 5 === 0 ? C("#3a3542") : h < 0.45 ? (h < 0.2 ? E("#ffc890", 1.15) : E("#cfe6ff", 1.0)) : G("#2a3446"));
    };
    for (let x = AX0; x < AX1; x++) (paint(x, AZ0, x), paint(x, AZ1 - 1, x));
    for (let z = AZ0; z < AZ1; z++) (paint(AX0, z, z), paint(AX1 - 1, z, z + 7));
  }
  m.box(AX0, AT, AZ0, AX1, AT + 1, AZ1, C("#3a3844"));
  // billboard frame on its roof, facing the crossing over the plaza
  for (const x of [AX0 + 8, AX0 + 30]) m.box(x, AT + 1, AZ1 - 3, x + 1, AT + 22, AZ1 - 2, C("#2a2832"));
  m.box(AX0 + 4, AT + 8, AZ1 - 2, AX0 + 36, AT + 22, AZ1 - 1, panel);
  points.roofA = [AX0 + 4, AT + 8, AZ1 - 1];
  points.roofB = [AX0 + 36, AT + 22, AZ1 - 1];
  // neon edges down its corner on the plaza side
  for (let y = 2; y < AT; y++) m.set(AX0 - 1, y, AZ1 - 1, E("#b07bff", 2));

  // ---- the plaza: trees and benches away from the waiting crowd, bollards on the kerb ----------
  leafTree(m, 4, 0, 30, k, seed + 1, 7);
  leafTree(m, 70, 0, 66, k, seed + 2, 6.5);
  bench(m, 3, 0, 36, k, true);
  for (let x = 30; x < W - 2; x += 6) m.box(x, 0, D - 2, x + 1, 3, D - 1, C("#2b2933"));
  points.hachi = [6, 0, 45];
  points.corner = [3, 0, D - 3];
  points.camPos = [-60, 70, D + 80];
  points.camLook = [20, 30, 40];
  lights.push([QX0 + 6, 8, QZ1 + 3, "#fff0d8"]);

  const walls: [number, number, number, number][] = [
    [QX0 - 1, QZ0, QX1 + 1, QZ1 + 1],
    [Math.floor(cx - R), Math.floor(cz - R), Math.ceil(cx + R), Math.ceil(cz + R)],
    [AX0, AZ0, AX1, AZ1],
  ];
  return { model: m, signs, door: [QX0 + 6, QZ1 + 1], body: [0, 0, W, D], lights, walls, points, scale: k };
}
