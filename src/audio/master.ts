/**
 * The page's one sound switch (the HUD's sound button): the city's soundscape, the hunt's chimes,
 * the battle royale and the street's steps and doors, the bells and tunes inside the buildings all
 * ask it before making a sound. On unless it was switched off (the browser still waits for a first
 * click or key before any sound can start).
 */
type Watch = (on: boolean) => void;
const watchers = new Set<Watch>();
let on = true;
try {
  on = localStorage.getItem("street.sound") !== "0";
} catch {}

export const master = {
  get on() {
    return on;
  },
  set(v: boolean) {
    if (v === on) return;
    on = v;
    try {
      localStorage.setItem("street.sound", v ? "1" : "0");
    } catch {}
    for (const w of watchers) w(v);
  },
  /** Called now and on every change. */
  watch(w: Watch) {
    watchers.add(w);
    w(on);
    return () => watchers.delete(w);
  },
};
