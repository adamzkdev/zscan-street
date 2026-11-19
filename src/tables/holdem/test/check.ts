/** A tiny test kit for the Node runs (node src/tables/holdem/test/<file>.ts): no imports from Node itself. */
let fails = 0;
let passes = 0;
export function ok(cond: unknown, msg: string) {
  if (cond) passes++;
  else {
    fails++;
    console.log("  FAIL " + msg);
  }
}
export function eq<T>(a: T, b: T, msg: string) {
  ok(a === b, `${msg}: got ${String(a)}, want ${String(b)}`);
}
export function done(name: string) {
  console.log(`${name}: ${passes} passed, ${fails} failed`);
  if (fails) throw new Error(`${name}: ${fails} failures`);
}
