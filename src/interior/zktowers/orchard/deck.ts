import * as THREE from "three";
import { bench } from "../../furniture";
import { telescope } from "../../needle/props";
import { GOLD, num, usd, type SkyKit } from "../kit";
import { DECO, granite } from "./art";
import { AT, F, LIFT } from "./levels";

/**
 * Floor 86: the observatory, open to the sky on top of the shaft at 110 m, like the Empire
 * State's 86th floor: a granite deck round the crown's limestone core, a parapet with the steel
 * safety fence curving in over it, coin telescopes all round — each one aimed at a real place of
 * the city, which you see in the panorama — the steel eagles leaning out of the corners below,
 * and over your head the stainless crown: six stacked sunburst arches on each face, their
 * triangular windows lit, and the needle spire with its red light.
 */

const f = F.deck;
const HW = 11; // half the deck's side
const CZ = -11; // the deck's middle
const CORE = 4.5; // half the core's side
const PARAPET = 0.95;

/** Places the telescopes can be aimed at (world x, z). */
const SIGHTS: { name: string; x: number; z: number; what: string }[] = [
  { name: "ZEC Needle", x: 141.5, z: -136.5, what: "the tallest tower in the city" },
  { name: "The Colosseum", x: 86.5, z: -193, what: "the Proof Games" },
  { name: "Central Park", x: 0, z: -82, what: "the lake and the bandstand" },
  { name: "zkSNARK Museum", x: -86.5, z: -82, what: "10,000 portraits" },
  { name: "The MEMPOOL shop", x: -7, z: -6, what: "the heart of the city" },
  { name: "ZEC Reserve · Wall Street", x: 102.5, z: 17, what: "the central bank" },
  { name: "ZK Mall", x: 159.5, z: -22, what: "the rain vortex" },
  { name: "ZK TOWER HALO", x: 209.5, z: -22.4, what: "the twisted glass tower" },
  { name: "ZK TOWER SAPLING", x: 209.5, z: 88.5, what: "the green tower by the marina" },
  { name: "Marina ZEC Hotel", x: 159.5, z: 88.5, what: "the sky park" },
  { name: "Big Ben", x: 86.5, z: 49.5, what: "Westminster on the river" },
  { name: "Tour Eiffel", x: -86.5, z: -209.5, what: "Paris, up north" },
  { name: "Great Pyramid", x: -159.5, z: -193, what: "Giza and its labyrinth" },
  { name: "Block Stadium", x: -175, z: -82, what: "Shielded against Transparent" },
  { name: "Shibuya crossing", x: -70, z: -175.5, what: "the scramble" },
];
const bearing = (dx: number, dz: number) => ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
const compass = (b: number) => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(b / 22.5) % 16];

