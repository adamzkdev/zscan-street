import * as THREE from "three";
import { makeScene } from "../kit";
import type { Interior, InteriorContext } from "../types";
import { climb, SPAWN1, SPAWN2 } from "./climb";
import { LEVELS, StatueKit } from "./kit";
import { museum, SPAWN0 } from "./museum";
import { buildShell, CROWN_Y } from "./shell";
import { SPAWN3, torch } from "./torch";

/**
 * zkSNARK OF LIBERTY: inside the statue on Liberty island. The pedestal museum in the casemates of
 * the star fort (the original torch, the copper face, a cutaway model, plaques, the shielded pools
 * live); the balcony round the top of the pedestal with the city across the water; the iron pylon
 * and the double helix climbing inside the copper skin to the crown, 25 windows and the two Volt
 * eyes to look out of; and the torch's gallery, closed since 1916. The statue round you is the
 * city's own voxel model, hollowed out.
 */
export function buildStatue(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0b0a14");
  let hemi: THREE.HemisphereLight | null = null;
  scene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight) hemi = o;
  });
  const sun = new THREE.DirectionalLight("#fff2dc", 1.6);
  sun.position.set(-40, 80, 30);
  scene.add(sun);
  const k = new StatueKit(ctx, scene);
  const shell = buildShell();
  k.outside.add(shell.object);
  k.shared = [[0], [1, 2], [1, 2], [3]];
  museum(k, shell);
  const walk = climb(k, shell);
  torch(k);
  k.finish();
  k.padLights();

  const spawns = [SPAWN0, SPAWN1, SPAWN2, SPAWN3];
  let theme = ctx.theme;
  let viewKey = -1;
  const showView = (n: number) => {
    if (n === viewKey) return;
    viewKey = n;
    if (n === 0) {
      scene.background = new THREE.Color("#0b0a10");
      return;
    }
    const v = ctx.cityView("statue", LEVELS[n].view, 9);
    if (v) scene.background = v;
  };
  const light = () => {
    const night = theme === "night";
    const out = k.current !== 0;
    if (hemi) hemi.intensity = out ? (night ? 0.55 : 1.5) : night ? 0.45 : 0.6;
    sun.intensity = out ? (night ? 0.25 : 2.0) : 0;
    sun.color.set(night ? "#9fa8ff" : "#fff2dc");
    scene.environmentIntensity = out ? (night ? 0.18 : 0.5) : 0.3;
  };
  const setFloor = (n: number) => {
    k.current = n;
    const show = k.shared[n];
    k.groups.forEach((g, i) => (g.visible = show.includes(i)));
    k.lightGroups.forEach((g, i) => (g.visible = show.includes(i)));
    k.outside.visible = n !== 0;
    if (n === 1 || n === 2) walk.reset(LEVELS[n].y);
    viewKey = -1;
    showView(n);
    light();
  };
  k.setNight(theme === "night");
  setFloor(0);

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) if (k.picks.has(x)) return x;
    return null;
  };
  return {
    key: "statue",
    title: "zkSNARK OF LIBERTY",
    scene,
    floors: LEVELS.map((l, i) => ({ label: l.label, name: l.name, y: l.y, spawn: spawns[i].pos.clone().setY(l.y), yaw: spawns[i].yaw })),
    colliders: (f) => k.rects[f],
    setFloor,
    setTheme(t) {
      theme = t;
      k.setNight(t === "night");
      viewKey = -1;
      setFloor(k.current);
    },
    groundAt(f, x, z) {
      return f === 1 || f === 2 ? walk.ground(x, z) : null;
    },
    pickables: () => k.pickables.filter((o) => k.shared[k.current].includes(k.floorOf.get(o) ?? -1)),
    pick: (hit) => {
      const o = find(hit.object);
      return o ? (k.picks.get(o)!(hit) ?? null) : null;
    },
    hover: (hit) => {
      const o = find(hit.object);
      return o ? (k.hovers.get(o) ?? null) : null;
    },
    update(dt, t, camera) {
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      // climbing: the panorama follows you from the balcony's height to the crown's
      if (k.current === 1 || k.current === 2) showView(walk.height > (LEVELS[1].y + CROWN_Y) / 2 ? 2 : 1);
      for (const f of k.shared[k.current]) {
        for (const s of k.people[f]) s.update(dt, t, camQuat, camRight);
        for (const tick of k.ticks[f]) tick(dt, t);
      }
    },
  };
}
