/**
 * HOT WALLET, level 1: NEON ROOFTOP. Golden hour on a ZStreet roof: a mint-tiled square inside
 * a neon parapet, four props to run round (the AC unit, the crates, the skylight, the chimney), the
 * stair house, the billboard and the radio mast behind; sixty metres below, the city at dusk (streets,
 * blocks with lit windows, traffic). No twist: the classic chase.
 */
import * as THREE from "three";
import { T } from "../../../i18n/lang";
import { FONT, lerp, rng } from "../../kit";
import { GEO, block, canvasTex, glow, outline, qBlock, skyDome, skyline, toon, toonSteps, zGlyph } from "../../k3";
import { Flock, Traffic, cityBelow, farRing, hazeSheets, neon, puffClouds, type Box, type Level, type LevelCtx, type Scenery } from "./common";

/** The roof's play area: a square this half wide (m). */
const HALF = 6.5;

/** What stands on the roof (boxes to run round): an AC unit, crates, a skylight, a chimney. */
const OBST: Box[] = [
  { x: -3.0, z: -2.6, hx: 0.95, hz: 0.72 },
  { x: 3.1, z: -2.5, hx: 1.1, hz: 0.55 },
  { x: -2.9, z: 2.9, hx: 1.0, hz: 0.75 },
  { x: 3.0, z: 3.0, hx: 0.55, hz: 0.55 },
];

/** The skyline at dusk: duller and darker than the roof we play on (the eye stays on the floor). */
const TOWERS = ["#b08a98", "#a07aa4", "#8a7eb8", "#b29490", "#8088bc", "#a88490"];
const BULBS = ["#ffd23f", "#ff5fc8", "#5ff2ff", "#ff8f3a", "#a0ff6a"];

// ---- the textures --------------------------------------------------------------------------------

