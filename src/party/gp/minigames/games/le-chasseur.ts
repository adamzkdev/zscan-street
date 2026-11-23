/**
 * LE CHASSEUR (1 contre 3, 35 s): a French formal garden of hedges and statues. The solo is a
 * giant (×2.2, heavy steps that shake the screen) chasing the trio. He is slower, but A = a ground
 * pound: a shockwave that stuns every runner nearby for 1 s (cooldown); he also steps over the hedges
 * (slowly), but not over the statues. The runners' A = a dash.
 * A touch from the giant catches a runner, who flies into a cage by the garden. The giant wins if
 * all three are caged before the end; otherwise the trio wins.
 *
 * CPUs navigate the hedges with grid distance fields: the giant follows the shortest path to the
 * closest runner, runners descend a "safety map" (Brogue-style) that leads them away around loops.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, cloud, cone, cyl, group, pine, toon, tree } from "../../engine/gfx";
import { clamp, dist2 } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 35;
const HX = 13; // arena half-size (inside the border hedge)
const HZ = 8;
const RR = 0.42; // runner radius
const GR = 0.95; // giant radius
const SCALE = 2.2;
const R_SPEED = 6.0;
const G_SPEED = 5.3;
const DASH_V = 13.5;
const DASH_T = 0.2;
const DASH_CD = 1.6;
const POUND_R = 3.8;
const POUND_CD = 4.5;
const POUND_UP = 0.45;
const STUN = 1.0;
const CATCH = GR + RR + 0.25;
const CELL = 0.5;
const HEDGE_H = 1.25;
const HEDGE_SLOW = 0.55;

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
interface Circ {
  x: number;
  z: number;
  r: number;
}

interface Runner {
  x: number;
  z: number;
  vx: number;
  vz: number;
  dashT: number;
  dashCd: number;
  stun: number;
  caught: boolean;
  /** Flight to the cage: 0..1 (−1 = not flying). */
  fly: number;
  fx0: number;
  fz0: number;
  cage: number;
  /** CPU: last chosen direction and when to think again. */
  dirX: number;
  dirZ: number;
  think: number;
  /** CPU: will it dodge this pound (−1 undecided)? */
  dodge: number;
}

// ------------------------------------------------------------------ navigation grid

const NX = Math.round((2 * HX) / CELL);
const NZ = Math.round((2 * HZ) / CELL);
const D8: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, 1.414],
  [1, -1, 1.414],
  [-1, 1, 1.414],
  [-1, -1, 1.414],
];

