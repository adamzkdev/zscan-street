/**
 * ROWING RACE (2 vs 2, ~30 s; the Shielded in red, the Transparent in blue): two double sculls race 200 m down an Amsterdam canal,
 * between gabled canal houses, bikes and arched bridges. The cox's drum beats the rhythm: press A
 * on the beat (when the ring closes on the circle). When both rowers of a boat hit the same beat the
 * stroke is powerful (in sync: even more), alone it is weak, and pressing off the beat (or twice)
 * catches a crab and slows the boat. First boat across the line wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { FONT_TITLE, GEO, box, canvasTex, cyl, flat, group, toon } from "../../engine/gfx";
import { clamp, damp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const DIST = 200;
const CAP = 42;
const WIN = 0.17; // half width of the beat window (s)
const IMPULSE = 2.5;
const DRAG = 0.42;
const LANE_Z = [-3.2, 2.8];
const TEAM_COL = ["#ff4b3e", "#2f8dff"];
/** The teams' names, as Z-BALL CUP calls them. */
const teamName = (t: number) => (t === 0 ? T("Shielded", "屏蔽队") : T("Transparent", "透明队"));
const SEAT_X = [-1.1, 1.3]; // stroke seat, bow seat

type Hit = "sync" | "good" | "early" | "late" | "miss" | "crab";
interface Oar {
  piv: THREE.Group;
  side: number;
}
interface Rower {
  i: number;
  boat: number;
  seat: number;
  oars: Oar[];
  strokeT: number; // time since the stroke started (-1: resting)
  fumble: boolean;
  lastBeat: number;
  offset: number;
  lockT: number;
  // CPU
  planBeat: number;
  pressAt: number;
  spamAt: number;
  held: boolean;
}
interface Boat {
  team: number;
  g: THREE.Group;
  hull: THREE.Group;
  x: number;
  v: number;
  rowers: Rower[];
  wake: THREE.Mesh;
  done: boolean;
}

class Aviron extends BaseMini {
  private boats: Boat[] = [];
  private rowers: Rower[] = [];
  private phase = 0.45; // beats (integer = a beat)
  private beat = 0; // index of the last beat that sounded
  private resolved = 0; // beats already scored
  private period = 1.0;
  private water!: THREE.Texture;
  private instanced: THREE.InstancedMesh[] = [];
  private cyclists: { g: THREE.Group; x: number; v: number; z: number; wheels: THREE.Mesh[] }[] = [];
  private metro!: HTMLElement;
  private mRing!: HTMLElement;
  private mCore!: HTMLElement;
  private prog: HTMLElement[] = [];
  private cards: string[] = [];
  private lastHit: (Hit | null)[] = [];
  private hurried = false;
  private winner: number | null = -1;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v3 = new THREE.Vector3();
  private s3 = new THREE.Vector3();

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#6fb4f0", "#f4ecdc"], size: 30, sun: [0.35, 1, 0.75], fog: { color: "#e6e4dc", near: 70, far: 170 } });
    this.buildCanal();
    this.buildTown();
    this.buildBoats();
    const P = this.players;
    this.hud.players([P[0], P[2], P[1], P[3]].filter(Boolean), (p) => this.cardHtml(p.i), { teams: true });
    this.lastHit = this.players.map(() => null);
    this.buildHud();
    this.frameCam(1, 100, true);
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

  // ------------------------------------------------------------ the canal

