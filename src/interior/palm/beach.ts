import * as THREE from "three";
import type { Snark } from "../../scene/snark";
import { cabana } from "../hotel/furniture";
import { F, GOLD, MONO, rr, type PalmKit } from "./kit";
import { deckTex, ground, lawnTex, lounger, palmTree, sandTex, sea, stoneTex, thatchRoof, umbrella, villa } from "./props";
import { jetSki, speedboat, yacht } from "./boats";

/**
 * Frond G's private beach: you come in from the frond road at the north end. On your left, behind
 * a low white wall, the villas and their gardens (pools, palms); ahead, a long strip of pale sand
 * with loungers under striped umbrellas, the beach bar halfway down, the jetty with the jet-ski
 * pontoon, the lifeguard tower at the tip. On your right the lagoon: jet skis carving round it,
 * swimmers, a paddle-boarder, the flamingo, the next frond's villas across the water, and beyond
 * them the Burj Al ZEC and the city.
 */

const f = F.beach;
/** The waterline (x), the frond's tip (z). */
const SH = 7.5;
const TIP = -124;
/** The villa plots' middles (z), 30 m apart; the second one is Villa Shielded. */
const PLOTS = [-3, -33, -63, -93];
const BAR_Z = -48;
const JETTY_Z = -76;

export function beach(k: PalmKit) {
  const g = k.groups[f];
  k.sun(f, ["#fff1d8", 1.8, [60, 80, 40]], ["#8aa8e0", 0.35, [-40, 60, 30]]);

  // ---- the ground: sand, the wet slope into the lagoon, the gardens ---------------------------
  ground(k, f, sandTex(), -9.5, TIP, SH, 14, 5);
  {
    // the beach shelving into the water, along the lagoon and round the tip
    const slope = (w: number, d: number, cx: number, cz: number, along: "x" | "z", sign: number) => {
      const geo = new THREE.PlaneGeometry(w, d, along === "x" ? 12 : 1, along === "z" ? 12 : 1).rotateX(-Math.PI / 2);
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const u = along === "x" ? (p.getX(i) + w / 2) / w : (p.getZ(i) + d / 2) / d;
        const t = sign > 0 ? u : 1 - u;
        p.setY(i, -1.8 * t * t - 0.25 * t);
      }
      geo.computeVertexNormals();
      const tex = sandTex().clone();
      tex.repeat.set(w / 5, d / 5);
      tex.needsUpdate = true;
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, color: "#d6c49c", roughness: 0.7 }));
      m.position.set(cx, k.y(f), cz);
      m.raycast = () => {};
      g.add(m);
    };
    slope(16, 14 - TIP + 16, SH + 8, (14 + TIP - 16) / 2, "x", 1);
    slope(SH + 9.5, 16, (SH - 9.5) / 2, TIP - 8, "z", -1);
  }
  sea(k, f, { x0: -160, z0: -330, x1: 230, z1: 80, y: -0.14, shore: [1, 0, -SH, 16], shore2: [0, -1, TIP, 16], shore3: [-1, 0, 64, 14], fade: 210, sunDir: [0.5, 0.45, -0.75] });
  ground(k, f, lawnTex(), -60, TIP + 6, -9.5, 14, 4, 0.02);

  // ---- the garden wall along the beach, the hedges between plots ---------------------------
  const WX = -9.4;
  const gates = PLOTS.map((c) => c + 7);
  {
    let z = 13;
    const stops = [...gates.map((c) => [c - 0.9, c + 0.9]), [TIP + 6, TIP + 6]].sort((a, b) => b[0] - a[0]);
    for (const [a, b] of stops) {
      if (z > b) {
        k.box(f, 0.4, 0.85, z - b, WX, 0, (z + b) / 2, "#f4f0e6");
        k.box(f, 0.5, 0.08, z - b, WX, 0.85, (z + b) / 2, "#e2d8c4");
        k.box(f, 0.04, 0.7, z - b, WX, 0.93, (z + b) / 2, "#bfe4ee", "glass");
        k.solid(f, WX - 0.3, b, WX + 0.3, z);
      }
      z = a;
    }
    for (const c of PLOTS.slice(1).map((c) => c + 15).concat([PLOTS[0] + 15]))
      for (let x = -58; x < WX - 0.5; x += 1) k.box(f, 1, 1.7 + k.rnd(x, c) * 0.15, 0.9, x + 0.5, 0, c, k.rnd(x, c, 2) > 0.5 ? "#3f7a34" : "#4a8a3c");
    // the gardens' bounds: the hedges are solid, and nobody walks past the lawn's far edge (x −60)
    // or its south end into the lagoon (the walker used to wander off the board there)
    for (const c of PLOTS.map((c) => c + 15)) k.solid(f, -58, c - 0.45, WX - 0.5, c + 0.45);
    k.solid(f, -60.6, TIP + 5.7, -59.8, 13.5);
    k.solid(f, -60.6, TIP + 5.7, WX, TIP + 6.3);
    k.solid(f, WX - 0.3, TIP - 1.6, WX + 0.3, TIP + 6.3);
  }
  // the frond road's gate behind you (the way out) and the hedge along the north end
  {
    const NZ = 13.5;
    for (let x = -9; x < SH + 3; x += 1) k.box(f, 1, 1.4, 1, x + 0.5, 0, NZ, k.rnd(x, 3) > 0.5 ? "#3f7a34" : "#4a8a3c");
    k.solid(f, -60, NZ - 0.5, SH + 12, NZ + 0.5);
    for (const s of [-1, 1]) {
      k.box(f, 0.5, 3.4, 0.5, s * 1.8, 0, NZ - 0.6, "#f4f0e6");
      k.box(f, 0.6, 0.12, 0.6, s * 1.8, 3.4, NZ - 0.6, GOLD, "metal");
    }
    k.box(f, 4.2, 0.4, 0.5, 0, 3.0, NZ - 0.6, "#f4f0e6");
    k.label(f, "FROND G · BEACH", 0, 3.2, NZ - 0.9, { h: 0.24, color: GOLD, ry: Math.PI });
  }
  k.totem(f, -3.4, 7.8, 0.35);

  // ---- the villas -------------------------------------------------------------------------------
  const pools: [number, number][] = [];
  PLOTS.forEach((c, i) => {
    villa(k, f, -34, c - 1, Math.PI / 2, i * 3 + 1, { w: 18 + (i % 2) * 2, d: 13 });
    // the travertine pool deck and the pool, loungers on it
    ground(k, f, stoneTex(), -26.5, c - 10, -12, c + 7, 3, 0.04);
    pools.push([-19.5, c - 2]);
    k.box(f, 5.2, 0.12, 12.4, -19.5, 0, c - 2, "#f2ece0", "polish");
    for (let j = 0; j < 3; j++) lounger(k, f, -14.6, c - 6 + j * 2.6, -Math.PI / 2, ["#f6f2ea", "#1e3a5a", "#f4b728", "#e8e2d4"][(i + j) % 4], j === 1 ? "#f4b728" : null, 0.04);
    k.solid(f, -22.4, c - 8.4, -16.6, c + 4.4);
    palmTree(k, f, -12.6, c + 8.5, 8 + (i % 2) * 1.5, i * 11 + 1);
    palmTree(k, f, -24.5, c + 9.6, 9.5, i * 11 + 2);
    palmTree(k, f, -12.2, c - 11, 7, i * 11 + 3);
    k.solid(f, -24.9, c + 9.2, -24.1, c + 10);
    // a gate in the wall, the villa's name on a brass plate
    const gz = gates[i];
    k.box(f, 0.16, 1.9, 1.8, WX, 0, gz, i === 1 ? "#8a5e3a" : "#7a5434");
    for (const s of [-1, 1]) k.box(f, 0.5, 2.1, 0.4, WX, 0, gz + s * 1.1, "#f4f0e6");
    const name = ["Villa Mirage", "Villa Shielded", "Villa Orchard", "Villa Sapling"][i];
    k.label(f, name.toUpperCase(), WX + 0.3, 1.55, gz + 1.1, { h: 0.1, color: "#e8c25a", ry: Math.PI / 2, glow: false });
    k.solid(f, WX - 0.3, gz - 1, WX + 0.3, gz + 1);
    if (i === 1) {
      k.label(f, "● RING TO ENTER", WX + 0.12, 1.15, gz - 0.2, { h: 0.08, color: "#7dffb0", ry: Math.PI / 2 });
      k.hit(f, 0.4, 2, 1.8, WX + 0.1, 0, gz, `<b>Villa Shielded</b><span>ring the bell</span>`, () => ({ eyebrow: "Frond G", title: "Villa Shielded", floor: F.villa }));
    } else
      k.hit(f, 0.4, 2, 1.8, WX + 0.1, 0, gz, `<b>${name}</b><span>private</span>`, () => ({ eyebrow: "Frond G · private villa", title: name, tag: ["Owner: shielded", "muted"], stats: [["Plot", `G-${i * 2 + 3}`], ["Beach", "28 m"], ["Pool", "infinity"], ["Visitors", "by invitation"]] }));
  });
  for (const [x, z] of pools) sea(k, f, { x0: x - 2.4, z0: z - 6, x1: x + 2.4, z1: z + 6, y: 0.1, deep: "#2ec4dc", shallow: "#2ec4dc", sky: "#c8ecf4", fade: 400, calm: 0.35, night: { deep: "#1a8ab8", shallow: "#1a8ab8", sky: "#3ab0d8", sun: "#c8e8ff" } });

  // ---- the beach: umbrellas and loungers, a cabana or two, palms on the sand --------------------
  const UMB = ["#f4b728", "#1e6fae", "#e8573a", "#1baf7a"];
  PLOTS.forEach((c, i) => {
    const col = UMB[i % UMB.length];
    for (const [ux, uz] of [
      [-3.6, c + 4],
      [-3.6, c - 4],
      [1.4, c],
      [1.4, c - 8],
    ]) {
      umbrella(k, f, ux, uz, col);
      lounger(k, f, ux, uz - 0.95, -Math.PI / 2, "#f6f2ea", k.rnd(ux, uz) > 0.5 ? col : null);
      lounger(k, f, ux, uz + 0.95, -Math.PI / 2, "#f6f2ea", null);
      k.solid(f, ux - 1, uz - 1.4, ux + 1, uz + 1.4);
    }
    // a cabana at the back of the sand
    if (i !== 1 && i !== 2) {
      k.vox(f, `cabana${i % 2}`, () => cabana(i % 2 ? "#1e6fae" : "#f4b728"), -7.2, c - 9, Math.PI / 2);
    }
    palmTree(k, f, -7.6, c + 10.5, 9 + k.rnd(i, 4) * 2, i * 7 + 40, { lean: 2.4, dir: 0.2 });
    k.solid(f, -8, c + 10.1, -7.2, c + 10.9);
    palmTree(k, f, 4.6, c - 13, 8, i * 7 + 41, { lean: 2.8, dir: -0.1 });
    k.solid(f, 4.2, c - 13.4, 5, c - 12.6);
  });
  // the water's edge: no further than the knees
  k.solid(f, SH + 1.2, TIP - 2, SH + 2, 14);
  k.solid(f, -10, TIP - 1.6, SH + 2, TIP - 0.8);
  // a sandcastle, a bucket and spade
  {
    const sx = 5,
      sz = -22;
    k.cyl(f, 1.1, 0.95, 0.35, sx, 0, sz, "#e2cc9c", "matte", 16);
    k.cyl(f, 0.55, 0.45, 0.45, sx, 0.35, sz, "#e6d2a4", "matte", 12);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      k.cyl(f, 0.18, 0.15, 0.5, sx + Math.cos(a) * 0.75, 0.3, sz + Math.sin(a) * 0.75, "#e0c896", "matte", 8);
      k.cyl(f, 0.17, 0.0, 0.18, sx + Math.cos(a) * 0.75, 0.8, sz + Math.sin(a) * 0.75, "#e0c896", "matte", 8);
    }
    k.cyl(f, 0.02, 0.02, 0.5, sx, 0.8, sz, "#d8d0c0", "matte", 4);
    k.box(f, 0.02, 0.18, 0.28, sx + 0.14, 1.12, sz, GOLD, "glow");
    k.cyl(f, 0.17, 0.13, 0.26, sx + 1.6, 0, sz + 0.7, "#e8573a", "polish", 10);
    k.box(f, 0.12, 0.02, 0.5, sx + 1.4, 0.02, sz - 0.6, "#1e6fae", "polish", 0.6);
    k.solid(f, sx - 1.1, sz - 1.1, sx + 1.1, sz + 1.1);
  }

  beachBar(k);
  jetty(k);
  lifeguard(k);
  lagoon(k);
  farFrond(k);
  cast(k);

  k.light(f, -4.5, 3.2, BAR_Z, "#ffc888", 14, 16);
  k.light(f, SH + 10, 2.2, JETTY_Z, "#fff0d8", 8, 14);
  k.themeFns.push((n) => (g.userData.night = n));
}

