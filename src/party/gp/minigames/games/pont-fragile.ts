/**
 * PONT FRAGILE (chacun pour soi, 60 s max): a wide bridge of wooden planks and glass panes hangs
 * over a mountain gorge, a river far below. Every tile cracks under the feet (three stages you can
 * see) and gives way once worn out; glass breaks twice as fast. A = a jump over a one-tile gap.
 * The bridge gets eaten up, so where you stand matters. Fall = out; last one standing wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { ball, box, canvasTex, cloud, cone, cyl, group, pine, textSprite, toon } from "../../engine/gfx";
import { clamp, rng } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 60;
const COLS = 11;
const ROWS = 8;
const P = 1.6; // pitch
const TS = 1.5; // tile size
const TH = 0.28;
const HW = (COLS * P) / 2;
const HD = (ROWS * P) / 2;
const RIVER_Y = -30;
const PR = 0.36;
const SPEED = 4.7;
const JUMP_V = 6.6;
const JUMP_H = 5.4;
const GRAV = 22;
const WEAK_AT = 30;
const CRUMBLE_AT = 44;

type TState = "ok" | "fall" | "gone";
interface Tile {
  ix: number;
  iz: number;
  x: number;
  z: number;
  glass: boolean;
  hp: number;
  state: TState;
  y: number;
  vy: number;
  rx: number;
  rz: number;
  sx: number;
  sz: number;
  idx: number;
  stage: number;
  /** Seconds since someone last stood on it (for the wobble). */
  shake: number;
  /** Seconds left before it gives way (-1: nobody has touched it yet). */
  left: number;
  /** Its countdown's length once touched. */
  dur: number;
}

interface Walker {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  air: boolean;
  falling: boolean;
  splashed: boolean;
  out: boolean;
  outT: number;
}

interface Brain {
  target: number;
  next: number;
}

