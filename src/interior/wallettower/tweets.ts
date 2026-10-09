import * as THREE from "three";
import { drawMark } from "../../scene/emblems";
import { xImage, type Tweet } from "../../data/walletfeed";
import type { PickInfo } from "../types";
import { marbleTex, rr, Surface } from "../zktowers/kit";
import { avatar, compact, cover, day, esc, fitText, FONT, type Look, type WalletKit } from "./shared";

/**
 * The wall of tweets: the wallet's latest tweets (its own, what it reposted, what its users say)
 * as framed posters round a gallery, the three most liked in large on the back wall, two free
 * standing walls down the middle, a ticker of the newest over the back wall. A click on a poster
 * opens the tweet (and its link to x.com).
 */

export const TWEETS_FLOOR = 1;
const f = TWEETS_FLOOR;
const X0 = -16,
  X1 = 16,
  Z0 = -30,
  Z1 = 0,
  H = 7;

interface Slot {
  x: number;
  y: number;
  z: number;
  ry: number;
  big: boolean;
}

/** The poster spots, in the order they are filled (after the three large ones). */
function slots(): { big: Slot[]; small: Slot[] } {
  const big: Slot[] = [-8.6, 0, 8.6].map((x) => ({ x, y: 2.75, z: Z0 + 0.22, ry: 0, big: true }));
  const small: Slot[] = [];
  // the two free-standing walls down the middle: the faces on the aisle first, then the outer ones
  const isle = [-19.6, -16.4, -13.2, -10];
  for (const side of [-1, 1]) for (const z of isle) small.push({ x: side * 5.8 - side * 0.22, y: 2.0, z, ry: side < 0 ? Math.PI / 2 : -Math.PI / 2, big: false });
  for (const x of [-4.3, 4.3, -12, 12, -14.6, 14.6]) small.push({ x, y: 2.15, z: Z0 + 0.22, ry: 0, big: false });
  for (const side of [-1, 1]) for (const z of isle) small.push({ x: side * 5.8 + side * 0.22, y: 2.0, z, ry: side < 0 ? -Math.PI / 2 : Math.PI / 2, big: false });
  for (let z = -27.4; z <= -2.4; z += 2.5) small.push({ x: X1 - 0.22, y: 2.15, z, ry: -Math.PI / 2, big: false });
  for (let z = -27.4; z <= -12; z += 2.5) small.push({ x: X0 + 0.22, y: 2.15, z, ry: Math.PI / 2, big: false });
  return { big, small };
}

