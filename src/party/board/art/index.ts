/**
 * The boards' own looks: every board/art/<key>.ts exports a MapArt (decor.ts) as its default, found
 * here by its key; nothing to register by hand. A board without one is dressed by the shared kit
 * alone (its landmarks of the shared kinds, its ArtStyle).
 */
import type { MapArt } from "../decor";

const mods = import.meta.glob<{ default?: MapArt }>(["./*.ts", "!./index.ts"], { eager: true });
const ARTS = new Map<string, MapArt>();
for (const m of Object.values(mods)) if (m.default?.key) ARTS.set(m.default.key, m.default);

/** The look of board `key`, if it has one of its own. */
export const artOf = (key: string): MapArt | null => ARTS.get(key) ?? null;
