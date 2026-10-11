import type { Built } from "../buildings";
import { emptyLot } from "./lot";
import { stadium } from "./stadium";
import { museum } from "./museum";
import { foodhall } from "./foodhall";
import { reserve } from "./reserve";
import { mall } from "./mall";
import { needle } from "./needle";
import { marina } from "./marina";
import { gardens } from "./gardens";
import { port } from "./port";
import { statue } from "./statue";
import { pyramid } from "./pyramid";
import { eiffel } from "./eiffel";
import { colosseum } from "./colosseum";
import { parliament } from "./parliament";
import { opera } from "./opera";
import { shibuya } from "./shibuya";
import { palm } from "./palm";
import { burjalarab } from "./burjalarab";
import { bridge } from "./bridge";
import { zkorchard } from "./zkorchard";
import { zksapling } from "./zksapling";
import { zkhalo } from "./zkhalo";
import { binhai } from "./binhai";
import { cemetery } from "./cemetery";
import { zodl } from "./zodl";
import { vizor } from "./vizor";
import { noir } from "./noir";
import { zapp } from "./zapp";
import { university } from "./university";

/**
 * The city's landmarks, one builder each. A builder gets its lot in metres: `w` along its front,
 * `d` from the front to the back (the front faces +z in the model, as for every building), and
 * returns a model whose body covers the lot exactly (the pavement round it included), so the plan
 * can drop it in place.
 */
export interface LandmarkOpts {
  kind: LandmarkKind;
  /** Lot width along the front and depth, in metres. */
  w: number;
  d: number;
  /** Walk-in places reuse an interior (`cards`: the gallery, `bank`: the bank). */
  venue?: string;
}

export type LandmarkKind = "stadium" | "museum" | "foodhall" | "reserve" | "mall" | "needle" | "marina" | "gardens" | "port" | "statue" | "prison" | "bridge" | "green" | "pyramid" | "eiffel" | "colosseum" | "parliament" | "opera" | "shibuya" | "palm" | "burjalarab" | "zkorchard" | "zksapling" | "zkhalo" | "binhai" | "cemetery" | "zodl" | "vizor" | "noir" | "zapp" | "university";

type Builder = (seed: number, o: LandmarkOpts) => Built;
const BUILDERS: Partial<Record<LandmarkKind, Builder>> = { stadium, museum, foodhall, reserve, mall, needle, marina, gardens, port, statue, bridge, pyramid, eiffel, colosseum, parliament, opera, shibuya, palm, burjalarab, zkorchard, zksapling, zkhalo, binhai, cemetery, zodl, vizor, noir, zapp, university };

export function landmark(seed: number, o: LandmarkOpts): Built {
  const b = BUILDERS[o.kind];
  return b ? b(seed, o) : emptyLot(o);
}
