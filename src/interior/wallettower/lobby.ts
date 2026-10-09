import * as THREE from "three";
import { StreetPay, type Mark } from "../../data/streetpay";
import { xImage, type WalletFeed } from "../../data/walletfeed";
import { drawMark, emblem } from "../../scene/emblems";
import { qrCanvas } from "../../ui/paydesk";
import { indoorTree } from "../furniture";
import type { PickInfo } from "../types";
import { marbleTex, num, rr, Surface } from "../zktowers/kit";
import { drawGuestbook, drawPhone } from "./desk";
import { avatar, compact, cover, day, esc, fitText, FONT, type Look, stars, type WalletKit } from "./shared";

/**
 * G · the lobby: the wallet's emblem turning on a beam of light over a pedestal in the middle,
 * the wallet's card on the back wall (its X banner, profile, App Store rating, latest release,
 * GitHub), and by the windows the giant phone with the live QR code (tip ZStreet from your own
 * wallet) and the guestbook board.
 */

const f = 0;
const X0 = -14,
  X1 = 14,
  Z0 = -26,
  Z1 = 0,
  H = 9;

export function lobby(wk: WalletKit) {
  const { k, look } = wk;
  const zodl = look.key === "zodl";

  // ---- floor, ceiling, walls -------------------------------------------------------------------------
  k.flat(f, X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ map: marbleTex(zodl ? 11 : 13, look.floor, look.vein, 512, 4, 4, 4, "rgba(0,0,0,0.45)"), roughness: 0.12, metalness: 0.12 }), 0, (Z0 + Z1) / 2);
  k.box(f, X1 - X0, 0.3, Z1 - Z0, 0, H, (Z0 + Z1) / 2, look.dark);
  k.curtain(f, X0, Z1, -2.2, Z1, H, look.dark, 2.2, { transom: 3.4 });
  k.curtain(f, 2.2, Z1, X1, Z1, H, look.dark, 2.2, { transom: 3.4 });
  k.curtain(f, X0, Z0, X0, Z1, H, look.dark, 2.4, { transom: 3.4 });
  k.curtain(f, X1, Z0, X1, Z1, H, look.dark, 2.4, { transom: 3.4 });
  k.wall(f, X0, Z0, X1, Z0, H, look.wall, "polish", 0.4);
  // the doors: a lit portal of the accent, shut behind you (you leave with Exit)
  k.box(f, 4.6, 0.3, 0.5, 0, 3.4, Z1, look.glow, "glow");
  for (const x of [-2.3, 2.3]) k.box(f, 0.3, 3.4, 0.5, x, 0, Z1, look.trim, "metal");
  k.box(f, 4.3, 3.4, 0.05, 0, 0, Z1, "#cfe4f4", "glass");
  k.solid(f, -2.2, Z1 - 0.2, 2.2, Z1 + 2);
  k.label(f, look.title, 0, 4.15, Z1 - 0.3, { h: 0.36, color: look.sign, ry: Math.PI });

  // ceiling: concentric rings of light over the pedestal
  for (const [r, c] of [
    [3.2, look.glow],
    [5.6, look.glow],
    [8.0, look.glow],
  ] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(look.key === "zodl" ? 0.9 : 1.6), toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.raycast = () => {};
    k.add(f, ring, 0, H - 0.2, -13, 0);
  }

  // ---- the pedestal and the emblem ------------------------------------------------------------------
  const CZ = -13;
  k.cyl(f, 2.1, 2.3, 0.45, 0, 0, CZ, look.dark, "polish", 48);
  k.cyl(f, 2.12, 2.12, 0.04, 0, 0.45, CZ, look.glow, "glow", 48);
  k.cyl(f, 1.5, 1.5, 0.06, 0, 0.47, CZ, look.trim, "metal", 48);
  // the floor inlay: a ring of the accent
  k.cyl(f, 4.2, 4.2, 0.012, 0, 0, CZ, look.sign, "glow", 64);
  k.cyl(f, 4.05, 4.05, 0.016, 0, 0, CZ, look.floor, "polish", 64);
  k.ring(f, 0, CZ, 2.3);
  spinning(wk);
  k.hit(f, 4, 6.5, 4, 0, 0, CZ, `<b>${look.name}</b><span>${look.motto}</span>`, () => profileInfo(wk.feed(), look));

  // ---- the back wall: banner, card, store, GitHub -----------------------------------------------------
  const zw = Z0 + 0.22;
  const banner = new Surface(1536, 512, 1.0);
  const card = new Surface(1536, 512, 1.05);
  const store = new Surface(640, 512, 1.05);
  const git = new Surface(640, 512, 1.05);
  for (const [s, w, h, x, y] of [
    [banner, 10.8, 3.6, 0, 6.65],
    [card, 10.8, 3.6, 0, 2.7],
    [store, 4.5, 3.6, -9.0, 2.7],
    [git, 4.5, 3.6, 9.0, 2.7],
  ] as const) {
    k.box(f, w + 0.24, h + 0.24, 0.08, x, y - h / 2 - 0.12, zw - 0.02, look.trim, "metal");
    k.plane(f, w, h, s.mat, x, y, zw + 0.03);
  }
  k.label(f, look.motto.toUpperCase(), -9.0, 6.0, zw + 0.04, { h: 0.2, color: look.sign });
  k.label(f, `@${look.handle}`, 9.0, 6.0, zw + 0.04, { h: 0.26, color: look.sign });
  drawMarkPlate(k, f, look, -9.0, 7.4, zw);
  drawMarkPlate(k, f, look, 9.0, 7.4, zw);
  const redraw = async () => {
    const feed = wk.feed();
    const [av, bn] = await Promise.all([xImage(feed?.profile?.avatar), xImage(feed?.profile?.banner)]);
    banner.draw((g, W, Hh) => drawBanner(g, W, Hh, look, bn));
    card.draw((g, W, Hh) => drawCard(g, W, Hh, feed, look, av));
    store.draw((g, W, Hh) => drawStore(g, W, Hh, feed, look));
    git.draw((g, W, Hh) => drawGit(g, W, Hh, feed, look));
  };
  wk.onFeed(() => void redraw());
  void redraw();
  void document.fonts?.ready.then(() => void redraw());
  k.hit(f, 10.8, 7.6, 0.3, 0, 0.9, zw + 0.15, `<b>${look.name}</b><span>the wallet's card</span>`, () => profileInfo(wk.feed(), look));
  k.hit(f, 4.5, 3.6, 0.3, -9.0, 0.9, zw + 0.15, `<b>App Store</b><span>rating · version</span>`, () => storeInfo(wk.feed(), look));
  k.hit(f, 4.5, 3.6, 0.3, 9.0, 0.9, zw + 0.15, `<b>GitHub</b><span>open source</span>`, () => gitInfo(wk.feed(), look));

  // ---- the giant phone (tip ZStreet) on the west side, the guestbook on the east ----------------------
  let tipUri: string | null = null;
  let qr: HTMLCanvasElement | null = null;
  void StreetPay.info().then(async (i) => {
    tipUri = i?.enabled ? i.tip_uri : null;
    if (tipUri) qr = await qrCanvas(tipUri, 360);
  });
  {
    const PX = -10.6,
      PZ = -7.2,
      ry = Math.PI / 2;
    k.box(f, 1.6, 0.5, 1.6, PX, 0, PZ, look.dark, "polish");
    k.box(f, 1.7, 0.05, 1.7, PX, 0.5, PZ, look.glow, "glow");
    k.solid(f, PX - 0.85, PZ - 0.85, PX + 0.85, PZ + 0.85);
    k.box(f, 0.24, 2.7, 1.32, PX, 0.55, PZ, "#0d0d10", "polish");
    k.box(f, 0.26, 2.55, 1.18, PX + 0.005, 0.625, PZ, "#16161b", "glass");
    const scr = k.screen(f, 1.08, 2.3, (g, W, Hh) => drawPhone(g, W, Hh, look.name, look.glow, "Scan with your wallet", qr, !!tipUri), 2, 512);
    k.add(f, scr, PX + 0.135, 0.55 + 0.12 + 1.15, PZ, ry);
    k.hit(f, 0.7, 3.2, 1.6, PX + 0.2, 0, PZ, `<b>Tip ZStreet with ${look.name}</b><span>scan the code, or click for the wallet desk</span>`, () => ({ eyebrow: look.title, title: look.name, panel: "wallets", wallet: look.key }));
    k.label(f, "SCAN · TIP · FIREWORKS", PX + 0.85, 0.28, PZ, { h: 0.12, color: "#ffffff", bg: look.accent, ry });
  }
  {
    const GX = 10.4,
      GZ = -7.2,
      ry = -Math.PI / 2;
    let lines: Mark[] = [];
    const load = async () => {
      const l = await StreetPay.guestbook();
      if (l) lines = l;
    };
    void load();
    window.addEventListener("zstreet:guestbook", () => void load());
    setInterval(() => void load(), 120_000);
    k.box(f, 0.5, 0.3, 3.4, GX, 0, GZ, look.dark, "polish");
    for (const dz of [-1.4, 1.4]) k.box(f, 0.12, 4.3, 0.12, GX + 0.05, 0.3, GZ + dz, look.trim, "metal");
    k.box(f, 0.14, 2.7, 4.6, GX + 0.08, 1.4, GZ, look.trim, "metal");
    const ink = zodl
      ? { bg: "#ffffff", frame: "rgba(21,19,20,0.35)", head: "#151314", ink: "#151314", accent: "#3d393a", muted: "#797576" }
      : { bg: "#141818", frame: "rgba(255,79,134,0.5)", head: "#ff4f86", ink: "#ffffff", accent: "#ff4f86", muted: "#8a9090" };
    const scr = k.screen(f, 4.4, 2.55, (g, W, Hh) => drawGuestbook(g, W, Hh, lines, ink), 5, 1024);
    k.add(f, scr, GX, 1.4 + 1.35, GZ, ry);
    k.solid(f, GX - 0.3, GZ - 1.8, GX + 0.3, GZ + 1.8);
    k.hit(f, 0.6, 3, 4.6, GX - 0.2, 1.2, GZ, "<b>Guestbook</b><span>sign it from your wallet</span>", () => ({ eyebrow: look.title, title: "Guestbook", panel: "guestbook" }));
    k.label(f, "GUESTBOOK · 芳名録", GX - 0.1, 4.45, GZ, { h: 0.24, color: look.sign, ry });
  }

  // ---- plants in the corners, the lifts ---------------------------------------------------------------
  for (const [x, z, s] of [
    [-12.6, -2, 21],
    [12.6, -2, 22],
    [12.6, -23.6, 23],
  ] as const) {
    k.cyl(f, 0.7, 0.6, 0.7, x, 0, z, look.dark, "polish", 24);
    k.cyl(f, 0.72, 0.72, 0.03, x, 0.7, z, look.glow, "glow", 24);
    k.vox(f, `wt-tree${s}`, () => indoorTree(s), x, z, 0, { dy: 0.7, k: 0.7 });
    k.solid(f, x - 0.75, z - 0.75, x + 0.75, z + 0.75);
  }
  k.lifts(f, X0 + 0.2, -21, Math.PI / 2, look.lift);
  k.label(f, "TWEETS · LAB · ROOF", X0 + 0.3, 5.2, -21, { h: 0.22, color: look.sign, ry: Math.PI / 2 });

  // ---- light -----------------------------------------------------------------------------------------
  k.light(f, 0, 6.5, CZ, look.glow, 18, 16);
  k.light(f, 0, 5, -22, "#fff4e0", 14, 18);
  k.light(f, -9, 4.5, -6, "#fff4e0", 12, 14);
  k.light(f, 9, 4.5, -6, "#fff4e0", 12, 14);
  k.light(f, 0, 4, -3, "#ffffff", 10, 12);

  // ---- people ----------------------------------------------------------------------------------------
  const feed = () => wk.feed();
  k.onCast(f, () => {
    void k.person(f, zodl ? 2201 : 2301, [2.8, -8.6], "Host", {
      face: [0, 1],
      lines: [
        `Welcome to the ${look.title}.`,
        () => (feed()?.store ? `${look.name} ${feed()!.store!.version} is out. ${feed()!.store!.rating?.toFixed(2) ?? "?"} stars on the ${feed()!.store!.chrome ? "Chrome Web Store" : "App Store"}.` : `${look.name}: ${look.motto.toLowerCase()}.`),
        "The tweets are on the first floor. The releases in the lab above.",
        "Scan the phone by the window: a tip lights fireworks for the whole city.",
      ],
    });
    const a = k.person(f, zodl ? 2202 : 2302, [-5.2, -18.6], "Visitor", { face: [1, 0.2] });
    const b = k.person(f, zodl ? 2203 : 2303, [-3.6, -18.4], "Visitor", { face: [-1, 0.2] });
    k.dialog(f, [a, b], [
      [0, () => (feed()?.profile ? `${num(feed()!.profile!.followers)} followers on X now.` : "Big crowd on X these days.")],
      [1, "Shielded by default. That's the whole point."],
      [0, () => (feed()?.releases[0] ? `They shipped ${feed()!.releases[0].tag} on ${day(feed()!.releases[0].date)}.` : "They ship every week.")],
      [1, "Signing the guestbook. Memo and all."],
    ]);
  });
}

