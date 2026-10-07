import * as THREE from "three";
import { Market } from "../../data/market";
import { ZScan } from "../../data/zscan";
import { bistroTable, bookshelf, coffeeTable, plant, receptionDesk, sofa, umbrella, armchair } from "../furniture";
import type { PickInfo } from "../types";
import { bankerLamp, bench, clubChair, desk, glassRail, stanchion } from "./arch";
import { board, drawPools, POOL_COLOR, poolsInfo, supplyInfo } from "./data";
import { C, F, GOLD, LEVELS, MONO, num, paint, SANS, SERIF, usd, zec, type ReserveKit } from "./kit";

/**
 * The upper floors. 3: the museum of money, Zcash from the Zerocash paper to Ironwood, one coin
 * per upgrade in a lit vitrine (activation heights from the chain), the ceremony's broken
 * computer, the halving wall, a giant coin turning in the rotunda. 21: the executive floor in the
 * tower, glass all round onto the real city: the boardroom, the governor's office, the lounge.
 * R: the observation terrace on the roof, under the gold crown and its beacon.
 */

// ---- 3 · the museum ----------------------------------------------------------------------------

interface Exhibit {
  name: string;
  /** API upgrade name, for the live activation height. */
  api?: string;
  year: string;
  height: number | null;
  sub: string;
  color: string;
}

const EXHIBITS: Exhibit[] = [
  { name: "Zerocash", year: "2014", height: null, sub: "IEEE S&P · paper", color: "#8a8a9a" },
  { name: "Sprout", year: "2016", height: 0, sub: "Genesis · BCTV14", color: POOL_COLOR.sprout },
  { name: "Overwinter", api: "Overwinter", year: "2018", height: 347500, sub: "v3 transactions", color: "#6aa0c8" },
  { name: "Sapling", api: "Sapling", year: "2018", height: 419200, sub: "Groth16 · shielded pool", color: POOL_COLOR.sapling },
  { name: "Blossom", api: "Blossom", year: "2019", height: 653600, sub: "75-second blocks", color: "#e889b0" },
  { name: "Heartwood", api: "Heartwood", year: "2020", height: 903000, sub: "Shielded coinbase", color: "#b0603a" },
  { name: "Canopy", api: "Canopy", year: "2020", height: 1046400, sub: "Dev Fund · ZIP 1014", color: "#4a9a5a" },
  { name: "NU5 · Orchard", api: "Nu5", year: "2022", height: 1687104, sub: "Halo 2 · no trusted setup", color: POOL_COLOR.orchard },
  { name: "NU6 · Lockbox", api: "Nu6", year: "2024", height: 2726400, sub: "ZIP 1015", color: "#c9a24a" },
  { name: "NU6.1", api: "Nu6_1", year: "2025", height: 3146400, sub: "ZIP 1016", color: "#9a8ac8" },
  { name: "NU6.2", api: "Nu6_2", year: "2026", height: 3364600, sub: "Orchard fix", color: "#d06a4a" },
  { name: "NU6.3 · Ironwood", api: "Nu6_3", year: "2026", height: 3428143, sub: "Ironwood pool", color: POOL_COLOR.ironwood },
  { name: "NU7", api: "Nu7", year: "next", height: null, sub: "25-second blocks · ZIP 218", color: "#f4b728" },
];

