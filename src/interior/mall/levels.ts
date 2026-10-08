import * as THREE from "three";
import { links } from "../../data/zscan";
import { fitText } from "../../scene/fit";
import { hash } from "../../scene/voxel/model";
import type { Game } from "../../ui/arcade";
import { fmtSigned, fmtZec } from "../bank/art";
import * as F from "../furniture";
import { ART, marquee } from "../tower/arcade";
import type { PickInfo } from "../types";
import { bush, tree, vine } from "./atrium";
import { COL, CZ, JP, LEVELS, MallKit, MONO, NORTH, SANS, SERIF, X0, X1, Z0 } from "./kit";
import { poster, shop, type ShopDef } from "./shops";
import { Cinema } from "./cinema";
import { FILM_SLOTS, FILMS, filmInfo, filmPosterMesh } from "../../scene/films";
import { carpetTex, stoneTex, tileTex, tiledMat } from "./tex";
import { memePoster } from "../../scene/memes";
import { nextMeme } from "../../scene/memewalls";

/**
 * The levels: what stands where. Every upper level has the same plan — six shops in the side
 * columns, four along the south, the lift lobby in the south-west corner, an anchor across the
 * north — and its own trade. The ground floor has the canal with its sampan and the luxury row.
 */

type PoolKey = "transparent" | "sprout" | "sapling" | "orchard" | "ironwood";
const PAL_TOYS = ["#ff3a3a", "#3a8aff", "#ffd23a", "#3ad06a", "#ff8a2a", "#b04aff", "#ff5ab0"];
const SLOTS: [number, number][] = [
  [-40, -32],
  [-32, -24],
  [-24, -16],
];
const SOUTH: [number, number][] = [
  [-16, -5],
  [-5, 5],
  [5, 16],
];

