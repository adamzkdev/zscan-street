/**
 * BUMPER SNARKS' settings round the arena (what you see, nothing you touch): the city far below the
 * SKY COIN (its districts, a park and its lake, traffic on the avenues, clouds between); ZStreet on a
 * winter evening under the FROZEN LAKE RING (snowy roofs, lit windows, the frozen Sprout river and its
 * bridges, the NU7 TOWER's golden ⓩ ball on its white tower, the ZK MALL's great tent, falling snow the gusts blow, an aurora); Marina
 * Bay at night round the LILIES (dark water, the glowing tree grove, three towers under a sky park,
 * lanterns and lotus flowers on the water). Each has a real sky all round (k3 skyDome) and fades
 * into its haze by depth. Everything instanced, a few draws each, built on its own seeded random
 * (never the game's), and out of the sun's shadow map (nothing it could shade is in reach).
 */
import * as THREE from "three";
import { rng } from "../../kit";
import { GEO, canvasTex, glow, outline, skyDome, skyline, toon, toonSteps, type SkyOpts } from "../../k3";
import { drawMark } from "../../theme";

export interface Scenery {
  /** Each frame: the time, the step, the wind (a unit way, and how strong now, 0…1: the gusts). */
  update(now: number, dt: number, wx: number, wz: number, wk: number): void;
  /** NU7's alarm, 0…1: the sky turns with it. */
  alarm(k: number): void;
}

/** The bay's water level (the lilies float on it; a fall ends in it). */
export const WATER_Y = -0.34;

const m4 = new THREE.Matrix4();
const v = new THREE.Vector3();
const v2 = new THREE.Vector3();
const q = new THREE.Quaternion();
const sc = new THREE.Vector3();
const col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const eu = new THREE.Euler();
type Rnd = () => number;

/** Decor out of reach of the sun's shadow map: it neither casts nor receives (shadows.ts). */
function far<T extends THREE.Object3D>(o: T) {
  o.traverse((m) => (m.userData.noShadow = true));
  return o;
}

/** Where a light from (x, ·, z) sits round the sky dome (its `az`, degrees). */
const azOf = (x: number, z: number) => (Math.atan2(z, -x) * 180) / Math.PI;

/** The level's sky all round, in place of the flat backdrop; `alarm(k)` turns it toward NU7's red. */
function sky(s: THREE.Scene, o: SkyOpts, alarm: string) {
  const dome = skyDome(s, o);
  const mat = dome.material as THREE.MeshBasicMaterial;
  const to = new THREE.Color(alarm);
  return {
    dome,
    alarm: (k: number) => void mat.color.setRGB(1 + (to.r - 1) * k, 1 + (to.g - 1) * k, 1 + (to.b - 1) * k),
  };
}

