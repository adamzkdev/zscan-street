import "./zshop.css";
import QRCode from "qrcode";
import { getNoirWallet } from "@noir-wallet/sdk";
import { API } from "../data/zscan";
import { visitorToken } from "../data/token";
import { Economy, type StoreTab, type StoreTabContext } from "./economy";
import { Wallet } from "./wallet";

/**
 * GET ⓩ: the game's play money bought with real ZEC, in the STORE's GET ⓩ tab.
 *
 * It rides ZStreet's wallet layer (the same as the messages on the ground, the guestbook, sealed
 * votes and tips, src/data/streetpay.ts): the API (ZScan, crates/api/src/street_pay.rs) gives an
 * intent — a ZIP-321 request to one of ZStreet's one-time shielded addresses with `ZS1:<ref>` in
 * the memo — the visitor pays from any wallet (QR code, address and memo copied, or Noir in one
 * click), the indexer reads the memo with the address's viewing key, and the API records the order:
 * ⓩ in proportion to what was paid. This browser's anonymous account is its `visitorToken()` (the
 * API keeps only its hash): it alone can claim the order, and each ⓩ is handed out once
 * (`POST /v1/street/pay/{ref}/claim` with a key: a lost answer is asked for again with the same key
 * and gets the same answer, never more), then credited here with `Economy.earn`.
 *
 * Server side this needs the `coins` action, the bundles in `GET /v1/street/pay`, the order table
 * and the claim route (ZScan API, branch `street-coins`, migration 0028_street_coins.sql). Until the API serves bundles the
 * tab says the shop is closed: no button that can't be paid.
 *
 * Orders are remembered in this browser (`zstreet.zecshop`) and watched while the page is open,
 * so a payment that confirms after the tab was closed is still credited.
 *
 * Dev only: `?zecmock` (in `vite` dev builds) answers from a pretend server that confirms an order
 * a few seconds after it is asked for, to test the flow without ZEC. Production builds drop it.
 */

export interface Bundle {
  id: string;
  coins: number;
  zec: string;
}
export interface Order {
  ref: string;
  bundle: string;
  coins: number;
  address: string;
  amount: string;
  memo: string;
  uri: string;
  expires: string;
  /** What the API says: waiting, seen (in a block, not counted yet), confirmed, short, expired. */
  state: string;
  /** ⓩ credited here so far. */
  credited: number;
  /** The key of a claim sent and not answered yet (asked again with it: never twice the ⓩ). */
  key?: string;
  /** When it was asked for (ms). */
  at: number;
}

/** Dev builds only (`import.meta.env.DEV` is a literal false in a production build, so the bundler
 *  drops this, the pretend server and its strings). */
const mockFlag = () => typeof location !== "undefined" && new URLSearchParams(location.search).has("zecmock");
// (the pretend server's orders never mix with real ones)
const KEY = import.meta.env.DEV && mockFlag() ? "zstreet.zecshop.mockorders" : "zstreet.zecshop";

// ---- the server ------------------------------------------------------------------------------------

interface Api {
  info(): Promise<{ enabled: boolean; bundles: Bundle[] } | null>;
  intent(bundle: string): Promise<{ ok: true; data: { ref: string; address: string; amount: string; memo: string; uri: string; expires_at: string } } | { ok: false; error: string }>;
  status(ref: string): Promise<{ state: string; coins: number | null; claimed: number | null } | null>;
  claim(ref: string, key: string): Promise<{ coins: number; paid: boolean } | null>;
}

const real: Api = {
  async info() {
    try {
      const r = await fetch(`${API}/v1/street/pay`, { cache: "no-store" });
      if (!r.ok) return null;
      const j = (await r.json()) as { enabled: boolean; bundles?: Bundle[] };
      return { enabled: j.enabled, bundles: j.bundles ?? [] };
    } catch {
      return null;
    }
  },
  async intent(bundle) {
    try {
      const r = await fetch(`${API}/v1/street/pay/intent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: visitorToken(), action: "coins", bundle }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: (j as { message?: string }).message ?? `Error ${r.status}` };
      return { ok: true, data: j as { ref: string; address: string; amount: string; memo: string; uri: string; expires_at: string } };
    } catch {
      return { ok: false, error: "The city's server can't be reached" };
    }
  },
  async status(ref) {
    try {
      const r = await fetch(`${API}/v1/street/pay/${ref}`, { cache: "no-store" });
      return r.ok ? ((await r.json()) as { state: string; coins: number | null; claimed: number | null }) : null;
    } catch {
      return null;
    }
  },
  async claim(ref, key) {
    try {
      const r = await fetch(`${API}/v1/street/pay/${ref}/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: visitorToken(), key }) });
      return r.ok ? ((await r.json()) as { coins: number; paid: boolean }) : null;
    } catch {
      return null;
    }
  },
};