/** The roof: mint tiles, a hazard band inside the parapet, the Q pad in the middle. */
function floorTex() {
  const S = HALF + 0.6;
  // (its wear from its own seed: the same roof on every screen)
  const rd = rng(0x700f4);
  return canvasTex(1024, 1024, (g) => {
    const k = 1024 / (2 * S);
    const P = (m: number) => (m + S) * k;
    for (let i = -8; i < 8; i++)
      for (let j = -8; j < 8; j++) {
        g.fillStyle = (i + j) & 1 ? "#86d9c0" : "#a3e8d2";
        g.fillRect(P(i), P(j), k, k);
      }
    // (wear: a few odd tiles, a soft shade on each, puddles holding the pink sky, a drain, scuffs)
    for (let n = 0; n < 26; n++) {
      const i = Math.floor(rd() * 14) - 7,
        j = Math.floor(rd() * 14) - 7;
      g.fillStyle = rd() < 0.5 ? "#79cdb3" : "#b4efdc";
      g.fillRect(P(i), P(j), k, k);
    }
    for (let i = -8; i < 8; i++)
      for (let j = -8; j < 8; j++) {
        const gr = g.createLinearGradient(P(i), P(j), P(i) + k, P(j) + k);
        gr.addColorStop(0, "rgba(255,255,255,0.16)");
        gr.addColorStop(1, "rgba(20,80,70,0.08)");
        g.fillStyle = gr;
        g.fillRect(P(i) + 2, P(j) + 2, k - 4, k - 4);
      }
    g.strokeStyle = "rgba(30,100,90,0.35)";
    g.lineWidth = 3;
    for (let i = -8; i <= 8; i++) {
      g.beginPath();
      g.moveTo(P(i), 0);
      g.lineTo(P(i), 1024);
      g.moveTo(0, P(i));
      g.lineTo(1024, P(i));
      g.stroke();
    }
    for (const [x, z, rx, rz] of [
      [-4.9, 0.4, 0.9, 0.45],
      [1.3, 4.9, 0.7, 0.35],
      [4.8, -0.6, 0.55, 0.3],
      [-1.2, -4.6, 0.6, 0.28],
    ]) {
      const gr = g.createRadialGradient(P(x), P(z), 2, P(x), P(z), rx * k);
      gr.addColorStop(0, "rgba(255,190,220,0.75)");
      gr.addColorStop(0.7, "rgba(190,170,255,0.45)");
      gr.addColorStop(1, "rgba(160,200,255,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(P(x), P(z), rx * k, rz * k, 0.3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.5)";
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(P(x) - rx * k * 0.25, P(z) - rz * k * 0.3, rx * k * 0.35, rz * k * 0.18, 0.3, 0, Math.PI);
      g.stroke();
    }
    g.fillStyle = "#3e5a6a";
    g.beginPath();
    g.arc(P(5.3), P(5.2), 0.32 * k, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#9fb8c4";
    g.lineWidth = 4;
    for (let d = -0.2; d <= 0.2; d += 0.1) ((g.beginPath(), g.moveTo(P(5.3 + d), P(5.0)), g.lineTo(P(5.3 + d), P(5.4))), g.stroke());
    g.strokeStyle = "rgba(40,60,70,0.18)";
    g.lineWidth = 6;
    for (let n = 0; n < 10; n++) {
      const x = (rd() - 0.5) * 10,
        z = (rd() - 0.5) * 10;
      g.beginPath();
      g.moveTo(P(x), P(z));
      g.quadraticCurveTo(P(x + 0.4), P(z + 0.2), P(x + 0.8), P(z - 0.1));
      g.stroke();
    }
    // the hazard band along the parapet
    g.save();
    g.beginPath();
    g.rect(P(-HALF), P(-HALF), 2 * HALF * k, 2 * HALF * k);
    g.rect(P(-HALF + 0.42), P(-HALF + 0.42), 2 * (HALF - 0.42) * k, 2 * (HALF - 0.42) * k);
    g.clip("evenodd");
    g.fillStyle = "#2c2a63";
    g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = "#ffd23f";
    g.lineWidth = 0.17 * k;
    for (let x = -1024; x < 2048; x += 0.5 * k) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 1024, 1024);
      g.stroke();
    }
    g.restore();
    // the pad
    const c = 512;
    g.fillStyle = "rgba(20,20,60,0.18)";
    g.beginPath();
    g.arc(c, c + 0.1 * k, 2.55 * k, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2c2a63";
    g.beginPath();
    g.arc(c, c, 2.45 * k, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#ff6b35";
    g.lineWidth = 0.2 * k;
    g.beginPath();
    g.arc(c, c, 2.12 * k, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "#ffffff";
    g.lineWidth = 0.08 * k;
    g.setLineDash([0.3 * k, 0.22 * k]);
    g.beginPath();
    g.arc(c, c, 1.8 * k, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    zGlyph(g, c + 0.08 * k, c + 0.08 * k, 2.3 * k, "#9a3f12");
    zGlyph(g, c, c, 2.3 * k, "#ffd23f");
  });
}

/** The tower's walls under the roof: warm brick with windows, lit and not. */
function facadeTex() {
  const rd = rng(0x700f5);
  const t = canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = "#e88a5e";
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = "#d27449";
      for (let y = 0; y < 256; y += 64) g.fillRect(0, y + 56, 256, 8);
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const lit = rd() < 0.45;
          g.fillStyle = "#fbd7b5";
          g.fillRect(x * 64 + 10, y * 64 + 8, 44, 42);
          g.fillStyle = lit ? "#ffd98a" : "#3a3466";
          g.fillRect(x * 64 + 13, y * 64 + 11, 38, 36);
          g.fillStyle = lit ? "#ffeec4" : "#4d4783";
          g.fillRect(x * 64 + 13, y * 64 + 11, 38, 6);
        }
    },
    true,
  );
  t.repeat.set(4, 14);
  return t;
}

/** A crate's side: planks, a frame, a stencilled Z. */
function crateTex() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = "#e0a35c";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#c98a45";
    for (let y = 0; y < 128; y += 32) g.fillRect(0, y + 29, 128, 3);
    g.fillStyle = "#9c6230";
    g.fillRect(0, 0, 128, 14);
    g.fillRect(0, 114, 128, 14);
    g.fillRect(0, 0, 14, 128);
    g.fillRect(114, 0, 14, 128);
    zGlyph(g, 64, 64, 66, "rgba(110,60,20,0.55)");
  });
}

