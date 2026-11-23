/**
 * PATATE CHAUDE (chacun pour soi): a circus ring under the big top. One player holds a lit bomb over
 * their head; touching someone passes it (no instant pass-back). The fuse is hidden (7–13 s), the
 * ticking speeds up and the bomb swells and flashes. BOOM: the holder is blasted into the stands and
 * is out. A new round starts among the others with the bomb dropped on one of them. Last one wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { GEO, ball, box, canvasTex, cone, cyl, flat, group, textSprite, toon } from "../../engine/gfx";
import { clamp, dist2, lerp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const R = 8.2; // ring radius (inside the curb)
const PR = 0.45;
const SPEED = 6.2;
const HOLDER_BOOST = 1.13;
const DASH_V = 14;
const DASH_T = 0.18;
const DASH_CD = 1.2;
const NO_PASS_BACK = 0.6;
const PASS_GAP = 0.18;
const FUSE_MIN = 7;
const FUSE_MAX = 13;
const BOOM_PAUSE = 2.6;
const BOMB_R = 0.42;

/** A finishing place as the cards show it: 2nd, 3rd, 4th… / 第2名. */
const ordinal = (n: number) => T(`${n}<sup>${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}</sup>`, `第${n}名`);
/** Who holds the leaked key. */
const hasKey = (name: string) => T(`${name} has the key`, `私钥在 ${name} 手上`);

interface Runner {
  x: number;
  z: number;
  vx: number;
  vz: number;
  dashT: number;
  dashCd: number;
  alive: boolean;
  /** Blasted: flying toward the stands. */
  fly: { t: number; x0: number; z0: number; x1: number; z1: number; y1: number; dur: number } | null;
  seated: boolean;
}

type Phase = "drop" | "live" | "boom";

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

