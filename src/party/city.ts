/**
 * ZK PARTY in the city: how the street opens the game hall and the GAME HOUSE's tables, kept apart
 * from main.ts (which only hands over its hooks). Nothing of the party's code is loaded until the
 * first PLAY: the hall (./index) and the tables' launcher (../tables/launcher) come by dynamic import.
 *
 * - PLAY: a square button beside the NEWS mailbox, bottom right (a pixel game pad, in the city's
 *   gold), and the P key from anywhere in the city (not while typing, not under an open panel).
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
  /** More of where the visitor is (the floor inside; on foot, the spot): a phone comes back there too. */
  where?(): Record<string, string>;
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
  if (SOLO) return void location.assign(soloUrl("party", { tab, game }, h.place() ?? undefined, h.where?.()));
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
export function openTableGame(key: string, rival?: number) {
  const h = hooks;
  if (!h || partyUp || tableUp || h.busy?.()) return;
  if (SOLO) return void location.assign(soloUrl("table", { t: key }, h.place() ?? undefined, h.where?.()));
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
        rival,
      }),
    () => {
      tableUp = false;
      h.controls(true);
    },
  );
}

/** A game pad in the HUD's pixel-icon grid (# the colour, o the d-pad and the buttons). */
const PAD = ["..############..", ".##############.", "###o#######o####", "##ooo#####o#o###", "###o#######o####", "################", "#####......#####", ".###........###."];
function padIcon() {
  let d = "";
  let o = "";
  PAD.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === "#") d += `M${x} ${y}h1v1h-1z`;
    else if (c === "o") o += `M${x} ${y}h1v1h-1z`;
  }));
  return `<svg class="px" viewBox="0 0 16 8" shape-rendering="crispEdges"><path fill="currentColor" d="${d}"/><path fill="#141219" d="${o}"/></svg>`;
}

/** PLAY's look: the mailbox's square, in the city's gold, its label in the pixel font. */
const PLAY_CSS = `#ui .playbtn{all:unset;position:fixed;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;pointer-events:auto;z-index:46;background:var(--hud);border:1px solid var(--line);border-radius:3px;box-shadow:var(--shadow);backdrop-filter:blur(12px) saturate(1.3);-webkit-backdrop-filter:blur(12px) saturate(1.3);color:var(--gold)}
#ui .playbtn:hover,#ui .playbtn:focus-visible{border-color:var(--gold)}
#ui .playbtn svg.px{width:58%;height:auto}
#ui .playbtn span{font:400 10px/1 var(--pixel);letter-spacing:.12em;color:var(--gold)}
#ui .playbtn.has-news::after{content:"";position:absolute;top:-4px;right:-4px;width:8px;height:8px;background:#ff3e8a;box-shadow:0 0 6px #ff3e8a}
#ui .playbtn[hidden]{display:none}`;

/** Wire the party into the city: PLAY by the mailbox, the P key, the news from the hall. Once. */
export function wireParty(h: CityHooks) {
  if (hooks) return;
  hooks = h;
  // PLAY beside the NEWS mailbox, bottom right, level with the live strip (the game HUD builds the
  // mailbox after the HUD: it may come a moment later). It follows the mailbox wherever the layout
  // puts it: left of it when the strip leaves room (desktop, tablet, phone sideways), over the
  // strip at the right edge when the mailbox sits up top (phone upright), and shows and hides with
  // it (on foot, inside the places).
  const addPlay = () => {
    const ui = document.getElementById("ui");
    const mail = ui?.querySelector<HTMLElement>(".mailbtn");
    if (!ui || !mail) return false;
    if (ui.querySelector(".playbtn")) return true;
    if (!document.getElementById("zkp-play-css")) {
      const st = document.createElement("style");
      st.id = "zkp-play-css";
      st.textContent = PLAY_CSS;
      document.head.append(st);
    }
    const b = document.createElement("button");
    b.className = "playbtn hud";
    b.title = "ZK PARTY · mini-games (P)";
    b.setAttribute("aria-label", "ZK PARTY: play");
    b.innerHTML = `${padIcon()}<span>PLAY</span>`;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      openPartyHall();
    });
    ui.append(b);
    const overlaps = (a: DOMRect, c: DOMRect) => a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;
    const place = () => {
      const cs = getComputedStyle(mail);
      const r = mail.getBoundingClientRect();
      b.hidden = cs.display === "none" || cs.visibility === "hidden" || r.width === 0;
      if (b.hidden) return;
      const gap = 8;
      const size = r.width;
      const strip = ui.querySelector<HTMLElement>(".strip");
      const sr = strip && getComputedStyle(strip).display !== "none" ? strip.getBoundingClientRect() : null;
      let left: number;
      let top: number;
      if (r.top < innerHeight / 2) {
        // the mailbox up top (a phone held upright): PLAY goes where the thumb is, bottom right,
        // just over the live strip
        left = r.left;
        top = (sr && sr.height > 0 ? sr.top : innerHeight - 12) - gap - size;
      } else {
        // the mailbox bottom right: PLAY beside it, level with the strip, unless the strip runs that
        // far (then over the mailbox)
        left = r.left - gap - size;
        top = r.top;
        if (left < gap || (sr && sr.width > 0 && overlaps(new DOMRect(left, top, size, size), sr))) {
          left = r.left;
          top = r.top - gap - size;
        }
      }
      Object.assign(b.style, { left: `${left}px`, top: `${top}px`, width: `${size}px`, height: `${size}px` });
    };
    let queued = false;
    const later = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => ((queued = false), place()));
    };
    place();
    // moved only when the layout does: the window, the HUD's modes (on foot, inside, the fold), the
    // mailbox and the strip (it opens and folds), the fonts arriving
    addEventListener("resize", later);
    new MutationObserver(later).observe(ui, { attributes: true, attributeFilter: ["class"] });
    const sizes = new ResizeObserver(later);
    sizes.observe(mail);
    const strip = ui.querySelector<HTMLElement>(".strip");
    if (strip) sizes.observe(strip);
    void document.fonts?.ready.then(later);
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
