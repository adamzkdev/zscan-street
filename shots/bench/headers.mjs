// The cache headers the city wants from its host (the production server's rules; shots/bench/prodserve.mjs
// serves the build with them): the hashed bundles for a year, the files whose names never change for an
// hour then revalidated in the background, the page itself always revalidated.
export const CACHE_RULES = [
  // Vite's hashed output: a new release is new names
  [/^\/assets\//, "public, max-age=31536000, immutable"],
  // the fonts' files (Google's own names, a new version is a new name); their stylesheet is not hashed
  [/^\/fonts\/.+\.woff2$/, "public, max-age=31536000, immutable"],
  [/^\/(fonts|audio|cinema|memes|university|wasm)\//, "public, max-age=3600, stale-while-revalidate=604800"],
  [/^\/(icon-192|icon-512|icon-maskable-512|apple-touch-icon)\.png$|^\/manifest\.webmanifest$|^\/icon\.svg$/, "public, max-age=3600, stale-while-revalidate=604800"],
];
export const DEFAULT_CACHE = "public, max-age=0, must-revalidate";
export const cacheFor = (path) => CACHE_RULES.find(([re]) => re.test(path))?.[1] ?? DEFAULT_CACHE;
