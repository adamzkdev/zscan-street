import * as THREE from "three";
import { get, ZScan } from "../data/zscan";
import { makeScene } from "./kit";
import type { Floor, Interior, InteriorContext, PickInfo } from "./types";
import { showPortrait } from "./gallery/cards";
import { BANDS, buildHall, buildLobby, buildVault, ranks, type Built, type GalleryData, type MapTuple } from "./gallery/floors";
import { MONO, num, zec } from "./gallery/look";

/**
 * zkCARDS: a museum of the whole zkSNARK collection. The ground floor is a double-height lobby
 * with the ten Legendaries on plinths, the info desk, the market on the wall and a mosaic of all
 * 10,000 portraits; above it one floor per rank band, every portrait of the band hung salon style
 * in gilt frames (instanced, one atlas). Floors are stacked in one scene; only the one the visitor
 * stands on is drawn.
 */

/** Height of each floor in the stack (the lobby is double height). */
const FLOOR_Y = [0, 12, 19, 26, 33, 40, 47, 54];

/** Card sizes and room plans per band (floor 1 is the Legendary vault, built apart). */
const HALLS = [
  null,
  { s: 0.62, pitch: 0.84, rows: 2, y0: 1.3, bayW: 4.2, bayD: 4.2, nave: 5 },
  { s: 0.44, pitch: 0.58, rows: 4, y0: 0.95, bayW: 5, bayD: 5, nave: 5 },
  { s: 0.44, pitch: 0.58, rows: 4, y0: 0.95, bayW: 5, bayD: 5, nave: 5 },
  { s: 0.36, pitch: 0.46, rows: 6, y0: 0.8, bayW: 6, bayD: 6, nave: 5.5 },
  { s: 0.33, pitch: 0.42, rows: 7, y0: 0.75, bayW: 6.5, bayD: 6.5, nave: 5.5 },
  { s: 0.3, pitch: 0.38, rows: 8, y0: 0.7, bayW: 7, bayD: 8, nave: 6 },
];

interface MapDoc {
  supply: number;
  floor: number | null;
  bands: { from_rank: number; to_rank: number; reference: number | null }[];
  traits: { trait_type: string; values: string[] }[];
  items: MapTuple[];
}