export function tweetsFloor(wk: WalletKit) {
  const { k, look } = wk;

  // ---- the room: a polished floor, dark walls, glass onto the city at the front --------------------
  k.flat(f, X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ map: marbleTex(look.key === "zodl" ? 41 : 43, look.floor, look.vein, 512, 4, 4, 4, "rgba(0,0,0,0.4)"), roughness: 0.16, metalness: 0.1 }), 0, (Z0 + Z1) / 2);
  k.box(f, X1 - X0, 0.3, Z1 - Z0, 0, H, (Z0 + Z1) / 2, look.dark);
  k.wall(f, X0, Z0, X1, Z0, H, look.wall, "matte", 0.4);
  k.wall(f, X0, Z0, X0, Z1, H, look.wall, "matte", 0.4);
  k.wall(f, X1, Z0, X1, Z1, H, look.wall, "matte", 0.4);
  k.curtain(f, X0, Z1, X1, Z1, H, look.dark, 2.0, { transom: 3.2 });
  // light lines in the ceiling, a skirting of the accent
  for (const x of [-10, -3.4, 3.4, 10]) k.box(f, 0.12, 0.04, Z1 - Z0 - 2, x, H - 0.05, (Z0 + Z1) / 2, look.glow, "glow");
  for (const [a, b, c, d] of [
    [X0 + 0.21, Z0, X0 + 0.21, Z1],
    [X1 - 0.21, Z0, X1 - 0.21, Z1],
    [X0, Z0 + 0.21, X1, Z0 + 0.21],
  ] as const)
    k.wall(f, a, b, c, d, 0.06, look.sign, "glow", 0.02, 0.12, false);
  // the free-standing walls
  for (const side of [-1, 1]) {
    k.box(f, 0.3, 3.6, 13.4, side * 5.8, 0, -14.8, look.wall, "matte");
    k.box(f, 0.34, 0.06, 13.44, side * 5.8, 3.6, -14.8, look.sign, "glow");
    k.solid(f, side * 5.8 - 0.25, -21.6, side * 5.8 + 0.25, -8.0);
  }
  // benches down the aisle
  for (const z of [-12, -18]) {
    k.box(f, 1.0, 0.45, 3.2, 0, 0, z, look.dark, "polish");
    k.box(f, 1.04, 0.05, 3.24, 0, 0.45, z, look.trim, "metal");
    k.solid(f, -0.55, z - 1.65, 0.55, z + 1.65);
  }

  // ---- the title and the ticker over the back wall ---------------------------------------------------
  k.label(f, `@${look.handle.toUpperCase()} · THE WALL OF TWEETS`, 0, 6.25, Z0 + 0.25, { h: 0.42, color: look.sign });
  let ticker: Tweet[] = [];
  const tape = new Surface(4096, 72, 1.2);
  let off = 0;
  let line = "";
  const tapeMesh = new THREE.Mesh(new THREE.PlaneGeometry(31, 0.55), tape.mat);
  tapeMesh.raycast = () => {};
  k.add(f, tapeMesh, 0, 5.45, Z0 + 0.24, 0);
  k.ticks[f].push((dt) => {
    if (!line) return;
    off = (off + dt * 130) % Math.max(1, tape.g.measureText(line).width + 200);
    tape.draw((g, W, Hh) => {
      g.fillStyle = look.dark;
      g.fillRect(0, 0, W, Hh);
      g.font = FONT(700, 40);
      g.textBaseline = "middle";
      g.fillStyle = look.glow;
      const w = g.measureText(line).width + 200;
      for (let x = -off; x < W; x += w) g.fillText(line, x, Hh / 2 + 2);
    });
  });

  // ---- the posters -----------------------------------------------------------------------------------
  const { big, small } = slots();
  const posters = [...big, ...small].map((s) => poster(wk, s));
  const fill = () => {
    const feed = wk.feed();
    const list = feed?.tweets ?? [];
    const top = [...list].sort((a, b) => b.likes - a.likes).slice(0, 3);
    const rest = list.filter((t) => !top.includes(t));
    // the most liked in the middle
    const order = [top[1], top[0], top[2]];
    posters.forEach((p, i) => p.show(i < 3 ? (order[i] ?? null) : (rest[i - 3] ?? null), i));
    ticker = list.slice(0, 8);
    line = ticker.map((t) => `@${t.handle}: ${t.text.replace(/\s+/g, " ")}`).join("     ◆     ");
  };
  wk.onFeed(fill);
  fill();

  // ---- the lifts, the lights ---------------------------------------------------------------------------
  k.lifts(f, X0 + 0.2, -6, Math.PI / 2, look.lift);
  k.light(f, 0, 5.5, -24, "#fff4e0", 16, 20);
  k.light(f, -10, 5.5, -16, "#fff4e0", 12, 16);
  k.light(f, 10, 5.5, -16, "#fff4e0", 12, 16);
  k.light(f, 0, 5.5, -8, "#ffffff", 10, 14);
  k.light(f, 0, 3, -27, look.glow, 6, 10);

  k.onCast(f, () => {
    const most = () => [...(wk.feed()?.tweets ?? [])].sort((a, b) => b.likes - a.likes)[0];
    void k.person(f, 7101, [0, -22.6], "Curator", {
      face: [0, 1],
      lines: [`Every poster is a tweet from @${look.handle}, or from its users.`, () => (most() ? `The most liked up there: ${compact(most()!.likes)} likes, from @${most()!.handle}.` : "The three in large are the most liked."), "Click a poster to read it, and to open it on X."],
    });
    void k.person(f, 7102, [-2.4, -9], "Visitor", { wander: [[-2.4, -9], [2.6, -15], [-2.2, -21], [9, -25]], lines: ["Shielded by default. As it should be.", "I came for the tweets, I stayed for the privacy."] });
    void k.person(f, 7103, [10.5, -9], "Visitor", { wander: [[10.5, -9], [12.8, -20], [8.6, -26]], lines: [`Following @${look.handle} since day one.`, "Wait, which one is the most liked?"] });
  });
}

