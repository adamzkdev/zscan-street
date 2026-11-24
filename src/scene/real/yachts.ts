import * as THREE from "three";
import { add, bands, box, glass, gloss, hull, lamp, matte, object, railing, rbox, steel, teak, type Parts } from "./boats";

/**
 * The bay's and the river's pleasure craft, realistic (branch gta-real): a sailing yacht with its
 * cambered sails, a motor yacht on three decks, jet skis and speedboats with their riders, and the
 * cruise ship (built at half size, drawn ×2 like the voxel one). Lofted hulls (real/boats.ts), clear
 * gloss topsides, teak, dark glass, steel, lamps that light. Front +x, centred on x and z; the
 * waterline sits `lift` over y = 0 so they ride where the voxel models rode (src/scene/alive/water.ts
 * sinks each by that much).
 */

const sailcloth = (() => {
  let m: THREE.Material | null = null;
  return () => (m ??= Object.assign(new THREE.MeshStandardMaterial({ color: "#f4f2ec", roughness: 0.82, side: THREE.DoubleSide }), { userData: { shared: true } }));
})();

/** A sail: a triangle (three points in the boat's frame) with a belly `camber` m deep, as a fine mesh. */
function sail(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, camber: number, rows = 10) {
  const pos: number[] = [];
  const at = (u: number, v: number) => {
    // u from the luff (a–b) toward the clew c, v up the luff
    const l = new THREE.Vector3().lerpVectors(a, b, v);
    const foot = new THREE.Vector3().lerpVectors(l, new THREE.Vector3().lerpVectors(c, b, v), u);
    foot.z += camber * Math.sin(Math.PI * u) * (1 - v * 0.7);
    return foot;
  };
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < rows; i++) {
      const u0 = i / rows,
        u1 = (i + 1) / rows,
        v0 = j / rows,
        v1 = (j + 1) / rows;
      const p = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
      for (const k of [0, 1, 2, 0, 2, 3]) pos.push(p[k].x, p[k].y, p[k].z);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A round spar from a to b. */
function spar(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r * 0.8, r, len, 8).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  return g.translate(a.x, a.y, a.z);
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Lift every part by `dy` (the waterline over the model's origin). */
function lifted(parts: Parts, dy: number) {
  for (const list of parts.values()) for (const g of list) g.translate(0, dy, 0);
  return parts;
}

/** A sailing yacht: 9.3 m, a 13 m mast, main and jib with a gold band; its waterline 0.35 m up. */
export function realSailYacht(hullHex: string, bandHex: string) {
  return object(`yacht:sail:${hullHex}:${bandHex}`, () => {
    const parts: Parts = new Map();
    const L = 9.3,
      W = 2.5,
      top = 0.62;
    const h = hull(L, W, top, 0.45);
    const [under, boot, topside] = bands(h.side, -0.05, 0.09);
    add(parts, matte("#1c2a4a", 0.7), under);
    add(parts, gloss(bandHex), boot);
    add(parts, gloss(hullHex), topside);
    add(parts, teak(), h.deck);
    // the keel fin and the rudder under the water
    add(parts, matte("#1c2a4a", 0.7), rbox(1.6, 1.1, 0.16, 0.05, -0.2, -1.5, 0));
    // the coachroof with its portlights, the cockpit's coaming
    add(parts, gloss("#f2f2f4"), rbox(3.2, 0.42, 1.5, 0.12, 0.2, top - 0.05, 0));
    for (const s of [-1, 1]) add(parts, glass(), box(1.8, 0.12, 0.02, 0.3, top + 0.16, s * 0.76));
    add(parts, gloss("#f2f2f4"), rbox(2.2, 0.3, 1.9, 0.06, -2.9, top - 0.06, 0));
    add(parts, teak(), box(1.9, 0.05, 1.5, -2.9, top + 0.02, 0));
    add(parts, steel(), new THREE.TorusGeometry(0.32, 0.03, 8, 20).rotateY(Math.PI / 2).translate(-2.4, top + 0.55, 0));
    // the rig: mast, boom, the sails, forestay and backstay as fine wires
    const xm = 0.5;
    add(parts, steel(), spar(V(xm, top + 0.3, 0), V(xm, 13.6, 0), 0.07));
    add(parts, steel(), spar(V(xm, 1.55, 0), V(xm - 3.6, 1.6, 0), 0.05));
    add(parts, steel(), spar(V(xm, 13.4, 0), V(L / 2 - 0.2, top + 0.1, 0), 0.012));
    add(parts, steel(), spar(V(xm, 13.4, 0), V(-L / 2 + 0.2, top + 0.15, 0), 0.012));
    for (const s of [-1, 1]) add(parts, steel(), spar(V(xm, 9.5, 0), V(xm - 0.2, top + 0.05, s * 1.1), 0.01));
    add(parts, sailcloth(), sail(V(xm - 0.08, 1.7, 0), V(xm - 0.08, 13.3, 0), V(xm - 3.5, 1.72, 0), 0.32));
    add(parts, sailcloth(), sail(V(L / 2 - 0.4, top + 0.35, 0), V(xm + 0.12, 12.4, 0), V(xm + 0.5, 1.4, 0.05), 0.28));
    // the gold band across the mainsail
    add(parts, gloss(bandHex), sail(V(xm - 0.07, 6.6, 0.02), V(xm - 0.07, 7.4, 0.02), V(xm - 2.4, 6.6, 0.02), 0.26, 2));
    add(parts, lamp("#ff2a1a", 2.4), new THREE.SphereGeometry(0.06, 8, 6).translate(xm, 13.65, 0));
    add(parts, lamp("#fff6e0", 2.2), new THREE.SphereGeometry(0.05, 8, 6).translate(L / 2 - 0.25, top + 0.25, 0));
    // the pulpit and the lifelines
    railing(parts, [-1, 0, 1].map((s) => (s ? V(L / 2 - 1.4, top + 0.12, s * 0.9) : V(L / 2 - 0.3, top + 0.2, 0))), 0.5);
    return lifted(parts, 0.35);
  });
}

/** A motor yacht: 14 m, three decks, dark glass, a cyan line along the hull for the nights; waterline 0.25 m up. */
export function realMotorYacht() {
  return object("yacht:motor", () => {
    const parts: Parts = new Map();
    const L = 14,
      W = 3.7,
      top = 1.15;
    const h = hull(L, W, top, 0.7);
    const [under, boot, topside] = bands(h.side, -0.05, 0.12);
    add(parts, matte("#1c2a4a", 0.7), under);
    add(parts, gloss("#1c2a4a"), boot);
    add(parts, gloss("#f6f6f8"), topside);
    add(parts, teak(), h.deck);
    for (const s of [-1, 1]) add(parts, lamp("#3ef0ff", 1.4), box(L * 0.72, 0.04, 0.02, -0.8, top - 0.32, s * (W / 2 + 0.01)));
    // the main deck saloon (raked windscreen), the upper deck, the flybridge and its hardtop
    add(parts, gloss("#f6f6f8"), rbox(8.6, 1.15, W - 0.5, 0.18, -0.6, top, 0));
    for (const s of [-1, 1]) add(parts, glass(), rbox(7.4, 0.62, 0.04, 0.02, -0.5, top + 0.32, s * (W / 2 - 0.25)));
    add(parts, glass(), rbox(0.08, 0.7, W - 0.9, 0.03, 3.6, top + 0.32, 0).rotateZ(0.0));
    add(parts, gloss("#f6f6f8"), rbox(6, 1.0, W - 0.9, 0.16, -1.2, top + 1.15, 0));
    for (const s of [-1, 1]) add(parts, glass(), rbox(5.2, 0.5, 0.04, 0.02, -1.1, top + 1.38, s * (W / 2 - 0.45)));
    add(parts, gloss("#f6f6f8"), rbox(3.6, 0.1, W - 1.2, 0.04, -1.6, top + 2.5, 0));
    for (const [x, s] of [
      [-0.2, 1],
      [-0.2, -1],
      [-3.0, 1],
      [-3.0, -1],
    ] as const)
      add(parts, steel(), new THREE.CylinderGeometry(0.035, 0.035, 0.38, 8).translate(x, top + 2.33, s * (W / 2 - 0.75)));
    // the radar arch and its dome, the swim platform aft
    add(parts, matte("#1c1c24", 0.5), rbox(0.3, 0.9, W - 1.2, 0.1, -2.4, top + 2.6, 0));
    add(parts, gloss("#f6f6f8"), new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(-2.4, top + 3.5, 0));
    add(parts, teak(), box(1.1, 0.08, W - 0.6, -L / 2 - 0.4, 0.3, 0));
    // the foredeck's sunpad, the rails
    add(parts, matte("#e8e4dc", 0.9), rbox(2.2, 0.16, 2.0, 0.06, 4.6, top, 0));
    railing(parts, [V(3.6, top + 0.05, 1.55), V(5.6, top + 0.08, 1.2), V(6.6, top + 0.14, 0), V(5.6, top + 0.08, -1.2), V(3.6, top + 0.05, -1.55)], 0.6);
    add(parts, lamp("#fff6e0", 2.4), new THREE.SphereGeometry(0.06, 8, 6).translate(L / 2 - 0.3, top + 0.2, 0));
    return lifted(parts, 0.25);
  });
}

/** A rider in a life vest, astride (legs either side), hands forward to the bars; built round (0, seat, 0). */
function rider(parts: Parts, seat: number, vest: string, reach: number) {
  const skin = matte("#c99a78", 0.6);
  const legs = matte("#2a3a6a", 0.8);
  for (const s of [-1, 1]) {
    add(parts, legs, new THREE.CapsuleGeometry(0.075, 0.42, 4, 10).rotateZ(Math.PI / 2 - 0.25).translate(0.18, seat + 0.05, s * 0.17));
    add(parts, legs, new THREE.CapsuleGeometry(0.065, 0.38, 4, 10).translate(0.36, seat - 0.2, s * 0.2));
  }
  add(parts, matte(vest, 0.7), new THREE.CapsuleGeometry(0.17, 0.32, 4, 12).translate(0, seat + 0.45, 0));
  for (const s of [-1, 1]) add(parts, skin, spar(V(0.02, seat + 0.62, s * 0.2), V(reach, seat + 0.42, s * 0.24), 0.045));
  add(parts, skin, new THREE.SphereGeometry(0.11, 14, 10).translate(0.02, seat + 0.86, 0));
  add(parts, matte("#1a1820", 0.4), new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0.0, seat + 0.88, 0));
}

/** A jet ski with its rider (2.7 m); waterline 0.25 m up. */
export function realJetSki(paint: string) {
  return object(`ski:${paint}`, () => {
    const parts: Parts = new Map();
    const h = hull(2.7, 1.0, 0.42, 0.18);
    add(parts, matte("#1c1c24", 0.6), h.side.clone().translate(0, -0.001, 0));
    add(parts, gloss(paint), rbox(2.2, 0.3, 0.86, 0.12, 0.05, 0.22, 0));
    add(parts, matte("#1c1c24", 0.5), rbox(1.0, 0.16, 0.42, 0.07, -0.25, 0.5, 0));
    add(parts, gloss(paint), rbox(0.42, 0.34, 0.6, 0.12, 0.6, 0.42, 0));
    add(parts, steel(), spar(V(0.62, 0.75, -0.32), V(0.62, 0.75, 0.32), 0.022));
    rider(parts, 0.58, "#e0302a", 0.58);
    return lifted(parts, 0.25);
  });
}

/** A river speedboat with its driver behind the windscreen (5.3 m); waterline 0.25 m up. */
export function realSpeedBoat(paint: string) {
  return object(`speed:${paint}`, () => {
    const parts: Parts = new Map();
    const L = 5.3,
      W = 2.0,
      top = 0.62;
    const h = hull(L, W, top, 0.32);
    const [under, boot, topside] = bands(h.side, -0.04, 0.2);
    add(parts, matte("#f2f2f6", 0.4), under);
    add(parts, gloss(paint), boot);
    add(parts, gloss("#f4f4f6"), topside);
    add(parts, teak(), h.deck);
    add(parts, matte("#e8e2d4", 0.8), rbox(1.4, 0.4, 1.6, 0.12, -1.4, top - 0.05, 0));
    add(parts, glass(), rbox(0.05, 0.42, 1.7, 0.02, 0.9, top + 0.1, 0).rotateZ(-0.0));
    add(parts, steel(), rbox(0.06, 0.06, 1.74, 0.02, 0.9, top + 0.52, 0));
    rider(parts, top + 0.1, "#3a7bff", 0.75);
    add(parts, lamp("#fff6e0", 2.2), new THREE.SphereGeometry(0.05, 8, 6).translate(L / 2 - 0.2, top + 0.15, 0));
    return lifted(parts, 0.25);
  });
}

/** The cruise ship at half size (20 m; drawn ×2): navy hull, white decks with their balconies lit, a gold funnel; waterline 0.45 m up (0.9 at full size). */
export function realCruise() {
  return object("cruise", () => {
    const parts: Parts = new Map();
    const L = 20,
      W = 4.0,
      top = 1.35;
    const h = hull(L, W, top, 0.5);
    const [under, boot, topside] = bands(h.side, -0.02, 0.12);
    add(parts, matte("#8a2424", 0.7), under);
    add(parts, gloss("#f2f0ea"), boot);
    add(parts, gloss("#1c2a4a"), topside);
    add(parts, matte("#d8d4cc", 0.8), h.deck);
    // the portholes along the hull
    for (const s of [-1, 1]) for (let x = -L / 2 + 1.4; x < L / 2 - 4; x += 0.7) add(parts, lamp("#ffe2a8", 1.1), new THREE.CircleGeometry(0.06, 10).rotateY(s > 0 ? 0 : Math.PI).translate(x, top * 0.55, s * (W / 2 + 0.004)));
    // the decks, stepping back toward the top: white with their balcony rows (glass, lit cabins)
    const decks: [number, number, number, number, number][] = [
      [-8.6, 6.6, top, 1.1, W - 0.2],
      [-8.0, 5.6, top + 1.1, 1.0, W - 0.4],
      [-7.0, 4.2, top + 2.1, 0.9, W - 0.7],
    ];
    for (const [x0, x1, y, hh, w] of decks) {
      add(parts, gloss("#f6f4ee"), rbox(x1 - x0, hh, w, 0.1, (x0 + x1) / 2, y, 0));
      for (const s of [-1, 1]) {
        add(parts, glass(), box(x1 - x0 - 0.4, hh * 0.5, 0.02, (x0 + x1) / 2, y + hh * 0.25, s * (w / 2 + 0.005)));
        for (let x = x0 + 0.3; x < x1 - 0.4; x += 0.55) if (Math.sin(x * 7.1 + y * 3.3) > -0.2) add(parts, lamp("#ffe2a8", 0.9), box(0.3, hh * 0.34, 0.01, x + 0.15, y + hh * 0.3, s * (w / 2 + 0.016)));
        add(parts, steel(), box(x1 - x0 - 0.2, 0.025, 0.02, (x0 + x1) / 2, y + hh * 0.22, s * (w / 2 + 0.05)));
      }
    }
    // the bridge forward with its wings, the windows across
    add(parts, gloss("#f6f4ee"), rbox(1.6, 0.8, W + 0.3, 0.08, 3.6, top + 3.0, 0));
    add(parts, glass(), box(0.04, 0.32, W + 0.2, 4.41, top + 3.35, 0));
    // lifeboats in their davits along both sides
    for (let x = -6; x < 4; x += 1.8)
      for (const s of [-1, 1]) {
        add(parts, gloss("#ff7a1a"), new THREE.CapsuleGeometry(0.22, 0.9, 4, 10).rotateZ(Math.PI / 2).translate(x, top + 1.45, s * (W / 2 + 0.12)));
        add(parts, gloss("#f6f4ee"), box(1.1, 0.08, 0.45, x, top + 1.63, s * (W / 2 + 0.12)));
      }
    // the pool deck: the water, the loungers
    add(parts, M_POOL(), box(3.2, 0.05, 1.6, -2.6, top + 3.0, 0));
    for (let x = -4; x < -1; x += 0.5) for (const s of [-1, 1]) add(parts, gloss("#f4b728"), rbox(0.3, 0.05, 0.7, 0.02, x, top + 3.02, s * 1.2));
    // the funnel in ZEC gold, black-topped, raked aft
    const fun = new THREE.CylinderGeometry(0.55, 0.75, 2.2, 20).scale(1.5, 1, 1).translate(-5.2, top + 4.1, 0);
    add(parts, gloss("#f4b728"), fun);
    add(parts, gloss("#16151a"), new THREE.CylinderGeometry(0.56, 0.56, 0.35, 20).scale(1.5, 1, 1).translate(-5.2, top + 5.35, 0));
    // the mast and its lights, a string of deck lights
    add(parts, steel(), spar(V(3.5, top + 3.8, 0), V(3.3, top + 6.6, 0), 0.06));
    add(parts, lamp("#ff2a1a", 2.6), new THREE.SphereGeometry(0.09, 8, 6).translate(3.3, top + 6.65, 0));
    add(parts, lamp("#fff6e0", 2.6), new THREE.SphereGeometry(0.08, 8, 6).translate(L / 2 - 0.4, top + 0.3, 0));
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      add(parts, lamp(i % 2 ? "#f4b728" : "#3ef0ff", 2), new THREE.SphereGeometry(0.05, 6, 4).translate(-4.8 + t * 8.6, top + 6.2 - Math.sin(t * Math.PI) * 1.6, 0));
    }
    return lifted(parts, 0.45);
  });
}

let pool: THREE.Material | null = null;
function M_POOL() {
  return (pool ??= Object.assign(new THREE.MeshStandardMaterial({ color: "#3ab8e0", roughness: 0.08, metalness: 0.1, emissive: "#0a4a60", emissiveIntensity: 0.4 }), { userData: { shared: true } }));
}
