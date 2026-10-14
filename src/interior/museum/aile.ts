import * as THREE from "three";
import { atlasBitmap } from "../../data/atlas";
import { EXPLORER, ZScan } from "../../data/zscan";
import type { Collection } from "./data";
import { canvasTex, FACE, type MuseumKit } from "./kit";
import { SERIF } from "./parts";
import { FusionSculpture } from "./fusion";
import { Orrery, PiercedWall, plaque, Tubes, Vortex } from "./sculptures";
import { cartel, drawFrieze, drawStats } from "./purgeviz";

/**
 * Floor 4, the Aile des Apparitions: a contemporary wing in black and polished concrete for the
 * zkSNARKs purge (burn 26, reveal 1). In the middle, LA FUSION, a sculpture of floating pixels that
 * replays every Apparition being born from its 26; down the axis after it the Vortex, the Orrery,
 * the 26 Glass Tubes and, at the end, the Pierced Wall (sculptures.ts). Down both walls the 26
 * Apparitions, each above the frieze of the 26 it cost; beside the lifts, Les 26 on one canvas.
 */

const X = 15,
  L = -90,
  H = 10;
const VIEWS = `${EXPLORER}/collection/zksnarks?tab=apparitions`;

export function aile(k: MuseumKit, data: Collection) {
  const f = 4;
  const g = k.groups[f];
  const wallMat = new THREE.MeshStandardMaterial({ color: "#16161a", roughness: 0.92 });
  const concrete = new THREE.MeshStandardMaterial({ color: "#2c2c30", roughness: 0.28, metalness: 0.15, envMapIntensity: 0.8 });
  const slab = new THREE.MeshStandardMaterial({ color: "#0e0e11", roughness: 0.6, metalness: 0.2 });

  // ---- the room ----------------------------------------------------------------------------------
  k.plane(f, concrete, 2 * X, -L, 0, 0, L / 2);
  k.plane(f, new THREE.MeshStandardMaterial({ color: "#0c0c0f", roughness: 0.9 }), 2 * X, -L, 0, H, L / 2, Math.PI / 2);
  k.wall(f, wallMat, -X, 0, X, 0, H);
  k.wall(f, wallMat, -X, L, X, L, H);
  k.wall(f, wallMat, -X, 0, -X, L, H);
  k.wall(f, wallMat, X, 0, X, L, H);
  // light slots in the ceiling, a thin gold line along the skirting
  for (const x of [-7.5, 0, 7.5]) k.box(f, k.lit("#eef2ff", 0.6), 0.16, 0.04, -L - 4, x, H - 0.05, L / 2);
  for (const s of [-1, 1]) k.box(f, k.gold, 0.04, 0.06, -L, s * (X - 0.21), 0.12, L / 2);

  // ---- by the lifts: the name, the totem ------------------------------------------------------------
  const name = k.panel(f, 2048, 300, 11, (c, w, h) => {
    c.fillStyle = "#f2eee6";
    c.font = `italic 500 150px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Aile des Apparitions", w / 2, h / 2);
  });
  name.position.set(0, 6.4, -0.24);
  name.rotation.y = FACE.nz;
  k.box(f, slab, 2.6, 4.4, 0.4, -9, 0, -8, { solid: true });
  const stats = k.panel(f, 1000, 1600, 2.3, (c, w, h) => drawStats(c, w, h, null), { glow: true, transparent: false });
  stats.position.set(-9, 0.4 + 1.84, -8 + 0.21);
  k.pick(f, stats, "<b>Apparitions</b><span>purge 26, reveal 1</span>", () => ({ eyebrow: "Aile des Apparitions", title: "Purge 26. Reveal 1.", body: "<p>A holder burns 26 zkSNARKs; one treasury snark is transformed into an Apparition. 26 in all.</p>", link: { href: VIEWS, label: "ZScan" } }));

  // ---- beside the lifts: Les 26, every Apparition on one canvas, framed like the 10,000 below ----
  // 7 × 4 (the last row two short), 250 px a cell
  const L26 = { x: 10.6, w: 7.2 };
  const h26 = (L26.w * 1000) / 1750;
  const t26 = canvasTex(1750, 1000, (c, w, h) => {
    c.fillStyle = "#0d0d0e";
    c.fillRect(0, 0, w, h);
  });
  t26.magFilter = THREE.NearestFilter;
  const les26 = new THREE.Mesh(new THREE.PlaneGeometry(L26.w, h26), new THREE.MeshBasicMaterial({ map: t26, color: "#ece6dc" }));
  les26.position.set(L26.x, 1.5 + h26 / 2, -0.27);
  les26.rotation.y = FACE.nz;
  g.add(les26);
  for (const [w, h, dx, y] of [
    [L26.w + 0.5, 0.25, 0, 1.25],
    [L26.w + 0.5, 0.25, 0, 1.5 + h26],
    [0.25, h26 + 0.5, -(L26.w / 2 + 0.12), 1.25],
    [0.25, h26 + 0.5, L26.w / 2 + 0.12, 1.25],
  ])
    k.box(f, k.gold, w, h, 0.18, L26.x + dx, y, -0.3);
  k.wash(f, L26.x, -0.28, FACE.nz, 8, 5, 6.2, "#fff0d8");
  const lab26 = k.panel(f, 900, 220, 1.6, (c, w, h) => {
    c.fillStyle = "#efe9dc";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#1d1a17";
    c.font = `700 64px ${SERIF}`;
    c.fillText("Les 26", 30, 90);
    c.font = `500 36px "JetBrains Mono", Menlo, monospace`;
    c.fillStyle = "#6a1c1c";
    c.fillText("Apparitions 01 → 26", 30, 170);
  });
  // (the canvas faces −z: seen from the room, its left edge is at +x)
  lab26.position.set(L26.x + L26.w / 2 - 0.8, 0.85, -0.3);
  lab26.rotation.y = FACE.nz;
  const appAt = (hit: THREE.Intersection) => {
    if (!hit.uv || !data.purge.apps.length) return null;
    const c = Math.floor(hit.uv.x * 7),
      r = Math.floor((1 - hit.uv.y) * 4);
    return data.purge.apps.find((a) => a.slot === r * 7 + c + 1) ?? null;
  };
  k.pick(
    f,
    les26,
    (hit) => {
      const a = appAt(hit);
      return a ? data.hover(a.item) : "<b>Les 26</b><span>every Apparition</span>";
    },
    (hit) => {
      const a = appAt(hit);
      return a ? data.info(a.item, "Aile des Apparitions · Les 26") : null;
    },
  );
  void (async () => {
    await k.whenVisited(f);
    if (!(await data.ready)) return;
    const c = (t26.image as HTMLCanvasElement).getContext("2d")!;
    c.imageSmoothingEnabled = false;
    const cell = 250;
    await Promise.all(
      data.purge.apps.map(async (a) => {
        const im = await k.image(ZScan.zkSnarkImage(a.item)).catch(() => null);
        if (!im) return;
        const i = a.slot - 1;
        c.drawImage(im, (i % 7) * cell + 8, Math.floor(i / 7) * cell + 8, cell - 16, cell - 16);
        t26.needsUpdate = true;
      }),
    );
  })();

  // ---- down the middle: LA FUSION, the Vortex, the Orrery, the Glass Tubes, the Pierced Wall --------
  const FZ = -18,
    VZ = -33,
    OZ = -51,
    TZ = -66,
    WZ = -86;
  const fusion = new FusionSculpture();
  fusion.group.position.set(0, 4.7, FZ);
  g.add(fusion.group);
  k.geo(f, slab, new THREE.CylinderGeometry(2.6, 2.8, 0.4, 48).translate(0, 0.2, FZ));
  k.geo(f, k.gold, new THREE.TorusGeometry(2.62, 0.035, 6, 64).rotateX(Math.PI / 2).translate(0, 0.4, FZ));
  k.solid(f, -2.8, FZ - 2.8, 2.8, FZ + 2.8);
  k.pool(f, 0, FZ, 7, "#cfe0ff", 0.012, 0.8);
  k.pick(
    f,
    fusion.hit,
    () => (fusion.current ? `<b>La Fusion · ${fusion.current.name}</b><span>its 26 purged snarks, pixel by pixel</span>` : "<b>La Fusion</b>"),
    () => (fusion.current ? data.info(fusion.current.item, "Aile des Apparitions · La Fusion") : null),
  );
  const vortex = new Vortex(k, f, 0, VZ);
  const orrery = new Orrery(k, f, 0, OZ);
  const tubes = new Tubes(k, f, 0, TZ, 7);
  const wall = new PiercedWall(k, f, WZ);
  const piece = (title: string, line: string, av: string) => () => ({ eyebrow: "Aile des Apparitions", title, body: `<p>${line}</p>`, link: { href: `${VIEWS}&av=${av}`, label: "ZScan" } });
  k.pick(f, vortex.hit, () => (vortex.current ? `<b>The Vortex · ${vortex.current.name}</b><span>its 26 drawn up into the eye</span>` : "<b>The Vortex</b>"), () =>
    vortex.current ? data.info(vortex.current.item, "Aile des Apparitions · The Vortex") : piece("The Vortex", "The 676 purged swirl up the funnel; every 6 seconds, 26 of them are drawn into the eye and come out as one Apparition.", "fusion")(),
  );
  plaque(k, f, 4.4, VZ + 4.4, "THE VORTEX", "The 676 purged, swirling. Every 6 seconds, 26 are drawn into the eye and become one.");
  const ORR = "26 Apparitions in orbit, each with its 26 purged snarks as moons. The closer a moon, the rarer the snark it was: gold ring the rarest band, pale ring the commonest.";
  k.pick(f, orrery.hit, "<b>The Orrery</b><span>closer moon, rarer snark</span>", piece("The Orrery", ORR, "strategies"));
  plaque(k, f, 4.4, OZ + 10.2, "THE ORRERY", "Each Apparition with its 26 as moons. Closer moon, rarer snark.");
  for (const h of tubes.hits)
    k.pick(
      f,
      h.mesh,
      () => (h.app() ? `<b>${h.app()!.name}</b><span>${h.line()}</span>` : "<b>Glass tube</b>"),
      () => (h.app() ? { ...data.info(h.app()!.item, "Aile des Apparitions · The 26 Tubes"), body: `<p>Its 26, by lineage: ${h.line()}.</p>` } : null),
    );
  plaque(k, f, 0, TZ + 3.4, "THE 26 TUBES", "Each fills with the 26 purged for it, one layer each, coloured by lineage. Full, its Apparition appears.");
  k.pick(
    f,
    wall.wall,
    (hit) => {
      const id = wall.idAt(hit);
      return id ? data.hover(id) : null;
    },
    (hit) => {
      const id = wall.idAt(hit);
      return id ? data.info(id, "Aile des Apparitions · The Pierced Wall") : null;
    },
  );
  plaque(k, f, 5.6, WZ + 5, "THE PIERCED WALL", "The 10,000. The light comes through the 676 that were purged.");
  k.ticks[f].push((_dt, t) => {
    fusion.update(t, k.cam);
    vortex.update(t, k.camQuat);
    orrery.update(t, k.camQuat);
    tubes.update(t, k.camQuat);
    wall.update(t, k.camQuat);
  });

  // ---- the 26 down the walls, each above its frieze -------------------------------------------------
  const friezes: { tex: THREE.Texture; i: number }[] = [];
  for (let i = 0; i < 26; i++) {
    const s = i < 13 ? -1 : 1;
    const z = -8 - (i % 13) * 4;
    const x = s * (X - 0.25);
    const yaw = s < 0 ? FACE.px : FACE.nx;
    k.hang(f, { x, y: 3.6, z, yaw, s: 2.2, tone: 2 });
    const tex = canvasTex(416, 64, (c) => {
      c.fillStyle = "#000";
      c.fillRect(0, 0, 416, 64);
    });
    tex.magFilter = THREE.NearestFilter;
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2 * (64 / 416)), new THREE.MeshBasicMaterial({ map: tex, color: "#d8d8d8" }));
    fr.position.set(x - s * 0.02, 1.95, z);
    fr.rotation.y = yaw;
    g.add(fr);
    friezes.push({ tex, i });
    k.wash(f, x - s * 0.05, z, yaw, 3.4, 5, H - 1.2, "#e8eeff");
  }

  // ---- once the floor is visited and the purge known: draw it all ---------------------------------------
  void (async () => {
    await k.whenVisited(f);
    const ok = await data.ready;
    if (!ok || !data.purge.apps.length) return;
    const atlas = await atlasBitmap().catch(() => null);
    if (!atlas) return;
    try {
      const p = data.purge;
      fusion.load(p, atlas);
      vortex.load(p);
      orrery.load(p);
      tubes.load(p);
      wall.load(p, k, f);
      const paint = (m: THREE.Mesh, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) => {
        const t = (m.material as THREE.MeshBasicMaterial).map!;
        const cv = t.image as HTMLCanvasElement;
        draw(cv.getContext("2d")!, cv.width, cv.height);
        t.needsUpdate = true;
      };
      paint(stats, (c, w, h) => drawStats(c, w, h, p));
      for (const { tex, i } of friezes) {
        const a = p.apps[i];
        if (!a) continue;
        const cv = tex.image as HTMLCanvasElement;
        drawFrieze(cv.getContext("2d")!, cv.width, cv.height, p.of(a), atlas);
        tex.needsUpdate = true;
      }
    } finally {
      atlas.close();
    }
  })();

  // ---- the paintings get their Apparitions (index.ts fills hangs by id once the data is in) ------------
  const fill = () => {
    const p = data.purge;
    k.hangs[f].forEach((h, i) => {
      const a = p.apps[i];
      if (!a) return;
      h.id = a.item;
      k.showPortrait(f, i, a.item);
      k.drawLabel(f, i, ...cartel(a, p.of(a)));
    });
  };

  // ---- light and people ---------------------------------------------------------------------------------
  k.light(f, -4, 8.5, FZ, "#dfe8ff", 30, 22);
  k.light(f, 4, 8.5, FZ, "#dfe8ff", 30, 22);
  k.light(f, 0, 6, -6, "#fff2e0", 20, 18);
  k.light(f, 0, 8, VZ, "#dfe8ff", 22, 20);
  k.light(f, 0, 7.5, OZ, "#ffe2b0", 26, 24);
  k.light(f, 0, 7, TZ - 4, "#e8f2ff", 24, 20);
  let n = 0;
  const id = () => k.visitor(4000 + n++);
  for (const [x, z, ph] of [
    // round the sides, so the piece stays in view from the lifts
    [-6.4, FZ + 1.4, true],
    [-5.6, FZ + 4.2, false],
    [6.2, FZ + 2.2, true],
    [5.4, FZ - 3.6, false],
    [-6, FZ - 3, false],
  ] as const)
    void k.person(f, id(), [x, z], { face: [0, FZ], phone: ph });
  // round the pieces, off the axis so they stay in view; some under the Orrery, looking up
  for (const [x, z, fx, fz] of [
    [-5, VZ + 3.6, 0, VZ],
    [5.6, VZ + 2.4, 0, VZ],
    [-3.4, OZ + 4.2, 0, OZ],
    [2.6, OZ - 3, 0, OZ],
    [-2.2, TZ - 1.4, -2.6, TZ - 6],
    [3.4, TZ - 1.6, 3.6, TZ - 6],
    [-3.2, WZ + 6, 0, WZ],
    [2.4, WZ + 4.4, 0, WZ],
    [-11.6, -16, -X, -16],
    [11.8, -28, X, -28],
    [-11.4, -40, -X, -40],
  ] as const)
    void k.person(f, id(), [x, z], { face: [fx, fz], phone: x === 5.6 || x === 2.4 || x === -2.2 });
  const walk: [number, number][] = [
    [-10, -12],
    [10, -20],
    [-10, -34],
    [10, -52],
    [-8, -78],
    [0, -14],
  ];
  for (let i = 0; i < 3; i++) void k.person(f, id(), walk[i * 2], { wander: walk });
  void k.person(f, id(), [5.2, -3], { guard: true, face: [0, -10] });
  // before Les 26: one photographs it, one takes a selfie with it
  void k.person(f, id(), [9.4, -3.8], { face: [9.4, 0], phone: true });
  void k.person(f, id(), [12.2, -2.8], { face: [12.2, 0], selfie: true });

  k.finish(f);
  return { spawn: new THREE.Vector3(0, 0, -2.6), yaw: 0, fill };
}