interface Poster {
  show(t: Tweet | null, i: number): void;
}

function poster(wk: WalletKit, s: Slot): Poster {
  const { k, look } = wk;
  const w = s.big ? 3.0 : 1.6,
    h = s.big ? 3.75 : 2.0;
  const surf = new Surface(s.big ? 720 : 480, s.big ? 900 : 600, 0.98);
  // the frame: a box of the trim, the poster on its face
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.06), new THREE.MeshStandardMaterial({ color: look.trim, metalness: 0.85, roughness: 0.3 }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), surf.mat);
  face.position.z = 0.032;
  const g = new THREE.Group();
  g.add(frame, face);
  k.add(f, g, s.x, s.y, s.z, s.ry);
  let tweet: Tweet | null = null;
  const draw = (avatarImg: HTMLImageElement | null, media: HTMLImageElement | null) => surf.draw((c, W, Hh) => (tweet ? drawTweet(c, W, Hh, tweet, look, avatarImg, media) : drawIdle(c, W, Hh, look)));
  k.pick(f, face, "", (): PickInfo | null => (tweet ? tweetInfo(tweet, look) : { eyebrow: look.title, title: `@${look.handle} on X`, link: { href: `https://x.com/${look.handle}`, label: "Open on X" } }));
  k.hovers.set(face, `<b>${s.big ? "Most liked" : "Tweet"}</b><span>click to read</span>`);
  return {
    show(t) {
      tweet = t;
      k.hovers.set(face, t ? `<b>@${esc(t.handle)}</b><span>${esc(t.text.slice(0, 60))}${t.text.length > 60 ? "…" : ""}</span>` : `<b>@${look.handle}</b><span>on X</span>`);
      draw(null, null);
      if (!t) return;
      void Promise.all([xImage(t.avatar), xImage(t.media[0]?.url)]).then(([a, m]) => tweet === t && draw(a, m));
    },
  };
}

export function tweetInfo(t: Tweet, look: Look): PickInfo {
  const img = t.media[0] ? `<p><img src="${esc(t.media[0].url)}" alt="" style="width:100%;border-radius:10px"></p>` : "";
  const quote = t.quote ? `<blockquote style="border-left:3px solid ${look.accent};margin:8px 0;padding-left:10px"><b>@${esc(t.quote.handle)}</b><br>${esc(t.quote.text ?? "")}</blockquote>` : "";
  return {
    eyebrow: `${look.title} · ${t.rt_by ? `reposted by @${t.rt_by}` : "on X"}`,
    title: `${t.name} @${t.handle}`,
    image: t.avatar ?? undefined,
    stats: [
      ["Likes", compact(t.likes)],
      ["Reposts", compact(t.retweets)],
      [t.views ? "Views" : "Replies", compact(t.views ?? t.replies)],
      ["Date", day(t.at)],
    ],
    body: `<p style="white-space:pre-line">${esc(t.text)}</p>${quote}${img}`,
    link: { href: t.url, label: "Open on X" },
  };
}