/** A coin face: a rim, the name, the year, the Z. */
function coinFace(e: { name: string; year: string; color: string }) {
  return paint(256, 256, (c, W, H) => {
    const g = c.createRadialGradient(W * 0.4, H * 0.35, 10, W / 2, H / 2, W / 2);
    g.addColorStop(0, "#ffe9a8");
    g.addColorStop(1, "#c8901e");
    c.fillStyle = g;
    c.beginPath();
    c.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#8a5a10";
    c.lineWidth = 6;
    c.beginPath();
    c.arc(W / 2, H / 2, W / 2 - 14, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = e.color;
    c.beginPath();
    c.arc(W / 2, H / 2, 62, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fff6d8";
    c.font = `900 90px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Z", W / 2, H / 2 + 4);
    c.fillStyle = "#5a3a08";
    c.font = `800 22px ${SANS}`;
    const nm = e.name.split(" · ").pop()!.toUpperCase();
    c.fillText(nm, W / 2, 46);
    c.fillText(e.year.toUpperCase(), W / 2, H - 44);
  });
}

export function museum(k: ReserveKit) {
  const f = F.museum;
  const L = LEVELS[f];
  const H = L.h;
  const parquet = paint(
    128,
    128,
    (c, W, Hh) => {
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++) {
          c.fillStyle = (i + j) % 2 ? "#3a2416" : "#4a2e1c";
          c.fillRect(i * 16, j * 16, 16, 16);
          c.fillStyle = "rgba(0,0,0,0.2)";
          if ((i + j) % 2) c.fillRect(i * 16, j * 16 + 7, 16, 2);
          else c.fillRect(i * 16 + 7, j * 16, 2, 16);
        }
    },
    18,
    18,
  );
  k.flat(f, 36, 36, new THREE.MeshStandardMaterial({ map: parquet, roughness: 0.4, metalness: 0.05 }), 0, -18, 0);
  const red = "#4a1418";
  for (const [x0, z0, x1, z1] of [
    [-18, -36, 18, -36],
    [-18, -36, -18, 0],
    [18, -36, 18, 0],
    [-18, 0, 18, 0],
  ] as const) {
    k.wall(f, x0, z0, x1, z1, H, red, "matte", 0.3);
    const len = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    const along = z0 === z1;
    const inset = (v: number, n: number) => v + n;
    const nx = along ? 0 : x0 < 0 ? 0.16 : -0.16,
      nz = along ? (z0 < -1 ? 0.16 : -0.16) : 0;
    k.box(f, along ? len : 0.08, 1.0, along ? 0.08 : len, inset((x0 + x1) / 2, nx), 0, inset((z0 + z1) / 2, nz), C.greenMarble, "polish");
    k.box(f, along ? len : 0.1, 0.06, along ? 0.1 : len, inset((x0 + x1) / 2, nx), 1.0, inset((z0 + z1) / 2, nz), GOLD, "metal");
    k.box(f, along ? len : 0.1, 0.06, along ? 0.1 : len, inset((x0 + x1) / 2, nx), 4.4, inset((z0 + z1) / 2, nz), GOLD, "metal");
    k.box(f, along ? len : 0.3, 0.4, along ? 0.3 : len, inset((x0 + x1) / 2, nx), H - 0.4, inset((z0 + z1) / 2, nz), "#e8dcc4", "polish");
  }
  k.box(f, 36, 0.3, 36, 0, H, -18, "#1a1012", "matte");
  // the rotunda's oculus: a ring of light over the coin
  k.geo(f, new THREE.TorusGeometry(4.2, 0.12, 8, 64).rotateX(Math.PI / 2).translate(0, H - 0.1, -18), "#fff0d0", "glow");
  k.geo(f, new THREE.TorusGeometry(4.6, 0.25, 8, 64).rotateX(Math.PI / 2).translate(0, H - 0.2, -18), GOLD, "metal");
  k.lifts(f, -17.85, L.spawn[1], Math.PI / 2);
  k.label(f, "MUSEUM OF MONEY", -17.84, 4.9, -14, { h: 0.42, color: GOLD, font: `700 96px ${SERIF}`, ry: Math.PI / 2 });

  // the giant coin
  k.cyl(f, 1.6, 1.6, 0.3, 0, 0, -18, C.greenMarble, "polish", 32);
  k.cyl(f, 1.2, 1.4, 0.9, 0, 0.3, -18, C.cream, "polish", 32);
  k.cyl(f, 1.45, 1.45, 0.06, 0, 1.2, -18, GOLD, "metal", 32);
  const face = coinFace({ name: "ZEC", year: "21,000,000", color: "#1a1408" });
  const coinMats = [new THREE.MeshStandardMaterial({ color: "#d9a632", metalness: 1, roughness: 0.3 }), new THREE.MeshStandardMaterial({ map: face, metalness: 0.6, roughness: 0.35 }), new THREE.MeshStandardMaterial({ map: face, metalness: 0.6, roughness: 0.35 })];
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.22, 64).rotateX(Math.PI / 2), coinMats);
  k.add(f, coin, 0, 2.75, -18, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    stanchion(k, f, Math.cos(a) * 2.9, -18 + Math.sin(a) * 2.9, [Math.cos(a + (Math.PI * 2) / 10) * 2.9, -18 + Math.sin(a + (Math.PI * 2) / 10) * 2.9]);
  }
  const zinfo = (): PickInfo => {
    const s = Market.state.supply;
    return { eyebrow: "Museum of money", title: "ZEC", stats: [["Cap", "21,000,000"], ["Issued", s ? zec(s.supply) : "—"], ["Genesis", "28 Oct 2016"], ["Block", num(k.height)]] };
  };
  k.pick(f, coin, "<b>ZEC</b><span>21,000,000</span>", zinfo);
  k.ticks[f].push((dt) => (coin.rotation.y += dt * 0.4));

  // the vitrines: nine along the north wall, four on the east wall
  const heights = new Map<string, number | null>();
  void ZScan.upgrades().then((u) => u?.upgrades.forEach((x) => heights.set(x.name, x.activation_height)));
  const coins: THREE.Mesh[] = [];
  EXHIBITS.forEach((e, i) => {
    const north = i < 9;
    const x = north ? -14.4 + i * 3.6 : 16.6;
    const z = north ? -34.6 : -30 + (i - 9) * 4.4;
    const ry = north ? 0 : -Math.PI / 2;
    k.box(f, 1.0, 1.0, 1.0, x, 0, z, C.walnut, "polish");
    k.box(f, 1.06, 0.06, 1.06, x, 1.0, z, GOLD, "metal");
    k.box(f, 0.9, 0.9, 0.9, x, 1.06, z, "#d8ecf4", "glass");
    k.box(f, 0.92, 0.04, 0.92, x, 1.96, z, GOLD, "metal");
    k.cyl(f, 0.08, 0.12, 0.25, x, 1.06, z, "#1a1408", "polish", 10);
    k.solid(f, x - 0.55, z - 0.55, x + 0.55, z + 0.55);
    const fm = coinFace(e);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 40).rotateX(Math.PI / 2), [new THREE.MeshStandardMaterial({ color: "#c8901e", metalness: 1, roughness: 0.3 }), new THREE.MeshStandardMaterial({ map: fm, roughness: 0.4, metalness: 0.4 }), new THREE.MeshStandardMaterial({ map: fm, roughness: 0.4, metalness: 0.4 })]);
    k.add(f, c, x, 1.6, z, ry);
    coins.push(c);
    // the poster over it: era colour, name, year, height
    const poster = k.screen(
      f,
      2.2,
      2.6,
      (g, W, Hh) => {
        g.fillStyle = "#14100c";
        g.fillRect(0, 0, W, Hh);
        g.fillStyle = e.color;
        g.fillRect(0, 0, W, 16);
        g.fillRect(0, Hh - 10, W, 10);
        g.fillStyle = "#f6efe0";
        g.font = `800 ${e.name.length > 12 ? 44 : 58}px ${SERIF}`;
        g.textAlign = "center";
        g.fillText(e.name, W / 2, 110);
        g.fillStyle = e.color;
        g.font = `900 120px ${MONO}`;
        g.fillText(e.year.toUpperCase(), W / 2, 270);
        const h = e.api ? (heights.get(e.api) ?? e.height) : e.height;
        g.fillStyle = "#c9b48a";
        g.font = `600 34px ${MONO}`;
        g.fillText(h != null ? `BLOCK ${num(h)}` : e.api ? "BLOCK —" : "", W / 2, 360);
        g.fillStyle = "#8f8a80";
        g.font = `500 30px ${SANS}`;
        g.fillText(e.sub, W / 2, 430);
        g.fillStyle = GOLD;
        g.font = `700 30px ${MONO}`;
        g.fillText(String(i + 1).padStart(2, "0"), W / 2, 540);
        g.textAlign = "left";
      },
      20,
      512,
    );
    (poster.material as THREE.MeshBasicMaterial).color.setScalar(0.95);
    k.add(f, poster, north ? x : x - 0.16, 3.4, north ? z - 0.84 : z, ry);
    const info = (): PickInfo => {
      const h = e.api ? (heights.get(e.api) ?? e.height) : e.height;
      return { eyebrow: `Museum of money · ${String(i + 1).padStart(2, "0")}`, title: e.name, tag: [e.year, "info"], stats: [["Year", e.year], ["Activation", h != null ? num(h) : "—"], ["", e.sub]].filter((r) => r[1]).map((r) => (r[0] ? r : ["Feature", r[1]])) as [string, string][] };
    };
    k.pick(f, poster, `<b>${e.name}</b><span>${e.year}</span>`, info);
    k.pick(f, c, `<b>${e.name}</b><span>${e.year}</span>`, info);
    // a picture light over the poster
    k.box(f, 1.2, 0.06, 0.18, north ? x : x - 0.26, 4.85, north ? z - 0.74 : z, C.brass, "metal", ry);
    k.box(f, 1.0, 0.02, 0.06, north ? x : x - 0.3, 4.83, north ? z - 0.7 : z, "#fff0c8", "glow", ry);
  });
  k.ticks[f].push((dt, t) => coins.forEach((c, i) => (c.rotation.y = t * 0.6 + i)));

  // the ceremony: the broken computer from 2016, on a plinth of its own
  const cx = -9,
    cz = -24;
  k.box(f, 2.2, 0.8, 1.6, cx, 0, cz, C.walnut, "polish");
  k.box(f, 2.3, 0.05, 1.7, cx, 0.8, cz, GOLD, "metal");
  k.box(f, 2.1, 1.0, 1.5, cx, 0.85, cz, "#d8ecf4", "glass");
  k.box(f, 0.7, 0.05, 0.5, cx - 0.3, 0.85, cz, "#2a2a30", "metal", 0.3);
  k.box(f, 0.5, 0.03, 0.34, cx + 0.45, 0.9, cz + 0.2, "#151518", "polish", -0.6);
  k.box(f, 0.32, 0.02, 0.22, cx + 0.2, 0.86, cz - 0.4, "#151518", "polish", 1.1);
  for (let i = 0; i < 9; i++) k.box(f, 0.05 + k.rnd(i, 1) * 0.12, 0.02, 0.05 + k.rnd(i, 2) * 0.1, cx - 0.8 + k.rnd(i, 3) * 1.6, 0.86, cz - 0.6 + k.rnd(i, 4) * 1.2, i % 3 ? "#3a8a3a" : "#888", "matte", k.rnd(i, 5) * 3);
  for (let i = 0; i < 3; i++) k.cyl(f, 0.12, 0.12, 0.01, cx + 0.6 - i * 0.05, 0.86 + i * 0.011, cz - 0.3, "#d8dce4", "metal", 24);
  k.solid(f, cx - 1.15, cz - 0.85, cx + 1.15, cz + 0.85);
  k.label(f, "THE CEREMONY · 2016", cx, 0.45, cz + 0.82, { h: 0.12, color: GOLD });
  k.hit(f, 2.1, 1.0, 1.5, cx, 0.85, cz, "<b>The Ceremony</b><span>2016</span>", () => ({ eyebrow: "Museum of money", title: "The Ceremony", tag: ["2016", "info"], stats: [["Parameters", "Sprout · BCTV14"], ["Participants", "6"], ["Computer", "destroyed"]] }));

  // the halving wall on the west side
  const halving = k.screen(
    f,
    7,
    2.6,
    (g, W, Hh) => {
      board(g, W, Hh, "BLOCK REWARD", "ZEC / BLOCK");
      const rows: [string, number][] = [
        ["2016", 12.5],
        ["2019", 6.25],
        ["2020", 3.125],
        ["2024", 1.5625],
        ["2028", 0.78125],
      ];
      const bw = (W - 60) / rows.length;
      rows.forEach(([y, v], i) => {
        const h = (v / 12.5) * (Hh - 130);
        const x = 30 + i * bw;
        g.fillStyle = i === 3 ? GOLD : i === 4 ? "rgba(244,183,40,0.25)" : "#a8823e";
        g.fillRect(x + 10, Hh - 40 - h, bw - 20, h);
        g.fillStyle = "#f6efe0";
        g.font = `700 22px ${MONO}`;
        g.textAlign = "center";
        g.fillText(String(v), x + bw / 2, Hh - 48 - h);
        g.fillStyle = "#8f8a80";
        g.fillText(y, x + bw / 2, Hh - 12);
        g.textAlign = "left";
      });
    },
    60,
    1024,
  );
  k.add(f, halving, -17.82, 2.8, -26, Math.PI / 2);
  k.pick(f, halving, "<b>Block reward</b><span>halvings</span>", () => supplyInfo(k.height));
  for (const z of [-11, -25]) bench(k, f, z === -11 ? 0 : 0, z, 3, false);
  k.vox(f, "rsvPlantFicus", () => plant("ficus", 3), -16.8, -34.8, 0);
  k.vox(f, "rsvPlantFicus", () => plant("ficus", 3), 16.8, -34.8, 0);
  k.vox(f, "rsvPlantMon", () => plant("monstera", 5), 16.8, -1.2, 0);

  k.light(f, 0, 5, -18, "#ffe6c0", 20, 16);
  k.light(f, -8, 5, -30, "#ffdcb0", 18, 16);
  k.light(f, 8, 5, -30, "#ffdcb0", 18, 16);
  k.light(f, 13, 5, -16, "#ffdcb0", 16, 16);
  k.light(f, -10, 5, -10, "#ffdcb0", 14, 16);

  k.onCast(f, () => {
    const guide = k.person(f, 7001, [-3.6, -29.6], "Museum guide", { face: [0, -1] });
    const v1 = k.person(f, 7002, [-4.6, -28.4], "Visitor", { face: [0, -1] });
    const v2 = k.person(f, 7003, [-2.6, -28.2], "Visitor", { face: [0, -1] });
    k.dialog(f, [guide, v1, v2], [
      [0, "Sprout. October 2016. Where it began."],
      [1, "And that smashed computer?"],
      [0, "The ceremony. Nobody keeps the toxic waste."],
      [2, "Then Sapling made it fast."],
      [0, "Orchard removed the setup. Ironwood took over."],
      [1, () => `And today, block ${num(k.height)}.`],
    ], { near: 14 });
    k.person(f, 7004, [16.2, -3.2], "Museum guard", { face: [-1, 0], lines: ["No flash, please.", "The coins are real. Don't tap the glass."] });
    k.dialog(f, [k.person(f, 7005, [12.8, -15.4], "Collector", { face: [1, 0] }), k.person(f, 7006, [12.9, -16.6], "Collector", { face: [1, 0] })], [
      [0, "NU6.3. Ironwood. Already in a museum."],
      [1, "History moves fast on this chain."],
      [0, () => `${zec(Market.state.pools?.pools.ironwood ?? 0)} ZEC in it now.`],
    ]);
    k.person(f, 7007, [0, -11.4], "Student", { face: [0, -1], sit: true, lines: ["Halo 2. No trusted setup. Wow.", "Writing my thesis on Sapling."] });
    k.person(f, 7008, [-9, -22.4], "Visitor", { face: [0, -1], lines: ["They really smashed it.", "Six people, one ceremony."] });
  });
}

// ---- 21 · the executive floor --------------------------------------------------------------------

/** Glass all round (but the west core): mullions, a sill, the panes. */
function glassShell(k: ReserveKit, f: number, step = 2) {
  const L = LEVELS[f];
  const H = L.h || 1.1;
  const glass = new THREE.MeshStandardMaterial({ color: "#9cc3df", transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.3, depthWrite: false });
  const pane = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const p = k.plane(f, len, H, glass, (x0 + x1) / 2, H / 2, (z0 + z1) / 2, 0, x0 === x1 ? Math.PI / 2 : 0);
    p.raycast = () => {};
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) k.box(f, 0.1, H, 0.1, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n, "#2a2832", "metal");
    k.box(f, Math.max(0.12, Math.abs(x1 - x0)), 0.12, Math.max(0.12, Math.abs(z1 - z0)), (x0 + x1) / 2, 0, (z0 + z1) / 2, "#2a2832", "metal");
    if (L.h) k.box(f, Math.max(0.12, Math.abs(x1 - x0)), 0.1, Math.max(0.12, Math.abs(z1 - z0)), (x0 + x1) / 2, H - 0.1, (z0 + z1) / 2, "#2a2832", "metal");
    k.solid(f, Math.min(x0, x1) - 0.1, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, Math.max(z0, z1) + 0.1);
  };
  pane(L.x0, L.z0, L.x1, L.z0);
  pane(L.x1, L.z0, L.x1, L.z1);
  pane(L.x0, L.z1, L.x1, L.z1);
}

export function executive(k: ReserveKit) {
  const f = F.exec;
  const L = LEVELS[f];
  const H = L.h;
  const carpet = paint(
    128,
    128,
    (c, W, Hh) => {
      c.fillStyle = "#cfc4b0";
      c.fillRect(0, 0, W, Hh);
      c.strokeStyle = "rgba(120,100,70,0.25)";
      c.lineWidth = 2;
      for (let i = 0; i < W; i += 16) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i, Hh);
        c.stroke();
      }
    },
    16,
    15,
  );
  k.flat(f, 32, 30, new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 }), 0, -15, 0);
  k.box(f, 32, 0.25, 30, 0, H, -15, "#ece6da", "matte");
  for (let x = -12; x <= 12; x += 4) for (let z = -27; z <= -3; z += 4) k.box(f, 1.2, 0.02, 1.2, x, H - 0.02, z, "#fff6e4", "glow");
  k.wall(f, -16, -30, -16, 0, H, "#3a2a1e", "polish", 0.3);
  glassShell(k, f);
  k.lifts(f, -15.8, L.spawn[1], Math.PI / 2);

  // ---- the boardroom ----
  const wood = "#4a2e1c";
  k.flat(f, 15.6, 12, new THREE.MeshStandardMaterial({ color: "#2a1a10", roughness: 0.5 }), -7.8, -23.6, 0.01);
  k.wall(f, 1, -30, 1, -17.6, H, wood, "polish", 0.2);
  // a glass partition with a door on the corridor side
  const pglass = new THREE.MeshStandardMaterial({ color: "#c8e0ec", transparent: true, opacity: 0.12, roughness: 0.05, depthWrite: false });
  for (const [x0, x1] of [
    [-15.8, -4.2],
    [-2.4, 1],
  ]) {
    k.plane(f, x1 - x0, H, pglass, (x0 + x1) / 2, H / 2, -17.6).raycast = () => {};
    k.box(f, x1 - x0, 0.08, 0.1, (x0 + x1) / 2, 0, -17.6, "#2a2832", "metal");
    k.box(f, x1 - x0, 0.08, 0.1, (x0 + x1) / 2, H - 0.08, -17.6, "#2a2832", "metal");
    k.box(f, x1 - x0, 0.3, 0.02, (x0 + x1) / 2, 1.3, -17.6, "#e8e0d0", "matte");
    k.solid(f, x0, -17.7, x1, -17.5);
  }
  k.label(f, "BOARDROOM", -9.8, 2.5, -17.55, { h: 0.18, color: "#3a2a1a", glow: false, ry: Math.PI });
  k.label(f, "BOARDROOM", -9.8, 2.5, -17.65, { h: 0.18, color: "#3a2a1a", glow: false });
  // the long table
  const TZ = -23.6;
  k.box(f, 9.4, 0.08, 2.0, -7.8, 0.74, TZ, "#3a1e10", "polish");
  k.box(f, 9.2, 0.02, 0.4, -7.8, 0.82, TZ, "#1d3a2a", "matte");
  for (const x of [-11.6, -7.8, -4.0]) k.box(f, 0.5, 0.74, 1.2, x, 0, TZ, "#2a1408", "polish");
  k.solid(f, -12.5, TZ - 1.0, -3.1, TZ + 1.0);
  for (let i = 0; i < 6; i++) {
    const x = -11.6 + i * 1.52;
    clubChair(k, f, x, TZ - 1.45, 0, "#2a1a14");
    clubChair(k, f, x, TZ + 1.45, Math.PI, "#2a1a14");
    k.box(f, 0.3, 0.01, 0.22, x, 0.82, TZ - 0.6, "#f4f1ea", "matte");
    k.box(f, 0.3, 0.01, 0.22, x, 0.82, TZ + 0.6, "#f4f1ea", "matte");
  }
  clubChair(k, f, -13.3, TZ, -Math.PI / 2, "#4a1a10");
  for (const x of [-10, -6]) {
    k.cyl(f, 0.02, 0.02, 1.0, x, H - 1.0, TZ, C.brass, "metal", 6);
    k.box(f, 2.4, 0.06, 0.3, x, H - 1.06, TZ, C.brass, "metal");
    k.box(f, 2.2, 0.02, 0.2, x, H - 1.08, TZ, "#fff0d0", "glow");
  }
  // the balance sheet on the core wall, the governors on the east wall
  const sheet = k.screen(f, 4.6, 2.6, (g, W, Hh) => drawPools(g, W, Hh, "BALANCE SHEET"), 8, 768);
  k.add(f, sheet, -15.82, 1.0 + 1.3, TZ, Math.PI / 2);
  k.pick(f, sheet, "<b>Balance sheet</b><span>value pools</span>", poolsInfo);
  [
    [-27.5, 1888, "First Governor"],
    [-23.6, 4096, "Second Governor"],
    [-19.7, 6512, "Third Governor"],
  ].forEach(([z, id, t]) => k.painting(f, id as number, 0.88, 2.4, z as number, -Math.PI / 2, 0.9, t as string));

  // ---- the governor's office ----
  k.flat(f, 11.6, 15.6, new THREE.MeshStandardMaterial({ color: "#3a2416", roughness: 0.45 }), 9.8, -22.2, 0.01);
  k.wall(f, 4, -30, 4, -18, H, wood, "polish", 0.2);
  k.wall(f, 4, -16.2, 4, -14.4, H, wood, "polish", 0.2);
  k.box(f, 0.2, H - 2.3, 1.8, 4, 2.3, -17.1, wood, "polish");
  k.wall(f, 4, -14.4, 16, -14.4, H, wood, "polish", 0.2);
  k.label(f, "GOVERNOR", 3.88, 2.5, -15.3, { h: 0.16, color: GOLD, ry: -Math.PI / 2 });
  // a Persian rug, the desk, the chairs
  const rugT = paint(256, 192, (c, W, Hh) => {
    c.fillStyle = "#6a1420";
    c.fillRect(0, 0, W, Hh);
    c.strokeStyle = "#c9a24a";
    c.lineWidth = 6;
    c.strokeRect(10, 10, W - 20, Hh - 20);
    c.strokeStyle = "#1a2a4a";
    c.lineWidth = 10;
    c.strokeRect(26, 26, W - 52, Hh - 52);
    c.fillStyle = "#c9a24a";
    c.beginPath();
    c.ellipse(W / 2, Hh / 2, 50, 36, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#6a1420";
    c.beginPath();
    c.ellipse(W / 2, Hh / 2, 34, 22, 0, 0, Math.PI * 2);
    c.fill();
  });
  k.flat(f, 6, 4.5, new THREE.MeshStandardMaterial({ map: rugT, roughness: 0.95 }), 10, -24.5, 0.02);
  desk(k, f, 10, -25, 2.6, 1.1, 0);
  bankerLamp(k, f, 9.0, 0.78, -25.2, 0);
  clubChair(k, f, 10, -26.2, 0, "#3a1408");
  clubChair(k, f, 9.1, -23.3, Math.PI, "#6a2a1a");
  clubChair(k, f, 10.9, -23.3, Math.PI, "#6a2a1a");
  const term = k.screen(f, 0.56, 0.34, (g, W, Hh) => drawPools(g, W, Hh, "RESERVE"), 10, 512);
  k.add(f, term, 10.6, 0.98, -25.25, 0);
  k.box(f, 0.6, 0.38, 0.03, 10.6, 0.8, -25.28, "#111", "polish");
  k.pick(f, term, "<b>Governor's terminal</b><span>value pools</span>", poolsInfo);
  // flags either side of the window
  for (const [x, col] of [
    [7.4, "#14382a"],
    [12.6, "#f4b728"],
  ] as const) {
    k.cyl(f, 0.18, 0.2, 0.1, x, 0, -28.8, C.brass, "metal", 12);
    k.cyl(f, 0.025, 0.025, 2.7, x, 0.1, -28.8, C.brass, "metal", 8);
    k.geo(f, new THREE.SphereGeometry(0.06, 8, 6).translate(x, 2.85, -28.8), GOLD, "metal");
    const flag = paint(128, 96, (c, W, Hh) => {
      c.fillStyle = col;
      c.fillRect(0, 0, W, Hh);
      c.fillStyle = col === "#f4b728" ? "#1a1408" : GOLD;
      c.font = `900 70px ${SERIF}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("Z", W / 2, Hh / 2 + 4);
    });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.3, 1, 8), new THREE.MeshStandardMaterial({ map: flag, side: THREE.DoubleSide, roughness: 0.9 }));
    fl.geometry.rotateZ(Math.PI / 2);
    k.add(f, fl, x + (x < 10 ? 0.12 : -0.12), 2.05, -28.8, x < 10 ? 0.25 : -0.25);
    fl.raycast = () => {};
  }
  // a globe, bookshelves, the sofa corner
  k.cyl(f, 0.25, 0.08, 0.8, 14.6, 0, -27.8, C.walnut, "polish", 10);
  const globeT = paint(256, 128, (c, W, Hh) => {
    c.fillStyle = "#c8b07a";
    c.fillRect(0, 0, W, Hh);
    c.fillStyle = "#7a5a2a";
    for (let i = 0; i < 14; i++) {
      c.beginPath();
      c.ellipse(k.rnd(i, 1) * W, 20 + k.rnd(i, 2) * (Hh - 40), 10 + k.rnd(i, 3) * 26, 6 + k.rnd(i, 4) * 16, 0, 0, Math.PI * 2);
      c.fill();
    }
  });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 16), new THREE.MeshStandardMaterial({ map: globeT, roughness: 0.6 }));
  k.add(f, globe, 14.6, 1.16, -27.8, 0);
  k.geo(f, new THREE.TorusGeometry(0.42, 0.015, 6, 32).translate(14.6, 1.16, -27.8), C.brass, "metal");
  k.solid(f, 14.2, -28.2, 15, -27.4);
  k.ticks[f].push((dt) => (globe.rotation.y += dt * 0.15));
  for (const z of [-28.4, -26.9, -25.4, -23.9]) k.vox(f, `rsvShelf${z}`, () => bookshelf(Math.round(-z), 14), 4.35, z, Math.PI / 2);
  k.vox(f, "rsvSofaGov", () => sofa("#2a3a2e", 3), 10, -15.3, Math.PI);
  k.vox(f, "rsvArmGov", () => armchair("#6a2a1a"), 13.6, -17.6, -Math.PI / 2);
  k.vox(f, "rsvCoffee", () => coffeeTable(), 10, -17.2, 0);
  k.painting(f, 9999, 10, 2.4, -14.55, Math.PI, 1.0, "The Founder");

  // ---- the lounge and reception ----
  k.vox(f, "rsvReception", () => receptionDesk(), -9.6, -3.6, -Math.PI / 2);
  k.label(f, "ZEC RESERVE · EXECUTIVE", -9, 3.2, -15.85, { h: 0.3, color: GOLD, font: `700 80px ${SERIF}` });
  k.box(f, 7, 1.2, 0.2, -9, 2.6, -15.95, "#2a1a10", "polish");
  for (const [x, z, r] of [
    [4, -4, 0],
    [8, -4, 0],
    [12.5, -8, -Math.PI / 2],
  ] as const)
    k.vox(f, `rsvSofaL${r}`, () => sofa("#d8cfbe", 3), x, z, r + Math.PI);
  k.vox(f, "rsvCoffee", () => coffeeTable(), 6, -6.2, 0);
  for (const [x, z] of [
    [-14.8, -1.2],
    [15, -1.2],
    [15, -13.6],
    [-1, -1.2],
  ])
    k.vox(f, "rsvPlantMon", () => plant("monstera", 5), x, z, 0);

  k.light(f, -7.8, 3.6, TZ, "#ffe6c0", 12, 14);
  k.light(f, 10, 3.6, -23, "#ffe0b0", 12, 14);
  k.light(f, 0, 3.6, -8, "#fff0dc", 12, 16);

  k.onCast(f, () => {
    const seats: [number, number, number][] = [];
    for (let i = 0; i < 6; i++) {
      if (i % 2 === 0) seats.push([-11.6 + i * 1.52, TZ - 1.4, 1]);
      if (i % 2 === 1) seats.push([-11.6 + i * 1.52, TZ + 1.4, -1]);
    }
    const board = seats.map(([x, z, d], i) => k.person(f, 7101 + i * 13, [x, z], "Board member", { face: [0, d], sit: true }));
    const chair = k.person(f, 7190, [-13.2, TZ], "Chair of the board", { face: [1, 0], sit: true });
    k.dialog(f, [chair, board[0], board[1], board[2]], [
      [0, "Item one: the shielded ratio."],
      [1, () => `${((Market.state.pools?.shielded_ratio ?? 0) * 100).toFixed(1)}% and rising.`],
      [2, "Ironwood is doing the work."],
      [0, "Item two: rates."],
      [3, "Zero. As always."],
      [0, "Motion carried."],
    ], { near: 13 });
    k.dialog(f, [board[3], board[4]], [
      [0, () => `Price ${usd(Market.state.price?.usd ?? 0)}.`],
      [1, "The Reserve doesn't trade on price."],
      [0, "But the floor does."],
    ], { near: 10 });
    const gov = k.person(f, 7201, [10, -28.6], "Governor", { face: [0, -1] });
    const aide = k.person(f, 7202, [8.6, -27.6], "Aide", { face: [1, -0.4] });
    k.dialog(f, [gov, aide], [
      [1, () => `Block ${num(k.height)}, Governor.`],
      [0, "Look at that city."],
      [1, () => `${zec(Market.state.pools?.shielded ?? 0)} ZEC shielded.`],
      [0, "Privacy is normal. Remember that."],
    ], { near: 12 });
    k.person(f, 7203, [-8.4, -3.6], "Executive assistant", { face: [-1, 0], lines: ["The Governor is in a meeting.", "Boardroom to your right.", "Coffee? Shielded beans."] });
    k.dialog(f, [k.person(f, 7204, [6, -2.2], "Executive", { face: [0, 1] }), k.person(f, 7205, [7.2, -2.4], "Executive", { face: [-1, 0.5] })], [
      [0, "You can see the Pyramid from here."],
      [1, "And the bus. Always the bus."],
      [0, "Every block, right on time."],
    ]);
  });
}

