/**
 * The scenery of HALO FALL's levels (levels.ts): NU7 TOWER (ZStreet at dusk far below: streets
 * with their lamps on, blocks and parks, towers with lit windows and their roofs, warning beacons, the
 * sun going down in a sky of pink clouds, a blimp, birds, the evening traffic, clouds drifting between
 * the city and the floors), FROZEN LAKE (the same city under snow at night, the NU7 TOWER and its
 * golden crown, the ZK MALL's tent, the frozen river, the moon, an aurora, falling snow, sky lanterns
 * round the rinks, traffic, fireworks) and SPIN STATION (the Earth below, its limb and its air, its
 * clouds turning, a dome of stars, a nebula, the sun, a ring station turning under the decks, girders
 * and thruster pods under each deck that turn with it, sparks flung off the arm tips, satellites,
 * drifting rocks, a passing shuttle). Floating Z-Blocks on all. The tower's own frame is the
 * game's (../lattice.ts).
 *
 * Each level's sky is a dome (k3 skyDome) whose horizon is the fog's colour: the far city fades into
 * it with no seam. What is under the floors is kept darker and hazier than the tiles played on.
 *
 * Draw-side only: its own seeded randoms (never the game's), its motion from the game's clock.
 * Instanced where pieces repeat; everything hangs off the scene, so the game's disposeScene() frees it.
 */
import * as THREE from "three";
import { rng, shade } from "../../kit";
import { GEO, canvasTex, glow, label, mixHex, outline, qTex, skyDome, skyline, toon, toonSteps, type Fx3 } from "../../k3";
import { markGlow } from "../../post";
import type { Level } from "./levels";

export interface SceneryCtx {
  L: Level;
  /** The floors' heights (top to bottom), the city's (or the Earth's) level. */
  FY: readonly number[];
  cityY: number;
  /** Each floor's reach from its middle (m), and its half-size along x and z. */
  ext: readonly number[];
  halfX: readonly number[];
  halfZ: readonly number[];
  fx: Fx3;
}

export interface Deco {
  /** Every frame: the clock, the step, the floors' turn (yaw, rad), how solid each floor is (1; a ghost over the camera's floor: ~0). */
  update(now: number, dt: number, ang: readonly number[], alpha: readonly number[]): void;
}

const v = new THREE.Vector3();
const v2 = new THREE.Vector3();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const m4 = new THREE.Matrix4();
const sc = new THREE.Vector3();
const col = new THREE.Color();
const eb = new THREE.Euler(0, 0, 0, "YXZ");

/** A soft round dot (snow, stars). */
function dotTex() {
  return canvasTex(32, 32, (g) => {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.45, "rgba(255,255,255,0.85)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
  });
}

/** A #rrggbb colour as rgba(). */
const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** A soft glow (a sun's or a moon's halo). */
function haloTex(inner: string, outer: string) {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, inner);
    gr.addColorStop(0.35, outer);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

/** A sun or a moon far off: a bright disc and its halo, facing the arena (two draws, no fog). */
function orb(s: THREE.Scene, x: number, y: number, z: number, r: number, core: string, haloIn: string, haloOut: string, haloK = 5) {
  const disc = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ color: core, fog: false }));
  disc.position.set(x, y, z);
  disc.scale.setScalar(r * 2);
  disc.lookAt(0, 8, 0);
  const halo = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: haloTex(haloIn, haloOut), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.position.copy(disc.position);
  halo.scale.setScalar(r * 2 * haloK);
  halo.lookAt(0, 8, 0);
  s.add(disc, halo);
  return { disc, halo };
}

/** Golden Z-Blocks floating round the arena, spinning and bobbing: one draw, and one for their ink. */
class QBlocks {
  private box: THREE.InstancedMesh;
  private ink: THREE.InstancedMesh;
  constructor(
    s: THREE.Scene,
    private at: readonly number[][],
    private size = 1.3,
  ) {
    this.box = new THREE.InstancedMesh(GEO.box, new THREE.MeshToonMaterial({ map: qTex(), gradientMap: toonSteps(), emissive: 0x4a3000 }), at.length);
    this.ink = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide }), at.length);
    this.box.raycast = this.ink.raycast = () => {};
    this.box.frustumCulled = this.ink.frustumCulled = false;
    s.add(this.box, this.ink);
    this.update(0);
  }
  update(now: number) {
    for (let i = 0; i < this.at.length; i++) {
      const [x, y, z] = this.at[i];
      e.set(0.25 * Math.sin(now * 0.7 + i), now * 1.1 + i * 1.7, 0.2);
      q.setFromEuler(e);
      v.set(x, y + Math.sin(now * 1.4 + i * 2.1) * 0.45, z);
      m4.compose(v, q, sc.setScalar(this.size));
      this.box.setMatrixAt(i, m4);
      m4.compose(v, q, sc.setScalar(this.size * 1.09));
      this.ink.setMatrixAt(i, m4);
    }
    this.box.instanceMatrix.needsUpdate = this.ink.instanceMatrix.needsUpdate = true;
  }
}

