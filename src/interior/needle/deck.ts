import * as THREE from "three";
import { fitText } from "../../scene/fit";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import { GOLD, LEVELS, MONO, NeedleKit, angDiff, compass, fmt, makeCanvas } from "./kit";
import * as P from "./props";

/** Places in the city a telescope can be aimed at (their centres, city metres). */
const TARGETS: { name: string; x: number; z: number; live?: (k: NeedleKit) => [string, string] }[] = [
  { name: "MEMPOOL · Downtown", x: -7.5, z: 0, live: (k) => ["Mempool", `${k.mempool} tx`] },
  { name: "Central Park", x: 0, z: -80 },
  { name: "BLOCK STADIUM", x: -175, z: -100, live: (k) => ["Block", k.height ? `#${fmt(k.height)}` : "…"] },
  { name: "zkSNARK MUSEUM", x: -86, z: -90, live: () => ["Collection", "10,000"] },
  { name: "GREAT PYRAMID", x: -160, z: -193 },
  { name: "TOUR EIFFEL", x: -86, z: -210 },
  { name: "COLOSSEUM", x: 86, z: -193 },
  { name: "ZK MALL", x: 160, z: -22, live: (k) => ["24 h volume", k.price ? `$${fmt(k.price.volume_24h_usd / 1e6, 1)} M` : "…"] },
  { name: "ZEC RESERVE", x: 102, z: 17, live: (k) => ["ZEC", k.price ? `$${k.price.usd.toFixed(2)}` : "…"] },
  { name: "MARINA ZEC HOTEL", x: 160, z: 88 },
  { name: "Port", x: -175, z: 104, live: (k) => ["Txs 24 h", k.market.network ? fmt(k.market.network.txs_24h) : "…"] },
];

/** Dark polished stone with radial gold lines and rings, mapped on the floor disc. */
function deckFloor(rings: number[], R: number, base = "#1c1a20") {
  const { t } = makeCanvas(2048, 2048, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 2048, 2048);
    g.translate(1024, 1024);
    const s = 1024 / (R + 0.15);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
      g.fillRect((Math.random() - 0.5) * 2048, (Math.random() - 0.5) * 2048, 40 + Math.random() * 120, 2);
    }
    g.strokeStyle = "rgba(201,162,39,0.75)";
    g.lineWidth = 6;
    for (const r of rings) {
      g.beginPath();
      g.arc(0, 0, r * s, 0, Math.PI * 2);
      g.stroke();
    }
    g.lineWidth = 3;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * rings[0] * s, Math.sin(a) * rings[0] * s);
      g.lineTo(Math.cos(a) * R * s, Math.sin(a) * R * s);
      g.stroke();
    }
  });
  return t;
}

/** A terrace outside the glass: stone ring, a glass balustrade with a gold rail, the gold lip. */
function terrace(k: NeedleKit, f: number, R: number, R2: number, gaps: [number, number][]) {
  const g = k.groups[f],
    y = LEVELS[f].y;
  // a glass floor: the city straight down through it, on a steel grid
  const ring = new THREE.Mesh(new THREE.RingGeometry(R, R2, 96, 1), new THREE.MeshStandardMaterial({ color: "#9cc0d8", transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.5, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = y - 0.02;
  g.add(ring);
  const nb = Math.round(R2 * 5);
  const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.08, R2 - R), k.mullion, nb);
  const bm = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2;
    const r = (R + R2) / 2;
    bm.compose(new THREE.Vector3(r * Math.sin(a), y - 0.06, r * Math.cos(a)), q.setFromAxisAngle(up, a), new THREE.Vector3(1, 1, 1));
    beams.setMatrixAt(i, bm);
  }
  g.add(beams);
  for (const r of [R + 0.05, (R + R2) / 2, R2 - 0.05]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 4, 128), k.mullion);
    t.rotation.x = Math.PI / 2;
    t.position.y = y - 0.04;
    g.add(t);
  }
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(R2 + 0.05, R2 + 0.05, 0.12, 96, 1, true), glowMat(GOLD, 2.4));
  lip.position.y = y - 0.3;
  g.add(lip);
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(R2, R2, 0.24, 96, 1, true), std("#c8c4bc", 0.6));
  slab.position.y = y - 0.12;
  g.add(slab);
  k.glassRing(f, R2, 1.1, 64, [], false);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(R2, 0.04, 6, 128), k.gold);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = y + 1.12;
  g.add(rail);
  // sliding doors in the glass wall: gold frames at the gaps
  for (const [a0, a1] of gaps)
    for (const a of [a0, a1]) box(g, 0.14, LEVELS[f].h, 0.14, k.gold, R * Math.sin(a), y, R * Math.cos(a));
  // floor up-lights round the balustrade
  const n = 96;
  const ups = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.02, 0.07), glowMat("#ffd28a", 1.3), n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ups.setMatrixAt(i, m.makeTranslation((R2 - 0.2) * Math.sin(a), y + 0.01, (R2 - 0.2) * Math.cos(a)));
  }
  g.add(ups);
}

