import * as THREE from "three";
import { Market } from "../../data/market";
import { ZScan } from "../../data/zscan";
import { plant } from "../furniture";
import { F, GOLD, MONO, paint, rr, type PalmKit } from "./kit";
import { deckTex, lounger, palmTree, sea, stoneTex, umbrella } from "./props";

/**
 * Villa Shielded, on Frond G: through the pivot door into a double-height hall (a travertine
 * wall, the floating stair, a gold ⓩ), the living room under a linear chandelier (a deep cream
 * sectional, the cinema wall showing the chain, zkSNARK portraits), the open kitchen (a marble
 * waterfall island, bar stools, the wine wall), and through the sliding glass the terrace: an
 * infinity pool running into the lagoon, a fire pit, daybeds, palms, and the Burj Al ZEC and the
 * skyline across the water. The owner, a zkSNARK, shows you round.
 */

const f = F.villa;
/** The house: x −12…14, z −12 (the glass wall) … 11 (the front door). */
const X0 = -12,
  X1 = 14,
  ZG = -12,
  ZF = 11,
  H = 6.6;

export function villa(k: PalmKit) {
  const g = k.groups[f];
  k.sun(f, ["#fff1d8", 2.2, [50, 70, -60]], ["#8aa8e0", 0.3, [-40, 60, -30]]);

  // ---- floors -----------------------------------------------------------------------------------
  const marble = paint(1024, 1024, (c, W) => {
    const t = W / 2;
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        c.fillStyle = (i + j) % 2 ? "#f1ede6" : "#ece7de";
        c.fillRect(i * t, j * t, t, t);
      }
    c.globalAlpha = 0.18;
    for (let n = 0; n < 50; n++) {
      c.strokeStyle = n % 3 ? "#b8b0a4" : "#c8a870";
      c.lineWidth = 0.6 + k.rnd(n, 3) * 2;
      c.beginPath();
      let x = k.rnd(n, 1) * W,
        y = k.rnd(n, 2) * W;
      c.moveTo(x, y);
      for (let s = 0; s < 7; s++) {
        x += (k.rnd(n, s + 4) - 0.3) * 140;
        y += (k.rnd(n, s + 11) - 0.5) * 60;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
    c.strokeStyle = "rgba(150,140,120,0.3)";
    c.lineWidth = 1.5;
    c.strokeRect(0, 0, t, t);
    c.strokeRect(t, t, t, t);
  });
  marble.wrapS = marble.wrapT = THREE.RepeatWrapping;
  marble.repeat.set((X1 - X0) / 2.4, (ZF - ZG) / 2.4);
  k.flat(f, X1 - X0, ZF - ZG, new THREE.MeshStandardMaterial({ map: marble, roughness: 0.12, metalness: 0.05, envMapIntensity: 1.2 }), (X0 + X1) / 2, (ZF + ZG) / 2, 0.002);
  // the ceiling, white with a recessed cove of light
  k.box(f, X1 - X0, 0.3, ZF - ZG, (X0 + X1) / 2, H, (ZF + ZG) / 2, "#f6f4ef");
  k.box(f, X1 - X0 - 4, 0.04, 0.08, (X0 + X1) / 2, H - 0.05, ZG + 1.2, "#ffe6c0", "glow");

  // a ceiling of teak slats over the living room and the kitchen, LED coves round it
  for (let x = X0 + 0.3; x < X1 - 0.2; x += 0.22) k.box(f, 0.1, 0.12, ZF - ZG - 8.6, x, H - 0.13, (ZG + 4) / 2, "#9a6a40");
  k.box(f, X1 - X0, 0.06, ZF - ZG - 8.6, (X0 + X1) / 2, H - 0.02, (ZG + 4) / 2, "#3a2a1c");
  for (const z of [ZG + 0.3, 3.7]) k.box(f, X1 - X0 - 0.6, 0.03, 0.05, (X0 + X1) / 2, H - 0.2, z, "#ffd9a0", "glow");

  // ---- walls ------------------------------------------------------------------------------------
  const WHITE = "#f6f3ec";
  k.wall(f, X0, ZF, -1.1, ZF, H, WHITE, "matte", 0.4);
  k.wall(f, 1.1, ZF, X1, ZF, H, WHITE, "matte", 0.4);
  k.box(f, 2.2, H - 3.2, 0.4, 0, 3.2, ZF, WHITE);
  // the pivot door (shut behind you: the way out), oak with a long brass pull
  k.box(f, 2.0, 3.2, 0.12, 0, 0, ZF - 0.12, "#7a5434");
  k.box(f, 0.05, 1.8, 0.05, 0.7, 0.7, ZF - 0.2, GOLD, "metal");
  k.solid(f, -1.2, ZF - 0.2, 1.2, ZF + 0.2);
  k.wall(f, X0, ZG, X0, ZF, H, WHITE, "matte", 0.4);
  k.wall(f, X1, ZG, X1, ZF, H, WHITE, "matte", 0.4);
  // the travertine feature wall of the hall (left), the stair floating off it
  k.plane(f, 12, H, new THREE.MeshStandardMaterial({ map: (() => { const t = stoneTex().clone(); t.repeat.set(3, 1.6); t.needsUpdate = true; return t; })(), roughness: 0.7 }), X0 + 0.21, H / 2, 5, 0, Math.PI / 2);
  for (let i = 0; i < 16; i++) {
    const y = 0.2 + i * 0.36,
      z = 9.4 - i * 0.62;
    k.box(f, 1.3, 0.1, 0.55, X0 + 0.85, y, z, "#e8dcc6", "polish");
  }
  k.solid(f, X0, -1, X0 + 1.6, 10);
  // the landing up there and its glass rail
  k.box(f, 4, 0.25, 6, X0 + 2, 5.9, -3.2, "#f4f0e8");
  k.box(f, 0.04, 1.0, 6, X0 + 4, 6.15, -3.2, "#cfe8f0", "glass");
  // the partial wall between hall and kitchen, the TV wall in the living room
  k.wall(f, 6, 4, X1, 4, H, WHITE, "matte", 0.3);
  // the glass wall onto the terrace: two fixed panes either side, the middle slid open
  for (const [a, b] of [
    [X0, -6],
    [8, X1],
  ]) {
    k.box(f, b - a, H - 0.2, 0.06, (a + b) / 2, 0, ZG, "#cfe8f0", "glass");
    k.solid(f, a, ZG - 0.1, b, ZG + 0.1);
  }
  for (let x = X0; x <= X1; x += 2) k.box(f, 0.06, H, 0.12, x, 0, ZG, "#2a2a2e", "metal");
  k.box(f, X1 - X0, 0.1, 0.16, (X0 + X1) / 2, 0.0, ZG, "#2a2a2e", "metal");
  // sheer curtains gathered at the ends of the glass
  for (const x0 of [X0 + 0.3, X1 - 1.5])
    for (let i = 0; i < 9; i++) k.box(f, 0.14, H - 0.4, 0.05, x0 + i * 0.14, 0.05, ZG + 0.35 + (i % 2) * 0.06, i % 2 ? "#f2eee6" : "#e8e2d6");
  // the doors, slid over the fixed panes
  k.box(f, 7, H - 0.3, 0.05, -2.4, 0, ZG + 0.12, "#cfe8f0", "glass");

  // ---- the hall: console, sculpture, art ----------------------------------------------------------
  k.box(f, 0.5, 0.85, 2.6, X1 - 0.35, 0, 7.4, "#1c1a1e", "polish");
  k.box(f, 0.52, 0.05, 2.62, X1 - 0.35, 0.85, 7.4, GOLD, "metal");
  k.solid(f, X1 - 0.65, 6, X1, 8.8);
  // the gold ⓩ on a plinth
  k.box(f, 0.9, 1.0, 0.9, 4.2, 0, 7.2, "#f4f0e8", "polish");
  const zMat = new THREE.MeshStandardMaterial({ color: "#f4b728", metalness: 0.95, roughness: 0.18, envMapIntensity: 1.8 });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 12, 40), zMat);
  const zg = new THREE.Group();
  zg.add(torus);
  for (const [w, h, x, y, rz] of [
    [0.42, 0.08, 0, 0.2, 0],
    [0.42, 0.08, 0, -0.2, 0],
    [0.5, 0.08, 0, 0, 0.95],
  ] as const) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), zMat);
    b.position.set(x, y, 0);
    b.rotation.z = rz;
    zg.add(b);
  }
  zg.position.set(4.2, k.y(f) + 1.6, 7.2);
  zg.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
  g.add(zg);
  k.ticks[f].push((_dt, t) => (zg.rotation.y = t * 0.4));
  k.solid(f, 3.7, 6.7, 4.7, 7.7);
  k.hit(f, 1, 2.2, 1, 4.2, 0, 7.2, `<b>The gold ⓩ</b><span>solid, shielded</span>`, () => ({ eyebrow: "Villa Shielded · hall", title: "ⓩ in 24 carat", stats: [["Weight", "21 kg"], ["Insured", "privately"], ["ZEC", k.price ? `$${k.price.toFixed(2)}` : "…"], ["Block", k.height ? k.height.toLocaleString("en-US") : "…"]] }));
  // the smart-home panel by the door
  const panel = k.screen(f, 0.5, 0.75, (c, W, Hh) => {
    c.fillStyle = "#0e1418";
    c.fillRect(0, 0, W, Hh);
    c.fillStyle = GOLD;
    c.font = `700 ${W * 0.09}px ${MONO}`;
    c.fillText("VILLA SHIELDED", W * 0.08, Hh * 0.1);
    const rows: [string, string][] = [
      ["Inside", "23°C"],
      ["Pool", "29°C"],
      ["Lagoon", "28°C"],
      ["Block", k.height ? k.height.toLocaleString("en-US") : "…"],
      ["Mempool", `${k.ctx.director.mempoolList().length} tx`],
      ["Doors", "locked"],
    ];
    rows.forEach(([a, b], i) => {
      c.font = `500 ${W * 0.07}px ${MONO}`;
      c.fillStyle = "#8aa0a8";
      c.fillText(a, W * 0.08, Hh * (0.25 + i * 0.12));
      c.fillStyle = "#e8f4f0";
      c.textAlign = "right";
      c.fillText(b, W * 0.92, Hh * (0.25 + i * 0.12));
      c.textAlign = "left";
    });
  }, 3, 256);
  panel.position.set(1.7, k.y(f) + 1.45, ZF - 0.22);
  panel.rotation.y = Math.PI;

  // ---- the living room ----------------------------------------------------------------------------
  // a deep cream sectional (an L), cushions, a travertine coffee table, a rug
  const sofaC = "#ece4d4";
  const LX = -4.5,
    LZ = -3.5;
  k.flat(f, 7.5, 5.6, new THREE.MeshStandardMaterial({ map: paint(256, 256, (c, W) => { c.fillStyle = "#cfc4b0"; c.fillRect(0, 0, W, W); c.strokeStyle = "#b8ab94"; c.lineWidth = 6; c.strokeRect(12, 12, W - 24, W - 24); for (let i = 0; i < 900; i++) { c.fillStyle = i % 2 ? "#d8cfbc" : "#c6baa4"; c.fillRect(Math.random() * W, Math.random() * W, 2, 2); } }), roughness: 1 }), LX, LZ, 0.01);
  k.box(f, 6.4, 0.42, 1.1, LX, 0.02, LZ - 2.3, sofaC);
  k.box(f, 6.4, 0.75, 0.3, LX, 0.02, LZ - 2.85, sofaC);
  k.box(f, 1.1, 0.42, 3.6, LX - 2.65, 0.02, LZ - 0.3, sofaC);
  k.box(f, 0.3, 0.75, 3.6, LX - 3.2, 0.02, LZ - 0.3, sofaC);
  for (let i = 0; i < 5; i++) k.box(f, 0.6, 0.45, 0.16, LX - 2.4 + i * 1.2, 0.44, LZ - 2.62, ["#f4b728", "#e8e0d0", "#8a7a64", "#e8e0d0", "#1e3a5a"][i], "matte", (i - 2) * 0.05);
  k.solid(f, LX - 3.4, LZ - 3.0, LX + 3.2, LZ - 1.75);
  k.solid(f, LX - 3.4, LZ - 1.8, LX - 2.1, LZ + 1.5);
  k.box(f, 2.4, 0.36, 1.3, LX, 0, LZ - 0.2, "#e8dcc6", "polish");
  k.box(f, 0.5, 0.1, 0.35, LX - 0.5, 0.36, LZ - 0.2, "#1a1a1e");
  k.cyl(f, 0.18, 0.12, 0.3, LX + 0.6, 0.36, LZ - 0.3, "#f4f0e8", "polish", 14);
  k.solid(f, LX - 1.2, LZ - 0.85, LX + 1.2, LZ + 0.45);
  // two lounge chairs facing the sofa
  for (const s of [-1, 1]) {
    const cx = LX + s * 1.6,
      cz = LZ + 1.9;
    k.box(f, 0.95, 0.4, 0.9, cx, 0.02, cz, "#b89a74");
    k.box(f, 0.95, 0.5, 0.2, cx, 0.42, cz + 0.36, "#b89a74");
    k.solid(f, cx - 0.5, cz - 0.45, cx + 0.5, cz + 0.45);
  }
  // the linear chandelier: a long brass bar of glowing rods
  k.box(f, 5.2, 0.06, 0.06, LX, H - 1.6, LZ - 0.3, GOLD, "metal");
  for (let i = 0; i < 26; i++) k.box(f, 0.03, 0.3 + k.rnd(i, 7) * 0.5, 0.03, LX - 2.5 + i * 0.2, H - 1.6 - 0.3 - k.rnd(i, 7) * 0.5, LZ - 0.3, "#ffe6b0", "glow");
  for (const s of [-1, 1]) k.box(f, 0.01, 1.6, 0.01, LX + s * 2.4, H - 1.6, LZ - 0.3, "#2a2a2e");
  // the cinema wall on the partition (x 6…14 faces −z? no: the TV hangs on the hall partition, facing the sofa)
  const tvW = 3.6,
    tvH = 2.0;
  k.box(f, 5.2, 3.2, 0.2, LX, 0, 3.8, "#2a2622", "polish");
  k.box(f, 5.2, 0.3, 0.6, LX, 0, 3.5, "#1c1a1e", "polish");
  k.solid(f, LX - 2.6, 3.2, LX + 2.6, 4.0);
  const tv = k.screen(f, tvW, tvH, (c, W, Hh) => drawTV(k, c, W, Hh), 3, 768);
  tv.position.set(LX, k.y(f) + 1.75, 3.68);
  tv.rotation.y = Math.PI;
  k.pick(f, tv, `<b>The cinema wall</b><span>the chain, live</span>`, () => {
    const p = Market.state.price;
    return { eyebrow: "Villa Shielded · living room", title: k.height ? `Block ${k.height.toLocaleString("en-US")}` : "The chain", mono: true, stats: [["ZEC", p ? `$${p.usd.toFixed(2)}` : "…"], ["24 h", p ? `${p.usd_24h_change >= 0 ? "+" : ""}${p.usd_24h_change.toFixed(1)}%` : "…"], ["Mempool", `${k.ctx.director.mempoolList().length} tx`]] };
  });
  // the hall wall behind the TV runs from the stair to the kitchen partition
  k.wall(f, X0 + 1.6, 4, LX + 2.6, 4, 3.2, WHITE, "matte", 0.3);
  // zkSNARK portraits on the west wall
  [137, 2048, 777].forEach((id, i) => {
    const z = -1 - i * 3.3;
    k.box(f, 0.08, 2.1, 2.1, X0 + 0.24, 1.8, z, "#1a1612", "polish");
    const tex = new THREE.TextureLoader().load(ZScan.zkSnarkImage(id));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const art = k.plane(f, 1.85, 1.85, new THREE.MeshBasicMaterial({ map: tex }), X0 + 0.3, 2.85, z, 0, Math.PI / 2);
    k.pick(f, art, `<b>zkSNARK #${id}</b><span>the owner's collection</span>`, () => ({ eyebrow: "Villa Shielded · art", title: `zkSNARK #${id}`, mono: true, image: ZScan.zkSnarkImage(id), stats: [["Owner", "shielded"], ["Hung", "living room"]] }));
  });
  for (const [x, z, s] of [
    [X0 + 0.9, -10.6, 1],
    [5.4, -10.8, 2],
    [-0.5, 3.0, 3],
  ] as const)
    k.vox(f, `vplant${s}`, () => plant(s === 2 ? "ficus" : "monstera", s), x, z, 0, { k: 0.7 });

  // ---- the kitchen --------------------------------------------------------------------------------
  const KX = 10;
  // the tall wall of units along the east wall, an oven tower, the wine wall
  k.box(f, 0.7, 3.0, 13, X1 - 0.35, 0, -4.5, "#3a3632", "polish");
  for (let z = -10.5; z < 1.8; z += 0.9) k.box(f, 0.02, 2.9, 0.02, X1 - 0.71, 0.05, z, "#1c1a18");
  k.box(f, 0.04, 0.04, 12, X1 - 0.74, 1.6, -4.5, GOLD, "metal");
  k.box(f, 0.05, 0.7, 0.62, X1 - 0.7, 1.0, -6.2, "#14161a", "polish");
  k.box(f, 0.05, 0.6, 0.62, X1 - 0.7, 1.85, -6.2, "#14161a", "polish");
  k.box(f, 0.02, 0.04, 0.4, X1 - 0.73, 1.75, -6.2, "#ff8a3a", "glow");
  k.solid(f, X1 - 0.75, -11, X1, 2);
  // the wine wall: glass-fronted, lit bottles
  k.box(f, 0.5, 2.8, 2.2, X1 - 0.3, 0, 0.6, "#1a1612", "polish");
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 7; c++) k.cyl(f, 0.035, 0.035, 0.28, X1 - 0.5, 0.3 + r * 0.28, -0.3 + c * 0.3, ["#5a1a24", "#2a3a1a", "#e8d8a0", "#3a0a14"][(r + c) % 4], "polish", 6);
  k.box(f, 0.02, 2.6, 2.1, X1 - 0.56, 0.1, 0.6, "#ffe0b0", "glass");
  k.box(f, 0.02, 0.02, 2.1, X1 - 0.57, 2.7, 0.6, "#ffd890", "glow");
  // the island: a marble waterfall slab, stools, a fruit bowl, the espresso machine
  k.box(f, 1.3, 0.92, 5.2, KX, 0, -4.6, "#3a3632", "polish");
  k.box(f, 1.5, 0.06, 5.4, KX, 0.92, -4.6, "#f2eee8", "polish");
  for (const s of [-1, 1]) k.box(f, 1.5, 0.98, 0.06, KX, 0, -4.6 + s * 2.7, "#f2eee8", "polish");
  k.solid(f, KX - 0.8, -7.4, KX + 0.8, -1.8);
  for (let i = 0; i < 4; i++) {
    const z = -6.4 + i * 1.2;
    k.cyl(f, 0.03, 0.03, 0.72, KX - 1.25, 0, z, "#c8ccd4", "metal", 6);
    k.cyl(f, 0.22, 0.2, 0.08, KX - 1.25, 0.72, z, "#b89a74", "matte", 14);
    k.box(f, 0.06, 0.28, 0.4, KX - 1.45, 0.8, z, "#b89a74");
  }
  k.cyl(f, 0.26, 0.18, 0.12, KX, 0.98, -3.6, "#f4f0e8", "polish", 16);
  for (let i = 0; i < 6; i++) k.geo(f, new THREE.SphereGeometry(0.07, 8, 6).translate(KX - 0.12 + (i % 3) * 0.12, 1.12 + Math.floor(i / 3) * 0.06, -3.6 + (i % 2) * 0.1 - 0.05), ["#f08a2a", "#e8d040", "#d83a2a", "#7ac040", "#f0a030", "#e8c040"][i]);
  k.box(f, 0.4, 0.42, 0.34, KX + 0.3, 0.98, -6.4, "#c8ccd4", "metal");
  k.box(f, 0.3, 0.06, 0.3, KX + 0.3, 1.4, -6.4, "#1a1a1e");
  // three glass pendants over the island
  for (let i = 0; i < 3; i++) {
    const z = -6.4 + i * 1.8;
    k.box(f, 0.01, 2.6, 0.01, KX, H - 2.6, z, "#2a2a2e");
    k.geo(f, new THREE.SphereGeometry(0.22, 14, 10).translate(KX, H - 2.75, z), "#e8d8c0", "glass");
    k.geo(f, new THREE.SphereGeometry(0.08, 8, 6).translate(KX, H - 2.75, z), "#ffe6b0", "glow");
  }
  k.hit(f, 1.5, 1.2, 5.4, KX, 0, -4.6, `<b>The kitchen island</b><span>Calacatta marble</span>`, () => ({ eyebrow: "Villa Shielded · kitchen", title: "The island", stats: [["Marble", "Calacatta"], ["Espresso", "always on"], ["Chef", "on call"], ["Fruit", "fresh daily"]] }));
  // the dining table under the gallery
  {
    const dx = 2.6,
      dz = -7.4;
    k.box(f, 1.2, 0.06, 3.2, dx, 0.74, dz, "#5a3e28", "polish");
    k.box(f, 0.2, 0.74, 0.2, dx, 0, dz - 1.2, "#2a2a2e", "metal");
    k.box(f, 0.2, 0.74, 0.2, dx, 0, dz + 1.2, "#2a2a2e", "metal");
    for (let i = 0; i < 3; i++)
      for (const s of [-1, 1]) {
        const z = dz - 1 + i * 1;
        k.box(f, 0.45, 0.45, 0.45, dx + s * 0.85, 0, z, "#e8e0d0");
        k.box(f, 0.08, 0.5, 0.45, dx + s * 1.08, 0.45, z, "#e8e0d0");
      }
    k.solid(f, dx - 1.2, dz - 1.7, dx + 1.2, dz + 1.7);
    k.cyl(f, 0.1, 0.08, 0.3, dx, 0.8, dz, "#f4b728", "metal", 10);
  }

  terrace(k);
  cast(k);

  k.light(f, LX, H - 1.2, LZ, "#ffe2b8", 16, 16);
  k.light(f, KX - 1, H - 1.2, -4, "#ffe8c8", 12, 14);
  k.light(f, 0, H - 1, 7, "#ffe2b8", 10, 12);
  k.light(f, 0, 3, -22, "#9fe8ff", 6, 16);
}