/** Red brick for the chimney. */
function brickTex() {
  const t = canvasTex(
    64,
    64,
    (g) => {
      g.fillStyle = "#f1d6c0";
      g.fillRect(0, 0, 64, 64);
      for (let r = 0; r < 4; r++)
        for (let c = -1; c < 3; c++) {
          g.fillStyle = (r + c) % 3 ? "#d4553c" : "#c24632";
          g.fillRect(c * 32 + (r % 2) * 16 + 2, r * 16 + 2, 28, 12);
        }
    },
    true,
  );
  t.repeat.set(1.5, 3);
  return t;
}

/** The billboard: HOT WALLET in neon over a flaming wallet. */
function billboardTex() {
  return canvasTex(1024, 400, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 400);
    gr.addColorStop(0, "#2a1450");
    gr.addColorStop(1, "#160b30");
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 400);
    g.shadowColor = "#ff6b35";
    g.strokeStyle = "#ff6b35";
    g.lineWidth = 10;
    g.shadowBlur = 24;
    g.beginPath();
    g.roundRect(22, 22, 980, 356, 26);
    g.stroke();
    // the wallet and its flame
    g.save();
    g.translate(190, 210);
    g.shadowColor = "#ffd23f";
    g.shadowBlur = 30;
    g.fillStyle = "#ffd23f";
    g.beginPath();
    g.moveTo(-70, -40);
    g.quadraticCurveTo(-80, -120, -20, -160);
    g.quadraticCurveTo(-30, -100, 10, -90);
    g.quadraticCurveTo(10, -150, 60, -170);
    g.quadraticCurveTo(40, -110, 80, -40);
    g.closePath();
    g.fill();
    g.shadowColor = "#ff6b35";
    g.fillStyle = "#ff6b35";
    g.beginPath();
    g.roundRect(-100, -60, 200, 140, 22);
    g.fill();
    g.fillStyle = "#c2401b";
    g.beginPath();
    g.roundRect(-104, -60, 208, 62, 18);
    g.fill();
    g.fillStyle = "#ffd23f";
    g.beginPath();
    g.roundRect(-24, -14, 48, 44, 10);
    g.fill();
    g.restore();
    g.font = `900 ${T("128px", "150px")} ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const s = T("HOT", "烫手");
    const s2 = T("WALLET", "钱包");
    g.shadowColor = "#ff5fc8";
    g.fillStyle = "#ff5fc8";
    for (const b of [32, 12]) ((g.shadowBlur = b), g.fillText(s, 610, 128));
    g.shadowColor = "#5ff2ff";
    g.fillStyle = "#5ff2ff";
    for (const b of [32, 12]) ((g.shadowBlur = b), g.fillText(s2, 610, 272));
    g.shadowBlur = 0;
    g.globalAlpha = 0.5;
    g.fillStyle = "#fff";
    g.fillText(s, 610, 128);
    g.fillText(s2, 610, 272);
  });
}

/** The airship's banner: a slogan of the city. */
function bannerTex() {
  return canvasTex(1024, 170, (g) => {
    g.fillStyle = "#fff4e0";
    g.fillRect(0, 0, 1024, 170);
    g.fillStyle = "#ff6b35";
    g.fillRect(0, 0, 1024, 16);
    g.fillRect(0, 154, 1024, 16);
    g.font = `900 ${T("96px", "104px")} ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#2c2a63";
    g.fillText(T("NU7 IS A HOLIDAY", "NU7 是节日"), 512, 92);
  });
}

// ---- the build -----------------------------------------------------------------------------------

