import * as THREE from "three";
import { ago, announce, hashSmash, hashSmashNow, HS_SITE, onHashSmash, pow2, statusOf, type HashSmash, type HsFamily, type HsPoint, type HsSolver } from "../../data/hashsmash";
import { TOUCH } from "../../scene/quality";
import type { PickInfo } from "../types";
import type { Snark } from "../../scene/snark";
import { marbleTex, MONO, SANS, SERIF, Surface, type SkyKit } from "../zktowers/kit";
import { esc, fitText } from "../wallettower/shared";
import { LIFT, SAND, SAND_LT, TILE, WOOD, WOOD_DK } from "./style";
import { frontWallAndStairs } from "./stairs";

/**
 * HASHSMASH HALL (floor 5): the collision lab. HashSmash (yukon.org/hashsmash) is the open
 * challenge to find collisions in reduced-round SHA-256, SHA3-256, BLAKE3 and Orchard's Poseidon.
 * The hashes stand as columns of stone, one block per round from the first at the bottom: the
 * rounds already broken are cracked out of line, the margin still stands above. Poseidon, Zcash's
 * own, in the middle; SHA-256 and SHA3-256 either side, BLAKE3 (seven rounds) under the frontier. Over the
 * aisle hangs the latest move; the back wall plots the collision frontier, the west wall the race
 * (the deepest round broken, per hash, day by day), the east wall the solvers and the submissions.
 * When an attack is accepted, or reaches a round never reached, that round's block falls off its
 * column and shatters on the floor; the professor reads every move out.
 */

const X0 = -14,
  X1 = 14,
  Z0 = -30,
  Z1 = 0,
  H = 9;
const R = TOUCH ? 0.5 : 1;
const BG = "#14110d";
const PAPER = "#f4ead6";
const DIM = "rgba(244,234,214,0.58)";
const FAINT = "rgba(244,234,214,0.14)";
const BREAK = "#d9573f";
const ZEC = "#f4b728";
/** The families in the boards' order. */
const ORDER = ["sha256", "sha3-256", "blake3", "poseidon"];
const STONE: Record<string, string> = { sha256: "#efe6d2", "sha3-256": "#d6e1e6", blake3: "#e8d6bd", poseidon: "#bf8a2a" };
const ACCENT: Record<string, string> = { sha256: "#9fc3e8", "sha3-256": "#7fd6c2", blake3: "#d9a3ff", poseidon: ZEC };
/** Where each hash stands: Poseidon in the middle and biggest, BLAKE3's seven squat rounds behind. */
const STATION: Record<string, { x: number; z: number; w: number; h: number; plinth: number }> = {
  poseidon: { x: 0, z: -14, w: 1.75, h: 4.8, plinth: 0.85 },
  sha256: { x: -8.6, z: -10, w: 1.05, h: 4.6, plinth: 0.55 },
  "sha3-256": { x: 8.6, z: -10, w: 1.05, h: 4.6, plinth: 0.55 },
  // under the frontier, low enough to read the chart over it
  blake3: { x: 0, z: -27.6, w: 1.2, h: 1.3, plinth: 0.4 },
};
const DEBRIS = 48;

const serif = (w: number) => (px: number) => `${w} ${px}px ${SERIF}`;
const sans = (w: number) => (px: number) => `${w} ${px}px ${SANS}`;
const mono = (w: number) => (px: number) => `${w} ${px}px ${MONO}`;
const sound = (name: string) => window.dispatchEvent(new CustomEvent("zstreet:sound", { detail: { name } }));

