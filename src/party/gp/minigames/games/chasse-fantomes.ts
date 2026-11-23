/**
 * CHASSE AUX FANTÔMES (chacun pour soi, 45 s): the great hall of a haunted manor at night (candles,
 * fireplace, moonlit window). Everyone carries a lantern whose beam lights the floor in front of
 * them. Ghosts drift around: keep one in your beam ~1 s and it's yours (+1); the big ones need 2 s
 * (+3). The mischievous green ghost chases people and steals a point if it touches you (light it up
 * to catch it). A = a flash burst that grabs the small ghosts in your beam (5 s to recharge). At
 * midnight (10 s left) more ghosts come out. Most points wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, cone, cyl, flat, group } from "../../engine/gfx";
import { angDiff, clamp, dist2, lerp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 45;
const RX = 9.4; // room half-size (where players walk)
const RZ = 5.8;
const PR = 0.42;
const SPEED = 5.4;
const TURN = 9;
const BEAM_LEN = 4.4;
const BEAM_HALF = 0.46;
const FLASH_LEN = 5.4;
const FLASH_HALF = 0.68;
const FLASH_CD = 5;
const PIE_STEPS = 16;

type GKind = "small" | "big" | "imp";
const NEED: Record<GKind, number> = { small: 1, big: 2, imp: 1 };
const VALUE: Record<GKind, number> = { small: 1, big: 3, imp: 1 };
const GR: Record<GKind, number> = { small: 0.62, big: 1.0, imp: 0.55 };

interface Ghost {
  g: THREE.Group;
  body: THREE.Mesh;
  mat: THREE.MeshToonMaterial;
  pie: THREE.Mesh;
  pieMat: THREE.MeshBasicMaterial;
  kind: GKind;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  gx: number;
  gz: number;
  /** Seconds of light per player. */
  exp: number[];
  t: number;
  /** Fading in (0 → 1). */
  appear: number;
  /** Being sucked into a lantern: who and how far. */
  caught: number;
  catchT: number;
  dead: boolean;
  /** imps: can't steal again before this. */
  calm: number;
}

interface Hunter {
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  cd: number;
  score: number;
  beam: THREE.Group;
  pool: THREE.Mesh;
  poolMat: THREE.MeshBasicMaterial;
  coneMat: THREE.MeshBasicMaterial;
  bulb: THREE.Mesh;
  flash: number;
  hurt: number;
}

