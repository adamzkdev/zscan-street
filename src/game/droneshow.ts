import * as THREE from "three";
import type { Decor } from "../scene/decor";
import { DroneShow, loadShowData, SHOW_HEIGHT } from "../scene/drones";
import type { MailKind } from "./ui";

/**
 * THE 676, scheduled: a drone show over the bay every hour at half past (everyone sees the same
 * formation at the same moment, src/scene/drones.ts). The LED screens count down the last ten
 * minutes; five minutes before, a letter in the inbox with a way there. `?drones=now` starts one in
 * 15 seconds; the films play one on their own clock (`play()`).
 */

/** Over open water between Liberty island and the bridge (src/scene/city/plan.ts BAY). */
export const SHOW_AT = new THREE.Vector3(106, -1.6, 186);
const MINUTE = 30;

export interface DroneHooks {
  decor: Decor;
  mail(kind: MailKind, title: string, text: string, act?: { label: string; fn: () => void }): void;
  go(x: number, z: number, zoom?: number): void;
}

const local = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export class DroneShowEvent {
  readonly show = new DroneShow(SHOW_AT);
  private start = 0;
  private loading = false;
  private lastCall = -1;
  private mailed = 0;
  /** A film's own clock (seconds into the show), or null: the wall clock. */
  private manual: number | null = null;

  constructor(
    scene: THREE.Scene,
    private o: DroneHooks,
  ) {
    scene.add(this.show.group);
    const q = new URLSearchParams(location.search).get("drones");
    this.start = q === "now" ? Date.now() + 15_000 : this.next(Date.now());
  }

  /** The next show (or the one running): every hour at :30. */
  private next(now: number) {
    const h = new Date(now);
    h.setMinutes(MINUTE, 0, 0);
    let s = h.getTime();
    // still running (about 2 minutes): that one
    if (s + 150_000 < now) s += 3600_000;
    return s;
  }

  /** The camera on the formation: the map camera looks down from the south-east at 34°, so the
   * ground point that lines up with the formation's middle on screen is that far beyond it. */
  watch() {
    const back = SHOW_HEIGHT / Math.tan((34 * Math.PI) / 180);
    const az = (34 * Math.PI) / 180;
    this.o.go(SHOW_AT.x - Math.sin(az) * back, SHOW_AT.z - Math.cos(az) * back, 0.36);
  }

  /** The drones are up. */
  get active() {
    return this.show.group.visible;
  }

  /** Play a show now on its own clock (the films step it frame by frame). */
  async play() {
    this.show.prepare(await loadShowData());
    this.manual = 0;
  }

  /** What the drones are forming now (for the films' captions), or "". */
  get act() {
    return this.show.group.visible ? this.show.act : "";
  }

  update(dt: number, eye: THREE.Vector3, viewH: number) {
    if (this.manual !== null) {
      this.manual += dt;
      this.show.update(this.manual, viewH, eye, dt);
      if (this.manual > this.show.length) this.manual = null;
      return;
    }
    const now = Date.now();
    const eta = (this.start - now) / 1000;
    // the programme for this show: the day's Apparitions, the last sale, a minute before
    if (eta < 60 && !this.show.ready && !this.loading) {
      this.loading = true;
      void loadShowData()
        .then((d) => this.show.prepare(d))
        .finally(() => (this.loading = false));
    }
    if (eta > 0 && eta < 600) {
      const call = Math.ceil(eta / 60);
      if (call !== this.lastCall && (call === 10 || call === 5 || call <= 2)) {
        this.lastCall = call;
        this.o.decor.alert({ kind: "game", title: "DRONE SHOW · ドローン", big: `IN ${call} MIN`, line: "THE 676 · OVER THE BAY", color: "#9a86ff" });
      }
      if (eta < 300 && this.mailed !== this.start) {
        this.mailed = this.start;
        this.o.mail(
          "event",
          `The 676 · drone show at ${local(this.start)}`,
          "676 drones over the bay, one for every zkSNARK purged for the Apparitions, one for every pixel of a zkSNARK: today's Apparitions, the last zkSNARK sold, a Zcash coin.",
          { label: "Watch", fn: () => this.watch() },
        );
      }
    }
    const t = -eta;
    if (t > 0 && this.lastCall !== 0) {
      this.lastCall = 0;
      this.o.decor.alert({ kind: "game", title: "NOW · LIVE", big: "THE 676", line: "DRONE SHOW · OVER THE BAY", color: "#9a86ff" });
    }
    this.show.update(t, viewH, eye, dt);
    // over: the next one, the next hour
    if (this.show.ready && t > this.show.length + 5) {
      this.start = this.next(now + 60_000);
      this.show.reset();
      this.lastCall = -1;
    }
  }
}
