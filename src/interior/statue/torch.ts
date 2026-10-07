import * as THREE from "three";
import type { Rect } from "../types";
import { TORCH, TORCH_Y } from "./shell";
import type { StatueKit } from "./kit";

/**
 * Floor T: the torch's gallery, closed to the public since 1916, opened for whoever holds a viewing
 * key. A gold deck round the cup, a gold railing with sixteen lamps, the flame at your shoulder and
 * the whole city below.
 */
const R0 = 2.5,
  R1 = 4.3;
export const SPAWN3 = { pos: new THREE.Vector3(TORCH.x - 0.6, 0, TORCH.z - 3.4), yaw: 0.1 };

export function torch(k: StatueKit) {
  const f = 3;
  const y = TORCH_Y;
  const cx = TORCH.x,
    cz = TORCH.z;
  // the deck: a ring of gold plate with a grating pattern, a fascia below
  const deck = new THREE.RingGeometry(R0 - 0.2, R1, 64, 1);
  deck.rotateX(-Math.PI / 2);
  deck.translate(cx, y + 0.01, cz);
  k.addGeo(f, deck, k.gold);
  k.addGeo(f, new THREE.CylinderGeometry(R1, R1 - 0.3, 0.35, 64, 1, true).translate(cx, y - 0.17, cz), k.gold);
  const grate = k.dark;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    k.beam(f, new THREE.Vector3(cx + Math.cos(a) * R0, y + 0.02, cz + Math.sin(a) * R0), new THREE.Vector3(cx + Math.cos(a) * (R1 - 0.1), y + 0.02, cz + Math.sin(a) * (R1 - 0.1)), 0.03, grate, 0.01);
  }
  // railing: posts, two rings, sixteen lamps
  const lamp = k.glow("#ffd27a", 1.6, 3);
  const n = 64;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2,
      b = ((i + 1) / n) * Math.PI * 2;
    const P = (ang: number, h: number) => new THREE.Vector3(cx + Math.cos(ang) * (R1 - 0.08), y + h, cz + Math.sin(ang) * (R1 - 0.08));
    k.beam(f, P(a, 1.1), P(b, 1.1), 0.07, k.gold);
    k.beam(f, P(a, 0.55), P(b, 0.55), 0.03, k.gold);
    if (i % 2 === 0) k.beam(f, P(a, 0), P(a, 1.1), 0.04, k.gold);
    if (i % 4 === 0) k.slab(f, 0.16, 0.2, 0.16, P(a, 0).x, y + 1.14, P(a, 0).z, lamp);
  }
  // the flame's light
  k.light(f, cx, y + 3.2, cz, "#ffb347", 30, 16);
  k.light(f, cx, y + 1.2, cz - 3.4, "#ffd8a0", 4, 7);

  // ---- colliders: the cup in the middle, the railing round ---------------------------------------
  const ring = (r: number, m: number): Rect[] =>
    Array.from({ length: m }, (_, i) => {
      const a = (i / m) * Math.PI * 2;
      const x = cx + Math.cos(a) * r,
        z = cz + Math.sin(a) * r;
      return [x - 0.12, z - 0.12, x + 0.12, z + 0.12] as Rect;
    });
  k.rects[f].push(...ring(R0 - 0.05, 40), ...ring(R1 + 0.02, 64));

  k.plaque(f, 0.9, 0.62, cx + 0.2, y + 1.25, cz - R0 - 0.08, Math.PI, "Torch Balcony", "Closed to the public since 1916", "Shut after the Black Tom explosion. Reopened today for one visitor with a viewing key. The flame is gold leaf; the light is real. Please don't lean on it.", { style: "bronze" });

  const keeper = k.person(f, k.visitor(301), [cx + 3.4, cz + 1.0], "Ranger", { face: [cx + 6, cz + 2], cap: true, title: "Torch keeper" });
  const guest = k.person(f, k.visitor(302), [cx + 2.0, cz + 3.0], "Visitor", { face: [cx + 3, cz + 6] });
  k.chat(f, [keeper, guest], [
    [[1, "It's warm up here."], [0, "Eighty metres up and next to the flame. Hold the rail."], [1, "I can see every block from here."], [0, "And none of them can see you."]],
    [[0, "Last visitor up here was 1916."], [1, "What happened?"], [0, "Explosives on the pier. They locked the arm."], [1, "And now?"], [0, "Now we lock the keys, not the doors."]],
  ]);
}
