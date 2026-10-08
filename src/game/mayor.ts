import * as THREE from "three";
import { get } from "../data/zscan";
import type { Decor } from "../scene/decor";
import type { ChainClock } from "./clock";
import { profile } from "./profile";
import type { GameHud } from "./ui";

export type Effect = "festival" | "curfew" | "treasure" | "quiet";

export interface Decree {
  height: number;
  until: number;
  decree: { title: string; text: string; effect: Effect };
}

export interface MayorHooks {
  /** A decree comes into force (or `null`: the last one ran out). */
  effect(e: Effect | null): void;
  /** Festival: a burst of fireworks. */
  party(seconds: number): void;
  /** Spots on the pavements where treasure can be hidden. */
  spots(): THREE.Vector3[];
}

const COLOR: Record<Effect, string> = { festival: "#ff7aa8", curfew: "#8a8896", treasure: "#f4b728", quiet: "#5fb4ee" };

/**
 * The mayor of ZStreet: every 40 blocks a decree, written by the API's model from the last 40
 * blocks (lots of empty ones → a curfew, a shielded majority → a festival, a fee spike → a
 * treasure hunt). The decree runs on every LED screen and really changes the city.
 */
export class Mayor {
  current: Decree | null = null;
  readonly treasure: Treasure;
  private festivalAt = 0;

  constructor(
    scene: THREE.Scene,
    private clock: ChainClock,
    private decor: Decor,
    private hud: GameHud,
    private hooks: MayorHooks,
  ) {
    this.treasure = new Treasure(scene, hud);
    clock.onBlock((b) => {
      if (!this.current || b.height >= this.current.until) setTimeout(() => void this.fetch(), 3000);
      else if (this.current.decree.effect === "festival" && b.txs.length) this.hooks.party(3);
    });
    hud.root.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-decree]")) this.announce();
    });
  }

  async fetch() {
    const d = await get<Decree>("/v1/street/mayor");
    if (!d?.decree) return;
    const fresh = !this.current || this.current.height !== d.height;
    this.current = d;
    if (this.clock.height && this.clock.height >= d.until) return this.end();
    if (!fresh) return;
    this.hooks.effect(d.decree.effect);
    if (d.decree.effect === "treasure") this.treasure.hide(this.hooks.spots(), 12);
    else this.treasure.clear();
    if (d.decree.effect === "festival" && performance.now() - this.festivalAt > 60_000) {
      this.festivalAt = performance.now();
      this.hooks.party(8);
    }
    this.announce(true);
  }

  private end() {
    this.hooks.effect(null);
    this.treasure.clear();
  }

  announce(mail = false) {
    const d = this.current;
    if (!d) return;
    this.decor.alert({ kind: "game", title: "MAYOR'S DECREE  市長令", big: d.decree.title.toUpperCase(), line: `UNTIL BLOCK ${d.until.toLocaleString("en-US")}`, color: COLOR[d.decree.effect] });
    if (mail) this.hud.mail("mayor", `Decree: ${d.decree.title}`, d.decree.text);
  }
}

/**
 * The treasure hunt: gold ⓩ coins hidden on the pavements, spinning. Click one (or walk into it
 * on foot) to pick it up.
 */
export class Treasure {
  private group = new THREE.Group();
  private coins: THREE.Mesh[] = [];
  private geo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 20);
  private mat = new THREE.MeshStandardMaterial({ color: "#f4b728", emissive: "#a86f00", emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.3 });

  constructor(
    scene: THREE.Scene,
    private hud: GameHud,
  ) {
    scene.add(this.group);
  }

  get left() {
    return this.coins.length;
  }

  get spots() {
    return this.coins.map((c) => c.position);
  }

  hide(spots: THREE.Vector3[], n: number) {
    this.clear();
    const pool = [...spots];
    for (let i = 0; i < n && pool.length; i++) {
      const p = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const c = new THREE.Mesh(this.geo, this.mat);
      c.rotation.x = Math.PI / 2;
      c.position.copy(p).setY(p.y + 1);
      c.userData.phase = Math.random() * 6;
      this.group.add(c);
      this.coins.push(c);
    }
  }

  clear() {
    for (const c of this.coins) this.group.remove(c);
    this.coins = [];
  }

  /** A click: true when it picked a coin up. */
  click(ray: THREE.Raycaster) {
    if (!this.coins.length) return false;
    // coins are small: test against a generous sphere round each
    const tmp = new THREE.Sphere(new THREE.Vector3(), 1.2);
    for (const c of this.coins) {
      tmp.center.copy(c.position);
      if (ray.ray.intersectsSphere(tmp)) return this.take(c), true;
    }
    return false;
  }

  /** On foot: walking into a coin picks it up. */
  near(p: THREE.Vector3) {
    for (const c of this.coins) if ((c.position.x - p.x) ** 2 + (c.position.z - p.z) ** 2 < 1.4) this.take(c);
  }

  private take(c: THREE.Mesh) {
    this.group.remove(c);
    this.coins = this.coins.filter((x) => x !== c);
    profile.pay(20, "treasure");
    this.hud.say(this.coins.length ? `<b>ⓩ +20</b> · ${this.coins.length} coin${this.coins.length === 1 ? "" : "s"} still hidden in the city` : `<b>TREASURE HUNT DONE</b> · you found them all`);
  }

  update(t: number) {
    for (const c of this.coins) {
      c.rotation.z = t * 2 + c.userData.phase;
      c.position.y += Math.sin(t * 2.4 + c.userData.phase) * 0.004;
    }
  }
}
