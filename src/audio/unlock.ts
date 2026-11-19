/**
 * Sound on a phone, on by default. Two things kept it silent on an iPhone:
 * - Safari lets a page's audio start only inside a gesture that counts: a finger lifted, a click, a
 *   key. A finger landing (pointerdown) does not, and that is where the city and the games woke it.
 * - An iPhone on silent mutes web audio, unless the page says it plays (an audio session of type
 *   "playback", Safari 17).
 * So every AudioContext the page makes is tracked, and every counting gesture wakes the sleeping ones
 * (with a blank sample started inside it, which older iOS asks for). A hidden page is put to sleep
 * and woken when it comes back. This loads first on every page: its own <script>, before the app's.
 */
type AC = typeof AudioContext;
const all = new Set<AudioContext>();
const w = window as unknown as { AudioContext?: AC; webkitAudioContext?: AC; __audioTracked?: boolean };
const Native = w.AudioContext ?? w.webkitAudioContext;
if (Native && !w.__audioTracked) {
  w.__audioTracked = true;
  class Tracked extends Native {
    /** The page put it to sleep itself (its sound switched off): a gesture leaves it so. */
    byPage = false;
    constructor(o?: AudioContextOptions) {
      super(o);
      all.add(this);
    }
    override suspend() {
      this.byPage = true;
      return super.suspend();
    }
    override resume() {
      this.byPage = false;
      return super.resume();
    }
  }
  w.AudioContext = Tracked;
  if (w.webkitAudioContext) w.webkitAudioContext = Tracked;
}
try {
  const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (s) s.type = "playback";
} catch {
  /* not this browser */
}

/** Contexts put to sleep because the page was hidden (woken when it is seen again). */
const slept = new Set<AudioContext>();
function wake() {
  for (const c of all) {
    if (c.state === "running" || c.state === "closed") continue;
    // (a context the page itself suspended, for its silence, stays as it is)
    if ((c as AudioContext & { byPage?: boolean }).byPage) continue;
    c.resume().catch(() => {});
    try {
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
    } catch {
      /* closed meanwhile */
    }
  }
}
for (const t of ["touchend", "pointerup", "click", "keydown"]) addEventListener(t, wake, { capture: true, passive: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    for (const c of all)
      if (c.state === "running") {
        slept.add(c);
        c.suspend().catch(() => {});
      }
  } else {
    for (const c of slept) c.resume().catch(() => {});
    slept.clear();
  }
  // (back from another app: iOS may have left a context "interrupted"; the next gesture wakes it too)
});
// (the bench: the contexts' states)
if (import.meta.env?.DEV) (window as unknown as { __audio: () => string[] }).__audio = () => [...all].map((c) => c.state);
