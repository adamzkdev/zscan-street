import { portraitImage } from "../../data/portrait";
import { onSnarkMarket, refreshSnarkMarket, snarkMarket, type Order, type Sale, type SnarkMarket } from "../../data/snarkmarket";
import { API, EXPLORER } from "../../data/zscan";
import type { Snark } from "../../scene/snark";
import type { PickInfo } from "../types";
import { board } from "./data";
import { F, GOLD, LEVELS, MONO, SANS, Surface, zec, type ReserveKit } from "./kit";

/**
 * The trading floor's east side, under the visitors' gallery: the zkSNARKs EXCHANGE. Three big
 * screens on the wall, read live from ZScan's API (the Zilkroad market): the ASKS (the cheapest
 * listed zkSNARKs), the JUST SOLD board (the latest sale big, with its portrait, and the tape of
 * the ones before), the BIDS (the best offers). Two brokers at the counter call every new sale.
 */

const f = F.trading;
const L = LEVELS[f];
const WX = 21.72; // the screens' plane, on the east wall under the gallery
const UP = "#3ee08f",
  DOWN = "#ff5d6c",
  DIM = "#8f8a80";
const POLL = 20;

const itemUrl = (id: number) => `${EXPLORER}/collection/zksnarks/item/${id}`;
const venueUrl = (id: number) => `https://zilkroad.com/#/${id}`;
const z2 = (zat: number | null) => (zat == null ? "–" : zec(zat, zat < 1e8 ? 3 : 2));
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`;
};

// the portraits, fetched once each (the API answers with CORS, so the canvases stay clean)
const faces = new Map<number, HTMLImageElement | null>();
let onFace: () => void = () => {};
function face(id: number) {
  if (faces.has(id)) return faces.get(id)!;
  faces.set(id, null);
  void portraitImage(`${API}/v1/collections/zksnarks/items/${id}/image`).then((image) => {
    faces.set(id, image);
    onFace();
  }).catch(() => {
    // A later board refresh can retry; a failed portrait is never cached forever.
    setTimeout(() => faces.delete(id), 30_000);
  });
  return null;
}
function portrait(g: CanvasRenderingContext2D, id: number, x: number, y: number, s: number) {
  g.fillStyle = "#000";
  g.fillRect(x, y, s, s);
  const i = face(id);
  if (i) {
    g.imageSmoothingEnabled = false;
    g.drawImage(i, x, y, s, s);
    g.imageSmoothingEnabled = true;
  }
}

function drawBook(g: CanvasRenderingContext2D, W: number, H: number, side: "ask" | "bid", m: SnarkMarket | null) {
  const ask = side === "ask";
  board(g, W, H, ask ? "ASKS · 売" : "BIDS · 買", ask ? `cheapest listed · ${m?.listings ?? "–"} for sale` : `best offers · ${m?.bidCount ?? "–"} open`);
  const s = Math.min(H / 300, W / 520);
  const rows: Order[] = (ask ? m?.asks : m?.bids)?.slice(0, 7) ?? [];
  const top = 64 * s,
    rh = (H - top - 10 * s) / 7;
  const col = ask ? DOWN : UP;
  g.textBaseline = "middle";
  if (!rows.length) {
    g.fillStyle = DIM;
    g.font = `500 ${Math.round(20 * s)}px ${MONO}`;
    g.fillText(m ? "none right now" : "reading the market…", 18 * s, top + rh);
  }
  rows.forEach((o, i) => {
    const y = top + i * rh;
    if (i % 2) {
      g.fillStyle = "rgba(255,255,255,0.03)";
      g.fillRect(0, y, W, rh);
    }
    portrait(g, o.id, 16 * s, y + rh * 0.1, rh * 0.8);
    g.fillStyle = "#e9e4d8";
    g.font = `700 ${Math.round(rh * 0.42)}px ${SANS}`;
    g.textAlign = "left";
    g.fillText(`#${o.id}`, 16 * s + rh, y + rh / 2);
    g.fillStyle = DIM;
    g.font = `500 ${Math.round(rh * 0.3)}px ${MONO}`;
    g.fillText(o.rank ? `rank ${o.rank.toLocaleString("en-US")}` : "", W * 0.36, y + rh / 2);
    g.textAlign = "right";
    g.fillStyle = col;
    g.font = `800 ${Math.round(rh * 0.46)}px ${MONO}`;
    g.fillText(`${z2(ask ? o.ask : o.bid)} ZEC`, W - 18 * s, y + rh / 2);
    // depth bar behind the price, against the board's best
    const best = ask ? rows[0].ask! : rows[0].bid!;
    const v = (ask ? o.ask : o.bid) ?? 0;
    const w = Math.min(1, ask ? best / Math.max(v, 1) : v / Math.max(best, 1)) * W * 0.3;
    g.fillStyle = ask ? "rgba(255,93,108,0.14)" : "rgba(62,224,143,0.14)";
    g.fillRect(W - w, y + rh * 0.12, w, rh * 0.76);
    g.textAlign = "left";
  });
  g.textBaseline = "alphabetic";
}

