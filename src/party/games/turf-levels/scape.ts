/**
 * The world round an arena, for INSCRIBE!'s boards and MEMPOOL RUSH's floors: the city seen from above
 * (streets, roofs, traffic), banks of cloud, an airship, a sea with its swell. All of it far decor:
 * instanced, no colliders, out of the sun's shadow map, built on its own seeded random and moved by the
 * clock it is handed (never the game's random stream, never the wall clock).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FONT, rng } from "../../kit";
import { GEO, canvasTex, toon, toonSteps } from "../../k3";
import { markGlow } from "../../post";

export type Tick = (dt: number, now: number) => void;

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const P = new THREE.Vector3();
const S = new THREE.Vector3();
const C = new THREE.Color();
const E = new THREE.Euler();
const IDENT = new THREE.Quaternion();

/** Far decor: nothing aims at it, it casts and takes no cast shadow (shadows.ts), it is never culled piecemeal. */
export function far<T extends THREE.Mesh>(m: T): T {
  m.raycast = () => {};
  m.userData.noShadow = true;
  m.frustumCulled = false;
  return m;
}

/** An unlit material that feeds the bloom (a lamp, a sign, a window): `k` how much of it glows. */
export function lamp(color: THREE.ColorRepresentation, k = 1) {
  return markGlow(new THREE.MeshBasicMaterial({ color }), k);
}

// ---- the city below --------------------------------------------------------------------------------

export interface CityLook {
  /** Street level (world y) and the seed of its layout. */
  y: number;
  seed: number;
  /** The asphalt, the pavements, the plots under the towers, the parks, the lane marks. */
  road: string;
  walk: string;
  plot: string;
  park: string;
  mark: string;
  /** The street lamps' pools on the pavements ("" for none: full day). */
  pool: string;
  /** The towers' walls, their roofs. */
  walls: string[];
  roofs: string[];
  /** Windows: lit, dark, the share lit, how much the lit ones glow (0: day). */
  win: [string, string];
  lit: number;
  glow: number;
  /** Lots across (each 16 m): the city's span. */
  lots?: number;
  /** The towers' tops (world y): the tallest stand in a ring `ring` m from the middle, none under the arena (`clear` m). */
  top: number;
  ring: number;
  clear: number;
  /** Cars on the avenues: how many, head and tail lights. */
  cars?: number;
  carC?: [string, string];
  /** Beacons on the tall roofs (they blink). */
  beacon?: string;
  /** Signs in lights on the tall roofs behind and beside the arena, tilted up at the camera: their words and colours. */
  signs?: { s: string; c: string }[];
}

const LOT = 16;
const ROAD = 4.4;

