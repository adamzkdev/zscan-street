import * as THREE from "three";
import { BAY } from "../city/plan";
import { BX, CREEK, creekAt, F, fbm, goldAt, Land, shoreZ, SITES, trailDist, vnoise, WATER } from "./land";

/**
 * The forest floor as voxel columns a metre square, a quarter metre per step: redwood duff and
 * moss under the trees, sorrel and clover in the clearings, golden grass on the bluffs over the
 * bay, packed-earth trails, wet stone in the creek bed, grey rock on the cliffs. Only the faces
 * you can see are built; the board's edge shows the soil down to the bay's floor like the rest of
 * the diorama.
 */

const STEP = 1;
const Q = 0.25;

export function groundMesh(land: Land) {
  const nx = Math.round((F.x1 - F.x0) / STEP),
    nz = Math.round((F.z1 - F.z0) / STEP);
  const base = BAY.bed;
  const hs = new Float32Array(nx * nz).fill(NaN);
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= nz ? NaN : hs[i + j * nx]);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = F.x0 + (i + 0.5) * STEP,
        z = F.z0 + (j + 0.5) * STEP;
      if (z < shoreZ(x) - 4) continue;
      const h = land.raw(x, z);
      if (h < base + 0.2) continue;
      hs[i + j * nx] = Math.round(h / Q) * Q;
    }
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const quad = (p: number[][], n: number[], k: number) => {
    for (const v of [p[0], p[1], p[2], p[0], p[2], p[3]]) {
      pos.push(v[0], v[1], v[2]);
      nor.push(n[0], n[1], n[2]);
      col.push(c.r * k, c.g * k, c.b * k);
    }
  };
  const side = new THREE.Color();
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const h = at(i, j);
      if (Number.isNaN(h)) continue;
      const x0 = F.x0 + i * STEP,
        z0 = F.z0 + j * STEP,
        x1 = x0 + STEP,
        z1 = z0 + STEP;
      const cx = x0 + 0.5,
        cz = z0 + 0.5;
      paint(c, land, cx, cz, h, Math.max(...[at(i - 1, j), at(i + 1, j), at(i, j - 1), at(i, j + 1)].map((n) => (Number.isNaN(n) ? 0 : Math.abs(n - h)))));
      quad(
        [
          [x0, h, z1],
          [x1, h, z1],
          [x1, h, z0],
          [x0, h, z0],
        ],
        [0, 1, 0],
        1,
      );
      // the sides: earth under a lip of the top colour, rock on the cliffs
      const cliff = h - base > 1;
      side.copy(c);
      for (const [di, dj, n] of [
        [-1, 0, [-1, 0, 0]],
        [1, 0, [1, 0, 0]],
        [0, -1, [0, 0, -1]],
        [0, 1, [0, 0, 1]],
      ] as const) {
        const nh = at(i + di, j + dj);
        const edge = (i + di >= nx && x1 >= F.x1 - 0.01) || (j + dj >= nz && z1 >= F.z1 - 0.01);
        const lo = Number.isNaN(nh) ? base : nh;
        if (lo >= h) continue;
        const bottom = edge ? base - 0.4 : lo;
        const p =
          di === -1
            ? [
                [x0, bottom, z0],
                [x0, bottom, z1],
                [x0, h, z1],
                [x0, h, z0],
              ]
            : di === 1
              ? [
                  [x1, bottom, z1],
                  [x1, bottom, z0],
                  [x1, h, z0],
                  [x1, h, z1],
                ]
              : dj === -1
                ? [
                    [x1, bottom, z0],
                    [x0, bottom, z0],
                    [x0, h, z0],
                    [x1, h, z0],
                  ]
                : [
                    [x0, bottom, z1],
                    [x1, bottom, z1],
                    [x1, h, z1],
                    [x0, h, z1],
                  ];
        // the lip: top colour on the first quarter metre, then soil/rock below
        const lip = Math.max(bottom, h - Q);
        c.copy(side);
        const pl = p.map((v) => [v[0], v[1] === h ? h : lip, v[2]]);
        quad(pl, n as unknown as number[], 0.78);
        if (lip > bottom && edge) {
          // the board's edge: soil, then bands of sandstone and slate down to the bay's floor
          const BANDS = ["#4e3a2a", "#5e4836", "#7a6650", "#6a5a4c", "#867462", "#5c5258", "#6e6670"];
          let top = lip;
          while (top > bottom + 0.01) {
            const depth = h - top;
            const band = Math.min(BANDS.length - 1, Math.floor(depth / 1.1 + vnoise(x0 * 0.2 + z0 * 0.2, 1, 6) * 0.9));
            const lo = Math.max(bottom, top - 0.55);
            c.set(BANDS[band]);
            const k = 0.66 + vnoise(x0 * 0.9 + z0 * 0.9, top * 2, 8) * 0.12;
            const pb = p.map((v) => [v[0], v[1] === h ? top : lo, v[2]]);
            quad(pb, n as unknown as number[], k);
            top = lo;
          }
        } else if (lip > bottom) {
          const rocky = cliff && h - lo > 0.9;
          c.set(rocky ? (vnoise(x0 * 0.7 + z0 * 0.3, h * 0.8, 2) > 0.5 ? "#77737c" : "#68646e") : "#5a4636");
          const pb = p.map((v) => [v[0], v[1] === h ? lip : bottom, v[2]]);
          quad(pb, n as unknown as number[], 0.72);
        }
        c.copy(side);
      }
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/** The colour of the ground at (x, z). */
function paint(c: THREE.Color, land: Land, x: number, z: number, h: number, step: number) {
  const n = fbm(x * 0.12, z * 0.12, 9);
  const fine = vnoise(x * 0.9, z * 0.9, 2);
  // the road and the plaza
  if (Math.abs(x - BX) < 6.2 && z > 224.5 && z < 229.5) return c.set(Math.abs(x - BX) < 0.3 ? "#d8b030" : "#34323c");
  const pz = Math.hypot((x - SITES.plaza.x) / 6, (z - SITES.plaza.z) / 3.8);
  if (pz < 1) return c.set(fine > 0.5 ? "#a8a094" : "#9c9488");
  if (h < WATER + 0.5) return c.set(fine > 0.5 ? "#6a6470" : "#5e5a64");
  const cr = creekAt(x, z);
  if (cr.d < 1.3) return c.set(fine > 0.6 ? "#8a8478" : fine > 0.3 ? "#6e6a62" : "#5a5650");
  // the beach of round stones at the mouth
  if (Math.hypot(x - SITES.cove.x, z - SITES.cove.z) < 6 && h < WATER + 2.2) return c.set(fine > 0.5 ? "#b8ae9c" : "#a49a88");
  if (step > 0.9) return c.set(fine > 0.5 ? "#7a7680" : "#6c6872");
  const td = trailDist(x, z);
  if (td < 0.75) return c.set(fine > 0.55 ? "#a88a62" : fine > 0.25 ? "#9a7c56" : "#8e7250");
  if (td < 1.1) return c.set(fine > 0.5 ? "#7a6a3e" : "#6e6238");
  // the clearings: sorrel, clover, a little sun
  const camp = Math.hypot(x - SITES.camp.x, z - SITES.camp.z);
  if (camp < 2.8) return c.set(fine > 0.5 ? "#6a5a4a" : "#5e5042");
  if (camp < 6.5 || Math.hypot(x - SITES.cabin.x, z - SITES.cabin.z) < 7) return c.set(n > 0.55 ? "#5c8a3a" : fine > 0.5 ? "#4f7e34" : "#6a963e");
  // the bluffs over the bay: golden grass (the Marin headlands in autumn)
  const gold = goldAt(x, z);
  if (gold > 0.45 + (n - 0.5) * 0.6) return c.set(fine > 0.66 ? "#c8a85a" : fine > 0.33 ? "#b8984e" : "#a88a46");
  // under the redwoods: rust-coloured duff, moss, sorrel
  if (n > 0.62) return c.set(fine > 0.5 ? "#4a7a34" : "#3e6c2e");
  if (n > 0.5) return c.set(fine > 0.5 ? "#5a7a36" : "#4e6e30");
  return c.set(fine > 0.66 ? "#7a4e32" : fine > 0.33 ? "#6c452c" : "#5e3c28");
}

