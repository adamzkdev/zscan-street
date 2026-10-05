import * as THREE from "three";
import { Market } from "../data/market";
import { get } from "../data/zscan";
import { fitText } from "../scene/fit";
import { Snark, loadArt } from "../scene/snark";
import { hash } from "../scene/voxel/model";
import type { Book } from "../ui/reader";
import { box, glowMat, makeScene, std, textPlane, wall } from "./kit";
import type { Interior, InteriorContext, PickInfo, Rect } from "./types";

/**
 * The ZK TOWER (秘密マンション): a condo tower between the MEMPOOL shop and zkCARDS, seven levels of
 * 24 × 18 m with glass all round onto the night city.
 *   G  grand lobby — double height, marble, concierge, lounge, a water wall, mailboxes
 *   1  offices — open plan with live screens, a glass meeting room, phone booths, the coffee bar,
 *      the ZIP of the day on the whiteboard (open it and read)
 *   2  game hall — every arcade game in one room (ZEC Snake, Memory, ZIP Quiz, Block Stacker),
 *      billiards, air hockey, a claw machine
 *   3  gym — treadmills, bikes (pedal at the network's hashrate), weights, a punching bag
 *   4  pool — an infinity pool in three lanes (Sapling, Orchard, Ironwood, live pool sizes),
 *      swimmers, a jacuzzi, loungers
 *   5  residences — flats off a corridor, three of them open
 *   R  rooftop — garden, bar, loungers, a telescope, the helipad; fireworks for every new block
 * Only the floor you are on is drawn and lit (each has the same four lights, so changing floor
 * never recompiles a shader). The elevators on the west wall go up and down.
 */

const X0 = -12,
  X1 = 12,
  Z0 = -18,
  Z1 = 0;
const LEVELS = [
  { label: "G", name: "Grand lobby · concierge, lounge", y: 0, h: 6 },
  { label: "1", name: "Offices · coworking, meeting room", y: 6.4, h: 4 },
  { label: "2", name: "Game hall · arcade, billiards", y: 10.8, h: 4.4 },
  { label: "3", name: "Gym · cardio, weights, boxing", y: 15.6, h: 4 },
  { label: "4", name: "Pool · infinity pool, jacuzzi", y: 20, h: 4.4 },
  { label: "5", name: "Residences · flats 501–506", y: 24.8, h: 3.6 },
  { label: "R", name: "Rooftop · bar, garden, helipad", y: 28.8, h: 0 },
];
const LIGHTS_PER_FLOOR = 4;

type Tick = (dt: number, t: number) => void;

function canvas(w: number, h: number, draw?: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw?.(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, g, t };
}

