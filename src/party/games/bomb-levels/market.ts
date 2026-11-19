/**
 * HOT WALLET, level 2: HAWKER NIGHT. ZStreet's hawker centre, a round rooftop over Marina Bay at night:
 * lanterns strung from the satay kiosk in the middle, stalls round the edge; below, the bay in its
 * basin (boats, the quays' lamps on the water), the garden with its light-trees and the Ferris wheel,
 * the three towers with their sky deck, the lit city all round. Its twist: a turntable ring in the floor round
 * the kiosk carries you round (ride it to close in, or to get away); now and then it flips its way,
 * warned (its arrows blink amber with a buzzer, it slows to a stop, then turns back the other way).
 */
import * as THREE from "three";
import { T } from "../../../i18n/lang";
import { rng } from "../../kit";
import { GEO, block, canvasTex, glow, outline, skyDome, skyline, toon, toonSteps } from "../../k3";
import { Traffic, cityBelow, farRing, lightPools, neon, type Box, type Level, type LevelCtx, type Scenery } from "./common";

/** The plaza's radius; the turntable ring (inner, outer radius). */
const R = 7;
const R0 = 2.3;
const R1 = 3.8;

const OBST: Box[] = [
  // the satay kiosk in the middle
  { x: 0, z: 0, hx: 0.85, hz: 0.85, r: 0.85 },
  // the stalls against the kerb (no way round behind them): laksa (back), kopi (east), chilli crab (west)
  { x: 0, z: -5.95, hx: 1.05, hz: 0.55 },
  { x: 5.95, z: 0, hx: 0.55, hz: 1.05 },
  { x: -5.95, z: 0, hx: 0.55, hz: 1.05 },
  // a round table with its stools (front)
  { x: 0, z: 5.1, hx: 0.6, hz: 0.6, r: 0.6 },
];

const LANTERNS = ["#ff3b2f", "#ff5a1f", "#ff3b2f", "#ffa23a"];
const TOWERS = ["#4a3f8a", "#3a356e", "#5a4a9a", "#46407a", "#6a4a8a"];
const CABINS = ["#ff5fc8", "#5ff2ff", "#ffd23f", "#a0ff6a", "#ff8f3a"];
const C_GO = new THREE.Color("#7ff7ff");
const C_WARN = new THREE.Color("#ffb52e");

// ---- the textures --------------------------------------------------------------------------------

/** The plaza's floor (seen from above, back at the top): warm terracotta tiles, a mosaic round the kiosk, the hazard band at the rim. */
function floorTex() {
  const S = R + 0.6;
  return canvasTex(1024, 1024, (g) => {
    const k = 1024 / (2 * S);
    const c = 512;
    g.fillStyle = "#f2d6ae";
    g.fillRect(0, 0, 1024, 1024);
    // tiles: a checker of warm squares
    for (let i = -8; i < 8; i++)
      for (let j = -8; j < 8; j++) {
        g.fillStyle = (i + j) & 1 ? "#f0b98a" : "#f7d3a8";
        g.fillRect(c + i * k, c + j * k, k, k);
      }
    g.strokeStyle = "rgba(140,70,40,0.35)";
    g.lineWidth = 3;
    for (let i = -8; i <= 8; i++) {
      g.beginPath();
      g.moveTo(c + i * k, 0);
      g.lineTo(c + i * k, 1024);
      g.moveTo(0, c + i * k);
      g.lineTo(1024, c + i * k);
      g.stroke();
    }
    // the mosaic round the kiosk (the turntable covers the ring beyond it)
    g.fillStyle = "#3f8f9a";
    g.beginPath();
    g.arc(c, c, R0 * k, 0, Math.PI * 2);
    g.fill();
    for (let n = 0; n < 24; n++) {
      const a = (n / 24) * Math.PI * 2;
      g.fillStyle = n % 2 ? "#ffd23f" : "#ff6b5a";
      g.beginPath();
      g.arc(c + Math.cos(a) * (R0 - 0.35) * k, c + Math.sin(a) * (R0 - 0.35) * k, 0.16 * k, 0, Math.PI * 2);
      g.fill();
    }
    // the rim: a dark band with yellow dashes inside the kerb
    g.save();
    g.beginPath();
    g.arc(c, c, S * k, 0, Math.PI * 2);
    g.arc(c, c, (R - 0.4) * k, 0, Math.PI * 2, true);
    g.clip();
    g.fillStyle = "#2c2a63";
    g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = "#ffd23f";
    g.lineWidth = 0.16 * k;
    g.setLineDash([0.35 * k, 0.3 * k]);
    g.beginPath();
    g.arc(c, c, (R - 0.2) * k, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  });
}

/** The turntable: dark rubber, two lane lines, glowing chevrons all pointing one way round. */
function beltTex() {
  return canvasTex(1024, 1024, (g) => {
    const c = 512;
    const k = 512 / R1;
    g.fillStyle = "#2a2346";
    g.fillRect(0, 0, 1024, 1024);
    // rubber ribs
    g.strokeStyle = "rgba(255,255,255,0.06)";
    g.lineWidth = 4;
    for (let n = 0; n < 72; n++) {
      const a = (n / 72) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * R0 * k, c + Math.sin(a) * R0 * k);
      g.lineTo(c + Math.cos(a) * R1 * k, c + Math.sin(a) * R1 * k);
      g.stroke();
    }
    // the chevrons (white: the material tints them cyan, or amber before a flip); they point toward a
    // falling canvas angle, the way the ring turns for a positive spin
    const rm = ((R0 + R1) / 2) * k;
    const s = 0.42 * k;
    for (let n = 0; n < 14; n++) {
      const a = (n / 14) * Math.PI * 2;
      g.save();
      g.translate(c + Math.cos(a) * rm, c + Math.sin(a) * rm);
      g.rotate(a - Math.PI / 2);
      g.fillStyle = "#ffffff";
      for (const o of [-0.55, 0.15]) {
        g.beginPath();
        g.moveTo((o + 0.5) * s, 0);
        g.lineTo(o * s, -0.9 * s);
        g.lineTo((o - 0.35) * s, -0.9 * s);
        g.lineTo((o + 0.15) * s, 0);
        g.lineTo((o - 0.35) * s, 0.9 * s);
        g.lineTo(o * s, 0.9 * s);
        g.closePath();
        g.fill();
      }
      g.restore();
    }
  });
}