// ---- the beach bar --------------------------------------------------------------------------------

function beachBar(k: PalmKit) {
  const g = k.groups[f];
  const z0 = BAR_Z,
    x0 = -4.5;
  // the teak deck, its step, the posts
  const deck = deckTex().clone();
  deck.repeat.set(2, 2);
  deck.needsUpdate = true;
  k.box(f, 8.4, 0.25, 10.4, x0, 0, z0, "#8a6440");
  k.flat(f, 8.4, 10.4, new THREE.MeshStandardMaterial({ map: deck, roughness: 0.7 }), x0, z0, 0.255);
  k.grounds[f].push((x, z) => (Math.abs(x - x0) < 4.2 && Math.abs(z - z0) < 5.2 ? 0.25 : null));
  for (const [px, pz] of [
    [-3.9, -4.9],
    [3.9, -4.9],
    [-3.9, 4.9],
    [3.9, 4.9],
  ]) {
    k.cyl(f, 0.14, 0.16, 3.4, x0 + px, 0.25, z0 + pz, "#6a4a2c", "matte", 8);
    k.solid(f, x0 + px - 0.2, z0 + pz - 0.2, x0 + px + 0.2, z0 + pz + 0.2);
  }
  // the thatched roof on its ring beam
  k.box(f, 9.0, 0.22, 11.0, x0, 3.62, z0, "#5a3e24");
  thatchRoof(k, f, x0, 3.8, z0, 10.4, 12.4, 3.0);
  // the counter: an L of teak with a polished top, ZEC gold kick strip
  const cx = x0 + 1.2;
  k.box(f, 0.8, 1.1, 7, cx, 0.25, z0, "#7a5434");
  k.box(f, 1.0, 0.07, 7.2, cx, 1.35, z0, "#efe8da", "polish");
  k.box(f, 0.04, 0.06, 7, cx + 0.42, 0.35, z0, GOLD, "glow");
  k.solid(f, cx - 0.5, z0 - 3.6, cx + 0.5, z0 + 3.6);
  // the back bar: shelves of lit bottles, the cocktail screen
  const bx = x0 - 3.6;
  k.box(f, 0.6, 2.6, 8, bx, 0.25, z0, "#5a3e24");
  k.solid(f, bx - 0.4, z0 - 4, bx + 0.4, z0 + 4);
  for (let s = 0; s < 3; s++) {
    k.box(f, 0.4, 0.04, 7.6, bx + 0.45, 1.05 + s * 0.45, z0, "#d8c8a8", "polish");
    k.box(f, 0.04, 0.03, 7.6, bx + 0.66, 1.05 + s * 0.45, z0, "#ffc070", "glow");
    for (let i = 0; i < 22; i++) {
      const c = ["#3a8a4a", "#c8d8e0", "#8a3a2a", "#e8c070", "#2a4a8a", "#f4f0e0", "#c86a2a"][(i * 3 + s) % 7];
      const z = z0 - 3.6 + i * 0.34 + k.rnd(i, s) * 0.08;
      if (Math.abs(z - z0) < 1.3) continue;
      k.cyl(f, 0.05, 0.05, 0.24 + k.rnd(i, s, 3) * 0.1, bx + 0.45, 1.09 + s * 0.45, z, c, "glass", 6);
      k.cyl(f, 0.045, 0.045, 0.2, bx + 0.45, 1.09 + s * 0.45, z, c, "polish", 6);
    }
  }
  const scr = k.screen(f, 2.2, 1.24, (c, W, H) => drawBarScreen(k, c, W, H), 4);
  scr.position.set(bx + 0.32, k.y(f) + 1.7, z0);
  scr.rotation.y = Math.PI / 2;
  k.pick(f, scr, `<b>Shielded Sunset Bar</b><span>the cocktail list</span>`, () => barMenu(k));
  // stools at the counter
  for (let i = 0; i < 5; i++) {
    const z = z0 - 2.8 + i * 1.4;
    k.cyl(f, 0.04, 0.04, 0.75, cx + 1.0, 0.25, z, "#c8ccd4", "metal", 6);
    k.cyl(f, 0.22, 0.22, 0.08, cx + 1.0, 1.0, z, "#e8e0d0", "matte", 14);
  }
  // the sign on the eaves, facing the sea
  k.box(f, 0.12, 0.7, 5.4, x0 + 5.35, 3.55, z0, "#3a2414");
  k.label(f, "SHIELDED SUNSET BAR", x0 + 5.43, 3.9, z0, { h: 0.42, color: "#ffcf6a", ry: Math.PI / 2 });
  // bar tables on the sand, each with a lantern
  for (const [tx, tz] of [
    [1.6, z0 - 3],
    [1.2, z0 + 2.4],
    [3.2, z0 - 0.4],
  ]) {
    k.cyl(f, 0.5, 0.5, 0.06, tx, 0.72, tz, "#e8dcc4", "polish", 18);
    k.cyl(f, 0.06, 0.06, 0.72, tx, 0, tz, "#5a3e24", "matte", 6);
    k.cyl(f, 0.06, 0.06, 0.2, tx, 0.78, tz, "#ffcf8a", "glow", 8);
    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * Math.PI * 2;
      k.cyl(f, 0.2, 0.2, 0.06, tx + Math.cos(a) * 0.85, 0.48, tz + Math.sin(a) * 0.85, "#c8a464", "matte", 10);
      k.cyl(f, 0.03, 0.03, 0.48, tx + Math.cos(a) * 0.85, 0, tz + Math.sin(a) * 0.85, "#5a3e24", "matte", 5);
    }
    k.solid(f, tx - 0.6, tz - 0.6, tx + 0.6, tz + 0.6);
  }
  // string lights along the eaves (glow at night)
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd890").multiplyScalar(1.6), toneMapped: false }), 40);
  for (let i = 0; i < 40; i++) {
    const t = i / 39;
    const z = z0 - 5.4 + t * 10.8;
    bulbs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x0 + 5.5, k.y(f) + 3.2 - Math.sin(((t * 4) % 1) * Math.PI) * 0.25, z));
  }
  bulbs.raycast = () => {};
  g.add(bulbs);
  k.themeFns.push((n) => (bulbs.visible = n));
  bulbs.visible = k.night;
}