/** The night city all round the tower: a sky and a skyline of lit windows. */
function skyline() {
  const { t } = canvas(2048, 512, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, "#07061a");
    sky.addColorStop(0.55, "#1c1240");
    sky.addColorStop(0.78, "#5a2a5a");
    sky.addColorStop(1, "#140c1c");
    g.fillStyle = sky;
    g.fillRect(0, 0, 2048, 512);
    for (let i = 0; i < 160; i++) {
      const w = 18 + hash(i, 1, 1, 1) * 60,
        h = 80 + hash(i, 2, 1, 1) * 300,
        x = hash(i, 3, 1, 1) * 2048;
      g.fillStyle = `hsl(${250 + hash(i, 4, 1, 1) * 30} 25% ${8 + hash(i, 5, 1, 1) * 8}%)`;
      g.fillRect(x, 512 - h, w, h);
      for (let y = 512 - h + 6; y < 506; y += 9)
        for (let xx = x + 3; xx < x + w - 4; xx += 7)
          if (hash(xx | 0, y, i, 7) > 0.62) {
            g.fillStyle = hash(xx | 0, y, i, 8) > 0.5 ? "#ffd28a" : hash(xx | 0, y, i, 9) > 0.5 ? "#7fe3ff" : "#ff7ab0";
            g.fillRect(xx, y, 3, 4);
          }
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

/** Polished marble tiles with a faint vein. */
function marble() {
  const { t } = canvas(256, 256, (g) => {
    g.fillStyle = "#e9e5de";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(120,110,100,${0.05 + hash(i, 1, 2, 3) * 0.1})`;
      g.lineWidth = 1 + hash(i, 2, 2, 3) * 2;
      g.beginPath();
      g.moveTo(hash(i, 3, 2, 3) * 256, 0);
      g.bezierCurveTo(hash(i, 4, 2, 3) * 256, 90, hash(i, 5, 2, 3) * 256, 170, hash(i, 6, 2, 3) * 256, 256);
      g.stroke();
    }
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(0, 0, 256, 2);
    g.fillRect(0, 0, 2, 256);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 6);
  return t;
}

/** Pool water: caustic ripples, scrolled every frame. */
function water() {
  const { t } = canvas(256, 256, (g) => {
    g.fillStyle = "#1a8fb8";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(200,250,255,${0.15 + hash(i, 1, 4, 4) * 0.25})`;
      g.lineWidth = 1.5;
      g.beginPath();
      const x = hash(i, 2, 4, 4) * 256,
        y = hash(i, 3, 4, 4) * 256,
        r = 6 + hash(i, 4, 4, 4) * 18;
      g.ellipse(x, y, r, r * 0.6, hash(i, 5, 4, 4) * 3, 0, Math.PI * 2);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  return t;
}

export function buildTower(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#07061a");
  const groups = LEVELS.map(() => new THREE.Group());
  for (const g of groups) scene.add(g);
  const rects: Rect[][] = LEVELS.map(() => []);
  const people: Snark[][] = LEVELS.map(() => []);
  const ticks: Tick[][] = LEVELS.map(() => []);
  const lightCount = LEVELS.map(() => 0);
  const pickables: THREE.Object3D[] = [];
  const picks = new Map<THREE.Object3D, (hit?: THREE.Intersection) => PickInfo | null>();
  const hovers = new Map<THREE.Object3D, string>();
  const floorOf = new Map<THREE.Object3D, number>();
  let current = 0;
  let height = 0;
  ctx.onBlock((h) => (height = h));

  // shared materials
  const glass = new THREE.MeshStandardMaterial({ color: "#9cc3df", transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.3, depthWrite: false });
  const mullion = std("#2a2832", 0.4, 0.6);
  const walnut = std("#4a3020", 0.6);
  const darkMat = std("#1c1a22", 0.5, 0.3);
  const white = std("#ece8e0", 0.6);
  const chrome = std("#c8ccd4", 0.2, 0.9);

  // outside the glass: the real street, rendered from the tower at each floor's height (a drawn
  // skyline only if that isn't available)
  const fallback = new THREE.Mesh(new THREE.CylinderGeometry(46, 46, 60, 48, 1, true), new THREE.MeshBasicMaterial({ map: skyline(), side: THREE.BackSide, toneMapped: false }));
  fallback.position.set(0, 18, -9);
  scene.add(fallback);

  // ---- helpers ------------------------------------------------------------------------------------
  const pick = (f: number, o: THREE.Object3D, hover: string, info: (hit?: THREE.Intersection) => PickInfo | null) => {
    pickables.push(o);
    floorOf.set(o, f);
    hovers.set(o, hover);
    picks.set(o, info);
  };
  const light = (f: number, x: number, z: number, color = "#ffe6c8", intensity = 8, dy = -0.4) => {
    if (lightCount[f] >= LIGHTS_PER_FLOOR) return;
    lightCount[f]++;
    const l = new THREE.PointLight(color, intensity, 20, 1.5);
    l.position.set(x, LEVELS[f].y + (LEVELS[f].h || 4) + dy, z);
    groups[f].add(l);
  };
  const person = async (f: number, id: number, at: [number, number], role: string, o: { face?: THREE.Vector3; wander?: [number, number][]; dy?: number; bob?: number } = {}) => {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      const base = LEVELS[f].y + (o.dy ?? 0);
      s.root.position.set(at[0], base, at[1]);
      s.faceDir = o.face ?? new THREE.Vector3(0, 0, 1);
      groups[f].add(s.root);
      people[f].push(s);
      if (o.bob) ticks[f].push((_, t) => (s.root.position.y = base + Math.abs(Math.sin(t * o.bob! + id)) * 0.08));
      if (!o.wander) return s;
      void (async () => {
        for (;;) {
          await new Promise((r) => setTimeout(r, 4000 + Math.random() * 6000));
          if (current !== f) continue;
          s.faceDir = null;
          const w = o.wander![Math.floor(Math.random() * o.wander!.length)];
          await s.walk([new THREE.Vector3(w[0], base, w[1])], 0.9);
          s.faceDir = o.face ?? null;
        }
      })();
      return s;
    } catch {
      return null;
    }
  };
  const label = (f: number, text: string, x: number, y: number, z: number, o: { h?: number; color?: string; bg?: string; rot?: number; glow?: boolean } = {}) => {
    const p = textPlane(text, { h: o.h ?? 0.24, color: o.color ?? "#ffd28a", bg: o.bg, glow: o.glow ?? !o.bg });
    p.position.set(x, LEVELS[f].y + y, z);
    p.rotation.y = o.rot ?? 0;
    groups[f].add(p);
    return p;
  };
  /** A screen that redraws itself every few seconds (only while you are on its floor). */
  const screen = (f: number, w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, every = 3) => {
    const W = 512,
      H = Math.round((512 * h) / w);
    const s = canvas(W, H);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: s.t, toneMapped: false }));
    let acc = every;
    ticks[f].push((dt) => {
      acc += dt;
      if (acc < every) return;
      acc = 0;
      draw(s.g, W, H);
      s.t.needsUpdate = true;
    });
    draw(s.g, W, H);
    s.t.needsUpdate = true;
    groups[f].add(mesh);
    return mesh;
  };
  /** Floor slab, ceiling, glass on three sides (north, east, south), the core wall west. */
  const shell = (f: number, floorMat: THREE.Material, ceil: THREE.Material | null, o: { door?: boolean; wallMat?: THREE.Material } = {}) => {
    const { y, h } = LEVELS[f];
    const g = groups[f];
    box(g, X1 - X0, 0.2, Z1 - Z0, floorMat, 0, y - 0.2, (Z0 + Z1) / 2);
    if (ceil) box(g, X1 - X0, 0.2, Z1 - Z0, ceil, 0, y + h, (Z0 + Z1) / 2);
    const H = h || 1.1;
    rects[f].push(wall(g, X0, Z0, X0, Z1, H, o.wallMat ?? std("#2e2a36", 0.8), y));
    const pane = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), glass);
      m.position.set((x0 + x1) / 2, y + H / 2, (z0 + z1) / 2);
      m.rotation.y = x0 === x1 ? Math.PI / 2 : 0;
      g.add(m);
      const n = Math.max(1, Math.round(len / 2));
      for (let k = 0; k <= n; k++) box(g, 0.08, H, 0.08, mullion, x0 + ((x1 - x0) * k) / n, y, z0 + ((z1 - z0) * k) / n);
      rects[f].push([Math.min(x0, x1) - 0.1, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, Math.max(z0, z1) + 0.1]);
    };
    pane(X0, Z0, X1, Z0);
    pane(X1, Z0, X1, Z1);
    if (o.door) {
      pane(X0, Z1, -1.6, Z1);
      pane(1.6, Z1, X1, Z1);
    } else pane(X0, Z1, X1, Z1);
    // the roof's glass railing gets a chrome handrail
    if (!h) for (const [a, b, c, d] of [[X0, Z0, X1, Z0], [X1, Z0, X1, Z1], [X0, Z1, X1, Z1]] as const) box(g, Math.max(0.06, Math.abs(c - a)), 0.06, Math.max(0.06, Math.abs(d - b)), chrome, (a + c) / 2, y + H, (b + d) / 2);
  };
  /** The elevator bank on the core wall: ▲ goes up a floor, ▼ down. */
  const elevators = (f: number) => {
    const { y } = LEVELS[f];
    const g = groups[f];
    for (const [z, dir] of [
      [-7.4, 1],
      [-10.6, -1],
    ] as const) {
      const to = f + dir;
      if (to < 0 || to >= LEVELS.length) continue;
      const frame = box(g, 0.14, 2.6, 1.8, std("#8a8494", 0.4, 0.6), X0 + 0.18, y, z);
      const doors = box(g, 0.16, 2.3, 1.4, chrome, X0 + 0.2, y, z);
      box(g, 0.18, 2.3, 0.03, darkMat, X0 + 0.21, y, z);
      box(g, 0.05, 0.14, 0.6, glowMat(dir > 0 ? "#3ee08f" : "#ff9f2e", 1.6), X0 + 0.26, y + 2.72, z);
      label(f, `${dir > 0 ? "▲" : "▼"} ${LEVELS[to].label} · ${LEVELS[to].name.split(" · ")[0].toUpperCase()}`, X0 + 0.27, 3.0, z, { h: 0.16, color: dir > 0 ? "#3ee08f" : "#ff9f2e", rot: Math.PI / 2 });
      for (const o of [doors, frame]) pick(f, o, `<b>Elevator ${dir > 0 ? "up" : "down"}</b><span>${LEVELS[to].name}</span>`, () => ({ eyebrow: "Elevator", title: LEVELS[to].name, floor: to }));
    }
    rects[f].push([X0, -11.6, X0 + 0.5, -6.4]);
    label(f, `${LEVELS[f].label} · ${LEVELS[f].name.split(" · ")[0].toUpperCase()}`, X0 + 0.27, 3.45, -9, { h: 0.26, color: "#7fe3ff", rot: Math.PI / 2 });
  };
  const sofa = (g: THREE.Object3D, x: number, y: number, z: number, w: number, color: string, rot = 0) => {
    const s = new THREE.Group();
    s.position.set(x, y, z);
    s.rotation.y = rot;
    const m = std(color, 0.9);
    box(s, w, 0.42, 0.85, m, 0, 0, 0);
    box(s, w, 0.45, 0.2, m, 0, 0.42, -0.33);
    box(s, 0.2, 0.3, 0.85, m, -w / 2 + 0.1, 0.42, 0);
    box(s, 0.2, 0.3, 0.85, m, w / 2 - 0.1, 0.42, 0);
    g.add(s);
  };
  const plant = (f: number, x: number, z: number, big = false) => {
    const g = groups[f],
      y = LEVELS[f].y;
    box(g, big ? 0.7 : 0.45, big ? 0.6 : 0.45, big ? 0.7 : 0.45, std("#2a2630", 0.7), x, y, z);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(big ? 0.75 : 0.45, 0), std("#2f8a4a", 0.9));
    leaves.position.set(x, y + (big ? 1.4 : 0.85), z);
    g.add(leaves);
    rects[f].push([x - 0.4, z - 0.4, x + 0.4, z + 0.4]);
  };
  const liveTxt = {
    price: () => (Market.state.price ? `$${Market.state.price.usd.toFixed(2)}, ${Market.state.price.usd_24h_change >= 0 ? "+" : ""}${Market.state.price.usd_24h_change.toFixed(2)}% in 24 h.` : "Loading…"),
    mempool: () => `${ctx.director.mempoolList().length} transactions waiting at the MEMPOOL for the next bus.`,
    block: () => (height ? `Block ${height.toLocaleString("en-US")}.` : "Waiting for the next block."),
  };

  // ---- G: the grand lobby ----------------------------------------------------------------------------
  {
    const f = 0,
      g = groups[f],
      y = 0;
    shell(f, new THREE.MeshStandardMaterial({ map: marble(), roughness: 0.18, metalness: 0.1 }), std("#1a1720", 0.9), { door: true, wallMat: std("#3a3040", 0.7) });
    elevators(f);
    // the concierge's long desk, lit underneath, the concierge behind it
    box(g, 0.9, 1.1, 4.5, walnut, 7.5, y, -6);
    box(g, 1.0, 0.06, 4.6, white, 7.5, y + 1.1, -6);
    box(g, 0.04, 0.06, 4.4, glowMat("#ffd28a", 1.4), 7.03, y + 0.15, -6);
    rects[f].push([7, -8.3, 8, -3.7]);
    label(f, "CONCIERGE · コンシェルジュ", 11.85, 3.1, -6, { h: 0.3, rot: -Math.PI / 2 });
    void person(f, 2024, [8.6, -6], "Concierge", { face: new THREE.Vector3(-1, 0, 0) }).then((s) => {
      if (s) pick(f, s.body, "<b>Concierge</b><span>welcome to the ZK TOWER</span>", () => ({ eyebrow: "Concierge", title: "Welcome to the ZK TOWER", body: `<p>${LEVELS.slice(1).map((l) => `<b>${l.label}</b> ${l.name}`).join("<br>")}</p><p>The elevators are behind you, on the left.</p>` }));
    });
    // the water wall on the north side: dark stone, falling water, a shallow pool at its foot
    const fall = water();
    fall.repeat.set(2, 3);
    const wfall = new THREE.Mesh(new THREE.PlaneGeometry(6, 5.2), new THREE.MeshStandardMaterial({ map: fall, emissive: "#2a8ab0", emissiveMap: fall, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.2 }));
    wfall.position.set(0, y + 2.9, Z0 + 0.35);
    g.add(wfall);
    box(g, 6.4, 5.6, 0.2, std("#1a1820", 0.6), 0, y + 0.3, Z0 + 0.2);
    const pondTex = water();
    const basin = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.2), new THREE.MeshStandardMaterial({ map: pondTex, emissive: "#1a6a8a", emissiveIntensity: 0.4, roughness: 0.05, transparent: true, opacity: 0.85 }));
    basin.rotation.x = -Math.PI / 2;
    basin.position.set(0, y + 0.32, Z0 + 1.0);
    g.add(basin);
    box(g, 6.6, 0.3, 1.4, std("#2a2630", 0.5), 0, y, Z0 + 1.0);
    rects[f].push([-3.3, Z0, 3.3, Z0 + 1.8]);
    ticks[f].push((dt) => {
      fall.offset.y += dt * 0.5;
      pondTex.offset.x += dt * 0.03;
    });
    pick(f, wfall, "<b>The water wall</b><span>six metres of falling water</span>", () => ({ eyebrow: "Lobby", title: "The water wall", body: "<p>The infinity pool is on the 4th floor, the sky bar on the roof.</p>" }));
    // the lounge: two sofas round a low table on a rug, a chandelier of rings above
    box(g, 6, 0.01, 4.2, std("#5a3a4a", 0.95), -5, y + 0.005, -12.5);
    sofa(g, -5, y, -14, 3.2, "#3a4a6a");
    sofa(g, -5, y, -11, 3.2, "#3a4a6a", Math.PI);
    box(g, 1.8, 0.4, 0.9, walnut, -5, y, -12.5);
    rects[f].push([-6.7, -14.5, -3.3, -10.5]);
    for (let k = 0; k < 3; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2 - k * 0.3, 0.04, 6, 40), glowMat("#ffe2b0", 1.6));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, y + 4.8 - k * 0.35, -8);
      g.add(ring);
    }
    void person(f, 1111, [-5, -13.6], "Visitor", { face: new THREE.Vector3(0, 0, 1) });
    // mailboxes on the east pier, the directory by the elevators
    box(g, 0.2, 1.5, 2.7, darkMat, 11.8, y + 0.8, -13.05);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) box(g, 0.05, 0.3, 0.38, std(r % 2 ? "#5a6a8a" : "#4a4a5a", 0.4, 0.5), 11.68, y + 0.9 + r * 0.34, -12 - c * 0.42);
    rects[f].push([11.4, -14.5, 12, -11.6]);
    label(f, "MAIL · 郵便", 11.62, 2.6, -13.05, { h: 0.2, rot: -Math.PI / 2 });
    const dir = screen(f, 2, 1.25, (gc, W, H) => {
      gc.fillStyle = "#0b0a10";
      gc.fillRect(0, 0, W, H);
      gc.fillStyle = "#7fe3ff";
      gc.font = '700 30px "JetBrains Mono", monospace';
      fitText(gc, "ZK TOWER · DIRECTORY", 22, 42);
      gc.font = '500 21px "JetBrains Mono", monospace';
      LEVELS.slice(1)
        .reverse()
        .forEach((l, i) => {
          gc.fillStyle = "#ffd28a";
          gc.fillText(l.label, 22, 86 + i * 30);
          gc.fillStyle = "#e9eef7";
          fitText(gc, l.name, 64, 86 + i * 30);
        });
    }, 60);
    dir.position.set(X0 + 0.22, y + 1.7, -4.2);
    dir.rotation.y = Math.PI / 2;
    plant(f, -2.6, -0.8, true);
    plant(f, 2.6, -0.8, true);
    plant(f, 10.8, -16.6, true);
    plant(f, -10.4, -16.6, true);
    light(f, 0, -8, "#ffe2b0", 14);
    light(f, 7, -6, "#ffd8a8", 8);
    light(f, -5, -12.5, "#ffe6c8", 8);
    light(f, 0, -16, "#7fd8ff", 7);
  }

  // ---- 1: the offices -------------------------------------------------------------------------------
  {
    const f = 1,
      g = groups[f],
      y = LEVELS[f].y;
    shell(f, std("#3a3a44", 0.9), std("#5a5660", 0.95));
    elevators(f);
    // three live screens the desks share: price, mempool, last block
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
        const txs = ctx.director.mempoolList();
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
        fitText(gc, height ? `#${height.toLocaleString("en-US")}` : "…", 20, 140);
      },
    ];
    const liveInfo = [
      () => ({ eyebrow: "Office screen", title: "ZEC / USD", body: `<p>${liveTxt.price()}</p>` }),
      () => ({ eyebrow: "Office screen", title: "Mempool", body: `<p>${liveTxt.mempool()}</p>` }),
      () => ({ eyebrow: "Office screen", title: "Last block", body: `<p>${liveTxt.block()}</p>` }),
    ];
    // open-plan desks: three rows of four, two monitors each
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 4; c++) {
        const x = -6 + c * 3.4,
          z = -4.6 - r * 3.2;
        box(g, 1.6, 0.05, 0.8, white, x, y + 0.74, z);
        box(g, 0.05, 0.74, 0.7, chrome, x - 0.75, y, z);
        box(g, 0.05, 0.74, 0.7, chrome, x + 0.75, y, z);
        for (const dx of [-0.38, 0.38]) {
          const k = (r * 4 + c + (dx > 0 ? 1 : 0)) % 3;
          const mon = screen(f, 0.62, 0.38, live[k], 4 + k);
          mon.position.set(x + dx, y + 1.08, z - 0.28);
          box(g, 0.66, 0.42, 0.03, darkMat, x + dx, y + 0.87, z - 0.3);
          pick(f, mon, ["<b>ZEC price</b><span>live</span>", "<b>Mempool</b><span>live</span>", "<b>Last block</b><span>live</span>"][k], liveInfo[k]);
        }
        box(g, 0.5, 0.45, 0.5, std("#2a2a34", 0.8), x, y, z + 0.6);
        rects[f].push([x - 0.85, z - 0.45, x + 0.85, z + 0.45]);
        if (hash(r, c, 1, 1) > 0.45) void person(f, 300 + r * 10 + c, [x + (hash(r, c, 2, 2) - 0.5) * 0.6, z + 0.75], "Developer", { face: new THREE.Vector3(0, 0, -1) });
      }
    // the meeting room: glass box in the north-east corner, a long table, the big screen
    const MX0 = 5.5,
      MZ1 = -12.5;
    for (const [a, b, c, d] of [
      [MX0, MZ1, X1, MZ1],
      [MX0, Z0, MX0, MZ1],
    ] as const) {
      const len = Math.hypot(c - a, d - b);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 4), glass);
      p.position.set((a + c) / 2, y + 2, (b + d) / 2);
      p.rotation.y = a === c ? Math.PI / 2 : 0;
      g.add(p);
      box(g, a === c ? 0.06 : len, 0.06, a === c ? len : 0.06, mullion, (a + c) / 2, y + 3.94, (b + d) / 2);
    }
    rects[f].push([MX0, MZ1 - 0.1, 9, MZ1 + 0.1], [10.4, MZ1 - 0.1, X1, MZ1 + 0.1], [MX0 - 0.1, Z0, MX0 + 0.1, MZ1]);
    box(g, 3.6, 0.06, 1.4, walnut, 8.8, y + 0.75, -15.3);
    box(g, 0.3, 0.75, 0.3, chrome, 8.8, y, -15.3);
    rects[f].push([7, -16.1, 10.6, -14.5]);
    for (let k = 0; k < 4; k++) for (const dz of [-1, 1]) box(g, 0.5, 0.48, 0.5, std("#3a2a4a", 0.8), 7.4 + k * 0.95, y, -15.3 + dz);
    const big = screen(f, 3.2, 1.8, live[2], 5);
    big.position.set(8.75, y + 2.1, Z0 + 0.25);
    pick(f, big, "<b>Meeting room screen</b><span>the last block</span>", liveInfo[2]);
    label(f, "MEETING ROOM · 会議室", 7.7, 3.4, MZ1 + 0.02, { h: 0.2, color: "#7fe3ff" });
    void person(f, 7070, [8, -14.3], "Product lead", { face: new THREE.Vector3(0, 0, -1) });
    // the whiteboard: the ZIP of the day
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.6), new THREE.MeshStandardMaterial({ color: "#f4f4f0", roughness: 0.4 }));
    board.position.set(-4, y + 1.8, Z0 + 0.25);
    g.add(board);
    box(g, 3.7, 1.7, 0.04, chrome, -4, y + 0.95, Z0 + 0.2);
    let zipOfDay: Book | null = null;
    let boardText = label(f, "ZIP OF THE DAY · …", -4, 2.2, Z0 + 0.27, { h: 0.18, color: "#1c1a24", bg: "#f4f4f0" });
    void (async () => {
      let zips = (await get<{ slug: string; number: number | null; title: string; status: string; owners: string[]; created: string | null; url: string }[]>("/v1/zips")) ?? [];
      if (!zips.length) zips = await fetch(`${import.meta.env.BASE_URL}zips.json`).then((r) => (r.ok ? r.json() : []), () => []);
      const real = zips.filter((z) => z.number != null && z.status !== "Reserved");
      if (!real.length) return;
      const z = real[Math.floor(Date.now() / 86_400_000) % real.length];
      zipOfDay = { slug: z.slug, number: z.number, title: z.title, status: z.status, owners: z.owners, created: z.created, url: z.url, color: "#7fe3ff" };
      g.remove(boardText);
      boardText = label(f, `ZIP OF THE DAY · ${z.number}`, -4, 2.25, Z0 + 0.27, { h: 0.2, color: "#1c1a24", bg: "#f4f4f0" });
      label(f, z.title.length > 40 ? `${z.title.slice(0, 39)}…` : z.title, -4, 1.85, Z0 + 0.27, { h: 0.15, color: "#3a3640", bg: "#f4f4f0" });
      label(f, "click to read →", -4, 1.4, Z0 + 0.27, { h: 0.12, color: "#2a78d6", bg: "#f4f4f0" });
    })();
    pick(f, board, "<b>The whiteboard</b><span>today's ZIP · click to read</span>", () => (zipOfDay ? { eyebrow: "Whiteboard", title: zipOfDay.title, book: zipOfDay } : null));
    // the coffee bar in the south-east corner, steam when you order
    box(g, 3, 1.0, 0.7, walnut, 9.8, y, -1.2);
    box(g, 3.1, 0.06, 0.8, white, 9.8, y + 1.0, -1.2);
    const machine = box(g, 0.6, 0.6, 0.45, chrome, 10.6, y + 1.06, -1.25);
    box(g, 0.12, 0.08, 0.05, glowMat("#ff3e8a", 1.5), 10.6, y + 1.5, -1.0);
    rects[f].push([8.2, -1.6, 11.4, -0.8]);
    label(f, "COFFEE · 珈琲", 9.8, 2.4, -0.15, { h: 0.24, color: "#ff9f2e", rot: Math.PI });
    void person(f, 9191, [9.4, -0.55], "Barista", { face: new THREE.Vector3(0, 0, -1) });
    const steam = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Array(60).fill(0), 3)), new THREE.PointsMaterial({ color: "#ffffff", size: 0.06, transparent: true, opacity: 0.6, depthWrite: false }));
    steam.frustumCulled = false;
    g.add(steam);
    let steaming = 0;
    ticks[f].push((dt, t) => {
      steaming = Math.max(0, steaming - dt);
      steam.visible = steaming > 0;
      if (!steam.visible) return;
      const pos = steam.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 20; i++) {
        const k = (t * 0.6 + i / 20) % 1;
        pos.setXYZ(i, 10.6 + Math.sin(i * 7 + t * 2) * 0.06, y + 1.7 + k * 0.6, -1.15 + Math.cos(i * 3) * 0.05);
      }
      pos.needsUpdate = true;
    });
    let cups = 0;
    pick(f, machine, "<b>Coffee machine</b><span>click for an espresso</span>", () => {
      steaming = 4;
      cups++;
      return { eyebrow: "Coffee bar", title: "Shielded espresso ☕", body: `<p>Double shot, nothing revealed. ${cups} cup${cups > 1 ? "s" : ""} this visit.</p>` };
    });
    // phone booths by the core
    for (const z of [-14.6, -16.6]) {
      box(g, 1.4, 2.3, 1.6, std("#3a5a4a", 0.7), -10.4, y, z);
      box(g, 0.02, 1.6, 1.0, glass, -9.69, y + 0.4, z);
    }
    rects[f].push([-11.2, -17.5, -9.6, -13.7]);
    label(f, "PHONE BOOTHS", -10.4, 2.6, -13.75, { h: 0.18, color: "#7fe3ff" });
    plant(f, -10.4, -2, true);
    plant(f, 4.6, -16.8);
    light(f, -3, -5, "#f4f0ff", 9);
    light(f, -3, -11, "#f4f0ff", 9);
    light(f, 8.5, -15, "#cfe8ff", 7);
    light(f, 9.5, -2, "#ffd8a8", 6);
  }

  // ---- 2: the game hall: a Japanese arcade -----------------------------------------------------------
  {
    const f = 2,
      g = groups[f],
      y = LEVELS[f].y,
      h = LEVELS[f].h;
    // arcade carpet: deep navy with neon triangles, rings and squiggles
    const carpet = canvas(256, 256, (gc) => {
      gc.fillStyle = "#0e0b24";
      gc.fillRect(0, 0, 256, 256);
      const cols = ["#ff3e8a", "#3ef0ff", "#f4b728", "#b07bff", "#3ee08f"];
      for (let i = 0; i < 26; i++) {
        gc.strokeStyle = gc.fillStyle = cols[i % cols.length];
        gc.lineWidth = 3;
        const x = hash(i, 1, 9, 9) * 256,
          yy = hash(i, 2, 9, 9) * 256,
          s = 8 + hash(i, 3, 9, 9) * 10;
        const k = i % 3;
        gc.beginPath();
        if (k === 0) (gc.moveTo(x, yy - s), gc.lineTo(x + s, yy + s), gc.lineTo(x - s, yy + s), gc.closePath(), gc.stroke());
        else if (k === 1) (gc.arc(x, yy, s * 0.7, 0, Math.PI * 2), gc.stroke());
        else {
          gc.moveTo(x - s, yy);
          gc.bezierCurveTo(x - s / 2, yy - s, x + s / 2, yy + s, x + s, yy);
          gc.stroke();
        }
      }
    }).t;
    carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping;
    carpet.repeat.set(9, 7);
    shell(f, new THREE.MeshStandardMaterial({ map: carpet, emissive: "#ffffff", emissiveMap: carpet, emissiveIntensity: 0.18, roughness: 0.95 }), std("#09071a", 0.9), { wallMat: std("#1a1430", 0.8) });
    elevators(f);
    // neon tubes across the ceiling, both ways
    for (const [k, z] of [-3, -7.5, -12, -16].entries()) box(g, 22, 0.04, 0.05, glowMat(["#ff3e8a", "#3ef0ff", "#b07bff", "#f4b728"][k], 1.4), 0.5, y + h - 0.12, z);
    for (const [k, x] of [-6, 0, 6].entries()) box(g, 0.05, 0.04, 17, glowMat(["#3ef0ff", "#ff3e8a", "#3ee08f"][k], 1.1), x, y + h - 0.1, -9);

    // the entrance arch you walk under from the elevators
    for (const z of [-12.6, -5.4]) {
      box(g, 0.4, 3.6, 0.4, std("#1c1430", 0.5), -8.4, y, z);
      box(g, 0.06, 3.5, 0.06, glowMat("#ff3e8a", 1.8), -8.18, y, z);
    }
    box(g, 0.5, 0.7, 7.6, std("#1c1430", 0.5), -8.4, y + 3.6, -9);
    label(f, "ZK ARCADE · ゲームセンター", -8.7, 3.95, -9, { h: 0.42, color: "#ff3e8a", rot: -Math.PI / 2 });
    label(f, "ZK ARCADE · ゲームセンター", -8.1, 3.95, -9, { h: 0.42, color: "#3ef0ff", rot: Math.PI / 2 });
    rects[f].push([-8.7, -12.9, -8.1, -12.3], [-8.7, -5.7, -8.1, -5.1]);

    // the arcade row along the north glass: proper cabinets, each with its own art
    const ART: Record<string, { name: string; color: string; bg: string; side: string }> = {
      snake: { name: "ZEC SNAKE", color: "#3ee08f", bg: "#06120c", side: "#0f3a24" },
      invaders: { name: "SHIELDED INVADERS", color: "#7dffbe", bg: "#05040c", side: "#1a1040" },
      flappy: { name: "FLAPPY ZEC", color: "#f4b728", bg: "#0a1030", side: "#3a2a08" },
      whack: { name: "WHACK-A-LEAK", color: "#ff3e8a", bg: "#1a1430", side: "#3a0a20" },
      memory: { name: "zkSNARK MEMORY", color: "#b07bff", bg: "#100a1c", side: "#24104a" },
      kart: { name: "ZK KART", color: "#f4b728", bg: "#1f4a2a", side: "#3a2a08" },
    };
    const marquee = (gm: (typeof ART)[string], w = 256, hh = 192) =>
      canvas(w, hh, (gc) => {
        gc.fillStyle = gm.bg;
        gc.fillRect(0, 0, w, hh);
        for (let i = 0; i < 30; i++) {
          gc.fillStyle = `${gm.color}33`;
          gc.fillRect(hash(i, 1, 3, 3) * w, hash(i, 2, 3, 3) * hh, 4, 4);
        }
        gc.fillStyle = gm.color;
        gc.textAlign = "center";
        gc.font = '800 30px "JetBrains Mono", monospace';
        fitText(gc, gm.name, w / 2, hh * 0.45);
        gc.font = '600 15px "JetBrains Mono", monospace';
        gc.fillStyle = "#e9e0c8";
        gc.fillText("▶ PRESS START", w / 2, hh * 0.72);
      }).t;
    const cabinet = (x: number, z: number, rot: number, game: string) => {
      const gm = ART[game];
      const c = new THREE.Group();
      c.position.set(x, y, z);
      c.rotation.y = rot;
      const side = std(gm.side, 0.5, 0.2);
      const body = box(c, 0.8, 1.9, 0.8, std("#14121c", 0.4, 0.3), 0, 0, 0);
      for (const sx of [-0.41, 0.41]) {
        box(c, 0.02, 1.9, 0.8, side, sx, 0, 0);
        box(c, 0.025, 1.6, 0.04, glowMat(gm.color, 1.4), sx, 0.15, 0.38);
      }
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.48), new THREE.MeshBasicMaterial({ map: marquee(gm), toneMapped: false }));
      scr.position.set(0, 1.4, 0.36);
      scr.rotation.x = -0.25;
      c.add(scr);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.26, 0.12), new THREE.MeshBasicMaterial({ map: marquee(gm, 256, 80), toneMapped: false }));
      top.position.set(0, 1.85, 0.38);
      c.add(top);
      // the control panel: a joystick and three buttons
      box(c, 0.8, 0.1, 0.4, std("#24202e", 0.5), 0, 0.98, 0.5);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), chrome);
      stick.position.set(-0.18, 1.12, 0.52);
      c.add(stick);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std("#d0303a", 0.3));
      ball.position.set(-0.18, 1.19, 0.52);
      c.add(ball);
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12), glowMat(["#3ef0ff", "#f4b728", "#ff3e8a"][i], 1.2));
        b.position.set(0.05 + i * 0.09, 1.04, 0.5);
        c.add(b);
      }
      g.add(c);
      for (const o of [scr, body, top]) pick(f, o, `<b>${gm.name}</b><span>click to play</span>`, () => ({ eyebrow: "ZK Arcade", title: gm.name, game: game as never }));
    };
    const row = ["snake", "invaders", "flappy", "whack", "memory", "snake", "invaders", "flappy", "whack"];
    row.forEach((game, k) => cabinet(-6.4 + k * 1.15, Z0 + 0.75, 0, game));
    rects[f].push([-7, Z0, 3.4, Z0 + 1.25]);
    label(f, "VIDEO GAMES · ビデオゲーム", -1.8, 3.4, Z0 + 0.3, { h: 0.3, color: "#3ef0ff" });

    // the racing zone: three sit-down ZK KART simulators
    for (let k = 0; k < 3; k++) {
      const x = 6.3 + k * 2;
      const r = new THREE.Group();
      r.position.set(x, y, -14.4);
      box(r, 1.5, 1.0, 0.5, std("#14121c", 0.4, 0.3), 0, 0, -1.1);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.8), new THREE.MeshBasicMaterial({ map: marquee(ART.kart, 320, 190), toneMapped: false }));
      scr.position.set(0, 1.45, -0.98);
      r.add(scr);
      box(r, 1.5, 0.95, 0.06, std("#14121c", 0.4, 0.3), 0, 1.0, -1.02);
      box(r, 1.5, 0.08, 0.06, glowMat("#f4b728", 1.6), 0, 1.95, -0.98);
      box(r, 0.7, 0.75, 0.5, darkMat, 0, 0, -0.45);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 24), std("#1c1a22", 0.4));
      wheel.position.set(0, 0.95, -0.35);
      wheel.rotation.x = -0.6;
      r.add(wheel);
      // the bucket seat
      box(r, 0.6, 0.35, 0.6, std(["#d0303a", "#2a78d6", "#f4b728"][k], 0.7), 0, 0.15, 0.45);
      box(r, 0.6, 0.8, 0.15, std(["#d0303a", "#2a78d6", "#f4b728"][k], 0.7), 0, 0.5, 0.75);
      box(r, 0.7, 0.15, 1.6, darkMat, 0, 0, 0.1);
      g.add(r);
      rects[f].push([x - 0.8, -15.8, x + 0.8, -13.4]);
      for (const o of [scr, wheel]) pick(f, o, "<b>ZK KART</b><span>sit down and race</span>", () => ({ eyebrow: "Racing", title: "ZK KART", game: "kart" }));
    }
    label(f, "RACING · レース", 8.3, 3.5, -16.9, { h: 0.34, color: "#f4b728" });
    void person(f, 2601, [6.3, -13.6], "Racer", { face: new THREE.Vector3(0, 0, -1), dy: 0.15 });

    // the console lounge: a big screen, a sofa, the console on a low table
    const tv = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), new THREE.MeshBasicMaterial({ map: marquee(ART.kart, 512, 288), toneMapped: false }));
    tv.position.set(11.6, y + 1.7, -3);
    tv.rotation.y = -Math.PI / 2;
    g.add(tv);
    box(g, 0.12, 1.9, 3.3, darkMat, 11.72, y + 0.75, -3);
    box(g, 0.5, 0.5, 2.4, walnut, 11.4, y, -3);
    sofa(g, 8.2, y, -3, 2.6, "#3a2a6a", Math.PI / 2);
    box(g, 1, 0.35, 0.6, walnut, 9.6, y, -3);
    const console_ = box(g, 0.36, 0.08, 0.26, std("#ececf4", 0.3), 9.6, y + 0.35, -3);
    box(g, 0.3, 0.02, 0.02, glowMat("#3ef0ff", 2), 9.6, y + 0.43, -2.88);
    rects[f].push([7.7, -4.4, 10.2, -1.6], [11.1, -4.3, 12, -1.7]);
    for (const o of [tv, console_]) pick(f, o, "<b>ZK KART · console</b><span>grab a controller</span>", () => ({ eyebrow: "Console lounge", title: "ZK KART", game: "kart" }));
    label(f, "CONSOLE LOUNGE", 9.6, 3.4, -0.3, { h: 0.28, color: "#3ef0ff", rot: Math.PI });
    void person(f, 2602, [8.2, -2.4], "Player 2", { face: new THREE.Vector3(1, 0, 0) });

    // air hockey (playable) and a basketball machine
    box(g, 1.3, 0.85, 2.3, std("#ececf4", 0.35), -3, y, -9.5);
    box(g, 1.1, 0.02, 2.1, glowMat("#3ef0ff", 0.55), -3, y + 0.86, -9.5);
    box(g, 1.3, 0.06, 0.06, glowMat("#ff3e8a", 1.4), -3, y + 0.9, -10.62);
    box(g, 1.3, 0.06, 0.06, glowMat("#3ee08f", 1.4), -3, y + 0.9, -8.38);
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), std("#ff3e8a", 0.4));
    g.add(puck);
    ticks[f].push((_, t) => puck.position.set(-3 + Math.sin(t * 2.9) * 0.45, y + 0.88, -9.5 + Math.sin(t * 1.9) * 0.9));
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 2.3), new THREE.MeshBasicMaterial({ visible: false }));
    table.position.set(-3, y + 0.45, -9.5);
    g.add(table);
    pick(f, table, "<b>Air hockey</b><span>play the house</span>", () => ({ eyebrow: "ZK Arcade", title: "AIR HOCKEY", game: "hockey" }));
    rects[f].push([-3.7, -10.7, -2.3, -8.3]);
    label(f, "AIR HOCKEY", -3, 2.6, -10.8, { h: 0.24, color: "#3ef0ff" });
    const hoop = new THREE.Group();
    hoop.position.set(1, y, -10);
    box(hoop, 1.3, 0.9, 2.4, std("#2a1a3a", 0.5), 0, 0, 0);
    box(hoop, 1.3, 1.6, 0.06, std("#ececf4", 0.4), 0, 1.4, -1.2);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.015, 6, 20), std("#ff6a2a", 0.4));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 2.1, -0.95);
    hoop.add(rim);
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), std("#e8742a", 0.7));
      b.position.set(-0.4 + i * 0.2, 1.0, 0.9);
      hoop.add(b);
    }
    box(hoop, 1.3, 0.08, 0.06, glowMat("#f4b728", 1.5), 0, 2.25, -1.2);
    g.add(hoop);
    rects[f].push([0.3, -11.3, 1.7, -8.8]);
    let shots = 0,
      baskets = 0;
    pick(f, hoop.children[0], "<b>Basketball</b><span>shoot a ball</span>", () => {
      shots++;
      const ok = Math.random() < 0.45;
      if (ok) baskets++;
      return { eyebrow: "Basketball", title: ok ? "Swish! 🏀" : "Off the rim…", body: `<p>${baskets} / ${shots}</p>` };
    });
    label(f, "BASKET", 1, 2.9, -11.25, { h: 0.24, color: "#f4b728" });

    // claw machines by the core
    let tries = 0,
      won = 0;
    for (const [k, z] of [-14.2, -15.7, -17.2].entries()) {
      const claw = new THREE.Group();
      claw.position.set(-10.8, y, z);
      const tint = ["#ff7ab0", "#3ef0ff", "#f4b728"][k];
      box(claw, 1.2, 0.9, 1.2, std(tint, 0.5), 0, 0, 0);
      const glassBox = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.2, 1.15), glass);
      glassBox.position.y = 1.5;
      claw.add(glassBox);
      for (let i = 0; i < 9; i++) box(claw, 0.22, 0.22, 0.22, std(["#3ee08f", "#f4b728", "#b07bff", "#3ef0ff"][(i + k) % 4], 0.8), -0.35 + (i % 3) * 0.35, 0.9, -0.35 + Math.floor(i / 3) * 0.35);
      const arm = box(claw, 0.06, 0.4, 0.06, chrome, 0, 1.75, 0);
      ticks[f].push((_, t) => (arm.position.set(Math.sin(t * 0.7 + k) * 0.35, 1.75, Math.cos(t * 0.5 + k) * 0.35)));
      box(claw, 1.2, 0.2, 1.2, glowMat(tint, 1.2), 0, 2.1, 0);
      claw.rotation.y = Math.PI / 2;
      g.add(claw);
      pick(f, glassBox, "<b>Claw machine</b><span>try your luck</span>", () => {
        tries++;
        const win = Math.random() < 0.25;
        if (win) won++;
        return { eyebrow: "Claw machine", title: win ? "You got a plush zkSNARK! 🧸" : "So close…", body: `<p>${won} won out of ${tries} tries.</p>` };
      });
    }
    rects[f].push([-11.5, -17.9, -10.1, -13.5]);
    label(f, "UFO CATCHER · クレーンゲーム", -10.2, 3.2, -15.7, { h: 0.24, color: "#ff7ab0", rot: Math.PI / 2 });

    // the prize counter, an attendant, plushies on the shelves behind
    box(g, 3, 1.0, 0.7, std("#2a1a3a", 0.5), -9.4, y, -1.4);
    box(g, 3.1, 0.06, 0.8, glowMat("#f4b728", 0.6), -9.4, y + 1.0, -1.4);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) box(g, 0.25, 0.25, 0.25, std(["#3ee08f", "#f4b728", "#b07bff", "#3ef0ff", "#ff7ab0"][(r + c) % 5], 0.8), -10.8 + c * 0.5, y + 1.3 + r * 0.45, -0.3);
    box(g, 3.2, 0.04, 0.4, walnut, -9.4, y + 1.25, -0.3);
    box(g, 3.2, 0.04, 0.4, walnut, -9.4, y + 1.7, -0.3);
    box(g, 3.2, 0.04, 0.4, walnut, -9.4, y + 2.15, -0.3);
    rects[f].push([-11, -1.8, -7.8, 0]);
    label(f, "PRIZES · 景品", -9.4, 2.9, -0.2, { h: 0.3, color: "#f4b728", rot: Math.PI });
    void person(f, 2603, [-9.4, -0.75], "Attendant", { face: new THREE.Vector3(0, 0, -1) });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
    counter.position.set(-9.4, y + 0.5, -1.4);
    g.add(counter);
    pick(f, counter, "<b>Prize counter</b><span>your tickets</span>", () => {
      const games = ["snake", "invaders", "flappy", "whack", "hockey", "memory", "kart"];
      let tickets = 0;
      for (const k of games)
        try {
          tickets += Math.round(Number(localStorage.getItem(`street.best.${k}`) ?? 0));
        } catch {}
      return { eyebrow: "Prize counter", title: `${tickets} tickets 🎟️`, body: `<p>Your best scores, all games together. ${tickets >= 200 ? "Enough for the giant plush zkSNARK!" : `${200 - tickets} more for the giant plush zkSNARK.`}</p>` };
    });

    // PAINTBALL: an arena behind a low barrier; START, then shoot the targets that pop up
    const AX0 = -6.5,
      AX1 = 4.6,
      AZ0 = -6.2,
      AZ1 = -0.5;
    box(g, AX1 - AX0, 1.1, 0.15, std("#2a2a34", 0.6), (AX0 + AX1) / 2, y, AZ0);
    box(g, AX1 - AX0, 0.05, 0.18, glowMat("#3ee08f", 1.3), (AX0 + AX1) / 2, y + 1.1, AZ0);
    for (const x of [AX0, AX1]) box(g, 0.15, 1.1, AZ1 - AZ0, std("#2a2a34", 0.6), x, y, (AZ0 + AZ1) / 2);
    rects[f].push([AX0 - 0.1, AZ0 - 0.1, AX1 + 0.1, AZ1 + 0.3]);
    const net = canvas(64, 64, (gc) => {
      gc.strokeStyle = "rgba(220,255,230,0.35)";
      gc.lineWidth = 2;
      gc.strokeRect(0, 0, 64, 64);
    }).t;
    net.wrapS = net.wrapT = THREE.RepeatWrapping;
    net.repeat.set(22, 6);
    const netMesh = new THREE.Mesh(new THREE.PlaneGeometry(AX1 - AX0, h - 1.1), new THREE.MeshBasicMaterial({ map: net, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    netMesh.position.set((AX0 + AX1) / 2, y + 1.1 + (h - 1.1) / 2, AZ0 - 0.02);
    netMesh.raycast = () => {};
    g.add(netMesh);
    // inflatable bunkers
    for (const [k, [x, z, kind]] of ([[-5, -3, 0], [-2.2, -2, 1], [0.5, -3.8, 2], [3, -2.4, 0], [-3.8, -4.6, 2], [2, -1.2, 1]] as [number, number, number][]).entries()) {
      const col = std(["#3ee08f", "#ff3e8a", "#f4b728", "#3ef0ff"][k % 4], 0.6);
      const m = kind === 0 ? new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.3, 16), col) : kind === 1 ? new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 16), col) : new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.6), col);
      m.position.set(x, y + (kind === 2 ? 0.45 : kind === 1 ? 0.8 : 0.65), z);
      g.add(m);
    }
    label(f, "PAINTBALL · ペイントボール", (AX0 + AX1) / 2, 3.6, AZ0 - 0.03, { h: 0.4, color: "#3ee08f", rot: Math.PI });
    // the targets: bullseyes that rise from behind the bunkers
    const bull = canvas(128, 128, (gc) => {
      for (let r = 6; r > 0; r--) {
        gc.fillStyle = r % 2 ? "#e8e2d4" : "#d0303a";
        gc.beginPath();
        gc.arc(64, 64, r * 10, 0, Math.PI * 2);
        gc.fill();
      }
    }).t;
    type Target = { mesh: THREE.Mesh; base: number; up: number; until: number };
    const targets: Target[] = [];
    for (const [x, z] of [[-5, -3.5], [-2.2, -2.5], [0.5, -4.3], [3, -2.9], [-3.8, -5.0], [2, -1.6]] as [number, number][]) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshStandardMaterial({ map: bull, side: THREE.DoubleSide }));
      m.rotation.y = Math.PI;
      m.position.set(x, y + 0.2, z);
      g.add(m);
      const t: Target = { mesh: m, base: y + 0.2, up: 0, until: 0 };
      targets.push(t);
    }
    let round = 0,
      hitsPb = 0,
      bestPb = 0;
    try {
      bestPb = Number(localStorage.getItem("street.best.paintball") ?? 0);
    } catch {}
    const board = screen(f, 2.4, 0.9, (gc, W, H) => {
      gc.fillStyle = "#04100a";
      gc.fillRect(0, 0, W, H);
      gc.fillStyle = "#3ee08f";
      gc.font = '700 30px "JetBrains Mono", monospace';
      fitText(gc, round > 0 ? `TIME ${Math.ceil(round)}s   HITS ${hitsPb}` : `PRESS START · BEST ${bestPb}`, 20, 72);
      gc.fillStyle = "#e9eef7";
      gc.font = '500 20px "JetBrains Mono", monospace';
      fitText(gc, "30 s · click the targets · splat!", 20, 130);
    }, 0.25);
    board.position.set((AX0 + AX1) / 2, y + 2.4, AZ0 - 0.05);
    board.rotation.y = Math.PI;
    const start = box(g, 0.5, 1.0, 0.5, std("#14121c", 0.4), AX1 + 0.6, y, AZ0 - 0.6);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 20), glowMat("#3ee08f", 1.8));
    btn.position.set(AX1 + 0.6, y + 1.04, AZ0 - 0.6);
    g.add(btn);
    rects[f].push([AX1 + 0.3, AZ0 - 0.9, AX1 + 0.9, AZ0 - 0.3]);
    for (const o of [start, btn])
      pick(f, o, "<b>Paintball · START</b><span>a 30 second round</span>", () => {
        round = 30;
        hitsPb = 0;
        return null;
      });
    const paint = ["#3ee08f", "#ff3e8a", "#f4b728", "#3ef0ff", "#b07bff"];
    for (const t of targets)
      pick(f, t.mesh, "<b>Target</b><span>shoot!</span>", (hit) => {
        if (round <= 0) return { eyebrow: "Paintball", title: "Press START first", body: "<p>The green button right of the arena starts a 30 second round.</p>" };
        if (t.up < 0.5) return null;
        hitsPb++;
        // a splat where the ball landed, then the target drops
        const s = new THREE.Mesh(new THREE.CircleGeometry(0.08 + Math.random() * 0.06, 10), new THREE.MeshBasicMaterial({ color: paint[hitsPb % paint.length], side: THREE.DoubleSide }));
        if (hit) s.position.copy(t.mesh.worldToLocal(hit.point.clone()));
        s.position.z = 0.01;
        t.mesh.add(s);
        t.until = 0;
        return null;
      });
    ticks[f].push((dt) => {
      if (round > 0) {
        round -= dt;
        if (round <= 0) {
          round = 0;
          if (hitsPb > bestPb) {
            bestPb = hitsPb;
            try {
              localStorage.setItem("street.best.paintball", String(bestPb));
            } catch {}
          }
        }
        // targets pop up at random for a second or two
        for (const t of targets) {
          if (t.until <= 0 && t.up <= 0.01 && Math.random() < dt * 0.9) t.until = 1 + Math.random() * 1.2;
          t.until -= dt;
        }
      } else for (const t of targets) t.until = 0;
      for (const t of targets) {
        t.up += ((t.until > 0 ? 1 : 0) - t.up) * Math.min(1, dt * 10);
        t.mesh.position.y = t.base + t.up * 1.2;
        // old splats wash off between rounds
        if (round === 0 && t.mesh.children.length) t.mesh.clear();
      }
    });

    light(f, -3, -9, "#c8a0ff", 9);
    light(f, 7, -12, "#7fe3ff", 8);
    light(f, -1, -3, "#a0ffc8", 8);
    light(f, 8, -3, "#ff7ab0", 7);
  }

  // ---- 3: the gym -------------------------------------------------------------------------------------
  {
    const f = 3,
      g = groups[f],
      y = LEVELS[f].y;
    shell(f, std("#24232a", 0.95), std("#4a4852", 0.95));
    elevators(f);
    label(f, "GYM · ジム", 0, 3.4, -0.25, { h: 0.4, color: "#3ee08f", rot: Math.PI });
    // a mirror wall to the north
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshStandardMaterial({ color: "#9aa6b6", roughness: 0.12, metalness: 0.85, emissive: "#202838", emissiveIntensity: 0.6 }));
    mirror.position.set(-1, y + 1.6, Z0 + 0.3);
    g.add(mirror);
    box(g, 14.2, 2.8, 0.1, darkMat, -1, y + 0.2, Z0 + 0.22);
    // treadmills along the east glass, runners on them
    for (let k = 0; k < 4; k++) {
      const z = -3 - k * 2.2;
      box(g, 1.9, 0.2, 0.8, darkMat, 10, y, z);
      box(g, 1.7, 0.02, 0.6, std("#3a3a42", 0.9), 10, y + 0.2, z);
      box(g, 0.08, 1.2, 0.7, chrome, 10.85, y, z);
      box(g, 0.2, 0.25, 0.7, darkMat, 10.85, y + 1.1, z);
      rects[f].push([9, z - 0.45, 11, z + 0.45]);
      if (k !== 2) void person(f, 900 + k, [10, z], "Runner", { face: new THREE.Vector3(1, 0, 0), dy: 0.21, bob: 9 });
    }
    label(f, "CARDIO", 10, 2.9, -12, { h: 0.22, color: "#3ee08f", rot: -Math.PI / 2 });
    // bikes: pedal at the network's hashrate
    for (let k = 0; k < 3; k++) {
      const x = 4 + k * 1.6;
      const bike = new THREE.Group();
      bike.position.set(x, y, -15.5);
      const frame = box(bike, 0.3, 0.6, 1.1, darkMat, 0, 0, 0);
      box(bike, 0.4, 0.08, 0.3, std("#d0504a", 0.6), 0, 0.85, 0.3);
      box(bike, 0.06, 0.5, 0.06, chrome, 0, 0.6, -0.4);
      box(bike, 0.5, 0.06, 0.06, chrome, 0, 1.1, -0.4);
      g.add(bike);
      rects[f].push([x - 0.4, -16.2, x + 0.4, -14.8]);
      pick(f, frame, "<b>Bike</b><span>pedal at the network's hashrate</span>", () => {
        const n = Market.state.network;
        return { eyebrow: "Gym · bike", title: n ? `${(n.solps / 1e9).toFixed(2)} GSol/s 🚴` : "Warming up…", body: n ? `<p>That's how hard the whole Zcash network pedals right now: ${(n.solps / 1e9).toFixed(2)} billion Equihash solutions a second, a block every ~${n.avg_block_time.toFixed(0)} s.</p>` : undefined };
      });
    }
    void person(f, 950, [5.6, -15.2], "Cyclist", { face: new THREE.Vector3(0, 0, -1), dy: 0.35, bob: 6 });
    // weights: a rack of dumbbells, a bench
    box(g, 2.6, 0.9, 0.5, darkMat, -6, y, -16.9);
    for (let k = 0; k < 8; k++) {
      const db = new THREE.Mesh(new THREE.CylinderGeometry(0.08 + (k % 4) * 0.015, 0.08 + (k % 4) * 0.015, 0.3, 10), std("#2a2a30", 0.4, 0.7));
      db.rotation.z = Math.PI / 2;
      db.position.set(-7.1 + (k % 4) * 0.7, y + 0.95 + Math.floor(k / 4) * 0.25, -16.9);
      g.add(db);
    }
    box(g, 0.5, 0.45, 1.6, std("#3a3a42", 0.8), -6, y, -13.8);
    rects[f].push([-7.4, -17.2, -4.6, -16.6], [-6.3, -14.7, -5.7, -12.9]);
    void person(f, 960, [-6, -12.6], "Lifter", { face: new THREE.Vector3(0, 0, -1) });
    // the punching bag: hit it
    const bag = new THREE.Group();
    bag.position.set(-2, y + 3.95, -10);
    const sack = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.2, 16), std("#b0302a", 0.7));
    sack.position.y = -2.2;
    bag.add(sack);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 6), chrome);
    chain.position.y = -0.8;
    bag.add(chain);
    g.add(bag);
    rects[f].push([-2.4, -10.4, -1.6, -9.6]);
    let swing = 0,
      hits = 0;
    ticks[f].push((dt, t) => {
      swing *= Math.pow(0.25, dt);
      bag.rotation.x = Math.sin(t * 5) * swing;
    });
    pick(f, sack, "<b>Punching bag</b><span>hit it</span>", () => {
      swing = Math.min(0.6, swing + 0.35);
      hits++;
      return { eyebrow: "Gym · boxing", title: `${hits} hit${hits > 1 ? "s" : ""} 🥊`, body: hits % 10 === 0 ? "<p>Ten more and you can carry a limousine's parcel.</p>" : undefined };
    });
    // yoga mats, a water dispenser
    for (let k = 0; k < 3; k++) box(g, 1.8, 0.02, 0.7, std(["#3ee08f", "#b07bff", "#3ef0ff"][k], 0.9), -1 + k * 2.2, y, -1.6);
    void person(f, 970, [1.2, -1.6], "Yoga", { face: new THREE.Vector3(0, 0, -1) });
    box(g, 0.4, 1.2, 0.4, std("#d8e8f0", 0.4), 2.5, y, -16.9);
    rects[f].push([2.2, -17.2, 2.8, -16.6]);
    light(f, -3, -8, "#f0fff4", 9);
    light(f, 8, -6, "#f0fff4", 8);
    light(f, 5, -15, "#e8f4ff", 6);
    light(f, -6, -15, "#e8f4ff", 6);
  }

  // ---- 4: the pool ------------------------------------------------------------------------------------
  {
    const f = 4,
      g = groups[f],
      y = LEVELS[f].y;
    const deck = canvas(128, 128, (gc) => {
      gc.fillStyle = "#cfc4b0";
      gc.fillRect(0, 0, 128, 128);
      gc.fillStyle = "#bdb19c";
      for (let i = 0; i < 128; i += 16) gc.fillRect(0, i, 128, 2);
    }).t;
    deck.wrapS = deck.wrapT = THREE.RepeatWrapping;
    deck.repeat.set(10, 8);
    shell(f, new THREE.MeshStandardMaterial({ map: deck, roughness: 0.6 }), std("#1a2a3a", 0.9));
    elevators(f);
    label(f, "INFINITY POOL · プール", 0, 3.8, -0.25, { h: 0.4, color: "#7fe3ff", rot: Math.PI });
    // the pool along the north glass, three lanes: Sapling, Orchard, Ironwood
    const PX0 = -7,
      PX1 = 10,
      PZ0 = -16.8,
      PZ1 = -8.2;
    const wt = water();
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(PX1 - PX0, PZ1 - PZ0, 24, 12), new THREE.MeshStandardMaterial({ map: wt, emissive: "#1a7ab0", emissiveMap: wt, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.92 }));
    pool.rotation.x = -Math.PI / 2;
    // above the deck by more than the waves, so the floor never shows through the water
    pool.position.set((PX0 + PX1) / 2, y + 0.08, (PZ0 + PZ1) / 2);
    g.add(pool);
    box(g, PX1 - PX0 + 0.4, 0.12, 0.2, std("#e8e2d4", 0.5), (PX0 + PX1) / 2, y, PZ1 + 0.1);
    rects[f].push([PX0, PZ0 - 1.2, PX1, PZ1]);
    const base = (pool.geometry.attributes.position as THREE.BufferAttribute).array.slice();
    ticks[f].push((dt, t) => {
      wt.offset.x += dt * 0.02;
      wt.offset.y += dt * 0.013;
      const pos = pool.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, base[i * 3 + 2] + Math.sin(base[i * 3] * 1.3 + t * 1.6) * 0.018 + Math.cos(base[i * 3 + 1] * 1.7 + t * 1.2) * 0.018);
      pos.needsUpdate = true;
    });
    const LANES: { key: "sapling" | "orchard" | "ironwood"; name: string; color: string }[] = [
      { key: "sapling", name: "SAPLING", color: "#2a78d6" },
      { key: "orchard", name: "ORCHARD", color: "#eb6834" },
      { key: "ironwood", name: "IRONWOOD", color: "#1baf7a" },
    ];
    const laneW = (PZ1 - PZ0) / 3;
    LANES.forEach((ln, k) => {
      const zc = PZ0 + laneW * (k + 0.5);
      if (k)
        for (let x = PX0 + 0.3; x < PX1; x += 0.35) {
          const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), std(ln.color, 0.5));
          buoy.position.set(x, y + 0.1, PZ0 + laneW * k);
          g.add(buoy);
        }
      const tag = label(f, ln.name, PX1 + 0.5, 0.02, zc, { h: 0.3, color: ln.color });
      tag.rotation.x = -Math.PI / 2;
      tag.rotation.z = Math.PI / 2;
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(PX1 - PX0, laneW), new THREE.MeshBasicMaterial({ visible: false }));
      hit.rotation.x = -Math.PI / 2;
      hit.position.set((PX0 + PX1) / 2, y + 0.05, zc);
      g.add(hit);
      pick(f, hit, `<b>${ln.name} lane</b><span>the ${ln.name.toLowerCase()} pool, live</span>`, () => {
        const p = Market.state.pools;
        const v = p ? p.pools[ln.key] / 1e8 : null;
        return { eyebrow: "Infinity pool · lane", title: `${ln.name} pool`, stats: v != null && p ? [["In the pool", `${Math.round(v).toLocaleString("en-US")} ZEC`], ["Of shielded", `${((p.pools[ln.key] / p.shielded) * 100).toFixed(1)}%`]] : undefined, body: "<p>Each lane is one of Zcash's shielded pools, at its real size right now.</p>" };
      });
    });
    // the scoreboard: live pool sizes
    const board = screen(f, 3.4, 1.4, (gc, W, H) => {
      const p = Market.state.pools;
      gc.fillStyle = "#04101a";
      gc.fillRect(0, 0, W, H);
      gc.fillStyle = "#7fe3ff";
      gc.font = '700 26px "JetBrains Mono", monospace';
      fitText(gc, "SHIELDED POOLS · LIVE", 20, 38);
      LANES.forEach((ln, i) => {
        gc.fillStyle = ln.color;
        gc.font = '700 24px "JetBrains Mono", monospace';
        gc.fillText(ln.name, 20, 82 + i * 46);
        gc.fillStyle = "#e9eef7";
        fitText(gc, p ? `${Math.round(p.pools[ln.key] / 1e8).toLocaleString("en-US")} ZEC` : "…", 220, 82 + i * 46);
      });
    }, 20);
    board.position.set(X0 + 0.22, y + 2.2, -14);
    board.rotation.y = Math.PI / 2;
    // swimmers doing lengths, one per lane
    [[-3, 0], [3, 1], [6, 2]].forEach(([x, k]) => {
      void person(f, 1200 + k, [x, PZ0 + laneW * (k + 0.5)], "Swimmer", { face: new THREE.Vector3(1, 0, 0), dy: -0.55 }).then((s) => {
        if (s) ticks[f].push((_, t) => (s.root.position.x = PX0 + 1 + ((x - PX0 + t * (0.5 + k * 0.15)) % (PX1 - PX0 - 2))));
      });
    });
    // the jacuzzi with its bubbles, loungers and umbrellas on the deck
    const jac = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.5, 32), std("#e8e2d4", 0.5));
    jac.position.set(-9.2, y + 0.25, -4.5);
    g.add(jac);
    const jw = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), new THREE.MeshStandardMaterial({ map: water(), emissive: "#2a9ad0", emissiveIntensity: 0.6, transparent: true, opacity: 0.9 }));
    jw.rotation.x = -Math.PI / 2;
    jw.position.set(-9.2, y + 0.46, -4.5);
    g.add(jw);
    const bubbles = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Array(120).fill(0), 3)), new THREE.PointsMaterial({ color: "#e8fbff", size: 0.05, transparent: true, opacity: 0.8 }));
    bubbles.frustumCulled = false;
    g.add(bubbles);
    ticks[f].push((_, t) => {
      const pos = bubbles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 40; i++) {
        const a = hash(i, 1, 1, 1) * Math.PI * 2,
          r = hash(i, 2, 1, 1) * 1.05;
        pos.setXYZ(i, -9.2 + Math.cos(a) * r, y + 0.47 + ((t * 0.4 + hash(i, 3, 1, 1)) % 1) * 0.08, -4.5 + Math.sin(a) * r);
      }
      pos.needsUpdate = true;
    });
    rects[f].push([-10.6, -5.9, -7.8, -3.1]);
    label(f, "JACUZZI", -9.2, 1.6, -3.1, { h: 0.2, color: "#7fe3ff", rot: Math.PI });
    void person(f, 1500, [-9.2, -4.5], "Relaxing", { dy: -0.2, face: new THREE.Vector3(1, 0, 0) });
    for (let k = 0; k < 4; k++) {
      const x = -3 + k * 3;
      const l = new THREE.Group();
      l.position.set(x, y, -4.8);
      box(l, 0.7, 0.3, 1.8, white, 0, 0, 0);
      const back = box(l, 0.7, 0.06, 0.7, white, 0, 0.3, -0.75);
      back.rotation.x = -0.6;
      g.add(l);
      rects[f].push([x - 0.4, -5.8, x + 0.4, -3.8]);
      if (k % 2 === 0) {
        box(g, 0.05, 2.2, 0.05, chrome, x + 1.5, y, -4.8);
        const um = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.4, 8), std(k ? "#eb6834" : "#2a78d6", 0.8));
        um.position.set(x + 1.5, y + 2.3, -4.8);
        g.add(um);
      }
    }
    void person(f, 1600, [3, -4.6], "Sunbather", { dy: 0.3, face: new THREE.Vector3(0, 0, 1) });
    plant(f, 10.8, -2, true);
    plant(f, -10.6, -16.8, true);
    light(f, 0, -12.5, "#7fd8ff", 10);
    light(f, 6, -12.5, "#7fd8ff", 8);
    light(f, -3, -4, "#ffe6c8", 7);
    light(f, -9, -4.5, "#a0e0ff", 6);
  }

  // ---- 5: the residences: four complete flats ---------------------------------------------------------
  {
    const f = 5,
      g = groups[f],
      y = LEVELS[f].y,
      h = LEVELS[f].h;
    shell(f, std("#3a3036", 0.8), std("#1a1620", 0.9));
    elevators(f);
    const hallWall = std("#3e3650", 0.85);
    // the corridor east–west, a carpet runner lit along its edges
    box(g, 22, 0.012, 1.6, std("#5a2a3a", 0.95), 1, y + 0.006, -9);
    for (const z of [-9.82, -8.18]) box(g, 22, 0.014, 0.03, glowMat("#ff9f2e", 1.1), 1, y + 0.008, z);
    label(f, "RESIDENCES · 住居", 1, 3.0, -10.38, { h: 0.26, color: "#ff9f2e" });
    for (const [k, x] of [-5, 1, 7].entries()) {
      const l = box(g, 0.6, 0.04, 0.6, glowMat("#ffe6c8", 1.2), x, y + h - 0.05, -9);
      void l;
      void k;
    }
    const woodFloor = (() => {
      const t = canvas(128, 128, (gc) => {
        gc.fillStyle = "#8a6440";
        gc.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 8; i++) {
          gc.fillStyle = i % 2 ? "#7e5a38" : "#93693f";
          gc.fillRect(0, i * 16, 128, 15);
          gc.fillStyle = "rgba(0,0,0,0.15)";
          gc.fillRect(((i * 37) % 100) + 10, i * 16, 2, 15);
        }
      }).t;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(4, 3);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 });
    })();
    const tiles = std("#d8dce0", 0.3);
    let zips: Book[] = [];
    void (async () => {
      let list = (await get<{ slug: string; number: number | null; title: string; status: string; owners: string[]; created: string | null; url: string }[]>("/v1/zips")) ?? [];
      if (!list.length) list = await fetch(`${import.meta.env.BASE_URL}zips.json`).then((r) => (r.ok ? r.json() : []), () => []);
      zips = list.filter((z) => z.number != null && z.status !== "Reserved").map((z) => ({ slug: z.slug, number: z.number, title: z.title, status: z.status, owners: z.owners, created: z.created, url: z.url, color: "#ff9f2e" }));
    })();

    /**
     * One flat, 11 × 7.5 m, opening off the corridor. Laid out in its own (u, w) coordinates —
     * u along the corridor, w from the corridor wall in towards the windows — and mapped to the
     * north side (side −1) or the south side (side +1).
     */
    const flat = (a: number, side: -1 | 1, n: string, o: { tone: string; resident: number; accent: string }) => {
      const W = (u: number, w: number) => new THREE.Vector3(a + u, 0, side < 0 ? -10.5 - w : -7.5 + w);
      const at = (u: number, yy: number, w: number) => W(u, w).setY(y + yy);
      /** A box sized along u (x), up, and w (depth). */
      const b = (su: number, sy: number, sw: number, mat: THREE.Material, u: number, yy: number, w: number) => {
        const p = W(u, w);
        return box(g, su, sy, sw, mat, p.x, y + yy, p.z);
      };
      /** Rotation for something whose front faces +z by default, turned to face a direction. */
      const face = (d: "corridor" | "window" | "east" | "west") => (d === "east" ? Math.PI / 2 : d === "west" ? -Math.PI / 2 : (d === "corridor") === side < 0 ? 0 : Math.PI);
      const r = rects[f];
      const rect = (u0: number, w0: number, u1: number, w1: number) => {
        const p = W(u0, w0),
          q = W(u1, w1);
        r.push([Math.min(p.x, q.x), Math.min(p.z, q.z), Math.max(p.x, q.x), Math.max(p.z, q.z)]);
      };
      const wallMat = std(o.tone, 0.85);
      /** An interior wall from (u0, w0) to (u1, w1), straight along one axis. */
      const iw = (u0: number, w0: number, u1: number, w1: number) => {
        const p = W(u0, w0),
          q = W(u1, w1);
        r.push(wall(g, p.x, p.z, q.x, q.z, h, wallMat, y, 0.12));
      };
      // wooden floor, the corridor wall with the front door, the party wall to the east
      b(11, 0.02, 7.5, woodFloor, 5.5, 0, 3.75);
      const cz = side < 0 ? -10.5 : -7.5;
      r.push(wall(g, a, cz, a + 1, cz, h, hallWall, y), wall(g, a + 2.4, cz, a + 11, cz, h, hallWall, y));
      if (a + 11 < X1) iw(11, 0, 11, 7.5);
      // the door frame, lit, and the number on a sign over the corridor
      for (const u of [1, 2.4]) b(0.05, 2.2, 0.05, glowMat(o.accent, 1.2), u, 0, -0.08);
      b(1.45, 0.05, 0.05, glowMat(o.accent, 1.2), 1.7, 2.2, -0.08);
      const plate = label(f, n, 0, 2.55, 0, { h: 0.26, color: "#0d0d0d", bg: o.accent, rot: -Math.PI / 2 });
      plate.position.copy(at(0.4, 2.55, -0.4));
      (plate.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;

      // entry: shoe cabinet, a mirror, coat hooks
      b(0.9, 0.9, 0.35, walnut, 0.5, 0, 0.35);
      b(0.6, 1.0, 0.02, std("#b8c4d0", 0.08, 0.9), 0.5, 1.1, 0.19);
      rect(0.05, 0.15, 0.95, 0.55);

      // bathroom (u 0–3, w 2.5–6): toilet, vanity with mirror, a glass shower
      iw(0, 2.5, 3, 2.5);
      iw(3, 2.5, 3, 2.7);
      iw(3, 3.6, 3, 6);
      iw(0, 6, 3, 6);
      b(3, 0.01, 3.5, tiles, 1.5, 0.025, 4.25);
      const toilet = new THREE.Group();
      const tp = at(0.45, 0, 5.4);
      toilet.position.copy(tp);
      toilet.rotation.y = face("east");
      box(toilet, 0.4, 0.42, 0.55, white, 0, 0, 0);
      box(toilet, 0.42, 0.04, 0.5, std("#f4f4f4", 0.3), 0, 0.42, 0.02);
      box(toilet, 0.42, 0.45, 0.18, white, 0, 0.42, -0.28);
      g.add(toilet);
      rect(0.15, 5.05, 0.75, 5.75);
      b(1.0, 0.85, 0.5, std(o.tone, 0.6), 1.5, 0, 2.8);
      b(0.5, 0.06, 0.36, white, 1.5, 0.85, 2.82);
      b(0.8, 0.7, 0.02, std("#b8c4d0", 0.08, 0.9), 1.5, 1.2, 2.56);
      rect(1, 2.55, 2, 3.05);
      const showerGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0), glass);
      const sg = at(2.4, 1.0, 4.8);
      showerGlass.position.copy(sg);
      showerGlass.rotation.y = side < 0 ? 0 : Math.PI;
      g.add(showerGlass);
      b(0.95, 0.06, 1.2, tiles, 2.45, 0, 5.4);
      const head = b(0.15, 0.04, 0.15, chrome, 2.45, 2.1, 5.8);
      rect(1.9, 4.75, 2.95, 5.95);
      const drops = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Array(90).fill(0), 3)), new THREE.PointsMaterial({ color: "#bfe8ff", size: 0.03, transparent: true, opacity: 0.8 }));
      drops.frustumCulled = false;
      drops.visible = false;
      g.add(drops);
      const sp = at(2.45, 0, 5.4);
      ticks[f].push((_, t) => {
        if (!drops.visible) return;
        const pos = drops.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < 30; i++) pos.setXYZ(i, sp.x + (hash(i, 1, 1, 1) - 0.5) * 0.3, y + 2.05 - ((t * 2 + hash(i, 2, 1, 1)) % 1) * 2, sp.z + (hash(i, 3, 1, 1) - 0.5) * 0.3);
        pos.needsUpdate = true;
      });
      let flushes = 0;
      pick(f, toilet.children[0], "<b>Toilet</b><span>flush</span>", () => ({ eyebrow: `Flat ${n} · bathroom`, title: `Flushed 🚽 ×${++flushes}`, body: "<p>Shielded plumbing: nothing leaks.</p>" }));
      pick(f, head, "<b>Shower</b><span>turn it on / off</span>", () => {
        drops.visible = !drops.visible;
        return { eyebrow: `Flat ${n} · bathroom`, title: drops.visible ? "Shower on 🚿" : "Shower off" };
      });

      // kitchen along the corridor wall (u 3.4–8.2): cabinets, a sink, a hob, a fridge
      b(4.2, 0.88, 0.62, std("#e8e2d4", 0.5), 5.5, 0, 0.36);
      b(4.25, 0.05, 0.66, std("#2a2830", 0.65, 0.1), 5.5, 0.88, 0.36);
      b(4.2, 0.7, 0.35, std("#e8e2d4", 0.5), 5.5, 1.55, 0.2);
      // cabinet doors: seams and handles on the low and the wall units, a splashback between
      b(4.2, 0.6, 0.01, std(o.accent, 0.4, 0.2), 5.5, 0.95, 0.05);
      for (let i = 0; i <= 7; i++) {
        b(0.012, 0.8, 0.012, darkMat, 3.4 + i * 0.6, 0.04, 0.675);
        b(0.012, 0.66, 0.012, darkMat, 3.4 + i * 0.6, 1.57, 0.375);
        if (i < 7) {
          b(0.18, 0.02, 0.02, chrome, 3.7 + i * 0.6, 0.72, 0.685);
          b(0.18, 0.02, 0.02, chrome, 3.7 + i * 0.6, 1.62, 0.385);
        }
      }
      b(0.5, 0.02, 0.38, chrome, 4.4, 0.92, 0.36);
      const tap = b(0.04, 0.3, 0.04, chrome, 4.4, 0.93, 0.15);
      const hob = b(0.6, 0.02, 0.5, std("#14121a", 0.2), 6.6, 0.92, 0.36);
      const burners: THREE.Mesh[] = [];
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.08, 16), new THREE.MeshBasicMaterial({ color: "#2a1a1a", side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2;
        m.position.copy(at(6.45 + (i % 2) * 0.3, 0.945, 0.24 + Math.floor(i / 2) * 0.24));
        g.add(m);
        burners.push(m);
      }
      const fridge = new THREE.Group();
      fridge.position.copy(at(7.9, 0, 0.42));
      fridge.rotation.y = face("window");
      box(fridge, 0.75, 1.9, 0.7, std("#c8ccd4", 0.25, 0.7), 0, 0, 0);
      const fdoor = new THREE.Group();
      fdoor.position.set(0.375, 0, 0.36);
      box(fdoor, 0.75, 1.88, 0.05, std("#d8dce4", 0.2, 0.7), -0.375, 0.01, 0);
      fridge.add(fdoor);
      g.add(fridge);
      rect(3.4, 0.05, 8.3, 0.75);
      let fridgeOpen = 0;
      ticks[f].push((dt) => (fdoor.rotation.y += ((fridgeOpen > 0 ? -1.4 : 0) - fdoor.rotation.y) * Math.min(1, dt * 6), (fridgeOpen = Math.max(0, fridgeOpen - dt))));
      const food = ["oat milk, three onigiri and a cake shaped like a ⓩ", "kimchi, cold soba and a bottle of Shielded Sour", "eggs, natto and leftover hotpot", "matcha, mochi and a single lemon"];
      pick(f, fridge.children[0], "<b>Fridge</b><span>open it</span>", () => {
        fridgeOpen = 4;
        return { eyebrow: `Flat ${n} · kitchen`, title: "The fridge", body: `<p>Inside: ${food[(Number(n) + Math.floor(Date.now() / 60000)) % food.length]}.</p>` };
      });
      let cooking = false;
      pick(f, hob, "<b>Hob</b><span>cook something</span>", () => {
        cooking = !cooking;
        for (const m of burners) (m.material as THREE.MeshBasicMaterial).color.set(cooking ? "#ff4a1a" : "#2a1a1a");
        return { eyebrow: `Flat ${n} · kitchen`, title: cooking ? "Ramen on the hob 🍜" : "Hob off" };
      });
      pick(f, tap, "<b>Tap</b><span>a glass of water</span>", () => ({ eyebrow: `Flat ${n} · kitchen`, title: "A glass of water 💧" }));
      // the dining table and four chairs, a pendant over it
      b(1.4, 0.05, 0.85, walnut, 5.6, 0.74, 2.6);
      b(0.08, 0.74, 0.08, walnut, 5.0, 0, 2.3);
      b(0.08, 0.74, 0.08, walnut, 6.2, 0, 2.3);
      b(0.08, 0.74, 0.08, walnut, 5.0, 0, 2.9);
      b(0.08, 0.74, 0.08, walnut, 6.2, 0, 2.9);
      for (const [du, dw] of [[-0.4, -0.65], [0.4, -0.65], [-0.4, 0.65], [0.4, 0.65]]) b(0.42, 0.46, 0.42, std(o.accent, 0.7), 5.6 + du, 0, 2.6 + dw);
      b(0.03, 0.9, 0.03, darkMat, 5.6, h - 0.9, 2.6);
      b(0.35, 0.15, 0.35, glowMat("#ffe2b0", 1.3), 5.6, h - 1.05, 2.6);
      rect(4.7, 1.8, 6.5, 3.4);

      // bedroom (u 8.6–11, w 0–3.9): double bed, nightstand and lamp, a wardrobe
      iw(8.6, 0.75, 8.6, 2.6);
      iw(8.6, 3.5, 8.6, 3.9);
      iw(8.6, 3.9, 11, 3.9);
      const bedU = 9.9,
        bedW = 2.1;
      b(1.6, 0.4, 2.0, walnut, bedU, 0, bedW);
      b(1.55, 0.18, 1.95, std("#e8e2f0", 0.9), bedU, 0.4, bedW);
      b(1.5, 0.1, 1.2, std(o.accent, 0.85), bedU, 0.58, bedW + 0.35);
      for (const du of [-0.38, 0.38]) b(0.6, 0.14, 0.35, white, bedU + du, 0.58, bedW - 0.75);
      b(1.6, 0.9, 0.08, walnut, bedU, 0.4, bedW - 1.0);
      rect(9.05, 1.05, 10.75, 3.15);
      b(0.45, 0.5, 0.4, walnut, 10.8 - 0.12, 0, 0.75);
      const lampShade = b(0.22, 0.25, 0.22, glowMat("#ffe2b0", 1.2), 10.68, 0.62, 0.75);
      let lampOn = true;
      pick(f, lampShade, "<b>Bedside lamp</b><span>on / off</span>", () => {
        lampOn = !lampOn;
        (lampShade.material as THREE.MeshBasicMaterial).color.set(new THREE.Color(lampOn ? "#ffe2b0" : "#3a3020").multiplyScalar(lampOn ? 1.2 : 1));
        return null;
      });
      b(1.4, 2.1, 0.55, std("#d8d0c4", 0.6), 9.5, 0, 3.55);
      rect(8.75, 3.25, 10.25, 3.85);
      const bed = b(1.55, 0.2, 1.95, new THREE.MeshBasicMaterial({ visible: false }), bedU, 0.4, bedW);
      pick(f, bed, "<b>Bed</b><span>a nap</span>", () => ({ eyebrow: `Flat ${n} · bedroom`, title: "Nap time 💤", body: "<p>Twenty-five seconds per block after NU7: a power nap is about three blocks.</p>" }));

      // the living room by the windows (u 3–11, w 4–7.5): TV, sofa, rug, books, a plant
      const tvMesh = screen(f, 1.6, 0.9, (gc, Wd, Hd) => {
        gc.fillStyle = "#04121a";
        gc.fillRect(0, 0, Wd, Hd);
        gc.fillStyle = "#3ef0ff";
        gc.font = '600 26px "JetBrains Mono", monospace';
        fitText(gc, "ZCASH · LIVE", 24, 44);
        gc.fillStyle = "#e8fbff";
        gc.font = '800 70px "JetBrains Mono", monospace';
        fitText(gc, height ? `#${height.toLocaleString("en-US")}` : "…", 24, 150);
        gc.fillStyle = "#ff3e8a";
        gc.font = '600 24px "JetBrains Mono", monospace';
        fitText(gc, `${ctx.director.mempoolList().length} TX WAITING`, 24, 220);
      }, 5);
      tvMesh.position.copy(at(3.1, 1.35, 5.4));
      tvMesh.rotation.y = face("east");
      b(0.08, 0.95, 1.7, darkMat, 3.07, 0.88, 5.4);
      b(0.45, 0.45, 1.8, walnut, 3.3, 0, 5.4);
      rect(3.0, 4.45, 3.55, 6.35);
      pick(f, tvMesh, `<b>Flat ${n} · TV</b><span>the chain, live</span>`, () => ({ eyebrow: `Flat ${n} · TV`, title: height ? `Block ${height.toLocaleString("en-US")}` : "Waiting for a block", body: `<p>${liveTxt.mempool()}</p>` }));
      const sofaP = at(6.2, 0, 5.4);
      sofa(g, sofaP.x, y, sofaP.z, 2.2, ["#8a4a3a", "#3a6a5a", "#6a5a3a", "#4a4a7a"][Number(n) % 4], face("west"));
      rect(5.75, 4.25, 6.65, 6.55);
      b(1.0, 0.38, 0.6, walnut, 4.7, 0, 5.4);
      b(3.2, 0.01, 2.4, std(["#c8b89a", "#9aa8c8", "#c89aa8", "#a8c89a"][Number(n) % 4], 0.95), 4.9, 0.03, 5.4);
      rect(4.35, 5.05, 5.25, 5.75);
      // bookshelf against the bedroom wall: click a book, read a ZIP
      const shelfP = at(10.7, 0, 4.6);
      const shelf = box(g, 0.35, 2.0, 1.4, walnut, shelfP.x, y, shelfP.z);
      for (let rr = 0; rr < 4; rr++) for (let i = 0; i < 6; i++) b(0.25, 0.28, 0.12, std(["#b0413e", "#3a6ea5", "#d9a441", "#2f7d5b", "#6b4c9a"][(i + rr + Number(n)) % 5], 0.8), 10.7, 0.2 + rr * 0.45, 4.05 + i * 0.2);
      rect(10.5, 3.9, 11, 5.3);
      pick(f, shelf, "<b>Bookshelf</b><span>pick a ZIP to read</span>", () => {
        if (!zips.length) return { eyebrow: `Flat ${n}`, title: "The bookshelf", body: "<p>The books are still being shelved…</p>" };
        const z = zips[Math.floor(Math.random() * zips.length)];
        return { eyebrow: `Flat ${n} · bookshelf`, title: z.title, book: z };
      });
      // a floor lamp, a plant by the window
      b(0.04, 1.6, 0.04, darkMat, 7.4, 0, 6.9);
      b(0.35, 0.25, 0.35, glowMat("#ffe2b0", 1.1), 7.4, 1.6, 6.9);
      const potP = at(3.5, 0, 7.0);
      plant(f, potP.x, potP.z, true);
      // the resident, at home
      void person(f, o.resident, [sofaP.x - (side < 0 ? 0 : 0), sofaP.z], `Resident of ${n}`, {
        face: new THREE.Vector3(-1, 0, 0),
        wander: [
          [sofaP.x, sofaP.z],
          [W(5.6, 1.7).x, W(5.6, 1.7).z],
          [W(7.4, 1.5).x, W(7.4, 1.5).z],
          [W(9.9, 3.3).x, W(9.9, 3.3).z],
        ],
      });
    };
    flat(-10, -1, "501", { tone: "#e8dcc8", resident: 3333, accent: "#ff9f2e" });
    flat(1, -1, "502", { tone: "#d8e0e8", resident: 5151, accent: "#3ef0ff" });
    flat(-10, 1, "503", { tone: "#e8d8e0", resident: 9090, accent: "#ff7ab0" });
    flat(1, 1, "504", { tone: "#dde8d8", resident: 7171, accent: "#3ee08f" });
    // the corridor's end walls by the elevators
    rects[f].push(wall(g, -10, -10.5, -10, Z0, h, hallWall, y), wall(g, -10, -7.5, -10, Z1, h, hallWall, y));
    light(f, -4.5, -14, "#ffe6c8", 7);
    light(f, 6.5, -14, "#ffe6c8", 7);
    light(f, -4.5, -4, "#ffe2b8", 7);
    light(f, 6.5, -4, "#ffe2b8", 7);
  }

  // ---- R: the rooftop ---------------------------------------------------------------------------------
  {
    const f = 6,
      g = groups[f],
      y = LEVELS[f].y;
    const boards = canvas(128, 128, (gc) => {
      gc.fillStyle = "#6a4a32";
      gc.fillRect(0, 0, 128, 128);
      gc.fillStyle = "#5a3e2a";
      for (let i = 0; i < 128; i += 16) gc.fillRect(0, i, 128, 2);
    }).t;
    boards.wrapS = boards.wrapT = THREE.RepeatWrapping;
    boards.repeat.set(12, 9);
    shell(f, new THREE.MeshStandardMaterial({ map: boards, roughness: 0.8 }), null);
    // the elevator kiosk on the core
    box(g, 2.4, 3, 5.6, std("#2e2a36", 0.8), X0 + 1.2, y, -9);
    rects[f].push([X0, -11.8, X0 + 2.5, -6.2]);
    const doors = box(g, 0.1, 2.3, 1.4, chrome, X0 + 2.45, y, -9);
    box(g, 0.05, 0.14, 0.6, glowMat("#ff9f2e", 1.6), X0 + 2.5, y + 2.6, -9);
    pick(f, doors, "<b>Elevator down</b><span>to the residences</span>", () => ({ eyebrow: "Elevator", title: LEVELS[5].name, floor: 5 }));
    label(f, "▼ 5 · RESIDENCES", X0 + 2.52, 2.85, -9, { h: 0.18, color: "#ff9f2e", rot: Math.PI / 2 });
    // ZK TOWER in neon letters on the north edge
    label(f, "ZK TOWER · 秘密マンション", 0, 2.2, Z0 + 0.4, { h: 1.0, color: "#3ef0ff" });
    // the helipad
    const pad = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40), std("#2a2a32", 0.8));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(6.5, y + 0.02, -12);
    g.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.15, 40), glowMat("#f4b728", 1.2));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(6.5, y + 0.03, -12);
    g.add(ring);
    const Zmark = textPlane("ⓩ", { h: 3, color: "#f4b728", glow: true });
    Zmark.rotation.x = -Math.PI / 2;
    Zmark.position.set(6.5, y + 0.04, -12);
    g.add(Zmark);
    // garden beds with trees
    for (const [x, z] of [
      [-6, -16.2],
      [-2, -16.2],
      [10.6, -3],
      [-6, -2],
    ]) {
      box(g, 2.6, 0.5, 1.2, std("#3a3036", 0.8), x, y, z);
      box(g, 2.4, 0.08, 1.0, std("#3a5a2a", 0.95), x, y + 0.5, z);
      const tree = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 7), std("#2f7a42", 0.9));
      tree.position.set(x + 0.6, y + 1.4, z);
      g.add(tree);
      rects[f].push([x - 1.3, z - 0.6, x + 1.3, z + 0.6]);
    }
    // the sky bar
    const BZ = -12.5;
    box(g, 4, 1.05, 0.8, walnut, -3, y, BZ);
    box(g, 4.1, 0.06, 0.9, std("#1c1a22", 0.3, 0.4), -3, y + 1.05, BZ);
    box(g, 3.9, 0.05, 0.05, glowMat("#ff3e8a", 1.4), -3, y + 0.2, BZ + 0.42);
    for (let k = 0; k < 6; k++) box(g, 0.08, 0.3, 0.08, std(["#3ee08f", "#f4b728", "#3ef0ff"][k % 3], 0.2), -4.6 + k * 0.6, y + 1.1, BZ - 0.2);
    rects[f].push([-5.1, BZ - 0.5, -0.9, BZ + 0.5]);
    label(f, "SKY BAR · 空", -3, 2.4, BZ + 0.5, { h: 0.34, color: "#ff3e8a" });
    void person(f, 4444, [-3, BZ - 0.9], "Bartender");
    const bar = new THREE.Mesh(new THREE.BoxGeometry(4, 1.1, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
    bar.position.set(-3, y + 0.55, BZ);
    g.add(bar);
    const drinks = ["a Shielded Sour", "an Orchard Spritz", "a Halving Highball", "an Ironwood Negroni", "a Nullifier, neat"];
    let served = 0;
    pick(f, bar, "<b>Sky bar</b><span>order a drink</span>", () => ({ eyebrow: "Sky bar", title: `Here's ${drinks[served++ % drinks.length]} 🍸`, body: "<p>On the house. Watch the sky: every new block lights it up.</p>" }));
    for (let k = 0; k < 3; k++) {
      box(g, 0.7, 0.3, 1.8, white, 1 + k * 1.6, y, -3);
      rects[f].push([0.6 + k * 1.6, -3.9, 1.4 + k * 1.6, -2.1]);
    }
    void person(f, 2468, [2.6, -3], "Sunbather", { dy: 0.3 });
    void person(f, 1357, [-2, BZ + 1.1], "Guest", { face: new THREE.Vector3(0, 0, -1) });
    // the telescope in the north-east corner
    const scope = new THREE.Group();
    scope.position.set(10.4, y, -16.6);
    box(scope, 0.06, 1.2, 0.06, chrome, 0, 0, 0);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.9, 12), std("#d8d8e0", 0.3, 0.7));
    tube.rotation.x = Math.PI / 2.6;
    tube.position.set(0, 1.35, 0.1);
    scope.add(tube);
    g.add(scope);
    rects[f].push([10, -17, 10.8, -16.2]);
    pick(f, tube, "<b>Telescope</b><span>look at the chain</span>", () => {
      const last = ctx.director.lastBlockTime;
      const s = last ? Math.round((Date.now() - last) / 1000) : null;
      return { eyebrow: "Telescope", title: s != null ? `Next block in ~${Math.max(0, 75 - s)} s` : "Scanning the sky…", body: `<p>${liveTxt.mempool()} When their bus leaves, the sky lights up.</p>` };
    });
    // fireworks: a burst for every new block, a small one now and then while you're up here
    const N = 240;
    const fw = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Array(N * 3).fill(0), 3)).setAttribute("color", new THREE.Float32BufferAttribute(new Array(N * 3).fill(1), 3)), new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    fw.frustumCulled = false;
    g.add(fw);
    const parts: { p: THREE.Vector3; v: THREE.Vector3; life: number; c: THREE.Color }[] = [];
    const burst = (big: boolean) => {
      const c = new THREE.Vector3((Math.random() - 0.5) * 30, y + 14 + Math.random() * 8, -30 - Math.random() * 10);
      const col = new THREE.Color(["#f4b728", "#3ef0ff", "#ff3e8a", "#3ee08f"][Math.floor(Math.random() * 4)]);
      for (let i = 0; i < (big ? 90 : 45); i++) {
        if (parts.length >= N) parts.shift();
        parts.push({ p: c.clone(), v: new THREE.Vector3().randomDirection().multiplyScalar(4 + Math.random() * 4), life: 1.6 + Math.random() * 0.6, c: col });
      }
    };
    ctx.onBlock(() => {
      burst(true);
      setTimeout(() => burst(true), 400);
      setTimeout(() => burst(false), 900);
    });
    let idle = 4;
    ticks[f].push((dt) => {
      idle -= dt;
      if (idle < 0) {
        idle = 10 + Math.random() * 10;
        burst(false);
      }
      const pos = fw.geometry.attributes.position as THREE.BufferAttribute;
      const ca = fw.geometry.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        const q = parts[i];
        if (!q || q.life <= 0) {
          pos.setXYZ(i, 0, -999, 0);
          continue;
        }
        q.life -= dt;
        q.v.y -= 3 * dt;
        q.p.addScaledVector(q.v, dt);
        pos.setXYZ(i, q.p.x, q.p.y, q.p.z);
        const k = Math.min(1, q.life);
        ca.setXYZ(i, q.c.r * k, q.c.g * k, q.c.b * k);
      }
      pos.needsUpdate = true;
      ca.needsUpdate = true;
    });
    light(f, -3, BZ, "#ff7ab0", 8, 3);
    light(f, 6.5, -12, "#ffd28a", 6, 3);
    light(f, 2, -3, "#ffe6c8", 5, 3);
    light(f, -4, -16, "#a0ffc8", 4, 3);
  }

  // every floor carries exactly four lights, so moving between floors never recompiles a shader
  LEVELS.forEach((_, f) => {
    while (lightCount[f] < LIGHTS_PER_FLOOR) light(f, 0, -9, "#000000", 0);
  });

  const setFloor = (n: number) => {
    current = n;
    groups.forEach((g, k) => (g.visible = k === n));
    const view = ctx.cityView("tower", LEVELS[n].y + 1.6, 3);
    fallback.visible = !view;
    if (view) scene.background = view;
  };
  setFloor(0);

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) if (picks.has(x)) return x;
    return null;
  };
  return {
    key: "tower",
    title: "ZK TOWER",
    scene,
    floors: LEVELS.map((l, k) => ({
      label: l.label,
      name: l.name,
      y: l.y,
      spawn: k === 0 ? new THREE.Vector3(0, 0, -1.6) : new THREE.Vector3(k === LEVELS.length - 1 ? X0 + 3.4 : X0 + 1.8, l.y, -9),
      yaw: k === 0 ? 0 : -Math.PI / 2,
    })),
    colliders: (f) => rects[f],
    setFloor,
    pickables: () => pickables.filter((o) => floorOf.get(o) === current),
    pick: (hit) => {
      const o = find(hit.object);
      return o ? (picks.get(o)!(hit) ?? null) : null;
    },
    hover: (hit) => {
      const o = find(hit.object);
      return o ? (hovers.get(o) ?? null) : null;
    },
    update(dt, t, camera) {
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of people[current]) s.update(dt, t, camQuat, camRight);
      for (const k of ticks[current]) k(dt, t);
    },
  };
}
