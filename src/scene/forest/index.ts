import * as THREE from "three";
import type { City } from "../city";
import type { Director } from "../director";
import { loadArt, Snark } from "../snark";
import { waterTexture } from "../textures";
import { creekWater, groundMesh } from "./ground";
import { BOARDWALKS, BX, creekAt, F, fbm, goldAt, Land, lineDist, rnd, shoreZ, SITES, smooth, trailDist, TRAILS, WATER } from "./land";
import { Wildlife } from "./life";
import { buildProps, type Built } from "./props";
import { KINDS, Stand, WIND, type Instance, type Species } from "./trees";

/**
 * Shielded Woods: the headland across the Golden Gate, a redwood forest you can walk into off the
 * bridge. Ground, creek and falls, the trees (instanced, near/far), the trails with their
 * boardwalks, Viewing Key Point, the ranger cabin, the campfire with zkSNARK hikers talking round it,
 * deer, birds, fog, fireflies. `groundAt`/`blocked` are what the walker on foot needs.
 */

const TALK: [string, string][] = [
  ["These redwoods are older than Bitcoin.", "Older than the internet."],
  ["No signal out here.", "Perfect. Nothing to leak."],
  ["Marshmallow?", "Shielded, please."],
  ["Saw two deer by the creek.", "They never look at the city."],
  ["The Genesis Tree is enormous.", "Block zero of the forest."],
  ["Fog's rolling in.", "Like a shielded pool."],
  ["Who's on first watch?", "Me. I'll keep the fire going."],
  ["Hear that owl?", "That was a raven."],
  ["My boots are soaked.", "The boardwalk is there for a reason."],
  ["Viewing Key Point at sunrise tomorrow?", "Only if you make the coffee."],
  ["How far to Sprout Falls?", "Ten minutes up the gorge."],
  ["You can see the bridge lights from here.", "And the Needle behind them."],
];
const RANGER = ["Stay on the trails, please.", "Fire's allowed in the ring only.", "Deer have right of way.", "Trail map's at the gate."];

export class Forest {
  readonly group = new THREE.Group();
  readonly land: Land;
  private stands: Stand[] = [];
  private props: Built;
  private life: Wildlife;
  private water: THREE.Texture;
  /** Solid things to walk round, bucketed by 4 m cells. */
  private cells = new Map<number, [number, number, number][]>();
  private rects: [number, number, number, number][] = [];
  private lastSplit = -1;
  private splitAt = new THREE.Vector3(1e9, 0, 0);
  private night: boolean | null = null;
  private hikers: Snark[] = [];
  private ranger: Snark | null = null;
  private talkAt = 4;
  private talkI = 0;
  private lamps: { pos: THREE.Vector3; color: string; intensity?: number }[] = [];
  private fireLamp: { pos: THREE.Vector3; color: string; intensity?: number } | null = null;
  private flag: THREE.Object3D | null = null;

  constructor(
    scene: THREE.Object3D,
    city: City,
    private director: Director,
    deckAt: (z: number) => number,
  ) {
    this.land = new Land(deckAt);
    const land = this.land;
    this.group.name = "forest";
    scene.add(this.group);
    this.group.add(groundMesh(land));
    this.water = waterTexture();
    this.water.wrapS = this.water.wrapT = THREE.RepeatWrapping;
    this.group.add(creekWater(land, this.water));
    this.props = buildProps(land);
    this.group.add(this.props.group);
    this.flag = this.props.group.getObjectByName("flag") ?? null;
    for (const c of this.props.circles) this.addCircle(...c);
    this.rects.push(...this.props.rects);
    this.plant();
    this.life = new Wildlife(land, this.props.fire, this.props.chimney, (x, z) => this.solid(x, z, 0.5));
    this.group.add(this.life.group);
    // real light where it matters (the city's pool of lamp lights picks the nearest)
    this.fireLamp = { pos: this.props.fire.clone().setY(this.props.fire.y + 1.2), color: "#ff8a3a", intensity: 22 };
    this.lamps.push(this.fireLamp, { pos: new THREE.Vector3(SITES.cabin.x - 2.4, this.land.raw(SITES.cabin.x, SITES.cabin.z) + 2.6, SITES.cabin.z), color: "#ffc070", intensity: 9 });
    for (const p of this.props.lanterns) this.lamps.push({ pos: p.clone(), color: "#ffb46b", intensity: 3.5 });
    city.lamps.push(...this.lamps);
    void this.people();
  }

