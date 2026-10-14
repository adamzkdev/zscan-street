import * as THREE from "three";
import type { Collection } from "./data";
import { boxGeo, FACE, type MuseumKit } from "./kit";
import { damask, paintedCeiling, versailles } from "./look";
import { SERIF } from "./parts";
import { banquetTable, borne, chandelier, giltChair, guardChair, stanchions } from "./voxels";

/**
 * Floor 3, the Napoleon III apartments: the Grand Salon in crimson damask and gilt, a painted
 * ceiling, three crystal chandeliers, the round "borne" sofa, tall windows onto the city with
 * velvet drapes; through the double doors, the State Dining Room with its banquet set for thirty.
 * zkSNARKs in heavy gilt frames between the pilasters (ranks 79 on).
 */

const X = 11,
  H = 8.5,
  S1 = -26,
  D1 = -44;

export function apartments(k: MuseumKit, _data: Collection) {
  const f = 3;
  const g = k.groups[f];
  const dm = damask();
  const wallMat = new THREE.MeshStandardMaterial({ map: dm, roughness: 0.85 });
  const cream = new THREE.MeshStandardMaterial({ color: "#efe2c4", roughness: 0.6 });
  const pt = versailles("#6a4428");
  pt.repeat.set(X, -D1 / 2);
  k.plane(f, new THREE.MeshStandardMaterial({ map: pt, roughness: 0.35, envMapIntensity: 0.9 }), 2 * X, -D1, 0, 0, D1 / 2);

  // ---- walls: the west wall solid, the east wall with three tall windows per room ----------------
  k.wall(f, wallMat, -X, 0, X, 0, H, 0.4, 1);
  k.wall(f, wallMat, -X, D1, X, D1, H, 0.4, 1);
  k.wall(f, wallMat, -X, 0, -X, D1, H, 0.4, 1);
  // the partition between salon and dining room, with double doors in the middle
  k.wall(f, wallMat, -X, S1, -1.6, S1, H, 0.5, 1);
  k.wall(f, wallMat, 1.6, S1, X, S1, H, 0.5, 1);
  k.box(f, wallMat, 3.2, H - 4.2, 0.5, 0, 4.2, S1, { uv: 1 });
  for (const s of [-1, 1]) {
    k.geo(f, k.gold, boxGeo(0.3, 4.4, 0.7, s * 1.75, 0, S1));
  }
  k.geo(f, k.gold, boxGeo(4.2, 0.5, 0.7, 0, 4.2, S1));
  k.geo(f, k.gold, boxGeo(2.2, 0.9, 0.3, 0, 4.7, S1 + 0.2));
  // east wall with windows
  const wins: number[] = [-5, -13, -21, -31, -39];
  let z0 = 0;
  for (const wz of wins) {
    k.wall(f, wallMat, X, z0, X, wz + 1.2, H, 0.4, 1);
    k.box(f, wallMat, 0.4, 1.0, 2.4, X, 0, wz, { uv: 1 });
    k.box(f, wallMat, 0.4, H - 6.2, 2.4, X, 6.2, wz, { uv: 1 });
    k.solid(f, X - 0.2, wz - 1.2, X + 0.2, wz + 1.2);
    // glazing bars, the sill, the drapes and their gilt pelmet
    for (const dz of [-1.15, 0, 1.15]) k.geo(f, cream, boxGeo(0.1, 5.2, 0.08, X, 1.0, wz + dz));
    for (const y of [1.0, 2.7, 4.4, 6.1]) k.geo(f, cream, boxGeo(0.1, 0.08, 2.4, X, y, wz));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.2), k.glass);
    glass.position.set(X, 3.6, wz);
    glass.rotation.y = FACE.nx;
    glass.raycast = () => {};
    g.add(glass);
    for (const s of [-1, 1]) {
      k.geo(f, k.velvet, boxGeo(0.25, 6.6, 0.8, X - 0.35, 0, wz + s * 1.55));
      k.geo(f, k.gold, boxGeo(0.3, 0.12, 0.85, X - 0.35, 2.6, wz + s * 1.55));
    }
    k.geo(f, k.gold, boxGeo(0.4, 0.7, 4.0, X - 0.3, 6.6, wz));
    k.geo(f, k.velvet, boxGeo(0.3, 0.6, 3.8, X - 0.45, 6.1, wz));
    k.pool(f, X - 2.5, wz, 2.2, "#fff4e0", 0.012, 0.9);
    z0 = wz - 1.2;
  }
  k.wall(f, wallMat, X, z0, X, D1, H, 0.4, 1);

  // ---- mouldings: gilt pilasters, a deep cove cornice, dado ------------------------------------
  const runs: [number, number, number, number][] = [
    [-X + 0.2, 0, -X + 0.2, D1],
    [X - 0.2, 0, X - 0.2, D1],
    [-X, -0.2, X, -0.2],
    [-X, D1 + 0.2, X, D1 + 0.2],
    [-X, S1 + 0.25, -1.9, S1 + 0.25],
    [1.9, S1 + 0.25, X, S1 + 0.25],
    [-X, S1 - 0.25, -1.9, S1 - 0.25],
    [1.9, S1 - 0.25, X, S1 - 0.25],
  ];
  for (const [x0, z0r, x1, z1] of runs) {
    const ax = z0r === z1;
    const len = ax ? Math.abs(x1 - x0) : Math.abs(z1 - z0r);
    const cx = (x0 + x1) / 2,
      cz = (z0r + z1) / 2;
    k.geo(f, cream, boxGeo(ax ? len : 0.14, 0.95, ax ? 0.14 : len, cx, 0, cz));
    k.geo(f, k.gold, boxGeo(ax ? len : 0.18, 0.06, ax ? 0.18 : len, cx, 0.95, cz));
    k.geo(f, k.gold, boxGeo(ax ? len : 0.5, 0.3, ax ? 0.5 : len, cx, H - 0.3, cz));
    k.geo(f, cream, boxGeo(ax ? len : 0.8, 0.5, ax ? 0.8 : len, cx, H - 0.8, cz));
    k.geo(f, k.gold, boxGeo(ax ? len : 0.3, 0.1, ax ? 0.3 : len, cx, H - 0.95, cz));
  }
  for (const cz of [S1 + 0.25, S1 - 0.25]) {
    k.geo(f, k.gold, boxGeo(3.8, 0.3, 0.5, 0, H - 0.3, cz));
    k.geo(f, cream, boxGeo(3.8, 0.5, 0.8, 0, H - 0.8, cz));
    k.geo(f, k.gold, boxGeo(3.8, 0.1, 0.3, 0, H - 0.95, cz));
  }
  for (const s of [-1, 1])
    for (let z = -2; z > D1 + 1; z -= 4) {
      if (Math.abs(z - S1) < 1) continue;
      const x = s * (X - 0.25);
      if (s > 0 && wins.some((w) => Math.abs(w - z) < 2)) continue;
      k.geo(f, k.gold, boxGeo(0.12, H - 1.9, 0.5, x, 0.95, z));
      k.geo(f, k.gold, boxGeo(0.2, 0.45, 0.75, x, H - 1.4, z));
    }

  // ---- the painted ceilings -------------------------------------------------------------------
  const c1 = paintedCeiling(2 * X, -S1);
  k.plane(f, new THREE.MeshStandardMaterial({ map: c1, roughness: 0.8, emissive: "#2a2014", emissiveMap: c1 }), 2 * X, -S1, 0, H, S1 / 2, Math.PI / 2);
  const c2 = paintedCeiling(2 * X, S1 - D1, { sky: "#b8c8e8" });
  k.plane(f, new THREE.MeshStandardMaterial({ map: c2, roughness: 0.8, emissive: "#2a2014", emissiveMap: c2 }), 2 * X, S1 - D1, 0, H, (S1 + D1) / 2, Math.PI / 2);

  // ---- the Grand Salon: chandeliers, the borne, armchairs ---------------------------------------
  for (const z of [-6, -13, -20]) {
    k.vox(f, "chand13", () => chandelier(1.3, 1.3), 0, H - (16 + 26) / 12, z, 0, 0.5);
    k.pool(f, 0, z, 4, "#ffd890", 0.012, 0.9);
  }
  k.vox(f, "borne", borne, 0, 0, -13, 0, 0.5);
  k.solid(f, -1.5, -14.5, 1.5, -11.5);
  // armchair groups round little tables along the west wall
  for (const z of [-5, -20]) {
    for (const [dx, dz, yaw] of [
      [-0.9, 0, Math.PI / 2],
      [0.9, 0, -Math.PI / 2],
      [0, -0.9, 0],
    ] as const) {
      k.vox(f, "gchair2", giltChair, -X + 2.5 + dx, 0, z + dz, yaw, 0.5);
    }
    k.geo(f, k.gold, new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16).translate(-X + 2.5, 0.7, z));
    k.geo(f, k.gold, new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6).translate(-X + 2.5, 0.35, z));
    k.solid(f, -X + 1.4, z - 1.2, -X + 3.6, z + 0.6);
  }
  // a velvet rope keeps visitors off the carpet round the borne
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(6, 18), new THREE.MeshStandardMaterial({ color: "#7a1824", roughness: 0.95 }));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 0.005, -13);
  g.add(carpet);
  for (const s of [-1, 1]) k.geo(f, k.gold, boxGeo(0.08, 0.01, 18, s * 2.9, 0.006, -13));

  // ---- the State Dining Room ------------------------------------------------------------------
  const DZ = (S1 + D1) / 2;
  k.vox(f, "banquet", () => banquetTable(9), 0, 0, DZ, Math.PI / 2, 0.5);
  for (let i = 0; i < 9; i++) {
    const z = DZ - 4 + i;
    k.vox(f, "gchair2", giltChair, -1.05, 0, z, Math.PI / 2, 0.5);
    k.vox(f, "gchair2", giltChair, 1.05, 0, z, -Math.PI / 2, 0.5);
  }
  k.solid(f, -1.5, DZ - 4.7, 1.5, DZ + 4.7);
  for (const z of [DZ - 3.5, DZ + 3.5]) {
    k.vox(f, "chand10", () => chandelier(1.0, 1.0), 0, H - (12 + 26) / 12, z, 0, 0.5);
    k.pool(f, 0, z, 3.5, "#ffd890", 0.012, 0.9);
  }
  for (const s of [-1, 1]) {
    k.vox(f, "rope3", () => stanchions(3), s * 2.6, 0, DZ - 2, Math.PI / 2, 0.5);
    k.vox(f, "rope3", () => stanchions(3), s * 2.6, 0, DZ + 1.3, Math.PI / 2, 0.5);
    k.solid(f, s * 2.6 - 0.1, DZ - 3.7, s * 2.6 + 0.1, DZ + 3);
  }
  // sideboards with candelabra at the ends
  for (const z of [S1 - 0.9, D1 + 0.9]) {
    k.geo(f, k.oak, boxGeo(3.2, 0.95, 0.7, 0, 0, z));
    k.geo(f, k.gold, boxGeo(3.3, 0.06, 0.75, 0, 0.95, z));
    if (z < S1 - 2) k.solid(f, -1.7, z - 0.4, 1.7, z + 0.4);
  }

  // ---- the paintings: big gilt frames on the long walls -----------------------------------------
  let rank = 79;
  for (const z of [-3.9, -9.2, -16.8, -22.1]) k.hang(f, { x: -X + 0.2, y: 3.9, z, yaw: FACE.px, s: 2.2, rank: rank++ });
  for (const z of [-9, -17]) k.hang(f, { x: X - 0.2, y: 3.9, z, yaw: FACE.nx, s: 2.2, rank: rank++ });
  for (const x of [-6.5, 6.5]) k.hang(f, { x, y: 3.9, z: S1 + 0.27, yaw: FACE.pz, s: 2.4, rank: rank++ });
  for (const z of [-31, -39]) k.hang(f, { x: -X + 0.2, y: 3.9, z, yaw: FACE.px, s: 2.2, rank: rank++ });
  k.hang(f, { x: -5.5, y: 4.2, z: D1 + 0.2, yaw: FACE.pz, s: 2.4, rank: rank++ });
  k.hang(f, { x: 5.5, y: 4.2, z: D1 + 0.2, yaw: FACE.pz, s: 2.4, rank: rank++ });
  // over the lift: the salon's name
  const name = k.panel(f, 2048, 260, 8, (c, w, h) => {
    c.fillStyle = "#f4ead0";
    c.font = `italic 500 140px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Appartements Napoléon III", w / 2, h / 2);
  });
  name.position.set(0, 6.6, -0.22);
  name.rotation.y = FACE.nz;
  for (const s of [-1, 1]) {
    k.vox(f, "gchairG", guardChair, s * 4.6, 0, -1.2, Math.PI, 0.5);
  }

  // ---- lights: the chandeliers --------------------------------------------------------------------
  for (const z of [-6, -13, -20]) k.light(f, 0, H - 2.4, z, "#ffcf88", 40, 18);
  for (const z of [DZ - 3.5, DZ + 3.5]) k.light(f, 0, H - 2.4, z, "#ffcf88", 35, 16);
  k.light(f, 6, 4, -2, "#ffe6c0", 15, 12);
  for (let z = -2; z > D1; z -= 4) {
    k.wash(f, -X + 0.22, z, FACE.px, 3.2, 4, H - 1, "#ffd8a0");
  }

  // ---- people ---------------------------------------------------------------------------------
  let n = 0;
  const id = () => k.visitor(3000 + n++);
  void k.person(f, id(), [-4.6, -1.2], { guard: true, perch: 0.5, face: [-4.6, -6] });
  void k.person(f, id(), [-0.6, -10.6], { perch: 0.45, face: [0, -8] });
  void k.person(f, id(), [0.9, -15.3], { perch: 0.45, face: [2, -18] });
  for (const [x, z, fx, fz, ph] of [
    [-7.6, -3.9, -X, -3.9, false],
    [-8, -9.6, -X, -9.2, true],
    [-7.4, -16.4, -X, -16.8, false],
    [7.6, -9, X, -9, false],
    [8, -13.2, X, -13, false],
    [-6.5, -23, -6.5, S1, true],
    [4, -24, 6.5, S1, false],
    [3.6, -30, 0, -34, false],
    [-3.6, -36, 0, -34, true],
    [-7.6, -39, -X, -39, false],
    [6.8, -41.6, 5.5, D1, false],
  ] as const)
    void k.person(f, id(), [x, z], { face: [fx, fz], phone: ph });
  const strolls: [number, number][] = [
    [-5, -3],
    [5, -3],
    [-5, -24],
    [5, -24],
    [-4, -30],
    [4, -40],
  ];
  for (let i = 0; i < 3; i++) void k.person(f, id(), strolls[i * 2], { wander: strolls });
  void k.person(f, id(), [-8.6, -27.4], { guard: true, face: [0, -27.4] });

  k.finish(f);
  return { spawn: new THREE.Vector3(0, 0, -2.6), yaw: 0 };
}
