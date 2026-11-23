/**
 * TAUPE FOLIE (chacun pour soi, 40 s): a vegetable garden with a 4×3 grid of molehills. Moles pop
 * up: brown ones are worth 1, golden ones 3, and the ones wearing a bomb helmet blow up in your face
 * (−2 and stunned). Everyone runs around with a big mallet (in their colour) and presses A to whack:
 * only the first whack on a mole counts. From 10 s left the moles go into a frenzy. Most points wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, cloud, cyl, flat, group, starGeo, toon, tree } from "../../engine/gfx";
import { angDiff, clamp, dist2, easeOutBack, lerp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 40;
const COLS = 4;
const ROWS = 3;
const DX = 3.2;
const DZ = 2.9;
const MOUND_R = 0.86; // what players bump into
const PR = 0.42;
const SPEED = 6.6;
const AX = 7.6; // arena half-size (players)
const AZ = 5.0;
const SWING = 0.3; // the swing locks you in place for this long
const WHACK_CD = 0.38;
const REACH = 1.85;
const STUN = 1.4;
const Y_DOWN = -0.65;
const Y_UP = 0.78;

type Kind = "normal" | "gold" | "bomb";
type HoleState = "empty" | "rise" | "up" | "hide" | "bonk";

interface Hole {
  x: number;
  z: number;
  mole: THREE.Group;
  body: THREE.Mesh;
  belly: THREE.Mesh;
  helmet: THREE.Group;
  spark: THREE.Mesh;
  brows: THREE.Group;
  stars: THREE.Group;
  eyes: THREE.Mesh[];
  state: HoleState;
  kind: Kind;
  t: number;
  upT: number;
  /** Not reused before this game time. */
  freeAt: number;
  /** Per CPU: fooled by this bomb mole (thinks it's a normal one). */
  fooled: boolean[];
  /** Mole id (CPU target memory). */
  id: number;
}

interface Runner {
  x: number;
  z: number;
  vx: number;
  vz: number;
  swing: number;
  cd: number;
  stun: number;
  score: number;
}

const MOLE_COL: Record<Kind, [string, string]> = {
  normal: ["#8a5a3a", "#e8c39a"],
  gold: ["#ffc928", "#fff1a8"],
  bomb: ["#4a3f5c", "#8a7fa0"],
};