/** The water: the creek's ribbon, the plunge pool, the falls themselves. */
export function creekWater(land: Land, tex: THREE.Texture) {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  const C = CREEK;
  for (let i = 0; i < C.length; i++) pts.push(new THREE.Vector3(C[i][0], C[i][2] + 0.28, C[i][1]));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(pts.length - 1, i + 1)];
    const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    const nrm = new THREE.Vector3(-dir.z, 0, dir.x);
    const w = i === 0 ? 0.5 : i >= pts.length - 3 ? 2.6 : 1.1;
    if (i) along += pts[i].distanceTo(pts[i - 1]);
    for (const s of [-1, 1]) {
      pos.push(pts[i].x + nrm.x * w * s, pts[i].y, pts[i].z + nrm.z * w * s);
      uv.push(s * 0.5, along / 3);
    }
    if (i) {
      const k = i * 2;
      idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const water = new THREE.MeshStandardMaterial({ map: tex, color: "#7ab8d0", roughness: 0.15, metalness: 0.2, emissive: "#0a3040", emissiveIntensity: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const ribbon = new THREE.Mesh(geo, water);
  ribbon.renderOrder = 1;
  g.add(ribbon);
  // the plunge pool
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.1, 20), water);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(212.4, land.raw(212.4, 221.8) + 0.3, 221.8);
  g.add(pool);
  return g;
}
