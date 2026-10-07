import * as THREE from "three";
import * as F from "../furniture";
import { std } from "../kit";
import { EiffelKit, LEVELS, PT } from "./kit";

/**
 * S — the summit, the windy open-air top: a tall wire-mesh fence all round, Gustave Eiffel's little
 * office in the middle (seen through its windows: Eiffel, his daughter Claire and Thomas Edison as
 * wax zkSNARKs, the phonograph), the champagne bar, telescopes at the corners, the campanile with
 * the rotating beacon overhead, the antenna and its flag snapping in the wind.
 */
export const SPAWN3 = { pos: new THREE.Vector3(0, 0, -4.4), yaw: 0 };

export function summit(k: EiffelKit) {
  const f = 3,
    y = LEVELS[f].y,
    g = k.groups[f],
    key = "3";
  const edge = PT - 0.25;
  // the tall wire-mesh fence (the top is caged in)
  k.railing(f, [-edge, -edge], [edge, -edge], 2.5);
  k.railing(f, [-edge, edge], [edge, edge], 2.5);
  k.railing(f, [-edge, -edge], [-edge, edge], 2.5);
  k.railing(f, [edge, -edge], [edge, edge], 2.5);
  // the fence bends inward at the top
  for (const s of [-1, 1])
    for (let u = -edge; u <= edge + 0.01; u += 1.4) {
      k.beam(key, new THREE.Vector3(u, y + 2.5, s * edge), new THREE.Vector3(u, y + 3.1, s * (edge - 0.5)), 0.05, k.ironDark);
      k.beam(key, new THREE.Vector3(s * edge, y + 2.5, u), new THREE.Vector3(s * (edge - 0.5), y + 3.1, u), 0.05, k.ironDark);
    }
  // deck boards
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(PT * 2 - 0.4, PT * 2 - 0.4), std("#6a5a4a", 0.9));
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = y + 0.01;
  g.add(deck);

  // ---- the core: lift lobby north, Gustave Eiffel's office south --------------------------------------
  const C = 3.0,
    H = 3.0;
  const wallM = std("#5a4232", 0.7, 0.3);
  k.slab(key, C * 2 + 0.3, 0.25, C * 2 + 0.3, 0, y + H, 0, k.ironDark);
  k.rects[f].push([-C - 0.1, -C - 0.1, C + 0.1, C + 0.1]);
  // north half: solid wall with the lift
  k.slab(key, C * 2, H, 0.2, 0, y, -C, wallM);
  k.slab(key, 0.2, H, C, -C, y, -C / 2, wallM);
  k.slab(key, 0.2, H, C, C, y, -C / 2, wallM);
  k.slab(key, C * 2, H, 0.2, 0, y, 0, wallM);
  k.liftDoor(f, 0, -C - 0.12, Math.PI, 2, { name: "Lift · Sommet" });
  k.label(f, "SOMMET · 276 m", 0, 3.25, -C - 0.15, { h: 0.3, color: "#f4b728", rot: Math.PI });
  // south half: the office behind windows (south, east, west)
  const winM = new THREE.MeshStandardMaterial({ color: "#cfe0ea", transparent: true, opacity: 0.12, roughness: 0.02, depthWrite: false });
  k.pane(g, [-C, C], [C, C], y + 0.9, 1.7, winM);
  k.pane(g, [C, 0], [C, C], y + 0.9, 1.7, winM);
  k.pane(g, [-C, 0], [-C, C], y + 0.9, 1.7, winM);
  // sills, mullions, the green-painted woodwork
  const wood = std("#2c4a36", 0.6, 0.2);
  k.slab(key, C * 2, 0.9, 0.2, 0, y, C, wood);
  k.slab(key, 0.2, 0.9, C, C, y, C / 2, wood);
  k.slab(key, 0.2, 0.9, C, -C, y, C / 2, wood);
  k.slab(key, C * 2, 0.4, 0.2, 0, y + 2.6, C, wood);
  k.slab(key, 0.2, 0.4, C, C, y + 2.6, C / 2, wood);
  k.slab(key, 0.2, 0.4, C, -C, y + 2.6, C / 2, wood);
  for (const u of [-C, -C / 3, C / 3, C]) k.slab(key, 0.1, 1.7, 0.1, u, y + 0.9, C, wood);
  for (const z of [0, C / 2, C])
    for (const s of [-1, 1]) k.slab(key, 0.1, 1.7, 0.1, s * C, y + 0.9, z, wood);
  // the office inside: wallpaper, carpet, desk, bookcase, phonograph, portrait
  const paper = std("#7a5a3a", 0.85);
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(C * 2 - 0.2, C - 0.2), std("#7a2a2a", 0.95));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, y + 0.02, C / 2);
  g.add(carpet);
  k.slab(key, C * 2 - 0.25, H - 0.05, 0.05, 0, y, 0.13, paper);
  const ceilO = new THREE.Mesh(new THREE.PlaneGeometry(C * 2, C), std("#e8dcc0", 0.9));
  ceilO.rotation.x = Math.PI / 2;
  ceilO.position.set(0, y + H - 0.02, C / 2);
  g.add(ceilO);
  k.put(f, "eDesk", () => F.desk(3), -1.2, 1.3, 0, { solid: false });
  k.put(f, "eShelf", () => F.bookshelf(5, 16), 1.6, 0.35, 0, { solid: false });
  k.put(f, "eArm", () => F.armchair("#6a3a2a"), 1.8, 1.9, -Math.PI / 2, { solid: false });
  k.put(f, "eLamp", () => F.floorLamp(), -2.6, 0.5, 0, { solid: false });
  // Edison's phonograph: a box and its brass horn
  const pg = new THREE.Group();
  pg.position.set(-0.4, y + 0.76, 1.3);
  const pbox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.22), std("#4a2c1a", 0.5));
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 16, 1, true), std("#c8a256", 0.25, 0.9));
  horn.rotation.z = -Math.PI / 2.6;
  horn.position.set(0.18, 0.3, 0);
  pg.add(pbox, horn);
  g.add(pg);
  k.pick(f, pbox, "<b>Phonograph</b><span>Edison, 1889</span>", () => ({ eyebrow: "Bureau de Gustave Eiffel", title: "Edison's phonograph", stats: [["Year", "1889"], ["Height", "276 m"], ["Block", k.height ? `#${k.height.toLocaleString("en-US")}` : "…"]] }));
  // the wax figures (zkSNARKs): Eiffel at his desk, Claire, Edison
  void k.person(f, 1832, [-1.2, 0.7], "Gustave", { title: "Gustave Eiffel (wax)", face: new THREE.Vector3(0, 0, 1) });
  void k.person(f, 1847, [0.6, 2.2], "Edison", { title: "Thomas Edison (wax)", face: new THREE.Vector3(-1, 0, 0) });
  void k.person(f, 1864, [1.8, 1.9], "Claire", { title: "Claire Eiffel (wax)", sit: true, dy: 0.42, face: new THREE.Vector3(-1, 0, 0) });
  k.label(f, "BUREAU DE GUSTAVE EIFFEL", 0, 2.75, C + 0.12, { h: 0.2, color: "#e8d8b0", bg: "#2c4a36" });
  const officeLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), k.glow("#ffe2b0", 1.6, 2.4));
  officeLamp.position.set(0, y + 2.6, 1.5);
  g.add(officeLamp);

  // ---- the champagne bar on the east side ---------------------------------------------------------------
  k.put(f, "champBar", () => F.barCounter(3.4, "#f4b728"), 6.6, 0, -Math.PI / 2);
  k.label(f, "BAR À CHAMPAGNE", 7.85, 2.3, 0, { h: 0.3, color: "#f4b728", rot: -Math.PI / 2 });
  k.slab(key, 0.25, 2.1, 3.6, 7.9, y, 0, std("#1c1a20", 0.5));
  k.rects[f].push([7.6, -1.8, 8.4, 1.8]);
  void k.person(f, 1789, [7.4, 0.3], "Bartender", { face: new THREE.Vector3(-1, 0, 0) });
  // bottles in ice buckets, coupes on the counter
  for (const z of [-1.1, 0.9]) {
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.2, 12), k.chrome);
    bucket.position.set(6.6, y + 1.22, z);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.32, 10), std("#1e3a24", 0.2, 0.4));
    bottle.position.set(6.6, y + 1.36, z);
    const foil = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.08, 8), std("#d8b060", 0.3, 0.9));
    foil.position.set(6.6, y + 1.55, z);
    g.add(bucket, bottle, foil);
  }
  for (let i = 0; i < 6; i++) {
    const coupe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.005, 0.07, 10), new THREE.MeshStandardMaterial({ color: "#f4e0a0", transparent: true, opacity: 0.6, roughness: 0.05 }));
    coupe.position.set(6.4, y + 1.2, -0.5 + i * 0.2);
    g.add(coupe);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 3.4), new THREE.MeshBasicMaterial({ visible: false }));
  bar.position.set(6.6, y + 0.55, 0);
  g.add(bar);
  const drinks = ["a coupe of brut", "a glass of rosé", "a Shielded Spritz", "a Kir Royal", "a flute of blanc de blancs"];
  let served = 0;
  k.pick(f, bar, "<b>Bar à champagne</b><span>order</span>", () => ({
    eyebrow: "Bar à champagne · 276 m",
    title: `Here's ${drinks[served++ % drinks.length]} 🥂`,
    stats: [
      ["Brut", "€15"],
      ["Rosé", "€22"],
      ["Block", k.height ? `#${k.height.toLocaleString("en-US")}` : "…"],
    ],
  }));
  for (const z of [-2.4, 2.4]) {
    const tbl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.05, 12), std("#1c1a20", 0.4, 0.4));
    tbl.position.set(4.6, y + 0.52, z);
    g.add(tbl);
    k.rects[f].push([4.3, z - 0.3, 4.9, z + 0.3]);
  }
  void k.person(f, 2014, [4.6, -3.0], "Couple", { face: new THREE.Vector3(0, 0, 1) });
  void k.person(f, 2015, [4.6, -1.8], "Couple", { face: new THREE.Vector3(0, 0, -1) });
  // the proposal on the west side: one kneels, the other has her hands to her face
  void k.person(f, 1402, [-6.2, -0.5], "Couple", { face: new THREE.Vector3(0, 0, 1) });
  void k.person(f, 1401, [-6.2, 0.6], "Couple", { sit: true, dy: 0.25, face: new THREE.Vector3(0, 0, -1) });
  void k.person(f, 1403, [-4.2, 5], "Photographer", { face: new THREE.Vector3(-1, 0, -1) });
  void k.person(f, 3500, [0, 6.6], "Visitor", { wander: [[0, 6.6], [-6, 6.6], [6, 6.6], [-6.6, -6], [6, -6.4]] });
  void k.person(f, 3501, [-5, -6.5], "Visitor", { face: new THREE.Vector3(0, 0, -1) });

  // telescopes at the corners
  k.telescope(f, -7.4, -7.4, Math.PI / 4, 1);
  k.telescope(f, 7.4, -7.4, -Math.PI / 4, 2);
  k.telescope(f, -7.4, 7.4, (Math.PI * 3) / 4, 3);
  k.telescope(f, 7.4, 7.4, (-Math.PI * 3) / 4, 4);

  // ---- overhead: the campanile, the beacon, the antenna, the flag ------------------------------------------
  const top = y + H + 0.25;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    k.beam(key, new THREE.Vector3(sx * C, top, sz * C), new THREE.Vector3(sx * 0.8, top + 4.4, sz * 0.8), 0.18, k.ironDark);
    k.beam(key, new THREE.Vector3(sx * C * 0.6, top + 1.6, sz * C * 0.6), new THREE.Vector3(-sx * C * 0.6, top + 1.6, sz * C * 0.6), 0.08, k.ironDark);
  }
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.1, 12), k.glow("#fff1c8", 1.5, 3.2));
  lantern.position.set(0, top + 5, 0);
  g.add(lantern);
  k.slab(key, 1.9, 0.15, 1.9, 0, top + 4.4, 0, k.ironDark);
  k.slab(key, 1.9, 0.15, 1.9, 0, top + 5.55, 0, k.ironDark);
  // the rotating beacon: two long soft beams sweeping the city
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff0c0").multiplyScalar(1.4), transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const beacon = new THREE.Group();
  beacon.position.set(0, top + 5, 0);
  for (const s of [0, Math.PI]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(5, 90, 20, 1, true), beamMat);
    cone.geometry.translate(0, -45, 0);
    cone.rotation.z = Math.PI / 2 + 0.03;
    cone.rotation.y = s;
    cone.raycast = () => {};
    beacon.add(cone);
  }
  g.add(beacon);
  // the antenna mast with red and white bands
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.015, 0.18 - i * 0.015, 2, 8), std(i % 2 ? "#e8e4dc" : "#b83a32", 0.6, 0.3));
    seg.position.set(0, top + 6.6 + i * 2, 0);
    g.add(seg);
  }
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.3), toneMapped: false }));
  red.position.set(0, top + 17.7, 0);
  g.add(red);
  // the tricolour, snapping in the wind
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.6, 16, 6);
  flagGeo.translate(1.2, 0, 0);
  const tri = document.createElement("canvas");
  tri.width = 96;
  tri.height = 64;
  const tc = tri.getContext("2d")!;
  ["#1f3a8a", "#f4f4f4", "#d02a2a"].forEach((c, i) => {
    tc.fillStyle = c;
    tc.fillRect(i * 32, 0, 32, 64);
  });
  const tt = new THREE.CanvasTexture(tri);
  tt.colorSpace = THREE.SRGBColorSpace;
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: tt, side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(0.15, top + 15.2, 0);
  g.add(flag);
  const base = (flagGeo.attributes.position.array as Float32Array).slice();

  // wind streaks rushing past the cage
  const N = 60;
  const streak = new Float32Array(N * 6);
  const sp = Array.from({ length: N }, () => ({ x: (Math.random() - 0.5) * 40, y: y + Math.random() * 10, z: (Math.random() - 0.5) * 30, v: 9 + Math.random() * 8 }));
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(streak, 3)), new THREE.LineBasicMaterial({ color: "#e8f0ff", transparent: true, opacity: 0.18, depthWrite: false }));
  lines.frustumCulled = false;
  g.add(lines);

  k.ticks[f].push((dt, t) => {
    beacon.rotation.y = t * 0.6;
    const p = flagGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3];
      p.setZ(i, Math.sin(x * 2.2 - t * 7) * 0.18 * (x / 2.4) + Math.sin(t * 3 + x) * 0.05 * (x / 2.4));
    }
    p.needsUpdate = true;
    flagGeo.computeVertexNormals();
    for (let i = 0; i < N; i++) {
      const s = sp[i];
      s.x += s.v * dt;
      if (s.x > 22) {
        s.x = -22;
        s.y = y + Math.random() * 10;
        s.z = (Math.random() - 0.5) * 30;
      }
      const yy = s.y + Math.sin(t * 2 + i) * 0.2;
      streak.set([s.x, yy, s.z, s.x + 1.6, yy + 0.05, s.z], i * 6);
    }
    (lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  k.light(f, 0, 2.5, 1.5, "#ffd9a0", 6, 6);
  k.light(f, 6, 2.6, 0, "#ffd28a", 6, 10);
  k.light(f, -5, 2.6, 0, "#fff0d8", 4, 12);
  k.light(f, 0, 9.5, 0, "#fff1c8", 8, 16);
}
