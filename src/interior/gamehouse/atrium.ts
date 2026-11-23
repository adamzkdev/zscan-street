import * as THREE from "three";
import { T } from "../../i18n/lang";
import { GAME_CARDS, thumbOf } from "../../party/catalog";
import { glowMat, std } from "../kit";
import type { PickInfo } from "../types";
import { duel, duelClock, led, portrait, stepDuel, stepped } from "./arena";
import { GKit, PX, ROOM, makeCanvas, mix, onFonts } from "./kit";
import { tableCard } from "../../tables/house";

/**
 * The atrium's JUMBOTRON: a four-sided LED cube hung over the ZK PARTY board on cables, a ribbon of
 * light running round its top and bottom. It turns through what the house has on: the arena's live
 * duel, the mini-game of the hour (a click opens it), the latest Zcash block that shuffles every
 * table, the house's floors. One canvas, four faces.
 */

const GOLD = "#f4b728";
const LILAC = "#c4b1fc";
const FLARE = "#ff6b35";
const SCENES = 4;
const SCENE_S = 7;

export function jumbotron(k: GKit, x: number, z: number) {
  const W = 1024,
    H = 576;
  const fw = 6.4,
    fh = 3.6;
  const y0 = 7.0;
  const yc = y0 + fh / 2;
  const face = makeCanvas(W, H);
  const mat = new THREE.MeshBasicMaterial({ map: face.t, toneMapped: false });
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  k.root.add(g);
  // the cube: a void frame, the four faces, gold lips
  const half = fw / 2 + 0.06;
  const body = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.1, fh + 0.3, fw + 0.1), std("#0a0910", 0.5, 0.4));
  body.position.y = yc;
  g.add(body);
  k.keep(body);
  const faces: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), mat);
    m.position.set(Math.sin(a) * half, yc, Math.cos(a) * half);
    m.rotation.y = a;
    g.add(m);
    faces.push(m);
  }
  for (const yy of [y0 - 0.2, y0 + fh + 0.12]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.3, 0.08, fw + 0.3), glowMat(GOLD, 1.4));
    lip.position.y = yy;
    g.add(lip);
    k.keep(lip);
  }
  // the ribbons above and below: a scrolling line of light round the cube
  const ribbonText = T(
    "  ZK LEGENDS · ZK PARTY · BLOCK BARONS · LAST SNARK · ORCHARD HOLD'EM · EVERY TABLE SHUFFLED BY THE LATEST ZCASH BLOCK ·",
    "  零知传奇 · ZK PARTY · 区块大亨 · 最后一证 · 果园德州扑克 · 每张牌桌都由最新 Zcash 区块洗牌 ·",
  );
  const rib = makeCanvas(2048, 64);
  const drawRib = () => {
    const r = rib.g;
    r.fillStyle = "#07060c";
    r.fillRect(0, 0, 2048, 64);
    r.font = PX(40);
    r.textBaseline = "middle";
    r.fillStyle = GOLD;
    r.fillText(ribbonText, 8, 34);
    r.fillStyle = "rgba(0,0,0,0.4)";
    for (let i = 0; i < 2048; i += 4) r.fillRect(i, 0, 1, 64);
    for (let j = 0; j < 64; j += 4) r.fillRect(0, j, 2048, 1);
    rib.t.needsUpdate = true;
  };
  drawRib();
  onFonts(drawRib);
  rib.t.wrapS = THREE.RepeatWrapping;
  rib.t.repeat.set(1.1, 1);
  const ribMat = new THREE.MeshBasicMaterial({ map: rib.t, toneMapped: false });
  for (const yy of [y0 - 0.62, y0 + fh + 0.22])
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(fw + 0.3, 0.36), ribMat);
      m.position.set(Math.sin(a) * (half + 0.1), yy + 0.18, Math.cos(a) * (half + 0.1));
      m.rotation.y = a;
      m.raycast = () => {};
      g.add(m);
    }
  for (const yy of [y0 - 0.62, y0 + fh + 0.22]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.4, 0.4, fw + 0.4), std("#0a0910", 0.5, 0.4));
    band.position.y = yy + 0.18;
    band.scale.set(0.985, 1, 0.985);
    g.add(band);
    k.keep(band);
  }
  // the cables to the ceiling
  for (const [cx, cz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const c = k.box(0.03, ROOM.h - (y0 + fh + 0.6), 0.03, std("#5a5662", 0.4, 0.8), cx * (fw / 2 - 0.3), y0 + fh + 0.6, cz * (fw / 2 - 0.3), g);
    c.raycast = () => {};
  }

  // ---- what it shows
  let scene = 0,
    sceneT = 0,
    acc = 0,
    seen = -1,
    frame = 0,
    gameI = Math.floor(Math.random() * GAME_CARDS.length);
  const thumbs = new Map<string, HTMLImageElement | null>();
  let dirty = true;
  const redraw = () => (dirty = true);
  onFonts(redraw);
  const thumb = (key: string) => {
    if (thumbs.has(key)) return thumbs.get(key)!;
    thumbs.set(key, null);
    const im = new Image();
    im.decoding = "async";
    im.onload = () => {
      thumbs.set(key, im);
      redraw();
    };
    im.src = thumbOf(key);
    return null;
  };
  const draw = () => {
    const c = face.g;
    c.fillStyle = "#07060c";
    c.fillRect(0, 0, W, H);
    const u = W / 100;
    if (scene === 0) {
      // the arena's duel, close up: two heroes, their health, whose turn
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = PX(u * 4.6);
      c.fillStyle = GOLD;
      c.fillText(T("ZK LEGENDS · LIVE", "零知传奇 · 直播"), W / 2, u * 5.4);
      const sides = [duel.a, duel.b];
      sides.forEach((s, i) => {
        const px = i ? W - u * 8 - u * 34 : u * 8;
        const py = u * 11;
        const pw = u * 34;
        stepped(c, px, py, pw, pw, u * 1.4);
        c.fillStyle = mix(s.color, "#07060c", 0.75);
        c.fill();
        c.lineWidth = u * 0.9;
        c.strokeStyle = duel.who === i ? s.color : mix(s.color, "#07060c", 0.5);
        c.stroke();
        const art = portrait(s.id, redraw);
        if (art) {
          c.imageSmoothingEnabled = false;
          c.drawImage(art, px + u * 1.4, py + u * 1.4, pw - u * 2.8, pw - u * 2.8);
        }
        c.font = PX(u * 3.2);
        c.fillStyle = "#ffffff";
        c.fillText(s.name.toUpperCase(), px + pw / 2, py + pw + u * 3.6);
        c.font = PX(u * 6.4);
        c.fillStyle = "#ff4d5e";
        c.fillText(`♥ ${s.hp}`, px + pw / 2, py + pw + u * 9.4);
      });
      c.font = PX(u * 8);
      c.fillStyle = "rgba(232,230,224,0.85)";
      c.fillText("VS", W / 2, u * 27);
      c.font = PX(u * 2.6);
      c.fillStyle = LILAC;
      c.fillText(T(`TURN ${duel.turn}`, `第 ${duel.turn} 回合`), W / 2, u * 35);
      c.font = PX(u * 2.4);
      c.fillStyle = "#e8e6e0";
      const words = duel.log;
      c.fillText(words.length > 34 ? `${words.slice(0, 33)}…` : words, W / 2, u * 41);
      if (duel.winner >= 0) {
        c.fillStyle = "rgba(7,6,12,0.75)";
        c.fillRect(0, H * 0.4, W, H * 0.2);
        c.font = PX(u * 7);
        c.fillStyle = (duel.winner ? duel.b : duel.a).color;
        c.fillText(T("VICTORY", "胜利"), W / 2, H * 0.5);
      }
    } else if (scene === 1) {
      // the mini-game of the hour, its picture, its name; a click plays it
      const gm = GAME_CARDS[gameI % GAME_CARDS.length];
      const im = thumb(gm.key);
      if (im) {
        const s = Math.max(W / im.naturalWidth, H / im.naturalHeight);
        c.drawImage(im, (W - im.naturalWidth * s) / 2, (H - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s);
      } else {
        c.fillStyle = mix(gm.color, "#07060c", 0.6);
        c.fillRect(0, 0, W, H);
      }
      c.fillStyle = "rgba(7,6,12,0.82)";
      c.fillRect(0, 0, W, u * 9);
      c.fillRect(0, H - u * 13, W, u * 13);
      c.fillStyle = gm.color;
      c.fillRect(0, u * 9, W, u * 0.5);
      c.fillRect(0, H - u * 13, W, u * 0.5);
      c.textAlign = "left";
      c.textBaseline = "middle";
      c.font = PX(u * 3.2);
      c.fillStyle = FLARE;
      c.fillText(T("ZK PARTY · MINI-GAME OF THE HOUR", "ZK PARTY · 本时段小游戏"), u * 3, u * 4.6);
      c.font = PX(u * 6);
      c.fillStyle = "#ffffff";
      c.fillText(T(gm.title, gm.titleZh), u * 3, H - u * 7.4);
      c.textAlign = "right";
      c.font = PX(u * 2.6);
      c.fillStyle = gm.color;
      c.fillText(T("CLICK TO PLAY ▶", "点击开玩 ▶"), W - u * 3, H - u * 7.4);
    } else if (scene === 2) {
      // the block that shuffles every table
      const h = k.height;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = PX(u * 3.4);
      c.fillStyle = "#a8d8e8";
      c.fillText(T("LATEST ZCASH BLOCK", "最新 ZCASH 区块"), W / 2, u * 9);
      c.font = PX(u * 12);
      c.fillStyle = GOLD;
      c.fillText(h ? `#${h.toLocaleString("en-US")}` : "#…", W / 2, H * 0.47);
      c.font = PX(u * 2.6);
      c.fillStyle = "#e8e6e0";
      c.fillText(T("EVERY SHUFFLE IN THE HOUSE IS SEEDED BY IT", "本店每一次洗牌都由它生成"), W / 2, H * 0.72);
      // a row of blocks marching by
      const t = duelClock();
      for (let i = 0; i < 12; i++) {
        const bx = ((i * u * 10 + t * u * 6) % (W + u * 10)) - u * 10;
        c.fillStyle = i % 3 ? mix(GOLD, "#07060c", 0.6) : GOLD;
        c.fillRect(bx, H * 0.84, u * 7, u * 4);
      }
    } else {
      // the house: what is on which floor
      c.textAlign = "left";
      c.textBaseline = "middle";
      c.font = PX(u * 4.2);
      c.fillStyle = FLARE;
      c.fillText(T("GAME HOUSE · 游戏屋", "游戏屋 · GAME HOUSE"), u * 5, u * 7.5);
      const rows: [string, string, string][] = [
        ["G", T("ZK LEGENDS ARENA · the stage, six duel tables", "零知传奇竞技场 · 舞台与六张对决桌"), GOLD],
        ["G", T("ZK PARTY board · under this screen", "ZK PARTY 棋盘 · 就在屏幕下方"), FLARE],
        ["G", `${tableCard("holdem").title} · ${T("The Orchard Room, west", "果园厅，西侧")}`, "#a8d8e8"],
        ["G", `${tableCard("barons").title} · ${tableCard("glyph").title} · ${T("east", "东侧")}`, "#ff6b35"],
        ["2F", T("ZK PARTY DECK · the mini-games wall, the tournament", "ZK PARTY 平台 · 小游戏墙、锦标赛"), LILAC],
        ["2F", T("HALO LOUNGE · the stands over the arena", "光环休息室 · 竞技场看台"), "#6dbf8a"],
      ];
      rows.forEach(([f, text, col], i) => {
        const y = u * 15.5 + i * u * 6.4;
        c.fillStyle = col;
        stepped(c, u * 5, y - u * 2.2, u * 7, u * 4.4, u * 0.6);
        c.fill();
        c.fillStyle = "#07060c";
        c.font = PX(u * 2.8);
        c.textAlign = "center";
        c.fillText(f, u * 8.5, y + u * 0.1);
        c.textAlign = "left";
        c.fillStyle = "#e8e6e0";
        c.font = PX(u * 2.6);
        c.fillText(text, u * 14, y + u * 0.1);
      });
    }
    // the scene dots
    for (let i = 0; i < SCENES; i++) {
      c.fillStyle = i === scene ? GOLD : "rgba(244,183,40,0.25)";
      c.fillRect(W / 2 + (i - SCENES / 2) * u * 2.2, H - u * 2.4, u * 1.4, u * 0.8);
    }
    led(c, W, H, 4);
    face.t.needsUpdate = true;
  };
  k.ticks.push((dt) => {
    stepDuel(dt, ++frame);
    sceneT += dt;
    acc += dt;
    if (sceneT > SCENE_S) {
      sceneT = 0;
      scene = (scene + 1) % SCENES;
      if (scene === 1) gameI++;
      dirty = true;
    }
    const busy = scene === 2 || (scene === 0 && !!duel.hit && duelClock() - duel.hit.at < 1);
    if (dirty || (scene === 0 && duel.t !== seen) || (busy && acc > 0.12) || acc > 1) {
      seen = duel.t;
      dirty = false;
      acc = 0;
      draw();
    }
  });
  const hover = () => (scene === 1 ? `<b>${T(GAME_CARDS[gameI % GAME_CARDS.length].title, GAME_CARDS[gameI % GAME_CARDS.length].titleZh)}</b><span>${T("ZK PARTY · click to play", "ZK PARTY · 点击开玩")}</span>` : scene === 0 ? `<b>ZK LEGENDS</b><span>${T("live duel · click to play", "对决直播 · 点击开玩")}</span>` : `<b>${T("The jumbotron", "大屏幕")}</b><span>${T("what's on in the house", "本店正在上演")}</span>`);
  const info = (): PickInfo | null => {
    if (scene === 1) {
      const gm = GAME_CARDS[gameI % GAME_CARDS.length];
      return { eyebrow: "ZK PARTY", title: T(gm.title, gm.titleZh), party: "practice", partyGame: gm.key };
    }
    if (scene === 0) return { eyebrow: T("ZK LEGENDS Arena", "零知传奇竞技场"), title: tableCard("legends").title, table: "legends" };
    return { eyebrow: T("Game House", "游戏屋"), title: T("The jumbotron", "大屏幕"), body: `<p>${T("Mini-games upstairs on the ZK PARTY DECK (west stairs), the HALO LOUNGE's stands upstairs (east stairs), the tables and the ZK LEGENDS arena down here.", "楼上西侧是 ZK PARTY 平台（小游戏墙），东侧是光环休息室看台；牌桌和零知传奇竞技场在楼下。")}</p>` };
  };
  for (const f of faces) k.pick(f, hover, () => info());
  k.ticks.push((dt) => (rib.t.offset.x = (rib.t.offset.x + dt * 0.04) % 1));
  draw();
  return g;
}
