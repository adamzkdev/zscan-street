import { ZScan } from "../data/zscan";
import { get } from "../data/zscan";

/**
 * The ZK TOWER's mini-games, played on an arcade screen over the room:
 * ZEC SNAKE — eat the gold coins, keep clear of the walls and of the red transparent leaks.
 * MEMORY — find the pairs among real zkSNARK portraits.
 * ZIP QUIZ — ten questions drawn from the real Zcash Improvement Proposals.
 * Best scores stay in this browser.
 */

export type Game = "snake" | "memory" | "quiz";

const TITLES: Record<Game, { name: string; jp: string; color: string; help: string }> = {
  snake: { name: "ZEC SNAKE", jp: "ヘビ", color: "#3ee08f", help: "Arrows / WASD / ZQSD · eat ⓩ coins · red leaks and walls end the run" },
  memory: { name: "zkSNARK MEMORY", jp: "神経衰弱", color: "#b07bff", help: "Click two cards · find all eight pairs in as few moves as you can" },
  quiz: { name: "ZIP QUIZ", jp: "クイズ", color: "#f4b728", help: "Ten questions from the real ZIPs · 1–4 or click an answer" },
};

const best = (g: Game) => {
  try {
    return Number(localStorage.getItem(`street.best.${g}`) ?? 0);
  } catch {
    return 0;
  }
};
const saveBest = (g: Game, v: number, lowerIsBetter = false) => {
  const b = best(g);
  if (b && (lowerIsBetter ? v >= b : v <= b)) return false;
  try {
    localStorage.setItem(`street.best.${g}`, String(v));
  } catch {}
  return true;
};

interface Zip {
  number: number | null;
  title: string;
  status: string;
}

export class Arcade {
  private el: HTMLElement;
  private game: Game | null = null;
  private stop: (() => void) | null = null;
  onClose: () => void = () => {};

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "arcade hidden";
    root.appendChild(this.el);
    this.el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-a=close]") || t === this.el) this.close();
      else if (t.closest("[data-a=again]") && this.game) this.start(this.game);
    });
  }

  get open() {
    return !!this.game;
  }

  show(g: Game) {
    this.el.classList.remove("hidden");
    this.start(g);
  }

  close() {
    if (!this.game) return;
    this.stop?.();
    this.stop = null;
    this.game = null;
    this.el.classList.add("hidden");
    this.onClose();
  }

  private start(g: Game) {
    this.stop?.();
    this.game = g;
    const t = TITLES[g];
    this.el.style.setProperty("--c", t.color);
    this.el.innerHTML = `
      <div class="cab">
        <div class="cabtop"><b>${t.name}</b><i>${t.jp}</i><span class="score" data-a="score"></span><button data-a="close" aria-label="Close">×</button></div>
        <div class="screen"></div>
        <div class="cabfoot"><span>${t.help}</span><span class="best">BEST ${best(g) || "—"}</span></div>
      </div>`;
    const screen = this.el.querySelector<HTMLElement>(".screen")!;
    const score = (s: string) => (this.el.querySelector<HTMLElement>("[data-a=score]")!.textContent = s);
    this.stop = g === "snake" ? snake(screen, score, (n) => this.over(g, n, `${n} ⓩ`)) : g === "memory" ? memory(screen, score, (n) => this.over(g, n, `${n} moves`, true)) : quiz(screen, score, (n) => this.over(g, n, `${n} / 10`));
  }

  private over(g: Game, n: number, label: string, lowerIsBetter = false) {
    const record = n > 0 && saveBest(g, n, lowerIsBetter);
    const screen = this.el.querySelector<HTMLElement>(".screen");
    if (!screen) return;
    screen.insertAdjacentHTML("beforeend", `<div class="over"><b>${g === "memory" ? "CLEARED" : "GAME OVER"}</b><span>${label}${record ? " · NEW BEST" : ""}</span><button data-a="again">PLAY AGAIN</button></div>`);
    this.el.querySelector<HTMLElement>(".best")!.textContent = `BEST ${best(g) || "—"}`;
  }
}