// ---- R · the observation terrace -------------------------------------------------------------------

export function roof(k: ReserveKit) {
  const f = F.roof;
  const pavers = paint(
    128,
    128,
    (c, W, Hh) => {
      c.fillStyle = "#3a3632";
      c.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          c.fillStyle = `rgb(${92 + k.rnd(i, j) * 26},${88 + k.rnd(j, i) * 22},${84 + k.rnd(i + j, 3) * 18})`;
          c.fillRect(i * 32 + 2, j * 32 + 2, 28, 28);
        }
    },
    16,
    15,
  );
  k.flat(f, 32, 30, new THREE.MeshStandardMaterial({ map: pavers, roughness: 0.85 }), 0, -15, 0);
  k.box(f, 32.6, 0.6, 30.6, 0, -0.62, -15, "#8a8478", "matte");
  // the parapet and the glass balustrade
  for (const [x0, z0, x1, z1] of [
    [-16, -30, 16, -30],
    [16, -30, 16, 0],
    [-16, 0, 16, 0],
    [-16, -30, -16, 0],
  ] as const) {
    k.box(f, Math.max(0.4, Math.abs(x1 - x0) + 0.4), 0.5, Math.max(0.4, Math.abs(z1 - z0) + 0.4), (x0 + x1) / 2, 0, (z0 + z1) / 2, "#d6cfc0", "polish");
    glassRail(k, f, x0, z0, x1, z1, 0.5, 1.1);
    k.box(f, Math.max(0.06, Math.abs(x1 - x0)), 0.04, Math.max(0.06, Math.abs(z1 - z0)), (x0 + x1) / 2, 0.5, (z0 + z1) / 2, GOLD, "glow");
  }
  // the lift house
  k.box(f, 3.6, 3.8, 9, -14.2, 0, -15, "#cfc8ba", "polish");
  k.box(f, 3.8, 0.3, 9.2, -14.2, 3.8, -15, GOLD, "metal");
  k.solid(f, -16, -19.5, -12.4, -10.5);
  k.lifts(f, -12.38, -15, Math.PI / 2);
  // the gold crown and its mast, the beacon on top
  const cx = 7,
    cz = -21;
  for (const [s, y, h] of [
    [7, 0, 0.8],
    [5.4, 0.8, 1.6],
    [3.8, 2.4, 1.6],
    [2.2, 4.0, 1.6],
  ] as const) {
    k.box(f, s, h, s, cx, y, cz, y === 0 ? "#3a3a40" : GOLD, y === 0 ? "matte" : "metal");
    if (y > 0) for (const d of [-1, 1]) {
      k.box(f, s + 0.02, 0.06, 0.02, cx, y + h - 0.2, cz + d * (s / 2 + 0.01), "#fff0c0", "glow");
      k.box(f, 0.02, 0.06, s + 0.02, cx + d * (s / 2 + 0.01), y + h - 0.2, cz, "#fff0c0", "glow");
    }
  }
  k.cyl(f, 0.3, 0.12, 16, cx, 5.6, cz, "#d0d4dc", "metal", 12);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff3030").multiplyScalar(2.5), toneMapped: false }));
  k.add(f, beacon, cx, 21.8, cz, 0);
  k.ticks[f].push((_, t) => (beacon.visible = Math.sin(t * 3) > -0.3));
  k.solid(f, cx - 3.6, cz - 3.6, cx + 3.6, cz + 3.6);
  k.hit(f, 7, 5.6, 7, cx, 0, cz, "<b>The crown</b><span>ZEC Reserve</span>", () => ({ eyebrow: "Observation terrace", title: "ZEC RESERVE", stats: [["Floors", "22"], ["Terrace", "78 m"], ["Spire", "97 m"]] }));
  // telescopes along the south and east edges
  const scopes: [number, number, number][] = [
    [-8, -0.9, 0],
    [0, -0.9, 0],
    [8, -0.9, 0],
    [15.1, -8, -Math.PI / 2],
    [15.1, -16, -Math.PI / 2],
    [-6, -29.1, Math.PI],
  ];
  for (const [x, z, ry] of scopes) {
    k.cyl(f, 0.18, 0.22, 0.1, x, 0, z, "#2a2a30", "metal", 12);
    k.cyl(f, 0.05, 0.05, 1.1, x, 0.1, z, "#2a2a30", "metal", 8);
    k.box(f, 0.5, 0.32, 0.3, x, 1.2, z, "#3a6a4a", "metal", ry);
    const dx = Math.sin(ry) * 0.3,
      dz = Math.cos(ry) * 0.3;
    for (const s of [-0.12, 0.12]) k.cyl(f, 0.08, 0.1, 0.3, x + dx + Math.cos(ry) * s, 1.25, z + dz - Math.sin(ry) * s, "#1a1a1e", "metal", 10);
    k.solid(f, x - 0.3, z - 0.3, x + 0.3, z + 0.3);
    k.hit(f, 0.6, 1.5, 0.6, x, 0, z, "<b>Telescope</b><span>ZStreet below</span>", () => ({ eyebrow: "Observation terrace", title: "Telescope", stats: [["Height", "78 m"], ["Block", num(k.height)], ["ZEC", usd(Market.state.price?.usd ?? 0)]] }));
  }
  // the sky bar, tables under umbrellas, planters
  k.box(f, 5, 1.1, 1.0, -4, 0, -26.5, "#2a1a10", "polish");
  k.box(f, 5.2, 0.08, 1.2, -4, 1.1, -26.5, "#e8e2d0", "polish");
  k.box(f, 5, 0.05, 0.05, -4, 0.3, -25.98, GOLD, "glow");
  k.box(f, 5, 2.0, 0.4, -4, 0, -29.3, "#2a1a10", "polish");
  for (let i = 0; i < 12; i++) k.box(f, 0.08, 0.28, 0.08, -6.2 + i * 0.4, 2.0, -29.2, ["#3a8a4a", "#c03a2a", "#e8c860", "#5a3a8a"][i % 4], "glass");
  k.label(f, "SKY BAR", -4, 2.8, -29.05, { h: 0.45, color: GOLD, font: `800 90px ${SERIF}` });
  k.solid(f, -6.6, -29.6, -1.4, -26);
  for (const [x, z, col] of [
    [-6, -8, "#14382a"],
    [0, -12, "#f4b728"],
    [-6, -18, "#14382a"],
    [2, -5, "#f4b728"],
  ] as const) {
    k.vox(f, `rsvUmb${col}`, () => umbrella(col), x, z, 0, { solid: false });
    k.vox(f, "rsvBistro", () => bistroTable(), x, z, 0);
  }
  for (const [x, z] of [
    [12, -2],
    [-1.5, -2],
    [13, -28],
    [-10, -2],
  ]) {
    k.box(f, 1.6, 0.6, 1.0, x, 0, z, "#8a8478", "polish");
    for (let i = 0; i < 5; i++) k.geo(f, new THREE.IcosahedronGeometry(0.32 + k.rnd(i, x) * 0.12, 0).translate(x - 0.55 + i * 0.28, 0.85, z), i % 2 ? "#3d7a3a" : "#2f6b34");
    k.solid(f, x - 0.8, z - 0.5, x + 0.8, z + 0.5);
  }
  k.light(f, -4, 3, -26, "#ffd9a0", 10, 12);
  k.light(f, 0, 4, -10, "#fff0dc", 6, 20);

  k.onCast(f, () => {
    k.person(f, 7301, [-4, -27.6], "Bartender", { face: [0, 1], lines: ["Reserve Sour? Gold leaf on top.", "On the house when the bell rings.", () => `Block ${num(k.height)}. Cheers.`] });
    k.dialog(f, [k.person(f, 7302, [0, -2.0], "Tourist", { face: [0, 1] }), k.person(f, 7303, [1.2, -2.2], "Tourist", { face: [0, 1] })], [
      [0, "You can see the whole city."],
      [1, "Look, the mempool shop."],
      [0, "And the buses. Every block."],
      [1, "Seventy-eight metres up. Worth it."],
    ]);
    k.dialog(f, [k.person(f, 7304, [14.4, -12], "Couple", { face: [1, 0] }), k.person(f, 7305, [14.4, -13.2], "Couple", { face: [1, 0] })], [
      [0, "The beacon blinks over us."],
      [1, "Like a block every second."],
      [0, "Seventy-five, actually."],
    ]);
    k.person(f, 7306, [-6, -9], "Guest", { face: [0, 1], sit: true, lines: ["Best seat in ZStreet.", () => `${usd(Market.state.price?.usd ?? 0)} a coin. Cheers to that.`] });
    k.person(f, 7307, [-8, -1.6], "Photographer", { face: [0, 1], lines: ["Golden hour. Every hour, here.", "Hold still, the bus is coming."] });
    k.person(f, 7308, [9, -9], "Guard", { face: [0, 1], wander: [[9, -9], [12, -24], [-2, -18], [4, -4]], lines: ["Stay behind the glass, please."] });
  });
}