export function hashSmashHall(k: SkyKit, f: number) {
  // ---- the room: the university's sandstone and oak, a brick-red frieze ------------------------------
  k.flat(f, X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ map: marbleTex(95, "#dcc7a0", "#c2a878", 512, 4, 4, 4, "rgba(80,60,30,0.3)"), roughness: 0.45, metalness: 0.04 }), 0, (Z0 + Z1) / 2);
  k.wall(f, X0, Z0, X1, Z0, H, SAND);
  k.wall(f, X0, Z0, X0, Z1, H, SAND);
  k.wall(f, X1, Z0, X1, Z1, H, SAND);
  // the front wall: no door upstairs, the stairs right of where it was (the top floor: down only)
  frontWallAndStairs(k, f, { x0: X0, x1: X1, z: Z1, h: H, color: SAND, top: f });
  for (const [x, z, w, d] of [
    [0, Z0 + 0.25, X1 - X0, 0.1],
    [X0 + 0.25, (Z0 + Z1) / 2, 0.1, Z1 - Z0],
    [X1 - 0.25, (Z0 + Z1) / 2, 0.1, Z1 - Z0],
  ] as const) {
    k.box(f, w, 1.1, d, x, 0, z, WOOD);
    k.box(f, w, 0.22, d, x, H - 0.7, z, TILE);
  }
  k.box(f, X1 - X0, 0.3, Z1 - Z0, 0, H, (Z0 + Z1) / 2, WOOD_DK);
  for (let x = X0 + 3.5; x < X1; x += 3.5) k.box(f, 0.3, 0.45, Z1 - Z0, x, H - 0.45, (Z0 + Z1) / 2, WOOD);
  for (let z = Z0 + 3; z < Z1; z += 3) k.box(f, X1 - X0, 0.45, 0.3, 0, H - 0.45, z, WOOD);
  const fam = (d: HashSmash | null, id: string) => d?.families.find((x) => x.id === id) ?? null;
  // the hall's name over the way in, read on the way out
  k.label(f, "HASHSMASH HALL · BREAKING HASH FUNCTIONS, LIVE", -3.6, 4.0, Z1 - 0.26, { h: 0.3, color: "#3a2416", bg: SAND_LT, ry: Math.PI });

  // ---- the frontier: the whole back wall, four tabs ------------------------------------------------------
  const CW = 20,
    CH = 6,
    CY = 2.2;
  const chart = new Surface(Math.round(FW * R), Math.round(FH * R), 1.05);
  k.box(f, CW + 0.5, CH + 0.5, 0.16, 0, CY - 0.25, Z0 + 0.32, WOOD_DK, "polish");
  k.plane(f, CW, CH, chart.mat, 0, CY + CH / 2, Z0 + 0.42);
  let tab = 3; // Poseidon first: Zcash's own
  let touched = -1e9;
  let tabClock = 0;
  const drawChart = () => chart.draw((g, W, Hh) => drawFrontier(g, W, Hh, hashSmashNow(), ORDER[tab]));
  const show = (i: number) => {
    tab = i;
    touched = performance.now();
    drawChart();
    return frontierInfo(fam(hashSmashNow(), ORDER[i]));
  };
  ORDER.forEach((id, i) => {
    const t = TABS[i];
    k.hit(f, (t.w / FW) * CW, (TAB_H / FH) * CH, 0.2, ((t.x + t.w / 2) / FW - 0.5) * CW, CY + CH * (1 - (TAB_Y + TAB_H) / FH), Z0 + 0.55, `<b>${esc(LABELS[id])}</b><span>show its frontier</span>`, () => show(i));
  });
  k.hit(f, CW, CH, 0.2, 0, CY, Z0 + 0.45, `<b>The collision frontier</b><span>click for the attacks on it</span>`, () => frontierInfo(fam(hashSmashNow(), ORDER[tab])));

  // ---- the columns, their lecterns -----------------------------------------------------------------------
  const columns = new Map(ORDER.map((id) => [id, column(k, f, id)] as const));
  const plaques = ORDER.map((id, i) => {
    const st = STATION[id];
    const big = id === "poseidon";
    const s = new Surface(Math.round(768 * R), Math.round(432 * R), 1.0);
    const pw = big ? 2.6 : 1.9,
      ph = pw * 0.5625;
    // beside its column, towards the aisle: the broken rounds at the foot stay in view
    const pz = st.z + (id === "blake3" ? 0.4 : 1.1);
    const px = st.x + (st.x > 0 ? -1 : 1) * (st.w / 2 + 0.5 + pw / 2);
    k.box(f, pw + 0.1, 0.92, 0.5, px, 0, pz, WOOD_DK, "polish");
    k.box(f, pw + 0.2, 0.05, 0.6, px, 0.92, pz, big ? ZEC : "#b8955e", "metal");
    k.plane(f, pw, ph, s.mat, px, 0.98 + ph * 0.42, pz - 0.15, -0.42);
    k.solid(f, px - pw / 2 - 0.1, pz - 0.3, px + pw / 2 + 0.1, pz + 0.3);
    k.hit(f, pw + 0.2, 2.0, 0.8, px, 0.6, pz, `<b>${esc(LABELS[id])}</b><span>its lanes and attacks</span>`, () => show(i));
    k.hit(f, st.w + 0.5, st.h + st.plinth, st.w + 0.5, st.x, 0, st.z, `<b>${esc(LABELS[id])}</b><span>one block per round</span>`, () => show(i));
    k.label(f, LABELS[id].toUpperCase(), st.x, st.h + st.plinth + (big ? 0.75 : 0.45), st.z, { h: big ? 0.42 : 0.3, color: big ? "#7a5a10" : "#3a2416", bg: big ? "#f4dc9a" : SAND_LT });
    return { draw: () => s.draw((g, W, Hh) => drawPlaque(g, W, Hh, fam(hashSmashNow(), id), id)) };
  });
  // Poseidon's plinth carries its margin, big
  const margin = new Surface(Math.round(1024 * R), Math.round(256 * R), 1.0);
  {
    const st = STATION.poseidon;
    k.plane(f, 2.5, 0.625, margin.mat, st.x, st.plinth / 2 + 0.02, st.z + 1.31);
  }
  const drawMargin = () => margin.draw((g, W, Hh) => drawMarginSign(g, W, Hh, fam(hashSmashNow(), "poseidon")));

  // ---- the latest move, hung over the aisle (both faces) ---------------------------------------------------
  const LW = 9.6,
    LH = 2.2,
    LZ = -8.6,
    LY = 4.8;
  const latest = new Surface(Math.round(1600 * R), Math.round(367 * R), 1.05);
  k.box(f, LW + 0.24, LH + 0.24, 0.1, 0, LY - 0.12, LZ, WOOD_DK, "polish");
  k.plane(f, LW, LH, latest.mat, 0, LY + LH / 2, LZ + 0.06);
  k.plane(f, LW, LH, latest.mat, 0, LY + LH / 2, LZ - 0.06, 0, Math.PI);
  for (const x of [-LW / 2 + 0.6, LW / 2 - 0.6]) k.box(f, 0.04, H - LY - LH, 0.04, x, LY + LH, LZ, "#8a8070", "metal");
  k.hit(f, LW, LH, 0.3, 0, LY, LZ, `<b>The latest move</b><span>click for the submissions</span>`, () => latestInfo(hashSmashNow()?.latest ?? []));

  // ---- the race (west wall), the solvers and the submissions (east wall) ---------------------------------------
  const race = new Surface(Math.round(2048 * R), Math.round(819 * R), 1.05);
  const RW = 16,
    RH = 6.4,
    RZ = -19,
    RY = 1.4;
  k.box(f, 0.1, RH + 0.3, RW + 0.3, X0 + 0.24, RY - 0.15, RZ, WOOD_DK, "polish");
  k.plane(f, RW, RH, race.mat, X0 + 0.32, RY + RH / 2, RZ, 0, Math.PI / 2);
  k.hit(f, 0.3, RH, RW, X0 + 0.45, RY, RZ, `<b>The race</b><span>the deepest round broken, day by day</span>`, () => raceInfo(hashSmashNow()));
  const drawRaceWall = () => race.draw((g, W, Hh) => drawRace(g, W, Hh, hashSmashNow()));

  const BW = 9.4,
    BH = 5.4,
    BY = 1.6;
  const solversS = new Surface(Math.round(1536 * R), Math.round(882 * R), 1.0);
  const feedS = new Surface(Math.round(1536 * R), Math.round(882 * R), 1.0);
  for (const [s, z] of [
    [solversS, -23.6],
    [feedS, -13.6],
  ] as const) {
    k.box(f, 0.1, BH + 0.3, BW + 0.3, X1 - 0.24, BY - 0.15, z, WOOD_DK, "polish");
    k.plane(f, BW, BH, s.mat, X1 - 0.32, BY + BH / 2, z, 0, -Math.PI / 2);
  }
  const avatars = new Map<string, HTMLImageElement | null>();
  let avatarRedraw = 0;
  const avatar = (url: string | null) => {
    if (!url) return null;
    if (avatars.has(url)) return avatars.get(url) ?? null;
    avatars.set(url, null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      avatars.set(url, img);
      clearTimeout(avatarRedraw);
      avatarRedraw = window.setTimeout(() => {
        drawSolversWall();
        drawLatestBoard();
      }, 300);
    };
    img.src = url + (url.includes("?") ? "&" : "?") + "s=128";
    return null;
  };
  const drawSolversWall = () => solversS.draw((g, W, Hh) => drawSolvers(g, W, Hh, hashSmashNow()?.solvers ?? [], avatar));
  const fresh = new Map<string, number>();
  const drawFeed = () => feedS.draw((g, W, Hh) => drawLatest(g, W, Hh, hashSmashNow()?.latest ?? [], fresh));
  const drawLatestBoard = () => latest.draw((g, W, Hh) => drawBanner(g, W, Hh, hashSmashNow()?.latest[0] ?? null, avatar));
  k.hit(f, 0.3, BH, BW, X1 - 0.45, BY, -23.6, `<b>The solvers</b><span>click for the list</span>`, () => solversInfo(hashSmashNow()?.solvers ?? []));
  k.hit(f, 0.3, BH, BW, X1 - 0.45, BY, -13.6, `<b>Submissions, live</b><span>click for the list</span>`, () => latestInfo(hashSmashNow()?.latest ?? []));

  // ---- the way in: take part (east wall, by the stairs) --------------------------------------------------------
  const join = new Surface(Math.round(1024 * R), Math.round(614 * R), 1.0);
  k.box(f, 0.1, 2.85, 4.65, X1 - 0.24, 1.33, -4.6, WOOD_DK, "polish");
  k.plane(f, 4.4, 2.64, join.mat, X1 - 0.32, 1.45 + 1.32, -4.6, 0, -Math.PI / 2);
  join.draw(drawJoin);
  void document.fonts?.ready.then(() => join.draw(drawJoin));
  k.hit(f, 0.3, 2.64, 4.4, X1 - 0.45, 1.45, -4.6, `<b>Take part</b><span>yukon.org/hashsmash</span>`, () => {
    window.open(HS_SITE, "_blank", "noopener");
    return { eyebrow: "HashSmash Hall", title: "HashSmash", body: `<p>The open challenge to find collisions in reduced-round SHA-256, SHA3-256, BLAKE3 and Orchard's Poseidon. Every attack is judged; the frontier is public.</p><p>Data: HashSmash by Yukon (Eigen Labs) with Shielded Labs, Zcash, Project Eleven and the Ethereum Foundation.</p>`, link: { href: HS_SITE, label: "yukon.org/hashsmash" } };
  });

  // ---- light, lifts --------------------------------------------------------------------------------------
  k.lifts(f, X0 + 0.2, -3.8, Math.PI / 2, LIFT);
  k.light(f, 0, 7.6, -13, "#fff1d6", 24, 20);
  k.light(f, -7, 6.8, -19, "#fff1d6", 16, 18);
  k.light(f, 7, 6.8, -19, "#fff1d6", 16, 18);
  k.light(f, 0, 6.4, -25.5, "#fff1d6", 14, 16);
  k.light(f, 0, 6, -4, "#ffe2b8", 14, 16);
  k.light(f, 0, 3.2, -20, "#ffe2b8", 8, 12);

  // ---- the professor: reads the moves out as they come ---------------------------------------------
  let prof: Snark | null = null;
  const queue: string[] = [];
  let speakIn = 2;
  let line = 0;
  const say = (text: string) => {
    queue.push(text);
    if (queue.length > 4) queue.splice(0, queue.length - 4);
  };
  // every line fits a bubble: 110 characters at most
  const lines = [
    () => {
      const p = hashSmashNow()?.latest.find((x) => x.status === "review" || x.status === "accepted");
      return p ? announce(p, LABELS[p.family] ?? p.family) : "Reading HashSmash…";
    },
    () => {
      const x = fam(hashSmashNow(), "poseidon");
      return x?.deepest != null ? `Orchard's Poseidon: ${x.deepest} of ${x.full} rounds down. ${x.full - x.deepest} rounds of margin.` : "Poseidon, Orchard's hash, is on the bench too.";
    },
    () => {
      const x = fam(hashSmashNow(), "sha256");
      return x?.deepest != null ? `SHA-256 holds: ${x.deepest} of ${x.full} rounds broken, ${x.full - x.deepest} to go.` : "SHA-256 has 64 rounds. How many can you break?";
    },
    "Hollow circles: in review. Diamonds: accepted by the judges.",
    "Under 2^128 work beats brute force. That dashed line on the wall.",
    "The race on the west wall: the deepest round, day by day.",
    "Want to try? The panel by the stairs: yukon.org/hashsmash.",
  ];
  k.onCast(f, () => {
    // its own lines are said here, not by the kit: an announcement must never be talked over
    void k.person(f, 7911, [-2.5, -12.4], "HashSmash Professor", { face: [0.25, 1] }).then((s) => (prof = s));
    void k.person(f, 7923, [-6.5, -25], "Cryptanalyst", { face: [-1, 0], wander: [[-6.5, -25], [-9, -16], [-5, -20]], lines: ["I'm on round 39 of SHA-256. Don't tell anyone.", "Every round you add doubles the trouble. Roughly."] });
    void k.person(f, 7937, [11.2, -18.6], "Student", { face: [1, 0], lines: ["I refresh this wall more than my wallet.", "Poseidon: two rounds down, sixty-two to go. Good for Zcash."] });
  });

  // ---- live: every 30 s while you are in the hall ------------------------------------------------------
  let poll = 0;
  let lastTick = 0;
  const redraw = () => {
    drawChart();
    plaques.forEach((p) => p.draw());
    drawMargin();
    drawSolversWall();
    drawFeed();
    drawLatestBoard();
    drawRaceWall();
  };
  k.ticks[f].push((dt) => {
    lastTick = performance.now();
    poll += dt;
    if (poll > 30) {
      poll = 0;
      void hashSmash();
    }
    // the tabs go round while nobody touches them
    tabClock += dt;
    if (tabClock > 12 && performance.now() - touched > 40_000) {
      tabClock = 0;
      tab = (tab + 1) % ORDER.length;
      drawChart();
    }
    speakIn -= dt;
    if (speakIn <= 0 && prof) {
      if (queue.length) {
        prof.say(queue.shift()!, 6.5, "talk");
        speakIn = 7.5;
      } else if (Math.hypot(k.eye.x - prof.root.position.x, k.eye.z - prof.root.position.z) < 10) {
        const l = lines[line++ % lines.length];
        prof.say(typeof l === "string" ? l : l(), 5, "talk");
        speakIn = 15 + Math.random() * 7;
      } else speakIn = 1;
    }
    for (const c of columns.values()) c.tick(dt);
  });
  k.arrive[f].push(() => {
    lastTick = performance.now();
    poll = 0;
    void hashSmash();
  });
  // the feed's and the banner's ages move on with time
  let feedClock = 0;
  k.ticks[f].push((dt) => {
    feedClock += dt;
    if (feedClock > 20) {
      feedClock = 0;
      drawFeed();
      drawLatestBoard();
    }
  });

  const apply = (d: HashSmash, news: HsPoint[], first: boolean) => {
    // a round never reached breaks off its column (set() drops it); an accepted attack below the
    // record still knocks a block loose; a submission in review chips the first standing round
    const deeper = new Set<string>();
    for (const id of ORDER) if (columns.get(id)!.set(fam(d, id), first)) deeper.add(id);
    const t = performance.now();
    for (const p of news) fresh.set(p.id, t);
    redraw();
    if (!news.length) return;
    const here = performance.now() - lastTick < 2000;
    const worth = news.filter((p) => p.status === "accepted" || p.status === "review");
    const pick = [...worth.filter((p) => p.status === "accepted"), ...worth.filter((p) => p.status !== "accepted").reverse()].slice(0, 3);
    pick.forEach((p, i) => {
      const c = columns.get(p.family);
      if (!c || deeper.has(p.family)) return;
      setTimeout(() => (p.status === "accepted" ? c.smash(Math.max(0, (p.rounds ?? 1) - 1)) : c.chip()), 600 + i * 1400);
    });
    if (here) {
      // the frontier wall turns to the hash that moved, for a while
      const c = pick[0] ? ORDER.indexOf(pick[0].family) : -1;
      if (c >= 0) {
        tab = c;
        touched = performance.now() - 20_000;
        drawChart();
      }
      if (news.length > 6) say(`While you were away: ${news.length} moves. ${count(news, "accepted")} accepted, ${count(news, "review")} in review.`);
      for (const p of pick) say(announce(p, LABELS[p.family] ?? p.family));
    }
    const head = pick[0] ?? news[news.length - 1];
    k.ctx.mail(
      "smash",
      news.length === 1 ? `HashSmash · ${LABELS[head.family] ?? head.family}` : `HashSmash · ${news.length} new moves`,
      news
        .slice(-5)
        .reverse()
        .map((p) => announce(p, LABELS[p.family] ?? p.family))
        .join("\n"),
      { label: "Open HashSmash", fn: () => void window.open(HS_SITE, "_blank", "noopener") },
    );
  };
  const d0 = hashSmashNow();
  if (d0) apply(d0, [], true);
  else redraw();
  let seen = !!d0;
  onHashSmash((d, news) => {
    apply(d, news, !seen);
    seen = true;
  });
  void document.fonts?.ready.then(redraw);

  // tests (?debug): make a column smash, chip, or the professor speak, for screenshots
  if (location.search.includes("debug"))
    (window as unknown as { __hashsmash?: unknown }).__hashsmash = {
      smash: (id = "poseidon", i?: number) => columns.get(id)?.smash(i),
      chip: (id = "poseidon") => columns.get(id)?.chip(),
      say: (text: string) => say(text),
    };
}

