import * as THREE from "three";
import { BAY, CURB } from "../../city/plan";
import { realBoat } from "../../real/boats";
import { carObject, type CarKind } from "../../real/cars";
import { terrainMat } from "../../real/ground";
import { kitGeos, kitMeshes, mergeKit, type KitGeos } from "../../real/kitobj";
import { hex, Kit, type V2, type V3 } from "../../real/lmkit";
import { emptyOut, front as martFront, mall as mallBox, MartDecals, parkade } from "../../real/marts";
import { placeProps, type PropSpot } from "../../real/props";
import { plantTrees, type TreeSpot } from "../../real/trees";
import type { Box, IsleContent, IsleCtx, IsleFacade, IsleSeat } from "../types";
import { GC, GCASTLE, GCATH, GLAND, GMARKT, GSQUARE, GZ, ISLET, WB } from "./plan";
import { cells, type Face, frame, house, onlyFront, rowOf, type HouseSpot } from "./town";

/**
 * GAMLA's content (the old town west of the city, ./plan.ts), in the realistic kit:
 *  - Peberholm, the crossing's islet: grass over rock armour, a lighthouse at its tip;
 *  - St. Proof's Cathedral (gothic: twin towers and spires over three portals and a rose window, a
 *    nave and its flying buttresses, the transept, the apse, the crossing's flèche; its stained glass
 *    lit at night), Domplein across the boulevard with its fountain and café terraces;
 *  - the Grote Markt: the Belfort over the cloth hall, market stalls, terraces, the guild houses;
 *  - the canals' quays: elms, lamps, bollards, bicycles, boats moored, stairs down to the water;
 *  - the castle on its hill (curtain walls, round towers, the keep), the path up to its gate;
 *  - the harbour quay along the north shore, its boats; the gabled houses everywhere else (./town.ts);
 *  - 24/ZEC's kiosks (src/scene/real/marts.ts) in three houses' ground floors (on Øresund Boulevard,
 *    Kongensgade, Slotsgade), and GAMLA GALLERIA, the department store facing the Grote Markt across
 *    Markt, its multi-storey car park behind it on Zuidkade.
 */

/** The Galleria's block: between Markt and Zuidkade, Kongensgade and Havnegade. */
const GGALL = { x0: -2005, x1: -1930, z0: -35, z1: 70 };

const Y0 = CURB;
const WATER = BAY.water;

/** The island's geometry by sector (one set of meshes each, culled on its own). */
class Sectors {
  private parts = new Map<string, KitGeos[]>();
  add(g: KitGeos, x: number, z: number) {
    const k = `${Math.floor(x / 110)},${Math.floor(z / 110)}`;
    const l = this.parts.get(k);
    if (l) l.push(g);
    else this.parts.set(k, [g]);
  }
  build(parent: THREE.Object3D, name: string) {
    for (const [, list] of this.parts) {
      const merged = mergeKit(list);
      const box = new THREE.Box3();
      for (const g of Object.values(merged)) if (g) (g.computeBoundingBox(), box.union(g.boundingBox!));
      const c = box.getCenter(new THREE.Vector3()).setY(0);
      for (const g of Object.values(merged)) if (g) (g.translate(-c.x, 0, -c.z), g.computeBoundingSphere());
      const grp = kitMeshes(merged);
      grp.position.copy(c);
      grp.name = name;
      parent.add(grp);
    }
    this.parts.clear();
  }
}

/** A lit board with a name on it (one draw: a canvas on a plane). */
function sign(text: string, w: number, h: number, color: string, bg = "rgba(0,0,0,0)", font = '700 {px}px Georgia, "Times New Roman", serif') {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = Math.round((1024 * h) / w);
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = color;
  g.font = font.replace("{px}", `${Math.round(c.height * 0.66)}`);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height * 0.54, c.width * 0.94);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.name = `gamla:sign:${text}`;
  return mesh;
}
function put(mesh: THREE.Object3D, x: number, y: number, z: number, face: Face) {
  mesh.position.set(x, y, z);
  mesh.rotation.y = face === "s" ? 0 : face === "n" ? Math.PI : face === "e" ? Math.PI / 2 : -Math.PI / 2;
  return mesh;
}

const inBox = (b: Box, x: number, z: number, pad = 0) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;

