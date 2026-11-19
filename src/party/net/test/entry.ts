/**
 * The lockstep tests headless (bundled by run.mjs for Node and for the `jsc` shell). Reads its suite
 * from globalThis.NETTEST (set by a prelude) and prints one JSON line per result.
 */
import "./stubs";
import { COINS } from "../../games/coins";
import { SUITES, runSuite, type Suite } from "./suite";

declare const print: ((s: string) => void) | undefined;
const out = (o: unknown) => {
  const s = JSON.stringify(o);
  if (typeof print === "function") print(s);
  else console.log(s);
};

const G = globalThis as unknown as { NETTEST?: Suite; NETTEST_MODE?: string };
const S = G.NETTEST ?? SUITES[G.NETTEST_MODE ?? "quick"] ?? SUITES.quick;
runSuite(COINS, S, typeof print === "function" ? "jsc" : "node", out);
