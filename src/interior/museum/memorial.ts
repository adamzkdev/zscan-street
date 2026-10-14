import * as THREE from "three";
import { atlasBitmap } from "../../data/atlas";
import type { Collection } from "./data";
import { boxGeo, canvasTex, FACE, type MuseumKit } from "./kit";
import { coffers, limestone, marble, stoneFloor } from "./look";
import { SERIF } from "./parts";
import { pad2, type PApp } from "./purge";
import { snark } from "./purgeviz";
import { banquette } from "./voxels";

/**
 * Floor 5, the Mémorial des Purgés: a high hall of pale stone for the 676 zkSNARKs burned to
 * reveal the Apparitions. On the far wall, under AUX 676 zkSNARKs PURGÉS · LA COLLECTION
 * RECONNAISSANTE, the Wall of the Purged: all 676 portraits, 26 by 26, one row per Apparition. Before
 * it, on a granite plinth, the Snark Purgé Inconnu in bronze: the silhouette all 676 share (every
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
    c.fillText("Mémorial des Purgés", w / 2, h / 2);
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
    c.fillText("AUX 676 zkSNARKs PURGÉS · LA COLLECTION RECONNAISSANTE", w / 2, h / 2 + 6);
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
      return id != null ? data.hover(id) : "<b>Le Mur des Purgés</b><span>all 676, one row per Apparition</span>";
    },
    (hit) => {
      const id = cellAt(hit);
      return id != null ? data.info(id, "Mémorial des Purgés") : { eyebrow: "Mémorial des Purgés", title: "Le Mur des Purgés", body: "<p>All 676 zkSNARKs burned for the Apparitions, one row per Apparition, its own portrait at the start of the row.</p>" };
    },
  );

  // ---- the Snark Purgé Inconnu: plinth, bronze, flame, wreaths ---------------------------------------
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
    c.fillText("AU SNARK PURGÉ INCONNU", w / 2, 150);
    c.font = `italic 500 50px ${SERIF}`;
    c.fillText("la silhouette des 676", w / 2, 250);
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
  k.pick(f, statueHit, "<b>Au Snark Purgé Inconnu</b><span>the silhouette the 676 share</span>", () => ({
    eyebrow: "Mémorial des Purgés",
    title: "Au Snark Purgé Inconnu",
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
  k.ticks[f].push((_dt, t) => {
    flames.forEach((m, i) => {
      const n = Math.sin(t * 9 + i * 2.1) * 0.5 + Math.sin(t * 15.3 + i) * 0.3 + Math.sin(t * 4.1 + i * 1.7) * 0.2;
      m.scale.set(1 + n * 0.08, 1 + n * 0.16, 1);
      m.rotation.y = (i * Math.PI) / 3 + Math.sin(t * 0.7 + i) * 0.2;
    });
    if (fire) fire.intensity = (fire.userData.base as number) * (1 + Math.sin(t * 13) * 0.14 + Math.sin(t * 7.3) * 0.1);
  });
  k.pool(f, 0, FZ, 3.2, "#ffb060", 0.012, 1.2);
  k.pick(f, (() => {
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.4), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 1.2, FZ);
    g.add(hit);
    return hit;
  })(), "<b>La flamme du souvenir</b><span>for the 676</span>", () => ({ eyebrow: "Mémorial des Purgés", title: "La flamme du souvenir", body: "<p>It burns for the 676 zkSNARKs purged so that 26 Apparitions could be revealed.</p>" }));
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
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.12), flameMat);
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
  // in a half ring a little aside, so the statue stays in view down the hall
  for (const [x, z, flowers] of [
    [-3.4, FZ + 1.6, true],
    [-4.2, FZ + 3.6, false],
    [3.3, FZ + 1.8, true],
    [4.4, FZ + 3.4, false],
    [-5.6, FZ + 0.4, false],
  ] as const)
    void k.person(f, id(), [x, z], { face: [0, SZ], item: flowers ? "flowers" : undefined });
  for (const [x, z, fx] of [
    [-11.2, -9, -X],
    [-11.4, -24, -X],
    [11.3, -14, X],
    [11.2, -30, X],
  ] as const)
    void k.person(f, id(), [x, z], { face: [fx, z] });
  void k.person(f, id(), [-0.6, -14.3], { perch: 0.45, face: [0, SZ] });
  void k.person(f, id(), [0.8, -22.3], { perch: 0.45, face: [0, SZ] });
  void k.person(f, id(), [5, L + 4], { face: [3, L], selfie: true });

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
        tc.fillText(`morts pour l'Apparition · #${a.item}`, w / 2, 160);
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
