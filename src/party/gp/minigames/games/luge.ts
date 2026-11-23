/**
 * DESCENTE EN LUGE (chacun pour soi, ~30 s): a sled race down a snowy piste lined with pines.
 * Stick left/right steers, A gives a push (costs stamina, which comes back slowly). Trees and rocks
 * on the piste crash you for a second; riding between the two flags of a gate gives a burst of speed.
 * Places by finishing time; at 45 s (or 10 s after the winner) the rest rank by distance.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { FONT_TITLE, GEO, box, canvasTex, cyl, flat, group, toon } from "../../engine/gfx";
import { portrait } from "../../engine/chars3d";
import { clamp, damp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const LEN = 470; // finish line (distance down the piste)
const CAP = 45;
const GRACE = 10;
const HALF = 8; // half width of the piste
const SLOPE = 0.3;
const VTERM = 14.5; // terminal speed on the slope
const VMAXX = 25;
const PUSH_V = 2.6;
const PUSH_COST = 0.26;
const GATE_V = 3.6;
const CRASH_T = 1.0;
const SR = 0.5; // sled radius
const placeTxt = (n: number) => T(["1st", "2nd", "3rd", "4th"][n - 1] ?? `${n}th`, `第 ${n} 名`);

interface Obst {
  d: number;
  u: number;
  r: number;
  kind: "pine" | "rock";
}
interface Ramp {
  d: number;
  u: number;
  w: number;
}
interface Gate {
  d: number;
  u: number;
  w: number;
  flags: THREE.Group[];
  passed: boolean[];
}
interface Sled {
  g: THREE.Group;
  tilt: THREE.Group;
  label: HTMLElement;
  d: number;
  u: number;
  v: number;
  vu: number;
  stamina: number;
  pushCd: number;
  crashT: number;
  safeT: number;
  spin: number;
  lean: number;
  done: boolean;
  finishT: number;
  place: number;
  sprayT: number;
  // CPU plan
  lane: number;
  planT: number;
  airT: number;
  airDur: number;
  blind: Map<number, boolean>;
}

/** The piste's centre line wanders a little. */
const cx = (d: number) => Math.sin(d / 41) * 7 + Math.sin(d / 17 + 1.3) * 2.2;
const cxd = (d: number) => Math.cos(d / 41) * (7 / 41) + Math.cos(d / 17 + 1.3) * (2.2 / 17);
const baseY = (d: number) => (d < LEN ? -SLOPE * d : -SLOPE * LEN - (d - LEN) * 0.06);
const sideY = (u: number) => {
  const a = Math.abs(u);
  return 0.75 * Math.exp(-((a - HALF - 0.7) ** 2) / 0.45) + Math.max(0, a - HALF - 1.4) * 0.38;
};
const groundY = (d: number, u: number) => baseY(d) + sideY(u);

function lum(hex: string) {
  const c = new THREE.Color(hex);
  return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
}

