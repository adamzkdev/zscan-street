/**
 * The lockstep test suite, wherever it runs: Node and jsc (entry.ts, bundled by run.mjs) and the
 * bench page (partylab.html?nettest=coins). One JSON-able line per result.
 */
import type { MiniDef } from "../../kit";
import { costRun, runScenario } from "./sim";
import { detCheck } from "./det-check";

export interface Suite {
  /** [clients, levels…] per run. */
  runs: [number, ...string[]][];
  seed: number;
  /** Run the first one twice and compare every checksum. */
  rerun?: boolean;
  /** Also the control run on the engine's own maths. */
  native?: boolean;
  /** Ticks for the cost runs (0: none). */
  cost?: number;
  maxSecs?: number;
  /** Checksums of every bit (not rounded to a millionth). */
  exact?: boolean;
  /** Inputs per function for the maths check (0: none). */
  detcheck?: number;
}

export const SUITES: Record<string, Suite> = {
  // two to four clients, two levels each (about 70 s of play per client count), a rerun, the control, the cost
  full: { seed: 7, runs: [[2, "plaza", "marina"], [3, "marina", "astana"], [4, "astana", "plaza"]], rerun: true, native: true, cost: 1800, detcheck: 200000, exact: true },
  quick: { seed: 7, runs: [[2, "plaza"]], rerun: true, native: true, cost: 600, detcheck: 20000, exact: true },
};

export function runSuite(def: MiniDef, S: Suite, engine: string, out: (o: Record<string, unknown>) => void) {
  let allOk = true;
  for (const [n, ...levels] of S.runs) {
    for (const lv of levels) {
      const r = runScenario({ def, clients: n, seed: S.seed, variant: lv, maxSecs: S.maxSecs, exact: S.exact });
      allOk &&= r.ok;
      out({ engine, test: "lockstep", clients: n, level: r.variant, ok: r.ok, simSecs: r.simSecs, digest: r.digest, hashes: r.log.length, messages: r.messages, problems: r.problems, clientsReport: r.clients });
    }
  }
  if (S.rerun) {
    const [n, lv] = S.runs[0];
    const a = runScenario({ def, clients: n, seed: S.seed + 1, variant: lv, maxSecs: S.maxSecs, exact: S.exact });
    const b = runScenario({ def, clients: n, seed: S.seed + 1, variant: lv, maxSecs: S.maxSecs, exact: S.exact });
    const same = a.log.length === b.log.length && a.log.every(([t, h], i) => b.log[i][0] === t && b.log[i][1] === h);
    allOk &&= same && a.ok && b.ok;
    out({ engine, test: "rerun", clients: n, level: lv, same, hashes: a.log.length, digestA: a.digest, digestB: b.digest });
  }
  if (S.native) {
    const [n, lv] = S.runs[0];
    const r = runScenario({ def, clients: n, seed: S.seed, variant: lv, maxSecs: S.maxSecs, native: true, exact: S.exact });
    out({ engine, test: "native-control", clients: n, level: lv, ok: r.ok, digest: r.digest, hashes: r.log.length });
  }
  if (S.cost) {
    const nat = costRun(def, S.seed, S.cost, false);
    const det = costRun(def, S.seed, S.cost, true);
    out({ engine, test: "cost", ticks: S.cost, nativeMsPerTick: +nat.msPerTick.toFixed(4), detMsPerTick: +det.msPerTick.toFixed(4), ratio: +(det.msPerTick / nat.msPerTick).toFixed(2) });
  }
  if (S.detcheck) {
    const d = detCheck(S.detcheck);
    out({ engine, test: "detcheck", digest: d.digest, rows: d.rows });
  }
  out({ engine, test: "done", ok: allOk });
  return allOk;
}
