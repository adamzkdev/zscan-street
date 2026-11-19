/**
 * ⓩ PLAZA: noon on a ZStreet rooftop. Warm stone pavers with a mosaic star round a fountain (its
 * golden Z-Block spinning on top), two planters, two benches, a row of pastel shops at the back.
 * The classic: no twist, just the rain of coins and the rug bombs.
 */
import * as THREE from "three";
import { rng, rr } from "../../kit";
import { GEO, canvasTex, glow, label, qBlock, skyDome, skyline, toonSteps } from "../../k3";
import { Batch, type Level, type SetCtx, type Weather } from "./set";
import { Flock } from "./life";
import { town } from "./town";

const XW = 10;
const ZD = 6.5;

export const PLAZA: Level = {
  key: "plaza",
  title: "ⓩ PLAZA",
  titleZh: "ⓩ 广场",
  tag: "Noon on the city's rooftop plaza: a fountain, planters, benches. The classic.",
  tagZh: "城市屋顶广场的正午：喷泉、花坛、长椅。经典场地。",
  ambience: "city-day",
  sky: ["#3fa9ff", "#e6f6ff"],
  fog: [70, 300],
  hemi: 1.85,
  sun: [-20, 34, 24],
  xw: XW,
  zd: ZD,
  circles: [
    { x: 0, z: 0, r: 1.95 },
    { x: -6, z: -3.2, r: 0.95 },
    { x: 6, z: 3.2, r: 0.95 },
  ],
  boxes: [
    { x: -6, z: 3.2, hx: 1.15, hz: 0.4 },
    { x: 6, z: -3.2, hx: 1.15, hz: 0.4 },
  ],
  starts: [
    [-3.4, 3.6],
    [3.4, 3.6],
    [-3.4, -3.6],
    [3.4, -3.6],
  ],
  ring: { x: 0, z: 0, r: 3.05 },
  cam: { h: 15.2, d: 14.4 },
  dust: ["#ffffff", "#f2ddb6", "#e8d5b0", "#c9b089"],
  build: buildPlaza,
};

