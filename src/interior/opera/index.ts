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
import { buildOrchestra, playMelody } from "./orchestra";

/**
 * SYDNEY OPERA HOUSE. The foyer under the great shell, its pleated glass wall over the bay, the
 * bars; and the Concert Hall, where the Block Symphony plays the chain live: every new block is a
 * crescendo (one rising note per transaction, coloured by kind; the timpani roll, the rings and
 * the stage flare), then the hall applauds. Click the conductor for the block as a little melody.
 */

const SHIELDED = new Set<TxKind>(["shielded", "migration", "shielding"]);
const CHEERS = ["Bravo!", "Encore!", "Bravo!", "Encore! Encore!", "Bravissimo!", "Magnificent!", "Brava!", "What a block!", "Bravo, maestro!", "Encore!"];
const HUSH = ["Shh…", "Beautiful.", "Listen to the cellos.", "Here it comes…", "Exquisite."];

export function buildOpera(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0c0908");
  const hemi = scene.children.find((o) => o instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
  const foyer = new Level(FOYER_Y);
  const hall = new Level(HALL_Y);
  const levels = [foyer, hall];
  scene.add(foyer.group, hall.group);

  // ---- the chain: the block being played and the evening's program ---------------------------------
  let block: Block | null = null;
  const fetched = new Map<number, Block>();
  const played: { height: number; n: number; pool: string | null }[] = [];
  const counts = (b: Block) => {
    const s = b.txs.filter((t) => SHIELDED.has(t.kind)).length;
    return { n: b.txs.length, s, t: b.txs.length - s };
  };
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
  const drawProgram = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.fillStyle = "#f4efe4";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c9a24a";
    g.lineWidth = 6;
    g.strokeRect(24, 24, w - 48, h - 48);
    g.fillStyle = "#1a1418";
    g.textAlign = "center";
    g.font = '600 30px "JetBrains Mono", monospace';
    g.fillText("SYDNEY OPERA HOUSE · CONCERT HALL", w / 2, 100);
    g.font = '800 64px "JetBrains Mono", monospace';
    g.fillStyle = "#8a1e3c";
    g.fillText("BLOCK", w / 2, 200);
    g.fillText("SYMPHONY", w / 2, 270);
    g.fillStyle = "#1a1418";
    g.font = '500 28px "JetBrains Mono", monospace';
    g.fillText(block ? `No. ${fmt(block.height)}` : "No. —", w / 2, 320);
    g.fillRect(w / 2 - 120, 350, 240, 3);
    g.textAlign = "left";
    g.font = '600 30px "JetBrains Mono", monospace';
    const list = played.slice(-6).reverse();
    list.forEach((p, i) => {
      const y = 420 + i * 70;
      g.fillStyle = "#8a1e3c";
      g.fillText(ROMAN[i], 70, y);
      g.fillStyle = "#1a1418";
      g.fillText(`#${fmt(p.height)}`, 170, y);
      g.fillStyle = "#6a6058";
      g.font = '500 24px "JetBrains Mono", monospace';
      g.fillText(`${p.n} notes${p.pool ? " · " + p.pool.slice(0, 16) : ""}`, 170, y + 30);
      g.font = '600 30px "JetBrains Mono", monospace';
    });
    g.textAlign = "center";
    g.fillStyle = "#1a1418";
    g.font = '600 26px "JetBrains Mono", monospace';
    g.fillText("Conductor · zkSNARK #1", w / 2, h - 130);
    g.fillText("Orchestra · 24 zkSNARKs", w / 2, h - 90);
  };
  const blockInfo = (eyebrow: string): PickInfo => {
    if (!block) return { eyebrow, title: "Block Symphony" };
    const c = counts(block);
    return {
      eyebrow,
      title: `Block #${fmt(block.height)}`,
      mono: true,
      tag: [`${c.n} notes`, "info"],
      stats: [
        ["Shielded", String(c.s)],
        ["Transparent", String(c.t)],
        ["Pool", block.pool ?? "—"],
      ],
      link: { href: links.block(block.height), label: "Block on ZScan" },
    };
  };
  const foyerParts = buildFoyer(foyer, { draw: drawProgram, info: () => blockInfo("TONIGHT · BLOCK SYMPHONY") });

  // ---- the Concert Hall --------------------------------------------------------------------------------
  const H = buildHall(hall);
  const audience = buildAudience(hall.group, H.seats, 1973, 0.9);
  let energy = 0.35;
  let bump = 0;
  const orchestra = buildOrchestra(hall, () => {
    playMelody(block ? block.txs.map((t) => t.txid) : []);
    bump = 1;
    orchestra.conductor?.say("Maestoso!", 2.5);
    return { ...blockInfo("CONDUCTOR · zkSNARK #1"), image: ZScan.zkSnarkImage(1) };
  });
  const drawBoard = () => {
    const g = H.board.g;
    const w = H.board.c.width,
      h = H.board.c.height;
    g.fillStyle = "#07060a";
    g.fillRect(0, 0, w, h);
    g.font = '700 54px "JetBrains Mono", monospace';
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.fillStyle = "#f4b728";
    g.fillText(block ? `#${fmt(block.height)}` : "BLOCK SYMPHONY", 30, h / 2);
    if (block) {
      const c = counts(block);
      g.textAlign = "right";
      g.fillStyle = "#3ee08f";
      g.fillText(`${c.s}`, w - 360, h / 2);
      g.fillStyle = "#ff9a3c";
      g.fillText(`${c.t}`, w - 230, h / 2);
      g.fillStyle = "#f4efe4";
      g.fillText(`♪ ${c.n}`, w - 30, h / 2);
      g.font = '500 26px "JetBrains Mono", monospace';
      g.fillStyle = "#8a8090";
      g.textAlign = "left";
      g.fillText((block.pool ?? "").slice(0, 18), 420, h / 2);
    }
    H.board.t.needsUpdate = true;
  };
  foyer.m.flush(foyer.group);
  hall.m.flush(hall.group);
  hall.pick(H.screen, "<b>Block Symphony</b><span>the block being played</span>", () => blockInfo("CONCERT HALL · SURTITLES"));

  const setBlock = (b: Block, live: boolean) => {
    block = b;
    fetched.set(b.height, b);
    if (!played.some((p) => p.height === b.height)) played.push({ height: b.height, n: b.txs.length, pool: b.pool });
    played.sort((a, c) => a.height - c.height);
    drawBoard();
    foyerParts.program.redraw();
    if (live) perform(b);
  };
  // ---- the performance: crescendo, cut-off, applause -------------------------------------------------------
  type Phase = "idle" | "cresc" | "climax" | "applause";
  let phase: Phase = "idle";
  let phaseT = 0;
  let queue: TxKind[] = [];
  let emitEvery = 0.1;
  let emitAcc = 0;
  let idleAcc = 0;
  let hushAcc = 4;
  const perform = (b: Block) => {
    phase = "cresc";
    phaseT = 0;
    queue = b.txs.map((t) => t.kind).slice(0, 300);
    if (!queue.length) queue = ["coinbase"];
    emitEvery = 8.5 / queue.length;
    emitAcc = 0;
    orchestra.conductor?.say("Tutti!", 2);
  };
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

  const h0 = ctx.director.blockHeight;
  if (h0)
    void ZScan.block(h0)
      .then((b) => {
        if (!b) return;
        setBlock(b, false);
        // the evening so far: the blocks before it
        for (let k = 1; k <= 8; k++)
          void ZScan.block(h0 - k)
            .then((p) => p && (fetched.set(p.height, p), played.push({ height: p.height, n: p.txs.length, pool: p.pool }), played.sort((a, c) => a.height - c.height), foyerParts.program.redraw()))
            .catch(() => {});
      })
      .catch(() => {});
  drawBoard();
  ctx.onBlock(
    (h) =>
      void ZScan.block(h)
        .then((b) => b && setBlock(b, true))
        .catch(() => {}),
  );

  // ---- floors, backgrounds, theme ------------------------------------------------------------------------
  let floor = 0;
  let enteredAt = -1;
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
    enteredAt = n === 1 ? 0 : -1;
    bg();
  };
  setFloor(0);

  const look = new THREE.Vector3(0, 0, -1);
  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  let clock = 0;
  if (import.meta.env.DEV)
    (window as unknown as Record<string, unknown>).__opera = {
      perform: (n = 30) => {
        const kinds: TxKind[] = ["shielded", "transparent", "shielding", "coinbase"];
        const b: Block = { height: (block?.height ?? 3_000_000) + 1, time: Date.now(), size: 0, fees: 0, pool: "ViaBTC", txs: Array.from({ length: n }, (_, i) => ({ txid: (i * 2654435761).toString(16).padStart(8, "0"), kind: kinds[i % 4], fee: 0, size: 0, actions: 1, transparentOut: 0, seenAt: 0 })) as Block["txs"] };
        setBlock(b, true);
      },
      jump: (p: Phase, t = 0) => ((phase = p), (phaseT = t)),
    };

  return {
    key: "opera",
    title: "OPERA HOUSE",
    scene,
    floors: [
      { label: "F", name: "Foyer · bars, the bay", y: FOYER_Y, spawn: new THREE.Vector3(0, FOYER_Y, 14.3), yaw: 0 },
      { label: "H", name: "Concert Hall · Block Symphony, live", y: HY, spawn: new THREE.Vector3(0, HY, 12.2), yaw: 0 },
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
      clock += dt;
      const L = levels[floor];
      L.eye.copy(camera.position);
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      look.set(0, 0, -1).applyQuaternion(camQuat).setY(0).normalize();
      for (const s of L.people) s.update(dt, t, camQuat, camRight);
      for (const tick of L.ticks) tick(dt, t);
      if (floor !== 1) return;
      // a first visit to the hall: they play the latest block for you
      if (enteredAt >= 0) {
        enteredAt += dt;
        if (enteredAt > 2.5) {
          enteredAt = -1;
          // the latest block with transactions in it (an empty one is a single note)
          const best = [...fetched.values()].sort((a, c) => c.height - a.height).find((b) => b.txs.length) ?? block;
          if (phase === "idle" && best) {
            if (best !== block) ((block = best), drawBoard());
            perform(best);
          }
        }
      }
      // ---- the music's shape
      phaseT += dt;
      let target = 0.32 + 0.05 * Math.sin(clock * 0.4);
      let clap = 0,
        stand = 0;
      if (phase === "cresc") {
        target = 0.35 + 0.65 * Math.min(1, phaseT / 7);
        if (phaseT > 7) (phase = "climax"), (phaseT = 0);
      } else if (phase === "climax") {
        target = 1;
        if (phaseT > 2.6) {
          phase = "applause";
          phaseT = 0;
          energy = 0.05;
          orchestra.conductor?.say("Bravi!", 2.4);
        }
      } else if (phase === "applause") {
        target = 0.04;
        clap = Math.min(1, phaseT * 3) * Math.min(1, (8 - phaseT) / 2);
        stand = Math.min(1, phaseT / 1.5) * Math.min(1, Math.max(0, (6.5 - phaseT) / 1.5));
        if (Math.random() < dt * 2.6 && phaseT < 6) bubble(CHEERS[Math.floor(Math.random() * CHEERS.length)], "shout");
        if (phaseT > 8) (phase = "idle"), (phaseT = 0);
      } else {
        hushAcc -= dt;
        if (hushAcc < 0) {
          hushAcc = 8 + Math.random() * 8;
          bubble(HUSH[Math.floor(Math.random() * HUSH.length)], "talk");
        }
      }
      if (bump > 0) {
        bump = Math.max(0, bump - dt * 0.25);
        target = Math.max(target, 0.4 + 0.5 * bump);
      }
      energy += (target - energy) * Math.min(1, dt * (phase === "applause" ? 6 : 1.5));
      // ---- notes: the block's transactions during the piece, the mempool otherwise
      if (phase === "cresc" || phase === "climax") {
        emitAcc += dt;
        while (emitAcc > emitEvery && queue.length) {
          emitAcc -= emitEvery;
          orchestra.emit(queue.shift()!);
        }
      } else if (phase === "idle") {
        idleAcc += dt;
        if (idleAcc > 0.9) {
          idleAcc = 0;
          const mp = ctx.director.mempoolList();
          orchestra.emit(mp.length ? mp[Math.floor(Math.random() * mp.length)].kind : "shielded");
        }
      }
      orchestra.tick(dt, t, energy, camera);
      audience.tick(dt);
      audience.uniforms.uClap.value = clap;
      audience.uniforms.uStand.value = stand;
      audience.uniforms.uLight.value = 0.72 + 0.2 * energy + 0.15 * clap;
      H.stage.intensity = 500 + 1300 * energy;
      H.stage2.intensity = 150 + 500 * energy;
      for (const l of H.house) l.intensity = phase === "applause" ? 90 : 40 + 20 * (1 - energy);
      H.ringMat.emissive.setRGB(0.5 * energy, 0.36 * energy, 0.08 * energy);
    },
  };
}
