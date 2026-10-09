import QRCode from "qrcode";
import { getNoirWallet, verifyMessageSignature, type NoirWalletProvider } from "@noir-wallet/sdk";
import { myRefs, StreetPay, type Intent, type Mark, type PayAction, type PayStatus } from "../data/streetpay";
import { EXPLORER } from "../data/zscan";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const X = '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const EXT = '<svg class="i" viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8"/></svg>';
const NOIR_STORE = "https://chromewebstore.google.com/detail/noir-wallet/mfoghjbpfanobmnoemoepenjjcmfpmdn";

/** The wallets on show: Zodl and Vizor have their towers on the avenue; Noir pays from the browser. */
export const WALLETS = [
  { key: "zodl", name: "Zodl", kind: "Mobile · iOS & Android", color: "#f5f4f2", line: "Shielded by default, swaps through NEAR Intents, CrossPay, Keystone. Formerly Zashi.", url: "https://www.zodl.com/" },
  { key: "vizor", name: "Vizor", kind: "Desktop & mobile", color: "#e0306a", line: "From the team behind Keplr: shielded by default, Keystone and Ledger signing, open source.", url: "https://vizor.cash/" },
  { key: "noir", name: "Noir", kind: "Browser extension", color: "#00d38c", line: "A shielded wallet in Chrome that web pages can ask to pay or to sign: one click instead of a QR code.", url: NOIR_STORE },
] as const;
export type WalletKey = (typeof WALLETS)[number]["key"];

/** Where the visitor stands, for a message left on the ground. */
export interface Here {
  place: string;
  floor: number;
  x: number;
  y: number;
  z: number;
}

export interface PayDeskCallbacks {
  /** Where the visitor stands now (null in the overview: messages are left on foot). */
  here(): Here | null;
  closed(): void;
}

type View =
  | { v: "gallery"; wallet: WalletKey | null }
  | { v: "compose"; action: PayAction; here: Here | null; round?: number; idx?: number; title?: string }
  | { v: "pay"; intent: Intent; status: PayStatus | null }
  | { v: "read"; mark: Mark };

const COPY: Record<PayAction, { eyebrow: string; title: string; sub: string; field: string; max: number; ph: string }> = {
  mark: { eyebrow: "On-chain message", title: "Leave a message here", sub: "Sealed in a shielded memo, it glows on the ground where you stand for everyone who passes.", field: "Your message", max: 300, ph: "Praise the block…" },
  guestbook: { eyebrow: "Wallet towers", title: "Sign the guestbook", sub: "A line on the guestbook in the ZODL and Vizor towers, sealed in a shielded memo.", field: "Your line", max: 300, ph: "Privacy is normal." },
  vote: { eyebrow: "City Works", title: "A sealed vote", sub: "Paid from your wallet, counted apart from the free votes: harder to fake.", field: "", max: 0, ph: "" },
  tip: { eyebrow: "ZStreet", title: "Tip the city", sub: "Fireworks over the avenue for everyone. From 0.1 ZEC your name rides the buses for a day.", field: "Name on the buses (optional)", max: 24, ph: "anon" },
};

/**
 * The wallet desk: the wallets on show, and every action paid from one. An action becomes a
 * ZIP-321 request (QR code, or address and memo to copy); the memo carries `ZS1:<ref>` and the
 * text, and plays in the city once the block is mined. The payer is never shown, only the memo.
 */
export class PayDesk {
  private el: HTMLElement;
  private view: View | null = null;
  private poll = 0;
  private error = "";
  private busy = false;
  private noir: { wallet: NoirWalletProvider; address: string; verified: boolean } | null = null;