/** Telescopes round the glass, each aimed at a real place in the city (bearing from the needle). */
function telescopes(k: NeedleKit, f: number, r: number, avoid: [number, number][], max = 9) {
  const items = TARGETS.map((t) => ({ t, ...k.bearing(t.x, t.z) })).sort((a, b) => a.a - b.a);
  const groups: { a: number; list: typeof items }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(angDiff(it.a, last.a)) < 0.2) last.list.push(it);
    else groups.push({ a: it.a, list: [it] });
  }
  for (const gr of groups.slice(0, max)) {
    let a = gr.list.reduce((s, x) => s + x.a, 0) / gr.list.length;
    for (const [a0, a1] of avoid) if (angDiff(a, a0) > -0.12 && angDiff(a1, a) > -0.12) a = a1 + 0.14;
    const x = r * Math.sin(a),
      z = r * Math.cos(a);
    k.put(f, "nScope", P.telescope, x, z, a + Math.PI);
    const name = gr.list.map((it) => it.t.name).join(" · ");
    k.hit(f, 0.8, 1.6, 0.8, x, z, 0, `<b>Telescope</b><span>${name}</span>`, () => {
      k.zoom = 7;
      const c = compass(gr.list[0].a);
      const stats: [string, string][] = [
        ["Bearing", `${c.deg}° ${c.name}`],
        ["Distance", `${fmt(gr.list[0].d)} m`],
      ];
      for (const it of gr.list) if (it.t.live && stats.length < 4) stats.push(it.t.live(k));
      if (gr.list.length > 1 && stats.length < 4) stats.push(["Also", gr.list.slice(1).map((it) => `${it.t.name} ${fmt(it.d)} m`).join(", ")]);
      return { eyebrow: `Telescope · ${LEVELS[f].m}`, title: name, stats };
    });
  }
}

