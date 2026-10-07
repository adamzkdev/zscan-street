/**
 * zkSNARKs #1, the collection's original (it is also the collection logo): a hooded figure, a void
 * for a face with two Volt-green eyes, its Dusty Rose cloak dissolving into loose pixels on the
 * left. 26×26 pixels, top row first; "." is the black background (transparent).
 * Source: https://api.zscan.cash/v1/collections/zksnarks/items/1/image
 */
export const SNARK1_PALETTE: Record<string, string> = {
  a: "#9b526b", // cloak shadow (mauve)
  b: "#e8bcc7", // cloak highlight (pale pink)
  c: "#392c35", // hood rim
  d: "#ca8197", // cloak (dusty rose)
  e: "#140f13", // the void
  f: "#d3fc7e", // eyes (Volt)
};

export const SNARK1 = [
  "..........................",
  "..........................",
  "..........................",
  "..........................",
  "..........................",
  "..........................",
  ".....ab..aaaccccccc.......",
  ".......adddccceeeecc......",
  "...ab.aaaddcceeeeeee......",
  ".....adddacceeeeeeeec.....",
  "........aacceeeeeeeec.....",
  "...a.addddcceeeeeeeee.....",
  "......adddcceeeeeeeee.....",
  "........aacceeffeeffe.....",
  "....b..aadcceeffeeffe.....",
  ".....addddcceeeeeeeee.....",
  "..ab....aacceeeeeeeee.....",
  ".........accceeeeeeec.....",
  "......aadddcceeeeeee......",
  ".........abdccceeecc......",
  "....ab..abbbbdccccc.......",
  "......aaddbbbbbbbbbd......",
  ".......aaddddbbbbdddd.....",
  "...addddaaaaaaaaaaaaa.....",
  ".....aaadddaaaaaaaaddd....",
  "....abaaaaaddddddddddd....",
];

/** A 3×5 pixel font for engraved and painted lettering (rows top first, "#" = ink). */
const FONT: Record<string, string> = {
  A: "###|#.#|###|#.#|#.#", B: "##.|#.#|##.|#.#|##.", C: "###|#..|#..|#..|###", D: "##.|#.#|#.#|#.#|##.",
  E: "###|#..|##.|#..|###", F: "###|#..|##.|#..|#..", G: "###|#..|#.#|#.#|###", H: "#.#|#.#|###|#.#|#.#",
  I: "###|.#.|.#.|.#.|###", J: "..#|..#|..#|#.#|###", K: "#.#|#.#|##.|#.#|#.#", L: "#..|#..|#..|#..|###",
  M: "#.#|###|###|#.#|#.#", N: "##.|#.#|#.#|#.#|#.#", O: "###|#.#|#.#|#.#|###", P: "###|#.#|###|#..|#..",
  Q: "###|#.#|#.#|###|..#", R: "##.|#.#|##.|#.#|#.#", S: "###|#..|###|..#|###", T: "###|.#.|.#.|.#.|.#.",
  U: "#.#|#.#|#.#|#.#|###", V: "#.#|#.#|#.#|#.#|.#.", W: "#.#|#.#|###|###|#.#", X: "#.#|#.#|.#.|#.#|#.#",
  Y: "#.#|#.#|.#.|.#.|.#.", Z: "###|..#|.#.|#..|###", "0": "###|#.#|#.#|#.#|###", "1": ".#.|##.|.#.|.#.|###",
  "2": "###|..#|###|#..|###", "3": "###|..#|.##|..#|###", "4": "#.#|#.#|###|..#|..#", "5": "###|#..|###|..#|###",
  "6": "###|#..|###|#.#|###", "7": "###|..#|..#|.#.|.#.", "8": "###|#.#|###|#.#|###", "9": "###|#.#|###|..#|###",
  "-": "...|...|###|...|...", ".": "...|...|...|...|.#.", " ": "...|...|...|...|...", "/": "..#|..#|.#.|#..|#..",
};

/** Width in pixels of `text` in the 3×5 font, one pixel between letters. */
export const textWidth = (text: string) => Math.max(0, text.length * 4 - 1);

/** Calls `ink(px, py)` for each inked pixel of `text`, py = 0 the top row. */
export function glyphs(text: string, ink: (px: number, py: number) => void) {
  let ox = 0;
  for (const ch of text.toUpperCase()) {
    const g = FONT[ch] ?? FONT[" "];
    g.split("|").forEach((row, py) => [...row].forEach((c, px) => c === "#" && ink(ox + px, py)));
    ox += 4;
  }
}
