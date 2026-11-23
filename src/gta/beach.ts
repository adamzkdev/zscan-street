import * as THREE from "three";
import { beachSpots, KGRID, KPIER, KSHORE, SEA_Y, sandAt, type BeachSpot } from "../scene/keys/plan";
import { residents } from "./census";
import { faces } from "./faces";
import type { Act } from "./figure";
import type { Person3 } from "./people3d";

/**
 * Orchard Beach's own people (src/gta): those who live on the beach (the census's "beach") out on it
 * — lying in the sun on their towels (on their backs, on their fronts), on the loungers under the
 * umbrellas or sitting up there, children building their sandcastles, two volleyball games (the ball
 * going over the net), a few at the bars, and swimmers out on the shelf, treading water or doing
 * lengths. Drawn by people3d.ts like everyone (in 3D round you); out there only when you are near
 * the beach. Same spots, same faces every visit.
 */

type Doing = "lie-back" | "lie-front" | "lounge" | "sit" | "castle" | "volley" | "bar" | "swim" | "tread";

interface Body {
  key: string;
  id: number;
  doing: Doing;
  x: number;
  z: number;
  y: number;
  /** Its heading (rad, people3d's: +z local → world (sin, cos)). */
  h: number;
  /** A swimmer's lap: centre, radius, speed (rad/s), phase. */
  lap?: { cx: number; cz: number; r: number; w: number; a: number };
  /** A volleyball player: its court and side. */
  court?: { c: number; side: 1 | -1 };
  gesture: Act["gesture"];
  gT: number;
  seed: number;
  /** Sitting: the seat's height over its feet (a lounger's, the sand's). */
  seatH?: number;
}

/** The beach's whole box (where it is worth thinking about them at all). */
const NEAR = { x0: KGRID.west - 40, x1: KGRID.east + 40, z0: KGRID.north + 20, z1: KSHORE.south + 40 };

export class Beach {
  readonly group = new THREE.Group();
  private bodies: Body[] = [];
  private on = false;
  private t = 0;
  /** The volleyball games: their balls and where they are in the rally. */
  private balls: { mesh: THREE.Mesh; x: number; z: number; y: number; t: number; from: 1 | -1 }[] = [];
  private courts: BeachSpot[] = [];

  constructor(scene: THREE.Scene) {
    this.group.name = "gta:beach";
    this.group.userData.noField = true;
    this.group.visible = false;
    scene.add(this.group);
    this.build();
  }

  /** The walks along the sand (for the passers-by): the water's edge, the towels' row, the west and east beaches. */
  static walks(): [number, number, number, number][] {
    const S = KSHORE.south;
    const out: [number, number, number, number][] = [];
    for (const z of [S - 2.6, S - 15, 428]) {
      out.push([KGRID.west + 4, z, KPIER.x - KPIER.half - 2.5, z]);
      out.push([KPIER.x + KPIER.half + 2.5, z, KGRID.east - 4, z]);
    }
    out.push([KSHORE.west + 3, 290, KSHORE.west + 3, 404], [KSHORE.east - 3, 290, KSHORE.east - 3, 404]);
    return out;
  }

