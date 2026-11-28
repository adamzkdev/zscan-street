import "./home.css";
import { Economy, type StoreTab, type StoreTabContext } from "./economy";
import { VILLA } from "../scene/keys/plan";

/**
 * Your home (src/gta): a villa of your own, Vice City style — Shielded Point, a waterfront estate on
 * Orchard Keys' north point across the Golden Gate (its outside: scene/keys/villa.ts), where PLAY
 * starts you and the house you furnish. This module is light (the store mounts it at boot): the
 * catalog of furniture (prices in ⓩ, owned through economy.ts under "home"), where each piece stands
 * (kept in this browser), the STORE › HOME tab, and the hooks the villa's interior (src/interior/home)
 * and the furnishing mode (src/gta/homeedit.ts) talk through.
 *
 *   Home.catalog()                 every piece for sale
 *   Home.owned() / Home.owns(id)   what you have (Economy.owned("home"))
 *   Home.placed()                  where the placed ones stand (local metres in the villa)
 *   Home.place(id, x, z, rot)      put a piece there (moves it if placed already)
 *   Home.store(id)                 back into storage
 *   Home.onChange(fn)              any change of the layout or of what you own
 */

export type HomeRoom = "living" | "dining" | "bedroom" | "art" | "tech" | "plants" | "fitness";
export type HomeIcon = "sofa" | "chair" | "table" | "rug" | "lamp" | "tv" | "desk" | "shelf" | "bed" | "plant" | "tree" | "frame" | "neon" | "piano" | "gym" | "wardrobe";

export interface HomePiece {
  id: string;
  name: string;
  room: HomeRoom;
  price: number;
  icon: HomeIcon;
  /** A colour for its tile. */
  swatch: string;
  /** On a wall (prints, signs): snapped to the nearest wall, hung at eye height. */
  wall?: boolean;
  /** One line for the store. */
  blurb: string;
  /** A zkSNARK's picture (prints). */
  snark?: number;
}

const p = (id: string, name: string, room: HomeRoom, price: number, icon: HomeIcon, swatch: string, blurb: string, o: Partial<HomePiece> = {}): HomePiece => ({ id, name, room, price, icon, swatch, blurb, ...o });