// ---- ZEC SNAKE ---------------------------------------------------------------------------------

function snake(host: HTMLElement, score: (s: string) => void, over: (n: number) => void) {
  const N = 20,
    S = 22;
  const c = document.createElement("canvas");
  c.width = c.height = N * S;
  host.appendChild(c);
  const g = c.getContext("2d")!;
  let body = [
    [10, 10],
    [9, 10],
    [8, 10],
  ];
  let dir = [1, 0],
    next = [1, 0];
  let coin = [15, 10];
  let leaks: number[][] = [];
  let eaten = 0,
    alive = true,
    started = false;
  const free = () => {
    for (;;) {
      const p = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)];
      if (![...body, ...leaks, coin].some((q) => q[0] === p[0] && q[1] === p[1])) return p;
    }
  };
  const key = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    const d = k === "arrowup" || k === "w" || k === "z" ? [0, -1] : k === "arrowdown" || k === "s" ? [0, 1] : k === "arrowleft" || k === "a" || k === "q" ? [-1, 0] : k === "arrowright" || k === "d" ? [1, 0] : null;
    if (!d) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (d[0] !== -dir[0] || d[1] !== -dir[1]) next = d;
    started = true;
  };
  window.addEventListener("keydown", key, true);
  const draw = () => {
    g.fillStyle = "#06120c";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "rgba(62,224,143,0.06)";
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if ((i + j) % 2) g.fillRect(i * S, j * S, S, S);
    // the coin
    g.fillStyle = "#f4b728";
    g.beginPath();
    g.arc(coin[0] * S + S / 2, coin[1] * S + S / 2, S * 0.42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#14120f";
    g.font = `800 ${S * 0.6}px "JetBrains Mono", monospace`;
    g.textAlign = "center";
    g.fillText("Z", coin[0] * S + S / 2, coin[1] * S + S * 0.72);
    // leaks
    for (const l of leaks) {
      g.fillStyle = "#f06b76";
      g.fillRect(l[0] * S + 3, l[1] * S + 3, S - 6, S - 6);
    }
    // the snake: shielded green, a brighter head
    body.forEach((p, i) => {
      g.fillStyle = i ? "#2fbf7c" : "#7dffbe";
      g.fillRect(p[0] * S + 1, p[1] * S + 1, S - 2, S - 2);
    });
  };
  let last = 0,
    raf = 0;
  const tick = (t: number) => {
    raf = requestAnimationFrame(tick);
    const every = Math.max(65, 150 - eaten * 4);
    if (!alive || !started || t - last < every) return;
    last = t;
    dir = next;
    const head = [body[0][0] + dir[0], body[0][1] + dir[1]];
    const hit = (q: number[]) => q[0] === head[0] && q[1] === head[1];
    if (head[0] < 0 || head[1] < 0 || head[0] >= N || head[1] >= N || body.some(hit) || leaks.some(hit)) {
      alive = false;
      draw();
      return over(eaten);
    }
    body.unshift(head);
    if (hit(coin)) {
      eaten++;
      coin = free();
      // every third coin, a transparent leak appears somewhere
      if (eaten % 3 === 0) leaks.push(free());
    } else body.pop();
    score(`${eaten} ⓩ`);
    draw();
  };
  score("0 ⓩ");
  draw();
  // waits for the first arrow
  g.fillStyle = "rgba(5,4,9,0.6)";
  g.fillRect(0, c.height / 2 - 30, c.width, 60);
  g.fillStyle = "#7dffbe";
  g.font = '700 22px "JetBrains Mono", monospace';
  g.textAlign = "center";
  g.fillText("PRESS AN ARROW TO START", c.width / 2, c.height / 2 + 8);
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", key, true);
    leaks = [];
  };
}

// ---- zkSNARK MEMORY ------------------------------------------------------------------------------

