/**
 * STAND DE TIR (chacun pour soi, 40 s): a fairground shooting gallery at dusk. Three rails of
 * targets slide across the booth: ducks (1) at the bottom, stars (2) in the middle, small fast gold
 * bullseyes (5) at the top, and bomb targets (−3) mixed in. Everyone stands at the counter (seen from
 * behind) and moves a crosshair of their colour with the stick; A fires a cork (0.25 s between
 * shots). Last 10 s: the rails speed up and more gold shows. Most points wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, coinMesh, cone, cyl, flat, group, starGeo, toon } from "../../engine/gfx";
import { clamp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 40;
const EYE = new THREE.Vector3(0, 3.3, 11.6);
const LOOK = new THREE.Vector3(0, 3.45, -6);
const AIM_Z = -4.6; // the crosshairs live in this plane
const AIM_X = 7.6;
const AIM_Y0 = 0.9;
const AIM_Y1 = 6.4;
const CROSS_SPEED = 10.5;
const COOLDOWN = 0.25;
const HALF = 9.2; // targets travel from -HALF to +HALF
const AV_Z = 4.4; // the players at the counter

type Kind = "duck" | "star" | "gold" | "bomb";
const VALUE: Record<Kind, number> = { duck: 1, star: 2, gold: 5, bomb: -3 };
/** Hit radius of each kind (world units, in its rail's plane). */
const RAD: Record<Kind, number> = { duck: 0.62, star: 0.62, gold: 0.4, bomb: 0.5 };

interface Row {
  y: number;
  z: number;
  dir: number;
  speed: number;
  every: number;
  next: number;
}
const ROWS: Omit<Row, "next">[] = [
  { y: 1.85, z: -4.9, dir: 1, speed: 2.3, every: 0.95 },
  { y: 3.55, z: -6.0, dir: -1, speed: 2.9, every: 0.9 },
  { y: 5.25, z: -7.1, dir: 1, speed: 4.8, every: 1.25 },
];

interface Target {
  g: THREE.Group;
  kind: Kind;
  row: number;
  x: number;
  /** 0 alive, >0 falling (time since hit). */
  hitT: number;
  dead: boolean;
  bob: number;
}

interface Shooter {
  /** Crosshair in the aim plane. */
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  cd: number;
  score: number;
  cross: THREE.Group;
  ring: THREE.Mesh;
  kick: number;
  /** x of the avatar at the counter. */
  ax: number;
}

interface Cork {
  m: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  life: number;
}

