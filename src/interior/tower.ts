import * as THREE from "three";
import { Snark, loadArt } from "../scene/snark";
import { fitText } from "../scene/fit";
import { box, glowMat, makeScene, room, std, textPlane, wall } from "./kit";
import type { Interior, InteriorContext, PickInfo, Rect } from "./types";

/**
 * The ZK TOWER (秘密マンション), between the MEMPOOL shop and zkCARDS: apartments.
 * G — the lobby: the concierge, mailboxes, the stairs, the elevator, the residents' directory.
 * 1 — the fun floor: 101 ARCADE (ZEC Snake), 102 GAME ROOM (zkSNARK memory), 103 QUIZ LOUNGE (ZIP quiz).
 * 2 — residents: three flats where zkSNARKs live, a TV in each showing the chain live.
 * Click the elevator doors (or use the panel) to go up and down.
 */

const LOBBY_Y = 0,
  FUN_Y = 4.5,
  HOME_Y = 9;
/** Corridor floors: the corridor runs along x at z −3…0, the flats open off its north side. */
const FLAT_X = [-8, -8 / 3, 8 / 3, 8];
const FLAT_Z1 = -9;

function screenTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 512, h = 288) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { t, g, c };
}

export function buildTower(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0c0b10");
  const pickables: THREE.Object3D[] = [];
  const picks = new Map<THREE.Object3D, () => PickInfo>();
  const hovers = new Map<THREE.Object3D, string>();
  const people: Snark[] = [];
  const ticks: ((dt: number, t: number) => void)[] = [];
  const rects: Rect[][] = [[], [], []];
  const wood = std("#6a4a33", 0.7);
  const dark = std("#2a2630", 0.6, 0.2);
  const pick = (o: THREE.Object3D, hover: string, info: () => PickInfo) => {
    pickables.push(o);
    hovers.set(o, hover);
    picks.set(o, info);
  };
  const person = async (id: number, at: THREE.Vector3, role: string, face = new THREE.Vector3(0, 0, 1), wander?: THREE.Vector3[]) => {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      s.root.position.copy(at);
      s.faceDir = face;
      scene.add(s.root);
      people.push(s);
      if (!wander) return;
      for (;;) {
        await new Promise((r) => setTimeout(r, 4000 + Math.random() * 5000));
        s.faceDir = null;
        await s.walk([wander[Math.floor(Math.random() * wander.length)]], 0.8);
        s.faceDir = face;
      }
    } catch {}
  };
  /** Elevator doors on a wall facing +z at (x, z); a click takes you to `to`. */
  const elevator = (x: number, y: number, z: number, to: number, label: string, facing = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = facing;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.5, 0.12), std("#8a8494", 0.4, 0.6));
    frame.position.y = 1.25;
    const doors = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.14), std("#c8ccd4", 0.25, 0.85));
    doors.position.y = 1.1;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.2, 0.16), dark);
    seam.position.y = 1.1;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.05), glowMat("#3ef0ff", 1.4));
    lamp.position.set(0, 2.62, 0.04);
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.05), glowMat("#ffd28a", 1.6));
    btn.position.set(1.0, 1.2, 0.04);
    g.add(frame, doors, seam, lamp, btn);
    const sign = textPlane(`エレベーター · ${label}`, { h: 0.16, color: "#3ef0ff", glow: true });
    sign.position.set(0, 2.85, 0.07);
    g.add(sign);
    scene.add(g);
    pick(doors, `<b>Elevator</b><span>${label}</span>`, () => ({ eyebrow: "Elevator", title: label, floor: to }));
  };

  // ---- G: the lobby ------------------------------------------------------------------------------
  rects[0].push(
    ...room(scene, {
      x0: -6,
      z0: -9,
      x1: 6,
      z1: 0,
      y: LOBBY_Y,
      h: 3.6,
      floor: std("#3a3440", 0.35, 0.2),
      wall: std("#d8d2c6", 0.9),
      ceiling: std("#24202a", 0.9),
      door: [-1.5, 1.5],
    }),
  );
  // the reception desk and the concierge behind it
  box(scene, 3, 1.05, 0.9, wood, -3, LOBBY_Y, -4.2);
  box(scene, 3.1, 0.06, 1.0, std("#e8e2d4", 0.5), -3, LOBBY_Y + 1.05, -4.2);
  box(scene, 2.9, 0.06, 0.04, glowMat("#3ef0ff", 1.2), -3, LOBBY_Y + 0.6, -3.74);
  rects[0].push([-4.6, -4.7, -1.4, -3.7]);
  void person(2024, new THREE.Vector3(-3, LOBBY_Y, -5.3), "Concierge");
  // mailboxes on the west wall: one per flat
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++) {
      box(scene, 0.04, 0.32, 0.42, std(r === 1 ? "#5a6a8a" : "#4a4a5a", 0.4, 0.5), -5.95, LOBBY_Y + 1.0 + r * 0.38, -1.6 - c * 0.48);
      box(scene, 0.03, 0.04, 0.12, glowMat("#ffd28a", 1), -5.92, LOBBY_Y + 1.1 + r * 0.38, -1.6 - c * 0.48);
    }
  // the stairs up in the north-east corner
  for (let k = 0; k < 10; k++) box(scene, 1.6, 0.36 * (k + 1), 0.4, std("#6a6470", 0.7), 5.1, LOBBY_Y, -3.8 - k * 0.4);
  rects[0].push([4.2, -8.2, 6, -3.6]);
  const stairs = textPlane("階段 STAIRS ↑", { h: 0.18, color: "#ffd28a", glow: true });
  stairs.position.set(5.1, LOBBY_Y + 2.9, -3.4);
  scene.add(stairs);
  elevator(1.2, LOBBY_Y, -8.9, 1, "up to the fun floor");
  // the directory on the east wall
  const dir = screenTexture((g, w, h) => {
    g.fillStyle = "#0b0a10";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#3ef0ff";
    g.font = '700 30px "JetBrains Mono", monospace';
    fitText(g, "ZK TOWER · RESIDENTS", 24, 44);
    g.font = '500 22px "JetBrains Mono", monospace';
    const rows = [
      ["1F", "101 ARCADE · ZEC SNAKE"],
      ["1F", "102 GAME ROOM · MEMORY"],
      ["1F", "103 QUIZ LOUNGE · ZIPs"],
      ["2F", "201 · 202 · 203 RESIDENTS"],
    ];
    rows.forEach(([f, n], i) => {
      g.fillStyle = "#ffd28a";
      g.fillText(f, 24, 100 + i * 44);
      g.fillStyle = "#e9eef7";
      fitText(g, n, 80, 100 + i * 44);
    });
  });
  const directory = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.24), new THREE.MeshBasicMaterial({ map: dir.t, toneMapped: false }));
  directory.position.set(5.94, LOBBY_Y + 1.7, -1.6);
  directory.rotation.y = -Math.PI / 2;
  scene.add(directory);
  for (const [x, z] of [
    [-2, -2],
    [2, -6],
  ]) {
    const l = new THREE.PointLight("#ffe6c8", 6, 10, 1.6);
    l.position.set(x, LOBBY_Y + 3.3, z);
    scene.add(l);
  }
  // a plant either side of the door
  for (const x of [-2.3, 2.3]) {
    box(scene, 0.5, 0.5, 0.5, std("#3a3036", 0.8), x, LOBBY_Y, -0.6);
    box(scene, 0.6, 0.9, 0.6, std("#2f7d4a", 0.9), x, LOBBY_Y + 0.5, -0.6);
    rects[0].push([x - 0.3, -0.9, x + 0.3, -0.3]);
  }

  // ---- corridor floors ----------------------------------------------------------------------------
  const floorShell = (fi: number, y: number, title: string, numbers: string[], color: string) => {
    const r = rects[fi];
    const floorMat = std("#2e2830", 0.7),
      wallMat = std("#3e3650", 0.85),
      ceil = std("#18151e", 0.9);
    // a carpet runner down the corridor, neon along its edges
    box(scene, 15.6, 0.012, 1.3, std("#5a2a3a", 0.95), 0, y + 0.006, -1.5);
    for (const z of [-2.17, -0.83]) box(scene, 15.6, 0.014, 0.03, glowMat(color, 1.1), 0, y + 0.008, z);
    box(scene, 16, 0.05, 9, floorMat, 0, y - 0.05, -4.5);
    box(scene, 16, 0.05, 9, ceil, 0, y + 3.2, -4.5);
    r.push(wall(scene, -8, 0, 8, 0, 3.2, wallMat, y), wall(scene, -8, -9, -8, 0, 3.2, wallMat, y), wall(scene, 8, -9, 8, 0, 3.2, wallMat, y), wall(scene, -8, FLAT_Z1, 8, FLAT_Z1, 3.2, wallMat, y));
    // the north side of the corridor: a wall with a doorway into each flat
    for (let k = 0; k < 3; k++) {
      const a = FLAT_X[k],
        b = FLAT_X[k + 1],
        mid = (a + b) / 2;
      r.push(wall(scene, a, -3, mid - 0.65, -3, 3.2, wallMat, y), wall(scene, mid + 0.65, -3, b, -3, 3.2, wallMat, y));
      if (k < 2) r.push(wall(scene, b, FLAT_Z1, b, -3, 3.2, wallMat, y));
      box(scene, 1.5, 0.1, 0.2, dark, mid, y + 2.2, -3);
      // a lit frame round the doorway, and a sign sticking out from the wall like a hotel's
      for (const x of [mid - 0.66, mid + 0.66]) box(scene, 0.05, 2.2, 0.05, glowMat(color, 1.3), x, y, -2.92);
      box(scene, 1.37, 0.05, 0.05, glowMat(color, 1.3), mid, y + 2.2, -2.92);
      const plate = textPlane(numbers[k], { h: 0.24, color: "#0d0d0d", bg: color });
      (plate.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
      plate.position.set(mid - 0.9, y + 2.55, -2.55);
      plate.rotation.y = -Math.PI / 2;
      scene.add(plate);
      box(scene, 0.04, 0.04, 0.5, dark, mid - 0.9, y + 2.75, -2.8);
    }
    // corridor ceiling lights, a strip of neon, the floor's name by the elevator
    for (const x of [-5, 0, 5]) {
      const l = new THREE.PointLight("#ffe6c8", 4, 8, 1.6);
      l.position.set(x, y + 3, -1.5);
      scene.add(l);
      box(scene, 1.4, 0.03, 0.4, glowMat("#f4f0e8", 1), x, y + 3.15, -1.5);
    }
    box(scene, 15.9, 0.05, 0.03, glowMat(color, 1.3), 0, y + 2.9, -0.04);
    const name = textPlane(title, { h: 0.2, color, glow: true });
    name.position.set(-4.5, y + 2.6, -0.06);
    name.rotation.y = Math.PI;
    scene.add(name);
  };
  const flatLight = (x: number, y: number, z: number, c = "#ffe2b8", i = 6) => {
    const l = new THREE.PointLight(c, i, 8, 1.6);
    l.position.set(x, y + 2.9, z);
    scene.add(l);
  };

  // ---- 1: the fun floor -------------------------------------------------------------------------------
  floorShell(1, FUN_Y, "1F · FUN FLOOR · 遊び", ["101 ARCADE", "102 GAME ROOM", "103 QUIZ"], "#3ee08f");
  elevator(-6.6, FUN_Y, -0.1, 2, "up to the residents", Math.PI);
  // 101: the arcade — a ZEC SNAKE cabinet, neon, beanbags
  {
    const cx = (FLAT_X[0] + FLAT_X[1]) / 2;
    const scr = screenTexture((g, w, h) => {
      g.fillStyle = "#06120c";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#3ee08f";
      g.font = '800 54px "JetBrains Mono", monospace';
      g.textAlign = "center";
      fitText(g, "ZEC SNAKE", w / 2, 110);
      g.fillStyle = "#f4b728";
      g.font = '600 26px "JetBrains Mono", monospace';
      fitText(g, "INSERT ⓩ · CLICK TO PLAY", w / 2, 180);
    });
    for (const [k, x] of [-1.4, 1.4].entries()) {
      const cab = new THREE.Group();
      cab.position.set(cx + x, FUN_Y, FLAT_Z1 + 0.5);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.7), std(k ? "#2a1a3a" : "#1a2a3a", 0.5, 0.3));
      body.position.y = 0.9;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), new THREE.MeshBasicMaterial({ map: scr.t, toneMapped: false }));
      screen.position.set(0, 1.35, 0.36);
      screen.rotation.x = -0.25;
      const marquee = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.05), glowMat("#3ee08f", 1.5));
      marquee.position.set(0, 1.85, 0.33);
      cab.add(body, screen, marquee);
      scene.add(cab);
      pick(screen, "<b>ZEC SNAKE</b><span>click to play</span>", () => ({ eyebrow: "101 · Arcade", title: "ZEC SNAKE", game: "snake" }));
      pick(body, "<b>ZEC SNAKE</b><span>click to play</span>", () => ({ eyebrow: "101 · Arcade", title: "ZEC SNAKE", game: "snake" }));
    }
    rects[1].push([cx - 1.9, FLAT_Z1, cx + 1.9, FLAT_Z1 + 0.95]);
    for (const [x, z, c] of [
      [cx - 1.6, -5.2, "#c0503a"],
      [cx + 1.5, -5.6, "#3a7ac0"],
    ] as const) box(scene, 0.8, 0.45, 0.8, std(c, 0.9), x, FUN_Y, z);
    box(scene, 5.2, 0.04, 0.04, glowMat("#ff3e8a", 1.4), cx, FUN_Y + 2.95, FLAT_Z1 + 0.05);
    flatLight(cx, FUN_Y, -6, "#c8a0ff", 5);
    void person(77, new THREE.Vector3(cx + 1.4, FUN_Y, -7.3), "Gamer", new THREE.Vector3(0, 0, -1));
  }
  // 102: the game room — a card table with the memory game laid out
  {
    const cx = (FLAT_X[1] + FLAT_X[2]) / 2;
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 1.4), std("#2f6a4a", 0.9));
    table.position.set(cx, FUN_Y + 0.8, -6.2);
    scene.add(table);
    for (const [x, z] of [
      [-1, -0.6],
      [1, -0.6],
      [-1, 0.6],
      [1, 0.6],
    ])
      box(scene, 0.08, 0.8, 0.08, wood, cx + x, FUN_Y, -6.2 + z);
    for (let i = 0; i < 16; i++) box(scene, 0.22, 0.02, 0.3, std(i % 3 ? "#b07bff" : "#8a5ad8", 0.6), cx - 0.75 + (i % 4) * 0.5, FUN_Y + 0.85, -6.65 + Math.floor(i / 4) * 0.32);
    rects[1].push([cx - 1.2, -7, cx + 1.2, -5.4]);
    pick(table, "<b>zkSNARK MEMORY</b><span>click to play</span>", () => ({ eyebrow: "102 · Game room", title: "zkSNARK MEMORY", game: "memory" }));
    flatLight(cx, FUN_Y, -6);
    void person(4096, new THREE.Vector3(cx, FUN_Y, -7.6), "Dealer");
  }
  // 103: the quiz lounge — a big TV and a sofa
  {
    const cx = (FLAT_X[2] + FLAT_X[3]) / 2;
    const tv = screenTexture((g, w, h) => {
      g.fillStyle = "#14100a";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#f4b728";
      g.font = '800 60px "JetBrains Mono", monospace';
      g.textAlign = "center";
      fitText(g, "ZIP QUIZ", w / 2, 120);
      g.fillStyle = "#e9e0c8";
      g.font = '500 24px "JetBrains Mono", monospace';
      fitText(g, "TEN QUESTIONS · THE REAL ZIPs", w / 2, 180);
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.35), new THREE.MeshBasicMaterial({ map: tv.t, toneMapped: false }));
    screen.position.set(cx, FUN_Y + 1.6, FLAT_Z1 + 0.06);
    scene.add(screen);
    box(scene, 2.5, 1.45, 0.04, dark, cx, FUN_Y + 0.88, FLAT_Z1 + 0.03);
    box(scene, 2.4, 0.5, 0.8, std("#5a3a5a", 0.9), cx, FUN_Y, -4.4);
    box(scene, 2.4, 0.5, 0.2, std("#5a3a5a", 0.9), cx, FUN_Y + 0.5, -4.0);
    rects[1].push([cx - 1.25, -4.85, cx + 1.25, -3.8]);
    pick(screen, "<b>ZIP QUIZ</b><span>click to play</span>", () => ({ eyebrow: "103 · Quiz lounge", title: "ZIP QUIZ", game: "quiz" }));
    flatLight(cx, FUN_Y, -6, "#ffd28a", 5);
  }

  // ---- 2: the residents -------------------------------------------------------------------------------
  floorShell(2, HOME_Y, "2F · RESIDENTS · 住人", ["201", "202", "203"], "#ff9f2e");
  elevator(-6.6, HOME_Y, -0.1, 0, "down to the lobby", Math.PI);
  let height = 0;
  const tvs: { g: CanvasRenderingContext2D; t: THREE.CanvasTexture }[] = [];
  const drawTv = (g: CanvasRenderingContext2D) => {
    g.fillStyle = "#04121a";
    g.fillRect(0, 0, 512, 288);
    g.fillStyle = "#3ef0ff";
    g.font = '600 26px "JetBrains Mono", monospace';
    g.textAlign = "left";
    fitText(g, "ZCASH MAINNET · LIVE", 28, 50);
    g.fillStyle = "#e8fbff";
    g.font = '800 84px "JetBrains Mono", monospace';
    fitText(g, height ? `#${height.toLocaleString("en-US")}` : "…", 28, 160);
    g.fillStyle = "#ff3e8a";
    g.font = '600 26px "JetBrains Mono", monospace';
    fitText(g, `${ctx.director.mempoolList().length} TX WAITING FOR A BUS`, 28, 230);
  };
  ctx.onBlock((h) => {
    height = h;
    for (const tv of tvs) {
      drawTv(tv.g);
      tv.t.needsUpdate = true;
    }
  });
  const flats: { id: number; name: string; bed: string; sofa: string }[] = [
    { id: 3333, name: "201", bed: "#3a5a8a", sofa: "#8a4a3a" },
    { id: 5151, name: "202", bed: "#6a3a6a", sofa: "#3a6a5a" },
    { id: 9090, name: "203", bed: "#3a6a3a", sofa: "#6a5a3a" },
  ];
  flats.forEach((f, k) => {
    const a = FLAT_X[k],
      b = FLAT_X[k + 1],
      cx = (a + b) / 2;
    // bed in the back corner, sofa facing the TV, a rug, a window onto the night city
    box(scene, 1.6, 0.45, 2.1, std(f.bed, 0.9), a + 1.0, HOME_Y, -7.8);
    box(scene, 1.6, 0.15, 0.5, std("#e8e2d4", 0.9), a + 1.0, HOME_Y + 0.45, -8.55);
    box(scene, 1.9, 0.45, 0.75, std(f.sofa, 0.9), cx + 0.6, HOME_Y, -4.3);
    box(scene, 1.9, 0.45, 0.2, std(f.sofa, 0.9), cx + 0.6, HOME_Y + 0.45, -3.95);
    box(scene, 2.6, 0.01, 1.8, std("#c8b89a", 0.95), cx + 0.3, HOME_Y + 0.005, -5.6);
    rects[2].push([a + 0.15, -8.9, a + 1.85, -6.7], [cx - 0.4, -4.75, cx + 1.6, -3.8]);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color("#2a2050").multiplyScalar(1.3) }));
    win.position.set(b - 1.4, HOME_Y + 1.7, FLAT_Z1 + 0.05);
    scene.add(win);
    for (let i = 0; i < 6; i++) box(scene, 0.12, 0.2 + ((i * 37) % 5) * 0.12, 0.01, glowMat(["#ffd28a", "#3ef0ff", "#ff3e8a"][i % 3], 1.2), b - 2.1 + i * 0.28, HOME_Y + 1.2, FLAT_Z1 + 0.06);
    const tv = screenTexture((g) => drawTv(g));
    tvs.push({ g: tv.g, t: tv.t });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.79), new THREE.MeshBasicMaterial({ map: tv.t, toneMapped: false }));
    screen.position.set(cx + 0.6, HOME_Y + 1.25, -6.65);
    screen.rotation.y = Math.PI;
    box(scene, 1.5, 0.88, 0.05, dark, cx + 0.6, HOME_Y + 0.81, -6.62);
    box(scene, 1.4, 0.5, 0.4, wood, cx + 0.6, HOME_Y, -6.4);
    rects[2].push([cx - 0.15, -6.65, cx + 1.35, -6.15]);
    scene.add(screen);
    pick(screen, `<b>Flat ${f.name} · TV</b><span>the chain, live</span>`, () => ({
      eyebrow: `Flat ${f.name} · TV`,
      title: height ? `Block ${height.toLocaleString("en-US")}` : "Waiting for a block",
      body: `<p>${ctx.director.mempoolList().length} transactions waiting in the MEMPOOL for the next bus.</p>`,
    }));
    flatLight(cx, HOME_Y, -6, k === 1 ? "#d8c0ff" : "#ffe2b8", 5);
    void person(f.id, new THREE.Vector3(cx + 0.6, HOME_Y, -4.9), `Resident of ${f.name}`, new THREE.Vector3(0, 0, -1), [new THREE.Vector3(cx + 0.6, HOME_Y, -4.9), new THREE.Vector3(a + 1.0, HOME_Y, -6.2), new THREE.Vector3(b - 1.2, HOME_Y, -8.2)]);
  });

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
    floors: [
      { label: "G", name: "Lobby · concierge, mailboxes", y: LOBBY_Y, spawn: new THREE.Vector3(0, LOBBY_Y, -1.2), yaw: 0 },
      { label: "1", name: "Fun floor · arcade, memory, quiz", y: FUN_Y, spawn: new THREE.Vector3(-6.6, FUN_Y, -1.2), yaw: -Math.PI / 2 },
      { label: "2", name: "Residents · flats 201–203", y: HOME_Y, spawn: new THREE.Vector3(-6.6, HOME_Y, -1.2), yaw: -Math.PI / 2 },
    ],
    colliders: (f) => rects[f],
    pickables: () => pickables,
    pick: (hit) => {
      const o = find(hit.object);
      return o ? picks.get(o)!() : null;
    },
    hover: (hit) => {
      const o = find(hit.object);
      return o ? (hovers.get(o) ?? null) : null;
    },
    update(dt, t, camera) {
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of people) s.update(dt, t, camQuat, camRight);
      for (const k of ticks) k(dt, t);
    },
  };
}