class PatateChaude extends BaseMini {
  private run: Runner[] = [];
  private out: number[] = [];
  private holder = -1;
  private prevHolder = -1;
  private passT = -9;
  fuse = 10;
  private fuseLeft = 10;
  private tickT = 0;
  private phase: Phase = "drop";
  private phaseT = 0;
  private round = 1;
  private bomb!: THREE.Group;
  private bombBody!: THREE.Mesh;
  private bombMat!: THREE.MeshToonMaterial;
  private spark!: THREE.Mesh;
  private sparkLight!: THREE.PointLight;
  /** Bomb flight between heads (pass) or from the sky (drop). */
  private bombFrom = new THREE.Vector3();
  private bombFly = 1;
  private crowd!: THREE.InstancedMesh;
  private heads!: THREE.InstancedMesh;
  private danger!: THREE.Mesh;
  private dangerMat!: THREE.MeshBasicMaterial;
  private crowdBase: { x: number; y: number; z: number; ph: number }[] = [];
  private cheer = 0;
  private beams: THREE.Mesh[] = [];
  private roundEl!: HTMLElement;
  private seats: THREE.Vector3[] = [];
  private ended = false;
  private tmpM = new THREE.Matrix4();
  private baked: THREE.InstancedMesh[] = [];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#2a1438", "#5a2a4a"], size: 12, sun: [0.3, 1, 0.5], sunIntensity: 2.2, hemi: ["#ffe6c8", "#5a3040", 1.3], fog: { color: "#3a1c3a", near: 40, far: 90 } });
    this.buildTent();
    const starts = [
      [-3.5, -2.5],
      [3.5, -2.5],
      [-3.5, 3],
      [3.5, 3],
    ];
    this.players.forEach((p, i) => {
      const [x, z] = starts[i];
      const a = this.spawn(i, x, z, Math.atan2(-x, -z));
      a.setRing(p.char.color);
      this.run.push({ x, z, vx: 0, vz: 0, dashT: 0, dashCd: 0, alive: true, fly: null, seated: false });
    });
    this.buildBomb();
    this.hud.players(this.players, () => T("In play", "在场"));
    this.roundEl = this.hud.add(
      `<div style="position:absolute;left:50%;top:calc(var(--u)*1);transform:translateX(-50%);padding:calc(var(--u)*0.6) calc(var(--u)*2.2);background:#fff;color:#2a1438;border:calc(var(--u)*0.35) solid #2a1438;border-radius:calc(var(--u)*3);font-family:'Lilita One',sans-serif;font-size:calc(var(--u)*3);box-shadow:0 calc(var(--u)*0.45) 0 rgba(0,0,0,0.3);white-space:nowrap">${T("Round 1", "第 1 回合")}</div>`,
    );
    this.setCam([0, 30, 26], [0, 0, 0.5], 42);
    // the first holder, chosen at random; the bomb is already in their hands at GO
    this.holder = Math.floor(this.rnd() * this.players.length);
    this.bombFly = 1;
    this.fuse = this.fuseLeft = FUSE_MIN + this.rnd() * (FUSE_MAX - FUSE_MIN);
  }

  // ------------------------------------------------------------ the big top

  private buildTent() {
    // static pieces go in a group that gets baked into instanced meshes at the end
    const s = new THREE.Group();
    // sawdust ring floor
    const floorTex = canvasTex(1024, 1024, (g, w) => {
      const c = w / 2;
      g.fillStyle = "#e8c48a";
      g.fillRect(0, 0, w, w);
      for (let k = 0; k < 2600; k++) {
        g.fillStyle = k % 3 ? "rgba(160,110,50,0.25)" : "rgba(255,240,200,0.4)";
        const x = (k * 7919) % w,
          y = (k * 104729) % w;
        g.fillRect(x, y, 4 + (k % 4), 2 + (k % 3));
      }
      g.strokeStyle = "#c8323a";
      g.lineWidth = 14;
      g.beginPath();
      g.arc(c, c, c * 0.42, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.7)";
      g.lineWidth = 6;
      g.beginPath();
      g.arc(c, c, c * 0.46, 0, Math.PI * 2);
      g.stroke();
      // star in the middle
      g.fillStyle = "#ffd23f";
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? c * 0.1 : c * 0.24;
        g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = "#c8323a";
      g.lineWidth = 8;
      g.stroke();
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 0.6, 64), new THREE.MeshToonMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // the curb: red and white padded segments
    const n = 28;
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * Math.PI * 2;
      const len = ((Math.PI * 2 * (R + 0.45)) / n) * 1.02;
      box(s, k % 2 ? "#ffffff" : "#e8323c", len, 0.7, 0.75, { x: Math.cos(a) * (R + 0.45), y: 0.35, z: Math.sin(a) * (R + 0.45), ry: -a + Math.PI / 2 });
    }
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.45, 0.12, 6, 80), toon("#ffd23f"));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.72;
    s.add(rim);
    // floor around (dark wood) and the stands
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), toon("#5a3428"));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    s.add(ground);
    const tiers = 4;
    for (let k = 0; k < tiers; k++) {
      const r0 = 10.6 + k * 1.5;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 1.5, r0 + 1.5, 0.6 + k * 0.7, 64, 1, true), new THREE.MeshToonMaterial({ color: k % 2 ? "#3a4a9a" : "#2c3a80", side: THREE.DoubleSide }));
      st.position.y = (0.6 + k * 0.7) / 2;
      s.add(st);
      const top = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 1.5, 64), toon(k % 2 ? "#4a5ab0" : "#3a4aa0"));
      top.rotation.x = -Math.PI / 2;
      top.position.y = 0.6 + k * 0.7;
      top.receiveShadow = true;
      s.add(top);
    }
    // crowd: one instanced mesh of round heads/bodies, bobbing
    const count = 180;
    this.crowd = new THREE.InstancedMesh(GEO.sphereLo, new THREE.MeshToonMaterial({ color: "#ffffff" }), count);
    this.crowd.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    const cols = ["#ff6b6b", "#ffd23f", "#6bd0ff", "#9b5cff", "#3fcf5a", "#ff9a2e", "#ffffff", "#ff7ad9"];
    const col = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const tier = 1 + (k % 3);
      const a = (k / count) * Math.PI * 2 * 3 + tier * 0.4;
      const r0 = 10.6 + tier * 1.5 + 0.75;
      const y = 0.6 + tier * 0.7 + 0.45;
      this.crowdBase.push({ x: Math.cos(a) * r0, y, z: Math.sin(a) * r0, ph: k * 1.7 });
      col.set(cols[k % cols.length]);
      this.crowd.setColorAt(k, col);
    }
    this.crowd.castShadow = true;
    this.scene.add(this.crowd);
    this.heads = new THREE.InstancedMesh(GEO.sphereLo, new THREE.MeshToonMaterial({ color: "#ffffff" }), count);
    this.heads.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    const skins = ["#ffd2b0", "#e8b088", "#c08860", "#8a5a3a", "#ffe0c8"];
    for (let k = 0; k < count; k++) this.heads.setColorAt(k, col.set(skins[(k * 7) % skins.length]));
    this.scene.add(this.heads);
    // front-row seats for the blasted
    for (const k of [0, 3, 1, 2]) {
      // first out sits far left, then far right… (clear of the round sign at the top)
      const a = -Math.PI / 2 + (k - 1.5) * 0.62 + (k < 2 ? -0.35 : 0.35);
      this.seats.push(new THREE.Vector3(Math.cos(a) * 11.35, 0.6, Math.sin(a) * 11.35));
    }
    // the tent: striped walls, poles, a cone roof
    const wallTex = canvasTex(
      512,
      64,
      (g, w, h) => {
        for (let k = 0; k < 16; k++) {
          g.fillStyle = k % 2 ? "#f4ecdf" : "#d42a35";
          g.fillRect((k / 16) * w, 0, w / 16 + 1, h);
        }
      },
      true,
    );
    wallTex.repeat.set(3, 1);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 9, 64, 1, true), new THREE.MeshToonMaterial({ map: wallTex, side: THREE.BackSide }));
    wall.position.y = 4.5;
    s.add(wall);
    const roofTex = canvasTex(
      512,
      64,
      (g, w, h) => {
        for (let k = 0; k < 16; k++) {
          g.fillStyle = k % 2 ? "#f4ecdf" : "#d42a35";
          g.fillRect((k / 16) * w, 0, w / 16 + 1, h);
        }
      },
      true,
    );
    roofTex.repeat.set(3, 1);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(19, 9, 64, 1, true), new THREE.MeshToonMaterial({ map: roofTex, side: THREE.BackSide }));
    roof.position.y = 13.5;
    s.add(roof);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      cyl(s, "#ffd23f", 0.22, 16, { x: Math.cos(a) * 17.5, y: 8, z: Math.sin(a) * 17.5, seg: 8 });
    }
    // bunting
    const flagCols = ["#ff4b3e", "#ffd23f", "#3fcf5a", "#2f8dff", "#ff7ad9"];
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2 + Math.PI / 6,
        a1 = ((k + 1) / 6) * Math.PI * 2 + Math.PI / 6;
      for (let f = 1; f < 10; f++) {
        const t = f / 10;
        const a = lerp(a0, a1, t);
        const r0 = 17.3;
        const y = 9.5 - Math.sin(t * Math.PI) * 1.4;
        cone(s, flat(flagCols[(k + f) % 5]), 0.28, 0.6, { x: Math.cos(a) * r0, y: y - 0.3, z: Math.sin(a) * r0, rx: Math.PI, lo: true, cast: false });
      }
    }
    // spot beams (fake light cones)
    for (const [x, z, c] of [
      [-6, -6, "#fff3c0"],
      [6, -6, "#ffd0f0"],
      [0, 7, "#c0e8ff"],
    ] as [number, number, string][]) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(2.6, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      b.position.set(x * 0.5, 7, z * 0.5);
      b.userData = { x, z };
      this.scene.add(b);
      this.beams.push(b);
    }
    // a pedestal and a drum by the entrance (decor)
    const ped = group(s, { x: -9.4, z: -8.2 });
    cyl(ped, "#2f8dff", 0.9, 0.9, { y: 0.45, seg: 20 });
    cyl(ped, "#ffd23f", 0.95, 0.15, { y: 0.9, seg: 20 });
    const drum = group(s, { x: 9.6, z: -8 });
    cyl(drum, "#e8323c", 0.8, 1.1, { y: 0.55, seg: 20 });
    cyl(drum, "#ffffff", 0.82, 0.1, { y: 1.1, seg: 20 });
    cyl(drum, "#ffffff", 0.82, 0.1, { y: 0.05, seg: 20 });
    this.baked = bake(s, this.scene);
  }

  private buildBomb() {
    this.dangerMat = new THREE.MeshBasicMaterial({ color: "#ff3a1a", transparent: true, opacity: 0.8, depthWrite: false });
    this.danger = new THREE.Mesh(GEO.ring, this.dangerMat);
    this.danger.rotation.x = -Math.PI / 2;
    this.danger.renderOrder = 3;
    this.scene.add(this.danger);
    this.bomb = group(this.scene);
    this.bomb.scale.setScalar(1.15);
    // (a leaked private key: gold keys painted all around the bomb, a PRIV KEY tag over it)
    const keys = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = "#2a2438";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = g.fillStyle = "#ffc928";
      g.lineWidth = 9;
      g.lineCap = "round";
      for (const cx of [w * 0.25, w * 0.75]) {
        const cy = h / 2;
        g.beginPath();
        g.arc(cx - 22, cy, 14, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.moveTo(cx - 8, cy);
        g.lineTo(cx + 34, cy);
        g.moveTo(cx + 22, cy);
        g.lineTo(cx + 22, cy + 13);
        g.moveTo(cx + 32, cy);
        g.lineTo(cx + 32, cy + 10);
        g.stroke();
      }
    });
    this.bombMat = new THREE.MeshToonMaterial({ map: keys, color: "#ffffff", emissive: new THREE.Color("#ff2a10"), emissiveIntensity: 0 });
    this.bombBody = new THREE.Mesh(GEO.sphere, this.bombMat);
    this.bombBody.scale.setScalar(BOMB_R);
    this.bombBody.castShadow = true;
    this.bomb.add(this.bombBody);
    ball(this.bomb, "#ffffff", [0.1, 0.07, 0.04], { x: -0.16, y: 0.18, z: 0.33, cast: false }); // shine
    cyl(this.bomb, "#5a5470", 0.13, 0.18, { y: 0.44, seg: 10 });
    const fuse = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 10, Math.PI * 0.8), toon("#c8a060"));
    fuse.position.set(0.12, 0.54, 0);
    this.bomb.add(fuse);
    this.spark = ball(this.bomb, flat("#ffd23f", 1, true), 0.12, { x: 0.27, y: 0.62, cast: false });
    this.sparkLight = new THREE.PointLight("#ffb040", 6, 6, 1.6);
    this.sparkLight.position.set(0.27, 0.7, 0);
    this.bomb.add(this.sparkLight);
    const tag = textSprite(T("PRIV KEY", "私钥"), 0.4, { color: "#ffffff", bg: "#d8262a" });
    tag.position.y = 1.1;
    this.bomb.add(tag);
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number): CpuPad {
    const me = this.run[i];
    if (!me.alive) return {};
    const lv = this.players[i].level;
    const wob = (1 - lv) * 0.5;
    const wx = Math.sin(this.t * 2.3 + i * 2) * wob,
      wz = Math.cos(this.t * 1.9 + i * 4) * wob;
    if (this.phase !== "live") {
      // between rounds: drift to the middle-ish, spread out
      const a = (i / 4) * Math.PI * 2 + 0.7;
      return this.goto(me, Math.cos(a) * 4, Math.sin(a) * 4, 0.6);
    }
    if (i === this.holder) {
      // chase the nearest reachable victim (not the one who just gave it, right away)
      let best = -1,
        bd = 1e9;
      for (let j = 0; j < this.run.length; j++) {
        const o = this.run[j];
        if (j === i || !o.alive) continue;
        let d = dist2(me.x, me.z, o.x, o.z);
        if (j === this.prevHolder && this.t - this.passT < NO_PASS_BACK + 0.2) d += 6;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      if (best < 0) return {};
      const o = this.run[best];
      const lead = (0.1 + 0.35 * lv) * Math.min(1, bd / 4);
      const tx = o.x + o.vx * lead,
        tz = o.z + o.vz * lead;
      const dx = tx - me.x,
        dz = tz - me.z;
      const d = Math.hypot(dx, dz) || 1;
      const dash = me.dashCd <= 0 && d < 1.8 + 1.4 * lv && d > 0.6 && this.cpuAfter(i, "dash", 0.5 - 0.4 * lv);
      if (dash) this.cpuReset(i, "dash");
      // panic grows as the bomb ticks faster
      const urgency = this.fuseLeft < 3 ? 1 : 0.85;
      return { x: (dx / d) * urgency + wx, y: (dz / d) * urgency + wz, a: dash };
    }
    // flee: away from the holder, away from the walls, and don't cluster with the others
    const h = this.run[this.holder];
    if (!h) return {};
    let fx = 0,
      fz = 0;
    const hd = dist2(me.x, me.z, h.x, h.z);
    const reactR = 3 + 5 * lv;
    const hx = me.x - h.x - h.vx * 0.2 * lv,
      hz = me.z - h.z - h.vz * 0.2 * lv;
    const hl = Math.hypot(hx, hz) || 1;
    const k = clamp((reactR + 2 - hd) / reactR, 0.15, 1.5);
    fx += (hx / hl) * k * 2;
    fz += (hz / hl) * k * 2;
    // strafe sideways when the wall is behind: run around the holder rather than into a corner
    const md = Math.hypot(me.x, me.z) || 1;
    const edge = md / R;
    if (edge > 0.55) {
      const inward = (edge - 0.55) * 4 * (0.6 + 0.6 * lv);
      fx -= (me.x / md) * inward;
      fz -= (me.z / md) * inward;
      // tangent, on the side away from the holder
      const tx = -me.z / md,
        tz = me.x / md;
      const side = tx * hx + tz * hz > 0 ? 1 : -1;
      fx += tx * side * inward * 1.2;
      fz += tz * side * inward * 1.2;
    }
    for (let j = 0; j < this.run.length; j++) {
      const o = this.run[j];
      if (j === i || j === this.holder || !o.alive) continue;
      const d = dist2(me.x, me.z, o.x, o.z);
      if (d < 2.5) {
        fx += ((me.x - o.x) / (d || 1)) * (2.5 - d) * 0.4;
        fz += ((me.z - o.z) / (d || 1)) * (2.5 - d) * 0.4;
      }
    }
    const fl = Math.hypot(fx, fz);
    if (fl < 0.25 && hd > reactR) return { x: wx, y: wz };
    let x = fx / (fl || 1),
      y = fz / (fl || 1);
    x += wx;
    y += wz;
    const dash = me.dashCd <= 0 && hd < 1.4 + 0.8 * lv && this.cpuAfter(i, "esc", 0.45 - 0.35 * lv);
    if (dash) this.cpuReset(i, "esc");
    return { x, y, a: dash };
  }

  private goto(me: Runner, x: number, z: number, sp = 1): CpuPad {
    const dx = x - me.x,
      dz = z - me.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) return {};
    return { x: (dx / d) * sp, y: (dz / d) * sp };
  }

  // ------------------------------------------------------------ the game

  start() {
    this.phase = "live";
    this.phaseT = 0;
    this.markHolder();
    this.hud.banner(T(`${this.players[this.holder].name} has the key!`, `私钥在 ${this.players[this.holder].name} 手上！`), { color: "#ff8a3c", size: 5.5, ms: 1100 });
  }

  protected idle(dt: number) {
    this.moveCam([0, 17, 14.5], [0, 0, 0.7], dt, 1.6);
    this.ambient(dt);
    this.placeBomb(dt);
  }

  protected step(dt: number) {
    this.moveCam([0, 17, 14.5], [0, 0, 0.7], dt, 3);
    this.phaseT += dt;
    this.ambient(dt);
    if (this.phase === "live") {
      this.fuseLeft -= dt;
      // ticking: faster and faster as the end nears
      this.tickT -= dt;
      if (this.tickT <= 0) {
        this.tickT = clamp(this.fuseLeft * 0.085, 0.07, 0.6);
        this.sound("tick");
        if (this.fuseLeft < 2.5) this.sound("click");
        this.bombMat.emissiveIntensity = 0.9;
        this.bombBody.scale.setScalar(BOMB_R * this.swell() * 1.12);
      }
      if (this.fuseLeft <= 0) this.explode();
    } else if (this.phase === "boom") {
      if (this.phaseT >= BOOM_PAUSE) this.newRound();
    } else if (this.phase === "drop") {
      if (this.bombFly >= 1) {
        this.phase = "live";
        this.phaseT = 0;
        this.sound("thud");
        this.markHolder();
      }
    }
    this.movePlayers(dt, true);
    this.passing();
    this.placeBomb(dt);
    const alive = this.run.filter((r) => r.alive).length;
    if (!this.ended && alive <= 1 && this.phase === "boom" && this.phaseT > 1.2) {
      this.ended = true;
      this.finishByElimination(this.out);
    }
  }

  protected outroStep(dt: number) {
    this.ambient(dt);
    this.movePlayers(dt, false);
  }

  protected celebrate(res: MiniResult) {
    this.avatars.forEach((a, i) => {
      const r = this.run[i];
      if (r.alive) {
        a.anim = res.place[i] === 1 ? "win" : "lose";
        if (res.place[i] === 1) this.fx.confetti({ x: r.x, y: 3, z: r.z }, 70);
      } else if (r.seated) a.anim = "lose";
    });
    this.cheer = 3;
    this.sound("cheer");
  }

  private swell() {
    return 1 + 0.45 * clamp(1 - this.fuseLeft / 4.5, 0, 1);
  }

  private ambient(dt: number) {
    const now = performance.now() / 1000;
    this.cheer = Math.max(0, this.cheer - dt);
    const jump = this.cheer > 0 ? 0.35 : 0.06;
    this.crowdBase.forEach((c, k) => {
      const y = c.y + Math.abs(Math.sin(now * (this.cheer > 0 ? 9 : 3) + c.ph)) * jump;
      this.tmpM.makeScale(0.3, 0.36, 0.3);
      this.tmpM.setPosition(c.x, y - 0.05, c.z);
      this.crowd.setMatrixAt(k, this.tmpM);
      this.tmpM.makeScale(0.2, 0.2, 0.2);
      this.tmpM.setPosition(c.x, y + 0.45, c.z);
      this.heads.setMatrixAt(k, this.tmpM);
    });
    this.crowd.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.beams.forEach((b, k) => {
      const a = now * 0.4 + k * 2.1;
      const tx = Math.cos(a) * 4,
        tz = Math.sin(a * 1.3) * 3.5;
      b.position.set(tx * 0.5, 7, tz * 0.5);
      b.lookAt(tx, 0, tz);
      b.rotateX(-Math.PI / 2);
    });
    // spark flicker
    const f = 0.8 + Math.random() * 0.5;
    this.spark.scale.setScalar(0.12 * f);
    this.sparkLight.intensity = this.bomb.visible ? 5 * f : 0;
    if (this.bomb.visible && Math.random() < 0.5) {
      const p = this.spark.getWorldPosition(new THREE.Vector3());
      this.fx.burst(p, { count: 1, colors: ["#ffd23f", "#ff9a2e", "#ffffff"], speed: 2.5, up: 1, gravity: 4, size: 0.07, life: 0.35, shape: "ball" });
    }
  }

  private movePlayers(dt: number, live: boolean) {
    this.run.forEach((r, i) => {
      const a = this.avatars[i];
      if (r.fly) {
        // comic launch toward the stands, spinning
        const f = r.fly;
        f.t += dt;
        const k = clamp(f.t / f.dur, 0, 1);
        const x = lerp(f.x0, f.x1, k),
          z = lerp(f.z0, f.z1, k);
        const y = lerp(0, f.y1, k) + Math.sin(k * Math.PI) * 11;
        a.pos.set(x, y, z);
        a.groundY = k < 0.5 ? 0 : f.y1;
        a.model.rotation.z = 0;
        a.root.rotation.x = k < 1 ? f.t * 14 : 0;
        if (Math.random() < 0.7 && k < 1) this.fx.burst({ x, y: y + 0.6, z }, { count: 1, colors: ["#3a3440", "#6a6470"], speed: 0.5, gravity: -1, size: 0.3, sizeEnd: 0.05, life: 0.7, shape: "ball" });
        if (k >= 1) {
          r.fly = null;
          r.seated = true;
          a.root.rotation.x = 0;
          a.anim = "stun";
          a.yaw = Math.atan2(-x, -z);
          this.fx.dust(a.pos, 12, "#c8b8d8");
          this.sound("thud");
          this.cheer = 1.2;
        }
        return;
      }
      if (!r.alive) {
        if (r.seated && a.anim === "stun" && this.phaseT > 1.6) a.anim = "sit";
        return;
      }
      const p = live ? this.pad(i) : { x: 0, y: 0, aDown: false };
      r.dashCd -= dt;
      const holder = i === this.holder && this.phase !== "boom";
      const sp = SPEED * (holder ? HOLDER_BOOST : 1);
      if (r.dashT > 0) {
        r.dashT -= dt;
        a.anim = "jump";
      } else {
        const k = 1 - Math.exp(-11 * dt);
        r.vx += (p.x * sp - r.vx) * k;
        r.vz += (p.y * sp - r.vz) * k;
        if (live && p.aDown && r.dashCd <= 0) {
          const l = Math.hypot(p.x, p.y);
          const yaw = l > 0.2 ? Math.atan2(p.x, p.y) : a.yaw;
          r.vx = Math.sin(yaw) * DASH_V;
          r.vz = Math.cos(yaw) * DASH_V;
          r.dashT = DASH_T;
          r.dashCd = DASH_CD;
          this.sound("whoosh");
          this.fx.dust(a.pos, 8, "#f0d8a8");
        }
        const v = Math.hypot(r.vx, r.vz);
        if (live) a.anim = holder ? (v > 0.6 ? "run" : "hold") : v > 0.6 ? "run" : "idle";
        a.speed = clamp(v / SPEED, 0, 1);
      }
      r.x += r.vx * dt;
      r.z += r.vz * dt;
      const d = Math.hypot(r.x, r.z);
      if (d > R - PR) {
        r.x *= (R - PR) / d;
        r.z *= (R - PR) / d;
      }
      if (Math.hypot(r.vx, r.vz) > 0.5) a.face(Math.atan2(r.vx, r.vz), dt);
      a.pos.set(r.x, 0, r.z);
      a.groundY = 0;
    });
    // bumping bodies
    for (let i = 0; i < this.run.length; i++)
      for (let j = i + 1; j < this.run.length; j++) {
        const A = this.run[i],
          B = this.run[j];
        if (!A.alive || !B.alive) continue;
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d < PR * 2 && d > 1e-4) {
          const push = (PR * 2 - d) / 2;
          A.x -= (dx / d) * push;
          A.z -= (dz / d) * push;
          B.x += (dx / d) * push;
          B.z += (dz / d) * push;
        }
      }
  }

  /** Touching someone passes the bomb. */
  private passing() {
    if (this.phase !== "live" || this.holder < 0) return;
    if (this.t - this.passT < PASS_GAP) return;
    const h = this.run[this.holder];
    for (let j = 0; j < this.run.length; j++) {
      const o = this.run[j];
      if (j === this.holder || !o.alive) continue;
      if (j === this.prevHolder && this.t - this.passT < NO_PASS_BACK) continue;
      if (dist2(h.x, h.z, o.x, o.z) < PR * 2 + 0.12) {
        this.bombFrom.copy(this.bomb.position);
        this.bombFly = 0;
        this.prevHolder = this.holder;
        this.holder = j;
        this.passT = this.t;
        this.sound("pop");
        this.sound("whoosh");
        this.buzz(j, [40, 30, 40]);
        this.avatars[j].flash();
        this.fx.burst({ x: o.x, y: 1.8, z: o.z }, { count: 10, colors: ["#ffd23f", "#ffffff"], speed: 4, size: 0.12, life: 0.4 });
        this.hud.pop(new THREE.Vector3(o.x, 2.6, o.z), T("YOURS!", "给你！"), this.players[this.prevHolder].char.color, this.camera);
        // a little shove apart
        const dx = o.x - h.x,
          dz = o.z - h.z,
          d = Math.hypot(dx, dz) || 1;
        o.vx += (dx / d) * 4;
        o.vz += (dz / d) * 4;
        this.markHolder();
        return;
      }
    }
  }

  private markHolder() {
    this.players.forEach((p, i) => {
      this.hud.mark(p.seat, "hot", i === this.holder && this.phase !== "boom");
      if (this.run[i].alive) this.hud.setScore(p.seat, i === this.holder ? T("🔑 Hot key!", "🔑 私钥在手！") : T("In play", "在场"));
    });
  }

  private placeBomb(dt: number) {
    if (this.holder < 0 || this.phase === "boom") {
      this.bomb.visible = false;
      this.danger.visible = false;
      return;
    }
    this.bomb.visible = true;
    // a pulsing red ring under the holder (faster as the fuse burns)
    const ha = this.avatars[this.holder];
    this.danger.visible = this.phase === "live";
    this.danger.position.set(ha.pos.x, 0.04, ha.pos.z);
    const beat = this.phase === "live" ? clamp(1.4 - this.fuseLeft * 0.08, 0.4, 1.4) : 0.4;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * (6 + 14 * beat));
    this.danger.scale.setScalar(0.85 + 0.2 * pulse);
    this.dangerMat.opacity = 0.55 + 0.35 * pulse;
    const a = this.avatars[this.holder];
    const target = new THREE.Vector3(a.pos.x + Math.sin(a.yaw) * 0.15, a.pos.y + 2.3, a.pos.z + Math.cos(a.yaw) * 0.15);
    if (this.bombFly < 1) {
      const dur = this.phase === "drop" ? 0.7 : 0.16;
      this.bombFly = Math.min(1, this.bombFly + dt / dur);
      const k = this.bombFly;
      this.bomb.position.lerpVectors(this.bombFrom, target, this.phase === "drop" ? k * k : k);
      if (this.phase !== "drop") this.bomb.position.y += Math.sin(k * Math.PI) * 1.2;
    } else this.bomb.position.copy(target);
    const sw = this.phase === "live" ? this.swell() : 1;
    // the bomb wobbles and the tick flash fades
    this.bombMat.emissiveIntensity = Math.max(0, this.bombMat.emissiveIntensity - dt * 4);
    const cur = this.bombBody.scale.x;
    this.bombBody.scale.setScalar(cur + (BOMB_R * sw - cur) * Math.min(1, dt * 12));
    this.bomb.rotation.z = Math.sin(this.t * 7) * 0.12 * sw;
    this.bomb.rotation.y += dt * 1.5;
  }

  private explode() {
    const i = this.holder;
    const r = this.run[i];
    const a = this.avatars[i];
    const at = { x: r.x, y: 1.6, z: r.z };
    this.fx.explosion(at, 4);
    this.fx.burst(at, { count: 24, colors: ["#2a2438", "#4a4458", "#ffd23f"], speed: 9, up: 4, size: 0.25, life: 0.9 });
    this.fx.ring({ x: r.x, y: 0.05, z: r.z }, "#ffb040", 5, 0.5);
    this.sound("explode");
    this.sound("crash");
    this.shake = 0.9;
    this.buzz(i, [200, 60, 200]);
    // others nearby get shoved
    this.run.forEach((o, j) => {
      if (j === i || !o.alive) return;
      const d = dist2(o.x, o.z, r.x, r.z);
      if (d < 3.5) {
        const k = (3.5 - d) * 4;
        o.vx += ((o.x - r.x) / (d || 1)) * k;
        o.vz += ((o.z - r.z) / (d || 1)) * k;
        this.avatars[j].flash();
      }
    });
    // blasted into the stands
    r.alive = false;
    this.out.push(i);
    const seat = this.seats[this.out.length - 1];
    r.fly = { t: 0, x0: r.x, z0: r.z, x1: seat.x, z1: seat.z, y1: seat.y, dur: 1.5 };
    a.anim = "fall";
    a.flash();
    a.setRing(null);
    const place = this.players.length - this.out.length + 1;
    this.hud.setScore(this.players[i].seat, `${T("Leaked!", "泄露！")} ${ordinal(place)}`);
    this.hud.mark(this.players[i].seat, "hot", false);
    this.hud.mark(this.players[i].seat, "out");
    this.hud.pop(new THREE.Vector3(r.x, 3, r.z), T("LEAKED!", "泄露了！"), "#ff8a3c", this.camera);
    this.phase = "boom";
    this.phaseT = 0;
    this.holder = -1;
    this.prevHolder = -1;
    this.cheer = 2;
    this.sound("cheer");
    const alive = this.run.filter((o) => o.alive).length;
    if (alive >= 2) this.hud.banner(T("KEY LEAKED!", "私钥泄露！"), { color: "#ff8a3c", size: 9, ms: 900 });
  }

  dispose() {
    for (const m of this.baked) m.dispose();
    super.dispose();
  }

  private newRound() {
    const alive = this.run.map((r, i) => (r.alive ? i : -1)).filter((i) => i >= 0);
    if (alive.length < 2) return;
    this.round++;
    this.roundEl.firstElementChild!.textContent = alive.length === 2 ? T("Final!", "决赛！") : T(`Round ${this.round}`, `第 ${this.round} 回合`);
    this.holder = alive[Math.floor(this.rnd() * alive.length)];
    this.prevHolder = -1;
    this.passT = this.t;
    this.fuse = this.fuseLeft = FUSE_MIN + this.rnd() * (FUSE_MAX - FUSE_MIN);
    this.tickT = 0.4;
    this.phase = "drop";
    this.phaseT = 0;
    const h = this.run[this.holder];
    this.bombFrom.set(h.x, 14, h.z);
    this.bombFly = 0;
    this.bombBody.scale.setScalar(BOMB_R);
    this.bombMat.emissiveIntensity = 0;
    this.sound("whistle");
    if (alive.length === 2) {
      this.hud.banner(T("FINAL!", "决赛！"), { color: "#ffd23f", sub: hasKey(this.players[this.holder].name), ms: 1300 });
      music.speed(1.15);
    } else this.hud.banner(T(`ROUND ${this.round}`, `第 ${this.round} 回合`), { color: "#ffffff", sub: hasKey(this.players[this.holder].name), ms: 1300 });
  }
}

const def: MiniDef = {
  id: "patate-chaude",
  name: "Hot Key",
  icon: "💣",
  color: "#ff6b2e",
  tagline: "A leaked private key is about to blow. Pass it on!",
  rules: "Holding the key? Touch someone to hand it over. Nobody knows when it blows: its holder is out! The last one in the ring wins.",
  controls: { stick: "Run", a: "Sprint" },
  modes: ["ffa"],
  length: 40,
  music: "tense",
  create: (ctx) => new PatateChaude(ctx),
};
export default def;
