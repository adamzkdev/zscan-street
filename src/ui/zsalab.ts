import { ZSA_API, Zsa, assetColor, assetName, units, type ZsaAsset } from "../data/zsa";

/** What the panel needs from the in-browser ZSA wallet (adapter: ui/zsalabWallet.ts). */
export interface LabWallet {
  address(): string;
  /** Catch up with the chain; `p` 0..1. */
  sync(p?: (f: number) => void): Promise<void>;
  balances(): { zec_zat: number; pending_zat: number; assets: { asset_id: string; name: string | null; units: number }[] };
  issue(name: string, amount: number, finalize: boolean, stage: (s: string) => void): Promise<{ txid: string; asset_id: string }>;
  transfer(asset_id: string, amount: number, to: string, stage: (s: string) => void): Promise<{ txid: string }>;
  burn(asset_id: string, amount: number, stage: (s: string) => void): Promise<{ txid: string }>;
  finalize(asset_id: string, stage: (s: string) => void): Promise<{ txid: string }>;
  /** The seed as hex, to keep the wallet elsewhere. */
  exportSeed(): string;
  /** A payment on its way to us (the drip), shown as "coming" until it's mined. */
  trackIncoming?(txid: string, zat: number): void;
}

export interface LabWalletStore {
  /** The wallet in this browser, if one was made. */
  load(): Promise<LabWallet | null>;
  create(): Promise<LabWallet>;
  restore(seedHex: string): Promise<LabWallet>;
}

/** An offer on the exchange board (zsa-svc /v1/zsa/offers). */
interface Offer {
  id: string;
  give_asset: string;
  give_name: string | null;
  give_amount: number;
  want_asset: string;
  want_name: string | null;
  want_amount: number;
  maker_address: string;
  status: "open" | "taken" | "done" | "cancelled" | "expired";
  taker_address: string | null;
  taker_txid: string | null;
  maker_txid: string | null;
  created_at: string;
}

type Tab = "mint" | "tokens" | "burn" | "finalize" | "exchange";
const FAUCET = "https://faucet.zsa.methyl.cc/";
const MINE = "zstreet.zsa.offers";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const zec = (zat: number) => (zat / 1e8).toLocaleString("en-US", { maximumFractionDigits: 6 });
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;
const num = (s: string) => Number(s.replace(/[\s,_]/g, ""));

/** The colour a coin will have before it exists (its asset id comes from the mint): from its name. */
function nameColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return `hsl(${h % 360} 78% 58%)`;
}
function ticker(name: string) {
  const w = name.replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const caps = w.match(/\p{Lu}/gu)?.join("") ?? "";
  return (caps.length >= 2 ? caps : w.replace(/ /g, "")).slice(0, 4).toUpperCase() || "ZSA";
}

/** A coin as SVG: rim colour, milled ring (gold once its die is broken), tag. */
function coinSvg(name: string, color: string, size = 72, sealed = false) {
  const t = esc(ticker(name || "ZSA"));
  return `<svg class="zl-coin" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id="g${size}" cx="35%" cy="30%"><stop offset="0" stop-color="#3a3226"/><stop offset="1" stop-color="#14110c"/></radialGradient></defs>
    <circle cx="50" cy="50" r="48" fill="url(#g${size})"/>
    <circle cx="50" cy="50" r="44" fill="none" stroke="${color}" stroke-width="6"/>
    <circle cx="50" cy="50" r="37" fill="none" stroke="${sealed ? "#f4b728" : "rgba(255,255,255,.3)"}" stroke-width="1.5" stroke-dasharray="1.5 2.5"/>
    <text x="50" y="${t.length > 3 ? 56 : 59}" text-anchor="middle" font-family="JetBrains Mono, Menlo, monospace" font-weight="900" font-size="${t.length > 3 ? 22 : 28}" fill="${color}">${t}</text>
  </svg>`;
}