/** A live chain screen in a gold frame, facing `rot`. */
function chainScreen(k: NeedleKit, f: number, x: number, z: number, rot: number, w: number, h: number, kind: "block" | "price" | "network") {
  const y = LEVELS[f].y;
  const s = k.screen(
    f,
    w,
    h,
    (gc, W, H) => {
      gc.fillStyle = "#06050a";
      gc.fillRect(0, 0, W, H);
      gc.fillStyle = "rgba(244,183,40,0.08)";
      for (let i = 0; i < W; i += 32) gc.fillRect(i, 0, 1, H);
      gc.textAlign = "left";
      if (kind === "block") {
        gc.fillStyle = "#3ee08f";
        gc.font = `800 30px ${MONO}`;
        gc.fillText("● LIVE · MAINNET", 28, 52);
        gc.fillStyle = "#f4ecd8";
        gc.font = `800 96px ${MONO}`;
        fitText(gc, k.height ? `#${fmt(k.height)}` : "…", 28, H * 0.5);
        const s = k.sinceBlock;
        gc.fillStyle = GOLD;
        gc.font = `700 34px ${MONO}`;
        fitText(gc, s != null ? `last block ${s} s ago` : "", 28, H * 0.68);
        gc.fillStyle = "#c9b48a";
        gc.font = `600 30px ${MONO}`;
        fitText(gc, `MEMPOOL ${k.mempool} tx`, 28, H * 0.86);
        // progress to the next block
        const u = s != null ? Math.min(1, s / 75) : 0;
        gc.fillStyle = "#2a2418";
        gc.fillRect(W * 0.55, H * 0.82, W * 0.4, 18);
        gc.fillStyle = GOLD;
        gc.fillRect(W * 0.55, H * 0.82, W * 0.4 * u, 18);
      } else if (kind === "price") {
        const p = k.price;
        gc.fillStyle = "#c9b48a";
        gc.font = `700 30px ${MONO}`;
        gc.fillText("ZEC / USD", 28, 52);
        if (!p) return;
        gc.fillStyle = "#f4ecd8";
        gc.font = `800 92px ${MONO}`;
        gc.fillText(`$${p.usd.toFixed(2)}`, 28, 150);
        gc.fillStyle = p.usd_24h_change >= 0 ? "#3ee08f" : "#ff5a5a";
        gc.font = `700 36px ${MONO}`;
        gc.fillText(`${p.usd_24h_change >= 0 ? "▲" : "▼"} ${Math.abs(p.usd_24h_change).toFixed(2)}% 24 h`, 28, 200);
        const hs = p.history.map((q) => q[1]);
        if (hs.length > 1) {
          const lo = Math.min(...hs),
            hi = Math.max(...hs);
          const x0 = 28,
            x1 = W - 28,
            y0 = H - 24,
            y1 = 230;
          gc.strokeStyle = GOLD;
          gc.lineWidth = 4;
          gc.beginPath();
          hs.forEach((v, i) => {
            const px = x0 + ((x1 - x0) * i) / (hs.length - 1),
              py = y0 - ((y0 - y1) * (v - lo)) / (hi - lo || 1);
            if (i) gc.lineTo(px, py);
            else gc.moveTo(px, py);
          });
          gc.stroke();
          gc.fillStyle = "#8a7a5a";
          gc.font = `500 20px ${MONO}`;
          gc.textAlign = "right";
          gc.fillText(`${hs.length} d · $${lo.toFixed(0)}–$${hi.toFixed(0)}`, x1, y1 - 8);
          gc.textAlign = "left";
        }
      } else {
        const m = k.market;
        gc.fillStyle = "#c9b48a";
        gc.font = `700 30px ${MONO}`;
        gc.fillText("NETWORK", 28, 52);
        const rows: [string, string][] = [
          ["Hashrate", m.network ? `${fmt(m.network.solps / 1e9, 2)} GSol/s` : "…"],
          ["Txs 24 h", m.network ? fmt(m.network.txs_24h) : "…"],
          ["Shielded", m.pools ? `${fmt(m.pools.shielded / 1e8 / 1e6, 2)} M ZEC` : "…"],
          ["Supply", m.supply ? `${fmt(m.supply.supply / 1e8 / 1e6, 2)} M ZEC` : "…"],
          ["Halving", m.supply ? `#${fmt(m.supply.next_halving_height)}` : "…"],
        ];
        rows.forEach(([a, b], i) => {
          gc.fillStyle = "#a89a80";
          gc.font = `600 30px ${MONO}`;
          gc.fillText(a, 28, 110 + i * 54);
          gc.fillStyle = "#f4ecd8";
          gc.font = `800 34px ${MONO}`;
          gc.textAlign = "right";
          fitText(gc, b, W - 28, 110 + i * 54, W * 0.6);
          gc.textAlign = "left";
        });
      }
    },
    1,
  );
  s.position.set(x, y + 1.15 + h / 2, z);
  s.rotation.y = rot;
  const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.05), k.gold);
  fr.position.set(x - Math.sin(rot) * 0.03, y + 1.15 + h / 2, z - Math.cos(rot) * 0.03);
  fr.rotation.y = rot;
  k.groups[f].add(fr);
  k.hit(f, w, h, 0.1, x, z, 1.15, `<b>${kind === "block" ? "Live block" : kind === "price" ? "ZEC / USD" : "Network"}</b><span>live</span>`, () => {
    const m = k.market;
    if (kind === "block") return { eyebrow: "Live", title: k.height ? `#${fmt(k.height)}` : "…", mono: true, stats: [["Mempool", `${k.mempool} tx`], ["Last block", k.sinceBlock != null ? `${k.sinceBlock} s ago` : "…"], ["Target", "75 s"]], link: k.height ? { href: `https://zscan.cash/block/${k.height}`, label: "Block on ZScan" } : undefined };
    if (kind === "price") return { eyebrow: "ZEC / USD", title: k.price ? `$${k.price.usd.toFixed(2)}` : "…", stats: k.price ? [["24 h", `${k.price.usd_24h_change.toFixed(2)}%`], ["Market cap", `$${fmt(k.price.market_cap_usd / 1e9, 2)} B`], ["Volume 24 h", `$${fmt(k.price.volume_24h_usd / 1e6, 1)} M`]] : [] };
    return { eyebrow: "Network", title: "Zcash mainnet", stats: [["Hashrate", m.network ? `${fmt(m.network.solps / 1e9, 2)} GSol/s` : "…"], ["Txs 24 h", m.network ? fmt(m.network.txs_24h) : "…"], ["Shielded", m.pools ? `${(m.pools.shielded_ratio * 100).toFixed(1)}%` : "…"], ["Supply", m.supply ? `${fmt(m.supply.supply / 1e8 / 1e6, 2)} M` : "…"]] };
  }, rot);
}

