import * as THREE from "three";
import type { LiveSpec } from "../../audio/live";
import { Band } from "./band";
import type { Kind } from "./instruments";

/**
 * Ready-made acts for the places: a pianist at a grand piano, a soloist (violin, saxophone…), a
 * jazz trio. Each is a Band (./band.ts) with its recording registered as live music.
 */

export interface ActOpts {
  /** The place's key and the floor index the act plays on. */
  place: string;
  floor: number;
  /** public/audio/music/<track>.m4a */
  track: string;
  level?: number;
  /** Distance (m) at full level. */
  ref?: number;
  bleed?: LiveSpec["bleed"];
  /** Players' scale. */
  k?: number;
}

/** Bench height and the seat-to-keys distance for the furniture's grand piano (furniture.ts). */
const BENCH = 0.5;
/** The keyboard's front edge is 1 m from the piano's centre (its local −z). */
const KEYS = 1.0;

/**
 * A pianist at a grand piano placed at (x, y, z) turned `rot` (as furniture.ts `place` does): on
 * the bench in front of the keys, hands on them, the recording coming from the piano's open lid.
 */
/** Where the pianist sits at a grand piano placed at (x, z) turned `rot` (scale `s`). */
export function pianoSeat(piano: { x: number; y: number; z: number; rot: number; scale?: number }) {
  const back = (KEYS + 0.38) * (piano.scale ?? 1);
  return { x: piano.x - Math.sin(piano.rot) * back, y: piano.y + BENCH, z: piano.z - Math.cos(piano.rot) * back, yaw: piano.rot };
}

export function pianist(parent: THREE.Object3D, piano: { x: number; y: number; z: number; rot: number; scale?: number }, o: ActOpts & { id: number; role?: string }) {
  const band = new Band(parent);
  const seat = pianoSeat(piano);
  band.add("piano", { id: o.id, ...seat, k: o.k ?? 1, role: o.role ?? "Pianist", seatH: BENCH });
  band.play({ place: o.place, floor: o.floor, track: o.track, level: o.level ?? 0.9, ref: o.ref ?? 3, bleed: o.bleed, at: [piano.x, piano.y + 1.1, piano.z] });
  return band;
}

/** One musician standing (or seated, for the drums) at (x, y, z) facing `yaw`. */
export function soloist(parent: THREE.Object3D, kind: Kind, at: { x: number; y: number; z: number; yaw: number }, o: ActOpts & { id: number; role?: string }) {
  const band = new Band(parent);
  band.add(kind, { id: o.id, x: at.x, y: at.y, z: at.z, yaw: at.yaw, k: o.k ?? 1, role: o.role });
  band.play({ place: o.place, floor: o.floor, track: o.track, level: o.level ?? 0.85, ref: o.ref ?? 2.5, bleed: o.bleed, at: [at.x, at.y + 1.3, at.z] });
  return band;
}

/**
 * A jazz trio round (x, z) facing `yaw`: the trumpet in front, the double bass on its left, the
 * drums behind on its right. `ids` are the three zkSNARKs.
 */
export function trio(parent: THREE.Object3D, at: { x: number; y: number; z: number; yaw: number }, o: ActOpts & { ids: [number, number, number] }) {
  const band = new Band(parent);
  const k = o.k ?? 1;
  const c = Math.cos(at.yaw),
    s = Math.sin(at.yaw);
  // (side, forward) offsets in the trio's frame → the floor
  const pos = (side: number, fwd: number): [number, number] => [at.x + c * side + s * fwd, at.z - s * side + c * fwd];
  const [tx, tz] = pos(0, 0.5);
  const [bx, bz] = pos(1.3, -0.1);
  const [dx, dz] = pos(-1.2, -0.7);
  band.add("trumpet", { id: o.ids[0], x: tx, y: at.y, z: tz, yaw: at.yaw, k, role: "Trumpet" });
  band.add("bass", { id: o.ids[1], x: bx, y: at.y, z: bz, yaw: at.yaw - 0.3, k, role: "Double bass" });
  band.add("drums", { id: o.ids[2], x: dx, y: at.y + 0.44 * k, z: dz, yaw: at.yaw + 0.25, k, role: "Drums" });
  band.play({ place: o.place, floor: o.floor, track: o.track, level: o.level ?? 0.9, ref: o.ref ?? 3.5, bleed: o.bleed, at: [at.x, at.y + 1.2, at.z] });
  return band;
}

/**
 * Any line-up (the jazz club's quartet…): players at their own spots, one recording from `at`.
 * Seated players (drums, piano) give their seat's height as y.
 */
export function ensemble(parent: THREE.Object3D, players: { kind: Kind; id: number; x: number; y: number; z: number; yaw: number; role?: string }[], at: [number, number, number], o: ActOpts) {
  const band = new Band(parent);
  for (const p of players) band.add(p.kind, { ...p, k: o.k ?? 1 });
  band.play({ place: o.place, floor: o.floor, track: o.track, level: o.level ?? 0.9, ref: o.ref ?? 3.5, bleed: o.bleed, at });
  return band;
}
