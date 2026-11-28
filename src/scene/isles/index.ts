import * as THREE from "three";
import { BAY, CURB } from "../city/plan";
import type { Course } from "./course";
import { buildCrossing } from "./crossings/others";
import { deckNight } from "./crossings/deck";
import { brooklynNight } from "./crossings/brooklyn";
import { IsleLand } from "./land";
import { COURSES, inBox, ISLES } from "./plan";
import { IsleTraffic } from "./traffic";
import type { Isle, IsleContent, IsleFacade, IsleSeat } from "./types";

/**
 * The islands, alive (src/scene/isles; the recipe: RECIPE.md): each one's crossing drawn at once (it
 * is seen from the city), its ground and its content built once the city is up, a slice at a time;
 * its traffic over the crossing and round its blocks. And the answers main.ts and the game ask of the
 * world out there: who owns a point, the deck's height under a wheel or a foot, the railings that
 * hold a car on the deck, the sea off its beaches, its front doors, its parked cars.
 *
 * Far islands cost little: their small things (props, parked cars, trees) are hidden past NEAR_R
 * metres of the camera, the rest is culled by the view; the game's solid shape of an island is only
 * made as you come near it (src/gta/collide.ts, `lazy`).
 */

const WATER = BAY.water;
/** Within this of an island's box its small things are drawn. */
const NEAR_R = 340;

export interface LiveIsle {
  isle: Isle;
  course: Course;
  land: IsleLand;
  /** The crossing's drawing. */
  crossing: THREE.Group;
  /** The ground and the content. */
  root: THREE.Group;
  /** The content's small things (hidden when far). */
  near: THREE.Group;
  traffic: IsleTraffic;
  content: IsleContent | null;
}

/** Each island's traffic loops (corners after the crossing's end, before it turns back): from its descriptor's grid. */
function loopsOf(isle: Isle): [number, number][][] {
  const end = isle.crossing.path[isle.crossing.path.length - 1];
  const ns = isle.streets.filter((s) => s.axis === "z").map((s) => s.at);
  const ew = isle.streets.filter((s) => s.axis === "x").map((s) => s.at);
  // the crossing lands on an east–west street (or a north–south one): the loops leave it, go round a block, come back to it
  const landsEW = isle.streets.some((s) => s.axis === "x" && Math.abs(s.at - end[1]) < 1);
  const out: [number, number][][] = [];
  if (landsEW) {
    const z = end[1];
    const others = ew.filter((v) => Math.abs(v - z) > 1);
    for (let i = 0; i + 1 < ns.length; i++)
      for (const oz of others) {
        const [a, b] = Math.abs(ns[i] - end[0]) < Math.abs(ns[i + 1] - end[0]) ? [ns[i + 1], ns[i]] : [ns[i], ns[i + 1]];
        // (only the blocks next to the boulevard and the one after)
        if (Math.abs(oz - z) > 200) continue;
        out.push([
          [a, z],
          [a, oz],
          [b, oz],
          [b, z],
        ]);
      }
  } else {
    const x = end[0];
    const others = ns.filter((v) => Math.abs(v - x) > 1);
    for (let i = 0; i + 1 < ew.length; i++)
      for (const ox of others) {
        if (Math.abs(ox - x) > 200) continue;
        const [a, b] = Math.abs(ew[i] - end[1]) < Math.abs(ew[i + 1] - end[1]) ? [ew[i + 1], ew[i]] : [ew[i], ew[i + 1]];
        out.push([
          [x, a],
          [ox, a],
          [ox, b],
          [x, b],
        ]);
      }
  }
  // (every leg of a loop on a street that is there: a street that stops short, a canal between, and the loop is left out)
  const on = (x: number, z: number) => isle.streets.some((s) => (s.axis === "x" ? Math.abs(z - s.at) < s.width / 2 && x > s.from - 1 && x < s.to + 1 : Math.abs(x - s.at) < s.width / 2 && z > s.from - 1 && z < s.to + 1));
  const leg = (a: [number, number], b: [number, number]) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4);
    for (let k = 0; k <= n; k++) if (!on(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n)) return false;
    return true;
  };
  return out.filter((l) => l.every((p, k) => leg(p, l[(k + 1) % l.length])));
}

