import * as THREE from "three";
import { makeScene } from "../kit";
import type { Interior, InteriorContext } from "../types";
import type { Theme } from "../../scene/theme";
import { cast } from "./cast";
import { cellHouse } from "./hall";
import { cellMatrix, complement, FACES, FLOORS, GALLERY, PrisonKit } from "./kit";
import { diningHall, library, timesSquare, wardenOffice } from "./rooms";

/**
 * The ZEC STATE PENITENTIARY from the inside: Alcatraz's cell house. Broadway between B and C
 * blocks, Michigan Avenue and Seedy Street outside them, A block's old cells and D block's
 * isolation cells against the walls, three tiers of barred cells with steel walkways, the west
 * gun gallery over the door, Times Square and its clock, the dining hall with the tear gas in its
 * ceiling, the library, the warden's office. The famous falls of crypto sit behind their plates.
 */
export function buildPrison(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0d0e10");
  scene.traverse((o) => o instanceof THREE.HemisphereLight && (o.intensity = 0.6));
  scene.environmentIntensity = 0.25;
  const k = new PrisonKit(ctx, scene);

  cellHouse(k);
  timesSquare(k);
  diningHall(k);
  library(k);
  wardenOffice(k);
  cast(k);
  k.b.flush(k.root);
  for (const i of [k.bars, k.flats, k.posts]) i.flush(k.root);

  // ---- walkable plan → colliders ----
  k.open[0].push(
    [-3, -41.7, 3, -0.3], // Broadway
    [-13, -41.7, -9.2, -6.1], // Michigan Avenue
    [-10, -7.75, 15.7, -0.3], // the cutoff, under the gun gallery
    [-15.7, -5.7, -10.4, -0.3], // warden's office
    [-10.5, -3.9, -9.9, -2.7], // its door
    [9.2, -34.2, 13, -0.3], // Seedy Street
    [9.2, -34.2, 15.7, -30.25], // the end of D block
    [-15.7, -41.7, 8.6, -32.25], // Times Square
    [-15.7, -34.2, 13, -32.25],
    [9, -41.7, 15.7, -34.6], // library
    [10.6, -34.7, 12.2, -34.1], // its door
    [-1.5, -42.4, 1.5, -41.6], // dining hall door
    [-15.7, -57.7, 15.7, -42.4], // dining hall
  );
  const bounds: [number, number, number, number][] = [
    [-16, -62, 16, 0],
    [-16, -34, 16, -5],
    [-16, -34, 16, -5],
    [-16, -2.2, 16, 0.2],
  ];
  const rects = FLOORS.map((_, f) => [...complement(bounds[f], k.open[f]), ...k.solid[f]]);

  // ---- light: skylights by day, hanging lamps, a few real lights ----
  const sun = new THREE.DirectionalLight("#fff4e0", 1.3);
  sun.position.set(6, 30, 8);
  sun.target.position.set(0, 0, -20);
  scene.add(sun, sun.target);
  for (const [x, y, z, c, i, d] of [
    [0, 8.6, -12, "#ffe8c8", 40, 26],
    [0, 8.6, -27, "#ffe8c8", 40, 26],
    [-4, 6, -37, "#ffe2b8", 26, 20],
    [-6, 4.2, -51, "#eef4ff", 22, 18],
    [6, 4.2, -51, "#eef4ff", 22, 18],
    [-13, 2.8, -3, "#ffd8a0", 6, 8],
  ] as const) {
    const l = new THREE.PointLight(c, i, d, 1.2);
    l.position.set(x, y, z);
    scene.add(l);
  }

  // ---- people: guards, the warden, the inmates nobody has heard of, the kitchen ----
  const GUARD = ["Keep moving.", "Count in five.", "Back from the bars.", "No talking on Broadway."];
  const yard = (x: number, z: number) => [x, z] as [number, number];
  void k.person(4242, [0, 0, -20], "Guard · Broadway", { cap: true, talk: GUARD, wander: [yard(0, -10), yard(0, -18), yard(0, -26), yard(0, -34), yard(-1, -38)] });
  void k.person(4243, [-11.1, 0, -14], "Guard · Michigan Avenue", { cap: true, talk: GUARD, wander: [yard(-11.1, -10), yard(-11.1, -22), yard(-11.1, -31), yard(-8, -36)] });
  void k.person(4244, [11.1, 0, -20], "Guard · Seedy Street", { cap: true, talk: GUARD, wander: [yard(11.1, -9), yard(11.1, -20), yard(11.1, -31), yard(12, -33)] });
  void k.person(4245, [2, 0, -40.6], "Guard · Times Square", { cap: true, talk: ["Dining hall opens at the next block.", "Single file."], face: new THREE.Vector3(0, 0, 1) });
  void k.person(4246, [0, GALLERY.y, -1.0], "Guard · gun gallery", { cap: true, talk: ["Eyes on Broadway.", "Nobody moves."], wander: [yard(-8, -1.0), yard(14, -1.0), yard(3, -1.0)], face: new THREE.Vector3(0, 0, -1) });
  void k.person(4247, [-2.45, 2.75, -20], "Guard · second tier", { cap: true, talk: GUARD, wander: [yard(-2.45, -10), yard(-2.45, -30), yard(2.45, -20), yard(2.45, -10)] });
  void k.person(4248, [3, 0, -43.6], "Guard · dining hall", { cap: true, talk: ["Ten to a table.", "Eat what you take."], face: new THREE.Vector3(0, 0, -1) });
  void k.person(1963, [-14.8, 0.42, -3.3], "Warden", { cap: true, sit: true, face: new THREE.Vector3(1, 0, 0), talk: ["Welcome to the ZEC State Penitentiary.", "Every cell here is transparent. Ironic.", "Nobody escapes the chain."] });

  const INMATE = ["Shielded or not, the food's the same.", "I reused a t-address. Once.", "Lights out at the next block.", "Pass the salt. Privately.", "My lawyer says Orchard is the way out."];
  for (const [fi, i, t, id] of [
    [2, 3, 1, 1201],
    [2, 12, 2, 2318],
    [3, 4, 0, 3377],
    [3, 10, 1, 5120],
    [3, 2, 2, 6031],
    [1, 8, 0, 7004],
    [4, 6, 0, 7781],
    [5, 2, 0, 8402],
    [4, 11, 1, 9150],
    [0, 5, 1, 9911],
  ] as const) {
    const f = FACES[fi];
    const p = new THREE.Vector3(0.1, 0, -0.75).applyMatrix4(cellMatrix(f, i, t));
    void k.person(id, [p.x, p.y, p.z], "Inmate", { face: new THREE.Vector3(f.dir, 0, 0), talk: INMATE, near: 5 });
  }
  // supper: inmates at the tables, the cook at the range, the librarian at his desk
  for (const [x, z, s, id] of [
    [-12.9, -45.88, 1, 2101],
    [-11.8, -44.52, -1, 2202],
    [-4.4, -48.6 - 0.68, 1, 2303],
    [4.4, -47.92, -1, 2404],
    [8.6, -52.68, 1, 2505],
    [12.0, -54.72, -1, 2606],
    [-8.0, -55.4 - 0.68, 1, 2707],
  ] as const)
    void k.person(id, [x, 0.42, z], "Inmate · supper", { sit: true, face: new THREE.Vector3(0, 0, s), talk: ["Beef stew again.", "Don't look up. The canisters.", "Eat fast, talk less."], near: 4 });
  void k.person(3131, [-2, 0, -59.4], "Cook", { face: new THREE.Vector3(0, 0, 1), talk: ["Stew's on.", "One tray each."], wander: [yard(-6, -59.4), yard(-2, -59.4), yard(3, -59.4), yard(7, -59.4)] });
  void k.person(1934, [9.6, 0.42, -36.2], "Inmate librarian", { sit: true, face: new THREE.Vector3(1, 0, 0), talk: ["Two books a week.", "The protocol spec is always out."] });

  // ---- floors, view, theme ----
  const setFloor = (n: number) => {
    k.current = n;
    const view = ctx.cityView("prison", FLOORS[n].y + 1.6, 3);
    if (view) scene.background = view;
  };
  const setTheme = (t: Theme) => {
    const day = t === "day";
    if (k.sky) k.sky.color.set(day ? "#dfe9f2" : "#1c2a40").multiplyScalar(day ? 1.6 : 1);
    if (k.shafts) k.shafts.visible = day;
    sun.intensity = day ? 1.3 : 0.25;
    scene.traverse((o) => o instanceof THREE.HemisphereLight && (o.intensity = day ? 0.6 : 0.38));
    sun.color.set(day ? "#fff4e0" : "#9ab0e0");
  };
  setTheme(ctx.theme);
  setFloor(0);

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) if (k.picks.has(x)) return x;
    return null;
  };
  return {
    key: "prison",
    title: "ZEC STATE PENITENTIARY",
    scene,
    floors: FLOORS.map((f, i) => ({
      label: f.label,
      name: f.name,
      y: f.y,
      spawn: [new THREE.Vector3(0, 0, -1.5), new THREE.Vector3(0, f.y, -7.45), new THREE.Vector3(0, f.y, -7.45), new THREE.Vector3(0, f.y, -1.0)][i],
      yaw: 0,
    })),
    colliders: (f) => rects[f],
    setFloor,
    setTheme,
    pickables: () => k.pickables,
    pick: (hit) => {
      const o = find(hit.object);
      return o ? (k.picks.get(o)!(hit) ?? null) : null;
    },
    hover: (hit) => {
      const o = find(hit.object);
      return o ? (k.hovers.get(o) ?? null) : null;
    },
    update(dt, t, camera) {
      k.eye.copy(camera.position);
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of k.people) s.update(dt, t, camQuat, camRight);
      for (const tick of k.ticks) tick(dt, t);
    },
  };
}