function drawTV(k: PalmKit, c: CanvasRenderingContext2D, W: number, H: number) {
  c.fillStyle = "#06080c";
  c.fillRect(0, 0, W, H);
  const p = Market.state.price;
  c.fillStyle = GOLD;
  c.font = `700 ${H * 0.08}px ${MONO}`;
  c.fillText("ZEC", W * 0.05, H * 0.14);
  c.fillStyle = "#f4f0e8";
  c.font = `700 ${H * 0.14}px ${MONO}`;
  c.fillText(p ? `$${p.usd.toFixed(2)}` : "…", W * 0.05, H * 0.32);
  if (p) {
    c.fillStyle = p.usd_24h_change >= 0 ? "#5cff9a" : "#ff6a5a";
    c.font = `600 ${H * 0.07}px ${MONO}`;
    c.fillText(`${p.usd_24h_change >= 0 ? "▲" : "▼"} ${Math.abs(p.usd_24h_change).toFixed(1)}% 24h`, W * 0.05, H * 0.43);
    const hist = p.history.map((h) => h[1]);
    if (hist.length > 1) {
      const lo = Math.min(...hist),
        hi = Math.max(...hist);
      c.strokeStyle = GOLD;
      c.lineWidth = 4;
      c.beginPath();
      hist.forEach((v, i) => {
        const x = W * 0.05 + (i / (hist.length - 1)) * W * 0.55,
          y = H * 0.9 - ((v - lo) / Math.max(1e-6, hi - lo)) * H * 0.38;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      });
      c.stroke();
    }
  }
  c.fillStyle = "#12161c";
  rr(c, W * 0.66, H * 0.08, W * 0.3, H * 0.84, 12);
  c.fill();
  c.fillStyle = "#8aa0a8";
  c.font = `600 ${H * 0.055}px ${MONO}`;
  c.fillText("BLOCK", W * 0.69, H * 0.2);
  c.fillStyle = "#7dffb0";
  c.font = `700 ${H * 0.075}px ${MONO}`;
  c.fillText(k.height ? k.height.toLocaleString("en-US") : "…", W * 0.69, H * 0.31);
  c.fillStyle = "#8aa0a8";
  c.font = `600 ${H * 0.055}px ${MONO}`;
  c.fillText("MEMPOOL", W * 0.69, H * 0.47);
  c.fillStyle = "#ffb35a";
  c.font = `700 ${H * 0.075}px ${MONO}`;
  c.fillText(`${k.ctx.director.mempoolList().length} tx`, W * 0.69, H * 0.58);
  const pools = Market.state.pools;
  c.fillStyle = "#8aa0a8";
  c.font = `600 ${H * 0.055}px ${MONO}`;
  c.fillText("SHIELDED", W * 0.69, H * 0.74);
  c.fillStyle = GOLD;
  c.font = `700 ${H * 0.075}px ${MONO}`;
  c.fillText(pools ? `${(pools.shielded_ratio * 100).toFixed(1)}%` : "…", W * 0.69, H * 0.85);
}