export class Isles {
  readonly live: LiveIsle[] = [];
  facades: IsleFacade[] = [];
  parkedCars: { obj: THREE.Group; kind: string }[] = [];
  /** Pavements of their own for the passers-by (the beach's promenade…). */
  walks: [number, number, number, number][] = [];
  /** Their street lamps' heads, for the street's pool of lamp lights (main.ts adds them to the city's). */
  lamps: { pos: THREE.Vector3; color: string }[] = [];
  /** Their people who stay put (the cafés' terraces, the stalls): src/gta/sitters.ts. */
  seats: IsleSeat[] = [];
  /** What lights up only at night on them (lamp heads, lit signs): shown with the night. */
  private glows: THREE.Object3D[] = [];
  private glowOn: boolean | null = null;
  /** Built: the islands' ground and content are in. */
  readonly ready: Promise<void>;
  private go!: () => void;

  constructor(
    scene: THREE.Object3D,
    private night: () => number,
  ) {
    for (const isle of ISLES) {
      const course = COURSES.get(isle.key)!;
      const crossing = buildCrossing(course);
      scene.add(crossing);
      const root = new THREE.Group();
      root.name = `isle:${isle.key}`;
      const near = new THREE.Group();
      near.name = `isle:${isle.key}:near`;
      root.add(near);
      scene.add(root);
      const traffic = new IsleTraffic(scene, isle, course, loopsOf(isle));
      this.live.push({ isle, course, land: new IsleLand(isle), crossing, root, near, traffic, content: null });
    }
    this.ready = new Promise((r) => (this.go = r));
  }

