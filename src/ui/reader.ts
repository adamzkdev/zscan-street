/**
 * The ZIP reader: a book that opens over the library with the proposal's real text, read from
 * github.com/zcash/zips, laid out on pages you turn (arrows, click the page edges, ← →).
 */

export interface Book {
  slug: string;
  number: number | null;
  title: string;
  status: string;
  owners: string[];
  created: string | null;
  url: string;
  color: string;
}

type Block = { kind: "h1" | "h2" | "h3" | "p" | "li" | "code" | "quote"; html: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const SYMBOLS: Record<string, string> = { cdot: "·", times: "×", leq: "≤", geq: "≥", neq: "≠", in: "∈", ldots: "…", cdots: "⋯", rightarrow: "→", leftarrow: "←", sum: "Σ", alpha: "α", beta: "β", lambda: "λ", sigma: "σ", infty: "∞", choose: "choose" };
/** Inline maths ($\mathsf{MAX\_MONEY}$, $k \choose n$) as readable text. */
function tex(m: string) {
  return m
    .replace(/\\[a-zA-Z]+\{/g, "")
    .replace(/\\_/g, "_")
    .replace(/\\([a-zA-Z]+)/g, (_, c: string) => SYMBOLS[c] ?? c)
    .replace(/[{}]/g, "");
}

/** Inline rst / markdown to a little HTML: code, bold, italics; links and citations as text. */
function inline(s: string) {
  let t = esc(s);
  t = t.replace(/:math:`([^`]+)`/g, "<i>$1</i>");
  t = t.replace(/\$([^$]+)\$/g, (_, m: string) => `<i>${tex(m)}</i>`);
  t = t.replace(/``([^`]+)``/g, "<code>$1</code>");
  t = t.replace(/`([^`<]+?)\s*&lt;[^&]*&gt;`__?/g, "$1");
  t = t.replace(/`([^`]+)`_+/g, "$1");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  t = t.replace(/\s*\[#[^\]]+\]_/g, "");
  t = t.replace(/\s*\[\^[^\]]+\]/g, "");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  t = t.replace(/\*([^*\s][^*]*)\*/g, "<i>$1</i>");
  return t;
}

/** A CSV row: comma-separated, fields optionally in double quotes. */
function csv(row: string) {
  return [...row.matchAll(/\s*(?:"((?:[^"]|"")*)"|([^,]*))\s*(?:,|$)/g)].map((m) => (m[1] ?? m[2] ?? "").replace(/""/g, '"').trim()).filter((_, k, a) => k < a.length - 1 || _);
}

/** The body of a ZIP (preamble dropped) as headings, paragraphs, list items and code. */
export function parseZip(src: string): Block[] {
  const lines = src.replace(/\r/g, "").split("\n");
  // skip the preamble: from the "ZIP:" line to the first blank line after it
  let i = lines.findIndex((l) => /^\s*ZIP:/.test(l));
  if (i >= 0) while (i < lines.length && lines[i].trim()) i++;
  else i = 0;
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", html: inline(para.join(" ")) });
    para = [];
  };
  for (; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    const next = lines[i + 1]?.trim() ?? "";
    // rst heading: text underlined with = - ~ ^
    if (t && /^([=\-~^"'`#*+])\1{2,}$/.test(next) && !/^([=\-~^])\1+$/.test(t)) {
      flush();
      out.push({ kind: next[0] === "=" ? "h1" : next[0] === "-" ? "h2" : "h3", html: inline(t) });
      i++;
      continue;
    }
    if (/^([=\-~^])\1{2,}$/.test(t)) continue;
    // markdown heading
    const md = /^(#{1,4})\s+(.*)$/.exec(t);
    if (md) {
      flush();
      out.push({ kind: md[1].length === 1 ? "h1" : md[1].length === 2 ? "h2" : "h3", html: inline(md[2]) });
      continue;
    }
    // code: ``` fences, or an indented block after a line ending in "::"
    if (t.startsWith("```")) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith("```"); i++) code.push(lines[i]);
      out.push({ kind: "code", html: esc(code.join("\n")) });
      continue;
    }
    if (t.endsWith("::") && !t.startsWith("..")) {
      const lead = t.replace(/::$/, ":").trim();
      if (lead && lead !== ":") para.push(lead);
      flush();
      const code: string[] = [];
      let j = i + 1;
      while (j < lines.length && (!lines[j].trim() || /^\s/.test(lines[j]))) code.push(lines[j++]);
      const body = code.join("\n").replace(/^\n+|\s+$/g, "");
      if (body) out.push({ kind: "code", html: esc(body.replace(/^ {2,4}/gm, "")) });
      i = j - 1;
      continue;
    }
    // rst directives: notes and warnings, footnotes, maths keep their text; images, raw html,
    // includes and comments are skipped
    if (/^\.\. /.test(t) || t.startsWith("<") || t.startsWith("![")) {
      flush();
      const head = t;
      const body: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || (!lines[i + 1].trim() && /^\s+\S/.test(lines[i + 2] ?? "")))) body.push(lines[++i].trim());
      const text = body.filter(Boolean).join(" ");
      const adm = /^\.\. (note|warning|important|tip|caution|attention|admonition|hint)::\s*(.*)$/i.exec(head);
      const foot = /^\.\. \[#?([^\]]+)\]\s*(.*)$/.exec(head);
      if (adm) out.push({ kind: "quote", html: `<b>${adm[1][0].toUpperCase()}${adm[1].slice(1).toLowerCase()}.</b> ${inline([adm[2], text].filter(Boolean).join(" "))}` });
      else if (foot) out.push({ kind: "li", html: `<b>[${esc(foot[1])}]</b> ${inline([foot[2], text].filter(Boolean).join(" "))}` });
      else if (/^\.\. math::/.test(head)) out.push({ kind: "code", html: esc(tex(body.join("\n").trim())) });
      else if (/^\.\. csv-table::/.test(head)) {
        // one entry per row: the first column in bold, the others with their header
        const opts = body.filter((x) => x.startsWith(":"));
        const header = csv(opts.find((x) => x.startsWith(":header:"))?.replace(":header:", "") ?? "");
        const rows: string[] = [];
        for (const x of body.filter((y) => y && !y.startsWith(":"))) {
          if (x.startsWith('"') || !rows.length) rows.push(x);
          else rows[rows.length - 1] += ` ${x}`;
        }
        for (const r of rows) {
          const [first, ...rest] = csv(r);
          const parts = rest.map((c, k) => (c ? `${header[k + 1] ? `<i>${esc(header[k + 1])}:</i> ` : ""}${inline(c)}` : "")).filter(Boolean);
          out.push({ kind: "li", html: `<b>${inline(first ?? "")}</b>${parts.length ? ` — ${parts.join(" · ")}` : ""}` });
        }
      }
      continue;
    }
    // tables (rst grid and simple tables, markdown pipes): kept as they are, monospaced
    if (/^\+[-=+]+\+$/.test(t) || /^\|.*\|$/.test(t) || /^=+( +=+)+$/.test(t)) {
      flush();
      const rows: string[] = [l];
      while (i + 1 < lines.length && lines[i + 1].trim() && (/^\s*[+|=]/.test(lines[i + 1]) || /^=+( +=+)+$/.test(t))) rows.push(lines[++i]);
      out.push({ kind: "code", html: esc(rows.join("\n")) });
      continue;
    }
    // list items
    const li = /^\s*(?:[-*+]|\d+[.)]|#\.)\s+(.*)$/.exec(l);
    if (li) {
      flush();
      const item = [li[1]];
      while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s*(?:[-*+]|\d+[.)])\s/.test(lines[i + 1])) item.push(lines[++i].trim());
      out.push({ kind: "li", html: inline(item.join(" ")) });
      continue;
    }
    if (t.startsWith(">")) {
      flush();
      out.push({ kind: "quote", html: inline(t.replace(/^>\s?/, "")) });
      continue;
    }
    if (!t) flush();
    else para.push(t);
  }
  flush();
  return out.filter((b) => b.html.trim());
}