function drawBarScreen(k: PalmKit, c: CanvasRenderingContext2D, W: number, H: number) {
  c.fillStyle = "#0c0a10";
  c.fillRect(0, 0, W, H);
  const grd = c.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, "#ff7a4a33");
  grd.addColorStop(1, "#1a0a2a00");
  c.fillStyle = grd;
  c.fillRect(0, 0, W, H);
  c.fillStyle = GOLD;
  c.font = `700 ${H * 0.085}px ${MONO}`;
  c.textAlign = "left";
  c.fillText("SHIELDED SUNSET BAR", W * 0.05, H * 0.13);
  const p = k.price;
  const drinks: [string, number][] = [
    ["Orchard Mojito", 18],
    ["Sapling Sour", 16],
    ["Shielded Spritz", 17],
    ["Turnstile Tonic", 14],
    ["Halving Colada", 21],
  ];
  c.font = `500 ${H * 0.062}px ${MONO}`;
  drinks.forEach(([n, usd], i) => {
    const y = H * (0.27 + i * 0.1);
    c.fillStyle = "#f4ead8";
    c.textAlign = "left";
    c.fillText(n, W * 0.05, y);
    c.fillStyle = "#ffcf6a";
    c.textAlign = "right";
    c.fillText(p ? `${(usd / p).toFixed(4)} ZEC` : `$${usd}`, W * 0.95, y);
  });
  c.fillStyle = "#2a2430";
  rr(c, W * 0.04, H * 0.8, W * 0.92, H * 0.14, 8);
  c.fill();
  c.font = `600 ${H * 0.058}px ${MONO}`;
  c.textAlign = "left";
  c.fillStyle = "#7dffb0";
  c.fillText(`BLOCK ${k.height ? k.height.toLocaleString("en-US") : "…"}`, W * 0.07, H * 0.895);
  c.textAlign = "right";
  c.fillStyle = GOLD;
  c.fillText(p ? `ZEC $${p.toFixed(2)}` : "ZEC …", W * 0.93, H * 0.895);
}

