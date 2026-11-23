import * as THREE from "three";
import { profile } from "../game/profile";
import { faces } from "./faces";
import { SnarkFigure } from "./figure";
import { ST } from "../scene/city/plan";
import type { Roads } from "./roads";

/**
 * The game's activities (src/gta), the way the street plays them:
 *
 *  - BLOCK RUN: at the MEMPOOL HQ, take a parcel and get it to a place across town before the next
 *    block is mined (the real one: the chain clock says when). Beat the block for the full fare.
 *  - SHIELDED RIDES: at the wheel, a zkSNARK waves at the kerb, a gold ring at its feet: stop by it,
 *    take it where it asks. Smooth driving tips.
 *  - PROOF BOARDS: twelve boards across the streets, each a word of the protocol. Drive through them.
 *  - SPEED TRAPS: five cameras on the long roads keep your best speed, one to three stars.
 *
 * Progress stays in this browser (localStorage), the rewards are the street's play money (ⓩ).
 */

export type Kind = "run" | "ride" | "board" | "trap";
export const KIND_LABEL: Record<Kind, string> = { run: "Block Run", ride: "Shielded Ride", board: "Proof Board", trap: "Speed Trap" };
export const KIND_COLOR: Record<Kind, string> = { run: "#f4b728", ride: "#3fd6c6", board: "#c45bff", trap: "#ff8a1f" };

export interface Spot {
  x: number;
  z: number;
  kind: Kind;
  label: string;
  done?: boolean;
  /** The current objective (a run's drop-off, a passenger). */
  goal?: boolean;
}

export interface MissionHost {
  scene: THREE.Scene;
  roads: Roads;
  /** The MEMPOOL HQ's door, and every place with a door (their names). */
  hq(): { x: number; z: number } | null;
  places(): { x: number; z: number; label: string }[];
  /** The chain: the tip, and when the last block came (ms). */
  height(): number;
  lastBlockAt(): number;
  toast(title: string, sub?: string, tone?: "gold" | "teal" | "bad"): void;
  card(c: { eyebrow: string; title: string; text: string; timer?: () => string } | null): void;
  blip(k: "gate" | "reward" | "fail" | "smash" | "door" | "click"): void;
  shake(k: number): void;
}

export interface PlayerState {
  x: number;
  z: number;
  inCar: boolean;
  speed: number;
  /** Crashes since the ride began. */
  hits: number;
}

const KEY = "zstreet.gta.progress";
interface Progress {
  boards: number[];
  traps: Record<string, number>;
  runs: number;
  beat: number;
  rides: number;
  earned: number;
}
function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null");
    if (p && Array.isArray(p.boards)) return { boards: p.boards, traps: p.traps ?? {}, runs: p.runs ?? 0, beat: p.beat ?? 0, rides: p.rides ?? 0, earned: p.earned ?? 0 };
  } catch {}
  return { boards: [], traps: {}, runs: 0, beat: 0, rides: 0, earned: 0 };
}

const WORDS = ["PROOF", "NULLIFIER", "HALO 2", "ORCHARD", "SAPLING", "NU7", "ZIP-317", "JUBJUB", "BLAKE2", "EQUIHASH", "MEMO", "SHIELD"];
/** The streets with traffic on them (boards go on the quiet ones; traps on these long roads). */
const BUSY_X = [ST.ringN, ST.blvdN, ST.north, ST.ringS];
const BUSY_Z = [ST.ringW, ST.blvdW, ST.heartW, ST.heartE, ST.blvdE, ST.ringE];

