import * as THREE from "three";
import { Flora, P } from "./flora";
import { F, type GardensKit, LEVELS, MONO, paint, rr, SANS } from "./kit";
import { bench, dome, grassTex, haze, lamp, palm, Paths, pavingTex, plant, rainTree, rng, scatter } from "./shell";
import { type LightShow, supertree, type TreeSpec } from "./supertree";

/**
 * The Supertree Grove (ground) and the OCBC Skyway (22 m) share one zone: the lawn where people
 * lie down to watch Garden Rhapsody, the paths through tropical planting, the twelve Supertrees,
 * the Skyway hung between four of them, the two glass conservatories beyond the grove (their
 * entrance pavilions take you in) and the city all round.
 */

const f = F.grove;
const sky = F.skyway;
const DECK = 22;

export const TREES: TreeSpec[] = [
  // the Skyway's four
  { x: -30, z: -40, h: 38, r: 10, glow: "#c060ff" },
  { x: -24, z: -80, h: 42, r: 11, glow: "#ff4ab8" },
  { x: 20, z: -84, h: 40, r: 11, glow: "#3ef0d0" },
  { x: 32, z: -44, h: 37, r: 10, glow: "#ff6a3a" },
  // the tallest, at the back
  { x: 0, z: -110, h: 50, r: 14, glow: "#c060ff" },
  // the others
  { x: -54, z: -72, h: 27, r: 8, glow: "#3ef0d0" },
  { x: 56, z: -70, h: 26, r: 8, glow: "#ff4ab8" },
  { x: -42, z: -108, h: 31, r: 9, glow: "#ffb02e" },
  { x: 44, z: -110, h: 30, r: 9, glow: "#c060ff" },
  { x: -12, z: -22, h: 25, r: 7, glow: "#ff4ab8" },
  { x: 14, z: -24, h: 26, r: 7, glow: "#3ef0d0" },
  { x: -60, z: -32, h: 24, r: 7, glow: "#c060ff" },
  { x: 60, z: -30, h: 25, r: 7, glow: "#ffb02e" },
];
/** The lawn in the middle, where the crowd watches the show. */
const LAWN = { x: 0, z: -62, r: 15 };
export const CF_GATE: [number, number] = [-56, -124];
export const FD_GATE: [number, number] = [58, -124];