class ChasseFantomes extends BaseMini {
  private ghosts: Ghost[] = [];
  private hs: Hunter[] = [];
  private nextGhost = 0;
  private midnight = false;
  private ghostGeo: THREE.BufferGeometry;
  private pies: THREE.BufferGeometry[] = [];
  private fire!: THREE.PointLight;
  private flames: THREE.Mesh[] = [];
  private candles: THREE.Mesh[] = [];
  private poolTex: THREE.Texture;
  private coneGeo: THREE.BufferGeometry;
  private poolGeo: THREE.BufferGeometry;
  private cpuT: (Ghost | null)[] = [];
  private clockHand!: THREE.Object3D;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#0b0820", "#1c1540"], night: true, size: 13, sun: [-0.4, 1, 0.5], sunIntensity: 0.75, hemi: ["#7a84d0", "#2a2040", 1.15], fog: null });
    this.ghostGeo = this.makeGhostGeo();
    for (let k = 0; k <= PIE_STEPS; k++) {
      const g = new THREE.RingGeometry(0.22, 0.34, 24, 1, Math.PI / 2, -Math.max(0.001, (k / PIE_STEPS) * Math.PI * 2));
      g.userData = { shared: true };
      this.pies.push(g);
    }
    this.poolTex = canvasTex(256, 256, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.55, "rgba(255,255,255,0.65)");
      gr.addColorStop(0.85, "rgba(255,255,255,0.25)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, w);
    });
    // beam meshes (shared geometry): the floor pool (a sector) and the cone of light
    this.poolGeo = new THREE.CircleGeometry(BEAM_LEN, 28, -Math.PI / 2 - BEAM_HALF, BEAM_HALF * 2);
    this.poolGeo.rotateX(-Math.PI / 2);
    this.coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true);
    this.coneGeo.translate(0, -0.5, 0);
    this.coneGeo.rotateX(-Math.PI / 2);
    this.buildManor();
    const starts = [
      [-6.5, -3.2],
      [6.5, -3.2],
      [-6.5, 3.6],
      [6.5, 3.6],
    ];
    this.players.forEach((p, i) => {
      const [x, z] = starts[i];
      const yaw = Math.atan2(-x, -z * 0.3);
      const a = this.spawn(i, x, z, yaw);
      a.setRing(p.char.color);
      this.hs.push(this.makeHunter(i, x, z, yaw));
      this.cpuT.push(null);
    });
    for (let k = 0; k < 4; k++) this.spawnGhost(k === 3 ? "big" : "small");
    this.hud.players(this.players, () => this.scoreHtml(0));
    this.hud.timer(TIME);
    this.setCam([0, 24, 22], [0, 0, 0], 42);
  }

  private scoreHtml(n: number) {
    return `${n} <span style="font-size:0.6em">👻</span>`;
  }

  // ------------------------------------------------------------ the manor

  private buildManor() {
    const s = this.scene;
    // floor: dark oak planks and a big red rug
    const planks = canvasTex(512, 512, (g, w, h) => {
      for (let y = 0; y < h; y += 42) {
        g.fillStyle = ["#4a2e22", "#553426", "#432a1f"][(y / 42) % 3];
        g.fillRect(0, y, w, 42);
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(0, y, w, 3);
        for (let x = ((y * 7) % 200) + 30; x < w; x += 230) g.fillRect(x, y, 3, 42);
      }
    }, true);
    planks.repeat.set(5, 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), new THREE.MeshToonMaterial({ map: planks }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    const rugTex = canvasTex(512, 320, (g, w, h) => {
      g.fillStyle = "#7a1f2e";
      g.beginPath();
      g.ellipse(w / 2, h / 2, w / 2 - 4, h / 2 - 4, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#d8a23a";
      g.lineWidth = 12;
      g.beginPath();
      g.ellipse(w / 2, h / 2, w / 2 - 26, h / 2 - 26, 0, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 5;
      g.beginPath();
      g.ellipse(w / 2, h / 2, w / 2 - 60, h / 2 - 60, 0, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#a83244";
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.beginPath();
        g.arc(w / 2 + Math.cos(a) * 120, h / 2 + Math.sin(a) * 60, 14, 0, Math.PI * 2);
        g.fill();
      }
    });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(13, 8), new THREE.MeshToonMaterial({ map: rugTex, transparent: true }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.02;
    rug.receiveShadow = true;
    s.add(rug);
    // walls: damask wallpaper over dark wainscoting
    const paper = canvasTex(256, 256, (g, w) => {
      g.fillStyle = "#3a2550";
      g.fillRect(0, 0, w, w);
      g.fillStyle = "#4b3266";
      for (const [cx, cy] of [
        [64, 64],
        [192, 192],
        [192, 64],
        [64, 192],
      ]) {
        const big = (cx + cy) % 256 === 128;
        g.beginPath();
        g.ellipse(cx, cy, big ? 30 : 18, big ? 46 : 26, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(cx, cy - (big ? 62 : 36));
        g.lineTo(cx + 12, cy);
        g.lineTo(cx, cy + (big ? 62 : 36));
        g.lineTo(cx - 12, cy);
        g.fill();
      }
      g.fillStyle = "#2f1d42";
      for (let x = 0; x < w; x += 128) g.fillRect(x, 0, 4, w);
    }, true);
    paper.repeat.set(8, 3);
    const wallMat = new THREE.MeshToonMaterial({ map: paper });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(26, 9), wallMat);
    back.position.set(0, 4.5, -7.2);
    s.add(back);
    const sideTex = paper.clone();
    sideTex.repeat.set(5, 3);
    sideTex.needsUpdate = true;
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(17, 9), new THREE.MeshToonMaterial({ map: sideTex }));
      side.position.set(sx * 11, 4.5, 1.3);
      side.rotation.y = -sx * Math.PI / 2;
      s.add(side);
      box(s, "#2a1810", 0.3, 1.6, 17, { x: sx * 10.9, y: 0.8, z: 1.3 });
      box(s, "#5a3a22", 0.4, 0.14, 17, { x: sx * 10.85, y: 1.65, z: 1.3 });
    }
    box(s, "#2a1810", 26, 1.6, 0.3, { y: 0.8, z: -7.1 });
    box(s, "#5a3a22", 26, 0.14, 0.4, { y: 1.65, z: -7.05 });

    // the fireplace (the one warm light)
    const fp = group(s, { z: -6.7 });
    box(fp, "#6a6070", 4.4, 3.2, 1.0, { y: 1.6 });
    box(fp, "#14100c", 2.6, 2.0, 1.05, { y: 1.0 });
    box(fp, "#4a4250", 5.0, 0.3, 1.3, { y: 3.3 });
    for (let k = 0; k < 3; k++) {
      const f = new THREE.Mesh(GEO.cone, flat(k === 1 ? "#ffd23f" : "#ff7a2a", 0.9, true));
      f.scale.set(0.35 - k * 0.04, 1.0, 0.35);
      f.position.set((k - 1) * 0.45, 0.6, 0.2);
      fp.add(f);
      this.flames.push(f);
    }
    box(fp, "#3a2418", 1.8, 0.2, 0.3, { y: 0.15, z: 0.2 });
    this.fire = new THREE.PointLight("#ff9a4a", 26, 16, 1.4);
    this.fire.position.set(0, 1.4, -5.6);
    s.add(this.fire);
    // candelabras on the mantel and on stands
    const candleSpots: [number, number, number][] = [
      [-1.8, 3.45, -6.6],
      [1.8, 3.45, -6.6],
      [-9.6, 2.2, -6.2],
      [9.6, 2.2, -6.2],
      [-10.2, 2.2, 4.8],
      [10.2, 2.2, 4.8],
    ];
    for (const [x, y, z] of candleSpots) {
      const g = group(s, { x, y, z });
      if (y < 3) cyl(g, "#c8a040", 0.08, 2.2, { y: -1.1 });
      for (const dx of [-0.3, 0, 0.3]) {
        cyl(g, "#f6efe0", 0.07, 0.4, { x: dx, y: 0.2 + (dx === 0 ? 0.15 : 0) });
        const fl = ball(g, flat("#ffd27a", 0.95, true), [0.07, 0.13, 0.07], { x: dx, y: 0.5 + (dx === 0 ? 0.15 : 0), cast: false });
        this.candles.push(fl);
      }
      box(g, "#c8a040", 0.8, 0.06, 0.1, { y: 0.02 });
      const halo = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.poolTex, color: "#ffb050", transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(1.8);
      halo.position.set(0, 0.5, 0.1);
      g.add(halo);
    }
    // portraits with gold frames
    const portrait = (x: number, face: string, bg: string) => {
      const tex = canvasTex(160, 200, (g, w, h) => {
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#1d1630";
        g.beginPath();
        g.ellipse(w / 2, h, 60, 70, 0, Math.PI, 0);
        g.fill();
        g.fillStyle = face;
        g.beginPath();
        g.ellipse(w / 2, h * 0.45, 34, 44, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#1d1630";
        g.fillRect(w / 2 - 20, h * 0.4, 12, 6);
        g.fillRect(w / 2 + 8, h * 0.4, 12, 6);
        g.fillRect(w / 2 - 14, h * 0.6, 28, 4);
      });
      box(s, "#c8a040", 1.9, 2.4, 0.15, { x, y: 4.4, z: -7.1 });
      const pic = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: tex }));
      pic.scale.set(1.5, 2.0, 1);
      pic.position.set(x, 4.4, -7.0);
      s.add(pic);
    };
    portrait(-5.2, "#c8d0a0", "#2a3a2a");
    portrait(5.2, "#d8b8a8", "#3a2a3a");
    // the tall moonlit window
    const winTex = canvasTex(256, 384, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#1a2a6a");
      gr.addColorStop(1, "#4a5aa0");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff8d0";
      g.beginPath();
      g.arc(170, 90, 40, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#1a2a6a";
      g.beginPath();
      g.arc(185, 80, 34, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#0a0a20";
      g.fillRect(w / 2 - 5, 0, 10, h);
      g.fillRect(0, h / 2 - 5, w, 10);
    });
    for (const x of [-8.6, 8.6]) {
      box(s, "#2a1810", 2.3, 3.7, 0.2, { x, y: 4.4, z: -7.12 });
      const wm = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: winTex }));
      wm.scale.set(1.9, 3.3, 1);
      wm.position.set(x, 4.4, -7.0);
      s.add(wm);
    }
    // the grandfather clock
    const clock = group(s, { x: -3.2, z: -6.7 });
    box(clock, "#3a2418", 1.1, 3.6, 0.7, { y: 1.8 });
    cyl(clock, "#f6efe0", 0.4, 0.05, { y: 3.0, z: 0.36, rx: Math.PI / 2 });
    const handPiv = group(clock, { y: 3.0, z: 0.4 });
    box(handPiv, "#1d1630", 0.05, 0.32, 0.03, { y: 0.14, cast: false });
    this.clockHand = handPiv;
    box(clock, "#c8a040", 0.12, 0.9, 0.05, { y: 1.5, z: 0.36 });
    // a bookshelf
    const shelf = group(s, { x: 3.4, z: -6.75 });
    box(shelf, "#3a2418", 1.8, 3.4, 0.6, { y: 1.7 });
    const bookCols = ["#a8323e", "#3a6a9a", "#c8a040", "#4a8a4a", "#6a3a8a"];
    for (let r = 0; r < 4; r++)
      for (let b = 0; b < 5; b++) box(shelf, bookCols[(r + b) % 5], 0.26, 0.55, 0.4, { x: -0.6 + b * 0.3, y: 0.55 + r * 0.8, z: 0.15, cast: false });
    // cobwebs in the top corners
    const web = canvasTex(256, 256, (g, w) => {
      g.strokeStyle = "rgba(230,230,255,0.75)";
      g.lineWidth = 2;
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * (Math.PI / 2);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * w, Math.sin(a) * w);
        g.stroke();
      }
      for (let r = 40; r < w; r += 44) {
        g.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * (Math.PI / 2);
          const rr = r - Math.sin(k * 1.3) * 6;
          g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.stroke();
      }
    });
    for (const sx of [-1, 1]) {
      const wm = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: web, transparent: true, depthWrite: false }));
      wm.scale.set(sx * 3, -3, 1);
      wm.position.set(sx * 11.5, 7.4, -7.0);
      s.add(wm);
    }
  }

  private makeGhostGeo() {
    const pts: THREE.Vector2[] = [];
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.sin(a) * 0.5, 0.25 + Math.cos(a) * 0.5));
    }
    pts.push(new THREE.Vector2(0.52, 0.0), new THREE.Vector2(0.56, -0.3), new THREE.Vector2(0.6, -0.5));
    pts.reverse();
    const g = new THREE.LatheGeometry(pts, 24);
    // a wavy hem
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k);
      if (y < -0.4) {
        const a = Math.atan2(p.getZ(k), p.getX(k));
        p.setY(k, y + Math.sin(a * 6) * 0.1);
      }
    }
    g.computeVertexNormals();
    return g;
  }

  private makeHunter(i: number, x: number, z: number, yaw: number): Hunter {
    const p = this.players[i];
    const a = this.avatars[i];
    // the lantern, hanging from the fist (rig.armL is the zkSNARK's own right arm: its hand is handR)
    const lan = group(a.snark.handR, { y: -0.2 });
    cyl(lan, "#2d2a3a", 0.12, 0.05, { y: 0.14 });
    const bulb = ball(lan, flat("#fff3c0"), [0.11, 0.13, 0.11], { cast: false });
    cyl(lan, "#2d2a3a", 0.13, 0.04, { y: -0.13 });
    // the beam: a soft cone and a pool on the floor, tinted with the player's colour
    const tint = new THREE.Color("#fff6d0").lerp(new THREE.Color(p.char.color), 0.6);
    const beam = group(this.scene, { x, z, ry: yaw });
    const poolMat = new THREE.MeshBasicMaterial({ map: this.poolTex, color: tint, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    const pool = new THREE.Mesh(this.poolGeo, poolMat);
    pool.position.y = 0.04;
    pool.renderOrder = 3;
    beam.add(pool);
    // the UVs of the sector come from positions: re-map so the gradient starts at the lantern
    const coneMat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false });
    const cone3 = new THREE.Mesh(this.coneGeo, coneMat);
    const r = Math.tan(BEAM_HALF) * BEAM_LEN;
    cone3.scale.set(r, 0.45, BEAM_LEN);
    cone3.position.set(0, 1.0, 0.25);
    cone3.rotation.x = Math.atan2(0.95, BEAM_LEN);
    cone3.renderOrder = 4;
    beam.add(cone3);
    // a soft glow at the feet so everyone shows in the dark
    const glow = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.poolTex, color: p.char.color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.scale.setScalar(1.7);
    glow.position.y = 0.03;
    beam.add(glow);
    return { x, z, yaw, vx: 0, vz: 0, cd: 1.5, score: 0, beam, pool, poolMat, coneMat, bulb, flash: 0, hurt: 0 };
  }

  // ------------------------------------------------------------ ghosts

  private spawnGhost(kind?: GKind) {
    if (!kind) {
      const imps = this.ghosts.filter((g) => g.kind === "imp" && !g.dead).length;
      const r = this.rnd();
      kind = r < 0.17 ? "big" : r < 0.37 && imps < (this.midnight ? 2 : 1) ? "imp" : "small";
    }
    // come out of the walls (or the front, out of the dark), away from where the hunters are
    let cx = 0,
      cz = 0;
    for (const h of this.hs) {
      cx += h.x / Math.max(1, this.hs.length);
      cz += h.z / Math.max(1, this.hs.length);
    }
    let x = 0,
      z = 0,
      far = -1;
    for (let tries = 0; tries < 3; tries++) {
      const side = this.rnd();
      let tx: number, tz: number;
      if (side < 0.3) {
        tx = (this.rnd() - 0.5) * 2 * RX;
        tz = -RZ - 0.5;
      } else if (side < 0.55) {
        tx = -RX - 0.3;
        tz = (this.rnd() - 0.5) * 2 * RZ;
      } else if (side < 0.8) {
        tx = RX + 0.3;
        tz = (this.rnd() - 0.5) * 2 * RZ;
      } else {
        tx = (this.rnd() - 0.5) * 2 * RX;
        tz = RZ + 0.3;
      }
      const d = dist2(tx, tz, cx, cz);
      if (d > far) {
        far = d;
        x = tx;
        z = tz;
      }
    }
    const g = new THREE.Group();
    // (Apparitions: pale violet, glowing from within; the green prankster stays green)
    const col = kind === "imp" ? "#a8ffbe" : kind === "big" ? "#cdb8ff" : "#e4dcff";
    const emi = kind === "imp" ? "#3acf6a" : kind === "big" ? "#7a4ae0" : "#8a62e8";
    const mat = new THREE.MeshToonMaterial({ color: col, emissive: emi, emissiveIntensity: 0.7, transparent: true, opacity: 0.88 });
    const body = new THREE.Mesh(this.ghostGeo, mat);
    body.castShadow = false;
    g.add(body);
    const s = GR[kind] / 0.5;
    body.scale.setScalar(s);
    const face = group(g, { y: 0.3 * s, z: 0.47 * s, rx: -0.3 });
    face.scale.setScalar(s);
    const eye = flat("#1d1630");
    if (kind === "imp") {
      // a cheeky grin and a little pointed hat
      ball(face, eye, [0.1, 0.065, 0.05], { x: -0.15, y: 0.07, rz: 0.4, cast: false });
      ball(face, eye, [0.1, 0.065, 0.05], { x: 0.15, y: 0.07, rz: -0.4, cast: false });
      const grin = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 6, 12, Math.PI), eye);
      grin.rotation.z = Math.PI;
      grin.position.y = -0.08;
      face.add(grin);
      cone(g, "#5a2a8a", 0.24, 0.5, { y: 0.95, rz: 0.25, cast: false });
    } else {
      // pixel eyes and mouth, as a 1-of-1 voxel Apparition wears them
      box(face, eye, 0.13, 0.17, 0.06, { x: -0.15, y: 0.05, cast: false });
      box(face, eye, 0.13, 0.17, 0.06, { x: 0.15, y: 0.05, cast: false });
      box(face, eye, 0.16, 0.07, 0.06, { y: -0.17, cast: false });
      if (kind === "big") {
        // a crown of a former lord of the manor
        const cr = group(g, { y: 0.78 * s });
        cyl(cr, "#ffc928", 0.3, 0.18, { seg: 10 });
        for (let k = 0; k < 5; k++) cone(cr, "#ffc928", 0.07, 0.18, { x: Math.cos((k / 5) * Math.PI * 2) * 0.27, z: Math.sin((k / 5) * Math.PI * 2) * 0.27, y: 0.16, lo: true, cast: false });
      }
    }
    const pieMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthTest: false, depthWrite: false });
    const pie = new THREE.Mesh(this.pies[0], pieMat);
    pie.renderOrder = 12;
    pie.position.y = 1.05 * s + 0.35;
    pie.visible = false;
    g.add(pie);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.poolTex, color: kind === "imp" ? "#6aff9a" : "#a68aff", transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(2.6 * s);
    halo.position.y = 0.1 * s;
    g.add(halo);
    g.position.set(x, 1.2, z);
    this.scene.add(g);
    const gh: Ghost = { g, body, mat, pie, pieMat, kind, x, z, y: 1.2, vx: 0, vz: 0, gx: 0, gz: 0, exp: [0, 0, 0, 0], t: this.rnd() * 10, appear: 0, caught: -1, catchT: 0, dead: false, calm: 1.5 };
    this.newGoal(gh);
    this.ghosts.push(gh);
  }

  private newGoal(g: Ghost) {
    // wander, preferring spots no hunter is standing near
    let best = -1;
    for (let k = 0; k < 3; k++) {
      const x = (this.rnd() - 0.5) * 2 * (RX - 1),
        z = (this.rnd() - 0.5) * 2 * (RZ - 0.8);
      let near = Infinity;
      for (const h of this.hs) near = Math.min(near, dist2(h.x, h.z, x, z));
      if (near > best) {
        best = near;
        g.gx = x;
        g.gz = z;
      }
    }
  }

  /** Is (x, z) in the beam of hunter h (len, half-angle; r: radius of the thing)? */
  private inBeam(h: Hunter, x: number, z: number, r: number, len = BEAM_LEN, half = BEAM_HALF) {
    const dx = x - h.x,
      dz = z - h.z;
    const d = Math.hypot(dx, dz);
    if (d > len + r * 0.6 || d < 0.2) return d < 0.6;
    const ang = Math.abs(angDiff(h.yaw, Math.atan2(dx, dz)));
    return ang < half + Math.atan2(r * 0.8, d);
  }

  private capture(g: Ghost, i: number) {
    if (g.caught >= 0) return;
    g.caught = i;
    g.catchT = 0;
    const p = this.players[i];
    const h = this.hs[i];
    h.score += VALUE[g.kind];
    this.hud.setScore(p.seat, this.scoreHtml(h.score));
    this.hud.pop(new THREE.Vector3(g.x, g.y + 1.2, g.z), `+${VALUE[g.kind]}`, g.kind === "big" ? "#ffe14a" : p.char.color, this.camera);
    this.sound(g.kind === "big" ? "fanfare" : "magic");
    if (g.kind === "big") {
      this.sound("coins");
      this.shake = 0.25;
    }
    this.buzz(i, g.kind === "big" ? 70 : 30);
    this.fx.sparkle({ x: g.x, y: g.y, z: g.z }, p.char.color, g.kind === "big" ? 30 : 14);
    g.pie.visible = false;
  }

  private updateGhosts(dt: number, live: boolean) {
    for (const g of this.ghosts) {
      if (g.dead) continue;
      g.t += dt;
      g.appear = Math.min(1, g.appear + dt * 1.5);
      if (g.caught >= 0) {
        // sucked into the lantern
        g.catchT += dt;
        const h = this.hs[g.caught];
        const k = Math.min(1, g.catchT / 0.4);
        const tx = h.x + Math.sin(h.yaw) * 0.4,
          tz = h.z + Math.cos(h.yaw) * 0.4;
        g.x = lerp(g.x, tx, k);
        g.z = lerp(g.z, tz, k);
        g.y = lerp(g.y, 0.9, k);
        g.g.scale.setScalar(Math.max(0.05, 1 - k));
        g.g.rotation.y += dt * 20;
        g.g.position.set(g.x, g.y, g.z);
        if (k >= 1) {
          this.killGhost(g);
          this.fx.burst({ x: tx, y: 1, z: tz }, { count: 10, colors: ["#ffffff", this.players[g.caught].char.color], speed: 3, size: 0.12, life: 0.4, shape: "ball" });
        }
        continue;
      }
      // light on it
      let lit = false;
      let fx = 0,
        fz = 0;
      if (live && g.appear >= 0.6) {
        this.hs.forEach((h, i) => {
          if (this.inBeam(h, g.x, g.z, GR[g.kind])) {
            g.exp[i] += dt;
            lit = true;
            const d = dist2(g.x, g.z, h.x, h.z) || 1;
            fx += (g.x - h.x) / d;
            fz += (g.z - h.z) / d;
          } else g.exp[i] = Math.max(0, g.exp[i] - dt * 0.5);
        });
      }
      // motion: drift to a goal, flee the light, imps chase people
      const spd = g.kind === "big" ? 0.95 : g.kind === "imp" ? 2.3 : 1.55;
      let tx = g.gx - g.x,
        tz = g.gz - g.z;
      if (g.kind === "imp" && live && g.calm <= 0) {
        let best = -1,
          bd = Infinity;
        this.hs.forEach((h, i) => {
          const d = dist2(h.x, h.z, g.x, g.z);
          if (d < bd) {
            bd = d;
            best = i;
          }
        });
        if (best >= 0) {
          tx = this.hs[best].x - g.x;
          tz = this.hs[best].z - g.z;
        }
      } else if (Math.hypot(tx, tz) < 0.6) this.newGoal(g);
      const tl = Math.hypot(tx, tz) || 1;
      let wx = (tx / tl) * spd,
        wz = (tz / tl) * spd;
      if (lit) {
        const fl = Math.hypot(fx, fz) || 1;
        const flee = g.kind === "big" ? 1.3 : 1.9;
        wx = wx * 0.3 + (fx / fl) * flee;
        wz = wz * 0.3 + (fz / fl) * flee;
      }
      const k = 1 - Math.exp(-2.2 * dt);
      g.vx += (wx - g.vx) * k;
      g.vz += (wz - g.vz) * k;
      g.x = clamp(g.x + g.vx * dt, -RX - 0.4, RX + 0.4);
      g.z = clamp(g.z + g.vz * dt, -RZ - 0.6, RZ + 0.3);
      g.y = 1.35 + Math.sin(g.t * 2.2) * 0.18 + (g.kind === "big" ? 0.35 : 0);
      g.calm -= dt;
      // the progress ring of whoever lights it most
      let best = -1,
        bv = 0;
      g.exp.forEach((v, i) => {
        if (v > bv) {
          bv = v;
          best = i;
        }
      });
      const need = NEED[g.kind];
      if (best >= 0 && bv > 0.05) {
        g.pie.visible = true;
        const step = Math.min(PIE_STEPS, Math.round((bv / need) * PIE_STEPS));
        g.pie.geometry = this.pies[step];
        g.pieMat.color.set(this.players[best].char.color);
        g.pie.lookAt(this.camera.position);
        g.mat.emissive.set(this.players[best].char.color);
        g.mat.emissiveIntensity = 0.5 + 0.5 * (bv / need);
        g.body.position.x = Math.sin(g.t * 50) * 0.04 * (bv / need);
        if (bv >= need) this.capture(g, best);
      } else {
        g.pie.visible = false;
        g.mat.emissive.set(g.kind === "imp" ? "#3acf6a" : g.kind === "big" ? "#9aa8ff" : "#8a9aee");
        g.mat.emissiveIntensity = 0.7;
        g.body.position.x = 0;
      }
      g.mat.opacity = 0.88 * g.appear * (0.85 + Math.sin(g.t * 3) * 0.15);
      g.g.position.set(g.x, g.y, g.z);
      g.g.rotation.z = clamp(-g.vx * 0.12, -0.3, 0.3);
      g.g.rotation.y = Math.atan2(g.vx, Math.max(0.6, g.vz + 0.8)) * 0.6;
      // the imp's mischief
      if (g.kind === "imp" && live && g.calm <= 0 && g.caught < 0) {
        this.hs.forEach((h, i) => {
          if (g.dead || g.caught >= 0) return;
          if (dist2(h.x, h.z, g.x, g.z) < 0.75) {
            const lost = Math.min(1, h.score);
            h.score -= lost;
            h.hurt = 0.8;
            this.avatars[i].flash();
            this.hud.setScore(this.players[i].seat, this.scoreHtml(h.score));
            this.hud.pop(new THREE.Vector3(h.x, 2.2, h.z), lost ? "−1" : T("Boo!", "嘘！"), "#7dff9a", this.camera);
            this.sound("steal");
            this.buzz(i, [60, 40, 60]);
            this.fx.burst({ x: g.x, y: g.y, z: g.z }, { count: 16, colors: ["#a8ffbe", "#ffffff"], speed: 4, size: 0.15, life: 0.5, shape: "ball" });
            // vanish and come back elsewhere a bit later
            this.killGhost(g);
          }
        });
      }
    }
    this.ghosts = this.ghosts.filter((g) => !g.dead);
  }

  private killGhost(g: Ghost) {
    g.dead = true;
    g.g.removeFromParent();
    g.g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !(m.userData as { shared?: boolean }).shared) m.dispose();
    });
  }

  private flashBurst(i: number) {
    const h = this.hs[i];
    const p = this.players[i];
    h.cd = FLASH_CD;
    h.flash = 1;
    this.sound("zap");
    this.buzz(i, 40);
    this.fx.ring({ x: h.x + Math.sin(h.yaw) * 2, y: 0.1, z: h.z + Math.cos(h.yaw) * 2 }, "#ffffff", 3.5, 0.35);
    this.fx.burst({ x: h.x + Math.sin(h.yaw) * 0.5, y: 1, z: h.z + Math.cos(h.yaw) * 0.5 }, { count: 14, colors: ["#ffffff", "#fff3a0", p.char.color], speed: 6, size: 0.12, life: 0.35, shape: "ball", gravity: 0 });
    for (const g of this.ghosts) {
      if (g.dead || g.caught >= 0 || g.appear < 0.6) continue;
      if (!this.inBeam(h, g.x, g.z, GR[g.kind], FLASH_LEN, FLASH_HALF)) continue;
      if (g.kind === "big") g.exp[i] += 1.1;
      else this.capture(g, i);
    }
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number): CpuPad {
    const me = this.hs[i];
    const lv = this.players[i].level;
    // an imp coming: face it (light it) or run
    let imp: Ghost | null = null;
    for (const g of this.ghosts) if (g.kind === "imp" && g.caught < 0 && g.calm <= 0 && dist2(g.x, g.z, me.x, me.z) < 3.2) imp = g;
    let tgt = this.cpuT[i];
    if (tgt && (tgt.dead || tgt.caught >= 0)) tgt = null;
    if (!tgt || this.cpuAfter(i, "rethink", 0.8 - 0.4 * lv)) {
      this.cpuReset(i, "rethink");
      let best: Ghost | null = null,
        bs = 0;
      for (const g of this.ghosts) {
        if (g.dead || g.caught >= 0 || g.appear < 0.5) continue;
        const d = dist2(g.x, g.z, me.x, me.z);
        let rival = 0;
        g.exp.forEach((v, j) => {
          if (j !== i) rival = Math.max(rival, v);
        });
        const mine = g.exp[i];
        let contest = rival > mine + 0.3 ? 0.5 : 1;
        // spread out: others already on it or close to it
        for (let j = 0; j < this.hs.length; j++) {
          if (j === i) continue;
          if (this.cpuT[j] === g) contest *= 1 - 0.45 * lv;
          if (dist2(this.hs[j].x, this.hs[j].z, g.x, g.z) < d - 0.5) contest *= 0.75;
        }
        const s = ((VALUE[g.kind] / NEED[g.kind]) * (1 + mine) * contest) / (d + 1.5) * (g === tgt ? 1.3 : 1) * (0.8 + Math.random() * 0.4 * (1 - lv));
        if (s > bs) {
          bs = s;
          best = g;
        }
      }
      tgt = best;
      this.cpuT[i] = tgt;
    }
    const aimAt = imp ?? tgt;
    let x = 0,
      y = 0,
      a = false;
    if (aimAt) {
      const dx = aimAt.x - me.x,
        dz = aimAt.z - me.z;
      const d = Math.hypot(dx, dz) || 1;
      // aim wobble for the weaker ones
      const wob = (1 - lv) * 0.55 * Math.sin(this.t * 2.3 + i * 1.7);
      const ang = Math.atan2(dx, dz) + wob;
      const ideal = BEAM_LEN * (0.5 + 0.1 * lv);
      let mag: number;
      if (d > ideal + 0.6) mag = 1;
      else if (d < 1.4) mag = -0.4; // back off while facing (sign handled below)
      else mag = 0.2;
      if (mag >= 0) {
        x = Math.sin(ang) * mag;
        y = Math.cos(ang) * mag;
      } else {
        // step back: turn toward it with a tiny push, the avatar still faces it
        x = Math.sin(ang) * 0.17;
        y = Math.cos(ang) * 0.17;
      }
      // flash: several in the cone, an imp close, or a rival about to win my target
      if (me.cd <= 0) {
        let n = 0;
        for (const g of this.ghosts) if (g.caught < 0 && g.kind !== "big" && this.inBeam(me, g.x, g.z, GR[g.kind], FLASH_LEN, FLASH_HALF)) n++;
        const impNear = imp && this.inBeam(me, imp.x, imp.z, GR.imp, FLASH_LEN, FLASH_HALF) && dist2(imp.x, imp.z, me.x, me.z) < 2.8;
        const steal = tgt && tgt.kind !== "big" && this.inBeam(me, tgt.x, tgt.z, GR[tgt.kind], FLASH_LEN, FLASH_HALF) && tgt.exp.some((v, j) => j !== i && v > 0.55);
        if ((n >= 2 || impNear || steal || (n >= 1 && lv > 0.7 && Math.random() < 0.02)) && this.cpuAfter(i, "flash", 0.45 - 0.3 * lv)) {
          a = true;
          this.cpuReset(i, "flash");
        }
      }
    } else {
      // patrol toward the middle
      const dx = -me.x * 0.3,
        dz = -me.z * 0.3;
      x = clamp(dx, -0.5, 0.5);
      y = clamp(dz, -0.5, 0.5);
    }
    return { x, y, a };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.decor(dt);
    this.updateGhosts(dt, false);
    this.moveCam([0, 14.2, 14.2], [0, 0.4, 0.5], dt, 1.7);
    this.hs.forEach((h) => this.placeBeam(h));
  }

  private decor(dt: number) {
    const tt = performance.now() / 1000;
    this.fire.intensity = 22 + Math.sin(tt * 13) * 4 + Math.sin(tt * 7.3) * 3;
    this.flames.forEach((f, k) => (f.scale.y = 0.9 + Math.sin(tt * (11 + k * 3) + k) * 0.2));
    this.candles.forEach((c, k) => (c.scale.y = 0.13 * (0.85 + Math.sin(tt * (9 + (k % 4)) + k) * 0.15)));
    this.clockHand.rotation.z = -tt * 0.8;
  }

  private placeBeam(h: Hunter) {
    h.beam.position.set(h.x, 0, h.z);
    h.beam.rotation.y = h.yaw;
    const f = h.flash;
    h.poolMat.opacity = 0.6 + f * 0.4;
    h.coneMat.opacity = 0.06 + f * 0.3;
    const s = 1 + f * 0.25;
    h.pool.scale.set(s, 1, s);
    const k = h.cd > 0 ? 0.6 : 1 + Math.sin(this.t * 6) * 0.12 + f * 0.6;
    h.bulb.scale.set(0.11 * k, 0.13 * k, 0.11 * k);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.decor(dt);
    this.moveCam([0, 14.2, 14.2], [0, 0.4, 0.5], dt, 3);
    if (!this.midnight && left <= 10) {
      this.midnight = true;
      this.hud.banner(T("Midnight strikes!", "午夜钟声！"), { color: "#c8b4ff", sub: T("The Apparitions swarm out…", "幽灵成群出没……") });
      music.speed(1.15);
      this.sound("bell");
      this.shake = 0.2;
    }
    // ghosts come and go
    const want = this.midnight ? 10 : 7;
    this.nextGhost -= dt;
    if (this.nextGhost <= 0 && this.ghosts.filter((g) => g.caught < 0).length < want) {
      this.spawnGhost();
      this.nextGhost = (this.midnight ? 0.4 : 0.8) + this.rnd() * 0.6;
    }

    this.hs.forEach((h, i) => {
      const a = this.avatars[i];
      const p = this.pad(i);
      h.cd -= dt;
      h.flash = Math.max(0, h.flash - dt * 3);
      h.hurt -= dt;
      const mag = Math.hypot(p.x, p.y);
      if (mag > 0.15) {
        const want = Math.atan2(p.x, p.y);
        const d = angDiff(h.yaw, want);
        const step = TURN * dt;
        h.yaw += Math.abs(d) < step ? d : Math.sign(d) * step;
      }
      const sp = SPEED * (h.hurt > 0 ? 0.4 : 1);
      // you walk where you point (slower while turning hard)
      const k = 1 - Math.exp(-10 * dt);
      const fwd = mag > 0.15 ? mag : 0;
      h.vx += (Math.sin(h.yaw) * fwd * sp - h.vx) * k;
      h.vz += (Math.cos(h.yaw) * fwd * sp - h.vz) * k;
      h.x = clamp(h.x + h.vx * dt, -RX, RX);
      h.z = clamp(h.z + h.vz * dt, -RZ, RZ);
      if (p.aDown && h.cd <= 0) this.flashBurst(i);
      const v = Math.hypot(h.vx, h.vz);
      a.anim = h.hurt > 0 ? "stun" : v > 0.5 ? "run" : "idle";
      a.speed = clamp(v / SPEED, 0, 1);
      a.yaw = h.yaw;
      a.pos.set(h.x, 0, h.z);
      this.placeBeam(h);
    });
    // bumps
    for (let i = 0; i < this.hs.length; i++)
      for (let j = i + 1; j < this.hs.length; j++) {
        const A = this.hs[i],
          B = this.hs[j];
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
    this.updateGhosts(dt, true);

    if (left <= 0) this.finishByScore(this.hs.map((h) => h.score));
  }

  protected outroStep(dt: number) {
    this.decor(dt);
    this.updateGhosts(dt, false);
  }

  dispose() {
    for (const p of this.pies) p.dispose();
    this.ghostGeo.dispose();
    super.dispose();
  }
}

const def: MiniDef = {
  id: "chasse-fantomes",
  name: "Apparition Hunt",
  icon: "👻",
  color: "#8fa0ff",
  tagline: "Light up the Apparitions with your lantern to catch them.",
  rules: "Keep an Apparition in your lantern's beam to catch it (+1, the big one +3). The green prankster steals a point if it touches you! A: a flash that grabs the small lit ones.",
  controls: { stick: "Walk and aim", a: "Flash" },
  modes: ["ffa"],
  length: 45,
  music: "tense",
  create: (ctx) => new ChasseFantomes(ctx),
};
export default def;