const count = (l: HsPoint[], s: string) => l.filter((p) => p.status === s).length;

const LABELS: Record<string, string> = { sha256: "SHA-256", "sha3-256": "SHA3-256", blake3: "BLAKE3", poseidon: "Poseidon · Orchard" };
const FULL: Record<string, number> = { sha256: 64, "sha3-256": 24, blake3: 7, poseidon: 64 };

/**
 * A hash as a column: one block per round from the first (bottom) up. The rounds the frontier
 * reaches are broken: darker, cracked out of line. `smash(i)`: round i's block comes off, falls,
 * and shatters on the floor, its pieces bouncing and staying as rubble round the plinth; `chip()`:
 * a few chips fly off the first standing round.
 */
function column(k: SkyKit, f: number, id: string) {
  const { x: cx, z: cz, w: COL_W, h: COL_H, plinth: PLINTH } = STATION[id];
  const full = FULL[id];
  const hb = COL_H / full;
  const stone = new THREE.Color(STONE[id]);
  const broken = stone.clone().multiplyScalar(0.5).lerp(new THREE.Color(TILE), 0.35);
  const zec = id === "poseidon";
  const mat = new THREE.MeshStandardMaterial({ roughness: zec ? 0.45 : 0.62, metalness: zec ? 0.18 : 0.03 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(box, mat, full);
  mesh.raycast = () => {};
  k.add(f, mesh, 0, 0, 0);
  // the rubble: pieces that fell, bouncing then lying round the plinth
  const rubble = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.8 }), DEBRIS);
  rubble.raycast = () => {};
  rubble.frustumCulled = false;
  k.add(f, rubble, 0, 0, 0);
  const P = COL_W / 2 + 0.38;
  k.box(f, P * 2, PLINTH, P * 2, cx, 0, cz, zec ? "#2a1d12" : WOOD_DK, "polish");
  k.box(f, P * 2 + 0.06, 0.06, P * 2 + 0.06, cx, PLINTH - 0.06, cz, zec ? ZEC : "#b8955e", "metal");
  k.solid(f, cx - P - 0.05, cz - P - 0.05, cx + P + 0.05, cz + P + 0.05);
  // the line where the broken rounds end: a red band round the column
  const band = new THREE.Mesh(new THREE.BoxGeometry(COL_W + 0.22, 0.035, COL_W + 0.22), new THREE.MeshStandardMaterial({ color: BREAK, roughness: 0.4, metalness: 0.5 }));
  band.raycast = () => {};
  k.add(f, band, cx, PLINTH, cz);
  const y0 = k.y(f);

  const rnd = (i: number, j: number) => k.rnd(i + id.length * 101, j, 77) - 0.5;
  const cur = new Float32Array(full); // 0 standing, 1 broken
  const target = new Float32Array(full);
  let knock = { i: -1, t: 0, color: new THREE.Color() };
  let deepest = -1;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const pose = (i: number) => {
    const b = cur[i];
    const shake = knock.i === i && knock.t > 0 ? Math.sin(knock.t * 40) * 0.03 * knock.t : 0;
    // broken: pushed off the axis, turned, a little sunk
    p.set(cx + rnd(i, 1) * 0.28 * COL_W * b + shake, PLINTH + hb * (i + 0.5) - b * hb * 0.08, cz + rnd(i, 2) * 0.28 * COL_W * b);
    e.set(rnd(i, 3) * 0.16 * b, rnd(i, 4) * 0.6 * b, rnd(i, 5) * 0.16 * b);
    q.setFromEuler(e);
    const w = COL_W * (1 - b * (0.08 + Math.abs(rnd(i, 6)) * 0.1));
    sc.set(w, hb * (0.93 - b * 0.16), w * (1 - b * Math.abs(rnd(i, 7)) * 0.18));
    m.compose(p, q, sc);
    mesh.setMatrixAt(i, m);
    col.copy(stone).lerp(broken, b);
    // alternate rounds a shade apart, so they read as courses of stone
    if (i % 2) col.multiplyScalar(0.93);
    if (knock.i === i && knock.t > 0) col.lerp(knock.color, Math.min(1, knock.t));
    mesh.setColorAt(i, col);
  };
  for (let i = 0; i < full; i++) pose(i);

  // ---- the falling pieces and the rubble ----
  interface Bit {
    p: THREE.Vector3;
    v: THREE.Vector3;
    r: THREE.Euler;
    w: THREE.Vector3;
    s: THREE.Vector3;
    moving: boolean;
  }
  const bits: (Bit | null)[] = Array.from({ length: DEBRIS }, () => null);
  let next = 0;
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let j = 0; j < DEBRIS; j++) {
    rubble.setMatrixAt(j, hide);
    rubble.setColorAt(j, broken);
  }
  const ground = (x: number, z: number) => (Math.abs(x - cx) < P && Math.abs(z - cz) < P ? PLINTH : 0);
  const spawn = (pos: THREE.Vector3, size: number, v: THREE.Vector3, color: THREE.Color) => {
    const j = next++ % DEBRIS;
    bits[j] = { p: pos.clone(), v, r: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3), w: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), s: new THREE.Vector3(size, size * (0.5 + Math.random() * 0.5), size * (0.7 + Math.random() * 0.6)), moving: true };
    rubble.setColorAt(j, color);
  };
  /** The block that came off, in one piece till it lands. */
  let piece: { mesh: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3; half: number; color: THREE.Color } | null = null;
  const pieceMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const shatter = (at: THREE.Vector3, n: number, size: number, color: THREE.Color, speed: number) => {
    for (let j = 0; j < n; j++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      spawn(at, size * (0.35 + Math.random() * 0.65), new THREE.Vector3(Math.cos(a) * sp, 1 + Math.random() * speed * 0.9, Math.sin(a) * sp), color);
    }
    rubble.instanceColor!.needsUpdate = true;
  };

  let moving = false;
  return {
    /** The family's numbers; true when a round never reached before broke (it falls off now). */
    set(fm: HsFamily | null, first: boolean): boolean {
      const was = deepest;
      deepest = Math.min(full, fm?.deepest ?? 0);
      for (let i = 0; i < full; i++) target[i] = i < deepest ? 1 : 0;
      const deeper = !first && was >= 0 && deepest > was;
      if (first || was < 0) {
        cur.set(target);
        for (let i = 0; i < full; i++) pose(i);
        // what fell before you came: rubble already lying there
        const lying = deepest ? Math.min(DEBRIS - 8, 4 + Math.round((deepest / full) * 26)) : 0;
        for (let j = 0; j < lying; j++) {
          const a = rnd(j, 8) * Math.PI * 2;
          const r = P + 0.15 + Math.abs(rnd(j, 9)) * 0.9;
          spawn(new THREE.Vector3(cx + Math.cos(a) * r, 0.06, cz + Math.sin(a) * r), COL_W * (0.07 + Math.abs(rnd(j, 10)) * 0.14), new THREE.Vector3(), broken);
        }
        if (lying) rubble.instanceColor!.needsUpdate = true;
      } else moving = true;
      if (deeper) for (let i = was; i < deepest; i++) setTimeout(() => this.smash(i), 400 + (i - was) * 900);
      band.position.y = y0 + PLINTH + hb * deepest;
      band.visible = deepest > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return deeper;
    },
    /** Round i (the deepest broken by default) loses its block: it falls and shatters. */
    smash(i = Math.max(0, deepest - 1)) {
      i = Math.min(full - 1, Math.max(0, i));
      if (piece) {
        piece.mesh.removeFromParent();
        piece = null;
      }
      knock = { i, t: 0.8, color: new THREE.Color("#ffffff") };
      const color = stone.clone().lerp(broken, 0.55);
      pieceMat.color.copy(color);
      const pm = new THREE.Mesh(box, pieceMat);
      pm.raycast = () => {};
      const hy = PLINTH + hb * (i + 0.5);
      pm.position.set(cx, y0 + hy, cz);
      // a thin round (Poseidon has 64) still comes off as a chunk you can see fall
      const th = Math.max(hb * 0.92, 0.26);
      pm.scale.set(COL_W * 0.96, th, COL_W * 0.96);
      k.groups[f].add(pm);
      // out towards the aisle and the door, where people stand
      const a = Math.atan2(-cz - 1, -cx) + (Math.random() - 0.5) * 1.2;
      piece = { mesh: pm, v: new THREE.Vector3(Math.cos(a) * 1.7, 1.6, Math.sin(a) * 1.7), w: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5), half: th / 2, color };
      // the block it leaves is cracked through
      target[i] = 1;
      moving = true;
    },
    /** A submission in review: chips fly off the first standing round. */
    chip() {
      const i = Math.min(full - 1, Math.max(0, deepest));
      knock = { i, t: 1.4, color: new THREE.Color("#f0b429") };
      p.set(cx, PLINTH + hb * (i + 0.5), cz + COL_W / 2);
      shatter(p, 4, COL_W * 0.12, stone, 1.6);
      setTimeout(() => sound("chip"), 120);
    },
    tick(dt: number) {
      dt = Math.min(dt, 0.05);
      let dirty = false;
      if (knock.t > 0) {
        knock.t = Math.max(0, knock.t - dt);
        pose(knock.i);
        dirty = true;
      }
      if (moving) {
        moving = false;
        // the rounds break one after the other, bottom first
        for (let i = 0; i < full; i++) {
          if (cur[i] === target[i]) continue;
          const before = i > 0 && Math.abs(cur[i - 1] - target[i - 1]) > 0.5;
          if (!before) cur[i] += Math.sign(target[i] - cur[i]) * Math.min(Math.abs(target[i] - cur[i]), dt * 1.4);
          pose(i);
          moving = true;
        }
        dirty = true;
      }
      if (dirty) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      if (piece) {
        const o = piece.mesh;
        piece.v.y -= 9.8 * dt;
        o.position.addScaledVector(piece.v, dt);
        o.rotation.x += piece.w.x * dt;
        o.rotation.y += piece.w.y * dt;
        o.rotation.z += piece.w.z * dt;
        const g = y0 + ground(o.position.x, o.position.z);
        if (o.position.y - piece.half <= g && piece.v.y < 0) {
          o.position.y = g + piece.half;
          shatter(o.position.clone().setY(o.position.y - y0), 22, COL_W * 0.24, piece.color, 4.2);
          o.removeFromParent();
          piece = null;
          sound("smash");
        }
      }
      let any = false;
      for (let j = 0; j < DEBRIS; j++) {
        const b = bits[j];
        if (!b || !b.moving) continue;
        any = true;
        b.v.y -= 9.8 * dt;
        b.p.addScaledVector(b.v, dt);
        b.r.x += b.w.x * dt;
        b.r.y += b.w.y * dt;
        b.r.z += b.w.z * dt;
        const gy = ground(b.p.x, b.p.z) + b.s.y / 2;
        if (b.p.y <= gy) {
          b.p.y = gy;
          if (b.v.y < -1.2) {
            b.v.y *= -0.32;
            b.v.x *= 0.55;
            b.v.z *= 0.55;
            b.w.multiplyScalar(0.5);
          } else {
            // at rest: lying flat-ish on the floor
            b.v.set(0, 0, 0);
            b.r.x = Math.round(b.r.x / (Math.PI / 2)) * (Math.PI / 2) + (Math.random() - 0.5) * 0.2;
            b.r.z = Math.round(b.r.z / (Math.PI / 2)) * (Math.PI / 2) + (Math.random() - 0.5) * 0.2;
            b.moving = false;
          }
        }
        // the walls stop them
        b.p.x = Math.max(X0 + 0.4, Math.min(X1 - 0.4, b.p.x));
        b.p.z = Math.max(Z0 + 0.4, Math.min(Z1 - 0.4, b.p.z));
        q.setFromEuler(b.r);
        m.compose(b.p, q, b.s);
        rubble.setMatrixAt(j, m);
      }
      if (any) rubble.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---- the boards ------------------------------------------------------------------------------------------

/** The frontier's canvas (the back wall: 22 × 6.6 m) and its tabs. */
const FW = 2560,
  FH = 768;
const TAB_Y = 18,
  TAB_H = 78;
const TABS = [0, 1, 2, 3].map((i) => ({ x: 40 + i * 396, w: 380 }));

/** The collision frontier of one hash: rounds attacked (x) against the attack's cost (log2, y). */
function drawFrontier(g: CanvasRenderingContext2D, W: number, H: number, d: HashSmash | null, id: string) {
  const s = W / FW;
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  g.textBaseline = "middle";
  g.textAlign = "center";
  ORDER.forEach((fid, i) => {
    const t = TABS[i];
    const on = fid === id;
    const c = ACCENT[fid];
    g.fillStyle = on ? c : "rgba(244,234,214,0.06)";
    g.fillRect(t.x * s, TAB_Y * s, t.w * s, TAB_H * s);
    g.strokeStyle = on ? c : "rgba(244,234,214,0.25)";
    g.lineWidth = 2 * s;
    g.strokeRect(t.x * s, TAB_Y * s, t.w * s, TAB_H * s);
    g.fillStyle = on ? BG : PAPER;
    g.font = sans(800)(Math.round(38 * s));
    g.fillText(LABELS[fid], (t.x + t.w / 2) * s, (TAB_Y + TAB_H / 2) * s);
  });
  g.textAlign = "right";
  g.fillStyle = DIM;
  g.font = mono(700)(Math.round(26 * s));
  g.fillText(d?.updated ? `THE COLLISION FRONTIER · LIVE · ${ago(d.updated).toUpperCase()}` : "THE COLLISION FRONTIER · READING…", W - 44 * s, (TAB_Y + TAB_H / 2) * s);
  g.textAlign = "left";

  const fam = d?.families.find((x) => x.id === id) ?? null;
  const full = fam?.full ?? FULL[id];
  const accent = ACCENT[id];
  const px0 = 190 * s,
    px1 = 1830 * s,
    py0 = 140 * s,
    py1 = 600 * s;
  const yMax = Math.max(140, ...(fam?.points ?? []).map((p) => (p.time ?? 0) + 6));
  // the rounds axis starts a little before the first attack (SHA-256's start in the 30s): a break
  // mark says the first rounds are left out, as HashSmash does
  const step = full <= 8 ? 1 : full <= 24 ? 2 : 4;
  const attacked = (fam?.points ?? []).filter((p) => p.rounds != null && (p.status === "review" || p.status === "accepted")).map((p) => p.rounds!);
  const lo = attacked.length ? Math.max(0, Math.floor((Math.min(...attacked) - 2 * step) / step) * step) : 0;
  const X = (r: number) => px0 + ((r - lo) / (full - lo)) * (px1 - px0);
  const Y = (t: number) => py1 - (Math.min(t, yMax) / yMax) * (py1 - py0);
  const deepest = fam?.deepest ?? 0;
  if (deepest > 0) {
    g.save();
    g.beginPath();
    g.rect(px0, py0, Math.max(0, X(deepest) - px0), py1 - py0);
    g.clip();
    g.fillStyle = "rgba(217,87,63,0.08)";
    g.fillRect(px0, py0, X(deepest) - px0, py1 - py0);
    g.strokeStyle = "rgba(217,87,63,0.18)";
    g.lineWidth = 2.5 * s;
    for (let x = px0 - (py1 - py0); x < X(deepest); x += 26 * s) {
      g.beginPath();
      g.moveTo(x, py1);
      g.lineTo(x + (py1 - py0), py0);
      g.stroke();
    }
    g.restore();
    g.fillStyle = BREAK;
    g.fillRect(X(deepest) - 2 * s, py0, 4 * s, py1 - py0);
  }
  g.font = mono(600)(Math.round(26 * s));
  for (let t = 0; t <= yMax; t += 20) {
    g.fillStyle = FAINT;
    g.fillRect(px0, Y(t), px1 - px0, 2 * s);
    g.fillStyle = DIM;
    g.textAlign = "right";
    g.fillText(`2^${t}`, px0 - 16 * s, Y(t));
  }
  g.textAlign = "center";
  g.textBaseline = "top";
  if (lo > 0) {
    g.strokeStyle = DIM;
    g.lineWidth = 3 * s;
    for (const dx of [0, 11]) {
      g.beginPath();
      g.moveTo(px0 + (dx - 5) * s, py1 + 12 * s);
      g.lineTo(px0 + (dx + 7) * s, py1 - 12 * s);
      g.stroke();
    }
  }
  for (let r = lo; r <= full; r += step) {
    if (step >= 4 && full - lo > 30 && r % 8) continue;
    g.fillStyle = FAINT;
    g.fillRect(X(r), py0, 2 * s, py1 - py0);
    g.fillStyle = DIM;
    g.fillText(String(r), X(r), py1 + 14 * s);
  }
  g.fillStyle = DIM;
  g.font = sans(600)(Math.round(26 * s));
  g.fillText(`rounds of ${LABELS[id]} attacked →   the full hash has ${full}${lo ? ` · rounds 0-${lo} not shown` : ""}`, (px0 + px1) / 2, py1 + 52 * s);
  g.save();
  g.translate(52 * s, (py0 + py1) / 2);
  g.rotate(-Math.PI / 2);
  g.textBaseline = "middle";
  g.fillText("attack cost (log₂)", 0, 0);
  g.restore();
  // brute force: the birthday bound
  g.setLineDash([16 * s, 12 * s]);
  g.strokeStyle = "rgba(244,234,214,0.6)";
  g.lineWidth = 3 * s;
  g.beginPath();
  g.moveTo(px0, Y(128));
  g.lineTo(px1, Y(128));
  g.stroke();
  g.setLineDash([]);
  g.textAlign = "right";
  g.textBaseline = "bottom";
  g.fillStyle = PAPER;
  g.font = sans(700)(Math.round(26 * s));
  g.fillText("brute force · birthday bound 2^128", px1 - 8 * s, Y(128) - 8 * s);
  if (deepest > 0) {
    g.textAlign = "left";
    g.fillStyle = BREAK;
    g.font = sans(800)(Math.round(28 * s));
    g.fillText(`← ${deepest} ROUNDS BROKEN`, X(deepest) + 12 * s, py1 - 44 * s);
    g.fillStyle = DIM;
    g.font = sans(600)(Math.round(24 * s));
    g.fillText(`${full - deepest} rounds of margin →`, X(deepest) + 12 * s, py1 - 12 * s);
  }
  if (!fam) {
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = DIM;
    g.font = serif(400)(Math.round(44 * s));
    g.fillText("Reading HashSmash…", (px0 + px1) / 2, (py0 + py1) / 2);
    g.textAlign = "left";
    return;
  }
  const onF = new Set(fam.frontier.map((p) => p.id));
  for (const p of fam.points) {
    if (p.rounds == null || p.time == null || onF.has(p.id)) continue;
    if (p.status !== "review" && p.status !== "accepted") continue;
    g.fillStyle = "rgba(244,234,214,0.24)";
    g.beginPath();
    g.arc(X(p.rounds) + (((p.id.charCodeAt(0) + p.id.charCodeAt(3)) % 9) - 4) * 2 * s, Y(p.time), 5.5 * s, 0, Math.PI * 2);
    g.fill();
  }
  const line = (pts: HsPoint[], dash: boolean, color: string) => {
    if (pts.length < 2) return;
    g.setLineDash(dash ? [14 * s, 10 * s] : []);
    g.strokeStyle = color;
    g.lineWidth = 4.5 * s;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(X(p.rounds!), Y(p.time!)) : g.moveTo(X(p.rounds!), Y(p.time!))));
    g.stroke();
    g.setLineDash([]);
  };
  line(fam.frontier, true, accent);
  line(fam.published, false, "#5fd38d");
  // the frontier's attacks: hollow circles in review, diamonds accepted; the deepest few named,
  // their labels pushed down till they clear each other
  const boxes: [number, number, number, number][] = [];
  const named = new Set(fam.frontier.slice(-4).map((p) => p.id));
  for (const p of [...fam.frontier].reverse()) {
    const x = X(p.rounds!),
      y = Y(p.time!);
    if (p.status === "accepted") {
      g.fillStyle = "#5fd38d";
      g.beginPath();
      g.moveTo(x, y - 19 * s);
      g.lineTo(x + 19 * s, y);
      g.lineTo(x, y + 19 * s);
      g.lineTo(x - 19 * s, y);
      g.closePath();
      g.fill();
    } else {
      g.strokeStyle = "#f0b429";
      g.lineWidth = 5 * s;
      g.beginPath();
      g.arc(x, y, 14 * s, 0, Math.PI * 2);
      g.stroke();
    }
    if (!named.has(p.id)) continue;
    const bw = 300 * s,
      bh = 64 * s;
    const right = x + 36 * s + bw < px1;
    const bx = right ? x + 32 * s : x - 32 * s - bw;
    let by = y - bh / 2;
    for (let n = 0; n < 12 && boxes.some(([ax, ay, aw, ah]) => bx < ax + aw && ax < bx + bw && by < ay + ah && ay < by + bh); n++) by += bh * 0.6;
    boxes.push([bx, by, bw, bh]);
    if (Math.abs(by + bh / 2 - y) > 4 * s) {
      g.strokeStyle = "rgba(244,234,214,0.35)";
      g.lineWidth = 2 * s;
      g.beginPath();
      g.moveTo(x + (right ? 16 : -16) * s, y);
      g.lineTo(right ? bx - 4 * s : bx + bw + 4 * s, by + bh / 2);
      g.stroke();
    }
    g.textAlign = right ? "left" : "right";
    const tx = right ? bx : bx + bw;
    g.textBaseline = "top";
    g.fillStyle = PAPER;
    g.font = mono(700)(Math.round(28 * s));
    g.fillText(`r${p.rounds} · ${pow2(p.time)}`, tx, by);
    g.fillStyle = DIM;
    g.font = sans(600)(Math.round(23 * s));
    g.fillText(p.solver, tx, by + 34 * s);
  }
  g.textAlign = "left";

  // the legend
  const ly = H - 34 * s;
  let lx = px0;
  const key = (draw: () => void, text: string) => {
    draw();
    g.fillStyle = DIM;
    g.font = sans(600)(Math.round(23 * s));
    g.textBaseline = "middle";
    g.fillText(text, lx + 30 * s, ly);
    lx += g.measureText(text).width + 80 * s;
  };
  key(() => {
    g.strokeStyle = "#f0b429";
    g.lineWidth = 4 * s;
    g.beginPath();
    g.arc(lx + 10 * s, ly, 10 * s, 0, Math.PI * 2);
    g.stroke();
  }, "in review");
  key(() => {
    g.fillStyle = "#5fd38d";
    g.beginPath();
    g.moveTo(lx + 10 * s, ly - 12 * s);
    g.lineTo(lx + 22 * s, ly);
    g.lineTo(lx + 10 * s, ly + 12 * s);
    g.lineTo(lx - 2 * s, ly);
    g.fill();
  }, "accepted");
  key(() => {
    g.fillStyle = "rgba(244,234,214,0.3)";
    g.beginPath();
    g.arc(lx + 10 * s, ly, 6 * s, 0, Math.PI * 2);
    g.fill();
  }, "not on the frontier");
  key(() => {
    g.setLineDash([10 * s, 7 * s]);
    g.strokeStyle = accent;
    g.lineWidth = 4 * s;
    g.beginPath();
    g.moveTo(lx - 4 * s, ly);
    g.lineTo(lx + 24 * s, ly);
    g.stroke();
    g.setLineDash([]);
  }, "tentative frontier");
  key(() => {
    g.fillStyle = "#5fd38d";
    g.fillRect(lx - 4 * s, ly - 2.5 * s, 28 * s, 5 * s);
  }, "published");

  // the side: the hash, its story, its counts
  const sx = 1910 * s,
    sw = W - sx - 40 * s;
  g.fillStyle = "rgba(244,234,214,0.04)";
  g.fillRect(sx - 24 * s, py0 - 26 * s, sw + 48 * s, H - py0 + 10 * s);
  g.fillStyle = accent;
  g.fillRect(sx - 24 * s, py0 - 26 * s, 7 * s, H - py0 + 10 * s);
  g.textBaseline = "top";
  g.fillStyle = accent;
  g.font = mono(800)(Math.round(24 * s));
  g.fillText(fam.zcash ? "ZCASH'S OWN HASH" : "THE HASH", sx, py0 - 6 * s);
  g.fillStyle = PAPER;
  fitText(g, fam.label, sx, py0 + 26 * s, sw, 76 * s, serif(700), [Math.round(60 * s), Math.round(50 * s)], 1.05);
  g.fillStyle = DIM;
  const used = fitText(g, fam.note, sx, py0 + 98 * s, sw, 96 * s, sans(400), [Math.round(23 * s), Math.round(20 * s)], 1.3);
  let y = py0 + 112 * s + used;
  g.fillStyle = deepest ? BREAK : PAPER;
  g.font = mono(800)(Math.round(64 * s));
  g.fillText(`${deepest}/${full}`, sx, y);
  const w1 = g.measureText(`${deepest}/${full}`).width;
  g.fillStyle = DIM;
  g.font = sans(700)(Math.round(24 * s));
  g.fillText("rounds broken", sx + w1 + 18 * s, y + 8 * s);
  g.fillStyle = PAPER;
  g.font = sans(800)(Math.round(26 * s));
  g.fillText(`${full - deepest} rounds of margin`, sx + w1 + 18 * s, y + 38 * s);
  y += 92 * s;
  g.font = sans(700)(Math.round(26 * s));
  g.fillStyle = PAPER;
  g.fillText(`${fam.submissions} attacks`, sx, y);
  g.fillStyle = "#f0b429";
  g.fillText(`${fam.review} in review`, sx + 200 * s, y);
  g.fillStyle = "#5fd38d";
  g.fillText(`${fam.accepted} accepted`, sx + 400 * s, y);
  y += 44 * s;
  const lanes = fam.lanes.filter((l) => l.open && l.submissions);
  if (lanes.length && y < H - 60 * s) {
    g.fillStyle = DIM;
    g.font = mono(700)(Math.round(20 * s));
    g.fillText("OPEN LANES", sx, y);
    g.fillStyle = PAPER;
    fitText(g, lanes.map((l) => `${l.rounds != null ? `r${l.rounds}` : "pareto"} · ${l.submissions}`).join("   "), sx, y + 28 * s, sw, 60 * s, mono(600), [Math.round(24 * s), Math.round(20 * s)], 1.3);
  }
  g.textBaseline = "alphabetic";
}