/** The streets as a map: 4 × 4 lots (64 m) that tile, crisp at the height the games fly at. */
function streetTex(o: CityLook, rnd: () => number) {
  const N = 1024;
  const u = N / 64;
  const tex = canvasTex(
    N,
    N,
    (g) => {
      g.fillStyle = o.road;
      g.fillRect(0, 0, N, N);
      const lot = LOT * u,
        half = (ROAD / 2) * u;
      // the lots: a pavement, the plot inside it (a park on two of the sixteen)
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          const x = i * lot + half,
            y = j * lot + half,
            w = lot - half * 2;
          g.fillStyle = o.walk;
          g.fillRect(x, y, w, w);
          const park = isPark(i, j);
          g.fillStyle = park ? o.park : o.plot;
          g.fillRect(x + 14, y + 14, w - 28, w - 28);
          if (park) {
            // paths across it, a pond, trees as round dots
            g.fillStyle = o.walk;
            g.fillRect(x + w / 2 - 5, y + 14, 10, w - 28);
            g.fillRect(x + 14, y + w / 2 - 5, w - 28, 10);
            g.fillStyle = "rgba(120,200,255,0.55)";
            g.beginPath();
            g.arc(x + w * 0.7, y + w * 0.3, 16, 0, Math.PI * 2);
            g.fill();
            for (let k = 0; k < 16; k++) {
              const tx = x + 26 + rnd() * (w - 52),
                ty = y + 26 + rnd() * (w - 52);
              if (Math.abs(tx - x - w / 2) < 12 || Math.abs(ty - y - w / 2) < 12) continue;
              g.fillStyle = "rgba(0,0,0,0.22)";
              g.beginPath();
              g.arc(tx + 3, ty + 3, 9, 0, Math.PI * 2);
              g.fill();
              g.fillStyle = k % 3 ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.28)";
              g.beginPath();
              g.arc(tx, ty, 9, 0, Math.PI * 2);
              g.fill();
            }
          }
        }
      // the lane marks down the middle of every street, zebra crossings at the corners
      g.fillStyle = o.mark;
      for (let i = 0; i < 4; i++) {
        const c = i * lot;
        for (let d = half + 26; d < lot - half - 26; d += 30)
          for (let j = 0; j < 4; j++) {
            g.fillRect(c - 2, j * lot + d, 4, 16);
            g.fillRect(j * lot + d, c - 2, 16, 4);
            // (the street on the tile's edge: its other half is the far edge's)
            if (i === 0) (g.fillRect(N - 2, j * lot + d, 4, 16), g.fillRect(j * lot + d, N - 2, 16, 4));
          }
      }
      g.globalAlpha = 0.7;
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++)
          for (const s of [-1, 1])
            for (let k = -3; k <= 3; k++) {
              const cx = i * lot,
                cy = j * lot;
              wrapRect(g, N, cx + k * 9 - 2.5, cy + s * (half + 12) - 9, 5, 18);
              wrapRect(g, N, cx + s * (half + 12) - 9, cy + k * 9 - 2.5, 18, 5);
            }
      g.globalAlpha = 1;
      // the street lamps' pools along the pavements
      if (o.pool) {
        g.globalCompositeOperation = "lighter";
        for (let j = 0; j < 4; j++)
          for (let i = 0; i < 4; i++)
            for (let k = 0; k < 4; k++) {
              const d = half + 6;
              const along = ((k + 0.5) / 4) * lot;
              for (const [px, py] of [
                [i * lot + d, j * lot + along],
                [i * lot + along, j * lot + d],
              ]) {
                const gr = g.createRadialGradient(px, py, 1, px, py, 30);
                gr.addColorStop(0, o.pool);
                gr.addColorStop(1, "rgba(0,0,0,0)");
                g.fillStyle = gr;
                g.fillRect(px - 30, py - 30, 60, 60);
              }
            }
        g.globalCompositeOperation = "source-over";
      }
    },
    true,
  );
  tex.anisotropy = 8;
  return tex;
}

/** A rect drawn on a tiling canvas: its part past an edge comes back on the other side. */
function wrapRect(g: CanvasRenderingContext2D, n: number, x: number, y: number, w: number, h: number) {
  for (const ox of [0, n, -n]) for (const oy of [0, n, -n]) if (x + ox < n && x + ox + w > 0 && y + oy < n && y + oy + h > 0) g.fillRect(x + ox, y + oy, w, h);
}

const isPark = (i: number, j: number) => {
  const a = ((i % 4) + 4) % 4,
    b = ((j % 4) + 4) % 4;
  return (a === 1 && b === 2) || (a === 3 && b === 0);
};

/** The towers' wall: rows of windows, some lit; `only`: the lit ones alone on black (what glows). */
function windowTex(o: CityLook, lit: boolean[], only: boolean) {
  const t = canvasTex(
    64,
    64,
    (g) => {
      g.fillStyle = only ? "#000" : "#fff";
      g.fillRect(0, 0, 64, 64);
      let i = 0;
      for (let y = 5; y < 64; y += 16)
        for (let x = 4; x < 64; x += 16, i++) {
          if (only && !lit[i]) continue;
          g.fillStyle = lit[i] ? o.win[0] : o.win[1];
          g.fillRect(x, y, 9, 8);
        }
    },
    true,
  );
  t.anisotropy = 4;
  return t;
}

/**
 * The city under a floating arena, as the play camera sees it from far above: a street map on the
 * ground, a tower on every lot (windows on its walls by the storey, a flat roof and what stands on it),
 * the tallest in a ring round the arena so their roofs are the near layer, cars on the avenues, beacons
 * blinking on the high roofs. Six draws. Returns its clock.
 */