function spinning(wk: WalletKit) {
  const { k, look } = wk;
  const holder = new THREE.Group();
  const e = emblemBig(look);
  holder.add(e);
  k.add(f, holder, 0, 4.4, -13, 0);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 2.0, 3.9, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(look.glow).multiplyScalar(0.5), transparent: true, opacity: look.key === "zodl" ? 0.05 : 0.14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  beam.raycast = () => {};
  k.add(f, beam, 0, 0.5 + 3.9 / 2, -13, 0);
  k.ticks[f].push((dt, t) => {
    e.rotation.y += dt * 0.8;
    holder.position.y = k.y(f) + 4.4 + Math.sin(t * 1.1) * 0.12;
  });
  return holder;
}

function emblemBig(look: Look) {
  const e = emblem(look.key, { glow: 0.8 });
  e.scale.setScalar(3.4);
  return e;
}

/** The mark as a small lit plate (over the side screens). */
function drawMarkPlate(k: WalletKit["k"], f: number, look: Look, x: number, y: number, zw: number) {
  const s = new Surface(256, 256, 1.2);
  s.draw((g, W, Hh) => {
    g.clearRect(0, 0, W, Hh);
    g.fillStyle = look.iconBg;
    g.beginPath();
    g.arc(W / 2, Hh / 2, W / 2 - 4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = look.accent;
    g.lineWidth = 6;
    g.stroke();
    drawMark(g, look.key, W / 2, Hh / 2, W * 0.62, look.iconMark);
  });
  s.mat.transparent = true;
  k.plane(f, 1.6, 1.6, s.mat, x, y, zw + 0.04);
}

// ---- what the screens draw -------------------------------------------------------------------------------

function drawBanner(g: CanvasRenderingContext2D, W: number, H: number, look: Look, img: HTMLImageElement | null) {
  g.fillStyle = look.dark;
  g.fillRect(0, 0, W, H);
  if (img) cover(g, img, 0, 0, W, H, 0);
  else {
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, look.iconBg);
    grad.addColorStop(1, look.accent);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    drawMark(g, look.key, W / 2, H / 2, H * 0.7, look.iconMark);
  }
}

