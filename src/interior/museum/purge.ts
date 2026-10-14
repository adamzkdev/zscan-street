import { get } from "../../data/zscan";

/**
 * The Apparitions purge (zilkroad, via api.zscan.cash/v1/collections/zksnarks/apparitions): a
 * holder burns 26 zkSNARKs and one treasury snark is transformed into an Apparition. 26 in all.
 */

export interface Trait {
  trait_type: string;
  value: string;
}
export interface PApp {
  slot: number;
  item: number;
  name: string;
  traits: Trait[];
}
export interface PItem {
  item: number;
  slot: number;
  rank: number | null;
  traits: Trait[];
}
interface Doc {
  slots: number;
  minted: number;
  supply: number;
  apparitions: { slot: number; item: string; name: string; traits: Trait[]; unlocked_at: string | null }[];
  purged: { item: string; slot: number; rank: number | null; traits: Trait[] }[];
}

export class Purge {
  apps: PApp[] = [];
  purged: PItem[] = [];
  bySlot = new Map<number, PItem[]>();
  /** Purged item → the Apparition it revealed. */
  purgedFor = new Map<number, PApp>();
  /** Treasury item → its Apparition. */
  appOf = new Map<number, PApp>();
  slots = 26;
  minted = 10000;
  supply = 10000;
  ready: Promise<boolean>;

  constructor() {
    this.ready = this.load();
  }

  private async load() {
    const d = await get<Doc>("/v1/collections/zksnarks/apparitions");
    if (!d?.apparitions?.length) return false;
    this.slots = d.slots;
    this.minted = d.minted;
    this.supply = d.supply;
    // In the order they were revealed.
    this.apps = d.apparitions
      .slice()
      .sort((a, b) => (a.unlocked_at ?? "").localeCompare(b.unlocked_at ?? ""))
      .map((a) => ({ slot: a.slot, item: Number(a.item), name: a.name, traits: a.traits }));
    this.purged = d.purged.map((p) => ({ item: Number(p.item), slot: p.slot, rank: p.rank, traits: p.traits }));
    const bySlot = new Map(this.apps.map((a) => [a.slot, a]));
    for (const a of this.apps) {
      this.appOf.set(a.item, a);
      this.bySlot.set(a.slot, []);
    }
    for (const p of this.purged) {
      this.bySlot.get(p.slot)?.push(p);
      const a = bySlot.get(p.slot);
      if (a) this.purgedFor.set(p.item, a);
    }
    return true;
  }

  of(a: PApp) {
    return this.bySlot.get(a.slot) ?? [];
  }
}

export const traitOf = (t: Trait[], type: string) => t.find((x) => x.trait_type === type)?.value ?? "—";

export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
