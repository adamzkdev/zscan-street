import * as THREE from "three";
import * as F from "../furniture";
import { CAST } from "./cast";
import { DINING, FACES, HALL, type PrisonKit } from "./kit";

/** A wall along z at x (or along x at z), with window gaps [centre, width] between y0 and y1. */
function windowedWall(k: PrisonKit, axis: "x" | "z", at: number, a: number, c: number, h: number, wins: number[], ww: number, y0: number, y1: number, out: number) {
  const { b } = k;
  const seg = (s: number, e: number, yb: number, ht: number) => {
    if (e - s < 0.01 || ht <= 0) return;
    if (axis === "x") b.box(k.paintWall, 0.4, ht, e - s, at, yb, (s + e) / 2);
    else b.box(k.paintWall, e - s, ht, 0.4, (s + e) / 2, yb, at);
  };
  seg(a, c, 0, y0);
  seg(a, c, y1, h - y1);
  if (axis === "x") b.box(k.paintLow, 0.42, 1.2, c - a, at, 0, (a + c) / 2);
  else b.box(k.paintLow, c - a, 1.2, 0.42, (a + c) / 2, 0, at);
  let s = a;
  for (const w of wins) {
    seg(s, w - ww / 2, y0, y1 - y0);
    s = w + ww / 2;
    // bars and a sill; the real bay shows through
    for (let q = -ww / 2 + 0.08; q < ww / 2; q += 0.14) {
      if (axis === "x") k.bars.bar(at + out * 0.1, y0, w + q, at + out * 0.1, y1, w + q, 1.2);
      else k.bars.bar(w + q, y0, at + out * 0.1, w + q, y1, at + out * 0.1, 1.2);
    }
    for (const y of [y0 + (y1 - y0) / 3, y0 + ((y1 - y0) * 2) / 3]) {
      if (axis === "x") k.flats.put(at + out * 0.1, y, w, 0.05, 0.04, ww);
      else k.flats.put(w, y, at + out * 0.1, ww, 0.04, 0.05);
    }
    if (axis === "x") b.box(k.paintWall, 0.55, 0.08, ww + 0.1, at, y0 - 0.08, w);
    else b.box(k.paintWall, ww + 0.1, 0.08, 0.55, w, y0 - 0.08, at);
  }
  seg(s, c, y0, y1 - y0);
}

