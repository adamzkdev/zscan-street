/**
 * The world round an arena (PROVE THE BLOCK, CHAIN STACK and PROOF OF DIG share it): what a level puts
 * far below and far round its play area, so it never floats in an empty sky. A city laid out in
 * blocks (its streets, its towers with their roofs and windows, its lamps, its traffic), a land of
 * voxel terraces, trees, a deck of clouds, a sea's swell, flags in the wind.
 *
 * Everything here is scenery: instanced (a draw or two per kind), out of the sun's shadow map (far
 * off, it neither casts nor receives), built with the caller's own cosmetic dice and moved from the
 * caller's clock. Nothing here touches a game's rules.
 */
import * as THREE from "three";
import { GEO, canvasTex, glow, toon, toonSteps } from "../../k3";

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const P = new THREE.Vector3();
const S = new THREE.Vector3();
const C = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** Scenery: never in the shadow map, never picked. */
function scenery<T extends THREE.Object3D>(m: T) {
  m.userData.noShadow = true;
  m.raycast = () => {};
  return m;
}

/** A flat ground far below (unlit: the fog fades it into the horizon). */
export function ground(parent: THREE.Object3D, y: number, color: string, r = 880) {
  const m = scenery(new THREE.Mesh(GEO.disc, glow(color)));
  m.rotation.x = -Math.PI / 2;
  m.scale.setScalar(r * 2);
  m.position.y = y;
  parent.add(m);
  return m;
}

// ---- a city in blocks ------------------------------------------------------------------------------

export interface CityLook {
  /** The streets, the blocks' pavements (one drawn per block), a park's green (or its snow). */
  street: string;
  lots: string[];
  park: string;
  /** The towers' walls (one drawn per tower), how dark their roofs are against them (0…1). */
  walls: string[];
  roof: number;
  /** A window lit and dark, the share lit, how much the lit ones shine (0: by day). */
  win: [string, string];
  lit: number;
  shine: number;
  /** Street lamps (none by day), the traffic's colours, the roofs' beacons (none: no beacons). */
  lamp?: string;
  cars: string[];
  beacon?: string;
  /** What a park grows (none: bare). */
  trees?: string[];
  /** Snow lying on every roof (its colour; none: bare roofs). */
  cap?: string;
}

/** ZStreet by day: pale stone and glass, green parks, no lamp lit. */
export const DAY_CITY: CityLook = {
  street: "#8496b0",
  lots: ["#c4cedc", "#d0d8e4", "#b8c4d4"],
  park: "#8fca7c",
  walls: ["#e9dccb", "#c9d6e6", "#f2c9a0", "#b9c7d8", "#ddd0f0", "#f0e6d0", "#a8c0dc"],
  roof: 0.22,
  win: ["#eef8ff", "#9fb4d0"],
  lit: 0.3,
  shine: 0,
  cars: ["#ffffff", "#ff6b35", "#ffd23f", "#3ec6ff", "#2b2560"],
  trees: ["#4fa652", "#68bc62"],
};
/** A city under snow by night (ZStreet in winter): blue-grey towers, warm windows, white roofs and pavements. */
export const SNOW_CITY: CityLook = {
  street: "#1c2f5e",
  lots: ["#9db3e0", "#abc0e8", "#91a8d8"],
  park: "#c0d0f0",
  walls: ["#4a5f8a", "#3a4c78", "#56709c", "#2f4068", "#61789f", "#44557f"],
  roof: 0.2,
  win: ["#ffe2a0", "#182446"],
  lit: 0.48,
  shine: 0.85,
  lamp: "#ffe0b0",
  cars: ["#fff3cf", "#ff5a5a", "#fff3cf"],
  beacon: "#ff4a5a",
  trees: ["#1f6a52", "#2a8a66"],
  cap: "#c9d7f2",
};

