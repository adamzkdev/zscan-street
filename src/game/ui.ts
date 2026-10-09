
import { pix } from "../ui/hud";

/** What kind of news a message is: its sign and colour in the inbox. */
export type MailKind = "mayor" | "paper" | "power" | "storm" | "quake" | "whale" | "secret" | "event" | "city" | "works" | "chain";
const MAIL: Record<MailKind, { k: string; c: string }> = {
  mayor: { k: "令", c: "#f4b728" },
  paper: { k: "新", c: "#e8e4dc" },
  power: { k: "電", c: "#ff8a3d" },
  storm: { k: "雷", c: "#9fb4ff" },
  quake: { k: "震", c: "#ff4d6a" },
  whale: { k: "鯨", c: "#5fb4ee" },
  secret: { k: "秘", c: "#fff3c4" },
  event: { k: "祭", c: "#ff7aa8" },
  city: { k: "市", c: "#5fd7ff" },
  works: { k: "建", c: "#ffb347" },
  chain: { k: "鎖", c: "#ff9a3c" },
};
interface Mail {
  kind: MailKind;
  title: string;
  text: string;
  at: number;
  /** Only for this visit (not kept across reloads). */
  act?: { label: string; fn: () => void };
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? "now" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
};


/**
 * The game's small HUD pieces, in the street's signage style: the inbox's square button in the
 * bottom-right corner (the city's news wait there, a badge counts the new ones), and a toast under
 * the block toast for game news. No money on screen.
 * Build after the Hud, which rewrites #ui.
 */
