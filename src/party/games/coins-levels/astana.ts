/**
 * CENTRAL PARK RINK: a snowy evening on a round plaza in Central Park, the NU7 TOWER's golden ball
 * glowing at the end of the boulevard, the ZK MALL's big tent and CITY HALL's blue dome beside it. The middle of the plaza is an
 * ice rink round a frozen fountain: on the ice there is no grip (you slide, dives go far, a blast
 * sends you skating). The twist: THE THAW. Every few seconds the fountain cracks (a banner, the
 * cracks glowing, a rumble, a ring pulsing round it), then bursts: a ring of coins flies out over the
 * ice, and whoever hugs the fountain is thrown back.
 */
import * as THREE from "three";
import { rng } from "../../kit";
import { GEO, canvasTex, glow, mixHex, qBlock, skyDome, skyline, toon, toonSteps } from "../../k3";
import { Precip, Stars, type Level, type SetCtx, type Weather } from "./set";
import { town } from "./town";

const R = 9;
const RINK = 4.6;
const FOUNT = 1.3;
const TREES: [number, number][] = [
  [-4.95, -4.95],
  [4.95, -4.95],
  [-4.95, 4.95],
  [4.95, 4.95],
];

export const ASTANA: Level = {
  key: "astana",
  title: "CENTRAL PARK RINK",
  titleZh: "中央公园冰场",
  tag: "A snowy evening in Central Park: the ice rink slides, and the frozen fountain thaws and bursts out coins.",
  tagZh: "雪夜中央公园：冰场打滑，冰封喷泉解冻时喷出金币。",
  song: "frost",
  ambience: "wind",
  sky: ["#22307a", "#f4a68a"],
  fog: [70, 300],
  hemi: 1.6,
  sun: [-26, 25, -13],
  sunI: 2.0,
  sunC: "#ffd2a6",
  round: true,
  xw: R,
  zd: R,
  circles: [{ x: 0, z: 0, r: FOUNT }, ...TREES.map(([x, z]) => ({ x, z, r: 0.78 }))],
  boxes: [],
  starts: [
    [-3.1, 5.6],
    [3.1, 5.6],
    [-3.1, -5.6],
    [3.1, -5.6],
  ],
  ring: { x: 0, z: 0, r: 3.0 },
  cam: { h: 17.6, d: 15.8 },
  dust: ["#ffffff", "#e6f0ff", "#cfd8ea"],
  ice: { circles: [{ x: 0, z: 0, r: RINK }], grip: 2.6 },
  thaw: { x: 0, z: 0, r: FOUNT, first: 6.5, every: [7.5, 9], warn: 1.6, n: 7 },
  build: buildAstana,
};

