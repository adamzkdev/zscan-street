import * as THREE from "three";
import { Market } from "../../data/market";
import { hash } from "../../scene/voxel/model";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import * as H from "./furniture";
import { soloist } from "../music/acts";
import { HotelKit, LEVELS, LIFT_Z, boards, num, usd, water } from "./kit";

/** 57 — the SkyPark: the infinity pool along the edge, palms, loungers and cabanas, the bar, and the
 *  observation deck in the bow; fireworks over the bay on every block. */
export function skypark(k: HotelKit) {
  const f = LEVELS.length - 1,
    g = k.groups[f],
    y = LEVELS[f].y,
    { x0: X0, x1: X1 } = LEVELS[f];
  const teak = new THREE.MeshStandardMaterial({ map: boards("#8a6040", "#7e5638", 30, 9), roughness: 0.75 });
  k.shell(f, teak, null, { open: "es", noFloor: true });
  // the deck, around the pool's opening (x −26…26, z −6.6…0)
  box(g, X1 - X0, 0.2, 11.4, teak, 0, y - 0.2, -12.3);
  for (const [a, b] of [[X0, -26], [26, X1]]) box(g, b - a, 0.2, 6.6, teak, (a + b) / 2, y - 0.2, -3.3);
  // the edge of the slab, south
  box(g, X1 - X0, 0.6, 0.3, std("#e8e4dc", 0.6), 0, y - 0.6, 0.15);

  // the lift house on the stern
  const LX = LEVELS[f].lx!;
  box(g, LX - X0, 3.4, 9, std("#e8e4dc", 0.6), (X0 + LX) / 2, y, LIFT_Z);
  box(g, LX - X0 + 0.4, 0.2, 9.4, std("#2a2830", 0.6), (X0 + LX) / 2, y + 3.4, LIFT_Z);
  k.rects[f].push([X0, LIFT_Z - 4.5, LX, LIFT_Z + 4.5]);
  k.lifts(f);
  k.label(f, "SKYPARK · 57", LX + 0.03, 3.0, LIFT_Z + 3.4, { h: 0.3, color: "#f4b728", rot: Math.PI / 2 });

  // ---- the infinity pool: 52 m of glowing water to the very edge ----
  const PX0 = -26,
    PX1 = 26,
    PZ0 = -6.6,
    PZ1 = -0.02;
  box(g, PX1 - PX0, 1.4, PZ1 - PZ0, std("#0e3a4a", 0.4), 0, y - 1.5, (PZ0 + PZ1) / 2);
  const wt = water(26, 3, "#1aa0c8");
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(PX1 - PX0, PZ1 - PZ0, 60, 8), new THREE.MeshStandardMaterial({ map: wt, emissive: "#1a9ad0", emissiveMap: wt, emissiveIntensity: 0.75, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.93 }));
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(0, y - 0.06, (PZ0 + PZ1) / 2);
  g.add(surface);
  const base = (surface.geometry.attributes.position as THREE.BufferAttribute).array.slice();
  k.ticks[f].push((dt, t) => {
    wt.offset.x += dt * 0.015;
    wt.offset.y += dt * 0.01;
    const pos = surface.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, base[i * 3 + 2] + Math.sin(base[i * 3] * 0.9 + t * 1.4) * 0.02 + Math.cos(base[i * 3 + 1] * 1.6 + t * 1.1) * 0.02);
    pos.needsUpdate = true;
  });
  // the coping on the deck side, the overflow lip at the edge (lit), the pool lights
  box(g, PX1 - PX0 + 0.3, 0.06, 0.3, std("#f2eee6", 0.4), 0, y - 0.04, PZ0 - 0.15);
  box(g, PX1 - PX0, 0.03, 0.04, glowMat("#9ff0ff", 1.8), 0, y - 0.08, PZ1);
  box(g, PX1 - PX0, 0.03, 0.03, glowMat("#3ac8ff", 1.2), 0, y - 0.65, PZ1 + 0.31);
  for (const x of [PX0, PX1]) box(g, 0.3, 0.06, PZ1 - PZ0, std("#f2eee6", 0.4), x, y - 0.04, (PZ0 + PZ1) / 2);
  k.rects[f].push([PX0 - 0.15, PZ0 - 0.3, PX1 + 0.15, 0.4]);
  // the rail at the corners beside the pool
  for (const [a, b] of [[X0, PX0], [PX1, X1]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(b - a, 1.1), k.glass);
    p.position.set((a + b) / 2, y + 0.55, -0.05);
    p.raycast = () => {};
    g.add(p);
    box(g, b - a, 0.06, 0.06, k.chrome, (a + b) / 2, y + 1.1, -0.05);
    k.rects[f].push([a, -0.2, b, 0.4]);
  }
  const POOLS: ["sapling" | "orchard" | "ironwood", string][] = [["orchard", "Orchard"], ["sapling", "Sapling"], ["ironwood", "Ironwood"]];
  k.pick(f, surface, "<b>Infinity pool</b><span>the shielded pools, live</span>", () => {
    const p = Market.state.pools;
    return { eyebrow: "SkyPark · infinity pool", title: p ? `${num(Math.round(p.shielded / 1e8))} ZEC shielded` : "Infinity pool", tag: p ? [`${(p.shielded_ratio * 100).toFixed(1)}% of supply`, "ok"] : undefined, stats: p ? POOLS.map(([kk, n]) => [n, `${num(Math.round(p.pools[kk] / 1e8))} ZEC`] as [string, string]).concat([["Transparent", `${num(Math.round(p.pools.transparent / 1e8))} ZEC`]]) : [["Length", "52 m"], ["Height", "57 floors"]] };
  });
  // swimmers doing lengths, others leaning on the edge looking at the city
  [[-18, -4.8, 0.5], [-4, -2.8, 0.35], [8, -5.2, 0.6], [20, -3.6, 0.45]].forEach(([x0, z, sp], i) =>
    void k.person(f, 7800 + i, [x0, z], "Swimmer", { dy: -0.62, face: new THREE.Vector3(i % 2 ? -1 : 1, 0, 0), swim: (s, t) => {
      const L = PX1 - PX0 - 3;
      const q = (((x0 - PX0 + t * sp) % (2 * L)) + 2 * L) % (2 * L);
      const fw = q < L;
      s.root.position.x = PX0 + 1.5 + (fw ? q : 2 * L - q);
      s.root.position.y = y - 0.62 + Math.sin(t * 3 + i) * 0.04;
      s.faceDir = new THREE.Vector3(fw ? 1 : -1, 0, 0);
    } }),
  );
  for (const [i, x] of [-12, -10.8, 2.5, 14, 22].entries()) void k.person(f, 7810 + i, [x, -0.7], "Guest", { dy: -0.55, face: new THREE.Vector3(0, 0, 1), bob: 1.2 });

  // ---- the deck: loungers and parasols along the pool ----
  for (let i = 0; i < 20; i++) {
    const x = -23 + i * 2.4;
    if (Math.abs(x) < 1.5) continue;
    k.put(f, `skyL${i % 3}`, () => H.teakLounger(["#f4b728", "#f2eee6", "#3ac8ff"][i % 3]), x, -8.6, Math.PI);
    if (i % 3 === 1) k.put(f, "parasol", () => F.umbrella("#f2eee6"), x + 1.2, -9.4, 0, { solid: false });
    if (i % 4 === 2) void k.person(f, 7830 + i, [x, -8.4], "Guest", { sit: true, dy: 0.4, face: new THREE.Vector3(0, 0, 1) });
  }
  void k.person(f, 7860, [1, -7.6], "Lifeguard", { face: new THREE.Vector3(0, 0, 1) });
  box(g, 0.8, 1.6, 0.8, std("#f2eee6", 0.5), 1, y, -8.6);
  k.rects[f].push([0.6, -9.0, 1.4, -8.2]);

  // palms in planters, cabanas between, a garden along the north rail
  for (let i = 0; i < 9; i++) {
    const x = -22 + i * 5.5;
    if (Math.abs(x) < 4) continue;
    k.put(f, `palm${i % 4}`, () => H.palm(i % 4), x, -12.4);
  }
  for (const [i, x] of [-19.2, -13.7, 13.7, 19.2].entries()) {
    const cab = k.put(f, `cabana${i % 2}`, () => H.cabana(i % 2 ? "#f4b728" : "#2a78d6"), x, -15.4, 0);
    k.pickAll(f, cab, "<b>Cabana</b><span>day rate</span>", () => {
      const p = Market.state.price?.usd;
      return { eyebrow: "SkyPark · cabana", title: `Cabana ${i + 1}`, stats: [["Day rate", p ? `${(600 / p).toFixed(2)} ZEC` : usd(600)], ["In USD", usd(600)], ["Guests", "4"]] };
    });
    if (i % 2 === 0) void k.person(f, 7870 + i, [x, -15.2], "Guest", { sit: true, dy: 0.5, face: new THREE.Vector3(0, 0, 1) });
  }
  for (let x = -24; x <= 26; x += 2) {
    box(g, 2, 0.5, 0.8, std("#e8e4dc", 0.6), x, y, -17.5);
    k.put(f, `hedge${(x / 2) & 3}`, () => F.plant((["ficus", "monstera"] as const)[(x / 2) & 1], 200 + x), x, -17.5, 0, { dy: 0.5, solid: false });
  }
  k.rects[f].push([-25, -18, 27, -17.1]);

  // the SkyPark bar in the middle, string lights over it
  const BZ = -13.2;
  k.put(f, "spBar", () => F.barCounter(6, "#3ac8ff"), 0, BZ, 0);
  k.put(f, "spBack", () => F.backBar(6), 0, BZ - 2.6, 0);
  box(g, 7, 0.15, 3.8, std("#e8e4dc", 0.6), 0, y + 3.0, BZ - 1.2);
  for (const [dx, dz] of [[-3.4, 0.6], [3.4, 0.6], [-3.4, -3], [3.4, -3]]) box(g, 0.12, 3.0, 0.12, std("#e8e4dc", 0.6), dx, y, BZ + dz);
  k.label(f, "SKYPARK BAR", 0, 3.4, BZ + 0.75, { h: 0.45, color: "#3ac8ff" });
  for (let i = 0; i < 6; i++) k.put(f, "stoolSP", () => F.stool("#f2eee6"), -2.5 + i, BZ + 0.9, 0, { solid: false });
  void k.person(f, 7880, [0, BZ - 1.5], "Bartender");
  void k.person(f, 7881, [-1.5, BZ + 0.9], "Guest", { sit: true, dy: 0.7, face: new THREE.Vector3(0, 0, -1) });
  void k.person(f, 7882, [1.5, BZ + 0.9], "Guest", { sit: true, dy: 0.7, face: new THREE.Vector3(0, 0, -1) });
  // a saxophonist by the bar, the pool and the city behind him
  soloist(g, "sax", { x: 4.4, y, z: -10.9, yaw: -0.3 }, { place: "hotel", floor: f, track: "sax-solo", id: 7885, role: "Saxophonist", level: 0.8 });
  k.rects[f].push([4.0, -11.3, 4.8, -10.5]);
  const drinks = ["a Marina Sling", "a frozen Orchard", "a Shielded Spritz", "a coconut"];
  let served = 0;
  k.hit(f, 6, 1.1, 0.9, 0, 0, BZ, "<b>SkyPark bar</b><span>order</span>", () => ({ eyebrow: "SkyPark bar", title: drinks[served++ % drinks.length], stats: [["Price", Market.state.price ? `${(26 / Market.state.price.usd).toFixed(3)} ZEC` : "$26"], ["Block", k.height ? num(k.height) : "…"]] }));
  const bulbs: THREE.Matrix4[] = [];
  for (let i = 0; i < 120; i++) {
    const t = (i % 60) / 59,
      line = Math.floor(i / 60);
    bulbs.push(new THREE.Matrix4().makeTranslation(-24 + t * 48, y + 3.4 - Math.sin(((t * 8) % 1) * Math.PI) * 0.35, line ? -10.2 : -16.4));
  }
  k.instances(f, new THREE.SphereGeometry(0.06, 8, 6), glowMat("#ffd8a0", 1.8), bulbs);
  for (let x = -24; x <= 24; x += 6) for (const z of [-10.2, -16.4]) if (x > -20 || z < -12) box(g, 0.08, 3.4, 0.08, k.dark, x, y, z);

  // ---- the bow: the observation deck past the last tower ----
  const BX = 14,
    tip = X1 + BX;
  const shape = new THREE.Shape([new THREE.Vector2(X1, 0), new THREE.Vector2(tip, 9), new THREE.Vector2(X1, 18)]);
  const bowTeak = new THREE.MeshStandardMaterial({ map: boards("#8a6040", "#7e5638", 0.5, 0.5), roughness: 0.75 });
  const bow = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false }), [bowTeak, std("#d8d4cc", 0.7)]);
  bow.rotation.x = Math.PI / 2;
  bow.position.y = y;
  bow.position.z = -18;
  g.add(bow);
  const under = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false }), std("#d8d4cc", 0.7));
  under.rotation.x = Math.PI / 2;
  under.position.set(0, y - 0.6, -18);
  g.add(under);
  for (const s of [-1, 1]) {
    const len = Math.hypot(BX, 9);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.1), k.glass);
    p.position.set(X1 + BX / 2, y + 0.55, -9 + s * 4.5);
    p.rotation.y = s * Math.atan2(9, BX);
    p.raycast = () => {};
    g.add(p);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), k.chrome);
    rail.position.set(X1 + BX / 2, y + 1.1, -9 + s * 4.5);
    rail.rotation.y = p.rotation.y;
    g.add(rail);
  }
  for (let x = X1; x < tip; x += 0.4) {
    const hw = (9 * (tip - x)) / BX - 0.3;
    k.rects[f].push([x, -18, x + 0.4, -9 - Math.max(0, hw)], [x, -9 + Math.max(0, hw), x + 0.4, 0]);
  }
  k.rects[f].push([tip - 0.6, -18, tip + 1, 0]);
  k.label(f, "OBSERVATION DECK", X1 + 2, 1.6, -9, { h: 0.3, color: "#f4b728", rot: Math.PI / 2 });
  for (const [x, z] of [[tip - 3.2, -9.6], [tip - 3.2, -8.4], [X1 + 5, -12], [X1 + 5, -6]] as [number, number][]) {
    const b = k.put(f, "binoc", H.binoculars, x, z, Math.PI / 2);
    k.pickAll(f, b, "<b>Binoculars</b><span>look at the chain</span>", () => {
      const s = k.since;
      return { eyebrow: "Observation deck", title: k.height ? `Block ${num(k.height)}` : "…", stats: [["Since last", s != null ? `${s} s` : "…"], ["Next in ~", s != null ? `${Math.max(0, 75 - s)} s` : "…"], ["Pending", `${k.ctx.director.mempoolList().length} tx`], ["Height", "200 m"]] };
    });
  }
  void k.person(f, 7890, [X1 + 6.5, -10.4], "Guest", { face: new THREE.Vector3(1, 0, 0) });
  void k.person(f, 7891, [X1 + 7.2, -7.6], "Guest", { face: new THREE.Vector3(1, 0, 0.3) });
  void k.person(f, 7892, [X1 + 3, -4], "Guest", { face: new THREE.Vector3(0.5, 0, 1), wander: [[X1 + 3, -4], [X1 + 8, -9], [X1 + 3, -14], [20, -10]] });

  // fireworks over the bay: a burst on every new block, a small one now and then
  const N = 300;
  const fw = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Array(N * 3).fill(0), 3)).setAttribute("color", new THREE.Float32BufferAttribute(new Array(N * 3).fill(1), 3)), new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  fw.frustumCulled = false;
  g.add(fw);
  const parts: { p: THREE.Vector3; v: THREE.Vector3; life: number; c: THREE.Color }[] = [];
  const burst = (big: boolean) => {
    const c = new THREE.Vector3((Math.random() - 0.5) * 60, y + 10 + Math.random() * 12, 40 + Math.random() * 30);
    const col = new THREE.Color(["#f4b728", "#3ef0ff", "#ff3e8a", "#3ee08f"][Math.floor(Math.random() * 4)]);
    for (let i = 0; i < (big ? 100 : 50); i++) {
      if (parts.length >= N) parts.shift();
      parts.push({ p: c.clone(), v: new THREE.Vector3().randomDirection().multiplyScalar(5 + Math.random() * 5), life: 1.8 + Math.random() * 0.6, c: col });
    }
  };
  k.ctx.onBlock(() => {
    if (k.current !== f) return;
    burst(true);
    setTimeout(() => burst(true), 400);
    setTimeout(() => burst(false), 900);
  });
  let idle = 3;
  k.ticks[f].push((dt) => {
    idle -= dt;
    if (idle < 0) {
      idle = 8 + Math.random() * 8;
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
  void hash;
  k.light(f, 0, -9.5, "#7fe0ff", 8, 4.5, 30);
  k.light(f, 0, BZ, "#ffc890", 9, 2.6);
  k.light(f, -16, -12, "#ffe6c8", 7, 3);
  k.light(f, 16, -12, "#ffe6c8", 7, 3);
  k.light(f, X1 + 6, -9, "#ffd8a0", 6, 3);
}
