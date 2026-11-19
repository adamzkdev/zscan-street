/**
 * HOT WALLET, level 3: SKYBRIDGE. Two Midtown tower roofs on a snowy winter afternoon, a chasm
 * between them (eighty metres down to the streets, the frozen Sprout river and its skaters), the NU7
 * TOWER's golden ball, the ZK MALL's tent and CITY HALL's blue dome on the skyline.
 * Two drawbridges cross the chasm and lift in turn: their lamps go from green to flashing amber (a
 * horn sounds), then the leaves swing up and tip off whoever is still on them; red while up. A spring
 * pad on each lip hops you over at any time (a dotted arc shows where you'll land).
 */
import * as THREE from "three";
import { rng } from "../../kit";
import { GEO, block, canvasTex, glow, outline, skyDome, skyline, toon, toonSteps, zGlyph } from "../../k3";
import { Flock, Traffic, cityBelow, farRing, hazeSheets, lightPools, puffClouds, type Box, type Level, type LevelCtx, type Scenery } from "./common";

/** The two roofs together: half sizes; the chasm |x| < G in the middle. */
const HX = 8.2;
const HZ = 6;
const G = 1.1;
/** The roofs' slabs reach a little past the play area (under the parapets). */
const EDGE = 0.6;
const BRIDGES = [
  { z: -3.4, hz: 0.95 },
  { z: 3.4, hz: 0.95 },
];
const PAD_X = G + 0.75;
const PAD_R = 0.6;
const LAND_X = G + 1.95;

const OBST: Box[] = [
  // west: the lift's machine room, a water tank
  { x: -5.4, z: -2.4, hx: 0.9, hz: 0.7 },
  { x: -5.0, z: 3.4, hx: 0.65, hz: 0.65, r: 0.65 },
  // east: the dish's plinth, a vent stack
  { x: 5.2, z: 2.6, hx: 0.7, hz: 0.7 },
  { x: 4.8, z: -3.0, hx: 0.55, hz: 0.55, r: 0.55 },
];

/** The skyline on a winter afternoon: mid blues and stone, darker than the snowy roofs we play on. */
const TOWERS = ["#86a4d0", "#a9bcdc", "#6f8fc4", "#b9b4b2", "#97aed4", "#8c9ec8"];
const L_GO = new THREE.Color("#6dff8e");
const L_WARN = new THREE.Color("#ffb52e");
const L_UP = new THREE.Color("#ff3b2f");
const L_OFF = new THREE.Color("#4a3a20");

// ---- the textures --------------------------------------------------------------------------------

/**
 * The west roof's top (the east one is the same, turned round): pale tiles dusted with snow, a hazard
 * band along the chasm's lip (right), yellow mouths where the bridges start, the spring pad's circle
 * and its landing ring.
 */