/** The latest move, over the aisle: who, on what, how deep, how cheap, when; huge. */
function drawBanner(g: CanvasRenderingContext2D, W: number, H: number, p: HsPoint | null, avatar: (u: string | null) => HTMLImageElement | null) {
  const s = W / 1600;
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  g.fillStyle = TILE;
  g.fillRect(0, 0, W, 10 * s);
  g.textBaseline = "top";
  g.fillStyle = "#e2b448";
  g.font = mono(800)(Math.round(30 * s));
  g.fillText("LATEST MOVE · HASHSMASH · LIVE", 40 * s, 34 * s);
  if (!p) {
    g.fillStyle = DIM;
    g.font = serif(400)(Math.round(64 * s));
    g.fillText("Reading HashSmash…", 40 * s, 140 * s);
    return;
  }
  const st = statusOf(p.status);
  g.textAlign = "right";
  g.fillStyle = DIM;
  g.font = mono(700)(Math.round(30 * s));
  g.fillText(ago(p.updated).toUpperCase(), W - 40 * s, 34 * s);
  g.textAlign = "left";
  // the avatar, the initial when it isn't loaded
  const ar = 110 * s,
    ax = 40 * s,
    ay = 92 * s;
  const img = avatar(p.avatar);
  g.save();
  g.beginPath();
  g.arc(ax + ar, ay + ar, ar, 0, Math.PI * 2);
  g.clip();
  if (img) g.drawImage(img, ax, ay, ar * 2, ar * 2);
  else {
    g.fillStyle = "#3a3632";
    g.fillRect(ax, ay, ar * 2, ar * 2);
    g.fillStyle = PAPER;
    g.font = sans(800)(Math.round(ar));
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(p.solver.slice(0, 1).toUpperCase(), ax + ar, ay + ar);
    g.textAlign = "left";
    g.textBaseline = "top";
  }
  g.restore();
  const tx = ax + ar * 2 + 40 * s;
  g.fillStyle = PAPER;
  fitText(g, `@${p.solver}`, tx, 84 * s, W - tx - 40 * s, 110 * s, sans(800), [Math.round(104 * s), Math.round(88 * s), Math.round(72 * s)], 1.0);
  g.font = sans(800)(Math.round(30 * s));
  const label = st.label.toUpperCase();
  const pw = g.measureText(label).width + 36 * s;
  g.fillStyle = st.color;
  g.fillRect(tx, 214 * s, pw, 54 * s);
  g.fillStyle = BG;
  g.textBaseline = "middle";
  g.fillText(label, tx + 18 * s, 242 * s);
  g.fillStyle = ACCENT[p.family] ?? PAPER;
  const what = `${LABELS[p.family] ?? p.family}${p.rounds != null ? ` · ${p.rounds} rounds` : ""}${p.time != null ? ` · ${pow2(p.time)}` : ""}`;
  fitText(g, what, tx + pw + 28 * s, 214 * s, W - tx - pw - 68 * s, 60 * s, sans(800), [Math.round(56 * s), Math.round(46 * s), Math.round(38 * s)], 1.0);
  g.textBaseline = "alphabetic";
}

