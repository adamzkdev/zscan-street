import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BAY } from "../city/plan";
import { GROUND, groundMat } from "./ground";
import { maps, real } from "./tex";

/**
 * The Golden Gate, realistic and wide (branch gta-real): a six-lane deck — three lanes each way
 * either side of a concrete median — a green cycle lane and a pedestrian walkway on each side
 * behind barriers, an orange railing, the stiffening truss under the deck, two Art-Deco towers
 * with stepped legs and panelled portal struts, main cables in catenary with their suspenders down
 * to the edge girders, concrete fenders round the tower piers, anchorages at both ends, lamps along
 * the walkways, red aviation lights. International Orange over painted steel panels, concrete,
 * photographed asphalt with its paint.
 *
 * The deck runs from Bay Road's south kerb (z0) up over the bay and down into the headland's cut,
 * where the carriageway narrows to the Orchard Tunnel's four lanes (the walkways and cycle lanes
 * stop at the viewpoint past the north tower). Its geometry is analytic: the game reads the same
 * profile (deckY, roadHalf) the bridge is built from (src/scene/goldengate.ts).
 */

/** The bridge's plan (world metres; x across from the centre line, z along). */
export const GG = {
  x: BAY.bridge.x,
  /** City end (in Bay Road's south lanes: the deck rises over the quay's pavement) and headland end (the tunnel's approach). */
  z0: 141,
  /** Where the deck proper starts (the quay's kerb): barriers, cycle lanes and walkways from here. */
  quay: 144,
  z1: 226,
  /** The towers. */
  ta: 164,
  tb: 204,
  /** Half widths: the median barrier, the carriageway, its barrier, the cycle lane, the walkway, the railing, the edge girder (the cable plane). */
  med: 0.45,
  road: 10.7,
  barrier: 11.2,
  bike: 13.2,
  kerb: 13.35,
  walk: 15.6,
  rail: 15.8,
  edge: 18.2,
  /** The towers' legs: their centre off the centre line, half width at the base. */
  leg: 19.4,
  legHalf: 1.3,
  /** Where the carriageway narrows to the tunnel's (half 6.6) over the headland's cut. */
  narrowFrom: 205,
  narrowTo: 214,
  roadEnd: 6.6,
  /** The walkways and cycle lanes stop here (the viewpoint), past the north tower. */
  walkEnd: 210,
  /** The deck's height: at the towers, at mid-span, the tower tops. */
  yTower: 6.5,
  yMid: 7.5,
  top: 52,
  /**
   * Traffic lanes' centres: three each way over the water (the traffic keeps to the inner two), two
   * each way through the headland's cut and the Orchard Tunnel (3 m apart from the oncoming ones:
   * two cars side by side never touch), the streets' at either end.
   */
  lanes: [2.16, 5.58, 9.0],
  tunnelLanes: [1.5, 3.9],
  streetLanes: [1.1, 3.2],
  /** The tunnel's far portal (KTUNNEL.z1): past it the lanes ease back to the town's. */
  tunnelEnd: 257,
};

const smooth = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/** The road's surface height along the deck (0 at Bay Road's asphalt, ~CURB at the tunnel). */
export function deckY(z: number) {
  const { z0, z1, ta, tb, yTower, yMid } = GG;
  const mid = (ta + tb) / 2;
  if (z <= z0) return 0;
  if (z < ta) return yTower * smooth((z - z0) / (ta - z0));
  if (z <= tb) {
    const u = (z - mid) / ((tb - ta) / 2);
    return yTower + (yMid - yTower) * (1 - u * u);
  }
  if (z >= z1) return 0.22;
  return 0.22 + (yTower - 0.22) * (1 - smooth((z - tb) / (z1 - tb)));
}

/** The carriageway's half width at z (narrowing into the headland's cut). */
export function roadHalf(z: number) {
  return GG.road + (GG.roadEnd - GG.road) * smooth((z - GG.narrowFrom) / (GG.narrowTo - GG.narrowFrom));
}

/** How far out from the centre line a body may stand on the deck at z (the walkways' railing, or the road's barrier past the viewpoint). */
export function walkHalf(z: number) {
  return z < GG.walkEnd ? GG.walk : roadHalf(z) + 0.5;
}