export interface CityOpts {
  y: number;
  /** The field of blocks (their centres from x0, z0 on, a `pitch` apart), a street's width. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  pitch?: number;
  street?: number;
  /** Keep the block centred here (false: left open: a river, the arena's own shadow). */
  keep?: (x: number, z: number) => boolean;
  /** The tallest a tower may be here (m). */
  tall: (x: number, z: number) => number;
  rnd: () => number;
  look: CityLook;
  /** How many cars, their size against life (far off they are drawn big enough to see). */
  cars?: number;
  carSize?: number;
  /** The share of blocks left as parks. */
  parks?: number;
}

/** A box standing on y = 0, one unit each way: its four walls (group 0) and its roof (group 1). */
function towerGeo() {
  const g = new THREE.BufferGeometry();
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[]) => {
    const k = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    nor.push(...n, ...n, ...n, ...n);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  quad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5], [0, 0, 1]);
  quad([0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5], [1, 0, 0]);
  quad([0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5], [0, 0, -1]);
  quad([-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5], [-1, 0, 0]);
  quad([-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5], [0, 1, 0]);
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, 24, 0);
  g.addGroup(24, 6, 1);
  return g;
}

/** The windows: 4 × 4 of them on a white wall (tinted per tower), `lit` of them on; `only`: the lit ones alone, on black (the night's glow). */
function windowTex(look: CityLook, on: boolean[], only: boolean) {
  return canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = only ? "#000000" : "#ffffff";
      g.fillRect(0, 0, 128, 128);
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          const lit = on[i + j * 4];
          if (only && !lit) continue;
          g.fillStyle = lit ? look.win[0] : look.win[1];
          g.fillRect(i * 32 + 7, j * 32 + 8, 18, 17);
        }
    },
    true,
  );
}

export interface City {
  /** Move the traffic, blink the beacons (`t`: the caller's clock, s). */
  tick(t: number): void;
}

/**
 * A city in blocks on a flat ground at `y`: the streets (a plane), a pavement or a park per block,
 * one to four towers on it (their windows a fixed size whatever the tower's, their roofs plain), a
 * setback on some, lamps at the corners by night, traffic along the streets, beacons on the tallest,
 * snow on the roofs in winter. Six to eight draws.
 */
