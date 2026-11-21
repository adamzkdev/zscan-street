import * as THREE from "three";
import { BLIND, isComing, isLive, LAST_SALE, liveAuction, type Bid, type LiveAuction } from "../../data/auction";
import { Market } from "../../data/market";
import { portraitImage } from "../../data/portrait";
import { get, ZScan } from "../../data/zscan";
import type { Snark } from "../../scene/snark";
import { F, GOLD, LEVELS, MONO, paint, SANS, SERIF, Surface, type ReserveKit } from "./kit";

/**
 * 10 · THE AUCTION ROOM (Zilk Road). A saleroom: rows of gilt chairs, a walnut rostrum on a dais,
 * the auctioneer (zkSNARKs #1) with the gavel, the lot turning in a glass case beside it, and over
 * all of it the LED wall: the lot, the bid in ZEC and dollars, the bids so far, the clock. Bids on
 * Zilk Road come from its site, so here they come from the ZILK ROAD ONLINE desk: a clerk calls
 * them, the auctioneer takes them. When an auction is running on Zilk Road the room follows it
 * live (zilkroad.com/api/market/live-auction through the Worker); when one is announced it counts
 * down; otherwise it replays the last real sale, bid by bid, to "Sold!", the gavel and the
 * applause. On the east wall, the history: the blind auction that launched the collection.
 */

const sound = (name: string) => window.dispatchEvent(new CustomEvent("zstreet:sound", { detail: { name } }));
const DAIS_Z = -36.5,
  ROSTRUM_Z = -35.2,
  LOT_X = 5.6;
const zecUsd = () => Market.state.price?.usd ?? null;
const fmtZec = (n: number) => (n >= 10 ? n.toFixed(0) : n % 1 ? n.toFixed(2).replace(/0$/, "") : n.toFixed(0));
const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).toUpperCase() + " UTC";

type Mode = "replay" | "live" | "coming";
/** What the room shows now. */
interface State {
  mode: Mode;
  a: LiveAuction;
  /** The bids shown so far (oldest first) and the price on the board. */
  shown: Bid[];
  price: number;
  /** A word on the board: "", "FAIR WARNING", "GOING ONCE", "GOING TWICE", "SOLD", "+20:00". */
  call: string;
  callAt: number;
  sold: boolean;
}