/** The evening traffic far below: headlights and tail lights running along the avenues (one draw). */
class Traffic {
  private mesh: THREE.InstancedMesh;
  private road: Float32Array;
  private pos: Float32Array;
  private sp: Float32Array;
  private axis: Uint8Array;
  constructor(
    s: THREE.Scene,
    private y: number,
    cell: number,
    private span: number,
    R: () => number,
    n = 110,
  ) {
    this.mesh = new THREE.InstancedMesh(GEO.box, markGlow(new THREE.MeshBasicMaterial({ color: 0xffffff }), 0.6), n);
    this.road = new Float32Array(n);
    this.pos = new Float32Array(n);
    this.sp = new Float32Array(n);
    this.axis = new Uint8Array(n);
    const lanes = Math.floor(span / cell);
    for (let i = 0; i < n; i++) {
      this.axis[i] = i % 2;
      const dir = R() < 0.5 ? -1 : 1;
      // (two lanes a road: one each way, a metre off the middle; the roads run between the blocks)
      this.road[i] = (Math.floor(R() * 2 * lanes) - lanes) * cell + dir * 1.1;
      this.pos[i] = (R() * 2 - 1) * span;
      this.sp[i] = dir * (9 + R() * 7);
      this.mesh.setColorAt(i, col.set(dir > 0 ? "#fff2c8" : "#ff5a4a"));
    }
    this.mesh.raycast = () => {};
    this.mesh.frustumCulled = false;
    s.add(this.mesh);
  }
  update(dt: number) {
    for (let i = 0; i < this.pos.length; i++) {
      let p = this.pos[i] + this.sp[i] * dt;
      if (p > this.span) p -= 2 * this.span;
      else if (p < -this.span) p += 2 * this.span;
      this.pos[i] = p;
      if (this.axis[i]) m4.compose(v.set(this.road[i], this.y, p), q.identity(), sc.set(1.3, 0.7, 2.8));
      else m4.compose(v.set(p, this.y, this.road[i]), q.identity(), sc.set(2.8, 0.7, 1.3));
      this.mesh.setMatrixAt(i, m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A flock wheeling round the arena, wings flapping (one draw: two thin boxes a bird). */
class Birds {
  private mesh: THREE.InstancedMesh;
  constructor(
    s: THREE.Scene,
    private n: number,
    private r: number,
    private y: number,
    color: string,
  ) {
    this.mesh = new THREE.InstancedMesh(GEO.box, toon(color, "#1a1030"), n * 2);
    this.mesh.raycast = () => {};
    this.mesh.frustumCulled = false;
    s.add(this.mesh);
  }
  update(now: number) {
    for (let b = 0; b < this.n; b++) {
      const a = now * 0.16 + b * 0.21 + (b % 3) * 0.05;
      const r = this.r + (b % 4) * 2.2;
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r,
        y = this.y + Math.sin(b * 1.3) * 2 + Math.sin(now * 0.8 + b) * 0.6;
      const yaw = -a;
      const flap = Math.sin(now * 9 + b * 1.7) * 0.6;
      for (let w = 0; w < 2; w++) {
        const side = w ? 1 : -1;
        eb.set(0, yaw, side * flap);
        q.setFromEuler(eb);
        // (each wing sticks out sideways from the body)
        v2.set(side * 0.45, 0, 0).applyQuaternion(q);
        m4.compose(v.set(x + v2.x, y + v2.y, z + v2.z), q, sc.set(0.9, 0.08, 0.32));
        this.mesh.setMatrixAt(b * 2 + w, m4);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Stars all round, below the eye too (in orbit no ground hides them): one draw. */
function starField(s: THREE.Scene, n: number, r: number, size: number, R: () => number) {
  const st = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2;
    const u = R() * 2 - 1;
    const k = Math.sqrt(1 - u * u);
    st[i * 3] = Math.cos(a) * k * r;
    st[i * 3 + 1] = u * r;
    st[i * 3 + 2] = Math.sin(a) * k * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(st, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTex(), size, sizeAttenuation: false, transparent: true, depthWrite: false, color: "#fff8ec", fog: false }));
  p.frustumCulled = false;
  s.add(p);
  return p;
}

/**
 * The haze the far city stands in: a wide ring round the arena, the fog's colour at the ground and clear by `y1`.
 * The ground's far edge (the fog's colour) meets it, and over it the sky's own horizon shows: a city in haze
 * under a sky of another colour, with no seam where the ground stops. One draw.
 */
function hazeSkirt(s: THREE.Scene, color: string, r: number, y0: number, y1: number) {
  const tex = canvasTex(4, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, hexA(color, 0));
    gr.addColorStop(0.2, hexA(color, 0.45));
    gr.addColorStop(0.45, hexA(color, 1));
    gr.addColorStop(1, hexA(color, 1));
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 128);
  });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, y1 - y0, 48, 1, true), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false }));
  m.position.y = (y0 + y1) / 2;
  m.renderOrder = -900;
  m.raycast = () => {};
  s.add(m);
  return m;
}

// ---- the city far below (NU7 TOWER at dusk, FROZEN LAKE under snow) ----------------------------------

/** A city's look from above: the ground's paint, the towers, their roofs. */
interface CityLook {
  /** The streets, the pavement round a block, the blocks' yards, a park, the lanes' dashes, the street lamps. */
  street: string;
  kerb: string;
  yards: string[];
  park: string;
  dash: string;
  lamp: string;
  /** The towers' walls, their windows dark and lit (the share lit, how hard they glow), their roofs (snow: a cap wider than the walls). */
  walls: string[];
  dark: string;
  lit: string[];
  litK: number;
  glow: number;
  roofs: string[];
  roofGlow: string;
  snow: boolean;
  /** A block's side (m) and how many each way; how tall the towers get, near the floors and further out. */
  cell: number;
  n: number;
  tall: [number, number];
  /** No tower here (a river, a landmark's square). */
  open?: (x: number, z: number) => boolean;
}

/**
 * The city under the floors: the streets' plane (four blocks a tile of paint: pavements, yards, parks, the lamps
 * alight), a tower a block with lit windows, a roof on each (so nothing is seen from above but clean roofs), a
 * plant room on the roofs, red beacons on the tallest. Five draws. Returns the beacons (they blink).
 */
