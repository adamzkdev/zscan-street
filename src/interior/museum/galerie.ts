import * as THREE from "three";
import type { Collection } from "./data";
import { boxGeo, FACE, type MuseumKit } from "./kit";
import { marble, skylight, vaultCoffers, versailles } from "./look";
import { column, lifts, SERIF } from "./parts";
import { banquette, bust, guardChair } from "./voxels";

/**
 * Floor 1, the Grande Galerie: a gallery 13 m wide and over 110 m long under a coffered barrel
 * vault with a skylight down its crown, divided into seven bays by pairs of red marble columns
 * carrying gilt arches. Oxblood walls over an oak dado, Versailles parquet, velvet banquettes. The
 * collection's seventy rarest hang here, rank 1 nearest the door, five paintings a wall per bay.
 */

const W = 6.5,
  HW = 7.5,
  BAY = 15,
  NB = 7,
  Z0 = -4,
  L = -Z0 + NB * BAY + 3;

export function galerie(k: MuseumKit, _data: Collection) {
  const f = 1;
  const g = k.groups[f];
  const wallMat = new THREE.MeshStandardMaterial({ color: "#8a3426", roughness: 0.92 });
  const cream = new THREE.MeshStandardMaterial({ color: "#e6d8b8", roughness: 0.7 });
  const oak = new THREE.MeshStandardMaterial({ color: "#5a3820", roughness: 0.55 });
  const rouge = new THREE.MeshStandardMaterial({ map: marble("#8a2a24", "#e8c8b0"), roughness: 0.18, metalness: 0.05, envMapIntensity: 1.2 });

  // ---- floor, walls, dado, cornice --------------------------------------------------------------
  const pt = versailles();
  pt.repeat.set(W, L / 2);
  k.plane(f, new THREE.MeshStandardMaterial({ map: pt, roughness: 0.38, envMapIntensity: 0.8 }), 2 * W, L, 0, 0, -L / 2);
  k.wall(f, wallMat, -W, 0, -W, -L, HW, 0.4);
  k.wall(f, wallMat, W, 0, W, -L, HW, 0.4);
  k.wall(f, cream, -W, 0, W, 0, HW + W, 0.4);
  k.wall(f, cream, -W, -L, W, -L, HW + W, 0.4);
  for (const s of [-1, 1]) {
    const x = s * (W - 0.2);
    // oak dado with a moulded rail, a black marble skirting
    k.geo(f, oak, boxGeo(0.12, 1.0, L, x - s * 0.06, 0, -L / 2));
    k.geo(f, k.gold, boxGeo(0.16, 0.05, L, x - s * 0.08, 1.0, -L / 2));
    k.geo(f, k.black, boxGeo(0.16, 0.18, L, x - s * 0.08, 0, -L / 2));
    // the entablature: architrave, a cream frieze with gilt dentils, the cornice
    k.geo(f, cream, boxGeo(0.3, 0.7, L, x - s * 0.15, HW - 0.7, -L / 2));
    k.geo(f, k.gold, boxGeo(0.36, 0.08, L, x - s * 0.18, HW - 0.75, -L / 2));
    k.geo(f, k.gold, boxGeo(0.5, 0.12, L, x - s * 0.25, HW - 0.1, -L / 2));
    for (let z = -0.4; z > -L; z -= 0.5) k.geo(f, k.gold, boxGeo(0.06, 0.12, 0.2, x - s * 0.33, HW - 0.3, z));
  }

  // ---- the barrel vault, its skylight, the arches -------------------------------------------------
  const R = W,
    gap = Math.asin(2 / R);
  const vt = vaultCoffers();
  const arc = (Math.PI / 2 - gap) * R;
  vt.repeat.set(arc / 1.4, L / 1.4);
  const vmat = new THREE.MeshStandardMaterial({ map: vt, roughness: 0.8, side: THREE.DoubleSide });
  for (const [a0] of [[Math.PI / 2], [Math.PI + gap]]) {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 28, 1, true, a0, Math.PI / 2 - gap), vmat);
    v.rotation.x = Math.PI / 2;
    v.position.set(0, HW, -L / 2);
    g.add(v);
  }
  const st = skylight();
  st.repeat.set(2, L / 2);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(4, L), k.lit("#f4f8ff", 1.15, "sky", st));
  sky.rotation.x = Math.PI / 2;
  sky.position.set(0, HW + R * Math.cos(gap) + 0.15, -L / 2);
  g.add(sky);
  // gilt ribs along the skylight's edges
  for (const s of [-1, 1]) k.geo(f, k.gold, boxGeo(0.14, 0.14, L, s * 2, HW + R * Math.cos(gap) - 0.05, -L / 2));
  // bays: paired columns at each division, a gilt arch across the vault
  for (let b = 0; b <= NB; b++) {
    const z = Z0 - b * BAY;
    for (const s of [-1, 1])
      for (const dz of [-0.85, 0.85]) column(k, f, s * (W - 0.7), z + dz, HW - 0.75, rouge, 0.32, k.gold, k.white);
    for (const s of [-1, 1]) k.geo(f, cream, boxGeo(1.4, 0.75, 2.6, s * (W - 0.7), HW - 0.75, z));
    const rib = new THREE.TorusGeometry(R - 0.3, 0.32, 8, 40, Math.PI).translate(0, HW, z);
    k.geo(f, cream, rib);
    k.geo(f, k.gold, new THREE.TorusGeometry(R - 0.62, 0.06, 6, 40, Math.PI).translate(0, HW, z + 0.3));
    k.geo(f, k.gold, new THREE.TorusGeometry(R - 0.62, 0.06, 6, 40, Math.PI).translate(0, HW, z - 0.3));
  }

  // ---- the paintings: five a wall per bay, rarest first ----------------------------------------
  let rank = 1;
  for (let b = 0; b < NB; b++) {
    const zc = Z0 - b * BAY - BAY / 2;
    for (const s of [-1, 1]) {
      const x = s * (W - 0.2);
      const yaw = s < 0 ? FACE.px : FACE.nx;
      // along the wall, "right" for a picture on the west wall is −z… keep the big one central
      const dirZ = s < 0 ? -1 : 1;
      k.hang(f, { x, y: 3.5, z: zc, yaw, s: 2.5, rank: rank++ });
      for (const d of [-1, 1]) k.hang(f, { x, y: 2.75, z: zc + d * dirZ * 4.2, yaw, s: 1.55, rank: rank++, tone: 1, label: "below" });
      for (const d of [-1, 1]) k.hang(f, { x, y: 5.35, z: zc + d * dirZ * 4.2, yaw, s: 1.0, rank: rank++, tone: 1, label: "none" });
      // picture lights: washes on the wall, pools on the floor
      k.wash(f, x - s * 0.02, zc, yaw, 5, 5.5, HW - 0.8, "#ffe8c8");
      for (const d of [-1, 1]) k.wash(f, x - s * 0.02, zc + d * 4.2, yaw, 3, 5, HW - 0.8, "#ffe8c8");
      k.pool(f, x - s * 1.6, zc, 2.6, "#ffe2b8", 0.012, 0.8);
    }
    // a banquette in the middle of every bay
    k.vox(f, "banq", () => banquette(2.4), 0, 0, zc, Math.PI / 2, 0.5);
    k.solid(f, -0.35, zc - 1.2, 0.35, zc + 1.2);
    k.pool(f, 0, zc, 3, "#fff0d8", 0.012, 0.6);
  }

  // ---- the vestibule: lifts, the gallery's name; the end: the bright door of the Pavillon --------
  lifts(k, f, 0, -0.22, FACE.nz, 2.3);
  const title = k.panel(f, 2048, 300, 9, (c, w, h) => {
    c.fillStyle = "#e6d8b8";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#6a1c1c";
    c.font = `500 150px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("G R A N D E   G A L E R I E", w / 2, h / 2 - 10);
    c.fillStyle = "#b8862a";
    c.fillRect(w * 0.2, h - 40, w * 0.6, 6);
  });
  title.position.set(0, HW + 1.6, -0.22);
  title.rotation.y = FACE.nz;
  const end = new THREE.Mesh(new THREE.PlaneGeometry(4, 5.5), k.lit("#fff3dc", 1.4));
  end.position.set(0, 2.75, -L + 0.22);
  g.add(end);
  const endArch = new THREE.Mesh(new THREE.CircleGeometry(2, 24, 0, Math.PI), end.material);
  endArch.position.set(0, 5.5, -L + 0.22);
  g.add(endArch);
  k.geo(f, k.gold, new THREE.TorusGeometry(2.1, 0.12, 6, 24, Math.PI).translate(0, 5.5, -L + 0.3));
  for (const s of [-1, 1]) k.geo(f, k.gold, boxGeo(0.24, 5.5, 0.2, s * 2.1, 0, -L + 0.3));
  k.pool(f, 0, -L + 3, 4, "#fff4e0", 0.012, 1);
  // busts in the vestibule and before the far door
  for (const [x, z, seed] of [
    [-4.6, -2.4, 7],
    [4.6, -2.4, 8],
    [-3, -L + 2, 9],
    [3, -L + 2, 10],
  ] as const) {
    k.vox(f, `bust${seed}`, () => bust(seed), x, 0, z, z > -10 ? Math.PI : 0, 0.5);
    k.solid(f, x - 0.4, z - 0.4, x + 0.4, z + 0.4);
  }

  // ---- lights -------------------------------------------------------------------------------
  for (let i = 0; i < 6; i++) k.light(f, 0, 9.5, Z0 - 6 - i * 18, "#ffe6c4", 45, 26);

  // ---- people: visitors before the paintings, strollers, guards on their chairs ------------------
  let n = 0;
  const id = () => k.visitor(1000 + n++);
  for (let b = 0; b < NB; b++) {
    const zc = Z0 - b * BAY - BAY / 2;
    // two or three in front of the bay's paintings, facing them
    const spots: [number, number, number][] = [
      [-W + 2.6, zc + 0.6, -1],
      [W - 2.4, zc - 0.8, 1],
      [-W + 2.9, zc - 4.4, -1],
      [W - 2.8, zc + 3.6, 1],
    ];
    spots.forEach(([x, z, s], i) => {
      if ((b + i) % 3 === 2) return;
      void k.person(f, id(), [x, z], { face: [s * W, z + (i % 2 ? 0.4 : -0.4)], phone: (b + i) % 5 === 0, item: (b + i) % 7 === 3 ? "book" : undefined });
    });
    if (b % 2 === 0) void k.person(f, id(), [0.15, zc - 0.5], { perch: 0.5, face: [W, zc - 0.5] });
    // a guard on a chair by the columns
    if (b % 2 === 1) {
      const s = b % 4 === 1 ? -1 : 1;
      const z = Z0 - b * BAY - 2.2;
      k.vox(f, "gchair", guardChair, s * (W - 1.1), 0, z, s < 0 ? FACE.px : FACE.nx, 0.5);
      k.solid(f, s * (W - 1.1) - 0.3, z - 0.3, s * (W - 1.1) + 0.3, z + 0.3);
      void k.person(f, id(), [s * (W - 1.05), z], { guard: true, perch: 0.5, face: [0, z] });
    }
  }
  const walk: [number, number][] = Array.from({ length: 12 }, (_, i) => [i % 2 ? 1.6 : -1.6, -6 - i * 9]);
  for (let i = 0; i < 6; i++) void k.person(f, id(), walk[i * 2], { wander: walk });

  k.finish(f);
  return { spawn: new THREE.Vector3(0, 0, -2.6), yaw: 0 };
}
