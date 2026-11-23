/**
 * GOLF EXPRESS (chacun pour soi, 3 manches): a mini-golf green with a little windmill and mushroom
 * bumpers. Each round everybody shoots at once from their tee: the stick turns the arrow, A starts
 * the power gauge, A again shoots. Balls roll with friction, bounce off the walls, the bumpers and
 * each other. Closest to the hole scores 3/2/1/0, in the hole = 5. Most points after 3 rounds wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, cone, cyl, flat, group, toon, tree, cloud, FONT_TITLE } from "../../engine/gfx";
import { clamp, damp, easeOutBack } from "../../engine/util";
import { T } from "../../../../i18n/lang";

const ROUNDS = 3;
const BR = 0.25; // ball radius
const HOLE_R = 0.36;
const X = 7.2;
const ZT = -13.2;
const ZB = 9.2;
const TEE_Z = 7.4;
const TEES = [-4.8, -1.6, 1.6, 4.8];
const VMIN = 2;
const VMAX = 13;
const FR = 1.4; // rolling friction (u/s²)
const DR = 0.25; // drag (1/s)
const AIM_T = 12; // seconds to shoot
const METER_P = 2.0; // gauge period
const BUMP_R = 0.55;
const BUMPERS: [number, number][] = [
  [-3.3, 2.2],
  [3.3, 2.2],
  [-4.6, -6.8],
  [4.6, -6.8],
];
const HOLES: { x: number; z: number; en: string; zh: string }[] = [
  { x: 0, z: -10.8, en: "Hole 1 · The Windmill", zh: "第 1 洞 · 风车" },
  { x: -4.7, z: -10.6, en: "Hole 2 · Mushroom Corner", zh: "第 2 洞 · 蘑菇角" },
  { x: 5.0, z: -1.0, en: "Hole 3 · The Bend", zh: "第 3 洞 · 大弯道" },
];
// windmill
const WM_Z0 = -3.9;
const WM_Z1 = -2.1;
const WM_X = 1.8;
const GAP = 0.55;
const BLADE_W = 1.5; // rad/s

type Seg = [number, number, number, number];
const WALLS: Seg[] = [
  [-X, ZT, X, ZT],
  [X, ZT, X, ZB],
  [X, ZB, -X, ZB],
  [-X, ZB, -X, ZT],
  [-X, ZT + 3, -X + 3, ZT],
  [X - 3, ZT, X, ZT + 3],
];
// the windmill's two blocks
for (const [x0, x1] of [
  [-WM_X, -GAP],
  [GAP, WM_X],
]) {
  WALLS.push([x0, WM_Z0, x1, WM_Z0], [x1, WM_Z0, x1, WM_Z1], [x1, WM_Z1, x0, WM_Z1], [x0, WM_Z1, x0, WM_Z0]);
}

interface Ball {
  x: number;
  z: number;
  vx: number;
  vz: number;
  moving: boolean;
  inHole: boolean;
  sink: number;
}
interface Golfer {
  tee: number;
  aim: number;
  state: "aim" | "charge" | "shot";
  meter: number;
  meterT: number;
  b: Ball;
  mesh: THREE.Mesh;
  pin: THREE.Object3D;
  arrow: THREE.Group;
  arrowBody: THREE.Mesh;
  club: THREE.Group;
  label: HTMLElement;
  bar: HTMLElement;
  msg: HTMLElement;
  pts: number;
  roundLabel: HTMLElement | null;
  // CPU
  plan: { angle: number; pow: number } | null;
  search: { k: number; best: number; ba: number; bp: number; fine: boolean };
  cpuPrevMeter: number;
}

const WALLS_SHUT: Seg[] = [...WALLS, [-GAP, WM_Z1 + 0.05, GAP, WM_Z1 + 0.05]];

/** One step of ball physics against the static course (shared by the game and the CPU's planner). */
function collideStatic(b: Ball, bladesBlock: boolean, bumpHit?: (k: number) => void) {
  let hit = false;
  const segs = bladesBlock ? WALLS_SHUT : WALLS;
  for (const [x1, z1, x2, z2] of segs) {
    const dx = x2 - x1,
      dz = z2 - z1;
    const l2 = dx * dx + dz * dz;
    const t = clamp(((b.x - x1) * dx + (b.z - z1) * dz) / l2, 0, 1);
    const px = x1 + dx * t,
      pz = z1 + dz * t;
    const ox = b.x - px,
      oz = b.z - pz;
    const d = Math.hypot(ox, oz);
    if (d < BR && d > 1e-6) {
      const nx = ox / d,
        nz = oz / d;
      b.x = px + nx * BR;
      b.z = pz + nz * BR;
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) {
        b.vx -= 1.72 * vn * nx;
        b.vz -= 1.72 * vn * nz;
        hit = Math.abs(vn) > 1.5 || hit;
      }
    }
  }
  BUMPERS.forEach(([cx, cz], k) => {
    const ox = b.x - cx,
      oz = b.z - cz;
    const d = Math.hypot(ox, oz);
    if (d < BR + BUMP_R && d > 1e-6) {
      const nx = ox / d,
        nz = oz / d;
      b.x = cx + nx * (BR + BUMP_R);
      b.z = cz + nz * (BR + BUMP_R);
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) {
        b.vx -= 2.1 * vn * nx;
        b.vz -= 2.1 * vn * nz;
        // a bumper always kicks a little
        const sp = Math.hypot(b.vx, b.vz);
        if (sp < 3.5) {
          b.vx += nx * (3.5 - sp);
          b.vz += nz * (3.5 - sp);
        }
        bumpHit?.(k);
      }
    }
  });
  return hit;
}