export default async function build(ctx: IsleCtx, roots: unknown): Promise<IsleContent> {
  const { root, near } = roots as { root: THREE.Group; near: THREE.Group };
  const S = new Sectors();
  const facades: IsleFacade[] = [];
  const places: { name: string; box: Box }[] = [];
  const props: PropSpot[] = [];
  const trees: TreeSpot[] = [];
  const walks: [number, number, number, number][] = [];
  /** Its people who stay put: the cafés' customers, the stallholders. */
  const seats: IsleSeat[] = [];
  const signs = new THREE.Group();
  signs.name = "gamla:signs";
  root.add(signs);
  /** The kiosks' and the Galleria's pictures (one draw), their doors, furniture and lights. */
  const MA = new MartDecals();
  const mo = emptyOut();

  islet(root, near, props, trees);
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // the houses: every block side that looks at a street or a canal (the special blocks have their own)
  const C = cells(ctx.isle);
  const special = (x0: number, x1: number, z0: number, z1: number) => {
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    if (Math.hypot(cx - GCASTLE.x, cz - GCASTLE.z) < GCASTLE.r + 6) return true;
    if (inBox(GCATH, cx, cz, 14) || inBox(GSQUARE, cx, cz) || inBox(GMARKT, cx, cz) || inBox(GGALL, cx, cz)) return true;
    return false;
  };
  const spots: HouseSpot[] = [];
  const busy = (name: string) => /Boulevard|Markt|Kongens|Domstraat|Havne/.test(name);
  const streetAt = (x: number, z: number) => ctx.isle.streets.find((s) => (s.axis === "x" ? Math.abs(z - s.at) <= s.width / 2 + 0.5 && x >= s.from - 1 && x <= s.to + 1 : Math.abs(x - s.at) <= s.width / 2 + 0.5 && z >= s.from - 1 && z <= s.to + 1));
  for (let j = 0; j < C.nz; j++)
    for (let i = 0; i < C.nx; i++) {
      if (C.at(i, j) !== 0) continue;
      const x0 = C.xe[i],
        x1 = C.xe[i + 1],
        z0 = C.ze[j],
        z1 = C.ze[j + 1];
      if (x1 - x0 < 16 || z1 - z0 < 16) continue;
      if (special(x0, x1, z0, z1)) continue;
      // (each side: what it looks at — 1 a street, 2 a canal)
      const nN = C.at(i, j - 1),
        nS = C.at(i, j + 1),
        nW = C.at(i - 1, j),
        nE = C.at(i + 1, j);
      const back = (k: number) => (k === 2 ? 5 : k === 1 ? 2.4 : 0);
      const depth = (span: number) => Math.max(8, Math.min(13, span / 2 - 4));
      const dz = depth(z1 - z0),
        dx = depth(x1 - x0);
      const kinds = (name: string | undefined, canal: boolean) => (k: number) => (canal ? (k % 5 === 2 ? "cafe" : "house") : name && busy(name) ? (["shop", "cafe", "shop", "bar", "house"] as const)[k % 5] : k % 4 === 1 ? "shop" : "house");
      const seed = Math.round(x0 * 13 + z0 * 7);
      if (nN > 0) {
        const st = streetAt((x0 + x1) / 2, z0 - 1);
        spots.push(...rowOf("n", z0 + back(nN), x0 + 0.4, x1 - 0.4, dz, seed + 1, kinds(st?.name, nN === 2), nN === 2 ? 3 : 2));
      }
      if (nS > 0) {
        const st = streetAt((x0 + x1) / 2, z1 + 1);
        spots.push(...rowOf("s", z1 - back(nS), x0 + 0.4, x1 - 0.4, dz, seed + 2, kinds(st?.name, nS === 2), nS === 2 ? 3 : 2));
      }
      const zA = z0 + (nN > 0 ? back(nN) + dz : 0.4),
        zB = z1 - (nS > 0 ? back(nS) + dz : 0.4);
      if (nW > 0 && zB - zA > 6) {
        const st = streetAt(x0 - 1, (z0 + z1) / 2);
        spots.push(...rowOf("w", x0 + back(nW), zA, zB, dx, seed + 3, kinds(st?.name, nW === 2), nW === 2 ? 3 : 2));
      }
      if (nE > 0 && zB - zA > 6) {
        const st = streetAt(x1 + 1, (z0 + z1) / 2);
        spots.push(...rowOf("e", x1 - back(nE), zA, zB, dx, seed + 4, kinds(st?.name, nE === 2), nE === 2 ? 3 : 2));
      }
      // the quay walks along its canal sides (the passers-by's), elms and lamps along them
      const quay = (ax: number, az: number, bx: number, bz: number) => {
        walks.push([ax, az, bx, bz]);
        const len = Math.hypot(bx - ax, bz - az);
        for (let u = 5; u < len - 3; u += 10) {
          const x = ax + ((bx - ax) * u) / len,
            z = az + ((bz - az) * u) / len;
          trees.push({ x, z, y: Y0, species: "broad", seed: Math.round(x * 3 + z * 5) });
          if (Math.round(u / 10) % 2 === 0) props.push({ type: "lamp", args: ["#ffc890"], x: x + (bz - az ? 0 : 5), z: z + (bz - az ? 5 : 0), y: Y0, rot: 0 });
          else if (Math.round(u / 10) % 3 === 0) props.push({ type: "bicycle", args: [], x: x + (bz - az ? 0 : 2.5), z: z + (bz - az ? 2.5 : 0), y: Y0, rot: bz - az ? 0 : Math.PI / 2 });
        }
      };
      if (nN === 2) quay(x0 + 3, z0 + 2.2, x1 - 3, z0 + 2.2);
      if (nS === 2) quay(x0 + 3, z1 - 2.2, x1 - 3, z1 - 2.2);
      if (nW === 2) quay(x0 + 2.2, z0 + 3, x0 + 2.2, z1 - 3);
      if (nE === 2) quay(x1 - 2.2, z0 + 3, x1 - 2.2, z1 - 3);
    }
  // Domplein: the guild houses along its north side facing the square (their backs to the Gracht)
  spots.push(...rowOf("s", GSQUARE.z0 + 13, GSQUARE.x0 + 0.5, GSQUARE.x1 - 0.5, 12, 4401, (k) => (["cafe", "bar", "cafe", "shop", "cafe"] as const)[k % 5], 1));
  // the Grote Markt: the guild houses along its east side facing it, their backs to Havnegade's quay
  spots.push(...rowOf("w", GMARKT.x1 - 13, GMARKT.z0 + 0.5, GMARKT.z1 - 26, 12, 5501, (k) => (["cafe", "shop", "bar", "cafe"] as const)[k % 4], 1));
  // the Galleria's block keeps its houses along Havnegade (the waterfront's row)
  spots.push(...rowOf("e", GGALL.x1 - 2.4, GGALL.z0 + 0.4, GGALL.z1 - 0.4, 10, 6601, (k) => (["shop", "house", "cafe", "house"] as const)[k % 4], 2));
  // 24/ZEC's kiosks: the house nearest each spot on its street, its ground floor taken over (its own
  // door left out: the kiosk's is the way in)
  const kiosks: HouseSpot[] = [];
  for (const [face, x, z] of [
    ["s", -1952, -165.4],
    ["e", -2017.4, -16],
    ["s", -2176, -307.4],
  ] as [Face, number, number][]) {
    let best: HouseSpot | null = null,
      bd = Infinity;
    for (const h of spots) {
      if (h.face !== face || h.u1 - h.u0 < 5.4) continue;
      const along = face === "s" || face === "n" ? x : z,
        line = face === "s" || face === "n" ? z : x;
      const d = Math.abs(h.front - line) * 4 + Math.abs((h.u0 + h.u1) / 2 - along);
      if (d < bd) (bd = d), (best = h);
    }
    if (!best || bd > 40) continue;
    best.kind = "house";
    best.door = false;
    kiosks.push(best);
  }
  {
    let k = 0;
    const per = 60;
    for (let n = 0; n < spots.length; n += per) {
      const K = new Kit({ lod: 0 });
      let cx = 0,
        cz = 0;
      for (const h of spots.slice(n, n + per)) {
        house(K, h, facades);
        const m = (h.u0 + h.u1) / 2;
        if (h.face === "n" || h.face === "s") (cx += m), (cz += h.front);
        else (cx += h.front), (cz += m);
        k++;
      }
      const cnt = Math.min(per, spots.length - n);
      S.add(kitGeos(K.out()), cx / cnt, cz / cnt);
      await ctx.yieldFrame();
    }
    void k;
  }
  {
    const K = new Kit({ lod: 0 });
    for (const h of kiosks) {
      const sg = h.face === "s" || h.face === "e" ? 1 : -1;
      martFront(K, MA, { chain: "zec24", face: h.face, front: h.front + 0.12 * sg, at: (h.u0 + h.u1) / 2, w: h.u1 - h.u0 - 0.7, y0: Y0, kiosk: true }, mo);
    }
    // GAMLA GALLERIA: five storeys of warm plaster over a stone plinth, the glass atrium facing the
    // market across Markt, STORHUSET and MARKT FOODS at its ends; the car park's decks behind it
    const G = GGALL;
    mallBox(K, MA, { mall: "gamla", face: "n", front: G.z0 + 9.4, at: -1976, w: 52, d: 48, h: 18, y0: Y0, atrium: 16, anchors: [[-25, -13, 0, true], [13, 25, 1, false]], clad: "#e8d6b6", cladSlot: "plaster" }, mo);
    parkade(K, MA, { face: "s", front: G.z1 - 2.4, at: -1976, w: 52, d: 40, levels: 3, y0: Y0 }, mo);
    S.add(kitGeos(K.out()), -1976, 10);
    places.push({ name: "Gamla Galleria", box: { x0: -2002, x1: -1950, z0: G.z0, z1: G.z1 } });
    for (const f of mo.facades) facades.push(f);
    props.push(...mo.props);
  }
  // the cafés' terraces on Domplein (along its guild houses) and on the Grote Markt — an aisle left
  // clear in front of every door (the tables and their parasols stood on the doorsteps)
  {
    const K = new Kit({ lod: 0 });
    let n = 0;
    // (a table's parasol reaches 1.5 m round it: one 1.7 m to the side of a door leaves its way clear)
    const aisle = (x: number, z: number) => facades.some((f) => Math.abs(f.door.x - x) < (f.face === "s" || f.face === "n" ? 1.7 : 7.5) && Math.abs(f.door.z - z) < (f.face === "s" || f.face === "n" ? 7.5 : 1.7));
    const at = (x: number, z: number, area: string) => {
      if (aisle(x, z)) return void n++;
      terrace(K, x, z, n++, seats, area);
    };
    for (let x = GSQUARE.x0 + 4; x < GSQUARE.x1 - 3; x += 4.2) for (const dz of [3.2, 6.4]) at(x + (dz > 4 ? 2 : 0), GSQUARE.z0 + 13 + dz, "gamla-dom");
    for (let z = GMARKT.z0 + 5; z < GMARKT.z1 - 30; z += 4.2) for (const dx of [3.2, 6.4]) at(GMARKT.x1 - 13 - dx, z + (dx > 4 ? 2 : 0), "gamla-markt");
    const g = kitMeshes(kitGeos(K.out()));
    g.name = "gamla:terraces";
    near.add(g);
  }

  // ---------------------------------------------------------------------------------------------------
  cathedral(S, facades, places, signs);
  await ctx.yieldFrame();
  markt(S, facades, places, signs, props, trees, seats, walks);
  domplein(S, places, props, trees, walks);
  await ctx.yieldFrame();
  castle(S, near, facades, places, ctx);
  await ctx.yieldFrame();
  harbour(S, near, places, props, walks);
  canalLife(near, ctx, S);
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // the streets: lamps (the old town's lanterns on posts), trees on the boulevard, a bench here and there
  const juncs: [number, number][] = [];
  for (const a of ctx.isle.streets) for (const b of ctx.isle.streets) if (a.axis === "x" && b.axis === "z" && b.at >= a.from - 1 && b.at <= a.to + 1 && a.at >= b.from - 1 && a.at <= b.to + 1) juncs.push([b.at, a.at]);
  const nearJ = (x: number, z: number, r: number) => juncs.some(([jx, jz]) => Math.abs(jx - x) < r && Math.abs(jz - z) < r);
  const doorNear = (x: number, z: number, r: number) => facades.some((f) => Math.hypot(f.door.x - x, f.door.z - z) < r);
  const wet = (x: number, z: number) => ctx.ground(x, z) < 0;
  for (const s of ctx.isle.streets) {
    const len = s.to - s.from;
    for (const side of [-1, 1]) {
      const off = s.width / 2 + 0.7;
      for (let u = 10; u < len - 6; u += 24) {
        const along = s.from + u + (side > 0 ? 12 : 0);
        const [x, z] = s.axis === "x" ? [along, s.at + side * off] : [s.at + side * off, along];
        if (nearJ(x, z, s.width / 2 + 6) || doorNear(x, z, 3) || ctx.road(x, z) || wet(x, z) || !inBox(GLAND, x, z, -0.5)) continue;
        const rot = s.axis === "x" ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
        props.push({ type: "lamp", args: ["#ffc27a"], x, z, y: Y0, rot });
      }
      if (s.width < 14) continue;
      for (let u = 8; u < len - 4; u += 12) {
        const along = s.from + u;
        const [x, z] = s.axis === "x" ? [along, s.at + side * (s.width / 2 + 1.8)] : [s.at + side * (s.width / 2 + 1.8), along];
        if (nearJ(x, z, s.width / 2 + 6) || doorNear(x, z, 4) || ctx.road(x, z) || wet(x, z) || !inBox(GLAND, x, z, -0.5)) continue;
        // (the parvis and Domplein open to the cathedral's front)
        if (x > GSQUARE.x0 - 4 && x < GSQUARE.x1 + 4) continue;
        trees.push({ x, z, y: Y0, species: "plane", seed: Math.round(x * 3 + z) });
      }
    }
  }
  // the east promenade facing the city across the strait (benches, lamps, its walk)
  for (let z = GZ.kade + 8; z < GZ.zuid - 6; z += 12) {
    if (Math.abs(z - GZ.blvd) < 12 || Math.abs(z - GC.gracht) < 10 || Math.abs(z - GZ.markt) < 8) continue;
    props.push({ type: Math.round(z / 12) % 2 ? "bench" : "lamp", args: Math.round(z / 12) % 2 ? [] : ["#ffc27a"], x: GLAND.x1 - 2, z, y: Y0, rot: Math.PI / 2 });
  }
  walks.push([GLAND.x1 - 4, GZ.kade + 6, GLAND.x1 - 4, GC.gracht - 10], [GLAND.x1 - 4, GC.gracht + 10, GLAND.x1 - 4, GZ.zuid - 6]);
  // (nothing standing in front of a door: a tree, a lamp, a bicycle on the quay moved off)
  const clear = (x: number, z: number) => !facades.some((f) => Math.hypot(f.door.x - x, f.door.z - z) < 2.4 || Math.hypot(f.door.x + f.out.x * 2 - x, f.door.z + f.out.z * 2 - z) < 2.0);
  const lamps = placeProps(near, props.filter((q) => clear(q.x, q.z))).lights;
  plantTrees(near, trees.filter((t) => clear(t.x, t.z)));
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // cars parked along the narrower streets (the game can take them)
  const parked: { obj: THREE.Group; kind: CarKind }[] = [];
  {
    const kinds: CarKind[] = ["sedan", "convertible", "sedan", "van", "suv", "sedan", "sports"];
    const paints = ["#e8e6e2", "#22242a", "#8a2a3a", "#2a4a7a", "#c8ccd4", "#3a5a40", "#d8c8a0", "#6a8aa0"];
    let k = 0;
    for (const s of ctx.isle.streets) {
      if (s.width >= 12) continue;
      for (let u = 16; u < s.to - s.from - 12; u += 7.4) {
        k++;
        if ((k * 7) % 6 < 3) continue;
        const along = s.from + u;
        const off = s.width / 2 - 1.15;
        const [x, z] = s.axis === "x" ? [along, s.at + off] : [s.at + off, along];
        if (nearJ(x, z, s.width / 2 + 9) || doorNear(x, z, 5) || wet(x + (s.axis === "x" ? 0 : 2), z + (s.axis === "x" ? 2 : 0))) continue;
        const kind = kinds[k % kinds.length];
        const obj = carObject(kind, { paint: paints[(k * 5) % paints.length] });
        obj.position.set(x, 0.012, z);
        obj.rotation.y = s.axis === "x" ? Math.PI : -Math.PI / 2;
        near.add(obj);
        parked.push({ obj, kind });
        if (parked.length >= 36) break;
      }
      if (parked.length >= 36) break;
    }
  }

  S.build(root, "gamla:town");
  places.push({ name: "Gamla", box: GLAND });
  const marts = MA.mesh("gamla:marts");
  if (marts) root.add(marts);

  // the hill's own floor (the castle's: walked up; the game's solid shape sees only the paving)
  const hillAt = (x: number, z: number) => {
    const d = Math.hypot(x - GCASTLE.x, z - GCASTLE.z);
    if (d >= GCASTLE.r) return 0;
    const t = d / GCASTLE.r;
    const p = Math.min(0.9, (GCASTLE.top ?? GCASTLE.r * 0.34) / GCASTLE.r);
    return GCASTLE.h * (t < p ? 1 : 0.5 + 0.5 * Math.cos(((t - p) / (1 - p)) * Math.PI));
  };
  return {
    facades,
    parked,
    walks,
    places,
    floor: (x: number, z: number) => {
      const h = hillAt(x, z);
      return h > 0.05 ? Y0 + h : null;
    },
    // (on foot up the hill the game asks the island, not its solid shape: the castle's walls and towers)
    blocked: (x: number, z: number) => castleBlocked(x, z),
    lamps: [...lamps, ...mo.lamps],
    seats,
  };
}

