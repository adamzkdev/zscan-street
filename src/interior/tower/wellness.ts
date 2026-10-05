import * as THREE from "three";
import { Market } from "../../data/market";
import { fitText } from "../../scene/fit";
import { hash } from "../../scene/voxel/model";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import { LEVELS, TowerKit, X0, Z0, makeCanvas } from "./kit";
import { water } from "./lobby";

/** 4 — the gym: treadmills with runners, bikes at the network's hashrate, weights, the bag. */
export function gym(k: TowerKit) {
  const f = 4,
    g = k.groups[f],
    y = LEVELS[f].y;
  const rubber = makeCanvas(128, 128, (gc) => {
    gc.fillStyle = "#24232a";
    gc.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 300; i++) {
      gc.fillStyle = i % 3 ? "#2c2b33" : "#3a3a48";
      gc.fillRect(hash(i, 1, 2, 2) * 128, hash(i, 2, 2, 2) * 128, 2, 2);
    }
  }).t;
  rubber.wrapS = rubber.wrapT = THREE.RepeatWrapping;
  rubber.repeat.set(12, 9);
  k.shell(f, new THREE.MeshStandardMaterial({ map: rubber, roughness: 0.95 }), std("#4a4852", 0.95));
  k.elevators(f);
  k.label(f, "GYM · ジム", 0, 3.4, -0.25, { h: 0.42, color: "#3ee08f", rot: Math.PI });
  // the mirror wall to the north
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshStandardMaterial({ color: "#9aa6b6", roughness: 0.12, metalness: 0.85, emissive: "#202838", emissiveIntensity: 0.6 }));
  mirror.position.set(-1, y + 1.6, Z0 + 0.3);
  g.add(mirror);
  box(g, 14.2, 2.8, 0.1, k.dark, -1, y + 0.2, Z0 + 0.22);
  // treadmills along the east glass, runners on them
  for (let i = 0; i < 4; i++) {
    const z = -3 - i * 2.2;
    k.put(f, "treadmill", F.treadmill, 10, z, -Math.PI / 2);
    if (i !== 2) void k.person(f, 900 + i, [9.8, z], "Runner", { face: new THREE.Vector3(1, 0, 0), dy: 0.17, bob: 9 });
  }
  k.label(f, "CARDIO", 11.8, 3.0, -6, { h: 0.26, color: "#3ee08f", rot: -Math.PI / 2 });
  // bikes: pedal at the network's hashrate
  for (let i = 0; i < 4; i++) {
    const x = 3.4 + i * 1.5;
    const bike = k.put(f, "bike", F.exerciseBike, x, -15.4, 0);
    bike.traverse((o) =>
      o instanceof THREE.Mesh &&
      k.pick(f, o, "<b>Bike</b><span>pedal at the network's hashrate</span>", () => {
        const n = Market.state.network;
        return { eyebrow: "Gym · bike", title: n ? `${(n.solps / 1e9).toFixed(2)} GSol/s 🚴` : "Warming up…", body: n ? `<p>That's how hard the whole Zcash network pedals right now: ${(n.solps / 1e9).toFixed(2)} billion Equihash solutions a second, a block every ~${n.avg_block_time.toFixed(0)} s.</p>` : undefined };
      }),
    );
  }
  void k.person(f, 950, [4.9, -15.0], "Runner", { face: new THREE.Vector3(0, 0, -1), dy: 0.45, bob: 6, sit: true });
  // free weights: a rack, two benches, a lifter
  k.put(f, "rack", F.dumbbellRack, -6, -17.2, 0);
  k.put(f, "bench", F.weightBench, -7, -13.6, 0);
  k.put(f, "bench", F.weightBench, -4, -13.6, 0);
  void k.person(f, 960, [-7, -12.4], "Runner", { face: new THREE.Vector3(0, 0, -1) });
  // the punching bag: hit it
  const bag = new THREE.Group();
  bag.position.set(-2, y + 3.95, -9.5);
  const sack = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.2, 16), std("#b0302a", 0.7));
  sack.position.y = -2.2;
  bag.add(sack);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 6), k.chrome);
  chain.position.y = -0.8;
  bag.add(chain);
  g.add(bag);
  k.rects[f].push([-2.4, -9.9, -1.6, -9.1]);
  let swing = 0,
    hits = 0;
  k.ticks[f].push((dt, t) => {
    swing *= Math.pow(0.25, dt);
    bag.rotation.x = Math.sin(t * 5) * swing;
  });
  k.pick(f, sack, "<b>Punching bag</b><span>hit it</span>", () => {
    swing = Math.min(0.6, swing + 0.35);
    hits++;
    return { eyebrow: "Gym · boxing", title: `${hits} hit${hits > 1 ? "s" : ""} 🥊`, body: hits % 10 === 0 ? "<p>Ten more and you can carry a limousine's parcel.</p>" : undefined };
  });
  // yoga by the south glass, lockers by the core, a water cooler, plants
  for (let i = 0; i < 3; i++) box(g, 1.8, 0.02, 0.7, std(["#3ee08f", "#b07bff", "#3ef0ff"][i], 0.9), -1 + i * 2.2, y, -1.6);
  void k.person(f, 970, [1.2, -1.6], "Guest", { face: new THREE.Vector3(0, 0, -1), sit: true, dy: 0.05 });
  for (let i = 0; i < 4; i++) k.put(f, "locker", () => F.wardrobe("#3a5a6a"), X0 + 0.6, -1.6 - i * 1.4, Math.PI / 2);
  box(g, 0.4, 1.2, 0.4, std("#d8e8f0", 0.4), 2.5, y, -16.9);
  k.rects[f].push([2.2, -17.2, 2.8, -16.6]);
  k.put(f, "plantGym", () => F.plant("ficus", 31), 11, -16.8);
  k.put(f, "plantGym2", () => F.plant("monstera", 32), -10.6, -16.8);
  k.light(f, -3, -8, "#f0fff4", 9);
  k.light(f, 8, -6, "#f0fff4", 8);
  k.light(f, 5, -15, "#e8f4ff", 6);
  k.light(f, -6, -15, "#e8f4ff", 6);
}