/**
 * The ZSA MINT's terminal: four steps (wallet in this browser, a little free test ZEC for the fees,
 * strike your coin, your coins), then the exchange, the melt (burn, ZIP 226) and the die (seal,
 * finalize, ZIP 227). Everything is proved and signed here; the wallet is testnet only.
 */
export class ZsaLabPanel {
  private el: HTMLDivElement;
  private body: HTMLElement;
  private steps: HTMLElement;
  private chip: HTMLElement;
  private wallet: LabWallet | null = null;
  private tab: Tab = "mint";
  private busy: { what: string; stage: string; pct: number | null } | null = null;
  private note: { text: string; tone: "ok" | "err" | "info" } | null = null;
  private struck: { name: string; asset_id: string; txid: string; amount: number } | null = null;
  private dripAt: number | null = null;
  private copied = false;
  private poll: ReturnType<typeof setInterval> | undefined;
  private tip: number | null = null;
  private registry: ZsaAsset[] = [];
  private offers: Offer[] = [];
  private draft = { name: "", amount: "1000000", seal: false };
  private sendTo: { id: string; mode: "send" | "burn" } | null = null;
  private making = false;

  constructor(
    root: HTMLElement,
    private store: () => Promise<LabWalletStore>,
    private onClose: () => void,
  ) {
    this.el = document.createElement("div");
    this.el.className = "zsalab";
    this.el.innerHTML = `
      <header class="zl-head">
        <div><div class="zl-title">ZSA MINT <span class="jp">造幣局</span></div><div class="zl-chip"></div></div>
        <button class="zl-x" data-a="close" aria-label="Close">×</button>
      </header>
      <ol class="zl-steps"></ol>
      <div class="zl-body"></div>
      <footer class="zl-foot">Experimental ZSA testnet · test coins have no monetary value · proved and signed in your browser</footer>`;
    this.body = this.el.querySelector(".zl-body")!;
    this.steps = this.el.querySelector(".zl-steps")!;
    this.chip = this.el.querySelector(".zl-chip")!;
    root.appendChild(this.el);
    this.el.addEventListener("click", (e) => void this.click(e));
    this.el.addEventListener("input", (e) => this.input(e));
    this.el.addEventListener("keydown", (e) => e.stopPropagation());
  }

  get isOpen() {
    return this.el.classList.contains("open");
  }

  /** Out of the way while the hall films your coin, back after. */
  cinematic(on: boolean) {
    this.el.classList.toggle("cine", on);
  }

  async open(tab: Tab = "mint") {
    this.tab = tab;
    this.el.classList.add("open");
    this.render();
    if (!this.wallet) {
      const s = await this.store().catch(() => null);
      this.wallet = s ? await s.load().catch(() => null) : null;
    }
    void this.refresh();
    clearInterval(this.poll);
    this.poll = setInterval(() => !this.busy && void this.refresh(), 12_000);
  }

  close() {
    this.el.classList.remove("open");
    clearInterval(this.poll);
    this.onClose();
  }

