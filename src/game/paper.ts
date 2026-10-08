import { get } from "../data/zscan";

interface Paper {
  day: string;
  headline: string;
  subhead: string;
  stories: { title: string; body: string }[];
  weather?: string;
  stats?: Record<string, number | string | null>;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The ZStreet Daily: each morning (06:00 UTC) the API writes the city's paper from yesterday's
 * chain and the Zcash news. Opened from the newsstand, the library, or the morning toast.
 */
export class PaperView {
  paper: Paper | null = null;
  private el: HTMLElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "paper";
    root.append(this.el);
    this.el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-x]") || e.target === this.el) this.close();
    });
    document.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-paper]")) void this.open();
    });
    window.addEventListener("keydown", (e) => e.key === "Escape" && this.close());
  }

  async load() {
    this.paper = await get<Paper>("/v1/street/paper");
    return this.paper;
  }

  async open() {
    if (!this.paper) await this.load();
    const p = this.paper;
    const day = p ? new Date(`${p.day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
    this.el.innerHTML = `<article>
      <button data-x title="Close">×</button>
      <header><small>${esc(day)}</small><h1>THE ZSTREET DAILY</h1><small>街の新聞 · every block fit to print</small></header>
      ${
        p
          ? `<h2>${esc(p.headline)}</h2><p class="sub">${esc(p.subhead)}</p>
             <div class="cols">${p.stories.map((s) => `<section><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></section>`).join("")}</div>
             ${p.weather ? `<footer><b>WEATHER</b> ${esc(p.weather)}</footer>` : ""}`
          : `<h2>The presses are warming up</h2><p class="sub">The first edition comes out at 06:00 UTC.</p>`
      }
    </article>`;
    this.el.classList.add("open");
  }

  close() {
    this.el.classList.remove("open");
  }
}