export const HOME_CATALOG: HomePiece[] = [
  // living
  p("sofa-charcoal", "Sofa · charcoal", "living", 900, "sofa", "#3a3d46", "Three deep seats in charcoal wool, two cushions."),
  p("sofa-emerald", "Velvet sofa · emerald", "living", 1400, "sofa", "#1f5a46", "Emerald velvet, brass feet, a statement."),
  p("sofa-sand", "Sofa · sand", "living", 1100, "sofa", "#c9b48e", "Sand linen, low and wide."),
  p("club-chair", "Leather club chair", "living", 520, "chair", "#6a3a22", "Cognac leather, made for a long block."),
  p("velvet-chair", "Velvet armchair", "living", 380, "chair", "#7a2f4a", "Plum velvet on brass legs."),
  p("armchair-grey", "Armchair · grey", "living", 300, "chair", "#8a8e96", "Soft grey, by the window."),
  p("coffee-table", "Marble coffee table", "living", 320, "table", "#e8e4dc", "Carrara top, walnut base."),
  p("side-lamp", "Side table and lamp", "living", 220, "lamp", "#c9a227", "Brass side table with its lamp."),
  p("floor-lamp", "Arc floor lamp", "living", 160, "lamp", "#c9a227", "Warm light over the sofa."),
  p("rug-gold", "Rug · gold border", "living", 240, "rug", "#3a3d46", "Charcoal wool, a gold edge."),
  p("rug-terracotta", "Rug · terracotta", "living", 260, "rug", "#a8553a", "Terracotta and cream."),
  p("bookshelf", "Bookshelf", "living", 350, "shelf", "#9a6a42", "Walnut, full of whitepapers."),
  p("piano", "Grand piano", "living", 4200, "piano", "#141418", "A concert grand in black lacquer."),
  // dining
  p("dining-6", "Dining table for six", "dining", 760, "table", "#8a5a3a", "Oak table, six upholstered chairs."),
  p("dining-4", "Bistro table for four", "dining", 420, "table", "#c08a5a", "A round table for four."),
  // bedroom
  p("bed-king", "King bed", "bedroom", 1300, "bed", "#2f3a52", "Upholstered headboard, crisp linen."),
  p("bed-double", "Double bed", "bedroom", 700, "bed", "#7a6a5a", "Oak frame, a warm duvet."),
  p("wardrobe", "Wardrobe", "bedroom", 420, "wardrobe", "#d8d2c6", "Two doors, full height."),
  p("nightstand", "Nightstand", "bedroom", 120, "table", "#9a6a42", "A drawer for your seed phrase. Don't."),
  // tech
  p("tv-wall", "85-inch TV", "tech", 1500, "tv", "#101014", "ZStreet TV: the chain, live, all day."),
  p("gaming", "Gaming setup", "tech", 1800, "desk", "#3ef0ff", "A desk, two screens glowing, a racing chair."),
  p("desk", "Writing desk", "tech", 450, "desk", "#9a6a42", "Walnut, for signing transactions by hand."),
  // art (wall)
  p("print-1", "zkSNARK #1 print", "art", 900, "frame", "#f4b728", "The first of the 10,000, framed in gold.", { wall: true, snark: 1 }),
  p("print-9593", "zkSNARK #9593 print", "art", 1200, "frame", "#e8463a", "FedosArt's own, framed.", { wall: true, snark: 9593 }),
  p("print-1337", "zkSNARK #1337 print", "art", 700, "frame", "#3ef0ff", "Leet, framed in black.", { wall: true, snark: 1337 }),
  p("print-4071", "zkSNARK #4071 print", "art", 600, "frame", "#b07bff", "A night one, framed.", { wall: true, snark: 4071 }),
  p("neon-zec", "ZEC neon sign", "art", 500, "neon", "#f4b728", "Gold neon tubes: ZEC.", { wall: true }),
  p("neon-shielded", "SHIELDED neon sign", "art", 550, "neon", "#3ef0ff", "Cyan neon: SHIELDED.", { wall: true }),
  // plants
  p("monstera", "Monstera", "plants", 120, "plant", "#2f7a46", "Big leaves in a white pot."),
  p("ficus", "Ficus", "plants", 150, "plant", "#3a8a4a", "A tall ficus in a black pot."),
  p("cactus", "Cactus", "plants", 90, "plant", "#4a8a52", "Low maintenance, like a full node."),
  p("indoor-tree", "Indoor olive tree", "plants", 380, "tree", "#6a8a4a", "A tree in a big planter."),
  // fitness
  p("treadmill", "Treadmill", "fitness", 900, "gym", "#c8202e", "Run while the mempool clears."),
  p("bike", "Exercise bike", "fitness", 700, "gym", "#c8202e", "Spin class, private."),
];

export const ROOMS: [HomeRoom | "all", string][] = [
  ["all", "All"],
  ["living", "Living"],
  ["dining", "Dining"],
  ["bedroom", "Bedroom"],
  ["tech", "Tech"],
  ["art", "Art"],
  ["plants", "Plants"],
  ["fitness", "Fitness"],
];

export interface Placed {
  id: string;
  /** In the villa's own metres: x across (east +), z from the front door (negative inward, toward the sea). */
  x: number;
  z: number;
  rot: number;
}

/**
 * The villa comes furnished, a mansion's way: these are yours and in place on the first visit.
 * The great room's lounge faces the sea (the long sofa, its two armchairs either side of the low
 * marble table on the gold-edged rug, a lamp at each end); by the bedroom wing's wall the TV, its
 * sofa and the terracotta rug; the bookshelf, an olive tree and a cactus by the door; the dining
 * table for six by the kitchen's glass; the king bed against the bedroom's wall, its foot to the sea,
 * its nightstand and the wardrobe; zkSNARK #1 and #9593 framed on the walls; plants at the glass.
 * What you buy in the store joins them (B at home to place it).
 */
