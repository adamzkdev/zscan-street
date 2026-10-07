import * as THREE from "three";
import type { Theme } from "../../scene/theme";
import { makeScene } from "../kit";
import type { Interior, InteriorContext } from "../types";
import { atrium } from "./atrium";
import { LEVELS, MallKit } from "./kit";
import { Levels } from "./levels";

/**
 * ZK MALL: Jewel Changi meets the Shoppes at Marina Bay Sands. Five levels round a central atrium
 * where the ZEC RAIN VORTEX falls forty metres from the oculus of a glass dome into a pool in a
 * sunken forest valley; escalators criss-cross the void; the ground floor has a canal with a
 * sampan and the luxury row; above, fashion and beauty (ORCHARD MART), tech, toys and books
 * (IRONWOOD TECH), the hawker centre, ZK CINEMA and the arcade. The glass roof looks onto the real
 * sky over ZStreet. Everything static stays drawn (it is an atrium); people, screens and lights
 * belong to the level you are on.
 */
export function buildMall(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0b0a10");
  // a dim, warm base: the light comes from the shops, the signs, the dome and a few pools of warm light
  let hemi: THREE.HemisphereLight | null = null;
  scene.traverse((o) => o instanceof THREE.HemisphereLight && (hemi = o));
  const k = new MallKit(ctx, scene);
  const a = atrium(k);
  const lv = new Levels(k);
  lv.ground();
  lv.fashion();
  lv.tech();
  lv.food();
  lv.cinema();
  k.finish();

  const setTheme = (t: Theme) => {
    k.night = t === "night";
    scene.environmentIntensity = k.night ? 0.1 : 0.16;
    if (hemi) {
      hemi.color.set(k.night ? "#8a7a9a" : "#fff0dc");
      hemi.groundColor.set(k.night ? "#140e10" : "#3a2a20");
      hemi.intensity = k.night ? 0.42 : 0.72;
    }
    a.setNight(k.night);
    lv.setNight(k.night);
  };
  const setFloor = (n: number) => {
    k.current = n;
    k.groups.forEach((g, i) => (g.visible = i === n));
    const view = ctx.cityView("mall", 34, 24);
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
    key: "mall",
    title: "ZK MALL",
    scene,
    floors: LEVELS.map((l, i) => ({
      label: l.label,
      name: l.name,
      y: l.y,
      spawn: i === 0 ? new THREE.Vector3(0, 0, -1.6) : new THREE.Vector3(-19.8, l.y, -6.2),
      yaw: i === 0 ? 0 : -0.62,
    })),
    colliders: (f) => k.rects[f],
    setFloor,
    setTheme,
    pickables: () => k.pickables.filter((o) => {
      const f = k.floorOf.get(o);
      return f === k.current || f === -1;
    }),
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
      k.refreshBlock();
      for (const s of k.people[k.current]) s.update(dt, t, camQuat, camRight);
      for (const tick of k.ticks[k.current]) tick(dt, t);
      for (const tick of k.always) tick(dt, t);
    },
  };
}