function drawCard(g: CanvasRenderingContext2D, W: number, H: number, feed: WalletFeed | null, look: Look, av: HTMLImageElement | null) {
  g.fillStyle = look.card;
  g.fillRect(0, 0, W, H);
  g.fillStyle = look.accent;
  g.fillRect(0, 0, 10, H);
  const p = feed?.profile;
  avatar(g, av, 150, 150, 100, look);
  g.textBaseline = "top";
  g.fillStyle = look.ink;
  g.font = FONT(800, 64);
  g.fillText(p?.name ?? look.name, 290, 62);
  g.fillStyle = look.muted;
  g.font = FONT(500, 36);
  g.fillText(`@${p?.handle ?? look.handle}${p?.joined ? ` · joined ${day(p.joined)}` : ""}`, 290, 144);
  g.fillStyle = look.ink;
  fitText(g, (p?.description ?? look.motto).replace(/\s+/g, " ").trim(), 60, 290, W - 520, 90, (px) => FONT(500, px), [38, 32, 28]);
  // the counts
  const counts: [string, string][] = [
    [compact(p?.followers), "followers"],
    [compact(p?.tweets), "posts"],
    [String(feed?.tweets.length ?? "–"), "on the wall"],
  ];
  counts.forEach(([v, l], i) => {
    const x = 60 + i * 330;
    g.fillStyle = look.accent;
    g.font = FONT(800, 56);
    g.fillText(v, x, 398);
    const w = g.measureText(v).width;
    g.fillStyle = look.muted;
    g.font = FONT(500, 30);
    g.fillText(l, x + w + 14, 420);
  });
  // the site, right
  g.textAlign = "right";
  g.fillStyle = look.accent;
  g.font = FONT(700, 34);
  g.fillText(look.site.replace(/^https?:\/\/(www\.)?/, ""), W - 50, 62);
  g.fillStyle = look.muted;
  g.font = FONT(500, 26);
  g.fillText(feed ? `updated ${new Date(feed.fetched_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}` : "loading…", W - 50, 108);
  g.textAlign = "left";
}

