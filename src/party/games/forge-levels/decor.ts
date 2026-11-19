/**
 * FORGERY GAP's world round the course, per level (forge.ts builds the course and the twists): the
 * light, the backdrop, the pads' dressing and the things that move in the distance. Repeated pieces
 * are instanced (one draw each); everything moving is updated in place (no allocations per frame).
 *
 * - SKYWAY: the city far below (its blocks, streets and traffic), the sky all round with its sun,
 *   drifting clouds, hot-air balloons, the ZSTREET blimp, birds.
 * - SPROUT RUINS: a night sea under the field, the moon and the stars, the old Sprout vault's rocks and
 *   columns standing in the water, broken columns bobbing on floating rubble, fog banks sliding under
 *   the field, embers rising, a shooting star now and then, flickering lanterns.
 * - HALO SPIRE: the city far below at sunset, a low sun in the sky, drifting clouds, the tower's
 *   glass face with its crown, pennants and blinking mast, a helicopter hovering by the helipad, gulls.
 * - Every pad: a tiled floor, bollards with lights, garlands of pennants over each stretch's entry,
 *   crates stacked in the corners.
 */
import * as THREE from "three";
import { GEO, block, canvasTex, glow, label, outline, skyDome, skyline, toon, toonSteps, type World } from "../../k3";
import { rng } from "../../kit";
import { liquid } from "../tiles-levels/liquid";
import { city } from "./city";
import type { ForgeLevel, Layout } from "./levels";

const M = new THREE.Matrix4();
const P = new THREE.Vector3();
const S = new THREE.Vector3();
const Q = new THREE.Quaternion();
const Q2 = new THREE.Quaternion();
const E = new THREE.Euler();
const C = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const XAX = new THREE.Vector3(1, 0, 0);
/** SPROUT RUINS: the sea's height under the field (the net hangs at −11). */
const SEA_Y = -27;

/** An instanced mesh in the scene (never raycast; `moving`: no culling, its bounds go stale). */
function inst(scene: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, n: number, moving = false) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.raycast = () => {};
  if (moving) m.frustumCulled = false;
  scene.add(m);
  return m;
}

