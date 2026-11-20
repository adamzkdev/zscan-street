/**
 * FedosArt, the artist behind zkSNARKs: his works (as sold in prints on INPRNT, images in
 * public/art/fedosart, cropped from the gallery's own previews), his zkSNARK and where to find him.
 */

/** His own zkSNARK: the red portal (Lineage 0dB, Skin Infrared, Eyes Shielded). */
export const FEDOS_SNARK = 9593;

export interface Work {
  slug: string;
  title: string;
  /** Image size in pixels (its proportions on the wall). */
  w: number;
  h: number;
}

const PRINTS = "https://www.inprnt.com/gallery/fedosart";
export const workImage = (w: Work) => `${import.meta.env.BASE_URL}art/fedosart/${w.slug}.jpg`;
export const workPrints = (w: Work) => `${PRINTS}/${w.slug}/`;

export const LINKS = [
  {
    key: "gumroad",
    name: "GUMROAD",
    line: "brushes · wallpapers",
    href: "https://fedosarts.gumroad.com/",
    color: "#ff90e8",
  },
  {
    key: "instagram",
    name: "INSTAGRAM",
    line: "@fedos.art",
    href: "https://www.instagram.com/fedos.art",
    color: "#e8a0ff",
  },
  {
    key: "patreon",
    name: "PATREON",
    line: "FedosArts",
    href: "https://www.patreon.com/cw/FedosArts",
    color: "#ff6a5c",
  },
  {
    key: "paypal",
    name: "PAYPAL",
    line: "paypal.me/fedosart",
    href: "https://www.paypal.com/paypalme/fedosart",
    color: "#6ab0ff",
  },
  {
    key: "inprnt",
    name: "INPRNT",
    line: "gallery prints",
    href: `${PRINTS}/`,
    color: "#f4d27a",
  },
] as const;

/** Real lines, his own words (the brush pack, the wallpapers, the support page). */
export const SAYS = [
  "Each brush carries a memory, a texture, a motion, a rhythm.",
  "A collection of custom brushes I've created and refined over years of daily work.",
  "Use them to explore light, form, and movement the way reality dissolves into feeling.",
  "Bring my worlds to your devices.",
  "Your support helps me keep creating.",
];

/** The rotunda's walls, in hanging order (the INPRNT gallery's, newest first). */
export const WORKS: Work[] = [
  { slug: "for-dark", title: "For Dark", w: 514, h: 686 },
  {
    slug: "the-fallen-lightwarrior-echoes-of-his-origin",
    title: "The Fallen LightWarrior: Echoes of His Origin",
    w: 516,
    h: 686,
  },
  {
    slug: "the-fallen-lightwarrior",
    title: "The Fallen LightWarrior",
    w: 514,
    h: 686,
  },
  { slug: "memory-fades", title: "Memory Fades", w: 514, h: 686 },
  { slug: "for-light-2", title: "For Light 2", w: 514, h: 686 },
  { slug: "for-light-1", title: "For Light 1", w: 514, h: 686 },
  {
    slug: "the-forgotten-path-2",
    title: "The Forgotten Path 2",
    w: 514,
    h: 686,
  },
  {
    slug: "lightwarrior-state-3",
    title: "LightWarrior State 3",
    w: 514,
    h: 686,
  },
  {
    slug: "a-path-through-dreams",
    title: "A Path Through Dreams",
    w: 514,
    h: 686,
  },
  {
    slug: "the-last-lightbearer",
    title: "The Last LightBearer",
    w: 514,
    h: 686,
  },
  {
    slug: "at-the-gate-of-the-forgotten-layer",
    title: "At the Gate of the Forgotten Layer",
    w: 513,
    h: 686,
  },
  { slug: "addicted", title: "Addicted", w: 514, h: 686 },
  { slug: "fragment-control", title: "Fragment Control", w: 514, h: 686 },
  { slug: "back-to-citadel", title: "Back to Citadel", w: 514, h: 686 },
  { slug: "stellar-knight", title: "Stellar Knight", w: 514, h: 686 },
  {
    slug: "forgotten-lore-distance",
    title: "Forgotten Lore Distance",
    w: 514,
    h: 686,
  },
  { slug: "the-forgotten-path", title: "The Forgotten Path", w: 512, h: 686 },
  { slug: "once-sky-flows", title: "Once Sky Flows", w: 532, h: 666 },
  { slug: "baal-2", title: "Baal 2", w: 514, h: 686 },
  { slug: "baal", title: "Baal", w: 514, h: 686 },
  {
    slug: "irreversible-desire-to-live",
    title: "Irreversible Desire to Live",
    w: 532,
    h: 666,
  },
  { slug: "return", title: "Return", w: 540, h: 686 },
  {
    slug: "a-loss-of-self-in-the-space",
    title: "A Loss of Self in the Space",
    w: 542,
    h: 686,
  },
  {
    slug: "you-have-the-right-to-the-fog",
    title: "You Have the Right to the Fog",
    w: 514,
    h: 686,
  },
  { slug: "at-the-gate", title: "At the Gate", w: 514, h: 686 },
  {
    slug: "lightwarrior-state-2",
    title: "LightWarrior State 2",
    w: 532,
    h: 686,
  },
  {
    slug: "lightwarrior-state-1",
    title: "LightWarrior State 1",
    w: 514,
    h: 686,
  },
  { slug: "the-lightwarrior", title: "The Lightwarrior", w: 514, h: 686 },
  {
    slug: "repetition-of-presence",
    title: "Repetition of Presence",
    w: 514,
    h: 686,
  },
  { slug: "filling-2", title: "Filling 2", w: 532, h: 666 },
  { slug: "filling", title: "Filling", w: 532, h: 666 },
];

/** The two wide ones, either side of the corridor from the lift. */
export const CORRIDOR: Work[] = [
  {
    slug: "shuttle-of-obscurity",
    title: "Shuttle of Obscurity",
    w: 686,
    h: 548,
  },
  { slug: "filling-3", title: "Filling 3", w: 714, h: 268 },
];
