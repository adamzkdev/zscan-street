import * as THREE from "three";
import { faces } from "./faces";
import type { Act } from "./human";
import type { Person3 } from "./people3d";
import type { Roads } from "./roads";

/**
 * The game's passers-by (src/gta): a population kept round you the way the open-world games do it —
 * born on the pavements out of reach, gone once far behind — each one a zkSNARK in 3D (drawn by
 * people3d.ts). They walk the pavements and cross at the corners (the traffic waits for them), stop
 * to talk in twos (a real exchange, line after line), take a call, jog; they look at you, wave, get
 * out of the way, run when a car comes at them.
 *
 * And they stand up for themselves. Each has a temper: hit one and a coward runs screaming, a caller
 * gets out of reach and phones the police on you, a fighter puts its fists up and comes at you — it
 * punches, you get hurt. Three or four good punches put anyone down (out cold a while, then up and
 * away). Round a fight the street reacts: some run, some film it on their phones, some gather and
 * cheer. Now and then two of them fall out on their own — words first, then fists.
 */

type Mode = "walk" | "chat" | "phone" | "idle" | "jog" | "flee" | "cheer" | "wave" | "fight" | "angry" | "argue" | "film" | "watch" | "call" | "hands" | "listen";
type Temper = "coward" | "fighter" | "caller";

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
  /** How long it stays down (s). */
  downFor: number;
  floor: number;
  greeted: number;
  /** Crossing to another pavement: the point it heads for. */
  cross: { x: number; z: number; line: Line; s: number } | null;
  /** Stepping round a post: how far off its line (m) and for how long. */
  side: number;
  sideT: number;
  // ---- the fight
  hp: number;
  temper: Temper;
  /** Who it fights (you, or another passer-by). */
  foe: Ped | "me" | null;
  guard: number;
  punchT: number;
  punchSide: number;
  nextPunch: number;
  hitT: number;
  /** A stagger (m/s), dying away. */
  push: THREE.Vector3;
  /** Where the trouble it watches (or runs from) is. */
  watch: { x: number; z: number } | null;
  /** To phone the police once out of reach: how long the call takes (0: no call). */
  callT: number;
  /** A conversation: its lines, whose turn, when the next. */
  convo: string[] | null;
  convoI: number;
  convoT: number;
  /** Last said something to you (ms). */
  barked: number;
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

/** What the street tells the game. */
export interface PedEvents {
  /** A fist landed on you (damage, from where). */
  hitMe(dmg: number, x: number, z: number): void;
  /** Someone phoned the police about you. */
  report(why: string): void;
}

export interface Me {
  x: number;
  z: number;
  onFoot: boolean;
  speed: number;
  id: number;
  fx: number;
  fz: number;
  /** Fists up. */
  guard?: boolean;
  /** Down (out of the fight). */
  down?: boolean;
}

export type Crowd = "few" | "normal" | "busy";

