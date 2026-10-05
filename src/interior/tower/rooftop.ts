import * as THREE from "three";
import * as F from "../furniture";
import { box, glowMat, std, textPlane } from "../kit";
import { LEVELS, TowerKit, X0, Z0, makeCanvas } from "./kit";

/** R — the rooftop: deck, gardens, the sky bar, loungers, a telescope, the helipad, fireworks. */
export function rooftop(k: TowerKit) {
  const f = LEVELS.length - 1,
    g = k.groups[f],
    y = LEVELS[f].y;
  const boards = makeCanvas(128, 128, (gc) => {
    gc.fillStyle = "#6a4a32";
    gc.fillRect(0, 0, 128, 128);
    gc.fillStyle = "#5a3e2a";
    for (let i = 0; i < 128; i += 16) gc.fillRect(0, i, 128, 2);
  }).t;
  boards.wrapS = boards.wrapT = THREE.RepeatWrapping;
  boards.repeat.set(12, 9);
  k.shell(f, new THREE.MeshStandardMaterial({ map: boards, roughness: 0.8 }), null);
  // the elevator kiosk on the core
  box(g, 2.4, 3, 5.6, std("#2e2a36", 0.8), X0 + 1.2, y, -9);
  k.rects[f].push([X0, -11.8, X0 + 2.5, -6.2]);
  const doors = box(g, 0.1, 2.3, 1.4, k.chrome, X0 + 2.45, y, -9);
  box(g, 0.05, 0.14, 0.6, glowMat("#ff9f2e", 1.6), X0 + 2.5, y + 2.6, -9);
  k.pick(f, doors, "<b>Elevator down</b><span>to the residences</span>", () => ({ eyebrow: "Elevator", title: LEVELS[f - 1].name, floor: f - 1 }));
  k.label(f, `▼ ${LEVELS[f - 1].label} · RESIDENCES`, X0 + 2.52, 2.85, -9, { h: 0.18, color: "#ff9f2e", rot: Math.PI / 2 });
  k.label(f, "ZK TOWER · 秘密マンション", 0, 2.2, Z0 + 0.4, { h: 1.0, color: "#3ef0ff" });
  // the helipad
  const pad = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40), std("#2a2a32", 0.8));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(6.5, y + 0.02, -12);
  g.add(pad);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.15, 40), glowMat("#f4b728", 1.2));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(6.5, y + 0.03, -12);
  g.add(ring);
  const Zmark = textPlane("ⓩ", { h: 3, color: "#f4b728", glow: true });
  Zmark.rotation.x = -Math.PI / 2;
  Zmark.position.set(6.5, y + 0.04, -12);
  g.add(Zmark);
  // garden beds of ficus and monstera
  for (const [i, [x, z]] of ([[-6, -16.4], [-2, -16.4], [10.6, -3], [-6, -1.6]] as [number, number][]).entries()) {
    box(g, 2.8, 0.5, 1.2, std("#3a3036", 0.8), x, y, z);
    box(g, 2.6, 0.08, 1.0, std("#3a5a2a", 0.95), x, y + 0.5, z);
    k.put(f, `rplant${i}`, () => F.plant("ficus", 60 + i), x - 0.7, z, 0, { dy: 0.5, solid: false });
    k.put(f, `rplant${i}b`, () => F.plant("monstera", 70 + i), x + 0.7, z, 0, { dy: 0.5, solid: false });
    k.rects[f].push([x - 1.4, z - 0.6, x + 1.4, z + 0.6]);
  }
  // the sky bar: counter, lit back bar, stools, the bartender
  const BZ = -12.5;
  k.put(f, "skyBar", () => F.barCounter(4, "#ff3e8a"), -3, BZ, 0);
  k.put(f, "backBar", () => F.backBar(4), -3, BZ - 1.3, 0);
  for (let i = 0; i < 4; i++) k.put(f, "stoolPink", () => F.stool("#ff3e8a"), -4.4 + i * 0.95, BZ + 0.9, 0, { solid: false });
  k.label(f, "SKY BAR · 空", -3, 3.0, BZ - 1.0, { h: 0.4, color: "#ff3e8a" });
  void k.person(f, 4444, [-3, BZ - 0.8], "Bartender");
  const bar = new THREE.Mesh(new THREE.BoxGeometry(4, 1.1, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
  bar.position.set(-3, y + 0.55, BZ);
  g.add(bar);
  const drinks = ["a Shielded Sour", "an Orchard Spritz", "a Halving Highball", "an Ironwood Negroni", "a Nullifier, neat"];
  let served = 0;
  k.pick(f, bar, "<b>Sky bar</b><span>order a drink</span>", () => ({ eyebrow: "Sky bar", title: `Here's ${drinks[served++ % drinks.length]} 🍸`, body: "<p>On the house. Watch the sky: every new block lights it up.</p>" }));
  void k.person(f, 1357, [-2, BZ + 1.0], "Guest", { face: new THREE.Vector3(0, 0, -1), sit: true, dy: 0.7 });
  // loungers and parasols, string lights over the deck
  for (let i = 0; i < 3; i++) k.put(f, "rLounger", () => F.lounger("#3ef0ff"), 1 + i * 1.6, -3, Math.PI);
  k.put(f, "rUmb", () => F.umbrella("#ff3e8a"), 3.4, -4.6, 0, { solid: false });
  void k.person(f, 2468, [2.6, -3], "Guest", { dy: 0.4, sit: true, face: new THREE.Vector3(0, 0, -1) });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), glowMat("#ffd8a0", 1.8), 80);
  for (let i = 0; i < 80; i++) {
    const t = (i % 40) / 39,
      line = Math.floor(i / 40);
    const m = new THREE.Matrix4().makeTranslation(-10 + t * 20, y + 3.2 - Math.sin(t * Math.PI) * 0.5, line ? -6 : -13.5);
    bulbs.setMatrixAt(i, m);
  }
  g.add(bulbs);
  for (const [x, z] of [[-10, -6], [10, -6], [-10, -13.5], [10, -13.5]] as [number, number][]) box(g, 0.08, 3.3, 0.08, k.dark, x, y, z);
  // the telescope in the north-east corner
  const scope = new THREE.Group();
  scope.position.set(10.4, y, -16.6);
  box(scope, 0.06, 1.2, 0.06, k.chrome, 0, 0, 0);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.9, 12), std("#d8d8e0", 0.3, 0.7));
  tube.rotation.x = Math.PI / 2.6;
  tube.position.set(0, 1.35, 0.1);
  scope.add(tube);
  g.add(scope);
  k.rects[f].push([10, -17, 10.8, -16.2]);
  k.pick(f, tube, "<b>Telescope</b><span>look at the chain</span>", () => {
    const last = k.ctx.director.lastBlockTime;
    const s = last ? Math.round((Date.now() - last) / 1000) : null;
    return { eyebrow: "Telescope", title: s != null ? `Next block in ~${Math.max(0, 75 - s)} s` : "Scanning the sky…", body: `<p>${k.ctx.director.mempoolList().length} transactions waiting at the MEMPOOL. When their bus leaves, the sky lights up.</p>` };
  });
  // fireworks: a burst for every new block, a small one now and then while you're up here
  const N = 240;
  const fw = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Array(N * 3).fill(0), 3)).setAttribute("color", new THREE.Float32BufferAttribute(new Array(N * 3).fill(1), 3)), new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  fw.frustumCulled = false;
  g.add(fw);
  const parts: { p: THREE.Vector3; v: THREE.Vector3; life: number; c: THREE.Color }[] = [];
  const burst = (big: boolean) => {
    const c = new THREE.Vector3((Math.random() - 0.5) * 30, y + 14 + Math.random() * 8, -30 - Math.random() * 10);
    const col = new THREE.Color(["#f4b728", "#3ef0ff", "#ff3e8a", "#3ee08f"][Math.floor(Math.random() * 4)]);
    for (let i = 0; i < (big ? 90 : 45); i++) {
      if (parts.length >= N) parts.shift();
      parts.push({ p: c.clone(), v: new THREE.Vector3().randomDirection().multiplyScalar(4 + Math.random() * 4), life: 1.6 + Math.random() * 0.6, c: col });
    }
  };
  k.ctx.onBlock(() => {
    burst(true);
    setTimeout(() => burst(true), 400);
    setTimeout(() => burst(false), 900);
  });
  let idle = 4;
  k.ticks[f].push((dt) => {
    idle -= dt;
    if (idle < 0) {
      idle = 10 + Math.random() * 10;
      burst(false);
    }
    const pos = fw.geometry.attributes.position as THREE.BufferAttribute;
    const ca = fw.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      const q = parts[i];
      if (!q || q.life <= 0) {
        pos.setXYZ(i, 0, -999, 0);
        continue;
      }
      q.life -= dt;
      q.v.y -= 3 * dt;
      q.p.addScaledVector(q.v, dt);
      pos.setXYZ(i, q.p.x, q.p.y, q.p.z);
      const kk = Math.min(1, q.life);
      ca.setXYZ(i, q.c.r * kk, q.c.g * kk, q.c.b * kk);
    }
    pos.needsUpdate = true;
    ca.needsUpdate = true;
  });
  k.light(f, -3, BZ, "#ff7ab0", 8, 3);
  k.light(f, 6.5, -12, "#ffd28a", 6, 3);
  k.light(f, 2, -3, "#ffe6c8", 5, 3);
  k.light(f, -4, -16, "#a0ffc8", 4, 3);
}