const STARTER: Placed[] = [
  { id: "sofa-charcoal", x: -1.0, z: -4.5, rot: Math.PI },
  { id: "coffee-table", x: -1.0, z: -6.1, rot: 0 },
  { id: "rug-gold", x: -1.0, z: -6.0, rot: 0 },
  { id: "armchair-grey", x: -3.7, z: -6.0, rot: Math.PI / 2 },
  { id: "velvet-chair", x: 1.5, z: -6.2, rot: -Math.PI / 2 },
  { id: "floor-lamp", x: -3.6, z: -4.4, rot: 0 },
  { id: "side-lamp", x: 0.85, z: -4.45, rot: 0 },
  { id: "tv-wall", x: 6.66, z: -6.0, rot: -Math.PI / 2 },
  { id: "sofa-sand", x: 4.4, z: -6.0, rot: Math.PI / 2 },
  { id: "rug-terracotta", x: 5.3, z: -6.0, rot: Math.PI / 2 },
  { id: "bookshelf", x: -5.85, z: -0.31, rot: Math.PI },
  { id: "indoor-tree", x: -5.6, z: -1.6, rot: 0 },
  { id: "cactus", x: 5.9, z: -1.0, rot: 0 },
  { id: "dining-6", x: -10.6, z: -7.4, rot: 0 },
  { id: "bed-king", x: 12.6, z: -5.45, rot: Math.PI },
  { id: "nightstand", x: 11.15, z: -4.6, rot: Math.PI },
  { id: "wardrobe", x: 7.4, z: -7.6, rot: Math.PI / 2 },
  { id: "monstera", x: -6.4, z: -9.7, rot: 0 },
  { id: "ficus", x: 6.4, z: -9.7, rot: 0 },
  { id: "print-1", x: 5.8, z: -0.1, rot: Math.PI },
  { id: "print-9593", x: 15.6, z: -4.3, rot: Math.PI },
];

/** Where your home is: its front door on the plot, the way out of it, where your car waits, the rooms' view. */
export interface HomeSite {
  door: { x: number; z: number };
  out: { x: number; z: number };
  /** Your ZK-GT and your bike, parked (world metres; yaw as a car's: 0 points it along +x). */
  car: { x: number; z: number; yaw: number };
  bike?: { x: number; z: number; yaw: number };
  /**
   * The rooms' glass and what it looks at (ctx.cityView, from the door): the eye `up` over the door's
   * kerb, `back` metres in from the door and `side` across (world), the panorama turned by `yaw` (the
   * rooms' back, local −z, looks that way).
   */
  view: { up: number; back: number; side: number; yaw: number };
  name: string;
}

/** Your villa, from the plan (scene/keys/plan.ts VILLA): its door faces the street (+z), its glass the sea. */
export function villaSite(): HomeSite {
  const V = VILLA;
  return {
    door: { ...V.door },
    out: { x: 0, z: 1 },
    car: { ...V.car },
    bike: { ...V.bike },
    // from the great room, by its glass on the strait: the Golden Gate, the city across the water
    view: { up: V.floor - 0.2 + 1.65, back: V.door.z - V.house.z0 - 1.2, side: 0, yaw: 0 },
    name: V.name,
  };
}

/**
 * The layout is kept per house: v1 was the penthouse on Park Row (its own metres), v2 is the villa.
 * Moving in: what you owned stays yours — the starter set goes where the villa has room for it,
 * everything else waits in storage (B at home to place it).
 */
const KEY = "zstreet.home.v2";
const OLD_KEY = "zstreet.home.v1";
interface Saved {
  v: 2;
  placed: Placed[];
  /** The starter set has been given (once). */
  given: boolean;
}