export function auction(k: ReserveKit) {
  const f = F.auction;
  const L = LEVELS[f];
  const H = L.h;
  const W = 18;

  // ---- the room ----------------------------------------------------------------------------------
  const parquet = paint(
    256,
    256,
    (c) => {
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 8; j++) {
          const odd = (i + j) % 2;
          c.fillStyle = odd ? "#5a3a22" : "#4e321e";
          c.fillRect(j * 32, i * 16, 32, 16);
          c.fillStyle = "rgba(0,0,0,0.25)";
          c.fillRect(j * 32, i * 16 + 15, 32, 1);
          c.fillRect(j * 32 + 31, i * 16, 1, 16);
        }
    },
    12,
    14,
  );
  k.flat(f, 36, 40, new THREE.MeshStandardMaterial({ map: parquet, roughness: 0.38, metalness: 0.05 }), 0, -20, 0);
  // a long red carpet down the aisle to the rostrum
  k.flat(f, 2.4, 30, new THREE.MeshStandardMaterial({ color: "#5a0f18", roughness: 0.9 }), 0, -19, 0.01);
  const wallC = "#2a1b26";
  for (const [x0, z0, x1, z1] of [
    [-W, -40, W, -40],
    [-W, -40, -W, 0],
    [W, -40, W, 0],
    [-W, 0, W, 0],
  ] as const) {
    k.wall(f, x0, z0, x1, z1, H, wallC, "matte", 0.3);
    const along = z0 === z1;
    const len = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    const nx = along ? 0 : x0 < 0 ? 0.16 : -0.16,
      nz = along ? (z0 < -1 ? 0.16 : -0.16) : 0;
    const cx = (x0 + x1) / 2 + nx,
      cz = (z0 + z1) / 2 + nz;
    // dado of dark walnut, a gilt rail, the picture rail, the cornice
    k.box(f, along ? len : 0.08, 1.1, along ? 0.08 : len, cx, 0, cz, "#2e1c12", "polish");
    k.box(f, along ? len : 0.1, 0.05, along ? 0.1 : len, cx, 1.1, cz, GOLD, "metal");
    k.box(f, along ? len : 0.1, 0.05, along ? 0.1 : len, cx, 6.2, cz, GOLD, "metal");
    k.box(f, along ? len : 0.35, 0.5, along ? 0.35 : len, cx, H - 0.5, cz, "#e6dcc8", "polish");
  }
  // the ceiling and its lantern: a long skylight of frosted glass over the room
  k.box(f, 36, 0.3, 40, 0, H, -20, "#1c1418", "matte");
  k.box(f, 8, 0.05, 22, 0, H - 0.06, -20, "#8a7c66", "glow");
  for (let i = 0; i <= 10; i++) k.box(f, 8.2, 0.12, 0.12, 0, H - 0.2, -9 - i * 2.2, GOLD, "metal");
  for (const x of [-4.05, 4.05]) k.box(f, 0.14, 0.3, 22.4, x, H - 0.3, -20, GOLD, "metal");
  // two chandeliers
  for (const z of [-14, -26]) {
    k.geo(f, new THREE.TorusGeometry(1.1, 0.05, 8, 40).rotateX(Math.PI / 2).translate(0, H - 2.4, z), GOLD, "metal");
    k.geo(f, new THREE.TorusGeometry(0.7, 0.04, 8, 32).rotateX(Math.PI / 2).translate(0, H - 2.0, z), GOLD, "metal");
    k.box(f, 0.04, 2.0, 0.04, 0, H - 2.0, z, GOLD, "metal");
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.geo(f, new THREE.SphereGeometry(0.08, 10, 8).translate(Math.cos(a) * 1.1, H - 2.25, z + Math.sin(a) * 1.1), "#fff2d0", "glow");
    }
  }

  // ---- the dais, the rostrum, the gavel -------------------------------------------------------------
  k.box(f, 16, 0.45, 5.5, 0, 0, DAIS_Z, "#3a2416", "polish");
  k.box(f, 16, 0.06, 0.12, 0, 0.45, DAIS_Z + 2.72, GOLD, "metal");
  k.solid(f, -8, DAIS_Z - 2.75, 8, DAIS_Z + 2.75);
  // the rostrum: a walnut lectern with a brass plate
  k.box(f, 2.1, 1.15, 1.0, 0, 0.45, ROSTRUM_Z, "#3a2212", "polish");
  // the auctioneer's step behind it
  k.box(f, 1.6, 0.35, 0.9, 0, 0.45, ROSTRUM_Z - 0.9, "#2a180c", "polish");
  k.box(f, 2.3, 0.08, 1.15, 0, 1.6, ROSTRUM_Z - 0.05, "#2a180c", "polish");
  k.box(f, 2.14, 0.06, 1.04, 0, 0.45 + 0.6, ROSTRUM_Z, GOLD, "metal");
  k.plane(f, 1.6, 0.4, new THREE.MeshBasicMaterial({ map: plate("ZILK ROAD", "AUCTIONS"), toneMapped: false }), 0, 1.15, ROSTRUM_Z + 0.51);
  // the gavel and its sound block, on the rostrum (the head swings on SOLD)
  k.cyl(f, 0.12, 0.12, 0.05, 0.55, 1.68, ROSTRUM_Z + 0.15, "#2a180c", "polish", 20);
  const gavel = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: "#5a3418", roughness: 0.45 });
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 16).rotateZ(Math.PI / 2), wood);
  head.position.set(0.32, 0, 0);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.04, 16).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.9, roughness: 0.3 }));
  band.position.copy(head.position);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.34, 10).rotateZ(Math.PI / 2), wood);
  handle.position.set(0.15, 0, 0);
  gavel.add(head, band, handle);
  k.add(f, gavel, 0.2, 1.72, ROSTRUM_Z + 0.15, -0.4);
  let strike = -1;

  // ---- the LED wall over the rostrum ------------------------------------------------------------------
  const LW = 15,
    LH = 5.6;
  const led = new Surface(2048, Math.round((2048 * LH) / LW), 1.15);
  k.plane(f, LW, LH, led.mat, 0, 3.1 + LH / 2, -39.72);
  k.box(f, LW + 0.4, LH + 0.4, 0.12, 0, 2.9, -39.82, "#0c0a0c", "matte");
  // the lot in its glass case, turning, under its spot
  k.cyl(f, 0.75, 0.85, 1.05, LOT_X, 0.45, -35.4, "#14100e", "polish", 32);
  k.geo(f, new THREE.TorusGeometry(0.78, 0.03, 8, 40).rotateX(Math.PI / 2).translate(LOT_X, 1.5, -35.4), GOLD, "metal");
  const caseGlass = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.9, 1.5),
    new THREE.MeshStandardMaterial({ color: "#cfe6ee", roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.14, depthWrite: false }),
  );
  k.add(f, caseGlass, LOT_X, 1.5 + 0.95, -35.4);
  const lot = new THREE.Group();
  k.add(f, lot, LOT_X, 2.3, -35.4);
  let lotFor = -1;
  const showLot = (id: number) => {
    if (id === lotFor) return;
    lotFor = id;
    void portraitImage(ZScan.zkSnarkImage(id))
      .then((img) => {
        lot.clear();
        lot.add(pixelSlab(img, 0.05));
      })
      .catch(() => {});
  };

  // ---- the lifts, the sign -----------------------------------------------------------------------------
  k.lifts(f, 0, -0.16, Math.PI);
  k.label(f, "THE AUCTION ROOM", 0, 5.6, -0.3, { h: 0.5, color: GOLD, font: `700 96px ${SERIF}`, ry: Math.PI });

  // ---- the chairs, the bidders ----------------------------------------------------------------------------
  const seats: [number, number][] = [];
  for (let r = 0; r < 9; r++) {
    const z = -27.5 + r * 1.7;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const x = side * (2.2 + i * 1.3);
        seats.push([x, z]);
        // a gilt chair: legs, a red velvet seat, a back with an oval pad
        for (const [dx, dz] of [
          [-0.22, -0.2],
          [0.22, -0.2],
          [-0.22, 0.2],
          [0.22, 0.2],
        ])
          k.box(f, 0.04, 0.45, 0.04, x + dx, 0, z + dz, GOLD, "metal");
        k.box(f, 0.52, 0.08, 0.5, x, 0.45, z, "#7a1220", "matte");
        k.box(f, 0.5, 0.06, 0.06, x, 0.98, z + 0.24, GOLD, "metal");
        k.box(f, 0.04, 0.52, 0.04, x - 0.23, 0.45, z + 0.24, GOLD, "metal");
        k.box(f, 0.04, 0.52, 0.04, x + 0.23, 0.45, z + 0.24, GOLD, "metal");
        k.box(f, 0.4, 0.38, 0.04, x, 0.55, z + 0.25, "#7a1220", "matte");
      }
      k.solid(f, side < 0 ? -12.0 : 1.9, z - 0.3, side < 0 ? -1.9 : 12.0, z + 0.32);
    }
  }
  const people: Snark[] = [];
  let clerk: Snark | null = null,
    auctioneer: Snark | null = null;
  k.onCast(f, () => {
    // the room: a few rows full, the rest scattered, all facing the rostrum
    const taken = seats.filter((_, i) => (i * 37) % 5 < 3).slice(0, 34);
    taken.forEach(([x, z], i) => void k.person(f, 4000 + ((i * 263) % 5800), [x, z - 0.02], "Bidder", { sit: true, dy: 0.5, face: [0, -1] }).then((s) => s && people.push(s)));
    void k.person(f, 1, [0, ROSTRUM_Z - 0.85], "Auctioneer", { dy: 0.8, face: [0, 1] }).then((s) => (auctioneer = s));
    // ZILK ROAD ONLINE: the desk where the bids arrive (Zilk Road's site)
    void k.person(f, 6201, [13.2, -31.5], "Online clerk", { face: [-1, 0.4] }).then((s) => {
      if (!s) return;
      clerk = s;
      s.carry = "phone";
      s.redrawHold();
    });
    void k.person(f, 6202, [13.2, -29.2], "Online clerk", { face: [-1, 0.3] });
    // a standing crowd along the back
    k.crowd(
      f,
      Array.from({ length: 22 }, (_, i): [number, number, number, number, number] => [-14 + i * 1.33 + ((i * 7) % 3) * 0.2, 0, -10.2 - (i % 2) * 0.7, 1500 + i * 311, 1.6]),
    );
  });
  // the online desk: a long counter with screens showing Zilk Road
  k.box(f, 1.0, 0.95, 6, 14.6, 0, -30.4, "#2a180c", "polish");
  k.box(f, 1.1, 0.06, 6.1, 14.6, 0.95, -30.4, GOLD, "metal");
  k.solid(f, 14.1, -33.4, 15.1, -27.4);
  const desk = new Surface(1024, 256);
  desk.draw((g, w, h) => {
    g.fillStyle = "#0b0a0e";
    g.fillRect(0, 0, w, h);
    g.fillStyle = GOLD;
    g.font = `700 92px ${MONO}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("ZILK ROAD", w / 2, h * 0.4);
    g.fillStyle = "#d8d2c4";
    g.font = `500 46px ${MONO}`;
    g.fillText("ONLINE BIDS", w / 2, h * 0.78);
  });
  k.plane(f, 3.2, 0.8, desk.mat, 15.85, 3.2, -30.4, 0, -Math.PI / 2);
  for (const z of [-32.4, -30.4, -28.4]) {
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.62), new THREE.MeshBasicMaterial({ color: new THREE.Color("#7fd0ff").multiplyScalar(1.3), toneMapped: false }));
    k.add(f, scr, 14.4, 1.25, z, 0);
  }

  // ---- the east wall: the history ---------------------------------------------------------------------
  const hist = new Surface(1400, 1000);
  const drawHistory = (sales: LiveAuction[]) =>
    hist.draw((g, w, h) => {
      g.fillStyle = "#14100f";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = GOLD;
      g.lineWidth = 6;
      g.strokeRect(20, 20, w - 40, h - 40);
      g.fillStyle = GOLD;
      g.font = `700 64px ${SERIF}`;
      g.textAlign = "left";
      g.fillText("The blind auction", 70, 130);
      g.fillStyle = "#b8ab90";
      g.font = `500 32px ${MONO}`;
      g.fillText(`AUG 15–17, 2026 · BLOCKS ${BLIND.openHeight.toLocaleString("en-US")}–${BLIND.closeHeight.toLocaleString("en-US")}`, 70, 185);
      const rows: [string, string][] = [
        ["zkSNARKs offered", BLIND.supply.toLocaleString("en-US")],
        ["Funded bids", BLIND.bidsFunded.toLocaleString("en-US")],
        ["Minimum bid", `${BLIND.minimumZec} ZEC`],
        ["Clearing price", `${BLIND.clearingZec} ZEC`],
        ["Delivered", BLIND.delivered],
      ];
      rows.forEach(([a, b], i) => {
        const y = 270 + i * 74;
        g.fillStyle = "#e9dfca";
        g.font = `500 40px ${SANS}`;
        g.fillText(a, 70, y);
        g.fillStyle = "#ffffff";
        g.font = `700 44px ${MONO}`;
        g.textAlign = "right";
        g.fillText(b, w - 70, y);
        g.textAlign = "left";
      });
      g.fillStyle = "#8a7e68";
      g.font = `400 24px ${MONO}`;
      g.fillText(`Drawn from the hash of block ${BLIND.closeHeight.toLocaleString("en-US")}:`, 70, 670);
      g.fillText(`${BLIND.closeBlockHash.slice(0, 32)}`, 70, 702);
      g.fillText(`${BLIND.closeBlockHash.slice(32)}`, 70, 732);
      g.fillStyle = GOLD;
      g.font = `700 48px ${SERIF}`;
      g.fillText("Live sales", 70, 820);
      sales.slice(0, 2).forEach((s, i) => {
        g.fillStyle = "#e9dfca";
        g.font = `500 36px ${SANS}`;
        g.fillText(`${s.name}`, 70, 880 + i * 52);
        g.fillStyle = "#ffffff";
        g.font = `700 36px ${MONO}`;
        g.textAlign = "right";
        g.fillText(s.result?.sold ? `${fmtZec(Number(s.result.priceZec))} ZEC · ${fmtDate(s.endsAt).slice(0, 6)}` : "live", w - 70, 880 + i * 52);
        g.textAlign = "left";
      });
    });
  drawHistory([LAST_SALE]);
  k.plane(f, 4.2, 3.0, hist.mat, W - 0.24, 3.6, -18, 0, -Math.PI / 2);
  k.box(f, 0.06, 3.3, 4.5, W - 0.18, 1.95, -18, GOLD, "metal");
  // the 26 Apparitions, the lots of the live sales, framed along the west wall
  k.onCast(f, () => {
    void get<{ apparitions: { item: string; slot: number }[] }>("/v1/collections/zksnarks/apparitions").then((d) => {
      (d?.apparitions ?? []).slice(0, 26).forEach((a, i) => {
        const row = Math.floor(i / 13),
          col = i % 13;
        k.painting(f, Number(a.item), -W + 0.2, 3.6 + row * 1.7, -33 + col * 2.0, Math.PI / 2, 0.85);
      });
    });
  });

  // ---- lights ------------------------------------------------------------------------------------------------
  k.light(f, 0, 4.2, ROSTRUM_Z + 2.5, "#ffe0b0", 22, 12);
  k.light(f, LOT_X, 4.5, -34, "#fff0d8", 16, 8);
  k.light(f, 0, H - 2.6, -14, "#ffe6c0", 18, 20);
  k.light(f, 0, H - 2.6, -26, "#ffe6c0", 18, 20);
  k.light(f, 13, 3.5, -30.4, "#9fd4ff", 8, 8);

  // ---- confetti, on SOLD ---------------------------------------------------------------------------------------
  const CONF = 320;
  const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.08, 0.12), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CONF);
  const cp = Array.from({ length: CONF }, (_, i) => ({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, s: (i * 0.618) % 1 }));
  const confColors = ["#f4b728", "#ffffff", "#e8585a", "#ffd890"].map((c) => new THREE.Color(c).multiplyScalar(1.4));
  for (let i = 0; i < CONF; i++) conf.setColorAt(i, confColors[i % confColors.length]);
  conf.frustumCulled = false;
  conf.raycast = () => {};
  k.add(f, conf, 0, 0, 0);
  const launchConfetti = () => {
    cp.forEach((p) => {
      p.x = (Math.random() - 0.5) * 22;
      p.y = H - 0.8 - Math.random() * 1.5;
      p.z = -12 - Math.random() * 24;
      p.vx = (Math.random() - 0.5) * 0.6;
      p.vy = -0.6 - Math.random() * 0.8;
      p.vz = (Math.random() - 0.5) * 0.6;
    });
  };
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    one = new THREE.Vector3(1, 1, 1),
    v = new THREE.Vector3();

  // ---- the sale -----------------------------------------------------------------------------------------------
  const st: State = { mode: "replay", a: LAST_SALE, shown: [], price: Number(LAST_SALE.startingPriceZec), call: "", callAt: 0, sold: false };
  let lotImg: HTMLImageElement | null = null;
  let imgFor = -1;
  const loadImg = (id: number) => {
    if (id === imgFor) return;
    imgFor = id;
    void portraitImage(ZScan.zkSnarkImage(id))
      .then((im) => {
        lotImg = im;
        drawLed();
      })
      .catch(() => {});
  };
  let ft = 0;
  /** The replay's script: [time, action] from its start. */
  let script: [number, () => void][] = [];
  let at = 0,
    si = 0,
    loopAt = 0;
  const say = (s: Snark | null, text: string, sec = 3.4) => s?.say(text, sec);
  const bidEvent = (b: Bid, i: number, all: Bid[]) => {
    const amount = Number(b.amountZec);
    st.shown.push(b);
    st.price = amount;
    st.call = "";
    // a bid in the last minutes moved the close: Zilk Road's extension
    const extended = Date.parse(st.a.endsAt) - Date.parse(b.receivedAt) <= st.a.extensionSeconds * 1000 + 60_000 && i === all.length - 1;
    if (extended) {
      st.call = `+${Math.round(st.a.extensionSeconds / 60)}:00`;
      st.callAt = ft;
    }
    say(clerk, `Online — ${fmtZec(amount)} ZEC!`, 2.6);
    clerk?.emote("!", 1.6);
    sound("bid");
    setTimeout(() => {
      const next = fmtZec(Math.ceil(amount * (1 + st.a.incrementPercent / 100) * 10) / 10);
      say(
        auctioneer,
        i === 0
          ? `${fmtZec(amount)} ZEC, online. Do I hear ${next}?`
          : extended
            ? `${fmtZec(amount)} ZEC! The clock runs again: twenty more minutes.`
            : `${fmtZec(amount)} ZEC, online. ${next} anywhere?`,
        3.6,
      );
    }, 1300);
    for (const p of people) if (Math.random() < 0.25) p.emote(Math.random() < 0.5 ? "!" : "zec", 2);
    drawLed();
  };
  const soldEvent = () => {
    st.sold = true;
    st.call = "SOLD";
    st.callAt = ft;
    strike = 0;
    sound("gavel");
    setTimeout(() => sound("applause"), 250);
    say(auctioneer, `Sold! ${fmtZec(st.price)} ZEC, online.`, 4);
    launchConfetti();
    for (const p of people) p.emote(Math.random() < 0.6 ? "heart" : "star", 3 + Math.random() * 2);
    drawLed();
  };
  /** The replay of a finished sale, bid by bid, about two minutes, then again. */
  const buildReplay = (a: LiveAuction) => {
    const bids = [...a.bids].reverse();
    const s: [number, () => void][] = [];
    s.push([
      0,
      () => {
        st.shown = [];
        st.price = Number(a.startingPriceZec);
        st.call = "";
        st.sold = false;
        lot.visible = true;
        showLot(a.tokenId);
        loadImg(a.tokenId);
        say(auctioneer, `Lot ${a.apparition?.slot ?? ""}. ${a.name}.`, 3.2);
        drawLed();
      },
    ]);
    s.push([3.6, () => say(auctioneer, `We open at ${fmtZec(Number(a.startingPriceZec))} ZEC.`, 3)]);
    let t = 8;
    bids.forEach((b, i) => {
      s.push([t, () => bidEvent(b, i, bids)]);
      t += 8.5;
    });
    const call = (word: string, line: string) => () => {
      st.call = word;
      st.callAt = ft;
      say(auctioneer, line, 2.6);
      drawLed();
    };
    s.push([t, call("FAIR WARNING", `Fair warning… ${fmtZec(Number(a.highestBidZec ?? st.price))} ZEC.`)]);
    s.push([t + 3, call("GOING ONCE", "Going once…")]);
    s.push([t + 6, call("GOING TWICE", "Going twice…")]);
    s.push([t + 9, soldEvent]);
    s.push([t + 24, () => {}]);
    return s;
  };

  /** Sort out what to show from Zilk Road's newest auction. */
  const adopt = (a: LiveAuction | null) => {
    const now = Date.now();
    if (a && isLive(a, now)) {
      const first = st.mode !== "live" || st.a.id !== a.id;
      st.mode = "live";
      if (first) {
        st.shown = [];
        st.price = Number(a.startingPriceZec);
        st.sold = false;
        st.call = "";
        say(auctioneer, `Live from Zilk Road: ${a.name}.`, 3.5);
      }
      // new bids since the last look, oldest first
      const bids = [...a.bids].reverse();
      const seen = new Set(st.shown.map((b) => b.receivedAt + b.amountZec));
      st.a = a;
      bids.forEach((b, i) => {
        if (!seen.has(b.receivedAt + b.amountZec)) bidEvent(b, i, bids);
      });
      showLot(a.tokenId);
      loadImg(a.tokenId);
      drawLed();
      return;
    }
    if (a && isComing(a, now)) {
      st.mode = "coming";
      st.a = a;
      showLot(a.tokenId);
      loadImg(a.tokenId);
      drawLed();
      return;
    }
    // over: replay it (the newest sold one we know)
    const sold = a && a.phase === "sold" && a.bids.length ? a : LAST_SALE;
    if (st.mode !== "replay" || st.a.id !== sold.id) {
      st.mode = "replay";
      st.a = sold;
      script = buildReplay(sold);
      si = 0;
      at = 0;
    }
    if (sold.id !== LAST_SALE.id) drawHistory([sold, LAST_SALE]);
  };
  script = buildReplay(LAST_SALE);

  // ---- the board ------------------------------------------------------------------------------------------
  function drawLed() {
    led.draw((g, w, h) => {
      const a = st.a;
      g.fillStyle = "#060507";
      g.fillRect(0, 0, w, h);
      // the lot
      const s = h - 80;
      g.fillStyle = "#121014";
      g.fillRect(40, 40, s, s);
      if (lotImg) {
        g.imageSmoothingEnabled = false;
        g.drawImage(lotImg, 40, 40, s, s);
      }
      const x0 = 40 + s + 70;
      g.textAlign = "left";
      g.textBaseline = "alphabetic";
      const tag = st.mode === "live" ? "● LIVE · ZILK ROAD" : st.mode === "coming" ? "NEXT SALE · ZILK ROAD" : `REPLAY · ${fmtDate(a.startsAt).slice(0, 6)}–${fmtDate(a.endsAt).slice(0, 6)}, 2026`;
      g.fillStyle = st.mode === "live" ? "#ff5a5a" : "#b8ab90";
      g.font = `600 40px ${MONO}`;
      g.fillText(tag, x0, 100);
      g.fillStyle = "#ffffff";
      g.font = `700 78px ${SANS}`;
      g.fillText(a.name.toUpperCase(), x0, 196);
      g.fillStyle = "#8a8070";
      g.font = `600 34px ${MONO}`;
      g.fillText(`LOT ${a.apparition?.slot ?? a.id}`, x0, 250);
      if (st.mode === "coming") {
        const left = Math.max(0, Date.parse(a.startsAt) - Date.now());
        g.fillStyle = GOLD;
        g.font = `700 150px ${MONO}`;
        g.fillText(clock(left), x0, 420);
        g.fillStyle = "#d8d2c4";
        g.font = `500 44px ${MONO}`;
        g.fillText(`BIDDING OPENS · STARTS AT ${fmtZec(Number(a.startingPriceZec))} ZEC`, x0, 500);
        return;
      }
      // the bid, big, in ZEC and dollars
      g.fillStyle = st.sold ? "#7dffb0" : GOLD;
      g.font = `800 176px ${MONO}`;
      g.fillText(`${fmtZec(st.price)} ZEC`, x0, 430);
      const usd = zecUsd();
      g.fillStyle = "#d8d2c4";
      g.font = `500 52px ${MONO}`;
      g.fillText(usd ? `≈ $${Math.round(st.price * usd).toLocaleString("en-US")}` : "", x0, 520);
      g.fillStyle = "#8a8070";
      g.font = `500 36px ${MONO}`;
      g.fillText(st.shown.length ? `${st.shown.length} BID${st.shown.length > 1 ? "S" : ""} · +${a.incrementPercent}% STEPS` : `OPENING BID`, x0, 580);
      // the bids so far, newest on top
      const bx = w - 470;
      g.fillStyle = "#8a8070";
      g.font = `600 32px ${MONO}`;
      g.fillText("BIDS", bx, 100);
      [...st.shown]
        .reverse()
        .slice(0, 6)
        .forEach((b, i) => {
          const y = 160 + i * 70;
          g.fillStyle = i === 0 ? "#ffffff" : "#9a9080";
          g.font = `${i === 0 ? 700 : 500} 44px ${MONO}`;
          g.fillText(`${fmtZec(Number(b.amountZec))} ZEC`, bx, y);
          g.font = `500 26px ${MONO}`;
          g.font = `500 24px ${MONO}`;
          g.fillText(fmtDate(b.receivedAt), bx + 200, y - 4);
        });
      // the live clock, or the word of the moment
      if (st.mode === "live" && !st.sold) {
        const left = Math.max(0, Date.parse(a.endsAt) - Date.now());
        g.fillStyle = left < 120_000 ? "#ff5a5a" : "#ffffff";
        g.font = `700 64px ${MONO}`;
        g.fillText(`ENDS IN ${clock(left)}`, bx, h - 60);
      }
      if (st.call) {
        const big = st.call === "SOLD";
        g.save();
        g.translate(x0 + (big ? 700 : 600), h - 110);
        g.rotate(big ? -0.08 : 0);
        g.fillStyle = big ? "#7dffb0" : st.call.startsWith("+") ? "#ff9a3c" : "#ffffff";
        g.font = `800 ${big ? 150 : 72}px ${SANS}`;
        g.textAlign = "center";
        g.fillText(st.call.startsWith("+") ? `EXTENSION ${st.call}` : big ? "SOLD!" : `${st.call}…`, 0, 0);
        g.restore();
      }
    });
  }
  drawLed();

  // ---- the room, every frame ---------------------------------------------------------------------------------
  let poll = 0;
  k.arrive[f].push(() => {
    poll = 0;
    st.mode = "replay";
    si = 0;
    at = 0;
    void liveAuction().then(adopt);
  });
  k.ticks[f].push((dt, t) => {
    ft += dt;
    lot.rotation.y = t * 0.4;
    // Zilk Road, every 20 s while you're in the room
    poll += dt;
    if (poll > 20) {
      poll = 0;
      void liveAuction().then(adopt);
    }
    if (st.mode === "replay") {
      at += dt;
      while (si < script.length && at >= script[si][0]) script[si++][1]();
      if (si >= script.length) {
        loopAt += dt;
        if (loopAt > 2) {
          loopAt = 0;
          si = 0;
          at = 0;
        }
      }
    }
    // the clocks on the board tick every second
    if (st.mode !== "replay" && Math.floor(ft) !== Math.floor(ft - dt)) drawLed();
    // the gavel comes down twice
    if (strike >= 0) {
      strike += dt;
      const s = strike < 0.6 ? Math.sin((strike / 0.3) * Math.PI) : 0;
      gavel.rotation.z = -Math.abs(s) * 0.9;
      if (strike > 0.8) strike = -1;
    }
    // confetti
    let live = false;
    cp.forEach((p, i) => {
      if (p.y < -50) {
        m4.makeScale(0, 0, 0);
        conf.setMatrixAt(i, m4);
        return;
      }
      live = true;
      p.x += p.vx * dt + Math.sin(t * 2 + p.s * 20) * 0.01;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02) p.y = -100;
      e.set(t * (2 + p.s * 3), t * (1.5 + p.s * 2), p.s * 6);
      q.setFromEuler(e);
      m4.compose(v.set(p.x, p.y, p.z), q, one);
      conf.setMatrixAt(i, m4);
    });
    if (live || conf.userData.dirty) conf.instanceMatrix.needsUpdate = true;
    conf.userData.dirty = live;
  });
}

/** "2D 03:12:45" or "12:34". */
function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400),
    hh = Math.floor((s % 86400) / 3600),
    mm = Math.floor((s % 3600) / 60),
    ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return d ? `${d}D ${p(hh)}:${p(mm)}:${p(ss)}` : hh ? `${p(hh)}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}

/** A brass plate: a name, a line under it. */
function plate(name: string, sub: string) {
  return paint(800, 200, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#e8c46a");
    gr.addColorStop(1, "#a8802a");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#6a4a10";
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = "#3a2408";
    g.textAlign = "center";
    g.font = `700 84px ${SERIF}`;
    g.fillText(name, w / 2, 108);
    g.font = `600 36px ${SANS}`;
    g.fillText(sub, w / 2, 165);
  });
}

/** A zkSNARK portrait (26 × 26) as a slab of lit pixels, `vox` metres a pixel, centred. */
function pixelSlab(img: HTMLImageElement, vox: number) {
  const N = 26;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, N, N);
  const d = g.getImageData(0, 0, N, N).data;
  const cells: [number, number, THREE.Color][] = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      if (d[i + 3] < 40 || d[i] + d[i + 1] + d[i + 2] < 24) continue;
      cells.push([x, y, new THREE.Color().setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace).multiplyScalar(1.15)]);
    }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(vox * 0.96, vox * 0.96, vox * 2), new THREE.MeshBasicMaterial({ toneMapped: false }), cells.length);
  const m = new THREE.Matrix4();
  cells.forEach(([x, y, col], i) => {
    im.setMatrixAt(i, m.makeTranslation((x - N / 2 + 0.5) * vox, (N / 2 - y - 0.5) * vox, 0));
    im.setColorAt(i, col);
  });
  im.raycast = () => {};
  return im;
}
