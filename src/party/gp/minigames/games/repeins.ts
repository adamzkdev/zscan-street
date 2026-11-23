/**
 * REPEINS LA PLACE (chacun pour soi, 40 s): a little town square made of 18×12 stone tiles. Running
 * over a tile paints it in your colour (and steals it from whoever had it). A = lob a paint bomb a
 * few tiles ahead: a 3×3 splash (4 s to refill). Power-ups pop up now and then: the giant roller
 * (paints 3 tiles wide) and the running shoes (much faster). Live bars show everyone's share.
 * Most tiles at the end wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, cone, cyl, flat, group, toon, tree } from "../../engine/gfx";
import { clamp, dist2 } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 40;
const COLS = 18;
const ROWS = 12;
const TILE = 1;
const HX = (COLS * TILE) / 2;
const HZ = (ROWS * TILE) / 2;
const PR = 0.42;
const SPEED = 6.2;
const SHOE_K = 1.5;
const BOMB_CD = 4;
const BOMB_DIST = 3.2;
const BOMB_T = 0.45;
const POWER_T = 6;
const STONE = ["#cfc8bb", "#c2bbad"];

/** Lots of boxes in one instanced draw call (each with its own colour). */
class BoxBatch {
  private ms: THREE.Matrix4[] = [];
  private cs: THREE.Color[] = [];
  private d = new THREE.Object3D();
  add(parent: THREE.Object3D, color: THREE.ColorRepresentation, w: number, h: number, dd: number, x = 0, y = 0, z = 0) {
    parent.updateMatrixWorld(true);
    this.d.position.set(x, y, z);
    this.d.scale.set(w, h, dd);
    this.d.updateMatrix();
    this.ms.push(parent.matrixWorld.clone().multiply(this.d.matrix));
    this.cs.push(new THREE.Color(color));
  }
  build(scene: THREE.Object3D, cast: boolean) {
    const m = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), this.ms.length);
    this.ms.forEach((mm, k) => {
      m.setMatrixAt(k, mm);
      m.setColorAt(k, this.cs[k]);
    });
    m.castShadow = cast;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
}

type PowerKind = "roller" | "shoes";

interface Painter {
  x: number;
  z: number;
  vx: number;
  vz: number;
  cd: number;
  roller: number;
  shoes: number;
  tiles: number;
  color: THREE.Color;
  hex: string;
  ballInHand: THREE.Mesh;
  rollerMesh: THREE.Group;
}
interface Bomb {
  m: THREE.Mesh;
  owner: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  t: number;
}
interface Power {
  g: THREE.Group;
  kind: PowerKind;
  x: number;
  z: number;
  t: number;
  dead: boolean;
}

