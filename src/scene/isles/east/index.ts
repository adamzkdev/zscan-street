import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CURB } from "../../city/plan";
import { kitGeos, kitMeshes, mergeKit, type KitGeos } from "../../real/kitobj";
import { carObject, type CarKind } from "../../real/cars";
import { kBeachBar, kBeachSet, kLifeguard, kVolleyNet, type KSlot, type KW } from "../../real/keysreal";
import { keysMat } from "../../real/keysmats";
import { hex, Kit, type V2, type V3 } from "../../real/lmkit";
import { placeProps, type PropSpot } from "../../real/props";
import { plantTrees, type TreeSpot } from "../../real/trees";
import type { Box, IsleContent, IsleCtx, IsleFacade } from "../types";
import { ZB, ZBEACH, ZDX, ZLAND, ZX, ZZ } from "./plan";

/**
 * ZAIBA's content (the island east of the city, ./plan.ts): its landmarks and its town, in the
 * realistic kit (src/scene/real/lmkit.ts) — every building's front door faces its street (a glazed
 * lobby, its canopy lit at night; the game's E walks in) — its beach under the Rainbow Bridge, the
 * boardwalk, Seaside Park, lamps and trees along the streets, cars parked at the kerbs.
 *
 *  - ZTV: two wings joined by a lattice of sky corridors, the great titanium sphere hung in it;
 *  - Zaiba Decks: the boardwalk mall facing the beach, its timber terraces;
 *  - Shield City: the mall with its glass atrium on Rainbow Boulevard;
 *  - Palette Town: the arcaded hall, and the Zaiba Wheel (a hundred metres, lit in rainbow at night);
 *  - Big Proof: the convention hall's four upturned pyramids on their stems;
 *  - the Telecom Gate (two towers joined high up), Hotel Zaiba, the Heights' residential towers,
 *    mid-rise flats along Ariake Street, shops along Seaside Road.
 */

type Face = "s" | "n" | "e" | "w";
const OUT: Record<Face, [number, number]> = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
const Y0 = CURB;

/** The island's geometry by sector (one set of meshes each, culled on its own). */
class Sectors {
  private parts = new Map<string, KitGeos[]>();
  add(g: KitGeos, x: number, z: number) {
    const k = `${x < 850 ? 0 : 1},${z < -156 ? 0 : 1}`;
    const l = this.parts.get(k);
    if (l) l.push(g);
    else this.parts.set(k, [g]);
  }
  build(parent: THREE.Object3D) {
    for (const [, list] of this.parts) {
      const merged = mergeKit(list);
      const box = new THREE.Box3();
      for (const g of Object.values(merged)) if (g) (g.computeBoundingBox(), box.union(g.boundingBox!));
      const c = box.getCenter(new THREE.Vector3()).setY(0);
      for (const g of Object.values(merged)) if (g) (g.translate(-c.x, 0, -c.z), g.computeBoundingSphere());
      const grp = kitMeshes(merged);
      grp.position.copy(c);
      grp.name = "zaiba:buildings";
      parent.add(grp);
    }
  }
}