/** The pretend server (dev builds with ?zecmock): an order confirms 6 s after it is asked for. */
function mockApi(): Api {
  const BUNDLES: Bundle[] = [
    { id: "z1000", coins: 1000, zec: "0.01" },
    { id: "z3000", coins: 3000, zec: "0.025" },
    { id: "z8000", coins: 8000, zec: "0.05" },
  ];
  const db = (): Record<string, { coins: number; claimed: number; at: number; key?: string; last?: number }> => JSON.parse(localStorage.getItem("zstreet.zecshop.mock") ?? "{}");
  const save = (d: ReturnType<typeof db>) => localStorage.setItem("zstreet.zecshop.mock", JSON.stringify(d));
  const addr = "u1mockmockmockmockmockmockmockmockmockmockmockmockmockmockmockmockmockmockmockmockmock";
  return {
    info: async () => ({ enabled: true, bundles: BUNDLES }),
    async intent(bundle) {
      const b = BUNDLES.find((x) => x.id === bundle);
      if (!b) return { ok: false, error: "unknown bundle" };
      const ref = Array.from({ length: 8 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[Math.floor(Math.random() * 32)]).join("");
      const d = db();
      d[ref] = { coins: b.coins, claimed: 0, at: Date.now() };
      save(d);
      const memo = `ZS1:${ref}\nZStreet coins`;
      const memo64 = btoa(memo).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      return { ok: true, data: { ref, address: addr, amount: b.zec, memo, uri: `zcash:${addr}?amount=${b.zec}&memo=${memo64}`, expires_at: new Date(Date.now() + 864e5).toISOString() } };
    },
    async status(ref) {
      const o = db()[ref];
      if (!o) return null;
      const age = Date.now() - o.at;
      return { state: age < 3000 ? "waiting" : age < 6000 ? "seen" : "confirmed", coins: age >= 6000 ? o.coins : null, claimed: age >= 6000 ? o.claimed : null };
    },
    async claim(ref, key) {
      const d = db();
      const o = d[ref];
      if (!o) return null;
      if (Date.now() - o.at < 6000) return { coins: 0, paid: false };
      if (o.key === key) return { coins: o.last ?? 0, paid: true };
      const fresh = o.coins - o.claimed;
      if (fresh > 0) Object.assign(o, { claimed: o.coins, key, last: fresh });
      save(d);
      return { coins: fresh, paid: true };
    },
  };
}

const api: Api = import.meta.env.DEV && mockFlag() ? mockApi() : real;

// ---- the orders ------------------------------------------------------------------------------------

const listeners = new Set<() => void>();
function orders(): Order[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Order[];
  } catch {
    return [];
  }
}
function saveOrders(list: Order[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 40)));
  } catch {}
  listeners.forEach((f) => f());
}
function update(ref: string, patch: Partial<Order>) {
  saveOrders(orders().map((o) => (o.ref === ref ? { ...o, ...patch } : o)));
}
/** Still worth asking about: not lapsed, and either not paid in full yet or still able to take a
 *  top-up (a second payment to the same request) until the request expires. */
const open = (o: Order) => o.state !== "expired" && o.state !== "short" && (!(o.state === "confirmed" && o.credited >= o.coins) || Date.now() < Date.parse(o.expires));
const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

let running: Promise<void> | null = null;
let again = false;
/**
 * Ask the API about the orders still open; claim what has been paid and credit it, once.
 * Exactly once: the server hands each ⓩ out to one claim; a claim goes with a key kept in the order
 * until its answer is credited, so an answer lost on the way is asked for again with the same key
 * (same answer, nothing more); and every tab of this browser polls under one lock (Web Locks), so
 * two tabs never credit the same answer.
 */
function poll(): Promise<void> {
  // one run at a time; asked during a run, it runs once more after it (and the caller waits for that)
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        const locks = (navigator as Navigator & { locks?: { request(name: string, f: () => Promise<void>): Promise<void> } }).locks;
        if (locks) await locks.request("zstreet.zecshop", pollNow);
        else await pollNow();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}
