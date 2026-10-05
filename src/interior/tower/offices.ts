import * as THREE from "three";
import { Market } from "../../data/market";
import { get } from "../../data/zscan";
import { fitText } from "../../scene/fit";
import type { Book } from "../../ui/reader";
import * as F from "../furniture";
import { box, std, textPlane } from "../kit";
import { LEVELS, TowerKit, X0, X1, Z0, makeCanvas } from "./kit";

/** 1 — the offices: open plan with live screens, a glass meeting room, phone booths, the coffee bar. */
export function offices(k: TowerKit) {
  const f = 1,
    g = k.groups[f],
    y = LEVELS[f].y;
  const carpet = makeCanvas(128, 128, (gc) => {
    gc.fillStyle = "#3a3a46";
    gc.fillRect(0, 0, 128, 128);
    gc.fillStyle = "#34343f";
    for (let i = 0; i < 128; i += 8) gc.fillRect(0, i, 128, 4);
  }).t;
  carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping;
  carpet.repeat.set(12, 9);
  k.shell(f, new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 }), std("#4a4852", 0.95));
  k.elevators(f);
  const live = [
    (gc: CanvasRenderingContext2D, W: number, H: number) => {
      const p = Market.state.price;
      gc.fillStyle = "#06080c";
      gc.fillRect(0, 0, W, H);
      gc.fillStyle = "#f4b728";
      gc.font = '700 34px "JetBrains Mono", monospace';
      gc.fillText("ZEC/USD", 20, 46);
      if (!p) return;
      gc.fillStyle = "#fff";
      gc.font = '800 64px "JetBrains Mono", monospace';
      fitText(gc, `$${p.usd.toFixed(2)}`, 20, 120);
      const pts = p.history.slice(-30).map((h) => h[1]);
      if (pts.length < 2) return;
      const lo = Math.min(...pts),
        hi = Math.max(...pts);
      gc.strokeStyle = p.usd_24h_change >= 0 ? "#2fbf9c" : "#f06b76";
      gc.lineWidth = 4;
      gc.beginPath();
      pts.forEach((v, i) => gc[i ? "lineTo" : "moveTo"](20 + (i / (pts.length - 1)) * (W - 40), H - 20 - ((v - lo) / (hi - lo || 1)) * (H - 160)));
      gc.stroke();
    },
    (gc: CanvasRenderingContext2D, W: number, H: number) => {
      const txs = k.ctx.director.mempoolList();
      gc.fillStyle = "#0a0806";
      gc.fillRect(0, 0, W, H);
      gc.fillStyle = "#ff9f2e";
      gc.font = '700 30px "JetBrains Mono", monospace';
      fitText(gc, `MEMPOOL · ${txs.length} TX`, 20, 44);
      gc.font = '500 22px "JetBrains Mono", monospace';
      gc.fillStyle = "#e9e0c8";
      txs.slice(-6).reverse().forEach((t, i) => fitText(gc, `${t.txid.slice(0, 10)}…  ${t.kind}`, 20, 90 + i * 32));
    },
    (gc: CanvasRenderingContext2D, W: number, H: number) => {
      gc.fillStyle = "#04121a";
      gc.fillRect(0, 0, W, H);
      gc.fillStyle = "#3ef0ff";
      gc.font = '700 30px "JetBrains Mono", monospace';
      gc.fillText("LAST BLOCK", 20, 44);
      gc.fillStyle = "#e8fbff";
      gc.font = '800 70px "JetBrains Mono", monospace';
      fitText(gc, k.height ? `#${k.height.toLocaleString("en-US")}` : "…", 20, 140);
    },
  ];
  const info = [
    () => ({ eyebrow: "Office screen", title: "ZEC / USD", body: `<p>${Market.state.price ? `$${Market.state.price.usd.toFixed(2)}, ${Market.state.price.usd_24h_change.toFixed(2)}% in 24 h.` : "Loading…"}</p>` }),
    () => ({ eyebrow: "Office screen", title: "Mempool", body: `<p>${k.ctx.director.mempoolList().length} transactions waiting at the MEMPOOL.</p>` }),
    () => ({ eyebrow: "Office screen", title: "Last block", body: `<p>${k.height ? `Block ${k.height.toLocaleString("en-US")}.` : "Waiting for a block."}</p>` }),
  ];
  // open plan: three rows of four desks, two live monitors each, office chairs, developers at work
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++) {
      const x = -6 + c * 3.4,
        z = -4.4 - r * 3.3;
      k.put(f, `desk${(r + c) % 4}`, () => F.desk(r + c), x, z);
      for (const dx of [-0.34, 0.34]) {
        const n = (r * 4 + c + (dx > 0 ? 1 : 0)) % 3;
        const mon = k.screen(f, 0.56, 0.34, live[n], 4 + n);
        mon.position.set(x + dx, y + 1.0, z - 0.17);
        box(g, 0.6, 0.38, 0.03, k.dark, x + dx, y + 0.81, z - 0.19);
        k.pick(f, mon, ["<b>ZEC price</b><span>live</span>", "<b>Mempool</b><span>live</span>", "<b>Last block</b><span>live</span>"][n], info[n]);
      }
      k.put(f, "officeChair", () => F.chair("#2e3448", true), x, z + 0.75, Math.PI, { solid: false });
      if ((r * 4 + c) % 3 !== 2) void k.person(f, 300 + r * 10 + c, [x, z + 0.75], "Developer", { face: new THREE.Vector3(0, 0, -1), sit: true, dy: 0.45 });
    }
  // the meeting room: glass on two sides, a long table, eight chairs, the big screen
  const MX0 = 5.5,
    MZ1 = -12.5;
  for (const [a, b, c, d] of [
    [MX0, MZ1, X1, MZ1],
    [MX0, Z0, MX0, MZ1],
  ] as const) {
    const len = Math.hypot(c - a, d - b);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 4), k.glass);
    p.position.set((a + c) / 2, y + 2, (b + d) / 2);
    p.rotation.y = a === c ? Math.PI / 2 : 0;
    p.raycast = () => {};
    g.add(p);
    box(g, a === c ? 0.06 : len, 0.06, a === c ? len : 0.06, k.mullion, (a + c) / 2, y + 3.94, (b + d) / 2);
    box(g, a === c ? 0.06 : len, 0.06, a === c ? len : 0.06, k.mullion, (a + c) / 2, y, (b + d) / 2);
  }
  k.rects[f].push([MX0, MZ1 - 0.1, 9, MZ1 + 0.1], [10.4, MZ1 - 0.1, X1, MZ1 + 0.1], [MX0 - 0.1, Z0, MX0 + 0.1, MZ1]);
  k.put(f, "meetTable", () => F.diningTable(6), 8.8, -15.3);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) k.put(f, "meetChair", () => F.chair("#3a2a4a", true), 7.9 + i * 0.9, -15.3 + s * 0.85, s > 0 ? Math.PI : 0, { solid: false });
  const big = k.screen(f, 3.2, 1.8, live[2], 5);
  big.position.set(8.75, y + 2.1, Z0 + 0.25);
  k.pick(f, big, "<b>Meeting room screen</b><span>the last block</span>", info[2]);
  k.label(f, "MEETING ROOM · 会議室", 7.7, 3.4, MZ1 + 0.02, { h: 0.2, color: "#7fe3ff" });
  void k.person(f, 7070, [7.9, -14.45], "Developer", { face: new THREE.Vector3(0, 0, -1), sit: true, dy: 0.45 });
  void k.person(f, 7071, [9.7, -16.15], "Developer", { face: new THREE.Vector3(0, 0, 1), sit: true, dy: 0.45 });
  // the whiteboard: the ZIP of the day (click to read it)
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.6), new THREE.MeshStandardMaterial({ color: "#f4f4f0", roughness: 0.4 }));
  board.position.set(-4, y + 1.8, Z0 + 0.25);
  g.add(board);
  box(g, 3.7, 1.7, 0.04, k.chrome, -4, y + 0.95, Z0 + 0.2);
  let zipOfDay: Book | null = null;
  void (async () => {
    let zips = (await get<{ slug: string; number: number | null; title: string; status: string; owners: string[]; created: string | null; url: string }[]>("/v1/zips")) ?? [];
    if (!zips.length) zips = await fetch(`${import.meta.env.BASE_URL}zips.json`).then((r) => (r.ok ? r.json() : []), () => []);
    const real = zips.filter((z) => z.number != null && z.status !== "Reserved");
    if (!real.length) return;
    const z = real[Math.floor(Date.now() / 86_400_000) % real.length];
    zipOfDay = { slug: z.slug, number: z.number, title: z.title, status: z.status, owners: z.owners, created: z.created, url: z.url, color: "#7fe3ff" };
    for (const [text, h, yy, c] of [[`ZIP OF THE DAY · ${z.number}`, 0.2, 2.25, "#1c1a24"], [z.title.length > 40 ? `${z.title.slice(0, 39)}…` : z.title, 0.15, 1.85, "#3a3640"], ["click to read →", 0.12, 1.4, "#2a78d6"]] as const) {
      const t = textPlane(text, { h, color: c, bg: "#f4f4f0" });
      t.position.set(-4, y + yy, Z0 + 0.27);
      g.add(t);
    }
  })();
  k.pick(f, board, "<b>The whiteboard</b><span>today's ZIP · click to read</span>", () => (zipOfDay ? { eyebrow: "Whiteboard", title: zipOfDay.title, book: zipOfDay } : null));
  // the coffee bar in the south-east corner: counter, machine, stools, the barista
  k.put(f, "coffeeBar", () => F.barCounter(3, "#ff9f2e"), 9.8, -1.6, Math.PI);
  const machine = k.put(f, "coffeeMachine", F.coffeeMachine, 10.6, -1.65, Math.PI, { dy: 1.08, solid: false });
  for (let i = 0; i < 3; i++) k.put(f, "stoolOrange", () => F.stool("#ff9f2e"), 8.8 + i * 0.9, -2.5, 0, { solid: false });
  k.label(f, "COFFEE · 珈琲", 9.8, 2.6, -0.15, { h: 0.26, color: "#ff9f2e", rot: Math.PI });
  void k.person(f, 9191, [9.6, -0.7], "Barista", { face: new THREE.Vector3(0, 0, -1) });
  let cups = 0;
  machine.traverse((o) =>
    o instanceof THREE.Mesh &&
    k.pick(f, o, "<b>Coffee machine</b><span>click for an espresso</span>", () => ({ eyebrow: "Coffee bar", title: "Shielded espresso ☕", body: `<p>Double shot, nothing revealed. ${++cups} cup${cups > 1 ? "s" : ""} this visit.</p>` })),
  );
  // phone booths by the core, a bookshelf, plants, paintings, sconces
  k.put(f, "boothGreen", () => F.phoneBooth("#3a5a4a"), -10.6, -14.6, Math.PI / 2);
  k.put(f, "boothBlue", () => F.phoneBooth("#3a4a6a"), -10.6, -16.6, Math.PI / 2);
  k.label(f, "PHONE BOOTHS", -10.6, 2.7, -13.5, { h: 0.18, color: "#7fe3ff" });
  k.put(f, "shelfOffice", () => F.bookshelf(4), -10.9, -2.5, Math.PI / 2);
  k.put(f, "plantF", () => F.plant("ficus", 5), -10.6, -4.5);
  k.put(f, "plantM", () => F.plant("monstera", 6), 4.6, -16.8);
  k.put(f, "plantC", () => F.plant("cactus", 7), 4.6, -11.8);
  k.painting(f, 1234, X0 + 0.2, 2.2, -14.2, Math.PI / 2, 0.8);
  k.painting(f, 5678, X0 + 0.2, 2.2, -3.6, Math.PI / 2, 0.8);
  k.light(f, -3, -5, "#f4f0ff", 9);
  k.light(f, -3, -11, "#f4f0ff", 9);
  k.light(f, 8.5, -15, "#cfe8ff", 7);
  k.light(f, 9.5, -2, "#ffd8a8", 6);
}
