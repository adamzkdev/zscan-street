import * as THREE from "three";
import { makeScene } from "../kit";
import type { Interior, InteriorContext } from "../types";
import { atrium } from "./atrium";
import { ArabKit, BACK, LEVELS } from "./kit";
import { mahara } from "./mahara";
import { bedroom, salon } from "./suite";
import { helipad } from "./helipad";

/**
 * BURJ AL ZEC, the sail hotel off the Palm: the Gold Atrium with its dancing fountain and
 * aquariums, Al Mahara (the restaurant round a great aquarium), the duplex Royal Suite (salon and
 * bedroom, joined by the spiral staircase) and the helipad up top, with its tennis court and golf
 * tee, the whole city and the bay around. Only the floor you are on is drawn, lit and animated.
 */
export function buildArab(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#07060c");
  scene.environmentIntensity = 0.3;
  scene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight) o.intensity = 0.5;
  });
  const k = new ArabKit(ctx, scene);
  atrium(k);
  mahara(k);
  salon(k);
  bedroom(k);
  helipad(k);
  k.flush();
  k.padLights();

  let current = 0;
  let takenAt = 0,
    stale = false;
  const view = (n: number) => {
    const v = LEVELS[n].view;
    const bg = v != null ? ctx.cityView("arab", v, BACK) : null;
    scene.background = bg ?? new THREE.Color(n === 1 ? "#02101c" : "#07060c");
    takenAt = performance.now();
    stale = v != null && takenAt < 45_000;
  };
  const setFloor = (n: number) => {
    current = n;
    k.groups.forEach((g, i) => (g.visible = i === n));
    view(n);
    k.enter(n);
  };
  setFloor(0);

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) if (k.picks.has(x)) return x;
    return null;
  };
  return {
    key: "arab",
    title: "BURJ AL ZEC",
    scene,
    floors: LEVELS.map((l) => ({ label: l.label, name: l.name, y: l.y, spawn: new THREE.Vector3(l.spawn[0], l.y, l.spawn[1]), yaw: l.yaw })),
    colliders: (f) => k.rects[f],
    setFloor,
    setTheme: () => {
      view(current);
      stale = true;
    },
    groundAt: (f, x, z) => {
      for (const fn of k.grounds[f]) {
        const y = fn(x, z);
        if (y != null) return y;
      }
      return null;
    },
    pickables: () => k.pickables.filter((o) => k.floorOf.get(o) === k.current),
    pick: (hit) => {
      const o = find(hit.object);
      return o ? (k.picks.get(o)!() ?? null) : null;
    },
    hover: (hit) => {
      const o = find(hit.object);
      return o ? (k.hovers.get(o) ?? null) : null;
    },
    update(dt, t, camera) {
      camera.getWorldPosition(k.eye);
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of k.people[k.current]) s.update(dt, t, camQuat, camRight);
      for (const tick of k.ticks[k.current]) tick(dt, t);
      if (stale && performance.now() - takenAt > 61_000) view(current);
    },
  };
}
