/**
 * MARINA RAIN: a rainy night on a Marina Bay sky-deck, the bay's towers lit up all round. A long
 * sky-pool runs across the middle (wading through it is slow, the coins float on it), puddles shine
 * on the teak, palms stand at the pool's ends, two loungers at the corners. The twist: GUSTS. A
 * warning first (a banner, a rising howl, chevrons racing over the deck, the palms bending), then
 * the wind blows for a few seconds: falling coins drift sideways (their shadows slide with them),
 * the coins on the deck skate downwind, every snark is pushed.
 */
import * as THREE from "three";
import { rng, sfx } from "../../kit";
import { GEO, canvasTex, glow, label, mixHex, qBlock, skyDome, skyline, toon, toonSteps, zGlyph } from "../../k3";
import { drawMark } from "../../theme";
import { Batch, Precip, Stars, type Circle, type Level, type SetCtx, type Weather } from "./set";
import { town } from "./town";

const XW = 10.5;
const ZD = 6.4;
/** The sky-pool: its middle, its half sizes, how deep. */
const POOL = { x: 0, z: -0.2, hx: 6.0, hz: 1.25 };
const DEEP = -0.3;
const PUDDLES: Circle[] = [
  { x: -6.9, z: 3.9, r: 1.1 },
  { x: 6.7, z: -4.2, r: 1.15 },
  { x: 0.9, z: 4.85, r: 0.95 },
];

export const MARINA: Level = {
  key: "marina",
  title: "MARINA RAIN",
  titleZh: "滨海雨夜",
  tag: "A rainy night on Marina Bay: gusts blow the coins sideways, the pool and the puddles slow you.",
  tagZh: "滨海湾雨夜：阵风把金币吹偏，泳池和水洼让你变慢。",
  song: "marina",
  ambience: "rain",
  sky: ["#0a0f36", "#7a3f8f"],
  fog: [70, 300],
  night: true,
  hemi: 2.45,
  sun: [12, 40, 30],
  sunI: 1.5,
  sunC: "#ffe0cc",
  xw: XW,
  zd: ZD,
  circles: [
    { x: -7.9, z: POOL.z, r: 0.9 },
    { x: 7.9, z: POOL.z, r: 0.9 },
  ],
  boxes: [
    { x: -5.5, z: -4.75, hx: 1.05, hz: 0.42 },
    { x: 5.4, z: 4.5, hx: 1.05, hz: 0.42 },
  ],
  starts: [
    [-3.4, 3.6],
    [3.4, 3.6],
    [-3.4, -3.6],
    [3.4, -3.6],
  ],
  ring: { x: 0, z: POOL.z, r: 3.05 },
  cam: { h: 15.2, d: 14.4 },
  dust: ["#ffffff", "#bfe9ff", "#d9c2a0"],
  floorAt: (x, z) => (Math.abs(x - POOL.x) < POOL.hx && Math.abs(z - POOL.z) < POOL.hz ? DEEP : 0),
  wet: { circles: PUDDLES, boxes: [POOL], k: 0.55 },
  gust: { first: 4.5, every: [6.0, 8.0], warn: 1.4, len: 2.6, drift: 2.8, push: 1.9 },
  build: buildMarina,
};

