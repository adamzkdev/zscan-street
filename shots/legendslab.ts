// The ZK LEGENDS bench for the cards and the menus:
// /shots/legendslab.html?cards[=ids]&w=260[&back] · ?menus[=hub|play|collection|packs|rules][&reset][&packs=5][&gold=500]
import "/src/tables/legends/legends.css";
import "/src/tables/legends/cards";
import { CARDS } from "/src/tables/legends/engine";
import { cardEl, backEl } from "/src/tables/legends/art";
import { LegendsSound } from "/src/tables/legends/sound";
import * as P from "/src/tables/legends/progress";
import { Menus } from "/src/tables/legends/menus";

const q = new URLSearchParams(location.search);
const root = document.getElementById("lab")!;
const w = window as unknown as Record<string, unknown>;
if (q.has("cards")) {
  const wd = Number(q.get("w") ?? 260);
  const want = q.get("cards");
  const ids = want ? want.split(",") : [...CARDS.keys()];
  const grid = document.createElement("div");
  grid.className = "grid zkl-root";
  grid.style.position = "static";
  grid.style.setProperty("--w", `${wd}px`);
  for (const id of ids) grid.appendChild(cardEl(id));
  if (q.has("back")) grid.appendChild(backEl());
  root.appendChild(grid);
} else {
  if (q.has("reset")) P.resetProgress();
  const s = P.load();
  if (q.has("packs")) s.packs = Number(q.get("packs"));
  if (q.has("gold")) s.gold = Number(q.get("gold"));
  const m = new Menus(root, {
    meId: 4071,
    rival: { id: 1337, name: "Nadia", skill: 0.5 },
    stake: 100,
    snd: new LegendsSound(),
    onDuel: (deck, pool, name) => (w.duel = { deck, pool, name }),
    onLeave: () => (w.left = true),
  }, new LegendsSound());
  m.go((q.get("menus") || "hub") as never);
  w.menus = m;
  w.P = P;
}
