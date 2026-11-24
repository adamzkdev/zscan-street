import * as THREE from "three";
import { add, matte, object, type Parts } from "./boats";

/**
 * The woods' animals, realistic (branch gta-real): black-tailed deer (head up, or down grazing; the
 * bucks with their antlers) and the birds (ravens circling, small birds hopping), as smooth bodies
 * instead of voxels. In the voxel models' frames: the deer centred, standing on y = 0, its head +x
 * (2.7 m long before the herd's 0.6 scale); a bird centred, its wings along x, its beak +z.
 */

const ell = (rx: number, ry: number, rz: number, x: number, y: number, z: number, seg = 16) => new THREE.SphereGeometry(1, seg, Math.max(8, seg / 2 + 2)).scale(rx, ry, rz).translate(x, y, z);

function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, 8).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  return g.translate(a.x, a.y, a.z);
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A deer, its head up (looking) or down (grazing); a buck with antlers. */
export function realDeer(head: "up" | "down", buck: boolean) {
  return object(`deer:${head}:${buck ? 1 : 0}`, () => {
    const parts: Parts = new Map();
    const coat = matte("#9c6c42", 0.85),
      dark = matte("#86603e", 0.85),
      belly = matte("#e6d8bc", 0.9),
      black = matte("#1a1614", 0.5),
      horn = matte("#c8b89a", 0.7);
    // the body: barrel, rump and shoulders, the pale belly, the darker back
    add(parts, coat, ell(0.72, 0.34, 0.3, -0.05, 1.32, 0, 20));
    add(parts, coat, ell(0.34, 0.36, 0.3, -0.55, 1.36, 0));
    add(parts, coat, ell(0.32, 0.38, 0.29, 0.42, 1.4, 0));
    add(parts, belly, ell(0.6, 0.2, 0.24, -0.02, 1.13, 0));
    add(parts, dark, ell(0.6, 0.08, 0.2, -0.05, 1.6, 0));
    // the legs: slender, a knee in each, the hooves
    for (const [x, back] of [
      [-0.6, true],
      [0.42, false],
    ] as const)
      for (const z of [-0.17, 0.17]) {
        const knee = V(x + (back ? -0.06 : 0.03), 0.62, z);
        add(parts, coat, limb(V(x, 1.2, z), knee, 0.09, 0.055));
        add(parts, coat, limb(knee, V(x + (back ? 0.02 : 0), 0.07, z), 0.05, 0.035));
        add(parts, black, ell(0.05, 0.05, 0.045, x + (back ? 0.02 : 0), 0.04, z, 8));
      }
    // the tail: white with a black tip
    add(parts, belly, ell(0.07, 0.13, 0.06, -0.86, 1.42, 0, 8).rotateZ(0));
    add(parts, black, ell(0.05, 0.05, 0.04, -0.9, 1.33, 0, 8));
    // the neck and the head
    const neckTop = head === "up" ? V(0.72, 2.05, 0) : V(0.95, 0.55, 0);
    add(parts, coat, limb(V(0.45, 1.5, 0), neckTop, 0.16, 0.1));
    const hx = neckTop.x + (head === "up" ? 0.14 : 0.08),
      hy = neckTop.y + (head === "up" ? 0.04 : -0.1);
    const skull = ell(0.24, 0.12, 0.11, hx, hy, 0, 14);
    if (head === "down") skull.rotateZ(0);
    add(parts, coat, skull);
    add(parts, black, ell(0.05, 0.05, 0.05, hx + 0.23, hy - 0.01, 0, 8));
    for (const s of [-1, 1]) {
      add(parts, black, ell(0.02, 0.02, 0.02, hx + 0.07, hy + 0.05, s * 0.09, 6));
      add(parts, coat, ell(0.05, 0.11, 0.025, hx - 0.12, hy + 0.12, s * 0.12, 8).rotateX(0));
    }
    if (buck) {
      // the antlers: a beam up and back from each side, two tines forward
      for (const s of [-1, 1]) {
        const base = V(hx - 0.06, hy + 0.1, s * 0.06);
        const mid = V(hx - 0.14, hy + 0.36, s * 0.2);
        const tip = V(hx - 0.04, hy + 0.58, s * 0.26);
        add(parts, horn, limb(base, mid, 0.025, 0.02));
        add(parts, horn, limb(mid, tip, 0.02, 0.012));
        add(parts, horn, limb(mid, V(hx + 0.08, hy + 0.46, s * 0.22), 0.016, 0.01));
        add(parts, horn, limb(V(hx - 0.1, hy + 0.24, s * 0.14), V(hx + 0.05, hy + 0.3, s * 0.16), 0.016, 0.01));
      }
    }
    return parts;
  });
}

/** A bird, its wings up or down (the two frames of its flap); `span` as the voxel one's (in sixths of a metre). */
export function realBird(color: string, span: number, up: boolean) {
  return object(`bird:${color}:${span}:${up ? 1 : 0}`, () => {
    const parts: Parts = new Map();
    const c = matte(color, 0.7),
      beak = matte("#d8a030", 0.5);
    const S = (span + 1) / 6;
    const y = 2.5 / 6;
    add(parts, c, ell(0.07 * S * 2.2, 0.06 * S * 2.2, 0.16 * S * 2.2, 0, y, 0.02, 12));
    add(parts, c, ell(0.05 * S * 2.2, 0.05 * S * 2.2, 0.05 * S * 2.2, 0, y + 0.02 * S, 0.16 * S * 2.2, 10));
    add(parts, beak, new THREE.ConeGeometry(0.018 * S * 2.2, 0.06 * S * 2.2, 6).rotateX(Math.PI / 2).translate(0, y + 0.02 * S, 0.22 * S * 2.2));
    // the tail fan
    add(parts, c, new THREE.CircleGeometry(0.1 * S * 2.2, 8, Math.PI * 1.25, Math.PI * 0.5).rotateX(-Math.PI / 2).translate(0, y, -0.1 * S * 2.2));
    // the wings: swept plates from the shoulders, tipped up or down
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape([new THREE.Vector2(0, 0.05), new THREE.Vector2(S * 0.95, -0.02), new THREE.Vector2(S * 1.0, -0.1), new THREE.Vector2(0, -0.12)].map((v) => new THREE.Vector2(v.x, v.y * S * 2.2)));
      const g = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);
      if (s < 0) g.scale(-1, 1, 1);
      g.rotateZ(s * (up ? 0.45 : -0.35));
      add(parts, c, g.translate(0, y + 0.01, 0.06 * S));
    }
    return parts;
  });
}