function load(): Saved {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (o && o.v === 2 && Array.isArray(o.placed)) return o;
    // moving in from the penthouse: its layout's metres mean nothing here
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? "null") as { given?: boolean } | null;
    if (old) {
      // (the villa's furnished set given — the pieces already owned stay owned — and placed)
      const moved: Saved = { v: 2, placed: [], given: false };
      localStorage.setItem(KEY, JSON.stringify(moved));
      localStorage.removeItem(OLD_KEY);
      return moved;
    }
  } catch {}
  return { v: 2, placed: [], given: false };
}
let saved = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {}
}

const listeners = new Set<() => void>();
const changed = () => {
  for (const f of listeners) f();
};
// (a purchase in the store: the villa's storage and the tab know at once)
Economy.onChange((e) => {
  if (e.cat === "home") changed();
});

/** The villa's interior, while it is built: where a piece may stand, and the ghost while you furnish. */
export interface HomeRoomHooks {
  /** The villa's scene (you are home when the place you are in shows it). */
  scene: object;
  /** Can `id` stand at (x, z) turned `rot` (not in a wall, not on another piece, inside the house)? */
  canPlace(id: string, x: number, z: number, rot: number): boolean;
  /** A wall piece near (x, z): the point on the nearest wall and the way it faces, or null. */
  snapWall(x: number, z: number): { x: number; z: number; rot: number } | null;
  /** A piece's footprint (metres, unturned), whether it hangs on a wall or is walked on (a rug). */
  size(id: string): { w: number; d: number; wall: boolean; walk: boolean } | null;
  /** The ghost of a piece being placed (null: none), green if it fits. */
  ghost(id: string | null, x?: number, z?: number, rot?: number, ok?: boolean): void;
  /** The placed piece just ahead of (x, z) looking along (fx, fz), or null. */
  pieceAt(x: number, z: number, fx: number, fz: number): string | null;
}
let room: HomeRoomHooks | null = null;

let site: HomeSite | null = null;

export const Home = {
  /** Your villa (main.ts sets it at boot), null until then. */
  get site() {
    return site;
  },
  setSite(s: HomeSite | null) {
    site = s;
  },
  catalog(): HomePiece[] {
    return HOME_CATALOG;
  },
  piece(id: string) {
    return HOME_CATALOG.find((x) => x.id === id) ?? null;
  },
  /** The starter set yours (owned and placed) the first time: called by the villa and the store. */
  ensure() {
    if (saved.given) return;
    saved.given = true;
    for (const s of STARTER) Economy.grant("home", s.id, "your villa");
    saved.placed = STARTER.map((s) => ({ ...s }));
    save();
  },
  owns(id: string) {
    return Economy.owns("home", id);
  },
  owned(): string[] {
    return Economy.owned("home").filter((id) => !!this.piece(id));
  },
  placed(): Placed[] {
    this.ensure();
    return saved.placed.filter((q) => this.owns(q.id));
  },
  isPlaced(id: string) {
    return saved.placed.some((q) => q.id === id);
  },
  /** Owned and not placed: in the villa's storage. */
  stored(): string[] {
    return this.owned().filter((id) => !this.isPlaced(id));
  },
  place(id: string, x: number, z: number, rot: number) {
    if (!this.owns(id)) return false;
    const i = saved.placed.findIndex((q) => q.id === id);
    const q = { id, x: +x.toFixed(3), z: +z.toFixed(3), rot: +rot.toFixed(4) };
    if (i >= 0) saved.placed[i] = q;
    else saved.placed.push(q);
    save();
    changed();
    return true;
  },
  store(id: string) {
    const n = saved.placed.length;
    saved.placed = saved.placed.filter((q) => q.id !== id);
    if (saved.placed.length !== n) {
      save();
      changed();
    }
  },
  onChange(f: () => void): () => void {
    listeners.add(f);
    return () => listeners.delete(f);
  },
  /** The villa registers itself while it is built (and null when it goes). */
  setRoom(r: HomeRoomHooks | null) {
    room = r;
  },
  get room() {
    return room;
  },
  /** For tests: forget the layout (the starter set is given again). */
  reset() {
    saved = { v: 2, placed: [], given: false };
    save();
    changed();
  },
};

