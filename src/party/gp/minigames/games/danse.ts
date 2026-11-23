/**
 * DANSE RYTHMIQUE (chacun pour soi, 40 s): a disco stage with lights and a mirror ball. Arrows
 * (← ↑ → ↓) rise in one lane per player toward the target ring; push the stick that way as the
 * arrow reaches it: Parfait / Bien / Raté, and the combo multiplies the points. The notes follow a
 * fixed 120 BPM beat played by the game itself (drums, bass, a melody on the hits). Dancers move
 * better and better as their combo grows. Highest score wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, box, canvasTex, cone, cyl, flat, group, toon, FONT_TITLE } from "../../engine/gfx";
import { clamp, damp } from "../../engine/util";
import { music, sfx } from "../../engine/audio";
import { portrait } from "../../engine/chars3d";
import { T } from "../../../../i18n/lang";

const BPM = 120;
const BEAT = 60 / BPM;
const TIME = 40;
const TRAVEL = 1.5; // seconds an arrow is visible before its time
const PERFECT = 0.075;
const GOOD = 0.15;
const SLOPPY = 0.24; // a flick this close to a note is judged (a miss if not good enough)
const TARGET = 0.22; // target ring: fraction of the lane height from the top

type Dir = "L" | "U" | "R" | "D";
const DIRS: Dir[] = ["L", "U", "R", "D"];
const ROT: Record<Dir, number> = { U: 0, R: 90, D: 180, L: -90 };
const COL: Record<Dir, string> = { L: "#ff5fd2", U: "#3fdf6a", R: "#ffb02e", D: "#2fc8ff" };
const VEC: Record<Dir, [number, number]> = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] };
/** Melody offsets per direction (pentatonic-ish over the chord). */
const MEL: Record<Dir, number> = { L: 0, D: 3, U: 7, R: 10 };
/** Am – F – C – G (bass roots, semitones from A4). */
const PROG = [-24, -28, -21, -26];

interface Note {
  t: number;
  d: Dir;
  /** Somebody hit it (for the melody: played once). */
  sung: boolean;
}
interface Lane {
  el: HTMLElement;
  track: HTMLElement;
  score: HTMLElement;
  combo: HTMLElement;
  fb: HTMLElement;
  target: HTMLElement;
  notes: Map<number, HTMLElement>;
  /** Judged notes (index → result). */
  judged: Set<number>;
  pts: number;
  combo_: number;
  best: number;
  neutral: boolean;
  missT: number;
  glow: number;
  // CPU
  ck: number;
  cPlanK: number;
  cT: number;
  cDir: Dir | null;
  cHold: number;
  cLast: number;
}

const ARROW = `<svg viewBox="0 0 100 100"><path d="M50 6 L94 50 L67 50 L67 94 L33 94 L33 50 L6 50 Z" fill="currentColor" stroke="#1d1630" stroke-width="8" stroke-linejoin="round"/></svg>`;

