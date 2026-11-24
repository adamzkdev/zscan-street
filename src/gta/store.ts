import * as THREE from "three";
import { Economy } from "./economy";

/**
 * The STORE's VEHICLES (src/gta): what your ⓩ buy for your rides — paint for your ZK-GT, the neon
 * under its sills, its rims, the ZK-R bike's paint, the horn. Bought through the game's economy
 * (economy.ts: the one ⓩ purse, owned items under "vehicle"); what you wear stays in this browser.
 * The GT and the bike are built in what you wear (vehicle.ts reads `gtStyle()` and `bikeStyle()`),
 * the horn plays what you picked (sound.ts reads `hornSpec()`).
 *
 * While the store is open its picks are previewed on the car standing in the street (`preview`).
 */

export type StoreCat = "paint" | "neon" | "rims" | "bike" | "horn";

export interface StoreItem {
  id: string;
  cat: StoreCat;
  name: string;
  /** ⓩ (0: yours from the start). */
  price: number;
  /** A colour (paint, neon, rims, bike) or a horn's notes. */
  color?: string;
  /** The cabin's colour that goes with a paint (two-tone). */
  accent?: string;
  finish?: "metal" | "solid" | "matte";
  horn?: { notes: number[]; wave: OscillatorType; line: string };
}

export const CATS: { key: StoreCat; label: string }[] = [
  { key: "paint", label: "Paint" },
  { key: "neon", label: "Neon" },
  { key: "rims", label: "Rims" },
  { key: "bike", label: "Bike" },
  { key: "horn", label: "Horn" },
];

export const CATALOG: StoreItem[] = [
  // the ZK-GT's paint
  { id: "paint-gold", cat: "paint", name: "Zcash Gold", price: 0, color: "#e8a91c", accent: "#141418" },
  { id: "paint-black", cat: "paint", name: "Midnight", price: 150, color: "#15161b", accent: "#e8a91c" },
  { id: "paint-pearl", cat: "paint", name: "Pearl", price: 150, color: "#ece9e2", accent: "#141418" },
  { id: "paint-red", cat: "paint", name: "Orchard Red", price: 250, color: "#c01826", accent: "#141418" },
  { id: "paint-teal", cat: "paint", name: "Shielded Teal", price: 250, color: "#15a59a", accent: "#0f1418" },
  { id: "paint-violet", cat: "paint", name: "Halo Violet", price: 300, color: "#6b2fd6", accent: "#141418" },
  { id: "paint-pink", cat: "paint", name: "Bay Pink", price: 300, color: "#ff5aa5", accent: "#ffffff" },
  { id: "paint-lime", cat: "paint", name: "Sapling", price: 300, color: "#7ad12e", accent: "#141418" },
  { id: "paint-blue", cat: "paint", name: "Nullifier Blue", price: 350, color: "#1f4fd8", accent: "#ece9e2" },
  { id: "paint-matte", cat: "paint", name: "Stealth Matte", price: 500, color: "#3a3d44", accent: "#111216", finish: "matte" },
  // the neon under the sills
  { id: "neon-gold", cat: "neon", name: "Gold", price: 0, color: "#f4b728" },
  { id: "neon-off", cat: "neon", name: "Off", price: 0, color: "" },
  { id: "neon-teal", cat: "neon", name: "Teal", price: 100, color: "#3ef0ff" },
  { id: "neon-pink", cat: "neon", name: "Pink", price: 100, color: "#ff3e8a" },
  { id: "neon-violet", cat: "neon", name: "Violet", price: 120, color: "#b07bff" },
  { id: "neon-green", cat: "neon", name: "Green", price: 120, color: "#3dff9e" },
  { id: "neon-white", cat: "neon", name: "White", price: 150, color: "#f2f6ff" },
  // the rims
  { id: "rims-gold", cat: "rims", name: "Gold", price: 0, color: "#f0c050" },
  { id: "rims-silver", cat: "rims", name: "Silver", price: 0, color: "#ffffff" },
  { id: "rims-black", cat: "rims", name: "Gloss Black", price: 120, color: "#3a3a40" },
  { id: "rims-bronze", cat: "rims", name: "Bronze", price: 150, color: "#c08850" },
  { id: "rims-red", cat: "rims", name: "Red", price: 180, color: "#e04050" },
  { id: "rims-teal", cat: "rims", name: "Teal", price: 180, color: "#40d8d0" },
  // the ZK-R's paint
  { id: "bike-gold", cat: "bike", name: "Zcash Gold", price: 0, color: "#e8a91c", accent: "#141418" },
  { id: "bike-black", cat: "bike", name: "Midnight", price: 120, color: "#16171c", accent: "#e8a91c" },
  { id: "bike-red", cat: "bike", name: "Race Red", price: 180, color: "#c8101e", accent: "#f2f2f2" },
  { id: "bike-teal", cat: "bike", name: "Teal", price: 180, color: "#15a59a", accent: "#141418" },
  { id: "bike-white", cat: "bike", name: "Pearl", price: 200, color: "#ece9e2", accent: "#c8101e" },
  // the horn
  { id: "horn-classic", cat: "horn", name: "Classic", price: 0, horn: { notes: [392, 494], wave: "square", line: "Two tones, the street's own" } },
  { id: "horn-truck", cat: "horn", name: "Air Horn", price: 150, horn: { notes: [146.8, 174.6, 220], wave: "sawtooth", line: "A truck's three tones" } },
  { id: "horn-retro", cat: "horn", name: "Retro", price: 150, horn: { notes: [523.3, 659.3], wave: "triangle", line: "A little old coupé" } },
  { id: "horn-chord", cat: "horn", name: "Shielded Chord", price: 250, horn: { notes: [261.6, 329.6, 392, 523.3], wave: "sawtooth", line: "A major chord, full" } },
  { id: "horn-deep", cat: "horn", name: "Deep", price: 250, horn: { notes: [98, 123.5], wave: "sawtooth", line: "Low and loud" } },
];