function buildMarina({ scene: s, B, rnd, fx, ink, hemi, level }: SetCtx) {
  // ---- the deck: teak boards, wet, with the neon's reflections; the puddles; the pool's edge
  const PX = 64;
  // (the sheet's strokes were drawn for 40 px a metre)
  const K = PX / 40;
  const TR = rng(0x3a21a);
  const FW = XW * 2 + 1,
    FD = ZD * 2 + 1;
  const ux = (x: number) => (x + FW / 2) * PX,
    uz = (z: number) => (z + FD / 2) * PX;
  const tex = canvasTex(FW * PX, FD * PX, (g) => {
    g.fillStyle = "#8a6a4e";
    g.fillRect(0, 0, FW * PX, FD * PX);
    const tints = ["#c79a6e", "#bb8f64", "#cfa478", "#c29468", "#d4aa7e"];
    // boards along x, staggered joints
    const bw = PX * 0.36;
    for (let j = 0; j * bw < FD * PX; j++) {
      let x = -((j * 37) % 5) * PX * 0.6;
      while (x < FW * PX) {
        const L = PX * (2.2 + ((j * 13 + Math.floor(x)) % 3) * 0.6);
        g.fillStyle = tints[Math.floor(TR() * tints.length)];
        g.fillRect(Math.round(x + 1.5 * K), Math.round(j * bw + 1.5 * K), Math.round(L - 3 * K), Math.round(bw - 3 * K));
        x += L;
      }
    }
    // the wet sheen: long soft streaks of the neon, pink and cyan
    for (let k = 0; k < 9; k++) {
      const x = TR() * FW * PX,
        y = TR() * FD * PX;
      const gr = g.createLinearGradient(x, y - PX * 2, x, y + PX * 2);
      const c = k % 2 ? "255,120,200" : "120,230,255";
      gr.addColorStop(0, `rgba(${c},0)`);
      gr.addColorStop(0.5, `rgba(${c},0.22)`);
      gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr;
      g.fillRect(x - PX * 0.25, y - PX * 2, PX * 0.5, PX * 4);
    }
    // the puddles: dark glossy water mirroring the lights
    for (const p of PUDDLES) {
      g.save();
      g.translate(ux(p.x), uz(p.z));
      g.scale(1, 0.82);
      g.fillStyle = "#2a3a66";
      g.beginPath();
      g.arc(0, 0, p.r * PX * 1.04, 0, Math.PI * 2);
      g.fill();
      const gr = g.createRadialGradient(-p.r * PX * 0.3, -p.r * PX * 0.3, 2, 0, 0, p.r * PX);
      gr.addColorStop(0, "rgba(140,230,255,0.85)");
      gr.addColorStop(0.45, "rgba(90,120,220,0.55)");
      gr.addColorStop(1, "rgba(255,110,190,0.35)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, p.r * PX, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.6)";
      g.lineWidth = 3 * K;
      g.beginPath();
      g.arc(0, 0, p.r * PX * 0.98, Math.PI * 1.1, Math.PI * 1.6);
      g.stroke();
      g.restore();
    }
    // an inlaid medallion in pale wood: a compass rose round a Z
    {
      const mx = ux(3.0),
        mz = uz(-4.4),
        r = PX * 0.95;
      g.fillStyle = "#6a4a32";
      g.beginPath();
      g.arc(mx, mz, r + 4 * K, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ecd2a4";
      g.beginPath();
      g.arc(mx, mz, r, 0, Math.PI * 2);
      g.fill();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const rr = k % 2 ? r * 0.62 : r * 0.92;
        g.fillStyle = k % 2 ? "#c9955f" : "#a8703e";
        g.beginPath();
        g.moveTo(mx + Math.cos(a - 0.3) * r * 0.25, mz + Math.sin(a - 0.3) * r * 0.25);
        g.lineTo(mx + Math.cos(a) * rr, mz + Math.sin(a) * rr);
        g.lineTo(mx + Math.cos(a + 0.3) * r * 0.25, mz + Math.sin(a + 0.3) * r * 0.25);
        g.fill();
      }
      // (its heart in dark wood: a gold disc on the boards would read as a coin)
      g.fillStyle = "#6a4a32";
      g.beginPath();
      g.arc(mx, mz, r * 0.3, 0, Math.PI * 2);
      g.fill();
      zGlyph(g, mx, mz, r * 0.46, "#ecd2a4");
    }
    // the pool's coping: white stone round it
    g.fillStyle = "#f2f4fa";
    g.fillRect(ux(POOL.x - POOL.hx) - PX * 0.4, uz(POOL.z - POOL.hz) - PX * 0.4, POOL.hx * 2 * PX + PX * 0.8, POOL.hz * 2 * PX + PX * 0.8);
    g.fillStyle = "#5fd0ff";
    g.fillRect(ux(POOL.x - POOL.hx), uz(POOL.z - POOL.hz), POOL.hx * 2 * PX, POOL.hz * 2 * PX);
    // a border of light round the deck
    g.strokeStyle = "#ffd98a";
    g.lineWidth = PX * 0.2;
    g.strokeRect(PX * 0.62, PX * 0.62, FW * PX - PX * 1.24, FD * PX - PX * 1.24);
  });
  // (the deck with the pool cut out of it: the pool's floor is lower)
  const shape = new THREE.Shape();
  shape.moveTo(-FW / 2, -FD / 2);
  shape.lineTo(FW / 2, -FD / 2);
  shape.lineTo(FW / 2, FD / 2);
  shape.lineTo(-FW / 2, FD / 2);
  shape.closePath();
  const hole = new THREE.Path();
  // (shape y is -z once laid down)
  hole.moveTo(POOL.x - POOL.hx, -(POOL.z - POOL.hz));
  hole.lineTo(POOL.x - POOL.hx, -(POOL.z + POOL.hz));
  hole.lineTo(POOL.x + POOL.hx, -(POOL.z + POOL.hz));
  hole.lineTo(POOL.x + POOL.hx, -(POOL.z - POOL.hz));
  hole.closePath();
  shape.holes.push(hole);
  const deckGeo = new THREE.ShapeGeometry(shape);
  const pos = deckGeo.attributes.position,
    uv = deckGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + FW / 2) / FW, (pos.getY(i) + FD / 2) / FD);
  deckGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(deckGeo, new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps() }));
  s.add(floor);
  // ---- the pool: tiles below, lit walls, the water over them
  const ptex = canvasTex(256, 64, (g) => {
    g.fillStyle = "#39b8f0";
    g.fillRect(0, 0, 256, 64);
    for (let y = 0; y < 64; y += 8)
      for (let x = 0; x < 256; x += 8) {
        g.fillStyle = (x + y) % 16 ? "#4fc6f7" : "#6bd4fa";
        g.fillRect(x + 0.5, y + 0.5, 7, 7);
      }
    // a lane line and a ⓩ at the bottom
    g.fillStyle = "#1f6fbf";
    g.fillRect(8, 29, 240, 6);
    drawMark(g, 128, 32, 46, "#d4f4ff", "#d4f4ff");
  });
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(POOL.hx * 2, POOL.hz * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ptex }));
  bottom.position.set(POOL.x, DEEP + 0.005, POOL.z);
  s.add(bottom);
  for (const sx of [-1, 1]) {
    B.add("box", "#2a9ad8", 0.1, -DEEP, POOL.hz * 2, POOL.x + sx * (POOL.hx - 0.05), DEEP / 2, POOL.z, { lit: true });
    B.add("box", "#2a9ad8", POOL.hx * 2, -DEEP, 0.1, POOL.x, DEEP / 2, POOL.z + sx * (POOL.hz - 0.05), { lit: true });
  }
  // underwater lights along the long walls
  for (let k = 0; k < 6; k++) B.lit("#d8fbff", 0.36, 0.14, 0.05, POOL.x - POOL.hx + 1 + k * ((POOL.hx * 2 - 2) / 5), DEEP + 0.08, POOL.z - POOL.hz + 0.12);
  // light dancing on the pool's floor
  const caus = canvasTex(
    128,
    128,
    (g) => {
      g.clearRect(0, 0, 128, 128);
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.lineWidth = 2.2;
      for (let k = 0; k < 16; k++) {
        g.beginPath();
        let x = TR() * 128,
          y = TR() * 128;
        g.moveTo(x, y);
        for (let j = 0; j < 4; j++) {
          x += (TR() - 0.5) * 40;
          y += (TR() - 0.5) * 40;
          g.quadraticCurveTo(x + 10, y - 10, x, y);
        }
        g.stroke();
      }
    },
    true,
  );
  caus.repeat.set(POOL.hx * 0.8, POOL.hz * 0.8);
  const causMat = new THREE.MeshBasicMaterial({ map: caus, color: "#c9fbff", transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const causM = new THREE.Mesh(new THREE.PlaneGeometry(POOL.hx * 2 - 0.1, POOL.hz * 2 - 0.1).rotateX(-Math.PI / 2), causMat);
  causM.position.set(POOL.x, DEEP + 0.02, POOL.z);
  causM.renderOrder = 1;
  s.add(causM);
  const waterMat = new THREE.MeshBasicMaterial({ color: "#7fe6ff", transparent: true, opacity: 0.42, depthWrite: false });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(POOL.hx * 2, POOL.hz * 2).rotateX(-Math.PI / 2), waterMat);
  water.position.set(POOL.x, -0.02, POOL.z);
  water.renderOrder = 1;
  s.add(water);
  // two pool floats (a striped ring, a duck): they bob, drift on the gust, shy away from waders
  const ring = new THREE.Group();
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.16, 8, 18).rotateX(Math.PI / 2), toon("#ff6fa8"));
  ring.add(torus);
  for (let k = 0; k < 4; k++) {
    const st = new THREE.Mesh(GEO.box, toon("#ffffff"));
    const a = (k / 4) * Math.PI * 2;
    st.position.set(Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42);
    st.rotation.y = a;
    st.scale.set(0.1, 0.33, 0.34);
    ring.add(st);
  }
  const duck = new THREE.Group();
  const dBody = new THREE.Mesh(GEO.box, toon("#ffd23f"));
  dBody.scale.set(0.55, 0.36, 0.7);
  dBody.position.y = 0.1;
  const dHead = new THREE.Mesh(GEO.box, toon("#ffd23f"));
  dHead.scale.set(0.32, 0.32, 0.32);
  dHead.position.set(0, 0.42, 0.22);
  const dBeak = new THREE.Mesh(GEO.box, toon("#ff8a3c"));
  dBeak.scale.set(0.2, 0.08, 0.16);
  dBeak.position.set(0, 0.4, 0.44);
  duck.add(dBody, dHead, dBeak);
  s.add(ring, duck);
  const floats = [
    { g: ring, x: -3.2, z: POOL.z + 0.3, vx: 0.25, vz: 0.05, r: 0.6, ph: 0 },
    { g: duck, x: 2.8, z: POOL.z - 0.3, vx: -0.2, vz: 0.04, r: 0.45, ph: 2 },
  ];
  // ---- the rooftop it stands on: a tower of lit windows
  // (the slab under the deck sits below the pool's floor; a fascia closes the deck's edges)
  const back = -ZD - 6;
  B.box("#3a3f5e", FW + 3, 0.6, ZD - back + 2, 0, -1.0, (ZD + 1.5 + back) / 2, 0.05);
  B.box("#2b2f4a", FW + 3.4, 0.35, ZD - back + 2.4, 0, -1.33, (ZD + 1.5 + back) / 2, 0.05);
  B.box("#3e4566", FW + 1.6, 46, ZD - back + 1, 0, -47.4, (ZD + 1.5 + back) / 2, 0);
  B.box("#e9edf6", FW + 0.1, 0.42, 0.2, 0, -0.43, FD / 2 - 0.05, 0.03);
  B.box("#e9edf6", 0.2, 0.42, FD, FW / 2 - 0.05, -0.43, 0, 0.03);
  B.box("#e9edf6", 0.2, 0.42, FD, -FW / 2 + 0.05, -0.43, 0, 0.03);
  for (let row = 0; row < 9; row++)
    for (let col = 0; col < 9; col++) {
      const lit = (row * 7 + col * 3) % 5 !== 0;
      B.add("box", lit ? "#ffe3a0" : "#4a5378", 1.3, 1.8, 0.1, -9.6 + col * 2.4, -4.9 - row * 4.6, ZD + 2.05, { lit });
      if (col < 7) B.add("box", (row + col) % 4 ? "#ffd59a" : "#4a5378", 0.1, 1.8, 1.3, XW + 2.35, -4.9 - row * 4.6, ZD - 0.6 - col * 2.8, { lit: (row + col) % 4 !== 0 });
      if (col < 7) B.add("box", (row * 3 + col) % 4 ? "#ffd59a" : "#4a5378", 0.1, 1.8, 1.3, -XW - 2.35, -4.9 - row * 4.6, ZD - 0.6 - col * 2.8, { lit: (row * 3 + col) % 4 !== 0 });
    }
  // uplights set in the deck along its edge, cyan and pink
  for (let x = -XW + 0.9; x <= XW - 0.8; x += 1.5)
    for (const sz of [-1, 1]) B.lit(Math.round(x * 2) % 2 ? "#ff7ad0" : "#7ff0ff", 0.2, 0.025, 0.2, x, 0, sz * (ZD - 0.3));
  for (let z = -ZD + 1.2; z <= ZD - 1.1; z += 1.5) for (const sx of [-1, 1]) B.lit(Math.round(z * 2) % 2 ? "#ff7ad0" : "#7ff0ff", 0.2, 0.025, 0.2, sx * (XW - 0.3), 0, z);
  // ---- the edge: a low glass balustrade, a glowing rail
  const rail = (w: number, d: number, x: number, z: number) => {
    B.box("#e9edf6", w, 0.32, d, x, 0, z, 0.035);
    B.add("box", "#8ff0ff", w + 0.05, 0.07, d + 0.05, x, 0.82, z, { lit: true });
  };
  rail(FW + 0.5, 0.36, 0, ZD + 0.22);
  rail(FW + 0.5, 0.36, 0, -ZD - 0.22);
  rail(0.36, FD - 0.36, XW + 0.22, 0);
  rail(0.36, FD - 0.36, -XW - 0.22, 0);
  for (let x = -XW; x <= XW + 0.01; x += 2.1) {
    B.box("#c9d2e6", 0.08, 0.5, 0.08, x, 0.32, ZD + 0.22, 0);
    B.box("#c9d2e6", 0.08, 0.5, 0.08, x, 0.32, -ZD - 0.22, 0);
  }
  for (let z = -ZD; z <= ZD + 0.01; z += 2.1) {
    B.box("#c9d2e6", 0.08, 0.5, 0.08, XW + 0.22, 0.32, z, 0);
    B.box("#c9d2e6", 0.08, 0.5, 0.08, -XW - 0.22, 0.32, z, 0);
  }
  // chrome ladders at two of the pool's corners
  for (const [lx, lz, sd] of [
    [POOL.x - POOL.hx + 0.55, POOL.z - POOL.hz, -1],
    [POOL.x + POOL.hx - 0.55, POOL.z + POOL.hz, 1],
  ]) {
    for (const ox of [-0.22, 0.22]) {
      B.add("cyl", "#e9f2ff", 0.06, 0.9, 0.06, lx + ox, 0.3, lz + sd * 0.02, { lit: true });
      B.add("box", "#e9f2ff", 0.06, 0.06, 0.32, lx + ox, 0.74, lz - sd * 0.13, { lit: true, rx: sd * 0.4 });
    }
    for (let k = 0; k < 2; k++) B.add("box", "#c9d6ea", 0.44, 0.04, 0.12, lx, -0.08 - k * 0.12, lz - sd * 0.08, {});
  }
  // ---- the loungers (white frames, coral cushions) with a folded parasol by each
  for (const [bx, bz] of [
    [-5.5, -4.75],
    [5.4, 4.5],
  ]) {
    B.box("#f4f6fb", 2.1, 0.12, 0.8, bx, 0.3, bz, 0.03);
    B.box("#ff7a6a", 1.5, 0.1, 0.7, bx + 0.2, 0.42, bz, 0.02);
    B.add("box", "#ff7a6a", 0.6, 0.1, 0.7, bx - 0.75, 0.62, bz, { rz: -0.6, ink: 0.02 });
    // a striped towel, a pair of flip-flops, a coconut drink
    B.box(bx < 0 ? "#3ec6ff" : "#ffd23f", 0.9, 0.03, 0.6, bx + 0.35, 0.47, bz, 0.01);
    B.box("#ffffff", 0.9, 0.032, 0.12, bx + 0.35, 0.47, bz, 0);
    for (const fz of [-0.12, 0.12]) B.box("#ff5fa2", 0.14, 0.03, 0.28, bx - 0.6 + fz, 0, bz + 0.62, 0.008);
    B.add("ball", "#8a5a3c", 0.22, 0.2, 0.22, bx + 1.25, 0.12, bz - 0.55, { ink: 0.01 });
    B.add("box", "#ff5fa2", 0.02, 0.26, 0.02, bx + 1.29, 0.3, bz - 0.55, { rz: 0.3 });
    for (const sx of [-0.85, 0.85]) B.box("#c9d2e6", 0.1, 0.3, 0.7, bx + sx, 0, bz, 0.02);
    const px = bx + (bx < 0 ? 1.45 : -1.45);
    B.cyl("#c9d2e6", 0.05, 2.4, px, 0, bz, 0.015);
    B.add("cone", "#ffd23f", 0.5, 1.4, 0.5, px, 1.9, bz, { rx: Math.PI, ink: 0.02 });
  }
  // ---- the palms at the pool's ends (their fronds move: an instanced draw of their own)
  const palms: { x: number; z: number; top: THREE.Vector3; ph: number }[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * 7.9,
      z = POOL.z;
    B.cyl("#e9edf6", 0.9, 0.55, x, 0, z, 0.04);
    B.cyl("#2b2f4a", 0.82, 0.05, x, 0.55, z, 0);
    // a trunk of stacked rings, leaning out
    let tx = x,
      ty = 0.55;
    for (let k = 0; k < 7; k++) {
      B.add("cyl", k % 2 ? "#9a6e48" : "#87603d", 0.3 - k * 0.012, 0.52, 0.3 - k * 0.012, tx, ty + 0.26, z, { rz: -sx * 0.12, ink: 0.02 });
      tx += sx * 0.065;
      ty += 0.5;
    }
    for (let k = 0; k < 3; k++) B.add("ball", "#6a4a2a", 0.24, 0.24, 0.24, tx + Math.cos(k * 2.1) * 0.16, ty - 0.12, z + Math.sin(k * 2.1) * 0.16, { ink: 0.015 });
    palms.push({ x: tx, z, top: new THREE.Vector3(tx, ty, z), ph: sx });
  }
  const FRONDS = 8;
  const frondMesh = new THREE.InstancedMesh(GEO.box, new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonSteps() }), palms.length * FRONDS);
  frondMesh.frustumCulled = false;
  frondMesh.raycast = () => {};
  const fc = new THREE.Color();
  for (let i = 0; i < palms.length * FRONDS; i++) frondMesh.setColorAt(i, fc.set(i % 2 ? "#3fcf6a" : "#2fb35a"));
  s.add(frondMesh);
  // ---- string lights over the deck's back, the Z-Blocks, the "SKY POOL" sign
  const bulbs = ["#ff5fa2", "#ffd23f", "#3ec6ff", "#8ee35b", "#ffffff"];
  const bulbMesh = new THREE.InstancedMesh(GEO.ball, glow("#ffffff"), 40);
  bulbMesh.frustumCulled = false;
  bulbMesh.raycast = () => {};
  {
    const m = new THREE.Matrix4(),
      v = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      sc = new THREE.Vector3(0.2, 0.26, 0.2);
    for (let span = 0; span < 4; span++) {
      const x0 = -XW + span * ((XW * 2) / 4);
      for (let k = 0; k < 10; k++) {
        const u = (k + 0.5) / 10;
        const x = x0 + u * ((XW * 2) / 4);
        const y = 3.6 - Math.sin(u * Math.PI) * 0.7;
        bulbMesh.setMatrixAt(span * 10 + k, m.compose(v.set(x, y, -ZD - 0.3), q, sc));
      }
    }
  }
  const bulbCol = new THREE.Color();
  s.add(bulbMesh);
  for (const x of [-XW - 0.22, -XW / 2, 0, XW / 2, XW + 0.22]) {
    B.box("#2b2f4a", 0.14, 3.9, 0.14, x, 0, -ZD - 0.3, 0.02);
  }
  // big tropical planters just outside the rail's corners
  for (const [px, pz] of [
    [-XW - 1.25, -ZD - 0.9],
    [XW + 1.25, -ZD - 0.9],
    [-XW - 1.25, ZD + 0.6],
    [XW + 1.25, ZD + 0.6],
  ]) {
    B.box("#e9edf6", 1.3, 0.8, 1.3, px, -0.4, pz, 0.04);
    B.box("#2b2f4a", 1.15, 0.05, 1.15, px, 0.4, pz, 0);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + px;
      const h = 0.9 + (k % 3) * 0.35;
      B.add("box", k % 2 ? "#2fb35a" : "#45d070", 0.55, 0.05, 0.95, px + Math.sin(a) * 0.35, 0.45 + h * 0.55, pz + Math.cos(a) * 0.35, { ry: a, rx: -0.7, ink: 0.015 });
    }
    B.add("ball", "#ff5fa2", 0.2, 0.2, 0.2, px + 0.2, 1.1, pz + 0.1, { lit: true });
    B.add("ball", "#ffd23f", 0.18, 0.18, 0.18, px - 0.25, 1.25, pz - 0.15, { lit: true });
  }
  // a cabana bar at the back, its neon sign
  B.box("#f4f6fb", 7.4, 2.6, 2.2, 0, 0, -ZD - 2.6, 0.05);
  B.box("#2fb3a0", 7.8, 0.3, 2.7, 0, 2.6, -ZD - 2.5, 0.04);
  for (let k = 0; k < 9; k++) B.add("box", k % 2 ? "#ffffff" : "#ff5fa2", 7.6 / 9, 0.08, 1.1, -3.8 + (7.6 / 9) * (k + 0.5), 2.2, -ZD - 1.35, { rx: 0.38, ink: 0.015 });
  B.lit("#2a2140", 6.6, 1.3, 0.06, 0, 0.5, -ZD - 1.48);
  for (let k = 0; k < 5; k++) B.lit(["#ff5fa2", "#ffd23f", "#3ec6ff", "#8ee35b", "#ff7a3c"][k], 0.3, 0.55, 0.3, -2.4 + k * 1.2, 0.95, -ZD - 1.6);
  const sign = label("SKY POOL", 0.75, "#ffffff", "#e8307a");
  sign.position.set(0, 3.45, -ZD - 1.32);
  s.add(sign);
  const neonQ = qBlock(0.95);
  neonQ.position.set(-XW - 1.6, 3.7, -ZD - 0.4);
  s.add(neonQ);
  const neonQ2 = qBlock(0.95);
  neonQ2.position.set(XW + 1.6, 3.7, -ZD - 0.4);
  s.add(neonQ2);
  // ---- the bay: the three towers with their sky-park, the garden's light-trees, the big wheel
  const tower = (x: number, z: number, w: number, h: number, c: string, win: string) => {
    B.box(c, w, h, w * 0.7, x, -30, z, 0.12);
    for (let k = 0; k < Math.floor(h / 6); k++) B.lit(win, w * 0.8, 0.9, 0.1, x, -27 + k * 6, z + w * 0.35 + 0.06);
  };
  for (const k of [-1, 0, 1]) tower(-8 + k * 13, -95, 9, 112, "#d9dcef", "#ffe6b0");
  B.box("#eef0fa", 46, 3.2, 10, -8, 82, -95, 0.15);
  B.add("box", "#8ff0ff", 46.2, 0.5, 10.2, -8, 81.8, -95, { lit: true });
  B.add("cone", "#3fcf6a", 6, 3, 6, -14, 85.6, -95, { ink: 0.05 });
  B.add("cone", "#3fcf6a", 5, 2.5, 5, 0, 85.4, -95, { ink: 0.05 });
  // the light-trees
  const lightTree = (x: number, z: number, h: number, c: string) => {
    B.add("cyl", "#5a3a7a", 1.2, h, 1.2, x, -30 + h / 2, z, { ink: 0.05 });
    B.add("cyl", c, 9, 1.2, 9, x, -30 + h, z, { lit: true });
    B.add("cyl", "#2a1a3a", 7.6, 1.3, 7.6, x, -30 + h - 0.05, z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      B.add("box", c, 0.5, h * 0.55, 0.5, x + Math.cos(a) * 2.2, -30 + h * 0.75, z + Math.sin(a) * 2.2, { lit: true, rz: Math.cos(a) * 0.25, rx: -Math.sin(a) * 0.25 });
    }
  };
  lightTree(-46, -70, 40, "#ff5fd2");
  lightTree(-36, -82, 52, "#5fe8ff");
  lightTree(-30, -72, 34, "#b07aff");
  lightTree(40, -75, 44, "#ff8a3c");
  // the big wheel, turning slowly
  const wheel = new THREE.Group();
  wheel.position.set(52, 14, -88);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(26, 0.8, 6, 48), glow("#9fe8ff"));
  wheel.add(rim);
  const pods = new THREE.InstancedMesh(GEO.box, glow("#ffffff"), 28);
  const spokes = new THREE.InstancedMesh(GEO.box, glow("#6fb8ff"), 14);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3();
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    pods.setMatrixAt(k, m.compose(v.set(Math.cos(a) * 26, Math.sin(a) * 26, 0), q.identity(), sc.set(2.2, 1.6, 2.2)));
    pods.setColorAt(k, fc.set(k % 3 ? "#ffe6b0" : "#ff9fe0"));
  }
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI;
    q.setFromAxisAngle(v.set(0, 0, 1), a);
    spokes.setMatrixAt(k, m.compose(v.set(0, 0, 0), q, sc.set(52, 0.3, 0.3)));
  }
  wheel.add(pods, spokes);
  wheel.rotation.y = -0.5;
  s.add(wheel);
  B.box("#8fa6c0", 2, 44, 2, 52, -30, -88, 0.05);
  B.build(s, ink);
  // the far towers, pushed out past the town's blocks and down to the water
  const far = skyline(s, { r: 125, n: 70, y: -34, tall: 1.5, rnd, night: true });
  far.scale.set(1.55, 1, 1.55);
  far.position.y = 4;
  far.userData.noShadow = true;
  // Marina Bay round and below the deck: the night city on the west bank and behind the bay's garden
  // (wet streets, lit windows, rooftop pools), the bay itself to the east and in front
  const GY = -30;
  const inBay = (x: number, z: number) => (x > 25 && z > -57.5) || (x > -15 && z > 22.5);
  const inGarden = (x: number, z: number) => {
    const i = Math.round(x / 40),
      j = Math.round((z + 2.5) / 40);
    return j === -2 && i >= -1 && i <= 1;
  };
  const tw = town(s, {
    seed: 0x3a21b,
    y: GY,
    top: -8,
    cz: -2.5,
    mode: "night",
    fog: level.sky[1],
    haze: 0.16,
    ground: { road: "#222a4a", paint: "#6a78b0", kerb: "#56629a", lot: "#353e68" },
    walls: ["#454e84", "#3a4474", "#525a92", "#463e74", "#374878"],
    roofs: ["#c2c8e4", "#b0bade", "#cdc4e6"],
    win: { lit: "#ffd68a", dark: "#1c2246", k: 0.44 },
    green: ["#1f8a62", "#2a9c6e"],
    trunk: "#3a2c3a",
    lawn: "#1f6a52",
    parks: 0.08,
    cars: 34,
    paint: ["#e8504a", "#3e8ee0", "#f4f6fb", "#ffd23f", "#59d0c0", "#8a6ad8"],
    left: true,
    lamp: "#ffb060",
    skip: (x, z) => inBay(x, z) || inGarden(x, z),
    noRoad: (axis, at) => (axis ? at > -15 : at > -60),
  });
  const bay = marinaBay(s, level.sky[1], GY);
  // the sky all round (the fly-over sees the horizon): rain clouds, a moon in the gaps, the city's glow low down
  skyDome(s, { sky: level.sky, stars: 60, clouds: 13, cloud: "#3d3870", cloudShade: "#211d46", disc: { az: 252, el: 26, moon: true }, haze: 0.45, rnd: rng(0x5c1a3) });
  const stars = new Stars(s, 90, 380, 0.5);
  const CB = new Batch();
  const clouds = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = -1.4 + (i / 8) * 2.8;
    const d = 90 + (i % 3) * 25;
    const cx = Math.sin(a) * d,
      cz = -Math.cos(a) * d,
      cy = 26 + (i % 4) * 5;
    for (let k = 0; k < 4; k++) CB.add("box", i % 2 ? "#3a3566" : "#2e2a55", 9 + k * 2, 3 + (k % 2), 7, cx + k * 5 - 8, cy + (k % 2) * 1.2, cz + k, {});
  }
  CB.build(clouds, ink);
  s.add(clouds);
  // ---- the gust's warning: chevrons racing over the deck (a strip in front of the pool, one behind)
  const chev = canvasTex(
    128,
    64,
    (g) => {
      g.clearRect(0, 0, 128, 64);
      g.fillStyle = "rgba(255,255,255,1)";
      for (const x0 of [14, 74]) {
        g.beginPath();
        g.moveTo(x0, 6);
        g.lineTo(x0 + 22, 6);
        g.lineTo(x0 + 44, 32);
        g.lineTo(x0 + 22, 58);
        g.lineTo(x0, 58);
        g.lineTo(x0 + 22, 32);
        g.closePath();
        g.fill();
      }
    },
    true,
  );
  const strips: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; tex: THREE.Texture }[] = [];
  for (const z of [-3.25, 2.55]) {
    const t = chev.clone();
    t.needsUpdate = true;
    t.repeat.set((XW * 2) / 1.6, 1);
    const mat = new THREE.MeshBasicMaterial({ map: t, color: "#9ff4ff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(XW * 2 - 0.6, 0.8).rotateX(-Math.PI / 2), mat);
    sm.position.set(0, 0.04, z);
    sm.renderOrder = 2;
    s.add(sm);
    strips.push({ m: sm, mat, tex: t });
  }
  // ---- the rain
  const rain = new Precip(s, 260, "rain", 15, 11, 16, "#cfe6ff");
  // what moves: the palms in the wind, the rain, the pool's shimmer, the chevrons, the neon, the wheel
  const P = new THREE.Vector3(),
    Q = new THREE.Quaternion(),
    E = new THREE.Euler(),
    S = new THREE.Vector3(),
    M = new THREE.Matrix4(),
    at = new THREE.Vector3();
  // (its own random: the splashes, the drops and the lightning are this screen's, never the game's)
  const AR = rng(0xa21a3);
  let bend = 0;
  let dropAt = 0;
  let splashAt = 0;
  // lightning: now and then the sky flashes (twice), the thunder rolls in after
  let boltAt = 6 + AR() * 6;
  let flash = 0;
  let thunder = -1;
  const sign0 = sign.material as THREE.MeshBasicMaterial;
  let flicker = 0;
  return (dt: number, clk: number, w: Weather) => {
    // the floats drift (the gust blows them, the waders push them), bounce off the pool's walls
    for (const f of floats) {
      f.vx += w.wind * 1.4 * dt;
      for (const p of w.players) {
        const dx = f.x - p.x,
          dz = f.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < f.r + 0.55 && d > 0.01) ((f.vx += (dx / d) * 3 * dt), (f.vz += (dz / d) * 3 * dt));
      }
      f.vx *= Math.exp(-0.6 * dt);
      f.vz *= Math.exp(-0.6 * dt);
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      const lx = POOL.hx - f.r,
        lz = POOL.hz - f.r;
      if (Math.abs(f.x - POOL.x) > lx) ((f.x = POOL.x + Math.sign(f.x - POOL.x) * lx), (f.vx *= -0.6));
      if (Math.abs(f.z - POOL.z) > lz) ((f.z = POOL.z + Math.sign(f.z - POOL.z) * lz), (f.vz *= -0.6));
      f.g.position.set(f.x, -0.06 + Math.sin(clk * 2.2 + f.ph) * 0.035, f.z);
      f.g.rotation.set(Math.sin(clk * 1.7 + f.ph) * 0.08, f.g.rotation.y + (f.vx * 0.6 + 0.05) * dt, Math.cos(clk * 1.9 + f.ph) * 0.08);
    }
    causMat.opacity = 0.28 + Math.sin(clk * 1.3) * 0.08;
    caus.offset.set(Math.sin(clk * 0.35) * 0.4, clk * 0.06);
    // the string lights chase along
    for (let k = 0; k < 40; k++) {
      const on = (Math.floor(clk * 4) + k) % 5;
      bulbMesh.setColorAt(k, bulbCol.set(bulbs[(k + Math.floor(clk * 1.5)) % bulbs.length]).multiplyScalar(on === 0 ? 0.35 : 1));
    }
    if (bulbMesh.instanceColor) bulbMesh.instanceColor.needsUpdate = true;
    // rain splashing on the deck
    splashAt -= dt;
    while (splashAt <= 0) {
      splashAt += 0.035;
      const x = (AR() * 2 - 1) * XW,
        z = (AR() * 2 - 1) * ZD;
      if (Math.abs(x - POOL.x) < POOL.hx && Math.abs(z - POOL.z) < POOL.hz) continue;
      fx.burst(at.set(x, 0.04, z), 1, ["#e6f4ff", "#ffffff"], { speed: 0.6, up: 1.1, size: 0.06, gravity: 9, life: 0.2 });
    }
    // lightning
    boltAt -= dt;
    if (boltAt <= 0) {
      boltAt = 9 + AR() * 7;
      flash = 1;
      thunder = 0.5 + AR() * 0.6;
    }
    if (thunder > 0 && (thunder -= dt) <= 0) sfx.thud();
    flash = Math.max(0, flash - dt * 3.2);
    const fl = flash > 0.7 ? 1 : flash > 0.45 ? 0.2 : flash > 0.2 ? 0.75 : flash * 2;
    hemi.intensity = level.hemi + fl * 1.3;
    // the neon sign stutters now and then
    flicker -= dt;
    if (flicker <= 0) flicker = AR() < 0.15 ? 0.06 : 0.5 + AR() * 2;
    sign0.opacity = flicker < 0.07 && Math.floor(clk * 30) % 2 ? 0.35 : 1;
    sign0.transparent = true;
    // the palms lean into the gust (a shiver while it is announced)
    const want = w.wind * 0.55 + w.warn * w.dir * 0.12 + Math.sin(clk * (w.warn ? 14 : 1.3)) * (w.warn ? 0.04 : 0.025);
    bend += (want - bend) * Math.min(1, dt * 5);
    let n = 0;
    for (const p of palms) {
      for (let k = 0; k < FRONDS; k++) {
        const a = (k / FRONDS) * Math.PI * 2 + p.ph;
        const flap = Math.sin(clk * (2 + Math.abs(w.wind) * 9) + k * 1.7) * (0.06 + Math.abs(w.wind) * 0.12);
        // a frond: out from the top, drooping; the wind swings them all downwind
        const yaw = a,
          droop = -0.45 - flap;
        const len = 1.9;
        const dx = Math.cos(yaw),
          dz = Math.sin(yaw);
        const bx = dx + bend * 1.6,
          bz = dz;
        const bl = Math.hypot(bx, bz) || 1;
        E.set(0, -Math.atan2(bz / bl, bx / bl), droop * (1 - Math.abs(bend) * 0.4) + (dx * bend > 0 ? -0.15 : 0.1) * Math.abs(bend), "YXZ");
        Q.setFromEuler(E);
        P.set(p.top.x + (bx / bl) * len * 0.45, p.top.y - 0.15 - 0.25, p.top.z + (bz / bl) * len * 0.45);
        M.compose(P, Q, S.set(len, 0.06, 0.42));
        frondMesh.setMatrixAt(n++, M);
      }
    }
    frondMesh.instanceMatrix.needsUpdate = true;
    // the rain slants with the gust
    rain.drift = w.wind * 9 + w.dir * w.warn * 1.5;
    rain.update(dt, clk);
    // drops on the puddles and the pool
    dropAt -= dt;
    if (dropAt <= 0) {
      dropAt = 0.05;
      const p = AR() < 0.5 ? PUDDLES[Math.floor(AR() * PUDDLES.length)] : null;
      if (p) at.set(p.x + (AR() - 0.5) * p.r * 1.4, 0.05, p.z + (AR() - 0.5) * p.r * 1.2);
      else at.set(POOL.x + (AR() - 0.5) * POOL.hx * 2, -0.02, POOL.z + (AR() - 0.5) * POOL.hz * 2);
      fx.burst(at, 2, ["#ffffff", "#bfe9ff"], { speed: 0.9, up: 1.4, size: 0.07, gravity: 10, life: 0.25 });
    }
    waterMat.opacity = 0.4 + Math.sin(clk * 2.3) * 0.04;
    // the chevrons: on with the warning, racing with the gust, out after
    const on = Math.max(w.warn > 0 ? 0.35 + 0.55 * (Math.floor(clk * 8) % 2) : 0, Math.abs(w.wind) * 0.55);
    for (const st of strips) {
      st.mat.opacity += (on - st.mat.opacity) * Math.min(1, dt * 10);
      st.m.visible = st.mat.opacity > 0.01;
      st.tex.repeat.x = (w.dir > 0 ? 1 : -1) * ((XW * 2) / 1.6);
      st.tex.offset.x -= dt * (1.2 + Math.abs(w.wind) * 3.5);
    }
    neonQ.rotation.y = clk * 0.9;
    neonQ2.rotation.y = -clk * 0.9 + 1;
    neonQ.position.y = 3.7 + Math.sin(clk * 1.6) * 0.22;
    neonQ2.position.y = 3.7 + Math.sin(clk * 1.6 + 2) * 0.22;
    wheel.rotation.z = clk * 0.05;
    tw.tick(dt);
    bay(dt);
    clouds.position.x = ((clk * 1.2 + w.wind * 6 + 50) % 100) - 50;
    stars.twinkle(clk);
  };
}

