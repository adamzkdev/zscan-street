/**
 * party.html: ZK PARTY on its own page, the way a phone plays it (src/game/solo.ts). The hall
 * opens on the tab or the mini-game the city asked for (`?tab=`, `?game=`), or into an online
 * room (`?room=CODE`, the link a friend shared); closing it goes back to the city, into the place
 * it was opened from.
 */
import { openParty } from "./index";
import { noZoom } from "../game/nozoom";
import { backToCity } from "../game/solo";
import { profile } from "../game/profile";
import { phoneFullscreen } from "../game/fullscreen";

// a double tap or a pinch must never zoom a game off the screen (iPhone Safari)
noZoom();

const q = new URLSearchParams(location.search);
const TABS = ["board", "quick", "practice", "tour"] as const;
const tab = TABS.find((t) => t === q.get("tab"));
// (a visit that starts here still gets its day's chips, as the city gives them)
profile.checkIn();
phoneFullscreen();
openParty({ shown: (on) => void (on || backToCity()) }, tab, q.get("game") ?? undefined, q.get("room") ?? undefined);