function drawStore(g: CanvasRenderingContext2D, W: number, H: number, feed: WalletFeed | null, look: Look) {
  g.fillStyle = look.card;
  g.fillRect(0, 0, W, H);
  const s = feed?.store;
  g.textBaseline = "top";
  g.fillStyle = look.muted;
  g.font = FONT(700, 30);
  g.fillText(s?.chrome ? "CHROME WEB STORE" : "APP STORE", 40, 36);
  g.fillStyle = look.ink;
  g.font = FONT(800, 120);
  g.fillText(s?.rating ? s.rating.toFixed(1) : "–", 40, 86);
  stars(g, 40, 230, 54, s?.rating ?? 0, look.key === "zodl" ? "#f4b728" : look.accent, "rgba(0,0,0,0.12)");
  g.fillStyle = look.muted;
  g.font = FONT(500, 28);
  g.fillText(s?.ratings ? `${num(s.ratings)} ratings` : s?.users ? `${num(s.users)}+ users` : "", 40, 300);
  g.fillStyle = look.soft;
  g.font = FONT(700, 34);
  g.fillText(s ? `Version ${s.version}` : "", 40, 372);
  g.fillStyle = look.muted;
  g.font = FONT(500, 26);
  g.fillText(s?.released ? day(s.released) : s?.chrome ? "browser extension" : "", 40, 418);
}

