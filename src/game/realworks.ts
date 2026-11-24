import * as THREE from "three";
import { hex, Kit, roundRect, type Slot, type V2, type V3 } from "../scene/real/lmkit";
import { kitGeos, kitMeshes, type KitGeos } from "../scene/real/kitobj";
import { VOX } from "../scene/voxel/model";
import { FH, footprint, GLASS, NEON, WALL, type Plan } from "./design";

/**
 * The City Works buildings, realistic (branch gta-real): the same plans (src/game/design.ts: style,
 * floors, wall, glass, neon, crown) built floor by floor in metres with the city's materials — a
 * photographed curtain wall or masonry facade per style (lit rooms at night), slabs, mullions, the
 * neon up the corners, a lobby on the ground floor, the crown on top; the frame going up is bare
 * concrete with its columns and rebar. Centred like the voxel models it replaces (front at +z).
 */

const FLOOR_M = FH * VOX;

function outline(p: Plan, f: number, grow = 0): V2[] {
  const fp = footprint(p, f);
  const hx = fp.hx * VOX + grow,
    hz = fp.hz * VOX + grow;
  const c = Math.cos(fp.rot),
    s = Math.sin(fp.rot);
  return (
    [
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
      [-hx, -hz],
    ] as V2[]
  )
    .map(([x, z]) => [x * c - z * s, x * s + z * c] as V2)
    .reverse();
}

const FACADE_OF: Record<string, Slot> = { tower: "f001", twist: "f005", deco: "f019", pagoda: "f020", market: "f017", garden: "f006" };

/** One floor of a plan. */
export function realWorksFloor(p: Plan, f: number): KitGeos {
  const K = new Kit({ lod: 0 });
  const wall = hex(WALL[p.wall] ?? WALL.white),
    glass = hex(GLASS[p.glass] ?? GLASS.sky),
    neon = hex(NEON[p.neon] ?? NEON.cyan);
  const pts = outline(p, f);
  const fac = FACADE_OF[p.style] ?? "f017";
  // the slab, the facade, the corner piers in the wall's colour with the neon up their faces
  K.prism("lm.Concrete034", outline(p, f, 0.08), 0, 0.3, wall, { lid: null });
  const glassy = p.style === "tower" || p.style === "twist" || p.style === "garden";
  K.prism(fac, pts, 0.3, FLOOR_M, glassy ? glass : wall, { fh: FLOOR_M, lid: null });
  for (const [x, z] of pts) {
    K.cyl("lm.Concrete034", x, z, 0.22, 0.22, 0, FLOOR_M, wall, { sides: 8, caps: "none" });
    K.cyl("lm.glow", x, z, 0.235, 0.235, 0.6, FLOOR_M - 0.4, neon, { sides: 8, caps: "none" });
  }
  // a balcony band on the garden style, its planting
  if (p.style === "garden") {
    K.prism("lm.Concrete034", outline(p, f, 0.9), FLOOR_M - 0.3, FLOOR_M, wall, { lid: "lm.Grass004", lidCol: hex("#5f8f4a") });
    for (let i = 0; i < 4; i++) {
      const [ax, az] = pts[i],
        [bx, bz] = pts[(i + 1) % 4];
      for (let t = 0.15; t < 0.9; t += 0.25) K.sphere("lm.Grass004", ax + (bx - ax) * t, FLOOR_M + 0.2, az + (bz - az) * t, 0.45, hex(["#5f8f4a", "#3a9a6a", "#7fb069"][i % 3]), { segs: 6 });
    }
  }
  // the pagoda: a flared tile eave round every floor
  if (p.style === "pagoda") {
    const roofC = hex(new THREE.Color(WALL[p.wall] ?? "#ffffff").getHSL({ h: 0, s: 0, l: 0 }).l > 0.45 ? "#2a2f3a" : "#a8553a");
    K.loft("lm.RoofingTiles006", [
      { y: FLOOR_M - 0.6, pts: outline(p, f, 1.3) },
      { y: FLOOR_M - 0.1, pts: outline(p, f, 0.1) },
    ], roofC, { lid: null });
  }
  // the deco style: a gold band every floor
  if (p.style === "deco") K.prism("lm.Metal032.metal", outline(p, f, 0.05), FLOOR_M - 0.25, FLOOR_M, hex("#d9a63a"), { lid: null });
  // the ground floor: the lobby lit behind its glass, the doors, a canopy in neon
  if (f === 0) {
    const fp = footprint(p, 0);
    const front = fp.hz * VOX + 0.06;
    const w = Math.min(fp.hx * VOX - 0.6, 3.5);
    K.quad("lm.glow", [-w, 0.3, front], [w, 0.3, front], [w, 2.8, front], [-w, 2.8, front], [0, 0, 1], (q) => [q[0], q[1]], hex("#ffe3a3", 0.8));
    K.box("lm.glass", -1, 0.3, front + 0.02, 1, 2.4, front + 0.06, hex("#1c2433"));
    for (let x = -w; x <= w + 0.01; x += w / 3) K.box("lm.Metal032.metal", x - 0.04, 0.3, front, x + 0.04, 2.8, front + 0.1, wall);
    K.box("lm.Concrete034", -w - 0.4, 2.9, front, w + 0.4, 3.15, front + 1.6, wall);
    K.box("lm.glow", -w - 0.4, 2.85, front + 1.55, w + 0.4, 2.9, front + 1.6, neon);
  }
  return kitGeos(K.out(), f * FLOOR_M);
}

