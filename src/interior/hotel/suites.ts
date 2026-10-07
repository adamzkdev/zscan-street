import * as THREE from "three";
import { Market } from "../../data/market";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import * as H from "./furniture";
import { playTune } from "./lobby";
import { HotelKit, LEVELS, LIFT_Z, boards, carpet, marble, num, usd } from "./kit";
import { CZ0, CZ1, DEPTH, RX0, unit } from "./rooms";

/** 33 — the suites: the Presidential (3301) along the whole north side, two Sky Suites south. Each
 *  has a living room, a bedroom, and a bathroom whose tub stands in the bay window. */
export function suites(k: HotelKit) {
  const f = 3,
    g = k.groups[f],
    y = LEVELS[f].y,
    h = LEVELS[f].h,
    X0 = LEVELS[f].x0,
    X1 = LEVELS[f].x1;
  k.shell(f, std("#3a3036", 0.8), std("#f2ede4", 0.9), { panels: "none", wallMat: std("#e8e0d2", 0.85) });
  k.lifts(f);
  const hall = std("#e2d8c6", 0.85);
  box(g, X1 - RX0, 0.02, CZ1 - CZ0, new THREE.MeshStandardMaterial({ map: carpet("#3a1a22", "#c9a227", 14, 2, "diamond"), roughness: 0.95 }), (RX0 + X1) / 2, y - 0.005, LIFT_Z);
  box(g, RX0 - X0, 0.02, 8, new THREE.MeshStandardMaterial({ map: marble("#2a2630", "200,180,120", 2, 4), roughness: 0.15, metalness: 0.2 }), (X0 + RX0) / 2, y - 0.005, LIFT_Z);
  k.partition(f, RX0, CZ0, RX0, LIFT_Z - 4, hall);
  k.partition(f, RX0, CZ1, RX0, LIFT_Z + 4, hall);
  k.partition(f, X0, LIFT_Z - 4, RX0, LIFT_Z - 4, hall);
  k.partition(f, X0, LIFT_Z + 4, RX0, LIFT_Z + 4, hall);
  for (let x = RX0 + 1.5; x < X1; x += 3) box(g, 0.5, 0.03, 0.5, glowMat("#ffe6c8", 1.3), x, y + h - 0.04, LIFT_Z);
  k.label(f, "PRESIDENTIAL SUITE · 3301", RX0 - 0.08, 2.5, LIFT_Z - 2.4, { h: 0.16, color: "#8a6a2a", rot: -Math.PI / 2, glow: false });
  k.label(f, "SKY SUITES · 3302 – 3303", RX0 - 0.08, 2.5, LIFT_Z + 2.4, { h: 0.16, color: "#8a6a2a", rot: -Math.PI / 2, glow: false });
  k.put(f, "treeSuite", () => F.indoorTree(9), X0 + 2.4, LIFT_Z + 2.9);
  k.painting(f, 1001, -12.6, 1.9, LIFT_Z - 3.92, 0, 1.1);
  void k.person(f, 7300, [RX0 - 1.2, LIFT_Z - 2.2], "Concierge", { face: new THREE.Vector3(-1, 0, 0) });

  const wood = new THREE.MeshStandardMaterial({ map: boards("#6a4a30", "#60442c", 5, 4), roughness: 0.5 });
  const bathM = new THREE.MeshStandardMaterial({ map: marble("#f0ece6", "140,130,120", 3, 4), roughness: 0.1, metalness: 0.1 });

  const suite = (a: number, side: -1 | 1, Wd: number, no: string, o: { tone: string; head: string; accent: string; sofa: string; rug: string; guest: number; presidential?: boolean }) => {
    const U = unit(k, f, a, side, o.tone);
    const { put, iw, floor } = U;
    const bw = o.presidential ? 6 : 4.2;
    const B1 = Wd - 3.6,
      B0 = B1 - bw;
    floor(0, 0, B1, DEPTH, wood);
    floor(B1, 0, Wd, DEPTH, bathM, 0.012);
    U.door(1.2, 2.6, Wd, no, o.accent);
    iw(0, 0, 0, DEPTH);
    if (a + Wd < X1 - 0.1) iw(Wd, 0, Wd, DEPTH);
    // ---- living room ----
    const media = std("#3a2a20", 0.6);
    iw(0.9, 4.2, 4.6, 4.2, media, 2.7);
    put(`rugS${no}`, () => F.rug(4.2, 3.0, o.rug, o.accent), 2.75, 6.6, "corridor", { solid: false });
    put(`sofaS${o.sofa}`, () => F.sofa(o.sofa, 3, o.accent), 2.75, 7.7, "corridor");
    put(`clubS${o.head}`, () => H.clubChair(o.head), 0.75, 6.2, "east");
    put(`clubS${o.head}`, () => H.clubChair(o.head), 4.75, 6.2, "west");
    put("coffeeS", F.coffeeTable, 2.75, 6.2, "corridor");
    U.tv(2.75, 4.28, "window", no, 1.6);
    put(`seatS${no}`, () => H.windowSeat(3.4, o.rug), 2.75, DEPTH - 0.38, "corridor");
    put("lampS", F.floorLamp, 0.4, 9.5, "corridor");
    put("plantS", () => F.plant("monstera", Number(no)), 4.9, 9.5, "corridor");
    put(`curtS${o.accent}`, () => F.curtain(o.accent === "#c9a227" ? "#c8a878" : "#8a9aaa", h - 0.2), 0.5, DEPTH - 0.2, "corridor", { solid: false });
    // the foyer behind the media wall: dining, a console, a painting
    put(`dining${o.presidential ? 6 : 4}`, () => F.diningTable(o.presidential ? 6 : 4), 3.4, 2.2, "corridor");
    for (const [du, dw, d] of [[-0.5, -0.75, "window"], [0.5, -0.75, "window"], [-0.5, 0.75, "corridor"], [0.5, 0.75, "corridor"]] as [number, number, "window" | "corridor"][]) put(`chairS${o.head}`, () => H.velvetChair(o.head), 3.4 + du * (o.presidential ? 1.6 : 1), 2.2 + dw, d, { solid: false });
    const [dx, dz] = U.W(3.4, 2.2);
    const ch = H.chandelier(0.45, 2);
    ch.position.set(dx, y + h - 0.4, dz);
    g.add(ch);
    k.painting(f, 2000 + Number(no), ...((): [number, number, number, number] => { const [x, z] = U.W(0.08, 2.4); return [x, 1.8, z, U.face("east")]; })(), 0.9);
    if (o.presidential) {
      // the grand piano, the bar, a second lounge
      put("pianoS", F.grandPiano, 8.4, 7.4, "west");
      put("pianoBenchS", F.pianoBench, 9.5, 7.4, "west", { solid: false });
      k.hit(f, 2, 1.2, 1.6, ...((): [number, number, number] => { const [x, z] = U.W(8.4, 7.4); return [x, 0, z]; })(), "<b>Steinway</b><span>play</span>", () => {
        playTune([60, 64, 67, 72, 71, 67, 64, 65, 69, 72, 77, 76, 72, 69]);
        return { eyebrow: `Suite ${no}`, title: "♪ Steinway ♪" };
      });
      put("barS", () => F.barCounter(3, o.accent), 8.4, 0.95, "window");
      put("backBarS", () => F.backBar(3), 8.4, 0.25, "window");
      for (let i = 0; i < 3; i++) put("stoolS", () => F.stool(o.head), 7.4 + i, 1.8, "corridor", { solid: false });
      put("rugP2", () => F.rug(4.4, 3.4, "#2a3a4a", "#c9a227"), 12.8, 6.8, "corridor", { solid: false });
      put("sofaP2", () => F.sofa("#e8dcc4", 3, "#c9a227"), 12.8, 8.6, "corridor");
      put("clubP2", () => H.clubChair("#5a1a2a"), 10.9, 6.6, "east");
      put("clubP2", () => H.clubChair("#5a1a2a"), 14.7, 6.6, "west");
      put("coffeeP2", F.coffeeTable, 12.8, 6.8, "corridor");
      put("treeP", () => F.indoorTree(12), 15.6, 9.0, "corridor");
      put("seatP2", () => H.windowSeat(3, o.rug), 8.6, DEPTH - 0.38, "corridor");
      put("lampP2", F.floorLamp, 6.0, 9.5, "corridor");
      for (const u of [10.5, 14.5]) {
        const [cx, cz] = U.W(u, 4.5);
        const c2 = H.chandelier(0.7, 3);
        c2.position.set(cx, y + h - 0.4, cz);
        g.add(c2);
      }
      void k.person(f, 7310, U.W(9.55, 7.4), "Pianist", { sit: true, dy: 0.5, face: new THREE.Vector3(side < 0 ? -1 : -1, 0, 0) });
      void k.person(f, 7311, U.W(8.4, 0.5), "Bartender", { face: new THREE.Vector3(0, 0, -side) });
      void k.person(f, 7312, U.W(12.2, 8.5), "Guest", { sit: true, dy: 0.42, face: new THREE.Vector3(0, 0, -side) });
    }
    // ---- bedroom ----
    iw(B0, 0, B0, 1.2);
    iw(B0, 2.2, B0, DEPTH);
    put(`kingS${o.head}`, () => H.kingBed(o.head, o.accent === "#c9a227" ? "#8a1a2a" : "#2a4a6a"), B0 + 1.2, 7.0, "east");
    put("nightstand", F.nightstand, B0 + 0.3, 5.55, "east", { solid: false });
    put("nightstand", F.nightstand, B0 + 0.3, 8.45, "east", { solid: false });
    put(`benchS${o.head}`, () => H.bedBench(o.head), B0 + 2.75, 7.0, "east", { solid: false });
    put("wardrobeS", () => F.wardrobe("#cfc3ae"), B0 + 1.4, 3.3, "window");
    put("tvUnitS", () => F.tvUnit(20), B1 - 0.3, 7.0, "west");
    U.tv(B1 - 0.06, 7.0, "west", no, 1.2);
    put("clubBed", () => H.clubChair(o.sofa), B1 - 0.75, 9.2, "west");
    put("rackS", () => H.luggageRack("#2a4a6a"), B0 + 2.4, 2.0, "corridor", { solid: false });
    put(`curtS${o.accent}`, () => F.curtain(o.accent === "#c9a227" ? "#c8a878" : "#8a9aaa", h - 0.2), B0 + 0.5, DEPTH - 0.2, "corridor", { solid: false });
    k.painting(f, 3000 + Number(no), ...((): [number, number, number, number] => { const [x, z] = U.W(B0 + 0.08, 7.0); return [x, 2.2, z, U.face("east")]; })(), 0.9);
    // ---- bathroom: the tub in the bay window, double vanity, rain shower, WC ----
    iw(B1, 0, B1, 2.4);
    iw(B1, 3.3, B1, DEPTH);
    const tub = put("freeTub", H.freeTub, B1 + 1.8, 8.6, "east");
    put("doubleVanity", H.doubleVanity, Wd - 0.3, 5.0, "west");
    put("showerS", H.shower, Wd - 0.62, 0.62, "window");
    put("toiletS", F.toilet, B1 + 0.45, 1.1, "east");
    put("plantBath", () => F.plant("ficus", 51 + Number(no)), Wd - 0.45, 9.5, "corridor");
    put("rugBath", () => F.rug(1.2, 0.8, "#f2eee6", "#c9a227"), B1 + 1.8, 7.2, "corridor", { solid: false });
    k.pickAll(f, tub, "<b>Bathtub</b><span>with a view</span>", () => ({ eyebrow: `Suite ${no} · bathroom`, title: `Bath at ${Math.round(y)} m`, stats: [["Water", "38 °C"], ["Block", k.height ? num(k.height) : "…"], ["Pending", `${k.ctx.director.mempoolList().length} tx`]] }));
    if (o.guest % 2) void k.person(f, o.guest + 2, U.W(B1 + 1.8, 8.6), "Guest", { sit: true, dy: 0.12, face: new THREE.Vector3(0, 0, side) });
    U.bay(0.3, Wd - 0.3, no);
    // who's in
    void k.person(f, o.guest, U.W(2.4, 7.6), "Guest", { sit: true, dy: 0.42, face: new THREE.Vector3(0, 0, -side) });
    void k.person(f, o.guest + 1, U.W(3.0, 5.0), "Guest", { wander: [U.W(3.0, 5.0), U.W(B0 + 3.4, 5.0), U.W(1.0, 9.0), U.W(5.5, 3.0)] });
    k.hit(f, 0.4, 0.3, 0.4, ...((): [number, number, number] => { const [x, z] = U.W(0.4, 9.5); return [x, 1.2, z]; })(), `<b>Suite ${no}</b><span>rate</span>`, () => {
      const p = Market.state.price?.usd;
      const rate = o.presidential ? 9800 : 1900;
      return { eyebrow: `Suite ${no}`, title: o.presidential ? "Presidential Suite" : "Sky Suite", stats: [["Per night", p ? `${(rate / p).toFixed(2)} ZEC` : "…"], ["In USD", usd(rate)], ["Size", `${Math.round(Wd * DEPTH)} m²`], ["View", `${Math.round(y)} m`]] };
    });
  };
  suite(RX0, -1, X1 - RX0, "3301", { tone: "#e8dcc8", head: "#3a2a4a", accent: "#c9a227", sofa: "#e8dcc4", rug: "#c8b89a", guest: 7320, presidential: true });
  suite(RX0, 1, (X1 - RX0) / 2, "3302", { tone: "#dde2e8", head: "#2a3a5a", accent: "#7fe3ff", sofa: "#3a4a6a", rug: "#9aa8b8", guest: 7331 });
  suite(RX0 + (X1 - RX0) / 2, 1, (X1 - RX0) / 2, "3303", { tone: "#eadfe2", head: "#5a2a3a", accent: "#ff9ab8", sofa: "#7a3a4a", rug: "#b8a0a8", guest: 7340 });
  void k.person(f, 7350, [2, LIFT_Z], "Bellboy", { wander: [[2, LIFT_Z], [12, LIFT_Z], [-9, LIFT_Z]] });
  k.light(f, -6, -17, "#ffe6c8", 7, -0.4);
  k.light(f, 6, -17, "#ffe6c8", 6, -0.4);
  k.light(f, -5, -5, "#ffe2b8", 6, -0.4);
  k.light(f, 8, -5, "#ffe2b8", 6, -0.4);
  k.light(f, 12, -17, "#fff0e0", 5, -0.4);
}