/** Times Square: the clock over the dining hall door, the count board, the yard door. */
export function timesSquare(k: PrisonKit) {
  const { b } = k;
  const Z = HALL.z0 - 0.0;
  // the clock
  const clock = k.picture(1.1, 1.1, (g, W, H) => {
    const d = new Date();
    g.clearRect(0, 0, W, H);
    g.fillStyle = "#f4f0e2";
    g.beginPath();
    g.arc(W / 2, H / 2, W * 0.47, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = W * 0.035;
    g.strokeStyle = "#1a1a18";
    g.stroke();
    g.fillStyle = "#1a1a18";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `700 ${W * 0.09}px Georgia, serif`;
    for (let n = 1; n <= 12; n++) {
      const a = (n / 12) * Math.PI * 2;
      g.fillText(`${n}`, W / 2 + Math.sin(a) * W * 0.36, H / 2 - Math.cos(a) * H * 0.36);
    }
    for (let n = 0; n < 60; n++) {
      const a = (n / 60) * Math.PI * 2;
      const r0 = n % 5 ? 0.43 : 0.41;
      g.lineWidth = n % 5 ? 1.5 : 3;
      g.beginPath();
      g.moveTo(W / 2 + Math.sin(a) * W * r0, H / 2 - Math.cos(a) * H * r0);
      g.lineTo(W / 2 + Math.sin(a) * W * 0.455, H / 2 - Math.cos(a) * H * 0.455);
      g.stroke();
    }
    const hand = (a: number, len: number, wdt: number, col = "#1a1a18") => {
      g.strokeStyle = col;
      g.lineWidth = wdt;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(W / 2, H / 2);
      g.lineTo(W / 2 + Math.sin(a) * W * len, H / 2 - Math.cos(a) * H * len);
      g.stroke();
    };
    const s = d.getSeconds(),
      mi = d.getMinutes() + s / 60,
      h = (d.getHours() % 12) + mi / 60;
    hand((h / 12) * Math.PI * 2, 0.22, W * 0.03);
    hand((mi / 60) * Math.PI * 2, 0.34, W * 0.02);
    hand((s / 60) * Math.PI * 2, 0.38, W * 0.008, "#b0201a");
  }, 0, 4.45, Z + 0.04, 0, { px: 512, transparent: true });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.05, 8, 40), k.darkSteel);
  ring.position.set(0, 4.45, Z + 0.06);
  k.root.add(ring);
  b.box(k.darkSteel, 0.1, 0.3, 0.2, 0, 5.0, Z + 0.1);
  let acc = 0;
  k.ticks.push((dt) => {
    acc += dt;
    if (acc < 1) return;
    acc = 0;
    clock.redraw();
  });
  k.pick(clock.mesh, "<b>Times Square</b><span>the clock</span>", () => ({
    eyebrow: "Times Square",
    title: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    mono: true,
    stats: [["Block", k.height ? k.height.toLocaleString("en-US") : "…"], ["Mempool", `${k.ctx.director.mempoolList().length} tx`]],
  }));
  k.label("DINING HALL", 0, 3.45, Z + 0.04, { h: 0.2, color: "#2a2a26" });

  // the count board, chalk on black: who is where, live block
  const serving = CAST.filter((c) => c.id).length;
  const released = CAST.filter((c) => c.tag[0] === "RELEASED" || c.tag[0] === "PARDONED").length;
  const board = k.picture(2.4, 1.5, (g, W, H) => {
    g.fillStyle = "#1c2420";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#6a5030";
    g.lineWidth = 14;
    g.strokeRect(0, 0, W, H);
    g.fillStyle = "#e8eadf";
    g.font = '700 40px "Marker Felt", "Comic Sans MS", sans-serif';
    g.fillText("COUNT", 30, 56);
    g.font = '500 26px "Marker Felt", "Comic Sans MS", sans-serif';
    g.fillText(`BLOCK #${k.height ? k.height.toLocaleString("en-US") : "…"}`, W - 300, 56);
    const rows: [string, string][] = [
      ["B BLOCK", `${CAST.filter((c) => c.id && FACES[c.face].block === "B").length} famous`],
      ["C BLOCK", `${CAST.filter((c) => c.id && FACES[c.face].block === "C").length} famous`],
      ["D BLOCK", "isolation"],
      ["SERVING", `${serving}`],
      ["RELEASED", `${released}`],
      ["MEMPOOL", `${k.ctx.director.mempoolList().length} tx`],
    ];
    rows.forEach(([a, v], i) => {
      g.fillText(a, 34, 112 + i * 40);
      g.fillText(v, W * 0.55, 112 + i * 40);
    });
  }, -5.6, 2.1, Z + 0.04, 0, { px: 640 });
  k.ctx.onBlock(() => board.redraw());
  k.pick(board.mesh, "<b>Count board</b>", () => ({ eyebrow: "Times Square", title: "Count", stats: [["Serving", `${serving}`], ["Released", `${released}`], ["Block", k.height ? k.height.toLocaleString("en-US") : "…"]] }));
  // a drinking fountain, a fire hose cabinet
  b.box(k.porcelain, 0.45, 0.85, 0.35, 5.2, 0, Z + 0.2);
  b.box(k.steel, 0.06, 0.08, 0.06, 5.2, 0.85, Z + 0.25);
  k.solid[0].push([4.9, Z, 5.5, Z + 0.45]);
  b.box(new THREE.MeshStandardMaterial({ color: "#a01a1a", roughness: 0.5 }), 0.8, 1.0, 0.18, 7.2, 1.2, Z + 0.1);
  k.label("FIRE HOSE", 7.2, 2.35, Z + 0.2, { h: 0.12, color: "#a01a1a" });

  // the recreation yard door in the west wall: steel, a barred window full of daylight
  const X = HALL.x0 + 0.02;
  b.box(k.darkSteel, 0.12, 2.6, 1.5, X, 0, -38);
  b.box(k.darkSteel, 0.2, 0.14, 1.8, X, 2.6, -38);
  for (const z of [-38.82, -37.18]) b.box(k.darkSteel, 0.2, 2.74, 0.12, X, 0, z);
  const day = k.picture(0.6, 0.6, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "#cfe4f4");
    gr.addColorStop(0.65, "#f4f0e0");
    gr.addColorStop(0.66, "#b0a890");
    gr.addColorStop(1, "#8a8270");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }, X + 0.075, 1.9, -38, Math.PI / 2, { px: 128, glow: true });
  day.mesh.material.color = new THREE.Color(1.6, 1.6, 1.6);
  for (let q = -0.24; q <= 0.25; q += 0.12) k.bars.bar(X + 0.09, 1.6, -38 + q, X + 0.09, 2.2, -38 + q, 0.9);
  k.label("RECREATION YARD", X + 0.1, 3.0, -38, { h: 0.2, color: "#2a2a26", rot: Math.PI / 2 });
  k.hit(0.3, 2.6, 1.5, X + 0.1, 0, -38, "<b>Recreation yard</b><span>the door</span>", () => ({ eyebrow: "Door", title: "Recreation yard", tag: ["LOCKED", "warn"] }));
}