/** A tall light over a spot, seen from across the city, and a ring on the ground. */
class Beacon {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private beam: THREE.Mesh;
  private t = Math.random() * 10;
  constructor(color: string, radius = 2.6, height = 46) {
    const c = new THREE.Color(color);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.09, 8, 64), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2.4), toneMapped: false }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.25;
    const g = document.createElement("canvas");
    g.width = 4;
    g.height = 128;
    const x = g.getContext("2d")!;
    const grad = x.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.3, "rgba(255,255,255,0.4)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = grad;
    x.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(g);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, height, 32, 1, true),
      new THREE.MeshBasicMaterial({ map: tex, color: c.clone().multiplyScalar(1.3), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, opacity: 0.6 }),
    );
    this.beam.position.y = height / 2;
    this.beam.renderOrder = 3;
    // a gold token turning over the spot, seen from down the street
    this.token = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.14, 28), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.8), toneMapped: false }));
    this.token.rotation.x = Math.PI / 2;
    this.token.position.y = 3.2;
    this.group.add(this.ring, this.beam, this.token);
  }
  private token: THREE.Mesh;
  update(dt: number) {
    this.t += dt;
    const s = 1 + Math.sin(this.t * 3) * 0.05;
    this.ring.scale.set(s, s, s);
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.62 + Math.sin(this.t * 2) * 0.1;
    this.token.rotation.z = this.t * 2.2;
    this.token.position.y = 3.2 + Math.sin(this.t * 2.4) * 0.18;
  }
  dispose() {
    this.group.removeFromParent();
    for (const m of [this.ring, this.beam, this.token]) {
      m.geometry.dispose();
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
  }
}

interface Board {
  i: number;
  x: number;
  z: number;
  axis: "x" | "z";
  word: string;
  street: string;
  group: THREE.Group;
  panel: THREE.Mesh;
  done: boolean;
}
interface Trap {
  key: string;
  x: number;
  z: number;
  axis: "x" | "z";
  street: string;
  best: number;
  group: THREE.Group;
  flash: THREE.Mesh;
  cool: number;
}
interface Debris {
  m: THREE.Mesh;
  v: THREE.Vector3;
  w: THREE.Vector3;
  life: number;
}

