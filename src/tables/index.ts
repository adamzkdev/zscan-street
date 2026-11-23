/** Every table game of the Game House (src/tables/<key>/), in the order the house lists them. */
import type { TableDef } from "./types";
import barons from "./barons";
import glyph from "./glyph";
import holdem from "./holdem";
import legends from "./legends";

export const TABLES: TableDef[] = [barons, glyph, holdem, legends];
export const tableOf = (key: string) => TABLES.find((t) => t.key === key) ?? null;