/** A tweet as a poster: who, the text (as large as fits), the picture, the counts. */
export function drawTweet(g: CanvasRenderingContext2D, W: number, H: number, t: Tweet, look: Look, av: HTMLImageElement | null, media: HTMLImageElement | null) {
  const u = W / 480;
  g.fillStyle = look.card;
  g.fillRect(0, 0, W, H);
  // a band of the accent at the top
  g.fillStyle = look.accent;
  g.fillRect(0, 0, W, 8 * u);
  let y = 26 * u;
  if (t.rt_by) {
    g.fillStyle = look.muted;
    g.font = FONT(600, 17 * u);
    g.textBaseline = "top";
    g.fillText(`↻ @${t.rt_by} reposted`, 26 * u, y);
    y += 30 * u;
  }
  // who
  avatar(g, av, 26 * u + 30 * u, y + 30 * u, 30 * u, look);
  g.textBaseline = "top";
  g.fillStyle = look.ink;
  g.font = FONT(800, 22 * u);
  let name = t.name;
  while (name.length > 2 && g.measureText(name).width > W - 170 * u) name = name.slice(0, -1);
  g.fillText(name === t.name ? name : `${name}…`, 100 * u, y + 6 * u);
  const nw = g.measureText(name).width;
  if (t.verified) {
    g.fillStyle = "#1d9bf0";
    g.beginPath();
    g.arc(100 * u + nw + 16 * u, y + 18 * u, 9 * u, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#fff";
    g.lineWidth = 2.6 * u;
    g.beginPath();
    g.moveTo(100 * u + nw + 11.5 * u, y + 18 * u);
    g.lineTo(100 * u + nw + 15 * u, y + 22 * u);
    g.lineTo(100 * u + nw + 21 * u, y + 14 * u);
    g.stroke();
  }
  g.fillStyle = look.muted;
  g.font = FONT(500, 18 * u);
  g.fillText(`@${t.handle}`, 100 * u, y + 36 * u);
  // the X mark, top right
  g.fillStyle = look.ink;
  g.font = FONT(800, 30 * u);
  g.textAlign = "right";
  g.fillText("𝕏", W - 24 * u, y + 8 * u);
  g.textAlign = "left";
  y += 80 * u;
  // the picture takes up to 40 % when there is one
  const foot = 64 * u;
  const pic = media ? Math.min(H * 0.4, (W - 52 * u) * (t.media[0].h && t.media[0].w ? t.media[0].h / t.media[0].w : 0.56)) : 0;
  const textH = H - y - foot - (pic ? pic + 18 * u : 0);
  g.fillStyle = look.ink;
  const used = fitText(g, t.text || "(a picture)", 26 * u, y, W - 52 * u, textH, (px) => FONT(500, px), [34, 30, 26, 23, 20, 18, 16].map((p) => p * u));
  if (media && pic) {
    const py = Math.min(y + used + 14 * u, H - foot - pic);
    cover(g, media, 26 * u, py, W - 52 * u, pic, 16 * u);
    if (t.media[0].video) {
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.beginPath();
      g.arc(W / 2, py + pic / 2, 34 * u, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.beginPath();
      g.moveTo(W / 2 - 11 * u, py + pic / 2 - 17 * u);
      g.lineTo(W / 2 + 18 * u, py + pic / 2);
      g.lineTo(W / 2 - 11 * u, py + pic / 2 + 17 * u);
      g.fill();
    }
  }
  // the counts and the date
  g.strokeStyle = "rgba(0,0,0,0.1)";
  g.lineWidth = 2 * u;
  g.beginPath();
  g.moveTo(26 * u, H - foot);
  g.lineTo(W - 26 * u, H - foot);
  g.stroke();
  g.textBaseline = "middle";
  g.font = FONT(600, 19 * u);
  const fy = H - foot / 2;
  g.fillStyle = "#f91880";
  g.fillText(`♥ ${compact(t.likes)}`, 26 * u, fy);
  g.fillStyle = "#00ba7c";
  g.fillText(`↻ ${compact(t.retweets)}`, 120 * u, fy);
  if (t.views) {
    g.fillStyle = look.muted;
    g.fillText(`▥ ${compact(t.views)}`, 214 * u, fy);
  }
  g.fillStyle = look.muted;
  g.textAlign = "right";
  g.fillText(day(t.at), W - 26 * u, fy);
  g.textAlign = "left";
}

/** A spot with no tweet yet: the wallet's mark and its handle. */
function drawIdle(g: CanvasRenderingContext2D, W: number, H: number, look: Look) {
  const u = W / 480;
  g.fillStyle = look.card;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = look.accent;
  g.lineWidth = 3 * u;
  rr(g, 20 * u, 20 * u, W - 40 * u, H - 40 * u, 18 * u);
  g.stroke();
  drawMark(g, look.key, W / 2, H * 0.42, W * 0.42, look.accent);
  g.fillStyle = look.ink;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = FONT(800, 30 * u);
  g.fillText(`@${look.handle}`, W / 2, H * 0.72);
  g.fillStyle = look.muted;
  g.font = FONT(500, 20 * u);
  g.fillText("follow on X", W / 2, H * 0.79);
  g.textAlign = "left";
}
