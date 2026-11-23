/**
 * The GAMEPARTY mini-games (minigames/games/, 50 of them) in ZK PARTY, played by zkSNARKs.
 *
 * Each becomes a ZK PARTY `MiniDef` (../kit.ts): the hall lists it, the host (../host.ts) plays it
 * from its card to its podium, the board and the tournaments draw it. Its code loads when it is
 * first played (`load()`, awaited by the host before `make()`). The adapter maps:
 * - the players: ZK PARTY's seats (you are seat 0) → the game's players, each a zkSNARK in its seat's
 *   colour (shared/chars.ts, the voxel bodies of engine/chars3d.ts); a 1-vs-3 game draws its solo
 *   seat, a 2-vs-2 game pairs you with a rival drawn by the seed (as Z-BALL CUP does), a duel plays
 *   the first two seats it is given (the hall gives it you and one rival);
 * - the input: the device's keys and touch pad (`Input`) → the game's pad (stick, A, B);
 * - its HTML HUD: a layer over the 3D, inside the stage (it turns with it on a phone held upright),
 *   sized in the stage's units;
 * - the result: places (ties shared) → the finishing order ZK PARTY pays on.
 *
 * Not online: these games draw from Math.random for their AIs, and an online board must be the same
 * on every client (`net: false`).
 */