/** A flock circling below the arena: each bird two flapping wings (one draw). */
class Birds {
  readonly mesh: THREE.InstancedMesh;
  private a: Float32Array;
  private r: Float32Array;
  private y: Float32Array;
  private ph: Float32Array;
  constructor(
    private n: number,
    color: string,
    R: [number, number],
    Y: [number, number],
    rnd: Rnd,
    private speed = 0.12,
  ) {
    this.mesh = new THREE.InstancedMesh(GEO.box, toon(color, "#2a2a44"), n * 2);
    this.mesh.frustumCulled = false;
    this.a = new Float32Array(n);
    this.r = new Float32Array(n);
    this.y = new Float32Array(n);
    this.ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const flock = i % 3;
      this.a[i] = flock * 2.1 + rnd() * 0.5;
      this.r[i] = R[0] + rnd() * (R[1] - R[0]);
      this.y[i] = Y[0] + flock * ((Y[1] - Y[0]) / 3) + rnd() * 2;
      this.ph[i] = rnd() * 6;
    }
  }
  update(now: number) {
    for (let i = 0; i < this.n; i++) {
      const a = this.a[i] + now * this.speed * (i % 2 ? 1 : 0.92);
      const x = Math.cos(a) * this.r[i],
        z = Math.sin(a) * this.r[i];
      const y = this.y[i] + Math.sin(now * 0.8 + this.ph[i]) * 0.8;
      const yaw = Math.atan2(-Math.sin(a), Math.cos(a));
      // (wings in a V, beating: a gull's glide between strokes)
      const flap = 0.35 + Math.max(0, Math.sin(now * 7 + this.ph[i])) * 0.55;
      for (let w = 0; w < 2; w++) {
        const side = w ? 1 : -1;
        q.setFromEuler(eu.set(0, yaw, side * flap));
        v.set(side * 0.55, 0, 0).applyQuaternion(q);
        m4.compose(v.set(x + v.x, y + v.y, z + v.z), q, sc.set(1.1, 0.12, 0.42));
        this.mesh.setMatrixAt(i * 2 + w, m4);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Smoke from the chimneys far below: puffs rising, swelling and thinning (one draw). */
class Smoke {
  readonly mesh: THREE.InstancedMesh;
  private t: Float32Array;
  constructor(
    private spots: [number, number, number][],
    private per: number,
    color: string,
    rnd: Rnd,
  ) {
    this.mesh = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }), spots.length * per);
    this.mesh.frustumCulled = false;
    this.t = new Float32Array(spots.length * per);
    for (let i = 0; i < this.t.length; i++) this.t[i] = rnd();
  }
  update(dt: number, wx: number, wz: number) {
    for (let i = 0; i < this.t.length; i++) {
      this.t[i] = (this.t[i] + dt * 0.12) % 1;
      const k = this.t[i];
      const [x, y, z] = this.spots[Math.floor(i / this.per)];
      const sz = 1.2 + k * 5;
      q.setFromEuler(eu.set(k * 2, k * 3 + i, 0));
      m4.compose(v.set(x + (wx * 6 + 3) * k * 4, y + k * 22, z + (wz * 6 + 1) * k * 4), q, sc.setScalar(sz * (1 - k * 0.3)));
      this.mesh.setMatrixAt(i, m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Cloud banks all round at the arena's own height, far off and out of the haze (no fog on them): what
 * a low camera sees along the horizon. Flat-bottomed heaps of blocks, one draw; they turn slowly.
 */
function banks(set: THREE.Group, color: string, shade: string, R: Rnd) {
  const nB = 13,
    per = 7;
  const mesh = new THREE.InstancedMesh(GEO.box, new THREE.MeshToonMaterial({ color, emissive: shade, gradientMap: toonSteps(), fog: false }), nB * per);
  let n = 0;
  for (let i = 0; i < nB; i++) {
    const a = (i / nB) * Math.PI * 2 + R() * 0.3;
    const d = 230 + R() * 110;
    const y0 = 8 + R() * 46;
    const k = 0.8 + R() * 0.9;
    q.setFromAxisAngle(UP, -a + Math.PI / 2);
    for (let p = 0; p < per; p++) {
      // (a long low base, heaps on it toward the middle)
      const base = p < 3;
      const along = base ? (p - 1) * 26 * k : (p - 4.5) * 15 * k + (R() - 0.5) * 8;
      const w = (base ? 34 : 17 + R() * 9) * k,
        h = (base ? 9 : 10 + R() * 9) * k;
      v.set(along, y0 + (base ? 0 : h * 0.75 + (p % 2) * 3 * k), (R() - 0.5) * 10).applyQuaternion(q);
      m4.compose(v2.set(Math.cos(a) * d + v.x, v.y, Math.sin(a) * d + v.z), q, sc.set(w, h, 15 * k));
      mesh.setMatrixAt(n++, m4);
    }
  }
  mesh.raycast = () => {};
  set.add(mesh);
  return mesh;
}

interface CityOpts {
  y: number;
  /** The streets, a block's pavement, the avenues' dashes. */
  street: string;
  lot: string;
  line: string;
  /** The parks' ground, their trees (two tones). */
  park: string;
  trees: [string, string];
  /** The towers' walls, their roofs (snow, on the frozen-lake evening). */
  towers: string[];
  roofs: string[];
  /** The windows: lit, dark, the share lit; `night`: the lit ones glow. */
  lit: string;
  dark: string;
  litK: number;
  night: boolean;
  tall: number;
  /** Where the towers rise (x, z, reach, height): the districts. */
  hubs: [number, number, number, number][];
  /** The outskirts: how high the towers climb there (the skyline a low camera sees through the haze), their walls. */
  rim: number;
  rimTowers: string[];
  /** Their roofs, when not the city's own (in a day's haze a pale roof on a faint wall reads as a floating lid). */
  rimRoofs?: string[];
  cloud: [string, string];
  /** The traffic's colours; `carGlow`: headlights at dusk (unlit, they bloom). */
  cars: string[];
  carGlow: boolean;
  /** A river across it under the arena's back (its ice, its snow drifts, the cracks' blue), and its bridges' decks. */
  river?: [string, string, string];
  bridge?: string;
  /** A lake in a park (x, z, half sizes, its colour). */
  lake?: [number, number, number, number, string];
}

/** The avenues (every fourth street): along z at these x, along x at these z (what the play camera sees). */
const AV_X = [-100, -50, 0, 50, 100];
const AV_Z = [-150, -100, -50, 0];
/** The river's lie: through (0, −46), turned 0.42 rad. */
const RIV_C = Math.cos(0.42);
const RIV_S = Math.sin(0.42);

/**
 * The city far below: a street grid (avenues every 50 m), blocks with towers that rise by district,
 * flat roofs on them (seen from above, a roof is most of a tower), parks with trees, a lake or a
 * river with bridges, traffic on the avenues, the skyline round, clouds between it and the arena.
 */
function cityBelow(set: THREE.Group, o: CityOpts, R: Rnd) {
  const tex = canvasTex(
    512,
    512,
    (g) => {
      g.fillStyle = o.street;
      g.fillRect(0, 0, 512, 512);
      // the blocks' pavements, four by four in a tile (the tile's edge is an avenue: wider than a street)
      g.fillStyle = o.lot;
      const lo = (k: number) => k * 128 + (k === 0 ? 26 : 14);
      const hi = (k: number) => (k + 1) * 128 - (k === 3 ? 26 : 14);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          g.beginPath();
          g.roundRect(lo(i), lo(j), hi(i) - lo(i), hi(j) - lo(j), 9);
          g.fill();
        }
      // the avenues' dashes (on the tile's seams: half on each side)
      g.fillStyle = o.line;
      for (let p = 6; p < 512; p += 32) for (const e of [0, 509]) (g.fillRect(p, e, 18, 3), g.fillRect(e, p, 3, 18));
    },
    true,
  );
  tex.repeat.set(30, 30);
  const ground = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps() }));
  ground.rotation.x = -Math.PI / 2;
  ground.scale.set(1500, 1500, 1);
  ground.position.y = o.y;
  set.add(ground);
  const cell = 12.5;
  const N = 28;
  const riv = (x: number, z: number) => (z + 46) * RIV_C + x * RIV_S;
  const lake = o.lake;
  const inLake = (x: number, z: number, k: number) => !!lake && ((x - lake[0]) / (lake[2] * k)) ** 2 + ((z - lake[1]) / (lake[3] * k)) ** 2 < 1;
  if (o.river) {
    // (frozen: wind-packed snow in long drifts, blue cracks across the bare ice; a texel is 6 cm)
    const [ice, drift, crack] = o.river;
    const rtex = canvasTex(
      1024,
      512,
      (g) => {
        g.fillStyle = ice;
        g.fillRect(0, 0, 1024, 512);
        g.fillStyle = drift;
        for (let i = 0; i < 26; i++) {
          const x = R() * 1024,
            y = 30 + R() * 452,
            w = 90 + R() * 220,
            h = 10 + R() * 26;
          for (const ox of [-1024, 0, 1024]) (g.beginPath(), g.ellipse(x + ox, y, w / 2, h / 2, 0, 0, Math.PI * 2), g.fill());
        }
        g.strokeStyle = crack;
        g.lineWidth = 3;
        g.lineJoin = "round";
        for (let i = 0; i < 9; i++) {
          let x = R() * 1024,
            y = R() * 512;
          g.beginPath();
          g.moveTo(x, y);
          for (let k = 0; k < 4; k++) g.lineTo((x += 30 + R() * 60), (y += (R() - 0.5) * 90));
          g.stroke();
        }
        // the banks: packed snow along both edges
        g.fillStyle = drift;
        g.fillRect(0, 0, 1024, 22);
        g.fillRect(0, 490, 1024, 22);
      },
      true,
    );
    rtex.repeat.set(1500 / 68, 1);
    const r = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: rtex, gradientMap: toonSteps(), emissive: 0x16233a }));
    r.rotation.set(-Math.PI / 2, 0, 0.42);
    r.scale.set(1500, 34, 1);
    r.position.set(0, o.y + 0.15, -46);
    set.add(r);
    // the avenues cross it on bridges
    const decks = new THREE.InstancedMesh(GEO.box, toon(o.bridge ?? "#9aa3b8"), AV_X.length + AV_Z.length);
    let n = 0;
    for (const X of AV_X) {
      m4.compose(v.set(X, o.y + 0.3, -46 - (X * RIV_S) / RIV_C), q.identity(), sc.set(6.4, 0.6, 2 * (17 / RIV_C + 3)));
      decks.setMatrixAt(n++, m4);
    }
    for (const Z of AV_Z) {
      const xc = (-(Z + 46) * RIV_C) / RIV_S;
      if (Math.abs(xc) > 190) continue;
      m4.compose(v.set(xc, o.y + 0.3, Z), q.identity(), sc.set(2 * (17 / RIV_S + 3), 0.6, 6.4));
      decks.setMatrixAt(n++, m4);
    }
    decks.count = n;
    set.add(decks);
  }
  if (lake) {
    // (a pond in its lawn: two flat discs over the blocks and the streets between)
    const lawn = new THREE.Mesh(GEO.cyl, toon(o.park));
    lawn.scale.set(lake[2] * 2.9, 0.3, lake[3] * 2.9);
    lawn.position.set(lake[0], o.y + 0.15, lake[1]);
    const pond = new THREE.Mesh(GEO.cyl, toon(lake[4], "#103a6a"));
    pond.scale.set(lake[2] * 2, 0.3, lake[3] * 2);
    pond.position.set(lake[0], o.y + 0.3, lake[1]);
    set.add(lawn, pond);
  }
  // the windows: one sheet for every wall (and, at night, the lit ones alone as its glow)
  const lit: boolean[] = [];
  const wtex = canvasTex(
    64,
    128,
    (g) => {
      g.fillStyle = "#fff";
      g.fillRect(0, 0, 64, 128);
      for (let y = 6; y < 128; y += 12)
        for (let x = 5; x < 64; x += 12) {
          const on = R() < o.litK;
          lit.push(on);
          g.fillStyle = on ? o.lit : o.dark;
          g.fillRect(x, y, 7, 7);
        }
    },
    true,
  );
  const etex = o.night
    ? canvasTex(
        64,
        128,
        (g) => {
          g.fillStyle = "#000";
          g.fillRect(0, 0, 64, 128);
          g.fillStyle = o.lit;
          let k = 0;
          for (let y = 6; y < 128; y += 12) for (let x = 5; x < 64; x += 12) if (lit[k++]) g.fillRect(x, y, 7, 7);
        },
        true,
      )
    : null;
  const towers = new THREE.InstancedMesh(GEO.box, new THREE.MeshToonMaterial({ map: wtex, gradientMap: toonSteps(), emissive: etex ? 0xffffff : 0x000000, emissiveMap: etex, emissiveIntensity: 0.85 }), N * N);
  const roofs = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), N * N * 2);
  const parks = new THREE.InstancedMesh(GEO.box, toon(o.park), 150);
  const trees = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), 450);
  let n = 0,
    nr = 0,
    np = 0,
    nt = 0;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const x = (i - N / 2 + 0.5) * cell,
        z = (j - N / 2 + 0.5) * cell;
      // (the draws are the same whatever the cell turns out to be: one city per seed)
      const r0 = R(),
        r1 = R(),
        r2 = R(),
        r3 = R(),
        r4 = R();
      if (o.river && Math.abs(riv(x, z)) < 22) continue;
      if (inLake(x, z, 1.25)) continue;
      // a park: by the pond, or one block in eleven
      if (inLake(x, z, 2.1) || r0 < 0.09) {
        if (np >= 150) continue;
        m4.compose(v.set(x, o.y + 0.12, z), q.identity(), sc.set(10.4, 0.24, 10.4));
        parks.setMatrixAt(np++, m4);
        for (let t = 0; t < 3 && nt < 450; t++) {
          const a = r1 * 6.28 + t * 2.1,
            d = 2.2 + ((r2 * 7 + t * 3) % 2.4),
            sz = 2.4 + ((r3 * 5 + t) % 1.6);
          m4.compose(v.set(x + Math.cos(a) * d, o.y + 0.24 + sz * 0.55, z + Math.sin(a) * d), q.identity(), sc.set(sz, sz * 1.1, sz));
          trees.setMatrixAt(nt, m4);
          trees.setColorAt(nt++, col.set(o.trees[(i + j + t) % 2]));
        }
        continue;
      }
      // (the outskirts climb: from 96 m out the towers rise toward the arena's own height, the skyline in the haze)
      const out = Math.min(1, Math.max(0, (Math.hypot(x, z) - 96) / 44));
      if (r0 > (out > 0 ? 0.97 : 0.9)) continue;
      let rise = o.rim * out * out * (3 - 2 * out);
      for (const [hx, hz, reach, top] of o.hubs) rise = Math.max(rise, top * Math.exp(-((x - hx) ** 2 + (z - hz) ** 2) / (2 * reach * reach)));
      const w = cell * (0.52 + r1 * 0.2),
        d = w * (0.82 + r2 * 0.36);
      const h = (4 + r3 * 7 + rise * (0.3 + r4 * 0.7)) * o.tall;
      m4.compose(v.set(x, o.y + h / 2, z), q.identity(), sc.set(w, h, Math.min(d, cell * 0.78)));
      towers.setMatrixAt(n, m4);
      towers.setColorAt(n++, col.set(out > 0.25 ? o.rimTowers[(i * 7 + j * 3) % o.rimTowers.length] : o.towers[(i * 7 + j * 3) % o.towers.length]));
      // its roof (a slab a hair wider than the walls: no window shows from above), and a roof unit on the bigger ones
      const rc = out > 0.25 && o.rimRoofs ? o.rimRoofs[(i + j) % o.rimRoofs.length] : o.roofs[(i * 5 + j * 11) % o.roofs.length];
      m4.compose(v.set(x, o.y + h + 0.2, z), q.identity(), sc.set(w + 0.5, 0.5, Math.min(d, cell * 0.78) + 0.5));
      roofs.setMatrixAt(nr, m4);
      roofs.setColorAt(nr++, col.set(rc));
      if (r4 > 0.45) {
        m4.compose(v.set(x + (r1 - 0.5) * w * 0.4, o.y + h + 0.95, z + (r2 - 0.5) * d * 0.4), q.identity(), sc.set(w * 0.34, 1.1, w * 0.3));
        roofs.setMatrixAt(nr, m4);
        roofs.setColorAt(nr++, col.set(rc).multiplyScalar(0.82));
      }
    }
  towers.count = n;
  roofs.count = nr;
  parks.count = np;
  trees.count = nt;
  for (const m of [towers, roofs, parks, trees]) m.raycast = () => {};
  set.add(towers, roofs, parks, trees);
  // clouds: flat-bottomed puffs drifting between the arena and the streets, a few far up in the sky (one draw)
  const puffs = 5;
  const nC = 21;
  const cloudMesh = new THREE.InstancedMesh(GEO.box, toon(o.cloud[0], o.cloud[1]), nC * puffs);
  let c = 0;
  for (let i = 0; i < nC; i++) {
    // (eleven well under the arena, six further out just under its level: what a low camera sees past the rim; four high up)
    const low = i < 11,
      mid = !low && i < 17;
    const a = (i / (low ? 11 : mid ? 6 : 4)) * Math.PI * 2 + R() * 0.5;
    const d = low ? 40 + R() * 56 : mid ? 72 + R() * 50 : 90 + R() * 70;
    const cy = low ? -32 - R() * 16 : mid ? -9 - R() * 11 : 16 + R() * 24;
    const k = low ? 0.7 + R() * 0.6 : mid ? 1.2 + R() * 0.7 : 1.4 + R();
    for (let p = 0; p < puffs; p++) {
      const big = p > 0 && p < 4;
      const ox = (p - 2) * 3 * k,
        oz = (R() - 0.5) * 3 * k;
      const w = (big ? 5 : 3.4) * k;
      m4.compose(v.set(Math.cos(a) * d + ox, cy + (big ? (p === 2 ? 1.5 : 0.8) : 0) * k, Math.sin(a) * d + oz), q.identity(), sc.set(w, w * (big ? 0.62 : 0.5), w * 0.95));
      cloudMesh.setMatrixAt(c++, m4);
    }
  }
  cloudMesh.raycast = () => {};
  set.add(cloudMesh);
  // the traffic: cars and a few buses along the avenues, each in its lane (one draw)
  const NCAR = 72;
  const cars = new THREE.InstancedMesh(GEO.box, o.carGlow ? glow("#ffffff") : toon("#ffffff", "#20222e"), NCAR);
  cars.frustumCulled = false;
  cars.raycast = () => {};
  const cAlongX = new Uint8Array(NCAR);
  const cLine = new Float32Array(NCAR);
  const cAt = new Float32Array(NCAR);
  const cV = new Float32Array(NCAR);
  const cLen = new Float32Array(NCAR);
  for (let i = 0; i < NCAR; i++) {
    cAlongX[i] = i % 5 < 2 ? 1 : 0;
    const lines = cAlongX[i] ? AV_Z : AV_X;
    cLine[i] = lines[Math.floor(R() * lines.length) % lines.length];
    cV[i] = (R() < 0.5 ? 1 : -1) * (5 + R() * 6);
    cAt[i] = R() * 340;
    cLen[i] = R() < 0.14 ? 7.5 : 3.8;
    cars.setColorAt(i, col.set(o.cars[i % o.cars.length]));
  }
  set.add(cars);
  const y = o.y + 1.25;
  return {
    clouds: cloudMesh,
    tick(now: number) {
      cloudMesh.rotation.y = now * 0.004;
      for (let i = 0; i < NCAR; i++) {
        const p = ((((cAt[i] + cV[i] * now) % 340) + 340) % 340) - 170;
        const lane = cV[i] > 0 ? 1.15 : -1.15;
        if (cAlongX[i]) m4.compose(v.set(p, y, cLine[i] - lane), q.identity(), sc.set(cLen[i], 1.3, 1.8));
        else m4.compose(v.set(cLine[i] + lane, y, p - 40), q.identity(), sc.set(1.8, 1.3, cLen[i]));
        cars.setMatrixAt(i, m4);
      }
      cars.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---- SKY COIN ----------------------------------------------------------------------------------------

export function coinScenery(s: THREE.Scene, cityY: number, sun: THREE.Vector3): Scenery {
  const R = rng(0xc01e5c);
  const set = new THREE.Group();
  s.add(set);
  const city = cityBelow(
    set,
    {
      y: cityY,
      street: "#6f7c9c",
      lot: "#a9b6cd",
      line: "#eef2fa",
      park: "#8ccf84",
      trees: ["#55b25c", "#74c96a"],
      towers: ["#eadfd2", "#cdd8ea", "#f1cfae", "#bfcbe0", "#ddd3ee", "#f5e1b6", "#f2bcae", "#bde1d5"],
      roofs: ["#d2ccc3", "#bfcadb", "#cabdab", "#b1bdcd", "#c9c2da", "#d0a18d", "#96c2b8", "#d2ccc3", "#b9c3d5"],
      lit: "#e8f6ff",
      dark: "#7f96b4",
      litK: 0.25,
      night: false,
      tall: 0.9,
      hubs: [
        [-90, -54, 34, 42],
        [98, -98, 30, 32],
        [-26, -132, 38, 28],
      ],
      rim: 96,
      rimTowers: ["#4a6ca8", "#5878b4", "#42629c", "#6485bd"],
      rimRoofs: ["#5f80ba", "#6a8ac4"],
      cloud: ["#ffffff", "#66789a"],
      cars: ["#ff6b35", "#ffd23f", "#3ec6ff", "#ffffff", "#ff5fa2", "#2a3580", "#8ee35b"],
      carGlow: false,
      lake: [76, -70, 17, 12, "#5ab8ff"],
    },
    R,
  );
  const fogC = `#${(s.fog as THREE.Fog).color.getHexString()}`;
  const heaven = sky(s, { sky: ["#1f6fe6", fogC], ground: fogC, clouds: 28, cloudShade: "#a9c6ee", disc: { az: azOf(sun.x, sun.z), el: 34, color: "#fff6d2", size: 8, glow: 6 }, haze: 0.22, rnd: R }, "#ff8a7a");
  // two ZStreet blimps circling under the coin, their tails' fins, their gondolas lit
  const blimps: THREE.Group[] = [];
  const hull = new THREE.MeshToonMaterial({ map: blimpTex(), gradientMap: toonSteps(), emissive: "#1a1a2a" });
  for (let k = 0; k < 2; k++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(GEO.ball, hull);
    body.scale.set(9, 3.2, 3.2);
    outline(body, 0.12);
    g.add(body);
    const fins = new THREE.InstancedMesh(GEO.box, toon(k ? "#ff5fa2" : "#ffd23f", "#2a1000"), 3);
    for (let f = 0; f < 3; f++) {
      const a = (f / 3) * Math.PI * 2 + Math.PI / 2;
      m4.compose(v.set(-4.2, Math.sin(a) * 1.2, Math.cos(a) * 1.2), q.setFromAxisAngle(v2.set(1, 0, 0), -a + Math.PI / 2), sc.set(1.8, 1.6, 0.18));
      fins.setMatrixAt(f, m4);
    }
    g.add(fins);
    const gondola = new THREE.Mesh(GEO.box, toon("#2a3580", "#0a1030"));
    gondola.scale.set(2.2, 0.7, 0.9);
    gondola.position.y = -1.85;
    g.add(gondola);
    set.add(g);
    blimps.push(g);
  }
  // hot-air balloons drifting up far off (striped, a basket each)
  const balloonTex = canvasTex(256, 64, (g) => {
    const pal = ["#ff6b35", "#ffd23f", "#3ec6ff", "#ff5fa2", "#8ee35b", "#ffffff"];
    for (let i = 0; i < 12; i++) ((g.fillStyle = pal[i % pal.length]), g.fillRect(i * 22, 0, 22, 64));
  });
  const balloons = new THREE.InstancedMesh(GEO.ball, new THREE.MeshToonMaterial({ map: balloonTex, gradientMap: toonSteps() }), 4);
  const baskets = new THREE.InstancedMesh(GEO.box, toon("#9a6a3a", "#2a1400"), 4);
  balloons.frustumCulled = baskets.frustumCulled = false;
  const bx = [-40, 36, -24, 48],
    bz = [-34, -46, -62, -14],
    by0 = [-30, -38, -24, -44];
  set.add(balloons, baskets);
  const birds = new Birds(15, "#ffffff", [17, 30], [-14, -6], R, 0.16);
  set.add(birds.mesh);
  const bank = banks(set, "#ffffff", "#7f96c0", R);
  far(set);
  return {
    update(now) {
      city.tick(now);
      heaven.dome.rotation.y = now * 0.002;
      bank.rotation.y = now * 0.003;
      for (let k = 0; k < 2; k++) {
        const a = now * 0.05 + k * Math.PI;
        const r = 27 + k * 9;
        const g = blimps[k];
        g.position.set(Math.cos(a) * r, -13 - k * 8 + Math.sin(now * 0.4 + k) * 0.6, Math.sin(a) * r);
        g.rotation.set(0, -a - Math.PI / 2, Math.sin(now * 0.5 + k) * 0.04);
      }
      for (let k = 0; k < 4; k++) {
        const y = by0[k] + ((now * 0.6 + k * 9) % 34);
        const sw = Math.sin(now * 0.7 + k) * 0.6;
        m4.compose(v.set(bx[k] + sw, y, bz[k]), q.setFromAxisAngle(UP, now * 0.1 + k), sc.set(4.2, 5, 4.2));
        balloons.setMatrixAt(k, m4);
        m4.compose(v.set(bx[k] + sw, y - 3.6, bz[k]), q.identity(), sc.set(1, 0.8, 1));
        baskets.setMatrixAt(k, m4);
      }
      balloons.instanceMatrix.needsUpdate = true;
      baskets.instanceMatrix.needsUpdate = true;
      birds.update(now);
    },
    alarm: heaven.alarm,
  };
}

/** A lantern's glow on the water: warm, soft, round. */
function haloTex() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,190,110,0.75)");
    gr.addColorStop(0.4, "rgba(255,140,70,0.3)");
    gr.addColorStop(1, "rgba(255,120,60,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/** A blimp's skin: white, a blue band, a big ⓩ on each flank. */
function blimpTex() {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = "#f4f7ff";
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = "#3ec6ff";
    g.fillRect(0, 54, 256, 20);
    g.fillStyle = "#ff6b35";
    g.fillRect(0, 74, 256, 6);
    for (const cx of [64, 192]) {
      g.fillStyle = "#ffd23f";
      g.beginPath();
      g.arc(cx, 40, 22, 0, Math.PI * 2);
      g.fill();
      drawMark(g, cx, 40, 54, "#1a1033", "#1a1033");
    }
  });
}

