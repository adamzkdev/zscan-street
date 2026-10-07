import type { Level, LiftStyle } from "../kit";

/**
 * ZK TOWER ORCHARD's floors. Heights follow the tower outside: the podium to 14 m, the offices
 * in the first tier, the jazz club at the top of the second, the observatory on the shaft at
 * 110 m under the crown.
 */
export const LEVELS: Level[] = [
  { label: "G", name: "Grand lobby · gold and black marble", y: 0, spawn: [0, -2.4], yaw: 0, view: 2 },
  { label: "18", name: "Orchard Capital · trading desks", y: 60, spawn: [-10.2, -10], yaw: -Math.PI / 2, view: 60 },
  { label: "64", name: "The Nullifier · jazz club, bar", y: 90, spawn: [-10.2, -10], yaw: -Math.PI / 2, view: 90 },
  { label: "86", name: "Observatory · open-air deck", y: 110, spawn: [0, -4.2], yaw: Math.PI, view: 112 },
];
export const F = { lobby: 0, offices: 1, club: 2, deck: 3 } as const;
/** Metres from the street door back to the tower's middle: where the panoramas are taken. */
export const BACK = 12;

export const LIFT: LiftStyle = { wall: "#0e0c10", frame: "#d9a92e", door: "#e8c25a", ink: "#1a1206", lit: "#fff2c8", accent: "#f4b728", deco: "sunburst" };

/** The tower's world position (its lot's middle), for what the telescopes see. */
export const AT = { x: 102.5, z: -136.5 };
