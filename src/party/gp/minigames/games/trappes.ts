/**
 * LES TRAPPES (1 contre 3, 5 manches): in a torch-lit castle hall, a row of trapdoors hangs over a
 * pit (5, then 4, then 3). Each round the trio pick a trapdoor (move + A, 4 s) and are locked on
 * it. Then a light scans the doors, faster and faster, and the lord on his throne pulls the lever
 * (A): the light slows down over the last doors… and the door it stops on opens. Whoever stands
 * on it falls. The solo wins if all three fell after 5 rounds; otherwise the trio wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { ball, box, canvasTex, cone, cyl, disposeScene, flat, group, toon } from "../../engine/gfx";
import { clamp, easeOutBack } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const ROUNDS = 5;
const DOORS = [5, 5, 4, 4, 3];
const DOOR_W = 2.0;
const GAP = 2.35;
const CHOOSE = 4;
const SCAN_MAX = 6;
const I0 = 0.42; // first step interval
const I_MIN = 0.1;
const SLOW = 1.42; // average interval growth per step once the lever is pulled (varies a bit each time)
const LEVER_AT = 1.4; // the lever unlocks after this long
const STOP_I = 0.6;
const ROW_Z = 0;

interface Door {
  hinge: THREE.Group;
  lamp: THREE.Mesh;
  glow: THREE.Mesh;
  x: number;
  open: number;
}
interface Trio {
  x: number;
  locked: boolean;
  door: number;
  out: boolean;
  fallY: number;
  fallV: number;
  falling: boolean;
  /** CPU */
  want: number;
  lockAt: number;
}

