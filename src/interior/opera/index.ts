import * as THREE from "three";
import type { Block, TxKind } from "../../data/types";
import { ZScan, links } from "../../data/zscan";
import { sayAt } from "../../scene/speech";
import { makeScene } from "../kit";
import type { Interior, InteriorContext, PickInfo } from "../types";
import { buildAudience } from "./crowd";
import { buildFoyer } from "./foyer";
import { buildHall, hallGround, Y as HY } from "./hall";
import { FOYER_Y, HALL_Y, Level, fmt } from "./kit";
import { buildOrchestra } from "./orchestra";
import { PROGRAMME, type Piece, pieceFor } from "./programme";
import { buildStage } from "./stage";

/**
 * SYDNEY OPERA HOUSE. The foyer under the great shell, its pleated glass wall over the bay, the
 * bars; and the Concert Hall, where every performance lasts one block. A real recording plays from
 * the stage (Vivaldi, Mozart, Beethoven, Tchaikovsky's swans, Verdi, Puccini…, ./programme.ts):
 * the orchestra plays along, a soloist, the singers or the corps de ballet in front of it. When the
 * next block lands the piece ends, the hall rises and applauds (a real ovation), the performers
 * bow, the curtain falls; it opens on the next piece, picked by the new block's height. The
 * block's transactions rise from the desks as notes, coloured by kind. In the foyer the music
 * comes through the doors.
 */

const SHIELDED = new Set<TxKind>(["shielded", "migration", "shielding"]);
const CHEERS = ["Bravo!", "Encore!", "Bravo!", "Encore! Encore!", "Bravissimo!", "Magnificent!", "Brava!", "What a block!", "Bravo, maestro!", "Encore!"];
const HUSH = ["Shh…", "Beautiful.", "Listen to the cellos.", "Here it comes…", "Exquisite.", "One piece per block.", "Who's next on the programme?"];

