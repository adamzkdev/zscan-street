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

export const GAMES: MiniDef[] = [KART, BUMPER, TILES, COINS, LASER, BOMB, PLANET, DIG, INSCRIBE, ROLL, SIGN, MEMPOOL, LATTICE, STACK, GALLERY, BEAT_DEF, RUN, QBALL, FORGE];
export const gameOf = (key: string) => GAMES.find((g) => g.key === key) ?? null;
