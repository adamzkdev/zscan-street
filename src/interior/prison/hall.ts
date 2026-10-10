import * as THREE from "three";
import { castAt } from "./cast";
import { BARS_H, BLOCK_Z0, BLOCK_Z1, CELL_D, CELL_H, canvasTex, cellMatrix, cellNumber, cellRect, FACES, GALLERY, HALL, TIER, WALK, type Face, type PrisonKit } from "./kit";

/**
 * The cell house: A, B, C and D blocks, three tiers each, Broadway between B and C, Michigan
 * Avenue and Seedy Street outside them; every cell furnished and barred; steel walkways with
 * railings round each block, bridges over the aisles, stairs at the south end, the west gun
 * gallery across the end wall, skylights and trusses under the roof, high barred windows.
 */
export function cellHouse(k: PrisonKit) {
  const { b } = k;
  const R = k.root;

  // ---- the shell: floor, walls with high windows, the roof with its skylights ----
  b.box(k.floorMat, HALL.x1 - HALL.x0, 0.1, HALL.z1 - HALL.z0, 0, -0.1, (HALL.z0 + HALL.z1) / 2);
  const WIN_Y0 = 8.8,
    WIN_Y1 = 12.2;
  const winZ: number[] = [];
  for (let z = -38.5; z <= -3; z += 3.5) winZ.push(z);
  for (const side of [-1, 1]) {
    const x = side * (HALL.x1 + 0.2);
    b.box(k.paintWall, 0.4, WIN_Y0, -HALL.z0, x, 0, HALL.z0 / 2);
    b.box(k.paintLow, 0.42, 1.3, -HALL.z0, x, 0, HALL.z0 / 2);
    b.box(k.paintWall, 0.4, HALL.h - WIN_Y1, -HALL.z0, x, WIN_Y1, HALL.z0 / 2);
    let z = HALL.z0;
    for (const wz of winZ) {
      b.box(k.paintWall, 0.4, WIN_Y1 - WIN_Y0, wz - 0.9 - z, x, WIN_Y0, (z + wz - 0.9) / 2);
      z = wz + 0.9;
      // the window: a deep sill, small panes, bars outside
      b.box(k.paintWall, 0.6, 0.12, 1.9, x, WIN_Y0 - 0.06, wz);
      for (let q = -0.75; q <= 0.76; q += 0.3) k.flats.put(x + side * 0.12, (WIN_Y0 + WIN_Y1) / 2, wz + q, 0.04, WIN_Y1 - WIN_Y0, 0.03);
      for (let y = WIN_Y0 + 0.35; y < WIN_Y1; y += 0.42) k.flats.put(x + side * 0.12, y, wz, 0.04, 0.03, 1.8);
      for (let q = -0.8; q <= 0.81; q += 0.16) k.bars.bar(x + side * 0.18, WIN_Y0, wz + q, x + side * 0.18, WIN_Y1, wz + q, 1.1);
    }
    b.box(k.paintWall, 0.4, WIN_Y1 - WIN_Y0, HALL.z1 - z, x, WIN_Y0, (z + HALL.z1) / 2);
  }
  // south wall (the door to the street) and north wall (the dining hall door under the clock)
  b.box(k.paintWall, HALL.x1 - HALL.x0 + 0.8, HALL.h, 0.4, 0, 0, 0.2);
  b.box(k.paintLow, HALL.x1 - HALL.x0, 1.3, 0.42, 0, 0, 0.2);
  const doorMat = new THREE.MeshStandardMaterial({ color: "#4a4e48", roughness: 0.5, metalness: 0.6 });
  b.box(doorMat, 2.4, 2.6, 0.12, 0, 0, -0.02);
  b.box(k.darkSteel, 0.06, 2.6, 0.14, 0, 0, -0.03);
  for (const s of [-1, 1]) {
    b.box(k.darkSteel, 0.12, 2.7, 0.2, s * 1.26, 0, -0.04);
    for (let q = 0.25; q < 1.1; q += 0.14) k.bars.bar(s * q, 1.4, -0.1, s * q, 2.3, -0.1, 0.8);
  }
  b.box(k.darkSteel, 2.6, 0.12, 0.2, 0, 2.6, -0.04);
  const NZ = HALL.z0 - 0.15;
  // over Times Square, tall barred windows high in the north wall
  const NW_Y0 = 6.6,
    NW_Y1 = 11.6;
  for (const s of [-1, 1]) {
    b.box(k.paintWall, 14.5, NW_Y0, 0.3, s * 8.75, 0, NZ);
    b.box(k.paintWall, 14.5, HALL.h - NW_Y1, 0.3, s * 8.75, NW_Y1, NZ);
    const wins = [s * 5, s * 10.5];
    let x = s * 1.5;
    for (const wx of [...wins, s * 16]) {
      const a = Math.min(x, wx - s * 1.0),
        c = Math.max(x, wx - s * 1.0);
      if (wx === s * 16) b.box(k.paintWall, Math.abs(16 - Math.abs(x)), NW_Y1 - NW_Y0, 0.3, (x + wx) / 2, NW_Y0, NZ);
      else {
        b.box(k.paintWall, c - a, NW_Y1 - NW_Y0, 0.3, (a + c) / 2, NW_Y0, NZ);
        b.box(k.paintWall, 2.2, 0.12, 0.6, wx, NW_Y0 - 0.06, NZ);
        for (let q = -0.9; q <= 0.91; q += 0.3) k.flats.put(wx + q, (NW_Y0 + NW_Y1) / 2, NZ, 0.04, NW_Y1 - NW_Y0, 0.04);
        for (let y = NW_Y0 + 0.4; y < NW_Y1; y += 0.45) k.flats.put(wx, y, NZ, 2, 0.03, 0.04);
        for (let q = -0.95; q <= 0.96; q += 0.15) k.bars.bar(wx + q, NW_Y0, NZ - 0.1, wx + q, NW_Y1, NZ - 0.1, 1.1);
        x = wx + s * 1.0;
      }
    }
  }
  b.box(k.paintWall, 3, HALL.h - 3.2, 0.3, 0, 3.2, NZ);
  b.box(k.paintLow, 14.5, 1.3, 0.32, -8.75, 0, NZ);
  b.box(k.paintLow, 14.5, 1.3, 0.32, 8.75, 0, NZ);
  b.box(k.darkSteel, 3.3, 0.15, 0.36, 0, 3.15, NZ);
  for (const s of [-1, 1]) b.box(k.darkSteel, 0.15, 3.2, 0.36, s * 1.57, 0, NZ);

  // the roof: dark boards between trusses, three long skylights (Broadway, Michigan, Seedy)
  const SKY: [number, number][] = [
    [-2.4, 2.4],
    [-12.6, -9.6],
    [9.6, 12.6],
  ];
  const roof = new THREE.MeshStandardMaterial({ color: "#77746a", roughness: 0.95 });
  const xs = [HALL.x0, ...SKY.flat(), HALL.x1].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i += 2) b.box(roof, xs[i + 1] - xs[i], 0.3, -HALL.z0, (xs[i] + xs[i + 1]) / 2, HALL.h, HALL.z0 / 2);
  const SK_Z0 = -40,
    SK_Z1 = -3;
  for (const [a, c] of SKY) {
    b.box(roof, c - a, 0.3, SK_Z0 - HALL.z0, (a + c) / 2, HALL.h, (HALL.z0 + SK_Z0) / 2);
    b.box(roof, c - a, 0.3, HALL.z1 - SK_Z1, (a + c) / 2, HALL.h, (SK_Z1 + HALL.z1) / 2);
    // the lantern: short walls up to the glass, then the wired glass itself
    for (const x of [a, c]) b.box(k.paintWall, 0.15, 0.9, SK_Z1 - SK_Z0, x, HALL.h, (SK_Z0 + SK_Z1) / 2);
    for (const z of [SK_Z0, SK_Z1]) b.box(k.paintWall, c - a, 0.9, 0.15, (a + c) / 2, HALL.h, z);
    for (let z = SK_Z0; z <= SK_Z1; z += 1.25) b.box(k.darkSteel, c - a, 0.12, 0.08, (a + c) / 2, HALL.h + 0.8, z);
    for (let x = a + 0.75; x < c - 0.1; x += 0.75) b.box(k.darkSteel, 0.06, 0.1, SK_Z1 - SK_Z0, x, HALL.h + 0.8, (SK_Z0 + SK_Z1) / 2);
  }
  const skyTex = canvasTex(128, 128, (g) => {
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(60,70,80,0.35)";
    g.lineWidth = 1;
    for (let p = 0; p < 128; p += 16) {
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p + 16, 128);
      g.moveTo(p + 16, 0);
      g.lineTo(p, 128);
      g.stroke();
    }
  });
  skyTex.repeat.set(2, 20);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, color: new THREE.Color("#dfe9f2").multiplyScalar(1.6), toneMapped: false });
  for (const [a, c] of SKY) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(c - a, SK_Z1 - SK_Z0), skyMat);
    p.rotation.x = Math.PI / 2;
    p.position.set((a + c) / 2, HALL.h + 0.9, (SK_Z0 + SK_Z1) / 2);
    R.add(p);
  }
  // shafts of daylight falling from the skylights through the dust
  const shaftTex = canvasTex(
    64,
    256,
    (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, "rgba(255,250,235,0.55)");
      gr.addColorStop(1, "rgba(255,250,235,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 256);
    },
    false,
  );
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const shafts = new THREE.Group();
  for (const [a, c] of SKY)
    for (let z = SK_Z0 + 3; z < SK_Z1; z += 6.5) {
      const w = c - a;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, 10), shaftMat);
      s.position.set((a + c) / 2 + 0.6, HALL.h - 5, z);
      s.rotation.set(0, 0, 0.12);
      shafts.add(s);
      const s2 = s.clone();
      s2.rotation.set(0, Math.PI / 2, 0.12);
      s2.scale.x = 0.5;
      shafts.add(s2);
    }
  shafts.traverse((o) => (o.raycast = () => {}));
  R.add(shafts);
  k.sky = skyMat;
  k.shafts = shafts;
  // the trusses across the hall
  let web = 0;
  for (let z = -40; z <= -2; z += 4) {
    b.box(k.darkSteel, HALL.x1 - HALL.x0, 0.18, 0.2, 0, HALL.h - 1.2, z);
    b.box(k.darkSteel, HALL.x1 - HALL.x0, 0.14, 0.2, 0, HALL.h - 0.14, z);
    for (let x = HALL.x0 + 1; x < HALL.x1; x += 2) {
      b.box(k.darkSteel, 0.08, 1.05, 0.1, x, HALL.h - 1.05, z);
      const d = new THREE.BoxGeometry(0.06, 1.45, 0.08);
      d.rotateZ((web++ % 2 ? 1 : -1) * 0.75);
      d.translate(x + 1, HALL.h - 0.6, z);
      b.geo(k.darkSteel, d);
    }
  }
  // lamps hanging over the aisles: a long cord, an enamel shade, a hot bulb
  const shadeMat = new THREE.MeshStandardMaterial({ color: "#2f4a3c", roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });
  for (const x of [0, -11.1, 11.1])
    for (let z = -38; z <= -4; z += 4) {
      const y = x === 0 ? 9.2 : 9.6;
      b.box(k.darkSteel, 0.02, HALL.h - 1.2 - y, 0.02, x, y, z);
      b.geo(shadeMat, new THREE.ConeGeometry(0.34, 0.26, 12, 1, true).translate(x, y - 0.05, z));
      b.geo(k.bulb, new THREE.SphereGeometry(0.09, 8, 6).translate(x, y - 0.18, z));
    }

  // ---- the blocks ----
  const blockX: Record<string, [number, number]> = { A: [-16, -13], B: [-9.2, -3], C: [3, 9.2], D: [13, 16] };
  const blockZ: Record<string, [number, number]> = { A: [BLOCK_Z0, BLOCK_Z1], B: [BLOCK_Z0, BLOCK_Z1], C: [BLOCK_Z0, BLOCK_Z1], D: [-30, BLOCK_Z1] };
  const TOP = 3 * TIER - 0.25;
  for (const key of ["A", "B", "C", "D"]) {
    const [x0, x1] = blockX[key],
      [z0, z1] = blockZ[key];
    const cx = (x0 + x1) / 2,
      w = x1 - x0;
    // slabs between tiers, the roof of the block, the end walls with the block's letter
    for (let t = 1; t <= 3; t++) b.box(k.paintBlock, w, t === 3 ? 0.35 : 0.25, z1 - z0, cx, t * TIER - 0.25, (z0 + z1) / 2);
    for (const [z, s] of [[z0, -1], [z1, 1]] as const) {
      b.box(k.paintBlock, w, TOP, 0.3, cx, 0, z + s * 0.08);
      b.box(k.paintLow, w + 0.02, 1.2, 0.32, cx, 0, z + s * 0.08);
      if (key === "B" || key === "C") {
        const sign = k.label(`${key} BLOCK`, cx, TOP - 0.7, z + s * 0.24, { h: 0.7, color: "#2a2a26", font: '900 96px "JetBrains Mono", Menlo, monospace', rot: s > 0 ? 0 : Math.PI });
        sign.renderOrder = 1;
      }
    }
    // the utility corridor between back-to-back cells: pipes, behind a solid core
    if (key === "B") b.box(k.paintBlock, 0.8, TOP, z1 - z0, -6.1, 0, (z0 + z1) / 2);
    if (key === "C") b.box(k.paintBlock, 0.8, TOP, z1 - z0, 6.1, 0, (z0 + z1) / 2);
    // a parapet rail round the top of the block
    const yTop = TOP + 0.35;
    for (const z of [z0 + 0.1, z1 - 0.1]) k.flats.put(cx, yTop + 0.9, z, w, 0.05, 0.05);
    for (const x of [x0 + 0.1, x1 - 0.1]) k.flats.put(x, yTop + 0.9, (z0 + z1) / 2, 0.05, 0.05, z1 - z0);
    for (let z = z0 + 0.1; z <= z1; z += 1.6) for (const x of [x0 + 0.1, x1 - 0.1]) k.posts.put(x, yTop + 0.45, z, 1, 0.9);
  }

  FACES.forEach((f, fi) => face(k, f, fi));
  walkways(k);
  stairs(k);
  gunGallery(k);

  // aisle names on enamel plates under the south bridges, as the inmates named them
  for (const [t, x] of [
    ["BROADWAY", 0],
    ["MICHIGAN AVENUE", -11.1],
    ["SEEDY STREET", 11.1],
  ] as const)
    k.picture(t.length * 0.2 + 0.4, 0.4, (g, W, H) => {
      g.fillStyle = "#1e3a2a";
      g.fillRect(0, 0, W, H);
      g.strokeStyle = "#e8e4d4";
      g.lineWidth = 5;
      g.strokeRect(6, 6, W - 12, H - 12);
      g.fillStyle = "#e8e4d4";
      g.font = `800 ${Math.round(H * 0.56)}px "JetBrains Mono", monospace`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(t, W / 2, H / 2 + 3);
    }, x, TIER - 0.55, BLOCK_Z1 + WALK + 0.03);
}