function cityBelow(s: THREE.Scene, Y: number, k: CityLook, R: () => number) {
  const C = 128;
  const paint = (g: CanvasRenderingContext2D, emi: boolean) => {
    g.fillStyle = emi ? "#000000" : k.street;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const x = i * C,
          y = j * C;
        // (steady, not drawn at random: the paint and its glow are painted alike)
        const h = (i * 7 + j * 13 + i * j * 3) % 16;
        if (!emi) {
          g.fillStyle = k.kerb;
          g.fillRect(x + 12, y + 12, C - 24, C - 24);
          const park = h === 5 || h === 12;
          g.fillStyle = park ? k.park : k.yards[h % k.yards.length];
          g.fillRect(x + 17, y + 17, C - 34, C - 34);
          if (park) {
            // a park: its paths, its trees (squares, the city's own pixels)
            g.fillStyle = k.kerb;
            g.fillRect(x + 60, y + 17, 8, C - 34);
            g.fillRect(x + 17, y + 60, C - 34, 8);
            g.fillStyle = shade(k.park, -0.28);
            for (let t = 0; t < 8; t++) g.fillRect(x + 24 + ((t * 37) % 76), y + 24 + ((t * 53) % 76), 9, 9);
          } else {
            // a yard: the shadow at the towers' foot, a lighter court
            g.fillStyle = "rgba(0,0,0,0.2)";
            g.fillRect(x + 28, y + 28, C - 56, C - 56);
            g.fillStyle = "rgba(255,255,255,0.07)";
            g.fillRect(x + 17, y + 17, C - 34, 5);
          }
        }
        // the lamps: at the crossing's corners and half-way along each street, a pool of light under each
        const lamps = [
          [x + 12, y + 12],
          [x + C - 12, y + 12],
          [x + 12, y + C - 12],
          [x + C - 12, y + C - 12],
          [x + C / 2, y + 12],
          [x + C / 2, y + C - 12],
          [x + 12, y + C / 2],
          [x + C - 12, y + C / 2],
        ];
        for (const [lx, ly] of lamps) {
          const gr = g.createRadialGradient(lx, ly, 0, lx, ly, 13);
          gr.addColorStop(0, hexA(k.lamp, emi ? 0.5 : 0.3));
          gr.addColorStop(1, hexA(k.lamp, 0));
          g.fillStyle = gr;
          g.fillRect(lx - 13, ly - 13, 26, 26);
          g.fillStyle = k.lamp;
          g.fillRect(lx - 2, ly - 2, 4, 4);
        }
      }
    if (emi) return;
    // the lanes' dashes down the middle of every street (the streets straddle the tile's edges)
    g.fillStyle = k.dash;
    for (let j = 0; j <= 4; j++)
      for (let d = 6; d < 512; d += 16) {
        g.fillRect(d, j * C - 1.5, 8, 3);
        g.fillRect(j * C - 1.5, d, 3, 8);
      }
  };
  const gmap = canvasTex(512, 512, (g) => paint(g, false), true);
  const gemi = canvasTex(512, 512, (g) => paint(g, true), true);
  const SPAN = k.cell * 4 * 30;
  gmap.repeat.set(30, 30);
  gemi.repeat.set(30, 30);
  gmap.anisotropy = gemi.anisotropy = 8;
  const ground = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: gmap, emissive: 0xffffff, emissiveMap: gemi, gradientMap: toonSteps() }));
  ground.rotation.x = -Math.PI / 2;
  ground.scale.set(SPAN, SPAN, 1);
  ground.position.y = Y;
  ground.raycast = () => {};
  s.add(ground);
  // the towers: walls of the instance's colour with dark windows, the lit ones glowing (and only them)
  const wins = (g: CanvasRenderingContext2D, emi: boolean) => {
    g.fillStyle = emi ? "#000000" : "#ffffff";
    g.fillRect(0, 0, 64, 128);
    const W = rng(0x51a7);
    for (let y = 6; y < 128; y += 12)
      for (let x = 5; x < 64; x += 12) {
        const on = W() < k.litK;
        const c = k.lit[Math.floor(W() * k.lit.length)];
        if (emi && !on) continue;
        g.fillStyle = on ? c : k.dark;
        g.fillRect(x, y, 7, 7);
      }
  };
  const wmap = canvasTex(64, 128, (g) => wins(g, false), true);
  const wemi = canvasTex(64, 128, (g) => wins(g, true), true);
  const N = k.n * k.n;
  const towers = new THREE.InstancedMesh(GEO.box, markGlow(new THREE.MeshToonMaterial({ map: wmap, gradientMap: toonSteps(), emissive: new THREE.Color(k.glow, k.glow, k.glow), emissiveMap: wemi }), 0.35), N);
  const roofs = new THREE.InstancedMesh(GEO.box, toon("#ffffff", k.roofGlow), N);
  const plant = new THREE.InstancedMesh(GEO.box, toon("#ffffff", k.roofGlow), N);
  const tops: number[] = [];
  let n = 0,
    np = 0;
  for (let i = 0; i < k.n; i++)
    for (let j = 0; j < k.n; j++) {
      const x = (i - k.n / 2 + 0.5) * k.cell,
        z = (j - k.n / 2 + 0.5) * k.cell;
      const skip = R() < 0.2;
      const w = k.cell * (0.55 + R() * 0.2);
      const d2 = w * (0.8 + R() * 0.4);
      const far = Math.hypot(x, z) >= 46;
      const h = 5 + R() * R() * k.tall[far ? 1 : 0];
      const roof = k.roofs[Math.floor(R() * k.roofs.length)];
      const px = (R() - 0.5) * w * 0.4,
        pz = (R() - 0.5) * d2 * 0.4;
      if (skip || k.open?.(x, z)) continue;
      m4.compose(v.set(x, Y + h / 2, z), q.identity(), sc.set(w, h, d2));
      towers.setMatrixAt(n, m4);
      towers.setColorAt(n, col.set(k.walls[(i * 7 + j * 3) % k.walls.length]));
      const lip = k.snow ? 0.6 : 0.3;
      m4.compose(v.set(x, Y + h + 0.3, z), q.identity(), sc.set(w + lip, 0.7, d2 + lip));
      roofs.setMatrixAt(n, m4);
      roofs.setColorAt(n, col.set(roof));
      n++;
      if (h > 9) {
        m4.compose(v.set(x + px, Y + h + 1.3, z + pz), q.identity(), sc.set(w * 0.34, 1.4, d2 * 0.3));
        plant.setMatrixAt(np, m4);
        plant.setColorAt(np++, col.set(shade(roof, -0.22)));
      }
      if (h > k.tall[1] * 0.42) tops.push(x + px, Y + h + 2.5, z + pz);
    }
  towers.count = roofs.count = n;
  plant.count = np;
  const beacons = new THREE.InstancedMesh(GEO.box, glow("#ff4a4a"), Math.max(1, tops.length / 3));
  for (let i = 0; i < tops.length / 3; i++) {
    m4.compose(v.set(tops[i * 3], tops[i * 3 + 1], tops[i * 3 + 2]), q.identity(), sc.set(0.7, 1.1, 0.7));
    beacons.setMatrixAt(i, m4);
  }
  beacons.count = tops.length / 3;
  for (const m of [towers, roofs, plant, beacons]) {
    m.raycast = () => {};
    // (far below the floors, out of the sun's shadow map: none to cast, none to take)
    m.userData.noShadow = true;
    s.add(m);
  }
  ground.userData.noShadow = true;
  return beacons;
}

// ---- NU7 TOWER --------------------------------------------------------------------------------------

