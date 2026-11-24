import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BAY, CURB } from "../city/plan";
import { GROUND } from "./ground";
import { real } from "./tex";

/**
 * The bay's islands, realistic (branch gta-real): Liberty island (a lawn on a granite sea wall,
 * the statue's star fort on it), the rock (cliffs of dark stone, grass at their top, the prison's
 * flat ground on it) and Bennelong point (the Opera House's granite pier and the promenade out to
 * it). The same heights as the 1 m blocks they replace (the lawn at the kerb's height, the rims a
 * step down), so every walk and every landing stays where it was; smooth surfaces, photographed
 * materials.
 */

/** UVs from the world (metres / tile), by the face's normal. */
function boxUv(g: THREE.BufferGeometry, tile: number) {
  const p = g.getAttribute("position"),
    n = g.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i)),
      az = Math.abs(n.getZ(i));
    const [u, v] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

function mesh(g: THREE.Group, geos: THREE.BufferGeometry[], m: THREE.Material, tile: number, name: string) {
  const list = geos.map((x) => {
    const y = x.index ? x.toNonIndexed() : x;
    for (const k of Object.keys(y.attributes)) if (k !== "position" && k !== "normal" && k !== "uv" && k !== "color") y.deleteAttribute(k);
    if (!y.getAttribute("normal")) y.computeVertexNormals();
    if (tile) boxUv(y, tile);
    return y;
  });
  const geo = mergeGeometries(list, false);
  if (!geo) return;
  const o = new THREE.Mesh(geo, m);
  o.castShadow = o.receiveShadow = true;
  o.name = name;
  g.add(o);
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

let mats: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const keep = <T extends THREE.Material>(m: T) => ((m.userData.shared = true), m);
  const rock = keep(real("Concrete034", { tint: "#ffffff" }).clone());
  rock.vertexColors = true;
  return {
    granite: real("Bricks008", { tint: "#a39d94" }),
    graniteDark: real("Bricks008", { tint: "#7c776f" }),
    paving: real("PavingStones128", { tint: "#d6cfc3" }),
    lawn: GROUND.lawn(),
    rock,
  };
}

/** Liberty island: a round lawn at the kerb's height on its granite sea wall, a ledge a step down. */
function liberty(g: THREE.Group, m: NonNullable<typeof mats>) {
  const L = BAY.liberty;
  const lawn = new THREE.CircleGeometry(L.r - 0.6, 64);
  lawn.rotateX(-Math.PI / 2);
  lawn.translate(L.x, CURB, L.z);
  mesh(g, [lawn], m.lawn, 0, "liberty:lawn");
  // the coping round the lawn, the sea wall down to the bed, the ledge at its foot
  const coping = new THREE.CylinderGeometry(L.r, L.r, 0.25, 64, 1, false);
  coping.translate(L.x, CURB - 0.12, L.z);
  const ring = new THREE.RingGeometry(L.r - 0.6, L.r, 64);
  ring.rotateX(-Math.PI / 2);
  ring.translate(L.x, CURB + 0.005, L.z);
  const wall = new THREE.CylinderGeometry(L.r, L.r + 0.3, CURB - 0.25 - BAY.bed, 64, 1, true);
  wall.translate(L.x, (CURB - 0.25 + BAY.bed) / 2, L.z);
  mesh(g, [coping, ring, wall], m.granite, 1.6, "liberty:wall");
  const ledge = new THREE.CylinderGeometry(L.r + 1.5, L.r + 1.7, CURB - 0.8 - BAY.bed, 64, 1, false);
  ledge.translate(L.x, (CURB - 0.8 + BAY.bed) / 2, L.z);
  mesh(g, [ledge], m.graniteDark, 1.6, "liberty:ledge");
}

