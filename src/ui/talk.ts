import { KIND_HELP, KIND_LABEL } from "../data/types";
import { Market } from "../data/market";
import { API, ZScan } from "../data/zscan";
import type { Director } from "../scene/director";
import type { Snark } from "../scene/snark";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const zec = (zat: number, d = 4) => `${(zat / 1e8).toLocaleString("en-US", { maximumFractionDigits: d })} ZEC`;
const num = (n: number) => n.toLocaleString("en-US");

/** Someone you can talk to: a zkSNARK on the street, or a character inside a place. */
export interface Speaker {
  /** Key for the conversation (kept while the page is open). */
  key: string;
  name: string;
  /** Role line for the model: "a carrier on its way to the bus stop". */
  who: string;
  portrait: string | null;
  facts: () => string;
  /** First line they say when you open the chat. */
  hello: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

/** What the street knows about the city right now, for every character. */
function cityFacts(director: Director) {
  const m = Market.state;
  const lines = [`Latest block: #${director.blockHeight ? num(director.blockHeight) : "?"}.`, `Pending transactions in the mempool: ${director.mempoolList().length}.`];
  if (m.price) lines.push(`ZEC price: $${m.price.usd.toFixed(2)} (${m.price.usd_24h_change >= 0 ? "+" : ""}${m.price.usd_24h_change.toFixed(1)}% in 24h).`);
  if (m.pools) lines.push(`Shielded supply: ${Math.round(m.pools.shielded_ratio * 100)}% of all ZEC; Orchard ${zec(m.pools.pools.orchard, 0)}, Ironwood ${zec(m.pools.pools.ironwood, 0)}, Sapling ${zec(m.pools.pools.sapling, 0)}.`);
  if (m.network) lines.push(`Last 24h: ${num(m.network.txs_24h)} transactions, ${Math.round(m.network.shielded_tx_ratio_24h * 100)}% shielded, blocks every ~${Math.round(m.network.avg_block_time)} s.`);
  lines.push("NU7 (25-second blocks, the Network Sustainability Mechanism sending 60% of fees to a reserve) is planned for mainnet around 2026-11-05.");
  return lines.join("\n");
}

const STATE_LINE: Record<string, string> = {
  arriving: "walking to the MEMPOOL shop to pick up its parcel",
  shopping: "picking up its parcel at the MEMPOOL shop",
  waiting: "waiting at the bus stop for the next block",
  boarding: "boarding the bus of its block",
  riding: "riding the bus of its block (the transaction is mined)",
  leaving: "walking home after its delivery",
  resident: "a resident of the city, carrying nothing right now",
  vip: "arrived by taxi or limousine with a big public amount",
  chauffeured: "riding in a taxi or limousine to its block",
  guard: "a bodyguard escorting a limousine",
};

/** A street zkSNARK as a speaker: what it carries and where it is in its journey. */
export function snarkSpeaker(s: Snark, director: Director): Speaker {
  const role = s.state === "guard" ? "a bodyguard" : s.state === "resident" ? "a resident" : s.role ? `the ${s.role.toLowerCase()}` : "a carrier";
  return {
    key: `snark-${s.id}`,
    name: s.name,
    who: `${s.name}, ${role} in ZStreet`,
    portrait: ZScan.zkSnarkImage(s.id),
    hello: s.txs.length ? "Hey! Busy day, I've got a parcel to deliver. What do you want to know?" : "Hi there! Nice evening in the city, isn't it? Ask me anything.",
    facts: () => {
      const lines = [`You are ${s.name}${s.rank ? `, rank #${num(s.rank)} in the zkSNARKs collection` : ""}. Right now you are ${STATE_LINE[s.state] ?? s.state}.`];
      if (s.item) lines.push(`Your traits: ${s.item.traits.map((t) => `${t.trait_type} ${t.value}`).join(", ")}.`);
      for (const t of s.txs) {
        const bits = [`You carry transaction ${t.txid} (${KIND_LABEL[t.kind]}: ${KIND_HELP[t.kind]}).`, `Size ${(t.size / 1000).toFixed(1)} kB, ${t.actions} action(s), fee ${t.fee == null ? "unknown" : zec(t.fee, 8)}.`];
        if (t.transparentOut) bits.push(`Public outputs: ${zec(t.transparentOut)}.`);
        if (t.visible) bits.push(`Visible public value: ${zec(t.visible)}.`);
        if (t.pool) bits.push(`Shielded pool used: ${t.pool}.`);
        bits.push(t.height ? `It was mined in block #${num(t.height)}.` : `It is still in the mempool, seen ${Math.round((Date.now() - t.seenAt) / 1000)} s ago.`);
        lines.push(bits.join(" "));
      }
      return `${lines.join("\n")}\n${cityFacts(director)}`;
    },
  };
}

/** A character inside a place (the MEMPOOL shopkeeper, a miner…), with its own facts. */
export function npcSpeaker(key: string, name: string, who: string, portrait: string | null, hello: string, facts: () => string, director: Director): Speaker {
  return { key, name, who, portrait, hello, facts: () => `${facts()}\n${cityFacts(director)}` };
}

/**
 * The dialogue box: a game-style chat at the bottom of the screen with the character's portrait.
 * Answers come from `/v1/street/chat` (a small model on the API's key, in character, from the facts
 * the street knows). Conversations are kept while the page stays open.
 */
export class Talk {
  private el: HTMLElement;
  private log: HTMLElement;
  private input: HTMLInputElement;
  private who: Speaker | null = null;
  private threads = new Map<string, Turn[]>();
  private busy = false;

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "talk hud";
    this.el.innerHTML = `
      <div class="tk-head"><img class="tk-face" alt="" /><div><div class="tk-eyebrow">会話 · TALK</div><b class="tk-name"></b></div><button class="tk-x" aria-label="Close">✕</button></div>
      <div class="tk-log"></div>
      <form class="tk-form"><input name="q" maxlength="400" autocomplete="off" placeholder="Ask about its transaction, its block, Zcash…" /><button>Say</button></form>`;
    root.append(this.el);
    this.log = this.el.querySelector(".tk-log")!;
    this.input = this.el.querySelector("input")!;
    this.el.querySelector(".tk-x")!.addEventListener("click", () => this.close());
    this.el.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.send();
    });
    // keys typed here stay here (no walking, no shortcuts)
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.close();
    });
  }

  get open() {
    return !!this.who;
  }

  show(sp: Speaker) {
    this.who = sp;
    const face = this.el.querySelector<HTMLImageElement>(".tk-face")!;
    face.hidden = !sp.portrait;
    if (sp.portrait) face.src = sp.portrait;
    this.el.querySelector(".tk-name")!.textContent = sp.name;
    if (!this.threads.has(sp.key)) this.threads.set(sp.key, [{ role: "assistant", content: sp.hello }]);
    this.render();
    this.el.classList.add("on");
    setTimeout(() => this.input.focus(), 50);
  }

  close() {
    this.who = null;
    this.el.classList.remove("on");
    this.input.blur();
  }

  private render(typing = false) {
    const t = this.who ? (this.threads.get(this.who.key) ?? []) : [];
    this.log.innerHTML = t.map((m) => `<p class="${m.role === "user" ? "me" : "them"}">${esc(m.content)}</p>`).join("") + (typing ? `<p class="them typing"><i></i><i></i><i></i></p>` : "");
    this.log.scrollTop = this.log.scrollHeight;
  }

  private async send() {
    const sp = this.who;
    const q = this.input.value.trim();
    if (!sp || !q || this.busy) return;
    this.input.value = "";
    const thread = this.threads.get(sp.key)!;
    thread.push({ role: "user", content: q });
    this.busy = true;
    this.render(true);
    let reply: string;
    try {
      const r = await fetch(`${API}/v1/street/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ who: sp.who, facts: sp.facts(), messages: thread.filter((m, i) => i > 0 || m.role === "user") }),
      });
      const j = (await r.json().catch(() => ({}))) as { reply?: string; message?: string };
      reply = j.reply ?? `(${j.message ?? "They didn't answer, try again"})`;
    } catch {
      reply = "(The connection dropped, try again)";
    }
    this.busy = false;
    thread.push({ role: "assistant", content: reply });
    if (this.who === sp) this.render();
  }
}