export function buildOpera(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0c0908");
  const hemi = scene.children.find((o) => o instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
  const foyer = new Level(FOYER_Y);
  const hall = new Level(HALL_Y);
  const levels = [foyer, hall];
  scene.add(foyer.group, hall.group);

  // ---- the chain: the block being played, the piece it gets -----------------------------------------
  let block: Block | null = null;
  /** The height whose piece is on stage now. */
  let height = ctx.director.blockHeight || 0;
  let piece: Piece = pieceFor(height);
  const counts = (b: Block) => {
    const s = b.txs.filter((t) => SHIELDED.has(t.kind)).length;
    return { n: b.txs.length, s, t: b.txs.length - s };
  };
  const drawProgram = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.fillStyle = "#f4efe4";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c9a24a";
    g.lineWidth = 6;
    g.strokeRect(24, 24, w - 48, h - 48);
    g.fillStyle = "#1a1418";
    g.textAlign = "center";
    g.font = '600 28px "JetBrains Mono", monospace';
    g.fillText("SYDNEY OPERA HOUSE · CONCERT HALL", w / 2, 86);
    g.font = '800 54px "JetBrains Mono", monospace';
    g.fillStyle = "#8a1e3c";
    g.fillText("TONIGHT", w / 2, 160);
    g.fillStyle = "#6a6058";
    g.font = '500 24px "JetBrains Mono", monospace';
    g.fillText("one piece per block · the hall applauds each one", w / 2, 198);
    // now playing
    g.fillStyle = "#1a1418";
    g.fillRect(60, 226, w - 120, 270);
    g.fillStyle = "#f4b728";
    g.font = '600 24px "JetBrains Mono", monospace';
    g.fillText(height ? `NOW PLAYING · BLOCK #${fmt(height)}` : "NOW PLAYING", w / 2, 268);
    g.fillStyle = "#f4efe4";
    g.font = '800 50px "JetBrains Mono", monospace';
    g.fillText(piece.composer.toUpperCase(), w / 2, 330);
    g.font = '600 30px "JetBrains Mono", monospace';
    fitText(g, piece.title, w / 2, 378, w - 150);
    g.fillStyle = "#e8c8a0";
    g.font = '500 26px "JetBrains Mono", monospace';
    fitText(g, piece.part, w / 2, 420, w - 150);
    g.fillStyle = "#a89c90";
    g.font = '500 22px "JetBrains Mono", monospace';
    fitText(g, piece.by, w / 2, 462, w - 150);
    // the next blocks
    g.fillStyle = "#8a1e3c";
    g.font = '700 26px "JetBrains Mono", monospace';
    g.fillText("NEXT BLOCKS", w / 2, 552);
    g.textAlign = "left";
    for (let i = 1; i <= 5; i++) {
      const p = pieceFor(height + i);
      const y = 552 + i * 62;
      g.fillStyle = "#8a1e3c";
      g.font = '600 24px "JetBrains Mono", monospace';
      g.fillText(height ? `#${fmt(height + i)}` : `+${i}`, 64, y);
      g.fillStyle = "#1a1418";
      g.font = '700 26px "JetBrains Mono", monospace';
      g.fillText(p.composer, 290, y);
      g.fillStyle = "#6a6058";
      g.font = '500 20px "JetBrains Mono", monospace';
      fitText(g, `${p.title} · ${p.part}`, 290, y + 26, w - 290 - 60, "left");
    }
    g.textAlign = "center";
    g.fillStyle = "#1a1418";
    g.font = '600 22px "JetBrains Mono", monospace';
    g.fillText(`Conductor · zkSNARK #1 · Orchestra · 24 zkSNARKs`, w / 2, h - 70);
    g.fillStyle = "#8a8078";
    g.font = '500 18px "JetBrains Mono", monospace';
    g.fillText("public-domain recordings · Musopen & Wikimedia Commons", w / 2, h - 42);
  };
  const pieceInfo = (eyebrow: string): PickInfo => {
    const info: PickInfo = {
      eyebrow,
      title: `${piece.composer} · ${piece.title}`,
      tag: [piece.part, "info"],
      stats: [
        ["Block", height ? `#${fmt(height)}` : "—"],
        ["On stage", piece.by],
        ["Next block", `${pieceFor(height + 1).composer}`],
      ],
    };
    if (block && block.height === height) {
      const c = counts(block);
      info.stats!.push(["Notes", `${c.n} tx · ${c.s} shielded`]);
      info.link = { href: links.block(block.height), label: "Block on ZScan" };
    }
    return info;
  };
  const foyerParts = buildFoyer(foyer, { draw: drawProgram, info: () => pieceInfo("TONIGHT · ONE PIECE PER BLOCK") });

  // ---- the Concert Hall --------------------------------------------------------------------------------
  const H = buildHall(hall);
  const audience = buildAudience(hall.group, H.seats, 1973, 0.9);
  const orchestra = buildOrchestra(hall, () => {
    orchestra.conductor?.say(phase === "playing" ? `${piece.composer}, block ${fmt(height)}!` : `Next: ${pieceFor(height + 1).composer}!`, 2.5);
    return { ...pieceInfo("CONDUCTOR · zkSNARK #1"), image: ZScan.zkSnarkImage(1) };
  });
  const stage = buildStage(hall, 0, 1);
  const drawBoard = () => {
    const g = H.board.g;
    const w = H.board.c.width,
      h = H.board.c.height;
    g.fillStyle = "#07060a";
    g.fillRect(0, 0, w, h);
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.fillStyle = "#f4b728";
    g.font = '700 44px "JetBrains Mono", monospace';
    g.fillText(`♪ ${piece.composer.toUpperCase()}`, 26, h * 0.32);
    g.fillStyle = "#f4efe4";
    g.font = '500 30px "JetBrains Mono", monospace';
    fitText(g, `${piece.title} · ${piece.part}`, 26, h * 0.74, w - 330, "left");
    g.textAlign = "right";
    g.fillStyle = "#3ee08f";
    g.font = '700 40px "JetBrains Mono", monospace';
    g.fillText(height ? `#${fmt(height)}` : "LIVE", w - 26, h * 0.32);
    g.fillStyle = "#8a8090";
    g.font = '500 24px "JetBrains Mono", monospace';
    g.fillText(block && block.height === height ? `${counts(block).n} tx · ${block.pool ?? ""}`.slice(0, 22) : "this block's piece", w - 26, h * 0.74);
    H.board.t.needsUpdate = true;
  };
  const redraw = () => {
    drawBoard();
    foyerParts.program.redraw();
  };
  foyer.m.flush(foyer.group);
  hall.m.flush(hall.group);
  hall.pick(H.screen, "<b>Surtitles</b><span>the piece being played</span>", () => pieceInfo("CONCERT HALL · SURTITLES"));

  // ---- the performance: a piece per block; applause, bows and the curtain between -------------------
  type Phase = "playing" | "finale" | "applause" | "curtain";
  let phase: Phase = "playing";
  let phaseT = 0;
  /** The block that will choose the next piece (arrived during a piece or between two). */
  let pending: number | null = null;
  let queue: TxKind[] = [];
  let emitEvery = 0.3;
  let emitAcc = 0;
  let idleAcc = 0;
  let hushAcc = 6;
  let lastUpdate = -1e9;
  let swapped = false;
  let cheered = false;
  let fading = false;
  const sound = (name: string, arg?: unknown) => window.dispatchEvent(new CustomEvent("zstreet:sound", { detail: { name, arg } }));
  const begin = (h: number) => {
    height = h || height;
    piece = pieceFor(height);
    stage.setStaging(piece.staging);
    stage.source.play(piece.track);
    stage.setPlaying(true);
    stage.setCurtain(0);
    phase = "playing";
    phaseT = 0;
    // the block's transactions rise as notes through the piece
    queue = block && block.height === height ? block.txs.map((t) => t.kind).slice(0, 300) : [];
    emitEvery = queue.length ? Math.min(1.2, 60 / queue.length) : 0.3;
    redraw();
  };
  const newBlock = (h: number) => {
    if (h <= height && phase === "playing") return;
    pending = h;
    // nobody in the hall: the next piece simply starts (no one to applaud)
    if (performance.now() - lastUpdate > 1500) {
      pending = null;
      begin(h);
      return;
    }
  };
  const fetchBlock = (h: number) =>
    void ZScan.block(h)
      .then((b) => {
        if (!b) return;
        if (!block || b.height >= block.height) block = b;
        if (b.height === height) {
          if (phase === "playing" && !queue.length) {
            queue = b.txs.map((t) => t.kind).slice(0, 300);
            emitEvery = queue.length ? Math.min(1.2, 60 / queue.length) : 0.3;
          }
          redraw();
        }
      })
      .catch(() => {});
  if (height) fetchBlock(height);
  begin(height);
  ctx.onBlock((h) => {
    newBlock(h);
    fetchBlock(h);
  });

  const bubble = (text: string, tone: "talk" | "shout") => {
    const seats = audience.seats;
    if (!seats.length) return;
    // someone you can see: in front of the walker, not too far
    let s = seats[0];
    for (let k = 0; k < 30; k++) {
      s = seats[Math.floor(Math.random() * seats.length)];
      const dx = s.x - hall.eye.x,
        dz = s.z - hall.eye.z;
      const d = Math.hypot(dx, dz);
      if (d > 3 && d < 22 && (dx * look.x + dz * look.z) / d > 0.55) break;
    }
    const anchor = new THREE.Group();
    anchor.position.set(s.x, s.y + 1.1, s.z);
    hall.group.add(anchor);
    sayAt(anchor, text, tone, 0, 3.2, 0.7);
    setTimeout(() => hall.group.remove(anchor), 3600);
  };

  // ---- floors, backgrounds, theme ------------------------------------------------------------------------
  let floor = 0;
  const bg = () => {
    if (floor === 1) {
      scene.background = new THREE.Color("#0c0908");
      return;
    }
    const v = ctx.cityView("opera", 6, -28);
    scene.background = v ?? new THREE.Color(ctx.theme === "night" ? "#0b0a1a" : "#9ec8f0");
  };
  const setFloor = (n: number) => {
    floor = n;
    levels.forEach((l, i) => (l.group.visible = i === n));
    hemi.intensity = n === 1 ? 0.35 : 0.8;
    scene.environmentIntensity = n === 1 ? 0.15 : 0.35;
    bg();
  };
  setFloor(0);

  const look = new THREE.Vector3(0, 0, -1);
  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const toAudience = new THREE.Vector3(0, 0, 1),
    toOrchestra = new THREE.Vector3(0, 0, -1);
  if (import.meta.env.DEV || location.search.includes("debug"))
    (window as unknown as Record<string, unknown>).__opera = {
      /** A new block now (the next height). */
      next: () => newBlock(height + 1),
      get state() {
        return { phase, phaseT, height, piece: `${piece.composer} · ${piece.title}`, staging: stage.staging, curtain: stage.curtain, track: stage.source.track, meter: stage.source.meter };
      },
      /** Jump to the piece of the programme at index i. */
      play: (i: number) => {
        const h = height - (((height % PROGRAMME.length) + PROGRAMME.length) % PROGRAMME.length) + i;
        begin(h);
      },
    };

  return {
    key: "opera",
    title: "OPERA HOUSE",
    scene,
    floors: [
      { label: "F", name: "Foyer · bars, the bay", y: FOYER_Y, spawn: new THREE.Vector3(0, FOYER_Y, 14.3), yaw: 0 },
      { label: "H", name: "Concert Hall · a piece per block, live", y: HY, spawn: new THREE.Vector3(0, HY, 12.2), yaw: 0 },
    ],
    colliders: (f) => levels[f].rects,
    groundAt: (f, x, z) => (f === 1 ? hallGround(x, z) : null),
    setFloor,
    setTheme: () => bg(),
    pickables: () => {
      const L = levels[floor];
      const list = [...L.picks.keys()];
      if (floor === 1) list.push(audience.mesh);
      return list;
    },
    pick(hit) {
      if (hit.object === audience.mesh && hit.instanceId !== undefined) {
        const id = audience.ids[hit.instanceId];
        return { eyebrow: "CONCERT HALL · AUDIENCE", title: `zkSNARK #${id}`, mono: true, image: ZScan.zkSnarkImage(id) };
      }
      return levels[floor].find(hit.object)?.info() ?? null;
    },
    hover(hit) {
      if (hit.object === audience.mesh && hit.instanceId !== undefined) return `<b>zkSNARK #${audience.ids[hit.instanceId]}</b><span>in the audience</span>`;
      return levels[floor].find(hit.object)?.hover ?? null;
    },
    update(dt, t, camera) {
      lastUpdate = performance.now();
      const L = levels[floor];
      L.eye.copy(camera.position);
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      look.set(0, 0, -1).applyQuaternion(camQuat).setY(0).normalize();
      for (const s of L.people) s.update(dt, t, camQuat, camRight);
      for (const tick of L.ticks) tick(dt, t);

      // ---- the evening's shape (runs on both floors: the foyer hears it through the doors)
      phaseT += dt;
      let clap = 0,
        stand = 0,
        bow = 0;
      if (phase === "playing" && pending !== null && phaseT > 8) {
        // a new block: this piece ends (a piece plays at least a few bars)
        phase = "finale";
        phaseT = 0;
        fading = false;
      }
      if (phase === "finale") {
        // the last bars: the recording fades, the conductor's arms come down
        if (!fading) {
          fading = true;
          stage.source.play(null);
          orchestra.conductor?.say("Bravi!", 2.4);
        }
        if (phaseT > 1.8) {
          phase = "applause";
          phaseT = 0;
          cheered = false;
          sound("applause");
          stage.setPlaying(false);
        }
      } else if (phase === "applause") {
        clap = Math.min(1, phaseT * 3) * Math.min(1, (7.5 - phaseT) / 1.5);
        stand = Math.min(1, phaseT / 1.2) * Math.min(1, Math.max(0, (7 - phaseT) / 1.5));
        bow = Math.max(0, Math.sin(Math.min(1, Math.max(0, (phaseT - 1) / 2.4)) * Math.PI));
        if (floor === 1 && Math.random() < dt * 2.6 && phaseT < 6) bubble(CHEERS[Math.floor(Math.random() * CHEERS.length)], "shout");
        if (!cheered && phaseT > 1) {
          cheered = true;
          for (const s of stage.band.players) if (s.snark && s.frame.visible) s.snark.emote(Math.random() < 0.5 ? "heart" : "star", 3);
        }
        if (phaseT > 7.5) {
          phase = "curtain";
          phaseT = 0;
          swapped = false;
          stage.setCurtain(1);
          sound("interval", 4.5);
        }
      } else if (phase === "curtain") {
        // behind the curtain the stage is set for the next piece
        if (!swapped && phaseT > 2.4) {
          swapped = true;
          const h = pending ?? height + 1;
          pending = null;
          height = h;
          piece = pieceFor(h);
          stage.setStaging(piece.staging);
          redraw();
        }
        if (phaseT > 3.4) stage.setCurtain(0);
        if (phaseT > 4.8) {
          begin(height);
          orchestra.conductor?.say(`${piece.composer}!`, 2.2);
        }
      } else {
        hushAcc -= dt;
        if (hushAcc < 0) {
          hushAcc = 9 + Math.random() * 9;
          if (floor === 1) bubble(HUSH[Math.floor(Math.random() * HUSH.length)], "talk");
        }
      }
      if (floor !== 1) return;
      // ---- the music's loudness moves the orchestra (measured from the recording when heard)
      const playing = phase === "playing";
      const e = playing ? stage.band.loudness : phase === "finale" ? Math.max(0, stage.band.loudness * (1 - phaseT / 1.8)) : 0.04;
      // ---- notes: the block's transactions during the piece, the mempool otherwise
      if (playing) {
        emitAcc += dt;
        while (emitAcc > emitEvery) {
          emitAcc -= emitEvery;
          if (queue.length) orchestra.emit(queue.shift()!);
          else if ((idleAcc += emitEvery) > 0.9) {
            idleAcc = 0;
            const mp = ctx.director.mempoolList();
            orchestra.emit(mp.length ? mp[Math.floor(Math.random() * mp.length)].kind : "shielded");
          }
        }
      }
      orchestra.tick(dt, t, e, camera);
      // the conductor turns to the hall to take the bow
      const c = orchestra.conductor;
      if (c) {
        c.faceDir = phase === "applause" && phaseT > 0.6 ? toAudience : toOrchestra;
        c.root.position.y -= bow * 0.22;
      }
      stage.setBow(bow);
      audience.tick(dt);
      audience.uniforms.uClap.value = clap;
      audience.uniforms.uStand.value = stand;
      audience.uniforms.uLight.value = 0.72 + 0.2 * e + 0.15 * clap;
      // lights: the stage glows with the music, flares for the bows; the house comes up between pieces
      const cur = stage.curtain;
      H.stage.intensity = (500 + 1300 * e + (phase === "applause" ? 900 : 0)) * (1 - 0.7 * cur);
      H.stage2.intensity = (150 + 500 * e) * (1 - 0.8 * cur);
      for (const l of H.house) l.intensity = phase === "applause" || phase === "curtain" ? 95 : 35 + 20 * (1 - e);
      H.ringMat.emissive.setRGB(0.5 * e, 0.36 * e, 0.08 * e);
    },
  };
}

/** Text squeezed to fit `max` pixels. */
function fitText(g: CanvasRenderingContext2D, s: string, x: number, y: number, max: number, align: CanvasTextAlign = "center") {
  g.textAlign = align;
  const w = g.measureText(s).width;
  if (w <= max) g.fillText(s, x, y);
  else g.fillText(s, x, y, max);
}
