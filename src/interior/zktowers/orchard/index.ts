import type { Interior, InteriorContext } from "../../types";
import { SkyKit } from "../kit";
import { BACK, LEVELS } from "./levels";
import { lobby } from "./lobby";
import { offices } from "./offices";
import { club } from "./club";
import { deck } from "./deck";

/**
 * ZK TOWER ORCHARD, Midtown's art-deco supertall: the grand lobby in black marble and gold, the
 * trading desks of Orchard Capital on 18, The Nullifier jazz club on 64, and the open-air
 * observatory on 86 under the stainless-steel crown. Only the floor you are on is drawn, lit and
 * animated; every window looks onto the real city.
 */
export function buildOrchard(ctx: InteriorContext): Interior {
  const k = new SkyKit(ctx, LEVELS, "ZK TOWER ORCHARD", { bg: "#08070a" });
  k.scene.environmentIntensity = 0.32;
  lobby(k);
  offices(k);
  club(k);
  deck(k);
  return k.interior("tower-orchard", BACK);
}
