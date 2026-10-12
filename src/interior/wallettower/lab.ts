import * as THREE from "three";
import { xImage, type Commit, type Release, type WalletFeed } from "../../data/walletfeed";
import { drawMark } from "../../scene/emblems";
import type { PickInfo } from "../types";
import { marbleTex, MONO, Surface } from "../zktowers/kit";
import { compact, day, esc, fitText, FONT, type Look, type WalletKit } from "./shared";

/**
 * The lab: where the wallet is made, live from GitHub. Its releases along the back wall as a
 * timeline (the newest on the right, the notes on each screen), the latest commits on the west
 * wall, the open pull requests and the App Store's "what's new" on the east, the developers' desks
 * in the middle, the real diffs of the latest commits scrolling on their monitors.
 */

export const LAB_FLOOR = 2;
const X0 = -14,
  X1 = 14,
  Z0 = -26,
  Z1 = 0,
  H = 6.2;

/** Release notes in plain text: no headings, emphasis, link targets or HTML comments. */
export function plainNotes(md: string) {
  return md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** One repository's part of the feed (ZLab's tower has a lab per project). */
function only(feed: WalletFeed | null, repo: string): WalletFeed | null {
  if (!feed) return null;
  const mine = <T extends { repo: string }>(l: T[] | undefined) => (l ?? []).filter((x) => x.repo === repo);
  return { ...feed, releases: mine(feed.releases), commits: mine(feed.commits), pulls: mine(feed.pulls), repos: mine(feed.repos) };
}

/**
 * `floor`: the floor index being built (the ZLab tower has no tweets floor: its labs start at 1).
 * `repo`: this lab shows one repository only, its name over the timeline and its card in place of the
 * store's (ZLab: a lab per project).
 */
