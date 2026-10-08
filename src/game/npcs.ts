import * as THREE from "three";
import type { Crowd } from "../scene/alive/crowd";
import { slotId } from "../scene/alive/crowd";
import { sayAt } from "../scene/speech";
import type { Snark } from "../scene/snark";
import type { Agents } from "./agents";

export interface NpcHooks {
  /** The street's zkSNARKs (residents, carriers). */
  snarks(): Iterable<Snark>;
  crowd(): Crowd | null;
  /** Where you stand and which way you look, on foot (null otherwise). */
  me(): { p: THREE.Vector3; heading: number } | null;
  /** Lines the street is saying about the last block (the API's gossip), for greetings. */
  gossip(): string[];
  height(): number;
  mempool(): number;
  /** Someone is talking with them right now: leave them alone. */
  busy(id: number): boolean;
  /** Whether a spot of the street is open ground (not inside a building). */
  open(x: number, z: number): boolean;
}

interface Near {
  id: number;
  at: THREE.Vector3;
  d: number;
  s?: Snark;
  i?: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

/** A greeting in their own temperament, about the live city. */
function greeting(trait: string, name: string, job: string, h: number, m: number): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const block = h ? `Block ${h.toLocaleString("en-US")}` : "That last block";
  const byTrait: Record<string, string[]> = {
    grumpy: ["Watch where you're walking.", `${block}? Seen better.`, "Hmph. Tourists."],
    anxious: [`${m} still waiting in the mempool... is that a lot?`, "Did the bus leave? Did I miss it?"],
    dreamy: ["The neon hums like a shielded secret.", "Every block is a little poem."],
    competitive: ["Bet the next block's packed. Want in?", "I walk faster than you, just saying."],
    shy: ["Oh! H-hi...", "...hello."],
    sarcastic: ["Oh look, another visitor. Thrilling.", `${block}. Wow. Riveting.`],
    curious: ["Where are you headed? What's it like there?", `Did you see what was in ${block.toLowerCase()}?`],
    calm: [`${time}. The city breathes with every block.`, "Slow down, the chain isn't going anywhere."],
    dramatic: [`${block}! Did you SEE that?!`, "Everything is happening at once!"],
    gossip: ["Psst. You didn't hear it from me, but...", "Have you met Kenji? Don't trust his tips."],
    conspiracy: ["The statue winked at me. Again.", "Empty blocks are a signal. Wake up."],
    cheerful: [`${time}! I'm ${name}, ${job}!`, "Lovely day in ZStreet, isn't it?"],
  };
  const key = Object.keys(byTrait).find((k) => trait.includes(k)) ?? "cheerful";
  return pick([...byTrait[key], `${time}! ${name} here.`]);
}

/**
 * On foot, the people round you notice you now and then as you pass: they stop, turn to you and
 * say something in a bubble, in their temperament or from what the street is saying about the
 * last block. Nothing else on screen.
 */
export class Npcs {
  private near: Near[] = [];
  private scan = 0;
  private greetIn = 2;
  private greeted = new Map<number, number>();
  private anchor = new THREE.Object3D();
  private tmp = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private agents: Agents,
    private hooks: NpcHooks,
  ) {
    scene.add(this.anchor);
  }

  private gather(me: THREE.Vector3) {
    const out: Near[] = [];
    for (const s of this.hooks.snarks()) {
      if (!s.root.visible || s.state === "riding" || s.state === "boarding" || s.state === "chauffeured") continue;
      const d = Math.hypot(s.root.position.x - me.x, s.root.position.z - me.z);
      if (d < 16) out.push({ id: s.id, at: s.root.position, d, s });
    }
    const crowd = this.hooks.crowd();
    if (crowd) for (const i of crowd.within(me.x, me.z, 16)) {
      crowd.positionOf(i, this.tmp);
      out.push({ id: slotId(crowd.people[i].slot ?? 0), at: this.tmp.clone(), d: Math.hypot(this.tmp.x - me.x, this.tmp.z - me.z), i });
    }
    out.sort((a, b) => a.d - b.d);
    // only people you can see: no wall between you and them
    return out.filter((n) => this.seen(me, n.at)).slice(0, 9);
  }

  private seen(a: THREE.Vector3, b: THREE.Vector3) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.floor(d / 0.6);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      if (!this.hooks.open(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  update(dt: number) {
    const me = this.hooks.me();
    if (!me) return;
    // who's round you, a few times a second
    if ((this.scan -= dt) <= 0) {
      this.scan = 0.2;
      this.near = this.gather(me.p);
    }
    // crowd walkers move between scans: follow them
    const crowd = this.hooks.crowd();
    for (const n of this.near) if (n.i !== undefined && crowd) crowd.positionOf(n.i, n.at as THREE.Vector3);
    this.greet(dt, me);
  }

  /** Someone close, in front of you, who hasn't greeted you lately says hello. */
  private greet(dt: number, me: { p: THREE.Vector3; heading: number }) {
    if ((this.greetIn -= dt) > 0) return;
    this.greetIn = 0.5;
    const now = performance.now();
    const fx = -Math.sin(me.heading),
      fz = -Math.cos(me.heading);
    const who = this.near.find((n) => {
      if (n.d > 3.6 || this.hooks.busy(n.id) || (this.greeted.get(n.id) ?? 0) > now) return false;
      return ((n.at.x - me.p.x) * fx + (n.at.z - me.p.z) * fz) / n.d > 0.2;
    });
    if (!who) return;
    this.greeted.set(who.id, now + 120_000);
    this.greetIn = rand(10, 20);
    const p = this.agents.persona(who.id);
    const c = this.agents.cast.get(who.id);
    const g = this.hooks.gossip();
    const line = c?.now.greet || (g.length && Math.random() < 0.4 ? pick(g) : greeting(p.trait, p.name, p.job, this.hooks.height(), this.hooks.mempool()));
    const secs = Math.min(4.2, 1.8 + line.length * 0.05);
    const look = new THREE.Vector3(me.p.x - who.at.x, 0, me.p.z - who.at.z).normalize();
    if (who.s) {
      const s = who.s;
      const face = s.faceDir;
      // they stop for a moment and turn to you
      s.paused = true;
      s.faceDir = look;
      s.say(line, secs);
      setTimeout(() => {
        if (this.hooks.busy(s.id)) return;
        s.paused = false;
        s.faceDir = face;
      }, secs * 1000 + 300);
    } else if (who.i !== undefined) {
      const crowd = this.hooks.crowd();
      if (!crowd) return;
      const i = who.i;
      crowd.hold(i, look.x, look.z);
      this.anchor.position.copy(who.at);
      sayAt(this.anchor, line, "talk", 2.05, secs, 0.5);
      setTimeout(() => !this.hooks.busy(who.id) && crowd.release(i), secs * 1000 + 300);
    }
  }
}
