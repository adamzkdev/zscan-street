import { T } from "../../i18n/lang";
import { profile } from "../../game/profile";
import { levelOf } from "../../game/progress";
import { fitText } from "../../scene/fit";
import { HOUSE_TABLES, tableArt, tableCard, tableStats } from "../../tables/house";
import { makeCanvas, rrect, zfont } from "./kit";
import { drawMark } from "../../party/theme";
import { personName } from "../../party/people";

/** The Game House's pictures: the BLOCK BARONS board, the zones' standing cards, the leaderboard, the bar's menu. */

const num = (n: number) => Math.round(n).toLocaleString("en-US");

/** The BLOCK BARONS board seen from above: a ring of property tiles in eight colour groups, the corners, the name in the middle. */
export function baronsBoard() {
  const S = 512;
  return makeCanvas(S, S, (g) => {
    g.fillStyle = "#e9e4d8";
    g.fillRect(0, 0, S, S);
    const groups = ["#ff6b35", "#c4b1fc", "#a8d8e8", "#6dbf8a", "#ff5c8a", "#d9bc8a", "#5cc8ff", "#8a7cff"];
    const n = 9;
    const corner = 64;
    const cell = (S - corner * 2) / n;
    for (let side = 0; side < 4; side++)
      for (let i = 0; i < n; i++) {
        g.save();
        g.translate(S / 2, S / 2);
        g.rotate((side * Math.PI) / 2);
        const x = -S / 2 + corner + i * cell,
          y = S / 2 - corner;
        g.fillStyle = "#f4f0e6";
        g.fillRect(x + 1, y + 1, cell - 2, corner - 2);
        if (i % 3 !== 1) {
          g.fillStyle = groups[(side * 2 + Math.floor(i / 5)) % 8];
          g.fillRect(x + 1, y + 1, cell - 2, 16);
        } else {
          // the "?" spaces and the stations: the ⓩ mark
          drawMark(g, x + cell / 2, y + corner / 2, 28, "#16141c", "#ff6b35");
        }
        g.restore();
      }
    // the corners
    const cc = ["#ff6b35", "#16141c", "#c4b1fc", "#16141c"];
    [
      [0, 0],
      [S - corner, 0],
      [S - corner, S - corner],
      [0, S - corner],
    ].forEach(([x, y], i) => {
      g.fillStyle = cc[i];
      g.fillRect(x + 2, y + 2, corner - 4, corner - 4);
    });
    // the middle: the name and two card piles
    g.fillStyle = "#16141c";
    g.fillRect(corner + 6, corner + 6, S - corner * 2 - 12, S - corner * 2 - 12);
    g.textAlign = "center";
    g.fillStyle = "#ff6b35";
    g.font = '900 54px Geist, "Arial Black", sans-serif';
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(-Math.PI / 4);
    g.fillText("BLOCK", 0, -6);
    g.fillStyle = "#e9e4d8";
    g.fillText("BARONS", 0, 46);
    g.restore();
    for (const [x, y, c] of [
      [S * 0.32, S * 0.68, "#c4b1fc"],
      [S * 0.68, S * 0.32, "#a8d8e8"],
    ] as const) {
      g.save();
      g.translate(x, y);
      g.rotate(-Math.PI / 4);
      g.fillStyle = c;
      rrect(g, -30, -20, 60, 40, 5);
      g.fill();
      g.restore();
    }
    g.strokeStyle = "#16141c";
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, S - 3, S - 3);
  });
}

/**
 * A zone's standing card: the game's picture, its name, its line, and either how many play and how
 * long (open) or COMING SOON (its game is not in the house yet).
 */