class Trappes extends BaseMini {
  private round = -1;
  private phase: "wait" | "choose" | "scan" | "slow" | "open" | "next" | "done" = "wait";
  private pt = 0;
  private doors: Door[] = [];
  private nDoors = 5;
  private trio: Trio[] = [];
  private light = 0;
  private lightDir = 1;
  private stepT = 0;
  private interval = I0;
  private stopped = -1;
  private outOrder: number[] = [];
  private lever!: THREE.Group;
  private leverPull = 0;
  private beam!: THREE.Mesh;
  private beamX = 0;
  private flames: THREE.Mesh[] = [];
  private torchLight!: THREE.PointLight;
  private lastTick = -1;
  private cpuPressAt = -1;
  private slowF = SLOW;
  private leverReady = false;
  cpuPlanned = false;
  private solo = 0;
  private doorGroup!: THREE.Group;
  private plankGeo = Object.assign(new THREE.BoxGeometry(DOOR_W - 0.08, 0.16, DOOR_W - 0.08), { userData: { shared: true } });
  private labels: (HTMLElement | null)[] = [];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#1a1430", "#3a2a40"], size: 13, sun: [0.3, 1, 0.7], sunColor: "#ffe0b0", sunIntensity: 1.6, hemi: ["#ffd8b0", "#3a2a3a", 1.3], fog: { color: "#2a1e2a", near: 28, far: 60 } });
    this.buildHall();
    this.doorGroup = group(this.scene);
    this.makeDoors(DOORS[0]);
    // the lord on the balcony, the trio on the doors
    const lord = this.spawn(0, 0, -5.2, 0);
    lord.pos.y = 1.6;
    lord.groundY = 1.6;
    lord.setRing(this.players[0].char.color);
    for (let k = 1; k < this.players.length; k++) {
      const x = (k - 2) * GAP;
      const a = this.spawn(k, x, ROW_Z + 0.15, Math.PI);
      a.yaw = Math.PI;
      a.setRing(this.players[k].char.color);
      this.trio[k] = { x, locked: false, door: -1, out: false, fallY: 0, fallV: 0, falling: false, want: 0, lockAt: 0 };
    }
    this.hud.add(
      `<style>
      .tr-tag{background:var(--pc)!important;font-family:var(--title);font-size:calc(var(--u)*1.5)!important;border:calc(var(--u)*.25) solid #1d1630}
      .tr-tag.lock{background:#fff!important;color:#1d1630!important}
      </style>`,
    );
    this.hud.players(this.players, (p) => (p.team === 0 ? T("The Lord", "领主") : T("Standing", "站着")), { teams: true });
    this.setCam([0, 12, 20], [0, 0.6, -0.8], 44);
  }

  // ------------------------------------------------------------ the hall

  private buildHall() {
    const s = this.scene;
    const stone = canvasTex(
      256,
      256,
      (g, w) => {
        g.fillStyle = "#5a5060";
        g.fillRect(0, 0, w, w);
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) {
            const k = (x * 7 + y * 3) % 4;
            g.fillStyle = ["#8a8090", "#7a7084", "#948a9a", "#827890"][k];
            g.fillRect(x * 64 + 3, y * 64 + 3, 58, 58);
          }
      },
      true,
    );
    stone.repeat.set(10, 10);
    const floorMat = new THREE.MeshToonMaterial({ map: stone });
    // floor pieces around the door row (the doors sit in a hole)
    const rowHalf = 3 * GAP;
    const fl = (x: number, z: number, w: number, d: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), floorMat);
      m.position.set(x, -0.2, z);
      m.receiveShadow = true;
      s.add(m);
    };
    fl(0, ROW_Z + 1.1 + 9, 40, 18); // front
    fl(0, ROW_Z - 1.1 - 9, 40, 18); // back
    // the pit under the row
    const pitMat = new THREE.MeshBasicMaterial({ color: "#07040c", side: THREE.BackSide });
    const pit = new THREE.Mesh(new THREE.BoxGeometry(rowHalf * 2 + 6, 6, 2.2), [pitMat, pitMat, pitMat, pitMat, pitMat, pitMat]);
    pit.position.set(0, -3.3, ROW_Z);
    s.add(pit);
    const slime = new THREE.Mesh(new THREE.PlaneGeometry(rowHalf * 2 + 6, 2.2), flat("#3a8a3a", 1));
    slime.rotation.x = -Math.PI / 2;
    slime.position.set(0, -5.5, ROW_Z);
    s.add(slime);
    // stone walls with arches, banners and torches
    const wallTex = canvasTex(
      256,
      128,
      (g, w, h) => {
        g.fillStyle = "#4a4250";
        g.fillRect(0, 0, w, h);
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 5; x++) {
            g.fillStyle = (x + y) % 2 ? "#6a6070" : "#625868";
            g.fillRect(x * 52 + (y % 2) * 26 - 20, y * 32 + 2, 48, 28);
          }
      },
      true,
    );
    wallTex.repeat.set(6, 3);
    const wallMat = new THREE.MeshToonMaterial({ map: wallTex });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(44, 16), wallMat);
    back.position.set(0, 8, -9);
    s.add(back);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), wallMat);
      side.position.set(sx * 15, 8, 4);
      side.rotation.y = -sx * Math.PI / 2;
      s.add(side);
    }
    // the lord's dais, throne and lever
    box(s, "#6a5a6a", 7, 1.6, 3.4, { y: 0.8, z: -5.6 });
    box(s, "#8a2a3a", 6.4, 0.06, 3.0, { y: 1.62, z: -5.6, cast: false });
    for (let k = 0; k < 3; k++) box(s, "#7a6a7a", 3, 0.3, 0.6, { y: 0.15 + k * 0.3 + 0.15, z: -3.7 - k * 0.0 + 0.3 - k * 0.32 });
    const throne = group(s, { z: -6.8, y: 1.6 });
    box(throne, "#b8862a", 1.8, 0.4, 1.2, { y: 0.4 });
    box(throne, "#b8862a", 1.8, 2.6, 0.3, { y: 1.5, z: -0.5 });
    box(throne, "#c83a4a", 1.5, 0.15, 1.0, { y: 0.65 });
    box(throne, "#c83a4a", 1.5, 2.0, 0.12, { y: 1.6, z: -0.33 });
    for (const sx of [-1, 1]) ball(throne, "#ffd23f", 0.2, { x: sx * 0.9, y: 2.9, z: -0.5 });
    cone(throne, "#ffd23f", 0.35, 0.6, { y: 3.1, z: -0.5 });
    this.lever = group(s, { x: 1.6, y: 1.65, z: -4.6 });
    box(this.lever, "#4a4250", 0.6, 0.4, 0.6, { y: 0.2 });
    const arm = group(this.lever, { y: 0.35 });
    cyl(arm, "#8a8a9a", 0.06, 1.2, { y: 0.6, seg: 8 });
    ball(arm, "#e8302f", 0.18, { y: 1.25 });
    this.lever.userData.arm = arm;
    // banners, a gold Z on each
    const zTex = canvasTex(128, 128, (g, w) => {
      g.fillStyle = "#ffc928";
      g.beginPath();
      g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#7a1a20";
      g.font = 'bold 92px "Lilita One", sans-serif';
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("Z", w / 2, w / 2 + 6);
    });
    const zMat = new THREE.MeshToonMaterial({ map: zTex, transparent: true });
    for (const x of [-9, -4.5, 4.5, 9]) {
      const b = group(s, { x, y: 9, z: -8.9 });
      box(b, "#b8262e", 1.8, 4.2, 0.08, { y: -2.1 });
      box(b, "#ffc928", 1.9, 0.2, 0.12, { y: 0 });
      const emb = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), zMat);
      emb.position.set(0, -2, 0.06);
      b.add(emb);
      cone(b, "#b8262e", 0.9, 0.8, { y: -4.5, rz: Math.PI, lo: true, ry: Math.PI / 4 });
    }
    // torches
    const flameMat = flat("#ffb02e", 1);
    for (const [x, z] of [
      [-6.5, -8.8],
      [6.5, -8.8],
      [-14.8, -2],
      [14.8, -2],
      [-14.8, 5],
      [14.8, 5],
    ]) {
      const t = group(s, { x, y: 4.6, z });
      cyl(t, "#3a2a20", 0.1, 0.9, { seg: 6 });
      cyl(t, "#6a6070", 0.2, 0.25, { y: 0.5, seg: 8 });
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), flameMat);
      f.position.y = 0.9;
      t.add(f);
      ball(t, flat("#fff0a0", 0.9), 0.12, { y: 0.8, cast: false });
      this.flames.push(f);
    }
    this.torchLight = new THREE.PointLight("#ffb060", 30, 30, 1.6);
    this.torchLight.position.set(0, 6, 2);
    s.add(this.torchLight);
    // the light beam that scans the doors
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, DOOR_W * 0.62, 9, 24, 1, true), new THREE.MeshBasicMaterial({ color: "#fff3b0", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.position.set(0, 4.5, ROW_Z);
    this.beam.visible = false;
    s.add(this.beam);
    // a chandelier above
    const ch = group(s, { y: 9, z: ROW_Z });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.1, 6, 32), toon("#3a3040"));
    ring.rotation.x = Math.PI / 2;
    ch.add(ring);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      cyl(ch, "#f4efe6", 0.08, 0.35, { x: Math.cos(a) * 2.4, y: 0.2, z: Math.sin(a) * 2.4, seg: 6 });
      ball(ch, flat("#ffd27a"), 0.08, { x: Math.cos(a) * 2.4, y: 0.45, z: Math.sin(a) * 2.4, cast: false });
    }
  }

  private doorX(k: number, n = this.nDoors) {
    return (k - (n - 1) / 2) * GAP;
  }

  private makeDoors(n: number) {
    this.nDoors = n;
    this.doors = [];
    disposeScene(this.doorGroup);
    this.doorGroup.clear();
    const plankTex = canvasTex(128, 128, (g, w) => {
      g.fillStyle = "#8a5a32";
      g.fillRect(0, 0, w, w);
      for (let k = 0; k < 4; k++) {
        g.fillStyle = k % 2 ? "#9a6a3a" : "#7f522c";
        g.fillRect((k * w) / 4 + 2, 0, w / 4 - 4, w);
      }
      g.fillStyle = "#3a3440";
      g.fillRect(0, 18, w, 12);
      g.fillRect(0, w - 30, w, 12);
      g.fillStyle = "#c8c0d0";
      for (const y of [24, w - 24]) for (const x of [12, w - 12]) g.fillRect(x - 4, y - 4, 8, 8);
    });
    const plankMat = new THREE.MeshToonMaterial({ map: plankTex });
    const rowHalf = ((n - 1) / 2) * GAP + DOOR_W / 2;
    // stone between and beside the doors (the row is 2.2 deep)
    const stone = toon("#7a7084");
    const filler = (x0: number, x1: number) => {
      if (x1 - x0 < 0.01) return;
      box(this.doorGroup, stone, x1 - x0, 0.4, 2.2, { x: (x0 + x1) / 2, y: -0.2, z: ROW_Z });
    };
    filler(-20, -rowHalf);
    filler(rowHalf, 20);
    for (let k = 0; k < n - 1; k++) filler(this.doorX(k, n) + DOOR_W / 2, this.doorX(k + 1, n) - DOOR_W / 2);
    for (let k = 0; k < n; k++) {
      const x = this.doorX(k, n);
      const holder = group(this.doorGroup, { x });
      const hinge = group(holder, { z: ROW_Z - DOOR_W / 2, y: -0.08 });
      const plank = new THREE.Mesh(this.plankGeo, plankMat);
      plank.position.z = DOOR_W / 2;
      plank.castShadow = plank.receiveShadow = true;
      hinge.add(plank);
      // the number painted on the door
      const num = canvasTex(64, 64, (g) => {
        g.fillStyle = "#ffe9b0";
        g.beginPath();
        g.arc(32, 32, 26, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#3a2418";
        g.font = 'bold 40px "Lilita One", sans-serif';
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(k + 1), 32, 35);
      });
      const nm = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshBasicMaterial({ map: num, transparent: true }));
      nm.rotation.x = -Math.PI / 2;
      nm.position.set(0, 0.09, DOOR_W / 2 + 0.55);
      hinge.add(nm);
      // the glow of the scanning light on the door, and a lamp on a post behind it
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, DOOR_W), new THREE.MeshBasicMaterial({ color: "#fff1a0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(0, 0.1, DOOR_W / 2);
      hinge.add(glow);
      cyl(holder, "#3a3440", 0.06, 1.5, { y: 0.75, z: ROW_Z - 1.3, seg: 6 });
      box(holder, "#3a3440", 0.42, 0.06, 0.42, { y: 1.52, z: ROW_Z - 1.3 });
      cone(holder, "#3a3440", 0.3, 0.22, { y: 2.12, z: ROW_Z - 1.3, lo: true, ry: Math.PI / 4 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshBasicMaterial({ color: "#6a5030" }));
      lamp.position.set(0, 1.78, ROW_Z - 1.3);
      holder.add(lamp);
      this.doors.push({ hinge, lamp, glow, x, open: 0 });
    }
  }

  // ------------------------------------------------------------ rounds

  private aliveTrio() {
    return this.trio.map((t, k) => ({ t, k })).filter((o) => o.t && !o.t.out);
  }

  private startRound() {
    this.round++;
    const n = DOORS[this.round];
    if (n !== this.nDoors) this.makeDoors(n);
    for (const d of this.doors) d.open = 0;
    this.phase = "choose";
    this.pt = 0;
    this.lastTick = -1;
    this.stopped = -1;
    this.beam.visible = false;
    this.light = 0;
    this.lightDir = 1;
    this.interval = I0;
    this.cpuPlanned = false;
    this.cpuPressAt = -1;
    this.hud.banner(T(`Round ${this.round + 1} / ${ROUNDS}`, `第 ${this.round + 1} / ${ROUNDS} 轮`), { color: "#ffd23f", sub: T(`${n} trapdoors · pick yours!`, `${n} 扇活板门 · 选一扇！`) });
    this.sound("bell");
    this.hud.tip(T("Trio: pick a trapdoor and press <b>A</b>", "三人组：选一扇活板门，按 <b>A</b>"));
    const half = ((n - 1) / 2) * GAP;
    const taken = new Set<number>();
    for (const { t, k } of this.aliveTrio()) {
      t.locked = false;
      t.door = -1;
      t.x = clamp(t.x, -half, half);
      // CPUs: spread out, sometimes doubling up at low level
      const p = this.players[k];
      let want = Math.floor(Math.random() * n);
      if (p.level > Math.random() * 0.7) {
        // a free door, ideally not next to a mate (the light may stop one door off)
        let best = -1e9;
        for (let d = 0; d < n; d++) {
          const sc = (taken.has(d) ? -10 : 0) - ((taken.has(d - 1) ? 1 : 0) + (taken.has(d + 1) ? 1 : 0)) * (0.5 + p.level) + Math.random() * 0.8;
          if (sc > best) {
            best = sc;
            want = d;
          }
        }
      }
      taken.add(want);
      t.want = want;
      t.lockAt = 1.0 + Math.random() * 2.4;
      this.setTag(k, "?");
    }
    if (this.round === 3) music.speed(1.12);
  }

  private setTag(k: number, txt: string | null, lock = false) {
    if (this.labels[k]) this.hud.removeLabel(this.labels[k]!);
    this.labels[k] = null;
    if (txt === null) return;
    const el = this.hud.label(this.avatars[k].root, txt, { dy: 1.85, cls: `tr-tag ${lock ? "lock" : ""}` });
    el.style.setProperty("--pc", this.players[k].char.color);
    this.labels[k] = el;
  }

  start() {
    this.startRound();
  }

  protected idle(dt: number) {
    this.moveCam([0, 8.6, 12.6], [0, 0.8, -1.2], dt, 1.4);
    this.flicker();
    this.avatars[this.solo].faceTo(0, ROW_Z, dt);
  }

  private flicker() {
    const t = this.t * 12;
    this.flames.forEach((f, k) => f.scale.set(1, 0.85 + Math.sin(t + k * 1.7) * 0.15 + Math.sin(t * 2.3 + k) * 0.06, 1));
    this.torchLight.intensity = 28 + Math.sin(t * 0.7) * 3 + Math.sin(t * 1.9) * 2;
  }

  // ------------------------------------------------------------ CPUs

  /** Where the light would stop if the lever were pulled right now (simulated). */
  private predictStop(): number {
    let pos = this.light,
      dir = this.lightDir,
      I = this.interval;
    for (;;) {
      I *= SLOW; // the CPU does not know this round's exact slow-down
      if (I > STOP_I) return pos;
      const nx = pos + dir;
      if (nx < 0 || nx >= this.nDoors) dir = -dir;
      pos += dir;
    }
  }

  protected cpu(i: number, _dt: number): CpuPad {
    const p = this.players[i];
    if (p.team === 0) {
      if (this.phase !== "scan") return {};
      // wait a bit for drama, then pull when the stop would land on the most players
      const lv = p.level;
      if (this.pt < LEVER_AT + 0.2 + Math.random() * 0.1 + (1 - lv) * 0.4) return {};
      const occ = (d: number) => this.aliveTrio().filter((o) => o.t.door === d).length;
      const best = Math.max(...[...Array(this.nDoors).keys()].map(occ));
      if (this.cpuPressAt >= 0) return { a: this.t >= this.cpuPressAt };
      const target = this.predictStop();
      const late = this.pt > SCAN_MAX - 0.8;
      if ((occ(target) === best && best > 0) || late) {
        // the hand is not perfect: sometimes a little early or late
        const err = (Math.random() - 0.5) * 2 * (1 - lv) * 0.16 + (Math.random() < 0.25 * (1 - lv) ? this.interval : 0);
        this.cpuPressAt = this.t + Math.max(0, err + 0.02);
      }
      return {};
    }
    const t = this.trio[i];
    if (!t || t.out || t.locked || this.phase !== "choose") return {};
    const tx = this.doorX(t.want);
    const dx = tx - t.x;
    if (Math.abs(dx) > 0.12) return { x: clamp(dx * 2, -1, 1) };
    return { a: this.pt > t.lockAt };
  }

  // ------------------------------------------------------------ the game

  protected step(dt: number) {
    this.pt += dt;
    this.flicker();
    const zoom = this.phase === "slow" || this.phase === "open";
    this.moveCam(zoom ? [this.beamX * 0.35, 6.6, 9.6] : [0, 8.6, 12.6], zoom ? [this.beamX * 0.5, 0.4, -0.6] : [0, 0.8, -1.2], dt, zoom ? 1.6 : 2.2);
    // the lever springs back
    this.leverPull = Math.max(0, this.leverPull - dt * 1.5);
    (this.lever.userData.arm as THREE.Object3D).rotation.x = -0.5 + this.leverPull * 1.4;
    this.stepTrio(dt);
    const lord = this.avatars[this.solo];
    lord.faceTo(this.beamX, ROW_Z, dt, 6);
    switch (this.phase) {
      case "choose": {
        const left = CHOOSE - this.pt;
        this.hud.timer(left);
        const sec = Math.ceil(left);
        if (sec !== this.lastTick && sec <= 3 && sec > 0) {
          this.lastTick = sec;
          this.sound("tick");
        }
        const all = this.aliveTrio().every((o) => o.t.locked);
        if (left <= 0 || (all && this.pt > 1)) {
          for (const { t, k } of this.aliveTrio()) if (!t.locked) this.lockTrio(k);
          this.phase = "scan";
          this.pt = 0;
          this.stepT = 0;
          this.light = Math.floor(this.rnd() * this.nDoors);
          this.lightDir = this.rnd() < 0.5 ? 1 : -1;
          this.interval = I0;
          this.beam.visible = true;
          this.hud.timer(null);
          this.leverReady = false;
          this.hud.tip(T("The light speeds up…", "灯光在加速……"));
          this.hud.banner(T("The Lord decides…", "领主在选……"), { color: this.players[this.solo].char.color, size: 6, ms: 900 });
          this.sound("drum");
          this.lightDoor();
        }
        break;
      }
      case "scan":
      case "slow": {
        this.stepT += dt;
        if (this.phase === "scan") {
          // speed up toward I_MIN over ~3 s
          this.interval = Math.max(I_MIN, I0 * Math.pow(0.78, this.pt * 2.2));
          if (!this.leverReady && this.pt >= LEVER_AT) {
            this.leverReady = true;
            this.hud.tip(T("Lord: press <b>A</b> to pull the lever!", "领主：按 <b>A</b> 拉杆！"));
            this.sound("click");
          }
          const pull = (this.leverReady && this.pad(this.solo).aDown) || this.pt >= SCAN_MAX;
          if (pull) {
            this.phase = "slow";
            this.slowF = 1.3 + this.rnd() * 0.26;
            this.leverPull = 1;
            this.sound("click");
            this.sound("thud");
            this.shake = 0.15;
            this.hud.tip(null);
            this.lord("hit");
            this.buzz(this.solo, 50);
          }
        }
        if (this.stepT >= this.interval) {
          this.stepT = 0;
          if (this.phase === "slow") {
            this.interval *= this.slowF;
            if (this.interval > STOP_I) {
              this.stopOn(this.light);
              break;
            }
          }
          const nx = this.light + this.lightDir;
          if (nx < 0 || nx >= this.nDoors) this.lightDir = -this.lightDir;
          this.light += this.lightDir;
          this.lightDoor();
        }
        break;
      }
      case "open": {
        const d = this.doors[this.stopped];
        if (this.pt > 0.7) d.open = Math.min(1, d.open + dt * 5);
        if (this.pt > 0.7 && this.pt - dt <= 0.7) {
          this.sound("crash");
          this.shake = 0.35;
          const victims = this.aliveTrio().filter((o) => o.t.door === this.stopped);
          for (const { t, k } of victims) {
            t.out = true;
            t.falling = true;
            t.fallV = 1.5;
            this.outOrder.push(k);
            this.avatars[k].anim = "fall";
            this.hud.mark(this.players[k].i, "out");
            this.hud.setScore(this.players[k].i, T("Fell!", "掉下去了！"));
            this.setTag(k, null);
            this.buzz(k, [120, 60, 120]);
          }
          if (victims.length) {
            this.sound("slide");
            this.hud.banner(victims.length > 1 ? T(`${victims.length} DOWN!`, `掉下去 ${victims.length} 个！`) : T(`${this.players[victims[0].k].name} falls!`, `${this.players[victims[0].k].name} 掉下去了！`), { color: "#ff7a5a", size: 7 });
            this.lord("win");
          } else {
            this.sound("aww");
            this.hud.banner(T("Missed! Nobody on that one", "落空！那扇门上没人"), { color: "#7dff8a", size: 6 });
            for (const { k } of this.aliveTrio()) this.avatars[k].anim = "win";
            this.lord("lose");
          }
        }
        if (this.pt > 1.7 && this.pt - dt <= 1.7 && this.outOrder.length && this.trio.some((t) => t && t.falling)) this.sound("splash");
        if (this.pt > 2.8) {
          const alive = this.aliveTrio().length;
          if (alive === 0) {
            this.phase = "done";
            this.hud.banner(T("THE WHOLE TRIO FELL!", "三人全掉下去了！"), { color: "#ffd23f", size: 6 });
            this.finishByTeam(0);
          } else if (this.round >= ROUNDS - 1) {
            this.phase = "done";
            this.finishByTeam(1);
          } else {
            for (const d of this.doors) d.open = 0;
            for (const { k } of this.aliveTrio()) this.avatars[k].anim = "idle";
            this.lord("idle");
            this.startRound();
          }
        }
        break;
      }
    }
    // the doors swing, the glow fades
    for (let k = 0; k < this.doors.length; k++) {
      const d = this.doors[k];
      d.hinge.rotation.x = easeOutBack(d.open) * (Math.PI / 2) * 0.96;
      const on = (this.phase === "scan" || this.phase === "slow" || (this.phase === "open" && k === this.stopped)) && k === this.light;
      const m = d.glow.material as THREE.MeshBasicMaterial;
      m.opacity += ((on ? 0.55 + (this.phase === "open" ? Math.sin(this.t * 20) * 0.2 : 0) : 0) - m.opacity) * Math.min(1, dt * 18);
      (d.lamp.material as THREE.MeshBasicMaterial).color.set(on ? "#fff1a0" : "#6a5030");
    }
    if (this.beam.visible) {
      const tx = this.doors[this.light]?.x ?? 0;
      this.beamX += (tx - this.beamX) * Math.min(1, dt * (this.phase === "slow" ? 10 : 22));
      this.beam.position.x = this.beamX;
      (this.beam.material as THREE.MeshBasicMaterial).opacity = this.phase === "open" ? 0.32 : 0.22;
    }
  }

  private lord(anim: "idle" | "win" | "lose" | "hit") {
    this.avatars[this.solo].anim = anim;
  }

  private lightDoor() {
    const slow = this.phase === "slow";
    this.sound(slow ? "drum" : "tick");
    if (slow) this.sound("heartbeat");
  }

  private stopOn(k: number) {
    this.stopped = k;
    this.phase = "open";
    this.pt = 0;
    this.sound("ding");
    this.fx.ring({ x: this.doors[k].x, y: 0.1, z: ROW_Z }, "#fff1a0", 2.2, 0.5);
  }

  private lockTrio(k: number) {
    const t = this.trio[k];
    let best = 0;
    for (let d = 1; d < this.nDoors; d++) if (Math.abs(this.doorX(d) - t.x) < Math.abs(this.doorX(best) - t.x)) best = d;
    t.door = best;
    t.locked = true;
    this.setTag(k, `${best + 1}`, true);
    this.sound("confirm");
    this.buzz(k, 30);
  }

  private stepTrio(dt: number) {
    for (let k = 1; k < this.players.length; k++) {
      const t = this.trio[k];
      const a = this.avatars[k];
      if (!t) continue;
      if (t.falling) {
        t.fallV -= 22 * dt;
        t.fallY += t.fallV * dt;
        a.pos.y = t.fallY;
        a.groundY = -50;
        a.model.rotation.z += dt * 6;
        if (t.fallY < -7) {
          t.falling = false;
          a.setVisible(false);
          this.fx.splash({ x: a.pos.x, y: -5.4, z: ROW_Z }, "#7dff8a");
        }
        continue;
      }
      if (t.out) continue;
      let moving = false;
      if (!t.locked && this.phase === "choose") {
        const p = this.pad(k);
        const half = ((this.nDoors - 1) / 2) * GAP;
        if (Math.abs(p.x) > 0.2) {
          t.x = clamp(t.x + p.x * 5.5 * dt, -half, half);
          moving = true;
          a.face(p.x > 0 ? Math.PI / 2 : -Math.PI / 2, dt, 12);
        }
        if (p.aDown) this.lockTrio(k);
      }
      // stand on the door's middle once locked; keep apart from the others when sharing
      let tx = t.x;
      if (t.locked) {
        const mates = this.aliveTrio().filter((o) => o.t.door === t.door);
        const idx = mates.findIndex((o) => o.k === k);
        tx = this.doorX(t.door) + (mates.length > 1 ? (idx - (mates.length - 1) / 2) * 0.62 : 0);
        t.x += (tx - t.x) * Math.min(1, dt * 10);
      }
      let dz = 0;
      if (!t.locked)
        for (let j = 1; j < this.players.length; j++) {
          const o = this.trio[j];
          if (j !== k && o && !o.out && Math.abs(o.x - t.x) < 0.55) dz = j < k ? 0.45 : -0.3;
        }
      a.pos.set(t.x, 0, ROW_Z + 0.15 + dz);
      // standing on an opening door
      if (this.phase === "open" && t.door === this.stopped) a.pos.y = 0;
      a.anim = moving ? "run" : a.anim === "run" ? "idle" : a.anim;
      if (!moving) a.face(Math.PI, dt, 8);
      // nervous when the light is on their door
      if ((this.phase === "scan" || this.phase === "slow") && t.door === this.light && a.anim === "idle") a.model.position.x = Math.sin(this.t * 40) * 0.02;
      else a.model.position.x = 0;
    }
  }

  protected celebrate(res: { place: number[] }) {
    this.avatars.forEach((a, i) => {
      if (!a || !a.root.visible) return;
      a.anim = res.place[i] === 1 ? "win" : "lose";
    });
  }

  protected outroStep(dt: number) {
    this.flicker();
    this.stepTrio(dt);
  }

  dispose() {
    this.plankGeo.dispose();
    super.dispose();
  }
}

const def: MiniDef = {
  id: "trappes",
  name: "Trapdoors",
  icon: "🚪",
  color: "#8a5a3a",
  tagline: "Which trapdoor opens? The solo decides.",
  rules: "The trio each pick a trapdoor (stick + A). The light runs over the doors and the lord pulls the lever (A): it slows… and opens! Three down in 5 rounds and the lord wins.",
  controls: { stick: "Trio: pick a trapdoor", a: "Trio: lock in · Lord: pull the lever" },
  modes: ["1v3"],
  length: 55,
  music: "tense",
  create: (ctx) => new Trappes(ctx),
};
export default def;
