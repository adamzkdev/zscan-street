import type { Interior, InteriorContext } from "../types";
import { SkyKit } from "../zktowers/kit";
import { clock } from "./clock";
import { deck } from "./deck";
import { hall } from "./hall";
import { observatory } from "./observatory";
import { pit } from "./pit";
import { LEVELS, Nu7Live } from "./shared";
import { vault } from "./vault";

/**
 * The NU7 TOWER, walked in from its doors on the NU7 quarter's plaza (or a click on the tower):
 * G NU7 HALL (the activation monument, the 25 s era), P PIT GARAGE (karts, RACE the NU7 GRAND
 * PRIX), 7 NSM VAULT (the fees burned block by block), 25 the 25-SECOND CLOCK, 35 the HALVING
 * OBSERVATORY, R the SKY DECK. Everything on its boards is read live from the ZScan API while
 * someone is inside; the windows look onto the real city from the floor's own height.
 */

/** Metres from the street door back to the tower's axis (the panoramas' point). */
const BACK = 8.4;

export function buildNu7Tower(ctx: InteriorContext): Interior {
  const k = new SkyKit(ctx, LEVELS, "NU7 TOWER", { bg: "#07050c" });
  k.scene.environmentIntensity = 0.32;
  const live = new Nu7Live(ctx);
  hall(k, live);
  pit(k, live);
  vault(k, live);
  clock(k, live);
  observatory(k, live);
  deck(k, live);
  const interior = k.interior("nu7tower", BACK, (n) => {
    live.floor = n;
    live.touch();
  });
  const update = interior.update;
  interior.update = (dt, t, camera) => {
    live.tick(k);
    update(dt, t, camera);
  };
  return interior;
}
