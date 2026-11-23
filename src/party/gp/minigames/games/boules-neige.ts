/**
 * BATAILLE DE NEIGE (chacun pour soi, 45 s): a snowy village square with low snow walls for cover.
 * A throws a snowball forward (a short arc, with a little aim assist). Three balls, then B to scoop
 * snow (0.6 s, crouched) and reload. A hit gives the thrower 1 point and stuns the target 0.8 s.
 * Most hits wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { GEO, ball, blobShadow, box, canvasTex, coinMesh, cone, cyl, flat, group, pine, toon } from "../../engine/gfx";
import { angDiff, clamp, dist2 } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 45;
const HX = 10; // half width of the square
const HZ = 6.4; // half depth
const PR = 0.42;
const SPEED = 5.6;
const AMMO = 3;
const SCOOP_T = 0.6;
const STUN = 0.8;
const SAFE = 0.5; // immunity after a stun
const THROW_CD = 0.3;
const BALL_V = 15;
const BALL_G = 7;
const BALL_R = 0.24;
const HAND_Y = 1.25;
const WALL_H = 1.05;
const ASSIST = 0.5; // radians either side

interface Wall {
  x: number;
  z: number;
  hw: number;
  hd: number;
}
interface Fighter {
  x: number;
  z: number;
  vx: number;
  vz: number;
  ammo: number;
  hits: number;
  stun: number;
  safe: number;
  scoop: number;
  cd: number;
  label: HTMLElement;
}
interface Snowball {
  m: THREE.Mesh;
  sh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: number;
  dead: boolean;
  /** CPUs decide once per ball whether they saw it coming. */
  seen: boolean[];
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

