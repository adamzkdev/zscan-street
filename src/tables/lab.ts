/**
 * The table games' bench, without the city: /tablelab.html?t=<key>&seats=6&seed=7&stake=100
 * (`&auto`: the human seat plays by AI too; `&fast`: no waits; `&skill=0.9`: every AI that good).
 * window.lab gets { result, done } when the game calls onExit.
 */
import { SEAT_COLORS, type TableDef, type TableSeat } from "./types";
import { TABLES } from "./index";
import { personName } from "../party/people";

const q = new URLSearchParams(location.search);
const key = q.get("t") ?? "";
const root = document.getElementById("lab")!;
const lab = ((window as unknown as { lab: Record<string, unknown> }).lab = { result: null as unknown, done: false });
const IDS = [4071, 1337, 77, 9001, 2718, 3141, 604, 8128];
const SKILL = [0.5, 0.35, 0.6, 0.85, 0.45, 0.7, 0.3, 0.9];

(async () => {
  let def: TableDef | null = TABLES.find((t) => t.key === key) ?? null;
  // (a game not in the house yet: its own folder's index.ts, default export)
  if (!def && key) def = ((await import(`./${key}/index.ts`)) as { default: TableDef }).default;
  if (!def) {
    root.innerHTML = `<p style="color:#fff;font:16px sans-serif;padding:20px">tablelab: ?t=${TABLES.map((t) => t.key).join("|") || "&lt;key&gt;"}</p>`;
    return;
  }
  const n = Math.max(def.minSeats, Math.min(def.maxSeats, Number(q.get("seats") ?? def.defaultSeats)));
  const sk = q.get("skill");
  const seats: TableSeat[] = Array.from({ length: n }, (_, i) => ({
    seat: i,
    id: IDS[i],
    name: i === 0 ? "You" : personName(IDS[i]),
    human: i === 0,
    skill: sk ? Number(sk) : SKILL[i],
    color: SEAT_COLORS[i],
  }));
  def.open({
    root,
    seats,
    stake: Number(q.get("stake") ?? def.stakes[0] ?? 0),
    seed: Number(q.get("seed") ?? 7),
    seedNote: "Bench seed",
    lab: { auto: q.has("auto"), fast: q.has("fast") },
    onExit(result) {
      lab.result = result;
      lab.done = true;
    },
  });
})();