  /** Build the islands' ground and content (after the city: slices between frames). */
  async build() {
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    for (const L of this.live) {
      L.root.add(L.land.build());
      await frame();
      const mod = await L.isle.load();
      const content = await mod.default({ isle: L.isle, ground: (x, z) => L.land.ground(x, z), road: (x, z) => L.land.road(x, z), yieldFrame: frame }, { root: L.root, near: L.near });
      L.content = content;
      this.facades.push(...content.facades);
      for (const p of content.parked) this.parkedCars.push(p as { obj: THREE.Group; kind: string });
      this.walks.push(...content.walks);
      for (const l of content.lamps ?? []) this.lamps.push({ pos: new THREE.Vector3(l[0], l[1], l[2]), color: l[3] });
      this.seats.push(...(content.seats ?? []));
      // (the night-only things: the city's are switched by its theme, the islands' are not in it)
      L.root.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m && (Array.isArray(m) ? m : [m]).some((x) => x.userData.night)) this.glows.push(o);
      });
      this.glowOn = null;
    }
    this.go();
  }

  // ---- where you are ----

  /** The island whose box holds (x, z) (or null). */
  isleAt(x: number, z: number): LiveIsle | null {
    for (const L of this.live) if (inBox(L.isle.box, x, z)) return L;
    return null;
  }

  /** The crossing under (x, z) within its deck's edge: which, how far along, how far off its centre line. */
  on(x: number, z: number): { L: LiveIsle; s: number; off: number } | null {
    for (const L of this.live) {
      const p = L.course.project(x, z);
      if (p && Math.abs(p.off) < L.isle.crossing.section.edge) return { L, s: p.s, off: p.off };
    }
    return null;
  }

  /** Out past the city's board but in the world: an island, or a crossing's deck. */
  owns(x: number, z: number) {
    return !!this.isleAt(x, z) || !!this.on(x, z);
  }

  /** On a crossing's deck (between its railings), where the deck stands clear of the ground. */
  onDeck(x: number, z: number) {
    const o = this.on(x, z);
    return !!o && Math.abs(o.off) < o.L.isle.crossing.section.rail;
  }

  /** The road's height on a crossing at (x, z) (null off it). */
  deckAt(x: number, z: number): number | null {
    const o = this.on(x, z);
    return o ? o.L.course.y(o.s) : null;
  }

  /** How high a crossing's promenade (Brooklyn's, over the median) stands over its road at s (0: none there). */
  private rise(L: LiveIsle, s: number) {
    const p = L.isle.crossing.promenade;
    if (!p || s < p.s0 || s > p.s1) return 0;
    const k = Math.min(1, (s - p.s0) / p.ramp, (p.s1 - s) / p.ramp);
    return p.rise * k * k * (3 - 2 * k);
  }

  /**
   * On foot: the deck's height (its walkways a kerb up; its promenade over the median), null off a
   * crossing — on an island, its own raised floors and its relief (a mountain's slopes).
   */
  groundAt(x: number, z: number): number | null {
    const o = this.on(x, z);
    if (!o) {
      const L = this.isleAt(x, z);
      if (!L) return null;
      const f = L.content?.floor?.(x, z);
      if (f !== undefined && f !== null) return f;
      if (!L.isle.relief) return null;
      const g = L.land.ground(x, z);
      return g > CURB + 0.45 ? g : null;
    }
    const sec = o.L.isle.crossing.section;
    const y = o.L.course.y(o.s);
    const pr = o.L.isle.crossing.promenade;
    if (pr && Math.abs(o.off) < pr.half) {
      const r = this.rise(o.L, o.s);
      if (r > 0) return y + r;
    }
    // (where the deck meets the streets at its ends, the street's own floor: the kerb, the road — but
    // down a tunnel's cutting and in its tube, the tube's own walkways a kerb up)
    const tubed = !!o.L.isle.crossing.tube && y < -0.4;
    if (!tubed && y < CURB + 0.12 && Math.abs(o.off) > sec.road) return null;
    return Math.abs(o.off) > sec.road + (tubed ? 0.05 : 0.5) ? y + (tubed ? 0.25 : 0.15) : y;
  }

  /** On foot on a deck: its railings stop a body (and the barriers between the walkway and the road, high up). */
  footBlocked(x: number, z: number) {
    const o = this.on(x, z);
    if (!o) return false;
    const sec = o.L.isle.crossing.section;
    const a = Math.abs(o.off);
    const y = o.L.course.y(o.s);
    // in a tunnel and down the cuttings of its ramps: its walls (its walkways run inside them)
    if (o.L.isle.crossing.tube && y < CURB - 0.3 && a > sec.road + 2.0) return true;
    if (y < CURB + 0.12) return false;
    if (a > sec.rail - 0.25) return true;
    // the promenade's railings (up there, over the median)
    const pr = o.L.isle.crossing.promenade;
    if (pr && this.rise(o.L, o.s) > 0.3 && Math.abs(a - pr.half) < 0.3) return true;
    // the barrier between the road and the walkway (crossed only near the ends)
    if (y > 2 && a > sec.road - 0.05 && a < sec.road + 0.55) return true;
    return false;
  }

  /** Under a wheel: a crossing's road, else an island's ground (null: neither). */
  carSurface(x: number, z: number): number | null {
    const o = this.on(x, z);
    if (o) return o.L.course.y(o.s);
    const L = this.isleAt(x, z);
    return L ? L.land.ground(x, z) : null;
  }

  /**
   * At the wheel on a deck high over the water: kept between its barriers and off the median (the
   * deck is above anything the game's solid shape sees). True when the deck held (p).
   */
  holdCar(p: THREE.Vector3, r: number) {
    const o = this.on(p.x, p.z);
    if (!o) {
      // on an island: its own roads' rails (a mountain road), and its relief's slopes (above what the solid shape sees)
      const L = this.isleAt(p.x, p.z);
      if (!L) return false;
      if (L.content?.hold?.(p, r)) return true;
      return !!L.isle.relief && L.land.ground(p.x, p.z) > CURB + 0.45;
    }
    const L = o.L;
    const sec = L.isle.crossing.section;
    const s = o.s;
    // (at its very ends the deck is in the streets: their own shape holds the car there)
    if (s < 8 || s > L.course.length - 8) return false;
    const half = sec.road - r;
    let off = Math.max(-half, Math.min(half, o.off));
    if (s > 16 && s < L.course.length - 16 && Math.abs(off) < sec.median + r) off = Math.sign(off || 1) * (sec.median + r);
    if (off === o.off) return true;
    const c = L.course.at(s);
    const dx = (off - o.off) * -c.tz,
      dz = (off - o.off) * c.tx;
    p.x += dx;
    p.z += dz;
    return true;
  }

  /** Off an island's beaches: the sea floor and the water's surface (waded in, swum), or null. */
  sea(x: number, z: number): { floor: number; surface: number } | null {
    const L = this.isleAt(x, z);
    if (!L || this.on(x, z)) return null;
    const own = L.content?.water?.(x, z);
    if (own) return own;
    const floor = L.land.ground(x, z);
    return floor < WATER + 1.35 && floor < CURB - 0.01 ? { floor, surface: WATER } : null;
  }

  /** On foot on an island (off its decks): deep water, or what its content says stands there (a wall, a trunk on the slopes). */
  blocked(x: number, z: number) {
    if ((this.sea(x, z)?.floor ?? 0) < -1.2) return true;
    const L = this.isleAt(x, z);
    return !!L?.content?.blocked?.(x, z);
  }

  /** The traffic of every island, as boxes. */
  *boxes() {
    for (const L of this.live) yield* L.traffic.boxes();
  }

  /** A car out of an island's traffic (knocked out of it, or taken). */
  take(ref: unknown) {
    for (const L of this.live) if (L.traffic.owns(ref)) return L.traffic.take(ref);
    return null;
  }

  set blockers(f: () => { x: number; z: number; wait?: boolean }[]) {
    for (const L of this.live) L.traffic.blockers = f;
  }

  /** A horn from an island's car held by you. */
  set onHorn(f: ((x: number, z: number, long: boolean) => void) | null) {
    for (const L of this.live) L.traffic.onHorn = f;
  }

  /** The traffic's groups (they move: left out of the game's solid shape). */
  movers(): THREE.Object3D[] {
    return this.live.map((L) => L.traffic.group);
  }

  /** The place's name at (x, z) for the game's street line: a crossing, a landmark, the beach. */
  name(x: number, z: number): string | null {
    const o = this.on(x, z);
    if (o) return o.L.isle.crossing.name;
    const L = this.isleAt(x, z);
    if (!L) return null;
    for (const p of L.content?.places ?? []) if (inBox(p.box, x, z)) return p.name;
    return null;
  }

  update(dt: number, focus: THREE.Vector3) {
    deckNight(this.night());
    const lit = this.night() > 0.5;
    if (lit !== this.glowOn) {
      this.glowOn = lit;
      for (const o of this.glows) o.visible = lit;
    }
    brooklynNight(this.night());
    for (const L of this.live) {
      const b = L.isle.box;
      const d = Math.hypot(Math.max(b.x0 - focus.x, 0, focus.x - b.x1), Math.max(b.z0 - focus.z, 0, focus.z - b.z1));
      L.near.visible = d < NEAR_R;
      // the traffic only while it can be seen (from the crossing's city end or nearer)
      const c = L.course.box;
      const dc = Math.hypot(Math.max(c.x0 - focus.x, 0, focus.x - c.x1), Math.max(c.z0 - focus.z, 0, focus.z - c.z1));
      L.traffic.group.visible = Math.min(d, dc) < 600;
      if (L.traffic.group.visible) L.traffic.update(dt);
      if (d < 700) L.content?.update?.(dt, this.night());
    }
  }
}
