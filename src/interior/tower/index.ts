import * as THREE from "three";
import { makeScene } from "../kit";
import type { Interior, InteriorContext } from "../types";
import { arcade } from "./arcade";
import { bowling } from "./bowling";
import { LEVELS, TowerKit, X0 } from "./kit";
import { lobby } from "./lobby";
import { offices } from "./offices";
import { residences } from "./residences";
import { rooftop } from "./rooftop";
import { gym, pool } from "./wellness";

/**
 * The ZK TOWER (秘密マンション): a condo tower between the MEMPOOL shop and zkCARDS. Eight levels of
 * 24 × 18 m, furnished in voxels like the city, glass all round onto the real street (a panorama
 * rendered from the tower at each floor's height). One module per floor; only the floor you are on
 * is drawn, lit and animated.
 */
export function buildTower(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#07061a");
  const k = new TowerKit(ctx, scene);
  lobby(k);
  offices(k);
  arcade(k);
  bowling(k);
  gym(k);
  pool(k);
  residences(k);
  rooftop(k);
  k.padLights();

  const setFloor = (n: number) => {
    k.current = n;
    k.groups.forEach((g, i) => (g.visible = i === n));
    const view = ctx.cityView("tower", LEVELS[n].y + 1.6, 3);
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
    key: "tower",
    title: "ZK TOWER",
    scene,
    floors: LEVELS.map((l, i) => ({
      label: l.label,
      name: l.name,
      y: l.y,
      spawn: i === 0 ? new THREE.Vector3(0, 0, -1.6) : new THREE.Vector3(i === LEVELS.length - 1 ? X0 + 3.4 : X0 + 1.8, l.y, -9),
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