/** An awning's stripes. */
function awningTex(a: string, b: string) {
  return canvasTex(128, 32, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect(i * 16, 0, 16, 32);
    }
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(0, 26, 128, 6);
  });
}

/** A stall's menu board: dishes in bright pictures, prices in ⓩ. */
function menuTex() {
  return canvasTex(256, 160, (g) => {
    g.fillStyle = "#2a2046";
    g.fillRect(0, 0, 256, 160);
    g.strokeStyle = "#ffd23f";
    g.lineWidth = 6;
    g.strokeRect(6, 6, 244, 148);
    const dish = ["#ff8a3a", "#ffe08a", "#ff5a5a", "#8ae06a", "#ffd23f", "#e8a070"];
    for (let i = 0; i < 6; i++) {
      const x = 28 + (i % 3) * 78,
        y = 22 + Math.floor(i / 3) * 66;
      g.fillStyle = "#fff4e0";
      g.beginPath();
      g.arc(x + 20, y + 20, 19, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = dish[i];
      g.beginPath();
      g.arc(x + 20, y + 20, 13, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffffff";
      g.fillRect(x + 4, y + 46, 34, 7);
      g.fillStyle = "#ffd23f";
      g.fillRect(x + 42, y + 46, 12, 7);
    }
  });
}

/** Lit windows on a dark tower (tinted by the material). */
function windowsTex() {
  const rd = rng(0xba71);
  const t = canvasTex(
    64,
    128,
    (g) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 64, 128);
      for (let y = 4; y < 128; y += 8)
        for (let x = 4; x < 64; x += 8) {
          g.fillStyle = rd() < 0.55 ? "#ffe9b0" : "#3a3260";
          g.fillRect(x, y, 4, 5);
        }
    },
    true,
  );
  t.repeat.set(2, 6);
  return t;
}

/** The bay at night: dark water, short ripples catching the city's lights (it tiles; the level drifts it). */
function waterTex() {
  const rd = rng(0xba72);
  return canvasTex(
    512,
    512,
    (g) => {
      g.fillStyle = "#151348";
      g.fillRect(0, 0, 512, 512);
      const dash = (c: string, w0: number, w1: number, h: number) => {
        const x = rd() * 512,
          y = Math.floor(rd() * 512),
          w = w0 + rd() * (w1 - w0);
        g.fillStyle = c;
        g.fillRect(x, y, w, h);
        if (x + w > 512) g.fillRect(x - 512, y, w, h);
      };
      for (let i = 0; i < 150; i++) dash(i % 2 ? "#1f1d62" : "#0f0d38", 18, 60, 3);
      for (let i = 0; i < 80; i++) dash("#2a2978", 10, 34, 2);
      for (let i = 0; i < 12; i++) dash(["#4a3c98", "#34509c"][i % 2], 8, 18, 2);
    },
    true,
  );
}

/** A light's streak on the water: bright at the quay, broken by the ripples, dying toward us. */
function streakTex() {
  return canvasTex(16, 128, (g) => {
    for (let y = 0; y < 128; y++) {
      const u = y / 128;
      // (a slow wobble of the ripples across it, never a hard gap)
      const a = Math.pow(1 - u, 1.6) * (0.7 + 0.3 * Math.sin(y * 0.55) * Math.sin(y * 0.13));
      const gr = g.createLinearGradient(0, 0, 16, 0);
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(0.5, `rgba(255,255,255,${a.toFixed(3)})`);
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, y, 16, 1);
    }
  });
}

