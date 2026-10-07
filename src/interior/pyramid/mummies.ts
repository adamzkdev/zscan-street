import * as THREE from "three";
import { loadArt, Snark } from "../../scene/snark";
import { GRID } from "../../scene/sprites";
import { Router } from "../path";
import type { Rect } from "../types";
import type { PyramidKit } from "./kit";

/**
 * The labyrinth's mummies: zkSNARKs wrapped in linen (each one's own portrait, bandaged, its eyes
 * glowing through a slit) who shuffle from cell to cell. Each sees ahead of it (a cone, a range,
 * walls in the way: a ray against the maze's colliders) and hears you when you are very close.
 * Once one sees you its eyes flare, it moans, the music turns to the chase and it runs after you
 * (A* round the walls, interior/path.ts), slower than you walk: dead ends are the danger. Lose it
 * for a few seconds (or climb out of the maze: they never leave its floor) and it gives up, goes to
 * where it saw you last, looks round and wanders off; the music settles. If one catches you: the
 * screen shakes, goes black, "The pharaoh's curse… try again", and you are back at the labyrinth's
 * door, the mummies back in their dead ends.
 */

const BODY = 1.75;
const PX = BODY / GRID;
const RANGE = 10;
const CONE = Math.cos((58 * Math.PI) / 180);
const HEAR = 2.2;
const LOSE_AFTER = 4.5;
const SPEED = { patrol: 0.75, chase: 2.55, search: 1.5 };
const CATCH = 0.8;

type State = "patrol" | "pause" | "alert" | "chase" | "search" | "look";

interface Mummy {
  s: Snark;
  home: THREE.Vector3;
  state: State;
  /** Seconds in the current state. */
  t: number;
  /** How long it has gone without seeing you (chasing). */
  unseen: number;
  last: THREE.Vector3;
  gaze: THREE.Vector3;
  prev: THREE.Vector3;
  repath: number;
  eyes: THREE.MeshBasicMaterial;
  halo: THREE.Sprite;
  flare: number;
  moan: number;
  step: number;
  wait: number;
  /** Held still, looking one way (tests). */
  hold: boolean;
}

export interface MummyHost {
  /** Maze cell centres (where they wander). */
  cells: [number, number][];
  /** Where they sleep. */
  homes: [number, number][];
  /** Where you come back after being caught (and look toward −z). */
  respawn: THREE.Vector3;
  /** Can a mummy stand here (the maze, the entrance gallery, the exit chamber; no stairs)? */
  walkable(x: number, z: number): boolean;
  /** Is the walker on the mummies' level? */
  onLevel(cam: THREE.Camera): boolean;
}

const emit = (name: string, arg?: unknown) => window.dispatchEvent(new CustomEvent("zstreet:sound", { detail: { name, arg } }));

/** A zkSNARK's portrait wrapped in linen: its silhouette kept, bandages over it, an eye slit. */
async function wrapped(id: number, eyes: string) {
  const C = 520,
    cell = C / GRID;
  const mask: boolean[][] = Array.from({ length: GRID }, () => Array<boolean>(GRID).fill(false));
  try {
    const art = await loadArt(id);
    const img = art.texture.image as HTMLCanvasElement;
    const c = document.createElement("canvas");
    c.width = c.height = C;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, C, C);
    const d = g.getImageData(0, 0, C, C).data;
    for (let r = 0; r < GRID; r++) for (let q = 0; q < GRID; q++) mask[r][q] = d[(Math.floor((r + 0.5) * cell) * C + Math.floor((q + 0.5) * cell)) * 4 + 3] > 0;
  } catch {
    /* no portrait: a plain bust */
  }
  if (mask.flat().filter(Boolean).length < 60)
    for (let r = 0; r < GRID; r++)
      for (let q = 0; q < GRID; q++) {
        const head = r >= 5 && r <= 19 && Math.hypot((q - 15) / 6.5, (r - 12) / 7.5) <= 1;
        const body = r >= 18 && q >= 7 && q <= 23;
        const trail = q < 8 && r > 6 && Math.sin(r * 12.9 + q * 78.2) > 0.55;
        mask[r][q] = head || body || trail;
      }
  // the head: the row a third of the way down the bust, its middle
  let top = GRID;
  for (let r = 0; r < GRID && top === GRID; r++) for (let q = 10; q < GRID; q++) if (mask[r][q]) top = r;
  const er = Math.min(GRID - 6, top + Math.round((GRID - top) * 0.36));
  let sum = 0,
    n = 0;
  for (let q = 8; q < GRID; q++) if (mask[er][q]) (sum += q), n++;
  const hc = n ? Math.round(sum / n) : 15;
  const c = document.createElement("canvas");
  c.width = c.height = C;
  const g = c.getContext("2d")!;
  const linen = ["#ddd0ac", "#cfc29c", "#e6dbbd", "#c4b48c", "#d6c8a0"];
  const h = (a: number, b: number) => {
    const x = Math.sin(a * 127.1 + b * 311.7 + id * 0.013) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let r = 0; r < GRID; r++)
    for (let q = 0; q < GRID; q++) {
      if (!mask[r][q]) continue;
      let col = linen[Math.floor(h(r, q) * linen.length)];
      // wraps: darker bands spiralling round, a few stains
      if ((r * 2 + q) % 7 === 0 || (r + Math.floor(q / 3)) % 5 === 0) col = "#a39270";
      if (h(q, r) < 0.06) col = "#8c7a56";
      g.fillStyle = col;
      g.fillRect(q * cell, r * cell, cell, cell);
    }
  // the eye slit, the eyes in it
  for (let q = hc - 4; q <= hc + 4; q++) if (mask[er]?.[q]) (g.fillStyle = "#1a120a"), g.fillRect(q * cell, er * cell, cell, cell);
  const eyeCells: [number, number][] = [
    [er, hc - 2],
    [er, hc + 2],
  ];
  g.fillStyle = eyes;
  for (const [r, q] of eyeCells) g.fillRect(q * cell, r * cell, cell, cell);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return { art: { texture, cloth: "#b8a880", skin: "#cbbd96" }, eyeCells };
}

