import * as THREE from "three";
import { Market } from "../../data/market";
import type { Block } from "../../data/types";
import { ZScan, links } from "../../data/zscan";
import { makeScene } from "../kit";
import type { Interior, InteriorContext } from "../types";
import { buildBowl } from "./bowl";
import { buildCrowd } from "./crowd";
import { Celebration } from "./fx";
import { HZ, WALK, rng } from "./layout";
import { Match } from "./match";
import { Overlay } from "./overlay";
import { drawJumbo, type BoardState } from "./screens";

/**
 * BLOCK STADIUM (ブロック競技場): Shielded (gold) against Transparent (silver). A two-tier bowl of
 * some fifteen thousand fans round a seven-a-side pitch.
 * - Stands (floor 0): a spot on the walkway between the tiers. The AI plays; the jumbotrons keep
 *   the score of the latest block (its shielded transactions against its transparent ones) and
 *   the last 24 h shielded share; when a block lands the side that won it scores, the crowd jumps
 *   and the wave goes round.
 * - Pitch (floor 1): you are Shielded's number 9. Run into the ball to dribble it where you look,
 *   click or Space to shoot. Goals light up the whole ground.
 */

const SHIELDED_KINDS = new Set(["shielded", "migration", "shielding"]);
const fmt = (n: number) => n.toLocaleString("en-US");