// ---- FROZEN LAKE RING ----------------------------------------------------------------------------------

export function astanaScenery(s: THREE.Scene, cityY: number, sun: THREE.Vector3): Scenery {
  const R = rng(0xa57a0a);
  const set = new THREE.Group();
  s.add(set);
  const city = cityBelow(
    set,
    {
      y: cityY,
      street: "#7682ae",
      lot: "#dfe6f7",
      line: "#f6f8ff",
      park: "#eef3ff",
      trees: ["#2f6a55", "#e9f1ff"],
      towers: ["#a7b2d6", "#8c9ac6", "#c4b3cf", "#98a6cf", "#b4abd6", "#d0bfc4", "#9fb6d2"],
      roofs: ["#f6f9ff", "#e9effc", "#eef3ff", "#dfe7f8"],
      lit: "#ffd48a",
      dark: "#465080",
      litK: 0.5,
      night: true,
      tall: 1.05,
      hubs: [
        [-96, -62, 32, 34],
        [94, -44, 28, 26],
        [14, -136, 40, 30],
      ],
      rim: 92,
      rimTowers: ["#5a4f8e", "#665a9c", "#52487f", "#7262a4"],
      cloud: ["#e9dcf0", "#6c5a94"],
      cars: ["#ffe9b0", "#ffe9b0", "#ff5a4a", "#ffffff", "#ffe9b0", "#ff5a4a"],
      carGlow: true,
      river: ["#b9d2f4", "#eef4ff", "#7f9fd6"],
      bridge: "#8d97bf",
    },
    R,
  );
  // the NU7 TOWER: its golden ⓩ ball on a white tower, rising from the city to well under the ring (back left)
  const bx = -37,
    bz = -33,
    by = -25;
  const white = toon("#f4f6ff", "#20243a");
  const trunk = new THREE.Mesh(GEO.cyl, white);
  trunk.scale.set(2.6, by - 7.5 - cityY, 2.6);
  trunk.position.set(bx, (cityY + by - 7.5) / 2, bz);
  set.add(trunk);
  const ribs = new THREE.InstancedMesh(GEO.cyl, white, 10);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    // (a rib from the trunk's top, out and up round the ball's lower half)
    const x0 = bx + Math.cos(a) * 0.9,
      z0 = bz + Math.sin(a) * 0.9,
      y0 = by - 8.5;
    const x1 = bx + Math.cos(a) * 3.9,
      z1 = bz + Math.sin(a) * 3.9,
      y1 = by - 1;
    v.set(x1 - x0, y1 - y0, z1 - z0);
    const len = v.length();
    q.setFromUnitVectors(UP, v.normalize());
    m4.compose(sc.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), q, v.set(0.5, len, 0.5));
    ribs.setMatrixAt(k, m4);
  }
  set.add(ribs);
  // (its glazing: golden panes between mullions, so it reads as a ball from above, not a flat disc; a ⓩ each side)
  const glaze = canvasTex(
    256,
    128,
    (g) => {
      g.fillStyle = "#b9791a";
      g.fillRect(0, 0, 256, 128);
      for (let j = 0; j < 8; j++)
        for (let i = 0; i < 16; i++) {
          g.fillStyle = (i + j) % 2 ? "#ffc23a" : "#ffd266";
          g.fillRect(i * 16 + 1.5, j * 16 + 1.5, 13, 13);
        }
      for (const cx of [64, 192]) drawMark(g, cx, 64, 76, "#5a3000", "#5a3000");
    },
    true,
  );
  const gold = new THREE.MeshToonMaterial({ map: glaze, emissive: "#7a4200", gradientMap: toonSteps() });
  const orb = new THREE.Mesh(GEO.ball, gold);
  orb.scale.setScalar(8.6);
  orb.position.set(bx, by, bz);
  outline(orb, 0.1);
  set.add(orb);
  // the ZK MALL's great tent: a tall leaning cone, lit from inside (back right)
  const tentTex = canvasTex(256, 64, (g) => {
    g.fillStyle = "#f8e9b8";
    g.fillRect(0, 0, 256, 64);
    // (the cable net over the glazing: diamonds, lit panes here and there)
    for (let i = 0; i < 60; i++) {
      g.fillStyle = i % 3 ? "rgba(255,214,140,0.7)" : "rgba(255,250,225,0.9)";
      g.fillRect(R() * 256, R() * 64, 6, 4);
    }
    g.strokeStyle = "rgba(150,110,60,0.45)";
    g.lineWidth = 1.5;
    for (let x = -64; x < 320; x += 16) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x + 32, 64), g.moveTo(x + 32, 0), g.lineTo(x, 64), g.stroke());
  });
  tentTex.wrapS = THREE.RepeatWrapping;
  tentTex.repeat.set(3, 4);
  // (low and broad, far off: from above it reads as a tent, never as a beam of light)
  const TH = 26;
  const tent = new THREE.Mesh(new THREE.ConeGeometry(17, TH, 28, 1), new THREE.MeshToonMaterial({ map: tentTex, gradientMap: toonSteps(), emissive: "#6a4a14" }));
  tent.position.set(46, cityY + TH / 2, -52);
  tent.rotation.z = -0.08;
  set.add(tent);
  const mast = new THREE.Mesh(GEO.cyl, toon("#e8e2d0"));
  mast.scale.set(0.5, 7, 0.5);
  mast.position.set(44.9, cityY + TH + 2.5, -52);
  mast.rotation.z = -0.08;
  set.add(mast);
  // an aurora over the plains (far, behind; the card's fly-over sees it)
  const aTex = canvasTex(256, 128, (g) => {
    for (let x = 0; x < 256; x += 2) {
      const h = 60 + Math.sin(x * 0.07) * 18 + Math.sin(x * 0.23) * 8;
      const gr = g.createLinearGradient(0, 128 - h, 0, 128);
      gr.addColorStop(0, "rgba(120,255,190,0)");
      gr.addColorStop(0.55, `rgba(110,255,180,${0.25 + 0.2 * Math.abs(Math.sin(x * 0.11))})`);
      gr.addColorStop(1, "rgba(140,120,255,0)");
      g.fillStyle = gr;
      g.fillRect(x, 128 - h, 2, h);
    }
  });
  const aMat = new THREE.MeshBasicMaterial({ map: aTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
  const auroras: THREE.Mesh[] = [];
  for (let k = 0; k < 3; k++) {
    const a = new THREE.Mesh(GEO.plane, aMat);
    a.scale.set(150, 46, 1);
    const ang = -Math.PI / 2 + (k - 1) * 0.75;
    a.position.set(Math.cos(ang) * 175, 52 + k * 7, Math.sin(ang) * 175);
    a.lookAt(0, 52, 0);
    a.renderOrder = -1;
    set.add(a);
    auroras.push(a);
  }
  // the evening sky: deep blue overhead, the last light low where the sun went down, the first stars
  const fogC = `#${(s.fog as THREE.Fog).color.getHexString()}`;
  // (the ground's haze is in shade, mauve; the sky over it still glows)
  const heaven = sky(s, { sky: ["#1a1b58", "#f2b09c"], ground: fogC, stars: 260, clouds: 14, cloud: "#ffd2c0", cloudShade: "#8f6aa0", disc: { az: azOf(sun.x, sun.z), el: 6, color: "#ffe2b4", size: 7, glow: 9 }, haze: 0.3, rnd: R }, "#ff7a6a");
  // chimney smoke far below (warm homes on a cold evening), crows circling under the ring
  const smoke = new Smoke(
    [
      [-30, cityY + 16, -38],
      [22, cityY + 22, -52],
      [-52, cityY + 12, 6],
      [44, cityY + 14, -14],
      [6, cityY + 18, -70],
    ],
    7,
    "#e9e4f4",
    R,
  );
  const crows = new Birds(10, "#f2eaff", [18, 30], [-16, -8], R, 0.13);
  set.add(smoke.mesh, crows.mesh);
  // the snow: flakes drifting down round the ring, blown sideways by the gusts
  const NF = 170;
  const flakes = new THREE.InstancedMesh(GEO.box, glow("#ffffff"), NF);
  flakes.frustumCulled = false;
  const fx = new Float32Array(NF),
    fy = new Float32Array(NF),
    fz = new Float32Array(NF),
    fs = new Float32Array(NF);
  for (let i = 0; i < NF; i++) {
    fx[i] = (R() - 0.5) * 36;
    fy[i] = -6 + R() * 24;
    fz[i] = (R() - 0.5) * 36;
    fs[i] = 0.07 + R() * 0.08;
  }
  set.add(flakes);
  const bank = banks(set, "#f6cdc6", "#8a6296", R);
  far(set);
  return {
    update(now, dt, wx, wz, wk) {
      city.tick(now);
      bank.rotation.y = now * 0.003;
      smoke.update(dt, wx * wk, wz * wk);
      crows.update(now);
      gold.emissive.setRGB(0.2 + Math.sin(now * 1.4) * 0.05, 0.11 + Math.sin(now * 1.4) * 0.03, 0);
      for (let k = 0; k < 3; k++) (auroras[k].material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.sin(now * 0.7 + k * 2) * 0.25;
      const blow = 1.2 + wk * 15;
      for (let i = 0; i < NF; i++) {
        fy[i] -= (1.3 + fs[i] * 6) * dt * (1 - wk * 0.4);
        fx[i] += (wx * blow + Math.sin(now * 1.3 + i) * 0.5) * dt;
        fz[i] += (wz * blow + Math.cos(now * 1.1 + i * 1.7) * 0.5) * dt;
        if (fy[i] < -6) fy[i] += 24;
        if (fx[i] > 18) fx[i] -= 36;
        else if (fx[i] < -18) fx[i] += 36;
        if (fz[i] > 18) fz[i] -= 36;
        else if (fz[i] < -18) fz[i] += 36;
        // (streaks in a gust: stretched along the wind)
        const st = 1 + wk * 5;
        q.setFromAxisAngle(UP, Math.atan2(wx, wz));
        m4.compose(v.set(fx[i], fy[i], fz[i]), q, sc.set(fs[i], fs[i], fs[i] * st));
        flakes.setMatrixAt(i, m4);
      }
      flakes.instanceMatrix.needsUpdate = true;
    },
    alarm: heaven.alarm,
  };
}

// ---- MARINA LILIES ------------------------------------------------------------------------------------

/** The bay's swell: a deep blue with slow lighter and darker patches, and a few clean crests (it tiles). */
function waterTex(R: Rnd) {
  return canvasTex(
    512,
    512,
    (g) => {
      g.fillStyle = "#0f2f52";
      g.fillRect(0, 0, 512, 512);
      const wrap = (x: number, y: number, r: number, f: (x: number, y: number) => void) => {
        for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) if (x + ox > -r && x + ox < 512 + r && y + oy > -r && y + oy < 512 + r) f(x + ox, y + oy);
      };
      // the swell: broad soft patches, a shade up or down
      for (let i = 0; i < 16; i++) {
        const x = R() * 512,
          y = R() * 512,
          r = 70 + R() * 90;
        const c = i % 2 ? "22,62,100" : "8,30,58";
        wrap(x, y, r, (px, py) => {
          const gr = g.createRadialGradient(px, py, 0, px, py, r);
          gr.addColorStop(0, `rgba(${c},0.5)`);
          gr.addColorStop(1, `rgba(${c},0)`);
          g.fillStyle = gr;
          g.fillRect(px - r, py - r, r * 2, r * 2);
        });
      }
      // the crests: short flat arcs, all lying the same way
      g.lineCap = "round";
      for (let i = 0; i < 34; i++) {
        const x = R() * 512,
          y = R() * 512,
          w = 26 + R() * 44;
        g.strokeStyle = i % 4 ? "rgba(74,132,186,0.5)" : "rgba(140,196,236,0.55)";
        g.lineWidth = i % 4 ? 3.5 : 3;
        wrap(x, y, w, (px, py) => {
          g.beginPath();
          g.moveTo(px - w / 2, py);
          g.quadraticCurveTo(px, py - w * 0.16, px + w / 2, py);
          g.stroke();
        });
      }
    },
    true,
  );
}

export function marinaScenery(s: THREE.Scene, sun: THREE.Vector3): Scenery {
  const R = rng(0x3a71a5);
  const set = new THREE.Group();
  s.add(set);
  // the bay: dark water in a slow swell, lit by the city
  const wTex = waterTex(R);
  wTex.repeat.set(30, 30);
  const water = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: wTex }));
  water.rotation.x = -Math.PI / 2;
  water.scale.set(900, 900, 1);
  water.position.y = WATER_Y;
  set.add(water);
  // the moon's glitter on the swell: small sparks that come and go (one draw; they lie on the water)
  const NG = 70;
  const glitter = new THREE.InstancedMesh(GEO.plane, glow("#cfe6ff", 0.9, true), NG);
  glitter.frustumCulled = false;
  glitter.renderOrder = 2;
  const gx = new Float32Array(NG),
    gz = new Float32Array(NG);
  for (let i = 0; i < NG; i++) {
    const a = R() * Math.PI * 2,
      d = 10 + R() * 34;
    gx[i] = Math.cos(a) * d;
    gz[i] = Math.sin(a) * d;
  }
  set.add(glitter);
  // the night closing in on the water away from the pads (the arena reads against the dark): clear over
  // the arena, deepening to 70 m out, the same from there to the far shore (one sheet over the whole bay)
  const dusk = canvasTex(512, 512, (g) => {
    const gr = g.createRadialGradient(256, 256, 7, 256, 256, 40);
    gr.addColorStop(0, "rgba(4,8,28,0)");
    gr.addColorStop(0.5, "rgba(4,8,28,0.4)");
    gr.addColorStop(1, "rgba(4,8,28,0.66)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
  });
  const night = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: dusk, transparent: true, depthWrite: false }));
  night.rotation.x = -Math.PI / 2;
  night.scale.set(920, 920, 1);
  night.position.y = WATER_Y + 0.016;
  night.renderOrder = 1;
  set.add(night);
  const fogC = `#${(s.fog as THREE.Fog).color.getHexString()}`;
  const heaven = sky(s, { sky: ["#04051a", fogC], ground: fogC, stars: 620, band: true, disc: { az: azOf(sun.x, sun.z), el: 11, moon: true, size: 9 }, haze: 0.3, rnd: R }, "#ff6a8a");
  far(skyline(s, { r: 170, n: 90, y: WATER_Y, rnd: R, night: true, tall: 1.7 }));
  // the three towers under their long sky park (far back), lit windows
  const win = canvasTex(
    64,
    256,
    (g) => {
      g.fillStyle = "#1c2244";
      g.fillRect(0, 0, 64, 256);
      for (let y = 3; y < 256; y += 6)
        for (let x = 3; x < 64; x += 6) {
          g.fillStyle = R() < 0.6 ? "#ffe1a0" : "#2c3466";
          g.fillRect(x, y, 4, 3);
        }
    },
    true,
  );
  const towerMat = new THREE.MeshToonMaterial({ map: win, gradientMap: toonSteps(), emissive: "#ffffff", emissiveMap: win, emissiveIntensity: 0.55 });
  const towers = new THREE.InstancedMesh(GEO.box, towerMat, 3);
  for (let k = 0; k < 3; k++) {
    m4.compose(v.set(-30 + k * 16, WATER_Y + 34, -96), q.setFromAxisAngle(UP, 0.12 * (k - 1)), sc.set(10, 68, 8));
    towers.setMatrixAt(k, m4);
  }
  set.add(towers);
  const park = new THREE.Mesh(GEO.box, toon("#dfe6ff", "#3a3a6a"));
  park.scale.set(56, 2.2, 9);
  park.position.set(-18, WATER_Y + 69.5, -96);
  outline(park, 0.2);
  set.add(park);
  // the grove of glowing trees round the bay (trunks of light, canopies like open umbrellas, a lit rim)
  const trunkTex = canvasTex(
    32,
    128,
    (g) => {
      g.fillStyle = "#5a2a7a";
      g.fillRect(0, 0, 32, 128);
      g.strokeStyle = "#ff7ad8";
      g.lineWidth = 2;
      for (let y = -32; y < 160; y += 10) (g.beginPath(), g.moveTo(0, y), g.lineTo(32, y + 16), g.moveTo(32, y), g.lineTo(0, y + 16), g.stroke());
    },
    true,
  );
  trunkTex.repeat.set(3, 2);
  // (well back: the fly-over sees the grove whole, the play camera only the bay)
  const trees: [number, number, number][] = [
    [-34, -34, 18],
    [-22, -44, 24],
    [-6, -50, 20],
    [10, -46, 27],
    [26, -40, 19],
    [40, -30, 15],
    [-46, -22, 14],
    [-40, -48, 30],
    [52, -18, 12],
    [18, -60, 22],
  ];
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.75, 0.42, 1, 10, 1, true), new THREE.MeshToonMaterial({ map: trunkTex, gradientMap: toonSteps(), emissive: "#ffffff", emissiveMap: trunkTex, emissiveIntensity: 0.7 }), trees.length);
  const canopies = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.2, 0.45, 16, 1, true), new THREE.MeshToonMaterial({ map: trunkTex, gradientMap: toonSteps(), emissive: "#ffffff", emissiveMap: trunkTex, emissiveIntensity: 0.9, side: THREE.DoubleSide }), trees.length);
  const rims = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.05, 5, 32), glow("#7fe0ff"), trees.length);
  trees.forEach(([x, z, h], k) => {
    m4.compose(v.set(x, WATER_Y + h / 2, z), q.identity(), sc.set(1, h, 1));
    trunks.setMatrixAt(k, m4);
    const r = 3.2 + h * 0.12;
    m4.compose(v.set(x, WATER_Y + h + r * 0.2, z), q.identity(), sc.set(r, r, r));
    canopies.setMatrixAt(k, m4);
    q.setFromAxisAngle(v.set(1, 0, 0), Math.PI / 2);
    m4.compose(v.set(x, WATER_Y + h + r * 0.43, z), q, sc.set(r, r, r));
    rims.setMatrixAt(k, m4);
    rims.setColorAt(k, col.set(k % 2 ? "#ff7ad8" : "#7fe0ff"));
  });
  set.add(trunks, canopies, rims);
  // lanterns bobbing on the water, lotus flowers, little pads (well clear of the arena)
  const NL = 30;
  const lanterns = new THREE.InstancedMesh(GEO.box, toon("#ff5a3a", "#ff8a3a"), NL);
  const halos = new THREE.InstancedMesh(GEO.disc, new THREE.MeshBasicMaterial({ map: haloTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), NL);
  halos.frustumCulled = false;
  halos.renderOrder = 2;
  set.add(halos);
  const lx = new Float32Array(NL),
    lz = new Float32Array(NL),
    la = new Float32Array(NL);
  for (let i = 0; i < NL; i++) {
    const a = R() * Math.PI * 2,
      d = 15 + R() * 22;
    lx[i] = Math.cos(a) * d;
    lz[i] = Math.sin(a) * d;
    la[i] = R() * 6;
  }
  set.add(lanterns);
  const NLO = 9;
  const petals = new THREE.InstancedMesh(GEO.cone, toon("#ff8fc8", "#4a1030"), NLO * 8);
  const hearts = new THREE.InstancedMesh(GEO.ball, toon("#ffe26a", "#4a3000"), NLO);
  // (the leaves round each flower: small and dark, nothing a ball could land on)
  const little = new THREE.InstancedMesh(GEO.cyl, toon("#2f7f3c", "#061a0c"), NLO * 2);
  for (let i = 0; i < NLO; i++) {
    const a = (i / NLO) * Math.PI * 2 + R() * 0.4,
      d = 14.6 + R() * 5;
    const x = Math.cos(a) * d,
      z = Math.sin(a) * d;
    for (let p = 0; p < 8; p++) {
      const pa = (p / 8) * Math.PI * 2;
      q.setFromAxisAngle(v.set(Math.cos(pa + Math.PI / 2), 0, -Math.sin(pa + Math.PI / 2)), 0.55);
      m4.compose(v.set(x + Math.cos(pa) * 0.32, WATER_Y + 0.45, z - Math.sin(pa) * 0.32), q, sc.set(0.5, 0.9, 0.5));
      petals.setMatrixAt(i * 8 + p, m4);
    }
    m4.compose(v.set(x, WATER_Y + 0.38, z), q.identity(), sc.setScalar(0.42));
    hearts.setMatrixAt(i, m4);
    for (let p = 0; p < 2; p++) {
      const r = 0.7 + R() * 0.5;
      m4.compose(v.set(x + (p ? 1.4 : -1.2), WATER_Y + 0.04, z + (p ? 0.6 : -0.9)), q.identity(), sc.set(r * 2, 0.08, r * 2));
      little.setMatrixAt(i * 2 + p, m4);
    }
  }
  set.add(petals, hearts, little);
  // fireflies over the water round the pads (they wander, they blink)
  const NFF = 46;
  const flies = new THREE.InstancedMesh(GEO.box, glow("#d8ff7a"), NFF);
  flies.frustumCulled = false;
  const ffa = new Float32Array(NFF),
    ffr = new Float32Array(NFF),
    ffy = new Float32Array(NFF);
  for (let i = 0; i < NFF; i++) ((ffa[i] = R() * Math.PI * 2), (ffr[i] = 11 + R() * 14), (ffy[i] = 0.4 + R() * 2.6));
  set.add(flies);
  // little lit boats crossing the bay, each trailing a wake
  const NB = 4;
  const hulls = new THREE.InstancedMesh(GEO.box, toon("#f4f0e8", "#1a1a2a"), NB);
  const cabins = new THREE.InstancedMesh(GEO.box, toon("#ff5fa2", "#3a0a20"), NB);
  const lamps = new THREE.InstancedMesh(GEO.box, glow("#ffe7a0"), NB * 2);
  const wakes = new THREE.InstancedMesh(GEO.box, glow("#9fd0ee", 0.35), NB * 3);
  for (const m of [hulls, cabins, lamps, wakes]) m.frustumCulled = false;
  set.add(hulls, cabins, lamps, wakes);
  // two searchlights sweeping the sky from the sky park (the fly-over sees them)
  const beamMat = new THREE.MeshBasicMaterial({ color: "#bfe8ff", transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beamGeo = new THREE.CylinderGeometry(0.6, 9, 140, 16, 1, true);
  beamGeo.translate(0, 70, 0);
  const beams = [0, 1].map((k) => {
    const b = new THREE.Mesh(beamGeo, beamMat);
    b.position.set(-34 + k * 32, WATER_Y + 70, -96);
    set.add(b);
    return b;
  });
  far(set);
  return {
    update(now) {
      wTex.offset.set(Math.sin(now * 0.05) * 0.02, now * 0.005);
      heaven.dome.rotation.y = now * 0.0015;
      for (let i = 0; i < NFF; i++) {
        const a = ffa[i] + now * (0.05 + (i % 5) * 0.012);
        const r = ffr[i] + Math.sin(now * 0.7 + i) * 0.8;
        const on = Math.sin(now * (2 + (i % 3)) + i * 1.7) > -0.2 ? 0.11 : 0.03;
        m4.compose(v.set(Math.cos(a) * r, WATER_Y + ffy[i] + Math.sin(now * 1.3 + i) * 0.3, Math.sin(a) * r), q.identity(), sc.setScalar(on));
        flies.setMatrixAt(i, m4);
      }
      flies.instanceMatrix.needsUpdate = true;
      for (let k = 0; k < NB; k++) {
        const dirn = k % 2 ? 1 : -1;
        const a = now * (0.035 + k * 0.008) * dirn + k * 1.6;
        const r = 21 + k * 4.5;
        const x = Math.cos(a) * r,
          z = Math.sin(a) * r;
        // (its bow along its way round: the circle's tangent)
        const yaw = Math.atan2(-Math.sin(a) * dirn, Math.cos(a) * dirn);
        q.setFromEuler(eu.set(Math.sin(now * 1.7 + k) * 0.04, yaw, 0));
        m4.compose(v.set(x, WATER_Y + 0.18, z), q, sc.set(1.1, 0.4, 2.8));
        hulls.setMatrixAt(k, m4);
        m4.compose(v.set(x, WATER_Y + 0.6, z), q, sc.set(0.8, 0.5, 1.1));
        cabins.setMatrixAt(k, m4);
        for (let l = 0; l < 2; l++) {
          v2.set(0, 0.45, l ? 1.3 : -1.3).applyQuaternion(q);
          m4.compose(v.set(x + v2.x, WATER_Y + v2.y, z + v2.z), q, sc.setScalar(0.18));
          lamps.setMatrixAt(k * 2 + l, m4);
        }
        // (the wake: three widening bars astern, the last the faintest by its size)
        for (let l = 0; l < 3; l++) {
          v2.set(0, 0, -2.2 - l * 1.5).applyQuaternion(q);
          m4.compose(v.set(x + v2.x, WATER_Y + 0.03, z + v2.z), q, sc.set(1.2 + l * 0.9, 0.02, 0.22 - l * 0.05));
          wakes.setMatrixAt(k * 3 + l, m4);
        }
      }
      hulls.instanceMatrix.needsUpdate = true;
      cabins.instanceMatrix.needsUpdate = true;
      lamps.instanceMatrix.needsUpdate = true;
      wakes.instanceMatrix.needsUpdate = true;
      // (the grove's rims chase through their colours)
      for (let k = 0; k < trees.length; k++) rims.setColorAt(k, col.setHSL((now * 0.08 + k * 0.13) % 1, 0.9, 0.62));
      rims.instanceColor!.needsUpdate = true;
      for (let k = 0; k < 2; k++) beams[k].rotation.set(0.35 * Math.sin(now * 0.3 + k * 2), 0, 0.5 * Math.sin(now * 0.23 + k * 1.3));
      for (let i = 0; i < NL; i++) {
        const y = WATER_Y + 0.3 + Math.sin(now * 1.6 + la[i]) * 0.08;
        m4.compose(v.set(lx[i], y, lz[i]), q.setFromAxisAngle(UP, la[i] + now * 0.2), sc.set(0.5, 0.62, 0.5));
        lanterns.setMatrixAt(i, m4);
        // (its glow on the water)
        q.setFromAxisAngle(v2.set(1, 0, 0), -Math.PI / 2);
        const hs = 2.4 + Math.sin(now * 3 + la[i] * 2) * 0.25;
        m4.compose(v.set(lx[i], WATER_Y + 0.03, lz[i]), q, sc.set(hs, hs, hs));
        halos.setMatrixAt(i, m4);
      }
      lanterns.instanceMatrix.needsUpdate = true;
      halos.instanceMatrix.needsUpdate = true;
      // (each spark swells and dies on its own beat: a diamond lying on the water)
      eu.set(-Math.PI / 2, 0, Math.PI / 4);
      q.setFromEuler(eu);
      for (let i = 0; i < NG; i++) {
        const k = Math.max(0, Math.sin(now * (1.1 + (i % 7) * 0.23) + i * 2.4));
        const sz = k * k * k * (0.13 + (i % 3) * 0.04);
        m4.compose(v.set(gx[i], WATER_Y + 0.025, gz[i]), q, sc.set(sz, sz, 1));
        glitter.setMatrixAt(i, m4);
      }
      glitter.instanceMatrix.needsUpdate = true;
    },
    alarm: heaven.alarm,
  };
}
