import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { fitText } from "../../scene/fit";
import { hash } from "../../scene/voxel/model";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import { GOLD, LEVELS, MONO, NeedleKit, fmt, makeCanvas } from "./kit";
import * as P from "./props";

export const LX0 = -15,
  LX1 = 15,
  LZ0 = -28,
  LZ1 = 0;

/** Zcash from genesis to now: the network upgrades, their heights and dates (mainnet). */
export const HISTORY = [
  { year: "2016", name: "Genesis", date: "28 Oct 2016", h: 0, what: "Sprout · zk-SNARKs · 150 s blocks", branch: "—", bt: 150 },
  { year: "2018", name: "Overwinter", date: "25 Jun 2018", h: 347_500, what: "Tx expiry · replay protection", branch: "5ba81b19", bt: 150 },
  { year: "2018", name: "Sapling", date: "28 Oct 2018", h: 419_200, what: "Sapling pool · mobile shielded", branch: "76b809bb", bt: 150 },
  { year: "2019", name: "Blossom", date: "11 Dec 2019", h: 653_600, what: "Blocks 150 s → 75 s", branch: "2bb40e60", bt: 75 },
  { year: "2020", name: "Heartwood", date: "16 Jul 2020", h: 903_000, what: "Shielded coinbase · FlyClient", branch: "f5b9230b", bt: 75 },
  { year: "2020", name: "Canopy", date: "18 Nov 2020", h: 1_046_400, what: "1st halving · Dev Fund ZIP 1014", branch: "e9ff75a6", bt: 75 },
  { year: "2022", name: "NU5 · Orchard", date: "31 May 2022", h: 1_687_104, what: "Halo 2 · no trusted setup · UAs", branch: "c2d6d0b4", bt: 75 },
  { year: "2024", name: "NU6", date: "23 Nov 2024", h: 2_726_400, what: "2nd halving · Lockbox ZIP 1015", branch: "c8e71055", bt: 75 },
  { year: "2025", name: "NU6.1", date: "24 Nov 2025", h: 3_146_400, what: "Grants · coinholder fund ZIP 1016", branch: "4dec4df0", bt: 75 },
  { year: "2026", name: "NU6.2", date: "3 Jun 2026", h: 3_364_600, what: "Orchard soundness fix", branch: "5437f330", bt: 75 },
  { year: "2026", name: "NU6.3 · Ironwood", date: "28 Jul 2026", h: 3_428_143, what: "Ironwood shielded pool", branch: "37a5165b", bt: 75 },
];

