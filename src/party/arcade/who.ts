/**
 * ZK WHO?: 24 zkSNARKs on the table, the same for both. You and a rival zkSNARK each hold one of them
 * in secret. In turn, each asks a yes-or-no question about the other's traits (its Lineage, its head
 * piece, its eyes, its skin, its accessory: the collection's real traits, api.zscan.cash), and the
 * ones that don't fit fall. Name the other's secret when you're sure: right wins, wrong loses.
 * Zero knowledge, until the last answer.
 */
import { T } from "../../i18n/lang";
import { get } from "../../data/zscan";
import { personImage, personName, rivalIds } from "../people";
import { rng, sfx } from "../kit";
import type { ArcadeHost, ArcadeMake } from "./runner";

type Kind = "Lineage" | "Head" | "Eyes" | "Skin" | "Accessory";
const KINDS: Kind[] = ["Lineage", "Head", "Eyes", "Skin", "Accessory"];
const KIND_ZH: Record<Kind, string> = { Lineage: "血统", Head: "头饰", Eyes: "眼睛", Skin: "皮肤", Accessory: "配饰" };

interface Snark {
  id: number;
  tr: Record<Kind, string>;
}
interface MapDoc {
  traits: { trait_type: string; values: string[] }[];
  items: [number, number | null, unknown, unknown, unknown, number, number, number[]][];
}

let mapDoc: Promise<Snark[] | null> | null = null;
/** Every zkSNARK with its traits (one 0.5 MB document, read once). */
function collection(): Promise<Snark[] | null> {
  mapDoc ??= get<MapDoc>("/v1/collections/zksnarks/map").then((d) => {
    if (!d?.items?.length) return null;
    const idx = KINDS.map((k) => d.traits.findIndex((t) => t.trait_type === k));
    return d.items.map((it) => {
      const tr = {} as Record<Kind, string>;
      KINDS.forEach((k, i) => (tr[k] = idx[i] >= 0 && it[7][idx[i]] >= 0 ? d.traits[idx[i]].values[it[7][idx[i]]] : "None"));
      return { id: it[0], tr };
    });
  });
  void mapDoc.then((v) => v || (mapDoc = null));
  return mapDoc;
}

/** The question about one trait, as said aloud. */
function ask(k: Kind, v: string) {
  const none = v === "None";
  switch (k) {
    case "Lineage":
      return T(`Is its Lineage ${v}?`, `它的血统是 ${v} 吗？`);
    case "Head":
      return none ? T("Is its head bare (no head piece)?", "它没有头饰吗？") : T(`Does it wear the ${v} head piece?`, `它戴着 ${v} 头饰吗？`);
    case "Eyes":
      return T(`Does it have ${v} eyes?`, `它有 ${v} 眼睛吗？`);
    case "Skin":
      return T(`Is its skin ${v}?`, `它的皮肤是 ${v} 吗？`);
    case "Accessory":
      return none ? T("Does it wear no accessory?", "它没有配饰吗？") : T(`Does it wear a ${v}?`, `它戴着 ${v} 吗？`);
  }
}
const valueLabel = (k: Kind, v: string) => (v === "None" ? (k === "Head" ? T("No head piece", "无头饰") : k === "Accessory" ? T("No accessory", "无配饰") : T("None", "无")) : v);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 24 for the table: four Lineages, six of each, as different as can be in head and eyes. */
function deal(all: Snark[], rnd: () => number): Snark[] {
  const byLin = new Map<string, Snark[]>();
  for (const s of all) {
    if (s.tr.Lineage === "Apparition") continue;
    let l = byLin.get(s.tr.Lineage);
    if (!l) byLin.set(s.tr.Lineage, (l = []));
    l.push(s);
  }
  const lins = [...byLin.keys()].filter((k) => byLin.get(k)!.length >= 40);
  const pick: Snark[] = [];
  const chosen = new Set<string>();
  while (chosen.size < Math.min(4, lins.length)) chosen.add(lins[Math.floor(rnd() * lins.length)]);
  for (const lin of chosen) {
    const pool = byLin.get(lin)!.slice();
    const seen = new Set<string>();
    let n = 0,
      guard = 0;
    while (n < 6 && guard++ < 400) {
      const s = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      if (!s) break;
      const sig = `${s.tr.Head}|${s.tr.Eyes}`;
      if (seen.has(sig) && guard < 300) continue;
      seen.add(sig);
      pick.push(s);
      n++;
    }
  }
  for (let i = pick.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pick[i], pick[j]] = [pick[j], pick[i]];
  }
  return pick.slice(0, 24);
}

