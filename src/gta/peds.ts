import * as THREE from "three";
import type { Person3 } from "./people3d";
import type { Roads } from "./roads";

/**
 * The game's passers-by (src/gta): a population kept round you the way the open-world games do it —
 * born on the pavements out of reach, gone once far behind — each one a zkSNARK in 3D (drawn by
 * people3d.ts). They walk the pavements and cross at the corners (the traffic waits for them), stop
 * to talk in twos, take a call, jog; they wave at you, get out of the way, run when a car comes at
 * them or a fight starts, go down when hit and get back up; and when a block is mined the street
 * cheers it. What they say is the city's: the block, the mempool, the price of a coffee in ZEC.
 */

type Mode = "walk" | "chat" | "phone" | "idle" | "jog" | "flee" | "cheer" | "wave";

interface Line {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  len: number;
}

export interface Ped {
  key: string;
  id: number;
  pos: THREE.Vector3;
  heading: number;
  line: Line;
  s: number;
  dir: 1 | -1;
  speed: number;
  mode: Mode;
  modeT: number;
  /** Who it talks with (a pair stands facing). */
  mate: Ped | null;
  face: THREE.Vector3 | null;
  knockT: number;
  knockV: THREE.Vector3;
  knockSide: number;
  floor: number;
  greeted: number;
  /** Crossing to another pavement: the point it heads for. */
  cross: { x: number; z: number; line: Line; s: number } | null;
  /** Stepping round a post: how far off its line (m) and for how long. */
  side: number;
  sideT: number;
}

export interface PedWorld {
  /** A body can stand there (the street's solid shape), and the floor. */
  free(x: number, z: number): boolean;
  /** A wall or a building there (not a lamp post or a tree: those are stepped round). */
  wall(x: number, z: number): boolean;
  floor(x: number, z: number): number;
  /** On the asphalt. */
  road(x: number, z: number): boolean;
}

export type Crowd = "few" | "normal" | "busy";

const TARGET: Record<Crowd, number> = { few: 24, normal: 60, busy: 88 };
/** Born between NEAR and FAR from you (behind you if it can), gone past GONE: all within the 3D bodies' reach. */
const NEAR = 14;
const FAR = 38;
const GONE = 46;

const LINES_CITY = [
  "Did you see the last block?",
  "Shielded by default, obviously.",
  "My coffee cost 0.004 ZEC.",
  "Nice weather for a transaction.",
  "I lost my seed phrase again…",
  "Have you tried the ZK PARTY?",
  "The NU7 tower is something.",
  "Selective disclosure, my friend.",
  "I only use viewing keys.",
  "Where's the MEMPOOL HQ?",
  "Halo 2, no trusted setup!",
  "Just sent a memo to my mom.",
];
const LINES_CHAT = ["…and then the block was empty!", "No way.", "Shielded, of course.", "Ha! Same.", "Tell me about it.", "Orchard or Sapling?", "Did you mint a ZSA?", "Totally private."];
const LINES_FLEE = ["AAH!", "Run!", "Watch out!", "Not again!", "Call the police!", "My parcel!"];
const LINES_PHONE = ["Yeah, I'm on Mempool Avenue.", "No, the shielded one.", "Send it to my unified address.", "I'll call you back."];