const CSS = `
.dz-lanes{position:absolute;left:calc(var(--u)*1);right:calc(var(--u)*1);bottom:calc(var(--u)*1);height:40%;display:flex;gap:calc(var(--u)*1)}
.dz-lane{flex:1;position:relative;border-radius:calc(var(--u)*1.6);background:linear-gradient(180deg,rgba(20,8,44,.82),rgba(20,8,44,.55));border:calc(var(--u)*.3) solid var(--pc);overflow:hidden;box-shadow:0 calc(var(--u)*.3) calc(var(--u)*1) rgba(0,0,0,.45)}
.dz-lane.hot{box-shadow:0 0 calc(var(--u)*2.6) var(--pc)}
.dz-head{position:absolute;left:0;right:0;top:0;height:calc(var(--u)*4.4);display:flex;align-items:center;gap:calc(var(--u)*.6);padding:0 calc(var(--u)*.7);background:rgba(0,0,0,.35);z-index:3}
.dz-head .pic{width:calc(var(--u)*3.6);height:calc(var(--u)*3.6);border-radius:50%;background:var(--pc) center/120% no-repeat;background-position:50% 30%;border:calc(var(--u)*.2) solid #fff;flex:none}
.dz-head .nm{font-weight:700;font-size:calc(var(--u)*1.25);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dz-head .sc{font-family:var(--title);font-size:calc(var(--u)*2.3);font-variant-numeric:tabular-nums}
.dz-track{position:absolute;left:0;right:0;top:calc(var(--u)*4.4);bottom:0}
.dz-target{position:absolute;left:50%;width:calc(var(--u)*5.4);height:calc(var(--u)*5.4);transform:translate(-50%,-50%);border-radius:50%;border:calc(var(--u)*.45) solid rgba(255,255,255,.9);box-shadow:0 0 calc(var(--u)*1) var(--pc),inset 0 0 calc(var(--u)*1) var(--pc)}
.dz-target.flash{animation:dzflash .25s ease-out}
@keyframes dzflash{0%{transform:translate(-50%,-50%) scale(1.35);background:rgba(255,255,255,.45)}100%{transform:translate(-50%,-50%) scale(1);background:transparent}}
.dz-note{position:absolute;left:50%;width:calc(var(--u)*4.3);height:calc(var(--u)*4.3);transform:translate(-50%,-50%);filter:drop-shadow(0 calc(var(--u)*.25) 0 rgba(0,0,0,.4))}
.dz-note svg{width:100%;height:100%;display:block}
.dz-note.hit{animation:dzhit .25s ease-out forwards}
@keyframes dzhit{to{transform:translate(-50%,-50%) scale(1.8);opacity:0}}
.dz-note.miss{opacity:.35;filter:grayscale(1)}
.dz-fb{position:absolute;left:50%;transform:translate(-50%,-50%);font-family:var(--title);font-size:calc(var(--u)*2.5);-webkit-text-stroke:calc(var(--u)*.22) #1d1630;paint-order:stroke fill;white-space:nowrap;z-index:2;pointer-events:none}
.dz-fb.go{animation:dzfb .55s ease-out forwards}
@keyframes dzfb{0%{transform:translate(-50%,-50%) scale(.4);opacity:0}25%{transform:translate(-50%,-50%) scale(1.15);opacity:1}100%{transform:translate(-50%,-110%) scale(1);opacity:0}}
.dz-combo{position:absolute;right:calc(var(--u)*.8);bottom:calc(var(--u)*.6);font-family:var(--title);font-size:calc(var(--u)*2.2);color:#fff;opacity:.9;-webkit-text-stroke:calc(var(--u)*.18) #1d1630;paint-order:stroke fill}
.dz-combo small{font-size:.55em;margin-left:.15em}
.dz-beat{position:absolute;left:0;right:0;height:calc(var(--u)*.2);background:rgba(255,255,255,.12)}
`;

