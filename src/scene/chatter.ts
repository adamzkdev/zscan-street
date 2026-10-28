import * as THREE from "three";
import { Market } from "../data/market";
import type { City } from "./city";
import type { Director } from "./director";
import type { Snark } from "./snark";
import type { Tone } from "./speech";

/**
 * People talk to each other, everywhere the camera looks: two zkSNARKs standing or walking close
 * together strike up a short conversation in speech bubbles (English only). What they talk about
 * depends on where they are (the stadium, the prison quay, the Louvre, the hawker centre…) and on
 * what the chain is doing right now (the block height, the mempool, the price).
 */

type Line = string | [string, Tone];
type Script = Line[];

const BIRTHDAY: Script[] = [
  [["Happy 10 years, Zcash!", "shout"], "2016–2026. Here's to the next ten!", "Privacy is normal."],
  ["Sprout. Sapling. Orchard.", "Ten years of growing privacy.", "Happy birthday, Zcash!"],
  ["Look at the birthday blimp!", "The whole city is celebrating.", ["Happy 10 years!", "shout"]],
  ["Ten candles on a shielded cake?", "Nobody can see my birthday wish.", "I put mine in a memo."],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

const GENERAL: Script[] = [
  ["Shielded or transparent?", "Shielded. Always.", "Good answer."],
  ["Lost my viewing key...", ["Don't say that out loud!", "shout"]],
  ["Is that your parcel?", "Can't tell. It's shielded.", "Fair enough."],
  ["Have you tried the ramen?", "Mining-grade spicy!", "My memo field is on fire."],
  ["Nice weather tonight.", "Perfect for a stroll.", "And a shielded transfer."],
  ["Who mined the last one?", "No idea, it's not my business.", "Privacy is normal."],
  ["I moved to Ironwood.", "Nice! New pool smell.", "Fresh nullifiers everywhere."],
  ["Did you see the blimp?", "It never stops circling.", "Like my portfolio."],
  ["Metro or bus?", "Metro if the block is full.", "Bus for the small ones."],
  ["What's a zk-SNARK, really?", "Proof without telling.", "So... like my diary?", "Exactly."],
  ["I sent my mom some ZEC.", "Shielded?", "Of course. She has a viewing key."],
  ["Coffee?", "Only if it's paid in ZEC.", "Halo Café takes it."],
  ["Where's the MEMPOOL shop?", "Downtown, by the bus stop.", "Thanks, stranger."],
  ["You look familiar.", "I'm one of 10,000.", "That explains it."],
  ["I love this city.", "Privacy and noodles.", "What else do you need?"],
  ["Going to the stadium later?", "Shielded vs Transparent!", ["SHIELD-ED!", "shout"]],
  ["Have you been up the Needle?", "150 metres of pure view.", "My knees said no."],
  ["The Louvre has zkSNARK #1.", "The original!", "Behind bulletproof glass."],
  ["I got lost in the pyramid.", "Did you find the coins?", "Three out of five..."],
];

const LIVE: (() => Script)[] = [
  () => [`Block #${h()} just landed!`, "Was your tx in it?", "Shielded. Can't say!"],
  () => [`${m()} tx in the mempool.`, m() > 15 ? "Busy day for the buses." : "Quiet one today.", "Good time to send."],
  () => [`ZEC is at $${p()}.`, chg() >= 0 ? "Up again!" : "A little dip.", "I just hold and shield."],
  () => [`${sh()}% of ZEC is shielded now.`, "Privacy is going mainstream.", "About time."],
  () => ["NU7 is coming soon.", "25-second blocks!", "The buses will be so busy."],
];

/** Topics by place: the landmark near which a conversation happens. */
const NEAR: Record<string, Script[]> = {
  stadium: [
    ["Who's winning tonight?", "Shielded, obviously.", ["SHIELD-ED! SHIELD-ED!", "shout"]],
    ["Last block was 9-2.", "Transparent got smashed.", "As it should be."],
    ["Do you have tickets?", "Paid in ZEC.", "Shielded seats, nice."],
  ],
  museum: [
    ["Have you seen the original?", "Behind the glass, yes.", "Everyone takes a photo."],
    ["Is this the Louvre?", "The Louvre of zkSNARKs.", "Even better."],
    ["Rank 1 is stunning.", "The Grande Galerie is huge.", "My feet hurt already."],
  ],
  prison: [
    ["They moved SBF to the Rock.", "Why?", "He kept dumping the market."],
    ["Nobody escapes Alcatraz.", "Except in 1962.", "Those guys didn't hold FTT."],
    ["Is CZ still in there?", "Four months, then out.", "Funds are SAFU, he says."],
  ],
  foodhall: [
    ["Best laksa in the city.", "The satay is better.", "Let's get both."],
    ["Teh tarik?", "Pulled like a block.", "Very long, very sweet."],
    ["Pay in ZEC?", "Every stall takes it.", "Shielded hawkers!"],
  ],
  mall: [
    ["New sneakers from zkWEAR!", "Very private-looking.", "They hide my steps."],
    ["Did you see the waterfall?", "Forty metres of rain.", "Inside a mall!"],
    ["Cinema tonight?", "They show the last block.", "A thriller, then."],
  ],
  eiffel: [
    ["The glass floor scared me.", "Don't look down.", "I looked down."],
    ["Dinner at the Jules Verne?", "Pay in ZEC?", "Of course, it's 2026."],
  ],
  colosseum: [
    ["Shielded won the last bout.", "The emperor approved.", "Thumbs up!"],
    ["Gladiators in 2026?", "The Proof Games!", "One bout per block."],
  ],
  pyramid: [
    ["The labyrinth is real.", "Did the door drop on you?", "Twice."],
    ["The genesis chest is up there.", "Block zero!", "2016, what a year."],
  ],
  needle: [
    ["Tallest tower in town.", "You see the whole city.", "Even the prison."],
  ],
  marina: [
    ["That infinity pool...", "Right on the edge.", "With the city below."],
    ["The casino jackpot?", "It's the block reward.", "Literally mining luck."],
  ],
  reserve: [
    ["The vault holds the pools.", "Orchard, Sapling, Ironwood...", "Counted to the zatoshi."],
    ["Bull or bear?", "It's a zebra.", "Even better."],
  ],
  statue: [
    ["The torch is gold.", "A ⓩ on the flame.", "Liberty, but private."],
  ],
};

let H = 0;
let M = 0;
const h = () => (H ? H.toLocaleString("en-US") : "3,5xx,xxx");
const m = () => M;
const p = () => Market.state.price?.usd.toFixed(2) ?? "1,3xx";
const chg = () => Market.state.price?.usd_24h_change ?? 0;
const sh = () => Math.round((Market.state.pools?.shielded_ratio ?? 0.29) * 100);

export class Chatter {
  /** What the street says about the last block (the API writes it once per block). */
  private gossipLines: Line[] = [];
  private gossipAt = 0;
  private busy = new Set<Snark>();
  private cool = new WeakMap<Snark, number>();
  private acc = 0;
  private active = 0;
  private birthdayConversation = 0;

  constructor(
    private director: Director,
    private city: City,
    private scene: THREE.Object3D,
    /** At most this many conversations at once (the device's budget). */
    private max = 6,
  ) {}

  /** Live numbers the lines mention. */
  setLive(height: number | null, mempool: number) {
    H = height ?? 0;
    M = mempool;
  }

  /** The last block's gossip, from the API: conversations pick it up for a few minutes. */
  gossip(lines: { text: string; tone: Tone }[]) {
    this.gossipLines = lines.map((l) => (l.tone === "talk" ? l.text : ([l.text, l.tone] as [string, Tone])));
    this.gossipAt = performance.now();
  }

  private gossipScript(): Script[] {
    const g = this.gossipLines;
    if (g.length < 2 || performance.now() - this.gossipAt > 5 * 60_000) return [];
    // two or three remarks in a row, as one conversation
    const i = Math.floor(Math.random() * g.length);
    const n = Math.random() < 0.5 ? 2 : 3;
    return [Array.from({ length: Math.min(n, g.length) }, (_, k) => g[(i + k) % g.length])];
  }

  private topicAt(x: number, z: number): Script[] {
    // The birthday is a visible part of city life, while keeping ordinary local conversations.
    if (this.birthdayConversation++ % 3 !== 2) return BIRTHDAY;
    let best: string | null = null,
      bd = 70 * 70;
    for (const [k, l] of this.city.landmarks) {
      const d = (l.door.x - x) ** 2 + (l.door.z - z) ** 2;
      if (d < bd) (bd = d), (best = k);
    }
    // the prison is on its rock: the quay facing it counts
    if (z > 120 && x < -90 && x > -160) best = "prison";
    const local = best ? NEAR[best] : undefined;
    const fresh = this.gossipScript();
    if (fresh.length && Math.random() < 0.45) return fresh;
    const r = Math.random();
    if (local?.length && r < 0.55) return local;
    if (r < 0.75) return [pick(LIVE)()];
    return GENERAL;
  }

  /** Every frame: now and then two people near the camera start talking. */
  update(dt: number, focus: THREE.Vector3) {
    this.acc += dt;
    if (this.acc < 4) return;
    this.acc = 0;
    if (this.active >= this.max) return;
    const now = performance.now();
    const near: Snark[] = [];
    for (const s of this.director.snarks) {
      if (this.busy.has(s) || !s.root.visible || s.root.parent !== this.scene) continue;
      if (s.state === "riding" || s.state === "boarding" || s.state === "chauffeured") continue;
      if ((this.cool.get(s) ?? 0) > now) continue;
      const p = s.root.position;
      if ((p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 > 28 * 28) continue;
      near.push(s);
    }
    near.sort(() => Math.random() - 0.5);
    for (let i = 0; i < near.length; i++)
      for (let j = i + 1; j < near.length; j++) {
        const a = near[i],
          b = near[j];
        const d = a.root.position.distanceTo(b.root.position);
        if (d < 0.5 || d > 3.6) continue;
        void this.talk(a, b);
        return;
      }
    // A quiet street still gets a birthday greeting; no second person is needed to start it.
    if (near.length) {
      const s = near[0];
      s.say("Happy 10 years, Zcash!", 4.5, "shout");
      this.cool.set(s, now + 30000);
    }
  }

  private async talk(a: Snark, b: Snark) {
    this.active++;
    this.busy.add(a);
    this.busy.add(b);
    const script = pick(this.topicAt(a.root.position.x, a.root.position.z));
    // standing still: they turn to each other
    const still = (s: Snark) => s.state === "resident" || s.state === "waiting";
    if (still(a)) a.faceDir = b.root.position.clone().sub(a.root.position).setY(0).normalize();
    if (still(b)) b.faceDir = a.root.position.clone().sub(b.root.position).setY(0).normalize();
    try {
      for (let k = 0; k < script.length; k++) {
        const who = k % 2 ? b : a;
        if (!this.director.snarks.has(who)) break;
        const [text, tone] = typeof script[k] === "string" ? [script[k] as string, "talk" as Tone] : (script[k] as [string, Tone]);
        const secs = Math.min(4.2, 1.6 + text.length * 0.055);
        who.say(text, secs, tone);
        await sleep(secs * 1000 + 250);
      }
    } finally {
      const until = performance.now() + 45000 + Math.random() * 45000;
      this.cool.set(a, until);
      this.cool.set(b, until);
      this.busy.delete(a);
      this.busy.delete(b);
      this.active--;
    }
  }
}