class Nav {
  clear = new Float32Array(NX * NZ);
  /** Clearance ignoring the hedges (the giant steps over them). */
  clearC = new Float32Array(NX * NZ);
  /** Travel cost per cell for the giant (slower on a hedge). */
  gCost = new Float32Array(NX * NZ);
  private hk: number[] = [];
  private hi: number[] = [];
  constructor(rects: Rect[], circs: Circ[]) {
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const x = this.cx(i),
          z = this.cz(j);
        let c = Math.min(HX - Math.abs(x), HZ - Math.abs(z));
        for (const r of rects) {
          const px = clamp(x, r.x0, r.x1),
            pz = clamp(z, r.z0, r.z1);
          const inside = px === x && pz === z;
          c = Math.min(c, inside ? -1 : Math.hypot(x - px, z - pz));
        }
        let cc = Math.min(HX - Math.abs(x), HZ - Math.abs(z));
        for (const o of circs) {
          const e = Math.hypot(x - o.x, z - o.z) - o.r;
          c = Math.min(c, e);
          cc = Math.min(cc, e);
        }
        this.clear[j * NX + i] = c;
        this.clearC[j * NX + i] = cc;
        let onHedge = false;
        for (const r of rects) if (x > r.x0 - 0.45 && x < r.x1 + 0.45 && z > r.z0 - 0.45 && z < r.z1 + 0.45) onHedge = true;
        this.gCost[j * NX + i] = onHedge ? 1.9 : 1;
      }
  }
  cx(i: number) {
    return -HX + (i + 0.5) * CELL;
  }
  cz(j: number) {
    return -HZ + (j + 0.5) * CELL;
  }
  free(r: number, overHedges = false) {
    const f = new Uint8Array(NX * NZ);
    const c = overHedges ? this.clearC : this.clear;
    for (let k = 0; k < f.length; k++) f[k] = c[k] > r ? 1 : 0;
    return f;
  }
  /** The free cell closest to (x, z). */
  cell(free: Uint8Array, x: number, z: number) {
    const i = clamp(Math.floor((x + HX) / CELL), 0, NX - 1);
    const j = clamp(Math.floor((z + HZ) / CELL), 0, NZ - 1);
    if (free[j * NX + i]) return j * NX + i;
    let best = j * NX + i,
      bd = 1e9;
    for (let dj = -3; dj <= 3; dj++)
      for (let di = -3; di <= 3; di++) {
        const a = i + di,
          b = j + dj;
        if (a < 0 || b < 0 || a >= NX || b >= NZ || !free[b * NX + a]) continue;
        const d = di * di + dj * dj;
        if (d < bd) {
          bd = d;
          best = b * NX + a;
        }
      }
    return best;
  }
  private push(k: number, i: number) {
    const hk = this.hk,
      hi = this.hi;
    let n = hk.length;
    hk.push(k);
    hi.push(i);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (hk[p] <= k) break;
      hk[n] = hk[p];
      hi[n] = hi[p];
      n = p;
    }
    hk[n] = k;
    hi[n] = i;
  }
  private popI = 0;
  private popK = 0;
  private pop() {
    const hk = this.hk,
      hi = this.hi;
    this.popK = hk[0];
    this.popI = hi[0];
    const lk = hk.pop()!,
      li = hi.pop()!;
    const n = hk.length;
    if (n > 0) {
      let j = 0;
      for (;;) {
        let c = 2 * j + 1;
        if (c >= n) break;
        if (c + 1 < n && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= lk) break;
        hk[j] = hk[c];
        hi[j] = hi[c];
        j = c;
      }
      hk[j] = lk;
      hi[j] = li;
    }
  }
  /** Relax `d` (finite cells are sources with their value) over the free cells. */
  relax(free: Uint8Array, d: Float32Array, cost?: Float32Array) {
    this.hk.length = 0;
    this.hi.length = 0;
    for (let k = 0; k < d.length; k++) if (d[k] < 1e8) this.push(d[k], k);
    while (this.hk.length) {
      this.pop();
      const k = this.popI,
        v = this.popK;
      if (v > d[k]) continue;
      const i = k % NX,
        j = (k / NX) | 0;
      for (const [di, dj, w] of D8) {
        const a = i + di,
          b = j + dj;
        if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
        const n = b * NX + a;
        if (!free[n]) continue;
        if (di && dj && (!free[j * NX + a] || !free[b * NX + i])) continue;
        const nv = v + (cost ? w * 0.5 * (cost[k] + cost[n]) : w);
        if (nv < d[n]) {
          d[n] = nv;
          this.push(d[n], n);
        }
      }
    }
    return d;
  }
  /** Path distance (in cells) from a point. */
  from(free: Uint8Array, x: number, z: number, out?: Float32Array, cost?: Float32Array) {
    const d = out ?? new Float32Array(NX * NZ);
    d.fill(1e9);
    d[this.cell(free, x, z)] = 0;
    return this.relax(free, d, cost);
  }
  /** A flee map: −k × the threat's distance, relaxed again (leads around loops, not into corners). */
  safety(free: Uint8Array, threat: Float32Array, k = 1.3, out?: Float32Array) {
    const d = out ?? new Float32Array(NX * NZ);
    for (let n = 0; n < d.length; n++) d[n] = free[n] && threat[n] < 1e8 ? -k * threat[n] : 1e9;
    return this.relax(free, d);
  }
  at(f: Float32Array, free: Uint8Array, x: number, z: number) {
    return f[this.cell(free, x, z)];
  }
  /** Direction toward lower values of `f` (looks 1–2 cells around), or null at a minimum. */
  descend(f: Float32Array, free: Uint8Array, x: number, z: number): [number, number] | null {
    const c = this.cell(free, x, z);
    const i = c % NX,
      j = (c / NX) | 0;
    let best = f[c],
      bx = 0,
      bz = 0,
      found = false;
    for (const [di, dj] of D8) {
      for (const s of [1, 2]) {
        const a = i + di * s,
          b = j + dj * s;
        if (a < 0 || b < 0 || a >= NX || b >= NZ) break;
        const n = b * NX + a;
        if (!free[n]) break;
        const v = f[n] - (s === 2 ? 0.05 : 0);
        if (v < best) {
          best = v;
          bx = this.cx(a) - x;
          bz = this.cz(b) - z;
          found = true;
        }
      }
    }
    if (!found) return null;
    const l = Math.hypot(bx, bz) || 1;
    return [bx / l, bz / l];
  }
  /** Can a body of this grid walk straight from a to b? */
  los(free: Uint8Array, ax: number, az: number, bx: number, bz: number) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / (CELL * 0.5));
    for (let s = 1; s < n; s++) {
      const x = ax + ((bx - ax) * s) / n,
        z = az + ((bz - az) * s) / n;
      const i = clamp(Math.floor((x + HX) / CELL), 0, NX - 1);
      const j = clamp(Math.floor((z + HZ) / CELL), 0, NZ - 1);
      if (!free[j * NX + i]) return false;
    }
    return true;
  }
}

// ------------------------------------------------------------------ the game

class LeChasseur extends BaseMini {
  private rects: Rect[] = [];
  private circs: Circ[] = [];
  private nav!: Nav;
  private freeR!: Uint8Array;
  private freeG!: Uint8Array;
  private run: Runner[] = [];
  private g = { x: 0, z: -6, vx: 0, vz: 0, pound: -1, poundCd: 1.5, recover: 0, step: 0, grab: 0, lift: 0 };
  private cages: { x: number; z: number; door: THREE.Object3D; used: number }[] = [];
  private caughtN = 0;
  private tipEl: HTMLElement | null = null;
  private pounds = 0;
  private hurried = false;
  private ended = false;
  private endT = 0;
  private dangerRing!: THREE.Mesh;
  private water!: THREE.Mesh;
  private sprayT = 0;
  // CPU planning
  private gField = new Float32Array(NX * NZ);
  private gThreat = new Float32Array(NX * NZ);
  private gSafe = new Float32Array(NX * NZ);
  private fieldT = -1;
  private gTarget = -1;
  private gThink = 0;
  private gDir: [number, number] = [0, 0];
  private gWob: [number, number] = [0, 0];
  private tmp = new Float32Array(NX * NZ);

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#69b8ff", "#fdf0d8"], size: 20, sun: [0.45, 1, 0.55], fog: { near: 50, far: 110 } });
    this.layout();
    this.buildGarden();
    this.nav = new Nav(this.rects, this.circs);
    this.freeR = this.nav.free(RR + 0.02);
    this.freeG = this.nav.free(GR - 0.02, true);

    // the giant at the top, the runners spread along the bottom
    const ga = this.spawn(0, 0, -6, 0, { scale: SCALE });
    ga.setRing(this.players[0].char.color);
    const starts = [
      [-9, 6],
      [0, 6.2],
      [9, 6],
    ];
    for (let k = 1; k < this.players.length; k++) {
      const [x, z] = starts[(k - 1) % 3];
      const a = this.spawn(k, x, z, Math.PI);
      a.setRing(this.players[k].char.color);
      this.run[k] = { x, z, vx: 0, vz: 0, dashT: 0, dashCd: 0, stun: 0, caught: false, fly: -1, fx0: 0, fz0: 0, cage: -1, dirX: 0, dirZ: 0, think: 0, dodge: -1 };
    }