  // ---- planting --------------------------------------------------------------------------------------
  private plant() {
    const land = this.land;
    const R = rnd(2016);
    const lists = new Map<Species, Instance[]>();
    const put = (k: Species, x: number, z: number, scale: number, sink = 0.3, tint = 0.9 + R() * 0.18) => {
      const y = land.raw(x, z) - sink * scale;
      (lists.get(k) ?? lists.set(k, []).get(k)!).push({ x, y, z, rot: R() * Math.PI * 2, scale, tint });
      const tr = KINDS[k].trunk * scale;
      if (tr > 0) this.addCircle(x, z, tr + 0.15);
    };
    const near = (x: number, z: number, s: { x: number; z: number }, r: number) => Math.hypot(x - s.x, z - s.z) < r;
    const walkD = (x: number, z: number) => Math.min(...BOARDWALKS.map((b) => lineDist(x, z, b).d));
    const clear = (x: number, z: number, r: number) => {
      if (!land.inside(x, z)) return false;
      if (land.raw(x, z) < WATER + 0.6) return false;
      if (trailDist(x, z) < r) return false;
      if (walkD(x, z) < r + 0.6) return false;
      if (creekAt(x, z).d < 1.6 + r * 0.4) return false;
      if (Math.hypot((x - SITES.plaza.x) / 7, (z - SITES.plaza.z) / 4.6) < 1.25) return false;
      if (Math.abs(x - BX) < 8.5 && z > 209 && z < 230) return false;
      if (near(x, z, SITES.camp, 8.5) || near(x, z, SITES.cabin, 8.5) || near(x, z, SITES.lookout, 6) || near(x, z, SITES.fallsDeck, 3.2) || near(x, z, SITES.genesis, 5.5)) return false;
      if (x > F.x1 - 0.8 || z > F.z1 - 0.8) return false;
      return true;
    };
    // the Genesis Tree
    put("genesis", SITES.genesis.x, SITES.genesis.z - 1, 1, 0.4, 1);
    // trees on a jittered grid
    const S = 2.55;
    for (let gz = F.z0; gz < F.z1; gz += S)
      for (let gx = F.x0; gx < F.x1; gx += S) {
        const x = gx + R() * S,
          z = gz + R() * S;
        if (!clear(x, z, 1.9)) continue;
        if (this.solid(x, z, 1.1)) continue;
        const d = z - shoreZ(x);
        const slope = land.slope(x, z);
        if (slope > 1.4) continue;
        const gold = goldAt(x, z);
        const n = fbm(x * 0.12, z * 0.12, 9);
        // the golden bluffs: open grass, coyote brush, a wind-bent oak here and there
        if (gold > 0.45 + (n - 0.5) * 0.6) {
          const r = R();
          if (r < 0.28) put("scrub", x, z, 0.8 + R() * 0.5, 0.1);
          else if (r < 0.36) put("oak", x, z, 0.6 + R() * 0.3);
          continue;
        }
        const c = creekAt(x, z).d;
        const zone = fbm(x * 0.04, z * 0.04, 21);
        const big = fbm(x * 0.06, z * 0.06, 33);
        const r = R();
        let k: Species;
        if (c < 9 && r < 0.45) k = r < 0.22 ? "alder" : "maple";
        else if (zone > 0.58) k = r < 0.55 ? "fir" : r < 0.62 ? "maple" : "redwood";
        else if (r < 0.08) k = "maple";
        else if (r < 0.13) k = "oak";
        else if (r < 0.17) k = "fir";
        else if (r < 0.19) k = "snag";
        else k = big > 0.6 ? (R() < 0.6 ? "redwoodGiant" : "redwoodTall") : big > 0.45 ? "redwoodTall" : "redwood";
        // the bluff edge stays lower so the view from the bay is a skyline, not a wall
        const sc = (0.82 + R() * 0.38) * (0.7 + 0.3 * smooth(6, 18, d));
        put(k, x, z, sc);
        // redwood family circles: sprouts round a parent
        if (k.startsWith("redwood") && R() < 0.35)
          for (let i = 0; i < 2; i++) {
            const a = R() * Math.PI * 2;
            const sx = x + Math.cos(a) * 2.2,
              sz = z + Math.sin(a) * 2.2;
            if (clear(sx, sz, 2) && !this.solid(sx, sz, 1)) put("redwood", sx, sz, sc * (0.55 + R() * 0.2));
          }
      }
    // undergrowth: sword ferns in the shade, huckleberry and salmonberry, toadstools, boulders
    const U = 1.45;
    for (let gz = F.z0; gz < F.z1; gz += U)
      for (let gx = F.x0; gx < F.x1; gx += U) {
        const x = gx + R() * U,
          z = gz + R() * U;
        if (!land.inside(x, z) || land.raw(x, z) < WATER + 0.5) continue;
        const td = trailDist(x, z);
        const c = creekAt(x, z).d;
        if (td < 1.1 || c < 1.3 || walkD(x, z) < 1.1) continue;
        if (Math.hypot((x - SITES.plaza.x) / 7, (z - SITES.plaza.z) / 4.6) < 1.1) continue;
        if (Math.abs(x - BX) < 7.5 && z > 211 && z < 229.5) continue;
        if (near(x, z, SITES.camp, 4.2) || near(x, z, SITES.cabin, 5.5) || near(x, z, SITES.lookout, 3.6)) continue;
        if (x > F.x1 - 0.5 || z > F.z1 - 0.5) continue;
        const gold = goldAt(x, z);
        if (gold > 0.5) continue;
        const slope = land.slope(x, z);
        const r = R();
        if ((slope > 0.9 && r < 0.12) || (c < 3.2 && r < 0.2)) put(R() < 0.5 ? "rock" : "rock2", x, z, 0.6 + R() * 0.7, 0.35);
        else if (r < (c < 8 ? 0.5 : 0.36)) put(R() < 0.6 ? "fern" : "fern2", x, z, 0.8 + R() * 0.5, 0.05);
        else if (r < 0.46) put(R() < 0.5 ? "shrub" : "shrub2", x, z, 0.7 + R() * 0.5, 0.1);
        else if (r < 0.475 && td > 2) put("shroom", x, z, 0.8 + R() * 0.5, 0);
      }
    // fallen giants
    for (let i = 0, n = 0; i < 400 && n < 16; i++) {
      const x = F.x0 + 6 + R() * (F.x1 - F.x0 - 10),
        z = F.z0 + R() * (F.z1 - F.z0);
      if (!clear(x, z, 3.2) || land.slope(x, z) > 0.5) continue;
      put("log", x, z, 0.9 + R() * 0.5, 0.15);
      n++;
    }
    const sphere = new THREE.Sphere(new THREE.Vector3((F.x0 + F.x1) / 2, 12, (F.z0 + F.z1) / 2), 95);
    for (const [k, list] of lists) {
      const s = new Stand(k, list, sphere);
      this.stands.push(s);
      this.group.add(s.near);
      if (s.far) this.group.add(s.far);
    }
    if (new URLSearchParams(location.search).has("debug")) console.log("forest", [...lists].map(([k, l]) => `${k}:${l.length}`).join(" "));
  }

