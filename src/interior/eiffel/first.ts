import * as THREE from "three";
import * as F from "../furniture";
import { std } from "../kit";
import { EiffelKit, LEVELS, P1, hw, lw } from "./kit";
import { clothTable, miniTower, parisLamp, pavilion } from "./props";

/**
 * 1 — the first floor (57 m in Paris): a broad iron ring round the void, the glass floor over it,
 * the 58 Tour Eiffel restaurant in its glass pavilion, the boutique, a buffet with bistro tables,
 * telescopes at the railing, a photographer shooting a couple against the city.
 */
export const SPAWN1 = { pos: new THREE.Vector3(11.1, 0, 15), yaw: Math.PI / 2 };

export function first(k: EiffelKit) {
  const f = 1,
    y = LEVELS[f].y,
    g = k.groups[f],
    key = "1";
  const edge = P1 - 0.3;
  // the outer railing with its iron mesh
  k.railing(f, [-edge, -edge], [edge, -edge], 1.25);
  k.railing(f, [-edge, edge], [edge, edge], 1.25);
  k.railing(f, [-edge, -edge], [-edge, edge], 1.25);
  k.railing(f, [edge, -edge], [edge, edge], 1.25);
  k.arcade(f, edge - 0.05, 3.8);
  // the legs pass through the deck
  const o = hw(y) + 0.2,
    i = hw(y) - lw(y) - 0.2;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ])
    k.rects[f].push([Math.min(sx * o, sx * i), Math.min(sz * o, sz * i), Math.max(sx * o, sx * i), Math.max(sz * o, sz * i)]);
  // the void: a glass balustrade with a brass handrail round it
  const v = 7;
  for (const [a, b] of [
    [[-v, -v], [v, -v]],
    [[-v, v], [v, v]],
    [[-v, -v], [-v, v]],
    [[v, -v], [v, v]],
  ] as [number, number][][]) {
    k.pane(g, a, b, y, 1.1, new THREE.MeshStandardMaterial({ color: "#d8f0f8", transparent: true, opacity: 0.2, roughness: 0.02, depthWrite: false }));
    k.beam(key, new THREE.Vector3(a[0], y + 1.1, a[1]), new THREE.Vector3(b[0], y + 1.1, b[1]), 0.07, k.brass);
    k.rects[f].push([Math.min(a[0], b[0]) - 0.1, Math.min(a[1], b[1]) - 0.1, Math.max(a[0], b[0]) + 0.1, Math.max(a[1], b[1]) + 0.1]);
  }
  // lift in the east pillar: up to the second floor, down to the esplanade
  k.liftDoor(f, i - 0.1, 15, -Math.PI / 2, 2, { name: "Lift · Pilier Est" });
  k.liftDoor(f, 15, i - 0.1, Math.PI, 0, { name: "Lift · Pilier Est" });
  k.label(f, "1er ÉTAGE · 57 m", i - 0.15, 3.3, 15, { h: 0.34, color: "#f4b728", rot: -Math.PI / 2 });

  // ---- 58 TOUR EIFFEL: the glass pavilion on the south side ------------------------------------------
  const roof = std("#3a2c24", 0.7, 0.3);
  pavilion(k, f, -10, 11, 10, 16.9, 3.4, [{ side: "n", at: 0, w: 2 }], roof);
  k.label(f, "58 TOUR EIFFEL", 0, 3.0, 10.9, { h: 0.42, color: "#f4b728", rot: Math.PI });
  // parquet and a warm ceiling inside
  const parquet = new THREE.Mesh(new THREE.PlaneGeometry(19.8, 5.7), std("#6a4630", 0.6));
  parquet.rotation.x = -Math.PI / 2;
  parquet.position.set(0, y + 0.01, 13.95);
  g.add(parquet);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(19.8, 5.7), std("#e8dcc4", 0.9));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, y + 3.38, 13.95);
  g.add(ceil);
  const tables: [number, number][] = [
    [-8, 12.6],
    [-4.5, 12.6],
    [4.5, 12.6],
    [8, 12.6],
    [-8, 15.6],
    [-4.5, 15.6],
    [0, 15.6],
    [4.5, 15.6],
    [8, 15.6],
  ];
  const diners = [5821, 6174, 2048, 4096, 1201, 3333, 8080, 7007, 911, 1717, 2525, 6464];
  let di = 0;
  tables.forEach(([x, z], n) => {
    clothTable(k, f, x, z, 0.45);
    for (const s of [-1, 1]) {
      k.put(f, "chair58", () => F.chair("#7a2a30"), x + s * 0.75, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, { solid: false });
      if (n % 3 !== 2 && di < diners.length) void k.person(f, diners[di++], [x + s * 0.7, z], n % 2 ? "Couple" : "Visitor", { sit: true, dy: 0.42, face: new THREE.Vector3(-s, 0, 0) });
    }
    if (n < 6) k.put(f, "pend58", () => F.pendant(0.8, "#ffd9a0"), x, z, 0, { dy: 2.55, solid: false });
  });
  void k.person(f, 5858, [0, 12.4], "Waiter", { wander: [[0, 12.4], [-6, 14.1], [6, 14.1], [-2, 14.1], [2, 14.1]] });
  // the bar at the east end
  k.put(f, "bar58", () => F.barCounter(2.4, "#f4b728"), 8.2, 14.1, -Math.PI / 2);

  // ---- the boutique (Pavillon Ferrié), north side -----------------------------------------------------
  pavilion(k, f, -10, -16.9, 10, -11, 3.2, [{ side: "s", at: 0, w: 2 }], roof);
  k.label(f, "BOUTIQUE", 0, 2.85, -10.9, { h: 0.42, color: "#ffd28a" });
  const shelfM = std("#4a3020", 0.6);
  const bronze = std("#8a6a3a", 0.35, 0.85),
    goldM = std("#d8b060", 0.3, 0.9),
    silver = std("#c8ccd4", 0.25, 0.9);
  for (const x of [-8, -4.5, 4.5, 8]) {
    k.slab(key, 2.6, 2.2, 0.5, x, y, -16.4, shelfM);
    for (let s = 0; s < 4; s++) {
      k.slab(key, 2.6, 0.04, 0.55, x, y + 0.4 + s * 0.5, -16.35, std("#d8ccb0", 0.7));
      for (let j = 0; j < 7; j++) miniTower(k, key, x - 1.1 + j * 0.36, y + 0.44 + s * 0.5, -16.2, 0.16 + (s % 2) * 0.12, [bronze, goldM, silver][(j + s) % 3]);
    }
    k.rects[f].push([x - 1.35, -16.8, x + 1.35, -16.1]);
  }
  // a round display table of big towers, the till, postcards
  const disp = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.8, 20), std("#2a2420", 0.6));
  disp.position.set(-4, y + 0.4, -13.6);
  g.add(disp);
  for (let j = 0; j < 5; j++) miniTower(k, key, -4 + Math.cos(j * 1.25) * 0.5, y + 0.8, -13.6 + Math.sin(j * 1.25) * 0.5, 0.35 + (j % 2) * 0.25, j % 2 ? goldM : bronze);
  k.rects[f].push([-4.9, -14.5, -3.1, -12.7]);
  k.put(f, "till", () => F.receptionDesk(), 5, -13.4, 0);
  void k.person(f, 1430, [5, -14.4], "Vendor", { title: "Shop assistant" });
  const cards = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5), std("#c8ccd4", 0.4, 0.6));
  cards.position.set(1.5, y + 0.8, -15.6);
  g.add(cards);
  void k.person(f, 3210, [-6, -13], "Visitor", { wander: [[-6, -13], [-2, -14], [2, -13.5], [7, -14.5]] });

  // ---- west: the buffet, bistro tables under the iron ---------------------------------------------------
  const kx = -16.4;
  k.slab(key, 1.6, 1.1, 5, kx, y, 0, std("#1f3a2c", 0.5, 0.3));
  k.slab(key, 1.8, 0.08, 5.2, kx, y + 1.1, 0, k.brass);
  k.slab(key, 1.8, 0.2, 5.6, kx - 0.2, y + 2.6, 0, std("#c83a3a", 0.7));
  k.slab(key, 0.1, 1.5, 0.1, kx + 0.75, y + 1.1, -2.6, k.ironDark);
  k.slab(key, 0.1, 1.5, 0.1, kx + 0.75, y + 1.1, 2.6, k.ironDark);
  k.label(f, "BUFFET · CAFÉ", kx + 0.95, 2.95, 0, { h: 0.32, color: "#ffe0a0", rot: Math.PI / 2 });
  k.put(f, "coffee", () => F.coffeeMachine(), kx - 0.3, -1.2, Math.PI / 2, { dy: 1.18, solid: false });
  k.rects[f].push([kx - 0.9, -2.7, kx + 0.9, 2.7]);
  void k.person(f, 2468, [kx - 0.4, 0.8], "Waiter", { title: "Barista", face: new THREE.Vector3(1, 0, 0) });
  for (const [x, z] of [
    [-12.5, -5],
    [-12.5, 5],
    [-10, -2],
    [-10, 2.6],
  ] as [number, number][]) {
    k.put(f, "bistro", () => F.bistroTable(), x, z);
    k.put(f, "bistroChair", () => F.chair("#2a5a3a"), x - 0.6, z, Math.PI / 2, { solid: false });
    k.put(f, "bistroChair", () => F.chair("#2a5a3a"), x + 0.6, z, -Math.PI / 2, { solid: false });
  }
  void k.person(f, 6201, [-12.5 - 0.55, -5], "Visitor", { sit: true, dy: 0.42, face: new THREE.Vector3(1, 0, 0) });
  void k.person(f, 6202, [-10 + 0.55, 2.6], "Visitor", { sit: true, dy: 0.42, face: new THREE.Vector3(-1, 0, 0) });
  parisLamp(k, f, -14, -8.6, 2.6);
  parisLamp(k, f, -14, 8.6, 2.6);
  k.telescope(f, -18.6, -7, Math.PI / 2, 1);
  k.telescope(f, -18.6, 7, Math.PI / 2, 2);

  // ---- east: the terrace, telescopes, a photographer and a couple ---------------------------------------
  k.telescope(f, 18.6, -5, -Math.PI / 2, 3);
  k.telescope(f, 18.6, 5, -Math.PI / 2, 4);
  k.telescope(f, 0, -18.6, 0, 5);
  k.put(f, "eBench1", F.bench, 15.2, -9, Math.PI / 2);
  k.put(f, "eBench1", F.bench, 15.2, 9, Math.PI / 2);
  void k.person(f, 1914, [17.4, -0.4], "Couple", { face: new THREE.Vector3(-1, 0, 0) });
  void k.person(f, 1915, [17.4, 0.45], "Couple", { face: new THREE.Vector3(-1, 0, 0) });
  void k.person(f, 1839, [13.2, 0], "Photographer", { face: new THREE.Vector3(1, 0, 0) });
  const cam = new THREE.Group();
  cam.position.set(13.55, y + 1.45, 0);
  const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.22), std("#141418", 0.4, 0.4));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), std("#202028", 0.3, 0.6));
  lens.rotation.z = Math.PI / 2;
  lens.position.x = 0.13;
  const flash = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6), toneMapped: false }));
  flash.position.set(0.02, 0.1, 0);
  cam.add(camBody, lens, flash);
  g.add(cam);
  k.light(f, 14, 1.6, 0, "#ffffff", 0, 6);
  const flashLight = k.lightGroups[f].children[k.lightGroups[f].children.length - 1] as THREE.PointLight;
  let next = 3;
  k.ticks[f].push((dt) => {
    next -= dt;
    const on = next < 0 && next > -0.12;
    flash.visible = on;
    flashLight.intensity = on ? 30 : 0;
    if (next < -0.12) next = 4 + Math.random() * 4;
  });
  flash.visible = false;
  void k.person(f, 4321, [10.5, -6], "Visitor", { wander: [[10.5, -6], [16, -4], [16, 6], [11, 8], [-2, -9.3], [-12, 9]] });
  void k.person(f, 4322, [-3, 9.4], "Kid", { bob: 3, wander: [[-3, 9.4], [3, -9.4], [-9.2, 0], [9.2, 2]] });
  void k.person(f, 4323, [8.6, -8], "Visitor", { face: new THREE.Vector3(-1, 0, 0) });
  void k.person(f, 4324, [0, -9.2], "Kid", { face: new THREE.Vector3(0, 0, 1) });

  // lights: the restaurant, the boutique, the buffet, the terrace (and the flash above)
  k.light(f, 0, 3, 14, "#ffd9a0", 10, 16);
  k.light(f, 0, 2.8, -14, "#fff0d8", 8, 14);
  k.light(f, -14, 2.6, 0, "#ffe0b0", 7, 12);
  k.light(f, 14, 3, 0, "#ffd28a", 6, 14);
}
