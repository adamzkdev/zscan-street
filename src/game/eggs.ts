import * as THREE from "three";
import type { Block } from "../data/types";
import type { Facade } from "../scene/city";
import { CURB } from "../scene/city";
import type { Decor } from "../scene/decor";
import type { ChainClock } from "./clock";
import { profile } from "./profile";
import type { GameHud } from "./ui";

interface Rule {
  key: string;
  name: string;
  test(b: Block): boolean;
  reward: number;
}

const RULES: Rule[] = [
  { key: "palindrome", name: "The Mirror Door", test: (b) => String(b.height) === [...String(b.height)].reverse().join(""), reward: 300 },
  { key: "thousand", name: "The Milestone Door", test: (b) => b.height % 1000 === 0, reward: 200 },
  { key: "twentyone", name: "The 21 Club", test: (b) => b.txs.length === 21, reward: 250 },
  { key: "seven", name: "Lucky Seven", test: (b) => b.txs.length === 7, reward: 70 },
  { key: "sixtynine", name: "The Nice Door", test: (b) => b.height % 100 === 69, reward: 69 },
];

/**
 * Secrets the chain unlocks: on a rare block (a palindrome height, a round thousand, exactly 21
 * transactions, seven, …) a glowing door opens in a facade somewhere in the city, the same for
 * everyone (the block picks the wall). It stays until the next block; the first visitor to find it
 * takes the prize, and the door closes for everyone else.
 */
export class Eggs {
  private door: THREE.Group;
  private glow: THREE.Mesh;
  private active: { rule: Rule; height: number } | null = null;
  private t = 0;

  constructor(
    scene: THREE.Scene,
    clock: ChainClock,
    private facades: Facade[],
    private decor: Decor,
    private hud: GameHud,
    /** Tell the other visitors it's been found. */
    private found: (height: number) => void,
  ) {
    this.door = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.6, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color("#f4b728").multiplyScalar(2.2), toneMapped: false }));
    frame.position.y = 1.3;
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.3), new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff3c4").multiplyScalar(2.5), toneMapped: false, transparent: true }));
    this.glow.position.set(0, 1.25, 0.11);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.5), new THREE.MeshBasicMaterial({ color: "#f4b728", transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.position.set(0, 1.4, 0.15);
    // a beam into the sky: seen from anywhere in the city, so the hunt can start
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 90, 16, 1, true), new THREE.MeshBasicMaterial({ color: "#f4b728", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    beam.position.set(0, 45, 1.2);
    // only the door itself can be clicked, not its glow or the beam
    beam.raycast = halo.raycast = () => {};
    this.door.add(frame, this.glow, halo, beam);
    this.door.visible = false;
    scene.add(this.door);
    clock.onBlock((b) => this.block(b));
  }

  private block(b: Block) {
    this.close();
    const rule = RULES.find((r) => r.test(b));
    if (!rule) return;
    // the block's height picks the wall, so every visitor gets the same door
    const walls = this.facades.filter((f) => f.face === "s" && f.frontRow && f.x1 - f.x0 > 3);
    if (!walls.length) return;
    const f = walls[b.height % walls.length];
    const x = f.x0 + 1 + ((b.height * 7919) % 1000) / 1000 * (f.x1 - f.x0 - 2);
    this.door.position.set(x, CURB, f.z + 0.12);
    this.door.visible = true;
    this.active = { rule, height: b.height };
    this.decor.alert({ kind: "game", title: "A SECRET OPENED  秘密", big: rule.name.toUpperCase(), line: "SOMEWHERE IN THE CITY · FIND IT", color: "#f4b728" });
    this.hud.say(`<b>${rule.name.toUpperCase()}</b> · block ${b.height.toLocaleString("en-US")} opened a secret door somewhere in the city. First one there wins.`);
  }

  private close() {
    this.door.visible = false;
    this.active = null;
  }

  /** A click in the city: true when it was the door. */
  click(ray: THREE.Raycaster) {
    if (!this.active) return false;
    if (!ray.intersectObject(this.door, true).length) return false;
    const { rule, height } = this.active;
    this.close();
    this.found(height);
    profile.pay(rule.reward, "secret");
    profile.update((p) => {
      p.eggs[rule.key] = height;
      p.stats.eggs++;
    });
    this.hud.say(`<b>YOU FOUND IT</b> · ${rule.name} · ⓩ +${rule.reward}`);
    return true;
  }

  /** Someone else got there first. */
  taken(height: number) {
    if (this.active?.height !== height) return;
    this.close();
    this.hud.say(`<b>TOO LATE</b> · another visitor found the secret door`);
  }

  update(dt: number) {
    if (!this.door.visible) return;
    this.t += dt;
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(this.t * 4) * 0.3;
  }

  /** For tests: open a door now. */
  test(key = "palindrome", height = 3511153) {
    const rule = RULES.find((r) => r.key === key) ?? RULES[0];
    this.block({ height, time: Date.now(), size: 0, fees: 0, pool: null, txs: rule.key === "twentyone" ? new Array(21).fill({}) : rule.key === "seven" ? new Array(7).fill({}) : [] } as Block);
  }

  get where() {
    return this.door.visible ? this.door.position : null;
  }
}