  private build() {
    const ids = residents("beach");
    let n = 0;
    const next = () => ids[n++ % ids.length];
    let h = 4111;
    const R = () => ((h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296);
    const add = (b: Omit<Body, "key" | "id" | "gesture" | "gT" | "seed"> & { gesture?: Act["gesture"] }) =>
      this.bodies.push({ key: `beach${this.bodies.length}`, id: next(), gesture: b.gesture ?? null, gT: R() * 8, seed: Math.floor(R() * 1e6), ...b });
    const fwd = (yaw: number, d: number) => [Math.sin(yaw) * d, Math.cos(yaw) * d];
    for (const s of beachSpots()) {
      const y = sandAt(s.x, s.z);
      if (s.kind === "towel") {
        // on the towel (the towel's long side along its yaw): on its back or its front, centred on it
        const front = R() < 0.4;
        const hd = front ? s.yaw + Math.PI : s.yaw;
        const [ox, oz] = fwd(hd, front ? -0.7 : 0.7);
        if (R() < 0.85) add({ doing: front ? "lie-front" : "lie-back", x: s.x + ox, z: s.z + oz, y: y + 0.02, h: hd });
        // a friend sitting beside it now and then
        if (R() < 0.3) {
          const [sx, sz] = fwd(s.yaw + Math.PI / 2, 1.2);
          add({ doing: "sit", x: s.x + sx, z: s.z + sz, y, h: s.yaw + Math.PI, gesture: R() < 0.5 ? "phone" : null });
        }
      } else if (s.kind === "set") {
        // the set: two loungers either side of the umbrella (model x ±1.67 m, their foot toward +z)
        for (const side of [-1, 1]) {
          const r = R();
          if (r < 0.25) continue;
          const lx = side * 1.67,
            lz = 0.05;
          const wx = s.x + Math.cos(s.yaw) * lx + Math.sin(s.yaw) * lz,
            wz = s.z - Math.sin(s.yaw) * lx + Math.cos(s.yaw) * lz;
          if (r < 0.7) add({ doing: "lounge", x: wx, z: wz, y: y + 0.2, h: s.yaw });
          else add({ doing: "sit", x: wx - Math.sin(s.yaw) * 0.5, z: wz - Math.cos(s.yaw) * 0.5, y, h: s.yaw, seatH: 0.4, gesture: R() < 0.4 ? "talk" : null });
        }
        // someone in the shade on the sand, looking at the sea
        if (R() < 0.35) add({ doing: "sit", x: s.x + (R() - 0.5) * 1.2, z: s.z + 1.6, y, h: 0 });
      } else if (s.kind === "castle") {
        for (let k = 0; k < (R() < 0.5 ? 1 : 2); k++) {
          const a = s.yaw + k * 2.4 + R();
          add({ doing: "castle", x: s.x + Math.sin(a) * 1.5, z: s.z + Math.cos(a) * 1.5, y, h: a + Math.PI });
        }
      } else if (s.kind === "court") {
        this.courts.push(s);
        const c = this.courts.length - 1;
        for (const side of [-1, 1] as const)
          for (const dx of [-2.3, 2.3]) add({ doing: "volley", x: s.x + dx + (R() - 0.5), z: s.z + side * (3 + R() * 1.5), y: sandAt(s.x, s.z + side * 3), h: side > 0 ? Math.PI : 0, court: { c, side } });
      } else if (s.kind === "bar") {
        for (let k = 0; k < 3; k++) {
          const ax = s.x - 3 + k * 3 + (R() - 0.5),
            az = s.z + 3.4 + R() * 0.6;
          add({ doing: "bar", x: ax, z: az, y: sandAt(ax, az), h: s.yaw, gesture: R() < 0.6 ? "talk" : null });
        }
      } else if (s.kind === "swim") {
        if (R() < 0.45) add({ doing: "tread", x: s.x, z: s.z, y: SEA_Y - 0.92, h: s.yaw });
        else add({ doing: "swim", x: s.x, z: s.z, y: SEA_Y - 0.4, h: s.yaw, lap: { cx: s.x, cz: s.z, r: 5 + R() * 7, w: (R() < 0.5 ? -1 : 1) * (0.09 + R() * 0.05), a: R() * 6.28 } });
      }
    }
    // the volleyballs
    const ballMat = new THREE.MeshStandardMaterial({ color: "#f4f0e4", roughness: 0.6 });
    for (const c of this.courts) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), ballMat);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.balls.push({ mesh, x: c.x, z: c.z, y: 2, t: Math.random() * 2, from: 1 });
    }
  }

  /** Each frame: out on the beach when you are near it (and their looks read ahead), the balls in play. */
  update(dt: number, me: THREE.Vector3) {
    const near = me.x > NEAR.x0 - 260 && me.x < NEAR.x1 + 260 && me.z > NEAR.z0 - 260 && me.z < NEAR.z1 + 260;
    if (near !== this.on) {
      this.on = near;
      this.group.visible = near;
      // (the atlas's quick reads for all of them, the pictures for a few)
      if (near) {
        faces.quick(this.bodies.map((b) => b.id));
        faces.want(this.bodies.slice(0, 12).map((b) => b.id));
      }
    }
    if (!near) return;
    this.t += dt;
    for (const b of this.bodies) {
      if (b.lap) {
        b.lap.a += b.lap.w * dt * (5 / b.lap.r);
        b.x = b.lap.cx + Math.cos(b.lap.a) * b.lap.r;
        b.z = b.lap.cz + Math.sin(b.lap.a) * b.lap.r;
      }
      // now and then a gesture: a call, a word, a wave to the sea
      b.gT -= dt;
      if (b.gT <= 0 && (b.doing === "sit" || b.doing === "bar")) {
        b.gT = 5 + Math.random() * 10;
        const r = Math.random();
        b.gesture = r < 0.35 ? "talk" : r < 0.5 ? "phone" : r < 0.58 ? "wave" : null;
      }
    }
    // the rallies: the ball over the net, side to side, a player under it reaching up
    for (let i = 0; i < this.balls.length; i++) {
      const ball = this.balls[i],
        c = this.courts[i];
      ball.t += dt / 1.35;
      if (ball.t >= 1) {
        ball.t -= 1;
        ball.from = ball.from > 0 ? -1 : 1;
      }
      const k = ball.t;
      const z0 = c.z + ball.from * 3.6,
        z1 = c.z - ball.from * 3.6;
      const x0 = c.x + Math.sin(i * 7 + Math.floor(this.t / 1.35)) * 2,
        x1 = c.x + Math.sin(i * 7 + Math.floor(this.t / 1.35) + 1) * 2;
      const gy = sandAt(c.x, c.z);
      ball.mesh.position.set(x0 + (x1 - x0) * k, gy + 2.1 + Math.sin(k * Math.PI) * 3.2, z0 + (z1 - z0) * k);
    }
  }

  /** Off (the game stopped): nobody out, no balls in the air. */
  hide() {
    this.on = false;
    this.group.visible = false;
  }

  /** Those within r of (x, z), for people3d (none when you are far). */
  near(x: number, z: number, r: number): Person3[] {
    if (!this.on) return [];
    const out: Person3[] = [];
    for (const b of this.bodies) {
      if ((b.x - x) ** 2 + (b.z - z) ** 2 > r * r) continue;
      out.push(this.person(b));
    }
    return out;
  }

  private cache = new Map<string, Person3>();
  private person(b: Body): Person3 {
    let p = this.cache.get(b.key);
    if (p) return p;
    const swims = b.doing === "swim" || b.doing === "tread";
    p = {
      key: b.key,
      id: b.id,
      pos: (o) => o.set(b.x, b.y + (swims ? 0.03 * Math.sin(this.t * 2 + b.seed) : 0), b.z),
      down: () => ({ k: 0, side: 0 }),
      face: () => (b.lap ? null : new THREE.Vector3(Math.sin(b.h), 0, Math.cos(b.h))),
      heading: () => (b.lap ? Math.atan2(-Math.sin(b.lap.a) * Math.sign(b.lap.w), Math.cos(b.lap.a) * Math.sign(b.lap.w)) : b.h),
      seat: () => (b.doing === "sit" ? (b.seatH ?? 0.03) : b.doing === "castle" ? 0.03 : 0),
      pose: () => (b.doing === "volley" ? (this.reaching(b) ? "hands" : null) : b.doing === "castle" ? null : b.gesture),
      act: (a: Act) => {
        a.lie = b.doing === "lie-back" || b.doing === "lounge" ? 1 : b.doing === "lie-front" ? 2 : 0;
        a.swim = swims ? 1 : 0;
        // (a swimmer doing lengths: the crawl, from its own speed)
        if (b.lap) a.speed = 1.4;
        if (b.doing === "volley") a.air = this.reaching(b) ? 0.5 + 0.5 * Math.sin(this.t * 9) : 0;
        if (b.doing === "castle") {
          // patting the sand
          a.gesture = null;
        }
      },
      hide: () => {},
      alive: () => this.on,
    };
    this.cache.set(b.key, p);
    return p;
  }

  /** A volleyball player the ball is coming down to (it jumps, its arms up). */
  private reaching(b: Body) {
    if (!b.court) return false;
    const ball = this.balls[b.court.c];
    if (!ball) return false;
    const receiving = ball.from !== b.court.side;
    return receiving && ball.t > 0.75 && Math.abs(ball.mesh.position.x - b.x) < 1.6;
  }
}
