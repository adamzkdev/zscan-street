import * as THREE from "three";
import { atlasBitmap } from "../../data/atlas";
import { ZScan } from "../../data/zscan";
import type { Collection } from "./data";
import { boxGeo, canvasTex, FACE, type MuseumKit } from "./kit";
import { coffers, limestone, marble, stoneFloor } from "./look";
import { SERIF } from "./parts";
import { pad2, type PApp } from "./purge";
import { snark } from "./purgeviz";
import { banquette } from "./voxels";
import type { Snark } from "../../scene/snark";

/**
 * Floor 5, the Memorial of the Purged: a high hall of pale stone for the 676 zkSNARKs burned to
 * reveal the Apparitions. On the far wall, under TO THE 676 PURGED zkSNARKs · FROM A GRATEFUL
 * COLLECTION, the Wall of the Purged: all 676 portraits, 26 by 26, one row per Apparition. Before
 * it, on a granite plinth, the Unknown Purged Snark in bronze: the silhouette all 676 share (every
 * pixel lit in at least half of them), with an eternal flame and wreaths at its feet. Down both
 * walls, 26 stone tablets engraved with the names, Apparition by Apparition. A guard of honour.
 */

const X = 14,
  L = -50,
  H = 13;
const PIX = 26;

export function memorial(k: MuseumKit, data: Collection) {
  const f = 5;
  const g = k.groups[f];
  const stone = new THREE.MeshStandardMaterial({ map: limestone("#cfc6b4"), roughness: 0.85 });
  const stoneDark = new THREE.MeshStandardMaterial({ color: "#a89f8e", roughness: 0.8 });
  const granite = new THREE.MeshStandardMaterial({ map: marble("#2a2a2e", "#5a5a62"), roughness: 0.22, metalness: 0.1, envMapIntensity: 1 });
  const bronze = new THREE.MeshStandardMaterial({ color: "#6e4a2a", roughness: 0.38, metalness: 0.85, emissive: "#140a04", envMapIntensity: 1.3 });
  const leaf = new THREE.MeshStandardMaterial({ color: "#2e4a26", roughness: 0.8 });

  // ---- the hall ------------------------------------------------------------------------------------
  const fl = stoneFloor("#8a847a");
  fl.repeat.set(X / 2, -L / 4);
  k.plane(f, new THREE.MeshStandardMaterial({ map: fl, roughness: 0.32, envMapIntensity: 0.8 }), 2 * X, -L, 0, 0, L / 2);
  const cf = coffers();
  cf.repeat.set(X / 3, -L / 6);
  k.plane(f, new THREE.MeshStandardMaterial({ map: cf, color: "#bdb4a2", roughness: 0.85 }), 2 * X, -L, 0, H, L / 2, Math.PI / 2);
  for (const [x0, z0, x1, z1] of [
    [-X, 0, X, 0],
    [-X, L, X, L],
    [-X, 0, -X, L],
    [X, 0, X, L],
  ])
    k.wall(f, stone, x0, z0, x1, z1, H, 0.5, 4);
  // a dark granite skirting, a cornice
  for (const s of [-1, 1]) {
    k.geo(f, granite, boxGeo(0.2, 0.6, -L, s * (X - 0.3), 0, L / 2));
    k.geo(f, stoneDark, boxGeo(0.5, 0.5, -L, s * (X - 0.4), H - 0.9, L / 2));
  }
  k.geo(f, stoneDark, boxGeo(2 * X, 0.5, 0.5, 0, H - 0.9, L + 0.4));
  // the oculus over the statue: daylight (a deep blue at night)
  const SZ = -38;
  const oc = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), k.lit("#f4f8ff", 1.25, "sky"));
  oc.rotation.x = Math.PI / 2;
  oc.position.set(0, H - 0.02, SZ);
  g.add(oc);
  k.geo(f, stoneDark, new THREE.TorusGeometry(2.7, 0.18, 8, 48).rotateX(Math.PI / 2).translate(0, H - 0.05, SZ));

  // ---- by the lifts: the name ----------------------------------------------------------------------
  const name = k.panel(f, 2048, 300, 12, (c, w, h) => {
    c.fillStyle = "#3a332b";
    c.font = `italic 500 150px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Memorial of the Purged", w / 2, h / 2);
  });
  name.position.set(0, 7, -0.28);
  name.rotation.y = FACE.nz;

  // ---- the far wall: the inscription and the Wall of the Purged ------------------------------------
  const ins = k.panel(f, 3000, 220, 24, (c, w, h) => {
    c.fillStyle = "#b8923a";
    c.font = `600 120px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.letterSpacing = "14px";
    c.fillText("TO THE 676 PURGED zkSNARKs · FROM A GRATEFUL COLLECTION", w / 2, h / 2 + 6);
  });
  ins.position.set(0, H - 2.1, L + 0.27);
  const WS = 8.4;
  const wallTex = canvasTex(2000, 2000, (c, w, h) => {
    c.fillStyle = "#121014";
    c.fillRect(0, 0, w, h);
  });
  wallTex.magFilter = THREE.NearestFilter;
  const wall676 = new THREE.Mesh(new THREE.PlaneGeometry(WS, WS), new THREE.MeshBasicMaterial({ map: wallTex, color: "#e6e0d6" }));
  wall676.position.set(0, 1.3 + WS / 2, L + 0.3);
  g.add(wall676);
  // a bronze frame
  for (const [w, h, x, y] of [
    [WS + 0.6, 0.3, 0, 1.0],
    [WS + 0.6, 0.3, 0, 1.3 + WS],
    [0.3, WS + 0.6, -(WS / 2 + 0.15), 1.0],
    [0.3, WS + 0.6, WS / 2 + 0.15, 1.0],
  ])
    k.geo(f, bronze, boxGeo(w, h, 0.2, x, y, L + 0.35));
  k.wash(f, 0, L + 0.32, FACE.pz, 10, 9, 10.8, "#fff0dc");
  // cells: 26 portraits a row after the Apparition's own, at 70 px
  const CX = 130,
    CY = 90,
    CELL = 70;
  const rows: { a: PApp; items: number[] }[] = [];
  const cellAt = (hit: THREE.Intersection) => {
    if (!hit.uv) return null;
    const px = hit.uv.x * 2000,
      py = (1 - hit.uv.y) * 2000;
    const r = Math.floor((py - CY) / CELL),
      c = Math.floor((px - CX) / CELL);
    const row = rows[r];
    if (!row) return null;
    if (px < CX && px > 30) return row.a.item;
    return c >= 0 && c < 26 ? (row.items[c] ?? null) : null;
  };
  k.pick(
    f,
    wall676,
    (hit) => {
      const id = cellAt(hit);
      return id != null ? data.hover(id) : "<b>The Wall of the Purged</b><span>all 676, one row per Apparition</span>";
    },
    (hit) => {
      const id = cellAt(hit);
      return id != null ? data.info(id, "Memorial of the Purged") : { eyebrow: "Memorial of the Purged", title: "The Wall of the Purged", body: "<p>All 676 zkSNARKs burned for the Apparitions, one row per Apparition, its own portrait at the start of the row.</p>" };
    },
  );

  // ---- the Unknown Purged Snark: plinth, bronze, flame, wreaths ---------------------------------------
  k.geo(f, granite, boxGeo(3.2, 0.5, 3.2, 0, 0, SZ));
  k.geo(f, granite, boxGeo(2.6, 1.4, 2.6, 0, 0.5, SZ));
  k.geo(f, bronze, boxGeo(2.7, 0.08, 2.7, 0, 1.86, SZ));
  k.solid(f, -1.8, SZ - 1.8, 1.8, SZ + 1.8);
  const plaque = k.panel(f, 1024, 360, 2.2, (c, w, h) => {
    c.fillStyle = "#6e4a2a";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#c9a060";
    c.lineWidth = 8;
    c.strokeRect(14, 14, w - 28, h - 28);
    c.fillStyle = "#f0d8a0";
    c.textAlign = "center";
    c.font = `600 74px ${SERIF}`;
    c.fillText("TO THE UNKNOWN PURGED SNARK", w / 2, 150);
    c.font = `italic 500 50px ${SERIF}`;
    c.fillText("the shape the 676 shared", w / 2, 250);
  });
  plaque.position.set(0, 1.15, SZ + 1.31);
  const VOX = 0.11,
    DEPTH = 3;
  const statue = new THREE.InstancedMesh(new THREE.BoxGeometry(VOX, VOX, VOX), bronze, PIX * PIX * DEPTH);
  statue.count = 0;
  statue.position.set(-(PIX * VOX) / 2, 1.9, SZ);
  g.add(statue);
  const statueHit = new THREE.Mesh(new THREE.BoxGeometry(PIX * VOX, PIX * VOX, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
  statueHit.position.set(0, 1.9 + (PIX * VOX) / 2, SZ);
  g.add(statueHit);
  k.pick(f, statueHit, "<b>The Unknown Purged Snark</b><span>the shape the 676 shared</span>", () => ({
    eyebrow: "Memorial of the Purged",
    title: "The Unknown Purged Snark",
    tag: ["Bronze", "muted"],
    body: "<p>Every pixel lit in at least half of the 676 purged zkSNARKs: the shape they all had in common.</p>",
  }));
  k.light(f, 0, H - 1.5, SZ + 1, "#fff4e4", 34, 22);

  // the eternal flame in a bronze bowl before the plinth
  const FZ = SZ + 3.4;
  k.geo(f, granite, new THREE.CylinderGeometry(0.55, 0.7, 0.7, 24).translate(0, 0.35, FZ));
  k.geo(f, bronze, new THREE.CylinderGeometry(0.62, 0.42, 0.22, 24, 1, true).translate(0, 0.81, FZ));
  k.solid(f, -0.8, FZ - 0.8, 0.8, FZ + 0.8);
  const flameTex = canvasTex(128, 256, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h * 0.78, 4, w / 2, h * 0.6, h * 0.55);
    gr.addColorStop(0, "rgba(255,250,220,1)");
    gr.addColorStop(0.25, "rgba(255,200,90,0.95)");
    gr.addColorStop(0.6, "rgba(240,110,30,0.55)");
    gr.addColorStop(1, "rgba(200,60,10,0)");
    c.fillStyle = gr;
    c.beginPath();
    c.moveTo(w / 2, 6);
    c.bezierCurveTo(w * 0.95, h * 0.45, w * 0.92, h * 0.95, w / 2, h - 4);
    c.bezierCurveTo(w * 0.08, h * 0.95, w * 0.05, h * 0.45, w / 2, 6);
    c.fill();
  });
  const flameMat = new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, color: new THREE.Color(1.6, 1.4, 1.2) });
  // candle flames: plain alpha, so they still show against the pale stone (additive light would vanish there)
  const wickMat = new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, color: new THREE.Color(1.5, 1.25, 0.9) });
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.4).translate(0, 0.7, 0), flameMat);
    m.position.set(0, 0.86, FZ);
    m.rotation.y = (i * Math.PI) / 3;
    m.raycast = () => {};
    g.add(m);
    flames.push(m);
  }
  const fire = k.light(f, 0, 1.6, FZ, "#ffa040", 14, 9);
  /** The flame stands taller during the silence (see the ceremony below). */
  const boost = { value: 1, target: 1 };
  k.ticks[f].push((dt, t) => {
    boost.value += (boost.target - boost.value) * Math.min(1, dt * 1.5);
    flames.forEach((m, i) => {
      const n = Math.sin(t * 9 + i * 2.1) * 0.5 + Math.sin(t * 15.3 + i) * 0.3 + Math.sin(t * 4.1 + i * 1.7) * 0.2;
      m.scale.set((1 + n * 0.08) * boost.value, (1 + n * 0.16) * boost.value ** 1.4, 1);
      m.rotation.y = (i * Math.PI) / 3 + Math.sin(t * 0.7 + i) * 0.2;
    });
    if (fire) fire.intensity = (fire.userData.base as number) * boost.value * (1 + Math.sin(t * 13) * 0.14 + Math.sin(t * 7.3) * 0.1);
  });
  k.pool(f, 0, FZ, 3.2, "#ffb060", 0.012, 1.2);
  k.pick(f, (() => {
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.4), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 1.2, FZ);
    g.add(hit);
    return hit;
  })(), "<b>The Eternal Flame</b><span>for the 676</span>", () => ({ eyebrow: "Memorial of the Purged", title: "The Eternal Flame", body: "<p>It burns for the 676 zkSNARKs purged so that 26 Apparitions could be revealed.</p>" }));
  // wreaths against the plinth: laurel rings with a gold ribbon
  for (const [x, rz] of [
    [-0.95, 0.1],
    [0.95, -0.1],
  ]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 8, 24), leaf);
    w.position.set(x, 0.62, SZ + 1.42);
    w.rotation.set(-0.15, 0, rz);
    g.add(w);
    k.geo(f, k.gold, boxGeo(0.14, 0.55, 0.03, x + 0.1, 0.08, SZ + 1.52));
    k.geo(f, k.gold, boxGeo(0.14, 0.55, 0.03, x - 0.1, 0.08, SZ + 1.52));
  }
  // candles along the foot of the Wall
  for (let i = 0; i < 15; i++) {
    const x = -3.9 + i * (7.8 / 14),
      z = L + 0.9 + (i % 2) * 0.25;
    const h = 0.18 + ((i * 37) % 7) * 0.03;
    k.geo(f, k.white, new THREE.CylinderGeometry(0.035, 0.035, h, 10).translate(x, h / 2, z));
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.12), wickMat);
    c.position.set(x, h + 0.06, z);
    c.raycast = () => {};
    g.add(c);
  }
  k.light(f, 0, 2.2, L + 2.5, "#ffc880", 10, 9);

  // ---- the names: 26 stone tablets down the walls ----------------------------------------------------
  const tablets: THREE.Texture[] = [];
  const TW = 1.6,
    TH = (TW * 1100) / 640;
  for (let i = 0; i < 26; i++) {
    const s = i < 13 ? -1 : 1;
    const z = -5 - (i % 13) * 2.55;
    const tex = canvasTex(640, 1100, (c, w, h) => {
      c.fillStyle = "#c8bea8";
      c.fillRect(0, 0, w, h);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(TW, TH), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
    m.position.set(s * (X - 0.27), 1.1 + TH / 2, z);
    m.rotation.y = s < 0 ? FACE.px : FACE.nx;
    g.add(m);
    k.geo(f, stoneDark, boxGeo(0.12, 0.14, TW + 0.2, s * (X - 0.3), 1.0, z));
    tablets.push(tex);
    if (i % 3 === 0) k.wash(f, s * (X - 0.27), z, s < 0 ? FACE.px : FACE.nx, 5, 6, H - 2, "#fff0dc");
  }

  // ---- benches, light, the guard of honour, the visitors ---------------------------------------------
  for (const z of [-14, -22]) {
    k.vox(f, "banqM", () => banquette(3), 0, 0, z, 0, 0.5);
    k.solid(f, -1.6, z - 0.4, 1.6, z + 0.4);
  }
  k.light(f, -8, 8, -16, "#fff2e0", 22, 22);
  k.light(f, 8, 8, -16, "#fff2e0", 22, 22);
  k.light(f, 0, 6, -4, "#fff2e0", 14, 14);
  let n = 0;
  const id = () => k.visitor(5000 + n++);
  void k.person(f, id(), [-1.6, FZ + 0.4], { guard: true, face: [-1.6, 0] });
  void k.person(f, id(), [1.6, FZ + 0.4], { guard: true, face: [1.6, 0] });
  void k.person(f, id(), [-0.6, -14.3], { perch: 0.45, face: [0, SZ] });
  void k.person(f, id(), [0.8, -22.3], { perch: 0.45, face: [0, SZ] });

  // ---- the mourners: they speak, one after another, of the ones they lost (real ids, real ranks) -----
  const speakers: { s: Snark; line: string }[] = [];
  // a half ring by the flame (aside, so the statue stays in view), the tablets, the Wall, the benches
  const spots: { at: [number, number]; face: [number, number]; flowers?: boolean }[] = [
    { at: [-3.4, FZ + 1.6], face: [0, SZ], flowers: true },
    { at: [3.3, FZ + 1.8], face: [0, SZ], flowers: true },
    { at: [-4.4, FZ + 3.8], face: [0, SZ] },
    { at: [4.6, FZ + 3.4], face: [0, SZ] },
    { at: [-5.8, FZ + 0.2], face: [0, SZ] },
    { at: [-11.2, -9], face: [-X, -9] },
    { at: [-11.4, -24], face: [-X, -24] },
    { at: [-11.1, -32], face: [-X, -32] },
    { at: [11.3, -14], face: [X, -14] },
    { at: [11.2, -30], face: [X, -30] },
    { at: [-3.6, L + 3.4], face: [-3.6, L] },
    { at: [3.8, L + 3], face: [3.8, L] },
    { at: [-1.8, -14.6], face: [0, SZ], flowers: true },
    { at: [2.2, -22.6], face: [0, SZ] },
  ];
  // ---- the ceremony: now and then the curator speaks at the lectern before the flame; everyone
  // falls quiet and turns to listen, then a moment of silence, the flame standing taller -------------
  const LX = 0,
    LZc = FZ + 3.1;
  k.geo(f, k.oak, boxGeo(0.7, 1.05, 0.45, LX, 0, LZc));
  k.geo(f, k.oak, boxGeo(0.86, 0.06, 0.6, LX, 1.05, LZc));
  k.geo(f, k.brass, boxGeo(0.4, 0.3, 0.02, LX, 0.55, LZc + 0.235));
  k.solid(f, LX - 0.5, LZc - 0.35, LX + 0.5, LZc + 0.35);
  let curator: Snark | null = null;
  let speech: string[] = [];
  const faced = new Map<Snark, THREE.Vector3 | null>();
  /** Seconds spent on this floor (the ceremony keeps its own clock, paused elsewhere). */
  let ft = 0,
    nextLine = 4,
    said = 0,
    nextTear = 6,
    ceremony = 40;
  const LINE = 5.6,
    SILENCE = 12;
  k.ticks[f].push((dt) => {
    if (k.current !== f) return;
    ft += dt;
    const into = ft - ceremony;
    const speaking = curator && speech.length && into >= 0 && into < speech.length * LINE;
    const silent = into >= speech.length * LINE && into < speech.length * LINE + SILENCE;
    if (curator && speech.length && into >= 0) {
      if (into < dt) {
        // they turn to the lectern
        for (const sp of speakers) {
          faced.set(sp.s, sp.s.faceDir);
          sp.s.faceDir = new THREE.Vector3(LX - sp.s.root.position.x, 0, LZc - sp.s.root.position.z).normalize();
        }
      }
      const li = Math.floor(into / LINE);
      if (speaking && into - li * LINE < dt) curator.say(speech[li], LINE - 0.3);
      if (silent && into - speech.length * LINE < dt) {
        boost.target = 1.7;
        for (const sp of speakers) sp.s.emote(Math.random() < 0.6 ? "tears" : "sad", SILENCE - 1);
      }
      if (into >= speech.length * LINE + SILENCE) {
        boost.target = 1;
        for (const [sn, d] of faced) sn.faceDir = d;
        faced.clear();
        curator.say("Thank you. They are not forgotten.", 4);
        ceremony = ft + 95;
        nextLine = ft + 6;
      }
      return;
    }
    // between ceremonies: one at a time they speak; someone, somewhere, is crying
    if (speakers.length && ft >= nextLine) {
      const sp = speakers[said++ % speakers.length];
      sp.s.say(sp.line, 6);
      nextLine = ft + 3.6;
    }
    if (speakers.length && ft >= nextTear) {
      speakers[Math.floor(Math.random() * speakers.length)].s.emote("tears", 4);
      nextTear = ft + 3 + Math.random() * 4;
    }
  });
  void (async () => {
    await k.whenVisited(f);
    if (!(await data.ready) || !data.purge.apps.length) return;
    const lines = testimonies(data, spots.length);
    lines.forEach((ln, i) => {
      const sp = spots[i];
      void k.person(f, ln.speaker, sp.at, { face: sp.face, item: sp.flowers ? "flowers" : undefined }).then((s) => s && speakers.push({ s, line: ln.text }));
    });
    speech = eulogy(data);
    curator = await k.person(f, k.visitor(5900), [LX, LZc - 0.55], { face: [LX, 0], item: "book" });
    if (curator) curator.role = "Curator";
  })();

  // ---- light a candle: a brass stand of 27; a click lights one more for a purged zkSNARK -------------
  const CX0 = -7.6,
    CZ0 = L + 3.2;
  k.geo(f, k.brass, boxGeo(2.6, 0.9, 0.5, CX0, 0, CZ0 + 0.1));
  // three tiers, each higher one set back, so no tier hides the flames below it
  const tierZ = (r: number) => CZ0 + 0.14 - r * 0.16;
  for (let r = 0; r < 3; r++) k.geo(f, k.brass, boxGeo(2.6, 0.95 + r * 0.22, 0.15, CX0, 0, tierZ(r)));
  k.solid(f, CX0 - 1.4, CZ0 - 0.4, CX0 + 1.4, CZ0 + 0.4);
  const KEY = "zstreet.memorial.candles";
  let lit = Math.max(7, Math.min(27, Number(localStorage.getItem(KEY)) || 7));
  const wicks: THREE.Mesh[] = [];
  for (let i = 0; i < 27; i++) {
    const r = 2 - Math.floor(i / 9),
      c = i % 9;
    const x = CX0 - 1.1 + c * 0.275,
      y = 0.95 + r * 0.22,
      z = tierZ(r);
    k.geo(f, k.white, new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8).translate(x, y + 0.06, z));
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.12), wickMat);
    w.position.set(x, y + 0.17, z);
    w.raycast = () => {};
    w.visible = i < lit;
    g.add(w);
    wicks.push(w);
  }
  const candleHit = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.8, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
  candleHit.position.set(CX0, 0.9, CZ0);
  g.add(candleHit);
  k.pick(
    f,
    candleHit,
    () => `<b>Light a candle</b><span>${lit} burning · click to light one</span>`,
    () => {
      const p = data.purge;
      if (!p.purged.length) return null;
      const x = p.purged[(lit * 97) % p.purged.length];
      if (lit < 27) {
        wicks[lit].visible = true;
        lit++;
      } else {
        // all 27 lit: the oldest goes out as a new one is lit
        lit = 7;
        wicks.forEach((w, i) => (w.visible = i < lit));
      }
      localStorage.setItem(KEY, String(lit));
      const near = speakers.find((sp) => sp.s.root.position.distanceTo(new THREE.Vector3(CX0, 0, CZ0)) < 6);
      near?.s.emote("heart", 3);
      return { eyebrow: "Memorial of the Purged", title: `A candle for #${x.item}`, image: ZScan.zkSnarkImage(x.item), body: `<p>It burns for zkSNARKs #${x.item}${x.rank != null ? `, rank ${x.rank.toLocaleString("en-US")},` : ""} purged for ${p.purgedFor.get(x.item)?.name ?? "an Apparition"}.</p>` };
    },
  );

  // ---- once visited and the purge known: the Wall, the statue, the names ------------------------------
  void (async () => {
    await k.whenVisited(f);
    if (!(await data.ready) || !data.purge.apps.length) return;
    const atlas = await atlasBitmap().catch(() => null);
    if (!atlas) return;
    try {
      const p = data.purge;
      // the Wall: one row per Apparition (in the order revealed), its own portrait first
      const cv = wallTex.image as HTMLCanvasElement;
      const c = cv.getContext("2d")!;
      c.imageSmoothingEnabled = false;
      p.apps.forEach((a, r) => {
        const items = p.of(a).map((x) => x.item);
        rows.push({ a, items });
        snark(c, atlas, a.item, 30, CY + r * CELL, CELL - 4);
        items.forEach((id, k2) => snark(c, atlas, id, CX + k2 * CELL, CY + r * CELL, CELL - 2));
      });
      c.fillStyle = "#b8923a";
      c.fillRect(CX - 14, CY, 4, p.apps.length * CELL);
      wallTex.needsUpdate = true;
      // the statue: every pixel lit in at least half of the 676
      const t = document.createElement("canvas");
      t.width = t.height = PIX;
      const tg = t.getContext("2d", { willReadFrequently: true })!;
      const count = new Uint16Array(PIX * PIX);
      for (const x of p.purged) {
        tg.fillStyle = "#000";
        tg.fillRect(0, 0, PIX, PIX);
        tg.drawImage(atlas, ((x.item - 1) % 100) * 32, Math.floor((x.item - 1) / 100) * 32, 32, 32, 0, 0, PIX, PIX);
        const d = tg.getImageData(0, 0, PIX, PIX).data;
        for (let j = 0; j < PIX * PIX; j++) if (d[j * 4] + d[j * 4 + 1] + d[j * 4 + 2] > 60) count[j]++;
      }
      const m = new THREE.Matrix4();
      let n2 = 0;
      for (let j = 0; j < PIX * PIX; j++) {
        if (count[j] < p.purged.length / 2) continue;
        const cx = j % PIX,
          cy = Math.floor(j / PIX);
        for (let d = 0; d < DEPTH; d++) statue.setMatrixAt(n2++, m.makeTranslation((cx + 0.5) * VOX, (PIX - cy - 0.5) * VOX, (d - (DEPTH - 1) / 2) * VOX));
      }
      statue.count = n2;
      statue.instanceMatrix.needsUpdate = true;
      statue.computeBoundingSphere();
      // the names
      p.apps.forEach((a, i) => {
        const tex = tablets[i];
        if (!tex) return;
        const tc = (tex.image as HTMLCanvasElement).getContext("2d")!;
        const w = 640;
        tc.fillStyle = "#c8bea8";
        tc.fillRect(0, 0, w, 1100);
        tc.strokeStyle = "#9a8f78";
        tc.lineWidth = 6;
        tc.strokeRect(18, 18, w - 36, 1064);
        tc.textAlign = "center";
        tc.fillStyle = "#9a7428";
        tc.font = `600 64px ${SERIF}`;
        tc.fillText(`APPARITION ${pad2(a.slot)}`, w / 2, 110);
        tc.fillStyle = "#5a5040";
        tc.font = `italic 400 32px ${SERIF}`;
        tc.fillText(`they fell so it could appear · #${a.item}`, w / 2, 160);
        tc.fillStyle = "#3a3228";
        tc.font = `500 34px ${SERIF}`;
        p.of(a).forEach((x, j) => {
          const col = j < 13 ? 0 : 1;
          tc.fillText(`#${x.item}`, w / 2 + (col ? 140 : -140), 240 + (j % 13) * 64);
        });
        tex.needsUpdate = true;
      });
    } finally {
      atlas.close();
    }
  })();

  k.finish(f);
  return { spawn: new THREE.Vector3(0, 0, -2.6), yaw: 0 };
}

