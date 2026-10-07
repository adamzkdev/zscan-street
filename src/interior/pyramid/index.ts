import * as THREE from "three";
import { makeScene } from "../kit";
import type { Interior, InteriorContext } from "../types";
import { chamber } from "./chamber";
import { gallery, rampY, ZB } from "./gallery";
import { FLOORS, PyramidKit } from "./kit";
import { ASC_LEN, labyrinth, MZ1, SUB_X, SUB_Z, type Game } from "./labyrinth";
import { mummies } from "./mummies";
import { subGround, subterranean } from "./subterranean";

/**
 * GREAT PYRAMID: inside, a game. Level 0 is the descending passage, the entrance gallery and a
 * seeded torchlit LABYRINTH with five golden ⓩ coins to find (a counter shows how many), pressure-
 * plate traps and MUMMIES that chase you when they see you (./mummies.ts); its far side climbs the
 * ascending passage to level 1, the GRAND GALLERY, a real ramp under seven corbels; at its top the
 * low passage leads to level 2, the KING'S CHAMBER, where the golden chest holds the genesis block
 * (block 0, live from the API). From the entrance gallery the descending passage goes down to
 * level −1, the SUBTERRANEAN CHAMBER and its pit.
 *
 * One continuous building, walked end to end: every level is laid out in its own stretch of the
 * plan (the gallery and the chamber beyond the maze, the subterranean chamber west of the entrance
 * gallery), so the colliders are one set and the floor height is a function of (x, z) alone; the
 * level you are on (for the lights, what is drawn, the lift's panel) follows where you stand.
 */
