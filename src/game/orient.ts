/**
 * Which way a phone is held, screen by screen (the user's rule):
 * - a game's own screens: as each asks (orient(), below);
 * - walking the city in first person, and inside the buildings: on its side only;
 * - the city seen from above: either way.
 *
 * Android, in full screen or installed: the screen is locked to that way (Screen Orientation API).
 * iPhone: Safari can't lock it, so a card asks to turn the phone while it is held the wrong way (with
 * a word on the rotation lock, which keeps an iPhone upright). Phones only: a tablet is big enough
 * for every screen either way.
 *
 *   orient("portrait" | "landscape" | "any", { quiet?, leave?: () => void, leaveLabel?: string })
 *   orientRule(() => mode)   // asked four times a second (for a page whose state lives elsewhere)
 */

export type Way = "portrait" | "landscape" | "any";
interface Opts {
  /** Lock only, no card: a screen that turns itself when held the wrong way (BLOCK PARTY's stage). */
  quiet?: boolean;
  /** A way out for whoever can't turn the phone (back to the map). */
  leave?: () => void;
  leaveLabel?: string;
}

const PHONE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600;
const upright = typeof matchMedia === "function" ? matchMedia("(orientation: portrait)") : null;
let want: Way = "any";
let opts: Opts = {};
let card: HTMLElement | null = null;

export function orient(way: Way, o: Opts = {}) {
  if (!PHONE) return;
  const changed = way !== want;
  want = way;
  opts = o;
  if (changed) lock();
  sync();
}

let ruleT: ReturnType<typeof setInterval> | undefined;
/** Follows `rule()` (asked 4× a second): for a page whose state lives elsewhere (the city's walking, its interiors). */
export function orientRule(rule: () => Way, o: Opts = {}) {
  if (!PHONE) return;
  clearInterval(ruleT);
  const tick = () => orient(rule(), o);
  tick();
  ruleT = setInterval(tick, 250);
}

/** Android, full screen or installed: hold the screen that way (elsewhere it throws or does nothing). */
function lock() {
  const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };
  try {
    if (want === "any") so?.unlock?.();
    else Promise.resolve(so?.lock?.(want)).catch(() => {});
  } catch {
    /* not here */
  }
}

/** The card shows while the phone is held the wrong way. */
function sync() {
  const wrong = want !== "any" && !opts.quiet && (want === "portrait") !== !!upright?.matches;
  if (!wrong) {
    card?.remove();
    card = null;
    return;
  }
  if (card && card.dataset.way === want) return;
  card?.remove();
  style();
  card = document.createElement("div");
  card.className = "or-card";
  card.dataset.way = want;
  const side = want === "landscape";
  const ios = /iPhone|iPod/.test(navigator.userAgent);
  card.innerHTML = `<div>
    <svg class="or-ph${side ? " side" : " up"}" viewBox="0 0 64 64" aria-hidden="true"><rect x="20" y="8" width="24" height="44" rx="5"/><rect class="sc" x="23" y="13" width="18" height="32" rx="1.5"/><circle cx="32" cy="48.5" r="1.6"/></svg>
    <b>${side ? "Turn your phone sideways" : "Hold your phone upright"}</b>
    <p>${side ? "This is played in landscape." : "The games menu reads upright."}</p>
    ${side && ios ? `<small>Nothing turns? Switch the rotation lock off in Control Center.</small>` : ""}
    ${opts.leave ? `<button type="button">${opts.leaveLabel ?? "Back"}</button>` : ""}
  </div>`;
  card.querySelector("button")?.addEventListener("click", () => opts.leave?.());
  document.body.append(card);
}
upright?.addEventListener?.("change", sync);
addEventListener("resize", sync);

const CSS = `
.or-card{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:max(20px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left));background:radial-gradient(circle at 50% 40%,rgba(40,24,64,.96),rgba(8,6,14,.99));color:#f2f2f6;font-family:"DotGothic16","JetBrains Mono",monospace;text-align:center;touch-action:none;-webkit-user-select:none;user-select:none}
.or-card>div{display:flex;flex-direction:column;align-items:center;gap:10px;max-width:340px}
.or-card svg{width:92px;height:92px;fill:none;stroke:#f4b728;stroke-width:2.5;margin-bottom:6px}
.or-card svg .sc{fill:rgba(244,183,40,.16);stroke:none}
.or-card svg circle{fill:#f4b728;stroke:none}
.or-card svg.side{animation:or-side 2.4s ease-in-out infinite}
.or-card svg.up{animation:or-up 2.4s ease-in-out infinite}
@keyframes or-side{0%,20%{transform:rotate(0)}50%,80%{transform:rotate(-90deg)}100%{transform:rotate(0)}}
@keyframes or-up{0%,20%{transform:rotate(-90deg)}50%,80%{transform:rotate(0)}100%{transform:rotate(-90deg)}}
.or-card b{font-size:22px;font-weight:400;letter-spacing:.04em;color:#f4b728}
.or-card p{margin:0;font-size:15px;line-height:1.45;color:rgba(242,242,246,.75)}
.or-card small{font-size:13px;line-height:1.4;color:rgba(242,242,246,.55)}
.or-card button{margin-top:8px;min-height:48px;padding:0 22px;border:1.5px solid #f4b728;border-radius:2px;color:#f4b728;background:transparent;font:400 15px "DotGothic16","JetBrains Mono",monospace}
@media (prefers-reduced-motion:reduce){.or-card svg{animation:none!important}}
`;
let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.append(st);
}