function barMenu(k: PalmKit) {
  const p = k.price;
  const z = (usd: number) => (p ? `${(usd / p).toFixed(4)} ZEC` : `$${usd}`);
  return {
    eyebrow: "Frond G · beach bar",
    title: "Shielded Sunset Bar",
    tag: ["Happy hour on every block", "ok"] as [string, "ok"],
    stats: [
      ["Orchard Mojito", z(18)],
      ["Sapling Sour", z(16)],
      ["Halving Colada", z(21)],
      ["ZEC", p ? `$${p.toFixed(2)}` : "…"],
    ] as [string, string][],
  };
}

// ---- the jetty and the jet-ski pontoon --------------------------------------------------------------

function jetty(k: PalmKit) {
  const z = JETTY_Z,
    L = 22,
    x0 = SH - 2;
  const deck = deckTex().clone();
  deck.repeat.set(L / 4, 0.6);
  deck.needsUpdate = true;
  k.box(f, L, 0.12, 2.4, x0 + L / 2, 0.2, z, "#6a4a2c");
  k.plane(f, L, 2.4, new THREE.MeshStandardMaterial({ map: deck, roughness: 0.7 }), x0 + L / 2, 0.325, z, -Math.PI / 2);
  for (let x = x0 + 2; x <= x0 + L; x += 3)
    for (const s of [-1, 1]) {
      k.cyl(f, 0.12, 0.12, 2.3, x, -1.9, z + s * 1.25, "#5a3e24", "matte", 8);
      k.box(f, 0.08, 0.9, 0.08, x, 0.32, z + s * 1.15, "#e8e0d0");
    }
  for (const s of [-1, 1]) k.box(f, L - 2, 0.06, 0.08, x0 + L / 2 + 1, 1.2, z + s * 1.15, "#e8e0d0");
  // the pontoon at its end
  k.box(f, 6, 0.35, 7, x0 + L + 3, -0.15, z, "#f2eee6");
  k.grounds[f].push((x, zz) => (x > SH + 1 && x < x0 + L && Math.abs(zz - z) < 1.2 ? 0.32 : x >= x0 + L && x < x0 + L + 6 && Math.abs(zz - z) < 3.5 ? 0.2 : null));
  // let the walker onto the jetty: open the waterline barrier there (rebuilt in two pieces)
  const r = k.rects[f];
  const i = r.findIndex((q) => q[0] === SH + 1.2 && q[2] === SH + 2);
  if (i >= 0) {
    const [a, b, c, d] = r[i];
    r.splice(i, 1, [a, b, c, z - 1.25], [a, z + 1.25, c, d]);
  }
  k.solid(f, SH + 1.5, z - 1.5, x0 + L, z - 1.2);
  k.solid(f, SH + 1.5, z + 1.2, x0 + L, z + 1.5);
  k.solid(f, x0 + L, z - 3.7, x0 + L + 6.2, z - 3.4);
  k.solid(f, x0 + L, z + 3.4, x0 + L + 6.2, z + 3.7);
  k.solid(f, x0 + L + 5.9, z - 3.7, x0 + L + 6.2, z + 3.7);
  // the pontoon's landward side, either side of the jetty (it was open onto the lagoon)
  k.solid(f, x0 + L - 0.15, z - 3.7, x0 + L + 0.15, z - 1.2);
  k.solid(f, x0 + L - 0.15, z + 1.2, x0 + L + 0.15, z + 3.7);
  // the rental kiosk and its sign
  const kx = x0 + L + 4.2;
  k.box(f, 1.6, 2.2, 2, kx, 0.2, z - 2.2, "#f4f0e6");
  k.box(f, 2, 0.12, 2.4, kx, 2.4, z - 2.2, GOLD, "polish");
  k.label(f, "JET SKI · 30 MIN", kx - 0.82, 1.7, z - 2.2, { h: 0.16, color: "#1e6fae", bg: "#f4f0e6", ry: -Math.PI / 2 });
  k.solid(f, kx - 0.85, z - 3.25, kx + 0.85, z - 1.15);
  k.hit(f, 1.7, 2.2, 2.1, kx, 0.2, z - 2.2, `<b>Jet-ski rental</b><span>30 minutes</span>`, () => {
    const p = k.price;
    return { eyebrow: "Frond G · jetty", title: "Jet-ski rental", stats: [["30 min", p ? `${(95 / p).toFixed(3)} ZEC` : "$95"], ["1 hour", p ? `${(160 / p).toFixed(3)} ZEC` : "$160"], ["Life vest", "included"], ["Licence", "not needed"]] };
  });
  // moored: two jet skis and a speedboat
  for (const [dx, dz] of [
    [1.5, 4.6],
    [3.6, 4.6],
  ]) {
    const j = jetSki(GOLD);
    j.position.set(x0 + L + dx, k.y(f) - 0.12, z + dz);
    j.rotation.y = Math.PI / 2;
    k.groups[f].add(j);
  }
  const sb = speedboat("#f6f6f2", "#1e3a5a");
  sb.position.set(x0 + 9, k.y(f) - 0.14, z - 3.4);
  sb.rotation.y = 0;
  k.groups[f].add(sb);
  k.ticks[f].push((_dt, t) => {
    sb.position.y = k.y(f) - 0.14 + Math.sin(t * 1.1) * 0.04;
    sb.rotation.z = Math.sin(t * 0.9) * 0.02;
  });
}