  // ---- collisions ----------------------------------------------------------------------------------------
  private key = (i: number, j: number) => i * 4096 + j;
  private addCircle(x: number, z: number, r: number) {
    const k = this.key(Math.floor(x / 4), Math.floor(z / 4));
    (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push([x, z, r]);
  }
  /** Is there a trunk, a rock, a post (or a building) within `pad` of (x, z)? */
  private solid(x: number, z: number, pad: number) {
    const i = Math.floor(x / 4),
      j = Math.floor(z / 4);
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const c = this.cells.get(this.key(i + di, j + dj));
        if (c) for (const [cx, cz, r] of c) if ((x - cx) ** 2 + (z - cz) ** 2 < (r + pad) ** 2) return true;
      }
    for (const [x0, z0, x1, z1] of this.rects) if (x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad) return true;
    return false;
  }

  /** On foot: is (x, z) the forest's to say? */
  owns(x: number, z: number) {
    return this.land.inside(x, z) && !(Math.abs(x - BX) < 5.6 && z < 226);
  }

  /** On foot: the floor under (x, z) (ground, boardwalk, deck), or null outside the forest. */
  groundAt(x: number, z: number) {
    return this.owns(x, z) ? this.land.floor(x, z) : null;
  }

  /** On foot: can't go there (water, a cliff, a trunk, the cabin, the tunnel). */
  blocked(x: number, z: number) {
    const L = this.land;
    const onBoards = L.walkAt(x, z) !== null || L.decks.some((d) => x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1);
    if (onBoards) return false;
    const h = L.raw(x, z);
    if (h < WATER + 0.35) return true;
    // the tunnel mouth and the road's cutting
    if (Math.abs(x - BX) < 7.4 && z > 227.4) return true;
    // the creek itself (cross on the boardwalks)
    const c = creekAt(x, z);
    if (c.d < 0.9 && c.bed > WATER) return true;
    if (L.slope(x, z) > 1.5 && trailDist(x, z) > 1.2) return true;
    return this.solid(x, z, 0.25);
  }