export function towerScenery(s: THREE.Scene, c: SceneryCtx): Deco {
  const R = rng(0x70e1);
  const Y = c.cityY;
  // the dusk: indigo overhead down to a band of fire on the horizon, the sun going down in it behind the
  // city (where the light comes from: levels.ts sunAt), long pink clouds, the first stars
  skyDome(s, {
    sky: ["#1b1456", "#ff9a72"],
    ground: c.L.sky[1],
    clouds: 13,
    cloud: "#ffb7a2",
    cloudShade: "#a85a8e",
    stars: 130,
    disc: { az: 295, el: 6.5, color: "#ffe6b4", size: 10, glow: 5.5 },
    haze: 0.5,
    rnd: rng(0x70e2),
  });
  const beacons = cityBelow(
    s,
    Y,
    {
      street: "#2a2446",
      kerb: "#544a78",
      yards: ["#625688", "#6c5c8a", "#56608a", "#66598c"],
      park: "#3c6c62",
      dash: "#8880b4",
      lamp: "#ffcf8a",
      walls: ["#7d72b0", "#6c80a8", "#9a7c9e", "#8478b8", "#8b8ab4", "#a4828e", "#6c9296"],
      dark: "#9a92c0",
      lit: ["#ffe0a8", "#ffcf90", "#f6dcc0"],
      litK: 0.3,
      glow: 0.42,
      roofs: ["#6e6694", "#786a92", "#647096", "#80708e"],
      roofGlow: "#140e24",
      snow: false,
      cell: 12.5,
      n: 26,
      tall: [16, 40],
    },
    R,
  );
  skyline(s, { r: 196, n: 84, y: Y, rnd: R, tall: 0.95, night: true });
  hazeSkirt(s, c.L.sky[1], 700, Y - 4, 46);
  // clouds drifting between the city and the floors, lit from under by the sunset (dimmer than the tiles over them)
  const puffs = 4;
  const nC = 16;
  const cloudMesh = new THREE.InstancedMesh(GEO.box, toon("#e8a6b4", "#3c2a5c"), nC * puffs);
  let ci = 0;
  for (let i = 0; i < nC; i++) {
    const low = i < 11;
    const a = (i / 11) * Math.PI * 2 + R() * 0.5;
    const d = low ? 26 + R() * 50 : 80 + R() * 70;
    const cy = low ? -24 - R() * 18 : 30 + R() * 24;
    const k = low ? 0.9 + R() * 0.6 : 1.4 + R();
    for (let p = 0; p < puffs; p++) {
      const big = p === 1 || p === 2;
      const ox = (p - 1.5) * 3.2 * k,
        oz = (R() - 0.5) * 2.4 * k;
      const w = (big ? 5.2 : 3.6) * k;
      m4.compose(v.set(Math.cos(a) * d + ox, cy + (big ? 1.2 : 0) * k, Math.sin(a) * d + oz), q.identity(), sc.set(w, w * 0.78, w * 0.9));
      cloudMesh.setMatrixAt(ci++, m4);
    }
  }
  cloudMesh.raycast = () => {};
  cloudMesh.userData.noShadow = true;
  s.add(cloudMesh);
  // the ZStreet blimp, circling the tower slowly, its banner lit
  const blimp = new THREE.Group();
  const env = new THREE.Mesh(GEO.ball, toon("#ff6b35", "#5a1a08"));
  env.scale.set(11, 3.8, 3.8);
  outline(env, 0.12);
  const stripe = new THREE.Mesh(GEO.ball, toon("#ffd23f", "#5a3a00"));
  stripe.scale.set(11.2, 1.1, 3.9);
  const finV = new THREE.Mesh(GEO.box, toon("#c4b1fc", "#2a1a5a"));
  finV.scale.set(1.8, 2.6, 0.2);
  finV.position.set(-5, 1.2, 0);
  const finH = finV.clone();
  finH.scale.set(1.8, 0.2, 3);
  finH.position.set(-5, 0, 0);
  const gond = new THREE.Mesh(GEO.box, toon("#3a2a6a", "#100820"));
  gond.scale.set(2.6, 0.8, 1);
  gond.position.y = -2.1;
  const ban = label("ZSTREET ◆ NU7", 1.3, "#ffffff", "rgba(40,16,80,0.85)");
  ban.position.set(0.5, 0, 1.97);
  const ban2 = ban.clone();
  ban2.position.z = -1.97;
  ban2.rotation.y = Math.PI;
  const lamp = new THREE.Mesh(GEO.box, glow("#ff3a3a"));
  lamp.scale.setScalar(0.35);
  lamp.position.set(5.6, 0.3, 0);
  blimp.add(env, stripe, finV, finH, gond, ban, ban2, lamp);
  blimp.traverse((o) => (o.userData.noShadow = true));
  s.add(blimp);
  const traffic = new Traffic(s, Y + 0.5, 12.5, 150, R);
  const birds = new Birds(s, 11, 30, c.FY[0] + 4, "#2a1a40");
  const qb = new QBlocks(s, [
    [-17, c.FY[0] + 3, -9],
    [18, c.FY[0] + 1.5, -6],
    [-21, c.FY[1] + 2, 4],
    [22, c.FY[1] + 3, 2],
    [-24, c.FY[2] + 2.5, -5],
    [25, c.FY[2] + 1.5, -10],
  ]);
  return {
    update(now, dt) {
      const a = now * 0.045 + 1.2;
      // (wide and high: in the fly-over's sky, never between the play camera and the floors)
      blimp.position.set(Math.cos(a) * 72, c.FY[0] + 24 + Math.sin(now * 0.4) * 0.8, Math.sin(a) * 60 - 30);
      blimp.rotation.y = -a - Math.PI / 2;
      lamp.visible = Math.sin(now * 5) > 0.2;
      // (the towers' beacons: a slow blink, all together, as a city's do)
      beacons.visible = now % 2.4 < 1.5;
      cloudMesh.rotation.y = now * 0.004;
      traffic.update(dt);
      birds.update(now);
      qb.update(now);
    },
  };
}

// ---- FROZEN LAKE (key "astana") ---------------------------------------------------------------------

