/**
 * Starting-hand strength, measured once with the evaluator (40,000 deals per class; see the Node
 * tests): each class's equity against one random hand (HU) and against three (M3), per mille, on a
 * 13 × 13 grid: row > column suited, row < column offsuit, the diagonal pairs. From them, every
 * one of the 1,326 two-card combos ranked best first: the AI's ranges are "the top x %" of it.
 */

const HU = [511,325,334,343,338,346,372,389,415,442,474,505,548,361,534,353,360,364,367,375,401,425,452,479,511,559,366,386,570,378,382,383,395,406,431,462,490,522,568,381,394,418,605,396,404,410,427,441,469,503,534,577,379,396,407,432,632,423,432,445,460,480,508,544,580,381,398,418,437,453,663,448,464,476,491,519,551,587,402,408,428,447,456,480,691,486,497,512,535,560,599,423,436,438,459,471,492,511,713,516,531,556,577,607,448,458,465,473,489,505,520,539,750,546,573,598,628,474,485,490,497,501,523,539,558,577,777,579,606,638,496,509,519,526,536,541,560,576,593,602,797,611,639,534,541,549,558,569,578,585,603,618,628,634,822,654,573,584,590,601,595,613,617,629,646,653,659,670,850];
const M3 = [217,142,147,155,145,142,150,159,170,187,203,222,254,180,240,165,171,164,163,156,168,180,191,205,227,263,186,205,264,191,182,178,175,174,187,201,214,234,273,192,213,228,287,202,195,197,192,194,207,223,244,281,185,203,224,238,315,215,210,211,214,217,235,253,273,187,199,219,231,249,343,230,234,232,237,241,264,286,193,199,217,232,246,263,377,254,255,256,261,272,297,206,208,213,229,246,270,285,416,278,280,284,295,310,215,221,227,234,249,268,287,308,453,303,312,325,337,226,235,244,247,252,271,289,309,341,492,327,334,351,243,249,256,265,270,275,297,318,342,359,536,353,369,262,271,274,284,291,303,307,327,357,370,382,583,386,297,304,307,322,314,322,338,345,372,386,398,412,637];

/** The grid cell of two hole cards. */
export function classIndex(c1: number, c2: number) {
  const r1 = c1 >> 2,
    r2 = c2 >> 2;
  const hi = Math.max(r1, r2),
    lo = Math.min(r1, r2);
  if (hi === lo) return hi * 13 + hi;
  return (c1 & 3) === (c2 & 3) ? hi * 13 + lo : lo * 13 + hi;
}

const score = (i: number) => HU[i] + 1.5 * M3[i];
const ORDER = Array.from({ length: 169 }, (_, i) => i).sort((a, b) => score(b) - score(a));
const COMBOS_OF = (i: number) => (Math.floor(i / 13) === i % 13 ? 6 : Math.floor(i / 13) > i % 13 ? 4 : 12);

/** Each class's place in the ranking as a fraction of all combos (0 = aces … about 1 = 3-2 offsuit). */
export const PCT = new Float32Array(169);
{
  let acc = 0;
  for (const i of ORDER) {
    PCT[i] = (acc + COMBOS_OF(i) / 2) / 1326;
    acc += COMBOS_OF(i);
  }
}

/** All 1,326 combos (c1 * 52 + c2), strongest first: a "top x %" range is a prefix of it. */
export const COMBOS = new Int16Array(1326);
{
  const list: number[] = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) list.push(a * 52 + b);
  list.sort((x, y) => PCT[classIndex(Math.floor(x / 52), x % 52)] - PCT[classIndex(Math.floor(y / 52), y % 52)]);
  COMBOS.set(list);
}

/** Two hole cards' percentile (0 best, 1 worst). */
export const handPct = (c1: number, c2: number) => PCT[classIndex(c1, c2)];
/** Equity against one random hand (0…1). */
export const huEquity = (c1: number, c2: number) => HU[classIndex(c1, c2)] / 1000;
/** Equity against three random hands (0…1). */
export const m3Equity = (c1: number, c2: number) => M3[classIndex(c1, c2)] / 1000;
