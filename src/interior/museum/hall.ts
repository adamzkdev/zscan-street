import * as THREE from "three";
import { API } from "../../data/zscan";
import { turnstile } from "../furniture";
import type { Rect } from "../types";
import type { Collection } from "./data";
import { num, zec } from "./data";
import { boxGeo, canvasTex, FACE, type MuseumKit } from "./kit";
import { coffers, limestone, stoneFloor } from "./look";
import { bandTexture, beamGeo, escalator, lifts, rodGeo, SANS, wayfinding } from "./parts";
import { banquette, bust, stonePyramid, ticketMachine } from "./voxels";

/**
 * Floor 0, the Hall Napoléon: the stone hall under the glass pyramid. You come in from the
 * Passage (+z); ahead the pyramid's lattice with the sky and the street through it, the spiral
 * staircase winding up round its open lift, the round information desk, the ticket barriers and
 * the escalators to the three wings (Denon, Richelieu, and Daru up to the Victory). Off the west
 * side, the Carrousel passage with the inverted pyramid.
 */

const X = 22,
  Z1 = -42,
  H = 9;
/** The pyramid: centre, half base, height. */
const PX = 0,
  PZ = -19,
  PB = 11,
  PH = 14.5;

export function hall(k: MuseumKit, data: Collection) {
  const f = 0;
  const g = k.groups[f];
  const stone = new THREE.MeshStandardMaterial({ map: limestone(), roughness: 0.85 });
  const stoneDark = new THREE.MeshStandardMaterial({ map: limestone("#b9ab90"), roughness: 0.8 });
  const ceil = new THREE.MeshStandardMaterial({ map: coffers(), roughness: 0.95 });
  const floorTex = stoneFloor();
  floorTex.repeat.set((2 * X) / 3, -Z1 / 3);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.32, metalness: 0.05, envMapIntensity: 0.9 });

  // ---- shell ---------------------------------------------------------------------------------
  k.plane(f, floorMat, 2 * X, -Z1, 0, 0, Z1 / 2);
  // walls (the west wall has the Carrousel passage at z −8…−4)
  k.wall(f, stone, -X, 0, X, 0, H, 0.6, 4);
  k.wall(f, stone, -X, Z1, X, Z1, H, 0.6, 4);
  k.wall(f, stone, X, 0, X, Z1, H, 0.6, 4);
  k.wall(f, stone, -X, Z1, -X, -8.5, H, 0.6, 4);
  k.wall(f, stone, -X, -3.5, -X, 0, H, 0.6, 4);
  k.box(f, stone, 0.6, H - 4, 5, -X, 4, -6, { uv: 4 });
  // ceiling with the square opening under the pyramid; its deep stone rim
  const T = 0.9;
  const ox0 = PX - PB,
    ox1 = PX + PB,
    oz0 = PZ - PB,
    oz1 = PZ + PB;
  k.box(f, ceil, 2 * X, T, -oz1, 0, H, oz1 / 2, { uv: 3 });
  k.box(f, ceil, 2 * X, T, oz0 - Z1, 0, H, (oz0 + Z1) / 2, { uv: 3 });
  k.box(f, ceil, ox0 + X, T, oz1 - oz0, (-X + ox0) / 2, H, PZ, { uv: 3 });
  k.box(f, ceil, X - ox1, T, oz1 - oz0, (X + ox1) / 2, H, PZ, { uv: 3 });
  // the opening's rim: a stone parapet and a glass balustrade up at street level
  for (const [w, d, x, z] of [
    [2 * PB + 0.6, 0.3, PX, oz1],
    [2 * PB + 0.6, 0.3, PX, oz0],
    [0.3, 2 * PB, ox0, PZ],
    [0.3, 2 * PB, ox1, PZ],
  ]) {
    k.box(f, stoneDark, w, 0.5, d, x, H - 0.5, z);
    k.box(f, k.steel, w, 0.08, d + 0.04, x, H + T, z);
  }
  // a bronze skirting and a stone string course round the hall
  for (const [x0, z0, x1, z1] of [
    [-X + 0.3, -0.3, X - 0.3, -0.3],
    [-X + 0.3, Z1 + 0.3, X - 0.3, Z1 + 0.3],
    [X - 0.3, 0, X - 0.3, Z1],
  ]) {
    const alongX = z0 === z1;
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    k.box(f, k.brass, alongX ? len : 0.08, 0.2, alongX ? 0.08 : len, (x0 + x1) / 2, 0, (z0 + z1) / 2);
    k.box(f, stoneDark, alongX ? len : 0.14, 0.18, alongX ? 0.14 : len, (x0 + x1) / 2, 6.2, (z0 + z1) / 2);
  }

  // ---- the glass pyramid -----------------------------------------------------------------------
  pyramid(k, f);

  // ---- the spiral staircase and its round lift ---------------------------------------------------
  const SX = 0,
    SZ = -12.4;
  const lift = spiral(k, f, SX, SZ);
  k.ticks[f].push((_, t) => {
    // up, wait, down, wait: 40 s a round
    const c = (t % 40) / 40;
    const y = c < 0.35 ? (c / 0.35) * H : c < 0.5 ? H : c < 0.85 ? H * (1 - (c - 0.5) / 0.35) : 0;
    const e = y; // linear is how the piston moves
    lift.platform.position.y = e;
    lift.piston.scale.y = Math.max(0.02, e / H);
  });

  // ---- the round information desk -------------------------------------------------------------
  const DX = 0,
    DZ = -24;
  const counter = new THREE.MeshStandardMaterial({ color: "#d8ccb4", roughness: 0.5 });
  k.geo(f, counter, new THREE.CylinderGeometry(2.7, 2.7, 1.1, 48, 1, true).translate(DX, 0.55, DZ));
  k.geo(f, counter, new THREE.CylinderGeometry(2.1, 2.1, 1.1, 48, 1, true).translate(DX, 0.55, DZ));
  k.geo(f, k.white, new THREE.RingGeometry(2.0, 2.85, 48).rotateX(-Math.PI / 2).translate(DX, 1.12, DZ));
  k.geo(f, k.brass, new THREE.TorusGeometry(2.85, 0.03, 6, 64).rotateX(Math.PI / 2).translate(DX, 1.1, DZ));
  // the gap the staff come in by, and the screens on the counter
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const sx = DX + Math.cos(a) * 2.35,
      sz = DZ + Math.sin(a) * 2.35;
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.03), k.black);
    scr.position.set(sx, 1.35, sz);
    scr.lookAt(DX + Math.cos(a) * 1.2, 1.3, DZ + Math.sin(a) * 1.2);
    g.add(scr);
  }
  // the totem in the middle: a column with the lit ring sign
  k.geo(f, k.steel, new THREE.CylinderGeometry(0.18, 0.18, 4.2, 12).translate(DX, 2.1, DZ));
  const ringTex = bandTexture("INFORMATION  ·  ACCUEIL  ·  zkSNARK MUSEUM", "#ffffff", "#2b2c31");
  ringTex.repeat.set(1, 1);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.6, 48, 1, true), new THREE.MeshBasicMaterial({ map: ringTex, toneMapped: false, side: THREE.DoubleSide }));
  ring.position.set(DX, 4.3, DZ);
  g.add(ring);
  k.geo(f, k.steel, new THREE.CylinderGeometry(1.62, 1.62, 0.05, 48).translate(DX, 4.0, DZ));
  k.geo(f, k.steel, new THREE.CylinderGeometry(1.62, 1.62, 0.05, 48).translate(DX, 4.6, DZ));
  k.solid(f, DX - 2.8, DZ - 2.8, DX + 2.8, DZ + 2.8);
  const deskHit = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 1.3, 24), new THREE.MeshBasicMaterial({ visible: false }));
  deskHit.position.set(DX, 0.65, DZ);
  g.add(deskHit);
  k.pick(f, deskHit, `<b>Information</b><span>the collection, the market</span>`, () => ({
    eyebrow: "Hall Napoléon · information",
    title: "zkSNARKs · the collection",
    tag: ["Zilkroad", "info"],
    stats: [
      ["Supply", num(data.supply)],
      ["Floor", zec(data.floor)],
      ["Listed", data.listings != null ? num(data.listings) : "—"],
      ["24h", data.sales24 != null ? `${data.sales24} · ${zec(data.volume24, 1)}` : "—"],
    ],
    panel: "cards",
  }));
  k.pool(f, DX, DZ, 4.5, "#fff2d8", 0.012, 0.8);

  // ---- ticket control: a line of gates, ticket machines on both walls -------------------------
  const TZ = -33.5;
  for (let x = -9; x <= 9; x += 1.15) {
    k.vox(f, "turnstile", turnstile, x, 0, TZ, 0, 0.5);
    k.solid(f, x - 0.12, TZ - 0.55, x + 0.12, TZ + 0.55);
  }
  for (const s of [-1, 1]) {
    k.box(f, k.glass, 1.2, 1.1, 0.04, s * 10.2, 0, TZ, { solid: true });
    k.box(f, k.chrome, 1.2, 0.05, 0.08, s * 10.2, 1.1, TZ);
    for (let i = 0; i < 4; i++) {
      const z = -26 - i * 1.4;
      k.vox(f, "ticket", ticketMachine, s * (X - 0.7), 0, z, s < 0 ? FACE.px : FACE.nx, 0.5);
      k.solid(f, s * (X - 0.7) - 0.4, z - 0.4, s * (X - 0.7) + 0.4, z + 0.4);
    }
    const tm = wayfinding(k, f, "BILLETS", "Tickets · e-tickets", "#f4b728", 2.6);
    tm.position.set(s * (X - 0.32), 3.0, -28.1);
    tm.rotation.y = s < 0 ? FACE.px : FACE.nx;
  }
  const ctl = wayfinding(k, f, "CONTRÔLE", "Accès aux collections", "#5ad8ff", 3.4);
  ctl.position.set(0, 3.2, TZ - 0.02);
  ctl.rotation.y = 0;
  k.box(f, k.steel, 0.1, 3.0, 0.1, -1.6, 0, TZ - 0.05);
  k.box(f, k.steel, 0.1, 3.0, 0.1, 1.6, 0, TZ - 0.05);

  // ---- the escalators to the wings ------------------------------------------------------------
  const MZ = 4.8; // mezzanine height
  // west: DENON (Grande Galerie)
  const denon = escalator(k, f, -12.5, -20.5, [-1, 0], 8.6, MZ, 1.2);
  escalator(k, f, -12.5, -18.6, [-1, 0], 8.6, MZ, 1.2);
  // east: RICHELIEU (Napoleon III apartments)
  const rich = escalator(k, f, 12.5, -20.5, [1, 0], 8.6, MZ, 1.2);
  escalator(k, f, 12.5, -18.6, [1, 0], 8.6, MZ, 1.2);
  // north, past the ticket gates: DARU (the Victory, the Salle des États)
  const daru = escalator(k, f, -0.95, -34.8, [0, -1], 6.9, MZ * 0.62, 1.2);
  escalator(k, f, 0.95, -34.8, [0, -1], 6.9, MZ * 0.62, 1.2);
  for (const [hit, to] of [
    [denon, 1],
    [rich, 3],
    [daru, 2],
  ] as const) {
    const names = ["", "DENON · Grande Galerie", "DARU · Victoire, Salle des États", "RICHELIEU · Appartements Napoléon III"];
    k.pick(f, hit, `<b>${names[to]}</b><span>escalator</span>`, () => ({ eyebrow: "Escalator", title: names[to], floor: to }));
  }
  // mezzanine landings with their portals and wing signs
  const mezz = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    k.box(f, stoneDark, x1 - x0, 0.4, z1 - z0, (x0 + x1) / 2, y - 0.4, (z0 + z1) / 2, { uv: 4 });
    k.solid(f, x0, z0, x1, z1);
  };
  mezz(-X, -24, -X + 1.6, -15, MZ);
  mezz(X - 1.6, -24, X, -15, MZ);
  mezz(-3, Z1, 3, Z1 + 1.4, MZ * 0.62);
  const portal = (x: number, y: number, z: number, yaw: number, w: number, h: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), k.lit("#ffe9c4", 1.3));
    p.position.set(x, y + h / 2, z);
    p.rotation.y = yaw;
    g.add(p);
    // a bronze frame
    const nx = Math.sin(yaw),
      nz = Math.cos(yaw);
    const rx = Math.cos(yaw),
      rz = -Math.sin(yaw);
    for (const s of [-1, 1]) k.box(f, k.brass, Math.abs(rz) * 0.2 + Math.abs(nz) * 0.0 + 0.2 * Math.abs(rx), h, 0.2, x + rx * s * (w / 2 + 0.1) + nx * 0.05, y, z + rz * s * (w / 2 + 0.1) + nz * 0.05);
    k.box(f, k.brass, Math.abs(rx) * (w + 0.4) + 0.2 * Math.abs(rz), 0.25, Math.abs(rz) * (w + 0.4) + 0.2 * Math.abs(rx), x + nx * 0.05, y + h, z + nz * 0.05);
  };
  portal(-X + 0.4, MZ, -19.5, FACE.px, 3.4, 3.2);
  portal(X - 0.4, MZ, -19.5, FACE.nx, 3.4, 3.2);
  portal(0, MZ * 0.62, Z1 + 0.4, FACE.pz, 4, 3.4);
  const wd = wayfinding(k, f, "DENON", "Grande Galerie · Joconde · Victoire", "#e8453c", 4.2);
  wd.position.set(-X + 0.4, MZ + 4.0, -19.5);
  wd.rotation.y = FACE.px;
  const wr = wayfinding(k, f, "RICHELIEU", "Appartements Napoléon III", "#3a9a5a", 4.2);
  wr.position.set(X - 0.4, MZ + 4.0, -19.5);
  wr.rotation.y = FACE.nx;
  const wy = wayfinding(k, f, "DARU", "Victoire · Salle des États", "#4a7ad8", 4.2);
  wy.position.set(0, MZ * 0.62 + 4.0, Z1 + 0.4);
  // glass balustrades along the mezzanines
  for (const s of [-1, 1]) {
    k.box(f, k.glass, 0.04, 1.0, 9, s * (X - 1.6), MZ, -19.5);
    k.box(f, k.chrome, 0.06, 0.05, 9, s * (X - 1.6), MZ + 1.0, -19.5);
  }

  // ---- the lifts, by the entrance -------------------------------------------------------------
  lifts(k, f, 14, -0.32, FACE.nz, 2.3);
  const lw = wayfinding(k, f, "ASCENSEURS", "Lifts · all levels", "#f4b728", 3.0);
  lw.position.set(14, 4.4, -0.33);
  lw.rotation.y = FACE.nz;
  // the entrance: glass doors in bronze under a lit transom
  for (const x of [-3.6, -1.2, 1.2, 3.6]) {
    k.box(f, k.glass, 2.3, 3.0, 0.05, x, 0, -0.33);
    k.box(f, k.brass, 0.1, 3.0, 0.12, x - 1.15, 0, -0.33);
  }
  k.box(f, k.brass, 9.8, 0.2, 0.14, 0, 3.0, -0.33);
  const passage = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 2.9), k.lit("#fff0d8", 0.9));
  passage.position.set(0, 1.5, -0.29);
  g.add(passage);
  const welcome = k.panel(f, 2048, 200, 14, (c, w, h) => {
    c.fillStyle = "#8a6a3a";
    c.font = `400 120px ${SANS}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("M U S É E   D U   z k S N A R K", w / 2, h / 2);
  });
  welcome.position.set(0, 5.4, -0.33);
  welcome.rotation.y = FACE.nz;

  // ---- exhibition banners: the house's rarest, hung tall on the stone ---------------------------
  for (const [x, z, yaw, rank, accent] of [
    [-6.5, Z1 + 0.42, FACE.pz, 1, "#7a1622"],
    [6.5, Z1 + 0.42, FACE.pz, 2, "#1a3a6a"],
    [-X + 0.42, -32, FACE.px, 3, "#2a4a2a"],
    [X - 0.42, -32, FACE.nx, 4, "#4a2a5a"],
    [-X + 0.42, -11.5, FACE.px, 5, "#6a4a1a"],
    [X - 0.42, -11.5, FACE.nx, 6, "#1a4a4a"],
  ] as const)
    banner(k, f, data, x, 5.2, z, yaw, rank, accent);

  // ---- the Carrousel passage and the inverted pyramid ---------------------------------------------
  carrousel(k, f, stone, stoneDark, floorMat);

  // ---- sculpture on the hall's edges, benches -------------------------------------------------
  for (const [x, z, yaw, seed] of [
    [-X + 1.2, -30, FACE.px, 1],
    [-X + 1.2, -36, FACE.px, 2],
    [X - 1.2, -30, FACE.nx, 3],
    [X - 1.2, -36, FACE.nx, 4],
    [-X + 1.2, -11, FACE.px, 5],
  ] as const) {
    k.vox(f, `bust${seed}`, () => bust(seed), x, 0, z, yaw, 0.5);
    k.solid(f, x - 0.4, z - 0.4, x + 0.4, z + 0.4);
    k.pool(f, x, z, 1.2, "#ffe6c0");
  }
  for (const [x, z] of [
    [-15, -9],
    [15, -9],
    [-15, -28],
    [15, -28],
  ]) {
    k.vox(f, "banq", () => banquette(2.4), x, 0, z, 0, 0.5);
    k.solid(f, x - 1.2, z - 0.35, x + 1.2, z + 0.35);
  }

  // ---- daylight: a bright square under the pyramid, warm lights in the corners ----------------
  k.pool(f, PX, PZ, 13, "#fff6e0", 0.01, 0.9);
  k.pool(f, PX, PZ, 7, "#ffffff", 0.011, 0.6);
  k.light(f, -12, 7.5, -8, "#ffe8c8", 40, 26);
  k.light(f, 12, 7.5, -8, "#ffe8c8", 40, 26);
  k.light(f, -12, 7.5, -32, "#ffe8c8", 40, 26);
  k.light(f, 12, 7.5, -32, "#ffe8c8", 40, 26);
  k.light(f, 0, 14, PZ, "#fff4e0", 60, 40);
  k.light(f, -38, 5, -6, "#ffe0b0", 30, 18);
  // wall washes
  for (let z = -4; z > Z1; z -= 4) {
    k.wash(f, -X + 0.31, z, FACE.px, 3.2, 4.5, H - 0.1, "#fff0d8");
    k.wash(f, X - 0.31, z, FACE.nx, 3.2, 4.5, H - 0.1, "#fff0d8");
  }

  // ---- visitors ----------------------------------------------------------------------------------
  let n = 0;
  const id = () => k.visitor(100 + n++);
  const strolls: [number, number][] = [
    [-8, -6],
    [8, -6],
    [-9, -16],
    [9, -16],
    [-7, -28],
    [7, -28],
    [-16, -12],
    [16, -12],
    [-16, -30],
    [16, -30],
  ];
  for (let i = 0; i < 12; i++) void k.person(f, id(), strolls[i % strolls.length], { wander: strolls, item: i % 4 === 0 ? "bag" : i % 5 === 0 ? "coffee" : undefined });
  // the queue at the information desk
  for (let i = 0; i < 5; i++) void k.person(f, id(), [DX + 3.2 + i * 0.75, DZ + 1.6 + i * 0.25], { face: [DX, DZ] });
  // staff inside the desk
  void k.person(f, id(), [DX - 0.7, DZ + 0.9], { face: [DX - 2, DZ + 3] });
  void k.person(f, id(), [DX + 0.9, DZ - 0.6], { face: [DX + 3, DZ - 2] });
  // a tour group round its guide (the guide's umbrella held up)
  void k.person(f, id(), [-8, -12], { face: [-5, -12] }).then((s) => s?.setUmbrella("#e8453c"));
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + i * 0.36;
    void k.person(f, id(), [-8 + Math.cos(a) * 2.2, -12 + Math.sin(a) * 2.2], { face: [-8, -12], phone: i === 2 });
  }
  // people at the gates and the ticket machines, a couple on the benches
  for (const x of [-3.45, 0, 2.3]) void k.person(f, id(), [x, TZ + 1.4], { face: [x, TZ - 3] });
  void k.person(f, id(), [-(X - 1.6), -27.4], { face: [-X, -27.4] });
  void k.person(f, id(), [X - 1.6, -29], { face: [X, -29] });
  void k.person(f, id(), [-15.4, -9], { perch: 0.5, face: [-15.4, -4] });
  void k.person(f, id(), [15.3, -28], { perch: 0.5, face: [15.3, -20] });
  // and guards
  void k.person(f, id(), [-10, -33], { guard: true, face: [-10, -28] });
  void k.person(f, id(), [10, -33], { guard: true, face: [10, -28] });
  void k.person(f, id(), [3.6, -9.5], { guard: true, face: [3.6, -4] });

  k.finish(f);
  return { spawn: new THREE.Vector3(0, 0, -2.6), yaw: 0 };
}

/** A tall exhibition banner: the portrait of the zkSNARK at `rank`, its name, the house's name. */
function banner(k: MuseumKit, f: number, data: Collection, x: number, y: number, z: number, yaw: number, rank: number, accent: string) {
  const W = 512,
    Hh = 1280;
  const t = canvasTex(W, Hh, () => {}, { repeat: false });
  t.magFilter = THREE.NearestFilter;
  const c = (t.image as HTMLCanvasElement).getContext("2d")!;
  const draw = (img: HTMLImageElement | null, title: string, sub: string) => {
    c.fillStyle = accent;
    c.fillRect(0, 0, W, Hh);
    c.fillStyle = "#000";
    c.fillRect(24, 24, W - 48, W - 48);
    if (img) {
      c.imageSmoothingEnabled = false;
      c.drawImage(img, 24, 24, W - 48, W - 48);
    }
    c.fillStyle = "#ffffff";
    c.textAlign = "center";
    c.font = `300 44px ${SANS}`;
    c.fillText("M U S É E   D U   z k S N A R K", W / 2, W + 50);
    c.fillRect(W / 2 - 60, W + 80, 120, 3);
    c.font = `700 92px ${SERIF}`;
    c.fillText(title, W / 2, W + 230);
    c.font = `400 46px ${SANS}`;
    c.fillText(sub, W / 2, W + 310);
    c.font = `italic 400 40px ${SERIF}`;
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.fillText("Hall Napoléon · Denon · Richelieu", W / 2, Hh - 70);
    t.needsUpdate = true;
  };
  draw(null, "", "");
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 6), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  k.groups[f].add(m);
  // the hanging rod
  const rx = Math.cos(yaw),
    rz = -Math.sin(yaw);
  k.geo(f, k.steel, beamGeo(new THREE.Vector3(x - rx * 1.35, y + 3.05, z - rz * 1.35), new THREE.Vector3(x + rx * 1.35, y + 3.05, z + rz * 1.35), 0.06, 0.06));
  let id: number | null = null;
  void data.ready.then(async () => {
    const it = data.atRank(rank);
    if (!it) return;
    id = it.id;
    draw(null, `#${it.id}`, `Rank ${rank}`);
    await k.whenVisited(f);
    const img = await k.image(`${API}/v1/collections/zksnarks/items/${it.id}/image`).catch(() => null);
    draw(img, `#${it.id}`, `Rank ${rank}`);
  });
  k.pick(
    f,
    m,
    () => (id ? data.hover(id) : null),
    () => (id ? data.info(id, "Hall Napoléon") : null),
  );
}

