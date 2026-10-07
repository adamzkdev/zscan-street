import * as THREE from "three";
import { Market } from "../../data/market";
import { fitText } from "../../scene/fit";
import type { VoxelModel } from "../../scene/voxel/model";
import * as F from "../furniture";
import { box, glowMat, std, wall } from "../kit";
import * as H from "./furniture";
import { HotelKit, LEVELS, LIFT_Z, boards, carpet, num, tiles, usd } from "./kit";

type Dir = "corridor" | "window" | "east" | "west";
/** The corridor runs east from the lift lobby, between z −12 and −10; rooms are 10 m deep. */
export const CZ0 = LIFT_Z - 1,
  CZ1 = LIFT_Z + 1,
  RX0 = -11,
  DEPTH = 10;

/**
 * Helpers for one unit off the corridor, in (u, w): u along the corridor from `a` (east), w from the
 * corridor wall in towards the windows, on the north side (−1) or the south side (+1).
 */
export function unit(k: HotelKit, f: number, a: number, side: -1 | 1, wallTone: string) {
  const g = k.groups[f],
    y = LEVELS[f].y,
    h = LEVELS[f].h;
  const W = (u: number, w: number) => [a + u, side < 0 ? CZ0 - w : CZ1 + w] as [number, number];
  const face = (d: Dir) => (d === "east" ? Math.PI / 2 : d === "west" ? -Math.PI / 2 : (d === "corridor") === side < 0 ? 0 : Math.PI);
  const put = (key: string, build: () => VoxelModel, u: number, w: number, d: Dir, o: { dy?: number; solid?: boolean } = {}) => {
    const [x, z] = W(u, w);
    return k.put(f, key, build, x, z, face(d), o);
  };
  const wallMat = std(wallTone, 0.85);
  const iw = (u0: number, w0: number, u1: number, w1: number, mat = wallMat, hh = h) => {
    const [x0, z0] = W(u0, w0),
      [x1, z1] = W(u1, w1);
    k.rects[f].push(wall(g, x0, z0, x1, z1, hh, mat, y, 0.12));
  };
  /** A floor finish over a (u, w) rectangle. */
  const floor = (u0: number, w0: number, u1: number, w1: number, mat: THREE.Material, dy = 0.004) => {
    const [x0, z0] = W(u0, w0),
      [x1, z1] = W(u1, w1);
    box(g, Math.abs(x1 - x0), 0.02, Math.abs(z1 - z0), mat, (x0 + x1) / 2, y + dy - 0.01, (z0 + z1) / 2);
  };
  /** A screen on a wall facing `d`, at (u, w), `yy` up. */
  const at = (o: THREE.Object3D, u: number, w: number, yy: number, d: Dir) => {
    const [x, z] = W(u, w);
    o.position.set(x, y + yy, z);
    o.rotation.y = face(d);
    return o;
  };
  /** The front door off the corridor: a gap u0–u1, an open leaf, a lit frame, the number plate. */
  const door = (u0: number, u1: number, len: number, n: string, accent: string) => {
    const cz = side < 0 ? CZ0 : CZ1;
    const hall = std("#e8e0d2", 0.8);
    k.rects[f].push(wall(g, a, cz, a + u0, cz, h, hall, y, 0.14), wall(g, a + u1, cz, a + len, cz, h, hall, y, 0.14));
    box(g, u1 - u0, h - 2.25, 0.14, hall, a + (u0 + u1) / 2, y + 2.25, cz);
    for (const u of [u0, u1]) box(g, 0.08, 2.25, 0.2, std("#3a2418", 0.5), a + u, y, cz);
    box(g, u1 - u0 + 0.08, 0.08, 0.2, std("#3a2418", 0.5), a + (u0 + u1) / 2, y + 2.25, cz);
    // the leaf, swung open into the room
    const leaf = box(g, 0.06, 2.2, u1 - u0 - 0.04, std("#4a3020", 0.55), 0, y, 0);
    const [hx, hz] = W(u1 - 0.03, (u1 - u0) / 2 + 0.02);
    leaf.position.set(hx, y + 1.1, hz);
    const plate = k.label(f, n, a + u0 - 0.45, 1.75, cz - side * 0.09, { h: 0.2, color: "#2a1a10", bg: accent, rot: side < 0 ? 0 : Math.PI });
    (plate.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
    box(g, 0.1, 0.1, 0.03, glowMat("#3ee08f", 1.6), a + u1 + 0.25, y + 1.2, cz - side * 0.09);
  };
  /** A live TV on a wall. */
  const tv = (u: number, w: number, d: Dir, n: string, size = 1.3) => {
    const s = k.screen(f, size, size * 0.56, (gc, Wd, Hd) => {
      gc.fillStyle = "#06101a";
      gc.fillRect(0, 0, Wd, Hd);
      gc.fillStyle = "#f4b728";
      gc.font = '700 26px "JetBrains Mono", monospace';
      fitText(gc, `MARINA ZEC · ROOM ${n}`, 24, 44);
      gc.fillStyle = "#e8fbff";
      gc.font = '800 70px "JetBrains Mono", monospace';
      fitText(gc, k.height ? `#${num(k.height)}` : "…", 24, 140);
      const pr = Market.state.price;
      gc.fillStyle = "#7fe3ff";
      gc.font = '600 24px "JetBrains Mono", monospace';
      fitText(gc, `${k.ctx.director.mempoolList().length} TX PENDING · ZEC ${pr ? usd(pr.usd) : "…"}`, 24, 210);
    }, 5);
    at(s, u, w, 1.35, d);
    s.translateZ(0.04);
    const frame = box(g, size + 0.06, size * 0.56 + 0.06, 0.04, k.dark, 0, 0, 0);
    at(frame, u, w, 1.35, d);
    k.pick(f, s, `<b>TV</b><span>room ${n}</span>`, () => ({ eyebrow: `Room ${n} · TV`, title: k.height ? `Block ${num(k.height)}` : "…", stats: [["Pending", `${k.ctx.director.mempoolList().length} tx`], ["Since last block", k.since != null ? `${k.since} s` : "…"]] }));
    return s;
  };
  /** The minibar, its contents priced in ZEC at the live rate. */
  const minibar = (u: number, w: number, d: Dir, n: string) => {
    const mb = put("minibar", H.minibar, u, w, d);
    k.pickAll(f, mb, "<b>Minibar</b><span>prices in ZEC</span>", () => {
      const p = Market.state.price?.usd;
      const z = (usdv: number) => (p ? `${(usdv / p).toFixed(4)} ZEC` : `$${usdv}`);
      return { eyebrow: `Room ${n} · minibar`, title: "Minibar", stats: [["Champagne", z(120)], ["Orchard juice", z(9)], ["Shielded nuts", z(12)], ["Espresso", z(6)]] };
    });
  };
  /** The bay window: a pick on the glass with the view's height and the live block. */
  const bay = (u0: number, u1: number, n: string) => {
    const [x0, z0] = W(u0, DEPTH - 0.05),
      [x1] = W(u1, DEPTH - 0.05);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(x1 - x0), h - 0.4), k.hidden);
    m.position.set((x0 + x1) / 2, y + (h - 0.4) / 2 + 0.2, z0);
    g.add(m);
    k.pick(f, m, `<b>Bay window</b><span>${Math.round(y)} m</span>`, () => ({ eyebrow: `Room ${n} · bay window`, title: `ZStreet from ${Math.round(y)} m`, stats: [["Block", k.height ? num(k.height) : "…"], ["Pending", `${k.ctx.director.mempoolList().length} tx`], ["ZEC", Market.state.price ? usd(Market.state.price.usd) : "…"]] }));
  };
  return { g, y, h, W, face, put, iw, floor, at, door, tv, minibar, bay, wallMat };
}

