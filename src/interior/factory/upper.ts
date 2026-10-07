import * as THREE from "three";
import type { Rect } from "../types";
import { Boxes, GLASS, GLOW, SOLID, voxObj } from "./batch";
import { canvasTex, drawPlate, GOLD, JP, makeCanvas, MONO, neonSign } from "./canvas";
import { CAT_Y, CTRL, EAVE, X0 } from "./layout";
import { drawMonitor, drawWall, WALL_PX, type HallState, type MonitorKind } from "./screens";
import { deskModel, elevatorModel, monitorStand } from "./voxels";

/**
 * Upstairs: the control room on the mezzanine (tiers of desks facing the glass over the hall, the
 * live walls on its sides) and, above it, the catwalks that cross the hall under the roof.
 */

/** Riser steps of the control room's tiers (z from which the floor is that much higher). */
const TIERS: [number, number][] = [
  [-5.6, 0.3],
  [-3.2, 0.6],
];

export interface Monitor {
  kind: MonitorKind;
  g: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  mesh: THREE.Mesh;
}

export function buildControl(root: THREE.Object3D, rects: Rect[], pickables: THREE.Object3D[]) {
  const y = CTRL.y;
  const st = new Boxes();
  const glow = new Boxes();
  // floor (diamond plate in the aisles, carpet on the tiers), ceiling with light panels
  const plate = drawPlate();
  plate.repeat.set((CTRL.x1 - CTRL.x0) / 1.5, (CTRL.z1 - CTRL.z0) / 1.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(CTRL.x1 - CTRL.x0, CTRL.z1 - CTRL.z0), new THREE.MeshStandardMaterial({ map: plate, roughness: 0.6, metalness: 0.4 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, y + 0.01, (CTRL.z0 + CTRL.z1) / 2);
  root.add(floor);
  for (const [z, h] of TIERS) {
    st.add("#1a1a22", CTRL.x1 - CTRL.x0 - 0.8, h, CTRL.z1 - z, 0, y, (z + CTRL.z1) / 2);
    glow.add(new THREE.Color(GOLD).multiplyScalar(1.6), CTRL.x1 - CTRL.x0 - 0.8, 0.03, 0.04, 0, y + h - 0.02, z - 0.01);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(CTRL.x1 - CTRL.x0, CTRL.z1 - CTRL.z0), new THREE.MeshStandardMaterial({ color: "#121117", roughness: 0.9 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CTRL.top - 0.01, (CTRL.z0 + CTRL.z1) / 2);
  root.add(ceil);
  for (let x = CTRL.x0 + 2; x < CTRL.x1 - 1; x += 4) for (const z of [-7.5, -4.5, -1.5]) glow.add(new THREE.Color("#e8f0ff").multiplyScalar(1.3), 2.4, 0.03, 0.6, x + 1, CTRL.top - 0.05, z);
  // walls: the sides and the back are solid; the front is glass over the hall
  const wallM = new THREE.MeshStandardMaterial({ color: "#16151b", roughness: 0.8 });
  for (const [w, d, x, z] of [
    [0.3, CTRL.z1 - CTRL.z0, CTRL.x0, (CTRL.z0 + CTRL.z1) / 2],
    [0.3, CTRL.z1 - CTRL.z0, CTRL.x1, (CTRL.z0 + CTRL.z1) / 2],
    [CTRL.x1 - CTRL.x0, 0.3, 0, CTRL.z1 - 0.15],
  ] as [number, number, number, number][]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, CTRL.top - y, d), wallM);
    m.position.set(x, (y + CTRL.top) / 2, z);
    root.add(m);
  }
  rects.push([CTRL.x0 - 0.2, CTRL.z0, CTRL.x0 + 0.25, CTRL.z1], [CTRL.x1 - 0.25, CTRL.z0, CTRL.x1 + 0.2, CTRL.z1], [CTRL.x0, CTRL.z1 - 0.35, CTRL.x1, CTRL.z1], [CTRL.x0, CTRL.z0 - 0.2, CTRL.x1, CTRL.z0 + 0.25]);
  st.add("#26252d", CTRL.x1 - CTRL.x0, 0.9, 0.25, 0, y, CTRL.z0 + 0.1);
  glow.add(new THREE.Color(GOLD).multiplyScalar(1.2), CTRL.x1 - CTRL.x0, 0.02, 0.03, 0, y + 0.9, CTRL.z0 + 0.22);
  for (let x = CTRL.x0; x <= CTRL.x1 + 0.01; x += 2.75) st.add("#2a2933", 0.1, CTRL.top - y, 0.12, x, y, CTRL.z0 + 0.02);
  st.add("#2a2933", CTRL.x1 - CTRL.x0, 0.14, 0.14, 0, CTRL.top - 0.14, CTRL.z0 + 0.02);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(CTRL.x1 - CTRL.x0, CTRL.top - y - 0.9), GLASS);
  glass.position.set(0, (y + 0.9 + CTRL.top) / 2, CTRL.z0 + 0.02);
  glass.renderOrder = 2;
  root.add(glass);
  // fascia over the hall (seen from below), the room's name inside
  const fascia = neonSign([{ text: "制御室 · CONTROL ROOM", font: JP(84, 900) }, { text: "PROOF FACTORY OPERATIONS", font: MONO(44, 800), color: "#e8e0c8" }], { color: "#4ad0ff", w: 9, h: 1.5 });
  fascia.position.set(0, CTRL.y - 1.15, CTRL.z0 - 0.08);
  fascia.rotation.y = Math.PI;
  root.add(fascia);
  const inside = neonSign([{ text: "MISSION CONTROL · 制御室", font: JP(80, 900) }], { color: GOLD, w: 7, h: 0.8 });
  inside.rotation.y = Math.PI;
  inside.position.set(-4, y + 3.1, CTRL.z1 - 0.32);
  root.add(inside);
  // clocks on the back wall: UTC and block time
  const clockC = makeCanvas(512, 128);
  const clockTex = canvasTex(clockC.c);
  const clock = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: clockTex, toneMapped: false }));
  clock.rotation.y = Math.PI;
  clock.position.set(5.5, y + 3.1, CTRL.z1 - 0.32);
  root.add(clock);

  // desks in three tiers facing the glass, two monitors on each
  const monitors: Monitor[] = [];
  const kinds: MonitorKind[] = ["leaderboard", "blocks", "network", "recent", "nakamoto", "line"];
  const stand = monitorStand();
  const seats: THREE.Vector3[] = [];
  const rows: [number, number[], number][] = [
    [-8.2, [-15, -9, -3, 3, 9, 15], 0],
    [-5.0, [-12, -6, 6, 12], TIERS[0][1]],
    [-2.4, [-3, 3], TIERS[1][1]],
  ];
  let n = 0;
  for (const [z, xs, h] of rows)
    for (const x of xs) {
      const d = voxObj(deskModel(n), 0.5);
      d.position.set(x, y + h, z);
      root.add(d);
      rects.push([x - 1.25, z - 0.45, x + 1.25, z + 0.45]);
      seats.push(new THREE.Vector3(x, y + h, z + 0.95));
      for (const j of [0, 1]) {
        const kind = kinds[(n * 2 + j) % kinds.length];
        const { c, g } = makeCanvas(512, 288);
        const tex = canvasTex(c);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.59), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.64, 0.04), new THREE.MeshStandardMaterial({ color: "#121117", roughness: 0.5 }));
        const grp = new THREE.Group();
        mesh.position.z = 0.022;
        grp.add(back, mesh);
        const dx = j ? 0.56 : -0.56;
        grp.position.set(x + dx, y + h + 0.75 + 0.1 + 0.32, z - 0.22);
        grp.rotation.y = j ? -0.18 : 0.18;
        grp.rotation.x = -0.08;
        const sv = voxObj(stand, 0.5);
        sv.position.set(x + dx, y + h + 0.75, z - 0.28);
        root.add(grp, sv);
        mesh.userData.monitor = kind;
        pickables.push(mesh);
        monitors.push({ kind, g, tex, mesh });
      }
      n++;
    }
  // the live walls on the sides of the room
  const wallCanvas = makeCanvas(WALL_PX.w, WALL_PX.h);
  const wallTex = canvasTex(wallCanvas.c);
  const sideW = 8.6;
  const side = new THREE.Mesh(new THREE.PlaneGeometry(sideW, (sideW * WALL_PX.h) / WALL_PX.w), new THREE.MeshBasicMaterial({ map: wallTex, toneMapped: false }));
  side.rotation.y = Math.PI / 2;
  side.position.set(CTRL.x0 + 0.2, y + 2.2, -4.5);
  side.userData.monitor = "network";
  root.add(side);
  pickables.push(side);
  const side2 = new THREE.Mesh(side.geometry, side.material);
  side2.rotation.y = -Math.PI / 2;
  side2.position.set(CTRL.x1 - 0.2, y + 2.2, -4.5);
  side2.userData.monitor = "network";
  root.add(side2);
  pickables.push(side2);
  // elevator doors on the back wall of every upper floor
  for (const yy of [y, CAT_Y]) {
    const e = voxObj(elevatorModel());
    e.rotation.y = Math.PI;
    e.position.set(16, yy + (yy === y ? TIERS[1][1] : 0), CTRL.z1 - 0.32);
    root.add(e);
    const lab = neonSign([{ text: yy === y ? "EV · 1F" : "EV · 2F", font: MONO(60, 800) }], { color: GOLD, w: 1.1, h: 0.35 });
    lab.rotation.y = Math.PI;
    lab.position.set(16, yy + 3.3, CTRL.z1 - 0.34);
    root.add(lab);
  }
  // coffee corner
  const ty = y + TIERS[1][1];
  st.add("#26252d", 2.4, 0.95, 0.7, -18.5, ty, -0.7);
  st.add("#c0c0c8", 0.5, 0.6, 0.45, -19.2, ty + 0.95, -0.75);
  glow.add(new THREE.Color("#3ddc97").multiplyScalar(2), 0.06, 0.06, 0.02, -19.1, ty + 1.4, -0.52);
  rects.push([-19.8, -1.1, -17.2, CTRL.z1]);

  root.add(st.mesh(SOLID), glow.mesh(GLOW));

  const light1 = new THREE.PointLight("#cfe0ff", 22, 18, 1.2);
  light1.position.set(-8, y + 3.2, -4.5);
  const light2 = new THREE.PointLight("#cfe0ff", 22, 18, 1.2);
  light2.position.set(8, y + 3.2, -4.5);
  root.add(light1, light2);

  let mi = 0;
  function update(t: number, st: HallState, active: boolean) {
    if (!active) return;
    const m = monitors[mi++ % monitors.length];
    drawMonitor(m.g, m.kind, t, st);
    m.tex.needsUpdate = true;
    if (mi % 4 === 0) {
      drawWall(wallCanvas.g, t, st);
      wallTex.needsUpdate = true;
      const g = clockC.g;
      g.fillStyle = "#060508";
      g.fillRect(0, 0, 512, 128);
      g.strokeStyle = GOLD;
      g.lineWidth = 4;
      g.strokeRect(4, 4, 504, 120);
      g.font = MONO(22, 800);
      g.fillStyle = "#8a8f9c";
      g.fillText("UTC", 24, 44);
      g.fillText("LAST BLOCK", 270, 44);
      g.font = MONO(46, 800);
      g.fillStyle = "#3ddc97";
      const d = new Date();
      g.fillText(d.toISOString().slice(11, 19), 24, 100);
      g.fillStyle = GOLD;
      const ago = st.last ? Math.max(0, Math.round((Date.now() - st.last.at) / 1000)) : null;
      g.fillText(ago === null ? "—" : ago < 600 ? `${ago}s` : `${Math.round(ago / 60)}m`, 270, 100);
      clockTex.needsUpdate = true;
    }
  }

  return {
    update,
    seats,
    lights: [light1, light2],
    groundAt(x: number, z: number) {
      if (x < CTRL.x0 + 0.4 || x > CTRL.x1 - 0.4) return null;
      let h = 0;
      for (const [tz, th] of TIERS) if (z > tz) h = th;
      return h ? y + h : null;
    },
  };
}

