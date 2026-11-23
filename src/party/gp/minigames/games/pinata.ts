/**
 * PIÑATA (chacun pour soi, 40 s): a village fête on an Italian piazza (ochre palazzi, a fountain,
 * bunting and string lights). A big colourful piñata swings from a rope over the square: get under
 * it and mash A to whack it with your stick. Each hit may spill a sweet; when it breaks, candies
 * burst everywhere and a new piñata is lowered (the last one is golden). Run over candies to pick
 * them up: wrapped sweets 1, lollipops 3. Most candies wins.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, cone, cyl, flat, group, toon } from "../../engine/gfx";
import { clamp, dist2 } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 40;
const AX = 8.6; // play area half-size
const AZ = 5.6;
const PR = 0.42;
const SPEED = 6.3;
const ANCHOR = new THREE.Vector3(0, 6.6, 0);
const ROPE = 3.9;
const REACH = 1.6;
const HIT_CD = 0.17;
const MAX_CANDY = 220;
const CANDY_COLS = ["#ff4b8b", "#ffd23f", "#3fcf5a", "#2f8dff", "#ff7a2a", "#9b5cff", "#ffffff"];

/** Lots of boxes in one instanced draw call (each with its own colour). */
class BoxBatch {
  private ms: THREE.Matrix4[] = [];
  private cs: THREE.Color[] = [];
  private d = new THREE.Object3D();
  add(parent: THREE.Object3D, color: THREE.ColorRepresentation, w: number, h: number, dd: number, x = 0, y = 0, z = 0) {
    parent.updateMatrixWorld(true);
    this.d.position.set(x, y, z);
    this.d.scale.set(w, h, dd);
    this.d.updateMatrix();
    this.ms.push(parent.matrixWorld.clone().multiply(this.d.matrix));
    this.cs.push(new THREE.Color(color));
  }
  build(scene: THREE.Object3D, cast: boolean) {
    const m = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), this.ms.length);
    this.ms.forEach((mm, k) => {
      m.setMatrixAt(k, mm);
      m.setColorAt(k, this.cs[k]);
    });
    m.castShadow = cast;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
}

interface Candy {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  vr: number;
  value: number;
  landed: boolean;
  pickAt: number;
  age: number;
  dead: boolean;
  /** Instance slot (sweets) or own mesh (lollipops). */
  slot: number;
  mesh: THREE.Object3D | null;
  color: THREE.Color;
}
interface Basher {
  x: number;
  z: number;
  vx: number;
  vz: number;
  cd: number;
  swing: number;
  score: number;
}