export function mummies(k: PyramidKit, host: MummyHost, ids: number[]) {
  const f = 0;
  // their own router: the labyrinth floor's walls only (the other levels are far away)
  const router = new Router(k.rects[f].slice());
  const walls: Rect[] = k.rects[f];
  const list: Mummy[] = [];
  const eyeColor = new THREE.Color(0.7, 2.4, 0.5);
  let chasing = false;
  let grace = 3;
  let caught = -1;
  const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);

  ids.forEach(async (id, i) => {
    const home = host.homes[i % host.homes.length];
    if (!home) return;
    const { art, eyeCells } = await wrapped(id, "#b4ff6a");
    const s = new Snark(id, art);
    s.state = "resident";
    s.role = "Mummy";
    s.noClip = true;
    s.router = router;
    s.root.position.set(home[0], 0, home[1]);
    // glowing eyes (on the bust, so they bob with it) and a halo that flares when it sees you
    const eyes = new THREE.MeshBasicMaterial({ color: eyeColor.clone(), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const eg = new THREE.PlaneGeometry(PX * 1.05, PX * 1.05);
    for (const [r, q] of eyeCells) {
      const e = new THREE.Mesh(eg, eyes);
      e.position.set((q + 0.5 - GRID / 2) * PX, BODY / 2 - (r + 0.5) * PX, 0.01);
      e.raycast = () => {};
      s.body.add(e);
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: k.halo, color: new THREE.Color(0.6, 1.8, 0.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    const [er, ec] = eyeCells[0];
    halo.position.set((ec + 2.5 - GRID / 2) * PX, BODY / 2 - (er + 0.5) * PX, 0.02);
    halo.raycast = () => {};
    s.body.add(halo);
    k.groups[f].add(s.root);
    k.people[f].push(s);
    list.push({ s, home: V(home[0], home[1]), state: "pause", t: 0, unseen: 0, last: new THREE.Vector3(), gaze: V(0, -1).normalize(), prev: s.root.position.clone(), repath: 0, eyes, halo, flare: 0, moan: 2 + Math.random() * 6, step: 0, wait: 1 + i, hold: false });
  });

  // ---- the curse: a black veil and its line
  const veil = document.createElement("div");
  veil.style.cssText = "position:fixed;inset:0;z-index:29;pointer-events:none;background:radial-gradient(ellipse at center, rgba(20,6,2,.92), #000 75%);opacity:0;transition:opacity .45s;display:flex;align-items:center;justify-content:center";
  const line = document.createElement("div");
  line.style.cssText = "font:700 22px 'JetBrains Mono',Menlo,monospace;color:#f4b728;letter-spacing:.06em;text-shadow:0 0 18px rgba(244,183,40,.6);opacity:0;transition:opacity .5s .2s";
  line.textContent = "The pharaoh's curse… try again";
  veil.appendChild(line);
  document.body.appendChild(veil);
  let veilSeen = 0;
  setInterval(() => {
    if (performance.now() - veilSeen > 400 && veil.style.opacity !== "0") {
      veil.style.opacity = "0";
      line.style.opacity = "0";
    }
  }, 250);

  const ray = (ax: number, az: number, bx: number, bz: number) => {
    // does the segment a→b cross a wall? (slab test against every collider, slightly shrunk)
    const dx = bx - ax,
      dz = bz - az;
    for (const [x0, z0, x1, z1] of walls) {
      if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(az, bz) < z0 || Math.min(az, bz) > z1) continue;
      let t0 = 0,
        t1 = 1;
      const e = 0.02;
      if (Math.abs(dx) < 1e-9) {
        if (ax <= x0 + e || ax >= x1 - e) continue;
      } else {
        let a = (x0 + e - ax) / dx,
          b = (x1 - e - ax) / dx;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
      }
      if (Math.abs(dz) < 1e-9) {
        if (az <= z0 + e || az >= z1 - e) continue;
      } else {
        let a = (z0 + e - az) / dz,
          b = (z1 - e - az) / dz;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
      }
      if (t0 < t1) return true;
    }
    return false;
  };

  const tmp = new THREE.Vector3();
  const right = new THREE.Vector3();
  const sees = (m: Mummy, p: THREE.Vector3, d: number) => {
    if (d > RANGE) return false;
    tmp.set(p.x - m.s.root.position.x, 0, p.z - m.s.root.position.z).normalize();
    if (d > HEAR && tmp.dot(m.gaze) < CONE) return false;
    return !ray(m.s.root.position.x, m.s.root.position.z, p.x, p.z);
  };
  const go = (m: Mummy, to: THREE.Vector3, speed: number) => {
    void m.s.walk([to.clone().setY(0)], speed);
  };
  const wander = (m: Mummy) => {
    // a cell a few steps away, never the one it stands in
    const p = m.s.root.position;
    const near = host.cells.filter(([x, z]) => {
      const d = Math.hypot(x - p.x, z - p.z);
      return d > 2 && d < 9;
    });
    const [x, z] = near[Math.floor(Math.random() * near.length)] ?? host.cells[Math.floor(Math.random() * host.cells.length)];
    m.state = "patrol";
    m.t = 0;
    m.hold = false;
    go(m, V(x, z), SPEED.patrol);
  };
  const sound = (m: Mummy, cam: THREE.Camera, name: string, extra: Record<string, unknown> = {}) => {
    const d = m.s.root.position.distanceTo(tmp.set(cam.position.x, 0, cam.position.z));
    const vol = Math.max(0, 1 - d / 16);
    if (vol <= 0.02) return;
    const dir = tmp.set(m.s.root.position.x - cam.position.x, 0, m.s.root.position.z - cam.position.z).normalize();
    emit(name, { vol, pan: Math.max(-0.9, Math.min(0.9, dir.dot(right))), ...extra });
  };
  const setChase = (on: boolean) => {
    if (on === chasing) return;
    chasing = on;
    emit("chase", on);
  };
  const reset = () => {
    for (const m of list) {
      m.s.root.position.copy(m.home);
      m.prev.copy(m.home);
      void m.s.walk([m.home.clone()], 1);
      m.state = "pause";
      m.t = 0;
      m.wait = 2 + Math.random() * 3;
      m.flare = 0;
      m.unseen = 0;
      m.hold = false;
    }
    grace = 4;
    setChase(false);
  };

  let losTick = 0;
  const update = (dt: number, t: number, cam: THREE.Camera) => {
    veilSeen = performance.now();
    right.set(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize();
    const p = cam.position;
    const here = host.onLevel(cam);
    const reach = here && host.walkable(p.x, p.z);
    grace = Math.max(0, grace - dt);
    losTick -= dt;
    const look = losTick <= 0;
    if (look) losTick = 1 / 15;

    // caught: shake, black, back to the door
    if (caught >= 0) {
      caught += dt;
      if (caught < 0.75) {
        const k2 = 1 - caught / 0.75;
        p.y += (Math.random() - 0.5) * 0.22 * k2;
        cam.rotation.z += (Math.random() - 0.5) * 0.08 * k2;
      }
      if (caught > 0.75 && caught - dt <= 0.75) {
        p.x = host.respawn.x;
        p.z = host.respawn.z;
        reset();
      }
      if (caught > 2.6) {
        caught = -1;
        veil.style.opacity = "0";
        line.style.opacity = "0";
      }
    }

    for (const m of list) {
      const pos = m.s.root.position;
      m.t += dt;
      // where it looks: where it goes (or a slow look round when standing)
      tmp.subVectors(pos, m.prev).setY(0);
      const moved = tmp.length();
      if (moved > 1e-4) m.gaze.lerp(tmp.divideScalar(moved), Math.min(1, dt * 8)).normalize();
      else if ((m.state === "pause" || m.state === "look") && !m.hold) m.gaze.applyAxisAngle(THREE.Object3D.DEFAULT_UP, Math.sin(t * 0.9 + m.home.x) * dt * 1.2);
      m.prev.copy(pos);
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);

      switch (m.state) {
        case "pause":
          if (m.t > m.wait) wander(m);
          break;
        case "patrol":
          if (!m.s.isWalking) {
            m.state = "pause";
            m.t = 0;
            m.wait = 1 + Math.random() * 2.5;
          }
          break;
        case "alert":
          // a beat to turn and stare before it runs
          if (m.t > 0.55) {
            m.state = "chase";
            m.t = 0;
            m.repath = 0;
          }
          break;
        case "chase": {
          const visible = reach && sees(m, p, d);
          if (visible) {
            m.unseen = 0;
            m.last.set(p.x, 0, p.z);
          } else m.unseen += dt * (reach ? 1 : 1.5);
          m.repath -= dt;
          if (m.repath <= 0) {
            m.repath = 0.35;
            go(m, reach && m.unseen < 1.2 ? tmp.set(p.x, 0, p.z) : m.last, SPEED.chase);
          }
          if (reach && caught < 0 && d < CATCH) {
            caught = 0;
            emit("caught");
            veil.style.opacity = "1";
            line.style.opacity = "1";
            for (const o of list) if (o.state === "chase" || o.state === "alert") (o.state = "look"), (o.t = 0);
          } else if (m.unseen > LOSE_AFTER) {
            m.state = "search";
            m.t = 0;
            go(m, m.last, SPEED.search);
          }
          break;
        }
        case "search":
          if (!m.s.isWalking || m.t > 8) {
            m.state = "look";
            m.t = 0;
          }
          break;
        case "look":
          if (m.t > 2.5) wander(m);
          break;
      }
      // seeing you (not while it is already after you, not in the first seconds after a respawn)
      if (look && reach && grace <= 0 && caught < 0 && m.state !== "chase" && m.state !== "alert" && sees(m, p, d)) {
        m.state = "alert";
        m.hold = false;
        m.t = 0;
        m.flare = 1;
        m.unseen = 0;
        m.last.set(p.x, 0, p.z);
        void m.s.walk([pos.clone()], 1);
        if (!chasing) emit("spotted");
        sound(m, cam, "mummy-moan", { angry: true });
        m.s.say(Math.random() < 0.5 ? "Hrrrnngh!" : "Mmmhhhh!", 1.6);
        setChase(true);
      }
      // the eyes: a steady glow, a flare when it sees you, a pulse while it runs
      const hunting = m.state === "chase" || m.state === "alert";
      m.flare = hunting ? Math.max(m.flare - dt * 0.8, 0.55 + Math.sin(t * 9) * 0.15) : Math.max(0, m.flare - dt * 0.6);
      m.eyes.color.copy(eyeColor).multiplyScalar(1 + m.flare * 2.2);
      m.halo.material.opacity = 0.18 + m.flare * 0.75;
      m.halo.scale.setScalar(0.35 + m.flare * 0.9);
      // its sounds: the dragged foot, a moan now and then (angrier on the hunt)
      if (m.s.isWalking) {
        m.step -= dt;
        if (m.step <= 0) {
          m.step = hunting ? 0.3 : 0.62;
          if (d < 11) sound(m, cam, "mummy-step");
        }
      }
      m.moan -= dt;
      if (m.moan <= 0) {
        m.moan = hunting ? 2.2 + Math.random() * 1.8 : 7 + Math.random() * 9;
        if (d < 16) sound(m, cam, "mummy-moan", { angry: hunting });
      }
    }
    // the music settles once nobody is after you
    if (chasing && !list.some((m) => m.state === "chase" || m.state === "alert")) setChase(false);
    // gone up or down the stairs: they lose you at once
    if (!here && chasing) for (const m of list) if (m.state === "chase" || m.state === "alert") m.unseen = Math.max(m.unseen, LOSE_AFTER - 1);
  };

  return {
    update,
    reset,
    /** For tests: the state of each mummy, the chase, the curse. */
    debug: () => ({
      chasing,
      caught,
      grace,
      list: list.map((m) => ({ id: m.s.id, state: m.state, x: +m.s.root.position.x.toFixed(2), z: +m.s.root.position.z.toFixed(2), unseen: +m.unseen.toFixed(2), flare: +m.flare.toFixed(2) })),
    }),
    /** For tests: put mummy `i` at (x, z), looking along (gx, gz). */
    put(i: number, x: number, z: number, gx = 0, gz = 1) {
      const m = list[i];
      if (!m) return;
      m.s.root.position.set(x, 0, z);
      m.prev.copy(m.s.root.position);
      void m.s.walk([m.s.root.position.clone()], 1);
      m.gaze.set(gx, 0, gz).normalize();
      m.state = "pause";
      m.t = 0;
      m.wait = 30;
      m.hold = true;
    },
    set grace(v: number) {
      grace = v;
    },
    get count() {
      return list.length;
    },
  };
}