// ---- the lifeguard tower --------------------------------------------------------------------------

function lifeguard(k: PalmKit) {
  const x = 3.2,
    z = TIP + 10;
  for (const [dx, dz] of [
    [-0.9, -0.9],
    [0.9, -0.9],
    [-0.9, 0.9],
    [0.9, 0.9],
  ])
    k.box(f, 0.14, 2.3, 0.14, x + dx, 0, z + dz, "#f4f0e6");
  k.box(f, 2.4, 0.14, 2.4, x, 2.3, z, "#e8e0d0");
  k.box(f, 2.0, 1.6, 2.0, x - 0.1, 2.44, z, "#e8573a");
  k.box(f, 0.05, 0.7, 1.6, x + 0.92, 3.1, z, "#9ad0e0", "polish");
  k.box(f, 2.5, 0.12, 2.5, x - 0.1, 4.04, z, "#f4f0e6");
  k.box(f, 0.05, 0.4, 2.0, x + 0.93, 2.55, z, "#f4f0e6");
  // the ramp down
  const ramp = new THREE.BoxGeometry(0.8, 0.08, 3.2).rotateX(-0.72).translate(x - 0.1, 1.15, z + 2.3);
  k.geo(f, ramp, "#e8e0d0");
  // the flag and the rescue board
  k.cyl(f, 0.03, 0.03, 2.2, x + 1.1, 4.1, z + 1.1, "#d8d0c0", "metal", 6);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5, 6, 1), new THREE.MeshStandardMaterial({ color: "#2fbf5a", side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(x + 1.52, k.y(f) + 6.0, z + 1.1);
  flag.raycast = () => {};
  k.groups[f].add(flag);
  const fp = (flag.geometry.attributes.position as THREE.BufferAttribute).array.slice();
  k.ticks[f].push((_dt, t) => {
    const p = flag.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(fp[i * 3] * 5 + t * 6) * 0.06 * (fp[i * 3] + 0.4));
    p.needsUpdate = true;
  });
  k.box(f, 0.5, 2.4, 0.08, x + 1.25, 0, z - 0.6, "#f4c428", "polish", 0.2);
  k.solid(f, x - 1.3, z - 1.3, x + 1.4, z + 1.3);
}