function roofTex() {
  const wM = HX + EDGE - G;
  const dM = 2 * (HZ + EDGE);
  const W = 512,
    H = 1024;
  const kx = W / wM,
    kz = H / dM;
  // (metres from the slab's west edge, and from its back edge)
  const X = (x: number) => x * kx;
  const Z = (z: number) => z * kz;
  const lip = wM;
  // (its drifts from its own seed: the same roof on every screen)
  const rd = rng(0x5b00);
  return canvasTex(W, H, (g) => {
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 14; j++) {
        g.fillStyle = (i + j) & 1 ? "#cfdbec" : "#dfe8f4";
        g.fillRect(X(i), Z(j), kx + 1, kz + 1);
      }
    g.strokeStyle = "rgba(90,110,150,0.3)";
    g.lineWidth = 3;
    for (let i = 0; i <= 8; i++) ((g.beginPath(), g.moveTo(X(i), 0), g.lineTo(X(i), H)), g.stroke());
    for (let j = 0; j <= 14; j++) ((g.beginPath(), g.moveTo(0, Z(j)), g.lineTo(W, Z(j))), g.stroke());
    // snow drifts along the outer edges
    g.fillStyle = "rgba(255,255,255,0.85)";
    for (let n = 0; n < 60; n++) {
      const side = n % 3;
      const u = rd();
      const x = side === 0 ? rd() * 1.2 : u * (lip - 1);
      const z = side === 0 ? u * dM : side === 1 ? rd() * 1.1 : dM - rd() * 1.1;
      g.beginPath();
      g.ellipse(X(x), Z(z), (0.3 + rd() * 0.5) * kx, (0.2 + rd() * 0.4) * kz, 0, 0, Math.PI * 2);
      g.fill();
    }
    // a big painted roundel in the open middle of the roof: a snowflake in a ring, and a Q
    {
      const cx = X(wM * 0.42),
        cz = Z(dM / 2);
      const r = 1.9 * kx;
      g.save();
      g.translate(cx, cz);
      g.scale(1, kz / kx);
      g.fillStyle = "rgba(63,160,232,0.18)";
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(63,120,210,0.55)";
      g.lineWidth = 0.14 * kx;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 0.1 * kx;
      for (let n = 0; n < 6; n++) {
        const a = (n / 6) * Math.PI * 2;
        g.beginPath();
        g.moveTo(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35);
        g.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
        g.moveTo(Math.cos(a) * r * 0.62 + Math.cos(a + 0.6) * r * 0.15, Math.sin(a) * r * 0.62 + Math.sin(a + 0.6) * r * 0.15);
        g.lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
        g.lineTo(Math.cos(a) * r * 0.62 + Math.cos(a - 0.6) * r * 0.15, Math.sin(a) * r * 0.62 + Math.sin(a - 0.6) * r * 0.15);
        g.stroke();
      }
      zGlyph(g, 0, 0, r * 0.62, "rgba(232,184,74,0.85)");
      g.restore();
    }
    // the hazard band along the lip
    g.save();
    g.beginPath();
    g.rect(X(lip - 0.45), 0, X(0.45), H);
    g.clip();
    g.fillStyle = "#26244a";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#ffd23f";
    g.lineWidth = 0.17 * kx;
    for (let y = -W; y < H + W; y += 0.5 * kz) ((g.beginPath(), g.moveTo(0, y), g.lineTo(W, y + W * 0.6)), g.stroke());
    g.restore();
    // the bridges' mouths: yellow aprons with arrows across
    for (const b of BRIDGES) {
      const zc = b.z + HZ + EDGE;
      g.fillStyle = "#ffd23f";
      g.fillRect(X(lip - 1.2), Z(zc - b.hz), X(1.2), Z(2 * b.hz));
      g.fillStyle = "#26244a";
      for (const o of [-0.45, 0.45]) {
        g.beginPath();
        g.moveTo(X(lip - 0.25), Z(zc + o));
        g.lineTo(X(lip - 0.75), Z(zc + o - 0.28));
        g.lineTo(X(lip - 0.75), Z(zc + o + 0.28));
        g.closePath();
        g.fill();
      }
    }
    // the spring pad's ring and its landing target
    const zp = HZ + EDGE;
    g.strokeStyle = "#ff4f6d";
    g.lineWidth = 0.12 * kx;
    g.beginPath();
    g.ellipse(X(lip - (PAD_X - G)), Z(zp), (PAD_R + 0.25) * kx, (PAD_R + 0.25) * kz, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([0.22 * kx, 0.16 * kx]);
    g.beginPath();
    g.ellipse(X(lip - (LAND_X - G)), Z(zp), 0.6 * kx, 0.6 * kz, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  });
}

/** Blue glass curtain wall with pale mullions (the towers' sides). */
function glassTex() {
  const rd = rng(0x5b01);
  const t = canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = "#e9eef6";
      g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const lit = rd() < 0.3;
          g.fillStyle = lit ? "#ffe2a8" : (x + y) % 3 ? "#6f9fd8" : "#8bb6e6";
          g.fillRect(x * 32 + 3, y * 32 + 3, 26, 27);
          g.fillStyle = "rgba(255,255,255,0.35)";
          g.fillRect(x * 32 + 3, y * 32 + 3, 26, 5);
        }
    },
    true,
  );
  t.repeat.set(3, 26);
  return t;
}

/** A bridge leaf's deck: steel grating between yellow-black edges. */
function deckTex() {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = "#8a96ae";
    g.fillRect(0, 0, 128, 256);
    g.strokeStyle = "#6c7892";
    g.lineWidth = 3;
    for (let y = 8; y < 256; y += 14) ((g.beginPath(), g.moveTo(14, y), g.lineTo(114, y)), g.stroke());
    for (const x0 of [0, 114]) {
      g.fillStyle = "#26244a";
      g.fillRect(x0, 0, 14, 256);
      g.fillStyle = "#ffd23f";
      for (let y = 0; y < 256; y += 24) g.fillRect(x0, y, 14, 12);
    }
  });
}