export function labFloor(wk0: WalletKit, floor = LAB_FLOOR, repo?: { repo: string; name: string; seed: number; about: string }) {
  const f = floor;
  const wk: WalletKit = repo ? { ...wk0, feed: () => only(wk0.feed(), repo.repo) } : wk0;
  const { k, look } = wk;

  // ---- the room ----------------------------------------------------------------------------------------
  k.flat(f, X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ map: marbleTex(look.key === "zodl" ? 51 : 53, look.floor, look.vein, 512, 4, 4, 4, "rgba(0,0,0,0.4)"), roughness: 0.3, metalness: 0.05 }), 0, (Z0 + Z1) / 2);
  k.box(f, X1 - X0, 0.3, Z1 - Z0, 0, H, (Z0 + Z1) / 2, look.dark);
  k.wall(f, X0, Z0, X1, Z0, H, look.wall, "matte", 0.4);
  k.wall(f, X0, Z0, X0, Z1, H, look.wall, "matte", 0.4);
  k.wall(f, X1, Z0, X1, Z1, H, look.wall, "matte", 0.4);
  k.curtain(f, X0, Z1, X1, Z1, H, look.dark, 2.0, { transom: 3.0 });
  for (const z of [-5, -11, -17, -23]) k.box(f, X1 - X0 - 1, 0.04, 0.12, 0, H - 0.05, z, look.glow, "glow");
  k.label(f, repo ? `${repo.name.toUpperCase()} · 研究所 · THE LAB` : "RELEASES · 研究所 · THE LAB", 0, 5.35, Z0 + 0.25, { h: 0.36, color: look.sign });

  // ---- the timeline: six releases, the newest on the right ---------------------------------------------
  const N = 6;
  const zw = Z0 + 0.22;
  const screens = Array.from({ length: N }, (_, i) => {
    const x = -11.25 + i * 4.5;
    const s = new Surface(640, 512, 1.05);
    k.box(f, 4.3, 3.4, 0.08, x, 1.25, zw - 0.02, look.trim, "metal");
    k.plane(f, 4.1, 3.2, s.mat, x, 2.95, zw + 0.03);
    // the dot on the line under it
    k.cyl(f, 0.13, 0.13, 0.04, x, 0.92, zw + 0.05, look.sign, "glow", 20);
    let rel: Release | null = null;
    k.hit(f, 4.1, 3.2, 0.3, x, 1.35, zw + 0.15, `<b>Release</b><span>click for the notes</span>`, () => (rel ? releaseInfo(rel, look) : null));
    return {
      x,
      set(r: Release | null, newest: boolean) {
        rel = r;
        s.draw((g, W, Hh) => drawRelease(g, W, Hh, r, look, newest));
      },
    };
  });
  k.box(f, 27.4, 0.05, 0.05, 0, 0.92, zw + 0.03, look.sign, "glow");
  const fillTimeline = () => {
    const rels = (wk.feed()?.releases ?? []).slice(0, N).reverse();
    screens.forEach((s, i) => s.set(rels[i - (N - rels.length)] ?? null, i === N - 1 && rels.length > 0));
  };

  // ---- the walls: the latest commits (west), the App Store and the open pull requests (east) --------------
  const commitsBoard = new Surface(1024, 512, 1.05);
  k.box(f, 0.08, 3.6, 7.8, X0 + 0.22, 1.1, -17.5, look.trim, "metal");
  k.plane(f, 7.6, 3.4, commitsBoard.mat, X0 + 0.28, 2.8, -17.5, 0, Math.PI / 2);
  k.hit(f, 0.3, 3.4, 7.6, X0 + 0.4, 1.1, -17.5, "<b>Commits</b><span>live from GitHub</span>", () => commitsInfo(wk.feed(), look));
  const store = new Surface(1024, 512, 1.05);
  k.box(f, 0.08, 3.2, 6.8, X1 - 0.22, 1.2, -19, look.trim, "metal");
  k.plane(f, 6.6, 3.0, store.mat, X1 - 0.28, 2.7, -19, 0, -Math.PI / 2);
  k.hit(f, 0.3, 3.0, 6.6, X1 - 0.4, 1.2, -19, repo ? `<b>${esc(repo.name)}</b><span>the repository</span>` : "<b>What's new</b><span>App Store</span>", () => {
    const r = wk.feed()?.repos[0];
    if (repo) return r ? { eyebrow: `${look.title} · GitHub`, title: repo.name, stats: [["Stars", String(r.stars)], ["Forks", String(r.forks)], ["Language", r.language ?? "–"], ["Last push", ago(r.pushed_at)]], body: `<p>${esc(r.description ?? "")}</p>`, link: { href: r.url, label: "Open on GitHub" } } : null;
    const s = wk.feed()?.store;
    return s ? { eyebrow: `${look.title} · App Store`, title: `${s.name} ${s.version}`, body: `<p style="white-space:pre-line">${esc(s.notes ?? "")}</p>`, link: { href: s.url, label: "Open in the App Store" } } : null;
  });
  const pullsBoard = new Surface(1024, 512, 1.05);
  k.box(f, 0.08, 3.2, 6.8, X1 - 0.22, 1.2, -8.5, look.trim, "metal");
  k.plane(f, 6.6, 3.0, pullsBoard.mat, X1 - 0.28, 2.7, -8.5, 0, -Math.PI / 2);
  k.hit(f, 0.3, 3.0, 6.6, X1 - 0.4, 1.2, -8.5, "<b>Pull requests</b><span>open, on GitHub</span>", () => pullsInfo(wk.feed(), look));

  const fill = async () => {
    fillTimeline();
    const feed = wk.feed();
    const avatars = new Map<string, HTMLImageElement | null>();
    await Promise.all([...(feed?.commits ?? []).slice(0, 7), ...(feed?.pulls ?? []).slice(0, 6)].map(async (c) => c.avatar && avatars.set(c.avatar, await xImage(c.avatar))));
    commitsBoard.draw((g, W, Hh) => drawCommits(g, W, Hh, feed, look, avatars));
    pullsBoard.draw((g, W, Hh) => drawPulls(g, W, Hh, feed, look, avatars));
    store.draw((g, W, Hh) => (repo ? drawRepo(g, W, Hh, feed, repo, look) : drawWhatsNew(g, W, Hh, feed, look)));
    setCode();
  };
  wk.onFeed(() => void fill());

  // ---- the developers' desks: the real diffs of the latest commits scroll on their monitors ------------
  // four live screens, shared round the sixteen monitors (each its own commit's file)
  const SCREENS = 4;
  const code = Array.from({ length: SCREENS }, () => ({ s: new Surface(512, 320, 1.1), lines: [] as string[], head: "", scroll: Math.random() * 20, commit: null as Commit | null }));
  const setCode = () => {
    const commits = wk.feed()?.commits ?? [];
    const diffs = commits.flatMap((c) => c.files.map((file) => ({ c, file })));
    // no diffs (GitHub's API over its quota: the commits come from the Atom feed): the log scrolls instead
    const log = commits.map((c) => `${c.sha}  ${c.message}`).concat(["", ...commits.map((c) => `   @${c.login ?? c.author} · ${day(c.date)}`)]);
    code.forEach((m, i) => {
      const d = diffs[i % Math.max(1, diffs.length)];
      m.commit = d?.c ?? commits[i % Math.max(1, commits.length)] ?? null;
      m.lines = d ? d.file.patch.split("\n") : commits.length ? log.slice(i * 2).concat(log.slice(0, i * 2)) : ["// loading the latest commits from GitHub…"];
      m.head = d ? `${d.c.repo.split("/")[1]} · ${d.c.sha} · @${d.c.login ?? d.c.author} · ${d.file.name.split("/").pop()}` : commits.length ? `${commits[0].repo.split("/")[1]} · git log` : look.name;
    });
  };
  setCode();
  void fill();
  void document.fonts?.ready.then(() => void fill());
  let acc = 0;
  k.ticks[f].push((dt) => {
    acc += dt;
    for (const m of code) m.scroll += dt * 1.6;
    if (acc < 0.08) return;
    acc = 0;
    for (const m of code) m.s.draw((g, W, Hh) => drawDiff(g, W, Hh, m.lines, m.head, m.scroll, look));
  });
  let n = 0;
  for (const z of [-9, -15.5]) {
    for (const x of [-6.6, -2.2, 2.2, 6.6]) {
      k.box(f, 3.6, 0.06, 1.4, x, 0.74, z, look.trim, "metal");
      k.box(f, 3.5, 0.74, 0.08, x, 0, z - 0.6, look.dark, "matte");
      for (const dx of [-0.9, 0.9]) {
        const m = code[n++ % SCREENS];
        k.box(f, 0.06, 0.34, 0.06, x + dx, 0.8, z - 0.3, "#202024", "metal");
        k.box(f, 1.3, 0.78, 0.05, x + dx, 1.1, z - 0.32, "#0d0d10", "polish");
        k.plane(f, 1.22, 0.7, m.s.mat, x + dx, 1.49, z - 0.29);
        k.hit(f, 1.22, 0.7, 0.1, x + dx, 1.14, z - 0.26, "<b>Code</b><span>the commit on this screen</span>", () => (m.commit ? commitInfo(m.commit, look) : null));
      }
      k.solid(f, x - 1.85, z - 0.75, x + 1.85, z + 0.75);
    }
  }

  // ---- the lifts, the light, the team ---------------------------------------------------------------------
  k.lifts(f, X0 + 0.2, -6, Math.PI / 2, look.lift);
  k.light(f, -6, 5, -12, "#f4f6ff", 14, 18);
  k.light(f, 6, 5, -12, "#f4f6ff", 14, 18);
  k.light(f, 0, 4.6, -22, "#fff4e0", 12, 16);
  k.light(f, 0, 3, -24.5, look.glow, 6, 10);
  k.light(f, 0, 4, -3, "#ffffff", 10, 12);
  const seed = repo?.seed ?? (look.key === "zodl" ? 4401 : 4501);
  const rel = () => wk.feed()?.releases[0];
  const last = () => wk.feed()?.commits?.[0];
  k.onCast(f, () => {
    void k.person(f, seed, [-6.6, -7.7], "Developer", { face: [0, -1], lines: [() => (rel() ? `${rel()!.tag} shipped ${day(rel()!.date)}. Next one's already on my screen.` : repo ? `No release of ${repo.name} yet. Experimental, not audited: we say it everywhere.` : "Shipping again this week."), "Shielded by default. No exceptions.", "Every commit is public. Every balance is not."] });
    void k.person(f, seed + 1, [2.2, -14.2], "Developer", { face: [0, -1], lines: [() => (last() ? `Just landed on ${last()!.repo.split("/")[1]}: "${last()!.message.slice(0, 70)}"` : "Syncing a wallet in seconds is harder than it looks."), () => (last() ? `${last()!.sha}, by @${last()!.login ?? last()!.author}. Every commit is on GitHub.` : "Memos, swaps, Keystone… one release at a time."), () => `${wk.feed()?.pulls?.length ?? 0} pull requests open. Reviews after lunch.`] });
    void k.person(f, seed + 2, [8, -20], "Designer", { wander: [[8, -20], [-8, -21], [0, -4]], lines: [`The ${look.name} logo up top turns all day. Took me a week.`, "Privacy should feel beautiful."] });
  });
}

