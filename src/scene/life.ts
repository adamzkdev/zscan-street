import * as THREE from "three";
import type { City } from "./city";
import { CITY, CURB, PARK, RIVER, SHOTENGAI } from "./city/plan";
import type { Director } from "./director";
import type { Snark } from "./snark";
import type { Emote, LifeItem } from "./sprites";
import { Market } from "../data/market";

/**
 * Life all over the bigger city, not only in the heart: anglers on the river quays (now and then
 * one lands a fish), people on the water bus and the moored boats, neighbours out on their
 * balconies, joggers on the park's loop and families picnicking on the meadow, shoppers strolling
 * the shōtengai. They are residents like the others: click them, talk to them.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export class Life {
  private seq = Math.floor(Math.random() * 9000);
  private lines: THREE.Line[] = [];

  constructor(
    private scene: THREE.Object3D,
    private city: City,
    private director: Director,
    /** 0..1: how much of it the device can afford. */
    budget: number,
  ) {
    const n = (k: number) => Math.max(1, Math.round(k * budget));
    void this.anglers(n(6));
    void this.boats(n(5));
    void this.balconies(n(12));
    void this.park(n(4), n(5));
    void this.shotengai(n(7));
    void this.conversations(n(5));
  }

  // ---- conversations -------------------------------------------------------------------------------

  private price: number | null = null;

  /** Small talk, from what is really going on: the last block, the mempool, the price, NU7. */
  private dialogues(): [string, string][] {
    const h = this.director.blockHeight;
    const m = this.director.mempoolList().length;
    const out: [string, string][] = [
      ["Shielded or transparent?", "Shielded. Always."],
      ["NU7 is coming soon.", "The NSM will be huge."],
      ["Have you tried the ramen?", "Mining-grade spicy!"],
      ["Lost my viewing key...", "Don't say that out loud!"],
      ["Took the metro today.", "Full block, full train!"],
      ["Is that your parcel?", "Can't tell. It's shielded."],
      ["Who mined the last one?", "No idea. Ask the café."],
      ["Orchard or Ironwood?", "Ironwood, I moved."],
    ];
    if (h) out.push([`Did you see block #${h.toLocaleString("en-US")}?`, "My tx was on it!"]);
    if (m) out.push([`${m} tx in the mempool.`, m > 15 ? "Busy day for the buses." : "Quiet one today."]);
    if (this.price) out.push([`ZEC at $${Math.round(this.price).toLocaleString("en-US")}!`, "Told you so."]);
    return out;
  }

  private async conversations(n: number) {
    Market.subscribe((mk) => (this.price = mk.price?.usd ?? this.price));
    const spots: [number, number][] = [
      [-9, 10.4],
      [6, 12.8],
      [SHOTENGAI.x + 1.6, -6],
      [-20, -60],
      [24, -96],
      [-70, RIVER.z0 - 1.6],
      [40, 30.2],
    ];
    for (const [x, z] of spots.slice(0, n)) {
      const a = await this.person("Neighbour", pick([null, "coffee", "phone"] as (LifeItem | null)[]));
      const b = await this.person("Neighbour", pick([null, "bag", "can"] as (LifeItem | null)[]));
      a.root.position.set(x - 0.6, CURB, z);
      b.root.position.set(x + 0.6, CURB, z);
      a.faceDir = v(1, 0, 0);
      b.faceDir = v(-1, 0, 0);
      void (async () => {
        await sleep(rand(1000, 8000));
        while (this.director.snarks.has(a) && this.director.snarks.has(b)) {
          const [q, r] = pick(this.dialogues());
          const [first, second] = Math.random() < 0.5 ? [a, b] : [b, a];
          first.say(q, 3.2);
          await sleep(3400);
          second.say(r, 3);
          if (Math.random() < 0.4) first.emote(pick(["heart", "!", "note", "zec"] as Emote[]), 2);
          await sleep(rand(6000, 14000));
        }
      })();
    }
  }

  private async person(role: string, item: LifeItem | null = null) {
    const s = await this.director.newSnark(((this.seq += 389) % 10000) + 1);
    this.director.adopt(s);
    s.role = role;
    if (item) this.hold(s, item);
    return s;
  }

  private hold(s: Snark, item: LifeItem | null) {
    s.carry = item;
    s.redrawHold();
    s.showParcels(!!item);
  }

  /** Now and then a reaction bubble, for as long as the person is in the city. */
  private chatter(s: Snark, emotes: Emote[], every = 12000) {
    const id = setInterval(() => {
      if (!this.director.snarks.has(s)) return clearInterval(id);
      if (Math.random() < 0.5) s.emote(pick(emotes));
    }, every + Math.random() * every);
  }

  // ---- the river ---------------------------------------------------------------------------------

  private async anglers(n: number) {
    const lineMat = new THREE.LineBasicMaterial({ color: "#d8d8e0", transparent: true, opacity: 0.6 });
    const spots: { x: number; z: number; out: number }[] = [];
    for (let i = 0; i < n; i++) {
      let x = 0;
      // not on a bridge
      for (let k = 0; k < 20; k++) {
        x = rand(CITY.minX + 6, CITY.maxX - 6);
        if (!RIVER.bridges.concat(RIVER.foot).some((b) => Math.abs(b - x) < 7) && !spots.some((s) => Math.abs(s.x - x) < 5)) break;
      }
      const north = i % 3 !== 2;
      spots.push({ x, z: north ? RIVER.z0 - 1.1 : RIVER.z1 + 1.1, out: north ? 1 : -1 });
    }
    for (const sp of spots) {
      const s = await this.person("Angler", "rod");
      s.root.position.set(sp.x, CURB, sp.z);
      s.faceDir = v(0, 0, sp.out);
      // the line: from the rod's tip down to the water
      const tip = v(sp.x + 0.75, CURB + 2.05, sp.z + sp.out * 0.3);
      const bob = v(sp.x + 1.4, RIVER.water + 0.02, sp.z + sp.out * 3.4);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([tip, bob]), lineMat);
      this.scene.add(line);
      this.lines.push(line);
      // waiting, then a bite: a fish, a bubble, and back to it
      void (async () => {
        while (this.director.snarks.has(s)) {
          await sleep(rand(25000, 70000));
          if (!this.director.snarks.has(s)) break;
          s.emote("!", 1.6);
          await sleep(1200);
          this.hold(s, "fish");
          s.emote(pick(["heart", "star", "note"] as Emote[]), 2.4);
          await sleep(rand(4000, 7000));
          this.hold(s, "rod");
        }
      })();
    }
  }

  private async boats(n: number) {
    const boats = this.city.boats;
    if (!boats.length) return;
    // on the water bus's decks, front and back; one or two on the moored boats
    const deck: [number, number][] = [
      [3.4, 0.4],
      [3.4, -0.5],
      [-3.0, 0.3],
      [-3.4, -0.4],
    ];
    for (let i = 0; i < n; i++) {
      const onFerry = i < Math.min(4, n - 1);
      const boat = onFerry ? boats[0] : boats[1 + ((i - 4) % (boats.length - 1))];
      const s = await this.person(onFerry ? "Passenger" : "Boater", pick([null, "phone", "coffee", null] as (LifeItem | null)[]));
      boat.add(s.root);
      const [x, z] = onFerry ? deck[i] : [rand(-3, 3), rand(-0.4, 0.4)];
      s.root.position.set(x, 0.85, z);
      s.setScale(0.8);
      s.faceDir = v(0, 0, 1);
      this.chatter(s, ["note", "heart", "dots", "star"]);
    }
  }

  // ---- balconies ----------------------------------------------------------------------------------

  private async balconies(n: number) {
    const all = this.city.facades.flatMap((f) => (f.balconies ?? []).map((p) => ({ p, out: f.out! })));
    // near the heart first, where the camera usually is
    const near = all.filter(({ p }) => Math.hypot(p.x, p.z) < 110).sort(() => Math.random() - 0.5);
    const items: (LifeItem | null)[] = ["coffee", "phone", "book", null, null, "can", "flowers"];
    for (const { p, out } of near.slice(0, n)) {
      const s = await this.person("Neighbour", pick(items));
      s.root.position.copy(p);
      s.faceDir = out.clone();
      this.chatter(s, ["note", "heart", "zzz", "dots", "zec"], 14000);
    }
  }

  // ---- the park ------------------------------------------------------------------------------------

  private async park(joggers: number, picnic: number) {
    const loop = PARK.paths[1].map(([x, z]) => v(x, CURB, z));
    for (let i = 0; i < joggers; i++) {
      const s = await this.person("Jogger");
      s.noClip = true;
      const start = Math.floor((i / joggers) * loop.length);
      s.root.position.copy(loop[start]);
      void (async () => {
        let k = start;
        while (this.director.snarks.has(s)) {
          const route = [...loop.slice(k + 1), ...loop.slice(0, k + 1)];
          await s.walk(route, rand(2.6, 3.4));
          k = (k + loop.length - 1) % loop.length;
          if (Math.random() < 0.3) {
            s.emote(pick(["note", "star", "heart"] as Emote[]));
            await sleep(3000);
          }
        }
      })();
    }
    // a picnic on the meadow: a few friends sitting in a ring, a basket between them
    const M = PARK.meadow;
    for (let i = 0; i < picnic; i++) {
      const a = (i / picnic) * Math.PI * 2;
      const s = await this.person("Picnicker", i === 0 ? "basket" : pick(["can", "coffee", null, "book"] as (LifeItem | null)[]));
      s.root.position.set(M.x + Math.cos(a) * 1.3, CURB, M.z + Math.sin(a) * 1.3);
      s.sit(true);
      s.faceDir = v(-Math.cos(a), 0, -Math.sin(a));
      this.chatter(s, ["heart", "note", "dots", "star"], 9000);
    }
  }

  // ---- the shōtengai -----------------------------------------------------------------------------

  private async shotengai(n: number) {
    const A = SHOTENGAI;
    const items: (LifeItem | null)[] = ["bag", "bag", null, "coffee", "flowers", "phone"];
    for (let i = 0; i < n; i++) {
      const s = await this.person("Shopper", pick(items));
      s.root.position.set(A.x + rand(-2, 2), CURB, rand(A.z0 + 2, A.z1 - 2));
      void (async () => {
        while (this.director.snarks.has(s)) {
          // a few steps along the arcade, then a look at a shop window
          const z = THREE.MathUtils.clamp(s.root.position.z + rand(-14, 14), A.z0 + 2, A.z1 - 2);
          const side = Math.random() < 0.5 ? -1 : 1;
          await s.walk([v(A.x + side * 0.8, CURB, z), v(A.x + side * 3.1, CURB, z)], rand(1.0, 1.4));
          s.faceDir = v(side, 0, 0);
          if (Math.random() < 0.5) s.emote(pick(["?", "heart", "zec", "!"] as Emote[]));
          await sleep(rand(3000, 9000));
          s.faceDir = null;
        }
      })();
    }
  }
}
