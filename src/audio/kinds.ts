/**
 * The party audio engine's names (types only, so the game data can name them without pulling in the
 * engine): the ambience beds and the reverb rooms. See ./ambience.ts and ./engine.ts.
 */

/**
 * A looping ambience bed (procedural, ./ambience.ts):
 * - `city-day` traffic hum, birds, a far horn · `city-night` a low hum, crickets, a far siren
 * - `meadow` a breeze, birdsong, insects · `wind` the steppe: wind, gusts, blowing snow
 * - `rain` rain on roofs and puddles, far thunder · `storm` a downpour, gale and thunder
 * - `sea` waves, gulls, a buoy bell (a harbour) · `crowd` a stadium's murmur, claps, whistles
 * - `club` a packed room's chatter and whoops · `space` a station's hum, servos, beeps
 * - `foundry` rumble, clanks, steam · `market` chatter, sizzling woks, a far bell
 * - `cave` drips, a low draught, far rumbles · `train` a carriage: rumble and the rail joints
 */
export type AmbienceKind = "city-day" | "city-night" | "meadow" | "wind" | "rain" | "storm" | "sea" | "crowd" | "club" | "space" | "foundry" | "market" | "cave" | "train";

/** A reverb room (./engine.ts): the space the sound effects ring in. */
export type RoomKind = "outdoor" | "club" | "hall" | "space" | "cave";