class Who {
  private root: HTMLElement;
  private rnd: () => number;
  private table: Snark[] = [];
  private mine!: Snark;
  private theirs!: Snark;
  /** Still standing on your side of the table (your guesses about theirs). */
  private up = new Set<number>();
  /** Still standing on theirs (the rival's guesses about yours). */
  private rivalUp = new Set<number>();
  private rival: number;
  private kind: Kind = "Lineage";
  private turn: "you" | "rival" | "over" = "you";
  private guessing = false;
  private busy = false;
  private dead = false;
  private log: { who: "you" | "rival"; q: string; a: boolean; n?: number }[] = [];
  private skill: number;

  constructor(private host: ArcadeHost) {
    this.rnd = rng(host.seed);
    this.rival = rivalIds(1, this.rnd)[0];
    this.skill = 0.55 + this.rnd() * 0.3;
    this.root = document.createElement("div");
    this.root.className = "wh-root";
    this.root.innerHTML = `<div class="wh-load">${T("Dealing 24 zkSNARKs…", "正在发 24 个 zkSNARK…")}</div>`;
    host.el.append(this.root);
    this.root.addEventListener("click", this.onClick);
    void this.start();
  }

  private async start() {
    const all = await collection();
    if (this.dead) return;
    if (!all) {
      this.root.innerHTML = `<div class="wh-load">${T("The collection is out of reach. Try again in a moment.", "暂时无法读取藏品，请稍后再试。")}</div>`;
      return;
    }
    this.table = deal(all, this.rnd);
    this.mine = this.table[Math.floor(this.rnd() * this.table.length)];
    do this.theirs = this.table[Math.floor(this.rnd() * this.table.length)];
    while (this.theirs === this.mine && this.table.length > 1);
    for (const s of this.table) (this.up.add(s.id), this.rivalUp.add(s.id));
    this.render();
    this.status();
  }

  private status() {
    const n = this.up.size;
    if (this.turn === "you") this.host.status(this.guessing ? T("<b>Pick the one you think it is</b>", "<b>选出你认为的那个</b>") : T(`<b>Your turn</b> · ${n} still standing`, `<b>你的回合</b> · 还剩 ${n} 个`));
    else if (this.turn === "rival") this.host.status(T(`<b>${esc(personName(this.rival))}</b> is thinking…`, `<b>${esc(personName(this.rival))}</b> 正在思考…`));
  }

  // ---- the table --------------------------------------------------------------------------------

