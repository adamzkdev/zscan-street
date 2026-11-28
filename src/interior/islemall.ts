import * as THREE from "three";
import { MartDecals } from "../scene/real/marts";
import type { Mall } from "../scene/real/martdata";
import { bench, indoorTree, kiosk, place } from "./furniture";
import { glowMat } from "./kit";
import { memoMat, Merger, standee, type DressEnv } from "./mart";

/**
 * A mall's inside, for the malls across the bridges and Zaiba's (src/interior/building.ts dresses it
 * when the door's name is a mall's, src/scene/real/martdata.ts): a tall atrium under a skylight, shop
 * fronts down both sides on two levels — each lit window and its sign — the upper level's gallery
 * with its glass balustrade, a bridge across, a pair of escalators climbing to it; the anchor store
 * at the far end, its name over its glazed entrance; benches between planters and trees, a couple of
 * kiosk carts, the mall's banners hanging in the void, shoppers walking about. Only the ground floor
 * is walked; the rest is set dressing. Cheap: the structure is merged per material, every shop front
 * and sign is one picture (a canvas per mall, kept) and one draw.
 */

/** The shop fronts' pictures: 4 × 4 cells of 256 px, a sign band over a lit window display. */
const fronts = new Map<string, THREE.CanvasTexture>();
function frontsOf(m: Mall) {
  let t = fronts.get(m.key);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d")!;
  let s = m.key.length * 997 + 13;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const inks = ["#ffffff", "#1a1a1e"];
  const grounds = ["#24262c", "#f6f2ea", m.accent, "#1f3d6a", "#7a1f2e", "#2f5a3a", "#e8d8b8", "#3a2a4a"];
  for (let i = 0; i < 16; i++) {
    const x = (i % 4) * 256,
      y = Math.floor(i / 4) * 256;
    const name = m.shops[i % m.shops.length];
    const gc = grounds[(i * 3) % grounds.length];
    // the sign band
    g.fillStyle = gc;
    g.fillRect(x, y, 256, 56);
    g.fillStyle = gc === "#f6f2ea" || gc === "#e8d8b8" ? inks[1] : inks[0];
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `800 34px "Helvetica Neue", Arial, sans-serif`;
    const w = g.measureText(name).width;
    if (w > 230) g.font = `800 ${Math.floor((34 * 230) / w)}px "Helvetica Neue", Arial, sans-serif`;
    g.fillText(name, x + 128, y + 30);
    // the window: a lit room, its goods (racks of clothes, shelves, mannequins), the glass's sheen
    const bg = g.createLinearGradient(0, y + 56, 0, y + 256);
    bg.addColorStop(0, "#fff8ea");
    bg.addColorStop(1, ["#e8d8c0", "#dfe8ee", "#f0e0e4", "#e4ecdc"][i % 4]);
    g.fillStyle = bg;
    g.fillRect(x, y + 56, 256, 200);
    const kind = i % 3;
    for (let k = 0; k < 6; k++) {
      const gx = x + 14 + k * 40;
      if (kind === 0) {
        // a rail of clothes
        g.fillStyle = "#8a8a90";
        g.fillRect(gx, y + 96, 34, 3);
        for (let j = 0; j < 5; j++) {
          g.fillStyle = ["#e8463a", "#3a4a7a", "#f2f0ea", "#2a2a30", "#c8a07a", "#7ab8a0"][Math.floor(R() * 6)];
          g.fillRect(gx + j * 7, y + 99, 6, 50 + R() * 30);
        }
      } else if (kind === 1) {
        // shelves of goods
        for (let j = 0; j < 4; j++) {
          g.fillStyle = "#c8c4bc";
          g.fillRect(gx, y + 100 + j * 34, 34, 3);
          for (let q = 0; q < 4; q++) {
            g.fillStyle = ["#e8463a", "#3fa8ff", "#f4b728", "#43d17a", "#b07bff", "#f2f0ea"][Math.floor(R() * 6)];
            g.fillRect(gx + q * 8, y + 84 + j * 34, 6, 16);
          }
        }
      } else if (k % 2 === 0) {
        // mannequins
        g.fillStyle = "#e8e2d8";
        g.beginPath();
        g.arc(gx + 17, y + 98, 9, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = ["#2a2a30", "#e8463a", "#3a4a7a", "#c8a07a"][Math.floor(R() * 4)];
        g.fillRect(gx + 6, y + 108, 22, 70);
      }
    }
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.beginPath();
    g.moveTo(x, y + 256);
    g.lineTo(x + 90, y + 56);
    g.lineTo(x + 140, y + 56);
    g.lineTo(x + 50, y + 256);
    g.fill();
    g.fillStyle = "rgba(20,20,24,0.9)";
    g.fillRect(x, y + 56, 256, 4);
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.shared = true;
  fronts.set(m.key, t);
  return t;
}

export function dressMall(env: DressEnv, m: Mall, seed: number) {
  const { shell, fit, own, solid, W, D, H } = env;
  const mat = memoMat(env);
  const M = new Merger();
  const wall = mat(m.wall, 0.8);
  const white = mat("#f6f4f0", 0.5);
  const accent = mat(m.accent, 0.45, 0.2);
  const steel = mat("#b8bcc2", 0.3, 0.8);
  const GL = 5.5; // the upper level's floor
  const GD = 3.2; // the gallery's depth
  // ---- the shop fronts, both sides, both levels: one picture per front, merged into one mesh ----
  const ft = frontsOf(m);
  const pos: number[] = [],
    uv: number[] = [],
    nor: number[] = [],
    idx: number[] = [];
  const quad = (cell: number, side: number, z0: number, z1: number, y0: number, y1: number) => {
    // (in front of the room's wall: its inner face is 0.1 m in from W)
    const x = side * (W - 0.14);
    const cu = (cell % 4) / 4,
      cv = 1 - Math.floor(cell / 4) / 4;
    const i0 = pos.length / 3;
    // (seen from the atrium: the left-hand edge is +z on the left wall, −z on the right one)
    const [za, zb] = side < 0 ? [z1, z0] : [z0, z1];
    pos.push(x, y0, za, x, y0, zb, x, y1, zb, x, y1, za);
    for (let k = 0; k < 4; k++) nor.push(-side, 0, 0);
    uv.push(cu, cv - 0.25, cu + 0.25, cv - 0.25, cu + 0.25, cv, cu, cv);
    idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  };
  let cell = seed % 16;
  for (const side of [-1, 1])
    for (let z = -3; z > -D + 7; z -= 6.2) {
      quad(cell++ % 16, side, z - 5.8, z - 0.4, 0, 4.4);
      quad((cell + 5) % 16, side, z - 5.8, z - 0.4, GL + 0.2, GL + 4.2);
      // the pilasters between the fronts, both levels
      M.box(wall, 0.5, H, 0.45, side * (W - 0.25), 0, z - 0.2);
    }
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const fm = new THREE.MeshStandardMaterial({ map: ft, emissiveMap: ft, emissive: "#ffffff", emissiveIntensity: 0.75, roughness: 0.25, side: THREE.DoubleSide });
    own.push(g, fm);
    const mesh = new THREE.Mesh(g, fm);
    mesh.name = "mall-fronts-wall";
    mesh.userData.noBreak = true;
    shell.add(mesh);
  }
  // ---- the galleries along both sides on the upper level, their glass balustrades, the bridge ----
  const glass = new THREE.MeshPhysicalMaterial({ color: "#e8f4f6", roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  own.push(glass);
  const under = glowMat("#fff4e0", 0.8);
  own.push(under);
  for (const side of [-1, 1]) {
    const x = side * (W - GD / 2);
    M.box(white, GD, 0.6, D - 6, x, GL - 0.6, -D / 2 - 2);
    M.box(accent, 0.06, 0.08, D - 6, side * (W - GD) - side * 0.02, GL + 1.08, -D / 2 - 2);
    const bal = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.05, D - 6), glass);
    bal.position.set(side * (W - GD), GL + 0.53, -D / 2 - 2);
    bal.name = "wall-balustrade";
    own.push(bal.geometry);
    shell.add(bal);
    // the gallery's underside lit
    M.box(under, GD - 0.4, 0.02, D - 7, x, GL - 0.62, -D / 2 - 2);
  }
  const bz = -31;
  M.box(white, 2 * (W - GD), 0.6, 3.2, 0, GL - 0.6, bz);
  for (const s of [-1, 1]) {
    const bal = new THREE.Mesh(new THREE.BoxGeometry(2 * (W - GD), 1.05, 0.03), glass);
    bal.position.set(0, GL + 0.53, bz + s * 1.6);
    bal.name = "wall-bridge";
    own.push(bal.geometry);
    shell.add(bal);
  }
  // ---- the escalators: a pair climbing to the bridge, their glass sides and black handrails ----
  {
    const run = 9.5,
      zTop = bz + 1.6,
      zBot = zTop + run;
    const step = mat("#3a3c40", 0.5, 0.6);
    for (const x of [-1.05, 1.05]) {
      const len = Math.hypot(run, GL);
      const ang = Math.atan2(GL, run);
      const truss = new THREE.BoxGeometry(1.15, 0.5, len).rotateX(ang).translate(x, GL / 2 - 0.1, (zTop + zBot) / 2);
      M.geo(steel, truss);
      for (let k = 0; k < 24; k++) {
        const t = k / 24;
        M.box(step, 1.0, 0.05, 0.36, x, t * GL + 0.05, zBot - t * run);
      }
      for (const s of [-0.6, 0.6]) {
        const side = new THREE.BoxGeometry(0.03, 0.95, len).rotateX(ang).translate(x + s, GL / 2 + 0.55, (zTop + zBot) / 2);
        const sm = new THREE.Mesh(side, glass);
        sm.name = "escalator-side";
        own.push(side);
        shell.add(sm);
        M.geo(mat("#16161a", 0.4), new THREE.BoxGeometry(0.08, 0.08, len).rotateX(ang).translate(x + s, GL / 2 + 1.05, (zTop + zBot) / 2));
      }
    }
    solid(-1.9, zTop, 1.9, zBot + 0.6);
    // the bridge's two columns
    for (const x of [-W + GD + 0.6, W - GD - 0.6]) {
      M.box(white, 0.6, GL - 0.6, 0.6, x, 0, bz);
      solid(x - 0.35, bz - 0.35, x + 0.35, bz + 0.35);
    }
  }
  // ---- the skylight: the roof's beams over a lit band of sky, the ceiling's light ----
  const sky = glowMat("#e8f2ff", 1.15);
  own.push(sky);
  M.box(sky, 2 * (W - GD) - 1, 0.04, D - 4, 0, H - 0.1, -D / 2);
  for (let z = -2; z > -D + 1; z -= 3) M.box(white, 2 * (W - GD), 0.35, 0.3, 0, H - 0.45, z);
  M.box(white, 0.4, 0.5, D, -(W - GD) + 0.2, H - 0.5, -D / 2);
  M.box(white, 0.4, 0.5, D, W - GD - 0.2, H - 0.5, -D / 2);
  // ---- the far end: the anchor store's front, its name, its lit entrance; the second anchor over it ----
  const A = new MartDecals();
  A.facing(`anchor:${m.key}:0`, 0, 4.9, -D + 0.16, [0, 0, 1], 9, 9 / 8);
  A.facing(`anchor:${m.key}:1`, 0, GL + 4.6, -D + 0.16, [0, 0, 1], 8, 1);
  A.facing("mallin", 0, 2.1, -D + 0.14, [0, 0, 1], 8, 4);
  // the mall's name over the way in, its banners hanging in the void
  A.facing(`mall:${m.key}`, 0, H - 2.6, -0.14, [0, 0, -1], 12, 1.5);
  for (const z of [-11, -22, -37])
    for (const s of [-1, 1]) {
      A.facing(`banner:${m.key}`, s * 3.2, H - 3.2, z, [0, 0, 1], 1.4, 5.6);
      A.facing(`banner:${m.key}`, s * 3.2, H - 3.2, z - 0.02, [0, 0, -1], 1.4, 5.6);
    }
  const dm = A.mesh("mall-signs");
  if (dm) {
    dm.userData.noBreak = true;
    shell.add(dm);
  }
  M.box(accent, 9.4, 0.3, 0.3, 0, 4.1, -D + 0.25);
  // ---- down the middle: planters with trees, benches between them, two kiosk carts ----
  const stone = mat("#d4cec4", 0.6);
  const wood = mat("#9a7048", 0.7);
  const leg = mat("#2a2c30", 0.4, 0.7);
  for (const z of [-8, -38]) {
    for (const x of [-3.5, 3.5]) {
      M.box(stone, 2.2, 0.55, 2.2, x, 0, z);
      M.box(mat("#3a2a1e", 0.95), 2.0, 0.02, 2.0, x, 0.55, z);
      place(fit, `mall-tree-${(x > 0 ? 1 : 0) + (z < -20 ? 2 : 0)}`, () => indoorTree((x > 0 ? 1 : 0) + (z < -20 ? 2 : 0)), x, 0.55, z, 0);
      solid(x - 1.15, z - 1.15, x + 1.15, z + 1.15);
    }
    for (const x of [-6.2, 6.2]) {
      // a bench: slats on two legs
      for (let k = 0; k < 4; k++) M.box(wood, 0.1, 0.04, 1.8, x - 0.2 + k * 0.13, 0.44, z);
      for (const dz of [-0.75, 0.75]) M.box(leg, 0.5, 0.44, 0.08, x, 0, z + dz);
      solid(x - 0.35, z - 0.95, x + 0.35, z + 0.95);
    }
  }
  for (const [x, z] of [
    [-4.5, -14],
    [4.5, -24],
  ]) {
    place(fit, "mall-kiosk", kiosk, x, 0, z, x < 0 ? Math.PI / 2 : -Math.PI / 2);
    solid(x - 1.1, z - 1.1, x + 1.1, z + 1.1);
  }
  void bench;
  M.flush(shell, "wall-mall", own);
  // ---- the shoppers ----
  const paths: [number, number][] = [
    [-6, -4],
    [6, -6],
    [-7, -16],
    [7, -18],
    [-6.5, -28],
    [6.5, -34],
    [0, -40],
    [0, -12],
  ];
  for (let k = 0; k < 6; k++) {
    const [x, z] = paths[(k * 3 + seed) % paths.length];
    void standee(env, 5200 + ((seed * 7 + k * 131) % 4000), x, z, new THREE.Vector3(k % 2 ? 1 : -1, 0, 0), paths);
  }
}