/** One face of a block: every cell on three tiers, bars, the lock housing, the numbers. */
const holeDoor = new THREE.MeshStandardMaterial({ color: "#7c8478", roughness: 0.55, metalness: 0.5 });
function face(k: PrisonKit, f: Face, fi: number) {
  const { b } = k;
  const len = f.n * f.cw;
  const hw = f.cw / 2 - 0.07;
  const doorW = Math.min(0.74, hw * 2 - 0.5);
  const dX = hw - doorW;
  for (let t = 0; t < 3; t++) {
    const y = t * TIER;
    // the back of the cells and the partitions between them
    const back = new THREE.Matrix4().makeRotationY((f.dir * Math.PI) / 2).setPosition(f.front, y, f.z0 + len / 2);
    b.box(k.paintCell, len, CELL_H, 0.06, 0, 0, -CELL_D + 0.03, back);
    for (let i = 0; i <= f.n; i++) b.box(k.paintCell, 0.14, CELL_H, CELL_D, -len / 2 + i * f.cw, 0, -CELL_D / 2, back);
    // the lock housing over the doors, its number strip
    b.box(k.paintBlock, len, CELL_H - BARS_H, 0.24, 0, BARS_H, -0.02, back);
    const strip = k.picture(len, 0.2, (g, W, H) => {
      g.fillStyle = "#b8bead";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#24241f";
      g.font = `800 ${Math.round(H * 0.7)}px "JetBrains Mono", monospace`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      for (let i = 0; i < f.n; i++) {
        // the strip is seen from outside: left to right along the face
        const li = f.dir > 0 ? f.n - 1 - i : i;
        g.fillText(cellNumber(f, i, t), ((li + 0.5) / f.n) * W, H / 2 + 2);
      }
    }, 0, 0, 0, 0, { px: 2048 });
    strip.mesh.position.set(0, BARS_H + 0.17, 0.105).applyMatrix4(back);
    strip.mesh.rotation.y = (f.dir * Math.PI) / 2;
    k.pick(strip.mesh, "<b>Cells</b>", (hit) => {
      if (!hit) return null;
      const i = Math.max(0, Math.min(f.n - 1, Math.floor((hit.point.z - f.z0) / f.cw)));
      const c = castAt(fi, i, t);
      const n = cellNumber(f, i, t);
      if (c) return null;
      return { eyebrow: `${f.block} block · ${f.aisle}`, title: `Cell ${n}`, mono: true, tag: f.block === "D" && t === 0 && i >= 5 ? ["ISOLATION", "warn"] : ["LOCKED", "muted"], stats: [["Size", f.block === "D" ? "2.2 × 2.7 m" : "1.5 × 2.7 m"], ["Tier", `${t + 1}`]] };
    });
    k.hovers.set(strip.mesh, `<b>${f.block} block</b><span>tier ${t + 1} · ${f.aisle}</span>`);

    for (let i = 0; i < f.n; i++) {
      const m = cellMatrix(f, i, t);
      const c = castAt(fi, i, t);
      const hole = f.block === "D" && t === 0 && i >= 5;
      furnish(k, m, hw, i * 7 + t * 31 + fi * 101, c?.blanket, f.block === "A" && (i + t) % 3 === 0);
      if (hole) {
        // the Hole: a solid steel door with a slot, a barred outer gate open beside it
        b.box(holeDoor, hw * 2, BARS_H, 0.08, 0, 0, -0.08, m, 1);
        b.box(k.rust, 0.3, 0.06, 0.09, -0.1, 1.45, -0.08, m, 1);
        b.box(k.porcelain, 0.04, 0.12, 0.1, hw - 0.12, 1.0, -0.06, m, 1);
        continue;
      }
      // bars: the fixed section, then the sliding door (slid open behind the fixed bars if open)
      const open = !!c?.open;
      for (let x = -hw + 0.06; x < dX - 0.02; x += 0.11) k.bars.bar(x, 0, 0, x, BARS_H, 0, 1, m);
      const shift = open ? -doorW + 0.1 : 0,
        dz = open ? -0.07 : 0;
      for (let x = dX + 0.08; x < hw - 0.02; x += 0.11) k.bars.bar(x + shift, 0.03, dz, x + shift, BARS_H - 0.03, dz, 1, m);
      for (const yy of [0.05, 0.98, 1.92]) {
        k.flats.put((-hw + dX) / 2, yy, 0, dX + hw, 0.05, 0.035, m);
        k.flats.put(dX + doorW / 2 + shift, yy + 0.04, dz, doorW, 0.05, 0.035, m);
      }
      for (const xx of [dX, hw]) k.flats.put(xx + shift, BARS_H / 2, dz, 0.05, BARS_H, 0.04, m);
      if (open && t === 0) {
        k.open[0].push(cellRect(m, -hw + 0.02, -CELL_D + 0.08, hw - 0.02, -0.05), cellRect(m, dX, -0.2, hw, 0.25));
      }
    }
  }
}