const TARGET: Record<Crowd, number> = { few: 24, normal: 60, busy: 88 };
/** Born between NEAR and FAR from you (behind you if it can), gone past GONE: all within the 3D bodies' reach. */
const NEAR = 14;
const FAR = 38;
const GONE = 46;
const PUNCH = 0.36;

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

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
/** Two talking: each one an exchange, the lines said in turn. */
const CONVOS = [
  ["Did you see the last block?", "Empty again. Shielded, though.", "Everything's shielded these days.", "As it should be."],
  ["Orchard or Sapling?", "Orchard. I'm not a dinosaur.", "Fair."],
  ["I minted a ZSA last night.", "What's it called?", "SNARKCOIN.", "…of course it is."],
  ["Lunch at the shōtengai?", "Only if you pay in ZEC.", "Deal. Shielded."],
  ["They say NU7 is close.", "They said that last month.", "This time it's different.", "Sure it is."],
  ["Is that your car on Orchard?", "The gold one? I wish.", "Someone just took it for a spin."],
  ["My viewing key, my rules.", "Selective disclosure, baby.", "Ha! Exactly."],
  ["Lost my seed phrase again.", "Again?!", "It's written on a napkin. Somewhere."],
  ["The Titan comes out at eight.", "I'm watching from the Needle.", "Bring snacks."],
  ["Have you been to the ZK PARTY?", "Every night.", "You have a problem.", "A private one."],
];
const LINES_FLEE = ["AAH!", "Run!", "Watch out!", "Not again!", "Call the police!", "My parcel!", "Help!"];
const LINES_PHONE = ["Yeah, I'm on Mempool Avenue.", "No, the shielded one.", "Send it to my unified address.", "I'll call you back."];
const LINES_HURT = ["Ow!", "Hey!", "Ugh!", "What the—", "Ouch!"];
const LINES_SQUARE = ["You want some?!", "Come on then!", "Big mistake.", "Oh, it's on!", "Wrong zkSNARK, pal."];
const LINES_GUARD = ["Whoa, easy!", "Put those away!", "I don't want trouble.", "Relax, friend."];
const LINES_BUMP = ["Hey, watch it!", "Excuse you!", "Rude.", "Look where you're going!"];
const LINES_CALL = ["Police? Someone's beating people up!", "Hello? There's a fight on the street!", "Yes, a zkSNARK just punched me!"];
const LINES_FILM = ["This is going online.", "I'm filming this.", "Get it on camera!", "Oh, the views."];
const LINES_CHEER = ["Fight! Fight!", "Hit him!", "Ooooh!", "Get him!"];
const LINES_WIN = ["Stay down!", "That's what I thought.", "Next.", "Shielded and unbeaten."];
const ARGUE = [
  ["You bumped my parcel!", "Then watch your parcel.", "Say that again.", "You heard me."],
  ["That was my taxi!", "Finders keepers.", "Oh, you're asking for it."],
  ["You spilled my coffee!", "It was decaf anyway.", "That's it!"],
  ["Stop following me.", "I'm walking here!", "Not anymore you're not."],
];

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
    g.font = "600 30px Archivo, Roboto, sans-serif";
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
    this.sprite.scale.set(1.9, 1.9 * (96 / 512), 1);
    this.ped = p;
    this.t = tone === "shout" ? 1.8 : 2.8;
    this.sprite.visible = true;
  }
  update(dt: number) {
    if (!this.ped) return;
    this.t -= dt;
    const p = this.ped.pos;
    this.sprite.position.set(p.x, p.y + (this.ped.knockT >= 0 ? 0.9 : 2.1), p.z);
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
  /** The next falling-out between two of them (s). */
  private brawlT = 35 + Math.random() * 30;
  crowd: Crowd = "normal";
  /** At most this many (what the 3D bodies can take now). */
  room = 999;
  /** The faces of the town: 140 zkSNARKs (their pictures read once, one after the other, and kept). */
  private pool = Array.from({ length: 140 }, () => 1 + Math.floor(Math.random() * 10000));
  private scale: number;
  events: PedEvents = { hitMe: () => {}, report: () => {} };
  /** Knocked out by you, this game. */
  kos = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = "gta:peds";
    scene.add(this.group);
    for (let i = 0; i < 10; i++) {
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

  /** A face for a newcomer: one of the town's whose picture is in (none yet: nobody comes). */
  private face() {
    const ready = this.pool.filter((id) => faces.ready(id));
    return ready.length ? ready[Math.floor(Math.random() * ready.length)] : 0;
  }

  private spawn(x: number, z: number, world: PedWorld, fx: number, fz: number) {
    if (!this.face()) return;
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
      const make = (mode: Mode, ps: THREE.Vector3, ss: number): Ped => {
        const t = Math.random();
        return {
          key: `g${++this.n}`,
          id: this.face(),
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
          downFor: 3.6,
          floor: ps.y,
          greeted: 0,
          cross: null,
          side: 0,
          sideT: 0,
          hp: 100,
          temper: t < 0.3 ? "fighter" : t < 0.45 ? "caller" : "coward",
          foe: null,
          guard: 0,
          punchT: -1,
          punchSide: 1,
          nextPunch: 0,
          hitT: 9,
          push: new THREE.Vector3(),
          watch: null,
          callT: 0,
          convo: null,
          convoI: 0,
          convoT: 0,
          barked: 0,
        };
      };
      if (r < 0.18) {
        // two talking, facing each other
        const a = make("chat", p.clone(), s);
        const s2 = Math.min(l.len, s + 1.1);
        const b = make("chat", this.at(l, s2, new THREE.Vector3()).setY(p.y), s2);
        a.mate = b;
        b.mate = a;
        a.modeT = b.modeT;
        a.convo = pick(CONVOS);
        a.convoT = 0.5 + Math.random() * 2;
        this.peds.push(a, b);
      } else this.peds.push(make(r < 0.28 ? "phone" : r < 0.36 ? "jog" : r < 0.42 ? "idle" : "walk", p, s));
      return;
    }
  }

  /** Each frame: births and departures round you, everyone's step, the fights, the bubbles. */
  update(dt: number, me: Me, world: PedWorld, live: { height: number; at: number; mempool: number }) {
    if (!this.lines.length) return;
    const target = Math.min(Math.round(TARGET[this.crowd] * this.scale), this.room);
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (Math.hypot(p.pos.x - me.x, p.pos.z - me.z) > GONE && p.knockT < 0) this.remove(i);
    }
    for (let k = 0; k < 3 && this.peds.length < target; k++) this.spawn(me.x, me.z, world, me.fx, me.fz);
    // a new block: the street cheers it
    if (live.at && live.at !== this.seenBlock) {
      const fresh = this.seenBlock !== 0;
      this.seenBlock = live.at;
      if (fresh) {
        let said = false;
        for (const p of this.peds)
          if (Math.hypot(p.pos.x - me.x, p.pos.z - me.z) < 35 && this.calm(p)) {
            this.leave(p);
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
      this.chatterT = 4 + Math.random() * 5;
      const near = this.peds.filter((p) => p.knockT < 0 && !p.convo && !p.mate && Math.hypot(p.pos.x - me.x, p.pos.z - me.z) < 18 && (p.mode === "walk" || p.mode === "phone" || p.mode === "idle"));
      const p = near[Math.floor(Math.random() * near.length)];
      if (p) this.say(p, p.mode === "phone" ? pick(LINES_PHONE) : pick([...LINES_CITY, `${live.mempool} tx waiting, I'm one of them.`, `Next block any second now.`]), "talk");
    }
    // a falling-out: two of them, words, then fists
    this.brawlT -= dt;
    if (this.brawlT <= 0) {
      this.brawlT = 50 + Math.random() * 50;
      this.brawl(me);
    }
    for (const b of this.bubbles) b.update(dt);
  }

  private remove(i: number) {
    const p = this.peds[i];
    if (p.mate) p.mate.mate = null;
    this.peds.splice(i, 1);
    for (const q of this.peds) if (q.foe === p) this.calmDown(q);
  }

  private calm(p: Ped) {
    return p.knockT < 0 && (p.mode === "walk" || p.mode === "idle" || p.mode === "phone" || p.mode === "jog" || p.mode === "chat" || p.mode === "wave");
  }

  private say(p: Ped, text: string, tone: "talk" | "shout" | "gold") {
    for (const b of this.bubbles) if (b.ped === p) b.t = Math.min(b.t, 0.01);
    const b = this.bubbles.find((x) => !x.ped) ?? this.bubbles.reduce((a, c) => (c.t < a.t ? c : a));
    b.say(p, text, tone);
  }

  private step(p: Ped, dt: number, me: Me, world: PedWorld) {
    p.hitT += dt;
    // knocked over: flung, down a while, back up
    if (p.knockT >= 0) {
      p.knockT += dt;
      if (p.knockT < 0.7) {
        p.pos.addScaledVector(p.knockV, dt);
        p.knockV.multiplyScalar(Math.exp(-dt * 3));
      }
      if (p.knockT > p.downFor) {
        p.knockT = -1;
        p.hp = Math.max(p.hp, 60);
        p.foe = null;
        p.mode = "flee";
        p.modeT = 3;
        p.face = null;
        p.guard = 0;
      }
      return;
    }
    p.modeT -= dt;
    const dx = p.pos.x - me.x,
      dz = p.pos.z - me.z;
    const dMe = Math.hypot(dx, dz);
    const now = performance.now();
    // a car coming fast at them: out of the way
    if (!me.onFoot && me.speed > 9 && dMe < 9 && p.mode !== "flee" && p.mode !== "fight") this.scare(p, Math.random() < 0.35);
    // you walking up slowly: a wave and a hello
    if (me.onFoot && !me.guard && me.speed < 3 && dMe < 2.6 && now - p.greeted > 20000 && (p.mode === "walk" || p.mode === "idle" || p.mode === "phone")) {
      p.greeted = now;
      p.mode = "wave";
      p.modeT = 1.8;
      p.face = new THREE.Vector3(-dx, 0, -dz).normalize();
      if (Math.random() < 0.7) this.say(p, Math.random() < 0.5 ? `Hey #${me.id}!` : "Nice hood.", "talk");
    }
    // you barging into them
    if (me.onFoot && me.speed > 2.4 && dMe < 0.8 && p.hitT > 1 && this.calm(p)) {
      p.hitT = 0.3;
      p.push.set(dx, 0, dz).normalize().multiplyScalar(1.6);
      if (now - p.barked > 4000) {
        p.barked = now;
        this.say(p, pick(LINES_BUMP), "talk");
      }
      if (p.temper === "fighter") this.squareUp(p, 4);
    }
    // your fists up in their face
    if (me.onFoot && me.guard && dMe < 3 && this.calm(p)) {
      if (p.temper === "fighter") {
        this.squareUp(p, 5);
        if (now - p.barked > 5000) {
          p.barked = now;
          this.say(p, pick(LINES_SQUARE), "shout");
        }
      } else {
        this.leave(p);
        p.mode = "hands";
        p.modeT = 2.5;
        if (now - p.barked > 5000) {
          p.barked = now;
          this.say(p, pick(LINES_GUARD), "talk");
        }
      }
    }
    // squared up to you: stay in its face with your fists up and it swings; back off and it calms down
    if (p.mode === "angry") {
      if (dMe < 1.5 && me.guard && Math.random() < dt * 0.7) this.fight(p, "me");
      else if (p.modeT <= 0) this.calmDown(p);
    }
    let vx = 0,
      vz = 0;
    let facing: number | null = null;
    if (p.mode === "fight" || p.mode === "argue") {
      const f = this.fightStep(p, dt, me);
      vx = f.vx;
      vz = f.vz;
      facing = f.facing;
    } else if (p.mode === "flee") {
      // running from where the trouble is, along whatever is free
      const from = p.watch ?? { x: me.x, z: me.z };
      const ox = p.pos.x - from.x,
        oz = p.pos.z - from.z;
      const l = Math.max(0.01, Math.hypot(ox, oz));
      vx = (ox / l) * 4.6;
      vz = (oz / l) * 4.6;
      if (p.modeT <= 0) {
        if (p.callT > 0) {
          p.mode = "call";
          p.modeT = p.callT;
          this.say(p, pick(LINES_CALL), "talk");
        } else {
          p.mode = "walk";
          p.modeT = 20;
          p.watch = null;
          this.snap(p);
        }
      }
    } else if (p.mode === "call") {
      // on the phone to the police: when it hangs up, they're on their way
      const from = p.watch ?? { x: me.x, z: me.z };
      facing = Math.atan2(from.x - p.pos.x, from.z - p.pos.z);
      if (p.modeT <= 0) {
        p.callT = 0;
        this.events.report("someone called the police on you");
        p.mode = "walk";
        p.modeT = 20;
        p.watch = null;
        this.snap(p);
      }
    } else if (p.mode === "film" || p.mode === "watch") {
      // round a fight: phones out, or a ring of shouting
      const w = p.watch;
      if (!w || p.modeT <= 0) {
        p.mode = "walk";
        p.modeT = 20;
        p.watch = null;
        this.snap(p);
      } else {
        const ox = p.pos.x - w.x,
          oz = p.pos.z - w.z;
        const d = Math.max(0.01, Math.hypot(ox, oz));
        const want = p.mode === "film" ? 5.5 : 3.6;
        if (Math.abs(d - want) > 0.6) {
          const k = (d > want ? -1 : 1) * Math.min(2.2, Math.abs(d - want) * 1.5);
          vx = (ox / d) * k;
          vz = (oz / d) * k;
        }
        facing = Math.atan2(-ox, -oz);
        if (p.mode === "watch" && Math.random() < dt * 0.25 && now - p.barked > 3000) {
          p.barked = now;
          this.say(p, pick(LINES_CHEER), "shout");
        }
      }
    } else if (p.mode === "listen") {
      // talking with you: facing you, still
      facing = Math.atan2(-dx, -dz);
      if (dMe > 6) p.modeT = 0;
      if (p.modeT <= 0) {
        p.mode = "walk";
        p.modeT = 20;
      }
    } else if (p.mode === "hands" || p.mode === "angry") {
      facing = Math.atan2(-dx, -dz);
      // backing off a little
      if (p.mode === "hands" && dMe < 2.2) {
        vx = (dx / Math.max(0.01, dMe)) * 0.9;
        vz = (dz / Math.max(0.01, dMe)) * 0.9;
      }
      if (p.mode === "hands" && p.modeT <= 0) {
        p.mode = "walk";
        p.modeT = 20;
      }
    } else if (p.mode === "walk" || p.mode === "jog") {
      const w = this.walkStep(p, dt, world);
      vx = w.vx;
      vz = w.vz;
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
        // the conversation: a line, then the other's, in turn
        if (p.convo) {
          p.convoT -= dt;
          if (p.convoT <= 0) {
            const who = p.convoI % 2 === 0 ? p : p.mate;
            if (dMe < 22) this.say(who, p.convo[p.convoI], "talk");
            p.convoI++;
            p.convoT = 2.6 + Math.random() * 0.8;
            if (p.convoI >= p.convo.length) {
              // another one in a while
              p.convo = null;
              p.convoI = 0;
              p.convoT = 4 + Math.random() * 5;
            }
          }
        } else if (p.mode === "chat" && p.convoT > 0) {
          p.convoT -= dt;
          if (p.convoT <= 0) ((p.convo = pick(CONVOS)), (p.convoT = 0.3));
        }
      }
      if (p.modeT <= 0) {
        if (p.mate && p.mode === "chat") p.mate.mate = null;
        p.mate = null;
        p.convo = null;
        p.face = null;
        p.mode = "walk";
        p.modeT = 20 + Math.random() * 20;
      }
    }
    // a stagger on top of it
    if (p.push.lengthSq() > 0.01) {
      vx += p.push.x;
      vz += p.push.z;
      p.push.multiplyScalar(Math.exp(-dt * 6));
    }
    const nx = p.pos.x + vx * dt,
      nz = p.pos.z + vz * dt;
    if (world.free(nx, nz) || (!world.wall(nx, nz) && (p.mode === "walk" || p.mode === "jog" || p.mode === "fight" || p.cross))) {
      p.pos.x = nx;
      p.pos.z = nz;
    } else if (p.mode === "flee") p.modeT = Math.min(p.modeT, 0.2);
    else if (!p.cross && (p.mode === "walk" || p.mode === "jog")) p.dir = p.dir > 0 ? -1 : 1;
    p.floor += (world.floor(p.pos.x, p.pos.z) - p.floor) * Math.min(1, dt * 12);
    p.pos.y = p.floor;
    if (facing !== null) p.heading = facing;
    else if (Math.hypot(vx, vz) > 0.1) p.heading = Math.atan2(vx, vz);
    // fists up (a fight, squared up) or down
    const up = p.mode === "fight" || p.mode === "angry" ? 1 : 0;
    p.guard += (up - p.guard) * Math.min(1, dt * 7);
  }

  /** Along its pavement (and across to the next). */
  private walkStep(p: Ped, dt: number, world: PedWorld) {
    let vx = 0,
      vz = 0;
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
      return { vx, vz };
    }
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
    return { vx, vz };
  }

  /** In a fight (or the words before one): close in, face the foe, swing. */
  private fightStep(p: Ped, dt: number, me: Me) {
    const foe = p.foe;
    const out = { vx: 0, vz: 0, facing: p.heading as number | null };
    if (!foe) {
      this.calmDown(p);
      return out;
    }
    const fx = foe === "me" ? me.x : foe.pos.x,
      fz = foe === "me" ? me.z : foe.pos.z;
    const dx = fx - p.pos.x,
      dz = fz - p.pos.z;
    const d = Math.max(0.01, Math.hypot(dx, dz));
    out.facing = Math.atan2(dx, dz);
    // it's over: you got away, drove off or went down; the other one is out cold or gone
    if (foe === "me" && (!me.onFoot || me.down || d > 16)) {
      if (me.down && performance.now() - p.barked > 2000) {
        p.barked = performance.now();
        this.say(p, pick(LINES_WIN), "shout");
      }
      this.calmDown(p);
      return out;
    }
    if (foe !== "me" && (foe.knockT >= 0 || !this.peds.includes(foe) || (foe.mode !== "fight" && foe.mode !== "argue"))) {
      if (foe.knockT >= 0) this.say(p, pick(LINES_WIN), "shout");
      p.foe = null;
      p.mode = "cheer";
      p.modeT = 1.6;
      return out;
    }
    // the words first
    if (p.mode === "argue") {
      if (d > 1.5) ((out.vx = (dx / d) * 1.4), (out.vz = (dz / d) * 1.4));
      if (p.modeT <= 0) this.fight(p, foe);
      return out;
    }
    // too far: come on; too close: a step back
    const sp = d > 4 ? 3.6 : 2.2;
    if (d > 1.0) ((out.vx = (dx / d) * sp), (out.vz = (dz / d) * sp));
    else if (d < 0.7) ((out.vx = (-dx / d) * 1), (out.vz = (-dz / d) * 1));
    // the swing: wound up, out, and if the foe is still there, it lands
    p.nextPunch -= dt;
    if (p.punchT < 0 && p.nextPunch <= 0 && d < 1.3 && p.hitT > 0.35) {
      p.punchT = 0;
      p.punchSide = -p.punchSide;
      p.nextPunch = (p.temper === "fighter" ? 0.7 : 1.0) + Math.random() * 0.7;
    }
    if (p.punchT >= 0) {
      const was = p.punchT;
      p.punchT += dt;
      if (was < 0.13 && p.punchT >= 0.13 && d < 1.4) {
        if (foe === "me") this.events.hitMe(4 + Math.random() * 4, p.pos.x, p.pos.z);
        else this.hurt(foe, 11 + Math.random() * 8, p.pos.x, p.pos.z, false, p);
      }
      if (p.punchT > PUNCH) p.punchT = -1;
    }
    // hurt badly: a coward or a caller gives up and runs
    if (p.hp < 30 && p.temper !== "fighter") {
      p.watch = { x: fx, z: fz };
      this.scare(p, true);
    }
    return out;
  }

  private squareUp(p: Ped, s: number) {
    if (p.mode === "fight") return;
    this.leave(p);
    p.mode = "angry";
    p.modeT = s;
  }

  /** Into a fight with `foe`. */
  private fight(p: Ped, foe: Ped | "me") {
    this.leave(p);
    p.mode = "fight";
    p.foe = foe;
    p.nextPunch = 0.35 + Math.random() * 0.4;
    p.modeT = 99;
  }

  private calmDown(p: Ped) {
    p.foe = null;
    p.punchT = -1;
    if (p.knockT >= 0) return;
    p.mode = "walk";
    p.modeT = 20;
    p.watch = null;
    this.snap(p);
  }

  /**
   * A fist lands on `p`: hurt, staggered, maybe down; and then it reacts as it is made. True if it
   * was someone to hit.
   */
  private hurt(p: Ped, dmg: number, fx: number, fz: number, byMe: boolean, by: Ped | null = null) {
    if (p.knockT >= 0) return false;
    p.hp -= dmg;
    p.hitT = 0;
    p.punchT = -1;
    const ox = p.pos.x - fx,
      oz = p.pos.z - fz;
    const l = Math.max(0.01, Math.hypot(ox, oz));
    p.heading = Math.atan2(-ox, -oz);
    p.push.set((ox / l) * 2.4, 0, (oz / l) * 2.4);
    if (p.mode !== "fight") this.leave(p);
    if (p.hp <= 0) {
      // out cold, on its back
      p.knockT = 0;
      p.knockSide = 0;
      p.downFor = 7 + Math.random() * 4;
      p.knockV.set((ox / l) * 2.2, 0, (oz / l) * 2.2);
      p.mode = "idle";
      p.foe = null;
      p.guard = 0;
      this.leave(p);
      for (const q of this.peds) if (q.foe === p && q !== by) this.calmDown(q);
      if (byMe) this.kos++;
      this.crowdReacts(p.pos.x, p.pos.z, byMe, p);
      return true;
    }
    if (p.mode !== "fight") {
      if (p.temper === "fighter" || (p.temper === "caller" && !byMe)) {
        this.fight(p, byMe ? "me" : (by ?? "me"));
        this.say(p, pick(LINES_SQUARE), "shout");
      } else {
        if (p.temper === "caller" && byMe) p.callT = 4 + Math.random() * 2;
        p.watch = { x: fx, z: fz };
        this.scare(p, false);
        this.say(p, pick(Math.random() < 0.5 ? LINES_HURT : LINES_FLEE), "shout");
      }
      if (byMe) this.crowdReacts(p.pos.x, p.pos.z, true, p);
    } else if (Math.random() < 0.3) this.say(p, pick(LINES_HURT), "shout");
    return true;
  }

  /** Trouble at (x, z): those round about run, film it, or gather and shout; one may call the police. */
  private crowdReacts(x: number, z: number, byMe: boolean, who: Ped) {
    let called = false;
    for (const q of this.peds) {
      if (q === who || q.foe || q.knockT >= 0 || q.mode === "fight" || q.mode === "argue" || q.mode === "call" || q.mode === "film" || q.mode === "watch" || q.mode === "flee") continue;
      const d = Math.hypot(q.pos.x - x, q.pos.z - z);
      if (d > 15) continue;
      const r = Math.random();
      if (byMe && !called && q.temper === "caller") {
        called = true;
        q.callT = 4 + Math.random() * 2;
        q.watch = { x, z };
        this.scare(q, false);
      } else if (r < (byMe ? 0.45 : 0.25)) {
        q.watch = { x, z };
        this.scare(q, Math.random() < 0.3);
      } else if (r < 0.72) {
        this.leave(q);
        q.mode = "film";
        q.modeT = 6 + Math.random() * 5;
        q.watch = { x, z };
        if (Math.random() < 0.3) this.say(q, pick(LINES_FILM), "talk");
      } else {
        this.leave(q);
        q.mode = "watch";
        q.modeT = 6 + Math.random() * 5;
        q.watch = { x, z };
      }
    }
  }

  private leave(q: Ped) {
    if (q.mate) q.mate.mate = null;
    q.mate = null;
    q.convo = null;
    q.cross = null;
  }

  /** Two of them fall out: a pair near you, words, then fists. */
  private brawl(me: Me) {
    const near = this.peds.filter((p) => this.calm(p) && p.mode !== "chat" && Math.hypot(p.pos.x - me.x, p.pos.z - me.z) < 30);
    for (const a of near)
      for (const b of near) {
        if (a === b || Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 9) continue;
        this.argue(a, b);
        return true;
      }
    return false;
  }

  /** `a` and `b` have words, then fight. */
  argue(a: Ped, b: Ped) {
    const words = pick(ARGUE);
    this.leave(a);
    this.leave(b);
    a.mode = b.mode = "argue";
    a.foe = b;
    b.foe = a;
    a.modeT = b.modeT = 0.8 + words.length * 1.5;
    const on = () => this.peds.includes(a) && this.peds.includes(b) && a.knockT < 0 && b.knockT < 0;
    words.forEach((w, i) => setTimeout(() => on() && (a.mode === "argue" || a.mode === "fight") && this.say(i % 2 ? b : a, w, i === words.length - 1 ? "shout" : "talk"), 400 + i * 1500));
    // the street turns to look
    setTimeout(() => on() && a.mode === "fight" && this.crowdReacts((a.pos.x + b.pos.x) / 2, (a.pos.z + b.pos.z) / 2, false, a), 1000 + words.length * 1500);
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

  private scare(p: Ped, shout: boolean) {
    if (p.knockT >= 0) return;
    this.leave(p);
    p.foe = null;
    p.mode = "flee";
    p.modeT = 2.5 + Math.random() * 2;
    p.face = null;
    if (shout) this.say(p, pick(LINES_FLEE), "shout");
  }

  /** Trouble at (x, z): everyone within `r` runs from it. */
  panic(x: number, z: number, r: number) {
    let shouted = 0;
    for (const p of this.peds)
      if (Math.hypot(p.pos.x - x, p.pos.z - z) < r && p.mode !== "fight" && p.mode !== "flee") {
        p.watch = { x, z };
        this.scare(p, shouted++ < 2 && Math.random() < 0.6);
      }
  }

  /**
   * Your fist: from (x, z) along (dx, dz), the nearest one in reach in front takes it. Who it was
   * (and whether that put them down), or null.
   */
  punch(x: number, z: number, dx: number, dz: number, dmg: number) {
    let best: Ped | null = null,
      bd = 1.45;
    for (const p of this.peds) {
      if (p.knockT >= 0) continue;
      const ox = p.pos.x - x,
        oz = p.pos.z - z;
      const d = Math.hypot(ox, oz);
      if (d > bd || (d > 0.3 && (ox * dx + oz * dz) / d < 0.3)) continue;
      best = p;
      bd = d;
    }
    if (!best) return null;
    this.hurt(best, dmg, x - dx * 0.6, z - dz * 0.6, true);
    return { id: best.id, down: best.knockT >= 0 };
  }

  /** Hit within `r` of (x, z) going along (vx, vz) (a car, a shoulder at a sprint): down they go. How many. */
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
      p.downFor = 3.6;
      p.mode = "idle";
      p.foe = null;
      p.hp = Math.max(10, p.hp - 25);
      this.leave(p);
      n++;
    }
    if (n) this.panic(x, z, 14);
    return n;
  }

  /** Someone to talk to: the nearest one in front of you within reach, not busy (a fight, a run). */
  talkable(x: number, z: number, fx: number, fz: number) {
    let best: Ped | null = null,
      bd = 2.4;
    for (const p of this.peds) {
      if (p.knockT >= 0 || p.foe || ["flee", "fight", "argue", "call", "angry", "film", "watch"].includes(p.mode)) continue;
      const ox = p.pos.x - x,
        oz = p.pos.z - z;
      const d = Math.hypot(ox, oz);
      if (d > bd || (ox * fx + oz * fz) / Math.max(0.01, d) < 0.25) continue;
      best = p;
      bd = d;
    }
    return best;
  }

  /** Talking with you a while (it faces you, stays put), or done. */
  listen(p: Ped, on: boolean) {
    if (!this.peds.includes(p) || p.knockT >= 0) return;
    if (on) {
      this.leave(p);
      p.mode = "listen";
      p.modeT = 999;
    } else if (p.mode === "listen") p.modeT = 0;
  }

  /** Anyone fighting you now. */
  fightingMe() {
    return this.peds.some((p) => p.foe === "me" && p.mode === "fight");
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
          const fall = Math.min(1, t / 0.36);
          const up = t > p.downFor - 0.5 ? Math.min(1, (t - (p.downFor - 0.5)) / 0.5) : 0;
          return { k: (1 - (1 - fall) ** 2) * (1 - up * up), side: p.knockSide };
        },
        face: () => p.face ?? (p.mode === "walk" || p.mode === "jog" || p.mode === "flee" ? null : new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading))),
        heading: () => (["fight", "argue", "angry", "hands", "film", "watch", "listen", "call"].includes(p.mode) || p.hitT < 0.6 ? p.heading : null),
        pose: () =>
          p.mode === "chat"
            ? p.convo && p.convoI > 0
              ? "talk"
              : null
            : p.mode === "phone" || p.mode === "call"
              ? "phone"
              : p.mode === "cheer"
                ? "cheer"
                : p.mode === "wave"
                  ? "wave"
                  : p.mode === "film"
                    ? "film"
                    : p.mode === "hands"
                      ? "hands"
                      : p.mode === "listen" || p.mode === "argue"
                        ? "talk"
                        : null,
        act: (a: Act) => {
          a.guard = p.guard;
          a.punch = p.punchT >= 0 ? Math.min(1, p.punchT / PUNCH) : -1;
          a.punchSide = p.punchSide;
          a.hit = p.hitT;
          a.hitFrom = 1;
          if (p.mode === "watch" && Math.sin(a.t * 3 + p.id) > 0.3) a.gesture = "cheer";
        },
        hide: () => {},
        alive: () => this.peds.includes(p),
      });
    }
    return out;
  }

  positions() {
    return this.peds.map((p) => ({ x: p.pos.x, z: p.pos.z, angry: p.foe === "me" }));
  }

  /** (For the tests: everyone as it is.) */
  get all(): readonly Ped[] {
    return this.peds;
  }

  clear() {
    this.peds = [];
    for (const b of this.bubbles) (b.ped = null), (b.sprite.visible = false);
  }

  show(on: boolean) {
    this.group.visible = on;
    if (!on) this.clear();
    // the town's faces read ahead, one after the other
    else faces.want(this.pool);
  }
}