/** The glass pyramid over the opening: lattice faces, glass, steel edges, the inner tension truss. */
function pyramid(k: MuseumKit, f: number) {
  const g = k.groups[f];
  const base = H + 0.9;
  const apex = new THREE.Vector3(PX, base + PH, PZ);
  const corners = [
    new THREE.Vector3(PX - PB, base, PZ + PB),
    new THREE.Vector3(PX + PB, base, PZ + PB),
    new THREE.Vector3(PX + PB, base, PZ - PB),
    new THREE.Vector3(PX - PB, base, PZ - PB),
  ];
  const lattice = canvasTex(
    1024,
    1024,
    (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = "#ffffff";
      c.lineWidth = 5;
      const N = 18;
      for (let i = -N; i <= 2 * N; i++) {
        const x = (i * w) / N;
        // lines parallel to each sloping edge: rhombus panes as on the Louvre's pyramid
        c.beginPath();
        c.moveTo(x, h);
        c.lineTo(x + w / 2, 0);
        c.stroke();
        c.beginPath();
        c.moveTo(x, h);
        c.lineTo(x - w / 2, 0);
        c.stroke();
      }
      c.lineWidth = 14;
      c.beginPath();
      c.moveTo(0, h - 4);
      c.lineTo(w, h - 4);
      c.stroke();
    },
    { repeat: false },
  );
  const latMat = new THREE.MeshStandardMaterial({ color: "#3c4048", roughness: 0.4, metalness: 0.8, alphaMap: lattice, alphaTest: 0.4, side: THREE.DoubleSide, transparent: false });
  lattice.colorSpace = THREE.NoColorSpace;
  const glassMat = new THREE.MeshStandardMaterial({ color: "#d8eaf2", roughness: 0.03, metalness: 0.6, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 });
  const pos: number[] = [],
    uv: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i],
      b = corners[(i + 1) % 4];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, apex.x, apex.y, apex.z);
    uv.push(0, 0, 1, 0, 0.5, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const lat = new THREE.Mesh(geo, latMat);
  const gl = new THREE.Mesh(geo, glassMat);
  gl.renderOrder = 4;
  lat.raycast = gl.raycast = () => {};
  g.add(lat, gl);
  // steel edges and the base ring
  for (let i = 0; i < 4; i++) {
    k.geo(f, k.steel, rodGeo(corners[i], apex, 0.12, 8));
    k.geo(f, k.steel, rodGeo(corners[i], corners[(i + 1) % 4], 0.14, 8));
  }
  // the tension truss inside each face: slender struts and cables a metre in, with nodes
  for (let i = 0; i < 4; i++) {
    const a = corners[i],
      b = corners[(i + 1) % 4];
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const inward = new THREE.Vector3(PX, base + PH * 0.3, PZ).sub(mid).normalize().multiplyScalar(0.9);
    for (let j = 1; j < 6; j++) {
      const t = j / 6;
      const p = a.clone().lerp(b, t);
      const top = p.clone().lerp(apex, 0.86);
      const q0 = p.clone().lerp(top, 0.25).add(inward),
        q1 = p.clone().lerp(top, 0.6).add(inward.clone().multiplyScalar(0.7));
      k.geo(f, k.chrome, rodGeo(p, q0, 0.02, 4));
      k.geo(f, k.chrome, rodGeo(q0, q1, 0.03, 4));
      k.geo(f, k.chrome, rodGeo(q1, top, 0.02, 4));
      k.geo(f, k.steel, new THREE.SphereGeometry(0.07, 6, 4).translate(q0.x, q0.y, q0.z));
      k.geo(f, k.steel, new THREE.SphereGeometry(0.07, 6, 4).translate(q1.x, q1.y, q1.z));
    }
  }
  // the entrance on the front face: a door frame and canopy at street level
  k.box(f, k.steel, 4.4, 0.2, 2.6, PX, base + 3.2, PZ + PB - 1.3);
  k.box(f, k.steel, 0.15, 3.2, 0.15, PX - 2.1, base, PZ + PB - 0.1);
  k.box(f, k.steel, 0.15, 3.2, 0.15, PX + 2.1, base, PZ + PB - 0.1);
  // the landing the spiral reaches, under the door
  k.box(f, new THREE.MeshStandardMaterial({ color: "#cfc2a8", roughness: 0.6 }), 4.4, 0.35, 3.6, PX, base - 0.35, PZ + PB - 1.8);
  k.box(f, k.glass, 4.4, 1.0, 0.04, PX, base, PZ + PB - 3.6);
}

