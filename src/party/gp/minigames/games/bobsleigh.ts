/**
 * BOBSLEIGH (2 vs 2, ~35 s; the Shielded in red, the Transparent in blue): two bobsleds race down twin ice channels at sunset.
 * The start: both teammates mash A to push the sled. Then six bends come: an arrow shows which way
 * and turns green at the right moment; both teammates must lean (stick) that way in the window.
 * Both right = speed boost (more if in sync), one wrong / early / late = scrape, both wrong = big wobble.
 * First team across the line wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { FONT_TITLE, GEO, box, canvasTex, cyl, flat, group, toon } from "../../engine/gfx";
import { portrait } from "../../engine/chars3d";
import { clamp, damp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const DS = 0.5; // sample spacing
const SLOPE = 0.11;
const LANE = 2.6; // channel centre offset
const CHW = 1.4; // channel half width
const PUSH_LEN = 16; // the push zone
const VTERM = 14;
const CAP = 55;
const PROMPT_T = 1.7; // the arrow shows this long before the bend
const WIN_OPEN = 0.6;
const WIN_CLOSE = -0.32;
const TEAM_COL = ["#ff4b3e", "#2f8dff"];
/** The teams' names, as Z-BALL CUP calls them. */
const teamName = (t: number) => (t === 0 ? T("Shielded", "屏蔽队") : T("Transparent", "透明队"));

type Verdict = "good" | "early" | "late" | "wrong";
interface Bend {
  s0: number;
  len: number;
  dir: number; // +1 right, -1 left
}
interface Sled {
  team: number;
  members: number[];
  g: THREE.Group;
  roll: THREE.Group;
  s: number;
  v: number;
  pushing: boolean;
  bend: number; // index of the next bend to judge
  shown: boolean;
  commits: (null | { v: Verdict; t: number })[];
  wobT: number;
  scrapeT: number;
  scrapeSide: number;
  sway: number;
  done: boolean;
  // HUD
  panel: HTMLElement;
  arrow: HTMLElement;
  ring: HTMLElement;
  slots: HTMLElement[];
  speedEl: HTMLElement;
  // CPU plans per member: when (τ) and which way they lean
  plan: { tau: number; dir: number; hold: number }[];
}

