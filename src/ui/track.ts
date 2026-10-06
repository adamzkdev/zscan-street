import type { Tx, TxKind } from "../data/types";
import { KIND_LABEL } from "../data/types";
import { get, links } from "../data/zscan";
import type { Director } from "../scene/director";
import type { Snark } from "../scene/snark";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => n.toLocaleString("en-US");
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;
const isTxid = (s: string) => /^[0-9a-f]{64}$/i.test(s.trim());
const SITE = "https://zstreet.cash";

const I = (d: string) => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
const SEARCH = I('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>');
const SHARE = I('<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V13"/>');
const X_LOGO = I('<path d="M4 4l16 16M20 4L4 20"/>');
const CLOSE = I('<path d="M6 6l12 12M18 6L6 18"/>');
const EYE = I('<circle cx="12" cy="12" r="3"/><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/>');

/** `/v1/tx/{txid}`, the fields the tracker reads. */
interface TxStatus {
  txid: string;
  status?: string;
  height?: number | null;
  confirmations?: number;
  kind: TxKind;
  fee: number | null;
  size: number;
  transparent_out: number | null;
  time?: string | null;
}

export interface TrackCallbacks {
  /** Point the camera at this zkSNARK and keep it there. */
  follow(s: Snark): void;
  /** Open the Block Archive on this height. */
  archive(height: number): void;
}

/**
 * "Follow your transaction": paste a txid (or open zstreet.cash/?tx=…), and the camera finds the
 * zkSNARK carrying it — from the truck to the MEMPOOL shop, the bus stop and its block's bus —
 * with a card saying where it is and buttons to share the moment. A transaction already mined
 * opens in the Block Archive instead.
 */
export class Tracker {
  private pop: HTMLElement;
  private card: HTMLElement;
  private txid: string | null = null;
  private info: TxStatus | null = null;
  private carrier: Snark | null = null;
  private followed = false;
  private minedAt: number | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private checked = 0;

