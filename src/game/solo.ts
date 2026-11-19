/**
 * On a phone or a tablet, ZK PARTY and the table games run on a page of their own (party.html,
 * table.html) instead of over the city. The city's world on the GPU plus a game's second WebGL
 * context is more than iOS lets a tab hold: Safari kills the tab and reloads the city ("a problem
 * repeatedly occurred"). So the city goes away, the game gets the whole page, and "back" builds the
 * city again inside the place you came from. The profile (chips, XP, missions) is in localStorage,
 * which both pages share. `?inplace` on the city keeps the old way, over the city, for tests.
 */
const Q = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();

/** Games leave the city for their own page. */
export const SOLO = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches && !Q.has("inplace");

/**
 * The game page's address (`party.html` or `table.html`). `place` is the walk-in place you are in
 * (the Game House), so the way back lands there; `back` says more (its floor, or on foot the spot:
 * `foot=x,z,heading`).
 */
export function soloUrl(page: "party" | "table", params: Record<string, string | undefined>, place?: string, back: Record<string, string> = {}) {
  const ret = new URLSearchParams(location.search);
  ret.delete("interior");
  ret.delete("floor");
  ret.delete("foot");
  if (place) ret.set("interior", place);
  for (const [k, v] of Object.entries(back)) if (k === "floor" ? place : true) ret.set(k, v);
  const s = ret.toString();
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  q.set("ret", `/${s ? `?${s}` : ""}`);
  return `/${page}.html?${q}`;
}

/** Back to the city, where the visitor came from (only a path on this site: never another one). */
export function backToCity() {
  const r = new URLSearchParams(location.search).get("ret") ?? "/";
  location.replace(r.startsWith("/") && !r.startsWith("//") ? r : "/");
}
