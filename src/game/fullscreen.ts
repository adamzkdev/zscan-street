/**
 * Full screen on a phone: the game without the browser's bars.
 *
 * - Android, an iPad: the Fullscreen API, asked on the first touch (a browser grants it only to a
 *   tap), and the landscape locked while a game is played (allowed only in full screen).
 * - iPhone: Safari has no full screen for a page. The way is the Home Screen app (the manifest and
 *   `apple-mobile-web-app-capable`): opened from there, no browser bar at all. A card says how, once
 *   per device; `fullscreenButton()` gives the button that does the one or shows the other.
 */

type Doc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type El = HTMLElement & { webkitRequestFullscreen?: (o?: FullscreenOptions) => Promise<void> };
const doc = document as Doc;

export const TOUCH = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
/** Opened from the Home Screen (or an installed app): already without bars. */
export const STANDALONE =
  (typeof matchMedia === "function" && matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const IPHONE = /iPhone|iPod/.test(navigator.userAgent);
/** The page can go full screen itself (not on an iPhone). */
export const CAN_FULL = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);

export const isFull = () => STANDALONE || !!(doc.fullscreenElement || doc.webkitFullscreenElement);

export function goFull() {
  if (!CAN_FULL || isFull()) return;
  const el = document.documentElement as El;
  const go = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  Promise.resolve(go?.({ navigationUI: "hide" })).catch(() => {});
}

/** The landscape held while a game is played (Android, full screen or installed; elsewhere nothing). */
export function lockLandscape(on: boolean) {
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };
  try {
    if (on) Promise.resolve(o?.lock?.("landscape")).catch(() => {});
    else o?.unlock?.();
  } catch {
    /* not here */
  }
}

/** On a touch screen: full screen on the first touch where the page can, the Home Screen card once on an iPhone. */
export function phoneFullscreen() {
  if (!TOUCH || STANDALONE) return;
  if (CAN_FULL) window.addEventListener("pointerdown", goFull, { once: true, capture: true });
  else if (IPHONE) {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN) === "1";
    } catch {
      /* private mode */
    }
    if (!seen) setTimeout(() => homeScreenCard(), 1600);
  }
}

/** What a full-screen button does here: the page itself ("full"), the Home Screen card ("home"), or nothing (null). */
export function fullscreenWay(): "full" | "home" | null {
  if (!TOUCH || isFull()) return null;
  return CAN_FULL ? "full" : IPHONE ? "home" : null;
}
/** The button's markup (for a header drawn as HTML; `data-a`, the action it calls `fullscreenDo()` for). */
export function fullscreenHtml(cls: string, action: string) {
  if (!fullscreenWay()) return "";
  style();
  return `<button class="fs-btn ${cls}" data-a="${action}" title="Full screen" aria-label="Full screen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>`;
}
export function fullscreenDo() {
  if (fullscreenWay() === "full") goFull();
  else if (fullscreenWay() === "home") homeScreenCard();
}

/** A button for a header: full screen (Android) or the Home Screen card (iPhone); null where there is nothing to do. */
export function fullscreenButton(cls = "") {
  if (!TOUCH || STANDALONE || (!CAN_FULL && !IPHONE)) return null;
  style();
  const b = document.createElement("button");
  b.className = `fs-btn ${cls}`;
  b.type = "button";
  b.title = "Full screen";
  b.setAttribute("aria-label", b.title);
  b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    if (CAN_FULL) goFull();
    else homeScreenCard();
  });
  const sync = () => (b.hidden = isFull());
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);
  sync();
  return b;
}

const SEEN = "street.homescreen.seen";
const CSS = `
.fs-card{position:fixed;inset:0;z-index:10001;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:rgba(6,4,14,.72);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);font-family:"DotGothic16","JetBrains Mono",monospace;color:#f2f2f6;animation:fs-in .25s ease}
@keyframes fs-in{from{opacity:0}}
.fs-card>div{width:min(420px,100%);max-height:100%;overflow:auto;box-sizing:border-box;padding:22px 20px 18px;border-radius:2px;background:rgba(11,9,19,.96);box-shadow:0 0 0 1.5px rgba(255,255,255,.12),0 24px 60px rgba(0,0,0,.6);text-align:center}
.fs-card h3{margin:0 0 6px;font-size:20px;font-weight:400;letter-spacing:.04em;color:#f4b728}
.fs-card p{margin:0 0 14px;font-size:14px;line-height:1.45;color:rgba(242,242,246,.78)}
.fs-card ol{margin:0 0 16px;padding:0;list-style:none;display:grid;gap:8px;text-align:left}
.fs-card li{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:3px;background:rgba(255,255,255,.06);font-size:14px;font-weight:600}
.fs-card li i{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:2px;background:#fff;color:#1a73e8;font-style:normal}
.fs-card li i svg{width:18px;height:18px}
.fs-card button{width:100%;min-height:48px;border:0;border-radius:3px;background:#f4b728;color:#0d0b08;font:400 16px "DotGothic16","JetBrains Mono",monospace;box-shadow:0 4px 0 #8a6206}
.fs-btn{display:grid;place-items:center;width:44px;height:44px;flex:none;padding:0;border:0;border-radius:3px;background:rgba(10,8,26,.6);color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.14)}
.fs-btn svg{width:20px;height:20px}
.fs-btn[hidden]{display:none}
`;
let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.append(st);
}
/** How to get full screen on an iPhone: Share, then Add to Home Screen. */
export function homeScreenCard() {
  if (document.querySelector(".fs-card")) return;
  style();
  try {
    localStorage.setItem(SEEN, "1");
  } catch {
    /* private mode */
  }
  const share = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m0 0L8 7m4-4 4 4"/><path d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/></svg>`;
  const plus = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`;
  const el = document.createElement("div");
  el.className = "fs-card";
  el.innerHTML = `<div role="dialog" aria-modal="true">
    <h3>Play full screen</h3>
    <p>Safari can't hide its bars on an iPhone. Put ZStreet on your Home Screen: it opens full screen, like an app.</p>
    <ol>
      <li><i>${share}</i>Tap Share in Safari's bar</li>
      <li><i>${plus}</i>Then “Add to Home Screen”</li>
    </ol>
    <button type="button">Got it</button>
  </div>`;
  const close = () => el.remove();
  el.querySelector("button")!.addEventListener("click", close);
  el.addEventListener("click", (e) => e.target === el && close());
  document.body.append(el);
}
