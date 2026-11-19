/**
 * ZK PARTY in the city: how the street opens the game hall and the GAME HOUSE's tables, kept apart
 * from main.ts (which only hands over its hooks). Nothing of the party's code is loaded until the
 * first PLAY: the hall (./index) and the tables' launcher (../tables/launcher) come by dynamic import.
 *
 * - PLAY: a button at the foot of the map's rail, in the HUD's own pixel-icon language (a Z-Block),
 *   and the P key from anywhere in the city (not while typing, not under an open panel).
 * - The ZK TOWER arcade's ZK PARTY cabinets and the GAME HOUSE's wall, desk and board corner open
 *   the hall through a place's pick (PickInfo.party / partyGame), its tables through PickInfo.table.
 * - On a touch screen the hall and the tables run on their own pages (party.html, table.html), so
 *   the city's world and a game's are never in memory together (iPhone): game/solo.ts.
 * - The city sleeps under the hall (cityPaused, its UI hidden, its sound stopped and given back).
 * - A level reached or a mission done while in the city: a line on the game HUD that opens the hall.
 */
import { SOLO, soloUrl } from "../game/solo";
import { progress } from "../game/progress";

export interface CityHooks {
  /** The city pauses (its frame loop, its UI) while a game covers it. */
  pause(on: boolean): void;
  /** Whether the city's sound is playing now; stop it; start it again. */
  soundOn(): boolean;
  soundStop(): void;
  soundStart(): void;
  /** The walk-in place the visitor is in (its key), if any: a phone comes back to it. */
  place(): string | null;
  /** Give the controls back to where the visitor was (inside, on foot, the map), or take them. */
  controls(on: boolean): void;
  /** A line on the game HUD (with a click). */
  say(html: string, onClick?: () => void): void;
  /** The Block Casino (game/casino.ts). */
  casino?(): void;
  /** Something else covers the city (a game of its own): no hall over it. */
  busy?(): boolean;
}

export type PartyTab = "board" | "quick" | "practice" | "tour";

let hooks: CityHooks | null = null;
let partyUp = false;
let tableUp = false;

/** Whether the hall or a table is up over the city. */
export const partyOpen = () => partyUp || tableUp;

/**
 * The hall: `tab` its card ("tour": the tournament's setup); `game` a mini-game to open the
 * selection on ("*": the selection itself).
 */
export function openPartyHall(tab?: PartyTab, game?: string) {
  const h = hooks;
  if (!h || partyUp || tableUp || h.busy?.()) return;
  if (SOLO) return void location.assign(soloUrl("party", { tab, game }, h.place() ?? undefined));
  if (document.pointerLockElement) document.exitPointerLock();
  partyUp = true;
  h.controls(false);
  let wasSound = false;
  void import("./index").then(
    (m) =>
      m.openParty(
        {
          shown(on) {
            partyUp = on;
            h.pause(on);
            if (on) {
              h.controls(false);
              wasSound = h.soundOn();
              if (wasSound) h.soundStop();
            } else {
              h.controls(true);
              if (wasSound) h.soundStart();
            }
          },
          casino: h.casino,
          table: (key) => openTableGame(key),
        },
        tab,
        game,
      ),
    () => {
      // (the hall's code did not come: offline, a new release)
      partyUp = false;
      h.controls(true);
    },
  );
}

/** A GAME HOUSE table (its key in src/tables): the launcher, then the game over the sleeping city. */
export function openTableGame(key: string) {
  const h = hooks;
  if (!h || partyUp || tableUp || h.busy?.()) return;
  if (SOLO) return void location.assign(soloUrl("table", { t: key }, h.place() ?? undefined));
  if (document.pointerLockElement) document.exitPointerLock();
  tableUp = true;
  h.controls(false);
  let wasSound = false;
  void import("../tables/launcher").then(
    (m) =>
      m.openTable(key, {
        panel(on) {
          tableUp = on;
          h.controls(!on);
        },
        game(on) {
          h.pause(on);
          if (on) {
            wasSound = h.soundOn();
            if (wasSound) h.soundStop();
          } else if (wasSound) h.soundStart();
        },
        say: (html) => h.say(html),
      }),
    () => {
      tableUp = false;
      h.controls(true);
    },
  );
}

