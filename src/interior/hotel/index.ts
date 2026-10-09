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
import { grandStair, STAIR } from "./stair";
import { suites } from "./suites";

/**
 * MARINA ZEC HOTEL: a Marina Bay Sands on the river. The grand atrium under the leaning tower, the
 * casino, deluxe rooms and suites with bay windows onto the real city, the spa, the sky restaurant
 * and the SkyPark with its infinity pool at 57. Only the floor you are on is drawn, lit and animated
 * (in the grand staircase between G and the casino, the floor at its other end is drawn too, unlit).
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
  grandStair(k);
  k.padLights();
  // the walkers' router needs a bounded floor on every level
  k.rects.forEach((r, i) => r.length || r.push([LEVELS[i].x0, LEVELS[i].z0, LEVELS[i].x0 + 0.1, LEVELS[i].z0 + 0.1]));

  // each floor's lights: a floor drawn beside yours keeps them off (same light count, no recompile)
  const lights = k.groups.map((g) => {
    const out: THREE.Light[] = [];
    g.traverse((o) => o instanceof THREE.Light && out.push(o));
    return out;
  });
  let other = -1;
  const showOther = (n: number) => {
    if (n === other) return;
    if (other >= 0 && other !== k.current) k.groups[other].visible = false;
    other = n;
    if (n < 0) return;
    k.groups[n].visible = true;
    for (const l of lights[n]) l.visible = false;
  };
  const setFloor = (n: number) => {
    k.current = n;
    other = -1;
    k.groups.forEach((g, i) => (g.visible = i === n));
    for (const l of lights[n]) l.visible = true;
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
      // the stair hall is drawn with the atrium: from the casino's west half (where its portal can be
      // seen) the atrium is drawn too, harmless under the casino's floor. From G the casino only once
      // you are up the flight in the hall (over the atrium's glass roof it must not show)
      const p = camera.position;
      const inHall = p.x < STAIR.east - 0.05;
      showOther(k.current === 1 && p.x < -4 ? 0 : inHall && k.current === 0 && p.y > 2.9 ? 1 : -1);
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of k.people[k.current]) s.update(dt, t, camQuat, camRight);
      for (const tick of k.ticks[k.current]) tick(dt, t);
    },
  };
}
