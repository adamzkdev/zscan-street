import * as THREE from "three";
import { GAME_CARDS, thumbOf as thumbUrl } from "../../party/catalog";
import { fitText } from "../../scene/fit";
import { T } from "../../i18n/lang";
import { std } from "../kit";
import { cup, tournamentDesk } from "./props";
import { GKit, ROOM, makeCanvas, rrect, zfont } from "./kit";

/**
 * The back of the hall: the MINI-GAMES WALL, a board of screens with every ZK PARTY mini-game
 * (src/party/games, its thumbnail, its colour, its name) and two more for the TOURNAMENT and the
 * QUICK MATCH; a click opens the party hall's selection on that game. A screen pops out when it is
 * looked at (or hovered), one of them is featured in turn, an LED ticker runs under the board. In
 * front of it the TOURNAMENT desk, its cup turning on the shelf.
 */

const WALL = { x: 0, w: 16.4, y0: 1.55, h: 4.6, gap: 0.18 };
const SW = 512;

interface Screen {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  base: THREE.Vector3;
  pop: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** What a screen opens: a mini-game, the tournament, a quick match. */
type Cell = { kind: "game"; key: string; title: string; tag: string; color: string } | { kind: "tour" | "quick" | "board" | "all"; title: string; tag: string; color: string };

export function miniWall(k: GKit) {
  const cells: Cell[] = GAME_CARDS.map((g) => ({ kind: "game", key: g.key, title: T(g.title, g.titleZh), tag: T(g.tag, g.tagZh), color: g.color }));
  cells.push({ kind: "tour", title: T("TOURNAMENT", "锦标赛"), tag: T("3 to 10 games in a row", "连续 3 到 10 场"), color: "#ff5c8a" });
  // three rows, as many columns as it takes; the grid's gaps filled with the board game and the whole list
  const cols = Math.max(5, Math.ceil(cells.length / 3));
  const rows = Math.ceil(cells.length / cols);
  const fill: Cell[] = [
    { kind: "board", title: T("THE BOARD GAME", "派对棋盘"), tag: T("roll, hop, buy Z-Blocks", "掷骰、前进、买 Z 方块"), color: "#ff6b35" },
    { kind: "all", title: T("ALL MINI-GAMES", "全部小游戏"), tag: T("pick any, practise free", "任选一个，免费练习"), color: "#c4b1fc" },
  ];
  while (cells.length < cols * rows && fill.length) cells.push(fill.shift()!);
  const cw = (WALL.w - WALL.gap * (cols - 1)) / cols;
  const ch = (WALL.h - WALL.gap * (rows - 1)) / rows;
  const SH = Math.round((SW * ch) / cw);
  const zWall = ROOM.z0 + 0.1;

  // the board behind the screens, its neon frame, the header
  k.box(WALL.w + 0.6, WALL.h + 0.6, 0.3, k.dark, WALL.x, WALL.y0 - 0.3, zWall + 0.15);
  k.box(WALL.w + 0.7, 0.07, 0.08, k.lilac, WALL.x, WALL.y0 + WALL.h + 0.3, zWall + 0.32);
  k.box(WALL.w + 0.7, 0.07, 0.08, k.flare, WALL.x, WALL.y0 - 0.37, zWall + 0.32);
  for (const s of [-1, 1]) k.box(0.07, WALL.h + 0.7, 0.08, s < 0 ? k.flare : k.lilac, WALL.x + (s * (WALL.w + 0.7)) / 2, WALL.y0 - 0.35, zWall + 0.32);
  k.label(T("ZK PARTY · MINI-GAMES", "ZK PARTY · 派对小游戏"), WALL.x, WALL.y0 + WALL.h + 0.66, zWall + 0.2, { h: 0.5, color: "#ff6b35" });

  // the screens
  const geo = new THREE.PlaneGeometry(cw, ch);
  const screens: Screen[] = [];
  cells.forEach((cell, i) => {
    const c = i % cols,
      r = Math.floor(i / cols);
    const x = WALL.x - WALL.w / 2 + cw / 2 + c * (cw + WALL.gap);
    const y = WALL.y0 + WALL.h - ch / 2 - r * (ch + WALL.gap);
    const canvas = makeCanvas(SW, SH);
    const mat = new THREE.MeshBasicMaterial({ map: canvas.t, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, zWall + 0.32);
    k.root.add(mesh);
    const draw = (img: HTMLImageElement | null) => {
      drawScreen(canvas.g, SW, SH, cell, img);
      canvas.t.needsUpdate = true;
    };
    draw(null);
    if (cell.kind === "game") {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => im.naturalWidth && draw(im);
      im.src = thumbUrl(cell.key);
    }
    screens.push({ mesh, mat, base: mesh.position.clone(), pop: 0, x0: x - cw / 2, x1: x + cw / 2, y0: y - ch / 2, y1: y + ch / 2 });
    const hover = `<b>${esc(cell.title)}</b><span>${cell.kind === "game" ? T("click to play · free practice or for ⓩ", "点击开玩 · 免费练习或押 ⓩ") : esc(cell.tag)}</span>`;
    k.pick(mesh, hover, () => {
      hovered = i;
      return cell.kind === "game"
        ? { eyebrow: "ZK PARTY", title: cell.title, party: "practice", partyGame: cell.key }
        : cell.kind === "all"
          ? { eyebrow: "ZK PARTY", title: cell.title, party: "practice", partyGame: "*" }
          : { eyebrow: "ZK PARTY", title: cell.title, party: cell.kind };
    });
  });

  // the LED ticker under the board: one strip of text, scrolled (never redrawn)
  {
    const text = T(
      "  ★ CLICK A SCREEN TO PLAY  ·  EVERY ARENA SEEDED BY THE LATEST ZCASH BLOCK  ·  TOURNAMENT AT THE DESK  ·  THE BOARD GAME IN THE MIDDLE  ·  ⓩ ARE PLAY CHIPS, NEVER REAL ZEC  ",
      "  ★ 点击屏幕开玩  ·  每个场地都由最新的 Zcash 区块生成  ·  锦标赛请到柜台  ·  棋盘游戏在大厅中央  ·  ⓩ 是游戏筹码，绝非真实 ZEC  ",
    );
    const { t } = makeCanvas(2048, 64, (g) => {
      g.fillStyle = "#07060c";
      g.fillRect(0, 0, 2048, 64);
      g.font = zfont('700 40px "JetBrains Mono", monospace');
      g.fillStyle = "#ffb08a";
      g.textBaseline = "middle";
      fitText(g, text, 6, 34, 2036);
      // the LED dots
      g.fillStyle = "rgba(0,0,0,0.35)";
      for (let x = 0; x < 2048; x += 4) g.fillRect(x, 0, 1, 64);
      for (let y = 0; y < 64; y += 4) g.fillRect(0, y, 2048, 1);
    });
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(0.42, 1);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(WALL.w, 0.32), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    strip.position.set(WALL.x, WALL.y0 - 0.62, zWall + 0.33);
    strip.raycast = () => {};
    k.root.add(strip);
    k.box(WALL.w + 0.2, 0.42, 0.12, k.dark, WALL.x, WALL.y0 - 0.83, zWall + 0.25);
    k.ticks.push((dt) => (t.offset.x = (t.offset.x + dt * 0.035) % 1));
  }

  // which screen pops: the one looked at (or hovered a moment ago), and one featured in turn
  let hovered = -1;
  let hoverAt = -10;
  let featured = 0;
  let featureT = 0;
  const ray = new THREE.Ray();
  const hitP = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(zWall + 0.32));
  const fwd = new THREE.Vector3();
  let clock = 0;
  const gaze = (camera: THREE.Camera) => {
    camera.getWorldDirection(fwd);
    ray.set(camera.position, fwd);
    if (!ray.intersectPlane(plane, hitP) || camera.position.distanceTo(hitP) > 20) return -1;
    return screens.findIndex((s) => hitP.x > s.x0 && hitP.x < s.x1 && hitP.y > s.y0 && hitP.y < s.y1);
  };
  const look = { camera: null as THREE.Camera | null };
  k.ticks.push((dt) => {
    clock += dt;
    featureT += dt;
    if (featureT > 2.6) {
      featureT = 0;
      featured = (featured + 1) % screens.length;
    }
    const g = look.camera ? gaze(look.camera) : -1;
    const hot = g >= 0 ? g : clock - hoverAt < 1.2 ? hovered : -1;
    screens.forEach((s, i) => {
      const want = i === hot ? 1 : i === featured ? 0.35 : 0;
      s.pop += (want - s.pop) * Math.min(1, dt * 9);
      s.mesh.position.set(s.base.x, s.base.y, s.base.z + s.pop * 0.12);
      s.mesh.scale.setScalar(1 + s.pop * 0.06);
      const b = 0.9 + s.pop * 0.3 + (i === featured ? Math.sin(clock * 6) * 0.04 : 0);
      s.mat.color.setScalar(b);
    });
  });

  // ---- the TOURNAMENT desk, its screen and its cup ----
  const dz = ROOM.z0 + 2.9;
  k.put("gh-tourDesk", tournamentDesk, 0, dz);
  const tour = () => ({ eyebrow: "ZK PARTY", title: T("TOURNAMENT", "锦标赛"), party: "tour" as const });
  const tourHover = `<b>${T("Tournament", "锦标赛")}</b><span>${T("3 to 10 mini-games in a row, the same rivals", "同样的对手，连续 3 到 10 场小游戏")}</span>`;
  k.hit(4.3, 1.2, 0.95, 0, 0, dz, tourHover, tour);
  // the cups on show: the champion's turning on its shelf, two smaller ones either side of the desk
  const trophy = cup(k.chrome, k.flare);
  trophy.scale.setScalar(1.25);
  trophy.position.set(1.45, 1.17, dz);
  k.root.add(trophy);
  k.pickAll(trophy, tourHover, tour);
  k.ticks.push((dt) => (trophy.rotation.y += dt * 0.6));
  for (const [x, sc, mat] of [
    [-1.5, 0.85, k.chrome],
    [-0.6, 0.7, std("#c88a5a", 0.3, 0.85)],
  ] as const) {
    const c = cup(mat, k.lilac);
    c.scale.setScalar(sc);
    c.position.set(x, 1.09, dz);
    c.rotation.y = x;
    k.root.add(c);
    k.pickAll(c, tourHover, tour);
  }
  k.box(2.0, 0.32, 0.02, k.dark, 0, 0.46, dz + 0.425);
  k.label(T("TOURNAMENT · 锦标赛", "锦标赛 · TOURNAMENT"), 0, 0.62, dz + 0.44, { h: 0.2, color: "#ff5c8a" });

  return {
    /** The camera, for the gaze (set by the place's update). */
    look,
    /** A hover on a screen (the place's hover hook). */
    hovered(i: number) {
      hovered = i;
      hoverAt = clock;
    },
    screenOf: (o: THREE.Object3D) => screens.findIndex((s) => s.mesh === o),
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** One screen: the thumbnail (or a stand-in of its colour), the name on a band, a frame of its colour. */
function drawScreen(g: CanvasRenderingContext2D, W: number, H: number, cell: Cell, img: HTMLImageElement | null) {
  g.fillStyle = "#0b0a10";
  g.fillRect(0, 0, W, H);
  if (img) {
    // cover the screen, centred
    const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const iw = img.naturalWidth * k,
      ih = img.naturalHeight * k;
    g.drawImage(img, (W - iw) / 2, (H - ih) / 2 - H * 0.04, iw, ih);
  } else {
    const grd = g.createRadialGradient(W * 0.5, H * 0.4, 8, W * 0.5, H * 0.5, W * 0.7);
    grd.addColorStop(0, `${cell.color}88`);
    grd.addColorStop(1, "#0b0a10");
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(W / 2, H * 0.42);
    if (cell.kind === "tour") {
      // a cup
      g.fillStyle = "#f2eee6";
      g.beginPath();
      g.moveTo(-46, -50);
      g.lineTo(46, -50);
      g.quadraticCurveTo(44, 20, 0, 26);
      g.quadraticCurveTo(-44, 20, -46, -50);
      g.fill();
      g.fillRect(-8, 24, 16, 22);
      g.fillRect(-30, 44, 60, 10);
      g.strokeStyle = "#f2eee6";
      g.lineWidth = 8;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(s * 50, -24, 18, s > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? Math.PI / 2 : (3 * Math.PI) / 2, s < 0);
        g.stroke();
      }
      g.fillStyle = cell.color;
      g.fillRect(-46, -30, 92, 10);
    } else if (cell.kind === "quick") {
      // a bolt
      g.fillStyle = "#f2eee6";
      g.beginPath();
      g.moveTo(12, -62);
      g.lineTo(-34, 6);
      g.lineTo(-4, 6);
      g.lineTo(-14, 60);
      g.lineTo(34, -10);
      g.lineTo(4, -10);
      g.closePath();
      g.fill();
    } else if (cell.kind === "board") {
      // the ring of spaces, a Z-Block in the middle
      const cols = ["#3ea0ff", "#ff4d5e", "#a77bff", "#3ea0ff"];
      for (let i = 0; i < 20; i++) {
        const side = Math.floor(i / 5),
          t = (i % 5) - 2;
        const [x, y] = [
          [t * 30, -58],
          [70, t * 22],
          [-t * 30, 58],
          [-70, -t * 22],
        ][side];
        g.fillStyle = i === 0 ? "#ff6b35" : cols[i % 4];
        g.fillRect(x - 12, y - 9, 24, 18);
      }
      g.fillStyle = "#ff6b35";
      g.fillRect(-22, -22, 44, 44);
      g.fillStyle = "#fff6e8";
      g.font = '900 36px Geist, sans-serif';
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("Z", 0, 2);
    } else if (cell.kind === "all") {
      // a little grid of screens
      for (let i = 0; i < 9; i++) {
        g.fillStyle = ["#ff6b35", "#c4b1fc", "#a8d8e8", "#6dbf8a", "#ff5c8a"][i % 5];
        g.fillRect(-84 + (i % 3) * 58, -46 + Math.floor(i / 3) * 32, 50, 26);
      }
    } else {
      // a pattern of blocks in its colour
      g.fillStyle = cell.color;
      for (let i = 0; i < 9; i++) g.fillRect(-90 + (i % 3) * 62, -50 + Math.floor(i / 3) * 34, 54, 28);
    }
    g.restore();
  }
  // the name band
  const band = H * 0.26;
  const grd = g.createLinearGradient(0, H - band * 1.6, 0, H);
  grd.addColorStop(0, "rgba(8,7,12,0)");
  grd.addColorStop(0.45, "rgba(8,7,12,0.82)");
  grd.addColorStop(1, "rgba(8,7,12,0.95)");
  g.fillStyle = grd;
  g.fillRect(0, H - band * 1.6, W, band * 1.6);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillStyle = "#ffffff";
  g.font = zfont(`800 ${Math.round(H * 0.15)}px Geist, "JetBrains Mono", sans-serif`);
  g.shadowColor = cell.color;
  g.shadowBlur = 12;
  fitText(g, cell.title, 18, H - band * 0.42, W - 36);
  g.shadowBlur = 0;
  // the frame: its colour, a softer glow inside
  g.strokeStyle = cell.color;
  g.lineWidth = 8;
  rrect(g, 4, 4, W - 8, H - 8, 12);
  g.stroke();
  g.strokeStyle = `${cell.color}55`;
  g.lineWidth = 4;
  rrect(g, 12, 12, W - 24, H - 24, 8);
  g.stroke();
  if (cell.kind !== "game") {
    g.fillStyle = cell.color;
    g.font = zfont(`700 ${Math.round(H * 0.07)}px "JetBrains Mono", monospace`);
    g.textAlign = "right";
    fitText(g, cell.tag, W - 18, H * 0.14, W * 0.7);
  }
}