export class GameHud {
  readonly root: HTMLElement;
  private toast: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private queue: { html: string; act?: () => void }[] = [];
  private mailBtn: HTMLButtonElement;
  private inbox: HTMLElement;
  /** One mail opened big, over the city. */
  private reader: HTMLElement;
  private reading = -1;
  private mails: Mail[] = [];
  private unread = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    // the inbox: the city's news wait there, nothing pops up over the city
    this.mailBtn = document.createElement("button");
    this.mailBtn.className = "mailbtn hud";
    this.mailBtn.title = "Inbox";
    this.mailBtn.innerHTML = `${pix("mail")}<i></i>`;
    root.append(this.mailBtn);
    this.inbox = document.createElement("div");
    this.inbox.className = "inbox hud";
    root.append(this.inbox);
    this.mailBtn.addEventListener("click", () => {
      const open = !this.inbox.classList.contains("open");
      this.inbox.classList.toggle("open", open);
      if (open) this.renderInbox();
      else (this.read(), this.open(-1));
    });
    this.inbox.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-x]")) return (this.inbox.classList.remove("open"), this.read());
      if (t.closest("[data-clear]")) {
        this.open(-1);
        this.mails = [];
        this.save();
        return this.renderInbox();
      }
      const b = t.closest<HTMLElement>("[data-act]");
      if (b) return this.act(Number(b.dataset.act));
      const li = t.closest<HTMLElement>("[data-open]");
      if (li) this.open(Number(li.dataset.open));
    });
    this.reader = document.createElement("div");
    this.reader.className = "mailread hud";
    root.append(this.reader);
    this.reader.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-x]")) return this.open(-1);
      const b = t.closest<HTMLElement>("[data-act]");
      if (b) return this.act(Number(b.dataset.act));
      const go = t.closest<HTMLElement>("[data-go]");
      if (go) this.open(this.reading + Number(go.dataset.go));
    });
    window.addEventListener("keydown", (e) => {
      if (this.reading < 0 || (e.target as HTMLElement).closest?.("input,textarea")) return;
      if (e.key === "Escape") this.open(-1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.stopPropagation();
        this.open(this.reading + (e.key === "ArrowLeft" ? -1 : 1));
      }
    });
    try {
      const m = JSON.parse(localStorage.getItem("street.inbox") ?? "{}") as { mails?: Mail[]; unread?: number };
      this.mails = (m.mails ?? []).filter((x) => Date.now() - x.at < 3 * 86_400_000);
      this.unread = Math.min(m.unread ?? 0, this.mails.length);
    } catch {}
    this.badge();

    this.toast = document.createElement("div");
    this.toast.className = "gtoast hud hidden";
    root.append(this.toast);
    this.toast.addEventListener("click", () => this.queue[0]?.act?.());
  }

  /** City news for the inbox: a badge, no pop-up. */
  mail(kind: MailKind, title: string, text: string, act?: { label: string; fn: () => void }) {
    this.mails.unshift({ kind, title, text, at: Date.now(), act });
    this.mails.length = Math.min(this.mails.length, 40);
    if (this.reading >= 0) this.reading = Math.min(this.reading + 1, this.mails.length - 1);
    if (this.inbox.classList.contains("open")) return this.renderInbox();
    this.unread++;
    this.badge();
    this.mailBtn.classList.remove("ping");
    void this.mailBtn.offsetWidth;
    this.mailBtn.classList.add("ping");
    this.save();
  }

  /** A mail's action (Go, Vote, Read…): done, the inbox and the reader close. */
  private act(i: number) {
    this.mails[i]?.act?.fn();
    this.inbox.classList.remove("open");
    this.open(-1);
    this.read();
  }

  /** Open mail `i` big (-1 closes the reader). */
  private open(i: number) {
    if (i >= this.mails.length || (i < 0 && i !== -1)) return;
    this.reading = i;
    this.reader.classList.toggle("open", i >= 0);
    const m = this.mails[i];
    if (!m) return;
    const s = MAIL[m.kind] ?? MAIL.city;
    const when = new Date(m.at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
    this.reader.style.setProperty("--c", s.c);
    this.reader.innerHTML = `<header><label>受信箱 · INBOX</label><span><button data-go="-1" title="Newer" ${i === 0 ? "disabled" : ""}>‹</button><em>${i + 1} / ${this.mails.length}</em><button data-go="1" title="Older" ${i === this.mails.length - 1 ? "disabled" : ""}>›</button><button data-x title="Close">×</button></span></header>
      <div class="head"><span class="k">${s.k}</span><div><h3>${esc(m.title)}</h3><time>${when} · ${ago(m.at)}</time></div></div>
      <p>${esc(m.text)}</p>
      ${m.act ? `<button class="go" data-act="${i}">${esc(m.act.label)} ▸</button>` : ""}`;
  }

  private read() {
    this.unread = 0;
    this.badge();
    this.save();
  }

  private badge() {
    this.mailBtn.querySelector("i")!.textContent = this.unread ? String(Math.min(this.unread, 99)) : "";
  }

  private save() {
    try {
      localStorage.setItem("street.inbox", JSON.stringify({ mails: this.mails.map(({ act: _a, ...m }) => m), unread: this.unread }));
    } catch {}
  }

  private renderInbox() {
    this.inbox.innerHTML = `<header><label>受信箱 · INBOX</label><span>${this.mails.length ? `<button data-clear title="Clear">⌫</button>` : ""}<button data-x title="Close">×</button></span></header>
      ${
        this.mails.length
          ? `<ol>${this.mails
              .map((m, i) => {
                const s = MAIL[m.kind] ?? MAIL.city;
                return `<li class="${i < this.unread ? "new" : ""}" style="--c:${s.c}" data-open="${i}"><span class="k">${s.k}</span><b>${esc(m.title)}</b><time>${ago(m.at)}</time><p>${esc(m.text)}</p>${m.act ? `<button data-act="${i}">${esc(m.act.label)} ▸</button>` : ""}</li>`;
              })
              .join("")}</ol>`
          : `<div class="empty">Empty</div>`
      }`;
  }

  /** Game news under the block toast, one at a time; with `act`, clicking it does something. */
  say(html: string, act?: () => void) {
    // never more than three waiting: old news is dropped
    if (this.queue.length > 3) this.queue.splice(1, 1);
    this.queue.push({ html, act });
    if (this.queue.length === 1) this.next();
  }

  private next() {
    const item = this.queue[0];
    if (item === undefined) return;
    this.toast.innerHTML = item.html + (item.act ? ` <u>GO ▸</u>` : "");
    this.toast.classList.toggle("act", !!item.act);
    this.toast.classList.remove("hidden");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.classList.add("hidden");
      setTimeout(() => {
        this.queue.shift();
        this.next();
      }, 400);
    }, 5200);
  }
}
