/**
 * SNARK KART: four zkSNARKs in voxel karts on a street circuit, three courses to race (course.ts):
 * ZSTREET (golden hour: the bridge, the plank over the lake, the canal jump), NU7 GRAND PRIX (a winter
 * evening in the NU7 Quarter: ice, crosswind gusts, a lane over the frozen canal) and MARINA BAY (a
 * night in the rain round the bay: puddles, a wet road, the helix bridge, an alley shortcut). The engine is
 * engine.ts, the tracks are data (track.ts), their scenery is built with scenery.ts.
 */
import type { MiniDef } from "../../kit";
import { KartRace } from "./engine";
import type { Course } from "./course";
import { CITY } from "./tracks/city";
import { ASTANA } from "./tracks/astana";
import { SINGAPORE } from "./tracks/singapore";

export const COURSES: Course[] = [CITY, ASTANA, SINGAPORE];

export const KART: MiniDef = {
  key: "kart",
  title: "SNARK KART",
  titleZh: "Snark 卡丁车",
  tag: "Street circuits: ZStreet, the NU7 Grand Prix in the snow, Marina Bay in the rain. Drift, jump, zap the leader.",
  tagZh: "街道赛道：ZStreet、雪中的 NU7 大奖赛、雨夜的滨海湾。漂移、飞跃、电击领先者。",
  goal: "First across the finish line wins!",
  goalZh: "第一个冲过终点线的赢！",
  help: "◀ ▶ steer. Hold A in a turn to drift (blue, orange, purple sparks: let go to boost). A on the 1 for a rocket start. B uses the item.",
  helpZh: "◀ ▶ 转向。弯道按住 A 漂移（蓝、橙、紫火花：松开加速）。倒数到 1 时按 A 火箭起步。B 使用道具。",
  pad: ["left", "right", "a", "b"],
  tap: false,
  // (on a phone: a stick that steers, as far as the thumb leans; never a brake)
  stick: "x",
  color: "#ff6b35",
  song: "race",
  ambience: "city-day",
  variants: COURSES.map((c) => ({ key: c.key, title: c.title, titleZh: c.titleZh, tag: c.tag, tagZh: c.tagZh, thumb: `kart-${c.key}`, song: c.song, ambience: c.ambience })),
  make: (players, rnd, variant) => new KartRace(players, rnd, COURSES.find((c) => c.key === variant) ?? COURSES[Math.floor(rnd() * COURSES.length) % COURSES.length]),
};
export default KART;