/**
 * The spiral staircase: a helix of stone steps hanging round an open well, a solid curved stone
 * balustrade on both sides; the round lift (a platform on a hydraulic piston) in the well.
 */
function spiral(k: MuseumKit, f: number, cx: number, cz: number) {
  const ri = 1.7,
    ro = 3.9;
  const top = H + 0.9;
  const N = 44;
  const turns = 1.25;
  const a0 = Math.PI / 2 - turns * Math.PI * 2; // the top step points to +z, under the landing
  const stoneMat = new THREE.MeshStandardMaterial({ color: "#d4c8b0", roughness: 0.55 });
  const tread = new THREE.MeshStandardMaterial({ color: "#c2b498", roughness: 0.6 });
  const da = (turns * Math.PI * 2) / N;
  for (let i = 0; i < N; i++) {
    const a = a0 + da * (i + 0.5);
    const y = (top * (i + 1)) / N;
    const rm = (ri + ro) / 2;
    const step = new THREE.BoxGeometry(ro - ri, 0.36, rm * da * 1.08);
    step.rotateY(-a);
    step.translate(cx + Math.cos(a) * rm, y - 0.18, cz + Math.sin(a) * rm);
    k.geo(f, tread, step);
    // the stone underside: one thick sloping slab under each step
    const under = new THREE.BoxGeometry(ro - ri, 0.5, rm * da * 1.1);
    under.rotateY(-a);
    under.translate(cx + Math.cos(a) * rm, y - 0.7, cz + Math.sin(a) * rm);
    k.geo(f, stoneMat, under);
  }
  // balustrades: curved stone bands following the helix (segments), a brass handrail on the inner
  const M = 90;
  for (let i = 0; i < M; i++) {
    const t0 = i / M,
      t1 = (i + 1) / M;
    const a = a0 + turns * Math.PI * 2 * t0,
      b = a0 + turns * Math.PI * 2 * t1;
    for (const [r, hgt, th] of [
      [ro - 0.08, 1.05, 0.16],
      [ri + 0.06, 1.0, 0.12],
    ]) {
      const p = new THREE.Vector3(cx + Math.cos(a) * r, top * t0 - 0.4, cz + Math.sin(a) * r);
      const q = new THREE.Vector3(cx + Math.cos(b) * r, top * t1 - 0.4, cz + Math.sin(b) * r);
      k.geo(f, stoneMat, beamGeo(p.clone().setY(p.y + (hgt + 0.4) / 2), q.clone().setY(q.y + (hgt + 0.4) / 2), th, hgt + 0.9));
      if (r < 2) k.geo(f, k.brass, beamGeo(p.clone().setY(p.y + hgt + 0.85), q.clone().setY(q.y + hgt + 0.85), 0.07, 0.06));
    }
  }
  // ---- walking it: the height under you follows the helix; on its 1.25 turns the step you are on
  // is the candidate nearest the height you stood at. Colliders: the lift well, the outer
  // balustrade as a ring of posts, with the way in open while you are low and the way out to the
  // landing open while you are high (the same array the walker reads is swapped in place).
  const T = Math.PI * 2;
  k.solid(f, cx - ri + 0.5, cz - ri + 0.5, cx + ri - 0.5, cz + ri - 0.5);
  const post = (a: number, r = ro + 0.1, s = 0.25): Rect => [cx + Math.cos(a) * r - s, cz + Math.sin(a) * r - s, cx + Math.cos(a) * r + s, cz + Math.sin(a) * r + s];
  const norm = (a: number) => ((a % T) + T) % T;
  const ring = (skip: (a: number) => boolean) => {
    const out: Rect[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * T;
      if (!skip(norm(a))) out.push(post(a));
    }
    return out;
  };
  const ENTRY0 = T - 0.9; // the way in: just before the first step (angle 0, on the +x side)
  const low: Rect[] = [...ring((a) => a > ENTRY0 - 0.05), ...[1.9, 2.6, 3.3].map((r) => post(ENTRY0, r, 0.3))];
  const LX = 2.2,
    LZ1 = PZ + PB; // the landing: x ±2.2, up to the pyramid's door
  const high: Rect[] = [...ring((a) => Math.abs(a - Math.PI / 2) < 0.42), [-LX - 0.3, cz + ro - 1, -LX, LZ1 + 0.2], [LX, cz + ro - 1, LX + 0.3, LZ1 + 0.2], [-LX, LZ1, LX, LZ1 + 0.2]];
  const rects = k.rects[f];
  let mode: "low" | "high" = "low";
  rects.push(...low);
  const swap = (to: "low" | "high") => {
    if (to === mode) return;
    for (const r of to === "low" ? high : low) rects.splice(rects.indexOf(r), 1);
    rects.push(...(to === "low" ? low : high));
    mode = to;
  };
  let last = 0;
  k.grounds[f].push((x, z) => {
    const dx = x - cx,
      dz = z - cz;
    const r = Math.hypot(dx, dz);
    let h: number | null = null;
    if (last > top - 1.5 && Math.abs(x) < LX && z > cz + ro - 1.2 && z < LZ1 + 0.2) h = top;
    else if (r > ri - 0.2 && r < ro + 0.3) {
      const base = norm(Math.atan2(dz, dx) - a0) / T; // turns past the first step, in [0, 1)
      let best: number | null = null;
      for (const t of [base, base + 1]) {
        if (t > turns) continue;
        const i = Math.min(N - 1, Math.floor((t / turns) * N));
        const y = (top * (i + 1)) / N;
        if (best === null || Math.abs(y - last) < Math.abs(best - last)) best = y;
      }
      if (best !== null && Math.abs(best - last) < 1.2) h = best;
    }
    // walked off (or never on): the hall floor
    last = h ?? 0;
    swap(last > top / 2 ? "high" : "low");
    return h;
  });
  // the lift: a round platform with a glass parapet on a chrome piston
  const platform = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.18, 32), new THREE.MeshStandardMaterial({ color: "#c8ccd4", roughness: 0.25, metalness: 0.8 }));
  disc.position.y = -0.09;
  const par = new THREE.Mesh(new THREE.CylinderGeometry(1.33, 1.33, 1.05, 32, 1, true), k.glass);
  par.position.y = 0.52;
  const rail = new THREE.Mesh(new THREE.TorusGeometry(1.33, 0.03, 6, 40).rotateX(Math.PI / 2), k.chrome);
  rail.position.y = 1.06;
  platform.add(disc, par, rail);
  const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, H, 20).translate(0, H / 2, 0), k.chrome);
  piston.position.set(cx, 0, cz);
  platform.position.set(cx, 0, cz);
  k.groups[f].add(platform, piston);
  // the floor ring the piston rises from
  k.geo(f, k.steel, new THREE.CylinderGeometry(1.45, 1.45, 0.04, 32).translate(cx, 0, cz));
  return { platform, piston };
}