/** 5 — the pool: an infinity pool in three lanes (Sapling, Orchard, Ironwood), jacuzzi, loungers. */
export function pool(k: TowerKit) {
  const f = 5,
    g = k.groups[f],
    y = LEVELS[f].y;
  const deck = makeCanvas(128, 128, (gc) => {
    gc.fillStyle = "#cfc4b0";
    gc.fillRect(0, 0, 128, 128);
    gc.fillStyle = "#bdb19c";
    for (let i = 0; i < 128; i += 16) gc.fillRect(0, i, 128, 2);
  }).t;
  deck.wrapS = deck.wrapT = THREE.RepeatWrapping;
  deck.repeat.set(10, 8);
  k.shell(f, new THREE.MeshStandardMaterial({ map: deck, roughness: 0.6 }), std("#1a2a3a", 0.9), { panels: "#cfeaff" });
  k.elevators(f);
  k.label(f, "INFINITY POOL · プール", 0, 3.8, -0.25, { h: 0.42, color: "#7fe3ff", rot: Math.PI });
  const PX0 = -7,
    PX1 = 10,
    PZ0 = -16.8,
    PZ1 = -8.2;
  const wt = water();
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(PX1 - PX0, PZ1 - PZ0, 24, 12), new THREE.MeshStandardMaterial({ map: wt, emissive: "#1a7ab0", emissiveMap: wt, emissiveIntensity: 0.55, roughness: 0.35, transparent: true, opacity: 0.92 }));
  surface.rotation.x = -Math.PI / 2;
  surface.position.set((PX0 + PX1) / 2, y + 0.08, (PZ0 + PZ1) / 2);
  g.add(surface);
  box(g, PX1 - PX0 + 0.4, 0.14, 0.24, std("#e8e2d4", 0.5), (PX0 + PX1) / 2, y, PZ1 + 0.1);
  box(g, 0.24, 0.14, PZ1 - PZ0, std("#e8e2d4", 0.5), PX0 - 0.1, y, (PZ0 + PZ1) / 2);
  k.rects[f].push([PX0, PZ0 - 1.2, PX1, PZ1]);
  const base = (surface.geometry.attributes.position as THREE.BufferAttribute).array.slice();
  k.ticks[f].push((dt, t) => {
    wt.offset.x += dt * 0.02;
    wt.offset.y += dt * 0.013;
    const pos = surface.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, base[i * 3 + 2] + Math.sin(base[i * 3] * 1.3 + t * 1.6) * 0.018 + Math.cos(base[i * 3 + 1] * 1.7 + t * 1.2) * 0.018);
    pos.needsUpdate = true;
  });
  const LANES: { key: "sapling" | "orchard" | "ironwood"; name: string; color: string }[] = [
    { key: "sapling", name: "SAPLING", color: "#2a78d6" },
    { key: "orchard", name: "ORCHARD", color: "#eb6834" },
    { key: "ironwood", name: "IRONWOOD", color: "#1baf7a" },
  ];
  const laneW = (PZ1 - PZ0) / 3;
  LANES.forEach((ln, i) => {
    const zc = PZ0 + laneW * (i + 0.5);
    if (i)
      for (let x = PX0 + 0.3; x < PX1; x += 0.35) {
        const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), std(ln.color, 0.5));
        buoy.position.set(x, y + 0.1, PZ0 + laneW * i);
        g.add(buoy);
      }
    const tag = k.label(f, ln.name, PX1 + 0.5, 0.02, zc, { h: 0.3, color: ln.color });
    tag.rotation.x = -Math.PI / 2;
    tag.rotation.z = Math.PI / 2;
    const hit = new THREE.Mesh(new THREE.PlaneGeometry(PX1 - PX0, laneW), new THREE.MeshBasicMaterial({ visible: false }));
    hit.rotation.x = -Math.PI / 2;
    hit.position.set((PX0 + PX1) / 2, y + 0.1, zc);
    g.add(hit);
    k.pick(f, hit, `<b>${ln.name} lane</b><span>the ${ln.name.toLowerCase()} pool, live</span>`, () => {
      const p = Market.state.pools;
      const v = p ? p.pools[ln.key] / 1e8 : null;
      return { eyebrow: "Infinity pool · lane", title: `${ln.name} pool`, stats: v != null && p ? [["In the pool", `${Math.round(v).toLocaleString("en-US")} ZEC`], ["Of shielded", `${((p.pools[ln.key] / p.shielded) * 100).toFixed(1)}%`]] : undefined, body: "<p>Each lane is one of Zcash's shielded pools, at its real size right now.</p>" };
    });
  });
  const board = k.screen(f, 3.4, 1.4, (gc, W, H) => {
    const p = Market.state.pools;
    gc.fillStyle = "#04101a";
    gc.fillRect(0, 0, W, H);
    gc.fillStyle = "#7fe3ff";
    gc.font = '700 26px "JetBrains Mono", monospace';
    fitText(gc, "SHIELDED POOLS · LIVE", 20, 38);
    LANES.forEach((ln, i) => {
      gc.fillStyle = ln.color;
      gc.font = '700 24px "JetBrains Mono", monospace';
      gc.fillText(ln.name, 20, 82 + i * 46);
      gc.fillStyle = "#e9eef7";
      fitText(gc, p ? `${Math.round(p.pools[ln.key] / 1e8).toLocaleString("en-US")} ZEC` : "…", 220, 82 + i * 46);
    });
  }, 20);
  board.position.set(X0 + 0.22, y + 2.2, -14);
  board.rotation.y = Math.PI / 2;
  [[-3, 0], [3, 1], [6, 2]].forEach(([x, i]) => {
    void k.person(f, 1200 + i, [x, PZ0 + laneW * (i + 0.5)], "Swimmer", { face: new THREE.Vector3(1, 0, 0), dy: -0.55 }).then((s) => {
      if (s) k.ticks[f].push((_, t) => (s.root.position.x = PX0 + 1 + ((x - PX0 + t * (0.5 + i * 0.15)) % (PX1 - PX0 - 2))));
    });
  });
  // the jacuzzi with its bubbles
  const jac = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.5, 32), std("#e8e2d4", 0.5));
  jac.position.set(-9.2, y + 0.25, -4.5);
  g.add(jac);
  const jw = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), new THREE.MeshStandardMaterial({ map: water(), emissive: "#2a9ad0", emissiveIntensity: 0.6, transparent: true, opacity: 0.9 }));
  jw.rotation.x = -Math.PI / 2;
  jw.position.set(-9.2, y + 0.46, -4.5);
  g.add(jw);
  const bubbles = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Array(120).fill(0), 3)), new THREE.PointsMaterial({ color: "#e8fbff", size: 0.05, transparent: true, opacity: 0.8 }));
  bubbles.frustumCulled = false;
  g.add(bubbles);
  k.ticks[f].push((_, t) => {
    const pos = bubbles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 40; i++) {
      const a = hash(i, 1, 1, 1) * Math.PI * 2,
        r = hash(i, 2, 1, 1) * 1.05;
      pos.setXYZ(i, -9.2 + Math.cos(a) * r, y + 0.47 + ((t * 0.4 + hash(i, 3, 1, 1)) % 1) * 0.08, -4.5 + Math.sin(a) * r);
    }
    pos.needsUpdate = true;
  });
  k.rects[f].push([-10.6, -5.9, -7.8, -3.1]);
  k.label(f, "JACUZZI", -9.2, 1.7, -3.1, { h: 0.22, color: "#7fe3ff", rot: Math.PI });
  void k.person(f, 1500, [-9.2, -4.5], "Guest", { dy: -0.2, face: new THREE.Vector3(1, 0, 0) });
  // loungers under parasols, towels, plants, a juice bar
  for (let i = 0; i < 4; i++) {
    const x = -3 + i * 3;
    k.put(f, `lounger${i % 2}`, () => F.lounger(i % 2 ? "#eb6834" : "#2a78d6"), x, -4.6, Math.PI);
    if (i % 2 === 0) k.put(f, `umb${i}`, () => F.umbrella(i ? "#eb6834" : "#2a78d6"), x + 1.5, -4.8, 0, { solid: false });
  }
  void k.person(f, 1600, [3, -4.4], "Guest", { dy: 0.4, face: new THREE.Vector3(0, 0, -1), sit: true });
  k.put(f, "juiceBar", () => F.barCounter(2.4, "#7fe3ff"), 9.6, -1.4, Math.PI);
  k.label(f, "JUICE BAR", 9.6, 2.4, -0.2, { h: 0.24, color: "#7fe3ff", rot: Math.PI });
  for (const [i, [x, z]] of ([[11, -6.6], [-10.6, -16.8], [-10.6, -1.2]] as [number, number][]).entries()) k.put(f, `plantP${i}`, () => F.plant((["monstera", "ficus", "monstera"] as const)[i], 40 + i), x, z);
  box(g, 6, 0.02, 0.05, glowMat("#7fe3ff", 1.2), (PX0 + PX1) / 2, y + 0.03, PZ1 + 0.24);
  k.light(f, 0, -12.5, "#7fd8ff", 10);
  k.light(f, 6, -12.5, "#7fd8ff", 8);
  k.light(f, -3, -4, "#ffe6c8", 7);
  k.light(f, -9, -4.5, "#a0e0ff", 6);
}