function drawGit(g: CanvasRenderingContext2D, W: number, H: number, feed: WalletFeed | null, look: Look) {
  g.fillStyle = look.card;
  g.fillRect(0, 0, W, H);
  g.textBaseline = "top";
  g.fillStyle = look.muted;
  g.font = FONT(700, 30);
  g.fillText("GITHUB · OPEN SOURCE", 40, 36);
  const repos = feed?.repos ?? [];
  const starsN = repos.reduce((a, r) => a + r.stars, 0);
  g.fillStyle = look.ink;
  g.font = FONT(800, 120);
  g.fillText(`★ ${starsN || "–"}`, 40, 86);
  let y = 240;
  for (const r of repos.slice(0, 2)) {
    g.fillStyle = look.soft;
    g.font = FONT(700, 30);
    g.fillText(r.repo, 40, y);
    g.fillStyle = look.muted;
    g.font = FONT(500, 26);
    g.fillText(`${r.language ?? ""} · ${r.forks} forks · ${r.issues} open`, 40, y + 38);
    y += 90;
  }
  const rel = feed?.releases[0];
  if (rel) {
    g.fillStyle = look.accent;
    rr(g, 40, H - 70, W - 80, 46, 23);
    g.fill();
    g.fillStyle = "#ffffff";
    g.font = FONT(800, 26);
    g.textBaseline = "middle";
    g.fillText(`Latest ${rel.tag} · ${day(rel.date)}`, 62, H - 46);
  }
}