/** The deepest round each hash has lost, over time: whatever was in review or accepted, by date. */
export function raceOf(fam: HsFamily) {
  const pts = fam.points.filter((p) => p.rounds != null && (p.status === "review" || p.status === "accepted")).sort((a, b) => a.at.localeCompare(b.at));
  const records: { t: number; rounds: number; solver: string }[] = [];
  let best = 0;
  for (const p of pts)
    if (p.rounds! > best) {
      best = p.rounds!;
      records.push({ t: Date.parse(p.at), rounds: best, solver: p.solver });
    }
  return records;
}

/** The race: per hash, the share of its rounds broken, a step each time someone goes deeper. */
function drawRace(g: CanvasRenderingContext2D, W: number, H: number, d: HashSmash | null) {
  const s = W / 2048;
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  g.fillStyle = TILE;
  g.fillRect(0, 0, W, 10 * s);
  g.textBaseline = "alphabetic";
  g.fillStyle = "#e2b448";
  g.font = mono(800)(Math.round(26 * s));
  g.fillText("HASHSMASH · THE DEEPEST ROUND BROKEN, PER HASH, DAY BY DAY · LIVE", 48 * s, 62 * s);
  g.fillStyle = PAPER;
  g.font = serif(700)(Math.round(68 * s));
  g.fillText("The race", 48 * s, 136 * s);
  if (!d) {
    g.fillStyle = DIM;
    g.font = serif(400)(Math.round(40 * s));
    g.fillText("Reading HashSmash…", 48 * s, 240 * s);
    return;
  }
  const races = ORDER.map((id) => ({ fam: d.families.find((x) => x.id === id)!, id })).filter((r) => r.fam);
  const rec = races.map((r) => ({ ...r, steps: raceOf(r.fam) }));
  const now = Date.now();
  const t0 = Math.min(now - 86400_000, ...rec.flatMap((r) => r.steps.map((x) => x.t)));
  const t1 = now;
  const px0 = 130 * s,
    px1 = 1560 * s,
    py0 = 180 * s,
    py1 = 720 * s;
  const X = (t: number) => px0 + ((t - t0) / (t1 - t0)) * (px1 - px0);
  const Y = (share: number) => py1 - share * (py1 - py0);
  // grid: shares of the hash broken, days
  g.font = mono(600)(Math.round(24 * s));
  g.textBaseline = "middle";
  g.textAlign = "right";
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    g.fillStyle = FAINT;
    g.fillRect(px0, Y(v), px1 - px0, 2 * s);
    g.fillStyle = DIM;
    g.fillText(`${Math.round(v * 100)}%`, px0 - 16 * s, Y(v));
  }
  g.textAlign = "center";
  g.textBaseline = "top";
  const day = 86400_000;
  for (let t = Math.ceil(t0 / day) * day; t <= t1; t += day) {
    g.fillStyle = FAINT;
    g.fillRect(X(t), py0, 2 * s, py1 - py0);
    g.fillStyle = DIM;
    g.fillText(new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), X(t), py1 + 14 * s);
  }
  g.fillStyle = DIM;
  g.font = sans(600)(Math.round(24 * s));
  g.fillText("share of the hash's rounds broken (deepest attack in review or accepted)", (px0 + px1) / 2, py1 + 50 * s);
  // the steps, Poseidon last (on top) and thicker
  const ends: { y: number; r: (typeof rec)[number] }[] = [];
  const placed: [number, number, number][] = [];
  for (const r of [...rec].sort((a, b) => (a.id === "poseidon" ? 1 : 0) - (b.id === "poseidon" ? 1 : 0))) {
    const full = r.fam.full;
    const c = ACCENT[r.id];
    const zec = r.id === "poseidon";
    g.strokeStyle = c;
    g.lineWidth = (zec ? 7 : 4.5) * s;
    g.beginPath();
    let last = 0;
    // from its first submission: Poseidon's lane opened later than the others
    const first = Math.min(...r.fam.points.map((p) => Date.parse(p.at)).filter((t) => t >= t0), r.steps[0]?.t ?? t1);
    g.moveTo(X(first), Y(0));
    for (const x of r.steps) {
      g.lineTo(X(x.t), Y(last / full));
      g.lineTo(X(x.t), Y(x.rounds / full));
      last = x.rounds;
    }
    g.lineTo(px1, Y(last / full));
    g.stroke();
    // each record: a dot; the last two named
    r.steps.forEach((x, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(X(x.t), Y(x.rounds / full), (zec ? 10 : 7.5) * s, 0, Math.PI * 2);
      g.fill();
      if (i === r.steps.length - 1) {
        // the record's name, beside its dot, moved up till it clears the others
        g.font = sans(700)(Math.round(22 * s));
        const text = `${x.rounds} · ${x.solver}`;
        const tw = g.measureText(text).width;
        const right = X(x.t) + 14 * s + tw > px1;
        const bx = right ? X(x.t) - 14 * s - tw : X(x.t) + 14 * s;
        let by = Y(x.rounds / full) - 10 * s;
        while (placed.some(([ax, ay, aw]) => bx < ax + aw && ax < bx + tw && Math.abs(ay - by) < 26 * s)) by -= 26 * s;
        placed.push([bx, by, tw]);
        g.textAlign = "left";
        g.textBaseline = "bottom";
        g.fillStyle = PAPER;
        g.fillText(text, bx, by);
      }
    });
    ends.push({ y: Y(last / full), r });
  }
  // the names at the right end, kept apart
  ends.sort((a, b) => a.y - b.y);
  let prev = -1e9;
  g.textAlign = "left";
  g.textBaseline = "middle";
  const ys: number[] = [];
  for (const e of ends) ys.push((prev = Math.max(e.y, prev + 62 * s)));
  // pushed past the bottom: the whole stack moves up
  const over = Math.max(0, ys[ys.length - 1] - (py1 - 14 * s));
  ends.forEach((e, i) => {
    const y = ys[i] - over;
    const full = e.r.fam.full,
      deep = e.r.fam.deepest ?? 0;
    g.fillStyle = ACCENT[e.r.id];
    g.font = sans(800)(Math.round(30 * s));
    g.fillText(LABELS[e.r.id], px1 + 24 * s, y - 14 * s);
    g.fillStyle = PAPER;
    g.font = mono(700)(Math.round(24 * s));
    g.fillText(`${deep}/${full} · ${full - deep} to go`, px1 + 24 * s, y + 16 * s);
  });
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
}