export function grove(k: GardensKit, flora: Flora, show: LightShow) {
  const zone = LEVELS[f].zone;
  const g = k.g(f);
  const r = rng(2024);

  // ---- ground: lawn, the paths -----------------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshLambertMaterial({ map: grassTex(60, 60) }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -60);
  ground.raycast = () => {};
  g.add(ground);
  const lawnMat = new THREE.MeshLambertMaterial({
    map: paint(512, 512, (c, W, H) => {
      c.fillStyle = "#58993c";
      c.fillRect(0, 0, W, H);
      for (let i = 0; i < 8; i++) {
        c.fillStyle = i % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
        c.fillRect(0, (i * H) / 8, W, H / 8);
      }
      const q = rng(3);
      for (let i = 0; i < 6000; i++) {
        c.fillStyle = `hsl(${90 + q() * 20},45%,${30 + q() * 18}%)`;
        c.fillRect(q() * W, q() * H, 1.5, 3);
      }
    }, 4, 4),
  });
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(LAWN.r, 64), lawnMat);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(LAWN.x, 0.015, LAWN.z);
  lawn.raycast = () => {};
  g.add(lawn);

  const paths = new Paths();
  const circle = (cx: number, cz: number, rx: number, rz: number, n = 64, a0 = 0, a1 = Math.PI * 2): [number, number][] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / n;
      return [cx + Math.sin(a) * rx, cz + Math.cos(a) * rz];
    });
  // the promenade from the gate, the ring round the lawn, the outer loop, branches to each tree and the two domes
  paths.add(k, f, [[0, 10], [0, -10], [0, -46]], 6);
  paths.add(k, f, circle(LAWN.x, LAWN.z, LAWN.r + 2, LAWN.r + 2), 4);
  const OUT = { x: 0, z: -70, rx: 46, rz: 44 };
  paths.add(k, f, circle(OUT.x, OUT.z, OUT.rx, OUT.rz, 96), 3.6);
  const branch = (t: TreeSpec, from: [number, number]) => {
    const d = new THREE.Vector2(from[0] - t.x, from[1] - t.z).normalize();
    paths.add(k, f, [from, [t.x + d.x * 3.8, t.z + d.y * 3.8]], 2.4);
  };
  for (const t of TREES) {
    // the nearest point of the outer loop or the lawn ring
    const a = Math.atan2(t.x - OUT.x, t.z - OUT.z);
    const onOut: [number, number] = [OUT.x + Math.sin(a) * OUT.rx, OUT.z + Math.cos(a) * OUT.rz];
    const b = Math.atan2(t.x - LAWN.x, t.z - LAWN.z);
    const onLawn: [number, number] = [LAWN.x + Math.sin(b) * (LAWN.r + 2), LAWN.z + Math.cos(b) * (LAWN.r + 2)];
    const dOut = Math.hypot(onOut[0] - t.x, onOut[1] - t.z),
      dLawn = Math.hypot(onLawn[0] - t.x, onLawn[1] - t.z);
    if (Math.min(dOut, dLawn) > 4) branch(t, dOut < dLawn ? onOut : onLawn);
  }
  // the dome paths
  paths.add(k, f, [[-38, -103], [-48, -114], CF_GATE], 4);
  paths.add(k, f, [[40, -104], [50, -114], FD_GATE], 4);
  // a path round each tree's planter
  for (const t of TREES) paths.add(k, f, circle(t.x, t.z, 4.6, 4.6, 28), 1.6);
  paths.build(k, f, new THREE.MeshLambertMaterial({ map: pavingTex(1, 1), polygonOffset: true, polygonOffsetFactor: -2 }));

  // ---- the boundary: the gate behind you, hedges round the sides, the back --------------------
  k.solid(f, -80, 8, 80, 9);
  k.solid(f, -81, -140, -80, 9);
  k.solid(f, 80, -140, 81, 9);
  k.solid(f, -80, -128, 80, -127);
  for (let x = -78; x <= 78; x += 2.2) {
    if (Math.abs(x) < 5) continue;
    flora.add(zone, "cross", P.bush, x, 0, 8.4, r() * 6, 2.6, 1.6);
  }
  // the gate: two stone piers, a steel lintel with the name
  for (const s of [-1, 1]) k.box(f, 1.2, 4.6, 1.2, s * 5, 0, 8.6, "#bcb4a6", "matte");
  k.box(f, 11.6, 0.6, 1.4, 0, 4.6, 8.6, "#5e2f45", "matte");
  k.label(f, "GARDENS BY THE BAY", 0, 4.9, 7.88, { h: 0.5, color: "#ffffff", glow: true, ry: Math.PI, font: `700 96px ${SANS}` });
  k.label(f, "GARDENS BY THE BAY", 0, 4.9, 9.32, { h: 0.5, color: "#ffffff", glow: true, font: `700 96px ${SANS}` });
  // the side boundaries: belts of rain trees, palms and planting
  for (let z = 4; z > -126; z -= 14) {
    rainTree(k, flora, f, -74 + r() * 4, z + r() * 6, 1.4 + r() * 0.5, r);
    rainTree(k, flora, f, 74 - r() * 4, z + r() * 6, 1.4 + r() * 0.5, r);
  }
  for (let x = -70; x <= 70; x += 13) if (Math.abs(x - CF_GATE[0]) > 9 && Math.abs(x - FD_GATE[0]) > 9) rainTree(k, flora, f, x + r() * 4, -128 + r() * 3, 1.3 + r() * 0.5, r);
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1;
    palm(k, flora, f, side * (62 + r() * 8), 2 - r() * 120, 7 + r() * 5, r);
  }
  for (let i = 0; i < 900; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (62 + r() * 17),
      z = 6 - r() * 134;
    if (paths.dist(x, z) < 0.5) continue;
    plant(flora, zone, [P.bush, P.fern, P.broad, P.heliconia, P.palm, P.bougain, P.grass][Math.floor(r() * 7)], x, 0, z, r, 1.2);
  }
  for (let i = 0; i < 500; i++) {
    const x = -78 + r() * 156,
      z = -114 - r() * 14;
    if (paths.dist(x, z) < 0.5 || Math.hypot(x - TREES[4].x, z - TREES[4].z) < 5) continue;
    plant(flora, zone, [P.bush, P.fern, P.broad, P.heliconia, P.palm, P.grass][Math.floor(r() * 6)], x, 0, z, r, 1.2);
  }

  // ---- the Supertrees ---------------------------------------------------------------------------
  const radius: ((h: number) => number)[] = [];
  TREES.forEach((t, i) => {
    radius.push(supertree(k, flora, show, f, i, t));
    // the planter, overflowing
    for (let j = 0; j < 26; j++) {
      const a = r() * Math.PI * 2,
        d = 2.2 + r() * 1.0;
      plant(flora, zone, [P.fern, P.bromeliad, P.broad, P.bush, P.orchid, P.heliconia][Math.floor(r() * 6)], t.x + Math.cos(a) * d, 0.5, t.z + Math.sin(a) * d, r, 0.8);
    }
  });

  // ---- planting along every path ----------------------------------------------------------------
  const inTree = (x: number, z: number) => TREES.some((t) => Math.hypot(x - t.x, z - t.z) < 5.6);
  const inLawn = (x: number, z: number) => Math.hypot(x - LAWN.x, z - LAWN.z) < LAWN.r + 0.6;
  const segs = [...paths.segs];
  for (const s of segs) {
    if (s.w < 2) continue;
    const L = s.a.distanceTo(s.b);
    const dir = new THREE.Vector2().subVectors(s.b, s.a).normalize();
    for (let u = 0; u < L; u += 1.7) {
      for (const side of [-1, 1]) {
        if (r() < 0.15) continue;
        const off = s.w / 2 + 0.9 + r() * 3.6;
        const x = s.a.x + dir.x * u - dir.y * off * side,
          z = s.a.y + dir.y * u + dir.x * off * side;
        if (paths.dist(x, z) < 0.6 || inTree(x, z) || inLawn(x, z)) continue;
        const near = off < s.w / 2 + 2;
        const kind = near ? [P.grass, P.marigold, P.salvia, P.bromeliad, P.fern, P.bush][Math.floor(r() * 6)] : [P.bush, P.broad, P.heliconia, P.fern, P.palm, P.bougain, P.orchid, P.bush][Math.floor(r() * 8)];
        plant(flora, zone, kind, x, 0, z, r, near ? 0.9 : 1.2);
      }
    }
  }
  // islands of planting between the paths
  for (const [x, z, rad] of [
    [-20, -10, 6],
    [22, -10, 6],
    [-40, -58, 7],
    [42, -58, 7],
    [-10, -98, 6],
    [12, -98, 6],
    [-36, -88, 5],
    [36, -92, 5],
    [-28, -20, 5],
    [30, -22, 5],
  ] as const)
    scatter(flora, f, paths, x, z, rad, 70, r, { avoid: (px, pz) => inTree(px, pz) || inLawn(px, pz), clear: 0.6, scale: 1.25 });
  // a few rain trees and palms inside the grove, framing the lawn
  for (const [x, z, s] of [
    [-18, -4, 1.1],
    [20, -6, 1.2],
    [-44, -50, 1.3],
    [46, -52, 1.25],
    [-14, -128, 1.4],
  ] as const)
    rainTree(k, flora, f, x, z, s, r);
  for (const [x, z] of [
    [-6, -2],
    [6, -4],
    [-8, -36],
    [8, -38],
    [-22, -60],
    [22, -64],
  ] as const)
    palm(k, flora, f, x, z, 6 + r() * 3, r);

  // ---- benches and lamps along the promenade and the lawn ring -----------------------------------
  for (let z = -4; z > -42; z -= 9) {
    bench(k, f, -4.2, z, Math.PI / 2);
    bench(k, f, 4.2, z - 4, -Math.PI / 2);
    lamp(k, f, -3.4, z - 2);
    lamp(k, f, 3.4, z - 6);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    lamp(k, f, LAWN.x + Math.sin(a) * (LAWN.r + 4.3), LAWN.z + Math.cos(a) * (LAWN.r + 4.3), "#e8d8ff");
  }

  // ---- the two conservatories beyond the grove ----------------------------------------------------
  dome(k, f, -96, -170, 46, 40, 58, { ribs: 40, rings: 8, arches: 5 });
  dome(k, f, 100, -176, 60, 44, 38, { ribs: 48, rings: 7, arches: 6, flat: 0.75 });
  // a green mountain shows through the Cloud Forest's glass
  k.cyl(f, 15, 9, 40, -96, 0, -166, "#2f6b3c", "matte", 12);
  k.geo(f, new THREE.SphereGeometry(9.5, 12, 8).translate(-96, 40, -166), "#3d8a4a", "matte");
  // the entrance pavilions
  for (const [gx, gz, name, to, col] of [
    [CF_GATE[0], CF_GATE[1], "CLOUD FOREST", F.cloud, "#3ef0d0"],
    [FD_GATE[0], FD_GATE[1], "FLOWER DOME", F.flower, "#ff8ac8"],
  ] as const) {
    k.box(f, 12, 0.4, 7, gx, 4.6, gz - 1, "#eef0f2", "metal");
    k.box(f, 11, 4.6, 0.12, gx, 0, gz - 4.2, "#cfe8f0", "glass");
    for (const s of [-1, 1]) k.box(f, 0.25, 4.6, 0.25, gx + s * 5.8, 0, gz + 2.2, "#eef0f2", "metal");
    k.box(f, 3.2, 3.2, 0.1, gx, 0, gz - 4.1, "#fff0d0", "glow");
    k.label(f, name, gx, 5.4, gz + 2.55, { h: 0.6, color: col, glow: true, font: `700 96px ${SANS}` });
    k.box(f, 12, 0.08, 0.08, gx, 4.55, gz + 2.5, col, "glow");
    k.solid(f, gx - 6, gz - 4.6, gx + 6, gz - 4.0);
    k.door(f, to, 3.2, 3.2, gx, 0, gz - 3.9);
  }

  // ---- the Skyway's lift at the foot of the first tree --------------------------------------------
  const T0 = TREES[0];
  const LX = T0.x + 4.2,
    LZ = T0.z + 3.6;
  k.box(f, 2.4, 3.2, 2.0, LX, 0, LZ, "#cfe8f0", "glass");
  k.box(f, 2.6, 0.3, 2.2, LX, 3.2, LZ, "#5e2f45", "matte");
  k.box(f, 1.2, 2.4, 0.06, LX, 0, LZ + 1.02, "#c0c4c8", "metal");
  k.label(f, "OCBC SKYWAY ▲ 22 m", LX, 3.75, LZ + 1.12, { h: 0.34, color: "#ff8ac8", glow: true });
  k.solid(f, LX - 1.2, LZ - 1, LX + 1.2, LZ + 1);
  k.door(f, sky, 1.4, 2.6, LX, 0, LZ + 1.2, 0, "Lift to");

  // ---- the show board by the gate -------------------------------------------------------------------
  const scr = makeBoard(k, show);
  scr.position.set(-7.5, 1.9, 2);
  scr.rotation.y = 0.5;
  g.add(scr);
  k.box(f, 0.14, 1.0, 0.14, -7.5, 0, 2, "#2a2a30", "metal");
  k.solid(f, -8.6, 1.4, -6.4, 2.6);

  // ---- light: the sun by day, coloured washes under the trees by night ---------------------------
  const lights = [k.light(f, TREES[0].x, 10, TREES[0].z, "#c060ff", 0, 40), k.light(f, TREES[3].x, 10, TREES[3].z, "#ff6a3a", 0, 40), k.light(f, LAWN.x, 14, LAWN.z, "#e8d8ff", 0, 50), k.light(f, 0, 8, -20, "#ffd8a8", 0, 40)];
  const sun = new THREE.DirectionalLight("#fff4e0", 1.6);
  sun.position.set(60, 120, 40);
  g.add(sun);
  k.themeFns.push((n) => {
    sun.intensity = n ? 0 : 1.6;
    lights.forEach((l, i) => l && (l.intensity = n ? [140, 140, 220, 90][i] : 0));
  });

  // the haze round the grove: the city beyond goes soft and far
  const veil = haze(new THREE.CylinderGeometry(150, 150, 220, 64, 1, true).translate(0, 110, -60), 140, 0.62, 0.0);
  g.add(veil.mesh);
  k.themeFns.push((n) => {
    veil.u.uColor.value.set(n ? "#0c1222" : "#cfdbe3");
    veil.u.uOp.value = n ? 0.45 : 0.6;
  });

  skyway(k, flora, radius);
  return paths;
}