/** A height marker etched on the glass, facing in. */
function marker(k: NeedleKit, f: number, R: number, a: number) {
  const ft = Math.round(LEVELS[f].y * 3.281);
  k.label(f, `${LEVELS[f].m} · ${fmt(ft)} ft`, (R - 0.06) * Math.sin(a), 2.1, (R - 0.06) * Math.cos(a), { h: 0.2, color: "#ffe6b0", rot: a + Math.PI });
}

/** 22 — AT THE TOP, 82 m: glass all round onto the real city, a terrace, telescopes, live screens. */
export function atTheTop(k: NeedleKit) {
  const f = 2,
    g = k.groups[f],
    y = LEVELS[f].y,
    h = LEVELS[f].h;
  const R = 12,
    R2 = 14.6,
    c = 3.5;
  const gaps: [number, number][] = [
    [0.94, 1.08],
    [2.3, 2.44],
  ];
  const floorT = deckFloor([5.2, 8, 11.4], R);
  k.roundShell(f, R, new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.18, metalness: 0.3 }), std("#121016", 0.9), { segs: 40, gaps });
  terrace(k, f, R, R2, gaps);
  k.core(f, c, new THREE.MeshStandardMaterial({ color: "#2a2228", roughness: 0.35, metalness: 0.3 }));
  // ceiling: a cove ring of light near the glass, downlights
  const cove = new THREE.Mesh(new THREE.TorusGeometry(R - 0.6, 0.05, 6, 120), glowMat("#ffd8a0", 1.4));
  cove.rotation.x = Math.PI / 2;
  cove.position.y = y + h - 0.05;
  g.add(cove);
  const dl = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12), glowMat("#fff0d8", 1.6), 36);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 36; i++) {
    const a = (i / 18) * Math.PI * 2,
      r = i < 18 ? 6.4 : 9.4;
    dl.setMatrixAt(i, m.makeTranslation(r * Math.sin(a + (i < 18 ? 0 : 0.17)), y + h - 0.02, r * Math.cos(a + (i < 18 ? 0 : 0.17))));
  }
  g.add(dl);
  // the floor glow round the glass
  const strip = new THREE.Mesh(new THREE.RingGeometry(R - 0.32, R - 0.26, 120), glowMat("#ffcf70", 1.6));
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = y + 0.012;
  g.add(strip);
  k.label(f, "AT THE TOP", 0, 3.6, c + 0.06, { h: 0.5, color: GOLD });
  // live screens on the core
  chainScreen(k, f, -c - 0.04, 0, -Math.PI / 2, 4.4, 2.5, "block");
  chainScreen(k, f, c + 0.04, 0, Math.PI / 2, 4.4, 2.5, "price");
  chainScreen(k, f, 0, -c - 0.04, Math.PI, 4.4, 2.5, "network");
  // telescopes at the glass, aimed at the real places
  telescopes(k, f, R - 0.9, gaps);
  for (const a of [0.45, 1.7, 3.0, -0.5, -1.6, -2.7]) marker(k, f, R, a);
  // benches facing out, palms in gold planters
  for (const a of [0.6, 1.6, 2.9, -2.0, -0.55]) k.put(f, "bench", F.bench, (R - 3.2) * Math.sin(a), (R - 3.2) * Math.cos(a), a);
  for (const a of [Math.PI * 0.75, -Math.PI * 0.75, Math.PI / 4 + 0.15, -Math.PI / 4 - 0.15]) k.put(f, "plantDeck", () => F.plant("monstera", 9), (c + 1.6) * Math.SQRT2 * Math.sin(a), (c + 1.6) * Math.SQRT2 * Math.cos(a));
  // the gift shop on the north-east: a counter with gold needles
  const shopA = 2.0;
  const sx = 8.2 * Math.sin(shopA),
    sz = 8.2 * Math.cos(shopA);
  k.put(f, "nShop", () => F.barCounter(2.6, "#f4b728"), sx, sz, shopA + Math.PI);
  for (let i = 0; i < 5; i++) {
    const n = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 6), glowMat("#ffcf5a", 1.2));
    const off = (i - 2) * 0.42;
    n.position.set(sx + Math.cos(shopA) * off, y + 1.3, sz - Math.sin(shopA) * off);
    g.add(n);
  }
  k.label(f, "AT THE TOP · STORE", sx * 1.17, 2.5, sz * 1.17, { h: 0.22, color: GOLD, rot: shopA + Math.PI });
  void k.person(f, 6161, [sx * 1.1, sz * 1.1], "Host", { face: new THREE.Vector3(-Math.sin(shopA), 0, -Math.cos(shopA)) });
  k.hit(f, 2.8, 1.2, 0.8, sx, sz, 0, "<b>At the Top · Store</b><span>gold needles</span>", () => ({ eyebrow: "Store", title: "Gold needle · 1:400", stats: [["Height", "41 cm"], ["Price", k.price ? `${(49 / k.price.usd).toFixed(3)} ZEC` : "…"]] }), shopA);

  // visitors along the glass, phones up; a guide; a few out on the terrace
  const vis: [number, number, number, boolean][] = [
    [0.05, 10.6, 101, true],
    [0.3, 10.7, 102, true],
    [-0.35, 10.5, 103, false],
    [-0.95, 10.6, 104, true],
    [-1.3, 10.5, 105, true],
    [-1.9, 10.6, 106, false],
    [-2.6, 10.6, 107, true],
    [1.4, 10.6, 108, true],
    [2.9, 10.4, 109, false],
    [1.0, 13.6, 110, true],
    [1.25, 13.7, 111, true],
    [2.6, 13.8, 112, false],
  ];
  for (const [a, r, id, ph] of vis) void k.person(f, id, [r * Math.sin(a), r * Math.cos(a)], "Visitor", { face: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), phone: ph });
  void k.person(f, 2222, [5.5, 5.2], "Guide", { face: new THREE.Vector3(1, 0, 1), wander: [[5.5, 5.2], [-6, 5], [-6.5, -5], [6.5, -5.5]] });
  void k.person(f, 2323, [-7, 3], "Photographer", { phone: true, wander: [[-7, 3], [7.5, 2], [0, -8], [-3, 8]] });

  k.light(f, 0, 7, "#ffe2b8", 10, -0.5, 18);
  k.light(f, 0, -7, "#ffe2b8", 9, -0.5, 18);
  k.light(f, 7, 0, "#ffd8a8", 8, -0.5, 16);
  k.light(f, -7, 0, "#ffd8a8", 8, -0.5, 16);
}

