import * as THREE from "three";
import type { Seat } from "./crowd";
import { HALL_Y, type Level, canvasTex, glow, ribTex, std, timberTex } from "./kit";

/**
 * The Concert Hall: stalls raked down to the stage in front of you, vineyard terraces stepping
 * along both sides, the choir seats behind the orchestra, the Grand Organ's pipe front on the back
 * wall, the white birch vault and the eighteen acrylic acoustic rings over the stage.
 */

export const Y = HALL_Y;
/** Rake of the stalls per row, rows from the promenade (z = 9) to the front aisle (z = −5). */
export const ROW = 0.22;
export const YF = Y - ROW * 14;
/** Stage top, its front edge and back. */
export const YS = YF + 1.0;
export const STAGE_Z0 = -19.5,
  STAGE_Z1 = -7;
const HX = 19.5,
  BACK = -28.5,
  REAR = 20.5;

export function buildHall(L: Level) {
  const g = L.group;
  const m = L.m;
  const timber = new THREE.MeshStandardMaterial({ map: timberTex(6), roughness: 0.7 });
  const timberFloor = new THREE.MeshStandardMaterial({ map: timberTex(10), roughness: 0.55, color: "#c89a6a" });
  const birch = std("#e6d6b4", 0.6);
  const dark = std("#1c1618", 0.8);
  const carpet = std("#4a1a2e", 0.95);
  const brass = std("#c9a24a", 0.35, 0.8);
  const seats: Seat[] = [];

  // ---- the shell of the room ---------------------------------------------------------------------
  const wallH = 22;
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.4, wallH, REAR - BACK), timber);
    w.position.set(sx * HX, YF - 2 + wallH / 2, (REAR + BACK) / 2);
    g.add(w);
  }
  {
    const b = new THREE.Mesh(new THREE.BoxGeometry(HX * 2, wallH + 11, 0.4), timber);
    b.position.set(0, YF - 2 + (wallH + 11) / 2, BACK);
    const r = b.clone();
    r.position.z = REAR;
    g.add(b, r);
  }
  // the vault: birch ribs fanning across, highest over the middle
  {
    const nx = 40,
      nz = 30;
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [];
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const u = i / nx,
          v = j / nz;
        const x = -HX + u * HX * 2;
        const z = BACK + v * (REAR - BACK);
        const k = Math.sqrt(Math.max(0, 1 - (x / HX) ** 2));
        const y = YF - 2 + wallH - 0.5 + k * 7 + (1 - v) * 2.5;
        pos.push(x, y, z);
        uv.push(u * 3, v);
      }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = ribTex(18);
    tex.wrapS = THREE.RepeatWrapping;
    const vault = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8, emissive: new THREE.Color("#4a3a28"), emissiveMap: tex }));
    vault.raycast = () => {};
    g.add(vault);
  }
  // timber fins up the side walls (the brush-box acoustic panelling)
  for (const sx of [-1, 1])
    for (let z = BACK + 1; z < REAR - 0.5; z += 1.6) m.box(timber, 0.18, wallH - 3, 0.12, sx * (HX - 0.25), YF + 1, z);

  // ---- floors: the promenade, the stalls' rake, the front aisle --------------------------------------
  m.box(carpet, 24, 0.2, 5.6, 0, Y - 0.2, 11.7);
  for (let i = 0; i < 14; i++) {
    const y = Y - ROW * (i + 1);
    const z0 = 9 - i - 1;
    m.box(timberFloor, 22.4, y - (YF - 2), 1, 0, YF - 2, z0 + 0.5);
    // the step's nosing
    m.box(brass, 22.4, 0.03, 0.05, 0, y - 0.03, z0 + 1);
    for (const sx of [-1, 1])
      for (let x = 1.25; x < 11; x += 0.56) seats.push({ x: sx * x, y, z: z0 + 0.45, rot: Math.PI });
  }
  // the aisle carpet down the middle, a ramp
  {
    const len = Math.hypot(14, ROW * 14);
    const a = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, len), carpet);
    a.position.set(0, (Y + YF) / 2 + 0.03, 2);
    a.rotation.x = -Math.atan2(ROW * 14, 14);
    g.add(a);
  }
  m.box(carpet, 22.6, 0.2, 2.2, 0, YF - 0.2, -6);
  // aisle handrails
  for (const sx of [-1, 1]) {
    const len = Math.hypot(14, ROW * 14);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), brass);
    r.position.set(sx * 0.85, (Y + YF) / 2 + 0.9, 2);
    r.rotation.x = -Math.atan2(ROW * 14, 14);
    g.add(r);
  }
  // low walls bounding the walkable part
  m.box(timber, 0.3, 1.1, 16, -11.35, YF, -1);
  m.box(timber, 0.3, 1.1, 16, 11.35, YF, -1);
  m.box(timber, 0.3, 1.1, 7, -11.35, Y, 11);
  m.box(timber, 0.3, 1.1, 7, 11.35, Y, 11);
  m.box(timber, 23, 1.05, 0.3, 0, Y, 14.45);
  m.box(brass, 23, 0.05, 0.36, 0, Y + 1.05, 14.45);
  L.rects.push([-11.6, -7.5, -11.1, 14.6], [11.1, -7.5, 11.6, 14.6], [-12, 14.3, 12, 14.8], [-11.2, -5, -0.85, 9], [0.85, -5, 11.2, 9], [-12, STAGE_Z0 - 1, 12, STAGE_Z1]);

  // ---- the stage ---------------------------------------------------------------------------------------
  m.box(dark, 22, YS - (YF - 2), 0.3, 0, YF - 2, STAGE_Z1 + 0.1);
  m.box(timberFloor, 22, 0.25, STAGE_Z1 - STAGE_Z0, 0, YS - 0.25, (STAGE_Z0 + STAGE_Z1) / 2);
  m.box(dark, 22, YS - 0.25 - (YF - 2), STAGE_Z1 - STAGE_Z0, 0, YF - 2, (STAGE_Z0 + STAGE_Z1) / 2);
  // risers for the back desks
  m.box(timberFloor, 16, 0.3, 3.2, 0, YS, -13.6);
  m.box(timberFloor, 18, 0.6, 3, 0, YS, -16.8);
  // the stage lip lights
  for (let x = -10.5; x <= 10.5; x += 1.5) m.box(glow("#ffd9a0", 1.6), 0.4, 0.05, 0.05, x, YS - 0.15, STAGE_Z1 + 0.27);

  // ---- choir seats behind the orchestra ---------------------------------------------------------------
  for (let j = 0; j < 5; j++) {
    const y = YS + 0.6 + j * 0.45,
      z = STAGE_Z0 - 0.6 - j * 0.95;
    m.box(timberFloor, 21, y - YS, 0.95, 0, YS, z);
    for (let x = -9.8; x <= 9.8; x += 0.56) seats.push({ x, y, z: z + 0.05, rot: 0 });
  }
  m.box(timber, 21, 0.9, 0.15, 0, YS + 0.6, STAGE_Z0 - 0.1);

  // ---- vineyard terraces along both sides -------------------------------------------------------------
  const blocks: [number, number, number][] = [
    [-17, -10.5, 2.2],
    [-10, -3.5, 1.2],
    [-3, 3.5, 0.4],
    [4, 10.5, 1.0],
    [11, 18, 1.8],
  ];
  for (const sx of [-1, 1])
    for (const [z0, z1, dy] of blocks) {
      const base = Y - 1.2 + dy;
      const zc = (z0 + z1) / 2;
      // its underside and front balustrade
      m.box(timber, 6.6, base - (YF - 2), z1 - z0, sx * 15.9, YF - 2, zc);
      m.box(birch, 0.2, 0.95, z1 - z0, sx * 12.55, base, zc);
      m.box(brass, 0.26, 0.05, z1 - z0, sx * 12.55, base + 0.95, zc);
      for (let r = 0; r < 4; r++) {
        const x = sx * (13.3 + r * 0.95);
        const y = base + r * 0.45;
        m.box(timberFloor, 0.95, 0.45 * r + 0.01, z1 - z0, x, base, zc);
        const fx = -sx * 0.92,
          fz = zc > -6 ? -0.4 : 0.15;
        for (let z = z0 + 0.4; z < z1 - 0.2; z += 0.58) seats.push({ x, y, z, rot: Math.atan2(fx, fz) });
      }
    }
  // ---- the rear terrace, behind the promenade ----------------------------------------------------------
  for (let r = 0; r < 5; r++) {
    const y = Y + 0.6 + r * 0.45,
      z = 15.4 + r * 0.95;
    m.box(timberFloor, 23, y - Y, 0.95, 0, Y, z);
    for (let x = -10.9; x <= 10.9; x += 0.56) seats.push({ x, y, z: z + 0.1, rot: Math.PI });
  }

  // ---- the Grand Organ ------------------------------------------------------------------------------------
  const organ = new THREE.Group();
  {
    const z = BACK + 0.6;
    const y0 = YS + 2.9;
    m.box(timber, 19, 11.5, 1.0, 0, y0, z);
    m.box(dark, 17, 0.3, 1.2, 0, y0 + 1.3, z + 0.1);
    // the console at its foot
    m.box(dark, 2.4, 1.1, 1.0, 0, YS + 2.65, BACK + 3.6);
    m.box(std("#efe8d8", 0.5), 2.2, 0.06, 0.5, 0, YS + 3.6, BACK + 3.5);
    // pipe towers: tallest in the middle of each, in five flats
    const pipe = new THREE.CylinderGeometry(0.09, 0.09, 1, 10).translate(0, 0.5, 0);
    const mouth = new THREE.BoxGeometry(0.1, 0.12, 0.02);
    const list: [number, number, number][] = [];
    const flats = [
      [-7.4, 9, 6.5],
      [-3.8, 11, 8],
      [0, 15, 9.6],
      [3.8, 11, 8],
      [7.4, 9, 6.5],
    ];
    for (const [cx, n, hmax] of flats)
      for (let i = 0; i < n; i++) {
        const t = (i - (n - 1) / 2) / ((n - 1) / 2);
        list.push([cx + t * (n * 0.11), hmax * (1 - 0.42 * t * t), z + 0.65]);
      }
    const ipipe = new THREE.InstancedMesh(pipe, std("#d8dce4", 0.2, 0.95), list.length);
    const imouth = new THREE.InstancedMesh(mouth, std("#c9a24a", 0.3, 0.8), list.length);
    const mt = new THREE.Matrix4();
    list.forEach(([x, h, zz], i) => {
      ipipe.setMatrixAt(i, mt.compose(new THREE.Vector3(x, y0 + 1.6, zz), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)));
      imouth.setMatrixAt(i, mt.makeTranslation(x, y0 + 2.1, zz + 0.09));
    });
    organ.add(ipipe, imouth);
    g.add(organ);
    L.pick(organ, "<b>Grand Organ</b><span>10,154 pipes</span>", () => ({
      eyebrow: "CONCERT HALL",
      title: "Grand Organ",
      stats: [
        ["Pipes", "10,154"],
        ["Stops", "127"],
        ["Built", "1969–1979"],
        ["Builder", "Ronald Sharp"],
      ],
    }));
  }

  // ---- the acoustic rings over the stage ------------------------------------------------------------------
  const ringMat = new THREE.MeshStandardMaterial({ color: "#e8f0f6", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55, emissive: new THREE.Color("#000000") });
  const rings = new THREE.Group();
  {
    const geo = new THREE.TorusGeometry(1.05, 0.26, 10, 28);
    geo.rotateX(Math.PI / 2);
    geo.scale(1, 0.45, 1);
    const cable = std("#8a8a90", 0.4, 0.8);
    let k = 0;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 6; j++) {
        const x = (j - 2.5) * 2.7 + (i % 2 ? 0.7 : -0.7);
        const z = -9.5 - i * 3.6;
        const y = YS + 8.2 + ((k * 7) % 5) * 0.35 + i * 0.4;
        const r = new THREE.Mesh(geo, ringMat);
        r.position.set(x, y, z);
        rings.add(r);
        m.box(cable, 0.02, 9, 0.02, x, y, z);
        k++;
      }
    g.add(rings);
    L.pick(rings, "<b>Acoustic rings</b><span>18 acrylic reflectors</span>", () => ({
      eyebrow: "CONCERT HALL",
      title: "Acoustic rings",
      stats: [
        ["Rings", "18"],
        ["Material", "Acrylic"],
        ["Hung", "1973 · renewed 2022"],
      ],
    }));
  }

  // ---- lights -----------------------------------------------------------------------------------------------
  const stage = new THREE.SpotLight("#ffe2b8", 900, 60, 0.62, 0.55, 1.4);
  stage.position.set(0, Y + 13, 4);
  stage.target.position.set(0, YS, -13);
  g.add(stage, stage.target);
  const stage2 = new THREE.SpotLight("#ffd28a", 300, 50, 0.5, 0.6, 1.4);
  stage2.position.set(0, YS + 10, -24);
  stage2.target.position.set(0, YS, -10);
  g.add(stage2, stage2.target);
  const house: THREE.PointLight[] = [];
  for (const [x, y, z] of [
    [-8, Y + 8, 4],
    [8, Y + 8, 4],
    [0, Y + 9, 15],
  ]) {
    const l = new THREE.PointLight("#ffcf9a", 60, 30, 1.4);
    l.position.set(x, y, z);
    g.add(l);
    house.push(l);
  }
  // downlights in the vault (glow only)
  for (let z = -24; z <= 18; z += 4)
    for (const x of [-14, -7, 7, 14]) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), glow("#ffe6c0", 2.2));
      d.rotation.x = Math.PI / 2;
      d.position.set(x, YF - 2 + wallH - 0.6 + Math.sqrt(1 - (x / HX) ** 2) * 7 + (1 - (z - BACK) / (REAR - BACK)) * 2.5 - 0.15, z);
      g.add(d);
    }

  // ---- the LED surtitle board hung over the stage --------------------------------------------------------
  const board = canvasTex(1024, 128, () => {});
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.125), new THREE.MeshBasicMaterial({ map: board.t, toneMapped: false }));
  screen.position.set(0, YS + 6.4, STAGE_Z0 + 1.2);
  g.add(screen);
  m.box(std("#8a8a90", 0.4, 0.8), 0.02, 5, 0.02, -4, YS + 7, STAGE_Z0 + 1.2);
  m.box(std("#8a8a90", 0.4, 0.8), 0.02, 5, 0.02, 4, YS + 7, STAGE_Z0 + 1.2);

  return { seats, rings, ringMat, organ, stage, stage2, house, screen, board };
}

/** Where the walker stands on the hall's floor: the aisle ramp down the stalls, the front aisle. */
export function hallGround(x: number, z: number): number | null {
  if (z < -5) return z > STAGE_Z1 ? YF : null;
  if (z <= 9 && Math.abs(x) < 1) return Y - (9 - z) * ROW;
  return null;
}
