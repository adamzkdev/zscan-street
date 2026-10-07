import * as THREE from "three";
import { makeScene } from "../kit";
import type { Interior, InteriorContext } from "../types";
import { BACK, LEVELS, NeedleKit } from "./kit";
import { atTheTop, sky } from "./deck";
import { lobby } from "./lobby";
import { lounge } from "./lounge";
import { residence } from "./residence";

/**
 * The ZEC NEEDLE, the city's 164 m tower, like the Burj's "At the Top": a marble-and-gold lobby
 * with the Zcash history wall, the lifts (a real ride: the counter runs between levels), a
 * residence at 40 m, the observation deck at 82 m with its terrace and telescopes, the Sky
 * Lounge at 120 m and At the Top SKY at 150 m. Every window shows the real city from that height.
 */
export function buildNeedle(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#07060c");
  const k = new NeedleKit(ctx, scene);
  lobby(k);
  residence(k);
  atTheTop(k);
  lounge(k);
  sky(k);
  k.padLights();

  let current = 0;
  // the panorama is cached a minute per height: one taken while the city was still loading (or
  // before a change of day/night) is taken again once that minute is up
  let takenAt = 0,
    stale = false;
  const view = (n: number) => {
    const v = ctx.cityView("needle", LEVELS[n].y + 1.6, BACK);
    if (v) scene.background = v;
    takenAt = performance.now();
    stale = takenAt < 45_000;
  };
  const setFloor = (n: number) => {
    const from = current;
    current = n;
    k.current = n;
    k.groups.forEach((g, i) => (g.visible = i === n));
    view(n);
    if (n > 0 && from !== n) k.ride(n, from);
    k.zoom = 0;
  };
  setFloor(0);

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) if (k.picks.has(x)) return x;
    return null;
  };
  let fov = 62;
  return {
    key: "needle",
    title: "ZEC NEEDLE",
    scene,
    floors: LEVELS.map((l, i) => ({
      label: l.label,
      name: `${l.name} · ${l.m}`,
      y: l.y,
      spawn: i === 0 ? new THREE.Vector3(0, 0, -2.2) : new THREE.Vector3(0, l.y, (k.cabins[i]?.c ?? 3.5) - 1.3),
      yaw: i === 0 ? 0 : Math.PI,
    })),
    colliders: (f) => k.rects[f],
    setFloor,
    setTheme: () => {
      view(current);
      stale = true;
    },
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
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of k.people[k.current]) s.update(dt, t, camQuat, camRight);
      for (const tick of k.ticks[k.current]) tick(dt, t);
      if (stale && performance.now() - takenAt > 61_000) view(current);
      // a telescope zooms the view for a few seconds
      k.zoom = Math.max(0, k.zoom - dt);
      const want = k.zoom > 0 ? 18 : 62;
      if (Math.abs(fov - want) > 0.05 || camera.fov !== fov) {
        fov += (want - fov) * Math.min(1, dt * 4);
        if (Math.abs(fov - want) < 0.05) fov = want;
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    },
  };
}