// ---- the lagoon: buoys, swim platform, flamingo, paddle-boarder, jet skis, gulls ------------------

function lagoon(k: PalmKit) {
  const g = k.groups[f];
  const y0 = k.y(f) - 0.14;
  // the swim line of buoys
  const buoys = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: "#f4c428", roughness: 0.4 }), 34);
  buoys.raycast = () => {};
  g.add(buoys);
  const m4 = new THREE.Matrix4();
  k.ticks[f].push((_dt, t) => {
    for (let i = 0; i < 34; i++) {
      m4.makeTranslation(SH + 24, y0 + Math.sin(t * 1.3 + i * 0.7) * 0.05, 10 - i * 4);
      buoys.setMatrixAt(i, m4);
    }
    buoys.instanceMatrix.needsUpdate = true;
  });
  // the swim platform with its ladder
  const plat = new THREE.Group();
  const pm = new THREE.MeshStandardMaterial({ color: "#f2eee6", roughness: 0.6 });
  const pBox = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 4), pm);
  pBox.position.y = 0.05;
  const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.06), new THREE.MeshStandardMaterial({ color: "#c8ccd4", metalness: 0.9, roughness: 0.25 }));
  ladder.position.set(0, 0.1, 2.05);
  plat.add(pBox, ladder);
  plat.position.set(SH + 16, y0, -14);
  plat.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
  g.add(plat);
  // the inflatable flamingo
  const fl = new THREE.Group();
  const pink = new THREE.MeshStandardMaterial({ color: "#ff7aa8", roughness: 0.35 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.32, 10, 24), pink);
  ring.rotation.x = Math.PI / 2;
  const neck = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.13, 8, 16, Math.PI * 1.1), pink);
  neck.position.set(0.7, 0.75, 0);
  neck.rotation.z = -0.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), pink);
  head.position.set(0.05, 1.3, 0);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 8), new THREE.MeshStandardMaterial({ color: "#2a2a2a" }));
  beak.rotation.z = Math.PI / 2 + 0.6;
  beak.position.set(-0.2, 1.22, 0);
  fl.add(ring, neck, head, beak);
  fl.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
  g.add(fl);
  k.ticks[f].push((_dt, t) => {
    fl.position.set(SH + 11 + Math.sin(t * 0.05) * 3, y0 + 0.1 + Math.sin(t * 1.4) * 0.05, -36 + Math.cos(t * 0.04) * 4);
    fl.rotation.set(Math.sin(t * 1.1) * 0.05, t * 0.06, Math.sin(t * 1.3) * 0.05);
  });
  // gulls wheeling overhead
  const gullGeo = new THREE.BufferGeometry();
  gullGeo.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0.12, 0, 0, 0, 0.08, 0, 0, -0.08, 0.5, 0.12, 0, 0, 0, -0.08, 0, 0, 0.08], 3));
  gullGeo.computeVertexNormals();
  const gulls = new THREE.InstancedMesh(gullGeo, new THREE.MeshBasicMaterial({ color: "#f4f4f0", side: THREE.DoubleSide }), 7);
  gulls.raycast = () => {};
  gulls.frustumCulled = false;
  g.add(gulls);
  const q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    pv = new THREE.Vector3(),
    sv = new THREE.Vector3();
  k.ticks[f].push((_dt, t) => {
    for (let i = 0; i < 7; i++) {
      const a = t * (0.12 + i * 0.015) + i * 0.9;
      const r = 14 + i * 3;
      pv.set(SH + 20 + Math.cos(a) * r, k.y(f) + 13 + i * 1.3 + Math.sin(t * 0.7 + i) * 1.2, -40 + Math.sin(a) * r * 1.4);
      e.set(0, -a, Math.sin(t * 2 + i) * 0.15);
      q.setFromEuler(e);
      const flap = 0.6 + Math.abs(Math.sin(t * 5 + i * 2)) * 0.6;
      sv.set(1.6, flap * 1.6, 1.6);
      m4.compose(pv, q, sv);
      gulls.setMatrixAt(i, m4);
    }
    gulls.instanceMatrix.needsUpdate = true;
  });
  // the anchored yacht out in the lagoon
  const y = yacht(36, "#f6f6f2", "#1a2430");
  y.group.position.set(48, y0, -96);
  y.group.rotation.y = 0.5;
  g.add(y.group);
  k.ticks[f].push((_dt, t) => {
    y.group.rotation.z = Math.sin(t * 0.5) * 0.01;
    y.group.position.y = y0 + Math.sin(t * 0.6) * 0.06;
  });
}