// ---- catwalks -----------------------------------------------------------------------------------

/** Walkable strips at CAT_Y: [x0, z0, x1, z1]. */
export const WALKS: Rect[] = [
  [CTRL.x0 + 0.3, CTRL.z0, CTRL.x1 - 0.3, CTRL.z1 - 0.4],
  [-0.75, -62.25, 0.75, CTRL.z0],
  [-60.2, -13.25, 58.5, -11.75],
  [-60.2, -39.75, 40.3, -38.25],
  [-60.2, -63.75, -8, -62.25],
  [8, -63.75, 40.3, -62.25],
  [-34.85, -63.75, -33.35, -11.75],
  [32.35, -63.75, 33.85, -11.75],
  [-61.95, -63.75, -60.2, -11.75],
];

function gratingTexture() {
  const { c, g } = makeCanvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = "#4a4855";
  for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 3, 64);
  for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 3);
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function buildCatwalks(root: THREE.Object3D, rects: Rect[]) {
  const y = CAT_Y;
  const st = new Boxes();
  const glow = new Boxes();
  const grate = gratingTexture();
  const mat = new THREE.MeshStandardMaterial({ map: grate, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.6 });
  // the control room's roof is a solid deck
  const roofDeck = new THREE.Mesh(new THREE.BoxGeometry(CTRL.x1 - CTRL.x0, 0.3, CTRL.z1 - CTRL.z0), new THREE.MeshStandardMaterial({ color: "#24232b", roughness: 0.8 }));
  roofDeck.position.set(0, y - 0.15, (CTRL.z0 + CTRL.z1) / 2);
  root.add(roofDeck);
  for (const [x0, z0, x1, z1] of WALKS.slice(1)) {
    const w = x1 - x0,
      d = z1 - z0;
    const g = new THREE.PlaneGeometry(w, d);
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w * 2, uv.getY(k) * d * 2);
    const m = new THREE.Mesh(g, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    root.add(m);
    // stringers under the edges, hangers up to the trusses
    const along = w > d;
    if (along) {
      st.add("#3a3944", w, 0.2, 0.08, (x0 + x1) / 2, y - 0.2, z0);
      st.add("#3a3944", w, 0.2, 0.08, (x0 + x1) / 2, y - 0.2, z1);
      for (let x = x0 + 1; x < x1; x += 4) for (const z of [z0, z1]) st.add("#2a2933", 0.04, EAVE - 1.6 - y, 0.04, x, y, z);
    } else {
      st.add("#3a3944", 0.08, 0.2, d, x0, y - 0.2, (z0 + z1) / 2);
      st.add("#3a3944", 0.08, 0.2, d, x1, y - 0.2, (z0 + z1) / 2);
      for (let z = z0 + 1; z < z1; z += 4) for (const x of [x0, x1]) st.add("#2a2933", 0.04, EAVE - 1.6 - y, 0.04, x, y, z);
    }
  }
  // railings wherever a walkable cell meets the void: on a 0.25 m grid
  const S = 0.25;
  const gx0 = X0 - 1,
    gz0 = -75;
  const W = Math.ceil(130 / S),
    H = Math.ceil(77 / S);
  const ok = new Uint8Array(W * H);
  for (const [x0, z0, x1, z1] of WALKS)
    for (let i = Math.round((x0 - gx0) / S); i < Math.round((x1 - gx0) / S); i++) for (let j = Math.round((z0 - gz0) / S); j < Math.round((z1 - gz0) / S); j++) ok[j * W + i] = 1;
  const free = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && ok[j * W + i] === 1;
  const rail = (ax: number, az: number, bx: number, bz: number) => {
    const alongX = Math.abs(az - bz) < 0.001;
    const len = alongX ? bx - ax : bz - az;
    const cx = (ax + bx) / 2,
      cz = (az + bz) / 2;
    const w = alongX ? len : 0.05,
      d = alongX ? 0.05 : len;
    st.add("#e0a820", w, 0.06, d, cx, y + 1.05, cz);
    st.add("#e0a820", w, 0.04, d, cx, y + 0.55, cz);
    st.add("#26252d", alongX ? len : 0.03, 0.12, alongX ? 0.03 : len, cx, y, cz);
    for (let k = 0; k <= Math.floor(len / 1.5); k++) {
      const f = Math.floor(len / 1.5) ? k / Math.floor(len / 1.5) : 0.5;
      st.add("#e0a820", 0.05, 1.1, 0.05, alongX ? ax + f * len : ax, y, alongX ? az : az + f * len);
    }
    glow.add(new THREE.Color(GOLD).multiplyScalar(1.2), w, 0.015, d, cx, y + 1.09, cz);
    rects.push(alongX ? [ax, az - 0.08, bx, az + 0.08] : [ax - 0.08, az, ax + 0.08, bz]);
  };
  // horizontal edges (between rows j-1 and j), merged into runs
  for (let j = 0; j <= H; j++) {
    let run = -1;
    for (let i = 0; i <= W; i++) {
      const edge = i < W && free(i, j) !== free(i, j - 1);
      if (edge && run < 0) run = i;
      if (!edge && run >= 0) {
        rail(gx0 + run * S, gz0 + j * S, gx0 + i * S, gz0 + j * S);
        run = -1;
      }
    }
  }
  for (let i = 0; i <= W; i++) {
    let run = -1;
    for (let j = 0; j <= H; j++) {
      const edge = j < H && free(i, j) !== free(i - 1, j);
      if (edge && run < 0) run = j;
      if (!edge && run >= 0) {
        rail(gx0 + i * S, gz0 + run * S, gx0 + i * S, gz0 + j * S);
        run = -1;
      }
    }
  }
  // signs at the junctions
  const signs: [string, number, number, number][] = [
    ["CATWALK C1 · 通路", 0, -14.5, 0],
    ["CATWALK C2", -33.6, -41, 0],
  ];
  for (const [text, x, z, ry] of signs) {
    const s = neonSign([{ text, font: JP(64, 900) }], { color: "#3ddc97", w: 3, h: 0.5 });
    s.position.set(x, y + 2.6, z);
    s.rotation.y = ry;
    root.add(s);
  }
  root.add(st.mesh(SOLID), glow.mesh(GLOW));
  return {};
}