    // the danger ring: shows the pound's reach when it's ready
    this.dangerRing = new THREE.Mesh(new THREE.RingGeometry(POUND_R - 0.2, POUND_R, 56), new THREE.MeshBasicMaterial({ color: "#ff2a2a", transparent: true, opacity: 0.35, depthWrite: false }));
    this.dangerRing.rotation.x = -Math.PI / 2;
    this.dangerRing.position.y = 0.04;
    this.dangerRing.renderOrder = 2;
    this.scene.add(this.dangerRing);

    this.hud.players(this.players, (p) => (p.team === 0 ? "🦖 0/3" : T("Free!", "自由！")), { teams: true });
    this.hud.timer(TIME);
    this.setCam([0, 34, 30], [0, 0, 2.5], 40);
  }

  // ------------------------------------------------------------ the garden

  private layout() {
    const hedge = (x0: number, z0: number, x1: number, z1: number) => this.rects.push({ x0, z0, x1, z1 });
    const HT = 0.4; // half thickness
    hedge(-9.5, -4 - HT, -3, -4 + HT);
    hedge(3, -4 - HT, 9.5, -4 + HT);
    hedge(-9.5, 4 - HT, -3, 4 + HT);
    hedge(3, 4 - HT, 9.5, 4 + HT);
    hedge(-6.5 - HT, -1.7, -6.5 + HT, 1.7);
    hedge(6.5 - HT, -1.7, 6.5 + HT, 1.7);
    // the fountain and the statues
    this.circs.push({ x: 0, z: 0, r: 1.5 });
    for (const [x, z] of [
      [0, -4],
      [0, 4],
      [-9.8, 0],
      [9.8, 0],
    ])
      this.circs.push({ x, z, r: 0.7 });
  }

  private buildGarden() {
    const s = this.scene;
    // the lawn all around
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), toon("#7fc45a"));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    grass.receiveShadow = true;
    s.add(grass);
    // the mown lawn of the maze (stripes)
    const tex = canvasTex(1024, 640, (g, w, h) => {
      const n = 13;
      for (let i = 0; i < n; i++) {
        g.fillStyle = i % 2 ? "#8fd667" : "#7fca5a";
        g.fillRect((i * w) / n, 0, w / n + 1, h);
      }
      // a few daisies
      for (let k = 0; k < 220; k++) {
        const x = ((k * 397) % 1000) / 1000,
          y = ((k * 641) % 997) / 997;
        g.fillStyle = k % 3 ? "#ffffff" : "#fff27a";
        g.beginPath();
        g.arc(x * w, y * h, 2.4, 0, Math.PI * 2);
        g.fill();
      }
    });
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, 2 * HZ), new THREE.MeshToonMaterial({ map: tex }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = 0.005;
    lawn.receiveShadow = true;
    s.add(lawn);
    // gravel walk around the maze
    const gravel = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX + 9, 2 * HZ + 9), toon("#e8d9b5"));
    gravel.rotation.x = -Math.PI / 2;
    gravel.position.set(0, 0.0, 0.8);
    gravel.receiveShadow = true;
    s.add(gravel);

    // hedges: the border and the maze
    const hedgeBox = (x0: number, z0: number, x1: number, z1: number, h = HEDGE_H) => {
      const w = x1 - x0,
        d = z1 - z0;
      box(s, "#2b7d39", w, h, d, { x: (x0 + x1) / 2, y: h / 2, z: (z0 + z1) / 2 });
      box(s, "#379245", w - 0.1, 0.12, d - 0.1, { x: (x0 + x1) / 2, y: h + 0.02, z: (z0 + z1) / 2, cast: false });
    };
    const B = 0.9;
    hedgeBox(-HX - B, -HZ - B, HX + B, -HZ, HEDGE_H + 0.2);
    hedgeBox(-HX - B, HZ, HX + B, HZ + B, HEDGE_H + 0.2);
    hedgeBox(-HX - B, -HZ, -HX, HZ, HEDGE_H + 0.2);
    hedgeBox(HX, -HZ, HX + B, HZ, HEDGE_H + 0.2);
    for (const r of this.rects) hedgeBox(r.x0, r.z0, r.x1, r.z1);
    // leafy bumps along the hedge tops (one instanced mesh)
    const bumps: [number, number, number, number][] = [];
    const along = (x0: number, z0: number, x1: number, z1: number, h: number) => {
      const horiz = x1 - x0 > z1 - z0;
      const len = horiz ? x1 - x0 : z1 - z0;
      const th = horiz ? z1 - z0 : x1 - x0;
      const n = Math.max(2, Math.round(len / 0.75));
      for (let q = 0; q <= n; q++) {
        const t = q / n;
        const x = horiz ? x0 + 0.3 + (len - 0.6) * t : (x0 + x1) / 2;
        const z = horiz ? (z0 + z1) / 2 : z0 + 0.3 + (len - 0.6) * t;
        bumps.push([x, h + 0.08, z, th * (0.5 + ((q * 7) % 3) * 0.06)]);
      }
    };
    for (const r of this.rects) along(r.x0, r.z0, r.x1, r.z1, HEDGE_H);
    along(-HX - B, -HZ - B, HX + B, -HZ, HEDGE_H + 0.2);
    along(-HX - B, HZ, HX + B, HZ + B, HEDGE_H + 0.2);
    along(-HX - B, -HZ, -HX, HZ, HEDGE_H + 0.2);
    along(HX, -HZ, HX + B, HZ, HEDGE_H + 0.2);
    const inst = new THREE.InstancedMesh(GEO.sphereLo, toon("#3f9e4c"), bumps.length);
    const m4 = new THREE.Matrix4();
    bumps.forEach(([x, y, z, r], k) => inst.setMatrixAt(k, m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r, r * 0.8, r))));
    inst.castShadow = true;
    inst.receiveShadow = true;
    s.add(inst);

    // the fountain
    const f = group(s);
    cyl(f, "#e9e2d2", 1.5, 0.55, { y: 0.27, seg: 28 });
    cyl(f, "#d6ccb6", 1.62, 0.12, { y: 0.56, seg: 28 });
    this.water = new THREE.Mesh(GEO.circle, toon("#6fd0ff", "#2a8fd0", 0.4));
    this.water.rotation.x = -Math.PI / 2;
    this.water.scale.setScalar(1.32);
    this.water.position.y = 0.5;
    f.add(this.water);
    cyl(f, "#e9e2d2", 0.25, 1.4, { y: 1.1, seg: 12 });
    cyl(f, "#e9e2d2", 0.7, 0.18, { y: 1.8, rTop: 0.85, seg: 20 });
    ball(f, "#bfe9ff", 0.22, { y: 2.05 });

    // the statues (pedestal + a stone figure)
    const stone = "#ece6da";
    this.circs.slice(1).forEach((c, k) => {
      const g = group(s, { x: c.x, z: c.z });
      box(g, "#d4ccbb", 1.3, 0.35, 1.3, { y: 0.17 });
      box(g, stone, 1.0, 1.0, 1.0, { y: 0.85 });
      box(g, "#d4ccbb", 1.2, 0.18, 1.2, { y: 1.42 });
      if (k % 2 === 0) {
        // a little knight
        cyl(g, stone, 0.32, 0.9, { y: 1.95, rTop: 0.22, seg: 12 });
        ball(g, stone, 0.3, { y: 2.65 });
        cone(g, stone, 0.32, 0.45, { y: 3.05 });
        cyl(g, stone, 0.05, 1.4, { x: 0.42, y: 2.1, seg: 6 });
      } else {
        // an urn with a flower bouquet
        cyl(g, stone, 0.42, 0.7, { y: 1.85, rTop: 0.55, seg: 14 });
        ball(g, stone, 0.38, { y: 1.7 });
        for (let q = 0; q < 5; q++) {
          const a = (q / 5) * Math.PI * 2;
          ball(g, ["#ff5a7a", "#ffd23f", "#ffffff", "#ff8ad8", "#8a6aff"][q], 0.17, { x: Math.cos(a) * 0.25, y: 2.35, z: Math.sin(a) * 0.25, lo: true });
        }
      }
    });

    // flower beds along the gravel walk (two instanced meshes: bushes and flowers)
    const cols = ["#ff5a7a", "#ffd23f", "#ffffff", "#ff8ad8", "#8a6aff", "#ff9a2e"];
    const beds: [number, number][] = [];
    for (let k = 0; k < 34; k++) beds.push([-HX - 0.6 + (k / 33) * (2 * HX + 1.2), -HZ - 2.6]);
    for (let k = 0; k < 10; k++) for (const x of [-HX - 2.8, HX + 2.8]) beds.push([x, -HZ + (k / 9) * 2 * HZ]);
    const bush = new THREE.InstancedMesh(GEO.sphereLo, toon("#3f9a3a"), beds.length);
    const flw = new THREE.InstancedMesh(GEO.sphereLo, new THREE.MeshToonMaterial({ color: "#ffffff" }), beds.length);
    const mm = new THREE.Matrix4(),
      qq = new THREE.Quaternion(),
      col = new THREE.Color();
    beds.forEach(([x, z], k) => {
      bush.setMatrixAt(k, mm.compose(new THREE.Vector3(x, 0.2, z), qq, new THREE.Vector3(0.42, 0.42, 0.42)));
      flw.setMatrixAt(k, mm.compose(new THREE.Vector3(x, 0.58, z), qq, new THREE.Vector3(0.13, 0.13, 0.13)));
      flw.setColorAt(k, col.set(cols[k % cols.length]));
    });
    bush.castShadow = true;
    s.add(bush, flw);
    // trees and pines around
    for (let k = 0; k < 9; k++) {
      tree(s, -HX - 6 - (k % 2) * 2.5, -HZ + k * 2.2, 1.4 + (k % 3) * 0.2, k % 2 ? "#5cc44f" : "#48b04a");
      tree(s, HX + 6 + (k % 2) * 2.5, -HZ + k * 2.2, 1.4 + ((k + 1) % 3) * 0.2, k % 2 ? "#48b04a" : "#5cc44f");
    }
    for (let k = 0; k < 8; k++) pine(s, -18 + k * 5.2, -HZ - 6 - (k % 2) * 1.5, 1.6, "#2f8e52");
    // the château at the far end
    const ch = group(s, { z: -HZ - 17 });
    box(ch, "#f3e6cc", 26, 7, 4, { y: 3.5 });
    box(ch, "#6d7f96", 26.4, 1.8, 4.4, { y: 7.9 });
    for (const x of [-14, 14]) {
      cyl(ch, "#f3e6cc", 2.2, 10, { x, y: 5, seg: 16 });
      cone(ch, "#5a6b86", 2.6, 4, { x, y: 12 });
    }
    cyl(ch, "#f3e6cc", 2.6, 12, { y: 6, z: 1.4, seg: 18 });
    cone(ch, "#5a6b86", 3.0, 4.5, { y: 14.2, z: 1.4 });
    for (let x = -11; x <= 11; x += 2.2) {
      if (Math.abs(x) < 2.6) continue;
      for (const y of [2, 5]) box(ch, "#4a6a9a", 1, 1.6, 0.1, { x, y, z: 2.05, cast: false });
    }
    box(ch, "#7a4a2a", 2.2, 3.2, 0.2, { y: 1.6, z: 4.05 });
    for (const [x, y, z, sc] of [
      [-22, 14, -40, 2.2],
      [8, 16, -46, 2.8],
      [28, 13, -36, 2],
    ])
      cloud(s, x, y, z, sc);

    // the cages, below the garden (open at the top: we see who's inside)
    const ringGeo = new THREE.TorusGeometry(1.14, 0.1, 6, 32);
    const hoopGeo = new THREE.TorusGeometry(1.12, 0.045, 5, 32);
    for (let k = 0; k < 3; k++) {
      const x = (k - 1) * 4.4,
        z = HZ + 2.45;
      const g = group(s, { x, z });
      cyl(g, "#7a5434", 1.25, 0.3, { y: 0.15, seg: 18 });
      const top = new THREE.Mesh(ringGeo, toon("#5a3c24"));
      top.rotation.x = Math.PI / 2;
      top.position.y = 2.5;
      top.castShadow = true;
      g.add(top);
      for (const y of [0.4, 1.45]) {
        const hoop = new THREE.Mesh(hoopGeo, toon("#30303c"));
        hoop.rotation.x = Math.PI / 2;
        hoop.position.y = y;
        g.add(hoop);
      }
      for (const sx of [-1, 1]) cone(g, "#ffc928", 0.12, 0.3, { x: sx * 1.14, y: 2.75 });
      const bars = 16;
      for (let q = 0; q < bars; q++) {
        const ang = (q / bars) * Math.PI * 2;
        if (Math.abs(ang - Math.PI / 2) < 0.5) continue; // the door
        cyl(g, "#30303c", 0.07, 2.3, { x: Math.cos(ang) * 1.12, y: 1.35, z: Math.sin(ang) * 1.12, seg: 6 });
      }
      // the door (toward the camera), hinged on its left side
      const door = group(g, { x: Math.cos(Math.PI / 2 + 0.5) * 1.12, z: Math.sin(Math.PI / 2 + 0.5) * 1.12 });
      for (let q = 0; q < 3; q++) cyl(door, "#30303c", 0.055, 2.2, { x: 0.3 + q * 0.3, y: 1.4, seg: 6 });
      box(door, "#30303c", 1.0, 0.08, 0.08, { x: 0.6, y: 0.6 });
      box(door, "#30303c", 1.0, 0.08, 0.08, { x: 0.6, y: 2.2 });
      box(door, "#ffc928", 0.26, 0.3, 0.12, { x: 0.95, y: 1.3, z: 0.06 });
      door.rotation.y = -1.6;
      // a wooden sign with the runner's colour
      this.cages.push({ x, z, door, used: -1 });
    }
  }

  // ------------------------------------------------------------ movement helpers

  /** Push a circle out of the hedges, statues and walls. */
  private collide(o: { x: number; z: number }, r: number, hedges = true) {
    for (const b of hedges ? this.rects : []) {
      const px = clamp(o.x, b.x0, b.x1),
        pz = clamp(o.z, b.z0, b.z1);
      const dx = o.x - px,
        dz = o.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < r) {
        if (d > 1e-5) {
          o.x = px + (dx / d) * r;
          o.z = pz + (dz / d) * r;
        } else {
          // inside: out along the shortest axis
          const l = o.x - b.x0,
            rr = b.x1 - o.x,
            t = o.z - b.z0,
            bb = b.z1 - o.z;
          const m = Math.min(l, rr, t, bb);
          if (m === l) o.x = b.x0 - r;
          else if (m === rr) o.x = b.x1 + r;
          else if (m === t) o.z = b.z0 - r;
          else o.z = b.z1 + r;
        }
      }
    }
    for (const c of this.circs) {
      const dx = o.x - c.x,
        dz = o.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.r + r) {
        const k = (c.r + r) / (d || 1);
        o.x = c.x + dx * k;
        o.z = c.z + dz * k;
      }
    }
    o.x = clamp(o.x, -HX + r, HX - r);
    o.z = clamp(o.z, -HZ + r, HZ - r);
  }

  private free() {
    return this.run.filter((r) => r && !r.caught);
  }

  // ------------------------------------------------------------ CPUs

  private plan() {
    if (this.fieldT === this.t) return;
    this.fieldT = this.t;
    // the giant's threat as seen by the runners, and their flee map
    this.nav.from(this.freeG, this.g.x, this.g.z, this.gThreat, this.nav.gCost);
    this.nav.safety(this.freeR, this.gThreat, 1.35, this.gSafe);
  }

  protected cpu(i: number, dt: number): CpuPad {
    const lv = this.players[i].level;
    if (i === 0) return this.cpuGiant(lv, dt);
    const r = this.run[i];
    if (!r || r.caught || r.stun > 0) return {};
    const g = this.g;
    if (this.t >= r.think) {
      r.think = this.t + 0.06 + 0.42 * (1 - lv) + Math.random() * 0.08;
      this.plan();
      const threat = this.nav.at(this.gThreat, this.freeG, r.x, r.z) * CELL;
      const alert = threat < 6.5 + 3.5 * lv;
      let dx = 0,
        dz = 0;
      if (alert) {
        const d = this.nav.descend(this.gSafe, this.freeR, r.x, r.z);
        if (d) [dx, dz] = d;
        else {
          dx = r.x - g.x;
          dz = r.z - g.z;
        }
      } else {
        // the giant is far: wander about
        dx = Math.sin(this.t * 0.7 + i * 2);
        dz = Math.cos(this.t * 0.5 + i);
      }
      // keep apart from the other runners (one pound shouldn't get them all)
      for (const o of this.free()) {
        if (o === r) continue;
        const d = dist2(r.x, r.z, o.x, o.z);
        if (d < 2.6 && d > 0.01) {
          dx += ((r.x - o.x) / d) * 0.35;
          dz += ((r.z - o.z) / d) * 0.35;
        }
      }
      const l = Math.hypot(dx, dz);
      const sp = alert ? 1 : 0.35;
      r.dirX = l > 0.01 ? (dx / l) * sp : 0;
      r.dirZ = l > 0.01 ? (dz / l) * sp : 0;
      // sloppy beginners wobble a bit
      const w = (1 - lv) * 1.0;
      r.dirX += (Math.random() - 0.5) * w;
      r.dirZ += (Math.random() - 0.5) * w;
    }
    let a = false;
    const dg = dist2(r.x, r.z, g.x, g.z);
    if (g.pound < 0) r.dodge = -1;
    if (r.dashCd <= 0) {
      // dodge a pound in the air (not always: it's a reflex)
      if (g.pound >= 0 && dg < POUND_R + 0.6) {
        if (r.dodge < 0) r.dodge = this.cpuChance(i, 0.05, 0.9) ? 1 : 0;
        if (r.dodge === 1 && this.cpuAfter(i, "dodge", 0.3 - 0.15 * lv)) a = true;
      } else this.cpuReset(i, "dodge");
      // a dash when the giant is about to grab
      if (dg < CATCH + 0.8 + 0.6 * lv) {
        if (this.cpuAfter(i, "grab", 0.5 - 0.42 * lv)) a = true;
      } else this.cpuReset(i, "grab");
    }
    return { x: r.dirX, y: r.dirZ, a };
  }

  private cpuGiant(lv: number, _dt: number): CpuPad {
    const g = this.g;
    const free = this.free().filter((r) => r.fly < 0);
    if (!free.length) return {};
    if (this.t >= this.gThink || !this.run[this.gTarget] || this.run[this.gTarget].caught) {
      this.gThink = this.t + 0.08 + 0.5 * (1 - lv);
      // the closest runner along the paths (stick to the current one unless another is much closer)
      let best = -1,
        bd = 1e9,
        cur = 1e9;
      for (const r of free) {
        const k = this.run.indexOf(r);
        this.nav.from(this.freeG, r.x, r.z, this.tmp, this.nav.gCost);
        let d = this.nav.at(this.tmp, this.freeG, g.x, g.z);
        if (r.stun > 0) d *= 0.6;
        if (k === this.gTarget) cur = d;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      if (best < 0) best = this.run.indexOf(free[0]);
      if (this.gTarget < 0 || !this.run[this.gTarget] || this.run[this.gTarget].caught || bd < cur * 0.7) this.gTarget = best;
      const t = this.run[this.gTarget];
      this.nav.from(this.freeG, t.x, t.z, this.gField, this.nav.gCost);
      this.gWob = [(Math.random() - 0.5) * (1 - lv) * 1.1, (Math.random() - 0.5) * (1 - lv) * 1.1];
    }
    // steer every frame: straight at the runner (a bit ahead) when in sight, else along the path
    const t = this.run[this.gTarget];
    const lead = 0.2 + 0.4 * lv;
    const ax = t.x + t.vx * lead,
      az = t.z + t.vz * lead;
    if (this.nav.los(this.freeG, g.x, g.z, ax, az)) {
      const l = Math.hypot(ax - g.x, az - g.z) || 1;
      this.gDir = [(ax - g.x) / l, (az - g.z) / l];
    } else {
      const d = this.nav.descend(this.gField, this.freeG, g.x, g.z);
      if (d) this.gDir = d;
    }
    this.gDir = [this.gDir[0] + this.gWob[0], this.gDir[1] + this.gWob[1]];
    // the pound: someone in reach, not already in the hands
    let a = false;
    if (g.poundCd <= 0 && g.pound < 0) {
      let inReach = 0,
        nearest = 1e9;
      for (const r of free) {
        const d = dist2(r.x, r.z, g.x, g.z);
        nearest = Math.min(nearest, d);
        if (d < POUND_R - 0.3 && r.stun <= 0) inReach++;
      }
      if (inReach && nearest > CATCH + 0.4) {
        if (this.cpuAfter(0, "pound", 0.65 - 0.55 * lv)) {
          a = true;
          this.cpuReset(0, "pound");
        }
      } else this.cpuReset(0, "pound");
    }
    return { x: this.gDir[0], y: this.gDir[1], a };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.water.rotation.z += dt * 0.3;
    this.moveCam([0, 23, 17.5], [0, 0, 3.4], dt, 1.5);
    this.dangerRing.visible = false;
  }

  start() {
    this.hud.banner(T("CATCH THEM!", "抓住他们！"), { color: "#ffd23f", sub: T(`${this.players[0].name} is the giant`, `${this.players[0].name} 是巨人`), ms: 1400 });
    this.tipEl = this.hud.add(`<div style="position:absolute;left:50%;top:calc(var(--u)*8);transform:translateX(-50%);padding:calc(var(--u)*0.6) calc(var(--u)*1.8);background:rgba(20,14,40,0.75);border-radius:999px;font-size:calc(var(--u)*1.6);font-weight:600;white-space:nowrap">${T("🦖 Giant: <b>A</b> = Stomp &nbsp;·&nbsp; Runners: <b>A</b> = Sprint", "🦖 巨人：<b>A</b> = 跺脚 &nbsp;·&nbsp; 逃跑者：<b>A</b> = 冲刺")}</div>`);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.water.rotation.z += dt * 0.3;
    this.moveCam([0, 23, 17.5], [0, 0, 3.4], dt, 3);
    if (this.t > 6 && this.tipEl) {
      this.tipEl.remove();
      this.tipEl = null;
    }
    this.sprayT -= dt;
    if (this.sprayT <= 0) {
      this.sprayT = 0.12;
      this.fx.burst({ x: 0, y: 2.1, z: 0 }, { count: 2, colors: ["#bfe9ff", "#ffffff"], speed: 1.3, up: 3.5, gravity: 9, size: 0.1, sizeEnd: 0.04, life: 0.7, shape: "ball", drag: 0.3 });
    }
    if (!this.hurried && left <= 10 && !this.ended) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ff7a5a", size: 6 });
      music.speed(1.15);
      this.sound("bell");
    }

    this.stepGiant(dt);
    this.stepRunners(dt);

    // catches
    const g = this.g;
    if (!this.ended && g.pound < 0) {
      this.run.forEach((r, i) => {
        if (!r || r.caught) return;
        if (dist2(r.x, r.z, g.x, g.z) < CATCH) this.catchRunner(i);
      });
    }
    // cages
    for (const c of this.cages) {
      const target = c.used >= 0 && this.run[c.used]?.fly < 0 ? 0 : -1.6;
      c.door.rotation.y += (target - c.door.rotation.y) * (1 - Math.exp(-12 * dt));
    }

    if (this.ended) {
      this.endT += dt;
      if (this.endT > 0.9) this.finishByTeam(0);
      return;
    }
    if (this.free().length === 0) {
      this.ended = true;
      this.hud.banner(T("ALL CAUGHT!", "全部抓住！"), { color: "#ff5a4e", size: 8 });
      this.sound("fanfare");
    } else if (left <= 0) {
      this.finishByTeam(1);
    }
  }

  private stepGiant(dt: number) {
    const g = this.g;
    const a = this.avatars[0];
    const p = this.pad(0);
    g.poundCd -= dt;
    g.recover -= dt;
    g.grab -= dt;
    let sp = G_SPEED;
    if (g.pound >= 0) {
      g.pound += dt;
      sp *= 0.35;
      const k = clamp(g.pound / POUND_UP, 0, 1);
      a.pos.y = g.lift + Math.sin(k * Math.PI) * 1.5;
      a.anim = "jump";
      if (g.pound >= POUND_UP) this.landPound();
    } else if (p.aDown && g.poundCd <= 0 && !this.ended) {
      g.pound = 0;
      this.sound("jump");
      this.sound("whoosh");
    }
    // stepping over a hedge: slower, leaves flying
    let over = false;
    for (const b of this.rects) if (dist2(g.x, g.z, clamp(g.x, b.x0, b.x1), clamp(g.z, b.z0, b.z1)) < GR * 0.55) over = true;
    if (over) {
      sp *= HEDGE_SLOW;
      if (Math.random() < 0.25) this.fx.burst({ x: g.x, y: HEDGE_H, z: g.z }, { count: 2, colors: ["#3fa64f", "#5cc44f", "#2f8a3f"], speed: 3, up: 3, gravity: 9, size: 0.14, life: 0.7, shape: "flake" });
    }
    g.lift += ((over ? 0.75 : 0) - g.lift) * (1 - Math.exp(-10 * dt));
    if (g.recover > 0) sp = 0;
    const tx = p.x * sp,
      tz = p.y * sp;
    const k = 1 - Math.exp(-7 * dt);
    g.vx += (tx - g.vx) * k;
    g.vz += (tz - g.vz) * k;
    if (this.ended) g.vx = g.vz = 0;
    g.x += g.vx * dt;
    g.z += g.vz * dt;
    this.collide(g, GR, false);
    const v = Math.hypot(g.vx, g.vz);
    if (g.pound < 0) {
      a.pos.y = g.lift;
      if (g.grab > 0) a.anim = "hit";
      else if (this.ended) a.anim = "win";
      else {
        a.anim = v > 0.5 ? "run" : "idle";
        a.speed = clamp(v / G_SPEED, 0, 1) * 0.35;
      }
      // heavy steps
      if (v > 1) {
        g.step -= dt;
        if (g.step <= 0) {
          g.step = 0.42;
          this.sound("thud");
          this.shake = Math.max(this.shake, 0.1);
          this.fx.dust({ x: g.x + (Math.random() - 0.5) * 0.8, y: 0, z: g.z + (Math.random() - 0.5) * 0.8 }, 5, "#d9ccb0");
        }
      } else g.step = 0.1;
    }
    if (v > 0.4) a.face(Math.atan2(g.vx, g.vz), dt, 8);
    a.pos.x = g.x;
    a.pos.z = g.z;
    // the danger ring
    const ready = g.poundCd <= 0 && g.pound < 0 && !this.ended;
    this.dangerRing.visible = ready || g.pound >= 0;
    this.dangerRing.position.set(g.x, 0.04, g.z);
    (this.dangerRing.material as THREE.MeshBasicMaterial).opacity = g.pound >= 0 ? 0.85 : 0.4 + 0.15 * Math.sin(this.t * 6);
  }

  private landPound() {
    const g = this.g;
    g.pound = -1;
    g.poundCd = POUND_CD;
    this.pounds++;
    g.recover = 0.28;
    this.avatars[0].pos.y = g.lift;
    this.shake = 0.75;
    this.sound("explode");
    this.sound("thud");
    this.buzz(0, 80);
    const at = { x: g.x, y: 0.1, z: g.z };
    this.fx.ring(at, "#ffffff", POUND_R + 0.4, 0.5);
    this.fx.ring(at, "#ffd23f", POUND_R * 0.7, 0.35);
    this.fx.burst(at, { count: 30, colors: ["#d9ccb0", "#c2b28e", "#7fca5a"], speed: 7, up: 2, gravity: 10, size: 0.22, sizeEnd: 0.05, life: 0.7, shape: "cube", flat: true, drag: 2 });
    this.fx.burst({ x: g.x, y: 0.3, z: g.z }, { count: 14, colors: ["#5cc44f", "#3fa64f"], speed: 4, up: 5, gravity: 12, size: 0.14, life: 0.8, shape: "flake" });
    this.run.forEach((r, i) => {
      if (!r || r.caught) return;
      const d = dist2(r.x, r.z, g.x, g.z);
      if (d < POUND_R) {
        r.stun = STUN;
        r.dashT = 0;
        const k = 1 / (d || 1);
        r.vx = (r.x - g.x) * k * 4;
        r.vz = (r.z - g.z) * k * 4;
        this.avatars[i].flash();
        this.buzz(i, [60, 40, 60]);
        this.hud.pop(new THREE.Vector3(r.x, 2, r.z), T("Stunned!", "晕了！"), "#ffd23f", this.camera);
      }
    });
  }

  private stepRunners(dt: number) {
    this.run.forEach((r, i) => {
      if (!r) return;
      const a = this.avatars[i];
      if (r.caught) {
        if (r.fly >= 0) {
          r.fly += dt / 0.9;
          const c = this.cages[r.cage];
          const k = Math.min(1, r.fly);
          a.pos.set(r.fx0 + (c.x - r.fx0) * k, Math.sin(k * Math.PI) * 5 + 0.3 * k, r.fz0 + (c.z - r.fz0) * k);
          a.model.rotation.x = k * Math.PI * 4;
          a.anim = "fall";
          if (r.fly >= 1) {
            r.fly = -1;
            a.model.rotation.x = 0;
            a.pos.set(c.x, 0.3, c.z);
            a.yaw = 0;
            a.anim = "lose";
            this.sound("bonk");
            this.fx.dust(a.pos, 8);
          }
        } else {
          a.pos.set(this.cages[r.cage].x, 0.3, this.cages[r.cage].z);
          a.anim = this.ended || this.finished ? "lose" : Math.sin(this.t * 2 + i) > 0.6 ? "stun" : "lose";
          a.face(0, dt, 4);
        }
        a.groundY = 0.3;
        return;
      }
      const p = this.pad(i);
      r.dashCd -= dt;
      if (r.stun > 0) {
        r.stun -= dt;
        r.vx *= Math.exp(-5 * dt);
        r.vz *= Math.exp(-5 * dt);
        a.anim = "stun";
      } else if (r.dashT > 0) {
        r.dashT -= dt;
        a.anim = "jump";
        if (Math.random() < 0.5) this.fx.dust(a.pos, 1);
      } else {
        const l = Math.hypot(p.x, p.y);
        const sx = l > 1 ? p.x / l : p.x,
          sz = l > 1 ? p.y / l : p.y;
        const k = 1 - Math.exp(-12 * dt);
        r.vx += (sx * R_SPEED - r.vx) * k;
        r.vz += (sz * R_SPEED - r.vz) * k;
        if (p.aDown && r.dashCd <= 0) {
          const yaw = l > 0.2 ? Math.atan2(p.x, p.y) : a.yaw;
          r.vx = Math.sin(yaw) * DASH_V;
          r.vz = Math.cos(yaw) * DASH_V;
          r.dashT = DASH_T;
          r.dashCd = DASH_CD;
          this.sound("whoosh");
          this.fx.dust(a.pos, 8);
        }
        const v = Math.hypot(r.vx, r.vz);
        a.anim = v > 0.6 ? "run" : "idle";
        a.speed = clamp(v / R_SPEED, 0, 1);
      }
      r.x += r.vx * dt;
      r.z += r.vz * dt;
      this.collide(r, RR);
      if (Math.hypot(r.vx, r.vz) > 0.5 && r.stun <= 0) a.face(Math.atan2(r.vx, r.vz), dt);
      a.pos.set(r.x, 0, r.z);
      a.groundY = 0;
    });
    // runners bump into each other
    const fr = this.free();
    for (let m = 0; m < fr.length; m++)
      for (let n = m + 1; n < fr.length; n++) {
        const A = fr[m],
          B = fr[n];
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d < RR * 2 && d > 1e-4) {
          const push = (RR * 2 - d) / 2;
          A.x -= (dx / d) * push;
          A.z -= (dz / d) * push;
          B.x += (dx / d) * push;
          B.z += (dz / d) * push;
        }
      }
  }

  private catchRunner(i: number) {
    const r = this.run[i];
    r.caught = true;
    r.fly = 0;
    r.fx0 = r.x;
    r.fz0 = r.z;
    r.cage = this.cages.findIndex((c) => c.used < 0);
    this.cages[r.cage].used = i;
    this.caughtN++;
    this.g.grab = 0.35;
    this.g.vx *= 0.2;
    this.g.vz *= 0.2;
    this.shake = Math.max(this.shake, 0.35);
    this.sound("hit");
    this.sound("boing");
    this.buzz(i, [100, 50, 100]);
    this.buzz(0, 50);
    this.avatars[i].flash();
    this.fx.burst({ x: r.x, y: 1, z: r.z }, { count: 18, colors: ["#ffffff", "#ffd23f", this.players[i].char.color], speed: 6, size: 0.18 });
    this.hud.pop(new THREE.Vector3(r.x, 2.4, r.z), T("Caught!", "抓到了！"), "#ff6a5a", this.camera);
    this.hud.setScore(this.players[i].seat, T("🔒 Caged", "🔒 关进笼子"));
    this.hud.mark(this.players[i].seat, "out");
    this.hud.setScore(this.players[0].seat, `🦖 ${this.caughtN}/3`);
    this.avatars[0].faceTo(r.x, r.z, 1);
  }

  /** Balance stats (headless tests). */
  simInfo() {
    return { caught: this.caughtN, pounds: this.pounds, t: Math.round(this.t) };
  }

  protected outroStep(dt: number) {
    this.water.rotation.z += dt * 0.3;
    const g = this.g;
    const giantWon = this.free().length === 0;
    if (giantWon) {
      // the giant and his full cages in one shot
      const lz = (g.z + HZ + 2.45) / 2;
      this.moveCam([g.x * 0.35, 14, lz + 12], [g.x * 0.45, 1, lz + 0.5], dt, 2);
    }
    else this.moveCam([0, 14, 20], [0, 1, 8], dt, 2);
    this.dangerRing.visible = false;
    this.stepRunnersOutro(dt);
  }
  private stepRunnersOutro(dt: number) {
    for (const c of this.cages) {
      const target = c.used >= 0 ? 0 : -1.6;
      c.door.rotation.y += (target - c.door.rotation.y) * (1 - Math.exp(-12 * dt));
    }
  }
}

const def: MiniDef = {
  id: "le-chasseur",
  name: "The Hunter",
  icon: "🦖",
  color: "#5a3fa0",
  tagline: "The giant must catch the other three in time.",
  rules: "The giant must tag all three runners in 35 s. It's slower but steps over hedges; its stomp (A) stuns those near. Runners: A to sprint.",
  controls: { stick: "Run", a: "Stomp (giant) / Sprint (runners)" },
  modes: ["1v3"],
  length: 35,
  music: "tense",
  create: (ctx) => new LeChasseur(ctx),
};
export default def;