// ---- the terrace and the infinity pool -------------------------------------------------------------

function terrace(k: PalmKit) {
  const g = k.groups[f];
  const T0 = -12,
    T1 = -34;
  const deck = stoneTex().clone();
  deck.repeat.set(30 / 3, 12 / 3);
  deck.needsUpdate = true;
  const deckM = new THREE.MeshStandardMaterial({ map: deck, roughness: 0.6 });
  k.flat(f, 30, 12, deckM, 1, -18, 0.002);
  // either side of the pool, the deck runs on to the edge
  for (const [a, b] of [
    [-14, -9],
    [13, 16],
  ])
    k.flat(f, b - a, 8, deckM, (a + b) / 2, -28, 0.002);
  // the terrace's edge: a white wall dropping to the beach below
  k.box(f, 30, 3.3, 0.4, 1, -3.3, -32.2, "#ece8e0");
  // the overhang of the upper floor over the terrace, on two slim columns
  k.box(f, X1 - X0 + 1, 0.4, 4, (X0 + X1) / 2, H - 0.1, T0 - 2, "#f6f4ef");
  k.box(f, X1 - X0 + 1, 0.05, 4, (X0 + X1) / 2, H - 0.15, T0 - 2, "#b8946a");
  for (const x of [X0 + 0.5, X1 - 0.5]) {
    k.box(f, 0.2, H, 0.2, x, 0, T0 - 3.8, "#2a2a2e", "metal");
    k.solid(f, x - 0.15, T0 - 3.95, x + 0.15, T0 - 3.65);
  }
  // the infinity pool across the end: its water runs to the edge and falls into the lagoon
  const PZ0 = -24,
    PZ1 = -31,
    PX0 = -9,
    PX1 = 13;
  k.box(f, PX1 - PX0 + 0.6, 0.12, 0.4, (PX0 + PX1) / 2, 0, PZ0 + 0.2, "#f4f0e8", "polish");
  sea(k, f, { x0: PX0, z0: PZ1, x1: PX1, z1: PZ0, y: -0.06, deep: "#25b8d8", shallow: "#25b8d8", sky: "#d8f0f8", fade: 500, calm: 0.4, sunDir: [0.2, 0.3, -1], night: { deep: "#1a90c8", shallow: "#1a90c8", sky: "#40b8e0", sun: "#d0e8ff" } });
  // the pool's glow at night (an LED strip under the coping) and the overflow edge
  const poolGlow = new THREE.Mesh(new THREE.BoxGeometry(PX1 - PX0, 0.04, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color("#7fe8ff").multiplyScalar(1.8), toneMapped: false }));
  poolGlow.position.set((PX0 + PX1) / 2, k.y(f) - 0.1, PZ0 - 0.05);
  g.add(poolGlow);
  k.box(f, PX1 - PX0, 0.04, 0.12, (PX0 + PX1) / 2, -0.05, PZ1, "#9ff0ff", "glow");
  k.box(f, PX1 - PX0, 3.2, 0.3, (PX0 + PX1) / 2, -3.3, PZ1 - 0.2, "#e8e4dc");
  k.solid(f, PX0, PZ1 - 0.3, PX1, PZ0);
  // on each block the pool lights turn gold for a moment
  const pg = poolGlow.material as THREE.MeshBasicMaterial;
  let goldFor = 0;
  k.blockFns.push(() => (goldFor = 12));
  k.ticks[f].push((dt) => {
    goldFor = Math.max(0, goldFor - dt);
    pg.color.set(goldFor > 0 ? "#f4b728" : "#7fe8ff").multiplyScalar(1.8);
  });
  k.hit(f, PX1 - PX0, 0.3, PZ0 - PZ1, (PX0 + PX1) / 2, -0.2, (PZ0 + PZ1) / 2, `<b>The infinity pool</b><span>into the lagoon</span>`, () => {
    const p = Market.state.pools;
    return { eyebrow: "Villa Shielded · terrace", title: "Infinity pool", tag: ["Turns gold on every block", "ok"], stats: [["Length", "22 m"], ["Water", "29°C"], ["Shielded ZEC", p ? `${Math.round(p.shielded / 1e8).toLocaleString("en-US")}` : "…"], ["Block", k.height ? k.height.toLocaleString("en-US") : "…"]] };
  });
  // the lagoon below and beyond
  sea(k, f, { x0: -200, z0: -260, x1: 200, z1: -31.6, y: -3.2, fade: 210, sunDir: [0.3, 0.35, -1] });
  // the beach strip down there either side of the pool wall
  k.box(f, 60, 0.4, 7, 1, -3.55, PZ1 - 4.6, "#e8d6ae");
  // glass balustrade on the open sides of the terrace
  for (const x of [-14, 16]) {
    k.box(f, 0.04, 1.05, T0 - T1, x, 0, (T0 + T1) / 2, "#cfe8f0", "glass");
    k.box(f, 0.06, 0.05, T0 - T1, x, 1.05, (T0 + T1) / 2, "#c8ccd4", "metal");
    k.solid(f, x - 0.1, T1, x + 0.1, T0);
  }
  // the balustrade turns in to meet the house (the terrace is wider than the house: you walked off its corners)
  for (const [a, b] of [[-14, X0], [X1, 16]]) {
    k.box(f, b - a, 1.05, 0.04, (a + b) / 2, 0, T0, "#cfe8f0", "glass");
    k.box(f, b - a, 0.05, 0.06, (a + b) / 2, 1.05, T0, "#c8ccd4", "metal");
    k.solid(f, a, T0 - 0.1, b, T0 + 0.1);
  }
  k.solid(f, -14, PZ1 - 0.4, 16, PZ1 - 0.2);
  // the daybeds and loungers along the pool, a cabana-style umbrella
  for (let i = 0; i < 5; i++) lounger(k, f, -7 + i * 2.4, -21.6, 0, "#f6f2ea", i === 2 ? "#f4b728" : null);
  for (let i = 0; i < 5; i++) k.solid(f, -7.4 + i * 2.4, -22.6, -6.6 + i * 2.4, -20.6);
  umbrella(k, f, 6, -21.4, "#e8e2d4", "#f6f2ea", 1.8, 2.6);
  // the sunken lounge round the fire pit
  {
    const fx = -6,
      fz = -16.6;
    k.cyl(f, 0.7, 0.7, 0.4, fx, 0, fz, "#3a3632", "polish", 24);
    k.cyl(f, 0.5, 0.5, 0.02, fx, 0.4, fz, "#1a1a1e", "matte", 20);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      k.box(f, 0.18, 0.4, 0.06, fx + Math.cos(a) * 0.2, 0.42, fz + Math.sin(a) * 0.2, "#7a5a3a", "matte", a);
    }
    const flames: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? "#ff8a2a" : "#ffc04a").multiplyScalar(2), toneMapped: false, transparent: true, opacity: 0.85 }));
      fl.position.set(fx + Math.cos(i * 1.3) * 0.18, k.y(f) + 0.7, fz + Math.sin(i * 1.3) * 0.18);
      fl.raycast = () => {};
      g.add(fl);
      flames.push(fl);
    }
    k.ticks[f].push((_dt, t) => flames.forEach((fl, i) => (fl.scale.y = 0.7 + Math.abs(Math.sin(t * 7 + i * 1.7)) * 0.6 + Math.sin(t * 13 + i) * 0.1)));
    k.solid(f, fx - 0.75, fz - 0.75, fx + 0.75, fz + 0.75);
    // the low curved sofa round it
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.15 + (i / 8) * Math.PI * 0.95;
      const x = fx + Math.cos(a) * 2.1,
        z = fz + Math.sin(a) * 2.1 * -1;
      k.box(f, 0.75, 0.38, 0.8, x, 0, z, "#e8e0d0", "matte", -a + Math.PI / 2);
      k.box(f, 0.75, 0.42, 0.22, x + Math.cos(a) * 0.4, 0.38, z - Math.sin(a) * 0.4, "#e8e0d0", "matte", -a + Math.PI / 2);
      k.solid(f, x - 0.35, z - 0.35, x + 0.35, z + 0.35);
    }
  }
  // palms in planters at the corners, the outdoor kitchen (a teak bar) on the right
  for (const [x, z, s] of [
    [-12.6, -14, 1],
    [-12.6, -29, 2],
    [14.6, -14.5, 3],
    [14.6, -29, 4],
  ] as const) {
    k.box(f, 1.6, 0.7, 1.6, x, 0, z, "#e8e4dc", "polish");
    palmTree(k, f, x, z, 6.5, s * 13, { dy: 0.7, lean: 1.2, dir: x < 0 ? Math.PI : 0 });
    k.solid(f, x - 0.8, z - 0.8, x + 0.8, z + 0.8);
  }
  {
    const bx = 11.5,
      bz = -17;
    const teak = deckTex().clone();
    teak.repeat.set(1, 0.5);
    teak.needsUpdate = true;
    k.box(f, 1.0, 0.95, 4.4, bx, 0, bz, "#8a6440");
    k.box(f, 1.1, 0.06, 4.6, bx, 0.95, bz, "#2a2a2e", "polish");
    k.box(f, 0.55, 0.12, 0.6, bx, 1.01, bz - 1.2, "#c8ccd4", "metal");
    for (let i = 0; i < 4; i++) k.cyl(f, 0.035, 0.035, 0.3, bx - 0.2 + (i % 2) * 0.12, 1.01, bz + 0.8 + (i >> 1) * 0.12, ["#e8c070", "#c8d8e0", "#ff7a4a", "#3a8a4a"][i], "glass", 6);
    k.solid(f, bx - 0.6, bz - 2.3, bx + 0.6, bz + 2.3);
    void teak;
  }
  // the view: Burj Al ZEC and the skyline across the lagoon (the panorama), a label on the glass
  k.label(f, "VILLA SHIELDED · FROND G", 1, 5.75, -12.08, { h: 0.2, color: GOLD, ry: Math.PI });
}