class BoulesNeige extends BaseMini {
  private f: Fighter[] = [];
  private balls: Snowball[] = [];
  private walls: Wall[] = [];
  private flakes!: THREE.InstancedMesh;
  private flakeP: { x: number; y: number; z: number; s: number; ph: number }[] = [];
  private hurry = false;
  private m4 = new THREE.Matrix4();
  baked: THREE.InstancedMesh[] = [];
  private dodge: { t: number; x: number; z: number }[] = [];
  private topper!: THREE.Group;
  private nextThrow: number[] = [];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#8fc4ee", "#eef6ff"], size: 14, sun: [0.4, 1, 0.6], sunColor: "#fff0da", sunIntensity: 2.1, hemi: ["#ffffff", "#8aa0c4", 1.1], fog: { color: "#dceaf8", near: 35, far: 85 } });
    this.buildVillage();
    const starts = [
      [-8, -4.6],
      [8, -4.6],
      [-8, 4.8],
      [8, 4.8],
    ];
    this.players.forEach((p, i) => {
      const [x, z] = starts[i];
      const a = this.spawn(i, x, z, Math.atan2(-x, -z));
      a.setRing(p.char.color);
      const label = this.hud.label(a.root, this.ammoHtml(AMMO), { dy: 2.05, color: p.char.color });
      this.f.push({ x, z, vx: 0, vz: 0, ammo: AMMO, hits: 0, stun: 0, safe: 0, scoop: 0, cd: 0, label });
      this.dodge.push({ t: 0, x: 0, z: 0 });
      this.nextThrow.push(0);
    });
    this.hud.players(this.players, () => this.cardHtml(0));
    this.hud.timer(TIME);
    this.setCam([0, 30, 26], [0, 0, 0.6], 44);
  }

  private ammoHtml(n: number) {
    let s = "";
    for (let k = 0; k < AMMO; k++) s += `<span style="display:inline-block;width:0.8em;height:0.8em;margin:0 0.08em;border-radius:50%;vertical-align:-0.05em;${k < n ? "background:#fff;box-shadow:inset -0.12em -0.12em 0 #b8d4f0" : "border:0.12em solid rgba(255,255,255,0.6);box-sizing:border-box"}"></span>`;
    return n === 0 ? `<span style="font-size:0.85em">${T("B: reload", "B：装雪")}</span>` : s;
  }
  private cardHtml(hits: number) {
    return `${hits} <span style="font-size:0.5em;opacity:0.85">${T(hits === 1 ? "hit" : "hits", "命中")}</span>`;
  }

  // ------------------------------------------------------------ the village

  private buildVillage() {
    // everything static is built in a group, then baked into instanced meshes
    const s = new THREE.Group();
    const snowTex = canvasTex(
      512,
      512,
      (g, w) => {
        g.fillStyle = "#f4f8ff";
        g.fillRect(0, 0, w, w);
        for (let k = 0; k < 500; k++) {
          const x = (k * 7919) % w,
            y = (k * 6271) % w;
          g.fillStyle = k % 2 ? "rgba(170,200,235,0.25)" : "rgba(255,255,255,0.9)";
          g.beginPath();
          g.arc(x, y, 3 + (k % 7), 0, Math.PI * 2);
          g.fill();
        }
      },
      true,
    );
    snowTex.repeat.set(6, 6);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshToonMaterial({ map: snowTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    // the square: slightly bluer packed snow with a cobbled rim peeking out
    // cobbles dusted with snow
    const cob = canvasTex(
      512,
      512,
      (g, w) => {
        g.fillStyle = "#7a6e66";
        g.fillRect(0, 0, w, w);
        const n = 6;
        const c = w / n;
        for (let y = 0; y < n; y++)
          for (let x = 0; x < n + 1; x++) {
            const ox = (y % 2) * c * 0.5;
            const k = (x * 7 + y * 13) % 5;
            g.fillStyle = ["#b9ab9a", "#c8bba8", "#a89a8a", "#c2b4a2", "#b0a290"][k];
            g.beginPath();
            g.roundRect(x * c - ox + 4, y * c + 4, c - 8, c - 8, 12);
            g.fill();
          }
        // soft drifts of snow on the stones
        for (let k = 0; k < 9; k++) {
          const x = (k * 7919) % w,
            y = (k * 3571) % w,
            r = 40 + (k % 4) * 18;
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, "rgba(255,255,255,0.95)");
          gr.addColorStop(0.6, "rgba(255,255,255,0.7)");
          gr.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = gr;
          g.fillRect(x - r, y - r, r * 2, r * 2);
        }
      },
      true,
    );
    cob.repeat.set(4, 2.6);
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 + 1.2, HZ * 2 + 1.2), new THREE.MeshToonMaterial({ map: cob }));
    sq.rotation.x = -Math.PI / 2;
    sq.position.y = 0.02;
    sq.receiveShadow = true;
    s.add(sq);
    for (let k = 0; k < 2; k++) {
      const z = (k ? 1 : -1) * (HZ + 0.9);
      for (let x = -HX - 0.6; x <= HX + 0.6; x += 1.4) ball(s, "#ffffff", [0.8, 0.45, 0.6], { x, y: 0.1, z, lo: true });
    }
    for (let k = 0; k < 2; k++) {
      const x = (k ? 1 : -1) * (HX + 0.9);
      for (let z = -HZ; z <= HZ; z += 1.4) ball(s, "#ffffff", [0.6, 0.45, 0.8], { x, y: 0.1, z, lo: true });
    }
    // low snow walls (cover)
    const layout: [number, number, number, number][] = [
      [0, 0, 0.45, 1.5],
      [-5, -2.6, 1.6, 0.42],
      [5, -2.6, 1.6, 0.42],
      [-5, 3, 1.6, 0.42],
      [5, 3, 1.6, 0.42],
      [-8.4, 0.2, 0.42, 1.1],
      [8.4, 0.2, 0.42, 1.1],
      [0, -5, 1.1, 0.42],
      [0, 5.3, 1.1, 0.42],
    ];
    for (const [x, z, hw, hd] of layout) {
      this.walls.push({ x, z, hw, hd });
      const g = group(s, { x, z });
      box(g, "#e4eefc", hw * 2, WALL_H * 0.85, hd * 2, { y: (WALL_H * 0.85) / 2 });
      const along = hw > hd;
      const len = along ? hw * 2 : hd * 2;
      const n = Math.max(2, Math.round(len / 0.7));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5;
        ball(g, "#ffffff", [along ? 0.48 : hw * 1.15, 0.3, along ? hd * 1.15 : 0.48], { x: along ? t * len : 0, y: WALL_H * 0.85, z: along ? 0 : t * len, lo: true });
      }
      // a few snowball "bricks"
      for (let k = 0; k < 3; k++) ball(g, "#dbe9fa", 0.14, { x: along ? (k - 1) * 0.6 : hw + 0.05, y: 0.35 + (k % 2) * 0.25, z: along ? hd + 0.05 : (k - 1) * 0.6, lo: true, cast: false });
    }
    // chalets all around
    const roofGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1);
    const houseCols = ["#c8553d", "#e8b04a", "#6a8fc8", "#9a6ab0", "#5aa070", "#d87a5a"];
    const house = (x: number, z: number, ry: number, k: number) => {
      const g = group(s, { x, z, ry });
      const w = 4.2,
        h = 3 + (k % 3) * 0.6,
        d = 3.4;
      box(g, houseCols[k % houseCols.length], w, h, d, { y: h / 2 });
      box(g, "#7a4a2a", w + 0.1, 0.3, d + 0.1, { y: 0.15 });
      // roof: a triangular prism + snow layer
      const roof = new THREE.Mesh(roofGeo, toon("#6a3a2a"));
      roof.rotation.set(0, 0, Math.PI / 2);
      roof.rotation.order = "YXZ";
      roof.scale.set(1.75, w + 0.6, 1.75);
      roof.position.y = h + 0.8;
      roof.castShadow = true;
      g.add(roof);
      const snowRoof = new THREE.Mesh(roofGeo, toon("#ffffff"));
      snowRoof.rotation.copy(roof.rotation);
      snowRoof.rotation.order = "YXZ";
      snowRoof.scale.set(1.6, w + 0.7, 1.6);
      snowRoof.position.y = h + 1.0;
      g.add(snowRoof);
      // lit windows + door
      for (const wx of [-1.1, 1.1]) {
        box(g, toon("#ffe08a", "#ffb020", 0.8), 0.8, 0.8, 0.08, { x: wx, y: h * 0.55, z: d / 2 + 0.02, cast: false });
        box(g, "#ffffff", 0.95, 0.12, 0.2, { x: wx, y: h * 0.55 - 0.48, z: d / 2 + 0.06, cast: false });
      }
      box(g, "#5a3420", 0.8, 1.5, 0.08, { x: 0, y: 0.75, z: d / 2 + 0.02, cast: false });
      box(g, "#8a8a9a", 0.5, 1.2, 0.5, { x: w * 0.3, y: h + 1.6, z: -0.3 });
      ball(g, "#ffffff", [0.32, 0.12, 0.32], { x: w * 0.3, y: h + 2.25, z: -0.3, lo: true });
    };
    let k = 0;
    for (let x = -14; x <= 14; x += 4.8) house(x, -12.5, 0, k++);
    for (let x = -13; x <= 13; x += 6.5) house(x, 13.5, Math.PI, k++);
    for (const z of [-4, 4]) {
      house(-16, z, Math.PI / 2, k++);
      house(16, z, -Math.PI / 2, k++);
    }
    // snowy pines and lamp posts
    const snowyPine = (x: number, z: number, sc: number) => {
      const g = pine(s, x, z, sc, "#2f7d5b");
      cone(g, "#ffffff", 0.5 * sc, 0.35 * sc, { y: 1.95 * sc, lo: true });
      cone(g, "#ffffff", 0.72 * sc, 0.3 * sc, { y: 1.45 * sc, lo: true });
      return g;
    };
    for (const [x, z, sc] of [
      [-12, -8.5, 1.4],
      [12, -8.5, 1.5],
      [-12.5, 8.8, 1.3],
      [12.5, 9, 1.4],
      [-14.5, 0, 1.2],
      [14.5, 0.5, 1.3],
      [-6, -9.5, 1.1],
      [6.5, -9.8, 1.2],
    ] as [number, number, number][])
      snowyPine(x, z, sc);
    // the big decorated tree at the back
    const big = snowyPine(0, -9.6, 2.4);
    const orn = ["#ff4b3e", "#ffd23f", "#2f8dff", "#ff7ad9"];
    for (let j = 0; j < 14; j++) {
      const a = j * 2.3;
      const y = 1.1 + (j % 5) * 0.75;
      const r = (1 - (y - 0.8) / 5.5) * 1.75;
      ball(big, toon(orn[j % 4], orn[j % 4], 0.35), 0.13, { x: Math.cos(a) * r, y, z: Math.sin(a) * r + 0.2, lo: true, cast: false });
    }
    for (const [x, z] of [
      [-HX - 1.6, -HZ - 1.6],
      [HX + 1.6, -HZ - 1.6],
      [-HX - 1.6, HZ + 1.6],
      [HX + 1.6, HZ + 1.6],
    ]) {
      const g = group(s, { x, z });
      cyl(g, "#2d3a4a", 0.08, 3.2, { y: 1.6, seg: 8 });
      ball(g, toon("#fff3b0", "#ffcc33", 0.9), 0.26, { y: 3.35 });
      cone(g, "#2d3a4a", 0.3, 0.28, { y: 3.65, lo: true });
      ball(g, "#ffffff", [0.3, 0.1, 0.3], { y: 3.8, lo: true });
    }
    // a snowman watching (decor, outside the square)
    const sm = group(s, { x: -HX - 2.3, z: 2.6, ry: 0.9 });
    ball(sm, "#ffffff", 0.7, { y: 0.6 });
    ball(sm, "#ffffff", 0.5, { y: 1.5 });
    ball(sm, "#ffffff", 0.36, { y: 2.2 });
    cone(sm, "#ff8a2e", 0.07, 0.35, { y: 2.2, z: 0.45, rx: Math.PI / 2, lo: true });
    for (const sx of [-0.12, 0.12]) ball(sm, "#1d1630", 0.05, { x: sx, y: 2.32, z: 0.3, lo: true });
    cyl(sm, "#2a2438", 0.3, 0.35, { y: 2.6, seg: 12 });
    cyl(sm, "#2a2438", 0.42, 0.05, { y: 2.45, seg: 12 });
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.08, 6, 16), toon("#e8323c"));
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.9;
    sm.add(scarf);
    // string lights across the square
    const bulbs = ["#ff4b3e", "#ffd23f", "#3fcf5a", "#2f8dff"];
    for (const z of [-HZ - 1.6, HZ + 1.6]) {
      for (let j = 0; j <= 20; j++) {
        const t = j / 20;
        const x = -HX - 1.6 + t * (HX * 2 + 3.2);
        ball(s, flat(bulbs[j % 4]), 0.09, { x, y: 3.1 - Math.sin(t * Math.PI) * 0.6, z, lo: true, cast: false });
      }
    }
    this.baked = bake(s, this.scene);
    // a ⓩ coin on top of the big tree (kept out of the bake: it turns)
    this.topper = coinMesh(0.5);
    this.topper.position.set(0, 5.75, -9.6);
    this.scene.add(this.topper);
    // falling snow
    const n = 160;
    this.flakes = new THREE.InstancedMesh(GEO.sphereLo, flat("#ffffff", 0.85), n);
    this.flakes.frustumCulled = false;
    for (let j = 0; j < n; j++) this.flakeP.push({ x: (this.rnd() - 0.5) * 34, y: this.rnd() * 14, z: (this.rnd() - 0.5) * 26, s: 0.04 + this.rnd() * 0.05, ph: this.rnd() * 6 });
    this.scene.add(this.flakes);
  }

  // ------------------------------------------------------------ helpers

  private blockedAt(x: number, z: number, r: number): Wall | null {
    for (const w of this.walls) if (Math.abs(x - w.x) < w.hw + r && Math.abs(z - w.z) < w.hd + r) return w;
    return null;
  }
  /** Does a wall stand between the two points (2D, near the second one)? */
  private losBlocked(ax: number, az: number, bx: number, bz: number) {
    const n = 12;
    for (let k = 3; k < n; k++) {
      const t = k / n;
      if (this.blockedAt(ax + (bx - ax) * t, az + (bz - az) * t, 0.05)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number): CpuPad {
    const me = this.f[i];
    const lv = this.players[i].level;
    if (me.stun > 0 || me.scoop > 0) return {};
    const a = this.avatars[i];
    // dodge a ball coming at me
    const dg = this.dodge[i];
    if (dg.t > this.t) return { x: dg.x, y: dg.z };
    for (const b of this.balls) {
      if (b.dead || b.owner === i || b.seen[i]) continue;
      const rx = me.x - b.x,
        rz = me.z - b.z;
      const v2 = b.vx * b.vx + b.vz * b.vz;
      const tca = (rx * b.vx + rz * b.vz) / v2;
      if (tca < 0 || tca > 0.7) continue;
      const mx = b.x + b.vx * tca - me.x,
        mz = b.z + b.vz * tca - me.z;
      if (Math.hypot(mx, mz) > 0.9) continue;
      b.seen[i] = true;
      if (Math.random() < 0.1 + 0.55 * lv) {
        const vl = Math.sqrt(v2);
        let px = -b.vz / vl,
          pz = b.vx / vl;
        if (px * mx + pz * mz > 0) {
          px = -px;
          pz = -pz;
        }
        dg.t = this.t + 0.35;
        dg.x = px;
        dg.z = pz;
        return { x: px, y: pz };
      }
    }
    // out of snow: get behind a wall (if one is close) and scoop
    if (me.ammo === 0) {
      let best: Wall | null = null,
        bd = 3.5;
      for (const w of this.walls) {
        const d = dist2(me.x, me.z, w.x, w.z);
        if (d < bd) {
          bd = d;
          best = w;
        }
      }
      const foe = this.nearestFoe(i, false);
      if (best && foe >= 0 && lv > 0.35) {
        const o = this.f[foe];
        // the spot on the far side of the wall from the foe
        const dx = best.x - o.x,
          dz = best.z - o.z;
        const l = Math.hypot(dx, dz) || 1;
        const sx = best.x + (dx / l) * (Math.max(best.hw, best.hd) * 0.5 + 0.9),
          sz = best.z + (dz / l) * (Math.max(best.hw, best.hd) * 0.5 + 0.9);
        if (dist2(me.x, me.z, sx, sz) > 0.6 && !this.cpuAfter(i, "hide", 1.2)) return this.goto(me, sx, sz);
      }
      this.cpuReset(i, "hide");
      return { b: true };
    }
    this.cpuReset(i, "hide");
    // top up when it's calm
    const foeAny = this.nearestFoe(i, false);
    if (me.ammo < AMMO && foeAny >= 0 && dist2(me.x, me.z, this.f[foeAny].x, this.f[foeAny].z) > 8 && Math.random() < 0.02 * lv) return { b: true };
    const tg = this.nearestFoe(i, true);
    if (tg < 0) return { x: -me.x * 0.1, y: -me.z * 0.1 };
    const o = this.f[tg];
    const dx = o.x - me.x,
      dz = o.z - me.z;
    const d = Math.hypot(dx, dz) || 1;
    // keep a good distance, strafe around
    const want = 5.5 + (i % 2) * 1.2;
    const radial = clamp((d - want) * 0.6, -1, 1);
    const side = Math.sin(this.t * (0.7 + 0.2 * i) + i * 2) > 0 ? 1 : -1;
    let mx = (dx / d) * radial + (-dz / d) * side * 0.7,
      mz = (dz / d) * radial + (dx / d) * side * 0.7;
    // stay inside the square
    if (Math.abs(me.x) > HX - 1.5) mx -= Math.sign(me.x) * 0.8;
    if (Math.abs(me.z) > HZ - 1.2) mz -= Math.sign(me.z) * 0.8;
    // throw when the time comes and the line is clear
    const blocked = this.losBlocked(me.x, me.z, o.x, o.z);
    if (this.t >= this.nextThrow[i] && d < 11 && me.cd <= 0 && (!blocked || Math.random() < 0.3 * (1 - lv))) {
      const aim = Math.atan2(dx, dz) + (Math.random() - 0.5) * (1 - lv) * 0.5;
      // turn toward it first (a.face is fast), then let go
      if (Math.abs(angDiff(a.yaw, aim)) < 0.35 || lv < 0.3) {
        this.nextThrow[i] = this.t + 0.35 + (1 - lv) * 0.9 + Math.random() * 0.5;
        return { x: Math.sin(aim), y: Math.cos(aim), a: true };
      }
      return { x: Math.sin(aim) * 0.3, y: Math.cos(aim) * 0.3 };
    }
    // when blocked, slide sideways to get a clear line
    if (blocked) {
      mx += (-dz / d) * side * 0.8;
      mz += (dx / d) * side * 0.8;
    }
    const wob = (1 - lv) * 0.4;
    return { x: mx + Math.sin(this.t * 2.6 + i) * wob, y: mz + Math.cos(this.t * 2.1 + i) * wob };
  }

  private nearestFoe(i: number, hittable: boolean) {
    const me = this.f[i];
    let best = -1,
      bd = 1e9;
    this.f.forEach((o, j) => {
      if (j === i) return;
      let d = dist2(me.x, me.z, o.x, o.z);
      if (hittable && (o.stun > 0 || o.safe > 0)) d += 8;
      if (d < bd) {
        bd = d;
        best = j;
      }
    });
    return best;
  }

  private goto(me: Fighter, x: number, z: number): CpuPad {
    const dx = x - me.x,
      dz = z - me.z;
    const d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, y: dz / d };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.moveCam([0, 13.4, 11.2], [0, 0, 0.6], dt, 1.6);
    this.snow(dt);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.moveCam([0, 13.4, 11.2], [0, 0, 0.6], dt, 3);
    this.snow(dt);
    if (!this.hurry && left <= 10) {
      this.hurry = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ffffff" });
      this.sound("bell");
      music.speed(1.18);
    }
    this.f.forEach((r, i) => this.movePlayer(r, i, dt));
    this.collide();
    this.updateBalls(dt);
    if (left <= 0) this.finishByScore(this.f.map((r) => r.hits));
  }

  protected celebrate(res: MiniResult) {
    super.celebrate(res);
    for (const r of this.f) this.hud.removeLabel(r.label);
    this.f.forEach((r, i) => {
      if (res.place[i] === 1) this.fx.confetti({ x: r.x, y: 3, z: r.z }, 50);
    });
  }

  protected outroStep(dt: number) {
    this.snow(dt);
    this.updateBalls(dt);
  }

  private snow(dt: number) {
    const now = performance.now() / 1000;
    this.topper.rotation.y = now * 1.2;
    this.flakeP.forEach((p, k) => {
      p.y -= dt * (0.9 + p.s * 8);
      if (p.y < 0) p.y += 14;
      this.m4.makeScale(p.s, p.s, p.s);
      this.m4.setPosition(p.x + Math.sin(now * 0.8 + p.ph) * 0.6, p.y, p.z);
      this.flakes.setMatrixAt(k, this.m4);
    });
    this.flakes.instanceMatrix.needsUpdate = true;
  }

  private movePlayer(r: Fighter, i: number, dt: number) {
    const a = this.avatars[i];
    const p = this.pad(i);
    r.cd -= dt;
    r.safe -= dt;
    let tx = 0,
      tz = 0;
    if (r.stun > 0) {
      r.stun -= dt;
      a.anim = "stun";
      if (r.stun <= 0) r.safe = SAFE;
    } else if (r.scoop > 0) {
      r.scoop -= dt;
      a.anim = "lose";
      if (Math.random() < 0.5) this.fx.burst({ x: r.x + Math.sin(a.yaw) * 0.45, y: 0.3, z: r.z + Math.cos(a.yaw) * 0.45 }, { count: 2, colors: ["#ffffff", "#dbe9fa"], speed: 1.5, up: 2.5, gravity: 9, size: 0.12, life: 0.4 });
      if (r.scoop <= 0) {
        r.ammo = AMMO;
        r.label.innerHTML = this.ammoHtml(r.ammo);
        this.sound("pop");
        this.fx.sparkle({ x: r.x, y: 1.2, z: r.z }, "#ffffff", 8);
      }
    } else {
      tx = p.x * SPEED;
      tz = p.y * SPEED;
      const l = Math.hypot(p.x, p.y);
      if (p.bDown && r.ammo < AMMO) {
        r.scoop = SCOOP_T;
        tx = tz = 0;
        this.sound("squeak");
      } else if (p.aDown) {
        if (r.ammo > 0 && r.cd <= 0) this.throwBall(i, l > 0.25 ? Math.atan2(p.x, p.y) : a.yaw);
        else if (r.ammo === 0) {
          this.sound("click");
          this.hud.pop(new THREE.Vector3(r.x, 2.4, r.z), T("No snow!", "没雪了！"), "#ffffff", this.camera);
        }
      }
      const sp = Math.hypot(r.vx, r.vz);
      if (r.cd > THROW_CD - 0.22) a.anim = "throw";
      else a.anim = sp > 0.5 ? "run" : "idle";
      a.speed = clamp(sp / SPEED, 0, 1);
    }
    const k = 1 - Math.exp(-12 * dt);
    r.vx += (tx - r.vx) * k;
    r.vz += (tz - r.vz) * k;
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    r.x = clamp(r.x, -HX + PR, HX - PR);
    r.z = clamp(r.z, -HZ + PR, HZ - PR);
    // walls
    for (const w of this.walls) {
      const ox = w.hw + PR - Math.abs(r.x - w.x),
        oz = w.hd + PR - Math.abs(r.z - w.z);
      if (ox > 0 && oz > 0) {
        if (ox < oz) r.x += Math.sign(r.x - w.x || 1) * ox;
        else r.z += Math.sign(r.z - w.z || 1) * oz;
      }
    }
    if (Math.hypot(r.vx, r.vz) > 0.5 && r.stun <= 0 && r.scoop <= 0 && r.cd < THROW_CD - 0.22) a.face(Math.atan2(r.vx, r.vz), dt);
    a.pos.set(r.x, r.scoop > 0 ? -0.08 : 0, r.z);
  }

  private collide() {
    for (let i = 0; i < this.f.length; i++)
      for (let j = i + 1; j < this.f.length; j++) {
        const A = this.f[i],
          B = this.f[j];
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

  private throwBall(i: number, yaw: number) {
    const r = this.f[i];
    const a = this.avatars[i];
    // aim assist: the nearest rival within the cone gets the ball (with a little lead)
    let best = -1,
      bs = 1e9;
    this.f.forEach((o, j) => {
      if (j === i) return;
      const dx = o.x - r.x,
        dz = o.z - r.z;
      const d = Math.hypot(dx, dz);
      if (d > 14 || d < 0.3) return;
      const off = Math.abs(angDiff(yaw, Math.atan2(dx, dz)));
      if (off > ASSIST) return;
      const sc = d + off * 6 + (o.stun > 0 ? 6 : 0);
      if (sc < bs) {
        bs = sc;
        best = j;
      }
    });
    let dist = 9;
    if (best >= 0) {
      const o = this.f[best];
      const d0 = dist2(r.x, r.z, o.x, o.z);
      const T = d0 / BALL_V;
      const lx = o.x + o.vx * T * 0.55,
        lz = o.z + o.vz * T * 0.55;
      yaw = Math.atan2(lx - r.x, lz - r.z);
      dist = dist2(r.x, r.z, lx, lz);
    }
    a.yaw = yaw;
    const T = Math.max(0.12, dist / BALL_V);
    const targetY = 0.85;
    const vy = (targetY - HAND_Y + 0.5 * BALL_G * T * T) / T;
    const sx = r.x + Math.sin(yaw) * 0.45,
      sz = r.z + Math.cos(yaw) * 0.45;
    const m = new THREE.Mesh(GEO.sphereLo, toon("#ffffff", "#c8dcff", 0.25));
    m.scale.setScalar(BALL_R);
    m.castShadow = true;
    const sh = blobShadow(0.22, 0.3);
    this.scene.add(m, sh);
    this.balls.push({ m, sh, x: sx, y: HAND_Y, z: sz, vx: Math.sin(yaw) * BALL_V, vy: clamp(vy, -2, 6), vz: Math.cos(yaw) * BALL_V, owner: i, dead: false, seen: this.players.map(() => false) });
    r.ammo--;
    r.cd = THROW_CD;
    r.label.innerHTML = this.ammoHtml(r.ammo);
    this.sound("swing");
    a.anim = "throw";
  }

  private updateBalls(dt: number) {
    for (const b of this.balls) {
      if (b.dead) continue;
      b.vy -= BALL_G * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.m.position.set(b.x, b.y, b.z);
      b.sh.position.set(b.x, 0.03, b.z);
      // players
      if (!this.finished) {
        for (let j = 0; j < this.f.length; j++) {
          if (j === b.owner) continue;
          const o = this.f[j];
          const top = o.scoop > 0 ? 0.95 : 1.55;
          if (b.y < top && b.y > -0.1 && dist2(b.x, b.z, o.x, o.z) < PR + BALL_R) {
            if (o.stun > 0 || o.safe > 0) {
              this.splat(b, "#ffffff");
              this.sound("pop");
            } else this.hit(b, j);
            break;
          }
        }
      }
      if (b.dead) continue;
      if (b.y < WALL_H && this.blockedAt(b.x, b.z, BALL_R * 0.6)) {
        this.splat(b, "#ffffff");
        this.sound("land");
        continue;
      }
      if (b.y <= 0.05 || Math.abs(b.x) > 30 || Math.abs(b.z) > 30) {
        this.splat(b, "#eef5ff");
        continue;
      }
    }
    this.balls = this.balls.filter((b) => !b.dead);
  }

  private hit(b: Snowball, j: number) {
    const o = this.f[j];
    const thr = this.f[b.owner];
    thr.hits++;
    o.stun = STUN;
    o.scoop = 0;
    o.vx = b.vx * 0.15;
    o.vz = b.vz * 0.15;
    this.avatars[j].flash();
    this.avatars[j].anim = "stun";
    this.fx.burst({ x: b.x, y: b.y, z: b.z }, { count: 22, colors: ["#ffffff", "#e6f2ff", "#cfe4ff"], speed: 5, up: 2, gravity: 10, size: 0.2, life: 0.7, shape: "ball" });
    this.fx.ring({ x: o.x, y: 0.05, z: o.z }, "#ffffff", 1.4, 0.35);
    this.sound("hit");
    this.sound("bonk");
    this.shake = Math.max(this.shake, 0.15);
    this.buzz(j, [60, 30, 60]);
    this.buzz(b.owner, 25);
    this.hud.setScore(this.players[b.owner].seat, this.cardHtml(thr.hits));
    this.hud.pop(new THREE.Vector3(thr.x, 2.6, thr.z), "+1", this.players[b.owner].char.color, this.camera);
    this.kill(b);
  }

  private splat(b: Snowball, color: string) {
    this.fx.burst({ x: b.x, y: Math.max(0.1, b.y), z: b.z }, { count: 10, colors: [color, "#dbe9fa"], speed: 3, up: 1.5, gravity: 10, size: 0.14, life: 0.45, shape: "ball" });
    this.kill(b);
  }

  private kill(b: Snowball) {
    b.dead = true;
    b.m.removeFromParent();
    b.sh.removeFromParent();
    (b.sh.material as THREE.Material).dispose();
  }
}

const def: MiniDef = {
  id: "boules-neige",
  name: "Snowball Fight",
  icon: "⛄",
  color: "#cfefff",
  tagline: "Pelt the others with snowballs.",
  rules: "Throw snowballs at the others: every hit scores 1 point. You have 3 balls, then scoop snow to reload. Hide behind the low walls!",
  controls: { stick: "Run / aim", a: "Throw", b: "Scoop snow" },
  modes: ["ffa"],
  length: 45,
  music: "mini3",
  create: (ctx) => new BoulesNeige(ctx),
};
export default def;