export function buildStadium(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#05060c");
  // floodlit night: little ambient, strong key lights from the masts
  scene.environmentIntensity = 0.14;
  const bowl = buildBowl(scene);
  const crowd = buildCrowd(scene);
  const fx = new Celebration(scene);
  const overlay = new Overlay();
  for (const [x, z, k] of [
    [40, 30, 2.1],
    [-40, -30, 1.7],
    [-45, 35, 0.9],
  ]) {
    const l = new THREE.DirectionalLight("#eef3ff", k);
    l.position.set(x, 50, z);
    scene.add(l);
  }
  const bg = () => {
    const v = ctx.cityView("stadium", 12, 40);
    if (v) scene.background = v;
  };
  bg();

  // fourteen zkSNARKs and a referee, the same squad every visit
  const R = rng(7);
  const ids = Array.from({ length: 15 }, () => 1 + Math.floor(R() * 10000));

  const board: BoardState = { mode: "watch", block: null, match: [0, 0], clock: 0, ratio: undefined, goal: null, now: 0 };
  let floor = 0;
  let lastTick = 0;
  let redraw = 0;
  const inside = () => performance.now() - lastTick < 600;

  const match = new Match(scene, ids, {
    goal(team, you) {
      board.goal = { team, at: board.now, you };
      crowd.goal(team);
      fx.burst(team);
      redraw = 0;
      const sub = board.mode === "watch" ? (board.block ? `BLOCK #${fmt(board.block.height)} · ${board.block.home}–${board.block.away}` : "") : you ? `#9 · ${match.score[0]}–${match.score[1]}` : `${match.score[0]}–${match.score[1]}`;
      if (inside()) overlay.goal(team, sub);
      window.dispatchEvent(new CustomEvent("zstreet:stadium-goal", { detail: { shielded: team === 0, you } }));
    },
    ooh: () => crowd.ooh(),
    net(side, power) {
      const set = bowl.nets[side > 0 ? 1 : 0];
      for (const m of set) m.userData.shake = Math.min(1, power / 12);
    },
  });

  // ---- the real chain: the latest block's score, and every new one ---------------------------
  const apply = (b: Block, live: boolean) => {
    const home = b.txs.filter((t) => SHIELDED_KINDS.has(t.kind)).length;
    const away = b.txs.length - home;
    board.block = { height: b.height, home, away };
    crowd.setHeight(b.height);
    redraw = 0;
    if (!live) return;
    crowd.wave();
    if (home !== away && floor === 0 && inside()) match.blockGoal(home > away ? 0 : 1);
  };
  const h0 = ctx.director.blockHeight;
  if (h0)
    void ZScan.block(h0)
      .then((b) => b && !board.block && apply(b, false))
      .catch(() => {});
  ctx.onBlock(
    (h) =>
      void ZScan.block(h)
        .then((b) => b && apply(b, true))
        .catch(() => {}),
  );
  Market.subscribe(() => (redraw = 0));

  // ---- playing: the pointer and Space shoot, only on the pitch ---------------------------------
  let down: { x: number; y: number } | null = null;
  let camRef: THREE.Camera | null = null;
  const onDown = (e: PointerEvent) => {
    if (e.button === 0 && e.target instanceof HTMLCanvasElement) down = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
    down = null;
    if (moved < 6 && camRef && floor === 1 && inside()) match.shoot(camRef);
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.key === " " || e.key.toLowerCase() === "f") && camRef && floor === 1 && inside() && !/input|textarea|select/i.test((e.target as HTMLElement).tagName)) match.shoot(camRef);
  };
  let listening = false;
  let watchdog = 0;
  const listen = (on: boolean) => {
    if (on === listening) return;
    listening = on;
    if (on) {
      window.addEventListener("pointerdown", onDown);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("keydown", onKey);
      overlay.showBoard(true);
      // leaving the place has no hook: stop listening once the frames stop coming
      watchdog = window.setInterval(() => {
        if (!inside()) listen(false);
      }, 400);
    } else {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      clearInterval(watchdog);
      overlay.dispose();
    }
  };

  const setFloor = (n: number) => {
    floor = n;
    lastTick = performance.now();
    board.mode = n === 1 ? "play" : "watch";
    match.setMode(board.mode);
    listen(n === 1);
    redraw = 0;
  };

  const screens = bowl.screens.map((s) => s.mesh);
  if (import.meta.env.DEV || location.search.includes("debug"))
    (window as unknown as Record<string, unknown>).__stadium = {
      match,
      crowd,
      fx,
      block: (home: number, away: number) => apply({ height: (board.block?.height ?? 3_500_000) + 1, time: Date.now(), size: 0, fees: 0, pool: null, txs: [...Array(home).fill({ kind: "shielded" }), ...Array(away).fill({ kind: "transparent" })] }, true),
    };
  const api: Interior = {
    key: "stadium",
    title: "BLOCK STADIUM",
    scene,
    floors: [
      { label: "S", name: "Stands · the match, live with every block", y: WALK.y, spawn: new THREE.Vector3(0, WALK.y, HZ + WALK.d0 + 0.85), yaw: 0 },
      { label: "P", name: "Pitch · play for Shielded", y: 0, spawn: new THREE.Vector3(-2, 0, 20.3), yaw: -0.75 },
    ],
    colliders: (f) => bowl.rects[f],
    setFloor,
    pickables: () => (floor === 0 ? [...screens, ...match.pickables()] : []),
    pick(hit) {
      if (screens.includes(hit.object as THREE.Mesh)) {
        const b = board.block;
        const r = Market.state.network?.shielded_tx_ratio_24h;
        return {
          eyebrow: "BLOCK STADIUM · JUMBOTRON",
          title: b ? `Block #${fmt(b.height)}` : "BLOCK STADIUM",
          mono: true,
          tag: b ? (b.home > b.away ? ["Shielded win", "ok"] : b.home < b.away ? ["Transparent win", "warn"] : ["Draw", "muted"]) : undefined,
          stats: [
            ["Shielded", b ? String(b.home) : "—"],
            ["Transparent", b ? String(b.away) : "—"],
            ["24 h shielded", r !== undefined ? `${(r * 100).toFixed(1)}%` : "—"],
          ],
          link: b ? { href: links.block(b.height), label: "Block on ZScan" } : undefined,
        };
      }
      const p = match.playerOf(hit.object);
      if (!p) return null;
      return {
        eyebrow: `${p.team === 0 ? "SHIELDED" : "TRANSPARENT"} · #${p.f.num}`,
        title: `zkSNARK #${p.f.id}`,
        mono: true,
        image: ZScan.zkSnarkImage(p.f.id),
        tag: [p.role, p.team === 0 ? "ok" : "muted"],
        stats: [
          ["Team", p.team === 0 ? "Shielded" : "Transparent"],
          ["Goals", String(p.goals)],
        ],
      };
    },
    hover(hit) {
      if (screens.includes(hit.object as THREE.Mesh)) return board.block ? `Block #${fmt(board.block.height)} · ${board.block.home}–${board.block.away}` : "Jumbotron";
      const p = match.playerOf(hit.object);
      return p ? `zkSNARK #${p.f.id} · ${p.team === 0 ? "Shielded" : "Transparent"} #${p.f.num}` : null;
    },
    update(dt, t, camera) {
      if (!inside() && floor === 1) listen(true);
      lastTick = performance.now();
      camRef = camera;
      board.now += dt;
      bowl.tick(dt, t);
      crowd.tick(dt, t, camera);
      fx.tick(dt);
      match.update(dt, camera);
      // the nets shiver after a goal
      for (const set of bowl.nets)
        for (const m of set) {
          const s = (m.userData.shake as number) ?? 0;
          if (s > 0.001) {
            m.userData.shake = s * Math.exp(-dt * 4);
            const rest = m.userData.rest as THREE.Vector3;
            m.position.set(rest.x + Math.sin(board.now * 40) * 0.05 * s, rest.y, rest.z + Math.cos(board.now * 33) * 0.04 * s);
          }
        }
      board.match = match.score;
      board.clock = match.clock;
      board.ratio = Market.state.network?.shielded_tx_ratio_24h;
      if (floor === 1) overlay.setScore(match.score[0], match.score[1], match.clock);
      // the jumbotrons: 10 fps while a goal flashes, otherwise once a second
      redraw -= dt;
      const goalOn = board.goal && board.now - board.goal.at < 6;
      if (redraw <= 0) {
        for (const s of bowl.screens) {
          drawJumbo(s.g, board);
          s.t.needsUpdate = true;
        }
        redraw = goalOn ? 0.1 : 1;
      }
    },
    setTheme: () => bg(),
  };
  return api;
}