  // ---- the people of the woods --------------------------------------------------------------------------
  private async people() {
    const ids = [1618, 2718, 4096, 777, 3141];
    const seats = this.props.seats;
    const fire = this.props.fire;
    for (let i = 0; i < Math.min(ids.length, seats.length); i++) {
      try {
        const s = new Snark(ids[i], await loadArt(ids[i]));
        const seat = seats[i];
        this.director.adopt(s);
        s.noClip = true;
        s.role = "Hiker";
        s.root.position.set(seat.x, seat.y - 0.44, seat.z);
        s.perch(0.44);
        s.faceDir = new THREE.Vector3(fire.x - seat.x, 0, fire.z - seat.z).normalize();
        this.hikers.push(s);
      } catch {}
    }
    // two hikers out on the loop, a ranger by the flag
    for (const [id, start] of [
      [9001, 0],
      [5050, 0.5],
    ] as const) {
      try {
        const s = new Snark(id, await loadArt(id));
        this.director.adopt(s);
        s.noClip = true;
        s.role = "Hiker";
        const route = this.loop();
        const k = Math.floor(route.length * start);
        const go = (from: number) => {
          const pts = [...route.slice(from), ...route.slice(0, from)];
          void s.walk(pts, 1.15).then(() => go(0));
        };
        s.root.position.copy(route[k]);
        go(k);
      } catch {}
    }
    try {
      const s = new Snark(1111, await loadArt(1111));
      this.director.adopt(s);
      s.noClip = true;
      s.role = "Park ranger";
      const x = SITES.cabin.x - 6.2,
        z = SITES.cabin.z - 3;
      s.root.position.set(x, this.land.raw(x, z), z);
      s.faceDir = new THREE.Vector3(-1, 0, 0);
      this.ranger = s;
    } catch {}
  }

