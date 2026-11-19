/**
 * LASER SWEEP's arenas: the deck (its floor, its side, what hangs under it) and the world round it,
 * for each level of levels.ts. The game (laser.ts) adds the core, the arms and the rim's bulbs, and
 * turns the turntable (`spin`) when the level has one.
 */
import * as THREE from "three";
import { FONT, rng } from "../../kit";
import { touchy } from "../../hud";
import { Fx3, GEO, canvasTex, glow, label, outline, qBlock, skyDome, toon, toonSteps } from "../../k3";
import { city } from "../forge-levels/city";
import { liquid } from "../tiles-levels/liquid";
import { R, type LaserLevel } from "./levels";

const TAU = Math.PI * 2;

export interface Arena {
  /** The turntable's group (the game turns it), null without one. */
  spin: THREE.Group | null;
  /** The turntable's arrows: the way it turns (±1), the warning before a switch (0…1 blinking amber), lit or not. */
  arrows(dir: number, warn: boolean, on: boolean, t: number): void;
  /** Each frame: the clock, the step, the turntable's speed (rad/s). */
  tick(t: number, dt: number, w: number): void;
}

// ---- the floor ------------------------------------------------------------------------------------

/**
 * The deck's tiles in rings round the core, the hazard stripes at the inner rail, the band at the rim.
 * (`rad`: the radius of the shape it is mapped on, whose edge is the canvas's: the same paint at any size.)
 */