/** Poseidon's plinth: its margin in big type. */
function drawMarginSign(g: CanvasRenderingContext2D, W: number, H: number, fam: HsFamily | null) {
  const s = W / 1024;
  g.fillStyle = "#2a1d12";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = ZEC;
  g.lineWidth = 4 * s;
  g.strokeRect(10 * s, 10 * s, W - 20 * s, H - 20 * s);
  const full = fam?.full ?? 64,
    deep = fam?.deepest ?? 0;
  g.textBaseline = "middle";
  g.fillStyle = ZEC;
  g.font = mono(800)(Math.round(150 * s));
  const n = String(full - deep);
  g.fillText(n, 40 * s, H / 2 + 4 * s);
  const w = g.measureText(n).width;
  g.fillStyle = "#f4dc9a";
  g.font = sans(800)(Math.round(54 * s));
  g.fillText("ROUNDS OF MARGIN", 40 * s + w + 30 * s, H / 2 - 30 * s);
  g.fillStyle = "rgba(244,220,154,0.75)";
  g.font = sans(600)(Math.round(30 * s));
  g.fillText(`${deep} of ${full} broken · Zcash's own hash`, 40 * s + w + 30 * s, H / 2 + 34 * s);
  g.textBaseline = "alphabetic";
}

function raceInfo(d: HashSmash | null): PickInfo {
  const rows = (d?.families ?? [])
    .map((f) => {
      const steps = raceOf(f);
      return `<p><b>${esc(f.label)}</b> · ${f.deepest ?? 0}/${f.full} rounds<br><span style="opacity:.7">${steps.map((x) => `${x.rounds} by ${esc(x.solver)} (${new Date(x.t).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})`).join(" → ") || "no attack yet"}</span></p>`;
    })
    .join("");
  return { eyebrow: "HashSmash Hall · live", title: "The race", body: rows || "<p>Reading HashSmash…</p>", link: { href: HS_SITE, label: "yukon.org/hashsmash" } };
}