/** The castle's curtain walls, its towers and its gatehouse on the hill: a body stops there (its gate shut: E at its door). */
const CASTLE_R = 14;
function castleBlocked(x: number, z: number) {
  const R = CASTLE_R;
  const dx = x - GCASTLE.x,
    dz = z - GCASTLE.z;
  const ax = Math.abs(dx),
    az = Math.abs(dz);
  if (ax > R + 4.2 || az > R + 4.4) return false;
  // the round towers at the corners, the gatehouse's either side of the arch
  if (Math.hypot(ax - R, az - R) < 3.75) return true;
  if (Math.hypot(ax - 4.6, dz - (R + 1)) < 2.95) return true;
  // the curtain walls (2 m thick on their line, a hand's margin each side)
  const band = (v: number) => Math.abs(v - R) < 1.3;
  if ((band(ax) && az < R + 1.3) || (band(az) && ax < R + 1.3)) {
    // (the gate: its doors shut, the doorstep in front of them free)
    if (dz > 0 && ax < 1.9) return dz < R + 0.55;
    return true;
  }
  return false;
}

// =====================================================================================================
// Peberholm: the islet where the bridge comes down and the tunnel begins
function islet(root: THREE.Group, near: THREE.Group, props: PropSpot[], trees: TreeSpot[]) {
  const B = ISLET;
  const half = 7.4 + 2.2 + 0.8;
  const PAD = 16;
  const STEP = 3;
  // (its outline: an elongated hexagon round the course; inside it the land, outside the armour to the floor)
  const inside = (x: number, z: number) => {
    const u = (x - B.x0) / (B.x1 - B.x0);
    const taper = Math.min(1, u / 0.18, (1 - u) / 0.12);
    const w = (B.z1 - B.z0) / 2 * Math.max(0.35, taper);
    return u > 0 && u < 1 && Math.abs(z - WB.z) < w ? -Math.min(u * (B.x1 - B.x0), (1 - u) * (B.x1 - B.x0), w - Math.abs(z - WB.z)) : 1;
  };
  const out = (x: number, z: number) => {
    // metres outside the outline (negative inside), sampled roughly
    const v = inside(x, z);
    if (v < 0) return v;
    let best = 99;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      for (const r of [2, 4, 6, 9, 12, 16]) if (inside(x + Math.cos(ang) * r, z + Math.sin(ang) * r) < 0) best = Math.min(best, r);
    }
    return best;
  };
  const sx = (x: number) => WB.x0 - x;
  const cut = (x: number, z: number) => {
    // (the corridor: where the road dips into its cutting and the tube's cover stands, no ground over it)
    const s = sx(x);
    return Math.abs(z - WB.z) < half + 1 && s > 1186 && s < 1312;
  };
  const pos: number[] = [],
    col: number[] = [];
  const grass = new THREE.Color("#7f9a5a"),
    rock = new THREE.Color("#8e8a82"),
    sand = new THREE.Color("#d8c8a0"),
    c = new THREE.Color();
  const h = (x: number, z: number) => {
    const d = out(x, z);
    if (d <= 0) return Y0;
    return Math.max(-6, Y0 - d * 0.62);
  };
  for (let x = B.x0 - PAD; x < B.x1 + PAD; x += STEP)
    for (let z = B.z0 - PAD; z < B.z1 + PAD; z += STEP) {
      if (cut(x + STEP / 2, z + STEP / 2)) continue;
      const corners: [number, number][] = [
        [x, z],
        [x, z + STEP],
        [x + STEP, z],
        [x + STEP, z],
        [x, z + STEP],
        [x + STEP, z + STEP],
      ];
      const ys = corners.map(([px, pz]) => h(px, pz));
      if (Math.max(...ys) < -5.9) continue;
      corners.forEach(([px, pz], k) => {
        pos.push(px, ys[k], pz);
        const y = ys[k];
        c.copy(y >= Y0 - 0.01 ? grass : y > WATER + 0.3 ? rock : sand).multiplyScalar(1 + Math.sin(px * 0.9) * Math.cos(pz * 0.7) * 0.06);
        col.push(c.r, c.g, c.b);
      });
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const ctr = geo.boundingBox!.getCenter(new THREE.Vector3());
  geo.translate(-ctr.x, 0, -ctr.z);
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, terrainMat());
  m.position.set(ctr.x, 0, ctr.z);
  m.receiveShadow = true;
  m.name = "gamla:islet";
  root.add(m);
  // the lighthouse at its western tip, a service road along its south side
  const K = new Kit({ lod: 0 });
  const lx = B.x0 + 10,
    lz = WB.z + 16;
  K.cyl("lm.Concrete034", lx, lz, 3.2, 2.4, Y0, Y0 + 22, hex("#f4f2ee"), { sides: 20 });
  K.cyl("lm.paint", lx, lz, 2.9, 2.75, Y0 + 9, Y0 + 12, hex("#c8342a"), { sides: 20, caps: "none" });
  K.cyl("lm.paint", lx, lz, 3.4, 3.4, Y0 + 22, Y0 + 22.5, hex("#2a2a2a"), { sides: 20 });
  K.cyl("lm.glow", lx, lz, 1.7, 1.7, Y0 + 22.5, Y0 + 25, hex("#fff4d0", 0.9), { sides: 16, caps: "none" });
  K.cyl("lm.paint", lx, lz, 2.2, 0.3, Y0 + 25, Y0 + 27.5, hex("#c8342a"), { sides: 16 });
  K.box("lm.Concrete034", B.x0 + 30, Y0 - 0.02, WB.z + 15, B.x1 - 40, Y0 + 0.03, WB.z + 18.5, hex("#a8a49c"));
  const g = kitMeshes(kitGeos(K.out()));
  g.name = "gamla:lighthouse";
  root.add(g);
  for (let x = B.x0 + 36; x < B.x1 - 40; x += 22) {
    trees.push({ x, z: WB.z - 24, y: Y0, species: "pine", seed: Math.round(x) });
    props.push({ type: "bench", args: [], x: x + 9, z: WB.z + 21, y: Y0, rot: Math.PI });
  }
  void near;
}