  private render() {
    const opts = this.values(this.kind, [...this.up]);
    this.root.innerHTML = `
      <div class="wh-board${this.guessing ? " guessing" : ""}">${this.table
        .map(
          (s) => `<button class="wh-card${this.up.has(s.id) ? "" : " down"}" data-id="${s.id}" title="${esc(KINDS.map((k) => `${k}: ${s.tr[k]}`).join(" · "))}">
            <span class="wh-face"><img src="${personImage(s.id)}" alt="" draggable="false" loading="lazy" /><small>#${s.id}</small></span>
            <span class="wh-back"><i>Z</i></span>
          </button>`,
        )
        .join("")}</div>
      <aside class="wh-side">
        <div class="wh-duo">
          <div class="wh-you"><small>${T("YOUR SECRET", "你的秘密")}</small><span class="wh-pic"><img src="${personImage(this.mine.id)}" alt="" /></span><b>#${this.mine.id}</b><em>${T(`${this.up.size} left to you`, `你剩 ${this.up.size} 个`)}</em></div>
          <div class="wh-vs">VS</div>
          <div class="wh-them"><small>${esc(personName(this.rival))}</small><span class="wh-pic"><img src="${personImage(this.rival)}" alt="" /></span><b>?</b><em>${T(`${this.rivalUp.size} left to it`, `它剩 ${this.rivalUp.size} 个`)}</em></div>
        </div>
        <div class="wh-ask${this.turn === "you" && !this.guessing ? "" : " off"}">
          <div class="wh-kinds">${KINDS.map((k) => `<button data-kind="${k}" class="${k === this.kind ? "on" : ""}">${T(k, KIND_ZH[k])}</button>`).join("")}</div>
          <div class="wh-vals">${opts.length ? opts.map((v) => `<button data-q="${esc(v)}">${esc(valueLabel(this.kind, v))}</button>`).join("") : `<span>${T("Nothing to ask here: they all share it.", "这里没什么可问：它们都一样。")}</span>`}</div>
          <button class="wh-guess" data-a="guess">${this.guessing ? T("Cancel the guess", "取消猜测") : T("I know who it is!", "我知道是谁了！")}</button>
        </div>
        <ol class="wh-log">${this.log
          .slice(-6)
          .reverse()
          .map((l) => `<li class="${l.who}"><b>${l.who === "you" ? T("You", "你") : esc(personName(this.rival))}</b> ${esc(l.q)} <em class="${l.a ? "y" : "n"}">${l.a ? T("Yes", "是") : T("No", "否")}</em>${l.n !== undefined ? ` <small>${T(`${l.n} left`, `剩 ${l.n}`)}</small>` : ""}</li>`)
          .join("")}</ol>
      </aside>`;
  }

  /** The values of a trait among these, each one that splits them (not shared by all). */
  private values(k: Kind, ids: number[]) {
    const c = new Map<string, number>();
    for (const id of ids) {
      const s = this.table.find((x) => x.id === id)!;
      c.set(s.tr[k], (c.get(s.tr[k]) ?? 0) + 1);
    }
    return [...c.entries()].filter(([, n]) => n < ids.length).sort((a, b) => (a[0] === "None" ? -1 : b[0] === "None" ? 1 : a[0].localeCompare(b[0]))).map(([v]) => v);
  }

  private onClick = (e: MouseEvent) => {
    const el = e.target as HTMLElement;
    if (this.busy || this.turn === "over") return;
    const kind = el.closest<HTMLElement>("[data-kind]");
    if (kind) {
      this.kind = kind.dataset.kind as Kind;
      sfx.blip(1);
      return this.render();
    }
    if (el.closest("[data-a=guess]")) {
      if (this.turn !== "you") return;
      this.guessing = !this.guessing;
      sfx.blip(this.guessing ? 4 : 0);
      this.render();
      return this.status();
    }
    const q = el.closest<HTMLElement>("[data-q]");
    if (q && this.turn === "you" && !this.guessing) return void this.youAsk(this.kind, q.dataset.q!);
    const card = el.closest<HTMLElement>(".wh-card");
    if (card && this.turn === "you") {
      const id = Number(card.dataset.id);
      if (this.guessing) return void this.youGuess(id);
      // (a card you lay down or stand up yourself, as at a real table)
      if (this.up.has(id)) this.up.delete(id);
      else this.up.add(id);
      sfx.step(this.up.has(id) ? 2 : 0);
      card.classList.toggle("down", !this.up.has(id));
      this.status();
    }
  };

