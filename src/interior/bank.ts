import * as THREE from "three";
import { Market } from "../data/market";
import { makeScene } from "./kit";
import type { Interior, InteriorContext } from "./types";
import { Cast, Picks } from "./bank/common";
import { buildHall } from "./bank/hall";
import { buildVault, VAULT_Y } from "./bank/vault";

/**
 * VIEW KEY BANK: a grand banking hall where the key terminals open the viewing-key panel, live
 * boards show the value pools and the supply, and one floor down the vault keeps a pile of gold
 * per pool, sized by what the chain holds there.
 */
export function buildBank(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#07060a");
  scene.environmentIntensity = 0.28;
  // a dim fill: the room is lit by its lamps, neon and chandeliers
  scene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight) o.intensity = 0.32;
  });
  const picks = new Picks();
  const cast = new Cast(scene, picks);
  const hall = buildHall(cast, picks);
  const vault = buildVault(cast, picks);
  scene.add(hall.group, vault.group);

  Market.subscribe((m) => {
    hall.setMarket(m);
    vault.setMarket(m);
  });
  ctx.onBlock((h) => hall.block(h));

  return {
    key: "bank",
    title: "VIEW KEY BANK",
    scene,
    floors: [
      { label: "G", name: "Banking hall", y: 0, spawn: new THREE.Vector3(0, 0, -2.4), yaw: 0 },
      { label: "-1", name: "The vault", y: VAULT_Y, spawn: new THREE.Vector3(0, VAULT_Y, -1.4), yaw: 0 },
    ],
    colliders: (f) => (f === 0 ? hall.colliders : vault.colliders),
    pickables: () => picks.list,
    pick: (hit) => picks.find(hit)?.pick() ?? null,
    hover: (hit) => picks.find(hit)?.hover() ?? null,
    update(dt, t, camera) {
      // only the floor the walker is on is animated and lit (lights would shine through the slab)
      const up = camera.position.y > VAULT_Y / 2;
      if (up) hall.update(dt, t);
      else vault.update(dt, t);
      for (const l of hall.lights) l.visible = up;
      for (const l of vault.lights) l.visible = !up;
      cast.update(dt, t, camera);
    },
  };
}
