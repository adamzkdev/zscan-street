import type { Interior, InteriorContext } from "../../types";
import { SkyKit, type Level } from "../kit";
import { garden } from "./garden";
import { greenhouse } from "./greenhouse";
import { lobby } from "./lobby";
import { residence } from "./residence";
import { rooftop } from "./rooftop";

/**
 * ZK TOWER SAPLING, the green tower on the marina's bank: the green atrium, the sky garden on 31,
 * the greenhouse coworking floor, a flat on 84 and the rooftop infinity pool with its sky bar.
 * Only the floor you are on is drawn, lit and animated; every window looks onto the real city.
 */
export const LEVELS: Level[] = [
  { label: "G", name: "Green atrium · lobby, living wall", y: 0, spawn: [0, -1.8], yaw: 0, view: 2 },
  { label: "31", name: "Sky garden · lawn, yoga, playground", y: 31, spawn: [0, -8.6], yaw: Math.PI, view: 31 },
  { label: "58", name: "Greenhouse · hydroponics, coworking", y: 58, spawn: [-9.4, -12], yaw: -Math.PI / 2, view: 58 },
  { label: "84", name: "Residence 8401 · living room, kitchen", y: 84, spawn: [-9.4, -12], yaw: -Math.PI / 2, view: 84 },
  { label: "R", name: "Rooftop · infinity pool, sky bar", y: 110, spawn: [-10.5, -20.6], yaw: Math.PI, view: 111 },
];

/** Metres from the street door to the middle of the tower (the panoramas are taken there; the lot faces north). */
const BACK = -12.6;

export function buildSapling(ctx: InteriorContext): Interior {
  const k = new SkyKit(ctx, LEVELS, "ZK TOWER SAPLING", { bg: "#06100a" });
  k.scene.environmentIntensity = 0.32;
  lobby(k);
  garden(k);
  greenhouse(k);
  residence(k);
  rooftop(k);
  return k.interior("tower-sapling", BACK);
}