export function deck(k: SkyKit) {
  const g = k.groups[f];
  const y0 = k.y(f);

  // ---- the deck: granite, the parapet, the curved fence -----------------------------------------
  k.flat(f, HW * 2, HW * 2, new THREE.MeshStandardMaterial({ map: granite(8, 8), roughness: 0.7 }), 0, CZ, 0.003);
  k.box(f, HW * 2 + 0.6, 0.6, HW * 2 + 0.6, 0, -0.6, CZ, "#bdb4a2", "matte");
  const stone = "#d6cebd";
  for (const [x0, z0, x1, z1] of [
    [-HW, CZ - HW, HW, CZ - HW],
    [HW, CZ - HW, HW, CZ + HW],
    [HW, CZ + HW, -HW, CZ + HW],
    [-HW, CZ + HW, -HW, CZ - HW],
  ] as const) {
    k.wall(f, x0, z0, x1, z1, PARAPET, stone, "matte", 0.5);
    k.wall(f, x0, z0, x1, z1, 0.08, "#c9a24a", "metal", 0.56, PARAPET, false);
    // the fence: steel bars, straight up then curving in, rails along it
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ux = (x1 - x0) / len,
      uz = (z1 - z0) / len;
    // inward normal
    const nx = -uz,
      nz = ux;
    const ry = -Math.atan2(z1 - z0, x1 - x0);
    for (let t = 0.2; t < len; t += 0.3) {
      const x = x0 + ux * t,
        z = z0 + uz * t;
      k.box(f, 0.035, 1.3, 0.035, x, PARAPET + 0.08, z, "#3a3c44", "metal");
      // the curved top: three short pieces leaning in
      for (let s = 0; s < 3; s++) {
        const a = 0.35 + s * 0.35;
        const px = x + nx * (0.12 + s * 0.24),
          pz = z + nz * (0.12 + s * 0.24);
        k.geo(f, new THREE.BoxGeometry(0.035, 0.32, 0.035).rotateX(a).rotateY(ry).translate(px, PARAPET + 1.5 + s * 0.22, pz), "#3a3c44", "metal");
      }
    }
    for (const h of [0.6, 1.3]) k.wall(f, x0 + nx * 0.0, z0, x1, z1, 0.04, "#3a3c44", "metal", 0.05, PARAPET + h, false);
  }
  // corner lamps on the parapet
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * (HW - 0.25),
        z = CZ + sz * (HW - 0.25);
      k.box(f, 0.5, 0.5, 0.5, x, PARAPET + 0.08, z, "#c9a24a", "metal");
      k.cyl(f, 0.18, 0.18, 0.5, x, PARAPET + 0.58, z, "#fff0c8", "glow", 10);
    }

  // ---- the eagles leaning out of the corners below the parapet ----------------------------------
  const steel = "#d8dde4";
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const a = Math.atan2(sx, sz);
      const base = new THREE.Vector3(sx * (HW + 0.1), -1.4, CZ + sz * (HW + 0.1));
      const out = (d: number) => base.clone().add(new THREE.Vector3(sx, 0, sz).normalize().multiplyScalar(d));
      const neck = out(1.1);
      k.geo(f, new THREE.BoxGeometry(0.45, 0.45, 2.2).rotateX(-0.25).rotateY(a).translate(neck.x, neck.y + 0.3, neck.z), steel, "metal");
      const head = out(2.3);
      k.geo(f, new THREE.BoxGeometry(0.75, 0.7, 0.8).rotateY(a).translate(head.x, head.y + 0.65, head.z), steel, "metal");
      const beak = out(2.85);
      k.geo(f, new THREE.BoxGeometry(0.3, 0.3, 0.5).rotateX(0.5).rotateY(a).translate(beak.x, beak.y + 0.45, beak.z), "#b8c0ca", "metal");
      for (const s of [-1, 1]) {
        const side = new THREE.Vector3(sz, 0, -sx).normalize().multiplyScalar(s * 0.9);
        const w = out(0.6).add(side);
        k.geo(f, new THREE.BoxGeometry(0.2, 1.2, 1.6).rotateY(a + s * 0.5).translate(w.x, w.y - 0.2, w.z), steel, "metal");
      }
    }

  // ---- the crown's core: limestone, the lift, a plaque ------------------------------------------
  k.box(f, CORE * 2, 3.4, CORE * 2, 0, 0, CZ, "#d8d0c0", "matte");
  k.solid(f, -CORE, CZ - CORE, CORE, CZ + CORE);
  for (let i = -3; i <= 3; i++)
    for (const s of [-1, 1]) {
      k.box(f, 0.22, 3.4, 0.1, i * 1.2, 0, CZ + s * (CORE + 0.05), "#c8bfae", "matte");
      k.box(f, 0.1, 3.4, 0.22, s * (CORE + 0.05), 0, CZ + i * 1.2, "#c8bfae", "matte");
    }
  k.box(f, CORE * 2 + 0.3, 0.3, CORE * 2 + 0.3, 0, 3.4, CZ, "#c9a24a", "metal");
  k.lifts(f, 0, CZ + CORE + 0.1, 0, LIFT);
  for (const [x, z, ry] of [
    [-CORE - 0.12, CZ, -Math.PI / 2],
    [CORE + 0.12, CZ, Math.PI / 2],
    [0, CZ - CORE - 0.12, Math.PI],
  ] as const) {
    k.label(f, "OBSERVATORY · 86 · 110 m", x, 2.2, z, { h: 0.24, color: GOLD, ry, font: `800 96px ${DECO}` });
    k.label(f, "ZK TOWER ORCHARD", x, 1.75, z, { h: 0.16, color: "#c9a24a", ry, font: `700 96px ${DECO}` });
  }

  // ---- the crown: six stacked sunburst arches on each face, the spire ---------------------------
  const CY = 3.7;
  const tiers = Array.from({ length: 6 }, (_, i) => ({ r: 3.9 - i * 0.55, y: CY + 1.0 + i * 1.75 }));
  for (const [i, t] of tiers.entries()) {
    const shape = new THREE.Shape();
    shape.moveTo(-t.r, CY - 0.4);
    shape.lineTo(t.r, CY - 0.4);
    shape.lineTo(t.r, t.y);
    shape.absarc(0, t.y, t.r, 0, Math.PI, false);
    shape.lineTo(-t.r, CY - 0.4);
    for (const rot of [0, Math.PI / 2]) {
      const geo = new THREE.ExtrudeGeometry(shape, { depth: t.r * 2, bevelEnabled: false, curveSegments: 20 }).translate(0, 0, -t.r).rotateY(rot).translate(0, 0, CZ);
      k.geo(f, geo, i % 2 ? "#8e96a2" : "#a8b0bc", "metal");
    }
    // each face: the arch's lit rim, and the sunburst of triangular windows
    for (let face = 0; face < 4; face++) {
      const ry = (face * Math.PI) / 2;
      const put = (geo: THREE.BufferGeometry, color: string) => k.geo(f, geo.rotateY(ry).translate(0, 0, CZ), color, "glow");
      put(new THREE.TorusGeometry(t.r + 0.02, 0.07, 4, 28, Math.PI).translate(0, t.y, t.r + 0.03), i % 2 ? "#c8a868" : "#b89858");
      const n = 9;
      for (let j = 0; j < n; j++) {
        const a = ((j + 0.5) / n) * Math.PI;
        const w = 0.075;
        const r0 = t.r * 0.32,
          r1 = t.r * 0.9;
        const tri = new THREE.BufferGeometry();
        const v = new Float32Array([Math.cos(a) * r0, t.y + Math.sin(a) * r0, 0, Math.cos(a - w) * r1, t.y + Math.sin(a - w) * r1, 0, Math.cos(a + w) * r1, t.y + Math.sin(a + w) * r1, 0]);
        tri.setAttribute("position", new THREE.BufferAttribute(v, 3));
        tri.computeVertexNormals();
        // wind the triangle to face out (+z)
        tri.setIndex([0, 1, 2]);
        const flat = tri.toNonIndexed();
        flat.computeVertexNormals();
        put(flat.translate(0, 0, t.r + 0.025), i < 3 ? "#a88e58" : "#b8a070");
      }
    }
  }
  const top = tiers[5].y + tiers[5].r;
  k.cyl(f, 0.55, 0.32, 3, 0, top - 0.3, CZ, "#e2e7ed", "metal", 12);
  k.cyl(f, 0.32, 0.06, 18, 0, top + 2.7, CZ, "#d8dde4", "metal", 10);
  for (let i = 0; i < 4; i++) k.cyl(f, 0.36 - i * 0.06, 0.36 - i * 0.06, 0.12, 0, top + 3 + i * 3, CZ, "#fff0c8", "glow", 10);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff3a2a").multiplyScalar(2.4), toneMapped: false }));
  tip.position.set(0, y0 + top + 20.8, CZ);
  tip.raycast = () => {};
  g.add(tip);
  k.ticks[f].push((_dt, t) => (tip.visible = t % 1.6 < 0.9));
  k.hit(f, 10, 16, 10, 0, 3.6, CZ, `<b>The crown</b><span>stainless steel · six arches</span>`, () => ({
    eyebrow: "ZK TOWER ORCHARD · crown",
    title: "The sunburst crown",
    stats: [
      ["Arches", "6 per face"],
      ["Windows", `${6 * 4 * 9} triangles`],
      ["Spire tip", "138 m"],
      ["After", "the Chrysler Building"],
    ],
  }));

  // ---- the telescopes, each aimed at a real place -------------------------------------------------
  const spots: [number, number][] = [
    [-5, CZ - HW + 0.75],
    [5, CZ - HW + 0.75],
    [HW - 0.75, CZ - 5],
    [HW - 0.75, CZ + 5],
    [5, CZ + HW - 0.75],
    [-5, CZ + HW - 0.75],
    [-HW + 0.75, CZ + 5],
    [-HW + 0.75, CZ - 5],
  ];
  const used = new Set<number>();
  spots.forEach(([x, z], i) => {
    // which way it looks: straight out from the side it stands on, turned a little to its corner
    const onZ = Math.abs(Math.abs(z - CZ) - (HW - 0.75)) < 0.01;
    const ox = onZ ? x * 0.06 : Math.sign(x),
      oz = onZ ? Math.sign(z - CZ) : (z - CZ) * 0.06;
    const b = bearing(ox, oz);
    let best = -1,
      bd = 1e9;
    SIGHTS.forEach((s, j) => {
      if (used.has(j)) return;
      const sb = bearing(s.x - AT.x, s.z - AT.z);
      let d = Math.abs(sb - b);
      d = Math.min(d, 360 - d);
      if (d < bd) (bd = d), (best = j);
    });
    used.add(best);
    const s = SIGHTS[best];
    const dx = s.x - AT.x,
      dz = s.z - AT.z;
    const dist = Math.hypot(dx, dz);
    const sb = bearing(dx, dz);
    // aim the lens (model -z) at the place
    const ry = Math.atan2(-dx, -dz);
    k.vox(f, "orch-scope", () => telescope(), x, z, ry);
    k.hit(f, 0.8, 1.6, 0.8, x, 0, z, `<b>Telescope</b><span>${s.name}</span>`, () => ({
      eyebrow: `Observatory · telescope ${i + 1}`,
      title: s.name,
      stats: [
        ["Looking", `${compass(sb)} · ${Math.round(sb)}°`],
        ["Distance", `${Math.round(dist)} m`],
        ["What", s.what],
        ["Coin", "one shielded penny"],
      ],
    }));
  });
  // benches against the core
  for (const [x, z, ry] of [
    [-CORE - 0.6, CZ - 2, Math.PI / 2],
    [-CORE - 0.6, CZ + 2, Math.PI / 2],
    [CORE + 0.6, CZ - 2, -Math.PI / 2],
    [CORE + 0.6, CZ + 2, -Math.PI / 2],
    [-2.4, CZ - CORE - 0.6, Math.PI],
    [2.4, CZ - CORE - 0.6, Math.PI],
  ] as const)
    k.vox(f, "orch-bench", () => bench(), x, z, ry);

  // a brass compass in the deck in front of the lift
  k.geo(f, new THREE.RingGeometry(1.0, 1.15, 40).rotateX(-Math.PI / 2).translate(0, 0.01, CZ + CORE + 3.2), "#d9b25a", "metal");
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.geo(f, new THREE.BoxGeometry(0.06, 0.01, i % 2 ? 0.6 : 0.95).translate(0, 0.012, i % 2 ? 0.3 : 0.47).rotateY(a).translate(0, 0, CZ + CORE + 3.2), "#d9b25a", "metal");
  }
  k.label(f, "N", 0, 0.03, CZ + CORE + 3.2 - 1.35, { h: 0.3, color: GOLD }).rotation.set(-Math.PI / 2, 0, 0);

  k.light(f, 0, 2.9, CZ + CORE + 1.2, "#ffe6c0", 5, 10);
  k.light(f, 0, 2.9, CZ - CORE - 1.2, "#ffe6c0", 4, 10);
  k.light(f, CORE + 1.2, 2.9, CZ, "#ffe6c0", 4, 10);
  k.light(f, -CORE - 1.2, 2.9, CZ, "#ffe6c0", 4, 10);

  // ---- people ---------------------------------------------------------------------------------
  k.onCast(f, () => {
    void k.person(f, 8601, [-5, CZ - HW + 1.6], "Tourist", { face: [0, -1], lines: ["I can see the Colosseum from here!", "Is that the Needle? It's taller than us.", "Another coin. The view's worth it."] });
    void k.person(f, 8602, [HW - 1.6, CZ - 5], "Photographer", { face: [1, 0], lines: ["Golden hour over Midtown. Hold still.", "The Needle, the park, the river. One frame.", "The photo is public. Your wallet isn't."] });
    const a = k.person(f, 8603, [4.4, CZ + HW - 1.7], "Guest", { face: [0.3, 1] });
    const b = k.person(f, 8604, [5.4, CZ + HW - 1.9], "Guest", { face: [-0.3, 1] });
    k.dialog(f, [a, b], [
      [0, "The whole city, every light."],
      [1, "Why did you bring me up here?"],
      [0, "Because I wanted to ask you something."],
      [1, "On the 86th floor?"],
      [0, "Will you share a viewing key with me?"],
      [1, "Yes! Yes, a thousand times."],
    ], { near: 9, gap: 14 });
    void k.person(f, 8605, [-HW + 1.6, CZ + 5], "Kid", { face: [-1, 0], lines: ["I can see our house!", "Can the eagles fly?", () => `Block ${num(k.height)}! I saw the bus!`] });
    void k.person(f, 8606, [-2, CZ + CORE + 1.6], "Guard", { face: [0, 1], cap: true, wander: [[-2, CZ + CORE + 1.6], [-8.5, CZ + 8], [8.5, CZ + 8], [8.5, CZ - 8.5], [-8.5, CZ - 8.5]], lines: ["Stay behind the fence, please.", "Wind's strong tonight. Hold on to your hat.", () => (k.price ? `ZEC ${usd(k.price)}. Even up here people ask.` : "Telescopes take coins.")] });
    const c = k.person(f, 8607, [-HW + 1.7, CZ - 5], "Tourist", { face: [-1, 0] });
    const d = k.person(f, 8608, [-HW + 2.2, CZ - 4], "Guide", { face: [-0.5, 0.5] });
    k.dialog(f, [d, c], [
      [0, "The Empire State took 410 days to build."],
      [1, "And this one?"],
      [0, "One block at a time."],
      [1, "And the crown?"],
      [0, "Stainless steel, like the Chrysler's. It never rusts."],
    ], { near: 9 });
  });
}