/** A speech bubble over a head: a canvas sprite, a few at a time. */
class Bubble {
  readonly sprite: THREE.Sprite;
  private canvas = document.createElement("canvas");
  private tex: THREE.CanvasTexture;
  t = 0;
  ped: Ped | null = null;
  constructor() {
    this.canvas.width = 512;
    this.canvas.height = 96;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false }));
    this.sprite.renderOrder = 6;
    this.sprite.visible = false;
  }
  say(p: Ped, text: string, tone: "talk" | "shout" | "gold") {
    const g = this.canvas.getContext("2d")!;
    g.clearRect(0, 0, 512, 96);
    g.font = "700 30px Archivo, Roboto, sans-serif";
    const w = Math.min(500, g.measureText(text).width + 40);
    const x = (512 - w) / 2;
    g.fillStyle = tone === "shout" ? "rgba(255,90,79,0.96)" : tone === "gold" ? "rgba(244,183,40,0.97)" : "rgba(250,250,247,0.96)";
    g.beginPath();
    g.roundRect(x, 8, w, 62, 18);
    g.fill();
    g.beginPath();
    g.moveTo(256 - 10, 69);
    g.lineTo(256, 88);
    g.lineTo(256 + 10, 69);
    g.fill();
    g.fillStyle = tone === "talk" ? "#15151b" : "#0b0b10";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 256, 40, 470);
    this.tex.needsUpdate = true;
    this.sprite.scale.set(2.6, 2.6 * (96 / 512), 1);
    this.ped = p;
    this.t = tone === "shout" ? 1.6 : 3;
    this.sprite.visible = true;
  }
  update(dt: number) {
    if (!this.ped) return;
    this.t -= dt;
    const p = this.ped.pos;
    this.sprite.position.set(p.x, p.y + 2.05, p.z);
    (this.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, this.t * 3);
    if (this.t <= 0) {
      this.ped = null;
      this.sprite.visible = false;
    }
  }
}

export class Peds {
  readonly group = new THREE.Group();
  private lines: Line[] = [];
  private peds: Ped[] = [];
  private bubbles: Bubble[] = [];
  private n = 0;
  private chatterT = 2;
  private seenBlock = 0;
  crowd: Crowd = "normal";
  /** At most this many (what the 3D bodies can take now). */
  room = 999;
  /** The faces of the town: 140 zkSNARKs drawn once (their pictures are read once and kept). */
  private pool = Array.from({ length: 140 }, () => 1 + Math.floor(Math.random() * 10000));
  private scale: number;

  constructor(scene: THREE.Scene) {
    this.group.name = "gta:peds";
    scene.add(this.group);
    for (let i = 0; i < 6; i++) {
      const b = new Bubble();
      this.bubbles.push(b);
      this.group.add(b.sprite);
    }
    this.scale = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches ? 0.5 : 1;
  }

  /** The pavements: a line along each side of every street, a little off its kerb, where a body can walk. */
  build(roads: Roads, world: PedWorld) {
    if (this.lines.length) return;
    for (const r of roads.rects) {
      const w = r.axis === "x" ? r.z1 - r.z0 : r.x1 - r.x0;
      for (const side of [-1, 1]) {
        // a few lines out from the kerb: the first that is free wins where they overlap (a low wall,
        // a planter strip along the kerb pushes the walk further in)
        const mine: Line[] = [];
        for (const k of [1.05, 1.7, 2.4, 3.1]) {
          const off = r.at + side * (w / 2 + k);
          const a = r.axis === "x" ? r.x0 : r.z0,
            b = r.axis === "x" ? r.x1 : r.z1;
          let start: number | null = null;
          for (let s = a; s <= b + 0.01; s += 1) {
            const x = r.axis === "x" ? s : off,
              z = r.axis === "x" ? off : s;
            const ok = !world.wall(x, z) && !world.road(x, z);
            if (ok && start === null) start = s;
            if ((!ok || s + 1 > b) && start !== null) {
              const end = ok ? s : s - 1;
              if (end - start > 8 && !mine.some((m) => (r.axis === "x" ? Math.min(m.bx, end) - Math.max(m.ax, start!) : Math.min(m.bz, end) - Math.max(m.az, start!)) > 3)) {
                mine.push(r.axis === "x" ? { ax: start, az: off, bx: end, bz: off, len: end - start } : { ax: off, az: start, bx: off, bz: end, len: end - start });
              }
              start = null;
            }
          }
        }
        this.lines.push(...mine);
      }
    }
  }

  get count() {
    return this.peds.length;
  }

  private at(l: Line, s: number, out: THREE.Vector3) {
    const k = s / l.len;
    return out.set(l.ax + (l.bx - l.ax) * k, 0, l.az + (l.bz - l.az) * k);
  }