export function cityGrid(parent: THREE.Object3D, o: CityOpts): City {
  const rnd = o.rnd;
  const L = o.look;
  const pitch = o.pitch ?? 30;
  const street = o.street ?? 8;
  const blk = pitch - street;
  const lots: [number, number, string][] = [];
  const tw: [number, number, number, number, number, string][] = [];
  const lamps: [number, number][] = [];
  const tips: [number, number, number][] = [];
  const trees: [number, number, number, string][] = [];
  const nx = Math.floor((o.x1 - o.x0) / pitch) + 1;
  const nz = Math.floor((o.z1 - o.z0) / pitch) + 1;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = o.x0 + i * pitch;
      const z = o.z0 + j * pitch;
      // (every block draws the same dice, kept or not: an opening moves no other block)
      const r = rnd();
      const r2 = rnd();
      const r3 = rnd();
      const r4 = rnd();
      if (o.keep && !o.keep(x, z)) continue;
      const top = o.tall(x, z);
      const park = r < (o.parks ?? 0.1) || top < 5;
      lots.push([x, z, park ? L.park : L.lots[Math.floor(r2 * L.lots.length)]]);
      if (L.lamp) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) lamps.push([x + sx * (blk / 2 + 1), z + sz * (blk / 2 + 1)]);
      if (park) {
        if (L.trees) for (let k = 0; k < 5; k++) trees.push([x + (((k * 0.37 + r3) % 1) - 0.5) * blk * 0.8, z + (((k * 0.61 + r4) % 1) - 0.5) * blk * 0.8, 2.6 + ((k * 0.29 + r2) % 1) * 2.2, L.trees[k % L.trees.length]]);
        continue;
      }
      const wall = () => L.walls[Math.floor(((r3 * 97 + tw.length * 0.618) % 1) * L.walls.length)];
      const put = (px: number, pz: number, w: number, d: number, h: number) => {
        const c = wall();
        tw.push([px, pz, w, d, h, c]);
        // (a setback on the taller ones: a narrower crown)
        if (h > top * 0.55 && (r4 * 7 + px * 0.13) % 1 < 0.5) tw.push([px, pz, w * 0.62, d * 0.62, h * 1.28, c]);
        if (L.beacon && h > top * 0.8 && top > 30) tips.push([px, h * ((r4 * 7 + px * 0.13) % 1 < 0.5 ? 1.28 : 1), pz]);
      };
      const kind = (r * 13.7) % 1;
      const hk = 0.35 + 0.65 * r2;
      if (kind < 0.34) put(x, z, blk * 0.8, blk * 0.8, top * hk);
      else if (kind < 0.7) {
        const along = r3 < 0.5;
        for (const s of [-1, 1]) put(x + (along ? s * blk * 0.26 : 0), z + (along ? 0 : s * blk * 0.26), blk * (along ? 0.42 : 0.84), blk * (along ? 0.84 : 0.42), top * (s < 0 ? hk : 0.3 + 0.6 * r4));
      } else for (let k = 0; k < 4; k++) put(x + (k % 2 ? 1 : -1) * blk * 0.26, z + (k < 2 ? 1 : -1) * blk * 0.26, blk * 0.42, blk * 0.42, top * (0.25 + 0.7 * ((r2 + k * 0.37) % 1)));
    }
  const cx = (o.x0 + o.x1) / 2;
  const cz = (o.z0 + o.z1) / 2;
  // the streets under it all, the pavements
  const base = scenery(new THREE.Mesh(GEO.plane, glow(L.street)));
  base.rotation.x = -Math.PI / 2;
  base.scale.set(o.x1 - o.x0 + pitch * 2, o.z1 - o.z0 + pitch * 2, 1);
  base.position.set(cx, o.y, cz);
  parent.add(base);
  const lot = scenery(new THREE.InstancedMesh(GEO.box, toon("#ffffff"), Math.max(1, lots.length)));
  lots.forEach(([x, z, c], i) => {
    M.compose(P.set(x, o.y + 0.2, z), Q.identity(), S.set(blk, 0.4, blk));
    lot.setMatrixAt(i, M);
    lot.setColorAt(i, C.set(c));
  });
  lot.count = lots.length;
  parent.add(lot);
  // the towers: walls with windows (a 4 × 4 tile, repeated to the tower's size), plain roofs
  const on: boolean[] = [];
  for (let k = 0; k < 16; k++) on.push(rnd() < L.lit);
  const wallM = new THREE.MeshToonMaterial({ map: windowTex(L, on, false), gradientMap: toonSteps() });
  if (L.shine > 0) ((wallM.emissive = new THREE.Color(1, 1, 1)), (wallM.emissiveMap = windowTex(L, on, true)), (wallM.emissiveIntensity = L.shine));
  wallM.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 win;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv * win.xy + win.zw;\n#endif\n#ifdef USE_EMISSIVEMAP\nvEmissiveMapUv = uv * win.xy + win.zw;\n#endif");
  };
  wallM.customProgramCacheKey = () => "vista-city";
  const roofM = new THREE.MeshToonMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(1 - L.roof), gradientMap: toonSteps() });
  const geo = towerGeo();
  const win = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, tw.length) * 4), 4);
  geo.setAttribute("win", win);
  const towers = scenery(new THREE.InstancedMesh(geo, [wallM, roofM], Math.max(1, tw.length)));
  tw.forEach(([x, z, w, d, h, c], i) => {
    M.compose(P.set(x, o.y + 0.4, z), Q.identity(), S.set(w, h, d));
    towers.setMatrixAt(i, M);
    towers.setColorAt(i, C.set(c));
    win.setXYZW(i, Math.max(1, Math.round(w / 3.2)) / 4, Math.max(1, Math.round(h / 3.6)) / 4, Math.floor(rnd() * 4) / 4, Math.floor(rnd() * 4) / 4);
  });
  towers.count = tw.length;
  parent.add(towers);
  if (L.cap && tw.length) {
    const cap = scenery(new THREE.InstancedMesh(GEO.box, toon(L.cap), tw.length));
    tw.forEach(([x, z, w, d, h], i) => {
      M.compose(P.set(x, o.y + 0.4 + h + 0.2, z), Q.identity(), S.set(w * 1.05, 0.6, d * 1.05));
      cap.setMatrixAt(i, M);
    });
    parent.add(cap);
  }
  // the parks' trees
  if (trees.length) {
    const tr = scenery(new THREE.InstancedMesh(GEO.cone, toon("#ffffff"), trees.length));
    trees.forEach(([x, z, s, c], i) => {
      M.compose(P.set(x, o.y + 0.4 + s * 0.75, z), Q.setFromAxisAngle(UP, i), S.set(s, s * 1.5, s));
      tr.setMatrixAt(i, M);
      tr.setColorAt(i, C.set(c));
    });
    parent.add(tr);
  }
  // the lamps (by night), the beacons
  if (L.lamp && lamps.length) {
    const lm = scenery(new THREE.InstancedMesh(GEO.box, glow(L.lamp), lamps.length));
    lamps.forEach(([x, z], i) => {
      M.compose(P.set(x, o.y + 1.2, z), Q.identity(), S.set(0.8, 0.8, 0.8));
      lm.setMatrixAt(i, M);
    });
    parent.add(lm);
  }
  let beaconM: THREE.MeshBasicMaterial | null = null;
  if (L.beacon && tips.length) {
    beaconM = new THREE.MeshBasicMaterial({ color: L.beacon });
    const bc = scenery(new THREE.InstancedMesh(GEO.box, beaconM, tips.length));
    tips.forEach(([x, h, z], i) => {
      M.compose(P.set(x, o.y + 0.4 + h + 0.9, z), Q.identity(), S.set(1.3, 1.8, 1.3));
      bc.setMatrixAt(i, M);
    });
    parent.add(bc);
  }
  // the traffic: each car on a street of its own, there and back for ever
  const nc = o.cars ?? 0;
  const k = o.carSize ?? 1;
  const car = nc ? scenery(new THREE.InstancedMesh(GEO.box, glow("#ffffff"), nc)) : null;
  const cd = new Float32Array(nc * 5);
  const lenX = nx * pitch;
  const lenZ = nz * pitch;
  for (let i = 0; i < nc; i++) {
    const alongX = rnd() < 0.5;
    const lane = alongX ? Math.floor(rnd() * (nz + 1)) : Math.floor(rnd() * (nx + 1));
    const dir = rnd() < 0.5 ? -1 : 1;
    cd.set([alongX ? 1 : 0, (alongX ? o.z0 : o.x0) + (lane - 0.5) * pitch + dir * street * 0.2, rnd(), dir * (7 + rnd() * 7), 0], i * 5);
    car!.setColorAt(i, C.set(L.cars[i % L.cars.length]));
  }
  if (car) ((car.frustumCulled = false), parent.add(car));
  const beacon = new THREE.Color(L.beacon ?? "#ffffff");
  const tick = (t: number) => {
    if (car) {
      for (let i = 0; i < nc; i++) {
        const alongX = cd[i * 5] > 0;
        const len = alongX ? lenX : lenZ;
        const u = ((((cd[i * 5 + 2] * len + cd[i * 5 + 3] * t) % len) + len) % len) - pitch / 2;
        if (alongX) (P.set(o.x0 + u, o.y + 0.7 * k, cd[i * 5 + 1]), S.set(2.6 * k, 1.1 * k, 1.4 * k));
        else (P.set(cd[i * 5 + 1], o.y + 0.7 * k, o.z0 + u), S.set(1.4 * k, 1.1 * k, 2.6 * k));
        M.compose(P, Q.identity(), S);
        car.setMatrixAt(i, M);
      }
      car.instanceMatrix.needsUpdate = true;
    }
    // (the beacons: a slow blink, all together, as on a real skyline)
    if (beaconM) beaconM.color.copy(beacon).multiplyScalar(t % 1.6 < 0.8 ? 1 : 0.25);
  };
  tick(0);
  return { tick };
}