function memory(host: HTMLElement, score: (s: string) => void, over: (n: number) => void) {
  const ids = new Set<number>();
  while (ids.size < 8) ids.add(1 + Math.floor(Math.random() * 10000));
  const deck = [...ids, ...ids].sort(() => Math.random() - 0.5);
  const grid = document.createElement("div");
  grid.className = "memgrid";
  grid.innerHTML = deck.map((id, i) => `<button class="card" data-i="${i}"><span class="back">ZK</span><img class="front" src="${ZScan.zkSnarkImage(id)}" alt="" /></button>`).join("");
  host.appendChild(grid);
  let moves = 0,
    found = 0,
    first: HTMLElement | null = null,
    busy = false;
  score("0 moves");
  const click = (e: MouseEvent) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>(".card");
    if (!card || busy || card.classList.contains("up")) return;
    card.classList.add("up");
    if (!first) return void (first = card);
    moves++;
    score(`${moves} moves`);
    const a = first,
      b = card;
    first = null;
    if (deck[+a.dataset.i!] === deck[+b.dataset.i!]) {
      a.classList.add("done");
      b.classList.add("done");
      if (++found === 8) setTimeout(() => over(moves), 400);
    } else {
      busy = true;
      setTimeout(() => {
        a.classList.remove("up");
        b.classList.remove("up");
        busy = false;
      }, 800);
    }
  };
  grid.addEventListener("click", click);
  return () => grid.removeEventListener("click", click);
}

// ---- ZIP QUIZ ------------------------------------------------------------------------------------

function quiz(host: HTMLElement, score: (s: string) => void, over: (n: number) => void) {
  let alive = true;
  const box = document.createElement("div");
  box.className = "quiz";
  box.innerHTML = `<p class="q">Loading the ZIPs…</p>`;
  host.appendChild(box);
  let onKey: ((e: KeyboardEvent) => void) | null = null;
  void (async () => {
    let zips = (await get<Zip[]>("/v1/zips")) ?? [];
    if (!zips.length) zips = await fetch(`${import.meta.env.BASE_URL}zips.json`).then((r) => (r.ok ? r.json() : []), () => []);
    const pool = zips.filter((z) => z.number != null && z.status !== "Reserved" && z.title.length < 90);
    if (!alive || pool.length < 8) return void (box.innerHTML = `<p class="q">The ZIPs could not be loaded.</p>`);
    let right = 0;
    for (let n = 0; n < 10 && alive; n++) {
      const pick = [...pool].sort(() => Math.random() - 0.5).slice(0, 4);
      const answer = pick[0];
      const opts = [...pick].sort(() => Math.random() - 0.5);
      // half the questions ask for the number, half for the title
      const byNumber = Math.random() < 0.5;
      box.innerHTML = `<p class="qn">QUESTION ${n + 1} / 10</p><p class="q">${byNumber ? `Which ZIP is “${answer.title}”?` : `What is ZIP ${answer.number} about?`}</p><div class="opts">${opts
        .map((o, i) => `<button data-o="${i}"><b>${i + 1}</b>${byNumber ? `ZIP ${o.number}` : o.title}</button>`)
        .join("")}</div>`;
      const chosen = await new Promise<number>((res) => {
        box.onclick = (e) => {
          const b = (e.target as HTMLElement).closest<HTMLElement>("[data-o]");
          if (b) res(+b.dataset.o!);
        };
        onKey = (e) => {
          const k = Number(e.key);
          if (k >= 1 && k <= 4) {
            e.stopImmediatePropagation();
            res(k - 1);
          }
        };
        window.addEventListener("keydown", onKey, true);
      });
      window.removeEventListener("keydown", onKey!, true);
      const ok = opts[chosen] === answer;
      if (ok) right++;
      score(`${right} / ${n + 1}`);
      box.querySelectorAll<HTMLElement>("[data-o]").forEach((b, i) => b.classList.add(opts[i] === answer ? "right" : i === chosen ? "wrong" : "dim"));
      await new Promise((r) => setTimeout(r, 1100));
    }
    if (alive) over(right);
  })();
  score("0 / 0");
  return () => {
    alive = false;
    if (onKey) window.removeEventListener("keydown", onKey, true);
  };
}
