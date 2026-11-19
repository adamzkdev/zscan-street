/**
 * A city far below an arena (FORGERY GAP's by day and at sunset, LASER SWEEP's at night): blocks of
 * towers on a street grid in one static draw (every building's walls merged into one mesh, its windows
 * the same size whatever its height), the streets painted under them (one draw), traffic running along
 * the avenues (one draw). No colliders, no shadows of its own: it is the far layer, in the haze.
 */
import * as THREE from "three";
import { GEO, canvasTex, glow, toon, toonSteps } from "../../k3";
import type { Rnd } from "../../kit";

export interface CityOpts {
  /** The ground's height, the city's middle. */
  y: number;
  x?: number;
  z?: number;
  night?: boolean;
  /** Blocks each way from the middle, a block's side (m). */
  n?: number;
  pitch?: number;
  /** The highest a roof may stand at (x, z): what hangs over the city stays clear of it. */
  top: (x: number, z: number) => number;
  /** A tower's height: the least, the usual spread, a tall one's extra. */
  h?: [number, number, number];
  /** The walls' colours, the lots', the roads', the lines on them. */
  walls: string[];
  lot: string;
  road: string;
  line: string;
  park: string;
  rnd: Rnd;
  cars?: number;
}

/** A floor's height and a window's width (m): every wall is a whole number of them. */
const CELL = 3.4;

/** The windows: four by four on a tile, lit or not as the dice fall (the same tile for the light they give at night). */
function windowTex(rnd: Rnd, night: boolean, lightOnly: boolean) {
  const lit: boolean[] = [];
  for (let i = 0; i < 16; i++) lit.push(rnd() < (night ? 0.5 : 0.3));
  const t = canvasTex(
    64,
    64,
    (g) => {
      g.fillStyle = lightOnly ? "#000000" : "#ffffff";
      g.fillRect(0, 0, 64, 64);
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          const on = lit[j * 4 + i];
          if (lightOnly) g.fillStyle = on ? (i + j) % 3 ? "#ffd98a" : "#9fe8ff" : "#000000";
          else g.fillStyle = night ? (on ? "#ffe9b0" : "#241d3c") : on ? "#eaf7ff" : "#86a9d4";
          g.fillRect(i * 16 + 3, j * 16 + 4, 10, 9);
        }
    },
    true,
  );
  t.anisotropy = 4;
  return t;
}

/** The streets under a block of four by four lots: the roads, their lines, the lots' kerbs, a park and a square. */
function streetTex(o: CityOpts, parks: (i: number, j: number) => boolean) {
  const N = 4,
    S = 128;
  const t = canvasTex(
    N * S,
    N * S,
    (g) => {
      g.fillStyle = o.road;
      g.fillRect(0, 0, N * S, N * S);
      const rw = 22;
      // the centre lines, dashed
      g.fillStyle = o.line;
      for (let k = 0; k < N; k++) for (let d = 0; d < N * S; d += 16) (g.fillRect(k * S - 1.5, d + 3, 3, 9), g.fillRect(d + 3, k * S - 1.5, 9, 3));
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const x = i * S + rw / 2,
            y = j * S + rw / 2,
            w = S - rw;
          const park = parks(i, j);
          g.fillStyle = o.night ? "#3a3358" : "#d8d2c6";
          g.fillRect(x, y, w, w);
          g.fillStyle = park ? o.park : o.lot;
          g.fillRect(x + 5, y + 5, w - 10, w - 10);
          if (park) {
            // (a park: paths in a cross, trees in its corners)
            g.fillStyle = o.night ? "#4a4470" : "#e8dfc8";
            g.fillRect(x + w / 2 - 4, y + 5, 8, w - 10);
            g.fillRect(x + 5, y + w / 2 - 4, w - 10, 8);
            g.fillStyle = o.night ? "#1f5a48" : "#3f9a4a";
            for (const [tx, ty] of [
              [0.25, 0.25],
              [0.75, 0.25],
              [0.25, 0.75],
              [0.75, 0.75],
            ])
              g.fillRect(x + w * tx - 9, y + w * ty - 9, 18, 18);
          }
          // the street lamps at the corners (lit at night), the crossings
          g.fillStyle = o.night ? "#ffd27a" : "#f4f0e6";
          for (const [cx, cy] of [
            [x, y],
            [x + w, y],
            [x, y + w],
            [x + w, y + w],
          ])
            g.fillRect(cx - 3, cy - 3, 6, 6);
        }
    },
    true,
  );
  t.anisotropy = 8;
  return t;
}