/** Friction + the hole's pull. Returns true when the ball drops. */
function rollStep(b: Ball, dt: number, hx: number, hz: number) {
  const sp = Math.hypot(b.vx, b.vz);
  if (sp > 0) {
    const ns = Math.max(0, sp - (FR + DR * sp) * dt);
    b.vx *= ns / sp;
    b.vz *= ns / sp;
  }
  const ox = hx - b.x,
    oz = hz - b.z;
  const d = Math.hypot(ox, oz);
  if (d < 0.5 && d > 1e-4) {
    b.vx += (ox / d) * 1.8 * dt;
    b.vz += (oz / d) * 1.8 * dt;
  }
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  const s2 = Math.hypot(b.vx, b.vz);
  if (d < HOLE_R - 0.08 && s2 < 4.2) return true;
  if (s2 < 0.06) {
    b.vx = b.vz = 0;
    b.moving = false;
  }
  return false;
}

const bladesBlockAt = (t: number) => {
  // four blades; one blocks the tunnel when it points down
  const a = t * BLADE_W;
  for (let k = 0; k < 4; k++) {
    const ang = a + (k * Math.PI) / 2;
    const d = Math.atan2(Math.sin(ang + Math.PI / 2), Math.cos(ang + Math.PI / 2));
    if (Math.abs(d) < 0.34) return true;
  }
  return false;
};

const CSS = `
.gf-tag{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.25)}
.gf-msg{font-size:calc(var(--u)*1.15);font-weight:700;white-space:nowrap}
.gf-bar{position:relative;width:calc(var(--u)*7);height:calc(var(--u)*.9);border-radius:9px;background:rgba(0,0,0,.35);overflow:hidden;border:calc(var(--u)*.15) solid #fff}
.gf-bar i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#3fcf5a,#ffd23f,#ff4b3e);background-size:calc(var(--u)*7) 100%}
.gf-pts{font-family:var(--title);font-size:calc(var(--u)*2.4);-webkit-text-stroke:calc(var(--u)*.2) #1d1630;paint-order:stroke fill;background:none!important;white-space:nowrap}
`;