export function cityBelow(scene: THREE.Scene, o: CityLook): Tick {
  const rnd = rng(o.seed);
  const G = o.lots ?? 24;
  const span = G * LOT;
  // the ground: the street map, tiled as far as the fog goes
  const map = streetTex(o, rnd);
  const reach = 2048;
  map.repeat.set(reach / 64, reach / 64);
  // (the tile's corner on a crossing: the lots sit between the streets)
  const ground = far(new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map, gradientMap: toonSteps() })));
  ground.rotation.x = -Math.PI / 2;
  ground.scale.set(reach, reach, 1);
  ground.position.y = o.y;
  scene.add(ground);

  // the towers: one per lot, none on a park; their windows repeat by the storey (an instanced attribute)
  const lit: boolean[] = [];
  for (let k = 0; k < 16; k++) lit.push(rnd() < o.lit);
  const wallMat = new THREE.MeshToonMaterial({
    map: windowTex(o, lit, false),
    gradientMap: toonSteps(),
    emissive: o.glow > 0 ? new THREE.Color(1, 1, 1).multiplyScalar(o.glow) : new THREE.Color(0),
    emissiveMap: o.glow > 0 ? windowTex(o, lit, true) : null,
  });
  wallMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aRep;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv *= aRep;\n#endif\n#ifdef USE_EMISSIVEMAP\nvEmissiveMapUv *= aRep;\n#endif");
  };
  wallMat.customProgramCacheKey = () => "scape-towers";
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const cap = G * G;
  const rep = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
  wallGeo.setAttribute("aRep", rep);
  const walls = far(new THREE.InstancedMesh(wallGeo, wallMat, cap));
  const roofs = far(new THREE.InstancedMesh(GEO.box, toon("#ffffff"), cap));
  const props = far(new THREE.InstancedMesh(GEO.box, toon("#ffffff"), cap * 3));
  const NBE = 40;
  const beacons = o.beacon ? far(new THREE.InstancedMesh(GEO.box, lamp(o.beacon), NBE)) : null;
  const beaconAt: number[] = [];
  let n = 0,
    np = 0;
  const tall: { x: number; y: number; z: number; h: number; d: number }[] = [];
  for (let j = 0; j < G; j++)
    for (let i = 0; i < G; i++) {
      // (every lot draws the same randoms, built on or not: the layout does not shift with the options)
      const r1 = rnd(),
        r2 = rnd(),
        r3 = rnd(),
        r4 = rnd(),
        r5 = rnd();
      const li = i - G / 2,
        lj = j - G / 2;
      if (isPark(li, lj)) continue;
      const x = (li + 0.5) * LOT,
        z = (lj + 0.5) * LOT;
      const d = Math.hypot(x, z);
      // how high: low under the arena, a ring of tall ones round it, lower again toward the horizon
      const room = o.top - o.y;
      const k = d < o.clear ? 0.16 + 0.16 * r1 : Math.exp(-Math.pow((d - o.ring) / (o.ring * 0.75), 2)) * (0.5 + 0.5 * r1) + 0.12 + 0.2 * r2 * r2;
      const h = Math.max(5, room * Math.min(1, k));
      const w = 8.5 + r3 * 2.8,
        dd = 8.5 + r4 * 2.8;
      walls.setMatrixAt(n, M.compose(P.set(x, o.y + h / 2, z), IDENT, S.set(w, h, dd)));
      walls.setColorAt(n, C.set(o.walls[Math.floor(r5 * o.walls.length) % o.walls.length]));
      // (four windows a repeat: 10 m across, four storeys up)
      rep.setXY(n, 1, Math.max(1, Math.round(h / 12.8)));
      // the roof: a slab a hand wider than the walls, in its own colour
      const rc = o.roofs[(i * 7 + j * 3) % o.roofs.length];
      roofs.setMatrixAt(n, M.compose(P.set(x, o.y + h + 0.3, z), IDENT, S.set(w + 0.5, 0.6, dd + 0.5)));
      roofs.setColorAt(n, C.set(rc));
      // what stands on it: a stair hut, cooling units, on some a tank
      const top = o.y + h + 0.6;
      const put = (c: THREE.ColorRepresentation, sx: number, sy: number, sz: number, ox: number, oz: number) => {
        props.setMatrixAt(np, M.compose(P.set(x + ox, top + sy / 2, z + oz), IDENT, S.set(sx, sy, sz)));
        props.setColorAt(np++, C.set(c));
      };
      put(C.set(rc).multiplyScalar(0.72).getHex(), 2.6, 1.8, 2.6, (r1 - 0.5) * (w - 4), (r2 - 0.5) * (dd - 4));
      put("#d9dde6", 1.7, 0.9, 1.2, (r3 - 0.5) * (w - 3), (r5 - 0.5) * (dd - 3));
      if (r4 > 0.45) put(r4 > 0.75 ? "#7fd1c2" : "#c9a57a", 2.0, 0.5, 3.2, (r5 - 0.5) * (w - 4), (r1 - 0.5) * (dd - 5));
      if (h > room * 0.55) tall.push({ x, y: top, z, h, d: dd });
      n++;
    }
  walls.count = roofs.count = n;
  props.count = np;
  scene.add(walls, roofs, props);
  tall.sort((a, b) => b.h - a.h);
  if (o.signs?.length) scene.add(roofSigns(o.signs, tall));
  if (beacons) {
    // a mast and its light on the highest roofs
    const m = Math.min(NBE, tall.length);
    for (let k = 0; k < m; k++) beaconAt.push(tall[k].x, tall[k].y + 3.2, tall[k].z);
    beacons.count = m;
    scene.add(beacons);
  }

  // the cars: lights sliding along the avenues, each on its lane
  const NC = o.cars ?? 0;
  const cars = NC ? far(new THREE.InstancedMesh(GEO.box, lamp("#ffffff", 0.5), NC)) : null;
  const car: { road: number; along: boolean; dir: number; v: number; s: number }[] = [];
  if (cars) {
    const [head, tail] = o.carC ?? ["#fff3d0", "#ff4a3a"];
    for (let k = 0; k < NC; k++) {
      const dir = k % 2 ? 1 : -1;
      // (the avenues near the arena: the ones the camera looks down on)
      car.push({ road: Math.round((rnd() - 0.5) * 12), along: rnd() < 0.5, dir, v: 9 + rnd() * 8, s: rnd() * span });
      cars.setColorAt(k, C.set(dir > 0 ? head : tail));
    }
    scene.add(cars);
  }
  return (_dt, now) => {
    if (cars)
      for (let k = 0; k < NC; k++) {
        const c = car[k];
        const s = ((((c.s + c.v * now * c.dir) % span) + span) % span) - span / 2;
        const lane = c.road * LOT + c.dir * 1.1;
        if (c.along) M.compose(P.set(s, o.y + 0.5, lane), IDENT, S.set(3.6, 1, 1.7));
        else M.compose(P.set(lane, o.y + 0.5, s), IDENT, S.set(1.7, 1, 3.6));
        cars.setMatrixAt(k, M);
      }
    if (cars) cars.instanceMatrix.needsUpdate = true;
    if (beacons) {
      for (let k = 0; k < beacons.count; k++) {
        // (each on its own beat: a slow blink, never all at once)
        const on = (now * 0.9 + k * 0.37) % 1 < 0.45;
        const s = on ? 1.1 : 0.35;
        beacons.setMatrixAt(k, M.compose(P.set(beaconAt[k * 3], beaconAt[k * 3 + 1], beaconAt[k * 3 + 2]), IDENT, S.set(s, s, s)));
      }
      beacons.instanceMatrix.needsUpdate = true;
    }
  };
}