async function fetchZip(slug: string) {
  for (const ext of ["md", "rst"]) {
    try {
      const r = await fetch(`https://raw.githubusercontent.com/zcash/zips/main/zips/${slug}.${ext}`);
      if (r.ok) return await r.text();
    } catch {}
  }
  return null;
}

export class Reader {
  private el: HTMLElement;
  private pages: string[] = [];
  /** Index of the left page of the open spread. */
  private at = 0;
  private book: Book | null = null;
  private turning = false;
  onClose: () => void = () => {};

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "reader hidden";
    root.appendChild(this.el);
    this.el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-r=close]") || t === this.el) return this.close();
      if (t.closest("[data-r=next]") || t.closest(".pg.right")) return this.turn(1);
      if (t.closest("[data-r=prev]") || t.closest(".pg.left")) return this.turn(-1);
    });
    window.addEventListener("keydown", (e) => {
      if (!this.open) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") this.turn(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") this.turn(-1);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    });
  }

  get open() {
    return !!this.book;
  }

  /** One page at a time on narrow screens, a spread of two otherwise. */
  private get per() {
    return window.innerWidth < 760 ? 1 : 2;
  }

  async show(b: Book) {
    this.book = b;
    this.at = 0;
    this.pages = [this.cover(b), `<div class="loadingp">Opening ZIP ${b.number ?? ""}…</div>`];
    this.el.style.setProperty("--c", b.color);
    this.el.classList.remove("hidden");
    this.render();
    const src = await fetchZip(b.slug);
    if (this.book !== b) return;
    const blocks = src ? parseZip(src) : [];
    this.pages = [this.cover(b), ...(blocks.length ? this.paginate(blocks) : [`<p>The text could not be loaded. <a href="${b.url}" target="_blank" rel="noopener">Read it on zips.z.cash ↗</a></p>`]), this.back(b)];
    if (this.pages.length % 2) this.pages.splice(this.pages.length - 1, 0, "");
    this.render();
  }

  close() {
    if (!this.book) return;
    this.book = null;
    this.el.classList.add("hidden");
    this.onClose();
  }

  private cover(b: Book) {
    return `<div class="cover">
      <div class="crest">${b.number != null ? `ZIP<b>${b.number}</b>` : "<b>DRAFT</b>"}</div>
      <h1>${esc(b.title)}</h1>
      <div class="cstatus">${esc(b.status)}</div>
      ${b.owners.length ? `<p class="by">${esc(b.owners.join(" · "))}</p>` : ""}
      ${b.created ? `<p class="by">Created ${esc(b.created)}</p>` : ""}
      <p class="src"><a href="${b.url}" target="_blank" rel="noopener">zips.z.cash ↗</a></p>
    </div>`;
  }

  private back(b: Book) {
    return `<div class="cover end"><p>End of ${b.number != null ? `ZIP ${b.number}` : "this draft"}.</p><p class="src"><a href="${b.url}" target="_blank" rel="noopener">Full text, tables and references on zips.z.cash ↗</a></p><p class="src">github.com/zcash/zips</p></div>`;
  }

  /** Lay the blocks out on pages of the book's size, measuring as it goes. */
  private paginate(blocks: Block[]) {
    const probe = document.createElement("div");
    probe.className = "pg probe";
    this.el.appendChild(probe);
    const body = document.createElement("div");
    body.className = "pbody";
    probe.appendChild(body);
    const pages: string[] = [];
    const html = (b: Block) => (b.kind === "code" ? `<pre>${b.html}</pre>` : b.kind === "li" ? `<p class="li">${b.html}</p>` : b.kind === "quote" ? `<blockquote>${b.html}</blockquote>` : b.kind === "p" ? `<p>${b.html}</p>` : `<${b.kind}>${b.html}</${b.kind}>`);
    const fits = () => body.scrollHeight <= body.clientHeight + 1;
    const push = () => {
      if (body.innerHTML.trim()) pages.push(body.innerHTML);
      body.innerHTML = "";
    };
    for (const b of blocks) {
      body.insertAdjacentHTML("beforeend", html(b));
      if (fits()) continue;
      body.lastElementChild!.remove();
      // a heading never ends a page
      const last = body.lastElementChild;
      const carry = last && /^H[123]$/.test(last.tagName) ? last.outerHTML : "";
      if (carry) last!.remove();
      push();
      body.innerHTML = carry;
      body.insertAdjacentHTML("beforeend", html(b));
      if (fits()) continue;
      // too long for a page on its own: split it by words (code by lines)
      body.lastElementChild!.remove();
      const words = b.kind === "code" ? b.html.split("\n") : b.html.split(/(?<=\s)/);
      const join = b.kind === "code" ? "\n" : "";
      let rest = words;
      while (rest.length) {
        let lo = 1,
          hi = rest.length;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          body.insertAdjacentHTML("beforeend", html({ ...b, html: rest.slice(0, mid).join(join) }));
          const ok = fits();
          body.lastElementChild!.remove();
          if (ok) lo = mid;
          else hi = mid - 1;
        }
        body.insertAdjacentHTML("beforeend", html({ ...b, html: rest.slice(0, lo).join(join) }));
        rest = rest.slice(lo);
        if (rest.length) push();
      }
    }
    push();
    probe.remove();
    return pages;
  }

  private page(i: number, side: "left" | "right") {
    const content = this.pages[i];
    if (content === undefined) return `<div class="pg ${side} blank"></div>`;
    const n = i > 0 && i < this.pages.length - 1 ? `<span class="pno">${i}</span>` : "";
    return `<div class="pg ${side}"><div class="pbody">${content}</div>${n}</div>`;
  }

  private render() {
    const b = this.book;
    if (!b) return;
    const per = this.per;
    const spread = per === 2 ? this.page(this.at, "left") + this.page(this.at + 1, "right") : this.page(this.at, "right");
    const last = this.at + per >= this.pages.length;
    this.el.innerHTML = `
      <div class="tome">
        <div class="spine-top"><span>${b.number != null ? `ZIP ${b.number}` : "DRAFT"}</span><b>${esc(b.title)}</b><button data-r="close" aria-label="Close the book">×</button></div>
        <div class="spread ${per === 1 ? "one" : ""}">${spread}</div>
        <div class="nav"><button data-r="prev" ${this.at === 0 ? "disabled" : ""}>◂</button><span>${Math.min(this.pages.length, this.at + per)} / ${this.pages.length}</span><button data-r="next" ${last ? "disabled" : ""}>▸</button></div>
      </div>`;
  }

  /** Turn a leaf: forward, the right page swings over to the left; back, the reverse. */
  private turn(dir: 1 | -1) {
    const per = this.per;
    const to = this.at + dir * per;
    if (this.turning || to < 0 || to >= this.pages.length) return;
    const spread = this.el.querySelector<HTMLElement>(".spread");
    if (!spread || per === 1) {
      this.at = to;
      return this.render();
    }
    this.turning = true;
    // the leaf: front = the page it lifts, back = the page it lays down
    const front = dir > 0 ? this.at + 1 : this.at;
    const back = dir > 0 ? to : to + 1;
    const leaf = document.createElement("div");
    leaf.className = `leaf ${dir > 0 ? "fwd" : "bwd"}`;
    leaf.innerHTML = `<div class="face front">${this.page(front, dir > 0 ? "right" : "left")}</div><div class="face back">${this.page(back, dir > 0 ? "left" : "right")}</div>`;
    // underneath, the side being uncovered already shows the next spread
    const under = spread.querySelector<HTMLElement>(dir > 0 ? ".pg.right" : ".pg.left");
    if (under) under.outerHTML = this.page(dir > 0 ? to + 1 : to, dir > 0 ? "right" : "left");
    spread.appendChild(leaf);
    leaf.addEventListener(
      "animationend",
      () => {
        this.at = to;
        this.turning = false;
        this.render();
      },
      { once: true },
    );
  }
}