// ---- the owner and friends -------------------------------------------------------------------------

function cast(k: PalmKit) {
  k.onCast(f, () => {
    void k.person(f, 1337, [2.6, 1.2], "Owner", {
      face: [0, 1],
      wander: [
        [2.6, 1.2],
        [-1.2, -6.5],
        [2.5, -15],
        [-2, -19.5],
      ],
      near: 8,
      every: [6, 10],
      lines: [
        "Welcome to Villa Shielded! Shoes off, viewing keys off.",
        "The Palm has sixteen fronds. I picked the one with the best sunset.",
        "They built this island out of sand from the sea floor. My portfolio took longer to settle.",
        "You can see the Palm from space. You can't see my balance.",
        "Lovely neighbours. Never seen a single one of their addresses.",
        "That sail across the water is the Burj Al ZEC. I wave at it every block.",
        "The monorail runs up the trunk to Atlantis. I take it for the croissants.",
        "The pool turns gold on every new block. Best alarm clock ever.",
        "Mortgage? Paid in shielded ZEC. The bank still doesn't know who I am.",
        "The architect asked for my address. I gave him a unified one.",
      ],
    });
    const chef = k.person(f, 4242, [12.4, -4.2], "Private chef", { face: [-1, 0], wander: [[12.4, -4.2], [12.4, -6.8], [11.6, -1.8]] });
    const guest = k.person(f, 2600, [8.4, -5.4], "Guest", { face: [1, 0] });
    k.dialog(f, [chef, guest], [
      [0, "Tonight: grilled hammour, saffron rice, and a dessert I can't disclose."],
      [1, "Shielded dessert?"],
      [0, "Zero-knowledge pudding. You'll know it's good without knowing why."],
      [1, () => `Is that block ${k.height ? k.height.toLocaleString("en-US") : "…"} on the TV?`],
      [0, "The owner made me install it over the oven."],
    ], { near: 10, gap: 12 });
    void k.person(f, 3100, [-4.8, -5.9], "Friend", { dy: 0.05, sit: true, face: [0, 1], lines: ["This sofa has more seats than the mempool has transactions.", () => `Block ${k.height ? k.height.toLocaleString("en-US") : "…"}. The TV never misses one.`], near: 6 });
    const a = k.person(f, 3300, [-7.6, -18.3], "Guest", { dy: 0.05, sit: true, face: [1, 0.4] });
    const b = k.person(f, 3400, [-4.4, -18.4], "Guest", { dy: 0.05, sit: true, face: [-1, 0.4] });
    k.dialog(f, [a, b], [
      [0, "Is it true you can see the Palm from space?"],
      [1, "Yes. Unlike our transactions."],
      [0, "Look, the Burj Al ZEC is lighting up."],
      [1, "Another round by the fire?"],
    ], { near: 10, gap: 14 });
    void k.person(f, 3500, [-2.6, -21.6], "Sunbather", { dy: 0.42, sit: true, face: [0, -1], lines: ["The view from this lounger: the Burj Al ZEC and the whole skyline."], near: 5 });
    void k.person(f, 3600, [4, -27.6], "Swimmer", { sit: true, face: [0, -1], lines: ["The edge of this pool is the edge of the world.", "I can see Atlantis from here!"], near: 8 }).then((s) => {
      if (!s) return;
      const y = k.y(f);
      k.ticks[f].push((_dt, t) => {
        s.root.position.y = y - 0.9 + Math.sin(t * 1.5) * 0.05;
        s.root.position.x = 2 + Math.sin(t * 0.15) * 8;
      });
    });
  });
}