/** The garden's ground behind the bay (seen from above, the water at the bottom): dark lawns, lit paths, a plaza under each light-tree, the promenade along the water. */
function gardenTex(trees: [number, number][], x0: number, z0: number, wM: number, dM: number) {
  const W = 1024,
    H = 512;
  const X = (x: number) => ((x - x0) / wM + 0.5) * W;
  const Z = (z: number) => ((z - z0) / dM + 0.5) * H;
  const rd = rng(0xba73);
  return canvasTex(W, H, (g) => {
    g.fillStyle = "#123438";
    g.fillRect(0, 0, W, H);
    // lawns in two greens, hedges as darker blocks
    for (let i = 0; i < 46; i++) {
      g.fillStyle = i % 3 ? "#174448" : "#0e2a30";
      g.fillRect(rd() * W, rd() * H, 30 + rd() * 90, 20 + rd() * 50);
    }
    // the paths: from tree to tree, and down to the promenade
    g.lineCap = "round";
    g.lineJoin = "round";
    const path = (w: number, c: string) => {
      g.strokeStyle = c;
      g.lineWidth = w;
      g.beginPath();
      trees.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
      g.stroke();
      for (const [x, z] of trees) {
        g.beginPath();
        g.moveTo(X(x), Z(z));
        g.lineTo(X(x + 3), H);
        g.stroke();
      }
    };
    path(15, "#2a2060");
    path(9, "#5a4a9c");
    // a round plaza under each tree, its ring of light on the ground
    trees.forEach(([x, z], i) => {
      const c = i % 2 ? "255,95,200" : "95,242,255";
      const gr = g.createRadialGradient(X(x), Z(z), 4, X(x), Z(z), 46);
      gr.addColorStop(0, `rgba(${c},0.5)`);
      gr.addColorStop(0.5, `rgba(${c},0.18)`);
      gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr;
      g.fillRect(X(x) - 46, Z(z) - 46, 92, 92);
      g.fillStyle = "#6a5ab0";
      g.beginPath();
      g.arc(X(x), Z(z), 15, 0, Math.PI * 2);
      g.fill();
    });
    // the promenade along the water (the picture's bottom edge): pale paving, a lamp's pool every few metres
    g.fillStyle = "#2c2664";
    g.fillRect(0, H - 34, W, 34);
    g.fillStyle = "#453c8c";
    g.fillRect(0, H - 8, W, 8);
    for (let x = 12; x < W; x += 41) {
      const gr = g.createRadialGradient(x, H - 20, 0, x, H - 20, 26);
      gr.addColorStop(0, "rgba(255,196,120,0.6)");
      gr.addColorStop(1, "rgba(255,196,120,0)");
      g.fillStyle = gr;
      g.fillRect(x - 26, H - 46, 52, 46);
    }
  });
}

// ---- the build -----------------------------------------------------------------------------------