const RATE = 450;

/** 20 — deluxe rooms: a carpeted corridor, eight rooms, all open, all furnished, each with its bay window. */
export function rooms(k: HotelKit) {
  const f = 2,
    g = k.groups[f],
    y = LEVELS[f].y,
    h = LEVELS[f].h,
    X0 = LEVELS[f].x0,
    X1 = LEVELS[f].x1;
  k.shell(f, std("#3a3036", 0.8), std("#f0ebe2", 0.9), { panels: "none", wallMat: std("#e8e0d2", 0.85) });
  k.lifts(f);
  // the lift lobby, the corridor: patterned carpet, wainscot, ceiling lights, sconces
  const corr = new THREE.MeshStandardMaterial({ map: carpet("#2a2a4a", "#b8862a", 14, 2, "wave"), roughness: 0.95 });
  box(g, X1 - RX0, 0.02, CZ1 - CZ0, corr, (RX0 + X1) / 2, y - 0.005, LIFT_Z);
  box(g, RX0 - X0, 0.02, 8, new THREE.MeshStandardMaterial({ map: carpet("#2a2a4a", "#b8862a", 3, 6, "diamond"), roughness: 0.95 }), (X0 + RX0) / 2, y - 0.005, LIFT_Z);
  const hall = std("#e8e0d2", 0.85);
  k.rects[f].push(wall(g, RX0, CZ0, RX0, LIFT_Z - 4, h, hall, y), wall(g, RX0, CZ1, RX0, LIFT_Z + 4, h, hall, y));
  k.rects[f].push(wall(g, X0, LIFT_Z - 4, RX0, LIFT_Z - 4, h, hall, y), wall(g, X0, LIFT_Z + 4, RX0, LIFT_Z + 4, h, hall, y));
  for (let x = RX0 + 1.5; x < X1; x += 3) box(g, 0.5, 0.03, 0.5, glowMat("#ffe6c8", 1.3), x, y + h - 0.04, LIFT_Z);
  k.label(f, "2001 – 2004  →", RX0 - 0.08, 2.4, LIFT_Z - 2.6, { h: 0.18, color: "#8a6a2a", rot: -Math.PI / 2, glow: false });
  k.label(f, "2005 – 2008  →", RX0 - 0.08, 2.4, LIFT_Z + 2.6, { h: 0.18, color: "#8a6a2a", rot: -Math.PI / 2, glow: false });
  k.put(f, "consoleLift", () => H.writingDesk(), RX0 - 0.45, LIFT_Z - 3.3, -Math.PI / 2);
  k.put(f, "orchidLift", () => F.plant("monstera", 77), RX0 - 0.5, LIFT_Z + 3.4);
  k.painting(f, 512, -12.6, 1.9, LIFT_Z - 3.92, 0, 1.1);

  const wood = new THREE.MeshStandardMaterial({ map: boards("#8a6440", "#7e5a38", 4, 3), roughness: 0.55 });
  const marbleB = new THREE.MeshStandardMaterial({ map: tiles("#ece8e2", "#c8c0b4", 4, 4), roughness: 0.2 });
  const carpets = ["#c8b89a", "#9aa8b8", "#b8a0a8", "#a8b89a"];
  const tones = ["#e8dcc8", "#dde2e8", "#eadfe2", "#e2e8dc"];
  const heads = ["#2a3a5a", "#5a2a3a", "#2a4a3a", "#4a3a2a"];
  const accents = ["#c9a227", "#7fe3ff", "#ff9ab8", "#9ae07f"];
  const L = (X1 - RX0) / 4;
  let n = 0;
  for (const side of [-1, 1] as const)
    for (let i = 0; i < 4; i++) {
      const a = RX0 + i * L,
        no = `20${String(++n).padStart(2, "0")}`,
        c = (i + (side > 0 ? 2 : 0)) % 4;
      const U = unit(k, f, a, side, tones[c]);
      const { put, iw, floor, at } = U;
      floor(0, 0, L, DEPTH, wood);
      floor(3.2, 4.2, L, DEPTH, new THREE.MeshStandardMaterial({ map: carpet(carpets[c], "#ffffff22", 6, 6, "dots"), roughness: 0.95 }), 0.012);
      floor(0, 0, 3.2, 4.2, marbleB, 0.012);
      U.door(5.0, 6.0, L, no, accents[c]);
      if (i < 3) iw(L, 0, L, DEPTH);
      if (i === 0) iw(0, 0, 0, DEPTH);
      // ---- bathroom (u 0–3.2, w 0–4.2): rain shower, vanity, toilet ----
      iw(3.2, 0, 3.2, 1.3);
      iw(3.2, 2.2, 3.2, 4.2);
      iw(0, 4.2, 3.2, 4.2);
      put("shower", H.shower, 0.62, 0.62, "window");
      put(`vanity${c}`, () => F.vanity(heads[c]), 0.28, 2.6, "east");
      const loo = put("toilet", F.toilet, 2.4, 3.8, "corridor");
      let flushes = 0;
      k.pickAll(f, loo, "<b>Toilet</b><span>flush</span>", () => ({ eyebrow: `Room ${no} · bathroom`, title: `Flushed ×${++flushes}` }));
      // ---- entry: wardrobe, minibar, the luggage rack ----
      put("wardrobeRoom", () => F.wardrobe("#d8ccb8"), L - 0.35, 2.4, "west");
      U.minibar(L - 0.3, 3.65, "west", no);
      // ---- bedroom: the king bed against the bathroom side, TV opposite, desk and bay window ----
      put(`king${c}`, () => H.kingBed(heads[c], accents[c] === "#7fe3ff" ? "#2a4a6a" : "#8a1a2a"), 1.2, 6.9, "east");
      put("nightstand", F.nightstand, 0.3, 5.45, "east", { solid: false });
      put("nightstand", F.nightstand, 0.3, 8.35, "east", { solid: false });
      put(`bedBench${c}`, () => H.bedBench(heads[c]), 2.75, 6.9, "east", { solid: false });
      k.painting(f, 100 + n * 7, ...((): [number, number, number, number] => { const [x, z] = U.W(0.08, 6.9); return [x, 2.1, z, U.face("east")]; })(), 0.8);
      put("tvUnitRoom", () => F.tvUnit(20), L - 0.3, 6.6, "west");
      U.tv(L - 0.06, 6.6, "west", no);
      put("deskRoom", H.writingDesk, L - 0.32, 8.75, "west");
      put("deskChair", () => H.velvetChair(heads[c]), L - 1.0, 8.75, "east", { solid: false });
      put(`seat${c}`, () => H.windowSeat(3.2, carpets[c]), 2.3, DEPTH - 0.38, "corridor");
      put(`club${c}`, () => H.clubChair(heads[c]), 4.3, 7.9, "window");
      put("sideNo", () => H.sideTable(true), 4.6, 9.5, "corridor", { solid: false });
      put("lampRoom", F.floorLamp, 0.35, 9.6, "corridor");
      put(`curtain${c}`, () => F.curtain(accents[c] === "#c9a227" ? "#c8a878" : "#9a8a7a", h - 0.2), 0.45, DEPTH - 0.2, "corridor", { solid: false });
      put(`curtain${c}`, () => F.curtain(accents[c] === "#c9a227" ? "#c8a878" : "#9a8a7a", h - 0.2), L - 1.3, DEPTH - 0.2, "corridor", { solid: false });
      put("rackRoom", () => H.luggageRack(["#2a4a6a", "#8a2a3a", "#c8b89a", "#3a3a3a"][c]), 4.6, 4.6, "corridor", { solid: false });
      const [px, pz] = U.W(4.6, 6.9);
      k.put(f, "pendantRoom", () => F.pendant(0.6), px, pz, 0, { dy: h - 0.6, solid: false });
      U.bay(0.3, L - 0.3, no);
      // the rate card on the desk: the room's price at the live ZEC rate
      k.hit(f, 0.9, 0.3, 0.5, ...((): [number, number, number] => { const [x, z] = U.W(L - 0.32, 8.75); return [x, 0.75, z]; })(), `<b>Rate card</b><span>room ${no}</span>`, () => {
        const p = Market.state.price?.usd;
        return { eyebrow: `Room ${no}`, title: "Deluxe King", stats: [["Per night", p ? `${(RATE / p).toFixed(3)} ZEC` : "…"], ["In USD", usd(RATE)], ["Floor", "20"], ["View", `${Math.round(y)} m`]] };
      });
      // who's in: a guest in most rooms, housekeeping in one
      if (n % 4 === 1) void k.person(f, 7100 + n, U.W(2.3, DEPTH - 0.45), "Guest", { sit: true, dy: 0.5, face: new THREE.Vector3(0, 0, side) });
      if (n % 4 === 2) void k.person(f, 7100 + n, U.W(1.6, 6.9), "Guest", { sit: true, dy: 0.62, face: new THREE.Vector3(1, 0, 0) });
      if (n % 4 === 3) void k.person(f, 7100 + n, U.W(4.3, 7.8), "Guest", { sit: true, dy: 0.42, face: new THREE.Vector3(0, 0, side) });
      if (n === 4) void k.person(f, 7190, U.W(3.4, 6.9), "Housekeeper", { face: new THREE.Vector3(-1, 0, 0) });
      void at;
    }
  // housekeeping trolley and a guest in the corridor
  k.put(f, "trolleyHK", () => H.trolley(3), 3.2, LIFT_Z + 0.42, Math.PI / 2);
  void k.person(f, 7191, [4.6, LIFT_Z - 0.3], "Housekeeper", { face: new THREE.Vector3(-1, 0, 0) });
  void k.person(f, 7192, [-6, LIFT_Z], "Guest", { wander: [[-6, LIFT_Z], [10, LIFT_Z], [-13, LIFT_Z], [1, LIFT_Z - 0.3]] });
  k.light(f, -4.5, -17, "#ffe6c8", 6, -0.4);
  k.light(f, 8.5, -17, "#ffe6c8", 6, -0.4);
  k.light(f, -4.5, -5, "#ffe2b8", 6, -0.4);
  k.light(f, 8.5, -5, "#ffe2b8", 6, -0.4);
  k.light(f, 0, LIFT_Z, "#ffe6c8", 4, -0.3);
}