function boardTexture(word: string, i: number) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 300;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0c12";
  g.fillRect(0, 0, 512, 300);
  const grad = g.createLinearGradient(0, 0, 512, 300);
  grad.addColorStop(0, "rgba(196,91,255,0.35)");
  grad.addColorStop(1, "rgba(244,183,40,0.25)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 300);
  g.strokeStyle = "#f4b728";
  g.lineWidth = 10;
  g.strokeRect(10, 10, 492, 280);
  g.fillStyle = "#f4b728";
  g.font = "700 22px 'JetBrains Mono', monospace";
  g.textAlign = "left";
  g.fillText(`PROOF BOARD  ${String(i + 1).padStart(2, "0")}/12`, 34, 52);
  g.textAlign = "right";
  g.fillText("ⓩ", 478, 52);
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  let size = 108;
  g.font = `900 ${size}px Archivo, 'Roboto', sans-serif`;
  while (g.measureText(word).width > 440 && size > 40) g.font = `900 ${(size -= 6)}px Archivo, 'Roboto', sans-serif`;
  g.fillText(word, 256, 185);
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.font = "500 20px 'JetBrains Mono', monospace";
  g.fillText("DRIVE THROUGH TO SMASH", 256, 250);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const POST = new THREE.MeshStandardMaterial({ color: "#2a2a34", roughness: 0.5, metalness: 0.6 });

export class Missions {
  readonly group = new THREE.Group();
  readonly boards: Board[] = [];
  readonly traps: Trap[] = [];
  private prog = loadProgress();
  private debris: Debris[] = [];
  /** The Block Run: idle (its start at the HQ), carrying (to `to`), with the block it set out in. */
  private run: { to: { x: number; z: number; label: string }; height: number; missed: number; t: number } | null = null;
  private hqBeacon: Beacon | null = null;
  private goalBeacon: Beacon | null = null;
  /** A passenger waiting, riding. */
  private ride: { id: number; at: { x: number; z: number }; body: SnarkFigure | null; to: { x: number; z: number; label: string } | null; hits0: number; line: string; t: number } | null = null;
  private rideBeacon: Beacon | null = null;
  private rideCool = 6;
  private lastBlock = 0;
  private wasInCar = false;

  constructor(private host: MissionHost) {
    host.scene.add(this.group);
    this.place();
  }

  get progress() {
    return this.prog;
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.prog));
    } catch {}
  }

  private pay(n: number, why: string) {
    profile.pay(n, why);
    this.prog.earned += n;
    this.save();
  }

  /** Boards on the quiet streets and traps on the long ones, spread over the whole city. */
  private place() {
    const pts = this.host.roads.midpoints(36);
    let seed = 20261123;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const spread = (list: typeof pts, n: number, gap: number) => {
      const shuffled = list.map((p) => ({ p, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.p);
      const out: typeof pts = [];
      for (const p of shuffled) {
        if (out.length >= n) break;
        if (out.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > gap)) out.push(p);
      }
      return out;
    };
    const busy = (p: (typeof pts)[number]) => (p.axis === "x" ? BUSY_X.some((z) => Math.abs(z - p.z) < 1) || Math.abs(p.z + 1.4) < 4 : BUSY_Z.some((x) => Math.abs(x - p.x) < 1));
    const quiet = spread(
      pts.filter((p) => !busy(p)),
      12,
      62,
    );
    quiet.forEach((p, i) => this.boards.push(this.board(i, p.x, p.z, p.axis, p.name)));
    const long = spread(
      pts.filter((p) => busy(p) && Math.abs(p.z + 1.4) > 4),
      5,
      140,
    );
    long.forEach((p, i) => this.traps.push(this.trap(`t${i}`, p.x, p.z, p.axis, p.name)));
  }

  private board(i: number, x: number, z: number, axis: "x" | "z", street: string): Board {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    // facing along the street: you drive through its face
    group.rotation.y = axis === "x" ? Math.PI / 2 : 0;
    const word = WORDS[i % WORDS.length];
    const mat = new THREE.MeshBasicMaterial({ map: boardTexture(word, i), toneMapped: false, side: THREE.DoubleSide });
    mat.color.setScalar(1.25);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 0.12), [POST, POST, POST, POST, mat, mat]);
    panel.position.y = 2.9;
    group.add(panel);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.1, 0.14), POST);
      post.position.set(side * 2.2, 2.05, 0);
      post.castShadow = true;
      group.add(post);
    }
    const done = this.prog.boards.includes(i);
    panel.visible = !done;
    this.group.add(group);
    return { i, x, z, axis, word, street, group, panel, done };
  }

  private trap(key: string, x: number, z: number, axis: "x" | "z", street: string): Trap {
    const group = new THREE.Group();
    // on the kerb beside the road
    const off = 6.2;
    const px = axis === "x" ? x : x + off,
      pz = axis === "x" ? z + off : z;
    group.position.set(px, 0, pz);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.6, 0.16), POST);
    pole.position.y = 2.3;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.5), new THREE.MeshStandardMaterial({ color: "#f2f2f6", roughness: 0.4 }));
    head.position.y = 4.5;
    const flash = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.52), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff8a1f").multiplyScalar(2), toneMapped: false }));
    flash.position.y = 4.85;
    group.add(pole, head, flash);
    this.group.add(group);
    return { key, x, z, axis, street, best: this.prog.traps[key] ?? 0, group, flash, cool: 0 };
  }

  /** Every spot for the maps; the objective first. */
  spots(): Spot[] {
    const out: Spot[] = [];
    if (this.run) out.push({ x: this.run.to.x, z: this.run.to.z, kind: "run", label: `Drop-off · ${this.run.to.label}`, goal: true });
    else {
      const hq = this.host.hq();
      if (hq) out.push({ x: hq.x, z: hq.z, kind: "run", label: "Block Run · MEMPOOL HQ" });
    }
    if (this.ride) {
      if (this.ride.to) out.push({ x: this.ride.to.x, z: this.ride.to.z, kind: "ride", label: `Ride · ${this.ride.to.label}`, goal: true });
      else out.push({ x: this.ride.at.x, z: this.ride.at.z, kind: "ride", label: `Passenger · zkSNARK #${this.ride.id}`, goal: true });
    }
    for (const b of this.boards) out.push({ x: b.x, z: b.z, kind: "board", label: `${b.word} · ${b.street}`, done: b.done });
    for (const t of this.traps) out.push({ x: t.x, z: t.z, kind: "trap", label: `${t.street}${t.best ? ` · ${Math.round(t.best)} km/h` : ""}`, done: t.best >= 140 });
    return out;
  }

  /** What to do next from (x, z): the objective if there is one, else the nearest thing not done. */
  next(x: number, z: number): (Spot & { dist: number }) | null {
    const s = this.spots();
    const goal = s.find((p) => p.goal);
    const pick = goal ?? s.filter((p) => !p.done).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
    return pick ? { ...pick, dist: Math.hypot(pick.x - x, pick.z - z) } : null;
  }

  counts() {
    return {
      run: { done: this.prog.runs, of: null as number | null },
      ride: { done: this.prog.rides, of: null as number | null },
      board: { done: this.boards.filter((b) => b.done).length, of: this.boards.length },
      trap: { done: this.traps.filter((t) => t.best >= 140).length, of: this.traps.length },
    };
  }

  update(dt: number, me: PlayerState) {
    // a new block: the run in flight missed it
    const at = this.host.lastBlockAt();
    if (at && at !== this.lastBlock) {
      const fresh = this.lastBlock !== 0;
      this.lastBlock = at;
      if (fresh && this.run) {
        this.run.missed++;
        this.host.toast(`Block ${this.host.height().toLocaleString("en-US")} mined`, "Your parcel missed it · it rides the next one, for less", "bad");
        this.host.blip("fail");
      }
    }
    this.updateRun(dt, me);
    this.updateRide(dt, me);
    this.updateBoards(me);
    this.updateTraps(dt, me);
    for (const b of [this.hqBeacon, this.goalBeacon, this.rideBeacon]) b?.update(dt);
    // the debris of a smashed board
    for (const d of [...this.debris]) {
      d.life -= dt;
      d.v.y -= 14 * dt;
      d.m.position.addScaledVector(d.v, dt);
      if (d.m.position.y < 0.05) {
        d.m.position.y = 0.05;
        d.v.multiplyScalar(0.5);
        d.v.y = Math.abs(d.v.y) * 0.3;
      }
      d.m.rotation.x += d.w.x * dt;
      d.m.rotation.y += d.w.y * dt;
      if (d.life <= 0) {
        d.m.removeFromParent();
        d.m.geometry.dispose();
        this.debris.splice(this.debris.indexOf(d), 1);
      }
    }
    this.wasInCar = me.inCar;
  }

  // ---- the Block Run ------------------------------------------------------------------------------

  private updateRun(dt: number, me: PlayerState) {
    const hq = this.host.hq();
    if (!this.run) {
      if (this.goalBeacon) (this.goalBeacon.dispose(), (this.goalBeacon = null));
      if (!hq) return;
      if (!this.hqBeacon) {
        this.hqBeacon = new Beacon("#f4b728", 2.2, 40);
        this.hqBeacon.group.position.set(hq.x, 0, hq.z);
        this.group.add(this.hqBeacon.group);
      }
      if (Math.hypot(me.x - hq.x, me.z - hq.z) < 3.2 && me.speed < 6) this.startRun(hq);
      return;
    }
    if (this.hqBeacon) (this.hqBeacon.dispose(), (this.hqBeacon = null));
    this.run.t += dt;
    const to = this.run.to;
    if (!this.goalBeacon) {
      this.goalBeacon = new Beacon("#fff0b8", 3, 60);
      this.goalBeacon.group.position.set(to.x, 0, to.z);
      this.group.add(this.goalBeacon.group);
    }
    if (Math.hypot(me.x - to.x, me.z - to.z) < 4.5 && me.speed < 7) {
      const beat = this.run.missed === 0;
      const fare = beat ? 150 : Math.max(30, 90 - this.run.missed * 30);
      this.prog.runs++;
      if (beat) this.prog.beat++;
      this.pay(fare, "block run");
      this.host.toast(beat ? "In the block!" : "Delivered", `${to.label} · +${fare} ⓩ${beat ? " · you beat the block" : ""}`, "gold");
      this.host.blip("reward");
      this.host.card(null);
      this.run = null;
    }
  }

  private startRun(from: { x: number; z: number }) {
    const places = this.host.places().filter((p) => {
      const d = Math.hypot(p.x - from.x, p.z - from.z);
      return d > 140 && d < 330;
    });
    if (!places.length) return;
    const to = places[Math.floor(Math.random() * places.length)];
    this.run = { to, height: this.host.height(), missed: 0, t: 0 };
    this.host.blip("gate");
    const run = this.run;
    this.host.card({
      eyebrow: "Block Run · the parcel",
      title: to.label,
      text: `Get it there before the next block. Blocks come every ~75 s.`,
      timer: () => {
        const since = (Date.now() - this.host.lastBlockAt()) / 1000;
        const left = Math.round(75 - since);
        return run.missed ? `missed ${run.missed} · next block ${left > 0 ? `~${left}s` : "any second"}` : left > 0 ? `next block ~${left}s` : "any second now";
      },
    });
  }

  // ---- the rides -----------------------------------------------------------------------------------

  private updateRide(dt: number, me: PlayerState) {
    if (!this.ride) {
      if (!me.inCar) return;
      this.rideCool -= dt;
      if (this.rideCool > 0) return;
      this.rideCool = 4;
      // someone waving at the kerb, a short drive away
      const pts = this.host.roads.midpoints(24).filter((p) => {
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        return d > 50 && d < 150;
      });
      if (!pts.length) return;
      const p = pts[Math.floor(Math.random() * pts.length)];
      const half = this.host.roads.rects.find((r) => r.name === p.name && (p.axis === "x" ? Math.abs(r.at - p.z) < 0.5 : Math.abs(r.at - p.x) < 0.5));
      const w = half ? (half.axis === "x" ? half.z1 - half.z0 : half.x1 - half.x0) / 2 : 4;
      const at = p.axis === "x" ? { x: p.x, z: p.z + w + 1.1 } : { x: p.x + w + 1.1, z: p.z };
      const id = 1 + Math.floor(Math.random() * 10000);
      faces.want([id], true);
      const body = new SnarkFigure(id);
      body.root.position.set(at.x, 0.2, at.z);
      body.root.rotation.y = p.axis === "x" ? Math.PI : -Math.PI / 2;
      this.group.add(body.root);
      const LINES = ["No questions. Just go.", "To the block, and step on it.", "Shielded, please. Nobody needs to know.", "I've got a viewing key and a train to catch.", "Take the long way. I like this city at night.", "Fast. My note expires.", "Drop me where the proofs are fresh."];
      this.ride = { id, at, body, to: null, hits0: me.hits, line: LINES[Math.floor(Math.random() * LINES.length)], t: 0 };
      this.rideBeacon = new Beacon("#3fd6c6", 1.6, 30);
      this.rideBeacon.group.position.set(at.x, 0.2, at.z);
      this.group.add(this.rideBeacon.group);
      return;
    }
    const r = this.ride;
    r.t += dt;
    if (r.body) {
      r.body.update(dt, { speed: 0, grounded: true });
      if (Math.random() < dt * 0.6) r.body.wave(1.2);
    }
    if (!r.to) {
      // gave up on you after a while, or you walked off
      const d = Math.hypot(me.x - r.at.x, me.z - r.at.z);
      if (r.t > 150 || (!me.inCar && d > 200)) return this.endRide();
      if (me.inCar && d < 6.5 && me.speed < 2.5) {
        const places = this.host.places().filter((p) => {
          const dd = Math.hypot(p.x - r.at.x, p.z - r.at.z);
          return dd > 110 && dd < 320;
        });
        if (!places.length) return this.endRide();
        r.to = places[Math.floor(Math.random() * places.length)];
        r.hits0 = me.hits;
        r.t = 0;
        r.body?.dispose();
        r.body = null;
        this.rideBeacon?.dispose();
        this.rideBeacon = new Beacon("#3fd6c6", 3, 60);
        this.rideBeacon.group.position.set(r.to.x, 0, r.to.z);
        this.group.add(this.rideBeacon.group);
        this.host.blip("door");
        this.host.card({ eyebrow: `Shielded Ride · zkSNARK #${r.id}`, title: r.to.label, text: `“${r.line}”`, timer: () => `${Math.round(Math.hypot(me.x - r.to!.x, me.z - r.to!.z))} m · ${me.hits - r.hits0 ? `${me.hits - r.hits0} bumps` : "smooth so far"}` });
      }
      return;
    }
    if (Math.hypot(me.x - r.to.x, me.z - r.to.z) < 7 && me.speed < 3) {
      const bumps = me.hits - r.hits0;
      const fare = 40 + Math.round(r.t * 0.3);
      const tip = Math.max(0, 40 - bumps * 12);
      this.prog.rides++;
      this.pay(fare + tip, "ride");
      this.host.toast(`Ride done · +${fare + tip} ⓩ`, tip ? `${r.to.label} · tip ${tip} ⓩ for a smooth ride` : `${r.to.label} · no tip: ${bumps} bumps`, "teal");
      this.host.blip("reward");
      this.endRide();
    }
  }

  private endRide() {
    this.ride?.body?.dispose();
    this.rideBeacon?.dispose();
    this.rideBeacon = null;
    if (this.ride?.to) this.host.card(null);
    this.ride = null;
    this.rideCool = 10;
  }

  // ---- boards and traps --------------------------------------------------------------------------------

  private updateBoards(me: PlayerState) {
    if (!me.inCar || me.speed < 3) return;
    for (const b of this.boards) {
      if (b.done) continue;
      if (Math.abs(me.x - b.x) < 2.6 && Math.abs(me.z - b.z) < 2.6) this.smash(b, me.speed);
    }
  }

  private smash(b: Board, speed: number) {
    b.done = true;
    b.panel.visible = false;
    this.prog.boards.push(b.i);
    this.pay(25, "proof board");
    const n = this.boards.filter((x) => x.done).length;
    this.host.toast(`${b.word} · smashed`, `Proof boards ${n} / ${this.boards.length} · +25 ⓩ`, "gold");
    this.host.blip("smash");
    this.host.shake(0.35);
    // the panel in pieces, flung the way you went
    const mat = new THREE.MeshStandardMaterial({ color: "#1a1622", emissive: "#f4b728", emissiveIntensity: 0.4, roughness: 0.4 });
    const p = b.panel.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.2 + Math.random() * 0.5, 0.2 + Math.random() * 0.4, 0.08), mat);
      m.position.set(p.x + (Math.random() - 0.5) * 3, p.y + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 0.6);
      m.castShadow = true;
      this.group.add(m);
      const dir = b.axis === "x" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      const v = dir.multiplyScalar((Math.random() < 0.5 ? -1 : 1) * speed * (0.3 + Math.random() * 0.5)).add(new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 5, (Math.random() - 0.5) * 6));
      this.debris.push({ m, v, w: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0), life: 2.5 + Math.random() });
    }
    setTimeout(() => mat.dispose(), 4000);
  }

  private updateTraps(dt: number, me: PlayerState) {
    for (const t of this.traps) {
      t.cool -= dt;
      (t.flash.material as THREE.MeshBasicMaterial).color.setRGB(...((t.cool > 0.6 ? [6, 6, 6] : [2, 1.08, 0.24]) as [number, number, number]));
      if (!me.inCar || t.cool > 0) continue;
      const along = t.axis === "x" ? Math.abs(me.x - t.x) : Math.abs(me.z - t.z);
      const across = t.axis === "x" ? Math.abs(me.z - t.z) : Math.abs(me.x - t.x);
      if (along > 1.6 || across > 7) continue;
      t.cool = 1.4;
      const kmh = me.speed * 3.6;
      const stars = kmh >= 140 ? 3 : kmh >= 110 ? 2 : kmh >= 80 ? 1 : 0;
      const best = kmh > t.best;
      if (best) {
        t.best = kmh;
        this.prog.traps[t.key] = kmh;
        this.save();
        if (stars) this.pay(stars * 15, "speed trap");
      }
      this.host.toast(`${Math.round(kmh)} km/h ${"★".repeat(stars)}${"☆".repeat(3 - stars)}`, `Speed trap · ${t.street}${best ? " · new best" : ` · best ${Math.round(t.best)}`}`, stars ? "gold" : undefined);
      this.host.blip(stars ? "gate" : "click");
    }
  }

  /** Off the game: the passengers and the markers go. */
  stop() {
    this.endRide();
    if (this.run) this.host.card(null);
    this.run = null;
    this.hqBeacon?.dispose();
    this.goalBeacon?.dispose();
    this.hqBeacon = this.goalBeacon = null;
  }

  /** The boards and traps stay in the street; hide them off the game. */
  setVisible(on: boolean) {
    this.group.visible = on;
  }

  /** Drop the run and the ride (a reset from the menu). */
  abandon() {
    this.stop();
  }

  get wasDriving() {
    return this.wasInCar;
  }
}
