import * as THREE from "three";
import type { City } from "./city";
import { emblem } from "./emblems";

/**
 * The wallet towers' crowns: over the ZODL TOWER its bird, over the VIZOR TOWER its visored head,
 * each a real 3D emblem some ten metres across, turning slowly in a halo of its colour, seen from
 * the whole avenue and the map. Over the NOIR TOWER, its silver eclipse and green light.
 */
export class WalletCrowns {
  private crowns: { obj: THREE.Object3D; base: number; phase: number }[] = [];

  constructor(scene: THREE.Object3D, city: City) {
    for (const [kind, color] of [
      ["zodl", "#ffffff"],
      ["vizor", "#ff4f86"],
      ["noir", "#00d38c"],
    ] as const) {
      const at = city.landmarks.get(kind)?.points.crown;
      if (!at) continue;
      const g = new THREE.Group();
      const e = emblem(kind, { glow: 2.4 });
      e.scale.setScalar(9);
      g.add(e);
      // a soft halo behind it, always facing the camera
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: new THREE.Color(color), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      halo.scale.setScalar(26);
      halo.raycast = () => {};
      g.add(halo);
      g.position.copy(at);
      g.traverse((o) => (o.raycast = () => {}));
      scene.add(g);
      this.crowns.push({ obj: e, base: at.y, phase: kind === "zodl" ? 0 : 1.7 });
    }
  }

  update(dt: number, t: number) {
    for (const c of this.crowns) {
      c.obj.rotation.y += dt * 0.5;
      c.obj.position.y = Math.sin(t * 0.7 + c.phase) * 0.6;
    }
  }
}

let tex: THREE.Texture | null = null;
function haloTexture() {
  if (tex) return tex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,0.9)");
  r.addColorStop(0.3, "rgba(255,255,255,0.35)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  tex = new THREE.CanvasTexture(c);
  return tex;
}
