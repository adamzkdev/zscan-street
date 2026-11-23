/**
 * PLONGÉE AU TRÉSOR (chacun pour soi, 45 s): a side view of a tropical lagoon. Each player has a
 * boat at the surface; treasures lie on the sea floor (coins 1, pearls 2, small chests 5). Swim with
 * the stick (left/right and up/down), A = a strong kick. Carry up to 3 treasures (heavier = slower)
 * and bring them up to your boat to score. Your air runs out underwater and refills at the surface:
 * at zero you float up dazed and drop everything. Jellyfish sting (you drop what you carry).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, coinMesh, cone, cyl, flat, group, toon } from "../../engine/gfx";
import { clamp, dist2, lerp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 45;
const XW = 12.2; // swim area half-width
const SURF = -0.35; // the swimmer's y at the surface
const SPEED = 4.6;
const KICK_V = 7.5;
const KICK_CD = 0.7;
const AIR = 9; // seconds of air
const REFILL = 4.5; // air per second at the surface
const MAXC = 3;
const BOATS = [-8.6, -2.9, 2.9, 8.6];

type TKind = "coin" | "pearl" | "chest";
const VAL: Record<TKind, number> = { coin: 1, pearl: 2, chest: 5 };

/** The sea floor height at x (deeper in the middle, a few bumps). */
const floorY = (x: number) => -7.9 - 1.9 * Math.exp(-((x / 4.2) ** 2)) + 0.35 * Math.sin(x * 0.85 + 1) + 0.03 * x * x * 0.1;

interface Treasure {
  g: THREE.Group;
  kind: TKind;
  x: number;
  y: number;
  /** -1 on the floor, else carried by player i. */
  by: number;
  /** Sinking after a drop. */
  sink: boolean;
  /** Flying to a boat (delivery). */
  fly: number;
  fx0: number;
  fy0: number;
  toX: number;
  dead: boolean;
  t: number;
}
interface Diver {
  x: number;
  y: number;
  vx: number;
  vy: number;
  air: number;
  cd: number;
  /** Dazed: floating up without control. */
  daze: boolean;
  stun: number;
  score: number;
  carry: Treasure[];
  bar: HTMLElement;
  fill: HTMLElement;
  face: number;
  lastBubble: number;
}
interface Jelly {
  g: THREE.Group;
  x: number;
  y: number;
  baseY: number;
  ph: number;
  vx: number;
  tent: THREE.Object3D[];
  hit: number[];
}

