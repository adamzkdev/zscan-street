import * as THREE from "three";
import { API } from "../data/zscan";
import type { Director } from "../scene/director";
import type { Snark } from "../scene/snark";
import type { ChainClock } from "./clock";
import { persona, sheet, type Persona } from "./personas";

/** What a citizen of the day's cast is doing after the last block. */
export interface AgentNow {
  id: number;
  go: string;
  mood: string;
  thought: string;
  /** What they do there ("feeding the koi"). */
  doing?: string;
  /** What they say to a visitor walking past. */
  greet?: string;
  with: number | null;
  journal: string[];
}

export interface CastMember extends Persona {
  now: AgentNow;
}

interface AgentTalk {
  a: number;
  b: number;
  lines: string[];
}

const SPOT_NAME: Record<string, string> = {
  bench: "on a bench on the plaza",
  fountain: "at the fountain in the Transparent square",
  koi: "at the koi pond in the Orchard garden",
  market: "at the market stalls",
  vending: "at the vending machines",
  window: "looking at the shop windows on the avenue",
  bus: "at the bus stop, waiting for the next block",
  orchard: "in the persimmon orchard",
  home: "on your way home",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The city's agents. The API runs a turn for the day's cast at every block (where each goes, their
 * mood and thought, who meets whom and what they say); the street's residents follow it, the pairs
 * talk in bubbles when they meet, and anyone you talk to knows who they are and what their day was.
 * Everyone else (passers-by, carriers) has a persona too (game/personas.ts, the API's own).
 */
export class Agents {
  readonly cast = new Map<number, CastMember>();
  private talks: (AgentTalk & { played: boolean })[] = [];
  private turnFns: (() => void)[] = [];
  private acc = 0;
  height = 0;

  constructor(
    clock: ChainClock,
    private director: Director,
  ) {
    clock.onBlock((b) => setTimeout(() => void this.load(b.height), 3000));
    void this.load();
  }

  private async load(h?: number) {
    try {
      const r = await fetch(`${API}/v1/street/agents${h ? `?h=${h}` : ""}`);
      if (!r.ok) return;
      const j = (await r.json()) as { height: number; cast: CastMember[]; talks: AgentTalk[] };
      if (j.height < this.height) return;
      const first = !this.cast.size;
      this.height = j.height;
      this.cast.clear();
      for (const c of j.cast) this.cast.set(c.id, c);
      this.talks = j.talks.map((t) => ({ ...t, played: false }));
      for (const fn of this.turnFns) fn();
      // a new turn: the ones near you say what's on their mind
      if (!first) void this.muse();
    } catch {}
  }

  /** After every turn (the residents re-plan). */
  onTurn(fn: () => void) {
    this.turnFns.push(fn);
  }

  /** Where a cast member wants to be (an activity key or "home"); null for everyone else. */
  wants(id: number): string | null {
    return this.cast.get(id)?.now.go ?? null;
  }

  partner(id: number): number | null {
    return this.cast.get(id)?.now.with ?? null;
  }

  /** The next resident to come out: a cast member who isn't out yet and isn't home. */
  nextOut(out: Set<number>): number | null {
    for (const c of this.cast.values()) if (!out.has(c.id) && c.now.go !== "home") return c.id;
    return null;
  }

  /** Who `id` is. */
  persona(id: number): Persona {
    // computed here (the API's mirror may lag a deploy behind on the newer fields)
    return persona(id);
  }

  /** The persona and the day so far, for the model when you talk to them. */
  facts(id: number): string {
    const p = this.persona(id);
    const lines = [sheet(p)];
    const c = this.cast.get(id);
    if (c) {
      const n = c.now;
      lines.push(`Right now you are ${SPOT_NAME[n.go] ?? n.go}${n.doing ? ` (${n.doing})` : ""}, feeling ${n.mood}. On your mind: "${n.thought}"`);
      if (n.with) {
        const o = this.persona(n.with);
        lines.push(`You came here to meet ${o.name} (${o.job}).`);
      }
      if (n.journal.length) lines.push(`Earlier today: ${n.journal.map((j) => j.replace(/[.!?…]+$/, "")).join("; ")}.`);
      const t = this.talks.find((x) => x.a === id || x.b === id);
      if (t) lines.push(`What you and ${this.persona(t.a === id ? t.b : t.a).name} just said: ${t.lines.map((l) => `"${l}"`).join(" ")}`);
    }
    return lines.join("\n");
  }

  /** The first thing they say: what's on their mind, or a greeting in their temperament. */
  hello(id: number): string {
    const c = this.cast.get(id);
    if (c?.now.thought) return c.now.thought;
    return this.persona(id).hello;
  }

  private snark(id: number): Snark | null {
    for (const s of this.director.snarks) if (s.id === id && s.state === "resident" && s.root.visible) return s;
    return null;
  }

  /** A few cast members near the camera say their new thought out loud. */
  private focus = new THREE.Vector3();
  private async muse() {
    const near = [...this.cast.values()]
      .map((c) => this.snark(c.id))
      .filter((s): s is Snark => !!s && s.root.position.distanceTo(this.focus) < 26)
      .slice(0, 3);
    for (const s of near) {
      const t = this.cast.get(s.id)?.now.thought;
      if (!t) continue;
      await sleep(600 + Math.random() * 1800);
      s.say(t, Math.min(4.5, 1.8 + t.length * 0.05));
    }
  }

  private museIn = 8;
  private mused = new Map<number, number>();

  /** Every frame: the turn's pairs talk once they have both arrived; the cast thinks out loud. */
  update(dt: number, focus: THREE.Vector3) {
    this.focus.copy(focus);
    if ((this.museIn -= dt) <= 0) {
      this.museIn = 12 + Math.random() * 10;
      const now = performance.now();
      const near = [...this.cast.values()]
        .filter((c) => (this.mused.get(c.id) ?? 0) < now && c.now.thought)
        .map((c) => this.snark(c.id))
        .filter((x): x is Snark => !!x && x.root.position.distanceTo(focus) < 22);
      const s = near[Math.floor(Math.random() * near.length)];
      if (s) {
        const c = this.cast.get(s.id)!;
        this.mused.set(s.id, now + 45_000);
        const line = c.now.thought;
        s.say(line, Math.min(5, 2 + line.length * 0.05));
      }
    }
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;
    for (const t of this.talks) {
      if (t.played) continue;
      const a = this.snark(t.a),
        b = this.snark(t.b);
      if (!a || !b || a.isWalking || b.isWalking) continue;
      if (a.root.position.distanceTo(b.root.position) > 6) continue;
      // only worth playing where someone can read it
      if (a.root.position.distanceTo(focus) > 40) continue;
      t.played = true;
      void this.play(a, b, t.lines);
    }
  }

  private async play(a: Snark, b: Snark, lines: string[]) {
    const fa = a.faceDir,
      fb = b.faceDir;
    a.faceDir = b.root.position.clone().sub(a.root.position).setY(0).normalize();
    b.faceDir = a.root.position.clone().sub(b.root.position).setY(0).normalize();
    for (let k = 0; k < lines.length; k++) {
      const who = k % 2 ? b : a;
      if (!this.director.snarks.has(who)) break;
      const secs = Math.min(4.6, 1.8 + lines[k].length * 0.055);
      who.say(lines[k], secs);
      await sleep(secs * 1000 + 300);
    }
    a.faceDir = fa;
    b.faceDir = fb;
  }
}