/**
 * Build the city into `scene`; `update(time)` moves its traffic. The towers thin out and shrink away
 * from the middle, so the far ones sink into the fog instead of standing in a wall.
 */
export function city(scene: THREE.Scene, o: CityOpts) {
  const R = o.rnd;
  const n = o.n ?? 10,
    P = o.pitch ?? 17;
  const cx = o.x ?? 0,
    cz = o.z ?? 0;
  const [h0, h1, h2] = o.h ?? [10, 34, 40];
  const parks = (i: number, j: number) => (((i % 4) + 4) % 4 === 1 && ((j % 4) + 4) % 4 === 2) || (((i % 4) + 4) % 4 === 3 && ((j % 4) + 4) % 4 === 0);

  // ---- the ground: the streets, as far as the fog
  const st = streetTex(o, parks);
  const span = (2 * n + 12) * P;
  st.repeat.set(span / (4 * P), span / (4 * P));
  const ground = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: st }));
  ground.rotation.x = -Math.PI / 2;
  ground.scale.set(span, span, 1);
  // (the tile's corner on a crossroads, wherever the middle is)
  ground.position.set(cx, o.y, cz);
  ground.raycast = () => {};
  ground.userData.noShadow = true;
  scene.add(ground);

  // ---- the towers: one mesh, each wall a whole number of floors and windows
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [],
    col: number[] = [],
    idx: number[] = [];
  const c = new THREE.Color();
  const quad = (p: number[], nx: number, ny: number, nz: number, U: number, V: number, k: number) => {
    const b = pos.length / 3;
    pos.push(...p);
    for (let i = 0; i < 4; i++) (nor.push(nx, ny, nz), col.push(c.r * k, c.g * k, c.b * k));
    uv.push(0, 0, U, 0, U, V, 0, V);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const box = (x: number, z: number, w: number, d: number, y0: number, y1: number) => {
    const x0 = x - w / 2,
      x1 = x + w / 2,
      z0 = z - d / 2,
      z1 = z + d / 2;
    const U = w / (CELL * 4),
      D = d / (CELL * 4),
      V = (y1 - y0) / (CELL * 4);
    quad([x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], 0, 0, 1, U, V, 1);
    quad([x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0], 0, 0, -1, U, V, 1);
    quad([x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1], 1, 0, 0, D, V, 1);
    quad([x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], -1, 0, 0, D, V, 1);
    // (the roof: the wall's colour, no windows)
    quad([x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0], 0, 1, 0, 0, 0, 0.82);
  };
  const beacons: number[] = [];
  for (let j = -n; j < n; j++)
    for (let i = -n; i < n; i++) {
      if (parks(i, j)) continue;
      const x = cx + (i + 0.5) * P,
        z = cz + (j + 0.5) * P;
      const far = Math.hypot(i + 0.5, j + 0.5) / n;
      if (far > 1 || R() < 0.06 + far * 0.3) continue;
      const lot = P - 5.6;
      const w = Math.max(2, Math.round((lot * (0.62 + R() * 0.38)) / CELL)) * CELL,
        d = Math.max(2, Math.round((lot * (0.62 + R() * 0.38)) / CELL)) * CELL;
      const tall = R() < 0.14;
      let h = (h0 + R() * R() * h1 + (tall ? h2 * (0.5 + R() * 0.5) : 0)) * (1 - far * 0.45);
      h = Math.min(h, o.top(x, z) - o.y);
      h = Math.max(2, Math.round(h / CELL)) * CELL;
      c.set(o.walls[Math.floor(R() * o.walls.length)]);
      const ox = (R() - 0.5) * (lot - w),
        oz = (R() - 0.5) * (lot - d);
      box(x + ox, z + oz, w, d, o.y, o.y + h);
      // (a step back near the top of the big ones, a plant room on some roofs)
      if (h > 9 * CELL && w > 2 * CELL && d > 2 * CELL && o.y + h + 3 * CELL < o.top(x, z)) {
        box(x + ox, z + oz, w - 2 * CELL, d - 2 * CELL, o.y + h, o.y + h + 3 * CELL);
        beacons.push(x + ox, o.y + h + 3 * CELL + 1.2, z + oz);
      } else if (R() < 0.4) {
        c.multiplyScalar(0.7);
        box(x + ox + w * 0.18, z + oz - d * 0.15, CELL, CELL, o.y + h, o.y + h + 1.6);
      }
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const wr = Math.floor(R() * 1e6);
  // (the same dice for the windows and for their light)
  let a1 = wr,
    a2 = wr;
  const dice = (k: number) => () => {
    const s = k ? (a2 = (a2 * 16807 + 11) % 2147483647) : (a1 = (a1 * 16807 + 11) % 2147483647);
    return s / 2147483647;
  };
  const mat = new THREE.MeshToonMaterial({ map: windowTex(dice(0), !!o.night, false), gradientMap: toonSteps(), vertexColors: true });
  if (o.night) {
    mat.emissiveMap = windowTex(dice(1), true, true);
    mat.emissive.set("#ffffff");
    mat.emissiveIntensity = 0.9;
  }
  const towers = new THREE.Mesh(geo, mat);
  towers.raycast = () => {};
  towers.userData.noShadow = true;
  scene.add(towers);

  // ---- the roofs' beacons (red, blinking in turn), at night
  const NB = Math.min(24, beacons.length / 3);
  const bea = o.night && NB ? new THREE.InstancedMesh(GEO.box, glow("#ff3a5a"), NB) : null;
  if (bea) {
    bea.raycast = () => {};
    bea.frustumCulled = false;
    scene.add(bea);
  }

  // ---- the traffic: each car on its avenue, there and back for ever
  const NC = o.cars ?? 44;
  const cars = new THREE.InstancedMesh(GEO.box, o.night ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : toon("#ffffff"), NC);
  cars.raycast = () => {};
  cars.frustumCulled = false;
  cars.userData.noShadow = true;
  const DAY = ["#ff5a4a", "#ffd23f", "#3ec6ff", "#ffffff", "#8ee35b", "#ff8a3d", "#f4f0ff"];
  const lane = Array.from({ length: NC }, (_, i) => {
    const along = i % 2 === 0;
    const dir = i % 4 < 2 ? 1 : -1;
    const k = Math.floor(R() * (n * 1.2)) - Math.floor(n * 0.6);
    cars.setColorAt(i, c.set(o.night ? (dir > 0 ? "#fff3d0" : "#ff5a5a") : DAY[i % DAY.length]));
    return { along, dir, line: k * P + dir * 2.1, v: 7 + R() * 7, ph: R() * 400 };
  });
  scene.add(cars);
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3();
  const L = n * P * 1.5;
  return {
    update(time: number) {
      for (let i = 0; i < NC; i++) {
        const l = lane[i];
        const u = ((((l.ph + time * l.v) % (2 * L)) + 2 * L) % (2 * L)) - L;
        const a = u * l.dir;
        if (l.along) (v.set(cx + l.line, o.y + 0.8, cz + a), sc.set(2.2, o.night ? 0.5 : 1.5, 4.6));
        else (v.set(cx + a, o.y + 0.8, cz + l.line), sc.set(4.6, o.night ? 0.5 : 1.5, 2.2));
        cars.setMatrixAt(i, m4.compose(v, q, sc));
      }
      cars.instanceMatrix.needsUpdate = true;
      if (bea) {
        for (let i = 0; i < NB; i++) {
          const k = Math.sin(time * 2.4 + i * 1.7) > 0.1 ? 1.5 : 0.5;
          bea.setMatrixAt(i, m4.compose(v.set(beacons[i * 3], beacons[i * 3 + 1], beacons[i * 3 + 2]), q, sc.set(k, k, k)));
        }
        bea.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