/** A Z-Block in the HUD's pixel-icon grid (# the colour, d its shade, o a highlight, k ink). */
const ZBLOCK = ["............", ".##########.", ".#oooooooo#d", ".#o######o#d", ".#oooo#ooo#d", ".#ooo#oooo#d", ".#oo#ooooo#d", ".#o######o#d", ".#oooooooo#d", ".##########d", "..dddddddddd", "............"];
function zblockIcon() {
  const paint: Record<string, string> = { "#": `fill="currentColor"`, d: `fill="currentColor" opacity=".55"`, o: `fill="#141219"` };
  const d: Record<string, string> = {};
  ZBLOCK.forEach((r, y) => [...r].forEach((c, x) => paint[c] && (d[c] = (d[c] ?? "") + `M${x} ${y}h1v1h-1z`)));
  return `<svg class="px" viewBox="0 0 12 12" shape-rendering="crispEdges">${Object.entries(d)
    .map(([c, p]) => `<path ${paint[c]} d="${p}"/>`)
    .join("")}</svg>`;
}

/** Wire the party into the city: the rail's PLAY, the P key, the news from the hall. Once. */
export function wireParty(h: CityHooks) {
  if (hooks) return;
  hooks = h;
  // PLAY at the foot of the rail (the HUD builds the rail once; it may come a moment later)
  const addPlay = () => {
    const rail = document.querySelector<HTMLElement>("#ui .rail");
    if (!rail) return false;
    if (rail.querySelector("[data-act=party]")) return true;
    const sep = document.createElement("i");
    const b = document.createElement("button");
    b.dataset.act = "party";
    b.className = "party";
    b.title = "ZK PARTY · mini-games (P)";
    b.setAttribute("aria-label", "ZK PARTY");
    b.innerHTML = zblockIcon();
    b.style.color = "#ffd23f";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      openPartyHall();
    });
    rail.append(sep, b);
    // (its dot: a finished mission waits in the hall; a neon pixel, like the street's signs)
    if (!document.getElementById("zkp-rail-css")) {
      const st = document.createElement("style");
      st.id = "zkp-rail-css";
      st.textContent = `#ui .rail [data-act=party]{position:relative}#ui .rail [data-act=party].has-news::after{content:"";position:absolute;top:5px;right:5px;width:6px;height:6px;background:#ff3e8a;box-shadow:0 0 6px #ff3e8a}`;
      document.head.append(st);
    }
    // a dot when a finished mission waits in the hall
    const dot = () => b.classList.toggle("has-news", progress.ready > 0);
    progress.on(dot);
    dot();
    return true;
  };
  if (!addPlay()) {
    const t = setInterval(() => addPlay() && clearInterval(t), 500);
    setTimeout(() => clearInterval(t), 30_000);
  }
  // P opens it from anywhere in the city
  window.addEventListener("keydown", (e) => {
    if (e.code !== "KeyP" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || partyUp || tableUp) return;
    if ((e.target as HTMLElement).closest?.("input,textarea,select,[contenteditable]") || document.querySelector("#ui .panel.open, #ui .arcade.open, .ar.open")) return;
    e.preventDefault();
    openPartyHall();
  });
  // the hall's news in the city: a level reached, a mission done (claimed in the hall)
  progress.on((e) => {
    if (partyUp) return;
    if (e.kind === "level") h.say(`<b>LEVEL ${e.level}</b> · ZK PARTY · +ⓩ ${e.prize}`, () => openPartyHall());
    else if (e.kind === "mission") h.say(`<b>MISSION DONE</b> · ${e.m.title} · ⓩ ${e.m.prize}`, () => openPartyHall());
  });
}