async function pollNow() {
  for (const o of orders().filter(open)) {
    const s = await api.status(o.ref);
    if (!s) {
      // unknown to the server a day after it lapsed: stop asking
      if (Date.now() > Date.parse(o.expires) + 864e5) update(o.ref, { state: "expired" });
      continue;
    }
    if (s.state !== o.state || (s.coins !== null && s.coins !== o.coins)) update(o.ref, { state: s.state, coins: s.coins ?? o.coins });
    const pending = orders().find((x) => x.ref === o.ref)?.key;
    if (s.state !== "confirmed" || (!pending && (s.coins ?? 0) <= (s.claimed ?? 0))) continue;
    const key = pending ?? newKey();
    if (!pending) update(o.ref, { key });
    const c = await api.claim(o.ref, key);
    if (!c) continue; // no answer: the same key next time
    const now = orders().find((x) => x.ref === o.ref);
    if (now?.key !== key) continue; // (credited meanwhile)
    if (c.coins > 0) Economy.earn(c.coins, `zec order ${o.ref}`);
    update(o.ref, { credited: now.credited + Math.max(0, c.coins), key: undefined });
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
let fast = false;
/** Watch the open orders: every 5 s while the checkout is on screen, every 20 s otherwise. */
function watch(quick: boolean) {
  fast = quick;
  if (timer) clearInterval(timer);
  timer = null;
  if (!orders().some(open)) return;
  timer = setInterval(() => {
    if (!orders().some(open)) {
      clearInterval(timer!);
      timer = null;
      return;
    }
    void poll();
  }, fast ? 5000 : 20000);
  void poll();
}
if (typeof window !== "undefined") setTimeout(() => watch(false), 3000);

export const ZecShop = {
  /** The bundles on sale, or null when the shop is closed (the API doesn't serve them). */
  async bundles(): Promise<Bundle[] | null> {
    const i = await api.info();
    return i && i.enabled && i.bundles.length ? i.bundles : null;
  },
  /** A checkout for a bundle: the order to pay (kept and watched). */
  async checkout(bundle: Bundle): Promise<{ ok: true; order: Order } | { ok: false; error: string }> {
    const r = await api.intent(bundle.id);
    if (!r.ok) return r;
    const d = r.data;
    const order: Order = { ref: d.ref, bundle: bundle.id, coins: bundle.coins, address: d.address, amount: d.amount, memo: d.memo, uri: d.uri, expires: d.expires_at, state: "waiting", credited: 0, at: Date.now() };
    saveOrders([order, ...orders().filter((o) => o.ref !== order.ref)]);
    watch(true);
    return { ok: true, order };
  },
  orders,
  poll,
  onChange(f: () => void) {
    listeners.add(f);
    return () => listeners.delete(f);
  },
  /** Pay an order with Noir in one click (when connected). */
  async payWithNoir(o: Order): Promise<string | null> {
    const w = getNoirWallet();
    if (!w) return "Noir Wallet isn't installed in this browser.";
    try {
      await w.zcash.sendTransaction({ to: o.address, amount: o.amount, memo: o.memo });
      return null;
    } catch (e) {
      return (e as { code?: number })?.code === 4001 ? "You declined in Noir." : "Noir didn't send the payment.";
    }
  },
};

// ---- the tab ------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n = (v: number) => v.toLocaleString("en-US");
const TAGS = ["", "Popular", "Best value"];

const STATE: Record<string, string> = {
  waiting: "Waiting for your payment",
  seen: "Payment seen · counting it",
  confirmed: "Paid",
  short: "The payment was too small for any ⓩ",
  expired: "This request expired",
};

export const storeTab: StoreTab = {
  key: "getz",
  mount(el: HTMLElement, ctx: StoreTabContext) {
    let gone = false;
    let view: { order: Order } | null = null;
    el.classList.add("zs", "zz");
    const offOrders = ZecShop.onChange(() => !gone && view && render());

    const shelf = async () => {
      view = null;
      watch(false);
      el.innerHTML = `<p class="zs-msg">Opening the shop…</p>`;
      const list = await ZecShop.bundles();
      if (gone) return;
      if (!list) {
        el.innerHTML = `<div class="gf-soon gf-plate"><small>Get ⓩ</small><b>The ZEC shop is closed</b><p>ⓩ for ZEC opens when ZStreet's payment server serves it. Until then ⓩ are earned in the missions.</p></div>`;
        return;
      }
      const usd = await fetch(`${API}/v1/price`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ usd: number }>) : null))
        .then((p) => p?.usd ?? null)
        .catch(() => null);
      if (gone) return;
      const mine = orders().filter((o) => o.credited > 0 || open(o)).slice(0, 4);
      el.innerHTML = `
        <div class="zz-head"><small>Your ⓩ</small><b class="zz-bal">${n(Economy.balance())} ⓩ</b></div>
        <div class="zz-bundles">${list
          .map(
            (b, i) => `<button class="gf-tile zz-bundle" type="button" data-b="${esc(b.id)}">
              ${TAGS[i] ? `<i class="gf-tag gold">${TAGS[i]}</i>` : `<i class="zz-sp"></i>`}
              <span class="zz-coins">${n(b.coins)}<small>ⓩ</small></span>
              <em class="gf-price">${esc(b.zec)} ZEC</em>
              <small class="zz-usd">${usd ? `≈ $${((Number(b.zec) || 0) * usd).toFixed(2)}` : ""}</small>
              <span class="gf-btn gold">Buy</span>
            </button>`,
          )
          .join("")}</div>
        ${mine.length ? `<div class="zz-orders"><small>Your orders</small>${mine.map((o) => `<button type="button" data-o="${esc(o.ref)}"><b>${n(o.coins)} ⓩ</b><span>${esc(o.amount)} ZEC</span><i>${o.credited > 0 ? `+${n(o.credited)} ⓩ credited` : esc(STATE[o.state] ?? o.state)}</i></button>`).join("")}</div>` : ""}`;
      for (const b of el.querySelectorAll<HTMLElement>("[data-b]"))
        b.addEventListener("click", async () => {
          const bundle = list.find((x) => x.id === b.dataset.b)!;
          (b as HTMLButtonElement).disabled = true;
          const r = await ZecShop.checkout(bundle);
          if (gone) return;
          (b as HTMLButtonElement).disabled = false;
          if (!r.ok) return ctx.say(r.error);
          view = { order: r.order };
          void render();
        });
      for (const b of el.querySelectorAll<HTMLElement>("[data-o]"))
        b.addEventListener("click", () => {
          const o = orders().find((x) => x.ref === b.dataset.o);
          if (!o) return;
          view = { order: o };
          watch(true);
          void render();
        });
    };

    const render = async () => {
      if (!view) return;
      const o = orders().find((x) => x.ref === view!.order.ref) ?? view.order;
      view.order = o;
      const done = o.credited > 0 && o.state === "confirmed";
      const noir = !!Wallet.state().address;
      const html = `
        <div class="zz-pay gf-plate">
          <div class="zz-qr"></div>
          <div class="zz-info">
            <small>Pay ${esc(o.amount)} ZEC from any Zcash wallet</small>
            <b>${n(o.coins)} ⓩ</b>
            <label>Amount<code>${esc(o.amount)} ZEC</code></label>
            <label>To<code class="zz-addr">${esc(o.address)}</code><button class="gf-btn" type="button" data-copy="address">Copy</button></label>
            <label>Memo<code>${esc(o.memo)}</code><button class="gf-btn" type="button" data-copy="memo">Copy</button></label>
            <div class="zz-act">
              ${noir && !done ? `<button class="gf-btn gold" type="button" data-noir>Pay with Noir</button>` : ""}
              <a class="gf-btn" href="${esc(o.uri)}">Open in my wallet</a>
              <button class="gf-btn" type="button" data-back>Back</button>
            </div>
            <p class="zz-state ${done ? "ok" : o.state}">${done ? `+${n(o.credited)} ⓩ credited · ${n(Economy.balance())} ⓩ` : esc(STATE[o.state] ?? o.state)}</p>
          </div>
        </div>`;
      el.innerHTML = html;
      const qr = el.querySelector<HTMLElement>(".zz-qr")!;
      const c = document.createElement("canvas");
      await QRCode.toCanvas(c, o.uri, { margin: 1, width: 220, errorCorrectionLevel: "M", color: { dark: "#0d0b08", light: "#f6efe0" } }).catch(() => {});
      qr.append(c);
      qr.dataset.uri = o.uri;
      el.querySelector("[data-back]")!.addEventListener("click", () => void shelf());
      for (const b of el.querySelectorAll<HTMLElement>("[data-copy]"))
        b.addEventListener("click", () => {
          const v = b.dataset.copy === "address" ? o.address : o.memo;
          void navigator.clipboard?.writeText(v).then(() => ctx.say("Copied."));
        });
      el.querySelector("[data-noir]")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget as HTMLButtonElement;
        btn.disabled = true;
        btn.textContent = "Waiting for Noir…";
        const err = await ZecShop.payWithNoir(o);
        if (gone) return;
        if (err) ctx.say(err);
        else ctx.say("Sent. It counts once the block is mined.");
        btn.disabled = false;
        btn.textContent = "Pay with Noir";
      });
    };

    const offEco = Economy.onChange(() => {
      const b = el.querySelector(".zz-bal");
      if (b) b.textContent = `${n(Economy.balance())} ⓩ`;
    });
    void shelf();
    return () => {
      gone = true;
      offOrders();
      offEco();
      watch(false);
      el.classList.remove("zs", "zz");
    };
  },
};
