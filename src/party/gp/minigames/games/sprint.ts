/**
 * SPRINT DES CHAMPIONS (chacun pour soi, ≤ 25 s): a 100 m race in a packed stadium. Alternate A and B
 * as fast as you can: the cadence makes the speed, pressing the same button twice is a stumble.
 * A side camera tracks the pack; the first one over the line triggers a photo-finish (flash + slow
 * motion). Places by finishing time; after 25 s the ones still running rank by distance.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, box, canvasTex, cyl, flat, group, textSprite, ball, FONT_TITLE } from "../../engine/gfx";
import { clamp, damp, lerp } from "../../engine/util";
import { portrait } from "../../engine/chars3d";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const LEN = 100;
const CAP = 25;
const LANE_W = 1.9;
const TAU = 0.6; // cadence window (s)
const K_SPEED = 0.86; // m/s per press per second
const VMAX = 11.2;
const STUMBLE = 0.35;
const X0 = -30; // stands from…
const X1 = 140; // …to

type Foot = "a" | "b";

interface Runner {
  x: number;
  v: number;
  /** Presses, decaying (rate ≈ e / TAU). */
  e: number;
  last: Foot | null;
  stumble: number;
  time: number | null;
  place: number;
  dust: number;
  label: HTMLElement;
  bar: HTMLElement;
  dot: HTMLElement;
}
interface CpuRun {
  hold: Foot | null;
  next: number;
  same: Foot | null;
  rate: number;
}

/** A finishing place as a medal (4th and after in words). */
const medal = (place: number) => ["🥇", "🥈", "🥉"][place - 1] ?? T(`${place}th`, `第${place}名`);
const fmt = (t: number) => t.toFixed(2);
/** Dark text on light colours. */
function ink(c: string) {
  const k = new THREE.Color(c);
  return 0.299 * k.r + 0.587 * k.g + 0.114 * k.b > 0.62 ? "#1d1630" : "#ffffff";
}

const CSS = `
.spr-clock{position:absolute;left:50%;top:calc(var(--u)*1);transform:translateX(-50%);display:flex;align-items:center;gap:calc(var(--u)*0.8);padding:calc(var(--u)*0.3) calc(var(--u)*1.6);background:#1d1630;border:calc(var(--u)*0.35) solid #ffc928;border-radius:calc(var(--u)*1.4);box-shadow:0 calc(var(--u)*0.45) 0 rgba(0,0,0,.35);font-family:var(--title);font-size:calc(var(--u)*3.6);color:#ffe14a;font-variant-numeric:tabular-nums;min-width:calc(var(--u)*14);justify-content:center;letter-spacing:.04em}
.spr-clock small{font-size:.5em;color:#ffffffb0;margin-left:calc(var(--u)*.2)}
.spr-prog{position:absolute;left:50%;top:calc(var(--u)*7.6);transform:translateX(-50%);width:calc(var(--u)*46);height:calc(var(--u)*5.2);background:rgba(20,14,40,.6);border-radius:calc(var(--u)*1.2);border:calc(var(--u)*.25) solid rgba(255,255,255,.5)}
.spr-prog .ln{position:absolute;left:calc(var(--u)*2);right:calc(var(--u)*2.6);height:calc(var(--u)*.22);background:rgba(255,255,255,.35);border-radius:9px}
.spr-prog .fl{position:absolute;right:calc(var(--u)*.6);top:50%;transform:translateY(-50%);width:calc(var(--u)*1.6);height:calc(var(--u)*4.2);background:repeating-conic-gradient(#fff 0 25%,#1d1630 0 50%) 0 0/calc(var(--u)*.8) calc(var(--u)*.8);border-radius:3px}
.spr-dot{position:absolute;width:calc(var(--u)*2.4);height:calc(var(--u)*2.4);margin-left:calc(var(--u)*-1.2);margin-top:calc(var(--u)*-1.2);border-radius:50%;background:var(--pc) center/130% no-repeat;background-position:50% 25%;border:calc(var(--u)*.22) solid #fff;box-shadow:0 0 0 calc(var(--u)*.18) var(--pc)}
.spr-tag{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.2);font-size:calc(var(--u)*1.1);line-height:1.1}
.spr-tag .bar{width:calc(var(--u)*5);height:calc(var(--u)*.45);background:rgba(0,0,0,.35);border-radius:9px;overflow:hidden}
.spr-tag .bar i{display:block;height:100%;width:0;background:#fff;border-radius:9px}
.spr-flash{position:absolute;inset:0;background:#fff;animation:sprflash .7s ease-out forwards;pointer-events:none}
@keyframes sprflash{0%{opacity:.95}100%{opacity:0}}
.spr-photo{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 calc(var(--u)*12) rgba(90,60,20,.75);border:calc(var(--u)*.8) solid #fffaf0;animation:sprphoto 1.6s ease-out forwards}
.spr-photo b{position:absolute;left:50%;top:calc(var(--u)*14);transform:translateX(-50%) rotate(-3deg);font-family:var(--title);font-weight:400;font-size:calc(var(--u)*5);color:#fffaf0;-webkit-text-stroke:calc(var(--u)*.3) #1d1630;paint-order:stroke fill;white-space:nowrap}
@keyframes sprphoto{0%{opacity:0}10%{opacity:1}75%{opacity:1}100%{opacity:0}}
`;