  private async refresh() {
    const [info, assets, offers] = await Promise.all([Zsa.info(), Zsa.assets(), this.fetchOffers()]);
    if (info) this.tip = info.tip;
    if (assets) this.registry = assets;
    if (offers) this.offers = offers;
    if (this.wallet) {
      try {
        await this.wallet.sync();
      } catch {}
    }
    if (this.busy) return;
    // someone typing in a field: leave the form alone, just update the header
    const f = document.activeElement;
    if (f && this.body.contains(f) && /^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName)) return void this.renderHead();
    this.render();
  }

  private async fetchOffers(): Promise<Offer[] | null> {
    try {
      const r = await fetch(`${ZSA_API}/v1/zsa/offers`, { cache: "no-store" });
      return r.ok ? ((await r.json()) as { offers: Offer[] }).offers : null;
    } catch {
      return null;
    }
  }

  private mine(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem(MINE) ?? "{}") as Record<string, string>;
    } catch {
      return {};
    }
  }

  private nameOf(id: string): string {
    if (id === "zec") return "tZEC";
    const r = this.registry.find((a) => a.asset_id === id);
    const w = this.wallet?.balances().assets.find((a) => a.asset_id === id);
    return r ? assetName(r) : (w?.name ?? `Token ${id.slice(0, 6)}`);
  }

  private say(text: string, tone: "ok" | "err" | "info" = "info") {
    this.note = { text, tone };
    this.render();
  }

  /** Typing updates the coin preview in place (no re-render, the cursor stays put). */
  private input(e: Event) {
    const t = e.target as HTMLInputElement;
    if (t.name === "name") this.draft.name = t.value;
    else if (t.name === "amount") this.draft.amount = t.value;
    else if (t.name === "seal") this.draft.seal = t.checked;
    else return;
    const prev = this.el.querySelector(".zl-strike .zl-preview");
    if (prev) prev.innerHTML = coinSvg(this.draft.name, nameColor(this.draft.name || "ZSA"), 120, this.draft.seal);
    this.el.querySelectorAll<HTMLElement>("[data-a=preset]").forEach((b) => b.classList.toggle("on", b.dataset.v === this.draft.amount));
  }

  /** Runs a wallet action with its stages on screen. */
  private async run<T>(what: string, fn: (stage: (s: string) => void) => Promise<T>): Promise<T> {
    this.note = null;
    this.busy = { what, stage: "Starting…", pct: null };
    this.render();
    try {
      return await fn((s) => {
        const m = s.match(/(\d+)%/);
        this.busy = { what, stage: s.replace(/\s*\d+%/, ""), pct: m ? Number(m[1]) : null };
        this.renderBusy();
      });
    } finally {
      this.busy = null;
    }
  }

  private async click(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLElement>("[data-tab]")?.dataset.tab as Tab | undefined;
    if (tab && !this.busy) {
      this.tab = tab;
      this.note = null;
      this.sendTo = null;
      this.making = false;
      return this.render();
    }
    const el = t.closest<HTMLElement>("[data-a]");
    const a = el?.dataset.a;
    if (!a || (this.busy && a !== "close")) return;
    const val = (n: string) => (this.el.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${n}"]`)?.value ?? "").trim();
    const w = this.wallet;
    const idOf = () => el!.closest<HTMLElement>("[data-id]")!.dataset.id!;
    try {
      switch (a) {
        case "close":
          return this.close();
        case "create": {
          this.busy = { what: "Opening your wallet", stage: "Making keys in this browser…", pct: null };
          this.render();
          this.wallet = await (await this.store()).create();
          this.busy = null;
          await this.drip();
          return;
        }
        case "restore": {
          const seed = prompt("Paste your mint wallet seed")?.trim();
          if (!seed) return;
          this.wallet = await (await this.store()).restore(seed);
          return void this.refresh();
        }
        case "drip":
          return void (await this.drip());
        case "faucet": {
          if (!w) return;
          await navigator.clipboard.writeText(w.address()).catch(() => {});
          this.copied = true;
          window.open(FAUCET, "_blank", "noopener");
          return this.render();
        }
        case "copy":
          await navigator.clipboard.writeText(w!.address());
          return this.say("Address copied.", "ok");
        case "seed":
          return void prompt("Your mint wallet seed (test network only). Keep it to open this wallet elsewhere.", w!.exportSeed());
        case "preset":
          this.draft.amount = el!.dataset.v!;
          return this.render();
        case "strike": {
          const name = this.draft.name.trim();
          const amount = num(this.draft.amount);
          if (!name || [...name].length > 32) return this.say("Give your coin a name (32 characters at most).", "err");
          if (!Number.isSafeInteger(amount) || amount <= 0) return this.say("The supply is a whole number above zero.", "err");
          const r = await this.run("Striking your coin", (st) => w!.issue(name, amount, this.draft.seal, st));
          this.struck = { name, asset_id: r.asset_id, txid: r.txid, amount };
          window.dispatchEvent(new CustomEvent("zsalab:minted", { detail: { name, asset_id: r.asset_id } }));
          this.draft.name = "";
          return void this.refresh();
        }
        case "again":
          this.struck = null;
          return this.render();
        case "post": {
          const s = this.struck;
          if (!s) return;
          const text = `I just struck my own shielded test coin "${s.name}" (${units(s.amount)}) on the Zcash shielded-assets testnet, proved and signed in my browser, at the ZSA MINT in ZStreet 🛡`;
          return void window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent("https://zstreet.cash/?interior=zsalab")}`, "_blank", "noopener");
        }
        case "send":
        case "melt":
          this.sendTo = { id: idOf(), mode: a === "melt" ? "burn" : "send" };
          return this.render();
        case "cancel-send":
          this.sendTo = null;
          return this.render();
        case "do-send": {
          const s = this.sendTo!;
          const n = num(val("n"));
          if (!Number.isSafeInteger(n) || n <= 0) return this.say("Enter a whole number of units.", "err");
          if (s.mode === "send") {
            const to = val("to");
            if (!/^u(regtest|test)1/.test(to)) return this.say("That isn't a ZSA testnet address (uregtest1…).", "err");
            await this.run("Sending shielded", (st) => w!.transfer(s.id, n, to, st));
            this.sendTo = null;
            this.say(`Sent ${units(n)} ${this.nameOf(s.id)} as a shielded transaction.`, "ok");
          } else {
            await this.run("Into the melt", (st) => w!.burn(s.id, n, st));
            this.sendTo = null;
            this.say(`${units(n)} ${this.nameOf(s.id)} melted: gone from the supply for good (ZIP 226).`, "ok");
          }
          return void this.refresh();
        }
        case "seal": {
          const id = idOf();
          if (!confirm(`Break the die of ${this.nameOf(id)}? Nobody, you included, can ever strike more of it.`)) return;
          await this.run("Breaking the die", (st) => w!.finalize(id, st));
          this.say(`The die of ${this.nameOf(id)} is broken: its supply is fixed forever (ZIP 227).`, "ok");
          return void this.refresh();
        }
        case "new-offer":
          this.making = true;
          return this.render();
        case "post-offer": {
          const give = val("give"),
            want = val("want_id") || val("want");
          const ga = num(val("ga")),
            wa = num(val("wa"));
          if (!give || !want || give === want) return this.say("Pick what you give and what you want (two different coins).", "err");
          if (!(ga > 0 && wa > 0)) return this.say("Both amounts must be above zero.", "err");
          const r = await fetch(`${ZSA_API}/v1/zsa/offers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ give_asset: give, give_amount: ga, want_asset: want, want_amount: wa, maker_address: w!.address() }) });
          const j = (await r.json().catch(() => ({}))) as { id?: string; secret?: string; error?: string };
          if (!r.ok || !j.id || !j.secret) return this.say(j.error ?? "The exchange board didn't take the offer.", "err");
          localStorage.setItem(MINE, JSON.stringify({ ...this.mine(), [j.id]: j.secret }));
          this.making = false;
          this.say("Offer posted. When someone takes it, their part lands in your wallet: then you send yours.", "ok");
          return void this.refresh();
        }
        case "take": {
          const o = this.offers.find((x) => x.id === idOf());
          if (!o) return;
          if (!confirm(`Send ${units(o.want_amount)} ${this.nameOf(o.want_asset)} first, asking for ${units(o.give_amount)} ${this.nameOf(o.give_asset)} in return?\n\nThis experimental testnet trade is not atomic: the other player may never send their part. The board publishes your wallet address and payment transaction ID alongside the offer's assets and amounts.`)) return;
          const r = await this.run("Sending your part", (st) => w!.transfer(o.want_asset, o.want_amount, o.maker_address, st));
          await fetch(`${ZSA_API}/v1/zsa/offers/${o.id}/take`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taker_address: w!.address(), txid: r.txid }) });
          this.say("Your part is on its way. The maker still needs to send theirs; this is not guaranteed.", "ok");
          return void this.refresh();
        }
        case "complete": {
          const o = this.offers.find((x) => x.id === idOf());
          const secret = o && this.mine()[o.id];
          if (!o || !secret || !o.taker_address) return;
          const r = await this.run("Sending your part", (st) => w!.transfer(o.give_asset, o.give_amount, o.taker_address!, st));
          await fetch(`${ZSA_API}/v1/zsa/offers/${o.id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret, txid: r.txid }) });
          this.say("Exchange done: both parts sent.", "ok");
          return void this.refresh();
        }
        case "cancel-offer": {
          const id = idOf();
          const secret = this.mine()[id];
          if (!secret) return;
          await fetch(`${ZSA_API}/v1/zsa/offers/${id}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret }) });
          return void this.refresh();
        }
      }
    } catch (err) {
      this.busy = null;
      const m = String((err as Error)?.message ?? err);
      this.say(/failed to fetch|networkerror|load failed/i.test(m) ? "The mint's service didn't answer: check your connection and try again in a moment." : m, "err");
    }
  }

  private async drip() {
    const w = this.wallet!;
    this.busy = { what: "Fuelling your wallet", stage: "Asking ZStreet for free test ZEC…", pct: null };
    this.render();
    try {
      const r = await fetch(`${ZSA_API}/v1/zsa/drip`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: w.address() }) });
      const j = (await r.json().catch(() => ({}))) as { txid?: string; amount_zat?: number; error?: string };
      this.busy = null;
      if (!r.ok) return this.say(j.error ?? "The free fuel is out for now: use the faucet below.", "err");
      if (j.txid && j.amount_zat) w.trackIncoming?.(j.txid, j.amount_zat);
      this.dripAt = Date.now();
      this.render();
    } catch {
      this.busy = null;
      this.say("The mint's service didn't answer: try again in a moment.", "err");
    }
  }

  // ---- rendering ---------------------------------------------------------------------------------

  private renderBusy() {
    const box = this.el.querySelector(".zl-busy");
    if (!box || !this.busy) return this.render();
    box.querySelector(".zl-stage")!.textContent = this.busy.stage;
    const bar = box.querySelector<HTMLElement>(".zl-bar i");
    if (bar) bar.style.width = `${this.busy.pct ?? 0}%`;
    box.classList.toggle("indet", this.busy.pct == null);
  }

  /** The fuel chip and the steps; returns what the body needs. */
  private renderHead() {
    const w = this.wallet;
    const b = w?.balances();
    const fuel = b ? b.zec_zat : 0;
    const coming = b ? b.pending_zat : 0;
    if (fuel > 0) this.dripAt = null;
    // the fuel screen is for a wallet with nothing at all (or its first drip on the way); after a
    // transaction the change is "coming" for a block, and the rest of the terminal stays usable
    const empty = fuel <= 0 && (coming <= 0 || this.dripAt != null) && !this.struck;
    const step = !w ? 0 : empty ? 1 : this.tab === "mint" && !this.struck ? 2 : 3;
    this.chip.innerHTML = `<span>Experimental · testnet</span>` + (w ? `<span class="${fuel > 0 ? "ok" : "low"}">⛽ ${zec(fuel)} tZEC${coming ? ` · +${zec(coming)} coming` : ""}</span>${this.tip ? `<span>block #${this.tip.toLocaleString("en-US")}</span>` : ""}` : this.tip ? `<span>live · block #${this.tip.toLocaleString("en-US")}</span>` : "");
    this.steps.innerHTML = ["Wallet", "Fuel", "Strike", "Your coins"].map((s, i) => `<li class="${i < step ? "done" : i === step ? "on" : ""}"><b>${i < step ? "✓" : i + 1}</b>${s}</li>`).join("");
    return { w, b, fuel, coming, empty };
  }

  private render() {
    const { w, b, fuel, coming, empty } = this.renderHead();

    let html = "";
    if (this.busy) {
      html = `<div class="zl-busy ${this.busy.pct == null ? "indet" : ""}"><div class="zl-what">${esc(this.busy.what)}</div><div class="zl-stage">${esc(this.busy.stage)}</div><div class="zl-bar"><i style="width:${this.busy.pct ?? 0}%"></i></div><p class="zl-small">Your browser is building a zero-knowledge proof: 8 to 15 seconds. Keep this tab open.</p></div>`;
    } else if (!w) {
      html = `<div class="zl-hero">
          <div class="zl-preview">${coinSvg("Your Coin", "#3ef0c8", 120)}</div>
          <h3>Strike your own shielded coin</h3>
          <p>A real asset on Zcash's experimental ZSA test network. Mint details are public; transfers use shielded transactions. Test coins have no monetary value. About two minutes.</p>
          <ul class="zl-how"><li><b>1</b>A wallet opens in this browser: your keys never leave it.</li><li><b>2</b>ZStreet fills it with a little free test ZEC for the fees.</li><li><b>3</b>Name your coin, choose its supply, strike it. The press in the hall strikes it with you.</li></ul>
          <button class="zl-go" data-a="create">Open my mint wallet</button>
          <button class="zl-link" data-a="restore">I already have one (seed)</button>
        </div>`;
    } else if (empty) {
      const waiting = coming > 0 || this.dripAt != null;
      const secs = this.dripAt ? Math.max(0, Math.round((Date.now() - this.dripAt) / 1000)) : null;
      html = `<div class="zl-card">
          <h3>Fuel up</h3>
          <p>Every transaction pays a tiny fee in test ZEC. ${waiting ? "Yours is on its way." : "Get some free fuel first."}</p>
          ${waiting ? `<div class="zl-wait"><span class="zl-dot"></span>Free fuel sent · it lands with the next block (about a minute)${secs != null ? ` · ${secs}s` : ""}</div>` : `<button class="zl-go" data-a="drip">Get free fuel from ZStreet</button>`}
          <div class="zl-or"><span>or</span></div>
          <button class="zl-ghost" data-a="faucet">${this.copied ? "✓ Address copied: paste it in the faucet tab" : "Copy my address & open the faucet"}</button>
          <p class="zl-small">The faucet gives 0.01 tZEC per request (one every 5 minutes): paste your address, solve the captcha.</p>
        </div>
        ${this.walletRow(w)}`;
    } else if (this.tab === "mint") {
      if (this.struck) {
        const s = this.struck;
        const mined = this.registry.some((a) => a.asset_id === s.asset_id);
        html = `<div class="zl-hero">
            <div class="zl-preview">${coinSvg(s.name, assetColor(s.asset_id), 150)}</div>
            <h3>${esc(s.name)} is struck</h3>
            <p>${units(s.amount)} units, proved and signed in your browser. ${mined ? "It's in the register and on the conveyor." : "It joins the register with the next block (about a minute)."}</p>
            <p class="zl-small mono">tx ${esc(short(s.txid))}</p>
            <div class="zl-row"><button class="zl-go" data-a="post">Post it on X</button><button class="zl-ghost" data-tab="tokens">My coins</button><button class="zl-ghost" data-a="again">Strike another</button></div>
          </div>`;
      } else {
        const presets = [
          ["1K", "1000"],
          ["1M", "1000000"],
          ["21M", "21000000"],
          ["1B", "1000000000"],
        ];
        html = `<div class="zl-strike">
            <div class="zl-preview">${coinSvg(this.draft.name, nameColor(this.draft.name || "ZSA"), 120, this.draft.seal)}</div>
            <label class="zl-field"><span>Name</span><input name="name" maxlength="32" placeholder="My Shielded Coin" autocomplete="off" value="${esc(this.draft.name)}" /></label>
            <label class="zl-field"><span>Supply</span><input name="amount" inputmode="numeric" value="${esc(this.draft.amount)}" /></label>
            <div class="zl-presets">${presets.map(([l, v]) => `<button data-a="preset" data-v="${v}" class="${this.draft.amount === v ? "on" : ""}">${l}</button>`).join("")}</div>
            <label class="zl-toggle"><input type="checkbox" name="seal" ${this.draft.seal ? "checked" : ""} /><span><b>Break the die</b> after striking: the supply is fixed forever</span></label>
            ${fuel > 0 ? `<button class="zl-go big" data-a="strike">STRIKE</button>` : `<button class="zl-go big" disabled>WAITING FOR YOUR CHANGE…</button><p class="zl-small">Your last transaction's change lands with the next block (about a minute).</p>`}
          </div>
          ${this.walletRow(w)}`;
      }
    } else if (this.tab === "exchange") {
      html = this.exchangeHtml(w);
    } else {
      const list = b!.assets.filter((x) => x.units > 0);
      const mode = this.tab;
      html = list.length
        ? `<div class="zl-coins">${list
            .map((x) => {
              const name = x.name ?? this.nameOf(x.asset_id);
              const reg = this.registry.find((r) => r.asset_id === x.asset_id);
              const editing = this.sendTo?.id === x.asset_id;
              return `<div class="zl-coincard" data-id="${esc(x.asset_id)}">
                ${coinSvg(name, assetColor(x.asset_id), 56, reg?.finalized)}
                <div class="zl-cc-main"><b>${esc(name)}</b><span class="mono">${units(x.units)}${reg?.finalized ? " · die broken" : ""}</span></div>
                <div class="zl-cc-act">
                  ${mode === "tokens" ? `<button data-a="send">Send</button><button data-tab="exchange">Exchange</button>` : ""}
                  ${mode === "burn" || mode === "tokens" ? `<button data-a="melt">Melt</button>` : ""}
                  ${mode === "finalize" && !reg?.finalized ? `<button data-a="seal">Break die</button>` : ""}
                </div>
                ${editing ? `<div class="zl-inline">${this.sendTo!.mode === "send" ? `<input name="to" placeholder="uregtest1… address" autocomplete="off" />` : ""}<input name="n" inputmode="numeric" placeholder="units" /><button class="zl-go" data-a="do-send">${this.sendTo!.mode === "send" ? "Send shielded" : "Melt"}</button><button class="zl-link" data-a="cancel-send">Cancel</button></div>` : ""}
              </div>`;
            })
            .join("")}</div>`
        : `<div class="zl-card"><h3>No coins yet</h3><p>Strike your first one.</p><button class="zl-go" data-tab="mint">Strike a coin</button></div>`;
      if (mode === "burn") html = `<p class="zl-lead">The melt removes units from a supply for good (ZIP 226).</p>` + html;
      if (mode === "finalize") html = `<p class="zl-lead">Breaking a coin's die (finalizing, ZIP 227) fixes its supply: its issuer can never strike more.</p>` + html;
      html += this.walletRow(w);
    }
    if (this.note) html += `<div class="zl-note ${this.note.tone}">${esc(this.note.text)}</div>`;
    const tabs = w && !empty && !this.busy ? `<nav class="zl-tabs">${(["mint", "tokens", "exchange", "burn", "finalize"] as Tab[]).map((t) => `<button data-tab="${t}" class="${this.tab === t ? "on" : ""}">${{ mint: "Strike", tokens: "My coins", exchange: "Exchange", burn: "Melt", finalize: "Die" }[t]}</button>`).join("")}</nav>` : "";
    this.body.innerHTML = tabs + html;
  }

  private walletRow(w: LabWallet) {
    return `<div class="zl-wallet"><span class="mono" title="${esc(w.address())}">${esc(short(w.address()))}</span><button data-a="copy">Copy</button><button data-a="seed">Seed</button></div>`;
  }

  private exchangeHtml(w: LabWallet) {
    const mine = this.mine();
    const bal = w.balances();
    const held = (id: string) => (id === "zec" ? bal.zec_zat : (bal.assets.find((x) => x.asset_id === id)?.units ?? 0));
    const open = this.offers.filter((o) => o.status === "open" && !mine[o.id]);
    const own = this.offers.filter((o) => mine[o.id] && o.status !== "cancelled" && o.status !== "expired");
    const chip = (id: string, n: number) => `<span class="zl-pair">${coinSvg(this.nameOf(id), id === "zec" ? "#f4b728" : assetColor(id), 26)}<b>${id === "zec" ? zec(n) : units(n)}</b> ${esc(this.nameOf(id))}</span>`;
    let html = `<div class="zl-card">
      <h3>Experimental exchange · testnet</h3>
      <p>This board is public: offers expose the assets and amounts, both players' wallet addresses and payment transaction IDs. Shielded payments do not hide these details from the board.</p>
      <p>Trades are two independent payments, not atomic swaps. The taker pays first; the maker may never send their part. Use test coins only.</p>
    </div>`;
    if (this.making) {
      const mineOpts = bal.assets.filter((x) => x.units > 0).map((x) => `<option value="${esc(x.asset_id)}">${esc(x.name ?? this.nameOf(x.asset_id))} · ${units(x.units)}</option>`);
      const wantOpts = this.registry
        .filter((r) => r.name)
        .slice(0, 60)
        .map((r) => `<option value="${esc(r.asset_id)}">${esc(assetName(r))}</option>`);
      html += `<div class="zl-card">
          <h3>New offer</h3>
          <label class="zl-field"><span>I give</span><select name="give">${mineOpts.join("") || `<option value="">no coin to give yet</option>`}</select></label>
          <label class="zl-field"><span>Amount</span><input name="ga" inputmode="numeric" placeholder="10000" /></label>
          <label class="zl-field"><span>I want</span><select name="want"><option value="zec">tZEC (in zatoshis)</option>${wantOpts.join("")}</select></label>
          <label class="zl-field"><span>Or a coin id</span><input name="want_id" placeholder="64-hex asset id (optional)" autocomplete="off" /></label>
          <label class="zl-field"><span>Amount</span><input name="wa" inputmode="numeric" placeholder="500" /></label>
          <p class="zl-small">Posting publishes your wallet address, the assets and the amounts. The taker's address and both payment transaction IDs are published as the trade proceeds.</p>
          <div class="zl-row"><button class="zl-go" data-a="post-offer">Publish offer &amp; address</button><button class="zl-link" data-tab="exchange">Cancel</button></div>
        </div>`;
    } else html += `<button class="zl-go" data-a="new-offer">Make an offer</button>`;
    if (own.length)
      html += `<h4>Your offers</h4>${own
        .map(
          (o) => `<div class="zl-offer" data-id="${esc(o.id)}">${chip(o.give_asset, o.give_amount)}<span class="zl-arrow">for</span>${chip(o.want_asset, o.want_amount)}
            <div class="zl-offer-st">${o.status === "open" ? `waiting for a taker <button class="zl-link" data-a="cancel-offer">Cancel</button>` : o.status === "taken" ? `taken: their part is on its way (you hold ${units(held(o.want_asset))} ${esc(this.nameOf(o.want_asset))}) <button class="zl-go" data-a="complete">Send &amp; publish txid</button>` : "done ✓"}</div></div>`,
        )
        .join("")}`;
    html += `<h4>Open offers</h4>`;
    html += open.length
      ? open
          .map((o) => {
            const can = held(o.want_asset) >= o.want_amount + (o.want_asset === "zec" ? 20000 : 0);
            return `<div class="zl-offer" data-id="${esc(o.id)}">${chip(o.give_asset, o.give_amount)}<span class="zl-arrow">for</span>${chip(o.want_asset, o.want_amount)}
              <div class="zl-offer-st">${can ? `<button class="zl-go" data-a="take">Review trade</button>` : `you need ${units(o.want_amount)} ${esc(this.nameOf(o.want_asset))}`}</div></div>`;
          })
          .join("")
      : `<p class="zl-small">No open offer right now: make the first one.</p>`;
    return html;
  }
}