// ---- across the lagoon: the next frond --------------------------------------------------------------

function farFrond(k: PalmKit) {
  const X = 64;
  ground(k, f, sandTex(), X, -330, X + 14, 90, 8, -0.02);
  ground(k, f, lawnTex(), X + 14, -330, X + 70, 90, 6, 0.0);
  for (let i = 0, z = 70; z > -320; z -= 27, i++) {
    villa(k, f, X + 30, z, -Math.PI / 2, i * 5 + 2, { w: 17 + (i % 3) * 2, d: 12 });
    palmTree(k, f, X + 9, z + 8, 8 + (i % 3), 300 + i, { lean: 1.5, dir: Math.PI });
    palmTree(k, f, X + 17, z - 6, 9, 330 + i);
    if (i % 2) umbrella(k, f, X + 5, z + 2, UMB2[i % UMB2.length]);
    k.box(f, 6, 0.1, 9, X + 20, 0.02, z, "#3ad0e0", "glow");
  }
}
const UMB2 = ["#f4b728", "#1e6fae", "#e8573a", "#f6f2ea"];

// ---- people ------------------------------------------------------------------------------------------

function cast(k: PalmKit) {
  const y0 = k.y(f);
  k.onCast(f, () => {
    // the bar
    const tender = k.person(f, 2121, [-7.2, BAR_Z - 0.6], "Bartender", { dy: 0.25, face: [1, 0], wander: [[-7.2, BAR_Z - 2], [-7.2, BAR_Z + 1.5], [-7.2, BAR_Z]] });
    const a = k.person(f, 3456, [-2.3, BAR_Z - 1.4], "Guest", { dy: 0.25, face: [-1, 0] });
    const b = k.person(f, 1789, [-2.3, BAR_Z + 1.4], "Guest", { dy: 0.25, face: [-1, 0] });
    k.dialog(f, [tender, a, b], [
      [0, "One Orchard Mojito. Paid in shielded ZEC, no receipt needed."],
      [1, "Make it two. My wallet doesn't gossip."],
      [2, "Is the sunset included?"],
      [0, "Every evening. It settles faster than a block."],
      [1, () => `Block ${k.height ? k.height.toLocaleString("en-US") : "…"} just landed. Cheers!`],
      [2, "To the fronds. And to privacy."],
    ], { near: 12 });
    tender.then((s) => s && k.blockFns.push((h) => Math.hypot(k.eye.x - s.root.position.x, k.eye.z - s.root.position.z) < 18 && s.say(`Block ${h.toLocaleString("en-US")}! Happy hour for one block.`, 3.6, "shout")));
    // sunbathers on the loungers
    const sun: [number, number, number, string[]][] = [
      [-3.6, PLOTS[0] + 3.05, 4101, ["SPF 50 and a shielded address. Fully protected.", "Wake me up at the next halving."]],
      [1.4, PLOTS[0] - 0.95, 4102, ["I came for the sun. I stayed for the privacy.", "This lounger is mine for two more blocks."]],
      [-3.6, PLOTS[2] + 3.05, 4103, ["My tan is public. My balance isn't.", "Is that the Burj Al ZEC? I can see my suite from here."]],
      [1.4, PLOTS[3] + 0.95, 4104, ["Fronds, villas, sand: all built on reclaimed land. Very solid. Like Orchard.", "Another coconut, please."]],
    ];
    for (const [x, z, id, lines] of sun) void k.person(f, id, [x, z], "Sunbather", { dy: 0.42, sit: true, face: [1, 0], lines });
    // walkers along the sand, a coconut seller
    const strand: [number, number][] = [
      [5.8, 6],
      [5.8, -20],
      [6.2, -50],
      [5.6, -80],
      [5.4, -112],
      [-0.6, -60],
      [-0.6, -28],
    ];
    void k.person(f, 5151, [5.8, -10], "Jogger", { wander: strand, lines: ["Morning run: frond tip and back. Twice.", "Sand running is leg day for zkSNARKs."] });
    void k.person(f, 5252, [4.6, -64], "Beachcomber", { wander: strand, lines: ["Found a shell shaped like a ⓩ.", "The tide's coming in. Like the shielded pool."] });
    void k.person(f, 5353, [-1, -30], "Coconut seller", { wander: [[-1, -30], [-1, -70], [3, -40], [3, 2]], lines: ["Fresh coconuts! Shielded straws!", "Coconut water: zero fees, zero sugar."], tone: "shout" });
    // kids at the sandcastle
    const k1 = k.person(f, 6161, [4.0, -23.3], "Kid", { face: [1, 0.3] });
    const k2 = k.person(f, 6262, [6.4, -21.2], "Kid", { face: [-1, -0.3] });
    k.dialog(f, [k1, k2], [
      [0, "This tower is the Burj Al ZEC."],
      [1, "And this is the moat. It's shielded."],
      [0, "The wave is coming!"],
      [1, "Build faster! Next block!"],
    ], { near: 10, gap: 10 });
    // the lifeguard up in the tower
    void k.person(f, 7171, [3.0, TIP + 10.2], "Lifeguard", { dy: 2.44, face: [1, 0], lines: ["No swimming past the buoys.", "Green flag: calm lagoon, calm mempool.", "I watch the water. Nobody watches your wallet."], near: 14 });
    // swimmers in the shallows
    const swim: [number, number, number][] = [
      [SH + 3.5, -8, 8101],
      [SH + 5.2, -40, 8102],
      [SH + 4.4, -58, 8103],
    ];
    swim.forEach(([x, z, id], i) =>
      void k.person(f, id, [x, z], "Swimmer", { sit: true, face: [-1, 0], lines: i === 0 ? ["The water's perfect. 29 degrees.", "Come in! The lagoon is shielded from the waves."] : ["Splash!", "Look, a jet ski!"] }).then((s) => {
        if (!s) return;
        k.ticks[f].push((_dt, t) => {
          s.root.position.y = y0 - 0.95 + Math.sin(t * 1.6 + i * 2) * 0.06;
          s.root.position.x = x + Math.sin(t * 0.2 + i) * 1.2;
        });
      }),
    );
    // someone on the swim platform, a paddle-boarder gliding by
    void k.person(f, 8201, [SH + 16, -14], "Sunbather", { dy: 0.22, sit: true, face: [-1, 0] }).then((s) => s && k.ticks[f].push((_dt, t) => (s.root.position.y = y0 + 0.11 + Math.sin(t * 1.2) * 0.04)));
    void k.person(f, 8301, [SH + 20, 0], "Paddle-boarder", { face: [0, -1], lines: ["Paddling to Atlantis. Back by the next halving."], near: 16 }).then((s) => {
      if (!s) return;
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 3.2), new THREE.MeshStandardMaterial({ color: "#f4b728", roughness: 0.4 }));
      board.position.y = 0.0;
      board.raycast = () => {};
      s.root.add(board);
      k.ticks[f].push((_dt, t) => {
        const u = (t * 0.6) % 260;
        const fw = u < 130;
        s.root.position.set(SH + 19 + Math.sin(t * 0.1) * 1.5, y0 + 0.08 + Math.sin(t * 1.2) * 0.03, 10 - (fw ? u : 260 - u));
        s.faceDir = new THREE.Vector3(0, 0, fw ? -1 : 1);
        board.rotation.y = 0;
      });
    });
    // two jet skis carving loops round the lagoon
    for (let i = 0; i < 2; i++) {
      const j = jetSki(i ? "#1e6fae" : GOLD);
      k.groups[f].add(j);
      const wake = wakeTrail(k, 26);
      void k.person(f, 9101 + i, [0, 0], "Jet-skier", { lines: i ? ["Wheee!", "Full throttle, zero trace!"] : ["Faster than a block!", "Yeehaw!"], near: 26, tone: "shout" }).then((s: Snark | null) => {
        if (!s) return;
        j.add(s.root);
        s.root.position.set(0, 0.45, -0.1);
        s.sit(true);
      });
      const cx = SH + 34,
        cz = -46,
        rx = 16 + i * 6,
        rz = 46 - i * 8,
        sp = 0.16 + i * 0.05,
        ph = i * 2.6;
      const prev = new THREE.Vector3();
      k.ticks[f].push((dt, t) => {
        const a = t * sp + ph;
        const x = cx + Math.cos(a) * rx + Math.sin(a * 3) * 2,
          z = cz + Math.sin(a) * rz;
        prev.copy(j.position);
        j.position.set(x, y0 + 0.05 + Math.abs(Math.sin(t * 3 + i)) * 0.08, z);
        const dx = x - prev.x,
          dz = z - prev.z;
        if (dt > 0 && dx * dx + dz * dz > 1e-6) j.rotation.y = Math.atan2(dx, dz);
        j.rotation.z = -Math.cos(a) * 0.25 * (i ? -1 : 1);
        j.rotation.x = -0.06;
        wake(j.position, t);
      });
    }
  });
}

/** A wake: white foam patches dropped behind a moving boat that spread and fade (one draw). */
function wakeTrail(k: PalmKit, n: number) {
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.6, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false }), n);
  mesh.raycast = () => {};
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  k.groups[f].add(mesh);
  const pts = Array.from({ length: n }, () => ({ p: new THREE.Vector3(0, -99, 0), t: -99 }));
  let next = 0,
    last = 0;
  const m4 = new THREE.Matrix4();
  return (at: THREE.Vector3, t: number) => {
    if (t - last > 0.12) {
      last = t;
      pts[next].p.set(at.x, k.y(f) - 0.1, at.z);
      pts[next].t = t;
      next = (next + 1) % n;
    }
    for (let i = 0; i < n; i++) {
      const age = t - pts[i].t;
      const s = age < 3 ? 0.5 + age * 1.1 : 0.0001;
      m4.makeScale(s, 1, s * 0.8).setPosition(pts[i].p);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
}