// =====================================================================================================
// St. Proof's Cathedral
function cathedral(S: Sectors, facades: IsleFacade[], places: { name: string; box: Box }[], signs: THREE.Group) {
  const K = new Kit({ lod: 0 });
  const st = hex("#efe6d4"),
    stD = hex("#d8ccb6"),
    slate = hex("#4c5058"),
    copper = hex("#6f9c8a");
  const cx = (GCATH.x0 + GCATH.x1) / 2;
  const zF = GCATH.z0 + 2; // the front (north) face of the towers
  const z0 = zF + 16; // the nave's start behind the towers
  const zT0 = -84,
    zT1 = -70; // the transept
  const zA = GCATH.z1 - 12; // the apse's start
  const nave = 11,
    aisle = 22;
  // (stained glass: dim by day, glowing at night)
  const glassDay = hex("#7a6aa8");
  // the nave: tall walls, the clerestory's lancets, the steep slate roof
  K.box("lm.Bricks008", cx - nave, Y0, z0, cx + nave, Y0 + 30, zA, st, { skip: "-y" });
  for (const sd of [-1, 1]) {
    for (let z = z0 + 5; z < zA - 3; z += 7) {
      if (z > zT0 - 4 && z < zT1 + 4) continue;
      const x = cx + sd * nave;
      lancet(K, x + sd * 0.04, z, Y0 + 18, 2.2, 9, sd > 0 ? "e" : "w", glassDay);
    }
    // the aisles: lower, their lean-to roofs, their windows
    K.box("lm.Bricks008", sd < 0 ? cx - aisle : cx + nave, Y0, z0, sd < 0 ? cx - nave : cx + aisle, Y0 + 14, zA, st, { skip: "-y" });
    const ax = cx + sd * aisle;
    for (let z = z0 + 5; z < zA - 3; z += 7) {
      if (z > zT0 - 4 && z < zT1 + 4) continue;
      lancet(K, ax + sd * 0.04, z, Y0 + 3.5, 2.4, 8, sd > 0 ? "e" : "w", glassDay);
      // a flying buttress: the pier outside, its pinnacle, the half arch over the aisle roof to the nave
      const px = cx + sd * (aisle + 2.6);
      K.box("lm.Bricks008", px - 1.1, Y0, z - 1.3, px + 1.1, Y0 + 20, z + 1.3, stD);
      K.cyl("lm.Bricks008", px, z, 1.0, 0.05, Y0 + 20, Y0 + 25.5, stD, { sides: 4 });
      K.bar("lm.Bricks008", [px, Y0 + 18.5, z], [cx + sd * (nave + 0.3), Y0 + 25, z], 0.9, stD);
      K.bar("lm.Bricks008", [px, Y0 + 15.5, z], [cx + sd * (nave + 0.3), Y0 + 21, z], 0.7, stD);
    }
    K.quad("tile" as never, [cx + sd * nave, Y0 + 20, z0], [cx + sd * aisle, Y0 + 14, z0], [cx + sd * aisle, Y0 + 14, zA], [cx + sd * nave, Y0 + 20, zA], [sd * 0.7, 0.7, 0], (p) => [p[2] / 2, p[1] / 1.4], slate);
  }
  for (const sd of [-1, 1]) K.quad("tile" as never, [cx, Y0 + 46, z0], [cx + sd * (nave + 0.4), Y0 + 29.6, z0], [cx + sd * (nave + 0.4), Y0 + 29.6, zA], [cx, Y0 + 46, zA], [sd * 0.7, 0.7, 0], (p) => [p[2] / 2, p[1] / 1.4], slate);
  // the transept: the arms out to the cathedral's sides, their gables and rose windows
  K.box("lm.Bricks008", GCATH.x0, Y0, zT0, GCATH.x1, Y0 + 30, zT1, st, { skip: "-y" });
  for (const sd of [-1, 1]) {
    const x = sd < 0 ? GCATH.x0 : GCATH.x1;
    K.tri("lm.Bricks008" as never, [x, Y0 + 30, zT0], [x, Y0 + 30, zT1], [x, Y0 + 42, (zT0 + zT1) / 2], [sd, 0, 0], (p) => [p[2] / 2, p[1] / 2], st);
    rose(K, x + sd * 0.05, (zT0 + zT1) / 2, Y0 + 21, 4.6, sd > 0 ? "e" : "w");
    lancet(K, x + sd * 0.05, (zT0 + zT1) / 2 - 3.2, Y0 + 4, 2.2, 10, sd > 0 ? "e" : "w", glassDay);
    lancet(K, x + sd * 0.05, (zT0 + zT1) / 2 + 3.2, Y0 + 4, 2.2, 10, sd > 0 ? "e" : "w", glassDay);
    for (const zz of [zT0, zT1]) K.quad("tile" as never, [cx, Y0 + 42, (zT0 + zT1) / 2], [x, Y0 + 42, (zT0 + zT1) / 2], [x, Y0 + 30, zz], [cx, Y0 + 30, zz], [0, 0.7, zz === zT0 ? -0.7 : 0.7], (p) => [p[0] / 2, p[1] / 1.4], slate);
  }
  // the apse: a half decagon round the choir, its tall windows, its roof
  {
    const ring: V2[] = [];
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI - (k / 10) * Math.PI;
      ring.push([cx + Math.cos(a) * nave, zA + Math.sin(a) * 11]);
    }
    const pts: V2[] = [[cx - nave, zA], ...ring.slice(1, -1), [cx + nave, zA]];
    K.prism("lm.Bricks008", pts.slice().reverse(), Y0, Y0 + 30, st, { lid: null });
    for (let k = 1; k < 10; k++) {
      const a = Math.PI - ((k + 0.5) / 10) * Math.PI;
      const x = cx + Math.cos(a) * (nave + 0.06),
        z = zA + Math.sin(a) * 11.06;
      K.box("lm.glow.night", x - 0.8, Y0 + 12, z - 0.8, x + 0.8, Y0 + 24, z + 0.8, hex(k % 2 ? "#d8463a" : "#3a6ad8", 0.7), { skip: "-y+y" });
    }
    const cone: { y: number; pts: V2[] }[] = [
      { y: Y0 + 30, pts: pts.slice().reverse() },
      { y: Y0 + 41, pts: pts.slice().reverse().map(([x, z]) => [cx + (x - cx) * 0.15, zA + (z - zA) * 0.15] as V2) },
    ];
    K.loft("tile", cone, slate, { lid: null });
  }
  // the crossing's flèche: a slender lead and copper spire over the crossing
  K.cyl("lm.Metal024", cx, (zT0 + zT1) / 2, 3.2, 3.2, Y0 + 44, Y0 + 52, copper, { sides: 8 });
  K.cyl("lm.Metal024", cx, (zT0 + zT1) / 2, 3.0, 0.1, Y0 + 52, Y0 + 82, copper, { sides: 8 });
  // the west front (here the north): the two towers, their belfries and spires, the portals, the rose
  for (const sd of [-1, 1]) {
    const tx0 = sd < 0 ? GCATH.x0 + 1 : cx + 10,
      tx1 = sd < 0 ? cx - 10 : GCATH.x1 - 1;
    const tcx = (tx0 + tx1) / 2,
      tcz = zF + 8;
    K.box("lm.Bricks008", tx0, Y0, zF, tx1, Y0 + 66, zF + 16, st, { skip: "-y" });
    // buttresses up its corners, string courses
    for (const bx of [tx0, tx1]) K.box("lm.Bricks008", bx - 1.2, Y0, zF - 1.4, bx + 1.2, Y0 + 58, zF + 1.2, stD);
    for (const y of [16, 34, 52]) K.box("lm.Bricks008", tx0 - 0.3, Y0 + y, zF - 0.4, tx1 + 0.3, Y0 + y + 0.7, zF + 16.3, stD);
    // the belfry's tall openings on each face, the windows below
    for (const f of ["n", "e", "w"] as Face[]) {
      const [x, z] = f === "n" ? [tcx, zF - 0.05] : f === "e" ? [tx1 + 0.05, tcz] : [tx0 - 0.05, tcz];
      lancet(K, x, z - (f === "n" ? 0 : 2.4), Y0 + 54, 1.6, 9, f, hex("#1a1c20"));
      if (f !== "n") lancet(K, x, z + 2.4, Y0 + 54, 1.6, 9, f, hex("#1a1c20"));
      else lancet(K, x - 3, z, Y0 + 54, 1.6, 9, f, hex("#1a1c20")), lancet(K, x + 3, z, Y0 + 54, 1.6, 9, f, hex("#1a1c20"));
      lancet(K, x, z, Y0 + 36, 1.4, 7, f, glassDay);
    }
    // the spire: an octagonal stone needle with pinnacles at its foot, a gilt finial
    K.cyl("lm.Bricks008", tcx, tcz, 6.4, 6.4, Y0 + 66, Y0 + 70, stD, { sides: 8 });
    K.cyl("lm.Bricks008", tcx, tcz, 5.8, 0.25, Y0 + 70, Y0 + 104, st, { sides: 8 });
    for (const [px, pz] of [
      [tx0 + 1, zF + 1],
      [tx1 - 1, zF + 1],
      [tx0 + 1, zF + 15],
      [tx1 - 1, zF + 15],
    ])
      K.cyl("lm.Bricks008", px, pz, 1.1, 0.05, Y0 + 66, Y0 + 75, stD, { sides: 4 });
    K.sphere("lm.Metal024.metal", tcx, Y0 + 104.6, tcz, 0.6, hex("#e0b040"));
    // the tower's own portal
    portal(K, tcx, zF, 4.2, 8.5, st, stD);
  }
  // the centre between the towers: the gable, the rose window, the gallery, the great portal
  K.box("lm.Bricks008", cx - 10, Y0, zF + 2, cx + 10, Y0 + 40, zF + 16, st, { skip: "-y" });
  K.tri("lm.Bricks008" as never, [cx - 10, Y0 + 40, zF + 2], [cx + 10, Y0 + 40, zF + 2], [cx, Y0 + 50, zF + 2], [0, 0, -1], (p) => [p[0] / 2, p[1] / 2], st);
  for (let x = cx - 9; x <= cx + 9; x += 2) K.box("lm.Bricks008", x - 0.25, Y0 + 30, zF + 1.4, x + 0.25, Y0 + 33.5, zF + 2, stD);
  K.box("lm.Bricks008", cx - 10, Y0 + 29.6, zF + 1.2, cx + 10, Y0 + 30.1, zF + 2.1, stD);
  K.box("lm.Bricks008", cx - 10, Y0 + 33.5, zF + 1.2, cx + 10, Y0 + 34, zF + 2.1, stD);
  rose(K, cx, zF + 1.96, Y0 + 22, 6.2, "n");
  portal(K, cx, zF + 2, 6.4, 11.5, st, stD);
  const S0 = kitGeos(K.out());
  S.add(S0, cx, (GCATH.z0 + GCATH.z1) / 2);
  // the game's door: the great portal (the parvis in front of it)
  facades.push({ type: "office", face: "n", x0: cx - 3.2, x1: cx + 3.2, z: zF + 2, out: { x: 0, y: 0, z: -1 }, door: { x: cx, z: zF + 2 - 0.35 } });
  signs.add(put(sign("ST. PROOF'S CATHEDRAL", 16, 1.2, "#f4e6c4", "rgba(40,30,20,0.7)"), cx, Y0 + 13.6, zF + 1.0, "n"));
  places.push({ name: "St. Proof's Cathedral", box: { x0: GCATH.x0 - 6, x1: GCATH.x1 + 6, z0: GCATH.z0 - 4, z1: GCATH.z1 + 4 } });
}

