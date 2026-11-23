/**
 * MINI GRAND PRIX (chacun pour soi, 3 tours): karting on a little street circuit through an old
 * European town (curbs, tyre stacks, grandstands, bunting). The karts drive by themselves: the stick
 * points where to go, as seen on the TV (absolute, camera-relative). A fires a mini-boost (3 charges
 * at most, refilled by the glowing pads on the road). Oil slicks spin you round.
 * Places by finishing order; 15 s after the winner (or at 90 s) the rest rank by progress.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { FONT_TITLE, GEO, ball, box, canvasTex, cone, cyl, flat, group, toon } from "../../engine/gfx";
import { angDiff, clamp, damp, turnToward } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const LAPS = 3;
const CAP = 90;
const GRACE = 15;
const HW = 3.6; // half width of the asphalt
const CURB = 0.75;
const WALL = HW + CURB; // where the barriers stand
const KR = 0.62; // kart radius (bumps)
const VMAX = 13;
const VBOOST = 20;
const BOOST_T = 1.15;
const SPIN_T = 1.2;
const MAX_BOOSTS = 3;
const NS = 720; // samples along the centre line
const TURN = 3.3; // rad/s
const CTRL: [number, number][] = [
  [0, 15],
  [16, 15],
  [25, 12.5],
  [28.5, 5],
  [27.5, -3],
  [22, -9],
  [13, -9.5],
  [6, -8.5],
  [-1, -12],
  [-8, -17],
  [-18, -18.5],
  [-27, -15.5],
  [-31, -7],
  [-30, 3],
  [-26, 11],
  [-18, 15],
  [-8, 15.3],
];
const placeTxt = (n: number) => T(["1st", "2nd", "3rd", "4th"][n - 1] ?? `${n}th`, `第 ${n} 名`);

interface Kart {
  g: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Mesh[];
  steerPiv: THREE.Group[];
  flame: THREE.Mesh;
  label: HTMLElement;
  x: number;
  z: number;
  h: number;
  v: number;
  vx: number;
  vz: number;
  /** Nearest sample; unwrapped sample count; progress (units, 0 at the line). */
  k: number;
  kp: number;
  prog: number;
  lap: number;
  boosts: number;
  boostT: number;
  spinT: number;
  spinA: number;
  safeT: number;
  wallCd: number;
  bumpCd: number;
  padCd: number[];
  steer: number;
  done: boolean;
  finishT: number;
  place: number;
  avoid: Map<number, boolean>;
  smokeT: number;
  u: number;
  aim: number;
}
interface Slick {
  k: number;
  u: number;
  x: number;
  z: number;
  r: number;
}
interface Pad {
  k: number;
  u: number;
  x: number;
  z: number;
  m: THREE.Mesh;
}

function lum(hex: string) {
  const c = new THREE.Color(hex);
  return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
}