/** The dining hall: long tables, the serving line, the kitchen, tear gas canisters overhead. */
export function diningHall(k: PrisonKit) {
  const { b } = k;
  const D = DINING;
  const H = D.h;
  b.box(k.floorMat, D.x1 - D.x0, 0.1, D.z1 - D.z0, 0, -0.1, (D.z0 + D.z1) / 2);
  const ceil = new THREE.MeshStandardMaterial({ color: "#b4b2a4", roughness: 0.95 });
  b.box(ceil, D.x1 - D.x0, 0.3, D.z1 - D.z0, 0, H, (D.z0 + D.z1) / 2);
  const wins = [-56.1, -52.6, -49.1, -45.6];
  windowedWall(k, "x", D.x0 - 0.2, D.z0, D.z1, H, wins, 1.5, 1.5, 4.1, -1);
  windowedWall(k, "x", D.x1 + 0.2, D.z0, D.z1, H, wins, 1.5, 1.5, 4.1, 1);
  b.box(k.paintWall, D.x1 - D.x0, H, 0.4, 0, 0, D.z0 - 0.2);
  // the hall wall's back face, the door frame
  b.box(k.paintWall, D.x1 - D.x0, H, 0.05, 0, 0, D.z1 + 0.03);
  for (const s of [-1, 1]) b.box(k.darkSteel, 0.15, 3.2, 0.6, s * 1.57, 0, D.z1 + 0.15);
  // ceiling lights
  const tube = new THREE.MeshBasicMaterial({ color: new THREE.Color("#f2f6ee").multiplyScalar(1.8), toneMapped: false });
  const TX = [-12.4, -8.2, -4.0, 4.0, 8.2, 12.4],
    TZ = [-45.2, -48.6, -52.0, -55.4];
  for (const x of TX) for (const z of TZ) {
    b.box(k.darkSteel, 0.3, 0.06, 2.0, x, H - 0.08, z);
    b.box(tube, 0.12, 0.04, 1.8, x, H - 0.12, z);
  }
  // beams across the ceiling, a dark wainscot, pipes along the walls
  const beam = new THREE.MeshStandardMaterial({ color: "#a8a698", roughness: 0.9 });
  for (let z = D.z1 - 1.7; z > D.z0; z -= 3.4) b.box(beam, D.x1 - D.x0, 0.4, 0.35, 0, H - 0.4, z);
  for (const s of [-1, 1]) {
    b.geo(k.rust, new THREE.CylinderGeometry(0.06, 0.06, D.z1 - D.z0, 8).rotateX(Math.PI / 2).translate(s * 15.7, H - 0.6, (D.z0 + D.z1) / 2));
    b.geo(k.darkSteel, new THREE.CylinderGeometry(0.04, 0.04, D.z1 - D.z0, 8).rotateX(Math.PI / 2).translate(s * 15.7, H - 0.85, (D.z0 + D.z1) / 2));
  }

  // the tables (ten men each), benches either side, trays here and there
  const tray = new THREE.MeshStandardMaterial({ color: "#a8aca8", roughness: 0.35, metalness: 0.7 });
  const cup = k.porcelain;
  let n = 0;
  for (const x of TX)
    for (const z of TZ) {
      b.box(k.wood, 2.8, 0.06, 0.85, x, 0.74, z);
      for (const sx of [-1.25, 1.25]) for (const sz of [-0.32, 0.32]) b.box(k.darkSteel, 0.05, 0.74, 0.05, x + sx, 0, z + sz);
      for (const s of [-1, 1]) {
        b.box(k.wood, 2.8, 0.05, 0.3, x, 0.44, z + s * 0.68);
        for (const sx of [-1.2, 1.2]) b.box(k.darkSteel, 0.05, 0.44, 0.2, x + sx, 0, z + s * 0.68);
      }
      for (let q = 0; q < 5; q++)
        for (const s of [-1, 1])
          if ((n * 7 + q * 3 + s) % 4 !== 0) {
            b.box(tray, 0.36, 0.025, 0.26, x - 1.1 + q * 0.55, 0.8, z + s * 0.24);
            b.box(cup, 0.07, 0.09, 0.07, x - 1.0 + q * 0.55, 0.82, z + s * 0.3);
          }
      k.solid[0].push([x - 1.45, z - 0.85, x + 1.45, z + 0.85]);
      n++;
    }

  // the serving line and the kitchen behind its grille
  const ZS = -58.2;
  b.box(k.steel, 18, 0.95, 0.8, 0, 0, ZS);
  b.box(tray, 18, 0.04, 0.82, 0, 0.95, ZS);
  for (let x = -8; x <= 8; x += 1.6) {
    b.box(k.darkSteel, 1.2, 0.08, 0.5, x, 0.9, ZS);
    b.box(tray, 0.5, 0.18, 0.42, x - 0.3, 0.85, ZS);
  }
  b.box(k.paintWall, 18, H - 2.4, 0.2, 0, 2.4, ZS - 0.6);
  for (let x = -8.9; x <= 8.9; x += 0.15) k.bars.bar(x, 1.0, ZS - 0.6, x, 2.4, ZS - 0.6, 1);
  for (const s of [-1, 1]) b.box(k.paintWall, 6.85, H, 0.2, s * 12.6, 0, ZS - 0.6);
  // the kitchen: ranges, a great kettle, pots on shelves
  for (let x = -7; x <= 7; x += 3.5) {
    b.box(k.darkSteel, 2.4, 0.9, 0.9, x, 0, -61.3);
    b.box(new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff6a2a").multiplyScalar(1.4), toneMapped: false }), 2.2, 0.02, 0.6, x, 0.9, -61.3);
    b.geo(tray, new THREE.CylinderGeometry(0.25, 0.22, 0.35, 12).translate(x - 0.5, 1.1, -61.3));
    b.geo(tray, new THREE.CylinderGeometry(0.18, 0.18, 0.25, 12).translate(x + 0.6, 1.05, -61.3));
  }
  b.box(k.darkWood, 16, 0.04, 0.35, 0, 2.2, -61.8);
  for (let x = -7.5; x <= 7.5; x += 0.8) b.geo(tray, new THREE.CylinderGeometry(0.14, 0.12, 0.2, 10).translate(x, 2.34, -61.8));
  k.label("DINING HALL", 0, 3.7, ZS - 0.48, { h: 0.34, color: "#2a2a26" });
  k.solid[0].push([-9.2, ZS - 0.5, 9.2, ZS + 0.45]);
  // the menu board
  k.picture(1.4, 1.8, (g, W, Hh) => {
    g.fillStyle = "#1c2420";
    g.fillRect(0, 0, W, Hh);
    g.strokeStyle = "#6a5030";
    g.lineWidth = 12;
    g.strokeRect(0, 0, W, Hh);
    g.fillStyle = "#e8eadf";
    g.textAlign = "center";
    g.font = '700 44px "Marker Felt", "Comic Sans MS", sans-serif';
    g.fillText("MENU", W / 2, 70);
    g.font = '500 28px "Marker Felt", "Comic Sans MS", sans-serif';
    ["BREAKFAST", "", "dry cereal", "scrambled eggs", "stewed fruit", "toast · butter", "coffee", "", "SUPPER", "", "beef stew", "bread", "coffee"].forEach((l, i) => g.fillText(l, W / 2, 130 + i * 36));
  }, -13.5, 2.3, ZS - 0.48);

  // tear gas canisters in the ceiling, over every table
  const gas = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 12), new THREE.MeshStandardMaterial({ color: "#5a6650", roughness: 0.5, metalness: 0.5 }), 12);
  const band = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 12), new THREE.MeshStandardMaterial({ color: "#a82a1a", roughness: 0.5 }), 12);
  let gi = 0;
  const mm = new THREE.Matrix4();
  for (const x of [-10.3, -6.1, 6.1, 10.3])
    for (const z of [-46.9, -50.3, -53.7]) {
      mm.makeTranslation(x, H - 0.45, z);
      gas.setMatrixAt(gi, mm);
      mm.makeTranslation(x, H - 0.55, z);
      band.setMatrixAt(gi, mm);
      gi++;
      b.box(k.darkSteel, 0.05, 0.2, 0.05, x, H - 0.2, z);
      b.geo(k.darkSteel, new THREE.CylinderGeometry(0.03, 0.05, 0.1, 8).translate(x, H - 0.75, z));
    }
  k.root.add(gas, band);
  k.pick(gas, "<b>Tear gas canisters</b><span>in the ceiling</span>", () => ({ eyebrow: "Dining hall", title: "Tear gas canisters", tag: ["ARMED", "warn"], stats: [["Canisters", "12"], ["Over", "every table"]] }));

  // the reading room
  void F;
}