class Sprint extends BaseMini {
  private run: Runner[] = [];
  private cpus: CpuRun[] = [];
  private laneZ: number[] = [];
  private raceT = 0;
  private finishedN = 0;
  private over = false;
  private endIn = -1;
  private slow = 0;
  private camX = 3;
  private camD = 13;
  private clockEl!: HTMLElement;
  private crowd!: THREE.InstancedMesh;
  private heads!: THREE.InstancedMesh;
  private crowdBase: { x: number; y: number; ph: number; amp: number }[] = [];
  private excite = 0.6;
  private flags: THREE.Object3D[] = [];
  private ribbon: THREE.Object3D[] = [];
  private ribbonBroken = -1;
  private bigClock!: THREE.Mesh;
  private bigClockTex!: THREE.CanvasTexture;
  private bigClockCtx!: CanvasRenderingContext2D;
  private bigClockShown = "";
  private cheerT = 0;
  private tipShown = true;
  private cardVals: HTMLElement[] = [];
  private crowdGeo = new THREE.SphereGeometry(1, 8, 6);

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#4aa8ff", "#d9f1ff"], size: 22, sun: [0.35, 1, 0.55], fog: { near: 70, far: 160 } });
    this.hud.add(`<style>${CSS}</style>`);
    const n = this.players.length;
    this.laneZ = this.players.map((_, i) => (i - (n - 1) / 2) * LANE_W);
    this.buildStadium();
    this.players.forEach((p, i) => {
      const a = this.spawn(i, -0.2, this.laneZ[i], Math.PI / 2);
      a.setRing(p.char.color);
      a.anim = "push";
      a.speed = 0;
      const col = p.char.color;
      const label = this.hud.label(a.root, `<div class="spr-tag"><div style="color:${ink(col)}">${p.name}</div><div class="bar"><i></i></div></div>`, { dy: 1.95, color: col });
      label.style.border = "calc(var(--u)*0.2) solid rgba(255,255,255,.85)";
      const bar = label.querySelector(".bar i") as HTMLElement;
      bar.style.background = ink(col) === "#ffffff" ? "#ffffff" : "#1d1630";
      this.run.push({ x: 0, v: 0, e: 0, last: null, stumble: 0, time: null, place: 0, dust: 0, label, bar, dot: null as unknown as HTMLElement });
      const lv = p.level;
      this.cpus.push({ hold: null, next: 0.12 + (1 - lv) * 0.25 * Math.random(), same: null, rate: 6.2 + 5.6 * lv + (Math.random() - 0.5) * 0.8 });
    });
    const cards = this.hud.players(this.players, () => "0 m");
    this.cardVals = this.players.map((_, i) => cards.children[i]?.querySelector(".val") as HTMLElement);
    // the race clock and the progress strip
    this.clockEl = this.hud.add(`0.00<small>s</small>`, "spr-clock");
    const prog = this.hud.add(`<div class="fl"></div>`, "spr-prog");
    this.players.forEach((p, i) => {
      const y = ((i + 0.5) / n) * 100;
      const ln = document.createElement("div");
      ln.className = "ln";
      ln.style.top = `calc(${y}% - var(--u)*0.11)`;
      prog.appendChild(ln);
      const d = document.createElement("div");
      d.className = "spr-dot";
      d.style.setProperty("--pc", p.char.color);
      d.style.backgroundImage = `url(${portrait(p.char.id)})`;
      d.style.top = `${y}%`;
      d.style.left = `calc(var(--u)*2)`;
      d.style.zIndex = String(10 + i);
      prog.appendChild(d);
      this.run[i].dot = d;
    });
    this.hud.tip(T(`Alternate <span class="key a">A</span> and <span class="key b">B</span> as fast as you can! The same one twice = trip`, `尽快交替按 <span class="key a">A</span> 和 <span class="key b">B</span>！同一个键按两次 = 绊倒`));
    this.setCam([-7, 2.2, 7], [1, 1, 0], 42);
  }

  // ------------------------------------------------------------ the stadium

  private buildStadium() {
    const s = this.scene;
    // ground: infield grass with mowing stripes
    const grassTex = canvasTex(256, 256, (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? "#5fbf4a" : "#6fcf58";
        g.fillRect((i * w) / 8, 0, w / 8, h);
      }
    }, true);
    grassTex.repeat.set(24, 10);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(260, 120), new THREE.MeshToonMaterial({ map: grassTex }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(55, -0.02, 30);
    grass.receiveShadow = true;
    s.add(grass);
    // the track: red, white lanes (one texture = 10 m, repeated)
    const H = this.players.length * LANE_W + 0.9;
    const trackTex = canvasTex(512, 328, (g, w, h) => {
      g.fillStyle = "#d4553a";
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 900; k++) {
        g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.06)" : "rgba(80,10,0,0.08)";
        g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      }
      g.fillStyle = "#ffffff";
      const n = this.players.length;
      for (let i = 0; i <= n; i++) {
        const z = (i - n / 2) * LANE_W;
        const py = ((z + H / 2) / H) * h;
        g.fillRect(0, py - 3, w, 6);
      }
    }, true);
    trackTex.repeat.set(17, 1);
    trackTex.wrapT = THREE.ClampToEdgeWrapping;
    const track = new THREE.Mesh(new THREE.PlaneGeometry(170, H), new THREE.MeshToonMaterial({ map: trackTex }));
    track.rotation.x = -Math.PI / 2;
    track.position.set(55, 0.01, 0);
    track.receiveShadow = true;
    s.add(track);
    // kerbs
    box(s, "#f4f0e6", 170, 0.12, 0.25, { x: 55, y: 0.05, z: -H / 2 - 0.12 });
    box(s, "#f4f0e6", 170, 0.12, 0.25, { x: 55, y: 0.05, z: H / 2 + 0.12 });
    // start line, lane numbers, blocks
    box(s, flat("#ffffff"), 0.18, 0.02, H, { x: 0, y: 0.03, z: 0, cast: false });
    this.players.forEach((_, i) => {
      const z = this.laneZ[i];
      const tex = canvasTex(128, 128, (g) => {
        g.fillStyle = "#ffffff";
        g.font = `110px ${FONT_TITLE}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(i + 1), 64, 70);
      });
      const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
      m.scale.set(1.1, 1.1, 1);
      m.position.set(-2.4, 0.03, z);
      s.add(m);
      const b = group(s, { x: -0.75, z });
      box(b, "#3b4a6b", 0.5, 0.08, 0.5, { y: 0.04 });
      box(b, "#ff5a3c", 0.12, 0.3, 0.42, { x: 0.12, y: 0.15, rz: 0.5 });
    });
    // distance boards every 10 m (on the near side)
    for (let d = 10; d < LEN; d += 10) {
      const sp = textSprite(`${d} m`, 0.55, { color: "#1d1630", bg: "#ffffff" });
      sp.position.set(d, 0.5, H / 2 + 0.9);
      s.add(sp);
      box(s, flat("#ffffff"), 0.08, 0.02, H, { x: d, y: 0.025, z: 0, cast: false });
    }
    // the finish: chequered line, posts, a sign and a clock facing the camera, the ribbon
    const chk = canvasTex(64, 512, (g, w, h) => {
      const c = 32;
      for (let y = 0; y < h / c; y++)
        for (let x = 0; x < w / c; x++) {
          g.fillStyle = (x + y) % 2 ? "#1d1630" : "#ffffff";
          g.fillRect(x * c, y * c, c, c);
        }
    });
    const fl = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: chk }));
    fl.rotation.x = -Math.PI / 2;
    fl.scale.set(0.5, H, 1);
    fl.position.set(LEN, 0.03, 0);
    fl.receiveShadow = true;
    s.add(fl);
    for (const z of [-H / 2 - 0.5, H / 2 + 0.5]) {
      cyl(s, "#e8e8f0", 0.09, 3.2, { x: LEN, y: 1.6, z, seg: 10 });
      ball(s, "#ffc928", 0.16, { x: LEN, y: 3.25, z });
    }
    const signTex = canvasTex(512, 160, (g, w, h) => {
      g.fillStyle = "#1d1630";
      g.beginPath();
      g.roundRect(0, 0, w, h, 26);
      g.fill();
      g.fillStyle = "#ffc928";
      g.beginPath();
      g.roundRect(10, 10, w - 20, h - 20, 20);
      g.fill();
      g.fillStyle = "#1d1630";
      g.font = `104px ${FONT_TITLE}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(T("FINISH", "终点"), w / 2, h / 2 + 6);
    });
    const sign = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
    sign.scale.set(2.6, 0.81, 1);
    sign.position.set(LEN, 2.85, -H / 2 - 0.62);
    s.add(sign);
    // the big digital clock next to it
    const cc = document.createElement("canvas");
    cc.width = 256;
    cc.height = 96;
    this.bigClockCtx = cc.getContext("2d")!;
    this.bigClockTex = new THREE.CanvasTexture(cc);
    this.bigClockTex.colorSpace = THREE.SRGBColorSpace;
    this.bigClock = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.bigClockTex }));
    this.bigClock.scale.set(1.7, 0.64, 1);
    this.bigClock.position.set(LEN + 2.4, 2.2, -H / 2 - 0.5);
    box(s, "#2d2d38", 1.9, 0.84, 0.12, { x: LEN + 2.4, y: 2.2, z: -H / 2 - 0.58 });
    cyl(s, "#2d2d38", 0.07, 1.8, { x: LEN + 2.4, y: 0.9, z: -H / 2 - 0.62, seg: 8 });
    s.add(this.bigClock);
    this.drawBigClock("0.00");
    // the ribbon: two halves hinged on the posts
    for (const side of [-1, 1]) {
      const piv = group(s, { x: LEN, y: 1.12, z: side * (H / 2 + 0.5) });
      box(piv, flat("#ff3b5c"), 0.05, 0.1, H / 2 + 0.5, { z: -side * (H / 4 + 0.25), cast: false });
      this.ribbon.push(piv);
    }
    // near side: apron and an advertising barrier
    const adTex = canvasTex(2048, 96, (g, w, h) => {
      const ads: [string, string, string][] = [
        [T("GO GO!", "加油！"), "#ff4b3e", "#ffffff"],
        ["SPRINT 100 M", "#2f8dff", "#ffffff"],
        ["ZSTREET", "#ffc928", "#1d1630"],
        [T("RECORD?", "破纪录？"), "#3fcf5a", "#ffffff"],
        ["ZK PARTY", "#9b5cff", "#ffffff"],
        ["CHAMPIONS", "#ff7ad9", "#1d1630"],
      ];
      const bw = w / ads.length;
      ads.forEach(([t, bg, fg], i) => {
        g.fillStyle = bg;
        g.fillRect(i * bw, 0, bw, h);
        g.fillStyle = fg;
        // (the biggest size up to 64 px that fits its panel)
        let px = 64;
        g.font = `${px}px ${FONT_TITLE}`;
        while (px > 30 && g.measureText(t).width > bw - 28) g.font = `${(px -= 4)}px ${FONT_TITLE}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(t, i * bw + bw / 2, h / 2 + 4);
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(i * bw, 0, 4, h);
      });
    }, true);
    adTex.repeat.set(170 / 24, 1);
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(170, 0.62), new THREE.MeshBasicMaterial({ map: adTex }));
    ad.position.set(55, 0.36, H / 2 + 2.02);
    s.add(ad);
    box(s, "#2d2d38", 170, 0.7, 0.1, { x: 55, y: 0.35, z: H / 2 + 1.95 });
    // far side: a wall, then the stands rising back
    box(s, "#2f5fb0", 170, 1.3, 0.3, { x: 55, y: 0.65, z: -H / 2 - 2.4 });
    const wallAd = new THREE.Mesh(new THREE.PlaneGeometry(170, 0.9), new THREE.MeshBasicMaterial({ map: adTex }));
    wallAd.position.set(55, 0.65, -H / 2 - 2.24);
    s.add(wallAd);
    const tiers = 8;
    const tz = (k: number) => -H / 2 - 3.2 - k * 1.05;
    const ty = (k: number) => 1.3 + k * 0.62;
    for (let k = 0; k < tiers; k++) {
      box(s, k % 2 ? "#c9d2e0" : "#b6c0d2", X1 - X0, ty(k), 1.05, { x: (X0 + X1) / 2, y: ty(k) / 2, z: tz(k), cast: false });
      box(s, k % 2 ? "#3d7be0" : "#ff5a4e", X1 - X0, 0.16, 0.5, { x: (X0 + X1) / 2, y: ty(k) + 0.08, z: tz(k) + 0.2, cast: false });
    }
    // back wall + roof edge
    box(s, "#8a96ab", X1 - X0, 2.4, 0.4, { x: (X0 + X1) / 2, y: ty(tiers) + 0.6, z: tz(tiers) + 0.1, cast: false });
    box(s, "#ffffff", X1 - X0, 0.35, 3.6, { x: (X0 + X1) / 2, y: ty(tiers) + 2.0, z: tz(tiers) + 1.5, cast: false });
    // the crowd: instanced bodies and heads
    const shirts = ["#ff4b3e", "#2f8dff", "#ffc928", "#3fcf5a", "#ff7ad9", "#9b5cff", "#ffffff", "#ff9a2e", "#2fb7c9", "#f4f4f4"];
    const skins = ["#ffd2b0", "#e8b08a", "#c68a5e", "#8d5a3a", "#f3c9a0"];
    const spots: { x: number; y: number; z: number }[] = [];
    for (let k = 0; k < tiers; k++)
      for (let x = X0 + 0.5; x < X1 - 0.5; x += 0.95) {
        if (Math.random() < 0.08) continue;
        spots.push({ x: x + (Math.random() - 0.5) * 0.25, y: ty(k) + 0.16, z: tz(k) - 0.05 });
      }
    const bodyMat = new THREE.MeshToonMaterial({ color: "#ffffff" });
    this.crowd = new THREE.InstancedMesh(this.crowdGeo, bodyMat, spots.length);
    this.heads = new THREE.InstancedMesh(this.crowdGeo, bodyMat, spots.length);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    spots.forEach((p, i) => {
      m4.makeScale(0.32, 0.4, 0.25).setPosition(p.x, p.y + 0.34, p.z);
      this.crowd.setMatrixAt(i, m4);
      m4.makeScale(0.2, 0.21, 0.2).setPosition(p.x, p.y + 0.86, p.z);
      this.heads.setMatrixAt(i, m4);
      const sh = Math.random() < 0.18 ? this.players[Math.floor(Math.random() * this.players.length)].char.color : shirts[Math.floor(Math.random() * shirts.length)];
      this.crowd.setColorAt(i, col.set(sh));
      this.heads.setColorAt(i, col.set(skins[Math.floor(Math.random() * skins.length)]));
      this.crowdBase.push({ x: p.x, y: p.y, ph: Math.random() * Math.PI * 2, amp: 0.1 + Math.random() * 0.22 });
    });
    this.crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.crowd.frustumCulled = this.heads.frustumCulled = false;
    s.add(this.crowd, this.heads);
    // waving flags in the players' colours
    for (let k = 0; k < 16; k++) {
      const x = X0 + 18 + k * 8.3 + Math.random() * 3;
      const tier = 1 + Math.floor(Math.random() * (tiers - 2));
      const f = group(s, { x, y: ty(tier) + 0.3, z: tz(tier) + 0.1 });
      cyl(f, "#5a4a3a", 0.03, 1.8, { y: 0.9, seg: 6 });
      const cloth = group(f, { y: 1.55 });
      box(cloth, this.players[k % this.players.length].char.color, 0.9, 0.55, 0.03, { x: 0.45, cast: false });
      this.flags.push(cloth);
    }
    // floodlights (above the stands, seen in the intro)
    for (let k = 0; k < 5; k++) {
      const x = X0 + 15 + k * 33;
      const g = group(s, { x, z: tz(tiers) - 1.5 });
      cyl(g, "#8a96ab", 0.25, 16, { y: 8, seg: 8 });
      box(g, "#2d2d38", 3.2, 1.6, 0.4, { y: 16.4 });
      box(g, flat("#fffbe0"), 2.9, 1.3, 0.1, { y: 16.4, z: 0.22, cast: false });
    }
  }

  private drawBigClock(txt: string) {
    if (txt === this.bigClockShown) return;
    this.bigClockShown = txt;
    const g = this.bigClockCtx;
    g.fillStyle = "#14101f";
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = "#ffb02e";
    g.font = `72px ${FONT_TITLE}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(txt, 128, 52);
    this.bigClockTex.needsUpdate = true;
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number): CpuPad {
    const c = this.cpus[i];
    const r = this.run[i];
    if (r.time !== null || this.over) return {};
    if (this.t >= c.next) {
      const lv = this.players[i].level;
      if (c.same) {
        // the fumble: the same foot again (a stumble)
        c.hold = c.same;
        c.same = null;
      } else if (c.hold && this.cpuChance(i, 0.035, 0.004)) {
        c.same = c.hold;
        c.hold = null;
      } else c.hold = c.hold === "a" ? "b" : "a";
      // cadence: personality, a final surge, a little irregularity
      const surge = r.x > 65 ? 0.9 * lv : 0;
      const tired = r.x > 40 && r.x < 65 ? -0.4 * (1 - lv) : 0;
      const rate = c.rate + surge + tired;
      c.next = Math.max(c.next + (1 / rate) * (0.8 + Math.random() * 0.4), this.t - 0.05);
      if (c.same) c.next = this.t + 0.01;
    }
    return { a: c.hold === "a", b: c.hold === "b" };
  }

  // ------------------------------------------------------------ the race

  start() {
    this.sound("shoot");
    this.shake = 0.25;
    this.excite = 1;
    setTimeout(() => this.sound("cheer"), 120);
  }

  protected idle(dt: number) {
    this.animCrowd(dt);
    this.moveCam([this.camX - 2, 4.2 + this.camD * 0.26, this.camD], [this.camX + 1, 0.7, -1], dt, 1.1);
  }

  private press(i: number, f: Foot) {
    const r = this.run[i];
    if (r.time !== null) return;
    if (r.stumble > 0) {
      // getting back on your feet: the steps keep the rhythm (no speed, no new stumble)
      r.last = f;
      return;
    }
    if (r.last === f) {
      // same foot twice: a stumble
      r.stumble = STUMBLE;
      r.v *= 0.62;
      r.e *= 0.6;
      const a = this.avatars[i];
      a.flash();
      this.fx.dust(a.pos, 10, "#e0866a");
      this.hud.pop(new THREE.Vector3(r.x, 2.3, this.laneZ[i]), T("TRIP!", "绊倒！"), "#ff6a5a", this.camera);
      this.sound("bonk");
      this.buzz(i, [50, 30, 50]);
      return;
    }
    r.last = f;
    r.e += 1;
    if (!this.players[i].cpu) this.sound("step");
  }

  protected step(dt: number) {
    // photo-finish slow motion
    let ts = 1;
    if (this.slow > 0) {
      this.slow -= dt;
      ts = this.slow > 0.35 ? 0.1 : lerp(1, 0.1, this.slow / 0.35);
    }
    const sdt = dt * ts;
    if (!this.over) this.raceT += sdt;
    this.clockEl.innerHTML = `${fmt(Math.min(this.raceT, CAP))}<small>s</small>`;
    if (this.finishedN === 0) this.drawBigClock(fmt(Math.min(this.raceT, CAP)));
    if (this.tipShown && this.t > 5) {
      this.tipShown = false;
      this.hud.tip(null);
    }

    // inputs
    this.players.forEach((_, i) => {
      const p = this.pad(i);
      if (p.aDown && p.bDown) {
        // both at once: count them in the right order
        const r = this.run[i];
        const first: Foot = r.last === "a" ? "b" : "a";
        this.press(i, first);
        this.press(i, first === "a" ? "b" : "a");
      } else if (p.aDown) this.press(i, "a");
      else if (p.bDown) this.press(i, "b");
    });

    // runners
    let lead = -1e9,
      tail = 1e9;
    this.run.forEach((r, i) => {
      const a = this.avatars[i];
      r.e *= Math.exp(-dt / TAU);
      if (r.time === null) {
        if (r.stumble > 0) {
          r.stumble -= dt;
          r.v = damp(r.v, 1.5, 2.2, sdt);
          a.anim = "fall";
        } else {
          const target = Math.min(VMAX, (r.e / TAU) * K_SPEED);
          r.v = damp(r.v, target, target > r.v ? 2.4 : 3.2, sdt);
          a.anim = r.v > 0.25 ? "run" : "push";
          a.speed = clamp(r.v / 9.5, 0.15, 1);
        }
      } else {
        // past the line: coast to a stop
        r.v = damp(r.v, 0, 1.1, sdt);
        a.anim = r.v > 0.6 ? "run" : r.place === 1 ? "win" : "idle";
        a.speed = clamp(r.v / 9.5, 0.15, 1);
      }
      const x0 = r.x;
      r.x += r.v * sdt;
      if (r.time === null && r.x >= LEN && !this.over) this.cross(i, x0);
      a.pos.x = r.x;
      a.yaw = Math.PI / 2;
      // dust at the feet, more when flying
      r.dust += r.v * sdt;
      if (r.dust > 1.6) {
        r.dust = 0;
        if (r.v > 2) this.fx.dust(a.pos, r.v > 8.5 ? 5 : 2, "#e7a58e");
      }
      if (r.time === null) {
        lead = Math.max(lead, r.x);
        tail = Math.min(tail, r.x);
      }
      // HUD
      r.bar.style.width = `${Math.round(clamp(r.v / VMAX, 0, 1) * 100)}%`;
      r.dot.style.left = `calc(var(--u)*2 + (100% - var(--u)*4.6) * ${clamp(r.x / LEN, 0, 1).toFixed(4)})`;
      r.dot.style.zIndex = String(10 + Math.round(r.x));
      if (r.time === null) {
        const el = this.cardVals[i];
        const txt = `${Math.floor(clamp(r.x, 0, LEN))} m`;
        if (el && el.textContent !== txt) el.textContent = txt;
      }
    });
    if (lead < -1e8) {
      lead = LEN;
      tail = LEN;
    }

    // the camera: tracks the pack, settles on the line for the finish
    const spread = lead - tail;
    let cx = lerp(lead, (lead + tail) / 2, 0.45);
    if (lead > LEN - 16 || this.finishedN > 0) cx = Math.max(cx, LEN - 5);
    cx = Math.min(cx, LEN - 2);
    this.camX = damp(this.camX, cx, 3, dt);
    this.camD = damp(this.camD, clamp(12.5 + spread * 0.42, 12.5, 23), 1.6, dt);
    this.moveCam([this.camX - 2, 4.2 + this.camD * 0.26, this.camD], [this.camX + 1, 0.7, -1], dt, 5);

    // the crowd and the decor
    this.excite = damp(this.excite, lead > LEN - 25 ? 1 : 0.35, 1.2, dt);
    this.animCrowd(dt);
    this.cheerT -= dt;
    if (this.cheerT <= 0) {
      this.cheerT = 2.6 + Math.random() * 1.5;
      if (this.excite > 0.6) this.sound("cheer");
    }
    if (this.ribbonBroken >= 0) {
      this.ribbonBroken += dt;
      const k = clamp(this.ribbonBroken / 0.6, 0, 1);
      this.ribbon.forEach((p, s) => {
        p.rotation.x = (s === 0 ? -1 : 1) * 1.45 * (1 - Math.pow(1 - k, 3)) + Math.sin(this.ribbonBroken * 9) * 0.1 * (1 - k);
      });
    }

    // the end: everyone over the line, or the cap
    if (!this.over && this.finishedN >= this.run.length) {
      this.over = true;
      this.endIn = 1.6;
    }
    if (!this.over && this.raceT >= CAP) {
      this.over = true;
      this.endIn = 0.9;
      this.hud.banner(T("TIME'S UP!", "时间到！"), { color: "#ffd23f", sub: T("Ranked by distance", "按距离排名") });
      this.sound("buzzer");
    }
    if (this.over) {
      this.endIn -= dt;
      if (this.endIn <= 0) {
        const scores = this.run.map((r) => (r.time !== null ? 1000 - r.time : r.x));
        this.finishByScore(scores);
      }
    }
  }

  private cross(i: number, x0: number) {
    const r = this.run[i];
    const frac = r.v > 0 ? (LEN - x0) / (r.x - x0) : 1;
    // the exact crossing time inside this frame
    const sdtUsed = r.v > 0 ? (r.x - x0) / r.v : 0;
    r.time = this.raceT - sdtUsed * (1 - clamp(frac, 0, 1));
    r.place = ++this.finishedN;
    const p = this.players[i];
    this.hud.setScore(p.seat, `${medal(r.place)} ${fmt(r.time)} s`);
    r.label.firstElementChild!.innerHTML = `<div style="color:${ink(p.char.color)}">${medal(r.place)} ${fmt(r.time)} s</div>`;
    const at = new THREE.Vector3(LEN, 1.2, this.laneZ[i]);
    this.fx.sparkle(at, p.char.color, 14);
    this.hud.add(`<div class="spr-flash"></div>`);
    this.sound("click");
    if (r.place === 1) {
      // the photo-finish
      this.slow = 1.05;
      this.ribbonBroken = 0;
      this.drawBigClock(fmt(r.time));
      this.fx.confetti(new THREE.Vector3(LEN, 3, 0), 80);
      const ph = this.hud.add(`<b>${T("PHOTO FINISH", "冲线定格")}</b>`, "spr-photo");
      setTimeout(() => ph.remove(), 1700);
      this.sound("ding");
      this.sound("cheer");
      this.shake = 0.2;
      this.hud.mark(p.seat, "win");
      music.speed(1.12);
    }
    this.buzz(i, r.place === 1 ? [80, 40, 80] : 60);
  }

  private animCrowd(dt: number) {
    this.crowdT += dt;
    const arrB = this.crowd.instanceMatrix.array as Float32Array;
    const arrH = this.heads.instanceMatrix.array as Float32Array;
    const cx = this.camera.position.x;
    const ex = this.excite;
    for (let i = 0; i < this.crowdBase.length; i++) {
      const c = this.crowdBase[i];
      if (Math.abs(c.x - cx) > 40) continue;
      const j = Math.max(0, Math.sin(this.crowdT * (6 + c.amp * 10) + c.ph)) * c.amp * ex;
      arrB[i * 16 + 13] = c.y + 0.34 + j;
      arrH[i * 16 + 13] = c.y + 0.86 + j * 1.05;
    }
    this.crowd.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    for (const [k, f] of this.flags.entries()) f.rotation.y = Math.sin(this.crowdT * 3 + k) * 0.5;
  }
  private crowdT = 0;

  dispose() {
    super.dispose();
    this.crowdGeo.dispose();
  }

  protected outroStep(dt: number) {
    this.excite = 1;
    this.animCrowd(dt);
    this.run.forEach((r, i) => {
      r.v = damp(r.v, 0, 1.4, dt);
      r.x += r.v * dt;
      this.avatars[i].pos.x = r.x;
      if (r.v > 0.6) this.avatars[i].anim = "run";
    });
  }
}

const def: MiniDef = {
  id: "sprint",
  name: "Block Sprint",
  icon: "🏃",
  color: "#3fcf5a",
  tagline: "Mash left, right, left, right: win the 100 m.",
  rules: "Alternate A and B as fast as you can to run the 100 m. The same button twice and you trip! First over the line wins.",
  controls: { a: "Left foot", b: "Right foot (alternate with A!)" },
  modes: ["ffa"],
  length: 20,
  music: "mini3",
  create: (ctx) => new Sprint(ctx),
};
export default def;
