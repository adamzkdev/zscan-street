import * as THREE from "three";
import { makeScene } from "../kit";
import type { Interior, InteriorContext } from "../types";
import { HotelKit, LEVELS, LIFT_Z } from "./kit";
import { casino } from "./casino";
import { lobby } from "./lobby";
import { restaurant } from "./restaurant";
import { rooms } from "./rooms";
import { skypark } from "./skypark";
import { spa } from "./spa";
import { suites } from "./suites";

/**
 * MARINA ZEC HOTEL: a Marina Bay Sands on the river. The grand atrium under the leaning tower, the
 * casino, deluxe rooms and suites with bay windows onto the real city, the spa, the sky restaurant
 * and the SkyPark with its infinity pool at 57. Only the floor you are on is drawn, lit and animated.
 */
export function buildHotel(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#07061a");
  const k = new HotelKit(ctx, scene);
  lobby(k);
  casino(k);
  rooms(k);
  suites(k);
  spa(k);
  restaurant(k);
  skypark(k);
  k.padLights();
  // the walkers' router needs a bounded floor on every level
  k.rects.forEach((r, i) => r.length || r.push([LEVELS[i].x0, LEVELS[i].z0, LEVELS[i].x0 + 0.1, LEVELS[i].z0 + 0.1]));

  const setFloor = (n: number) => {
    k.current = n;
    k.groups.forEach((g, i) => (g.visible = i === n));
    const view = ctx.cityView("hotel", LEVELS[n].y + 1.6, 3);
    if (view) scene.background = view;
  };
  setFloor(0);

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) if (k.picks.has(x)) return x;
    return null;
  };
  return {
    key: "hotel",
    title: "MARINA ZEC HOTEL",
    scene,
    floors: LEVELS.map((l, i) => ({
      label: l.label,
      name: l.name,
      y: l.y,
      spawn: i === 0 ? new THREE.Vector3(0, 0, -1.6) : new THREE.Vector3((l.lx ?? l.x0) + 1.8, l.y, LIFT_Z),
      yaw: i === 0 ? 0 : -Math.PI / 2,
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
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of k.people[k.current]) s.update(dt, t, camQuat, camRight);
      for (const tick of k.ticks[k.current]) tick(dt, t);
    },
  };
}