/** A gothic lancet window on a wall facing `f`: a pointed opening of glass, its stone frame (w wide, h tall from y). */
function lancet(K: Kit, x: number, z: number, y: number, w: number, h: number, f: Face, glass: V3) {
  const F = frame(f, f === "n" || f === "s" ? z : x);
  const u = f === "n" || f === "s" ? x : z;
  const fr = onlyFront(f);
  F.box(K, "lm.Bricks008", u - w / 2 - 0.3, u + w / 2 + 0.3, y - 0.3, y + h - w * 0.4, -0.08, 0.02, hex("#bdb29c"), fr);
  F.box(K, "lm.glow.night", u - w / 2, u + w / 2, y, y + h - w * 0.55, -0.12, 0.02, glass, fr);
  // the pointed head: a small triangle of glass in its frame
  const [ox, oz] = F.out;
  const n: V3 = [ox, 0, oz];
  const yh = y + h - w * 0.55;
  K.tri("lm.Bricks008" as never, F.P(u - w / 2 - 0.3, yh - 0.05, -0.08), F.P(u + w / 2 + 0.3, yh - 0.05, -0.08), F.P(u, y + h + 0.3, -0.08), n, (p) => [(p[0] + p[2]) / 2, p[1] / 2], hex("#bdb29c"));
  K.tri("lm.glow.night" as never, F.P(u - w / 2, yh, -0.13), F.P(u + w / 2, yh, -0.13), F.P(u, y + h - 0.1, -0.13), n, () => [0, 0], glass);
}

/** A rose window facing f: a wheel of coloured glass in a stone ring, its tracery. */
function rose(K: Kit, x: number, z: number, y: number, r: number, f: Face) {
  const F = frame(f, f === "n" || f === "s" ? z : x);
  const u0 = f === "n" || f === "s" ? x : z;
  const [ox, oz] = F.out;
  const n: V3 = [ox, 0, oz];
  const N = 24;
  const cols = ["#c8342a", "#2a4ac8", "#e0b030", "#2a8a5a", "#8a2ac8"];
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2,
      a1 = ((k + 1) / N) * Math.PI * 2;
    const p = (a: number, rr: number, d: number) => F.P(u0 + Math.cos(a) * rr, y + Math.sin(a) * rr, d);
    K.quad("lm.Bricks008" as never, p(a0, r, -0.1), p(a1, r, -0.1), p(a1, r + 0.9, -0.1), p(a0, r + 0.9, -0.1), n, () => [0, 0], hex("#bdb29c"));
    K.tri("lm.glow.night" as never, F.P(u0, y, -0.14), p(a0, r, -0.14), p(a1, r, -0.14), n, () => [0, 0], hex(cols[k % cols.length], 0.8));
    if (k % 2 === 0) K.bar("lm.Bricks008" as never, F.P(u0, y, -0.18), p(a0, r, -0.18), 0.22, hex("#bdb29c"));
  }
}

/** A recessed gothic portal on a north-facing front at z: its jambs stepping in, its pointed arch, the doors. */
function portal(K: Kit, x: number, z: number, w: number, h: number, st: V3, stD: V3) {
  for (let k = 0; k < 4; k++) {
    const e = k * 0.45;
    K.box("lm.Bricks008", x - w / 2 - 1.8 + e, Y0, z - 1.6 + e * 0.8, x - w / 2 - 1.2 + e, Y0 + h - 1.5 + e * 0.4, z - 1.6 + e * 0.8 + 0.4, k % 2 ? stD : st);
    K.box("lm.Bricks008", x + w / 2 + 1.2 - e, Y0, z - 1.6 + e * 0.8, x + w / 2 + 1.8 - e, Y0 + h - 1.5 + e * 0.4, z - 1.6 + e * 0.8 + 0.4, k % 2 ? stD : st);
  }
  // the gable over it (a pointed hood), the tympanum, the doors
  K.tri("lm.Bricks008" as never, [x - w / 2 - 2.1, Y0 + h - 1.6, z - 1.7], [x + w / 2 + 2.1, Y0 + h - 1.6, z - 1.7], [x, Y0 + h + 3.6, z - 1.7], [0, 0, -1], (p) => [p[0] / 2, p[1] / 2], stD);
  K.box("lm.Bricks008", x - w / 2, Y0 + h - 4.2, z - 0.25, x + w / 2, Y0 + h - 1.6, z, st, { skip: "+z" });
  K.box("lm.Wood049", x - w / 2 + 0.2, Y0, z - 0.2, x + w / 2 - 0.2, Y0 + h - 4.3, z, hex("#8a6040"), { skip: "+z" });
  K.box("lm.Metal024.metal", x - 0.08, Y0, z - 0.26, x + 0.08, Y0 + h - 4.3, z - 0.18, hex("#2a2420"));
  K.box("lm.Bricks008", x - w / 2 - 2, Y0 - 0.1, z - 3.2, x + w / 2 + 2, Y0 + 0.14, z, hex("#bdb5a6"), { skip: "-y" });
}