function build({ scene: s, w, rnd, fx }: LevelCtx): Scenery {
  // a warm night: the lanterns' orange from above and in front (the shadows fall away up the floor,
  // short enough to leave it clear), a violet fill
  w.sun.color.set("#ffc890");
  w.sun.intensity = 1.7;
  w.sun.position.set(16, 34, 26);
  w.hemi.color.set("#d0c0ff");
  w.hemi.groundColor.set("#4a2a50");
  w.hemi.intensity = 1.95;
  const m4 = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const s4 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const col = new THREE.Color();
  const signs: THREE.MeshBasicMaterial[] = [];

  // the round tower, its tiled top, the kerb ring with its light strip
  const facade = windowsTex();
  facade.repeat.set(10, 7);
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.55, R + 1.1, 46, 48, 1, true), new THREE.MeshToonMaterial({ map: facade, color: "#f0c49a", emissive: "#3a2010", gradientMap: toonSteps() }));
  slab.position.y = -23;
  s.add(slab);
  const top = new THREE.Mesh(new THREE.CircleGeometry(R + 0.55, 64), new THREE.MeshToonMaterial({ map: floorTex(), gradientMap: toonSteps() }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.001;
  s.add(top);
  const kerb = new THREE.Mesh(new THREE.TorusGeometry(R + 0.28, 0.28, 8, 96), toon("#ff6b5a"));
  kerb.rotation.x = Math.PI / 2;
  kerb.position.y = 0.12;
  s.add(kerb);
  const strip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.28, 0.06, 6, 96), glow("#5ff2ff"));
  strip.rotation.x = Math.PI / 2;
  strip.position.y = 0.4;
  s.add(strip);

  // the turntable: a ring that really turns (its group spins; the chevrons mirror when it flips)
  const belt = new THREE.Group();
  belt.position.y = 0.02;
  const beltMat = new THREE.MeshBasicMaterial({ map: beltTex(), color: C_GO.clone() });
  const beltMesh = new THREE.Mesh(new THREE.RingGeometry(R0, R1, 72, 1), beltMat);
  beltMesh.rotation.x = -Math.PI / 2;
  beltMesh.renderOrder = 1;
  belt.add(beltMesh);
  s.add(belt);
  for (const r of [R0, R1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 72), toon("#d8def0"));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.04;
    s.add(rim);
  }

  // the satay kiosk: an octagonal counter, a grill smoking on it, a red pagoda roof, its neon sign
  {
    const g = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.05, 8), toon("#ffd23f"));
    counter.position.y = 0.52;
    outline(counter, 0.04);
    g.add(counter);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.12, 8), toon("#9c3b22"));
    lip.position.y = 1.1;
    g.add(lip);
    block("#3b3550", 0.9, 0.12, 0.5, 0, 1.2, 0.25, g);
    block("", 0.78, 0.04, 0.38, 0, 1.27, 0.25, g, glow("#ff7a2a"));
    block("#5a3a2a", 0.12, 1.6, 0.12, 0, 1.9, -0.35, g);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.8, 8), toon("#e8362b"));
    roof.position.y = 2.95;
    outline(roof, 0.05);
    g.add(roof);
    const knob = new THREE.Mesh(GEO.ball, toon("#ffd23f", "#6a4a00"));
    knob.scale.setScalar(0.32);
    knob.position.y = 3.42;
    g.add(knob);
    const sg = neon(T("SATAY", "沙爹"), "#ffd23f", 1.5, 0.5, 150);
    sg.position.set(0, 2.2, 0.62);
    g.add(sg);
    signs.push(sg.material as THREE.MeshBasicMaterial);
    s.add(g);
  }
  const grill = new THREE.Vector3(0, 1.4, 0.25);

  // the stalls round the edge, each facing the middle: a counter, a striped awning on posts, a neon sign
  const stalls: [number, number, number, string, string, string, string, string][] = [
    [0, -5.95, 0, T("LAKSA", "叻沙"), "#5ff2ff", "#ff5fc8", "#ffffff", "#4fb3c9"],
    [5.95, 0, -Math.PI / 2, T("KOPI", "咖啡"), "#ffd23f", "#ffb52e", "#ffffff", "#6bbf59"],
    [-5.95, 0, Math.PI / 2, T("CHILLI CRAB", "辣椒蟹"), "#ff5fc8", "#ff3b2f", "#fff4d8", "#e86a3a"],
  ];
  const bulbs = new THREE.InstancedMesh(GEO.ball, glow("#ffffff"), stalls.length * 7);
  const menuMat = new THREE.MeshToonMaterial({ map: menuTex(), gradientMap: toonSteps(), emissive: "#2a1a30" });
  let nb = 0;
  for (const [x, z, ry, name, nc, a1, a2, body] of stalls) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    outline(block(body, 2.1, 1.05, 1.1, 0, 0.52, 0, g), 0.04);
    block("#fff4e0", 2.2, 0.1, 1.2, 0, 1.1, 0, g);
    block("#5a4a6a", 0.1, 2.3, 0.1, -1.0, 1.15, 0.5, g);
    block("#5a4a6a", 0.1, 2.3, 0.1, 1.0, 1.15, 0.5, g);
    block("", 2.2, 1.4, 0.12, 0, 1.75, -0.5, g, menuMat);
    // (its crates behind, up to the kerb)
    outline(block("#c98a45", 1.8, 0.8, 0.5, 0, 0.4, -0.8, g), 0.03);
    const aw = block("", 2.5, 0.1, 1.35, 0, 2.3, 0.15, g, new THREE.MeshToonMaterial({ map: awningTex(a1, a2), gradientMap: toonSteps() }));
    aw.rotation.x = 0.28;
    const pot = new THREE.Mesh(GEO.cyl, toon("#c9d2e6"));
    pot.scale.set(0.42, 0.3, 0.42);
    pot.position.set(0.55, 1.3, 0.1);
    g.add(pot);
    const sg = neon(name, nc, 1.9, 0.55, name.length > 6 ? 76 : 120);
    sg.position.set(0, 2.85, 0.2);
    // (the side stalls' signs turn halfway to the front, to be read)
    sg.rotation.y = -ry / 2;
    g.add(sg);
    signs.push(sg.material as THREE.MeshBasicMaterial);
    s.add(g);
    // a row of bulbs under the awning's edge
    g.updateMatrixWorld(true);
    for (let i = 0; i < 7; i++) {
      v1.set(-1.05 + i * 0.35, 1.95 - Math.sin((i / 6) * Math.PI) * 0.08, 0.85).applyMatrix4(g.matrixWorld);
      m4.compose(v1, q4.identity(), s4.setScalar(0.11));
      bulbs.setMatrixAt(nb, m4);
      bulbs.setColorAt(nb, col.set(i % 2 ? "#ffe9a0" : nc));
      nb++;
    }
  }
  s.add(bulbs);

  // the table at the front: a round red plastic top, stools round it
  {
    const t = OBST[4];
    const tt = new THREE.Mesh(GEO.cyl, toon("#ff4f4f"));
    tt.scale.set(1.2, 0.08, 1.2);
    tt.position.set(t.x, 0.78, t.z);
    outline(tt, 0.03);
    s.add(tt);
    block("#d43c3c", 0.14, 0.76, 0.14, t.x, 0.38, t.z, s);
    const stools = new THREE.InstancedMesh(GEO.cyl, toon("#3fa0e8"), 4);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      m4.compose(v1.set(t.x + Math.sin(a) * 0.95, 0.24, t.z + Math.cos(a) * 0.95), q4.identity(), s4.set(0.42, 0.48, 0.42));
      stools.setMatrixAt(i, m4);
    }
    s.add(stools);
  }

  // the lantern strings: from the kiosk's roof out to poles round the back and sides (none over the front)
  const poleA = [1.2, 2.0, 2.75, 3.55, 4.3, 5.1];
  const poles = new THREE.InstancedMesh(GEO.box, toon("#5a4a6a"), poleA.length);
  const per = 5;
  const lan = new THREE.InstancedMesh(GEO.ball, glow("#ffffff"), poleA.length * per);
  const strings: number[] = [];
  let nl = 0;
  poleA.forEach((a, pi) => {
    const px = Math.sin(a) * (R + 0.75),
      pz = Math.cos(a) * (R + 0.75);
    m4.compose(v1.set(px, 1.9, pz), q4.identity(), s4.set(0.14, 3.8, 0.14));
    poles.setMatrixAt(pi, m4);
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      strings.push(px * u, 3.8 - 0.05 * u - Math.sin(u * Math.PI) * 0.5, pz * u);
      if (i > 0 && i < 12) strings.push(px * u, 3.8 - 0.05 * u - Math.sin(u * Math.PI) * 0.5, pz * u);
    }
    for (let i = 1; i <= per; i++) {
      const u = (i + 0.5) / (per + 1.5);
      const y = 3.8 - 0.05 * u - Math.sin(u * Math.PI) * 0.5 - 0.25;
      m4.compose(v1.set(px * u, y, pz * u), q4.identity(), s4.set(0.36, 0.44, 0.36));
      lan.setMatrixAt(nl, m4);
      lan.setColorAt(nl, col.set(LANTERNS[(nl + pi) % LANTERNS.length]));
      nl++;
    }
  });
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute("position", new THREE.Float32BufferAttribute(strings, 3));
  s.add(poles, lan, new THREE.LineSegments(sgeo, new THREE.LineBasicMaterial({ color: "#2a1c3a" })));

  // down on the bay (what shows past the roof's edge): the water in its basin, the city all round it,
  // the garden behind with its light-trees and the wheel, the three towers under their sky deck
  const BAY = -45;
  /** The basin's radius; the garden's waterfront (z). */
  const SHORE = 88;
  const FRONT = -36;
  const wTex = waterTex();
  wTex.repeat.set(6, 6);
  const water = new THREE.Mesh(new THREE.CircleGeometry(SHORE, 64), new THREE.MeshBasicMaterial({ map: wTex }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = BAY;
  water.userData.noShadow = true;
  s.add(water);
  // (the city's lights caught on the ripples: a second, sparser sheet drifting the other way)
  const gTex = canvasTex(
    256,
    256,
    (g) => {
      const rd = rng(0xba74);
      for (let i = 0; i < 12; i++) {
        g.fillStyle = ["#ffd9a0", "#ffe9c8", "#ff9ae0", "#ffd9a0", "#a8f8ff", "#ffffff"][i % 6];
        g.fillRect(rd() * 236, Math.floor(rd() * 254), 6 + rd() * 9, 1.5);
      }
    },
    true,
  );
  gTex.repeat.set(3, 3);
  const glints = new THREE.Mesh(new THREE.CircleGeometry(SHORE, 48), new THREE.MeshBasicMaterial({ map: gTex, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
  glints.rotation.x = -Math.PI / 2;
  glints.position.y = BAY + 0.03;
  glints.renderOrder = 1;
  s.add(glints);
  // the city round the basin, a hand lower than the water: lit streets, blocks beyond the skyline, traffic, a last ring in the haze
  const inBay = (x: number, z: number) => Math.hypot(x, z) < SHORE + 46;
  cityBelow(s, {
    y: BAY - 0.3,
    seed: 0xba75,
    street: "#1b163e",
    mark: "#5b4c9c",
    lots: ["#2a2258", "#30265e", "#261f50"],
    roofs: ["#3e3478", "#4a3a86", "#352c6c", "#55408c"],
    shade: "#0d0926",
    park: ["#1c4444", "#2a6a5a"],
    parkK: 0.1,
    lamp: "rgba(255,186,104,0.8)",
    walls: ["#4a3f8a", "#3a356e", "#5a4a9a", "#46407a"],
    tops: ["#5a4e9a", "#4a4284", "#66559e"],
    h: [8, 42],
    out: 7,
    empty: 0.45,
    frame: "#ffffff",
    pane: "#2c2658",
    lit: "#ffe3a0",
    litK: 0.5,
    glowK: 0.9,
    sun: [-0.4, -0.7],
    clear: inBay,
  });
  const traffic = new Traffic(s, 40, BAY - 0.3, { seed: 0xba76, out: 7, colors: ["#3a3070", "#4a3a86", "#2c2658"], lamps: true, skip: (_axis, street) => Math.abs((street + 0.5) * 24) < SHORE + 8 });
  farRing(s, { seed: 0xba77, r: 212, n: 44, y: BAY, h: [30, 120], color: "#2b1c5c" });
  const quay = new THREE.Mesh(new THREE.RingGeometry(SHORE - 0.4, SHORE + 4.5, 96), new THREE.MeshBasicMaterial({ color: "#2c2664" }));
  quay.rotation.x = -Math.PI / 2;
  quay.position.y = BAY + 0.12;
  quay.userData.noShadow = true;
  s.add(quay);
  const sky = skyline(s, { r: 110, n: 56, y: BAY, rnd, night: true, tall: 1.25 });
  for (let i = 0; i < 56; i++) sky.setColorAt(i, col.set(TOWERS[i % TOWERS.length]));
  if (sky.instanceColor) sky.instanceColor.needsUpdate = true;
  sky.userData.noShadow = true;
  // the garden behind the bay: its lawns and lit paths, the promenade along the water
  const TREES: [number, number, number][] = [
    [-47, -52, 17],
    [-41, -43, 12],
    [-33, -56, 21],
    [-26, -45, 14],
    [-37, -67, 24],
  ];
  {
    const gw = 156,
      gd = 86;
    const land = new THREE.MeshBasicMaterial({ color: "#1c1648" });
    const lawn = new THREE.MeshBasicMaterial({ map: gardenTex(TREES.map(([x, z]) => [x, z]), 0, FRONT - gd / 2, gw, gd) });
    const g = new THREE.Mesh(GEO.box, [land, land, lawn, land, land, land]);
    g.scale.set(gw, 1.4, gd);
    g.position.set(0, BAY + 0.2, FRONT - gd / 2);
    g.userData.noShadow = true;
    s.add(g);
    // (our own tower's foot: a round quay in the water)
    const foot = new THREE.Mesh(GEO.cyl, toon("#3a3278", "#0e0a28"));
    foot.scale.set(21, 1.6, 21);
    foot.position.y = BAY + 0.3;
    foot.userData.noShadow = true;
    s.add(foot);
  }
  // the lamps along the water: the promenade's, the basin's rim, our tower's foot (one draw)
  {
    const at: [number, number][] = [];
    for (let x = -72; x <= 72; x += 6) at.push([x, FRONT + 1.2]);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const x = Math.cos(a) * (SHORE + 2.2),
        z = Math.sin(a) * (SHORE + 2.2);
      if (z > FRONT + 4) at.push([x, z]);
    }
    for (let i = 0; i < 10; i++) at.push([Math.cos((i / 10) * Math.PI * 2) * 9.8, Math.sin((i / 10) * Math.PI * 2) * 9.8]);
    const lampsQ = new THREE.InstancedMesh(GEO.ball, glow("#ffd9a0"), at.length);
    at.forEach(([x, z], i) => lampsQ.setMatrixAt(i, m4.compose(v1.set(x, BAY + 2.4, z), q4.identity(), s4.setScalar(0.95))));
    s.add(lampsQ);
  }
  {
    const wm = new THREE.MeshToonMaterial({ map: windowsTex(), color: "#6a5aa8", emissive: "#2a2050", gradientMap: toonSteps() });
    for (let i = 0; i < 3; i++) {
      const t = block("", 6, 26, 5, 14 + i * 8, BAY + 13, -52 - i * 1.2, s, wm);
      t.rotation.z = (i - 1) * 0.02;
      t.userData.noShadow = true;
    }
    outline(block("#7a6ac8", 31, 2, 7, 22, BAY + 27, -53.2, s), 0.2);
    block("", 30, 0.3, 0.3, 22, BAY + 26.2, -49.6, s, glow("#5ff2ff"));
    // (on the deck: a long lit pool, a row of lamps, a few palms' crowns)
    block("", 19, 0.12, 2.2, 20, BAY + 28.08, -52.2, s, glow("#5ff2ff"));
    block("#9486d8", 31, 0.5, 0.4, 22, BAY + 28.25, -56.5, s);
    const deckLamps = new THREE.InstancedMesh(GEO.ball, glow("#ffe9b0"), 9);
    const crownsD = new THREE.InstancedMesh(GEO.box, toon("#3fbf6a", "#0a3a1a"), 5);
    for (let i = 0; i < 9; i++) deckLamps.setMatrixAt(i, m4.compose(v1.set(8 + i * 3.5, BAY + 28.6, -55.6), q4.identity(), s4.setScalar(0.55)));
    for (let i = 0; i < 5; i++) crownsD.setMatrixAt(i, m4.compose(v1.set(32.5 + (i % 2) * 1.6, BAY + 28.7, -50.8 - i * 1.1), q4.identity(), s4.set(1.3, 0.7, 1.3)));
    s.add(deckLamps, crownsD);
  }
  // the light-trees: a trunk, a wide flat crown (what the camera sees from above), its rim and ribs of light
  const CROWN = 3.9;
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1.15, 1, 8), toon("#7a4ab0", "#2a104a"), TREES.length);
  const crownsT = new THREE.InstancedMesh(new THREE.CylinderGeometry(CROWN, 0.8, 4.4, 14), toon("#3c2274", "#160a30"), TREES.length);
  const rims = new THREE.InstancedMesh(new THREE.TorusGeometry(CROWN, 0.22, 6, 28), glow("#ffffff"), TREES.length);
  const ribs = new THREE.InstancedMesh(GEO.box, glow("#ffffff"), TREES.length * 4);
  const up = new THREE.Vector3(0, 1, 0);
  TREES.forEach(([x, z, h], i) => {
    stems.setMatrixAt(i, m4.compose(v1.set(x, BAY + (h - 4.4) / 2, z), q4.identity(), s4.set(1, h - 4.4, 1)));
    crownsT.setMatrixAt(i, m4.compose(v1.set(x, BAY + h - 2.2, z), q4.identity(), s4.set(1, 1, 1)));
    q4.setFromAxisAngle(s4.set(1, 0, 0), Math.PI / 2);
    rims.setMatrixAt(i, m4.compose(v1.set(x, BAY + h, z), q4, s4.set(1, 1, 1)));
    rims.setColorAt(i, col.set(i % 2 ? "#ff5fc8" : "#5ff2ff"));
    for (let r = 0; r < 4; r++) {
      ribs.setMatrixAt(i * 4 + r, m4.compose(v1.set(x, BAY + h + 0.05, z), q4.setFromAxisAngle(up, (r / 4) * Math.PI + i), s4.set(CROWN * 2 - 0.5, 0.1, 0.1)));
      ribs.setColorAt(i * 4 + r, col.set(i % 2 ? "#c05aa8" : "#58b8c8"));
    }
  });
  for (const mesh of [stems, crownsT]) mesh.userData.noShadow = true;
  s.add(stems, crownsT, rims, ribs);
  const wheel = new THREE.Group();
  wheel.position.set(-8, BAY + 19, -66);
  wheel.rotation.y = 0.5;
  {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(16, 0.5, 6, 64), glow("#ff7ad9"));
    wheel.add(rim);
    const spokes = new THREE.InstancedMesh(GEO.box, toon("#d8def0"), 8);
    const cab = new THREE.InstancedMesh(GEO.box, glow("#ffffff"), 16);
    for (let i = 0; i < 8; i++) {
      m4.compose(v1.set(0, 0, 0), q4.setFromAxisAngle(s4.set(0, 0, 1), (i / 8) * Math.PI), s4.set(32, 0.3, 0.3));
      spokes.setMatrixAt(i, m4);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      m4.compose(v1.set(Math.cos(a) * 16, Math.sin(a) * 16, 0), q4.identity(), s4.set(1.6, 1.4, 1.6));
      cab.setMatrixAt(i, m4);
      cab.setColorAt(i, col.set(CABINS[i % CABINS.length]));
    }
    spokes.userData.noShadow = true;
    wheel.add(spokes, cab);
    const hub = new THREE.Mesh(GEO.cyl, toon("#ffd23f"));
    hub.rotation.x = Math.PI / 2;
    hub.scale.set(2.2, 1.2, 2.2);
    wheel.add(hub);
  }
  s.add(wheel);
  for (const sx of [-1, 1]) {
    const leg = block("#d8def0", 0.8, 21, 0.8, -8 + sx * 4.6 * Math.cos(0.5), BAY + 10, -66 + sx * 4.6 * Math.sin(0.5), s);
    leg.rotation.z = sx * 0.22;
    leg.userData.noShadow = true;
  }
  // the night sky all round (the fly-over and the low cameras see it): stars, the milky band, the moon over the garden
  skyDome(s, { sky: ["#0d0834", "#6a2f7e"], stars: 650, band: true, disc: { az: 292, el: 24, moon: true, color: "#fff4d0", size: 6.5 }, haze: 0.45, rnd: rng(0xba78) });
  // the lights' streaks on the water, from the promenade toward us
  const streaks = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: streakTex(), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }), 14);
  for (let i = 0; i < 14; i++) {
    // (the same three draws of the game's stream as ever, in the same order)
    const x = -50 + i * 8 + rnd() * 3;
    const len = 15 + rnd() * 8;
    m4.compose(v1.set(x, BAY + 0.06, FRONT + len / 2), q4.setFromAxisAngle(s4.set(1, 0, 0), -Math.PI / 2), s4.set(2.2 + rnd() * 1.4, len, 1));
    streaks.setMatrixAt(i, m4);
    streaks.setColorAt(i, col.set(CABINS[i % CABINS.length]));
  }
  streaks.renderOrder = 2;
  s.add(streaks);

  // warm pools of light under the stalls, the kiosk and the lanterns (the floor glows where it's lit)
  lightPools(s, [
    [0, -5.1, 2.0, "#ffb070"],
    [5.1, 0, 2.0, "#ffd070"],
    [-5.1, 0, 2.0, "#ff8aa0"],
    [0, 0.9, 1.6, "#ff7a2a"],
    [0, 5.1, 1.3, "#ffc080"],
    ...poleA.map((a): [number, number, number, string] => [Math.sin(a) * 4.6, Math.cos(a) * 4.6, 1.1, "#ff6a4a"]),
  ], 0.025, 0.42);
  // palms in pots on the kerb, between the stalls
  const pots = new THREE.InstancedMesh(GEO.cyl, toon("#e86a3a"), 4);
  const trunks = new THREE.InstancedMesh(GEO.cyl, toon("#a0703a"), 4);
  const fronds = new THREE.InstancedMesh(GEO.cone, toon("#3fbf6a", "#05300f"), 4 * 5);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = Math.sin(a) * (R + 0.35),
      pz = Math.cos(a) * (R + 0.35);
    // (the two at the front, nearest the camera, are low ferns: nothing tall between you and the play)
    const k = pz > 0 ? 0.42 : 1;
    pots.setMatrixAt(i, m4.compose(v1.set(px, 0.55, pz), q4.identity(), s4.set(0.7, 0.6, 0.7)));
    trunks.setMatrixAt(i, m4.compose(v1.set(px, 0.85 + 0.65 * k, pz), q4.identity(), s4.set(0.16, 1.5 * k, 0.16)));
    for (let f = 0; f < 5; f++) {
      const fa = (f / 5) * Math.PI * 2 + i;
      q4.setFromEuler(new THREE.Euler(Math.cos(fa) * 1.15, 0, Math.sin(fa) * 1.15));
      fronds.setMatrixAt(i * 5 + f, m4.compose(v1.set(px + Math.sin(fa) * 0.35 * k, 0.85 + 1.4 * k, pz + Math.cos(fa) * 0.35 * k), q4, s4.set(0.35 * k + 0.1, 1.1 * k + 0.2, 0.12)));
    }
  }
  s.add(pots, trunks, fronds);
  // boats on the bay: a pale hull, a lit canopy in a lantern's colour
  const boats = new THREE.InstancedMesh(GEO.box, toon("#e8e0f0", "#2a2248"), 4);
  const bLights = new THREE.InstancedMesh(GEO.box, glow("#ffffff"), 4);
  boats.frustumCulled = bLights.frustumCulled = false;
  boats.userData.noShadow = true;
  for (let i = 0; i < 4; i++) bLights.setColorAt(i, col.set(CABINS[(i * 2) % CABINS.length]));
  s.add(boats, bLights);
  // (the scenery's own dice: the fireworks, never the sim's streams)
  const dice = rng(0xba79);
  const steam = new THREE.Vector3();
  let fwIn = 1.5;
  let steamIn = 0;

  let smokeIn = 0;
  let mirrored = false;
  let lanStep = -1;
  return {
    tick(dt, live) {
      const t = live.t;
      // the turntable: it turns as the game says; its chevrons point the way it goes
      belt.rotation.y += live.belt * dt;
      if (live.belt < -1e-3 && !mirrored) ((mirrored = true), (beltMesh.scale.x = -1));
      else if (live.belt > 1e-3 && mirrored) ((mirrored = false), (beltMesh.scale.x = 1));
      if (live.beltWarn > 0) beltMat.color.copy(C_WARN).multiplyScalar(0.45 + 0.55 * live.beltWarn);
      else beltMat.color.copy(C_GO);
      wheel.rotation.z = t * 0.06;
      traffic.tick(t);
      // the water drifts one way, the lights on it the other
      wTex.offset.set(t * 0.012, Math.sin(t * 0.21) * 0.01);
      gTex.offset.set(-t * 0.021, t * 0.008);
      // the boats cross between our tower and the garden, each on its own line (bobbing a little)
      for (let i = 0; i < 4; i++) {
        const x = ((t * (1.2 + i * 0.35) + i * 37) % 130) - 65,
          z = -31 + i * 6.6;
        const bob = Math.sin(t * 1.3 + i * 2) * 0.07;
        boats.setMatrixAt(i, m4.compose(v1.set(i % 2 ? -x : x, BAY + 0.45 + bob, z), q4.identity(), s4.set(3.6, 0.8, 1.3)));
        bLights.setMatrixAt(i, m4.compose(v1.set((i % 2 ? -x : x) - 0.2, BAY + 1.15 + bob, z), q4.identity(), s4.set(1.9, 0.6, 1.0)));
      }
      boats.instanceMatrix.needsUpdate = bLights.instanceMatrix.needsUpdate = true;
      // the light-trees' rims breathe, out of step
      for (let i = 0; i < TREES.length; i++) rims.setColorAt(i, col.set(i % 2 ? "#ff5fc8" : "#5ff2ff").multiplyScalar(0.8 + 0.2 * Math.sin(t * 1.7 + i * 1.9)));
      if (rims.instanceColor) rims.instanceColor.needsUpdate = true;
      // fireworks over the bay, now and then (where the camera looks past the roof)
      fwIn -= dt;
      if (fwIn <= 0) {
        fwIn = 1.4 + dice() * 1.6;
        const c1 = CABINS[Math.floor(dice() * CABINS.length) % CABINS.length];
        v1.set((dice() - 0.5) * 50, BAY + 22 + dice() * 10, -30 + dice() * 16);
        fx.burst(v1, 46, [c1, "#ffffff", c1, "#fff4b0"], { speed: 9, up: 1, gravity: 3, size: 0.42, life: 1.3, drag: 1.4 });
      }
      steamIn -= dt;
      if (steamIn <= 0) {
        steamIn = 0.45;
        // (the laksa's pot steams)
        steam.set(0.55, 1.5, -5.85);
        fx.burst(steam, 1, ["#ffffff", "#f0e8ff"], { speed: 0.3, up: 0.7, gravity: -0.8, size: 0.2, life: 1.3, drag: 1 });
      }
      // the lanterns breathe (a step at a time)
      const step = Math.floor(t * 3);
      if (step !== lanStep) {
        lanStep = step;
        for (let i = 0; i < nl; i++) {
          col.set(LANTERNS[i % LANTERNS.length]).multiplyScalar((i + step) % 5 === 0 ? 1.25 : 1);
          lan.setColorAt(i, col);
        }
        if (lan.instanceColor) lan.instanceColor.needsUpdate = true;
      }
      for (let i = 0; i < signs.length; i++) {
        // (a stutter from the clock, never Math.random)
        const f = Math.sin(t * 0.8 + i * 2.3) > 0.97 && (Math.floor(t * 24) * 7 + i) % 3 === 0 ? 0.4 : 1;
        signs[i].color.setScalar(f);
      }
      smokeIn -= dt;
      if (smokeIn <= 0) {
        smokeIn = 0.26;
        fx.burst(grill, 1, ["#f4ecf8", "#d9cce6", "#ffd9a0"], { speed: 0.5, up: 0.8, gravity: -1.0, size: 0.24, life: 1.6, drag: 1 });
      }
    },
  };
}

const ring = (r: number, n: number, a0: number): [number, number][] => Array.from({ length: n }, (_, i) => [Math.sin((i / n) * Math.PI * 2 + a0) * r, Math.cos((i / n) * Math.PI * 2 + a0) * r]);

export const MARKET: Level = {
  key: "market",
  title: "HAWKER NIGHT",
  titleZh: "夜市大排档",
  tag: "The hawker centre over Marina Bay: a turntable ring carries you round, and flips when its arrows blink",
  tagZh: "滨海湾小贩中心：转盘带着你转圈，箭头闪烁时就会反转",
  song: "marina",
  ambience: "market",
  disc: R,
  obst: OBST,
  belt: { r0: R0, r1: R1, w: 0.9, first: 5, every: [5.5, 3], warn: 1.6 },
  starts: ring(5, 4, Math.PI / 4),
  spots: [...ring(5.3, 4, Math.PI / 4), ...ring(1.75, 4, Math.PI / 4)],
  cam: { y: 13.2, z: 14, px: 1.6, pz: 1.4, orbit: [19.5, 10.5], wy: 4.7 },
  sky: ["#120b3e", "#6a2f7e"],
  fog: [70, 240],
  build,
};