/** The library, at the end of Seedy Street. */
export function library(k: PrisonKit) {
  const { b } = k;
  const X0 = 9,
    X1 = HALL.x1 - 0.3,
    Z0 = HALL.z0 + 0.3,
    Z1 = -34.6,
    H = 3.4;
  b.box(k.paintWall, 0.4, H, Z1 - Z0 + 0.4, X0 - 0.2, 0, (Z0 + Z1) / 2 + 0.2);
  b.box(k.paintWall, 10.6 - (X0 - 0.4), H, 0.4, (X0 - 0.4 + 10.6) / 2, 0, Z1 + 0.2);
  b.box(k.paintWall, HALL.x1 - 12.2, H, 0.4, (12.2 + HALL.x1) / 2, 0, Z1 + 0.2);
  b.box(k.paintWall, 1.6, H - 2.4, 0.4, 11.4, 2.4, Z1 + 0.2);
  b.box(k.paintLow, 10.6 - (X0 - 0.4), 1.2, 0.42, (X0 - 0.4 + 10.6) / 2, 0, Z1 + 0.2);
  b.box(k.paintLow, HALL.x1 - 12.2, 1.2, 0.42, (12.2 + HALL.x1) / 2, 0, Z1 + 0.2);
  b.box(k.paintBlock, HALL.x1 - X0 + 0.4, 0.2, Z1 - Z0 + 0.6, (X0 + HALL.x1) / 2, H, (Z0 + Z1) / 2);
  b.box(new THREE.MeshStandardMaterial({ color: "#6a5040", roughness: 0.7 }), X1 - X0, 0.02, Z1 - Z0, (X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  k.label("LIBRARY", 11.4, 2.75, Z1 + 0.42, { h: 0.3, color: "#2a2a26" });
  // shelves round the walls, a checkout desk, a reading table
  for (let z = Z0 + 0.7; z < Z1 - 0.5; z += 1.2) k.put(`pshelf${Math.round(z)}`, () => F.bookshelf(Math.round(-z), 14), X1 - 0.22, 0, z, -Math.PI / 2);
  for (let x = X0 + 0.7; x < X1 - 0.8; x += 1.2) k.put(`pshelfN${Math.round(x)}`, () => F.bookshelf(Math.round(x * 3), 14), x, 0, Z0 + 0.22, 0);
  b.box(k.darkWood, 0.8, 0.06, 1.6, 10.1, 0.74, -36.2);
  b.box(k.wood, 0.7, 0.74, 1.5, 10.1, 0, -36.2);
  b.box(k.porcelain, 0.3, 0.02, 0.4, 10.1, 0.8, -36.5);
  for (let n = 0; n < 5; n++) b.box(k.items[n], 0.18, 0.04, 0.26, 10.1, 0.8 + n * 0.04, -35.8);
  k.solid[0].push([9.7, -37.0, 10.5, -35.4]);
  k.put("plibchair", () => F.chair("#5a4030"), 9.6, 0, -36.2, Math.PI / 2, null);
  k.put("plibtable", () => F.diningTable(6), 12.2, 0, -38.6);
  for (const [x, z, r] of [[11.4, -38.0, Math.PI], [13.0, -38.0, Math.PI], [11.4, -39.2, 0], [13.0, -39.2, 0]] as const) k.put("plibchair2", () => F.chair("#5a4030"), x, 0, z, r, null);
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff0d0").multiplyScalar(1.8), toneMapped: false });
  for (const z of [-36.5, -39.5]) {
    b.box(k.darkSteel, 0.02, 0.6, 0.02, 12.4, H - 0.6, z);
    b.geo(new THREE.MeshStandardMaterial({ color: "#2f4a3c", roughness: 0.4, side: THREE.DoubleSide }), new THREE.ConeGeometry(0.3, 0.22, 12, 1, true).translate(12.4, H - 0.65, z));
    b.geo(lamp, new THREE.SphereGeometry(0.08, 8, 6).translate(12.4, H - 0.8, z));
  }
  const books = [
    ["Zcash Protocol Specification", "Hopwood, Bowe, Hornby, Wilcox"],
    ["Zerocash: Decentralized Anonymous Payments from Bitcoin", "2014"],
    ["Bitcoin: A Peer-to-Peer Electronic Cash System", "Satoshi Nakamoto, 2008"],
    ["Recursive Proof Composition without a Trusted Setup", "Halo, 2019"],
    ["Birdman of Alcatraz", "Thomas E. Gaddis, 1955"],
  ];
  k.hit(0.6, 2, Z1 - Z0, X1 - 0.3, 0, (Z0 + Z1) / 2, "<b>Library</b><span>the shelves</span>", () => ({ eyebrow: "Library", title: "On the shelves", body: books.map(([t, a]) => `<p><b>${t}</b><br>${a}</p>`).join("") }));
  k.hit(X1 - X0 - 1.2, 2, 0.6, (X0 + X1) / 2, 0, Z0 + 0.3, "<b>Library</b><span>the shelves</span>", () => ({ eyebrow: "Library", title: "On the shelves", body: books.map(([t, a]) => `<p><b>${t}</b><br>${a}</p>`).join("") }));
}

/** The warden's office, by the street door: desk, files, the safe, the flag. */
export function wardenOffice(k: PrisonKit) {
  const { b } = k;
  const X0 = HALL.x0 + 0.3,
    X1 = -10.4,
    Z0 = -5.7,
    Z1 = -0.3,
    H = 3.2;
  b.box(k.paintWall, X1 - HALL.x0 + 0.4, H, 0.4, (HALL.x0 + X1 + 0.4) / 2, 0, Z0 - 0.2);
  b.box(k.paintWall, 0.4, H, 2.2, X1 + 0.2, 0, -5.0);
  b.box(k.paintWall, 0.4, H, 2.7, X1 + 0.2, 0, -1.35);
  b.box(k.paintWall, 0.4, H - 2.3, 1.2, X1 + 0.2, 2.3, -3.3);
  b.box(new THREE.MeshStandardMaterial({ color: "#ded8c6", roughness: 0.9 }), X1 - HALL.x0 + 0.4, 0.15, Z1 - Z0 + 0.6, (HALL.x0 + X1) / 2, H, (Z0 + Z1) / 2);
  const panel = new THREE.MeshStandardMaterial({ color: "#5a3e28", roughness: 0.55 });
  b.box(panel, X1 - X0, 1.1, 0.04, (X0 + X1) / 2, 0, Z0 + 0.02);
  b.box(panel, 0.04, 1.1, Z1 - Z0, X0 + 0.02, 0, (Z0 + Z1) / 2);
  b.box(new THREE.MeshStandardMaterial({ color: "#5a1a20", roughness: 0.95 }), 3.4, 0.02, 2.6, -13.1, 0, -3.2);
  b.box(new THREE.MeshStandardMaterial({ color: "#2a1a10", roughness: 0.5 }), X1 - X0, 0.01, Z1 - Z0, (X0 + X1) / 2, -0.005, (Z0 + Z1) / 2);
  k.label("WARDEN", X1 + 0.42, 2.45, -3.3, { h: 0.2, color: "#2a2a26", rot: Math.PI / 2 });
  // the desk, facing the door
  const oak = new THREE.MeshStandardMaterial({ color: "#6a4428", roughness: 0.45 });
  const leather = new THREE.MeshStandardMaterial({ color: "#3a1e14", roughness: 0.6 });
  b.box(oak, 0.95, 0.06, 1.9, -14.0, 0.72, -3.3);
  for (const z of [-4.0, -2.6]) {
    b.box(k.darkWood, 0.85, 0.7, 0.45, -14.0, 0.02, z);
    for (let d = 0; d < 3; d++) b.box(k.steel, 0.02, 0.025, 0.14, -14.44, 0.15 + d * 0.22, z);
  }
  b.box(k.darkWood, 0.05, 0.6, 0.95, -13.6, 0.1, -3.3);
  b.box(new THREE.MeshStandardMaterial({ color: "#2a4a30", roughness: 0.8 }), 0.6, 0.005, 0.8, -14.0, 0.78, -3.3);
  // his chair, high-backed leather; two plain chairs for visitors
  b.box(leather, 0.55, 0.12, 0.55, -14.85, 0.42, -3.3);
  b.box(leather, 0.12, 0.8, 0.55, -15.15, 0.5, -3.3);
  b.box(k.darkSteel, 0.06, 0.42, 0.06, -14.85, 0, -3.3);
  for (const z of [-3.9, -2.7]) {
    b.box(k.darkWood, 0.42, 0.05, 0.42, -12.8, 0.44, z);
    b.box(k.darkWood, 0.05, 0.5, 0.42, -12.6, 0.49, z);
    for (const dx of [-0.18, 0.18]) for (const dz of [-0.18, 0.18]) b.box(k.darkWood, 0.04, 0.44, 0.04, -12.8 + dx, 0, z + dz);
  }
  b.box(k.darkSteel, 0.34, 0.12, 0.28, -13.95, 0.78, -2.6);
  b.box(new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.4 }), 0.18, 0.08, 0.1, -13.8, 0.78, -3.95);
  b.box(new THREE.MeshStandardMaterial({ color: "#c9a227", roughness: 0.3, metalness: 0.8 }), 0.04, 0.1, 0.5, -13.56, 0.78, -3.3);
  for (let n = 0; n < 4; n++) b.box(k.items[(n + 2) % 6], 0.22, 0.03, 0.3, -14.1, 0.78 + n * 0.03, -2.0 + n * 0.01);
  const lampG = new THREE.MeshBasicMaterial({ color: new THREE.Color("#a8e0a0").multiplyScalar(1.3), toneMapped: false });
  b.box(k.darkSteel, 0.03, 0.35, 0.03, -14.2, 0.76, -4.0);
  b.box(lampG, 0.16, 0.08, 0.3, -14.15, 1.1, -4.0);
  k.label("WARDEN", -13.53, 0.83, -3.3, { h: 0.06, color: "#2a1a08", rot: Math.PI / 2 });
  // files, the safe, the flag
  for (let z = -5.2; z <= -4.0; z += 0.6) {
    b.box(new THREE.MeshStandardMaterial({ color: "#6a7060", roughness: 0.5, metalness: 0.5 }), 0.55, 1.35, 0.55, -11.1, 0, z);
    for (let d = 0; d < 4; d++) b.box(k.steel, 0.04, 0.03, 0.14, -11.4, 0.2 + d * 0.32, z);
  }
  k.solid[0].push([-11.4, -5.5, -10.8, -3.7]);
  b.box(new THREE.MeshStandardMaterial({ color: "#2a2a2a", roughness: 0.4, metalness: 0.7 }), 0.7, 0.9, 0.6, -15.2, 0, -0.9);
  b.box(new THREE.MeshStandardMaterial({ color: "#c9a227", roughness: 0.3, metalness: 0.8 }), 0.02, 0.12, 0.12, -14.84, 0.5, -0.9);
  k.solid[0].push([-15.6, -1.2, -14.8, -0.5]);
  k.posts.put(-15.2, 1.1, -5.1, 1.2, 2.2);
  k.picture(0.9, 0.6, (g, W, Hh) => {
    g.fillStyle = "#16161b";
    g.fillRect(0, 0, W, Hh);
    g.fillStyle = "#f4b728";
    g.beginPath();
    g.arc(W / 2, Hh / 2, Hh * 0.36, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#16161b";
    g.font = `900 ${Hh * 0.5}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("Z", W / 2, Hh / 2 + 4);
  }, -14.75, 1.75, -5.1, Math.PI / 2, { px: 256 });
  // a painting of the island, behind the desk
  k.picture(1.6, 1.0, (g, W, Hh) => {
    const sky = g.createLinearGradient(0, 0, 0, Hh);
    sky.addColorStop(0, "#9ab8d0");
    sky.addColorStop(0.6, "#e8dcc0");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, Hh);
    g.fillStyle = "#3a5a78";
    g.fillRect(0, Hh * 0.62, W, Hh);
    g.fillStyle = "#5a5040";
    g.beginPath();
    g.moveTo(W * 0.15, Hh * 0.66);
    g.lineTo(W * 0.3, Hh * 0.42);
    g.lineTo(W * 0.7, Hh * 0.4);
    g.lineTo(W * 0.85, Hh * 0.66);
    g.fill();
    g.fillStyle = "#e8e4d4";
    g.fillRect(W * 0.36, Hh * 0.3, W * 0.3, Hh * 0.12);
    g.fillRect(W * 0.7, Hh * 0.18, W * 0.03, Hh * 0.24);
    g.strokeStyle = "#6a4a20";
    g.lineWidth = 14;
    g.strokeRect(0, 0, W, Hh);
  }, X0 + 0.05, 1.9, -3.3, Math.PI / 2, { px: 512 });
  k.solid[0].push([-14.5, -4.1, -13.5, -2.5]);
  k.hit(1.0, 1.0, 1.6, -14.0, 0, -3.3, "<b>The warden's desk</b>", () => ({
    eyebrow: "Warden's office",
    title: "ZEC State Penitentiary",
    stats: [["Cells", `${FACES.reduce((s, f) => s + f.n * 3, 0)}`], ["Serving", `${CAST.filter((c) => c.id).length}`], ["Released", `${CAST.filter((c) => c.tag[0] === "RELEASED" || c.tag[0] === "PARDONED").length}`], ["Block", k.height ? k.height.toLocaleString("en-US") : "…"]],
  }));
}