// =====================================================================================================
// the Grote Markt: the Belfort over the cloth hall on its south side, the stalls, the terraces
function markt(S: Sectors, facades: IsleFacade[], places: { name: string; box: Box }[], signs: THREE.Group, props: PropSpot[], trees: TreeSpot[], seats: IsleSeat[], walks: [number, number, number, number][]) {
  const K = new Kit({ lod: 0 });
  const brick = hex("#8a5a42"),
    stone = hex("#cfc3aa");
  // the cloth hall along the south side (facing north into the market), its arcade, the belfry in its middle
  const hz1 = GMARKT.z1 - 1,
    hz0 = hz1 - 20,
    hx0 = GMARKT.x0 + 1,
    hx1 = GMARKT.x1 - 14;
  K.box("brick", hx0, Y0, hz0, hx1, Y0 + 14, hz1, brick, { skip: "-y" });
  for (const sd of [-1, 1]) K.quad("tile" as never, [hx0, Y0 + 14, sd < 0 ? hz0 : hz1], [hx1, Y0 + 14, sd < 0 ? hz0 : hz1], [hx1, Y0 + 22, (hz0 + hz1) / 2], [hx0, Y0 + 22, (hz0 + hz1) / 2], [0, 0.7, sd * 0.7], (p) => [p[0] / 2, p[1] / 1.4], hex("#5a3a30"));
  for (const x of [hx0, hx1]) K.tri("brick" as never, [x, Y0 + 14, hz0], [x, Y0 + 14, hz1], [x, Y0 + 22, (hz0 + hz1) / 2], [x === hx0 ? -1 : 1, 0, 0], (p) => [p[2] / 1.6, p[1] / 1.6], brick);
  const F = frame("n", hz0);
  for (let x = hx0 + 3; x < hx1 - 2; x += 5) {
    if (Math.abs(x - (hx0 + hx1) / 2) < 7) continue;
    F.box(K, "lm.Concrete034", x - 1.9, x + 1.9, Y0, Y0 + 5.2, -0.08, 0.02, stone, onlyFront("n"));
    F.box(K, "lm.glow", x - 1.5, x + 1.5, Y0, Y0 + 4.6, -0.1, 0.02, hex("#ffd8a0", 0.45), onlyFront("n"));
    F.box(K, "lm.paint", x - 0.7, x + 0.7, Y0 + 7.5, Y0 + 10.5, -0.06, 0.02, hex("#f2ede2"), onlyFront("n"));
    F.box(K, "lm.glass", x - 0.55, x + 0.55, Y0 + 7.65, Y0 + 10.35, -0.08, 0.02, hex("#9aa4ae"), onlyFront("n"));
  }
  // the Belfort: a square brick tower, its stone upper stages, the octagon and its gallery on top
  const bx = (hx0 + hx1) / 2,
    bz = hz0 + 6;
  K.box("brick", bx - 7, Y0, bz - 7, bx + 7, Y0 + 48, bz + 7, brick, { skip: "-y" });
  for (const y of [16, 32, 48]) K.box("lm.Concrete034", bx - 7.4, Y0 + y - 0.6, bz - 7.4, bx + 7.4, Y0 + y + 0.4, bz + 7.4, stone);
  for (const [cx, cz] of [
    [bx - 7, bz - 7],
    [bx + 7, bz - 7],
    [bx - 7, bz + 7],
    [bx + 7, bz + 7],
  ])
    K.cyl("lm.Concrete034", cx, cz, 1.2, 0.05, Y0 + 48.4, Y0 + 54, stone, { sides: 6 });
  K.cyl("brick", bx, bz, 5.2, 5.2, Y0 + 48.4, Y0 + 70, brick, { sides: 8 });
  K.cyl("lm.Concrete034", bx, bz, 5.8, 5.8, Y0 + 70, Y0 + 71, stone, { sides: 8 });
  K.cyl("lm.Metal024", bx, bz, 4.6, 0.3, Y0 + 71, Y0 + 80, hex("#5a6a62"), { sides: 8 });
  // the clock on its north face, the great door
  K.cyl("lm.glow", bx, bz - 7.05, 2.2, 2.2, Y0 + 38, Y0 + 38.1, hex("#fff2d8", 0.5), { sides: 24 });
  lancet(K, bx, bz - 7.02, Y0 + 52, 1.6, 8, "n", hex("#1a1c20"));
  lancet(K, bx, bz - 7.02, Y0 + 20, 1.6, 8, "n", hex("#3a4250"));
  F.box(K, "lm.Concrete034", bx - 2.4, bx + 2.4, Y0, Y0 + 6, -0.6, 0.02, stone, onlyFront("n"));
  F.box(K, "lm.Wood049", bx - 1.8, bx + 1.8, Y0, Y0 + 5, -0.65, 0.02, hex("#3a2a1e"), onlyFront("n"));
  S.add(kitGeos(K.out()), bx, bz);
  facades.push({ type: "streetshop", face: "n", x0: bx - 1.8, x1: bx + 1.8, z: bz - 7, out: { x: 0, y: 0, z: -1 }, door: { x: bx, z: bz - 7 - 0.95 } });
  signs.add(put(sign("BELFORT", 7, 1.1, "#f4e6c4", "rgba(40,30,20,0.75)"), bx, Y0 + 6.6, bz - 7.1, "n"));
  // the stalls (two rows), café terraces along the guild houses, a few trees
  const mx0 = GMARKT.x0 + 6,
    mx1 = GMARKT.x1 - 18;
  for (let x = mx0; x < mx1; x += 7)
    for (const z of [GMARKT.z0 + 22, GMARKT.z0 + 36]) {
      const rot = z < GMARKT.z0 + 30 ? 0 : Math.PI;
      props.push({ type: "stall", args: [], x, z, y: Y0, rot });
      // its stallholder behind the counter, facing the shoppers
      seats.push({ x: x - Math.sin(rot) * 0.75, z: z - Math.cos(rot) * 0.75, y: Y0, h: rot, stand: true, area: "gamla-markt" });
    }
  // (the shoppers' walks: down the stalls' fronts and between their rows)
  walks.push([mx0 - 3, GMARKT.z0 + 18, mx1, GMARKT.z0 + 18], [mx0 - 3, GMARKT.z0 + 29, mx1, GMARKT.z0 + 29], [mx0 - 3, GMARKT.z0 + 40, mx1, GMARKT.z0 + 40]);
  for (let z = GMARKT.z0 + 6; z < GMARKT.z1 - 30; z += 4.5) props.push({ type: "bench", args: [], x: GMARKT.x1 - 17, z, y: Y0, rot: -Math.PI / 2 });
  for (const [x, z] of [
    [GMARKT.x0 + 5, GMARKT.z0 + 5],
    [GMARKT.x0 + 5, GMARKT.z0 + 52],
  ])
    trees.push({ x, z, y: Y0, species: "plane", seed: Math.round(x + z) });
  places.push({ name: "the Grote Markt", box: { x0: GMARKT.x0, x1: GMARKT.x1, z0: GMARKT.z0, z1: GMARKT.z1 } });
  places.push({ name: "the Belfort", box: { x0: bx - 9, x1: bx + 9, z0: bz - 9, z1: bz + 9 } });
}

// Domplein: the square across the boulevard from the cathedral
function domplein(S: Sectors, places: { name: string; box: Box }[], props: PropSpot[], trees: TreeSpot[], walks: [number, number, number, number][]) {
  const K = new Kit({ lod: 0 });
  const cx = (GSQUARE.x0 + GSQUARE.x1) / 2,
    cz = (GSQUARE.z0 + GSQUARE.z1) / 2 + 8;
  // a cobbled ring round a fountain, a statue on its column
  K.cyl("lm.PavingStones070", cx, cz, 9, 9, Y0, Y0 + 0.04, hex("#d0c4b0"), { sides: 32 });
  K.cyl("lm.Concrete034", cx, cz, 4.6, 4.6, Y0, Y0 + 0.75, hex("#cfc5b2"), { sides: 24 });
  K.cyl("lm.glass", cx, cz, 4.1, 4.1, Y0 + 0.5, Y0 + 0.62, hex("#4a7a8a"), { sides: 24 });
  K.cyl("lm.Concrete034", cx, cz, 0.8, 0.6, Y0 + 0.6, Y0 + 6, hex("#cfc5b2"), { sides: 12 });
  K.cyl("lm.Metal024.metal", cx, cz, 0.55, 0.35, Y0 + 6, Y0 + 8.4, hex("#5a6a5a"), { sides: 10 });
  S.add(kitGeos(K.out()), cx, cz);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    props.push({ type: "bench", args: [], x: cx + Math.cos(a) * 11, z: cz + Math.sin(a) * 11, y: Y0, rot: -a - Math.PI / 2 });
  }
  for (const [x, z] of [
    [GSQUARE.x0 + 6, GSQUARE.z1 - 5],
    [GSQUARE.x1 - 6, GSQUARE.z1 - 5],
    [GSQUARE.x0 + 6, GSQUARE.z0 + 20],
    [GSQUARE.x1 - 6, GSQUARE.z0 + 20],
  ])
    trees.push({ x, z, y: Y0, species: "broad", seed: Math.round(x * 2 + z) });
  for (let x = GSQUARE.x0 + 8; x < GSQUARE.x1 - 6; x += 9) props.push({ type: "lamp", args: ["#ffc27a"], x, z: GSQUARE.z1 - 1.2, y: Y0, rot: 0 });
  // (the square's walks for the passers-by: round the fountain past its benches, across to the
  // terraces and the boulevard, along the terraces' front)
  const r = 13.5;
  walks.push([cx - r, cz - r, cx + r, cz - r], [cx + r, cz - r, cx + r, cz + r], [cx + r, cz + r, cx - r, cz + r], [cx - r, cz + r, cx - r, cz - r]);
  walks.push([cx, GSQUARE.z0 + 22, cx, cz - r], [cx, cz + r, cx, GSQUARE.z1 - 3], [GSQUARE.x0 + 3, cz, cx - r, cz], [cx + r, cz, GSQUARE.x1 - 3, cz]);
  walks.push([GSQUARE.x0 + 3, GSQUARE.z0 + 23, GSQUARE.x1 - 3, GSQUARE.z0 + 23]);
  places.push({ name: "Domplein", box: GSQUARE });
}