/** A lane's centre at z: over the water the three-lane deck's, in the cut the tunnel's (lane 0 inner, 1 outer of the two the traffic uses). */
export function laneAt(z: number, lane: 0 | 1) {
  // out of the tunnel into Orchard Keys: back to the town's lanes over 8 m
  if (z > GG.tunnelEnd) return GG.tunnelLanes[lane] + (GG.streetLanes[lane] - GG.tunnelLanes[lane]) * smooth((z - GG.tunnelEnd) / 8);
  const k = smooth((z - GG.narrowFrom) / (GG.narrowTo - GG.narrowFrom));
  const deck = GG.lanes[lane] + (GG.tunnelLanes[lane] - GG.lanes[lane]) * k;
  // (coming off Bay Road: the deck's lanes open out from the ring road's over the first metres)
  const k0 = 1 - smooth((z - GG.z0) / 10);
  return deck + (GG.streetLanes[lane] - deck) * k0;
}

/** The main cables' height at z (the catenary over the span, the backstays to the anchorages). */
export function cableY(z: number) {
  const { ta, tb, top } = GG;
  const saddle = top - 1;
  const mid = (ta + tb) / 2;
  const low = deckY(mid) + 2.2;
  if (z >= ta && z <= tb) {
    const u = (z - mid) / ((tb - ta) / 2);
    return low + (saddle - low) * u * u;
  }
  const [za, ya, zt] = z < ta ? [ANCHOR.city.z, ANCHOR.city.y, ta] : [ANCHOR.head.z, ANCHOR.head.y, tb];
  const t = (z - za) / (zt - za);
  if (t < 0 || t > 1) return -1;
  return ya + (saddle - ya) * t - 4 * 1.6 * t * (1 - t);
}
/** Where the cables go into the ground: the anchorages' cable mouths. */
const ANCHOR = { city: { z: 154, y: 4.6 }, head: { z: 214, y: 8.6 } };

// ---- materials ---------------------------------------------------------------------------------

// (International Orange, a little lifted for the tone mapping)
const ORANGE = "#c8442c";
let mats: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const keep = <T extends THREE.Material>(m: T) => ((m.userData.shared = true), m);
  // painted steel: the panels' seams and wear from Metal032, in International Orange
  // (double-sided: the swept profiles' windings are not all outward; the shader turns the normal)
  const relief = maps("Metal032");
  const steel = keep(new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.6, metalness: 0.08, normalMap: relief.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: relief.roughnessMap, side: THREE.DoubleSide }));
  const steelDark = keep(steel.clone());
  steelDark.color.set("#8f2c21");
  const cable = keep(new THREE.MeshStandardMaterial({ color: "#b63c2c", roughness: 0.48, metalness: 0.25 }));
  const concrete = real("Concrete034", { tint: "#ece8e0", roughness: 1 });
  const concreteDark = real("Concrete034", { tint: "#9a968e", roughness: 1 });
  const barrier = keep(real("Concrete034", { tint: "#d4d0c8", roughness: 1 }).clone());
  barrier.side = THREE.DoubleSide;
  const rail = keep(new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.55, metalness: 0.15, alphaTest: 0.5, side: THREE.DoubleSide, map: balusters() }));
  const lamp = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffc27a"), toneMapped: false }));
  const red = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff2a1a"), toneMapped: false }));
  const pearl = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff2d8"), toneMapped: false }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: "#3a3634", roughness: 0.6, metalness: 0.3 }));
  const sign = keep(new THREE.MeshBasicMaterial({ map: gantrySign(), toneMapped: false }));
  const yellow = keep(new THREE.MeshStandardMaterial({ color: "#e9b21e", roughness: 0.5, metalness: 0.05 }));
  const road = GROUND.asphalt(roadMarks(6));
  const roadCut = GROUND.asphalt(roadMarks(4));
  const bike = groundMat({ set: "Asphalt031", markings: bikeMarks(), wet: true, anti: 0.8, patches: 0.3, tint: "#5e8f63" });
  const walk = GROUND.concrete();
  return { steel, steelDark, cable, concrete, concreteDark, barrier, rail, lamp, red, pearl, dark, sign, yellow, road, roadCut, bike, walk };
}

/** The lamps lit at night (0 by day … 1). */
export function bridgeNight(k: number) {
  if (!mats) return;
  mats.lamp.color.setRGB(1, 0.76, 0.48).multiplyScalar(0.25 + 3.2 * k);
  mats.pearl.color.setRGB(1, 0.95, 0.85).multiplyScalar(0.15 + 2.6 * k);
  mats.red.color.setRGB(1, 0.16, 0.1).multiplyScalar(0.6 + 2.8 * k);
}

/** The railing's balusters (alpha-tested bars on a plane), the top rail drawn separately. */
function balusters() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 64, 128);
  g.fillStyle = "#ffffff";
  // two bars per repeat, a mid rail, a bottom rail
  g.fillRect(6, 0, 9, 128);
  g.fillRect(38, 0, 9, 128);
  g.fillRect(0, 54, 64, 7);
  g.fillRect(0, 118, 64, 10);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.shared = true;
  return t;
}