/** The Carrousel passage: a stone corridor west to the room of the inverted pyramid and the shop. */
function carrousel(k: MuseumKit, f: number, stone: THREE.Material, stoneDark: THREE.Material, floorMat: THREE.Material) {
  const g = k.groups[f];
  const h = 5.5;
  // corridor x −34…−22, z −8.5…−3.5
  k.wall(f, stone, -34, -8.5, -X, -8.5, h, 0.4, 4);
  k.wall(f, stone, -34, -3.5, -X, -3.5, h, 0.4, 4);
  k.plane(f, floorMat, 12, 5, -28, 0.002, -6);
  k.box(f, new THREE.MeshStandardMaterial({ color: "#cbbfa6", roughness: 0.95 }), 12.6, 0.3, 5.4, -28, h, -6);
  for (let x = -33; x < -22; x += 2.5) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.3), k.lit("#fff0d8", 1.5));
    l.position.set(x, h - 0.03, -6);
    g.add(l);
  }
  const sign = (k as MuseumKit).panel(f, 1024, 220, 3.4, (c, w, h2) => {
    c.fillStyle = "#26272b";
    c.fillRect(0, 0, w, h2);
    c.fillStyle = "#ffffff";
    c.font = `700 84px ${SANS}`;
    c.textBaseline = "middle";
    c.fillText("CARROUSEL", 40, 80);
    c.font = `400 50px ${SANS}`;
    c.fillStyle = "#c9c9cc";
    c.fillText("Pyramide inversée · Boutique", 40, 160);
  });
  sign.position.set(-X - 0.31, 6.6, -6);
  sign.rotation.y = FACE.px;
  // the room: x −48…−34, z −16…4, ceiling 6 m with the skylight square in the middle
  const R0 = -48,
    R1 = -34,
    RZ0 = -16,
    RZ1 = 4,
    RH = 6.5;
  k.wall(f, stone, R0, RZ0, R1, RZ0, RH, 0.5, 4);
  k.wall(f, stone, R0, RZ1, R1, RZ1, RH, 0.5, 4);
  k.wall(f, stone, R0, RZ0, R0, RZ1, RH, 0.5, 4);
  k.wall(f, stone, R1, RZ0, R1, -8.7, RH, 0.5, 4);
  k.wall(f, stone, R1, -3.3, R1, RZ1, RH, 0.5, 4);
  k.box(f, stone, 0.5, RH - h, 5.2, R1, h, -6, { uv: 4 });
  k.plane(f, floorMat, R1 - R0, RZ1 - RZ0, (R0 + R1) / 2, 0.002, (RZ0 + RZ1) / 2);
  const cx = (R0 + R1) / 2,
    cz = -6;
  const ceil = new THREE.MeshStandardMaterial({ color: "#cbbfa6", roughness: 0.95 });
  const S = 3.2; // half side of the skylight square
  k.box(f, ceil, R1 - R0, 0.4, cz - S - RZ0, cx, RH, (RZ0 + cz - S) / 2);
  k.box(f, ceil, R1 - R0, 0.4, RZ1 - cz - S, cx, RH, (RZ1 + cz + S) / 2);
  k.box(f, ceil, cx - S - R0, 0.4, 2 * S, (R0 + cx - S) / 2, RH, cz);
  k.box(f, ceil, R1 - cx - S, 0.4, 2 * S, (R1 + cx + S) / 2, RH, cz);
  // the inverted pyramid: point down, glass and lattice, hanging in the skylight
  const top = RH + 0.2,
    tip = 1.9;
  const corners = [
    new THREE.Vector3(cx - S, top, cz + S),
    new THREE.Vector3(cx + S, top, cz + S),
    new THREE.Vector3(cx + S, top, cz - S),
    new THREE.Vector3(cx - S, top, cz - S),
  ];
  const apex = new THREE.Vector3(cx, tip, cz);
  const pos: number[] = [],
    uv: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i],
      b = corners[(i + 1) % 4];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, apex.x, apex.y, apex.z);
    uv.push(0, 1, 1, 1, 0.5, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const glass = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#e0f0f8", roughness: 0.02, metalness: 0.7, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2 }));
  glass.renderOrder = 4;
  glass.raycast = () => {};
  g.add(glass);
  for (let i = 0; i < 4; i++) {
    k.geo(f, k.steel, rodGeo(corners[i], apex, 0.05, 6));
    k.geo(f, k.steel, rodGeo(corners[i], corners[(i + 1) % 4], 0.08, 6));
    // the diamond grid of each face, a few bars down to the point
    for (let j = 1; j < 6; j++) {
      const t = j / 6;
      const p = corners[i].clone().lerp(corners[(i + 1) % 4], t);
      k.geo(f, k.steel, rodGeo(p, apex.clone().lerp(p, 0.04), 0.015, 4));
      const ring0 = corners[i].clone().lerp(apex, t),
        ring1 = corners[(i + 1) % 4].clone().lerp(apex, t);
      k.geo(f, k.steel, rodGeo(ring0, ring1, 0.015, 4));
    }
  }
  // the sky above the skylight
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2 * S, 2 * S), k.lit("#e8f2ff", 1.2, "sky"));
  sky.rotation.x = Math.PI / 2;
  sky.position.set(cx, RH + 0.4, cz);
  g.add(sky);
  // the little stone pyramid under its point, and a ring of brass posts
  k.vox(f, "stonepyr", stonePyramid, cx, 0, cz, 0, 0.5);
  k.solid(f, cx - 1.2, cz - 1.2, cx + 1.2, cz + 1.2);
  k.pool(f, cx, cz, 4, "#f0f6ff", 0.012, 1.2);
  // the museum shop on the south side of the room: lit windows of zkSNARK prints
  const shopZ = RZ1 - 0.26;
  for (let i = 0; i < 3; i++) {
    const x = R0 + 2.8 + i * 4.4;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3), k.lit("#fff4e0", 1.1));
    win.position.set(x, 1.7, shopZ);
    win.rotation.y = FACE.nz;
    g.add(win);
    k.hang(f, { x, y: 1.9, z: shopZ - 0.03, yaw: FACE.nz, s: 0.9, rank: 140 + i * 37, tone: 2, label: "none" });
    k.box(f, k.black, 3.9, 0.2, 0.2, x, 3.2, shopZ - 0.05);
  }
  const shop = k.panel(f, 1024, 160, 4.4, (c, w, h2) => {
    c.fillStyle = "#16161a";
    c.fillRect(0, 0, w, h2);
    c.fillStyle = "#f4b728";
    c.font = `600 96px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Boutique du Musée", w / 2, h2 / 2 + 4);
  });
  shop.position.set(R0 + 7.2, 3.85, shopZ - 0.04);
  shop.rotation.y = FACE.nz;
  // a few people round the point
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    void k.person(f, k.visitor(400 + i), [cx + Math.cos(a) * 2.6, cz + Math.sin(a) * 2.6], { face: [cx, cz], phone: i === 1 });
  }
  void k.person(f, k.visitor(410), [-30, -5.2], { wander: [[-30, -5], [-40, -10], [-38, 0], [-26, -6]] });
  void k.person(f, k.visitor(411), [-44, 1.6], { face: [-44, 4] });
  void stoneDark;
}

const SERIF = '"Times New Roman", Georgia, serif';
void boxGeo;
