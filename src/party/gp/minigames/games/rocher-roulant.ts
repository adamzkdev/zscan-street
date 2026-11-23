/**
 * ROCHER ROULANT (chacun pour soi, 30 s): a huge boulder rolls down a desert canyon and everyone
 * runs for their life, toward the camera. Running is automatic: the stick dodges left/right, A jumps
 * over logs and chasms (or take the narrow plank). Rocks and narrow passes block the way; tripping
 * costs precious metres. Caught by the boulder = flattened, out. It speeds up as time goes by;
 * whoever is still running after 30 s shares the win, the others rank by how long they lasted.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { FONT_TITLE, GEO, box, canvasTex, cyl, group, toon } from "../../engine/gfx";
import { clamp, damp, lerp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 30;
const W = 5.4; // half width of the path
const RUN = 7.6;
const LAT = 6.5;
const JUMP_V = 7.8;
const GRAV = 24;
const R = 3.3; // boulder radius
const PR = 0.38;
const GAP0 = 7.5; // start distance boulder front → players
const BAND = 12.5; // the boulder never lags further than this behind the last runner

type Kind = "log" | "gap" | "rock";
interface Obst {
  kind: Kind;
  z: number;
  /** Length along z. */
  len: number;
  /** Lateral extent [x0, x1] (rocks), or the plank's x for a gap with a plank. */
  x0: number;
  x1: number;
  plank?: number;
  h: number;
}
interface Runner {
  x: number;
  z: number;
  y: number;
  vy: number;
  vx: number;
  stunT: number;
  fallT: number;
  out: boolean;
  outT: number;
  flatT: number;
  // CPU
  jumpAt: Map<number, number>;
  target: number;
  home: number;
  trips: number;
  falls: number;
  aHeld: boolean;
}

