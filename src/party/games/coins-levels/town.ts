/**
 * The town round and below a ⓩ SHOWER arena (what the camera sees past the roof's edge; the game
 * never touches it): streets on a grid far below, blocks of buildings whose roofs are dressed
 * (gravel and vents, gardens, pools, solar panels), parks, street trees, traffic crawling along the
 * roads, street lamps and their pools of light in the evening. Layered by depth: the neighbours'
 * roofs just under the arena, the streets, then the far blocks fading into the fog.
 *
 * A handful of draws: the ground (one tiled plane), the buildings (one merged mesh: walls, roofs),
 * and one instanced mesh each for the roofs' clutter, the trees, the cars, their lights, the lamps.
 * Built with its own seeded random (never the game's): the same town on every screen.
 */
import * as THREE from "three";
import { rng } from "../../kit";
import { GEO, canvasTex, glow, mixHex, toon, toonSteps } from "../../k3";

export interface TownOpts {
  seed: number;
  /** Street level (world y), and the highest a roof may reach (under the arena: nothing hides it). */
  y: number;
  top: number;
  /** The grid: a block and its road (m), the road's width, how far the town is built (m), its middle (the arena's own block). */
  cell?: number;
  road?: number;
  reach?: number;
  cx?: number;
  cz?: number;
  /** Day, an evening (lit windows, lamps coming on), a night (dark walls, everything lit). */
  mode: "day" | "dusk" | "night";
  /** Snow on the roofs, the trees and the pavements. */
  snow?: boolean;
  /** The air between the arena and the town: every colour is mixed toward `fog` by `haze` (0…1). */
  fog: string;
  haze: number;
  /** The ground: the road, its paint, the kerb, the pavement. */
  ground: { road: string; paint: string; kerb: string; lot: string };
  walls: string[];
  roofs: string[];
  /** A window lit, a window dark, how many are lit (0…1). */
  win: { lit: string; dark: string; k: number };
  /** The trees: two tones of leaves, the trunk; the parks' lawn. */
  green: [string, string];
  trunk: string;
  lawn: string;
  /** How many blocks are parks (0…1). */
  parks?: number;
  /** The cars: how many, their paint; `left`: they drive on the left. */
  cars: number;
  paint: string[];
  left?: boolean;
  /** The street lamps' light (none: no lamps). */
  lamp?: string;
  /** Nothing is built on this block (water, a landmark's foot): its middle. */
  skip?: (x: number, z: number) => boolean;
  /** No traffic on this road (`axis` 0: it runs along x; `at`: its z or x). */
  noRoad?: (axis: number, at: number) => boolean;
}