/** Bunk, toilet and basin, fold-down table and seat, a shelf with belongings, the bulb. */
function furnish(k: PrisonKit, m: THREE.Matrix4, hw: number, seed: number, blanket?: string, storage = false) {
  const { b } = k;
  const r = (n: number) => ((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  const box = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => b.box(mat, w, h, d, x, y, z, m, 1);
  if (storage) {
    // A block was never modernised: storage, crates and paint cans
    for (let n = 0; n < 4; n++) box(n % 2 ? k.wood : k.darkWood, 0.5, 0.4 + r(n) * 0.3, 0.5, -hw + 0.35 + (n % 2) * 0.6, n > 1 ? 0.55 : 0, -2.3 + (n % 2) * 0.1);
    box(k.rust, 0.25, 0.3, 0.25, hw - 0.3, 0, -1.2);
    return;
  }
  const bx = -hw + 0.36;
  box(k.steel, 0.72, 0.05, 1.9, bx, 0.38, -1.6);
  for (const z of [-0.7, -2.5]) box(k.darkSteel, 0.04, 0.36, 0.04, bx + 0.3, 0.02, z);
  box(k.mattress, 0.68, 0.1, 1.86, bx, 0.43, -1.6);
  const bl = blanket ? new THREE.MeshStandardMaterial({ color: blanket, roughness: 0.95 }) : k.blankets[Math.floor(r(1) * 4)];
  box(bl, 0.7, 0.04, 1.2 + r(2) * 0.4, bx, 0.52, -0.66 - (1.2 + r(2) * 0.4) / 2);
  box(k.mattress, 0.48, 0.09, 0.3, bx, 0.53, -2.35);
  // toilet and basin in the back corner
  box(k.porcelain, 0.36, 0.42, 0.46, hw - 0.22, 0, -2.42);
  box(k.porcelain, 0.38, 0.16, 0.3, hw - 0.7, 0.72, -2.5);
  box(k.steel, 0.03, 0.1, 0.03, hw - 0.7, 0.88, -2.6);
  // fold-down table and seat on the side wall
  box(k.darkWood, 0.36, 0.035, 0.62, hw - 0.18, 0.76, -1.3);
  box(k.darkWood, 0.3, 0.035, 0.3, hw - 0.17, 0.44, -0.75);
  // the shelf: books, a cup, a folded towel
  box(k.darkWood, hw * 1.2, 0.03, 0.24, -hw * 0.3, 1.62, -2.56);
  for (let n = 0; n < 6; n++) if (r(n + 5) > 0.35) box(k.items[Math.floor(r(n + 9) * 6)], 0.05 + r(n) * 0.04, 0.16 + r(n + 3) * 0.08, 0.17, -hw * 0.85 + n * 0.11, 1.65, -2.56);
  if (r(20) > 0.5) box(k.porcelain, 0.07, 0.09, 0.07, hw * 0.2, 1.65, -2.55);
  // coat hooks, a towel
  box(k.items[4], 0.3, 0.4, 0.02, hw * 0.25, 1.15, -2.62);
  // the bulb
  box(k.bulb, 0.08, 0.1, 0.08, 0, CELL_H - 0.14, -1.9);
  box(k.darkSteel, 0.14, 0.04, 0.14, 0, CELL_H - 0.04, -1.9);
}

/** The catwalk from the second tier to the gun gallery: its x span (the flight is drawn by lift.ts). */
const CATWALK = [14.4, 15.4] as const;

/** Steel walkways on the upper tiers, wrapping each block; bridges over the aisles; railings. */
function walkways(k: PrisonKit) {
  const { b } = k;
  const rails: [number, number, number, number][] = [];
  const S = BLOCK_Z1,
    N = BLOCK_Z0;
  for (const t of [1, 2]) {
    const y = t * TIER;
    const deck = (x0: number, z0: number, x1: number, z1: number) => {
      b.box(k.deck, x1 - x0, 0.06, z1 - z0, (x0 + x1) / 2, y - 0.06, (z0 + z1) / 2, undefined, 1);
      b.box(k.darkSteel, x1 - x0, 0.12, 0.08, (x0 + x1) / 2, y - 0.18, x1 - x0 > z1 - z0 ? z0 + 0.04 : (z0 + z1) / 2);
      if (t === 1 || t === 2) k.open[t].push([x0, z0, x1, z1]);
    };
    for (const f of FACES) {
      const za = f.block === "D" ? -30 : N,
        zb = S;
      const xa = Math.min(f.front, f.front + f.dir * WALK),
        xb = Math.max(f.front, f.front + f.dir * WALK);
      deck(xa, za, xb, zb);
      // brackets under the cantilever
      for (let z = za; z <= zb; z += f.cw) b.box(k.steel, WALK - 0.1, 0.12, 0.05, (xa + xb) / 2 - f.dir * 0.05, y - 0.2, z);
      if (t === 1) rails.push([f.front + f.dir * WALK, za, f.front + f.dir * WALK, zb]);
    }
    // the south cross row (over every aisle) and the north one
    deck(HALL.x0 + 0.3, S, HALL.x1 - 0.3, S + WALK);
    deck(HALL.x0 + 0.3, N - WALK, 10.3, N);
    deck(11.9, -30 - WALK, HALL.x1 - 0.3, -30);
    // the landings at the stairs
    for (const s of [-1, 1]) {
      if (t === 1) deck(Math.min(s * 8.6, s * 9.4), S + WALK, Math.max(s * 8.6, s * 9.4), -5.3);
      else deck(Math.min(s * 2.6, s * 3.4), S + WALK, Math.max(s * 2.6, s * 3.4), -5.3);
    }
  }
  // railings: outer edges of the cross rows (gaps where the stairs land), the bridges' inner edges
  for (const t of [1, 2]) {
    const y = t * TIER;
    const gap = t === 1 ? 8.6 : 2.6,
      gap2 = t === 1 ? 9.4 : 3.4;
    const list: [number, number, number, number][] = [...rails];
    list.push([HALL.x0 + 0.3, S + WALK, -gap2, S + WALK], [-gap, S + WALK, gap, S + WALK]);
    // the second tier's opens where the catwalk to the gun gallery leaves it (liftplan: prison, x 14.4–15.4)
    if (t === 1) list.push([gap2, S + WALK, CATWALK[0], S + WALK], [CATWALK[1], S + WALK, HALL.x1 - 0.3, S + WALK]);
    else list.push([gap2, S + WALK, HALL.x1 - 0.3, S + WALK]);
    list.push([HALL.x0 + 0.3, N - WALK, 10.3, N - WALK], [10.3, N - WALK, 10.3, N], [11.9, -30 - WALK, HALL.x1 - 0.3, -30 - WALK], [11.9, -30 - WALK, 11.9, -30]);
    for (const [a, c] of [[-1.9, 1.9], [-11.9, -10.3], [10.3, 11.9]]) {
      list.push([a, S, c, S]);
      if (a < 10) list.push([a, N, c, N]);
    }
    // the landings' open sides
    const side = t === 1 ? gap2 : gap;
    list.push([-side, S + WALK, -side, -5.3], [side, S + WALK, side, -5.3], [-gap2, -5.3, -gap, -5.3], [gap, -5.3, gap2, -5.3]);
    for (const [x0, z0, x1, z1] of list) {
      const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (const h of [1.02, 0.55]) k.flats.put((x0 + x1) / 2, y + h, (z0 + z1) / 2, along ? len : 0.05, 0.05, along ? 0.05 : len);
      k.flats.put((x0 + x1) / 2, y + 0.05, (z0 + z1) / 2, along ? len : 0.015, 0.1, along ? 0.015 : len);
      const n = Math.max(1, Math.round(len / 1.2));
      for (let q = 0; q <= n; q++) k.posts.put(x0 + ((x1 - x0) * q) / n, y + 0.52, z0 + ((z1 - z0) * q) / n, 1, 1.04);
      // the rail blocks the walker too
      const r = 0.06;
      k.solid[t].push([Math.min(x0, x1) - r, Math.min(z0, z1) - r, Math.max(x0, x1) + r, Math.max(z0, z1) + r]);
    }
  }
  // the walls the walkways back onto don't need colliders: the open area ends there
  void b;
}

/**
 * Steel stairs at the south end of B and C blocks: ground to tier 2, tier 2 to tier 3, side by side
 * (a scissor pair, each in its own 0.8 m lane): grating treads on angles between channel stringers
 * cut level on the floor and plumb at the landings, a balustrade on every side with a drop, the
 * landings propped on a column.
 */
function stairs(k: PrisonKit) {
  const { b } = k;
  /** A flight from (xa, y0) up to (xb, y1) in the lane za..zb; `guard`: rail its low (za) and high (zb) sides up to that far (0..1). */
  const flight = (xa: number, xb: number, za: number, zb: number, y0: number, y1: number, guard: [number, number]) => {
    const n = Math.round((y1 - y0) / 0.2);
    const len = Math.abs(xb - xa),
      dy = y1 - y0,
      sg = Math.sign(xb - xa);
    const rise = dy / n,
      run = len / n,
      kk = dy / len;
    const X = (a: number) => xa + sg * a;
    // treads, each on a carrier angle, the stringers' webs inside the lane
    const za2 = za + 0.055,
      zb2 = zb - 0.055;
    for (let s = 0; s < n; s++) {
      const y = (s + 1) * rise;
      b.box(k.deck, run + 0.01, 0.04, zb2 - za2, X((s + 0.5) * run), y0 + y - 0.04, (za + zb) / 2, undefined, 1);
      b.box(k.darkSteel, run - 0.04, 0.04, zb2 - za2, X((s + 0.5) * run), y0 + y - 0.08, (za + zb) / 2);
    }
    // stringers: a profile along the climb, extruded across the lane's edge
    const t = rise + 0.03,
      d = 0.22;
    const prof = [[0, 0], [d / kk, 0], [len, dy - d], [len, dy], [len - t / kk, dy], [0, t]].map(([a, y]) => new THREE.Vector2(X(a), y0 + y));
    for (const z of [za + 0.005, zb - 0.055]) b.geo(k.darkSteel, new THREE.ExtrudeGeometry(new THREE.Shape(prof), { depth: 0.05, bevelEnabled: false }).translate(0, 0, z));
    // the balustrade: stanchions on the stringers' outer faces, a handrail 0.9 m over the nosings, a mid rail
    const top = (a: number) => y0 + Math.min(kk * a + t, dy);
    const rail = (a: number, h: number) => y0 + kk * a + rise + h;
    for (const [z, to] of [[za - 0.02, guard[0]], [zb + 0.02, guard[1]]] as const) {
      if (to <= 0) continue;
      const end = len * to - 0.05;
      const np = Math.max(1, Math.ceil(end / 1.1));
      for (let q = 0; q <= np; q++) {
        const a = 0.05 + ((end - 0.05) * q) / np;
        const y = top(a) - 0.15;
        k.posts.put(X(a), (y + rail(a, 0.92)) / 2, z, 1, rail(a, 0.92) - y);
      }
      k.bars.bar(X(0.02), rail(0.02, 0.92), z, X(end + 0.03), rail(end + 0.03, 0.92), z, 1.6);
      k.bars.bar(X(0.05), rail(0.05, 0.47), z, X(end), rail(end, 0.47), z, 1);
    }
  };
  const S = BLOCK_Z1 + WALK;
  for (const s of [-1, 1]) {
    // up from the floor beside the walkway's edge (its railing guards the last of it), then back up over it
    flight(s * 3.4, s * 8.6, S, -6.1, 0, TIER, [0.6, 1]);
    flight(s * 8.6, s * 3.4, -6.1, -5.3, TIER, 2 * TIER, [1, 1]);
    k.solid[0].push([Math.min(s * 3.2, s * 9.4), S, Math.max(s * 3.2, s * 9.4), -5.3]);
    // columns under the landings' outer corners
    for (const [x, y] of [[s * 9.34, TIER], [s * 2.66, 2 * TIER]]) {
      b.box(k.darkSteel, 0.12, y - 0.18, 0.12, x, 0, -5.36);
      b.box(k.darkSteel, 0.24, 0.02, 0.24, x, 0, -5.36);
      k.solid[0].push([x - 0.1, -5.46, x + 0.1, -5.26]);
    }
    // clicking a flight climbs it (or goes back down)
    k.hit(5.2, 2.4, 0.8, s * 6, 0, -6.5, "<b>Stairs</b><span>ground ↔ second tier</span>", () => ({ eyebrow: "Stairs", title: k.current === 0 ? "Second tier" : "Broadway", floor: k.current === 0 ? 1 : 0 }));
    k.hit(5.2, 2.4, 0.8, s * 6, TIER + 0.2, -5.7, "<b>Stairs</b><span>second ↔ third tier</span>", () => ({ eyebrow: "Stairs", title: k.current === 1 ? "Third tier" : "Second tier", floor: k.current === 1 ? 2 : 1 }));
  }
}

/** The west gun gallery: a two-level steel cage across the end wall, armed guards inside. */
function gunGallery(k: PrisonKit) {
  const { b } = k;
  const G = GALLERY;
  const w = G.x1 - G.x0,
    cx = (G.x0 + G.x1) / 2;
  b.box(k.darkSteel, w, 0.2, G.z1 - G.z0 + 0.1, cx, G.y - 0.2, (G.z0 + G.z1) / 2);
  b.box(k.deck, w, 0.02, G.z1 - G.z0, cx, G.y, (G.z0 + G.z1) / 2, undefined, 1);
  // the cage's front, with a gateway at its east end where the catwalk from the second tier comes in
  const g0 = CATWALK[0] - 0.06,
    g1 = CATWALK[1] + 0.06;
  b.box(k.darkSteel, w, 0.2, 0.06, cx, G.y - 0.2, G.z0);
  for (const [x0, x1] of [[G.x0, g0], [g1, G.x1]]) b.box(k.darkSteel, x1 - x0, 0.4, 0.06, (x0 + x1) / 2, G.y, G.z0);
  b.box(k.deck, w, 0.06, G.z1 - G.z0, cx, G.y + 2.4, (G.z0 + G.z1) / 2, undefined, 1);
  b.box(k.darkSteel, w, 0.08, G.z1 - G.z0, cx, G.y + 4.6, (G.z0 + G.z1) / 2);
  for (let x = G.x0; x <= G.x1 + 0.01; x += 0.13) {
    const gate = x > g0 - 0.02 && x < g1 + 0.02;
    k.bars.bar(x, gate ? G.y + 2.4 : G.y + 0.4, G.z0, x, G.y + 4.6, G.z0, 1.2);
  }
  for (const y of [G.y + 0.4, G.y + 1.4]) for (const [x0, x1] of [[G.x0, g0], [g1, G.x1]]) k.flats.put((x0 + x1) / 2, y, G.z0, x1 - x0, 0.06, 0.05);
  for (const y of [G.y + 2.4, G.y + 3.5, G.y + 4.6]) k.flats.put(cx, y, G.z0, w, 0.06, 0.05);
  for (let x = G.x0; x <= G.x1; x += 2.6) k.flats.put(x, G.y + 2.5, G.z0, 0.1, 4.2, 0.08);
  // the gateway's jambs and its threshold plate, flush with the catwalk's head
  for (const x of [g0, g1]) k.flats.put(x, G.y + 1.2, G.z0, 0.1, 2.4, 0.1);
  b.box(k.darkSteel, g1 - g0, 0.02, 0.2, (g0 + g1) / 2, G.y - 0.01, G.z0);
  k.label("GUN GALLERY", (g0 + g1) / 2, G.y + 2.62, G.z0 - 0.06, { h: 0.12, color: "#e8e4d4", rot: Math.PI });
  for (const x of [G.x0, G.x1]) b.box(k.darkSteel, 0.1, 4.8, G.z1 - G.z0, x, G.y - 0.2, (G.z0 + G.z1) / 2);
  // the brackets holding it to the wall
  for (let x = G.x0 + 1; x < G.x1; x += 3) b.box(k.darkSteel, 0.1, 0.6, G.z1 - G.z0, x, G.y - 0.8, (G.z0 + G.z1) / 2);
  k.label("WEST GUN GALLERY", 9, G.y + 0.12, G.z0 - 0.04, { h: 0.18, color: "#e8e4d4", rot: Math.PI });
  k.open[3].push([G.x0 + 0.15, G.z0 + 0.12, G.x1 - 0.15, G.z1 - 0.12]);
  // the door up: steel, at the east end of the cutoff
  b.box(k.darkSteel, 0.1, 2.3, 1.1, 15.75, 0, -3.2);
  b.box(k.porcelain, 0.11, 0.18, 0.5, 15.75, 1.6, -3.2);
  k.label("GUN GALLERY · GUARDS ONLY", 15.68, 2.45, -3.2, { h: 0.14, color: "#c0201a", rot: -Math.PI / 2 });
  k.hit(0.3, 2.3, 1.2, 15.7, 0, -3.2, "<b>Gun gallery</b><span>guards only</span>", () => ({ eyebrow: "West gun gallery", title: "Up to the gallery", floor: 3 }));
  k.hit(0.3, 2.3, 1.2, G.x1 - 0.1, G.y, -1.0, "<b>Way down</b><span>to Broadway</span>", () => ({ eyebrow: "West gun gallery", title: "Broadway", floor: 0 }));
  b.box(k.darkSteel, 0.06, 2.2, 1.2, G.x1 - 0.12, G.y, -1.0);
  // a rifle rack and a chair inside
  b.box(k.darkWood, 0.6, 1.4, 0.15, -6, G.y, -0.25);
  for (let q = 0; q < 3; q++) b.box(k.darkSteel, 0.04, 1.1, 0.04, -6.2 + q * 0.2, G.y + 0.2, -0.3);
  b.box(k.darkWood, 0.4, 0.45, 0.4, 5, G.y, -0.5);
  b.box(k.darkWood, 0.4, 0.5, 0.05, 5, G.y + 0.45, -0.3);
}