  private buildCanal() {
    const s = this.scene;
    const X0 = -70,
      X1 = DIST + 90;
    // water
    this.water = canvasTex(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = "#2f7f96";
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 60; i++) {
          const x = Math.random() * w,
            y = Math.random() * h,
            l = 20 + Math.random() * 40;
          g.strokeStyle = `rgba(190,240,255,${0.15 + Math.random() * 0.25})`;
          g.lineWidth = 2 + Math.random() * 2;
          g.beginPath();
          g.moveTo(x, y);
          g.quadraticCurveTo(x + l / 2, y - 5, x + l, y);
          g.stroke();
        }
      },
      true,
    );
    this.water.repeat.set((X1 - X0) / 14, 18 / 14);
    const wm = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.water, color: "#cfefff" }));
    wm.rotation.x = -Math.PI / 2;
    wm.scale.set(X1 - X0, 18, 1);
    wm.position.set((X0 + X1) / 2, -0.05, 0);
    s.add(wm);
    // quay walls (brick) and streets (cobbles)
    const brick = canvasTex(
      128,
      64,
      (g, w, h) => {
        g.fillStyle = "#6a3a2a";
        g.fillRect(0, 0, w, h);
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            g.fillStyle = ["#9a4a32", "#a8553a", "#8a4030"][(x + y * 3) % 3];
            g.fillRect(x * 16 + (y % 2) * 8 + 1, y * 8 + 1, 14, 6);
          }
      },
      true,
    );
    brick.repeat.set((X1 - X0) / 4, 1);
    const cob = canvasTex(
      128,
      128,
      (g, w, h) => {
        g.fillStyle = "#8a8070";
        g.fillRect(0, 0, w, h);
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            g.fillStyle = ["#b0a690", "#a49a84", "#bab09a"][(x * 2 + y) % 3];
            g.beginPath();
            g.roundRect(x * 16 + (y % 2) * 8 + 1, y * 16 + 1, 14, 14, 4);
            g.fill();
          }
      },
      true,
    );
    cob.repeat.set((X1 - X0) / 6, 2);
    const brickMat = new THREE.MeshToonMaterial({ map: brick });
    const cobMat = new THREE.MeshToonMaterial({ map: cob });
    for (const sg of [-1, 1]) {
      const wall = new THREE.Mesh(GEO.box, brickMat);
      wall.scale.set(X1 - X0, 2.4, 0.8);
      wall.position.set((X0 + X1) / 2, 0, sg * 9);
      wall.receiveShadow = true;
      s.add(wall);
      const st = new THREE.Mesh(GEO.box, cobMat);
      st.scale.set(X1 - X0, 0.4, 12);
      st.position.set((X0 + X1) / 2, 1.0, sg * 15.2);
      st.receiveShadow = true;
      s.add(st);
    }
    // lane buoys (instanced)
    const buoys: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    for (let k = 0, x = -4; x <= DIST + 4; x += 4, k++) {
      for (const z of [-7.2, -0.2, 6.6]) {
        buoys.push({ x, y: 0.05, z, sx: 0.2, sy: 0.16, sz: 0.2, c: x > DIST - 20 ? "#ff3b3b" : k % 2 ? "#ffd23f" : "#ff8a1e" });
      }
    }
    this.inst(GEO.sphereLo, toon("#ffffff"), buoys, false);
    // start pontoons
    for (const z of LANE_Z) {
      box(s, "#9a7a52", 1.6, 0.3, 2.2, { x: -6.2, y: 0.1, z });
    }
    // start and finish markers: tall poles with flags, a banner on the finish bridge
    for (const [x, txt, col] of [
      [0, "START", "#ff3b3b"],
      [DIST, "FINISH", "#1d1630"],
    ] as [number, string, string][]) {
      for (const z of [-7.6, 7.6]) {
        cyl(s, "#ffffff", 0.08, 4, { x, y: 2, z, seg: 6 });
        box(s, col, 0.08, 0.8, 1.2, { x, y: 3.6, z: z + 0.6 });
      }
      const line = new THREE.Mesh(GEO.plane, flat(col === "#1d1630" ? "#ffd23f" : "#ffffff", 0.55));
      line.rotation.x = -Math.PI / 2;
      line.scale.set(0.35, 15, 1);
      line.position.set(x, 0.01, 0);
      s.add(line);
      // a sign on the near quay, facing the TV
      const sign = group(s, { x: x === 0 ? 1.5 : x - 1.5, y: 1.2, z: 11 });
      for (const dx of [-1.6, 1.6]) cyl(sign, "#3a3a46", 0.07, 2.2, { x: dx, y: 1.1, seg: 6 });
      this.banner(sign, txt, col, 3.8, 0.95, 1.9);
    }
  }

  private banner(parent: THREE.Object3D, txt: string, col: string, w: number, h: number, y: number) {
    const tex = canvasTex(512, 128, (c, cw, ch) => {
      c.fillStyle = col;
      c.fillRect(0, 0, cw, ch);
      c.font = `84px ${FONT_TITLE}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = col === "#1d1630" ? "#ffd23f" : "#ffffff";
      c.fillText(txt, cw / 2, ch / 2 + 5);
    });
    const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    m.scale.set(w, h, 1);
    m.position.y = y;
    parent.add(m);
    return m;
  }

  private buildTown() {
    const s = this.scene;
    const r = this.rnd;
    // canal houses on the far side: narrow, tall, gabled
    const bodyCols = ["#6a2e22", "#4a2a24", "#7a3a28", "#2e2e34", "#e8dcc8", "#3a4a3a", "#8a4a2e", "#5a3a2e", "#f0e6d2"];
    const bodies: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    const gables: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    const frames: { x: number; y: number; z: number; sx: number; sy: number; sz: number }[] = [];
    const panes: typeof frames = [];
    const doors: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    const beams: typeof frames = [];
    let x = -60;
    while (x < DIST + 80) {
      const w = 4 + r() * 2.2;
      const h = 9 + r() * 5;
      const z = -23 - r() * 0.6;
      const c = bodyCols[Math.floor(r() * bodyCols.length)];
      const cx = x + w / 2;
      bodies.push({ x: cx, y: 1.2 + h / 2, z, sx: w - 0.1, sy: h, sz: 6, c });
      gables.push({ x: cx, y: 1.2 + h + 1.1, z: z + 2.2, sx: w * 0.62, sy: 2.4, sz: 1.2, c });
      beams.push({ x: cx, y: 1.2 + h + 1.9, z: z + 3.0, sx: 0.15, sy: 0.15, sz: 0.9 });
      const cols = w > 5 ? 3 : 2;
      const floors = Math.floor((h - 2) / 2.6);
      for (let f = 0; f < floors; f++)
        for (let k = 0; k < cols; k++) {
          const wx = cx + (k - (cols - 1) / 2) * (w / cols);
          const wy = 1.2 + 2.6 + f * 2.6;
          if (f === 0 && k === 0) continue;
          frames.push({ x: wx, y: wy, z: z + 3.02, sx: 1.0, sy: 1.6, sz: 0.1 });
          panes.push({ x: wx, y: wy - 0.05, z: z + 3.07, sx: 0.75, sy: 1.35, sz: 0.06 });
        }
      doors.push({ x: cx - (cols - 1) / 2 * (w / cols), y: 1.2 + 1.1, z: z + 3.05, sx: 0.9, sy: 2.0, sz: 0.1, c: ["#2a5a3a", "#1d1630", "#6a1e1e", "#2a3a6a"][Math.floor(r() * 4)] });
      x += w;
    }
    this.inst(GEO.box, toon("#ffffff"), bodies);
    // a triangular gable: a 3-sided prism facing the canal
    const gab = new THREE.CylinderGeometry(1, 1, 1, 3, 1);
    gab.rotateX(Math.PI / 2);
    gab.rotateZ(Math.PI / 2);
    gab.rotateZ(-Math.PI / 2);
    this.inst(gab, toon("#ffffff"), gables);
    this.inst(GEO.box, toon("#f4f1ea"), frames, false);
    this.inst(GEO.box, toon("#24344a"), panes, false);
    this.inst(GEO.box, toon("#ffffff"), doors, false);
    this.inst(GEO.box, toon("#f4f1ea"), beams, false);
    // elms along the far quay
    const trunks: { x: number; y: number; z: number; sx: number; sy: number; sz: number }[] = [];
    const leaves: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    for (let tx = -55; tx < DIST + 75; tx += 9 + r() * 4) {
      const z = -11.8;
      trunks.push({ x: tx, y: 1.2 + 1.4, z, sx: 0.22, sy: 2.8, sz: 0.22 });
      const c = ["#4f9a3a", "#5aa844", "#468a34"][Math.floor(r() * 3)];
      leaves.push({ x: tx, y: 1.2 + 3.6, z, sx: 1.7, sy: 1.4, sz: 1.5, c });
      leaves.push({ x: tx + 0.8, y: 1.2 + 4.2, z: z - 0.3, sx: 1.1, sy: 1.0, sz: 1.1, c });
      leaves.push({ x: tx - 0.7, y: 1.2 + 4.3, z: z + 0.2, sx: 1.0, sy: 0.9, sz: 1.0, c });
    }
    this.inst(GEO.cylLo, toon("#6a4a2e"), trunks);
    this.inst(GEO.sphereLo, toon("#ffffff"), leaves);
    // railings along both quays
    const posts: { x: number; y: number; z: number; sx: number; sy: number; sz: number }[] = [];
    for (let px = -60; px < DIST + 80; px += 2.5) for (const z of [-9.6, 9.6]) posts.push({ x: px, y: 1.2 + 0.45, z, sx: 0.06, sy: 0.9, sz: 0.06 });
    this.inst(GEO.cylLo, toon("#1d1d24"), posts, false);
    for (const z of [-9.6, 9.6]) box(s, "#1d1d24", DIST + 140, 0.06, 0.06, { x: DIST / 2 + 10, y: 1.2 + 0.88, z, cast: false });
    // parked bikes (frames + wheels), on both quays
    const wheels: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number }[] = [];
    const bframes: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string; rz?: number }[] = [];
    const bikeCols = ["#1d1d24", "#2f6fd6", "#ff4b3e", "#ffd23f", "#3fcf5a", "#f4f4f4", "#9b5cff"];
    for (let bx = -50; bx < DIST + 70; bx += 1.6 + r() * 4) {
      const z = r() < 0.5 ? -10.3 : 10.3;
      if (r() < 0.35) continue;
      const c = bikeCols[Math.floor(r() * bikeCols.length)];
      for (const dx of [-0.45, 0.45]) wheels.push({ x: bx + dx, y: 1.2 + 0.35, z, sx: 0.34, sy: 0.34, sz: 0.34 });
      bframes.push({ x: bx, y: 1.2 + 0.55, z, sx: 0.9, sy: 0.06, sz: 0.06, c });
      bframes.push({ x: bx - 0.15, y: 1.2 + 0.72, z, sx: 0.06, sy: 0.4, sz: 0.06, c, rz: 0.3 });
      bframes.push({ x: bx + 0.35, y: 1.2 + 0.78, z, sx: 0.06, sy: 0.45, sz: 0.06, c, rz: -0.3 });
      bframes.push({ x: bx - 0.25, y: 1.2 + 0.92, z, sx: 0.28, sy: 0.07, sz: 0.14, c: "#2a2a30" });
    }
    this.inst(GEO.torus, toon("#1d1d24"), wheels, false);
    this.inst(GEO.box, toon("#ffffff"), bframes, false);
    // lamp posts on the near quay
    for (let lx = -40; lx < DIST + 60; lx += 22) {
      const g = group(s, { x: lx, y: 1.2, z: 13.6 });
      cyl(g, "#1d1d24", 0.08, 3.2, { y: 1.6, seg: 6 });
      box(g, "#1d1d24", 0.45, 0.5, 0.45, { y: 3.4 });
      box(g, "#ffe7a0", 0.32, 0.36, 0.32, { y: 3.4, cast: false });
    }
    // flower boxes on the near quay
    const pots: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    const flow: typeof pots = [];
    for (let fx = -40; fx < DIST + 60; fx += 7 + r() * 5) {
      pots.push({ x: fx, y: 1.2 + 0.25, z: 12.6, sx: 1.4, sy: 0.5, sz: 0.5, c: "#8a5a32" });
      for (let k = 0; k < 4; k++) flow.push({ x: fx - 0.5 + k * 0.33, y: 1.2 + 0.6, z: 12.6, sx: 0.17, sy: 0.17, sz: 0.17, c: ["#ff3b6a", "#ffd23f", "#ff7ad9", "#ff6a1e"][(k + Math.floor(fx)) % 4] });
    }
    this.inst(GEO.box, toon("#ffffff"), pots);
    this.inst(GEO.sphereLo, toon("#ffffff"), flow, false);
    // two houseboats moored along the far wall
    for (const hx of [38, 128]) {
      const g = group(s, { x: hx, y: 0, z: -7.6 });
      box(g, "#2a4a5a", 9, 0.8, 1.8, { y: 0.1 });
      box(g, ["#ffd23f", "#3fcf5a"][hx > 100 ? 1 : 0], 6.5, 1.5, 1.6, { y: 1.2 });
      box(g, "#1d1630", 6.8, 0.15, 1.8, { y: 2.0 });
      for (let k = 0; k < 4; k++) box(g, "#bfe0ff", 0.7, 0.6, 0.05, { x: -2.4 + k * 1.6, y: 1.3, z: 0.82, cast: false });
      const pot = new THREE.Mesh(GEO.sphereLo, toon("#ff5a7a"));
      pot.scale.setScalar(0.3);
      pot.position.set(3.6, 0.8, 0);
      g.add(pot);
    }
    // arched bridges across the canal (the last one is the finish)
    for (const bx of [104, DIST + 15]) this.bridge(bx, bx > DIST);
    // cyclists riding along the far street
    for (let k = 0; k < 3; k++) {
      const g = group(s, { y: 1.2, z: -13.5 - k * 0.8 });
      const ws: THREE.Mesh[] = [];
      for (const dx of [-0.45, 0.45]) {
        const w = new THREE.Mesh(GEO.torus, toon("#1d1d24"));
        w.scale.setScalar(0.34);
        w.position.set(dx, 0.35, 0);
        g.add(w);
        ws.push(w);
      }
      box(g, bikeCols[k + 1], 0.9, 0.06, 0.06, { y: 0.55 });
      const bodyC = ["#ff7a3e", "#30c0c0", "#ff5fd2"][k];
      const b = new THREE.Mesh(GEO.capsule, toon(bodyC));
      b.scale.set(0.42, 0.5, 0.42);
      b.position.set(-0.1, 1.15, 0);
      b.rotation.z = -0.2;
      g.add(b);
      const hd = new THREE.Mesh(GEO.sphereLo, toon("#f1c9a0"));
      hd.scale.setScalar(0.22);
      hd.position.set(0, 1.65, 0);
      g.add(hd);
      this.cyclists.push({ g, x: -30 + k * 37, v: 3.5 + k * 0.8, z: -13.5 - k * 0.8, wheels: ws });
    }
  }

  private bridge(bx: number, finish: boolean) {
    const s = this.scene;
    const g = group(s, { x: bx });
    const col = "#9a4a32";
    // deck across the canal (along z) with an arch underneath
    box(g, col, 4.5, 0.9, 20, { y: 3.4 });
    box(g, "#d8c8b0", 4.7, 0.25, 20.2, { y: 3.95 });
    for (const sg of [-1, 1]) {
      // piers on the quays
      box(g, col, 4.5, 3.4, 2.2, { y: 1.7, z: sg * 9.8 });
      // parapets
      box(g, "#d8c8b0", 0.3, 0.8, 20, { x: sg * 2.1, y: 4.4 });
    }
    // the arch ring seen from the side
    const archGeo = new THREE.TorusGeometry(7.2, 0.45, 6, 24, Math.PI);
    for (const dx of [-2.25, 2.25]) {
      const a = new THREE.Mesh(archGeo, toon("#d8c8b0"));
      a.rotation.y = Math.PI / 2;
      a.scale.set(1, 0.38, 1);
      a.position.set(dx, 0.6, 0);
      g.add(a);
    }
    // little lights along the parapet
    for (let z = -9; z <= 9; z += 1.5) {
      const l = new THREE.Mesh(GEO.sphereLo, flat("#fff1b0"));
      l.scale.setScalar(0.1);
      l.position.set(2.3, 4.85, z);
      g.add(l);
    }
    if (finish) {
      // a chequered strip along the deck
      const chk = canvasTex(256, 16, (c, w, h) => {
        for (let k = 0; k < 32; k++) {
          c.fillStyle = k % 2 ? "#111" : "#fff";
          c.fillRect((k * w) / 32, 0, w / 32, h / 2);
          c.fillStyle = k % 2 ? "#fff" : "#111";
          c.fillRect((k * w) / 32, h / 2, w / 32, h / 2);
        }
      });
      const st = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: chk, side: THREE.DoubleSide }));
      st.scale.set(19, 0.5, 1);
      st.rotation.y = Math.PI / 2;
      st.position.set(-2.27, 3.3, 0);
      g.add(st);
    }
  }

  // ------------------------------------------------------------ boats

  private buildBoats() {
    for (let team = 0; team < 2; team++) {
      const z = LANE_Z[team];
      const g = group(this.scene, { x: 0, z });
      const hull = group(g);
      const col = TEAM_COL[team];
      // a long thin shell
      const shell = new THREE.Mesh(GEO.sphere, toon(col));
      shell.scale.set(4.3, 0.32, 0.42);
      shell.position.y = 0.08;
      shell.castShadow = true;
      hull.add(shell);
      box(hull, "#f4f4f4", 6.4, 0.06, 0.5, { y: 0.3, cast: false });
      box(hull, "#1d1d24", 0.6, 0.04, 0.3, { x: 3.6, y: 0.26, cast: false });
      // a little flag at the bow in the team colour
      cyl(hull, "#ffffff", 0.025, 0.6, { x: 4.1, y: 0.55, seg: 4 });
      box(hull, col, 0.02, 0.22, 0.34, { x: 4.1, y: 0.75, z: 0.17 });
      // wake (a soft V of foam behind)
      const wakeTex = canvasTex(128, 64, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, "rgba(255,255,255,0)");
        gr.addColorStop(1, "rgba(255,255,255,0.7)");
        c.strokeStyle = gr;
        c.lineWidth = 6;
        c.beginPath();
        c.moveTo(0, 4);
        c.lineTo(w, h / 2);
        c.lineTo(0, h - 4);
        c.stroke();
      });
      const wake = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, depthWrite: false }));
      wake.rotation.x = -Math.PI / 2;
      wake.scale.set(7, 2.6, 1);
      wake.position.set(-7.5, 0.02, 0);
      g.add(wake);
      const boat: Boat = { team, g, hull, x: 0, v: 0, rowers: [], wake, done: false };
      const members = this.players.filter((p) => p.team === team).map((p) => p.i);
      members.forEach((pi, seat) => {
        const sx = SEAT_X[seat];
        // rigger + seat
        box(hull, "#c8ccd4", 0.08, 0.06, 2.1, { x: sx - 0.35, y: 0.55 });
        box(hull, "#2a2a30", 0.4, 0.08, 0.36, { x: sx, y: 0.36 });
        const a = this.spawn(pi, 0, 0, 0, { blob: false, scale: 0.8 });
        hull.add(a.root);
        a.pos.set(sx, 0.3, 0);
        a.yaw = -Math.PI / 2;
        a.anim = "sit";
        a.root.rotation.order = "YXZ";
        const oars: Oar[] = [];
        for (const side of [-1, 1]) {
          const piv = group(hull, { x: sx - 0.35, y: 0.6, z: side * 1.05 });
          // the loom reaches in toward the rower's hands, the blade far out
          cyl(piv, "#f4f1ea", 0.055, 3.4, { z: side * 1.0, rx: Math.PI / 2, seg: 6 });
          box(piv, col, 0.08, 0.42, 0.8, { z: side * 2.6 });
          oars.push({ piv, side });
        }
        const rw: Rower = { i: pi, boat: team, seat, oars, strokeT: -1, fumble: false, lastBeat: -1, offset: 0, lockT: 0, planBeat: -1, pressAt: Infinity, spamAt: Infinity, held: false };
        boat.rowers.push(rw);
        this.rowers[pi] = rw;
      });
      this.boats.push(boat);
    }
  }

  // ------------------------------------------------------------ HUD

  private buildHud() {
    // the cox's metronome: a ring closing on a circle at each beat
    this.metro = this.hud.add(
      `<div style="position:absolute;left:50%;bottom:calc(var(--u)*2);transform:translateX(-50%);width:calc(var(--u)*13);height:calc(var(--u)*13);display:grid;place-items:center">
        <div class="av-ring" style="position:absolute;inset:0;border-radius:50%;border:calc(var(--u)*0.7) solid #ffd23f"></div>
        <div class="av-core" style="width:calc(var(--u)*7.6);height:calc(var(--u)*7.6);border-radius:50%;background:#1d1630;border:calc(var(--u)*0.5) solid #fff;display:grid;place-items:center;font-family:var(--title);font-size:calc(var(--u)*2.2);color:#fff;box-shadow:0 calc(var(--u)*0.4) 0 rgba(0,0,0,0.3)">A</div>
      </div>`,
    );
    this.mRing = this.metro.querySelector(".av-ring")!;
    this.mCore = this.metro.querySelector(".av-core")!;
    // the race progress at the top
    const boats = [0, 1]
      .map(
        (t) =>
          `<div class="av-b" style="position:absolute;top:${t === 0 ? 8 : 52}%;left:0;transform:translate(-50%,-10%);font-size:calc(var(--u)*2.2);filter:drop-shadow(0 0 calc(var(--u)*0.3) ${TEAM_COL[t]})"><span style="display:inline-block;padding:0 calc(var(--u)*0.5);border-radius:999px;background:${TEAM_COL[t]};color:#fff;font-family:var(--title);font-size:calc(var(--u)*1.5)">🚣</span></div>`,
      )
      .join("");
    const bar = this.hud.add(
      `<div style="position:absolute;left:50%;top:calc(var(--u)*1.6);transform:translateX(-50%);width:calc(var(--u)*46);height:calc(var(--u)*5);border-radius:calc(var(--u)*1.5);background:rgba(20,14,40,0.7);border:calc(var(--u)*0.3) solid #fff">
        <div style="position:absolute;left:calc(var(--u)*2);right:calc(var(--u)*3);top:50%;height:calc(var(--u)*0.4);margin-top:calc(var(--u)*-0.2);background:repeating-linear-gradient(90deg,#fff 0 calc(var(--u)*1),transparent calc(var(--u)*1) calc(var(--u)*2));opacity:0.5"></div>
        <div style="position:absolute;right:calc(var(--u)*0.6);top:50%;transform:translateY(-50%);font-size:calc(var(--u)*2.4)">🏁</div>
        <div class="av-track" style="position:absolute;left:calc(var(--u)*2);right:calc(var(--u)*3);top:0;bottom:0">${boats}</div>
      </div>`,
    );
    this.prog = [...bar.querySelectorAll<HTMLElement>(".av-b")];
  }

  private cardHtml(i: number) {
    const h = this.lastHit[i];
    const map: Record<Hit, [string, string]> = {
      sync: [T("In sync!", "同步！"), "#7dff9a"],
      good: [T("Good", "不错"), "#bfffd0"],
      early: [T("Too early", "太早"), "#ffb02e"],
      late: [T("Too late", "太晚"), "#ffb02e"],
      miss: [T("Missed", "没划到"), "#ff8a7a"],
      crab: [T("Splash!", "扑通！"), "#ff5a4e"],
    };
    if (!h) return `<span style="opacity:0.7;font-size:calc(var(--u)*2)">${T("Ready", "准备")}</span>`;
    return `<span style="color:${map[h][1]};font-size:calc(var(--u)*2)">${map[h][0]}</span>`;
  }

  private setHit(i: number, h: Hit) {
    this.lastHit[i] = h;
    // a trailing space every other time, so the card bumps even for the same word
    const html = this.cardHtml(i) + (this.cards[i]?.endsWith(" ") ? "" : " ");
    this.cards[i] = html;
    this.hud.setScore(this.players[i].seat, html);
  }

  // ------------------------------------------------------------ rhythm

  /** Time of beat k (approximately, from the current phase). */
  private beatTime(k: number) {
    return this.t + (k - this.phase) * this.period;
  }

  // ------------------------------------------------------------ CPU

  protected cpu(i: number, _dt: number): CpuPad {
    const rw = this.rowers[i];
    const lv = this.players[i].level;
    if (!rw || this.boats[rw.boat].done) return {};
    if (rw.held) {
      rw.held = false;
      return {};
    }
    const next = Math.floor(this.phase) + 1;
    if (rw.planBeat < next && this.beatTime(next) - this.t < this.period * 0.8) {
      rw.planBeat = next;
      const sigma = 0.05 + (1 - lv) * 0.17;
      const g = (Math.random() + Math.random() + Math.random() - 1.5) * 1.4 * sigma;
      rw.pressAt = Math.random() < (1 - lv) * 0.07 ? Infinity : this.beatTime(next) + g;
      rw.spamAt = Math.random() < (1 - lv) * 0.025 ? rw.pressAt + 0.3 : Infinity;
    }
    if (this.t >= rw.pressAt) {
      rw.pressAt = Infinity;
      rw.held = true;
      return { a: true };
    }
    if (this.t >= rw.spamAt) {
      rw.spamAt = Infinity;
      rw.held = true;
      return { a: true };
    }
    return {};
  }

  // ------------------------------------------------------------ the race

  start() {
    this.sound("whistle");
    this.hud.banner(T("ROW!", "划！"), { color: "#7dff9a", sub: T("A on the drum, together", "鼓声响时一起按 A"), ms: 1300 });
    music.speed(1.0);
  }

  protected idle(dt: number) {
    this.water.offset.x = (this.water.offset.x + dt * 0.02) % 1;
    for (const b of this.boats) {
      b.hull.position.y = Math.sin(performance.now() / 600 + b.team) * 0.03;
      for (const rw of b.rowers) this.poseRower(rw, dt);
    }
    this.moveCyclists(dt);
    this.mRing.style.transform = "scale(1.6)";
    this.mRing.style.opacity = "0.4";
    this.frameCam(dt, 1.4);
  }

  private moveCyclists(dt: number) {
    for (const c of this.cyclists) {
      c.x += c.v * dt;
      if (c.x > DIST + 60) c.x = -40;
      c.g.position.x = c.x;
      for (const w of c.wheels) w.rotation.z -= (c.v * dt) / 0.34;
      c.g.position.y = 1.2 + Math.abs(Math.sin(c.x * 2)) * 0.02;
    }
  }

  private frameCam(dt: number, rate: number, snap = false) {
    const x0 = this.boats[0]?.x ?? 0,
      x1 = this.boats[1]?.x ?? 0;
    const gap = clamp(Math.abs(x0 - x1), 0, 70);
    const cx = (x0 + x1) / 2 + 1.5;
    const pos: [number, number, number] = [cx - 1, 8.4 + gap * 0.18, 17.5 + gap * 0.42];
    const look: [number, number, number] = [cx, 0.3, -1.2];
    if (snap) this.setCam(pos, look, 44);
    else this.moveCam(pos, look, dt, rate);
  }

  protected step(dt: number) {
    const now = this.t;
    this.water.offset.x = (this.water.offset.x + dt * 0.02) % 1;
    this.moveCyclists(dt);
    // the tempo quickens through the race
    const lead = Math.max(...this.boats.map((b) => b.x));
    this.period = 1.0 - 0.28 * clamp(lead / DIST, 0, 1);
    if (!this.hurried && lead > DIST * 0.7) {
      this.hurried = true;
      this.hud.banner(T("FINAL SPRINT!", "最后冲刺！"), { color: "#ffd23f", sub: T("The beat speeds up", "节奏加快") });
      this.sound("bell");
      music.speed(1.2);
    }
    this.phase += dt / this.period;
    const k = Math.floor(this.phase);
    if (k > this.beat) {
      this.beat = k;
      this.sound("drum");
      this.mCore.animate([{ transform: "scale(1.25)", background: "#ffd23f", color: "#1d1630" }, { transform: "scale(1)", background: "#1d1630", color: "#fff" }], { duration: 260, easing: "ease-out" });
    }
    // the metronome ring
    const fr = this.phase - Math.floor(this.phase); // 0 just after a beat … 1 at the next
    const toNext = (1 - fr) * this.period;
    const sinceLast = fr * this.period;
    const inWin = toNext <= WIN || sinceLast <= WIN;
    this.mRing.style.opacity = "1";
    this.mRing.style.transform = `scale(${0.62 + (1 - fr) * 0.95})`;
    this.mRing.style.borderColor = inWin ? "#7dff9a" : "#ffd23f";
    this.mCore.textContent = inWin ? T("ROW!", "划！") : "A";
    this.mCore.style.fontSize = inWin ? "calc(var(--u)*1.9)" : "calc(var(--u)*2.6)";

    // presses
    for (const rw of this.rowers) {
      if (!rw) continue;
      rw.lockT -= dt;
      const b = this.boats[rw.boat];
      if (b.done) continue;
      if (!this.pad(rw.i).aDown) continue;
      // the beat this press belongs to
      let kk = -1,
        off = 0;
      if (toNext <= WIN) {
        kk = k + 1;
        off = -toNext;
      } else if (sinceLast <= WIN) {
        kk = k;
        off = sinceLast;
      }
      if (kk >= 1 && rw.lastBeat !== kk && rw.lockT <= 0 && kk > this.resolved) {
        rw.lastBeat = kk;
        rw.offset = off;
        rw.strokeT = 0;
        rw.fumble = false;
        this.sound("splash");
      } else {
        // off the beat, or twice: a crab
        rw.strokeT = 0;
        rw.fumble = true;
        rw.lockT = 0.25;
        b.v *= 0.82;
        this.setHit(rw.i, rw.lastBeat === kk ? "crab" : "miss");
        this.sound("wrong");
        this.buzz(rw.i, 80);
        const p = this.bladePos(rw, 1);
        this.fx.burst(p, { count: 10, colors: ["#bfe8ff", "#ffffff"], speed: 3, up: 3, size: 0.13, life: 0.5, shape: "ball", gravity: 12 });
        if (rw.lastBeat !== kk) rw.lastBeat = -1;
      }
    }
    // score each beat once its window has closed
    while (this.resolved < k && sinceLast > WIN) this.resolve(++this.resolved);

    // boats
    for (const b of this.boats) {
      b.v -= b.v * DRAG * dt;
      if (b.done) b.v = damp(b.v, 0, 1.2, dt);
      b.x += b.v * dt;
      b.g.position.x = b.x;
      b.hull.position.y = Math.sin(now * 2.4 + b.team) * 0.025;
      b.hull.rotation.z = -clamp(b.v * 0.004, 0, 0.03);
      (b.wake.material as THREE.MeshBasicMaterial).opacity = clamp(b.v / 6, 0, 1);
      b.wake.scale.set(4 + b.v * 0.6, 2.6, 1);
      b.wake.position.x = -4.2 - (4 + b.v * 0.6) / 2;
      if (b.v > 2 && Math.random() < 0.4) this.fx.burst({ x: b.x - 4.3, y: 0.1, z: LANE_Z[b.team] + (Math.random() - 0.5) * 0.6 }, { count: 1, colors: ["#ffffff", "#d8f4ff"], speed: 0.6, up: 0.6, size: 0.14, life: 0.6, shape: "ball", gravity: 2 });
      for (const rw of b.rowers) this.poseRower(rw, dt);
      if (!b.done && b.x >= DIST) {
        b.done = true;
        this.sound("cheer");
      }
      const k2 = clamp(b.x / DIST, 0, 1);
      this.prog[b.team].style.left = `${k2 * 100}%`;
    }
    this.frameCam(dt, 3);

    // the end
    const left = CAP - now;
    if (left <= 8) this.hud.timer(left);
    const done = this.boats.filter((b) => b.done);
    if (done.length || left <= 0) {
      let w: number | null;
      if (done.length === 1) w = done[0].team;
      else if (done.length === 2) w = this.boats[0].x > this.boats[1].x ? 0 : this.boats[1].x > this.boats[0].x ? 1 : null;
      else w = this.boats[0].x > this.boats[1].x + 0.01 ? 0 : this.boats[1].x > this.boats[0].x + 0.01 ? 1 : null;
      this.winner = w;
      this.hud.timer(null);
      if (w !== null) {
        this.hud.banner(T(`Team ${teamName(w)} wins!`, `${teamName(w)}获胜！`), { color: TEAM_COL[w], size: 7 });
        this.sound("fanfare");
        this.fx.confetti({ x: this.boats[w].x, y: 3, z: LANE_Z[w] }, 70);
      } else this.hud.banner(T("DRAW!", "平局！"), { color: "#ffffff" });
      this.mRing.style.opacity = "0";
      this.finishByTeam(w);
    }
  }

  /** Beat k is over: how well did each boat row it? */
  private resolve(k: number) {
    for (const b of this.boats) {
      if (b.done) continue;
      const on = b.rowers.filter((rw) => rw.lastBeat === k && !rw.fumble);
      const pos = new THREE.Vector3(b.x, 2.6, LANE_Z[b.team]);
      let power = 0;
      if (on.length === b.rowers.length && on.length > 1) {
        const spread = Math.abs(on[0].offset - on[1].offset);
        const sync = spread < 0.075;
        power = sync ? 1.25 : spread < 0.15 ? 1.0 : 0.8;
        for (const rw of on) this.setHit(rw.i, sync ? "sync" : "good");
        if (sync) {
          this.hud.pop(pos, T("In sync!", "同步！"), "#7dff9a", this.camera);
          this.sound("ding");
          this.fx.sparkle({ x: b.x, y: 1.2, z: LANE_Z[b.team] }, "#bfffd0", 12);
        } else this.hud.pop(pos, T("Good!", "不错！"), "#ffffff", this.camera);
      } else if (on.length >= 1) {
        power = b.rowers.length === 1 ? 1.0 : 0.4;
        for (const rw of on) this.setHit(rw.i, Math.abs(rw.offset) < 0.08 ? "good" : rw.offset < 0 ? "early" : "late");
        for (const rw of b.rowers) if (!on.includes(rw) && rw.lastBeat !== k && !rw.fumble) this.setHit(rw.i, "miss");
        if (b.rowers.length > 1) this.hud.pop(pos, T("Off-beat!", "不合拍！"), "#ffb02e", this.camera);
      } else {
        for (const rw of b.rowers) if (rw.lastBeat !== k && rw.strokeT < 0) this.setHit(rw.i, "miss");
      }
      if (power > 0) {
        b.v += IMPULSE * power;
        for (const rw of on) this.buzz(rw.i, 25);
      }
    }
  }

  /** World position of a rower's blade tip (side ±1). */
  private bladePos(rw: Rower, side: number) {
    const b = this.boats[rw.boat];
    return new THREE.Vector3(b.x + SEAT_X[rw.seat] - 0.35, 0.1, LANE_Z[rw.boat] + side * 3.4);
  }

  /** Oars, body and splashes from the stroke clock. */
  private poseRower(rw: Rower, dt: number) {
    const a = this.avatars[rw.i];
    const D = 0.42,
      REC = 0.55;
    let sweep: number, lift: number, lean: number;
    if (rw.strokeT >= 0) {
      const t0 = rw.strokeT;
      rw.strokeT += dt;
      if (t0 < D) {
        // the drive: blades in the water, from the catch (toward the bow) to the finish
        const p = t0 / D;
        sweep = 0.6 - p * 1.2;
        lift = rw.fumble ? -0.34 + Math.sin(p * 30) * 0.08 : -0.22;
        lean = 0.35 - p * 0.65;
        if (t0 === 0) {
          for (const side of [-1, 1]) {
            const bp = this.bladePos(rw, side);
            bp.x += 1.2;
            this.fx.burst(bp, { count: 6, colors: ["#ffffff", "#bfe8ff"], speed: 1.6, up: 2.5, size: 0.12, life: 0.45, shape: "ball", gravity: 10 });
          }
        }
      } else if (t0 < D + REC) {
        // the recovery: blades up, back to the catch
        const p = (t0 - D) / REC;
        sweep = -0.6 + p * 1.2;
        lift = 0.12;
        lean = -0.3 + p * 0.6;
      } else {
        rw.strokeT = -1;
        sweep = 0.6;
        lift = 0.1;
        lean = 0.3;
      }
    } else {
      sweep = 0.6;
      lift = 0.1;
      lean = 0.3;
    }
    for (const o of rw.oars) {
      o.piv.rotation.order = "YXZ";
      o.piv.rotation.y = o.side * sweep;
      o.piv.rotation.x = -o.side * lift;
    }
    a.root.rotation.x = lean;
    a.pos.x = SEAT_X[rw.seat] - lean * 0.4;
  }

  protected outroStep(dt: number) {
    this.water.offset.x = (this.water.offset.x + dt * 0.02) % 1;
    this.moveCyclists(dt);
    for (const b of this.boats) {
      b.v = damp(b.v, 0, 2, dt);
      b.x += b.v * dt;
      b.g.position.x = b.x;
      for (const rw of b.rowers) {
        this.poseRower(rw, dt);
        const a = this.avatars[rw.i];
        if (this.winner === b.team) a.anim = "win";
      }
    }
    const w = this.winner !== null && this.winner >= 0 ? this.boats[this.winner] : null;
    if (w) this.moveCam([w.x - 2, 6.5, LANE_Z[w.team] + 11], [w.x, 0.8, LANE_Z[w.team]], dt, 1.8);
    else this.frameCam(dt, 2);
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
  id: "aviron",
  name: "Rowing Race",
  icon: "🚣",
  color: "#2f9fe0",
  tagline: "Row in time to win the race.",
  rules: "Press A on the drum, when the ring closes on the circle. Both rowers together = a strong stroke. Off-beat or too often slows you!",
  controls: { a: "Row (on the beat)" },
  modes: ["2v2"],
  length: 35,
  music: "amsterdam",
  create: (ctx) => new Aviron(ctx),
};
export default def;