/**
 * The bay east of the deck and in front of it: dark water with the night's lights lying on it, the
 * quay's edge, the garden's lawns behind, a jetty with three moored yachts, bumboats going round
 * with their lanterns lit (six draws). Returns what moves.
 */
function marinaBay(s: THREE.Scene, fog: string, y: number) {
  const hz = (c: string, k = 0.16) => mixHex(c, fog, k);
  const R = rng(0xb4a1);
  const M = new THREE.Matrix4(),
    Q = new THREE.Quaternion(),
    P = new THREE.Vector3(),
    S = new THREE.Vector3(),
    C = new THREE.Color(),
    E = new THREE.Euler();
  // the water: ripples in staggered rows (a clear pattern, not a noise), the city's colours glinting here and there
  const wtex = canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = hz("#12294e");
      g.fillRect(0, 0, 256, 256);
      for (let j = 0; j < 8; j++)
        for (let i = 0; i < 2; i++) {
          const w = 18 + Math.floor(R() * 26);
          const x = Math.floor(i * 128 + (j % 2) * 64 + R() * 50),
            yy = j * 32 + 8 + Math.floor(R() * 12);
          g.fillStyle = hz((i + j) % 3 ? "#1b3862" : "#234878");
          for (const dx of [-256, 0]) {
            g.fillRect(x + dx, yy, w, 3);
            g.fillRect(x + dx + 6, yy + 5, Math.floor(w * 0.5), 2);
          }
        }
      const tint = ["#ffd68a", "#ff7ad0", "#7ff0ff"];
      for (let k = 0; k < 9; k++) {
        g.fillStyle = tint[k % 3];
        g.globalAlpha = 0.55;
        g.fillRect(Math.floor(R() * 240), Math.floor(R() * 250), 10, 3);
      }
      g.globalAlpha = 1;
    },
    true,
  );
  wtex.anisotropy = 8;
  const wmat = new THREE.MeshBasicMaterial({ map: wtex });
  const TILE = 22;
  const sheet = (x0: number, x1: number, z0: number, z1: number) => {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
    // (one pattern across both sheets: the ripples by the world's metres)
    const pos = geo.attributes.position,
      uv = geo.attributes.uv;
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + cx) / TILE, (pos.getZ(i) + cz) / TILE);
    const m = new THREE.Mesh(geo, wmat);
    m.position.set(cx, y + 0.35, cz);
    return m;
  };
  const meshes: THREE.Object3D[] = [sheet(25, 560, -57.5, 560), sheet(-15, 25, 22.5, 560)];
  // the quay's stone edge along the water, the garden's lawns, the jetty
  const boxes = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), 20);
  let n = 0;
  const put = (c: string, w: number, h: number, d: number, px: number, py: number, pz: number) => {
    boxes.setMatrixAt(n, M.compose(P.set(px, py + h / 2, pz), Q.identity(), S.set(w, h, d)));
    boxes.setColorAt(n++, C.set(hz(c)));
  };
  put("#6a76aa", 300, 1.1, 1.2, 175, y, -57.5);
  put("#6a76aa", 1.2, 1.1, 80, 25, y, -17.5);
  put("#6a76aa", 40, 1.1, 1.2, 5, y, 22.5);
  put("#6a76aa", 1.2, 1.1, 300, -15, y, 172.5);
  for (const i of [-1, 0, 1]) {
    // (a lawn, two paths across it, a pond: never one flat green square)
    const gx = i * 40,
      gz = -82.5;
    put("#1f6a52", 29, 0.35, 29, gx, y, gz);
    put("#4a8f7c", 29, 0.4, 2.2, gx, y, gz + 8);
    put("#4a8f7c", 2.2, 0.4, 29, gx - 9 * (i || 1), y, gz);
    put("#2aa6c4", 9, 0.42, 6, gx + 6 * (i || 1), y, gz - 6);
  }
  put("#8a7a6a", 26, 0.8, 2.4, 39, y, 2);
  put("#8a7a6a", 2.4, 0.8, 12, 51, y, 2);
  boxes.count = n;
  meshes.push(boxes);
  // the lights lying on the water: long soft streaks under the tower, the garden's trees and the wheel (they shimmer)
  const stTex = canvasTex(32, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, "rgba(255,255,255,0.9)");
    gr.addColorStop(0.5, "rgba(255,255,255,0.3)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    for (let k = 0; k < 16; k++) g.fillRect(k % 2 ? 6 : 2, k * 8, k % 2 ? 20 : 28, 5);
  });
  const streaks: [number, number, number, number, string][] = [
    [31, -8, 9, 22, "#ffd68a"],
    [33, 6, 7, 18, "#7ff0ff"],
    [40, -52, 7, 30, "#ff8a3c"],
    [52, -52, 9, 40, "#9fe8ff"],
    [64, -52, 6, 24, "#ff7ad0"],
    [90, -52, 7, 28, "#ffd68a"],
    [120, -52, 6, 22, "#b07aff"],
    [5, 28, 10, 20, "#ffd68a"],
  ];
  const shine = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: stTex, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), streaks.length);
  shine.renderOrder = 1;
  streaks.forEach(([, , , , c], i) => shine.setColorAt(i, C.set(c)));
  meshes.push(shine);
  // boats: three yachts moored at the jetty, four bumboats going round the bay (hull, cabin, two lanterns each)
  const NB = 7;
  const hulls = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), NB * 2);
  const lamps = new THREE.InstancedMesh(GEO.box, glow("#ffd68a"), NB * 2);
  const boat: { x: number; z: number; rx: number; rz: number; w: number; ph: number; len: number }[] = [];
  for (let i = 0; i < 3; i++) boat.push({ x: 31 + i * 7, z: 6.5, rx: 0, rz: 0, w: 0, ph: i * 2.1, len: 5.4 });
  for (let i = 0; i < 4; i++) boat.push({ x: 62 + i * 22, z: 10 + (i % 2) * 34, rx: 9 + R() * 6, rz: 34 + R() * 16, w: (0.045 + R() * 0.03) * (i % 2 ? -1 : 1), ph: R() * 6.28, len: 7.5 });
  const roofs = ["#f4f6fb", "#f4f6fb", "#f4f6fb", "#e8504a", "#3fb6a8", "#f0a030", "#8a6ad8"];
  for (let i = 0; i < NB; i++) {
    hulls.setColorAt(i * 2, C.set(hz(i < 3 ? "#e9edf6" : "#5a4638")));
    hulls.setColorAt(i * 2 + 1, C.set(hz(roofs[i])));
  }
  meshes.push(hulls, lamps);
  for (const m of meshes) {
    m.userData.noShadow = true;
    (m as THREE.Mesh).frustumCulled = false;
    (m as THREE.Mesh).raycast = () => {};
    s.add(m);
  }
  const UP = new THREE.Vector3(0, 1, 0);
  let clk = 0;
  const tick = (dt: number) => {
    clk += dt;
    wtex.offset.set(clk * 0.012, Math.sin(clk * 0.2) * 0.03);
    for (let i = 0; i < NB; i++) {
      const b = boat[i];
      const a = b.ph + clk * b.w;
      const px = b.x + Math.cos(a) * b.rx,
        pz = b.z + Math.sin(a) * b.rz;
      const yaw = b.w ? Math.atan2(-Math.sin(a) * b.rx * b.w, Math.cos(a) * b.rz * b.w) : 0;
      const bob = Math.sin(clk * 1.4 + b.ph) * 0.12;
      Q.setFromEuler(E.set(Math.sin(clk * 1.1 + b.ph) * 0.03, yaw, Math.sin(clk * 0.9 + b.ph) * 0.05, "YXZ"));
      hulls.setMatrixAt(i * 2, M.compose(P.set(px, y + 0.9 + bob, pz), Q, S.set(2.4, 1.2, b.len)));
      hulls.setMatrixAt(i * 2 + 1, M.compose(P.set(px, y + 2 + bob, pz), Q, S.set(1.9, 1, b.len * 0.5)));
      for (let k = 0; k < 2; k++) {
        const f = (k ? -1 : 1) * b.len * 0.42;
        lamps.setMatrixAt(i * 2 + k, M.compose(P.set(px + Math.sin(yaw) * f, y + 2.2 + bob, pz + Math.cos(yaw) * f), Q, S.set(0.6, 0.6, 0.6)));
      }
    }
    hulls.instanceMatrix.needsUpdate = lamps.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < streaks.length; i++) {
      const [sx, sz, w, len] = streaks[i];
      const k = 0.85 + Math.sin(clk * 2.1 + i * 1.7) * 0.15;
      Q.setFromAxisAngle(UP, 0).multiply(QX);
      shine.setMatrixAt(i, M.compose(P.set(sx, y + 0.42, sz + len / 2), Q, S.set(w * k, len, 1)));
    }
    shine.instanceMatrix.needsUpdate = true;
  };
  tick(0);
  return tick;
}
/** (a plane laid flat on the water, its top end toward the quay) */
const QX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
