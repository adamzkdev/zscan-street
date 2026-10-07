import * as THREE from "three";
import { ZScan } from "../../data/zscan";
import { backBar, barCounter, place, plant, receptionDesk, stool } from "../furniture";
import { textPlane } from "../kit";
import type { PickInfo } from "../types";
import { type Level, canvasTex, glow, ribTex, std, timberTex } from "./kit";

/**
 * The northern foyer, under the biggest shell: the ribbed concrete vault sweeping up to the
 * pleated glass wall over the bay (the city beyond, live), a terrace outside it, the bar and the
 * champagne bar, high tables where people talk between movements, the program board, Utzon's
 * tapestry on the back wall and the doors up to the Concert Hall.
 */

export const FX = 15,
  FZ0 = -12,
  FZ1 = 16;
const WALL = 4.5;

const AR = 1.7,
  A0 = Math.sqrt(AR * AR - (AR - 1) ** 2);
const arch = (u: number) => Math.sqrt(Math.max(0, AR * AR - (Math.min(1, u) + AR - 1) ** 2)) / A0;
/** Height of the vault at x (|x| ≤ FX) and depth t (0 at the glass, 1 at the back wall). */
const vaultY = (x: number, t: number) => WALL + 12.5 * arch(Math.abs(x) / FX) * (1 - 0.6 * t);

const GUEST_LINES = [
  ["Did you feel the last block? Goosebumps.", "Second movement next. Shielded, I hope."],
  ["The acoustics in there are unreal.", "I come for the crescendo when a block lands."],
  ["One glass of the Shielded Sparkling, please.", "Bravo for the last one, wasn't it?"],
  ["They play every transaction as a note.", "Twenty-seven notes in the last block!"],
  ["Look at the bay from here.", "The ferries never stop."],
  ["Is it true the conductor is zkSNARK #1?", "I heard it plays a melody if you click."],
];

