import * as THREE from "three";
import { Market } from "../../data/market";
import { EXPLORER, ZScan } from "../../data/zscan";
import type { ArchiveBlock } from "../../data/types";
import { place } from "../furniture";
import { glowMat, textPlane } from "../kit";
import { bake, Geo } from "./geo";
import type { PyramidKit } from "./kit";
import type { Game } from "./labyrinth";
import { brazier, chest, coffin, lid, mummy, sarcophagus } from "./models";

/**
 * Level 2: the KING'S CHAMBER. Red Aswan granite, a flat roof of nine beams, the lidless
 * sarcophagus (the Sprout pool, Zcash's first), three gilded coffins (Sapling, Orchard, Ironwood)
 * and, on a stepped dais, the TREASURE: the golden chest of the genesis block, spilling coins,
 * guarded by two mummies. The two air shafts let in a thread of starlight.
 */

const X = 7,
  Z0 = -9,
  Z1 = -1,
  H = 5.8;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);

/** Genesis, as the API returned it on 2026-10-06 (shown until the live answer is in). */
const GENESIS: Partial<ArchiveBlock> = {
  height: 0,
  hash: "00040fe8ec8471911baa1db1266ea15dd06b4a8a5c453883c000b031973dce08",
  time: "2016-10-28T07:56:00Z",
  tx_count: 1,
  size: 1692,
  next_hash: null,
};
const GENESIS_TX = "c4eaa58879081de3c24a7b117ed2b28300e7ec4c4c1dff1d3f1268b7857a4ddb";