function drawRelease(g: CanvasRenderingContext2D, W: number, H: number, r: Release | null, look: Look, newest: boolean) {
  g.fillStyle = look.card;
  g.fillRect(0, 0, W, H);
  if (!r) {
    drawMark(g, look.key, W / 2, H / 2 - 20, 150, "rgba(0,0,0,0.08)");
    g.fillStyle = look.muted;
    g.font = FONT(600, 26);
    g.textAlign = "center";
    g.fillText("the next release", W / 2, H / 2 + 100);
    g.textAlign = "left";
    return;
  }
  g.fillStyle = newest ? look.accent : "rgba(0,0,0,0.12)";
  g.fillRect(0, 0, W, 10);
  g.textBaseline = "top";
  g.fillStyle = newest ? look.accent : look.ink;
  g.font = FONT(800, 64);
  g.fillText(r.tag, 32, 34);
  g.fillStyle = look.muted;
  g.font = FONT(500, 24);
  g.fillText(`${day(r.date)} · ${r.repo.split("/")[1]}`, 32, 112);
  if (newest) {
    g.textAlign = "right";
    g.fillStyle = look.accent;
    g.font = FONT(800, 22);
    g.fillText("LATEST", W - 32, 42);
    g.textAlign = "left";
  }
  g.fillStyle = look.ink;
  fitText(g, plainNotes(r.notes) || r.name || "", 32, 160, W - 64, H - 190, (px) => FONT(500, px), [26, 23, 20, 18, 16]);
}