/** The rock: a smooth heightfield of the old cliffs' shape (dark stone, grass along the top), round the prison's ground. */
function rock(g: THREE.Group, m: NonNullable<typeof mats>) {
  const R = BAY.rock;
  const noise = (x: number, z: number, s: number) => Math.sin(x * 0.13 + s) * Math.cos(z * 0.11 + s * 2) + Math.sin((x + z) * 0.07 + s * 3) * 0.6;
  const height = (x: number, z: number) => {
    const out = Math.max(R.x0 - x, x - R.x1, R.z0 - z, z - R.z1, 0);
    // (beyond the old cliffs' foot the rock carries on down to the bed: no hole at the waterline)
    const lim = 5 + noise(x, z, 2) * 1.5;
    if (out > lim) return Math.max(BAY.bed - 0.4, CURB + 1.2 - lim * 0.9 + noise(x, z, 5) * 0.6 - (out - lim) * 1.6);
    return out > 0 ? CURB + 1.2 - out * 0.9 + noise(x, z, 5) * 0.6 : CURB + 1.2;
  };
  const S = 0.75;
  const x0 = R.x0 - 9,
    x1 = R.x1 + 9,
    z0 = R.z0 - 9,
    z1 = R.z1 + 9;
  const nx = Math.ceil((x1 - x0) / S),
    nz = Math.ceil((z1 - z0) / S);
  const pos: number[] = [],
    col: number[] = [];
  const c = new THREE.Color();
  const inside = (x: number, z: number) => x > R.x0 + 0.5 && x < R.x1 - 0.5 && z > R.z0 + 0.5 && z < R.z1 - 0.5;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const xa = x0 + i * S,
        za = z0 + j * S,
        xb = xa + S,
        zb = za + S;
      // (the prison's own ground covers the top)
      if (inside(xa, za) && inside(xb, zb)) continue;
      const q: [number, number][] = [
        [xa, za],
        [xa, zb],
        [xb, za],
        [xb, za],
        [xa, zb],
        [xb, zb],
      ];
      for (const [x, z] of q) {
        const y = height(x, z);
        pos.push(x, y, z);
        const out = Math.max(R.x0 - x, x - R.x1, R.z0 - z, z - R.z1, 0);
        // grass on the brow, lichen-dark stone down the cliff, a wet dark band at the water
        if (y > CURB + 0.6 && out > 0.2) c.set("#5f8a4e");
        else if (y > CURB + 0.6) c.set("#8a8690");
        else if (y < BAY.water + 0.4) c.set("#4a4650");
        else c.set(noise(x, z, 8) > 0.4 ? "#7a7480" : "#6a6470");
        col.push(c.r, c.g, c.b);
      }
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const w = mergeVertices(geo, 1e-3);
  w.computeVertexNormals();
  mesh(g, [w], m.rock, 2.2, "rock:cliffs");
}

/** Bennelong point: the opera's granite pier (its broadwalk is the opera's own), the promenade from the quay. */
function bennelong(g: THREE.Group, m: NonNullable<typeof mats>) {
  const O = BAY.opera;
  const ox = (O.x0 + O.x1) / 2;
  // the pier's body, its rim a step down all round, the sea wall below
  mesh(g, [box(O.x1 - O.x0, CURB - BAY.bed, O.z1 - O.z0, ox, (CURB + BAY.bed) / 2, (O.z0 + O.z1) / 2)], m.granite, 1.6, "bennelong:pier");
  mesh(g, [box(O.x1 - O.x0 + 3, CURB - 0.6 - BAY.bed, O.z1 - O.z0 + 3, ox, (CURB - 0.6 + BAY.bed) / 2, (O.z0 + O.z1) / 2)], m.graniteDark, 1.6, "bennelong:rim");
  // the promenade: paving between granite kerbs, out from the quay to the pier
  const zA = BAY.z0 - 1,
    zB = O.z0 + 1;
  mesh(g, [box(8, CURB - BAY.bed, zB - zA, ox, (CURB + BAY.bed) / 2 - 0.01, (zA + zB) / 2)], m.paving, 2.4, "bennelong:walk");
  mesh(
    g,
    [-1, 1].map((s) => box(0.4, 0.12, zB - zA, ox + s * 3.8, CURB + 0.06, (zA + zB) / 2)),
    m.granite,
    1.6,
    "bennelong:kerb",
  );
}

/** All three, into the city's group. */
export function realIslands(g: THREE.Group) {
  const m = (mats ??= makeMats());
  liberty(g, m);
  rock(g, m);
  bennelong(g, m);
}
