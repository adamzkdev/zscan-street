import * as THREE from "three";
import { makeScene } from "../kit";
import type { Interior, InteriorContext } from "../types";
import { chamber } from "./chamber";
import { gallery, rampY } from "./gallery";
import { FLOORS, PyramidKit } from "./kit";
import { labyrinth, type Game } from "./labyrinth";

/**
 * GREAT PYRAMID: inside, a game. Level 0 is the descending passage, the entrance gallery and a
 * seeded torchlit LABYRINTH with five golden ⓩ coins to find (a counter shows how many), mummies
 * and pressure-plate traps; its far side climbs to level 1, the GRAND GALLERY, a real ramp under
 * seven corbels; at its top the low passage leads to level 2, the KING'S CHAMBER, where the
 * golden chest holds the genesis block (block 0, live from the API).
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

  labyrinth(k, 0x5a7a, game);
  gallery(k);
  chamber(k, game);

  // ---- three real lights for every level: a lantern carried, the two nearest torches
  const lantern = new THREE.PointLight("#ffb46a", 3.2, 8, 1.6);
  const near = [new THREE.PointLight("#ff9c48", 0, 9, 1.6), new THREE.PointLight("#ff9c48", 0, 9, 1.6)];
  scene.add(lantern, ...near);
  const assigned: (THREE.Vector3 | null)[] = [null, null];
  const fade = [0, 0];

  const setFloor = (n: number) => {
    k.current = n;
    k.groups.forEach((g, i) => (g.visible = i === n));
    assigned[0] = assigned[1] = null;
  };
  setFloor(0);

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
      spawn: i === 0 ? new THREE.Vector3(0, 0, -1.5) : i === 1 ? new THREE.Vector3(0, l.y, -0.6) : new THREE.Vector3(0, l.y, 2.6),
      yaw: 0,
    })),
    colliders: (f) => k.rects[f],
    setFloor,
    pickables: () => k.pickables.filter((o) => k.floorOf.get(o) === k.current),
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
      const f = k.current;
      // the Grand Gallery is a ramp: the eye follows it
      if (f === 1) camera.position.y = FLOORS[1].y + rampY(camera.position.z) + 0.12 + 1.6;
      if (f === 2) camera.position.y = Math.max(camera.position.y, FLOORS[2].y + 1.6);
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of k.people[f]) s.update(dt, t, camQuat, camRight);
      for (const tick of k.ticks[f]) tick(dt, t, camera);

      const p = camera.position;
      lantern.position.set(p.x, p.y + 0.2, p.z);
      lantern.intensity = 3.0 + Math.sin(t * 9) * 0.25 + Math.sin(t * 23) * 0.15;
      // the two torches nearest you light the walls for real (they fade in when they change)
      reassign -= dt;
      if (reassign <= 0) {
        reassign = 0.25;
        const list = k.lightsOf(f)
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
