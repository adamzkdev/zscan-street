/**
 * INSCRIBE!'s worlds: what lies under and round each board, and its sky (the boards themselves and
 * what stands on their islands are in levels.ts and dress.ts).
 *
 * - SKY SLAB: the city at dusk seen from far above, soft in the haze (streets, roofs, cars' lights), a
 *   ring of taller towers whose roofs are the near layer, banks of cloud sliding under the board, the
 *   ZSTREET BLIMP circling below it, a low sun in a real sky.
 * - ZK CEMETERY: the same city asleep under a moon (a few lit windows, beacons), moonlit cloud, and
 *   the island grown out round the yard: lower terraces of grass with rows of graves, candles, a path.
 * - BAY PIER: the sea (swell, glints, pale shallows round the deck, clouds' shadows crossing),
 *   launches under way, the day's sky.
 *
 * All of it is decor: seeded by itself, moved by the clock handed in.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { rng } from "../../kit";
import { GEO, skyDome, skyline, toon } from "../../k3";
import { blimp, boats, cityBelow, cloudBank, far, lamp, sea, type Tick } from "./scape";

/** Where a light from (x, z) stands on the sky dome (its picture's degrees round). */
export const azOf = (x: number, z: number) => ((Math.atan2(z, -x) * 180) / Math.PI + 360) % 360;

const all =
  (...t: Tick[]): Tick =>
  (dt, now) => {
    for (const f of t) f(dt, now);
  };

/** SKY SLAB: dusk over the city (`y`: street level; `sun`: where the light comes from). */
export function slabWorld(s: THREE.Scene, y: number, sun: [number, number, number]): Tick {
  skyDome(s, {
    sky: ["#2a1f66", "#f3b29a"],
    ground: "#b893ad",
    clouds: 13,
    cloud: "#ffe3d3",
    cloudShade: "#b9809e",
    stars: 90,
    disc: { az: azOf(sun[0], sun[2]), el: 9, color: "#fff0cc", size: 9, glow: 6 },
    haze: 0.5,
    rnd: rng(0x51ab01),
  });
  const city = cityBelow(s, {
    y,
    seed: 0x51ab02,
    road: "#47406a",
    walk: "#6a6390",
    plot: "#575080",
    park: "#5a8a78",
    mark: "#cfc6ea",
    pool: "rgba(255,200,140,0.42)",
    walls: ["#8479aa", "#917aa2", "#7884b0", "#9b8098", "#858fb6"],
    roofs: ["#a79cc6", "#b49eac", "#98a6c6", "#bca6a2", "#9c96b8"],
    win: ["#ffdca6", "#514a74"],
    lit: 0.34,
    glow: 0.45,
    top: -22,
    ring: 46,
    clear: 26,
    cars: 70,
    beacon: "#ff6a5a",
  });
  // (the lane under the board kept clear: the hull and its jets stay in view from below)
  const low = cloudBank(s, { seed: 0x51ab03, n: 14, y: [-50, -30], r: 150, gap: 16, size: 1.7, color: "#f4e2e6", shade: "#4e3460", wind: 1.5 });
  const high = cloudBank(s, { seed: 0x51ab04, n: 7, y: [24, 46], r: 230, gap: 80, size: 2.6, color: "#ffe6da", shade: "#5a3468", wind: 0.8 });
  far(skyline(s, { r: 240, n: 84, y, rnd: rng(0x51ab05), tall: 0.9, night: true }));
  const ship = blimp(s, { y: -15, r: 27, speed: 2.1, hull: "#ece8e0", band: "#ff6b35", name: "ZSTREET", lights: true });
  return all(city, low, high, ship);
}

/**
 * ZK CEMETERY: night. The city asleep far below, moonlit cloud, the moon; and the island grown out
 * round the yard (`half`: the board's half width, `rim`: its rim's outer distance).
 */
