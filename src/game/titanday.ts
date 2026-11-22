import type { Decor } from "../scene/decor";
import type { Titan, TitanCall } from "../scene/titan";
import type { MailKind } from "./ui";

/**
 * The Titan of the day, scheduled: every day at 20:00 UTC the biggest shielding of the last 24
 * hours rises from the bay (src/scene/titan.ts), for everyone at the same moment; a visitor who
 * comes in while it is out meets it where it has got to. The LED screens count down the last ten
 * minutes; five minutes before, a letter in the inbox with a way there. `?titan=now`: one in 15 s.
 */

export const TITAN_HOUR_UTC = 20;
/** About how long it is out (rise, walk, climb, beam, back, sink), in seconds. */
const RUN = 110;

export interface TitanDayHooks {
  decor: Decor;
  mail(kind: MailKind, title: string, text: string, act?: { label: string; fn: () => void }): void;
  /** The camera to the bay (and onto the Titan when it rises). */
  watch(): void;
  /** The biggest shielding of the last 24 hours. */
  biggest(): Promise<TitanCall | null>;
}

const local = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export class TitanDay {
  private start = 0;
  private lastCall = -1;
  private mailed = 0;
  private called = 0;

  constructor(
    private titan: Titan,
    private o: TitanDayHooks,
  ) {
    const q = new URLSearchParams(location.search).get("titan");
    this.start = q === "now" ? Date.now() + 15_000 : this.next(Date.now());
  }

  /** Today's at 20:00 UTC (or the one out now), else tomorrow's. */
  private next(now: number) {
    const d = new Date(now);
    d.setUTCHours(TITAN_HOUR_UTC, 0, 0, 0);
    let s = d.getTime();
    if (s + RUN * 1000 < now) s += 86_400_000;
    return s;
  }

  /** When the next one comes (ms). */
  get at() {
    return this.start;
  }

  update() {
    const now = Date.now();
    const eta = (this.start - now) / 1000;
    if (eta > 0 && eta < 600) {
      const call = Math.ceil(eta / 60);
      if (call !== this.lastCall && (call === 10 || call === 5 || call <= 2)) {
        this.lastCall = call;
        this.o.decor.alert({ kind: "game", title: "THE TITAN · 巨", big: `IN ${call} MIN`, line: "THE DAY'S BIGGEST SHIELDING · THE BAY", color: "#f4b728" });
      }
      if (eta < 300 && this.mailed !== this.start) {
        this.mailed = this.start;
        this.o.mail("titan", `The Titan of the day at ${local(this.start)}`, "The biggest shielding of the last 24 hours rises from the bay as a giant zkSNARK, as tall as the amount, and climbs the Needle.", { label: "Watch", fn: () => this.o.watch() });
      }
    }
    // its time: the day's biggest shielding, joined where it has got to by a late visitor
    if (eta <= 0 && this.called !== this.start) {
      this.called = this.start;
      if (-eta < RUN - 15) {
        const at = this.start;
        void this.o.biggest().then((c) => c && this.titan.call(c, at));
      }
    }
    // gone: tomorrow's
    if (eta < -RUN - 30 && !this.titan.active) {
      this.start = this.next(now + 60_000);
      this.lastCall = -1;
    }
  }
}