export function astanaScenery(s: THREE.Scene, c: SceneryCtx): Deco {
  const R = rng(0xa57a);
  const Y = c.cityY;
  // the night over the woods: stars and their milky band, the full moon behind the rinks (where the light
  // comes from: levels.ts sunAt), a few snow clouds, the city's glow along the horizon
  skyDome(s, {
    sky: ["#03061e", c.L.sky[1]],
    clouds: 7,
    cloud: "#42548c",
    cloudShade: "#28356a",
    stars: 700,
    band: true,
    disc: { az: 238, el: 22, moon: true, size: 7.5, glow: 3.4 },
    haze: 0.4,
    rnd: rng(0xa57b),
  });
  // the city far below, under snow, in the moon's shade: ploughed streets with their lamps on, white yards and
  // roofs (dimmer than the ice played on), warm windows; the river and the landmarks' squares stay open
  const cell = 13;
  const beacons = cityBelow(
    s,
    Y,
    {
      street: "#161d40",
      kerb: "#3c4a80",
      yards: ["#46568c", "#3f5088", "#4c5c92", "#3a4a82"],
      park: "#52649a",
      dash: "#2c3868",
      lamp: "#ffc680",
      walls: ["#3c4c80", "#46578c", "#344476", "#4c4a82", "#525e8e", "#3a547a", "#584f78"],
      dark: "#232a52",
      lit: ["#ffd890", "#ffc878", "#ffe6b0"],
      litK: 0.5,
      glow: 0.9,
      roofs: ["#5c6ea4", "#6678ac", "#54669c", "#6274a8"],
      roofGlow: "#0e1430",
      snow: true,
      cell,
      n: 24,
      tall: [18, 46],
      open: (x, z) => Math.abs(z - 18 - x * 0.12) < 16 || Math.hypot(x + 27, z + 30) < 14 || Math.hypot(x - 62, z + 104) < 30,
    },
    R,
  );
  // the frozen river: a wide pale band across the city, under the rinks
  const river = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ color: "#5f86c0", emissive: "#0e2248", gradientMap: toonSteps() }));
  river.rotation.x = -Math.PI / 2;
  river.rotation.z = 0.12;
  river.scale.set(900, 26, 1);
  river.position.set(0, Y + 0.05, 18);
  river.userData.noShadow = true;
  s.add(river);
  skyline(s, { r: 200, n: 80, y: Y, rnd: R, tall: 1, night: true });

  // the NU7 TOWER: a white trunk of ribs flaring into a crown that holds its golden ZEC gem
  // (low over the roofs, beside the rinks: from the play camera a golden gem on its white stem among the blocks, not a stick across the view)
  const bx = -27,
    bz = -30,
    ballY = Y + 40;
  const white = toon("#f4f8ff", "#3a4a70");
  const trunk = new THREE.InstancedMesh(GEO.box, white, 16);
  let k = 0;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    // a rib up the trunk (leaning out a little at the top)
    const r0 = 1.1;
    const h = ballY - 6 - Y;
    m4.compose(v.set(bx + Math.cos(a) * r0, Y + h / 2, bz + Math.sin(a) * r0), q.identity(), sc.set(0.4, h, 0.4));
    trunk.setMatrixAt(k++, m4);
    // a branch of the crown, flaring out round the ball
    e.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
    q.setFromEuler(e);
    m4.compose(v.set(bx + Math.cos(a) * 2.6, ballY - 3.2, bz + Math.sin(a) * 2.6), q, sc.set(0.36, 7.4, 0.36));
    trunk.setMatrixAt(k++, m4);
  }
  trunk.raycast = () => {};
  trunk.userData.noShadow = true;
  s.add(trunk);
  const ball = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshToonMaterial({ color: "#f4b728", emissive: "#8a4a0a", gradientMap: toonSteps() }));
  ball.scale.set(6.2, 8.2, 6.2);
  ball.position.set(bx, ballY, bz);
  outline(ball, 0.18);
  s.add(ball);
  const nu7 = label("NU7 TOWER", 2.4, "#fff3c4", "rgba(40,24,6,0.72)");
  nu7.position.set(bx, ballY + 7.5, bz);
  s.add(nu7);
  const halo = new THREE.Mesh(GEO.ball, new THREE.MeshBasicMaterial({ color: "#ffb84a", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(9.5);
  halo.position.copy(ball.position);
  s.add(halo);
  // the ZK MALL: the great leaning tent, lit from inside
  const tent = new THREE.Mesh(new THREE.ConeGeometry(28, 54, 24, 1, true), new THREE.MeshToonMaterial({ color: "#8f7a7e", emissive: "#3a2818", gradientMap: toonSteps(), side: THREE.DoubleSide }));
  tent.position.set(62, Y + 27, -104);
  tent.rotation.z = 0.12;
  tent.userData.noShadow = true;
  s.add(tent);
  const mast = new THREE.Mesh(GEO.box, white);
  mast.scale.set(0.6, 16, 0.6);
  mast.position.set(62 - 54 * 0.06, Y + 60, -104);
  mast.rotation.z = 0.12;
  s.add(mast);

  // sky lanterns drifting round the rinks, warm against the snow
  const NL = 14;
  const lanterns = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), NL);
  const lan: number[] = [];
  for (let i = 0; i < NL; i++) {
    const a = (i / NL) * Math.PI * 2 + R() * 0.3;
    const rx = c.halfX[2] + 5 + R() * 8,
      rz = c.halfZ[2] + 6 + R() * 8;
    lan.push(Math.cos(a) * rx, c.FY[i % 3] - 1 + R() * 5, Math.sin(a) * rz - 4, R() * 6);
    lanterns.setColorAt(i, col.set(["#ffcf6a", "#ff9a5a", "#ffe6a0"][i % 3]));
  }
  lanterns.raycast = () => {};
  s.add(lanterns);
  // the evening traffic, fireworks over the park
  const traffic = new Traffic(s, Y + 0.5, cell, 150, R);
  const qb = new QBlocks(s, [
    [-c.halfX[0] - 3, c.FY[0] + 2.5, -3],
    [c.halfX[0] + 3, c.FY[0] + 1, 2],
    [-c.halfX[1] - 3.5, c.FY[1] + 2.5, 3],
    [c.halfX[1] + 3, c.FY[1] + 3, -4],
    [-c.halfX[2] - 3, c.FY[2] + 2, -2],
    [c.halfX[2] + 3.5, c.FY[2] + 2.5, 4],
  ]);
  let fireT = 1.5;
  const FIRE = ["#ff5a7a", "#ffd23f", "#6fe4ff", "#8ee35b", "#ff9ad5", "#c4b1fc"];
  const sign = label("❄ FROZEN LAKE ❄", 1.5, "#dff4ff", "rgba(10,20,60,0.7)");
  sign.position.set(9, c.FY[0] + 5.5, -c.halfZ[0] - 6);
  s.add(sign);

  // the aurora: three pale ribbons waving high over the woods
  const atex = canvasTex(256, 64, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "rgba(120,255,200,0)");
    gr.addColorStop(0.55, "rgba(120,255,200,0.75)");
    gr.addColorStop(1, "rgba(80,160,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 64);
    g.globalCompositeOperation = "destination-out";
    for (let x = 0; x < 256; x += 9) {
      g.fillStyle = `rgba(0,0,0,${0.15 + R() * 0.35})`;
      g.fillRect(x, 0, 4, 64);
    }
  });
  const amat = new THREE.MeshBasicMaterial({ map: atex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const ribbons: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.PlaneGeometry(240, 46, 24, 1);
    const r = new THREE.Mesh(geo, amat);
    r.position.set(-40 + i * 50, 70 + i * 9, -150 - i * 30);
    r.rotation.y = 0.2 - i * 0.25;
    r.userData.base = Float32Array.from(geo.attributes.position.array as Float32Array);
    s.add(r);
    ribbons.push(r);
  }

  // the snow: one draw of soft flakes, drifting down round the rinks
  const NS = 700;
  const sp = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) {
    sp[i * 3] = (R() - 0.5) * 90;
    sp[i * 3 + 1] = -14 + R() * 56;
    sp[i * 3 + 2] = (R() - 0.5) * 80;
  }
  const sgeo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(sp, 3);
  sgeo.setAttribute("position", pos);
  const snow = new THREE.Points(sgeo, new THREE.PointsMaterial({ map: dotTex(), size: 0.32, transparent: true, depthWrite: false, color: "#ffffff", opacity: 0.9 }));
  snow.frustumCulled = false;
  s.add(snow);
  const drift = new Float32Array(NS);
  for (let i = 0; i < NS; i++) drift[i] = R() * 6;

  return {
    update(now, dt) {
      for (let i = 0; i < NS; i++) {
        const j = i * 3;
        sp[j + 1] -= (1.4 + (i % 5) * 0.25) * dt;
        sp[j] += Math.sin(now * 0.7 + drift[i]) * 0.5 * dt + 0.35 * dt;
        if (sp[j + 1] < -14) sp[j + 1] += 56;
        if (sp[j] > 45) sp[j] -= 90;
      }
      pos.needsUpdate = true;
      for (let r = 0; r < ribbons.length; r++) {
        const geo = ribbons[r].geometry as THREE.PlaneGeometry;
        const p = geo.attributes.position;
        const base = ribbons[r].userData.base as Float32Array;
        for (let i = 0; i < p.count; i++) p.setZ(i, base[i * 3 + 2] + Math.sin(base[i * 3] * 0.03 + now * 0.4 + r * 2) * 9);
        p.needsUpdate = true;
      }
      sign.position.y = c.FY[0] + 5.5 + Math.sin(now * 1.2) * 0.3;
      traffic.update(dt);
      qb.update(now);
      // a firework now and then over the city, below the rinks (so the play camera sees it bloom)
      if ((fireT -= dt) <= 0) {
        fireT = 1.6 + R() * 2.2;
        const a = R() * Math.PI * 2;
        const d = 30 + R() * 40;
        v.set(Math.cos(a) * d, -18 - R() * 22, Math.sin(a) * d * 0.7 - 10);
        const k = Math.floor(R() * FIRE.length);
        c.fx.burst(v, 26, [FIRE[k], FIRE[(k + 2) % FIRE.length], "#ffffff"], { speed: 11, up: 2, gravity: 4, size: 0.5, life: 1.4, drag: 1.4 });
      }
      for (let i = 0; i < NL; i++) {
        const j = i * 4;
        m4.compose(v.set(lan[j] + Math.sin(now * 0.3 + lan[j + 3]) * 0.8, lan[j + 1] + Math.sin(now * 0.7 + lan[j + 3]) * 0.6, lan[j + 2]), q.identity(), sc.set(0.55, 0.75, 0.55));
        lanterns.setMatrixAt(i, m4);
      }
      lanterns.instanceMatrix.needsUpdate = true;
      halo.scale.setScalar(9.5 + Math.sin(now * 1.6) * 0.4);
      beacons.visible = now % 2.4 < 1.5;
    },
  };
}