/** Warm polished marble with a gold strip grid. */
function marble() {
  const { t } = makeCanvas(512, 512, (g) => {
    g.fillStyle = "#d9cdb8";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(140,118,90,${0.05 + hash(i, 1, 2, 9) * 0.12})`;
      g.lineWidth = 1 + hash(i, 2, 2, 9) * 2.5;
      g.beginPath();
      g.moveTo(hash(i, 3, 2, 9) * 512, 0);
      g.bezierCurveTo(hash(i, 4, 2, 9) * 512, 170, hash(i, 5, 2, 9) * 512, 340, hash(i, 6, 2, 9) * 512, 512);
      g.stroke();
    }
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(0, 0, 256, 256);
    g.fillRect(256, 256, 256, 256);
    g.fillStyle = "#b8912a";
    g.fillRect(0, 0, 512, 4);
    g.fillRect(0, 0, 4, 512);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7.5, 7);
  return t;
}

/** The desert flower inlaid round the model: six gold petals, rings, the compass points. */
function flower() {
  const { t } = makeCanvas(1024, 1024, (g) => {
    g.translate(512, 512);
    g.strokeStyle = "#c9a227";
    g.fillStyle = "rgba(201,162,39,0.85)";
    g.lineWidth = 10;
    for (const r of [500, 470, 300]) {
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      g.save();
      g.rotate((i * Math.PI) / 3);
      g.beginPath();
      g.moveTo(0, -150);
      g.bezierCurveTo(90, -260, 60, -400, 0, -462);
      g.bezierCurveTo(-60, -400, -90, -260, 0, -150);
      g.fill();
      g.restore();
      g.save();
      g.rotate((i * Math.PI) / 3 + Math.PI / 6);
      g.fillRect(-4, -460, 8, 160);
      g.restore();
    }
    g.fillStyle = "#2a2228";
    g.beginPath();
    g.arc(0, 0, 150, 0, Math.PI * 2);
    g.fill();
  });
  return t;
}

/** The tower at 1:37, from three geometry: Y-plan wings stepping back, deck ring, crown, spire. */
function towerModel(k: NeedleKit) {
  const H = 4.4;
  const geos: THREE.BufferGeometry[] = [];
  const tiers = 9;
  for (let i = 0; i < tiers; i++) {
    const y0 = (i / tiers) * H * 0.78,
      h = (H * 0.78) / tiers;
    for (let w = 0; w < 3; w++) {
      // each wing steps back on its own tier, in a spiral
      const L = 0.95 * (1 - Math.max(0, i - w * 0.33) / (tiers + 1.5));
      const b = new THREE.BoxGeometry(0.34, h - 0.012, L);
      b.translate(0, y0 + h / 2, L / 2);
      b.rotateY((w * Math.PI * 2) / 3);
      geos.push(b);
    }
  }
  const core = new THREE.CylinderGeometry(0.2, 0.28, H * 0.86, 12);
  core.translate(0, (H * 0.86) / 2, 0);
  geos.push(core);
  const g = new THREE.Group();
  const body = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: "#a8bcd4", roughness: 0.15, metalness: 0.85, emissive: "#203048", emissiveIntensity: 0.4 }));
  g.add(body);
  // gold fins on the wing noses
  for (let w = 0; w < 3; w++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, H * 0.6, 0.03), glowMat(GOLD, 1.6));
    const a = (w * Math.PI * 2) / 3;
    fin.position.set(Math.sin(a) * 0.9, H * 0.3, Math.cos(a) * 0.9);
    g.add(fin);
  }
  const deck = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 6, 40), glowMat(GOLD, 2));
  deck.rotation.x = Math.PI / 2;
  deck.position.y = H * 0.5;
  g.add(deck);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.4, 10), glowMat("#ffcf5a", 1.4));
  crown.position.y = H * 0.86 + 0.2;
  g.add(crown);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.05, 1.1, 8), k.chrome);
  spire.position.y = H * 0.86 + 0.4 + 0.55;
  g.add(spire);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), glowMat("#ff3030", 3));
  tip.position.y = H * 0.86 + 0.4 + 1.1;
  g.add(tip);
  return g;
}

/** G — the grand lobby: marble and gold, the history wall, the model, tickets, security, the
 *  multimedia queue to the lifts, the lounge, palms. Entered from the plaza (+z). */
export function lobby(k: NeedleKit) {
  const f = 0,
    g = k.groups[f],
    y = 0,
    h = LEVELS[f].h;
  const floorMat = new THREE.MeshStandardMaterial({ map: marble(), roughness: 0.12, metalness: 0.15 });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(LX1 - LX0, LZ1 - LZ0), floorMat);
  fl.rotation.x = -Math.PI / 2;
  fl.position.set(0, y, (LZ0 + LZ1) / 2);
  g.add(fl);
  box(g, LX1 - LX0, 0.2, LZ1 - LZ0, std("#14121a", 0.9), 0, y + h, (LZ0 + LZ1) / 2);
  // coffered ceiling: dark with gold-lit beams
  const beam = glowMat("#ffcf80", 0.55);
  for (let x = -12; x <= 12; x += 6) box(g, 0.18, 0.1, LZ1 - LZ0, beam, x, y + h - 0.1, (LZ0 + LZ1) / 2);
  for (let z = -25; z <= -3; z += 5.5) box(g, LX1 - LX0, 0.1, 0.18, beam, 0, y + h - 0.1, z);
  // walls: stone north and east, the dark history wall west, glass south
  const stoneWall = new THREE.MeshStandardMaterial({ color: "#b8a688", roughness: 0.45, metalness: 0.05 });
  const darkWall = std("#1e1a20", 0.6, 0.1);
  k.rects[f].push([LX0, LZ0 - 0.3, LX1, LZ0 + 0.1]);
  box(g, LX1 - LX0, h, 0.3, stoneWall, 0, y, LZ0 - 0.15);
  k.rects[f].push([LX1 - 0.1, LZ0, LX1 + 0.3, LZ1]);
  box(g, 0.3, h, LZ1 - LZ0, stoneWall, LX1 + 0.15, y, (LZ0 + LZ1) / 2);
  k.rects[f].push([LX0 - 0.3, LZ0, LX0 + 0.1, LZ1]);
  box(g, 0.3, h, LZ1 - LZ0, darkWall, LX0 - 0.15, y, (LZ0 + LZ1) / 2);
  // stone wall joints, gold skirting
  for (let x = LX0 + 2.5; x < LX1; x += 2.5) box(g, 0.02, h, 0.02, std("#a89878", 0.6), x, y, LZ0 + 0.01);
  for (let z = LZ0 + 2.5; z < LZ1; z += 2.5) box(g, 0.02, h, 0.02, std("#a89878", 0.6), LX1 - 0.01, y, z);
  box(g, LX1 - LX0, 0.14, 0.04, k.gold, 0, y, LZ0 + 0.02);
  box(g, 0.04, 0.14, LZ1 - LZ0, k.gold, LX1 - 0.02, y, (LZ0 + LZ1) / 2);
  box(g, 0.04, 0.14, LZ1 - LZ0, k.gold, LX0 + 0.02, y, (LZ0 + LZ1) / 2);
  // the glass front, a gold canopy over the revolving door
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(LX1 - LX0, h), k.glass);
  pane.position.set(0, y + h / 2, LZ1);
  pane.raycast = () => {};
  g.add(pane);
  for (let x = LX0; x <= LX1 + 0.01; x += 2.5) box(g, 0.1, h, 0.12, k.mullion, x, y, LZ1);
  for (const yy of [0, 3.2, h - 0.12]) box(g, LX1 - LX0, 0.12, 0.14, k.mullion, 0, y + yy, LZ1);
  k.rects[f].push([LX0, LZ1 - 0.1, LX1, LZ1 + 0.3]);
  const drum = new THREE.Group();
  drum.position.set(0, y, LZ1);
  const dg = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 2.8, 32, 1, true), k.glass);
  dg.position.y = 1.4;
  dg.raycast = () => {};
  drum.add(dg);
  const wings = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.6, 0.04), k.glass);
    w.position.set(Math.cos((i * Math.PI) / 2) * 0.6, 1.35, Math.sin((i * Math.PI) / 2) * 0.6);
    w.rotation.y = (-i * Math.PI) / 2;
    w.raycast = () => {};
    wings.add(w);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.05), k.gold);
    fr.position.set(w.position.x, 0.08, w.position.z);
    fr.rotation.y = w.rotation.y;
    wings.add(fr);
  }
  drum.add(wings);
  box(drum, 0.08, 2.8, 0.08, k.gold, 0, 0, 0);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.25, 32), k.gold);
  cap.position.y = 2.92;
  drum.add(cap);
  g.add(drum);
  k.ticks[f].push((dt) => (wings.rotation.y += dt * 0.35));
  box(g, 6, 0.2, 2.4, k.gold, 0, y + 3.6, LZ1 - 1.2);
  k.label(f, "ZEC NEEDLE", 0, 4.4, LZ1 - 0.2, { h: 0.6, color: GOLD, rot: Math.PI });

  // ---- the centre: the desert flower inlaid, the model on its plinth, the rod chandelier
  const fi = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ map: flower(), transparent: true, roughness: 0.2, metalness: 0.7 }));
  fi.rotation.x = -Math.PI / 2;
  fi.position.set(0, y + 0.012, -13);
  g.add(fi);
  k.put(f, "nPlinth", () => P.plinth(1.3), 0, -13);
  const model = towerModel(k);
  model.position.set(0, y + 0.84, -13);
  g.add(model);
  k.ticks[f].push((dt) => (model.rotation.y += dt * 0.08));
  k.hit(f, 2.4, 5.6, 2.4, 0, -13, 0, "<b>ZEC NEEDLE</b><span>the model · 1:37</span>", () => ({
    eyebrow: "Scale model · 1:37",
    title: "ZEC NEEDLE",
    stats: [
      ["Height", "164 m"],
      ["At the Top", "82 m"],
      ["Sky Lounge", "120 m"],
      ["At the Top SKY", "150 m"],
    ],
  }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.put(f, "stanchionPost", () => P.stanchion(0.0), Math.sin(a) * 2.2, -13 + Math.cos(a) * 2.2, 0, { solid: false });
  }
  const rope = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.035, 6, 64), std("#5a1a2a", 0.7));
  rope.rotation.x = Math.PI / 2;
  rope.position.set(0, y + 0.8, -13);
  g.add(rope);
  k.rects[f].push([-2.2, -15.2, 2.2, -10.8]);
  const N = 340;
  const rods = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 5), glowMat("#ffd27a", 1.5), N);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const ring = i % 4,
      a = (i / N) * Math.PI * 2 * 4 + ring * 0.3;
    const r = 2.2 + ring * 0.6;
    const len = 0.6 + (Math.sin(a * 3 + ring) * 0.5 + 0.5) * 1.6 + ring * 0.2;
    mtx.makeScale(1, len, 1).setPosition(Math.sin(a) * r, y + h - 0.15 - len / 2, -13 + Math.cos(a) * r);
    rods.setMatrixAt(i, mtx);
  }
  g.add(rods);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.06, 6, 64), k.gold);
  halo.rotation.x = Math.PI / 2;
  halo.position.set(0, y + h - 0.15, -13);
  g.add(halo);

  // ---- the history wall (west): genesis to now, the upgrades at their heights
  const WZ0 = -26,
    WZ1 = -5.4,
    WY = 1.3,
    WH = 4.2;
  const wall = makeCanvas(4096, Math.round((4096 * WH) / (WZ1 - WZ0)), (gc) => {
    const W = gc.canvas.width,
      H = gc.canvas.height;
    const bg = gc.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#120e14");
    bg.addColorStop(1, "#1c1610");
    gc.fillStyle = bg;
    gc.fillRect(0, 0, W, H);
    const n = HISTORY.length;
    const step = (W - 120) / n;
    const ly = H * 0.42;
    const grad = gc.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "#6a5418");
    grad.addColorStop(1, GOLD);
    gc.fillStyle = grad;
    gc.fillRect(40, ly - 4, W - 80, 8);
    HISTORY.forEach((e, i) => {
      const x = 80 + i * step + step / 2;
      gc.textAlign = "center";
      gc.fillStyle = "rgba(244,183,40,0.12)";
      gc.fillRect(x - step / 2 + 8, 20, step - 16, H - 40);
      gc.fillStyle = GOLD;
      gc.font = `800 82px ${MONO}`;
      gc.fillText(e.year, x, ly - 70);
      gc.beginPath();
      gc.arc(x, ly, 20, 0, Math.PI * 2);
      gc.fill();
      gc.fillStyle = "#120e14";
      gc.beginPath();
      gc.arc(x, ly, 9, 0, Math.PI * 2);
      gc.fill();
      gc.fillStyle = "#f4ecd8";
      gc.font = `800 40px ${MONO}`;
      fitText(gc, e.name.toUpperCase(), x, ly + 80, step - 30);
      gc.fillStyle = "#c9a227";
      gc.font = `600 28px ${MONO}`;
      fitText(gc, e.date, x, ly + 124, step - 30);
      gc.fillStyle = "#e9e2d0";
      gc.font = `700 30px ${MONO}`;
      fitText(gc, `#${fmt(e.h)}`, x, ly + 166, step - 30);
      gc.fillStyle = "#a89a80";
      gc.font = `500 22px ${MONO}`;
      const parts = e.what.split(" · ");
      parts.forEach((p, j) => fitText(gc, p, x, ly + 214 + j * 30, step - 30));
    });
    gc.textAlign = "left";
  });
  const wm = new THREE.Mesh(new THREE.PlaneGeometry(WZ1 - WZ0, WH), new THREE.MeshBasicMaterial({ map: wall.t, toneMapped: false, color: new THREE.Color(1.05, 1.05, 1.05) }));
  wm.position.set(LX0 + 0.08, y + WY + WH / 2, (WZ0 + WZ1) / 2);
  wm.rotation.y = Math.PI / 2;
  g.add(wm);
  box(g, 0.04, WH + 0.24, WZ1 - WZ0 + 0.24, k.gold, LX0 + 0.02, y + WY - 0.12, (WZ0 + WZ1) / 2);
  box(g, 0.2, 0.05, WZ1 - WZ0, glowMat("#ffd28a", 1.4), LX0 + 0.12, y + WY + WH + 0.3, (WZ0 + WZ1) / 2);
  k.label(f, "ZCASH · 2016 → NOW", LX0 + 0.08, WY + WH + 1.0, (WZ0 + WZ1) / 2, { h: 0.7, color: GOLD, rot: Math.PI / 2 });
  const step = (WZ1 - WZ0 - (120 / 4096) * (WZ1 - WZ0)) / HISTORY.length;
  HISTORY.forEach((e, i) => {
    const z = WZ0 + (80 / 4096) * (WZ1 - WZ0) + i * step + step / 2;
    k.hit(f, 0.3, WH, step * 0.95, LX0 + 0.2, z, WY, `<b>${e.name}</b><span>${e.date} · #${fmt(e.h)}</span>`, () => ({
      eyebrow: `Zcash · ${e.year}`,
      title: e.name,
      tag: ["Activated", "ok"],
      stats: [
        ["Height", `#${fmt(e.h)}`],
        ["Date", e.date],
        ["Block time", `${e.bt} s`],
        ["Branch id", e.branch],
      ],
      body: `<p>${e.what}</p>`,
      link: { href: `https://zscan.cash/block/${e.h}`, label: "Block on ZScan" },
    }));
  });
  // NOW: the live end of the timeline
  const now = k.screen(f, 3.2, 2.0, (gc, W, H) => {
    gc.fillStyle = "#0b0810";
    gc.fillRect(0, 0, W, H);
    gc.strokeStyle = GOLD;
    gc.lineWidth = 4;
    gc.strokeRect(6, 6, W - 12, H - 12);
    gc.textAlign = "center";
    gc.fillStyle = "#3ee08f";
    gc.font = `800 40px ${MONO}`;
    gc.fillText("● NOW", W / 2, 62);
    gc.fillStyle = "#f4ecd8";
    gc.font = `800 64px ${MONO}`;
    fitText(gc, k.height ? `#${fmt(k.height)}` : "…", W / 2, 140);
    gc.fillStyle = "#c9a227";
    gc.font = `600 24px ${MONO}`;
    const s = k.sinceBlock;
    fitText(gc, `${k.mempool} tx in the mempool${s != null ? ` · last block ${s} s ago` : ""}`, W / 2, 190);
    const p = k.price;
    gc.fillStyle = "#e9e2d0";
    gc.font = `700 30px ${MONO}`;
    if (p) fitText(gc, `ZEC $${p.usd.toFixed(2)}  ${p.usd_24h_change >= 0 ? "▲" : "▼"} ${Math.abs(p.usd_24h_change).toFixed(1)}%`, W / 2, 262);
    gc.fillStyle = "#8a7a5a";
    gc.font = `500 20px ${MONO}`;
    fitText(gc, "NEXT · NU7", W / 2, 300);
    gc.textAlign = "left";
  }, 1);
  now.position.set(LX0 + 0.08, y + WY + 2.0, -2.2);
  now.rotation.y = Math.PI / 2;
  k.hit(f, 0.3, 2, 3.2, LX0 + 0.2, -2.2, WY + 1.0, "<b>Now</b><span>the chain, live</span>", () => ({
    eyebrow: "Zcash · now",
    title: k.height ? `#${fmt(k.height)}` : "…",
    mono: true,
    stats: [
      ["Mempool", `${k.mempool} tx`],
      ["Price", k.price ? `$${k.price.usd.toFixed(2)}` : "…"],
      ["Last block", k.sinceBlock != null ? `${k.sinceBlock} s ago` : "…"],
      ["Next upgrade", "NU7"],
    ],
    link: { href: "https://zscan.cash", label: "ZScan" },
  }));
  // spots on the wall
  for (let z = WZ0 + 1; z < WZ1; z += 2.6) place(k, f, "spotN", () => F.sconce("#fff0d0"), LX0 + 0.1, y + 6.7, z, Math.PI / 2);
  // readers at the wall
  void k.person(f, 3141, [-12.4, -22], "Visitor", { face: new THREE.Vector3(-1, 0, 0), phone: true });
  void k.person(f, 2718, [-11.8, -16.5], "Visitor", { face: new THREE.Vector3(-1, 0, 0) });
  void k.person(f, 1618, [-12.6, -10.4], "Photographer", { face: new THREE.Vector3(-1, 0, 0), phone: true });
  void k.person(f, 5000, [-11.4, -7.5], "Visitor", { face: new THREE.Vector3(-1, 0, 0), wander: [[-11.4, -7.5], [-12, -19], [-11.6, -13], [-6, -8]] });

  // ---- lifts (north): four bronze doors, each to its level, floor indicators, AT THE TOP
  const lifts: [number, number][] = [
    [-7.5, 1],
    [-2.5, 2],
    [2.5, 3],
    [7.5, 4],
  ];
  for (const [x, to] of lifts) {
    const L = LEVELS[to];
    k.put(f, "nLiftDoor", P.liftDoor, x, LZ0 + 0.13, 0, { solid: false });
    k.hit(f, 2, 2.6, 0.4, x, LZ0 + 0.3, 0, `<b>Lift · L${L.label}</b><span>${L.name}</span>`, () => ({ eyebrow: `Lift · ${L.m}`, title: L.name, floor: to }));
    let acc = 0,
      fl = 0;
    const ind = k.screen(f, 1.4, 0.42, (gc, W, H) => {
      gc.fillStyle = "#07060c";
      gc.fillRect(0, 0, W, H);
      gc.fillStyle = "#ffb43a";
      gc.font = `800 96px ${MONO}`;
      gc.textAlign = "center";
      gc.fillText(`${fl ? "▲" : "●"} ${fl ? Math.round(fl) : "G"}`, W / 2, H * 0.78);
      gc.textAlign = "left";
    }, 0.12);
    ind.position.set(x, y + 3.25, LZ0 + 0.06);
    const cycle = 6 + to;
    k.ticks[f].push((dt) => {
      acc = (acc + dt) % cycle;
      const u = acc / cycle;
      fl = u < 0.45 ? (u / 0.45) * L.y : u < 0.55 ? L.y : u < 0.9 ? L.y * (1 - (u - 0.55) / 0.35) : 0;
    });
    k.label(f, `L${L.label} · ${L.name.split(" · ")[0].toUpperCase()} · ${L.m}`, x, 3.85, LZ0 + 0.1, { h: 0.2, color: "#ffd28a" });
  }
  // a dark marble feature panel over the lifts carries the name
  box(g, 20, 4.2, 0.08, std("#1a1418", 0.6, 0.2), 0, y + 3.55, LZ0 + 0.04);
  box(g, 20.2, 0.08, 0.12, k.gold, 0, y + 3.5, LZ0 + 0.06);
  box(g, 20.2, 0.08, 0.12, k.gold, 0, y + 7.75, LZ0 + 0.06);
  k.label(f, "AT THE TOP", 0, 6.2, LZ0 + 0.1, { h: 1.3, color: GOLD });
  k.label(f, "82 m  ·  120 m  ·  150 m", 0, 5.1, LZ0 + 0.1, { h: 0.4, color: "#e9d8b0" });
  k.put(f, "nRugLift", () => F.rug(18, 3.2, "#3a1a22", "#c9a227"), 0, LZ0 + 2.0, 0, { solid: false });

  // ---- tickets and security (south-east), the serpentine queue with its multimedia wall
  k.put(f, "nTickets", F.receptionDesk, LX1 - 1.0, -4.0, -Math.PI / 2);
  k.label(f, "AT THE TOP · TICKETS", LX1 - 0.05, 3.2, -4.0, { h: 0.34, color: GOLD, rot: -Math.PI / 2 });
  void k.person(f, 8008, [LX1 - 0.3, -4.0], "Host", { face: new THREE.Vector3(-1, 0, 0) });
  let tickets = 0;
  k.hit(f, 1.2, 1.2, 4.2, LX1 - 1.0, -4.0, 0, "<b>Tickets</b><span>At the Top</span>", () => ({
    eyebrow: "Ticket",
    title: `At the Top · N° ${String(++tickets).padStart(5, "0")}`,
    mono: true,
    tag: ["Shielded", "ok"],
    stats: [
      ["Level", "22 · 82 m"],
      ["Lift", "10 m/s"],
      ["Block", k.height ? `#${fmt(k.height)}` : "…"],
      ["ZEC", k.price ? `$${k.price.usd.toFixed(2)}` : "…"],
    ],
  }));
  // security: X-ray belt, two arches, guards
  k.put(f, "nXray", P.xray, 5.6, -8.2, 0);
  k.put(f, "nDetector", P.detector, 9.4, -8.2, 0, { solid: false });
  k.put(f, "nDetector", P.detector, 12.2, -8.2, 0, { solid: false });
  for (const x of [8.7, 10.1, 11.5, 12.9]) k.rects[f].push([x - 0.1, -8.5, x + 0.1, -7.9]);
  k.rects[f].push([13.3, -8.4, LX1, -8.0]);
  k.label(f, "SECURITY", 10.8, 2.75, -8.0, { h: 0.2, color: "#3ee08f" });
  void k.person(f, 7007, [9.4, -6.6], "Security", { face: new THREE.Vector3(0, 0, 1) });
  void k.person(f, 7070, [4.4, -9.4], "Security", { face: new THREE.Vector3(1, 0, 0) });
  k.hit(f, 6, 2.4, 1, 9.4, -8.2, 0, "<b>Security</b><span>bags on the belt</span>", () => ({ eyebrow: "Security", title: "Cleared ✓", tag: ["Zero knowledge", "ok"], body: "<p>Checked. Nothing disclosed.</p>" }));
  // the queue: belts in a serpentine, visitors in it
  for (const [i, zq] of [-11.2, -13.8, -16.4, -19.0].entries()) {
    const x0 = i % 2 ? 6.5 : 8.0,
      x1 = i % 2 ? 13.0 : LX1 - 0.2;
    k.put(f, `nBelt${i}`, () => P.stanchion(x1 - x0), (x0 + x1) / 2, zq, 0, { solid: false });
    k.rects[f].push([x0 - 0.1, zq - 0.1, x1 + 0.1, zq + 0.1]);
  }
  const queue: [number, number, number, boolean][] = [
    [11.5, -12.5, 401, true],
    [9.0, -12.4, 402, false],
    [7.6, -15.1, 403, true],
    [10.4, -15.0, 404, false],
    [12.6, -17.7, 405, true],
    [9.6, -17.8, 406, false],
    [7.2, -20.4, 407, true],
  ];
  for (const [x, z, id, ph] of queue) void k.person(f, id, [x, z], "Visitor", { face: new THREE.Vector3(z < -16 ? -1 : 1, 0, 0), phone: ph });
  // multimedia: three screens on the east wall along the queue
  const shows: ((gc: CanvasRenderingContext2D, W: number, H: number, t: number) => void)[] = [
    // the blocks landing, live
    (gc, W, H, t) => {
      gc.fillStyle = "#05040a";
      gc.fillRect(0, 0, W, H);
      const hh = k.height;
      for (let i = 0; i < 7; i++) {
        const x = W - ((t * 40 + i * 150) % (W + 150));
        gc.fillStyle = i === 0 ? GOLD : "#2a2418";
        gc.fillRect(x, H * 0.42, 120, 90);
        gc.fillStyle = i === 0 ? "#120e08" : "#c9a227";
        gc.font = `700 18px ${MONO}`;
        gc.fillText(hh ? `#${fmt(hh - i)}` : "…", x + 8, H * 0.42 + 52);
      }
      gc.fillStyle = "#f4ecd8";
      gc.font = `800 40px ${MONO}`;
      gc.fillText("1 BLOCK · 75 s", 30, 64);
      gc.fillStyle = "#8a7a5a";
      gc.font = `600 22px ${MONO}`;
      gc.fillText(`${k.mempool} tx waiting`, 30, H - 30);
    },
    // the pools: shielded vs transparent
    (gc, W, H) => {
      gc.fillStyle = "#05040a";
      gc.fillRect(0, 0, W, H);
      gc.fillStyle = "#f4ecd8";
      gc.font = `800 36px ${MONO}`;
      gc.fillText("VALUE POOLS", 30, 58);
      const p = k.market.pools;
      if (!p) return;
      const rows: [string, number, string][] = [
        ["Transparent", p.pools.transparent, "#8a8a94"],
        ["Sprout", p.pools.sprout, "#7a5a3a"],
        ["Sapling", p.pools.sapling, "#3ee08f"],
        ["Orchard", p.pools.orchard, "#3ef0ff"],
        ["Ironwood", p.pools.ironwood, GOLD],
      ];
      const max = Math.max(...rows.map((r) => r[1]));
      rows.forEach(([n, v, c], i) => {
        const yy = 96 + i * 40;
        gc.fillStyle = "#c9b48a";
        gc.font = `600 20px ${MONO}`;
        gc.fillText(n, 30, yy + 20);
        gc.fillStyle = c;
        gc.fillRect(190, yy + 2, ((W - 380) * v) / max, 24);
        gc.fillStyle = "#e9e2d0";
        gc.fillText(`${fmt(v / 1e8 / 1e6, 2)} M`, W - 170, yy + 20);
      });
    },
    // the tower, climbing
    (gc, W, H, t) => {
      gc.fillStyle = "#05040a";
      gc.fillRect(0, 0, W, H);
      const u = (t * 0.12) % 1;
      const hgt = 164 * u;
      gc.fillStyle = "#1a1a24";
      gc.fillRect(W * 0.62, H - 20 - H * 0.8, 40, H * 0.8);
      gc.fillStyle = GOLD;
      gc.fillRect(W * 0.62 - 10, H - 20 - (H * 0.8 * 82) / 164, 60, 4);
      gc.fillRect(W * 0.62 + 16, H - 20 - (H * 0.8 * hgt) / 164, 8, 8);
      gc.fillStyle = "#f4ecd8";
      gc.font = `800 64px ${MONO}`;
      gc.fillText(`${Math.round(hgt)} m`, 30, H * 0.5);
      gc.fillStyle = "#c9a227";
      gc.font = `600 22px ${MONO}`;
      gc.fillText("AT THE TOP · 82 m", W * 0.62 + 60, H - 20 - (H * 0.8 * 82) / 164 + 8);
      gc.fillText("SKY · 150 m", W * 0.62 + 60, H - 20 - (H * 0.8 * 150) / 164 + 8);
    },
  ];
  shows.forEach((draw, i) => {
    const s = k.screen(f, 4.2, 2.3, draw, 0.1);
    s.position.set(LX1 - 0.08, y + 2.6, -12 - i * 4.8);
    s.rotation.y = -Math.PI / 2;
    box(g, 0.1, 2.5, 4.4, k.gold, LX1 - 0.04, y + 1.45, -12 - i * 4.8);
  });

  // ---- welcome lounge (south-west): leather sofas round a table, lamps, palms
  k.put(f, "nRugLounge", () => F.rug(6, 4.4, "#2a1a20", "#c9a227"), -7, -4.8, 0, { solid: false });
  k.put(f, "nSofaL", () => P.loungeSofa("#5a3a28", 3), -7, -6.6, 0);
  k.put(f, "nSofaL", () => P.loungeSofa("#5a3a28", 3), -7, -3.0, Math.PI);
  k.put(f, "coffee", F.coffeeTable, -7, -4.8);
  k.put(f, "nSideLamp", P.sideLamp, -9.6, -6.6);
  k.put(f, "nSideLamp", P.sideLamp, -4.4, -3.0);
  void k.person(f, 1001, [-7.6, -6.55], "Guest", { sit: true, dy: 0.42, phone: true });
  void k.person(f, 1002, [-6.2, -3.05], "Guest", { sit: true, dy: 0.42, face: new THREE.Vector3(0, 0, -1) });
  for (const [i, [x, z]] of ([[-13.2, -1.6], [13.2, -1.6], [-4.4, -26.2], [4.4, -26.2], [-13.2, -27], [13.2, -26.8], [-3.6, -1.6], [3.6, -1.6]] as [number, number][]).entries())
    k.put(f, `nPalm${i % 3}`, () => P.palmTree(i % 3), x, z, i * 0.7);
  for (const [x, z] of [[-5, -8], [5, -8], [-5, -19], [5, -19]] as [number, number][]) k.put(f, "nCol9", () => F.column(h), x, z);
  void k.person(f, 9090, [-1.5, -6.0], "Host", { face: new THREE.Vector3(0, 0, 1), wander: [[-1.5, -6], [2.5, -18], [-3, -22], [3, -7]] });
  void k.person(f, 4242, [3.2, -16.5], "Visitor", { face: new THREE.Vector3(-1, 0, 1), phone: true });

  k.light(f, 0, -13, "#ffd8a0", 14, -1.2, 26);
  k.light(f, -8, -15, "#ffe0b8", 6, -2, 20);
  k.light(f, 9, -15, "#ffd8a8", 6, -2, 20);
  k.light(f, 0, -24, "#ffd09a", 6, -2.5, 16);
  k.light(f, -6, -4, "#ffd8b0", 6, -2.5, 16);
}

function place(k: NeedleKit, f: number, key: string, build: () => import("../../scene/voxel/model").VoxelModel, x: number, y: number, z: number, rot: number) {
  F.place(k.groups[f], key, build, x, y, z, rot);
}