// ---- land ------------------------------------------------------------------------------------------

/**
 * A land of voxel terraces: a grid of square columns `cell` wide from `y − deep` up to `y + h(x, z)`
 * (null: no column there: water, a gap), each in its own colour. One draw.
 */
export function terrain(
  parent: THREE.Object3D,
  o: { x0: number; x1: number; z0: number; z1: number; cell: number; y: number; deep?: number; h: (x: number, z: number) => number | null; c: (x: number, z: number, h: number) => string; lit?: boolean },
) {
  const cols: [number, number, number, string][] = [];
  for (let z = o.z0; z <= o.z1; z += o.cell)
    for (let x = o.x0; x <= o.x1; x += o.cell) {
      const h = o.h(x, z);
      if (h !== null) cols.push([x, z, h, o.c(x, z, h)]);
    }
  const deep = o.deep ?? 6;
  const mesh = scenery(new THREE.InstancedMesh(GEO.box, o.lit ? glow("#ffffff") : toon("#ffffff"), Math.max(1, cols.length)));
  cols.forEach(([x, z, h, c], i) => {
    M.compose(P.set(x, o.y + (h - deep) / 2, z), Q.identity(), S.set(o.cell, h + deep, o.cell));
    mesh.setMatrixAt(i, M);
    mesh.setColorAt(i, C.set(c));
  });
  mesh.count = cols.length;
  parent.add(mesh);
  return mesh;
}