export function buildPyramid(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#050302");
  scene.environmentIntensity = 0.1;
  scene.traverse((o) => {
    if ((o as THREE.HemisphereLight).isHemisphereLight) {
      const h = o as THREE.HemisphereLight;
      h.color.set("#ffd8a8");
      h.groundColor.set("#2a1a10");
      h.intensity = 0.35;
    }
  });
  scene.fog = new THREE.Fog("#070403", 7, 30);
  const k = new PyramidKit(ctx, scene);

  // ---- the coin hunt, with its counter on screen while you are inside
  const counter = document.createElement("div");
  counter.style.cssText =
    "position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:30;pointer-events:none;font:700 15px 'JetBrains Mono',Menlo,monospace;color:#f4b728;background:rgba(12,8,4,.74);border:1px solid rgba(244,183,40,.45);border-radius:999px;padding:6px 16px;letter-spacing:.04em;display:none;transition:transform .25s, box-shadow .25s";
  document.body.appendChild(counter);
  const game: Game = {
    found: 0,
    total: 5,
    onFound() {
      draw();
      counter.style.transform = "translateX(-50%) scale(1.25)";
      counter.style.boxShadow = "0 0 24px rgba(244,183,40,.8)";
      setTimeout(() => {
        counter.style.transform = "translateX(-50%)";
        counter.style.boxShadow = "none";
      }, 380);
    },
  };
  const draw = () => (counter.textContent = game.found >= game.total ? `ⓩ ${game.found}/${game.total} ✓` : `ⓩ ${game.found}/${game.total}`);
  draw();
  let seenAt = 0;
  setInterval(() => {
    if (performance.now() - seenAt > 400) counter.style.display = "none";
  }, 250);

  const lab = labyrinth(k, 0x5a7a, game);
  gallery(k);
  chamber(k, game);
  subterranean(k);

  // ---- stitch the levels: the gallery's foot door (its local z 1.7) where the ascending passage
  // ends, the chamber's passage (its local z 3.8) where the gallery's top door wall ends
  const ASC_TOP = lab.asc.z - ASC_LEN;
  const GX = lab.asc.x,
    GZ = ASC_TOP - 1.7;
  const CZ = GZ + (ZB - 4.5) - 3.8;
  k.shift(1, GX, GZ);
  k.shift(2, GX, CZ);
  const MAZE_Z = MZ1;
  const HALL_Z = -20;
  /** Which level (x, z) is on. */
  const levelAt = (x: number, z: number) => {
    if (x < SUB_X && z > HALL_Z && z < -4) return 3;
    if (z < CZ + 3.8) return 2;
    if (z < ASC_TOP) return 1;
    return 0;
  };
  const groundAt = (x: number, z: number): number | null => {
    switch (levelAt(x, z)) {
      case 3:
        return subGround(x, z);
      case 2:
        return FLOORS[2].y;
      case 1: {
        const lz = z - GZ;
        return lz >= 0.8 ? FLOORS[1].y : FLOORS[1].y + rampY(lz) + 0.12;
      }
      default:
        return lab.ground(x, z) ?? 0;
    }
  };
  /** Which levels are drawn from (x, z): yours, and the next one when its doorway is near. */
  const shownFrom = (x: number, z: number): number[] => {
    const l = levelAt(x, z);
    if (l === 0) return z < MAZE_Z ? [0, 1] : x < 1 && z > HALL_Z && z < -8 ? [0, 3] : [0];
    if (l === 1) return z - GZ > -7 ? [1, 0] : z - GZ < ZB + 3 ? [1, 2] : [1];
    if (l === 2) return z - CZ > -1.5 ? [2, 1] : [2];
    return x > SUB_X - 12 ? [3, 0] : [3];
  };

  // ---- the mummies, on the labyrinth's level only
  const HX = 6;
  const tribe = mummies(
    k,
    {
      cells: lab.cells,
      homes: lab.homes,
      respawn: new THREE.Vector3(0, 0, -17.2),
      walkable: (x, z) => z < -0.8 && z > lab.asc.z + 0.15 && x > -HX + 0.3 && levelAt(x, z) === 0,
      onLevel: (cam) => levelAt(cam.position.x, cam.position.z) === 0 && cam.position.y < 3,
    },
    [1313, 666, 404],
  );
  // one set of colliders for the whole building (the traps add and remove theirs in level 0's)
  const all = k.rects[0];
  for (const f of [1, 2, 3]) all.push(...k.rects[f]);

  // ---- three real lights for every level: a lantern carried, the two nearest torches
  const lantern = new THREE.PointLight("#ffb46a", 3.2, 8, 1.6);
  const near = [new THREE.PointLight("#ff9c48", 0, 9, 1.6), new THREE.PointLight("#ff9c48", 0, 9, 1.6)];
  scene.add(lantern, ...near);
  const assigned: (THREE.Vector3 | null)[] = [null, null];
  const fade = [0, 0];

  let shown: number[] = [];
  const show = (list: number[]) => {
    if (list.length === shown.length && list.every((v, i) => v === shown[i])) return;
    shown = list;
    k.groups.forEach((g, i) => (g.visible = list.includes(i)));
  };
  const setFloor = (n: number) => {
    k.current = n;
    show([n]);
    assigned[0] = assigned[1] = null;
    tribe.reset();
  };
  setFloor(0);
  scene.userData.mummies = tribe;
  scene.userData.levelAt = levelAt;

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) if (k.picks.has(x)) return x;
    return null;
  };
  let reassign = 0;
  return {
    key: "pyramid",
    title: "GREAT PYRAMID",
    scene,
    floors: FLOORS.map((l, i) => ({
      label: l.label,
      name: l.name,
      y: l.y,
      spawn: [new THREE.Vector3(0, 0, -1.5), new THREE.Vector3(GX, l.y, GZ - 0.6), new THREE.Vector3(GX, l.y, CZ + 2.6), new THREE.Vector3(SUB_X - 16.5, l.y, SUB_Z)][i],
      yaw: i === 3 ? Math.PI / 2 : 0,
    })),
    colliders: () => all,
    groundAt: (_f, x, z) => groundAt(x, z),
    floorNow: () => k.current,
    setFloor,
    pickables: () => k.pickables.filter((o) => shown.includes(k.floorOf.get(o) ?? -1)),
    pick: (hit) => {
      const o = find(hit.object);
      return o ? (k.picks.get(o)!(hit) ?? null) : null;
    },
    hover: (hit) => {
      const o = find(hit.object);
      return o ? (k.hovers.get(o) ?? null) : null;
    },
    update(dt, t, camera) {
      seenAt = performance.now();
      if (counter.style.display === "none") counter.style.display = "block";
      const p = camera.position;
      // the level follows where you stand; the next one is drawn when its doorway is near
      const f = levelAt(p.x, p.z);
      if (f !== k.current) {
        k.current = f;
        assigned[0] = assigned[1] = null;
      }
      show(shownFrom(p.x, p.z));
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const n of shown) {
        for (const s of k.people[n]) s.update(dt, t, camQuat, camRight);
        for (const tick of k.ticks[n]) tick(dt, t, camera);
      }
      tribe.update(dt, t, camera);

      lantern.position.set(p.x, p.y + 0.2, p.z);
      lantern.intensity = 3.0 + Math.sin(t * 9) * 0.25 + Math.sin(t * 23) * 0.15;
      // the two torches nearest you light the walls for real (they fade in when they change)
      reassign -= dt;
      if (reassign <= 0) {
        reassign = 0.25;
        const list = shown
          .flatMap((n) => k.lightsOf(n))
          .map((l) => ({ l, d: l.p.distanceToSquared(p) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 2)
          .map((x) => x.l.p);
        for (let i = 0; i < 2; i++) {
          if (assigned[i] && list.includes(assigned[i]!)) continue;
          const free = list.find((q) => q !== assigned[1 - i]) ?? null;
          assigned[i] = free;
          fade[i] = 0;
          if (free) near[i].position.copy(free);
        }
      }
      for (let i = 0; i < 2; i++) {
        fade[i] = Math.min(1, fade[i] + dt * 3);
        near[i].intensity = assigned[i] ? (3.6 + Math.sin(t * 12 + i * 2) * 0.5 + Math.sin(t * 29 + i) * 0.35) * fade[i] : 0;
      }
    },
  };
}