  constructor(
    root: HTMLElement,
    private director: Director,
    private cb: TrackCallbacks,
  ) {
    // the button sits first in the top-right corner, before the theme switch
    const btn = document.createElement("button");
    btn.className = "hbtn track-btn";
    btn.title = "Follow a transaction";
    btn.setAttribute("aria-label", "Follow a transaction");
    btn.innerHTML = SEARCH;
    root.querySelector(".corner")?.prepend(btn);
    btn.addEventListener("click", () => this.openPop());

    this.pop = document.createElement("form");
    this.pop.className = "track-pop hud";
    this.pop.innerHTML = `<label>追跡 · FOLLOW YOUR TRANSACTION</label>
      <div class="row"><input name="txid" spellcheck="false" autocomplete="off" placeholder="paste a transaction id (64 hex)" /><button class="go">Follow</button></div>
      <small class="err"></small>`;
    root.append(this.pop);
    this.pop.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = (this.pop.querySelector("input") as HTMLInputElement).value.trim().toLowerCase();
      if (!isTxid(v)) return this.err("That isn't a transaction id (64 hex characters).");
      this.pop.classList.remove("open");
      void this.track(v);
    });
    document.addEventListener("pointerdown", (e) => {
      if (this.pop.classList.contains("open") && !this.pop.contains(e.target as Node) && e.target !== btn && !btn.contains(e.target as Node)) this.pop.classList.remove("open");
    });

    this.card = document.createElement("div");
    this.card.className = "track-card hud";
    root.append(this.card);
    this.card.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("[data-t]")?.dataset.t;
      if (a === "close") this.stop();
      else if (a === "follow" && this.carrier) {
        this.followed = true;
        this.cb.follow(this.carrier);
      } else if (a === "share") void this.share();
      else if (a === "archive" && this.info?.height) this.cb.archive(this.info.height);
    });
  }

  /** A txid in the address (?tx=… or /tx/…), once the street has its first snapshot. */
  fromUrl() {
    const q = new URLSearchParams(location.search).get("tx") ?? location.pathname.match(/\/tx\/([0-9a-f]{64})/i)?.[1];
    if (q && isTxid(q)) void this.track(q.toLowerCase());
  }

  private openPop() {
    this.pop.classList.toggle("open");
    this.err("");
    if (this.pop.classList.contains("open")) (this.pop.querySelector("input") as HTMLInputElement).focus();
  }

  private err(t: string) {
    (this.pop.querySelector(".err") as HTMLElement).textContent = t;
    if (t) this.pop.classList.add("open");
  }

  async track(txid: string) {
    this.stop();
    this.txid = txid;
    this.followed = false;
    this.minedAt = null;
    history.replaceState(null, "", `/?tx=${txid}`);
    this.render("Looking it up…");
    const info = await get<TxStatus>(`/v1/tx/${txid}`);
    if (this.txid !== txid) return;
    if (!info) {
      this.render("Not found: not in the mempool and not in any block yet.");
      return;
    }
    this.info = info;
    const mined = !!info.height && info.status !== "mempool";
    if (!mined) {
      // on the street: its carrier walks it to the shop and the bus stop
      const tx: Tx = { txid, kind: info.kind, fee: info.fee, size: info.size, actions: 1, transparentOut: info.transparent_out ?? 0, seenAt: Date.now() };
      this.director.track(tx);
    }
    this.timer = setInterval(() => this.tick(), 700);
    this.tick();
  }

  private stop() {
    clearInterval(this.timer);
    this.txid = null;
    this.info = null;
    this.carrier = null;
    this.card.classList.remove("on");
    if (new URLSearchParams(location.search).has("tx")) history.replaceState(null, "", "/");
  }

  /** Keep the card in step with the carrier; follow it as soon as it appears. */
  private tick() {
    const id = this.txid;
    if (!id || !this.info) return;
    const s = this.director.snarkOf(id);
    if (s && s !== this.carrier) this.carrier = s;
    if (s && !this.followed) {
      this.followed = true;
      this.cb.follow(s);
    }
    const t = s?.txs.find((x) => x.txid === id);
    if (t?.height && !this.minedAt) {
      this.minedAt = t.height;
      this.info.height = t.height;
    }
    // no carrier and not mined on the street: ask the API now and then (it may have been mined)
    if (!s && !this.minedAt && Date.now() - this.checked > 15_000) {
      this.checked = Date.now();
      void get<TxStatus>(`/v1/tx/${id}`).then((i) => {
        if (i && this.txid === id) this.info = i;
      });
    }
    this.render();
  }

  private status(): [string, string] {
    const i = this.info!;
    const s = this.carrier && this.director.snarkOf(i.txid) === this.carrier ? this.carrier : null;
    const h = this.minedAt ?? (i.status !== "mempool" ? i.height : null);
    if (s) {
      const who = `zkSNARK #${num(s.id)}`;
      switch (s.state) {
        case "arriving":
          return [`${who} is walking to the MEMPOOL shop`, "pending"];
        case "shopping":
          return [`${who} is picking up your parcel`, "pending"];
        case "waiting":
          return [`${who} waits at the bus stop for a block`, "pending"];
        case "boarding":
          return [`Boarding the bus of block #${num(h ?? 0)}`, "mined"];
        case "riding":
          return [`On the bus of block #${num(h ?? 0)} — mined!`, "mined"];
        case "chauffeured":
          return [h ? `Riding to block #${num(h)} in style` : "Waiting in its car for a block", h ? "mined" : "pending"];
        case "vip":
          return [`Arrived by ${s.ride === "limo" ? "limousine" : "taxi"}`, "pending"];
        default:
          return [h ? `Delivered in block #${num(h)}` : `${who} is on the street`, h ? "mined" : "pending"];
      }
    }
    if (h) return [`Mined in block #${num(h)}${i.confirmations ? ` · ${num(i.confirmations)} confirmations` : ""}`, "mined"];
    return ["In the mempool, its zkSNARK is on the way", "pending"];
  }

  private render(note?: string) {
    const i = this.info;
    const id = this.txid;
    if (!id) return;
    const [line, tone] = note ? [note, "pending"] : this.status();
    const h = this.minedAt ?? (i && i.status !== "mempool" ? i.height : null);
    const html = `
      <button class="x" data-t="close" aria-label="Stop following">${CLOSE}</button>
      <div class="tc-eyebrow">あなたの取引 · YOUR TRANSACTION</div>
      <div class="tc-id mono">${short(id)}${i ? ` <span class="tc-kind">${esc(KIND_LABEL[i.kind] ?? "")}</span>` : ""}</div>
      <div class="tc-line ${tone}">${esc(line)}</div>
      <div class="tc-actions">
        ${this.carrier ? `<button data-t="follow">${EYE} Follow</button>` : ""}
        ${h ? `<button data-t="archive">Block #${num(h)}</button>` : ""}
        <button data-t="share">${SHARE} Share</button>
        <a href="${tweetUrl(id, h ?? null)}" target="_blank" rel="noopener">${X_LOGO} Post</a>
        <a href="${links.tx(id)}" target="_blank" rel="noopener">ZScan</a>
      </div>`;
    if (this.card.dataset.html !== html) {
      this.card.dataset.html = html;
      this.card.innerHTML = html;
    }
    this.card.classList.add("on");
  }

  private async share() {
    const id = this.txid;
    if (!id) return;
    const url = `${SITE}/?tx=${id}`;
    const text = "Watch my Zcash transaction ride the bus to its block on ZStreet";
    try {
      if (navigator.share) return void (await navigator.share({ title: "ZStreet", text, url }));
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.flash("Link copied");
    } catch {
      prompt("Copy this link", url);
    }
  }

  private flash(t: string) {
    const b = this.card.querySelector<HTMLElement>('[data-t="share"]');
    if (!b) return;
    const was = b.innerHTML;
    b.textContent = t;
    setTimeout(() => (b.innerHTML = was), 1600);
  }
}

function tweetUrl(txid: string, height: number | null) {
  const text = height ? `My Zcash transaction just took the bus of block #${num(height)} on ZStreet 🚌` : "My Zcash transaction is waiting for its bus on ZStreet 🚏";
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${SITE}/?tx=${txid}`)}&hashtags=Zcash`;
}