function paintFloor(g: CanvasRenderingContext2D, lv: LaserLevel, rad = R + 0.12) {
  const c = 512,
    k = (512 / R) * ((R + 0.12) / rad);
  const f = lv.look.floor;
  const bands = lv.rings;
  const N = lv.tiles;
  g.fillStyle = f.base;
  g.fillRect(0, 0, 1024, 1024);
  for (let b = 0; b < bands.length - 1; b++)
    for (let j = 0; j < N; j++) {
      const a0 = (j / N) * TAU,
        a1 = ((j + 1) / N) * TAU;
      g.beginPath();
      g.arc(c, c, bands[b + 1] * k, a0, a1);
      g.arc(c, c, bands[b] * k, a1, a0, true);
      g.closePath();
      g.fillStyle = (b + j) % 2 ? f.a : f.b;
      g.fill();
    }
  // the seams
  const last = bands[bands.length - 1];
  g.strokeStyle = f.seam;
  g.lineWidth = 5;
  for (const r of bands) {
    g.beginPath();
    g.arc(c, c, r * k, 0, TAU);
    g.stroke();
  }
  for (let j = 0; j < N; j++) {
    const a = (j / N) * TAU;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * bands[0] * k, c + Math.sin(a) * bands[0] * k);
    g.lineTo(c + Math.cos(a) * last * k, c + Math.sin(a) * last * k);
    g.stroke();
  }
  // a light edge inside each seam (the tiles' bevel)
  g.strokeStyle = f.bevel;
  g.lineWidth = 3;
  for (const r of bands.slice(0, -1)) {
    g.beginPath();
    g.arc(c, c, r * k + 5, 0, TAU);
    g.stroke();
  }
  // a station's floor: rivets at the tiles' corners
  if (lv.ring) {
    g.fillStyle = "rgba(220,235,255,0.35)";
    for (let b = 0; b < bands.length - 1; b++)
      for (let j = 0; j < N; j++) {
        const a = ((j + 0.5) / N) * TAU,
          r = (bands[b] + bands[b + 1]) / 2;
        g.fillRect(c + Math.cos(a) * r * k - 3, c + Math.sin(a) * r * k - 3, 6, 6);
      }
  }
  // stencilled marks on the tiles (the foundry's name, the station's deck number), along the circle
  const mark = lv.band ? "EQUIHASH" : lv.ring ? "DECK Z-7" : "";
  if (mark) {
    const rm = lv.band ? (bands[1] + bands[2]) / 2 : (bands[2] + bands[3]) / 2;
    g.font = `900 ${Math.round(0.42 * k)}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = lv.band ? "rgba(255,196,110,0.36)" : "rgba(200,230,255,0.28)";
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * TAU + 0.4;
      g.save();
      g.translate(c + Math.cos(a) * rm * k, c + Math.sin(a) * rm * k);
      g.rotate(a + Math.PI / 2);
      g.fillText(mark, 0, 0);
      g.restore();
    }
  }
  // hazard stripes at the inner rail
  const rin = lv.rin,
    n = Math.round((40 * rin) / 1.6),
    w = (0.08 * 1.6) / rin;
  g.save();
  g.beginPath();
  g.arc(c, c, (rin + 0.15) * k, 0, TAU);
  g.arc(c, c, (rin - 0.35) * k, 0, TAU, true);
  g.clip();
  g.fillStyle = f.stripeBg;
  g.fillRect(0, 0, 1024, 1024);
  g.fillStyle = f.stripe;
  for (let j = 0; j < n; j++) {
    const a = (j / n) * TAU;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * (rin - 0.4) * k, c + Math.sin(a) * (rin - 0.4) * k);
    g.lineTo(c + Math.cos(a + w) * (rin - 0.4) * k, c + Math.sin(a + w) * (rin - 0.4) * k);
    g.lineTo(c + Math.cos(a + 2 * w) * (rin + 0.2) * k, c + Math.sin(a + 2 * w) * (rin + 0.2) * k);
    g.lineTo(c + Math.cos(a + w) * (rin + 0.2) * k, c + Math.sin(a + w) * (rin + 0.2) * k);
    g.closePath();
    g.fill();
  }
  g.restore();
  if (lv.band) return;
  // the band at the edge, its studs
  g.beginPath();
  g.arc(c, c, 7.6 * k, 0, TAU);
  g.arc(c, c, 6.95 * k, 0, TAU, true);
  g.fillStyle = f.rim;
  g.fill("evenodd");
  g.strokeStyle = f.rimInk;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(c, c, 6.98 * k, 0, TAU);
  g.stroke();
  g.fillStyle = f.stud;
  for (let j = 0; j < 48; j++) {
    const a = (j / 48) * TAU;
    g.beginPath();
    g.arc(c + Math.cos(a) * 7.24 * k, c + Math.sin(a) * 7.24 * k, 5, 0, TAU);
    g.fill();
  }
}

/** The turntable's ring: warm steel plates, rivets, a dashed inner edge (it shows it turning), the rim. */
function paintBand(g: CanvasRenderingContext2D, lv: LaserLevel) {
  const c = 512,
    k = 512 / R;
  const r0 = lv.band;
  g.fillStyle = "#24201e";
  g.fillRect(0, 0, 1024, 1024);
  const bands = [r0, r0 + 0.75, r0 + 1.5, r0 + 2.15, 6.95];
  const N = 28;
  for (let b = 0; b < bands.length - 1; b++)
    for (let j = 0; j < N; j++) {
      const a0 = ((j + (b % 2) * 0.5) / N) * TAU,
        a1 = ((j + 1 + (b % 2) * 0.5) / N) * TAU;
      g.beginPath();
      g.arc(c, c, bands[b + 1] * k, a0, a1);
      g.arc(c, c, bands[b] * k, a1, a0, true);
      g.closePath();
      // (warm steel plates, three close tones: calm under the arrows, the snarks and the beams)
      g.fillStyle = (b + j) % 3 === 0 ? "#8c8278" : (b + j) % 3 === 1 ? "#80766c" : "#877d72";
      g.fill();
      // rivets
      g.fillStyle = "#a89c8e";
      for (const [u, v] of [
        [0.08, 0.15],
        [0.92, 0.15],
        [0.08, 0.85],
        [0.92, 0.85],
      ]) {
        const a = a0 + u * (a1 - a0),
          r = bands[b] + v * (bands[b + 1] - bands[b]);
        g.beginPath();
        g.arc(c + Math.cos(a) * r * k, c + Math.sin(a) * r * k, 2.6, 0, TAU);
        g.fill();
      }
    }
  g.strokeStyle = "#3a332e";
  g.lineWidth = 4;
  for (const r of bands) {
    g.beginPath();
    g.arc(c, c, r * k, 0, TAU);
    g.stroke();
  }
  // the inner edge: white and dark dashes, the groove between what turns and what stands
  const D = 40;
  for (let j = 0; j < D; j++) {
    g.beginPath();
    g.arc(c, c, (r0 + 0.2) * k, (j / D) * TAU, ((j + 1) / D) * TAU);
    g.arc(c, c, (r0 + 0.04) * k, ((j + 1) / D) * TAU, (j / D) * TAU, true);
    g.closePath();
    g.fillStyle = j % 2 ? "#f2ede4" : "#2a2522";
    g.fill();
  }
  // the rim: dark steel, amber lamps
  g.beginPath();
  g.arc(c, c, 7.6 * k, 0, TAU);
  g.arc(c, c, 6.95 * k, 0, TAU, true);
  g.fillStyle = "#4a433e";
  g.fill("evenodd");
  g.strokeStyle = "#1a1714";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(c, c, 6.98 * k, 0, TAU);
  g.stroke();
  for (let j = 0; j < 36; j++) {
    const a = (j / 36) * TAU;
    g.fillStyle = j % 3 === 0 ? "#ffcf7a" : "#7a6a58";
    g.beginPath();
    g.arc(c + Math.cos(a) * 7.24 * k, c + Math.sin(a) * 7.24 * k, j % 3 === 0 ? 6 : 4, 0, TAU);
    g.fill();
  }
}

function sideTex(lv: LaserLevel, ridges: boolean) {
  const sd = lv.look.side;
  const t = canvasTex(
    256,
    64,
    (g) => {
      g.fillStyle = sd.base;
      g.fillRect(0, 0, 256, 64);
      g.fillStyle = sd.top;
      g.fillRect(0, 0, 256, 9);
      g.fillStyle = sd.bottom;
      g.fillRect(0, 52, 256, 12);
      g.fillStyle = sd.panel;
      if (ridges) for (let x = 0; x < 256; x += 32) g.fillRect(x + 4, 14, 14, 34);
      else for (let x = 0; x < 256; x += 64) g.fillRect(x + 6, 16, 52, 30);
    },
    true,
  );
  t.repeat.set(18, 1);
  return t;
}

/** A glowing ring lying flat (a lip, a band of light). */
function hoop(s: THREE.Object3D, r: number, tube: number, y: number, mat: THREE.Material, seg = 140) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.y = y;
  s.add(m);
  return m;
}

const NOARROWS = () => {};

/** A deck's floor, painted on a 1024 grid: twice as fine on a computer (a phone keeps the memory). */
function floorTex(paint: (g: CanvasRenderingContext2D) => void) {
  const k = touchy() ? 1 : 2;
  const t = canvasTex(1024 * k, 1024 * k, (g) => {
    g.scale(k, k);
    paint(g);
  });
  t.anisotropy = 8;
  return t;
}

/** Long soft cones of light in one draw (searchlights, lamp shafts), bright at their source; `aim` points one. */
function shafts(s: THREE.Scene, colors: string[], opacity: number, r0: number, r1: number) {
  const geo = new THREE.CylinderGeometry(r1, r0, 1, 20, 1, true);
  geo.translate(0, 0.5, 0);
  const tex = canvasTex(4, 64, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#000000");
    gr.addColorStop(0.6, "#4a4a4a");
    gr.addColorStop(1, "#ffffff");
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 64);
  });
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), colors.length);
  const c = new THREE.Color();
  colors.forEach((col, i) => mesh.setColorAt(i, c.set(col)));
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  s.add(mesh);
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    d = new THREE.Vector3(),
    p = new THREE.Vector3(),
    sc = new THREE.Vector3();
  return (i: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number) => {
    q.setFromUnitVectors(up, d.set(dx, dy, dz).normalize());
    mesh.setMatrixAt(i, m4.compose(p.set(x, y, z), q, sc.set(1, len, 1)));
    mesh.instanceMatrix.needsUpdate = true;
  };
}

/** Little lights in two draws (a hot core and a soft halo round it): lanterns, beacons, ingots. */
class Glows {
  readonly core: THREE.InstancedMesh;
  readonly halo: THREE.InstancedMesh;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private c = new THREE.Color();
  constructor(
    s: THREE.Scene,
    n: number,
    private haloK: number,
    haloA: number,
    geo: THREE.BufferGeometry = GEO.ball,
  ) {
    this.core = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    this.halo = new THREE.InstancedMesh(GEO.ball, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: haloA, blending: THREE.AdditiveBlending, depthWrite: false }), n);
    for (const m of [this.core, this.halo]) {
      m.frustumCulled = false;
      m.raycast = () => {};
      for (let i = 0; i < n; i++) m.setColorAt(i, this.c.set(0xffffff));
      s.add(m);
    }
  }
  /** Place one: where, its size (x, y, z), its turn about y; its colour (unchanged when null), lit 0…1. */
  set(i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, col: THREE.ColorRepresentation | null, lit = 1) {
    this.q.setFromAxisAngle(Y, yaw);
    this.core.setMatrixAt(i, this.m4.compose(this.p.set(x, y, z), this.q, this.sc.set(sx, sy, sz)));
    const h = Math.max(sx, sy, sz) * this.haloK * (0.35 + 0.65 * lit);
    this.halo.setMatrixAt(i, this.m4.compose(this.p, this.q, this.sc.set(h, h, h)));
    if (col !== null) {
      this.c.set(col).multiplyScalar(0.25 + 0.75 * lit);
      this.core.setColorAt(i, this.c);
      this.halo.setColorAt(i, this.c);
    }
  }
  commit(colors = false) {
    this.core.instanceMatrix.needsUpdate = this.halo.instanceMatrix.needsUpdate = true;
    if (colors && this.core.instanceColor && this.halo.instanceColor) this.core.instanceColor.needsUpdate = this.halo.instanceColor.needsUpdate = true;
  }
}
const Y = new THREE.Vector3(0, 1, 0);

/** The world's own sparks (fireworks, embers, puffs): one draw, unfogged so the far ones still sing. */
function bgFx(s: THREE.Scene, cap: number) {
  const fx = new Fx3(s, cap);
  (fx.mesh.material as THREE.MeshBasicMaterial).fog = false;
  return fx;
}

// ---- NEON CORE: the disc over the night city --------------------------------------------------------

function neon(lv: LaserLevel, s: THREE.Scene): Arena {
  const D = rng(0x9e0a);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 0.12, 120), new THREE.MeshToonMaterial({ map: floorTex((g) => paintFloor(g, lv)), gradientMap: toonSteps() }));
  floor.rotation.x = -Math.PI / 2;
  s.add(floor);
  const side = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.8, 96, 1, true), new THREE.MeshToonMaterial({ map: sideTex(lv, false), gradientMap: toonSteps() }));
  side.position.y = -0.4;
  s.add(side);
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.05, 1.5, 3.6, 48, 1, true), toon("#2f2468"));
  belly.position.y = -0.8 - 1.8;
  s.add(belly);
  for (const [y, c] of [
    [-1.5, "#ff5fa2"],
    [-2.9, "#2ee6ff"],
  ] as const)
    hoop(s, R + 0.05 + (1.5 - R - 0.05) * ((-0.8 - y) / 3.6) + 0.05, 0.1, y, glow(c), 80);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), glow("#c9a6ff"));
  gem.scale.set(1, 1.6, 1);
  gem.position.y = -5.4;
  s.add(gem);
  const gemHalo = new THREE.Mesh(GEO.ball, glow("#a070ff", 0.25, true));
  gemHalo.scale.setScalar(4.2);
  gemHalo.position.y = -5.4;
  s.add(gemHalo);
  hoop(s, R + 0.12, 0.13, 0.04, glow(lv.look.lip));
  hoop(s, R + 0.12, 0.34, 0.04, glow(lv.look.lipGlow, 0.3, true));

  // round about: Z-Blocks hanging in the night, the city far below, the stars
  const qbs: { m: THREE.Mesh; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.4;
    const m = qBlock(1.1);
    const y = 1.6 + (i % 3) * 1.1;
    m.position.set(Math.cos(a) * 11.8, y, Math.sin(a) * 11.8);
    m.rotation.y = a;
    s.add(m);
    qbs.push({ m, y });
  }
  // the night city far below: blocks of towers with their windows lit, the avenues' lamps, the traffic;
  // the sky all round it (the intro and the card see the horizon): stars, the milky band, a moon
  const town = city(s, {
    y: -75,
    night: true,
    n: 11,
    pitch: 17,
    top: () => -37,
    h: [8, 26, 22],
    walls: ["#4a3f86", "#3a3672", "#5a4a96", "#40407c", "#352f66", "#584080"],
    lot: "#1b1638",
    road: "#120e28",
    line: "#c98a4a",
    park: "#173a3a",
    rnd: D,
    cars: 56,
  });
  const dome = skyDome(s, { sky: [lv.look.sky[0], lv.look.sky[1]], ground: lv.look.sky[1], stars: 760, band: true, disc: { az: 300, el: 34, moon: true, size: 8 }, haze: 0.45, rnd: D });

  // ---- the night's life: searchlights from the city, paper lanterns round the disc, hover taxis in
  // their lanes below, the ZSTREET BLIMP on its round, fireworks over the towers
  const NEONS = ["#ff7ad1", "#7fe0ff", "#ffe36b", "#b98cff"];
  const aim = shafts(s, ["#b9a6ff", "#ff7ad1", "#7fe0ff", "#ffe3a0", "#c9a6ff"], 0.2, 1.3, 9);
  const beams = [0.3, 1.6, 2.5, 3.7, 5.0].map((a, i) => ({ x: Math.cos(a) * (44 + i * 5), z: Math.sin(a) * (44 + i * 5), ph: i * 1.9, w: 0.23 + i * 0.04 }));
  const NL = 16;
  const lan = new Glows(s, NL, 1.9, 0.22);
  const lans = Array.from({ length: NL }, (_, i) => ({ a: (i / NL) * TAU + (i % 2) * 0.17, r: 12.6 + ((i * 7) % 5) * 0.9, y: -2.2 + ((i * 5) % 4) * 1.1, ph: i * 1.31, c: NEONS[i % 4] }));
  lans.forEach((l, i) => lan.set(i, 0, -500, 0, 0.42, 0.56, 0.42, 0, l.c));
  lan.commit(true);
  // (the traffic: streaks of light in three lanes low over the towers, like a long exposure)
  const LANES = [
    [30, -31, 0.16],
    [40, -28, -0.12],
    [52, -33, 0.09],
  ] as const;
  const NC = 24;
  const cars = new Glows(s, NC, 1.2, 0.25, GEO.box);
  const carA = Array.from({ length: NC }, (_, i) => ((i * 2.399) % TAU) + (i % 3) * 0.4);
  for (let i = 0; i < NC; i++) cars.set(i, 0, -500, 0, 2.6, 0.24, 0.24, 0, i % 2 ? "#ffe3a0" : NEONS[(i * 3) % 4]);
  cars.commit(true);
  // the blimp: a fat white hull with a pink stripe, fins, a gondola, its name on both flanks, a blinker
  const blimp = new THREE.Group();
  s.add(blimp);
  const hullTex = canvasTex(64, 64, (g) => {
    g.fillStyle = "#f4f0ff";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#ff5fa2";
    g.fillRect(0, 27, 64, 10);
    g.fillStyle = "#3ec6ff";
    g.fillRect(0, 38, 64, 3);
  });
  const hull = new THREE.Mesh(GEO.ball, new THREE.MeshToonMaterial({ map: hullTex, gradientMap: toonSteps() }));
  hull.scale.set(13, 4.2, 4.2);
  outline(hull, 0.09);
  blimp.add(hull);
  const fins = new THREE.InstancedMesh(GEO.box, toon("#ff5fa2"), 5);
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3();
  const finAt: [number, number, number, number, number, number][] = [
    [-5.6, 1.9, 0, 2.6, 2.2, 0.25],
    [-5.6, -1.9, 0, 2.6, 2.2, 0.25],
    [-5.6, 0, 1.9, 2.6, 0.25, 2.2],
    [-5.6, 0, -1.9, 2.6, 0.25, 2.2],
    [0.6, -2.35, 0, 3.4, 1.0, 1.3],
  ];
  finAt.forEach(([x, y, z, w, h, d], i) => fins.setMatrixAt(i, m4.compose(v.set(x, y, z), q, sc.set(w, h, d))));
  fins.raycast = () => {};
  blimp.add(fins);
  for (const side of [1, -1]) {
    const name = label("ZSTREET", 1.9, "#ffffff", "rgba(255,95,162,0.95)");
    name.position.set(1.2, 0.1, side * 2.12);
    if (side < 0) name.rotation.y = Math.PI;
    blimp.add(name);
  }
  const blink = new THREE.Mesh(GEO.ball, glow("#ff3a5a"));
  blink.scale.setScalar(0.5);
  blink.position.set(-6.9, 2.9, 0);
  blimp.add(blink);
  blimp.scale.setScalar(1.15);
  const fw = bgFx(s, 420);
  const at = new THREE.Vector3();
  let fwT = 0.6;
  return {
    spin: null,
    arrows: NOARROWS,
    tick(t, dt) {
      for (const [i, q] of qbs.entries()) {
        q.m.rotation.y += dt * 0.9;
        q.m.position.y = q.y + Math.sin(t * 1.4 + i * 1.7) * 0.35;
      }
      town.update(t);
      dome.rotation.y = t * 0.003;
      beams.forEach((b, i) => aim(i, b.x, -75, b.z, Math.sin(t * b.w + b.ph) * 0.5, 1, Math.cos(t * b.w * 0.8 + b.ph) * 0.5, 125));
      lans.forEach((l, i) => {
        const a = l.a + t * 0.05;
        lan.set(i, Math.cos(a) * l.r, l.y + Math.sin(t * 1.1 + l.ph) * 0.45, Math.sin(a) * l.r, 0.42, 0.56, 0.42, a, null, 0.8 + 0.2 * Math.sin(t * 3 + l.ph));
      });
      lan.commit();
      for (let i = 0; i < NC; i++) {
        const [r, y, w] = LANES[i % 3];
        const a = carA[i] + t * w;
        cars.set(i, Math.cos(a) * r, y, Math.sin(a) * r, 2.6, 0.24, 0.24, -a - Math.PI / 2, null);
      }
      cars.commit();
      const ba = -Math.PI / 2 - 0.9 + t * 0.045;
      blimp.position.set(Math.cos(ba) * 56, -25 + Math.sin(t * 0.4) * 0.6, Math.sin(ba) * 56);
      blimp.rotation.y = -ba - Math.PI / 2;
      blink.visible = Math.floor(t * 2) % 2 === 0;
      if (dt <= 0) return;
      fwT -= dt;
      if (fwT <= 0) {
        fwT = 1.1 + D() * 1.3;
        const a = -Math.PI / 2 + (D() - 0.5) * 2.8,
          r = 38 + D() * 20;
        const c0 = NEONS[(D() * 4) | 0];
        fw.burst(at.set(Math.cos(a) * r, -26 + D() * 15, Math.sin(a) * r), 46, [c0, "#ffffff", c0, NEONS[(D() * 4) | 0]], { speed: 11, up: 1, gravity: 3.5, size: 0.55, life: 1.5, drag: 1.5 });
      }
      fw.update(dt);
    },
  };
}

// ---- ORBIT RING: a ring deck on a station over the Earth ---------------------------------------------

const ATMO_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const ATMO_FRAG = /* glsl */ `
uniform vec3 uC;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = 1.0 - max(0.0, dot(normalize(vN), normalize(vV)));
  f = pow(f, 3.4);
  gl_FragColor = vec4(uC * f * 0.9, 1.0);
  #include <colorspace_fragment>
}`;

/** The Earth, an equirectangular toy map: blue seas, green and sand lands, white caps and clouds. */
function paintEarth(g: CanvasRenderingContext2D) {
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sea = g.createLinearGradient(0, 0, 0, 256);
  sea.addColorStop(0, "#2f7fd6");
  sea.addColorStop(0.5, "#1f66c4");
  sea.addColorStop(1, "#2f7fd6");
  g.fillStyle = sea;
  g.fillRect(0, 0, 512, 256);
  // the lands: clumps of round blobs, green with sandy middles
  const lands = [
    [90, 90, 46],
    [130, 150, 34],
    [270, 80, 60],
    [300, 140, 40],
    [390, 170, 30],
    [430, 85, 44],
    [200, 190, 22],
  ];
  for (const [x, y, s] of lands)
    for (let i = 0; i < 14; i++) {
      const a = r() * TAU,
        d = r() * s;
      const bx = x + Math.cos(a) * d,
        by = y + Math.sin(a) * d * 0.6,
        br = 8 + r() * s * 0.45;
      g.fillStyle = i % 4 === 0 ? "#d9c27a" : i % 3 ? "#5fbf4a" : "#4aa83e";
      g.beginPath();
      g.ellipse(bx, by, br, br * 0.7, 0, 0, TAU);
      g.fill();
    }
  // the caps
  g.fillStyle = "#f4f8ff";
  g.fillRect(0, 0, 512, 16);
  g.fillRect(0, 242, 512, 14);
  // the clouds: soft white streaks
  for (let i = 0; i < 46; i++) {
    g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.35})`;
    const x = r() * 512,
      y = 20 + r() * 216;
    g.beginPath();
    g.ellipse(x, y, 14 + r() * 30, 3 + r() * 5, (r() - 0.5) * 0.4, 0, TAU);
    g.fill();
  }
}