class Golf extends BaseMini {
  private g: Golfer[] = [];
  private round = 0;
  private phase: "aim" | "roll" | "score" | "done" = "aim";
  private phaseT = 0;
  private hole!: THREE.Group;
  private holeX = 0;
  private holeZ = 0;
  private flag!: THREE.Mesh;
  private blades!: THREE.Group;
  private bumpers: THREE.Object3D[] = [];
  private bumpPulse: number[] = BUMPERS.map(() => 0);
  private bladeT = 0;
  cardVals: HTMLElement[] = [];
  private arrowGeo: THREE.ShapeGeometry;
  private tipEl: HTMLElement | null = null;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#58b4ff", "#e6f6ff"], size: 18, sun: [0.4, 1, 0.5], fog: { near: 60, far: 140 } });
    this.hud.add(`<style>${CSS}</style>`);
    const s = new THREE.Shape();
    s.moveTo(-0.09, 0);
    s.lineTo(0.09, 0);
    s.lineTo(0.09, 0.75);
    s.lineTo(0.26, 0.75);
    s.lineTo(0, 1);
    s.lineTo(-0.26, 0.75);
    s.lineTo(-0.09, 0.75);
    s.closePath();
    this.arrowGeo = new THREE.ShapeGeometry(s);
    this.buildCourse();
    this.players.forEach((p, i) => {
      const col = p.char.color;
      const mesh = new THREE.Mesh(GEO.sphere, toon(col));
      mesh.scale.setScalar(BR);
      mesh.castShadow = true;
      this.scene.add(mesh);
      const pin = group(this.scene, {});
      cone(pin, col, 0.2, 0.36, { rx: Math.PI, cast: false });
      ball(pin, "#ffffff", 0.07, { y: 0.2, cast: false });
      const arrow = group(this.scene, {});
      const arrowBody = new THREE.Mesh(this.arrowGeo, flat(col, 0.92));
      arrowBody.rotation.x = -Math.PI / 2;
      arrowBody.position.y = 0.04;
      arrowBody.renderOrder = 3;
      arrow.add(arrowBody);
      const a = this.spawn(i, 0, 0, Math.PI);
      a.setRing(col);
      // the putter, hinged at the hands
      const club = group(a.root, { x: 0.12, y: 0.8, z: 0.3 });
      club.rotation.order = "YXZ";
      club.rotation.x = -0.32;
      cyl(club, "#d0d4e0", 0.025, 0.85, { y: -0.42, seg: 6 });
      box(club, "#3a3a48", 0.08, 0.1, 0.3, { y: -0.86, z: 0.08 });
      cyl(club, "#1d1630", 0.04, 0.2, { y: -0.08, seg: 6 });
      const label = this.hud.label(a.root, `<div class="gf-tag"><div class="gf-msg"></div><div class="gf-bar"><i></i></div></div>`, { dy: 1.95, color: "rgba(20,14,40,.8)" });
      label.style.border = `calc(var(--u)*0.22) solid ${col}`;
      this.g.push({
        tee: i,
        aim: 0,
        state: "aim",
        meter: 0,
        meterT: 0,
        b: { x: 0, z: TEE_Z, vx: 0, vz: 0, moving: false, inHole: false, sink: 0 },
        mesh,
        pin,
        arrow,
        arrowBody,
        club,
        label,
        bar: label.querySelector(".gf-bar i") as HTMLElement,
        msg: label.querySelector(".gf-msg") as HTMLElement,
        pts: 0,
        roundLabel: null,
        plan: null,
        search: { k: 0, best: 1e9, ba: 0, bp: 0.5, fine: false },
        cpuPrevMeter: 0,
      });
    });
    const cards = this.hud.players(this.players, () => "⛳ 0");
    this.cardVals = this.players.map((_, i) => cards.children[i]?.querySelector(".val") as HTMLElement);
    this.setupRound(0);
    this.setCam([0, 26, 26], [0, 0, -2], 44);
  }

  // ------------------------------------------------------------ the course

  private buildCourse() {
    const s = this.scene;
    // the park lawn around
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), toon("#7fcf62"));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.3;
    lawn.receiveShadow = true;
    s.add(lawn);
    // the green, with mowing stripes; its shape follows the walls (corner banks cut off)
    const tex = canvasTex(256, 256, (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? "#3fbf4a" : "#4fcf58";
        g.fillRect(0, (i * h) / 8, w, h / 8);
      }
    }, true);
    tex.repeat.set(1, 3);
    const sh = new THREE.Shape();
    sh.moveTo(-X, -ZB);
    sh.lineTo(X, -ZB);
    sh.lineTo(X, -ZT - 3);
    sh.lineTo(X - 3, -ZT);
    sh.lineTo(-X + 3, -ZT);
    sh.lineTo(-X, -ZT - 3);
    sh.closePath();
    const gg = new THREE.ShapeGeometry(sh);
    // UVs: map the green's extent to 0..1
    const pos = gg.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let k = 0; k < pos.count; k++) {
      uv[k * 2] = (pos.getX(k) + X) / (2 * X);
      uv[k * 2 + 1] = (pos.getY(k) + ZB) / (ZB - ZT);
    }
    gg.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const green = new THREE.Mesh(gg, new THREE.MeshToonMaterial({ map: tex }));
    green.rotation.x = -Math.PI / 2;
    green.receiveShadow = true;
    s.add(green);
    // a stone base under it
    box(s, "#c9b48e", 2 * X + 1.4, 0.3, ZB - ZT + 1.4, { y: -0.16, z: (ZB + ZT) / 2 });
    // the walls: wooden rails
    for (const [x1, z1, x2, z2] of WALLS.slice(0, 6)) {
      const l = Math.hypot(x2 - x1, z2 - z1);
      const w = box(s, "#b8743e", l + 0.36, 0.36, 0.36, { x: (x1 + x2) / 2, y: 0.18, z: (z1 + z2) / 2, ry: -Math.atan2(z2 - z1, x2 - x1) });
      void w;
      box(s, "#ffd23f", l + 0.38, 0.06, 0.38, { x: (x1 + x2) / 2, y: 0.39, z: (z1 + z2) / 2, ry: -Math.atan2(z2 - z1, x2 - x1), cast: false });
    }
    // the tees: mats and numbers
    TEES.forEach((x) => {
      box(s, "#2f7a3a", 1.3, 0.04, 1.3, { x, y: 0.02, z: TEE_Z, cast: false });
      cyl(s, "#ffffff", 0.1, 0.02, { x, y: 0.05, z: TEE_Z, seg: 10, cast: false });
    });
    // the windmill
    const wm = group(s, { z: (WM_Z0 + WM_Z1) / 2 });
    const d = WM_Z1 - WM_Z0;
    for (const sx of [-1, 1]) box(wm, "#f4ede0", WM_X - GAP, 1.0, d, { x: sx * (GAP + (WM_X - GAP) / 2), y: 0.5 });
    box(wm, "#f4ede0", 2 * WM_X, 1.7, d, { y: 1.85 });
    box(wm, "#d23a3a", 2 * GAP + 0.2, 0.18, d + 0.04, { y: 1.06 });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.4, 4), toon("#d23a3a"));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 3.9;
    roof.scale.set(1, 1, 0.55);
    roof.castShadow = true;
    wm.add(roof);
    box(wm, "#6a8ad0", 0.7, 0.7, 0.08, { y: 2.1, z: d / 2 + 0.02 });
    this.blades = group(wm, { y: 2.2, z: d / 2 + 0.3 });
    cyl(this.blades, "#5a3a20", 0.22, 0.3, { rx: Math.PI / 2, seg: 10 });
    for (let k = 0; k < 4; k++) {
      const arm = group(this.blades, { rz: (k * Math.PI) / 2 });
      box(arm, "#7a4a2a", 0.12, 2.0, 0.08, { y: 1.05 });
      box(arm, "#fff7e8", 0.55, 1.5, 0.04, { x: 0.3, y: 1.2, z: 0.03 });
    }
    // the mushroom bumpers
    for (const [x, z] of BUMPERS) {
      const b = group(s, { x, z });
      cyl(b, "#fff3e0", 0.32, 0.5, { y: 0.25, seg: 14 });
      const cap = ball(b, "#e8323a", [BUMP_R + 0.12, 0.42, BUMP_R + 0.12], { y: 0.55 });
      void cap;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ball(b, "#ffffff", 0.1, { x: Math.cos(a) * 0.42, y: 0.78, z: Math.sin(a) * 0.42, cast: false });
      }
      ball(b, "#ffffff", 0.12, { y: 0.98, cast: false });
      this.bumpers.push(b);
    }
    // the hole, its flag
    this.hole = group(s, {});
    const hm = new THREE.Mesh(GEO.circle, flat("#14321a"));
    hm.rotation.x = -Math.PI / 2;
    hm.scale.setScalar(HOLE_R);
    hm.position.y = 0.015;
    this.hole.add(hm);
    const rim = new THREE.Mesh(GEO.ring, flat("#ffffff"));
    rim.rotation.x = -Math.PI / 2;
    rim.scale.setScalar(HOLE_R + 0.06);
    rim.position.y = 0.02;
    this.hole.add(rim);
    cyl(this.hole, "#f4f4f4", 0.04, 2.4, { y: 1.2, seg: 6 });
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55, 6, 1), new THREE.MeshToonMaterial({ color: "#ffd23f", side: THREE.DoubleSide }));
    this.flag.position.set(0.45, 2.1, 0);
    this.flag.castShadow = true;
    this.hole.add(this.flag);
    // the park: hedges, trees, flowers, bunting
    for (let k = 0; k < 18; k++) {
      const side = k % 2 ? 1 : -1;
      const z = ZB - 2 - Math.floor(k / 2) * 2.7;
      tree(s, side * (X + 3 + (k % 3)), z, 1.4 + (k % 3) * 0.3, k % 4 < 2 ? "#4fae4a" : "#5fc155");
    }
    for (let k = 0; k < 8; k++) tree(s, -16 + k * 4.5, ZT - 4 - (k % 2) * 2, 2 + (k % 3) * 0.4, "#48a84a");
    const fcol = ["#ff5a7a", "#ffd23f", "#ffffff", "#ff8ad8", "#8a6aff"];
    for (let k = 0; k < 40; k++) {
      const side = k % 2 ? 1 : -1;
      const z = ZB - (k / 40) * (ZB - ZT);
      ball(s, "#3f9a3a", 0.35, { x: side * (X + 1.1), y: 0, z, lo: true, cast: false });
      ball(s, fcol[k % 5], 0.1, { x: side * (X + 1.1), y: 0.3, z: z + 0.1, lo: true, cast: false });
    }
    // bunting along the far side
    for (let k = 0; k < 2; k++) cyl(s, "#8a5a32", 0.08, 4.2, { x: (k ? 1 : -1) * (X + 0.9), y: 2.0, z: ZT - 0.9, seg: 6 });
    for (let k = 0; k < 18; k++) {
      const t = (k + 0.5) / 18;
      const x = -X - 0.9 + t * (2 * X + 1.8);
      const y = 3.9 - Math.sin(t * Math.PI) * 0.8;
      cone(s, fcol[k % 5], 0.22, 0.45, { x, y: y - 0.2, z: ZT - 0.9, rx: Math.PI, lo: true, cast: false });
    }
    for (let k = 0; k < 5; k++) cloud(s, -30 + k * 15, 16 + (k % 2) * 3, -45, 2 + (k % 3) * 0.5);
    // a little ticket booth
    const tb = group(s, { x: -X - 6.5, z: ZB - 10, ry: 0.9 });
    box(tb, "#ffe0a8", 2.4, 2.2, 2.0, { y: 1.1 });
    cone(tb, "#3d8bff", 2.0, 1.2, { y: 2.8, lo: true });
    box(tb, "#3a2a20", 1.2, 0.8, 0.1, { y: 1.3, z: 1.02 });
    const sign = new THREE.Mesh(
      GEO.plane,
      new THREE.MeshBasicMaterial({
        map: canvasTex(256, 96, (g, w, h) => {
          g.fillStyle = "#ffffff";
          g.beginPath();
          g.roundRect(0, 0, w, h, 30);
          g.fill();
          g.fillStyle = "#2f7a3a";
          g.font = `56px ${FONT_TITLE}`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText("MINI-GOLF", w / 2, h / 2 + 4);
        }),
        transparent: true,
      }),
    );
    sign.scale.set(2.2, 0.82, 1);
    sign.position.set(0, 2.25, 1.06);
    tb.add(sign);
  }

  // ------------------------------------------------------------ rounds

  private setupRound(r: number) {
    this.round = r;
    const h = HOLES[r];
    this.holeX = h.x;
    this.holeZ = h.z;
    this.hole.position.set(h.x, 0, h.z);
    this.phase = "aim";
    this.phaseT = 0;
    const n = this.players.length;
    this.g.forEach((G, i) => {
      G.tee = (i + r) % n;
      const x = TEES[G.tee % TEES.length];
      G.b = { x, z: TEE_Z, vx: 0, vz: 0, moving: false, inHole: false, sink: 0 };
      // start aiming roughly at the hole
      G.aim = clamp(Math.atan2(h.x - x, -(h.z - TEE_Z)) * 0.6, -1.3, 1.3);
      G.state = "aim";
      G.meter = 0;
      G.meterT = 0;
      G.plan = null;
      G.search = { k: 0, best: 1e9, ba: 0, bp: 0.5, fine: false };
      G.mesh.visible = true;
      G.mesh.scale.setScalar(BR);
      G.arrow.visible = true;
      G.msg.innerHTML = `<span class="key stick" style="font-size:.85em">🕹️</span> ${T("aim", "瞄准")} · <span class="key a" style="font-size:.85em">A</span>`;
      G.bar.style.width = "0%";
      G.label.style.visibility = "visible";
      if (G.roundLabel) {
        this.hud.removeLabel(G.roundLabel);
        G.roundLabel = null;
      }
      const a = this.avatars[i];
      a.anim = "idle";
      a.pos.set(x - 0.62, 0, TEE_Z + 0.15);
      G.club.rotation.z = 0;
    });
    if (r > 0) {
      this.sound("ding");
      this.hud.banner(T(h.en, h.zh), { color: "#ffffff", size: 5.5, ms: 1500 });
    }
    this.hud.timer(AIM_T);
    if (!this.tipEl) {
      this.tipEl = this.hud.add(T(`🕹️ Aim · <span class="key a">A</span> starts the gauge · <span class="key a">A</span> shoots`, `🕹️ 瞄准 · <span class="key a">A</span> 开始力度条 · <span class="key a">A</span> 击球`), "hud-tip");
      this.tipEl.style.top = "calc(var(--u) * 7.6)";
      this.tipEl.style.bottom = "auto";
    }
  }

  // ------------------------------------------------------------ CPUs

  /** Where a shot ends (ignoring the other balls): distance to the hole, 0 if it drops. */
  private simulate(x: number, angle: number, pow: number, t0: number) {
    const sp = VMIN + (VMAX - VMIN) * pow;
    const b: Ball = { x, z: TEE_Z, vx: Math.sin(angle) * sp, vz: -Math.cos(angle) * sp, moving: true, inHole: false, sink: 0 };
    const dt = 1 / 50;
    for (let k = 0; k < 420 && b.moving; k++) {
      if (rollStep(b, dt, this.holeX, this.holeZ)) return 0;
      collideStatic(b, bladesBlockAt(t0 + k * dt));
    }
    return Math.hypot(b.x - this.holeX, b.z - this.holeZ);
  }

  private think(i: number) {
    const G = this.g[i];
    const S = G.search;
    if (G.plan) return;
    const x = TEES[G.tee % TEES.length];
    const t0 = this.bladeT + 2.5;
    for (let n = 0; n < 24; n++) {
      let a: number, p: number;
      if (!S.fine) {
        // a coarse grid: 27 angles × 14 powers
        if (S.k >= 27 * 14) {
          S.fine = true;
          S.k = 0;
          continue;
        }
        a = -1.3 + (2.6 * (S.k % 27)) / 26;
        p = 0.18 + (0.82 * Math.floor(S.k / 27)) / 13;
      } else {
        if (S.k >= 81) {
          const lv = this.players[i].level;
          const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;
          G.plan = { angle: clamp(S.ba + gauss() * (0.15 - 0.12 * lv), -1.35, 1.35), pow: clamp(S.bp + gauss() * (0.13 - 0.1 * lv), 0.05, 1) };
          return;
        }
        a = S.ba + ((S.k % 9) - 4) * 0.012;
        p = S.bp + (Math.floor(S.k / 9) - 4) * 0.012;
      }
      S.k++;
      const d = this.simulate(x, a, clamp(p, 0, 1), t0) + p * 0.05;
      if (d < S.best) {
        S.best = d;
        S.ba = a;
        S.bp = clamp(p, 0, 1);
      }
    }
  }

  protected cpu(i: number): CpuPad {
    const G = this.g[i];
    const lv = this.players[i].level;
    if (this.phase !== "aim" || G.state === "shot") return {};
    this.think(i);
    if (!G.plan) {
      // look around while thinking
      return { x: Math.sin(this.t * 1.3 + i) * 0.25 };
    }
    if (G.state === "aim") {
      const da = G.plan.angle - G.aim;
      if (Math.abs(da) > 0.012) return { x: clamp(da * 4, -1, 1) };
      return { a: this.cpuAfter(i, "go", 0.3 + (1 - lv) * 0.8) };
    }
    // charging: shoot when the gauge crosses the planned power
    this.cpuReset(i, "go");
    const m = G.meter,
      pm = G.cpuPrevMeter;
    G.cpuPrevMeter = m;
    const crossed = G.meterT > 0.05 && (pm - G.plan.pow) * (m - G.plan.pow) <= 0 && pm !== m;
    return { a: crossed };
  }

  // ------------------------------------------------------------ the game

  start() {
    this.hud.banner(T(HOLES[0].en, HOLES[0].zh), { color: "#ffffff", size: 5.5, ms: 1500 });
  }

  protected idle(dt: number) {
    this.animDecor(dt);
    this.g.forEach((_, i) => this.placeGolfer(i, dt));
    this.moveCam([0, 18.5, 18.6], [0, 0, -1.4], dt, 1.3);
  }

  protected step(dt: number) {
    this.phaseT += dt;
    this.animDecor(dt, this.phase !== "aim" && this.phase !== "roll");
    if (this.tipEl) this.tipEl.style.display = this.phase === "aim" ? "" : "none";
    this.moveCam([0, 18.5, 18.6], [0, 0, -1.4], dt, 3);

    if (this.phase === "aim" || this.phase === "roll") {
      // aiming and shooting (each on their own)
      if (this.phase === "aim") this.hud.timer(AIM_T - this.phaseT);
      this.g.forEach((G, i) => {
        const p = this.pad(i);
        if (G.state === "aim") {
          G.aim = clamp(G.aim + p.x * Math.abs(p.x) * 1.7 * dt + p.x * 0.25 * dt, -1.35, 1.35);
          if (p.aDown && this.phaseT > 0.3) {
            G.state = "charge";
            G.meterT = 0;
            G.meter = 0;
            G.cpuPrevMeter = 0;
            this.sound("select");
            G.msg.innerHTML = `<span class="key a" style="font-size:.85em">A</span> ${T("shoot!", "击球！")}`;
          }
        } else if (G.state === "charge") {
          G.aim = clamp(G.aim + p.x * Math.abs(p.x) * 0.6 * dt, -1.35, 1.35);
          G.meterT += dt;
          const ph = (G.meterT / METER_P) % 1;
          G.meter = ph < 0.5 ? ph * 2 : 2 - ph * 2;
          G.bar.style.width = `${(G.meter * 100).toFixed(1)}%`;
          if (p.aDown) this.shoot(i);
        }
        if (this.phase === "aim" && this.phaseT >= AIM_T && G.state !== "shot") {
          if (G.state === "aim") G.meter = 0.45;
          this.hud.pop(new THREE.Vector3(G.b.x, 1.5, G.b.z), T("Auto shot!", "自动击球！"), "#ffb02e", this.camera);
          this.shoot(i);
        }
      });
      if (this.phase === "aim" && this.g.every((G) => G.state === "shot")) {
        this.phase = "roll";
        this.phaseT = 0;
        this.hud.timer(null);
      }
      this.physics(dt);
      if (this.phase === "roll" && (this.g.every((G) => !G.b.moving) || this.phaseT > 9)) {
        for (const G of this.g) G.b.moving = false;
        this.scoreRound();
      }
    } else if (this.phase === "score") {
      if (this.phaseT > 3.2) {
        if (this.round + 1 < ROUNDS) this.setupRound(this.round + 1);
        else {
          this.phase = "done";
          this.finishByScore(this.g.map((G) => G.pts));
        }
      }
    }
    this.g.forEach((_, i) => this.placeGolfer(i, dt));
  }

  private shoot(i: number) {
    const G = this.g[i];
    const sp = VMIN + (VMAX - VMIN) * G.meter;
    G.b.vx = Math.sin(G.aim) * sp;
    G.b.vz = -Math.cos(G.aim) * sp;
    G.b.moving = true;
    G.state = "shot";
    G.arrow.visible = false;
    G.label.style.visibility = "hidden";
    this.avatars[i].anim = "hit";
    this.sound("swing");
    setTimeout(() => this.sound("click"), 60);
    this.fx.burst({ x: G.b.x, y: 0.1, z: G.b.z }, { count: 6, colors: ["#bff0a0", "#ffffff"], speed: 2, up: 1.5, gravity: 8, size: 0.08, life: 0.4, shape: "ball" });
    this.buzz(i, 30);
  }

  private physics(dt: number) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let s = 0; s < n; s++) {
      this.bladeT += h;
      const block = bladesBlockAt(this.bladeT);
      for (let i = 0; i < this.g.length; i++) {
        const G = this.g[i];
        const b = G.b;
        if (b.inHole) continue;
        if (!b.moving) continue;
        if (rollStep(b, h, this.holeX, this.holeZ)) {
          this.sink(i);
          continue;
        }
        const vBefore = Math.hypot(b.vx, b.vz);
        const hit = collideStatic(b, block, (k) => {
          this.bumpPulse[k] = 1;
          this.sound("boing");
          this.fx.burst({ x: b.x, y: 0.4, z: b.z }, { count: 6, colors: ["#ffffff", "#ff7a7a"], speed: 3, size: 0.09, life: 0.35, shape: "ball" });
        });
        if (hit && vBefore > 2) this.sound("bonk");
      }
      // ball against ball
      for (let i = 0; i < this.g.length; i++)
        for (let j = i + 1; j < this.g.length; j++) {
          const A = this.g[i].b,
            B = this.g[j].b;
          if (A.inHole || B.inHole) continue;
          const dx = B.x - A.x,
            dz = B.z - A.z;
          const d = Math.hypot(dx, dz);
          if (d < 2 * BR && d > 1e-6) {
            const nx = dx / d,
              nz = dz / d;
            const push = (2 * BR - d) / 2;
            A.x -= nx * push;
            A.z -= nz * push;
            B.x += nx * push;
            B.z += nz * push;
            const rel = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz;
            if (rel > 0) {
              const k = rel * 0.96;
              A.vx -= k * nx;
              A.vz -= k * nz;
              B.vx += k * nx;
              B.vz += k * nz;
              A.moving = B.moving = true;
              if (rel > 1) {
                this.sound("click");
                this.fx.burst({ x: (A.x + B.x) / 2, y: 0.3, z: (A.z + B.z) / 2 }, { count: 5, colors: ["#ffffff"], speed: 2.5, size: 0.07, life: 0.3, shape: "ball" });
              }
            }
          }
        }
    }
  }

  private sink(i: number) {
    const G = this.g[i];
    G.b.inHole = true;
    G.b.moving = false;
    G.b.vx = G.b.vz = 0;
    G.b.sink = 0;
    const at = new THREE.Vector3(this.holeX, 0.5, this.holeZ);
    this.fx.confetti(at, 50);
    this.fx.ring(new THREE.Vector3(this.holeX, 0.05, this.holeZ), this.players[i].char.color, 2.2, 0.5);
    this.hud.pop(at.clone().setY(1.6), T("In the hole!", "进洞！"), "#ffe14a", this.camera);
    this.sound("star");
    this.shake = 0.15;
    this.buzz(i, [60, 40, 90]);
    this.avatars[i].anim = "win";
  }

  private scoreRound() {
    this.phase = "score";
    this.phaseT = 0;
    const d = this.g.map((G) => (G.b.inHole ? -1 : Math.hypot(G.b.x - this.holeX, G.b.z - this.holeZ)));
    const order = this.g.map((_, i) => i).sort((a, b) => d[a] - d[b]);
    const table = [3, 2, 1, 0];
    const got = this.g.map(() => 0);
    order.forEach((i, k) => {
      // ties share the better score
      const same = order.findIndex((j) => Math.abs(d[j] - d[i]) < 1e-3);
      got[i] = this.g[i].b.inHole ? 5 : table[Math.min(same, k)] ?? 0;
    });
    this.g.forEach((G, i) => {
      G.pts += got[i];
      const col = got[i] >= 5 ? "#ffe14a" : got[i] > 0 ? "#ffffff" : "#c8c8d8";
      G.roundLabel = this.hud.label(this.avatars[i].root, `+${got[i]}`, { dy: 2.0, cls: "gf-pts" });
      G.roundLabel.style.color = col;
      this.hud.setScore(this.players[i].seat, `⛳ ${G.pts}`);
      const a = this.avatars[i];
      if (!G.b.inHole) a.anim = got[i] >= 2 ? "win" : got[i] === 0 ? "lose" : "idle";
      if (got[i] > 0) this.buzz(i, 40);
    });
    this.sound("coins");
    // a dotted line from the hole to the closest ball
    const best = order[0];
    if (!this.g[best].b.inHole) this.fx.ring(new THREE.Vector3(this.g[best].b.x, 0.05, this.g[best].b.z), this.players[best].char.color, 1.2, 0.6);
    this.hud.banner(this.round + 1 < ROUNDS ? T(`Hole ${this.round + 1} done`, `第 ${this.round + 1} 洞结束`) : T("Last hole done!", "最后一洞结束！"), { color: "#ffd23f", size: 5, ms: 1400 });
  }

  private placeGolfer(i: number, dt: number) {
    const G = this.g[i];
    const b = G.b;
    const a = this.avatars[i];
    if (b.inHole) {
      b.sink += dt;
      const k = clamp(b.sink / 0.35, 0, 1);
      G.mesh.position.set(this.holeX + (b.x - this.holeX) * (1 - k), BR - k * 0.6, this.holeZ + (b.z - this.holeZ) * (1 - k));
      G.mesh.scale.setScalar(BR * (1 - k * 0.5));
      if (k >= 1) G.mesh.visible = false;
    } else {
      G.mesh.position.set(b.x, BR, b.z);
      G.mesh.rotation.x -= (b.vz * dt) / BR;
      G.mesh.rotation.z += (b.vx * dt) / BR;
    }
    G.pin.visible = !b.inHole;
    G.pin.position.set(b.x, 0.95 + Math.sin(this.t * 4 + i) * 0.08, b.z);
    G.pin.rotation.y += dt * 2;
    // the arrow: around the ball, longer as the gauge fills
    G.arrow.position.set(b.x, 0, b.z);
    G.arrow.rotation.y = -G.aim;
    const len = G.state === "charge" ? 1.1 + G.meter * 2.6 : 1.5;
    G.arrowBody.scale.set(G.state === "charge" ? 1.2 : 1, len, 1);
    G.arrowBody.position.z = 0;
    // the golfer stands beside the tee, faces along the aim, swings the putter
    if (G.state !== "shot") {
      // stand on the left of the ball, side-on to the aim, the ball in front
      const tx = TEES[G.tee % TEES.length];
      a.pos.set(tx - 0.62 * Math.cos(G.aim), 0, TEE_Z - 0.62 * Math.sin(G.aim));
      a.yaw = Math.PI / 2 - G.aim;
    }
    // the putter swings along the aim (the golfer's local x): back while the gauge fills, through on the shot
    const back = G.state === "charge" ? -0.25 - G.meter * 0.95 : G.state === "shot" && this.phase !== "score" ? 0.8 : 0;
    G.club.rotation.z = damp(G.club.rotation.z, back, G.state === "shot" ? 18 : 8, dt);
    if (G.state !== "shot" && a.anim !== "win" && a.anim !== "lose") a.anim = "hold";
  }

  /** `advance`: the blades turn here (during play the physics turns them, in sync with the balls). */
  private animDecor(dt: number, advance = true) {
    if (advance) this.bladeT += dt;
    this.blades.rotation.z = -this.bladeT * BLADE_W;
    // waving flag
    const pos = this.flag.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k) + 0.45;
      pos.setZ(k, Math.sin(this.t * 6 - x * 4) * 0.08 * x);
    }
    pos.needsUpdate = true;
    this.bumpers.forEach((b, k) => {
      this.bumpPulse[k] = damp(this.bumpPulse[k], 0, 8, dt);
      const s = 1 + this.bumpPulse[k] * 0.35 * easeOutBack(1 - this.bumpPulse[k]);
      b.scale.set(s, 1 + this.bumpPulse[k] * 0.2, s);
    });
  }

  protected outroStep(dt: number) {
    this.animDecor(dt);
  }

  dispose() {
    super.dispose();
    this.arrowGeo.dispose();
  }
}

const def: MiniDef = {
  id: "golf",
  name: "One-Shot Golf",
  icon: "⛳",
  color: "#5fd35a",
  tagline: "One shot: get closest to the hole.",
  rules: "Three holes, one shot each, all at once! Aim with the stick, A starts the gauge, A shoots. Closest scores 3, 2, 1; in the hole, 5!",
  controls: { stick: "Aim", a: "Gauge, then shoot" },
  modes: ["ffa"],
  length: 45,
  music: "shop",
  create: (ctx) => new Golf(ctx),
};
export default def;