// ---- what a click shows ----------------------------------------------------------------------------------

export function profileInfo(feed: WalletFeed | null, look: Look): PickInfo {
  const p = feed?.profile;
  return {
    eyebrow: look.title,
    title: p?.name ?? look.name,
    image: p?.avatar ?? undefined,
    stats: [
      ["Followers", compact(p?.followers)],
      ["Posts", compact(p?.tweets)],
      [feed?.store?.chrome ? "Chrome" : "App Store", feed?.store?.rating ? `${feed.store.rating.toFixed(2)} ★` : "–"],
      ["GitHub ★", String((feed?.repos ?? []).reduce((a, r) => a + r.stars, 0) || "–")],
    ],
    body: `<p>${esc(p?.description ?? look.motto)}</p><p><a href="https://x.com/${look.handle}" target="_blank" rel="noopener">@${look.handle} on X</a></p>`,
    link: { href: look.site, label: look.site.replace(/^https?:\/\/(www\.)?/, "") },
  };
}

function storeInfo(feed: WalletFeed | null, look: Look): PickInfo {
  const s = feed?.store;
  return {
    eyebrow: `${look.title} · ${s?.chrome ? "Chrome Web Store" : "App Store"}`,
    title: s?.chrome ? `${look.name} for Chrome` : (s?.name ?? look.name),
    stats: [
      ["Rating", s?.rating ? `${s.rating.toFixed(2)} ★` : "–"],
      s?.chrome ? ["Users", s.users ? `${num(s.users)}+` : "–"] : ["Ratings", s?.ratings ? num(s.ratings) : "–"],
      ["Version", s?.version ?? "–"],
      ["Released", s?.released ? day(s.released) : "–"],
    ],
    body: s?.notes ? `<p style="white-space:pre-line">${esc(s.notes.slice(0, 900))}</p>` : undefined,
    link: s ? { href: s.url, label: s.chrome ? "Open in the Chrome Web Store" : "Open in the App Store" } : undefined,
  };
}

function gitInfo(feed: WalletFeed | null, look: Look): PickInfo {
  const repos = feed?.repos ?? [];
  return {
    eyebrow: `${look.title} · GitHub`,
    title: repos.map((r) => r.repo.split("/")[0]).filter((v, i, a) => a.indexOf(v) === i).join(", ") || look.name,
    stats: [
      ["Stars", String(repos.reduce((a, r) => a + r.stars, 0))],
      ["Forks", String(repos.reduce((a, r) => a + r.forks, 0))],
      ["Open issues", String(repos.reduce((a, r) => a + r.issues, 0))],
      ["Latest", feed?.releases[0]?.tag ?? "–"],
    ],
    body: repos.map((r) => `<p><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.repo)}</a> · ${esc(r.language ?? "")} · ★ ${r.stars}<br>${esc(r.description ?? "")}</p>`).join(""),
    link: repos[0] ? { href: repos[0].url, label: "Open on GitHub" } : undefined,
  };
}