const n = (v: number, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (v: number) => `$${v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : n(v, 2)}`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Levels {
  /** ZK CINEMA's screening rooms (level 4). */
  cine: Cinema | null = null;
  constructor(readonly k: MallKit) {}

  // ---- live figures for the panels -------------------------------------------------------------
  pool(key: PoolKey) {
    return (): Partial<PickInfo> | null => {
      const p = this.k.market.pools;
      if (!p) return null;
      const total = Object.values(p.pools).reduce((a, b) => a + b, 0);
      const ch = p.change_24h?.[key] ?? 0;
      return {
        stats: [
          [`${key[0].toUpperCase()}${key.slice(1)} pool`, `${fmtZec(p.pools[key])} ZEC`],
          ["24 h", `${fmtSigned(ch)} ZEC`],
          ["Share", `${((p.pools[key] / total) * 100).toFixed(2)} %`],
        ],
        tag: [ch >= 0 ? "Inflow" : "Outflow", ch >= 0 ? "ok" : "warn"],
      };
    };
  }
  price = (): Partial<PickInfo> | null => {
    const p = this.k.market.price;
    if (!p) return null;
    return {
      stats: [
        ["ZEC / USD", `$${n(p.usd, 2)}`],
        ["24 h", `${p.usd_24h_change >= 0 ? "+" : ""}${p.usd_24h_change.toFixed(2)} %`],
        ["Volume 24 h", usd(p.volume_24h_usd)],
        ["Market cap", usd(p.market_cap_usd)],
      ],
      tag: [`${p.usd_24h_change >= 0 ? "▲" : "▼"} ${Math.abs(p.usd_24h_change).toFixed(2)} %`, p.usd_24h_change >= 0 ? "ok" : "warn"],
    };
  };
  shielded = (): Partial<PickInfo> | null => {
    const p = this.k.market.pools;
    if (!p) return null;
    return {
      stats: [
        ["Shielded", `${fmtZec(p.shielded)} ZEC`],
        ["Of supply", `${(p.shielded_ratio * (p.shielded_ratio <= 1 ? 100 : 1)).toFixed(2)} %`],
        ["Transparent", `${fmtZec(p.pools.transparent)} ZEC`],
      ],
    };
  };
  network = (): Partial<PickInfo> | null => {
    const w = this.k.market.network;
    if (!w) return null;
    return {
      stats: [
        ["Hash rate", `${n(w.solps / 1e6, 2)} MSol/s`],
        ["Difficulty", n(w.difficulty)],
        ["Block time", `${n(w.avg_block_time, 1)} s`],
      ],
    };
  };
  txs = (): Partial<PickInfo> | null => {
    const w = this.k.market.network;
    if (!w) return null;
    return {
      stats: [
        ["Transactions 24 h", n(w.txs_24h)],
        ["Shielded 24 h", `${(w.shielded_tx_ratio_24h * (w.shielded_tx_ratio_24h <= 1 ? 100 : 1)).toFixed(1)} %`],
        ["Fees 24 h", `${fmtZec(w.fees_24h, 4)} ZEC`],
      ],
    };
  };
  supply = (): Partial<PickInfo> | null => {
    const s = this.k.market.supply,
      p = this.k.market.price;
    if (!s) return null;
    return {
      stats: [
        ["Supply", `${fmtZec(s.supply)} ZEC`],
        ["Max", `${fmtZec(s.max_supply)} ZEC`],
        ["Mined", `${((s.supply / s.max_supply) * 100).toFixed(2)} %`],
        ...(p ? ([["Market cap", usd(p.market_cap_usd)]] as [string, string][]) : []),
      ],
    };
  };
  halving = (): Partial<PickInfo> | null => {
    const s = this.k.market.supply;
    if (!s) return null;
    const left = s.next_halving_height - (this.k.height || s.height);
    return {
      stats: [
        ["Next halving", `#${n(s.next_halving_height)}`],
        ["Blocks left", n(left)],
        ["ETA", s.next_halving_eta ? new Date(s.next_halving_eta).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"],
        ["Subsidy", `${(s.block_subsidy / 1e8).toFixed(4)} ZEC`],
      ],
    };
  };
  lockbox = (): Partial<PickInfo> | null => {
    const s = this.k.market.supply;
    if (!s) return null;
    return { stats: [["Lockbox", `${fmtZec(s.lockbox)} ZEC`], ["Of supply", `${((s.lockbox / s.supply) * 100).toFixed(2)} %`]] };
  };
  blockTime = (): Partial<PickInfo> | null => {
    const s = this.k.market.supply;
    if (!s) return null;
    return { stats: [["Average block", `${n(s.avg_block_time, 1)} s`], ["Height", `#${n(this.k.height || s.height)}`]] };
  };
  lastBlock = (): Partial<PickInfo> | null => {
    const b = this.k.block;
    if (!b) return this.k.height ? { stats: [["Block", `#${n(this.k.height)}`]] } : null;
    return {
      stats: [
        ["Block", `#${n(b.height)}`],
        ["Transactions", n(b.tx_count)],
        ["Size", `${n(b.size / 1024, 1)} kB`],
        ["Mined by", b.miner_pool ?? "unknown"],
      ],
      tag: [new Date(b.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), "info"],
      link: { href: links.block(b.height), label: "Block on ZScan" },
    };
  };
  mempool = (): Partial<PickInfo> | null => {
    const list = this.k.ctx.director.mempoolList();
    const fees = list.reduce((a, t) => a + (t.fee ?? 0), 0);
    return {
      stats: [
        ["In the queue", `${list.length} tx`],
        ["Fees waiting", `${fmtZec(fees, 5)} ZEC`],
        ["Shielded", `${list.filter((t) => t.kind === "shielded").length}`],
      ],
      link: { href: "https://zscan.cash/mempool", label: "Mempool on ZScan" },
    };
  };

  // ---- shared pieces -----------------------------------------------------------------------------

  /** The columns and the south row of a level. */
  units(f: number, west: ShopDef[], east: ShopDef[], south: ShopDef[]) {
    SLOTS.forEach(([a, b], i) => {
      if (west[i]) shop(this.k, f, -COL, (a + b) / 2 - (f === 0 && i === 0 ? 0.5 : 0), Math.PI / 2, b - a + (f === 0 && i === 0 ? 1 : 0), 9, west[i]);
      if (east[i]) shop(this.k, f, COL, (a + b) / 2 - (f === 0 && i === 0 ? 0.5 : 0), -Math.PI / 2, b - a + (f === 0 && i === 0 ? 1 : 0), 9, east[i]);
    });
    if (f) SOUTH.forEach(([a, b], i) => south[i] && shop(this.k, f, (a + b) / 2, -8, Math.PI, b - a, 8, south[i]));
    if (south[3]) shop(this.k, f, 20.5, -8, Math.PI, 9, 8, south[3]);
  }

  /** The lift lobby in the south-west corner: two cars, a call panel to every level. */
  lifts(f: number) {
    const k = this.k;
    k.at(f, -20.5, -8, Math.PI);
    // local: front (open) on z = 0 facing the plaza (world −z), back wall at z = −8
    k.flat(k.gloss, "#e8dcc8", 9, 8, 0, 0.012, -4);
    k.flat(k.paint, "#7a2a34", 2.4, 6.4, 0, 0.02, -4.4);
    for (const sx of [-1, 1]) {
      // travertine walls with a walnut dado and a cove of light
      k.box(k.paint, "#d8c8ac", 0.2, 5.55, 8, sx * 4.5, 0, -4);
      k.box(k.gloss, "#5a3a24", 0.06, 1.1, 7.8, sx * 4.38, 0, -4);
      k.box(k.glow, "#ffd9a0", 0.04, 0.04, 7.8, sx * 4.36, 3.9, -4, 0, 1.4);
    }
    k.box(k.paint, "#cbb89a", 9, 5.55, 0.2, 0, 0, -8);
    k.flat(k.paint, "#f4ece0", 9, 8, 0, 4.0, -4, undefined, true);
    k.flat(k.glow, "#fff0d8", 7.6, 6.4, 0, 3.98, -4.4, undefined, true, 0.75);
    k.solid(f, -4.6, -8, -4.4, 0);
    k.solid(f, 4.4, -8, 4.6, 0);
    k.solid(f, -4.5, -8.1, 4.5, -7.6);
    k.box(k.paint, "#2a2420", 9, 1.55, 0.25, 0, 4.0, 0);
    k.sign(`LIFTS · ${LEVELS[f].label}`, 0.4, 0, 4.6, 0.14, 0, { color: "#f4e8d0" });
    k.box(k.gloss, "#cfc6b6", 0.9, 0.7, 0.9, 3.6, 0, -1.0);
    k.box(k.gloss, "#5a3a24", 1.8, 0.45, 0.5, -3.2, 0, -3.2, Math.PI / 2);
    k.solid(f, -3.5, -4.1, -2.9, -2.3);
    k.solid(f, 3.15, -1.45, 4.05, -0.55);
    // the cars: brushed gold doors in a stone frame, an indicator above
    for (const [x, dir] of [
      [-2.2, 1],
      [2.2, -1],
    ] as const) {
      const to = f + dir;
      k.box(k.gloss, "#cfc6b6", 2.0, 2.9, 0.12, x, 0, -7.85);
      k.box(k.metal, "#d8b878", 0.78, 2.4, 0.06, x - 0.4, 0, -7.76);
      k.box(k.metal, "#d8b878", 0.78, 2.4, 0.06, x + 0.4, 0, -7.76);
      k.box(k.paint, "#1a1612", 0.02, 2.4, 0.07, x, 0, -7.75);
      k.box(k.glow, to < 0 || to >= LEVELS.length ? "#3a3a3a" : dir > 0 ? "#3ee08f" : "#ff9f2e", 0.5, 0.1, 0.02, x, 3.05, -7.78, 0, 1.4);
      if (to >= 0 && to < LEVELS.length) {
        k.sign(`${dir > 0 ? "▲" : "▼"} ${LEVELS[to].label} · ${LEVELS[to].name.split(" · ")[0].toUpperCase()}`, 0.17, x, 3.4, -7.77, 0, { color: dir > 0 ? "#3ee08f" : "#ff9f2e" });
        k.hit(f, 1.6, 2.4, 0.3, x, 0, -7.6, `<b>Lift ${dir > 0 ? "up" : "down"}</b><span>${LEVELS[to].label} · ${LEVELS[to].name}</span>`, () => ({ eyebrow: "Lift", title: `${LEVELS[to].label} · ${LEVELS[to].name}`, floor: to }));
      }
    }
    // the call panel: one button per level
    k.box(k.gloss, "#1a1612", 0.5, 1.6, 0.06, 0, 0.6, -7.8);
    LEVELS.forEach((L, i) => {
      const y = 0.85 + i * 0.26;
      k.box(k.glow, i === f ? "#f4b728" : "#e8e0d0", 0.14, 0.14, 0.02, 0, y, -7.75, 0, i === f ? 1.8 : 0.9);
      if (i !== f) k.hit(f, 0.3, 0.22, 0.2, 0, y - 0.04, -7.7, `<b>${L.label}</b><span>${L.name}</span>`, () => ({ eyebrow: "Lift", title: `${L.label} · ${L.name}`, floor: i }));
    });
    // the directory beside the doors
    k.screen(f, 1.3, 2.2, -4.35, 1.7, -5.6, Math.PI / 2, (g, W, H) => {
      g.fillStyle = "#0c0b10";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#f4b728";
      g.font = `800 52px ${MONO}`;
      g.textAlign = "center";
      fitText(g, "ZK MALL", W / 2, 70);
      g.font = `600 22px ${JP}`;
      g.fillStyle = "#c8b89a";
      g.fillText("ZKモール · 购物中心", W / 2, 106);
      [...LEVELS].reverse().forEach((L, j) => {
        const i = LEVELS.length - 1 - j;
        const y = 170 + j * 140;
        g.fillStyle = i === f ? "#f4b728" : "#2a2630";
        g.fillRect(24, y - 50, 84, 84);
        g.fillStyle = i === f ? "#0c0b10" : "#ffffff";
        g.font = `800 56px ${MONO}`;
        g.fillText(L.label, 66, y + 12);
        g.textAlign = "left";
        g.fillStyle = "#ffffff";
        g.font = `600 26px ${SANS}`;
        L.name.split(" · ").forEach((part, q) => fitText(g, part, 128, y - 14 + q * 32, W - 150));
        g.textAlign = "center";
      });
      g.fillStyle = "#7fe3ff";
      g.font = `600 24px ${MONO}`;
      fitText(g, k.height ? `BLOCK #${n(k.height)}` : "", W / 2, H - 30);
    }, 10, 360);
    // memes framed on the lobby's walls: over the bench, and opposite
    for (const [lx, ly, lz, lr] of [
      [4.36, 2.15, -4.6, -Math.PI / 2],
      [-4.36, 2.0, -2.3, Math.PI / 2],
    ]) {
      const p = memePoster(nextMeme(), 1.15, { kind: "frame", frame: "#5a3a24" });
      p.position.copy(k.world(lx, ly, lz));
      p.rotation.y = Math.PI + lr;
      k.groups[f].add(p);
    }
    bush(k, 3.6, 0.7, -1.0, 0.8, 900 + f);
    tree(k, 3.6, 0.7, -1.0, 2.6, 910 + f);
  }

  /** Benches, planters and trees in the corner plazas, and a few shoppers. */
  plazas(f: number) {
    const k = this.k;
    k.at(f);
    for (const sx of [-1, 1]) {
      const x = sx * 20.5;
      if (!(f === 0 && sx > 0)) {
        k.box(k.gloss, "#cfc6b6", 2.4, 0.5, 2.4, x, 0, -12);
        tree(k, x, 0.5, -12, 3.2 + (f % 2), f * 10 + sx + 50);
        bush(k, x - 0.7, 0.5, -11.4, 0.6, f * 10 + sx + 60);
        k.solid(f, x - 1.2, -13.2, x + 1.2, -10.8);
        for (const dz of [-1.9, 1.9]) {
          k.box(k.gloss, "#8a5a36", 2.2, 0.08, 0.5, x, 0.42, -12 + dz);
          k.box(k.paint, "#2a2a30", 2.0, 0.42, 0.3, x, 0, -12 + dz);
          k.solid(f, x - 1.1, -12 + dz - 0.25, x + 1.1, -12 + dz + 0.25);
        }
      }
    }
  }

  /**
   * Shoppers walking loops of straight corridor legs (bags in hand), a few standing at windows,
   * and staff; ids from the 10,000, seeded per level.
   */
  crowd(f: number, n: number, loops: [number, number][][], staff: [number, number, number?][] = []) {
    const k = this.k;
    const bagCols = ["#f4b728", "#1a1a1e", "#ff7ab0", "#ffffff", "#3a7ac8", "#e85a2a", "#c8b088"];
    for (let i = 0; i < n; i++) {
      const loop = loops[i % loops.length];
      const j = Math.floor(hash(i, f, 9, 1) * loop.length);
      const [a, b] = [loop[j], loop[(j + 1) % loop.length]];
      const t = hash(i, f, 8, 2);
      const id = 1 + Math.floor(hash(i, f, 13, 5) * 9999);
      const bags = hash(i, f, 2, 2) > 0.3 ? [bagCols[Math.floor(hash(i, f, 3, 3) * bagCols.length)], ...(hash(i, f, 4, 4) > 0.6 ? [bagCols[Math.floor(hash(i, f, 5, 5) * bagCols.length)]] : [])] : undefined;
      k.at(f);
      const still = i % 4 === 3;
      void k.person(f, id, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], "Shopper", { bags, wander: still ? undefined : loop, face: new THREE.Vector3(hash(i, 6, f, 1) - 0.5, 0, hash(i, 7, f, 1) - 0.5).normalize() });
    }
    staff.forEach(([x, z, ry], i) => {
      k.at(f);
      void k.person(f, 1 + Math.floor(hash(i, f, 17, 9) * 9999), [x, z], "Staff", { face: new THREE.Vector3(Math.sin(ry ?? 0), 0, Math.cos(ry ?? 0)) });
    });
  }

  /** The corridor loop round the void on an upper level. */
  ring(): [number, number][] {
    return [
      [-13.3, -37.4],
      [-13.3, -30],
      [-13.3, -22],
      [-13.3, -11],
      [-6, -11],
      [0, -11],
      [6, -11],
      [13.3, -11],
      [13.3, -22],
      [13.3, -30],
      [13.3, -37.4],
      [6, -37.4],
      [0, -37.4],
      [-6, -37.4],
    ];
  }

  // ---- G: the canal, the Rain Vortex garden, the luxury row ----------------------------------------
  ground() {
    const k = this.k,
      f = 0;
    this.lifts(f);
    this.plazas(f);
    // the north luxury row on the far bank
    const lux: ShopDef[] = [
      { brand: "SHIELD&CO", kind: "luxury", color: "#f4e6c8", sub: "MAISON · 1886", font: `500 80px ${SERIF}`, info: this.shielded },
      { brand: "ZATOSHI", kind: "jewels", color: "#ffe2a8", sub: "JOAILLIER", font: `500 80px ${SERIF}`, info: this.supply },
      { brand: "HALVING", kind: "watches", color: "#d8dce4", sub: "HAUTE HORLOGERIE", font: `600 80px ${SERIF}`, info: this.halving },
      { brand: "MEMO", kind: "perfume", color: "#f4e0b8", sub: "PARFUMS · 香水", font: `400 80px ${SERIF}` },
      { brand: "CLEAR OPTICS", kind: "optics", color: "#ffffff", sub: "TRANSPARENT SINCE 2016", info: this.pool("transparent") },
    ];
    lux.forEach((d, i) => shop(k, f, -20 + i * 10, -48, 0, 10, 8, d));
    this.units(
      f,
      [
        { brand: "VIEWKEY", kind: "luxury", color: "#e8d8b8", sub: "LEATHER GOODS", font: `500 80px ${SERIF}` },
        { brand: "FROST FLOWERS", kind: "florist", color: "#c8f0d0", sub: "花店" },
        { brand: "LOCKBOX", kind: "luggage", color: "#f4b728", sub: "TRAVEL", info: this.lockbox },
      ],
      [
        { brand: "NULLIFIER", kind: "fashion", color: "#ffffff", sub: "HOMME", font: `600 80px ${SERIF}` },
        { brand: "BLOCK BAKERY", kind: "cafe", color: "#ffd08a", sub: "FRESH EVERY 75 s", info: this.lastBlock },
        { brand: "HALO CAFÉ", kind: "cafe", color: "#ffc070", sub: "咖啡 · COFFEE", info: this.blockTime },
      ],
      [],
    );
    // the bureau de change, south-east, with its live rate board
    shop(k, f, 20.5, -8, Math.PI, 9, 8, { brand: "ZEC EXCHANGE", kind: "exchange", color: "#f4b728", sub: "BUREAU DE CHANGE · 兑换", info: this.price });
    k.screen(f, 6.6, 2.0, 0, 2.6, -7.7, 0, (g, W, H) => {
      g.fillStyle = "#07070a";
      g.fillRect(0, 0, W, H);
      const p = k.market.price;
      g.fillStyle = "#f4b728";
      g.font = `800 ${H * 0.16}px ${MONO}`;
      g.textAlign = "left";
      g.fillText("ⓩ ZEC", 24, H * 0.24);
      g.textAlign = "right";
      g.fillStyle = "#ffffff";
      fitText(g, p ? `$${n(p.usd, 2)}` : "…", W - 24, H * 0.24);
      const rows: [string, string][] = p
        ? [
            ["24 H", `${p.usd_24h_change >= 0 ? "▲ +" : "▼ "}${p.usd_24h_change.toFixed(2)} %`],
            ["VOLUME", usd(p.volume_24h_usd)],
            ["MKT CAP", usd(p.market_cap_usd)],
          ]
        : [];
      g.font = `700 ${H * 0.11}px ${MONO}`;
      rows.forEach(([a, b], i) => {
        g.textAlign = "left";
        g.fillStyle = "#8a8678";
        g.fillText(a, 24, H * (0.46 + i * 0.17));
        g.textAlign = "right";
        g.fillStyle = i === 0 ? (p!.usd_24h_change >= 0 ? "#3ee08f" : "#ff5a5a") : "#e8e0c8";
        g.fillText(b, W - 24, H * (0.46 + i * 0.17));
      });
      // two weeks of closes
      if (p?.history?.length) {
        const h = p.history.map((x) => x[1]);
        const lo = Math.min(...h),
          hi = Math.max(...h);
        g.strokeStyle = "#f4b728";
        g.lineWidth = 3;
        g.beginPath();
        h.forEach((v, i) => {
          const x = W * 0.42 + (i / (h.length - 1)) * W * 0.22,
            y = H * 0.9 - ((v - lo) / (hi - lo || 1)) * H * 0.5;
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        });
        g.stroke();
      }
    }, 5, 768);

    // the entrance hall: glass doors onto the avenue, the welcome sign, the information desk
    k.at(f);
    for (const [a, b] of [
      [-16, -2],
      [2, 16],
    ]) {
      k.box(k.tint, "#ffffff", b - a, 5.4, 0.05, (a + b) / 2, 0, -0.1);
      for (let x = a; x <= b + 0.01; x += 2) k.box(k.metal, "#2a2a30", 0.08, 5.4, 0.12, x, 0, -0.1);
    }
    k.box(k.tint, "#ffffff", 4, 2.6, 0.05, 0, 0, -0.05);
    k.box(k.metal, "#2a2a30", 32, 0.12, 0.14, 0, 2.6, -0.1);
    k.box(k.metal, "#2a2a30", 32, 0.12, 0.14, 0, 5.4, -0.1);
    k.rects[f].push([-16, -0.2, 16, 0.2]);
    this.backdrop = new THREE.MeshBasicMaterial({ color: k.night ? "#141a2a" : "#c8d8e4" });
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(36, 6), this.backdrop);
    bd.position.set(0, 3, 0.3);
    bd.rotation.y = Math.PI;
    k.core.add(bd);
    k.sign("ZK MALL", 0.9, 0, 4.1, -0.25, Math.PI, { color: "#f4b728" });
    k.flat(k.paint, "#5a1a2a", 3, 9, 0, 0.015, -6);
    k.box(k.glow, "#c9a227", 0.06, 0.005, 9, -1.45, 0.015, -6, 0, 1);
    k.box(k.glow, "#c9a227", 0.06, 0.005, 9, 1.45, 0.015, -6, 0, 1);
    // the information desk: a white oval, the concierge, the live directory
    const ix = -7,
      iz = -8;
    k.cyl(k.gloss, "#f6f4ef", 1.5, 1.5, 1.05, ix, 0, iz, 32);
    k.cyl(k.glow, "#f4b728", 1.52, 1.52, 0.03, ix, 0.95, iz, 32, 1.2);
    k.cyl(k.gloss, "#d8c088", 1.56, 1.56, 0.05, ix, 1.05, iz, 32);
    k.rects[f].push([ix - 1.5, iz - 1.5, ix + 1.5, iz + 1.5]);
    k.sign("INFORMATION · 服务台", 0.24, ix, 1.5, iz + 0.6, 0.2, { color: "#f4b728" });
    void k.person(f, 2024, [ix, iz - 0.6], "Concierge", { face: new THREE.Vector3(0, 0, 1) });
    k.at(f, ix, iz - 0.2, 0);
    const info = k.screen(f, 1.6, 0.9, 0, 1.75, -0.1, 0.25, (g, W, H) => {
      g.fillStyle = "#0b0a10";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#f4b728";
      g.font = `800 40px ${MONO}`;
      g.textAlign = "center";
      fitText(g, "WELCOME · 欢迎", W / 2, 54);
      g.font = `600 26px ${MONO}`;
      g.fillStyle = "#e8eef7";
      const p = k.market.price;
      fitText(g, `BLOCK #${k.height ? n(k.height) : "…"}`, W / 2, 110);
      fitText(g, `${k.ctx.director.mempoolList().length} TX WAITING`, W / 2, 150);
      g.fillStyle = "#3ee08f";
      fitText(g, p ? `ZEC $${n(p.usd, 2)}` : "", W / 2, 192);
    }, 4, 512);
    k.pick(0, info, "<b>Information</b><span>block · mempool · price</span>", () => ({
      eyebrow: "Information",
      title: "ZK MALL",
      stats: [
        ["Block", k.height ? `#${n(k.height)}` : "…"],
        ["Mempool", `${k.ctx.director.mempoolList().length} tx`],
        ...(k.market.price ? ([["ZEC", `$${n(k.market.price.usd, 2)}`]] as [string, string][]) : []),
      ],
      body: `<p>${LEVELS.map((L) => `<b>${L.label}</b> ${L.name}`).join("<br>")}</p>`,
    }));
    k.at(f);
    // planters either side of the doors
    for (const sx of [-1, 1]) {
      k.box(k.gloss, "#cfc6b6", 1.4, 0.6, 1.4, sx * 4.5, 0, -2.2);
      tree(k, sx * 4.5, 0.6, -2.2, 3.4, 300 + sx);
      k.rects[f].push([sx * 4.5 - 0.7, -2.9, sx * 4.5 + 0.7, -1.5]);
    }

    this.canal();
    this.crowd(
      f,
      16,
      [
        [
          [-13, -38],
          [-13, -28],
          [-13, -19],
          [-13, -11.5],
          [-6, -11.5],
          [0, -11.5],
          [6, -11.5],
          [13, -11.5],
          [13, -19],
          [13, -28],
          [13, -38],
          [6, -38],
          [0, -38],
          [-6, -38],
        ],
        [
          [-21, -47],
          [-13, -47],
          [0, -47],
          [13, -47],
          [21, -47],
        ],
        [
          [0, -38],
          [0, -43.5],
          [0, -47],
          [0, -43.5],
        ],
        [
          [-3.2, -11.5],
          [-3.2, -3.5],
          [3.2, -3.5],
          [3.2, -11.5],
        ],
      ],
      [
        [0, -51, 0],
        [-10, -52, 0],
        [10, -51, 0],
        [20.5, -4.2, Math.PI],
      ],
    );
    k.light(f, 0, -7, "#ffe6c8", 14, 4.8, 20);
    k.light(f, -13, -24, "#ffe6c8", 16.5, 3.0);
    k.light(f, 13, -24, "#ffe6c8", 16.5, 3.0);
    k.light(f, 0, -44, "#ffe2c0", 22.0, 3.0, 26);
    k.light(f, 0, -24, "#d8f0ff", 22.0, 3.5, 20);
  }
  backdrop: THREE.MeshBasicMaterial | null = null;

  /** The canal of the Shoppes: stone banks, three bridges, and a sampan poled up and down. */
  canal() {
    const k = this.k,
      f = 0;
    const z0 = -46,
      z1 = -41,
      wy = -1.7;
    k.at(f);
    const stone = tiledMat(stoneTex(), 1.6, { roughness: 0.7 });
    for (const z of [z0, z1]) {
      k.box(stone, "#ffffff", X1 - X0, -wy + 0.2, 0.3, 0, wy - 0.4, z + (z === z0 ? 0.15 : -0.15));
      k.box(k.gloss, "#d8d0c2", X1 - X0, 0.12, 0.5, 0, 0, z + (z === z0 ? 0.25 : -0.25));
    }
    k.box(k.paint, "#0a1418", X1 - X0, 0.1, z1 - z0, 0, wy - 0.6, (z0 + z1) / 2);
    // the tunnel mouths where the canal leaves the hall
    for (const sx of [-1, 1]) {
      k.box(k.paint, "#0a0c10", 0.1, 2.4, z1 - z0, sx * (X1 - 0.2), wy - 0.5, (z0 + z1) / 2);
      const arch = new THREE.TorusGeometry((z1 - z0) / 2, 0.25, 6, 24, Math.PI);
      arch.rotateY(Math.PI / 2);
      arch.translate(sx * (X1 - 0.3), 0.6, (z0 + z1) / 2);
      k.geo(k.gloss, "#cfc6b6", arch);
    }
    const water = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uT; varying vec3 vW;
void main(){
  float a = sin(vW.x * 1.7 - uT * 1.3 + sin(vW.z * 3.0) * 0.8) * 0.5 + 0.5;
  float b = sin(vW.x * 4.3 + vW.z * 2.1 - uT * 2.2) * 0.5 + 0.5;
  vec3 c = mix(vec3(0.02, 0.16, 0.2), vec3(0.18, 0.5, 0.55), a * 0.45 + b * 0.25);
  float glint = pow(b * a, 6.0);
  gl_FragColor = vec4(c + glint * 0.9, 1.0);
}`,
    });
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, z1 - z0), water);
    wm.rotation.x = -Math.PI / 2;
    wm.position.set(0, wy, (z0 + z1) / 2);
    k.core.add(wm);
    k.always.push((_, t) => (water.uniforms.uT.value = t));
    // bridges: a gentle arch in white stone, a timber deck, glass sides
    const bridges = [-13, 0, 13];
    bridges.forEach((bx) => {
      const w = bx ? 2.4 : 3.2;
      k.box(k.gloss, "#efe9de", w + 0.3, 0.35, z1 - z0 + 0.6, bx, -0.35, (z0 + z1) / 2);
      const arch = new THREE.CylinderGeometry(2.8, 2.8, w + 0.3, 32, 1, false, -0.72, 1.44);
      arch.rotateZ(Math.PI / 2);
      arch.rotateY(Math.PI / 2);
      arch.translate(bx, -3.2, (z0 + z1) / 2);
      k.geo(k.gloss, "#efe9de", arch);
      for (const sx of [-1, 1]) {
        k.box(k.glass, "#ffffff", 0.03, 1.0, z1 - z0, bx + (sx * w) / 2, 0, (z0 + z1) / 2);
        k.box(k.gloss, "#8a5a36", 0.08, 0.06, z1 - z0, bx + (sx * w) / 2, 1.0, (z0 + z1) / 2);
        k.box(k.glow, "#ffe2b0", 0.03, 0.03, z1 - z0, bx + (sx * w) / 2, 0.02, (z0 + z1) / 2, 0, 1.2);
        k.rects[f].push([bx + (sx * w) / 2 - 0.1, z0, bx + (sx * w) / 2 + 0.1, z1]);
      }
    });
    for (const [a, b] of [
      [X0, -14.2],
      [-11.8, -1.6],
      [1.6, 11.8],
      [14.2, X1],
    ])
      k.rects[f].push([a, z0, b, z1]);
    // lamps along the banks, plants in tubs
    for (let x = -22; x <= 22; x += 6) {
      if (bridges.some((b) => Math.abs(b - x) < 2)) continue;
      for (const z of [z0 - 0.6, z1 + 0.6]) {
        k.cyl(k.metal, "#2a2a30", 0.05, 0.06, 2.6, x, 0, z, 8);
        k.cyl(k.glow, "#ffe2b0", 0.16, 0.12, 0.3, x, 2.6, z, 10, 1.6);
        k.rects[f].push([x - 0.15, z - 0.15, x + 0.15, z + 0.15]);
      }
    }
    // the sampan
    const boat = new THREE.Group();
    boat.position.set(-18, wy, -43.5);
    const hullM = new THREE.MeshStandardMaterial({ color: "#7a4a2a", roughness: 0.6 });
    const deckM = new THREE.MeshStandardMaterial({ color: "#b8885a", roughness: 0.7 });
    const roofM = new THREE.MeshStandardMaterial({ color: "#5a3a1e", roughness: 0.9, side: THREE.DoubleSide });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.rotation.set(rx, 0, rz);
      boat.add(o);
      return o;
    };
    add(new THREE.BoxGeometry(3.4, 0.45, 1.2), hullM, 0, 0.05, 0);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.9, 0.4, 0.8), hullM, sx * 2.0, 0.18, 0, 0, sx * 0.35);
    add(new THREE.BoxGeometry(3.3, 0.04, 1.05), deckM, 0, 0.3, 0);
    const canopy = new THREE.CylinderGeometry(0.62, 0.62, 1.6, 16, 1, true, -Math.PI / 2, Math.PI);
    canopy.rotateZ(Math.PI / 2);
    add(canopy, roofM, -0.1, 0.75, 0);
    const lantern = add(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.5, 0.3), toneMapped: false }), 1.9, 0.75, 0);
    add(new THREE.BoxGeometry(0.03, 0.4, 0.03), hullM, 1.9, 0.98, 0);
    const pole = add(new THREE.CylinderGeometry(0.025, 0.025, 3.4, 6), deckM, -1.5, 1.4, 0.3, 0.3, 0.25);
    void lantern;
    k.groups[f].add(boat);
    k.at(null);
    void k.person(f, 4888, [-1.4, 0], "Boatman", { dy: 0.32, scale: 0.8, parent: boat, face: new THREE.Vector3(1, 0, 0) });
    void k.person(f, 3141, [-0.4, -0.15], "Passenger", { dy: 0.36, sit: true, scale: 0.85, parent: boat });
    void k.person(f, 2718, [0.3, 0.15], "Passenger", { dy: 0.36, sit: true, scale: 0.85, parent: boat });
    k.pick(f, boat.children[0], "<b>Sampan</b><span>canal ride</span>", () => ({ eyebrow: "Canal", title: "Sampan", ...(this.mempool() ?? {}) }));
    let x = -18,
      dir = 1,
      turn = 0;
    k.ticks[f].push((dt, t) => {
      if (turn > 0) {
        turn -= dt;
        boat.rotation.y += (Math.PI / 2.5) * dt;
        if (turn <= 0) boat.rotation.y = dir > 0 ? 0 : Math.PI;
      } else {
        x += dir * dt * 0.9;
        if (Math.abs(x) > 20.5) {
          dir = -dir;
          turn = 2.5;
        }
      }
      boat.position.x = x;
      boat.position.y = wy + Math.sin(t * 1.3) * 0.03;
      boat.rotation.z = Math.sin(t * 0.9) * 0.02;
      pole.rotation.z = 0.25 + Math.sin(t * 0.8) * 0.15;
    });
  }

  // ---- 1: fashion & beauty; ORCHARD MART across the north -------------------------------------------
  fashion() {
    const k = this.k,
      f = 1;
    this.lifts(f);
    this.plazas(f);
    this.units(
      f,
      [
        { brand: "zkWEAR", kind: "sneakers", color: "#ff7a3a", sub: "SNEAKERS · 球鞋", info: this.txs },
        { brand: "UNIFIED", kind: "fashion", color: "#9ac8ff", sub: "DENIM CO." },
        { brand: "STEALTH", kind: "fashion", color: "#ffffff", sub: "STREETWEAR · 潮牌" },
      ],
      [
        { brand: "ROSE PROOF", kind: "beauty", color: "#ff8ac8", sub: "SKIN · 美妆" },
        { brand: "AIRDROP", kind: "sneakers", color: "#3ef0ff", sub: "RUNNING" },
        { brand: "LINEN & PROOF", kind: "fashion", color: "#e8dcc4", font: `500 80px ${SERIF}` },
      ],
      [
        { brand: "SILK ROAD", kind: "luxury", color: "#ffe2a8", sub: "COUTURE", font: `500 80px ${SERIF}` },
        { brand: "MIRROR", kind: "optics", color: "#ffffff", sub: "EYEWEAR" },
        { brand: "NOTE", kind: "fashion", color: "#ffb0c8", sub: "WOMEN · 女装" },
        { brand: "PEPPER", kind: "perfume", color: "#ffd08a", sub: "NICHE FRAGRANCE" },
      ],
    );
    // ORCHARD MART: a beauty hall across the whole north side
    shop(k, f, 0, NORTH, 0, 50, 16, { brand: "ORCHARD MART", kind: "beauty", color: "#ff8ac8", sub: "BEAUTY HALL · 果樹園", info: this.pool("orchard") });
    const pal = ["#ff6a9a", "#c83a6a", "#ffd0e0", "#1a1a1e", "#f4b728", "#ffffff", "#eb6834"];
    for (const x of [-16, -8, 8, 16])
      for (const z of [-10.5, -5.5]) {
        k.box(k.gloss, "#ffffff", 3.2, 0.95, 1.4, x, 0, z);
        k.box(k.glow, "#ff9ac8", 3.22, 0.03, 1.42, x, 0.95, z, 0, 1.0);
        for (let i = 0; i < 14; i++) k.box(k.gloss, pal[Math.floor(hash(x, z, i, 4) * pal.length)], 0.07, 0.12 + hash(i, x, z, 1) * 0.1, 0.07, x - 1.4 + (i % 7) * 0.46, 0.98, z - 0.35 + Math.floor(i / 7) * 0.7);
        const ring = new THREE.TorusGeometry(0.3, 0.025, 6, 32);
        ring.translate(x, 1.6, z);
        k.geo(k.glow, "#ffffff", ring, undefined, 1.3);
        k.solid(f, x - 1.6, z - 0.7, x + 1.6, z + 0.7);
      }
    k.box(k.glow, "#eb6834", 10, 0.06, 0.06, 0, 4.3, -15.7, 0, 1.4);
    // brand bays along the back wall, a giant lipstick, banners
    const brands: [string, string][] = [
      ["LUMEN", "#ffd0e0"],
      ["PETAL", "#ff8ac8"],
      ["ZK SKIN", "#ffffff"],
      ["NOVA", "#c8a8ff"],
      ["IRIS", "#9ae8ff"],
      ["MOCHI", "#ffe0a0"],
      ["SAKURA", "#ffb0c8"],
      ["SEED", "#a8f0b8"],
    ];
    [-22, -16.5, -11, -5.5, 5.5, 11, 16.5, 22].forEach((x, i) => {
      const [name, c] = brands[i];
      k.box(k.paint, "#ffffff", 4.8, 3.6, 0.3, x, 0, -15.75);
      k.box(k.glow, c, 4.4, 2.2, 0.02, x, 0.9, -15.58, 0, 0.75);
      for (let r = 0; r < 4; r++) {
        k.box(k.gloss, "#ffffff", 4.4, 0.03, 0.3, x, 1.0 + r * 0.52, -15.45);
        for (let j = 0; j < 14; j++) k.box(k.gloss, pal[Math.floor(hash(i, r, j, 6) * pal.length)], 0.08, 0.13 + hash(j, r, i, 2) * 0.08, 0.08, x - 2.0 + j * 0.31, 1.03 + r * 0.52, -15.45);
      }
      k.sign(name, 0.36, x, 3.3, -15.58, 0, { color: c === "#ffffff" ? "#ff6a9a" : c, font: `600 76px ${SERIF}` });
      k.box(k.gloss, "#ffffff", 3.6, 0.95, 0.6, x, 0, -14.4);
      k.box(k.glow, c, 3.6, 0.03, 0.62, x, 0.95, -14.4, 0, 1);
      k.solid(f, x - 2.4, -16, x + 2.4, -14.0);
    });
    k.cyl(k.gloss, "#ffffff", 1.2, 1.3, 0.35, 0, 0, -4.2, 32);
    k.cyl(k.glow, "#eb6834", 1.32, 1.32, 0.04, 0, 0.33, -4.2, 32, 1.6);
    k.cyl(k.metal, "#e8c860", 0.5, 0.5, 1.3, 0, 0.35, -4.2, 24);
    k.cyl(k.gloss, "#c8204a", 0.4, 0.4, 1.0, 0, 1.65, -4.2, 24);
    k.boxR(k.gloss, "#e8305a", 0.62, 0.7, 0.62, 0, 2.85, -4.2, 0.5, 0.78);
    k.solid(f, -1.3, -5.5, 1.3, -2.9);
    for (const x of [-20, -12.5, 12.5, 20]) {
      k.box(k.metal, "#d8d8dc", 0.02, 0.6, 0.02, x, 3.8, -2.6);
      poster(k, 1.6, 2.2, x, 2.6, -2.6, 0, x < 0 ? "SHIELDED GLOW" : "ORCHARD", x < 0 ? "SS26" : "BEAUTY HALL", "#eb6834", "#ffc8dc");
    }
    k.flat(k.gloss, "#f6d8e0", 4, 14, 0, 0.02, -8);
    poster(k, 6, 3.2, 0, 2.4, -15.68, 0, "ORCHARD", "the shielded pool, in bloom", "#eb6834", "#ff9ac8");
    for (const x of [-21, 21]) poster(k, 2.4, 3.2, x, 2.4, -15.75, 0, x < 0 ? "GLOW" : "PROOF", "SS26 · 美妆", "#ff8ac8", "#ffe0ec");
    this.crowd(f, 14, [this.ring(), [[-21, -41.6], [-8, -41.6], [8, -41.6], [21, -41.6]]], [
      [0, -12.6 + NORTH, 0],
      [-16, -8 + NORTH, 0],
      [16, -8 + NORTH, 0],
    ]);
    this.lightsUpper(f);
  }

  // ---- 2: tech, toys & books; IRONWOOD TECH across the north ------------------------------------------
  tech() {
    const k = this.k,
      f = 2;
    this.lifts(f);
    this.plazas(f);
    this.units(
      f,
      [
        { brand: "SAPLING KIDS", kind: "toys", color: "#7aff6a", sub: "TOYS · 玩具", info: this.pool("sapling") },
        { brand: "SPROUT BOOKS", kind: "books", color: "#c8a8ff", sub: "BOOKS · 书店", info: this.pool("sprout") },
        { brand: "PCZT GAMES", kind: "games", color: "#7a9aff", sub: "CONSOLES · 游戏", info: this.network },
      ],
      [
        { brand: "HALO2 AUDIO", kind: "audio", color: "#ffffff", sub: "HI-FI" },
        { brand: "FROST CAMERA", kind: "camera", color: "#ff6a4a", sub: "PHOTO · 相机" },
        { brand: "SEED PHONES", kind: "tech", color: "#3ee08f", sub: "MOBILE" },
      ],
      [
        { brand: "BLOCK TOYS", kind: "toys", color: "#ffd23a", sub: "BUILD · 积木" },
        { brand: "MANGA MEMO", kind: "books", color: "#ff6a6a", sub: "漫画 · COMICS" },
        { brand: "KEYSTONE", kind: "tech", color: "#9ad8ff", sub: "HARDWARE WALLETS" },
        { brand: "RETRO ZEC", kind: "games", color: "#ff7ab0", sub: "VINTAGE GAMES" },
      ],
    );
    // IRONWOOD TECH: the flagship, a live wall of the Ironwood pool
    shop(k, f, 0, NORTH, 0, 50, 16, { brand: "IRONWOOD TECH", kind: "tech", color: "#5ac8ff", sub: "FLAGSHIP · 鉄木", info: this.pool("ironwood") }, { bare: true });
    k.box(k.glow, "#1baf7a", 0.04, 0.04, 15.6, -24.85, 4.2, -8, 0, 1.4);
    k.box(k.glow, "#1baf7a", 0.04, 0.04, 15.6, 24.85, 4.2, -8, 0, 1.4);
    const scr = ["#3ef0ff", "#f4b728", "#7a9aff", "#3ee08f", "#ffffff", "#1baf7a"];
    const devTable = (x: number, z: number) => {
      k.box(k.gloss, "#d8c0a0", 5.0, 0.06, 1.3, x, 0.86, z);
      k.box(k.paint, "#e8e8ea", 4.8, 0.86, 1.1, x, 0, z);
      for (let i = 0; i < 7; i++) {
        const dx = x - 2.1 + i * 0.7;
        const c = scr[Math.floor(hash(x, z, i, 2) * scr.length)];
        if (i % 2) {
          k.box(k.metal, "#c8ccd4", 0.34, 0.015, 0.24, dx, 0.92, z + 0.25);
          k.boxR(k.metal, "#c8ccd4", 0.34, 0.22, 0.012, dx, 1.03, z + 0.12, -0.25, 0);
          k.boxR(k.glow, c, 0.31, 0.19, 0.004, dx, 1.03, z + 0.128, -0.25, 0, 0, 0.9);
        } else {
          k.boxR(k.paint, "#1a1a1e", 0.22, 0.012, 0.3, dx, 0.94, z - 0.25, -0.3, 0);
          k.boxR(k.glow, c, 0.2, 0.004, 0.27, dx, 0.948, z - 0.25, -0.3, 0, 0, 0.9);
        }
      }
      k.solid(f, x - 2.5, z - 0.65, x + 2.5, z + 0.65);
    };
    for (const x of [-19, -6, 6, 19]) for (const z of [-11, -6]) devTable(x, z);
    // back wall: accessories west, the support bar east; trees in planters between the tables
    for (let x = -23; x <= -9; x += 0.42)
      for (let r = 0; r < 5; r++) k.box(k.paint, ["#1a1a1e", "#c8ccd4", "#1baf7a", "#f4b728", "#3a7ac8", "#f4f2ee"][Math.floor(hash(x * 10, r, 3, 3) * 6)], 0.3, 0.38, 0.08, x, 0.7 + r * 0.6, -15.8);
    k.box(k.paint, "#f4f4f6", 14.6, 3.6, 0.1, -16, 0, -15.92);
    k.sign("ACCESSORIES", 0.32, -16, 3.9, -15.82, 0, { color: "#1baf7a" });
    k.box(k.gloss, "#d8c0a0", 11, 0.06, 1.1, 16, 1.05, -14.2);
    k.box(k.paint, "#f4f4f6", 10.8, 1.05, 0.9, 16, 0, -14.2);
    k.sign("SUPPORT · サポート", 0.32, 16, 3.9, -15.82, 0, { color: "#1baf7a" });
    for (let x = 11.5; x <= 20.5; x += 1.5) {
      k.cyl(k.metal, "#9a9ea6", 0.03, 0.03, 0.75, x, 0, -13.2, 6);
      k.cyl(k.paint, "#1a1a1e", 0.2, 0.2, 0.06, x, 0.75, -13.2, 10);
      k.box(k.metal, "#c8ccd4", 0.34, 0.015, 0.24, x, 1.11, -14.2);
      k.boxR(k.glow, scr[Math.floor(hash(x, 1, 1, 1) * scr.length)], 0.31, 0.19, 0.004, x, 1.22, -14.33, -0.25, 0, 0, 0.9);
    }
    k.solid(f, 10.5, -14.8, 21.5, -12.9);
    for (const z of [-4.5, -10]) {
      k.box(k.gloss, "#c8a070", 2.4, 0.45, 2.4, 0, 0, z);
      tree(k, 0, 0.45, z, 4.0, 700 + z);
      k.solid(f, -1.2, z - 1.2, 1.2, z + 1.2);
    }
    k.at(f, 0, NORTH, 0);
    const wall = k.screen(f, 14, 3.4, 0, 2.6, -15.7, 0, (g, W, H) => {
      const t = performance.now() / 1000;
      const bg = g.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#03140e");
      bg.addColorStop(1, "#06283a");
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = `rgba(27,175,122,${0.08 + 0.06 * Math.sin(t + i)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(W / 2, H * 1.6, H * (0.6 + i * 0.09) + ((t * 20) % 10), Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
      }
      const p = k.market.pools;
      g.textAlign = "center";
      g.fillStyle = "#1baf7a";
      g.font = `700 ${H * 0.1}px ${MONO}`;
      fitText(g, "IRONWOOD POOL · 鉄木", W / 2, H * 0.25);
      g.fillStyle = "#ffffff";
      g.font = `800 ${H * 0.26}px ${SANS}`;
      fitText(g, p ? `${fmtZec(p.pools.ironwood)} ZEC` : "…", W / 2, H * 0.58);
      if (p) {
        const ch = p.change_24h?.ironwood ?? 0;
        g.font = `700 ${H * 0.1}px ${MONO}`;
        g.fillStyle = ch >= 0 ? "#3ee08f" : "#ff6a5a";
        fitText(g, `${fmtSigned(ch)} ZEC · 24 H`, W / 2, H * 0.8);
      }
    }, 2, 1024);
    k.pick(f, wall, "<b>IRONWOOD TECH</b><span>the Ironwood pool, live</span>", () => ({ eyebrow: "2 · Electronics", title: "IRONWOOD TECH", ...(this.pool("ironwood")() ?? {}) }));
    k.at(f);
    this.crowd(f, 14, [this.ring(), [[-22, -41.5], [-11, -41.5], [0, -41.5], [11, -41.5], [22, -41.5]]], [
      [0, -12.6 + NORTH, 0],
      [-10.5, -8.5 + NORTH, 0],
    ]);
    this.lightsUpper(f);
  }

  // ---- 3: the hawker centre ---------------------------------------------------------------------------
  food() {
    const k = this.k,
      f = 3;
    this.lifts(f);
    this.plazas(f);
    this.units(
      f,
      [
        { brand: "ZEC RAMEN", kind: "restaurant", color: "#ff6a4a", sub: "ラーメン" },
        { brand: "DIM SUM HOUSE", kind: "restaurant", color: "#ffd08a", sub: "點心 · 茶楼" },
        { brand: "SUSHI MEMO", kind: "restaurant", color: "#ffffff", sub: "寿司 · OMAKASE" },
      ],
      [
        { brand: "BOBA PROOF", kind: "dessert", color: "#c89a6a", sub: "珍珠奶茶" },
        { brand: "DURIAN DREAM", kind: "dessert", color: "#e8e05a", sub: "榴莲 · DESSERTS" },
        { brand: "MALA POT", kind: "restaurant", color: "#ff3a3a", sub: "麻辣香锅" },
      ],
      [
        { brand: "KAYA KOPITIAM", kind: "cafe", color: "#ffc070", sub: "咖啡店 · SINCE 1952" },
        { brand: "ICE KACANG", kind: "dessert", color: "#9ae8ff", sub: "刨冰" },
        { brand: "ROAST HOUSE", kind: "restaurant", color: "#ff9a3a", sub: "烧腊" },
        { brand: "SATAY BAR", kind: "restaurant", color: "#ffd84a", sub: "沙爹" },
      ],
    );
    // the hawker centre: open front, tiled floor, ceiling fans, a row of stalls, tables
    const W = 50,
      D = 16;
    k.at(f, 0, NORTH, 0);
    const tiles = tiledMat(tileTex(), 1.6, { roughness: 0.5 });
    k.flat(tiles, "#ffffff", W, D, 0, 0.012, -D / 2, [0, 0, W, D]);
    k.box(k.paint, "#e8dcc4", 0.2, 5.55, D, -W / 2, 0, -D / 2);
    k.box(k.paint, "#e8dcc4", 0.2, 5.55, D, W / 2, 0, -D / 2);
    k.box(k.paint, "#c8b89a", W, 5.55, 0.2, 0, 0, -D);
    k.flat(k.paint, "#2a2420", W, D, 0, 4.6, -D / 2, undefined, true);
    k.box(k.paint, "#7a1e1e", W - 0.4, 0.95, 0.3, 0, 4.6, 0.02);
    k.sign("ZEC HAWKER CENTRE · 小贩中心", 0.62, 0, 5.08, 0.2, 0, { color: "#ffd84a" });
    for (const sx of [-1, 1]) k.box(k.gloss, "#cfc6b6", 0.4, 5.55, 0.4, sx * (W / 2), 0, 0);
    k.solid(f, -W / 2 - 0.1, -D, -W / 2 + 0.1, 0);
    k.solid(f, W / 2 - 0.1, -D, W / 2 + 0.1, 0);
    // the stalls
    const stalls: [string, string, string][] = [
      ["CHICKEN RICE", "海南鸡饭", "#ffd84a"],
      ["LAKSA", "叻沙", "#ff8a3a"],
      ["CHAR KWAY TEOW", "炒粿条", "#ff5a3a"],
      ["SATAY", "沙爹", "#ffb03a"],
      ["NASI LEMAK", "椰浆饭", "#3ee08f"],
      ["CARROT CAKE", "菜头粿", "#ffffff"],
      ["BAK KUT TEH", "肉骨茶", "#d8a86a"],
      ["HOKKIEN MEE", "福建面", "#ffd08a"],
      ["ROTI PRATA", "印度煎饼", "#ff9ac8"],
      ["TEH TARIK", "拉茶", "#c89a6a"],
    ];
    const sw = 4.8;
    stalls.forEach(([name, cn, col], i) => {
      const x = -W / 2 + 0.2 + sw / 2 + i * sw;
      const z = -D + 2.0;
      k.box(k.paint, "#f2ece0", 0.1, 3.0, 2.9, x - sw / 2 + 0.05, 0, -D + 1.45);
      k.box(k.gloss, "#c8ccd4", sw - 0.3, 1.0, 0.8, x, 0, z + 0.6);
      k.box(k.gloss, "#e8e4de", sw - 0.2, 0.05, 0.9, x, 1.0, z + 0.6);
      k.box(k.glass, "#ffffff", sw - 0.6, 0.45, 0.03, x, 1.05, z + 0.95);
      // the food in the window, pots and woks behind
      for (let j = 0; j < 5; j++) k.box(k.paint, ["#ffe0a0", "#c8582a", "#f4f2ee", "#8a3a1a", "#3a8a3a"][(i + j) % 5], 0.4, 0.06, 0.3, x - 1.6 + j * 0.8, 1.05, z + 0.7);
      for (let j = 0; j < 2; j++) {
        k.cyl(k.metal, "#3a3a40", 0.3, 0.2, 0.18, x - 1 + j * 2, 1.0, z - 0.5, 12);
        k.box(k.metal, "#9a9ea6", 0.8, 0.95, 0.6, x - 1 + j * 2, 0, z - 0.5);
      }
      // the signboard: a light box with the dish, a menu row of photos
      k.box(k.paint, "#1a1410", sw - 0.2, 0.9, 0.12, x, 3.0, z + 1.0);
      k.picture(sw - 0.4, 0.8, x, 3.45, z + 1.07, 0, (g, w, h) => {
        g.fillStyle = col;
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#1a1410";
        g.textAlign = "center";
        g.font = `800 ${h * 0.36}px ${JP}`;
        g.fillText(cn, w / 2, h * 0.45, w * 0.9);
        g.font = `800 ${h * 0.2}px ${MONO}`;
        g.fillText(`${String(i + 1).padStart(2, "0")} · ${name}`, w / 2, h * 0.82, w * 0.92);
      }, { glow: true });
      k.picture(sw - 0.4, 0.55, x, 2.62, z + 1.07, 0, (g, w, h) => {
        g.fillStyle = "#1a1410";
        g.fillRect(0, 0, w, h);
        for (let j = 0; j < 4; j++) {
          const bx = 8 + j * ((w - 16) / 4);
          const bw = (w - 16) / 4 - 8;
          g.fillStyle = "#f4ead8";
          g.fillRect(bx, 8, bw, h * 0.62);
          g.fillStyle = ["#ffe0a0", "#c8582a", "#e8c070", "#8a3a1a"][(i + j) % 4];
          g.beginPath();
          g.ellipse(bx + bw / 2, 8 + h * 0.31, bw * 0.36, h * 0.2, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#ffd84a";
          g.font = `700 ${h * 0.2}px ${MONO}`;
          g.textAlign = "center";
          g.fillText(`$${(3.5 + ((i + j) % 5) * 0.5).toFixed(1)}`, bx + bw / 2, h * 0.94);
        }
      }, { glow: true });
      k.box(k.glow, "#fff2d0", sw - 0.4, 0.04, 0.04, x, 2.32, z + 1.08, 0, 1.4);
      k.solid(f, x - sw / 2, -D, x + sw / 2, z + 1.05);
      k.hit(f, sw - 0.3, 3.9, 0.3, x, 0, z + 1.1, `<b>${String(i + 1).padStart(2, "0")} · ${name}</b><span>${cn} · the queue</span>`, () => ({ eyebrow: `Stall ${String(i + 1).padStart(2, "0")} · ${cn}`, title: name, ...(this.mempool() ?? {}) }));
      if (i % 2 === 0 || i === 9) void k.person(f, 400 + i * 37, [x + 0.3, z - 0.1], "Hawker", { face: new THREE.Vector3(0, 0, 1) });
    });
    // steam over the woks
    const steamTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, "rgba(255,255,255,0.5)");
      r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const N = 120;
    const sp = new Float32Array(N * 3);
    const base: [number, number][] = [];
    const origin = k.world(0, 0, 0);
    for (let i = 0; i < N; i++) {
      const st = i % 10;
      const bx = origin.x - W / 2 + 0.2 + sw / 2 + st * sw - 1 + (i % 2) * 2;
      base.push([bx, origin.z - D + 1.5]);
      sp[i * 3] = bx;
      sp[i * 3 + 1] = LEVELS[f].y + 1.2 + Math.random() * 1.6;
      sp[i * 3 + 2] = origin.z - D + 1.5;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const steam = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.7, map: steamTex, transparent: true, depthWrite: false, opacity: 0.45 }));
    steam.frustumCulled = false;
    k.groups[f].add(steam);
    k.ticks[f].push((dt) => {
      for (let i = 0; i < N; i++) {
        sp[i * 3 + 1] += dt * (0.4 + (i % 7) * 0.05);
        sp[i * 3] += Math.sin(sp[i * 3 + 1] * 3 + i) * dt * 0.1;
        if (sp[i * 3 + 1] > LEVELS[f].y + 3.0) {
          sp[i * 3] = base[i][0];
          sp[i * 3 + 1] = LEVELS[f].y + 1.2;
        }
      }
      sg.attributes.position.needsUpdate = true;
    });
    // the tables: round marble tops, four stools each, people eating
    let diner = 0;
    for (let x = -21; x <= 21; x += 3.5)
      for (const z of [-10.4, -7.0, -3.6]) {
        k.cyl(k.gloss, "#f2efe8", 0.55, 0.55, 0.05, x, 0.72, z, 20);
        k.cyl(k.metal, "#9a9ea6", 0.06, 0.08, 0.72, x, 0, z, 8);
        for (let s = 0; s < 4; s++) {
          const a = (s / 4) * Math.PI * 2 + 0.4;
          k.cyl(k.paint, "#2a7a5a", 0.17, 0.17, 0.05, x + Math.sin(a) * 0.85, 0.44, z + Math.cos(a) * 0.85, 10);
          k.cyl(k.metal, "#9a9ea6", 0.03, 0.03, 0.44, x + Math.sin(a) * 0.85, 0, z + Math.cos(a) * 0.85, 6);
        }
        for (let j = 0; j < 2; j++) {
          k.cyl(k.gloss, "#ffffff", 0.15, 0.11, 0.05, x - 0.2 + j * 0.4, 0.77, z + (j ? 0.1 : -0.15), 12);
          k.cyl(k.paint, ["#ffe0a0", "#c8582a", "#e8c070"][Math.floor(hash(x, z, j, 1) * 3)], 0.1, 0.1, 0.03, x - 0.2 + j * 0.4, 0.82, z + (j ? 0.1 : -0.15), 10);
        }
        k.solid(f, x - 0.6, z - 0.6, x + 0.6, z + 0.6);
        if (hash(x, z, 3, 3) > 0.45 && diner < 16) {
          const a = Math.floor(hash(x, z, 4, 4) * 4);
          const ang = (a / 4) * Math.PI * 2 + 0.4;
          diner++;
          void k.person(f, 1 + Math.floor(hash(x, z, 5, 5) * 9999), [x + Math.sin(ang) * 0.85, z + Math.cos(ang) * 0.85], "Diner", { sit: true, dy: 0.42, face: new THREE.Vector3(-Math.sin(ang), 0, -Math.cos(ang)) });
        }
      }
    // ceiling fans, turning
    const fans: THREE.Group[] = [];
    const bladeM = new THREE.MeshStandardMaterial({ color: "#5a3a22", roughness: 0.6 });
    for (let x = -18; x <= 18; x += 9)
      for (const z of [-10, -5]) {
        const p = k.world(x, 4.25, z);
        const fan = new THREE.Group();
        fan.position.copy(p);
        for (let b = 0; b < 4; b++) {
          const bl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.18), bladeM);
          bl.position.x = 0.7;
          const arm = new THREE.Group();
          arm.rotation.y = (b / 4) * Math.PI * 2;
          arm.add(bl);
          fan.add(arm);
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 10), new THREE.MeshStandardMaterial({ color: "#2a2a30" }));
        hub.position.y = 0.17;
        fan.add(hub);
        k.groups[f].add(fan);
        fans.push(fan);
      }
    k.ticks[f].push((dt) => fans.forEach((fn, i) => (fn.rotation.y += dt * (3 + (i % 3) * 0.4))));
    // fluorescent tubes between the fans
    for (let x = -22.5; x <= 22.5; x += 4.5) for (const z of [-12.5, -7.5, -2.5]) k.box(k.glow, "#f4fbff", 1.4, 0.06, 0.1, x, 4.5, z, 0, 1.3);
    // red lanterns along the front
    for (let x = -22; x <= 22; x += 4) {
      k.cyl(k.glow, "#ff3a2a", 0.25, 0.25, 0.42, x, 3.7, -0.6, 12, 1.2);
      k.cyl(k.paint, "#c9a227", 0.12, 0.12, 0.05, x, 4.12, -0.6, 8);
    }
    k.at(f);
    this.crowd(f, 12, [this.ring(), [[-22, -41.2], [22, -41.2]]]);
    this.lightsUpper(f, "#ffd8a8");
  }

  // ---- 4: ZK CINEMA, the arcade ----------------------------------------------------------------------
  cinema() {
    const k = this.k,
      f = 4;
    this.lifts(f);
    this.plazas(f);
    this.units(
      f,
      [],
      [
        { brand: "GACHA WORLD", kind: "gacha", color: "#ff5a5a", sub: "ガチャガチャ" },
        { brand: "PURIKURA", kind: "photo", color: "#ff4fb8", sub: "プリクラ · PHOTO" },
        { brand: "CARD VAULT", kind: "games", color: "#f4b728", sub: "TRADING CARDS" },
      ],
      [
        { brand: "CANDY LAB", kind: "dessert", color: "#ff7ab0", sub: "糖果 · SWEETS" },
        { brand: "PLUSH PARADISE", kind: "toys", color: "#ffd23a", sub: "ぬいぐるみ" },
        { brand: "POPCORN BAR", kind: "dessert", color: "#ffe08a", sub: "SWEET · SALTY · ZEC" },
        { brand: "CINEMA CAFÉ", kind: "cafe", color: "#ffc070", sub: "LOUNGE" },
      ],
    );
    this.arcade(f);

    // the cinema lobby (x −25…−5) and the screening hall (x −5…25), across the north
    const carpet = tiledMat(carpetTex(), 1.2, { roughness: 0.95 });
    k.at(f, 0, NORTH, 0);
    const D = 16;
    k.flat(carpet, "#ffffff", 50, D, 0, 0.012, -D / 2, [0, 0, 50, D]);
    k.box(k.paint, "#1a0e1e", 0.2, 6, D, -25, 0, -D / 2);
    k.box(k.paint, "#1a0e1e", 0.2, 6, D, 25, 0, -D / 2);
    k.box(k.paint, "#1a0e1e", 50, 6, 0.2, 0, 0, -D);
    k.flat(k.paint, "#120a14", 50, D, 0, 5.4, -D / 2, undefined, true);
    k.box(k.paint, "#120a14", 50, 0.6, D, 0, 5.4, -D / 2);
    k.solid(f, -25.1, -D, -24.9, 0);
    k.solid(f, 24.9, -D, 25.1, 0);
    // front: the lobby is glazed with doors; the hall is a solid wall with the marquee
    k.box(k.glass, "#ffffff", 7.5, 4.4, 0.03, -21, 0, 0);
    k.box(k.glass, "#ffffff", 7.5, 4.4, 0.03, -9, 0, 0);
    k.solid(f, -25, -0.1, -17.25, 0.1);
    k.solid(f, -12.75, -0.1, -5, 0.1);
    k.box(k.paint, "#1a0e1e", 0.4, 6, 0.4, -5, 0, 0);
    k.box(k.paint, "#2a1424", 30, 6, 0.3, 10, 0, 0);
    k.solid(f, -5, -0.2, 25, 0.2);
    k.box(k.paint, "#0e0810", 20, 1.6, 0.3, -15, 4.4, 0.02);
    k.sign("ZK CINEMA", 0.9, -15, 5.1, 0.2, 0, { color: "#ff4a5a", font: `900 84px ${SANS}`, spacing: 8 });
    k.sign("影院 · 映画館", 0.3, -15, 4.6, 0.2, 0, { color: "#ffd0d8", font: `600 64px ${JP}` });
    // the marquee board on the hall's wall: now showing, the latest block, live
    k.screen(f, 12, 3.2, 10, 2.4, 0.2, 0, (g, W, H) => {
      g.fillStyle = "#0a0408";
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 46; i++) {
        g.fillStyle = (i + Math.floor(performance.now() / 300)) % 3 ? "#ffd27a" : "#5a3a1a";
        g.beginPath();
        g.arc(10 + (i * (W - 20)) / 45, 10, 4, 0, Math.PI * 2);
        g.arc(10 + (i * (W - 20)) / 45, H - 10, 4, 0, Math.PI * 2);
        g.fill();
      }
      g.textAlign = "center";
      g.fillStyle = "#ff4a5a";
      g.font = `800 ${H * 0.13}px ${MONO}`;
      fitText(g, "NOW SHOWING · 正在上映", W / 2, H * 0.26);
      // the holder spotlights, one after the other
      const F = FILMS[Math.floor(performance.now() / 4000) % Math.max(1, FILMS.length)];
      g.fillStyle = "#ffffff";
      g.font = `900 ${H * 0.27}px ${SANS}`;
      fitText(g, F ? F.name.toUpperCase() : "…", W / 2, H * 0.58);
      g.fillStyle = "#ffd27a";
      g.font = `700 ${H * 0.1}px ${MONO}`;
      fitText(g, F ? `HOLDER SPOTLIGHT · ${F.runtime} · SCREEN ${FILMS.indexOf(F) + 1}` : "", W / 2, H * 0.8);
    }, 0.6, 1024);
    k.hit(f, 12, 3.2, 0.4, 10, 0.8, 0.3, "<b>ZK CINEMA</b><span>now showing</span>", () => filmInfo(Math.floor(performance.now() / 4000) % Math.max(1, FILMS.length)));
    // lobby: ticket counter with showtime screens, posters, popcorn, rope lines
    k.box(k.paint, "#3a1020", 8, 1.1, 0.8, -15, 0, -D + 2.2);
    k.box(k.gloss, "#c9a227", 8.1, 0.05, 0.86, -15, 1.1, -D + 2.2);
    k.box(k.glow, "#ff4a5a", 8, 0.04, 0.04, -15, 0.2, -D + 2.62, 0, 1.4);
    k.solid(f, -19.1, -D, -10.9, -D + 2.6);
    for (let i = 0; i < 4; i++) {
      const x = -18.6 + i * 2.4;
      const sc = k.screen(f, 2.0, 1.15, x, 3.2, -D + 0.15, 0, (g, W, H) => {
        g.fillStyle = "#0a0408";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#ff4a5a";
        g.font = `800 34px ${MONO}`;
        g.textAlign = "left";
        const F = FILMS[i];
        g.fillText(F ? `SCREEN ${i + 1}` : "SOON", 18, 44);
        g.fillStyle = "#ffffff";
        g.font = `800 40px ${SANS}`;
        fitText(g, F ? F.name.toUpperCase() : `${FILM_SLOTS - FILMS.length} MORE SPOTLIGHTS`, 18, 100, W - 36);
        g.font = `700 26px ${MONO}`;
        // the shows of the day: every runtime + 2 min, the rooms a minute apart (as their boards)
        const cyc = F ? Number(F.runtime.split(":")[0]) * 60 + Number(F.runtime.split(":")[1]) + 120 : 0;
        for (let r = 0; r < 3 && F; r++) {
          const t = new Date((Math.ceil((Date.now() / 1000 + i * 60) / cyc) + r) * cyc * 1000 - i * 60000);
          g.fillStyle = r === 0 ? "#3ee08f" : "#c8b8a8";
          fitText(g, `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}  ${F.runtime}  zkSNARK #${F.snark}`, 18, 150 + r * 40, W - 36);
        }
        if (!F) {
          g.fillStyle = "#c8b8a8";
          fitText(g, "zksnarks.net/network", 18, 150, W - 36);
        }
      }, 10, 512);
      void sc;
    }
    k.sign("TICKETS · 售票处", 0.32, -15, 4.5, -D + 0.15, 0, { color: "#ffd27a" });
    void k.person(f, 777, [-16.5, -D + 1.5], "Ticket desk", { face: new THREE.Vector3(0, 0, 1) });
    void k.person(f, 1999, [-13.5, -D + 1.5], "Ticket desk", { face: new THREE.Vector3(0, 0, 1) });
    k.hit(f, 8, 1.2, 0.9, -15, 0, -D + 2.2, "<b>Tickets</b><span>now showing</span>", () => ({ eyebrow: "ZK CINEMA · Tickets", title: k.height ? `Block #${n(k.height)}` : "ZK CINEMA", mono: true, ...(this.lastBlock() ?? {}) }));
    // the films' posters along the lobby's walls: each holder spotlight, then the slots to come
    for (let i = 0; i < FILM_SLOTS; i++) {
      const left = i < 4;
      const P = filmPosterMesh(i, 1.3);
      P.group.position.copy(k.world(left ? -24.88 : -5.15, 2.25, -D + 4.0 + (left ? i : i - 4) * 2.7));
      P.group.rotation.y = left ? Math.PI / 2 : -Math.PI / 2;
      k.groups[f].add(P.group);
      k.pick(f, P.pic, FILMS[i] ? `<b>${esc(FILMS[i].name)}</b><span>holder spotlight · ${esc(FILMS[i].runtime)}</span>` : "<b>Coming soon</b><span>holder spotlight</span>", () => filmInfo(i));
    }
    // popcorn machine
    k.box(k.paint, "#c81e1e", 1.0, 0.9, 0.7, -8, 0, -D + 1.0);
    k.box(k.glass, "#ffffff", 1.0, 0.9, 0.7, -8, 0.9, -D + 1.0);
    for (let i = 0; i < 40; i++) k.box(k.glow, "#fff0b0", 0.07, 0.07, 0.07, -8.4 + hash(i, 1, 2, 3) * 0.8, 0.92 + hash(i, 2, 2, 3) * 0.35, -D + 0.75 + hash(i, 3, 2, 3) * 0.5, 0, 1.1);
    k.box(k.glow, "#ffd27a", 1.0, 0.2, 0.7, -8, 1.8, -D + 1.0, 0, 1.3);
    k.solid(f, -8.5, -D + 0.6, -7.5, -D + 1.4);
    for (let i = 0; i < 6; i++) {
      const x = -21 + (i % 3) * 3,
        z = -8 + Math.floor(i / 3) * 2.6;
      k.cyl(k.metal, "#d8c088", 0.05, 0.12, 1.0, x, 0, z, 10);
      k.rects[f].push([x - 0.15, z - 0.15, x + 0.15, z + 0.15]);
      if (i % 3 !== 2) {
        const rope = new THREE.CylinderGeometry(0.03, 0.03, 3, 6);
        rope.rotateZ(Math.PI / 2);
        k.geo(k.paint, "#8a0e1e", rope, new THREE.Matrix4().makeTranslation(x + 1.5, 0.85, z));
      }
    }
    // the screening rooms behind the lobby, one per holder spotlight (cinema.ts)
    this.cine = new Cinema(k);
    this.cine.build();
    k.at(f);
    this.crowd(f, 12, [this.ring(), [[-22, -42], [-15, -42], [-8, -42]]], [[20.5, -36, -Math.PI / 2]]);
    // the cinema: the lobby, warm; the corridor to the screens
    k.light(f, -15, -48, "#ffc8b0", 30, 3.4, 20);
    k.light(f, 10, -41.6, "#ffb48a", 9, 3.2, 18);
    k.light(f, -13, -24, "#fff0e0", 16.5, 3.0);
    k.light(f, 13, -24, "#fff0e0", 16.5, 3.0);
    k.light(f, 0, -11, "#fff0e0", 16.5, 3.0);
    k.light(f, -20.5, -28, "#b07bff", 12.1, 3.0, 16);
  }

  /** ZK ARCADE: the whole west column of level 4, cabinets in rows, every game playable. */
  arcade(f: number) {
    const k = this.k;
    const W = 24,
      D = 9;
    shop(k, f, -COL, -28, Math.PI / 2, W, D, { brand: "ZK ARCADE", kind: "games", color: "#3ef0ff", sub: "ゲームセンター · 电玩", info: this.network }, { noFront: true, bare: true });
    // two back-to-back rows of cabinets, racing sims, a dance machine and UFO catchers on the back wall
    const games: Game[] = ["invaders", "snake", "flappy", "whack", "memory", "kart", "invaders", "flappy", "snake", "memory", "whack"];
    k.at(f, -COL, -28, Math.PI / 2);
    k.flat(tiledMat(carpetTex("#0a0c2a", "#3ef0ff"), 1.4, { roughness: 0.95 }), "#ffffff", W - 0.4, D - 0.4, 0, 0.02, -D / 2, [0, 0, W, D]);
    const cabinet = (game: Game, x: number, z: number, rot: number) => {
      const gm = ART[game] ?? ART.snake;
      const cab = k.put(f, `mallcab-${game}`, () => F.arcadeCabinet(gm.color, gm.side), x, z, rot);
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.56), new THREE.MeshBasicMaterial({ map: marquee(game), toneMapped: false }));
      sc.position.set(0, 1.38 * 2, 0.03);
      sc.scale.setScalar(2);
      cab.add(sc);
      const info = () => ({ eyebrow: "ZK ARCADE", title: gm.name, game });
      cab.traverse((o) => o instanceof THREE.Mesh && k.pick(f, o, `<b>${gm.name}</b><span>play</span>`, info));
    };
    for (let i = 0; i < 11; i++) {
      cabinet(games[i], -10.8 + i * 0.92, -3.9, 0);
      cabinet(games[(i + 5) % games.length], -10.8 + i * 0.92, -5.0, Math.PI);
    }
    k.box(k.glow, "#ff3e8a", 10.4, 0.05, 0.05, -6.2, 2.25, -4.45, 0, 1.6);
    for (let i = 0; i < 3; i++) {
      const rs = k.put(f, `mallkart${i}`, () => F.racingSim(["#f4b728", "#3ef0ff", "#ff3e8a"][i]), -10.4 + i * 1.75, -7.6, 0);
      rs.traverse((o) => o instanceof THREE.Mesh && k.pick(f, o, "<b>ZK KART</b><span>race</span>", () => ({ eyebrow: "ZK ARCADE", title: "ZK KART", game: "kart" })));
    }
    const dm = k.put(f, "malldance", F.danceMachine, -3.6, -7.6, 0);
    dm.traverse((o) => o instanceof THREE.Mesh && k.pick(f, o, "<b>DANCE ZK</b><span>step up</span>", () => ({ eyebrow: "ZK ARCADE", title: "DANCE ZK", game: "dance" })));
    for (let i = 0; i < 7; i++) {
      const cl = k.put(f, `mallclaw${i % 4}`, () => F.clawMachine(["#ff3e8a", "#3ef0ff", "#f4b728", "#3ee08f"][i % 4], (i % 4) + 1), -0.6 + i * 1.3, -8.0, 0);
      cl.traverse((o) => o instanceof THREE.Mesh && k.pick(f, o, "<b>UFO catcher</b><span>play</span>", () => ({ eyebrow: "ZK ARCADE", title: "UFO CATCHER", game: "whack" })));
    }
    for (const x of [3.2, 7.4]) {
      const hk = k.put(f, "mallhockey", F.airHockey, x, -4.6, 0);
      hk.traverse((o) => o instanceof THREE.Mesh && k.pick(f, o, "<b>Air hockey</b><span>play</span>", () => ({ eyebrow: "ZK ARCADE", title: "AIR HOCKEY", game: "hockey" })));
    }
    k.picture(W - 1, 1.5, 0, 3.75, -D + 0.12, 0, (g, w, h) => {
      g.fillStyle = "#07051a";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = ["#3ef0ff", "#ff3e8a", "#f4b728", "#3ee08f", "#b07bff"][i % 5];
        g.globalAlpha = 0.35;
        g.fillRect(hash(i, 1, 7, 7) * w, hash(i, 2, 7, 7) * h, 6, 6);
      }
      g.globalAlpha = 1;
      g.textAlign = "center";
      g.font = `900 ${h * 0.5}px ${SANS}`;
      g.shadowColor = "#ff3e8a";
      g.shadowBlur = 20;
      g.fillStyle = "#ffd0f0";
      g.fillText("ZK ARCADE  ·  ゲームセンター  ·  INSERT ⓩ", w / 2, h * 0.68, w * 0.96);
    }, { glow: true });
    // the prize counter, its shelves of plush
    k.box(k.paint, "#2a1a4a", 2.6, 1.0, 0.7, 10.2, 0, -2.0);
    k.box(k.glow, "#f4b728", 2.6, 0.04, 0.72, 10.2, 1.0, -2.0, 0, 1.4);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) k.box(k.paint, PAL_TOYS[(i + r) % PAL_TOYS.length], 0.3, 0.3, 0.3, 9.2 + i * 0.4, 1.4 + r * 0.55, -3.0);
    k.box(k.paint, "#2a1a4a", 2.8, 0.06, 0.5, 10.2, 1.35, -3.0);
    k.box(k.paint, "#2a1a4a", 2.8, 0.06, 0.5, 10.2, 1.9, -3.0);
    k.sign("PRIZES · 景品", 0.3, 10.2, 3.4, -3.2, 0, { color: "#f4b728" });
    k.solid(f, 8.9, -3.3, 11.5, -1.65);
    void k.person(f, 6512, [10.2, -2.6], "Staff", { face: new THREE.Vector3(0, 0, 1) });
    for (let i = 0; i < 4; i++) void k.person(f, 1 + Math.floor(hash(i, 4, 4, 9) * 9999), [-10.3 + i * 2.8, -3.2], "Gamer", { face: new THREE.Vector3(0, 0, -1) });
    // neon over the open front, a glowing floor strip
    for (let i = 0; i < 5; i++) k.box(k.glow, ["#3ef0ff", "#ff3e8a", "#f4b728", "#3ee08f", "#b07bff"][i], W - 1, 0.04, 0.04, 0, 4.0 - i * 0.12, -0.3, 0, 1.6);
    k.box(k.glow, "#3ef0ff", W - 1, 0.01, 0.1, 0, 0.02, -1.2, 0, 1.2);
    k.at(f);
  }

  lightsUpper(f: number, color = "#ffe6c8") {
    const k = this.k;
    k.light(f, -13, -24, color, 16.5, 3.0);
    k.light(f, 13, -24, color, 16.5, 3.0);
    k.light(f, 0, -11, color, 16.5, 3.0);
    k.light(f, -12, -48, color, 18.7, 3.0, 20);
    k.light(f, 12, -48, color, 18.7, 3.0, 20);
    k.light(f, 0, -37, color, 13.2, 3.0);
  }

  setNight(on: boolean) {
    this.backdrop?.color.set(on ? "#141a2a" : "#c8d8e4");
  }
}

void CZ;
void Z0;
void vine;
