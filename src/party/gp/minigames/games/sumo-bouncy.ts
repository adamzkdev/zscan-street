/**
 * SUMO BOUNCY (chacun pour soi, 60 s max): everyone sits on a giant bouncy ball of their colour on a
 * round platform perched on a sea stack. The stick rolls the ball (momentum); balls bounce off each
 * other like rubber. Hold A to charge a bump, release to launch it. Off the edge = splash, out.
 * From 25 s the platform shrinks. Last one dry wins; at 60 s the survivors share the win.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { GEO, ball, blobShadow, box, canvasTex, cloud, cone, cyl, flat, group, toon } from "../../engine/gfx";
import { clamp, easeInOutCubic } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 60;
const R0 = 8.6; // platform radius at the start
const RMIN = 3.6; // … and once fully shrunk
const SHRINK_AT = 25;
const SHRINK_END = 50;
const BR = 0.78; // ball radius
const ACC = 16; // stick acceleration
const DRAG = 2.0; // rolling drag (1/s): terminal speed ≈ ACC / DRAG
const CHARGE_T = 0.75; // time to charge a full bump
const BUMP_T = 0.32;
const BUMP_CD = 1.15;
const RESTITUTION = 1.2; // > 1: extra bouncy
const SEA_Y = -6.5;
const GRAV = 26;

/** A finishing place as the cards show it: 2nd, 3rd, 4th… / 第2名. */
const ordinal = (n: number) => T(`${n}<sup>${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}</sup>`, `第${n}名`);

interface Hopper {
  x: number;
  z: number;
  vx: number;
  vz: number;
  y: number;
  vy: number;
  alive: boolean;
  falling: boolean;
  inSea: boolean;
  seaT: number;
  charging: boolean;
  charge: number;
  bumpT: number;
  bumpPow: number;
  cd: number;
  /** Squash spring (positive = flattened). */
  sq: number;
  sqV: number;
  hopPh: number;
  outer: THREE.Group;
  roll: THREE.Mesh;
  mat: THREE.MeshToonMaterial;
  shadow: THREE.Mesh;
  aura: THREE.Mesh;
  auraMat: THREE.MeshBasicMaterial;
  /** Last rival who touched me (for the "Plouf" credit) and when. */
  lastBy: number;
  lastByT: number;
  fullCharged: boolean;
}

interface CpuMem {
  target: number;
  retarget: number;
  holding: boolean;
  holdT: number;
  holdFor: number;
  tap: number;
}

/** The toon light bands (as in gfx.ts) for the balls' own textured materials. */
function toonGradient() {
  const t = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * Static decor → one InstancedMesh per (geometry, material): the same look with far fewer draw calls.
 * Meshes with equal geometry parameters are merged too. Returns the instanced meshes (free them in dispose()).
 */
function bake(src: THREE.Object3D, dst: THREE.Object3D): THREE.InstancedMesh[] {
  src.updateMatrixWorld(true);
  const sets = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; list: THREE.Matrix4[]; cast: boolean }>();
  const all = new Set<THREE.BufferGeometry>();
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const g = m.geometry as THREE.BufferGeometry & { parameters?: unknown };
    all.add(g);
    const gk = g.userData?.shared || !g.parameters ? g.uuid : g.type + JSON.stringify(g.parameters);
    const key = `${gk}|${m.material.uuid}`;
    let set = sets.get(key);
    if (!set) sets.set(key, (set = { geo: g, mat: m.material, list: [], cast: false }));
    set.list.push(m.matrixWorld.clone());
    set.cast ||= m.castShadow;
  });
  const out: THREE.InstancedMesh[] = [];
  const used = new Set<THREE.BufferGeometry>();
  for (const set of sets.values()) {
    const im = new THREE.InstancedMesh(set.geo, set.mat, set.list.length);
    set.list.forEach((m4, k) => im.setMatrixAt(k, m4));
    im.castShadow = set.cast;
    im.receiveShadow = true;
    dst.add(im);
    out.push(im);
    used.add(set.geo);
  }
  for (const g of all) if (!used.has(g) && !g.userData?.shared) g.dispose();
  return out;
}