/** Trees (x, y of the foot, z, size, colour): a pyramid of leaves each, a snowy or lighter tip on top. One draw. */
export function trees(parent: THREE.Object3D, list: { x: number; y: number; z: number; s: number; c: string; tip?: string }[]) {
  const mesh = scenery(new THREE.InstancedMesh(GEO.cone, toon("#ffffff"), Math.max(1, list.length * 2)));
  list.forEach((t, i) => {
    Q.setFromAxisAngle(UP, i * 1.3);
    M.compose(P.set(t.x, t.y + t.s * 0.8, t.z), Q, S.set(t.s, t.s * 1.6, t.s));
    mesh.setMatrixAt(i * 2, M);
    mesh.setColorAt(i * 2, C.set(t.c));
    M.compose(P.set(t.x, t.y + t.s * 1.55, t.z), Q, S.set(t.s * 0.62, t.s * 1.0, t.s * 0.62));
    mesh.setMatrixAt(i * 2 + 1, M);
    mesh.setColorAt(i * 2 + 1, C.set(t.tip ?? t.c).multiplyScalar(t.tip ? 1 : 1.18));
  });
  mesh.count = list.length * 2;
  parent.add(mesh);
  return mesh;
}

/**
 * Boxes that never move (a bridge, a pier, a monument, a row of far hills): one draw, lit or unlit.
 * Each: colour, size (w, h, d), centre (x, y, z), a turn round y.
 */
export function boxes(parent: THREE.Object3D, list: [string, number, number, number, number, number, number, number?][], lit = false) {
  const mesh = scenery(new THREE.InstancedMesh(GEO.box, lit ? glow("#ffffff") : toon("#ffffff"), Math.max(1, list.length)));
  list.forEach(([c, w, h, d, x, y, z, ry], i) => {
    M.compose(P.set(x, y, z), Q.setFromAxisAngle(UP, ry ?? 0), S.set(w, h, d));
    mesh.setMatrixAt(i, M);
    mesh.setColorAt(i, C.set(c));
  });
  mesh.count = list.length;
  parent.add(mesh);
  return mesh;
}