/** A spring pad's top: a red and white target. */
function padTex() {
  return canvasTex(128, 128, (g) => {
    for (const [r, c] of [
      [62, "#ff4f6d"],
      [48, "#ffffff"],
      [34, "#ff4f6d"],
      [20, "#ffffff"],
      [9, "#ff4f6d"],
    ] as [number, string][]) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(64, 64, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Hazard stripes (the chasm's kerbs). */
function stripeTex() {
  const t = canvasTex(
    64,
    16,
    (g) => {
      g.fillStyle = "#ffd23f";
      g.fillRect(0, 0, 64, 16);
      g.fillStyle = "#26244a";
      for (let x = -16; x < 64; x += 16) {
        g.beginPath();
        g.moveTo(x, 16);
        g.lineTo(x + 8, 0);
        g.lineTo(x + 16, 0);
        g.lineTo(x + 8, 16);
        g.closePath();
        g.fill();
      }
    },
    true,
  );
  t.repeat.set(6, 1);
  return t;
}

/**
 * A tower's wall inside the chasm, from the roof's lip (the picture's top) down to the street: glass
 * going from daylight into deep shade, a line at every floor, panes lit here and there (they show
 * more down in the dark). Painted, not lit: the chasm's depth is in this picture.
 */
function chasmTex() {
  const rd = rng(0x5b02);
  const W = 256,
    H = 2048;
  return canvasTex(W, H, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "#8ea6d6");
    gr.addColorStop(0.035, "#5873b4");
    gr.addColorStop(0.14, "#35488c");
    gr.addColorStop(0.42, "#222d64");
    gr.addColorStop(1, "#141b44");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    const FLOORS = 25,
      PANES = 8;
    const fh = H / FLOORS,
      pw = W / PANES;
    for (let f = 0; f < FLOORS; f++) {
      const u = f / (FLOORS - 1);
      g.fillStyle = `rgba(214,228,252,${(0.4 - u * 0.28).toFixed(3)})`;
      g.fillRect(0, f * fh, W, 5);
      for (let c = 0; c < PANES; c++) {
        g.fillStyle = `rgba(214,228,252,${(0.24 - u * 0.16).toFixed(3)})`;
        g.fillRect(c * pw, f * fh, 2, fh);
        if (rd() < 0.14 + u * 0.14) {
          g.fillStyle = rd() < 0.8 ? "#ffd998" : "#bfe4ff";
          g.globalAlpha = 0.5 + rd() * 0.45;
          g.fillRect(c * pw + 6, f * fh + 16, pw - 10, fh - 30);
          g.globalAlpha = 1;
        }
      }
    }
    // snow along the lip
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, W, 12);
  });
}

// ---- the build -----------------------------------------------------------------------------------

function build({ scene: s, w, rnd, fx }: LevelCtx): Scenery {
  // a clear winter afternoon: a low warm sun on the left (long shadows across the snow, to the right),
  // a cold blue fill
  w.sun.color.set("#ffe8c8");
  w.sun.intensity = 2.5;
  w.sun.position.set(-40, 31, 8);
  w.hemi.color.set("#dfe9ff");
  w.hemi.groundColor.set("#8090bc");
  w.hemi.intensity = 1.5;
  const m4 = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const s4 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const col = new THREE.Color();

  // the two towers and their roofs (the east one is the west one turned round)
  const wM = HX + EDGE - G;
  const dM = 2 * (HZ + EDGE);
  const glass = new THREE.MeshToonMaterial({ map: glassTex(), gradientMap: toonSteps() });
  const topMat = new THREE.MeshToonMaterial({ map: roofTex(), gradientMap: toonSteps() });
  for (const sd of [-1, 1]) {
    const cx = sd * (G + wM / 2);
    block("", wM, 80, dM, cx, -40.02, 0, s, glass);
    const top = new THREE.Mesh(GEO.plane, topMat);
    top.scale.set(wM, dM, 1);
    top.rotation.set(-Math.PI / 2, 0, sd > 0 ? Math.PI : 0);
    top.position.set(cx, 0.001, 0);
    s.add(top);
  }
  // the chasm: eighty metres down between the towers' inner walls to the streets (the walls painted from
  // daylight into shade; two lower walkways cross it, their windows lit, snow on their backs)
  {
    const wall = new THREE.MeshBasicMaterial({ map: chasmTex() });
    for (const sd of [-1, 1]) {
      const m = new THREE.Mesh(GEO.plane, wall);
      m.scale.set(dM, 79.7, 1);
      m.rotation.y = (-sd * Math.PI) / 2;
      m.position.set(sd * (G - 0.015), -0.3 - 79.7 / 2, 0);
      m.userData.noShadow = true;
      s.add(m);
    }
    const WALKS: [number, number][] = [
      [-9, -1.9],
      [-25, 2.7],
      [-46, -4.4],
    ];
    const tubes = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#ffffff" }), WALKS.length * 2);
    const panes = new THREE.InstancedMesh(GEO.box, glow("#ffdfa0"), WALKS.length);
    WALKS.forEach(([y, z], i) => {
      // (deeper: darker, as the walls are)
      const k = 1 + y / 70;
      tubes.setMatrixAt(i * 2, m4.compose(v1.set(0, y, z), q4.identity(), s4.set(2 * G - 0.04, 1.2, 1.5)));
      tubes.setColorAt(i * 2, col.set("#5873b0").multiplyScalar(k));
      tubes.setMatrixAt(i * 2 + 1, m4.compose(v1.set(0, y + 0.66, z), q4.identity(), s4.set(2 * G - 0.04, 0.14, 1.62)));
      tubes.setColorAt(i * 2 + 1, col.set("#c6d4f0").multiplyScalar(k));
      panes.setMatrixAt(i, m4.compose(v1.set(0, y, z), q4.identity(), s4.set(2 * G - 0.5, 0.4, 1.53)));
    });
    tubes.userData.noShadow = true;
    s.add(tubes, panes);
    // (the shade between the towers: two dark sheets just under the lips, so the gap reads as a drop
    // from the first step down, whatever shows through its far end)
    const shade = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ color: "#162058", transparent: true, opacity: 0.26, depthWrite: false }), 2);
    q4.setFromAxisAngle(v1.set(1, 0, 0), -Math.PI / 2);
    [-1.5, -4].forEach((y, i) => shade.setMatrixAt(i, m4.compose(v1.set(0, y, 0), q4, s4.set(2 * G - 0.03, dM, 1))));
    q4.identity();
    shade.userData.noShadow = true;
    s.add(shade);
  }
  // the parapets (outer edges): cream walls, gold trim, snow on top
  const walls = new THREE.InstancedMesh(GEO.box, toon("#f4ead8"), 6);
  const trims = new THREE.InstancedMesh(GEO.box, toon("#e8b84a", "#3a2800"), 6);
  const caps = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), 6);
  {
    let n = 0;
    const put = (x: number, z: number, wx: number, wz: number, h: number) => {
      m4.compose(v1.set(x, h / 2, z), q4.identity(), s4.set(wx, h, wz));
      walls.setMatrixAt(n, m4);
      m4.compose(v1.set(x, h - 0.08, z), q4.identity(), s4.set(wx + 0.06, 0.1, wz + 0.06));
      trims.setMatrixAt(n, m4);
      m4.compose(v1.set(x, h + 0.08, z), q4.identity(), s4.set(wx + 0.1, 0.16, wz + 0.1));
      caps.setMatrixAt(n, m4);
      n++;
    };
    for (const sd of [-1, 1]) {
      const cx = sd * (G + wM / 2);
      put(cx, -(HZ + 0.25), wM, 0.5, 0.75);
      put(cx, HZ + 0.25, wM, 0.5, 0.45);
      put(sd * (HX + 0.25), 0, 0.5, dM, 0.75);
    }
  }
  s.add(walls, trims, caps);
  // the chasm's lip: low hazard kerbs, open at the bridges
  const kerbs = new THREE.InstancedMesh(GEO.box, new THREE.MeshToonMaterial({ map: stripeTex(), gradientMap: toonSteps() }), 6);
  {
    let n = 0;
    const spans: [number, number][] = [
      [-(HZ + EDGE), BRIDGES[0].z - BRIDGES[0].hz],
      [BRIDGES[0].z + BRIDGES[0].hz, BRIDGES[1].z - BRIDGES[1].hz],
      [BRIDGES[1].z + BRIDGES[1].hz, HZ + EDGE],
    ];
    for (const sd of [-1, 1])
      for (const [z0, z1] of spans) {
        m4.compose(v1.set(sd * (G + 0.06), 0.09, (z0 + z1) / 2), q4.identity(), s4.set(0.14, 0.18, z1 - z0));
        kerbs.setMatrixAt(n++, m4);
      }
  }
  s.add(kerbs);

  // the drawbridges: two leaves each, hinged at the lips; lamps at the four corners of each mouth
  const deck = new THREE.MeshToonMaterial({ map: deckTex(), gradientMap: toonSteps() });
  const leaves: THREE.Group[] = [];
  for (const b of BRIDGES)
    for (const sd of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(sd * G, 0, b.z);
      const d = block("", G, 0.2, 2 * b.hz, -sd * (G / 2), -0.1, 0, g, deck);
      outline(d, 0.03);
      block("#4a4f6a", G - 0.1, 0.32, 2 * b.hz - 0.4, -sd * (G / 2), -0.36, 0, g);
      for (const e of [-1, 1]) block("#e8b84a", G, 0.08, 0.08, -sd * (G / 2), 0.55, e * (b.hz - 0.04), g);
      for (const e of [-1, 1]) block("#5a5f7a", 0.07, 0.55, 0.07, -sd * G + sd * 0.1, 0.28, e * (b.hz - 0.04), g);
      s.add(g);
      leaves.push(g);
    }
  const posts = new THREE.InstancedMesh(GEO.box, toon("#3b3f5a"), BRIDGES.length * 4);
  const lamps = new THREE.InstancedMesh(GEO.ball, glow("#ffffff"), BRIDGES.length * 4);
  {
    let n = 0;
    for (const b of BRIDGES)
      for (const sd of [-1, 1])
        for (const e of [-1, 1]) {
          const x = sd * (G + 0.25),
            z = b.z + e * (b.hz + 0.2);
          m4.compose(v1.set(x, 0.45, z), q4.identity(), s4.set(0.12, 0.9, 0.12));
          posts.setMatrixAt(n, m4);
          m4.compose(v1.set(x, 1.0, z), q4.identity(), s4.setScalar(0.28));
          lamps.setMatrixAt(n, m4);
          lamps.setColorAt(n, L_GO);
          n++;
        }
  }
  s.add(posts, lamps);

  // the spring pads: a red base, a target top that squashes, a dotted arc to the landing spot
  const padTop = new THREE.MeshToonMaterial({ map: padTex(), gradientMap: toonSteps() });
  const tops: THREE.Mesh[] = [];
  for (const sd of [-1, 1]) {
    const base = new THREE.Mesh(GEO.cyl, toon("#ff4f6d"));
    base.scale.set(2 * PAD_R + 0.1, 0.2, 2 * PAD_R + 0.1);
    base.position.set(sd * PAD_X, 0.1, 0);
    outline(base, 0.03);
    s.add(base);
    const top = new THREE.Mesh(GEO.cyl, [toon("#e8eef7"), padTop, padTop]);
    top.scale.set(2 * PAD_R - 0.12, 0.1, 2 * PAD_R - 0.12);
    top.position.set(sd * PAD_X, 0.26, 0);
    s.add(top);
    tops.push(top);
  }
  const ARC = 9;
  const arc = new THREE.InstancedMesh(GEO.box, glow("#ff4f6d", 0.85), ARC * 2);
  {
    let n = 0;
    for (const sd of [-1, 1])
      for (let i = 0; i < ARC; i++) {
        const u = (i + 1) / (ARC + 1);
        const x = sd * PAD_X + (-sd * LAND_X - sd * PAD_X) * u;
        m4.compose(v1.set(x, 0.4 + Math.sin(u * Math.PI) * 1.6, 0), q4.identity(), s4.setScalar(0.11));
        arc.setMatrixAt(n++, m4);
      }
  }
  s.add(arc);

  // the props: the lift's machine room, a water tank (west); the dish on its plinth, a vent stack (east)
  {
    const o = OBST[0];
    outline(block("#cfd8e6", o.hx * 2, 1.6, o.hz * 2, o.x, 0.8, o.z, s), 0.05);
    outline(block("#5a6a8a", o.hx * 2 + 0.25, 0.18, o.hz * 2 + 0.25, o.x, 1.69, o.z, s), 0.04);
    block("#ffffff", o.hx * 2 + 0.2, 0.12, o.hz * 2 + 0.2, o.x, 1.84, o.z, s);
    block("#3a3f5a", 0.7, 1.15, 0.05, o.x + 0.3, 0.58, o.z + o.hz + 0.01, s);
    block("", 0.5, 0.18, 0.05, o.x - 0.45, 1.2, o.z + o.hz + 0.02, s, glow("#6dff8e"));
  }
  {
    const o = OBST[1];
    const tank = new THREE.Mesh(GEO.cyl, toon("#9ab8d8"));
    tank.scale.set(o.r! * 2, 1.5, o.r! * 2);
    tank.position.set(o.x, 0.75, o.z);
    outline(tank, 0.04);
    s.add(tank);
    const bands = new THREE.Mesh(GEO.cyl, toon("#5a6a8a"));
    bands.scale.set(o.r! * 2 + 0.06, 0.1, o.r! * 2 + 0.06);
    bands.position.set(o.x, 0.95, o.z);
    s.add(bands);
    const lid = new THREE.Mesh(new THREE.ConeGeometry(o.r! + 0.08, 0.5, 16), toon("#ffffff"));
    lid.position.set(o.x, 1.75, o.z);
    s.add(lid);
  }
  let dish!: THREE.Group;
  {
    const o = OBST[2];
    outline(block("#c8b8a0", o.hx * 2, 0.9, o.hz * 2, o.x, 0.45, o.z, s), 0.05);
    block("#ffffff", o.hx * 2 + 0.1, 0.1, o.hz * 2 + 0.1, o.x, 0.95, o.z, s);
    dish = new THREE.Group();
    dish.position.set(o.x, 1.4, o.z);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.75, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshToonMaterial({ color: "#f2f5fa", gradientMap: toonSteps(), side: THREE.DoubleSide }));
    bowl.rotation.x = Math.PI;
    bowl.position.y = 0.55;
    dish.add(bowl);
    block("#5a6a8a", 0.12, 0.6, 0.12, 0, 0.1, 0, dish);
    block("#e8b84a", 0.06, 0.06, 0.6, 0, 0.55, 0, dish);
    dish.rotation.set(-0.7, 0.6, 0);
    s.add(dish);
  }
  {
    const o = OBST[3];
    const st = new THREE.Mesh(GEO.cyl, toon("#b8c2d6"));
    st.scale.set(o.r! * 2, 1.8, o.r! * 2);
    st.position.set(o.x, 0.9, o.z);
    outline(st, 0.04);
    s.add(st);
    const cap = new THREE.Mesh(GEO.cyl, toon("#4a4f6a"));
    cap.scale.set(o.r! * 2 + 0.15, 0.16, o.r! * 2 + 0.15);
    cap.position.set(o.x, 1.85, o.z);
    s.add(cap);
  }
  const vent = new THREE.Vector3(OBST[3].x, 2.0, OBST[3].z);

  // far below: the snowy city (streets, lots, the blocks round our towers, traffic), the frozen river
  // with its bridges and skaters; around: ZStreet's skyline, snow on every roof, a last ring in the haze
  const GROUND = -80;
  const onRiver = (z: number) => Math.abs(z + 40) < 16;
  cityBelow(s, {
    y: GROUND,
    seed: 0x5b03,
    street: "#8794bc",
    mark: "#c9d4ee",
    lots: ["#b6c5e4", "#c3d0ea", "#abbcdc"],
    roofs: ["#f6f8fe", "#e6edf9", "#fff3e0", "#dbe5f6"],
    shade: "#5468a2",
    park: ["#ccd8f0", "#3f7a5e"],
    parkK: 0.14,
    walls: ["#8ba6d0", "#b4c2dc", "#7892c2", "#d4c4a4", "#9fb2d6"],
    tops: ["#ffffff", "#f1f5ff", "#e8effc"],
    h: [14, 62],
    out: 3,
    empty: 0.3,
    frame: "#ffffff",
    pane: "#5f86c6",
    lit: "#ffe2a8",
    litK: 0.22,
    sun: [0.98, -0.2],
    // (the river's banks, the NU7 TOWER's foot, and the lots straight behind us: the chasm looks down on the river and its streets)
    clear: (x, z) => onRiver(z) || Math.hypot(x + 17, z + 70) < 16 || (x === 0 && z < 0),
  });
  const traffic = new Traffic(s, 56, GROUND, { seed: 0x5b04, out: 4, colors: ["#d94a3a", "#f2c84a", "#3a6ad0", "#f4f4f8", "#2a2f4a", "#3fa06a"], skip: (axis, street) => axis === 0 && street === -2 });
  farRing(s, { seed: 0x5b05, r: 192, n: 46, y: GROUND, h: [40, 150], color: "#8ea2d0" });
  // (the winter shade under the roofs: the city a few steps down into the blue, the sunlit snow on top of it)
  hazeSheets(s, [-7, -16, -28, -44], "#2c4494", 0.12);
  {
    const ice = block("", 1500, 0.5, 14, 0, GROUND + 0.1, -40, s, new THREE.MeshBasicMaterial({ color: "#b9d8f0" }));
    ice.userData.noShadow = true;
    // its snowy banks, a bridge where each street crosses
    const banks = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#eef3fc" }), 2 + 9);
    banks.setMatrixAt(0, m4.compose(v1.set(0, GROUND + 0.2, -47.6), q4.identity(), s4.set(1500, 0.7, 1.8)));
    banks.setMatrixAt(1, m4.compose(v1.set(0, GROUND + 0.2, -32.4), q4.identity(), s4.set(1500, 0.7, 1.8)));
    for (let i = 0; i < 9; i++) {
      banks.setMatrixAt(2 + i, m4.compose(v1.set((i - 4.5) * 24, GROUND + 0.75, -40), q4.identity(), s4.set(7, 0.5, 17)));
      banks.setColorAt(2 + i, col.set("#8f9cc0"));
    }
    banks.setColorAt(0, col.set("#ffffff"));
    banks.setColorAt(1, col.set("#ffffff"));
    banks.userData.noShadow = true;
    s.add(banks);
  }
  // skaters on the river: little figures gliding round (one draw)
  const NS = 18;
  const skaters = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#ffffff" }), NS);
  skaters.frustumCulled = false;
  skaters.userData.noShadow = true;
  const sk = new Float32Array(NS * 5);
  {
    const rd = rng(0x5b06);
    const coats = ["#d94a3a", "#f2c84a", "#3a6ad0", "#2a2f4a", "#3fa06a", "#b85ac8"];
    for (let i = 0; i < NS; i++) {
      // (its loop's middle, its reach along and across the river, its pace, where it is on it)
      // (a few of them straight behind us, where the chasm looks down)
      sk[i * 5] = (rd() - 0.5) * (i < 6 ? 16 : 84);
      sk[i * 5 + 1] = 2 + rd() * 5;
      sk[i * 5 + 2] = 1 + rd() * 3.4;
      sk[i * 5 + 3] = (0.35 + rd() * 0.5) * (rd() < 0.5 ? -1 : 1);
      sk[i * 5 + 4] = rd() * 6.28;
      skaters.setColorAt(i, col.set(coats[i % coats.length]));
    }
  }
  s.add(skaters);
  const sky = skyline(s, { r: 120, n: 60, y: -80, rnd, tall: 1.7 });
  for (let i = 0; i < 60; i++) sky.setColorAt(i, col.set(TOWERS[i % TOWERS.length]));
  if (sky.instanceColor) sky.instanceColor.needsUpdate = true;
  sky.userData.noShadow = true;
  {
    // (snow on every tower's roof)
    const caps = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), 60);
    for (let i = 0; i < 60; i++) {
      sky.getMatrixAt(i, m4);
      m4.decompose(v1, q4, s4);
      caps.setMatrixAt(i, m4.compose(v1.setY(v1.y + s4.y / 2 + 0.5), q4, s4.set(s4.x + 0.8, 1.2, s4.z + 0.8)));
    }
    caps.userData.noShadow = true;
    s.add(caps);
    q4.identity();
  }
  // (we stand higher than all of it: the landmarks are down where the camera looks over the back parapet)
  // the NU7 TOWER: a white trunk, ribs opening into a crown that holds a golden ball (it glows a little: gold through the blue air)
  let ball!: THREE.Mesh;
  {
    const g = new THREE.Group();
    g.position.set(-17, -80, -70);
    const white = toon("#f4f6fa");
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.7, 36, 10), white);
    trunk.position.y = 18;
    trunk.userData.noShadow = true;
    g.add(trunk);
    const ribs = new THREE.InstancedMesh(GEO.cyl, white, 12);
    const up = new THREE.Vector3(0, 1, 0);
    const d = new THREE.Vector3();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      d.set(Math.cos(a) * 4.3, 9, Math.sin(a) * 4.3);
      const len = d.length();
      q4.setFromUnitVectors(up, d.normalize());
      ribs.setMatrixAt(k, m4.compose(v1.set(Math.cos(a) * 3.0, 38.5, Math.sin(a) * 3.0), q4, s4.set(0.5, len, 0.5)));
    }
    q4.identity();
    ribs.userData.noShadow = true;
    g.add(ribs);
    ball = new THREE.Mesh(GEO.ball, toon("#ffcf4a", "#b87410"));
    ball.scale.setScalar(8);
    ball.position.y = 43;
    ball.userData.noShadow = true;
    g.add(ball);
    s.add(g);
  }
  // the ZK MALL's tent (tilted) and CITY HALL's blue dome
  const tent = new THREE.Mesh(new THREE.ConeGeometry(14, 42, 24), toon("#f2d9a8"));
  tent.position.set(-62, -59, -105);
  tent.rotation.z = 0.12;
  s.add(tent);
  {
    const g = new THREE.Group();
    g.position.set(58, -80, -118);
    block("#f4f0e6", 40, 30, 22, 0, 15, 0, g);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon("#3fa0e8", "#0a2a4a"));
    dome.position.y = 30;
    g.add(dome);
    block("#ffc83a", 1.2, 18, 1.2, 0, 47, 0, g);
    s.add(g);
  }
  puffClouds(s, { n: 4, r: 130, y: 4, rnd, color: "#ffffff" });
  // the sky all round (the fly-over and the low cameras see the horizon): the low sun on the left, where the light comes from
  skyDome(s, { sky: ["#2a58c4", "#cdd8f2"], clouds: 9, cloud: "#ffffff", cloudShade: "#b9c4e2", disc: { az: 11, el: 13, color: "#fff0cc", size: 9, glow: 7 }, haze: 0.5, rnd: rng(0x5b07) });

  // snowy firs in planters on the back and side parapets, lamps along the front; birds over the city
  const FIRS: [number, number][] = [];
  for (const sd of [-1, 1]) {
    for (const x of [2.6, 5.0, 7.4]) FIRS.push([sd * x, -(HZ + 0.25)]);
    for (const z of [-3.2, 0.2, 3.6]) FIRS.push([sd * (HX + 0.25), z]);
  }
  const planters = new THREE.InstancedMesh(GEO.box, toon("#8a6a4a"), FIRS.length);
  const firs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 7), toon("#2f8a5a", "#05200f"), FIRS.length * 2);
  const firSnow = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 7), toon("#ffffff"), FIRS.length);
  FIRS.forEach(([x, z], i) => {
    const h = 0.75 + (i % 3) * 0.12;
    planters.setMatrixAt(i, m4.compose(v1.set(x, h + 0.18, z), q4.identity(), s4.set(0.55, 0.36, 0.55)));
    firs.setMatrixAt(i * 2, m4.compose(v1.set(x, h + 0.75, z), q4.identity(), s4.set(1.0, 1.0, 1.0)));
    firs.setMatrixAt(i * 2 + 1, m4.compose(v1.set(x, h + 1.25, z), q4.identity(), s4.set(0.72, 0.8, 0.72)));
    firSnow.setMatrixAt(i, m4.compose(v1.set(x, h + 1.55, z), q4.identity(), s4.set(0.42, 0.42, 0.42)));
  });
  s.add(planters, firs, firSnow);
  const LAMPS: [number, number][] = [];
  for (const sd of [-1, 1]) for (const x of [2.4, 5.0, 7.6]) LAMPS.push([sd * x, HZ + 0.25]);
  const lampPosts = new THREE.InstancedMesh(GEO.box, toon("#3b3f5a"), LAMPS.length);
  const lampHeads = new THREE.InstancedMesh(GEO.ball, glow("#fff0c8"), LAMPS.length);
  LAMPS.forEach(([x, z], i) => {
    lampPosts.setMatrixAt(i, m4.compose(v1.set(x, 1.1, z), q4.identity(), s4.set(0.1, 1.3, 0.1)));
    lampHeads.setMatrixAt(i, m4.compose(v1.set(x, 1.85, z), q4.identity(), s4.setScalar(0.3)));
  });
  s.add(lampPosts, lampHeads);
  lightPools(s, [...LAMPS.map(([x, z]): [number, number, number, string] => [x, z - 0.9, 1.3, "#ffd8a0"]), [-PAD_X, 0, 1.2, "#ff6d8a"], [PAD_X, 0, 1.2, "#ff6d8a"]], 0.02, 0.4);
  const birds = new Flock(s, 10, new THREE.Vector3(6, -14, -48), 18, "#2a3050", 1.7);

  // the snow: flakes drifting down over the roofs, recycled at the top
  const NF = 150;
  const flakes = new THREE.InstancedMesh(GEO.box, glow("#ffffff"), NF);
  flakes.frustumCulled = false;
  const fp = new Float32Array(NF * 4);
  {
    const rd = rng(0x5b08);
    for (let i = 0; i < NF; i++) {
      fp[i * 4] = (rd() - 0.5) * 30;
      fp[i * 4 + 1] = rd() * 12 - 1;
      fp[i * 4 + 2] = (rd() - 0.5) * 26 - 2;
      fp[i * 4 + 3] = rd() * 6;
    }
  }
  s.add(flakes);

  let steamIn = 0;
  return {
    tick(dt, live) {
      const t = live.t;
      // the leaves: up as the game says, rattling while their lamps warn
      for (let k = 0; k < BRIDGES.length; k++) {
        const up = live.lift[k];
        const shake = live.warn[k] ? Math.sin(t * 46 + k) * 0.035 : 0;
        const e = up * up * (3 - 2 * up);
        leaves[k * 2].rotation.z = e * 1.25 + shake;
        leaves[k * 2 + 1].rotation.z = -(e * 1.25 + shake);
        const c = live.warn[k] ? (live.warn[k] === 1 ? L_WARN : L_OFF) : up > 0.05 ? L_UP : L_GO;
        for (let j = 0; j < 4; j++) lamps.setColorAt(k * 4 + j, c);
      }
      if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
      // the pads squash when they fire
      for (let k = 0; k < tops.length; k++) {
        const p = live.pad[k];
        tops[k].position.y = 0.26 - 0.12 * p * p;
        tops[k].scale.y = 0.1 * (1 - 0.5 * p);
      }
      // the arcs' dots pulse along toward the landing
      const ph = (t * 1.6) % 1;
      for (let n = 0; n < ARC * 2; n++) {
        const i = n % ARC;
        const sd = n < ARC ? -1 : 1;
        const u = (i + 1) / (ARC + 1);
        const x = sd * PAD_X + (-sd * LAND_X - sd * PAD_X) * u;
        const b = 0.08 + 0.07 * Math.max(0, 1 - Math.abs(u - ph) * 5);
        m4.compose(v1.set(x, 0.4 + Math.sin(u * Math.PI) * 1.6, 0), q4.identity(), s4.setScalar(b));
        arc.setMatrixAt(n, m4);
      }
      arc.instanceMatrix.needsUpdate = true;
      dish.rotation.y = 0.6 + Math.sin(t * 0.3) * 0.4;
      birds.tick(t);
      ball.rotation.y = t * 0.2;
      traffic.tick(t);
      for (let i = 0; i < NS; i++) {
        const a = sk[i * 5 + 4] + t * sk[i * 5 + 3];
        skaters.setMatrixAt(i, m4.compose(v1.set(sk[i * 5] + Math.cos(a) * sk[i * 5 + 1], GROUND + 1.1, -40 + Math.sin(a) * sk[i * 5 + 2]), q4.identity(), s4.set(0.7, 1.5, 0.7)));
      }
      skaters.instanceMatrix.needsUpdate = true;
      // the snow (over the chasm it falls on, down between the towers)
      for (let i = 0; i < NF; i++) {
        let y = fp[i * 4 + 1] - dt * (0.9 + (i % 5) * 0.12);
        if (y < (Math.abs(fp[i * 4]) < G - 0.5 && Math.abs(fp[i * 4 + 2]) < HZ ? -14 : -0.5)) y = 12.5;
        fp[i * 4 + 1] = y;
        const ph2 = fp[i * 4 + 3] + t;
        m4.compose(v1.set(fp[i * 4] + Math.sin(ph2 * 0.9) * 0.4, y, fp[i * 4 + 2] + Math.cos(ph2 * 0.7) * 0.3), q4.identity(), s4.setScalar(0.07 + (i % 3) * 0.02));
        flakes.setMatrixAt(i, m4);
      }
      flakes.instanceMatrix.needsUpdate = true;
      steamIn -= dt;
      if (steamIn <= 0) {
        steamIn = 0.3;
        fx.burst(vent, 1, ["#ffffff", "#e6eef8"], { speed: 0.4, up: 1.0, gravity: -1.2, size: 0.28, life: 1.6, drag: 1 });
      }
    },
  };
}

