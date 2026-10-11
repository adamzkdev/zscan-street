import * as THREE from "three";
import type { WalletKit } from "./shared";
import { spinningEmblem } from "./shared";

/**
 * The roof: a terrace of teak under the sky, a glass parapet onto the whole city, the wallet's
 * emblem (the one the city sees from the street) turning over your head, loungers, beacons.
 */

export const ROOF_FLOOR = 3;
/** The floor index being built (the ZApp tower has no tweets floor: its lab is floor 1). */
let f = ROOF_FLOOR;
const X0 = -12,
  X1 = 12,
  Z0 = -22,
  Z1 = 0;

export function roof(wk: WalletKit, floor = ROOF_FLOOR) {
  f = floor;
  const { k, look } = wk;
  // the deck: teak boards, a border of the accent
  for (let z = Z0; z < Z1; z += 0.5) k.box(f, X1 - X0, 0.06, 0.46, 0, -0.06, z + 0.25, (Math.round(z * 2) & 1) === 0 ? "#6b4a30" : "#73503a", "matte");
  k.wall(f, X0, Z1, X1, Z1, 0.04, look.glow, "glow", 0.06, 0.0, false);
  // the parapet: glass on a steel kerb, all round
  for (const [a, b, c, d] of [
    [X0, Z0, X0, Z1],
    [X1, Z0, X1, Z1],
    [X0, Z1, X1, Z1],
    [X0, Z0, -3.6, Z0],
    [3.6, Z0, X1, Z0],
  ] as const) {
    k.wall(f, a, b, c, d, 0.25, look.trim, "metal", 0.3);
    k.wall(f, a, b, c, d, 1.0, "#cfe4f4", "glass", 0.05, 0.25, false);
    k.wall(f, a, b, c, d, 0.06, look.glow, "glow", 0.08, 1.25, false);
  }
  // the lift house at the back
  k.box(f, 7.4, 4.4, 2.6, 0, 0, Z0 - 1.3, look.wall, "matte");
  k.box(f, 7.6, 0.2, 2.8, 0, 4.4, Z0 - 1.3, look.glow, "glow");
  k.solid(f, -3.7, Z0 - 2.6, 3.7, Z0);
  k.lifts(f, 0, Z0 + 0.2, 0, look.lift);

  // the emblem over the terrace, big
  const e = spinningEmblem(wk, f, 0, 7.5, -10, 4.2, false);
  k.hit(f, 5, 5, 1.5, 0, 5.2, -10, `<b>${look.name}</b><span>the tower's crown</span>`, () => ({ eyebrow: look.title, title: look.name, body: `<p>${look.motto}.</p>`, link: { href: look.site, label: look.site.replace(/^https?:\/\/(www\.)?/, "") } }));
  void e;
  // a ring of light on the deck under it
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.06, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(look.glow).multiplyScalar(1.8), toneMapped: false }));
  ring.rotation.x = Math.PI / 2;
  ring.raycast = () => {};
  k.add(f, ring, 0, 0.02, -10, 0);

  // loungers along the parapet, beacons on the corners
  for (const x of [-8.5, -5.5, 5.5, 8.5]) {
    k.box(f, 0.9, 0.3, 2.0, x, 0, -2.4, look.trim, "metal");
    k.box(f, 0.8, 0.12, 1.9, x, 0.3, -2.4, look.key === "zodl" ? "#f4f1ea" : "#f2dde4", "matte");
    k.box(f, 0.8, 0.5, 0.12, x, 0.42, -3.3, look.key === "zodl" ? "#f4f1ea" : "#f2dde4", "matte");
    k.solid(f, x - 0.5, -3.45, x + 0.5, -1.35);
  }
  for (const [x, z] of [
    [X0 + 0.4, Z1 - 0.4],
    [X1 - 0.4, Z1 - 0.4],
  ] as const) {
    k.box(f, 0.2, 2.2, 0.2, x, 0, z, look.trim, "metal");
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff4a3a").multiplyScalar(2), toneMapped: false }));
    beacon.raycast = () => {};
    k.add(f, beacon, x, 2.3, z, 0);
    k.ticks[f].push((_dt, t) => (beacon.visible = Math.sin(t * 3) > 0));
  }
  k.light(f, 0, 6, -10, look.glow, 22, 18);
  k.light(f, 0, 3, -3, "#fff4e0", 8, 12);
  k.onCast(f, () => {
    void k.person(f, look.key === "zodl" ? 6601 : 6701, [-8.5, -2.4], "Guest", { sit: true, dy: 0.42, face: [0, 1], lines: ["Best view in ZStreet.", `The ${look.name} sign up there? You can see it from the avenue.`] });
    void k.person(f, look.key === "zodl" ? 6602 : 6702, [4, -14], "Guest", { wander: [[4, -14], [-6, -16], [9, -6]], lines: ["Every block, the city grows a little.", "Shielded up here too."] });
  });
}