/** A soft round blob (a fog bank, a glow): white, its alpha fading out. */
function softTex() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,0.9)");
    gr.addColorStop(0.5, "rgba(255,255,255,0.45)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/** A bird or a gull: a flat V (two wings, flapped by the instance's matrix). */
function birdGeo() {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([0, 0, 0.18, -0.9, 0.25, -0.1, 0, 0, -0.18, 0, 0, 0.18, 0.9, 0.25, -0.1, 0, 0, -0.18]);
  g.setAttribute("position", new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** A pennant: a small triangle hanging from its top edge. */
function pennantGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.2, 0);
  s.lineTo(0.2, 0);
  s.lineTo(0, -0.42);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

/** Things that drift: base positions and sizes, a speed (one entry per instance). */
interface Drift {
  m: THREE.InstancedMesh;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  sx: Float32Array;
  sy: Float32Array;
  sz: Float32Array;
  v: Float32Array;
  /** How far it drifts before it wraps round (m, along x from its middle). */
  span: number;
  cx: number;
}

export class Decor {
  private t = 0;
  private drifts: Drift[] = [];
  // SKYWAY
  private balloons: { env: THREE.InstancedMesh; ink: THREE.InstancedMesh; band: THREE.InstancedMesh; basket: THREE.InstancedMesh; a: Float32Array; r: Float32Array; y: Float32Array } | null = null;
  private blimp: THREE.Group | null = null;
  // birds and gulls: a flock circling
  private flock: { m: THREE.InstancedMesh; a: Float32Array; r: Float32Array; y: Float32Array; ph: Float32Array; cx: number; cz: number; w: number } | null = null;
  /** The sky (it drifts round), the city's traffic, the sea's clock. */
  private dome: THREE.Mesh | null = null;
  private town: { update(time: number): void } | null = null;
  private seaT: { value: number } | null = null;
  /** The scenery's own dice (never the game's). */
  private R = rng(0x51ee);
  // SPROUT RUINS
  private rubble: { cols: THREE.InstancedMesh; rocks: THREE.InstancedMesh; x: Float32Array; y: Float32Array; z: Float32Array; h: Float32Array; rx: Float32Array; ry: Float32Array; rz: Float32Array; rw: Float32Array; rh: Float32Array; rd: Float32Array; ra: Float32Array } | null = null;
  private embers: { m: THREE.InstancedMesh; x: Float32Array; y: Float32Array; z: Float32Array; v: Float32Array; ph: Float32Array } | null = null;
  private star: { m: THREE.Mesh; life: number; next: number; vx: number; vy: number } | null = null;
  // HALO SPIRE
  private heli: { g: THREE.Group; rotor: THREE.Object3D; tail: THREE.Object3D; x: number; y: number; z: number } | null = null;
  private beacon: THREE.Mesh | null = null;
  // the pads
  private caps: THREE.InstancedMesh | null = null;
  private capCol: THREE.Color[] = [];
  private flags: { m: THREE.InstancedMesh; x: Float32Array; y: Float32Array; z: Float32Array; yaw: Float32Array; crown: Uint8Array } | null = null;

  constructor(
    private w: World,
    private lv: ForgeLevel,
    private L: Layout,
    private xAt: (p: number) => number,
    private yAt: (p: number) => number,
  ) {
    const cr = rng(4242);
    this.light();
    if (lv.lamp) this.ruins(cr);
    else if (lv.gust) this.spire(cr);
    else this.sky(cr);
    this.pads();
  }

  // ---- the light ---------------------------------------------------------------------------------

  private light() {
    const l = this.lv.light;
    if (!l) return;
    const { sun, hemi } = this.w;
    sun.color.set(l.sun[0]);
    sun.intensity = l.sun[1];
    sun.position.set(l.sunAt[0], l.sunAt[1], l.sunAt[2]);
    hemi.color.set(l.hemi[0]);
    hemi.groundColor.set(l.hemi[1]);
    hemi.intensity = l.hemi[2];
  }

  /** Puffy clouds (one draw) that drift along x. */
  private clouds(cr: () => number, n: number, low: number, color: string, yLow: [number, number], yHigh: [number, number]) {
    const m = inst(this.w.scene, GEO.box, glow(color), n, true);
    const d: Drift = { m, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), sx: new Float32Array(n), sy: new Float32Array(n), sz: new Float32Array(n), v: new Float32Array(n), span: 120, cx: 0 };
    for (let i = 0; i < n; i++) {
      const lo = i < low;
      const a = cr() * Math.PI * 2;
      const r = lo ? 18 + cr() * 60 : 50 + cr() * 60;
      d.x[i] = Math.cos(a) * r;
      d.z[i] = -22 + Math.sin(a) * r * 1.2;
      d.y[i] = lo ? yLow[0] - cr() * yLow[1] : yHigh[0] + cr() * yHigh[1];
      d.sx[i] = 5 + cr() * 9;
      d.sy[i] = 2 + cr() * 2.5;
      d.sz[i] = 4 + cr() * 6;
      d.v[i] = 0.5 + ((i * 37) % 10) * 0.12;
    }
    this.drifts.push(d);
    return d;
  }

  // ---- SKYWAY ------------------------------------------------------------------------------------

  private sky(cr: () => number) {
    const s = this.w.scene;
    const mid = -this.L.end / 2;
    // the sky all round (a horizon in the intro and from the card's camera): its sun, its clouds, the haze over the far towers
    this.dome = skyDome(s, { sky: this.lv.sky, ground: this.lv.sky[1], clouds: 18, disc: { az: 208, el: 34, color: "#fff6c8", size: 9, glow: 5 }, haze: 0.5, rnd: cr });
    // the city under the field: blocks of towers, their streets, the traffic (the net and the Tracker's rig stay clear of the roofs)
    this.town = city(s, {
      y: -64,
      z: mid,
      n: 12,
      pitch: 17,
      top: () => -24,
      h: [8, 26, 30],
      walls: ["#e9dccb", "#c9d6e6", "#f2c9a0", "#b9c7d8", "#ddd0f0", "#f0e6d0", "#f4b8a8"],
      lot: "#cfc6b6",
      road: "#7c8298",
      line: "#f4f0e6",
      park: "#86cf6a",
      rnd: cr,
    });
    skyline(s, { r: 215, n: 110, y: -64, rnd: cr, tall: 1.6 });
    this.clouds(cr, 46, 30, "#ffffff", [-28, 12], [30, 18]);
    // hot-air balloons: envelope, ink, a white band, a basket (four draws)
    const n = 6;
    const env = inst(s, GEO.ball, toon("#ffffff"), n, true);
    const ink = inst(s, GEO.ball, new THREE.MeshBasicMaterial({ color: "#15101f", side: THREE.BackSide }), n, true);
    const band = inst(s, GEO.cyl, toon("#ffffff"), n, true);
    const basket = inst(s, GEO.box, toon("#9a5f2e"), n, true);
    const pal = ["#ff5fa2", "#ffd23f", "#3ec6ff", "#8ee35b", "#b48cff", "#ff8a3d"];
    const b = { env, ink, band, basket, a: new Float32Array(n), r: new Float32Array(n), y: new Float32Array(n) };
    // (along both sides of the course, in view of the play camera: a = progress, r = side offset)
    for (let i = 0; i < n; i++) {
      env.setColorAt(i, C.set(pal[i]));
      band.setColorAt(i, C.set(i % 2 ? "#ffffff" : "#2b1d6b"));
      b.a[i] = 4 + (i / n) * (this.L.end + 4);
      b.r[i] = (i % 2 ? 1 : -1) * (17 + ((i * 5) % 3) * 3.5);
      b.y[i] = -3 + ((i * 7) % 4) * 2.6;
    }
    this.balloons = b;
    // the blimp, its fins and gondola, ZSTREET on both flanks
    const g = new THREE.Group();
    const body = new THREE.Mesh(GEO.ball, toon("#f2eefe"));
    body.scale.set(11, 3.6, 3.6);
    outline(body, 0.06);
    g.add(body);
    for (const [y, z, w, h] of [
      [1.4, 0, 0.3, 2.2],
      [-1.4, 0, 0.3, 2.2],
      [0, 1.4, 2.2, 0.3],
      [0, -1.4, 2.2, 0.3],
    ]) {
      const f = block("#ff6b35", 1.8, h === 2.2 ? 2.2 : 0.3, w === 2.2 ? 2.2 : 0.3, -5.2, y, z, g);
      void f;
    }
    outline(block("#2b1d6b", 2.4, 0.8, 1.1, 0.6, -2.1, 0, g), 0.04);
    for (const sd of [-1, 1]) {
      const name = label("ZSTREET", 1.3, "#ff4fd8");
      name.position.set(0.4, 0.2, sd * 1.86);
      if (sd < 0) name.rotation.y = Math.PI;
      g.add(name);
    }
    g.position.set(0, 22, mid);
    s.add(g);
    this.blimp = g;
    this.makeFlock(12, "#3b2a5a", 0, mid, 19, 6, 0.2);
  }

  // ---- SPROUT RUINS ------------------------------------------------------------------------------

  private ruins(cr: () => number) {
    const s = this.w.scene;
    const end = this.L.end;
    const lv = this.lv;
    // the night all round: the moon on the lighthouse's far side, the stars, the milky band
    this.dome = skyDome(s, { sky: lv.sky, ground: lv.sky[1], stars: 720, band: true, disc: { az: 200, el: 34, moon: true, color: "#fff4d6", size: 9, glow: 4 }, haze: 0.5, rnd: cr });
    // the sea under the field: a dark swell, the moon's foam on its crests (the fog takes it a little way out)
    this.seaT = liquid(s, { kind: "sea", y: SEA_Y, deep: "#080d2a", mid: "#1a2e66", hot: "#3f6cff", foam: "#9fbcf0", fog: lv.sky[1], cell: 0.8, near: lv.fog[0] + 8, far: lv.fog[1] + 60, glow: 0.35 });
    skyline(s, { r: 150, n: 64, y: SEA_Y - 6, rnd: cr, night: true, tall: 1.1 });
    // the old vault's bones in the water: rocks with broken columns on them, both sides of the field
    // (two draws); the lighthouse's rock goes down to the sea
    const nk = 22;
    const rock = inst(s, GEO.box, toon("#343048"), nk * 2 + 2);
    const pill = inst(s, GEO.box, toon("#767c9e"), nk * 2);
    for (let i = 0; i < nk; i++) {
      const sd = i % 2 ? 1 : -1;
      const p = -10 + (i / nk) * (end + 26) + cr() * 3;
      const x = this.xAt(Math.max(0, Math.min(end, p))) + sd * (20 + cr() * 26),
        z = -p;
      const w = 4 + cr() * 5,
        h = 3 + cr() * 7;
      M.compose(P.set(x, SEA_Y + h / 2 - 1, z), Q.setFromAxisAngle(UP, cr() * 3), S.set(w, h, w * (0.7 + cr() * 0.5)));
      rock.setMatrixAt(i * 2, M);
      M.compose(P.set(x + w * 0.5, SEA_Y + h * 0.2, z + w * 0.3), Q.setFromAxisAngle(UP, cr() * 3), S.set(w * 0.7, h * 0.5, w * 0.6));
      rock.setMatrixAt(i * 2 + 1, M);
      // (a column standing, one fallen across the rock)
      const ch = 3 + cr() * 6;
      M.compose(P.set(x - w * 0.15, SEA_Y + h - 1 + ch / 2, z), Q.setFromAxisAngle(XAX, (cr() - 0.5) * 0.14), S.set(1.1, ch, 1.1));
      pill.setMatrixAt(i * 2, M);
      E.set(Math.PI / 2, cr() * 3, 0.08);
      M.compose(P.set(x + w * 0.2, SEA_Y + h - 0.5, z + 0.6), Q.setFromEuler(E), S.set(0.95, 2.5 + cr() * 2, 0.95));
      pill.setMatrixAt(i * 2 + 1, M);
    }
    const lx = this.xAt(end * 0.5) - 17,
      lz = -end * 0.5;
    M.compose(P.set(lx, (SEA_Y - 11) / 2, lz), Q.identity(), S.set(5, 11 - SEA_Y, 5));
    rock.setMatrixAt(nk * 2, M);
    M.compose(P.set(lx + 1.5, SEA_Y + 3, lz + 2), Q.setFromAxisAngle(UP, 0.5), S.set(8, 8, 7));
    rock.setMatrixAt(nk * 2 + 1, M);
    // broken columns on floating rubble round the field, bobbing (two draws)
    const n = 26;
    const R = {
      cols: inst(s, GEO.box, toon("#6a6f8e"), n, true),
      rocks: inst(s, GEO.box, toon("#3b3550"), n, true),
      x: new Float32Array(n),
      y: new Float32Array(n),
      z: new Float32Array(n),
      h: new Float32Array(n),
      rx: new Float32Array(n),
      ry: new Float32Array(n),
      rz: new Float32Array(n),
      rw: new Float32Array(n),
      rh: new Float32Array(n),
      rd: new Float32Array(n),
      ra: new Float32Array(n),
    };
    for (let i = 0; i < n; i++) {
      const sd = i % 2 ? 1 : -1;
      const p = -4 + (i / n) * (end + 10) + cr() * 2;
      R.x[i] = this.xAt(p) + sd * (11 + cr() * 12);
      R.y[i] = -3 - cr() * 9;
      R.z[i] = -p;
      R.h[i] = 2 + cr() * 7;
      R.rx[i] = (cr() - 0.5) * 0.25;
      R.ry[i] = cr() * 1.5;
      R.rz[i] = (cr() - 0.5) * 0.3;
      R.ra[i] = cr();
      R.rw[i] = 3 + cr() * 2.5;
      R.rh[i] = 1.2 + cr();
      R.rd[i] = 3 + cr() * 2.5;
    }
    this.rubble = R;
    // fog banks sliding under the field (one draw)
    const nf = 10;
    const fog = inst(s, GEO.plane, new THREE.MeshBasicMaterial({ map: softTex(), color: "#8090d8", transparent: true, opacity: 0.42, depthWrite: false }), nf, true);
    const fd: Drift = { m: fog, x: new Float32Array(nf), y: new Float32Array(nf), z: new Float32Array(nf), sx: new Float32Array(nf), sy: new Float32Array(nf), sz: new Float32Array(nf), v: new Float32Array(nf), span: 34, cx: 0 };
    for (let i = 0; i < nf; i++) {
      fd.x[i] = (cr() - 0.5) * 60;
      fd.y[i] = -2.6 - cr() * 3;
      fd.z[i] = 4 - (i / nf) * (end + 14);
      fd.sx[i] = 18 + cr() * 14;
      fd.sy[i] = 12 + cr() * 8;
      fd.sz[i] = 1;
      fd.v[i] = (i % 2 ? 1 : -1) * (0.5 + cr() * 0.6);
    }
    this.drifts.push(fd);
    // embers rising round the field (one draw)
    const ne = 44;
    const em = { m: inst(s, GEO.box, glow("#ffffff", 0.9, true), ne, true), x: new Float32Array(ne), y: new Float32Array(ne), z: new Float32Array(ne), v: new Float32Array(ne), ph: new Float32Array(ne) };
    for (let i = 0; i < ne; i++) {
      const p = -4 + cr() * (end + 10);
      em.x[i] = this.xAt(p) + (i % 2 ? 1 : -1) * (6 + cr() * 12);
      em.y[i] = -7 + cr() * 14;
      em.z[i] = -p;
      em.v[i] = 0.4 + cr() * 0.7;
      em.ph[i] = cr() * 7;
      em.m.setColorAt(i, C.set(i % 3 ? "#ffb347" : "#7fe0ff"));
    }
    this.embers = em;
    // a shooting star now and then
    const sm = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#ffffff", fog: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    sm.visible = false;
    s.add(sm);
    this.star = { m: sm, life: -1, next: 3 + cr() * 4, vx: 0, vy: 0 };
  }

  // ---- HALO SPIRE --------------------------------------------------------------------------------

  private spire(cr: () => number) {
    const s = this.w.scene;
    const { pads, end } = this.L;
    const lv = this.lv;
    // the sunset all round: the sun low ahead on the left, long warm clouds, the haze over the far towers
    this.dome = skyDome(s, { sky: lv.sky, ground: lv.sky[1], clouds: 16, cloud: "#ffe9dc", cloudShade: "#e88a6a", disc: { az: 303, el: 11, color: "#ffd08a", size: 13, glow: 5 }, haze: 0.55, rnd: cr });
    // the city at the tower's foot, a long way down: its blocks, its streets, the evening traffic
    this.town = city(s, {
      y: -96,
      z: -end / 2,
      n: 12,
      pitch: 17,
      top: () => -44,
      h: [10, 30, 34],
      walls: ["#e8c8b0", "#d8b0a0", "#c8a8c0", "#f0d0a8", "#b8a0c8", "#e0b890"],
      lot: "#c4a48c",
      road: "#6a5a7a",
      line: "#f0d8c0",
      park: "#7aa860",
      rnd: cr,
    });
    skyline(s, { r: 225, n: 110, y: -96, rnd: cr, tall: 1.8 });
    this.clouds(cr, 40, 28, "#ffe6dc", [-26, 16], [34, 18]);
    // the tower: a glass face of lit windows (one textured block), its crown, its mast and beacon, its name
    const top = pads[3].y + 1.2;
    const depth = end + lv.finD + lv.startD + 26;
    const zc = -(end + lv.finD - lv.startD) / 2 - 4;
    // (its glass: big clean panes, four by four on a tile, a floor line under each row: crisp from the stair and from far off)
    const wtex = canvasTex(
      256,
      256,
      (g) => {
        g.fillStyle = "#4d62a4";
        g.fillRect(0, 0, 256, 256);
        for (let j = 0; j < 4; j++)
          for (let i = 0; i < 4; i++) {
            const lit = (i * 7 + j * 3 + ((i * j) % 3)) % 5 < 2;
            g.fillStyle = lit ? "#ffd99a" : "#8fb8f4";
            g.fillRect(i * 64 + 8, j * 64 + 10, 48, 42);
            g.fillStyle = lit ? "#fff0c8" : "#b4d2ff";
            g.fillRect(i * 64 + 8, j * 64 + 10, 48, 6);
          }
        g.fillStyle = "#3a4c86";
        for (let j = 0; j < 4; j++) g.fillRect(0, j * 64 + 58, 256, 6);
      },
      true,
    );
    wtex.anisotropy = 16;
    wtex.repeat.set(depth / 12, 110 / 12);
    const face = new THREE.Mesh(GEO.box, new THREE.MeshToonMaterial({ map: wtex, gradientMap: toonSteps() }));
    face.scale.set(16, 110, depth);
    const fx = pads[1].ox + pads[1].w / 2 + 12;
    face.position.set(fx, top - 55, zc);
    s.add(face);
    // (white ribs up the glass: one draw)
    const nr = 9;
    const ribs = inst(s, GEO.box, toon("#eef0fa"), nr);
    for (let i = 0; i < nr; i++) {
      M.compose(P.set(fx - 8.05, top - 55, zc - depth / 2 + (i + 0.5) * (depth / nr)), Q.identity(), S.set(0.35, 110, 0.6));
      ribs.setMatrixAt(i, M);
    }
    outline(block("#e8ecf8", 17, 1.6, depth + 1, fx, top + 0.8, zc, s), 0.08);
    outline(block("#c9cfe0", 0.5, 14, 0.5, fx, top + 8, -(end + 2), s), 0.05);
    const beacon = new THREE.Mesh(GEO.ball, glow("#ff3355"));
    beacon.scale.setScalar(0.9);
    beacon.position.set(fx, top + 15.2, -(end + 2));
    s.add(beacon);
    this.beacon = beacon;
    const name = label("HALO", 3.2, "#ffffff", "#c94f7a");
    name.scale.set(11, 3.2, 1);
    name.position.set(fx - 8.06, top - 3.2, zc + depth * 0.25);
    name.rotation.y = -Math.PI / 2;
    s.add(name);
    // the helicopter hovering off the helipad: body, glass, boom, rotor, tail rotor, skids
    const fp = pads[3];
    const g = new THREE.Group();
    const body = new THREE.Mesh(GEO.ball, toon("#e8463c"));
    body.scale.set(2.2, 1.9, 3.6);
    outline(body, 0.05);
    g.add(body);
    const glass = new THREE.Mesh(GEO.ball, toon("#9fe0ff", "#1d4f86"));
    glass.scale.set(1.7, 1.2, 1.6);
    glass.position.set(0, 0.25, 1.15);
    g.add(glass);
    outline(block("#e8463c", 0.45, 0.45, 3.4, 0, 0.35, -2.9, g), 0.04);
    block("#ffd23f", 0.15, 1.2, 0.8, 0, 0.9, -4.4, g);
    const rotor = new THREE.Group();
    rotor.position.y = 1.25;
    block("#2b1d6b", 7.5, 0.08, 0.35, 0, 0, 0, rotor);
    block("#2b1d6b", 0.35, 0.08, 7.5, 0, 0, 0, rotor);
    g.add(rotor);
    const tail = new THREE.Group();
    tail.position.set(0.3, 0.9, -4.4);
    block("#2b1d6b", 0.06, 1.6, 0.22, 0, 0, 0, tail);
    g.add(tail);
    for (const sd of [-1, 1]) block("#3a3f55", 0.14, 0.14, 3.2, sd * 0.9, -1.15, 0.1, g);
    s.add(g);
    this.heli = { g, rotor, tail, x: fp.ox - 15, y: fp.y + 6.5, z: -(fp.p0 + 3.5) };
    this.makeFlock(10, "#ffffff", this.xAt(end * 0.5) - 6, -end * 0.5, 22, 7 + this.yAt(end * 0.5), 0.22);
  }

  /** A flock circling round (cx, cz) at about height y, radius r (one draw). */
  private makeFlock(n: number, color: string, cx: number, cz: number, r: number, y: number, w: number) {
    const m = inst(this.w.scene, birdGeo(), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }), n, true);
    const f = { m, a: new Float32Array(n), r: new Float32Array(n), y: new Float32Array(n), ph: new Float32Array(n), cx, cz, w };
    for (let i = 0; i < n; i++) {
      f.a[i] = (i / n) * 1.4 + ((i * 7) % 5) * 0.05;
      f.r[i] = r + ((i * 13) % 7) - 3;
      f.y[i] = y + ((i * 5) % 6) * 0.5;
      f.ph[i] = i * 0.7;
    }
    this.flock = f;
  }

  // ---- the pads ----------------------------------------------------------------------------------

  private pads() {
    const s = this.w.scene;
    const { pads, end } = this.L;
    const lv = this.lv;
    // a tiled floor on each pad (a draw each: no flat empty slabs)
    const ft = canvasTex(
      64,
      64,
      (g) => {
        g.clearRect(0, 0, 64, 64);
        g.strokeStyle = "rgba(255,255,255,0.2)";
        g.lineWidth = 3;
        g.beginPath();
        g.roundRect(5, 5, 54, 54, 10);
        g.stroke();
        g.fillStyle = "rgba(255,255,255,0.14)";
        g.fillRect(28, 28, 8, 8);
      },
      true,
    );
    pads.forEach((pd, k) => {
      const d = pd.p1 - pd.p0;
      const tex = k ? ft.clone() : ft;
      tex.repeat.set(pd.w / 1.25, d / 1.25);
      tex.needsUpdate = true;
      const f = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      f.rotation.x = -Math.PI / 2;
      f.scale.set(pd.w - 0.5, d - 0.5, 1);
      f.position.set(pd.ox, pd.y + 0.012, -(pd.p0 + pd.p1) / 2);
      f.renderOrder = 1;
      s.add(f);
    });
    // bollards along the pads' sides (and the start's back), a light on each (two draws)
    const spots: number[] = [];
    pads.forEach((pd, k) => {
      // (clear of the crates in the start's back corners and the finish's front ones)
      for (const sd of [-1, 1]) for (let p = pd.p0 + (k === 0 ? 1.8 : k === 3 ? 2.1 : 0.6); p <= pd.p1 - (k < 3 ? 1.3 : 1.6); p += 1.6) spots.push(pd.ox + sd * (pd.w / 2 - 0.3), pd.y, -p);
      if (k === 0) for (let x = -pd.w / 2 + 2.7; x <= pd.w / 2 - 2.7; x += 1.9) spots.push(pd.ox + x, pd.y, -(pd.p0 + 0.3));
    });
    const nb = spots.length / 3;
    const posts = inst(s, GEO.box, toon(lv.pylon[0]), nb);
    this.caps = inst(s, GEO.box, glow("#ffffff"), nb, true);
    for (let i = 0; i < nb; i++) {
      const x = spots[i * 3],
        y = spots[i * 3 + 1],
        z = spots[i * 3 + 2];
      M.compose(P.set(x, y + 0.35, z), Q.identity(), S.set(0.22, 0.7, 0.22));
      posts.setMatrixAt(i, M);
      M.compose(P.set(x, y + 0.82, z), Q.setFromAxisAngle(UP, 0.785), S.setScalar(0.26));
      this.caps.setMatrixAt(i, M);
      const c = new THREE.Color(i % 2 ? lv.pylon[1] : lv.pylon[2]);
      this.capCol.push(c);
      this.caps.setColorAt(i, c);
    }
    // crates stacked in the start's back corners and the finish's front ones (two draws: the crates, their ink)
    const crates: number[] = [];
    const stack = (x: number, y: number, z: number, sd: number) => {
      crates.push(x, y + 0.4, z, x - sd * 0.85, y + 0.4, z + 0.1, x - sd * 0.4, y + 1.2, z + 0.05);
    };
    const p0 = pads[0],
      p3 = pads[3];
    for (const sd of [-1, 1]) {
      stack(p0.ox + sd * (p0.w / 2 - 0.75), p0.y, -(p0.p0 + 0.75), sd);
      stack(p3.ox + sd * (p3.w / 2 - 0.75), p3.y, -(p3.p0 + 0.9), sd);
    }
    const ncr = crates.length / 3;
    const cm = inst(s, GEO.box, toon("#ffffff"), ncr);
    const ci = inst(s, GEO.box, new THREE.MeshBasicMaterial({ color: "#15101f", side: THREE.BackSide }), ncr);
    for (let i = 0; i < ncr; i++) {
      Q.setFromAxisAngle(UP, ((i * 37) % 9) * 0.04 - 0.16);
      P.set(crates[i * 3], crates[i * 3 + 1], crates[i * 3 + 2]);
      M.compose(P, Q, S.setScalar(0.8));
      cm.setMatrixAt(i, M);
      M.compose(P, Q, S.setScalar(0.9));
      ci.setMatrixAt(i, M);
      cm.setColorAt(i, C.set(i % 3 === 2 ? "#ffd23f" : lv.segSide[i % 3]));
    }
    // garlands of pennants over each stretch's entry (and, up the spire, along the tower's crown) (one draw)
    const fl: number[] = [];
    const crown: number[] = [];
    for (let k = 0; k < 3; k++) {
      const pd = pads[k];
      const x0 = pd.ox - (pd.w / 2 - 0.35),
        x1 = pd.ox + (pd.w / 2 - 0.35);
      const n = Math.max(6, Math.round((x1 - x0) / 0.75));
      for (let i = 1; i < n; i++) {
        const f = i / n;
        fl.push(x0 + (x1 - x0) * f, pd.y + 2.28 - Math.sin(f * Math.PI) * 0.55, -(pd.p1 - 0.45), 0);
        crown.push(0);
      }
    }
    if (lv.gust) {
      const fx = pads[1].ox + pads[1].w / 2 + 12 - 8.3;
      const top = pads[3].y + 1.2 + 1.6;
      const depth = end + lv.finD + lv.startD + 26;
      const zc = -(end + lv.finD - lv.startD) / 2 - 4;
      for (let i = 0; i < 16; i++) {
        fl.push(fx, top + 0.42, zc - depth / 2 + (i + 0.5) * (depth / 16), Math.PI / 2);
        crown.push(1);
      }
    }
    const nf = fl.length / 4;
    const fm = inst(s, pennantGeo(), new THREE.MeshToonMaterial({ color: "#ffffff", side: THREE.DoubleSide, gradientMap: toonSteps() }), nf, true);
    const F = { m: fm, x: new Float32Array(nf), y: new Float32Array(nf), z: new Float32Array(nf), yaw: new Float32Array(nf), crown: new Uint8Array(crown) };
    const fpal = ["#ff5fa2", "#ffd23f", "#3ec6ff", "#8ee35b", "#ffffff", lv.segSide[1]];
    for (let i = 0; i < nf; i++) {
      F.x[i] = fl[i * 4];
      F.y[i] = fl[i * 4 + 1];
      F.z[i] = fl[i * 4 + 2];
      F.yaw[i] = fl[i * 4 + 3];
      fm.setColorAt(i, C.set(fpal[i % fpal.length]));
    }
    this.flags = F;
  }

  // ---- the life ----------------------------------------------------------------------------------

  /** Every frame (the card and the count too): `wind` the gust now (−1…1, HALO SPIRE). */
  update(dt: number, wind = 0) {
    const t = (this.t += dt);
    for (const d of this.drifts) {
      for (let i = 0; i < d.x.length; i++) {
        let x = d.x[i] + d.v[i] * t;
        x = d.cx + ((((x - d.cx + d.span) % (2 * d.span)) + 2 * d.span) % (2 * d.span)) - d.span;
        if (d.sz[i] === 1) {
          // (a fog bank: flat, breathing a little)
          Q.setFromAxisAngle(XAX, -Math.PI / 2);
          M.compose(P.set(x, d.y[i] + Math.sin(t * 0.4 + i) * 0.3, d.z[i]), Q, S.set(d.sx[i] * (1 + Math.sin(t * 0.3 + i * 2) * 0.06), d.sy[i], 1));
        } else M.compose(P.set(x, d.y[i], d.z[i]), Q.identity(), S.set(d.sx[i], d.sy[i], d.sz[i]));
        d.m.setMatrixAt(i, M);
      }
      d.m.instanceMatrix.needsUpdate = true;
    }
    const b = this.balloons;
    if (b) {
      const span = this.L.end + 12;
      for (let i = 0; i < b.a.length; i++) {
        // (drifting slowly up the course, round again from the start)
        const p = -6 + ((((b.a[i] + t * 0.35 * (i % 2 ? 1 : 0.7)) % span) + span) % span);
        const x = this.xAt(p) + b.r[i] + Math.sin(t * 0.2 + i) * 1.5,
          z = -p,
          y = b.y[i] + Math.sin(t * 0.5 + i * 1.7) * 0.8;
        Q.setFromAxisAngle(UP, t * 0.1 + i);
        M.compose(P.set(x, y, z), Q, S.set(4.4, 5, 4.4));
        b.env.setMatrixAt(i, M);
        M.compose(P, Q, S.set(4.6, 5.2, 4.6));
        b.ink.setMatrixAt(i, M);
        M.compose(P.set(x, y - 0.3, z), Q, S.set(4.5, 0.55, 4.5));
        b.band.setMatrixAt(i, M);
        M.compose(P.set(x, y - 3.6, z), Q, S.set(0.9, 0.7, 0.9));
        b.basket.setMatrixAt(i, M);
      }
      for (const m of [b.env, b.ink, b.band, b.basket]) m.instanceMatrix.needsUpdate = true;
    }
    if (this.blimp) {
      // (cruising up and down the course's right side, turning round at each end)
      const span = this.L.end + 30;
      const u = ((t * 2.2) / span) % 2;
      const k = u < 1 ? u : 2 - u;
      const e = k * k * (3 - 2 * k);
      const p = -12 + e * span;
      this.blimp.position.set(this.xAt(p) + 25, 11 + Math.sin(t * 0.3) * 0.8, -p);
      const dir = u < 1 ? 1 : -1;
      this.blimp.rotation.y += ((dir > 0 ? Math.PI / 2 : -Math.PI / 2) - this.blimp.rotation.y) * Math.min(1, dt * 0.8);
      this.blimp.rotation.z = Math.sin(t * 0.4) * 0.03;
    }
    const f = this.flock;
    if (f) {
      for (let i = 0; i < f.a.length; i++) {
        const a = f.a[i] + t * 0.22;
        const x = f.cx + Math.cos(a) * f.r[i],
          z = f.cz + Math.sin(a) * f.r[i] * 0.7,
          y = f.y[i] + Math.sin(t * 0.8 + f.ph[i]) * 0.6;
        Q.setFromAxisAngle(UP, Math.atan2(-Math.sin(a), Math.cos(a) * 0.7));
        const flap = 0.4 + Math.abs(Math.sin(t * 7 + f.ph[i])) * 1.2;
        M.compose(P.set(x, y, z), Q, S.set(f.w * 4, f.w * 4 * flap, f.w * 4));
        f.m.setMatrixAt(i, M);
      }
      f.m.instanceMatrix.needsUpdate = true;
    }
    if (this.dome) this.dome.rotation.y = t * 0.003;
    this.town?.update(t);
    if (this.seaT) this.seaT.value = t;
    const R = this.rubble;
    if (R) {
      for (let i = 0; i < R.x.length; i++) {
        const bob = Math.sin(t * 0.55 + i * 1.3) * 0.45;
        E.set(R.rx[i] + Math.sin(t * 0.3 + i) * 0.04, R.ry[i] + t * 0.03 * (i % 2 ? 1 : -1), R.rz[i]);
        M.compose(P.set(R.x[i], R.y[i] + R.h[i] / 2 + bob, R.z[i]), Q.setFromEuler(E), S.set(1.1, R.h[i], 1.1));
        R.cols.setMatrixAt(i, M);
        M.compose(P.set(R.x[i], R.y[i] - 0.6 + bob, R.z[i]), Q.setFromAxisAngle(UP, R.ra[i] + t * 0.03 * (i % 2 ? 1 : -1)), S.set(R.rw[i], R.rh[i], R.rd[i]));
        R.rocks.setMatrixAt(i, M);
      }
      R.cols.instanceMatrix.needsUpdate = R.rocks.instanceMatrix.needsUpdate = true;
    }
    const em = this.embers;
    if (em) {
      for (let i = 0; i < em.x.length; i++) {
        let y = em.y[i] + em.v[i] * t;
        y = -7 + ((((y + 7) % 15) + 15) % 15);
        const k = 0.07 + 0.07 * (0.5 + 0.5 * Math.sin(t * 6 + em.ph[i]));
        M.compose(P.set(em.x[i] + Math.sin(t * 0.9 + em.ph[i]) * 0.8, y, em.z[i] + Math.cos(t * 0.7 + em.ph[i]) * 0.6), Q.identity(), S.setScalar(k * (y > 5 ? (7 - y) / 2 : 1)));
        em.m.setMatrixAt(i, M);
      }
      em.m.instanceMatrix.needsUpdate = true;
    }
    const ss = this.star;
    if (ss) {
      if (ss.life < 0 && t >= ss.next) {
        ss.life = 0;
        const R = this.R;
        ss.vx = (R() < 0.5 ? -1 : 1) * (90 + R() * 40);
        ss.vy = -(25 + R() * 20);
        ss.m.position.set(-ss.vx * 0.5 + (R() - 0.5) * 60, 120 + R() * 40, -200);
        ss.m.rotation.z = Math.atan2(ss.vy, ss.vx);
        ss.m.visible = true;
      }
      if (ss.life >= 0) {
        ss.life += dt;
        ss.m.position.x += ss.vx * dt;
        ss.m.position.y += ss.vy * dt;
        ss.m.scale.set(10 * Math.min(1, ss.life * 4), 0.35, 0.35);
        if (ss.life > 0.9) ((ss.life = -1), (ss.m.visible = false), (ss.next = t + 5 + this.R() * 6));
      }
    }
    const h = this.heli;
    if (h) {
      h.g.position.set(h.x + Math.sin(t * 0.35) * 2.5, h.y + Math.sin(t * 1.1) * 0.45, h.z + Math.cos(t * 0.27) * 2);
      h.g.rotation.set(Math.sin(t * 0.9) * 0.05, 0.9 + Math.sin(t * 0.25) * 0.3, Math.sin(t * 0.7) * 0.06 + wind * 0.08);
      h.rotor.rotation.y += dt * 22;
      h.tail.rotation.x += dt * 30;
    }
    if (this.beacon) this.beacon.scale.setScalar(Math.sin(t * 4) > 0.3 ? 1.1 : 0.45);
    // the lanterns on the bollards: a flicker in the ruins
    const caps = this.caps;
    if (caps && this.lv.lamp) {
      for (let i = 0; i < this.capCol.length; i++) {
        const k = 0.72 + 0.28 * Math.sin(t * (9 + (i % 4)) + i * 2.1) * Math.sin(t * 3.1 + i);
        caps.setColorAt(i, C.copy(this.capCol[i]).multiplyScalar(k));
      }
      if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
    }
    // the pennants: a flutter (the crown's stream out in a gust)
    const F = this.flags;
    if (F) {
      for (let i = 0; i < F.x.length; i++) {
        const gust = F.crown[i] ? wind : wind * 0.5;
        Q.setFromAxisAngle(UP, F.yaw[i] + gust * 0.6);
        Q2.setFromAxisAngle(XAX, Math.sin(t * (F.crown[i] ? 9 : 4) + i * 0.9) * (0.25 + Math.abs(gust) * 0.5) - Math.abs(gust) * (F.crown[i] ? 1.2 : 0.5));
        Q.multiply(Q2);
        M.compose(P.set(F.x[i], F.y[i], F.z[i]), Q, S.setScalar(F.crown[i] ? 1.6 : 1));
        F.m.setMatrixAt(i, M);
      }
      F.m.instanceMatrix.needsUpdate = true;
    }
  }
}
