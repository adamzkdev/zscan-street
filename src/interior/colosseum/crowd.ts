import * as THREE from "three";
import type { Fans } from "../stadium/fans";
import { ARENA_GOLD, ARENA_HIT, ARENA_RISE, ARENA_SILVER, ARENA_WIN, liveLines, pickOf, type Line } from "../stadium/lines";
import { Shouts } from "../stadium/shout";

/**
 * The cavea's voice and body: the cheer and the wave on the GPU fans, and the shouting over them
 * (FIGHT!, AVE ZCASH!, THUMBS DOWN!), with a burst at every blow and every verdict.
 */
export class ArenaCrowd {
  readonly shouts: Shouts;
  private cheer = 0;
  private waveA = 0;
  private waveOn = 0;
  private next = 1;
  private nextChant = 6;
  private height: number | null = null;
  private gold = (i: number) => this.fans.seats[i].team === 0;
  private silver = (i: number) => this.fans.seats[i].team === 1;

  constructor(
    private fans: Fans,
    parent: THREE.Object3D,
  ) {
    this.shouts = new Shouts(fans, 5);
    this.shouts.size = 0.07;
    this.shouts.range = 45;
    parent.add(this.shouts.group);
  }

  private say([t, s]: Line, near?: (i: number) => boolean, delay = 0) {
    this.shouts.say(t, s, { near, delay });
  }

  setCheer(v: number) {
    this.cheer = v;
  }
  wave() {
    this.waveA = -Math.PI;
    this.waveOn = 1;
  }
  rise(height: number) {
    this.height = height;
    for (let k = 0; k < 4; k++) this.say(pickOf(ARENA_RISE), undefined, k * 0.25);
    this.say([`BLOCK ${height.toLocaleString("en-US")}! FIGHT!`, "shout"], this.gold, 0.9);
  }
  hit() {
    if (this.shouts.busy < this.shouts.max - 2) this.say(pickOf(ARENA_HIT), undefined, 0.05);
  }
  result(r: { height: number; winner: number }) {
    this.height = r.height;
    const h = r.height.toLocaleString("en-US");
    const win = r.winner === 0 ? this.gold : r.winner === 1 ? this.silver : undefined;
    for (let k = 0; k < 8; k++) {
      const l: Line = r.winner === 1 && k % 2 === 0 ? ["TRANSPARENT WINS!", "silver"] : r.winner === 2 && k % 2 === 0 ? ["A DRAW?!", "talk"] : pickOf(ARENA_WIN);
      this.say(l, win, k * 0.2);
    }
    this.say([r.winner === 0 ? `BLOCK ${h} IS SHIELDED!` : `BLOCK ${h}!`, "shout"], win, 0.6);
    this.say(["THUMBS DOWN!", "boo"], undefined, 1.4);
  }

  tick(dt: number, t: number, camera: THREE.Camera | null) {
    const u = this.fans.uniforms;
    this.fans.tick(t);
    if (this.waveOn > 0) {
      this.waveA += dt * 2.2;
      if (this.waveA > Math.PI * 3) this.waveOn = 0;
    }
    u.uWave.value.set(this.waveA, this.waveOn);
    // the old shader's cheer: everybody up and jumping together
    u.uCheer.value.set(this.cheer, this.cheer, Math.max(0, this.cheer - 0.1) * 0.5);
    u.uScarf.value += ((this.cheer > 0.5 ? 1 : 0.2) - u.uScarf.value) * Math.min(1, dt * 2);
    if (!camera) return;
    this.next -= dt * (1 + this.cheer * 2);
    if (this.next <= 0 && this.shouts.busy < this.shouts.max - 3) {
      this.next = 0.4 + Math.random() * 0.5;
      const r = Math.random();
      if (r < 0.12) {
        const live = liveLines(this.height);
        if (live.length) this.say(pickOf(live), this.gold);
      } else if (r < 0.38) this.say(pickOf(ARENA_SILVER), this.silver);
      else this.say(pickOf(ARENA_GOLD), this.gold);
    }
    this.nextChant -= dt;
    if (this.nextChant <= 0) {
      this.nextChant = 14 + Math.random() * 10;
      const c = pickOf<Line>([
        ["AVE ZCASH!", "chant"],
        ["SHIELDED TO THE DEATH!", "chant"],
        ["FIGHT! FIGHT! FIGHT!", "chant"],
      ]);
      for (let k = 0; k < 5; k++) this.say(c, this.gold, k * 0.3);
    }
    this.shouts.tick(dt, camera);
  }
}