/** The crown on the finished building. */
export function realWorksCrown(p: Plan): KitGeos {
  const K = new Kit({ lod: 0 });
  const top = outline(p, p.floors - 1);
  const fp = footprint(p, p.floors - 1);
  const wall = hex(WALL[p.wall] ?? WALL.white),
    neon = hex(NEON[p.neon] ?? NEON.cyan);
  // the roof deck and its parapet
  K.prism("lm.Concrete034", outline(p, p.floors - 1, 0.1), 0, 0.9, wall, { lid: "lm.Concrete034", lidCol: hex("#3b3a42") });
  K.prism("lm.glow", outline(p, p.floors - 1, 0.12), 0.7, 0.8, neon, { lid: null });
  const r = Math.min(fp.hx, fp.hz) * VOX;
  if (p.style === "pagoda") {
    K.loft("lm.RoofingTiles006", [
      { y: 0.9, pts: outline(p, p.floors - 1, 1.4) },
      { y: 0.9 + r * 0.8, pts: outline(p, p.floors - 1, -r + 0.2) },
    ], hex("#2a2f3a"), { lid: null });
    K.cyl("lm.Metal032.metal", 0, 0, 0.15, 0.03, 0.9 + r * 0.8, 0.9 + r * 0.8 + 3, hex("#d9a63a"), { sides: 8 });
    return kitGeos(K.out(), p.floors * FLOOR_M);
  }
  switch (p.crown) {
    case "spire":
      K.cyl("lm.Metal032.metal", 0, 0, r * 0.35, r * 0.25, 0.9, 3, wall, { sides: 12 });
      K.cyl("lm.chrome", 0, 0, r * 0.18, 0.04, 3, 3 + r * 2.2, hex("#d8dce0"), { sides: 12 });
      K.sphere("lm.glow", 0, 3 + r * 2.2, 0, 0.18, neon, { segs: 6 });
      break;
    case "antenna":
      K.box("lm.Metal032", -1, 0.9, -1, 1, 2.4, 1, hex("#8a8690"));
      K.cyl("lm.Metal032.metal", 0, 0, 0.12, 0.05, 2.4, 2.4 + r * 1.6, hex("#c8ccd0"), { sides: 8 });
      for (let y = 4; y < r * 1.6; y += 3) K.bar("lm.Metal032.metal", [-0.6, 2.4 + y, 0], [0.6, 2.4 + y, 0], 0.04, hex("#c8ccd0"));
      K.sphere("lm.glow", 0, 2.4 + r * 1.6 + 0.1, 0, 0.15, hex("#ff2a2a"), { segs: 6 });
      break;
    case "dome":
      K.cyl("lm.Concrete034", 0, 0, r * 0.7, r * 0.7, 0.9, 1.6, wall, { sides: 28 });
      K.sphere("lm.glass", 0, 1.6, 0, r * 0.68, hex(GLASS[p.glass] ?? GLASS.sky), { hemi: true, segs: 20 });
      K.cyl("lm.glow", 0, 0, r * 0.7 + 0.02, r * 0.7 + 0.02, 1.5, 1.6, neon, { sides: 28, caps: "none" });
      break;
    case "garden":
      K.prism("lm.Grass004", outline(p, p.floors - 1, -0.4), 0.9, 1.0, hex("#5f8f4a"), { lid: "lm.Grass004", lidCol: hex("#5f8f4a") });
      for (const [x, z] of top.map(([x, z]) => [x * 0.6, z * 0.6] as V2)) {
        K.cyl("lm.Wood049", x, z, 0.12, 0.15, 1, 2.6, hex("#5a4030"), { sides: 6 });
        K.sphere("lm.Grass004", x, 3.2, z, 1, hex("#3a9a6a"), { segs: 8 });
      }
      break;
    case "helipad":
      K.cyl("lm.Concrete034", 0, 0, r * 0.25, r * 0.25, 0.9, 2.2, wall, { sides: 16 });
      K.cyl("lm.Concrete034", 0, 0, r * 0.85, r * 0.85, 2.2, 2.45, hex("#4a4e56"), { sides: 32 });
      K.cyl("lm.glow", 0, 0, r * 0.86, r * 0.86, 2.35, 2.47, neon, { sides: 32, caps: "none" });
      K.box("lm.paint", -1.2, 2.46, -0.2, 1.2, 2.48, 0.2, hex("#f4f4f0"));
      for (const x of [-1.2, 0.8]) K.box("lm.paint", x, 2.46, -1.3, x + 0.4, 2.48, 1.3, hex("#f4f4f0"));
      break;
    case "billboard": {
      const w = Math.min(fp.hx * VOX * 1.6, 9);
      for (const x of [-w / 3, w / 3]) K.box("lm.Metal032.metal", x - 0.1, 0.9, -0.1, x + 0.1, 3.2, 0.1, hex("#3a3842"));
      K.box("lm.dark", -w / 2, 3.2, -0.15, w / 2, 3.2 + w * 0.4, 0.15, hex("#141218"));
      K.box("lm.glow", -w / 2 + 0.2, 3.4, 0.15, w / 2 - 0.2, 3.2 + w * 0.4 - 0.2, 0.17, neon);
      break;
    }
    default:
      K.box("lm.Metal032", -1.2, 0.9, -1.2, 1.2, 2.2, 1.2, hex("#c8ccd0"));
  }
  return kitGeos(K.out(), p.floors * FLOOR_M);
}