function buildPlaza({ scene: s, B, rnd, fx, ink, level }: SetCtx) {
  // the floor: sandstone pavers (calmer than the coins: gold is theirs alone), a mosaic round the fountain
  const PX = 64;
  // (the sheet's strokes were drawn for 48 px a metre)
  const K = PX / 48;
  const FW = XW * 2 + 1,
    FD = ZD * 2 + 1;
  const FR = rng(0x91a2a);
  const tex = canvasTex(FW * PX, FD * PX, (g) => {
    g.fillStyle = "#b7a68c";
    g.fillRect(0, 0, FW * PX, FD * PX);
    const tints = ["#dfd2bb", "#d9cbb3", "#e2d6c0", "#d4c6ad", "#dccfb8"];
    for (let j = 0; j < FD * 2; j++)
      for (let i = -1; i < FW; i++) {
        // (a running bond: every other row shifted half a stone)
        const x = (i + (j % 2) * 0.5) * PX;
        g.fillStyle = tints[Math.floor(FR() * tints.length)];
        rr(g, x + 2 * K, j * (PX / 2) + 2 * K, PX - 4 * K, PX / 2 - 4 * K, 4 * K);
        g.fill();
      }
    const cx = (FW * PX) / 2,
      cy = (FD * PX) / 2;
    const ring = (r0: number, r1: number, c: string) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(cx, cy, r1 * PX, 0, Math.PI * 2);
      g.arc(cx, cy, r0 * PX, 0, Math.PI * 2, true);
      g.fill();
    };
    ring(3.75, 4.15, "#d9805c");
    ring(4.15, 4.3, "#f6eedc");
    // a star of teal and terracotta petals
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const r0 = 2.0 * PX,
        r1 = (k % 2 ? 3.2 : 3.7) * PX;
      g.fillStyle = k % 2 ? "#e39a78" : "#4fb8b0";
      g.beginPath();
      g.moveTo(cx + Math.cos(a - 0.17) * r0, cy + Math.sin(a - 0.17) * r0);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.lineTo(cx + Math.cos(a + 0.17) * r0, cy + Math.sin(a + 0.17) * r0);
      g.fill();
    }
    // the plaza's little stories in chalk and stone: a hopscotch, a manhole, petals, doodles
    const at = (x: number, z: number) => [(x + FW / 2) * PX, (z + FD / 2) * PX] as const;
    {
      const [hx, hz] = at(8.5, 3.6);
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = 3 * K;
      const cell = PX * 0.62;
      for (let k = 0; k < 6; k++) {
        const wide = k === 2 || k === 4;
        if (wide) {
          g.strokeRect(hx - cell, hz - (k + 1) * cell, cell, cell);
          g.strokeRect(hx, hz - (k + 1) * cell, cell, cell);
        } else g.strokeRect(hx - cell / 2, hz - (k + 1) * cell, cell, cell);
      }
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.font = `900 ${PX * 0.4}px Geist, Roboto, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      for (let k = 0; k < 6; k++) g.fillText(String(k + 1), hx + (k === 2 || k === 4 ? -cell / 2 : 0), hz - (k + 0.5) * cell);
    }
    {
      // (plain iron: a gold ⓩ on the stones would read as a coin lying there)
      const [mx, mz] = at(-8.2, 5.2);
      g.fillStyle = "#8a8fa2";
      g.beginPath();
      g.arc(mx, mz, PX * 0.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#6a6f84";
      g.lineWidth = 3 * K;
      g.beginPath();
      g.arc(mx, mz, PX * 0.4, 0, Math.PI * 2);
      g.stroke();
      for (let k = -2; k <= 2; k++) {
        const w = Math.sqrt(1 - (k * 0.3) * (k * 0.3)) * PX * 0.32;
        g.beginPath();
        g.moveTo(mx - w, mz + k * PX * 0.12);
        g.lineTo(mx + w, mz + k * PX * 0.12);
        g.stroke();
      }
    }
    // chalk doodles: a star, a sun
    g.strokeStyle = "rgba(255,120,170,0.8)";
    g.lineWidth = 3 * K;
    {
      const [sx, sz] = at(-7.8, -5.3);
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2,
          r = (k % 2 ? 0.16 : 0.38) * PX;
        g.lineTo(sx + Math.cos(a) * r, sz + Math.sin(a) * r);
      }
      g.closePath();
      g.stroke();
    }
    {
      const [sx, sz] = at(8.5, -5.4);
      g.strokeStyle = "rgba(90,200,255,0.85)";
      g.beginPath();
      g.arc(sx, sz, PX * 0.22, 0, Math.PI * 2);
      g.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(sx + Math.cos(a) * PX * 0.3, sz + Math.sin(a) * PX * 0.3);
        g.lineTo(sx + Math.cos(a) * PX * 0.45, sz + Math.sin(a) * PX * 0.45);
        g.stroke();
      }
    }
    // a few petals blown along the walls (pink and white: never gold)
    for (let k = 0; k < 26; k++) {
      g.fillStyle = k % 2 ? "#ff9fc0" : "#ffffff";
      const side = k % 4;
      const u = FR(),
        d = 0.9 + FR() * 0.9;
      const x = side < 2 ? u * FW * PX : (side === 2 ? d : FW - d) * PX,
        y = side < 2 ? (side === 0 ? d : FD - d) * PX : u * FD * PX;
      g.save();
      g.translate(x, y);
      g.rotate(FR() * 3);
      g.fillRect(-3 * K, -1.5 * K, 6 * K, 3 * K);
      g.restore();
    }
    // a border of terracotta along the walls
    g.strokeStyle = "#dc9670";
    g.lineWidth = PX * 0.45;
    g.strokeRect(PX * 0.72, PX * 0.72, FW * PX - PX * 1.44, FD * PX - PX * 1.44);
    g.strokeStyle = "#f6eedc";
    g.lineWidth = 4 * K;
    g.strokeRect(PX * 1.0, PX * 1.0, FW * PX - PX * 2, FD * PX - PX * 2);
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, FD).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps() }));
  s.add(floor);
  // the rooftop it all stands on, the tower under it
  const back = -ZD - 6.5;
  B.box("#e7cfa4", FW + 3, 0.6, ZD - back + 2, 0, -0.62, (ZD + 1.5 + back) / 2, 0.05);
  B.box("#c96f4a", FW + 3.4, 0.35, ZD - back + 2.4, 0, -0.95, (ZD + 1.5 + back) / 2, 0.05);
  B.box("#efe1c8", FW + 1.6, 46, ZD - back + 1, 0, -47, (ZD + 1.5 + back) / 2, 0);
  for (let row = 0; row < 9; row++)
    for (let col = 0; col < 9; col++) {
      B.box("#7fc4f0", 1.3, 1.8, 0.1, -9.6 + col * 2.4, -4 - row * 4.6, ZD + 2.05, 0);
      if (col < 7) B.box("#7fc4f0", 0.1, 1.8, 1.3, XW + 2.35, -4 - row * 4.6, ZD - 0.6 - col * 2.8, 0);
      if (col < 7) B.box("#7fc4f0", 0.1, 1.8, 1.3, -XW - 2.35, -4 - row * 4.6, ZD - 0.6 - col * 2.8, 0);
    }
  // the low walls, cream with a terracotta cap
  const wall = (w: number, d: number, x: number, z: number) => {
    B.box("#fff3da", w, 0.5, d, x, 0, z, 0.04);
    B.box("#ec8a5e", w + 0.12, 0.14, d + 0.12, x, 0.5, z, 0.035);
  };
  wall(FW + 0.5, 0.5, 0, ZD + 0.25);
  wall(FW + 0.5, 0.5, 0, -ZD - 0.25);
  wall(0.5, FD - 0.5, XW + 0.25, 0);
  wall(0.5, FD - 0.5, -XW - 0.25, 0);
  // hedges with flowers along the front and the sides, outside the walls
  for (let x = -XW; x <= XW; x += 2.5) {
    B.box("#4cb944", 2.1, 0.55, 0.7, x, 0, ZD + 1.0, 0.035);
    for (let k = 0; k < 3; k++) B.box(["#ff5fa2", "#ffd23f", "#ffffff"][(k + Math.round(x)) % 3], 0.16, 0.16, 0.16, x - 0.6 + k * 0.6, 0.55, ZD + 0.9 + (k % 2) * 0.2);
  }
  // the fountain: a round basin, a pillar, a bowl, a golden Z-Block on top
  B.cyl("#f6ecdc", 1.92, 0.55, 0, 0, 0, 0.04);
  B.cyl("#ec8a5e", 2.0, 0.12, 0, 0.55, 0, 0.035);
  B.add("cyl", "#4cc8ff", 3.44, 0.03, 3.44, 0, 0.68, 0, { lit: true });
  B.add("cyl", "#8fe6ff", 2.2, 0.03, 2.2, 0, 0.685, 0, { lit: true });
  B.cyl("#f6ecdc", 0.3, 1.0, 0, 0.67, 0, 0.035);
  B.cyl("#f6ecdc", 0.78, 0.22, 0, 1.6, 0, 0.035);
  B.cyl("#ec8a5e", 0.84, 0.08, 0, 1.8, 0, 0.03);
  B.add("cyl", "#6fd8ff", 1.36, 0.03, 1.36, 0, 1.89, 0, { lit: true });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    B.box("#4fc4bd", 0.3, 0.3, 0.06, Math.sin(a) * 1.93, 0.16, Math.cos(a) * 1.93, 0, a);
  }
  const fountainQ = qBlock(0.56);
  fountainQ.position.set(0, 2.6, 0);
  s.add(fountainQ);
  const jets: THREE.Mesh[] = [];
  for (let k = 0; k < 3; k++) {
    const j = new THREE.Mesh(GEO.cyl, glow("#c9f3ff", 0.7));
    const a = (k / 3) * Math.PI * 2;
    j.position.set(Math.sin(a) * 0.42, 2.05, Math.cos(a) * 0.42);
    j.scale.set(0.09, 0.6, 0.09);
    j.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
    s.add(j);
    jets.push(j);
  }
  const ripples: THREE.Mesh[] = [];
  for (let k = 0; k < 2; k++) {
    const r = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.5, depthWrite: false }));
    r.rotation.x = -Math.PI / 2;
    r.position.y = 0.7;
    s.add(r);
    ripples.push(r);
  }
  // two planters with a round topiary, two benches
  for (const c of level.circles.slice(1)) {
    B.cyl("#ec8a5e", 0.9, 0.5, c.x, 0, c.z, 0.04);
    B.cyl("#fff3da", 0.95, 0.1, c.x, 0.5, c.z, 0.03);
    B.cyl("#7a4a2e", 0.8, 0.04, c.x, 0.58, c.z, 0);
    B.add("ball", "#55c84a", 1.3, 1.2, 1.3, c.x, 1.15, c.z, { ink: 0.04 });
    B.add("ball", "#7be06a", 0.7, 0.6, 0.7, c.x - 0.2, 1.45, c.z + 0.25, {});
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      B.box(["#ff5fa2", "#ffd23f", "#ffffff", "#ff7a3c"][k % 4], 0.18, 0.18, 0.18, c.x + Math.sin(a) * 0.68, 0.58, c.z + Math.cos(a) * 0.68, 0.02);
    }
  }
  for (const b of level.boxes) {
    B.box("#d9833f", 2.2, 0.14, 0.62, b.x, 0.42, b.z + 0.04, 0.035);
    B.box("#d9833f", 2.2, 0.36, 0.12, b.x, 0.62, b.z - 0.3, 0.035);
    for (const sx of [-0.85, 0.85]) {
      B.box("#3c3f58", 0.14, 0.42, 0.56, b.x + sx, 0, b.z + 0.02, 0.025);
      B.box("#3c3f58", 0.14, 0.5, 0.12, b.x + sx, 0.42, b.z - 0.3, 0.02);
    }
  }
  // lamp posts on the walls
  const lamp = (x: number, z: number) => {
    B.box("#2f4860", 0.34, 0.4, 0.34, x, 0.64, z, 0.03);
    B.cyl("#2f4860", 0.08, 2.6, x, 1.0, z, 0.025);
    B.box("#2f4860", 0.5, 0.08, 0.5, x, 3.6, z, 0.025);
    B.add("box", "#fff1a6", 0.36, 0.42, 0.36, x, 3.89, z, { lit: true });
    B.add("cone", "#2f4860", 0.62, 0.3, 0.62, x, 4.25, z, { ry: Math.PI / 4, ink: 0.025 });
  };
  for (const [x, z] of [
    [-XW - 0.25, -ZD - 0.25],
    [XW + 0.25, -ZD - 0.25],
    [-XW - 0.25, ZD + 0.25],
    [XW + 0.25, ZD + 0.25],
    [-XW - 0.25, 0],
    [XW + 0.25, 0],
  ])
    lamp(x, z);
  // voxel trees on the sides, outside the walls
  const tree = (x: number, z: number, h: number) => {
    B.box("#8a5a3c", 0.36, h, 0.36, x, 0, z, 0.03);
    B.box("#4db544", 1.9, 1.1, 1.9, x, h - 0.2, z, 0.045);
    B.box("#62cc54", 1.4, 0.9, 1.4, x + 0.1, h + 0.85, z - 0.05, 0.04);
    B.box("#86e06a", 0.8, 0.6, 0.8, x - 0.1, h + 1.7, z + 0.1, 0.035);
  };
  for (const z of [-4.6, 1.4, 5.6]) {
    tree(-XW - 1.7, z, 2.0 + rnd() * 0.8);
    tree(XW + 1.7, z - 0.6, 2.0 + rnd() * 0.8);
  }
  // the back: a row of shops, pastel, with striped awnings
  const fronts = [
    { w: 4.6, h: 5.6, c: "#ff9fb2", aw: "#e8304a" },
    { w: 5.0, h: 7.4, c: "#8fe0c4", aw: "#2f9e8a" },
    { w: 5.4, h: 6.4, c: "#ffd56b", aw: "#ff7a3c" },
    { w: 5.0, h: 8.0, c: "#8fc8ff", aw: "#2f6fe0" },
    { w: 4.6, h: 5.9, c: "#c9a8ff", aw: "#7a4ad8" },
  ];
  let fx0 = -12.3;
  const fz = -ZD - 1.7;
  fronts.forEach((f, i) => {
    const x = fx0 + f.w / 2;
    fx0 += f.w;
    const d = 4.2;
    B.box(f.c, f.w - 0.06, f.h, d, x, 0, fz - d / 2, 0.05);
    B.box("#fff6e4", f.w + 0.1, 0.32, d + 0.3, x, f.h, fz - d / 2 + 0.1, 0.04);
    // the windows upstairs
    const cols = f.w > 5 ? 3 : 2;
    for (let row = i === 1 ? 1 : 0; row < Math.floor((f.h - 2.6) / 1.7); row++)
      for (let c = 0; c < cols; c++) {
        const wx = x + (c - (cols - 1) / 2) * 1.45;
        const wy = 2.7 + row * 1.7;
        B.box("#ffffff", 0.95, 1.1, 0.1, wx, wy - 0.05, fz + 0.02, 0.02);
        B.box("#86d4ff", 0.75, 0.9, 0.12, wx, wy + 0.05, fz + 0.03, 0);
        B.box("#ffffff", 1.05, 0.1, 0.25, wx, wy - 0.12, fz + 0.1, 0.02);
      }
    // the shop: a door, a window, a striped awning
    B.box("#5a3a2e", 0.9, 1.7, 0.1, x - f.w * 0.22, 0, fz + 0.02, 0.02);
    B.box("#ffffff", 1.8, 1.3, 0.1, x + f.w * 0.15, 0.35, fz + 0.02, 0.02);
    B.box("#bfeaff", 1.6, 1.1, 0.12, x + f.w * 0.15, 0.45, fz + 0.03, 0);
    const stripes = 7;
    for (let k = 0; k < stripes; k++) {
      const sw = (f.w - 0.4) / stripes;
      B.add("box", k % 2 ? "#ffffff" : f.aw, sw, 0.08, 1.1, x - (f.w - 0.4) / 2 + sw * (k + 0.5), 2.05, fz + 0.5, { rx: 0.42, ink: 0.02 });
    }
    // on the roofs: a tank, an antenna
    if (i % 2 === 0) {
      B.cyl("#b9c7d8", 0.6, 1.0, x + 0.6, f.h + 0.32, fz - 2.4, 0.03);
      B.add("cone", "#8fa6c0", 1.3, 0.5, 1.3, x + 0.6, f.h + 1.57, fz - 2.4, { ink: 0.025 });
    } else B.box("#5d6b82", 0.08, 1.6, 0.08, x - 1.2, f.h + 0.32, fz - 1.5, 0);
  });
  const sign = label("ⓩ PLAZA", 0.95, "#ffffff", "#e8304a");
  sign.position.set(fronts[0].w + fronts[1].w / 2 - 12.3, 3.05, fz + 0.12);
  s.add(sign);
  // bunting along the shops, the four seats' colours and gold
  const flags = ["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#ffd23f"];
  for (let span = 0; span < 4; span++) {
    const x0 = -12 + span * 6;
    for (let k = 0; k < 9; k++) {
      const u = (k + 0.5) / 9;
      const x = x0 + u * 6;
      const y = 4.45 - Math.sin(u * Math.PI) * 0.6;
      B.add("box", flags[(k + span) % flags.length], 0.36, 0.36, 0.03, x, y - 0.18, fz + 0.6, { rz: Math.PI / 4, ink: 0.015 });
    }
  }
  // Z-Blocks hovering at the back corners
  const floaters: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const q = qBlock(0.9);
    q.position.set(sx * (XW + 1.6), 3.6, -ZD - 0.4);
    s.add(q);
    floaters.push(q);
  }
  // a café terrace between the back wall and the shops: little tables, stools, striped parasols
  const para = ["#ff5fa2", "#3ec6ff", "#ffd23f", "#8ee35b"];
  for (let k = 0; k < 4; k++) {
    const x = -7.2 + k * 4.8,
      z = -ZD - 1.05;
    B.cyl("#ffffff", 0.36, 0.06, x, 0.72, z, 0.02);
    B.cyl("#3c3f58", 0.05, 0.72, x, 0, z, 0);
    for (const sx of [-0.62, 0.62]) {
      B.cyl("#ec8a5e", 0.18, 0.06, x + sx, 0.44, z, 0.015);
      B.cyl("#3c3f58", 0.04, 0.44, x + sx, 0, z, 0);
    }
    B.add("box", "#ffffff", 0.12, 0.12, 0.12, x + 0.12, 0.84, z, { ink: 0.01 });
    B.cyl("#e7e2d6", 0.035, 2.1, x, 0.78, z, 0);
    B.add("cone", para[k], 1.9, 0.55, 1.9, x, 2.95, z, { ry: Math.PI / 4, ink: 0.02 });
    B.add("cone", "#ffffff", 1.0, 0.3, 1.0, x, 3.12, z, { ry: Math.PI / 4 });
  }
  // potted flowers along the tops of the side walls
  for (const sx of [-1, 1])
    for (let z = -4.5; z <= 4.6; z += 3) {
      const x = sx * (XW + 0.25);
      B.cyl("#d9733f", 0.2, 0.28, x, 0.64, z, 0.02);
      B.add("ball", "#55c84a", 0.42, 0.3, 0.42, x, 1.02, z, { ink: 0.015 });
      for (let k = 0; k < 4; k++) B.add("ball", ["#ff5fa2", "#ffd23f", "#ffffff", "#ff7a3c"][(k + Math.round(z)) % 4], 0.13, 0.13, 0.13, x + Math.cos(k * 1.6) * 0.13, 1.14, z + Math.sin(k * 1.6) * 0.13, { lit: true });
    }
  // clouds (their own set, drifting)
  const CB = new Batch();
  const cloudGroup = new THREE.Group();
  s.add(cloudGroup);
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + (i / 6) * 2.4 + rnd() * 0.2;
    const d = 70 + rnd() * 40;
    const cx = Math.sin(a) * d,
      cz = -Math.cos(a) * d * 0.9,
      cy = 22 + rnd() * 16;
    const parts = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < parts; k++) CB.add("box", "#ffffff", 6 + rnd() * 6, 2.5 + rnd() * 2, 5 + rnd() * 4, cx + k * 4 - parts * 2, cy + rnd() * 1.5, cz + rnd() * 3, { lit: true });
  }
  B.build(s, ink);
  CB.build(cloudGroup, ink);
  // balloons tied to the four corner lamps, bobbing on their strings
  const bal = new THREE.InstancedMesh(GEO.ball, new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonSteps(), emissive: "#221a10" }), 12);
  const str = new THREE.InstancedMesh(GEO.box, glow("#fff6e0"), 12);
  bal.frustumCulled = str.frustumCulled = false;
  bal.raycast = str.raycast = () => {};
  const balCol = new THREE.Color();
  const balloons: { x: number; z: number; ph: number; h: number }[] = [];
  const corners: [number, number][] = [
    [-XW - 0.25, -ZD - 0.25],
    [XW + 0.25, -ZD - 0.25],
    [-XW - 0.25, ZD + 0.25],
    [XW + 0.25, ZD + 0.25],
  ];
  corners.forEach(([x, z], c) => {
    for (let k = 0; k < 3; k++) {
      balloons.push({ x, z, ph: c * 1.7 + k * 2.1, h: 1.5 + k * 0.35 });
      bal.setColorAt(c * 3 + k, balCol.set(["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#ffd23f"][(c + k) % 5]));
    }
  });
  s.add(bal, str);
  // pigeons pecking round the plaza (they take off when a snark runs at them, or a bomb goes)
  const flock = new Flock(s, level, 9, ["#d9deea", "#c7cfe2", "#e6e9f2"], "#5a6a9a");
  // the far towers, pushed out past the town's blocks and down to its streets
  const far = skyline(s, { r: 120, n: 64, y: -34, tall: 1.25, rnd });
  far.scale.set(1.62, 1, 1.62);
  far.position.y = -13;
  far.userData.noShadow = true;
  // the city round and below the roof: the neighbours' roofs, the streets and their traffic, the far blocks in the haze
  const tw = town(s, {
    seed: 0x71a2a,
    y: -47,
    top: -8,
    cz: -2.5,
    mode: "day",
    // (a cooler, deeper air than the horizon's: the town sits back behind the warm stones)
    fog: "#a9c9ea",
    haze: 0.36,
    ground: { road: "#7f8a9f", paint: "#f1f4fa", kerb: "#e6eaf1", lot: "#c3cad6" },
    walls: ["#ecd9c2", "#cdd8e8", "#efc6a4", "#bfcde2", "#dccfee", "#f1dba8", "#eeb09c", "#b4dccb"],
    roofs: ["#f4f1ea", "#e9e3d8", "#e3e9f0"],
    win: { lit: "#d6eeff", dark: "#7890b0", k: 0.3 },
    green: ["#4aae42", "#5ec550"],
    trunk: "#8a5a3c",
    lawn: "#79c765",
    cars: 40,
    paint: ["#ff6b5a", "#3ea8ff", "#ffffff", "#ff9a3c", "#8ee35b", "#2f3a5a"],
  });
  // the sky all round (the fly-over sees the horizon): the noon sun where the light comes from, clouds drifting
  const dome = skyDome(s, { sky: level.sky, clouds: 12, disc: { az: 50, el: 47, size: 8 }, rnd: rng(0x5c1a2) });
  // (its own random: the glints and the drops are this screen's, never the game's)
  const AR = rng(0xa21a);
  // what moves: the fountain's block and jets, its ripples, the drops, the floating blocks
  const v = new THREE.Vector3(),
    dir = new THREE.Vector3();
  let dropAt = 0;
  let glintAt = 0;
  const M = new THREE.Matrix4(),
    Q = new THREE.Quaternion(),
    P = new THREE.Vector3(),
    S = new THREE.Vector3(),
    D = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  return (dt: number, clk: number, w: Weather) => {
    cloudGroup.position.x = ((clk * 0.8 + 40) % 80) - 40;
    dome.rotation.y = clk * 0.0015;
    tw.tick(dt);
    for (let i = 0; i < balloons.length; i++) {
      const b = balloons[i];
      const sx = Math.sin(clk * 1.3 + b.ph) * 0.22,
        sz = Math.cos(clk * 1.1 + b.ph * 1.3) * 0.18;
      const top = 4.45 + b.h;
      P.set(b.x + sx + (i % 3) * 0.28 - 0.28, top + Math.sin(clk * 2 + b.ph) * 0.06, b.z + sz);
      M.compose(P, Q.identity(), S.set(0.52, 0.62, 0.52));
      bal.setMatrixAt(i, M);
      // the string from the lamp's cap to the balloon
      const dx = P.x - b.x,
        dy = P.y - 0.3 - 4.45,
        dz = P.z - b.z;
      const L = Math.hypot(dx, dy, dz);
      Q.setFromUnitVectors(UP, D.set(dx / L, dy / L, dz / L));
      M.compose(P.set(b.x + dx / 2, 4.45 + dy / 2, b.z + dz / 2), Q, S.set(0.015, L, 0.015));
      str.setMatrixAt(i, M);
    }
    bal.instanceMatrix.needsUpdate = str.instanceMatrix.needsUpdate = true;
    flock.update(dt, clk, w);
    // glints on the fountain's water
    glintAt -= dt;
    if (glintAt <= 0) {
      glintAt = 0.12;
      const a = AR() * Math.PI * 2,
        r = 0.9 + AR() * 0.8;
      fx.burst(v.set(Math.sin(a) * r, 0.72, Math.cos(a) * r), 1, ["#ffffff", "#e6fbff"], { speed: 0.05, up: 0.2, size: 0.1, gravity: 0, life: 0.35 });
    }
    fountainQ.rotation.y += dt * 1.4;
    fountainQ.position.y = 2.6 + Math.sin(clk * 2.2) * 0.08;
    for (let k = 0; k < jets.length; k++) jets[k].scale.y = 0.55 + Math.sin(clk * 9 + k * 2) * 0.12;
    for (let k = 0; k < ripples.length; k++) {
      const r = ripples[k];
      const u = (clk * 0.45 + k * 0.5) % 1;
      r.scale.setScalar(1.0 + u * 2.3);
      (r.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - u);
    }
    dropAt -= dt;
    if (dropAt <= 0) {
      dropAt = 0.07;
      const a = AR() * Math.PI * 2;
      fx.burst(v.set(Math.sin(a) * 0.6, 2.2, Math.cos(a) * 0.6), 1, ["#c9f3ff", "#ffffff", "#7fe0ff"], { speed: 1.2, up: 1.6, size: 0.1, gravity: 9, life: 0.45, dir: dir.set(Math.sin(a) * 1.4, 0, Math.cos(a) * 1.4) });
    }
    for (let k = 0; k < floaters.length; k++) {
      const q = floaters[k];
      q.rotation.y = clk * 0.9 + k;
      q.position.y = 3.6 + Math.sin(clk * 1.6 + k * 2) * 0.22;
    }
  };
}