class Repeins extends BaseMini {
  private tiles!: THREE.InstancedMesh;
  private owner = new Int8Array(COLS * ROWS).fill(-1);
  private pops = new Map<number, number>();
  private pt: Painter[] = [];
  private bombs: Bomb[] = [];
  private powers: Power[] = [];
  private nextPower = 5;
  private hurry = false;
  private bar!: HTMLElement;
  private barT = 0;
  private m4 = new THREE.Matrix4();
  private v3 = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private base: THREE.Color[] = [];
  private cpuGoal: { x: number; z: number; t: number }[] = [];
  private flagCloth: THREE.Mesh[] = [];
  private dirty = new Set<number>();

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#6cc4ff", "#fff0d6"], size: 15, sun: [0.5, 1, 0.6], fog: { near: 50, far: 110 } });
    this.buildSquare();
    const starts = [
      [-HX + 1.5, -HZ + 1.5],
      [HX - 1.5, -HZ + 1.5],
      [-HX + 1.5, HZ - 1.5],
      [HX - 1.5, HZ - 1.5],
    ];
    this.players.forEach((p, i) => {
      const [x, z] = starts[i];
      const a = this.spawn(i, x, z, Math.atan2(-x, -z));
      const hex = this.paintHex(i);
      a.setRing(hex);
      // (in the zkSNARK's fist, at the end of its long arm)
      const ballInHand = ball(a.rig.armR, toon(hex), 0.2, { y: -0.5, z: 0.06 });
      const rollerMesh = this.makeRoller(hex);
      a.root.add(rollerMesh);
      rollerMesh.visible = false;
      this.pt.push({ x, z, vx: 0, vz: 0, cd: 1, roller: 0, shoes: 0, tiles: 0, color: new THREE.Color(hex), hex, ballInHand, rollerMesh });
      this.cpuGoal.push({ x, z, t: 0 });
    });
    this.hud.players(this.players, () => this.scoreHtml(0));
    this.bar = this.hud.add("", "");
    this.bar.style.cssText = "position:absolute;left:50%;top:calc(var(--u)*7.8);transform:translateX(-50%);width:calc(var(--u)*44);height:calc(var(--u)*2.2);display:flex;border-radius:999px;overflow:hidden;border:calc(var(--u)*0.3) solid #1d1630;background:#e9e3d6;box-shadow:0 calc(var(--u)*0.3) 0 rgba(0,0,0,0.3)";
    this.drawBar();
    this.hud.timer(TIME);
    this.setCam([0, 26, 26], [0, 0, 0], 42);
    // paint the start spots so everyone shows on the bar from the start
    this.pt.forEach((_, i) => this.paintAround(i, this.pt[i].x, this.pt[i].z, 1));
  }

  /** The paint colour: the character's, or its dark shade when it's too pale to show on stone. */
  private paintHex(i: number) {
    const c = this.players[i].char;
    const col = new THREE.Color(c.color);
    const hsl = { h: 0, s: 0, l: 0 };
    col.getHSL(hsl);
    return hsl.s < 0.2 && hsl.l > 0.7 ? c.dark : c.color;
  }

  private scoreHtml(n: number) {
    const pc = Math.round((100 * n) / (COLS * ROWS));
    return `${pc}<span style="font-size:0.6em">%</span>`;
  }

  private drawBar() {
    const total = COLS * ROWS;
    const order = this.pt.map((_, i) => i).sort((a, b) => this.pt[b].tiles - this.pt[a].tiles);
    this.bar.innerHTML = order
      .map((i) => {
        const w = (100 * this.pt[i].tiles) / total;
        return `<div style="width:${w}%;background:${this.pt[i].hex};transition:width 0.25s;box-shadow:inset 0 calc(var(--u)*-0.4) 0 rgba(0,0,0,0.18)"></div>`;
      })
      .join("");
  }

  // ------------------------------------------------------------ the square

  private buildSquare() {
    const s = this.scene;
    // tiles (instanced, one colour each)
    const tileGeo = new THREE.BoxGeometry(TILE * 0.94, 0.16, TILE * 0.94);
    this.tiles = new THREE.InstancedMesh(tileGeo, toon("#ffffff"), COLS * ROWS);
    this.tiles.receiveShadow = true;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const k = r * COLS + c;
        const [x, z] = this.tileCenter(c, r);
        this.m4.makeTranslation(x, 0.08, z);
        this.tiles.setMatrixAt(k, this.m4);
        const col = new THREE.Color(STONE[(r + c) % 2]);
        col.offsetHSL(0, 0, (((c * 7 + r * 13) % 5) - 2) * 0.008);
        this.base.push(col);
        this.tiles.setColorAt(k, col);
      }
    s.add(this.tiles);
    // grout under the tiles, a curb around
    box(s, "#8f877a", COLS * TILE + 0.2, 0.1, ROWS * TILE + 0.2, { y: 0.03 });
    const curb = toon("#9a9286");
    box(s, curb, COLS * TILE + 1.2, 0.3, 0.5, { z: -HZ - 0.35, y: 0.15 });
    box(s, curb, COLS * TILE + 1.2, 0.3, 0.5, { z: HZ + 0.35, y: 0.15 });
    box(s, curb, 0.5, 0.3, ROWS * TILE + 0.2, { x: -HX - 0.35, y: 0.15 });
    box(s, curb, 0.5, 0.3, ROWS * TILE + 0.2, { x: HX + 0.35, y: 0.15 });
    // cobbled street all around
    const cob = canvasTex(512, 512, (g, w) => {
      g.fillStyle = "#8a8378";
      g.fillRect(0, 0, w, w);
      for (let y = 0; y < w; y += 32)
        for (let x = (y / 32) % 2 ? 16 : 0; x < w; x += 32) {
          g.fillStyle = ["#a39b8e", "#9a9285", "#aaa294"][(x * 3 + y) % 3];
          g.beginPath();
          g.roundRect(x + 2, y + 2, 28, 28, 8);
          g.fill();
        }
    }, true);
    cob.repeat.set(12, 12);
    const street = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshToonMaterial({ map: cob }));
    street.rotation.x = -Math.PI / 2;
    street.receiveShadow = true;
    s.add(street);

    // canal houses on three sides (narrow, colourful, with gables)
    const houseCols = ["#e8574a", "#f0b43c", "#4a90c8", "#5fb36a", "#e88aa8", "#8a6ad0", "#f2e6c8", "#c8643a"];
    const solid = new BoxBatch();
    const flatB = new BoxBatch();
    const addHouse = (x: number, z: number, ry: number, k: number) => {
      const w = 3.0 + (k % 2) * 0.4;
      const h = 6 + ((k * 5) % 3) * 1.1;
      const g = group(s, { x, z, ry });
      const c = houseCols[k % houseCols.length];
      solid.add(g, c, w, h, 3, 0, h / 2, 0);
      // stepped gable
      solid.add(g, c, w * 0.7, 1, 3, 0, h + 0.5, 0);
      solid.add(g, c, w * 0.4, 0.8, 3, 0, h + 1.4, 0);
      flatB.add(g, "#ffffff", w * 0.74, 0.12, 3.05, 0, h + 1.0, 0);
      for (let fy = 0; fy < Math.floor((h - 1.5) / 1.7); fy++)
        for (const fx of [-0.7, 0.7]) {
          flatB.add(g, "#ffffff", 0.72, 1.06, 0.08, fx * (w / 3), 2.4 + fy * 1.7, 1.5);
          flatB.add(g, "#2d3a5a", 0.56, 0.9, 0.1, fx * (w / 3), 2.4 + fy * 1.7, 1.51);
        }
      flatB.add(g, "#6a3a22", 0.9, 1.6, 0.1, 0, 0.8, 1.51);
    };
    let k = 0;
    for (let x = -16; x <= 16.1; x += 3.3) addHouse(x, -12.5, 0, k++);
    for (let z = -8.5; z <= 7; z += 3.4) {
      addHouse(-16.5, z, Math.PI / 2, k++);
      addHouse(16.5, z, -Math.PI / 2, k++);
    }
    solid.build(s, true);
    flatB.build(s, false);
    // lamp posts and trees in planters around the square
    for (const [x, z] of [
      [-HX - 1.6, -HZ - 1.6],
      [HX + 1.6, -HZ - 1.6],
    ]) {
      const g = group(s, { x, z });
      cyl(g, "#2d3a4a", 0.1, 4, { y: 2 });
      ball(g, toon("#fff3b0", "#ffcc33", 0.8), 0.3, { y: 4.1 });
      cone(g, "#2d3a4a", 0.36, 0.35, { y: 4.45, lo: true });
    }
    for (const x of [-6, 0, 6]) {
      box(s, "#a85a3a", 1.3, 0.8, 1.3, { x, y: 0.4, z: -HZ - 2.2 });
      tree(s, x, -HZ - 2.2, 1.5, "#4fbf4a", 0.8);
    }
    for (const z of [-3, 3]) {
      for (const sx of [-1, 1]) {
        box(s, "#a85a3a", 1.3, 0.8, 1.3, { x: sx * (HX + 2.4), y: 0.4, z });
        tree(s, sx * (HX + 2.4), z, 1.4, "#5cc44f", 0.8);
      }
    }
    // café umbrellas
    for (const [x, z, c] of [
      [-12.5, -8.5, "#e8343e"],
      [12.5, -8.5, "#2f8dff"],
    ] as const) {
      const g = group(s, { x, z });
      cyl(g, "#ddd", 0.06, 2.6, { y: 1.3 });
      cone(g, c, 1.6, 0.7, { y: 2.7 });
      cyl(g, "#ffffff", 0.6, 0.08, { y: 0.8 });
      cyl(g, "#ddd", 0.05, 0.8, { y: 0.4 });
    }
    // bunting flags over the back of the square
    const pal = ["#ff4b3e", "#ffd23f", "#3fcf5a", "#2f8dff", "#ff7ad9"];
    const flagGeo = new THREE.ConeGeometry(0.28, 0.6, 3);
    for (let f = 0; f < 24; f++) {
      const t = f / 23;
      const x = -14 + t * 28;
      const y = 6.2 - Math.sin(t * Math.PI) * 1.4;
      const m = new THREE.Mesh(flagGeo, toon(pal[f % pal.length]));
      m.rotation.x = Math.PI;
      m.position.set(x, y, -10.8);
      s.add(m);
      this.flagCloth.push(m);
    }
  }

  private tileCenter(c: number, r: number): [number, number] {
    return [-HX + (c + 0.5) * TILE, -HZ + (r + 0.5) * TILE];
  }
  private tileAt(x: number, z: number): [number, number] {
    return [Math.floor((x + HX) / TILE), Math.floor((z + HZ) / TILE)];
  }

  private makeRoller(hex: string) {
    const g = new THREE.Group();
    // a giant paint roller pushed in front
    cyl(g, toon(hex), 0.32, 2.6, { x: 0, y: 0.32, z: 1.0, rz: Math.PI / 2 });
    cyl(g, "#8a8494", 0.05, 2.8, { y: 0.32, z: 1.0, rz: Math.PI / 2 });
    box(g, "#8a8494", 0.06, 0.06, 0.9, { y: 0.55, z: 0.55, rx: 0.5 });
    return g;
  }

  // ------------------------------------------------------------ painting

  private paintTile(i: number, c: number, r: number) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    const k = r * COLS + c;
    const prev = this.owner[k];
    if (prev === i) return false;
    if (prev >= 0) this.pt[prev].tiles--;
    this.owner[k] = i;
    this.pt[i].tiles++;
    this.tiles.setColorAt(k, this.pt[i].color);
    this.pops.set(k, 0);
    return true;
  }
  /** Paints a (2·rad+1)² block of tiles centred on (x, z); returns how many changed. */
  private paintAround(i: number, x: number, z: number, rad: number) {
    const [c0, r0] = this.tileAt(x, z);
    let n = 0;
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) if (this.paintTile(i, c0 + dc, r0 + dr)) n++;
    if (n && this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    return n;
  }

  private updatePops(dt: number) {
    if (!this.pops.size) return;
    for (const [k, t0] of this.pops) {
      const t = t0 + dt;
      const r = Math.floor(k / COLS),
        c = k % COLS;
      const [x, z] = this.tileCenter(c, r);
      const s = t < 0.25 ? 1 + Math.sin((t / 0.25) * Math.PI) * 0.9 : 1;
      this.m4.compose(this.v3.set(x, 0.08 * s, z), this.q, this.sc.set(1, s, 1));
      this.tiles.setMatrixAt(k, this.m4);
      if (t >= 0.25) this.pops.delete(k);
      else this.pops.set(k, t);
    }
    this.tiles.instanceMatrix.needsUpdate = true;
  }

  private throwBomb(i: number) {
    const p = this.pt[i];
    const a = this.avatars[i];
    p.cd = BOMB_CD;
    let x1 = p.x + Math.sin(a.yaw) * BOMB_DIST,
      z1 = p.z + Math.cos(a.yaw) * BOMB_DIST;
    x1 = clamp(x1, -HX + 0.5, HX - 0.5);
    z1 = clamp(z1, -HZ + 0.5, HZ - 0.5);
    const m = new THREE.Mesh(GEO.sphere, toon(p.hex));
    m.scale.setScalar(0.32);
    m.castShadow = true;
    this.scene.add(m);
    this.bombs.push({ m, owner: i, x0: p.x, z0: p.z, x1, z1, t: 0 });
    a.anim = "throw";
    this.sound("whoosh");
  }

  private splat(b: Bomb) {
    const i = b.owner;
    const n = this.paintAround(i, b.x1, b.z1, 1);
    const hex = this.pt[i].hex;
    this.fx.burst({ x: b.x1, y: 0.4, z: b.z1 }, { count: 26, colors: [hex, hex, "#ffffff"], speed: 6, up: 4, size: 0.2, sizeEnd: 0.05, life: 0.7, shape: "ball", gravity: 14 });
    this.fx.ring({ x: b.x1, y: 0.2, z: b.z1 }, hex, 2.2, 0.4);
    this.sound("splash");
    if (n >= 6) this.shake = Math.max(this.shake, 0.15);
    if (n > 0) this.hud.pop(new THREE.Vector3(b.x1, 1.2, b.z1), `+${n}`, hex, this.camera);
    // players in the splash slip a little
    this.pt.forEach((o, j) => {
      if (j === i) return;
      if (Math.abs(o.x - b.x1) < 1.6 && Math.abs(o.z - b.z1) < 1.6) {
        const dx = o.x - b.x1,
          dz = o.z - b.z1,
          d = Math.hypot(dx, dz) || 1;
        o.vx += (dx / d) * 6;
        o.vz += (dz / d) * 6;
        this.avatars[j].flash();
        this.buzz(j, 40);
      }
    });
    this.dirty.add(i);
  }

  // ------------------------------------------------------------ power-ups

  private spawnPower() {
    if (this.powers.filter((p) => !p.dead).length >= 2) return;
    const kind: PowerKind = this.rnd() < 0.5 ? "roller" : "shoes";
    let x = 0,
      z = 0;
    for (let tries = 0; tries < 12; tries++) {
      x = (this.rnd() - 0.5) * (COLS - 3) * TILE;
      z = (this.rnd() - 0.5) * (ROWS - 3) * TILE;
      if (this.pt.every((p) => dist2(p.x, p.z, x, z) > 3)) break;
    }
    const g = group(this.scene, { x, z });
    const halo = new THREE.Mesh(GEO.ring, flat("#ffffff", 0.8));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.2;
    halo.scale.setScalar(0.8);
    g.add(halo);
    const icon = group(g, { y: 1 });
    icon.name = "icon";
    if (kind === "roller") {
      cyl(icon, "#ffd23f", 0.22, 0.8, { rz: Math.PI / 2 });
      cyl(icon, "#ff4b8b", 0.24, 0.12, { x: -0.25, rz: Math.PI / 2 });
      cyl(icon, "#2f8dff", 0.24, 0.12, { x: 0.25, rz: Math.PI / 2 });
      box(icon, "#8a8494", 0.06, 0.6, 0.06, { y: -0.4, x: 0 });
      box(icon, "#e8343e", 0.12, 0.3, 0.12, { y: -0.8 });
    } else {
      for (const sx of [-1, 1]) {
        const sh = group(icon, { x: sx * 0.22 });
        box(sh, "#ff4b3e", 0.26, 0.24, 0.55, { y: 0.05 });
        box(sh, "#ffffff", 0.28, 0.08, 0.58, { y: -0.1 });
        box(sh, "#ffffff", 0.24, 0.05, 0.08, { y: 0.12, z: 0.1 });
        // little wings
        const w = new THREE.Mesh(GEO.coneLo, flat("#ffffff"));
        w.scale.set(0.16, 0.32, 0.05);
        w.position.set(sx * 0.2, 0.2, -0.1);
        w.rotation.z = -sx * 1.0;
        sh.add(w);
      }
    }
    this.powers.push({ g, kind, x, z, t: 0, dead: false });
    this.sound("magic");
    this.fx.sparkle({ x, y: 1, z }, "#ffffff", 16);
  }

  private takePower(i: number, pw: Power) {
    pw.dead = true;
    pw.g.removeFromParent();
    const p = this.pt[i];
    if (pw.kind === "roller") p.roller = POWER_T;
    else p.shoes = POWER_T;
    this.sound("power");
    this.buzz(i, 60);
    this.fx.sparkle({ x: pw.x, y: 1, z: pw.z }, "#ffe14a", 24);
    this.hud.pop(new THREE.Vector3(pw.x, 2, pw.z), pw.kind === "roller" ? T("GIANT ROLLER!", "巨型滚筒！") : T("SPEED SHOES!", "跑鞋！"), p.hex, this.camera);
  }

  // ------------------------------------------------------------ CPUs

  /** How much a CPU wants the area around (x, z): tiles that aren't its own, rivals' a bit more. */
  private areaValue(i: number, x: number, z: number, rad: number) {
    const [c0, r0] = this.tileAt(x, z);
    let v = 0;
    const lead = this.pt.reduce((b, p, j) => (p.tiles > this.pt[b].tiles ? j : b), 0);
    for (let dr = -rad; dr <= rad; dr++)
      for (let dc = -rad; dc <= rad; dc++) {
        const c = c0 + dc,
          r = r0 + dr;
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        const o = this.owner[r * COLS + c];
        if (o === i) continue;
        v += o < 0 ? 1 : o === lead ? 1.3 : 1.1;
      }
    return v;
  }

  protected cpu(i: number): CpuPad {
    const me = this.pt[i];
    const lv = this.players[i].level;
    const a = this.avatars[i];
    const g = this.cpuGoal[i];
    // a power-up close by?
    let tgtPw: Power | null = null;
    for (const pw of this.powers) if (!pw.dead && dist2(me.x, me.z, pw.x, pw.z) < 3 + 4 * lv) tgtPw = pw;
    if (tgtPw) {
      g.x = tgtPw.x;
      g.z = tgtPw.z;
    } else if (this.t > g.t || dist2(me.x, me.z, g.x, g.z) < 0.8) {
      // pick a new area: samples around, value over distance
      let best = -1,
        bx = me.x,
        bz = me.z;
      const n = 8 + Math.round(10 * lv);
      for (let k = 0; k < n; k++) {
        const x = (Math.random() - 0.5) * (COLS - 2) * TILE;
        const z = (Math.random() - 0.5) * (ROWS - 2) * TILE;
        let v = this.areaValue(i, x, z, 2) / (dist2(me.x, me.z, x, z) * (0.25 + 0.1 * (1 - lv)) + 1);
        // keep away from other painters (they're painting there)
        for (let j = 0; j < this.pt.length; j++) if (j !== i && dist2(this.pt[j].x, this.pt[j].z, x, z) < 2.5) v *= 0.6;
        if (v > best) {
          best = v;
          bx = x;
          bz = z;
        }
      }
      g.x = bx;
      g.z = bz;
      g.t = this.t + 0.9 + (1 - lv) * 1.2 + Math.random() * 0.5;
    }
    let dx = g.x - me.x,
      dz = g.z - me.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    // steer a little toward unpainted neighbours (paint as you go)
    if (lv > 0.3) {
      let sx = 0,
        sz = 0;
      for (const [ox, oz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const v = this.areaValue(i, me.x + ox * 1.2, me.z + oz * 1.2, 0);
        sx += ox * v;
        sz += oz * v;
      }
      dx += sx * 0.35 * lv;
      dz += sz * 0.35 * lv;
    }
    const wob = (1 - lv) * 0.5;
    dx += Math.sin(this.t * 2.7 + i * 2) * wob;
    dz += Math.cos(this.t * 2.1 + i) * wob;
    // a paint bomb when the landing spot is worth it
    let fire = false;
    if (me.cd <= 0) {
      const lx = me.x + Math.sin(a.yaw) * BOMB_DIST,
        lz = me.z + Math.cos(a.yaw) * BOMB_DIST;
      if (Math.abs(lx) < HX && Math.abs(lz) < HZ) {
        const v = this.areaValue(i, lx, lz, 1);
        if (v >= 7 - 2 * (1 - lv) && this.cpuAfter(i, "bomb", 0.5 - 0.35 * lv)) {
          fire = true;
          this.cpuReset(i, "bomb");
        }
      }
    }
    return { x: dx, y: dz, a: fire };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.decor(dt);
    this.moveCam([0, 18.5, 14.5], [0, 0, 0.9], dt, 1.7);
  }

  private decor(dt: number) {
    this.flagCloth.forEach((f, k) => (f.rotation.z = Math.sin(this.t * 3 + k) * 0.15));
    for (const pw of this.powers) {
      if (pw.dead) continue;
      pw.t += dt;
      const ic = pw.g.getObjectByName("icon");
      if (ic) {
        ic.rotation.y += dt * 2.5;
        ic.position.y = 1 + Math.sin(pw.t * 3) * 0.15;
      }
    }
    this.powers = this.powers.filter((p) => !p.dead);
    this.updatePops(dt);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.decor(dt);
    this.moveCam([0, 18.5, 14.5], [0, 0, 0.9], dt, 3);
    if (!this.hurry && left <= 10) {
      this.hurry = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ffd23f", sub: T("Everyone speeds up", "大家都加速了"), size: 7 });
      music.speed(1.18);
      this.sound("bell");
    }
    // power-ups
    this.nextPower -= dt;
    if (this.nextPower <= 0) {
      this.spawnPower();
      this.nextPower = 6 + this.rnd() * 3;
    }

    const changed = new Set<number>();
    this.pt.forEach((p, i) => {
      const a = this.avatars[i];
      const pad = this.pad(i);
      p.cd -= dt;
      p.roller = Math.max(0, p.roller - dt);
      p.shoes = Math.max(0, p.shoes - dt);
      const top = SPEED * (p.shoes > 0 ? SHOE_K : 1) * (this.hurry ? 1.08 : 1);
      const k = 1 - Math.exp(-10 * dt);
      p.vx += (pad.x * top - p.vx) * k;
      p.vz += (pad.y * top - p.vz) * k;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.x = clamp(p.x, -HX + PR, HX - PR);
      p.z = clamp(p.z, -HZ + PR, HZ - PR);
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > 0.5) a.face(Math.atan2(p.vx, p.vz), dt);
      if (pad.aDown && p.cd <= 0) this.throwBomb(i);
      if (a.anim !== "throw" || p.cd < BOMB_CD - 0.3) {
        a.anim = p.roller > 0 ? "push" : sp > 0.6 ? "run" : "idle";
        a.speed = clamp(sp / SPEED, 0, 1);
      }
      a.pos.set(p.x, 0, p.z);
      p.ballInHand.visible = p.cd <= 0;
      p.rollerMesh.visible = p.roller > 0;
      if (p.roller > 0 && p.roller < 1.2) p.rollerMesh.visible = Math.floor(p.roller * 8) % 2 === 0;
      // paint under the feet (the roller paints 3 wide)
      const rad = p.roller > 0 ? 1 : 0;
      let px = p.x,
        pz = p.z;
      if (rad) {
        px += Math.sin(a.yaw) * 1.0;
        pz += Math.cos(a.yaw) * 1.0;
      }
      const n = this.paintAround(i, px, pz, rad);
      if (n) {
        changed.add(i);
        if (Math.random() < 0.5) this.fx.burst({ x: px, y: 0.25, z: pz }, { count: 3, colors: [p.hex], speed: 1.5, up: 1.5, size: 0.12, life: 0.35, shape: "ball", gravity: 10 });
        if (Math.random() < 0.15) this.sound("squeak");
      }
      if (p.shoes > 0 && sp > 2 && Math.random() < 0.5) this.fx.burst({ x: p.x, y: 0.3, z: p.z }, { count: 1, colors: ["#ffe14a", "#ffffff"], speed: 0.5, up: 0.5, size: 0.14, life: 0.4, shape: "ball", gravity: 0 });
      // power-ups
      for (const pw of this.powers) if (!pw.dead && dist2(p.x, p.z, pw.x, pw.z) < 0.9) this.takePower(i, pw);
    });
    // bumps
    for (let i = 0; i < this.pt.length; i++)
      for (let j = i + 1; j < this.pt.length; j++) {
        const A = this.pt[i],
          B = this.pt[j];
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
    // bombs in flight
    this.bombs = this.bombs.filter((b) => {
      b.t += dt;
      const k = Math.min(1, b.t / BOMB_T);
      b.m.position.set(b.x0 + (b.x1 - b.x0) * k, 1.2 + Math.sin(k * Math.PI) * 2.4 - k * 0.9, b.z0 + (b.z1 - b.z0) * k);
      b.m.rotation.x += dt * 10;
      if (k >= 1) {
        b.m.removeFromParent();
        this.splat(b);
        return false;
      }
      return true;
    });
    // HUD: cards and the bar (a few times a second)
    for (const i of changed) this.dirty.add(i);
    this.barT -= dt;
    if (this.barT <= 0) {
      this.barT = 0.4;
      this.drawBar();
      for (const i of this.dirty) this.hud.setScore(this.players[i].seat, this.scoreHtml(this.pt[i].tiles));
      this.dirty.clear();
    }

    if (left <= 0) {
      this.drawBar();
      this.pt.forEach((p, i) => this.hud.setScore(this.players[i].seat, this.scoreHtml(p.tiles)));
      this.finishByScore(this.pt.map((p) => p.tiles));
    }
  }

  protected outroStep(dt: number) {
    this.decor(dt);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    super.dispose();
  }
}

const def: MiniDef = {
  id: "repeins",
  name: "Paint the Square",
  icon: "🎨",
  color: "#7a5cff",
  tagline: "Run everywhere and paint the floor your colour.",
  rules: "Every tile you cross takes your colour, even the others'! Throw paint bombs and grab the power-ups (giant roller, shoes). Most tiles at the end wins.",
  controls: { stick: "Run", a: "Paint bomb" },
  modes: ["ffa"],
  length: 40,
  music: "mini",
  create: (ctx) => new Repeins(ctx),
};
export default def;