export function zoneCard(key: string) {
  const W = 512,
    H = 768;
  const k = tableCard(key);
  const h = HOUSE_TABLES.find((x) => x.key === key);
  return makeCanvas(W, H, (g) => {
    g.fillStyle = "#0e0d12";
    g.fillRect(0, 0, W, H);
    g.drawImage(tableArt(key, k.color, W, 300), 0, 0);
    const grd = g.createLinearGradient(0, 220, 0, 320);
    grd.addColorStop(0, "rgba(14,13,18,0)");
    grd.addColorStop(1, "#0e0d12");
    g.fillStyle = grd;
    g.fillRect(0, 220, W, 100);
    g.textAlign = "center";
    g.fillStyle = "#fff";
    g.shadowColor = k.color;
    g.shadowBlur = 18;
    g.font = zfont('900 64px Geist, "Arial Black", sans-serif');
    fitText(g, k.title, W / 2, 380, W - 40);
    g.shadowBlur = 0;
    g.fillStyle = "rgba(242,238,230,0.75)";
    g.font = zfont("500 28px Geist, sans-serif");
    // the line, on two lines if it must
    const words = k.tag.split(" ");
    let line = "",
      y = 432;
    for (const w of words) {
      if (g.measureText(`${line}${w} `).width > W - 60 && line) {
        g.fillText(line.trim(), W / 2, y);
        line = "";
        y += 36;
      }
      line += `${w} `;
    }
    if (k.tag && !k.tag.includes(" ")) fitText(g, k.tag, W / 2, y, W - 60);
    else g.fillText(line.trim(), W / 2, y);
    if (k.ready) {
      g.fillStyle = k.color;
      rrect(g, 70, 560, W - 140, 86, 18);
      g.fill();
      g.fillStyle = "#0e0e0e";
      g.font = zfont('800 44px Geist, sans-serif');
      fitText(g, T("▶ PLAY", "▶ 开玩"), W / 2, 618, W - 180);
      g.fillStyle = "rgba(242,238,230,0.7)";
      g.font = zfont('600 26px "JetBrains Mono", monospace');
      fitText(g, T(`${k.seats} players · ~${k.minutes} min · ⓩ or free`, `${k.seats} 人 · 约 ${k.minutes} 分钟 · ⓩ 或免费`), W / 2, 700, W - 60);
    } else {
      g.save();
      g.translate(W / 2, 600);
      g.rotate(-0.06);
      g.fillStyle = k.color;
      g.fillRect(-W / 2 - 20, -44, W + 40, 88);
      g.fillStyle = "#0e0e0e";
      g.font = zfont('900 50px "JetBrains Mono", monospace');
      fitText(g, T("COMING SOON", "即将开放"), 0, 18, W - 40);
      g.restore();
      g.fillStyle = "rgba(242,238,230,0.55)";
      g.font = zfont('600 24px "JetBrains Mono", monospace');
      fitText(g, T(`${h?.seats ?? "2–8"} players · the dealers are shuffling`, `${h?.seats ?? "2–8"} 人 · 荷官正在洗牌`), W / 2, 708, W - 60);
    }
    g.strokeStyle = k.color;
    g.lineWidth = 8;
    g.strokeRect(4, 4, W - 8, H - 8);
  });
}

/** The regulars on the house's board, zkSNARKs by their ZStreet names (their chips move a little with the day, the city's own fiction). */
const REGULARS: [number, number][] = [
  [1337, 48200],
  [77, 31650],
  [9001, 22400],
  [2718, 15800],
  [3141, 9300],
  [604, 4100],
  [8128, 1650],
  [4242, 420],
];

/** The house leaderboard: you (level, chips, the party's counters, the tables' records) and where you stand among the regulars. */
export function drawLeaderboard(g: CanvasRenderingContext2D, W: number, H: number) {
  const p = profile.p;
  const lv = levelOf(p.xp);
  const ps = p.party;
  const ts = tableStats();
  const tables = Object.values(ts).reduce((a, r) => ({ played: a.played + r.played, wins: a.wins + r.wins, best: Math.max(a.best, r.best) }), { played: 0, wins: 0, best: 0 });
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, "#151220");
  grd.addColorStop(1, "#0a090e");
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "#c4b1fc";
  g.lineWidth = 6;
  g.strokeRect(5, 5, W - 10, H - 10);
  g.textAlign = "left";
  g.fillStyle = "#c4b1fc";
  g.font = zfont('800 46px Geist, "JetBrains Mono", sans-serif');
  fitText(g, T("HOUSE LEADERBOARD", "游戏屋排行榜"), 28, 64, W * 0.6);
  g.textAlign = "right";
  g.fillStyle = "rgba(242,238,230,0.5)";
  g.font = zfont('600 22px "JetBrains Mono", monospace');
  fitText(g, T("ⓩ play chips · this browser", "ⓩ 游戏筹码 · 本浏览器"), W - 28, 60, W * 0.38);
  // you: level, chips, counters
  const col = W * 0.47;
  g.textAlign = "left";
  g.fillStyle = "#ff6b35";
  g.font = zfont('800 30px Geist, sans-serif');
  fitText(g, T(`YOU · LEVEL ${lv.level}`, `你 · ${lv.level} 级`), 28, 118, col - 40);
  g.fillStyle = "rgba(255,255,255,0.1)";
  rrect(g, 28, 132, col - 56, 14, 7);
  g.fill();
  g.fillStyle = "#ff6b35";
  rrect(g, 28, 132, Math.max(14, (col - 56) * lv.k), 14, 7);
  g.fill();
  const rows: [string, string][] = [
    [T("Chips", "筹码"), `ⓩ ${num(p.z)}`],
    [T("Parties won", "派对胜场"), num(ps.wins)],
    [T("Mini-games won", "小游戏胜场"), num(ps.miniWins)],
    [T("Mini-games won for ⓩ", "押注小游戏胜场"), num(ps.quickWins)],
    [T("Best payout", "最高奖金"), `ⓩ ${num(Math.max(ps.best, tables.best))}`],
    [T("Table games won", "牌桌胜场"), `${num(tables.wins)} / ${num(tables.played)}`],
    [T("Day streak", "连续天数"), num(p.streak)],
  ];
  rows.forEach(([k, v], i) => {
    const y = 192 + i * 44;
    g.fillStyle = "rgba(242,238,230,0.65)";
    g.font = zfont("500 26px Geist, sans-serif");
    g.textAlign = "left";
    fitText(g, k, 28, y, col * 0.6);
    g.fillStyle = "#fff";
    g.font = zfont('700 28px "JetBrains Mono", monospace');
    g.textAlign = "right";
    fitText(g, v, col - 28, y, col * 0.4);
  });
  // the regulars, you among them by chips
  const day = Math.floor(Date.now() / 864e5);
  const list = REGULARS.map(([id, z], i) => ({ name: personName(id), z: Math.round(z * (1 + Math.sin(day * 0.7 + i * 1.9) * 0.08)), you: false }));
  list.push({ name: T("You", "你"), z: p.z, you: true });
  list.sort((a, b) => b.z - a.z);
  g.fillStyle = "#a8d8e8";
  g.font = zfont('800 30px Geist, sans-serif');
  g.textAlign = "left";
  fitText(g, T("THE REGULARS", "常客榜"), col + 10, 118, W - col - 40);
  list.slice(0, 9).forEach((r, i) => {
    const y = 168 + i * 40;
    if (r.you) {
      g.fillStyle = "rgba(255,107,53,0.2)";
      g.fillRect(col, y - 28, W - col - 22, 38);
    }
    g.fillStyle = i === 0 ? "#ff6b35" : "rgba(242,238,230,0.5)";
    g.font = zfont('700 24px "JetBrains Mono", monospace');
    g.textAlign = "left";
    g.fillText(`${i + 1}`.padStart(2, " "), col + 10, y);
    g.fillStyle = r.you ? "#ff6b35" : "#f2eee6";
    g.font = zfont(`${r.you ? 800 : 600} 25px Geist, sans-serif`);
    fitText(g, r.name, col + 56, y, W - col - 250);
    g.textAlign = "right";
    g.fillStyle = r.you ? "#ff6b35" : "#fff";
    g.font = zfont('700 25px "JetBrains Mono", monospace');
    fitText(g, `ⓩ ${num(r.z)}`, W - 34, y, 190);
  });
  if (!list.slice(0, 9).some((r) => r.you)) {
    const at = list.findIndex((r) => r.you);
    g.fillStyle = "#ff6b35";
    g.font = zfont('700 22px "JetBrains Mono", monospace');
    g.textAlign = "right";
    fitText(g, T(`you: #${at + 1} · ⓩ ${num(p.z)}`, `你：第 ${at + 1} 名 · ⓩ ${num(p.z)}`), W - 34, 168 + 9 * 40, W - col - 40);
  }
}

