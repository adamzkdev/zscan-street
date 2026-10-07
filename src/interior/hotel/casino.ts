import * as THREE from "three";
import { Market } from "../../data/market";
import { fitText } from "../../scene/fit";
import { hash } from "../../scene/voxel/model";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import * as H from "./furniture";
import type { PickInfo } from "../types";
import { HotelKit, LEVELS, carpet, makeCanvas, num, reward, usd } from "./kit";

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
/** European wheel order. */
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const SYMBOLS = ["ⓩ", "7", "🛡", "◆", "★", "🍒"];


/** 2 — the casino: roulette, blackjack, baccarat and poker under crystal chandeliers, forty-two slot
 *  machines with their ZEC jackpot counters, the cage, the Lotus bar. */
export function casino(k: HotelKit) {
  const f = 1,
    g = k.groups[f],
    y = LEVELS[f].y,
    h = LEVELS[f].h;
  k.shell(f, new THREE.MeshStandardMaterial({ map: carpet("#4a0e1a", "#b8862a", 18, 13), roughness: 0.95 }), std("#120c10", 0.9), { panels: "none", wallMat: std("#2a1418", 0.7) });
  k.lifts(f);
  // a coffered ceiling with gold trims and warm coves
  for (let x = -12; x <= 12; x += 4) box(g, 0.25, 0.35, 22, std("#2a1a14", 0.6), x, y + h - 0.35, -11);
  for (let z = -20; z <= -2; z += 3.6) box(g, 30, 0.35, 0.25, std("#2a1a14", 0.6), 0, y + h - 0.35, z);
  for (let x = -12; x <= 12; x += 4) box(g, 0.04, 0.04, 22, k.gold, x, y + h - 0.37, -11);
  for (const [w, d, x, z] of [[29.6, 0.08, 0, -21.6], [29.6, 0.08, 0, -0.4], [0.08, 21.6, 14.6, -11]] as const) box(g, w, 0.06, d, glowMat("#ffb860", 1.2), x, y + h - 0.6, z);
  // the cityside glass is curtained in gold at the corners
  for (const [x, z, r] of [[14.7, -1.2, -Math.PI / 2], [14.7, -20.8, -Math.PI / 2], [-13, -21.7, 0], [13, -21.7, 0]] as [number, number, number][]) k.put(f, "curtainGold", () => F.curtain("#8a1a2a", h - 0.2), x, z, r, { solid: false });

  // the entrance portal from the lifts: a gold arch with the name
  const portal = std("#2a1418", 0.5);
  box(g, 0.6, h, 0.6, k.gold, -11, y, -14.6);
  box(g, 0.6, h, 0.6, k.gold, -11, y, -7.4);
  box(g, 0.5, 1.0, 7.8, portal, -11, y + h - 1.0, -11);
  k.label(f, "CASINO · SHIELDED", -10.72, h - 0.5, -11, { h: 0.5, color: "#f4b728", rot: Math.PI / 2 });
  k.label(f, "CASINO · SHIELDED", -11.28, h - 0.5, -11, { h: 0.5, color: "#f4b728", rot: -Math.PI / 2 });
  for (const z of [-14.6, -7.4]) k.rects[f].push([-11.3, z - 0.3, -10.7, z + 0.3]);
  for (const z of [-13.4, -8.6]) {
    for (const dx of [-0.8, 0.8]) {
      box(g, 0.08, 0.95, 0.08, k.gold, -11 + dx, y, z);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), k.gold);
      top.position.set(-11 + dx, y + 1.0, z);
      g.add(top);
    }
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), std("#8a1a2a", 0.8));
    rope.rotation.z = Math.PI / 2;
    rope.position.set(-11, y + 0.82, z);
    g.add(rope);
    k.rects[f].push([-11.9, z - 0.1, -10.1, z + 0.1]);
  }
  void k.person(f, 8001, [-10.2, -12.6], "Concierge", { face: new THREE.Vector3(-1, 0, 0) });

  // the cage, north-west: a counter behind brass bars, the cashier
  box(g, 5.2, 1.1, 0.7, std("#3a2418", 0.6), -12.2, y, -18.4);
  box(g, 5.3, 0.06, 0.8, k.gold, -12.2, y + 1.1, -18.4);
  for (let x = -14.6; x <= -9.8; x += 0.2) box(g, 0.025, 1.4, 0.025, k.gold, x, y + 1.16, -18.6);
  box(g, 5.2, 0.1, 0.1, k.gold, -12.2, y + 2.55, -18.6);
  box(g, 0.2, h, 3.6, std("#2a1418", 0.6), -9.6, y, -20.2);
  k.rects[f].push([-15, -18.8, -9.5, -18.0], [-9.7, -22, -9.5, -18.4]);
  k.label(f, "CAGE · CASHIER", -12.2, 3.0, -18.55, { h: 0.3, color: "#f4b728" });
  void k.person(f, 8002, [-12.6, -19.4], "Dealer");
  k.hit(f, 5.2, 1.4, 0.8, -12.2, 0, -18.4, "<b>Cage</b><span>ZEC chips</span>", () => {
    const pr = Market.state.price;
    return { eyebrow: "Cage · cashier", title: pr ? `1 ZEC = ${usd(pr.usd)}` : "1 ZEC = …", stats: pr ? [["100 ZEC", usd(pr.usd * 100)], ["24h", `${pr.usd_24h_change >= 0 ? "+" : ""}${pr.usd_24h_change.toFixed(2)}%`], ["Block reward", `${reward()} ZEC`], ["Block", k.height ? num(k.height) : "…"]] : undefined };
  });

  // ---- the tables ----
  // roulette ×2, the wheels turning; a spin lands on the last block's height mod 37
  const layoutT = makeCanvas(512, 192, (gc) => {
    gc.fillStyle = "#1f6a3a";
    gc.fillRect(0, 0, 512, 192);
    gc.strokeStyle = "#f2eee6";
    gc.lineWidth = 2;
    gc.font = '700 22px "JetBrains Mono", monospace';
    gc.textAlign = "center";
    gc.fillStyle = "#3a9a52";
    gc.fillRect(4, 8, 36, 132);
    gc.strokeRect(4, 8, 36, 132);
    gc.fillStyle = "#f2eee6";
    gc.fillText("0", 22, 82);
    for (let c = 0; c < 12; c++)
      for (let r = 0; r < 3; r++) {
        const n = c * 3 + 3 - r;
        const x = 40 + c * 38,
          yy = 8 + r * 44;
        gc.fillStyle = RED.has(n) ? "#b0202a" : "#141414";
        gc.fillRect(x + 3, yy + 3, 32, 38);
        gc.strokeRect(x, yy, 38, 44);
        gc.fillStyle = "#f2eee6";
        gc.fillText(String(n), x + 19, yy + 30);
      }
    ["1st 12", "2nd 12", "3rd 12"].forEach((t, i) => {
      gc.strokeRect(40 + i * 152, 140, 152, 44);
      gc.fillText(t, 40 + i * 152 + 76, 170);
    });
  }).t;
  const wheelT = makeCanvas(256, 256, (gc) => {
    gc.fillStyle = "#3a2418";
    gc.fillRect(0, 0, 256, 256);
    const n = WHEEL.length;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2,
        a1 = ((i + 1) / n) * Math.PI * 2;
      gc.fillStyle = WHEEL[i] === 0 ? "#2a8a3a" : RED.has(WHEEL[i]) ? "#b0202a" : "#141414";
      gc.beginPath();
      gc.moveTo(128, 128);
      gc.arc(128, 128, 124, a0, a1);
      gc.closePath();
      gc.fill();
    }
    gc.fillStyle = "#5a3a20";
    gc.beginPath();
    gc.arc(128, 128, 78, 0, Math.PI * 2);
    gc.fill();
    gc.fillStyle = "#c9a227";
    gc.beginPath();
    gc.arc(128, 128, 22, 0, Math.PI * 2);
    gc.fill();
    for (let i = 0; i < 8; i++) {
      gc.save();
      gc.translate(128, 128);
      gc.rotate((i / 8) * Math.PI * 2);
      gc.fillRect(-3, 22, 6, 50);
      gc.restore();
    }
  }).t;
  const wheels: { spin: THREE.Group; v: number; target: number | null }[] = [];
  const roulette = (x: number, z: number, n: number) => {
    k.put(f, "roulette", H.rouletteTable, x, z);
    const lay = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 0.75), new THREE.MeshStandardMaterial({ map: layoutT, roughness: 0.9 }));
    lay.rotation.x = -Math.PI / 2;
    lay.position.set(x + 0.4, y + 0.76, z);
    g.add(lay);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.46, 0.14, 40), std("#3a2418", 0.4, 0.2));
    bowl.position.set(x - 1.0, y + 0.82, z);
    g.add(bowl);
    const spin = new THREE.Group();
    spin.position.set(x - 1.0, y + 0.9, z);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), new THREE.MeshStandardMaterial({ map: wheelT, roughness: 0.3, metalness: 0.2 }));
    disk.rotation.x = -Math.PI / 2;
    spin.add(disk);
    const turret = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 8), k.gold);
    turret.position.y = 0.06;
    spin.add(turret);
    g.add(spin);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), std("#f8f8f8", 0.2));
    ball.position.set(x - 1.0 + 0.36, y + 0.92, z);
    g.add(ball);
    const w = { spin, v: 0.4, target: null as number | null };
    wheels.push(w);
    let ba = 0;
    k.ticks[f].push((dt) => {
      if (w.target != null && w.v < 0.6) {
        // settle the winning pocket under the ball
        const want = -((WHEEL.indexOf(w.target) + 0.5) / WHEEL.length) * Math.PI * 2 + ba;
        spin.rotation.y += (want - spin.rotation.y) * Math.min(1, dt * 3);
      } else spin.rotation.y += w.v * dt;
      w.v = Math.max(w.target != null ? 0 : 0.4, w.v * Math.pow(0.55, dt));
      if (w.v > 1) ba -= dt * w.v * 1.6;
      ball.position.set(x - 1.0 + Math.cos(ba) * 0.34, y + 0.92, z - Math.sin(ba) * 0.34);
    });
    k.pickAll(f, spin, `<b>Roulette ${n}</b><span>spin</span>`, () => {
      const hgt = k.height;
      const r = hgt ? hgt % 37 : Math.floor(Math.random() * 37);
      w.v = 9;
      w.target = r;
      return { eyebrow: `Roulette ${n}`, title: `${r} · ${r === 0 ? "GREEN" : RED.has(r) ? "RED" : "BLACK"}`, mono: true, tag: [r === 0 ? "zero" : r % 2 ? "odd" : "even", r === 0 ? "ok" : "info"], stats: [["Block", hgt ? num(hgt) : "…"], ["Height mod 37", hgt ? `${r}` : "…"]] };
    });
    k.pick(f, lay, `<b>Roulette ${n}</b><span>spin</span>`, () => k.picks.get(disk)!());
    void k.person(f, 8100 + n, [x - 1.0, z - 1.0], "Croupier", { face: new THREE.Vector3(0, 0, 1) });
    for (let i = 0; i < 4; i++) k.put(f, "stoolCasino", () => F.stool("#8a1a2a"), x - 0.4 + i * 0.6, z + 1.0, 0, { solid: false });
    void k.person(f, 8110 + n, [x - 0.1, z + 1.0], "Gambler", { face: new THREE.Vector3(0, 0, -1), sit: true, dy: 0.7 });
    void k.person(f, 8120 + n, [x + 1.1, z + 1.0], "Gambler", { face: new THREE.Vector3(0, 0, -1), sit: true, dy: 0.7 });
  };
  roulette(-5.4, -17.4, 1);
  roulette(0.8, -17.4, 2);

  // card tables: blackjack ×2, baccarat in red, poker (a game of memory)
  const cardTable = (x: number, z: number, felt: string, name: string, n: number, oval = false) => {
    const t = k.put(f, `card${felt}${oval}`, () => H.cardTable(felt, oval), x, z);
    void k.person(f, 8200 + n, [x, z - (oval ? 0.95 : 0.55)], "Dealer", { face: new THREE.Vector3(0, 0, 1) });
    const seats: [number, number][] = oval ? [[-1.4, 0.3], [-0.6, 0.95], [0.6, 0.95], [1.4, 0.3]] : [[-1.0, 0.7], [-0.35, 1.05], [0.35, 1.05], [1.0, 0.7]];
    seats.forEach(([dx, dz], i) => {
      k.put(f, "chairCasino", () => H.velvetChair("#8a1a2a"), x + dx, z + dz + 0.25, Math.PI + Math.atan2(dx, dz + 0.3) * 0.6, { solid: false });
      if ((i + n) % 3 !== 0) void k.person(f, 8300 + n * 10 + i, [x + dx, z + dz + 0.2], "Gambler", { face: new THREE.Vector3(-dx * 0.5, 0, -1), sit: true, dy: 0.45 });
    });
    k.label(f, name, x, 1.15, z - (oval ? 0.8 : 0.1), { h: 0.12, color: "#f4b728" });
    if (oval) k.pickAll(f, t, `<b>${name}</b><span>play</span>`, () => ({ eyebrow: "Casino", title: name, game: "memory" }));
    else
      k.pickAll(f, t, `<b>${name}</b><span>deal</span>`, () => {
        const hgt = k.height || Math.floor(Math.random() * 1e6);
        const card = (i: number) => ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"][Math.floor(hash(hgt, i, n) * 13)] + ["♠", "♥", "♦", "♣"][Math.floor(hash(hgt, i, n + 5) * 4)];
        const val = (c: string) => (c[0] === "A" ? 11 : "JQK1".includes(c[0]) ? 10 : Number(c[0]));
        const you = [card(1), card(2)],
          bank = [card(3), card(4)];
        const a = you.reduce((s, c) => s + val(c), 0),
          b = bank.reduce((s, c) => s + val(c), 0);
        const pa = name.startsWith("BACCARAT") ? a % 10 : a,
          pb = name.startsWith("BACCARAT") ? b % 10 : b;
        return { eyebrow: name, title: `${you.join(" ")}  vs  ${bank.join(" ")}`, mono: true, tag: [pa > pb ? "You win" : pa === pb ? "Push" : "House wins", pa > pb ? "ok" : pa === pb ? "info" : "muted"], stats: [["You", `${pa}`], [name.startsWith("BACCARAT") ? "Banker" : "Dealer", `${pb}`], ["Shoe", `block ${num(hgt)}`]] };
      });
  };
  cardTable(-6.6, -6.0, "#1f6a3a", "BLACKJACK · 1", 1);
  cardTable(-1.6, -6.0, "#1f6a3a", "BLACKJACK · 2", 2);
  cardTable(3.0, -6.0, "#7a1420", "BACCARAT", 3);
  cardTable(-2.4, -11.8, "#1f4a6a", "POKER · HOLD'EM", 4, true);
  for (const [i, [x, z]] of ([[-2.4, -6.5], [-2.4, -11.8], [-2.4, -17.2]] as [number, number][]).entries()) {
    const ch = H.chandelier(i === 1 ? 1.5 : 1.2, 4);
    ch.position.set(x, y + h - 1.0, z);
    g.add(ch);
  }
  for (const [x, z] of [[-9, -2.6], [5.4, -2.6], [5.4, -20.2], [-8.6, -21.2]] as [number, number][]) k.put(f, "colCasino", () => F.column(h), x, z);

  // ---- the slots: three banks, back to back, a live jackpot topper on each ----
  const jack = makeCanvas(256, 96);
  const drawJack = () => {
    const gc = jack.g;
    gc.fillStyle = "#14060c";
    gc.fillRect(0, 0, 256, 96);
    gc.fillStyle = "#f4b728";
    gc.font = '800 22px "JetBrains Mono", monospace';
    gc.textAlign = "center";
    fitText(gc, "ⓩ JACKPOT", 128, 30);
    gc.fillStyle = "#ffe8a0";
    gc.font = '800 34px "JetBrains Mono", monospace';
    const tick = (Date.now() / 1000) % 75;
    fitText(gc, `${(reward() + tick * 0.0001 * reward()).toFixed(5)}`, 128, 70);
    gc.fillStyle = "#ff3e8a";
    gc.font = '600 14px "JetBrains Mono", monospace';
    fitText(gc, k.height ? `BLOCK ${num(k.height)}` : "", 128, 90);
    jack.t.needsUpdate = true;
  };
  drawJack();
  let ja = 0;
  k.ticks[f].push((dt) => {
    ja += dt;
    if (ja > 0.25) {
      ja = 0;
      drawJack();
    }
  });
  const jackMat = new THREE.MeshBasicMaterial({ map: jack.t, toneMapped: false });
  const reels = (gc: CanvasRenderingContext2D, s: string[], off = [0, 0, 0]) => {
    gc.fillStyle = "#0a0a12";
    gc.fillRect(0, 0, 192, 160);
    for (let i = 0; i < 3; i++) {
      gc.fillStyle = "#f4f0e6";
      gc.fillRect(8 + i * 60, 18, 54, 124);
      gc.save();
      gc.beginPath();
      gc.rect(8 + i * 60, 18, 54, 124);
      gc.clip();
      gc.font = '700 38px "JetBrains Mono", "Apple Color Emoji", monospace';
      gc.textAlign = "center";
      for (let r = -1; r <= 1; r++) {
        const idx = (SYMBOLS.indexOf(s[i]) + r + SYMBOLS.length * 9 + Math.floor(off[i])) % SYMBOLS.length;
        gc.fillStyle = SYMBOLS[idx] === "ⓩ" ? "#c9901a" : "#2a2030";
        gc.fillText(SYMBOLS[idx], 35 + i * 60, 94 + r * 46 + (off[i] % 1) * 46);
      }
      gc.restore();
    }
    gc.fillStyle = "#ff3e8a";
    gc.fillRect(4, 78, 184, 3);
  };
  const idle = makeCanvas(192, 160, (gc) => reels(gc, ["ⓩ", "ⓩ", "ⓩ"])).t;
  const idleMat = new THREE.MeshBasicMaterial({ map: idle, toneMapped: false });
  const colors = ["#8a1a2a", "#1a3a7a", "#5a1a7a", "#1a5a3a", "#7a5a1a"];
  let spins = 0,
    wins = 0;
  const slot = (x: number, z: number, rot: number, i: number) => {
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    grp.rotation.y = rot;
    g.add(grp);
    const col = colors[i % colors.length];
    F.place(grp, `slot${col}`, () => H.slotMachine(col), 0, 0, 0);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.7), idleMat);
    scr.position.set(0, 1.21, 0.565);
    scr.rotation.x = -0.08;
    grp.add(scr);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.3), jackMat);
    top.position.set(0, 1.83, 0.6);
    grp.add(top);
    let c: ReturnType<typeof makeCanvas> | null = null;
    let left = 0,
      res = ["ⓩ", "ⓩ", "ⓩ"];
    k.ticks[f].push((dt) => {
      if (left <= 0 || !c) return;
      left -= dt;
      const t = Math.max(0, left);
      reels(c.g, res, [t * 14, Math.max(0, t - 0.3) * 14, Math.max(0, t - 0.6) * 14]);
      c.t.needsUpdate = true;
    });
    k.pick(f, scr, `<b>Slot ${i + 1}</b><span>spin · jackpot ${reward()} ZEC</span>`, () => {
      c ??= makeCanvas(192, 160);
      scr.material = new THREE.MeshBasicMaterial({ map: c.t, toneMapped: false });
      // three ⓩ when the last block's height ends in 0
      const hgt = k.height;
      const jackpot = Math.random() < 0.06 || (hgt > 0 && hgt % 10 === 0 && spins === 0);
      res = jackpot ? ["ⓩ", "ⓩ", "ⓩ"] : [0, 1, 2].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
      const win = res[0] === res[1] && res[1] === res[2];
      spins++;
      if (win) wins++;
      left = 1.6;
      return { eyebrow: `Slot ${i + 1}`, title: res.join("  "), tag: win ? [res[0] === "ⓩ" ? `JACKPOT ${reward()} ZEC` : "Win", "ok"] : ["No win", "muted"], stats: [["Jackpot", `${reward()} ZEC`], ["Block", hgt ? num(hgt) : "…"], ["Spins", `${spins}`], ["Wins", `${wins}`]] };
    });
    k.pick(f, top, `<b>Jackpot</b><span>${reward()} ZEC</span>`, () => jackpotInfo());
    return grp;
  };
  const jackpotInfo = (): PickInfo => {
    const pr = Market.state.price;
    return { eyebrow: "Shielded jackpot", title: `${reward()} ZEC`, tag: ["block reward", "info"], stats: [["Block", k.height ? num(k.height) : "…"], ["Won by", k.lastPool ?? "…"], ["In USD", pr ? usd(pr.usd * reward()) : "…"], ["Since", k.since != null ? `${k.since} s` : "…"]] };
  };
  let n = 0;
  for (const r of [-4.6, -10.2, -15.8]) {
    for (let j = 0; j < 7; j++) {
      const x = 7.0 + j * 0.8;
      slot(x, r + 0.42, 0, n++);
      slot(x, r - 0.42, Math.PI, n++);
    }
    box(g, 5.8, 2.1, 0.1, std("#2a1418", 0.6), 9.4, y, r);
    box(g, 5.8, 0.05, 0.12, glowMat("#f4b728", 1.4), 9.4, y + 2.1, r);
    k.rects[f].push([6.55, r - 0.85, 12.25, r + 0.85]);
    for (let j = 0; j < 7; j += 2) {
      k.put(f, "stoolSlot", () => F.stool("#2a1418"), 7.0 + j * 0.8, r + 1.15, 0, { solid: false });
      k.put(f, "stoolSlot", () => F.stool("#2a1418"), 7.0 + j * 0.8 + 0.8, r - 1.15, 0, { solid: false });
    }
  }
  // gamblers on the slots
  [[7.0, -4.6 + 1.15, 1], [8.6, -10.2 + 1.15, 1], [11.0, -15.8 + 1.15, 1], [7.8, -10.2 - 1.15, -1], [10.2, -4.6 - 1.15, -1]].forEach(([x, z, d], i) => void k.person(f, 8400 + i, [x, z], "Gambler", { face: new THREE.Vector3(0, 0, -d), sit: true, dy: 0.7 }));
  // the big jackpot sign hung over the slots
  const big = (side: number) => {
    const s = k.screen(f, 5.2, 1.3, (gc, W, Hh) => {
      gc.fillStyle = "#14060c";
      gc.fillRect(0, 0, W, Hh);
      gc.strokeStyle = "#f4b728";
      gc.lineWidth = 6;
      gc.strokeRect(5, 5, W - 10, Hh - 10);
      for (let i = 0; i < 26; i++) {
        gc.fillStyle = (i + Math.floor(Date.now() / 250)) % 2 ? "#ffe8a0" : "#7a5a1a";
        gc.beginPath();
        gc.arc(16 + (i / 25) * (W - 32), 16, 4, 0, Math.PI * 2);
        gc.arc(16 + (i / 25) * (W - 32), Hh - 16, 4, 0, Math.PI * 2);
        gc.fill();
      }
      gc.textAlign = "center";
      gc.fillStyle = "#f4b728";
      gc.font = '800 24px "JetBrains Mono", monospace';
      fitText(gc, `SHIELDED JACKPOT · BLOCK ${k.height ? num(k.height) : "…"}`, W / 2, Hh * 0.33);
      gc.fillStyle = "#fff4c8";
      gc.font = '800 56px "JetBrains Mono", monospace';
      const tick = (Date.now() / 1000) % 75;
      fitText(gc, `ⓩ ${(reward() * (1 + tick * 0.0004)).toFixed(6)}`, W / 2, Hh * 0.72);
      gc.textAlign = "left";
    }, 0.25);
    s.position.set(9.4, y + 3.4, -10.2 + side * 0.06);
    s.rotation.y = side > 0 ? 0 : Math.PI;
    k.pick(f, s, "<b>Shielded jackpot</b><span>block reward</span>", () => jackpotInfo());
  };
  big(1);
  big(-1);
  box(g, 5.3, 1.4, 0.1, k.dark, 9.4, y + 2.75, -10.2);
  for (const dx of [-2.4, 2.4]) box(g, 0.03, h - 4.1, 0.03, k.chrome, 9.4 + dx, y + 4.1, -10.2);

  // the Lotus bar on the south glass
  k.put(f, "lotusBar", () => F.barCounter(4, "#ff7ab0"), -6.0, -2.4, Math.PI);
  k.put(f, "lotusBack", () => F.backBar(4), -6.0, -0.55, Math.PI);
  k.label(f, "LOTUS BAR", -6.0, 3.2, -0.62, { h: 0.36, color: "#ff7ab0", rot: Math.PI });
  for (let i = 0; i < 4; i++) k.put(f, "stoolLotus", () => F.stool("#ff7ab0"), -7.4 + i * 0.95, -3.35, 0, { solid: false });
  void k.person(f, 8500, [-6.0, -1.2], "Bartender", { face: new THREE.Vector3(0, 0, -1) });
  void k.person(f, 8501, [-6.5, -3.35], "Guest", { face: new THREE.Vector3(0, 0, 1), sit: true, dy: 0.7 });
  void k.person(f, 8502, [1, -9], "Gambler", { wander: [[1, -9], [5, -13], [-8, -9], [4, -2.8], [-4, -14.5]] });
  void k.person(f, 8503, [5.6, -8], "Gambler", { wander: [[5.6, -8], [5.6, -18], [-1, -14.4], [2, -3]] });
  k.light(f, -2.4, -6.5, "#ffd8a0", 12, -1.6);
  k.light(f, -2.4, -14.5, "#ffd8a0", 12, -1.6);
  k.light(f, 9.4, -7.4, "#ff9ab8", 10, -0.8);
  k.light(f, 9.4, -15.8, "#ffc070", 9, -0.8);
  k.light(f, -6, -2.5, "#ff7ab0", 6, -1.4);
}
