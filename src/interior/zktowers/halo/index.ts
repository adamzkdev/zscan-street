import type { Interior, InteriorContext } from "../../types";
import { SkyKit, type Level } from "../kit";
import { helipad } from "./helipad";
import { lobby } from "./lobby";
import { lounge } from "./lounge";
import { trading } from "./trading";

/**
 * ZK TOWER HALO, Wall Street's twisted glass tower: the white stone lobby under its spiralling
 * ceiling and the live chart wall, the trading floor on 10 (rows of desks, the video wall, the
 * tape, the bell), the VIP lounge on 25 (walnut, leather, the bar, the piano, the booths) and the
 * helipad on the roof, its helicopter flying a loop over the city. Only the floor you are on is
 * drawn, lit and animated.
 */
export const LEVELS: Level[] = [
  { label: "G", name: "Lobby · chart wall, spiral atrium", y: 0, spawn: [0, -2.2], yaw: 0, view: 2 },
  { label: "10", name: "Trading floor · ZEC desk, video wall", y: 40, spawn: [-15.6, -7], yaw: -Math.PI / 2, view: 40 },
  { label: "25", name: "VIP lounge · bar, piano, booths", y: 100, spawn: [-11.6, -7], yaw: -Math.PI / 2, view: 100 },
  { label: "H", name: "Helipad · roof, HALO-1", y: 136, spawn: [0, -0.4], yaw: 0, view: 138 },
];
export const F = { lobby: 0, trading: 1, lounge: 2, helipad: 3 } as const;
/** Metres from the street door back to the tower's axis (the panoramas' point). */
const BACK = 17;

export function buildHalo(ctx: InteriorContext): Interior {
  const k = new SkyKit(ctx, LEVELS, "ZK TOWER HALO", { bg: "#05070c" });
  k.scene.environmentIntensity = 0.32;
  lobby(k);
  trading(k);
  lounge(k);
  helipad(k);
  return k.interior("tower-halo", BACK);
}
