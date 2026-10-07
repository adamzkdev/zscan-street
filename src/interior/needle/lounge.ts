import * as THREE from "three";
import { fitText } from "../../scene/fit";
import { hash } from "../../scene/voxel/model";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import { GOLD, LEVELS, MONO, NeedleKit, makeCanvas } from "./kit";
import * as P from "./props";

/** Herringbone walnut for the restaurant floor. */
function parquet() {
  const { t } = makeCanvas(256, 256, (g) => {
    for (let i = 0; i < 16; i++)
      for (let j = 0; j < 8; j++) {
        g.fillStyle = ["#4a2e1c", "#53341f", "#432a1a", "#5a3a22"][Math.floor(hash(i, j, 3) * 4)];
        const x = i * 16,
          y = j * 32 + (i % 2) * 16;
        g.fillRect(x, y, 16, 32);
        g.fillRect(x, y - 256, 16, 32);
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(x, y, 1, 32);
        g.fillRect(x, y, 16, 1);
      }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  return t;
}

const MENU = [
  ["Orchard lobster", "saffron, pearl barley", "0.062"],
  ["Sapling greens", "garden of the 33rd", "0.018"],
  ["Halo 2 wagyu", "no trusted setup", "0.094"],
  ["Blossom tart", "75-second soufflé", "0.021"],
  ["Shielded Sour", "the signature", "0.012"],
];

/** 33 — the SKY LOUNGE, 120 m: a restaurant round the glass, the bar round the core, a pianist. */
export function lounge(k: NeedleKit) {
  const f = 3,
    g = k.groups[f],
    y = LEVELS[f].y,
    h = LEVELS[f].h;
  const R = 10.5,
    c = 3.2;
  k.roundShell(f, R, new THREE.MeshStandardMaterial({ map: parquet(), roughness: 0.35, metalness: 0.05 }), std("#100e14", 0.9), { segs: 36 });
  k.core(f, c, new THREE.MeshStandardMaterial({ color: "#3a2618", roughness: 0.4, metalness: 0.15 }));
  // a ring of carpet under the tables, the gold cove, pendants over each table
  const carpet = new THREE.Mesh(new THREE.RingGeometry(6.6, R - 0.3, 96), std("#3a1420", 0.95));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.y = y + 0.008;
  g.add(carpet);
  const edge = new THREE.Mesh(new THREE.RingGeometry(6.55, 6.65, 96), std("#c9a227", 0.3, 0.8));
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = y + 0.01;
  g.add(edge);
  const cove = new THREE.Mesh(new THREE.TorusGeometry(R - 0.5, 0.05, 6, 100), glowMat("#ff9f50", 1.4));
  cove.rotation.x = Math.PI / 2;
  cove.position.y = y + h - 0.05;
  g.add(cove);
  // tables round the glass (the walk from the lift stays clear), two velvet chairs each
  const colors = ["#5a1a2a", "#1a3a3a", "#5a1a2a", "#2a2050"];
  let n = 0;
  for (let a = 0.42; a < Math.PI * 2 - 0.42; a += 0.52) {
    const r = 8.6;
    const x = r * Math.sin(a),
      z = r * Math.cos(a);
    const four = n % 3 === 1;
    k.put(f, four ? "nTable4" : "nTable2", () => P.clothTable(four), x, z, a + Math.PI / 2);
    // chairs on either side, along the circle
    const tx = Math.cos(a),
      tz = -Math.sin(a);
    const off = four ? 0.85 : 0.65;
    k.put(f, `nChair${n % 4}`, () => P.velvetChair(colors[n % 4]), x + tx * off, z + tz * off, a - Math.PI / 2, { solid: false });
    k.put(f, `nChair${n % 4}`, () => P.velvetChair(colors[n % 4]), x - tx * off, z - tz * off, a + Math.PI / 2, { solid: false });
    F.place(g, "nPendant", () => F.pendant(1.6, "#ffcf80"), x, y + h - 1.6, z, 0);
    if (n % 2 === 0) void k.person(f, 1500 + n, [x + tx * off, z + tz * off], "Diner", { sit: true, dy: 0.42, face: new THREE.Vector3(-tx, 0, -tz), phone: n % 4 === 0 });
    if (n % 3 === 0) void k.person(f, 1600 + n, [x - tx * off, z - tz * off], "Diner", { sit: true, dy: 0.42, face: new THREE.Vector3(tx, 0, tz) });
    n++;
  }
  // the bar round the north of the core: a curved counter of short straight runs, stools
  const BR = c * Math.SQRT2 + 1.9;
  for (let i = 0; i < 7; i++) {
    const a = Math.PI - 1.05 + (i * 2.1) / 6;
    const x = BR * Math.sin(a),
      z = BR * Math.cos(a);
    k.put(f, "nBarRun", () => F.barCounter(1.4, "#f4b728"), x, z, a);
    const sr = BR + 0.75;
    k.put(f, "nStool", () => F.stool("#c9a227"), sr * Math.sin(a), sr * Math.cos(a), a, { solid: false });
  }
  k.put(f, "nBackBar", () => F.backBar(5), 0, -c - 0.2, Math.PI);
  k.label(f, "SKY LOUNGE", 0, 3.5, -c - 0.06, { h: 0.5, color: GOLD, rot: Math.PI });
  void k.person(f, 4545, [0, -c - 0.9], "Bartender", { face: new THREE.Vector3(0, 0, -1) });
  void k.person(f, 4546, [(BR + 0.75) * Math.sin(Math.PI - 0.35), (BR + 0.75) * Math.cos(Math.PI - 0.35)], "Guest", { sit: true, dy: 0.62, face: new THREE.Vector3(0, 0, 1) });
  void k.person(f, 4547, [(BR + 0.75) * Math.sin(Math.PI + 0.7), (BR + 0.75) * Math.cos(Math.PI + 0.7)], "Guest", { sit: true, dy: 0.62, face: new THREE.Vector3(0.6, 0, 1), phone: true });
  const drinks = ["a Shielded Sour", "a Halo 2 martini", "an Orchard Spritz", "a Blossom 75", "a Nullifier, neat"];
  let served = 0;
  k.hit(f, 4.6, 1.2, 2, 0, -BR, 0, "<b>The bar</b><span>order a drink</span>", () => ({ eyebrow: "Sky Lounge · bar", title: `${drinks[served++ % drinks.length]} 🍸`, stats: [["Price", k.price ? `${(28 / k.price.usd).toFixed(4)} ZEC` : "…"], ["Altitude", "120 m"]] }));
  // wine walls on the side faces of the core
  for (const sx of [-1, 1]) {
    k.put(f, "nWine", () => F.backBar(4.4), sx * (c + 0.2), 0, (sx * Math.PI) / 2);
    box(g, 0.05, 0.06, 4.6, glowMat("#ffcf80", 1.6), sx * (c + 0.3), y + 2.4, 0);
  }
  // the maître d' by the lift, the menu on a stand
  k.put(f, "kiosk", F.kiosk, 2.4, c + 1.6, -0.5);
  void k.person(f, 4548, [2.0, c + 2.2], "Waiter", { face: new THREE.Vector3(-0.6, 0, 1) });
  const menu = k.screen(f, 0.62, 0.42, (gc, W, H) => {
    gc.fillStyle = "#14100c";
    gc.fillRect(0, 0, W, H);
    gc.fillStyle = GOLD;
    gc.font = `800 40px ${MONO}`;
    gc.fillText("SKY LOUNGE", 24, 54);
    gc.font = `600 22px ${MONO}`;
    MENU.slice(0, 4).forEach(([a, , p], i) => {
      gc.fillStyle = "#e9d8b0";
      fitText(gc, a, 24, 104 + i * 40, W * 0.6);
      gc.fillStyle = "#c9a227";
      gc.textAlign = "right";
      gc.fillText(`${p} ⓩ`, W - 24, 104 + i * 40);
      gc.textAlign = "left";
    });
    void H;
  }, 999);
  menu.position.set(2.4 + Math.sin(-0.5) * 0.12, y + 1.25, c + 1.6 + Math.cos(-0.5) * 0.12);
  menu.rotation.set(-0.5, -0.5, 0, "YXZ");
  k.hit(f, 0.8, 1.6, 0.6, 2.4, c + 1.6, 0, "<b>Menu</b><span>Sky Lounge</span>", () => ({
    eyebrow: "Sky Lounge · menu",
    title: "Tonight",
    body: `<table>${MENU.map(([a, b, p]) => `<tr><td><b>${a}</b><br><small>${b}</small></td><td style="text-align:right">${p} ZEC</td></tr>`).join("")}</table>`,
  }));
  // waiters doing the rounds
  const ring: [number, number][] = [];
  for (let a = 0; a < Math.PI * 2; a += 0.6) ring.push([6.9 * Math.sin(a), 6.9 * Math.cos(a)]);
  void k.person(f, 4549, ring[2], "Waiter", { wander: ring });
  void k.person(f, 4550, ring[7], "Waiter", { wander: ring });
  // the piano on the east, the pianist
  const pa = 1.62;
  k.put(f, "piano", F.grandPiano, 6.4 * Math.sin(pa), 6.4 * Math.cos(pa), pa + Math.PI);
  void k.person(f, 4551, [5.2 * Math.sin(pa), 5.2 * Math.cos(pa) + 0.1], "Pianist", { sit: true, dy: 0.5, face: new THREE.Vector3(1, 0, 0) });
  // champagne trolley, palms
  k.put(f, "nCart", P.champagneCart, -4.6, 4.6, 0.8);
  for (const a of [0.9, -0.9]) k.put(f, `nPalmL${a}`, () => P.palmTree(a > 0 ? 4 : 5), 5.2 * Math.sin(Math.PI + a), 5.2 * Math.cos(Math.PI + a));
  k.light(f, 0, -5.2, "#ffb870", 9, -0.6, 12);
  k.light(f, 6, 4, "#ffc890", 7, -0.8, 14);
  k.light(f, -6, 4, "#ffc890", 7, -0.8, 14);
  k.light(f, 0, 7.5, "#ffc890", 6, -0.8, 12);
}