class Luge extends BaseMini {
  private obst: Obst[] = [];
  private gates: Gate[] = [];
  private ramps: Ramp[] = [];
  private sleds: Sled[] = [];
  private instanced: THREE.InstancedMesh[] = [];
  private flakes!: THREE.Points;
  private flakePos!: Float32Array;
  private barEl!: HTMLElement;
  private dots: HTMLElement[] = [];
  private cards: string[] = [];
  private firstDoneT = -1;
  private doneCount = 0;
  private warned = false;
  private smoke: THREE.Mesh[] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v3 = new THREE.Vector3();
  private s3 = new THREE.Vector3();
  private camF = 0;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#5aa8f0", "#e8f4ff"], size: 26, sun: [0.35, 1, -0.45], fog: { color: "#e4f0fb", near: 55, far: 170 }, hemi: ["#ffffff", "#b8c8e0", 1.6] });
    this.buildSlope();
    this.buildCourse();
    this.buildFinish();
    this.buildSleds();
    this.hud.players(this.players, (p) => this.cardHtml(p.i));
    this.buildBar();
    this.frameCam(1, 100, true);
  }

  private wp(d: number, u: number, out = new THREE.Vector3()) {
    return out.set(cx(d) + u, groundY(d, u), -d);
  }

  private inst(geo: THREE.BufferGeometry, mat: THREE.Material, list: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; rx?: number; c?: string }[], cast = true) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    const col = new THREE.Color();
    list.forEach((o, i) => {
      this.q.setFromEuler(this.e.set(o.rx ?? 0, o.ry ?? 0, 0));
      this.m4.compose(this.v3.set(o.x, o.y, o.z), this.q, this.s3.set(o.sx, o.sy, o.sz));
      m.setMatrixAt(i, this.m4);
      if (o.c) m.setColorAt(i, col.set(o.c));
    });
    m.count = list.length;
    m.castShadow = cast;
    m.receiveShadow = true;
    this.scene.add(m);
    this.instanced.push(m);
    return m;
  }

  // ------------------------------------------------------------ the mountain

  private buildSlope() {
    const us = [-70, -40, -24, -16, -12.5, -10.5, -9.6, -9.0, -8.5, -8.0, -6, -3, 0, 3, 6, 8.0, 8.5, 9.0, 9.6, 10.5, 12.5, 16, 24, 40, 70];
    const d0 = -40,
      d1 = LEN + 90,
      step = 2;
    const rows = Math.floor((d1 - d0) / step) + 1;
    const pos = new Float32Array(rows * us.length * 3);
    const col = new Float32Array(rows * us.length * 3);
    const uv = new Float32Array(rows * us.length * 2);
    const piste = new THREE.Color("#e4f0ff"),
      snow = new THREE.Color("#ffffff"),
      shade = new THREE.Color("#d2e4f8");
    const c = new THREE.Color();
    for (let r = 0; r < rows; r++) {
      const d = d0 + r * step;
      us.forEach((u, j) => {
        const k = r * us.length + j;
        pos.set([cx(d) + u, groundY(d, u), -d], k * 3);
        const a = Math.abs(u);
        if (a < HALF) c.copy(piste).lerp(shade, ((r + j) % 2) * 0.25);
        else c.copy(snow);
        col.set([c.r, c.g, c.b], k * 3);
        uv.set([u / 4, d / 4], k * 2);
      });
    }
    const idx: number[] = [];
    for (let r = 0; r < rows - 1; r++)
      for (let j = 0; j < us.length - 1; j++) {
        const a = r * us.length + j,
          b = a + 1,
          cc = a + us.length,
          dd = cc + 1;
        idx.push(a, b, cc, b, dd, cc);
      }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    // groomed corduroy
    const tex = canvasTex(
      64,
      64,
      (g, w, h) => {
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "rgba(150,180,220,0.18)";
        for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 3, h);
        for (let i = 0; i < 40; i++) {
          g.fillStyle = "rgba(255,255,255,0.9)";
          g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
        }
      },
      true,
    );
    const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, map: tex }));
    m.receiveShadow = true;
    this.scene.add(m);

    // the orange safety nets along both sides
    const net = canvasTex(
      64,
      32,
      (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.strokeStyle = "rgba(255,120,30,0.95)";
        g.lineWidth = 3;
        for (let x = -h; x < w + h; x += 10) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x + h, h);
          g.stroke();
          g.beginPath();
          g.moveTo(x + h, 0);
          g.lineTo(x, h);
          g.stroke();
        }
        g.fillStyle = "#ff7a1e";
        g.fillRect(0, 0, w, 4);
      },
      true,
    );
    const netMat = new THREE.MeshBasicMaterial({ map: net, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    for (const sg of [-1, 1]) {
      const n = Math.floor((LEN + 20) / 2);
      const p = new Float32Array((n + 1) * 6),
        t = new Float32Array((n + 1) * 4);
      const u = sg * (HALF + 1.6);
      for (let i = 0; i <= n; i++) {
        const d = -10 + i * 2;
        const y = groundY(d, u);
        p.set([cx(d) + u, y, -d, cx(d) + u, y + 1.0, -d], i * 6);
        t.set([i / 2, 0, i / 2, 1], i * 4);
      }
      const ix: number[] = [];
      for (let i = 0; i < n; i++) ix.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
      const gg = new THREE.BufferGeometry();
      gg.setIndex(ix);
      gg.setAttribute("position", new THREE.BufferAttribute(p, 3));
      gg.setAttribute("uv", new THREE.BufferAttribute(t, 2));
      const nm = new THREE.Mesh(gg, netMat);
      this.scene.add(nm);
      // net posts
      const posts: { x: number; y: number; z: number; sx: number; sy: number; sz: number }[] = [];
      for (let d = -10; d < LEN + 10; d += 6) posts.push({ x: cx(d) + u, y: groundY(d, u) + 0.55, z: -d, sx: 0.06, sy: 1.1, sz: 0.06 });
      this.inst(GEO.cylLo, toon("#3a3a46"), posts, false);
    }

    // the forest: pines on both slopes (instanced: trunk, 3 green layers, snow caps)
    const pines: { x: number; y: number; z: number; s: number }[] = [];
    const r = this.rnd;
    for (let d = -40; d < LEN + 90; d += 2.2) {
      for (const sg of [-1, 1]) {
        let u = HALF + 3 + r() * 3;
        while (u < 46) {
          const uu = u + (r() - 0.5) * 1.5;
          const dd = d + (r() - 0.5) * 2;
          // keep the finish area clear
          if (!(dd > LEN - 14 && dd < LEN + 40 && uu < 26)) pines.push({ x: cx(dd) + sg * uu, y: groundY(dd, sg * uu), z: -dd, s: 1.2 + r() * 1.1 });
          u += 3 + r() * 5 + u * 0.1;
        }
      }
    }
    // obstacles on the piste
    this.layCourse();
    for (const o of this.obst) if (o.kind === "pine") pines.push({ x: cx(o.d) + o.u, y: groundY(o.d, o.u), z: -o.d, s: 1.15 });
    this.pineInst(pines);
    const rocks = this.obst.filter((o) => o.kind === "rock");
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    this.inst(
      rockGeo,
      toon("#6f7486"),
      rocks.map((o) => ({ x: cx(o.d) + o.u, y: groundY(o.d, o.u) + 0.45, z: -o.d, sx: o.r * 1.1, sy: o.r * 0.95, sz: o.r * 1.05, ry: o.d })),
    );
    this.inst(
      GEO.sphereLo,
      toon("#ffffff"),
      rocks.map((o) => ({ x: cx(o.d) + o.u, y: groundY(o.d, o.u) + 0.45 + o.r * 0.7, z: -o.d, sx: o.r * 0.8, sy: o.r * 0.3, sz: o.r * 0.75 })),
      false,
    );

    // far mountains across the valley
    const mts: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    const caps: typeof mts = [];
    for (let i = 0; i < 9; i++) {
      const x = -140 + i * 35 + (r() - 0.5) * 20;
      const h = 60 + r() * 50;
      const z = -LEN - 150 - r() * 60;
      const y = baseY(LEN) - 40;
      mts.push({ x, y: y + h / 2, z, sx: 40 + r() * 20, sy: h, sz: 40, c: i % 2 ? "#8ea6c8" : "#7c94b8" });
      caps.push({ x, y: y + h - h * 0.14, z, sx: 0, sy: h * 0.3, sz: 0, c: "#ffffff" });
      caps[caps.length - 1].sx = mts[mts.length - 1].sx * 0.3;
      caps[caps.length - 1].sz = 12;
    }
    this.inst(GEO.coneLo, toon("#ffffff"), mts, false);
    this.inst(GEO.coneLo, toon("#ffffff"), caps, false);

    // falling snow around the camera
    const N = 500;
    this.flakePos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) this.flakePos.set([(r() - 0.5) * 40, r() * 20, (r() - 0.5) * 40], i * 3);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(this.flakePos, 3));
    this.flakes = new THREE.Points(fg, new THREE.PointsMaterial({ color: "#ffffff", size: 0.16, transparent: true, opacity: 0.9, depthWrite: false }));
    this.flakes.frustumCulled = false;
    this.scene.add(this.flakes);
  }

  private pineInst(pines: { x: number; y: number; z: number; s: number }[]) {
    const r = this.rnd;
    const greens = ["#2f8f5b", "#287a4f", "#3a9e62", "#24704a"];
    this.inst(GEO.cylLo, toon("#6a4228"), pines.map((p) => ({ x: p.x, y: p.y + 0.35 * p.s, z: p.z, sx: 0.14 * p.s, sy: 0.7 * p.s, sz: 0.14 * p.s })));
    const layers: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string; ry: number }[] = [];
    const snow: typeof layers = [];
    for (const p of pines) {
      const c = greens[Math.floor(r() * greens.length)];
      const ry = r() * 6;
      layers.push({ x: p.x, y: p.y + 1.15 * p.s, z: p.z, sx: 0.85 * p.s, sy: 1.2 * p.s, sz: 0.85 * p.s, c, ry });
      layers.push({ x: p.x, y: p.y + 1.75 * p.s, z: p.z, sx: 0.66 * p.s, sy: 1.0 * p.s, sz: 0.66 * p.s, c, ry });
      layers.push({ x: p.x, y: p.y + 2.3 * p.s, z: p.z, sx: 0.45 * p.s, sy: 0.85 * p.s, sz: 0.45 * p.s, c, ry });
      snow.push({ x: p.x, y: p.y + 2.55 * p.s, z: p.z, sx: 0.26 * p.s, sy: 0.38 * p.s, sz: 0.26 * p.s, c: "#ffffff", ry });
      snow.push({ x: p.x, y: p.y + 1.42 * p.s, z: p.z, sx: 0.6 * p.s, sy: 0.22 * p.s, sz: 0.6 * p.s, c: "#f4f9ff", ry });
    }
    this.inst(GEO.coneLo, toon("#ffffff"), layers);
    this.inst(GEO.coneLo, toon("#ffffff"), snow, false);
  }

  /** Obstacles and gates along the piste. */
  private layCourse() {
    const r = this.rnd;
    // gates first
    for (let d = 40; d < LEN - 25; d += 34 + r() * 10) {
      const u = (r() - 0.5) * 2 * (HALF - 3);
      this.gates.push({ d, u, w: 3.8, flags: [], passed: [false, false, false, false] });
    }
    // snow kickers in clear spots
    for (let rd = 70; rd < LEN - 40; rd += 62 + r() * 20) {
      const u = (r() - 0.5) * 2 * (HALF - 3);
      if (this.gates.some((g) => Math.abs(g.d - rd) < 9)) continue;
      this.ramps.push({ d: rd, u, w: 3.2 });
    }
    let d = 26;
    while (d < LEN - 12) {
      const n = r() < 0.35 ? 2 : 1;
      const used: number[] = [];
      for (let k = 0; k < n; k++) {
        let u = 0,
          ok = false;
        for (let tries = 0; tries < 12 && !ok; tries++) {
          u = (r() - 0.5) * 2 * (HALF - 1.2);
          ok = used.every((o) => Math.abs(o - u) > 4) && this.gates.every((g) => Math.abs(g.d - d) > 7 || Math.abs(g.u - u) > g.w / 2 + 2.2) && this.ramps.every((q) => Math.abs(q.d - d) > 6 || Math.abs(q.u - u) > q.w / 2 + 1.6);
        }
        if (!ok) continue;
        used.push(u);
        const kind = r() < 0.55 ? "pine" : "rock";
        this.obst.push({ d: d + (r() - 0.5) * 2, u, r: kind === "pine" ? 0.75 : 0.85, kind });
      }
      d += 8 + r() * 6 - Math.min(3, d / 150);
    }
  }

  private buildCourse() {
    const s = this.scene;
    // gates: two flag poles each (red & blue)
    const flagTex = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(0, h - 8, w, 8);
    });
    for (const [n, gt] of this.gates.entries()) {
      const col = n % 2 ? "#2f7dff" : "#ff3b3b";
      for (const sg of [-1, 1]) {
        const u = gt.u + (sg * gt.w) / 2;
        const p = this.wp(gt.d, u);
        const fg = group(s, { x: p.x, y: p.y, z: p.z });
        cyl(fg, "#f4f4f4", 0.08, 2.6, { y: 1.3, seg: 6 });
        const fl = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ color: col, map: flagTex, side: THREE.DoubleSide }));
        fl.scale.set(1.3, 1.0, 1);
        fl.position.set(-sg * 0.66, 2.0, 0);
        fl.castShadow = true;
        fg.add(fl);
        gt.flags.push(fg);
      }
      // a faint arc on the snow between the flags
      const mid = this.wp(gt.d, gt.u);
      const lane = new THREE.Mesh(GEO.plane, flat(col, 0.22));
      lane.rotation.x = -Math.PI / 2;
      lane.scale.set(gt.w, 1.6, 1);
      lane.position.set(mid.x, mid.y + 0.03, mid.z);
      s.add(lane);
    }
    // kickers: a tilted white board with blue edges
    for (const q of this.ramps) {
      const p = this.wp(q.d - 1.3, q.u);
      const rg = group(s, { x: p.x, y: p.y, z: p.z });
      rg.rotation.order = "YXZ";
      rg.rotation.y = Math.atan2(cxd(q.d), -1);
      rg.rotation.x = Math.atan(SLOPE) - 0.28;
      box(rg, "#f4f9ff", q.w, 0.14, 2.7, { y: 0.32 });
      for (const sg of [-1, 1]) box(rg, "#2f7dff", 0.16, 0.2, 2.7, { x: (sg * q.w) / 2, y: 0.34 });
      box(rg, "#ffd23f", q.w, 0.18, 0.2, { y: 0.36, z: 1.3 });
      box(rg, "#d8e6f6", q.w, 0.5, 0.3, { y: 0.1, z: 1.2 });
    }
    // start hut with a banner
    const st = this.wp(-3, 0);
    const hut = group(s, { x: st.x, y: st.y, z: st.z });
    for (const sg of [-1, 1]) {
      box(hut, "#8a5a32", 0.5, 3.6, 0.5, { x: sg * (HALF + 0.4), y: 1.8 });
    }
    box(hut, "#6a4228", HALF * 2 + 1.4, 0.5, 0.7, { y: 3.6 });
    box(hut, "#ffffff", HALF * 2 + 1.6, 0.25, 0.9, { y: 3.95 });
    const ban = canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = "#ff3b3b";
      g.fillRect(0, 0, w, h);
      const word = T("ZSTREET · START", "ZSTREET · 起点");
      let px = 86;
      g.font = `${px}px ${FONT_TITLE}`;
      while (px > 40 && g.measureText(word).width > w - 80) g.font = `${(px -= 4)}px ${FONT_TITLE}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ffffff";
      g.fillText(word, w / 2, h / 2 + 5);
    });
    const bm = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: ban, side: THREE.DoubleSide }));
    bm.scale.set(HALF * 1.4, HALF * 0.175, 1);
    bm.position.set(0, 2.85, 0.38);
    hut.add(bm);
    // start bars on the snow
    for (let k = 0; k < 4; k++) box(hut, "#c8d4e4", 0.12, 0.3, 0.12, { x: -4.5 + k * 3 - 1.5, y: 0.15 });
  }

  private buildFinish() {
    const s = this.scene;
    const f = this.wp(LEN, 0);
    const yaw = Math.atan2(cxd(LEN), -1);
    const arch = group(s, { x: f.x, y: f.y, z: f.z, ry: yaw + Math.PI });
    const chk = canvasTex(32, 128, (g, w, h) => {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 2; x++) {
          g.fillStyle = (x + y) % 2 ? "#111" : "#fff";
          g.fillRect((x * w) / 2, (y * h) / 8, w / 2, h / 8);
        }
    });
    const pm = new THREE.MeshToonMaterial({ map: chk });
    for (const sg of [-1, 1]) {
      const p = box(arch, pm, 0.6, 7.4, 0.6, { x: sg * (HALF + 1), y: 3.7 });
      p.castShadow = true;
    }
    box(arch, "#1d1630", HALF * 2 + 2.6, 1.3, 0.4, { y: 7.4 });
    const ban = canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = "#1d1630";
      g.fillRect(0, 0, w, h);
      g.font = `90px ${FONT_TITLE}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ffd23f";
      g.fillText(T("FINISH", "终点"), w / 2, h / 2 + 5);
    });
    const bm = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: ban, side: THREE.DoubleSide }));
    bm.scale.set(HALF * 2 + 2.4, (HALF * 2 + 2.4) / 8, 1);
    bm.position.set(0, 7.4, 0.22);
    arch.add(bm);
    // the line on the snow
    const ln = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: canvasTex(256, 32, (g, w, h) => {
      for (let x = 0; x < 16; x++)
        for (let y = 0; y < 2; y++) {
          g.fillStyle = (x + y) % 2 ? "#111" : "#fff";
          g.fillRect((x * w) / 16, (y * h) / 2, w / 16, h / 2);
        }
    }) }));
    ln.rotation.order = "YXZ";
    ln.rotation.set(-Math.PI / 2, yaw, 0);
    ln.scale.set(HALF * 2, 0.9, 1);
    ln.position.set(f.x, f.y + 0.04, f.z);
    s.add(ln);
    // crowd behind fences on both sides of the run-out
    const cols = ["#ff4b3e", "#2f8dff", "#ffd23f", "#3fcf5a", "#ff7ad9", "#9b5cff", "#ff9a2e", "#30c0c0"];
    const bodies: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    const heads: typeof bodies = [];
    const hats: typeof bodies = [];
    for (const sg of [-1, 1])
      for (let d = LEN - 10; d < LEN + 26; d += 1.0)
        for (let row = 0; row < 2; row++) {
          if (this.rnd() < 0.2) continue;
          const u = sg * (HALF + 3 + row * 1.1 + this.rnd() * 0.3);
          const p = this.wp(d, u);
          const c = cols[Math.floor(this.rnd() * cols.length)];
          bodies.push({ x: p.x, y: p.y + 0.5, z: p.z, sx: 0.48, sy: 0.45, sz: 0.48, c });
          heads.push({ x: p.x, y: p.y + 1.1, z: p.z, sx: 0.22, sy: 0.22, sz: 0.22, c: "#f1c9a0" });
          hats.push({ x: p.x, y: p.y + 1.3, z: p.z, sx: 0.2, sy: 0.25, sz: 0.2, c: cols[Math.floor(this.rnd() * cols.length)] });
        }
    this.inst(GEO.capsule, toon("#ffffff"), bodies);
    this.inst(GEO.sphereLo, toon("#ffffff"), heads, false);
    this.inst(GEO.coneLo, toon("#ffffff"), hats, false);
    // a chalet by the finish, with smoke
    const cp = this.wp(LEN + 18, -HALF - 12);
    const ch = group(s, { x: cp.x, y: cp.y, z: cp.z, ry: 0.5 });
    box(ch, "#9a5a32", 7, 4, 5.5, { y: 2 });
    const roofGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1);
    roofGeo.rotateZ(Math.PI / 2);
    roofGeo.rotateX(Math.PI / 6);
    const roof = new THREE.Mesh(roofGeo, toon("#ffffff"));
    roof.scale.set(7.6, 2.4, 3.6);
    roof.position.y = 5.1;
    roof.castShadow = true;
    ch.add(roof);
    box(ch, "#5a3a22", 0.8, 2, 0.8, { x: 2, y: 6.2 });
    for (const x of [-2, 0, 2]) box(ch, "#ffd27a", 1, 1, 0.1, { x, y: 2.4, z: 2.78, cast: false });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(GEO.sphereLo, flat("#ffffff", 0.7));
      m.position.set(2, 7.4 + i * 0.6, 0);
      m.scale.setScalar(0.4 + i * 0.1);
      ch.add(m);
      this.smoke.push(m);
    }
  }

  // ------------------------------------------------------------ sleds

  private buildSleds() {
    const n = this.players.length;
    this.players.forEach((p, i) => {
      const u = (i - (n - 1) / 2) * 3;
      const g = group(this.scene);
      const tilt = group(g);
      const col = p.char.color;
      const dark = lum(col) > 0.8 ? "#3a3a46" : p.char.dark;
      // runners
      for (const sg of [-1, 1]) {
        box(tilt, "#3a3a46", 0.08, 0.08, 1.7, { x: sg * 0.42, y: 0.05, z: 0 });
        box(tilt, "#3a3a46", 0.08, 0.08, 0.4, { x: sg * 0.42, y: 0.18, z: 0.92, rx: -0.9 });
        box(tilt, "#3a3a46", 0.06, 0.22, 0.06, { x: sg * 0.42, y: 0.18, z: -0.5 });
        box(tilt, "#3a3a46", 0.06, 0.22, 0.06, { x: sg * 0.42, y: 0.18, z: 0.45 });
      }
      // the seat (player colour) with a curled nose
      box(tilt, col, 1.0, 0.14, 1.6, { y: 0.32 });
      box(tilt, col, 1.0, 0.14, 0.5, { y: 0.46, z: 0.92, rx: -0.6 });
      box(tilt, dark, 1.04, 0.06, 1.62, { y: 0.25, cast: false });
      cyl(tilt, "#ffd23f", 0.035, 0.9, { y: 0.62, z: 1.06, rz: Math.PI / 2, seg: 6 });
      const a = this.spawn(i, 0, 0, 0, { blob: false, scale: 0.85 });
      tilt.add(a.root);
      a.pos.set(0, 0.36, -0.15);
      a.anim = "sit";
      const ring = new THREE.Mesh(GEO.ring, flat(col, 0.8));
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(1.15);
      ring.position.y = 0.04;
      ring.renderOrder = 2;
      g.add(ring);
      const bg = lum(col) > 0.8 ? p.char.dark : col;
      const label = this.hud.label(g, `${i + 1}`, { dy: 2.0, color: bg, cls: "big" });
      label.style.border = "calc(var(--u)*0.25) solid #fff";
      this.sleds.push({ g, tilt, label, d: 0, u, v: 0, vu: 0, stamina: 1, pushCd: 0, crashT: 0, safeT: 0, spin: 0, lean: 0, done: false, finishT: 0, place: i + 1, sprayT: 0, lane: u, planT: 0, airT: 0, airDur: 0, blind: new Map() });
    });
    for (const s of this.sleds) this.placeSled(s, 0);
  }

  private placeSled(s: Sled, dt: number) {
    const p = this.wp(s.d, s.u);
    if (s.airT > 0) {
      const k = 1 - s.airT / s.airDur;
      p.y += 4 * (0.6 + s.airDur * 1.2) * k * (1 - k);
    }
    s.g.position.copy(p);
    const yaw = Math.atan2(cxd(s.d) + s.vu / Math.max(4, s.v), -1);
    s.g.rotation.order = "YXZ";
    s.g.rotation.y = yaw + s.spin;
    const slope = s.d < LEN ? SLOPE : 0.06;
    s.g.rotation.x = Math.atan(slope) * Math.cos(s.spin) + (s.airT > 0 ? -0.25 * Math.sin((1 - s.airT / s.airDur) * Math.PI) : 0);
    s.lean = damp(s.lean, clamp(-s.vu * 0.06, -0.3, 0.3), 8, dt || 1);
    s.tilt.rotation.z = s.lean + (s.crashT > 0 ? Math.sin(this.t * 20) * 0.2 : 0);
  }

  private buildBar() {
    const dots = this.players
      .map(
        (p) =>
          `<div class="lg-dot" style="position:absolute;left:50%;top:0;width:calc(var(--u)*3.2);height:calc(var(--u)*3.2);margin-left:calc(var(--u)*-1.6);margin-top:calc(var(--u)*-1.6);border-radius:50%;border:calc(var(--u)*0.3) solid ${p.char.color};background:${p.char.color} url(${portrait(p.char.id)}) center/120% no-repeat;background-position:50% 30%;box-shadow:0 calc(var(--u)*0.2) 0 rgba(0,0,0,0.3)"></div>`,
      )
      .join("");
    this.barEl = this.hud.add(
      `<div style="position:absolute;right:calc(var(--u)*2.2);top:calc(var(--u)*10);bottom:calc(var(--u)*10);width:calc(var(--u)*1.2);border-radius:999px;background:linear-gradient(#ffffff,#bfe0ff);border:calc(var(--u)*0.3) solid #1d1630;box-shadow:0 calc(var(--u)*0.3) 0 rgba(0,0,0,0.25)">
        <div style="position:absolute;left:50%;bottom:calc(var(--u)*-1.4);transform:translateX(-50%);font-size:calc(var(--u)*2.2)">🏁</div>
        ${dots}
      </div>`,
    );
    this.dots = [...this.barEl.querySelectorAll<HTMLElement>(".lg-dot")];
  }

  private cardHtml(i: number) {
    const s = this.sleds[i];
    const place = s ? s.place : i + 1;
    const st = s ? s.stamina : 1;
    const left = s ? Math.max(0, Math.ceil(LEN - s.d)) : LEN;
    const w = Math.round(st * 100);
    const barCol = st >= PUSH_COST ? "#3fd2ff" : "#ff6a5a";
    const txt = s?.done ? T("Finished!", "完赛！") : `${left} m`;
    return `${placeTxt(place)} <span style="font-size:calc(var(--u)*1.4);opacity:0.9">${txt}</span><div style="margin-top:calc(var(--u)*0.3);width:calc(var(--u)*8);height:calc(var(--u)*0.8);border-radius:999px;background:rgba(255,255,255,0.2);overflow:hidden"><div style="width:${w}%;height:100%;background:${barCol}"></div></div>`;
  }

  // ------------------------------------------------------------ CPU

  protected cpu(i: number, dt: number): CpuPad {
    const s = this.sleds[i];
    const lv = this.players[i].level;
    s.planT -= dt;
    if (s.planT <= 0) {
      s.planT = 0.35 - 0.22 * lv + Math.random() * 0.1;
      const look = 12 + 16 * lv;
      let best = s.u,
        bestC = Infinity;
      for (let lane = -HALF + 0.8; lane <= HALF - 0.8; lane += 0.5) {
        let c = Math.abs(lane - s.u) * 0.25 + Math.random() * (1 - lv) * 3;
        for (const [n, o] of this.obst.entries()) {
          const dd = o.d - s.d;
          if (dd < -0.5 || dd > look) continue;
          // weaker sledders sometimes just don't see one coming
          if (!s.blind.has(n)) s.blind.set(n, Math.random() < (1 - lv) * 0.3);
          if (s.blind.get(n) && dd > 3 + 5 * lv) continue;
          // where I'd be when I reach it (I can only slide so fast)
          const tt = Math.max(0.05, dd / Math.max(6, s.v));
          const reach = s.u + clamp(lane - s.u, -6 * tt, 6 * tt);
          if (Math.abs(reach - o.u) < o.r + SR + 0.45) c += 30 * (1 - (dd / look) * 0.5);
        }
        for (const q of this.ramps) {
          const dd = q.d - s.d;
          if (dd < 1 || dd > look) continue;
          if (Math.abs(lane - q.u) < q.w / 2 - 0.5) c -= 1.5 * lv;
        }
        for (const g of this.gates) {
          const dd = g.d - s.d;
          if (dd < 1 || dd > look) continue;
          const tt = dd / Math.max(6, s.v);
          const reach = s.u + clamp(lane - s.u, -6 * tt, 6 * tt);
          if (Math.abs(reach - g.u) < g.w / 2 - 0.6) c -= 4 + 8 * lv;
        }
        if (c < bestC) {
          bestC = c;
          best = lane;
        }
      }
      s.lane = best;
    }
    const x = clamp((s.lane - s.u) * (0.6 + 0.6 * lv), -1, 1);
    // pushes: hold on to some stamina, more at the start
    let a = false;
    if (s.crashT <= 0 && s.stamina >= PUSH_COST && s.pushCd <= 0) {
      if (this.t < 2) a = this.mashing(i, 4);
      else if (s.stamina > 0.95 - 0.5 * lv && Math.random() < dt * (0.6 + 1.5 * lv)) a = true;
    }
    return { x, a };
  }

  // ------------------------------------------------------------ the race

  start() {
    this.sound("go");
    this.sound("wind");
    music.speed(1.05);
  }

  protected idle(dt: number) {
    this.animFlakes(dt);
    for (const s of this.sleds) this.placeSled(s, dt);
    this.frameCam(dt, 1.5);
  }

  private animFlakes(dt: number) {
    const c = this.camera.position;
    const P = this.flakePos;
    for (let i = 0; i < P.length; i += 3) {
      P[i + 1] -= dt * (1.2 + (i % 7) * 0.12);
      P[i] += Math.sin(this.t * 0.7 + i) * dt * 0.4;
      if (P[i + 1] < -12) P[i + 1] += 24;
    }
    this.flakes.position.set(c.x, c.y - 6, c.z - 14);
    (this.flakes.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private frameCam(dt: number, rate: number, snap = false) {
    // the leader, the pack around them, and every human player always in view
    let hi = -Infinity;
    for (const s of this.sleds) hi = Math.max(hi, s.d);
    let lo = hi,
      su = 0,
      n = 0;
    this.sleds.forEach((s, i) => {
      if (hi - s.d < 14 || (!this.players[i].cpu && !s.done)) {
        lo = Math.min(lo, s.d);
        su += s.u;
        n++;
      }
    });
    const spread = clamp(hi - lo, 0, 34);
    const f = lo + spread * 0.62;
    this.camF = snap ? f : damp(this.camF, f, 6, dt);
    const F = this.camF;
    const back = 8.4 + spread * 0.52;
    const up = 6.2 + spread * 0.38;
    const cd = F - back;
    const uAvg = (su / Math.max(1, n)) * 0.5;
    const pos: [number, number, number] = [cx(cd) + uAvg, baseY(cd) + up, -cd];
    const ld = F + 6 + spread * 0.25;
    const look: [number, number, number] = [cx(ld) + uAvg, baseY(ld) + 0.5, -ld];
    if (snap) this.setCam(pos, look, 50);
    else this.moveCam(pos, look, dt, rate);
  }


  protected step(dt: number) {
    const tt = this.t;
    this.animFlakes(dt);
    for (const [n, m] of this.smoke.entries()) {
      m.position.y = 7.4 + ((tt * 0.8 + n * 0.6) % 3.6);
      m.scale.setScalar(0.4 + ((tt * 0.8 + n * 0.6) % 3.6) * 0.25);
    }
    for (let i = 0; i < this.sleds.length; i++) this.moveSled(i, dt);
    this.bumps();
    this.rank();
    this.players.forEach((p, i) => {
      const h = this.cardHtml(i);
      if (h !== this.cards[i]) {
        this.cards[i] = h;
        this.hud.setScore(p.seat, h);
      }
      this.dots[i].style.top = `${clamp(this.sleds[i].d / LEN, 0, 1) * 100}%`;
      this.dots[i].style.zIndex = `${10 - this.sleds[i].place}`;
    });
    // gates wobble back
    for (const g of this.gates) for (const f of g.flags) f.rotation.z = damp(f.rotation.z, 0, 4, dt);

    let left = CAP - tt;
    if (this.firstDoneT >= 0) left = Math.min(left, this.firstDoneT + GRACE - tt);
    if (left <= 8 && this.doneCount < this.sleds.length) {
      this.hud.timer(left);
      if (!this.warned) {
        this.warned = true;
        if (this.firstDoneT < 0) this.hud.banner(T("Hurry, hurry!", "快快快！"), { color: "#ffd23f", size: 6, sub: T("Only seconds left", "只剩几秒了") });
      }
    }
    this.frameCam(dt, 3);
    if (this.doneCount >= this.sleds.length || left <= 0) {
      const order = this.rank();
      const place = this.sleds.map(() => 0);
      order.forEach((i, n) => (place[i] = n + 1));
      this.hud.timer(null);
      this.finish(place);
    }
  }

  private rank() {
    const idx = this.sleds.map((_, i) => i);
    idx.sort((a, b) => {
      const A = this.sleds[a],
        B = this.sleds[b];
      if (A.done && B.done) return A.finishT - B.finishT;
      if (A.done) return -1;
      if (B.done) return 1;
      return B.d - A.d;
    });
    idx.forEach((i, n) => {
      const s = this.sleds[i];
      if (s.place !== n + 1) {
        s.place = n + 1;
        s.label.textContent = `${n + 1}`;
      }
    });
    return idx;
  }

  private moveSled(i: number, dt: number) {
    const s = this.sleds[i];
    const a = this.avatars[i];
    const pad = this.pad(i);
    s.pushCd -= dt;
    s.safeT -= dt;
    s.sprayT -= dt;
    s.stamina = Math.min(1, s.stamina + dt * 0.1);

    if (s.done) {
      // run-out after the line
      s.v = damp(s.v, 0, 1.6, dt);
      s.vu = damp(s.vu, 0, 3, dt);
      s.d += s.v * dt;
      s.u += s.vu * dt;
      this.placeSled(s, dt);
      return;
    }

    if (s.crashT > 0) {
      s.crashT -= dt;
      s.spin += dt * 9 * Math.max(0.2, s.crashT);
      s.v = damp(s.v, 1.5, 4, dt);
      s.vu = damp(s.vu, 0, 4, dt);
      if (s.crashT <= 0) {
        s.spin = 0;
        a.anim = "sit";
      }
    } else {
      // gravity toward terminal speed; above it (pushes, gates) bleeds off slowly
      if (s.v < VTERM) s.v = Math.min(VTERM, s.v + dt * (s.v < 6 ? 7 : 4.5));
      else s.v = damp(s.v, VTERM, 0.55, dt);
      // steering
      const want = (pad.x ?? 0) * 7.5;
      s.vu = damp(s.vu, want, 6, dt);
      // a push
      if (pad.aDown && s.pushCd <= 0) {
        if (s.stamina >= PUSH_COST) {
          s.stamina -= PUSH_COST;
          s.pushCd = 0.22;
          s.v = Math.min(VMAXX, s.v + PUSH_V * (s.v < 8 ? 1.4 : 1));
          this.sound("whoosh");
          const p = this.wp(s.d, s.u);
          for (const sg of [-1, 1]) this.fx.dust({ x: p.x + sg * 0.6, y: p.y + 0.1, z: p.z }, 4, "#ffffff");
          s.tilt.rotation.x = 0.25;
          this.buzz(i, 20);
        } else {
          s.pushCd = 0.3;
          if (!this.players[i].cpu) this.sound("wrong");
        }
      }
    }
    s.tilt.rotation.x = damp(s.tilt.rotation.x, 0, 6, dt);
    const d0 = s.d;
    s.d += s.v * dt;
    s.u += s.vu * dt;
    // the banks
    const lim = HALF - SR;
    if (Math.abs(s.u) > lim) {
      const sg = Math.sign(s.u);
      s.u = sg * lim;
      if (s.vu * sg > 0) s.vu = -s.vu * 0.3;
      s.v *= 1 - dt * 0.8;
      if (s.sprayT <= 0) {
        s.sprayT = 0.12;
        const p = this.wp(s.d, s.u + sg * 0.5);
        this.fx.burst({ x: p.x, y: p.y + 0.3, z: p.z }, { count: 5, colors: ["#ffffff", "#e0f0ff"], speed: 2.5, up: 2.5, size: 0.16, life: 0.5, shape: "ball", gravity: 8 });
      }
    }
    // trees & rocks
    // kickers send you flying (over anything in the way)
    for (const q of this.ramps)
      if (s.airT <= 0 && d0 < q.d && s.d >= q.d && Math.abs(s.u - q.u) < q.w / 2 && s.crashT <= 0) {
        s.airDur = clamp(0.35 + s.v * 0.035, 0.5, 1.05);
        s.airT = s.airDur;
        this.sound("boing");
        this.hud.pop(this.wp(s.d, s.u).add(new THREE.Vector3(0, 2.6, 0)), T("Jump!", "飞跃！"), "#7fd8ff", this.camera);
      }
    if (s.airT > 0) {
      s.airT -= dt;
      if (s.airT <= 0) {
        s.v = Math.min(VMAXX, s.v + 1.5);
        const p = this.wp(s.d, s.u);
        this.fx.burst({ x: p.x, y: p.y + 0.2, z: p.z }, { count: 12, colors: ["#ffffff", "#dceeff"], speed: 3, up: 2, size: 0.18, life: 0.5, shape: "ball", gravity: 8, flat: true });
        this.sound("land");
        this.buzz(i, 30);
      }
    }
    if (s.crashT <= 0 && s.safeT <= 0 && s.airT <= 0)
      for (const o of this.obst) {
        if (Math.abs(o.d - s.d) > 1.6) continue;
        const du = s.u - o.u,
          dd = s.d - o.d;
        const dist = Math.hypot(du, dd);
        if (dist < o.r + SR) {
          s.crashT = CRASH_T;
          s.safeT = CRASH_T + 0.7;
          s.v = Math.min(s.v, 3);
          s.u = o.u + (du >= 0 ? 1 : -1) * (o.r + SR + 0.15);
          s.vu = (du >= 0 ? 1 : -1) * 2;
          a.anim = "stun";
          a.flash();
          const p = this.wp(o.d, o.u);
          this.fx.burst({ x: p.x, y: p.y + 1.2, z: p.z }, { count: 22, colors: ["#ffffff", "#e8f4ff", o.kind === "pine" ? "#2f8f5b" : "#8a8f9e"], speed: 5, up: 3, size: 0.2, life: 0.8, shape: "ball", gravity: 9 });
          this.sound("crash");
          this.buzz(i, [90, 40, 90]);
          if (!this.players[i].cpu) this.shake = 0.35;
          this.hud.pop(new THREE.Vector3(p.x, p.y + 2.4, p.z), T("Bam!", "砰！"), "#ff6a5a", this.camera);
          break;
        }
      }
    // gates
    for (const g of this.gates) {
      if (g.passed[i]) continue;
      if (d0 < g.d && s.d >= g.d) {
        g.passed[i] = true;
        if (Math.abs(s.u - g.u) < g.w / 2 && s.crashT <= 0) {
          s.v = Math.min(VMAXX, s.v + GATE_V);
          const p = this.wp(g.d, s.u);
          this.fx.sparkle({ x: p.x, y: p.y + 1, z: p.z }, "#ffe14a", 16);
          this.fx.ring({ x: p.x, y: p.y + 0.1, z: p.z }, "#ffe14a", 2.2);
          this.hud.pop(new THREE.Vector3(p.x, p.y + 2.4, p.z), T("Turbo!", "加速！"), "#ffe14a", this.camera);
          this.sound("ding");
          this.buzz(i, 30);
          for (const f of g.flags) f.rotation.z = (f.position.x > p.x ? -1 : 1) * 0.5;
        }
      }
    }
    // the line
    if (s.d >= LEN) {
      s.done = true;
      s.finishT = this.t - (s.d - LEN) / Math.max(1, s.v);
      this.doneCount++;
      a.anim = "win";
      const p = this.wp(s.d, s.u);
      this.fx.confetti({ x: p.x, y: p.y + 2, z: p.z }, 50);
      if (this.firstDoneT < 0) {
        this.firstDoneT = this.t;
        this.hud.banner(T(`${this.players[i].name} wins!`, `${this.players[i].name} 获胜！`), { color: "#ffd23f" });
        this.sound("fanfare");
        this.hud.mark(this.players[i].seat, "win");
      } else this.sound("cheer");
      this.buzz(i, [60, 40, 120]);
    }
    // a snow trail
    if (s.v > 6 && Math.random() < 0.5) {
      const p = this.wp(s.d - 0.8, s.u);
      this.fx.burst({ x: p.x, y: p.y + 0.08, z: p.z }, { count: 1, colors: ["#ffffff"], speed: 0.8, up: 1.2, size: 0.14, life: 0.45, shape: "ball", gravity: 3 });
    }
    if (Math.abs(s.vu) > 5 && s.sprayT <= 0) {
      s.sprayT = 0.08;
      const p = this.wp(s.d - 0.3, s.u - Math.sign(s.vu) * 0.5);
      this.fx.burst({ x: p.x, y: p.y + 0.15, z: p.z }, { count: 3, colors: ["#ffffff", "#dceeff"], speed: 2.2, up: 2, size: 0.15, life: 0.45, shape: "ball", gravity: 8 });
    }
    this.placeSled(s, dt);
  }

  private bumps() {
    const S = this.sleds;
    for (let a = 0; a < S.length; a++)
      for (let b = a + 1; b < S.length; b++) {
        const A = S[a],
          B = S[b];
        const du = B.u - A.u,
          dd = B.d - A.d;
        const dist = Math.hypot(du, dd);
        if (dist >= SR * 2 + 0.2 || dist < 1e-4) continue;
        const push = (SR * 2 + 0.2 - dist) / 2;
        const nu = du / dist,
          nd = dd / dist;
        A.u -= nu * push;
        B.u += nu * push;
        A.d -= nd * push * 0.5;
        B.d += nd * push * 0.5;
        const rel = A.vu - B.vu;
        if (rel * nu > 0) {
          A.vu -= rel * 0.6;
          B.vu += rel * 0.6;
          this.sound("bonk");
        }
      }
  }

  protected outroStep(dt: number) {
    this.animFlakes(dt);
    for (const s of this.sleds) {
      s.v = damp(s.v, 0, 1.5, dt);
      s.d += s.v * dt;
      s.crashT = 0;
      s.spin = 0;
      this.placeSled(s, dt);
    }
    // from the front: the riders' faces
    const c = this.sleds.reduce((a, s) => a + s.d, 0) / this.sleds.length;
    const u = this.sleds.reduce((a, s) => a + s.u, 0) / this.sleds.length;
    this.moveCam([cx(c + 10) + u, baseY(c + 10) + 4.2, -(c + 10)], [cx(c) + u, baseY(c) + 0.6, -c], dt, 1.5);
  }

  /** Winners cheer in their seat, the others stay seated. */
  protected celebrate(res: MiniResult) {
    this.avatars.forEach((a, i) => {
      if (a) a.anim = res.place[i] === 1 ? "win" : "sit";
    });
  }

  dispose() {
    for (const m of this.instanced) m.dispose();
    super.dispose();
  }
}

const def: MiniDef = {
  id: "luge",
  name: "Sled Run",
  icon: "🛷",
  color: "#9fd8ff",
  tagline: "Race down the snow, dodge the pines.",
  rules: "Steer with the stick, dodge pines and rocks (you crash!). Pass between two flags for a boost. A: a push, but it tires you.",
  controls: { stick: "Steer the sled", a: "Push (stamina)" },
  modes: ["ffa"],
  length: 35,
  music: "mini3",
  create: (ctx) => new Luge(ctx),
};
export default def;