class Danse extends BaseMini {
  private chart: Note[] = [];
  private lanes: Lane[] = [];
  private nextBeat = 0;
  private beatN = -1;
  private musicStopped = false;
  private hurried = false;
  private ended = false;
  private tiles!: THREE.InstancedMesh;
  private tileCol: THREE.Color[] = [];
  private tilesN = { cols: 12, rows: 4 };
  private mirror!: THREE.Mesh;
  private dots!: THREE.Points;
  private beams: THREE.Mesh[] = [];
  private eq: THREE.Mesh[] = [];
  private neon: THREE.MeshBasicMaterial[] = [];
  private beatPulse = 0;
  private trackH = 200;
  private dancerX: number[] = [];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#0c0420", "#2a0d4a"], size: 12, sun: [0.15, 0.9, 1], sunColor: "#fff0f8", sunIntensity: 1.9, hemi: ["#ffffff", "#6a4a9a", 1.7], fog: { color: "#14062a", near: 25, far: 60 } });
    this.hud.add(`<style>${CSS}</style>`);
    this.makeChart();
    this.buildStage();
    const n = this.players.length;
    this.players.forEach((p, i) => {
      const x = (i - (n - 1) / 2) * 3.05;
      this.dancerX.push(x);
      const a = this.spawn(i, x, 0.2, 0, { scale: 1.3 });
      a.setRing(p.char.color);
      a.anim = "idle";
    });
    this.buildLanes();
    this.hud.timer(TIME);
    this.setCam([0, 1.6, 13], [0, 0.6, 0], 40);
  }

  // ------------------------------------------------------------ the chart (same for everybody)

  private makeChart() {
    const r = this.rnd;
    let last: Dir = "U";
    const pick = () => {
      let d = DIRS[Math.floor(r() * 4)];
      if (d === last && r() < 0.65) d = DIRS[(DIRS.indexOf(d) + 1 + Math.floor(r() * 3)) % 4];
      last = d;
      return d;
    };
    // on a half-beat grid: gaps (in half-beats) get shorter and syncopated as the song goes on
    const GAPS = [
      [4], // a gentle start: every other beat
      [2, 2, 2, 2, 4],
      [2, 2, 3, 2, 3, 2],
      [2, 2, 2, 3, 1, 3, 2],
    ];
    let h = 8; // first note on beat 4
    let prevGap = 4;
    while (h * (BEAT / 2) <= TIME - 1.2) {
      const t = h * (BEAT / 2);
      this.chart.push({ t, d: pick(), sung: false });
      const sec = t < 8 ? 0 : t < 19 ? 1 : t < 29 ? 2 : 3;
      const g = GAPS[sec];
      let gap = g[Math.floor(r() * g.length)];
      // a quick eighth is always followed by a breather, and syncopation lands back on the beat
      if (prevGap === 1) gap = 3;
      if (gap === 1 && prevGap !== 2) gap = 2;
      if ((h + gap) % 2 === 1 && gap === 2) gap = 3;
      prevGap = gap;
      h += gap;
    }
  }

  // ------------------------------------------------------------ the stage

  private buildStage() {
    const s = this.scene;
    // the back wall and the stage
    box(s, "#1a0a30", 40, 12, 0.4, { y: 6, z: -4.5 });
    box(s, "#2a1450", 18, 0.5, 6.4, { y: -0.25, z: -0.8 });
    box(s, "#ff4fd8", 18.1, 0.08, 0.1, { y: 0.0, z: 2.42, cast: false });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), toon("#120624"));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.5, 10);
    s.add(floor);
    // glowing dance-floor tiles (instanced, recoloured each frame)
    const { cols, rows } = this.tilesN;
    this.tiles = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#ffffff" }), cols * rows);
    const m4 = new THREE.Matrix4();
    const tw = 1.32;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c;
        m4.makeScale(tw - 0.08, 0.06, tw - 0.08).setPosition((c - (cols - 1) / 2) * tw, 0.01, -2.6 + r * tw + 0.6);
        this.tiles.setMatrixAt(k, m4);
        this.tileCol.push(new THREE.Color("#30104a"));
        this.tiles.setColorAt(k, this.tileCol[k]);
      }
    this.tiles.receiveShadow = false;
    s.add(this.tiles);
    // neon signs
    const neonSign = (txt: string, color: string, x: number, y: number, rz: number) => {
      const tex = canvasTex(512, 160, (g, w, h) => {
        let fs = 110;
        g.font = `${fs}px ${FONT_TITLE}`;
        while (fs > 50 && g.measureText(txt).width > w - 60) g.font = `${(fs -= 6)}px ${FONT_TITLE}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.shadowColor = color;
        g.shadowBlur = 26;
        g.strokeStyle = color;
        g.lineWidth = 10;
        g.strokeText(txt, w / 2, h / 2 + 6);
        g.fillStyle = "#ffffff";
        g.fillText(txt, w / 2, h / 2 + 6);
      });
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      const m = new THREE.Mesh(GEO.plane, mat);
      m.scale.set(4.2, 1.31, 1);
      m.position.set(x, y, -4.25);
      m.rotation.z = rz;
      s.add(m);
      this.neon.push(mat);
    };
    neonSign("ZK DISCO", "#ff4fd8", -5.2, 3.1, 0.06);
    neonSign(T("DANCE!", "跳舞！"), "#2fc8ff", 5.2, 3.1, -0.06);
    // the DJ booth with an equaliser
    const dj = group(s, { z: -3.4 });
    box(dj, "#2d1a4a", 3.2, 1.1, 1.0, { y: 0.55 });
    box(dj, "#ff4fd8", 3.25, 0.08, 1.05, { y: 1.12, cast: false });
    for (const sx of [-0.8, 0.8]) {
      cyl(dj, "#111111", 0.36, 0.06, { x: sx, y: 1.16, seg: 20 });
      cyl(dj, "#ff4fd8", 0.08, 0.07, { x: sx, y: 1.17, seg: 10 });
    }
    for (let k = 0; k < 10; k++) {
      const bar = new THREE.Mesh(GEO.box, flat(k < 4 ? "#3fdf6a" : k < 8 ? "#ffd23f" : "#ff4b3e"));
      bar.position.set(-1.35 + k * 0.3, 0.55, 0.52);
      bar.scale.set(0.2, 0.8, 0.04);
      dj.add(bar);
      this.eq.push(bar);
    }
    // speaker stacks
    for (const sx of [-1, 1]) {
      const sp = group(s, { x: sx * 8.2, z: -2.2 });
      for (let k = 0; k < 2; k++) {
        box(sp, "#1d1630", 1.6, 1.6, 1.2, { y: 0.8 + k * 1.65 });
        cyl(sp, "#3a3050", 0.55, 0.08, { y: 0.8 + k * 1.65, z: 0.62, rx: Math.PI / 2, seg: 20 });
        cyl(sp, "#14101f", 0.22, 0.1, { y: 0.8 + k * 1.65, z: 0.66, rx: Math.PI / 2, seg: 14 });
      }
    }
    // the mirror ball
    cyl(s, "#888899", 0.02, 3, { y: 4.6, z: -1.2, seg: 4 });
    this.mirror = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 2), new THREE.MeshLambertMaterial({ color: "#dfe6f4", emissive: "#4a4a6a", flatShading: true }));
    this.mirror.position.set(0, 2.95, -1.2);
    s.add(this.mirror);
    // its reflections: specks of light sweeping the room
    const pts = new Float32Array(160 * 3);
    for (let k = 0; k < 160; k++) {
      const u = Math.random() * 2 - 1,
        a = Math.random() * Math.PI * 2;
      const rr = 7 + Math.random() * 4;
      pts[k * 3] = Math.sqrt(1 - u * u) * Math.cos(a) * rr;
      pts[k * 3 + 1] = u * rr * 0.5;
      pts[k * 3 + 2] = Math.sqrt(1 - u * u) * Math.sin(a) * rr * 0.5;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    this.dots = new THREE.Points(pg, new THREE.PointsMaterial({ color: "#ffffff", size: 0.12, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.dots.position.copy(this.mirror.position);
    s.add(this.dots);
    // spotlight beams, one per dancer, in their colour
    const n = this.players.length;
    this.players.forEach((p, i) => {
      const x = (i - (n - 1) / 2) * 3.05;
      const beam = new THREE.Mesh(new THREE.ConeGeometry(1.1, 7, 20, 1, true), new THREE.MeshBasicMaterial({ color: p.char.color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.set(x, 3.6, 0.2);
      s.add(beam);
      this.beams.push(beam);
    });
    // truss over the stage
    box(s, "#3a3050", 18, 0.25, 0.25, { y: 6.4, z: 0.2 });
    for (let k = 0; k < 6; k++) cone(s, "#2d2d38", 0.3, 0.5, { x: -7.5 + k * 3, y: 6.1, z: 0.2, rx: Math.PI });
  }

  private buildLanes() {
    const wrap = this.hud.add("", "dz-lanes");
    this.players.forEach((p) => {
      const el = document.createElement("div");
      el.className = "dz-lane";
      el.style.setProperty("--pc", p.char.color);
      el.innerHTML = `<div class="dz-head"><div class="pic" style="background-image:url(${portrait(p.char.id)})"></div><div class="nm">${p.name}${p.cpu ? ' <span style="opacity:.6;font-size:.8em">CPU</span>' : ""}</div><div class="sc">0</div></div><div class="dz-track"><div class="dz-target" style="top:${TARGET * 100}%"></div><div class="dz-fb" style="top:${TARGET * 100}%"></div><div class="dz-combo"></div></div>`;
      wrap.appendChild(el);
      this.lanes.push({
        el,
        track: el.querySelector(".dz-track")!,
        score: el.querySelector(".sc")!,
        combo: el.querySelector(".dz-combo")!,
        fb: el.querySelector(".dz-fb")!,
        target: el.querySelector(".dz-target")!,
        notes: new Map(),
        judged: new Set(),
        pts: 0,
        combo_: 0,
        best: 0,
        neutral: true,
        missT: 0,
        glow: 0,
        ck: 0,
        cPlanK: -1,
        cT: 0,
        cDir: null,
        cHold: 0,
        cLast: -1,
      });
    });
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number): CpuPad {
    const L = this.lanes[i];
    const lv = this.players[i].level;
    // still holding the last flick
    if (L.cHold > this.t && L.cDir) {
      const [x, y] = VEC[L.cDir];
      return { x, y };
    }
    // the next note to play
    while (L.ck < this.chart.length && (L.judged.has(L.ck) || this.chart[L.ck].t < this.t - SLOPPY)) L.ck++;
    const k = L.ck;
    const n = this.chart[k];
    if (!n) return {};
    if (L.cPlanK !== k) {
      L.cPlanK = k;
      const g = (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;
      L.cT = Math.max(n.t + g * (0.085 - 0.065 * lv), L.cLast + 0.07);
      const right = Math.random() < 0.86 + 0.12 * lv;
      L.cDir = Math.random() < 0.06 * (1 - lv) ? null : right ? n.d : DIRS[(DIRS.indexOf(n.d) + 1 + Math.floor(Math.random() * 3)) % 4];
    }
    if (L.cDir && this.t >= L.cT) {
      L.cHold = this.t + 0.07;
      L.cLast = L.cHold;
      const [x, y] = VEC[L.cDir];
      L.cPlanK = -2; // will plan the next one after this
      L.ck = k + 1;
      return { x, y };
    }
    return {};
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.animStage(dt, this.t);
    this.moveCam([0, 2.7, 11], [0, 0.6, 0], dt, 1.5);
    this.avatars.forEach((a) => (a.anim = "idle"));
  }

  protected step(dt: number) {
    if (!this.musicStopped) {
      // the game plays its own beat (in sync with the arrows)
      this.musicStopped = true;
      music.stop(0.05);
    }
    const left = TIME - this.t;
    this.hud.timer(left);
    this.moveCam([0, 2.7, 11], [0, 0.6, 0], dt, 3);
    this.trackH = this.lanes[0]?.track.clientHeight || this.trackH;

    // the beat
    while (this.t >= this.nextBeat && this.nextBeat <= TIME) {
      this.onBeat(++this.beatN);
      this.nextBeat += BEAT / 2;
    }
    if (!this.hurried && left <= 10) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ffd23f", ms: 1000 });
    }

    this.lanes.forEach((L, i) => {
      const p = this.pad(i);
      const a = this.avatars[i];
      // a flick: the stick leaves the centre
      const mag = Math.hypot(p.x, p.y);
      if (mag < 0.35) L.neutral = true;
      else if (mag > 0.6 && L.neutral) {
        L.neutral = false;
        const d: Dir = Math.abs(p.x) > Math.abs(p.y) ? (p.x > 0 ? "R" : "L") : p.y < 0 ? "U" : "D";
        this.flick(i, d);
      }
      // notes passing by unhit are misses
      for (let k = 0; k < this.chart.length; k++) {
        const n = this.chart[k];
        if (n.t > this.t + TRAVEL) break;
        if (L.judged.has(k)) continue;
        if (this.t - n.t > SLOPPY) this.judge(i, k, "miss");
      }
      this.drawLane(i);
      // the dancer: the better the combo, the wilder the moves
      L.missT -= dt;
      L.glow = damp(L.glow, 0, 4, dt);
      const c = L.combo_;
      const bt = this.t / BEAT;
      if (L.missT > 0) {
        a.anim = "stun";
        a.yaw = damp(a.yaw, 0, 6, dt);
        a.pos.y = 0;
      } else if (c >= 24) {
        a.anim = Math.floor(bt / 2) % 2 ? "win" : "dance";
        a.yaw += dt * 4;
        a.pos.y = Math.abs(Math.sin(bt * Math.PI)) * 0.35;
      } else if (c >= 12) {
        a.anim = "dance";
        a.yaw = Math.sin(bt * Math.PI * 0.5) * 1.2;
        a.pos.y = Math.abs(Math.sin(bt * Math.PI)) * 0.2;
      } else if (c >= 4) {
        a.anim = "dance";
        a.yaw = damp(a.yaw, Math.sin(bt * Math.PI * 0.5) * 0.4, 6, dt);
        a.pos.y = 0;
      } else {
        a.anim = "idle";
        a.yaw = damp(a.yaw, 0, 6, dt);
        a.pos.y = Math.abs(Math.sin(bt * Math.PI)) * 0.06;
      }
      a.groundY = 0;
      // the beam over the dancer brightens with the combo
      const bm = this.beams[i].material as THREE.MeshBasicMaterial;
      bm.opacity = 0.06 + clamp(c / 20, 0, 1) * 0.22 + L.glow * 0.15;
      this.beams[i].rotation.z = Math.sin(this.t * 1.3 + i) * (c >= 12 ? 0.18 : 0.05);
      L.el.classList.toggle("hot", c >= 12);
    });
    this.animStage(dt, this.t);

    if (!this.ended && left <= 0) {
      this.ended = true;
      this.finishByScore(this.lanes.map((L) => L.pts));
    }
  }

  private onBeat(n: number) {
    const half = n % 2;
    const beat = Math.floor(n / 2);
    const bar = Math.floor(beat / 4) % PROG.length;
    const root = PROG[bar];
    if (!half) {
      sfx.play("drum");
      this.beatPulse = 1;
      // bass: root, octave, fifth, octave
      const off = [0, 12, 7, 12][beat % 4];
      sfx.note(root + off, 0.22, "triangle", 0.2);
      if (beat % 4 === 0) for (const k of [0, 3, 7]) sfx.note(root + 24 + k, 0.3, "square", 0.025);
      if (beat % 2 === 1) sfx.play("click");
    } else sfx.play("tick");
  }

  private flick(i: number, d: Dir) {
    const L = this.lanes[i];
    // the closest unjudged note within reach
    let best = -1,
      bd = 1e9;
    for (let k = 0; k < this.chart.length; k++) {
      const n = this.chart[k];
      if (n.t > this.t + SLOPPY) break;
      if (L.judged.has(k)) continue;
      const e = Math.abs(n.t - this.t);
      if (e < bd && e <= SLOPPY) {
        bd = e;
        best = k;
      }
    }
    if (best < 0) return;
    const n = this.chart[best];
    if (n.d !== d) this.judge(i, best, "miss");
    else if (bd <= PERFECT) this.judge(i, best, "perfect");
    else if (bd <= GOOD) this.judge(i, best, "good");
    else this.judge(i, best, "miss");
  }

  private judge(i: number, k: number, res: "perfect" | "good" | "miss") {
    const L = this.lanes[i];
    const n = this.chart[k];
    L.judged.add(k);
    const el = L.notes.get(k);
    const a = this.avatars[i];
    const p = this.players[i];
    if (res === "miss") {
      L.combo_ = 0;
      L.missT = 0.35;
      if (el) el.classList.add("miss");
      this.showFb(L, T("Miss", "失误"), "#ff5a6a");
      if (!p.cpu) {
        this.sound("wrong");
        this.buzz(i, 60);
      }
      a.flash();
    } else {
      L.combo_++;
      L.best = Math.max(L.best, L.combo_);
      const base = res === "perfect" ? 100 : 50;
      L.pts += Math.round(base * (1 + Math.min(L.combo_, 40) / 20));
      if (el) {
        el.classList.add("hit");
        setTimeout(() => {
          el.remove();
          L.notes.delete(k);
        }, 260);
      }
      L.target.classList.remove("flash");
      void L.target.offsetWidth;
      L.target.classList.add("flash");
      this.showFb(L, res === "perfect" ? T("Perfect!", "完美！") : T("Good", "不错"), res === "perfect" ? "#ffe14a" : "#7dff9a");
      L.glow = 1;
      if (!n.sung) {
        n.sung = true;
        const bar = Math.floor(n.t / BEAT / 4) % PROG.length;
        sfx.note(PROG[bar] + 36 + MEL[n.d] - 12, 0.16, "square", 0.05);
      }
      if (L.combo_ % 10 === 0) {
        this.fx.sparkle(new THREE.Vector3(this.dancerX[i], 1.6, 0.2), p.char.color, 18);
        this.showFb(L, T(`Combo ${L.combo_}!`, `${L.combo_} 连击！`), p.char.color);
        if (!p.cpu) this.sound("magic");
      }
      if (res === "perfect") this.fx.burst({ x: this.dancerX[i], y: 0.2, z: 0.2 }, { count: 4, colors: [p.char.color, "#ffffff"], speed: 2.5, up: 2, gravity: 4, size: 0.1, life: 0.5, shape: "ball", flat: true });
    }
    L.score.textContent = L.pts.toLocaleString("en-US");
    L.combo.innerHTML = L.combo_ >= 2 ? `${L.combo_}<small>${T("combo", "连击")}</small>` : "";
  }

  private showFb(L: Lane, txt: string, color: string) {
    L.fb.textContent = txt;
    L.fb.style.color = color;
    L.fb.classList.remove("go");
    void L.fb.offsetWidth;
    L.fb.classList.add("go");
  }

  private drawLane(i: number) {
    const L = this.lanes[i];
    const H = this.trackH;
    const ty = TARGET * H;
    for (let k = 0; k < this.chart.length; k++) {
      const n = this.chart[k];
      const dt = n.t - this.t;
      if (dt > TRAVEL) break;
      let el = L.notes.get(k);
      if (dt < -0.5) {
        if (el) {
          el.remove();
          L.notes.delete(k);
        }
        continue;
      }
      if (!el) {
        if (L.judged.has(k)) continue;
        el = document.createElement("div");
        el.className = "dz-note";
        el.innerHTML = ARROW;
        el.style.color = COL[n.d];
        (el.firstElementChild as HTMLElement).style.transform = `rotate(${ROT[n.d]}deg)`;
        L.track.appendChild(el);
        L.notes.set(k, el);
      }
      if (!el.classList.contains("hit")) el.style.top = `${(ty + (dt / TRAVEL) * (H - ty + 40)).toFixed(1)}px`;
    }
  }

  private animStage(dt: number, t: number) {
    this.beatPulse = damp(this.beatPulse, 0, 6, dt);
    this.mirror.rotation.y += dt * 0.8;
    this.dots.rotation.y += dt * 0.35;
    this.dots.rotation.x = Math.sin(t * 0.3) * 0.15;
    // tiles: a travelling wave of colour, flaring on the beat and under the dancers who hit
    const { cols, rows } = this.tilesN;
    const pal = ["#ff4fd8", "#2fc8ff", "#ffd23f", "#3fdf6a", "#9b5cff"];
    const ph = Math.floor(t / BEAT);
    const tmp = new THREE.Color();
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c;
        const on = (c + r + ph) % 3 === 0;
        tmp.set(pal[(c * 3 + r + ph) % pal.length]);
        const lvl = on ? 0.55 + this.beatPulse * 0.45 : 0.12;
        // under a dancer with a glow
        const x = (c - (cols - 1) / 2) * 1.32;
        let boost = 0;
        this.dancerX.forEach((dx, i) => {
          if (Math.abs(dx - x) < 0.9 && r >= 1 && r <= 2) {
            const L = this.lanes[i];
            if (L && L.glow > 0.05) {
              boost = Math.max(boost, L.glow);
              tmp.set(this.players[i].char.color);
            }
          }
        });
        this.tileCol[k].copy(tmp).multiplyScalar(Math.max(lvl, boost));
        this.tiles.setColorAt(k, this.tileCol[k]);
      }
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    // the equaliser and the neon flicker
    this.eq.forEach((b, k) => {
      const h = 0.25 + Math.abs(Math.sin(t * (3 + k * 0.7) + k)) * 0.55 + this.beatPulse * 0.35;
      b.scale.y = h;
      b.position.y = 0.15 + h / 2;
    });
    this.neon.forEach((m, k) => (m.opacity = 0.82 + Math.sin(t * 9 + k * 2) * 0.06 + this.beatPulse * 0.12));
    this.mirror.scale.setScalar(1 + this.beatPulse * 0.05);
  }

  protected outroStep(dt: number) {
    this.animStage(dt, this.t + (this.outT += dt));
  }
  private outT = 0;

  protected celebrate(res: { place: number[] }) {
    super.celebrate(res);
    this.avatars.forEach((a) => {
      a.pos.y = 0;
      a.yaw = 0;
    });
  }
}

const def: MiniDef = {
  id: "danse",
  name: "Dance Arrows",
  icon: "💃",
  color: "#ff4fd8",
  tagline: "Push the right arrows on the beat.",
  rules: "Arrows rise up your lane: push the stick their way as they hit the circle. Perfect, Good or Miss: chain combos to multiply.",
  controls: { stick: "Push the arrow's way" },
  modes: ["ffa"],
  length: 40,
  music: null,
  create: (ctx) => new Danse(ctx),
};
export default def;