export function buildFoyer(L: Level, program: { draw: (g: CanvasRenderingContext2D, w: number, h: number) => void; info: () => PickInfo }) {
  const g = L.group;
  const m = L.m;
  const timber = new THREE.MeshStandardMaterial({ map: timberTex(8), roughness: 0.55, color: "#d6a878" });
  const concrete = std("#bdb1a0", 0.9);
  const granite = std("#9a8a7c", 0.8);
  const bronze = std("#6a5236", 0.4, 0.7);
  const dark = std("#1e1a1c", 0.6);

  // ---- floor, walls --------------------------------------------------------------------------------
  {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(FX * 2, FZ1 - FZ0), timber);
    f.rotation.x = -Math.PI / 2;
    f.position.set(0, 0, (FZ0 + FZ1) / 2);
    g.add(f);
    const tex = timber.map!;
    tex.repeat.set(10, 9);
  }
  // granite band along the glass
  m.box(granite, FX * 2, 0.02, 1.4, 0, 0, FZ0 + 0.7);
  for (const sx of [-1, 1]) {
    m.box(concrete, 0.4, WALL, FZ1 - FZ0, sx * (FX + 0.2), 0, (FZ0 + FZ1) / 2);
    L.rects.push([sx < 0 ? -FX - 0.4 : FX - 0.1, FZ0 - 1, sx < 0 ? -FX + 0.1 : FX + 0.4, FZ1 + 1]);
  }
  m.box(concrete, FX * 2 + 0.8, 10.5, 0.4, 0, 0, FZ1 + 0.2);
  L.rects.push([-FX - 1, FZ1 - 0.1, FX + 1, FZ1 + 0.5]);
  // the entrance doors behind you: bronze-framed glass, lit from outside
  for (const x of [-2.4, -0.8, 0.8, 2.4]) {
    m.box(bronze, 1.5, 2.8, 0.08, x, 0, FZ1 - 0.02);
    m.box(glow("#ffe2b0", 0.7), 1.3, 2.6, 0.02, x, 0.05, FZ1 - 0.08);
  }
  m.box(bronze, 6.6, 0.12, 0.2, 0, 2.9, FZ1 - 0.1);

  // ---- the vault: concrete ribs fanning from the back to the glass ---------------------------------
  {
    const nx = 48,
      nz = 24;
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [];
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const u = -1 + (2 * i) / nx,
          t = j / nz;
        pos.push(u * FX, vaultY(u * FX, t), FZ0 + t * (FZ1 - FZ0));
        uv.push(i / nx, t);
      }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        idx.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const vault = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ribTex(24, "#d4cab8", "#9a8e7c"), side: THREE.DoubleSide, roughness: 0.9 }));
    vault.raycast = () => {};
    g.add(vault);
    // real ribs under it, every other line, catching the light
    for (let i = 1; i < 24; i += 2) {
      const u = -1 + (2 * i) / 24;
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 12; j++) {
        const t = j / 12;
        pts.push(new THREE.Vector3(u * FX, vaultY(u * FX, t) - 0.14, FZ0 + t * (FZ1 - FZ0)));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.14, 4);
      m.add(concrete, tube);
    }
  }

  // ---- the pleated glass wall, and the terrace beyond ---------------------------------------------
  {
    const glass = new THREE.MeshStandardMaterial({ color: "#c8a878", transparent: true, opacity: 0.13, roughness: 0.05, metalness: 0.4, depthWrite: false, side: THREE.DoubleSide });
    const n = 20;
    const pos: number[] = [];
    for (let i = 0; i < n; i++) {
      const x0 = -FX + (2 * FX * i) / n,
        x1 = -FX + (2 * FX * (i + 1)) / n;
      const z0 = FZ0 - (i % 2 ? 0.45 : 0),
        z1 = FZ0 - ((i + 1) % 2 ? 0.45 : 0);
      const h0 = vaultY(x0, 0),
        h1 = vaultY(x1, 0);
      pos.push(x0, 0, z0, x1, 0, z1, x1, h1, z1, x0, 0, z0, x1, h1, z1, x0, h0, z0);
      m.box(bronze, 0.1, h0, 0.1, x0, 0, z0);
      for (let y = 2.6; y < Math.min(h0, h1) - 0.2; y += 2.6) {
        const tr = new THREE.BoxGeometry(Math.hypot(x1 - x0, z1 - z0), 0.07, 0.07);
        tr.rotateY(-Math.atan2(z1 - z0, x1 - x0));
        tr.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
        m.add(bronze, tr);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const pane = new THREE.Mesh(geo, glass);
    pane.raycast = () => {};
    pane.renderOrder = 2;
    g.add(pane);
    L.rects.push([-FX, FZ0 - 0.6, FX, FZ0 + 0.1]);
    // the terrace: granite slabs, the bronze railing, the bay beyond
    const ter = new THREE.Mesh(new THREE.PlaneGeometry(FX * 2 + 6, 8), std("#b8aa9a", 0.85));
    ter.rotation.x = -Math.PI / 2;
    ter.position.set(0, -0.02, FZ0 - 4);
    g.add(ter);
    for (let x = -FX - 3; x <= FX + 3; x += 1.2) m.box(bronze, 0.06, 1.05, 0.06, x, 0, FZ0 - 7.6);
    m.box(bronze, FX * 2 + 6, 0.07, 0.1, 0, 1.05, FZ0 - 7.6);
    m.box(bronze, FX * 2 + 6, 0.04, 0.04, 0, 0.55, FZ0 - 7.6);
  }

  // ---- the bar (west) and the champagne bar (east) ----------------------------------------------
  const bars: [number, string, string][] = [
    [-1, "BAR", "#f4b728"],
    [1, "CHAMPAGNE", "#ff7ab0"],
  ];
  for (const [sx, name, accent] of bars) {
    const xc = sx * (FX - 2.6);
    place(g, `opbar${sx}`, () => barCounter(9, accent), xc, 0, -3, sx * -Math.PI / 2);
    place(g, `opback${sx}`, () => backBar(9), sx * (FX - 0.35), 0, -3, sx * -Math.PI / 2);
    L.rects.push([xc - 0.4, -7.6, xc + 0.4, 1.6]);
    for (let z = -6.8; z <= 0.8; z += 1.25) place(g, "opstool", () => stool("#6a1e3c"), xc - sx * 0.95, 0, z);
    const sign = textPlane(name, { h: 0.5, color: accent, glow: true });
    sign.position.set(sx * (FX - 0.02), 3.3, -3);
    sign.rotation.y = -sx * Math.PI / 2;
    g.add(sign);
    m.box(glow(accent, 1.4), 0.04, 0.04, 9.2, sx * (FX - 0.05), 2.95, -3);
  }

  // ---- the doors up to the Concert Hall ---------------------------------------------------------------
  const doors = new THREE.Group();
  {
    for (const dz of [-0.75, 0.75]) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, 1.4), std("#7a4a2a", 0.5));
      d.position.set(FX - 0.05, 1.6, 8 + dz);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.05), std("#c9a24a", 0.3, 0.8));
      h.position.set(FX - 0.13, 1.3, 8 + dz * 0.2);
      doors.add(d, h);
    }
    const s = textPlane("CONCERT HALL ▲", { h: 0.34, color: "#ffe2b0", glow: true });
    s.position.set(FX - 0.03, 3.6, 8);
    s.rotation.y = -Math.PI / 2;
    doors.add(s);
    g.add(doors);
    L.pick(doors, "<b>Concert Hall</b><span>Block Symphony, live</span>", () => ({ eyebrow: "OPERA HOUSE", title: "Concert Hall", floor: 1 }));
    m.box(glow("#ffd8a0", 1.2), 0.04, 0.04, 3.4, FX - 0.05, 3.3, 8);
  }

  // ---- high tables, plants, the program board ----------------------------------------------------------
  const tables: [number, number][] = [
    [-6, -6],
    [-2, -8],
    [3, -7],
    [7, -4],
    [-7, 2],
    [-3, 5],
    [4, 3],
    [8, 9],
  ];
  for (const [x, z] of tables) {
    m.cyl(dark, 0.04, 0.04, 1.05, x, 0, z, 6);
    m.cyl(dark, 0.25, 0.25, 0.03, x, 0, z, 12);
    m.cyl(std("#f2ece0", 0.5), 0.36, 0.36, 0.04, x, 1.05, z, 18);
    m.cyl(glow("#ffd090", 2), 0.03, 0.03, 0.08, x + 0.1, 1.09, z, 6);
    m.cyl(std("#e8d890", 0.1, 0.1, { transparent: true, opacity: 0.6 }), 0.03, 0.02, 0.18, x - 0.12, 1.09, z + 0.05, 6);
    L.rects.push([x - 0.4, z - 0.4, x + 0.4, z + 0.4]);
  }
  for (const [x, z] of [
    [-FX + 0.8, 10],
    [FX - 0.8, 12.5],
    [-FX + 0.8, -10.6],
    [FX - 0.8, -10.6],
  ]) {
    place(g, `opplant${x}`, () => plant("ficus", Math.abs(x + z)), x, 0, z);
    L.rects.push([x - 0.5, z - 0.5, x + 0.5, z + 0.5]);
  }
  // the program: an easel by the entrance
  const prog = canvasTex(768, 1024, program.draw);
  const board = new THREE.Group();
  {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2), new THREE.MeshBasicMaterial({ map: prog.t, toneMapped: true }));
    p.position.set(0, 1.55, 0.03);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.62, 2.12, 0.05), bronze);
    back.position.set(0, 1.55, 0);
    for (const dx of [-0.6, 0.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), bronze);
      leg.position.set(dx, 0.3, 0);
      board.add(leg);
    }
    board.add(p, back);
    board.position.set(-4.5, 0, 11.5);
    board.rotation.y = 0.35;
    g.add(board);
    L.rects.push([-5.4, 11, -3.6, 12]);
    L.pick(board, "<b>Tonight's program</b><span>Block Symphony</span>", program.info);
  }

  // Utzon's tapestry on the back wall: a field of red, blue and gold
  {
    const tap = canvasTex(1024, 512, (c, w, h) => {
      c.fillStyle = "#d8422a";
      c.fillRect(0, 0, w, h);
      const shapes: [string, number, number, number, number][] = [
        ["#1d3c8a", 40, 40, 300, 180],
        ["#f4b728", 380, 60, 140, 380],
        ["#f2ead8", 560, 40, 200, 120],
        ["#1a1a20", 820, 30, 160, 260],
        ["#2a7a4a", 560, 200, 220, 260],
        ["#f4b728", 60, 280, 260, 70],
        ["#1d3c8a", 820, 330, 170, 150],
        ["#f2ead8", 120, 380, 120, 100],
      ];
      for (const [col, x, y, ww, hh] of shapes) {
        c.fillStyle = col;
        c.fillRect(x, y, ww, hh);
      }
      c.strokeStyle = "#1a1a20";
      c.lineWidth = 10;
      c.beginPath();
      c.arc(470, 250, 90, 0, Math.PI * 2);
      c.stroke();
      for (let i = 0; i < 4000; i++) {
        c.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
        c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    });
    const t = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshStandardMaterial({ map: tap.t, roughness: 1 }));
    t.position.set(0, 5.6, FZ1 - 0.05);
    t.rotation.y = Math.PI;
    g.add(t);
  }

  // ---- the carpet, panelling, benches, the box office, posters ---------------------------------------
  {
    const rug = canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = "#5a1a3a";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "#7a2a52";
      c.lineWidth = 6;
      for (let i = -h; i < w; i += 48) {
        c.beginPath();
        c.moveTo(i, h);
        c.lineTo(i + h / 2, h / 2);
        c.lineTo(i + h, h);
        c.stroke();
        c.beginPath();
        c.moveTo(i, h / 2);
        c.lineTo(i + h / 2, 0);
        c.lineTo(i + h, h / 2);
        c.stroke();
      }
      c.strokeStyle = "#c9a24a";
      c.lineWidth = 10;
      c.strokeRect(14, 14, w - 28, h - 28);
    });
    const r = new THREE.Mesh(new THREE.PlaneGeometry(18, 16), new THREE.MeshStandardMaterial({ map: rug.t, roughness: 1 }));
    r.rotation.x = -Math.PI / 2;
    r.position.set(0, 0.01, -1);
    g.add(r);
  }
  for (const sx of [-1, 1]) {
    for (let z = FZ0 + 0.6; z < FZ1 - 0.4; z += 0.8) if (z < -8 || z > 2.2) m.box(timber, 0.08, WALL - 0.3, 0.2, sx * (FX - 0.04), 0, z);
    m.box(std("#2a1a1e", 0.6), 0.08, 0.12, FZ1 - FZ0, sx * (FX - 0.06), WALL - 0.3, (FZ0 + FZ1) / 2);
  }
  for (const [x, z] of [
    [-FX + 0.6, 7.5],
    [-FX + 0.6, -9.5],
    [FX - 0.6, -9.5],
  ]) {
    m.box(std("#2a1a1e", 0.5), 0.7, 0.45, 2.4, x, 0, z);
    m.box(std("#4a1e30", 0.9), 0.62, 0.1, 2.3, x, 0.45, z);
    L.rects.push([x - 0.4, z - 1.25, x + 0.4, z + 1.25]);
  }
  place(g, "opbox", receptionDesk, 8.5, 0, 13.4, Math.PI);
  L.rects.push([6.4, 12.7, 10.6, 14.1]);
  {
    const s = textPlane("BOX OFFICE", { h: 0.36, color: "#ffe2b0", glow: true });
    s.position.set(8.5, 3.0, FZ1 - 0.08);
    s.rotation.y = Math.PI;
    g.add(s);
  }
  void L.person(808, 8.5, 0, 14.4, "Box office", { lines: ["Two tickets for the next block?", "Sold out, but the bar has standing room."], face: new THREE.Vector3(0, 0, -1) });
  // posters of the season on the west wall
  [
    [1, "CONDUCTOR"],
    [4242, "SOLOIST"],
    [7777, "ORGANIST"],
  ].forEach(([id, role], i) => {
    const grp = new THREE.Group();
    const tex = new THREE.TextureLoader().load(ZScan.zkSnarkImage(id as number));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.1, 0.06), std("#1a1418", 0.5));
    const art = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    art.position.set(0, 0.25, 0.035);
    const cap = textPlane(String(role), { h: 0.16, color: "#f4b728", bg: "#1a1418" });
    cap.position.set(0, -0.62, 0.04);
    const num = textPlane(`zkSNARK #${id}`, { h: 0.11, color: "#e8e0d0", bg: "#1a1418" });
    num.position.set(0, -0.84, 0.04);
    grp.add(frame, art, cap, num);
    grp.position.set(-FX + 0.1, 2.0, 11.6 - i * 2.1 - (i > 0 ? 0 : 0));
    grp.rotation.y = Math.PI / 2;
    if (i === 2) grp.position.z = 4.2;
    g.add(grp);
    L.pick(grp, `<b>${role}</b><span>zkSNARK #${id}</span>`, () => ({ eyebrow: "BLOCK SYMPHONY · SEASON", title: `zkSNARK #${id}`, mono: true, image: ZScan.zkSnarkImage(id as number), tag: [String(role), "info"] }));
  });

  // ---- lights -----------------------------------------------------------------------------------------
  for (const [x, y, z, c, k] of [
    [-9, 4, -3, "#ffcf8a", 30],
    [9, 4, -3, "#ffc0d8", 30],
    [0, 7, 0, "#ffe2b8", 60],
    [0, 4, 11, "#ffe2b8", 30],
  ] as const) {
    const l = new THREE.PointLight(c, k, 22, 1.4);
    l.position.set(x, y, z);
    g.add(l);
  }
  // downlights along the ribs
  for (let i = 2; i < 24; i += 4)
    for (const t of [0.35, 0.6, 0.85]) {
      const x = (-1 + (2 * i) / 24) * FX;
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow("#ffe6c0", 3));
      d.position.set(x, vaultY(x, t) - 0.3, FZ0 + t * (FZ1 - FZ0));
      g.add(d);
    }

  // ---- people ---------------------------------------------------------------------------------------------
  const ids = [4217, 913, 7788, 2650, 5120, 8833, 377, 6402, 1999, 9071, 3305, 6610];
  tables.forEach(([x, z], i) => {
    if (i > 6) return;
    const lines = GUEST_LINES[i % GUEST_LINES.length];
    void L.person(ids[i], x + 0.75, 0, z + 0.2, "Guest", { lines, face: new THREE.Vector3(-1, 0, 0), near: 6 });
    if (i % 2 === 0) void L.person(ids[i + 5] ?? 42, x - 0.75, 0, z - 0.1, "Guest", { lines: GUEST_LINES[(i + 3) % GUEST_LINES.length], face: new THREE.Vector3(1, 0, 0), near: 6 });
  });
  void L.person(2024, -(FX - 1.5), 0, -4.5, "Bartender", { lines: ["What'll it be? The Shielded Sparkling?", "Interval in five minutes."], face: new THREE.Vector3(1, 0, 0) });
  void L.person(5555, FX - 1.5, 0, -2, "Sommelier", { lines: ["A glass of the 2016 Sprout Brut?", "Sapling vintage, very private."], face: new THREE.Vector3(-1, 0, 0) });
  void L.person(1111, FX - 1.6, 0, 10.4, "Usher", { lines: ["The Concert Hall is through these doors.", "Please take your seats, the next block is near."], face: new THREE.Vector3(-1, 0, 0) });
  void L.person(1234, 1.5, 0, 6, "Guest", { lines: ["Have you seen the program?"], wander: [[1.5, 6], [-1, -2], [5, -9], [-6, 8]] });

  return { program: prog };
}