class Plongee extends BaseMini {
  private dv: Diver[] = [];
  private tr: Treasure[] = [];
  private jellies: Jelly[] = [];
  private boats: THREE.Group[] = [];
  private piles: THREE.Mesh[] = [];
  private boatBob: number[] = [0, 0, 0, 0];
  private nextT = 1;
  private hurry = false;
  private fish!: THREE.InstancedMesh;
  private fishData: { x: number; y: number; z: number; v: number; ph: number; s: number }[] = [];
  private kelp!: THREE.InstancedMesh;
  private kelpData: { x: number; y: number; z: number; h: number; ph: number }[] = [];
  private rays: THREE.Mesh[] = [];
  private foamTex!: THREE.Texture;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private coinProto: THREE.Object3D;
  private cpuState: { mode: "dive" | "up"; tgt: Treasure | null; greed: number }[] = [];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#3aa8f0", "#bfe8ff"], size: 14, sun: [0.3, 1, 0.6], sunIntensity: 2.2, hemi: ["#e0f6ff", "#2a5a8a", 1.7], fog: { color: "#1d6aa8", near: 24, far: 62 } });
    this.coinProto = coinMesh(0.3);
    this.buildLagoon();
    this.players.forEach((p, i) => {
      const x = BOATS[i];
      const a = this.spawn(i, x, 0, 0);
      a.pos.y = SURF;
      a.setRing(null);
      const bar = this.hud.label(a.root, `<div style="width:calc(var(--u)*4.4);height:calc(var(--u)*0.7);border-radius:999px;background:rgba(10,20,40,0.7);overflow:hidden;border:calc(var(--u)*0.15) solid #fff"><div class="o2" style="height:100%;width:100%;background:#7fe0ff"></div></div>`, { dy: 1.95 });
      bar.style.background = "transparent";
      bar.style.padding = "0";
      const fill = bar.querySelector(".o2") as HTMLElement;
      this.dv.push({ x, y: SURF, vx: 0, vy: 0, air: AIR, cd: 0, daze: false, stun: 0, score: 0, carry: [], bar, fill, face: 0, lastBubble: 0 });
      this.cpuState.push({ mode: "dive", tgt: null, greed: 0 });
    });
    // treasures to start with
    for (let k = 0; k < 13; k++) this.spawnTreasure(k < 1 ? "chest" : k < 4 ? "pearl" : "coin");
    for (let k = 0; k < 4; k++) this.spawnJelly(k);
    this.hud.players(this.players, () => this.scoreHtml(0));
    this.hud.timer(TIME);
    this.setCam([0, 6, 30], [0, -3, 0], 40);
  }

  private scoreHtml(n: number) {
    return `${n} <span style="font-size:0.55em">${T("pts", "分")}</span>`;
  }

  // ------------------------------------------------------------ the lagoon

  private buildLagoon() {
    const s = this.scene;
    // backdrop: sky above the waterline, deepening blue below
    const back = canvasTex(64, 512, (g, w, h) => {
      const y0 = h * 0.18;
      const sky = g.createLinearGradient(0, 0, 0, y0);
      sky.addColorStop(0, "#5ec0ff");
      sky.addColorStop(1, "#d8f2ff");
      g.fillStyle = sky;
      g.fillRect(0, 0, w, y0);
      const sea = g.createLinearGradient(0, y0, 0, h);
      sea.addColorStop(0, "#3fc4ee");
      sea.addColorStop(0.45, "#1f86c8");
      sea.addColorStop(1, "#0b3e78");
      g.fillStyle = sea;
      g.fillRect(0, y0, w, h - y0);
    });
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(120, 44), new THREE.MeshBasicMaterial({ map: back, fog: false }));
    // its waterline (18 % from the top) must line up with y = 0 seen from the camera
    bd.position.set(0, 1.53 - (22 - 0.18 * 44), -14);
    s.add(bd);
    // far islands on the horizon
    for (const [x, sc] of [
      [-24, 1.4],
      [19, 1],
    ]) {
      const g = group(s, { x, y: 1.3, z: -12 });
      ball(g, "#f2dca0", [5 * sc, 1.2 * sc, 2], { lo: true, cast: false });
      cyl(g, "#8a5a32", 0.15, 3 * sc, { y: 1.6 * sc, rz: 0.2 });
      for (let k = 0; k < 5; k++) cone(g, "#3fae4a", 0.35, 1.8, { x: 0.3 * sc + Math.cos(k * 1.25) * 0.6, y: 3.0 * sc, z: Math.sin(k * 1.25) * 0.6, rz: Math.PI / 2 + Math.cos(k * 1.25) * 1.2, lo: true, cast: false });
    }
    // sea floor: a sandy strip following floorY, deep into the scene
    const nx = 120,
      nz = 18;
    const geo = new THREE.PlaneGeometry(80, 42, nx, nz);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k),
        z = pos.getZ(k);
      pos.setY(k, floorY(x) + Math.max(0, -z - 3) * 0.12 + Math.sin(x * 2.1 + z * 1.3) * 0.06);
    }
    geo.translate(0, 0, -4);
    geo.computeVertexNormals();
    const sand = canvasTex(256, 256, (g, w) => {
      g.fillStyle = "#e8d29a";
      g.fillRect(0, 0, w, w);
      g.strokeStyle = "rgba(190,160,100,0.5)";
      g.lineWidth = 5;
      for (let y = 10; y < w; y += 22) {
        g.beginPath();
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.08 + y) * 5);
        g.stroke();
      }
      for (let k = 0; k < 300; k++) {
        g.fillStyle = k % 2 ? "rgba(255,255,240,0.5)" : "rgba(160,130,80,0.4)";
        g.fillRect(Math.random() * w, Math.random() * w, 3, 3);
      }
    }, true);
    sand.repeat.set(13, 7);
    const floor = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: sand }));
    floor.receiveShadow = true;
    s.add(floor);
    // rocks and corals
    const coralCols = ["#ff6a8a", "#ff9a4a", "#b86aff", "#ffd23f", "#ff5ad2"];
    for (let k = 0; k < 16; k++) {
      const x = -15 + k * 2 + Math.sin(k * 3.7) * 0.8;
      const z = -2.2 - (k % 3) * 1.6;
      const y = floorY(x);
      if (k % 3 === 0) {
        const r = new THREE.Mesh(GEO.dodeca, toon("#7a7a8a"));
        r.scale.set(1.1, 0.7, 0.9);
        r.position.set(x, y + 0.2, z);
        r.rotation.set(k, k * 2, 0);
        s.add(r);
      } else {
        const g = group(s, { x, y, z });
        const c = coralCols[k % coralCols.length];
        if (k % 2) {
          for (let b = 0; b < 4; b++) cyl(g, c, 0.1, 0.9 + b * 0.2, { x: (b - 1.5) * 0.22, y: 0.5, rz: (b - 1.5) * 0.35, cast: false });
        } else {
          ball(g, c, [0.6, 0.45, 0.5], { y: 0.25, lo: true });
          ball(g, coralCols[(k + 2) % 5], 0.12, { x: 0.3, y: 0.6, cast: false });
          ball(g, coralCols[(k + 2) % 5], 0.12, { x: -0.25, y: 0.55, cast: false });
        }
      }
    }
    // kelp (instanced, swaying)
    const kelpGeo = new THREE.CapsuleGeometry(0.12, 1, 3, 6);
    kelpGeo.translate(0, 0.62, 0);
    this.kelp = new THREE.InstancedMesh(kelpGeo, toon("#3f9a4a"), 26);
    for (let k = 0; k < 26; k++) {
      const x = -16 + k * 1.3 + Math.sin(k * 5.1) * 0.5;
      const z = k % 2 ? -1.4 - (k % 4) * 0.8 : -5 - (k % 3);
      this.kelpData.push({ x, y: floorY(x) - 0.1, z, h: 1.6 + ((k * 7) % 5) * 0.5, ph: k * 1.3 });
      this.kelp.setColorAt(k, new THREE.Color(k % 3 ? "#3f9a4a" : "#5ab84a"));
    }
    s.add(this.kelp);
    // fish schools in the background (instanced)
    const body = new THREE.SphereGeometry(0.3, 10, 6);
    body.scale(1.4, 0.8, 0.45);
    const tail = new THREE.ConeGeometry(0.22, 0.35, 4);
    tail.rotateZ(Math.PI / 2);
    tail.translate(-0.55, 0, 0);
    const fishGeo = mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()])!;
    body.dispose();
    tail.dispose();
    this.fish = new THREE.InstancedMesh(fishGeo, toon("#ffffff"), 22);
    const fishCols = ["#ffb020", "#ff6a4a", "#5ad0ff", "#ffe14a"];
    for (let k = 0; k < 22; k++) {
      const school = k < 12 ? 0 : 1;
      this.fishData.push({ x: (Math.random() - 0.5) * 30, y: school ? -6 + Math.random() * 1.6 : -3 + Math.random() * 1.6, z: school ? -8 - Math.random() * 1.5 : -6 - Math.random() * 1.5, v: school ? -1.4 : 1.8, ph: Math.random() * 6, s: 0.8 + Math.random() * 0.5 });
      this.fish.setColorAt(k, new THREE.Color(fishCols[(k + school) % 4]));
    }
    s.add(this.fish);
    // god rays from the surface
    const rayTex = canvasTex(64, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "rgba(255,255,255,0.9)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
    for (let k = 0; k < 6; k++) {
      const r = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: rayTex, color: "#bff0ff", transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      r.scale.set(1.6 + (k % 3) * 0.8, 10, 1);
      r.position.set(-13 + k * 5.2, -5, -3.5);
      r.rotation.z = 0.25;
      s.add(r);
      this.rays.push(r);
    }
    // the waterline: a foamy wavy strip, and a tinted surface plane seen edge-on
    this.foamTex = canvasTex(512, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = "rgba(120,215,255,0.85)";
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) g.lineTo(x, h * 0.45 + Math.sin((x / w) * Math.PI * 8) * 8);
      g.lineTo(w, h);
      g.fill();
      g.strokeStyle = "#ffffff";
      g.lineWidth = 7;
      g.beginPath();
      for (let x = 0; x <= w; x += 4) g.lineTo(x, h * 0.45 + Math.sin((x / w) * Math.PI * 8) * 8);
      g.stroke();
    }, true);
    this.foamTex.repeat.set(6, 1);
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(60, 0.9), new THREE.MeshBasicMaterial({ map: this.foamTex, transparent: true, depthWrite: false, fog: false }));
    foam.position.set(0, -0.05, 1.2);
    foam.renderOrder = 5;
    s.add(foam);
    // the boats
    BOATS.forEach((x, i) => {
      const p = this.players[i];
      const g = group(s, { x, y: 0, z: -0.4 });
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.8, 16, 1, false, Math.PI / 2, Math.PI), toon(p.char.color));
      hull.rotation.z = Math.PI / 2;
      hull.scale.set(1, 1, 0.8);
      hull.position.y = 0.15;
      hull.castShadow = true;
      g.add(hull);
      box(g, "#ffffff", 2.9, 0.14, 1.3, { y: 0.17 });
      box(g, "#8a5a32", 2.6, 0.08, 1.1, { y: 0.26 });
      cyl(g, "#8a5a32", 0.05, 2.0, { x: -0.3, y: 1.25 });
      const flag = new THREE.Mesh(GEO.plane, toon(p.char.color));
      flag.scale.set(0.8, 0.5, 1);
      flag.position.set(0.12, 2.0, 0);
      (flag.material as THREE.Material).side = THREE.DoubleSide;
      g.add(flag);
      // a treasure chest on deck (fills up with the score)
      box(g, "#a86a32", 0.6, 0.4, 0.5, { x: 0.7, y: 0.5 });
      box(g, "#ffc928", 0.62, 0.08, 0.52, { x: 0.7, y: 0.55 });
      // the loot on deck grows with the score
      const pile = ball(g, toon("#ffc928", "#a06a00", 0.4), [0.5, 0.3, 0.4], { x: 0.7, y: 0.7, cast: false });
      pile.scale.setScalar(0.001);
      this.piles.push(pile);
      // a life ring
      const ring = new THREE.Mesh(GEO.torus, toon("#ff4b3e"));
      ring.scale.setScalar(0.3);
      ring.position.set(-1.05, 0.35, 0.55);
      g.add(ring);
      this.boats.push(g);
      // (dark letters on a light seat colour)
      const c = new THREE.Color(p.char.color);
      const light = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b > 0.5;
      this.hud.label(g, `<span style="color:${light ? "#1d1630" : "#fff"}">${p.name}</span>`, { color: p.char.color, dy: 2.9 });
    });
  }

  // ------------------------------------------------------------ treasures

  private spawnTreasure(kind?: TKind, at?: number) {
    if (!kind) {
      const r = this.rnd();
      const chests = this.tr.filter((t) => t.kind === "chest" && !t.dead && t.by < 0).length;
      kind = r < 0.12 && chests < 2 ? "chest" : r < 0.4 ? "pearl" : "coin";
    }
    let x = at ?? 0;
    if (at === undefined) {
      for (let tries = 0; tries < 10; tries++) {
        // chests in the deep middle, the rest anywhere
        x = kind === "chest" ? (this.rnd() - 0.5) * 7 : (this.rnd() - 0.5) * 2 * (XW - 1);
        if (this.tr.every((t) => t.dead || t.by >= 0 || Math.abs(t.x - x) > 0.9)) break;
      }
    }
    const g = new THREE.Group();
    if (kind === "coin") {
      const c = this.coinProto.clone();
      c.scale.setScalar(1.1);
      g.add(c);
    } else if (kind === "pearl") {
      ball(g, "#ff9ac0", [0.42, 0.18, 0.36], { y: -0.08 });
      const top = ball(g, "#ffb8d4", [0.42, 0.2, 0.36], { y: 0.12, z: -0.12, rx: -0.6 });
      top.name = "lid";
      ball(g, toon("#ffffff", "#c8c8ff", 0.4), 0.17, { y: 0.06, z: 0.05 });
    } else {
      box(g, "#9a5a28", 0.8, 0.45, 0.55, { y: 0 });
      box(g, "#b06a32", 0.82, 0.22, 0.57, { y: 0.32 });
      box(g, "#ffc928", 0.84, 0.07, 0.59, { y: 0.2 });
      box(g, "#ffc928", 0.1, 0.5, 0.6, { y: 0.1 });
      box(g, toon("#ffe14a", "#a07000", 0.6), 0.6, 0.06, 0.4, { y: 0.45 });
    }
    const y = floorY(x) + 0.32;
    g.position.set(x, y, 0);
    this.scene.add(g);
    this.tr.push({ g, kind, x, y, by: -1, sink: false, fly: -1, fx0: 0, fy0: 0, toX: 0, dead: false, t: this.rnd() * 6 });
  }

  private dropAll(i: number) {
    const d = this.dv[i];
    for (const t of d.carry) {
      t.by = -1;
      t.sink = true;
      t.x = clamp(d.x + (Math.random() - 0.5) * 1.2, -XW + 0.5, XW - 0.5);
      t.y = d.y;
      t.g.position.set(t.x, t.y, 0);
    }
    if (d.carry.length) {
      this.hud.pop(new THREE.Vector3(d.x, d.y + 1.5, 0), T("Oops!", "哎呀！"), "#ff8a8a", this.camera);
    }
    d.carry = [];
  }

  // ------------------------------------------------------------ jellyfish

  private spawnJelly(k: number) {
    const g = new THREE.Group();
    const mat = new THREE.MeshToonMaterial({ color: "#ff9ae0", emissive: "#a03a8a", emissiveIntensity: 0.5, transparent: true, opacity: 0.8 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    g.add(dome);
    ball(g, flat("#1d1630"), 0.05, { x: -0.16, y: 0.22, z: 0.45, cast: false });
    ball(g, flat("#1d1630"), 0.05, { x: 0.16, y: 0.22, z: 0.45, cast: false });
    const tent: THREE.Object3D[] = [];
    for (let t = 0; t < 5; t++) {
      const a = (t / 5) * Math.PI * 2;
      const piv = group(g, { x: Math.cos(a) * 0.3, z: Math.sin(a) * 0.3 });
      const m = new THREE.Mesh(GEO.cylLo, mat);
      m.scale.set(0.05, 1.0, 0.05);
      m.position.y = -0.5;
      piv.add(m);
      tent.push(piv);
    }
    const x = -9 + k * 6 + (this.rnd() - 0.5) * 2;
    const baseY = -2.8 - (k % 2) * 2.2;
    g.position.set(x, baseY, 0.2);
    this.scene.add(g);
    this.jellies.push({ g, x, y: baseY, baseY, ph: this.rnd() * 6, vx: (this.rnd() < 0.5 ? -1 : 1) * (0.5 + this.rnd() * 0.4), tent, hit: [0, 0, 0, 0] });
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number): CpuPad {
    const d = this.dv[i];
    const lv = this.players[i].level;
    const st = this.cpuState[i];
    if (d.daze || d.stun > 0) return {};
    const bx = BOATS[i];
    const sp = SPEED * (1 - 0.12 * d.carry.length);
    // time to get up to the boat from here (with a margin that shrinks with skill… and a bit of greed)
    const upTime = (Math.abs(d.y - SURF) + Math.abs(d.x - bx) * 0.5) / sp;
    // beginners misjudge their air now and then (greed is rolled at each dive)
    const margin = 0.9 - st.greed;
    const mustGo = d.air < upTime + margin;
    if (st.mode === "dive" && (mustGo || d.carry.length >= MAXC)) st.mode = "up";
    if (st.mode === "dive" && d.carry.length > 0) {
      // nothing worth it near enough: go cash in
      const any = this.tr.some((t) => !t.dead && t.by < 0 && !t.sink && t.fly < 0 && dist2(t.x, t.y, d.x, d.y) / sp + (Math.abs(t.y - SURF) / sp) < d.air - 1);
      if (!any) st.mode = "up";
    }
    let tx: number, ty: number;
    let kick = false;
    if (st.mode === "up") {
      tx = bx;
      ty = SURF + 0.5;
      if (d.y > SURF - 0.3 && Math.abs(d.x - bx) < 1.2) {
        // at the boat: breathe before diving again
        if (d.carry.length === 0 && d.air > AIR * (0.75 + 0.2 * lv)) {
          st.mode = "dive";
          st.greed = (1 - lv) * (Math.random() * 2.4 - 0.8);
        }
        return { x: (bx - d.x) * 0.5, y: 0 };
      }
      if (d.y > SURF - 0.3 && Math.abs(d.x - bx) >= 1.2 && d.carry.length === 0) {
        if (d.air > AIR * 0.8) {
          st.mode = "dive";
          st.greed = (1 - lv) * (Math.random() * 2.4 - 0.8);
        }
      }
      kick = d.air < upTime + 0.5 || d.carry.length > 0;
    } else {
      // the best treasure: value over (distance + the climb back), rivals going for it count
      let tgt = st.tgt;
      if (tgt && (tgt.dead || tgt.by >= 0 || tgt.sink || tgt.fly >= 0)) tgt = null;
      if (!tgt || this.cpuAfter(i, "rethink", 1.2 - 0.6 * lv)) {
        this.cpuReset(i, "rethink");
        let best: Treasure | null = null,
          bs = 0;
        for (const t of this.tr) {
          if (t.dead || t.by >= 0 || t.sink || t.fly >= 0) continue;
          const dist = dist2(t.x, t.y, d.x, d.y);
          const need = dist / sp + Math.abs(t.y - SURF) / (sp * 0.85) + 0.6;
          if (need > d.air + (1 - lv) * 1.5) continue;
          let taken = 1;
          for (let j = 0; j < this.dv.length; j++) if (j !== i && this.cpuState[j].tgt === t && dist2(this.dv[j].x, this.dv[j].y, t.x, t.y) < dist) taken *= 1 - 0.6 * lv;
          const homeBias = 1 / (1 + Math.abs(t.x - bx) * 0.06 * lv);
          const s = ((Math.pow(VAL[t.kind], 0.7 + 0.5 * lv) * taken * homeBias) / (dist + 2)) * (t === tgt ? 1.2 : 1);
          if (s > bs) {
            bs = s;
            best = t;
          }
        }
        tgt = best;
        st.tgt = tgt;
      }
      if (!tgt) {
        st.mode = "up";
        tx = bx;
        ty = SURF;
      } else {
        tx = tgt.x;
        ty = tgt.y;
        kick = dist2(tx, ty, d.x, d.y) > 3 && this.cpuChance(i, 0.01, 0.06);
      }
    }
    // steer around jellyfish
    let dx = tx - d.x,
      dy = ty - d.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    for (const j of this.jellies) {
      const jx = j.x - d.x,
        jy = j.y - d.y;
      const jd = Math.hypot(jx, jy);
      if (jd < 2.2 + lv) {
        const avoid = (0.4 + 0.8 * lv) / Math.max(0.4, jd);
        dx -= (jx / jd) * avoid;
        dy -= (jy / jd) * avoid;
      }
    }
    const wob = (1 - lv) * 0.35;
    dx += Math.sin(this.t * 2.2 + i) * wob;
    dy += Math.cos(this.t * 1.7 + i) * wob;
    const k = Math.min(1, l / 0.5);
    return { x: dx * k, y: -dy * k, a: kick && d.cd <= 0 };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.decor(dt);
    this.moveCam([0, -2.4, 22], [0, -4.4, 0], dt, 1.6);
    this.dv.forEach((d, i) => {
      const a = this.avatars[i];
      a.anim = "swim";
      a.yaw = 0;
      a.pos.set(d.x, SURF + Math.sin(this.t * 2 + i) * 0.05, 0);
    });
  }

  private decor(dt: number) {
    const tt = performance.now() / 1000;
    this.foamTex.offset.x = (tt * 0.05) % 1;
    this.boats.forEach((b, i) => {
      this.boatBob[i] = Math.max(0, this.boatBob[i] - dt * 2);
      b.position.y = Math.sin(tt * 1.6 + i) * 0.08 + Math.sin(this.boatBob[i] * 10) * 0.15 * this.boatBob[i];
      b.rotation.z = Math.sin(tt * 1.2 + i * 2) * 0.05;
    });
    for (let k = 0; k < this.fishData.length; k++) {
      const f = this.fishData[k];
      f.x += f.v * dt;
      if (f.x > 22) f.x = -22;
      if (f.x < -22) f.x = 22;
      this.e.set(0, f.v > 0 ? 0 : Math.PI, Math.sin(tt * 6 + f.ph) * 0.1);
      this.q.setFromEuler(this.e);
      this.m4.compose(this.v.set(f.x, f.y + Math.sin(tt + f.ph) * 0.2, f.z), this.q, this.sc.set(f.s, f.s, f.s));
      this.fish.setMatrixAt(k, this.m4);
    }
    this.fish.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < this.kelpData.length; k++) {
      const kd = this.kelpData[k];
      this.e.set(0, 0, Math.sin(tt * 1.3 + kd.ph) * 0.18);
      this.q.setFromEuler(this.e);
      this.m4.compose(this.v.set(kd.x, kd.y, kd.z), this.q, this.sc.set(1, kd.h, 1));
      this.kelp.setMatrixAt(k, this.m4);
    }
    this.kelp.instanceMatrix.needsUpdate = true;
    this.rays.forEach((r, k) => {
      (r.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(tt * 0.7 + k * 1.7) * 0.06;
    });
    // treasures shimmer
    for (const t of this.tr) {
      if (t.by >= 0 || t.dead || t.fly >= 0) continue;
      t.t += dt;
      if (t.kind === "coin") t.g.rotation.y += dt * 2;
      if (t.kind === "chest" && Math.random() < dt * 3) this.fx.sparkle({ x: t.x + (Math.random() - 0.5) * 0.6, y: t.y + 0.5, z: 0.3 }, "#ffe14a", 2);
      if (t.kind === "pearl") {
        const lid = t.g.getObjectByName("lid");
        if (lid) lid.rotation.x = -0.4 - Math.abs(Math.sin(t.t * 0.8)) * 0.5;
      }
    }
    // jellyfish pulse
    for (const j of this.jellies) {
      j.ph += dt;
      const pulse = Math.sin(j.ph * 3);
      j.g.scale.set(1 + pulse * 0.08, 1 - pulse * 0.1, 1 + pulse * 0.08);
      j.tent.forEach((t, k) => (t.rotation.z = Math.sin(j.ph * 2.5 + k) * 0.35));
    }
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.decor(dt);
    this.moveCam([0, -2.4, 22], [0, -4.4, 0], dt, 3);
    if (!this.hurry && left <= 10) {
      this.hurry = true;
      this.hud.banner(T("10 seconds left!", "还剩 10 秒！"), { color: "#ffd23f", sub: T("Get your treasure back to the boat!", "快把宝物带回船上！"), size: 7 });
      music.speed(1.15);
      this.sound("bell");
      for (let k = 0; k < 2; k++) this.spawnTreasure("chest");
    }
    // more treasure falls to the floor over time
    this.nextT -= dt;
    const onFloor = this.tr.filter((t) => !t.dead && t.by < 0 && t.fly < 0).length;
    if (this.nextT <= 0 && onFloor < 14) {
      this.spawnTreasure();
      this.nextT = 0.9 + this.rnd() * 0.9;
    }
    // jellyfish drift
    for (const j of this.jellies) {
      j.x += j.vx * dt;
      if (Math.abs(j.x) > XW - 0.5) j.vx = -j.vx;
      j.y = j.baseY + Math.sin(j.ph * 0.6) * 1.6;
      j.g.position.set(j.x, j.y, 0.2);
      for (let k = 0; k < 4; k++) j.hit[k] -= dt;
    }

    this.dv.forEach((d, i) => {
      const a = this.avatars[i];
      const p = this.pad(i);
      d.cd -= dt;
      d.stun -= dt;
      const atSurf = d.y >= SURF - 0.12;
      const sp = SPEED * (1 - 0.12 * d.carry.length) * (this.hurry ? 1.08 : 1);
      if (d.daze) {
        // floating up, helpless
        d.vx *= Math.exp(-3 * dt);
        d.vy = 2.6;
        a.anim = "stun";
        if (atSurf) {
          d.daze = false;
          d.stun = 0.4;
          this.sound("splash");
          this.fx.splash({ x: d.x, y: 0, z: 0.5 });
        }
      } else if (d.stun > 0) {
        d.vx *= Math.exp(-4 * dt);
        d.vy *= Math.exp(-4 * dt);
        a.anim = "stun";
      } else {
        const k = 1 - Math.exp(-4.5 * dt);
        d.vx += (p.x * sp - d.vx) * k;
        d.vy += (-p.y * sp - d.vy) * k;
        // a little buoyancy when not swimming
        if (Math.abs(p.y) < 0.1) d.vy += 0.6 * dt;
        if (p.aDown && d.cd <= 0) {
          const l = Math.hypot(p.x, p.y);
          const kx = l > 0.2 ? p.x / l : Math.sin(a.yaw);
          const ky = l > 0.2 ? -p.y / l : 0;
          d.vx += kx * KICK_V;
          d.vy += ky * KICK_V;
          d.cd = KICK_CD;
          this.sound("whoosh");
          this.fx.burst({ x: d.x - kx * 0.6, y: d.y + 0.4, z: 0.3 }, { count: 8, colors: ["#e8faff", "#bff0ff"], speed: 1.5, up: 1.5, gravity: -3, size: 0.12, life: 0.7, shape: "ball", drag: 2 });
        }
        a.anim = "swim";
      }
      d.x = clamp(d.x + d.vx * dt, -XW, XW);
      d.y += d.vy * dt;
      const fl = floorY(d.x) + 0.45;
      if (d.y < fl) {
        d.y = fl;
        d.vy = Math.max(0, d.vy);
      }
      if (d.y > SURF) {
        d.y = SURF;
        d.vy = Math.min(0, d.vy);
      }
      // facing: along the swim, or the camera when floating at the surface
      if (Math.abs(d.vx) > 0.4) d.face = d.vx > 0 ? Math.PI / 2 : -Math.PI / 2;
      else if (atSurf && Math.abs(d.vy) < 0.5) d.face = 0;
      a.face(d.face, dt, 10);
      a.pos.set(d.x, d.y + (atSurf ? Math.sin(this.t * 3 + i) * 0.05 : 0), 0);
      // air
      if (atSurf) d.air = Math.min(AIR, d.air + REFILL * dt);
      else {
        d.air -= dt;
        if (this.t > d.lastBubble) {
          d.lastBubble = this.t + 0.4 + Math.random() * 0.4;
          this.fx.burst({ x: d.x + Math.sin(a.yaw) * 0.3, y: d.y + 1.1, z: 0.3 }, { count: 2, colors: ["#e8faff"], speed: 0.3, up: 1.5, gravity: -2.5, size: 0.08, sizeEnd: 0.12, life: 1.2, shape: "ball", drag: 1 });
        }
        if (d.air <= 0 && !d.daze) {
          d.air = 0;
          d.daze = true;
          this.dropAll(i);
          this.sound("wrong");
          this.buzz(i, [100, 50, 100]);
          this.hud.pop(new THREE.Vector3(d.x, d.y + 2, 0), T("Out of air!", "没气了！"), "#ff6a5a", this.camera);
          this.fx.burst({ x: d.x, y: d.y + 1, z: 0.3 }, { count: 16, colors: ["#e8faff", "#bff0ff"], speed: 2, up: 2, gravity: -3, size: 0.12, life: 1, shape: "ball", drag: 1 });
        }
      }
      // the air gauge
      const k2 = d.air / AIR;
      d.fill.style.width = `${(k2 * 100).toFixed(1)}%`;
      d.fill.style.background = k2 < 0.3 ? (Math.floor(this.t * 6) % 2 ? "#ff4b3e" : "#ff9a8a") : k2 < 0.55 ? "#ffd23f" : "#7fe0ff";
      d.bar.style.opacity = atSurf && k2 >= 0.999 ? "0.35" : "1";
      // pick up treasures
      if (!d.daze && d.stun <= 0 && d.carry.length < MAXC) {
        for (const t of this.tr) {
          if (t.dead || t.by >= 0 || t.fly >= 0) continue;
          if (dist2(t.x, t.y, d.x, d.y + 0.4) < 0.85) {
            t.by = i;
            t.sink = false;
            d.carry.push(t);
            this.sound(t.kind === "chest" ? "power" : "pop");
            this.fx.sparkle({ x: t.x, y: t.y + 0.3, z: 0.3 }, t.kind === "chest" ? "#ffe14a" : "#ffffff", 8);
            this.buzz(i, 20);
            if (d.carry.length >= MAXC) break;
          }
        }
      }
      // carried treasures trail behind
      d.carry.forEach((t, n) => {
        const back = d.face > 0.1 ? -1 : d.face < -0.1 ? 1 : 0;
        const tx = d.x + back * (0.55 + n * 0.35),
          ty = d.y + 0.5 - n * 0.25;
        t.x = lerp(t.x, tx, 1 - Math.exp(-10 * dt));
        t.y = lerp(t.y, ty, 1 - Math.exp(-10 * dt));
        t.g.position.set(t.x, t.y, 0.35);
        t.g.scale.setScalar(0.8);
      });
      // deliver at your boat
      if (atSurf && d.carry.length && Math.abs(d.x - BOATS[i]) < 1.7) {
        let v = 0;
        for (const t of d.carry) {
          v += VAL[t.kind];
          t.by = -1;
          t.fly = 0;
          t.fx0 = t.x;
          t.fy0 = t.y;
          t.toX = BOATS[i];
        }
        d.score += v;
        d.carry = [];
        this.boatBob[i] = 1;
        const k = Math.min(1, 0.25 + d.score / 30);
        this.piles[i].scale.set(0.5 * k, 0.32 * k, 0.4 * k);
        this.hud.setScore(this.players[i].seat, this.scoreHtml(d.score));
        this.hud.pop(new THREE.Vector3(BOATS[i], 2.2, 0), `+${v}`, "#ffe14a", this.camera);
        this.sound(v >= 5 ? "cash" : "coins");
        this.fx.sparkle({ x: BOATS[i], y: 1, z: 0 }, "#ffe14a", 10 + v * 3);
        this.fx.splash({ x: d.x, y: 0, z: 0.5 });
        this.buzz(i, 60);
      }
      // jellyfish
      if (!d.daze && d.stun <= 0) {
        for (const j of this.jellies) {
          if (j.hit[i] > 0) continue;
          if (dist2(j.x, j.y - 0.2, d.x, d.y + 0.5) < 0.95) {
            j.hit[i] = 1.5;
            d.stun = 0.9;
            const dx = d.x - j.x,
              dy = d.y + 0.5 - j.y,
              l = Math.hypot(dx, dy) || 1;
            d.vx = (dx / l) * 5;
            d.vy = (dy / l) * 5;
            this.dropAll(i);
            this.avatars[i].flash();
            this.sound("zap");
            this.buzz(i, [80, 40, 80]);
            this.shake = 0.2;
            this.fx.burst({ x: d.x, y: d.y + 0.6, z: 0.3 }, { count: 12, colors: ["#ff9ae0", "#ffffff", "#ffe14a"], speed: 4, size: 0.12, life: 0.5, shape: "ball", gravity: 0 });
          }
        }
      }
    });
    // treasures: sinking back, flying to the boats
    for (const t of this.tr) {
      if (t.dead) continue;
      if (t.sink) {
        const fl = floorY(t.x) + 0.32;
        t.y = Math.max(fl, t.y - 2.2 * dt);
        t.g.position.set(t.x, t.y, 0);
        t.g.rotation.z += dt * 2;
        t.g.scale.setScalar(1);
        if (t.y <= fl) {
          t.sink = false;
          t.g.rotation.z = 0;
        }
      } else if (t.fly >= 0) {
        t.fly += dt / 0.45;
        const k = Math.min(1, t.fly);
        const bx = t.toX;
        t.g.position.set(lerp(t.fx0, bx, k), lerp(t.fy0, 0.6, k) + Math.sin(k * Math.PI) * 1.4, 0);
        t.g.scale.setScalar(0.8 * (1 - k * 0.6));
        if (k >= 1) {
          t.dead = true;
          t.g.removeFromParent();
        }
      }
    }
    this.tr = this.tr.filter((t) => !t.dead);
    // players bump (gently)
    for (let i = 0; i < this.dv.length; i++)
      for (let j = i + 1; j < this.dv.length; j++) {
        const A = this.dv[i],
          B = this.dv[j];
        const dx = B.x - A.x,
          dy = B.y - A.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.7 && d > 1e-4) {
          const push = (0.7 - d) / 2;
          A.x -= (dx / d) * push;
          A.y -= (dy / d) * push;
          B.x += (dx / d) * push;
          B.y += (dy / d) * push;
        }
      }

    if (left <= 0) this.finishByScore(this.dv.map((d) => d.score));
  }

  protected outroStep(dt: number) {
    this.decor(dt);
    this.dv.forEach((d, i) => {
      // everyone floats up to the surface for the finish
      d.y = Math.min(SURF, d.y + dt * 3);
      this.avatars[i].pos.set(d.x, d.y, 0);
      this.avatars[i].face(0, dt, 6);
    });
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.coinProto.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    super.dispose();
  }

  protected celebrate(res: { place: number[] }) {
    this.avatars.forEach((a, i) => (a.anim = res.place[i] === 1 ? "win" : "swim"));
  }
}

const def: MiniDef = {
  id: "plongee",
  name: "Treasure Dive",
  icon: "🤿",
  color: "#1e90d6",
  tagline: "Dive for treasure before you run out of air.",
  rules: "Pick up to 3 treasures on the seabed (ⓩ coin 1, pearl 2, chest 5) and bring them to your boat. Air refills at the surface. Mind the jellyfish!",
  controls: { stick: "Swim", a: "Flipper kick" },
  modes: ["ffa"],
  length: 45,
  music: "mini2",
  create: (ctx) => new Plongee(ctx),
};
export default def;
