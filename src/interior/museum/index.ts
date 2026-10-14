import * as THREE from "three";
import { makeScene } from "../kit";
import type { Theme } from "../../scene/theme";
import type { Floor, Interior, InteriorContext } from "../types";
import { aile } from "./aile";
import { apartments } from "./apartments";
import { memorial } from "./memorial";
import { Collection } from "./data";
import { etats } from "./etats";
import { galerie } from "./galerie";
import { hall } from "./hall";
import { FLOOR_Y, MuseumKit } from "./kit";
import { FLOORS } from "./parts";

/**
 * LOUVRE · zkSNARK MUSEUM, entered through the glass pyramid. Six levels, stacked in one scene
 * (only the one you stand on is drawn): the Hall Napoléon under the pyramid; the Grande Galerie,
 * the collection's rarest hung in gilt frames down a long vaulted gallery; the Daru staircase with
 * the winged Victory and the Salle des États where zkSNARKs #1, the original, hangs alone behind
 * glass; the Napoleon III apartments; the Aile des Apparitions, the zkSNARKs purge as a
 * sculpture of pixels and the explorer's charts; and the Memorial of the Purged, for the 676. Every painting is a real zkSNARK: hover for its name,
 * click for its data.
 */
export function buildMuseum(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0c0b0a");
  scene.environmentIntensity = 0.45;
  let hemi: THREE.HemisphereLight | null = null;
  scene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight) hemi = o;
  });
  const k = new MuseumKit(ctx, scene);
  const data = new Collection();

  const built: { spawn: THREE.Vector3; yaw: number; onData?: (d: Collection) => void; fill?: () => void }[] = [hall(k, data), galerie(k, data), etats(k, data), apartments(k, data), aile(k, data), memorial(k, data)];

  // ---- the paintings get their zkSNARKs once the collection is known -------------------------
  const idOf: (number | null)[][] = k.hangs.map((l) => l.map((h) => h.id ?? null));
  void data.ready.then((ok) => {
    k.hangs.forEach((list, f) =>
      list.forEach((h, i) => {
        const it = h.id != null ? data.byId.get(h.id) : ok && h.rank != null ? data.atRank(h.rank) : null;
        const id = it?.id ?? h.id ?? null;
        idOf[f][i] = id;
        if (id == null) return;
        k.showPortrait(f, i, id);
        if (it) k.drawLabel(f, i, ...data.label(it));
        else k.drawLabel(f, i, `zkSNARKs #${id}`, "", "");
      }),
    );
    // floors that hang by their own data (the Apparitions), then their ids for picking
    for (const b of built) b.fill?.();
    k.hangs.forEach((list, f) => list.forEach((h, i) => (idOf[f][i] = h.id ?? idOf[f][i])));
    for (const fn of onData) fn();
  });
  const onData: (() => void)[] = [];
  for (const b of built) if (b.onData) onData.push(() => b.onData!(data));

  const WHERE = FLOORS.map((x) => x.name);
  const paintingAt = (hit: THREE.Intersection) => {
    const f = k.current;
    if (hit.object === k.pictures[f] && hit.instanceId != null) return idOf[f][hit.instanceId] ?? null;
    return null;
  };
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) if (k.picks.has(x)) return x;
    return null;
  };

  let theme: Theme = ctx.theme;
  const backgrounds = [3, 30, 30, 30, 30, 30];
  const setFloor = (n: number) => {
    k.current = n;
    k.visit(n);
    k.groups.forEach((g, i) => (g.visible = i === n));
    const view = ctx.cityView("museum", backgrounds[n], 4);
    if (view) scene.background = view;
    const night = theme === "night";
    if (hemi) hemi.intensity = [1.05, 0.55, 0.6, 0.45, 0.4, 0.6][n] * (night ? 0.5 : 1);
    scene.environmentIntensity = night ? 0.22 : 0.45;
    k.setNight(night);
  };
  const setTheme = (t: Theme) => {
    theme = t;
    setFloor(k.current);
  };
  setFloor(0);

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const floors: Floor[] = FLOORS.map((x, i) => ({
    label: x.label,
    name: x.name,
    y: FLOOR_Y[i],
    spawn: new THREE.Vector3(built[i].spawn.x, FLOOR_Y[i], built[i].spawn.z),
    yaw: built[i].yaw,
  }));

  return {
    key: "museum",
    title: "LOUVRE · zkSNARK MUSEUM",
    scene,
    floors,
    colliders: (f) => k.rects[f] ?? [],
    setFloor,
    setTheme,
    groundAt(f, x, z) {
      for (const g of k.grounds[f] ?? []) {
        const h = g(x, z - 0);
        if (h != null) return FLOOR_Y[f] + h;
      }
      return null;
    },
    pickables: () => {
      const f = k.current;
      const list = k.pickables.filter((o) => k.floorOf.get(o) === f);
      const p = k.pictures[f];
      if (p) list.push(p);
      return list;
    },
    pick(hit) {
      const id = paintingAt(hit);
      if (id != null) return data.info(id, WHERE[k.current]);
      const o = find(hit.object);
      return o ? (k.picks.get(o)!(hit) ?? null) : null;
    },
    hover(hit) {
      const id = paintingAt(hit);
      if (id != null) return data.hover(id);
      const o = find(hit.object);
      return o ? (k.hovers.get(o)?.(hit) ?? null) : null;
    },
    update(dt, t, camera) {
      camera.getWorldQuaternion(camQuat);
      camera.getWorldPosition(k.cam);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of k.people[k.current]) s.update(dt, t, camQuat, camRight);
      for (const tick of k.ticks[k.current]) tick(dt, t);
    },
  };
}