/** A lit board with a name on it (one draw: a canvas on a plane), facing `face`. */
function sign(text: string, w: number, h: number, color: string, bg = "rgba(0,0,0,0)") {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = Math.round((1024 * h) / w);
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = color;
  g.font = `800 ${Math.round(c.height * 0.72)}px "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height * 0.54, c.width * 0.94);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.name = `zaiba:sign:${text}`;
  return mesh;
}
function put(mesh: THREE.Object3D, x: number, y: number, z: number, face: Face) {
  mesh.position.set(x, y, z);
  mesh.rotation.y = face === "s" ? 0 : face === "n" ? Math.PI : face === "e" ? Math.PI / 2 : -Math.PI / 2;
  return mesh;
}

/**
 * The island's content is laid out in its own numbers (./plan.ts: ZLAND, ZX, ZZ — the island as first
 * drawn) and moved ZDX metres east as a whole: what the builder asks (the ground, the roads, the
 * streets) is asked in those numbers, what it builds is moved, and what it hands back (doors, places,
 * pavements, parked cars) is in the world's.
 */
export default async function build(ctx: IsleCtx, roots: unknown): Promise<IsleContent> {
  const { root, near } = roots as { root: THREE.Group; near: THREE.Group };
  const had = new Set([...root.children, ...near.children]);
  const local: IsleCtx = {
    isle: {
      ...ctx.isle,
      streets: ctx.isle.streets.map((s) => (s.axis === "z" ? { ...s, at: s.at - ZDX } : { ...s, from: s.from - ZDX, to: s.to - ZDX })),
    },
    ground: (x, z) => ctx.ground(x + ZDX, z),
    road: (x, z) => ctx.road(x + ZDX, z),
    yieldFrame: () => ctx.yieldFrame(),
  };
  const c = await buildLocal(local, roots);
  for (const o of [...root.children, ...near.children]) if (!had.has(o)) o.position.x += ZDX;
  for (const f of c.facades) (f.x0 += ZDX), (f.x1 += ZDX), (f.door.x += ZDX);
  for (const p of c.places) p.box = { ...p.box, x0: p.box.x0 + ZDX, x1: p.box.x1 + ZDX };
  for (const w of c.walks) (w[0] += ZDX), (w[2] += ZDX);
  return c;
}

async function buildLocal(ctx: IsleCtx, roots: unknown): Promise<IsleContent> {
  const { root, near } = roots as { root: THREE.Group; near: THREE.Group };
  const S = new Sectors();
  const facades: IsleFacade[] = [];
  const places: { name: string; box: Box }[] = [];
  const signs = new THREE.Group();
  signs.name = "zaiba:signs";
  root.add(signs);

  /**
   * A front door on face `face` of a building whose front line is `front`, centred `at` along it:
   * a glazed lobby lit behind, the doors in their frame, a canopy with its light. The game's door
   * (a building type for the interiors) faces the street.
   */
  const door = (K: Kit, face: Face, at: number, front: number, type: string, o: { w?: number; h?: number; tint?: string } = {}) => {
    const w = o.w ?? 10,
      h = o.h ?? 4.4;
    const [ox, oz] = OUT[face];
    // (u along the front, d out from it): a world point
    const P = (u: number, y: number, d: number): V3 => (ox === 0 ? [at + u * (oz > 0 ? 1 : -1), y, front + d * oz] : [front + d * ox, y, at + u * (ox > 0 ? -1 : 1)]);
    const box = (slot: string, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, col: V3) => {
      const a = P(u0, y0, d0),
        b = P(u1, y1, d1);
      K.box(slot as never, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), col);
    };
    // the lobby's light behind the glass, the glass either side of the doors, the doors' frame
    box("lm.glow", -w / 2, w / 2, Y0 + 0.05, Y0 + h, 0.02, 0.06, hex(o.tint ?? "#ffe0b0", 0.55));
    for (const s of [-1, 1]) box("lm.glass", s < 0 ? -w / 2 : 1.5, s < 0 ? -1.5 : w / 2, Y0 + 0.05, Y0 + h, 0.08, 0.14, hex("#26303a"));
    for (const u of [-w / 2, -1.5, -0.05, 1.5, w / 2]) box("lm.Metal032.metal", u - 0.08, u + 0.08, Y0, Y0 + h, 0.06, 0.2, hex("#3a3e44"));
    box("lm.Metal032.metal", -w / 2, w / 2, Y0 + h - 0.12, Y0 + h + 0.1, 0.06, 0.2, hex("#3a3e44"));
    box("lm.glass", -1.45, 1.45, Y0 + 0.02, Y0 + 2.6, 0.1, 0.13, hex("#1c242c"));
    // the canopy out over the pavement, its light underneath
    box("lm.Metal032.metal", -3.4, 3.4, Y0 + h + 0.15, Y0 + h + 0.45, 0, 2.6, hex("#d8dade"));
    box("lm.glow", -3.0, 3.0, Y0 + h + 0.13, Y0 + h + 0.15, 0.3, 2.3, hex("#fff0d6", 0.9));
    // the step in front
    box("lm.Concrete034", -2.2, 2.2, Y0 - 0.02, Y0 + 0.06, 0, 1.2, hex("#cfcac2"));
    const d = P(0, 0, 0.35);
    const along = ox === 0 ? at : front;
    facades.push({ type, face, x0: ox === 0 ? at - w / 2 : front, x1: ox === 0 ? at + w / 2 : front, z: ox === 0 ? front : at, out: { x: ox, y: 0, z: oz }, door: { x: d[0], z: d[2] } });
    void along;
  };

  /** A building: its body in a photographed facade (`slot`, floors of 3.4 m), a roof parapet, its door. */
  const building = (b: Box, h: number, slot: string, col: string, face: Face, type: string, o: { at?: number; roof?: string } = {}) => {
    const K = new Kit({ lod: 0 });
    K.box(slot as never, b.x0, Y0, b.z0, b.x1, Y0 + h, b.z1, hex(col), { fh: 3.4, skip: "-y" });
    // the parapet and the roof's plant
    K.box("lm.Concrete034", b.x0 - 0.15, Y0 + h, b.z0 - 0.15, b.x1 + 0.15, Y0 + h + 1.1, b.z1 + 0.15, hex(o.roof ?? "#b8b4ac"), { skip: "-y" });
    const cx = (b.x0 + b.x1) / 2,
      cz = (b.z0 + b.z1) / 2;
    K.box("lm.Metal032.metal", cx - 3, Y0 + h + 1.1, cz - 2.5, cx + 3, Y0 + h + 3.4, cz + 2.5, hex("#8c9096"));
    const [ox] = OUT[face];
    const front = face === "s" ? b.z1 : face === "n" ? b.z0 : face === "e" ? b.x1 : b.x0;
    const at = o.at ?? (ox === 0 ? cx : cz);
    door(K, face, at, front, type);
    S.add(kitGeos(K.out()), cx, cz);
  };

  // ---------------------------------------------------------------------------------------------------
  // ZTV: two wings, the lattice of sky corridors between them, the sphere
  {
    const K = new Kit({ lod: 0 });
    const zN = -236,
      zS = -178;
    const wings: [number, number, number][] = [
      [703, 727, 74],
      [745, 769, 68],
    ];
    for (const [x0, x1, h] of wings) {
      K.box("f017", x0, Y0, zN, x1, Y0 + h, zS, hex("#dfe3e6"), { fh: 3.4, skip: "-y" });
      K.box("lm.Metal024.metal", x0 - 0.2, Y0 + h, zN - 0.2, x1 + 0.2, Y0 + h + 1.4, zS + 0.2, hex("#c9ccd0"));
      // the grid's bold lines up the wings' faces
      for (let z = zN; z <= zS; z += 9.6) K.box("lm.Metal024.metal", x0 - 0.3, Y0 + 4, z - 0.25, x1 + 0.3, Y0 + h, z + 0.25, hex("#e8eaec"));
    }
    // sky corridors across the gap at five levels, three rows
    for (const y of [16, 28, 40, 52, 64])
      for (const [z0, z1] of [
        [zN, zN + 9],
        [-211.5, -202.5],
        [zS - 9, zS],
      ] as [number, number][]) {
        if (y === 40 && z0 === -211.5) continue;
        K.box("lm.glass", 727, Y0 + y, z0, 745, Y0 + y + 4.2, z1, hex("#3a4652"));
        K.box("lm.Metal024.metal", 727, Y0 + y - 0.5, z0 - 0.2, 745, Y0 + y, z1 + 0.2, hex("#e8eaec"));
        K.box("lm.Metal024.metal", 727, Y0 + y + 4.2, z0 - 0.2, 745, Y0 + y + 4.8, z1 + 0.2, hex("#e8eaec"));
      }
    // the sphere: titanium panels, a band of glass round its middle, the struts that hold it
    const sc: V3 = [736, Y0 + 47, -207];
    K.sphere("lm.Metal024.metal", sc[0], sc[1], sc[2], 13.5, hex("#c4c8ce"), { segs: 28 });
    K.cyl("lm.glass", sc[0], sc[2], 13.65, 13.65, sc[1] - 1.4, sc[1] + 1.4, hex("#2a3440"), { sides: 28, caps: "none" });
    for (const [dx, dz] of [
      [-9, -9],
      [9, -9],
      [-9, 9],
      [9, 9],
    ])
      K.bar("lm.Metal024.metal", [sc[0] + dx * 0.7, sc[1] - 9, sc[2] + dz * 0.7], [sc[0] + Math.sign(dx) * 9, Y0 + 40, sc[2] + Math.sign(dz) * 10], 0.9, hex("#e0e2e4"));
    // the plaza's great stair up to the corridor at 16 m (the open-air "ZTV stairs")
    for (let k = 0; k < 20; k++) K.box("lm.Concrete034", 729, Y0 + k * 0.8, zS + 14 - k * 0.7, 743, Y0 + (k + 1) * 0.8, zS + 14 - (k + 1) * 0.7 + 0.7, hex("#d6d2ca"));
    K.box("lm.Concrete034", 729, Y0, zS, 743, Y0 + 16, zS + 0.6, hex("#cfcac2"));
    door(K, "s", 715, zS, "office", { w: 14, h: 5.2, tint: "#e8f0ff" });
    door(K, "s", 757, zS, "office", { w: 12, h: 5.2, tint: "#e8f0ff" });
    S.add(kitGeos(K.out()), 736, -207);
    signs.add(put(sign("ZTV", 18, 6, "#ff4fa3"), 715, Y0 + 66, zS + 0.35, "s"));
    places.push({ name: "ZTV", box: { x0: 697, x1: 775, z0: -245, z1: -163 } });
  }
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // Zaiba Decks: the mall facing the beach, its timber terraces over Seaside Drive's pavement
  {
    const K = new Kit({ lod: 0 });
    const x0 = 712,
      x1 = 770,
      z0 = -142,
      z1 = -82;
    K.box("f018", x0, Y0, z0, x1, Y0 + 22, z1, hex("#efe2cc"), { fh: 3.6, skip: "-y" });
    K.box("lm.Concrete034", x0 - 0.2, Y0 + 22, z0 - 0.2, x1 + 0.2, Y0 + 23.2, z1 + 0.2, hex("#b8b0a4"));
    // the decks: two timber terraces along the west face, posts, glass balustrades
    for (const y of [5.2, 10.6, 16]) {
      K.box("lm.Wood049", x0 - 6, Y0 + y - 0.35, z0 + 2, x0, Y0 + y, z1 - 2, hex("#a9805a"));
      K.box("lm.glass", x0 - 6.05, Y0 + y, z0 + 2, x0 - 5.95, Y0 + y + 1.1, z1 - 2, hex("#8fa4b0"));
      for (let z = z0 + 4; z < z1 - 2; z += 6) K.box("lm.Wood049", x0 - 5.9, Y0, z - 0.2, x0 - 5.5, Y0 + y - 0.35, z + 0.2, hex("#8a6648"));
    }
    door(K, "w", -112, x0, "shophouse", { w: 14, h: 4.8, tint: "#ffd9a0" });
    door(K, "n", 741, z0, "shophouse", { w: 10 });
    S.add(kitGeos(K.out()), 741, -112);
    signs.add(put(sign("ZAIBA DECKS", 26, 4, "#ffffff"), x0 - 0.3, Y0 + 19.5, -112, "w"));
    places.push({ name: "Zaiba Decks", box: { x0: 697, x1: 775, z0: -149, z1: -75 } });
  }

  // ---------------------------------------------------------------------------------------------------
  // Shield City: the mall, its glass atrium on Rainbow Boulevard
  {
    const K = new Kit({ lod: 0 });
    K.box("f006", 790, Y0, -136, 860, Y0 + 30, -82, hex("#d9d6d0"), { fh: 3.8, skip: "-y" });
    K.box("lm.Concrete034", 789.8, Y0 + 30, -136.2, 860.2, Y0 + 31.4, -81.8, hex("#a8a49c"));
    // the atrium: a glass box in a white frame, the name over it
    K.box("lm.glass", 810, Y0, -143, 840, Y0 + 24, -136, hex("#55708a"));
    for (let x = 810; x <= 840; x += 5) K.box("lm.Metal032.metal", x - 0.2, Y0, -143.25, x + 0.2, Y0 + 24, -142.9, hex("#f0f0ee"));
    for (const y of [6, 12, 18, 24]) K.box("lm.Metal032.metal", 810, Y0 + y - 0.25, -143.25, 840, Y0 + y + 0.25, -142.9, hex("#f0f0ee"));
    door(K, "n", 825, -143.3, "shophouse", { w: 16, h: 5.6, tint: "#fff2dc" });
    door(K, "w", -100, 790, "shophouse", { w: 10 });
    S.add(kitGeos(K.out()), 825, -110);
    signs.add(put(sign("SHIELD CITY", 28, 4.4, "#ffffff"), 825, Y0 + 26.6, -143.4, "n"));
    places.push({ name: "Shield City", box: { x0: 785, x1: 864, z0: -149, z1: -75 } });
  }
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // Palette Town: the arcaded hall (an Italian street indoors), the wheel's station, the wheel
  {
    const K = new Kit({ lod: 0 });
    K.box("plaster", 882, Y0, -142, 944, Y0 + 17, -82, hex("#ead9c0"), { skip: "-y" });
    // its cornice, its arcade of arches along the front (pilasters and lit openings)
    K.box("lm.Concrete034", 881.4, Y0 + 15.6, -142.6, 944.6, Y0 + 17.4, -81.4, hex("#f2e8d8"));
    for (let z = -138; z <= -86; z += 6.5) {
      K.box("lm.Concrete034", 881.5, Y0, z - 0.7, 882.1, Y0 + 8, z + 0.7, hex("#f4ecde"));
      if (Math.abs(z + 112) > 4) K.box("lm.glow", 881.9, Y0 + 0.4, z + 0.9, 881.95, Y0 + 6.2, z + 5.6, hex("#ffcf8a", 0.5));
    }
    door(K, "w", -112, 882, "shophouse", { w: 8, h: 6.2, tint: "#ffcf8a" });
    // the wheel's station (tickets and the boarding deck), its door on Daiba Avenue
    K.box("f019", 880, Y0, -36, 900, Y0 + 7, -14, hex("#e8e4dc"), { fh: 3.5, skip: "-y" });
    K.box("lm.Concrete034", 900, Y0, -32, 926, Y0 + 3.2, -16, hex("#d0ccc4"));
    door(K, "w", -25, 880, "shophouse", { w: 8, tint: "#ffe4c0" });
    S.add(kitGeos(K.out()), 913, -60);
    signs.add(put(sign("PALETTE TOWN", 24, 3.4, "#fff3c8"), 881.6, Y0 + 12.4, -112, "w"));
    places.push({ name: "Palette Town", box: { x0: 876, x1: 950, z0: -149, z1: -75 } });
  }

  // the Zaiba Wheel: a hundred metres, turning slowly; its gondolas stay level; rainbow LEDs on its rim at night
  const wheel = new THREE.Group();
  wheel.name = "zaiba:wheel";
  const HUB: V3 = [913, Y0 + 54, -24];
  const R = 46;
  const gondolas: THREE.InstancedMesh = (() => {
    const g = new THREE.CylinderGeometry(1.5, 1.5, 2.4, 10).rotateX(Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2 });
    const im = new THREE.InstancedMesh(g, m, 48);
    const c = new THREE.Color();
    for (let i = 0; i < 48; i++) im.setColorAt(i, c.setHSL(i / 48, 0.65, 0.6));
    im.name = "zaiba:gondolas";
    return im;
  })();
  {
    // the legs (an A-frame each side), standing; the turning part in its own group at the hub
    const K = new Kit({ lod: 0 });
    for (const sx of [-1, 1]) {
      const x = HUB[0] + sx * 3.2;
      for (const sz of [-1, 1]) K.bar("lm.Metal032.metal", [x, Y0, HUB[2] + sz * 22], [x, HUB[1], HUB[2]], 1.4, hex("#f2f2f0"));
      K.bar("lm.Metal032.metal", [x, Y0 + 18, HUB[2] - 14.5], [x, Y0 + 18, HUB[2] + 14.5], 0.8, hex("#f2f2f0"));
    }
    K.bar("lm.Metal032.metal", [HUB[0] - 4, HUB[1], HUB[2]], [HUB[0] + 4, HUB[1], HUB[2]], 2.2, hex("#d8dade"));
    S.add(kitGeos(K.out()), HUB[0], HUB[2]);
    const T = new Kit({ lod: 0 });
    const N = 48;
    const ring = (r: number, x: number, slot: string, w: number, col: (i: number) => V3) => {
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2,
          b = ((i + 1) / N) * Math.PI * 2;
        T.bar(slot as never, [x, Math.cos(a) * r, Math.sin(a) * r], [x, Math.cos(b) * r, Math.sin(b) * r], w, col(i));
      }
    };
    for (const x of [-2.2, 2.2]) {
      ring(R, x, "lm.Metal032.metal", 0.9, () => hex("#f4f4f2"));
      ring(R - 3, x, "lm.Metal032.metal", 0.5, () => hex("#f4f4f2"));
      for (let i = 0; i < N; i += 2) {
        const a = (i / N) * Math.PI * 2;
        T.bar("lm.Metal032.metal", [x * 0.6, 0, 0], [x, Math.cos(a) * (R - 3), Math.sin(a) * (R - 3)], 0.22, hex("#e8e8e6"));
      }
    }
    // the rim's lights (lit in the rainbow's colours, brighter at night)
    const c = new THREE.Color();
    ring(R + 0.7, 0, "lm.glow", 0.35, (i) => {
      c.setHSL(i / N, 1, 0.55);
      return [c.r, c.g, c.b];
    });
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      T.bar("lm.Metal032.metal", [-2.2, Math.cos(a) * R, Math.sin(a) * R], [2.2, Math.cos(a) * R, Math.sin(a) * R], 0.4, hex("#e0e0de"));
    }
    const turning = kitMeshes(kitGeos(T.out()));
    turning.name = "zaiba:wheel:rim";
    wheel.add(turning);
    wheel.position.set(HUB[0], HUB[1], HUB[2]);
    root.add(wheel);
    gondolas.frustumCulled = false;
    root.add(gondolas);
    places.push({ name: "the Zaiba Wheel", box: { x0: 876, x1: 950, z0: -65, z1: 17 } });
  }
  const mtx = new THREE.Matrix4();
  const placeGondolas = (rot: number) => {
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2 + rot;
      mtx.makeTranslation(HUB[0], HUB[1] + Math.cos(a) * (R + 0.2) - 1.6, HUB[2] + Math.sin(a) * (R + 0.2));
      gondolas.setMatrixAt(i, mtx);
    }
    gondolas.instanceMatrix.needsUpdate = true;
  };
  placeGondolas(0);
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // Big Proof: a glass hall under four upturned pyramids on their stems
  {
    const K = new Kit({ lod: 0 });
    K.box("lm.glass", 797, Y0, -56, 853, Y0 + 10, 4, hex("#46586a"));
    K.box("lm.Metal024.metal", 796.6, Y0 + 10, -56.4, 853.4, Y0 + 11.2, 4.4, hex("#c9ccd0"));
    const sq = (cx: number, cz: number, h: number): V2[] => [
      [cx + h, cz - h],
      [cx + h, cz + h],
      [cx - h, cz + h],
      [cx - h, cz - h],
    ].reverse() as V2[];
    for (const [cx, cz] of [
      [813, -40],
      [837, -40],
      [813, -12],
      [837, -12],
    ]) {
      K.cyl("lm.Concrete034", cx, cz, 2.6, 2.6, Y0 + 11.2, Y0 + 18, hex("#d4d0c8"), { sides: 16 });
      K.loft("lm.Metal024.metal", [
        { y: Y0 + 17, pts: sq(cx, cz, 3.2) },
        { y: Y0 + 31, pts: sq(cx, cz, 12.6) },
      ], hex("#b8bcc2"), { lid: "lm.Metal024.metal" });
      // the windows in their faces
      K.loft("lm.glass", [
        { y: Y0 + 23, pts: sq(cx, cz, 7.9) },
        { y: Y0 + 26.5, pts: sq(cx, cz, 10.4) },
      ], hex("#2c3640"), { lid: null });
    }
    door(K, "n", 825, -56, "office", { w: 18, h: 5.4, tint: "#eaf2ff" });
    S.add(kitGeos(K.out()), 825, -26);
    signs.add(put(sign("BIG PROOF", 20, 3, "#ffffff"), 825, Y0 + 8, -56.3, "n"));
    places.push({ name: "Big Proof", box: { x0: 785, x1: 864, z0: -65, z1: 17 } });
  }

  // ---------------------------------------------------------------------------------------------------
  // the Telecom Gate: two towers joined high up, a gate over the plaza
  {
    const K = new Kit({ lod: 0 });
    for (const [x0, x1] of [
      [792, 813],
      [836, 857],
    ]) {
      K.box("f001", x0, Y0, -228, x1, Y0 + 72, -177, hex("#c8d4de"), { fh: 3.6, skip: "-y" });
      K.box("lm.Concrete034", x0 - 0.2, Y0 + 72, -228.2, x1 + 0.2, Y0 + 73.4, -176.8, hex("#a8a49c"));
    }
    K.box("f001", 813, Y0 + 54, -224, 836, Y0 + 72, -181, hex("#c8d4de"), { fh: 3.6 });
    K.box("lm.glow", 813.2, Y0 + 53.8, -223.8, 835.8, Y0 + 54, -181.2, hex("#cfe4ff", 0.7));
    door(K, "s", 802.5, -177, "office");
    door(K, "s", 846.5, -177, "office");
    S.add(kitGeos(K.out()), 825, -200);
    places.push({ name: "the Telecom Gate", box: { x0: 785, x1: 864, z0: -245, z1: -163 } });
  }

  // Hotel Zaiba: a tower on its podium, the name at the top
  {
    const K = new Kit({ lod: 0 });
    K.box("f006", 882, Y0, -236, 944, Y0 + 10, -173, hex("#d8d2c8"), { fh: 5, skip: "-y" });
    K.box("f017", 890, Y0 + 10, -224, 936, Y0 + 86, -186, hex("#e6eaee"), { fh: 3.4 });
    K.box("lm.Concrete034", 889.8, Y0 + 86, -224.2, 936.2, Y0 + 88, -185.8, hex("#b8b4ac"));
    door(K, "s", 913, -173, "apartment", { w: 16, h: 5, tint: "#ffe2b8" });
    S.add(kitGeos(K.out()), 913, -205);
    signs.add(put(sign("HOTEL ZAIBA", 30, 4.2, "#ffd9a0"), 913, Y0 + 82, -185.6, "s"));
    places.push({ name: "Hotel Zaiba", box: { x0: 876, x1: 950, z0: -245, z1: -163 } });
  }
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // the Heights: residential towers, two a block, their lobbies on the street
  const towers: [Box, number, string, string, Face][] = [
    [{ x0: 704, x1: 732, z0: -328, z1: -302 }, 62, "f005", "#e4ded4", "n"],
    [{ x0: 742, x1: 768, z0: -290, z1: -262 }, 48, "f019", "#dcd6cc", "s"],
    [{ x0: 792, x1: 822, z0: -328, z1: -300 }, 76, "f017", "#d4dce4", "n"],
    [{ x0: 830, x1: 858, z0: -290, z1: -262 }, 56, "f005", "#e8e0d4", "s"],
    [{ x0: 884, x1: 912, z0: -328, z1: -300 }, 66, "f001", "#cdd8e2", "n"],
    [{ x0: 920, x1: 946, z0: -292, z1: -262 }, 88, "f017", "#e2e6ea", "s"],
  ];
  for (const [b, h, slot, col, face] of towers) building(b, h, slot, col, face, "apartment");
  places.push({ name: "Zaiba Heights", box: { x0: 697, x1: 950, z0: -335, z1: -255 } });
  // along Ariake Street: mid-rise flats and offices, their doors on the street
  const east: [number, number, string, string, string][] = [
    [-330, -296, "f020", "#e8dccb", "apartment"],
    [-290, -262, "f019", "#d6d0c6", "office"],
    [-238, -204, "f018", "#efe4d2", "apartment"],
    [-198, -168, "f020", "#ddd5c8", "office"],
    [-144, -112, "f019", "#e6ded2", "apartment"],
    [-106, -80, "f018", "#d2ccc2", "office"],
    [-60, -26, "f020", "#ece2d2", "apartment"],
    [-20, 12, "f019", "#dad2c6", "apartment"],
  ];
  for (const [z0, z1, slot, col, type] of east) building({ x0: 964, x1: 994, z0, z1 }, 18 + Math.abs(Math.round(z0)) % 3 * 3.4, slot, col, "w", type);
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // the shops along Seaside Road (facing north, the beach behind them): awnings, lit windows
  {
    const K = new Kit({ lod: 0 });
    const trades = ["CAFÉ", "KONBINI", "RAMEN", "SURF", "GELATO", "IZAKAYA", "BOOKS", "FLOWERS", "BAR", "SUSHI"];
    const cols = ["#efe6d6", "#e2d4c4", "#f2ece2", "#d8cfc2", "#ebe0cc"];
    let k = 0;
    for (let x = 700; x + 20 <= 948; x += 24.5, k++) {
      if (Math.abs(x + 10 - ZX.wheel) < 12 || Math.abs(x + 10 - ZX.daiba) < 13) continue;
      const b = { x0: x, x1: x + 20, z0: 29, z1: 38.5 };
      K.box("plaster", b.x0, Y0, b.z0, b.x1, Y0 + 7.4, b.z1, hex(cols[k % cols.length]), { skip: "-y" });
      K.box("lm.Concrete034", b.x0 - 0.15, Y0 + 7.4, b.z0 - 0.15, b.x1 + 0.15, Y0 + 8.1, b.z1 + 0.15, hex("#b0aaa0"));
      // the shop window lit, the awning over it
      K.box("lm.glow", b.x0 + 1, Y0 + 0.5, b.z0 - 0.06, b.x1 - 1, Y0 + 3.4, b.z0 - 0.02, hex("#ffd9a0", 0.6));
      K.box("fabric", b.x0 + 0.6, Y0 + 3.6, b.z0 - 1.8, b.x1 - 0.6, Y0 + 3.8, b.z0, hex(["#c8442c", "#2e5a8a", "#3a7a4a", "#e0b030", "#7a3a6a"][k % 5]));
      const type = trades[k % trades.length] === "IZAKAYA" || trades[k % trades.length] === "BAR" ? "izakaya" : "shophouse";
      door(K, "n", x + 10, b.z0 - 0.1, type, { w: 4, h: 2.9 });
      signs.add(put(sign(trades[k % trades.length], 7, 1.1, "#ffffff", "rgba(20,24,30,0.85)"), x + 10, Y0 + 5.2, b.z0 - 0.05, "n"));
    }
    S.add(kitGeos(K.out()), 820, 34);
  }

  // ---------------------------------------------------------------------------------------------------
  // the boardwalk along the west strip, Seaside Park, the north quay
  const props: PropSpot[] = [];
  const trees: TreeSpot[] = [];
  {
    const K = new Kit({ lod: 0 });
    // the boardwalk: timber over the strip between the land's edge and Seaside Drive, south of the bridge
    K.box("lm.Wood049", ZLAND.x0, Y0, -147, ZX.seaside - 5.2, Y0 + 0.08, ZZ.seaside + 15, hex("#9c7a56"));
    for (let z = -144; z < ZZ.seaside + 14; z += 3) K.box("lm.Wood049", ZLAND.x0 - 0.12, Y0 - 0.6, z, ZLAND.x0 + 0.05, Y0 + 0.08, z + 2.9, hex("#7a5c40"));
    // the park's paths: a loop and a cross
    const P = { x0: ZX.seaside + 5, x1: ZX.wheel - 5, z0: ZZ.palette + 5, z1: ZZ.seaside - 5 };
    const path = (x0: number, z0: number, x1: number, z1: number) => K.box("lm.PavingStones130", x0, Y0, z0, x1, Y0 + 0.03, z1, hex("#d8d0c4"));
    path(P.x0 + 6, P.z0 + 6, P.x1 - 6, P.z0 + 9);
    path(P.x0 + 6, P.z1 - 9, P.x1 - 6, P.z1 - 6);
    path(P.x0 + 6, P.z0 + 6, P.x0 + 9, P.z1 - 6);
    path(P.x1 - 9, P.z0 + 6, P.x1 - 6, P.z1 - 6);
    path((P.x0 + P.x1) / 2 - 1.5, P.z0 + 6, (P.x0 + P.x1) / 2 + 1.5, P.z1 - 6);
    S.add(kitGeos(K.out()), 700, -60);
    const pc = { x: (P.x0 + P.x1) / 2, z: (P.z0 + P.z1) / 2 };
    props.push({ type: "tieredFountain", args: [], x: pc.x, z: pc.z, y: Y0, rot: 0 });
    for (let k = 0; k < 26; k++) {
      const x = P.x0 + 3 + ((k * 37) % 61) * ((P.x1 - P.x0 - 6) / 61),
        z = P.z0 + 3 + ((k * 23) % 59) * ((P.z1 - P.z0 - 6) / 59);
      if (Math.abs(x - pc.x) < 9 && Math.abs(z - pc.z) < 9) continue;
      if (Math.abs(x - pc.x) < 3 || Math.abs(z - (P.z0 + 7.5)) < 3 || Math.abs(z - (P.z1 - 7.5)) < 3 || Math.abs(x - (P.x0 + 7.5)) < 3 || Math.abs(x - (P.x1 - 7.5)) < 3) continue;
      trees.push({ x, z, y: Y0, species: k % 3 === 0 ? "blossom" : k % 3 === 1 ? "pine" : "broad", seed: 300 + k });
    }
    for (const [x, z, r] of [
      [P.x0 + 7.5, pc.z - 14, Math.PI / 2],
      [P.x0 + 7.5, pc.z + 14, Math.PI / 2],
      [P.x1 - 7.5, pc.z - 14, -Math.PI / 2],
      [P.x1 - 7.5, pc.z + 14, -Math.PI / 2],
    ])
      props.push({ type: "bench", args: [], x, z, y: Y0, rot: r });
    places.push({ name: "Seaside Park", box: P });
    // lamps and benches along the boardwalk, pines between them
    for (let z = -140; z < ZZ.seaside + 12; z += 12) {
      if (Math.abs(z - ZZ.palette) < 7) continue;
      if (Math.round(z / 12) % 2 === 0) props.push({ type: "lamp", args: ["#ffc890"], x: ZLAND.x0 + 1.2, z, y: Y0 + 0.08, rot: Math.PI / 2 });
      else props.push({ type: "bench", args: [], x: ZLAND.x0 + 1.4, z, y: Y0 + 0.08, rot: -Math.PI / 2 });
    }
    // the north quay: lamps and pines along the water
    for (let x = 700; x < 994; x += 14) {
      props.push({ type: "lamp", args: ["#ffc890"], x, z: ZLAND.z0 + 1.2, y: Y0, rot: 0 });
      trees.push({ x: x + 7, z: ZLAND.z0 + 5.5, y: Y0, species: "pine", seed: 500 + x });
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // the streets' lamps, trees on the boulevards, a vending machine by the shops
  const juncs: [number, number][] = [];
  for (const a of ctx.isle.streets) for (const b of ctx.isle.streets) if (a.axis === "x" && b.axis === "z" && b.at >= a.from - 1 && b.at <= a.to + 1 && a.at >= b.from - 1 && a.at <= b.to + 1) juncs.push([b.at, a.at]);
  const nearJ = (x: number, z: number, r: number) => juncs.some(([jx, jz]) => Math.abs(jx - x) < r && Math.abs(jz - z) < r);
  const doorNear = (x: number, z: number, r: number) => facades.some((f) => Math.hypot(f.door.x - x, f.door.z - z) < r);
  for (const s of ctx.isle.streets) {
    const len = s.to - s.from;
    const big = s.width >= 12;
    for (const side of [-1, 1]) {
      const off = s.width / 2 + 0.65;
      for (let u = 12; u < len - 6; u += 26) {
        const along = s.from + u + (side > 0 ? 13 : 0);
        const [x, z] = s.axis === "x" ? [along, s.at + side * off] : [s.at + side * off, along];
        if (nearJ(x, z, s.width / 2 + 7) || doorNear(x, z, 4) || ctx.road(x, z)) continue;
        // (the lamp's arm reaches over the road: it faces the street)
        const rot = s.axis === "x" ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
        props.push({ type: "lamp", args: ["#ffbf80"], x, z, y: Y0, rot });
      }
      if (!big) continue;
      for (let u = 6; u < len - 4; u += 11) {
        const along = s.from + u;
        const [x, z] = s.axis === "x" ? [along, s.at + side * (s.width / 2 + 2.2)] : [s.at + side * (s.width / 2 + 2.2), along];
        if (nearJ(x, z, s.width / 2 + 6) || doorNear(x, z, 5) || ctx.road(x, z) || x < ZLAND.x0 + 2) continue;
        trees.push({ x, z, y: Y0, species: s.axis === "x" ? "plane" : "maple", seed: Math.round(x * 3 + z) });
      }
    }
  }
  for (const [x, z] of [
    [ZX.wheel + 8, 27.6],
    [ZX.daiba - 9, 27.6],
    [ZX.ariake - 9, 27.6],
  ])
    props.push({ type: "vending", args: ["red"], x, z, y: Y0, rot: Math.PI });
  placeProps(near, props);
  plantTrees(near, trees);
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // the beach: umbrellas, towels, lifeguards, a volleyball court, a beach bar (Orchard Keys' kit)
  const walks: [number, number, number, number][] = [];
  {
    const parts = new Map<KSlot, THREE.BufferGeometry[]>();
    const add = (kw: KW, x: number, z: number, yaw: number) => {
      const y = ctx.ground(x, z);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
      for (const [slot, d] of Object.entries(kw.out()) as [KSlot, { pos: Float32Array; nor: Float32Array; uv: Float32Array; col: Float32Array; idx: number[] }][]) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(d.pos, 3));
        g.setAttribute("normal", new THREE.BufferAttribute(d.nor, 3));
        g.setAttribute("uv", new THREE.BufferAttribute(d.uv, 2));
        g.setAttribute("color", new THREE.BufferAttribute(d.col, 3));
        g.setIndex(Array.from(d.idx));
        g.applyMatrix4(m);
        (parts.get(slot) ?? parts.set(slot, []).get(slot)!).push(g);
      }
    };
    let h = 4242;
    const rnd = () => ((h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296);
    // (facing the water: west)
    const W = -Math.PI / 2;
    add(kBeachBar(), ZLAND.x0 - 8, -6, W);
    add(kVolleyNet(), ZLAND.x0 - 26, -96, 0);
    for (const z of [-120, -50, 10]) add(kLifeguard(z * 7), ZLAND.x0 - ZBEACH.width + 22, z, W);
    const spots: [number, number][] = [];
    for (let z = ZBEACH.z0 + 8; z < ZBEACH.z1 - 6; z += 8.5)
      for (let x = ZLAND.x0 - 8; x > ZLAND.x0 - ZBEACH.width + 26; x -= 9) {
        if (rnd() < 0.22) continue;
        const px = x + (rnd() - 0.5) * 3,
          pz = z + (rnd() - 0.5) * 3;
        if (Math.abs(pz + 6) < 9 && px > ZLAND.x0 - 16) continue;
        if (Math.abs(pz + 96) < 10 && Math.abs(px - (ZLAND.x0 - 26)) < 12) continue;
        if (Math.abs(pz - ZB.z) < 24) continue;
        spots.push([px, pz]);
      }
    for (const [x, z] of spots) add(kBeachSet(Math.floor(rnd() * 12)), x, z, W + (rnd() - 0.5) * 0.5);
    for (const [slot, list] of parts) {
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingBox();
      const c = geo.boundingBox!.getCenter(new THREE.Vector3());
      geo.translate(-c.x, 0, -c.z);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, keysMat(slot));
      mesh.position.set(c.x, 0, c.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `zaiba:beach:${slot}`;
      near.add(mesh);
    }
    // where the passers-by walk: the boardwalk, the wet sand along the water, the north quay
    walks.push([ZLAND.x0 + 3.2, -144, ZLAND.x0 + 3.2, ZZ.seaside + 12]);
    let wx = ZLAND.x0 - 10;
    for (let x = ZLAND.x0 - 10; x > ZLAND.x0 - ZBEACH.width - 10; x -= 1) if (ctx.ground(x, -50) > -1.45) wx = x;
    walks.push([wx + 1.5, ZBEACH.z0 + 10, wx + 1.5, ZBEACH.z1 - 8]);
    walks.push([700, ZLAND.z0 + 3.2, 994, ZLAND.z0 + 3.2]);
    places.push({ name: "Zaiba Beach", box: { x0: ZLAND.x0 - ZBEACH.width - 20, x1: ZLAND.x0, z0: ZBEACH.z0 - 10, z1: ZBEACH.z1 + 10 } });
  }

  // ---------------------------------------------------------------------------------------------------
  // cars parked along the kerbs (the game can take them)
  const parked: { obj: THREE.Group; kind: CarKind }[] = [];
  {
    const kinds: CarKind[] = ["sedan", "suv", "sedan", "convertible", "van", "sports", "sedan", "pickup", "taxi"];
    const paints = ["#e8e6e2", "#22242a", "#8a2a3a", "#2a4a7a", "#c8ccd4", "#3a5a40", "#f2c230", "#b07bff", "#d8d2c4"];
    let k = 0;
    for (const s of ctx.isle.streets) {
      if (s.width >= 14 || s.name === "Quay Road") continue;
      for (const side of [-1, 1]) {
        for (let u = 14; u < s.to - s.from - 10; u += 7.2) {
          k++;
          if ((k * 7) % 5 < 2) continue;
          const along = s.from + u;
          const off = s.width / 2 - 1.15;
          const [x, z] = s.axis === "x" ? [along, s.at + side * off] : [s.at + side * off, along];
          if (nearJ(x, z, s.width / 2 + 8) || doorNear(x, z, 6)) continue;
          const kind = kinds[k % kinds.length];
          const obj = carObject(kind, { paint: kind === "taxi" ? "#f2c230" : paints[(k * 5) % paints.length] });
          obj.position.set(x, 0.012, z);
          // (right-hand traffic: parked facing the way their side's lane runs)
          obj.rotation.y = s.axis === "x" ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
          obj.userData.kind = kind;
          near.add(obj);
          parked.push({ obj, kind });
          if (parked.length >= 44) break;
        }
      }
    }
  }

  S.build(root);

  let rot = 0;
  return {
    facades,
    parked,
    walks,
    places,
    update(dt) {
      // the wheel: once round in a quarter of an hour
      rot += dt * ((Math.PI * 2) / 900);
      wheel.rotation.x = rot;
      placeGondolas(rot);
    },
  };
}