/** The lectern's plaque in front of a column: its depth, big enough to read from the aisle. */
function drawPlaque(g: CanvasRenderingContext2D, W: number, H: number, fam: HsFamily | null, id: string) {
  const s = W / 768;
  const accent = id === "poseidon" ? ZEC : ACCENT[id];
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  g.fillStyle = accent;
  g.fillRect(0, 0, W, 10 * s);
  g.textBaseline = "top";
  g.fillStyle = id === "poseidon" ? ZEC : PAPER;
  fitText(g, LABELS[id], 34 * s, 34 * s, W - 68 * s, 64 * s, serif(700), [Math.round(54 * s), Math.round(46 * s)], 1.1);
  const full = fam?.full ?? FULL[id];
  const deepest = fam?.deepest ?? 0;
  g.fillStyle = deepest ? BREAK : PAPER;
  g.font = mono(800)(Math.round(104 * s));
  const big = `${deepest}/${full}`;
  g.fillText(big, 30 * s, 104 * s);
  const w = g.measureText(big).width;
  g.fillStyle = DIM;
  g.font = sans(700)(Math.round(28 * s));
  g.fillText("rounds broken", 30 * s + w + 22 * s, 118 * s);
  g.fillStyle = PAPER;
  g.font = sans(800)(Math.round(30 * s));
  g.fillText(`${full - deepest} to go`, 30 * s + w + 22 * s, 158 * s);
  // the depth as a bar, a notch per round when there are few
  const bx = 34 * s,
    by = 236 * s,
    bw = W - 68 * s,
    bh = 26 * s;
  g.fillStyle = "rgba(244,234,214,0.12)";
  g.fillRect(bx, by, bw, bh);
  g.fillStyle = BREAK;
  g.fillRect(bx, by, (bw * deepest) / full, bh);
  for (let r = 1; r < full && full <= 24; r++) {
    g.fillStyle = BG;
    g.fillRect(bx + (bw * r) / full - 1.5 * s, by, 3 * s, bh);
  }
  if (fam) {
    g.fillStyle = PAPER;
    g.font = sans(700)(Math.round(28 * s));
    g.fillText(`${fam.submissions} attacks`, 34 * s, 290 * s);
    const w2 = g.measureText(`${fam.submissions} attacks`).width + 30 * s;
    g.fillStyle = "#f0b429";
    g.fillText(`${fam.review} in review`, 34 * s + w2, 290 * s);
    const w3 = g.measureText(`${fam.review} in review`).width + 30 * s;
    g.fillStyle = "#5fd38d";
    g.fillText(`${fam.accepted} accepted`, 34 * s + w2 + w3, 290 * s);
    const best = fam.frontier[fam.frontier.length - 1];
    g.fillStyle = DIM;
    if (best) fitText(g, `deepest: ${best.solver} · ${best.rounds} rounds · ${pow2(best.time)}`, 34 * s, 338 * s, W - 68 * s, 40 * s, sans(600), [Math.round(25 * s), Math.round(21 * s)], 1.2);
  } else {
    g.fillStyle = DIM;
    g.font = sans(600)(Math.round(28 * s));
    g.fillText("Reading HashSmash…", 34 * s, 290 * s);
  }
  if (id === "poseidon") {
    g.fillStyle = ZEC;
    g.font = mono(800)(Math.round(20 * s));
    g.fillText("ZCASH · ORCHARD'S NULLIFIERS AND NOTES", 34 * s, H - 42 * s);
  }
  g.textBaseline = "alphabetic";
}

function board(g: CanvasRenderingContext2D, W: number, H: number, title: string, kicker: string, color: string) {
  const s = W / 1536;
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  g.fillStyle = color;
  g.fillRect(0, 0, W, 10 * s);
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  g.fillStyle = color;
  g.font = mono(700)(Math.round(22 * s));
  g.fillText(kicker.toUpperCase(), 48 * s, 66 * s);
  g.fillStyle = PAPER;
  g.font = serif(700)(Math.round(58 * s));
  g.fillText(title, 48 * s, 130 * s);
  return s;
}