/** The Garden Rhapsody board: block height, next show, now playing. */
function makeBoard(k: GardensKit, show: LightShow) {
  const [W, H] = [512, 320];
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), mat);
  mesh.raycast = () => {};
  const draw = () => {
    g.fillStyle = "#120a18";
    g.fillRect(0, 0, W, H);
    rr(g, 8, 8, W - 16, H - 16, 18);
    g.strokeStyle = "#c060ff";
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = "#ffffff";
    g.font = `800 40px ${SANS}`;
    g.fillText("GARDEN RHAPSODY", 30, 66);
    g.fillStyle = "#c8a8e8";
    g.font = `600 22px ${MONO}`;
    g.fillText("SUPERTREE GROVE · LIGHT & SOUND", 30, 100);
    const h = k.height;
    g.fillStyle = "#f4b728";
    g.font = `700 30px ${MONO}`;
    g.fillText(`BLOCK ${h ? h.toLocaleString("en-US") : "…"}`, 30, 160);
    g.fillStyle = show.running ? "#5cff9a" : "#ffffff";
    g.font = `800 44px ${MONO}`;
    g.fillText(show.running ? "● NOW PLAYING" : "NEXT · NEW BLOCK", 30, 230);
    g.fillStyle = "#8a7a9a";
    g.font = `600 22px ${MONO}`;
    g.fillText("19:45 · 20:45 · EVERY BLOCK", 30, 280);
    tex.needsUpdate = true;
  };
  draw();
  let acc = 0;
  k.ticks[0].push((dt) => {
    acc += dt;
    if (acc > 1) {
      acc = 0;
      draw();
    }
  });
  return mesh;
}