function drawSold(g: CanvasRenderingContext2D, W: number, H: number, m: SnarkMarket | null, flash: number, t: number) {
  board(g, W, H, "JUST SOLD · 約定", m ? `floor ${z2(m.floor)} ZEC · 24h: ${m.sales24h ?? "–"} sales, ${z2(m.volume24h)} ZEC` : "reading the market…");
  const s = Math.min(H / 300, W / 520);
  const last = m?.sales[0];
  if (!last) return;
  // the newest sale, big
  const top = 64 * s;
  const P = H * 0.44;
  if (flash > 0) {
    g.strokeStyle = `rgba(244,183,40,${0.4 + 0.6 * Math.abs(Math.sin(t * 6))})`;
    g.lineWidth = 10 * s;
    g.strokeRect(5 * s, 5 * s, W - 10 * s, H - 10 * s);
  }
  portrait(g, last.id, 22 * s, top + 6 * s, P);
  const x = 22 * s + P + 24 * s;
  g.textBaseline = "top";
  g.fillStyle = flash > 0 ? GOLD : UP;
  g.font = `900 ${Math.round(P * 0.2)}px ${SANS}`;
  g.fillText("SOLD", x, top + 4 * s);
  g.fillStyle = "#f2eee4";
  g.font = `800 ${Math.round(P * 0.22)}px ${SANS}`;
  g.fillText(`zkSNARKs #${last.id}`, x, top + P * 0.27);
  g.fillStyle = GOLD;
  g.font = `800 ${Math.round(P * 0.26)}px ${MONO}`;
  g.fillText(`${z2(last.price)} ZEC`, x, top + P * 0.54);
  g.fillStyle = DIM;
  g.font = `500 ${Math.round(P * 0.11)}px ${MONO}`;
  g.fillText(`${ago(last.time)} · zilkroad.com`, x, top + P * 0.86);
  // the tape of the ones before
  const before = m!.sales.slice(1, 7);
  const ty = top + P + 26 * s,
    th = H - ty - 12 * s;
  const cw = (W - 30 * s) / Math.max(1, before.length);
  before.forEach((sale, i) => {
    const cx = 15 * s + i * cw;
    portrait(g, sale.id, cx, ty, th * 0.62);
    g.fillStyle = "#e9e4d8";
    g.font = `700 ${Math.round(th * 0.16)}px ${SANS}`;
    g.fillText(`#${sale.id}`, cx + th * 0.68, ty + th * 0.02);
    g.fillStyle = GOLD;
    g.font = `700 ${Math.round(th * 0.15)}px ${MONO}`;
    g.fillText(`${z2(sale.price)}`, cx + th * 0.68, ty + th * 0.24);
    g.fillStyle = DIM;
    g.font = `500 ${Math.round(th * 0.12)}px ${MONO}`;
    g.fillText(ago(sale.time), cx + th * 0.68, ty + th * 0.46);
  });
  g.textBaseline = "alphabetic";
}

const rowsHtml = (list: Order[], side: "ask" | "bid") =>
  list
    .slice(0, 20)
    .map((o) => `<p><a href="${itemUrl(o.id)}" target="_blank" rel="noopener"><b>zkSNARKs #${o.id}</b></a> · ${z2(side === "ask" ? o.ask : o.bid)} ZEC${o.rank ? ` · rank ${o.rank}` : ""} · <a href="${venueUrl(o.id)}" target="_blank" rel="noopener">Zilkroad</a></p>`)
    .join("");
const salesHtml = (list: Sale[]) => list.slice(0, 20).map((x) => `<p><a href="${itemUrl(x.id)}" target="_blank" rel="noopener"><b>zkSNARKs #${x.id}</b></a> · ${z2(x.price)} ZEC · ${ago(x.time)}</p>`).join("");