interface CollectionDoc {
  market?: { floor: number | null; listings: number | null; sales_24h: number | null; volume_24h: number | null } | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function buildGallery(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#060507");
  scene.environmentIntensity = 0.22;
  scene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight) {
      o.intensity = 0.28;
      o.color.set("#fff1dc");
      o.groundColor.set("#1a1418");
    }
  });

  const lobby = buildLobby();
  const built: Built[] = [lobby, buildVault(), ...HALLS.slice(1).map((h, i) => buildHall({ band: i + 1, ...h! }))];
  built.forEach((b, i) => {
    b.group.position.y = FLOOR_Y[i];
    b.group.visible = i === 0;
    scene.add(b.group);
  });
  const floors: Floor[] = built.map((b, i) => ({
    label: i === 0 ? "G" : String(i),
    name: i === 0 ? "Lobby · the ten Legendaries" : `Ranks ${ranks(BANDS[i - 1])} · ${BANDS[i - 1].name}`,
    y: FLOOR_Y[i],
    spawn: new THREE.Vector3(b.spawn.x, FLOOR_Y[i], b.spawn.z),
    yaw: b.yaw,
  }));

  // ---- data -----------------------------------------------------------------------------------
  let data: GalleryData | null = null;
  let traitNames: MapDoc["traits"] = [];
  const byId = new Map<number, { t: MapTuple; band: number }>();

  const load = async () => {
    const [map, coll] = await Promise.all([get<MapDoc>("/v1/collections/zksnarks/map"), get<CollectionDoc>("/v1/collections/zksnarks?sort=rank&page=0")]);
    if (!map) return;
    traitNames = map.traits;
    const byBand: MapTuple[][] = BANDS.map(() => []);
    for (const t of map.items) {
      const r = t[1];
      if (r == null) continue;
      const b = BANDS.findIndex((x) => r >= x.from && r <= x.to);
      if (b >= 0) byBand[b].push(t);
    }
    byBand.forEach((l, b) => {
      l.sort((a, c) => (a[1] ?? 0) - (c[1] ?? 0));
      for (const t of l) byId.set(t[0], { t, band: b });
    });
    const m = coll?.market;
    data = {
      supply: map.supply,
      floor: m?.floor ?? map.floor,
      listings: m?.listings ?? map.items.filter((t) => t[2] != null).length,
      sales24: m?.sales_24h ?? null,
      volume24: m?.volume_24h ?? null,
      byBand,
      reference: BANDS.map((b) => map.bands.find((x) => x.from_rank === b.from)?.reference ?? null),
    };
    for (const b of built) {
      b.refresh(data);
      for (const big of b.bigs) {
        const t = byBand[big.band][big.index];
        if (t) showPortrait(big.pic, ZScan.zkSnarkImage(t[0]), t[0]);
      }
    }
  };
  void load();

  // ---- the street board: zkSNARKs walking outside right now -----------------------------------
  let streetIds: number[] = [];
  let lastBoard = -1;
  const drawBoard = () => {
    const ids = [...new Set([...ctx.director.snarks].map((s) => s.id))].sort((a, b) => (byId.get(a)?.t[1] ?? 1e9) - (byId.get(b)?.t[1] ?? 1e9));
    streetIds = ids.slice(0, lobby.street.slots.length);
    lobby.street.setItems(streetIds);
    lobby.street.cards.count = lobby.street.frames.count = streetIds.length;
    lobby.streetBoard.draw((g, w, h) => {
      g.fillStyle = "rgba(8,7,10,0.92)";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#5ad8ff";
      g.fillRect(0, h - 8, w, 8);
      g.font = `700 64px ${MONO}`;
      g.fillStyle = "#f6f2ea";
      g.textBaseline = "alphabetic";
      g.fillText("On the street right now", 40, 112);
      g.font = `500 38px ${MONO}`;
      g.fillStyle = "#a3a3a3";
      g.fillText(`${num(ids.length)} zkSNARK${ids.length === 1 ? "" : "s"} walking the city outside · rarest first`, 40, 190);
      g.fillStyle = "#5ad8ff";
      g.beginPath();
      g.arc(w - 70, 90, 16, 0, Math.PI * 2);
      g.fill();
      g.font = `700 34px ${MONO}`;
      g.textAlign = "right";
      g.fillText("LIVE", w - 100, 102);
      g.textAlign = "left";
    });
  };

  // ---- picking -----------------------------------------------------------------------------------
  const itemInfo = (t: MapTuple, band: number): PickInfo => {
    const [id, rank, ask, , last, sales] = t;
    const traits = t[7]
      .map((v, i) => [traitNames[i]?.trait_type, v >= 0 ? traitNames[i]?.values[v] : undefined])
      .filter((x): x is [string, string] => !!x[0] && !!x[1] && x[0] !== "Background");
    return {
      eyebrow: `Rank #${rank != null ? num(rank) : "—"} · ${BANDS[band].name}`,
      title: `zkSNARK #${id}`,
      image: ZScan.zkSnarkImage(id),
      tag: ask != null ? ["Listed", "ok"] : ["Not listed", "muted"],
      stats: [
        ["Rank", rank != null ? `#${num(rank)}` : "—"],
        ["Ask", ask != null ? zec(ask).replace(" ZEC", "") : "—"],
        ["Last", last != null ? zec(last).replace(" ZEC", "") : "—"],
        ["Sales", String(sales)],
      ],
      body: `<dl class="kvlist">${traits.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl><div class="note">Hung on floor ${band + 1} (${esc(BANDS[band].name)}, ranks ${ranks(BANDS[band])}). Prices in ZEC on Zilkroad.</div>`,
      link: { href: `https://zilkroad.com/#/${id}`, label: "Zilkroad" },
    };
  };

  /** The item a hit lands on, if it is a portrait. */
  const itemAt = (hit: THREE.Intersection): { t: MapTuple; band: number } | null => {
    if (!data) return null;
    const o = hit.object;
    for (let i = 1; i < built.length; i++) {
      const c = built[i].cards;
      if (c && o === c.cards && hit.instanceId != null) {
        const t = data.byBand[i - 1][hit.instanceId];
        return t ? { t, band: i - 1 } : null;
      }
    }
    for (const b of built)
      for (const big of b.bigs)
        if (o === big.pic) {
          const t = data.byBand[big.band][big.index];
          return t ? { t, band: big.band } : null;
        }
    if (o === lobby.mosaic && hit.uv) {
      const col = Math.min(99, Math.floor(hit.uv.x * 100)),
        row = Math.min(99, Math.floor((1 - hit.uv.y) * 100));
      return byId.get(row * 100 + col + 1) ?? null;
    }
    if (o === lobby.street.cards && hit.instanceId != null) {
      const id = streetIds[hit.instanceId];
      return id ? (byId.get(id) ?? null) : null;
    }
    return null;
  };

  let current = 0;
  const pickables = () => {
    const b = built[current];
    const list: THREE.Object3D[] = [...b.bigs.map((x) => x.pic), ...b.extra];
    if (b.cards) list.push(b.cards.cards);
    if (current === 0) list.push(lobby.street.cards);
    return list;
  };

  return {
    key: "cards",
    title: "zkCARDS",
    scene,
    floors,
    colliders: (f) => built[f]?.rects ?? [],
    pickables,
    pick(hit) {
      if (hit.object === lobby.desk)
        return {
          eyebrow: "zkCARDS · info desk",
          title: "The zkSNARKs market",
          tag: ["Zilkroad", "info"],
          stats: data
            ? [
                ["Floor", zec(data.floor)],
                ["Listed", data.listings != null ? num(data.listings) : "—"],
                ["24h sales", data.sales24 != null ? String(data.sales24) : "—"],
                ["24h volume", zec(data.volume24, 1)],
              ]
            : undefined,
          body: `<div class="note">10,000 pixel portraits. Every floor above hangs one rank band, rarest first; take the elevator to walk the whole collection.</div>`,
          panel: "cards",
        };
      const it = itemAt(hit);
      return it ? itemInfo(it.t, it.band) : null;
    },
    hover(hit) {
      if (hit.object === lobby.desk) return `<b>Info desk</b><span>market &amp; listings</span>`;
      const it = itemAt(hit);
      if (!it) return null;
      const [id, rank, ask] = it.t;
      return `<b>#${id}</b><span>rank ${rank != null ? num(rank) : "—"}${ask != null ? ` · ${zec(ask)}` : ""}</span>`;
    },
    update(_dt, t, camera) {
      // only the floor the visitor stands on is drawn
      const y = camera.position.y - 1;
      let f = 0;
      for (let i = 0; i < FLOOR_Y.length; i++) if (y >= FLOOR_Y[i] - 0.5) f = i;
      if (f !== current) {
        built[current].group.visible = false;
        current = f;
      }
      built[current].group.visible = true;
      if (current === 0 && (lastBoard < 0 || t - lastBoard > 2)) {
        drawBoard();
        lastBoard = t;
      }
    },
  };
}
