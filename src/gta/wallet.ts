import { getNoirWallet, verifyMessageSignature, type NoirWalletProvider } from "@noir-wallet/sdk";

/**
 * The front end's wallet (src/gta): connect Noir Wallet the way the city's wallet desk does
 * (ui/paydesk.ts: connect, then sign a one-off message with the unlinkable derived key — the
 * "verified" badge), into the same saved connection (`street.noir`), so the desk in the ZEC Reserve
 * knows you too and pays in one click. Any other Zcash wallet pays the city's ZIP-321 requests by QR,
 * nothing to connect.
 */

const KEY = "street.noir";
const NOIR_STORE = "https://chromewebstore.google.com/detail/noir-wallet/mfoghjbpfanobmnoemoepenjjcmfpmdn";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface WalletState {
  address: string | null;
  label: string | null;
  verified: boolean;
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

async function noir(waitMs = 1500): Promise<NoirWalletProvider | null> {
  const until = Date.now() + waitMs;
  for (;;) {
    const w = getNoirWallet();
    if (w || Date.now() >= until) return w;
    await new Promise((r) => setTimeout(r, 150));
  }
}

function why(e: unknown) {
  const c = (e as { code?: number })?.code;
  if (c === 4001) return "You declined in Noir.";
  return "Noir didn't connect.";
}

/** A sheet over `host` (the front end's): dimmed, the panel, closed by ✕, Esc or a click outside. */
export function openSheet(host: HTMLElement, html: string, onClose: () => void, cls = "") {
  const o = document.createElement("div");
  o.className = `gfw ${cls}`;
  o.innerHTML = `<div class="gfw-panel" role="dialog" aria-label="Wallet"><button class="gfw-x" type="button" aria-label="Close">✕</button>${html}</div>`;
  host.appendChild(o);
  const close = () => {
    window.removeEventListener("keydown", key, true);
    o.remove();
    onClose();
  };
  const key = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
  window.addEventListener("keydown", key, true);
  o.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    if (e.target === o) close();
  });
  o.querySelector(".gfw-x")!.addEventListener("click", close);
  return { el: o, close };
}

export const Wallet = {
  state(): WalletState {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as { address: string; verified: boolean } | null;
      if (s?.address) return { address: s.address, label: short(s.address), verified: !!s.verified };
    } catch {}
    return { address: null, label: null, verified: false };
  },
  onChange(f: () => void) {
    listeners.add(f);
    return () => listeners.delete(f);
  },
  /** The sheet: connect Noir (one click, a signature), or the connected one and Disconnect. */
  open(host: HTMLElement): Promise<WalletState> {
    return new Promise((done) => {
      const st = this.state();
      const s = openSheet(
        host,
        `<h2>Your wallet</h2>
         ${
           st.address
             ? `<div class="gfw-acct"><b>${esc(st.label!)}</b><small>Noir Wallet${st.verified ? " · verified" : ""}</small></div>
                <p class="gfw-note">The wallet desk in the ZEC Reserve pays from it in one click: messages on the ground, the guestbook, sealed votes, tips.</p>
                <div class="gfw-row"><button class="gfw-btn" data-off type="button">Disconnect</button></div>`
             : `<button class="gfw-btn gold wide" data-noir type="button">Connect Noir Wallet</button>
                <p class="gfw-note" data-msg>Noir signs one message with a key that can't be linked to your funds: nothing leaves your wallet. Any other Zcash wallet pays the city's requests by QR code, no connection needed.</p>`
         }`,
        () => done(this.state()),
      );
      s.el.querySelector("[data-off]")?.addEventListener("click", () => {
        void getNoirWallet()
          ?.zcash.disconnect()
          .catch(() => {});
        try {
          localStorage.removeItem(KEY);
        } catch {}
        changed();
        s.close();
      });
      s.el.querySelector("[data-noir]")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget as HTMLButtonElement;
        const msg = s.el.querySelector("[data-msg]") as HTMLElement;
        const w = await noir();
        if (!w) {
          msg.innerHTML = `Noir Wallet isn't installed in this browser. <a href="${NOIR_STORE}" target="_blank" rel="noopener">Get it from the Chrome Web Store</a>, then connect.`;
          msg.classList.add("bad");
          return;
        }
        btn.disabled = true;
        btn.textContent = "Waiting for Noir…";
        try {
          await w.zcash.connect();
          const message = `ZStreet: I walk the city with my own wallet. ${new Date().toISOString().slice(0, 10)} ${Math.random().toString(36).slice(2, 10)}`;
          const sig = await w.zcash.signMessage(message, { signingMode: "derived" });
          const check = verifyMessageSignature({ message, signature: sig.signature, pubkey: sig.pubkey, address: sig.address });
          localStorage.setItem(KEY, JSON.stringify({ address: sig.address, verified: check.valid }));
          changed();
          s.close();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Connect Noir Wallet";
          msg.textContent = why(err);
          msg.classList.add("bad");
        }
      });
    });
  },
};