// ---- the store's HOME tab --------------------------------------------------------------------------

const ICONS: Record<HomeIcon, string> = {
  sofa: `<path d="M6 30v-9a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v9"/><path d="M3 24a3 3 0 0 1 6 0v6h30v-6a3 3 0 0 1 6 0v10H3z"/><path d="M8 34v4M40 34v4"/>`,
  chair: `<path d="M13 26V12a4 4 0 0 1 4-4h14a4 4 0 0 1 4 4v14"/><path d="M9 22a3 3 0 0 1 6 0v4h18v-4a3 3 0 0 1 6 0v10H9z"/><path d="M13 32v6M35 32v6"/>`,
  table: `<path d="M5 18h38"/><path d="M8 18v18M40 18v18M14 18v12M34 18v12"/>`,
  rug: `<rect x="6" y="12" width="36" height="24" rx="2"/><rect x="11" y="17" width="26" height="14" rx="1"/>`,
  lamp: `<path d="M16 6h16l5 12H11z"/><path d="M24 18v18M16 40h16"/>`,
  tv: `<rect x="4" y="8" width="40" height="24" rx="2"/><path d="M18 40h12M24 32v8"/>`,
  desk: `<rect x="10" y="6" width="28" height="16" rx="1.5"/><path d="M4 28h40M8 28v12M40 28v12M24 22v6"/>`,
  shelf: `<rect x="10" y="4" width="28" height="40" rx="1"/><path d="M10 14h28M10 24h28M10 34h28M15 9v5M19 9v5M27 19v5M17 29v5M31 29v5"/>`,
  bed: `<path d="M4 38V14M4 26h40v12"/><path d="M4 26v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6"/><path d="M20 26v-4h24v4"/>`,
  plant: `<path d="M16 32h16l-2 10H18z"/><path d="M24 32V18M24 22c-6-1-9-6-9-12 6 1 9 5 9 12zM24 26c6-1 9-6 9-12-6 1-9 5-9 12z"/>`,
  tree: `<circle cx="24" cy="16" r="11"/><path d="M24 27v9M14 36h20l-2 6H16z"/>`,
  frame: `<rect x="8" y="6" width="32" height="36" rx="1"/><rect x="13" y="11" width="22" height="26"/><path d="M17 31l6-8 5 6 3-3 4 5"/>`,
  neon: `<path d="M10 14h12L10 34h12M28 14v20M28 14h8M28 24h6M28 34h8"/>`,
  piano: `<path d="M6 18h18c8 0 10 6 18 6v8H6z"/><path d="M6 32h36M10 32v8M38 32v8M6 26h18"/>`,
  gym: `<path d="M6 24h36M10 16v16M14 18v12M38 16v16M34 18v12"/>`,
  wardrobe: `<rect x="10" y="4" width="28" height="40" rx="1"/><path d="M24 4v40M21 22v4M27 22v4"/>`,
};
const icon = (k: HomeIcon, col: string) => `<svg class="hm-ico" viewBox="0 0 48 48" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const storeTab: StoreTab = {
  key: "home",
  mount(el: HTMLElement, ctx: StoreTabContext) {
    Home.ensure();
    let room: HomeRoom | "all" = "all";
    let at = 0;
    const list = () => HOME_CATALOG.filter((x) => room === "all" || x.room === room);
    const render = () => {
      const items = list();
      at = Math.max(0, Math.min(at, items.length - 1));
      const it = items[at];
      const bal = ctx.economy.balance();
      const owned = it ? Home.owns(it.id) : false;
      const placed = it ? Home.isPlaced(it.id) : false;
      const short = it && !owned ? it.price - bal : 0;
      el.innerHTML = `<div class="hm-store">
        <nav class="hm-rooms" role="tablist">${ROOMS.map(([k, l]) => `<button type="button" role="tab" data-room="${k}" class="${k === room ? "on" : ""}" aria-selected="${k === room}">${l}</button>`).join("")}</nav>
        <div class="hm-shelf" role="listbox" aria-label="Furniture">${items
          .map((x, i) => {
            const o = Home.owns(x.id),
              pl = Home.isPlaced(x.id);
            const tag = pl ? `<em class="gf-tag gold">In your villa</em>` : o ? `<em class="gf-tag">In storage</em>` : `<em class="gf-price">ⓩ ${x.price.toLocaleString("en-US")}</em>`;
            return `<button type="button" role="option" class="gf-tile hm-tile ${i === at ? "on" : ""}" data-i="${i}" aria-selected="${i === at}"><span class="hm-sw" style="--sw:${x.swatch}">${icon(x.icon, "#f3efe6")}</span><b>${esc(x.name)}</b>${tag}</button>`;
          })
          .join("")}</div>
        ${
          it
            ? `<div class="hm-bar gf-plate"><div class="hm-info"><small>${esc(ROOMS.find(([k]) => k === it.room)?.[1] ?? "")}${it.wall ? " · on a wall" : ""}</small><b>${esc(it.name)}</b><p>${esc(it.blurb)}</p></div>
              <span class="hm-bal"><b>${bal.toLocaleString("en-US")}</b><small>Your ⓩ</small></span>
              ${
                owned
                  ? `<button class="gf-btn gold" type="button" disabled>${placed ? "In your villa" : "Owned"}</button>`
                  : short > 0
                    ? `<button class="gf-btn gold" type="button" disabled>ⓩ ${short.toLocaleString("en-US")} short</button>`
                    : `<button class="gf-btn gold" data-buy type="button">Buy <small>ⓩ ${it.price.toLocaleString("en-US")}</small></button>`
              }
              <button class="gf-btn" data-play type="button">Go home</button></div>`
            : ""
        }
      </div>`;
      for (const b of el.querySelectorAll<HTMLElement>(".hm-rooms button"))
        b.addEventListener("click", () => {
          room = b.dataset.room as HomeRoom | "all";
          at = 0;
          render();
        });
      for (const b of el.querySelectorAll<HTMLElement>(".hm-tile"))
        b.addEventListener("click", () => {
          const i = Number(b.dataset.i);
          if (i === at && !Home.owns(items[i].id)) return buy();
          at = i;
          render();
        });
      el.querySelector(".hm-tile.on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
      el.querySelector("[data-buy]")?.addEventListener("click", buy);
      el.querySelector("[data-play]")?.addEventListener("click", () => ctx.play());
    };
    const buy = () => {
      const it = list()[at];
      if (!it || Home.owns(it.id)) return;
      if (ctx.economy.buy({ cat: "home", id: it.id, name: it.name, price: it.price })) ctx.say(`${it.name}: yours. It waits in your villa's storage — at home, press B to place it.`);
      else ctx.say(`Not enough ⓩ for ${it.name}. Earn ⓩ in the missions, or get them at Get ⓩ.`);
      render();
    };
    tabKey = (e) => {
      const items = list();
      if (e.key === "ArrowRight") at = Math.min(items.length - 1, at + 1);
      else if (e.key === "ArrowLeft") at = Math.max(0, at - 1);
      else if (e.key === "Enter") {
        buy();
        return true;
      } else return false;
      render();
      return true;
    };
    render();
    const off = Home.onChange(render);
    return () => {
      off();
      tabKey = null;
    };
  },
  onKey(e: KeyboardEvent) {
    return tabKey?.(e) ?? false;
  },
};
let tabKey: ((e: KeyboardEvent) => boolean) | null = null;