/** The floor going up: bare slab, round columns, rebar sticking out of them. */
export function realWorksFrame(p: Plan, f: number) {
  const K = new Kit({ lod: 0 });
  const fp = footprint(p, f);
  K.prism("lm.Concrete034", outline(p, f), 0, 0.3, hex("#9a958c"), { lid: "lm.Concrete034", lidCol: hex("#a8a398") });
  const c = Math.cos(fp.rot),
    s = Math.sin(fp.rot);
  for (let x = -fp.hx + 2; x <= fp.hx - 1; x += 10)
    for (let z = -fp.hz + 2; z <= fp.hz - 1; z += 10) {
      const px = (x * c - z * s) * VOX,
        pz = (x * s + z * c) * VOX;
      K.cyl("lm.Concrete034", px, pz, 0.2, 0.2, 0.3, FLOOR_M, hex("#9a958c"), { sides: 10 });
      for (const [dx, dz] of [
        [0.08, 0.08],
        [-0.08, 0.08],
        [0.08, -0.08],
        [-0.08, -0.08],
      ])
        K.bar("lm.dark", [px + dx, FLOOR_M, pz + dz], [px + dx, FLOOR_M + 0.5, pz + dz], 0.02, hex("#6a4a3a"));
    }
  return kitMeshes(kitGeos(K.out()));
}

/** A builder: boots, work trousers, a high-vis vest with its reflective band, arms, a hard hat. */
let proto: THREE.Group | null = null;
export function realWorker() {
  if (!proto) {
    const K = new Kit({ lod: 0 });
    const P = (x: number, y: number, z: number): V3 => [x, y, z];
    for (const sx of [-0.1, 0.1]) {
      K.cyl("lm.dark", sx, 0.03, 0.07, 0.07, 0, 0.1, hex("#2a2a30"), { sides: 8 });
      K.cyl("lm.paint", sx, 0, 0.07, 0.08, 0.1, 0.8, hex("#2a3550"), { sides: 8 });
    }
    K.loft("lm.paint", [
      { y: 0.78, pts: roundRect(0, 0, 0.18, 0.11, 0.08, 2) },
      { y: 1.35, pts: roundRect(0, 0, 0.21, 0.12, 0.09, 2) },
      { y: 1.45, pts: roundRect(0, 0, 0.15, 0.1, 0.08, 2) },
    ], hex("#ff7a1a"), { lid: "lm.paint", lidCol: hex("#ff7a1a"), smooth: true });
    K.cyl("lm.glow", 0, 0, 0.215, 0.215, 1.05, 1.1, hex("#e8f0f0", 0.6), { sides: 12, caps: "none" });
    for (const sx of [-1, 1]) K.bar("lm.paint", P(sx * 0.22, 1.38, 0), P(sx * 0.26, 0.9, 0.04), 0.07, hex("#ff7a1a"));
    K.cyl("lm.paint", 0, 0, 0.05, 0.05, 1.45, 1.52, hex("#e8b88a"), { sides: 8 });
    K.sphere("lm.paint", 0, 1.62, 0, 0.11, hex("#e8b88a"), { segs: 8 });
    K.sphere("lm.plastic", 0, 1.66, 0, 0.13, hex("#f4d020"), { hemi: true, segs: 10 });
    K.cyl("lm.plastic", 0, 0.02, 0.15, 0.15, 1.65, 1.67, hex("#f4d020"), { sides: 12 });
    proto = kitMeshes(kitGeos(K.out()), { shadows: false, shared: true });
  }
  return proto.clone();
}