function build({ scene: s, w, rnd, fx }: LevelCtx): Scenery {
  // a golden-hour light: a warm sun low on the left (its shadows fall across the floor to the right,
  // none of the backdrop's onto it), a violet fill from the sky
  w.sun.color.set("#ffdcae");
  w.sun.intensity = 2.5;
  w.sun.position.set(-40, 34, -5);
  w.hemi.color.set("#ffe6f2");
  w.hemi.groundColor.set("#6a5a8a");
  w.hemi.intensity = 1.8;
  const m4 = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const s4 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const col = new THREE.Color();
  const qs: THREE.Mesh[] = [];
  const signs: THREE.MeshBasicMaterial[] = [];
  let fan!: THREE.Group;
  let beacon!: THREE.Mesh;
  let bulbs!: THREE.InstancedMesh;
  let bulbN = 0;
  // the roof
  {
    const S = HALF + 0.6;
    const facade = facadeTex();
    const wall = new THREE.MeshToonMaterial({ map: facade, gradientMap: toonSteps() });
    const top = new THREE.MeshToonMaterial({ map: floorTex(), gradientMap: toonSteps() });
    const slab = new THREE.Mesh(GEO.box, [wall, wall, top, wall, wall, wall]);
    slab.scale.set(2 * S, 1, 2 * S);
    slab.position.y = -0.5;
    s.add(slab);
    const tower = new THREE.Mesh(GEO.box, wall);
    tower.scale.set(2 * S - 0.3, 60, 2 * S - 0.3);
    tower.position.y = -31;
    s.add(tower);
    outline(block("#fff1dc", 2 * S + 0.5, 0.35, 2 * S + 0.5, 0, -0.9, 0, s), 0.05);
    // the parapet: cream walls with a neon strip on top (pink at the back, cyan on the sides)
    const L = 2 * (HALF + 0.5);
    const sides: [number, number, number, number, number, string][] = [
      [0, -(HALF + 0.25), L, 0.5, 0.75, "#ff5fc8"],
      [-(HALF + 0.25), 0, 0.5, L, 0.75, "#5ff2ff"],
      [HALF + 0.25, 0, 0.5, L, 0.75, "#5ff2ff"],
      [0, HALF + 0.25, L, 0.5, 0.5, "#ffd23f"],
    ];
    for (const [x, z, w, d, h, c] of sides) {
      outline(block("#fbe6c8", w, h, d, x, h / 2, z, s), 0.04);
      block(c, w === 0.5 ? 0.14 : w - 0.4, 0.07, d === 0.5 ? 0.14 : d - 0.4, x, h + 0.04, z, s, glow(c));
    }
    // corner posts with spinning Z-Blocks over them
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const px = x * (HALF + 0.25),
        pz = z * (HALF + 0.25);
      outline(block("#ff8f6b", 0.8, z < 0 ? 1.2 : 0.62, 0.8, px, z < 0 ? 0.6 : 0.31, pz, s), 0.04);
      if (z > 0) continue;
      const q = qBlock(0.62);
      q.position.set(px, 2.0, pz);
      s.add(q);
      qs.push(q);
    }
  }

  // the props
  {
    // the AC unit, its fan spinning
    {
      const o = OBST[0];
      const g = new THREE.Group();
      g.position.set(o.x, 0, o.z);
      outline(block("#dde6f2", o.hx * 2, 1.15, o.hz * 2, 0, 0.62, 0, g), 0.05);
      block("#6f7a92", o.hx * 2 + 0.12, 0.1, o.hz * 2 + 0.12, 0, 0.05, 0, g);
      const grille = canvasTex(64, 64, (c) => {
        c.fillStyle = "#b9c4d6";
        c.fillRect(0, 0, 64, 64);
        c.fillStyle = "#7d889e";
        for (let y = 4; y < 64; y += 10) c.fillRect(4, y, 56, 5);
      });
      const gm = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: grille, gradientMap: toonSteps() }));
      gm.scale.set(o.hx * 2 - 0.3, 0.8, 1);
      gm.position.set(0, 0.62, o.hz + 0.01);
      g.add(gm);
      const hous = new THREE.Mesh(GEO.cyl, toon("#465066"));
      hous.scale.set(1.05, 0.12, 1.05);
      hous.position.set(0, 1.25, 0);
      g.add(hous);
      fan = new THREE.Group();
      fan.position.set(0, 1.33, 0);
      block("#e8eef7", 0.92, 0.04, 0.16, 0, 0, 0, fan);
      block("#e8eef7", 0.16, 0.04, 0.92, 0, 0, 0, fan);
      g.add(fan);
      s.add(g);
    }
    // crates: two side by side, one on top
    {
      const o = OBST[1];
      const cm = new THREE.MeshToonMaterial({ map: crateTex(), gradientMap: toonSteps() });
      const c1 = block("", 1.1, 1.1, 1.1, o.x - 0.55, 0.55, o.z, s, cm);
      const c2 = block("", 1.1, 1.1, 1.1, o.x + 0.55, 0.55, o.z, s, cm);
      const c3 = block("", 1.0, 1.0, 1.0, o.x + 0.25, 1.6, o.z, s, cm);
      c2.rotation.y = 0.05;
      c3.rotation.y = -0.22;
      for (const c of [c1, c2, c3]) outline(c, 0.04);
    }
    // the skylight, lit from inside
    {
      const o = OBST[2];
      outline(block("#4b3f8a", o.hx * 2, 0.5, o.hz * 2, o.x, 0.25, o.z, s), 0.05);
      block("#a6f6ff", o.hx * 2 - 0.3, 0.06, o.hz * 2 - 0.3, o.x, 0.51, o.z, s, glow("#a6f6ff"));
      block("#4b3f8a", 0.1, 0.08, o.hz * 2 - 0.2, o.x, 0.55, o.z, s);
      block("#4b3f8a", o.hx * 2 - 0.2, 0.08, 0.1, o.x, 0.55, o.z, s);
    }
    // the chimney
    {
      const o = OBST[3];
      const bm = new THREE.MeshToonMaterial({ map: brickTex(), gradientMap: toonSteps() });
      outline(block("", o.hx * 2, 2.0, o.hz * 2, o.x, 1.0, o.z, s, bm), 0.05);
      outline(block("#3b3550", o.hx * 2 + 0.25, 0.22, o.hz * 2 + 0.25, o.x, 2.08, o.z, s), 0.04);
    }
  }

  // the backdrop
  {
    const back = -(HALF + 0.5);
    // the stair house (back left) with its neon sign, a water tower on it
    outline(block("#f6c896", 4.6, 3.4, 2.6, -4.3, 1.7, back - 1.5, s), 0.05);
    outline(block("#c85a3c", 5.0, 0.3, 3.0, -4.3, 3.55, back - 1.5, s), 0.04);
    block("#3a2f5a", 1.1, 2.0, 0.1, -5.4, 1.0, back - 0.18, s);
    const qs = neon("ZSTREET", "#ff5fc8", 2.6, 0.8, 108);
    qs.position.set(-3.6, 2.5, back - 0.17);
    s.add(qs);
    signs.push(qs.material as THREE.MeshBasicMaterial);
    {
      const g = new THREE.Group();
      g.position.set(-4.6, 3.7, back - 1.6);
      for (const [x, z] of [
        [-0.8, -0.6],
        [0.8, -0.6],
        [-0.8, 0.6],
        [0.8, 0.6],
      ])
        block("#5a4a6a", 0.12, 1.4, 0.12, x, 0.7, z, g);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 2.0, 18), toon("#c07a4c"));
      tank.position.y = 2.4;
      g.add(tank);
      for (const y of [1.75, 2.4, 3.05]) {
        const band = new THREE.Mesh(GEO.cyl, toon("#5a4a6a"));
        band.scale.set(2.36, 0.08, 2.36);
        band.position.y = y;
        g.add(band);
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.9, 18), toon("#8a4a3a"));
      roof.position.y = 3.85;
      g.add(roof);
      s.add(g);
    }
    // the billboard (back right) on its scaffold
    {
      const g = new THREE.Group();
      g.position.set(3.4, 0, back - 1.4);
      block("#5a4a6a", 0.25, 3.0, 0.25, -2.2, 1.5, 0, g);
      block("#5a4a6a", 0.25, 3.0, 0.25, 2.2, 1.5, 0, g);
      block("#5a4a6a", 4.8, 0.14, 0.14, 0, 1.6, 0, g);
      outline(block("#2a1f45", 6.4, 2.7, 0.3, 0, 4.2, 0, g), 0.05);
      const face = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: billboardTex() }));
      face.scale.set(6.1, 2.4, 1);
      face.position.set(0, 4.2, 0.16);
      g.add(face);
      signs.push(face.material as THREE.MeshBasicMaterial);
      block("#5a4a6a", 6.6, 0.12, 0.9, 0, 2.8, 0.45, g);
      s.add(g);
    }
    // the radio mast with its blinking light
    block("#6a5a7a", 0.14, 7, 0.14, 7.4, 3.5, back - 1.0, s);
    beacon = new THREE.Mesh(GEO.ball, glow("#ff3030"));
    beacon.scale.setScalar(0.32);
    beacon.position.set(7.4, 7.1, back - 1.0);
    s.add(beacon);
    // a round neon ⓩ on the east side
    const rq = neon("Z", "#ffd23f", 1.5, 1.5, 270, true);
    rq.position.set(HALF + 1.2, 2.8, -1.5);
    rq.rotation.y = -Math.PI / 2 + 0.5;
    s.add(rq);
    block("#5a4a6a", 0.12, 2.2, 0.12, HALF + 1.2, 1.1, -1.5, s);
    signs.push(rq.material as THREE.MeshBasicMaterial);
    // string lights: across the back, then down both sides (on little posts)
    const runs: [number, number, number, number, number, number][] = [
      [-HALF - 0.25, 2.2, back, HALF + 0.25, 2.2, back],
      [-HALF - 0.25, 2.2, back, -HALF - 0.25, 1.4, HALF + 0.25],
      [HALF + 0.25, 2.2, back, HALF + 0.25, 1.4, HALF + 0.25],
    ];
    const per = 26;
    bulbs = new THREE.InstancedMesh(GEO.ball, glow("#ffffff"), runs.length * per);
    let n = 0;
    for (const [x0, y0, z0, x1, y1, z1] of runs) {
      for (let i = 0; i < per; i++) {
        const u = i / (per - 1);
        const sag = Math.sin(u * Math.PI * 3) ** 2 * 0.35;
        m4.compose(v1.set(lerp(x0, x1, u), lerp(y0, y1, u) - sag, lerp(z0, z1, u)), q4.identity(), s4.setScalar(0.16));
        bulbs.setMatrixAt(n, m4);
        bulbs.setColorAt(n, col.set(BULBS[n % BULBS.length]));
        n++;
      }
    }
    bulbN = n;
    s.add(bulbs);
    for (const [x, z, h] of [
      [-HALF - 0.25, -HALF / 3, 2.0],
      [-HALF - 0.25, HALF / 3, 1.7],
      [HALF + 0.25, -HALF / 3, 2.0],
      [HALF + 0.25, HALF / 3, 1.7],
    ])
      block("#5a4a6a", 0.08, h, 0.08, x, h / 2, z, s);
  }
  const sky = skyline(s, { r: 105, n: 64, y: -60, rnd, tall: 1.35 });
  for (let i = 0; i < 64; i++) sky.setColorAt(i, col.set(TOWERS[i % TOWERS.length]));
  if (sky.instanceColor) sky.instanceColor.needsUpdate = true;
  sky.userData.noShadow = true;
  puffClouds(s, { n: 5, r: 120, y: 6, rnd, color: "#ffd6e6" }).userData.noShadow = true;
  // the sky all round (the fly-over and the low cameras see the horizon): the sun low on the left, where the light comes from
  skyDome(s, { sky: ["#3a2a9a", "#ff9f7a"], clouds: 12, cloud: "#ffdbe4", cloudShade: "#d48aa6", disc: { az: 353, el: 11, color: "#ffeab8", size: 10, glow: 6 }, haze: 0.5, rnd: rng(0x700f) });
  // the city under the roof: streets and lots, the blocks round our tower, traffic at dusk, a last ring
  // of silhouettes in the haze
  cityBelow(s, {
    y: -61,
    seed: 0x700f1,
    street: "#4a3a78",
    mark: "#e8b488",
    lots: ["#7e5a8c", "#8a628c", "#74568e", "#906a8a"],
    roofs: ["#c08a84", "#b47a8e", "#a878a4", "#cc9c8c", "#9a82bc"],
    shade: "#2e1e56",
    park: ["#5f9a7e", "#447f6c"],
    parkK: 0.12,
    lamp: "rgba(255,196,120,0.7)",
    walls: ["#94708e", "#866a9a", "#7868a6", "#987a86", "#8a6c90"],
    tops: ["#a47c90", "#9072a0", "#8272ac", "#aa8a8c", "#96707e"],
    h: [10, 46],
    out: 3,
    empty: 0.3,
    frame: "#ffffff",
    pane: "#6f5ea0",
    lit: "#ffe6a8",
    litK: 0.42,
    glowK: 0.55,
    sun: [0.99, 0.12],
  });
  const traffic = new Traffic(s, 44, -61, { seed: 0x700f2, out: 4, colors: ["#fff4e0", "#ffd23f", "#ff6b5a", "#5fd0ff", "#c9b6e8"], lamps: true });
  farRing(s, { seed: 0x700f3, r: 168, n: 44, y: -61, h: [30, 115], color: "#8a5c9c" });
  // (the dusk's violet air under the roof: the city a step down in tone, the warm roof on top of it)
  hazeSheets(s, [-9, -22, -38], "#5b3f9a", 0.13);

  // the life round the roof: an airship trailing a banner, two drones, planters, the towers' beacons, birds
  const ship = new THREE.Group();
  {
    const hull = new THREE.Mesh(GEO.ball, toon("#f4eefa"));
    hull.scale.set(10, 3.2, 3.2);
    outline(hull, 0.06);
    ship.add(hull);
    const stripe = new THREE.Mesh(GEO.ball, toon("#ff6b35"));
    stripe.scale.set(9.4, 1.0, 3.28);
    ship.add(stripe);
    block("#3b3550", 2.2, 0.7, 0.9, 0, -1.9, 0, ship);
    const fins = new THREE.InstancedMesh(GEO.box, toon("#ff6b35"), 3);
    [
      [1.1, 0, 1.6, 1.6, 0.15],
      [0, 1.1, 1.6, 0.15, 1.6],
      [0, -1.1, 1.6, 0.15, 1.6],
    ].forEach(([y, z, w, h, d], i) => fins.setMatrixAt(i, m4.compose(v1.set(-5.2, y, z), q4.identity(), s4.set(w, h, d))));
    ship.add(fins);
    const ban = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: bannerTex(), side: THREE.DoubleSide }));
    ban.scale.set(9, 1.5, 1);
    ban.position.set(-11.5, -0.4, 0);
    ship.add(ban);
  }
  ship.position.set(0, -24, -60);
  s.add(ship);
  const drones = new THREE.InstancedMesh(GEO.box, toon("#3b3550"), 2);
  const props = new THREE.InstancedMesh(GEO.cyl, glow("#d8def0", 0.55), 8);
  const dLights = new THREE.InstancedMesh(GEO.ball, glow("#ffffff"), 2);
  s.add(drones, props, dLights);
  const dAt = [
    [-HALF - 1.6, 3.6, -HALF + 1.4],
    [HALF + 1.8, 4.2, 1.2],
  ];
  const pots = new THREE.InstancedMesh(GEO.box, toon("#c8643c"), 6);
  const bushes = new THREE.InstancedMesh(GEO.ball, toon("#5fbf5a", "#0a2a08"), 6);
  for (let i = 0; i < 6; i++) {
    const sd = i < 3 ? -1 : 1;
    const z = -3.6 + (i % 3) * 3.6;
    m4.compose(v1.set(sd * (HALF + 0.25), 0.95, z), q4.identity(), s4.set(0.45, 0.42, 0.45));
    pots.setMatrixAt(i, m4);
    m4.compose(v1.set(sd * (HALF + 0.25), 1.35, z), q4.identity(), s4.set(0.62, 0.55, 0.62));
    bushes.setMatrixAt(i, m4);
  }
  s.add(pots, bushes);
  // (a red beacon on the tallest towers of the skyline)
  const tops: THREE.Vector3[] = [];
  for (let i = 0; i < 64; i++) {
    sky.getMatrixAt(i, m4);
    m4.decompose(v1, q4, s4);
    if (s4.y > 60) tops.push(new THREE.Vector3(v1.x, v1.y + s4.y / 2 + 0.8, v1.z));
  }
  const beacons = new THREE.InstancedMesh(GEO.ball, glow("#ff3030"), Math.max(1, tops.length));
  tops.forEach((p, i) => beacons.setMatrixAt(i, m4.compose(p, q4.identity(), s4.setScalar(1.6))));
  beacons.count = tops.length;
  s.add(beacons);
  const birds = new Flock(s, 9, new THREE.Vector3(14, -10, -46), 16, "#4a3466", 1.6);

  const chimneyTop = new THREE.Vector3(OBST[3].x, 2.35, OBST[3].z);
  let smokeIn = 0;
  let bulbStep = -1;
  return {
    tick(dt, live) {
      const t = live.t;
      traffic.tick(t);
      ship.position.x = ((t * 1.6 + 40) % 150) - 75;
      ship.position.y = -24 + Math.sin(t * 0.4) * 0.6;
      ship.rotation.z = Math.sin(t * 0.3) * 0.03;
      for (let i = 0; i < 2; i++) {
        const [x, y, z] = dAt[i];
        const px = x + Math.sin(t * 0.5 + i * 2) * 0.6,
          py = y + Math.sin(t * 1.7 + i) * 0.25,
          pz = z + Math.cos(t * 0.4 + i) * 0.8;
        drones.setMatrixAt(i, m4.compose(v1.set(px, py, pz), q4.setFromAxisAngle(s4.set(0, 1, 0), t * 0.3 + i), s4.set(0.6, 0.18, 0.6)));
        for (let k = 0; k < 4; k++) {
          const ox = k & 1 ? 0.38 : -0.38,
            oz = k & 2 ? 0.38 : -0.38;
          props.setMatrixAt(i * 4 + k, m4.compose(v1.set(px + ox, py + 0.12, pz + oz), q4.identity(), s4.set(0.42, 0.02, 0.42)));
        }
        dLights.setMatrixAt(i, m4.compose(v1.set(px, py - 0.14, pz), q4.identity(), s4.setScalar(Math.floor(t * 2 + i) % 2 ? 0.16 : 0.05)));
        dLights.setColorAt(i, col.set(i ? "#5ff2ff" : "#ff5fc8"));
      }
      drones.instanceMatrix.needsUpdate = props.instanceMatrix.needsUpdate = dLights.instanceMatrix.needsUpdate = true;
      if (dLights.instanceColor) dLights.instanceColor.needsUpdate = true;
      beacons.visible = Math.floor(t * 1.2) % 2 === 0;
      birds.tick(t);
      fan.rotation.y += dt * 9;
      qs.forEach((q, i) => {
        q.rotation.y = t * 1.4 + i;
        q.position.y = 2.0 + Math.sin(t * 2 + i) * 0.1;
      });
      beacon.visible = Math.floor(t * 1.5) % 2 === 0;
      // the bulbs chase (four times a second)
      const step = Math.floor(t * 4);
      if (step !== bulbStep) {
        bulbStep = step;
        for (let i = 0; i < bulbN; i++) {
          col.set(BULBS[(i + step) % BULBS.length]);
          if ((i + step) % 3 === 0) col.multiplyScalar(0.45);
          bulbs.setColorAt(i, col);
        }
        if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
      }
      // a sign flickers now and then
      for (let i = 0; i < signs.length; i++) {
        // (a stutter from the clock, never Math.random: the scenery leaves the sim's streams alone)
        const f = Math.sin(t * 0.7 + i * 2.1) > 0.97 && (Math.floor(t * 24) * 7 + i) % 3 === 0 ? 0.35 : 1;
        signs[i].color.setScalar(f);
      }
      smokeIn -= dt;
      if (smokeIn <= 0) {
        smokeIn = 0.32;
        fx.burst(chimneyTop, 1, ["#efe8f5", "#d6cce2"], { speed: 0.5, up: 0.7, gravity: -1.0, size: 0.26, life: 1.8, drag: 1 });
      }
    },
  };
}

const ring = (r: number, n: number, a0: number): [number, number][] => Array.from({ length: n }, (_, i) => [Math.sin((i / n) * Math.PI * 2 + a0) * r, Math.cos((i / n) * Math.PI * 2 + a0) * r]);

export const ROOF: Level = {
  key: "roof",
  title: "NEON ROOFTOP",
  titleZh: "霓虹天台",
  tag: "Golden hour over the city: run round the AC, the crates and the chimney",
  tagZh: "城市黄昏的天台：绕着空调、木箱和烟囱跑",
  ambience: "city-day",
  rect: [HALF, HALF],
  obst: OBST,
  starts: ring(3.6, 4, Math.PI / 4),
  spots: [...ring(4.3, 8, 0), [0, 0]],
  cam: { y: 12.9, z: 13.6, px: 1.6, pz: 1.4, orbit: [19, 10.5] },
  sky: ["#3f2a9e", "#ff9f7a"],
  fog: [52, 215],
  build,
};
