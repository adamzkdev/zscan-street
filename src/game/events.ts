import { get } from "../data/zscan";
import type { Decor } from "../scene/decor";
import type { GameHud } from "./ui";

export interface CityEventDef {
  key: string;
  title: string;
  kind: "nu7" | "concert" | "tournament" | "race" | "party";
  place: string | null;
  start_height: number | null;
  start_time: string | null;
  duration_s: number;
}

const PLACE: Record<CityEventDef["kind"], string | null> = { concert: "opera", tournament: "stadium", race: "pyramid", nu7: null, party: null };
const COLOR: Record<CityEventDef["kind"], string> = { concert: "#ff7aa8", tournament: "#38ff9c", race: "#f4b728", nu7: "#b07bff", party: "#3ef0ff" };

const fmt = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`;
};

/**
 * The city's live events (the API's schedule): a concert at the Opera, the Shielded vs
 * Transparent tournament at the stadium, the pyramid race, the NU7 night. Everyone gets the same
 * reminders at the same time; when one starts, the screens announce it and the toast takes you in.
 */
export class LiveEvents {
  list: CityEventDef[] = [];
  private told = new Set<string>();

  constructor(
    private hud: GameHud,
    private decor: Decor,
    private go: (place: string) => void,
    private tip: () => number,
  ) {
    void this.load();
    setInterval(() => void this.load(), 10 * 60_000);
    setInterval(() => this.tick(), 20_000);
  }

  async load() {
    const l = await get<CityEventDef[]>("/v1/street/events");
    if (l) this.list = l;
    this.tick();
  }

  /** When an event starts (ms), from its time or its block height (75 s a block). */
  private startOf(e: CityEventDef) {
    if (e.start_time) return Date.parse(e.start_time);
    if (e.start_height && this.tip()) return Date.now() + (e.start_height - this.tip()) * 75_000;
    return null;
  }

  next() {
    let best: { e: CityEventDef; in: number; live: boolean } | null = null;
    for (const e of this.list) {
      const s = this.startOf(e);
      if (s === null) continue;
      const dt = s - Date.now();
      const live = dt <= 0 && -dt < e.duration_s * 1000;
      if (dt < 0 && !live) continue;
      if (!best || (live && !best.live) || (!best.live && dt < best.in)) best = { e, in: Math.max(0, dt), live };
    }
    return best;
  }

  private tick() {
    for (const e of this.list) {
      if (e.kind === "nu7") continue; // the NU7 pack has its own countdown and party
      const s = this.startOf(e);
      if (s === null) continue;
      const dt = s - Date.now();
      const place = e.place ?? PLACE[e.kind];
      const go = place ? { label: `Go to the ${place}`, fn: () => this.go(place) } : undefined;
      if (dt > 0 && dt < 15 * 60_000 && !this.told.has(`${e.key}:soon`)) {
        this.told.add(`${e.key}:soon`);
        this.hud.mail("event", e.title, `Starts in ${fmt(dt)}${place ? ` at the ${place}` : ""}.`, go);
      }
      if (dt <= 0 && -dt < e.duration_s * 1000 && !this.told.has(`${e.key}:${s}`)) {
        this.told.add(`${e.key}:${s}`);
        this.decor.alert({ kind: "game", title: "LIVE NOW  ライブ", big: e.title.toUpperCase(), line: place ? `AT THE ${place.toUpperCase()}` : "IN THE CITY", color: COLOR[e.kind] });
        this.hud.mail("event", `Live now: ${e.title}`, place ? `At the ${place}.` : "In the city.", go);
      }
    }
  }
}