  /** The east loop as a list of footsteps a metre apart, heights from the ground and boardwalks. */
  private loop() {
    const T = TRAILS;
    const rev = (a: [number, number][]) => [...a].reverse();
    const legs: [number, number][][] = [T[0], rev(T[4]), rev(T[3]), rev(T[2]).slice(3), rev(T[1]), rev(T[0])];
    const out: THREE.Vector3[] = [];
    for (const leg of legs)
      for (let s = 1; s < leg.length; s++) {
        const [ax, az] = leg[s - 1],
          [bx, bz] = leg[s];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
        for (let i = 0; i < n; i++) {
          const x = ax + ((bx - ax) * i) / n,
            z = az + ((bz - az) * i) / n;
          out.push(new THREE.Vector3(x, this.land.floor(x, z), z));
        }
      }
    return out;
  }

  // ---- every frame ---------------------------------------------------------------------------------------
  update(dt: number, t: number, cam: THREE.Camera, focus: THREE.Vector3, night: boolean, walking: boolean, wide: boolean) {
    if (night !== this.night) {
      this.night = night;
      this.props.lanternMat.color.setRGB(night ? 3.2 : 0.55, night ? 2.1 : 0.4, night ? 0.9 : 0.2);
      this.props.windows.color.setRGB(night ? 2.6 : 0.16, night ? 1.8 : 0.13, night ? 0.8 : 0.1);
      this.life.setNight(night);
    }
    WIND.value = t;
    this.water.offset.y -= dt * 0.25;
    if (this.flag) this.flag.rotation.y = Math.sin(t * 1.3) * 0.25;
    if (this.fireLamp) this.fireLamp.intensity = 20 + Math.sin(t * 11) * 4 + Math.sin(t * 7.1) * 3;
    // near/far trees: around the walker, or round what the map looks at when zoomed in
    let at: THREE.Vector3 | null = null;
    let r = 0;
    const ortho = cam as THREE.OrthographicCamera;
    if (walking) {
      at = cam.position;
      r = 60;
    } else if (!wide && ortho.isOrthographicCamera && (ortho.top - ortho.bottom) / ortho.zoom < 150) {
      at = focus;
      r = 70;
    }
    const moved = at ? at.distanceTo(this.splitAt) : this.splitAt.x === 1e9 ? 0 : 1e9;
    if (t - this.lastSplit > 0.5 && (moved > 3 || (at === null) !== (this.splitAt.x === 1e9))) {
      this.lastSplit = t;
      if (at) this.splitAt.copy(at);
      else this.splitAt.set(1e9, 0, 0);
      for (const s of this.stands) s.split(at, r);
    }
    // is anyone close enough to see the small things move?
    const viewer = walking ? cam.position : focus;
    const close = viewer.x > F.x0 - 40 && viewer.z > F.z0 - 50 && (walking || !wide);
    this.life.update(dt, t, walking ? cam.position : null, close);
    // talk round the fire when someone is near enough to read it
    const dFire = Math.hypot(viewer.x - SITES.camp.x, viewer.z - SITES.camp.z);
    if (this.hikers.length > 1 && dFire < 45 && !wide) {
      this.talkAt -= dt;
      if (this.talkAt <= 0) {
        const pair = TALK[Math.floor(this.talkI / 2) % TALK.length];
        const who = this.hikers[(Math.floor(this.talkI / 2) + (this.talkI % 2)) % this.hikers.length];
        let line = pair[this.talkI % 2];
        if (this.talkI % 14 === 13 && this.director.blockHeight) line = `Block ${this.director.blockHeight.toLocaleString("en-US")} just landed.`;
        who.say(line, 3.6);
        this.talkI++;
        this.talkAt = this.talkI % 2 ? 3.2 : 6 + Math.random() * 3;
      }
      if (this.ranger && Math.random() < dt / 25) this.ranger.say(RANGER[Math.floor(Math.random() * RANGER.length)], 3.4);
    }
  }
}

