/** Every ZK PARTY mini-game (all 3D), in the order the practice room lists them. */
import type { MiniDef } from "../kit";
import { KART } from "./kart";
import { BUMPER } from "./bumper";
import { TILES } from "./tiles";
import { COINS } from "./coins";
import { LASER } from "./laser";
import { BOMB } from "./bomb";
import { PLANET } from "./planet";
import { DIG } from "./dig";
import { INSCRIBE } from "./turf";
import { ROLL } from "./roll";
import { SIGN } from "./sign";
import { MEMPOOL } from "./mempool";
import { LATTICE } from "./lattice";
import { STACK } from "./stack";
import { GALLERY } from "./gallery";
import { BEAT_DEF } from "./beat";
import { RUN } from "./run";
import { QBALL } from "./qball";
import { FORGE } from "./forge";
import { GP_DUELS, GP_PARTY } from "../gp";

/** ZK PARTY's own mini-games (each with its levels, online in lockstep). */
export const ZK_GAMES: MiniDef[] = [KART, BUMPER, TILES, COINS, LASER, BOMB, PLANET, DIG, INSCRIBE, ROLL, SIGN, MEMPOOL, LATTICE, STACK, GALLERY, BEAT_DEF, RUN, QBALL, FORGE];
/** ZK PARTY's own games on the hall's shelves (genres.ts). */
const ZK_GENRE: Record<string, string> = { kart: "race", bumper: "action", tiles: "reflex", coins: "action", laser: "reflex", bomb: "action", planet: "race", dig: "race", turf: "action", roll: "race", sign: "brain", mempool: "action", lattice: "reflex", stack: "reflex", gallery: "action", beat: "reflex", run: "race", qball: "team", forge: "brain" };
for (const g of ZK_GAMES) g.genre ??= ZK_GENRE[g.key];

/** Every four-player mini-game: ZK PARTY's, then the GAMEPARTY ones (gp/, loaded when played). */
export const GAMES: MiniDef[] = [...ZK_GAMES, ...GP_PARTY];
/** The one-on-one games (gp/ duels): you against one zkSNARK, from the hall. */
export const DUELS: MiniDef[] = GP_DUELS;
export const gameOf = (key: string) => GAMES.find((g) => g.key === key) ?? DUELS.find((g) => g.key === key) ?? null;