/**
 * Signs in lights on the high roofs the play camera looks down on (behind the arena and on its flanks),
 * each leaning back to face it: one draw, their words on one picture.
 */
function roofSigns(signs: { s: string; c: string }[], tall: { x: number; y: number; z: number; d: number }[]) {
  const n = signs.length;
  const ROW = 128;
  const tex = canvasTex(1024, ROW * n, (g) => {
    signs.forEach((sg, i) => {
      const y = i * ROW;
      g.fillStyle = "#15101f";
      g.fillRect(0, y, 1024, ROW);
      g.strokeStyle = sg.c;
      g.lineWidth = 8;
      g.strokeRect(10, y + 10, 1004, ROW - 20);
      g.font = `900 72px ${FONT}`;
      const fit = Math.min(72, (72 * 930) / Math.max(1, g.measureText(sg.s).width));
      g.font = `900 ${fit}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      // (a tube of light: its colour, a paler core)
      g.fillStyle = sg.c;
      g.fillText(sg.s, 512, y + ROW / 2 + 4);
      g.globalAlpha = 0.55;
      g.fillStyle = "#ffffff";
      g.fillText(sg.s, 512, y + ROW / 2 + 2);
      g.globalAlpha = 1;
    });
  });
  tex.anisotropy = 8;
  // (the roofs in the camera's view: behind the arena, or out on a flank; no two on one tower)
  const spots = tall.filter((t) => t.z < -10 && t.z > -62 && Math.abs(t.x) < 52).slice(0, n);
  const parts = spots.map((t, i) => {
    const q = new THREE.PlaneGeometry(11, 2.9);
    const uv = q.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / n);
    q.rotateX(-0.9);
    q.translate(t.x, t.y + 2.0, t.z - t.d / 2 + 1.6);
    return q;
  });
  const mesh = far(new THREE.Mesh(parts.length ? mergeGeometries(parts)! : new THREE.BufferGeometry(), markGlow(new THREE.MeshBasicMaterial({ map: tex }), 0.55)));
  for (const q of parts) q.dispose();
  return mesh;
}

// ---- clouds ----------------------------------------------------------------------------------------

export interface CloudLook {
  seed: number;
  n: number;
  /** Where: a band of heights, the square they drift in (± m), a lane along the wind kept clear (|z| under `gap`). */
  y: [number, number];
  r: number;
  gap?: number;
  /** Their size (× a puff of ~6 m), their colour and the shade it glows with at dusk. */
  size: number;
  color: string;
  shade: string;
  /** The wind: m/s along x. */
  wind: number;
}

/**
 * A bank of chunky clouds adrift (one draw): each a few flat-bottomed puffs; they slide with the wind
 * and come back round on the other side.
 */
export function cloudBank(scene: THREE.Scene, o: CloudLook): Tick {
  const rnd = rng(o.seed);
  const PUFFS = 4;
  const mesh = far(new THREE.InstancedMesh(GEO.box, toon(o.color, o.shade), o.n * PUFFS));
  const R = o.r;
  const gap = o.gap ?? 0;
  const cl = Array.from({ length: o.n }, () => {
    const x = (rnd() * 2 - 1) * R;
    // (they slide along x: one that starts off the lane never crosses it)
    const u = rnd() * 2 - 1;
    const z = Math.sign(u || 1) * (gap + Math.abs(u) * (R - gap));
    const k = o.size * (0.7 + rnd() * 0.8);
    const puffs = Array.from({ length: PUFFS }, (_, p) => {
      const big = p === 1 || p === 2;
      const w = (big ? 7 : 4.6) * k * (0.85 + rnd() * 0.3);
      return { ox: (p - 1.5) * 4.1 * k, oy: big ? 0.9 * k : 0, oz: (rnd() - 0.5) * 3 * k, w, h: w * (big ? 0.6 : 0.5), d: w * (0.75 + rnd() * 0.3) };
    });
    return { x, y: o.y[0] + rnd() * (o.y[1] - o.y[0]), z, v: o.wind * (0.7 + rnd() * 0.6), puffs };
  });
  scene.add(mesh);
  return (_dt, now) => {
    let i = 0;
    for (const c of cl) {
      const x = ((((c.x + c.v * now + R) % (2 * R)) + 2 * R) % (2 * R)) - R;
      for (const p of c.puffs) mesh.setMatrixAt(i++, M.compose(P.set(x + p.ox, c.y + p.oy + p.h / 2, c.z + p.oz), IDENT, S.set(p.w, p.h, p.d)));
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
}

// ---- an airship ------------------------------------------------------------------------------------

/**
 * The ZSTREET BLIMP: a fat voxel airship (hull, a flare belly band, fins, a gondola, a turning prop, its
 * name in lights on both flanks) flying a slow circle round the arena, below its floor.
 */
export function blimp(scene: THREE.Scene, o: { y: number; r: number; speed: number; hull: string; band: string; phase?: number; name?: string; lights?: boolean }): Tick {
  const g = new THREE.Group();
  const part = (m: THREE.Mesh, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    far(m);
    g.add(m);
    return m;
  };
  // (its long axis along z: it flies nose first)
  part(new THREE.Mesh(GEO.ball, toon(o.hull, "#1a1420")), 6.4, 6.0, 17, 0, 0, 0);
  part(new THREE.Mesh(GEO.ball, toon(o.band, "#3a1400")), 6.5, 2.2, 15.5, 0, -1.2, 0);
  for (const [sx, sy, x, y] of [
    [0.3, 3.4, 0, 2.4],
    [0.3, 3.4, 0, -2.4],
    [3.4, 0.3, 2.4, 0],
    [3.4, 0.3, -2.4, 0],
  ])
    part(new THREE.Mesh(GEO.box, toon(o.band)), sx, sy, 3.2, x, y, -6.6);
  part(new THREE.Mesh(GEO.box, toon("#2a2440")), 2.0, 1.3, 4.6, 0, -3.5, 1.2);
  part(new THREE.Mesh(GEO.box, lamp("#ffe9a8", 0.7)), 2.05, 0.45, 3.6, 0, -3.35, 1.4);
  const prop = part(new THREE.Mesh(GEO.box, toon("#e8e6e0")), 3.0, 0.3, 0.2, 0, -3.5, -1.4);
  if (o.name) {
    // its name along both flanks: flat panels of light
    const tex = canvasTex(512, 96, (c) => {
      c.fillStyle = "#15101f";
      c.fillRect(0, 0, 512, 96);
      c.font = "900 64px Geist, Roboto, ui-sans-serif, system-ui, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "#ffffff";
      c.fillText(o.name!, 256, 52);
    });
    const mat = markGlow(new THREE.MeshBasicMaterial({ map: tex }), o.lights ? 0.6 : 0.15);
    for (const s of [-1, 1]) {
      const p = part(new THREE.Mesh(GEO.plane, mat), 8.4, 1.6, 1, s * 3.1, 0.7, 0.4);
      p.rotation.y = (s * Math.PI) / 2;
      p.rotation.x = 0;
      p.rotation.order = "YXZ";
      p.rotation.x = -0.32;
    }
  }
  scene.add(g);
  const ph = o.phase ?? 0;
  return (_dt, now) => {
    const a = ph + (now * o.speed) / o.r;
    g.position.set(Math.cos(a) * o.r, o.y + Math.sin(now * 0.6) * 0.6, Math.sin(a) * o.r);
    // (nose along the circle; a slight nod)
    g.rotation.set(Math.sin(now * 0.5) * 0.03, Math.atan2(-Math.sin(a), Math.cos(a)), 0);
    prop.rotation.z = now * 14;
  };
}

// ---- the sea ---------------------------------------------------------------------------------------

export interface SeaLook {
  y: number;
  seed: number;
  /** The water (deep), its lighter swell lines, the glints on it. */
  deep: string;
  swell: string;
  glint: string;
  /** Lit from inside a little (a night sea keeps its colour). */
  emissive?: string;
  /** Shallows round the middle: their colour and reach (m); none: open water. */
  shoal?: string;
  shoalR?: number;
  /** Shadows of clouds sliding over it (how many; 0: a night sea). */
  shades?: number;
  /** How far it goes (m). */
  reach?: number;
}

/**
 * A sea for a high camera: deep water with swell lines that slide one way and a sheet of glints that
 * slides the other (so it shimmers and never looks like a tile), paler shallows round the middle, the
 * shadows of clouds drifting across. Four draws. Returns its clock.
 */
export function sea(scene: THREE.Scene, o: SeaLook): Tick {
  const rnd = rng(o.seed);
  const reach = o.reach ?? 1600;
  // the swell: long broken lines, drawn so the tile wraps (40 m a tile)
  const swell = canvasTex(
    512,
    512,
    (g) => {
      g.fillStyle = o.deep;
      g.fillRect(0, 0, 512, 512);
      g.strokeStyle = o.swell;
      g.lineCap = "round";
      for (let k = 0; k < 46; k++) {
        const y = Math.round(rnd() * 512),
          x = rnd() * 512,
          l = 40 + rnd() * 110;
        g.lineWidth = 3 + Math.floor(rnd() * 3) * 2;
        g.globalAlpha = 0.35 + rnd() * 0.45;
        for (const ox of [-512, 0, 512]) {
          g.beginPath();
          g.moveTo(x + ox, y);
          g.lineTo(x + ox + l, y);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    },
    true,
  );
  swell.repeat.set(reach / 40, reach / 40);
  swell.anisotropy = 8;
  const water = far(new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: swell, gradientMap: toonSteps(), emissive: new THREE.Color(o.emissive ?? "#000000") })));
  water.rotation.x = -Math.PI / 2;
  water.scale.set(reach, reach, 1);
  water.position.y = o.y;
  scene.add(water);
  // the glints: short bright dashes on a clear sheet just over it (26 m a tile, another pace)
  const glints = canvasTex(
    256,
    256,
    (g) => {
      g.clearRect(0, 0, 256, 256);
      g.fillStyle = o.glint;
      for (let k = 0; k < 40; k++) {
        const x = Math.round(rnd() * 256),
          y = Math.round(rnd() * 256),
          w = 8 + Math.floor(rnd() * 16);
        g.globalAlpha = 0.4 + rnd() * 0.6;
        for (const ox of [-256, 0, 256]) g.fillRect(x + ox, y, w, 3);
      }
      g.globalAlpha = 1;
    },
    true,
  );
  const gr = Math.min(reach, 520);
  glints.repeat.set(gr / 26, gr / 26);
  const sheet = far(new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: glints, transparent: true, depthWrite: false })));
  sheet.rotation.x = -Math.PI / 2;
  sheet.scale.set(gr, gr, 1);
  sheet.position.y = o.y + 0.03;
  sheet.renderOrder = 1;
  scene.add(sheet);
  // the shallows: a pale disc that fades out into the deep
  if (o.shoal) {
    const R = o.shoalR ?? 40;
    const st = canvasTex(256, 256, (g) => {
      const rg = g.createRadialGradient(128, 128, 20, 128, 128, 128);
      const c = new THREE.Color(o.shoal!);
      const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
      rg.addColorStop(0, `rgba(${rgb},0.85)`);
      rg.addColorStop(0.55, `rgba(${rgb},0.5)`);
      rg.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = rg;
      g.fillRect(0, 0, 256, 256);
    });
    const shoal = far(new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false })));
    shoal.rotation.x = -Math.PI / 2;
    shoal.scale.set(R * 2, R * 2, 1);
    shoal.position.y = o.y + 0.015;
    scene.add(shoal);
  }
  // clouds' shadows: soft dark patches that cross with the wind
  const NS = o.shades ?? 0;
  let shades: THREE.InstancedMesh | null = null;
  const sh: { x: number; z: number; w: number; d: number; v: number }[] = [];
  if (NS) {
    const tex = canvasTex(64, 64, (g) => {
      const rg = g.createRadialGradient(32, 32, 4, 32, 32, 32);
      rg.addColorStop(0, "rgba(6,20,46,0.34)");
      rg.addColorStop(0.7, "rgba(6,20,46,0.2)");
      rg.addColorStop(1, "rgba(6,20,46,0)");
      g.fillStyle = rg;
      g.fillRect(0, 0, 64, 64);
    });
    shades = far(new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), NS));
    shades.renderOrder = 2;
    for (let k = 0; k < NS; k++) sh.push({ x: (rnd() * 2 - 1) * 90, z: -70 + rnd() * 110, w: 26 + rnd() * 30, d: 16 + rnd() * 16, v: 1.6 + rnd() * 1.4 });
    scene.add(shades);
  }
  return (_dt, now) => {
    swell.offset.set((now * 0.012) % 1, (now * 0.02) % 1);
    glints.offset.set((-now * 0.03) % 1, (now * 0.011) % 1);
    if (shades) {
      for (let k = 0; k < NS; k++) {
        const c = sh[k];
        const x = ((((c.x + c.v * now + 90) % 180) + 180) % 180) - 90;
        shades.setMatrixAt(k, M.compose(P.set(x, o.y + 0.05, c.z), IDENT, S.set(c.w, 1, c.d)));
      }
      shades.instanceMatrix.needsUpdate = true;
    }
  };
}

// ---- small things that move ------------------------------------------------------------------------

/**
 * Boats under way (hulls and what stands on them in one draw): each sails its own line back and forth
 * across the water, bobbing, its wake a pair of foam dashes behind it.
 */
export function boats(
  scene: THREE.Scene,
  o: { y: number; seed: number; list: { x0: number; x1: number; z: number; v: number; hull: string; top: string; len?: number; lamp?: string }[] },
): Tick {
  const rnd = rng(o.seed);
  const n = o.list.length;
  const body = far(new THREE.InstancedMesh(GEO.box, toon("#ffffff", "#141018"), n * 3));
  const lights = far(new THREE.InstancedMesh(GEO.box, lamp("#ffffff", 0.6), n * 3));
  const ph = o.list.map(() => rnd() * 6);
  o.list.forEach((b, i) => {
    body.setColorAt(i * 3, C.set(b.hull));
    body.setColorAt(i * 3 + 1, C.set(b.top));
    body.setColorAt(i * 3 + 2, C.set("#e8e6e0"));
    lights.setColorAt(i * 3, C.set(b.lamp ?? "#ffe9a8"));
    lights.setColorAt(i * 3 + 1, C.set("#f4fdff"));
    lights.setColorAt(i * 3 + 2, C.set("#f4fdff"));
  });
  scene.add(body, lights);
  return (_dt, now) => {
    for (let i = 0; i < n; i++) {
      const b = o.list[i];
      const L = b.len ?? 5;
      const span = Math.abs(b.x1 - b.x0);
      // (there and back: it turns round at each end)
      const u = (now * b.v + ph[i] * 9) % (2 * span);
      const fwd = u < span;
      const x = Math.min(b.x0, b.x1) + (fwd ? u : 2 * span - u);
      const dir = fwd ? 1 : -1;
      const bob = Math.sin(now * 1.5 + ph[i]) * 0.12;
      E.set(0, 0, Math.sin(now * 1.2 + ph[i]) * 0.05);
      Q.setFromEuler(E);
      body.setMatrixAt(i * 3, M.compose(P.set(x, o.y + 0.35 + bob, b.z), Q, S.set(L, 0.9, L * 0.36)));
      body.setMatrixAt(i * 3 + 1, M.compose(P.set(x - dir * L * 0.12, o.y + 1.15 + bob, b.z), Q, S.set(L * 0.42, 0.8, L * 0.28)));
      body.setMatrixAt(i * 3 + 2, M.compose(P.set(x - dir * L * 0.12, o.y + 1.62 + bob, b.z), Q, S.set(L * 0.48, 0.14, L * 0.32)));
      lights.setMatrixAt(i * 3, M.compose(P.set(x + dir * L * 0.42, o.y + 1.0 + bob, b.z), IDENT, S.set(0.3, 0.3, 0.3)));
      // the wake: two dashes that open behind it
      const k = 0.6 + 0.4 * Math.sin(now * 5 + ph[i]);
      for (let s = 0; s < 2; s++) lights.setMatrixAt(i * 3 + 1 + s, M.compose(P.set(x - dir * (L * 0.5 + 0.9 + k * 0.5), o.y + 0.06, b.z + (s ? 1 : -1) * (0.5 + k * 0.35)), IDENT, S.set(1.6 + k, 0.08, 0.22)));
    }
    body.instanceMatrix.needsUpdate = true;
    lights.instanceMatrix.needsUpdate = true;
  };
}
