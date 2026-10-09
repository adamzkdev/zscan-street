import * as THREE from "three";
import { makeScene } from "../kit";
import type { Interior, InteriorContext } from "../types";
import { hall } from "./hall";
import { trading } from "./trading";
import { executive, museum, roof } from "./upper";
import { deposit, vault } from "./vault";
import { wallets } from "./wallets";
import { LEVELS, ReserveKit } from "./kit";

/**
 * The ZEC RESERVE (準備銀行) on Wall Street: the central bank and the stock exchange in one.
 * The banking hall with its viewing-key terminals and the live wall; the trading floor where a
 * bell rings on every block; the museum of money; the executive floor with the boardroom and the
 * governor's office; the observation terrace on the tower; and underground the gold vault, one
 * cage per value pool sized by what the chain holds, and the safe deposit floor with the lockbox.
 * Only the floor you are on is drawn, lit and animated.
 */
export function buildReserve(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#07060a");
  scene.environmentIntensity = 0.4;
  scene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight) o.intensity = 0.55;
  });
  const k = new ReserveKit(ctx, scene);
  hall(k);
  wallets(k);
  trading(k);
  vault(k);
  deposit(k);
  museum(k);
  executive(k);
  roof(k);
  k.flush();
  k.padLights();

  const setFloor = (n: number) => {
    k.groups.forEach((g, i) => (g.visible = i === n));
    const v = LEVELS[n].view;
    const bg = v != null ? ctx.cityView("reserve", v, 3) : null;
    scene.background = bg ?? new THREE.Color("#07060a");
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
    key: "reserve",
    title: "ZEC RESERVE",
    scene,
    floors: LEVELS.map((l) => ({ label: l.label, name: l.name, y: l.y, spawn: new THREE.Vector3(l.spawn[0], l.y, l.spawn[1]), yaw: l.yaw })),
    colliders: (f) => k.rects[f],
    setFloor,
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
    },
  };
}
