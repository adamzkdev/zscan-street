/**
 * PROVE THE BLOCK · PARK CAROUSEL: a winter night over Central Park. The pads sit in a ring round a
 * middle one on a great round music-box plaza that TURNS while you run (the gold bulbs round its rim
 * chase the way it turns; before it turns back they flash orange and the chevrons flip). Behind the
 * block: the NU7 TOWER with its golden sphere (the ⓩ mark on it), ZStreet's blue towers, the snow.
 */
import * as THREE from "three";
import { FONT } from "../../kit";
import { GEO, canvasTex, glow, label, outline, qBlock, skyDome, toon } from "../../k3";
import { drawMark } from "../../theme";
import { INK, tint } from "../../hud";
import { rng } from "../../kit";
import { Fall, Fireworks, Parts, city, pools } from "./parts";
import type { SetCtx, SetLive, SetState } from "./types";
import { SNOW_CITY, boxes, cityGrid, flags, ground, trees } from "./vista";

/** The plaza's radius; its ring of pads (the game's layout reads these). */
export const ASTANA_R = 11.8;
const BLUE = "#14a7d4";
const GOLD = "#ffc83a";
/** The city's ground far under the plaza (m). */
const Y0 = -46;

export function astanaSet(c: SetCtx): SetLive {
  const { scene, table, rnd } = c;
  c.hemi.color.set("#b9c9ff");
  c.hemi.groundColor.set("#2a3150");
  c.hemi.intensity = 1.55;
  c.sun.color.set("#dfe8ff");
  c.sun.intensity = 1.6;
  // (the moon: from the front left, 45° up, so the snarks' and the pads' shadows fall across the lanes)
  c.sun.position.set(-24, 40, 30);
  const R = ASTANA_R;

  // ---- the plaza's top: midnight blue, a gold sun round the middle pad, the lanes' rings, the ornament band
  const PX = 1024 / (R * 2);
  const tex = canvasTex(1024, 1024, (g) => {
    const C = 512;
    const gr = g.createRadialGradient(C, C, 40, C, C, 512);
    gr.addColorStop(0, "#2a4c8c");
    gr.addColorStop(0.7, "#1d3a74");
    gr.addColorStop(1, "#142c5c");
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 1024);
    // frost speckle
    for (let k = 0; k < 900; k++) {
      g.fillStyle = `rgba(220,235,255,${0.04 + Math.random() * 0.08})`;
      const s = 1 + Math.random() * 3;
      g.fillRect(Math.random() * 1024, Math.random() * 1024, s, s);
    }
    // the sun round the middle pad: 32 rays
    g.save();
    g.translate(C, C);
    for (let k = 0; k < 32; k++) {
      g.rotate((Math.PI * 2) / 32);
      g.beginPath();
      g.moveTo(-0.16 * PX, 2.35 * PX);
      g.lineTo(0, 3.25 * PX);
      g.lineTo(0.16 * PX, 2.35 * PX);
      g.closePath();
      g.fillStyle = k % 2 ? "rgba(255,200,58,0.85)" : "rgba(255,226,140,0.7)";
      g.fill();
    }
    g.restore();
    const ring = (r: number, w: number, col: string, dash: number[] = []) => {
      g.setLineDash(dash);
      g.lineWidth = w;
      g.strokeStyle = col;
      g.beginPath();
      g.arc(C, C, r * PX, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    };
    // the lanes: inside the ring, between the pads, round the outside
    ring(3.95, 5, "rgba(255,200,58,0.55)", [10, 14]);
    ring(7.4, 3, "rgba(120,220,255,0.35)", [6, 18]);
    ring(10.35, 5, "rgba(120,220,255,0.5)", [10, 14]);
    // the outer band: blue with gold ram's-horn curls
    ring(11.2, 0.9 * PX, BLUE);
    ring(10.78, 3, GOLD);
    ring(11.62, 3, GOLD);
    g.strokeStyle = GOLD;
    g.lineWidth = 3.5;
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const x = C + Math.cos(a) * 11.2 * PX,
        y = C + Math.sin(a) * 11.2 * PX;
      g.save();
      g.translate(x, y);
      g.rotate(a + Math.PI / 2);
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.arc(sx * 7, 0, 6, sx > 0 ? Math.PI : 0, sx > 0 ? Math.PI * 2.6 : Math.PI * 1.6, sx < 0);
        g.stroke();
      }
      g.restore();
    }
    // the start line's four boxes
    for (const x of [-4.2, -1.4, 1.4, 4.2]) {
      g.strokeStyle = "rgba(255,255,255,0.75)";
      g.lineWidth = 3;
      g.strokeRect(C + (x - 0.7) * PX, C + (10.2 - 0.55) * PX, 1.4 * PX, 1.1 * PX);
    }
  });
  const top = new THREE.Mesh(new THREE.CircleGeometry(R, 96).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: tex, gradientMap: toon("#fff").gradientMap }));
  top.position.y = 0.002;
  table.add(top);
  // its body (white, a gold band), its ink
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.05, R - 0.3, 0.8, 96), toon("#e9eef8"));
  drum.position.y = -0.4;
  table.add(drum);
  const drumInk = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.17, R - 0.18, 0.92, 96), new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  drumInk.position.y = -0.4;
  table.add(drumInk);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.09, R + 0.06, 0.16, 96, 1, true), glow(GOLD));
  band.position.y = -0.33;
  table.add(band);

  // ---- the rim's bulbs (they chase the way it turns) and the chevrons (they point it)
  const NBULB = 56;
  const bulbs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), NBULB);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    p = new THREE.Vector3(),
    s = new THREE.Vector3(),
    col = new THREE.Color();
  for (let k = 0; k < NBULB; k++) {
    const a = (k / NBULB) * Math.PI * 2;
    m.compose(p.set(Math.cos(a) * (R - 0.32), 0.14, Math.sin(a) * (R - 0.32)), q, s.set(0.26, 0.26, 0.26));
    bulbs.setMatrixAt(k, m);
    bulbs.setColorAt(k, col.set(GOLD));
  }
  bulbs.frustumCulled = false;
  table.add(bulbs);
  const chev = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.55, -0.5), new THREE.Vector2(0, -0.5), new THREE.Vector2(0.55, 0), new THREE.Vector2(0, 0.5), new THREE.Vector2(-0.55, 0.5), new THREE.Vector2(0, 0)])).rotateX(-Math.PI / 2);
  const NCH = 16;
  const chevM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const chevs = new THREE.InstancedMesh(chev, chevM, NCH);
  chevs.renderOrder = 2;
  chevs.frustumCulled = false;
  table.add(chevs);
  const placeChevs = (dir: number) => {
    for (let k = 0; k < NCH; k++) {
      const a = ((k + 0.5) / NCH) * Math.PI * 2;
      // (the shape points +x; turned to the tangent, the way the table turns: a positive turn
      // carries a point at angle a along (sin a, −cos a))
      const tx = Math.sin(a) * dir,
        tz = -Math.cos(a) * dir;
      q.setFromAxisAngle(p.set(0, 1, 0), Math.atan2(-tz, tx));
      m.compose(p.set(Math.cos(a) * 11.2, 0.03, Math.sin(a) * 11.2), q, s.set(0.9, 1, 0.9));
      chevs.setMatrixAt(k, m);
    }
    chevs.instanceMatrix.needsUpdate = true;
  };
  placeChevs(1);

  // ---- the music box under it (fixed): stepped drums, gold bands, a gold finial underneath
  const B = new Parts();
  const drumAt = (r: number, h: number, y: number, c: string) => {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.97, h, 64), toon(c));
    d.position.y = y - h / 2;
    scene.add(d);
    const dk = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.1, r * 0.97 + 0.1, h + 0.1, 64), drumInk.material as THREE.Material);
    dk.position.copy(d.position);
    scene.add(dk);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.04, r + 0.04, 0.14, 64, 1, true), glow(GOLD));
    b.position.y = y - 0.2;
    scene.add(b);
  };
  drumAt(R - 0.6, 1.4, -0.85, "#2b4a8a");
  drumAt(R - 2.6, 1.8, -2.25, "#e9eef8");
  drumAt(R - 4.8, 2.2, -4.05, "#1d3a74");
  B.add("cone", GOLD, 4.2, 6.5, 4.2, 0, -9.4, 0, { rx: Math.PI, ink: 0.06 });
  B.add("ball", GOLD, 1.3, 1.3, 1.3, 0, -12.9, 0, { lit: true });
  // two floating stones with banner poles, left and right
  for (const sx of [-1, 1]) {
    const x = sx * 15.2;
    B.box("#e9eef8", 5, 0.9, 2.2, x, -1.9, -3, 0.07);
    B.box("#2b4a8a", 3.2, 1.3, 1.4, x, -3.1, -3, 0.06);
    B.lit(GOLD, 5.1, 0.12, 0.1, x, -1.6, -3 + 1.12);
    B.box("#2b4a8a", 0.35, 9.6, 0.35, x - 1.7, -1.0, -3, 0.06);
    B.box("#2b4a8a", 0.35, 9.6, 0.35, x + 1.7, -1.0, -3, 0.06);
    B.box(GOLD, 4.2, 0.3, 0.3, x, 8.4, -3, 0.05);
    B.add("ball", GOLD, 0.6, 0.6, 0.6, x - 1.7, 8.95, -3, { lit: true });
    B.add("ball", GOLD, 0.6, 0.6, 0.6, x + 1.7, 8.95, -3, { lit: true });
    for (const dx of [-1.7, 1.7]) B.box("#2b4a8a", 0.1, 1.0, 0.1, x + dx - 0.06, 9.2, -3, 0.02);
  }
  // the banners: night blue, a gold sigil, a slogan
  const lines = [
    ["CENTRAL", "PARK"],
    ["BLOCK", "PROVEN"],
  ];
  for (const k of [0, 1]) {
    const sx = k ? 1 : -1;
    const ftex = canvasTex(256, 512, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 512);
      gr.addColorStop(0, "#2a4c8c");
      gr.addColorStop(1, "#142c5c");
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 512);
      g.fillStyle = GOLD;
      g.fillRect(0, 0, 256, 12);
      g.fillRect(0, 500, 256, 12);
      // a gold ornament down the hoist side
      for (let y = 30; y < 490; y += 36) {
        g.beginPath();
        g.arc(22, y, 9, 0, Math.PI * 2);
        g.lineWidth = 4;
        g.strokeStyle = GOLD;
        g.stroke();
      }
      const glyph = c.sig[k ? 3 : 6];
      const cell = 24,
        x0 = 142 - 3.5 * cell,
        y0 = 74;
      g.fillStyle = tint(GOLD, -0.45);
      for (let i = 0; i < 49; i++) if (glyph[i]) g.fillRect(x0 + (i % 7) * cell - 3, y0 + Math.floor(i / 7) * cell + 4, cell + 6, cell + 6);
      for (let i = 0; i < 49; i++) {
        if (!glyph[i]) continue;
        g.fillStyle = glyph[i] === 2 ? "#ffffff" : GOLD;
        g.fillRect(x0 + (i % 7) * cell, y0 + Math.floor(i / 7) * cell, cell + 0.5, cell + 0.5);
      }
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `900 40px ${FONT}`;
      g.lineWidth = 8;
      g.lineJoin = "round";
      for (const [i, w] of lines[k].entries()) {
        g.strokeStyle = "#0b1f44";
        g.strokeText(w, 142, 360 + i * 54);
        g.fillStyle = i ? GOLD : "#ffffff";
        g.fillText(w, 142, 360 + i * 54);
      }
    });
    const flag = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: ftex, side: THREE.DoubleSide }));
    flag.scale.set(3.1, 6.2, 1);
    flag.position.set(sx * 15.2, 5.0, -3);
    flag.rotation.y = -sx * 0.32;
    scene.add(flag);
  }

  // ---- the NU7 TOWER with its golden sphere (right, far behind the block)
  // (on the ground far below, like the city: the cameras look down on it)
  const bx = 24,
    bz = -64,
    by = -46;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    B.box("#f2f6ff", 0.7, 32, 0.7, bx + Math.cos(a) * 1.9, by, bz + Math.sin(a) * 1.9, 0.08);
  }
  B.box("#dfe7f7", 2.4, 30, 2.4, bx, by, bz, 0);
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    const s0 = 1.9,
      s1 = 6.6,
      y0 = by + 30,
      y1 = by + 43;
    const dx = s1 - s0,
      dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const phi = Math.atan2(dx, dy);
    const r = (s0 + s1) / 2;
    B.add("box", "#f2f6ff", 0.5, len, 0.5, bx + Math.cos(a) * r, (y0 + y1) / 2, bz + Math.sin(a) * r, { ry: -a, rz: -phi, ink: 0.06 });
  }
  const sphM = new THREE.MeshToonMaterial({ color: "#ffc23a", emissive: new THREE.Color("#a86a00"), gradientMap: toon("#fff").gradientMap });
  const sph = new THREE.Mesh(GEO.ball, sphM);
  sph.scale.setScalar(12);
  sph.position.set(bx, by + 40.5, bz);
  outline(sph, 0.25);
  scene.add(sph);
  const halo = new THREE.Mesh(GEO.ball, glow("#ffd76a", 0.22, true));
  halo.scale.setScalar(17);
  halo.position.copy(sph.position);
  scene.add(halo);
  // the ⓩ mark on the sphere's face, and the tower's name over it
  const markTex = canvasTex(256, 256, (g) => drawMark(g, 128, 128, 250, "#fff7e0", "#6a3c00"));
  const mark = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: markTex, transparent: true, depthWrite: false }));
  mark.scale.setScalar(10.5);
  mark.position.set(bx, by + 40.5, bz + 6.2);
  scene.add(mark);
  const name = label("NU7 TOWER", 3.2, "#fff3c8", "#14284e");
  name.position.set(bx, by + 50.5, bz);
  scene.add(name);
  // a Z-Block over each far corner
  const qbs: THREE.Object3D[] = [];
  for (const [x, y, z] of [
    [-11.5, 12.5, -9],
    [11.6, 11.6, -10],
  ]) {
    const qb = qBlock(1.5);
    qb.position.set(x, y, z);
    scene.add(qb);
    qbs.push(qb);
  }
  // snowy firs on the floating stones
  for (const sx of [-1, 1])
    for (const dx of [-2.3, 2.3]) {
      const x = sx * 15.2 + dx;
      B.add("cone", "#1f6a52", 1.3, 1.9, 1.3, x, -1.0 + 0.95, -3.7, { ry: Math.PI / 4, ink: 0.04 });
      B.add("cone", "#2a8a66", 1.0, 1.4, 1.0, x, -1.0 + 1.75, -3.7, { ry: Math.PI / 4, ink: 0.03 });
      B.add("cone", "#f4f8ff", 0.55, 0.6, 0.55, x, -1.0 + 2.45, -3.7, { ry: Math.PI / 4 });
    }
  B.build(scene, c.ink);
  // the rim's warm glow on the plaza, and round the music box under it
  pools(
    table,
    Array.from({ length: 16 }, (_, k) => ({ x: Math.cos((k / 16) * Math.PI * 2) * (R - 0.5), y: 0.02, z: Math.sin((k / 16) * Math.PI * 2) * (R - 0.5), r: 1.4, c: GOLD, a: 0.2 })),
  );

  // ---- the city, the snow
  // (the far ring of towers: the game's dice, as before; everything nearer has dice of its own)
  city(scene, { r: 235, n: 78, y: Y0, rnd, pal: ["#4a5f8a", "#3a4c78", "#56709c", "#2f4068", "#61789f", "#44557f"], win: ["#ffe7a8", "#1a2848"], lit: 0.45, tall: 1.25, glowK: 0.22 });
  const cos = rng(0xa57a);
  // the sky: a clear cold night, the moon over the left bank
  skyDome(scene, { sky: ["#081640", "#3a64ad"], ground: "#3a64ad", stars: 620, band: true, disc: { az: 248, el: 30, moon: true, size: 7 }, haze: 0.45, rnd: cos });
  ground(scene, Y0 - 1, "#22386c");
  // the city under the plaza, in blocks: the frozen river cuts across it (no blocks on the ice)
  const riverZ = (x: number) => -52 + x * 0.34 + 14 * Math.sin(x * 0.02);
  const town = cityGrid(scene, {
    y: Y0,
    x0: -252,
    x1: 252,
    z0: -200,
    z1: 76,
    pitch: 28,
    street: 8,
    keep: (x, z) => Math.abs(z - riverZ(x)) > 22 && !(Math.abs(x - 24) < 20 && Math.abs(z + 64) < 20),
    // (low under the plaza and in front of the block, taller toward the back: nothing rises into the play camera)
    tall: (x, z) => (9 + 30 * Math.min(1, Math.max(0, (-z - 20) / 120)) + 10 * Math.abs(Math.sin(x * 0.05))) * (Math.abs(x) < 44 ? 0.55 : 1),
    rnd: cos,
    look: SNOW_CITY,
    cars: 60,
    carSize: 1.9,
    parks: 0.14,
  });
  // the river: ice, lighter along its middle, the bridges' decks and their lamps
  const ice: [string, number, number, number, number, number, number, number?][] = [];
  const lamps: [string, number, number, number, number, number, number, number?][] = [];
  for (let x = -260; x <= 260; x += 20) {
    const z = riverZ(x);
    const ry = -Math.atan2(riverZ(x + 10) - riverZ(x - 10), 20);
    ice.push(["#7fb4e6", 22, 0.5, 30, x, Y0 + 0.1, z, ry], ["#a9d2f4", 22, 0.5, 13, x, Y0 + 0.2, z, ry]);
  }
  for (const bx of [-140, -56, 84, 168]) {
    const z = riverZ(bx);
    ice.push(["#e9eef8", 9, 1.2, 46, bx, Y0 + 2.2, z], ["#2b4a8a", 10, 0.5, 47, bx, Y0 + 1.4, z]);
    for (let k = -2; k <= 2; k++) for (const sx of [-1, 1]) lamps.push([GOLD, 0.9, 0.9, 0.9, bx + sx * 4.2, Y0 + 3.6, z + k * 9]);
  }
  // a round square under the NU7 TOWER, the GREAT PYRAMID of glass and the ZK MALL's great tent across the river
  ice.push(["#c8d7f4", 34, 0.6, 34, 24, Y0 + 0.2, -64], ["#e9eef8", 26, 0.9, 26, 24, Y0 + 0.5, -64]);
  boxes(scene, ice);
  boxes(scene, lamps, true);
  const pyr = new THREE.Mesh(GEO.cone, toon("#9fc6ee", "#16345e"));
  pyr.scale.set(44, 30, 44);
  pyr.position.set(-96, Y0 + 15, -128);
  pyr.rotation.y = Math.PI / 4;
  pyr.userData.noShadow = true;
  scene.add(pyr);
  const tip = new THREE.Mesh(GEO.cone, glow(GOLD));
  tip.scale.set(13, 9, 13);
  tip.position.set(-96, Y0 + 26, -128);
  tip.rotation.y = Math.PI / 4;
  scene.add(tip);
  const tent = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 14), glow("#ffd9a0", 0.9));
  tent.scale.set(46, 44, 40);
  tent.position.set(104, Y0 + 22, -150);
  tent.rotation.z = -0.12;
  scene.add(tent);
  const mast = new THREE.Mesh(GEO.box, glow("#fff3c8"));
  mast.scale.set(0.8, 14, 0.8);
  mast.position.set(101.5, Y0 + 50, -150);
  scene.add(mast);
  // firs along the embankment, pennants on the banner poles
  const firs: { x: number; y: number; z: number; s: number; c: string; tip?: string }[] = [];
  for (let k = 0; k < 90; k++) {
    const x = -250 + cos() * 500;
    const side = cos() < 0.5 ? -1 : 1;
    firs.push({ x, y: Y0 + 0.3, z: riverZ(x) + side * (16.5 + cos() * 2.5), s: 2.6 + cos() * 1.8, c: k % 2 ? "#1f6a52" : "#2a8a66", tip: "#f4f8ff" });
  }
  trees(scene, firs);
  const pen = flags(
    scene,
    [-1, 1].flatMap((sx) => [-1.7, 1.7].map((dx) => ({ x: sx * 15.2 + dx, y: 9.75, z: -3, ry: 0.15, w: 1.5, h: 0.6, c: dx < 0 ? "#1bb4e0" : GOLD, c2: "#ffffff" }))),
  );

  // fireworks over the city behind the block, sky lanterns rising past the plaza
  const fw = new Fireworks(scene, { x0: -36, x1: 36, y0: -7, y1: 5, z0: -46, z1: -34, every: 1.5, colors: [GOLD, BLUE, "#ff6fd0", "#7dffb2", "#ffffff"] });
  // (the lanterns well behind the block and under the floor's level: nothing near the pads that reads as a pickup)
  const lanterns = new Fall(scene, 30, new THREE.MeshBasicMaterial({ color: "#ffb45a" }), { x: 0, z: -78, w: 150, d: 50, y0: -40, y1: -3, v: -1.1, size: [0.7, 0.9, 0.7], drift: 0.6 });
  const snow = new Fall(scene, 170, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85 }), { x: 0, z: -2, w: 46, d: 40, y0: -4, y1: 24, v: 2.1, size: [0.11, 0.11, 0.11], drift: 0.7 });

  let dir = 1;
  const gold = new THREE.Color(GOLD),
    warmW = new THREE.Color("#fff3c8"),
    flare = new THREE.Color("#ff6b35"),
    dim = new THREE.Color("#6a5a2a");
  return {
    tick(dt: number, st: SetState) {
      const t = st.t;
      snow.tick(dt, t, 0.4);
      town.tick(t);
      pen.tick(t);
      fw.tick(dt);
      lanterns.tick(dt, t, 0.25);
      for (let k = 0; k < qbs.length; k++) {
        qbs[k].rotation.y = t * (0.9 + k * 0.3);
        qbs[k].position.y = (k ? 11.6 : 12.5) + Math.sin(t * 1.4 + k * 2) * 0.35;
      }
      halo.scale.setScalar(17 + Math.sin(t * 1.7) * 0.6);
      // the chevrons point the way it turns (or will turn back)
      const d = st.spin > 0.01 ? 1 : st.spin < -0.01 ? -1 : dir;
      if (d !== dir) ((dir = d), placeChevs(dir));
      const warn = st.warn > 0 && Math.floor(t * 10) % 2 === 0;
      chevM.color.copy(warn ? flare : Math.abs(st.spin) > 0.01 ? warmW : dim);
      chevM.opacity = Math.abs(st.spin) > 0.01 || warn ? 0.95 : 0.5;
      // the bulbs chase the turn
      const sp = Math.abs(st.spin);
      for (let k = 0; k < NBULB; k++) {
        let b: number;
        if (st.warn > 0) b = warn ? 1 : 0.25;
        else if (sp > 0.01) b = 0.3 + 0.7 * Math.max(0, Math.sin(k * 0.9 + dir * t * 9));
        else b = 0.55 + 0.45 * Math.max(0, Math.sin(k * 0.45 + t * 2));
        col.copy(st.warn > 0 ? flare : gold).lerp(warmW, b * 0.5).multiplyScalar(0.35 + b * 0.75);
        bulbs.setColorAt(k, col);
      }
      if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    },
  };
}
