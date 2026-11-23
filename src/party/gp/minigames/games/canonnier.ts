/**
 * LE CANONNIER (1 contre 3, 40 s): a castle courtyard. The trio runs from the bottom to the castle
 * gate at the top, through crates, hay and low walls. The solo stands on the rampart behind a cannon:
 * the stick moves a target marker, A fires a cannonball that flies for about a second (its shadow
 * grows where it will land), 1 s to reload. A blast knocks a runner back to the start; 2 hits = out.
 * Crates stop the blast (a direct hit smashes them). The trio wins if anyone reaches the gate.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, blobShadow, box, canvasTex, cloud, cone, cyl, flat, group, pine, toon, tree } from "../../engine/gfx";
import { clamp, dist2 } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 40;
const HX = 8; // courtyard half-width
const Z_GATE = -11; // the castle wall's face
const Z_START = 12; // the start line
const Z_END = 13.6; // bottom of the courtyard
const GATE_W = 1.9; // gate half-width
const RR = 0.42;
const R_SPEED = 3.25;
const DASH_V = 11;
const DASH_T = 0.22;
const DASH_CD = 2.0;
const BLAST = 1.9;
const RELOAD = 1.0;
const AIM_SPEED = 11;
const LIVES = 2;
const FLY_BASE = 0.5;
const FLY_PER = 0.03;
const CANNON_X = -2.1;
const MUZZLE = new THREE.Vector3(CANNON_X, 7.0, -11.2);
const CELL = 0.5;
/** CPU runners notice a shell after this fraction of its flight (minus NOTICE_LV × level). */
const NOTICE0 = 0.8;
const NOTICE_LV = 0.42;

interface Obs {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  kind: "crate" | "hay" | "wall" | "cart";
  alive: boolean;
  g: THREE.Object3D;
}
interface Shell {
  m: THREE.Mesh;
  shadow: THREE.Mesh;
  sx: number;
  sz: number;
  tx: number;
  tz: number;
  T: number;
  age: number;
  h: number;
  /** CPU: when each runner notices it (fraction of the flight). */
  notice: number[];
}
interface Runner {
  x: number;
  z: number;
  vx: number;
  vz: number;
  dashT: number;
  dashCd: number;
  lives: number;
  out: boolean;
  /** Flying back after a hit: 0..1 (−1 = not flying). */
  fly: number;
  fx0: number;
  fz0: number;
  fx1: number;
  fz1: number;
  safe: number;
  dirX: number;
  dirZ: number;
  think: number;
  lane: number;
}

// ------------------------------------------------------------------ a navigation grid

const NX = Math.round((2 * HX) / CELL);
const NZ = Math.round((Z_END - Z_GATE) / CELL);
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
const cx = (i: number) => -HX + (i + 0.5) * CELL;
const cz = (j: number) => Z_GATE + (j + 0.5) * CELL;

/** Distance (cells) to the gate over the free cells (Dijkstra). */
function gateField(free: Uint8Array): Float32Array {
  const d = new Float32Array(NX * NZ).fill(1e9);
  const hk: number[] = [],
    hi: number[] = [];
  const push = (k: number, i: number) => {
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
  };
  const pop = (): [number, number] => {
    const top: [number, number] = [hk[0], hi[0]];
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
    return top;
  };
  for (let i = 0; i < NX; i++) {
    if (Math.abs(cx(i)) < GATE_W - 0.5 && free[i]) {
      d[i] = 0;
      push(0, i);
    }
  }
  while (hk.length) {
    const [v, k] = pop();
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
      const nv = v + w;
      if (nv < d[n]) {
        d[n] = nv;
        push(d[n], n);
      }
    }
  }
  return d;
}

class Canonnier extends BaseMini {
  private obs: Obs[] = [];
  private shells: Shell[] = [];
  private run: Runner[] = [];
  private aim = { x: 0, z: 2 };
  private reload = 0;
  private hits = 0;
  private marker!: THREE.Group;
  private markerRing!: THREE.Mesh;
  private markerFill!: THREE.Mesh;
  private cannon!: THREE.Group;
  private barrel!: THREE.Group;
  private recoil = 0;
  private focus = 4.5;
  private glow!: THREE.Mesh;
  private flags: THREE.Object3D[] = [];
  private field: Float32Array = new Float32Array(NX * NZ);
  private freeR = new Uint8Array(NX * NZ);
  private outN = 0;
  private hurried = false;
  private over: "" | "gate" | "out" | "time" = "";
  private overT = 0;
  private winner = -1;
  // CPU (cannon)
  private cTarget = -1;
  private cThink = 0;
  private cErr = { x: 0, z: 0 };

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#5aa8f0", "#ffe9c8"], size: 22, sun: [0.5, 1, 0.65], fog: { near: 55, far: 120 } });
    this.buildCourtyard();
    this.buildCover();
    this.rebuildNav();