// ---- air and water -----------------------------------------------------------------------------------

export interface Drift {
  tick(t: number): void;
}

/**
 * A deck of voxel clouds drifting along x through a box (they come back in at the other side): `n`
 * clouds of a few flat-bottomed puffs each. Unlit, in `color` with a shaded underside. One draw.
 */
export function cloudDeck(
  parent: THREE.Object3D,
  o: { n: number; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; rnd: () => number; color: string; shade?: string; speed?: number; size?: number; opacity?: number; fog?: boolean },
): Drift {
  const rnd = o.rnd;
  const size = o.size ?? 1;
  const puffs: number[] = [];
  for (let i = 0; i < o.n; i++) {
    const x = o.x0 + rnd() * (o.x1 - o.x0);
    const y = o.y0 + rnd() * (o.y1 - o.y0);
    const z = o.z0 + rnd() * (o.z1 - o.z0);
    const v = (o.speed ?? 1) * (0.6 + rnd() * 0.8);
    const parts = 3 + Math.floor(rnd() * 3);
    const w = (9 + rnd() * 9) * size;
    for (let k = 0; k < parts; k++) {
      const u = (k + 0.5) / parts - 0.5;
      const pw = (w / parts) * (1.5 + rnd() * 0.5);
      const ph = (2.2 + Math.cos(u * Math.PI) * 2.6 + rnd()) * size;
      // (flat-bottomed: every puff stands on the cloud's base)
      puffs.push(x + u * w, y + ph / 2, z + (rnd() - 0.5) * 2 * size, pw, ph, (5 + rnd() * 4) * size, v, 0);
      // (its shaded underside: a thin darker slab under it)
      puffs.push(x + u * w, y - 0.3 * size, z, pw * 0.96, 0.6 * size, 5 * size, v, 1);
    }
  }
  const n = puffs.length / 8;
  const op = o.opacity ?? 1;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: op < 1, opacity: op, depthWrite: op >= 1, fog: o.fog ?? true });
  const mesh = scenery(new THREE.InstancedMesh(GEO.box, mat, Math.max(1, n)));
  mesh.count = n;
  mesh.frustumCulled = false;
  const cA = new THREE.Color(o.color);
  const cB = new THREE.Color(o.shade ?? o.color).multiplyScalar(o.shade ? 1 : 0.8);
  for (let i = 0; i < n; i++) mesh.setColorAt(i, puffs[i * 8 + 7] ? cB : cA);
  parent.add(mesh);
  const span = o.x1 - o.x0;
  const tick = (t: number) => {
    for (let i = 0; i < n; i++) {
      const x = o.x0 + ((((puffs[i * 8] - o.x0 + puffs[i * 8 + 6] * t) % span) + span) % span);
      M.compose(P.set(x, puffs[i * 8 + 1], puffs[i * 8 + 2]), Q.identity(), S.set(puffs[i * 8 + 3], puffs[i * 8 + 4], puffs[i * 8 + 5]));
      mesh.setMatrixAt(i, M);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  tick(0);
  return { tick };
}

/**
 * A sea's swell: long flat crests rolling along z over a field (each swells, rolls on a little and
 * sinks back), in `color`. Unlit. One draw.
 */
export function swell(
  parent: THREE.Object3D,
  o: { n: number; x0: number; x1: number; z0: number; z1: number; y: number; rnd: () => number; color: string; len?: [number, number]; wide?: number; speed?: number; opacity?: number },
): Drift {
  const rnd = o.rnd;
  const d = new Float32Array(o.n * 5);
  for (let i = 0; i < o.n; i++) d.set([o.x0 + rnd() * (o.x1 - o.x0), o.z0 + rnd() * (o.z1 - o.z0), (o.len?.[0] ?? 6) + rnd() * ((o.len?.[1] ?? 16) - (o.len?.[0] ?? 6)), rnd() * 9, 3.5 + rnd() * 3], i * 5);
  const op = o.opacity ?? 1;
  const mesh = scenery(new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: o.color, transparent: op < 1, opacity: op, depthWrite: op >= 1 }), o.n));
  mesh.frustumCulled = false;
  parent.add(mesh);
  const wide = o.wide ?? 0.9;
  const v = o.speed ?? 1.2;
  const tick = (t: number) => {
    for (let i = 0; i < o.n; i++) {
      const life = d[i * 5 + 4];
      const ph = ((t + d[i * 5 + 3]) % life) / life;
      const k = Math.sin(ph * Math.PI);
      M.compose(P.set(d[i * 5], o.y, d[i * 5 + 1] + ph * v * life), Q.identity(), S.set(d[i * 5 + 2] * (0.5 + 0.5 * k), 0.08, wide * k));
      mesh.setMatrixAt(i, M);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  tick(0);
  return { tick };
}

/**
 * Flags in the wind: each a pole's worth of cloth in five strips that ripple from the hoist out (x, y
 * of its middle, z, the way it flies (a turn round y), its size, its colour, a stripe's). One draw.
 */
export function flags(parent: THREE.Object3D, list: { x: number; y: number; z: number; ry?: number; w: number; h: number; c: string; c2?: string }[]): Drift {
  const N = 5;
  const mesh = scenery(new THREE.InstancedMesh(GEO.box, toon("#ffffff"), Math.max(1, list.length * N)));
  mesh.count = list.length * N;
  mesh.frustumCulled = false;
  list.forEach((f, i) => {
    for (let k = 0; k < N; k++) mesh.setColorAt(i * N + k, C.set(f.c2 && k % 2 ? f.c2 : f.c));
  });
  parent.add(mesh);
  const tick = (t: number) => {
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const ry = f.ry ?? 0;
      const cs = Math.cos(ry);
      const sn = Math.sin(ry);
      const sw = f.w / N;
      for (let k = 0; k < N; k++) {
        // (the ripple grows toward the fly end)
        const a = Math.sin(t * 5.2 - k * 1.05 + i * 1.7) * 0.11 * (k + 0.6);
        const u = (k + 0.5) * sw;
        E.set(0, ry + Math.cos(t * 5.2 - k * 1.05 + i * 1.7) * 0.35, 0);
        M.compose(P.set(f.x + cs * u - sn * a, f.y + Math.sin(t * 2.1 + i) * 0.02 * k, f.z - sn * u - cs * a), Q.setFromEuler(E), S.set(sw * 1.08, f.h, 0.05));
        mesh.setMatrixAt(i * N + k, M);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  tick(0);
  return { tick };
}

/** Lights that blink on their own beat (buoys, masts, cranes): x, y, z, size, colour, its beat's offset. One draw. */
export function blinkers(parent: THREE.Object3D, list: [number, number, number, number, string, number][]): Drift {
  const mesh = scenery(new THREE.InstancedMesh(GEO.box, glow("#ffffff"), Math.max(1, list.length)));
  mesh.count = list.length;
  mesh.frustumCulled = false;
  const cols = list.map((l) => new THREE.Color(l[4]));
  list.forEach(([x, y, z, s], i) => {
    M.compose(P.set(x, y, z), Q.identity(), S.set(s, s, s));
    mesh.setMatrixAt(i, M);
    mesh.setColorAt(i, cols[i]);
  });
  parent.add(mesh);
  const tick = (t: number) => {
    for (let i = 0; i < list.length; i++) mesh.setColorAt(i, C.copy(cols[i]).multiplyScalar((t + list[i][5]) % 1.4 < 0.5 ? 1 : 0.22));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  return { tick };
}
