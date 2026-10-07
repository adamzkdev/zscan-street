import * as THREE from "three";
import { makeScene } from "../kit";
import type { Interior, InteriorContext } from "../types";
import { esplanade, SPAWN0 } from "./esplanade";
import { buildFrame } from "./frame";
import { EiffelKit, LEVELS, VIEW_BACK } from "./kit";
import { first, SPAWN1 } from "./first";
import { second, SPAWN2 } from "./second";
import { summit, SPAWN3 } from "./summit";

/**
 * TOUR EIFFEL: walk under the wrought-iron tower and ride up it. The esplanade between the four
 * pillars, the first floor (glass floor over the void, the 58 Tour Eiffel, the boutique), the second
 * (Jules Verne, macarons, telescopes) and the summit (Gustave Eiffel's office with its wax figures,
 * the champagne bar, the windy open top under the beacon). The iron lattice is drawn round you on
 * every floor and the view beyond it is the real street, rendered from the tower at each height.
 */
export function buildEiffel(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0b0a14");
  const k = new EiffelKit(ctx, scene);
  buildFrame(k);
  esplanade(k);
  first(k);
  second(k);
  summit(k);
  k.finish();
  k.padLights();
  k.setNight(ctx.theme === "night");

  const spawns = [SPAWN0, SPAWN1, SPAWN2, SPAWN3];
  const setFloor = (n: number) => {
    k.current = n;
    // the esplanade stays drawn from the first floor: you see it through the glass floor
    k.groups.forEach((g, i) => (g.visible = i === n || (n === 1 && i === 0)));
    k.lightGroups.forEach((g, i) => (g.visible = i === n));
    const view = ctx.cityView("eiffel", LEVELS[n].y + 1.6, VIEW_BACK);
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
    key: "eiffel",
    title: "TOUR EIFFEL",
    scene,
    floors: LEVELS.map((l, i) => ({ label: l.label, name: l.name, y: l.y, spawn: spawns[i].pos.clone().setY(l.y), yaw: spawns[i].yaw })),
    colliders: (f) => k.rects[f],
    setFloor,
    setTheme(theme) {
      k.setNight(theme === "night");
      setFloor(k.current);
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
    },
  };
}