    // the gunner on the rampart, next to the cannon
    const ga = this.spawn(0, CANNON_X - 1.3, -12.2, 0);
    ga.pos.y = 6.2;
    ga.groundY = 6.2;
    ga.setRing(this.players[0].char.color);
    for (let k = 1; k < this.players.length; k++) {
      const x = (k - 2) * 4.2;
      const a = this.spawn(k, x, Z_START + 0.6, Math.PI);
      a.setRing(this.players[k].char.color);
      this.run[k] = { x, z: Z_START + 0.6, vx: 0, vz: 0, dashT: 0, dashCd: 0, lives: LIVES, out: false, fly: -1, fx0: 0, fz0: 0, fx1: 0, fz1: 0, safe: 0, dirX: 0, dirZ: -1, think: 0, lane: (k - 2) * 2.5 };
    }
    this.buildMarker();
    this.hud.players(this.players, (p) => (p.team === 0 ? "🎯 0" : this.hearts(LIVES)), { teams: true });
    this.hud.timer(TIME);
    this.setCam([0, 34, 32], [0, 0, 1], 42);
  }

  private hearts(n: number) {
    return n <= 0 ? T("Out", "出局") : "❤️".repeat(n) + "🖤".repeat(LIVES - n);
  }

  // ------------------------------------------------------------ the castle

  private buildCourtyard() {
    const s = this.scene;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), toon("#86c25a"));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.03;
    grass.receiveShadow = true;
    s.add(grass);
    // the cobbled courtyard
    const tex = canvasTex(512, 704, (g, w, h) => {
      g.fillStyle = "#b9ad97";
      g.fillRect(0, 0, w, h);
      const rows = 30;
      const rh = h / rows;
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * 18;
        for (let x = -off; x < w; x += 36) {
          const k = (r * 13 + Math.floor(x / 36) * 7) % 5;
          g.fillStyle = ["#d8ccb4", "#cfc2a8", "#e2d7c0", "#c8bba0", "#d4c8ae"][k];
          g.beginPath();
          g.roundRect(x + 2, r * rh + 2, 32, rh - 4, 6);
          g.fill();
        }
      }
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, Z_END - Z_GATE), new THREE.MeshToonMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.01, (Z_END + Z_GATE) / 2);
    floor.receiveShadow = true;
    s.add(floor);
    // the start: a grass strip with a white line
    const start = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, Z_END - Z_START + 0.4), toon("#9fd46a"));
    start.rotation.x = -Math.PI / 2;
    start.position.set(0, 0.02, (Z_END + Z_START) / 2);
    start.receiveShadow = true;
    s.add(start);
    box(s, flat("#ffffff"), 2 * HX, 0.02, 0.22, { x: 0, y: 0.03, z: Z_START - 0.1, cast: false });
    // the golden path in front of the gate (the goal)
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(GATE_W * 2, 1.6), flat("#ffe14a", 0.55, true));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.set(0, 0.04, Z_GATE + 0.8);
    s.add(this.glow);

    // side walls of the courtyard
    const stone = "#cfc6b4",
      dark = "#a89e8a";
    for (const sx of [-1, 1]) {
      box(s, stone, 1.2, 1.6, Z_END - Z_GATE + 1, { x: sx * (HX + 0.6), y: 0.8, z: (Z_END + Z_GATE) / 2 + 0.5 });
      for (let z = Z_GATE + 0.6; z < Z_END; z += 1.6) box(s, dark, 1.2, 0.45, 0.7, { x: sx * (HX + 0.6), y: 1.82, z });
      // torches
      for (const z of [-6, 0, 6, 11]) {
        const tg = group(s, { x: sx * (HX + 0.05), y: 1.7, z });
        cyl(tg, "#6a4a32", 0.07, 0.6, { y: 0.3, seg: 6 });
        ball(tg, flat("#ffb02e"), 0.15, { y: 0.7, cast: false });
        ball(tg, flat("#fff07a"), 0.08, { y: 0.75, cast: false });
      }
    }

    // the castle wall and its gatehouse
    const W = group(s);
    box(W, stone, 30, 4.6, 2.2, { x: 0, y: 2.3, z: Z_GATE - 1.1 });
    for (let x = -14.5; x <= 14.5; x += 1.4) {
      if (Math.abs(x) < 3.4) continue;
      box(W, dark, 0.8, 0.8, 2.2, { x, y: 5.0, z: Z_GATE - 1.1 });
    }
    // stone courses (lines) on the wall
    for (let y = 1; y < 4.5; y += 1.1) box(W, "#bdb3a0", 30, 0.08, 0.05, { y, z: Z_GATE + 0.02, cast: false });
    // gatehouse
    box(W, "#d8cfbd", 7, 6.2, 3, { x: 0, y: 3.1, z: Z_GATE - 1.3 });
    for (let x = -3.1; x <= 3.1; x += 1.24) box(W, dark, 0.7, 0.8, 3, { x, y: 6.6, z: Z_GATE - 1.3 });
    // the arch: a dark opening and a raised portcullis
    box(W, flat("#2a1e1a"), GATE_W * 2, 3.4, 0.2, { x: 0, y: 1.7, z: Z_GATE + 0.11, cast: false });
    cyl(W, flat("#2a1e1a"), GATE_W, 0.2, { x: 0, y: 3.4, z: Z_GATE + 0.11, rx: Math.PI / 2, seg: 20 });
    for (let x = -GATE_W + 0.3; x < GATE_W; x += 0.55) box(W, "#4a4a56", 0.1, 1.0, 0.1, { x, y: 4.3, z: Z_GATE + 0.3 });
    box(W, "#4a4a56", GATE_W * 2, 0.12, 0.12, { x: 0, y: 3.85, z: Z_GATE + 0.3 });
    // wooden doors swung open
    for (const sx of [-1, 1]) box(W, "#7a4e2c", 0.25, 3.2, 1.6, { x: sx * (GATE_W + 0.15), y: 1.6, z: Z_GATE + 0.9 });
    // towers
    for (const sx of [-1, 1]) {
      const T = group(W, { x: sx * 11, z: Z_GATE - 1.2 });
      cyl(T, stone, 2.4, 8, { y: 4, seg: 18 });
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        box(T, dark, 0.7, 0.8, 0.7, { x: Math.cos(a) * 2.2, y: 8.4, z: Math.sin(a) * 2.2, ry: -a });
      }
      cone(T, sx < 0 ? "#3d6fd0" : "#d84a3e", 2.8, 4, { y: 10.6 });
      cyl(T, "#6a4a32", 0.06, 2, { y: 13.4, seg: 6 });
      const f = box(T, sx < 0 ? "#ffd23f" : "#ffffff", 1.2, 0.7, 0.04, { x: 0.6, y: 14, cast: false });
      this.flags.push(f);
      box(T, flat("#2a1e1a"), 0.5, 0.9, 0.1, { y: 5, z: 2.4, cast: false });
    }
    // banners on the gatehouse
    for (const sx of [-1, 1]) {
      box(W, "#c8323c", 1.1, 2.2, 0.06, { x: sx * 2.6, y: 4.2, z: Z_GATE + 0.22, cast: false });
      ball(W, "#ffd23f", 0.22, { x: sx * 2.6, y: 4.4, z: Z_GATE + 0.28, cast: false });
    }

    // the cannon on top of the gatehouse
    this.cannon = group(s, { x: CANNON_X, y: 6.2, z: Z_GATE - 0.6 });
    box(this.cannon, "#6a4a32", 1.0, 0.45, 1.5, { y: 0.35 });
    for (const sx of [-1, 1]) {
      const wh = cyl(this.cannon, "#4a3424", 0.42, 0.16, { x: sx * 0.58, y: 0.42, rz: Math.PI / 2, seg: 14 });
      wh.castShadow = true;
    }
    this.barrel = group(this.cannon, { y: 0.8 });
    const b = cyl(this.barrel, "#2c2c36", 0.32, 1.9, { z: 0.6, rx: Math.PI / 2, rTop: 0.26, seg: 16 });
    b.castShadow = true;
    ball(this.barrel, "#2c2c36", 0.38, { z: -0.3 });
    cyl(this.barrel, "#3c3c48", 0.34, 0.16, { z: 1.5, rx: Math.PI / 2, seg: 16 });
    // a pile of cannonballs
    for (const [x, y, z] of [
      [-1.6, 0.3, 0.3],
      [-1.9, 0.3, 0.8],
      [-1.3, 0.3, 0.85],
      [-1.6, 0.72, 0.65],
    ])
      ball(this.cannon, "#2c2c36", 0.3, { x, y, z });

    // outside: trees, tents and a village far away
    for (let k = 0; k < 8; k++) {
      tree(s, -HX - 4 - (k % 2) * 3, -6 + k * 3, 1.4 + (k % 3) * 0.2, k % 2 ? "#5cc44f" : "#48b04a");
      tree(s, HX + 4 + (k % 2) * 3, -6 + k * 3, 1.4 + ((k + 1) % 3) * 0.2, k % 2 ? "#48b04a" : "#5cc44f");
    }
    for (let k = 0; k < 10; k++) pine(s, -26 + k * 5.8, Z_GATE - 9 - (k % 2) * 2, 2, "#2f8e52");
    for (const [x, z, c] of [
      [-12.5, 11, "#ff5a4e"],
      [12.5, 11, "#3d8bff"],
    ] as const) {
      const t = group(s, { x, z });
      cone(t, c, 1.8, 2.4, { y: 1.2 });
      cone(t, "#ffffff", 1.82, 0.6, { y: 0.3 });
      cyl(t, "#6a4a32", 0.05, 1, { y: 2.7, seg: 6 });
    }
    for (const [x, y, z, sc] of [
      [-20, 15, -40, 2.4],
      [10, 17, -46, 3],
      [30, 14, -38, 2],
    ])
      cloud(s, x, y, z, sc);
  }

  private buildCover() {
    const rows = [8.8, 5.4, 2.0, -1.4, -4.6, -7.6];
    rows.forEach((z, r) => {
      const xs = r % 2 === 1 ? [-5.2, 0, 5.2] : [-2.7, 2.7];
      for (const x0 of xs) {
        const x = x0 + (this.rnd() - 0.5) * 1.4;
        const roll = this.rnd();
        let kind: Obs["kind"] = roll < 0.45 ? "crate" : roll < 0.7 ? "hay" : roll < 0.88 ? "wall" : "cart";
        if (r === rows.length - 1) kind = this.rnd() < 0.6 ? "wall" : "crate";
        const w = kind === "crate" ? (this.rnd() < 0.5 ? 1.2 : 2.4) : kind === "hay" ? 2.0 : kind === "wall" ? 3.0 : 2.2;
        const d = kind === "wall" ? 0.7 : kind === "cart" ? 1.3 : 1.15;
        this.addObs(kind, x - w / 2, z - d / 2, x + w / 2, z + d / 2);
      }
      // a crate in the wide edge lanes, sometimes
      if (r % 2 === 0 && this.rnd() < 0.6) {
        const sx = this.rnd() < 0.5 ? -1 : 1;
        this.addObs("crate", sx * 6.9 - 0.6, z - 0.58, sx * 6.9 + 0.6, z + 0.58);
      }
    });
  }

  private addObs(kind: Obs["kind"], x0: number, z0: number, x1: number, z1: number) {
    const g = group(this.scene, { x: (x0 + x1) / 2, z: (z0 + z1) / 2 });
    const w = x1 - x0,
      d = z1 - z0;
    if (kind === "crate") {
      for (let k = 0; k < Math.round(w / 1.2); k++) {
        const ox = -w / 2 + 0.6 + k * 1.2;
        box(g, "#c08a4e", 1.12, 1.12, 1.12, { x: ox, y: 0.56 });
        box(g, "#8a5a2e", 1.16, 0.16, 1.16, { x: ox, y: 0.95 });
        box(g, "#8a5a2e", 1.16, 0.16, 1.16, { x: ox, y: 0.17 });
        box(g, "#8a5a2e", 0.14, 1.0, 1.17, { x: ox, y: 0.56, rz: 0.75, cast: false });
      }
    } else if (kind === "hay") {
      for (let k = 0; k < 2; k++) {
        const h = cyl(g, "#ecc65a", 0.55, 0.95, { x: -0.5 + k * 1.0, y: 0.55, rz: Math.PI / 2, seg: 14 });
        h.castShadow = true;
        cyl(g, "#c89a3a", 0.56, 0.06, { x: -0.5 + k * 1.0 - 0.2, y: 0.55, rz: Math.PI / 2, seg: 14 });
        cyl(g, "#c89a3a", 0.56, 0.06, { x: -0.5 + k * 1.0 + 0.2, y: 0.55, rz: Math.PI / 2, seg: 14 });
      }
    } else if (kind === "wall") {
      box(g, "#bfb5a2", w, 1.1, d, { y: 0.55 });
      for (let x = -w / 2 + 0.4; x < w / 2; x += 0.8) box(g, "#d2c9b6", 0.7, 0.3, d + 0.04, { x, y: 1.0 + ((x * 7) % 2 > 1 ? 0.05 : 0), cast: false });
    } else {
      box(g, "#a0683a", w, 0.5, d, { y: 0.75 });
      box(g, "#8a5a2e", w, 0.5, 0.12, { y: 1.2, z: d / 2 - 0.06 });
      box(g, "#8a5a2e", w, 0.5, 0.12, { y: 1.2, z: -d / 2 + 0.06 });
      for (const sx of [-1, 1]) cyl(g, "#4a3424", 0.45, 0.14, { x: sx * (w / 2 - 0.5), y: 0.45, z: d / 2 + 0.05, rx: Math.PI / 2, seg: 12 });
      for (let k = 0; k < 4; k++) ball(g, ["#ff5a4e", "#ffd23f", "#7fd04a", "#ff9a2e"][k], 0.22, { x: -0.6 + k * 0.4, y: 1.15, z: 0 });
    }
    this.obs.push({ x0, z0, x1, z1, kind, alive: true, g });
  }

  private buildMarker() {
    this.marker = group(this.scene);
    this.markerRing = new THREE.Mesh(new THREE.RingGeometry(BLAST - 0.16, BLAST, 48), new THREE.MeshBasicMaterial({ color: "#ff3b3b", transparent: true, opacity: 0.9, depthWrite: false }));
    this.markerRing.rotation.x = -Math.PI / 2;
    this.marker.add(this.markerRing);
    this.markerFill = new THREE.Mesh(GEO.circle, new THREE.MeshBasicMaterial({ color: "#ff3b3b", transparent: true, opacity: 0.25, depthWrite: false }));
    this.markerFill.rotation.x = -Math.PI / 2;
    this.marker.add(this.markerFill);
    const cross = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false });
    for (const r of [0, Math.PI / 2]) {
      const bar = new THREE.Mesh(GEO.box, cross);
      bar.scale.set(BLAST * 0.9, 0.01, 0.1);
      bar.rotation.y = r;
      this.marker.add(bar);
    }
    this.marker.position.set(this.aim.x, 0.06, this.aim.z);
    this.marker.renderOrder = 3;
    this.marker.traverse((o) => (o.renderOrder = 3));
  }

  private rebuildNav() {
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const x = cx(i),
          z = cz(j);
        let ok = Math.abs(x) < HX - RR;
        for (const o of this.obs) {
          if (!o.alive) continue;
          const px = clamp(x, o.x0, o.x1),
            pz = clamp(z, o.z0, o.z1);
          if (Math.hypot(x - px, z - pz) < RR + 0.12) ok = false;
        }
        this.freeR[j * NX + i] = ok ? 1 : 0;
      }
    this.field = gateField(this.freeR);
  }

  // ------------------------------------------------------------ helpers

  private flight(x: number, z: number) {
    return FLY_BASE + FLY_PER * dist2(x, z, MUZZLE.x, MUZZLE.z);
  }

  private collide(r: Runner) {
    for (const o of this.obs) {
      if (!o.alive) continue;
      const px = clamp(r.x, o.x0, o.x1),
        pz = clamp(r.z, o.z0, o.z1);
      const dx = r.x - px,
        dz = r.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < RR) {
        if (d > 1e-5) {
          r.x = px + (dx / d) * RR;
          r.z = pz + (dz / d) * RR;
        } else {
          const m = Math.min(r.x - o.x0, o.x1 - r.x, r.z - o.z0, o.z1 - r.z);
          if (m === r.x - o.x0) r.x = o.x0 - RR;
          else if (m === o.x1 - r.x) r.x = o.x1 + RR;
          else if (m === r.z - o.z0) r.z = o.z0 - RR;
          else r.z = o.z1 + RR;
        }
      }
    }
    r.x = clamp(r.x, -HX + RR, HX - RR);
    if (r.z > Z_END - RR) r.z = Z_END - RR;
    // the wall: the gate is the only opening (reaching it wins, so nobody goes further)
    if (r.z < Z_GATE + RR) {
      if (Math.abs(r.x) > GATE_W - RR) r.z = Z_GATE + RR;
      else r.z = Math.max(r.z, Z_GATE + 0.3);
    }
  }

  /** Does a crate / wall stand between the blast and the runner? */
  private covered(bx: number, bz: number, x: number, z: number) {
    for (const o of this.obs) {
      if (!o.alive) continue;
      // segment vs box (slab test)
      let t0 = 0,
        t1 = 1;
      const dx = x - bx,
        dz = z - bz;
      let ok = true;
      for (const [p, dd, lo, hi] of [
        [bx, dx, o.x0, o.x1],
        [bz, dz, o.z0, o.z1],
      ]) {
        if (Math.abs(dd) < 1e-6) {
          if (p < lo || p > hi) ok = false;
        } else {
          let a = (lo - p) / dd,
            b = (hi - p) / dd;
          if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a);
          t1 = Math.min(t1, b);
          if (t0 > t1) ok = false;
        }
      }
      if (ok && t1 > 0.02 && t0 < 0.98) return true;
    }
    return false;
  }

  private alive() {
    return this.run.filter((r) => r && !r.out);
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, _dt: number): CpuPad {
    const lv = this.players[i].level;
    return i === 0 ? this.cpuGunner(lv) : this.cpuRunner(i, lv);
  }

  private cpuGunner(lv: number): CpuPad {
    const cands = this.run.map((r, k) => ({ r, k })).filter(({ r }) => r && !r.out && r.fly < 0);
    if (!cands.length) return {};
    if (this.t >= this.cThink || !this.run[this.cTarget] || this.run[this.cTarget].out || this.run[this.cTarget].fly >= 0) {
      this.cThink = this.t + 0.6 + Math.random() * 0.6;
      let best = -1,
        bs = -1e9;
      for (const { r, k } of cands) {
        let s = -r.z * (0.6 + 0.6 * lv) - dist2(r.x, r.z, this.aim.x, this.aim.z) * 0.25 + Math.random() * (1 - lv) * 8;
        if (r.safe > 0.4) s -= 8;
        if (r.z < -6) s += 10;
        if (s > bs) {
          bs = s;
          best = k;
        }
      }
      this.cTarget = best;
      const e = Math.pow(1 - lv, 1.5) * 2.6;
      this.cErr = { x: (Math.random() - 0.5) * e, z: (Math.random() - 0.5) * e };
    }
    const r = this.run[this.cTarget];
    const T = this.flight(r.x, r.z);
    const lead = (0.15 + 0.85 * lv) * T;
    const px = clamp(r.x + r.vx * lead + this.cErr.x, -HX, HX),
      pz = clamp(r.z + r.vz * lead + this.cErr.z, Z_GATE + 0.5, Z_END);
    const dx = px - this.aim.x,
      dz = pz - this.aim.z;
    const d = Math.hypot(dx, dz);
    const k = Math.min(1, d / 1.0);
    let a = false;
    if (this.reload <= 0 && d < 0.35 + 0.9 * (1 - lv) && r.safe < 0.3) {
      if (this.cpuAfter(0, "fire", 0.25 - 0.2 * lv)) {
        a = true;
        this.cpuReset(0, "fire");
        this.cThink = Math.min(this.cThink, this.t + 0.2);
      }
    }
    return { x: (dx / (d || 1)) * k, y: (dz / (d || 1)) * k, a };
  }

  private cpuRunner(i: number, lv: number): CpuPad {
    const r = this.run[i];
    if (!r || r.out || r.fly >= 0) return {};
    let a = false;
    // incoming shells I've noticed
    let fx = 0,
      fz = 0,
      danger = false;
    for (const s of this.shells) {
      const k = s.age / s.T;
      if (k < s.notice[i]) continue;
      const d = dist2(r.x, r.z, s.tx, s.tz);
      if (d < BLAST + 0.7) {
        danger = true;
        const w = 1 / Math.max(0.2, d);
        fx += (r.x - s.tx) * w;
        fz += (r.z - s.tz) * w;
        const need = BLAST + 0.4 - d;
        const left = (1 - k) * s.T;
        if (need > R_SPEED * left * 0.85 && r.dashCd <= 0 && this.cpuChance(i, 0.3, 0.9)) a = true;
      }
    }
    if (this.t >= r.think || danger) {
      r.think = this.t + 0.12 + 0.25 * (1 - lv);
      // follow the field toward the gate
      const ci = clamp(Math.floor((r.x + HX) / CELL), 0, NX - 1),
        cj = clamp(Math.floor((r.z - Z_GATE) / CELL), 0, NZ - 1);
      let best = this.field[cj * NX + ci],
        bx = 0,
        bz = -1;
      for (const [di, dj] of D8)
        for (const st of [1, 2]) {
          const a2 = ci + di * st,
            b2 = cj + dj * st;
          if (a2 < 0 || b2 < 0 || a2 >= NX || b2 >= NZ) break;
          const n = b2 * NX + a2;
          if (!this.freeR[n]) break;
          // a little preference for its own lane
          const v = this.field[n] + Math.abs(cx(a2) - r.lane) * 0.05 * (cz(b2) > -6 ? 1 : 0);
          if (v < best) {
            best = v;
            bx = cx(a2) - r.x;
            bz = cz(b2) - r.z;
          }
        }
      let dx = bx,
        dz = bz;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      if (danger) {
        const fl = Math.hypot(fx, fz) || 1;
        dx = (fx / fl) * 1.0 + dx * 0.35;
        dz = (fz / fl) * 1.0 + dz * 0.35;
      }
      // spread out from the others
      for (const o of this.alive()) {
        if (o === r || o.fly >= 0) continue;
        const d = dist2(r.x, r.z, o.x, o.z);
        if (d < 2.4 && d > 0.01) {
          dx += ((r.x - o.x) / d) * 0.4;
          dz += ((r.z - o.z) / d) * 0.4;
        }
      }
      const w = (1 - lv) * 0.4;
      r.dirX = dx + (Math.random() - 0.5) * w;
      r.dirZ = dz + (Math.random() - 0.5) * w;
    }
    // a dash for the final sprint
    if (r.z < Z_GATE + 4 && Math.abs(r.x) < GATE_W + 1 && r.dashCd <= 0 && this.cpuChance(i, 0.02, 0.1)) a = true;
    return { x: r.dirX, y: r.dirZ, a };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.followCam(dt, 1.5, true);
    this.anim(dt);
  }

  start() {
    this.hud.banner(T("CHARGE!", "冲啊！"), { color: "#ffd23f", sub: T("Reach the castle gate", "冲到城门"), ms: 1400 });
    this.hud.tip(T("💣 Cannoneer: aim, <b>A</b> = Fire!   ·   Runners: <b>A</b> = Roll", "💣 炮手：瞄准，<b>A</b> = 开炮！   ·   奔跑者：<b>A</b> = 翻滚"));
  }

  /** The camera follows the action: the start at first, the castle as the runners close in. */
  private followCam(dt: number, rate: number, intro = false) {
    let f = 4.5;
    if (!intro) {
      const zs = this.alive().filter((r) => r.fly < 0).map((r) => r.z);
      const front = zs.length ? Math.min(...zs) : Z_START;
      f = clamp(0.65 * front + 0.35 * this.aim.z, -4.5, 4.5);
    }
    this.focus += (f - this.focus) * (1 - Math.exp(-1.5 * dt));
    this.moveCam([0, 21, this.focus + 17], [0, 0.5, this.focus - 1], dt, rate * 2);
  }

  private anim(dt: number) {
    const k = 0.5 + 0.5 * Math.sin(this.t * 5);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.35 * k;
    for (const [n, f] of this.flags.entries()) f.rotation.y = Math.sin(this.t * 3 + n) * 0.3;
    this.recoil = Math.max(0, this.recoil - dt * 3);
    this.barrel.position.z = -this.recoil * 0.5;
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.followCam(dt, 2);
    this.anim(dt);
    if (this.t > 6) this.hud.tip(null);
    if (!this.hurried && left <= 10 && !this.over) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ff7a5a", size: 6 });
      music.speed(1.15);
      this.sound("bell");
    }
    this.stepGunner(dt);
    this.stepShells(dt);
    this.stepRunners(dt);

    if (this.over) {
      this.overT += dt;
      if (this.overT > 0.8) this.finishByTeam(this.winner);
      return;
    }
    if (this.alive().length === 0) {
      this.over = "out";
      this.winner = 0;
      this.hud.banner(T("ALL KNOCKED OUT!", "全部出局！"), { color: "#ff5a4e", size: 8 });
    } else if (left <= 0) {
      this.over = "time";
      this.winner = 0;
      this.overT = 0.8;
      this.hud.banner(T("THE CASTLE HOLDS!", "城堡守住了！"), { color: "#ffd23f", size: 7 });
    }
  }

  private stepGunner(dt: number) {
    const p = this.pad(0);
    const a = this.avatars[0];
    this.reload -= dt;
    if (!this.over) {
      this.aim.x = clamp(this.aim.x + p.x * AIM_SPEED * dt, -HX + 0.3, HX - 0.3);
      this.aim.z = clamp(this.aim.z + p.y * AIM_SPEED * dt, Z_GATE + 0.4, Z_END - 0.3);
    }
    this.marker.position.set(this.aim.x, 0.06, this.aim.z);
    const ready = this.reload <= 0;
    (this.markerRing.material as THREE.MeshBasicMaterial).color.set(ready ? "#ff3b3b" : "#9a8f8f");
    (this.markerFill.material as THREE.MeshBasicMaterial).color.set(ready ? "#ff3b3b" : "#ffffff");
    this.markerFill.scale.setScalar(ready ? BLAST * (0.92 + 0.08 * Math.sin(this.t * 10)) : BLAST * clamp(1 - this.reload / RELOAD, 0, 1));
    // the cannon follows the marker
    const dx = this.aim.x - this.cannon.position.x,
      dz = this.aim.z - this.cannon.position.z;
    this.cannon.rotation.y = Math.atan2(dx, dz);
    this.barrel.rotation.x = -0.35 - 0.25 * clamp(1 - Math.hypot(dx, dz) / 20, 0, 1);
    a.faceTo(this.aim.x, this.aim.z, dt, 6);
    if (p.aDown && ready && !this.over) this.fire();
    if (a.anim !== "throw" || this.reload < RELOAD - 0.35) a.anim = this.over ? a.anim : "idle";
  }

  private fire() {
    this.reload = RELOAD;
    this.recoil = 1;
    const T = this.flight(this.aim.x, this.aim.z);
    const m = new THREE.Mesh(GEO.sphere, toon("#2a2a34"));
    m.scale.setScalar(0.42);
    m.castShadow = true;
    const shadow = blobShadow(BLAST * 0.8, 0);
    shadow.position.set(this.aim.x, 0.05, this.aim.z);
    this.scene.add(m, shadow);
    const notice = this.players.map((p, i) => (i === 0 ? 1 : clamp(NOTICE0 - NOTICE_LV * p.level + (Math.random() - 0.5) * 0.2, 0.1, 0.95)));
    const h = 3 + dist2(this.aim.x, this.aim.z, MUZZLE.x, MUZZLE.z) * 0.22;
    this.shells.push({ m, shadow, sx: MUZZLE.x, sz: MUZZLE.z, tx: this.aim.x, tz: this.aim.z, T, age: 0, h, notice });
    this.sound("shoot");
    this.sound("thud");
    this.shake = Math.max(this.shake, 0.2);
    this.buzz(0, 40);
    this.avatars[0].anim = "throw";
    // smoke and flash at the muzzle
    const yaw = this.cannon.rotation.y;
    const mx = this.cannon.position.x + Math.sin(yaw) * 1.6,
      mz = this.cannon.position.z + Math.cos(yaw) * 1.6;
    this.fx.burst({ x: mx, y: 7.3, z: mz }, { count: 10, colors: ["#ffe14a", "#ff9a2e"], speed: 4, up: 1, gravity: 0, size: 0.3, sizeEnd: 0, life: 0.25, shape: "ball", drag: 4 });
    this.fx.burst({ x: mx, y: 7.3, z: mz }, { count: 12, colors: ["#d8d4e0", "#a8a4b4"], speed: 2.5, up: 2, gravity: -1, size: 0.4, sizeEnd: 0.1, life: 1.0, shape: "ball", drag: 2 });
  }

  private stepShells(dt: number) {
    for (const s of this.shells) {
      s.age += dt;
      const k = clamp(s.age / s.T, 0, 1);
      const x = s.sx + (s.tx - s.sx) * k,
        z = s.sz + (s.tz - s.sz) * k;
      const y = MUZZLE.y * (1 - k) + 0.4 * k + s.h * 4 * k * (1 - k);
      s.m.position.set(x, y, z);
      s.m.rotation.x += dt * 8;
      // the shadow grows as it falls
      s.shadow.scale.set(0.25 + 1.55 * k * k, 0.25 + 1.55 * k * k, 1);
      (s.shadow.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.55 * k;
      if (k >= 1) this.impact(s);
    }
    this.shells = this.shells.filter((s) => s.age < s.T);
  }

  private impact(s: Shell) {
    s.m.removeFromParent();
    s.shadow.removeFromParent();
    (s.shadow.material as THREE.Material).dispose();
    const at = { x: s.tx, y: 0.4, z: s.tz };
    this.fx.explosion(at, 2.4);
    this.fx.burst(at, { count: 14, colors: ["#b9ad97", "#8a8070"], speed: 6, up: 5, gravity: 14, size: 0.18, life: 0.8, shape: "cube" });
    this.sound("explode");
    this.shake = Math.max(this.shake, 0.45);
    // smash the crates / hay it lands on
    let smashed = false;
    for (const o of this.obs) {
      if (!o.alive || (o.kind !== "crate" && o.kind !== "hay")) continue;
      const px = clamp(s.tx, o.x0, o.x1),
        pz = clamp(s.tz, o.z0, o.z1);
      if (Math.hypot(s.tx - px, s.tz - pz) < 0.45) {
        o.alive = false;
        smashed = true;
        o.g.visible = false;
        const c = { x: (o.x0 + o.x1) / 2, y: 0.6, z: (o.z0 + o.z1) / 2 };
        this.fx.burst(c, { count: 22, colors: o.kind === "crate" ? ["#c08a4e", "#8a5a2e"] : ["#ecc65a", "#c89a3a"], speed: 7, up: 6, gravity: 16, size: 0.22, life: 1.0, shape: o.kind === "crate" ? "cube" : "flake" });
      }
    }
    if (smashed) {
      this.sound("crash");
      this.rebuildNav();
    }
    // the runners in the blast
    if (this.over) return;
    this.run.forEach((r, i) => {
      if (!r || r.out || r.fly >= 0 || r.safe > 0) return;
      const d = dist2(r.x, r.z, s.tx, s.tz);
      if (d < BLAST && !this.covered(s.tx, s.tz, r.x, r.z)) this.hitRunner(i, s.tx, s.tz);
    });
  }

  private hitRunner(i: number, bx: number, bz: number) {
    const r = this.run[i];
    r.lives--;
    this.hits++;
    this.hud.setScore(this.players[0].seat, `🎯 ${this.hits}`);
    this.hud.setScore(this.players[i].seat, this.hearts(r.lives));
    this.avatars[i].flash();
    this.buzz(i, [120, 60, 120]);
    this.buzz(0, 60);
    this.sound("bonk");
    this.hud.pop(new THREE.Vector3(r.x, 2.4, r.z), r.lives > 0 ? T("Boom!", "轰！") : T("Out!", "出局！"), "#ff6a5a", this.camera);
    r.fly = 0;
    r.fx0 = r.x;
    r.fz0 = r.z;
    r.dashT = 0;
    r.vx = r.vz = 0;
    if (r.lives <= 0) {
      r.out = true;
      this.outN++;
      r.fx1 = -HX - 2.6;
      r.fz1 = 4.5 + this.outN * 1.5;
      this.hud.mark(this.players[i].seat, "out");
    } else {
      r.fx1 = clamp(r.x + (r.x - bx) * 0.3, -HX + 1, HX - 1);
      r.fz1 = Z_START + 0.7;
    }
    void bz;
  }

  private stepRunners(dt: number) {
    this.run.forEach((r, i) => {
      if (!r) return;
      const a = this.avatars[i];
      if (r.fly >= 0) {
        r.fly += dt / 1.1;
        const k = Math.min(1, r.fly);
        r.x = r.fx0 + (r.fx1 - r.fx0) * k;
        r.z = r.fz0 + (r.fz1 - r.fz0) * k;
        a.pos.set(r.x, Math.sin(k * Math.PI) * 5, r.z);
        a.model.rotation.x = -k * Math.PI * 4;
        a.anim = "fall";
        a.groundY = 0;
        if (r.fly >= 1) {
          r.fly = -1;
          a.model.rotation.x = 0;
          a.pos.y = 0;
          this.fx.dust(a.pos, 8);
          this.sound("land");
          if (!r.out) r.safe = 1.2;
          else a.yaw = Math.PI / 2;
        }
        return;
      }
      if (r.out) {
        a.anim = "sit";
        a.pos.set(r.x, 0, r.z);
        a.face(Math.PI / 2, dt, 4);
        return;
      }
      const p = this.pad(i);
      r.dashCd -= dt;
      r.safe -= dt;
      a.root.visible = r.safe > 0 ? Math.floor(this.t * 12) % 2 === 0 : true;
      if (this.over) {
        r.vx *= Math.exp(-8 * dt);
        r.vz *= Math.exp(-8 * dt);
      } else if (r.dashT > 0) {
        r.dashT -= dt;
        a.anim = "jump";
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
      this.collide(r);
      if (Math.hypot(r.vx, r.vz) > 0.5) a.face(Math.atan2(r.vx, r.vz), dt);
      a.pos.set(r.x, 0, r.z);
      // through the gate!
      if (!this.over && r.z < Z_GATE + 0.45 && Math.abs(r.x) < GATE_W - 0.2) {
        this.over = "gate";
        this.winner = 1;
        this.hud.banner(T("INTO THE CASTLE!", "冲进城堡！"), { color: "#5fd0ff", size: 8, sub: T(`${this.players[i].name} made it through the gate`, `${this.players[i].name} 冲过了城门`) });
        this.sound("fanfare");
        this.fx.confetti({ x: r.x, y: 2, z: r.z });
        this.buzz(i, 200);
      }
    });
    // bumps between runners
    const al = this.alive().filter((r) => r.fly < 0);
    for (let m = 0; m < al.length; m++)
      for (let n = m + 1; n < al.length; n++) {
        const A = al[m],
          B = al[n];
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

  /** Balance stats (headless tests). */
  simInfo() {
    return { hits: this.hits, out: this.outN, over: this.over, t: Math.round(this.t) };
  }

  protected outroStep(dt: number) {
    this.anim(dt);
    this.marker.visible = false;
    for (const s of this.shells) {
      s.m.visible = false;
      s.shadow.visible = false;
    }
    if (this.winner === 1) this.moveCam([0, 7.5, Z_GATE + 9], [0, 1.6, Z_GATE + 0.5], dt, 2);
    else this.moveCam([CANNON_X, 9.5, -2], [CANNON_X - 0.6, 6.5, Z_GATE - 1], dt, 2);
    this.run.forEach((r, i) => {
      if (r) this.avatars[i].root.visible = true;
    });
  }
}

const def: MiniDef = {
  id: "canonnier",
  name: "The Cannoneer",
  icon: "💣",
  color: "#4a4a5a",
  tagline: "One cannoneer against three runners.",
  rules: "Runners must reach the castle gate in 40 s. The cannoneer aims and fires (A): one hit sends back to the start, two knock out. Crates shield the blast.",
  controls: { stick: "Run / Aim", a: "Roll / Fire!" },
  modes: ["1v3"],
  length: 40,
  music: "tense",
  create: (ctx) => new Canonnier(ctx),
};
export default def;
