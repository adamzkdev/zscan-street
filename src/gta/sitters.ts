import * as THREE from "three";
import type { IsleSeat } from "../scene/isles/types";
import { residents } from "./census";
import { faces } from "./faces";
import type { Act } from "./figure";
import type { Person3 } from "./people3d";

/**
 * The islands' people who stay put (src/gta): the cafés' customers at their terraces' tables (an old
 * town's squares: src/scene/isles/west), the stallholders behind their counters — each a zkSNARK of
 * the census's neighbourhood there, the same one in the same chair every visit, talking with its
 * hands now and then, a phone out, a wave. Drawn by people3d.ts like everyone (in 3D round you), only
 * when you are near their seats.
 */

interface Sitter {
  key: string;
  id: number;
  seat: IsleSeat;
  gesture: Act["gesture"];
  gT: number;
}

/** How near (m) a sitter must be to be thought about at all. */
const NEAR = 160;

export class Sitters {
  private all: Sitter[] = [];
  private seen = 0;
  private t = 0;
  private cache = new Map<string, Person3>();
  private on = false;

  constructor(private seats: () => IsleSeat[]) {}

  /** Each frame: the newly loaded islands' seats taken, the gestures changed now and then. */
  update(dt: number) {
    const list = this.seats();
    if (list.length !== this.seen) this.take(list);
    if (!this.all.length) return;
    this.t += dt;
    for (const s of this.all) {
      s.gT -= dt;
      if (s.gT > 0) continue;
      s.gT = 5 + Math.random() * 11;
      const r = Math.random();
      s.gesture = s.seat.stand ? (r < 0.45 ? "talk" : r < 0.55 ? "wave" : null) : r < 0.4 ? "talk" : r < 0.55 ? "phone" : r < 0.6 ? "wave" : null;
    }
  }

  private take(list: IsleSeat[]) {
    const by = new Map<string, number>();
    for (let i = this.seen; i < list.length; i++) {
      const seat = list[i];
      const ids = residents(seat.area);
      const n = by.get(seat.area) ?? 0;
      by.set(seat.area, n + 1);
      // (from the far end of the neighbourhood's list: the passers-by there come from its start)
      const id = ids.length ? ids[(ids.length - 1 - ((n * 7) % ids.length) + ids.length) % ids.length] : 1 + ((i * 7919) % 10000);
      this.all.push({ key: `sit${i}`, id, seat, gesture: null, gT: (i * 0.37) % 9 });
    }
    this.seen = list.length;
  }

  /** Those within r of (x, z), for people3d. */
  near(x: number, z: number, r: number): Person3[] {
    const out: Person3[] = [];
    if (!this.all.length) return out;
    let any = false;
    for (const s of this.all) {
      const d2 = (s.seat.x - x) ** 2 + (s.seat.z - z) ** 2;
      if (d2 < NEAR * NEAR) any = true;
      if (d2 > r * r) continue;
      out.push(this.person(s));
    }
    // (coming near: their looks read ahead, all at once, the atlas's quick ones)
    if (any !== this.on) {
      this.on = any;
      if (any) faces.quick(this.all.filter((s) => (s.seat.x - x) ** 2 + (s.seat.z - z) ** 2 < NEAR * NEAR).map((s) => s.id));
    }
    return out;
  }

  private person(s: Sitter): Person3 {
    let p = this.cache.get(s.key);
    if (p) return p;
    const seat = s.seat;
    p = {
      key: s.key,
      id: s.id,
      pos: (o) => o.set(seat.x, seat.y, seat.z),
      down: () => ({ k: 0, side: 0 }),
      face: () => new THREE.Vector3(Math.sin(seat.h), 0, Math.cos(seat.h)),
      heading: () => seat.h,
      seat: () => (seat.stand ? 0 : (seat.seatH ?? 0.45)),
      pose: () => s.gesture,
      act: (a: Act) => {
        a.lie = 0;
        a.swim = 0;
      },
      fixed: true,
      hide: () => {},
      alive: () => true,
    };
    this.cache.set(s.key, p);
    return p;
  }
}
