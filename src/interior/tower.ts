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
  const picks = new Map<THREE.Object3D, () => PickInfo | null>();
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

  // the city all round, seen through the glass and from the roof
  const city = new THREE.Mesh(new THREE.CylinderGeometry(46, 46, 60, 48, 1, true), new THREE.MeshBasicMaterial({ map: skyline(), side: THREE.BackSide, toneMapped: false }));
  city.position.set(0, 18, -9);
  scene.add(city);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(46, 48), new THREE.MeshBasicMaterial({ color: "#120c1a" }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -12, -9);
  scene.add(ground);

  // ---- helpers ------------------------------------------------------------------------------------
  const pick = (f: number, o: THREE.Object3D, hover: string, info: () => PickInfo | null) => {
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

  // ---- 2: the game hall -------------------------------------------------------------------------------
  {
    const f = 2,
      g = groups[f],
      y = LEVELS[f].y;
    const grid = canvas(256, 256, (gc) => {
      gc.fillStyle = "#0d0a18";
      gc.fillRect(0, 0, 256, 256);
      gc.strokeStyle = "rgba(176,123,255,0.35)";
      gc.lineWidth = 2;
      gc.strokeRect(0, 0, 256, 256);
    }).t;
    grid.wrapS = grid.wrapT = THREE.RepeatWrapping;
    grid.repeat.set(12, 9);
    shell(f, new THREE.MeshStandardMaterial({ map: grid, emissive: "#b07bff", emissiveMap: grid, emissiveIntensity: 0.25, roughness: 0.4 }), std("#0b0912", 0.9), { wallMat: std("#1a1428", 0.8) });
    elevators(f);
    label(f, "GAME HALL · ゲームセンター", 0, 3.7, Z0 + 0.25, { h: 0.42, color: "#ff3e8a" });
    for (const [k, z] of [-4, -9, -14].entries()) box(g, 18, 0.04, 0.06, glowMat(["#ff3e8a", "#3ef0ff", "#b07bff"][k], 1.5), 1, y + 4.3, z);
    // a row of cabinets along the north glass, another along the east: every game, twice
    const games: { game: "snake" | "memory" | "quiz" | "stacker"; name: string; color: string; bg: string }[] = [
      { game: "snake", name: "ZEC SNAKE", color: "#3ee08f", bg: "#06120c" },
      { game: "memory", name: "zkSNARK MEMORY", color: "#b07bff", bg: "#100a1c" },
      { game: "quiz", name: "ZIP QUIZ", color: "#f4b728", bg: "#14100a" },
      { game: "stacker", name: "BLOCK STACKER", color: "#3ef0ff", bg: "#04101a" },
    ];
    const cabinet = (x: number, z: number, rot: number, k: number) => {
      const gm = games[k % games.length];
      const c = new THREE.Group();
      c.position.set(x, y, z);
      c.rotation.y = rot;
      const body = box(c, 0.85, 1.85, 0.75, std(k % 2 ? "#241a38" : "#16223a", 0.5, 0.3), 0, 0, 0);
      const s = canvas(256, 192, (gc) => {
        gc.fillStyle = gm.bg;
        gc.fillRect(0, 0, 256, 192);
        gc.fillStyle = gm.color;
        gc.textAlign = "center";
        gc.font = '800 30px "JetBrains Mono", monospace';
        fitText(gc, gm.name, 128, 86);
        gc.font = '600 16px "JetBrains Mono", monospace';
        gc.fillStyle = "#e9e0c8";
        gc.fillText("CLICK TO PLAY", 128, 130);
      });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.48), new THREE.MeshBasicMaterial({ map: s.t, toneMapped: false }));
      scr.position.set(0, 1.38, 0.39);
      scr.rotation.x = -0.22;
      c.add(scr);
      box(c, 0.85, 0.18, 0.06, glowMat(gm.color, 1.6), 0, 1.8, 0.35);
      box(c, 0.85, 0.08, 0.35, darkMat, 0, 0.98, 0.45);
      g.add(c);
      for (const o of [scr, body]) pick(f, o, `<b>${gm.name}</b><span>click to play</span>`, () => ({ eyebrow: "Game hall", title: gm.name, game: gm.game }));
    };
    for (let k = 0; k < 8; k++) cabinet(-6 + k * 1.3, Z0 + 0.7, 0, k);
    rects[f].push([-6.6, Z0, 3.8, Z0 + 1.2]);
    for (let k = 0; k < 6; k++) cabinet(X1 - 0.7, -14.5 + k * 1.3, -Math.PI / 2, k + 2);
    rects[f].push([X1 - 1.2, -15.2, X1, -7.4]);
    // billiards, air hockey, a claw machine, a sofa to watch from
    box(g, 2.6, 0.12, 1.4, std("#1f6a3a", 0.95), -4, y + 0.82, -9);
    box(g, 2.8, 0.82, 1.6, walnut, -4, y, -9);
    for (let i = 0; i < 8; i++) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std(["#f4b728", "#d0504a", "#3a6ac0", "#1c1a22", "#ffffff", "#3ee08f", "#b07bff", "#ff9f2e"][i], 0.3));
      ball.position.set(-4.6 + hash(i, 1, 1, 1) * 1.2, y + 0.92, -9.4 + hash(i, 2, 1, 1) * 0.8);
      g.add(ball);
    }
    rects[f].push([-5.5, -9.9, -2.5, -8.1]);
    label(f, "BILLIARDS · ビリヤード", -4, 2.7, -9.85, { h: 0.2, color: "#3ee08f" });
    box(g, 2.2, 0.85, 1.2, std("#ececf4", 0.4), 1.5, y, -9);
    box(g, 2.0, 0.02, 1.0, glowMat("#3ef0ff", 0.6), 1.5, y + 0.86, -9);
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), std("#ff3e8a", 0.4));
    g.add(puck);
    ticks[f].push((_, t) => puck.position.set(1.5 + Math.sin(t * 2.3) * 0.85, y + 0.88, -9 + Math.sin(t * 3.1) * 0.4));
    rects[f].push([0.3, -9.7, 2.7, -8.3]);
    label(f, "AIR HOCKEY", 1.5, 2.7, -9.65, { h: 0.2, color: "#3ef0ff" });
    const claw = new THREE.Group();
    claw.position.set(-9.5, y, -2.2);
    box(claw, 1.2, 0.9, 1.2, std("#ff7ab0", 0.5), 0, 0, 0);
    const cglass = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.2, 1.15), glass);
    cglass.position.y = 1.5;
    claw.add(cglass);
    for (let i = 0; i < 9; i++) box(claw, 0.22, 0.22, 0.22, std(["#3ee08f", "#f4b728", "#b07bff", "#3ef0ff"][i % 4], 0.8), -0.35 + (i % 3) * 0.35, 0.9, -0.35 + Math.floor(i / 3) * 0.35);
    box(claw, 1.2, 0.2, 1.2, glowMat("#ff7ab0", 1.2), 0, 2.1, 0);
    g.add(claw);
    rects[f].push([-10.2, -2.9, -8.8, -1.5]);
    let tries = 0,
      won = 0;
    pick(f, cglass, "<b>Claw machine</b><span>try your luck</span>", () => {
      tries++;
      const win = Math.random() < 0.28;
      if (win) won++;
      return { eyebrow: "Claw machine", title: win ? "You got a plush zkSNARK! 🧸" : "So close…", body: `<p>${won} won out of ${tries} tries.</p>` };
    });
    sofa(g, 6, y, -3, 3, "#3a2a5a", Math.PI);
    rects[f].push([4.4, -3.5, 7.6, -2.4]);
    void person(f, 5555, [-5.4, -16.6], "Gamer", { face: new THREE.Vector3(0, 0, -1) });
    void person(f, 6666, [-1.5, -16.6], "Gamer", { face: new THREE.Vector3(0, 0, -1) });
    void person(f, 7777, [10.5, -11.9], "Gamer", { face: new THREE.Vector3(1, 0, 0) });
    void person(f, 8888, [-4, -10.3], "Pool shark", { face: new THREE.Vector3(0, 0, -1) });
    light(f, -3, -9, "#c8a0ff", 9);
    light(f, 5, -9, "#7fe3ff", 8);
    light(f, 0, -16, "#ff7ab0", 7);
    light(f, 10, -11, "#7fe3ff", 6);
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

  // ---- 5: the residences ------------------------------------------------------------------------------
  {
    const f = 5,
      g = groups[f],
      y = LEVELS[f].y,
      h = LEVELS[f].h;
    shell(f, std("#3a3036", 0.8), std("#1a1620", 0.9));
    elevators(f);
    const wallMat = std("#3e3650", 0.85);
    // the corridor east–west through the middle, three flats either side
    box(g, 21, 0.012, 1.4, std("#5a2a3a", 0.95), 0.5, y + 0.006, -9);
    for (const z of [-9.72, -8.28]) box(g, 21, 0.014, 0.03, glowMat("#ff9f2e", 1.1), 0.5, y + 0.008, z);
    const FX = [-10, -2.7, 4.6, 12];
    const flats = [
      { n: "501", side: -1, k: 0, open: true },
      { n: "502", side: -1, k: 1, open: false },
      { n: "503", side: -1, k: 2, open: true },
      { n: "504", side: 1, k: 0, open: false },
      { n: "505", side: 1, k: 1, open: true },
      { n: "506", side: 1, k: 2, open: false },
    ];
    for (const side of [-1, 1]) {
      const zw = side < 0 ? -10.5 : -7.5;
      for (let k = 0; k < 3; k++) {
        const a = FX[k],
          b = FX[k + 1],
          mid = (a + b) / 2;
        rects[f].push(wall(g, a, zw, mid - 0.7, zw, h, wallMat, y), wall(g, mid + 0.7, zw, b, zw, h, wallMat, y));
        if (k > 0) rects[f].push(wall(g, a, zw, a, side < 0 ? Z0 : Z1, h, wallMat, y));
        for (const x of [mid - 0.71, mid + 0.71]) box(g, 0.05, 2.2, 0.05, glowMat("#ff9f2e", 1.2), x, y, zw - side * 0.12);
        box(g, 1.47, 0.05, 0.05, glowMat("#ff9f2e", 1.2), mid, y + 2.2, zw - side * 0.12);
      }
    }
    rects[f].push(wall(g, FX[0], -10.5, FX[0], Z0, h, wallMat, y), wall(g, FX[0], -7.5, FX[0], Z1, h, wallMat, y));
    label(f, "RESIDENCES · 住居", 0.5, 3.0, -10.38, { h: 0.24, color: "#ff9f2e" });
    for (const fl of flats) {
      const a = FX[fl.k],
        b = FX[fl.k + 1],
        mid = (a + b) / 2;
      const zw = fl.side < 0 ? -10.5 : -7.5;
      // the number on a sign sticking out into the corridor, readable from the elevators
      const plate = label(f, fl.n, mid - 1.0, 2.55, zw - fl.side * 0.35, { h: 0.24, color: "#0d0d0d", bg: "#ff9f2e", rot: -Math.PI / 2 });
      (plate.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
      if (!fl.open) {
        const door = box(g, 1.38, 2.15, 0.08, walnut, mid, y, zw);
        box(g, 0.06, 0.06, 0.06, std("#d8b040", 0.3, 0.8), mid + 0.5, y + 1.05, zw - fl.side * 0.06);
        rects[f].push([mid - 0.7, zw - 0.1, mid + 0.7, zw + 0.1]);
        pick(f, door, `<b>Flat ${fl.n}</b><span>private</span>`, () => ({ eyebrow: `Flat ${fl.n}`, title: "Do not disturb", body: "<p>Someone lives here; the door stays shut. 501, 503 and 505 are open.</p>" }));
        continue;
      }
      // an open flat: bed, sofa, a TV with the chain, a window, a resident at home
      const inward = fl.side; // −1: the flat lies toward −z
      const zBack = inward < 0 ? Z0 + 0.4 : Z1 - 0.4;
      const bedZ = zBack - inward * 1.3;
      box(g, 1.6, 0.45, 2.1, std(["#3a5a8a", "#6a3a6a", "#3a6a3a"][fl.k], 0.9), a + 1.2, y, bedZ);
      box(g, 1.6, 0.15, 0.5, white, a + 1.2, y + 0.45, zBack - inward * 0.45);
      rects[f].push([a + 0.35, Math.min(bedZ - 1.1, bedZ + 1.1), a + 2.05, Math.max(bedZ - 1.1, bedZ + 1.1)]);
      const sofaZ = zw + inward * 2.6;
      sofa(g, b - 2.2, y, sofaZ, 1.9, ["#8a4a3a", "#3a6a5a", "#6a5a3a"][fl.k], inward < 0 ? 0 : Math.PI);
      rects[f].push([b - 3.2, Math.min(sofaZ - 0.5, sofaZ + 0.5), b - 1.2, Math.max(sofaZ - 0.5, sofaZ + 0.5)]);
      box(g, 3, 0.01, 2, std("#c8b89a", 0.95), b - 2.2, y + 0.005, sofaZ + inward * 1.6);
      const tv = screen(f, 1.4, 0.79, (gc, W, H) => {
        gc.fillStyle = "#04121a";
        gc.fillRect(0, 0, W, H);
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
      tv.position.set(b - 2.2, y + 1.3, zBack + inward * -0.05);
      tv.rotation.y = inward < 0 ? 0 : Math.PI;
      box(g, 1.5, 0.88, 0.04, darkMat, b - 2.2, y + 0.86, zBack + inward * -0.02);
      pick(f, tv, `<b>Flat ${fl.n} · TV</b><span>the chain, live</span>`, () => ({ eyebrow: `Flat ${fl.n} · TV`, title: height ? `Block ${height.toLocaleString("en-US")}` : "Waiting for a block", body: `<p>${liveTxt.mempool()}</p>` }));
      void person(f, [3333, 5151, 9090][fl.k], [b - 2.2, sofaZ], `Resident of ${fl.n}`, { face: new THREE.Vector3(0, 0, inward), wander: [[b - 2.2, sofaZ + inward * 0.9], [a + 2.6, zw + inward * 1.2], [mid, zw + inward * 2]] });
    }
    light(f, -6, -9, "#ffe6c8", 6);
    light(f, 4, -9, "#ffe6c8", 6);
    light(f, 0, -14, "#d8c0ff", 6);
    light(f, 0, -4, "#ffe2b8", 6);
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
      return o ? (picks.get(o)!() ?? null) : null;
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
