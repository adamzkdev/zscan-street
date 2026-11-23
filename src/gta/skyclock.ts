import "./skyclock.css";
import { daylightAt, SUNRISE, SUNSET, type Daylight } from "../scene/daylight";

/**
 * The game's clock and weather (src/gta): the hour (a day of its own — an hour a minute by day, an
 * hour every half minute by night — the visitor's own clock, or a fixed afternoon or night), and
 * the weather moving from one state to the next every few hours (clear, a few clouds, overcast,
 * showers, now and then a storm with its lightning), each change eased in over a while. `update`
 * gives the Daylight the street paints itself with (scene/daylight.ts).
 */

export type WeatherKind = "clear" | "fair" | "overcast" | "rain" | "storm";
export type SkyMode = "cycle" | "clock" | "day" | "night";

const LOOK: Record<WeatherKind, { cloud: number; rain: number; storm: number }> = {
  clear: { cloud: 0.06, rain: 0, storm: 0 },
  fair: { cloud: 0.36, rain: 0, storm: 0 },
  overcast: { cloud: 0.84, rain: 0, storm: 0 },
  rain: { cloud: 0.93, rain: 0.75, storm: 0 },
  storm: { cloud: 1, rain: 1, storm: 1 },
};
/** What comes after what (weights). */
const NEXT: Record<WeatherKind, [WeatherKind, number][]> = {
  clear: [
    ["clear", 0.35],
    ["fair", 0.5],
    ["overcast", 0.15],
  ],
  fair: [
    ["clear", 0.38],
    ["fair", 0.27],
    ["overcast", 0.23],
    ["rain", 0.12],
  ],
  overcast: [
    ["fair", 0.32],
    ["overcast", 0.2],
    ["rain", 0.34],
    ["storm", 0.14],
  ],
  rain: [
    ["overcast", 0.4],
    ["fair", 0.28],
    ["rain", 0.18],
    ["storm", 0.14],
  ],
  storm: [
    ["rain", 0.55],
    ["overcast", 0.45],
  ],
};
export const WEATHER_NAME: Record<WeatherKind, string> = { clear: "Clear", fair: "Fair", overcast: "Overcast", rain: "Showers", storm: "Storm" };

/** Real seconds per game hour: by day, by night (the night goes by quicker). */
const DAY_HOUR = 60;
const NIGHT_HOUR = 30;
/** The cycle's first hour: the afternoon, a golden hour a few minutes in. */
export const START_HOUR = 16.6;

export class SkyClock {
  hour = START_HOUR;
  kind: WeatherKind = "fair";
  private target = { ...LOOK.fair };
  private cur = { ...LOOK.fair };
  wet = 0;
  flash = 0;
  /** Lightning struck this frame (the thunder follows). */
  struck = false;
  /** Game hours until the weather turns. */
  private turnIn = 2.5;
  private boltIn = 6;
  private flicker = 0;
  private out: Daylight | undefined;

  /** Back to the afternoon, fair (a new game). */
  reset() {
    this.hour = START_HOUR;
    this.kind = "fair";
    this.target = { ...LOOK.fair };
    this.cur = { ...LOOK.fair };
    this.wet = 0;
    this.turnIn = 2 + Math.random() * 2;
  }

  /** Straight to a time and a weather (tests, the menu). */
  force(hour: number | null, kind: WeatherKind | null) {
    if (hour !== null) this.hour = hour;
    if (kind) {
      this.kind = kind;
      this.target = { ...LOOK[kind] };
      this.cur = { ...LOOK[kind] };
      this.wet = kind === "rain" || kind === "storm" ? 1 : 0;
      this.turnIn = 3;
    }
  }

  get daytime() {
    return this.hour >= SUNRISE && this.hour < SUNSET;
  }