  constructor(
    root: HTMLElement,
    private cb: PayDeskCallbacks,
  ) {
    this.el = document.createElement("aside");
    this.el.className = "venue paydesk hud";
    root.append(this.el);
    this.el.addEventListener("click", (e) => void this.onClick(e));
    this.el.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.submit();
    });
    this.el.addEventListener("input", (e) => {
      const t = e.target as HTMLTextAreaElement;
      const n = this.el.querySelector<HTMLElement>(".count");
      if (n && t.maxLength > 0) n.textContent = `${t.value.length}/${t.maxLength}`;
    });
    // keys typed in the form must not walk the visitor around
    this.el.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.close();
    });
    try {
      const n = JSON.parse(localStorage.getItem("street.noir") ?? "null") as { address: string; verified: boolean } | null;
      if (n) void this.noirSilent(n);
    } catch {}
  }

  get open() {
    return this.view !== null;
  }

  /** The wallet gallery (a phone was clicked: that wallet first). */
  gallery(wallet: WalletKey | null = null) {
    this.show({ v: "gallery", wallet });
  }

  compose(action: PayAction, o: { here?: Here | null; round?: number; idx?: number; title?: string } = {}) {
    this.error = "";
    this.show({ v: "compose", action, here: o.here ?? null, round: o.round, idx: o.idx, title: o.title });
  }

  read(mark: Mark) {
    this.show({ v: "read", mark });
  }

  close() {
    if (!this.view) return;
    this.view = null;
    clearTimeout(this.poll);
    this.el.classList.remove("open");
    this.cb.closed();
  }

  private show(v: View) {
    clearTimeout(this.poll);
    this.view = v;
    this.el.classList.add("open");
    void this.render();
  }

  private async onClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-v]");
    if (!t) return;
    const v = t.dataset.v!;
    if (v === "close") return this.close();
    if (v === "back") return this.gallery();
    if (v.startsWith("wallet:")) return this.gallery(v.slice(7) as WalletKey);
    if (v.startsWith("do:")) {
      const action = v.slice(3) as PayAction;
      return this.compose(action, { here: action === "mark" ? this.cb.here() : null });
    }
    if (v.startsWith("copy:")) {
      const what = v.slice(5);
      const view = this.view;
      if (view?.v !== "pay") return;
      const text = what === "address" ? view.intent.address : what === "memo" ? view.intent.memo : view.intent.uri;
      try {
        await navigator.clipboard.writeText(text);
        t.classList.add("done");
        setTimeout(() => t.classList.remove("done"), 1200);
      } catch {}
      return;
    }
    if (v === "noir-connect") return void this.noirConnect();
    if (v === "noir-pay") return void this.noirPay();
    if (v === "like" || v === "report") {
      const view = this.view;
      if (view?.v !== "read") return;
      const r = await StreetPay.rate(view.mark.id, v);
      if (r.ok && v === "like") view.mark = { ...view.mark, likes: view.mark.likes + (likedBefore(view.mark.id) ? 0 : 1) };
      remember(view.mark.id, v);
      return void this.render();
    }
  }

  private async submit() {
    const view = this.view;
    if (view?.v !== "compose" || this.busy) return;
    const text = this.el.querySelector<HTMLTextAreaElement>("[name=text]")?.value ?? "";
    if ((view.action === "mark" || view.action === "guestbook") && !text.trim()) {
      this.error = "Write something first.";
      return void this.render();
    }
    this.busy = true;
    this.error = "";
    void this.render(text);
    const h = view.here;
    const r = await StreetPay.intent(view.action, {
      text,
      ...(view.action === "mark" && h ? { place: h.place, floor: h.floor, x: h.x, y: h.y, z: h.z } : {}),
      ...(view.action === "guestbook" ? { place: "wallets" } : {}),
      ...(view.action === "vote" ? { round: view.round, idx: view.idx } : {}),
    });
    this.busy = false;
    if (!r.ok) {
      this.error = r.error;
      return void this.render(text);
    }
    myRefs.add(r.data.ref);
    this.show({ v: "pay", intent: r.data, status: null });
    this.watch(r.data.ref);
  }

  /** Polls the request until it lands (or expires), every few seconds while the desk is open. */
  private watch(ref: string) {
    const tick = async () => {
      const view = this.view;
      if (view?.v !== "pay" || view.intent.ref !== ref) return;
      const s = await StreetPay.status(ref);
      if (this.view !== view) return;
      if (s && s.state !== view.status?.state) {
        view.status = s;
        void this.render();
      }
      if (!s || s.state === "waiting" || s.state === "seen") this.poll = window.setTimeout(tick, 6000);
    };
    this.poll = window.setTimeout(tick, 4000);
  }

  // ---- Noir -----------------------------------------------------------------------------------

  private async noirSilent(saved: { address: string; verified: boolean }) {
    for (let i = 0; i < 10 && !getNoirWallet(); i++) await new Promise((r) => setTimeout(r, 200));
    const wallet = getNoirWallet();
    if (!wallet) return;
    try {
      const accounts = await wallet.zcash.getAccounts();
      if (accounts) this.noir = { wallet, address: saved.address, verified: saved.verified };
    } catch {}
  }

  /** Connect, then sign a one-off message with the unlinkable derived key: the "verified" badge. */
  private async noirConnect() {
    const wallet = getNoirWallet();
    if (!wallet) return void window.open(NOIR_STORE, "_blank", "noopener");
    try {
      await wallet.zcash.connect();
      const message = `ZStreet: I walk the city with my own wallet. ${new Date().toISOString().slice(0, 10)} ${Math.random().toString(36).slice(2, 10)}`;
      const sig = await wallet.zcash.signMessage(message, { signingMode: "derived" });
      const check = verifyMessageSignature({ message, signature: sig.signature, pubkey: sig.pubkey, address: sig.address });
      this.noir = { wallet, address: sig.address, verified: check.valid };
      try {
        localStorage.setItem("street.noir", JSON.stringify({ address: sig.address, verified: check.valid }));
      } catch {}
      this.error = check.valid ? "" : "Noir's signature didn't check out.";
    } catch (e) {
      this.error = walletError(e);
    }
    void this.render();
  }

  private async noirPay() {
    const view = this.view;
    if (view?.v !== "pay" || !this.noir) return;
    this.busy = true;
    void this.render();
    try {
      await this.noir.wallet.zcash.sendTransaction({ to: view.intent.address, amount: view.intent.amount, memo: view.intent.memo });
      this.error = "";
    } catch (e) {
      this.error = walletError(e);
    }
    this.busy = false;
    void this.render();
  }

  // ---- rendering ------------------------------------------------------------------------------

  private head(eyebrow: string, title: string, sub: string, back = false) {
    return `<header>${back ? `<button class="x" data-v="back" aria-label="Back">‹</button>` : ""}<div class="grow"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2><div class="muted">${sub}</div></div><button class="x" data-v="close" aria-label="Close">${X}</button></header>`;
  }

  private async render(keepText?: string) {
    const view = this.view;
    if (!view) return;
    this.el.dataset.view = view.v;
    if (view.v === "gallery") this.el.innerHTML = await this.galleryHtml(view.wallet);
    else if (view.v === "compose") this.el.innerHTML = this.composeHtml(view);
    else if (view.v === "pay") {
      this.el.innerHTML = this.payHtml(view.intent, view.status);
      const c = this.el.querySelector<HTMLCanvasElement>("canvas.qr");
      if (c) void QRCode.toCanvas(c, view.intent.uri, { margin: 1, width: 232, errorCorrectionLevel: "M", color: { dark: "#0d0b08", light: "#f6efe0" } });
    } else this.el.innerHTML = this.readHtml(view.mark);
    const ta = this.el.querySelector<HTMLTextAreaElement>("[name=text]");
    if (ta && keepText !== undefined) ta.value = keepText;
    if (ta && keepText === undefined) setTimeout(() => ta.focus(), 50);
  }

  private async galleryHtml(first: WalletKey | null) {
    const info = await StreetPay.info();
    const list = first ? [...WALLETS].sort((a, b) => (a.key === first ? -1 : b.key === first ? 1 : 0)) : WALLETS;
    const on = info?.enabled;
    return `${this.head("Wallet towers · 財布", "Your wallet", "Your own wallet, in the city: scan a code, the memo plays for everyone.")}
      <div class="wallets">${list
        .map(
          (w) => `<div class="wcard ${w.key === first ? "on" : ""}" style="--w:${w.color}">
            <div class="wname"><i></i><b>${w.name}</b><span class="muted">${w.kind}</span></div>
            <p>${w.line}</p>
            ${w.url ? `<a class="lnk" href="${w.url}" target="_blank" rel="noopener">${w.key === "noir" ? "Chrome Web Store" : new URL(w.url).host} ${EXT}</a>` : ""}
          </div>`,
        )
        .join("")}</div>
      ${this.noirBlock()}
      <div class="mh">What your wallet can do here</div>
      ${
        on
          ? `<div class="acts">
        <button class="btn" data-v="do:guestbook"><b>Sign the guestbook</b><span>${info.min.guestbook} ZEC · a line on the gilded wall</span></button>
        <button class="btn" data-v="do:tip"><b>Tip the city</b><span>from ${info.min.tip} ZEC · fireworks for all</span></button>
        <div class="hint">On foot anywhere in the city, press <kbd>N</kbd> to leave a sealed message on the ground. City Works: vote with your wallet from the works panel.</div>
      </div>`
          : `<div class="note lock">The city's wallet desk is closed for now.</div>`
      }
      <div class="note lock">Payments are shielded: ZStreet only reads the memo, with its own viewing key. Nobody sees who paid; only the text you chose is shown.</div>`;
  }

  private noirBlock() {
    if (this.noir)
      return `<div class="noir on"><b>Noir connected</b><span class="mono">${esc(this.noir.address.slice(0, 10))}…${esc(this.noir.address.slice(-6))}</span>${this.noir.verified ? `<span class="tag ok">verified</span>` : ""}</div>${this.error ? `<div class="err">${esc(this.error)}</div>` : ""}`;
    return `<button class="btn wide" data-v="noir-connect">${getNoirWallet() ? "Connect Noir · sign once" : "Get Noir for one-click payments"}</button>${this.error ? `<div class="err">${esc(this.error)}</div>` : ""}`;
  }

  private composeHtml(view: Extract<View, { v: "compose" }>) {
    const c = COPY[view.action];
    const where = view.action === "mark" ? (view.here ? `<div class="muted small">Here: ${esc(placeName(view.here))}</div>` : `<div class="err">Messages are left on foot: walk somewhere and press N.</div>`) : "";
    const field = c.max
      ? `<label class="mh" for="pd-text">${c.field}</label>
         <textarea id="pd-text" name="text" rows="${c.max > 40 ? 4 : 1}" maxlength="${c.max}" placeholder="${c.ph}" spellcheck="true"></textarea>
         <div class="count muted small">0/${c.max}</div>`
      : `<div class="vote-for"><b>${esc(view.title ?? "")}</b></div>`;
    const disabled = this.busy || (view.action === "mark" && !view.here);
    return `${this.head(c.eyebrow, c.title, c.sub, true)}
      <form class="vk pd" autocomplete="off">${where}${field}
        ${this.error ? `<div class="err">${esc(this.error)}</div>` : ""}
        <button class="btn primary" ${disabled ? "disabled" : ""}>${this.busy ? "…" : "Get the payment code"}</button>
      </form>
      <div class="note lock">Your text goes in the memo of a shielded payment. What arrives on chain is what is shown: edit it in your wallet and the edit is what everyone reads.</div>`;
  }

  private payHtml(it: Intent, s: PayStatus | null) {
    const c = COPY[it.action];
    const state = s?.state ?? "waiting";
    const steps: Record<string, string> = {
      waiting: `<span class="dot"></span> Waiting for your payment… it shows here once mined (about a minute after you send).`,
      seen: `<span class="dot"></span> Payment found, playing it…`,
      confirmed: `<b class="ok">Sealed in block ${s?.height?.toLocaleString("en-US") ?? ""}.</b> ${it.action === "mark" ? "Your message glows where you stood." : it.action === "guestbook" ? "Your line is on the wall." : it.action === "vote" ? "Your sealed vote counts." : "Look up: fireworks."}`,
      short: `<b class="err">The payment was below ${s?.min ?? it.amount} ZEC, so it didn't play.</b>`,
      expired: `<span class="muted">This request expired. Ask for a new one.</span>`,
    };
    return `${this.head(c.eyebrow, state === "confirmed" ? "Done" : "Pay from your wallet", `${it.amount} ZEC · shielded · memo included`, true)}
      <div class="qrwrap"><canvas class="qr" width="232" height="232"></canvas>
        <div class="qrside">
          <div class="mh">Amount</div><div class="big mono">${esc(it.amount)} <small>ZEC</small></div>
          <a class="btn primary" href="${esc(it.uri)}">Open in my wallet</a>
          ${this.noir ? `<button class="btn" data-v="noir-pay" ${this.busy ? "disabled" : ""}>${this.busy ? "Sending…" : "Pay with Noir"}</button>` : ""}
        </div>
      </div>
      <div class="status ${state}">${steps[state]}</div>
      ${this.error ? `<div class="err">${esc(this.error)}</div>` : ""}
      <div class="mh">Or copy into any wallet</div>
      <div class="copyrow"><span class="lbl">Address</span><code class="mono">${esc(it.address.slice(0, 18))}…${esc(it.address.slice(-8))}</code><button class="btn" data-v="copy:address">Copy</button></div>
      <div class="copyrow"><span class="lbl">Memo</span><code class="mono memo">${esc(it.memo)}</code><button class="btn" data-v="copy:memo">Copy</button></div>
      <div class="note lock">Keep the <span class="mono">ZS1:${esc(it.ref)}</span> at the start of the memo: it tells the city which request you paid. Valid 24 h.</div>`;
  }

  private readHtml(m: Mark) {
    const liked = likedBefore(m.id);
    const reported = reportedBefore(m.id);
    const date = new Date(m.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    return `${this.head(m.kind === "guestbook" ? "Guestbook · ZEC Reserve" : "A message on the ground", "Sealed on-chain", `Block ${m.height.toLocaleString("en-US")} · ${date}`)}
      <blockquote class="markq">${esc(m.text).replace(/\n/g, "<br>")}</blockquote>
      <div class="row-acts">
        <button class="btn ${liked ? "on" : ""}" data-v="like" ${liked ? "disabled" : ""}>♥ Good message · ${m.likes}</button>
        <button class="btn" data-v="report" ${reported ? "disabled" : ""}>${reported ? "Reported" : "Report"}</button>
      </div>
      <a class="btn wide" href="${EXPLORER}/tx/${esc(m.txid)}" target="_blank" rel="noopener">The transaction on ZScan ${EXT}</a>
      <div class="note lock">The memo of a shielded payment: who sent it stays private, the text is what reached the chain.</div>
      <button class="btn wide" data-v="do:mark">Leave your own message here</button>`;
  }
}