/**
 * What the mourners say: one line each, about a real purged zkSNARK (its id, rank, lineage, the
 * Apparition it went into). Neighbours are true neighbours: the speaker is the next number in the
 * collection, still here, beside the hole. Family ties are the mourners' own.
 */
function testimonies(data: Collection, n: number): { speaker: number; text: string }[] {
  const p = data.purge;
  const gone = new Set(p.purged.map((x) => x.item));
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const pick = () => p.purged[Math.floor(rnd() * p.purged.length)];
  const rarest = [...p.purged].filter((x) => x.rank != null).sort((a, b) => a.rank! - b.rank!)[0];
  const appName = (x: { item: number }) => p.purgedFor.get(x.item)?.name ?? "an Apparition";
  const lineage = (x: { traits: { trait_type: string; value: string }[] }) => x.traits.find((t) => t.trait_type === "Lineage")?.value ?? "";
  const kin = ["brother", "sister", "father", "mother", "cousin", "best friend", "twin", "uncle"];
  const out: { speaker: number; text: string }[] = [];
  const visitor = () => {
    let v = 1 + Math.floor(rnd() * 9999);
    while (gone.has(v) || p.appOf.has(v)) v = 1 + Math.floor(rnd() * 9999);
    return v;
  };
  const make: (() => { speaker: number; text: string } | null)[] = [
    () => {
      // a true neighbour: the next number, same row of the 10,000, still here
      for (let k = 0; k < 50; k++) {
        const x = pick();
        const nb = x.item + 1;
        if (x.item % 100 !== 0 && !gone.has(nb) && !p.appOf.has(nb)) return { speaker: nb, text: `#${x.item} stood right next to me in the 10,000. Now there's a hole where it was.` };
      }
      return null;
    },
    () => {
      const x = pick();
      return { speaker: visitor(), text: `I lost my ${kin[Math.floor(rnd() * kin.length)]}, #${x.item}. Burned for ${appName(x)}.` };
    },
    () => ({ speaker: visitor(), text: `#${rarest.item} was the rarest of us to go. Rank ${rarest.rank!.toLocaleString("en-US")}. They burned it anyway.` }),
    () => {
      const x = pick();
      return { speaker: visitor(), text: `They say ${appName(x)} is beautiful. It's made of my ${kin[Math.floor(rnd() * kin.length)]}'s pixels. #${x.item}.` };
    },
    () => ({ speaker: visitor(), text: `We were ${p.minted.toLocaleString("en-US")}. Now we're ${p.supply.toLocaleString("en-US")}.` }),
    () => {
      const x = pick();
      return { speaker: visitor(), text: `My ${kin[Math.floor(rnd() * kin.length)]} #${x.item} didn't even get a goodbye. One purge, 26 gone.` };
    },
    () => {
      const x = pick();
      const l = lineage(x);
      return { speaker: visitor(), text: `#${x.item} was ${l === "Bare" ? "Bare, like most of the names on these walls" : l || "one of us"}. I come here every block.` };
    },
    () => ({ speaker: visitor(), text: `676 names. I knew three of them. That's three too many.` }),
    () => {
      const x = pick();
      return { speaker: visitor(), text: `Rank ${(x.rank ?? 0).toLocaleString("en-US")}. People called #${x.item} common. Not to me.` };
    },
    () => ({ speaker: visitor(), text: `Twenty-six for one Apparition. Was it worth it? Ask the flame.` }),
  ];
  for (let i = 0; out.length < n && i < n * 4; i++) {
    const r = make[i % make.length]();
    if (r) out.push(r);
  }
  return out;
}

/** The curator's eulogy, from the purge's own figures. */
function eulogy(data: Collection): string[] {
  const p = data.purge;
  const rarest = [...p.purged].filter((x) => x.rank != null).sort((a, b) => a.rank! - b.rank!)[0];
  const lin = new Map<string, number>();
  for (const x of p.purged) {
    const v = x.traits.find((t) => t.trait_type === "Lineage")?.value ?? "";
    lin.set(v, (lin.get(v) ?? 0) + 1);
  }
  const [topLin, topN] = [...lin].sort((a, b) => b[1] - a[1])[0];
  return [
    `Friends. We are here for the ${p.purged.length}.`,
    `${p.apps.length} purges. ${p.apps.length} Apparitions. Not one of them asked to go.`,
    `The rarest of them was #${rarest.item}. Rank ${rarest.rank!.toLocaleString("en-US")}.`,
    `${topN} of them were ${topLin}. Plain, quiet: the backbone of this collection.`,
    "Every pixel of every Apparition was one of them first.",
    `We were ${p.minted.toLocaleString("en-US")}. We are ${p.supply.toLocaleString("en-US")}.`,
    "Let us keep a moment of silence.",
  ];
}
