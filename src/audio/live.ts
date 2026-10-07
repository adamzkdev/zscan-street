/**
 * Live music in the places: musicians (a pianist in a lobby bar, a jazz trio, the Opera's
 * orchestra) register here where they stand and what they play; the soundscape (src/audio.ts)
 * turns the sources of the floor you are on into positional sound (a Web Audio PannerNode at the
 * player, louder near, duller far away) and the ones a floor away into a muffled bleed.
 *
 * Nothing here touches Web Audio: the places can register their musicians before the sound is
 * on (or without it ever being on). Recordings live in public/audio/music (credits in
 * public/audio/CREDITS.md).
 */

export interface LiveSpec {
  /** The place's key ("hotel", "opera"…) and the floor index the player is on. */
  place: string;
  floor: number;
  /** Where the sound comes from, in the place's scene coordinates (metres). */
  x: number;
  y: number;
  z: number;
  /** The recording (public/audio/music/<track>.m4a), or null for silence. */
  track: string | null;
  /** Level at `ref` metres (1 = the recording's own loudness). */
  level?: number;
  /** Distance (m) under which the level stays full; the sound halves every `ref` metres beyond. */
  ref?: number;
  rolloff?: number;
  /** How much of it goes into the room's reverb (0..1). */
  wet?: number;
  /** Other floors that hear it through the floor or a door: level and low-pass (Hz). */
  bleed?: Record<number, { level: number; lp: number }>;
  /** Starts over at the end (default); otherwise it plays once and stops. */
  loop?: boolean;
}

export class LiveSource {
  /** When the current track started (seconds, performance clock): late listeners join mid-piece. */
  t0 = now();
  /** Bumped when the track changes (the mixer cross-fades to it). */
  version = 0;
  /** The recording's loudness right now, 0..1 (0 when not heard): players can move with it. */
  meter = 0;
  /** Seconds since the mixer last measured it (the meter is stale beyond a fraction of a second). */
  heardAt = -1;

  constructor(readonly spec: LiveSpec) {}

  get track() {
    return this.spec.track;
  }

  /** Play another recording from its start (or stop with null). */
  play(track: string | null) {
    this.spec.track = track;
    this.t0 = now();
    this.version++;
    emit();
  }

  /** Where it is in its recording now (s). */
  get elapsed() {
    return now() - this.t0;
  }

  /** True while a mixer measured it within the last half second. */
  get heard() {
    return this.heardAt >= 0 && now() - this.heardAt < 0.5;
  }

  /** Move the player (the mixer follows). */
  moveTo(x: number, y: number, z: number) {
    this.spec.x = x;
    this.spec.y = y;
    this.spec.z = z;
  }
}

const now = () => performance.now() / 1000;
const byPlace = new Map<string, LiveSource[]>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const live = {
  /** A musician starts playing (for as long as the place stays built). */
  add(spec: LiveSpec) {
    const s = new LiveSource(spec);
    let l = byPlace.get(spec.place);
    if (!l) byPlace.set(spec.place, (l = []));
    l.push(s);
    emit();
    return s;
  },
  remove(s: LiveSource) {
    const l = byPlace.get(s.spec.place);
    if (!l) return;
    const i = l.indexOf(s);
    if (i >= 0) l.splice(i, 1);
    emit();
  },
  /** Every source of a place. */
  of(place: string): readonly LiveSource[] {
    return byPlace.get(place) ?? [];
  },
  /** Told when a source is added, removed or changes track. */
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};