// =====================================================================================================
// the castle on its hill
function castle(S: Sectors, near: THREE.Group, facades: IsleFacade[], places: { name: string; box: Box }[], ctx: IsleCtx) {
  const H = GCASTLE;
  // the hill: a grassy mound over the block, rock showing on its steeper flanks
  {
    const pos: number[] = [],
      col: number[] = [];
    const RINGS = 26,
      SEG = 56;
    const grass = new THREE.Color("#6f8c4c"),
      rock = new THREE.Color("#8a8478"),
      c = new THREE.Color();
    const pt = (i: number, k: number): [number, number, number] => {
      const r = (i / RINGS) * (H.r + 1.5);
      const a = (k / SEG) * Math.PI * 2;
      const x = H.x + Math.cos(a) * r,
        z = H.z + Math.sin(a) * r;
      return [x, Math.max(Y0 + 0.01, ctx.ground(x, z) + 0.02), z];
    };
    for (let i = 0; i < RINGS; i++)
      for (let k = 0; k < SEG; k++) {
        const q = [pt(i, k), pt(i + 1, k), pt(i + 1, k + 1), pt(i, k), pt(i + 1, k + 1), pt(i, k + 1)];
        for (const p of q) {
          pos.push(p[0], p[1], p[2]);
          // (grass, a little rock showing where it is steepest)
          const steep = Math.abs(pt(Math.min(RINGS, i + 1), k)[1] - pt(i, k)[1]) > 1.05;
          c.copy(grass).lerp(rock, steep ? 0.35 + 0.25 * Math.sin(p[0] * 0.4 + p[2] * 0.3) : 0).multiplyScalar(1 + Math.sin(p[0] * 0.8) * Math.cos(p[2] * 0.6) * 0.05);
          col.push(c.r, c.g, c.b);
        }
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.translate(-H.x, 0, -H.z);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, terrainMat());
    m.position.set(H.x, 0, H.z);
    m.receiveShadow = true;
    m.name = "gamla:hill";
    near.parent!.add(m);
  }
  const K = new Kit({ lod: 0 });
  const top = Y0 + H.h;
  const stone = hex("#e8e0cc"),
    stoneD = hex("#d0c6b0"),
    roofC = hex("#4a4e58");
  const R = CASTLE_R;
  // the curtain walls (a square), their walk and merlons; the round towers at its corners
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    K.box("lm.Bricks084", x0, top - 1, z0, x1, top + 9, z1, stone, { skip: "-y" });
    const along = x1 - x0 > z1 - z0;
    const len = along ? x1 - x0 : z1 - z0;
    for (let u = 0.6; u < len - 0.6; u += 2.2) {
      if (along) for (const z of [z0, z1 - 0.6]) K.box("lm.Bricks084", x0 + u, top + 9, z, x0 + u + 1.1, top + 10.4, z + 0.6, stone);
      else for (const x of [x0, x1 - 0.6]) K.box("lm.Bricks084", x, top + 9, z0 + u, x + 0.6, top + 10.4, z0 + u + 1.1, stone);
    }
  };
  wall(H.x - R, H.z - R - 1, H.x + R, H.z - R + 1);
  wall(H.x - R - 1, H.z - R, H.x - R + 1, H.z + R);
  wall(H.x + R - 1, H.z - R, H.x + R + 1, H.z + R);
  // (the south wall with the gatehouse in its middle)
  wall(H.x - R, H.z + R - 1, H.x - 4.5, H.z + R + 1);
  wall(H.x + 4.5, H.z + R - 1, H.x + R, H.z + R + 1);
  for (const [x, z] of [
    [H.x - R, H.z - R],
    [H.x + R, H.z - R],
    [H.x - R, H.z + R],
    [H.x + R, H.z + R],
  ]) {
    K.cyl("lm.Bricks084", x, z, 3.6, 3.3, top - 1, top + 13, stoneD, { sides: 16 });
    K.cyl("tile", x, z, 4.1, 0.1, top + 13, top + 20, roofC, { sides: 16 });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      K.box("lm.glass", x + Math.cos(a) * 3.35 - 0.3, top + 8, z + Math.sin(a) * 3.35 - 0.3, x + Math.cos(a) * 3.35 + 0.3, top + 9.6, z + Math.sin(a) * 3.35 + 0.3, hex("#2a2c30"));
    }
  }
  // the gatehouse: two half-round towers either side of the arch, the gate's doors
  for (const sd of [-1, 1]) {
    K.cyl("lm.Bricks084", H.x + sd * 4.6, H.z + R + 1, 2.8, 2.6, top - 1, top + 12, stoneD, { sides: 14 });
    K.cyl("tile", H.x + sd * 4.6, H.z + R + 1, 3.2, 0.1, top + 12, top + 17, roofC, { sides: 14 });
  }
  K.box("lm.Bricks084", H.x - 2.4, top + 5.2, H.z + R - 1, H.x + 2.4, top + 10.5, H.z + R + 1.6, stone);
  K.box("lm.Wood049", H.x - 2, top - 0.2, H.z + R + 0.2, H.x + 2, top + 5.2, H.z + R + 0.5, hex("#3a2a1e"));
  // the keep: a tall square tower at the back of the court, its roof and turrets
  const kx = H.x - 3,
    kz = H.z - 5;
  K.box("lm.Bricks084", kx - 6.5, top - 1, kz - 6.5, kx + 6.5, top + 26, kz + 6.5, stone, { skip: "-y" });
  for (const y of [8, 16]) for (const f of ["s", "e", "w", "n"] as Face[]) {
    const [x, z] = f === "s" ? [kx, kz + 6.55] : f === "n" ? [kx, kz - 6.55] : f === "e" ? [kx + 6.55, kz] : [kx - 6.55, kz];
    lancet(K, x, z, top + y, 1.3, 3.2, f, hex("#2a2c30"));
  }
  for (const [x, z] of [
    [kx - 6.5, kz - 6.5],
    [kx + 6.5, kz - 6.5],
    [kx - 6.5, kz + 6.5],
    [kx + 6.5, kz + 6.5],
  ]) {
    K.cyl("lm.Bricks084", x, z, 1.7, 1.7, top + 22, top + 29, stoneD, { sides: 12 });
    K.cyl("tile", x, z, 2.0, 0.05, top + 29, top + 34, roofC, { sides: 12 });
  }
  K.loft(
    "tile",
    [
      { y: top + 26, pts: [[kx - 6.5, kz + 6.5], [kx + 6.5, kz + 6.5], [kx + 6.5, kz - 6.5], [kx - 6.5, kz - 6.5]] },
      { y: top + 34, pts: [[kx - 0.4, kz + 0.4], [kx + 0.4, kz + 0.4], [kx + 0.4, kz - 0.4], [kx - 0.4, kz - 0.4]] },
    ],
    roofC,
    { lid: null },
  );
  // the court's paving, the path down the hill to Slotsgade (a gravel track, steps where it steepens)
  K.box("lm.PavingStones070", H.x - R + 1, top - 0.02, H.z - R + 1, H.x + R - 1, top + 0.04, H.z + R - 1, hex("#bdb3a2"));
  // (a gravel track following the hill's slope, its edges kerbed in stone)
  for (let z = H.z + R + 1.5; z < GZ.slot - 5; z += 0.8) {
    const q = Math.min(GZ.slot - 5, z + 0.8);
    const ya = ctx.ground(H.x, z) + 0.05,
      yb = ctx.ground(H.x, q) + 0.05;
    K.quad("lm.Gravel022" as never, [H.x - 2, ya, z], [H.x + 2, ya, z], [H.x + 2, yb, q], [H.x - 2, yb, q], [0, 1, 0], (p) => [p[0] / 2, p[2] / 2], hex("#c8bca6"));
    for (const sd of [-1, 1]) K.quad("lm.Concrete034" as never, [H.x + sd * 2.1, ya - 0.05, z], [H.x + sd * 2.1, ya + 0.18, z], [H.x + sd * 2.1, yb + 0.18, q], [H.x + sd * 2.1, yb - 0.05, q], [sd, 0, 0], (p) => [p[2] / 2, p[1] / 2], hex("#bdb5a6"));
  }
  S.add(kitGeos(K.out()), H.x, H.z);
  facades.push({ type: "office", face: "s", x0: H.x - 2, x1: H.x + 2, z: H.z + R + 0.5, out: { x: 0, y: 0, z: 1 }, door: { x: H.x, z: H.z + R + 0.85 } });
  places.push({ name: "Gamla Castle", box: { x0: H.x - H.r, x1: H.x + H.r, z0: H.z - H.r, z1: H.z + H.r } });
}