const KEY = "zstreet.gta.store";
/** What you wear (what you own: Economy, "vehicle"). */
interface State {
  wear: Record<StoreCat, string>;
}
const DEFAULT: State = { wear: { paint: "paint-gold", neon: "neon-gold", rims: "rims-gold", bike: "bike-gold", horn: "horn-classic" } };

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null;
    if (s?.wear) return { wear: { ...DEFAULT.wear, ...s.wear } };
  } catch {}
  return { wear: { ...DEFAULT.wear } };
}
let state = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());
// (your ⓩ changed: what you can afford too)
Economy.onChange(() => changed());

/** Store picks shown on the car while browsing (not bought, not worn): by category. */
const previews: Partial<Record<StoreCat, string>> = {};

const byId = new Map(CATALOG.map((i) => [i.id, i]));

export const Store = {
  item: (id: string) => byId.get(id) ?? null,
  of: (cat: StoreCat) => CATALOG.filter((i) => i.cat === cat),
  /** (the free ones are yours from the start) */
  owns: (id: string) => byId.get(id)?.price === 0 || Economy.owns("vehicle", id),
  wearing: (cat: StoreCat) => state.wear[cat],
  /** Your ⓩ. */
  balance: () => Economy.balance(),
  /** Items you could buy now with what you have. */
  affordable() {
    const b = this.balance();
    return CATALOG.filter((i) => !this.owns(i.id) && i.price <= b).length;
  },
  /** Buy it (and wear it): false if you can't afford it. */
  buy(id: string) {
    const it = byId.get(id);
    if (!it) return false;
    if (!this.owns(id) && !Economy.buy({ cat: "vehicle", id, name: it.name, price: it.price })) return false;
    state.wear[it.cat] = id;
    save();
    changed();
    return true;
  },
  /** Wear something you own. */
  wear(id: string) {
    const it = byId.get(id);
    if (!it || !this.owns(id)) return false;
    state.wear[it.cat] = id;
    save();
    changed();
    return true;
  },
  /** Show `id` on the car while browsing (null: what you wear). */
  preview(cat: StoreCat, id: string | null) {
    if (id) previews[cat] = id;
    else delete previews[cat];
    changed();
  },
  clearPreview() {
    for (const k of Object.keys(previews)) delete previews[k as StoreCat];
    changed();
  },
  onChange(f: () => void) {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};

/** What shows for a category: the preview while browsing, else what you wear. */
const shown = (cat: StoreCat) => byId.get(previews[cat] ?? state.wear[cat]) ?? byId.get(DEFAULT.wear[cat])!;

/** The ZK-GT as you have it (carObject's style + the rims' colour). */
export function gtStyle(): { paint: string; accent: string; glow?: string; finish?: "metal" | "solid" | "matte"; rims: string } {
  const p = shown("paint"),
    n = shown("neon"),
    r = shown("rims");
  return { paint: p.color!, accent: p.accent ?? "#141418", ...(n.color ? { glow: n.color } : {}), ...(p.finish ? { finish: p.finish } : {}), rims: r.color! };
}

/** The ZK-R as you have it. */
export function bikeStyle(): { paint: string; accent: string } {
  const b = shown("bike");
  return { paint: b.color!, accent: b.accent ?? "#141418" };
}

/** The horn you picked. */
export function hornSpec() {
  return shown("horn").horn ?? { notes: [392, 494], wave: "square" as OscillatorType, line: "" };
}

/** The rims in a colour: the wheels' shared material tinted (the tyres stay black: their colour is dark). */
const rimMats = new Map<string, THREE.Material>();
export function tintRims(g: THREE.Object3D, color: string) {
  if (!color || color.toLowerCase() === "#ffffff") return;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !o.parent || o.parent.parent?.name !== "wheel") return;
    const base = m.material as THREE.MeshStandardMaterial;
    const key = `${base.uuid}|${color}`;
    let t = rimMats.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!t) {
      t = base.clone();
      t.color = new THREE.Color(color);
      t.userData.shared = true;
      rimMats.set(key, t);
    }
    m.material = t;
  });
}