class Pinata extends BaseMini {
  private bash: Basher[] = [];
  private candies: Candy[] = [];
  private sweets!: THREE.InstancedMesh;
  private freeSlots: number[] = [];
  private lolliTex: THREE.Texture;
  private lolliMat: THREE.MeshToonMaterial;
  private stickMat = toon("#ffffff");
  // the piñata on its pendulum
  private pin: THREE.Group | null = null;
  private pinKind = 0;
  private hp = 0;
  private hpMax = 0;
  private golden = false;
  private thx = 0;
  private thz = 0;
  private wx = 0;
  private wz = 0;
  private drop = 0; // lowering in (1 → 0)
  private respawn = 0;
  private punch = 0;
  private rope!: THREE.Mesh;
  private hpEl: HTMLElement | null = null;
  count = 0;
  private hurry = false;
  private flags: THREE.Mesh[] = [];
  private water!: THREE.Mesh;
  private jets: THREE.Mesh[] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private cpuGoal: { x: number; z: number }[] = [];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#4fa8ff", "#ffe6c0"], size: 14, sun: [0.55, 1, 0.45], fog: { near: 45, far: 100 } });
    this.lolliTex = canvasTex(128, 128, (g, w) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, w, w);
      const cols = ["#ff4b8b", "#ffd23f", "#2f8dff", "#3fcf5a"];
      for (let k = 0; k < 4; k++) {
        g.strokeStyle = cols[k];
        g.lineWidth = 12;
        g.beginPath();
        for (let a = 0; a < Math.PI * 6; a += 0.1) {
          const r = (a / (Math.PI * 6)) * 60;
          g.lineTo(64 + Math.cos(a + (k * Math.PI) / 2) * r, 64 + Math.sin(a + (k * Math.PI) / 2) * r);
        }
        g.stroke();
      }
    });
    this.lolliMat = new THREE.MeshToonMaterial({ map: this.lolliTex });
    this.buildPiazza();
    this.buildCandies();
    // the rope
    this.rope = new THREE.Mesh(GEO.cylLo, toon("#d8c08a"));
    this.rope.scale.set(0.04, 1, 0.04);
    this.scene.add(this.rope);
    const starts = [
      [-4.5, -2.5],
      [4.5, -2.5],
      [-4.5, 3],
      [4.5, 3],
    ];
    this.players.forEach((p, i) => {
      const [x, z] = starts[i];
      const a = this.spawn(i, x, z, Math.atan2(-x, -z));
      a.setRing(p.char.color);
      // a wooden stick with a ribbon of the player's colour
      // (gripped in the fist: rig.armR is the zkSNARK's own left arm, its hand handL)
      const g = group(a.snark.handL);
      cyl(g, "#c08a50", 0.05, 1.3, { z: 0.5, rx: Math.PI / 2 });
      cyl(g, p.char.color, 0.065, 0.16, { z: 0.15, rx: Math.PI / 2 });
      cyl(g, p.char.color, 0.065, 0.12, { z: 1.05, rx: Math.PI / 2 });
      this.bash.push({ x, z, vx: 0, vz: 0, cd: 0, swing: 0, score: 0 });
      this.cpuGoal.push({ x, z });
    });
    this.newPinata(true);
    this.drop = 0;
    this.hud.players(this.players, () => this.scoreHtml(0));
    this.hud.timer(TIME);
    this.setCam([0, 20, 22], [0, 1, 0], 42);
  }

  private scoreHtml(n: number) {
    return `${n} <span style="font-size:0.6em">🍬</span>`;
  }

  // ------------------------------------------------------------ the piazza

  private buildPiazza() {
    const s = this.scene;
    // sampietrini: small dark cobbles laid diagonally, a travertine border
    const cob = canvasTex(512, 512, (g, w) => {
      g.fillStyle = "#6a625a";
      g.fillRect(0, 0, w, w);
      g.save();
      g.translate(w / 2, w / 2);
      g.rotate(Math.PI / 4);
      for (let y = -w; y < w; y += 28)
        for (let x = -w; x < w; x += 28) {
          g.fillStyle = ["#8a8076", "#7c7268", "#958a7e", "#837a70"][Math.abs((x * 7 + y * 3) / 28) % 4 | 0];
          g.beginPath();
          g.roundRect(x + 2, y + 2, 24, 24, 6);
          g.fill();
        }
      g.restore();
    }, true);
    cob.repeat.set(8, 8);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshToonMaterial({ map: cob }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    // the play area: travertine slabs in a big oval
    const trav = canvasTex(512, 512, (g, w) => {
      g.fillStyle = "#eadfc8";
      g.fillRect(0, 0, w, w);
      for (let y = 0; y < w; y += 64)
        for (let x = (y / 64) % 2 ? 32 : 0; x < w; x += 64) {
          g.fillStyle = ["#e4d6ba", "#efe4cf", "#e8dcc2"][((x + y) / 32) % 3 | 0];
          g.fillRect(x + 2, y + 2, 60, 60);
        }
    }, true);
    trav.repeat.set(4, 3);
    const oval = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshToonMaterial({ map: trav }));
    oval.rotation.x = -Math.PI / 2;
    oval.scale.set(AX + 1.6, AZ + 1.6, 1);
    oval.position.y = 0.02;
    oval.receiveShadow = true;
    s.add(oval);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 6, 64), toon("#c8b898"));
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(AX + 1.6, AZ + 1.6, 6);
    rim.position.y = 0.04;
    s.add(rim);

    // palazzi: ochre, terracotta and pink, green shutters, an arcade at the bottom
    const cols = ["#e8a05a", "#d8764a", "#f0c07a", "#e88a6a", "#f2d29a", "#cc6a48"];
    const solid = new BoxBatch();
    const flatB = new BoxBatch();
    const addPalazzo = (x: number, z: number, ry: number, w: number, h: number, k: number) => {
      const g = group(s, { x, z, ry });
      solid.add(g, cols[k % cols.length], w, h, 3, 0, h / 2, 0);
      solid.add(g, "#a8483a", w + 0.4, 0.4, 3.4, 0, h + 0.2, 0); // roof edge
      flatB.add(g, "#f2e6cc", w, 0.25, 3.1, 0, 3.2, 0); // cornice
      const n = Math.max(2, Math.floor(w / 1.8));
      for (let c = 0; c < n; c++) {
        const wx = -w / 2 + (c + 0.5) * (w / n);
        // arcade
        flatB.add(g, "#5a3a2a", 1.0, 2.2, 0.1, wx, 1.1, 1.51);
        for (let f = 0; f < Math.floor((h - 3.6) / 1.9); f++) {
          const wy = 4.4 + f * 1.9;
          flatB.add(g, "#3a2a28", 0.6, 1.1, 0.1, wx, wy, 1.51);
          flatB.add(g, "#3f7a4a", 0.28, 1.1, 0.08, wx - 0.46, wy, 1.53);
          flatB.add(g, "#3f7a4a", 0.28, 1.1, 0.08, wx + 0.46, wy, 1.53);
        }
      }
    };
    let k = 0;
    for (let x = -18; x <= 18; x += 6) addPalazzo(x, -15, 0, 5.8, 8 + ((k * 3) % 3) * 1.2, k++);
    for (let z = -10; z <= 6; z += 5.5) {
      addPalazzo(-17, z, Math.PI / 2, 5.3, 7.5 + (k % 2) * 1.5, k++);
      addPalazzo(17, z, -Math.PI / 2, 5.3, 7.5 + (k % 2) * 1.5, k++);
    }
    solid.build(s, true);
    flatB.build(s, false);
    // the bell tower
    const tw = group(s, { x: 11, z: -18 });
    box(tw, "#d8764a", 3, 15, 3, { y: 7.5 });
    box(tw, "#3a2a28", 1.2, 2, 3.1, { y: 12.5 });
    cone(tw, "#a8483a", 2.3, 2.6, { y: 16.3, lo: true });
    // the fountain at the back of the square
    const f = group(s, { z: -10.2 });
    cyl(f, "#eadfc8", 3.0, 0.8, { y: 0.4, seg: 32 });
    this.water = new THREE.Mesh(GEO.circle, toon("#7fd8ff", "#2a8fd0", 0.35));
    this.water.rotation.x = -Math.PI / 2;
    this.water.scale.setScalar(2.75);
    this.water.position.y = 0.81;
    f.add(this.water);
    cyl(f, "#eadfc8", 0.5, 2.2, { y: 1.6, seg: 16 });
    cyl(f, "#eadfc8", 1.3, 0.25, { y: 2.6, seg: 24 });
    ball(f, "#d8ccb0", 0.5, { y: 3.2 });
    cone(f, "#d8ccb0", 0.35, 0.9, { y: 3.9 });
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * Math.PI * 2;
      const jet = new THREE.Mesh(GEO.sphereLo, flat("#cfefff", 0.75));
      jet.scale.set(0.1, 0.6, 0.1);
      jet.position.set(Math.cos(a) * 1.4, 2.4, Math.sin(a) * 1.4);
      jet.rotation.z = Math.cos(a) * 0.7;
      jet.rotation.x = -Math.sin(a) * 0.7;
      f.add(jet);
      this.jets.push(jet);
    }
    // the wire across the square (from two poles) holding the piñata
    for (const sx of [-1, 1]) {
      const g = group(s, { x: sx * 11.5, z: 0 });
      cyl(g, "#6a4a30", 0.16, 7.2, { y: 3.6 });
      ball(g, "#ffc928", 0.25, { y: 7.3 });
    }
    const wire = new THREE.Mesh(GEO.cylLo, toon("#3a3a3a"));
    wire.scale.set(0.03, 23, 0.03);
    wire.rotation.z = Math.PI / 2;
    wire.position.set(0, 7.0, 0);
    s.add(wire);
    cyl(s, "#8a8494", 0.18, 0.3, { x: 0, y: 6.85, rz: Math.PI / 2 });
    // bunting: Italian colours and party colours, and string lights
    const flagGeo = new THREE.ConeGeometry(0.3, 0.65, 3);
    const flagCols = ["#2fa84a", "#ffffff", "#e8343e", "#ffd23f", "#2f8dff", "#ff7ad9"];
    const strings: [THREE.Vector3, THREE.Vector3][] = [
      [new THREE.Vector3(-14.5, 6.6, -9.5), new THREE.Vector3(-11.5, 7, 0)],
      [new THREE.Vector3(14.5, 6.6, -9.5), new THREE.Vector3(11.5, 7, 0)],
      [new THREE.Vector3(-14.5, 6.4, -9.5), new THREE.Vector3(14.5, 6.4, -9.5)],
      [new THREE.Vector3(-14.5, 5.6, -7), new THREE.Vector3(14.5, 5.6, -7)],
      [new THREE.Vector3(-11.5, 7, 0), new THREE.Vector3(-14.5, 6.6, 9)],
      [new THREE.Vector3(11.5, 7, 0), new THREE.Vector3(14.5, 6.6, 9)],
    ];
    const bulbs: THREE.Matrix4[] = [];
    strings.forEach(([a, b], si) => {
      const n = Math.round(a.distanceTo(b) / 0.85);
      for (let j = 1; j < n; j++) {
        const t = j / n;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 1.3;
        if (si < 4 || j % 2) {
          const m = new THREE.Mesh(flagGeo, toon(flagCols[(j + si) % (si === 2 ? 3 : 6)]));
          m.rotation.x = Math.PI;
          m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
          m.scale.setScalar(si >= 2 && si < 4 ? 1.3 : 1);
          m.position.copy(p).add(new THREE.Vector3(0, -0.3, 0));
          s.add(m);
          this.flags.push(m);
        } else bulbs.push(new THREE.Matrix4().makeScale(0.12, 0.12, 0.12).setPosition(p.x, p.y - 0.1, p.z));
      }
    });
    const bulbMesh = new THREE.InstancedMesh(GEO.sphereLo, flat("#fff3a0"), bulbs.length);
    bulbs.forEach((m, j) => bulbMesh.setMatrixAt(j, m));
    s.add(bulbMesh);
    // café tables with checked cloths and an umbrella pine or two
    const cloth = canvasTex(64, 64, (g) => {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          g.fillStyle = (x + y) % 2 ? "#ffffff" : "#e8343e";
          g.fillRect(x * 8, y * 8, 8, 8);
        }
    });
    const clothMat = new THREE.MeshToonMaterial({ map: cloth });
    for (const [x, z] of [
      [-12.5, -7],
      [-12.5, 5.5],
      [12.5, 5.5],
      [12.8, -6.5],
    ]) {
      const g = group(s, { x, z });
      cyl(g, clothMat, 0.7, 0.08, { y: 0.9 });
      cyl(g, "#3a3a3a", 0.06, 0.9, { y: 0.45 });
      for (const sx of [-1, 1]) box(g, "#3a3a3a", 0.4, 0.5, 0.4, { x: sx * 1.0, y: 0.25 });
    }
    // market stalls with striped awnings (sweets and toys)
    const awn = canvasTex(256, 64, (g, w, h) => {
      for (let x = 0; x < w; x += 32) {
        g.fillStyle = (x / 32) % 2 ? "#ffffff" : "#2fa84a";
        g.fillRect(x, 0, 32, h);
      }
    });
    const awnMat = new THREE.MeshToonMaterial({ map: awn });
    for (const [x, z, ry] of [
      [-12.2, -3.2, Math.PI / 2],
      [12.2, -3.2, -Math.PI / 2],
    ] as const) {
      const g = group(s, { x, z, ry });
      box(g, "#a86a3a", 3.2, 1.1, 1.2, { y: 0.55 });
      for (const sx of [-1.5, 1.5]) cyl(g, "#6a4a30", 0.07, 2.6, { x: sx, y: 1.3, z: -0.5 });
      const roof = new THREE.Mesh(GEO.box, awnMat);
      roof.scale.set(3.6, 0.08, 1.8);
      roof.position.set(0, 2.55, 0.1);
      roof.rotation.x = 0.3;
      g.add(roof);
      for (let k = 0; k < 6; k++) ball(g, CANDY_COLS[k], 0.16, { x: -1.2 + k * 0.48, y: 1.25, z: 0.2, cast: false });
    }
    // bunches of balloons on the corners of the square
    for (const [x, z] of [
      [-10.5, -6.5],
      [10.5, -6.5],
    ]) {
      const g = group(s, { x, z });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const bx = Math.cos(a) * 0.5,
          bz = Math.sin(a) * 0.4,
          by = 3.6 + (k % 2) * 0.5;
        ball(g, CANDY_COLS[k], [0.45, 0.55, 0.45], { x: bx, y: by, z: bz });
        const str = new THREE.Mesh(GEO.cylLo, toon("#ffffff"));
        str.scale.set(0.015, by - 0.6, 0.015);
        str.position.set(bx / 2, (by - 0.6) / 2, bz / 2);
        str.rotation.z = -Math.atan2(bx, by) * 0.5;
        g.add(str);
      }
      box(g, "#8a5a32", 0.4, 0.3, 0.4, { y: 0.15 });
    }
    for (const [x, z] of [
      [-20, -6],
      [20, -3],
      [-6, -19],
    ]) {
      const g = group(s, { x, z });
      cyl(g, "#7a5a3a", 0.25, 6, { y: 3 });
      ball(g, "#3f8a3a", [3, 1.0, 3], { y: 6.2, lo: true });
    }
  }

  private buildCandies() {
    // a wrapped sweet: a ball with two twisted wrapper ends (one merged geometry, instanced)
    const body = new THREE.SphereGeometry(0.2, 12, 8);
    body.scale(1.25, 0.9, 0.9);
    const endL = new THREE.ConeGeometry(0.16, 0.22, 8);
    endL.rotateZ(-Math.PI / 2);
    endL.translate(-0.33, 0, 0);
    const endR = new THREE.ConeGeometry(0.16, 0.22, 8);
    endR.rotateZ(Math.PI / 2);
    endR.translate(0.33, 0, 0);
    const geo = mergeGeometries([body.toNonIndexed(), endL.toNonIndexed(), endR.toNonIndexed()])!;
    body.dispose();
    endL.dispose();
    endR.dispose();
    this.sweets = new THREE.InstancedMesh(geo, toon("#ffffff"), MAX_CANDY);
    this.sweets.castShadow = true;
    this.sweets.count = MAX_CANDY;
    this.sweets.frustumCulled = false;
    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let j = 0; j < MAX_CANDY; j++) {
      this.sweets.setMatrixAt(j, hide);
      this.sweets.setColorAt(j, new THREE.Color("#ffffff"));
      this.freeSlots.push(j);
    }
    this.scene.add(this.sweets);
  }

  // ------------------------------------------------------------ piñatas

  private newPinata(first = false) {
    if (this.pin) this.pin.removeFromParent();
    this.golden = !first && this.hurry;
    const g = new THREE.Group();
    const rainbow = this.golden ? ["#ffc928", "#ffe14a", "#fff3a0", "#ffb020", "#ffd23f", "#fff8d0"] : ["#ff4b8b", "#ffd23f", "#3fcf5a", "#2f8dff", "#ff7a2a", "#9b5cff"];
    const mat = (c: string) => (this.golden ? toon(c, "#806000", 0.35) : toon(c));
    if (this.pinKind % 2 === 0) {
      // a donkey made of frilly paper rings
      for (let r = 0; r < 6; r++) {
        const ring = new THREE.Mesh(GEO.cyl, mat(rainbow[r]));
        ring.scale.set(0.5 - Math.abs(r - 2.5) * 0.03, 0.24, 0.5 - Math.abs(r - 2.5) * 0.03);
        ring.rotation.z = Math.PI / 2;
        ring.position.set(-0.6 + r * 0.24, 0, 0);
        ring.castShadow = true;
        g.add(ring);
      }
      const neck = group(g, { x: 0.65, y: 0.35 });
      for (let r = 0; r < 3; r++) cyl(neck, mat(rainbow[(r + 3) % 6]), 0.24, 0.22, { y: r * 0.2, rz: -0.3 });
      const head = group(g, { x: 0.95, y: 0.95 });
      box(head, mat(rainbow[1]), 0.7, 0.4, 0.42, { x: 0.15 });
      box(head, mat(rainbow[0]), 0.14, 0.42, 0.44, { x: 0.45 });
      for (const sz of [-1, 1]) {
        cone(head, mat(rainbow[2]), 0.09, 0.45, { x: -0.1, y: 0.38, z: sz * 0.14, rz: 0.2, lo: true });
        ball(head, flat("#1d1630"), 0.05, { x: 0.25, y: 0.08, z: sz * 0.22, cast: false });
      }
      for (const [lx, lz] of [
        [-0.45, -0.25],
        [-0.45, 0.25],
        [0.45, -0.25],
        [0.45, 0.25],
      ])
        cyl(g, mat(rainbow[(lx > 0 ? 4 : 5) % 6]), 0.1, 0.55, { x: lx, y: -0.55, z: lz });
      cone(g, mat(rainbow[3]), 0.12, 0.5, { x: -0.85, y: -0.1, rz: 2.2, lo: true });
    } else {
      // a seven-point star with tassels
      ball(g, mat(rainbow[1]), 0.55);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const c = new THREE.Mesh(GEO.cone, mat(rainbow[k % 6]));
        c.scale.set(0.22, 0.75, 0.22);
        c.position.set(Math.sin(a) * 0.85, Math.cos(a) * 0.85, 0);
        c.rotation.z = -a;
        c.castShadow = true;
        g.add(c);
        ball(g, mat(rainbow[(k + 3) % 6]), 0.08, { x: Math.sin(a) * 1.25, y: Math.cos(a) * 1.25, cast: false });
      }
      // a band across
      cyl(g, mat(rainbow[0]), 0.57, 0.18, { rx: Math.PI / 2 });
    }
    const s = this.golden ? 1.25 : 1.1;
    g.scale.setScalar(s);
    this.pin = g;
    this.scene.add(g);
    this.pinKind++;
    this.hpMax = this.golden ? 70 : first ? 45 : 55;
    this.hp = this.hpMax;
    this.thx = (this.rnd() - 0.5) * 0.3;
    this.thz = (this.rnd() - 0.5) * 0.3;
    this.wx = this.wz = 0;
    this.drop = 1;
    if (this.hpEl) this.hud.removeLabel(this.hpEl);
    this.hpEl = this.hud.label(g, `<div style="width:calc(var(--u)*9);height:calc(var(--u)*0.9);border-radius:999px;background:rgba(20,14,40,0.75);overflow:hidden;border:calc(var(--u)*0.2) solid #fff"><div class="hpbar" style="height:100%;width:100%;background:linear-gradient(#ffe14a,#ff9a2e);transition:width 0.1s"></div></div>`, { dy: 1.6 });
    this.hpEl.style.background = "transparent";
    this.hpEl.style.padding = "0";
  }

  /** Where the piñata hangs now. */
  private pinPos(out = this.v) {
    const lift = this.drop * 6;
    return out.set(ANCHOR.x + Math.sin(this.thx) * ROPE, ANCHOR.y - Math.cos(this.thx) * Math.cos(this.thz) * ROPE - 0.55 + lift, ANCHOR.z + Math.sin(this.thz) * ROPE);
  }

  private hitPinata(i: number) {
    if (!this.pin || this.hp <= 0 || this.drop > 0.05) return;
    const b = this.bash[i];
    const p = this.pinPos(new THREE.Vector3());
    this.hp--;
    this.punch = 1;
    // pushed away from the hitter
    const dx = p.x - b.x,
      dz = p.z - b.z,
      d = Math.hypot(dx, dz) || 1;
    this.wx += (dx / d) * 0.32;
    this.wz += (dz / d) * 0.32;
    this.sound(Math.random() < 0.5 ? "hit" : "bonk");
    this.fx.burst(p, { count: 5, colors: CANDY_COLS, speed: 3, size: 0.1, life: 0.4, shape: "flake", gravity: 6 });
    this.buzz(i, 15);
    this.shake = Math.max(this.shake, 0.06);
    if (Math.random() < 0.33) this.spawnCandy(p, 1, 3.2);
    if (this.hpEl) (this.hpEl.querySelector(".hpbar") as HTMLElement).style.width = `${(100 * this.hp) / this.hpMax}%`;
    if (this.hp <= 0) this.breakPinata(i);
  }

  private breakPinata(i: number) {
    const p = this.pinPos(new THREE.Vector3());
    this.sound("explode");
    this.sound("cheer");
    this.shake = 0.6;
    this.fx.confetti(p, 90);
    this.fx.burst(p, { count: 40, colors: ["#ff4b8b", "#ffd23f", "#3fcf5a", "#2f8dff", "#ff7a2a"], speed: 9, up: 3, size: 0.25, life: 0.9, shape: "flake", gravity: 8 });
    this.fx.ring({ x: p.x, y: 0.1, z: p.z }, "#ffffff", 4, 0.5);
    const n = this.golden ? 22 : 16;
    for (let k = 0; k < n; k++) this.spawnCandy(p, 1, 6.5);
    for (let k = 0; k < (this.golden ? 8 : 5); k++) this.spawnCandy(p, 3, 6);
    this.hud.banner(this.golden ? T("Golden piñata smashed!", "金色彩罐打破了！") : T("Piñata smashed!", "彩罐打破了！"), { color: "#ffd23f", ms: 900, size: 7, sub: T(`Nice one, ${this.players[i].name}!`, `${this.players[i].name} 干得好！`) });
    this.buzz(i, 120);
    if (this.pin) this.pin.removeFromParent();
    this.pin = null;
    if (this.hpEl) this.hud.removeLabel(this.hpEl);
    this.hpEl = null;
    this.respawn = 2.2;
  }

  private spawnCandy(from: THREE.Vector3, value: number, speed: number) {
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.35 + Math.random() * 0.65);
    const c: Candy = {
      x: from.x,
      y: from.y,
      z: from.z,
      vx: Math.cos(a) * sp,
      vy: 3 + Math.random() * 4,
      vz: Math.sin(a) * sp * 0.8,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 14,
      value,
      landed: false,
      pickAt: this.t + 0.3,
      age: 0,
      dead: false,
      slot: -1,
      mesh: null,
      color: new THREE.Color(CANDY_COLS[Math.floor(Math.random() * CANDY_COLS.length)]),
    };
    if (value >= 3) {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(GEO.cyl, [toon("#ffffff"), this.lolliMat, this.lolliMat]);
      disc.scale.set(0.34, 0.1, 0.34);
      disc.rotation.x = Math.PI / 2;
      disc.position.y = 0.3;
      disc.castShadow = true;
      g.add(disc);
      const st = new THREE.Mesh(GEO.cylLo, this.stickMat);
      st.scale.set(0.035, 0.5, 0.035);
      st.position.y = -0.1;
      g.add(st);
      this.scene.add(g);
      c.mesh = g;
    } else {
      const slot = this.freeSlots.pop();
      if (slot === undefined) return;
      c.slot = slot;
      this.sweets.setColorAt(slot, c.color);
      if (this.sweets.instanceColor) this.sweets.instanceColor.needsUpdate = true;
    }
    this.candies.push(c);
  }

  private removeCandy(c: Candy) {
    c.dead = true;
    if (c.mesh) c.mesh.removeFromParent();
    if (c.slot >= 0) {
      this.sweets.setMatrixAt(c.slot, this.m4.makeScale(0, 0, 0));
      this.freeSlots.push(c.slot);
    }
  }

  private updateCandies(dt: number, live: boolean) {
    for (const c of this.candies) {
      if (c.dead) continue;
      c.age += dt;
      if (!c.landed) {
        c.vy -= 16 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        c.rot += c.vr * dt;
        if (Math.abs(c.x) > AX) {
          c.x = Math.sign(c.x) * AX;
          c.vx *= -0.5;
        }
        if (Math.abs(c.z) > AZ) {
          c.z = Math.sign(c.z) * AZ;
          c.vz *= -0.5;
        }
        const floor = c.value >= 3 ? 0.12 : 0.15;
        if (c.y <= floor) {
          c.y = floor;
          if (Math.abs(c.vy) > 2.5) {
            c.vy = -c.vy * 0.4;
            c.vx *= 0.6;
            c.vz *= 0.6;
            c.vr *= 0.5;
          } else {
            c.landed = true;
            c.vy = 0;
          }
        }
      }
      const bob = c.landed ? Math.sin(c.age * 3 + c.x) * 0.04 : 0;
      if (c.mesh) {
        c.mesh.position.set(c.x, c.y + (c.landed ? 0.0 : 0) + bob, c.z);
        if (c.landed) {
          c.mesh.rotation.set(-Math.PI / 2 + 0.25, 0, 0);
          c.mesh.position.y = 0.16;
        } else c.mesh.rotation.set(c.rot, c.rot * 0.7, 0);
      } else if (c.slot >= 0) {
        this.e.set(c.landed ? 0 : c.rot, c.rot * 0.6, 0);
        this.q.setFromEuler(this.e);
        this.m4.compose(this.v.set(c.x, c.y + bob, c.z), this.q, this.sc.set(1.25, 1.25, 1.25));
        this.sweets.setMatrixAt(c.slot, this.m4);
      }
      // picked up
      if (live && this.t >= c.pickAt && c.y < 1.2) {
        for (let i = 0; i < this.bash.length; i++) {
          const b = this.bash[i];
          if (dist2(b.x, b.z, c.x, c.z) < 0.75) {
            b.score += c.value;
            this.hud.setScore(this.players[i].seat, this.scoreHtml(b.score));
            this.fx.sparkle({ x: c.x, y: 0.5, z: c.z }, c.value >= 3 ? "#ff8ad8" : "#" + c.color.getHexString(), c.value >= 3 ? 16 : 6);
            if (c.value >= 3) {
              this.hud.pop(new THREE.Vector3(c.x, 1.8, c.z), "+3", "#ff8ad8", this.camera);
              this.sound("coins");
              this.buzz(i, 30);
            } else this.sound("coin");
            this.removeCandy(c);
            break;
          }
        }
      }
    }
    this.candies = this.candies.filter((c) => !c.dead);
    this.sweets.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number): CpuPad {
    const me = this.bash[i];
    const lv = this.players[i].level;
    // the best candy: value over distance (lollipops shine), rivals closer make it less tempting
    let best: Candy | null = null,
      bs = 0;
    for (const c of this.candies) {
      if (c.dead || c.y > 2.5) continue;
      const d = dist2(me.x, me.z, c.x, c.z);
      let rival = Infinity;
      this.bash.forEach((o, j) => {
        if (j !== i) rival = Math.min(rival, dist2(o.x, o.z, c.x, c.z));
      });
      const contest = rival < d - 0.5 ? 0.4 + 0.3 * (1 - lv) : 1;
      const s = ((c.value * (0.8 + 0.6 * lv)) / (d + 0.8)) * contest;
      if (s > bs) {
        bs = s;
        best = c;
      }
    }
    const pinUp = this.pin && this.hp > 0 && this.drop < 0.3;
    const p = this.pinPos(new THREE.Vector3());
    const dp = dist2(me.x, me.z, p.x, p.z);
    // hitting is worth about this much (more when it's about to break)
    const hitVal = pinUp ? (0.25 + (1 - this.hp / this.hpMax) * 0.7) / (Math.max(0, dp - REACH) + 0.8) : 0;
    let tx: number, tz: number;
    let mash = false;
    if (best && bs > hitVal * (1.1 - 0.3 * lv)) {
      tx = best.x;
      tz = best.z;
    } else if (pinUp) {
      // stand on my side of the piñata, a bit ahead of its swing for the good ones
      const lead = 0.25 * lv;
      const g = this.cpuGoal[i];
      const ang = Math.atan2(me.z - p.z, me.x - p.x);
      g.x = p.x + Math.sin(this.thx + this.wx * lead) + Math.cos(ang) * 0.9;
      g.z = p.z + Math.cos(ang) * 0 + Math.sin(ang) * 0.9;
      tx = g.x;
      tz = g.z;
      if (dp < REACH - 0.15) mash = this.cpuAfter(i, "react", 0.35 - 0.25 * lv) && this.mashing(i, 7);
      else this.cpuReset(i, "react");
    } else {
      // wait near the middle for the next one
      tx = (i % 2 ? 1.6 : -1.6) * (1 - lv * 0.5);
      tz = (i < 2 ? -1.2 : 1.2) * (1 - lv * 0.5);
    }
    const dx = tx - me.x,
      dz = tz - me.z;
    const d = Math.hypot(dx, dz);
    const wob = (1 - lv) * 0.4;
    if (d < 0.2) return { a: mash };
    const k = Math.min(1, d / 0.6);
    return { x: (dx / d) * k + Math.sin(this.t * 2.9 + i) * wob, y: (dz / d) * k + Math.cos(this.t * 2.3 + i) * wob, a: mash };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.decor(dt);
    this.swingPinata(dt);
    this.moveCam([0, 11.4, 14.2], [0, 1.5, -0.4], dt, 1.7);
  }

  private decor(dt: number) {
    const tt = performance.now() / 1000;
    this.flags.forEach((f, k) => (f.rotation.z = Math.sin(tt * 3 + k * 0.7) * 0.18));
    this.water.rotation.z += dt * 0.3;
    this.jets.forEach((j, k) => (j.scale.y = 0.55 + Math.sin(tt * 8 + k) * 0.08));
  }

  private swingPinata(dt: number) {
    // a pendulum, kept moving by someone tugging the rope (a slow figure of eight)
    const g = 9.8 / ROPE;
    const tx = Math.sin(this.t * 0.7) * 0.32 + Math.sin(this.t * 1.9) * 0.08;
    const tz = Math.sin(this.t * 0.9 + 1) * 0.22;
    this.wx += (-g * (this.thx - tx) - 0.9 * this.wx) * dt;
    this.wz += (-g * (this.thz - tz) - 0.9 * this.wz) * dt;
    this.thx = clamp(this.thx + this.wx * dt, -0.7, 0.7);
    this.thz = clamp(this.thz + this.wz * dt, -0.55, 0.55);
    this.drop = Math.max(0, this.drop - dt * 1.4);
    this.punch = Math.max(0, this.punch - dt * 6);
    const p = this.pinPos();
    if (this.pin) {
      this.pin.position.copy(p);
      this.pin.rotation.z = -this.thx * 0.8 + Math.sin(this.punch * 12) * 0.15 * this.punch;
      this.pin.rotation.x = this.thz * 0.8;
      this.pin.rotation.y = Math.sin(this.t * 0.6) * 0.6;
      const s = (this.golden ? 1.25 : 1.1) * (1 + this.punch * 0.12);
      this.pin.scale.setScalar(s);
      // rope from the pulley to the piñata
      const top = new THREE.Vector3(ANCHOR.x, 6.85, ANCHOR.z);
      const bot = p.clone().add(new THREE.Vector3(0, 0.55, 0));
      const mid = top.clone().add(bot).multiplyScalar(0.5);
      const len = top.distanceTo(bot);
      this.rope.visible = true;
      this.rope.position.copy(mid);
      this.rope.scale.set(0.04, len, 0.04);
      this.rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bot.sub(top).normalize().negate());
    } else this.rope.visible = false;
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.decor(dt);
    this.moveCam([0, 11.4, 14.2], [0, 1.5, -0.4], dt, 3);
    if (!this.hurry && left <= 10) {
      this.hurry = true;
      this.hud.banner(T("10 seconds left!", "还剩 10 秒！"), { color: "#ffd23f", sub: T("The next piñata is golden!", "下一个彩罐是金色的！"), size: 7 });
      music.speed(1.18);
      this.sound("bell");
    }
    if (!this.pin) {
      this.respawn -= dt;
      if (this.respawn <= 0 && left > 2.5) {
        this.newPinata();
        this.sound("slide");
      }
    }
    this.swingPinata(dt);
    const pp = this.pinPos(new THREE.Vector3());

    this.bash.forEach((b, i) => {
      const a = this.avatars[i];
      const p = this.pad(i);
      b.cd -= dt;
      b.swing -= dt;
      const slow = b.swing > 0 ? 0.35 : 1;
      const k = 1 - Math.exp(-12 * dt);
      b.vx += (p.x * SPEED * slow - b.vx) * k;
      b.vz += (p.y * SPEED * slow - b.vz) * k;
      b.x = clamp(b.x + b.vx * dt, -AX, AX);
      b.z = clamp(b.z + b.vz * dt, -AZ, AZ);
      const sp = Math.hypot(b.vx, b.vz);
      const near = this.pin && dist2(b.x, b.z, pp.x, pp.z) < REACH;
      if (p.aDown && b.cd <= 0) {
        b.cd = HIT_CD;
        b.swing = 0.22;
        a.anim = "idle";
        a.update(0);
        a.anim = "hit";
        if (near) {
          a.yaw = Math.atan2(pp.x - b.x, pp.z - b.z);
          this.hitPinata(i);
        } else this.sound("swing");
      }
      if (b.swing <= 0) {
        a.anim = sp > 0.6 ? "run" : "idle";
        a.speed = clamp(sp / SPEED, 0, 1);
        if (sp > 0.5) a.face(Math.atan2(b.vx, b.vz), dt);
        else if (near) a.faceTo(pp.x, pp.z, dt);
      }
      a.pos.set(b.x, 0, b.z);
    });
    for (let i = 0; i < this.bash.length; i++)
      for (let j = i + 1; j < this.bash.length; j++) {
        const A = this.bash[i],
          B = this.bash[j];
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
    this.updateCandies(dt, true);

    if (left <= 0) this.finishByScore(this.bash.map((b) => b.score));
  }

  protected outroStep(dt: number) {
    this.decor(dt);
    this.swingPinata(dt);
    this.updateCandies(dt, false);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.lolliMat.dispose();
    super.dispose();
  }
}

const def: MiniDef = {
  id: "pinata",
  name: "Piñata Party",
  icon: "🪅",
  color: "#ff5fd2",
  tagline: "Smash the piñata, grab the sweets.",
  rules: "Get under the piñata and mash A: it drops sweets, then bursts! Grab the sweets (1) and lollipops (3). The sweetest tooth wins.",
  controls: { stick: "Run", a: "Hit", mash: true },
  modes: ["ffa"],
  length: 40,
  music: "rome",
  create: (ctx) => new Pinata(ctx),
};
export default def;