export function chamber(k: PyramidKit, game: Game) {
  const f = 2;
  const Y = k.y(f);
  const g = k.groups[f];
  const rects = k.rects[f];

  let genesis: Partial<ArchiveBlock> = GENESIS;
  let genesisTx = GENESIS_TX;
  void ZScan.blockDetail(0).then((b) => {
    if (!b) return;
    genesis = b;
    genesisTx = b.txs?.[0]?.txid ?? GENESIS_TX;
  });
  let block1: string | null = null;
  void ZScan.blockDetail(1).then((b) => b && (block1 = b.time));
  Market.subscribe(() => {});

  const walls = new Geo(2.6),
    floor = new Geo(2.6),
    ceil = new Geo(2.6),
    panels = new Geo(1);

  // ---- the room
  floor.flat(-X, Z0, X, Z1, Y);
  walls.box(-X - 0.6, Y, Z0, -X, Y + H, Z1, ["nx", "bottom", "top"]);
  walls.box(X, Y, Z0, X + 0.6, Y + H, Z1, ["px", "bottom", "top"]);
  walls.box(-X - 0.6, Y, Z0 - 0.6, X + 0.6, Y + H, Z0, ["nz", "bottom", "top"]);
  walls.box(-X - 0.6, Y, Z1, -0.8, Y + H, Z1 + 0.6, ["pz", "bottom", "top"]);
  walls.box(0.8, Y, Z1, X + 0.6, Y + H, Z1 + 0.6, ["pz", "bottom", "top"]);
  walls.box(-0.8, Y + 2.3, Z1, 0.8, Y + H, Z1 + 0.6, ["pz", "top"]);
  rects.push([-X - 0.6, Z0, -X, Z1], [X, Z0, X + 0.6, Z1], [-X, Z0 - 0.6, X, Z0], [-X, Z1, -0.8, Z1 + 0.6], [0.8, Z1, X, Z1 + 0.6]);
  // nine roof beams, each sagging a little differently
  for (let i = 0; i < 9; i++) {
    const x0 = -X + (i * 2 * X) / 9,
      x1 = -X + ((i + 1) * 2 * X) / 9;
    const sag = [0.02, 0.05, 0, 0.03, 0.06, 0.01, 0.04, 0, 0.03][i];
    walls.box(x0 + 0.02, Y + H - sag, Z0, x1 - 0.02, Y + H + 0.5, Z1, ["top"]);
  }
  ceil.flat(-X, Z0, X, Z1, Y + H + 0.5, false);

  // ---- the antechamber passage, with its portcullis grooves and slabs drawn up
  floor.flat(-0.8, Z1, 0.8, 3.8, Y);
  walls.box(-1.4, Y, Z1 + 0.6, -0.8, Y + 2.3, 3.8, ["nx", "bottom", "top"]);
  walls.box(0.8, Y, Z1 + 0.6, 1.4, Y + 2.3, 3.8, ["px", "bottom", "top"]);
  ceil.flat(-0.8, Z1, 0.8, 3.8, Y + 2.3, false);
  walls.box(-0.8, Y, 3.8, 0.8, Y + 2.3, 4.4, ["pz"]);
  rects.push([-1.4, Z1, -0.8, 4.4], [0.8, Z1, 1.4, 4.4], [-0.8, 3.8, 0.8, 4.4]);
  for (const z of [0.4, 1.3, 2.2]) {
    walls.box(-0.8, Y + 1.95, z, 0.8, Y + 2.3, z + 0.32, ["top"]);
    for (const s of [-1, 1]) walls.box(s * 0.8 - 0.04, Y, z + 0.04, s * 0.8 + 0.04, Y + 1.95, z + 0.28, []);
  }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.9), new THREE.MeshBasicMaterial({ color: "#050302" }));
  back.position.set(0, Y + 0.95, 3.79);
  back.rotation.y = Math.PI;
  g.add(back);
  k.pick(f, back, "<b>▼ Grand Gallery</b><span>back down</span>", () => ({ eyebrow: "Passage", title: "Grand Gallery", floor: 1 }));
  const down = textPlane("▼ GRAND GALLERY", { h: 0.2, glow: true, color: "#f4b728" });
  down.position.set(0, Y + 2.08, 3.78);
  down.rotation.y = Math.PI;
  g.add(down);

  // ---- braziers in the corners, carvings, the air shafts
  for (const [x, z] of [
    [-6.2, -1.8],
    [6.2, -1.8],
    [-6.2, -8.2],
    [6.2, -8.2],
  ]) {
    place(g, "pyr-brazier", brazier, x, Y, z, 0);
    rects.push([x - 0.4, z - 0.4, x + 0.4, z + 0.4]);
    k.glow(f, V(x, Y + 1.3, z), new THREE.Color(1.8, 0.85, 0.32), 9);
  }
  for (let i = 0; i < 6; i++) {
    const x = -5 + i * 2;
    if (Math.abs(x - 2.6) < 0.8) continue;
    k.panelOn(panels, i + 2, V(x, Y + 1.2, Z0), V(0, 0, 1), 1.1, 2.2);
  }
  for (const x of [-5.2, -3.2, 3.2, 5.2]) k.panelOn(panels, Math.abs(x) > 4 ? 6 : 1, V(x, Y + 1.2, Z1), V(0, 0, -1), 1.1, 2.2);
  k.torch(f, V(-2.0, Y + 1.7, Z1), V(0, 0, -1), -1, 7);
  k.torch(f, V(2.0, Y + 1.7, Z1), V(0, 0, -1), -1, 7);
  const shaftMat = new THREE.MeshBasicMaterial({ color: "#020101" });
  for (const z of [Z0 + 0.01, Z1 - 0.01]) {
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.2), shaftMat);
    hole.position.set(2.6, Y + 1.0, z);
    if (z > -5) hole.rotation.y = Math.PI;
    g.add(hole);
  }
  // ---- the sarcophagus and its lid
  const sar = place(g, "pyr-sarcophagus", sarcophagus, -4.6, Y, -5, 0);
  rects.push([-5.25, -6.2, -3.95, -3.8]);
  place(g, "pyr-lid", lid, -6.82, Y, -5.6, Math.PI / 2);
  rects.push([-7, -6.3, -6.5, -4.9]);
  const zec = (zat: number | undefined) => (zat === undefined ? "—" : `${(zat / 1e8).toLocaleString("en-US", { maximumFractionDigits: 0 })} ZEC`);
  k.pick(f, sar, "<b>Sarcophagus</b><span>Sprout</span>", () => {
    const p = Market.state.pools;
    return { eyebrow: "Sarcophagus · Sprout pool", title: zec(p?.pools.sprout), mono: true, tag: ["Since block 0", "muted"], stats: [["Pool", "Sprout"], ["Launched", "2016-10-28"]], link: { href: `${EXPLORER}/supply`, label: "Pools on ZScan" } };
  });
  // three coffins on the east wall: the later pools
  const pools: [string, "sapling" | "orchard" | "ironwood", string][] = [
    ["Sapling", "sapling", "2018-10-28 · block 419,200"],
    ["Orchard", "orchard", "2022-05-31 · block 1,687,104"],
    ["Ironwood", "ironwood", ""],
  ];
  pools.forEach(([name, key, since], i) => {
    const z = -3.2 - i * 1.8;
    const c = place(g, `pyr-coffin${i}`, () => coffin(i + 1), 6.55, Y, z, -Math.PI / 2);
    rects.push([6.2, z - 0.5, 7, z + 0.5]);
    k.pick(f, c, `<b>Coffin</b><span>${name}</span>`, () => {
      const p = Market.state.pools;
      return { eyebrow: `Coffin · ${name} pool`, title: zec(p?.pools[key]), mono: true, tag: since ? [since, "muted"] : undefined, stats: p ? [["Pool", name], ["24h", `${(p.change_24h?.[key] ?? 0) >= 0 ? "+" : ""}${((p.change_24h?.[key] ?? 0) / 1e8).toLocaleString("en-US", { maximumFractionDigits: 0 })} ZEC`]] : [["Pool", name]], link: { href: `${EXPLORER}/supply`, label: "Pools on ZScan" } };
    });
  });

  // ---- the treasure: dais, chest, coins and bars, the label, gold motes
  const DX = 1.2,
    DZ = -5;
  const dais = new Geo(2.6);
  dais.box(DX - 1.7, Y, DZ - 1.7, DX + 1.7, Y + 0.2, DZ + 1.7, ["bottom"]);
  dais.box(DX - 1.35, Y + 0.2, DZ - 1.35, DX + 1.35, Y + 0.4, DZ + 1.35, ["bottom"]);
  dais.box(DX - 1.0, Y + 0.4, DZ - 1.0, DX + 1.0, Y + 0.6, DZ + 1.0, ["bottom"]);
  rects.push([DX - 1.6, DZ - 1.6, DX + 1.6, DZ + 1.6]);
  const ch = place(g, "pyr-chest", chest, DX, Y + 0.6, DZ, 0);
  k.glow(f, V(DX, Y + 1.6, DZ + 0.6), new THREE.Color(2.0, 1.35, 0.35), 7.5);
  const genesisInfo = () => {
    const b = genesis;
    const t = b.time ? new Date(b.time) : null;
    const when = t ? `${t.toISOString().slice(0, 10)} ${t.toISOString().slice(11, 16)} UTC` : "—";
    const rows: [string, string][] = [
      ["Hash", b.hash ?? "—"],
      ["Coinbase", genesisTx],
      ["Next block", block1 ? `#1 · ${block1.slice(0, 10)}` : "#1"],
    ];
    return {
      eyebrow: "Treasure · genesis block",
      title: "Block 0",
      mono: true,
      tag: [game.found >= game.total ? `ⓩ ${game.found}/${game.total} · all found` : `ⓩ ${game.found}/${game.total}`, game.found >= game.total ? "ok" : "muted"] as [string, "ok" | "muted"],
      stats: [
        ["Mined", when],
        ["Transactions", String(b.tx_count ?? 1)],
        ["Size", `${(b.size ?? 0).toLocaleString("en-US")} B`],
        ["Confirmations", b.confirmations ? b.confirmations.toLocaleString("en-US") : "—"],
      ] as [string, string][],
      body: `<dl class="kvlist">${rows.map(([kk, v]) => `<div><dt>${esc(kk)}</dt><dd style="word-break:break-all">${esc(v)}</dd></div>`).join("")}</dl>`,
      link: { href: `${EXPLORER}/block/0`, label: "Block 0 on ZScan" },
    };
  };
  k.pick(f, ch, "<b>The genesis block</b><span>block 0 · open the chest</span>", genesisInfo);
  const label = textPlane("GENESIS · BLOCK 0", { h: 0.32, glow: true, color: "#f4b728" });
  label.position.set(DX, Y + 2.9, DZ);
  g.add(label);
  k.pick(f, label, "<b>The genesis block</b><span>block 0</span>", genesisInfo);
  const date = textPlane("2016-10-28 · 07:56 UTC", { h: 0.14, glow: true, color: "#ffd88a" });
  date.position.set(DX, Y + 2.62, DZ);
  g.add(date);

  // coins spilled round the dais, stacked bars at its corners
  const coinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.025, 18);
  const coins = new THREE.InstancedMesh(coinGeo, k.gold, 150);
  const m = new THREE.Matrix4(),
    qq = new THREE.Quaternion(),
    e = new THREE.Euler();
  let n = 0;
  for (let i = 0; i < 150; i++) {
    const a = (i / 150) * Math.PI * 2 * 7.3;
    const rr = 1.75 + ((i * 37) % 23) / 23;
    const x = DX + Math.cos(a) * rr * (1 + (i % 3) * 0.05),
      z = DZ + Math.sin(a) * rr;
    if (Math.abs(x - DX) < 1.7 && Math.abs(z - DZ) < 1.7) continue;
    e.set(((i % 5) - 2) * 0.12, a, ((i % 7) - 3) * 0.1);
    m.compose(V(x, Y + 0.015 + (i % 4) * 0.022, z), qq.setFromEuler(e), V(1, 1, 1));
    coins.setMatrixAt(n++, m);
  }
  // a heap on the top step, in front of the chest
  for (let i = 0; i < 40; i++) {
    const a = i * 2.4;
    const rr = (i % 9) * 0.06;
    e.set(((i % 5) - 2) * 0.2, a, 0);
    m.compose(V(DX + Math.cos(a) * rr, Y + 0.61 + Math.max(0, 0.18 - rr * 0.6) * ((i % 4) / 3), DZ + 0.8 + Math.sin(a) * rr * 0.5), qq.setFromEuler(e), V(1, 1, 1));
    coins.setMatrixAt(n++, m);
  }
  coins.count = n;
  coins.raycast = () => {};
  g.add(coins);
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.08, 0.12), k.gold, 64);
  let nb = 0;
  for (const [bx, bz] of [
    [DX - 1.2, DZ + 1.2],
    [DX + 1.2, DZ + 1.2],
    [DX - 1.2, DZ - 1.2],
    [DX + 1.2, DZ - 1.2],
  ])
    for (let l = 0; l < 3; l++)
      for (let i = 0; i < 3 - l; i++) {
        for (let j = 0; j < 2 - (l > 1 ? 1 : 0); j++) {
          m.compose(V(bx - 0.14 * (2 - l) + i * 0.28, Y + 0.24 + l * 0.08, bz - 0.07 + j * 0.13), qq.identity(), V(1, 1, 1));
          if (nb < 64) bars.setMatrixAt(nb++, m);
        }
      }
  bars.count = nb;
  bars.raycast = () => {};
  g.add(bars);

  // gold motes rising out of the chest
  const NM = 70;
  const mp = new Float32Array(NM * 3);
  const mpg = new THREE.BufferGeometry();
  mpg.setAttribute("position", new THREE.BufferAttribute(mp, 3));
  const motes = new THREE.Points(mpg, new THREE.PointsMaterial({ map: k.halo, size: 0.12, color: new THREE.Color(2.4, 1.7, 0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  motes.raycast = () => {};
  g.add(motes);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: k.halo, color: new THREE.Color(1.4, 0.95, 0.3), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(3.4);
  halo.position.set(DX, Y + 1.3, DZ + 0.1);
  halo.raycast = () => {};
  g.add(halo);
  k.ticks[f].push((_dt, t) => {
    for (let i = 0; i < NM; i++) {
      const life = (t * 0.25 + i / NM) % 1;
      const a = i * 2.39 + t * 0.3;
      const rr = 0.15 + ((i * 13) % 7) * 0.06 + life * 0.25;
      mp[i * 3] = DX + Math.cos(a) * rr;
      mp[i * 3 + 1] = Y + 1.2 + life * 2.2;
      mp[i * 3 + 2] = DZ + 0.1 + Math.sin(a) * rr;
    }
    mpg.attributes.position.needsUpdate = true;
    label.position.y = Y + 2.9 + Math.sin(t * 1.3) * 0.05;
    halo.material.opacity = 0.42 + Math.sin(t * 2.1) * 0.06;
  });

  // ---- guardians and visitors
  for (const s of [-1, 1]) {
    const mm = place(g, "pyr-mummy3", () => mummy("#ff4a2a", 3), DX + s * 2.3, Y, DZ - 1.9, 0);
    rects.push([DX + s * 2.3 - 0.35, DZ - 2.25, DX + s * 2.3 + 0.35, DZ - 1.55]);
    k.pick(f, mm, "<b>Mummy</b><span>guarding the treasure</span>", () => null);
  }
  void k.person(f, 4321, [-3.1, -3.6], "Archaeologist", { face: V(-1, 0, -0.3).normalize() });
  void k.person(f, 1, [3.6, -2.0], "Explorer", { face: V(-0.5, 0, -1).normalize() });

  // ---- bake and build
  const light = bake(k.torches[f], new THREE.Color(0.2, 0.14, 0.12));
  k.add(f, walls, k.granite, light);
  k.add(f, floor, k.granite, light);
  k.add(f, ceil, k.ceiling, light);
  k.add(f, panels, k.panel, light);
  k.add(f, dais, k.granite, light);
  const sill = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.04), glowMat("#ffb050", 1.2));
  sill.rotation.x = -Math.PI / 2;
  sill.position.set(0, Y + 0.01, 3.7);
  g.add(sill);
  k.lightUp(f);
}
