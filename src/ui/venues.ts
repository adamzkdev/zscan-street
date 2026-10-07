import type { NftItem } from "../data/types";
import { checkViewingKey, NU6_3_MAINNET, scanViewingKey, type ScanProgress, type ViewKeyResult } from "../data/viewkey";
import { EXPLORER, get, links, ZScan } from "../data/zscan";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => n.toLocaleString("en-US");
const zec = (zat: number, digits = 4) => `${(zat / 1e8).toLocaleString("en-US", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits })} ZEC`;
const X = '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const EXT = '<svg class="i" viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8"/></svg>';

type Kind = "cards" | "bank";
type Sort = "rank" | "price" | "last";
interface Collection {
  market: { floor: number | null; listings: number; volume_24h: number; sales_24h: number; volume: number; sales: number } | null;
  venue_items: NftItem[];
}

export interface VenueCallbacks {
  /** Ids of the zkSNARKs out on the street right now. */
  onStreet(): number[];
  /** Select one of them in the scene. */
  select(id: number): void;
  closed(): void;
}

/**
 * The shops you can walk into from the street: the card shop (the zkSNARK collection) and the
 * viewing-key bank. Each opens as a panel on the left; the city stays visible on the right.
 */
export class Venues {
  private el: HTMLElement;
  private kind: Kind | null = null;
  private sort: Sort = "rank";
  private page = 0;
  private coll: Collection | null = null;
  private loading = false;
  // bank state: the key lives only in the input and in the scan call, never stored
  private scan: { ctl: AbortController; progress: ScanProgress | null } | null = null;
  private result: ViewKeyResult | null = null;
  private error = "";
  private birthday = "30d";