  private async youAsk(k: Kind, v: string) {
    this.busy = true;
    const yes = this.theirs.tr[k] === v;
    sfx.blip(3);
    // its answer, then the ones that don't fit fall
    for (const s of this.table) if (this.up.has(s.id) && (s.tr[k] === v) !== yes) this.up.delete(s.id);
    this.log.push({ who: "you", q: ask(k, v), a: yes, n: this.up.size });
    this.render();
    this.flash(yes);
    await wait(900);
    if (this.dead) return;
    this.busy = false;
    await this.rivalTurn();
  }

  private flash(yes: boolean) {
    const b = document.createElement("div");
    b.className = `wh-say ${yes ? "y" : "n"}`;
    b.textContent = yes ? T("YES", "是") : T("NO", "否");
    this.root.append(b);
    (yes ? sfx.coin : sfx.thud)();
    setTimeout(() => b.remove(), 900);
  }

  private async youGuess(id: number) {
    this.guessing = false;
    if (id === this.theirs.id) return this.end(true, T(`Right: it was #${id}. Zero knowledge, then a full proof.`, `猜对了：就是 #${id}。先零知识，再完整证明。`));
    this.end(false, T(`Not #${id}: it was #${this.theirs.id}.`, `不是 #${id}：是 #${this.theirs.id}。`));
  }

  /** The rival's turn: it names yours if it's sure, else asks the question that splits its table best. */
  private async rivalTurn() {
    if (this.turn === "over") return;
    this.turn = "rival";
    this.status();
    this.render();
    await wait(900 + this.rnd() * 700);
    if (this.dead) return;
    const left = [...this.rivalUp];
    if (left.length === 1 || (left.length === 2 && this.rnd() < 0.5)) {
      const g = left[Math.floor(this.rnd() * left.length)];
      if (g === this.mine.id) return this.end(false, T(`${personName(this.rival)} named yours: #${g}. It was #${this.theirs.id} on its side.`, `${personName(this.rival)} 猜中了你的 #${g}。它的是 #${this.theirs.id}。`));
      this.rivalUp.delete(g);
      this.log.push({ who: "rival", q: T(`Is it #${g}?`, `是 #${g} 吗？`), a: false, n: this.rivalUp.size });
      sfx.aww(0.6);
    } else {
      // the question: the best split most of the time, a hunch otherwise
      let best: { k: Kind; v: string; d: number } | null = null;
      const qs: { k: Kind; v: string; d: number }[] = [];
      for (const k of KINDS)
        for (const v of this.values(k, left)) {
          const m = left.filter((id) => this.table.find((s) => s.id === id)!.tr[k] === v).length;
          const d = Math.abs(m - left.length / 2);
          qs.push({ k, v, d });
          if (!best || d < best.d) best = { k, v, d };
        }
      const q = this.rnd() < this.skill || !qs.length ? best! : qs[Math.floor(this.rnd() * qs.length)];
      const yes = this.mine.tr[q.k] === q.v;
      for (const id of left) if ((this.table.find((s) => s.id === id)!.tr[q.k] === q.v) !== yes) this.rivalUp.delete(id);
      this.log.push({ who: "rival", q: ask(q.k, q.v), a: yes, n: this.rivalUp.size });
      sfx.blip(-1);
    }
    this.turn = "you";
    this.render();
    this.status();
  }

  private end(won: boolean, line: string) {
    if (this.turn === "over") return;
    this.turn = "over";
    // (every card up, the two secrets lit)
    this.root.querySelectorAll(".wh-card").forEach((c) => {
      c.classList.remove("down");
      const id = Number((c as HTMLElement).dataset.id);
      if (id === this.theirs.id) c.classList.add("theirs");
      if (id === this.mine.id) c.classList.add("mine");
    });
    this.host.status("");
    setTimeout(() => this.host.over({ score: won ? 1 : 0, won, line }), 1100);
  }

  dispose() {
    this.dead = true;
    this.root.remove();
  }
}

const make: ArcadeMake = (host) => new Who(host);
export default make;