/** The solvers: who breaks what, the deepest attack each one has on the board. */
function drawSolvers(g: CanvasRenderingContext2D, W: number, H: number, list: HsSolver[], avatar: (u: string | null) => HTMLImageElement | null) {
  const s = board(g, W, H, "The solvers", "HashSmash · who breaks what · live", BREAK);
  g.textAlign = "right";
  g.fillStyle = DIM;
  g.font = mono(600)(Math.round(18 * s));
  g.fillText("ACCEPTED · REVIEW · SENT", W - 48 * s, 130 * s);
  g.textAlign = "left";
  if (!list.length) {
    g.fillStyle = DIM;
    g.font = serif(400)(Math.round(34 * s));
    g.fillText("Reading HashSmash…", 48 * s, 230 * s);
    return;
  }
  const rows = list.slice(0, 9);
  const top = 168 * s;
  const rh = (H - top - 30 * s) / rows.length;
  rows.forEach((v, i) => {
    const y = top + i * rh;
    const cy = y + rh / 2;
    g.textBaseline = "middle";
    g.fillStyle = i < 3 ? PAPER : DIM;
    g.font = mono(800)(Math.round(30 * s));
    g.fillText(String(i + 1), 48 * s, cy);
    // the avatar, or the initial
    const ax = 108 * s,
      ar = Math.min(32 * s, rh * 0.36);
    const img = avatar(v.avatar);
    g.save();
    g.beginPath();
    g.arc(ax + ar, cy, ar, 0, Math.PI * 2);
    g.clip();
    if (img) g.drawImage(img, ax, cy - ar, ar * 2, ar * 2);
    else {
      g.fillStyle = "#3a3632";
      g.fillRect(ax, cy - ar, ar * 2, ar * 2);
      g.fillStyle = PAPER;
      g.font = sans(800)(Math.round(ar));
      g.textAlign = "center";
      g.fillText(v.solver.slice(0, 1).toUpperCase(), ax + ar, cy);
      g.textAlign = "left";
    }
    g.restore();
    const tx = ax + ar * 2 + 22 * s;
    g.fillStyle = PAPER;
    g.font = sans(800)(Math.round(30 * s));
    g.fillText(v.solver, tx, cy - 16 * s);
    if (v.best) {
      const fam = v.best.family;
      g.fillStyle = ACCENT[fam] ?? DIM;
      g.font = sans(600)(Math.round(20 * s));
      g.fillText(`${v.best.label} · ${v.best.rounds}/${v.best.full} rounds · ${pow2(v.best.time)}`, tx, cy + 18 * s);
      // the depth of that attack
      const bw = 220 * s;
      const bx = W - 48 * s - 380 * s - bw;
      g.fillStyle = "rgba(244,234,214,0.1)";
      g.fillRect(bx, cy - 5 * s, bw, 10 * s);
      g.fillStyle = BREAK;
      g.fillRect(bx, cy - 5 * s, bw * v.best.depth, 10 * s);
    }
    g.textAlign = "right";
    g.font = mono(800)(Math.round(28 * s));
    g.fillStyle = "#5fd38d";
    g.fillText(String(v.accepted), W - 48 * s - 260 * s, cy);
    g.fillStyle = "#f0b429";
    g.fillText(String(v.review), W - 48 * s - 130 * s, cy);
    g.fillStyle = DIM;
    g.fillText(String(v.submissions), W - 48 * s, cy);
    g.textAlign = "left";
    g.fillStyle = FAINT;
    g.fillRect(48 * s, y + rh - 1 * s, W - 96 * s, 2 * s);
  });
  g.textBaseline = "alphabetic";
}

/** The submissions as they move, newest first; the ones that just came in are marked. */
function drawLatest(g: CanvasRenderingContext2D, W: number, H: number, list: HsPoint[], fresh: Map<string, number>) {
  const s = board(g, W, H, "Submissions", "HashSmash · every attack as it moves · live", "#f0b429");
  if (!list.length) {
    g.fillStyle = DIM;
    g.font = serif(400)(Math.round(34 * s));
    g.fillText("Reading HashSmash…", 48 * s, 230 * s);
    return;
  }
  const rows = list.slice(0, 9);
  const top = 168 * s;
  const rh = (H - top - 30 * s) / rows.length;
  const now = performance.now();
  rows.forEach((p, i) => {
    const y = top + i * rh;
    const cy = y + rh / 2;
    const st = statusOf(p.status);
    const isNew = now - (fresh.get(p.id) ?? -1e9) < 10 * 60_000;
    if (isNew) {
      g.fillStyle = "rgba(240,180,41,0.08)";
      g.fillRect(40 * s, y + 4 * s, W - 80 * s, rh - 8 * s);
      g.fillStyle = "#f0b429";
      g.fillRect(40 * s, y + 4 * s, 6 * s, rh - 8 * s);
    }
    g.textBaseline = "middle";
    // the status, a pill
    g.font = sans(800)(Math.round(18 * s));
    const label = st.label.toUpperCase();
    const pw = g.measureText(label).width + 28 * s;
    g.fillStyle = st.color;
    g.fillRect(64 * s, cy - 17 * s, pw, 34 * s);
    g.fillStyle = BG;
    g.fillText(label, 78 * s, cy + 1 * s);
    const tx = 64 * s + 210 * s;
    g.fillStyle = PAPER;
    g.font = sans(800)(Math.round(28 * s));
    g.fillText(p.solver, tx, cy - 15 * s);
    g.fillStyle = ACCENT[p.family] ?? DIM;
    g.font = sans(600)(Math.round(20 * s));
    const what = `${LABELS[p.family] ?? p.family}${p.rounds != null ? ` · ${p.rounds} rounds` : ""}${p.time != null ? ` · ${pow2(p.time)}` : ""}`;
    g.fillText(what, tx, cy + 18 * s);
    g.textAlign = "right";
    g.fillStyle = isNew ? "#f0b429" : DIM;
    g.font = mono(700)(Math.round(20 * s));
    g.fillText(isNew ? `NEW · ${ago(p.updated)}` : ago(p.updated), W - 48 * s, cy);
    g.textAlign = "left";
    g.fillStyle = FAINT;
    g.fillRect(48 * s, y + rh - 1 * s, W - 96 * s, 2 * s);
  });
  g.textBaseline = "alphabetic";
}

function drawJoin(g: CanvasRenderingContext2D, W: number, H: number) {
  const s = W / 1024;
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  g.fillStyle = BREAK;
  g.fillRect(0, 0, W, 10 * s);
  g.textBaseline = "top";
  g.fillStyle = BREAK;
  g.font = mono(700)(Math.round(20 * s));
  g.fillText("TAKE PART", 44 * s, 44 * s);
  g.fillStyle = PAPER;
  g.font = serif(700)(Math.round(68 * s));
  g.fillText("Break a hash.", 44 * s, 80 * s);
  g.fillStyle = "rgba(244,234,214,0.8)";
  fitText(g, "HashSmash is an open challenge: find collisions in reduced-round SHA-256, SHA3-256, BLAKE3 and Orchard's Poseidon. Every attack is judged; the frontier is public.", 44 * s, 178 * s, W - 88 * s, 170 * s, sans(400), [Math.round(28 * s), Math.round(24 * s)], 1.35);
  g.fillStyle = "#f0b429";
  g.font = mono(800)(Math.round(34 * s));
  g.fillText("yukon.org/hashsmash  →", 44 * s, 392 * s);
  g.fillStyle = DIM;
  fitText(g, "Data: HashSmash by Yukon (Eigen Labs) with Shielded Labs, Zcash, Project Eleven and the Ethereum Foundation. Read live every two minutes.", 44 * s, 470 * s, W - 88 * s, 110 * s, sans(500), [Math.round(19 * s), Math.round(17 * s)], 1.35);
  g.textBaseline = "alphabetic";
}

// ---- info panels -------------------------------------------------------------------------------------

const link = (u: string | null, t: string) => (u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t));

function frontierInfo(fam: HsFamily | null): PickInfo | null {
  if (!fam) return { eyebrow: "HashSmash Hall", title: "HashSmash", body: "<p>Reading HashSmash…</p>", link: { href: HS_SITE, label: "yukon.org/hashsmash" } };
  const rows = [...fam.frontier]
    .reverse()
    .map((p) => `<p><b>${p.rounds} rounds · ${esc(pow2(p.time))}</b> · ${esc(statusOf(p.status).label)}<br>${link(p.profile, p.solver)} <span style="opacity:.6">· ${esc(ago(p.updated))}</span></p>`)
    .join("");
  return {
    eyebrow: fam.zcash ? "HashSmash Hall · Zcash's own hash" : "HashSmash Hall",
    title: fam.label,
    tag: fam.deepest ? [`${fam.deepest} of ${fam.full} rounds broken`, "warn"] : ["unbroken", "ok"],
    stats: [
      ["Attacks", String(fam.submissions)],
      ["In review", String(fam.review)],
      ["Accepted", String(fam.accepted)],
      ["Margin", `${fam.full - (fam.deepest ?? 0)} rounds`],
    ],
    body: `<p>${esc(fam.note)}</p><p style="opacity:.75">The frontier: the attacks nobody beats on both counts (more rounds, less work).</p>${rows || "<p>No attack on the frontier yet.</p>"}`,
    link: { href: `${HS_SITE}?algorithm=${encodeURIComponent(fam.id)}`, label: "See it on HashSmash" },
  };
}

function solversInfo(list: HsSolver[]): PickInfo {
  return {
    eyebrow: "HashSmash Hall · live",
    title: "The solvers",
    body: list.length
      ? list.map((v, i) => `<p><b>${i + 1}. ${link(v.profile, v.solver)}</b> · ${v.accepted} accepted · ${v.review} in review · ${v.submissions} sent${v.best ? `<br><span style="opacity:.7">${esc(v.best.label)} · ${v.best.rounds}/${v.best.full} rounds · ${esc(pow2(v.best.time))}</span>` : ""}</p>`).join("")
      : "<p>Reading HashSmash…</p>",
    link: { href: HS_SITE, label: "yukon.org/hashsmash" },
  };
}

function latestInfo(list: HsPoint[]): PickInfo {
  return {
    eyebrow: "HashSmash Hall · live",
    title: "Submissions",
    body: list.length
      ? list
          .slice(0, 20)
          .map((p) => `<p><b>${link(p.profile, p.solver)}</b> · <span style="color:${statusOf(p.status).color}">${esc(statusOf(p.status).label)}</span><br><span style="opacity:.7">${esc(LABELS[p.family] ?? p.family)}${p.rounds != null ? ` · ${p.rounds} rounds` : ""}${p.time != null ? ` · ${esc(pow2(p.time))}` : ""} · ${esc(ago(p.updated))}</span></p>`)
          .join("")
      : "<p>Reading HashSmash…</p>",
    link: { href: HS_SITE, label: "yukon.org/hashsmash" },
  };
}