class GrandPrix extends BaseMini {
  // the track
  private px = new Float32Array(NS);
  private pz = new Float32Array(NS);
  private tx = new Float32Array(NS);
  private tz = new Float32Array(NS);
  private nx = new Float32Array(NS);
  private nz = new Float32Array(NS);
  private curv = new Float32Array(NS);
  private line = new Float32Array(NS);
  private L = 0;
  private ds = 0;
  private karts: Kart[] = [];
  private slicks: Slick[] = [];
  private boostPads: Pad[] = [];
  private padTex!: THREE.Texture;
  private crowd!: THREE.InstancedMesh;
  private crowdHeads!: THREE.InstancedMesh;
  private crowdBase: { x: number; y: number; z: number; ph: number; c: string; sk: string }[] = [];
  private instanced: THREE.InstancedMesh[] = [];
  private lights: THREE.Mesh[] = [];
  flags: THREE.Mesh[] = [];
  private lapEl!: HTMLElement;
  private cards: string[] = [];
  private lastLeaderLap = 0;
  private firstDoneT = -1;
  private doneCount = 0;
  private endBanner = false;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v3 = new THREE.Vector3();
  private s3 = new THREE.Vector3();
  private camC = new THREE.Vector3();

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#6fbfff", "#fdf1dc"], size: 40, sun: [0.45, 1, 0.55], fog: { near: 90, far: 190 } });
    this.buildTrack();
    this.buildTown();
    this.buildProps();
    this.placeKarts();
    this.hud.players(this.players, (p) => this.cardHtml(p.i));
    this.lapEl = this.hud.add(
      `<div style="position:absolute;left:50%;top:calc(var(--u)*1.2);transform:translateX(-50%);padding:calc(var(--u)*0.5) calc(var(--u)*2.2);background:#fff;color:#1d1630;border:calc(var(--u)*0.35) solid #1d1630;border-radius:calc(var(--u)*3);font-family:var(--title);font-size:calc(var(--u)*3.2);box-shadow:0 calc(var(--u)*0.45) 0 rgba(0,0,0,0.3);white-space:nowrap">${T(`LAP 1/${LAPS}`, `第 1/${LAPS} 圈`)}</div>`,
    );
    this.frameCam(1, 100, true);
  }

  // ------------------------------------------------------------ the track

  private buildTrack() {
    const curve = new THREE.CatmullRomCurve3(
      CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      "centripetal",
    );
    const pts = curve.getSpacedPoints(NS);
    let L = 0;
    for (let i = 0; i < NS; i++) {
      this.px[i] = pts[i].x;
      this.pz[i] = pts[i].z;
      L += pts[i].distanceTo(pts[i + 1]);
    }
    this.L = L;
    this.ds = L / NS;
    const hd = new Float32Array(NS);
    for (let i = 0; i < NS; i++) {
      const a = (i - 1 + NS) % NS,
        b = (i + 1) % NS;
      let dx = this.px[b] - this.px[a],
        dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      this.tx[i] = dx;
      this.tz[i] = dz;
      // the left normal (facing along the track)
      this.nx[i] = dz;
      this.nz[i] = -dx;
      hd[i] = Math.atan2(dx, dz);
    }
    const raw = new Float32Array(NS);
    for (let i = 0; i < NS; i++) raw[i] = angDiff(hd[(i - 2 + NS) % NS], hd[(i + 2) % NS]) / (4 * this.ds);
    // smoothed curvature (positive = turning left)
    const W = Math.round(5 / this.ds);
    const sm = (src: Float32Array) => {
      const out = new Float32Array(NS);
      for (let i = 0; i < NS; i++) {
        let s = 0;
        for (let d = -W; d <= W; d++) s += src[(i + d + NS) % NS];
        out[i] = s / (2 * W + 1);
      }
      return out;
    };
    this.curv = sm(sm(raw));
    for (let i = 0; i < NS; i++) this.line[i] = clamp(this.curv[i] * 26, -2.3, 2.3);

    const s = this.scene;
    // asphalt
    const asphalt = canvasTex(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = "#4b4c58";
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 1400; i++) {
          g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)";
          g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
        }
        // white edge lines
        g.fillStyle = "#f2f2f2";
        g.fillRect(0, 0, 8, h);
        g.fillRect(w - 8, 0, 8, h);
      },
      true,
    );
    this.scene.add(this.strip(-HW, HW, 0.03, 0.03, 6, new THREE.MeshToonMaterial({ map: asphalt })));
    // curbs: red & white
    const curbTex = canvasTex(
      16,
      64,
      (g, w, h) => {
        g.fillStyle = "#e8352b";
        g.fillRect(0, 0, w, h / 2);
        g.fillStyle = "#ffffff";
        g.fillRect(0, h / 2, w, h / 2);
      },
      true,
    );
    const curbMat = new THREE.MeshToonMaterial({ map: curbTex });
    this.scene.add(this.strip(HW, WALL, 0.05, 0.09, 2.4, curbMat));
    this.scene.add(this.strip(-WALL, -HW, 0.09, 0.05, 2.4, curbMat));
    // barriers: red / white concrete blocks with a grey top
    const wallTex = canvasTex(
      64,
      64,
      (g, w, h) => {
        g.fillStyle = "#f4f1ea";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#d8352d";
        g.fillRect(0, 0, w, h / 2);
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(0, 0, w, 3);
      },
      true,
    );
    const wallMat = new THREE.MeshToonMaterial({ map: wallTex, side: THREE.DoubleSide });
    const H = 0.75;
    for (const sgn of [1, -1]) {
      this.scene.add(this.strip(sgn * WALL, sgn * WALL, 0, H, 3, wallMat));
      this.scene.add(this.strip(sgn * (WALL + 0.35), sgn * (WALL + 0.35), 0, H, 3, wallMat));
      const top = this.strip(sgn > 0 ? WALL : -WALL - 0.35, sgn > 0 ? WALL + 0.35 : -WALL, H, H, 3, toon("#b9b6ae"));
      this.scene.add(top);
    }
    // the start / finish line + grid boxes
    const chk = canvasTex(256, 32, (g, w, h) => {
      for (let x = 0; x < 16; x++)
        for (let y = 0; y < 2; y++) {
          g.fillStyle = (x + y) % 2 ? "#111" : "#fff";
          g.fillRect((x * w) / 16, (y * h) / 2, w / 16, h / 2);
        }
    });
    const line = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: chk }));
    line.scale.set(HW * 2, 0.9, 1);
    line.position.set(this.px[0], 0.05, this.pz[0]);
    line.rotation.order = "YXZ";
    line.rotation.set(-Math.PI / 2, Math.atan2(this.tx[0], this.tz[0]), 0);
    s.add(line);
    const word = canvasTex(512, 128, (g, w, h) => {
      g.font = `110px ${FONT_TITLE}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.fillText(T("START", "起点"), w / 2, h / 2 + 6);
    });
    const kw = Math.round(4.2 / this.ds);
    const wm = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: word, transparent: true, depthWrite: false }));
    wm.rotation.order = "YXZ";
    wm.rotation.set(-Math.PI / 2, Math.atan2(this.tx[kw], this.tz[kw]) - Math.PI / 2, 0);
    wm.scale.set(5.6, 1.4, 1);
    wm.position.set(this.px[kw], 0.05, this.pz[kw]);
    s.add(wm);
    for (let r = 0; r < 4; r++) {
      const k = (NS - Math.round((3 + r * 2.4) / this.ds)) % NS;
      const u = r % 2 ? -1.6 : 1.6;
      const gx = this.px[k] + this.nx[k] * u,
        gz = this.pz[k] + this.nz[k] * u;
      const gb = new THREE.Mesh(GEO.plane, flat("#ffffff", 0.75));
      gb.rotation.order = "YXZ";
      gb.rotation.set(-Math.PI / 2, Math.atan2(this.tx[k], this.tz[k]), 0);
      gb.scale.set(1.6, 0.14, 1);
      gb.position.set(gx + this.tx[k] * 1.1, 0.05, gz + this.tz[k] * 1.1);
      s.add(gb);
    }
  }

  /** A ribbon along the track between lateral offsets o0 → o1 (heights y0 → y1). */
  private strip(o0: number, o1: number, y0: number, y1: number, vScale: number, mat: THREE.Material) {
    const n = NS + 1;
    const pos = new Float32Array(n * 6),
      uv = new Float32Array(n * 4);
    let acc = 0;
    for (let s = 0; s < n; s++) {
      const k = s % NS;
      pos.set([this.px[k] + this.nx[k] * o0, y0, this.pz[k] + this.nz[k] * o0, this.px[k] + this.nx[k] * o1, y1, this.pz[k] + this.nz[k] * o1], s * 6);
      // keep the texture density right on the inside and outside of bends
      const v = acc / vScale;
      uv.set([0, v, 1, v], s * 4);
      const w = 1 - this.curv[k] * (o0 + o1) * 0.5;
      acc += this.ds * Math.max(0.2, w);
    }
    const idx: number[] = [];
    for (let s = 0; s < n - 1; s++) {
      const a = s * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.castShadow = y0 !== y1 || o0 === o1;
    return m;
  }

  private inside(x: number, z: number) {
    let c = false;
    for (let i = 0, j = NS - 1; i < NS; j = i++) {
      const xi = this.px[i],
        zi = this.pz[i],
        xj = this.px[j],
        zj = this.pz[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  }
  private trackDist(x: number, z: number) {
    let b = Infinity;
    for (let i = 0; i < NS; i += 2) b = Math.min(b, (x - this.px[i]) ** 2 + (z - this.pz[i]) ** 2);
    return Math.sqrt(b);
  }

  private inst(geo: THREE.BufferGeometry, mat: THREE.Material, list: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; c?: string }[], cast = true) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    const col = new THREE.Color();
    list.forEach((o, i) => {
      this.q.setFromEuler(new THREE.Euler(0, o.ry ?? 0, 0));
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

  // ------------------------------------------------------------ the old town

  private buildTown() {
    const s = this.scene;
    const r = this.rnd;
    // cobblestones everywhere
    const cobble = canvasTex(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = "#b9ab95";
        g.fillRect(0, 0, w, h);
        const cols = ["#d8cbb4", "#cdbfa6", "#e2d6c0", "#c6b79c"];
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            g.fillStyle = cols[(x * 3 + y * 5) % 4];
            const ox = y % 2 ? 16 : 0;
            g.beginPath();
            g.roundRect(x * 32 + ox - 16 + 2, y * 32 + 2, 28, 28, 7);
            g.fill();
            g.beginPath();
            g.roundRect(x * 32 + ox + 16 + 2, y * 32 + 2, 28, 28, 7);
            g.fill();
          }
      },
      true,
    );
    cobble.repeat.set(60, 60);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshToonMaterial({ map: cobble }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    // the park in the infield
    const shape = new THREE.Shape();
    for (let i = 0; i < NS; i += 4) {
      const x = this.px[i] - this.nx[i] * 0,
        z = this.pz[i];
      if (i === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    }
    const park = new THREE.Mesh(new THREE.ShapeGeometry(shape), toon("#7ccf5a"));
    park.rotation.x = -Math.PI / 2;
    park.position.y = 0.015;
    park.receiveShadow = true;
    s.add(park);

    // candidates for houses, trees, stands
    const houses: { x: number; z: number; ry: number; w: number; d: number; h: number }[] = [];
    const trees: { x: number; z: number; s: number }[] = [];
    const nearestYaw = (x: number, z: number) => {
      let b = Infinity,
        bi = 0;
      for (let i = 0; i < NS; i += 3) {
        const d = (x - this.px[i]) ** 2 + (z - this.pz[i]) ** 2;
        if (d < b) {
          b = d;
          bi = i;
        }
      }
      return Math.atan2(this.px[bi] - x, this.pz[bi] - z);
    };
    // the stands (kept clear of houses)
    const standKs = [Math.round(NS * 0.06), Math.round(NS * 0.43), Math.round(NS * 0.26)];
    const standPos: { x: number; z: number }[] = [];
    standKs.forEach((k, n) => {
      const o = WALL + 3.4;
      const side = this.inside(this.px[k] + this.nx[k] * o, this.pz[k] + this.nz[k] * o) ? -1 : 1;
      this.stand(k, side, n === 0 ? 14 : 11, standPos);
    });
    for (let gx = -64; gx <= 64; gx += 7.5)
      for (let gz = -56; gz <= 44; gz += 7.5) {
        const x = gx + (r() - 0.5) * 1.5,
          z = gz + (r() - 0.5) * 1.5;
        const d = this.trackDist(x, z);
        if (this.inside(x, z)) {
          if (d > WALL + 2.6 && r() < 0.6) trees.push({ x, z, s: 1.1 + r() * 0.5 });
          continue;
        }
        if (standPos.some((p) => Math.hypot(p.x - x, p.z - z) < 10)) continue;
        if (z > 21) {
          // the near side (toward the TV): only trees, nothing that hides the karts
          if (d > WALL + 3 && r() < 0.5) trees.push({ x, z, s: 1.0 + r() * 0.4 });
          continue;
        }
        if (d < WALL + 6.5) {
          if (d > WALL + 2.4 && r() < 0.25) trees.push({ x, z, s: 0.9 + r() * 0.3 });
          continue;
        }
        if (d > WALL + 30) continue;
        houses.push({ x, z, ry: nearestYaw(x, z), w: 5.6 + r() * 1.2, d: 5.5, h: 5 + r() * 4.5 });
      }
    // houses: one instanced body (with a painted façade) + roofs + chimneys
    const facade = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, w, h);
      for (let fy = 0; fy < 3; fy++)
        for (let fx = 0; fx < 3; fx++) {
          const x = 30 + fx * 76,
            y = 26 + fy * 78;
          g.fillStyle = "#5b4a3e";
          g.fillRect(x - 12, y - 4, 64, 60);
          g.fillStyle = "#3d5a80";
          g.fillRect(x - 6, y, 52, 50);
          g.fillStyle = "#ffffff";
          g.fillRect(x + 17, y, 6, 50);
          g.fillRect(x - 6, y + 22, 52, 5);
          g.fillStyle = "#4f7a4a";
          g.fillRect(x - 20, y - 2, 10, 56);
          g.fillRect(x + 50, y - 2, 10, 56);
        }
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(0, h - 14, w, 14);
    });
    const pal = ["#f3d9a8", "#f0b48a", "#f7e6c4", "#cfe0a8", "#b6d4ea", "#f2b9a8", "#ead08a", "#dcc2e2", "#f6cfc0"];
    const roofs = ["#b8523a", "#9a3f2c", "#c4643f", "#6a7282"];
    const bodyList = houses.map((o) => ({ x: o.x, y: o.h / 2, z: o.z, sx: o.w, sy: o.h, sz: o.d, ry: o.ry, c: pal[Math.floor(r() * pal.length)] }));
    this.inst(GEO.box, new THREE.MeshToonMaterial({ map: facade }), bodyList);
    // a prism roof (ridge along x)
    const roofGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1);
    roofGeo.rotateZ(Math.PI / 2);
    roofGeo.rotateX(Math.PI / 6);
    roofGeo.scale(1, 1, 1);
    this.inst(
      roofGeo,
      toon("#ffffff"),
      houses.map((o) => ({ x: o.x, y: o.h + 0.75, z: o.z, sx: o.w + 0.5, sy: 1.6, sz: o.d * 0.62, ry: o.ry, c: roofs[Math.floor(r() * roofs.length)] })),
    );
    this.inst(
      GEO.box,
      toon("#8a5a44"),
      houses.filter((_, i) => i % 2 === 0).map((o) => ({ x: o.x + Math.cos(o.ry) * 1.5, y: o.h + 1.6, z: o.z - Math.sin(o.ry) * 1.5, sx: 0.5, sy: 1.2, sz: 0.5, ry: o.ry })),
    );
    // trees: trunks + leaf balls
    this.inst(GEO.cylLo, toon("#8a5a32"), trees.map((t) => ({ x: t.x, y: 0.6 * t.s, z: t.z, sx: 0.16 * t.s, sy: 1.2 * t.s, sz: 0.16 * t.s })));
    const leaf = ["#4fb54a", "#5cc44f", "#3f9e45", "#6bcf5a"];
    const leaves: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    for (const t of trees) {
      const c = leaf[Math.floor(r() * leaf.length)];
      leaves.push({ x: t.x, y: 1.6 * t.s, z: t.z, sx: 0.9 * t.s, sy: 0.85 * t.s, sz: 0.9 * t.s, c });
      leaves.push({ x: t.x + 0.4 * t.s, y: 2.15 * t.s, z: t.z + 0.1 * t.s, sx: 0.6 * t.s, sy: 0.6 * t.s, sz: 0.6 * t.s, c });
    }
    this.inst(GEO.sphereLo, toon("#ffffff"), leaves);

    // the fountain in the park
    const cx = -2,
      cz = -1;
    const f = group(s, { x: cx, z: cz });
    cyl(f, "#d8c7a4", 2.4, 0.6, { y: 0.3, seg: 28 });
    const water = new THREE.Mesh(GEO.circle, toon("#6fd0ff", "#2a8fd0", 0.4));
    water.rotation.x = -Math.PI / 2;
    water.scale.setScalar(2.15);
    water.position.y = 0.62;
    f.add(water);
    cyl(f, "#d8c7a4", 0.35, 1.8, { y: 1.2, seg: 12 });
    cyl(f, "#d8c7a4", 1.0, 0.22, { y: 2.0, seg: 20 });
    ball(f, "#ffc928", 0.4, { y: 2.5 });
    // flower beds around it
    const fl = ["#ff5a7a", "#ffd23f", "#ffffff", "#ff8ad8", "#8a6aff"];
    const beds: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      beds.push({ x: cx + Math.cos(a) * 3.4, y: 0.25, z: cz + Math.sin(a) * 3.4, sx: 0.5, sy: 0.45, sz: 0.5, c: "#3f9a3a" });
      beds.push({ x: cx + Math.cos(a) * 3.4, y: 0.62, z: cz + Math.sin(a) * 3.4, sx: 0.16, sy: 0.16, sz: 0.16, c: fl[i % fl.length] });
    }
    this.inst(GEO.sphereLo, toon("#ffffff"), beds, false);

    // a church tower over the roofs (far side)
    const ch = group(s, { x: -12, z: -34 });
    box(ch, "#e9dcc0", 5, 14, 5, { y: 7 });
    box(ch, "#d9c8a4", 5.4, 0.6, 5.4, { y: 14.2 });
    box(ch, "#e9dcc0", 3.6, 4, 3.6, { y: 16.5 });
    cone(ch, "#5f6f86", 2.8, 6, { y: 21.5, lo: true });
    ball(ch, "#ffc928", 0.3, { y: 24.7 });
    const clock = new THREE.Mesh(GEO.circle, flat("#ffffff"));
    clock.scale.setScalar(1.1);
    clock.position.set(0, 16.6, 1.82);
    ch.add(clock);
    box(ch, "#222", 0.1, 0.8, 0.05, { y: 16.9, z: 1.86 });
    box(ch, "#222", 0.6, 0.1, 0.05, { x: 0.25, y: 16.6, z: 1.86 });
  }

  /** A grandstand by sample k, on side `side` (+1 left of the track), `len` long. */
  private stand(k: number, side: number, len: number, list: { x: number; z: number }[]) {
    const off = WALL + 3.4;
    const x = this.px[k] + this.nx[k] * off * side,
      z = this.pz[k] + this.nz[k] * off * side;
    list.push({ x, z });
    // local +z faces the track
    const ry = Math.atan2(-this.nx[k] * side, -this.nz[k] * side);
    const g = group(this.scene, { x, z, ry });
    const steps = 3;
    for (let i = 0; i < steps; i++) box(g, i % 2 ? "#e9e4da" : "#d6cfc1", len, 0.5 + i * 0.55, 1.1, { y: (0.5 + i * 0.55) / 2, z: 1.1 - i * 1.1 });
    box(g, "#2f6fd6", len + 0.4, 0.2, 3.6, { y: 3.9, z: 0, rx: 0.12 });
    cyl(g, "#ddd", 0.08, 3.9, { x: -len / 2, y: 1.95, z: -1.2, seg: 6 });
    cyl(g, "#ddd", 0.08, 3.9, { x: len / 2, y: 1.95, z: -1.2, seg: 6 });
    // a banner on the front
    const txt = [T("GO ZEC GO!", "ZEC 冲啊！"), T("ZSTREET GP", "ZSTREET 大奖赛"), T("ROAD TO NU7", "迈向 NU7")][list.length % 3];
    const tex = canvasTex(512, 64, (c, w, h) => {
      c.fillStyle = ["#ffd23f", "#ff4b3e", "#3fcf5a"][list.length % 3];
      c.fillRect(0, 0, w, h);
      c.font = `48px ${FONT_TITLE}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "#1d1630";
      c.fillText(txt, w / 2, h / 2 + 3);
    });
    const ban = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex }));
    ban.scale.set(len * 0.7, len * 0.7 * (64 / 512), 1);
    ban.position.set(0, 0.45, 1.66);
    g.add(ban);
    // spectators
    const cols = ["#ff4b3e", "#2f8dff", "#ffd23f", "#3fcf5a", "#ff7ad9", "#9b5cff", "#ff9a2e", "#ffffff", "#30c0c0"];
    const skins = ["#f6d2b0", "#e0ac84", "#a8714a", "#f1c9a0"];
    g.updateMatrixWorld(true);
    for (let i = 0; i < steps; i++) {
      const n = Math.floor(len / 0.75);
      for (let j = 0; j < n; j++) {
        if (this.rnd() < 0.15) continue;
        const lp = new THREE.Vector3(-len / 2 + 0.4 + j * 0.75 + (this.rnd() - 0.5) * 0.2, 0.5 + i * 0.55, 1.1 - i * 1.1);
        lp.applyMatrix4(g.matrixWorld);
        this.crowdBase.push({ x: lp.x, y: lp.y, z: lp.z, ph: this.rnd() * 10, c: cols[Math.floor(this.rnd() * cols.length)], sk: skins[Math.floor(this.rnd() * skins.length)] });
      }
    }
  }

  private buildProps() {
    const s = this.scene;
    const r = this.rnd;
    // crowd (instanced, animated)
    const n = this.crowdBase.length;
    this.crowd = new THREE.InstancedMesh(GEO.capsule, toon("#ffffff"), n);
    this.crowdHeads = new THREE.InstancedMesh(GEO.sphereLo, toon("#ffffff"), n);
    const col = new THREE.Color();
    this.crowdBase.forEach((c, i) => {
      this.crowd.setColorAt(i, col.set(c.c));
      this.crowdHeads.setColorAt(i, col.set(c.sk));
    });
    this.crowd.castShadow = true;
    s.add(this.crowd, this.crowdHeads);
    this.instanced.push(this.crowd, this.crowdHeads);
    this.animCrowd(0, 0.3);

    // tyre stacks on the outside of the tight bends
    const tyres: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c?: string }[] = [];
    for (let k = 0; k < NS; k += 9) {
      const c = this.curv[k];
      if (Math.abs(c) < 0.075) continue;
      const side = -Math.sign(c);
      const off = WALL + 0.95;
      const x = this.px[k] + this.nx[k] * off * side,
        z = this.pz[k] + this.nz[k] * off * side;
      for (let h = 0; h < 3; h++) tyres.push({ x, y: 0.17 + h * 0.32, z, sx: 0.5, sy: 0.3, sz: 0.5, c: h === 1 ? "#f4f4f4" : "#26262c" });
    }
    this.inst(new THREE.CylinderGeometry(1, 1, 1, 12), toon("#ffffff"), tyres);

    // start/finish gantry with lights and a banner
    const k0 = 0;
    const yaw = Math.atan2(this.tx[k0], this.tz[k0]);
    const gan = group(s, { x: this.px[k0], z: this.pz[k0], ry: yaw });
    const span = WALL + 0.8;
    for (const sx of [-1, 1]) {
      box(gan, "#e8e4dc", 0.4, 5.2, 0.4, { x: sx * span, y: 2.6 });
      box(gan, "#d8352d", 0.44, 0.5, 0.44, { x: sx * span, y: 0.25 });
    }
    box(gan, "#e8e4dc", span * 2 + 0.4, 0.5, 0.5, { y: 5.1 });
    const banTex = canvasTex(1024, 128, (c, w, h) => {
      c.fillStyle = "#1d1630";
      c.fillRect(0, 0, w, h);
      for (let x = 0; x < 16; x++)
        for (let y = 0; y < 2; y++) {
          c.fillStyle = (x + y) % 2 ? "#fff" : "#1d1630";
          c.fillRect(x * 16, y * 64, 16, 64);
          c.fillRect(w - 256 + x * 16, y * 64, 16, 64);
        }
      const word = T("ZSTREET GP", "ZSTREET 大奖赛");
      // (between the chequered ends: smaller if it would not fit)
      let px = 84;
      c.font = `${px}px ${FONT_TITLE}`;
      while (px > 40 && c.measureText(word).width > w - 560) c.font = `${(px -= 4)}px ${FONT_TITLE}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "#ffd23f";
      c.fillText(word, w / 2, h / 2 + 5);
    });
    const banMat = new THREE.MeshBasicMaterial({ map: banTex, side: THREE.DoubleSide });
    const ban = new THREE.Mesh(GEO.plane, banMat);
    ban.scale.set(span * 2, (span * 2) / 8, 1);
    ban.position.set(0, 4.15, 0);
    gan.add(ban);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(GEO.sphereLo, flat("#5a1010"));
      m.scale.setScalar(0.22);
      m.position.set((i - 2) * 0.6, 5.1, 0.3);
      gan.add(m);
      this.lights.push(m);
    }
    // bunting across the road at a few places
    const flagGeo = new THREE.BufferGeometry();
    flagGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-0.25, 0, 0, 0.25, 0, 0, 0, -0.5, 0]), 3));
    flagGeo.computeVertexNormals();
    const fcols = ["#ff4b3e", "#ffd23f", "#2f8dff", "#3fcf5a", "#ffffff", "#ff7ad9"];
    const fl: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; c: string }[] = [];
    for (const kk of [Math.round(NS * 0.2), Math.round(NS * 0.55), Math.round(NS * 0.8)]) {
      const span2 = WALL + 0.6;
      const ax = this.px[kk] + this.nx[kk] * span2,
        az = this.pz[kk] + this.nz[kk] * span2;
      const bx = this.px[kk] - this.nx[kk] * span2,
        bz = this.pz[kk] - this.nz[kk] * span2;
      cyl(s, "#5a4a3a", 0.1, 4.6, { x: ax, y: 2.3, z: az, seg: 6 });
      cyl(s, "#5a4a3a", 0.1, 4.6, { x: bx, y: 2.3, z: bz, seg: 6 });
      const ry = Math.atan2(this.tx[kk], this.tz[kk]) + Math.PI / 2;
      const nF = 14;
      for (let i = 0; i <= nF; i++) {
        const t = i / nF;
        fl.push({ x: ax + (bx - ax) * t, y: 4.5 - Math.sin(t * Math.PI) * 0.7, z: az + (bz - az) * t, sx: 1, sy: 1, sz: 1, ry, c: fcols[i % fcols.length] });
      }
    }
    const fm = new THREE.MeshToonMaterial({ color: "#ffffff", side: THREE.DoubleSide });
    this.inst(flagGeo, fm, fl, false);

    // oil slicks
    const oilTex = canvasTex(128, 128, (g, w) => {
      g.translate(w / 2, w / 2);
      g.fillStyle = "#15121c";
      g.beginPath();
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const rr = 44 + Math.sin(i * 2.7) * 9 + Math.cos(i * 1.3) * 6;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.fill();
      const gr = g.createRadialGradient(-10, -10, 2, -6, -6, 34);
      gr.addColorStop(0, "rgba(180,120,255,0.55)");
      gr.addColorStop(0.4, "rgba(80,200,255,0.35)");
      gr.addColorStop(0.7, "rgba(120,255,160,0.2)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(-6, -6, 34, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.5)";
      g.beginPath();
      g.ellipse(-16, -18, 10, 4, -0.6, 0, Math.PI * 2);
      g.fill();
    });
    const oilMat = new THREE.MeshBasicMaterial({ map: oilTex, transparent: true, depthWrite: false });
    const slickAt = [0.2, 0.42, 0.71, 0.93];
    slickAt.forEach((f, n) => {
      const k = Math.round(NS * (f + (r() - 0.5) * 0.03)) % NS;
      const u = (r() < 0.5 ? -1 : 1) * (0.6 + r() * 1.8) * (n % 2 ? 1 : -1);
      const x = this.px[k] + this.nx[k] * u,
        z = this.pz[k] + this.nz[k] * u;
      const m = new THREE.Mesh(GEO.plane, oilMat);
      m.rotation.set(-Math.PI / 2, 0, r() * 6);
      m.scale.setScalar(2.8);
      m.position.set(x, 0.06, z);
      m.renderOrder = 1;
      s.add(m);
      this.slicks.push({ k, u, x, z, r: 1.15 });
    });

    // boost pads (chevrons)
    this.padTex = canvasTex(
      128,
      128,
      (g, w, h) => {
        g.fillStyle = "#ff8a1e";
        g.fillRect(0, 0, w, h);
        g.strokeStyle = "#fff36a";
        g.lineWidth = 16;
        g.lineCap = "round";
        g.lineJoin = "round";
        for (const y of [10, 74]) {
          g.beginPath();
          g.moveTo(22, y);
          g.lineTo(64, y + 36);
          g.lineTo(106, y);
          g.stroke();
        }
      },
      true,
    );
    this.padTex.repeat.set(1, 1);
    const padMat = new THREE.MeshBasicMaterial({ map: this.padTex });
    const padAt = [0.1, 0.31, 0.62, 0.84];
    padAt.forEach((f, n) => {
      const k = Math.round(NS * f) % NS;
      const u = [1.5, -1.6, 0.0, -1.2][n];
      const x = this.px[k] + this.nx[k] * u,
        z = this.pz[k] + this.nz[k] * u;
      const pg = group(s, { x, y: 0.065, z, ry: Math.atan2(this.tx[k], this.tz[k]) });
      box(pg, "#3a2a1a", 2.0, 0.04, 2.3, { y: -0.01, cast: false });
      const m = new THREE.Mesh(GEO.plane, padMat);
      m.rotation.x = -Math.PI / 2;
      m.scale.set(1.7, 2.0, 1);
      m.position.y = 0.02;
      pg.add(m);
      this.boostPads.push({ k, u, x, z, m });
    });
  }

  private animCrowd(t: number, hype: number) {
    this.crowdBase.forEach((c, i) => {
      const j = Math.max(0, Math.sin(t * (6 + (c.ph % 3)) + c.ph)) * 0.22 * hype;
      this.q.identity();
      this.m4.compose(this.v3.set(c.x, c.y + 0.42 + j, c.z), this.q, this.s3.set(0.5, 0.42, 0.5));
      this.crowd.setMatrixAt(i, this.m4);
      this.m4.compose(this.v3.set(c.x, c.y + 0.98 + j, c.z), this.q, this.s3.set(0.2, 0.2, 0.2));
      this.crowdHeads.setMatrixAt(i, this.m4);
    });
    this.crowd.instanceMatrix.needsUpdate = true;
    this.crowdHeads.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ karts

  private makeKart(color: string, dark: string) {
    const g = group(this.scene);
    const body = group(g);
    box(body, "#2b2b36", 1.2, 0.12, 2.0, { y: 0.2 });
    box(body, color, 0.3, 0.3, 1.0, { x: 0.52, y: 0.36, z: -0.05 });
    box(body, color, 0.3, 0.3, 1.0, { x: -0.52, y: 0.36, z: -0.05 });
    box(body, color, 0.92, 0.26, 0.62, { y: 0.38, z: 0.78, rx: -0.22 });
    box(body, "#ffffff", 0.5, 0.02, 0.36, { y: 0.52, z: 0.8, rx: -0.22, cast: false });
    box(body, "#202028", 1.25, 0.14, 0.16, { y: 0.24, z: 1.08 });
    box(body, "#202028", 1.25, 0.18, 0.16, { y: 0.26, z: -1.02 });
    box(body, dark, 0.62, 0.6, 0.14, { y: 0.6, z: -0.55, rx: -0.2 });
    box(body, "#9097a4", 0.46, 0.32, 0.34, { x: 0.28, y: 0.4, z: -0.82 });
    cyl(body, "#1d1d22", 0.04, 0.5, { y: 0.56, z: 0.36, rx: -0.7, seg: 6 });
    const sw = new THREE.Mesh(GEO.torus, toon("#1d1d22"));
    sw.scale.setScalar(0.17);
    sw.position.set(0, 0.74, 0.22);
    sw.rotation.x = -0.6;
    body.add(sw);
    const wheelGeo = this.wheelGeo;
    const wheels: THREE.Mesh[] = [];
    const steerPiv: THREE.Group[] = [];
    for (const [wx, wz, rr] of [
      [0.66, 0.66, 0.24],
      [-0.66, 0.66, 0.24],
      [0.68, -0.66, 0.29],
      [-0.68, -0.66, 0.29],
    ]) {
      const piv = group(body, { x: wx, y: rr, z: wz });
      const w = new THREE.Mesh(wheelGeo, toon("#1c1c22"));
      w.scale.set(1, rr / 0.28, rr / 0.28);
      w.castShadow = true;
      piv.add(w);
      const hub = new THREE.Mesh(GEO.cylLo, toon("#c8ccd4"));
      hub.rotation.z = Math.PI / 2;
      hub.scale.set(rr * 0.45, 0.28, rr * 0.45);
      w.add(hub);
      wheels.push(w);
      if (wz > 0) steerPiv.push(piv);
    }
    const flame = new THREE.Mesh(GEO.coneLo, flat("#ffb02e", 0.9, true));
    flame.rotation.x = -Math.PI / 2;
    flame.scale.set(0.18, 0.7, 0.18);
    flame.position.set(0.28, 0.42, -1.35);
    flame.visible = false;
    body.add(flame);
    const ring = new THREE.Mesh(GEO.ring, flat(color, 0.85));
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(1.25);
    ring.position.y = 0.07;
    ring.renderOrder = 2;
    g.add(ring);
    return { g, body, wheels, steerPiv, flame };
  }
  private _wheelGeo: THREE.CylinderGeometry | null = null;
  private get wheelGeo() {
    if (!this._wheelGeo) {
      this._wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.26, 14);
      this._wheelGeo.rotateZ(Math.PI / 2);
    }
    return this._wheelGeo;
  }

  private placeKarts() {
    const order = [0, 1, 2, 3].slice(0, this.players.length);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    this.players.forEach((p, i) => {
      const slot = order.indexOf(i);
      const back = 3 + slot * 2.4;
      const kk = Math.round(back / this.ds);
      const k = (NS - kk) % NS;
      const u = slot % 2 ? -1.6 : 1.6;
      const x = this.px[k] + this.nx[k] * u,
        z = this.pz[k] + this.nz[k] * u;
      const dark = lum(p.char.color) > 0.8 ? "#3a3a46" : p.char.dark;
      const m = this.makeKart(p.char.color, dark);
      const a = this.spawn(i, 0, 0, 0, { blob: false, scale: 0.78 });
      m.body.add(a.root);
      a.pos.set(0, 0.3, -0.12);
      a.anim = "sit";
      const h = Math.atan2(this.tx[k], this.tz[k]);
      const bg = lum(p.char.color) > 0.8 ? p.char.dark : p.char.color;
      const label = this.hud.label(m.g, `${slot + 1}`, { dy: 2.1, color: bg, cls: "big" });
      label.style.border = "calc(var(--u)*0.25) solid #fff";
      this.karts.push({
        ...m,
        label,
        x,
        z,
        h,
        v: 0,
        vx: 0,
        vz: 0,
        k,
        kp: -kk,
        prog: -back,
        lap: 0,
        boosts: 2,
        boostT: 0,
        spinT: 0,
        spinA: 0,
        safeT: 0,
        wallCd: 0,
        bumpCd: 0,
        padCd: [0, 0, 0, 0],
        steer: 0,
        done: false,
        finishT: 0,
        place: slot + 1,
        avoid: new Map(),
        smokeT: 0,
        u,
        aim: h,
      });
      m.g.position.set(x, 0, z);
      m.g.rotation.y = h;
    });
    this.rank();
  }

  private cardHtml(i: number) {
    const k = this.karts[i];
    const place = k ? k.place : i + 1;
    const lap = k ? clamp(Math.floor(k.prog / this.L) + 1, 1, LAPS) : 1;
    const boosts = k ? k.boosts : 2;
    let pips = "";
    for (let b = 0; b < MAX_BOOSTS; b++) pips += `<span style="opacity:${b < boosts ? 1 : 0.25}">⚡</span>`;
    const lapTxt = k?.done ? T("Finished!", "完赛！") : T(`Lap ${lap}/${LAPS}`, `第 ${lap}/${LAPS} 圈`);
    return `${placeTxt(place)} <span style="font-size:calc(var(--u)*1.4);font-family:inherit;opacity:0.9">${lapTxt}</span><div style="font-size:calc(var(--u)*1.3);line-height:1.2;letter-spacing:0.1em">${pips}</div>`;
  }

  // ------------------------------------------------------------ helpers

  private nearest(x: number, z: number, k0: number, win = 26) {
    let best = k0,
      bd = Infinity;
    for (let d = -win; d <= win; d++) {
      const k = (k0 + d + NS) % NS;
      const dx = x - this.px[k],
        dz = z - this.pz[k];
      const dd = dx * dx + dz * dz;
      if (dd < bd) {
        bd = dd;
        best = k;
      }
    }
    return best;
  }

  /** Places: finished karts by time, then by progress. */
  private rank() {
    const idx = this.karts.map((_, i) => i);
    idx.sort((a, b) => {
      const A = this.karts[a],
        B = this.karts[b];
      if (A.done && B.done) return A.finishT - B.finishT;
      if (A.done) return -1;
      if (B.done) return 1;
      return B.prog - A.prog;
    });
    idx.forEach((i, n) => {
      const k = this.karts[i];
      if (k.place !== n + 1 || !k.label.dataset.p) {
        k.place = n + 1;
        k.label.dataset.p = "1";
        k.label.textContent = `${n + 1}`;
      }
    });
    return idx;
  }

  /** Where kart i wants to go (CPUs, and every kart once it has finished). */
  private drive(i: number, auto: boolean, dt = 1 / 60): CpuPad {
    const k = this.karts[i];
    const lv = auto ? 0.8 : this.players[i].level;
    const ahead = 4 + 2.6 * lv + k.v * 0.16;
    const j = (k.k + Math.round(ahead / this.ds)) % NS;
    let off = this.line[j] * (0.3 + 0.7 * lv);
    off += Math.sin(this.t * 0.8 + i * 2.1) * (1 - lv) * 1.5;
    let jT = j;
    if (!auto) {
      // grab a boost pad when low on charges
      if (k.boosts < MAX_BOOSTS)
        this.boostPads.forEach((p, n) => {
          const dist = ((((p.k - k.k) % NS) + NS) % NS) * this.ds;
          if (dist > 1 && dist < 13 && ((i + n) % 3 !== 0 || lv > 0.7)) off = p.u;
        });
      // overtake: don't drive into the kart just ahead
      for (let o = 0; o < this.karts.length; o++) {
        if (o === i) continue;
        const B = this.karts[o];
        const gap = B.prog - k.prog;
        if (gap > 0 && gap < 3.5 && Math.abs(B.u - off) < 1.4) off = B.u + (off >= B.u ? 1.6 : -1.6);
      }
      // dodge oil slicks (or not…): this comes first of all
      this.slicks.forEach((o, n) => {
        const dist = ((((o.k - k.k) % NS) + NS) % NS) * this.ds;
        if (dist > 0 && dist < 18) {
          if (!k.avoid.has(n)) k.avoid.set(n, this.cpuChance(i, 0.25, 0.97));
          if (!k.avoid.get(n)) return;
          const side = Math.abs(o.u) > 1.2 ? -Math.sign(o.u) : k.u >= o.u ? 1 : -1;
          const clear = clamp(o.u + side * 2.5, -HW + 0.6, HW - 0.6);
          if (dist <= ahead + 2) {
            // aim right at the clear side of the slick
            jT = o.k;
            off = clear;
          } else if (Math.abs(off - o.u) < 2.5) off = clear;
        } else if (dist > NS * this.ds - 6) k.avoid.delete(n);
      });
    }
    off = clamp(off, -HW + 0.6, HW - 0.6);
    const txp = this.px[jT] + this.nx[jT] * off,
      tzp = this.pz[jT] + this.nz[jT] * off;
    const dx = txp - k.x,
      dz = tzp - k.z;
    const l = Math.hypot(dx, dz) || 1;
    // boost on a straight
    let a = false;
    if (!auto && k.boosts > 0 && k.boostT <= 0 && k.spinT <= 0) {
      let straight = true;
      for (let d = 0; d < Math.round(16 / this.ds); d += 4) if (Math.abs(this.curv[(k.k + d) % NS]) > 0.03 + (1 - lv) * 0.05) straight = false;
      if (straight && Math.random() < (0.3 + 1.5 * lv) * dt) a = true;
      if (!straight && Math.random() < (1 - lv) * 0.25 * dt) a = true;
    }
    // weaker drivers react late: their aim lags behind where they should point
    const want = Math.atan2(dx / l, dz / l);
    if (auto) k.aim = want;
    else k.aim = turnToward(k.aim, want, (1.6 + 9 * lv * lv) * dt);
    return { x: Math.sin(k.aim), y: Math.cos(k.aim), a };
  }

  protected cpu(i: number, dt: number): CpuPad {
    return this.drive(i, false, dt);
  }

  // ------------------------------------------------------------ the race

  start() {
    for (const m of this.lights) m.material = flat("#3fff6a");
    this.sound("go");
    this.sound("engine");
    music.speed(1.05);
  }

  protected idle(dt: number) {
    for (const m of this.lights) m.material = flat("#ff2a2a");
    this.animCrowd(performance.now() / 1000, 0.3);
    this.padTex.offset.y = (this.padTex.offset.y + dt * 1.2) % 1;
    for (const k of this.karts) k.body.position.y = Math.abs(Math.sin(performance.now() / 60 + k.x)) * 0.02;
    this.frameCam(dt, 1.2, false, 0.55);
  }

  private frameCam(dt: number, rate: number, snap = false, zoom = 1) {
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (const k of this.karts) {
      x0 = Math.min(x0, k.x);
      x1 = Math.max(x1, k.x);
      z0 = Math.min(z0, k.z);
      z1 = Math.max(z1, k.z);
    }
    if (!this.karts.length) {
      x0 = -5;
      x1 = 5;
      z0 = 10;
      z1 = 16;
    }
    const cx = clamp((x0 + x1) / 2, -20, 18),
      cz = clamp((z0 + z1) / 2, -13, 12);
    const hx = Math.max(Math.abs(x1 - cx), Math.abs(x0 - cx)) + 7,
      hz = Math.max(Math.abs(z1 - cz), Math.abs(z0 - cz)) + 6;
    const vf = (this.camera.fov * Math.PI) / 180;
    const asp = this.camera.aspect || 16 / 9;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * asp);
    const pitch = 1.0;
    const d = clamp(Math.max(hx / Math.tan(hf / 2), (hz * Math.sin(pitch)) / Math.tan(vf / 2)) / zoom, 22, 60);
    this.camC.set(cx, 0, cz);
    const pos: [number, number, number] = [cx, Math.sin(pitch) * d, cz + Math.cos(pitch) * d];
    const look: [number, number, number] = [cx, 0, cz - 1];
    if (snap) this.setCam(pos, look, 40);
    else this.moveCam(pos, look, dt, rate);
  }

  protected step(dt: number) {
    const tt = this.t;
    this.padTex.offset.y = (this.padTex.offset.y + dt * 1.6) % 1;
    for (const p of this.boostPads) p.m.scale.set(1.7, 2.0 + Math.sin(tt * 8) * 0.08, 1);
    this.animCrowd(tt, 1);

    for (let i = 0; i < this.karts.length; i++) this.moveKart(i, dt);
    this.bumps();
    const order = this.rank();

    // leader lap banner
    const lead = this.karts[order[0]];
    const leadLap = clamp(Math.floor(lead.prog / this.L) + 1, 1, LAPS);
    if (leadLap !== this.lastLeaderLap && !lead.done) {
      this.lastLeaderLap = leadLap;
      this.lapEl.firstElementChild!.textContent = leadLap === LAPS ? T("FINAL LAP", "最后一圈") : T(`LAP ${leadLap}/${LAPS}`, `第 ${leadLap}/${LAPS} 圈`);
      if (leadLap === LAPS) {
        this.hud.banner(T("Final lap!", "最后一圈！"), { color: "#ffd23f" });
        this.sound("bell");
        music.speed(1.15);
      }
    }
    this.players.forEach((p, i) => {
      const h = this.cardHtml(i);
      if (h !== this.cards[i]) {
        this.cards[i] = h;
        this.hud.setScore(p.seat, h);
      }
    });

    // the end: everyone in, 15 s after the winner, or 90 s
    let left = CAP - tt;
    if (this.firstDoneT >= 0) left = Math.min(left, this.firstDoneT + GRACE - tt);
    if (left <= 10 && this.doneCount < this.karts.length) {
      this.hud.timer(left);
      if (!this.endBanner) {
        this.endBanner = true;
        if (this.firstDoneT < 0) this.hud.banner(T("10 seconds left!", "还剩 10 秒！"), { color: "#ffd23f", size: 6 });
      }
    }
    this.frameCam(dt, 2.2);
    if (this.doneCount >= this.karts.length || left <= 0) {
      const place = this.karts.map(() => 0);
      order.forEach((i, n) => (place[i] = n + 1));
      this.hud.timer(null);
      this.finish(place);
    }
  }

  private moveKart(i: number, dt: number) {
    const k = this.karts[i];
    const pad = k.done ? this.drive(i, true) : this.pad(i);
    const tt = this.t;
    k.wallCd -= dt;
    k.bumpCd -= dt;
    k.safeT -= dt;
    k.smokeT -= dt;
    for (let n = 0; n < k.padCd.length; n++) k.padCd[n] -= dt;

    // steering: turn toward the stick's direction (camera-relative = world x/z)
    let steerAmt = 0;
    const sl = Math.hypot(pad.x ?? 0, pad.y ?? 0);
    if (k.spinT <= 0 && sl > 0.3) {
      const want = Math.atan2(pad.x ?? 0, pad.y ?? 0);
      const diff = angDiff(k.h, want);
      const rate = TURN * (1.15 - 0.3 * clamp(k.v / VBOOST, 0, 1));
      const step = clamp(diff, -rate * dt, rate * dt);
      k.h += step;
      steerAmt = clamp(diff / 0.9, -1, 1);
    }
    k.steer = damp(k.steer, steerAmt, 10, dt);

    // boost
    const aDown = k.done ? false : (pad as { aDown?: boolean }).aDown;
    if (aDown && k.boosts > 0 && k.boostT <= 0 && k.spinT <= 0) {
      k.boosts--;
      k.boostT = BOOST_T;
      this.sound("whoosh");
      this.sound("power");
      this.buzz(i, 40);
      this.fx.burst({ x: k.x - Math.sin(k.h) * 1.2, y: 0.5, z: k.z - Math.cos(k.h) * 1.2 }, { count: 14, colors: ["#ffe14a", "#ff9a2e", "#ffffff"], speed: 4, size: 0.18, life: 0.5, shape: "ball" });
    }
    if (k.boostT > 0) k.boostT -= dt;

    // speed
    let vt = k.done ? VMAX * 0.7 : k.boostT > 0 ? VBOOST : VMAX;
    if (Math.abs(k.u) > HW) vt *= 0.8;
    vt *= 1 - 0.12 * Math.abs(k.steer);
    if (k.spinT > 0) vt = 3;
    k.v += clamp(vt - k.v, -14 * dt, (k.v < 6 ? 11 : 7) * dt);

    // velocity follows the heading (a little slide)
    const grip = k.spinT > 0 ? 1.2 : 7.5;
    const g = 1 - Math.exp(-grip * dt);
    k.vx += (Math.sin(k.h) * k.v - k.vx) * g;
    k.vz += (Math.cos(k.h) * k.v - k.vz) * g;
    k.x += k.vx * dt;
    k.z += k.vz * dt;

    // where on the track
    const prevK = k.k;
    k.k = this.nearest(k.x, k.z, k.k);
    let dk = k.k - prevK;
    if (dk > NS / 2) dk -= NS;
    if (dk < -NS / 2) dk += NS;
    k.kp += dk;
    const nk = k.k;
    const along = (k.x - this.px[nk]) * this.tx[nk] + (k.z - this.pz[nk]) * this.tz[nk];
    k.u = (k.x - this.px[nk]) * this.nx[nk] + (k.z - this.pz[nk]) * this.nz[nk];
    k.prog = k.kp * this.ds + along;

    // barriers
    const lim = WALL - 0.55;
    if (Math.abs(k.u) > lim) {
      const sg = Math.sign(k.u);
      const over = Math.abs(k.u) - lim;
      k.x -= this.nx[nk] * sg * over;
      k.z -= this.nz[nk] * sg * over;
      k.u = sg * lim;
      const vn = (k.vx * this.nx[nk] + k.vz * this.nz[nk]) * sg;
      if (vn > 0) {
        k.vx -= this.nx[nk] * sg * vn * 1.5;
        k.vz -= this.nz[nk] * sg * vn * 1.5;
        k.v *= 1 - 0.45 * clamp(vn / 8, 0, 1);
        // turn along the barrier
        const th = Math.atan2(this.tx[nk], this.tz[nk]);
        const fwd = Math.abs(angDiff(k.h, th)) < Math.PI / 2 ? th : th + Math.PI;
        k.h = turnToward(k.h, fwd, 0.5 * clamp(vn / 4, 0.2, 1));
        if (vn > 2.5 && k.wallCd <= 0) {
          k.wallCd = 0.35;
          const cx = k.x + this.nx[nk] * sg * 0.6,
            cz = k.z + this.nz[nk] * sg * 0.6;
          this.fx.burst({ x: cx, y: 0.5, z: cz }, { count: 12, colors: ["#ffe14a", "#ffb02e", "#ffffff"], speed: 5, size: 0.1, life: 0.35, shape: "cube", gravity: 12 });
          this.sound("bonk");
          this.buzz(i, 50);
          if (!this.players[i].cpu) this.shake = Math.max(this.shake, 0.25);
        }
      }
    }

    // laps
    const lap = Math.floor(k.prog / this.L);
    if (lap > k.lap && !k.done) {
      k.lap = lap;
      if (lap >= LAPS) {
        k.done = true;
        k.finishT = this.t;
        this.doneCount++;
        const first = this.firstDoneT < 0;
        if (first) {
          this.firstDoneT = this.t;
          this.hud.banner(T(`${this.players[i].name} wins!`, `${this.players[i].name} 获胜！`), { color: "#ffd23f", sub: T(`The rest have ${GRACE} seconds to finish`, `其他人还有 ${GRACE} 秒冲线`) });
          this.sound("fanfare");
        } else this.sound("cheer");
        this.fx.confetti({ x: k.x, y: 2, z: k.z }, 50);
        this.hud.pop(new THREE.Vector3(k.x, 2.6, k.z), placeTxt(this.doneCount), "#ffe14a", this.camera);
        this.hud.mark(this.players[i].seat, "win", first);
        this.avatars[i].anim = "win";
        this.buzz(i, [60, 40, 120]);
      } else {
        this.hud.pop(new THREE.Vector3(k.x, 2.6, k.z), lap === LAPS - 1 ? T("Final lap", "最后一圈") : T(`Lap ${lap + 1}`, `第 ${lap + 1} 圈`), "#ffffff", this.camera);
        this.sound("ding");
      }
    }

    // oil
    if (k.spinT <= 0 && k.safeT <= 0)
      for (const o of this.slicks) {
        if (Math.hypot(k.x - o.x, k.z - o.z) < o.r + 0.25) {
          k.spinT = SPIN_T;
          k.safeT = SPIN_T + 0.8;
          k.v *= 0.5;
          k.boostT = 0;
          this.sound("slide");
          this.sound("squeak");
          this.buzz(i, [80, 40, 80]);
          this.fx.burst({ x: k.x, y: 0.3, z: k.z }, { count: 14, colors: ["#15121c", "#3a2f4a", "#7a5cff"], speed: 3, up: 3, size: 0.14, life: 0.6, shape: "ball", gravity: 14 });
          this.hud.pop(new THREE.Vector3(k.x, 2.4, k.z), T("Spin out!", "打滑！"), "#c9a0ff", this.camera);
          break;
        }
      }
    if (k.spinT > 0) {
      k.spinT -= dt;
      k.spinA += dt * 13 * Math.max(0.3, k.spinT / SPIN_T);
      if (k.spinT <= 0) k.spinA = 0;
      if (Math.random() < 0.4) this.fx.dust({ x: k.x, y: 0, z: k.z }, 1, "#d8d8e0");
    }

    // pads
    this.boostPads.forEach((p, n) => {
      if (k.padCd[n] > 0 || k.done) return;
      if (Math.hypot(k.x - p.x, k.z - p.z) < 1.35) {
        k.padCd[n] = 2;
        const had = k.boosts;
        k.boosts = Math.min(MAX_BOOSTS, k.boosts + 1);
        k.boostT = Math.max(k.boostT, 0.4);
        k.v = Math.max(k.v, VMAX + 2);
        this.sound(had < MAX_BOOSTS ? "power" : "whoosh");
        this.fx.sparkle({ x: k.x, y: 0.8, z: k.z }, "#ffd23f", 14);
        if (had < MAX_BOOSTS) this.hud.pop(new THREE.Vector3(k.x, 2.4, k.z), "+1 ⚡", "#ffd23f", this.camera);
      }
    });

    // visuals
    k.g.position.set(k.x, 0, k.z);
    k.g.rotation.y = k.h;
    k.body.rotation.y = k.spinA;
    k.body.rotation.z = -k.steer * 0.09 * clamp(k.v / VMAX, 0, 1.3);
    k.body.position.y = Math.abs(Math.sin(tt * 30 + i)) * 0.015 * (k.v / VMAX);
    k.body.rotation.x = k.boostT > 0 ? -0.05 : 0;
    for (const w of k.wheels) w.rotation.x += (k.v * dt) / 0.26;
    for (const p of k.steerPiv) p.rotation.y = k.steer * 0.45;
    k.flame.visible = k.boostT > 0;
    if (k.boostT > 0) {
      k.flame.scale.set(0.18, 0.6 + Math.random() * 0.5, 0.18);
      if (Math.random() < 0.5) this.fx.burst({ x: k.x - Math.sin(k.h) * 1.3, y: 0.45, z: k.z - Math.cos(k.h) * 1.3 }, { count: 1, colors: ["#ff9a2e", "#ffe14a"], speed: 1, size: 0.16, life: 0.3, shape: "ball", gravity: -1 });
    }
    if (Math.abs(k.steer) > 0.75 && k.v > 8 && k.smokeT <= 0) {
      k.smokeT = 0.08;
      this.fx.dust({ x: k.x - Math.sin(k.h) * 0.8, y: 0, z: k.z - Math.cos(k.h) * 0.8 }, 1, "#e6e6ea");
    }
  }

  private bumps() {
    const K = this.karts;
    for (let a = 0; a < K.length; a++)
      for (let b = a + 1; b < K.length; b++) {
        const A = K[a],
          B = K[b];
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d >= KR * 2 || d < 1e-4) continue;
        const nx = dx / d,
          nz = dz / d;
        const push = (KR * 2 - d) / 2;
        A.x -= nx * push;
        A.z -= nz * push;
        B.x += nx * push;
        B.z += nz * push;
        const rel = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz;
        if (rel > 0) {
          const j = rel * 0.9;
          A.vx -= nx * j;
          A.vz -= nz * j;
          B.vx += nx * j;
          B.vz += nz * j;
          if (rel > 2 && A.bumpCd <= 0) {
            A.bumpCd = B.bumpCd = 0.4;
            this.sound("thud");
            this.fx.burst({ x: A.x + nx * KR, y: 0.6, z: A.z + nz * KR }, { count: 6, colors: ["#ffffff", "#ffe14a"], speed: 3, size: 0.1, life: 0.3 });
            this.buzz(a, 30);
            this.buzz(b, 30);
          }
        }
      }
  }

  protected outroStep(dt: number) {
    this.animCrowd(this.t + performance.now() / 1000, 1.3);
    this.padTex.offset.y = (this.padTex.offset.y + dt * 1.6) % 1;
    for (const k of this.karts) {
      k.v = damp(k.v, 0, 1.5, dt);
      k.vx = Math.sin(k.h) * k.v;
      k.vz = Math.cos(k.h) * k.v;
      k.x += k.vx * dt;
      k.z += k.vz * dt;
      const nk = (k.k = this.nearest(k.x, k.z, k.k));
      const u = (k.x - this.px[nk]) * this.nx[nk] + (k.z - this.pz[nk]) * this.nz[nk];
      if (Math.abs(u) > WALL - 0.55) {
        const sg = Math.sign(u);
        const over = Math.abs(u) - (WALL - 0.55);
        k.x -= this.nx[nk] * sg * over;
        k.z -= this.nz[nk] * sg * over;
      }
      k.g.position.set(k.x, 0, k.z);
      k.spinA = 0;
      k.body.rotation.set(0, 0, 0);
      k.flame.visible = false;
      for (const w of k.wheels) w.rotation.x += (k.v * dt) / 0.26;
    }
    this.frameCam(dt, 2);
  }

  /** Winners cheer in their seat, the others stay seated. */
  protected celebrate(res: MiniResult) {
    this.avatars.forEach((a, i) => {
      if (a) a.anim = res.place[i] === 1 ? "win" : "sit";
    });
  }

  dispose() {
    for (const m of this.instanced) m.dispose();
    this._wheelGeo?.dispose();
    super.dispose();
  }
}

const def: MiniDef = {
  id: "grand-prix",
  name: "Mini Grand Prix",
  icon: "🏎️",
  color: "#ff3b3b",
  tagline: "Three laps of karting, no mercy.",
  rules: "Your kart drives itself: point the stick where you want to go. A fires a turbo; the orange pads refill it. Dodge the oil, 3 laps!",
  controls: { stick: "Steer the kart", a: "Turbo" },
  modes: ["ffa"],
  length: 45,
  music: "mini2",
  create: (ctx) => new GrandPrix(ctx),
};
export default def;