function buildAstana({ scene: s, B, rnd, ink, fx, hemi, level }: SetCtx) {
  // (a warm key from the low sun against a cool fill from the evening sky)
  hemi.color.set("#cfd8ff");
  hemi.groundColor.set("#8a7c98");
  // ---- the floor: granite rings dusted with snow, an ornament band, the rink
  const FR = R + 0.7;
  const PX = 64;
  // (the sheet's strokes were drawn for 40 px a metre)
  const K = PX / 40;
  const N = Math.round(FR * 2 * PX);
  const c0 = N / 2;
  const TR = rng(0xa57a4);
  const tex = canvasTex(N, N, (g) => {
    g.fillStyle = "#737c9a";
    g.fillRect(0, 0, N, N);
    // the pavers: rings of stones
    const tints = ["#b3b9cd", "#a9b0c6", "#bcc1d4", "#a4acc3", "#b7bdd0"];
    for (let r = RINK + 0.5; r < FR; r += 0.55) {
      const n = Math.max(12, Math.floor((Math.PI * 2 * r) / 0.75));
      const off = (r * 7.3) % 1;
      for (let k = 0; k < n; k++) {
        const a0 = ((k + off) / n) * Math.PI * 2,
          a1 = ((k + off + 1) / n) * Math.PI * 2;
        g.fillStyle = tints[Math.floor(TR() * tints.length)];
        g.beginPath();
        g.arc(c0, c0, (r + 0.5) * PX - 1.5 * K, a0 + 0.012, a1 - 0.012);
        g.arc(c0, c0, r * PX + 1.5 * K, a1 - 0.012, a0 + 0.012, true);
        g.closePath();
        g.fill();
      }
    }
    // a pale inlay ring out on the pavers, sixteen studs on it (steel, not gold: gold is the coins')
    g.strokeStyle = "#dfe6f5";
    g.lineWidth = 4 * K;
    g.beginPath();
    g.arc(c0, c0, 7.35 * PX, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#f2f6fd";
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      g.save();
      g.translate(c0 + Math.cos(a) * 7.35 * PX, c0 + Math.sin(a) * 7.35 * PX);
      g.rotate(a + Math.PI / 4);
      g.fillRect(-5 * K, -5 * K, 10 * K, 10 * K);
      g.restore();
    }
    // the snow: drifted against the rim in soft scallops, a few clean flecks further in
    g.fillStyle = "#f2f6fd";
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      g.beginPath();
      g.arc(c0 + Math.cos(a) * (R + 0.1) * PX, c0 + Math.sin(a) * (R + 0.1) * PX, (0.38 + TR() * 0.4) * PX, 0, Math.PI * 2);
      g.fill();
    }
    for (let k = 0; k < 70; k++) {
      const a = TR() * Math.PI * 2,
        r = RINK + 0.9 + TR() * (R - RINK - 1.6);
      const sz = (3 + TR() * 4) * K;
      g.fillRect(Math.round(c0 + Math.cos(a) * r * PX), Math.round(c0 + Math.sin(a) * r * PX), Math.round(sz), Math.round(sz * 0.7));
    }
    // footprints wandering through the snow near the rim
    g.fillStyle = "rgba(120,130,160,0.55)";
    for (let tr = 0; tr < 5; tr++) {
      let a = TR() * Math.PI * 2;
      const r0 = 8.1 + TR() * 0.5;
      for (let k = 0; k < 14; k++) {
        a += 0.045;
        const r = r0 + Math.sin(k * 0.7) * 0.2 + (k % 2 ? 0.12 : -0.12);
        g.save();
        g.translate(c0 + Math.cos(a) * r * PX, c0 + Math.sin(a) * r * PX);
        g.rotate(a + Math.PI / 2);
        g.beginPath();
        g.ellipse(0, 0, 3 * K, 5 * K, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    // the ornament band round the rink: turquoise, ram's-horn curls in cream
    g.fillStyle = "#1594b0";
    g.beginPath();
    g.arc(c0, c0, (RINK + 0.5) * PX, 0, Math.PI * 2);
    g.arc(c0, c0, RINK * PX, 0, Math.PI * 2, true);
    g.fill();
    g.strokeStyle = "#fdf3d0";
    g.lineWidth = 3.4 * K;
    const curls = 28;
    for (let k = 0; k < curls; k++) {
      const a = (k / curls) * Math.PI * 2;
      const cx = c0 + Math.cos(a) * (RINK + 0.25) * PX,
        cy = c0 + Math.sin(a) * (RINK + 0.25) * PX;
      g.save();
      g.translate(cx, cy);
      g.rotate(a + Math.PI / 2);
      for (const sd of [-1, 1]) {
        g.beginPath();
        g.arc(sd * 5 * K, -1 * K, 5 * K, sd > 0 ? Math.PI : 0, sd > 0 ? Math.PI * 2.6 : -Math.PI * 1.6, sd < 0);
        g.stroke();
      }
      g.restore();
    }
    g.strokeStyle = "#fff4cc";
    g.lineWidth = 2 * K;
    for (const r of [RINK, RINK + 0.5]) {
      g.beginPath();
      g.arc(c0, c0, r * PX, 0, Math.PI * 2);
      g.stroke();
    }
    // the ice: pale blue, a glow toward the middle, skate marks, a frosty ring at the fountain
    const gr = g.createRadialGradient(c0, c0, FOUNT * PX, c0, c0, RINK * PX);
    gr.addColorStop(0, "#a6e6ff");
    gr.addColorStop(0.5, "#6ccbf2");
    gr.addColorStop(1, "#3a9fd8");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(c0, c0, RINK * PX - 1, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#2f8fc8";
    g.lineWidth = 5 * K;
    g.beginPath();
    g.arc(c0, c0, RINK * PX - 3 * K, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.75)";
    for (let k = 0; k < 26; k++) {
      const r = (FOUNT + 0.4 + TR() * (RINK - FOUNT - 0.6)) * PX;
      const a = TR() * Math.PI * 2;
      g.lineWidth = (1 + TR() * 1.6) * K;
      g.beginPath();
      g.arc(c0, c0, r, a, a + 0.4 + TR() * 1.2);
      g.stroke();
    }
    // glints
    g.fillStyle = "rgba(255,255,255,0.95)";
    for (let k = 0; k < 40; k++) {
      const a = TR() * Math.PI * 2,
        r = (FOUNT + 0.3 + TR() * (RINK - FOUNT - 0.4)) * PX;
      const x = Math.round(c0 + Math.cos(a) * r),
        y = Math.round(c0 + Math.sin(a) * r);
      g.fillRect(x - 4 * K, y - 0.8 * K, 8 * K, 1.6 * K);
      g.fillRect(x - 0.8 * K, y - 4 * K, 1.6 * K, 8 * K);
    }
  });
  // (the snow and the ice are pale: a darker tint keeps them from burning out white under the lights)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(FR, 72).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: tex, color: "#a8aab2", gradientMap: toonSteps() }));
  s.add(floor);
  // (a sheen on the rink: a soft additive glow that breathes)
  const sheenMat = new THREE.MeshBasicMaterial({ color: "#6fd8ff", transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false });
  const sheen = new THREE.Mesh(new THREE.RingGeometry(FOUNT + 0.1, RINK - 0.05, 64).rotateX(-Math.PI / 2), sheenMat);
  sheen.position.y = 0.012;
  s.add(sheen);
  // ---- the round podium it stands on, ringed with lit windows
  // (its top just under the floor: never in the same plane, or the two flicker through each other)
  B.add("cyl", "#e9edf6", FR * 2 + 0.4, 0.5, FR * 2 + 0.4, 0, -0.31, 0, { ink: 0.05 });
  B.add("cyl", "#3e6fb0", FR * 2 + 0.8, 0.3, FR * 2 + 0.8, 0, -0.68, 0, { ink: 0.05 });
  B.add("cyl", "#dfe4ee", FR * 2 - 0.6, 46, FR * 2 - 0.6, 0, -23.8, 0);
  for (let row = 0; row < 7; row++)
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2 + row * 0.17;
      const rr = FR - 0.28;
      B.add("box", (row + k) % 5 ? "#ffe3a0" : "#8aa0c0", 1.1, 1.6, 0.12, Math.sin(a) * rr, -3.5 - row * 4.4, Math.cos(a) * rr, { ry: a, lit: (row + k) % 5 !== 0 });
    }
  // ---- the rim: a stone curb under a bank of snow, lamps round it
  const segs = 44;
  for (let k = 0; k < segs; k++) {
    const a = (k / segs) * Math.PI * 2;
    const rr = R + 0.3;
    const w = (Math.PI * 2 * rr) / segs + 0.05;
    B.add("box", "#5d6f94", w, 0.34, 0.5, Math.sin(a) * rr, 0.17, Math.cos(a) * rr, { ry: a, ink: 0.03 });
    B.add("box", "#ffffff", w * 0.98, 0.26 + (k % 3) * 0.06, 0.62, Math.sin(a) * (rr + 0.04), 0.42, Math.cos(a) * (rr + 0.04), { ry: a, ink: 0.025 });
  }
  const lampAt: number[] = [];
  for (let k = 0; k < 8; k++) lampAt.push((k / 8) * Math.PI * 2 + Math.PI / 8);
  for (const a of lampAt) {
    const x = Math.sin(a) * (R + 0.35),
      z = Math.cos(a) * (R + 0.35);
    B.cyl("#2d3c66", 0.09, 3.3, x, 0.5, z, 0.025);
    B.box("#2d3c66", 0.55, 0.08, 0.55, x, 3.75, z, 0.02);
    B.add("ball", "#ffe7a8", 0.5, 0.5, 0.5, x, 4.05, z, { lit: true });
    B.add("cone", "#2d3c66", 0.7, 0.32, 0.7, x, 4.42, z, { ry: Math.PI / 4, ink: 0.02 });
    B.add("box", "#ffffff", 0.5, 0.1, 0.5, x, 4.6, z, { ry: Math.PI / 4 });
  }
  // ---- the frozen fountain: a marble basin, its water frozen, icicles, a crown of ice shards
  B.cyl("#eef1f8", FOUNT, 0.62, 0, 0, 0, 0.045);
  B.cyl("#ffcf5a", FOUNT + 0.06, 0.1, 0, 0.62, 0, 0.03);
  B.add("cyl", "#c4f0ff", FOUNT * 2 - 0.16, 0.05, FOUNT * 2 - 0.16, 0, 0.745, 0, { lit: true });
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const h = 0.28 + ((k * 5) % 3) * 0.1;
    B.add("cone", "#c9f1ff", 0.14, h, 0.14, Math.sin(a) * (FOUNT + 0.02), 0.6 - h / 2, Math.cos(a) * (FOUNT + 0.02), { rx: Math.PI, ry: a });
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    B.box("#1f9fb4", 0.34, 0.34, 0.06, Math.sin(a) * (FOUNT + 0.01), 0.14, Math.cos(a) * (FOUNT + 0.01), 0, a);
  }
  B.cyl("#eef1f8", 0.28, 1.0, 0, 0.66, 0, 0.03);
  B.cyl("#eef1f8", 0.62, 0.2, 0, 1.6, 0, 0.03);
  B.cyl("#ffcf5a", 0.66, 0.07, 0, 1.8, 0, 0.02);
  // the shards (they shake when it thaws)
  const shards = new THREE.Group();
  shards.position.set(0, 1.86, 0);
  const iceMat = toon("#bdf0ff", "#2a5a70");
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const m = new THREE.Mesh(GEO.box, iceMat);
    const h = 0.7 + (k % 3) * 0.3;
    m.scale.set(0.2, h, 0.2);
    m.position.set(Math.sin(a) * 0.2, h / 2 - 0.05, Math.cos(a) * 0.2);
    m.rotation.set(Math.cos(a) * 0.35, a, -Math.sin(a) * 0.35);
    shards.add(m);
  }
  const core = new THREE.Mesh(GEO.box, iceMat);
  core.scale.set(0.3, 1.5, 0.3);
  core.position.y = 0.7;
  core.rotation.y = Math.PI / 4;
  shards.add(core);
  s.add(shards);
  // the cracks: a glowing web over the frozen water, lit orange as it thaws
  const crackTex = canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = "#ffffff";
    g.lineCap = "round";
    for (let k = 0; k < 9; k++) {
      let x = 128,
        y = 128;
      let a = (k / 9) * Math.PI * 2 + TR() * 0.4;
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        a += (TR() - 0.5) * 0.9;
        x += Math.cos(a) * 20;
        y += Math.sin(a) * 20;
        g.lineTo(x, y);
        g.lineWidth = 6 - j;
      }
      g.stroke();
    }
  });
  const crackMat = new THREE.MeshBasicMaterial({ map: crackTex, color: "#ffb05a", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const cracks = new THREE.Mesh(new THREE.PlaneGeometry(FOUNT * 2, FOUNT * 2).rotateX(-Math.PI / 2), crackMat);
  cracks.position.y = 0.785;
  cracks.renderOrder = 3;
  s.add(cracks);
  // ---- fir trees in planters, snow on every tier, fairy lights
  const lights = ["#ffd23f", "#ff5fa2", "#3ec6ff", "#ffffff"];
  for (const [x, z] of TREES) {
    B.cyl("#5d6f94", 0.78, 0.55, x, 0, z, 0.04);
    B.cyl("#ffffff", 0.8, 0.12, x, 0.55, z, 0.03);
    B.box("#6a4a30", 0.24, 0.6, 0.24, x, 0.6, z, 0.02);
    for (let t = 0; t < 3; t++) {
      const w = 1.7 - t * 0.42,
        h = 1.0 - t * 0.12,
        y = 1.0 + t * 0.72;
      B.add("cone", "#1f7a4a", w, h, w, x, y + h / 2, z, { ry: Math.PI / 4, ink: 0.04 });
      B.add("cone", "#ffffff", w * 0.55, h * 0.4, w * 0.55, x, y + h * 0.82, z, { ry: Math.PI / 4 });
    }
    B.add("box", "#ffd23f", 0.22, 0.22, 0.22, x, 3.5, z, { lit: true, ry: Math.PI / 4, rx: Math.PI / 4 });
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4;
      const y = 1.15 + (k / 9) * 1.9;
      const rr = 0.78 - (k / 9) * 0.55;
      B.add("ball", lights[k % lights.length], 0.11, 0.11, 0.11, x + Math.sin(a) * rr, y, z + Math.cos(a) * rr, { lit: true });
    }
  }
  // ---- the boulevard's end: the tower with the golden ball, the big tent, the blue dome
  const bx = 0,
    bz = -78;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    B.add("box", "#f4f6fb", 1.1, 70, 1.1, bx + Math.sin(a) * 2.2, 0, bz + Math.cos(a) * 2.2, { rz: Math.sin(a) * 0.04, rx: -Math.cos(a) * 0.04, ink: 0.05 });
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    B.add("box", "#f4f6fb", 0.7, 9, 0.7, bx + Math.sin(a) * 4.2, 38, bz + Math.cos(a) * 4.2, { rz: Math.sin(a) * 0.5, rx: -Math.cos(a) * 0.5, ink: 0.04 });
  }
  B.add("ball", "#ffc23a", 9, 9, 9, bx, 44, bz, { lit: true });
  B.add("ball", "#fff0b0", 4, 4, 4, bx - 1.6, 45.6, bz + 2.6, { lit: true });
  B.add("cyl", "#e9edf6", 14, 3, 14, bx, -34.4, bz, { ink: 0.05 });
  B.add("cyl", "#cfd8ea", 28, 0.5, 28, bx, -35.7, bz, {});
  // the tent (leaning a little), the palace with its dome
  const tent = new THREE.Mesh(new THREE.ConeGeometry(16, 46, 24, 1, true), new THREE.MeshToonMaterial({ color: "#d9e6f2", gradientMap: toonSteps(), emissive: "#2a3a55", side: THREE.DoubleSide }));
  tent.position.set(60, -12, -100);
  tent.rotation.z = 0.06;
  s.add(tent);
  for (let k = 0; k < 5; k++) B.add("cyl", "#ffe6b0", 30 - k * 6, 0.4, 30 - k * 6, 60, -32 + k * 9, -100, { lit: true });
  B.add("cyl", "#e6ecf6", 46, 0.5, 46, 60, -35.7, -100, {});
  B.box("#f4f6fb", 26, 28, 14, -40, -36, -82, 0.08);
  for (let k = 0; k < 7; k++) B.box("#e1e6f0", 1.2, 20, 1.2, -52 + k * 4, -36, -74.8, 0.03);
  B.add("cyl", "#e9edf6", 9, 4, 9, -40, -6, -82, { ink: 0.06 });
  B.add("ball", "#3ea8e8", 10, 8, 10, -40, -2, -82, { ink: 0.08 });
  B.add("cyl", "#ffc23a", 0.6, 9, 0.6, -40, 5, -82, { lit: true });
  // two snowmen on the rim's snowbank at the back
  for (const a of [Math.PI * 0.82, -Math.PI * 0.82]) {
    const x = Math.sin(a) * (R + 0.45),
      z = Math.cos(a) * (R + 0.45);
    B.add("ball", "#ffffff", 0.95, 0.85, 0.95, x, 0.95, z, { ink: 0.03 });
    B.add("ball", "#ffffff", 0.7, 0.66, 0.7, x, 1.62, z, { ink: 0.03 });
    B.add("ball", "#ffffff", 0.5, 0.5, 0.5, x, 2.14, z, { ink: 0.03 });
    B.add("box", "#e8304a", 0.62, 0.12, 0.62, x, 1.9, z, { ry: a, ink: 0.015 });
    B.add("box", "#e8304a", 0.14, 0.4, 0.06, x + Math.sin(a + 0.6) * 0.3, 1.72, z + Math.cos(a + 0.6) * 0.3, { ry: a, ink: 0.01 });
    B.add("cone", "#ff8a3c", 0.1, 0.32, 0.1, x - Math.sin(a) * 0.3, 2.14, z - Math.cos(a) * 0.3, { rx: -Math.cos(a) * Math.PI / 2, rz: Math.sin(a) * Math.PI / 2 });
    B.add("box", "#2d2a3a", 0.42, 0.06, 0.42, x, 2.38, z, { ink: 0.01 });
    B.add("box", "#2d2a3a", 0.28, 0.3, 0.28, x, 2.55, z, { ink: 0.015 });
    for (const sd of [-1, 1]) B.add("box", "#2d2a3a", 0.06, 0.06, 0.06, x - Math.sin(a) * 0.23 + Math.cos(a) * sd * 0.1, 2.22, z - Math.cos(a) * 0.23 - Math.sin(a) * sd * 0.1);
    B.add("box", "#6a4a30", 0.05, 0.6, 0.05, x + Math.cos(a) * 0.45, 1.75, z - Math.sin(a) * 0.45, { rz: 0.9 });
  }
  // flags: sky blue with a golden sun
  for (const fx of [-6.5, 6.5]) {
    const fz = -R - 1.6;
    B.cyl("#c9d2e6", 0.08, 6.2, fx, 0, fz, 0.02);
    B.box("#14b4d0", 2.6, 1.5, 0.06, fx + 1.35, 4.5, fz, 0.02);
    B.add("ball", "#ffd23f", 0.6, 0.6, 0.12, fx + 1.2, 5.25, fz + 0.06, { lit: true });
  }
  B.build(s, ink);
  // the far towers, pushed out past the town's blocks
  const far = skyline(s, { r: 130, n: 70, y: -36, tall: 1.3, rnd });
  far.scale.set(1.5, 1, 1.5);
  far.userData.noShadow = true;
  // ZStreet round and below the plaza: snowy blocks with their windows lit, ploughed streets and their
  // lamps, the frozen river on the left with its bridges (the landmarks keep their own blocks)
  const GY = -36;
  const RX = -80;
  const tw = town(s, {
    seed: 0xa57a1,
    y: GY,
    top: -8,
    mode: "dusk",
    snow: true,
    // (a dusty rose, not the horizon's full salmon: the snow stays snow)
    fog: "#dcbcc4",
    haze: 0.26,
    ground: { road: "#96a3c0", paint: "#b9c4dc", kerb: "#ffffff", lot: "#e6ebf6" },
    walls: ["#d9deec", "#c6cfe6", "#e6d6c6", "#bcc6e0", "#d2cae4", "#e8d8bc"],
    roofs: ["#ffffff", "#eef3fb", "#e2eaf8"],
    win: { lit: "#ffc892", dark: "#8c98bc", k: 0.36 },
    green: ["#1f7a52", "#1a6a48"],
    trunk: "#5a4636",
    lawn: "#eef3fb",
    parks: 0.1,
    cars: 34,
    paint: ["#e8504a", "#3e8ee0", "#f4f6fb", "#2f3a5a", "#f0a030", "#5a6a8a"],
    lamp: "#ffc070",
    skip: (x, z) => {
      const i = Math.round(x / 40),
        j = Math.round(z / 40);
      return i === -2 || ((i === 0 || i === -1) && j === -2) || ((i === 1 || i === 2) && (j === -2 || j === -3));
    },
  });
  const river = astanaRiver(s, level.sky[1], GY, RX);
  // the sky all round (the fly-over sees the horizon): the sun going down at the boulevard's end, the first stars
  skyDome(s, { sky: level.sky, stars: 90, clouds: 9, cloud: "#f8cdb8", cloudShade: "#b88aa8", disc: { az: 263, el: 6, color: "#ffe6bc", size: 9, glow: 6 }, haze: 0.5, rnd: rng(0x5c1a7) });
  const stars = new Stars(s, 110, 380, 0.75, "#fff6e0");
  // the lamps' warm pools of light on the stones
  const poolTex = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,214,140,0.9)");
    gr.addColorStop(0.5, "rgba(255,190,110,0.35)");
    gr.addColorStop(1, "rgba(255,170,90,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }), lampAt.length);
  pools.frustumCulled = false;
  pools.raycast = () => {};
  pools.renderOrder = 1;
  {
    const m = new THREE.Matrix4(),
      v = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      sc = new THREE.Vector3(3.6, 1, 3.6);
    lampAt.forEach((a, i) => pools.setMatrixAt(i, m.compose(v.set(Math.sin(a) * (R - 0.9), 0.02, Math.cos(a) * (R - 0.9)), q, sc)));
  }
  s.add(pools);
  // fairy lights strung from lamp to lamp round the back and the sides (not across the front)
  const spans: [number, number][] = [];
  for (let k = 0; k < lampAt.length; k++) {
    const a0 = lampAt[k],
      a1 = lampAt[(k + 1) % lampAt.length];
    const mid = Math.cos((a0 + (a1 < a0 ? a1 + Math.PI * 2 : a1)) / 2);
    if (mid < 0.35) spans.push([a0, a1 < a0 ? a1 + Math.PI * 2 : a1]);
  }
  const PER = 9;
  const fairy = new THREE.InstancedMesh(GEO.ball, glow("#ffffff"), spans.length * PER);
  fairy.frustumCulled = false;
  fairy.raycast = () => {};
  {
    const m = new THREE.Matrix4(),
      v = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      sc = new THREE.Vector3(0.16, 0.2, 0.16);
    spans.forEach(([a0, a1], j) => {
      for (let k = 0; k < PER; k++) {
        const u = (k + 1) / (PER + 1);
        const a = a0 + (a1 - a0) * u;
        fairy.setMatrixAt(j * PER + k, m.compose(v.set(Math.sin(a) * (R + 0.3), 3.95 - Math.sin(u * Math.PI) * 0.75, Math.cos(a) * (R + 0.3)), q, sc));
      }
    });
  }
  s.add(fairy);
  const fairyCol = new THREE.Color();
  const twinkle = ["#ffd23f", "#ff5fa2", "#3ec6ff", "#ffffff", "#8ee35b"];
  // two Z-Blocks hovering over the rim at the back
  const floaters: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const q = qBlock(0.9);
    q.position.set(sx * 7.6, 4.2, -6.6);
    s.add(q);
    floaters.push(q);
  }
  // ---- the snow
  const snow = new Precip(s, 240, "snow", 15, 12, 14, "#ffffff");
  let pop = 0;
  let glintAt = 0;
  const breath = [0.4, 1.1, 0.8, 1.6];
  const at = new THREE.Vector3();
  // (its own random: the glints, the breath and the shards' shake are this screen's, never the game's)
  const AR = rng(0xa21a7);
  return (dt: number, clk: number, w: Weather) => {
    snow.update(dt, clk);
    stars.twinkle(clk);
    tw.tick(dt);
    river(dt);
    // the fairy lights twinkle, the lamp pools breathe
    for (let i = 0; i < fairy.count; i++) {
      const k = Math.sin(clk * 3 + i * 1.7) * 0.5 + 0.5;
      fairy.setColorAt(i, fairyCol.set(twinkle[i % twinkle.length]).multiplyScalar(0.45 + 0.55 * k));
    }
    if (fairy.instanceColor) fairy.instanceColor.needsUpdate = true;
    (pools.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(clk * 2.3) * 0.05;
    // glints on the ice
    glintAt -= dt;
    if (glintAt <= 0) {
      glintAt = 0.09;
      const a = AR() * Math.PI * 2,
        r = FOUNT + 0.4 + AR() * (RINK - FOUNT - 0.6);
      fx.burst(at.set(Math.sin(a) * r, 0.05, Math.cos(a) * r), 1, ["#ffffff", "#dff8ff"], { speed: 0.05, up: 0.15, size: 0.11, gravity: 0, life: 0.4 });
    }
    // the snarks' breath in the cold
    for (let i = 0; i < w.players.length; i++) {
      breath[i] -= dt;
      if (breath[i] <= 0) {
        breath[i] = 1.3 + AR() * 0.9;
        const p = w.players[i];
        fx.burst(at.set(p.x, p.y + 1.85, p.z + 0.25), 3, ["#ffffff", "#eef6ff"], { speed: 0.4, up: 0.5, size: 0.13, gravity: -0.6, life: 0.7, drag: 2 });
      }
    }
    sheenMat.opacity = 0.06 + Math.sin(clk * 1.7) * 0.03;
    // the thaw: the cracks glow hotter, the shards shake, a halo swells; then they pop
    const k = w.thaw;
    crackMat.opacity = k > 0 ? 0.35 + k * 0.65 * (0.75 + 0.25 * Math.sin(clk * 30)) : Math.max(0, crackMat.opacity - dt * 2);
    if (w.burst) pop = 1;
    pop = Math.max(0, pop - dt * 2.5);
    const sh = k * 0.06;
    shards.position.set((AR() - 0.5) * sh, 1.86 + pop * 0.5, (AR() - 0.5) * sh);
    shards.scale.setScalar(1 + pop * 0.35);
    shards.rotation.y += dt * (0.3 + k * 4);
    for (let i = 0; i < floaters.length; i++) {
      const q = floaters[i];
      q.rotation.y = clk * 0.9 + i;
      q.position.y = 4.2 + Math.sin(clk * 1.6 + i * 2) * 0.22;
    }
  };
}