  private spawn(x: number, z: number, world: PedWorld, fx: number, fz: number) {
    // a pavement point in the ring round you, out of sight behind you for the first tries
    for (let tries = 0; tries < 16; tries++) {
      const l = this.lines[Math.floor(Math.random() * this.lines.length)];
      if (!l) return;
      const s = Math.random() * l.len;
      const p = this.at(l, s, new THREE.Vector3());
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < NEAR || d > FAR) continue;
      // not on top of someone else (no single file of strangers)
      if (this.peds.some((q) => Math.abs(q.pos.x - p.x) + Math.abs(q.pos.z - p.z) < 3.5)) continue;
      // half of them out of sight behind you, half far ahead (in view, past where a pop shows)
      const ahead = ((p.x - x) * fx + (p.z - z) * fz) / d;
      if (tries < 10 && (this.n % 2 ? ahead > 0.2 : ahead < 0.5 || d < 28)) continue;
      p.y = world.floor(p.x, p.z);
      const r = Math.random();
      const make = (mode: Mode, ps: THREE.Vector3, ss: number): Ped => ({
        key: `g${++this.n}`,
        id: this.pool[Math.floor(Math.random() * this.pool.length)],
        pos: ps,
        heading: 0,
        line: l,
        s: ss,
        dir: Math.random() < 0.5 ? 1 : -1,
        speed: mode === "jog" ? 2.8 + Math.random() * 0.8 : 1.1 + Math.random() * 0.5,
        mode,
        modeT: mode === "walk" || mode === "jog" ? 20 + Math.random() * 30 : 8 + Math.random() * 18,
        mate: null,
        face: null,
        knockT: -1,
        knockV: new THREE.Vector3(),
        knockSide: 1,
        floor: ps.y,
        greeted: 0,
        cross: null,
        side: 0,
        sideT: 0,
      });
      if (r < 0.18) {
        // two talking, facing each other
        const a = make("chat", p.clone(), s);
        const s2 = Math.min(l.len, s + 1.1);
        const b = make("chat", this.at(l, s2, new THREE.Vector3()).setY(p.y), s2);
        a.mate = b;
        b.mate = a;
        a.modeT = b.modeT;
        this.peds.push(a, b);
      } else this.peds.push(make(r < 0.28 ? "phone" : r < 0.36 ? "jog" : r < 0.42 ? "idle" : "walk", p, s));
      return;
    }
  }

  /** Each frame: births and departures round (x, z), everyone's step, the bubbles. */
  update(dt: number, me: { x: number; z: number; onFoot: boolean; speed: number; id: number; fx: number; fz: number }, world: PedWorld, live: { height: number; at: number; mempool: number }) {
    if (!this.lines.length) return;
    const target = Math.min(Math.round(TARGET[this.crowd] * this.scale), this.room);
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (Math.hypot(p.pos.x - me.x, p.pos.z - me.z) > GONE && p.knockT < 0) {
        if (p.mate) p.mate.mate = null;
        this.peds.splice(i, 1);
      }
    }
    for (let k = 0; k < 3 && this.peds.length < target; k++) this.spawn(me.x, me.z, world, me.fx, me.fz);
    // a new block: the street cheers it
    if (live.at && live.at !== this.seenBlock) {
      const fresh = this.seenBlock !== 0;
      this.seenBlock = live.at;
      if (fresh) {
        let said = false;
        for (const p of this.peds)
          if (Math.hypot(p.pos.x - me.x, p.pos.z - me.z) < 35 && p.mode !== "flee" && p.knockT < 0) {
            p.mode = "cheer";
            p.modeT = 2.2 + Math.random();
            if (!said && Math.random() < 0.6) {
              said = true;
              this.say(p, `Block ${live.height.toLocaleString("en-US")}!`, "gold");
            }
          }
      }
    }
    for (const p of this.peds) this.step(p, dt, me, world);
    // now and then someone says something
    this.chatterT -= dt;
    if (this.chatterT <= 0) {
      this.chatterT = 3 + Math.random() * 4;
      const near = this.peds.filter((p) => p.knockT < 0 && Math.hypot(p.pos.x - me.x, p.pos.z - me.z) < 18);
      const p = near[Math.floor(Math.random() * near.length)];
      if (p) {
        const pool = p.mode === "chat" ? LINES_CHAT : p.mode === "phone" ? LINES_PHONE : [...LINES_CITY, `${live.mempool} tx waiting, I'm one of them.`, `Next block any second now.`];
        this.say(p, pool[Math.floor(Math.random() * pool.length)], "talk");
      }
    }
    for (const b of this.bubbles) b.update(dt);
  }

  private say(p: Ped, text: string, tone: "talk" | "shout" | "gold") {
    if (this.bubbles.some((b) => b.ped === p)) return;
    const b = this.bubbles.find((x) => !x.ped) ?? this.bubbles.reduce((a, c) => (c.t < a.t ? c : a));
    b.say(p, text, tone);
  }

  private step(p: Ped, dt: number, me: { x: number; z: number; onFoot: boolean; speed: number; id: number }, world: PedWorld) {
    // knocked over: flung, down a few seconds, back up
    if (p.knockT >= 0) {
      p.knockT += dt;
      if (p.knockT < 0.7) {
        p.pos.addScaledVector(p.knockV, dt);
        p.knockV.multiplyScalar(Math.exp(-dt * 3));
      }
      if (p.knockT > 3.6) {
        p.knockT = -1;
        p.mode = "flee";
        p.modeT = 3;
        p.face = null;
      }
      return;
    }
    p.modeT -= dt;
    const dx = p.pos.x - me.x,
      dz = p.pos.z - me.z;
    const dMe = Math.hypot(dx, dz);
    // a car coming fast at them: out of the way
    if (!me.onFoot && me.speed > 9 && dMe < 9 && p.mode !== "flee") this.scare(p, me.x, me.z, Math.random() < 0.35);
    // you walking up slowly: a wave and a hello
    if (me.onFoot && me.speed < 3 && dMe < 2.6 && performance.now() - p.greeted > 20000 && (p.mode === "walk" || p.mode === "idle" || p.mode === "phone")) {
      p.greeted = performance.now();
      p.mode = "wave";
      p.modeT = 1.8;
      p.face = new THREE.Vector3(-dx, 0, -dz).normalize();
      if (Math.random() < 0.7) this.say(p, Math.random() < 0.5 ? `Hey #${me.id}!` : "Nice hood.", "talk");
    }
    let vx = 0,
      vz = 0;
    if (p.mode === "flee") {
      // running from where the trouble is, along whatever is free
      const l = Math.max(0.01, dMe);
      vx = (dx / l) * 4.4;
      vz = (dz / l) * 4.4;
      if (p.modeT <= 0) {
        p.mode = "walk";
        p.modeT = 20;
        this.snap(p);
      }
    } else if (p.mode === "walk" || p.mode === "jog") {
      if (p.cross) {
        // crossing to the pavement opposite
        const cx = p.cross.x - p.pos.x,
          cz = p.cross.z - p.pos.z;
        const d = Math.hypot(cx, cz);
        if (d < 0.3) {
          p.line = p.cross.line;
          p.s = p.cross.s;
          p.cross = null;
        } else {
          vx = (cx / d) * p.speed;
          vz = (cz / d) * p.speed;
        }
      } else {
        p.s += p.dir * p.speed * dt;
        if (p.s < 0 || p.s > p.line.len) {
          p.s = Math.max(0, Math.min(p.line.len, p.s));
          // at the end of the pavement: on round the corner, across the street, or back
          const end = this.at(p.line, p.s, new THREE.Vector3());
          const next = this.lines.filter((l) => l !== p.line && (Math.hypot(l.ax - end.x, l.az - end.z) < 14 || Math.hypot(l.bx - end.x, l.bz - end.z) < 14));
          const go = next[Math.floor(Math.random() * next.length)];
          if (go && Math.random() < 0.8) {
            const toA = Math.hypot(go.ax - end.x, go.az - end.z) < Math.hypot(go.bx - end.x, go.bz - end.z);
            const s = toA ? 0 : go.len;
            const t = this.at(go, s, new THREE.Vector3());
            p.cross = { x: t.x, z: t.z, line: go, s };
            p.dir = toA ? 1 : -1;
          } else p.dir = p.dir > 0 ? -1 : 1;
        }
        const want = this.at(p.line, p.s, new THREE.Vector3());
        // a post ahead on the line: step a little to the side of it for a moment
        const lx = (p.line.bx - p.line.ax) / p.line.len,
          lz = (p.line.bz - p.line.az) / p.line.len;
        const ahead = this.at(p.line, Math.max(0, Math.min(p.line.len, p.s + p.dir * 0.8)), new THREE.Vector3());
        if (p.sideT <= 0 && !world.free(ahead.x + -lz * p.side, ahead.z + lx * p.side)) {
          for (const o of [0.8, -0.8, 1.3, -1.3])
            if (world.free(ahead.x - lz * o, ahead.z + lx * o)) {
              p.side = o;
              p.sideT = 1.4;
              break;
            }
        }
        p.sideT -= dt;
        if (p.sideT <= 0) p.side *= Math.exp(-dt * 2);
        want.x += -lz * p.side;
        want.z += lx * p.side;
        vx = (want.x - p.pos.x) / Math.max(dt, 1e-3);
        vz = (want.z - p.pos.z) / Math.max(dt, 1e-3);
        const v = Math.hypot(vx, vz);
        if (v > p.speed * 1.5) (vx *= (p.speed * 1.5) / v), (vz *= (p.speed * 1.5) / v);
      }
      if (p.modeT <= 0 && p.mode === "walk" && !p.cross) {
        const r = Math.random();
        p.mode = r < 0.3 ? "idle" : r < 0.45 ? "phone" : "walk";
        p.modeT = p.mode === "walk" ? 20 + Math.random() * 20 : 5 + Math.random() * 10;
      }
    } else {
      // standing: talking, on the phone, waving, cheering, looking round
      if (p.mate) {
        const mx = p.mate.pos.x - p.pos.x,
          mz = p.mate.pos.z - p.pos.z;
        p.face = new THREE.Vector3(mx, 0, mz).normalize();
      }
      if (p.modeT <= 0) {
        if (p.mate && p.mode === "chat") p.mate.mate = null;
        p.mate = null;
        p.face = null;
        p.mode = "walk";
        p.modeT = 20 + Math.random() * 20;
      }
    }
    // keep off the others a little (a step aside, not a wall)
    const nx = p.pos.x + vx * dt,
      nz = p.pos.z + vz * dt;
    if (world.free(nx, nz) || (!world.wall(nx, nz) && (p.mode === "walk" || p.mode === "jog" || p.cross))) {
      p.pos.x = nx;
      p.pos.z = nz;
    } else if (p.mode === "flee") p.modeT = Math.min(p.modeT, 0.2);
    else if (!p.cross) p.dir = p.dir > 0 ? -1 : 1;
    p.floor += (world.floor(p.pos.x, p.pos.z) - p.floor) * Math.min(1, dt * 12);
    p.pos.y = p.floor;
    if (Math.hypot(vx, vz) > 0.1) p.heading = Math.atan2(vx, vz);
  }

  /** Back to its pavement after running off (the nearest point of the nearest line). */
  private snap(p: Ped) {
    let best: Line | null = null,
      bs = 0,
      bd = Infinity;
    const q = new THREE.Vector3();
    for (const l of this.lines) {
      const ex = l.bx - l.ax,
        ez = l.bz - l.az;
      const t = Math.max(0, Math.min(1, ((p.pos.x - l.ax) * ex + (p.pos.z - l.az) * ez) / (l.len * l.len)));
      this.at(l, t * l.len, q);
      const d = Math.hypot(q.x - p.pos.x, q.z - p.pos.z);
      if (d < bd) (bd = d), (best = l), (bs = t * l.len);
    }
    if (!best) return;
    const t = this.at(best, bs, q);
    p.cross = { x: t.x, z: t.z, line: best, s: bs };
  }

  private scare(p: Ped, fx: number, fz: number, shout: boolean) {
    if (p.knockT >= 0) return;
    if (p.mate) p.mate.mate = null;
    p.mate = null;
    p.cross = null;
    p.mode = "flee";
    p.modeT = 2.5 + Math.random() * 2;
    p.face = null;
    void fx;
    void fz;
    if (shout) this.say(p, LINES_FLEE[Math.floor(Math.random() * LINES_FLEE.length)], "shout");
  }

  /** Trouble at (x, z): everyone within `r` runs from it. */
  panic(x: number, z: number, r: number) {
    let shouted = 0;
    for (const p of this.peds) if (Math.hypot(p.pos.x - x, p.pos.z - z) < r) this.scare(p, x, z, shouted++ < 2 && Math.random() < 0.6);
  }

  /** Hit within `r` of (x, z) going along (vx, vz): down they go. How many. */
  knock(x: number, z: number, vx: number, vz: number, r: number) {
    let n = 0;
    const sp = Math.hypot(vx, vz) || 1;
    for (const p of this.peds) {
      if (p.knockT >= 0) continue;
      const dx = p.pos.x - x,
        dz = p.pos.z - z;
      if (dx * dx + dz * dz > r * r) continue;
      const l = Math.hypot(dx, dz) || 1;
      const power = Math.max(2.4, Math.min(9, sp * 0.5));
      p.knockV.set((vx / sp + (dx / l) * 0.6) * power, 0, (vz / sp + (dz / l) * 0.6) * power);
      p.knockT = 0;
      p.knockSide = Math.random() < 0.5 ? -1 : 1;
      p.mode = "idle";
      p.cross = null;
      if (p.mate) p.mate.mate = null;
      p.mate = null;
      n++;
    }
    if (n) this.panic(x, z, 14);
    return n;
  }

  /** Those in the road (the traffic waits for them). */
  *inRoad(world: PedWorld) {
    for (const p of this.peds) if (p.cross && world.road(p.pos.x, p.pos.z)) yield { x: p.pos.x, z: p.pos.z };
  }

  /** For the 3D bodies and the radar. */
  near(x: number, z: number, r: number): Person3[] {
    const out: Person3[] = [];
    for (const p of this.peds) {
      if ((p.pos.x - x) ** 2 + (p.pos.z - z) ** 2 > r * r) continue;
      out.push({
        key: p.key,
        id: p.id,
        own: true,
        pos: (o) => o.copy(p.pos),
        down: () => {
          if (p.knockT < 0) return { k: 0, side: p.knockSide };
          const t = p.knockT;
          const fall = Math.min(1, t / 0.32);
          const up = t > 3.1 ? Math.min(1, (t - 3.1) / 0.5) : 0;
          return { k: (1 - (1 - fall) ** 2) * (1 - up * up), side: p.knockSide };
        },
        face: () => p.face ?? (p.mode === "walk" || p.mode === "jog" || p.mode === "flee" ? null : new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading))),
        pose: () => (p.mode === "chat" ? "talk" : p.mode === "phone" ? "phone" : p.mode === "cheer" ? "cheer" : p.mode === "wave" ? "wave" : null),
        hide: () => {},
        alive: () => this.peds.includes(p),
      });
    }
    return out;
  }

  positions() {
    return this.peds.map((p) => ({ x: p.pos.x, z: p.pos.z }));
  }

  clear() {
    this.peds = [];
    for (const b of this.bubbles) (b.ped = null), (b.sprite.visible = false);
  }

  show(on: boolean) {
    this.group.visible = on;
    if (!on) this.clear();
  }
}