/** 41 — AT THE TOP SKY, 150 m: an intimate lounge, glass all round, a terrace, the highest view. */
export function sky(k: NeedleKit) {
  const f = 4,
    g = k.groups[f],
    y = LEVELS[f].y,
    h = LEVELS[f].h;
  const R = 9,
    R2 = 11,
    c = 3;
  const gaps: [number, number][] = [[1.45, 1.63]];
  const floorT = deckFloor([4.6, 8.4], R, "#2a2228");
  k.roundShell(f, R, new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.25, metalness: 0.2 }), std("#14121a", 0.9), { segs: 32, gaps });
  terrace(k, f, R, R2, gaps);
  k.core(f, c, new THREE.MeshStandardMaterial({ color: "#c9b48a", roughness: 0.3, metalness: 0.6 }));
  const cove = new THREE.Mesh(new THREE.TorusGeometry(R - 0.5, 0.05, 6, 100), glowMat("#ffcf80", 1.6));
  cove.rotation.x = Math.PI / 2;
  cove.position.y = y + h - 0.05;
  g.add(cove);
  // a gold ring chandelier over the lounge
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6 - i * 0.25, 0.03, 6, 100), glowMat("#ffe0a0", 1.4));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y + h - 0.35 - i * 0.18;
    g.add(ring);
  }
  k.put(f, "nRugSky", () => F.rug(5.4, 3.4, "#3a1a22", "#c9a227"), 0, 6.3, 0, { solid: false });
  // sofas facing out to the south and the west, champagne, side lamps
  for (const [a, r] of [[0.0, 6.9], [-0.75, 6.8], [0.75, 6.8], [-2.4, 6.4], [2.6, 6.4]] as [number, number][]) k.put(f, "nSkySofa", () => P.loungeSofa("#e8dcc4", 3), r * Math.sin(a), r * Math.cos(a), a + Math.PI);
  k.put(f, "nCart", P.champagneCart, -2.2, 4.4, 0.4);
  for (const a of [0.38, -0.38]) k.put(f, "nSideLamp", P.sideLamp, 7.2 * Math.sin(a), 7.2 * Math.cos(a), 0);
  telescopes(k, f, R - 0.8, gaps, 5);
  for (const a of [0.3, 2.2, -1.2, -2.6]) marker(k, f, R, a);
  k.label(f, "AT THE TOP SKY", 0, 3.4, c + 0.06, { h: 0.42, color: GOLD });
  chainScreen(k, f, -c - 0.04, 0, -Math.PI / 2, 3.6, 2.0, "block");
  chainScreen(k, f, c + 0.04, 0, Math.PI / 2, 3.6, 2.0, "price");
  // the plaque: the highest public deck in ZStreet
  const plaque = k.screen(f, 2.4, 1.2, (gc, W, H) => {
    gc.fillStyle = "#1a1410";
    gc.fillRect(0, 0, W, H);
    gc.strokeStyle = GOLD;
    gc.lineWidth = 6;
    gc.strokeRect(10, 10, W - 20, H - 20);
    gc.textAlign = "center";
    gc.fillStyle = GOLD;
    gc.font = `800 64px ${MONO}`;
    gc.fillText("150 m", W / 2, H * 0.45);
    gc.font = `600 24px ${MONO}`;
    gc.fillStyle = "#e9d8b0";
    gc.fillText("492 ft · L41 · ZEC NEEDLE", W / 2, H * 0.7);
    gc.textAlign = "left";
  }, 999);
  plaque.position.set(0, y + 1.6, -c - 0.05);
  plaque.rotation.y = Math.PI;
  // guests: champagne and photos
  void k.person(f, 3333, [-1.2, 6.6], "Guest", { sit: true, dy: 0.42, face: new THREE.Vector3(0, 0, 1) });
  void k.person(f, 3334, [0.6, 6.6], "Guest", { sit: true, dy: 0.42, face: new THREE.Vector3(0, 0, 1), phone: true });
  void k.person(f, 3335, [-7.4, -3.4], "Visitor", { face: new THREE.Vector3(-1, 0, -0.4), phone: true });
  void k.person(f, 3336, [5.6, -6.2], "Visitor", { face: new THREE.Vector3(0.7, 0, -0.8), phone: true });
  void k.person(f, 3337, [(R + 1) * Math.sin(1.54), (R + 1) * Math.cos(1.54)], "Visitor", { face: new THREE.Vector3(1, 0, 0), phone: true });
  void k.person(f, 3338, [-4.6, 2.2], "Host", { wander: [[-4.6, 2.2], [4.4, 3], [0, -5.5]] });
  k.light(f, 0, 5.5, "#ffe2b0", 9, -0.6, 14);
  k.light(f, 5, -4, "#ffd8a8", 6, -0.6, 14);
  k.light(f, -5, -4, "#ffd8a8", 6, -0.6, 14);
}
