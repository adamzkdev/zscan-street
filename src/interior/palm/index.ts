import * as THREE from "three";
import { makeScene } from "../kit";
import type { Interior, InteriorContext } from "../types";
import { beach } from "./beach";
import { crescent } from "./crescent";
import { BACK, LEVELS, PalmKit } from "./kit";
import { cityDome } from "./props";
import { villa } from "./villa";

/**
 * THE PALM, walk-in: a frond's private beach (villas, loungers, the beach bar, jet skis on the
 * lagoon), a villa on it (living room, kitchen, the pool terrace looking at the Burj Al ZEC and the
 * skyline), the crescent's boardwalk at sunset towards the Atlantis arch under the monorail, and
 * the marina with its yachts. Only the zone you are in is drawn, lit and animated.
 */
export function buildPalm(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#8fc4e8");
  scene.environmentIntensity = 0.45;
  const k = new PalmKit(ctx, scene);
  beach(k);
  villa(k);
  crescent(k);
  k.flush();
  k.padLights();
  const dome = cityDome();
  scene.add(dome.mesh);

  let current = 0;
  let takenAt = 0,
    stale = false;
  const view = (n: number) => {
    const v = LEVELS[n].view;
    const bg = v != null ? ctx.cityView("palm", v, BACK) : null;
    dome.set(bg, LEVELS[n].rot ?? 0, !k.night);
    dome.mesh.visible = v != null;
    scene.background = v != null ? new THREE.Color(k.night ? "#0b1430" : "#cfe6f2") : (k.skies[n] ?? new THREE.Color("#8fc4e8"));
    takenAt = performance.now();
    stale = v != null && takenAt < 45_000;
  };
  let hemi: THREE.HemisphereLight | null = null;
  scene.traverse((o) => o instanceof THREE.HemisphereLight && (hemi = o));
  const setFloor = (n: number) => {
    current = n;
    // the crescent is lit by the sunset: a warm sky light, a violet ground bounce
    const h = hemi as THREE.HemisphereLight | null;
    if (h) {
      const sunset = n === 2 && !k.night;
      h.color.set(sunset ? "#ffc8a0" : k.night ? "#8090c0" : "#ffffff");
      h.groundColor.set(sunset ? "#5a3a5a" : "#3a3430");
      h.intensity = sunset ? 0.85 : k.night ? 0.55 : 0.9;
    }
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
    key: "palm",
    title: "THE PALM",
    scene,
    floors: LEVELS.map((l) => ({ label: l.label, name: l.name, y: l.y, spawn: new THREE.Vector3(l.spawn[0], l.y, l.spawn[1]), yaw: l.yaw })),
    colliders: (f) => k.rects[f],
    setFloor,
    setTheme: (t) => {
      k.night = t === "night";
      for (const fn of k.themeFns) fn(k.night);
      setFloor(current);
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
      dome.mesh.position.copy(k.eye);
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of k.people[k.current]) s.update(dt, t, camQuat, camRight);
      for (const tick of k.ticks[k.current]) tick(dt, t);
      if (stale && performance.now() - takenAt > 61_000) view(current);
    },
  };
}