import "./gp.css";
import { SEAT, SEAT_DARK, type Btn, type Input, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { GP_TEXT, type GpText } from "./text";
import type { MiniDef as GpDef, MiniGame, MiniMode, MiniPlayer } from "./minigames/types";
import { Hud } from "./engine/hud";
import { VIEWPORT } from "./engine/gfx";
import { music as gpMusic, unlockAudio } from "./engine/audio";
import { NEUTRAL, type PadState } from "./engine/input";
import { snarkChar } from "./shared/chars";

const loaders = import.meta.glob<{ default: GpDef }>("./minigames/games/*.ts");
const defs = new Map<string, GpDef>();

/** The heavy type the games paint on their 3D signs (gp.css), ready before they paint. */
let fonts: Promise<unknown> | null = null;
const loadFonts = () => (fonts ??= Promise.all([document.fonts?.load('80px "ZP Title"'), document.fonts?.load('40px "ZP UI"')]).catch(() => {}));

async function loadDef(id: string): Promise<GpDef> {
  await loadFonts();
  const have = defs.get(id);
  if (have) return have;
  const l = loaders[`./minigames/games/${id}.ts`];
  if (!l) throw new Error(`gameparty: no game ${id}`);
  const d = (await l()).default;
  defs.set(id, d);
  return d;
}

/** What each game's pad has: s the stick, a and b the buttons, m a game you mash (a tap is A). */
const CTL: Record<string, string> = {
  aviron: "a", "beach-volley": "sab", "barre-tournante": "sab", "bataille-eau": "sab", bobsleigh: "sa", "bowling-geant": "sa", chars: "sa", bonneteau: "s",
  "boules-neige": "sab", "bras-de-fer": "abm", "corde-a-sauter": "a", canonnier: "sa", "chaises-musicales": "sa", "chasse-fantomes": "sa", escrime: "sab",
  "coffre-fort": "sa", "compte-moutons": "s", "couleur-express": "sa", labyrinthe: "s", danse: "s4", "duel-western": "a", golf: "sa", "memoire-chef": "s4",
  "gonfle-ballon": "am", "grand-prix": "sa", "le-chasseur": "sa", "lave-montante": "sa", luge: "sa", patinoire: "sa", paires: "sa", "mini-foot": "sab",
  "patate-chaude": "sa", plongee: "sa", pinata: "sam", peche: "a", "ping-pong": "sa", repeins: "sa", "pluie-pieces": "sa", "pluie-meteores": "sa",
  "pont-fragile": "sa", sprint: "ab", "sumo-bouncy": "sa", "rocher-roulant": "sa", "stand-tir": "sa", "tir-corde": "abm", "tour-crepes": "a",
  "taupe-folie": "sa", "tirs-au-but": "sa", "un-deux-trois-soleil": "sa", trappes: "sa",
};

/** The bench's clean frames (partylab.html?…&nohud, the thumbnails): no HUD over the 3D. */
const NOHUD = typeof location !== "undefined" && /partylab/.test(location.pathname) && new URLSearchParams(location.search).has("nohud");

/** Its game's music, when the file asks for none (the GAMEPARTY default). */
const DEFAULT_SONG = "mini";

/** The stage's HTML layer for one game's HUD, laid over its 3D (the stage's own units). */
class HudLayer {
  readonly el: HTMLDivElement;
  private gl: HTMLCanvasElement | null;
  private w = 0;
  private h = 0;

  constructor() {
    this.el = document.createElement("div");
    // (a touch screen: the thumbs hold the bottom corners, the pause key the top right)
    const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    this.el.className = `gp-hud gp-off${touch ? " gp-touch" : ""}`;
    const stage = document.querySelector<HTMLElement>(".pt-stage");
    this.gl = stage?.querySelector<HTMLCanvasElement>(".pt-gl") ?? null;
    const top = stage?.querySelector(".pt-canvas") ?? null;
    if (stage) stage.insertBefore(this.el, top);
    else document.body.append(this.el);
    this.fit();
  }

  /** Over the 3D canvas, its size; 1 u = 1 % of a 16:9 frame's width within it. */
  fit() {
    const w = this.gl?.offsetWidth || this.el.parentElement?.clientWidth || innerWidth;
    const h = this.gl?.offsetHeight || this.el.parentElement?.clientHeight || innerHeight;
    VIEWPORT.w = w;
    VIEWPORT.h = h;
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.el.style.width = `${w}px`;
    this.el.style.height = `${h}px`;
    this.el.style.setProperty("--u", `${Math.min(w / 100, h / 56.25).toFixed(3)}px`);
  }

  show(on: boolean) {
    this.el.classList.toggle("gp-off", !on || NOHUD);
  }

  dispose() {
    this.el.remove();
  }
}

/** The seats in the game's order (its player i is ZK PARTY's seat `order[i]`), and the teams. */
function lineup(mode: MiniMode, players: Player[], rnd: Rnd): { order: number[]; team: number[] } {
  const seats = players.map((p) => p.seat);
  const me = Math.max(0, players.findIndex((p) => p.human));
  if (mode === "duel") {
    if (players.length <= 2) return { order: seats.slice(0, 2), team: [0, 1] };
    const others = seats.filter((_, i) => i !== me);
    return { order: [seats[me], others[Math.floor(rnd() * others.length) % others.length]], team: [0, 1] };
  }
  if (mode === "2v2") {
    // (you, or seat 0, with a rival drawn by the seed, against the other two)
    const rest = seats.filter((_, i) => i !== me);
    const mate = rest.splice(Math.floor(rnd() * rest.length) % rest.length, 1)[0];
    return { order: [seats[me], mate, ...rest], team: [0, 0, 1, 1] };
  }
  if (mode === "1v3") {
    // (the solo drawn by the seed: not always you)
    const k = Math.floor(rnd() * seats.length) % seats.length;
    return { order: [seats[k], ...seats.filter((_, i) => i !== k)], team: [0, 1, 1, 1] };
  }
  return { order: seats, team: seats.map((_, i) => i) };
}

/** The device's keys and touch pad as the game's pad. */
class PadReader {
  private a = false;
  private b = false;
  read(input: Input): PadState {
    const ax = input.axis();
    let x = ax.x,
      y = ax.y;
    const l = Math.hypot(x, y);
    if (l > 1) ((x /= l), (y /= l));
    const pa = input.pressed("a"),
      pb = input.pressed("b");
    // (a tap shorter than a frame: pressed, already let go; the game still sees it held this frame)
    const a = input.held("a") || pa,
      b = input.held("b") || pb;
    const s: PadState = { x, y, a, b, aDown: pa || (a && !this.a), bDown: pb || (b && !this.b), aUp: !a && this.a, bUp: !b && this.b };
    this.a = a;
    this.b = b;
    return s;
  }
}

/** One GAMEPARTY game as a ZK PARTY mini-game. */
function adapt(t: GpText): MiniDef {
  const ctl = CTL[t.id] ?? "sa";
  const pad: Btn[] = [...(ctl.includes("s") ? (["left", "right", "up", "down"] as Btn[]) : []), ...(ctl.includes("a") ? (["a"] as Btn[]) : []), ...(ctl.includes("b") ? (["b"] as Btn[]) : [])];
  const def: MiniDef = {
    key: t.key,
    title: t.title,
    titleZh: t.titleZh,
    tag: t.tag,
    tagZh: t.tagZh,
    help: t.help,
    helpZh: t.helpZh,
    pad,
    // (a mashing game, or one with no stick: a tap anywhere is A)
    tap: ctl.includes("m") || !ctl.includes("s"),
    // (a dance, a recipe: each arrow its own button on a touch screen)
    stick: ctl.includes("4") ? false : undefined,
    color: t.color,
    teams: t.mode === "2v2" ? true : undefined,
    seats: t.mode === "duel" ? 2 : undefined,
    genre: t.genre,
    net: false,
    gp: t.mode,
    load: () => loadDef(t.id),
    make(players: Player[], rnd: Rnd): Mini {
      const gd = defs.get(t.id);
      if (!gd) throw new Error(`gameparty: ${t.id} played before it was loaded`);
      return new GpMini(gd, t, players, rnd);
    },
  };
  return def;
}

class GpMini implements Mini {
  private game: MiniGame;
  private layer: HudLayer;
  private hud: Hud;
  private order: number[];
  private reader = new PadReader();
  private pads: PadState[] = [];
  private started = false;
  private done: number[] | null = null;
  private humanIdx: number[];

  constructor(
    private gd: GpDef,
    t: GpText,
    players: Player[],
    rnd: Rnd,
  ) {
    unlockAudio();
    const { order, team } = lineup(t.mode, players, rnd);
    this.order = order;
    const bySeat = new Map(players.map((p) => [p.seat, p]));
    const mps: MiniPlayer[] = order.map((seat, i) => {
      const p = bySeat.get(seat)!;
      return { i, seat: i, char: snarkChar(p.id, p.name, SEAT[seat] ?? p.color, SEAT_DARK[seat] ?? p.dark), name: p.name, cpu: !p.human, level: Math.max(0, Math.min(1, p.skill)), team: team[i] };
    });
    this.humanIdx = mps.filter((p) => !p.cpu).map((p) => p.i);
    this.pads = mps.map(() => NEUTRAL);
    this.layer = new HudLayer();
    this.hud = new Hud(this.layer.el);
    this.game = gd.create({
      players: mps,
      mode: t.mode,
      seed: Math.floor(rnd() * 2 ** 31),
      input: (i) => this.pads[i] ?? NEUTRAL,
      buzz: (_i, ms = 40) => {
        try {
          navigator.vibrate?.(ms);
        } catch {
          /* no vibration here */
        }
      },
      hud: this.hud,
    });
  }

  idle(dt: number, phase: "card" | "count", _k: number) {
    this.layer.fit();
    // (the rules card is drawn over the 3D: the game's HUD waits for the countdown)
    this.layer.show(phase === "count");
    this.game.preview?.(dt);
  }

  update(dt: number, input: Input) {
    this.layer.fit();
    if (this.done) {
      this.game.outro?.(dt);
      return;
    }
    if (!this.started) {
      this.started = true;
      this.layer.show(true);
      this.game.start?.();
      const song = this.gd.music === undefined ? DEFAULT_SONG : this.gd.music;
      if (song) gpMusic.play(song);
    }
    const pad = this.reader.read(input);
    for (const i of this.humanIdx) this.pads[i] = pad;
    this.game.update(Math.min(dt, 1 / 20));
    if (this.game.finished) {
      this.done = this.ranking();
      gpMusic.stop(0.6);
    }
  }

  /** Places (1 first, ties shared) → seats in finishing order; a tie goes to the more coins, then the seed's order. */
  private ranking(): number[] {
    const r = this.game.result();
    const idx = this.order.map((_, i) => i);
    idx.sort((a, b) => (r.place[a] ?? 9) - (r.place[b] ?? 9) || (r.coins?.[b] ?? 0) - (r.coins?.[a] ?? 0) || a - b);
    return idx.map((i) => this.order[i]);
  }

  draw() {}

  result() {
    return this.done;
  }

  view() {
    return { scene: this.game.scene, camera: this.game.camera };
  }

  dispose() {
    gpMusic.stop(0.3);
    this.game.dispose();
    this.hud.dispose();
    this.layer.dispose();
  }
}

/** Every GAMEPARTY game, as ZK PARTY mini-games: the four-player ones (everyone, 1 vs 3, 2 vs 2) and the duels. */
export const GP_GAMES: MiniDef[] = GP_TEXT.map(adapt);
export const GP_PARTY = GP_GAMES.filter((g) => g.gp !== "duel");
export const GP_DUELS = GP_GAMES.filter((g) => g.gp === "duel");