export function cryptWorld(s: THREE.Scene, y: number, moon: [number, number, number], half: number, rim: number): Tick {
  const rnd = rng(0xc4f701);
  skyDome(s, {
    sky: ["#070620", "#2c2466"],
    ground: "#191640",
    stars: 800,
    band: true,
    disc: { az: azOf(moon[0], moon[2]), el: 30, moon: true, size: 9, glow: 4 },
    haze: 0.3,
    rnd: rng(0xc4f702),
  });
  const city = cityBelow(s, {
    y,
    seed: 0xc4f703,
    road: "#1a1838",
    walk: "#2a2754",
    plot: "#221f48",
    park: "#22403e",
    mark: "#5d58a4",
    pool: "rgba(150,140,255,0.3)",
    walls: ["#3a3672", "#34316a", "#403a7a", "#30366c"],
    roofs: ["#4c4888", "#454280", "#524c90", "#3e4680"],
    win: ["#ffe2a0", "#201d44"],
    lit: 0.14,
    glow: 0.9,
    top: -24,
    ring: 48,
    clear: 28,
    cars: 44,
    carC: ["#fff3d0", "#ff5a6a"],
    beacon: "#ff4a5a",
  });
  const cloud = cloudBank(s, { seed: 0xc4f704, n: 16, y: [-52, -30], r: 150, gap: 18, size: 1.8, color: "#7a78c0", shade: "#1c1a44", wind: 1.1 });
  far(skyline(s, { r: 240, n: 84, y, rnd: rng(0xc4f705), tall: 0.9, night: true }));

  // ---- the island's lower terraces: stepped ground round the yard (one draw), earth under them
  const M = new THREE.Matrix4(),
    P = new THREE.Vector3(),
    S = new THREE.Vector3(),
    Q = new THREE.Quaternion(),
    E = new THREE.Euler(),
    C = new THREE.Color();
  const ID = new THREE.Quaternion();
  const blocks: [string, number, number, number, number, number, number][] = [];
  const grass = ["#3f6a4c", "#38604a", "#456f50"];
  const earth = "#33282c";
  // (the yard's own grass ends at rim + 4: these start there, each step lower and a different depth)
  const X0 = rim + 4.0;
  const L = half + 3.4;
  const steps: { sx: number; z0: number; len: number; out: number; top: number }[] = [];
  for (const sx of [-1, 1]) {
    let z = -L;
    let i = 0;
    while (z < L) {
      const len = 3.2 + rnd() * 2.6;
      const out = 4.2 + rnd() * 3.4;
      const top = -0.75 - (i % 3) * 0.3;
      blocks.push([grass[i % 3], out, 0.3, len, sx * (X0 + out / 2), top - 0.15, z + len / 2]);
      blocks.push([earth, out - 0.3, 3.2 + rnd() * 2.4, len - 0.3, sx * (X0 + out / 2), top - 0.3 - 1.9, z + len / 2]);
      steps.push({ sx, z0: z, len, out, top });
      z += len;
      i++;
    }
  }
  // the front terrace (toward the camera), low: the yard's front wall stays in view
  {
    let x = -(X0 + 2);
    let i = 0;
    while (x < X0 + 2) {
      const len = 3.6 + rnd() * 3;
      const out = 2.6 + rnd() * 1.8;
      const top = -1.0 - (i % 2) * 0.3;
      blocks.push([grass[(i + 1) % 3], len, 0.3, out, x + len / 2, top - 0.15, rim + 0.3 + out / 2]);
      blocks.push([earth, len - 0.3, 2.6 + rnd() * 2, out - 0.3, x + len / 2, top - 0.3 - 1.5, rim + 0.3 + out / 2]);
      x += len;
      i++;
    }
  }
  const ground = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), blocks.length);
  blocks.forEach(([c, w, h, d, x, cy, z], i) => {
    ground.setMatrixAt(i, M.compose(P.set(x, cy, z), ID, S.set(w, h, d)));
    ground.setColorAt(i, C.set(c));
  });
  ground.raycast = () => {};
  s.add(ground);
  // ---- graves in rows on the side terraces (stones and crosses: one draw), a candle by some
  const CAPG = 64;
  const stones = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.14), toon("#77759a", "#0c0a16"), CAPG * 2);
  const candles = far(new THREE.InstancedMesh(GEO.box, lamp("#ffcf6a", 0.9), CAPG));
  const flame: number[] = [];
  let n = 0,
    nc = 0,
    ng = 0;
  for (const t of steps) {
    const nx = Math.floor((t.out - 1.2) / 1.7),
      nz = Math.floor((t.len - 0.6) / 2.1);
    for (let a = 0; a < nx; a++)
      for (let b = 0; b < nz; b++) {
        if (ng >= CAPG || rnd() < 0.3) continue;
        const x = t.sx * (X0 + 1.0 + a * 1.7 + rnd() * 0.2);
        const z = t.z0 + 0.9 + b * 2.1 + rnd() * 0.3;
        Q.setFromEuler(E.set((rnd() - 0.5) * 0.14, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.2));
        const h = 1.0 + rnd() * 0.5;
        stones.setMatrixAt(n++, M.compose(P.set(x, t.top + h / 2 - 0.05, z), Q, S.set(0.85, h, 0.26)));
        if (ng % 4 === 1) stones.setMatrixAt(n++, M.compose(P.set(x, t.top + h * 0.72, z), Q, S.set(1.3, 0.24, 0.27)));
        if (ng % 3 === 0) {
          flame.push(x + 0.45, t.top + 0.02, z + 0.5);
          nc++;
        }
        ng++;
      }
  }
  stones.count = n;
  candles.count = nc;
  stones.raycast = () => {};
  s.add(stones, candles);
  return all(city, cloud, (_dt, now) => {
    for (let i = 0; i < nc; i++) {
      const f = 0.16 + Math.sin(now * 13 + i * 2.3) * 0.03 + Math.sin(now * 8.1 + i) * 0.025;
      candles.setMatrixAt(i, M.compose(P.set(flame[i * 3], flame[i * 3 + 1] + f, flame[i * 3 + 2]), ID, S.set(f, f * 1.7, f)));
    }
    candles.instanceMatrix.needsUpdate = true;
  });
}

/** BAY PIER: the sea at `y`, the sky, launches crossing behind and in front of the deck. */
export function pierWorld(s: THREE.Scene, y: number, sun: [number, number, number], rim: number): Tick {
  skyDome(s, {
    sky: ["#2a78d6", "#c4e8ff"],
    ground: "#2f86ae",
    clouds: 16,
    cloud: "#ffffff",
    cloudShade: "#a9c6e2",
    disc: { az: azOf(sun[0], sun[2]), el: 38, color: "#fffbe6", size: 8, glow: 5 },
    haze: 0.45,
    rnd: rng(0x9e1201),
  });
  const water = sea(s, { y, seed: 0x9e1202, deep: "#1f7ba4", swell: "#4aa6c8", glint: "#e2f8ff", emissive: "#04202e", shoal: "#55c2cc", shoalR: rim + 22, shades: 5 });
  const launches = boats(s, {
    y,
    seed: 0x9e1203,
    list: [
      { x0: -44, x1: 40, z: -24, v: 2.6, hull: "#ffffff", top: "#ff6b35", len: 5.6 },
      { x0: -30, x1: 46, z: -34, v: 1.9, hull: "#f2ebe0", top: "#3ec6ff", len: 7 },
      { x0: -52, x1: 52, z: 19, v: 3.1, hull: "#ffffff", top: "#c4b1fc", len: 5 },
    ],
  });
  return all(water, launches);
}