class TaupeFolie extends BaseMini {
  private holes: Hole[] = [];
  private run: Runner[] = [];
  private nextMole = 0.4;
  private moleId = 0;
  private frenzy = false;
  private cpuTarget: (Hole | null)[] = [];
  private cpuTargetId: number[] = [];
  private cpuWander: { x: number; z: number; t: number }[] = [];
  private mats: Record<Kind, [THREE.Material, THREE.Material]>;
  private sunflowers: THREE.Group[] = [];
  private cloudsG: THREE.Group[] = [];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#58b6ff", "#dff4ff"], size: 14, sun: [0.45, 1, 0.55], fog: { near: 45, far: 110 } });
    this.mats = {
      normal: [toon(MOLE_COL.normal[0]), toon(MOLE_COL.normal[1])],
      gold: [toon("#ffc928", "#a06a00", 0.45), toon("#fff1a8", "#806000", 0.3)],
      bomb: [toon(MOLE_COL.bomb[0]), toon(MOLE_COL.bomb[1])],
    };
    this.buildGarden();
    this.buildHoles();
    const starts = [
      [-6.6, -4.6],
      [6.6, -4.6],
      [-6.6, 4.6],
      [6.6, 4.6],
    ];
    this.players.forEach((p, i) => {
      const [x, z] = starts[i];
      const a = this.spawn(i, x, z, Math.atan2(-x, -z));
      a.setRing(p.char.color);
      this.addMallet(i, p.char.color);
      this.run.push({ x, z, vx: 0, vz: 0, swing: 0, cd: 0, stun: 0, score: 0 });
      this.cpuTarget.push(null);
      this.cpuTargetId.push(-1);
      this.cpuWander.push({ x, z, t: 0 });
    });
    this.hud.players(this.players, () => this.scoreHtml(0));
    this.hud.timer(TIME);
    this.setCam([0, 24, 24], [0, 0, 0], 42);
  }

  private scoreHtml(n: number) {
    return `${n} <span style="font-size:0.55em;opacity:0.8">${T(n === 1 ? "pt" : "pts", "分")}</span>`;
  }

  // ------------------------------------------------------------ the garden

  private buildGarden() {
    const s = this.scene;
    // lawn
    const lawnTex = canvasTex(512, 512, (g, w) => {
      g.fillStyle = "#86d160";
      g.fillRect(0, 0, w, w);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = i % 3 ? "rgba(60,140,40,0.18)" : "rgba(200,255,150,0.18)";
        const x = Math.random() * w,
          y = Math.random() * w;
        g.fillRect(x, y, 3, 10);
      }
    }, true);
    lawnTex.repeat.set(10, 10);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshToonMaterial({ map: lawnTex }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.02;
    lawn.receiveShadow = true;
    s.add(lawn);
    // the soil patch where the moles live
    const soilTex = canvasTex(1024, 720, (g, w, h) => {
      g.fillStyle = "#a8774e";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const k = Math.random();
        g.fillStyle = k < 0.4 ? "rgba(90,55,30,0.35)" : k < 0.7 ? "rgba(200,150,100,0.3)" : "rgba(70,40,20,0.25)";
        const r = 2 + Math.random() * 7;
        g.beginPath();
        g.ellipse(Math.random() * w, Math.random() * h, r, r * 0.7, Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
      // furrows
      g.strokeStyle = "rgba(80,50,25,0.25)";
      g.lineWidth = 10;
      for (let y = 40; y < h; y += 80) {
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= w; x += 40) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 6);
        g.stroke();
      }
    });
    const soilShape = new THREE.Shape();
    const sw = AX + 0.9,
      sh = AZ + 0.9,
      rr = 1.6;
    soilShape.moveTo(-sw + rr, -sh);
    soilShape.lineTo(sw - rr, -sh);
    soilShape.quadraticCurveTo(sw, -sh, sw, -sh + rr);
    soilShape.lineTo(sw, sh - rr);
    soilShape.quadraticCurveTo(sw, sh, sw - rr, sh);
    soilShape.lineTo(-sw + rr, sh);
    soilShape.quadraticCurveTo(-sw, sh, -sw, sh - rr);
    soilShape.lineTo(-sw, -sh + rr);
    soilShape.quadraticCurveTo(-sw, -sh, -sw + rr, -sh);
    const soilGeo = new THREE.ShapeGeometry(soilShape, 6);
    // UVs from positions
    const pos = soilGeo.attributes.position;
    const uv = soilGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + sw) / (2 * sw), (pos.getY(i) + sh) / (2 * sh));
    const soil = new THREE.Mesh(soilGeo, new THREE.MeshToonMaterial({ map: soilTex }));
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.01;
    soil.receiveShadow = true;
    s.add(soil);
    // a border of round stones around the patch (instanced)
    const stones: THREE.Matrix4[] = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const per = 2 * (2 * sw + 2 * sh);
    for (let d = 0; d < per; d += 0.62) {
      let x = 0,
        z = 0;
      const a = 2 * sw,
        b = 2 * sh;
      if (d < a) [x, z] = [-sw + d, -sh];
      else if (d < a + b) [x, z] = [sw, -sh + (d - a)];
      else if (d < 2 * a + b) [x, z] = [sw - (d - a - b), sh];
      else [x, z] = [-sw, sh - (d - 2 * a - b)];
      // round the corners a little
      const cx = clamp(x, -sw + rr, sw - rr),
        cz = clamp(z, -sh + rr, sh - rr);
      const ox = x - cx,
        oz = z - cz;
      const ol = Math.hypot(ox, oz);
      if (ol > rr) {
        x = cx + (ox / ol) * rr;
        z = cz + (oz / ol) * rr;
      }
      const k = 0.24 + ((d * 13.7) % 1) * 0.08;
      q.setFromEuler(new THREE.Euler(0, d * 3.1, 0));
      stones.push(m4.compose(v.set(x, 0.08, z), q, sc.set(k * 1.3, k * 0.75, k)).clone());
    }
    const stoneMesh = new THREE.InstancedMesh(GEO.sphereLo, toon("#d9d2c4"), stones.length);
    stones.forEach((m, i) => stoneMesh.setMatrixAt(i, m));
    stoneMesh.castShadow = true;
    stoneMesh.receiveShadow = true;
    s.add(stoneMesh);

    // white picket fence on three sides, a gate gap at the front
    const pickets: THREE.Matrix4[] = [];
    const FX = sw + 2.2,
      FZ0 = -sh - 2.4,
      FZ1 = sh + 1.2;
    const addPicket = (x: number, z: number) => pickets.push(new THREE.Matrix4().compose(v.set(x, 0.55, z), q.identity(), sc.set(0.18, 1.1, 0.1)));
    for (let x = -FX; x <= FX + 0.01; x += 0.5) addPicket(x, FZ0);
    for (let z = FZ0 + 0.5; z <= FZ1; z += 0.5) {
      addPicket(-FX, z);
      addPicket(FX, z);
    }
    const picketMesh = new THREE.InstancedMesh(GEO.box, toon("#fbf7ee"), pickets.length);
    pickets.forEach((m, i) => picketMesh.setMatrixAt(i, m));
    picketMesh.castShadow = true;
    s.add(picketMesh);
    for (const y of [0.35, 0.8]) {
      box(s, "#efe7d6", FX * 2, 0.1, 0.06, { x: 0, y, z: FZ0 - 0.07 });
      box(s, "#efe7d6", 0.06, 0.1, FZ1 - FZ0, { x: -FX - 0.07, y, z: (FZ0 + FZ1) / 2 });
      box(s, "#efe7d6", 0.06, 0.1, FZ1 - FZ0, { x: FX + 0.07, y, z: (FZ0 + FZ1) / 2 });
    }

    // vegetable rows beside the fence: carrots and cabbages (instanced)
    const carrotTops: THREE.Matrix4[] = [];
    const cabbages: THREE.Matrix4[] = [];
    for (const side of [-1, 1]) {
      for (let k = 0; k < 9; k++) {
        const z = FZ0 + 1.2 + k * 1.35;
        const x1 = side * (FX + 1.4),
          x2 = side * (FX + 2.8);
        carrotTops.push(new THREE.Matrix4().compose(v.set(x1, 0.3, z), q.setFromEuler(new THREE.Euler(0, k, 0)), sc.set(0.22, 0.6, 0.22)));
        cabbages.push(new THREE.Matrix4().compose(v.set(x2, 0.3, z + 0.4), q.identity(), sc.set(0.5, 0.38, 0.5)));
      }
    }
    const carrotMesh = new THREE.InstancedMesh(GEO.coneLo, toon("#3fae3a"), carrotTops.length);
    carrotTops.forEach((m, i) => carrotMesh.setMatrixAt(i, m));
    s.add(carrotMesh);
    const cabbageMesh = new THREE.InstancedMesh(GEO.sphereLo, toon("#9fe07a"), cabbages.length);
    cabbages.forEach((m, i) => cabbageMesh.setMatrixAt(i, m));
    cabbageMesh.castShadow = true;
    s.add(cabbageMesh);
    // orange carrot shoulders peeking out
    const carrotHeads = new THREE.InstancedMesh(GEO.sphereLo, toon("#ff8a2a"), carrotTops.length);
    carrotTops.forEach((m, i) => {
      const p = new THREE.Vector3().setFromMatrixPosition(m);
      carrotHeads.setMatrixAt(i, new THREE.Matrix4().compose(v.set(p.x, 0.06, p.z), q.identity(), sc.set(0.16, 0.12, 0.16)));
    });
    s.add(carrotHeads);

    // flower bed in front (instanced stems + heads)
    const heads: THREE.Matrix4[] = [];
    const headCols: THREE.Color[] = [];
    const pal = ["#ff5a7a", "#ffd23f", "#ffffff", "#ff8ad8", "#8a6aff", "#ff7a3a"];
    for (let k = 0; k < 46; k++) {
      const x = -FX - 1 + (k / 45) * (2 * FX + 2) + Math.sin(k * 7.1) * 0.2;
      const z = FZ1 + 1.0 + Math.sin(k * 3.3) * 0.5;
      heads.push(new THREE.Matrix4().compose(v.set(x, 0.42, z), q.identity(), sc.set(0.17, 0.17, 0.17)));
      headCols.push(new THREE.Color(pal[k % pal.length]));
    }
    const bush = new THREE.InstancedMesh(GEO.sphereLo, toon("#4aa840"), heads.length);
    heads.forEach((m, i) => {
      const p = new THREE.Vector3().setFromMatrixPosition(m);
      bush.setMatrixAt(i, new THREE.Matrix4().compose(v.set(p.x, 0.15, p.z), q.identity(), sc.set(0.42, 0.3, 0.42)));
    });
    bush.castShadow = true;
    s.add(bush);
    const flowerMesh = new THREE.InstancedMesh(GEO.sphereLo, toon("#ffffff"), heads.length);
    heads.forEach((m, i) => {
      flowerMesh.setMatrixAt(i, m);
      flowerMesh.setColorAt(i, headCols[i]);
    });
    s.add(flowerMesh);

    // the shed at the back
    const shed = group(s, { x: -6.5, z: -15 });
    box(shed, "#c8453a", 5, 3.4, 3.6, { y: 1.7 });
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 5.4, 3, 1), toon("#5a3a2a"));
    roof.rotation.z = Math.PI / 2;
    roof.rotation.x = Math.PI / 6;
    roof.scale.set(1, 1, 0.65);
    roof.position.y = 4.1;
    roof.castShadow = true;
    shed.add(roof);
    box(shed, "#fbf7ee", 1.5, 2.3, 0.1, { y: 1.15, z: 1.81 });
    box(shed, "#7a2a22", 1.3, 2.1, 0.12, { y: 1.1, z: 1.83 });
    box(shed, "#fbf7ee", 0.9, 0.9, 0.1, { x: 1.6, y: 2.2, z: 1.81 });
    box(shed, "#9fd8ff", 0.7, 0.7, 0.12, { x: 1.6, y: 2.2, z: 1.83 });
    // a wheelbarrow and a watering can
    const wb = group(s, { x: 4.8, z: -12.5, ry: -0.5 });
    box(wb, "#3f8fd6", 1.6, 0.6, 1.0, { y: 0.75 });
    cyl(wb, "#333", 0.3, 0.14, { x: 1.0, y: 0.3, rz: Math.PI / 2 });
    box(wb, "#8a5a32", 1.2, 0.08, 0.08, { x: -1.1, y: 0.6, z: 0.4 });
    box(wb, "#8a5a32", 1.2, 0.08, 0.08, { x: -1.1, y: 0.6, z: -0.4 });
    const can = group(s, { x: 2.5, z: -11.6 });
    cyl(can, "#3fcf5a", 0.4, 0.7, { y: 0.35 });
    cyl(can, "#3fcf5a", 0.06, 0.8, { x: 0.5, y: 0.6, rz: -0.9 });
    // sunflowers along the back fence
    for (let k = 0; k < 9; k++) {
      const g = group(s, { x: -9 + k * 2.3, z: FZ0 - 1.4 - (k % 2) * 0.6 });
      const h = 2.2 + (k % 3) * 0.35;
      cyl(g, "#3a9a34", 0.07, h, { y: h / 2 });
      const head = group(g, { y: h, rx: 0.35 });
      cyl(head, "#ffcf1f", 0.6, 0.08, { rx: Math.PI / 2 });
      cyl(head, "#6b3b1c", 0.3, 0.12, { rx: Math.PI / 2, z: 0.03 });
      this.sunflowers.push(head);
    }
    // trees and clouds
    const treeSpots = [
      [-17, -14],
      [-14, -20],
      [13, -17],
      [18, -12],
      [0, -22],
      [-20, -4],
      [20, -2],
      [-19, 6],
      [19, 7],
      [7, -21],
    ];
    treeSpots.forEach(([x, z], k) => tree(s, x, z, 1.8 + (k % 3) * 0.4, k % 2 ? "#5cc44f" : "#48b04a"));
    this.cloudsG.push(cloud(s, -14, 13, -34, 2.2), cloud(s, 10, 15, -38, 2.6), cloud(s, 26, 11, -30, 1.8));
  }

  private buildHoles() {
    const s = this.scene;
    const mound = new THREE.CylinderGeometry(0.72, 1.08, 0.36, 18);
    const rimGeo = new THREE.TorusGeometry(0.66, 0.12, 8, 20);
    const sg = starGeo(0.12, 0.05);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const x = (c - (COLS - 1) / 2) * DX,
          z = (r - (ROWS - 1) / 2) * DZ;
        const m = new THREE.Mesh(mound, toon("#8c5f3c"));
        m.position.set(x, 0.18, z);
        m.castShadow = m.receiveShadow = true;
        s.add(m);
        const rim = new THREE.Mesh(rimGeo, toon("#a8774e"));
        rim.rotation.x = Math.PI / 2;
        rim.position.set(x, 0.37, z);
        rim.castShadow = true;
        s.add(rim);
        const hole = new THREE.Mesh(GEO.circle, flat("#2a1a10"));
        hole.rotation.x = -Math.PI / 2;
        hole.scale.setScalar(0.62);
        hole.position.set(x, 0.365, z);
        s.add(hole);
        // the mole
        const mole = group(s, { x, y: Y_DOWN, z });
        const moleIn = group(mole, {});
        moleIn.scale.setScalar(1.3);
        const body = ball(moleIn, this.mats.normal[0], [0.42, 0.56, 0.4]);
        const belly = ball(moleIn, this.mats.normal[1], [0.3, 0.38, 0.14], { y: -0.04, z: 0.3 });
        ball(moleIn, "#ff8aa0", 0.1, { y: 0.13, z: 0.4 });
        const eyes: THREE.Mesh[] = [];
        for (const sx of [-1, 1]) {
          eyes.push(ball(moleIn, flat("#1d1630"), [0.065, 0.085, 0.05], { x: sx * 0.14, y: 0.3, z: 0.33 }));
          ball(moleIn, flat("#ffffff"), 0.022, { x: sx * 0.14 + 0.02, y: 0.33, z: 0.375, cast: false });
          ball(moleIn, "#ffb0c0", [0.11, 0.08, 0.08], { x: sx * 0.3, y: -0.18, z: 0.3 }); // paws
        }
        box(moleIn, "#ffffff", 0.12, 0.09, 0.04, { y: 0.0, z: 0.39 });
        // the bomb helmet (bomb moles only)
        const helmet = group(moleIn, { y: 0.3 });
        const dome = new THREE.Mesh(GEO.sphere, toon("#2a2438"));
        dome.scale.set(0.47, 0.36, 0.45);
        dome.castShadow = true;
        helmet.add(dome);
        cyl(helmet, "#ff4b3e", 0.475, 0.09, { y: 0.0, cast: false });
        cyl(helmet, "#8a8494", 0.06, 0.22, { y: 0.42 });
        const spark = ball(helmet, flat("#ffb02e"), 0.09, { y: 0.56, cast: false });
        const brows = group(moleIn, {});
        for (const sx of [-1, 1]) box(brows, "#1d1630", 0.16, 0.035, 0.04, { x: sx * 0.14, y: 0.41, z: 0.36, rz: sx * 0.45, cast: false });
        // dizzy stars
        const stars = group(moleIn, { y: 0.8 });
        for (let k = 0; k < 3; k++) {
          const st = new THREE.Mesh(sg, flat("#ffe14a"));
          stars.add(st);
        }
        stars.visible = false;
        mole.visible = false;
        this.holes.push({ x, z, mole, body, belly, helmet, spark, brows, stars, eyes, state: "empty", kind: "normal", t: 0, upT: 0, freeAt: 0, fooled: [false, false, false, false], id: -1 });
      }
  }

  private addMallet(i: number, color: string) {
    const a = this.avatars[i];
    // (in the zkSNARK's fist, its arm longer than the mascots': a shorter handle, held a little
    // up, so the head stays out of the ground when the arm swings back on the run)
    const g = group(a.rig.armR, { y: -0.4, z: 0.04, rx: -0.35 });
    cyl(g, "#c08a50", 0.05, 0.8, { z: 0.32, rx: Math.PI / 2 });
    cyl(g, color, 0.25, 0.62, { z: 0.72 });
    cyl(g, "#fff3c0", 0.265, 0.08, { z: 0.72, y: 0.24 });
    cyl(g, "#fff3c0", 0.265, 0.08, { z: 0.72, y: -0.24 });
  }

  // ------------------------------------------------------------ moles

  private whackable(h: Hole) {
    return h.state === "rise" || h.state === "up" || (h.state === "hide" && h.t < 0.1);
  }

  /** How long a mole stays reachable (for CPUs). */
  private timeLeft(h: Hole) {
    if (h.state === "rise") return h.upT + 0.15;
    if (h.state === "up") return h.upT - h.t;
    if (h.state === "hide") return 0.1 - h.t;
    return 0;
  }

  private popMole() {
    const up = this.holes.filter((h) => h.state !== "empty").length;
    const p = clamp(this.t / TIME, 0, 1);
    const max = this.frenzy ? 8 : 4 + Math.floor(p * 3);
    if (up >= max) return;
    const free = this.holes.filter((h) => h.state === "empty" && this.t >= h.freeAt);
    if (!free.length) return;
    const h = free[Math.floor(this.rnd() * free.length)];
    const r = this.rnd();
    const gold = this.frenzy ? 0.17 : 0.11;
    const kind: Kind = r < gold ? "gold" : r < gold + (this.frenzy ? 0.2 : 0.16) ? "bomb" : "normal";
    h.kind = kind;
    h.state = "rise";
    h.t = 0;
    h.id = ++this.moleId;
    h.upT = kind === "gold" ? lerp(1.05, 0.85, p) : kind === "bomb" ? 2.4 : lerp(1.75, 1.2, p);
    h.body.material = this.mats[kind][0];
    h.belly.material = this.mats[kind][1];
    h.helmet.visible = kind === "bomb";
    h.brows.visible = kind === "bomb";
    h.stars.visible = false;
    h.mole.visible = true;
    h.mole.scale.set(1, 1, 1);
    h.mole.rotation.set(0, 0, 0);
    for (let k = 0; k < 4; k++) h.fooled[k] = kind === "bomb" && Math.random() < 0.32 * (1 - this.players[k].level);
    this.sound(kind === "gold" ? "magic" : "pop");
    this.fx.burst({ x: h.x, y: 0.4, z: h.z }, { count: 7, colors: ["#8c5f3c", "#a8774e", "#6b4428"], speed: 3, up: 3, size: 0.12, life: 0.5 });
    if (kind === "gold") this.fx.sparkle({ x: h.x, y: 1, z: h.z }, "#ffe14a", 14);
  }

  private updateHoles(dt: number) {
    for (const h of this.holes) {
      if (h.state === "empty") continue;
      h.t += dt;
      let y = Y_DOWN;
      switch (h.state) {
        case "rise": {
          const k = clamp(h.t / 0.16, 0, 1);
          y = lerp(Y_DOWN, Y_UP, easeOutBack(k));
          if (k >= 1) {
            h.state = "up";
            h.t = 0;
          }
          break;
        }
        case "up": {
          y = Y_UP + Math.sin(h.t * 9) * 0.025;
          h.mole.rotation.y = Math.sin(h.t * 3.2 + h.x) * 0.35;
          if (h.kind === "bomb") {
            const blink = Math.sin(this.t * 18) > 0;
            h.spark.scale.setScalar(blink ? 0.13 : 0.07);
            h.mole.rotation.z = Math.sin(h.t * 14) * 0.05;
          }
          if (h.kind === "gold" && Math.random() < dt * 6) this.fx.sparkle({ x: h.x + (Math.random() - 0.5) * 0.6, y: 1 + Math.random() * 0.4, z: h.z + 0.2 }, "#fff3a0", 2);
          if (h.t >= h.upT) {
            h.state = "hide";
            h.t = 0;
          }
          break;
        }
        case "hide": {
          const k = clamp(h.t / 0.2, 0, 1);
          y = lerp(Y_UP, Y_DOWN, k * k);
          if (k >= 1) this.emptyHole(h);
          break;
        }
        case "bonk": {
          // squashed, dizzy, then sinks
          const k = clamp(h.t / 0.12, 0, 1);
          h.mole.scale.set(lerp(1.35, 1.25, k), lerp(0.4, 0.55, k), lerp(1.35, 1.25, k));
          h.stars.visible = h.t < 0.6;
          h.stars.children.forEach((st, n) => {
            const a = this.t * 7 + (n / 3) * Math.PI * 2;
            st.position.set(Math.cos(a) * 0.4, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.4);
            st.rotation.z = this.t * 6;
          });
          y = h.t < 0.5 ? Y_UP - 0.18 : lerp(Y_UP - 0.18, Y_DOWN, clamp((h.t - 0.5) / 0.2, 0, 1));
          if (h.t > 0.7) this.emptyHole(h);
          break;
        }
      }
      h.mole.position.y = y;
    }
  }

  private emptyHole(h: Hole) {
    h.state = "empty";
    h.t = 0;
    h.mole.visible = false;
    h.stars.visible = false;
    h.freeAt = this.t + 0.5;
  }

  // ------------------------------------------------------------ whacking

  private whack(i: number) {
    const r = this.run[i];
    const a = this.avatars[i];
    r.swing = SWING;
    r.cd = WHACK_CD;
    r.vx = r.vz = 0;
    a.anim = "hit";
    this.sound("swing");
    // the nearest mole in reach, in front (auto-aim)
    let best: Hole | null = null,
      bestS = Infinity;
    for (const h of this.holes) {
      if (!this.whackable(h)) continue;
      const d = dist2(r.x, r.z, h.x, h.z);
      if (d > REACH) continue;
      const ang = Math.abs(angDiff(a.yaw, Math.atan2(h.x - r.x, h.z - r.z)));
      if (ang > 1.45 && d > 1.15) continue;
      const s = d + ang * 0.6;
      if (s < bestS) {
        bestS = s;
        best = h;
      }
    }
    if (!best) {
      // a whiff on the ground
      const fx = r.x + Math.sin(a.yaw) * 1.0,
        fz = r.z + Math.cos(a.yaw) * 1.0;
      this.fx.dust({ x: fx, y: 0, z: fz }, 6, "#c89a6a");
      this.sound("thud");
      return;
    }
    a.yaw = Math.atan2(best.x - r.x, best.z - r.z);
    const h = best;
    const p = this.players[i];
    h.state = "bonk";
    h.t = 0;
    h.mole.rotation.set(0, 0, 0);
    const at = new THREE.Vector3(h.x, 1.1, h.z);
    if (h.kind === "bomb") {
      h.mole.visible = false;
      this.emptyHole(h);
      this.fx.explosion({ x: h.x, y: 0.8, z: h.z }, 2.4);
      this.sound("explode");
      this.shake = 0.55;
      const lost = Math.min(2, r.score);
      r.score -= lost;
      r.stun = STUN;
      r.swing = 0;
      const dx = r.x - h.x,
        dz = r.z - h.z,
        d = Math.hypot(dx, dz) || 1;
      r.vx = (dx / d) * 8;
      r.vz = (dz / d) * 8;
      a.flash();
      this.hud.pop(at.setY(1.8), "−2", "#ff5a4e", this.camera);
      this.buzz(i, [80, 40, 120]);
    } else {
      const v = h.kind === "gold" ? 3 : 1;
      r.score += v;
      this.sound("bonk");
      if (v === 3) {
        this.sound("coins");
        this.fx.burst(at, { count: 26, colors: ["#ffe14a", "#fff6a8", "#ffffff"], speed: 6, up: 3, size: 0.18, life: 0.9, shape: "ball" });
        this.fx.confetti(at, 24);
        this.shake = 0.3;
        this.buzz(i, 50);
      } else {
        this.fx.burst(at, { count: 12, colors: ["#ffe14a", "#ffffff", p.char.color], speed: 4.5, up: 2, size: 0.14, life: 0.55 });
        this.shake = Math.max(this.shake, 0.12);
        this.buzz(i, 25);
      }
      this.fx.ring({ x: h.x, y: 0.38, z: h.z }, p.char.color, 1.4, 0.35);
      this.hud.pop(at.setY(1.9), `+${v}`, v === 3 ? "#ffe14a" : p.char.color, this.camera);
    }
    this.hud.setScore(p.seat, this.scoreHtml(r.score));
  }

  // ------------------------------------------------------------ CPUs

  private standPoint(i: number, h: Hole) {
    const r = this.run[i];
    let dx = r.x - h.x,
      dz = r.z - h.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) {
      dx = 0;
      dz = 1;
    } else {
      dx /= d;
      dz /= d;
    }
    return { x: h.x + dx * 1.15, z: h.z + dz * 1.15 };
  }

  protected cpu(i: number): CpuPad {
    const me = this.run[i];
    const lv = this.players[i].level;
    if (me.stun > 0 || me.swing > 0) return {};
    // keep or choose a target
    let tgt = this.cpuTarget[i];
    if (tgt && (!this.whackable(tgt) || tgt.id !== this.cpuTargetId[i])) tgt = null;
    const think = !tgt || this.cpuAfter(i, "rethink", 0.5 - 0.3 * lv);
    if (think) {
      this.cpuReset(i, "rethink");
      let best: Hole | null = null,
        bestS = 0;
      for (const h of this.holes) {
        if (!this.whackable(h)) continue;
        const fooled = h.fooled[i];
        if (h.kind === "bomb" && !fooled) continue;
        const sp = this.standPoint(i, h);
        const d = dist2(me.x, me.z, sp.x, sp.z);
        const eta = d / SPEED + (0.45 - 0.3 * lv);
        if (eta > this.timeLeft(h) + 0.1) continue;
        const v = h.kind === "gold" ? 3 : 1;
        // a rival much closer will probably get it first
        let rival = Infinity;
        this.run.forEach((o, j) => {
          if (j !== i && o.stun <= 0) rival = Math.min(rival, dist2(o.x, o.z, h.x, h.z));
        });
        const mine = dist2(me.x, me.z, h.x, h.z);
        let contest = rival < mine - 0.8 ? 0.35 + 0.25 * (1 - lv) : 1;
        // a crowd around a mole: go elsewhere
        let crowd = 0;
        this.run.forEach((o, j) => {
          if (j !== i && o.stun <= 0 && dist2(o.x, o.z, h.x, h.z) < 1.9) crowd++;
        });
        contest /= 1 + crowd * (0.5 + 0.6 * lv);
        // smart CPUs leave a mole to a CPU that is already closer to it
        for (let j = 0; j < this.run.length; j++)
          if (j !== i && this.cpuTarget[j] === h && dist2(this.run[j].x, this.run[j].z, h.x, h.z) < mine) contest *= 1 - 0.7 * lv;
        const s = ((v * (0.6 + 0.6 * lv)) / (eta + 0.4)) * contest * (h === tgt ? 1.25 : 1);
        if (s > bestS) {
          bestS = s;
          best = h;
        }
      }
      if (best !== tgt) this.cpuReset(i, "swing");
      tgt = best;
      this.cpuTarget[i] = tgt;
      this.cpuTargetId[i] = tgt ? tgt.id : -1;
    }
    const wob = (1 - lv) * 0.45;
    if (tgt) {
      const sp = this.standPoint(i, tgt);
      const dx = sp.x - me.x,
        dz = sp.z - me.z;
      const d = Math.hypot(dx, dz);
      const near = dist2(me.x, me.z, tgt.x, tgt.z) < REACH - 0.25;
      if (near && me.cd <= 0) {
        // a reaction time before the swing
        if (this.cpuAfter(i, "swing", 0.32 - 0.24 * lv + Math.random() * 0.05)) {
          this.cpuReset(i, "swing");
          return { x: (tgt.x - me.x) * 0.2, y: (tgt.z - me.z) * 0.2, a: true };
        }
        return { x: (tgt.x - me.x) * 0.05, y: (tgt.z - me.z) * 0.05 };
      }
      if (d < 0.15) return {};
      return { x: dx / d + Math.sin(this.t * 3 + i) * wob, y: dz / d + Math.cos(this.t * 2.6 + i) * wob };
    }
    // nothing worth it: drift toward a spot between holes (good CPUs pick the centre)
    const w = this.cpuWander[i];
    if (this.t > w.t || dist2(me.x, me.z, w.x, w.z) < 0.4) {
      const spread = 1 - lv * 0.6;
      // each CPU keeps to its own corner of the patch, closer to the middle when it's good
      w.x = (i % 2 ? 1 : -1) * DX * (0.5 + 0.5 * (1 - lv)) + (Math.random() - 0.5) * DX * spread;
      w.z = (i < 2 ? -1 : 1) * DZ * 0.5 + (Math.random() - 0.5) * DZ * spread;
      // avoid standing on a mound
      for (const h of this.holes)
        if (dist2(w.x, w.z, h.x, h.z) < 1.1) {
          w.x += 1.2;
        }
      w.t = this.t + 1.5 + Math.random() * 1.5;
    }
    const dx = w.x - me.x,
      dz = w.z - me.z,
      d = Math.hypot(dx, dz);
    if (d < 0.3) return {};
    return { x: (dx / d) * 0.6, y: (dz / d) * 0.6 };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.decor(dt);
    this.moveCam([0, 15.5, 13.2], [0, 0, 0.9], dt, 1.8);
  }

  private decor(dt: number) {
    this.sunflowers.forEach((h, k) => (h.rotation.z = Math.sin(this.t * 1.1 + k) * 0.08));
    for (const c of this.cloudsG) {
      c.position.x += dt * 0.5;
      if (c.position.x > 40) c.position.x = -40;
    }
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.decor(dt);
    this.moveCam([0, 15.5, 13.2], [0, 0, 0.9], dt, 3);
    if (!this.frenzy && left <= 10) {
      this.frenzy = true;
      this.hud.banner(T("FRENZY!", "疯狂时刻！"), { color: "#ffd23f", sub: T("10 seconds left: the moles go wild!", "还剩 10 秒：地鼠疯了！") });
      music.speed(1.18);
      this.sound("bell");
    }
    // moles
    this.nextMole -= dt;
    if (this.nextMole <= 0) {
      this.popMole();
      const p = clamp(this.t / TIME, 0, 1);
      this.nextMole = (this.frenzy ? 0.22 : lerp(0.6, 0.34, p)) * (0.7 + this.rnd() * 0.6);
    }
    this.updateHoles(dt);

    // players
    this.run.forEach((r, i) => {
      const a = this.avatars[i];
      const p = this.pad(i);
      r.cd -= dt;
      if (r.stun > 0) {
        r.stun -= dt;
        r.vx *= Math.exp(-5 * dt);
        r.vz *= Math.exp(-5 * dt);
        a.anim = "stun";
      } else if (r.swing > 0) {
        r.swing -= dt;
        a.anim = "hit";
      } else {
        const k = 1 - Math.exp(-14 * dt);
        r.vx += (p.x * SPEED - r.vx) * k;
        r.vz += (p.y * SPEED - r.vz) * k;
        const sp = Math.hypot(r.vx, r.vz);
        a.anim = sp > 0.6 ? "run" : "idle";
        a.speed = clamp(sp / SPEED, 0, 1);
        if (sp > 0.5) a.face(Math.atan2(r.vx, r.vz), dt);
        if (p.aDown && r.cd <= 0) this.whack(i);
      }
      r.x += r.vx * dt;
      r.z += r.vz * dt;
      // the mounds and the fence
      for (const h of this.holes) {
        const dx = r.x - h.x,
          dz = r.z - h.z;
        const d = Math.hypot(dx, dz);
        const min = MOUND_R + PR;
        if (d < min) {
          const k = min / (d || 1);
          r.x = h.x + dx * k;
          r.z = h.z + dz * k;
        }
      }
      r.x = clamp(r.x, -AX, AX);
      r.z = clamp(r.z, -AZ, AZ);
      a.pos.set(r.x, 0, r.z);
    });
    // players bump each other
    for (let i = 0; i < this.run.length; i++)
      for (let j = i + 1; j < this.run.length; j++) {
        const A = this.run[i],
          B = this.run[j];
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d < PR * 2 && d > 1e-4) {
          const push = (PR * 2 - d) / 2;
          A.x -= (dx / d) * push;
          A.z -= (dz / d) * push;
          B.x += (dx / d) * push;
          B.z += (dz / d) * push;
        }
      }

    if (left <= 0) {
      this.finishByScore(this.run.map((r) => r.score));
    }
  }

  protected outroStep(dt: number) {
    this.decor(dt);
    this.updateHoles(dt);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    super.dispose();
  }
}

const def: MiniDef = {
  id: "taupe-folie",
  name: "Mole Madness",
  icon: "🔨",
  color: "#b07a4a",
  tagline: "Whack the moles, never the bombs.",
  rules: "Run to the moles and whack them with your mallet: brown +1, gold +3. Only the first hit counts! Avoid the bomb-helmet moles: −2 and you're stunned.",
  controls: { stick: "Run", a: "Whack" },
  modes: ["ffa"],
  length: 40,
  music: "mini2",
  create: (ctx) => new TaupeFolie(ctx),
};
export default def;
