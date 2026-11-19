/**
 * table.html: a Game House table on its own page, the way a phone plays it (src/game/solo.ts):
 * `?t=<key>` (barons, glyph, holdem). Leaving the table's panel goes back to the city's Game House.
 */
import { openTable } from "./launcher";
import { noZoom } from "../game/nozoom";
import { backToCity } from "../game/solo";
import { profile } from "../game/profile";
import { phoneFullscreen } from "../game/fullscreen";

// a double tap or a pinch must never zoom a game off the screen (iPhone Safari)
noZoom();

const key = new URLSearchParams(location.search).get("t") ?? "";
const say = document.getElementById("say")!;
let sayT: ReturnType<typeof setTimeout> | undefined;
profile.checkIn();
phoneFullscreen();
openTable(key, {
  panel: (on) => void (on || backToCity()),
  game: () => {},
  say(html) {
    say.innerHTML = html;
    say.classList.add("on");
    clearTimeout(sayT);
    sayT = setTimeout(() => say.classList.remove("on"), 3200);
  },
});