export function snarkExchange(k: ReserveKit, cheer: (n: number) => void) {
  const asks = new Surface(1536, 640);
  const sold = new Surface(2048, 736);
  const bids = new Surface(1536, 640);
  const SCREENS: [Surface, number, number, number][] = [
    [asks, -12.0, 6.7, 2.8],
    [sold, -21.6, 8.2, 2.95],
    [bids, -31.2, 6.7, 2.8],
  ];
  // under the ticker tape that runs round the room (3.55 – 4.15 m)
  const Y = 0.5;
  for (const [s, z, w, h] of SCREENS) {
    k.box(f, 0.14, h + 0.3, w + 0.3, WX + 0.1, Y - 0.15, z, "#06070b", "polish");
    k.plane(f, w, h, s.mat, WX, Y + h / 2, z, 0, -Math.PI / 2);
  }
  // the name on the gallery's front, over the screens
  k.label(f, "zkSNARKs EXCHANGE · 交易所", 18.7, 3.75, -21.6, { h: 0.34, color: GOLD, ry: -Math.PI / 2 });
  // the brokers' counter in front of the JUST SOLD board
  k.box(f, 0.8, 0.82, 6.0, 18.2, 0, -21.6, "#3a2416", "polish");
  k.box(f, 0.9, 0.05, 6.1, 18.2, 0.82, -21.6, GOLD, "metal");
  k.solid(f, 17.75, -24.6, 18.65, -18.6);

  let flash = 0;
  let t = 0;
  const redraw = () => {
    const m = snarkMarket();
    asks.draw((g, W, H) => drawBook(g, W, H, "ask", m));
    bids.draw((g, W, H) => drawBook(g, W, H, "bid", m));
    sold.draw((g, W, H) => drawSold(g, W, H, m, flash, t));
  };
  onFace = redraw;
  redraw();
  void document.fonts?.ready.then(redraw);

  const brokers: Snark[] = [];
  onSnarkMarket((m, fresh) => {
    redraw();
    if (!fresh.length || k.current !== f) return;
    flash = 6;
    cheer(1.1);
    const s = fresh[0];
    brokers.forEach((b, i) => setTimeout(() => b.say(i ? `${z2(s.price)} ZEC!` : `SOLD! #${s.id}!`, 2.8, "shout"), i * 500));
  });
  let acc = POLL,
    draw = 0;
  k.ticks[f].push((dt) => {
    t += dt;
    acc += dt;
    draw += dt;
    if (acc >= POLL) {
      acc = 0;
      void refreshSnarkMarket();
    }
    if (flash > 0) {
      flash = Math.max(0, flash - dt);
      if (draw > 0.1) {
        draw = 0;
        sold.draw((g, W, H) => drawSold(g, W, H, snarkMarket(), flash, t));
      }
    } else if (draw > 15) {
      // the "x min ago" move on
      draw = 0;
      redraw();
    }
  });
  k.arrive[f].push(() => (acc = POLL));

  const info = (which: "ask" | "bid" | "sold"): PickInfo => {
    const m = snarkMarket();
    if (which === "sold") {
      const last = m?.sales[0];
      return {
        eyebrow: "zkSNARKs EXCHANGE · Zilkroad",
        title: last ? `zkSNARKs #${last.id} sold` : "Latest sales",
        image: last ? `${API}/v1/collections/zksnarks/items/${last.id}/image` : undefined,
        stats: [
          ["Price", last ? `${z2(last.price)} ZEC` : "–"],
          ["Floor", `${z2(m?.floor ?? null)} ZEC`],
          ["Sales 24h", String(m?.sales24h ?? "–")],
          ["Volume 24h", `${z2(m?.volume24h ?? null)} ZEC`],
        ],
        body: m ? salesHtml(m.sales) : "<p>Loading…</p>",
        link: { href: `${EXPLORER}/collection/zksnarks`, label: "The collection on ZScan" },
      };
    }
    const list = (which === "ask" ? m?.asks : m?.bids) ?? [];
    return {
      eyebrow: "zkSNARKs EXCHANGE · Zilkroad",
      title: which === "ask" ? "Asks · cheapest listed" : "Bids · best offers",
      stats: which === "ask" ? [["Listed", String(m?.listings ?? "–")], ["Floor", `${z2(m?.floor ?? null)} ZEC`]] : [["Open bids", String(m?.bidCount ?? "–")], ["Best", `${z2(list[0]?.bid ?? null)} ZEC`]],
      body: list.length ? rowsHtml(list, which) : "<p>None right now.</p>",
      link: { href: "https://zilkroad.com", label: "Trade on Zilkroad" },
    };
  };
  k.hit(f, 0.3, 2.8, 6.7, WX - 0.2, Y, -12.0, "<b>Asks</b><span>the cheapest zkSNARKs for sale, live</span>", () => info("ask"));
  k.hit(f, 0.3, 2.95, 8.2, WX - 0.2, Y, -21.6, "<b>Just sold</b><span>the latest zkSNARKs sales, live</span>", () => info("sold"));
  k.hit(f, 0.3, 2.8, 6.7, WX - 0.2, Y, -31.2, "<b>Bids</b><span>the best offers on zkSNARKs, live</span>", () => info("bid"));

  k.onCast(f, () => {
    const lines = [() => `Floor's ${z2(snarkMarket()?.floor ?? null)} ZEC. Who's buying?`, () => (snarkMarket()?.sales[0] ? `Last print: #${snarkMarket()!.sales[0].id} at ${z2(snarkMarket()!.sales[0].price)} ZEC.` : "Waiting on the next print."), () => `${snarkMarket()?.bidCount ?? 0} bids on the book. Thin.`];
    void k.person(f, 6101, [18.0, -17.7], "zkSNARK broker", { face: [-1, 0], lines, every: [10, 18] }).then((s) => s && brokers.push(s));
    void k.person(f, 6102, [18.0, -25.5], "zkSNARK broker", { face: [-1, 0], lines: [() => `Best bid ${z2(snarkMarket()?.bids[0]?.bid ?? null)} ZEC on #${snarkMarket()?.bids[0]?.id ?? "–"}.`, "Sell me a rare one!", () => `${snarkMarket()?.listings ?? "–"} listed. Plenty of supply.`], every: [12, 20] }).then((s) => s && brokers.push(s));
  });
  void L;
}