export interface Town {
  /** Every frame: the traffic (its clock is the game's own, from dt). */
  tick(dt: number): void;
  /** A block's middle (i, j from the arena's own). */
  block(i: number, j: number): [number, number];
  cell: number;
  road: number;
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const P = new THREE.Vector3();
const S = new THREE.Vector3();
const C = new THREE.Color();
const E = new THREE.Euler();

/** A window's pitch along a wall and up it (m): a wall is cut to whole windows. */
const WIN_W = 2.6;
const WIN_H = 3.2;

export function town(scene: THREE.Scene, o: TownOpts): Town {
  const R = rng(o.seed);
  const cell = o.cell ?? 40;
  const road = o.road ?? 10;
  const reach = o.reach ?? 170;
  const cx = o.cx ?? 0;
  const cz = o.cz ?? 0;
  const night = o.mode === "night";
  const lit = o.mode !== "day";
  const hz = (c: string, k = 1) => mixHex(c, o.fog, Math.min(1, o.haze * k));
  const pick = <T>(a: T[]) => a[Math.floor(R() * a.length) % a.length];

  // ---- the ground: one tile a block, its road round it (the tiles' edges are the roads' middles)
  const TP = 512;
  const u = TP / cell;
  const gtex = canvasTex(
    TP,
    TP,
    (g) => {
      const rw = (road / 2) * u;
      g.fillStyle = hz(o.ground.lot);
      g.fillRect(0, 0, TP, TP);
      // the pavement's slabs (big, faint: a pattern, not a noise)
      g.strokeStyle = hz(mixHex(o.ground.lot, "#000000", o.snow ? 0.05 : 0.08));
      g.lineWidth = 2;
      for (let k = 1; k < 8; k++) {
        const t = Math.round((k / 8) * TP) + 0.5;
        g.beginPath();
        g.moveTo(t, rw);
        g.lineTo(t, TP - rw);
        g.moveTo(rw, t);
        g.lineTo(TP - rw, t);
        g.stroke();
      }
      // the road round the block, its kerb
      g.fillStyle = hz(o.ground.road);
      g.fillRect(0, 0, TP, rw);
      g.fillRect(0, TP - rw, TP, rw);
      g.fillRect(0, 0, rw, TP);
      g.fillRect(TP - rw, 0, rw, TP);
      g.strokeStyle = hz(o.ground.kerb);
      g.lineWidth = 5;
      g.strokeRect(rw + 2.5, rw + 2.5, TP - rw * 2 - 5, TP - rw * 2 - 5);
      // the middle line's dashes (half on this tile, half on the next), the crossings at the corners
      g.fillStyle = hz(o.ground.paint);
      const dash = 3 * u,
        gap = 3.4 * u;
      for (let t = rw + gap; t < TP - rw - dash; t += dash + gap) {
        g.fillRect(t, 0, dash, 2.5);
        g.fillRect(t, TP - 2.5, dash, 2.5);
        g.fillRect(0, t, 2.5, dash);
        g.fillRect(TP - 2.5, t, 2.5, dash);
      }
      const zw = 0.7 * u,
        zl = 2.6 * u;
      for (let k = 0; k < 3; k++) {
        const t = k * zw * 1.9 + zw * 0.5;
        for (const far of [0, 1]) {
          const a = far ? TP - rw - zl - 4 : rw + 4;
          g.fillRect(a, t, zl, zw);
          g.fillRect(a, TP - t - zw, zl, zw);
          g.fillRect(t, a, zw, zl);
          g.fillRect(TP - t - zw, a, zw, zl);
        }
      }
      if (night) {
        // (a wet road at night: the lamps' light lying on it in long soft streaks)
        for (let k = 0; k < 10; k++) {
          const along = k % 2 === 0;
          const t = R() * TP,
            w = rw * 0.5;
          const gr = along ? g.createLinearGradient(t - 40, 0, t + 40, 0) : g.createLinearGradient(0, t - 40, 0, t + 40);
          const c = ["255,200,130", "255,120,200", "120,220,255"][k % 3];
          gr.addColorStop(0, `rgba(${c},0)`);
          gr.addColorStop(0.5, `rgba(${c},0.16)`);
          gr.addColorStop(1, `rgba(${c},0)`);
          g.fillStyle = gr;
          if (along) (g.fillRect(t - 40, 2, 80, w), g.fillRect(t - 40, TP - w - 2, 80, w));
          else (g.fillRect(2, t - 40, w, 80), g.fillRect(TP - w - 2, t - 40, w, 80));
        }
      }
    },
    true,
  );
  const GS = cell * 44;
  gtex.repeat.set(GS / cell, GS / cell);
  gtex.offset.set(0.5, 0.5);
  gtex.anisotropy = 8;
  const ground = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: gtex, gradientMap: toonSteps() }));
  ground.rotation.x = -Math.PI / 2;
  ground.scale.set(GS, GS, 1);
  ground.position.set(cx, o.y, cz);
  ground.userData.noShadow = true;
  ground.raycast = () => {};
  scene.add(ground);

  // ---- the walls' windows (a tile of 4 × 4, repeated), the roofs (four kinds on one sheet)
  const WT = 128;
  const wins: boolean[] = [];
  for (let k = 0; k < 16; k++) wins.push(R() < o.win.k);
  const paintWin = (g: CanvasRenderingContext2D, glowOnly: boolean) => {
    g.fillStyle = glowOnly ? "#000000" : "#ffffff";
    g.fillRect(0, 0, WT, WT);
    const cw = WT / 4;
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) {
        const on = wins[j * 4 + i];
        if (glowOnly && !on) continue;
        g.fillStyle = glowOnly ? o.win.lit : hz(on ? o.win.lit : o.win.dark, 0.6);
        g.fillRect(i * cw + 9, j * cw + 7, cw - 18, cw - 16);
        if (!glowOnly) {
          // (a sill under it: one crisp line)
          g.fillStyle = "rgba(0,0,0,0.12)";
          g.fillRect(i * cw + 7, j * cw + cw - 8, cw - 14, 3);
        }
      }
  };
  const wtex = canvasTex(WT, WT, (g) => paintWin(g, false), true);
  const wglow = lit ? canvasTex(WT, WT, (g) => paintWin(g, true), true) : null;
  const RT = 512;
  const roofTex = canvasTex(RT, RT, (g) => paintRoofs(g, RT, o, hz, false));
  const roofGlow = night ? canvasTex(RT, RT, (g) => paintRoofs(g, RT, o, hz, true)) : null;

  // ---- the blocks: buildings (merged), what stands on their roofs, parks, street trees
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const iWall: number[] = [];
  const iRoof: number[] = [];
  const quad = (list: number[], x: number[], y: number[], z: number[], nx: number, ny: number, nz: number, u0: number, v0: number, u1: number, v1: number, c: THREE.Color) => {
    const n = pos.length / 3;
    for (let k = 0; k < 4; k++) {
      pos.push(x[k], y[k], z[k]);
      nor.push(nx, ny, nz);
      col.push(c.r, c.g, c.b);
    }
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    list.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  const clutter: { c: string; x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number }[] = [];
  const trees: { x: number; y: number; z: number; s: number }[] = [];
  const parkLamps: [number, number][] = [];
  const pad = 1 / RT;
  const build = (x: number, z: number, w: number, d: number, h: number, near: boolean) => {
    // (whole windows along each wall and up it)
    w = Math.max(2, Math.round(w / WIN_W)) * WIN_W;
    d = Math.max(2, Math.round(d / WIN_W)) * WIN_W;
    h = Math.max(2, Math.round(h / WIN_H)) * WIN_H;
    const y0 = o.y,
      y1 = o.y + h;
    const c = C.set(hz(pick(o.walls))).clone();
    const x0 = x - w / 2,
      x1 = x + w / 2,
      z0 = z - d / 2,
      z1 = z + d / 2;
    const uo = Math.floor(R() * 4) / 4,
      vo = Math.floor(R() * 4) / 4;
    const uw = w / (WIN_W * 4),
      ud = d / (WIN_W * 4),
      vh = h / (WIN_H * 4);
    quad(iWall, [x0, x1, x1, x0], [y0, y0, y1, y1], [z1, z1, z1, z1], 0, 0, 1, uo, vo, uo + uw, vo + vh, c);
    quad(iWall, [x1, x0, x0, x1], [y0, y0, y1, y1], [z0, z0, z0, z0], 0, 0, -1, uo, vo, uo + uw, vo + vh, c);
    quad(iWall, [x1, x1, x1, x1], [y0, y0, y1, y1], [z1, z0, z0, z1], 1, 0, 0, uo, vo, uo + ud, vo + vh, c);
    quad(iWall, [x0, x0, x0, x0], [y0, y0, y1, y1], [z0, z1, z1, z0], -1, 0, 0, uo, vo, uo + ud, vo + vh, c);
    // the roof: one of the four kinds, turned a quarter or not
    const kind = R() < 0.4 ? 0 : 1 + Math.floor(R() * 3);
    const tu = (kind % 2) * 0.5,
      tv = Math.floor(kind / 2) * 0.5;
    const rc = C.set(hz(pick(o.roofs))).clone();
    quad(iRoof, [x0, x1, x1, x0], [y1, y1, y1, y1], [z1, z1, z0, z0], 0, 1, 0, tu + pad, tv + pad, tu + 0.5 - pad, tv + 0.5 - pad, rc);
    // on it: the stairs' head, air units, a tank (the near ones only: further off they would be specks)
    if (!near) return;
    const wallC = `#${c.getHexString()}`;
    const sx = R() < 0.5 ? -1 : 1,
      sz = R() < 0.5 ? -1 : 1;
    clutter.push({ c: wallC, x: x + sx * (w / 2 - 2.4), y: y1, z: z + sz * (d / 2 - 2.2), sx: 3, sy: 2.6, sz: 2.6, ry: 0 });
    if (kind === 0) {
      const n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) clutter.push({ c: hz(o.snow ? "#dfe6f2" : "#c9d0da"), x: x - sx * (w / 2 - 2.6 - k * 2.6), y: y1, z: z - sz * (d / 2 - 2.4), sx: 1.9, sy: 1.1, sz: 1.5, ry: 0 });
      if (R() < 0.6) clutter.push({ c: hz(o.snow ? "#b9c6dc" : "#b08a66"), x: x - sx * (w / 2 - 3), y: y1, z: z + sz * (d / 2 - 3), sx: 2.4, sy: 3, sz: 2.4, ry: 0.78 });
    } else if (kind === 1) {
      for (let k = 0; k < 3; k++) trees.push({ x: x + (R() - 0.5) * (w - 6), y: y1, z: z + (R() - 0.5) * (d - 6), s: 0.55 + R() * 0.2 });
    }
  };
  const half = cell / 2;
  const B = cell - road - 6;
  const n = Math.ceil(reach / cell);
  for (let j = -n; j <= n; j++)
    for (let i = -n; i <= n; i++) {
      const bx = cx + i * cell,
        bz = cz + j * cell;
      const dist = Math.hypot(i * cell, j * cell);
      if (dist > reach) continue;
      // street trees on the pavement, every block (the arena's own too)
      if (!o.skip?.(bx, bz))
        for (let k = 0; k < 4; k++) {
          const e = half - road / 2 - 1.5;
          const t = (R() - 0.5) * (cell - road - 8);
          if (R() < 0.3) continue;
          trees.push(k < 2 ? { x: bx + t, y: o.y, z: bz + (k ? e : -e), s: 0.8 + R() * 0.3 } : { x: bx + (k === 2 ? e : -e), y: o.y, z: bz + t, s: 0.8 + R() * 0.3 });
        }
      if ((i === 0 && j === 0) || o.skip?.(bx, bz)) continue;
      const near = dist < cell * 2.3;
      // (the nearer, the taller: the ring round the arena stands just under it; the far ones are low and many)
      const room = o.top - o.y;
      const tall = () => Math.max(9, room * (near ? 0.42 + R() * 0.45 : 0.18 + R() * R() * 0.62));
      if (R() < (o.parks ?? 0.12) && dist > cell * 1.6) {
        // a park: a lawn, a path across, trees
        clutter.push({ c: hz(o.lawn), x: bx, y: o.y, z: bz, sx: B, sy: 0.25, sz: B, ry: 0 });
        clutter.push({ c: hz(o.ground.lot), x: bx, y: o.y + 0.05, z: bz, sx: B, sy: 0.25, sz: 2.4, ry: 0.78 });
        for (let k = 0; k < 9; k++) trees.push({ x: bx + (R() - 0.5) * (B - 4), y: o.y, z: bz + (R() - 0.5) * (B - 4), s: 0.9 + R() * 0.5 });
        if (o.lamp) for (let k = -2; k <= 2; k++) parkLamps.push([bx + k * 3.6, bz - k * 3.6]);
        continue;
      }
      // (round the arena: never one big slab of a roof, two or four smaller ones at different heights)
      const r = near ? 0.3 + R() * 0.7 : R();
      if (r < 0.3) build(bx, bz, B - R() * 4, B - R() * 4, tall(), near);
      else if (r < 0.65) {
        // two, side by side
        const along = R() < 0.5;
        for (const sd of [-1, 1]) {
          const w = B / 2 - 1.2;
          if (along) build(bx + sd * (B / 4 + 0.3), bz, w, B - R() * 5, tall(), near);
          else build(bx, bz + sd * (B / 4 + 0.3), B - R() * 5, w, tall(), near);
        }
      } else {
        // four (one corner now and then left as a yard with a tree)
        for (const sx of [-1, 1])
          for (const sz of [-1, 1]) {
            if (R() < 0.14) {
              trees.push({ x: bx + sx * B * 0.25, y: o.y, z: bz + sz * B * 0.25, s: 1.1 });
              continue;
            }
            build(bx + sx * (B / 4 + 0.3), bz + sz * (B / 4 + 0.3), B / 2 - 1.4 - R() * 2, B / 2 - 1.4 - R() * 2, tall(), near);
          }
      }
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex([...iWall, ...iRoof]);
  geo.addGroup(0, iWall.length, 0);
  geo.addGroup(iWall.length, iRoof.length, 1);
  const wallMat = new THREE.MeshToonMaterial({ map: wtex, vertexColors: true, gradientMap: toonSteps(), ...(wglow ? { emissive: "#ffffff", emissiveMap: wglow, emissiveIntensity: night ? 0.95 : 0.7 } : {}) });
  const roofMat = new THREE.MeshToonMaterial({ map: roofTex, vertexColors: true, gradientMap: toonSteps(), ...(roofGlow ? { emissive: "#ffffff", emissiveMap: roofGlow, emissiveIntensity: 0.9 } : {}) });
  const blocks = new THREE.Mesh(geo, [wallMat, roofMat]);
  blocks.userData.noShadow = true;
  blocks.frustumCulled = false;
  blocks.raycast = () => {};
  scene.add(blocks);

  const inst = (count: number, mat: THREE.Material, geom: THREE.BufferGeometry = GEO.box) => {
    const m = new THREE.InstancedMesh(geom, mat, Math.max(1, count));
    m.count = count;
    m.frustumCulled = false;
    m.raycast = () => {};
    m.userData.noShadow = true;
    scene.add(m);
    return m;
  };
  // the roofs' clutter and the parks' lawns (boxes standing on their y)
  const cl = inst(clutter.length, toon("#ffffff"));
  clutter.forEach((q, i) => {
    cl.setMatrixAt(i, M.compose(P.set(q.x, q.y + q.sy / 2, q.z), Q.setFromEuler(E.set(0, q.ry, 0)), S.set(q.sx, q.sy, q.sz)));
    cl.setColorAt(i, C.set(q.c));
  });
  // the trees: a trunk, two tiers of leaves (a cap of snow on the top one in winter)
  const per = o.snow ? 4 : 3;
  const tr = inst(trees.length * per, toon("#ffffff"));
  // (the leaves keep their green through the haze: half of it)
  const leaf = [hz(o.green[0], 0.5), hz(o.green[1], 0.5)];
  trees.forEach((t, i) => {
    const s = t.s;
    const ry = (i * 1.7) % 1.5;
    Q.setFromEuler(E.set(0, ry, 0));
    tr.setMatrixAt(i * per, M.compose(P.set(t.x, t.y + 1.4 * s, t.z), Q, S.set(0.7 * s, 2.8 * s, 0.7 * s)));
    tr.setColorAt(i * per, C.set(hz(o.trunk)));
    tr.setMatrixAt(i * per + 1, M.compose(P.set(t.x, t.y + 3.8 * s, t.z), Q, S.set(4.2 * s, 2.6 * s, 4.2 * s)));
    tr.setColorAt(i * per + 1, C.set(leaf[i % 2]));
    tr.setMatrixAt(i * per + 2, M.compose(P.set(t.x + 0.2 * s, t.y + 5.7 * s, t.z - 0.1 * s), Q, S.set(2.8 * s, 1.8 * s, 2.8 * s)));
    tr.setColorAt(i * per + 2, C.set(leaf[(i + 1) % 2]));
    if (o.snow) {
      tr.setMatrixAt(i * per + 3, M.compose(P.set(t.x + 0.2 * s, t.y + 6.75 * s, t.z - 0.1 * s), Q, S.set(2.9 * s, 0.5 * s, 2.9 * s)));
      tr.setColorAt(i * per + 3, C.set(hz("#ffffff", 0.5)));
    }
  });

  // ---- the roads: which carry traffic, the lamps along them
  const all: { axis: number; at: number }[] = [];
  for (let k = -n; k < n; k++)
    for (const axis of [0, 1]) if (Math.abs((k + 0.5) * cell) < reach - cell) all.push({ axis, at: (axis ? cx : cz) + (k + 0.5) * cell });
  const lines = all.filter((l) => !o.noRoad?.(l.axis, l.at));
  let lampMesh: THREE.InstancedMesh | null = null;
  if (o.lamp) {
    // a lamp every 20 m, on alternate sides: a bright head, its pool of light on the road
    const spots: [number, number][] = [];
    for (const l of all)
      for (let t = -reach + 10; t < reach; t += 20) {
        const side = (Math.round(t / 20) % 2 ? 1 : -1) * (road / 2 - 0.6);
        const x = l.axis ? l.at + side : cx + t,
          z = l.axis ? cz + t : l.at + side;
        if (Math.hypot(x - cx, z - cz) > reach || o.skip?.(x, z)) continue;
        spots.push([x, z]);
      }
    spots.push(...parkLamps);
    lampMesh = inst(spots.length, glow(o.lamp));
    const poolTex = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,255,0.85)");
      gr.addColorStop(0.45, "rgba(255,255,255,0.3)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    });
    const pools = inst(spots.length, new THREE.MeshBasicMaterial({ map: poolTex, color: o.lamp, transparent: true, opacity: night ? 0.62 : 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), GEO.plane);
    pools.renderOrder = 1;
    Q.setFromEuler(E.set(-Math.PI / 2, 0, 0));
    spots.forEach(([x, z], i) => {
      lampMesh!.setMatrixAt(i, M.compose(P.set(x, o.y + 5.2, z), Q, S.set(0.9, 0.9, 0.5)));
      pools.setMatrixAt(i, M.compose(P.set(x, o.y + 0.12, z), Q, S.set(15, 15, 1)));
    });
  }

  // ---- the traffic: cars keeping to their side, each on its road (round and round the town's span)
  const NC = lines.length ? o.cars : 0;
  const cars = inst(NC * 2, toon("#ffffff"));
  const lights = lit ? inst(NC * 2, glow("#ffffff")) : null;
  const car: { axis: number; at: number; dir: number; v: number; ph: number; len: number }[] = [];
  for (let i = 0; i < NC; i++) {
    const l = lines[Math.floor(R() * lines.length) % lines.length];
    const dir = R() < 0.5 ? 1 : -1;
    // (its side of the road: the right, or the left where they drive on the left)
    const side = dir * (o.left ? -1 : 1) * (l.axis ? -1 : 1) * (road / 4);
    const bus = R() < 0.12;
    car.push({ axis: l.axis, at: l.at + side, dir, v: (bus ? 6 : 8 + R() * 5) * (o.snow ? 0.7 : 1), ph: R() * reach * 2, len: bus ? 7.5 : 4.2 });
    const c = bus ? "#ffd23f" : pick(o.paint);
    cars.setColorAt(i * 2, C.set(hz(c, 0.5)));
    cars.setColorAt(i * 2 + 1, C.set(hz(mixHex(c, lit ? "#1a2038" : "#ffffff", 0.55), 0.5)));
    if (lights) (lights.setColorAt(i * 2, C.set("#fff3c4")), lights.setColorAt(i * 2 + 1, C.set("#ff3b30")));
  }
  const span = reach * 2 - cell;
  let clk = 0;
  const tick = (dt: number) => {
    clk += dt;
    for (let i = 0; i < NC; i++) {
      const c = car[i];
      const t = ((((c.ph + clk * c.v) % span) + span) % span) - span / 2;
      const s = t * c.dir;
      const x = c.axis ? c.at : cx + s,
        z = c.axis ? cz + s : c.at;
      // (out past the town's edge: it shrinks away into the fog instead of popping)
      const k = Math.min(1, (span / 2 - Math.abs(t)) / 12);
      const yaw = c.axis ? (c.dir > 0 ? 0 : Math.PI) : c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      Q.setFromEuler(E.set(0, yaw, 0));
      const fx = Math.sin(yaw),
        fz = Math.cos(yaw);
      cars.setMatrixAt(i * 2, M.compose(P.set(x, o.y + 0.95, z), Q, S.set(2 * k, 1.1 * k, c.len * k)));
      cars.setMatrixAt(i * 2 + 1, M.compose(P.set(x - fx * 0.3, o.y + 1.85, z - fz * 0.3), Q, S.set(1.8 * k, 0.8 * k, c.len * 0.55 * k)));
      if (lights) {
        lights.setMatrixAt(i * 2, M.compose(P.set(x + fx * (c.len / 2), o.y + 0.9, z + fz * (c.len / 2)), Q, S.set(1.9 * k, 0.5 * k, 0.5 * k)));
        lights.setMatrixAt(i * 2 + 1, M.compose(P.set(x - fx * (c.len / 2), o.y + 0.9, z - fz * (c.len / 2)), Q, S.set(1.9 * k, 0.45 * k, 0.4 * k)));
      }
    }
    cars.instanceMatrix.needsUpdate = true;
    if (lights) lights.instanceMatrix.needsUpdate = true;
  };
  tick(0);
  return { tick, block: (i, j) => [cx + i * cell, cz + j * cell], cell, road };
}

/** The roofs' sheet: gravel and vents, a garden, a pool terrace, solar panels (`glowOnly`: what is lit at night, on black). */
function paintRoofs(g: CanvasRenderingContext2D, RT: number, o: TownOpts, hz: (c: string, k?: number) => string, glowOnly: boolean) {
  const T = RT / 2;
  const snow = !!o.snow;
  const night = o.mode === "night";
  g.fillStyle = glowOnly ? "#000000" : "#ffffff";
  g.fillRect(0, 0, RT, RT);
  const rect = (c: string, x: number, y: number, w: number, h: number) => {
    g.fillStyle = glowOnly ? c : hz(c, 0.7);
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  for (let k = 0; k < 4; k++) {
    const x0 = (k % 2) * T,
      y0 = Math.floor(k / 2) * T;
    g.save();
    g.translate(x0, y0);
    if (!glowOnly) {
      // the parapet round it: a light rim, a dark line inside it
      const base = snow ? ["#f4f7fd", "#eaf1fb", "#dcefff", "#eef3fa"][k] : night ? ["#8f93a8", "#5d8f6a", "#9a8a7a", "#868ea6"][k] : ["#e2ddd2", "#8fd07a", "#e0c79e", "#d6dce6"][k];
      rect(base, 0, 0, T, T);
      rect(snow ? "#ffffff" : night ? "#b9bdd0" : "#f6f3ec", 0, 0, T, 12);
      rect(snow ? "#ffffff" : night ? "#b9bdd0" : "#f6f3ec", 0, T - 12, T, 12);
      rect(snow ? "#ffffff" : night ? "#b9bdd0" : "#f6f3ec", 0, 0, 12, T);
      rect(snow ? "#ffffff" : night ? "#b9bdd0" : "#f6f3ec", T - 12, 0, 12, T);
      g.strokeStyle = "rgba(20,24,50,0.22)";
      g.lineWidth = 3;
      g.strokeRect(13.5, 13.5, T - 27, T - 27);
    }
    if (glowOnly) {
      // (a night roof is never black: lamps along its parapet)
      for (let q = 0; q < 4; q++) {
        const t = 30 + q * ((T - 60) / 3);
        rect(k === 2 ? "#ff9ad8" : "#ffd9a0", t - 4, 16, 9, 9);
        rect(k === 2 ? "#ff9ad8" : "#ffd9a0", t - 4, T - 25, 9, 9);
      }
    }
    if (k === 0) {
      // gravel: a hatch, two vents (the boxes on it are real)
      if (!glowOnly) {
        rect(snow ? "#c9d6ea" : "#b9b4aa", T * 0.56, T * 0.6, T * 0.2, T * 0.16);
        for (const [vx, vy] of [
          [0.3, 0.7],
          [0.72, 0.3],
        ]) {
          g.fillStyle = hz(snow ? "#b9c8e0" : "#8f8a82", 0.7);
          g.beginPath();
          g.arc(vx * T, vy * T, 11, 0, Math.PI * 2);
          g.fill();
        }
      } else rect("#ffd9a0", T * 0.6, T * 0.64, T * 0.12, T * 0.08);
    } else if (k === 1) {
      // a garden: paths across the lawn, beds of flowers (under the snow: white beds, a trodden path)
      if (!glowOnly) {
        rect(snow ? "#d6e2f2" : "#efe6d2", T * 0.46, 16, T * 0.08, T - 32);
        rect(snow ? "#d6e2f2" : "#efe6d2", 16, T * 0.46, T - 32, T * 0.08);
        for (const [bx, by] of [
          [0.2, 0.2],
          [0.68, 0.2],
          [0.2, 0.68],
          [0.68, 0.68],
        ])
          rect(snow ? "#ffffff" : ["#ff8fb8", "#ffe08a", "#ffffff", "#ff9a6a"][Math.round(bx * 10 + by * 3) % 4], bx * T, by * T, T * 0.12, T * 0.12);
      } else
        for (const [bx, by] of [
          [0.46, 0.46],
          [0.2, 0.46],
          [0.72, 0.46],
        ])
          rect("#ffe6a8", bx * T + 4, by * T + 4, 12, 12);
    } else if (k === 2) {
      // a terrace: a pool, its white edge, parasols (the pool is lit at night; frozen in winter)
      rect(glowOnly ? "#000000" : "#ffffff", T * 0.16, T * 0.2, T * 0.5, T * 0.34);
      rect(glowOnly ? "#39d6ff" : snow ? "#bfe6ff" : "#4cc3f0", T * 0.16 + 6, T * 0.2 + 6, T * 0.5 - 12, T * 0.34 - 12);
      if (!glowOnly)
        for (const [px, py, c] of [
          [0.78, 0.26, "#ff6b5a"],
          [0.78, 0.5, "#ffffff"],
          [0.3, 0.76, "#ffcf5a"],
          [0.56, 0.76, "#ff6b5a"],
        ] as const) {
          g.fillStyle = hz(snow ? "#ffffff" : c, 0.7);
          g.beginPath();
          g.arc(px * T, py * T, 15, 0, Math.PI * 2);
          g.fill();
        }
    } else {
      // solar panels in rows
      if (!glowOnly)
        for (let r = 0; r < 3; r++)
          for (let c = 0; c < 3; c++) {
            rect(snow && (r + c) % 2 ? "#eef4fc" : "#34508f", T * 0.14 + c * T * 0.25, T * 0.16 + r * T * 0.24, T * 0.21, T * 0.17);
            rect("#8fb0e6", T * 0.14 + c * T * 0.25, T * 0.16 + r * T * 0.24 + T * 0.08, T * 0.21, 3);
          }
      else rect("#ff5a4a", T * 0.86, T * 0.1, 8, 8);
    }
    g.restore();
  }
}
