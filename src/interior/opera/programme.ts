/**
 * The Concert Hall's programme: one piece per block. Each block that lands ends the piece being
 * played (the hall applauds, the curtain falls) and the next one, chosen by the block's height,
 * begins. Real public-domain recordings (public/audio/music, credits in public/audio/CREDITS.md),
 * trimmed to an excerpt of about a block's length.
 */

/** Who is on stage besides the orchestra and its conductor. */
export type Staging = "orchestra" | "violin" | "flute" | "baritone" | "soprano" | "duet" | "ballet" | "waltz";

export interface Piece {
  /** public/audio/music/<track>.m4a */
  track: string;
  composer: string;
  title: string;
  /** The movement or the act. */
  part: string;
  staging: Staging;
  /** Who plays it, for the programme. */
  by: string;
  /** What the hall's surtitles show while it plays. */
  line: string;
}

export const PROGRAMME: Piece[] = [
  {
    track: "op-vivaldi",
    composer: "Vivaldi",
    title: "The Four Seasons · Spring",
    part: "I. Allegro",
    staging: "violin",
    by: "violin solo & strings",
    line: "Spring has come, the birds greet it with song",
  },
  { track: "op-figaro", composer: "Mozart", title: "The Marriage of Figaro", part: "Overture", staging: "orchestra", by: "full orchestra", line: "A crazy day begins" },
  { track: "op-beethoven5", composer: "Beethoven", title: "Symphony No. 5", part: "I. Allegro con brio", staging: "orchestra", by: "full orchestra", line: "Fate knocks at the door" },
  { track: "op-swanlake", composer: "Tchaikovsky", title: "Swan Lake", part: "Act II · Scene", staging: "ballet", by: "corps de ballet", line: "By the lake, the swans at moonrise" },
  { track: "op-badinerie", composer: "J. S. Bach", title: "Orchestral Suite No. 2", part: "Badinerie", staging: "flute", by: "flute solo & strings", line: "A jest for flute" },
  { track: "op-traviata", composer: "Verdi", title: "La Traviata", part: "Libiamo ne' lieti calici", staging: "duet", by: "soprano, tenor & orchestra", line: "Let us drink from the joyful cups" },
  {
    track: "op-newworld",
    composer: "Dvořák",
    title: "Symphony No. 9 'From the New World'",
    part: "IV. Allegro con fuoco",
    staging: "orchestra",
    by: "full orchestra",
    line: "A new world, with fire",
  },
  { track: "op-toreador", composer: "Bizet", title: "Carmen", part: "Toreador Song", staging: "baritone", by: "baritone, chorus & orchestra", line: "Toréador, en garde !" },
  { track: "op-danube", composer: "Johann Strauss II", title: "The Blue Danube", part: "Waltz", staging: "waltz", by: "orchestra & dancers", line: "One two three, one two three" },
  { track: "op-puccini", composer: "Puccini", title: "Gianni Schicchi", part: "O mio babbino caro", staging: "soprano", by: "Frances Alda, soprano (1919)", line: "Oh my dear papa, I love him" },
  { track: "op-mountainking", composer: "Grieg", title: "Peer Gynt", part: "In the Hall of the Mountain King", staging: "orchestra", by: "full orchestra", line: "The trolls wake up" },
];

/** The piece a block gets (every visitor hears the same one). */
export function pieceFor(height: number) {
  return PROGRAMME[((height % PROGRAMME.length) + PROGRAMME.length) % PROGRAMME.length];
}