const ago = (iso: string) => {
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

function face(g: CanvasRenderingContext2D, img: HTMLImageElement | null | undefined, x: number, y: number, r: number, look: Look) {
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.clip();
  if (img) g.drawImage(img, x - r, y - r, r * 2, r * 2);
  else {
    g.fillStyle = look.muted;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.restore();
}

function drawCommits(g: CanvasRenderingContext2D, W: number, H: number, feed: WalletFeed | null, look: Look, avatars: Map<string, HTMLImageElement | null>) {
  g.fillStyle = look.card;
  g.fillRect(0, 0, W, H);
  g.fillStyle = look.accent;
  g.fillRect(0, 0, W, 8);
  g.textBaseline = "top";
  g.fillStyle = look.muted;
  g.font = FONT(700, 26);
  const repos = feed?.repos ?? [];
  g.fillText(`COMMITS · ${repos.map((r) => `${r.repo} ★${r.stars}`).join(" · ") || "GITHUB"}`, 36, 26);
  const list = (feed?.commits ?? []).slice(0, 7);
  if (!list.length) {
    g.font = FONT(500, 30);
    g.fillText("loading the latest commits…", 36, 100);
    return;
  }
  list.forEach((c, i) => {
    const y = 72 + i * 62;
    face(g, c.avatar ? avatars.get(c.avatar) : null, 58, y + 24, 22, look);
    g.fillStyle = look.accent;
    g.font = `700 22px ${MONO}`;
    g.fillText(c.sha, 94, y + 2);
    g.fillStyle = look.ink;
    g.font = FONT(600, 24);
    let msg = c.message;
    while (msg.length > 4 && g.measureText(msg).width > W - 300) msg = msg.slice(0, -2);
    g.fillText(msg === c.message ? msg : `${msg}…`, 190, y);
    g.fillStyle = look.muted;
    g.font = FONT(500, 19);
    g.fillText(`@${c.login ?? c.author} · ${c.repo.split("/")[1]} · ${ago(c.date)}`, 190, y + 30);
  });
}

function drawPulls(g: CanvasRenderingContext2D, W: number, H: number, feed: WalletFeed | null, look: Look, avatars: Map<string, HTMLImageElement | null>) {
  g.fillStyle = look.card;
  g.fillRect(0, 0, W, H);
  g.fillStyle = look.accent;
  g.fillRect(0, 0, W, 8);
  g.textBaseline = "top";
  g.fillStyle = look.muted;
  g.font = FONT(700, 26);
  const list = feed?.pulls ?? [];
  g.fillText(`OPEN PULL REQUESTS · ${list.length}`, 36, 26);
  list.slice(0, 6).forEach((p, i) => {
    const y = 74 + i * 70;
    face(g, p.avatar ? avatars.get(p.avatar) : null, 58, y + 26, 22, look);
    g.fillStyle = p.draft ? look.muted : "#1a7f37";
    g.font = `700 22px ${MONO}`;
    g.fillText(`#${p.number}`, 94, y + 2);
    g.fillStyle = look.ink;
    g.font = FONT(600, 24);
    let t = p.title;
    while (t.length > 4 && g.measureText(t).width > W - 230) t = t.slice(0, -2);
    g.fillText(t === p.title ? t : `${t}…`, 190, y);
    g.fillStyle = look.muted;
    g.font = FONT(500, 19);
    g.fillText(`@${p.login}${p.draft ? " · draft" : ""} · updated ${ago(p.updated)}`, 190, y + 32);
  });
}

/** A file's diff, as a code editor shows it: the header, then the lines scrolling, + green, - red. */
function drawDiff(g: CanvasRenderingContext2D, W: number, H: number, lines: string[], head: string, scroll: number, look: Look) {
  g.fillStyle = "#0d1117";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#161b22";
  g.fillRect(0, 0, W, 30);
  g.fillStyle = look.key === "zodl" ? "#e6edf3" : "#ff8fb0";
  g.font = `600 14px ${MONO}`;
  g.textBaseline = "middle";
  g.fillText(head.length > 58 ? `${head.slice(0, 57)}…` : head, 10, 15);
  g.save();
  g.beginPath();
  g.rect(0, 30, W, H - 30);
  g.clip();
  g.font = `500 15px ${MONO}`;
  g.textBaseline = "top";
  const LH = 19;
  const total = Math.max(1, lines.length + 4);
  const first = Math.floor(scroll) % total;
  const off = (scroll % 1) * LH;
  for (let i = 0; i < 16; i++) {
    const n = (first + i) % total;
    const l = lines[n] ?? "";
    const y = 36 + i * LH - off;
    if (l.startsWith("+")) {
      g.fillStyle = "rgba(46,160,67,0.18)";
      g.fillRect(0, y - 1, W, LH);
      g.fillStyle = "#7ee787";
    } else if (l.startsWith("-")) {
      g.fillStyle = "rgba(248,81,73,0.18)";
      g.fillRect(0, y - 1, W, LH);
      g.fillStyle = "#ffa198";
    } else g.fillStyle = l.startsWith("@@") ? "#79c0ff" : "#c9d1d9";
    g.fillText(l.replace(/\t/g, "  ").slice(0, 60), 10, y);
  }
  g.restore();
}

/** A repository's card (ZLab's labs, no store listing): what it is, its stars, its language, its last push. */
function drawRepo(g: CanvasRenderingContext2D, W: number, H: number, feed: WalletFeed | null, repo: { repo: string; name: string; about: string }, look: Look) {
  g.fillStyle = look.card;
  g.fillRect(0, 0, W, H);
  g.fillStyle = look.accent;
  g.fillRect(0, 0, W, 8);
  const r = feed?.repos[0];
  const last = feed?.commits?.[0];
  g.textBaseline = "top";
  g.fillStyle = look.muted;
  g.font = FONT(700, 28);
  g.fillText(`GITHUB · ${repo.repo}`, 44, 36);
  g.fillStyle = look.ink;
  g.font = FONT(800, 58);
  g.fillText(repo.name, 44, 84);
  g.fillStyle = look.muted;
  g.font = FONT(500, 26);
  const line = r ? `★ ${r.stars} · ${r.forks} forks · ${r.language ?? "–"} · pushed ${ago(r.pushed_at)}` : last ? `${feed?.commits?.length} recent commits · last ${ago(last.date)}` : "";
  g.fillText(line, 44, 160);
  g.fillStyle = look.ink;
  const about = r?.description || `${repo.name}: ${repo.about}. Open source, experimental, not audited.`;
  fitText(g, about, 44, 214, W - 88, H - 244, (px) => FONT(500, px), [32, 28, 24, 20]);
}

function drawWhatsNew(g: CanvasRenderingContext2D, W: number, H: number, feed: WalletFeed | null, look: Look) {
  g.fillStyle = look.card;
  g.fillRect(0, 0, W, H);
  const s = feed?.store;
  g.textBaseline = "top";
  g.fillStyle = look.muted;
  g.font = FONT(700, 30);
  g.fillText(s?.chrome ? "CHROME WEB STORE · BROWSER EXTENSION" : "WHAT'S NEW · APP STORE", 44, 36);
  g.fillStyle = look.accent;
  g.font = FONT(800, 46);
  g.fillText(s ? `Version ${s.version}` : "–", 44, 90);
  g.fillStyle = look.muted;
  g.font = FONT(500, 26);
  g.fillText(s?.chrome ? `${s.rating?.toFixed(1) ?? "–"} ★ · ${s.users ? `${compact(s.users)}+ users` : ""}` : s ? `${day(s.released)} · ${s.ratings ? `${compact(s.ratings)} ratings · ${s.rating?.toFixed(2)} ★` : ""}` : "", 44, 148);
  g.fillStyle = look.ink;
  fitText(g, s?.notes ?? (s?.chrome ? "A shielded Zcash wallet in your browser: web pages ask it to sign or to pay, one click instead of a QR code." : ""), 44, 200, W - 88, H - 230, (px) => FONT(500, px), [30, 26, 22, 19]);
}

function releaseInfo(r: Release, look: Look): PickInfo {
  return {
    eyebrow: `${look.title} · ${r.repo}`,
    title: r.name && r.name !== r.tag ? `${r.tag} · ${r.name}` : r.tag,
    stats: [
      ["Released", day(r.date)],
      ["Repository", r.repo.split("/")[1]],
    ],
    body: `<p style="white-space:pre-line">${esc(plainNotes(r.notes).slice(0, 1200))}</p>`,
    link: { href: r.url, label: "Open on GitHub" },
  };
}

function commitInfo(c: Commit, look: Look): PickInfo {
  return {
    eyebrow: `${look.title} · ${c.repo}`,
    title: c.message,
    image: c.avatar ?? undefined,
    stats: [
      ["Commit", c.sha],
      ["Author", `@${c.login ?? c.author}`],
      ["When", ago(c.date)],
      ["Files", String(c.files.length || "–")],
    ],
    body: c.files.map((f) => `<p style="font-family:${MONO}">${esc(f.name)} · <span style="color:#3fb950">+${f.additions}</span> <span style="color:#f85149">−${f.deletions}</span></p>`).join(""),
    link: { href: c.url, label: "Open on GitHub" },
  };
}

function commitsInfo(feed: WalletFeed | null, look: Look): PickInfo {
  const list = feed?.commits ?? [];
  return {
    eyebrow: `${look.title} · GitHub`,
    title: "The latest commits",
    stats: (feed?.repos ?? []).slice(0, 4).map((r) => [r.repo.split("/")[1], `★ ${r.stars}`] as [string, string]),
    body: list
      .slice(0, 12)
      .map((c) => `<p><a href="${esc(c.url)}" target="_blank" rel="noopener" style="font-family:${MONO}">${esc(c.sha)}</a> ${esc(c.message)}<br><small>@${esc(c.login ?? c.author)} · ${esc(c.repo)} · ${ago(c.date)}</small></p>`)
      .join(""),
    link: feed?.repos[0] ? { href: feed.repos[0].url, label: "Open on GitHub" } : undefined,
  };
}

function pullsInfo(feed: WalletFeed | null, look: Look): PickInfo {
  const list = feed?.pulls ?? [];
  return {
    eyebrow: `${look.title} · GitHub`,
    title: `${list.length} open pull requests`,
    body: list.map((p) => `<p><a href="${esc(p.url)}" target="_blank" rel="noopener">#${p.number}</a> ${esc(p.title)}<br><small>@${esc(p.login)}${p.draft ? " · draft" : ""} · ${esc(p.repo)} · updated ${ago(p.updated)}</small></p>`).join(""),
    link: feed?.repos[0] ? { href: `${feed.repos[0].url}/pulls`, label: "Pull requests on GitHub" } : undefined,
  };
}