class Bobsleigh extends BaseMini {
  private px: number[] = [];
  private py: number[] = [];
  private pz: number[] = [];
  private th: number[] = [];
  private END = 0;
  private bends: Bend[] = [];
  private sleds: Sled[] = [];
  private instanced: THREE.InstancedMesh[] = [];
  private cards: string[] = [];
  private flagMeshes: THREE.Mesh[] = [];
  private winner: number | null = -1;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v3 = new THREE.Vector3();
  private s3 = new THREE.Vector3();
  private camS = 0;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#2c4a9a", "#ffb98a"], size: 30, sun: [-0.6, 0.55, -0.6], sunColor: "#ffd2a8", sunIntensity: 2.3, fog: { color: "#f3c3a8", near: 60, far: 170 }, hemi: ["#c8d4ff", "#8a7a9a", 1.5] });
    this.layTrack();
    this.buildTrack();
    this.buildWorld();
    this.buildSleds();
    // cards: team red on the left, team blue on the right
    const P = this.players;
    this.hud.players([P[0], P[2], P[1], P[3]].filter(Boolean), (p) => this.cardHtml(p.i), { teams: true });
    this.buildPanels();
    this.frameCam(1, 100, true);
  }

  // ------------------------------------------------------------ the track

  private layTrack() {
    const r = this.rnd;
    const segs: { len: number; turn: number }[] = [{ len: 52, turn: 0 }];
    let heading = 0;
    let lastDir = r() < 0.5 ? -1 : 1;
    for (let c = 0; c < 6; c++) {
      let dir = r() < 0.65 ? -lastDir : lastDir;
      const ang = 0.85 + r() * 0.35;
      if (Math.abs(heading + dir * ang) > 1.5) dir = -dir;
      heading += dir * ang;
      lastDir = dir;
      const len = ang * 23;
      segs.push({ len, turn: dir * ang });
      segs.push({ len: c === 5 ? 70 : 40 + r() * 12, turn: 0 });
    }
    let x = 0,
      y = 0,
      z = 0,
      t = 0,
      s = 0;
    for (const sg of segs) {
      if (sg.turn) this.bends.push({ s0: s, len: sg.len, dir: Math.sign(sg.turn) });
      const n = Math.round(sg.len / DS);
      const dt = sg.turn / n;
      for (let k = 0; k < n; k++) {
        this.px.push(x);
        this.py.push(y);
        this.pz.push(z);
        this.th.push(t);
        t += dt * 0.5;
        x += Math.sin(t) * DS;
        z -= Math.cos(t) * DS;
        t += dt * 0.5;
        y -= SLOPE * DS;
        s += DS;
      }
    }
    this.px.push(x);
    this.py.push(y);
    this.pz.push(z);
    this.th.push(t);
    this.END = s - 18;
  }

  /** Point on the centre line at distance s (extrapolated past the ends). */
  private at(s: number) {
    const n = this.px.length;
    const f = s / DS;
    const i = clamp(Math.floor(f), 0, n - 2);
    const k = f - i;
    const th = this.th[i] + (this.th[i + 1] - this.th[i]) * clamp(k, 0, 1);
    let x = this.px[i] + (this.px[i + 1] - this.px[i]) * k;
    let y = this.py[i] + (this.py[i + 1] - this.py[i]) * k;
    let z = this.pz[i] + (this.pz[i + 1] - this.pz[i]) * k;
    if (f < 0) {
      x = this.px[0] + Math.sin(this.th[0]) * s;
      z = this.pz[0] - Math.cos(this.th[0]) * s;
      y = -SLOPE * s;
    }
    return { x, y, z, th, rx: Math.cos(th), rz: Math.sin(th) };
  }

  private inst(geo: THREE.BufferGeometry, mat: THREE.Material, list: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; c?: string }[], cast = true) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    const col = new THREE.Color();
    list.forEach((o, i) => {
      this.q.setFromEuler(this.e.set(0, o.ry ?? 0, 0));
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

  private buildTrack() {
    // the cross-section: [lateral, height, colour] (duplicates make crisp colour edges)
    const ICE = "#dcf2ff",
      WALL = "#ffffff",
      TOP = "#2f6fd6",
      MID = "#f4f8ff";
    const prof: [number, number, string][] = [
      [-4.9, 1.05, TOP],
      [-4.35, 1.05, TOP],
      [-4.35, 1.05, WALL],
      [-4.12, 0.35, WALL],
      [-4.0, 0.0, ICE],
      [-1.2, 0.0, ICE],
      [-1.2, 0.0, MID],
      [-0.95, 0.7, MID],
      [-0.95, 0.7, TEAM_COL[0]],
      [-0.35, 0.76, TEAM_COL[0]],
      [-0.35, 0.76, "#ffffff"],
      [0.35, 0.76, "#ffffff"],
      [0.35, 0.76, TEAM_COL[1]],
      [0.95, 0.7, TEAM_COL[1]],
      [0.95, 0.7, MID],
      [1.2, 0.0, MID],
      [1.2, 0.0, ICE],
      [4.0, 0.0, ICE],
      [4.12, 0.35, WALL],
      [4.35, 1.05, WALL],
      [4.35, 1.05, TOP],
      [4.9, 1.05, TOP],
      [4.9, 1.05, "#c8d4e8"],
      [5.0, -0.6, "#c8d4e8"],
    ];
    const left: [number, number, string] = [-5.0, -0.6, "#c8d4e8"];
    prof.unshift(left, [-4.9, 1.05, "#c8d4e8"]);
    const n = this.px.length;
    const P = prof.length;
    const pos = new Float32Array(n * P * 3);
    const col = new Float32Array(n * P * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const rx = Math.cos(this.th[i]),
        rz = Math.sin(this.th[i]);
      // inside a bend the outer wall rises a little
      let bank = 0;
      for (const b of this.bends) {
        const s = i * DS;
        if (s > b.s0 - 4 && s < b.s0 + b.len + 4) bank = b.dir * Math.sin(clamp((s - b.s0 + 4) / (b.len + 8), 0, 1) * Math.PI);
      }
      prof.forEach(([u, h, cc], j) => {
        const outer = Math.abs(u) > 4 && h > 0.3 && Math.sign(u) !== Math.sign(bank) && bank !== 0 ? Math.abs(bank) * 0.6 : 0;
        const k = i * P + j;
        pos.set([this.px[i] + rx * u, this.py[i] + h + outer, this.pz[i] + rz * u], k * 3);
        c.set(cc);
        col.set([c.r, c.g, c.b], k * 3);
      });
    }
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < P - 1; j++) {
        const a = i * P + j,
          b = a + 1,
          cc = a + P,
          d = cc + 1;
        idx.push(a, cc, b, b, cc, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    m.castShadow = true;
    this.scene.add(m);
    // ice sheen streaks on both channel floors
    const sheen = canvasTex(
      64,
      256,
      (g, w, h) => {
        g.clearRect(0, 0, w, h);
        for (let i = 0; i < 18; i++) {
          g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.35})`;
          g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 30 + Math.random() * 60);
        }
      },
      true,
    );
    const sm = new THREE.MeshBasicMaterial({ map: sheen, transparent: true, depthWrite: false });
    for (const lane of [-LANE, LANE]) {
      const p2 = new Float32Array(n * 6),
        uv = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const rx = Math.cos(this.th[i]),
          rz = Math.sin(this.th[i]);
        p2.set([this.px[i] + rx * (lane - 1.2), this.py[i] + 0.02, this.pz[i] + rz * (lane - 1.2), this.px[i] + rx * (lane + 1.2), this.py[i] + 0.02, this.pz[i] + rz * (lane + 1.2)], i * 6);
        uv.set([0, (i * DS) / 8, 1, (i * DS) / 8], i * 4);
      }
      const ix: number[] = [];
      for (let i = 0; i < n - 1; i++) ix.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
      const g2 = new THREE.BufferGeometry();
      g2.setIndex(ix);
      g2.setAttribute("position", new THREE.BufferAttribute(p2, 3));
      g2.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      const mm = new THREE.Mesh(g2, sm);
      mm.renderOrder = 1;
      this.scene.add(mm);
    }
    // the start and finish lines + arches
    this.arch(0, "START", "#ff3b3b");
    this.arch(this.END, "FINISH", "#1d1630");
    for (const s of [0, this.END]) {
      const a = this.at(s);
      for (const lane of [-LANE, LANE]) {
        const ln = new THREE.Mesh(GEO.plane, flat(s ? "#1d1630" : "#ff3b3b"));
        ln.rotation.order = "YXZ";
        ln.rotation.set(-Math.PI / 2, Math.PI - a.th, 0);
        ln.scale.set(2.6, 0.35, 1);
        ln.position.set(a.x + a.rx * lane, a.y + 0.03, a.z + a.rz * lane);
        this.scene.add(ln);
      }
    }
  }

  private arch(s: number, text: string, color: string) {
    const a = this.at(s);
    const g = group(this.scene, { x: a.x, y: a.y, z: a.z, ry: -a.th });
    for (const sg of [-1, 1]) box(g, "#3a3f4c", 0.5, 7.6, 0.5, { x: sg * 5.4, y: 3.8 });
    box(g, color, 11.4, 1.3, 0.5, { y: 7.4 });
    const tex = canvasTex(1024, 128, (c, w, h) => {
      c.fillStyle = color;
      c.fillRect(0, 0, w, h);
      c.font = `92px ${FONT_TITLE}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = color === "#1d1630" ? "#ffd23f" : "#ffffff";
      c.fillText(text, w / 2, h / 2 + 5);
    });
    const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    m.scale.set(10.8, 1.35, 1);
    m.position.set(0, 7.4, 0.27);
    g.add(m);
  }

  private buildWorld() {
    const r = this.rnd;
    // bounds of the run
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (let i = 0; i < this.px.length; i++) {
      x0 = Math.min(x0, this.px[i]);
      x1 = Math.max(x1, this.px[i]);
      z0 = Math.min(z0, this.pz[i]);
      z1 = Math.max(z1, this.pz[i]);
    }
    x0 -= 70;
    x1 += 70;
    z0 -= 90;
    z1 += 50;
    const nearest = (x: number, z: number) => {
      let b = Infinity,
        bi = 0;
      for (let i = 0; i < this.px.length; i += 4) {
        const d = (x - this.px[i]) ** 2 + (z - this.pz[i]) ** 2;
        if (d < b) {
          b = d;
          bi = i;
        }
      }
      return { d: Math.sqrt(b), i: bi };
    };
    const height = (x: number, z: number) => {
      const n = nearest(x, z);
      const y = n.i === 0 && z > this.pz[0] ? SLOPE * (z - this.pz[0]) : this.py[n.i];
      return y - 0.7 + Math.max(0, n.d - 6.5) * 0.32 + Math.sin(x * 0.11) * Math.cos(z * 0.09) * Math.max(0, n.d - 12) * 0.08;
    };
    // a snowy heightfield around the run
    const NX = 70,
      NZ = 110;
    const geo = new THREE.PlaneGeometry(1, 1, NX, NZ);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const colA = new Float32Array(p.count * 3);
    const cs = new THREE.Color("#ffffff"),
      cb = new THREE.Color("#e2ecfa");
    for (let i = 0; i < p.count; i++) {
      const x = x0 + (p.getX(i) + 0.5) * (x1 - x0);
      const z = z0 + (0.5 - p.getY(i)) * (z1 - z0);
      p.setXYZ(i, x, height(x, z), z);
      const c = (i * 7) % 5 === 0 ? cb : cs;
      colA.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colA, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true }));
    ground.receiveShadow = true;
    this.scene.add(ground);
    // pines
    const pines: { x: number; y: number; z: number; s: number }[] = [];
    for (let k = 0; k < 900; k++) {
      const x = x0 + r() * (x1 - x0),
        z = z0 + r() * (z1 - z0);
      const n = nearest(x, z);
      if (n.d < 8.5) continue;
      pines.push({ x, y: height(x, z), z, s: 1.4 + r() * 1.4 });
    }
    const greens = ["#2a7a50", "#23694a", "#318a58", "#1f5e42"];
    this.inst(GEO.cylLo, toon("#5a3a22"), pines.map((t) => ({ x: t.x, y: t.y + 0.35 * t.s, z: t.z, sx: 0.14 * t.s, sy: 0.7 * t.s, sz: 0.14 * t.s })));
    const lay: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    const snow: typeof lay = [];
    for (const t of pines) {
      const c = greens[Math.floor(r() * greens.length)];
      lay.push({ x: t.x, y: t.y + 1.15 * t.s, z: t.z, sx: 0.85 * t.s, sy: 1.2 * t.s, sz: 0.85 * t.s, c });
      lay.push({ x: t.x, y: t.y + 1.8 * t.s, z: t.z, sx: 0.62 * t.s, sy: 1.0 * t.s, sz: 0.62 * t.s, c });
      snow.push({ x: t.x, y: t.y + 2.3 * t.s, z: t.z, sx: 0.36 * t.s, sy: 0.55 * t.s, sz: 0.36 * t.s, c: "#ffffff" });
    }
    this.inst(GEO.coneLo, toon("#ffffff"), lay);
    this.inst(GEO.coneLo, toon("#ffffff"), snow, false);
    // spectators and flags on the outside of the bends
    const bodies: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    const heads: typeof bodies = [];
    const cols = ["#ff4b3e", "#2f8dff", "#ffd23f", "#3fcf5a", "#ff7ad9", "#9b5cff", "#ff9a2e", "#ffffff"];
    const placeCrowd = (s0: number, s1: number, side: number) => {
      for (let s = s0; s < s1; s += 0.9)
        for (let row = 0; row < 2; row++) {
          if (r() < 0.25) continue;
          const a = this.at(s);
          const u = side * (6.2 + row * 1.0 + r() * 0.3);
          const x = a.x + a.rx * u,
            z = a.z + a.rz * u;
          const y = a.y - 0.7 + Math.max(0, Math.abs(u) - 6.5) * 0.32 + row * 0.25;
          bodies.push({ x, y: y + 0.5, z, sx: 0.46, sy: 0.44, sz: 0.46, c: cols[Math.floor(r() * cols.length)] });
          heads.push({ x, y: y + 1.08, z, sx: 0.21, sy: 0.21, sz: 0.21, c: "#f1c9a0" });
        }
    };
    placeCrowd(2, 22, -1);
    placeCrowd(2, 22, 1);
    for (const b of this.bends) placeCrowd(b.s0, b.s0 + b.len, -b.dir);
    placeCrowd(this.END - 14, this.END + 10, -1);
    placeCrowd(this.END - 14, this.END + 10, 1);
    this.inst(GEO.capsule, toon("#ffffff"), bodies);
    this.inst(GEO.sphereLo, toon("#ffffff"), heads, false);
    // a podium of floodlight masts with flags
    const flagGeo = new THREE.PlaneGeometry(1.1, 0.7);
    flagGeo.translate(0.55, 0, 0);
    for (let s = 10; s < this.END; s += 28) {
      const a = this.at(s);
      for (const side of [-1, 1]) {
        const u = side * 5.6;
        const g = group(this.scene, { x: a.x + a.rx * u, y: a.y, z: a.z + a.rz * u });
        cyl(g, "#dde3ee", 0.06, 3.2, { y: 1.6, seg: 6 });
        const f = new THREE.Mesh(flagGeo, toon(cols[Math.floor(r() * 6)]));
        f.position.y = 2.8;
        f.rotation.y = -a.th + Math.PI / 2;
        f.castShadow = true;
        g.add(f);
        this.flagMeshes.push(f);
      }
    }
  }

  // ------------------------------------------------------------ sleds

  private buildSleds() {
    for (let team = 0; team < 2; team++) {
      const members = this.players.filter((p) => p.team === team).map((p) => p.i);
      const g = group(this.scene);
      const roll = group(g);
      const col = TEAM_COL[team];
      const dark = team === 0 ? "#a11d14" : "#11469a";
      // the hull
      box(roll, col, 1.05, 0.5, 2.6, { y: 0.42 });
      box(roll, dark, 1.08, 0.12, 2.62, { y: 0.2 });
      const nose = new THREE.Mesh(GEO.sphere, toon(col));
      nose.scale.set(0.53, 0.5, 0.9);
      nose.position.set(0, 0.5, 1.25);
      nose.castShadow = true;
      roll.add(nose);
      box(roll, "#ffffff", 1.07, 0.12, 2.0, { y: 0.55, z: 0.1, cast: false });
      box(roll, "#1d1630", 0.75, 0.06, 1.8, { y: 0.68, z: -0.25, cast: false });
      // number plate
      const num = canvasTex(128, 128, (c, w, h) => {
        c.fillStyle = "#ffffff";
        c.beginPath();
        c.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
        c.fill();
        c.font = `90px ${FONT_TITLE}`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillStyle = col;
        c.fillText(String(team + 1), w / 2, h / 2 + 6);
      });
      for (const sg of [-1, 1]) {
        const pl = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: num, transparent: true }));
        pl.scale.setScalar(0.42);
        pl.position.set(sg * 0.535, 0.42, 0.6);
        pl.rotation.y = (sg * Math.PI) / 2;
        roll.add(pl);
      }
      // runners
      for (const sg of [-1, 1]) {
        box(roll, "#c8ccd4", 0.07, 0.07, 2.7, { x: sg * 0.4, y: 0.04 });
        box(roll, "#c8ccd4", 0.07, 0.07, 0.4, { x: sg * 0.4, y: 0.12, z: 1.4, rx: -0.6 });
      }
      // a ring in the team colour
      const ring = new THREE.Mesh(GEO.ring, flat(col, 0.7));
      ring.rotation.x = -Math.PI / 2;
      ring.scale.set(1.3, 1.9, 1);
      ring.position.y = 0.05;
      ring.renderOrder = 2;
      g.add(ring);
      // the crew
      members.forEach((pi, k) => {
        const a = this.spawn(pi, 0, 0, 0, { blob: false, scale: 0.8 });
        roll.add(a.root);
        a.pos.set(0, 0.45, k === 0 ? 0.35 : -0.75);
        a.anim = "idle";
      });
      const sled: Sled = {
        team,
        members,
        g,
        roll,
        s: 0,
        v: 0,
        pushing: true,
        bend: 0,
        shown: false,
        commits: members.map(() => null),
        wobT: 0,
        scrapeT: 0,
        scrapeSide: 0,
        sway: 0,
        done: false,
        panel: null as unknown as HTMLElement,
        arrow: null as unknown as HTMLElement,
        ring: null as unknown as HTMLElement,
        slots: [],
        speedEl: null as unknown as HTMLElement,
        plan: members.map(() => ({ tau: 0, dir: 0, hold: 0 })),
      };
      this.sleds.push(sled);
      this.placeSled(sled, 0);
    }
  }

  /** Where everything of a sled goes (crew outside while pushing). */
  private placeSled(sl: Sled, dt: number) {
    const lane = (sl.team === 0 ? -1 : 1) * LANE;
    // the bend we're in (for the banking)
    let bank = 0,
      bdir = 0;
    for (const b of this.bends)
      if (sl.s > b.s0 && sl.s < b.s0 + b.len) {
        bank = Math.sin(((sl.s - b.s0) / b.len) * Math.PI);
        bdir = b.dir;
      }
    const wantSway = -bdir * bank * 0.55 + (sl.scrapeT > 0 ? sl.scrapeSide * 0.5 : 0);
    sl.sway = damp(sl.sway, wantSway, 6, dt || 1);
    const a = this.at(sl.s);
    const u = lane + clamp(sl.sway, -CHW + 0.6, CHW - 0.6);
    sl.g.position.set(a.x + a.rx * u, a.y + Math.abs(sl.sway) * 0.15, a.z + a.rz * u);
    sl.g.rotation.order = "YXZ";
    sl.g.rotation.y = Math.PI - a.th;
    sl.g.rotation.x = Math.atan(SLOPE);
    const wob = sl.wobT > 0 ? Math.sin(this.t * 26) * 0.28 * Math.min(1, sl.wobT) : 0;
    sl.roll.rotation.z = -bdir * bank * 0.35 + wob + sl.sway * 0.12;
    sl.roll.rotation.y = sl.wobT > 0 ? Math.sin(this.t * 19) * 0.12 : 0;
    // the crew: pushing behind, then seated
    sl.members.forEach((pi, k) => {
      const av = this.avatars[pi];
      if (sl.pushing) {
        av.anim = sl.v > 0.3 ? "push" : "idle";
        av.speed = clamp(sl.v / 8, 0.3, 1);
        av.pos.set(k === 0 ? -0.75 : 0.75, 0.0, -1.75);
      } else {
        av.anim = this.finished && this.winner === sl.team ? "win" : "sit";
        av.pos.set(0, 0.45, k === 0 ? 0.35 : -0.75);
      }
    });
  }

  // ------------------------------------------------------------ HUD

  private buildPanels() {
    this.sleds.forEach((sl) => {
      const side = sl.team === 0 ? "left" : "right";
      const col = TEAM_COL[sl.team];
      const slots = sl.members
        .map(
          (pi) =>
            `<div class="bb-slot" style="display:flex;align-items:center;gap:calc(var(--u)*0.4);padding:calc(var(--u)*0.2) calc(var(--u)*0.6) calc(var(--u)*0.2) calc(var(--u)*0.2);border-radius:999px;background:rgba(255,255,255,0.14)"><div style="width:calc(var(--u)*2.6);height:calc(var(--u)*2.6);border-radius:50%;background:${this.players[pi].char.color} url(${portrait(this.players[pi].char.id)}) center/120% no-repeat;background-position:50% 30%;border:calc(var(--u)*0.2) solid #fff"></div><span class="bb-st" style="font-family:var(--title);font-size:calc(var(--u)*2);min-width:calc(var(--u)*2.2);text-align:center">·</span></div>`,
        )
        .join("");
      sl.panel = this.hud.add(
        `<div style="position:absolute;${side}:calc(var(--u)*1.6);top:50%;transform:translateY(-50%);width:calc(var(--u)*17);padding:calc(var(--u)*0.8);border-radius:calc(var(--u)*2.2);background:rgba(20,14,40,0.72);border:calc(var(--u)*0.35) solid ${col};text-align:center;box-shadow:0 calc(var(--u)*0.4) 0 rgba(0,0,0,0.25)">
          <div style="font-family:var(--title);font-size:calc(var(--u)*1.7);color:${col};-webkit-text-stroke:calc(var(--u)*0.08) #fff">${teamName(sl.team)}</div>
          <div class="bb-box" style="position:relative;margin:calc(var(--u)*0.6) auto;width:calc(var(--u)*10);height:calc(var(--u)*10);border-radius:50%;background:rgba(255,255,255,0.1);display:grid;place-items:center">
            <div class="bb-ring" style="position:absolute;inset:0;border-radius:50%;border:calc(var(--u)*0.6) solid #ffd23f;opacity:0"></div>
            <div class="bb-arrow" style="font-family:var(--title);font-size:calc(var(--u)*6.5);line-height:1;color:#fff;opacity:0.25">•</div>
          </div>
          <div style="display:flex;justify-content:center;gap:calc(var(--u)*0.6)">${slots}</div>
          <div class="bb-speed" style="margin-top:calc(var(--u)*0.5);font-family:var(--title);font-size:calc(var(--u)*2.2)">0 km/h</div>
        </div>`,
      );
      sl.arrow = sl.panel.querySelector(".bb-arrow")!;
      sl.ring = sl.panel.querySelector(".bb-ring")!;
      sl.slots = [...sl.panel.querySelectorAll<HTMLElement>(".bb-st")];
      sl.speedEl = sl.panel.querySelector(".bb-speed")!;
    });
  }

  private cardHtml(i: number) {
    const sl = this.sleds.find((s) => s.members.includes(i));
    if (!sl) return "";
    const k = sl.members.indexOf(i);
    return k === 0 ? T("Pilot", "舵手") : T("Brakeman", "刹车手");
  }

  /** τ: seconds until the sled reaches its next bend. */
  private tau(sl: Sled) {
    const b = this.bends[sl.bend];
    if (!b) return Infinity;
    return (b.s0 - sl.s) / Math.max(4, sl.v);
  }

  private updatePanel(sl: Sled) {
    const b = this.bends[sl.bend];
    const tau = this.tau(sl);
    if (sl.pushing) {
      sl.arrow.textContent = "A";
      sl.arrow.style.opacity = "1";
      sl.arrow.style.color = "#7dff9a";
      sl.arrow.style.transform = `scale(${1 + Math.abs(Math.sin(this.t * 14)) * 0.15})`;
      sl.ring.style.opacity = "0";
    } else if (b && tau < PROMPT_T && tau > WIN_CLOSE - 0.6) {
      const open = tau <= WIN_OPEN && tau >= WIN_CLOSE;
      sl.arrow.textContent = b.dir < 0 ? "⬅" : "➡";
      sl.arrow.style.opacity = "1";
      sl.arrow.style.color = open ? "#7dff9a" : "#ffd23f";
      sl.arrow.style.transform = open ? "scale(1.15)" : "scale(1)";
      const k = clamp((tau - WIN_OPEN) / (PROMPT_T - WIN_OPEN), 0, 1);
      sl.ring.style.opacity = "1";
      sl.ring.style.transform = `scale(${0.95 + k * 0.45})`;
      sl.ring.style.borderColor = open ? "#7dff9a" : "#ffd23f";
    } else {
      sl.arrow.textContent = "•";
      sl.arrow.style.opacity = "0.25";
      sl.arrow.style.color = "#fff";
      sl.arrow.style.transform = "scale(1)";
      sl.ring.style.opacity = "0";
    }
    sl.speedEl.textContent = `${Math.round(sl.v * 6.5)} km/h`;
  }

  private setSlot(sl: Sled, k: number, v: Verdict | null) {
    const el = sl.slots[k];
    const map: Record<Verdict, [string, string]> = { good: ["✔", "#7dff9a"], early: [T("Early", "早"), "#ffb02e"], late: [T("Late", "晚"), "#ffb02e"], wrong: ["✘", "#ff5a4e"] };
    if (!v) {
      el.textContent = "·";
      el.style.color = "#fff";
      el.style.fontSize = "calc(var(--u)*2)";
    } else {
      el.textContent = map[v][0];
      el.style.color = map[v][1];
      el.style.fontSize = v === "early" || v === "late" ? "calc(var(--u)*1.4)" : "calc(var(--u)*2)";
    }
  }

  // ------------------------------------------------------------ CPU

  protected cpu(i: number, dt: number): CpuPad {
    const sl = this.sleds.find((s) => s.members.includes(i))!;
    const k = sl.members.indexOf(i);
    const lv = this.players[i].level;
    if (sl.pushing) return { a: this.mashing(i, 8) };
    const b = this.bends[sl.bend];
    const plan = sl.plan[k];
    if (!b || sl.done) return {};
    const tau = this.tau(sl);
    if (plan.dir === 0) {
      // make a plan for the next bend
      const sigma = 0.07 + (1 - lv) * 0.3;
      const g = (Math.random() + Math.random() + Math.random() - 1.5) * 1.4 * sigma;
      plan.tau = 0.15 + g;
      plan.dir = Math.random() < (1 - lv) * 0.12 ? -b.dir : b.dir;
      plan.hold = 0;
    }
    if (tau > PROMPT_T) return {};
    if (plan.dir !== 0 && tau <= plan.tau) {
      plan.hold += dt;
      if (plan.hold > 0.45) return {};
      return { x: plan.dir };
    }
    return {};
  }

  // ------------------------------------------------------------ the race

  start() {
    this.sound("go");
    this.hud.banner(T("PUSH!", "推！"), { color: "#7dff9a", sub: T("Mash A together", "两人一起狂按 A"), ms: 1400 });
    music.speed(1.05);
  }

  protected idle(dt: number) {
    for (const sl of this.sleds) {
      this.placeSled(sl, dt);
      this.updatePanel(sl);
    }
    for (const [n, f] of this.flagMeshes.entries()) f.rotation.x = Math.sin(performance.now() / 300 + n) * 0.15;
    this.frameCam(dt, 2);
  }

  private frameCam(dt: number, rate: number, snap = false) {
    const s0 = this.sleds[0]?.s ?? 0,
      s1 = this.sleds[1]?.s ?? 0;
    const gap = clamp(Math.abs(s0 - s1), 0, 34);
    const mid = Math.max(s0, s1) - gap * 0.5;
    this.camS = snap ? mid : damp(this.camS, mid, 5, dt);
    const back = 9.5 + gap * 0.5;
    const up = 5.5 + gap * 0.42;
    const c = this.at(this.camS - back);
    const l = this.at(this.camS + 6 + gap * 0.3);
    const pos: [number, number, number] = [c.x, c.y + up, c.z];
    const look: [number, number, number] = [l.x, l.y + 0.6, l.z];
    if (snap) this.setCam(pos, look, 52);
    else this.moveCam(pos, look, dt, rate);
  }

  protected step(dt: number) {
    const now = this.t;
    for (const [n, f] of this.flagMeshes.entries()) f.rotation.x = Math.sin(now * 3 + n) * 0.15;
    for (const sl of this.sleds) this.moveSled(sl, dt);
    this.players.forEach((p, i) => {
      const h = this.cardHtml(i);
      if (h !== this.cards[i]) {
        this.cards[i] = h;
        this.hud.setScore(p.seat, h);
      }
    });
    this.frameCam(dt, 3);
    const left = CAP - now;
    if (left <= 10) this.hud.timer(left);
    const done = this.sleds.filter((s) => s.done);
    if (done.length || left <= 0) {
      let w: number | null;
      if (done.length === 1) w = done[0].team;
      else if (done.length === 2) w = null;
      else w = this.sleds[0].s > this.sleds[1].s + 0.01 ? 0 : this.sleds[1].s > this.sleds[0].s + 0.01 ? 1 : null;
      this.winner = w;
      this.hud.timer(null);
      if (w !== null) {
        this.hud.banner(T(`Team ${teamName(w)} wins!`, `${teamName(w)}获胜！`), { color: TEAM_COL[w], size: 7 });
        this.sound("fanfare");
        const sl = this.sleds[w];
        this.fx.confetti({ x: sl.g.position.x, y: sl.g.position.y + 2, z: sl.g.position.z }, 70);
      }
      this.finishByTeam(w);
    }
  }

  private moveSled(sl: Sled, dt: number) {
    // the push
    if (sl.pushing) {
      for (const pi of sl.members) {
        if (this.pad(pi).aDown) {
          sl.v = Math.min(9.5, sl.v + 0.34);
          this.buzz(pi, 15);
          if (Math.random() < 0.5) this.sound("step");
          const av = this.avatars[pi];
          const w = new THREE.Vector3();
          av.root.getWorldPosition(w);
          this.fx.dust(w, 2, "#ffffff");
        }
      }
      sl.v = Math.max(0, sl.v - dt * 0.9);
      if (sl.s >= PUSH_LEN) {
        sl.pushing = false;
        this.sound("jump");
        this.hud.pop(sl.g.position.clone().add(new THREE.Vector3(0, 2.4, 0)), T("Off they go!", "出发！"), TEAM_COL[sl.team], this.camera);
      }
    } else if (!sl.done) {
      // gravity, boosts bleed back to the terminal speed
      if (sl.v < VTERM) sl.v = Math.min(VTERM, sl.v + dt * 1.7);
      else sl.v = damp(sl.v, VTERM, 0.45, dt);
      this.judge(sl, dt);
    } else sl.v = damp(sl.v, 0, 0.8, dt);
    if (sl.wobT > 0) {
      sl.wobT -= dt;
      sl.v = Math.min(sl.v, VTERM * 0.75);
      if (Math.random() < 0.5) this.fx.burst({ x: sl.g.position.x, y: sl.g.position.y + 0.2, z: sl.g.position.z }, { count: 2, colors: ["#ffffff", "#bfe8ff"], speed: 3, up: 2, size: 0.12, life: 0.4, shape: "cube", gravity: 9 });
    }
    if (sl.scrapeT > 0) {
      sl.scrapeT -= dt;
      if (Math.random() < 0.7) {
        const a = this.at(sl.s);
        const u = (sl.team === 0 ? -1 : 1) * LANE + sl.scrapeSide * 1.3;
        this.fx.burst({ x: a.x + a.rx * u, y: a.y + 0.4, z: a.z + a.rz * u }, { count: 3, colors: ["#ffe14a", "#ffb02e", "#ffffff"], speed: 3, size: 0.08, life: 0.3, gravity: 8 });
      }
    }
    sl.s += sl.v * dt;
    if (!sl.done && sl.s >= this.END) {
      sl.done = true;
      this.sound("cheer");
    }
    // ice spray behind
    if (!sl.pushing && sl.v > 8 && Math.random() < 0.6) {
      const a = this.at(sl.s - 1.5);
      const u = (sl.team === 0 ? -1 : 1) * LANE + sl.sway;
      this.fx.burst({ x: a.x + a.rx * u, y: a.y + 0.1, z: a.z + a.rz * u }, { count: 1, colors: ["#ffffff", "#dff4ff"], speed: 1, up: 1, size: 0.12, life: 0.4, shape: "ball", gravity: 3 });
    }
    this.placeSled(sl, dt);
    this.updatePanel(sl);
  }

  /** The bend in front: read each member's lean and decide. */
  private judge(sl: Sled, _dt: number) {
    const b = this.bends[sl.bend];
    if (!b) return;
    const tau = this.tau(sl);
    if (tau > PROMPT_T) return;
    if (!sl.shown) {
      sl.shown = true;
      sl.commits = sl.members.map(() => null);
      sl.members.forEach((_, k) => this.setSlot(sl, k, null));
      this.sound("tick");
    }
    sl.members.forEach((pi, k) => {
      if (sl.commits[k]) return;
      const x = this.pad(pi).x;
      if (Math.abs(x) > 0.55) {
        let v: Verdict;
        if (Math.sign(x) !== b.dir) v = "wrong";
        else if (tau > WIN_OPEN) v = "early";
        else v = "good";
        sl.commits[k] = { v, t: this.t };
        this.setSlot(sl, k, v);
        this.sound(v === "good" ? "select" : "wrong");
        if (v !== "good") this.buzz(pi, 80);
      }
    });
    const all = sl.commits.every((c) => c);
    if (tau < WIN_CLOSE || all) {
      if (!all && tau >= WIN_CLOSE) return;
      sl.commits = sl.commits.map((c, k) => {
        if (c) return c;
        this.setSlot(sl, k, "late");
        return { v: "late", t: this.t };
      });
      const good = sl.commits.filter((c) => c!.v === "good").length;
      const pos = sl.g.position.clone().add(new THREE.Vector3(0, 2.2, 0));
      if (good === sl.members.length) {
        const sync = Math.abs(sl.commits[0]!.t - (sl.commits[1]?.t ?? sl.commits[0]!.t)) < 0.15;
        sl.v = Math.min(VTERM + 9, sl.v + (sync ? 5.5 : 4));
        this.hud.pop(pos, sync ? T("In sync!", "同步！") : T("Perfect!", "完美！"), "#7dff9a", this.camera);
        this.sound("ding");
        if (sync) this.sound("magic");
        this.fx.ring({ x: sl.g.position.x, y: sl.g.position.y + 0.1, z: sl.g.position.z }, "#7dff9a", 2.6);
        this.fx.sparkle({ x: sl.g.position.x, y: sl.g.position.y + 1, z: sl.g.position.z }, "#bfffd0", 16);
        for (const pi of sl.members) this.buzz(pi, 30);
      } else if (good > 0) {
        sl.v *= 0.86;
        sl.scrapeT = 0.6;
        sl.scrapeSide = -b.dir;
        this.hud.pop(pos, T("Scrape!", "擦边！"), "#ffb02e", this.camera);
        this.sound("slide");
      } else {
        sl.v *= 0.62;
        sl.wobT = 1.1;
        sl.scrapeT = 0.9;
        sl.scrapeSide = -b.dir;
        this.hud.pop(pos, T("Big skid!", "大侧滑！"), "#ff5a4e", this.camera);
        this.sound("crash");
        this.shake = 0.35;
        for (const pi of sl.members) this.buzz(pi, [100, 50, 100]);
      }
      sl.bend++;
      sl.shown = false;
      for (const p of sl.plan) p.dir = 0;
    }
  }

  protected outroStep(dt: number) {
    for (const sl of this.sleds) {
      sl.v = damp(sl.v, 0, 1.8, dt);
      sl.s += sl.v * dt;
      sl.wobT = 0;
      this.placeSled(sl, dt);
    }
    // a closer look at the winners
    const w = this.winner !== null && this.winner >= 0 ? this.sleds[this.winner] : null;
    const sF = w ? w.s : (this.sleds[0].s + this.sleds[1].s) / 2;
    const c = this.at(sF + 9),
      l = this.at(sF);
    const side = w ? (w.team === 0 ? -1 : 1) * 2.6 : 0;
    this.moveCam([c.x + c.rx * side, c.y + 5.2, c.z + c.rz * side], [l.x + l.rx * side, l.y + 0.2, l.z + l.rz * side], dt, 2.5);
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
  id: "bobsleigh",
  name: "Bobsleigh",
  icon: "🛷",
  color: "#e04a4a",
  tagline: "Lean together into the bends.",
  rules: "At the start, mash A together to push the bob. Before each bend an arrow shows: both lean that way (stick) as it turns green. Together = turbo!",
  controls: { stick: "Lean", a: "Push at the start" },
  modes: ["2v2"],
  length: 40,
  music: "mini",
  create: (ctx) => new Bobsleigh(ctx),
};
export default def;