// ---- SPIN STATION -----------------------------------------------------------------------------------

export function orbitScenery(s: THREE.Scene, c: SceneryCtx): Deco {
  const R = rng(0x0b17);
  // space all round: a dome of stars and their milky band (no air, no haze)
  skyDome(s, { sky: ["#02020a", "#0a0922"], ground: "#04040e", stars: 1100, band: true, haze: 0, rnd: rng(0x0b18) });
  starField(s, 1300, 600, 2.6, rng(0x0b19));
  // the Earth below, close and huge: its limb crosses the top of the play view and lies under every wide
  // shot. Painted in the city's own squares (oceans in steps of blue, shelves round the land, continents
  // of blocks, greener at the equator), deep and muted: nothing down there is as bright as a deck's tiles
  const etex = canvasTex(
    2048,
    1024,
    (g) => {
      const E = rng(0xea27);
      const G = 16;
      // the oceans: bands of blue, deeper toward the poles, a pixel swell
      for (let y = 0; y < 1024; y += G) {
        const lat = Math.abs(y - 512) / 512;
        g.fillStyle = mixHex(mixHex("#123a80", "#0a2258", lat), "#1e4e98", (y / G) % 3 === 0 ? 0.16 : 0);
        g.fillRect(0, y, 2048, G);
      }
      g.fillStyle = "rgba(120,180,255,0.1)";
      for (let i = 0; i < 520; i++) g.fillRect(Math.floor(E() * 128) * G, Math.floor(E() * 64) * G, G * (1 + Math.floor(E() * 3)), G / 2);
      // the continents: clumps of blocks on the grid, first their shallow shelves, then the land over them
      const lands: number[][] = [];
      for (let k = 0; k < 13; k++) {
        const cx = E() * 2048,
          cy = 200 + E() * 624;
        const rx = 90 + E() * 200,
          ry = 60 + E() * 130;
        for (let b = 0; b < 46; b++) {
          const a = E() * Math.PI * 2;
          const d = Math.sqrt(E());
          const w = G * (2 + Math.floor(E() * 5)),
            h = G * (2 + Math.floor(E() * 4));
          lands.push([Math.round((cx + Math.cos(a) * d * rx - w / 2) / G) * G, Math.round((cy + Math.sin(a) * d * ry - h / 2) / G) * G, w, h]);
        }
      }
      const wrap = (x: number, y: number, w: number, h: number) => {
        g.fillRect(x, y, w, h);
        if (x < 0) g.fillRect(x + 2048, y, w, h);
        if (x + w > 2048) g.fillRect(x - 2048, y, w, h);
      };
      g.fillStyle = "#1f559e";
      for (const [x, y, w, h] of lands) wrap(x - G, y - G, w + 2 * G, h + 2 * G);
      for (const [x, y, w, h] of lands) {
        const lat = Math.abs(y + h / 2 - 512) / 512;
        // (forest in the tropics, steppe and sand further out, tundra toward the poles: all well under the tiles' brightness)
        g.fillStyle = lat < 0.2 ? ["#2a5e4e", "#33685a", "#26564c"][Math.floor(E() * 3)] : lat < 0.5 ? ["#4f6a50", "#66705a", "#786e58", "#46624e"][Math.floor(E() * 4)] : ["#4c5c78", "#42526e"][Math.floor(E() * 2)];
        wrap(x, y, w, h);
      }
      // mountains and rivers' shade: darker blocks inside the land
      g.fillStyle = "rgba(10,30,40,0.18)";
      for (const [x, y, w, h] of lands) if (E() < 0.35) wrap(x + G / 2, y + G / 2, Math.max(G, w - 2 * G), Math.max(G / 2, h - 2 * G));
    },
    true,
  );
  etex.repeat.set(2, 1);
  etex.anisotropy = 8;
  const ER = 900;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(ER, 96, 64), new THREE.MeshToonMaterial({ map: etex, color: "#8e96b4", gradientMap: toonSteps(), emissive: "#060e28" }));
  earth.position.set(0, -1160, -40);
  // (the equator turned up toward the decks: oceans and land under them, no ice cap)
  earth.rotation.set(1.45, 0.3, 0.2);
  earth.userData.noShadow = true;
  s.add(earth);
  // its air: two thin shells of blue beyond the limb, the inner one brighter (a glow in two steps)
  for (const [k, o] of [
    [1.016, 0.5],
    [1.04, 0.2],
  ]) {
    const air = new THREE.Mesh(new THREE.SphereGeometry(ER * k, 96, 48), new THREE.MeshBasicMaterial({ color: "#5ab4ff", transparent: true, opacity: o, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false, fog: false }));
    air.position.copy(earth.position);
    s.add(air);
  }
  // the clouds over it, turning slowly on their own: long white streets of blocks, a shade under each
  const ctex = canvasTex(
    1024,
    512,
    (g) => {
      g.clearRect(0, 0, 1024, 512);
      const E = rng(0xc10d);
      const G = 8;
      for (let k = 0; k < 90; k++) {
        const x0 = Math.floor(E() * 128) * G,
          y0 = Math.floor(8 + E() * 48) * G;
        const n = 3 + Math.floor(E() * 6);
        for (let pass = 0; pass < 2; pass++) {
          g.fillStyle = pass ? `rgba(214,226,255,${0.26 + E() * 0.14})` : "rgba(6,16,50,0.2)";
          let x = x0;
          for (let b = 0; b < n; b++) {
            const w = G * (2 + ((k + b) % 3)),
              h = (G / 2) * (1 + ((k * 3 + b) % 2));
            const y = y0 + (((k + b * 5) % 3) - 1) * G;
            g.fillRect((x + (pass ? 0 : G)) % 1024, y + (pass ? 0 : G), w, h);
            x += w - G;
          }
        }
      }
    },
    true,
  );
  ctex.repeat.set(2, 1);
  ctex.anisotropy = 8;
  const cloudSphere = new THREE.Mesh(new THREE.SphereGeometry(ER * 1.006, 96, 64), new THREE.MeshToonMaterial({ map: ctex, transparent: true, depthWrite: false, gradientMap: toonSteps(), emissive: "#28386a" }));
  cloudSphere.position.copy(earth.position);
  cloudSphere.rotation.copy(earth.rotation);
  cloudSphere.userData.noShadow = true;
  s.add(cloudSphere);
  // a nebula far off, the sun low over the Earth's rim, a moon
  const ntex = canvasTex(256, 128, (g) => {
    g.clearRect(0, 0, 256, 128);
    const blobs: [number, number, number, string][] = [
      [70, 64, 60, "rgba(190,90,255,0.55)"],
      [140, 54, 54, "rgba(255,90,170,0.45)"],
      [190, 74, 46, "rgba(90,160,255,0.5)"],
      [110, 80, 40, "rgba(120,255,220,0.3)"],
    ];
    for (const [x, y, r, c0] of blobs) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, c0);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 128);
    }
  });
  const nebula = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: ntex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  nebula.position.set(-160, 170, -480);
  nebula.scale.set(520, 260, 1);
  nebula.lookAt(0, 20, 0);
  s.add(nebula);
  orb(s, 260, 40, -420, 17, "#fffaf0", "rgba(255,240,200,0.95)", "rgba(255,190,110,0.3)", 6);
  const moon = new THREE.Mesh(GEO.ball, toon("#d8d6e8", "#3a3858"));
  moon.position.set(-220, 120, -380);
  moon.scale.setScalar(36);
  moon.userData.noShadow = true;
  s.add(moon);

  // a ring station turning far under the decks: its rim, spokes to a hub, its windows lit
  const station = new THREE.Group();
  station.position.set(0, c.FY[2] - 40, -8);
  station.rotation.x = 0.18;
  const hull = toon("#c9cfe8", "#2a3058");
  const rim = new THREE.Mesh(new THREE.TorusGeometry(36, 2.6, 10, 72), hull);
  rim.rotation.x = Math.PI / 2;
  const hub = new THREE.Mesh(GEO.cyl, hull);
  hub.scale.set(9, 5, 9);
  outline(hub, 0.25);
  const spokes = new THREE.InstancedMesh(GEO.box, toon("#8a92c0", "#1a2048"), 6);
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    q.setFromAxisAngle(v.set(0, 1, 0), -a);
    m4.compose(v2.set(Math.cos(a) * 20.25, 0, Math.sin(a) * 20.25), q, sc.set(31.5, 1.2, 1.2));
    spokes.setMatrixAt(k, m4);
  }
  const NW = 72;
  const wins = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), NW);
  for (let k = 0; k < NW; k++) {
    const a = (k / NW) * Math.PI * 2;
    q.setFromAxisAngle(v.set(0, 1, 0), -a);
    m4.compose(v2.set(Math.cos(a) * 36, 2.4, Math.sin(a) * 36), q, sc.set(0.6, 0.5, 1.6));
    wins.setMatrixAt(k, m4);
    wins.setColorAt(k, col.set(k % 6 === 0 ? c.L.glowC[k % 3] : "#ffe6a8"));
  }
  spokes.raycast = wins.raycast = () => {};
  station.add(rim, hub, spokes, wins);
  s.add(station);
  // rocks drifting and tumbling round the station
  const NR = 26;
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), toon("#8a7f8c", "#2a2030"), NR);
  const rk = new Float32Array(NR * 5);
  for (let k = 0; k < NR; k++) {
    const a = R() * Math.PI * 2;
    const d = 30 + R() * 50;
    rk.set([Math.cos(a) * d, -10 - R() * 40, Math.sin(a) * d * 0.7 - 20, 0.6 + R() * 2.2, R() * 6], k * 5);
  }
  rocks.raycast = () => {};
  rocks.frustumCulled = false;
  s.add(rocks);
  // a shuttle passing now and then, far off, its engine glowing
  const shuttle = new THREE.Group();
  const sbody = new THREE.Mesh(GEO.box, toon("#f4f6ff", "#3a3f60"));
  sbody.scale.set(7, 1.6, 2);
  outline(sbody, 0.1);
  const wing = new THREE.Mesh(GEO.box, toon("#2a2f50", "#0a0c20"));
  wing.scale.set(3.4, 0.25, 6);
  wing.position.x = -1;
  const flame = new THREE.Mesh(GEO.cone, glow("#7fd8ff", 0.9, true));
  flame.scale.set(1.4, 3.6, 1.4);
  flame.rotation.z = Math.PI / 2;
  flame.position.x = -5.3;
  shuttle.add(sbody, wing, flame);
  s.add(shuttle);
  const qb = new QBlocks(s, [
    [-c.ext[0] - 2.5, c.FY[0] + 2.5, -4],
    [c.ext[0] + 1.5, c.FY[0] + 1.5, 5],
    [-c.ext[1] - 2, c.FY[1] + 3, 6],
    [c.ext[1] + 2.5, c.FY[1] + 2, -6],
    [-c.ext[2] - 2.5, c.FY[2] + 2.5, -7],
    [c.ext[2] + 2, c.FY[2] + 3, 7],
  ]);

  // under each deck (turning with it): the hub's drum, a girder along each arm, a pod at its tip
  // (dark and deep under the tiles: seen through a hole it reads as the drop, never as ground)
  const steel = toon("#4a5288", "#141838");
  const decks: THREE.Group[] = [];
  const tips: THREE.Object3D[][] = [];
  for (let f = 0; f < 3; f++) {
    const d = new THREE.Group();
    d.position.y = c.FY[f];
    const drum = new THREE.Mesh(GEO.cyl, steel);
    drum.scale.set(1.8, 2.4, 1.8);
    drum.position.y = -3.4;
    outline(drum, 0.1);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.16, 6, 28), glow(c.L.glowC[f]));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -4.4;
    d.add(drum, ring);
    const ts: THREE.Object3D[] = [];
    for (let a = 0; a < 3; a++) {
      const ang = (a * 2 * Math.PI) / 3;
      const arm = new THREE.Group();
      // (three.js yaw: local +x turned by -ang lies along (cos ang, sin ang) on (x, z))
      arm.rotation.y = -ang;
      const len = c.ext[f] - 0.4;
      const girder = new THREE.Mesh(GEO.box, steel);
      girder.scale.set(len, 0.45, 0.55);
      girder.position.set(len / 2, -1.6, 0);
      const pod = new THREE.Mesh(GEO.cyl, glow(c.L.glowC[f]));
      pod.scale.set(1.1, 1.4, 1.1);
      pod.rotation.z = Math.PI / 2;
      pod.position.set(len + 0.4, -1.1, 0);
      const tip = new THREE.Object3D();
      tip.position.set(len + 0.9, -0.6, 0);
      arm.add(girder, pod, tip);
      d.add(arm);
      ts.push(tip);
    }
    tips.push(ts);
    s.add(d);
    decks.push(d);
  }
  // satellites drifting by: a body, two wings of solar panels
  const panel = toon("#2a4aa8", "#10204a");
  const gold = toon("#ffcf6a", "#6a4a10");
  const sats: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(GEO.box, gold);
    body.scale.set(1.4, 1.4, 2.2);
    outline(body, 0.08);
    const w1 = new THREE.Mesh(GEO.box, panel);
    w1.scale.set(5, 0.1, 1.6);
    w1.position.x = 3.3;
    const w2 = w1.clone();
    w2.position.x = -3.3;
    g.add(body, w1, w2);
    if (i === 3) {
      // (one far up behind the decks, for the fly-over)
      g.position.set(40, 34, -50);
      g.userData.a = 5;
      s.add(g);
      sats.push(g);
      continue;
    }
    g.position.set(-30 + i * 30, -16 - i * 9, -12 - i * 10);
    g.scale.setScalar(1.4);
    g.userData.a = i * 2;
    s.add(g);
    sats.push(g);
  }
  const sign = label("ZSTREET ORBITAL", 1.5, "#e6ffd0", "rgba(10,8,40,0.72)");
  sign.position.set(-12, c.FY[0] + 6, -c.ext[0] - 5);
  s.add(sign);

  let sparkT = 0;
  return {
    update(now, dt, ang, alpha) {
      // (a deck over the camera's floor is a ghost: its underside goes, so it hides nothing)
      for (let f = 0; f < 3; f++) ((decks[f].rotation.y = ang[f]), (decks[f].visible = alpha[f] > 0.5));
      // sparks flung off an arm's tip (where the pull is strongest), along the turn and outward
      if ((sparkT -= dt) <= 0) {
        sparkT = 0.12;
        const f = Math.floor(R() * 3);
        const t = tips[f][Math.floor(R() * 3)];
        if (alpha[f] > 0.5) {
        t.getWorldPosition(v);
        const om = Math.sign(c.L.spin[f]);
        // (the tangent of a turn by +yaw at (x, z) is (z, -x))
        v2.set(v.z * om, 0, -v.x * om).normalize().multiplyScalar(3);
        v2.addScaledVector(sc.set(v.x, 0, v.z).normalize(), 4);
        c.fx.burst(v, 3, [c.L.glowC[f], "#ffffff"], { speed: 1.5, up: 0.5, gravity: 2, size: 0.16, life: 0.9, drag: 0.2, dir: v2 });
        }
      }
      for (const g of sats) {
        const a = g.userData.a as number;
        g.rotation.set(Math.sin(now * 0.2 + a) * 0.3, now * 0.1 + a, 0.2);
        g.position.y += Math.sin(now * 0.5 + a) * 0.01;
      }
      sign.position.y = c.FY[0] + 6 + Math.sin(now * 1.2) * 0.3;
      // (the Earth turns under the station, its clouds a little faster)
      earth.rotation.y = 0.3 + now * 0.0022;
      cloudSphere.rotation.y = earth.rotation.y + now * 0.0016;
      station.rotation.y = now * 0.05;
      for (let k = 0; k < NR; k++) {
        const j = k * 5;
        e.set(now * 0.3 + rk[j + 4], now * 0.2 + rk[j + 4] * 2, 0);
        q.setFromEuler(e);
        m4.compose(v.set(rk[j] + Math.sin(now * 0.05 + k) * 4, rk[j + 1] + Math.sin(now * 0.3 + k) * 0.6, rk[j + 2]), q, sc.setScalar(rk[j + 3]));
        rocks.setMatrixAt(k, m4);
      }
      rocks.instanceMatrix.needsUpdate = true;
      // the shuttle: across the far sky every 22 s
      const u = (now % 22) / 22;
      shuttle.visible = u < 0.6;
      shuttle.position.set(-140 + u * 480, 26 + u * 18, -90);
      flame.scale.y = 3.6 + Math.sin(now * 30) * 0.6;
      qb.update(now);
    },
  };
}