/**
 * The frozen river along the town's left side: ice swept by the skaters, snow on its banks, a bridge
 * where each street crosses it, a dozen skaters gliding round (three draws). Returns what moves.
 */
function astanaRiver(s: THREE.Scene, fog: string, y: number, x: number) {
  const hz = (c: string) => mixHex(c, fog, 0.24);
  const R = rng(0x21e4);
  const W = 31;
  const tex = canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = hz("#b4d6f0");
      g.fillRect(0, 0, 256, 256);
      // the skaters' marks: long clean arcs (they tile along the river)
      g.strokeStyle = hz("#e2f2ff");
      g.lineWidth = 3;
      for (let k = 0; k < 9; k++) {
        const cy = R() * 256,
          r = 40 + R() * 60,
          a = R() * Math.PI * 2;
        for (const dy of [-256, 0, 256]) {
          g.beginPath();
          g.arc(60 + R() * 136, cy + dy, r, a, a + 1 + R() * 1.4);
          g.stroke();
        }
      }
      // snow drifted along both banks, in scallops
      g.fillStyle = hz("#f4f8ff");
      for (let k = 0; k < 16; k++) {
        const t = (k / 16) * 256;
        for (const bx of [0, 256]) {
          g.beginPath();
          g.arc(bx, t, 22 + ((k * 7) % 5) * 5, 0, Math.PI * 2);
          g.fill();
        }
      }
    },
    true,
  );
  const LEN = 640;
  tex.repeat.set(1, LEN / W);
  const ice = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps(), emissive: "#16304a" }));
  ice.rotation.x = -Math.PI / 2;
  ice.scale.set(W, LEN, 1);
  ice.position.set(x, y + 0.3, 0);
  // the banks, the bridges (a deck, two white parapets, lamps at their ends)
  const zs: number[] = [];
  for (let k = -4; k < 4; k++) zs.push((k + 0.5) * 40);
  const boxes = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), 2 + zs.length * 3);
  const M = new THREE.Matrix4(),
    Q = new THREE.Quaternion(),
    P = new THREE.Vector3(),
    S = new THREE.Vector3(),
    C = new THREE.Color();
  let n = 0;
  const put = (c: string, w: number, h: number, d: number, px: number, py: number, pz: number) => {
    boxes.setMatrixAt(n, M.compose(P.set(px, py + h / 2, pz), Q, S.set(w, h, d)));
    boxes.setColorAt(n++, C.set(hz(c)));
  };
  for (const sd of [-1, 1]) put("#f4f8ff", 2.4, 0.9, LEN, x + sd * (W / 2 + 0.6), y, 0);
  for (const z of zs) {
    // (the deck just under the cars' wheels)
    put("#96a3c0", W + 4, 0.38, 10, x, y, z);
    for (const sd of [-1, 1]) put("#eef2fa", W + 4, 1.5, 0.7, x, y, z + sd * 5.2);
  }
  const lamps = new THREE.InstancedMesh(GEO.box, glow("#ffc070"), zs.length * 4);
  zs.forEach((z, i) => {
    for (let k = 0; k < 4; k++) lamps.setMatrixAt(i * 4 + k, M.compose(P.set(x + (k % 2 ? 1 : -1) * (W / 2 - 2), y + 3.6, z + (k < 2 ? 5 : -5)), Q, S.set(0.9, 0.9, 0.9)));
  });
  // the skaters: bright jackets going round in long loops between two bridges
  const NS = 14;
  const sk = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), NS * 2);
  const who: { z: number; rx: number; rz: number; w: number; ph: number }[] = [];
  const jackets = ["#ff5a4a", "#ffd23f", "#3ec6ff", "#ff5fa2", "#8ee35b", "#ffffff"];
  for (let i = 0; i < NS; i++) {
    who.push({ z: -60 + Math.floor(R() * 4) * 40 + 20, rx: 4 + R() * 8, rz: 6 + R() * 7, w: (0.25 + R() * 0.35) * (R() < 0.5 ? -1 : 1), ph: R() * 6.28 });
    sk.setColorAt(i * 2, C.set(hz(jackets[i % jackets.length])));
    sk.setColorAt(i * 2 + 1, C.set(hz("#3a3350")));
  }
  for (const m of [ice, boxes, lamps, sk]) {
    m.userData.noShadow = true;
    m.frustumCulled = false;
    m.raycast = () => {};
    s.add(m);
  }
  const E = new THREE.Euler();
  let clk = 0;
  const tick = (dt: number) => {
    clk += dt;
    for (let i = 0; i < NS; i++) {
      const k = who[i];
      const a = k.ph + clk * k.w;
      const px = x + Math.cos(a) * k.rx,
        pz = k.z + Math.sin(a) * k.rz;
      // (leaning into the turn, facing where they glide)
      Q.setFromEuler(E.set(0, Math.atan2(-Math.sin(a) * k.rx * k.w, Math.cos(a) * k.rz * k.w), 0));
      sk.setMatrixAt(i * 2, M.compose(P.set(px, y + 1.5, pz), Q, S.set(1, 1.3, 0.8)));
      sk.setMatrixAt(i * 2 + 1, M.compose(P.set(px, y + 0.6, pz), Q, S.set(0.8, 0.9, 0.7)));
    }
    sk.instanceMatrix.needsUpdate = true;
  };
  tick(0);
  return tick;
}