class SumoBouncy extends BaseMini {
  private h: Hopper[] = [];
  private mem: CpuMem[] = [];
  private out: number[] = [];
  private rCur = R0;
  private platform!: THREE.Group;
  private edgeMat!: THREE.MeshBasicMaterial;
  private seaTex!: THREE.Texture;
  private foam!: THREE.Mesh;
  private buoys: THREE.Object3D[] = [];
  private boats: THREE.Object3D[] = [];
  private grad = toonGradient();
  private shrinkAnnounced = false;
  private hurry = false;
  private debrisT = 0;
  private ended = false;
  private baked: THREE.InstancedMesh[] = [];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#43a8f0", "#c8ecff"], size: 13, sun: [0.5, 1, 0.55], fog: { color: "#9fdcf5", near: 45, far: 120 } });
    this.buildWorld();
    const n = this.players.length;
    this.players.forEach((p, i) => {
      const ang = (i / n) * Math.PI * 2 + Math.PI / 4;
      const r = R0 * 0.5;
      const x = Math.cos(ang) * r,
        z = Math.sin(ang) * r;
      const a = this.spawn(i, x, z, Math.atan2(-x, -z), { blob: false });
      a.root.rotation.order = "YXZ";
      a.anim = "sit";
      this.h.push(this.makeBall(i, x, z));
      this.mem.push({ target: (i + 1) % n, retarget: 0, holding: false, holdT: 0, holdFor: 0.4, tap: 0 });
    });
    this.hud.players(this.players, () => T("Rolling", "在场"));
    this.hud.timer(TIME);
    this.setCam([0, 34, 30], [0, -1, 1], 42);
    this.place(0);
  }

  // ------------------------------------------------------------ the world

  private buildWorld() {
    const s = this.scene;
    // the sea: a big disc with a scrolling wave texture
    this.seaTex = canvasTex(
      256,
      256,
      (g, w) => {
        g.fillStyle = "#2aa2d8";
        g.fillRect(0, 0, w, w);
        g.strokeStyle = "#4cc0ec";
        g.lineWidth = 6;
        g.lineCap = "round";
        for (let k = 0; k < 14; k++) {
          const x = (k * 97) % w,
            y = (k * 61) % w;
          g.beginPath();
          g.arc(x, y, 22, Math.PI * 1.15, Math.PI * 1.85);
          g.stroke();
        }
        g.strokeStyle = "rgba(255,255,255,0.75)";
        g.lineWidth = 4;
        for (let k = 0; k < 6; k++) {
          const x = (k * 151 + 40) % w,
            y = (k * 83 + 100) % w;
          g.beginPath();
          g.arc(x, y, 14, Math.PI * 1.2, Math.PI * 1.8);
          g.stroke();
        }
      },
      true,
    );
    this.seaTex.repeat.set(40, 40);
    const sea = new THREE.Mesh(new THREE.CircleGeometry(220, 48), new THREE.MeshToonMaterial({ map: this.seaTex, gradientMap: this.grad }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = SEA_Y;
    sea.receiveShadow = true;
    s.add(sea);

    // static decor: built here, baked into instanced meshes at the end
    const d = new THREE.Group();
    // the sea stack under the platform
    const rock = toon("#9a8672");
    const rockDark = toon("#7a6656");
    cyl(d, rock, 3.4, -SEA_Y - 0.6, { rTop: 2.6, y: (SEA_Y - 0.6) / 2 - 0.3, seg: 12 });
    cyl(d, rockDark, 4.4, 1.6, { rTop: 3.6, y: SEA_Y + 0.4, seg: 12 });
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + 0.3;
      const m = new THREE.Mesh(GEO.dodeca, k % 2 ? rock : rockDark);
      m.position.set(Math.cos(a) * (4.2 + (k % 3) * 0.5), SEA_Y + 0.1, Math.sin(a) * (4.2 + (k % 3) * 0.5));
      m.scale.setScalar(0.8 + (k % 4) * 0.25);
      m.rotation.set(k, k * 2, 0);
      m.castShadow = true;
      d.add(m);
    }
    // foam around the stack
    this.foam = new THREE.Mesh(new THREE.RingGeometry(4.2, 5.4, 40), flat("#ffffff", 0.7));
    this.foam.rotation.x = -Math.PI / 2;
    this.foam.position.y = SEA_Y + 0.05;
    s.add(this.foam);

    // the platform: a fat drum with a painted top (edge stripes) and a lifebuoy-red side
    this.platform = group(s);
    const top = canvasTex(1024, 1024, (g, w) => {
      const c = w / 2;
      g.fillStyle = "#f7e9c9";
      g.fillRect(0, 0, w, w);
      // soft planks
      g.globalAlpha = 0.18;
      for (let x = 0; x < w; x += 64) {
        g.fillStyle = (x / 64) % 2 ? "#d8b98a" : "#efd8ae";
        g.fillRect(x, 0, 64, w);
      }
      g.globalAlpha = 1;
      // rings
      const ring = (r: number, col: string, lw: number) => {
        g.strokeStyle = col;
        g.lineWidth = lw;
        g.beginPath();
        g.arc(c, c, r, 0, Math.PI * 2);
        g.stroke();
      };
      ring(c * 0.62, "#4fb7e8", 14);
      ring(c * 0.36, "#ff8a3c", 12);
      // centre star
      g.fillStyle = "#ffcf3f";
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? c * 0.09 : c * 0.2;
        g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      g.lineWidth = 8;
      g.strokeStyle = "#ffffff";
      g.stroke();
      // the edge: red/white hazard segments
      const n = 48;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2,
          a1 = ((i + 1) / n) * Math.PI * 2;
        g.beginPath();
        g.arc(c, c, c - 2, a0, a1);
        g.arc(c, c, c * 0.9, a1, a0, true);
        g.closePath();
        g.fillStyle = i % 2 ? "#ffffff" : "#ff4b3e";
        g.fill();
      }
      ring(c * 0.9, "#c8322a", 6);
    });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(R0, R0 * 0.94, 1.0, 72), [toon("#ff5a4a"), new THREE.MeshToonMaterial({ map: top, gradientMap: this.grad }), toon("#8a3a30")]);
    drum.position.y = -0.5;
    drum.receiveShadow = true;
    drum.castShadow = true;
    this.platform.add(drum);
    // a white rope band around the side
    const band = new THREE.Mesh(new THREE.TorusGeometry(R0 * 0.985, 0.09, 6, 72), toon("#ffffff"));
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.45;
    this.platform.add(band);
    // pulsing edge warning (when it shrinks)
    this.edgeMat = new THREE.MeshBasicMaterial({ color: "#ff2a1a", transparent: true, opacity: 0, depthWrite: false });
    const edge = new THREE.Mesh(new THREE.RingGeometry(R0 - 0.9, R0, 72), this.edgeMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.02;
    this.platform.add(edge);

    // buoys bobbing around
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const b = group(s, { x: Math.cos(a) * 13, y: SEA_Y, z: Math.sin(a) * 13 });
      cyl(b, k % 2 ? "#ff4b3e" : "#ffffff", 0.45, 0.6, { y: 0.15, seg: 10 });
      cone(b, k % 2 ? "#ffffff" : "#ff4b3e", 0.35, 0.6, { y: 0.75, lo: true });
      ball(b, flat("#ffe14a"), 0.12, { y: 1.1, cast: false });
      b.userData.ph = k * 0.7;
      this.buoys.push(b);
    }

    // islands with palm trees, a lighthouse, boats
    const island = (x: number, z: number, sc: number, light = false) => {
      const g = group(d, { x, y: SEA_Y, z });
      cyl(g, "#f2d9a0", 4 * sc, 1.2, { rTop: 3.4 * sc, y: 0.2, seg: 18 });
      cyl(g, "#7fcf5a", 2.8 * sc, 0.5, { rTop: 2.2 * sc, y: 0.9, seg: 16 });
      const palms = light ? 1 : 2;
      for (let k = 0; k < palms; k++) this.palm(g, (k ? -1 : 1) * 1.2 * sc, (k ? 0.6 : -0.5) * sc, 1.1 + k * 0.25, k ? -0.25 : 0.2);
      if (light) {
        const L = group(g, { x: 0.6 * sc, y: 1.1, z: 0.4 * sc });
        for (let k = 0; k < 4; k++) cyl(L, k % 2 ? "#ffffff" : "#ff4b3e", 0.75 - k * 0.07, 1.2, { rTop: 0.7 - k * 0.07, y: 0.6 + k * 1.2, seg: 14 });
        cyl(L, "#3a3a50", 0.55, 0.9, { y: 5.25, seg: 12 });
        ball(L, toon("#fff6b0", "#ffd23f", 1), 0.4, { y: 5.25 });
        cone(L, "#ff4b3e", 0.7, 0.8, { y: 6.1, lo: true });
      }
      return g;
    };
    island(-24, -16, 1.3, true);
    island(25, -12, 1.1);
    island(-27, 10, 0.9);
    island(28, 16, 1.2);
    island(4, -34, 1.5);
    // sailboats
    const sailGeo = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 2.4), new THREE.Vector2(1.5, 0)]));
    for (const [x, z, col, ry] of [
      [-15, -22, "#ffffff", 0.4],
      [17, -26, "#ffd23f", -0.6],
      [-20, 20, "#ff7ad9", 1.2],
      [18, 3, "#ffffff", 2.3],
    ] as [number, number, string, number][]) {
      const b = group(s, { x, y: SEA_Y, z, ry });
      box(b, "#a8572e", 2.4, 0.5, 0.9, { y: 0.2 });
      box(b, "#ffffff", 2.5, 0.12, 1.0, { y: 0.48 });
      cyl(b, "#5a3a2a", 0.06, 2.8, { y: 1.8, seg: 6 });
      const sail = new THREE.Mesh(sailGeo, new THREE.MeshToonMaterial({ color: col, side: THREE.DoubleSide }));
      sail.position.set(0.05, 0.6, 0);
      sail.castShadow = true;
      b.add(sail);
      b.userData.ph = x;
      this.boats.push(b);
    }
    cloud(d, -18, 9, -30, 2.2);
    cloud(d, 16, 11, -34, 2.6);
    cloud(d, 30, 8, -6, 1.8);
    this.baked = bake(d, s);
  }

  private palm(parent: THREE.Object3D, x: number, z: number, s: number, lean: number) {
    const g = group(parent, { x, y: 1.1, z, rz: lean });
    for (let k = 0; k < 5; k++) cyl(g, k % 2 ? "#9a6a3a" : "#b07a44", 0.16 * s - k * 0.012, 0.62 * s, { y: 0.3 * s + k * 0.58 * s, x: k * k * 0.03 * s, seg: 7 });
    const top = group(g, { x: 0.5 * s, y: 3.0 * s });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const leaf = ball(top, k % 2 ? "#3fae4a" : "#52c45a", [0.95 * s, 0.07 * s, 0.32 * s], { x: Math.cos(a) * 0.75 * s, y: -0.2 * s, z: Math.sin(a) * 0.75 * s, ry: -a, rz: -0.45, lo: true });
      leaf.rotation.order = "YZX";
    }
    for (let k = 0; k < 3; k++) ball(top, "#6a4a2a", 0.16 * s, { x: Math.cos(k * 2) * 0.2 * s, y: -0.3 * s, z: Math.sin(k * 2) * 0.2 * s, lo: true });
  }

  private makeBall(i: number, x: number, z: number): Hopper {
    const p = this.players[i];
    const col = new THREE.Color(p.char.color);
    const lum = col.r * 0.3 + col.g * 0.59 + col.b * 0.11;
    const alt = lum > 0.8 ? new THREE.Color(p.char.dark) : col.clone().lerp(new THREE.Color("#ffffff"), 0.6);
    const tex = canvasTex(256, 128, (g, w, hh) => {
      const n = 6;
      for (let k = 0; k < n; k++) {
        g.fillStyle = k % 2 ? `#${alt.getHexString()}` : p.char.color;
        g.fillRect((k / n) * w, 0, w / n + 1, hh);
      }
      // white caps and a few highlight dots
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, w, hh * 0.1);
      g.fillRect(0, hh * 0.9, w, hh * 0.1);
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.arc(((k + 0.5) / 6) * w, hh * 0.5, 6, 0, Math.PI * 2);
        g.fill();
      }
    });
    const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: this.grad, emissive: new THREE.Color(p.char.color), emissiveIntensity: 0 });
    const outer = group(this.scene, { x, y: BR, z });
    const roll = new THREE.Mesh(GEO.sphere, mat);
    roll.scale.setScalar(BR);
    roll.castShadow = true;
    outer.add(roll);
    const shadow = blobShadow(BR * 1.15, 0.4);
    shadow.position.set(x, 0.03, z);
    this.scene.add(shadow);
    const auraMat = new THREE.MeshBasicMaterial({ color: p.char.color, transparent: true, opacity: 0, depthWrite: false });
    const aura = new THREE.Mesh(GEO.ring, auraMat);
    aura.rotation.x = -Math.PI / 2;
    aura.position.set(x, 0.05, z);
    aura.renderOrder = 2;
    this.scene.add(aura);
    return { x, z, vx: 0, vz: 0, y: BR, vy: 0, alive: true, falling: false, inSea: false, seaT: 0, charging: false, charge: 0, bumpT: 0, bumpPow: 0, cd: 0, sq: 0, sqV: 0, hopPh: i * 1.3, outer, roll, mat, shadow, aura, auraMat, lastBy: -1, lastByT: -9, fullCharged: false };
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    const me = this.h[i];
    const m = this.mem[i];
    if (!me.alive || me.falling) return {};
    const lv = this.players[i].level;
    const R = this.rCur;
    // a quick tap (escape dash) in progress: one frame down, then release
    if (m.tap > 0) {
      m.tap--;
      return { x: -me.x, y: -me.z, a: m.tap > 0 };
    }
    // ---- 1. don't fall off: where would I stop if I braked now?
    const v = Math.hypot(me.vx, me.vz);
    const look = 0.1 + 0.3 * lv;
    const stop = (v * v) / (2 * (ACC + DRAG * v * 0.5));
    const px = me.x + me.vx * look + (v > 0.1 ? (me.vx / v) * stop : 0),
      pz = me.z + me.vz * look + (v > 0.1 ? (me.vz / v) * stop : 0);
    const pd = Math.hypot(px, pz);
    const d0 = Math.hypot(me.x, me.z) || 1;
    const margin = Math.min(R * 0.4, 0.5 + 1.3 * lv);
    if (pd > R - margin) {
      if (this.cpuAfter(i, "edge", 0.35 * (1 - lv))) {
        // brake against the outward motion and head for the middle
        const out = (me.vx * me.x + me.vz * me.z) / d0;
        let x = -me.x / d0,
          y = -me.z / d0;
        if (out > 0 && v > 0.1) {
          const k = clamp(out / 5, 0, 1.5);
          x -= (me.vx / v) * k;
          y -= (me.vz / v) * k;
        }
        // about to fall: dash back to the middle (experts think of it more often)
        if (d0 > R - 1.1 && out > 1.5 && me.cd <= 0 && me.bumpT <= 0 && !m.holding && this.cpuAfter(i, "esc", 0.4 - 0.35 * lv) && Math.random() < 0.25 + 0.7 * lv) {
          m.tap = 2;
          this.cpuReset(i, "esc");
          return { x: -me.x, y: -me.z, a: true };
        }
        if (m.holding) {
          // releasing now launches the charged bump back toward the middle
          m.holding = false;
          return { x: -me.x / d0, y: -me.z / d0, a: false };
        }
        return { x, y };
      }
    } else {
      this.cpuReset(i, "edge");
      this.cpuReset(i, "esc");
    }
    // ---- 2. pick a victim now and then (experts prefer whoever is near the edge)
    m.retarget -= dt;
    const others = this.h.map((o, j) => ({ o, j })).filter(({ o, j }) => j !== i && o.alive && !o.falling);
    if (!others.length) return this.steer(me, 0, 0, 4);
    if (m.retarget <= 0 || !this.h[m.target].alive || this.h[m.target].falling) {
      m.retarget = 1.5 + Math.random() * 2;
      let best = others[0].j,
        bs = -1e9;
      for (const { o, j } of others) {
        const d = Math.hypot(o.x - me.x, o.z - me.z);
        const edge = Math.hypot(o.x, o.z) / R;
        const sc = -d * (1 - 0.4 * lv) + edge * (2 + 5 * lv) + Math.random() * (3 - 2 * lv);
        if (sc > bs) {
          bs = sc;
          best = j;
        }
      }
      m.target = best;
    }
    const T = this.h[m.target];
    const lead = 0.1 + 0.3 * lv;
    const tx = T.x + T.vx * lead,
      tz = T.z + T.vz * lead;
    const tl = Math.hypot(tx, tz);
    const dx = tx - me.x,
      dz = tz - me.z;
    const dl = Math.hypot(dx, dz) || 1;
    // outward direction through the target (toward the nearest edge)
    const nx = tl > 0.5 ? tx / tl : dx / dl,
      nz = tl > 0.5 ? tz / tl : dz / dl;
    const align = (dx * nx + dz * nz) / dl;
    const wob = (1 - lv) * 0.5;
    const wx = Math.sin(this.t * 2.1 + i * 3) * wob,
      wz = Math.cos(this.t * 1.7 + i * 5) * wob;
    if (align > 0.45 - 0.3 * (1 - lv) && dl < 4.5) {
      // on the inside: shove them outward
      let ax = dx + nx * 0.5,
        az = dz + nz * 0.5;
      const al = Math.hypot(ax, az) || 1;
      ax /= al;
      az /= al;
      // would a missed bump throw me off? (experts check)
      const fx = me.x + ax * (dl + 3),
        fz = me.z + az * (dl + 3);
      const risky = Math.hypot(fx, fz) > R + 0.5 && Math.random() < lv;
      if (!m.holding && !risky && me.cd <= 0 && me.bumpT <= 0 && dl < 3.4 && this.cpuAfter(i, "atk", 0.6 - 0.4 * lv)) {
        m.holding = true;
        m.holdT = 0;
        m.holdFor = 0.1 + (0.2 + 0.35 * lv) * Math.random() + 0.15 * lv;
      }
      if (m.holding) {
        m.holdT += dt;
        if ((m.holdT >= m.holdFor && dl < 2.6) || m.holdT > 1.2) {
          m.holding = false;
          this.cpuReset(i, "atk");
          return { x: ax, y: az, a: false };
        }
        return { x: ax + wx * 0.5, y: az + wz * 0.5, a: true };
      }
      return this.steer(me, me.x + ax * 3, me.z + az * 3, 6 + 2 * lv, wx, wz);
    }
    if (m.holding && (m.holdT += dt) > 1.2) {
      m.holding = false;
      this.cpuReset(i, "atk");
      return { ...this.steer(me, 0, 0, 3), a: false };
    }
    // go round to the inner side of the victim
    let gx = T.x - nx * 2.2,
      gz = T.z - nz * 2.2;
    // the middle is the safe place: smart ones stay closer to it while they manoeuvre
    const pull = 0.15 + 0.3 * lv;
    gx *= 1 - pull;
    gz *= 1 - pull;
    const gl = Math.hypot(gx, gz);
    const lim = Math.max(0.5, R - margin - 0.6);
    if (gl > lim) {
      gx *= lim / gl;
      gz *= lim / gl;
    }
    // don't plough straight through the victim on the way: side-step around it
    const sx = gx - me.x,
      sz = gz - me.z;
    const toT = (dx * sx + dz * sz) / (dl * (Math.hypot(sx, sz) || 1));
    if (toT > 0.6 && dl < 3) {
      const side = dx * sz - dz * sx > 0 ? 1 : -1;
      gx += (-dz / dl) * side * 2;
      gz += (dx / dl) * side * 2;
    }
    return { ...this.steer(me, gx, gz, 5 + 2 * lv, wx, wz), a: m.holding };
  }

  /** Stick that brings the ball toward (gx, gz) with the right velocity (brakes by itself). */
  private steer(me: Hopper, gx: number, gz: number, vmax: number, wx = 0, wz = 0): CpuPad {
    const dx = gx - me.x,
      dz = gz - me.z;
    const d = Math.hypot(dx, dz) || 1;
    const sp = Math.min(vmax, d * 2.2);
    const ex = (dx / d) * sp - me.vx,
      ez = (dz / d) * sp - me.vz;
    let x = ex / 3 + wx,
      y = ez / 3 + wz;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.ambient(dt);
    this.moveCam([0, 17.5, 15], [0, -1.2, 1.2], dt, 1.6);
    this.place(dt);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.ambient(dt);
    // the platform shrinks
    if (this.t >= SHRINK_AT) {
      if (!this.shrinkAnnounced) {
        this.shrinkAnnounced = true;
        this.hud.banner(T("ARENA SHRINKING!", "场地缩小！"), { color: "#ff8a3c", sub: T("Stay in the middle…", "待在中间……") });
        this.sound("rumble");
        this.shake = 0.35;
        music.speed(1.1);
      }
      const k = easeInOutCubic(clamp((this.t - SHRINK_AT) / (SHRINK_END - SHRINK_AT), 0, 1));
      this.rCur = R0 + (RMIN - R0) * k;
      this.platform.scale.set(this.rCur / R0, 1, this.rCur / R0);
      this.edgeMat.opacity = this.rCur > RMIN + 0.01 ? 0.25 + 0.25 * Math.sin(this.t * 8) : 0;
      if (this.rCur > RMIN + 0.01) {
        this.debrisT -= dt;
        if (this.debrisT <= 0) {
          this.debrisT = 0.12;
          const a = Math.random() * Math.PI * 2;
          this.fx.burst({ x: Math.cos(a) * this.rCur, y: -0.3, z: Math.sin(a) * this.rCur }, { count: 4, colors: ["#ff5a4a", "#f7e9c9", "#ffffff"], speed: 2, up: 1, gravity: 18, size: 0.28, sizeEnd: 0.2, life: 1.2 });
        }
      }
    }
    if (!this.hurry && left <= 10) {
      this.hurry = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ffd23f" });
      this.sound("bell");
      music.speed(1.2);
    }
    // camera: closer once the platform is small
    const z = 0.6 + 0.4 * ((this.rCur - RMIN) / (R0 - RMIN));
    this.moveCam([0, 8 + 9.5 * z, 7.5 + 7.5 * z], [0, -1.2, 1.2 * z], dt, 2);
    this.physics(dt, true);
    this.place(dt);
    const alive = this.h.filter((r) => r.alive).length;
    if (!this.ended && (alive <= 1 || left <= 0)) {
      this.ended = true;
      this.finishByElimination(this.out);
    }
  }

  protected outroStep(dt: number) {
    this.ambient(dt);
    this.physics(dt, false);
    this.place(dt);
  }

  protected celebrate(res: MiniResult) {
    this.avatars.forEach((a, i) => {
      const r = this.h[i];
      if (r.alive) {
        a.anim = res.place[i] === 1 ? "win" : "sit";
        if (res.place[i] === 1) this.fx.confetti({ x: r.x, y: 3, z: r.z }, 50);
      }
    });
  }

  private ambient(dt: number) {
    this.seaTex.offset.x += dt * 0.01;
    this.seaTex.offset.y += dt * 0.006;
    const now = performance.now() / 1000;
    this.foam.scale.setScalar(1 + Math.sin(now * 1.6) * 0.05);
    for (const b of this.buoys) {
      b.position.y = SEA_Y + Math.sin(now * 1.8 + b.userData.ph) * 0.15;
      b.rotation.z = Math.sin(now * 1.3 + b.userData.ph) * 0.12;
    }
    for (const b of this.boats) {
      b.position.y = SEA_Y + Math.sin(now * 1.2 + b.userData.ph) * 0.12;
      b.rotation.x = Math.sin(now * 1.1 + b.userData.ph) * 0.06;
    }
  }

  /** Movement, bumps, collisions, falls. */
  private physics(dt: number, live: boolean) {
    const n = this.h.length;
    for (let i = 0; i < n; i++) {
      const r = this.h[i];
      const a = this.avatars[i];
      r.cd -= dt;
      // squash spring
      r.sqV += (-170 * r.sq - 11 * r.sqV) * dt;
      r.sq += r.sqV * dt;
      if (r.inSea) {
        r.seaT += dt;
        r.vx *= Math.exp(-1.5 * dt);
        r.vz *= Math.exp(-1.5 * dt);
        r.x += r.vx * dt;
        r.z += r.vz * dt;
        continue;
      }
      if (r.falling) {
        r.vy -= GRAV * dt;
        r.y += r.vy * dt;
        r.vx *= Math.exp(-0.3 * dt);
        r.vz *= Math.exp(-0.3 * dt);
        r.x += r.vx * dt;
        r.z += r.vz * dt;
        if (r.y <= SEA_Y + BR * 0.5) {
          r.inSea = true;
          r.y = SEA_Y + BR * 0.5;
          r.vx *= 0.25;
          r.vz *= 0.25;
          this.fx.splash({ x: r.x, y: SEA_Y + 0.2, z: r.z }, "#bfe8ff");
          this.fx.burst({ x: r.x, y: SEA_Y + 0.3, z: r.z }, { count: 26, colors: ["#ffffff", "#9fdcff"], speed: 4, up: 9, gravity: 20, size: 0.25, sizeEnd: 0.05, life: 1 });
          this.sound("splash");
          a.anim = "swim";
        }
        continue;
      }
      // ---- control
      const p = live ? this.pad(i) : { x: 0, y: 0, a: false, aDown: false, aUp: false };
      if (live && r.alive) {
        if (p.aDown && r.cd <= 0 && r.bumpT <= 0) {
          r.charging = true;
          r.charge = 0;
          r.fullCharged = false;
          this.sound("squeak");
        }
        if (r.charging) {
          r.charge = Math.min(1, r.charge + dt / CHARGE_T);
          if (r.charge >= 1 && !r.fullCharged) {
            r.fullCharged = true;
            this.sound("power");
            this.fx.sparkle({ x: r.x, y: 1.6, z: r.z }, this.players[i].char.color, 10);
          }
          if (!p.a) this.launch(i, p.x, p.y);
        }
      }
      const acc = r.charging ? ACC * 0.35 : r.bumpT > 0 ? ACC * 0.2 : ACC;
      r.vx += p.x * acc * dt;
      r.vz += p.y * acc * dt;
      const drag = r.bumpT > 0 ? 0.8 : DRAG;
      r.vx *= Math.exp(-drag * dt);
      r.vz *= Math.exp(-drag * dt);
      if (r.bumpT > 0) {
        r.bumpT -= dt;
        if (Math.random() < 0.6) this.fx.dust({ x: r.x, y: 0, z: r.z }, 1, "#ffffff");
      }
      r.x += r.vx * dt;
      r.z += r.vz * dt;
      // face where we go
      const sp = Math.hypot(r.vx, r.vz);
      if (r.charging && Math.hypot(p.x, p.y) > 0.3) a.face(Math.atan2(p.x, p.y), dt, 10);
      else if (sp > 0.6) a.face(Math.atan2(r.vx, r.vz), dt, 8);
      // off the edge?
      const d = Math.hypot(r.x, r.z);
      if (d > this.rCur && r.alive) this.fall(i);
    }
    // ---- ball vs ball: rubbery and extra bouncy
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const A = this.h[i],
          B = this.h[j];
        if (A.falling || B.falling || A.inSea || B.inSea) continue;
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d >= BR * 2 || d < 1e-4) continue;
        const nx = dx / d,
          nz = dz / d;
        const pen = BR * 2 - d;
        A.x -= nx * pen * 0.5;
        A.z -= nz * pen * 0.5;
        B.x += nx * pen * 0.5;
        B.z += nz * pen * 0.5;
        const vn = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz; // > 0: closing in
        if (vn <= 0) continue;
        const base = clamp(((1 + RESTITUTION) * vn) / 2, 2.2, 6);
        let jA = base,
          jB = base;
        // a bump hits much harder (and the bumper keeps its ground)
        let big = false;
        if (A.bumpT > 0) {
          jB = base * 0.4 + 2.5 + 4.5 * A.bumpPow;
          jA = base * 0.3;
          A.bumpT = 0;
          big = true;
        }
        if (B.bumpT > 0) {
          jA = base * 0.4 + 2.5 + 4.5 * B.bumpPow;
          jB = base * 0.3;
          B.bumpT = 0;
          big = true;
        }
        A.vx -= nx * jA;
        A.vz -= nz * jA;
        B.vx += nx * jB;
        B.vz += nz * jB;
        A.sqV += 4 + jA * 0.6;
        B.sqV += 4 + jB * 0.6;
        A.lastBy = j;
        A.lastByT = this.t;
        B.lastBy = i;
        B.lastByT = this.t;
        const cx = A.x + nx * BR,
          cz = A.z + nz * BR;
        if (big) {
          this.sound("hit");
          this.sound("boing");
          this.shake = Math.max(this.shake, 0.35);
          this.fx.burst({ x: cx, y: BR, z: cz }, { count: 18, colors: ["#ffffff", "#ffe14a", "#ff9a2e"], speed: 7, up: 2, size: 0.2, life: 0.5 });
          this.fx.ring({ x: cx, y: 0.05, z: cz }, "#ffffff", 2.2, 0.35);
          this.buzz(i, 60);
          this.buzz(j, 60);
        } else {
          this.sound("boing");
          this.fx.burst({ x: cx, y: BR, z: cz }, { count: 8, colors: ["#ffffff", "#ffe14a"], speed: 4, size: 0.14, life: 0.35 });
          this.buzz(i, 25);
          this.buzz(j, 25);
        }
      }
  }

  private launch(i: number, sx: number, sy: number) {
    const r = this.h[i];
    const a = this.avatars[i];
    r.charging = false;
    let dx = sx,
      dz = sy;
    const l = Math.hypot(dx, dz);
    if (l < 0.3) {
      dx = Math.sin(a.yaw);
      dz = Math.cos(a.yaw);
    } else {
      dx /= l;
      dz /= l;
    }
    const pow = r.charge;
    const v = 8 + 5 * pow;
    r.vx = r.vx * 0.2 + dx * v;
    r.vz = r.vz * 0.2 + dz * v;
    r.bumpT = BUMP_T;
    r.bumpPow = pow;
    r.cd = BUMP_CD;
    r.charge = 0;
    r.sqV -= 6;
    a.yaw = Math.atan2(dx, dz);
    this.sound("whoosh");
    this.fx.dust({ x: r.x, y: 0, z: r.z }, 10, "#ffffff");
  }

  private fall(i: number) {
    const r = this.h[i];
    const a = this.avatars[i];
    r.alive = false;
    r.falling = true;
    r.charging = false;
    r.vy = 3.5;
    // make sure it clears the edge
    const d = Math.hypot(r.x, r.z) || 1;
    const out = (r.vx * r.x + r.vz * r.z) / d;
    if (out < 3) {
      r.vx += (r.x / d) * (3 - out);
      r.vz += (r.z / d) * (3 - out);
    }
    a.anim = "fall";
    this.out.push(i);
    const place = this.players.length - this.out.length + 1;
    this.hud.setScore(this.players[i].seat, `${T("Splash!", "扑通！")} ${ordinal(place)}`);
    this.hud.mark(this.players[i].seat, "out");
    this.hud.pop(new THREE.Vector3(r.x, 2.6, r.z), T("SPLASH!", "扑通！"), "#9fdcff", this.camera);
    this.sound("slide");
    this.buzz(i, [80, 40, 120]);
    if (r.lastBy >= 0 && this.t - r.lastByT < 2.5 && this.h[r.lastBy].alive) {
      const b = this.h[r.lastBy];
      this.hud.pop(new THREE.Vector3(b.x, 2.8, b.z), T("KNOCKOUT!", "撞飞！"), this.players[r.lastBy].char.color, this.camera);
    }
    const alive = this.h.filter((h) => h.alive).length;
    if (alive >= 2) this.hud.banner(alive === 2 ? T("FINAL DUEL!", "最终对决！") : T(`${alive} LEFT!`, `还剩 ${alive} 个！`), { color: "#ffffff", size: 6, ms: 900 });
  }

  /** Put the meshes where the physics says. */
  private place(dt: number) {
    const now = performance.now() / 1000;
    this.h.forEach((r, i) => {
      const a = this.avatars[i];
      // rolling: rotate the textured sphere around the axis perpendicular to the motion
      const sp = Math.hypot(r.vx, r.vz);
      if (sp > 0.01 && !r.inSea) {
        const ax = new THREE.Vector3(r.vz / sp, 0, -r.vx / sp);
        const q = new THREE.Quaternion().setFromAxisAngle(ax, (sp * dt) / BR);
        r.roll.quaternion.premultiply(q);
      }
      // a lively little hop while on the platform
      let y = r.y;
      let hopSq = 0;
      if (!r.falling && !r.inSea) {
        const hop = Math.abs(Math.sin(now * 4.2 + r.hopPh));
        y = BR + hop * 0.12;
        hopSq = Math.max(0, 0.3 - hop) * 0.25;
      }
      if (r.inSea) y = SEA_Y + BR * 0.45 + Math.sin(now * 2 + i) * 0.1;
      const s = clamp(r.sq + hopSq, -0.3, 0.4) + (r.charging ? r.charge * 0.18 : 0);
      r.outer.position.set(r.x, y - s * BR * 0.5, r.z);
      r.outer.scale.set(1 + s * 0.5, 1 - s, 1 + s * 0.5);
      r.mat.emissiveIntensity = r.charging ? 0.15 + 0.35 * r.charge * (0.6 + 0.4 * Math.sin(now * 30)) : r.bumpT > 0 ? 0.4 : 0;
      // shadow & charge aura on the platform
      const onPlat = !r.falling && !r.inSea;
      r.shadow.visible = onPlat || (r.falling && r.y > -0.5 && Math.hypot(r.x, r.z) < this.rCur);
      r.shadow.position.set(r.x, 0.03, r.z);
      r.aura.visible = onPlat && (r.charging || r.cd > BUMP_CD - 0.25);
      r.aura.position.set(r.x, 0.05, r.z);
      if (r.charging) {
        r.aura.scale.setScalar(BR * (1.25 + 0.9 * r.charge));
        r.auraMat.opacity = 0.5 + 0.4 * r.charge;
      } else {
        const k = clamp((r.cd - (BUMP_CD - 0.25)) / 0.25, 0, 1);
        r.aura.scale.setScalar(BR * (2.6 - 1.2 * k));
        r.auraMat.opacity = k * 0.6;
      }
      // the rider
      const top = y - s * BR * 0.5 + BR * (1 - s);
      if (r.inSea) {
        a.pos.set(r.x + 0.9, SEA_Y - 0.35 + Math.sin(now * 2.4 + i) * 0.06, r.z + 0.5);
        a.root.rotation.x = 0;
        a.groundY = a.pos.y;
        a.anim = "swim";
        a.yaw = Math.PI + Math.sin(now + i) * 0.3;
      } else {
        a.pos.set(r.x, top - 0.14, r.z);
        a.groundY = a.pos.y;
        if (r.alive && !this.finished) a.anim = r.bumpT > 0 ? "push" : "sit";
        const lean = r.falling ? 0.5 : clamp(sp / 9, 0, 1) * 0.25 - (r.charging ? r.charge * 0.25 : 0);
        a.root.rotation.x += (lean - a.root.rotation.x) * Math.min(1, dt * 8);
      }
    });
  }

  dispose() {
    for (const m of this.baked) m.dispose();
    this.grad.dispose();
    super.dispose();
  }
}

const def: MiniDef = {
  id: "sumo-bouncy",
  name: "Sumo Bounce",
  icon: "🔴",
  color: "#ff4b3e",
  tagline: "On bouncy balls, push every zkSNARK into the sea.",
  rules: "Roll your big ball into the others to push them into the sea. Hold A to charge a ram, let go to charge! From 25 s the arena shrinks: the last one dry wins.",
  controls: { stick: "Roll", a: "Hold: ram" },
  modes: ["ffa"],
  length: 60,
  music: "mini2",
  create: (ctx) => new SumoBouncy(ctx),
};
export default def;