  update(dt: number, mode: SkyMode, weather: "dynamic" | "clear"): Daylight {
    this.struck = false;
    // the hour
    let gameHours: number;
    if (mode === "cycle") {
      gameHours = dt / (this.daytime ? DAY_HOUR : NIGHT_HOUR);
      this.hour = (this.hour + gameHours) % 24;
    } else {
      gameHours = dt / DAY_HOUR;
      if (mode === "clock") {
        const n = new Date();
        this.hour = n.getHours() + n.getMinutes() / 60 + n.getSeconds() / 3600;
      } else this.hour = mode === "day" ? 16 : 23;
    }
    // the weather: a new state every few hours, eased in
    if (weather === "clear") {
      if (this.kind !== "clear" && this.kind !== "fair") this.kind = "fair";
      this.target = { ...LOOK[this.kind] };
    } else {
      this.turnIn -= gameHours;
      if (this.turnIn <= 0) {
        this.turnIn = 2 + Math.random() * 3;
        let r = Math.random();
        for (const [k, w] of NEXT[this.kind]) {
          if ((r -= w) <= 0) {
            this.kind = k;
            break;
          }
        }
        this.target = { ...LOOK[this.kind] };
      }
    }
    // (over about a game hour; the rain only once the sky has closed in)
    const k = Math.min(1, gameHours / 0.9);
    this.cur.cloud += (this.target.cloud - this.cur.cloud) * k;
    this.cur.storm += (this.target.storm - this.cur.storm) * k;
    const rainGoal = this.cur.cloud > 0.78 ? this.target.rain : 0;
    this.cur.rain += (rainGoal - this.cur.rain) * Math.min(1, gameHours / 0.35);
    // the streets wet in a shower, dry over a few hours
    if (this.cur.rain > 0.15) this.wet = Math.min(1, this.wet + dt / 25);
    else this.wet = Math.max(0, this.wet - gameHours / 3);
    // lightning in a storm: a flash (and a second flicker), the thunder after
    if (this.cur.storm > 0.55) {
      this.boltIn -= dt;
      if (this.boltIn <= 0) {
        this.boltIn = 5 + Math.random() * 13;
        this.flash = 1;
        this.flicker = 0.12 + Math.random() * 0.1;
        this.struck = true;
      }
    }
    if (this.flicker > 0) {
      this.flicker -= dt;
      if (this.flicker <= 0) this.flash = Math.max(this.flash, 0.7);
    }
    this.flash *= Math.exp(-dt * 10);
    if (this.flash < 0.01) this.flash = 0;
    this.out = daylightAt(this.hour, { cloud: this.cur.cloud, rain: this.cur.rain, wet: this.wet, storm: this.cur.storm, flash: this.flash }, this.out);
    return this.out;
  }

  /** "17:42". */
  get time() {
    const h = Math.floor(this.hour),
      m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  /** A small glyph for the weather (the HUD's clock). */
  get glyph() {
    const night = !this.daytime;
    const k = this.cur.rain > 0.2 ? (this.cur.storm > 0.5 ? "storm" : "rain") : this.cur.cloud > 0.7 ? "overcast" : this.cur.cloud > 0.25 ? "fair" : "clear";
    return { kind: k as WeatherKind, night };
  }
}

/** The weather glyph as a tiny inline SVG (sun, moon, cloud, rain, bolt), in the HUD's ink. */
export function weatherIcon(kind: WeatherKind, night: boolean) {
  const sun = night ? `<path d="M10 3a5.5 5.5 0 1 0 5 8 4.5 4.5 0 0 1-5-8z" fill="currentColor"/>` : `<circle cx="9" cy="8" r="3.4" fill="currentColor"/><g stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M9 1.5v1.6M9 12.9v1.6M2.5 8h1.6M13.9 8h1.6M4.4 3.4l1.1 1.1M12.5 11.5l1.1 1.1M4.4 12.6l1.1-1.1M12.5 4.5l1.1-1.1"/></g>`;
  const cloud = (x: number, y: number, o = 1) => `<path transform="translate(${x} ${y})" opacity="${o}" d="M4 12h9a3.2 3.2 0 0 0 .3-6.4A4.4 4.4 0 0 0 5 4.6 3.7 3.7 0 0 0 4 12z" fill="currentColor"/>`;
  let body = "";
  if (kind === "clear") body = sun;
  else if (kind === "fair") body = `<g opacity="0.9">${sun}</g>${cloud(4, 4)}`;
  else if (kind === "overcast") body = `${cloud(0, 0, 0.55)}${cloud(3, 3)}`;
  else if (kind === "rain") body = `${cloud(1, -1)}<g stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6 13.5l-1 2.5M10 13.5l-1 2.5M14 13.5l-1 2.5"/></g>`;
  else body = `${cloud(1, -1)}<path d="M10 11l-2.6 4h2.4l-1.2 3.6 4-5.2h-2.5l1.4-2.4z" fill="#f4b728"/>`;
  return `<svg viewBox="0 0 19 19" width="15" height="15" aria-hidden="true">${body}</svg>`;
}
