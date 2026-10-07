import * as THREE from "three";
import * as F from "../furniture";
import { std } from "../kit";
import { EiffelKit, LEVELS, P2, hw, lw, makeCanvas } from "./kit";
import { clothTable, pavilion } from "./props";

/**
 * 2 — the second floor (115 m in Paris): the platform round the summit lifts' core, the Jules
 * Verne's dark dining room, the macaron counter, a bronze orientation table, telescopes on every
 * side with the live chain on their screens.
 */
export const SPAWN2 = { pos: new THREE.Vector3(6.5, 0, 9.7), yaw: Math.PI / 2 };

export function second(k: EiffelKit) {
  const f = 2,
    y = LEVELS[f].y,
    g = k.groups[f],
    key = "2";
  const edge = P2 - 0.3;
  k.railing(f, [-edge, -edge], [edge, -edge], 1.3);
  k.railing(f, [-edge, edge], [edge, edge], 1.3);
  k.railing(f, [-edge, -edge], [-edge, edge], 1.3);
  k.railing(f, [edge, -edge], [edge, edge], 1.3);
  k.arcade(f, edge - 0.05, 3.4, 3.3);
  const o = hw(y) + 0.2,
    i = hw(y) - lw(y) - 0.2;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ])
    k.rects[f].push([Math.min(sx * o, sx * i), Math.min(sz * o, sz * i), Math.max(sx * o, sx * i), Math.max(sz * o, sz * i)]);
  // the leg lift (down) and the summit lifts in the core
  k.liftDoor(f, i - 0.1, 9.7, -Math.PI / 2, 1, { name: "Lift · Pilier Est" });
  const C = 2.8;
  k.slab(key, C * 2, 3.4, C * 2, 0, y, 0, std("#3a2c24", 0.6, 0.4));
  k.slab(key, C * 2 + 0.2, 0.2, C * 2 + 0.2, 0, y + 3.4, 0, k.ironDark);
  for (const s of [-1, 1]) for (const t of [-1, 1]) k.slab(key, 0.2, 3.6, 0.2, s * C, y, t * C, k.brass);
  k.rects[f].push([-C - 0.1, -C - 0.1, C + 0.1, C + 0.1]);
  k.liftDoor(f, 0, -C - 0.05, Math.PI, 3, { name: "Lift · Sommet", color: "#f4b728" });
  k.label(f, "SOMMET · SUMMIT 276 m", 0, 3.25, -C - 0.08, { h: 0.26, color: "#f4b728", rot: Math.PI });
  k.label(f, "2e ÉTAGE · 115 m", i - 0.15, 3.0, 9.7, { h: 0.3, color: "#f4b728", rot: -Math.PI / 2 });
  // the screen on the core's east face: the chain, live
  const scr = k.screen(f, 2.2, 1.24, (c, W, H) => {
    c.fillStyle = "#08070c";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#f4b728";
    c.font = '700 30px "JetBrains Mono", Menlo, monospace';
    c.fillText("ZCASH", 26, 50);
    c.font = '800 64px "JetBrains Mono", Menlo, monospace';
    c.fillText(k.height ? `#${k.height.toLocaleString("en-US")}` : "#…", 26, 130);
    c.fillStyle = "#7fe3ff";
    c.font = '600 30px "JetBrains Mono", Menlo, monospace';
    c.fillText(`MEMPOOL  ${k.ctx.director.mempoolList().length} tx`, 26, 190);
    const last = k.ctx.director.lastBlockTime;
    c.fillStyle = "#3ee08f";
    c.fillText(`LAST BLOCK  ${last ? Math.round((Date.now() - last) / 1000) : "—"} s`, 26, 236);
    c.fillStyle = "#1f2a33";
    c.fillRect(26, H - 40, W - 52, 8);
    c.fillStyle = "#f4b728";
    c.fillRect(26, H - 40, (W - 52) * Math.min(1, last ? (Date.now() - last) / 75000 : 0), 8);
  }, 1);
  scr.position.set(C + 0.03, y + 1.9, 0);
  scr.rotation.y = Math.PI / 2;

  // ---- LE JULES VERNE: the dark dining room on the south side ------------------------------------------
  pavilion(k, f, -6.6, 3.6, 6.6, 7.6, 3.2, [{ side: "s", at: 0, w: 1.6 }], std("#141216", 0.6, 0.4));
  const floorJV = new THREE.Mesh(new THREE.PlaneGeometry(13.2, 4), std("#1a1614", 0.5));
  floorJV.rotation.x = -Math.PI / 2;
  floorJV.position.set(0, y + 0.01, 5.6);
  g.add(floorJV);
  const ceilJV = new THREE.Mesh(new THREE.PlaneGeometry(13.2, 4), std("#2a2420", 0.8));
  ceilJV.rotation.x = Math.PI / 2;
  ceilJV.position.set(0, y + 3.18, 5.6);
  g.add(ceilJV);
  k.label(f, "LE JULES VERNE", 0, 2.75, 7.66, { h: 0.36, color: "#e8c878", font: '600 96px "Times New Roman", Georgia, serif' });
  for (const [x, z] of [
    [-5, 4.8],
    [-2.6, 6.3],
    [2.6, 6.3],
    [5, 4.8],
  ] as [number, number][]) {
    clothTable(k, f, x, z, 0.42, { dark: true });
    for (const s of [-1, 1]) k.put(f, "chairJV", () => F.chair("#1c1a20"), x + s * 0.72, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, { solid: false });
  }
  void k.person(f, 1828, [-5 - 0.68, 4.8], "Couple", { sit: true, dy: 0.42, face: new THREE.Vector3(1, 0, 0) });
  void k.person(f, 1829, [-5 + 0.68, 4.8], "Couple", { sit: true, dy: 0.42, face: new THREE.Vector3(-1, 0, 0) });
  void k.person(f, 1905, [2.6 + 0.68, 6.3], "Visitor", { sit: true, dy: 0.42, face: new THREE.Vector3(-1, 0, 0) });
  void k.person(f, 2601, [0, 4.4], "Chef", { title: "Chef", face: new THREE.Vector3(0, 0, 1) });
  void k.person(f, 1863, [1.3, 8.4], "Maitre", { title: "Maître d'", face: new THREE.Vector3(0, 0, 1) });
  // a lectern by the door and two little lamps
  k.slab(key, 0.5, 1.1, 0.4, -1.3, y, 8.3, std("#1a1418", 0.4));
  k.rects[f].push([-1.6, 8.05, -1.0, 8.55]);
  for (const x of [-1.1, 1.1]) {
    const lampJV = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.16), k.glow("#ffd890", 1.4, 2.6));
    lampJV.position.set(x, y + 2.1, 7.72);
    g.add(lampJV);
  }

  // ---- macarons: a counter of pastel towers on the north side --------------------------------------------
  k.put(f, "macCase", () => F.pastryCase(), -3.5, -6.6, 0);
  k.put(f, "macCase", () => F.pastryCase(), 3.5, -6.6, 0);
  const pastel = ["#f4b8c8", "#b8e0c8", "#f4e0a0", "#c8b8f0", "#a8d8f0", "#f0c0a0"];
  for (let t = 0; t < 2; t++)
    for (let r = 0; r < 6; r++) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.28 - r * 0.04, 0.3 - r * 0.04, 0.1, 14), std(pastel[(r + t) % pastel.length], 0.7));
      ring.position.set(t ? 6.1 : -6.1, y + 1.2 + r * 0.11, -6.6);
      g.add(ring);
    }
  for (const x of [-6.1, 6.1]) {
    k.slab(key, 0.8, 1.15, 0.8, x, y, -6.6, std("#f4ece0", 0.6));
    k.rects[f].push([x - 0.45, -7, x + 0.45, -6.2]);
  }
  k.slab(key, 13, 0.3, 0.1, 0, y + 2.6, -7.5, std("#f4d8e0", 0.6));
  k.label(f, "MACARONS · PÂTISSERIE", 0, 2.75, -7.42, { h: 0.3, color: "#c84a7a", bg: "#f8ecf0" });
  void k.person(f, 3141, [0, -7.3], "Vendor", { title: "Pâtissière" });

  // ---- orientation table (bronze compass) and telescopes ------------------------------------------------
  const rose = makeCanvas(512, 512, (c) => {
    c.fillStyle = "#6a4a2a";
    c.fillRect(0, 0, 512, 512);
    c.strokeStyle = "#c8a060";
    c.lineWidth = 6;
    c.beginPath();
    c.arc(256, 256, 236, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 2;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      c.beginPath();
      c.moveTo(256 + Math.cos(a) * 236, 256 + Math.sin(a) * 236);
      c.lineTo(256 + Math.cos(a) * (i % 9 ? 222 : 200), 256 + Math.sin(a) * (i % 9 ? 222 : 200));
      c.stroke();
    }
    c.fillStyle = "#d8b070";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? 110 : 180;
      c.beginPath();
      c.moveTo(256, 256);
      c.lineTo(256 + Math.cos(a - 0.12) * 40, 256 + Math.sin(a - 0.12) * 40);
      c.lineTo(256 + Math.cos(a) * r, 256 + Math.sin(a) * r);
      c.lineTo(256 + Math.cos(a + 0.12) * 40, 256 + Math.sin(a + 0.12) * 40);
      c.fill();
    }
    c.font = '700 40px "Times New Roman", serif';
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (const [t, a] of [
      ["N", -Math.PI / 2],
      ["E", 0],
      ["S", Math.PI / 2],
      ["O", Math.PI],
    ] as [string, number][])
      c.fillText(t, 256 + Math.cos(a) * 150, 256 + Math.sin(a) * 150);
  }).t;
  const table = new THREE.Group();
  table.position.set(9.6, y, 0);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.95, 12), k.stone);
  ped.position.y = 0.47;
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 32), [std("#6a4a2a", 0.4, 0.8), new THREE.MeshStandardMaterial({ map: rose, roughness: 0.45, metalness: 0.7 }), std("#6a4a2a", 0.4, 0.8)]);
  disk.position.y = 1.0;
  disk.rotation.x = -0.25;
  table.add(ped, disk);
  g.add(table);
  k.rects[f].push([9, -0.6, 10.2, 0.6]);
  k.pick(f, disk, "<b>Table d'orientation</b><span>115 m</span>", () => ({
    eyebrow: "Table d'orientation",
    title: "2e étage · 115 m",
    stats: [
      ["Floor", "115 m"],
      ["Summit", "276 m"],
      ["Block", k.height ? `#${k.height.toLocaleString("en-US")}` : "…"],
      ["Mempool", String(k.ctx.director.mempoolList().length)],
    ],
  }));
  k.telescope(f, -5, -12.5, 0, 1);
  k.telescope(f, 5, -12.5, 0, 2);
  k.telescope(f, 12.5, -4, -Math.PI / 2, 3);
  k.telescope(f, 12.5, 4, -Math.PI / 2, 4);
  k.telescope(f, -12.5, 0, Math.PI / 2, 5);
  k.telescope(f, -4, 12.5, Math.PI, 6);

  // ---- people at the railings --------------------------------------------------------------------------
  void k.person(f, 1999, [-11.6, -3], "Couple", { face: new THREE.Vector3(-1, 0, 0) });
  void k.person(f, 2000, [-11.6, -2.2], "Couple", { face: new THREE.Vector3(-1, 0, 0) });
  void k.person(f, 7777, [6, -11.4], "Visitor", { face: new THREE.Vector3(0, 0, -1) });
  void k.person(f, 7778, [11.4, 2], "Kid", { bob: 3, face: new THREE.Vector3(1, 0, 0) });
  void k.person(f, 1066, [-8, 10.6], "Photographer", { face: new THREE.Vector3(1, 0, 0) });
  void k.person(f, 5555, [-6, -10], "Visitor", { wander: [[-6, -10], [6, -10], [10, -6], [10, 6], [-10, 6], [-10, -6]] });
  void k.person(f, 5556, [10, 10.5], "Guide", { wander: [[9.5, 10.5], [-9, 10.6], [-10.5, -9.5], [10.5, -10]] });
  k.put(f, "b2", F.bench, -9.6, -6, Math.PI / 2);
  k.put(f, "b2", F.bench, 6, 10.4, 0);

  k.light(f, 0, 2.9, 5.6, "#ffcf80", 8, 10);
  k.light(f, 0, 2.6, -7.8, "#fff0e0", 7, 10);
  k.light(f, 6, 3.6, 0, "#ffd9a0", 6, 14);
  k.light(f, -6, 3.6, 0, "#ffd9a0", 6, 14);
}