function placeName(h: Here) {
  return h.place === "street" ? `the street (${Math.round(h.x)}, ${Math.round(h.z)})` : `${h.place}, floor ${h.floor}`;
}

function walletError(e: unknown): string {
  const code = (e as { code?: number })?.code;
  if (code === 4001) return "You declined the request in Noir.";
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return m || "Noir returned an error.";
}

function seen(kind: "like" | "report"): number[] {
  try {
    return JSON.parse(localStorage.getItem(`street.marks.${kind}`) ?? "[]") as number[];
  } catch {
    return [];
  }
}
function remember(id: number, kind: "like" | "report") {
  try {
    localStorage.setItem(`street.marks.${kind}`, JSON.stringify([id, ...seen(kind).filter((i) => i !== id)].slice(0, 500)));
  } catch {}
}
const likedBefore = (id: number) => seen("like").includes(id);
const reportedBefore = (id: number) => seen("report").includes(id);

/** A QR code drawn on a canvas (the phones' screens in the hall). */
export async function qrCanvas(uri: string, size: number, dark = "#0d0b08", light = "#f6efe0") {
  const c = document.createElement("canvas");
  await QRCode.toCanvas(c, uri, { margin: 1, width: size, errorCorrectionLevel: "M", color: { dark, light } });
  return c;
}