class StandTir extends BaseMini {
  private rows: Row[] = ROWS.map((r) => ({ ...r, next: 0 }));
  private targets: Target[] = [];
  private sh: Shooter[] = [];
  private corks: Cork[] = [];
  private corkGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.16, 8);
  private corkMat = toon("#d9a066");
  private hurry = false;
  private bulbs!: THREE.InstancedMesh;
  private bulbCount = 0;
  private bulbT = 0;
  private proto: Record<Kind, THREE.Group>;
  private cpuAim: { t: Target | null; jx: number; jy: number; wait: number }[] = [];
  private ray = new THREE.Vector3();

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#241650", "#ff9a6a"], size: 12, sun: [0.2, 0.8, 1], sunIntensity: 1.6, hemi: ["#ffe8d0", "#4a3050", 1.6], fog: { color: "#3a2260", near: 30, far: 70 } });
    this.proto = { duck: this.makeDuck(), star: this.makeStar(), gold: this.makeGold(), bomb: this.makeBomb() };
    this.buildBooth();
    const xs = [-3.4, -1.15, 1.15, 3.4];
    this.players.forEach((p, i) => {
      const ax = xs[i];
      const a = this.spawn(i, ax, AV_Z, Math.PI);
      a.anim = "hold";
      this.addGun(i);
      const cross = this.makeCross(p.char.color);
      const s: Shooter = { cx: ax * 1.2, cy: 3.3, vx: 0, vy: 0, cd: 0, score: 0, cross, ring: cross.children[0] as THREE.Mesh, kick: 0, ax };
      this.sh.push(s);
      // (a pale colour: dark letters on it)
      const light = new THREE.Color(p.char.color).getHSL({ h: 0, s: 0, l: 0 }).l > 0.62;
      this.hud.label(cross, `<span style="color:${light ? "#1d1630" : "#fff"}">${p.name}</span>`, { color: p.char.color, dy: -0.95 });
      this.cpuAim.push({ t: null, jx: 0, jy: 0, wait: 0 });
    });
    // pre-fill the rails so the gallery is full at GO
    this.rows.forEach((r, ri) => {
      for (let x = -HALF + 1.2; x < HALF - 1; x += r.speed * r.every * (0.9 + this.rnd() * 0.5)) this.spawnTarget(ri, x);
      r.next = r.every * 0.5;
    });
    this.hud.players(this.players, () => this.scoreHtml(0));
    this.hud.timer(TIME);
    this.setCam([0, 6, 18], [0, 3.5, -6], 42);
  }

  private scoreHtml(n: number) {
    return `${n} <span style="font-size:0.55em;opacity:0.8">${T(n === 1 ? "pt" : "pts", "分")}</span>`;
  }

  // ------------------------------------------------------------ the booth

  private buildBooth() {
    const s = this.scene;
    // a warm light inside the booth
    const pl = new THREE.PointLight("#ffd9a0", 40, 30, 1.6);
    pl.position.set(0, 6.5, -2);
    s.add(pl);
    // the fairground floor (outside) and the booth floor
    const planks = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#9a6a3e";
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 64) {
        g.fillStyle = y % 128 ? "#a8774a" : "#8f6038";
        g.fillRect(0, y + 2, w, 60);
        g.fillStyle = "rgba(60,30,10,0.35)";
        for (let x = (y * 3) % 170; x < w; x += 170) g.fillRect(x, y, 4, 64);
      }
    }, true);
    planks.repeat.set(4, 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshToonMaterial({ map: planks }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 2);
    floor.receiveShadow = true;
    s.add(floor);

    // backdrop: a painted seaside
    const back = canvasTex(1024, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#5ec8ff");
      gr.addColorStop(0.7, "#c8f0ff");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#ffe36a";
      g.beginPath();
      g.arc(w * 0.82, h * 0.25, 60, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffffff";
      for (const [x, y, r] of [
        [150, 110, 40],
        [200, 95, 52],
        [255, 115, 38],
        [520, 70, 34],
        [565, 55, 46],
        [610, 72, 32],
      ]) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#2f8dd6";
      g.fillRect(0, h * 0.72, w, h * 0.28);
      g.strokeStyle = "#ffffff";
      g.lineWidth = 6;
      for (let y = h * 0.76; y < h; y += 34) {
        g.beginPath();
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.04 + y) * 6);
        g.stroke();
      }
    });
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(19, 8.4), new THREE.MeshToonMaterial({ map: back }));
    bd.position.set(0, 4.0, -8.2);
    s.add(bd);
    // the booth frame: side panels with stripes, a top board with the sign
    const stripes = canvasTex(256, 512, (g, w, h) => {
      for (let y = 0; y < h; y += 64) {
        g.fillStyle = (y / 64) % 2 ? "#ffffff" : "#e8343e";
        g.fillRect(0, y, w, 64);
      }
    });
    const sideMat = new THREE.MeshToonMaterial({ map: stripes });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(GEO.box, sideMat);
      p.scale.set(1.4, 8.6, 9.5);
      p.position.set(sx * 10.2, 4.3, -3.6);
      p.castShadow = p.receiveShadow = true;
      s.add(p);
      // front posts
      cyl(s, "#ffd23f", 0.32, 8.4, { x: sx * 9.3, y: 4.2, z: 0.9 });
      ball(s, "#ffd23f", 0.5, { x: sx * 9.3, y: 8.7, z: 0.9 });
    }
    // the sign board on top
    const sign = canvasTex(1024, 192, (g, w, h) => {
      g.fillStyle = "#7a2fd0";
      g.beginPath();
      g.roundRect(4, 4, w - 8, h - 8, 40);
      g.fill();
      g.strokeStyle = "#ffd23f";
      g.lineWidth = 12;
      g.stroke();
      g.font = 'bold 120px "Lilita One", "Fredoka Variable", sans-serif';
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineWidth = 16;
      g.strokeStyle = "#3a0f70";
      const title = T("ZEC FAIR", "ZEC 射击摊");
      g.strokeText(title, w / 2, h / 2 + 6);
      g.fillStyle = "#fff3a0";
      g.fillText(title, w / 2, h / 2 + 6);
    });
    const signM = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshBasicMaterial({ map: sign, transparent: true }));
    signM.position.set(0, 8.75, 1.05);
    s.add(signM);
    // canopy: a scalloped red-and-white valance across the top
    box(s, "#e8343e", 20, 0.9, 0.4, { x: 0, y: 7.75, z: 0.8 });
    for (let k = 0; k < 20; k++) {
      const x = -9.5 + k + 0.5;
      const m = new THREE.Mesh(GEO.cylLo, toon(k % 2 ? "#ffffff" : "#e8343e"));
      m.scale.set(0.5, 0.12, 0.5);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, 7.3, 1.0);
      s.add(m);
    }
    box(s, "#5a2a8a", 20.6, 0.5, 9.5, { x: 0, y: 8.3, z: -3.6 });
    // light bulbs around the opening (instanced, they chase)
    const pts: THREE.Vector3[] = [];
    for (let x = -9.3; x <= 9.31; x += 0.62) pts.push(new THREE.Vector3(x, 7.12, 1.25));
    for (let y = 0.8; y < 7.0; y += 0.62) {
      pts.push(new THREE.Vector3(-8.95, y, 1.25));
      pts.push(new THREE.Vector3(8.95, y, 1.25));
    }
    this.bulbCount = pts.length;
    this.bulbs = new THREE.InstancedMesh(GEO.sphereLo, new THREE.MeshBasicMaterial({ color: 0xffffff }), pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach((p, k) => {
      m4.makeScale(0.13, 0.13, 0.13).setPosition(p);
      this.bulbs.setMatrixAt(k, m4);
      this.bulbs.setColorAt(k, new THREE.Color("#fff3a0"));
    });
    s.add(this.bulbs);

    // the rails: a front board for each row hides the sticks
    const boardCols = ["#2f8dd6", "#3fae4a", "#c8343e"];
    this.rows.forEach((r, ri) => {
      const bz = r.z + 0.45;
      box(s, "#8a8494", 2 * HALF + 2, 0.08, 0.08, { x: 0, y: r.y - 0.72, z: r.z, cast: false });
      if (ri === 0) {
        // waves for the ducks
        const waves = canvasTex(1024, 128, (g, w, h) => {
          g.clearRect(0, 0, w, h);
          g.fillStyle = "#2f8dd6";
          g.beginPath();
          g.moveTo(0, h);
          for (let x = 0; x <= w; x += 4) g.lineTo(x, 34 + Math.sin((x / w) * Math.PI * 22) * 22);
          g.lineTo(w, h);
          g.fill();
          g.strokeStyle = "#bfe8ff";
          g.lineWidth = 8;
          g.beginPath();
          for (let x = 0; x <= w; x += 4) g.lineTo(x, 34 + Math.sin((x / w) * Math.PI * 22) * 22);
          g.stroke();
        });
        const wm = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF + 1, 1.3), new THREE.MeshToonMaterial({ map: waves, transparent: true, alphaTest: 0.5 }));
        wm.position.set(0, r.y - 0.55, bz);
        s.add(wm);
        const wm2 = wm.clone();
        wm2.position.set(0.8, r.y - 0.7, bz - 0.9);
        wm2.material = new THREE.MeshToonMaterial({ map: waves, transparent: true, alphaTest: 0.5, color: "#a0c8ff" });
        s.add(wm2);
      } else {
        box(s, "#8a5a32", 2 * HALF + 1, 0.16, 0.9, { x: 0, y: r.y - 0.72, z: r.z });
        box(s, boardCols[ri], 2 * HALF + 1, 0.36, 0.14, { x: 0, y: r.y - 0.7, z: bz });
        box(s, "#ffd23f", 2 * HALF + 1, 0.07, 0.18, { x: 0, y: r.y - 0.5, z: bz });
      }
    });
    // shelves of prizes (plush bears) on the side panels
    const bearCols = ["#ff8ad8", "#8fd0ff", "#ffd23f", "#a0f08a", "#c89aff"];
    for (const sx of [-1, 1])
      for (let k = 0; k < 3; k++) {
        const g = group(s, { x: sx * 9.0, y: 1.6 + k * 1.9, z: -0.2, ry: -sx * 0.5 });
        const c = bearCols[(k + (sx > 0 ? 2 : 0)) % bearCols.length];
        ball(g, c, [0.42, 0.45, 0.38], { y: 0.45 });
        ball(g, c, 0.32, { y: 1.05 });
        ball(g, c, 0.12, { x: -0.24, y: 1.3 });
        ball(g, c, 0.12, { x: 0.24, y: 1.3 });
        ball(g, "#fff3e0", 0.12, { y: 1.0, z: 0.28 });
        ball(g, flat("#1d1630"), 0.04, { x: -0.1, y: 1.12, z: 0.28 });
        ball(g, flat("#1d1630"), 0.04, { x: 0.1, y: 1.12, z: 0.28 });
        box(g, "#8a5a32", 1.0, 0.1, 0.8, { y: -0.02 });
      }
    // the counter in front of the players
    const front = canvasTex(512, 128, (g, w, h) => {
      for (let x = 0; x < w; x += 64) {
        g.fillStyle = (x / 64) % 2 ? "#ffffff" : "#e8343e";
        g.fillRect(x, 0, 64, h);
      }
      g.fillStyle = "rgba(0,0,0,0.15)";
      g.fillRect(0, h - 14, w, 14);
    }, true);
    front.repeat.set(3, 1);
    const counter = new THREE.Mesh(GEO.box, [toon("#8a5a32"), toon("#8a5a32"), toon("#a8774a"), toon("#8a5a32"), new THREE.MeshToonMaterial({ map: front }), toon("#8a5a32")]);
    counter.scale.set(18.6, 1.05, 0.9);
    counter.position.set(0, 0.52, AV_Z - 0.9);
    counter.castShadow = counter.receiveShadow = true;
    s.add(counter);
    // the night fair around: string lights and a far ferris wheel
    const wheel = group(s, { x: -15, y: 9, z: -22 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(6, 0.18, 6, 40), flat("#ff7ad9"));
    wheel.add(rim);
    for (let k = 0; k < 8; k++) box(wheel, flat("#ffd0f0"), 12, 0.1, 0.1, { rz: (k / 8) * Math.PI, cast: false });
    this.wheel = wheel;
    const tent = group(s, { x: 17, z: -18 });
    cone(tent, "#ffd23f", 5, 6, { y: 7 });
    cyl(tent, "#e8343e", 5, 4, { y: 2 });
  }
  private wheel!: THREE.Group;

  // ------------------------------------------------------------ targets

  private makeDuck() {
    const g = new THREE.Group();
    cyl(g, "#8a8494", 0.05, 0.8, { y: -0.55 });
    ball(g, "#ffd23f", [0.55, 0.36, 0.3], { y: 0 });
    ball(g, "#ffd23f", 0.27, { x: 0.32, y: 0.38 });
    cone(g, "#ff8a2a", 0.1, 0.28, { x: 0.62, y: 0.35, rz: -Math.PI / 2 });
    ball(g, flat("#1d1630"), 0.05, { x: 0.42, y: 0.46, z: 0.2 });
    ball(g, "#ffb020", [0.22, 0.14, 0.32], { x: -0.1, y: 0.08, z: 0.05 });
    // the white bullseye on its side
    const bull = new THREE.Mesh(GEO.circle, flat("#ffffff"));
    bull.scale.setScalar(0.17);
    bull.position.set(-0.05, 0.0, 0.31);
    g.add(bull);
    const dot = new THREE.Mesh(GEO.circle, flat("#e8343e"));
    dot.scale.setScalar(0.08);
    dot.position.set(-0.05, 0.0, 0.32);
    g.add(dot);
    return g;
  }
  private makeStar() {
    const g = new THREE.Group();
    cyl(g, "#8a8494", 0.05, 0.8, { y: -0.6 });
    const st = new THREE.Mesh(starGeo(0.66, 0.2), toon("#ff9a2e", "#a04000", 0.3));
    st.castShadow = true;
    g.add(st);
    const st2 = new THREE.Mesh(starGeo(0.36, 0.22), toon("#ffe14a", "#806000", 0.3));
    st2.position.z = 0.08;
    g.add(st2);
    return g;
  }
  /** The small gold target: a ⓩ coin on a stick. */
  private makeGold() {
    const g = new THREE.Group();
    cyl(g, "#8a8494", 0.04, 0.8, { y: -0.6 });
    const coin = coinMesh(0.42);
    coin.name = "coin";
    g.add(coin);
    const halo = new THREE.Mesh(GEO.ring, flat("#ffe14a", 0.7, true));
    halo.scale.setScalar(0.62);
    halo.name = "halo";
    g.add(halo);
    return g;
  }
  private makeBomb() {
    const g = new THREE.Group();
    cyl(g, "#8a8494", 0.05, 0.8, { y: -0.6 });
    ball(g, "#2a2438", 0.48);
    cyl(g, "#5a5470", 0.13, 0.2, { y: 0.5 });
    const spark = ball(g, flat("#ffb02e"), 0.12, { y: 0.66, cast: false });
    spark.name = "spark";
    const tex = canvasTex(128, 128, (c) => {
      c.font = 'bold 84px "Lilita One", sans-serif';
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineWidth = 10;
      c.strokeStyle = "#1d1630";
      c.strokeText("-3", 64, 70);
      c.fillStyle = "#ff4b3e";
      c.fillText("-3", 64, 70);
    });
    const lab = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    lab.scale.setScalar(0.62);
    lab.position.z = 0.5;
    g.add(lab);
    return g;
  }

  private spawnTarget(ri: number, x?: number) {
    const r = this.rows[ri];
    const k = this.rnd();
    let kind: Kind;
    if (ri === 0) kind = k < 0.15 ? "bomb" : "duck";
    else if (ri === 1) kind = k < 0.17 ? "bomb" : "star";
    else kind = k < (this.hurry ? 0.12 : 0.2) ? "bomb" : "gold";
    const g = this.proto[kind].clone();
    const sx = x ?? -r.dir * HALF;
    g.position.set(sx, r.y, r.z);
    if (kind === "duck" && r.dir < 0) g.rotation.y = Math.PI;
    this.scene.add(g);
    this.targets.push({ g, kind, row: ri, x: sx, hitT: 0, dead: false, bob: this.rnd() * 6 });
  }

  private removeTarget(t: Target) {
    t.dead = true;
    t.g.removeFromParent();
  }

  // ------------------------------------------------------------ guns & crosshairs

  private addGun(i: number) {
    const a = this.avatars[i];
    const g = group(a.rig.armR, { y: -0.3 });
    // the barrel points along the arm (forward when holding)
    cyl(g, "#5a5470", 0.06, 0.8, { y: -0.35 });
    box(g, "#8a5a32", 0.14, 0.36, 0.2, { y: 0.02, z: -0.06 });
    cyl(g, "#d9a066", 0.07, 0.08, { y: -0.78 });
    cyl(g, this.players[i].char.color, 0.085, 0.14, { y: -0.18 });
  }

  private makeCross(color: string) {
    const g = new THREE.Group();
    const mk = (geo: THREE.BufferGeometry, col: string, op = 1) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthTest: false, depthWrite: false }));
      m.renderOrder = 10;
      return m;
    };
    const ringGeo = new THREE.RingGeometry(0.34, 0.48, 32);
    const ring = mk(ringGeo, color);
    g.add(ring);
    const outline = mk(new THREE.RingGeometry(0.48, 0.54, 32), "#1d1630", 0.8);
    outline.renderOrder = 9;
    g.add(outline);
    const inner = mk(new THREE.RingGeometry(0.28, 0.34, 32), "#1d1630", 0.8);
    inner.renderOrder = 9;
    g.add(inner);
    for (let k = 0; k < 4; k++) {
      const bar = mk(GEO.plane, "#ffffff");
      bar.scale.set(0.07, 0.3, 1);
      const a = (k / 4) * Math.PI * 2;
      bar.position.set(Math.sin(a) * 0.5, Math.cos(a) * 0.5, 0);
      bar.rotation.z = -a;
      g.add(bar);
    }
    const dot = mk(GEO.circle, color);
    dot.scale.setScalar(0.07);
    g.add(dot);
    this.scene.add(g);
    return g;
  }

  /** The crosshair in the world. */
  private crossPos(s: Shooter, out = new THREE.Vector3()) {
    return out.set(s.cx, s.cy, AIM_Z);
  }
  /** Where the line of sight through a crosshair meets the plane z. */
  private sightAt(cx: number, cy: number, z: number, out = this.ray) {
    const k = (z - EYE.z) / (AIM_Z - EYE.z);
    return out.set(EYE.x + (cx - EYE.x) * k, EYE.y + (cy - EYE.y) * k, z);
  }
  /** The crosshair position that puts a world point under the sight. */
  private aimFor(x: number, y: number, z: number) {
    const k = (AIM_Z - EYE.z) / (z - EYE.z);
    return { x: EYE.x + (x - EYE.x) * k, y: EYE.y + (y - EYE.y) * k };
  }
  /** The target under a crosshair (nearest rail first), or null. */
  private under(cx: number, cy: number): Target | null {
    let best: Target | null = null,
      bestZ = -Infinity,
      bestD = Infinity;
    for (const t of this.targets) {
      if (t.dead || t.hitT > 0) continue;
      const r = this.rows[t.row];
      const p = this.sightAt(cx, cy, r.z);
      const d = Math.hypot(p.x - t.x, p.y - r.y);
      if (d > RAD[t.kind]) continue;
      if (r.z > bestZ || (r.z === bestZ && d < bestD)) {
        best = t;
        bestZ = r.z;
        bestD = d;
      }
    }
    return best;
  }

  private fire(i: number) {
    const s = this.sh[i];
    const p = this.players[i];
    s.cd = COOLDOWN;
    s.kick = 1;
    this.sound("pop");
    const a = this.avatars[i];
    a.flash();
    const t = this.under(s.cx, s.cy);
    // the cork flies from the gun to what it hits (or the backdrop)
    const from = new THREE.Vector3(s.ax + 0.25, 1.25, AV_Z - 1.0);
    const to = t ? new THREE.Vector3(t.x, this.rows[t.row].y, this.rows[t.row].z + 0.3) : this.sightAt(s.cx, s.cy, -8.1).clone();
    const m = new THREE.Mesh(this.corkGeo, this.corkMat);
    m.rotation.x = Math.PI / 2;
    this.scene.add(m);
    this.corks.push({ m, from, to, t: 0, life: 0.12 });
    if (!t) return;
    const v = VALUE[t.kind];
    t.hitT = 0.0001;
    const at = new THREE.Vector3(t.x, this.rows[t.row].y, this.rows[t.row].z);
    if (v < 0) {
      s.score = Math.max(0, s.score + v);
      this.fx.explosion(at, 1.8);
      this.sound("explode");
      this.shake = 0.35;
      this.buzz(i, [80, 40, 80]);
      this.hud.pop(at.clone().setY(at.y + 0.9), "−3", "#ff5a4e", this.camera);
      t.g.visible = false;
    } else {
      s.score += v;
      const cols = t.kind === "gold" ? ["#ffe14a", "#ffffff", "#ffc928"] : t.kind === "star" ? ["#ff9a2e", "#ffe14a", p.char.color] : ["#ffd23f", "#ffffff", p.char.color];
      this.fx.burst(at, { count: t.kind === "gold" ? 26 : 14, colors: cols, speed: 5, up: 2, size: 0.15, life: 0.6 });
      this.sound(t.kind === "gold" ? "coins" : t.kind === "star" ? "ding" : "hit");
      if (t.kind === "gold") {
        this.fx.confetti(at, 20);
        this.buzz(i, 50);
      } else this.buzz(i, 20);
      this.hud.pop(at.clone().setY(at.y + 0.9), `+${v}`, t.kind === "gold" ? "#ffe14a" : p.char.color, this.camera);
    }
    this.hud.setScore(p.seat, this.scoreHtml(s.score));
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    const s = this.sh[i];
    const lv = this.players[i].level;
    const st = this.cpuAim[i];
    let t = st.t;
    if (t && (t.dead || t.hitT > 0 || Math.abs(t.x) > HALF - 0.8)) t = null;
    if (!t) {
      // choose: value over the time to get the sight there; smart CPUs avoid what rivals aim at
      st.wait -= dt;
      if (st.wait > 0) return {};
      let best: Target | null = null,
        bestS = 0;
      for (const c of this.targets) {
        if (c.dead || c.hitT > 0 || c.kind === "bomb") continue;
        const r = this.rows[c.row];
        const lead = r.dir * r.speed * (this.hurry ? 1.25 : 1);
        const aim = this.aimFor(c.x + lead * 0.5, r.y, r.z);
        if (Math.abs(aim.x) > AIM_X - 0.3) continue;
        const d = Math.hypot(aim.x - s.cx, aim.y - s.cy);
        const eta = d / CROSS_SPEED + 0.25;
        // it will leave the gallery before we get there
        const remain = (HALF - 0.8 - c.x * r.dir) / r.speed;
        if (remain < eta + 0.3) continue;
        let taken = 1;
        for (let j = 0; j < this.sh.length; j++) if (j !== i && this.cpuAim[j].t === c) taken *= 1 - 0.6 * lv;
        const v = VALUE[c.kind];
        const sc = (Math.pow(v, 0.6 + 0.6 * lv) / (eta + 0.3)) * taken * (0.75 + Math.random() * 0.5);
        if (sc > bestS) {
          bestS = sc;
          best = c;
        }
      }
      st.t = t = best;
      st.jx = (Math.random() - 0.5) * (1 - lv) * 0.7;
      st.jy = (Math.random() - 0.5) * (1 - lv) * 0.5;
      this.cpuReset(i, "fire");
      if (!t) return {};
    }
    const r = this.rows[t.row];
    const sp = r.speed * (this.hurry ? 1.25 : 1);
    // lead: where it will be by the time the sight gets there (good CPUs lead better)
    const aimNow = this.aimFor(t.x, r.y, r.z);
    const dist = Math.hypot(aimNow.x - s.cx, aimNow.y - s.cy);
    const leadT = (dist / CROSS_SPEED) * (0.4 + 0.6 * lv);
    const goal = this.aimFor(t.x + r.dir * sp * leadT, r.y, r.z);
    goal.x += st.jx;
    goal.y += st.jy;
    const dx = goal.x - s.cx,
      dy = goal.y - s.cy;
    // stick: proportional with a little overshoot for the weaker ones
    const gain = 3.2 + 2.5 * lv;
    let sx = (dx * gain) / CROSS_SPEED + (r.dir * sp) / CROSS_SPEED,
      sy = (-dy * gain) / CROSS_SPEED;
    const l = Math.hypot(sx, sy);
    if (l > 1) {
      sx /= l;
      sy /= l;
    }
    // fire when the sight is on it (after a reaction time)
    let a = false;
    const onIt = this.under(s.cx, s.cy);
    if (onIt === t && s.cd <= 0) {
      if (this.cpuAfter(i, "fire", 0.22 - 0.17 * lv)) {
        a = true;
        this.cpuReset(i, "fire");
        st.t = null;
        st.wait = 0.1 + (1 - lv) * 0.35;
      }
    } else if (onIt && onIt.kind === "bomb") {
      // a beginner may fire at the wrong thing in a hurry
      if (s.cd <= 0 && Math.random() < dt * 1.2 * (1 - lv)) a = true;
    } else if (s.cd <= 0 && dist < 1.2 && Math.random() < dt * 2.2 * (1 - lv)) {
      // a hasty shot
      a = true;
    }
    return { x: sx, y: sy, a };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.decor(dt);
    this.moveTargets(dt * 0.6);
    this.moveCam(EYE, LOOK, dt, 2.2);
    for (const s of this.sh) s.cross.position.copy(this.crossPos(s));
  }

  private decor(dt: number) {
    this.bulbT += dt;
    if (this.bulbT > 0.16) {
      this.bulbT = 0;
      const ph = Math.floor(this.t * 6 + performance.now() / 160);
      const c1 = new THREE.Color("#fff3a0"),
        c2 = new THREE.Color("#ff7a3a"),
        c3 = new THREE.Color("#ff4bd2");
      for (let k = 0; k < this.bulbCount; k++) this.bulbs.setColorAt(k, (k + ph) % 3 === 0 ? c2 : (k + ph) % 3 === 1 ? c1 : c3);
      if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
    }
    this.wheel.rotation.z += dt * 0.15;
  }

  private moveTargets(dt: number) {
    const k = this.hurry ? 1.25 : 1;
    for (const t of this.targets) {
      if (t.dead) continue;
      const r = this.rows[t.row];
      t.bob += dt;
      if (t.hitT > 0) {
        // knocked over backwards, then gone
        t.hitT += dt;
        t.g.rotation.x = -Math.min(1.5, t.hitT * 9);
        t.g.position.y = r.y - Math.max(0, t.hitT - 0.15) * 4;
        if (t.hitT > 0.5) this.removeTarget(t);
        continue;
      }
      t.x += r.dir * r.speed * k * dt;
      t.g.position.x = t.x;
      if (t.kind === "duck") {
        t.g.position.y = r.y + Math.abs(Math.sin(t.bob * 5)) * 0.08;
        t.g.rotation.z = Math.sin(t.bob * 5) * 0.08;
      } else if (t.kind === "star") t.g.rotation.z = Math.sin(t.bob * 2.4) * 0.25;
      else if (t.kind === "gold") {
        const h = t.g.getObjectByName("halo");
        if (h) h.scale.setScalar(0.62 + Math.sin(t.bob * 8) * 0.06);
        const c = t.g.getObjectByName("coin");
        if (c) c.rotation.y = Math.sin(t.bob * 3) * 0.5;
      } else {
        const sp = t.g.getObjectByName("spark");
        if (sp) sp.scale.setScalar(Math.sin(t.bob * 20) > 0 ? 0.16 : 0.09);
      }
      if (t.x * r.dir > HALF) this.removeTarget(t);
    }
    this.targets = this.targets.filter((t) => !t.dead);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.decor(dt);
    this.moveCam(EYE, LOOK, dt, 3);
    if (!this.hurry && left <= 10) {
      this.hurry = true;
      this.hud.banner(T("FINAL STRETCH!", "最后冲刺！"), { color: "#ffd23f", sub: T("The targets speed up…", "靶子加速了……"), size: 7 });
      music.speed(1.18);
      this.sound("bell");
      this.rows.forEach((r) => (r.every *= 0.8));
    }
    // the rails
    this.rows.forEach((r, ri) => {
      r.next -= dt;
      if (r.next <= 0) {
        this.spawnTarget(ri);
        r.next = r.every * (0.75 + this.rnd() * 0.6);
      }
    });
    this.moveTargets(dt);

    // the shooters
    this.sh.forEach((s, i) => {
      const p = this.pad(i);
      const a = this.avatars[i];
      s.cd -= dt;
      const k = 1 - Math.exp(-16 * dt);
      s.vx += (p.x * CROSS_SPEED - s.vx) * k;
      s.vy += (-p.y * CROSS_SPEED - s.vy) * k;
      s.cx = clamp(s.cx + s.vx * dt, -AIM_X, AIM_X);
      s.cy = clamp(s.cy + s.vy * dt, AIM_Y0, AIM_Y1);
      if (p.aDown && s.cd <= 0) this.fire(i);
      s.kick = Math.max(0, s.kick - dt * 6);
      s.cross.position.copy(this.crossPos(s));
      s.cross.scale.setScalar(1 + s.kick * 0.35);
      s.cross.rotation.z = s.kick * 0.5;
      (s.ring.material as THREE.MeshBasicMaterial).opacity = s.cd > 0 ? 0.55 : 1;
      // the avatar aims at its sight
      const tgt = this.sightAt(s.cx, s.cy, -6);
      a.yaw = Math.atan2(tgt.x - s.ax, tgt.z - AV_Z);
      a.anim = "hold";
      a.pos.z = AV_Z + s.kick * 0.12;
    });

    // corks in flight
    this.corks = this.corks.filter((c) => {
      c.t += dt;
      const k = Math.min(1, c.t / c.life);
      c.m.position.lerpVectors(c.from, c.to, k);
      c.m.position.y += Math.sin(k * Math.PI) * 0.25;
      if (k >= 1) {
        c.m.removeFromParent();
        this.fx.burst(c.to, { count: 4, colors: ["#d9a066", "#8a5a32"], speed: 2, size: 0.07, life: 0.3 });
        return false;
      }
      return true;
    });

    if (left <= 0) this.finishByScore(this.sh.map((s) => s.score));
  }

  protected outroStep(dt: number) {
    this.decor(dt);
    this.moveTargets(dt);
    for (const s of this.sh) s.cross.visible = false;
  }

  protected celebrate(res: { place: number[] }) {
    // turn around to face the camera for the cheers
    this.avatars.forEach((a, i) => {
      a.yaw = 0;
      a.anim = res.place[i] === 1 ? "win" : "lose";
    });
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.corkGeo.dispose();
    super.dispose();
  }
}

const def: MiniDef = {
  id: "stand-tir",
  name: "Target Fair",
  icon: "🎯",
  color: "#ff4b8b",
  tagline: "Aim and fire at the fairground targets.",
  rules: "Move your sight and fire corks: duck +1, star +2, small gold ⓩ target +5. Don't hit the bombs: −3!",
  controls: { stick: "Aim", a: "Fire" },
  modes: ["ffa"],
  length: 40,
  music: "mini3",
  create: (ctx) => new StandTir(ctx),
};
export default def;