  constructor(
    root: HTMLElement,
    private cb: VenueCallbacks,
  ) {
    this.el = document.createElement("aside");
    this.el.className = "venue hud";
    root.append(this.el);
    this.el.addEventListener("click", (e) => this.onClick(e));
    this.el.addEventListener("change", (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.name === "birthday") {
        this.birthday = t.value;
        this.el.querySelector<HTMLInputElement>("[name=height]")!.hidden = t.value !== "custom";
      }
    });
    this.el.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.startScan();
    });
  }

  get open() {
    return this.kind !== null;
  }

  show(kind: Kind) {
    this.kind = kind;
    this.el.classList.add("open");
    this.el.dataset.kind = kind;
    if (kind === "cards" && !this.coll) void this.load();
    this.render();
  }

  close() {
    if (!this.kind) return;
    this.kind = null;
    this.el.classList.remove("open");
    this.cb.closed();
  }

  private async load() {
    this.loading = true;
    this.render();
    this.coll = await get<Collection>(`/v1/collections/zksnarks?sort=${this.sort}&page=${this.page}`);
    this.loading = false;
    this.render();
  }

  private onClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-v]");
    if (!t) return;
    const v = t.dataset.v!;
    if (v === "close") return this.close();
    if (v.startsWith("sort:")) {
      this.sort = v.slice(5) as Sort;
      this.page = 0;
      return void this.load();
    }
    if (v === "prev" || v === "next") {
      this.page = Math.max(0, this.page + (v === "next" ? 1 : -1));
      return void this.load();
    }
    if (v.startsWith("street:")) return this.cb.select(Number(v.slice(7)));
    if (v === "cancel") return this.scan?.ctl.abort();
    if (v === "clear") {
      this.result = null;
      this.error = "";
      return this.render();
    }
  }

  // ---- bank -------------------------------------------------------------------------------------

  private async startScan() {
    if (this.scan) return;
    const input = this.el.querySelector<HTMLInputElement>("[name=key]")!;
    const key = input.value.trim();
    this.error = "";
    const check = await checkViewingKey(key);
    if (!check.ok) {
      this.error = check.error;
      return this.render(true);
    }
    let from: number | undefined;
    if (this.birthday === "ironwood") from = NU6_3_MAINNET;
    else if (this.birthday === "custom") from = Number(this.el.querySelector<HTMLInputElement>("[name=height]")!.value) || undefined;
    else if (this.birthday === "7d") from = await this.heightDaysAgo(7);
    const ctl = new AbortController();
    this.scan = { ctl, progress: null };
    this.result = null;
    this.render(true);
    try {
      this.result = await scanViewingKey(key, {
        from,
        signal: ctl.signal,
        onProgress: (p) => {
          if (!this.scan) return;
          this.scan.progress = p;
          this.renderProgress();
        },
      });
      // the key is not kept: once the result is in, the field is emptied
      input.value = "";
    } catch (err) {
      this.error = (err as Error).name === "AbortError" ? "Scan cancelled." : (err as Error).message;
    }
    this.scan = null;
    this.render(true);
  }

  private async heightDaysAgo(days: number) {
    const lb = await ZScan.latestBlock();
    return lb ? lb.height - days * 1152 : undefined;
  }

  // ---- rendering --------------------------------------------------------------------------------

  /** `keepKey`: re-render the bank without wiping what is typed in the key field. */
  private render(keepKey = false) {
    if (!this.kind) return;
    const key = keepKey ? (this.el.querySelector<HTMLInputElement>("[name=key]")?.value ?? "") : "";
    this.el.innerHTML = this.kind === "cards" ? this.cards() : this.bank();
    const input = this.el.querySelector<HTMLInputElement>("[name=key]");
    if (input) input.value = key;
  }

  private head(eyebrow: string, title: string, sub: string) {
    return `<header><div class="grow"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2><div class="muted">${sub}</div></div><button class="x" data-v="close" aria-label="Close">${X}</button></header>`;
  }

  private cards() {
    const c = this.coll;
    const m = c?.market;
    const street = this.cb.onStreet().slice(0, 12);
    const sorts: [Sort, string][] = [
      ["rank", "Rarest"],
      ["price", "Cheapest"],
      ["last", "Last sale"],
    ];
    return `${this.head("zkSNARK MUSEUM", "zkSNARKs", "10,000 pixel portraits · the people of this city")}
      <dl class="stats">
        <div><dt>Floor</dt><dd>${m?.floor ? zec(m.floor, 3) : "—"}</dd></div>
        <div><dt>Listed</dt><dd>${m ? num(m.listings) : "—"}</dd></div>
        <div><dt>Sales 24h</dt><dd>${m ? num(m.sales_24h) : "—"}</dd></div>
        <div><dt>Vol 24h</dt><dd>${m ? zec(m.volume_24h, 1).replace(" ZEC", "") : "—"}</dd></div>
      </dl>
      ${
        street.length
          ? `<div class="mh">Out on the street now</div><div class="strip-cards">${street
              .map((id) => `<button class="mini" data-v="street:${id}" title="#${id}: find it in the city"><img src="${ZScan.zkSnarkImage(id)}" alt="" /></button>`)
              .join("")}</div>`
          : ""
      }
      <div class="tabs">${sorts.map(([k, l]) => `<button data-v="sort:${k}" class="${this.sort === k ? "on" : ""}">${l}</button>`).join("")}
        <span class="pager"><button data-v="prev" ${this.page ? "" : "disabled"}>‹</button><span class="mono">${this.page + 1}</span><button data-v="next">›</button></span></div>
      <div class="cards ${this.loading ? "busy" : ""}">${(c?.venue_items ?? [])
        .map(
          (it) => `<a class="card" href="${esc(it.url)}" target="_blank" rel="noopener" title="${esc(it.name)}">
            <img src="${ZScan.zkSnarkImage(Number(it.id))}" alt="" loading="lazy" />
            <span class="cid mono">#${esc(it.id)}</span>
            <span class="crank ${it.rank && it.rank <= 500 ? "gold" : ""}">${it.rank ? `R${num(it.rank)}` : ""}</span>
            <span class="cprice mono">${it.ask ? zec(it.ask, 2) : it.last ? `last ${zec(it.last, 2)}` : "not listed"}</span>
          </a>`,
        )
        .join("")}</div>
      <a class="btn wide" href="${EXPLORER}/collection/zksnarks" target="_blank" rel="noopener">The collection on ZScan ${EXT}</a>`;
  }

  private bank() {
    const r = this.result;
    const s = this.scan;
    const form = `<form class="vk" autocomplete="off">
        <label class="mh" for="vk-key">Viewing key</label>
        <textarea id="vk-key" name="key" rows="3" spellcheck="false" placeholder="uview1…  ·  uivk1…  ·  zxviews1…" ${s ? "disabled" : ""}></textarea>
        <div class="row2">
          <select name="birthday" ${s ? "disabled" : ""}>
            <option value="7d" ${this.birthday === "7d" ? "selected" : ""}>Last 7 days</option>
            <option value="30d" ${this.birthday === "30d" ? "selected" : ""}>Last 30 days</option>
            <option value="ironwood" ${this.birthday === "ironwood" ? "selected" : ""}>Since Ironwood</option>
            <option value="custom" ${this.birthday === "custom" ? "selected" : ""}>From a block height…</option>
          </select>
          <input name="height" type="number" min="419200" placeholder="height" ${this.birthday === "custom" ? "" : "hidden"} />
          ${s ? `<button type="button" class="btn" data-v="cancel">Cancel</button>` : `<button class="btn primary">Open the vault</button>`}
        </div>
        ${this.error ? `<div class="err">${esc(this.error)}</div>` : ""}
      </form>`;
    const progress = s ? `<div class="prog"><div class="pbar"><i></i></div><div class="pinfo mono"></div></div>` : "";
    const res = r
      ? `<div class="vault">
          <div class="mh">Shielded balance${r.spendsVisible ? "" : " (received: this key cannot see spends)"}</div>
          <div class="big mono">${zec(r.balance.total, 8)}</div>
          <div class="pools">${(["orchard", "ironwood", "sapling"] as const)
            .filter((p) => r.info.pools.includes(p))
            .map((p) => `<span class="pool ${p}"><i></i>${p[0].toUpperCase() + p.slice(1)} <b class="mono">${zec(r.balance[p], 4)}</b></span>`)
            .join("")}</div>
          <dl class="stats">
            <div><dt>Received</dt><dd>${zec(r.received, 3).replace(" ZEC", "")}</dd></div>
            <div><dt>Spent</dt><dd>${r.spendsVisible ? zec(r.spent, 3).replace(" ZEC", "") : "—"}</dd></div>
            <div><dt>Notes</dt><dd>${r.unspentNotes}/${r.notes}</dd></div>
            <div><dt>Blocks</dt><dd>${num(r.blocks)}</dd></div>
          </dl>
          <div class="mh">History · blocks ${num(r.from)}–${num(r.to)}</div>
          <div class="rows">${
            r.txs.length
              ? r.txs
                  .slice(0, 60)
                  .map(
                    (t) => `<div class="tr"><i class="kind pool-${t.pool}"></i><a class="mono" href="${links.tx(t.txid)}" target="_blank" rel="noopener">${t.txid.slice(0, 8)}…</a><span class="muted">${new Date(t.time).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · ${t.pool}</span><span class="r ${t.amount >= 0 ? "up" : "down"}">${t.amount >= 0 ? "+" : "−"}${zec(Math.abs(t.amount), 4)}</span></div>`,
                  )
                  .join("")
              : `<div class="empty">No shielded activity in this range. Try an earlier start.</div>`
          }</div>
          <button class="btn wide" data-v="clear">Close the vault</button>
        </div>`
      : "";
    return `${this.head("BANK · VIEW KEY", "Your shielded vault", "Paste a viewing key to read its balance and history")}
      <div class="note lock">The key never leaves this browser. Blocks are downloaded and decrypted here, the server only sees which blocks are asked for, like a light wallet.</div>
      ${r ? "" : form}${progress}${res}`;
  }

  private renderProgress() {
    const p = this.scan?.progress;
    const bar = this.el.querySelector<HTMLElement>(".pbar i");
    const info = this.el.querySelector<HTMLElement>(".pinfo");
    if (!p || !bar || !info) return;
    bar.style.width = `${((p.scanned / Math.max(1, p.total)) * 100).toFixed(1)}%`;
    info.textContent = `${num(p.scanned)} / ${num(p.total)} blocks · ${num(p.found)} notes${p.eta != null ? ` · ~${Math.ceil(p.eta)} s left` : ""}`;
  }
}