function orbit(lv: LaserLevel, s: THREE.Scene): Arena {
  const D = rng(0x0b17);
  const rin = lv.rin;
  const floor = new THREE.Mesh(new THREE.RingGeometry(rin - 0.35, R + 0.12, 120, 1), new THREE.MeshToonMaterial({ map: floorTex((g) => paintFloor(g, lv)), gradientMap: toonSteps() }));
  floor.rotation.x = -Math.PI / 2;
  s.add(floor);
  const sideM = new THREE.MeshToonMaterial({ map: sideTex(lv, true), gradientMap: toonSteps(), side: THREE.DoubleSide });
  const side = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.8, 96, 1, true), sideM);
  side.position.y = -0.4;
  s.add(side);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(rin - 0.35, rin - 0.35, 0.8, 64, 1, true), sideM);
  inner.position.y = -0.4;
  s.add(inner);
  hoop(s, R + 0.12, 0.13, 0.04, glow(lv.look.lip));
  hoop(s, R + 0.12, 0.34, 0.04, glow(lv.look.lipGlow, 0.3, true));
  hoop(s, rin - 0.35, 0.1, 0.04, glow(lv.look.lip), 80);
  hoop(s, rin - 0.35, 0.28, 0.04, glow(lv.look.lipGlow, 0.3, true), 80);
  // the hull under the ring, its belt of light
  const hull = new THREE.Mesh(new THREE.TorusGeometry((R + rin) / 2 - 0.1, (R - rin) / 2 + 0.1, 12, 72), toon("#cfd8e6"));
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(1, 1, 0.42);
  hull.position.y = -0.95;
  s.add(hull);
  hoop(s, R + 0.02, 0.09, -1.0, glow("#4fb8ff"), 96);
  hoop(s, rin - 0.25, 0.08, -1.0, glow("#ff5fa2"), 64);
  // the hub the core stands on, the four spokes to the ring, a mast and its dish under it
  const hub = new THREE.Mesh(GEO.cyl, toon("#3a4466"));
  hub.scale.set(2.7, 0.7, 2.7);
  hub.position.y = -0.36;
  s.add(hub);
  const mast = new THREE.Mesh(GEO.cyl, toon("#cfd8e6"));
  mast.scale.set(0.7, 5, 0.7);
  mast.position.y = -3.2;
  s.add(mast);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 8, 0, TAU, Math.PI * 0.6, Math.PI * 0.4), toon("#f4f7ff"));
  dish.position.y = -4.2;
  s.add(dish);
  const tip = new THREE.Mesh(GEO.ball, glow("#ff5fa2"));
  tip.scale.setScalar(0.45);
  tip.position.y = -6.1;
  s.add(tip);
  const struts = new THREE.InstancedMesh(GEO.box, toon("#cfd8e6"), 4 + 8);
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3();
  const len = rin - 1.3;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    q.setFromAxisAngle(up, -a);
    m4.compose(v.set(Math.cos(a) * (1.3 + len / 2), -0.42, Math.sin(a) * (1.3 + len / 2)), q, sc.set(len + 0.4, 0.34, 0.5));
    struts.setMatrixAt(i, m4);
  }
  // the solar wings: four booms out from the hull, two panels each
  const panels = new THREE.InstancedMesh(
    GEO.box,
    new THREE.MeshToonMaterial({
      gradientMap: toonSteps(),
      emissive: 0x0a1a3a,
      map: canvasTex(128, 64, (g) => {
        g.fillStyle = "#1c3f8f";
        g.fillRect(0, 0, 128, 64);
        g.fillStyle = "#2f62c8";
        for (let y = 2; y < 64; y += 10) for (let x = 2; x < 128; x += 10) g.fillRect(x, y, 8, 8);
        g.fillStyle = "#e9eef7";
        g.fillRect(0, 0, 128, 2);
        g.fillRect(0, 62, 128, 2);
      }),
    }),
    8,
  );
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4 + 0.35;
    q.setFromAxisAngle(up, -a);
    m4.compose(v.set(Math.cos(a) * (R + 2.6), -1.1, Math.sin(a) * (R + 2.6)), q, sc.set(4.6, 0.16, 0.3));
    struts.setMatrixAt(4 + i * 2, m4);
    m4.compose(v.set(Math.cos(a) * (R + 0.6), -1.1, Math.sin(a) * (R + 0.6)), q, sc.set(0.7, 0.6, 0.7));
    struts.setMatrixAt(5 + i * 2, m4);
    for (let k = 0; k < 2; k++) {
      const d = R + 1.7 + k * 2.3;
      m4.compose(v.set(Math.cos(a) * d, -1.1, Math.sin(a) * d), q, sc.set(2.0, 0.08, 3.4));
      panels.setMatrixAt(i * 2 + k, m4);
    }
  }
  struts.raycast = panels.raycast = () => {};
  s.add(struts, panels);
  // the Earth far below (the sun lights half of it), its air, the Moon, the Sun, the stars
  // (unlit: the toy colours as painted, not burnt white by the station's strong light)
  const earth = new THREE.Mesh(new THREE.SphereGeometry(170, 48, 32), new THREE.MeshBasicMaterial({ map: canvasTex(512, 256, paintEarth), color: "#a4b6dc" }));
  earth.position.set(0, -255, -60);
  earth.rotation.set(0.35, 0.8, 0.1);
  s.add(earth);
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(176, 48, 32),
    new THREE.ShaderMaterial({ vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, uniforms: { uC: { value: new THREE.Color("#6fc8ff") } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  atmo.position.copy(earth.position);
  s.add(atmo);
  const moon = new THREE.Mesh(GEO.ball, toon("#d6d8e4"));
  moon.scale.setScalar(16);
  moon.position.set(-150, 40, -240);
  s.add(moon);
  const sunTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.18, "rgba(255,250,225,1)");
    gr.addColorStop(0.35, "rgba(255,220,150,0.45)");
    gr.addColorStop(1, "rgba(255,180,90,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sun.scale.setScalar(90);
  sun.position.set(-260, 120, -200);
  s.add(sun);
  // (space all round: the stars and the milky band, no haze, no ground)
  const dome = skyDome(s, { sky: [lv.look.sky[0], "#060c2c"], ground: "#03061a", stars: 1300, band: true, haze: 0, rnd: D });
  // Z-Blocks adrift, tumbling
  const qbs: { m: THREE.Mesh; y: number; ax: number; ay: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.2;
    const m = qBlock(1.0);
    const y = 1.2 + (i % 3) * 1.4;
    m.position.set(Math.cos(a) * 11.5, y, Math.sin(a) * 11.5);
    s.add(m);
    qbs.push({ m, y, ax: 0.3 + (i % 3) * 0.2, ay: 0.5 - (i % 2) * 0.9 });
  }

  // ---- life in orbit: the clouds drift over the Earth, a satellite comes round, the wings' beacons
  // blink, the hull's thrusters puff, meteors streak through the air far below
  const cloudTex = canvasTex(512, 256, (g) => {
    let seed = 23;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.clearRect(0, 0, 512, 256);
    for (let i = 0; i < 70; i++) {
      const x = r() * 512,
        y = 24 + r() * 208,
        w = 10 + r() * 34;
      for (let k = 0; k < 4; k++) {
        g.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.4})`;
        g.beginPath();
        g.ellipse(x + (k - 1.5) * w * 0.5, y + (r() - 0.5) * 6, w * 0.45, 3 + r() * 5, (r() - 0.5) * 0.3, 0, TAU);
        g.fill();
      }
    }
  });
  const cloudsM = new THREE.Mesh(new THREE.SphereGeometry(171.5, 48, 32), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.72, depthWrite: false, color: "#dfe8ff" }));
  cloudsM.position.copy(earth.position);
  cloudsM.rotation.copy(earth.rotation);
  s.add(cloudsM);
  // the satellite: a gold-foil box, two blue wings, a dish, a blinker
  const sat = new THREE.Group();
  s.add(sat);
  const body = block3(sat, "#ffcf5a", 1.1, 1.1, 1.6, 0, 0, 0);
  outline(body, 0.05);
  for (const k of [1, -1]) {
    const wing = new THREE.Mesh(GEO.box, panels.material as THREE.Material);
    wing.scale.set(2.6, 0.06, 1.1);
    wing.position.set(k * 2.0, 0, 0);
    sat.add(wing);
  }
  const satDish = new THREE.Mesh(GEO.cone, toon("#f4f7ff"));
  satDish.scale.set(0.9, 0.5, 0.9);
  satDish.position.set(0, 0, 1.05);
  satDish.rotation.x = Math.PI / 2;
  sat.add(satDish);
  const satBlink = new THREE.Mesh(GEO.ball, glow("#7cff6b"));
  satBlink.scale.setScalar(0.28);
  satBlink.position.set(0, 0.7, 0);
  sat.add(satBlink);
  // the beacons: at the wings' tips and round the hull
  const NBe = 12;
  const bea = new Glows(s, NBe, 3.2, 0.3, GEO.box);
  const beaAt: [number, number, number, string][] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4 + 0.35;
    beaAt.push([Math.cos(a) * (R + 4.9), -1.0, Math.sin(a) * (R + 4.9), i % 2 ? "#ff3a5a" : "#7cff6b"]);
    beaAt.push([Math.cos(a - 0.9) * (R + 0.05), -1.0, Math.sin(a - 0.9) * (R + 0.05), "#ffffff"]);
    beaAt.push([Math.cos(a + 0.6) * (R + 0.05), -1.0, Math.sin(a + 0.6) * (R + 0.05), "#ffe36b"]);
  }
  const fx = bgFx(s, 240);
  const puff = ["#ffffff", "#cfe8ff", "#9ad8ff"];
  const at = new THREE.Vector3(),
    dir = new THREE.Vector3();
  let puffT = 1.2,
    dustT = 0;
  const met = new Glows(s, 2, 1.4, 0.25, GEO.box);
  const mets = [
    { t0: 2, x: 0, z: 0, dx: 0, dz: 0 },
    { t0: 6, x: 0, z: 0, dx: 0, dz: 0 },
  ];
  return {
    spin: null,
    arrows: NOARROWS,
    tick(t, dt) {
      for (const [i, b] of qbs.entries()) {
        b.m.rotation.x += dt * b.ax;
        b.m.rotation.y += dt * b.ay;
        b.m.position.y = b.y + Math.sin(t * 0.7 + i * 1.7) * 0.5;
      }
      earth.rotation.y += dt * 0.012;
      dome.rotation.y = t * 0.002;
      cloudsM.rotation.y += dt * 0.02;
      tip.visible = Math.floor(t * 1.5) % 2 === 0;
      const sa = t * 0.09 + 2.2;
      sat.position.set(Math.cos(sa) * 19, -6 + Math.sin(t * 0.5) * 0.8, Math.sin(sa) * 19);
      sat.rotation.set(0.3, -sa + t * 0.2, 0.15 * Math.sin(t * 0.7));
      satBlink.visible = Math.floor(t * 2.5) % 3 === 0;
      beaAt.forEach(([x, y, z, c], i) => {
        const on = Math.floor(t * 1.6 + i * 0.37) % 2 === 0;
        bea.set(i, x, y, z, 0.22, 0.22, 0.22, 0, c, on ? 1 : 0.15);
      });
      bea.commit(true);
      // two meteors, each streaking through the air far below now and then
      for (const [i, m] of mets.entries()) {
        const k = t - m.t0;
        if (k > 1.6) {
          m.t0 = t + 3 + D() * 5;
          const a = D() * TAU;
          m.x = Math.cos(a) * 70;
          m.z = Math.sin(a) * 70 - 20;
          const b = a + Math.PI + (D() - 0.5);
          m.dx = Math.cos(b) * 90;
          m.dz = Math.sin(b) * 90;
        }
        const on = k >= 0 && k <= 1.6;
        const yaw = Math.atan2(-m.dz, m.dx);
        met.set(i, on ? m.x + m.dx * k : 0, on ? -55 - k * 6 : -900, on ? m.z + m.dz * k : 0, 5.5, 0.35, 0.35, yaw, i ? "#ffd9a0" : "#bfe9ff", on ? Math.sin((k / 1.6) * Math.PI) : 0);
      }
      met.commit(true);
      if (dt <= 0) return;
      // the thrusters: a puff out of the hull's side now and then; stardust drifting round
      puffT -= dt;
      if (puffT <= 0) {
        puffT = 1.6 + D() * 2.2;
        const a = D() * TAU;
        dir.set(Math.cos(a) * 5, 0.4, Math.sin(a) * 5);
        fx.burst(at.set(Math.cos(a) * (R + 0.3), -0.9, Math.sin(a) * (R + 0.3)), 14, puff, { speed: 1.4, up: 0.2, gravity: 0, size: 0.32, life: 1.1, drag: 2.2, dir });
      }
      dustT += dt;
      while (dustT > 0.12) {
        dustT -= 0.12;
        const a = D() * TAU,
          r = 9 + D() * 14;
        fx.burst(at.set(Math.cos(a) * r, -6 + D() * 8, Math.sin(a) * r), 1, ["#ffffff", "#bfe9ff", "#ffe9a8"], { speed: 0.3, up: 0.2, gravity: -0.1, size: 0.09, life: 3, drag: 0.2 });
      }
      fx.update(dt);
    },
  };
}

// ---- PROOF FACTORY: the turntable over the molten metal ------------------------------------------------

/** A chevron lying flat, pointing +z (the turntable's arrows). */
function chevronGeo() {
  const sh = new THREE.Shape();
  sh.moveTo(-0.62, -0.35);
  sh.lineTo(0, 0.25);
  sh.lineTo(0.62, -0.35);
  sh.lineTo(0.62, 0.1);
  sh.lineTo(0, 0.7);
  sh.lineTo(-0.62, 0.1);
  sh.closePath();
  const g = new THREE.ShapeGeometry(sh);
  g.rotateX(Math.PI / 2);
  return g;
}

function foundry(lv: LaserLevel, s: THREE.Scene): Arena {
  const D = rng(0xf0d2);
  const rb = lv.band;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(rb + 0.03, 96), new THREE.MeshToonMaterial({ map: floorTex((g) => paintFloor(g, lv, rb + 0.03)), gradientMap: toonSteps() }));
  floor.rotation.x = -Math.PI / 2;
  s.add(floor);
  // the turntable: its ring of floor, its side, its teeth, its arrows (the game turns the group)
  const spin = new THREE.Group();
  s.add(spin);
  const band = new THREE.Mesh(new THREE.RingGeometry(rb - 0.02, R + 0.12, 120, 1), new THREE.MeshToonMaterial({ map: floorTex((g) => paintBand(g, lv)), gradientMap: toonSteps() }));
  band.rotation.x = -Math.PI / 2;
  band.position.y = 0.002;
  spin.add(band);
  const side = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.8, 96, 1, true), new THREE.MeshToonMaterial({ map: sideTex(lv, true), gradientMap: toonSteps() }));
  side.position.y = -0.4;
  spin.add(side);
  const NT = 64;
  const teeth = new THREE.InstancedMesh(GEO.box, toon("#5a524b"), NT);
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3();
  for (let i = 0; i < NT; i++) {
    const a = (i / NT) * TAU;
    q.setFromAxisAngle(up, -a);
    m4.compose(v.set(Math.cos(a) * (R + 0.3), -0.55, Math.sin(a) * (R + 0.3)), q, sc.set(0.42, 0.42, 0.3));
    teeth.setMatrixAt(i, m4);
  }
  teeth.raycast = () => {};
  spin.add(teeth);
  const NC = 12,
    rc = (rb + 6.95) / 2 + 0.05;
  const chevM = new THREE.MeshBasicMaterial({ color: "#f4efe6", side: THREE.DoubleSide });
  const chev = new THREE.InstancedMesh(chevronGeo(), chevM, NC);
  chev.position.y = 0.008;
  chev.raycast = () => {};
  spin.add(chev);
  let shownDir = 0;
  const amber = new THREE.Color("#ffae00"),
    dark = new THREE.Color("#4a3410"),
    white = new THREE.Color("#f4efe6"),
    dim = new THREE.Color("#8a7d6c");
  const point = (dir: number) => {
    shownDir = dir;
    for (let i = 0; i < NC; i++) {
      const a = (i / NC) * TAU + 0.13;
      // (pointing the way it turns: along the circle, φ growing for +1)
      q.setFromAxisAngle(up, Math.atan2(-dir * Math.sin(a), dir * Math.cos(a)));
      m4.compose(v.set(Math.cos(a) * rc, 0, Math.sin(a) * rc), q, sc.set(1.25, 1, 1.25));
      chev.setMatrixAt(i, m4);
    }
    chev.instanceMatrix.needsUpdate = true;
  };
  point(1);
  // the steel drum under it all, its heat, the shaft down to the metal
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.1, R - 1.6, 2.4, 48, 1, true), toon("#2e2926"));
  drum.position.y = -0.8 - 1.2;
  s.add(drum);
  hoop(s, R - 0.55, 0.12, -1.6, glow("#ff7a1a"), 96);
  hoop(s, R - 1.55, 0.14, -3.15, glow("#ffb347"), 80);
  const shaft = new THREE.Mesh(GEO.cyl, toon("#3b3633"));
  shaft.scale.set(3.2, 30, 3.2);
  shaft.position.y = -18;
  s.add(shaft);
  for (const y of [-6, -11, -16]) hoop(s, 1.65, 0.12, y, glow("#ff8a2e"), 40);
  hoop(s, R + 0.12, 0.13, 0.04, glow(lv.look.lip));
  hoop(s, R + 0.12, 0.34, 0.04, glow(lv.look.lipGlow, 0.3, true));
  // the pinion that drives it, at the back
  const pin = new THREE.Group();
  const pa = -Math.PI / 2 + 0.62;
  pin.position.set(Math.cos(pa) * (R + 1.42), -0.55, Math.sin(pa) * (R + 1.42));
  s.add(pin);
  const hubM = new THREE.Mesh(GEO.cyl, toon("#ffb347"));
  hubM.scale.set(1.9, 0.5, 1.9);
  outline(hubM, 0.04);
  pin.add(hubM);
  const PT = 10;
  const pteeth = new THREE.InstancedMesh(GEO.box, toon("#5a524b"), PT);
  for (let i = 0; i < PT; i++) {
    const a = (i / PT) * TAU;
    q.setFromAxisAngle(up, -a);
    m4.compose(v.set(Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05), q, sc.set(0.42, 0.42, 0.3));
    pteeth.setMatrixAt(i, m4);
  }
  pteeth.raycast = () => {};
  pin.add(pteeth);
  const motor = block3(s, "#2e2926", 1.4, 3, 1.4, pin.position.x, -2.5, pin.position.z);
  outline(motor, 0.04);

  // the hall: the molten river below, girders, furnaces, the ladles on their chains, a sign, the embers
  // (the river: big plates of dark crust, the melt glowing in the cracks: the deck and the beams stay the brightest things)
  const lavaT = liquid(s, { kind: "melt", y: -34, deep: "#170a0a", mid: "#2c120e", hot: "#f07814", foam: "#ffd27a", fog: lv.look.sky[1], cell: 0.9, near: lv.look.fog[0], far: lv.look.fog[1] + 60, glow: 0.6 });
  const NG = 12;
  const girders = new THREE.InstancedMesh(GEO.box, toon("#4c4652"), NG * 2 + 2);
  for (let i = 0; i < NG; i++) {
    const a = (i / NG) * TAU + 0.26,
      d = 31 + (i % 2) * 3;
    q.setFromAxisAngle(up, -a);
    m4.compose(v.set(Math.cos(a) * d, 12, Math.sin(a) * d), q, sc.set(1.8, 92, 1.8));
    girders.setMatrixAt(i, m4);
    const b = ((i + 0.5) / NG) * TAU + 0.26;
    q.setFromAxisAngle(up, -b + Math.PI / 2);
    m4.compose(v.set(Math.cos(b) * 31.5, 21, Math.sin(b) * 31.5), q, sc.set(1.1, 1.4, 2 * 32.5 * Math.sin(Math.PI / NG) + 1));
    girders.setMatrixAt(NG + i, m4);
  }
  q.identity();
  for (let k = 0; k < 2; k++) {
    m4.compose(v.set(k ? 11 : -11, 25, 0), q, sc.set(1.4, 1.6, 66));
    girders.setMatrixAt(NG * 2 + k, m4);
  }
  girders.raycast = () => {};
  s.add(girders);
  // the roof: trusses across the hall, the skylights between them (the shafts of light fall from these)
  const truss = new THREE.InstancedMesh(GEO.box, toon("#2e2a34"), 7);
  for (let i = 0; i < 7; i++) truss.setMatrixAt(i, m4.compose(v.set(0, 47, (i - 3) * 13), q.identity(), sc.set(120, 2.4, 1.6)));
  truss.raycast = () => {};
  const lights = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#cfe0ff", fog: false }), 12);
  for (let i = 0; i < 12; i++) lights.setMatrixAt(i, m4.compose(v.set(((i % 4) - 1.5) * 22, 48.4, (Math.floor(i / 4) - 1) * 26 - 3), q, sc.set(13, 0.3, 7)));
  lights.raycast = () => {};
  s.add(truss, lights);
  const lamps = new THREE.InstancedMesh(GEO.box, glow("#ffd9a0"), NG);
  for (let i = 0; i < NG; i++) {
    const a = (i / NG) * TAU + 0.26,
      d = 31 + (i % 2) * 3 - 1.2;
    q.setFromAxisAngle(up, -a);
    m4.compose(v.set(Math.cos(a) * d, 15, Math.sin(a) * d), q, sc.set(0.5, 1.1, 1.4));
    lamps.setMatrixAt(i, m4);
  }
  lamps.raycast = () => {};
  s.add(lamps);
  const ventTex = canvasTex(64, 128, (g) => {
    g.fillStyle = "#1e1714";
    g.fillRect(0, 0, 64, 128);
    // a hot mouth near the bottom, a glowing band at the top
    g.fillStyle = "#ff7a1a";
    g.fillRect(20, 100, 24, 16);
    g.fillStyle = "#ffb347";
    g.fillRect(24, 104, 16, 10);
    g.fillStyle = "#c2410c";
    g.fillRect(0, 4, 64, 5);
  });
  const NF = 26;
  const furn = new THREE.InstancedMesh(GEO.box, new THREE.MeshToonMaterial({ map: ventTex, gradientMap: toonSteps(), emissive: 0xffffff, emissiveMap: ventTex }), NF);
  let fs = 5;
  const fr = () => ((fs = (fs * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < NF; i++) {
    const a = (i / NF) * TAU + fr() * 0.08,
      d = 78 + fr() * 16,
      h = 16 + fr() * 22,
      w = 7 + fr() * 6;
    q.setFromAxisAngle(up, -a);
    m4.compose(v.set(Math.cos(a) * d, -34 + h / 2, Math.sin(a) * d), q, sc.set(w, h, w));
    furn.setMatrixAt(i, m4);
  }
  furn.raycast = () => {};
  s.add(furn);
  // three ladles of molten metal, one pouring
  const bucketG = new THREE.CylinderGeometry(1.5, 1.05, 2.1, 18);
  const ladles: { g: THREE.Group; a: number }[] = [];
  const chains = new THREE.InstancedMesh(GEO.box, toon("#6a625a"), 6);
  const spots: [number, number, number, number][] = [
    [-15, 8, -17, 0],
    [16, 10, -13, 0.65],
    [-17, 7, 10, 0],
  ];
  q.identity();
  spots.forEach(([x, y, z, tip], i) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    s.add(g);
    const b = new THREE.Mesh(bucketG, toon("#4a423c"));
    outline(b, 0.06);
    g.add(b);
    const melt = new THREE.Mesh(GEO.disc, glow("#ffcf5a"));
    melt.rotation.x = -Math.PI / 2;
    melt.scale.setScalar(2.8);
    melt.position.y = 0.95;
    g.add(melt);
    g.rotation.z = tip;
    ladles.push({ g, a: i * 2.1 });
    for (let k = 0; k < 2; k++) {
      m4.compose(v.set(x + (k ? 1.3 : -1.3), y + 18, z), q, sc.set(0.22, 34, 0.22));
      chains.setMatrixAt(i * 2 + k, m4);
    }
  });
  chains.raycast = () => {};
  s.add(chains);
  // (the pour: from the tipped one's lip down into the river)
  const pour = new THREE.Mesh(GEO.cyl, glow("#ffa53a"));
  const lip = new THREE.Vector3(16 - 1.45, 10 + 0.4, -13);
  pour.scale.set(0.55, lip.y + 34, 0.55);
  pour.position.set(lip.x - 0.4, (lip.y - 34) / 2, lip.z);
  s.add(pour);
  const sign = label("PROOF FACTORY", 2.4, "#ffd27a", "rgba(38,20,12,0.9)");
  sign.position.set(0, 12.5, -27);
  s.add(sign);
  // ---- the hall's life: shafts of light from the roof, two conveyors of hot Equihash ingots over the
  // river, the river bubbling and steaming, welders' sparks on the columns
  const aim = shafts(s, ["#e8f0ff", "#d8e6ff", "#e8f0ff", "#cfe0ff", "#d8e6ff"], 0.1, 1.6, 6.5);
  [-2.2, -1.2, 0.2, 1.5, 2.6].forEach((a, i) => {
    const d = 24 + (i % 2) * 6;
    aim(i, Math.cos(a - Math.PI / 2) * d, 44, Math.sin(a - Math.PI / 2) * d, 0.12 * (i - 2), -1, 0.1, 80);
  });
  const belts = new THREE.InstancedMesh(GEO.box, toon("#2b2522"), 4);
  const BELT_Z = [-24, 17];
  BELT_Z.forEach((z, k) => {
    belts.setMatrixAt(k * 2, m4.compose(v.set(0, -31.4, z), q.identity(), sc.set(130, 0.9, 3.4)));
    belts.setMatrixAt(k * 2 + 1, m4.compose(v.set(0, -32.8, z), q, sc.set(130, 2.2, 2.2)));
  });
  belts.raycast = () => {};
  s.add(belts);
  const NI = 34;
  const ingots = new Glows(s, NI, 1.5, 0.22, GEO.box);
  for (let i = 0; i < NI; i++) ingots.set(i, 0, -900, 0, 1.7, 0.75, 1.1, 0, i % 3 === 0 ? "#ffe27a" : "#ffb347");
  ingots.commit(true);
  const welds = [-2.0, -0.9, 0.7, 2.1].map((a) => {
    const b = a - Math.PI / 2 + 0.26;
    return { x: Math.cos(b) * 29.6, z: Math.sin(b) * 29.6, y: -9 + Math.abs(a) * 3, t: D() * 2 };
  });
  const vents = [
    [-18, -14],
    [21, -26],
    [-30, 8],
    [26, 12],
  ];
  const fx = bgFx(s, 420);
  const ember = ["#ffcf5a", "#ff8a2e", "#ffffff"];
  const spark = ["#ffffff", "#fff3b0", "#ffd23f"];
  const steam = ["#8c7a70", "#a89488", "#6e5e55"];
  const at = new THREE.Vector3();
  let emberT = 0,
    steamT = 0;
  return {
    spin,
    arrows(dir, warn, on, t) {
      if (dir !== shownDir) point(dir);
      if (warn) chevM.color.copy(Math.floor(t * 9) % 2 ? amber : dark);
      else chevM.color.copy(on ? white : dim);
    },
    tick(t, dt, w) {
      lavaT.value = t;
      pin.rotation.y += (w * (R + 0.3)) / 1.05 * dt;
      for (const l of ladles) l.g.position.y += Math.sin(t * 0.8 + l.a) * 0.004;
      // the ingots ride the belts (one each way), glowing
      for (let i = 0; i < NI; i++) {
        const k = i % 2,
          j = i >> 1;
        const x = ((((j * 7.6 + t * 2.6 * (k ? -1 : 1)) % 130) + 130) % 130) - 65;
        ingots.set(i, x, -30.55, BELT_Z[k], 1.7, 0.75, 1.1, 0, null, 0.85 + 0.15 * Math.sin(t * 2 + i));
      }
      ingots.commit();
      if (dt <= 0) return;
      emberT += dt;
      while (emberT > 0.07) {
        emberT -= 0.07;
        fx.burst(at.set(lip.x - 0.4 + (D() - 0.5) * 3, -33, lip.z + (D() - 0.5) * 3), 1, ember, { speed: 3, up: 9, gravity: 6, size: 0.35, life: 1.6 });
        if (D() < 0.5) fx.burst(at.set((D() - 0.5) * 40, -10 + D() * 6, -18 - D() * 12), 1, ember, { speed: 0.6, up: 2.5, gravity: -0.6, size: 0.16, life: 2.2 });
        // (the river bubbles: a hot blob pops up and falls back)
        const a = D() * TAU,
          r = 12 + D() * 34;
        fx.burst(at.set(Math.cos(a) * r, -33.8, Math.sin(a) * r), 2, ember, { speed: 1.2, up: 5, gravity: 16, size: 0.5, life: 0.7 });
      }
      steamT += dt;
      while (steamT > 0.22) {
        steamT -= 0.22;
        const [x, z] = vents[(D() * vents.length) | 0];
        fx.burst(at.set(x + (D() - 0.5) * 2, -33, z + (D() - 0.5) * 2), 1, steam, { speed: 0.5, up: 3.2, gravity: -0.8, size: 1.3, life: 2.6, drag: 0.8 });
      }
      for (const w of welds) {
        w.t -= dt;
        if (w.t > 0) continue;
        w.t = 0.5 + D() * 1.6;
        fx.burst(at.set(w.x, w.y, w.z), 16, spark, { speed: 5, up: 2, gravity: 18, size: 0.16, life: 0.75 });
      }
      fx.update(dt);
    },
  };
}

/** A toon box straight into the scene. */
function block3(s: THREE.Object3D, c: string, w: number, h: number, d: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(GEO.box, toon(c));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  s.add(m);
  return m;
}

/** The level's deck and its world. */
export function buildArena(lv: LaserLevel, s: THREE.Scene): Arena {
  return lv.key === "orbit" ? orbit(lv, s) : lv.key === "foundry" ? foundry(lv, s) : neon(lv, s);
}
