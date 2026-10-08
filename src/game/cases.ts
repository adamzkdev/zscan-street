import type { BlockSummary } from "../data/types";
import { get } from "../data/zscan";
import { profile } from "./profile";
import type { GameHud } from "./ui";

/**
 * ZK Detective: one case a day, the same for every visitor, cut from the real chain. A block in
 * the last hundred did something odd; witnesses in four places each know one detail (who mined
 * it, when, how big…). Collect the clues by walking into those places, then find the block in the
 * MEMPOOL HQ's Block Archive and give its height.
 */

interface CaseDef {
  id: string;
  title: string;
  brief: string;
  answer: number;
  clues: { place: string; where: string; text: string }[];
}

const num = (n: number) => n.toLocaleString("en-US");
const POOL = (p: string | null) => (p ? p.replace(/_/g, " ") : "a solo miner");

/** A day's seed (UTC): every visitor gets the same case. */
function seedOf(day: string) {
  let h = 2166136261;
  for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function build(blocks: BlockSummary[], day: string): CaseDef | null {
  if (blocks.length < 20) return null;
  const seed = seedOf(day);
  const empty = blocks.filter((b) => b.tx_count <= 1);
  const kinds = ["ghost", "heavy", "fees"] as const;
  let kind = kinds[seed % kinds.length];
  if (kind === "ghost" && !empty.length) kind = "heavy";
  let target: BlockSummary;
  let title: string;
  let brief: string;
  if (kind === "ghost") {
    target = empty[seed % empty.length];
    title = "The Ghost Bus";
    brief = "A bus left the stop with nobody on board. Find the empty block.";
  } else if (kind === "heavy") {
    target = blocks.reduce((a, b) => (b.size > a.size ? b : a));
    title = "The Heavy Load";
    brief = "One bus was so full its springs gave way. Find the biggest block of the last hundred.";
  } else {
    target = blocks.reduce((a, b) => ((b.fees ?? 0) > (a.fees ?? 0) ? b : a));
    title = "The Big Tipper";
    brief = "Someone paid the drivers more than anyone else. Find the block with the most fees.";
  }
  const t = new Date(target.time);
  const lo = target.height - 3 - (seed % 9);
  const hi = target.height + 2 + ((seed >> 4) % 8);
  return {
    id: `${day}-${kind}`,
    title,
    brief,
    answer: target.height,
    clues: [
      { place: "factory", where: "Proof Factory foreman", text: `It came off ${POOL(target.miner_pool)}'s line.` },
      { place: "library", where: "Library archivist", text: `The logbook puts it between ${num(lo)} and ${num(hi)}.` },
      { place: "prison", where: "An Alcatraz inmate", text: `I heard it go at ${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")} UTC.` },
      { place: "reserve", where: "Reserve teller", text: `${target.tx_count} transaction${target.tx_count === 1 ? "" : "s"} counting the coinbase, ${(target.size / 1000).toFixed(1)} kB.` },
    ],
  };
}

const KEY = "street.case";

export class CaseBook {
  private def: CaseDef | null = null;
  /** Clues found today (place keys) and wrong guesses. */
  private found = new Set<string>();
  private tries = 0;
  private panel: HTMLElement;
  /** A case solved (the visitor's side scores). */
  onSolved: (() => void) | null = null;

  constructor(
    private hud: GameHud,
    private openArchive: (height: number) => void,
  ) {
    this.panel = document.createElement("div");
    this.panel.className = "casepanel hud";
    hud.root.append(this.panel);
    this.panel.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("[data-a]")?.dataset.a;
      if (a === "close") this.panel.classList.remove("open");
      else if (a === "archive") {
        this.panel.classList.remove("open");
        this.openArchive(Number(this.panel.querySelector<HTMLElement>("[data-lo]")?.dataset.lo ?? 0));
      }
    });
    this.panel.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = Number((this.panel.querySelector("input") as HTMLInputElement).value.replace(/[^\d]/g, ""));
      if (v) this.guess(v);
    });
    hud.root.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-case]")) this.open();
    });
    void this.load();
  }

  private get solved() {
    return !!this.def && !!profile.p.cases[this.def.id];
  }

  private async load() {
    const day = new Date().toISOString().slice(0, 10);
    const blocks = await get<BlockSummary[]>("/v1/blocks?limit=100");
    if (!blocks) return;
    this.def = build(blocks, day);
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as { id: string; found: string[]; tries: number } | null;
      if (s && s.id === this.def?.id) {
        this.found = new Set(s.found);
        this.tries = s.tries;
      }
    } catch {}
  }

  private save() {
    try {
      if (this.def) localStorage.setItem(KEY, JSON.stringify({ id: this.def.id, found: [...this.found], tries: this.tries }));
    } catch {}
  }

  /** The visitor walked into a place: a witness there may know something. */
  visit(place: string) {
    if (!this.def || this.solved) return;
    const c = this.def.clues.find((x) => x.place === place);
    if (!c || this.found.has(place)) return;
    this.found.add(place);
    this.save();
    profile.pay(10, "clue");
    this.hud.say(`<b>CLUE ${this.found.size}/4</b> · ${c.where}: “${c.text}”`, () => this.open());
  }

  open() {
    this.panel.classList.add("open");
    this.render();
  }

  private guess(h: number) {
    if (!this.def || this.solved) return;
    if (h === this.def.answer) {
      const reward = Math.max(60, 250 - this.tries * 50 - (4 - this.found.size) * 20);
      profile.update((p) => (p.cases[this.def!.id] = Date.now()));
      profile.pay(reward, "case");
      this.onSolved?.();
      this.hud.say(`<b>CASE SOLVED</b> · ${this.def.title}, block ${num(h)} · ⓩ +${reward}`);
    } else {
      this.tries++;
      this.save();
      this.hud.say(`<b>WRONG BLOCK</b> · ${num(h)} isn't it`);
    }
    this.render();
  }

  private render() {
    const d = this.def;
    if (!d) {
      this.panel.innerHTML = `<header><label>事件 · ZK DETECTIVE</label><button data-a="close">×</button></header><div class="muted">The case file is on its way…</div>`;
      return;
    }
    const lo = d.clues[1] && this.found.has("library") ? d.clues[1].text.match(/[\d,]+/)?.[0]?.replace(/,/g, "") : null;
    this.panel.innerHTML = `<header><label>事件 · ZK DETECTIVE</label><button data-a="close" title="Close">×</button></header>
      <h3>${d.title}</h3>
      <p>${d.brief}</p>
      <ol>${d.clues
        .map((c) => (this.found.has(c.place) ? `<li class="got"><b>${c.where}</b> ${c.text}</li>` : `<li><b>${c.where}</b> <em>go and ask</em></li>`))
        .join("")}</ol>
      ${
        this.solved
          ? `<div class="done">Solved: block ${num(d.answer)} ✓ · a new case tomorrow</div>`
          : `<form><input inputmode="numeric" placeholder="block height" /><button>Accuse</button></form>
             <button class="arch" data-a="archive" ${lo ? `data-lo="${lo}"` : "data-lo=\"0\""}>Search the Block Archive ▸</button>`
      }`;
  }
}
