import type { Built } from "../buildings";
import { C, E, G, hash, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, lampPost } from "./needle";

/**
 * ZK UNIVERSITY, on the park's east side next to the city works, built like Stanford's Main Quad:
 * buff sandstone, round Romanesque arches, red tile roofs. From the street (south) the Oval with
 * its palms and a golden Z in the flower bed, then the front range and its arcade split by the
 * great gateway, the arcaded quadrangle behind it with its round planted beds, the chapel closing
 * the quad at the north end (a gold mosaic over its triple arch, a rose window) and, at the front
 * corner, the bell tower (Hoover's: slit-windowed shaft, clock, open belfry, red dome).
 *
 * Scale 2 (a third of a metre), front (+z) on the street. Points: `door` (the gateway), `keeper`,
 * `crown` (the belfry), `camPos`, `camLook`.
 */
export function university(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 200;
  const m = new VoxelModel(W, H, D);
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];
  const cx = W / 2;

  // ---- palette -----------------------------------------------------------------------------------
  const S = (hexes: string[], sc = 1, sd = 0): Paint => {
    const ids = hexes.map((h) => C(h));
    return (x, y, z) => ids[Math.floor(hash(Math.floor(x / sc), Math.floor(y / sc), Math.floor(z / sc), sd + seed) * ids.length)];
  };
  const stone = S(["#d9bb8c", "#d2b383", "#dfc395", "#ccad7e"], 2);
  const stoneLt = C("#e8d2a6");
  const recess = C("#9e7f58");
  const deep = C("#6a5440");
  const tile = S(["#b44c35", "#a9442f", "#bf573b", "#9e3f2c"], 1, 3);
  const ridge = C("#8a3424");
  const pave = S(["#d6c6a4", "#cfbf9c", "#dccdab"], 3, 5);
  const path = S(["#c9ae7c", "#c2a774"], 2, 6);
  const lawn = S(["#5f9a48", "#579142", "#67a250"], 1, 7);
  const bed = S(["#c8343c", "#d84a3a", "#b82c3a"], 1, 8);
  const zFlower = S(["#f4b728", "#ffc93c"], 1, 9);
  const glass = G("#2a3442");
  const lit = E("#ffd394", 1.0);
  const gold = E("#f2c45a", 1.05);
  const goldDk = C("#c4952e");
  const lapis = C("#2c4a92");
  const garnet = C("#9a2a2e");
  const iron = C("#26242a");
  const trunk = C("#7a6248");
  const frond = S(["#3f8a3e", "#4c9a46", "#357a36"], 1, 11);

  /** Inside a round-headed (Romanesque) arch of width `w`, height `h` to its crown, from y0. */
  const inArch = (dx: number, y: number, w: number, h: number) => {
    const r = w / 2;
    const spring = h - r;
    if (Math.abs(dx) >= r) return false;
    if (y < spring) return true;
    return dx * dx + (y - spring) ** 2 < r * r;
  };
  /** A hip roof of red tile over [x0, x1) × [z0, z1) from y0, rising `rise` per voxel of inset. */
  const hipRoof = (x0: number, z0: number, x1: number, z1: number, y0: number, rise = 0.7) => {
    for (let j = 0; ; j++) {
      const t = Math.floor(j / rise);
      if (x0 + t >= x1 - t || z0 + t >= z1 - t) break;
      m.box(x0 + t, y0 + j, z0 + t, x1 - t, y0 + j + 1, z1 - t, tile);
      if (x1 - x0 - 2 * t <= 2 || z1 - z0 - 2 * t <= 2) m.box(x0 + t, y0 + j, z0 + t, x1 - t, y0 + j + 1, z1 - t, ridge);
    }
  };
  /** A gable roof whose ridge runs along z (eaves on the x sides), or along x. */
  const gable = (x0: number, z0: number, x1: number, z1: number, y0: number, alongZ: boolean, rise = 0.7, ends: Paint = stone) => {
    const span = alongZ ? x1 - x0 : z1 - z0;
    for (let j = 0; ; j++) {
      const t = Math.floor(j / rise);
      if (t * 2 >= span) break;
      if (alongZ) {
        m.box(x0 + t, y0 + j, z0, x1 - t, y0 + j + 1, z1, tile);
        // the gable ends in stone, one voxel in
        m.box(x0 + t + 1, y0 + j, z0, x1 - t - 1, y0 + j + 1, z0 + 1, ends);
        m.box(x0 + t + 1, y0 + j, z1 - 1, x1 - t - 1, y0 + j + 1, z1, ends);
        if (span - t * 2 <= 2) m.box(x0 + t, y0 + j, z0, x1 - t, y0 + j + 1, z1, ridge);
      } else {
        m.box(x0, y0 + j, z0 + t, x1, y0 + j + 1, z1 - t, tile);
        m.box(x0, y0 + j, z0 + t + 1, x0 + 1, y0 + j + 1, z1 - t - 1, ends);
        m.box(x1 - 1, y0 + j, z0 + t + 1, x1, y0 + j + 1, z1 - t - 1, ends);
        if (span - t * 2 <= 2) m.box(x0, y0 + j, z0 + t, x1, y0 + j + 1, z1 - t, ridge);
      }
    }
  };
  /** A palm: a ringed trunk, a crown of drooping fronds. */
  const palmTree = (x: number, y0: number, z: number, h: number, s: number) => {
    x = Math.round(x);
    z = Math.round(z);
    const lx = s % 3 === 0 ? 1 : s % 3 === 1 ? -1 : 0;
    let tx = x;
    for (let y = 0; y < h; y++) {
      if (y === Math.floor(h * 0.65)) tx += lx;
      m.set(tx, y0 + y, z, y % 3 === 0 ? recess : trunk);
    }
    const ty = y0 + h;
    m.box(tx - 1, ty, z - 1, tx + 2, ty + 1, z + 2, frond);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ]) {
      const len = dx && dz ? 3 : 4;
      for (let i = 1; i <= len; i++) m.set(tx + dx * i, ty + (i < 2 ? 1 : i < 4 ? 0 : -1), z + dz * i, frond);
    }
    m.set(tx, ty + 1, z, frond);
  };

  // ---- layout (voxels) ---------------------------------------------------------------------------
  const FR1 = D - 38, // the front range's street face
    FR0 = FR1 - 15; // its back (the quad side)
  const SR = 15; // the side ranges' depth (x 0..SR and W-SR..W)
  const CH1 = 58, // the chapel's front (the quad's north end)
    CH0 = 6;
  const QX0 = SR,
    QX1 = W - SR,
    QZ0 = CH1,
    QZ1 = FR0;
  const RH = 26; // range wall height
  const ARC = 4; // arcade depth
  const GW = 8; // half the gateway's width
  // the bell tower: at the quad's north-east corner, beside the chapel (Hoover's stands behind the quad)
  const TX0 = W - 16,
    TX1 = W - 1,
    TZ0 = CH1 - 14,
    TZ1 = CH1 + 2;
  const TOP = 150; // the shaft's top

  // ---- ground: kerb, the Oval, its palms, the golden Z --------------------------------------------
  m.box(0, 0, 0, W, 1, D, pave);
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (x < 1 || x >= W - 1 || z >= D - 1) m.set(x, 0, z, C("#9c937f"));
      // the Oval: a lawn ellipse, a red flower ring, a gold Z in the middle
      const ox = (x + 0.5 - cx) / 26,
        oz = (z + 0.5 - (D - 19)) / 13;
      const r = ox * ox + oz * oz;
      if (r < 1) {
        m.set(x, 0, z, r > 0.78 ? bed : lawn);
        const zx = x + 0.5 - cx,
          zz = z + 0.5 - (D - 19);
        if (Math.abs(zz) < 7 && Math.abs(zx) < 9) {
          const top = zz < -5,
            bot = zz > 5,
            diag = Math.abs(zx + zz * 1.2) < 1.3;
          if (top || bot || diag) m.set(x, 1, z, zFlower);
        }
      }
      // the drive round the Oval and the walk to the gateway
      else if (r < 1.5 || (Math.abs(x + 0.5 - cx) < GW && z > FR1)) m.set(x, 0, z, path);
    }
  for (let i = 0; i < 6; i++) {
    const z = D - 5 - i * 6;
    if (z > FR1 + 2) {
      palmTree(4, 1, z, 22 + (i % 3) * 2, i);
      palmTree(W - 5, 1, z, 22 + ((i + 1) % 3) * 2, i + 5);
    }
  }

  // ---- the quad: paving, the arcade walks, round beds with palms --------------------------------------
  for (let z = QZ0; z < QZ1; z++)
    for (let x = QX0; x < QX1; x++) {
      const dx = x + 0.5 - cx;
      for (const bz of [QZ0 + 26, QZ0 + 66]) {
        const dd = Math.sqrt(dx * dx + (z + 0.5 - bz) ** 2);
        if (dd < 9) m.set(x, 1, z, dd < 7.6 ? lawn : stoneLt);
      }
      if (Math.abs(dx) < 3 && m.get(x, 1, z) === 0) m.set(x, 0, z, path);
    }
  for (const bz of [QZ0 + 26, QZ0 + 66]) {
    palmTree(cx, 2, bz, 28, bz);
    for (let a = 0; a < 6; a++) m.blob(cx + Math.cos(a) * 5, 3, bz + Math.sin(a) * 5, 1.8, S(["#3d7a38", "#4a8a40", "#c8343c"], 1, a), 0.3, a + bz);
  }
  for (const [x, z] of [
    [QX0 + 6, QZ0 + 46],
    [QX1 - 7, QZ0 + 46],
  ])
    bench(m, x, 1, z, k, true);

  // ---- the ranges: walls with tall windows, the arcade on the quad side, red hip roofs -----------------
  /** Fill a range's solid with windows on its outer face(s). */
  const range = (x0: number, z0: number, x1: number, z1: number, h: number) => {
    for (let y = 1; y < h; y++)
      for (let z = z0; z < z1; z++)
        for (let x = x0; x < x1; x++) {
          const edgeX = x === x0 || x === x1 - 1,
            edgeZ = z === z0 || z === z1 - 1;
          if (!edgeX && !edgeZ) continue;
          let c: Paint = stone;
          if (y < 3) c = recess; // the plinth
          else if (y === h - 1 || y === h - 2) c = stoneLt; // the cornice
          else {
            const u = edgeZ ? x : z;
            const fy = y < 14 ? y - 4 : y - 15;
            const win = u % 7 >= 2 && u % 7 <= 4 && fy >= 1 && fy <= 7 && !(edgeX && edgeZ);
            if (win) c = fy === 7 ? recess : hash(Math.floor(u / 7), y < 14 ? 0 : 1, edgeZ ? z : x, seed) < 0.35 ? lit : glass;
          }
          m.set(x, y, z, c);
        }
  };
  /** An arcade along a face: piers between round arches, a stone soffit, the walk under it. */
  const arcadeCut = (x0: number, z0: number, x1: number, z1: number, alongX: boolean, h = 16) => {
    m.box(x0, h, z0, x1, h + 2, z1, stoneLt);
    m.box(x0, 1, z0, x1, h, z1, stone);
    const L = alongX ? x1 - x0 : z1 - z0;
    const bays = Math.max(1, Math.round(L / 9));
    const bw = L / bays;
    for (let b = 0; b < bays; b++) {
      const mid = b * bw + bw / 2;
      for (let y = 1; y < h; y++)
        for (let u = Math.floor(b * bw); u < Math.ceil((b + 1) * bw); u++) {
          if (u >= L || !inArch(u + 0.5 - mid, y - 1, bw - 3, h - 3)) continue;
          if (alongX) m.clear(x0 + u, y, z0, x0 + u + 1, y + 1, z1);
          else m.clear(x0, y, z0 + u, x1, y + 1, z0 + u + 1);
        }
    }
    // the walk's floor under the arches
    m.box(x0, 0, z0, x1, 1, z1, stoneLt);
  };

  // the side ranges (west and east), the arcade on their quad face
  range(0, CH1 - 4, SR - ARC, FR0, RH);
  range(W - SR + ARC, CH1 - 4, W, FR0, RH);
  arcadeCut(SR - ARC, CH1, SR, FR0, false);
  arcadeCut(W - SR, CH1, W - SR + ARC, FR0, false);
  hipRoof(-1, CH1 - 5, SR + 1, FR0 + 1, RH, 0.75);
  hipRoof(W - SR - 1, CH1 - 5, W + 1, FR0 + 1, RH, 0.75);
  // the front range, its arcade on the street (the Oval) side
  range(0, FR0, W, FR1 - ARC, RH);
  arcadeCut(0, FR1 - ARC, W, FR1, true);
  hipRoof(-1, FR0 - 1, W + 1, FR1 + 1, RH, 0.75);

  // ---- the great gateway: a taller block, one huge round arch through to the quad -----------------------
  {
    const GH = 44;
    const gx0 = Math.floor(cx - GW - 6),
      gx1 = Math.ceil(cx + GW + 6);
    m.box(gx0, 1, FR0 - 1, gx1, GH, FR1 + 2, stone);
    for (let y = 1; y < GH; y++)
      for (let x = gx0; x < gx1; x++) {
        const dx = x + 0.5 - cx;
        if (inArch(dx, y - 1, GW * 2, 30)) m.clear(x, y, FR0 - 1, x + 1, y + 1, FR1 + 2);
        // the arch's voussoirs on both faces
        else if (inArch(dx, y - 1, GW * 2 + 4, 32)) {
          m.set(x, y, FR1 + 1, stoneLt);
          m.set(x, y, FR0 - 1, stoneLt);
        }
      }
    m.box(gx0, 0, FR0 - 1, gx1, 1, FR1 + 2, path);
    // a carved frieze band and the cornice
    m.box(gx0 - 1, 36, FR0 - 2, gx1 + 1, 38, FR1 + 3, stoneLt);
    for (let x = gx0; x < gx1; x++) if (x % 3 === 0) m.set(x, 37, FR1 + 3, recess);
    gable(gx0 - 1, FR0 - 2, gx1 + 1, FR1 + 3, GH, false, 0.85);
    // lanterns either side of the arch
    for (const x of [Math.round(cx - GW - 3), Math.round(cx + GW + 2)]) {
      m.box(x, 18, FR1 + 2, x + 1, 22, FR1 + 3, E("#ffc870", 1.6));
      lights.push([x + 0.5, 20, FR1 + 4, "#ffd08a"]);
    }
    signs.push({ text: "ZK UNIVERSITY", color: "#f4b728", x: cx, y: 40.5, z: FR1 + 3.2, w: 30, h: 4.2, vertical: false, facing: "front" });
    lights.push([cx, 26, FR1 + 6, "#ffe0a8"]);
    lights.push([cx, 20, FR0 - 4, "#ffd894"]);
  }

  // ---- the chapel: the quad's north end ------------------------------------------------------------------
  {
    const X0 = 16,
      X1 = W - 16;
    const NH = 40; // the nave's walls
    // the nave (along z) and the transept (along x)
    range(X0 + 5, CH0, X1 - 5, CH1, NH);
    range(X0 - 8, CH0 + 14, X1 + 8, CH0 + 30, NH - 6);
    gable(X0 + 4, CH0 - 1, X1 - 4, CH1 + 1, NH, true, 0.8);
    gable(X0 - 9, CH0 + 13, X1 + 9, CH0 + 31, NH - 6, false, 0.8);
    // the façade on the quad: a stone screen with the triple arch, the mosaic over it, the rose
    const FZ = CH1;
    const FH = 66;
    for (let y = 1; y < FH; y++)
      for (let x = X0; x < X1; x++) {
        const dx = x + 0.5 - cx;
        // a stepped gable top
        if (y > 50 && Math.abs(dx) > (FH - y) * 1.6 + 2) continue;
        let c: Paint = stone;
        const arch = inArch(dx, y - 1, 10, 20) || inArch(dx - 13, y - 1, 6, 14) || inArch(dx + 13, y - 1, 6, 14);
        if (arch) c = y < 3 ? path : deep;
        else if (inArch(dx, y - 1, 13, 22) || inArch(dx - 13, y - 1, 9, 16) || inArch(dx + 13, y - 1, 9, 16)) c = stoneLt;
        // the mosaic: gold ground, a lapis band, figures in blocks of garnet and lapis
        else if (y >= 25 && y < 47 && Math.abs(dx) < 19) {
          const fy = y - 25;
          const fx = Math.floor(dx + 19);
          if (fy === 0 || fy === 21 || Math.abs(dx) > 18) c = goldDk;
          else if (fy < 3) c = lapis;
          else {
            const fig = Math.floor((fx + 3) / 6);
            const inFig = fx % 6 >= 2 && fx % 6 <= 4 && fy >= 6 && fy <= 17 && fig !== 3;
            const halo = fx % 6 >= 2 && fx % 6 <= 4 && fy === 18 && fig !== 3;
            // the middle panel: a gold Z on lapis
            const zx = dx,
              zy = fy - 11;
            const mid = Math.abs(zx) < 4 && Math.abs(zy) < 6;
            if (mid) c = zy < -4 || zy > 4 || Math.abs(zx + zy * 0.75) < 1 ? gold : lapis;
            else if (halo) c = gold;
            else if (inFig) c = fy > 12 ? garnet : (fx + fy) % 2 ? lapis : C("#e8e0cc");
            else c = (x + y) % 2 ? gold : E("#e9b84a", 0.95);
          }
        }
        // the rose window over the mosaic
        else {
          const rr = Math.sqrt(dx * dx + (y - 55) ** 2);
          if (rr < 6) c = rr < 1.2 ? gold : Math.floor(Math.atan2(y - 55, dx) * 4) % 2 ? E("#4a7ad8", 0.9) : E("#d84a5a", 0.9);
          else if (rr < 7) c = stoneLt;
        }
        m.set(x, y, FZ, c);
        m.set(x, y, FZ - 1, arch ? deep : stone);
      }
    // its steps down to the quad
    for (let s = 0; s < 3; s++) m.box(X0 + 2, 0, FZ + s, X1 - 2, 3 - s, FZ + s + 1, stoneLt);
    // the crossing: a low octagonal lantern
    m.cylinder(cx, NH + 14, CH0 + 22, 7, 10, stone);
    for (let y = NH + 17; y < NH + 22; y++)
      for (let a = 0; a < 8; a++) m.set(Math.round(cx + Math.cos((a * Math.PI) / 4) * 6.6), y, Math.round(CH0 + 22 + Math.sin((a * Math.PI) / 4) * 6.6), lit);
    for (let j = 0; j < 7; j++) m.cylinder(cx, NH + 24 + j, CH0 + 22, 7.5 - j, 1, tile);
    lights.push([cx, 36, FZ + 6, "#ffd894"]);
    lights.push([cx, 55, FZ + 4, "#f2c45a"]);
  }

  // ---- the bell tower (Hoover's) at the front-east corner --------------------------------------------------
  {
    const tcx = (TX0 + TX1) / 2,
      tcz = (TZ0 + TZ1) / 2;
    const hw = (TX1 - TX0) / 2;
    for (let y = 1; y < TOP; y++) {
      const inset = y > TOP - 40 ? 1 : 0;
      for (let z = TZ0 + inset; z < TZ1 - inset; z++)
        for (let x = TX0 + inset; x < TX1 - inset; x++) {
          const ex = x === TX0 + inset || x === TX1 - inset - 1,
            ez = z === TZ0 + inset || z === TZ1 - inset - 1;
          if (!ex && !ez) {
            if (y % 30 === 0) m.set(x, y, z, deep);
            continue;
          }
          let c: Paint = stone;
          const u = ez ? x - TX0 : z - TZ0;
          // the corner piers stand proud, the faces carry tall slit windows
          const pier = u < 3 || u > hw * 2 - 4;
          if (y < 4) c = recess;
          else if (!pier && (u === Math.floor(hw) - 3 || u === Math.floor(hw) + 2) && y > 30 && y < TOP - 46) c = (y % 12 < 10 ? (hash(u, Math.floor(y / 12), ez ? 1 : 2, seed) < 0.4 ? lit : glass) : stoneLt);
          else if (y === TOP - 41 || y === TOP - 42) c = stoneLt;
          m.set(x, y, z, c);
        }
    }
    // the clock stage: a dial on each face
    const CY = TOP - 30;
    for (const face of [0, 1, 2, 3]) {
      for (let a = -7; a <= 7; a++)
        for (let b = -7; b <= 7; b++) {
          const d = Math.sqrt(a * a + b * b);
          if (d > 6.5) continue;
          const hand = (a === 0 && b >= 0 && b <= 5) || (b === 0 && a >= 0 && a <= 4);
          const c = d > 5.6 ? goldDk : hand ? iron : E("#fff4dc", 1.2);
          const y = CY + b;
          if (face === 0) m.set(Math.round(tcx + a), y, TZ1, c);
          else if (face === 1) m.set(Math.round(tcx - a), y, TZ0 - 1, c);
          else if (face === 2) m.set(TX1, y, Math.round(tcz - a), c);
          else m.set(TX0 - 1, y, Math.round(tcz + a), c);
        }
    }
    // the belfry: open arches on four sides, the bell inside, a balustrade
    const BY0 = TOP,
      BY1 = TOP + 22;
    m.box(TX0 - 1, BY0, TZ0 - 1, TX1 + 1, BY0 + 2, TZ1 + 1, stoneLt);
    for (let y = BY0 + 2; y < BY1; y++)
      for (let z = TZ0; z < TZ1; z++)
        for (let x = TX0; x < TX1; x++) {
          const ex = x === TX0 || x === TX1 - 1,
            ez = z === TZ0 || z === TZ1 - 1;
          if (!ex && !ez) continue;
          const u = ez ? x + 0.5 - tcx : z + 0.5 - tcz;
          const open = inArch(u - 4.5, y - BY0 - 2, 6, 16) || inArch(u + 4.5, y - BY0 - 2, 6, 16);
          if (!open) m.set(x, y, z, stone);
        }
    // the bell (a bronze dome hanging in the middle), lit from inside at night
    for (let j = 0; j < 6; j++) m.cylinder(tcx, BY0 + 6 + j, tcz, 1.5 + j * 0.45, 1, C(j === 5 ? "#8a6a2a" : "#b58a3a"));
    m.box(Math.round(tcx), BY0 + 12, Math.round(tcz), Math.round(tcx) + 1, BY1, Math.round(tcz) + 1, iron);
    lights.push([tcx, BY0 + 10, tcz, "#ffcf86"]);
    // the cornice, the red dome and its lantern
    m.box(TX0 - 1, BY1, TZ0 - 1, TX1 + 1, BY1 + 2, TZ1 + 1, stoneLt);
    for (let j = 0; j < 12; j++) {
      const r = hw * Math.cos((j / 12) * (Math.PI / 2)) + 0.3;
      m.cylinder(tcx, BY1 + 2 + j, tcz, r, 1, tile);
    }
    m.cylinder(tcx, BY1 + 14, tcz, 1.6, 4, stoneLt);
    m.box(Math.round(tcx), BY1 + 18, Math.round(tcz), Math.round(tcx) + 1, BY1 + 24, Math.round(tcz) + 1, goldDk);
    m.box(Math.round(tcx), BY1 + 24, Math.round(tcz), Math.round(tcx) + 1, BY1 + 26, Math.round(tcz) + 1, E("#ff5a3a", 2.2));
  }

  // ---- lamps along the Oval and in the quad -----------------------------------------------------------------
  for (const z of [D - 8, D - 30]) {
    lampPost(m, 9, 1, z, k, "#ffd08a");
    lampPost(m, W - 10, 1, z, k, "#ffd08a");
  }
  for (const z of [QZ0 + 10, QZ0 + 46, QZ1 - 8]) {
    lampPost(m, QX0 + 3, 1, z, k, "#ffd08a");
    lampPost(m, QX1 - 4, 1, z, k, "#ffd08a");
    lights.push([cx, 8, z, "#ffd8a0"]);
  }

  return {
    model: m,
    signs,
    door: [cx, D],
    body: [0, 0, W, D],
    walls: [
      [0, CH0, W, CH1 + 3],
      [0, CH1, SR, FR1],
      [W - SR, CH1, W, FR1],
      [0, FR0 - 1, Math.round(cx - GW), FR1],
      [Math.round(cx + GW), FR0 - 1, W, FR1],
      [TX0, TZ0, TX1, TZ1],
    ],
    lights,
    scale: k,
    points: {
      door: [cx, 1, FR1 + 4],
      keeper: [cx + 10, 1, FR1 + 6],
      crown: [(TX0 + TX1) / 2, TOP + 12, (TZ0 + TZ1) / 2],
      quad: [cx, 1, (QZ0 + QZ1) / 2],
      camPos: [cx + 170, 160, D + 170],
      camLook: [cx, 40, D / 2],
    },
  };
}
