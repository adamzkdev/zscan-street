import * as THREE from "three";
import { Market } from "../../data/market";
import { fitText } from "../../scene/fit";
import { hash } from "../../scene/voxel/model";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import * as H from "./furniture";
import { HotelKit, LEVELS, boards, makeCanvas, num, tex, water } from "./kit";

/** 40 — Banyan spa & fitness: treatment rooms, the sauna, hot and cold pools, the relaxation deck;
 *  through the glass, the gym: treadmills on the city, bikes, weights, a punching bag. */
export function spa(k: HotelKit) {
  const f = 4,
    g = k.groups[f],
    y = LEVELS[f].y,
    h = LEVELS[f].h,
    X0 = LEVELS[f].x0,
    X1 = LEVELS[f].x1;
  const stone = tex(128, 10, 8, (gc, S) => {
    gc.fillStyle = "#6a6058";
    gc.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) {
      gc.fillStyle = i % 2 ? "#625850" : "#706660";
      gc.fillRect((i % 2) * 64, Math.floor(i / 2) * 64, 63, 63);
    }
  });
  k.shell(f, new THREE.MeshStandardMaterial({ map: stone, roughness: 0.6 }), std("#2a2420", 0.9), { panels: "none", wallMat: std("#4a3a2e", 0.8) });
  k.lifts(f);
  // wooden slats on the ceiling of the spa, a cove of warm light
  for (let x = -14; x < 2; x += 0.6) box(g, 0.2, 0.12, 21.6, std("#7a5a3a", 0.7), x, y + h - 0.14, -11);
  // the gym floor: rubber
  const rubber = tex(128, 6, 10, (gc, S) => {
    gc.fillStyle = "#24232a";
    gc.fillRect(0, 0, S, S);
    for (let i = 0; i < 300; i++) {
      gc.fillStyle = i % 3 ? "#2c2b33" : "#3a3a48";
      gc.fillRect(hash(i, 1, 2, 2) * S, hash(i, 2, 2, 2) * S, 2, 2);
    }
  });
  box(g, X1 - 2, 0.02, 22, new THREE.MeshStandardMaterial({ map: rubber, roughness: 0.95 }), (X1 + 2) / 2, y - 0.005, -11);
  for (let x = 4; x <= 13; x += 3) for (let z = -19; z <= -3; z += 4) box(g, 1.6, 0.02, 0.3, glowMat("#e8f4ff", 1.2), x, y + h - 0.02, z);

  // the glass between spa and gym, a doorway in the middle
  const gp = (z0: number, z1: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(z1 - z0), h), new THREE.MeshStandardMaterial({ color: "#c8d8e0", transparent: true, opacity: 0.22, roughness: 0.3, depthWrite: false }));
    p.rotation.y = Math.PI / 2;
    p.position.set(2, y + h / 2, (z0 + z1) / 2);
    p.raycast = () => {};
    g.add(p);
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1) + 0.01; z += 2) box(g, 0.08, h, 0.08, k.mullion, 2, y, z);
    k.rects[f].push([1.9, Math.min(z0, z1), 2.1, Math.max(z0, z1)]);
  };
  gp(-22, -12.2);
  gp(-9.8, 0);
  box(g, 0.1, h - 2.4, 2.4, k.mullion, 2, y + 2.4, -11);
  k.label(f, "FITNESS  →", 1.9, 2.7, -11, { h: 0.2, color: "#7fe3ff", rot: -Math.PI / 2 });

  // ---- the spa ----
  k.label(f, "BANYAN SPA", X0 + 0.25, 3.3, -16.5, { h: 0.45, color: "#e8c890", rot: Math.PI / 2 });
  k.put(f, "spaDesk", () => H.frontDesk(2.6), -10.6, -14.6, 0);
  void k.person(f, 7400, [-10.6, -15.5], "Receptionist");
  k.hit(f, 2.6, 1.2, 0.9, -10.6, 0, -14.6, "<b>Spa reception</b><span>treatments</span>", () => {
    const p = Market.state.price?.usd;
    const z = (u: number) => (p ? `${(u / p).toFixed(3)} ZEC` : `$${u}`);
    return { eyebrow: "Banyan spa", title: "Treatments", stats: [["Hot stones · 60 min", z(220)], ["Orchard massage · 90 min", z(310)], ["Facial · 45 min", z(160)], ["Sauna & pools", "guests"]] };
  });
  for (const x of [-12.8, -8.4]) k.put(f, `orchidSpa${x}`, () => F.plant("ficus", 90 + x), x, -14.8);
  // three treatment rooms along the north glass
  const wallT = std("#d8c8b0", 0.85);
  for (let i = 0; i < 3; i++) {
    const x0 = -12 + i * 4.2,
      x1 = x0 + 4.2;
    k.partition(f, x0, -17.6, x1, -17.6, wallT, [x0 + 2.8, x0 + 3.8]);
    if (i === 0) k.partition(f, x0, -22, x0, -17.6, wallT);
    k.partition(f, x1, -22, x1, -17.6, wallT);
    const cx = x0 + 1.6;
    k.put(f, "massage", H.massageTable, cx, -19.8);
    box(g, 4.0, 0.012, 4.2, std("#c8b89a", 0.95), x0 + 2.1, y + 0.004, -19.8);
    k.put(f, "candles", () => H.sideTable(true), x0 + 3.6, -21.4, 0, { solid: false });
    k.put(f, `bamboo${i}`, () => F.plant("ficus", 70 + i), x0 + 0.5, -21.4);
    k.label(f, `ROOM ${i + 1}`, x0 + 3.3, 2.5, -17.52, { h: 0.14, color: "#8a6a3a", glow: false });
    void k.person(f, 7410 + i, [cx, -19.3], "Guest", { sit: true, dy: 0.72, face: new THREE.Vector3(1, 0, 0) });
    void k.person(f, 7420 + i, [cx + 1.0, -20.4], "Therapist", { face: new THREE.Vector3(-1, 0, 0) });
  }
  // the sauna in the south-west corner
  const sauna = k.put(f, "sauna", H.sauna, -12.5, -1.6, Math.PI);
  k.label(f, "SAUNA · 85 °C", -12.5, 2.65, -2.92, { h: 0.18, color: "#ffb070", rot: Math.PI });
  k.pickAll(f, sauna, "<b>Sauna</b><span>85 °C</span>", () => ({ eyebrow: "Banyan spa", title: "Sauna", stats: [["Temperature", "85 °C"], ["Humidity", "15%"]] }));
  void k.person(f, 7430, [-12.6, -0.9], "Guest", { sit: true, dy: 0.55, face: new THREE.Vector3(0, 0, -1) });
  // hot and cold pools in stone, steam over the hot one
  const pool = (x: number, z: number, r: number, color: string, emis: string, name: string, temp: string) => {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.25, r + 0.3, 0.45, 40), std("#3a3430", 0.6));
    rim.position.set(x, y + 0.22, z);
    g.add(rim);
    const wt = water(1, 1, color);
    const s = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshStandardMaterial({ map: wt, emissive: emis, emissiveMap: wt, emissiveIntensity: 0.8, roughness: 0.05 }));
    s.rotation.x = -Math.PI / 2;
    s.position.set(x, y + 0.44, z);
    g.add(s);
    k.rects[f].push([x - r - 0.3, z - r - 0.3, x + r + 0.3, z + r + 0.3]);
    k.ticks[f].push((dt) => (wt.offset.x += dt * 0.03));
    k.label(f, name, x, 0.75, z + r + 0.32, { h: 0.14, color: emis === "#ff8a3a" ? "#ffb070" : "#7fe3ff" });
    k.pick(f, s, `<b>${name}</b><span>${temp}</span>`, () => ({ eyebrow: "Banyan spa", title: name, stats: [["Water", temp]] }));
    return s;
  };
  pool(-6.6, -5.2, 1.7, "#2a7a8a", "#ff8a3a", "HOT POOL", "40 °C");
  pool(-2.4, -5.2, 1.2, "#1a8fb8", "#3ac8ff", "COLD PLUNGE", "12 °C");
  void k.person(f, 7440, [-6.9, -5.4], "Guest", { dy: -0.25, face: new THREE.Vector3(0, 0, 1) });
  void k.person(f, 7441, [-6.0, -4.8], "Guest", { dy: -0.25, face: new THREE.Vector3(-1, 0, 0.4) });
  const steam = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Array(180).fill(0), 3)), new THREE.PointsMaterial({ color: "#ffffff", size: 0.12, transparent: true, opacity: 0.25, depthWrite: false }));
  steam.frustumCulled = false;
  g.add(steam);
  k.ticks[f].push((_, t) => {
    const pos = steam.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 60; i++) {
      const a = hash(i, 1, 4) * Math.PI * 2,
        r = hash(i, 2, 4) * 1.5,
        q = (t * 0.25 + hash(i, 3, 4)) % 1;
      pos.setXYZ(i, -6.6 + Math.cos(a) * r + Math.sin(t + i) * 0.1, y + 0.5 + q * 1.6, -5.2 + Math.sin(a) * r);
    }
    pos.needsUpdate = true;
  });
  // relaxation: loungers on a teak deck by the south glass
  box(g, 7, 0.03, 2.6, new THREE.MeshStandardMaterial({ map: boards("#9a6a40", "#8a5e38", 3, 2), roughness: 0.7 }), -4.6, y, -1.5);
  for (let i = 0; i < 3; i++) k.put(f, "teakL", () => H.teakLounger(["#f2eee6", "#e8c890", "#c8d8c0"][i]), -7.0 + i * 2.2, -1.5, Math.PI);
  void k.person(f, 7450, [-4.8, -1.4], "Guest", { sit: true, dy: 0.4, face: new THREE.Vector3(0, 0, 1) });
  k.put(f, "spaTree", () => F.indoorTree(21), 0.6, -2.0);
  k.put(f, "spaTree2", () => F.indoorTree(22), 0.6, -15.4);
  k.sconces(f, [X0 + 0.15, -21], [X0 + 0.15, -16], 2, Math.PI / 2, 2.4, "#ffc890");

  // ---- the gym ----
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.6), new THREE.MeshStandardMaterial({ color: "#9aa6b6", roughness: 0.12, metalness: 0.85, emissive: "#202838", emissiveIntensity: 0.6 }));
  mirror.position.set(8.4, y + 1.6, -21.7);
  g.add(mirror);
  box(g, 12.2, 2.8, 0.1, k.dark, 8.4, y + 0.2, -21.8);
  k.label(f, "FITNESS · 24 H", 8.4, 3.5, -21.68, { h: 0.36, color: "#7fe3ff" });
  for (let i = 0; i < 6; i++) {
    const z = -3 - i * 2.4;
    const tm = k.put(f, "treadmill", F.treadmill, 13.4, z, -Math.PI / 2);
    if (i % 2 === 0 || i === 3) void k.person(f, 7500 + i, [13.2, z], "Runner", { face: new THREE.Vector3(1, 0, 0), dy: 0.17, bob: 9 });
    k.pickAll(f, tm, "<b>Treadmill</b><span>block pace</span>", () => {
      const n = Market.state.network;
      return { eyebrow: "Fitness · treadmill", title: n ? `${n.avg_block_time.toFixed(1)} s a block` : "…", stats: n ? [["Txs 24h", num(n.txs_24h)], ["Shielded 24h", `${(n.shielded_tx_ratio_24h * 100).toFixed(1)}%`]] : undefined };
    });
  }
  for (let i = 0; i < 4; i++) {
    const bike = k.put(f, "bike", F.exerciseBike, 4.4 + i * 1.4, -19.6, 0);
    k.pickAll(f, bike, "<b>Bike</b><span>network hashrate</span>", () => {
      const n = Market.state.network;
      return { eyebrow: "Fitness · bike", title: n ? `${(n.solps / 1e9).toFixed(2)} GSol/s` : "…", stats: n ? [["Difficulty", num(Math.round(n.difficulty))], ["Block time", `${n.avg_block_time.toFixed(1)} s`]] : undefined };
    });
  }
  void k.person(f, 7510, [5.8, -19.2], "Runner", { face: new THREE.Vector3(0, 0, -1), dy: 0.45, bob: 6, sit: true });
  k.put(f, "rack", F.dumbbellRack, 9.6, -21.2, 0);
  k.put(f, "wbench", F.weightBench, 5.0, -14.6, 0);
  k.put(f, "wbench", F.weightBench, 8.0, -14.6, 0);
  void k.person(f, 7520, [5.0, -13.4], "Runner", { face: new THREE.Vector3(0, 0, -1) });
  // the punching bag
  const bag = new THREE.Group();
  bag.position.set(7.5, y + h - 0.05, -7.5);
  const sack = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.2, 16), std("#b0302a", 0.7));
  sack.position.y = -h + 1.4;
  bag.add(sack);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, h - 2, 6), k.chrome);
  chain.position.y = -(h - 2) / 2;
  bag.add(chain);
  g.add(bag);
  k.rects[f].push([7.1, -7.9, 7.9, -7.1]);
  let swing = 0,
    hits = 0;
  k.ticks[f].push((dt, t) => {
    swing *= Math.pow(0.25, dt);
    bag.rotation.x = Math.sin(t * 5) * swing;
  });
  k.pick(f, sack, "<b>Punching bag</b><span>hit</span>", () => {
    swing = Math.min(0.6, swing + 0.35);
    return { eyebrow: "Fitness · boxing", title: `${++hits} hit${hits > 1 ? "s" : ""}` };
  });
  for (let i = 0; i < 3; i++) box(g, 1.8, 0.02, 0.7, std(["#3ee08f", "#b07bff", "#3ef0ff"][i], 0.9), 5 + i * 2.2, y, -1.6);
  void k.person(f, 7530, [7.2, -1.6], "Guest", { face: new THREE.Vector3(0, 0, 1), sit: true, dy: 0.05 });
  // the network board
  const board = k.screen(f, 3.2, 1.6, (gc, W, Hh) => {
    const n = Market.state.network;
    gc.fillStyle = "#04101a";
    gc.fillRect(0, 0, W, Hh);
    gc.fillStyle = "#7fe3ff";
    gc.font = '700 28px "JetBrains Mono", monospace';
    fitText(gc, "ZCASH NETWORK", 22, 42);
    const rows: [string, string][] = [
      ["HASHRATE", n ? `${(n.solps / 1e9).toFixed(2)} GSol/s` : "…"],
      ["BLOCK TIME", n ? `${n.avg_block_time.toFixed(1)} s` : "…"],
      ["TXS 24H", n ? num(n.txs_24h) : "…"],
      ["BLOCK", k.height ? num(k.height) : "…"],
    ];
    rows.forEach(([a, b], i) => {
      gc.fillStyle = "#8aa0b0";
      gc.font = '600 22px "JetBrains Mono", monospace';
      gc.fillText(a, 22, 92 + i * 42);
      gc.fillStyle = "#e9f4ff";
      gc.font = '700 26px "JetBrains Mono", monospace';
      fitText(gc, b, 230, 92 + i * 42);
    });
  }, 10);
  board.position.set(2.12, y + 2.3, -16.5);
  board.rotation.y = Math.PI / 2;
  box(g, 0.4, 1.2, 0.4, std("#d8e8f0", 0.4), 3.0, y, -21.4);
  k.rects[f].push([2.8, -21.6, 3.2, -21.2]);
  k.put(f, "plantGym", () => F.plant("monstera", 31), 14.2, -21.2);
  void makeCanvas;
  k.light(f, -6, -19.5, "#ffc890", 7, -0.4);
  k.light(f, -6, -5, "#ffb070", 9, -0.6);
  k.light(f, -11, -10, "#ffd8a8", 6, -0.4);
  k.light(f, 9, -15, "#f0fff4", 9, -0.4);
  k.light(f, 9, -5, "#e8f4ff", 8, -0.4);
}
