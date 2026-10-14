import * as THREE from "three";
import { API } from "../../data/zscan";
import { turnstile } from "../furniture";
import type { Rect } from "../types";
import type { Collection } from "./data";
import { num, zec } from "./data";
import { boxGeo, canvasTex, FACE, type MuseumKit } from "./kit";
import { coffers, damask, goldMosaic, limestone, paintedCeiling, skylight, stoneFloor, versailles } from "./look";
import { bandTexture, beamGeo, escalator, FLOORS, rodGeo, SANS, wayfinding } from "./parts";
import { banquette, bust, stonePyramid, ticketMachine, wingedVictory } from "./voxels";
import { memePoster } from "../../scene/memes";
import { nextMeme } from "../../scene/memewalls";

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
/** The wings' doorways up on their landings: Denon west, Richelieu east (centred on z = WZ), Daru north. */
const WZ = -19.55,
  MZ = 4.8,
  DY = MZ * 0.62,
  DW = 1.7,
  DWD = 1.8;

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
  // (the doorways of the three wings are left open here: wing() fills round them)
  k.wall(f, stone, -X, 0, X, 0, H, 0.6, 4);
  const span = (mat: THREE.Material, alongX: boolean, at: number, a0: number, a1: number) =>
    k.box(f, mat, alongX ? a1 - a0 : 0.6, H, alongX ? 0.6 : a1 - a0, alongX ? (a0 + a1) / 2 : at, 0, alongX ? at : (a0 + a1) / 2, { solid: true, uv: 4 });
  span(stone, true, Z1, -X - 0.3, -DWD);
  span(stone, true, Z1, DWD, X + 0.3);
  span(stone, false, X, Z1 - 0.3, WZ - DW);
  span(stone, false, X, WZ + DW, 0.3);
  span(stone, false, -X, Z1 - 0.3, WZ - DW);
  span(stone, false, -X, WZ + DW, -8.2);
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
  // (the course stops either side of the Richelieu and Daru doorways' bronze frames)
  for (const [x0, z0, x1, z1, gap0, gap1] of [
    [-X + 0.3, -0.3, X - 0.3, -0.3, 0, 0],
    [-X + 0.3, Z1 + 0.3, X - 0.3, Z1 + 0.3, -DWD - 0.3, DWD + 0.3],
    [X - 0.3, 0, X - 0.3, Z1, WZ + DW + 0.3, WZ - DW - 0.3],
  ]) {
    const alongX = z0 === z1;
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    k.box(f, k.brass, alongX ? len : 0.08, 0.2, alongX ? 0.08 : len, (x0 + x1) / 2, 0, (z0 + z1) / 2);
    const a0 = alongX ? x0 : z0,
      a1 = alongX ? x1 : z1;
    for (const [p, q] of gap0 === gap1 ? [[a0, a1]] : [
        [a0, gap0],
        [gap1, a1],
      ]) {
      const l = Math.abs(q - p);
      k.box(f, stoneDark, alongX ? l : 0.14, 0.18, alongX ? 0.14 : l, alongX ? (p + q) / 2 : x0, 6.2, alongX ? z0 : (p + q) / 2);
    }
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
  const TZ = -30.5;
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

  // ---- the escalators up to the wings, each pair onto a stone landing before the wing's doorway ----
  const landing = new THREE.MeshStandardMaterial({ map: stoneFloor("#d6cab2"), roughness: 0.4, metalness: 0.05, envMapIntensity: 0.9 });
  (landing.map as THREE.Texture).repeat.set(2.5, 1.3);
  const wings: [Wing, number][] = [
    // west: DENON (Grande Galerie)
    [{ x: -X, z: WZ, out: [-1, 0], y: MZ, run: 8.6, deep: 4, door: [DW, 2.85], sign: ["DENON", "Grande Galerie · Joconde · Victoire", "#e8453c"], room: "galerie", ranks: [1, 2, 3, 4] }, 1],
    // east: RICHELIEU (Napoleon III apartments)
    [{ x: X, z: WZ, out: [1, 0], y: MZ, run: 8.6, deep: 4, door: [DW, 2.85], sign: ["RICHELIEU", "Appartements Napoléon III", "#3a9a5a"], room: "salon", ranks: [79, 80, 81, 82] }, 3],
    // north, past the ticket gates: DARU (the Victory, the Salle des États)
    [{ x: 0, z: Z1, out: [0, -1], y: DY, run: 6.7, deep: 3.8, door: [DWD, 3.4], sign: ["DARU", "Victoire · Salle des États", "#4a7ad8"], room: "daru", ranks: [] }, 2],
  ];
  const names = ["", "DENON · Grande Galerie", "DARU · Victoire, Salle des États", "RICHELIEU · Appartements Napoléon III"];
  for (const [w, to] of wings)
    for (const hit of wing(k, f, w, stone, landing)) k.pick(f, hit, `<b>${names[to]}</b><span>escalator</span>`, () => ({ eyebrow: "Escalator", title: names[to], floor: to }));

  // ---- by the entrance, the plan of the house: a click on a level takes the lift there ----------
  const PLAN_W = 1200,
    PLAN_H = 1500,
    ROW0 = 300,
    ROW = 200;
  const plan = k.panel(
    f,
    PLAN_W,
    PLAN_H,
    3.4,
    (c, w, h) => {
      c.fillStyle = "#16161a";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#f4b728";
      c.fillRect(0, 0, w, 14);
      c.fillStyle = "#ffffff";
      c.font = `700 92px ${SANS}`;
      c.fillText("PLAN DU MUSÉE", 60, 150);
      c.fillStyle = "#9aa0a6";
      c.font = `500 40px ${SANS}`;
      c.fillText("Levels · click one to take the lift", 60, 215);
      FLOORS.forEach((fl, i) => {
        const y = ROW0 + i * ROW;
        c.fillStyle = "rgba(255,255,255,0.08)";
        c.fillRect(60, y + ROW - 4, w - 120, 2);
        c.fillStyle = i === FLOORS.length - 1 || fl.name.startsWith("Aile") || fl.name.startsWith("Memorial") ? "#f4b728" : "#ffffff";
        c.font = `800 120px ${SANS}`;
        c.fillText(fl.label, 60, y + 140);
        c.fillStyle = "#ffffff";
        c.font = `700 58px ${SANS}`;
        c.fillText(fl.name, 190, y + 92);
        c.fillStyle = "#9aa0a6";
        c.font = `500 38px ${SANS}`;
        c.fillText(fl.sub, 190, y + 150);
      });
    },
    { glow: true, transparent: false },
  );
  plan.position.set(14, 0.6 + (3.4 * PLAN_H) / PLAN_W / 2, -0.34);
  plan.rotation.y = FACE.nz;
  const levelAt = (hit: THREE.Intersection) => {
    if (!hit.uv) return null;
    const i = Math.floor(((1 - hit.uv.y) * PLAN_H - ROW0) / ROW);
    return i >= 0 && i < FLOORS.length ? i : null;
  };
  k.pick(
    f,
    plan,
    (hit) => {
      const i = levelAt(hit);
      return i != null ? `<b>${FLOORS[i].label} · ${FLOORS[i].name}</b><span>${FLOORS[i].sub}</span>` : "<b>Plan du musée</b><span>click a level</span>";
    },
    (hit) => {
      const i = levelAt(hit);
      return i != null && i !== f ? { eyebrow: "Lift", title: `${FLOORS[i].label} · ${FLOORS[i].name}`, floor: i } : null;
    },
  );
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
    if (Math.abs(z - WZ) < 3) continue;
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
    // the gift shop sells the community's memes too, framed
    for (const dx of [-1.3, 1.3]) {
      const p = memePoster(nextMeme(), 0.72, { kind: "frame", frame: "#c9a227" });
      p.position.set(x + dx, 1.55, shopZ - 0.03);
      p.rotation.y = FACE.nz;
      g.add(p);
    }
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

/** A wing's way up from the hall: its doorway in the hall's wall, its landing, the room beyond. */
interface Wing {
  /** The wall's centre line at the doorway, and the way into the wing (axis-aligned). */
  x: number;
  z: number;
  out: [number, number];
  /** The landing's height, the escalators' run, the landing's depth off the wall. */
  y: number;
  run: number;
  deep: number;
  /** The doorway: half width, height. */
  door: [number, number];
  sign: [string, string, string];
  room: "galerie" | "salon" | "daru";
  ranks: number[];
}

/**
 * A pair of escalators up to a wing, as in the Hall Napoléon: they arrive on a pale stone landing
 * 4 m deep against the wall (a downstand round its finished soffit, downlights, two stone columns
 * under its front corners), frameless glass with a bronze handrail round its open sides; behind it
 * the wing's doorway in a bronze frame under its sign, and through it the first room of the wing,
 * lit, going away. Everything in a frame where d runs into the wing from the wall's centre line
 * (the hall side is d < −0.3) and a across it. Returns what clicks through to the wing.
 */
function wing(k: MuseumKit, f: number, w: Wing, stone: THREE.Material, landing: THREE.Material) {
  const g = k.groups[f];
  const yaw = Math.atan2(w.out[0], w.out[1]);
  const M = new THREE.Matrix4().makeRotationY(yaw).setPosition(w.x, 0, w.z);
  const at = (a: number, y: number, d: number) => new THREE.Vector3(a, y, d).applyMatrix4(M);
  const put = (mat: THREE.Material, geo: THREE.BufferGeometry, uv?: number) => k.geo(f, mat, geo.applyMatrix4(M), uv);
  const box = (mat: THREE.Material, wa: number, h: number, dd: number, a: number, y: number, d: number, uv?: number) => put(mat, boxGeo(wa, h, dd, a, y, d), uv);
  const solid = (a0: number, d0: number, a1: number, d1: number) => {
    const p = at(a0, 0, d0),
      q = at(a1, 0, d1);
    k.solid(f, p.x, p.z, q.x, q.z);
  };
  const place = (m: THREE.Object3D, a: number, y: number, d: number, ry = 0) => {
    m.position.copy(at(a, y, d));
    m.rotation.y = yaw + ry;
    g.add(m);
    return m;
  };
  /** The world yaw of a direction given in the frame (a, d). */
  const yawOf = (a: number, d: number) => {
    const v = new THREE.Vector3(a, 0, d).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    return Math.atan2(v.x, v.z);
  };
  const Y = w.y,
    [DW, DH] = w.door,
    SP = 3.8,
    edge = -0.3 - w.deep;
  const LANE = 0.95,
    ESC = 1.2;
  const outer = LANE + (ESC + 0.1) / 2 + 0.03,
    inner = LANE - (ESC + 0.1) / 2 - 0.03;

  // ---- the wall round the doorway: under it, over it; the reveal lined in bronze ----------------
  box(stone, 2 * DW, Y, 0.6, 0, 0, 0, 4);
  solid(-DW, -0.3, DW, 0.3);
  box(stone, 2 * DW, H - Y - DH, 0.6, 0, Y + DH, 0, 4);
  for (const s of [-1, 1]) box(k.brass, 0.03, DH, 0.6, s * (DW - 0.015), Y, 0);
  box(k.brass, 2 * DW, 0.03, 0.6, 0, Y + DH - 0.03, 0);
  box(k.brass, 2 * DW, 0.02, 0.6, 0, Y, 0);
  // the bronze frame on the hall side, the sign over it
  for (const s of [-1, 1]) box(k.brass, 0.18, DH + 0.18, 0.07, s * (DW + 0.09), Y, -0.33);
  box(k.brass, 2 * DW + 0.36, 0.18, 0.07, 0, Y + DH, -0.33);
  const signW = 3.5;
  const sg = wayfinding(k, f, w.sign[0], w.sign[1], w.sign[2], signW);
  place(sg, 0, Y + DH + 0.28 + (signW * 300) / 1024 / 2, -0.34, Math.PI);

  // ---- the landing -------------------------------------------------------------------------------
  // the slab (its floor flush with the escalators' top plates), a downstand round its soffit
  box(stone, 2 * SP, 0.55, w.deep, 0, Y - 0.55, edge + w.deep / 2, 4);
  box(stone, 2 * SP, 0.3, 0.45, 0, Y - 0.85, edge + 0.225, 4);
  for (const s of [-1, 1]) box(stone, 0.45, 0.3, w.deep - 0.45, s * (SP - 0.225), Y - 0.85, edge + 0.45 + (w.deep - 0.45) / 2, 4);
  k.plane(f, landing, 2 * SP, w.deep, at(0, 0, edge + w.deep / 2).x, Y + 0.003, at(0, 0, edge + w.deep / 2).z, -Math.PI / 2, yaw);
  // the bronze nosing along its open edges (not where the escalators come in)
  const front: [number, number][] = [
    [-SP, -outer],
    [-inner, inner],
    [outer, SP],
  ];
  for (const [a0, a1] of front) box(k.brass, a1 - a0, 0.08, 0.05, (a0 + a1) / 2, Y - 0.08, edge - 0.02);
  for (const s of [-1, 1]) box(k.brass, 0.05, 0.08, w.deep, s * (SP + 0.02), Y - 0.08, edge + w.deep / 2);
  // the soffit's downlights, and their light on the floor below
  const down = k.lit("#fff3dc", 2.2);
  for (const a of [-2.6, -0.9, 0.9, 2.6])
    for (const d of [edge + 1.35, edge + 2.95]) {
      put(down, new THREE.CircleGeometry(0.09, 16).rotateX(Math.PI / 2).translate(a, Y - 0.553, d));
      put(k.brass, new THREE.RingGeometry(0.09, 0.13, 16).rotateX(Math.PI / 2).translate(a, Y - 0.552, d));
      const p = at(a, 0, d);
      k.pool(f, p.x, p.z, 1.1, "#fff0d4", 0.012, 0.55);
    }
  // two stone columns under its front corners, bronze at foot and head
  for (const s of [-1, 1]) {
    const a = s * (SP - 0.4),
      d = edge + 0.4;
    const h = Y - 0.85;
    put(stone, new THREE.CylinderGeometry(0.22, 0.24, h, 20).translate(a, h / 2, d), 2);
    put(k.brass, new THREE.CylinderGeometry(0.27, 0.27, 0.14, 20).translate(a, 0.07, d));
    put(k.brass, new THREE.CylinderGeometry(0.3, 0.25, 0.08, 20).translate(a, h - 0.04, d));
    const p = at(a, 0, d);
    k.solid(f, p.x - 0.3, p.z - 0.3, p.x + 0.3, p.z + 0.3);
  }
  // nobody walks under it from the hall
  solid(-SP, edge, SP, -0.3);
  // frameless glass round its open sides in a bronze shoe, a round bronze handrail on top
  const runs: [number, number, number, number][] = [
    ...front.map(([a0, a1]): [number, number, number, number] => [a0 === -SP ? -SP + 0.1 : a0, edge + 0.1, a1 === SP ? SP - 0.1 : a1, edge + 0.1]),
    [-SP + 0.1, edge + 0.1, -SP + 0.1, -0.32],
    [SP - 0.1, edge + 0.1, SP - 0.1, -0.32],
  ];
  for (const [a0, d0, a1, d1] of runs) {
    const along = Math.abs(a1 - a0) > Math.abs(d1 - d0);
    const l = along ? a1 - a0 : d1 - d0;
    const [ca, cd] = [(a0 + a1) / 2, (d0 + d1) / 2];
    box(k.brass, along ? l : 0.09, 0.1, along ? 0.09 : l, ca, Y, cd);
    box(k.glass, along ? l : 0.02, 1.0, along ? 0.02 : l, ca, Y + 0.1, cd);
    put(k.brass, rodGeo(new THREE.Vector3(a0, Y + 1.12, d0), new THREE.Vector3(a1, Y + 1.12, d1), 0.032, 10));
    // the handrail's posts: little bronze clamps on the glass
    for (const t of along ? [0.06, 0.94] : [0.06, 0.5, 0.94]) box(k.brass, 0.04, 0.06, 0.04, a0 + (a1 - a0) * t, Y + 1.06, d0 + (d1 - d0) * t);
  }
  // a bench against the wall either side of the doorway
  for (const s of [-1, 1]) {
    const p = at(s * 2.65, 0, -0.75);
    k.vox(f, "banq16", () => banquette(1.6), p.x, Y, p.z, yaw, 0.5);
  }

  // ---- the escalators: their heads on the landing, the incline ending at its edge ---------------
  const hits: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const p = at(s * LANE, 0, edge + 1.2 - w.run);
    hits.push(escalator(k, f, p.x, p.z, w.out, w.run, Y, ESC));
  }

  // ---- the doorway clicks through too ------------------------------------------------------------
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2 * DW, DH), new THREE.MeshBasicMaterial({ visible: false }));
  hits.push(place(door, 0, Y + DH / 2, -0.32, Math.PI));

  // ---- the room beyond: the first of the wing, lit, going away -----------------------------------
  const RW = w.room === "daru" ? 3.4 : 3.2,
    RL = 11,
    RH = w.room === "daru" ? 5.6 : 4.1,
    D0 = 0.3,
    D1 = D0 + RL,
    mid = (D0 + D1) / 2;
  const wallMat =
    w.room === "galerie"
      ? new THREE.MeshStandardMaterial({ color: "#8a3426", roughness: 0.92 })
      : w.room === "salon"
        ? new THREE.MeshStandardMaterial({ map: damask(), roughness: 0.85 })
        : new THREE.MeshStandardMaterial({ map: limestone("#a49e92"), roughness: 0.85 });
  const cream = new THREE.MeshStandardMaterial({ color: "#e6d8b8", roughness: 0.7 });
  // floor: Versailles parquet in the galleries, grey stone up the Daru
  const ft = w.room === "daru" ? stoneFloor("#a8a298") : versailles(w.room === "salon" ? "#6a4428" : "#9a6a3c");
  ft.repeat.set(w.room === "daru" ? (2 * RW) / 3 : RW, w.room === "daru" ? RL / 3 : RL / 2);
  const fc = at(0, 0, mid);
  k.plane(f, new THREE.MeshStandardMaterial({ map: ft, roughness: 0.38, envMapIntensity: 0.8 }), 2 * RW, RL, fc.x, Y + 0.002, fc.z, -Math.PI / 2, yaw);
  // walls, the end wall with its doorway on, the ceiling
  for (const s of [-1, 1]) box(wallMat, 0.2, RH, RL, s * (RW + 0.1), Y, mid, w.room === "galerie" ? undefined : 2);
  const ED = 1.3,
    EH = w.room === "daru" ? 3.6 : 3.0;
  for (const s of [-1, 1]) box(wallMat, RW - ED, RH, 0.2, s * (ED + (RW - ED) / 2), Y, D1 + 0.1, w.room === "galerie" ? undefined : 2);
  box(wallMat, 2 * ED, RH - EH, 0.2, 0, Y + EH, D1 + 0.1, w.room === "galerie" ? undefined : 2);
  box(cream, 2 * RW + 0.4, 0.25, RL + 0.4, 0, Y + RH, mid);
  // through the far doorway: the next room, bright
  const beyond = new THREE.Mesh(new THREE.PlaneGeometry(2 * ED + 1, EH + 0.5), k.lit(w.room === "daru" ? "#f2ead8" : "#fff0d8", 1.15));
  place(beyond, 0, Y + (EH + 0.5) / 2, D1 + 1.6, Math.PI);
  for (const s of [-1, 1]) box(wallMat, 0.1, EH + 0.5, 1.4, s * (ED + 0.55), Y, D1 + 0.9);
  box(cream, 2 * ED + 1.2, 0.1, 1.4, 0, Y + EH, D1 + 0.9);
  // the door's frame
  const trim = w.room === "daru" ? cream : k.gold;
  for (const s of [-1, 1]) box(trim, 0.16, EH, 0.08, s * (ED + 0.08), Y, D1 - 0.02);
  box(trim, 2 * ED + 0.32, 0.18, 0.08, 0, Y + EH, D1 - 0.02);
  // light: washes down the side walls, pools on the floor
  for (const s of [-1, 1])
    for (let d = D0 + 1.8; d < D1 - 0.5; d += 3) {
      const p = at(s * (RW - 0.01), 0, d);
      k.wash(f, p.x, p.z, yawOf(-s, 0), 2.8, RH - 0.6, Y + RH - 0.3, w.room === "daru" ? "#fff4e4" : "#ffe6c0");
    }
  for (let d = D0 + 1.5; d < D1; d += 3.2) {
    const p = at(0, 0, d);
    k.pool(f, p.x, p.z, 2.4, "#fff2dc", Y + 0.012, 0.9);
  }
  // paintings on both walls
  w.ranks.forEach((rank, i) => {
    const s = i % 2 ? 1 : -1,
      d = D0 + 3.2 + Math.floor(i / 2) * 4.6;
    const p = at(s * RW, 0, d);
    k.hang(f, { x: p.x, y: Y + 2.0, z: p.z, yaw: yawOf(-s, 0), s: 1.5, rank, tone: w.room === "salon" ? 1 : 0 });
  });

  if (w.room === "galerie") {
    // the Grande Galerie's dress: oak dado, cream cornice, a skylight down the crown
    const oak = new THREE.MeshStandardMaterial({ color: "#5a3820", roughness: 0.55 });
    for (const s of [-1, 1]) {
      box(oak, 0.05, 0.95, RL, s * (RW - 0.025), Y, mid);
      box(cream, 0.08, 0.06, RL, s * (RW - 0.04), Y + 0.95, mid);
      box(k.black, 0.07, 0.14, RL, s * (RW - 0.035), Y, mid);
      box(cream, 0.3, 0.4, RL, s * (RW - 0.15), Y + RH - 0.4, mid);
    }
    const sky = skylight();
    sky.repeat.set(1, (RL - 1) / 2);
    put(k.lit("#ffffff", 1.05, "sky", sky), new THREE.PlaneGeometry(2, RL - 1).rotateX(Math.PI / 2).translate(0, Y + RH - 0.01, mid));
    const pk = at(0, 0, D0 + 5.5);
    k.vox(f, "banq", () => banquette(2.4), pk.x, Y, pk.z, yaw + Math.PI / 2, 0.5);
  } else if (w.room === "salon") {
    // Napoleon III: gilt pilasters with sconces, a gilt cornice, a painted ceiling
    for (const s of [-1, 1]) {
      box(cream, 0.06, 0.9, RL, s * (RW - 0.03), Y, mid);
      box(k.gold, 0.08, 0.05, RL, s * (RW - 0.04), Y + 0.9, mid);
      box(k.gold, 0.3, 0.35, RL, s * (RW - 0.15), Y + RH - 0.35, mid);
      for (let d = D0 + 1.0; d < D1; d += 2.3) {
        box(k.gold, 0.08, RH - 0.35, 0.34, s * (RW - 0.04), Y, d);
        put(k.lit("#ffe0a8", 1.6), new THREE.SphereGeometry(0.07, 10, 8).translate(s * (RW - 0.2), Y + 2.7, d));
        box(k.gold, 0.12, 0.04, 0.12, s * (RW - 0.16), Y + 2.6, d);
      }
    }
    const ct = paintedCeiling(2 * RW, RL);
    put(new THREE.MeshStandardMaterial({ map: ct, roughness: 0.8 }), new THREE.PlaneGeometry(2 * RW, RL).rotateX(Math.PI / 2).translate(0, Y + RH - 0.36, mid));
  } else {
    // up the Daru: a broad grey stair to the landing where the Victory stands on her prow
    const stepMat = new THREE.MeshStandardMaterial({ color: "#a8a298", roughness: 0.6 });
    const N = 9,
      R = 0.17,
      T = 0.42,
      S0 = D0 + 2.2;
    for (let i = 0; i < N; i++) box(stepMat, 2 * RW, R * (i + 1), T, 0, Y, S0 + T * (i + 0.5));
    const top = Y + R * N,
      L0 = S0 + T * N;
    box(stepMat, 2 * RW, R * N, D1 - L0, 0, Y, (L0 + D1) / 2);
    const v = at(0, 0, L0 + 3.2);
    k.vox(f, "victory", wingedVictory, v.x, top, v.z, yaw + Math.PI, 0.5);
    const mos = goldMosaic();
    mos.repeat.set(RW, RL / 2);
    put(new THREE.MeshStandardMaterial({ map: mos, roughness: 0.35, metalness: 0.6, envMapIntensity: 1.3 }), new THREE.PlaneGeometry(2 * RW, RL).rotateX(Math.PI / 2).translate(0, Y + RH - 0.01, mid));
    for (const s of [-1, 1]) box(cream, 0.3, 0.4, RL, s * (RW - 0.15), Y + RH - 0.4, mid);
    const lp = at(0, 0, L0 + 3.2);
    k.pool(f, lp.x, lp.z, 3, "#fff6e6", top + 0.012, 1.1);
  }
  return hits;
}