class RocherRoulant extends BaseMini {
  private obst: Obst[] = [];
  private run: Runner[] = [];
  private outOrder: number[] = [];
  private bz = -GAP0 - R; // boulder centre z
  private bv = 0;
  private boulder!: THREE.Group;
  private ballMesh!: THREE.Mesh;
  private instanced: THREE.InstancedMesh[] = [];
  private hurried = false;
  private rumbleT = 0;
  private cards: string[] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v3 = new THREE.Vector3();
  private s3 = new THREE.Vector3();
  private endZ = 0;
  private dustT = 0;
  private beatT = 0;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#3f9be8", "#ffe2b0"], size: 22, sun: [-0.5, 1, 0.35], sunColor: "#fff0d0", fog: { color: "#f6d7a8", near: 45, far: 120 }, hemi: ["#fff4e0", "#a0603a", 1.5] });
    this.endZ = RUN * TIME + 40;
    this.layCourse();
    this.buildCanyon();
    this.buildObstacles();
    this.buildBoulder();
    const n = this.players.length;
    this.players.forEach((p, i) => {
      const x = (i - (n - 1) / 2) * 2.2;
      const a = this.spawn(i, x, 0, Math.PI);
      a.setRing(p.char.color);
      this.run.push({ x, z: 0, y: 0, vy: 0, vx: 0, stunT: 0, fallT: 0, out: false, outT: 0, flatT: 0, jumpAt: new Map(), target: x, home: x, trips: 0, falls: 0, aHeld: false });
    });
    this.hud.players(this.players, (p) => this.cardHtml(p.i));
    this.hud.timer(TIME);
    this.camAt(0, true);
  }

  private inst(geo: THREE.BufferGeometry, mat: THREE.Material, list: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; rx?: number; rz?: number; c?: string }[], cast = true) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    const col = new THREE.Color();
    list.forEach((o, i) => {
      this.q.setFromEuler(this.e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0));
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

  // ------------------------------------------------------------ the course

  private layCourse() {
    const r = this.rnd;
    let z = 13;
    let last: Kind | "narrow" = "rock";
    while (z < this.endZ - 20) {
      // obstacles get a little denser over time
      const roll = r();
      let kind: Kind | "narrow" = roll < 0.3 ? "log" : roll < 0.55 ? "gap" : roll < 0.8 ? "rock" : "narrow";
      if (kind === last && r() < 0.6) kind = kind === "log" ? "rock" : "log";
      last = kind;
      if (kind === "log") {
        this.obst.push({ kind: "log", z, len: 0.8, x0: -W, x1: W, h: 0.75 });
      } else if (kind === "gap") {
        const len = 2.2 + r() * 0.5;
        const plank = r() < 0.5 ? (r() - 0.5) * 2 * (W - 1.2) : undefined;
        this.obst.push({ kind: "gap", z, len, x0: -W, x1: W, plank, h: 0 });
      } else if (kind === "rock") {
        // one or two big rocks, leaving room to pass
        const side = r() < 0.5 ? -1 : 1;
        const w1 = 2.4 + r() * 1.6;
        if (r() < 0.5) {
          const c = (r() - 0.5) * 3;
          this.obst.push({ kind: "rock", z, len: 1.8, x0: c - w1 / 2, x1: c + w1 / 2, h: 1.7 });
        } else {
          this.obst.push({ kind: "rock", z, len: 1.8, x0: side < 0 ? -W - 0.5 : W - w1, x1: side < 0 ? -W + w1 : W + 0.5, h: 1.7 });
          const w2 = 1.8 + r() * 1.2;
          this.obst.push({ kind: "rock", z: z + 5, len: 1.8, x0: side < 0 ? W - w2 : -W - 0.5, x1: side < 0 ? W + 0.5 : -W + w2, h: 1.7 });
          z += 4;
        }
      } else {
        // a narrow pass: walls on both sides, a 2.4 m opening
        const c = (r() - 0.5) * 2 * (W - 2);
        this.obst.push({ kind: "rock", z, len: 2.6, x0: -W - 0.5, x1: c - 1.25, h: 2.6 });
        this.obst.push({ kind: "rock", z, len: 2.6, x0: c + 1.25, x1: W + 0.5, h: 2.6 });
      }
      z += 9 + r() * 4 - Math.min(2.5, z / 100);
    }
    this.obst.sort((a, b) => a.z - b.z);
  }

  private buildCanyon() {
    const s = this.scene;
    const r = this.rnd;
    // sand floor slabs between the chasms
    const sand = canvasTex(
      128,
      128,
      (g, w, h) => {
        g.fillStyle = "#e8b77a";
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 500; i++) {
          g.fillStyle = Math.random() < 0.5 ? "rgba(255,240,200,0.35)" : "rgba(150,90,40,0.18)";
          g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2);
        }
        g.strokeStyle = "rgba(170,110,60,0.25)";
        g.lineWidth = 2;
        for (let y = 10; y < h; y += 26) {
          g.beginPath();
          for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 14 + y) * 4);
          g.stroke();
        }
      },
      true,
    );
    const sandMat = new THREE.MeshToonMaterial({ map: sand });
    const gaps = this.obst.filter((o) => o.kind === "gap");
    let z0 = -80;
    const slab = (a: number, b: number) => {
      const len = b - a;
      if (len <= 0.01) return;
      const geo = new THREE.BoxGeometry(W * 2 + 3, 3, len);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ((W * 2 + 3) / 4), uv.getY(i) * (len / 4));
      const m = new THREE.Mesh(geo, sandMat);
      m.position.set(0, -1.5, (a + b) / 2);
      m.receiveShadow = true;
      s.add(m);
    };
    for (const g of gaps) {
      slab(z0, g.z);
      z0 = g.z + g.len;
    }
    slab(z0, this.endZ + 60);
    // the chasm's dark bottom
    const pit = new THREE.Mesh(GEO.plane, toon("#3a1e14"));
    pit.rotation.x = -Math.PI / 2;
    pit.scale.set(W * 2 + 3, this.endZ + 160, 1);
    pit.position.set(0, -4.5, this.endZ / 2);
    s.add(pit);
    // planks over some chasms
    for (const g of gaps)
      if (g.plank !== undefined) {
        const pg = group(s, { x: g.plank, z: g.z + g.len / 2 });
        box(pg, "#9a6a3a", 1.1, 0.16, g.len + 0.8, { y: -0.05 });
        for (let k = 0; k < 4; k++) box(pg, "#7a4a24", 1.15, 0.05, 0.12, { y: 0.04, z: -g.len / 2 + (k + 0.5) * (g.len / 4) });
      }
    // canyon walls: stacked strata blocks
    const strata = canvasTex(64, 256, (g, w, h) => {
      const cols = ["#c9643a", "#d9804a", "#b8532e", "#e0975c", "#c46a40", "#a8482a"];
      let y = 0;
      let i = 0;
      while (y < h) {
        const hh = 14 + ((i * 37) % 26);
        g.fillStyle = cols[i % cols.length];
        g.fillRect(0, y, w, hh);
        g.fillStyle = "rgba(0,0,0,0.08)";
        g.fillRect(0, y + hh - 3, w, 3);
        y += hh;
        i++;
      }
    });
    const wallMat = new THREE.MeshToonMaterial({ map: strata });
    const walls: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number }[] = [];
    const tops: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; rx: number; c: string }[] = [];
    for (const sg of [-1, 1])
      for (let z = -90; z < this.endZ + 60; z += 6) {
        const h = 7 + r() * 6 + (Math.sin(z / 23) + 1) * 2;
        const off = W + 2.6 + r() * 1.2;
        const wdt = 3 + r() * 2;
        walls.push({ x: sg * (off + wdt / 2), y: h / 2 - 0.2, z: z + r() * 2, sx: wdt, sy: h, sz: 6.8, ry: (r() - 0.5) * 0.2 });
        // a second, taller layer further out
        const h2 = h + 4 + r() * 6;
        walls.push({ x: sg * (off + wdt + 2.5), y: h2 / 2 - 0.2, z: z + 2 + r() * 2, sx: 4, sy: h2, sz: 7, ry: (r() - 0.5) * 0.3 });
        if (r() < 0.6) tops.push({ x: sg * (off + wdt / 2), y: h + 0.2, z: z + r() * 3, sx: 1.4 + r(), sy: 1 + r() * 0.6, sz: 1.4 + r(), ry: r() * 6, rx: r(), c: r() < 0.5 ? "#b8532e" : "#d9804a" });
      }
    this.inst(GEO.box, wallMat, walls);
    this.inst(GEO.dodeca, toon("#ffffff"), tops);
    // foot of the walls: scattered boulders, cacti, dry bushes
    const pebbles: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; c: string }[] = [];
    const cactus: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; rz?: number }[] = [];
    const bush: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    for (let z = -80; z < this.endZ + 40; z += 2.5) {
      for (const sg of [-1, 1]) {
        if (r() < 0.55) {
          const sc = 0.4 + r() * 0.9;
          pebbles.push({ x: sg * (W + 1.0 + r() * 1.4), y: sc * 0.4, z: z + r() * 2, sx: sc, sy: sc * 0.75, sz: sc, ry: r() * 6, c: r() < 0.5 ? "#a8583a" : "#c27a4a" });
        }
        if (r() < 0.12) {
          const x = sg * (W + 1.4 + r() * 0.8),
            zz = z + r() * 2,
            h = 1.4 + r() * 1.2;
          cactus.push({ x, y: h / 2, z: zz, sx: 0.28, sy: h, sz: 0.28 });
          cactus.push({ x: x + 0.38, y: h * 0.55, z: zz, sx: 0.18, sy: 0.7, sz: 0.18 });
          cactus.push({ x: x + 0.22, y: h * 0.35, z: zz, sx: 0.15, sy: 0.45, sz: 0.15, rz: Math.PI / 2 });
        }
        if (r() < 0.2) bush.push({ x: sg * (W + 0.8 + r() * 1.5), y: 0.25, z: z + r() * 2, sx: 0.5, sy: 0.35, sz: 0.5, c: r() < 0.5 ? "#9aa34a" : "#b8a05a" });
      }
    }
    this.inst(GEO.dodeca, toon("#ffffff"), pebbles);
    this.inst(GEO.capsule, toon("#4f9a4a"), cactus);
    this.inst(GEO.sphereLo, toon("#ffffff"), bush, false);
    // a warning sign at the start
    const sign = group(s, { x: -W + 0.2, z: 3, ry: 0.35 });
    cyl(sign, "#7a4a24", 0.08, 2.2, { y: 1.1, seg: 6 });
    const tex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = "#ffd23f";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#1d1630";
      g.lineWidth = 10;
      g.strokeRect(5, 5, w - 10, h - 10);
      g.font = `62px ${FONT_TITLE}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#1d1630";
      g.fillText(T("DANGER!", "危险！"), w / 2, h / 2 + 4);
    });
    const sm = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    sm.scale.set(1.6, 0.8, 1);
    sm.position.y = 2.1;
    sign.add(sm);
  }

  private buildObstacles() {
    const s = this.scene;
    const logs = this.obst.filter((o) => o.kind === "log");
    const rocks = this.obst.filter((o) => o.kind === "rock");
    // logs lying across the path
    const bark = canvasTex(
      128,
      32,
      (g, w, h) => {
        g.fillStyle = "#8a5a30";
        g.fillRect(0, 0, w, h);
        g.strokeStyle = "rgba(60,30,10,0.5)";
        g.lineWidth = 2;
        for (let x = 4; x < w; x += 9) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x + 3, h);
          g.stroke();
        }
      },
      true,
    );
    bark.repeat.set(1, 4);
    const logMat = new THREE.MeshToonMaterial({ map: bark });
    const logGeo = new THREE.CylinderGeometry(0.38, 0.38, W * 2 + 1.2, 12);
    logGeo.rotateZ(Math.PI / 2);
    for (const o of logs) {
      const m = new THREE.Mesh(logGeo, logMat);
      m.position.set(0, 0.36, o.z + o.len / 2);
      m.rotation.x = o.z;
      m.castShadow = m.receiveShadow = true;
      s.add(m);
      for (const sg of [-1, 1]) {
        const end = new THREE.Mesh(GEO.circle, toon("#e8c48a"));
        end.scale.setScalar(0.34);
        end.rotation.y = (sg * Math.PI) / 2;
        end.position.set(sg * (W + 0.61), 0.36, o.z + o.len / 2);
        s.add(end);
      }
    }
    // rocks (instanced big lumps)
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const lumps: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; c: string }[] = [];
    for (const o of rocks) {
      const w = o.x1 - o.x0;
      const n = Math.max(1, Math.round(w / 1.6));
      for (let k = 0; k < n; k++) {
        const x = o.x0 + (k + 0.5) * (w / n);
        const sc = Math.max(0.95, (w / n) * 0.72);
        lumps.push({ x, y: o.h * 0.42, z: o.z + o.len / 2, sx: sc, sy: o.h * 0.6, sz: o.len * 0.62, ry: this.rnd() * 6, c: this.rnd() < 0.5 ? "#a8583a" : "#94482e" });
      }
    }
    this.inst(rockGeo, toon("#ffffff"), lumps);
    // red-white chevron marker before every chasm
    for (const g of this.obst)
      if (g.kind === "gap") {
        for (const sg of [-1, 1]) {
          const p = group(s, { x: sg * (W + 0.5), z: g.z - 0.4 });
          cyl(p, "#ffffff", 0.07, 1.2, { y: 0.6, seg: 6 });
          box(p, "#ff3b3b", 0.12, 0.25, 0.12, { y: 1.05 });
        }
      }
  }

  private buildBoulder() {
    const geo = new THREE.IcosahedronGeometry(R, 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    // a lumpy rock (same noise for shared vertices)
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 1.7) * Math.cos(v.y * 1.3) * Math.sin(v.z * 1.9 + 1) * 0.22 + Math.sin(v.x * 3.1 + v.z * 2.3) * 0.08;
      v.multiplyScalar(1 + n);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    this.boulder = group(this.scene, { y: R, z: this.bz });
    this.ballMesh = new THREE.Mesh(geo, toon("#8d7a68"));
    this.ballMesh.castShadow = true;
    this.boulder.add(this.ballMesh);
    // darker patches and a moss spot spin with it
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2,
        b = (i % 3) - 1;
      const m = new THREE.Mesh(GEO.dodeca, toon(i % 4 === 0 ? "#6a8a4a" : "#6f5e50"));
      m.scale.set(0.9, 0.5, 0.9);
      m.position.set(Math.cos(a) * R * 0.86 * Math.cos(b * 0.6), Math.sin(b * 0.6) * R * 0.86, Math.sin(a) * R * 0.86 * Math.cos(b * 0.6));
      m.lookAt(0, 0, 0);
      this.ballMesh.add(m);
    }
  }

  // ------------------------------------------------------------ helpers

  private cardHtml(i: number) {
    const r = this.run[i];
    if (!r) return T("Running", "奔跑中");
    if (r.out) return `<span style="color:#ff8a7a">${T("Flattened!", "压扁了！")}</span>`;
    const gap = Math.max(0, r.z - (this.bz + R));
    const col = gap < 4 ? "#ff6a5a" : gap < 8 ? "#ffd23f" : "#7dff9a";
    return `<span style="color:${col}">${Math.floor(gap)} m</span> <span style="font-size:calc(var(--u)*1.4);opacity:0.9">${T("ahead", "领先")}</span>`;
  }

  private camAt(dt: number, snap = false) {
    let lead = -Infinity;
    for (const r of this.run) if (!r.out) lead = Math.max(lead, r.z);
    if (lead === -Infinity) lead = Math.max(...this.run.map((r) => r.z));
    const back = this.bz - R;
    const span = clamp(lead - back, 8, 30);
    const cz = lead + 6.4 + span * 0.26;
    const cy = 4.8 + span * 0.3;
    const pos: [number, number, number] = [0, cy, cz];
    const look: [number, number, number] = [0, 1.3, lead - span * 0.55];
    if (snap) this.setCam(pos, look, 52);
    else this.moveCam(pos, look, dt, 4);
  }

  /** The ground under a point: is it a chasm (and not the plank)? */
  private overGap(x: number, z: number) {
    for (const o of this.obst) {
      if (o.kind !== "gap") continue;
      if (z > o.z + 0.15 && z < o.z + o.len - 0.15) {
        if (o.plank !== undefined && Math.abs(x - o.plank) < 0.55 + 0.15) return null;
        return o;
      }
    }
    return null;
  }

  // ------------------------------------------------------------ CPU

  protected cpu(i: number): CpuPad {
    const r = this.run[i];
    const lv = this.players[i].level;
    if (r.out || r.fallT > 0) return {};
    const look = 7 + 7 * lv;
    let tx = r.target;
    // drift back toward my own lane when the way is clear
    tx += (r.home - tx) * 0.06;
    let jump = false;
    let lateralSet = false;
    for (let n = 0; n < this.obst.length; n++) {
      const o = this.obst[n];
      const d = o.z - r.z;
      if (d + o.len < -0.3 || d > look) continue;
      if (o.kind === "rock") {
        if (lateralSet) continue;
        // is my line blocked? pick the free spot closest to me
        const blocked = (x: number) => this.obst.some((q) => q.kind === "rock" && Math.abs(q.z - o.z) < 0.1 && x > q.x0 - PR - 0.35 && x < q.x1 + PR + 0.35);
        if (blocked(tx)) {
          let best = tx,
            bd = Infinity;
          for (let x = -W + 0.6; x <= W - 0.6; x += 0.3) {
            if (blocked(x)) continue;
            let c = Math.abs(x - r.x) + (Math.random() - 0.5) * (1 - lv) * 2;
            // don't all squeeze into the same spot
            for (let j = 0; j < this.run.length; j++) if (j !== i && !this.run[j].out && Math.abs(this.run[j].z - r.z) < 3 && Math.abs(this.run[j].target - x) < 0.9) c += 1.2;
            if (c < bd) {
              bd = c;
              best = x;
            }
          }
          tx = best;
        }
        lateralSet = true;
      } else {
        // logs and chasms: a jump at the right moment (or the plank)
        if (o.kind === "gap" && o.plank !== undefined && Math.abs(r.x - o.plank) < 2.2 && lv > 0.5 && d > 1.5 && !lateralSet) {
          tx = o.plank;
          lateralSet = true;
          continue;
        }
        if (o.kind === "gap" && o.plank !== undefined && Math.abs(r.x - o.plank) < 0.3) continue;
        if (!r.jumpAt.has(n)) {
          const ideal = o.kind === "log" ? 2.45 : 1.15;
          const miss = Math.random() < (1 - lv) * 0.22;
          r.jumpAt.set(n, miss ? -99 : ideal + (Math.random() - 0.5) * (0.4 + (1 - lv) * 2.2));
        }
        const at = r.jumpAt.get(n)!;
        if (d > 0 && d <= at && r.y <= 0.01) jump = true;
      }
    }
    r.target = tx;
    const x = clamp((tx - r.x) * (1.2 + lv), -1, 1);
    // a press is one frame long (so the next one is a new press)
    const a = jump && !r.aHeld && r.stunT <= 0;
    r.aHeld = a;
    return { x, a };
  }

  // ------------------------------------------------------------ the game

  start() {
    this.sound("rumble");
    this.sound("go");
    music.speed(1.1);
  }

  protected idle(dt: number) {
    this.avatars.forEach((a, i) => {
      if (!a) return;
      a.anim = "idle";
      a.yaw = Math.PI; // look back at the boulder
      a.pos.set(this.run[i].x, 0, this.run[i].z);
    });
    this.ballMesh.rotation.x += dt * 0.3;
    this.boulder.position.y = R + Math.abs(Math.sin(performance.now() / 300)) * 0.05;
    this.camAt(dt);
  }

  protected step(dt: number) {
    const now = this.t;
    const left = TIME - now;
    this.hud.timer(left);
    if (!this.hurried && now >= 15) {
      this.hurried = true;
      this.hud.banner(T("IT'S SPEEDING UP!", "巨石加速了！"), { color: "#ffd23f", sub: T("15 seconds left", "还剩 15 秒") });
      this.sound("bell");
      music.speed(1.25);
    }

    // the boulder
    this.bv = 6.4 + 2.3 * clamp(now / TIME, 0, 1) + (now > 24 ? (now - 24) * 0.1 : 0);
    this.bz += this.bv * dt;
    let lastAlive = Infinity;
    for (const r of this.run) if (!r.out) lastAlive = Math.min(lastAlive, r.z);
    if (lastAlive < Infinity && lastAlive - (this.bz + R) > BAND) this.bz = lastAlive - BAND - R;
    this.boulder.position.set(0, R + Math.abs(Math.sin(now * 9)) * 0.06, this.bz);
    this.ballMesh.rotation.x += (this.bv / R) * dt;
    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = 0.06;
      this.fx.burst({ x: (Math.random() - 0.5) * R * 1.6, y: 0.3, z: this.bz - R * 0.3 }, { count: 2, colors: ["#e8c08a", "#d9a870"], speed: 2, up: 2, size: 0.5, sizeEnd: 0.1, life: 0.9, shape: "ball", gravity: -0.5, drag: 2 });
    }
    this.rumbleT -= dt;
    if (this.rumbleT <= 0) {
      this.rumbleT = 1.1;
      this.sound("rumble");
    }
    this.shake = Math.max(this.shake, 0.06);

    // the runners
    this.run.forEach((r, i) => {
      const a = this.avatars[i];
      if (r.out) {
        // flattened: stays on the ground, a pancake
        r.flatT += dt;
        const k = clamp(r.flatT / 0.12, 0, 1);
        a.model.scale.set(lerp(1, 1.6, k), lerp(1, 0.14, k), lerp(1, 1.6, k));
        return;
      }
      const p = this.pad(i);
      if (r.fallT > 0) {
        r.fallT -= dt;
        r.y -= dt * 6;
        a.anim = "fall";
        if (r.fallT <= 0) {
          // climb out on the far side
          const g = this.obst.find((o) => o.kind === "gap" && r.z >= o.z - 0.5 && r.z <= o.z + o.len + 0.5);
          r.z = g ? g.z + g.len + 0.4 : r.z + 1;
          r.y = 0;
          r.vy = 0;
          r.stunT = 0.35;
          this.fx.dust({ x: r.x, y: 0, z: r.z }, 8, "#e8c08a");
        }
      } else {
        let fwd = RUN;
        if (r.stunT > 0) {
          r.stunT -= dt;
          fwd = 2.2;
          a.anim = "stun";
        }
        r.vx = damp(r.vx, (p.x ?? 0) * LAT, 12, dt);
        if (p.aDown && r.y <= 0.01 && r.stunT <= 0) {
          r.vy = JUMP_V;
          r.y = 0.02;
          this.sound("jump");
        }
        if (r.y > 0 || r.vy > 0) {
          r.vy -= GRAV * dt;
          r.y += r.vy * dt;
          if (r.y <= 0) {
            r.y = 0;
            r.vy = 0;
            this.fx.dust({ x: r.x, y: 0, z: r.z }, 4, "#e8c08a");
          }
        }
        const z0 = r.z;
        r.z += fwd * dt;
        r.x = clamp(r.x + r.vx * dt, -W + PR, W - PR);
        if (r.stunT <= 0) {
          a.anim = r.y > 0.05 ? "jump" : "run";
          a.speed = 1;
        }
        // logs: trip when not high enough
        for (const o of this.obst) {
          if (o.kind === "log" && r.y < 0.55 && r.z + PR > o.z && z0 - PR < o.z + o.len) {
            // trips and tumbles over it
            r.z = o.z + o.len + PR + 0.05;
            this.trip(i, 0.6);
            break;
          }
          if (o.kind === "rock" && r.y < o.h && r.x > o.x0 - PR && r.x < o.x1 + PR && r.z + PR > o.z && z0 - PR < o.z + o.len) {
            r.z = o.z - PR - 0.05;
            // bounce off toward the nearer edge of the rock
            r.x += r.x - o.x0 < o.x1 - r.x ? -0.25 : 0.25;
            r.x = clamp(r.x, -W + PR, W - PR);
            this.trip(i, 0.45);
            break;
          }
        }
        // chasms
        if (r.y <= 0.01 && r.fallT <= 0) {
          const g = this.overGap(r.x, r.z);
          if (g) {
            r.fallT = 1.0;
            r.falls++;
            r.vy = 0;
            this.sound("slide");
            this.buzz(i, [60, 30, 60]);
            this.hud.pop(new THREE.Vector3(r.x, 1.8, r.z), T("Oops!", "哎呀！"), "#ffd23f", this.camera);
          }
        }
      }
      // caught?
      if (r.z - PR < this.bz + R * 0.75) {
        r.out = true;
        r.outT = now;
        this.outOrder.push(i);
        a.anim = "idle";
        a.flash();
        r.y = 0;
        this.sound("crash");
        this.sound("thud");
        this.buzz(i, [120, 60, 200]);
        this.shake = 0.6;
        this.fx.burst({ x: r.x, y: 0.4, z: r.z }, { count: 18, colors: ["#e8c08a", "#ffffff", this.players[i].char.color], speed: 5, up: 3, size: 0.2, life: 0.7, shape: "ball" });
        this.hud.pop(new THREE.Vector3(r.x, 2, r.z), T("Flattened!", "压扁了！"), "#ff6a5a", this.camera);
        this.hud.mark(this.players[i].seat, "out");
        a.setRing(null);
      }
      a.pos.set(r.x, Math.max(r.y, r.fallT > 0 ? r.y : 0), r.z);
      a.groundY = r.fallT > 0 ? -4.5 : 0;
      if (!r.out) a.yaw = damp(a.yaw, clamp(r.vx * 0.08, -0.5, 0.5), 10, dt);
    });

    // runners bump each other sideways
    for (let i = 0; i < this.run.length; i++)
      for (let j = i + 1; j < this.run.length; j++) {
        const A = this.run[i],
          B = this.run[j];
        if (A.out || B.out || A.fallT > 0 || B.fallT > 0) continue;
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.0 && d > 1e-4) {
          const push = (1.0 - d) / 2;
          A.x = clamp(A.x - (dx / d) * push, -W + PR, W - PR);
          B.x = clamp(B.x + (dx / d) * push, -W + PR, W - PR);
        }
      }

    let danger = false;
    this.players.forEach((p, i) => {
      const h = this.cardHtml(i);
      if (h !== this.cards[i]) {
        this.cards[i] = h;
        this.hud.setScore(p.seat, h);
      }
      const r = this.run[i];
      const hot = !r.out && r.z - (this.bz + R) < 3.5;
      this.hud.mark(p.seat, "hot", hot);
      if (hot && !p.cpu) danger = true;
    });
    this.beatT -= dt;
    if (danger && this.beatT <= 0) {
      this.beatT = 0.75;
      this.sound("heartbeat");
    }
    this.camAt(dt);

    const alive = this.run.filter((r) => !r.out).length;
    if (alive === 0 || left <= 0) {
      if (left <= 0 && alive > 0) {
        this.hud.banner(alive === 1 ? T("SURVIVOR!", "幸存者！") : T("SURVIVORS!", "幸存者们！"), { color: "#7dff9a" });
        this.sound("fanfare");
      }
      this.hud.timer(null);
      this.finishByElimination(this.outOrder);
    }
  }

  private trip(i: number, t: number) {
    const r = this.run[i];
    if (r.stunT > 0) return;
    r.trips++;
    r.stunT = t;
    this.avatars[i].flash();
    this.sound("bonk");
    this.buzz(i, 60);
    this.fx.dust({ x: r.x, y: 0, z: r.z }, 6, "#e8c08a");
  }

  protected outroStep(dt: number) {
    // the boulder rolls on a little, then stops (never over a survivor)
    this.bv = damp(this.bv, 0, 3, dt);
    this.bz += this.bv * dt;
    for (const r of this.run) if (!r.out && this.bz + R > r.z - 0.9) {
      this.bz = r.z - 0.9 - R;
      this.bv = 0;
    }
    this.ballMesh.rotation.x += (this.bv / R) * dt;
    this.boulder.position.z = this.bz;
    this.run.forEach((r, i) => {
      if (r.out) return;
      if (r.fallT > 0) return;
      r.y = Math.max(0, r.y + r.vy * dt);
      r.vy -= GRAV * dt;
      if (r.y <= 0) r.vy = 0;
      this.avatars[i].pos.set(r.x, r.y, r.z);
      this.avatars[i].yaw = Math.PI * 0 + damp(this.avatars[i].yaw, 0, 4, dt);
    });
    this.moveCam([0, 13, this.bz + 20], [0, 0, this.bz + 5], dt, 1.5);
  }

  dispose() {
    for (const m of this.instanced) m.dispose();
    super.dispose();
  }
}

const def: MiniDef = {
  id: "rocher-roulant",
  name: "Rolling Boulder",
  icon: "🪨",
  color: "#a08a70",
  tagline: "A giant boulder is coming down the slope: run!",
  rules: "You run on your own: dodge the rocks with the stick, A to jump logs and cracks. If the boulder catches you, you're flat! Last 30 s.",
  controls: { stick: "Dodge", a: "Jump" },
  modes: ["ffa"],
  length: 30,
  music: "tense",
  create: (ctx) => new RocherRoulant(ctx),
};
export default def;