class PontFragile extends BaseMini {
  private tiles: Tile[] = [];
  private ws: Walker[] = [];
  private brains: Brain[] = [];
  private wood!: THREE.InstancedMesh;
  private glass!: THREE.InstancedMesh;
  private crack1!: THREE.InstancedMesh;
  private crack2!: THREE.InstancedMesh;
  private m4 = new THREE.Matrix4();
  private m4b = new THREE.Matrix4();
  private decalOff = new THREE.Matrix4().makeTranslation(0, TH / 2 + 0.012, 0);
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private col = new THREE.Color();
  private white = new THREE.Color("#ffffff");
  private worn = new THREE.Color("#7a6a6a");
  private weak = false;
  private crumble = false;
  private nextCrumble = 0;
  private hurried = false;
  private endT = -1;
  private riverTex!: THREE.Texture;
  private fallTex!: THREE.Texture;
  private birds: { g: THREE.Group; ph: number; r: number }[] = [];
  private ownTex: THREE.Texture[] = [];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#6fb6ff", "#eaf6ff"], size: 13, sun: [0.45, 1, 0.5], fog: { color: "#cfe6f5", near: 38, far: 120 } });
    this.buildGorge();
    this.buildBridge();
    const starts = [
      [-HW + P * 2.5, -HD + P * 1.5],
      [HW - P * 2.5, -HD + P * 1.5],
      [-HW + P * 2.5, HD - P * 1.5],
      [HW - P * 2.5, HD - P * 1.5],
    ];
    this.players.forEach((p, i) => {
      const [x, z] = starts[i];
      const a = this.spawn(i, x, z, 0);
      a.setRing(p.char.color);
      this.ws.push({ x, z, y: 0, vx: 0, vz: 0, vy: 0, air: false, falling: false, splashed: false, out: false, outT: 0 });
      this.brains.push({ target: -1, next: 0 });
    });
    this.hud.players(this.players, () => T("Standing", "站着"));
    this.hud.timer(TIME);
    this.refreshTiles();
    this.setCam([0, 30, 30], [0, -2, 0], 42);
  }

  // ------------------------------------------------------------ the gorge

  private buildGorge() {
    const s = this.scene;
    const R = rng(91);
    // two cliffs, layered rock down to the river
    const strata = ["#8a7a6a", "#9c8a76", "#7a6a5e", "#a8957e"];
    for (const side of [-1, 1]) {
      const g = group(s, { x: side * (HW + 0.6) });
      box(g, "#6cc25a", 40, 1, 140, { x: side * 20, y: -0.55 });
      for (let k = 0; k < 7; k++) {
        const y = -1.05 - k * 4.4;
        for (let q = 0; q < 6; q++) {
          const z = -60 + q * 22 + R() * 4;
          const jut = R() * 1.6;
          box(g, strata[(k + q) % 4], 6 + jut * 2, 4.5, 23, { x: side * (3 - jut), y: y - 2.2, z, cast: false });
        }
      }
      // pines on top
      for (let k = 0; k < 16; k++) {
        const x = side * (2 + R() * 22),
          z = -50 + R() * 64;
        if (Math.abs(z) < HD + 2 && Math.abs(x) < 4) continue;
        pine(g, x, z, 1.4 + R() * 1.2, R() < 0.5 ? "#2f8e57" : "#3a9e5f", -0.05);
      }
    }
    // the river far below
    this.riverTex = canvasTex(
      256,
      256,
      (g, w) => {
        g.fillStyle = "#2f9ad0";
        g.fillRect(0, 0, w, w);
        g.strokeStyle = "rgba(255,255,255,0.45)";
        g.lineWidth = 6;
        g.lineCap = "round";
        for (let i = 0; i < 16; i++) {
          const x = (i * 71) % w,
            y = (i * 113) % w;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 6, y + 40);
          g.stroke();
        }
      },
      true,
    );
    this.riverTex.repeat.set(4, 30);
    this.ownTex.push(this.riverTex);
    const river = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2 + 2, 300), new THREE.MeshToonMaterial({ map: this.riverTex }));
    river.rotation.x = -Math.PI / 2;
    river.position.y = RIVER_Y;
    s.add(river);
    // a waterfall pouring from the left cliff
    this.fallTex = canvasTex(
      64,
      256,
      (g, w, h) => {
        g.fillStyle = "#bfe8ff";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "rgba(255,255,255,0.8)";
        for (let i = 0; i < 20; i++) g.fillRect((i * 13) % w, (i * 37) % h, 4, 40);
      },
      true,
    );
    this.fallTex.repeat.set(2, 3);
    this.ownTex.push(this.fallTex);
    const wf = new THREE.Mesh(new THREE.PlaneGeometry(5, 31), new THREE.MeshBasicMaterial({ map: this.fallTex, transparent: true, opacity: 0.92 }));
    wf.position.set(-HW + 0.4, RIVER_Y + 15, -24);
    wf.rotation.y = Math.PI / 2;
    s.add(wf);
    // mountains far behind
    const mts: [number, number, number][] = [
      [-40, -95, 30],
      [-8, -110, 40],
      [30, -100, 34],
      [62, -90, 26],
      [-70, -85, 24],
    ];
    for (const [x, z, h] of mts) {
      cone(s, "#7a8ab8", h * 0.75, h, { x, y: h / 2 - 6, z, cast: false, receive: false });
      cone(s, "#ffffff", h * 0.27, h * 0.36, { x, y: h - 6 - h * 0.18 + 0.05, z, cast: false, receive: false });
    }
    for (const [x, y, z, k] of [
      [-30, 12, -60, 3],
      [26, 16, -70, 3.6],
      [0, 20, -90, 4],
      [-14, -12, -30, 2.2],
      [12, -16, -40, 2.6],
    ])
      cloud(s, x, y, z, k);
    // birds of prey circling in the gorge
    const wing = new THREE.BoxGeometry(1.2, 0.05, 0.35);
    for (let k = 0; k < 3; k++) {
      const g = group(s);
      ball(g, "#5a4030", [0.2, 0.16, 0.45], { cast: false });
      const wl = new THREE.Mesh(wing, toon("#5a4030"));
      wl.position.x = -0.6;
      const wr = new THREE.Mesh(wing, toon("#5a4030"));
      wr.position.x = 0.6;
      g.add(wl, wr);
      this.birds.push({ g, ph: k * 2.1, r: 7 + k * 3 });
    }
  }

  private buildBridge() {
    const s = this.scene;
    const R = rng(this.ctx.seed + 5);
    const woodTex = canvasTex(256, 256, (g, w) => {
      g.fillStyle = "#4a2e1a";
      g.fillRect(0, 0, w, w);
      const cols = ["#c98a52", "#b97a44", "#d49a62"];
      for (let k = 0; k < 3; k++) {
        g.fillStyle = cols[k];
        g.fillRect(6, 6 + k * 83, w - 12, 76);
        g.strokeStyle = "rgba(90,50,20,0.35)";
        g.lineWidth = 3;
        for (let l = 0; l < 4; l++) {
          g.beginPath();
          const y = 18 + k * 83 + l * 16 + R() * 6;
          g.moveTo(10, y);
          g.bezierCurveTo(80, y + 6, 160, y - 6, w - 10, y + 3);
          g.stroke();
        }
        g.fillStyle = "#3a2a20";
        for (const x of [22, w - 22]) {
          g.beginPath();
          g.arc(x, 44 + k * 83, 6, 0, Math.PI * 2);
          g.fill();
        }
      }
    });
    const glassTex = canvasTex(256, 256, (g, w) => {
      g.fillStyle = "#9fe6ff";
      g.fillRect(0, 0, w, w);
      g.strokeStyle = "#e8fbff";
      g.lineWidth = 14;
      g.strokeRect(7, 7, w - 14, w - 14);
      g.fillStyle = "rgba(255,255,255,0.7)";
      g.beginPath();
      g.moveTo(40, 200);
      g.lineTo(90, 200);
      g.lineTo(200, 50);
      g.lineTo(150, 50);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(110, 210);
      g.lineTo(130, 210);
      g.lineTo(220, 90);
      g.lineTo(200, 90);
      g.closePath();
      g.fill();
    });
    const crackTex = (n: number, len: number) =>
      canvasTex(256, 256, (g, w) => {
        g.clearRect(0, 0, w, w);
        g.strokeStyle = "rgba(30,20,20,0.9)";
        g.lineCap = "round";
        g.lineJoin = "round";
        for (let k = 0; k < n; k++) {
          let x = w / 2 + (R() - 0.5) * 40,
            y = w / 2 + (R() - 0.5) * 40;
          let a = (k / n) * Math.PI * 2 + R() * 0.6;
          g.lineWidth = 7;
          g.beginPath();
          g.moveTo(x, y);
          const steps = 4 + Math.floor(R() * 3);
          for (let q = 0; q < steps; q++) {
            a += (R() - 0.5) * 1.1;
            x += Math.cos(a) * len;
            y += Math.sin(a) * len;
            g.lineTo(x, y);
            g.lineWidth = Math.max(2, 7 - q);
          }
          g.stroke();
        }
      });
    this.ownTex.push(woodTex, glassTex);
    const c1 = crackTex(4, 18),
      c2 = crackTex(9, 26);
    this.ownTex.push(c1, c2);
    const geo = new THREE.BoxGeometry(TS, TH, TS);
    const woodMat = new THREE.MeshToonMaterial({ map: woodTex });
    const sideWood = toon("#8a5a32");
    const glassMat = new THREE.MeshToonMaterial({ map: glassTex, transparent: true, opacity: 0.82 });
    const sideGlass = new THREE.MeshToonMaterial({ color: "#c8f2ff", transparent: true, opacity: 0.82 });
    const n = COLS * ROWS;
    this.wood = new THREE.InstancedMesh(geo, [sideWood, sideWood, woodMat, sideWood, sideWood, sideWood], n);
    this.glass = new THREE.InstancedMesh(geo, [sideGlass, sideGlass, glassMat, sideGlass, sideGlass, sideGlass], n);
    const dgeo = new THREE.PlaneGeometry(TS * 0.98, TS * 0.98);
    dgeo.rotateX(-Math.PI / 2);
    this.crack1 = new THREE.InstancedMesh(dgeo, new THREE.MeshBasicMaterial({ map: c1, transparent: true, depthWrite: false }), n);
    this.crack2 = new THREE.InstancedMesh(dgeo, new THREE.MeshBasicMaterial({ map: c2, transparent: true, depthWrite: false }), n);
    for (const m of [this.wood, this.glass]) {
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
    }
    this.crack1.frustumCulled = this.crack2.frustumCulled = false;
    this.crack1.renderOrder = this.crack2.renderOrder = 2;
    s.add(this.wood, this.glass, this.crack1, this.crack2);
    let nw = 0,
      ng = 0;
    for (let iz = 0; iz < ROWS; iz++)
      for (let ix = 0; ix < COLS; ix++) {
        // glass panes in small clusters
        const gl = R() < 0.24 || (ix > 2 && ix < COLS - 3 && (ix + iz * 3) % 7 === 0);
        const t: Tile = { ix, iz, x: -HW + P / 2 + ix * P, z: -HD + P / 2 + iz * P, glass: gl, hp: 1, state: "ok", y: 0, vy: 0, rx: 0, rz: 0, sx: 0, sz: 0, idx: gl ? ng++ : nw++, stage: 0, shake: 9, left: -1, dur: 2 };
        this.tiles.push(t);
      }
    this.wood.count = nw;
    this.glass.count = ng;
    // the rope net under the tiles (stays when they fall)
    const rope = toon("#4a3424");
    for (let iz = 0; iz <= ROWS; iz++) box(s, rope, HW * 2 + 0.6, 0.09, 0.09, { y: -TH / 2 - 0.02, z: -HD + iz * P, cast: false });
    for (let ix = 0; ix <= COLS; ix++) box(s, rope, 0.09, 0.09, HD * 2 + 0.6, { x: -HW + ix * P, y: -TH / 2 - 0.02, cast: false });
    // railings on the long sides, gates at both ends
    const postGeo = new THREE.CylinderGeometry(0.11, 0.13, 1.4, 8);
    const posts = new THREE.InstancedMesh(postGeo, toon("#6a4428"), (COLS + 1) * 2 + (ROWS + 1) * 2);
    let np = 0;
    const m4 = new THREE.Matrix4();
    for (let ix = 0; ix <= COLS; ix++)
      for (const sz of [-1, 1]) {
        m4.makeTranslation(-HW + ix * P, 0.55, sz * (HD + 0.12));
        posts.setMatrixAt(np++, m4);
      }
    for (let iz = 0; iz <= ROWS; iz++)
      for (const sx of [-1, 1]) {
        m4.makeTranslation(sx * (HW + 0.12), 0.55, -HD + iz * P);
        posts.setMatrixAt(np++, m4);
      }
    posts.castShadow = true;
    s.add(posts);
    for (const sz of [-1, 1])
      for (const y of [0.75, 1.15]) cyl(s, "#d8b87a", 0.05, HW * 2 + 0.3, { y, z: sz * (HD + 0.12), rz: Math.PI / 2, seg: 6, cast: false });
    for (const sx of [-1, 1])
      for (const y of [0.75, 1.15]) cyl(s, "#d8b87a", 0.05, HD * 2 + 0.3, { x: sx * (HW + 0.12), y, rx: Math.PI / 2, seg: 6, cast: false });
    // big gate posts on the cliffs
    for (const sx of [-1, 1]) {
      const g = group(s, { x: sx * (HW + 1.1) });
      for (const sz of [-1, 1]) {
        box(g, "#7a4e2e", 0.6, 3.4, 0.6, { y: 1.2, z: sz * (HD + 0.3) });
        cone(g, "#a33a2a", 0.55, 0.6, { y: 3.2, z: sz * (HD + 0.3), lo: true });
      }
      box(g, "#7a4e2e", 0.4, 0.5, HD * 2 + 1.2, { y: 2.6 });
    }
    const sign = textSprite(T("FRAGILE BRIDGE", "易碎桥"), 0.9, { color: "#fff6d8", bg: "#a33a2a" });
    sign.position.set(-HW - 1.1, 3.3, 0);
    s.add(sign);
  }

  // ------------------------------------------------------------ tiles

  private tileAt(x: number, z: number): Tile | null {
    const ix = Math.floor((x + HW) / P),
      iz = Math.floor((z + HD) / P);
    if (ix < 0 || iz < 0 || ix >= COLS || iz >= ROWS) return null;
    return this.tiles[iz * COLS + ix];
  }
  /** A tile still holding under (x, z)? (a little forgiving near its edges) */
  private floorAt(x: number, z: number, m = 0.1): Tile | null {
    const t = this.tileAt(x, z);
    if (t && t.state === "ok") return t;
    // near an edge: the neighbour might still hold us
    for (const [dx, dz] of [
      [m + PR * 0.4, 0],
      [-m - PR * 0.4, 0],
      [0, m + PR * 0.4],
      [0, -m - PR * 0.4],
    ]) {
      const o = this.tileAt(x + dx, z + dz);
      if (o && o.state === "ok" && Math.abs(x - o.x) <= TS / 2 + m && Math.abs(z - o.z) <= TS / 2 + m) return o;
    }
    return null;
  }

  private breakTile(t: Tile) {
    if (t.state !== "ok") return;
    t.state = "fall";
    t.vy = 0.5;
    t.sx = (this.rnd() - 0.5) * 3;
    t.sz = (this.rnd() - 0.5) * 3;
    const at = { x: t.x, y: 0, z: t.z };
    if (t.glass) {
      this.fx.burst(at, { count: 16, colors: ["#dff8ff", "#9fe6ff", "#ffffff"], speed: 4, up: 2, size: 0.16, life: 0.9, gravity: 14 });
      this.sound("crash");
    } else {
      this.fx.burst(at, { count: 12, colors: ["#c98a52", "#8a5a32", "#e8c08a"], speed: 3.5, up: 2, size: 0.18, life: 0.9, gravity: 14 });
      this.sound("thud");
      this.sound("crash");
    }
  }

  private refreshTiles() {
    for (const t of this.tiles) {
      const mesh = t.glass ? this.glass : this.wood;
      if (t.state === "gone") {
        mesh.setMatrixAt(t.idx, this.zero);
        this.crack1.setMatrixAt(t.iz * COLS + t.ix, this.zero);
        this.crack2.setMatrixAt(t.iz * COLS + t.ix, this.zero);
        continue;
      }
      let wx = 0,
        wz = 0;
      if (t.state === "ok" && t.hp < 0.3) {
        const k = (0.3 - t.hp) * 0.3;
        wx = Math.sin(this.t * 41 + t.x) * k;
        wz = Math.cos(this.t * 37 + t.z) * k;
      }
      this.v.set(t.x + wx, -TH / 2 + t.y - (t.state === "ok" ? (1 - t.hp) * 0.08 : 0), t.z + wz);
      this.e.set(t.rx, 0, t.rz);
      this.q.setFromEuler(this.e);
      this.m4.compose(this.v, this.q, this.one);
      mesh.setMatrixAt(t.idx, this.m4);
      this.col.copy(this.white).lerp(this.worn, (1 - t.hp) * 0.6);
      mesh.setColorAt(t.idx, this.col);
      const k = t.iz * COLS + t.ix;
      this.m4b.multiplyMatrices(this.m4, this.decalOff);
      this.crack1.setMatrixAt(k, t.left >= 0 && t.hp >= 0.45 ? this.m4b : this.zero);
      this.crack2.setMatrixAt(k, t.left >= 0 && t.hp < 0.45 ? this.m4b : this.zero);
    }
    for (const m of [this.wood, this.glass, this.crack1, this.crack2]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------ CPUs

  /** Can we get from (x, z) to tile t: 0 = walk, 1 = needs a jump, -1 = no. */
  private reach(x: number, z: number, t: Tile): number {
    const dx = t.x - x,
      dz = t.z - z;
    const d = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(d / 0.3));
    let gap = 0,
      maxGap = 0,
      gaps = 0;
    for (let k = 1; k <= n; k++) {
      const px = x + (dx * k) / n,
        pz = z + (dz * k) / n;
      const f = this.tileAt(px, pz);
      if (!f || f.state !== "ok") {
        if (gap === 0) gaps++;
        gap += d / n;
        maxGap = Math.max(maxGap, gap);
      } else gap = 0;
    }
    if (maxGap === 0) return 0;
    if (gaps === 1 && maxGap < 2.2) return 1;
    return -1;
  }

  /** How long a tile holds once stepped on (shorter for glass, and once the bridge weakens). */
  private holdFor(t: Tile) {
    return (t.glass ? 1.9 : 3.6) * (this.weak ? 0.7 : 1);
  }
  /** Someone stepped on t: its countdown starts (once). */
  private touch(t: Tile) {
    if (t.state !== "ok" || t.left >= 0) return;
    t.dur = this.holdFor(t);
    t.left = t.dur;
    this.sound(t.glass ? "squeak" : "click");
    this.fx.burst({ x: t.x, y: 0.05, z: t.z }, { count: 5, colors: t.glass ? ["#ffffff", "#bff0ff"] : ["#8a5a32", "#c98a52"], speed: 2, up: 1.5, size: 0.1, life: 0.5 });
  }

  private tileScore(t: Tile) {
    // health, the health around it (room to move), glass is risky
    let around = 0,
      cnt = 0;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const ix = t.ix + dx,
          iz = t.iz + dz;
        if (ix < 0 || iz < 0 || ix >= COLS || iz >= ROWS) continue;
        const o = this.tiles[iz * COLS + ix];
        cnt++;
        if (o.state === "ok") around += (o.left < 0 ? 1 : o.hp * 0.4) * (o.glass ? 0.6 : 1);
      }
    return (t.left < 0 ? 1 : t.hp * 0.3) * (t.glass ? 0.55 : 1) * 2 + (around / Math.max(1, cnt)) * 2.6;
  }

  protected cpu(i: number): CpuPad {
    const me = this.ws[i];
    if (me.out || me.falling) return {};
    const lv = this.players[i].level;
    const b = this.brains[i];
    const here = this.tileAt(me.x, me.z);
    const tgt = b.target >= 0 ? this.tiles[b.target] : null;
    // seconds before a tile gives way if we stay on it
    const ttl = (t: Tile | null) => (!t || t.state !== "ok" ? 0 : t.left < 0 ? this.holdFor(t) : t.left);
    const safety = 0.35 + 0.45 * lv;
    const danger = ttl(here) < safety;
    const invalid = !tgt || ttl(tgt) < 0.4;
    if (invalid || (danger && tgt === here) || this.t >= b.next) {
      // the clever ones stay put (every tile you step on is lost); the others fidget
      b.next = this.t + 0.4 + lv * 1.6 + Math.random() * 0.4;
      let best = -1,
        bestS = -Infinity;
      this.tiles.forEach((t, ti) => {
        const life = ttl(t);
        if (life < 0.4 || (t === here && danger)) return;
        const d = Math.hypot(t.x - me.x, t.z - me.z);
        if (d > P * 3.2) return;
        const r = this.reach(me.x, me.z, t);
        if (r < 0) return;
        let s = this.tileScore(t) + Math.min(life, 3) * 1.2 - d * (0.3 + 0.7 * lv) - r * (1.4 - lv);
        if (t === here) s += 4 * lv;
        for (let j = 0; j < this.ws.length; j++) {
          if (j === i || this.ws[j].out) continue;
          const o = this.ws[j];
          const od = Math.hypot(o.x - t.x, o.z - t.z);
          if (od < 1.8) s -= (1.8 - od) * 1.2;
          if (this.brains[j]?.target === ti) s -= 0.8;
        }
        s += (Math.random() - 0.5) * (1 - lv) * 2.2;
        if (s > bestS) {
          bestS = s;
          best = ti;
        }
      });
      if (best < 0 && danger && here) {
        // nothing good in reach: at least step onto the healthiest neighbour
        let bl = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            const ix = here.ix + dx,
              iz = here.iz + dz;
            if ((!dx && !dz) || ix < 0 || iz < 0 || ix >= COLS || iz >= ROWS) continue;
            const o = this.tiles[iz * COLS + ix];
            if (ttl(o) > bl) {
              bl = ttl(o);
              best = iz * COLS + ix;
            }
          }
      }
      if (best >= 0) b.target = best;
    }
    if (b.target < 0) return {};
    const t = this.tiles[b.target];
    const dx = t.x - me.x,
      dz = t.z - me.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.22) {
      this.cpuReset(i, "hop");
      return {};
    }
    const k = clamp(d / 0.6, 0.35, 1);
    const out: CpuPad = { x: (dx / d) * k, y: (dz / d) * k };
    // a hole right ahead and our tile beyond it: jump (with a reaction time)
    if (!me.air) {
      const look = 0.55 + 0.15 * lv;
      const ax = me.x + (dx / d) * look,
        az = me.z + (dz / d) * look;
      const f = this.tileAt(ax, az);
      if ((!f || f.state !== "ok") && d > 0.7) {
        if (this.cpuAfter(i, "hop", 0.04 + (1 - lv) * 0.22)) {
          out.a = true;
          this.cpuReset(i, "hop");
        }
      } else this.cpuReset(i, "hop");
    }
    return out;
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.animWorld(dt);
    this.refreshTiles();
    this.moveCam([0, 17.5, 14.2], [0, -1.2, 0.9], dt, 1.5);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.animWorld(dt);
    this.moveCam([0, 17.5, 14.2], [0, -1.2, 0.9], dt, 3);

    if (!this.weak && this.t >= WEAK_AT) {
      this.weak = true;
      this.hud.banner(T("THE BRIDGE IS WEAKENING!", "桥变脆了！"), { color: "#ffb02e", ms: 1200, sub: T("Tiles break faster", "地砖碎得更快") });
      this.sound("rumble");
      this.shake = 0.4;
    }
    if (!this.crumble && this.t >= CRUMBLE_AT) {
      this.crumble = true;
      this.hud.banner(T("IT'S COLLAPSING!", "要塌了！"), { color: "#ff5a3d", ms: 1200 });
      this.sound("rumble");
      this.shake = 0.6;
      music.speed(1.15);
    }
    if (!this.hurried && left <= 10) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ffd23f", ms: 1000 });
    }
    // the bridge crumbles by itself at the end: from the edges inward
    if (this.crumble) {
      this.nextCrumble -= dt;
      if (this.nextCrumble <= 0) {
        this.nextCrumble = 0.4;
        const ok = this.tiles.filter((t) => t.state === "ok");
        if (ok.length > 6) {
          ok.sort((a, b) => Math.max(Math.abs(b.x) / HW, Math.abs(b.z) / HD) - Math.max(Math.abs(a.x) / HW, Math.abs(a.z) / HD) + (this.rnd() - 0.5) * 0.5);
          const t = ok.find((o) => o.left < 0);
          if (t) this.touch(t);
        }
      }
    }
    // countdowns
    for (const t of this.tiles) {
      if (t.left < 0 || t.state !== "ok") continue;
      t.left -= dt;
      t.hp = Math.max(0, t.left / t.dur);
      if (t.left <= 0) this.breakTile(t);
    }

    // ---- walkers

    this.ws.forEach((w, i) => {
      const a = this.avatars[i];
      if (w.falling) {
        w.vy -= 30 * dt;
        w.y += w.vy * dt;
        w.x += w.vx * dt;
        w.z += w.vz * dt;
        w.vx *= Math.exp(-1.2 * dt);
        w.vz *= Math.exp(-1.2 * dt);
        a.model.rotation.x += dt * 2.5;
        a.groundY = RIVER_Y;
        a.pos.set(w.x, w.y, w.z);
        if (w.y < RIVER_Y + 0.3 && !w.splashed) {
          w.splashed = true;
          this.fx.splash({ x: w.x, y: RIVER_Y + 0.2, z: w.z });
          this.sound("splash");
          a.setVisible(false);
        }
        return;
      }
      const p = this.pad(i);
      const k = 1 - Math.exp(-(w.air ? 3 : 12) * dt);
      w.vx += (p.x * SPEED - w.vx) * k;
      w.vz += (p.y * SPEED - w.vz) * k;
      if (p.aDown && !w.air) {
        w.air = true;
        w.vy = JUMP_V;
        const l = Math.hypot(p.x, p.y);
        if (l > 0.2) {
          w.vx = (p.x / l) * JUMP_H;
          w.vz = (p.y / l) * JUMP_H;
        }
        this.sound("jump");
        this.fx.dust({ x: w.x, y: 0, z: w.z }, 5);
      }
      if (w.air) {
        w.y += (w.vy - GRAV * dt * 0.5) * dt;
        w.vy -= GRAV * dt;
        if (w.y <= 0) {
          w.y = 0;
          w.vy = 0;
          w.air = false;
          const t = this.floorAt(w.x, w.z);
          if (t) {
            this.touch(t);
            this.fx.dust({ x: w.x, y: 0, z: w.z }, 6, t.glass ? "#dff8ff" : "#e8dcc8");
            this.sound("land");
          }
        }
      }
      w.x = clamp(w.x + w.vx * dt, -HW + PR, HW - PR);
      w.z = clamp(w.z + w.vz * dt, -HD + PR, HD - PR);
      const sp = Math.hypot(w.vx, w.vz);
      if (sp > 0.4) a.face(Math.atan2(w.vx, w.vz), dt);
      a.anim = w.air ? "jump" : sp > 0.5 ? "run" : "idle";
      a.speed = clamp(sp / SPEED, 0, 1);
      if (!w.air) {
        const t = this.floorAt(w.x, w.z);
        if (!t) this.fall(i);
        else {
          t.shake = 0;
          this.touch(t);
        }
      }
      a.groundY = w.falling ? RIVER_Y : 0;
      a.pos.set(w.x, w.y, w.z);
    });
    // bumps
    for (let i = 0; i < this.ws.length; i++)
      for (let j = i + 1; j < this.ws.length; j++) {
        const A = this.ws[i],
          B = this.ws[j];
        if (A.falling || B.falling || A.out || B.out) continue;
        if (Math.abs(A.y - B.y) > 0.9) continue;
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d < PR * 2 && d > 1e-4) {
          const push = (PR * 2 - d) / 2;
          const nx = dx / d,
            nz = dz / d;
          A.x -= nx * push;
          A.z -= nz * push;
          B.x += nx * push;
          B.z += nz * push;
          const rel = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz;
          if (rel > 3 && (A.air || B.air)) {
            B.vx += nx * rel * 0.6;
            B.vz += nz * rel * 0.6;
            this.sound("bonk");
          }
        }
      }

    // ---- falling tiles
    for (const t of this.tiles) {
      if (t.state !== "fall") continue;
      t.vy -= 26 * dt;
      t.y += t.vy * dt;
      t.rx += t.sx * dt;
      t.rz += t.sz * dt;
      if (t.y < RIVER_Y + 1) {
        t.state = "gone";
        if (t.ix % 3 === 0) this.fx.splash({ x: t.x, y: RIVER_Y + 0.2, z: t.z });
      }
    }
    this.refreshTiles();

    // ---- the end
    const alive = this.ws.filter((w) => !w.out).length;
    if ((alive <= 1 || left <= 0) && this.endT < 0) this.endT = this.t;
    if (this.endT >= 0 && (this.t - this.endT > 1.0 || left <= 0)) this.endGame();
  }

  private fall(i: number) {
    const w = this.ws[i];
    if (w.out) return;
    w.out = true;
    w.falling = true;
    w.outT = this.t;
    w.vy = 1;
    const a = this.avatars[i];
    a.anim = "fall";
    a.setRing(null);
    this.hud.mark(this.players[i].seat, "out");
    this.hud.setScore(this.players[i].seat, T("Fell!", "掉下去了！"));
    this.sound("slide");
    this.sound("aww");
    this.buzz(i, [80, 40, 140]);
  }

  private endGame() {
    const place = this.ws.map((w) => 1 + this.ws.filter((o) => (w.out ? !o.out || o.outT > w.outT + 1e-6 : false)).length);
    this.ws.forEach((w, i) => {
      if (!w.out) this.hud.mark(this.players[i].seat, "win");
    });
    this.finish(place);
  }

  private animWorld(dt: number) {
    this.clock += dt;
    this.riverTex.offset.y -= dt * 0.25;
    this.fallTex.offset.y += dt * 1.6;
    for (const b of this.birds) {
      const a = this.clock * 0.35 + b.ph;
      b.g.position.set(Math.cos(a) * b.r, -9 + Math.sin(a * 1.3) * 1.5, Math.sin(a) * b.r * 1.8 - 10);
      b.g.rotation.y = -a;
      const f = Math.sin(this.clock * 4 + b.ph) * 0.3;
      (b.g.children[1] as THREE.Mesh).rotation.z = f;
      (b.g.children[2] as THREE.Mesh).rotation.z = -f;
    }
  }
  private clock = 0;

  protected outroStep(dt: number) {
    const live = this.ws.filter((d) => !d.out);
    if (live.length) {
      const cx = live.reduce((s, d) => s + d.x, 0) / live.length,
        cz = live.reduce((s, d) => s + d.z, 0) / live.length;
      this.moveCam([cx * 0.5, 11, cz + 11.5], [cx, 0.3, cz], dt, 1.5);
    }
    this.animWorld(dt);
    for (const t of this.tiles) {
      if (t.state !== "fall") continue;
      t.vy -= 26 * dt;
      t.y += t.vy * dt;
      t.rx += t.sx * dt;
      t.rz += t.sz * dt;
      if (t.y < RIVER_Y + 1) t.state = "gone";
    }
    this.refreshTiles();
    this.ws.forEach((w, i) => {
      const a = this.avatars[i];
      if (w.falling && !w.splashed) {
        w.vy -= 30 * dt;
        w.y += w.vy * dt;
        a.pos.y = w.y;
        if (w.y < RIVER_Y + 0.3) {
          w.splashed = true;
          this.fx.splash({ x: w.x, y: RIVER_Y + 0.2, z: w.z });
          a.setVisible(false);
        }
      } else if (!w.out) {
        w.vy -= GRAV * dt;
        w.y = Math.max(0, w.y + w.vy * dt);
        a.pos.y = w.y;
        a.face(0, dt, 5);
        if (Math.random() < dt * 1.2) this.fx.confetti({ x: w.x, y: 2.5, z: w.z }, 14);
      }
    });
  }

  dispose() {
    super.dispose();
    for (const t of this.ownTex) t.dispose();
  }
}

const def: MiniDef = {
  id: "pont-fragile",
  name: "Fragile Bridge",
  icon: "🌉",
  color: "#c9a06a",
  tagline: "The tiles crack under your feet…",
  rules: "Every tile you touch cracks, then falls (glass twice as fast). Keep moving and jump the holes with A. Fall = out!",
  controls: { stick: "Walk", a: "Jump a hole" },
  modes: ["ffa"],
  length: 55,
  music: "tense",
  create: (ctx) => new PontFragile(ctx),
};
export default def;