// =====================================================================================================
// the harbour quay along the north shore: a stone quay wall, bollards, boats moored
function harbour(S: Sectors, near: THREE.Group, places: { name: string; box: Box }[], props: PropSpot[], walks: [number, number, number, number][]) {
  const K = new Kit({ lod: 0 });
  const z = GLAND.z0;
  K.box("lm.Bricks008", GLAND.x0 + 40, -6.5, z - 1.2, GLAND.x1, Y0 + 0.08, z + 0.3, hex("#8a7a6a"));
  K.box("lm.Concrete034", GLAND.x0 + 40, Y0 + 0.08, z - 1.3, GLAND.x1, Y0 + 0.3, z + 0.6, hex("#c8c0b0"));
  // two piers out into the harbour
  for (const px of [-2120, -1990]) {
    K.box("lm.Wood049", px - 3, Y0 - 0.1, z - 40, px + 3, Y0 + 0.12, z, hex("#8a6a4c"));
    for (let k = 0; k < 10; k++) for (const sd of [-1, 1]) K.box("lm.Wood049", px + sd * 2.7 - 0.2, -5, z - 38 + k * 4, px + sd * 2.7 + 0.2, Y0 + 0.1, z - 37.6 + k * 4, hex("#5a4636"));
  }
  S.add(kitGeos(K.out()), -2100, z);
  for (let x = GLAND.x0 + 46; x < GLAND.x1 - 4; x += 9) props.push({ type: "bollard", args: [], x, z: z + 0.9, y: Y0, rot: 0 });
  walks.push([GLAND.x0 + 44, z + 4, GLAND.x1 - 4, z + 4]);
  const cols: [string, string][] = [
    ["#f2f0ea", "#2a4a6a"],
    ["#1e3a5a", "#f2f0ea"],
    ["#c8342a", "#f2f0ea"],
    ["#2a5a3a", "#e8e0c8"],
    ["#f2f0ea", "#c89a3a"],
  ];
  let k = 0;
  for (const px of [-2120, -1990])
    for (const sd of [-1, 1])
      for (let u = 0; u < 3; u++) {
        const b = realBoat(...cols[k++ % cols.length]);
        b.position.set(px + sd * 7.5, WATER - 0.05, z - 10 - u * 11);
        b.rotation.y = Math.PI / 2;
        near.add(b);
      }
  places.push({ name: "the harbour", box: { x0: GLAND.x0, x1: GLAND.x1, z0: z - 45, z1: z + 12 } });
}

// the canals' life: boats moored along the quays, a few houseboats, stairs down to the water
function canalLife(near: THREE.Group, ctx: IsleCtx, S: Sectors) {
  const K = new Kit({ lod: 0 });
  const cols: [string, string][] = [
    ["#2a2a2e", "#c8b890"],
    ["#1e3a5a", "#e8e0d0"],
    ["#5a2a22", "#e8e0d0"],
    ["#2a4a3a", "#d8d0b8"],
  ];
  let k = 0;
  for (const c of ctx.isle.canals ?? []) {
    const len = c.to - c.from;
    for (let u = 20; u < len - 14; u += 26) {
      const along = c.from + u;
      const side = k % 2 ? 1 : -1;
      const off = side * (c.width / 2 - 1.6);
      const [x, z] = c.axis === "x" ? [along, c.at + off] : [c.at + off, along];
      k++;
      // (not under a bridge: the streets crossing it)
      if (ctx.road(x, z) || ctx.road(x + (c.axis === "x" ? 6 : 0), z + (c.axis === "z" ? 6 : 0)) || ctx.road(x - (c.axis === "x" ? 6 : 0), z - (c.axis === "z" ? 6 : 0))) continue;
      if (k % 3 === 0) {
        // a houseboat: a long low hull, its cabin with windows, plants on its roof
        const [ax, az, bx, bz] = c.axis === "x" ? [x - 9, z - 2.2, x + 9, z + 2.2] : [x - 2.2, z - 9, x + 2.2, z + 9];
        K.box("lm.paint", ax, WATER - 0.6, az, bx, WATER + 0.5, bz, hex(["#2a2a2a", "#1e3a2a", "#3a2a1e"][k % 3]));
        const [cx0, cz0, cx1, cz1] = c.axis === "x" ? [ax + 1, az + 0.4, bx - 1, bz - 0.4] : [ax + 0.4, az + 1, bx - 0.4, bz - 1];
        K.box("lm.Wood049", cx0, WATER + 0.5, cz0, cx1, WATER + 2.6, cz1, hex(["#c8b890", "#a8c0b0", "#d0b0a0"][k % 3]));
        K.box("lm.glass", cx0 - 0.03, WATER + 1.1, cz0 - 0.03, cx1 + 0.03, WATER + 2.0, cz1 + 0.03, hex("#7a8a94"), { skip: "-y+y" });
        K.box("lm.paint", cx0 - 0.1, WATER + 2.6, cz0 - 0.1, cx1 + 0.1, WATER + 2.8, cz1 + 0.1, hex("#3a3a3a"));
      } else {
        const b = realBoat(...cols[k % cols.length]);
        b.position.set(x, WATER - 0.05, z);
        b.rotation.y = c.axis === "x" ? 0 : Math.PI / 2;
        b.scale.setScalar(0.8);
        near.add(b);
      }
    }
    // the stairs down to the water at each end of the canal's run (a swimmer climbs out there)
    for (const u of [4, len - 4]) {
      const along = c.from + u;
      for (const side of [-1, 1]) {
        const edge = c.at + side * (c.width / 2);
        for (let s = 0; s < 8; s++) {
          const y = Y0 - s * 0.3;
          const d0 = s * 0.42,
            d1 = d0 + 0.45;
          if (c.axis === "x") K.box("lm.Concrete034", along - 1.2, -3.4, side < 0 ? edge + d0 : edge - d1, along + 1.2, y, side < 0 ? edge + d1 : edge - d0, hex("#bdb5a6"));
          else K.box("lm.Concrete034", side < 0 ? edge + d0 : edge - d1, -3.4, along - 1.2, side < 0 ? edge + d1 : edge - d0, y, along + 1.2, hex("#bdb5a6"));
        }
      }
    }
  }
  S.add(kitGeos(K.out()), -2120, -120);
}

/** A café's terrace set: a round table, four chairs, a parasol (its canvas in the café's colour). */
function terrace(K: Kit, x: number, z: number, seed: number, seats: IsleSeat[], area: string) {
  const canvas = ["#b8352a", "#f2ede2", "#2e5a3a", "#1e3a6a", "#e0b030"][seed % 5];
  K.cyl("lm.dark", x, z, 0.06, 0.06, Y0, Y0 + 0.72, hex("#2a2a2a"), { sides: 8, caps: "none" });
  K.cyl("lm.dark", x, z, 0.38, 0.38, Y0 + 0.72, Y0 + 0.76, hex("#3a3a3a"), { sides: 16 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + seed;
    const cx = x + Math.cos(a) * 0.75,
      cz = z + Math.sin(a) * 0.75;
    K.box("lm.Wood049", cx - 0.21, Y0 + 0.42, cz - 0.21, cx + 0.21, Y0 + 0.47, cz + 0.21, hex("#6a4a30"));
    // (most chairs taken, by day and by night: facing the table)
    if (((seed * 7 + k * 13) % 10) < 6) seats.push({ x: cx, z: cz, y: Y0, h: Math.atan2(-Math.cos(a), -Math.sin(a)), seatH: 0.45, area });
    K.box("lm.dark", cx - 0.03, Y0, cz - 0.03, cx + 0.03, Y0 + 0.42, cz + 0.03, hex("#2a2a2a"));
    const bx = x + Math.cos(a) * 0.95,
      bz = z + Math.sin(a) * 0.95;
    K.box("lm.Wood049", bx - 0.18, Y0 + 0.47, bz - 0.18, bx + 0.18, Y0 + 0.95, bz + 0.18, hex("#6a4a30"));
  }
  K.cyl("lm.dark", x, z, 0.03, 0.03, Y0 + 0.76, Y0 + 2.4, hex("#2a2a2a"), { sides: 6, caps: "none" });
  K.cyl("fabric", x, z, 1.5, 0.05, Y0 + 2.0, Y0 + 2.55, hex(canvas), { sides: 8 });
}