/** The carriageway's paint (u along z / 18 m, v across the road): `lanes` 6 (over the water) or 4 (the cut). */
function roadMarks(lanes: 6 | 4) {
  const P = 24;
  const len = 18;
  const half = lanes === 6 ? GG.road : GG.roadEnd;
  const c = document.createElement("canvas");
  c.width = len * P;
  c.height = Math.round(half * 2 * P);
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  const white = "rgba(238,238,232,0.95)",
    yellow = "rgba(234,184,48,0.95)";
  const line = 0.15 * P;
  const yAt = (x: number) => (half - x) * P; // v runs from +half (top) to −half
  const solid = (x: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(0, yAt(x) - line / 2, c.width, line);
  };
  const dash = (x: number) => {
    g.fillStyle = white;
    for (let u = 0; u < len; u += 9) g.fillRect(u * P, yAt(x) - line / 2, 3 * P, line);
  };
  if (lanes === 6) {
    for (const s of [-1, 1]) {
      solid(s * (GG.med + 0.25), yellow);
      solid(s * (GG.road - 0.35), white);
      for (const k of [1, 2]) dash(s * (GG.med + 3.42 * k));
    }
  } else {
    solid(0.12, yellow);
    solid(-0.12, yellow);
    for (const s of [-1, 1]) {
      solid(s * (GG.roadEnd - 0.35), white);
      dash(s * 2.7);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.shared = true;
  return t;
}

/** The cycle lane's paint: a bike every 12 m, its dashed edge (u along z / 12, v across). */
function bikeMarks() {
  const P = 40;
  const c = document.createElement("canvas");
  c.width = 12 * P;
  c.height = 2 * P;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = "rgba(240,240,236,0.92)";
  for (let u = 0; u < c.width; u += P * 2) g.fillRect(u, c.height - 6, P * 1.2, 4);
  g.fillRect(0, 2, c.width, 4);
  // the bike: two wheels, the frame, seen from above-ish (as painted on lanes)
  g.save();
  g.translate(c.width * 0.5, c.height / 2);
  g.rotate(-Math.PI / 2);
  g.strokeStyle = "rgba(244,244,240,0.92)";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(-14, 0, 9, 0, Math.PI * 2);
  g.arc(14, 0, 9, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(-14, 0);
  g.lineTo(-2, -12);
  g.lineTo(10, -12);
  g.lineTo(14, 0);
  g.moveTo(-2, -12);
  g.lineTo(2, 0);
  g.lineTo(-14, 0);
  g.stroke();
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.shared = true;
  return t;
}

/** The gantry's signs over the road at the city end: where the lanes go. */
function gantrySign() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0e5a3a";
  g.fillRect(0, 0, 1024, 128);
  g.strokeStyle = "#f2f2ee";
  g.lineWidth = 5;
  g.strokeRect(8, 8, 1008, 112);
  g.fillStyle = "#f2f2ee";
  g.font = "700 54px Archivo, Roboto, sans-serif";
  g.textBaseline = "middle";
  g.fillText("ORCHARD KEYS  ·  ORCHARD TUNNEL", 40, 64);
  g.font = "800 60px Archivo, Roboto, sans-serif";
  g.fillText("↑ ↑ ↑", 860, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.shared = true;
  return t;
}

// ---- geometry helpers --------------------------------------------------------------------------

type Mat = keyof ReturnType<typeof makeMats>;

class Builder {
  private parts = new Map<Mat, THREE.BufferGeometry[]>();
  add(m: Mat, g: THREE.BufferGeometry) {
    const list = this.parts.get(m) ?? [];
    list.push(g.index ? g.toNonIndexed() : g);
    this.parts.set(m, list);
  }
  /** A box with its faces' UVs in world metres (for the textured sets). */
  box(m: Mat, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotY) g.rotateY(rotY);
    g.translate(x, y, z);
    this.add(m, worldUv(g, 1));
    return g;
  }
  /** A beam (square section) from a to b. */
  beam(m: Mat, a: THREE.Vector3, b: THREE.Vector3, s: number, s2 = s) {
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(s, len, s2);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(q);
    g.translate(a.x, a.y, a.z);
    this.add(m, worldUv(g, 1));
  }
  cyl(m: Mat, r: number, h: number, x: number, y: number, z: number, seg = 10, r2 = r) {
    const g = new THREE.CylinderGeometry(r2, r, h, seg);
    g.translate(x, y + h / 2, z);
    this.add(m, worldUv(g, 1));
  }
  /**
   * A profile swept along the deck: `prof` points (dx, dy) across (dx relative to `xOf(z)`, dy over
   * deckY(z)), from za to zb every `step` m; `u` along in metres / `tile`. Closed if `closed`.
   */
  sweep(m: Mat, prof: [number, number][], xOf: (z: number) => number, za: number, zb: number, step = 1, tile = 1, mirror = false) {
    const pos: number[] = [],
      uv: number[] = [];
    const acc = [0];
    for (let k = 1; k < prof.length; k++) acc.push(acc[k - 1] + Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]));
    const zs: number[] = [];
    for (let z = za; z < zb; z += step) zs.push(z);
    zs.push(zb);
    for (let i = 0; i + 1 < zs.length; i++) {
      const z1 = zs[i],
        z2 = zs[i + 1];
      const x1 = xOf(z1),
        x2 = xOf(z2),
        y1 = deckY(z1),
        y2 = deckY(z2);
      for (let k = 0; k + 1 < prof.length; k++) {
        const [ax, ay] = prof[k],
          [bx, by] = prof[k + 1];
        const s = mirror ? -1 : 1;
        const p = [
          [x1 + s * ax, y1 + ay, z1],
          [x1 + s * bx, y1 + by, z1],
          [x2 + s * bx, y2 + by, z2],
          [x2 + s * ax, y2 + ay, z2],
        ];
        // (UVs in metres: along the deck, round the profile; the material's tile divides them)
        const v0 = acc[k],
          v1 = acc[k + 1];
        const quv = [
          [z1 * tile, v0],
          [z1 * tile, v1],
          [z2 * tile, v1],
          [z2 * tile, v0],
        ];
        const order = mirror ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
        for (const o of order) pos.push(...p[o]), uv.push(...quv[o]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    this.add(m, g);
  }
  /**
   * A flat ribbon on the deck between xa(z) and xb(z) at dy over the road, facing up; UVs: u along
   * (z / uTile), v across (0 at xa … 1 at xb) — the paint's — or, with `world`, metres.
   */
  ribbon(m: Mat, xa: (z: number) => number, xb: (z: number) => number, dy: number, za: number, zb: number, uTile: number, step = 1, vAbs?: [number, number]) {
    const pos: number[] = [],
      uv: number[] = [];
    const zs: number[] = [];
    for (let z = za; z < zb; z += step) zs.push(z);
    zs.push(zb);
    for (let i = 0; i + 1 < zs.length; i++) {
      const z1 = zs[i],
        z2 = zs[i + 1];
      const p = [
        [xa(z1), deckY(z1) + dy, z1],
        [xb(z1), deckY(z1) + dy, z1],
        [xb(z2), deckY(z2) + dy, z2],
        [xa(z2), deckY(z2) + dy, z2],
      ];
      const v = (x: number, d: number) => (vAbs ? (x - vAbs[0]) / vAbs[1] : d);
      const quv = [
        [z1 / uTile, v(p[0][0], 0)],
        [z1 / uTile, v(p[1][0], 1)],
        [z2 / uTile, v(p[2][0], 1)],
        [z2 / uTile, v(p[3][0], 0)],
      ];
      for (const o of [0, 2, 1, 0, 3, 2]) pos.push(...p[o]), uv.push(...quv[o]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    this.add(m, g);
  }
  build(): THREE.Group {
    const out = new THREE.Group();
    const M = (mats ??= makeMats());
    for (const [m, list] of this.parts) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      // (the textured sets: UVs in metres → the set's tile)
      const tile = UV_TILE[m];
      if (tile) {
        const uv = geo.getAttribute("uv");
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
      }
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, M[m]);
      const lit = m === "lamp" || m === "red" || m === "pearl" || m === "sign";
      mesh.castShadow = !lit && m !== "road" && m !== "roadCut" && m !== "bike" && m !== "walk" && m !== "rail";
      mesh.receiveShadow = !lit;
      mesh.name = `gg:${m}`;
      out.add(mesh);
    }
    return out;
  }
}

/** The texture's tile (m) of the sets drawn with world-metre UVs. */
const UV_TILE: Partial<Record<Mat, number>> = { steel: 2, steelDark: 2, concrete: 2, concreteDark: 2, barrier: 2, cable: 1 };

/** UVs from the world in metres (a box projection by the face's normal), divided by `tile`. */
function worldUv(g: THREE.BufferGeometry, tile: number) {
  const p = g.getAttribute("position"),
    n = g.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i)),
      az = Math.abs(n.getZ(i));
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

// ---- the bridge ----------------------------------------------------------------------------------

/** The whole bridge (world coordinates), merged per material: a dozen draw calls. */
export function buildBridge(): THREE.Group {
  const B = new Builder();
  const X = GG.x;
  const { z0, z1, ta, tb, top } = GG;
  const L = (dx: number) => () => X + dx;

  // ---- the deck's surfaces -----
  // the carriageway over the water (six lanes), and in the cut (narrowing to the tunnel's four)
  // (from a metre and a half into Bay Road's south lanes, a few centimetres over its asphalt, rising over the quay)
  B.ribbon("road", () => X - GG.road, () => X + GG.road, 0, z0 + 1.5, GG.narrowFrom, 18);
  // (its paint mapped by x, not stretched across the narrowing: the tunnel's four lanes, nothing past them)
  B.ribbon("roadCut", (z) => X - roadHalf(z), (z) => X + roadHalf(z), 0, GG.narrowFrom, z1, 18, 0.5, [X - GG.roadEnd, GG.roadEnd * 2]);
  // the cycle lanes and the walkways (a kerb's step up), out to the viewpoint
  for (const s of [-1, 1]) {
    const a = (dx: number) => () => X + s * dx;
    const pair = (d1: number, d2: number): [(z: number) => number, (z: number) => number] => (s < 0 ? [a(d2), a(d1)] : [a(d1), a(d2)]);
    B.ribbon("bike", ...pair(GG.barrier, GG.bike), 0.02, GG.quay, GG.walkEnd, 12);
    B.ribbon("walk", ...pair(GG.kerb, GG.walk), 0.15, GG.quay, GG.walkEnd, 2);
    // the kerb between them, the walkway's outer edge up to the railing
    B.sweep("barrier", [[0, 0.02], [0, 0.15], [0.15, 0.15]], a(GG.bike), GG.quay, GG.walkEnd, 1, 1, s < 0);
    B.ribbon("walk", ...pair(GG.walk, GG.edge), 0.15, GG.quay + 2, GG.walkEnd, 2);
    // the viewpoint's end: the walkway closed by a railing, a bench, binoculars
    const ye = deckY(GG.walkEnd);
    B.box("rail", 0.05, 1.3, 0.05, X + s * (GG.barrier + GG.edge) * 0.5, ye + 0.8, GG.walkEnd);
    B.box("steel", GG.edge - GG.barrier, 0.1, 0.12, X + s * (GG.barrier + GG.edge) * 0.5, ye + 1.45, GG.walkEnd);
    B.box("dark", 0.25, 1.1, 0.25, X + s * 14.4, ye + 0.15 + 0.55, GG.walkEnd - 1.2);
    B.box("dark", 0.5, 0.25, 0.3, X + s * 14.4, ye + 0.15 + 1.2, GG.walkEnd - 1.2);
  }
  // where the carriageway narrows (past the north tower, up to the viewpoint): paving between its
  // barrier and the cycle lanes, so no gap opens as the road draws in
  for (const s of [-1, 1]) {
    const a = (z: number) => X + s * (roadHalf(z) + 0.5),
      b = () => X + s * GG.barrier;
    B.ribbon("walk", s < 0 ? b : a, s < 0 ? a : b, 0.02, GG.narrowFrom - 0.5, GG.walkEnd, 2, 0.5);
  }
  // the deck's underside past the north tower, as wide as the deck above it (double-sided steel)
  B.ribbon("steelDark", (z) => X - (z < GG.walkEnd ? GG.edge : roadHalf(z) + 1.2), (z) => X + (z < GG.walkEnd ? GG.edge : roadHalf(z) + 1.2), -0.15, GG.narrowFrom - 1, z1 - 1, 4, 0.5);
  // under it all: the deck slab and its edge girders (the fascia, orange), the median barrier
  B.sweep("steelDark", [[-GG.edge, -0.15], [GG.edge, -0.15]].map(([x, y]) => [x, y] as [number, number]), () => X, GG.quay + 1, GG.narrowFrom, 1, 1);
  for (const s of [-1, 1]) {
    // the edge girder: a box section along the deck's edge, from the road's level down
    const xg = (z: number) => X + s * (z < GG.walkEnd ? GG.edge : roadHalf(z) + 1.2);
    B.sweep("steel", [[0, 0.3], [0, -1.4], [-0.6, -1.4]], xg, GG.quay + 1, z1 - 2, 1, 1, s < 0);
    B.sweep("steel", [[-0.6, 0.3], [0, 0.3]], xg, GG.quay + 1, z1 - 2, 1, 1, s < 0);
    // the carriageway's barriers (a concrete Jersey wall with a steel rail on top)
    const xb = (z: number) => X + s * (roadHalf(z) + 0.02);
    B.sweep("barrier", [[0, 0], [0.05, 0.3], [0.14, 0.85], [0.42, 0.85], [0.5, 0]], xb, GG.quay + 0.5, z1 - 1, 1, 1, s < 0);
    B.sweep("steel", [[0.2, 0.95], [0.36, 0.95], [0.36, 1.05], [0.2, 1.05], [0.2, 0.95]], xb, GG.quay + 0.5, z1 - 1, 1, 1, s < 0);
    // the railing: balusters (alpha-tested), a top rail, posts every 3 m
    const xr = () => X + s * GG.rail;
    void L;
    B.sweep("steel", [[0, 1.42], [0.12, 1.42], [0.12, 1.5], [0, 1.5], [0, 1.42]], xr, GG.quay + 1, GG.walkEnd, 1, 1, s < 0);
    for (let z = GG.quay + 2; z < GG.walkEnd; z += 3) B.box("steel", 0.12, 1.4, 0.12, X + s * GG.rail, deckY(z) + 0.15 + 0.7, z);
  }
  // the balusters as vertical planes (the railing proper), one strip a side
  for (const s of [-1, 1]) railStrip(B, X + s * (GG.rail - 0.02), GG.quay + 1, GG.walkEnd);
  // the median: a concrete barrier down the middle, over the water
  B.sweep("barrier", [[-0.42, 0], [-0.32, 0.3], [-0.12, 0.82], [0.12, 0.82], [0.32, 0.3], [0.42, 0]], () => X, GG.quay + 8, GG.narrowFrom - 1, 1, 1);
  // its noses: yellow crash cushions with their black chevrons
  for (const [z, d] of [
    [GG.quay + 8, -1],
    [GG.narrowFrom - 1, 1],
  ] as const) {
    const y = deckY(z + d * 1.2);
    B.box("yellow", 0.86, 0.85, 2.4, X, y + 0.42, z + d * 1.2);
    B.box("dark", 0.9, 0.3, 0.06, X, y + 0.5, z + d * 2.42);
  }

  // ---- the truss under the deck (over the water), floor beams, lateral bracing -----
  const span0 = GG.quay + 3,
    span1 = GG.narrowFrom + 2;
  for (const s of [-1, 1]) {
    const x = X + s * (GG.edge - 0.3);
    const depth = 3.2;
    // the bottom chord
    B.sweep("steel", [[-0.25, -depth], [0.25, -depth], [0.25, -depth - 0.4], [-0.25, -depth - 0.4], [-0.25, -depth]], () => x, span0 + 4, span1 - 2, 1, 1);
    // verticals and Warren diagonals every 6 m
    let up = true;
    for (let z = span0 + 4; z < span1 - 2; z += 6) {
      const ya = deckY(z) - 1.4,
        yb = deckY(z) - depth - 0.2;
      B.beam("steel", new THREE.Vector3(x, yb, z), new THREE.Vector3(x, ya, z), 0.3);
      const zn = Math.min(span1 - 2, z + 6);
      const a = new THREE.Vector3(x, up ? yb : deckY(z) - 1.4, z),
        b = new THREE.Vector3(x, up ? deckY(zn) - 1.4 : deckY(zn) - depth - 0.2, zn);
      B.beam("steel", a, b, 0.24);
      up = !up;
      // the floor beam across, under the slab, and the X of the lateral bracing at the bottom
      B.box("steelDark", GG.edge * 2, 0.5, 0.35, X, deckY(z) - 0.45, z);
      if (s > 0) {
        B.beam("steelDark", new THREE.Vector3(X - GG.edge + 0.4, deckY(z) - depth, z), new THREE.Vector3(X + GG.edge - 0.4, deckY(zn) - depth, zn), 0.18);
        B.beam("steelDark", new THREE.Vector3(X + GG.edge - 0.4, deckY(z) - depth, z), new THREE.Vector3(X - GG.edge + 0.4, deckY(zn) - depth, zn), 0.18);
      }
    }
  }

  // ---- the approach piers and the abutments -----
  // (a cap under the deck's slab — under its truss over the water — on four columns)
  for (const z of [151, 157, 209]) {
    const y = deckY(z) - (z > tb ? 0.55 : 3.8);
    if (y < 1.7) continue;
    for (const s of [-1, 1]) for (const cx of [6, 15]) B.box("concrete", 1.4, y - 1.2 - BAY.bed, 1.8, X + s * cx, BAY.bed + (y - 1.2 - BAY.bed) / 2, z);
    B.box("concrete", GG.edge * 2 - 2, 1.2, 2.2, X, y - 0.6, z);
  }
  // the city end's abutment: from the quay's wall down into the water
  B.box("concrete", GG.edge * 2, 2.6, 3, X, -1.25, GG.quay + 3.6);

  // ---- the towers -----
  const tiers: [number, number, number, number][] = [
    // y0, y1, half width (x), half depth (z)
    [4.6, 22, GG.legHalf, 2.3],
    [22, 33, GG.legHalf - 0.12, 2.1],
    [33, 43, GG.legHalf - 0.24, 1.9],
    [43, top, GG.legHalf - 0.36, 1.7],
  ];
  const portals: [number, number][] = [
    [0, 0],
    [GG.yTower + 6.8, GG.yTower + 8.8],
    [23, 25.5],
    [34, 36.5],
    [44.2, 46.6],
    [top - 2.2, top],
  ];
  for (const tz of [ta, tb]) {
    // the pier: a rounded concrete fender in the water
    pier(B, X, tz);
    for (const s of [-1, 1]) {
      const lx = X + s * GG.leg;
      for (const [y0, y1, hx, hz] of tiers) {
        B.box("steel", hx * 2, y1 - y0, hz * 2, lx, (y0 + y1) / 2, tz);
        // the flutes: ribs proud of each face, the Art-Deco cell look
        for (const fx of [-0.55, 0, 0.55]) {
          B.box("steelDark", 0.14, y1 - y0 - 0.6, 0.1, lx + fx * hx, (y0 + y1) / 2, tz + hz + 0.03);
          B.box("steelDark", 0.14, y1 - y0 - 0.6, 0.1, lx + fx * hx, (y0 + y1) / 2, tz - hz - 0.03);
        }
        for (const fz of [-0.5, 0.5]) for (const sx of [-1, 1]) B.box("steelDark", 0.1, y1 - y0 - 0.6, 0.14, lx + sx * (hx + 0.03), (y0 + y1) / 2, tz + fz * hz);
        // the setback's ledge
        B.box("steelDark", hx * 2 + 0.3, 0.35, hz * 2 + 0.3, lx, y1 - 0.17, tz);
      }
      // the cap: stepped, with its aviation light
      B.box("steel", (GG.legHalf - 0.45) * 2, 1.2, 2.6, lx, top + 0.6, tz);
      B.box("steelDark", (GG.legHalf - 0.7) * 2, 0.8, 1.8, lx, top + 1.6, tz);
      B.box("red", 0.5, 0.5, 0.5, lx, top + 2.3, tz);
      // the saddle housing the cable runs over
      B.box("steelDark", 1.0, 1.0, 3.2, X + s * GG.edge, top - 0.3, tz);
    }
    // the portal struts between the legs (over the deck: clear of the trucks), panelled
    for (const [y0, y1] of portals) {
      if (y1 <= y0) continue;
      const w = (GG.leg - GG.legHalf) * 2 + 0.4;
      B.box("steel", w, y1 - y0, 2.2, X, (y0 + y1) / 2, tz);
      for (let px = -w / 2 + 1.6; px < w / 2 - 1.2; px += 3.2) {
        B.box("steelDark", 2.2, (y1 - y0) * 0.55, 0.1, X + px + 0.8, (y0 + y1) / 2, tz + 1.12);
        B.box("steelDark", 2.2, (y1 - y0) * 0.55, 0.1, X + px + 0.8, (y0 + y1) / 2, tz - 1.12);
      }
    }
    // the strut under the deck between the legs
    B.box("steel", (GG.leg - GG.legHalf) * 2 + 0.4, 1.8, 2.2, X, GG.yTower - 4.2, tz);
  }

  // ---- the main cables, their bands, the suspenders, the necklace of lights -----
  for (const s of [-1, 1]) {
    const xc = X + s * GG.edge;
    const pts: THREE.Vector3[] = [];
    for (let z = ANCHOR.city.z; z <= ANCHOR.head.z; z += 0.5) {
      const y = cableY(z);
      if (y < 0) continue;
      pts.push(new THREE.Vector3(xc, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 260, 0.42, 10, false);
    B.add("cable", tube);
    for (let z = ANCHOR.city.z + 3; z < ANCHOR.head.z - 2; z += 2.5) {
      const yc = cableY(z),
        yd = deckY(z) + 0.3;
      if (yc - yd < 1.6) continue;
      // a suspender (a thin pair of ropes), its band on the cable
      B.cyl("cable", 0.06, yc - yd, xc, yd, z, 6);
      B.box("steelDark", 0.95, 0.5, 0.5, xc, yc - 0.25, z);
      if (Math.round(z * 2) % 15 === 0) B.box("pearl", 0.18, 0.18, 0.18, xc, yc + 0.45, z);
    }
  }

  // ---- the anchorages -----
  // (the city's stands in the water past the quay wall, its cable mouth facing the south tower)
  for (const [z, y, dz] of [
    [ANCHOR.city.z, ANCHOR.city.y, -1],
    [ANCHOR.head.z, ANCHOR.head.y, 1],
  ] as const) {
    for (const s of [-1, 1]) {
      const ax = X + s * (GG.edge + 2.4),
        az = z + dz * 3.8;
      const h = y + 1.4 - BAY.bed;
      B.box("concrete", 5.2, h, 7.6, ax, BAY.bed + h / 2, az);
      // the stepped cornice, the recessed panels (Art-Deco, like the towers)
      B.box("concreteDark", 5.6, 0.5, 8.0, ax, y + 1.4 + 0.25, az);
      B.box("concrete", 4.4, 0.6, 6.6, ax, y + 1.4 + 0.8, az);
      for (const pz of [-2.2, 0, 2.2]) B.box("concreteDark", 0.12, h - 3.2, 1.5, ax + s * 2.62, BAY.bed + 1.2 + (h - 3.2) / 2 + 1, az + pz);
      // the cable's mouth: a dark collar where it goes in
      B.box("steelDark", 1.4, 1.4, 0.6, X + s * GG.edge, y, z);
      // the gate lamp on top
      B.cyl("dark", 0.14, 2.2, ax, y + 2.1, az);
      B.box("lamp", 0.5, 0.6, 0.5, ax, y + 4.4, az);
    }
  }

  // ---- lamps along the walkways (sodium heads on curved posts), the gantry -----
  for (let z = GG.quay + 6; z < GG.walkEnd - 2; z += 14) {
    if (Math.abs(z - ta) < 4 || Math.abs(z - tb) < 4) continue;
    for (const s of [-1, 1]) {
      const x = X + s * (GG.rail - 0.25);
      const y = deckY(z) + 0.15;
      B.cyl("steelDark", 0.09, 6.6, x, y, z, 8, 0.07);
      B.beam("steelDark", new THREE.Vector3(x, y + 6.6, z), new THREE.Vector3(x - s * 1.4, y + 6.9, z), 0.08);
      B.box("dark", 0.55, 0.22, 0.32, x - s * 1.6, y + 6.8, z);
      B.box("lamp", 0.45, 0.06, 0.26, x - s * 1.6, y + 6.66, z);
    }
  }
  {
    const z = GG.quay + 8,
      y = deckY(z);
    for (const s of [-1, 1]) B.box("dark", 0.35, 7.4, 0.35, X + s * (GG.road + 0.7), y + 3.7, z);
    B.box("dark", (GG.road + 0.7) * 2, 0.5, 0.4, X, y + 7.2, z);
    const sg = new THREE.PlaneGeometry(14, 1.75);
    sg.rotateY(Math.PI);
    sg.translate(X, y + 6.1, z - 0.22);
    B.add("sign", sg);
    B.box("dark", 14.3, 2.0, 0.2, X, y + 6.1, z - 0.05);
  }
  return B.build();
}

/** The railing's balusters: a vertical strip of the alpha-tested pattern, 1.35 m tall, along the deck. */
function railStrip(B: Builder, x: number, za: number, zb: number) {
  const pos: number[] = [],
    uv: number[] = [];
  for (let z = za; z < zb; z += 1) {
    const z2 = Math.min(zb, z + 1);
    const y1 = deckY(z) + 0.15,
      y2 = deckY(z2) + 0.15;
    const p = [
      [x, y1, z],
      [x, y2, z2],
      [x, y2 + 1.3, z2],
      [x, y1 + 1.3, z],
    ];
    const q = [
      [z / 0.6, 0],
      [z2 / 0.6, 0],
      [z2 / 0.6, 1],
      [z / 0.6, 1],
    ];
    for (const o of [0, 1, 2, 0, 2, 3]) pos.push(...p[o]), uv.push(...q[o]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  B.add("rail", g);
}

/** A tower's pier: a rounded concrete fender round the legs' footings, standing out of the bay. */
function pier(B: Builder, x: number, z: number) {
  const hx = GG.leg + GG.legHalf + 2.4,
    hz = 4.6;
  const s = new THREE.Shape();
  const r = hz;
  s.moveTo(-hx + r, -hz);
  s.lineTo(hx - r, -hz);
  s.absarc(hx - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-hx + r, hz);
  s.absarc(-hx + r, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  const h = 4.6 - BAY.bed;
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 2, curveSegments: 16 });
  g.rotateX(-Math.PI / 2);
  g.translate(x, BAY.bed, z);
  B.add("concrete", worldUv(g, 1));
  // the dark band at the waterline
  const band = new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: false, curveSegments: 16 });
  band.scale(1.015, 1.015, 1);
  band.rotateX(-Math.PI / 2);
  band.translate(x, BAY.water - 0.3, z);
  B.add("concreteDark", worldUv(band, 1));
}