/** The bar's menu: the house cocktails (the city's own). */
export function barMenu() {
  const W = 512,
    H = 640;
  const drinks: [string, string, string][] = [
    ["Zero-Knowledge Sour", "零知识酸酒", "ⓩ 12"],
    ["Orchard Spritz", "果园气泡酒", "ⓩ 10"],
    ["Sprout Old Fashioned", "萌芽古典", "ⓩ 14"],
    ["Shielded Negroni", "屏蔽尼格罗尼", "ⓩ 13"],
    ["Equihash Mule", "Equihash 骡子", "ⓩ 11"],
    ["NU7 Martini", "NU7 马天尼", "ⓩ 15"],
    ["Halo Gin", "Halo 金酒", "ⓩ 9"],
    ["Lucky Nonce (alcohol-free)", "幸运随机数（无酒精）", "ⓩ 6"],
  ];
  return makeCanvas(W, H, (g) => {
    g.fillStyle = "#121016";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#ff6b35";
    g.lineWidth = 5;
    g.strokeRect(8, 8, W - 16, H - 16);
    g.textAlign = "center";
    g.fillStyle = "#ff6b35";
    g.font = zfont('800 44px Geist, sans-serif');
    fitText(g, T("THE LUCKY NONCE", "幸运随机数酒吧"), W / 2, 72, W - 60);
    g.fillStyle = "rgba(242,238,230,0.55)";
    g.font = zfont('600 22px "JetBrains Mono", monospace');
    fitText(g, T("house cocktails · priced in ⓩ, poured free", "招牌鸡尾酒 · 标价 ⓩ，免费畅饮"), W / 2, 108, W - 60);
    drinks.forEach(([en, zh, price], i) => {
      const y = 170 + i * 56;
      g.textAlign = "left";
      g.fillStyle = "#f2eee6";
      g.font = zfont("600 28px Geist, sans-serif");
      fitText(g, T(en, zh), 36, y, W - 160);
      g.textAlign = "right";
      g.fillStyle = "#c4b1fc";
      g.font = zfont('700 26px "JetBrains Mono", monospace');
      g.fillText(price, W - 36, y);
      g.fillStyle = "rgba(242,238,230,0.12)";
      g.fillRect(36, y + 16, W - 72, 2);
    });
  });
}