/**
 * The OCBC Skyway: 22 m up, a deck hung from trunk to trunk round the lawn, landings round each
 * trunk, glass railings with a line of light under the handrail and a teal strip under the deck.
 */
function skyway(k: GardensKit, flora: Flora, radius: ((h: number) => number)[]) {
  void flora;
  const path = [0, 1, 2, 3];
  // heights here are relative to the Skyway's floor (22 m up)
  const Y = 0;
  const HW = 1.0;
  const landing = path.map((i) => radius[i](DECK) + 2.4);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const deckCol = "#4a4a52",
    steel = "#e4e6ea";
  // the landings: an annulus deck round the trunk, its railing broken where the walks join
  const joins: number[][] = path.map(() => []);
  for (let s = 0; s + 1 < path.length; s++) {
    const A = TREES[path[s]],
      B = TREES[path[s + 1]];
    joins[s].push(Math.atan2(B.x - A.x, B.z - A.z));
    joins[s + 1].push(Math.atan2(A.x - B.x, A.z - B.z));
  }
  path.forEach((ti, s) => {
    const t = TREES[ti];
    const R = landing[s],
      r0 = radius[ti](DECK) + 0.15;
    const ring = new THREE.RingGeometry(r0, R, 48, 1).rotateX(-Math.PI / 2).translate(t.x, Y, t.z);
    k.geo(sky, ring, deckCol, "matte");
    k.geo(sky, new THREE.CylinderGeometry(R, R, 0.3, 48, 1, true).translate(t.x, Y - 0.15, t.z), steel, "metal");
    k.disc(sky, t.x, t.z, r0 + 0.2);
    const gap = Math.asin(Math.min(1, (HW + 0.15) / R));
    const open = (a: number) => joins[s].some((j) => Math.abs(Math.atan2(Math.sin(a - j), Math.cos(a - j))) < gap);
    const n = Math.round(R * 6);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2,
        a1 = ((i + 1) / n) * Math.PI * 2;
      if (open(a0) || open(a1)) continue;
      const p0 = v(t.x + Math.sin(a0) * R, Y, t.z + Math.cos(a0) * R),
        p1 = v(t.x + Math.sin(a1) * R, Y, t.z + Math.cos(a1) * R);
      railing(k, p0, p1);
      k.line(sky, p0.x, p0.z, p1.x, p1.z, 0.3);
    }
    // the underside: struts back to the trunk
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.beam(sky, v(t.x + Math.sin(a) * R, Y - 0.2, t.z + Math.cos(a) * R), v(t.x + Math.sin(a) * r0, Y - 3.5, t.z + Math.cos(a) * r0), 0.14, steel);
    }
  });
  // the walks between
  for (let s = 0; s + 1 < path.length; s++) {
    const A = TREES[path[s]],
      B = TREES[path[s + 1]];
    const d = v(B.x - A.x, 0, B.z - A.z).normalize();
    const nrm = v(-d.z, 0, d.x);
    const a = v(A.x, Y, A.z).addScaledVector(d, landing[s] - 0.3),
      b = v(B.x, Y, B.z).addScaledVector(d, -(landing[s + 1] - 0.3));
    const L = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const yaw = Math.atan2(d.x, d.z);
    // deck, edge girders, the light strip under it
    k.box(sky, HW * 2, 0.22, L, mid.x, Y - 0.22, mid.z, deckCol, "matte", yaw);
    for (const side of [-1, 1]) {
      const o = nrm.clone().multiplyScalar(side * HW);
      k.beam(sky, a.clone().add(o).setY(Y - 0.35), b.clone().add(o).setY(Y - 0.35), 0.3, steel);
      k.beam(sky, a.clone().add(o).setY(Y - 0.55), b.clone().add(o).setY(Y - 0.55), 0.06, "#3ef0d0", "glow");
      // railing
      const n = Math.ceil(L / 1.6);
      for (let i = 0; i < n; i++) {
        const p0 = a.clone().lerp(b, i / n).add(o),
          p1 = a.clone().lerp(b, (i + 1) / n).add(o);
        railing(k, p0, p1);
      }
      k.line(sky, a.x + o.x, a.z + o.z, b.x + o.x, b.z + o.z, 0.3);
    }
    // the sagging truss under the walk: a shallow arch of steel and its hangers
    const sag = (u: number) => Y - 1.2 - Math.sin(u * Math.PI) * 2.4;
    for (const side of [-1, 1]) {
      const o = nrm.clone().multiplyScalar(side * (HW - 0.1));
      let prev: THREE.Vector3 | null = null;
      for (let i = 0; i <= 16; i++) {
        const u = i / 16;
        const p = a.clone().lerp(b, u).add(o).setY(sag(u));
        if (prev) k.beam(sky, prev, p, 0.16, steel);
        if (i % 2 === 0) k.beam(sky, p, p.clone().setY(Y - 0.4), 0.06, steel);
        prev = p;
      }
    }
    for (let i = 0; i <= Math.ceil(L / 2); i++) {
      const p = a.clone().lerp(b, i / Math.ceil(L / 2)).setY(Y - 0.4);
      k.beam(sky, p.clone().addScaledVector(nrm, -HW), p.clone().addScaledVector(nrm, HW), 0.1, steel);
    }
  }
  // the lift back down, on the first landing
  const t0 = TREES[0];
  const ja = joins[0][0];
  const la = ja + Math.PI * 0.75;
  const R0 = landing[0];
  const lx = t0.x + Math.sin(la) * (R0 - 0.9),
    lz = t0.z + Math.cos(la) * (R0 - 0.9);
  const ry = la + Math.PI;
  k.box(sky, 1.8, 2.6, 0.5, lx, 0, lz, "#cfe8f0", "glass", ry);
  k.box(sky, 1.1, 2.3, 0.06, lx - Math.sin(ry) * 0.02, 0, lz - Math.cos(ry) * 0.02, "#c0c4c8", "metal", ry);
  const lbl = k.label(sky, "▼ G · SUPERTREE GROVE", lx + Math.sin(la) * -0.3, 2.9, lz + Math.cos(la) * -0.3, { h: 0.2, color: "#7dffb0", glow: true, ry: la + Math.PI });
  void lbl;
  k.door(sky, F.grove, 1.4, 2.4, lx, 0, lz, ry, "Lift to");
  // where you step out on the Skyway: by the lift, looking along the first walk
  // (mid-landing, a little round from the walk's mouth: clear of its railing posts)
  const sa = ja + 0.5;
  LEVELS[sky].spawn = [t0.x + Math.sin(sa) * (R0 - 1.1), t0.z + Math.cos(sa) * (R0 - 1.1)];
  LEVELS[sky].yaw = ja + Math.PI;
}

/** One bay of the Skyway's railing between p0 and p1 (deck level): post, glass, handrail, light. */
function railing(k: GardensKit, p0: THREE.Vector3, p1: THREE.Vector3) {
  const sky = F.skyway;
  const ry = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
  const L = p0.distanceTo(p1);
  const m = p0.clone().add(p1).multiplyScalar(0.5);
  const y = p0.y;
  k.box(sky, 0.07, 1.15, 0.07, p0.x, y, p0.z, "#e4e6ea", "metal");
  k.box(sky, L, 1.0, 0.03, m.x, y + 0.05, m.z, "#b8dce8", "glass", ry);
  k.box(sky, L + 0.04, 0.07, 0.12, m.x, y + 1.12, m.z, "#d8dadf", "metal", ry);
  k.box(sky, L, 0.03, 0.05, m.x, y + 1.06, m.z, "#ffe8c0", "glow", ry);
}