export const SKYBRIDGE: Level = {
  key: "skybridge",
  title: "SKYBRIDGE",
  titleZh: "天桥双塔",
  tag: "Midtown towers over a chasm: drawbridges lift when their lamps flash, springs hop you over",
  tagZh: "中城双塔之间的深渊：灯闪时吊桥升起，弹簧垫把你弹过去",
  song: "frost",
  ambience: "wind",
  rect: [HX, HZ],
  obst: OBST,
  gap: { g: G, bridges: BRIDGES, pads: [0], padX: PAD_X, padR: PAD_R, landX: LAND_X, first: 4, every: 3.5, warn: 1.5, up: 3.2 },
  starts: [
    [3.3, 3.3],
    [3.3, -3.3],
    [-3.3, -3.3],
    [-3.3, 3.3],
  ],
  spots: [
    [-3.4, -4.6],
    [-7, -0.6],
    [-3.6, 1.6],
    [-2.6, 4.9],
    [3.4, 4.6],
    [7, 0.6],
    [3.6, -1.6],
    [2.6, -4.9],
  ],
  cam: { y: 14.2, z: 14.6, px: 2.2, pz: 1.2, orbit: [21, 11.5] },
  sky: ["#2a58c4", "#cdd8f2"],
  fog: [62, 235],
  build,
};
