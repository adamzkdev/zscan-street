import * as THREE from "three";
import { Market } from "../../data/market";
import { fitText } from "../../scene/fit";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import * as H from "./furniture";
import { soloist } from "../music/acts";
import { HotelKit, LEVELS, boards, num, usd } from "./kit";

const MENU: [string, number][] = [
  ["Chilli crab, mantou", 68],
  ["Black pepper lobster", 92],
  ["Wagyu, gold leaf", 140],
  ["Laksa, river prawns", 38],
  ["Kaya soufflé", 24],
  ["Marina Sling", 32],
];

/** 56 — the sky restaurant: tables in the glass, the open kitchen and its pass, the wine wall, the
 *  island bar, a DJ. */
export function restaurant(k: HotelKit) {
  const f = 5,
    g = k.groups[f],
    y = LEVELS[f].y,
    h = LEVELS[f].h,
    X0 = LEVELS[f].x0;
  k.shell(f, new THREE.MeshStandardMaterial({ map: boards("#3a2418", "#342014", 10, 8), roughness: 0.45 }), std("#121014", 0.9), { panels: "none", wallMat: std("#2a1a14", 0.7) });
  k.lifts(f);
  for (const [w, d, x, z] of [[29.6, 0.06, 0, -0.3], [0.06, 21.6, 14.7, -11]] as const) box(g, w, 0.05, d, glowMat("#ffb860", 1.3), x, y + h - 0.25, z);
  k.label(f, "SKY 56", X0 + 0.25, 3.6, -5.5, { h: 0.6, color: "#f4b728", rot: Math.PI / 2 });
  const priced = () => {
    const p = Market.state.price?.usd;
    return MENU.map(([n, u]) => [n, p ? `${(u / p).toFixed(3)} ZEC` : usd(u)] as [string, string]);
  };
  // the host stand by the lifts, the menu board
  k.put(f, "host", () => H.frontDesk(1.2), -11.6, -6.6, Math.PI / 2);
  void k.person(f, 7600, [-12.4, -6.6], "Waiter", { face: new THREE.Vector3(1, 0, 0) });
  const menu = k.screen(f, 1.8, 2.2, (gc, W, Hh) => {
    gc.fillStyle = "#0e0a08";
    gc.fillRect(0, 0, W, Hh);
    gc.fillStyle = "#f4b728";
    gc.font = '700 36px "JetBrains Mono", monospace';
    fitText(gc, "SKY 56 · MENU", 24, 56);
    priced().forEach(([n, z], i) => {
      gc.fillStyle = "#f4ead0";
      gc.font = '600 22px "JetBrains Mono", monospace';
      fitText(gc, n, 24, 120 + i * 82, W - 48);
      gc.fillStyle = "#c9a227";
      gc.font = '700 24px "JetBrains Mono", monospace';
      fitText(gc, z, 24, 152 + i * 82);
    });
  }, 20);
  menu.position.set(X0 + 0.22, y + 1.8, -3.2);
  menu.rotation.y = Math.PI / 2;
  k.pick(f, menu, "<b>Menu</b><span>prices in ZEC</span>", () => ({ eyebrow: "SKY 56", title: "Menu", stats: priced().slice(0, 4) }));

  // the open kitchen: the pass, the line behind, chefs; the wine wall west of it
  k.put(f, "pass", () => H.kitchenPass(9), 4.0, -18.4, 0);
  k.put(f, "line", () => F.kitchen(9, "#c0c4cc", "#3a3a40"), 4.0, -21.6, 0);
  box(g, 11, h - 2.6, 0.2, std("#2a1a14", 0.7), 4.0, y + 2.6, -18.1);
  k.label(f, "OPEN KITCHEN", 4.0, 3.4, -17.98, { h: 0.3, color: "#ff9a4a" });
  k.partition(f, -1.6, -22, -1.6, -18.3, std("#2a1a14", 0.7));
  k.partition(f, 9.6, -22, 9.6, -18.3, std("#2a1a14", 0.7));
  k.rects[f].push([-1.6, -22, 9.6, -18.0]);
  [[1, 7610], [4, 7611], [7, 7612]].forEach(([x, id]) => void k.person(f, id, [x, -19.8], "Chef", { face: new THREE.Vector3(0, 0, 1) }));
  let orders = 0;
  k.hit(f, 9, 1.4, 0.8, 4.0, 0, -18.4, "<b>The pass</b><span>order</span>", () => {
    const [n, z] = priced()[orders++ % MENU.length];
    return { eyebrow: "Open kitchen", title: n, stats: [["Price", z], ["Orders", `${orders}`]] };
  });
  const wine = k.put(f, "wineWall", () => H.wineWall(6, 3.6), -6.6, -21.6, 0);
  k.rects[f].push([-9.6, -22, -3.6, -21.2]);
  void k.person(f, 7620, [-6.6, -20.6], "Sommelier", { face: new THREE.Vector3(0, 0, 1) });
  k.pickAll(f, wine, "<b>Wine wall</b><span>1,200 bottles</span>", () => ({ eyebrow: "SKY 56 · cellar", title: "Wine wall", stats: [["Bottles", "1,200"], ["Temperature", "13 °C"]] }));

  // the island bar
  k.put(f, "skyBar", () => F.barCounter(5, "#f4b728"), -5.0, -11.4, 0);
  k.put(f, "skyBack", () => F.backBar(5), -5.0, -14.4, 0);
  for (let i = 0; i < 5; i++) k.put(f, "stoolSky", () => F.stool("#2a1a14"), -6.8 + i * 0.9, -10.5, 0, { solid: false });
  k.label(f, "SKY BAR", -5.0, 3.0, -14.1, { h: 0.4, color: "#f4b728" });
  void k.person(f, 7630, [-5.0, -12.9], "Bartender");
  void k.person(f, 7631, [-6.0, -10.5], "Guest", { face: new THREE.Vector3(0, 0, -1), sit: true, dy: 0.7 });
  void k.person(f, 7632, [-3.3, -10.5], "Guest", { face: new THREE.Vector3(0, 0, -1), sit: true, dy: 0.7 });
  const drinks = ["a Marina Sling", "an Orchard Negroni", "a Shielded Sour", "a Halving Highball", "a glass of Sprout '16"];
  let served = 0;
  k.hit(f, 5, 1.1, 0.9, -5.0, 0, -11.4, "<b>Sky bar</b><span>order</span>", () => ({ eyebrow: "Sky bar", title: drinks[served++ % drinks.length], stats: [["Price", Market.state.price ? `${(28 / Market.state.price.usd).toFixed(3)} ZEC` : "$28"], ["Block", k.height ? num(k.height) : "…"]] }));

  // the DJ in the north-east corner
  box(g, 2.4, 1.0, 1.0, std("#1c1a22", 0.5), 12.4, y, -20.4);
  box(g, 2.4, 0.05, 1.05, glowMat("#ff3e8a", 1.6), 12.4, y + 1.0, -20.4);
  for (const dx of [-0.6, 0.6]) {
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 24), std("#2a2830", 0.3, 0.6));
    deck.position.set(12.4 + dx, y + 1.05, -20.4);
    g.add(deck);
    k.ticks[f].push((dt) => (deck.rotation.y += dt * 3));
  }
  k.rects[f].push([11.1, -21, 13.7, -19.8]);
  void k.person(f, 7640, [12.4, -21.3], "DJ", { face: new THREE.Vector3(0, 0, 1), bob: 4 });

  // tables in the glass: two rows south, a column east
  const spots: [number, number][] = [];
  for (const x of [-10, -6, -2, 2, 6, 10]) spots.push([x, -2.0]);
  for (const x of [-8, -1, 3, 7]) spots.push([x, -5.6]);
  for (const z of [-8.8, -12.4, -16]) spots.push([12.6, z]);
  spots.forEach(([x, z], i) => {
    k.put(f, "roundT", () => H.roundTable(4), x, z);
    for (let s = 0; s < 4; s++) {
      const a = (s / 4) * Math.PI * 2 + Math.PI / 4;
      k.put(f, "velvetR", () => H.velvetChair(["#5a1a2a", "#1a3a4a"][i % 2]), x + Math.cos(a) * 0.9, z + Math.sin(a) * 0.9, -Math.PI / 2 - a, { solid: false });
      if ((i * 3 + s) % 5 < 2) void k.person(f, 7700 + i * 4 + s, [x + Math.cos(a) * 0.85, z + Math.sin(a) * 0.85], "Guest", { sit: true, dy: 0.45, face: new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a)) });
    }
    k.put(f, "pendantR", () => F.pendant(1.6, "#ffd8a0"), x, z, 0, { dy: h - 1.6, solid: false });
  });
  // a violinist plays Bach between the tables (a real recording, heard from where she stands)
  soloist(g, "violin", { x: 6.4, y, z: -11.6, yaw: 0.25 }, { place: "hotel", floor: f, track: "violin-bach", id: 7650, role: "Violinist", level: 0.75 });
  k.rects[f].push([6.0, -12.0, 6.8, -11.2]);
  void k.person(f, 7660, [0, -8], "Waiter", { wander: [[0, -8], [8, -4], [-8, -4], [10, -10], [4, -16.5], [-4, -7.5]] });
  void k.person(f, 7661, [6, -10], "Waiter", { wander: [[6, -10], [11, -14], [-2, -4], [4, -16.5]] });
  for (const [i, [x, z]] of ([[-13.8, -20.8], [14.2, -1], [-13.8, -1.2]] as [number, number][]).entries()) k.put(f, `plantR${i}`, () => F.plant((["ficus", "monstera", "monstera"] as const)[i], 60 + i), x, z);
  k.light(f, 0, -3.5, "#ffd8a0", 10, -0.6);
  k.light(f, 4, -17, "#ffb070", 8, -0.6);
  k.light(f, -5, -12, "#ffc070", 8, -0.6);
  k.light(f, 12.4, -12, "#ffd8a0", 7, -0.6);
  k.light(f, 12.4, -20, "#ff3e8a", 5, -0.6);
}
