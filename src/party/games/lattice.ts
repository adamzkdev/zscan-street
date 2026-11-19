/**
 * HALO FALL (光环坠落): EXPOSURE survival. Three floors of glowing hex tiles float one over
 * another high above ZStreet, a long drop between them. A tile you stand on cracks (it flashes hot,
 * shakes, crackles) and drops a moment later: keep moving. Fall through a hole and you land on the
 * floor below; fall off the bottom floor and you're out. Last one standing wins.
 *
 * The EXPOSURE twist: some tiles are transparent addresses, stamped t-addr or P2PKH in a dull broken
 * style; they break the moment you step on them. ORCHARD tiles (shielded, Halo 2 proofs) are tougher:
 * they take longer to crack, and the TRACKER BEAM can't break them. From EXPOSURE (9 s) on, the
 * TRACKER BEAM (the chain-analysis bot that links transparent coins) sweeps a line across a floor
 * (a warning stripe and two charging probes first) and breaks every tile in it but the ORCHARD ones.
 *
 * Arrows run (screen-relative), A jumps (over a hole, over a transparent tile), B shoves: a short wind-up
 * with an arrow on the floor, a lunge; whoever it meets slides about a tile, flailing, and can't be
 * shoved again for a moment. A hop dodges it.
 *
 * Escalation: the cracks quicken, the beams come more often (two at once from 36 s), the top floor
 * collapses on its own at 20 s, the middle at 38 s. At the 60 s cap the ones still up rank by their
 * floor, then by the fresh tiles round them; later out ranks higher.
 *
 * The AIs (by skill) read the tiles round them: a pro looks further, prefers tiles with room round
 * them and away from the rim, waits on its tile until the last moment, jumps gaps, hops onto ORCHARD
 * when a beam comes, steers its fall onto fresh tiles and shoves a rival standing by a hole; a weak
 * one runs about wasting tiles, misreads a transparent tile now and then, notices a beam late, jumps late,
 * panics.
 *
 * Three levels (lattice-levels/levels.ts, their scenery in lattice-levels/scenery.ts): NU7 TOWER
 * (today's: three hex floors over ZStreet at dusk), FROZEN LAKE (three long rinks over Central Park's
 * frozen lake at night: the ice slides you, the white ORCHARD tiles grip; on the ice a pro AI brakes early and
 * counter-steers, a weak one overshoots) and SPIN STATION (three propeller decks in orbit, each
 * spinning, faster as it goes: the spin carries you round and pulls you out to the rim and along the
 * arms; a pro AI keeps to the hub).
 */
import * as THREE from "three";
import { T } from "../../i18n/lang";
import { FONT, HUD, between, clamp, ease, lerp, ord, rr, sfx, sound, text, type Input, type IntroShot, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { actWord } from "../acts";
import { touchy } from "../hud";
import { music } from "../music";
import { Avatar, CamRig, Fx3, GEO, banner, canvasTex, clock, clockK, cornerSpot, corners, disposeScene, glow, label, short, tag, toScreen, toon, toonSteps, world, yawOf, type World } from "../k3";
import { LEVELS, type Level } from "./lattice-levels/levels";
import { astanaScenery, orbitScenery, towerScenery, type Deco } from "./lattice-levels/scenery";

// ---- the rules -----------------------------------------------------------------------------------

/** The time cap (s). */
const LIMIT = 60;
/** A hex tile's circumradius (m); flat-topped, so neighbours are √3·S apart across a flat side. */
const S = 1.1;
const SQ3 = Math.sqrt(3);
const HR = (S * SQ3) / 2;
/** A tile's thickness. */
const TH = 0.55;
/** The floors, top to bottom: their height (their shape is the level's), and NU7 TOWER's floors' size (hex rings round the middle tile). */
const FY = [18, 9, 0];
const RINGS = [6, 7, 8];
/** The axial box a floor's tiles must fit in (|q|, |r| up to it). */
const BOX = 12;
const NF = 3;
const CITY_Y = -70;
/** The snarks: gravity, run speed, grip on the ground and in the air, the jump, size, body radius. */
const G = 30;
const SPEED = 6.2;
const ACC = 30;
const AIR_ACC = 9;
const JUMP_V = 9.8;
const SCALE = 1.15;
const PR = 0.42;
/** How far past a tile's side the feet still hold; a jump's grace after the edge; a press's grace before landing (A), before the shove is ready (B). */
const FOOT = 0.14;
const FOOT_H = 0.22;
const COYOTE = 0.1;
const BUFFER = 0.13;
const BUFFER_B = 0.16;
/** Tile kinds. */
const PLAIN = 0;
const MLDSA = 1;
const RSA = 2;
const ECDSA = 3;
/** Each kind's crack (s, stepped on to dropped): at the start, and from HARD_AT on. */
const CRACK = [
  [0.66, 0.45],
  [1.2, 0.82],
  [0.1, 0.08],
  [0.1, 0.08],
];
const HARD_AT = 60;
/** Tile states. */
const UP = 0;
const CRACKING = 1;
const FALLING = 2;
const GONE = 3;
/** A dropped tile bursts into shards this long after it goes. */
const SHATTER = 0.3;
/** The TRACKER BEAM: the first (EXPOSURE), the gap between beams (early, late), its warning (early, late), the sweep, two at once from. */
const QDAY = 9;
const GAP = [7, 3.8];
const WARN = [1.75, 1.25];
const SWEEP = 0.42;
const DOUBLE_AT = 36;
/** The floors that go on their own (top, middle): the drop starts then, warned C_WARN s before, rippling across in RIPPLE s. */
const COLLAPSE = [20, 38];
const C_WARN = 3;
const RIPPLE = 1.8;
const C_CRACK = 0.5;
/** The shove (B): wind-up (telegraphed), lunge speed and time, the wait before the next, the knock (speed, low grip time), the guard after it, the stumble after a miss, its reach. */
const WIND = 0.2;
const LUNGE_V = 9.5;
const LUNGE_T = 0.16;
const SHOVE_CD = 1.5;
const KNOCK_V = 6.8;
const KNOCK_T = 0.3;
const GUARD = 1.1;
const REC = 0.2;
const CONTACT = 1.05;
const REACH = LUNGE_V * LUNGE_T + CONTACT;

/** Axial neighbours (flat-topped hexes): a direction k and k+3 are opposite. */
const DQ = [1, 1, 0, -1, -1, 0];
const DR = [0, -1, -1, 0, 1, 1];

/** The old keys' dull grey (the floors' own colours are the level's: none of them near the hot orange of a crack). */
const OLD_C = "#b3a89f";
const HOT = new THREE.Color(2.2, 0.95, 0.3);
const RED_HOT = new THREE.Color(1.9, 0.24, 0.14);
const WARN_C = new THREE.Color(2.2, 0.22, 0.2);
const SHIELD_C = new THREE.Color(1.6, 1.25, 2.4);
const FLASH_C = new THREE.Color(2.4, 2.4, 2.4);
/** Your grip on ice, against the rivals'. */
const ICE_H = 1.5;
/** The spin's ramp at GO (s): the decks start turning. */
const SPIN_IN = 2.5;

const hexDist = (q: number, r: number) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
/** Inside a flat-topped hex of inradius h (dx, dz from its centre)? */
const inHex = (dx: number, dz: number, h: number) => Math.abs(dz) <= h && Math.abs(dx * 0.866 + dz * 0.5) <= h && Math.abs(-dx * 0.866 + dz * 0.5) <= h;

// ---- the look: textures, shapes ------------------------------------------------------------------

/** A hex path, flat-topped (vertices at 0°, 60°…), centre (x, y), circumradius r. */
function hexPath(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let k = 0; k < 6; k++) g.lineTo(x + Math.cos((k * Math.PI) / 3) * r, y + Math.sin((k * Math.PI) / 3) * r);
  g.closePath();
}

/** A tile: a hex prism, its sides and bottom (group 0) and its top with a bevel (group 1); the top at y = 0. */
function hexGeo() {
  const a = S * 0.84,
    b = S * 0.955,
    bev = 0.11;
  const pos: number[] = [];
  const uvs: number[] = [];
  const P = (r: number, k: number, y: number) => [Math.cos((k * Math.PI) / 3) * r, y, Math.sin((k * Math.PI) / 3) * r];
  const push = (...vs: number[][]) => {
    for (const v of vs) {
      pos.push(v[0], v[1], v[2]);
      uvs.push(0.5 + v[0] / (2 * S), 0.5 - v[2] / (2 * S));
    }
  };
  for (let k = 0; k < 6; k++) {
    const t0 = P(b, k, -bev),
      t1 = P(b, k + 1, -bev),
      b0 = P(b, k, -TH),
      b1 = P(b, k + 1, -TH);
    push(t0, t1, b1, t0, b1, b0);
    push([0, -TH, 0], b0, b1);
  }
  const nSide = pos.length / 3;
  for (let k = 0; k < 6; k++) {
    const i0 = P(a, k, 0),
      i1 = P(a, k + 1, 0),
      o0 = P(b, k, -bev),
      o1 = P(b, k + 1, -bev);
    push([0, 0, 0], i1, i0);
    push(i0, i1, o1, i0, o1, o0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  g.addGroup(0, nSide, 0);
  g.addGroup(nSide, pos.length / 3 - nSide, 1);
  return g;
}

// (the top's texture: 256 px over 2·S metres, the hex centred; canvas x is +x, canvas y is +z)
const PX = 256 / (2 * S);
const TOP_R = 0.84 * S * PX;
const RIM_R = 0.955 * S * PX;

/** A lattice tile's face (map) and its glowing lattice (emissive map): a node, edges to each side's middle, where they meet the neighbours'. On ice: glassy, with a shine. */
function plainTex(ice = false): [THREE.Texture, THREE.Texture] {
  const lattice = (g: CanvasRenderingContext2D, emi: boolean) => {
    g.lineCap = "round";
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      g.beginPath();
      g.moveTo(128 + Math.cos(a) * 14, 128 + Math.sin(a) * 14);
      g.lineTo(128 + Math.cos(a) * RIM_R * 0.866, 128 + Math.sin(a) * RIM_R * 0.866);
      g.lineWidth = emi ? 6 : 9;
      g.strokeStyle = "#ffffff";
      g.stroke();
    }
    g.beginPath();
    g.arc(128, 128, emi ? 12 : 16, 0, Math.PI * 2);
    g.fillStyle = "#ffffff";
    g.fill();
    // the vertices of the lattice cell: little nodes in the corners
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      g.beginPath();
      g.arc(128 + Math.cos(a) * TOP_R * 0.78, 128 + Math.sin(a) * TOP_R * 0.78, emi ? 4 : 6, 0, Math.PI * 2);
      g.fill();
    }
  };
  const map = canvasTex(256, 256, (g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 256, 256);
    hexPath(g, 128, 128, TOP_R);
    const gr = g.createRadialGradient(128, 118, 8, 128, 128, TOP_R);
    gr.addColorStop(0, "#f2f6ff");
    gr.addColorStop(1, "#c6d0e6");
    g.fillStyle = gr;
    g.fill();
    hexPath(g, 128, 128, TOP_R * 0.9);
    g.lineWidth = 4;
    g.strokeStyle = "#aab6d2";
    g.stroke();
    lattice(g, false);
    g.beginPath();
    g.arc(128, 128, 16, 0, Math.PI * 2);
    g.lineWidth = 3;
    g.strokeStyle = "#8f9cbc";
    g.stroke();
    if (ice) {
      // the ice's shine: two bright streaks across, a frost of specks, scratches of skates
      g.save();
      hexPath(g, 128, 128, TOP_R);
      g.clip();
      g.translate(128, 128);
      g.rotate(-0.65);
      g.fillStyle = "rgba(255,255,255,0.78)";
      g.fillRect(-140, -46, 280, 15);
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.fillRect(-140, -22, 280, 6);
      g.fillStyle = "rgba(255,255,255,0.4)";
      g.fillRect(-140, 40, 280, 9);
      g.rotate(0.65);
      g.strokeStyle = "rgba(120,150,200,0.45)";
      g.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        const a = 0.3 + k * 0.5;
        g.arc(-60 + k * 30, 70 - k * 20, 50 + k * 12, a, a + 0.9);
        g.stroke();
      }
      g.fillStyle = "rgba(255,255,255,0.9)";
      for (let k = 0; k < 30; k++) g.fillRect(Math.cos(k * 2.4) * (k * 3.2), Math.sin(k * 2.4) * (k * 3.2), 3, 3);
      g.restore();
    }
  });
  const emi = canvasTex(256, 256, (g) => {
    g.fillStyle = "#000000";
    g.fillRect(0, 0, 256, 256);
    lattice(g, true);
    hexPath(g, 128, 128, RIM_R - 4);
    g.lineWidth = 5;
    g.strokeStyle = "#3a3a3a";
    g.stroke();
  });
  return [map, emi];
}

/** An ORCHARD tile (shielded): white, a double violet rim, the stamp; the stamp and the rims glow. */
function mldsaTex(): [THREE.Texture, THREE.Texture] {
  const marks = (g: CanvasRenderingContext2D, emi: boolean) => {
    const c = emi ? "#ffffff" : "#6a48f4";
    hexPath(g, 128, 128, TOP_R * 0.93);
    g.lineWidth = 9;
    g.strokeStyle = c;
    g.stroke();
    hexPath(g, 128, 128, TOP_R * 0.78);
    g.lineWidth = 3;
    g.stroke();
    // (the stamp itself stays dark ink, so it reads)
    if (!emi) {
      g.font = `900 38px Geist, Roboto, ui-sans-serif, system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.lineWidth = 7;
      g.strokeStyle = "#ffffff";
      g.strokeText("ORCHARD", 128, 132);
      g.fillStyle = "#3d1fc4";
      g.fillText("ORCHARD", 128, 132);
    }
    g.fillStyle = c;
    for (const dx of [-40, 0, 40]) {
      g.beginPath();
      g.arc(128 + dx, 96, 5, 0, Math.PI * 2);
      g.arc(128 + dx, 168, 5, 0, Math.PI * 2);
      g.fill();
    }
  };
  const map = canvasTex(256, 256, (g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 256, 256);
    hexPath(g, 128, 128, TOP_R);
    const gr = g.createRadialGradient(128, 118, 8, 128, 128, TOP_R);
    gr.addColorStop(0, "#ffffff");
    gr.addColorStop(1, "#e2dbff");
    g.fillStyle = gr;
    g.fill();
    marks(g, false);
  });
  const emi = canvasTex(256, 256, (g) => {
    g.fillStyle = "#000000";
    g.fillRect(0, 0, 256, 256);
    marks(g, true);
  });
  return [map, emi];
}

/** A transparent tile (t-addr, P2PKH): dull, mottled, cracked, a chipped corner, the stamp struck through; its cracks glow a dying red. */
function oldTex(word: string, seed: number): [THREE.Texture, THREE.Texture] {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cracks: number[][] = [];
  for (let c = 0; c < 4; c++) {
    const a0 = r() * Math.PI * 2;
    const pts = [128 + Math.cos(a0) * TOP_R * 0.98, 128 + Math.sin(a0) * TOP_R * 0.98];
    let x = pts[0],
      y = pts[1];
    const steps = 3 + Math.floor(r() * 3);
    for (let k = 0; k < steps; k++) {
      x += (128 - x) * (0.25 + r() * 0.2) + (r() - 0.5) * 26;
      y += (128 - y) * (0.25 + r() * 0.2) + (r() - 0.5) * 26;
      pts.push(x, y);
    }
    cracks.push(pts);
  }
  const drawCracks = (g: CanvasRenderingContext2D, w: number, c: string) => {
    g.lineJoin = "round";
    g.lineCap = "round";
    g.lineWidth = w;
    g.strokeStyle = c;
    for (const p of cracks) {
      g.beginPath();
      for (let k = 0; k < p.length; k += 2) g.lineTo(p[k], p[k + 1]);
      g.stroke();
    }
  };
  const map = canvasTex(256, 256, (g) => {
    g.fillStyle = "#d8d0c8";
    g.fillRect(0, 0, 256, 256);
    hexPath(g, 128, 128, TOP_R);
    g.fillStyle = "#c2b8ae";
    g.fill();
    g.save();
    g.clip();
    for (let k = 0; k < 26; k++) {
      g.fillStyle = k % 2 ? "rgba(90,74,62,0.16)" : "rgba(255,255,255,0.12)";
      g.beginPath();
      g.arc(r() * 256, r() * 256, 6 + r() * 22, 0, Math.PI * 2);
      g.fill();
    }
    // a chipped corner
    const ck = Math.floor(r() * 6);
    const a = (ck * Math.PI) / 3;
    g.fillStyle = "#6a5d54";
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * TOP_R, 128 + Math.sin(a) * TOP_R);
    g.lineTo(128 + Math.cos(a - 0.35) * TOP_R * 0.7, 128 + Math.sin(a - 0.35) * TOP_R * 0.7);
    g.lineTo(128 + Math.cos(a + 0.3) * TOP_R * 0.62, 128 + Math.sin(a + 0.3) * TOP_R * 0.62);
    g.closePath();
    g.fill();
    drawCracks(g, 5, "#3a2e28");
    // the stamp, faded, aslant, struck through
    g.translate(128, 130);
    g.rotate(-0.2);
    g.font = `900 ${word.length > 3 ? 50 : 72}px Geist, Roboto, ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(128,34,24,0.86)";
    g.fillText(word, 0, 0);
    g.fillRect(-82, -4, 164, 8);
    g.restore();
  });
  const emi = canvasTex(256, 256, (g) => {
    g.fillStyle = "#000000";
    g.fillRect(0, 0, 256, 256);
    drawCracks(g, 3, "#ffffff");
  });
  return [map, emi];
}

/** The cracks that spread over a tile as it goes (dark, a hot glow inside). */
function crackTex() {
  return canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.lineJoin = "round";
    g.lineCap = "round";
    const paths: number[][] = [];
    for (let c = 0; c < 7; c++) {
      const a0 = (c / 7) * Math.PI * 2 + Math.random() * 0.5;
      const p = [128, 128];
      let x = 128,
        y = 128,
        a = a0;
      for (let k = 0; k < 5; k++) {
        a += (Math.random() - 0.5) * 0.9;
        const d = 14 + Math.random() * 14;
        x += Math.cos(a) * d;
        y += Math.sin(a) * d;
        p.push(x, y);
      }
      paths.push(p);
    }
    for (const [w, c] of [
      [8, "rgba(30,14,8,0.92)"],
      [2.5, "rgba(255,236,170,1)"],
    ] as [number, string][]) {
      g.lineWidth = w;
      g.strokeStyle = c;
      for (const p of paths) {
        g.beginPath();
        for (let k = 0; k < p.length; k += 2) g.lineTo(p[k], p[k + 1]);
        g.stroke();
      }
    }
  });
}

/** A shove's arrow on the floor (pointing +x on the canvas). */
function arrowTex() {
  return canvasTex(256, 96, (g) => {
    g.clearRect(0, 0, 256, 96);
    const path = () => {
      g.beginPath();
      g.moveTo(10, 36);
      g.lineTo(170, 36);
      g.lineTo(170, 12);
      g.lineTo(246, 48);
      g.lineTo(170, 84);
      g.lineTo(170, 60);
      g.lineTo(10, 60);
      g.closePath();
    };
    path();
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = "rgba(20,10,40,0.7)";
    g.stroke();
  });
}

/** A comic bonk: a hot star with a white core. */
function powTex() {
  return canvasTex(128, 128, (g) => {
    const star = (r1: number, r0: number, c: string) => {
      g.fillStyle = c;
      g.beginPath();
      for (let i = 0; i < 18; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 9;
        const r = i % 2 ? r0 : r1;
        g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    };
    star(62, 30, "#ff6b35");
    star(52, 24, "#ffe0b8");
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(64, 64, 17, 0, Math.PI * 2);
    g.fill();
  });
}

/** The warning stripe under the TRACKER BEAM: hazard chevrons (they scroll). */
function stripeTex() {
  const t = canvasTex(
    128,
    64,
    (g) => {
      g.clearRect(0, 0, 128, 64);
      g.fillStyle = "rgba(255,70,50,0.55)";
      g.fillRect(0, 0, 128, 64);
      g.fillStyle = "rgba(255,226,170,0.95)";
      for (const x0 of [0, 64]) {
        g.beginPath();
        g.moveTo(x0 + 6, 6);
        g.lineTo(x0 + 30, 6);
        g.lineTo(x0 + 54, 32);
        g.lineTo(x0 + 30, 58);
        g.lineTo(x0 + 6, 58);
        g.lineTo(x0 + 30, 32);
        g.closePath();
        g.fill();
      }
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.fillRect(0, 0, 128, 4);
      g.fillRect(0, 60, 128, 4);
    },
    true,
  );
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---- sound -----------------------------------------------------------------------------------------

let noiseBuf: AudioBuffer | null = null;
function noiseOf(ac: AudioContext) {
  if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
    const n = Math.floor(ac.sampleRate * 2);
    noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
/** A burst of filtered noise. */
function hiss(dur: number, vol: number, type: BiquadFilterType, f: number, q = 0.8, delay = 0) {
  const s = sound();
  if (!s || vol <= 0.002) return;
  const { ac, bus } = s;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseOf(ac);
  const fl = ac.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl).connect(g).connect(bus);
  src.start(t, Math.random() * 1.2);
  src.stop(t + dur + 0.05);
}
function beep(f0: number, f1: number, dur: number, vol: number, type: OscillatorType = "triangle", delay = 0) {
  const s = sound();
  if (!s || vol <= 0.002) return null;
  const { ac, bus } = s;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.03);
  return o;
}
/** A tile cracking: a glassy tick and a crackle. */
const crackS = (v: number, old: boolean) => (hiss(old ? 0.16 : 0.07, v * 0.7, "highpass", old ? 1800 : 3200), beep(old ? 520 : 1900 + Math.random() * 500, old ? 140 : 900, old ? 0.12 : 0.05, v * 0.5, old ? "square" : "triangle"));
/** A tile letting go. */
const dropS = (v: number) => (hiss(0.18, v * 0.6, "lowpass", 700), beep(150, 60, 0.16, v * 0.6, "sine"));
/** A tile bursting into shards. */
const shatterS = (v: number) => (hiss(0.3, v * 0.55, "bandpass", 2600, 0.6), beep(900, 300, 0.08, v * 0.25, "square"));
/** The TRACKER BEAM firing: a falling zap. */
const zapS = (v: number) => (beep(1600, 90, 0.5, v * 0.5, "sawtooth"), hiss(0.45, v * 0.5, "bandpass", 1500, 0.5), beep(70, 40, 0.5, v * 0.7, "sine"));
/** The long falling whistle. */
const whistleS = (v: number) => beep(1500, 320, 1.1, v, "sine");
/** An ORCHARD tile shrugging the beam off. */
const tingS = (v: number) => (beep(1760, 1760, 0.18, v * 0.35, "triangle"), beep(2637, 2637, 0.22, v * 0.25, "sine", 0.04));
/** A crowd cheering (the end). */
function cheerS(vol: number) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseOf(ac);
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1300;
  f.Q.value = 0.7;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.25);
  g.gain.setValueAtTime(vol, t + 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
  const lfo = ac.createOscillator();
  const lg = ac.createGain();
  lfo.frequency.value = 7;
  lg.gain.value = vol * 0.35;
  lfo.connect(lg).connect(g.gain);
  src.connect(f).connect(g).connect(bus);
  src.start(t);
  lfo.start(t);
  src.stop(t + 2.1);
  lfo.stop(t + 2.1);
  [523, 659, 784].forEach((n, i) => beep(n, n, 0.3, vol * 0.35, "square", 0.1 + i * 0.09));
}

// ---- shards: pooled voxel bits (typed arrays, no garbage) -----------------------------------------

class Shards {
  readonly mesh: THREE.InstancedMesh;
  private p: Float32Array;
  private v: Float32Array;
  private r: Float32Array;
  private w: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private sz: Float32Array;
  private live: Uint8Array;
  private next = 0;
  private m = new THREE.Matrix4();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private pos = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private colDirty = false;

  constructor(
    scene: THREE.Scene,
    readonly cap = 720,
  ) {
    this.mesh = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), cap);
    this.p = new Float32Array(cap * 3);
    this.v = new Float32Array(cap * 3);
    this.r = new Float32Array(cap * 3);
    this.w = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.sz = new Float32Array(cap);
    this.live = new Uint8Array(cap);
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, this.zero);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    scene.add(this.mesh);
  }

  /** `n` shards from round (x, y, z) in `r` metres, of this colour, kicked up `up` m/s, `size` m. */
  burst(x: number, y: number, z: number, n: number, c: THREE.Color, r = 0.6, up = 4, size = 0.26, speed = 3.5) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.cap;
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r;
      const j = i * 3;
      this.p[j] = x + Math.cos(a) * d;
      this.p[j + 1] = y + (Math.random() - 0.5) * 0.3;
      this.p[j + 2] = z + Math.sin(a) * d;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.v[j] = Math.cos(a) * sp;
      this.v[j + 1] = up * (0.4 + Math.random() * 0.8);
      this.v[j + 2] = Math.sin(a) * sp;
      this.r[j] = Math.random() * 6;
      this.r[j + 1] = Math.random() * 6;
      this.r[j + 2] = 0;
      this.w[j] = (Math.random() - 0.5) * 14;
      this.w[j + 1] = (Math.random() - 0.5) * 14;
      this.w[j + 2] = (Math.random() - 0.5) * 8;
      this.life[i] = 0;
      this.max[i] = 0.9 + Math.random() * 0.8;
      this.sz[i] = size * (0.55 + Math.random() * 0.9);
      this.live[i] = 1;
      this.mesh.setColorAt(i, c);
    }
    this.colDirty = true;
  }

  update(dt: number) {
    let any = false;
    for (let i = 0; i < this.cap; i++) {
      if (!this.live[i]) continue;
      any = true;
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) {
        this.live[i] = 0;
        this.mesh.setMatrixAt(i, this.zero);
        continue;
      }
      const j = i * 3;
      this.v[j + 1] -= 24 * dt;
      this.p[j] += this.v[j] * dt;
      this.p[j + 1] += this.v[j + 1] * dt;
      this.p[j + 2] += this.v[j + 2] * dt;
      this.r[j] += this.w[j] * dt;
      this.r[j + 1] += this.w[j + 1] * dt;
      this.r[j + 2] += this.w[j + 2] * dt;
      const k = 1 - this.life[i] / this.max[i];
      const s = this.sz[i] * Math.min(1, k * 3);
      this.e.set(this.r[j], this.r[j + 1], this.r[j + 2]);
      this.m.compose(this.pos.set(this.p[j], this.p[j + 1], this.p[j + 2]), this.q.setFromEuler(this.e), this.sc.set(s, s * 0.7, s));
      this.mesh.setMatrixAt(i, this.m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
    if (this.colDirty && this.mesh.instanceColor) ((this.mesh.instanceColor.needsUpdate = true), (this.colDirty = false));
  }
}

// ---- the players --------------------------------------------------------------------------------

interface Pl {
  p: Player;
  a: Avatar;
  /** Between the avatar and the snark: turns round the hips (leans, the tumble of a fall). */
  tumble: THREE.Group;
  vx: number;
  vz: number;
  /** The floor it stands on, or is falling toward. */
  level: number;
  alive: boolean;
  /** Out and fallen out of sight. */
  gone: boolean;
  outT: number;
  /** The tile under its feet (-1: none). */
  tile: number;
  coyote: number;
  buf: number;
  /** Your B pressed a moment early (in a hop, a hair before the shove is ready): it goes as soon as it can. */
  bufB: number;
  /** The tile it fell through, and that tile's floor (its body is kept inside the hole on the way down). */
  hole: number;
  /** Seconds into a fall between floors (-1: not falling). */
  fallT: number;
  /** The shove: the wait before the next, the wind-up, the lunge, its way, the knock taken, the guard after it, the stumble; by whom, when. */
  cd: number;
  wind: number;
  lunge: number;
  sx: number;
  sz: number;
  knock: number;
  guard: number;
  rec: number;
  by: number;
  byAt: number;
  spin: number;
  /** The wanted move (unit) and how hard (0…1), from the arrows or the AI. */
  wx: number;
  wz: number;
  thr: number;
  /** The AI: its next think, its path (tiles), where it is on it, a panic, a dodge pending, how long a beam takes to register. */
  think: number;
  path: Int16Array;
  pn: number;
  pi: number;
  panic: number;
  px: number;
  pz: number;
  dodge: number;
  react: number;
  /** When it steps off its cracking tile (s left on it), the tile it last stood on, whom its shove is aimed at, its last jump's take-off. */
  leave: number;
  lastTile: number;
  shoveAt: number;
  jumped: boolean;
  /** (the bench's bot: what the AI would do in your place: the move, a jump, a shove) */
  bx: number;
  bz: number;
  bt: number;
  wantJump: boolean;
  wantShove: boolean;
  /** The look: the ice spray's wait, the landing's squash, the "2F" pop. */
  skid: number;
  squash: number;
  pop: number;
  popS: string;
  jumps: number;
}

interface Beam {
  on: boolean;
  f: number;
  /** Seconds since it was announced; its warning; fired yet. */
  t: number;
  warn: number;
  fired: boolean;
  tiles: Int16Array;
  /** Each tile's place along the line. */
  at: Float32Array;
  n: number;
  hit: number;
  x0: number;
  z0: number;
  dx: number;
  dz: number;
  len: number;
  group: THREE.Group;
  strip: THREE.Mesh;
  stripTex: THREE.Texture;
  core: THREE.Mesh;
  halo: THREE.Mesh;
  ems: THREE.Group[];
}

// ---- the game --------------------------------------------------------------------------------------

class Lattice implements Mini {
  private w: World;
  private fx: Fx3;
  private shards: Shards;
  private cam: CamRig;
  private pl: Pl[];
  private human: number;
  // the tiles (flat arrays over every tile of the three floors)
  private N = 0;
  private tf = new Uint8Array(0);
  private tq = new Int8Array(0);
  private tr = new Int8Array(0);
  /** Each tile's centre where it is now (the floor turned: SPIN STATION), and on its floor (unturned). */
  private tx = new Float32Array(0);
  private tz = new Float32Array(0);
  private lx = new Float32Array(0);
  private lz = new Float32Array(0);
  /** On its floor's edge (a neighbour missing). */
  private rim = new Uint8Array(0);
  private kind = new Uint8Array(0);
  private st = new Uint8Array(0);
  private ck = new Float32Array(0);
  private cd = new Float32Array(0);
  private ft = new Float32Array(0);
  /** A collapse's wait before the tile starts to crack (-1: none). */
  private pend = new Float32Array(0);
  private popT = new Float32Array(0);
  private shield = new Float32Array(0);
  /** The TRACKER BEAM over it: when it was announced, when it hits (99: no beam). */
  private beamFrom = new Float32Array(0);
  private beamAt = new Float32Array(0);
  private mi = new Int16Array(0);
  /** What set it off: 0 a step, 1 the TRACKER BEAM, 2 a collapse. */
  private cause = new Uint8Array(0);
  private nb = new Int16Array(0);
  private spinX = new Float32Array(0);
  private spinZ = new Float32Array(0);
  private yawT = new Float32Array(0);
  private base = new Float32Array(0);
  private idx: Int16Array[] = [];
  private list: number[][] = [];
  private meshes: (THREE.InstancedMesh | null)[][] = [];
  private mats: { side: THREE.MeshToonMaterial; tops: THREE.MeshToonMaterial[] }[] = [];
  private alpha = [1, 1, 1];
  /** The floors: how far each reaches from its middle, its half-size along x and z; its turn (yaw), its spin now (rad/s), its pull to the rim now (m/s per m). */
  private ext = [0, 0, 0];
  private halfX = [0, 0, 0];
  private halfZ = [0, 0, 0];
  private ang = [0, 0, 0];
  private om = [0, 0, 0];
  private pullK = [0, 0, 0];
  private cs = [1, 1, 1];
  private sn = [0, 0, 0];
  /** (a point on a floor, unturned: from loc()) */
  private lp = [0, 0];
  /** The level's own scenery (FROZEN LAKE, SPIN STATION). */
  private deco: Deco | null = null;
  private decals!: THREE.InstancedMesh;
  private decalMat!: THREE.MeshBasicMaterial;
  // the beams, the floors going on their own
  private beams: Beam[] = [];
  private nextBeam = QDAY;
  private beamCount = 0;
  private collapse = [
    { warned: false, at: (typeof location !== "undefined" && /partylab/.test(location.pathname) && Number(new URLSearchParams(location.search).get("lcol"))) || COLLAPSE[0], fell: false },
    { warned: false, at: COLLAPSE[1], fell: false },
  ];
  private charges: OscillatorNode[] = [];
  // the look
  private arrows: THREE.Group[] = [];
  private pows: { m: THREE.Mesh; t: number; s: number }[] = [];
  private frame!: THREE.InstancedMesh;
  private nodes!: THREE.InstancedMesh;
  private signs: THREE.Mesh[] = [];
  // the game
  t = 0;
  private clock = 0;
  out: number[] = [];
  private order: number[] = [];
  private over = -1;
  private done: number[] | null = null;
  private news: { s: string; c: string; t: number; d: number; sub?: string }[] = [];
  private said = { two: false, last: false, fast: false, faster: false, double: false, music: false, intro: false };
  private crackCool = 0;
  private skidS = 0;
  private alarm = 0;
  private focusY = FY[0];
  private bannerY = 112;
  private started = false;
  private countFrom: { eye: THREE.Vector3; at: THREE.Vector3 } | null = null;
  /** (the bench's bot: the skill it plays seat 0 with; -1 none) */
  botSkill = -1;
  private ff = (typeof location !== "undefined" && /partylab/.test(location.pathname) && Number(new URLSearchParams(location.search).get("lff"))) || 1;
  stats = { beams: 0, shoves: 0, hits: 0, floorAt: [] as number[][], outAt: [] as number[], why: [] as string[] };
  // (scratch, so the frame makes no garbage)
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private at = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private m4 = new THREE.Matrix4();
  private sc = new THREE.Vector3();
  private col = new THREE.Color();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private ax = [0, 0];
  private bq = new Int16Array(1024);
  private bdep = new Uint8Array(0);
  private bpar = new Int16Array(0);
  private bjmp = new Uint8Array(0);
  private seen = new Int32Array(0);
  private gen = 1;
  private outs = [false, false, false, false];
  private vals = ["", "", "", ""];

  constructor(
    private players: Player[],
    private rnd: Rnd,
    readonly L: Level,
  ) {
    this.w = world({ sky: L.sky, fog: L.fog });
    const s = this.w.scene;
    this.human = players.findIndex((p) => p.human);
    // the level's light: the sun (behind the floors, where its sky has it: the shadows fall toward the camera), the
    // sky's fill, a fill from the camera's side in the other temperature (the sky itself is the scenery's dome)
    this.w.sun.position.set(...L.sunAt);
    this.w.sun.color.set(L.sun);
    this.w.sun.intensity = L.sunI;
    this.w.hemi.color.set(L.hemi[0]);
    this.w.hemi.groundColor.set(L.hemi[1]);
    this.w.hemi.intensity = L.hemiI;
    const rim = new THREE.DirectionalLight(L.rim[0], L.rim[1]);
    rim.position.set(L.rim[2], L.rim[3], L.rim[4]);
    s.add(rim, rim.target);
    this.buildTiles(s);
    this.fx = new Fx3(s, 700);
    const ctx = { L, FY, cityY: CITY_Y, ext: this.ext, halfX: this.halfX, halfZ: this.halfZ, fx: this.fx };
    if (L.key === "astana") this.deco = astanaScenery(s, ctx);
    else if (L.key === "orbit") this.deco = orbitScenery(s, ctx);
    else {
      this.buildFrame(s);
      this.deco = towerScenery(s, ctx);
    }
    this.buildBeams(s);
    this.shards = new Shards(s, 720);
    // the four on the top floor, facing the middle (you front left)
    const ink = arrowTex();
    this.pl = players.map((p, i) => {
      const a = new Avatar(s, p, { scale: SCALE, marker: p.human });
      const tumble = new THREE.Group();
      tumble.position.y = 0.85 * SCALE;
      a.root.add(tumble);
      tumble.add(a.body.root);
      a.body.root.position.y = -0.85 * SCALE;
      const t0 = this.nearest(0, L.spawns[i][0], L.spawns[i][1]);
      a.pos.set(this.tx[t0], FY[0], this.tz[t0]);
      a.yaw = yawOf(-a.pos.x, -a.pos.z);
      a.sync(0);
      const ar = new THREE.Group();
      const am = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: ink, color: p.color, transparent: true, depthWrite: false, opacity: 0.9 }));
      am.rotation.x = -Math.PI / 2;
      am.renderOrder = 4;
      ar.add(am);
      ar.visible = false;
      s.add(ar);
      this.arrows.push(ar);
      this.stats.floorAt.push([0, -1, -1]);
      return {
        p,
        a,
        tumble,
        vx: 0,
        vz: 0,
        level: 0,
        alive: true,
        gone: false,
        outT: -1,
        tile: t0,
        coyote: 0,
        buf: 0,
        bufB: 0,
        hole: -1,
        fallT: -1,
        cd: 0.6,
        wind: 0,
        lunge: 0,
        sx: 0,
        sz: 1,
        knock: 0,
        guard: 0,
        rec: 0,
        by: -1,
        byAt: -9,
        spin: 0,
        wx: 0,
        wz: 0,
        thr: 0,
        think: 0.2 + rnd() * 0.3,
        path: new Int16Array(8),
        pn: 0,
        pi: 0,
        panic: 0,
        px: 0,
        pz: 0,
        dodge: -1,
        react: 0.12 + (1 - p.skill) * 0.55,
        leave: 0.35,
        lastTile: t0,
        shoveAt: -1,
        jumped: false,
        bx: 0,
        bz: 0,
        bt: 0,
        wantJump: false,
        wantShove: false,
        skid: 0,
        squash: 0,
        pop: 0,
        popS: "",
        jumps: 0,
      };
    });
    const pm = new THREE.MeshBasicMaterial({ map: powTex(), transparent: true, depthTest: false, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(GEO.plane, pm);
      m.visible = false;
      m.renderOrder = 10;
      s.add(m);
      this.pows.push({ m, t: 9, s: 1 });
    }
    this.cam = new CamRig(this.w.camera);
    this.cardCam(0);
    this.cam.apply(0);
    this.tiles3(0);
    if (typeof location !== "undefined" && /partylab/.test(location.pathname)) (window as unknown as Record<string, unknown>).__lattice = this;
  }

  // ---- building ------------------------------------------------------------------------------------

  private buildTiles(s: THREE.Scene) {
    const rnd = this.rnd,
      L = this.L;
    const spawn = L.spawns.map(([x, z]) => {
      this.roundAx(x, z);
      return [this.ax[0], this.ax[1]];
    });
    const [pM, pR, pE] = L.mix;
    const all: { f: number; q: number; r: number; k: number }[] = [];
    for (let f = 0; f < NF; f++)
      for (let q = -BOX; q <= BOX; q++)
        for (let r = -BOX; r <= BOX; r++) {
          if (!L.shape(f, q, r, S * 1.5 * q, S * SQ3 * (r + q / 2))) continue;
          const u = rnd();
          let k = u < pM ? MLDSA : u < pM + pR ? RSA : u < pM + pR + pE ? ECDSA : PLAIN;
          // (plain ground under the four at the start, and round them)
          if (f === 0 && spawn.some(([sq, sr]) => hexDist(q - sq, r - sr) <= 1)) k = PLAIN;
          all.push({ f, q, r, k });
        }
    const N = (this.N = all.length);
    this.tf = new Uint8Array(N);
    this.tq = new Int8Array(N);
    this.tr = new Int8Array(N);
    this.tx = new Float32Array(N);
    this.tz = new Float32Array(N);
    this.lx = new Float32Array(N);
    this.lz = new Float32Array(N);
    this.rim = new Uint8Array(N);
    this.kind = new Uint8Array(N);
    this.st = new Uint8Array(N);
    this.ck = new Float32Array(N);
    this.cd = new Float32Array(N);
    this.ft = new Float32Array(N);
    this.pend = new Float32Array(N).fill(-1);
    this.popT = new Float32Array(N);
    this.shield = new Float32Array(N);
    this.beamFrom = new Float32Array(N).fill(99);
    this.beamAt = new Float32Array(N).fill(99);
    this.mi = new Int16Array(N);
    this.cause = new Uint8Array(N);
    this.nb = new Int16Array(N * 6).fill(-1);
    this.spinX = new Float32Array(N);
    this.spinZ = new Float32Array(N);
    this.yawT = new Float32Array(N);
    this.base = new Float32Array(N * 3);
    this.bdep = new Uint8Array(N);
    this.bpar = new Int16Array(N);
    this.bjmp = new Uint8Array(N);
    this.seen = new Int32Array(N);
    for (let f = 0; f < NF; f++) {
      this.idx.push(new Int16Array((2 * BOX + 1) * (2 * BOX + 1)).fill(-1));
      this.list.push([]);
    }
    const counts = [0, 0, 0, 0].map(() => [0, 0, 0]);
    all.forEach((d, i) => {
      this.tf[i] = d.f;
      this.tq[i] = d.q;
      this.tr[i] = d.r;
      this.tx[i] = this.lx[i] = S * 1.5 * d.q;
      this.tz[i] = this.lz[i] = S * SQ3 * (d.r + d.q / 2);
      this.kind[i] = d.k;
      this.idx[d.f][(d.q + BOX) * (2 * BOX + 1) + (d.r + BOX)] = i;
      this.ext[d.f] = Math.max(this.ext[d.f], Math.hypot(this.lx[i], this.lz[i]) + HR);
      this.halfX[d.f] = Math.max(this.halfX[d.f], Math.abs(this.lx[i]) + S);
      this.halfZ[d.f] = Math.max(this.halfZ[d.f], Math.abs(this.lz[i]) + HR);
      this.list[d.f].push(i);
      this.mi[i] = counts[d.k][d.f]++;
      const a = Math.random() * Math.PI * 2;
      this.spinX[i] = Math.cos(a);
      this.spinZ[i] = Math.sin(a);
      this.yawT[i] = d.k >= RSA ? (Math.random() - 0.5) * 0.25 : 0;
      // the colours: the floor's (three shades in a 3-colouring of the lattice), ORCHARD white, transparent tiles dull
      let shade = [1, 0.9, 1.07][(((d.q - d.r) % 3) + 3) % 3];
      // (on the spinning decks the ground darkens out toward the rim, where the pull is: the bright hub is the safe ground)
      if (L.pull > 0 && d.k === PLAIN) shade *= 1.12 - 0.5 * Math.min(1, Math.hypot(this.lx[i], this.lz[i]) / 14) ** 1.4;
      this.col.set(d.k === PLAIN ? L.floorC[d.f] : d.k === MLDSA ? "#ffffff" : OLD_C).multiplyScalar(d.k === MLDSA ? 1 : shade);
      this.base[i * 3] = this.col.r;
      this.base[i * 3 + 1] = this.col.g;
      this.base[i * 3 + 2] = this.col.b;
    });
    for (let i = 0; i < N; i++)
      for (let k = 0; k < 6; k++) if ((this.nb[i * 6 + k] = this.tileAt(this.tf[i], this.tq[i] + DQ[k], this.tr[i] + DR[k])) < 0) this.rim[i] = 1;
    // one instanced draw per floor and kind (its sides, its top)
    const geo = hexGeo();
    const tex = [plainTex(L.ice > 0), mldsaTex(), oldTex("t-addr", 11), oldTex("P2PKH", 29)];
    const glows = (f: number, k: number) => (k === PLAIN ? L.glowC[f] : k === MLDSA ? "#a688ff" : "#ff4a2a");
    const glowK = [L.ice > 0 ? 0.6 : 0.85, 0.9, 0.55, 0.55];
    for (let f = 0; f < NF; f++) {
      const side = new THREE.MeshToonMaterial({ color: L.sideC, gradientMap: toonSteps(), transparent: true });
      const tops = tex.map(([map, emi], k) => new THREE.MeshToonMaterial({ map, emissiveMap: emi, emissive: new THREE.Color(glows(f, k)).multiplyScalar(glowK[k]), gradientMap: toonSteps(), transparent: true }));
      this.mats.push({ side, tops });
      const row: (THREE.InstancedMesh | null)[] = [];
      for (let k = 0; k < 4; k++) {
        const n = counts[k][f];
        if (!n) {
          row.push(null);
          continue;
        }
        const m = new THREE.InstancedMesh(geo, [side, tops[k]], n);
        m.position.y = FY[f];
        m.frustumCulled = false;
        m.raycast = () => {};
        m.setColorAt(0, this.col.set(1, 1, 1));
        s.add(m);
        row.push(m);
      }
      this.meshes.push(row);
    }
    // the cracks spreading over the tiles that go (one draw; tile i is instance i)
    const dg = new THREE.PlaneGeometry(1, 1);
    dg.rotateX(-Math.PI / 2);
    this.decalMat = new THREE.MeshBasicMaterial({ map: crackTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.decals = new THREE.InstancedMesh(dg, this.decalMat, N);
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 1;
    this.decals.raycast = () => {};
    for (let i = 0; i < N; i++) this.decals.setMatrixAt(i, this.zero);
    s.add(this.decals);
  }

  /** The tower round the floors: glowing pillars at the corners, spokes to each floor, nodes where they meet. */
  private buildFrame(s: THREE.Scene) {
    const RP = SQ3 * RINGS[2] * S + 3.2;
    const top = FY[0] + 6,
      bot = FY[2] - 5;
    this.frame = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), 6 + 18);
    this.nodes = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), 6 * 7);
    let fi = 0,
      ni = 0;
    for (let k = 0; k < 6; k++) {
      // (none at the front: it would stand between the camera and the floors)
      if (k === 1) continue;
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      const px = Math.cos(a) * RP,
        pz = Math.sin(a) * RP;
      this.m4.compose(this.v.set(px, (top + bot) / 2, pz), this.q.identity(), this.sc.set(0.32, top - bot, 0.32));
      this.frame.setMatrixAt(fi, this.m4);
      this.frame.setColorAt(fi++, this.col.set("#6b56c9"));
      for (let f = 0; f < NF; f++) {
        // a spoke from the pillar to the floor's corner
        const rc = SQ3 * RINGS[f] * S + 0.5;
        const cx = Math.cos(a) * rc,
          cz = Math.sin(a) * rc;
        const dx = px - cx,
          dz = pz - cz;
        const len = Math.hypot(dx, dz);
        this.q.setFromAxisAngle(this.v2.set(0, 1, 0), Math.atan2(-dz, dx));
        this.m4.compose(this.v.set((px + cx) / 2, FY[f] - TH / 2, (pz + cz) / 2), this.q, this.sc.set(len, 0.14, 0.14));
        this.frame.setMatrixAt(fi, this.m4);
        this.frame.setColorAt(fi++, this.col.set(this.L.glowC[f]));
        // a node on the pillar, one at the corner
        this.e.set(Math.PI / 4, 0, Math.PI / 4);
        this.q.setFromEuler(this.e);
        this.m4.compose(this.v.set(px, FY[f] - TH / 2, pz), this.q, this.sc.setScalar(0.8));
        this.nodes.setMatrixAt(ni, this.m4);
        this.nodes.setColorAt(ni++, this.col.set(this.L.glowC[f]).multiplyScalar(1.3));
        this.m4.compose(this.v.set(cx, FY[f] - TH / 2, cz), this.q, this.sc.setScalar(0.42));
        this.nodes.setMatrixAt(ni, this.m4);
        this.nodes.setColorAt(ni++, this.col.set("#ffffff"));
      }
      this.m4.compose(this.v.set(px, top + 0.6, pz), this.q, this.sc.setScalar(1.1));
      this.nodes.setMatrixAt(ni, this.m4);
      this.nodes.setColorAt(ni++, this.col.set("#ff6b35"));
    }
    this.frame.count = fi;
    this.nodes.count = ni;
    this.frame.raycast = this.nodes.raycast = () => {};
    s.add(this.frame, this.nodes);
    // the signs floating round the tower: the transparent addresses EXPOSURE cracked
    const sg: [string, string, number, number, number][] = [
      ["PUBLIC t-addr ✗", "#ff6a52", -15, 14.5, -15],
      ["P2SH ✗", "#ff6a52", 15, 14.5, -15],
    ];
    for (const [str, c, x, y, z] of sg) {
      const m = label(str, 1.5, c, "rgba(14,10,30,0.72)");
      m.position.set(x, y, z);
      m.userData.y = y;
      m.userData.a = Math.random() * 6;
      s.add(m);
      this.signs.push(m);
    }
  }

  /** Two beam slots: the warning stripe, the beam (core and halo), a charging probe at each end. */
  private buildBeams(s: THREE.Scene) {
    const ring = new THREE.TorusGeometry(0.78, 0.07, 6, 28);
    for (let b = 0; b < 2; b++) {
      const group = new THREE.Group();
      const stripTex = stripeTex();
      const strip = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: stripTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
      strip.rotation.x = -Math.PI / 2;
      strip.renderOrder = 3;
      group.add(strip);
      const core = new THREE.Mesh(GEO.box, glow("#ffffff", 0.95, true));
      const halo = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#ff5a3c", transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      group.add(core, halo);
      const ems = [0, 1].map(() => {
        const e = new THREE.Group();
        const orb = new THREE.Mesh(GEO.ball, new THREE.MeshBasicMaterial({ color: "#ff6b35", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        orb.scale.setScalar(1.1);
        const kern = new THREE.Mesh(GEO.ball, glow("#fff3e0"));
        kern.scale.setScalar(0.5);
        const r1 = new THREE.Mesh(ring, glow("#c4b1fc"));
        const r2 = new THREE.Mesh(ring, glow("#c4b1fc"));
        r2.rotation.x = Math.PI / 2;
        // the probe's antenna
        const arrow = new THREE.Mesh(GEO.box, glow("#ffffff"));
        arrow.scale.set(0.08, 0.95, 0.08);
        arrow.position.y = 0.45;
        e.add(orb, kern, r1, r2, arrow);
        group.add(e);
        return e;
      });
      group.visible = false;
      s.add(group);
      this.beams.push({ on: false, f: 0, t: 0, warn: 1, fired: false, tiles: new Int16Array(40), at: new Float32Array(40), n: 0, hit: 0, x0: 0, z0: 0, dx: 1, dz: 0, len: 1, group, strip, stripTex, core, halo, ems });
    }
  }

  // ---- the lattice ---------------------------------------------------------------------------------

  /** The axial hex (q, r) round (x, z), into this.ax. */
  private roundAx(x: number, z: number) {
    const qf = ((2 / 3) * x) / S;
    const rf = ((-1 / 3) * x + (SQ3 / 3) * z) / S;
    const sf = -qf - rf;
    let q = Math.round(qf),
      r = Math.round(rf);
    const s = Math.round(sf);
    const dq = Math.abs(q - qf),
      dr = Math.abs(r - rf),
      ds = Math.abs(s - sf);
    if (dq > dr && dq > ds) q = -r - s;
    else if (dr > ds) r = -q - s;
    this.ax[0] = q;
    this.ax[1] = r;
  }

  private tileAt(f: number, q: number, r: number) {
    if (q < -BOX || q > BOX || r < -BOX || r > BOX) return -1;
    return this.idx[f][(q + BOX) * (2 * BOX + 1) + (r + BOX)];
  }

  /** A point (x, z) on floor f, unturned (into this.lp): where it is on the floor itself. */
  private loc(f: number, x: number, z: number) {
    const a = this.ang[f];
    if (a === 0) ((this.lp[0] = x), (this.lp[1] = z));
    else {
      const c = Math.cos(a),
        s = Math.sin(a);
      this.lp[0] = x * c - z * s;
      this.lp[1] = x * s + z * c;
    }
  }

  /** The tile of floor f round (x, z), whatever its state (-1 off the floor). */
  private nearest(f: number, x: number, z: number) {
    this.loc(f, x, z);
    this.roundAx(this.lp[0], this.lp[1]);
    return this.tileAt(f, this.ax[0], this.ax[1]);
  }

  private solid(i: number) {
    return this.st[i] <= CRACKING;
  }

  /** The tile holding up feet at (x, z) on floor f (-1: none): the one under them, or a neighbour's edge they still stand on. */
  private support(f: number, wx: number, wz: number, foot = FOOT) {
    this.loc(f, wx, wz);
    const x = this.lp[0],
      z = this.lp[1];
    this.roundAx(x, z);
    const q = this.ax[0],
      r = this.ax[1];
    const c = this.tileAt(f, q, r);
    if (c >= 0 && this.solid(c) && !this.old(c)) return c;
    // (the feet on a neighbour's edge; and clipping an old key's corner while a good tile is right
    // there doesn't count as stepping on it)
    const oldHere = c >= 0 && this.solid(c);
    let alt = -1;
    for (let k = 0; k < 6; k++) {
      const n = this.tileAt(f, q + DQ[k], r + DR[k]);
      if (n < 0 || !this.solid(n) || !inHex(x - this.lx[n], z - this.lz[n], HR + foot + (oldHere ? 0.2 : 0))) continue;
      if (!this.old(n)) return n;
      alt = n;
    }
    return oldHere ? c : alt;
  }

  private old(i: number) {
    return this.kind[i] >= RSA;
  }

  /** How long a crack lasts now for this kind of tile. */
  private crackFor(k: number) {
    const u = clamp(this.t / HARD_AT, 0, 1);
    return lerp(CRACK[k][0], CRACK[k][1], u) * this.L.crack;
  }

  /** Stepped on (or shaken by a collapse): it starts to crack. */
  private trigger(i: number, dur = this.crackFor(this.kind[i])) {
    if (this.st[i] !== UP || this.over >= 0) return;
    this.st[i] = CRACKING;
    this.ck[i] = 0;
    this.cd[i] = dur;
    this.popT[i] = 1;
    this.pend[i] = -1;
    // (only the ones near the camera's floor, and not a hundred at once)
    if (this.crackCool <= 0 && Math.abs(FY[this.tf[i]] - this.focusY) < 2) {
      this.crackCool = 0.05;
      const near = this.human >= 0 && this.pl[this.human].tile === i;
      crackS(near ? 0.5 : 0.22, this.old(i));
    }
  }

  /** It lets go (and whoever stands on it). */
  private drop(i: number, loud = 0) {
    this.st[i] = FALLING;
    this.ft[i] = 0;
    this.pend[i] = -1;
    if (loud > 0 && Math.abs(FY[this.tf[i]] - this.focusY) < 2) dropS(loud);
  }

  /** Seconds before tile i goes, as this player sees it (a beam it has noticed included). */
  private life(i: number, m: Pl) {
    let l = 99;
    const st = this.st[i];
    if (st === CRACKING) l = this.cd[i] - this.ck[i];
    else if (st !== UP) return 0;
    else if (this.pend[i] >= 0) l = this.pend[i] + C_CRACK;
    if (this.kind[i] !== MLDSA && this.beamAt[i] < 99 && this.t - this.beamFrom[i] > m.react) l = Math.min(l, this.beamAt[i] - this.t);
    return l;
  }

  /** A tile to stand on: up, not cracking, not about to go. */
  private fresh(i: number, m: Pl) {
    return this.st[i] === UP && !this.old(i) && this.life(i, m) > 0.8;
  }

  // ---- the AI --------------------------------------------------------------------------------------

  /**
   * A think: where to go next (a path over the lattice to a fresh tile with room round it), or wait
   * on this one; a shove when it pays; a fall steered onto fresh tiles.
   */
  private plan(i: number, s: number, dry = false) {
    const m = this.pl[i],
      a = m.a,
      rnd = this.rnd;
    m.think = 0.07 + (1 - s) * 0.22 + rnd() * 0.06;
    if (dry) m.react = 0.12 + (1 - s) * 0.55;
    if (!m.alive || this.over >= 0) return void (m.thr = 0);
    if (m.panic > 0) return;
    // falling to the floor below: a good one steers onto fresh ground
    if (m.fallT >= 0) {
      if (m.pn === 0 && rnd() < 0.25 + s * 0.75) {
        const L = m.level;
        const reach = 1.2 + s * 3.2;
        let best = -1,
          bs = -1e9;
        for (const t of this.list[L]) {
          const d = Math.hypot(this.tx[t] - a.pos.x, this.tz[t] - a.pos.z);
          if (d > reach || !this.fresh(t, m)) continue;
          let room = 0;
          for (let k = 0; k < 6; k++) {
            const n = this.nb[t * 6 + k];
            if (n >= 0 && this.fresh(n, m)) room++;
          }
          const sc = room - d * 0.4 + rnd() * (1 - s) * 2;
          if (sc > bs) ((bs = sc), (best = t));
        }
        if (best >= 0) ((m.path[0] = best), (m.pn = 1), (m.pi = 0));
      }
      return;
    }
    if (!a.grounded) return;
    const cur = m.tile;
    if (cur < 0) return;
    // the path still good?
    if (m.pn > 0) {
      for (let k = m.pi; k < m.pn; k++) {
        const w = m.path[k];
        const last = k === m.pn - 1;
        if (!this.solid(w) || (last && !this.fresh(w, m)) || (!last && this.life(w, m) < 0.25)) {
          m.pn = 0;
          break;
        }
      }
    }
    if (m.pn === 0) {
      const lc = this.life(cur, m);
      const urgent = lc < 0.2 + (1 - s) * 0.14 || this.old(cur);
      // waiting on its tile till the last moment is a pro's trick; a weak one keeps running about
      // (the bench's bot plays like a person: no waiting to the last frame, it keeps moving)
      const patient = !dry && rnd() < 0.2 + s * 0.75;
      if (urgent || !patient) this.pick(i, s);
    }
    this.shoveThink(i, s, dry);
  }

  /** Breadth-first over the lattice (and over gaps, with a jump) to the best fresh tile in reach. */
  private pick(i: number, s: number) {
    const m = this.pl[i],
      a = m.a,
      rnd = this.rnd;
    const cur = m.tile,
      L = m.level;
    const depth = 2 + (s > 0.45 ? 1 : 0) + (s > 0.8 ? 1 : 0);
    const gen = ++this.gen;
    let head = 0,
      tail = 0;
    this.bq[tail++] = cur;
    this.seen[cur] = gen;
    this.bdep[cur] = 0;
    this.bpar[cur] = -1;
    this.bjmp[cur] = 0;
    // (a weak one misreads an old key now and then)
    const blind = rnd() < (1 - s) * (1 - s) * 0.06;
    let best = -1,
      bs = -1e9,
      alt = -1,
      altLife = 0;
    const beamHere = this.beamOn(L) && this.t > m.react;
    while (head < tail) {
      const n = this.bq[head++];
      const d = this.bdep[n];
      if (n !== cur && !this.old(n)) {
        const l = this.life(n, m);
        if (l > altLife) ((altLife = l), (alt = n));
      }
      if (n !== cur) {
        // score it
        if (this.st[n] === UP && (!this.old(n) || blind) && this.life(n, m) > 0.8 + d * 0.3) {
          let room = 0,
            room2 = 0;
          for (let k = 0; k < 6; k++) {
            const nn = this.nb[n * 6 + k];
            if (nn < 0 || !this.fresh(nn, m)) continue;
            room++;
            if (s > 0.35)
              for (let k2 = 0; k2 < 6; k2++) {
                const n3 = this.nb[nn * 6 + k2];
                if (n3 >= 0 && n3 !== n && this.fresh(n3, m)) room2++;
              }
          }
          let sc = room * 1.0 + room2 * 0.06 * s - d * (0.7 + s * 0.4) - this.bjmp[n] * (0.9 - s * 0.5);
          if (this.kind[n] === MLDSA) sc += 0.7 + (beamHere ? 2.5 * s : 0) + (this.L.ice > 0 ? 0.8 * s : 0);
          // the rim: a shove there is a fall (a pro keeps off it; on ice, more so)
          if (this.rim[n]) sc -= (this.L.ice > 0 ? 1.7 : 1.1) * s;
          // the spin's pull: the further out, the harder it drags (a pro keeps to the hub)
          if (this.pullK[L] > 0) sc -= s * Math.hypot(this.lx[n], this.lz[n]) * (0.1 + this.pullK[L] * 2.2);
          // the collapse: the side that goes last
          if (this.pend[n] >= 0) sc += this.pend[n] * 2 * s;
          for (let j = 0; j < 4; j++) {
            const o = this.pl[j];
            if (j === i || !o.alive || o.level !== L) continue;
            const od = Math.hypot(o.a.pos.x - this.tx[n], o.a.pos.z - this.tz[n]);
            if (od < 1.2) sc -= 2.6;
            else if (od < 2.6) sc -= 0.5;
            if (o.pn > 0 && o.path[o.pn - 1] === n) sc -= 1.6;
          }
          sc += rnd() * (0.3 + (1 - s) * 2.4);
          if (sc > bs) ((bs = sc), (best = n));
        }
      }
      if (d >= depth) continue;
      for (let k = 0; k < 6; k++) {
        const nn = this.nb[n * 6 + k];
        if (nn < 0) continue;
        const ok = this.solid(nn) && (!this.old(nn) || blind) && this.life(nn, m) > 0.2 + d * 0.28;
        if (ok) {
          if (this.seen[nn] === gen) continue;
          this.seen[nn] = gen;
          this.bdep[nn] = d + 1;
          this.bpar[nn] = n;
          this.bjmp[nn] = this.bjmp[n];
          if (tail < this.bq.length) this.bq[tail++] = nn;
        } else if (d + 2 <= depth + 1 && rnd() < 0.35 + s * 0.65) {
          // over the gap, straight on: a jump
          const n2 = this.nb[nn * 6 + k];
          if (n2 < 0 || this.seen[n2] === gen || !this.solid(n2) || (this.old(n2) && !blind) || this.life(n2, m) < 0.5 + d * 0.28) continue;
          this.seen[n2] = gen;
          this.bdep[n2] = d + 2;
          this.bpar[n2] = n;
          this.bjmp[n2] = this.bjmp[n] + 1;
          if (tail < this.bq.length) this.bq[tail++] = n2;
        }
      }
    }
    // nothing fresh in reach: whatever lasts longest (a cool head), or panic
    if (best < 0 && alt >= 0 && altLife > 0.25 && rnd() < 0.35 + 0.65 * s) best = alt;
    if (best < 0) {
      // nowhere good: panic (a run and a hop, anywhere)
      const ang = rnd() * Math.PI * 2;
      m.panic = (0.35 + rnd() * 0.4) * (1.2 - s * 0.7);
      m.px = Math.cos(ang);
      m.pz = Math.sin(ang);
      // (a cool head heads for whatever still stands)
      if (rnd() < 0.5 + s * 0.5) {
        let bd = 1e9;
        for (const t of this.list[L]) {
          if (!this.solid(t) || t === cur || this.old(t)) continue;
          const d = Math.hypot(this.tx[t] - a.pos.x, this.tz[t] - a.pos.z);
          if (d < bd) ((bd = d), (m.px = (this.tx[t] - a.pos.x) / (d || 1)), (m.pz = (this.tz[t] - a.pos.z) / (d || 1)));
        }
      }
      return;
    }
    // the path, back from the goal
    let n = best,
      k = 0;
    const tmp = this.bq;
    while (n >= 0 && n !== cur && k < 8) ((tmp[512 + k++] = n), (n = this.bpar[n]));
    m.pn = k;
    m.pi = 0;
    for (let j = 0; j < k; j++) m.path[j] = tmp[512 + k - 1 - j];
  }

  /** A shove when a rival stands where a push would drop it (a pro times it; a weak one shoves for fun, or into a hole itself). */
  private shoveThink(i: number, s: number, dry: boolean) {
    const m = this.pl[i],
      a = m.a,
      rnd = this.rnd;
    if (m.cd > 0 || m.wind > 0 || m.lunge > 0 || m.knock > 0 || !a.grounded || this.t < 2.2) return;
    for (let j = 0; j < 4; j++) {
      const o = this.pl[j];
      if (j === i || !o.alive || o.level !== m.level || !o.a.grounded || o.guard > 0) continue;
      const dx = o.a.pos.x - a.pos.x,
        dz = o.a.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3 || d > REACH - 0.55) continue;
      // (the first seconds, nobody goes for the human; and a weak table picks on the human less)
      if (o.p.human && this.t < 8) continue;
      const ux = dx / d,
        uz = dz / d;
      let danger = 0;
      for (const step of [0.8, 1.6]) {
        const t = this.support(m.level, o.a.pos.x + ux * step, o.a.pos.z + uz * step);
        if (t < 0) danger += 1.5;
        else if (this.old(t)) danger += 1.2;
        else if (this.life(t, m) < 0.45) danger += 0.6;
      }
      // its own lunge: not into a hole (a weak one doesn't always look)
      const mine = this.support(m.level, a.pos.x + ux * 1.5, a.pos.z + uz * 1.5);
      if ((mine < 0 || this.old(mine)) && rnd() < 0.4 + s * 0.6) continue;
      const want = danger > 0 ? 0.1 + s * 0.5 : (1 - s) * 0.025;
      const bias = o.p.human ? 0.25 + 0.75 * s * s : 1;
      if (rnd() < want * bias) {
        // (a pro leads its target)
        const lead = 0.25 * s;
        const tx = o.a.pos.x + o.vx * lead - a.pos.x,
          tz = o.a.pos.z + o.vz * lead - a.pos.z;
        const tl = Math.hypot(tx, tz) || 1;
        if (dry) m.wantShove = true;
        else this.startShove(i, tx / tl, tz / tl, j);
        return;
      }
    }
  }

  /** Every frame, the AI's legs: along its path (a jump at a gap's edge), the panic, a dodge. */
  private steer(i: number, dt: number, s: number, dry: boolean, n = 0): void {
    const m = this.pl[i],
      a = m.a,
      rnd = this.rnd;
    if (!dry) m.wantJump = false;
    if (!m.alive || this.over >= 0) return void (m.thr = 0);
    if (m.dodge >= 0 && (m.dodge -= dt) < 0) {
      m.dodge = -1;
      if (m.tile >= 0 && this.life(m.tile, m) > 0.8) dry ? (m.wantJump = true) : this.jump(i);
    }
    if (m.panic > 0) {
      m.panic -= dt;
      m.wx = m.px;
      m.wz = m.pz;
      m.thr = 1;
      if (a.grounded && m.fallT < 0) {
        const t = this.support(m.level, a.pos.x + m.px * 0.55, a.pos.z + m.pz * 0.55);
        const gap = t < 0 || (t !== m.tile && (this.old(t) || this.life(t, m) < 0.15));
        if ((gap && rnd() < 0.3 + 0.7 * s) || rnd() < dt * 2.5 * (1 - s)) dry ? (m.wantJump = true) : this.jump(i);
      }
      return;
    }
    if (m.pn === 0 && !a.grounded && m.fallT < 0 && m.panic <= 0 && n < 3) {
      // in the air with nowhere in mind (a hop, a panic's leap): the solid tile nearest where it comes down
      const h = Math.max(0, a.pos.y - FY[m.level]);
      const tl = (a.vy + Math.sqrt(a.vy * a.vy + 2 * G * h)) / G;
      const lx = a.pos.x + m.vx * tl,
        lz = a.pos.z + m.vz * tl;
      let bd = 3.2,
        bt = -1;
      const c0 = this.nearest(m.level, lx, lz);
      const scan = (t: number) => {
        if (t < 0 || !this.solid(t) || this.old(t)) return;
        const d = Math.hypot(this.tx[t] - lx, this.tz[t] - lz) + (this.life(t, m) < tl + 0.2 ? 2 : 0);
        if (d < bd) ((bd = d), (bt = t));
      };
      if (c0 >= 0) {
        scan(c0);
        for (let k = 0; k < 6; k++) scan(this.nb[c0 * 6 + k]);
      }
      if (bt >= 0 && rnd() < 0.4 + 0.6 * s) {
        m.path[0] = bt;
        m.pn = 1;
        m.pi = 0;
        return this.steer(i, 0, s, dry, n + 1);
      }
    }
    if (m.pn === 0) {
      // waiting on its tile, till it's time to step off (checked every frame: a crack doesn't wait)
      const c = m.tile;
      if (c >= 0 && a.grounded && m.fallT < 0 && (this.life(c, m) < m.leave || this.old(c))) {
        this.pick(i, s);
        if ((m.pn > 0 || m.panic > 0) && n < 3) return this.steer(i, 0, s, dry, n + 1);
      }
      if (c >= 0 && a.grounded) {
        const dx = this.tx[c] - a.pos.x,
          dz = this.tz[c] - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.22) ((m.wx = dx / d), (m.wz = dz / d), (m.thr = Math.min(0.55, d * 1.2)));
        else m.thr = 0;
      } else m.thr = 0;
      return;
    }
    let w = m.path[m.pi];
    const last = m.pi === m.pn - 1;
    // (the way ahead went meanwhile: think again; in the air, make for whatever still stands round it)
    const gone = !this.solid(w) || (last ? this.st[w] !== UP && this.life(w, m) < 0.3 : this.life(w, m) < 0.12);
    if (gone && a.grounded && m.fallT < 0) {
      m.pn = 0;
      if (n < 3) {
        this.pick(i, s);
        if (m.pn > 0 || m.panic > 0) return this.steer(i, 0, s, dry, n + 1);
      }
      return void (m.thr = 0);
    }
    if (gone && !a.grounded && rnd() < 0.3 + 0.7 * s) {
      let bd = 1e9,
        bt = -1;
      for (let k = 0; k < 6; k++) {
        const nn = this.nb[w * 6 + k];
        if (nn < 0 || !this.solid(nn) || this.old(nn)) continue;
        const d = Math.hypot(this.tx[nn] - a.pos.x, this.tz[nn] - a.pos.z);
        if (d < bd) ((bd = d), (bt = nn));
      }
      if (bt >= 0) ((m.path[0] = bt), (m.pn = 1), (m.pi = 0), (w = bt));
    }
    const dx = this.tx[w] - a.pos.x,
      dz = this.tz[w] - a.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (a.grounded && ((last && d < 0.3) || (!last && (m.tile === w || d < 0.7)))) {
      m.pi++;
      if (m.pi >= m.pn) {
        m.pn = 0;
        m.thr = 0;
        this.patience(i, s);
        return;
      }
      return n < 4 ? this.steer(i, 0, s, dry, n + 1) : void (m.thr = 0);
    }
    m.wx = dx / d;
    m.wz = dz / d;
    m.thr = last ? clamp(d / 0.9, 0.4, 1) : 1;
    if (!a.grounded) {
      // in the air: the speed that lands it on the tile (a weak one just keeps running)
      const h = Math.max(0, a.pos.y - FY[m.level]);
      const tl = Math.max(0.08, (a.vy + Math.sqrt(a.vy * a.vy + 2 * G * h)) / G);
      const want = clamp(d / tl / (SPEED * 0.92), 0, 1);
      m.thr = lerp(m.thr, want, 0.3 + 0.7 * s);
    }
    // a gap ahead (a hole, an old key, a tile about to go): jump it (a pro on time, a weak one late or not at all)
    if (a.grounded && m.fallT < 0) {
      const sp = Math.hypot(m.vx, m.vz);
      const look = 0.3 + 0.12 * s + sp * 0.05;
      const t = this.support(m.level, a.pos.x + m.wx * look, a.pos.z + m.wz * look);
      const bad = t < 0 || (this.old(t) && t !== m.tile) || (t !== m.tile && this.life(t, m) < 0.15);
      if (bad && d > 0.6 && rnd() < 0.35 + 0.65 * s * s + (s > 0.6 ? 1 : 0)) dry ? (m.wantJump = true) : this.jump(i);
    }
  }

  /** On a new tile: how long it'll wait on it (a pro to the last safe moment; a weak one sometimes daydreams). */
  private patience(i: number, s: number) {
    const m = this.pl[i];
    m.leave = 0.3 + (1 - s) * 0.1 + this.rnd() * 0.08;
    if (this.rnd() < (1 - s) * (1 - s) * 0.08) m.leave = 0.08 + this.rnd() * 0.1;
  }

  /**
   * On ice (FROZEN LAKE), the AI's legs as a skater's: it wants a speed it can still stop from by its
   * goal, and pushes past it against the slide (a pro brakes early and counter-steers hard; a weak one
   * comes in too fast and overshoots).
   */
  private skate(i: number, s: number) {
    const m = this.pl[i],
      a = m.a,
      ice = this.L.ice;
    if (!ice || !a.grounded || m.fallT >= 0 || m.panic > 0 || !m.alive || m.knock > 0 || this.over >= 0) return;
    const sp = SPEED * (m.p.human ? 1 : 0.83 + 0.15 * m.p.skill);
    let vx = m.wx * m.thr * sp,
      vz = m.wz * m.thr * sp;
    const w = m.pn > 0 ? m.path[m.pi] : m.tile;
    if (w >= 0 && (m.pn === 0 || m.pi === m.pn - 1)) {
      const d = Math.hypot(this.tx[w] - a.pos.x, this.tz[w] - a.pos.z);
      const cap = d * ice * (0.75 + (1 - s) * 0.9) + 0.4;
      const l = Math.hypot(vx, vz);
      if (l > cap) ((vx *= cap / l), (vz *= cap / l));
    }
    const g = 0.3 + 1.3 * s;
    vx += (vx - m.vx) * g;
    vz += (vz - m.vz) * g;
    const l = Math.hypot(vx, vz);
    if (l < 0.15) return void (m.thr = 0);
    m.wx = vx / l;
    m.wz = vz / l;
    m.thr = Math.min(1, l / sp);
  }

  /** The grip under its feet: today's, or ice's (a frosted ORCHARD tile grips; your skates bite a little better than the rivals', as your feet get more grace on an edge). */
  private grip(m: Pl) {
    return this.L.ice > 0 && !(m.tile >= 0 && this.kind[m.tile] === MLDSA) ? this.L.ice * (m.p.human ? ICE_H : 1) : ACC;
  }

  /** The decks turn (SPIN STATION), faster as the game goes on: their spin, their pull, the tiles where they are now. */
  private spinTick(dt: number) {
    const L = this.L;
    if (L.pull <= 0) return;
    const k = clamp(this.t / SPIN_IN, 0, 1) * lerp(1, L.spinUp, clamp(this.t / LIMIT, 0, 1));
    for (let f = 0; f < NF; f++) {
      this.om[f] = L.spin[f] * k;
      this.pullK[f] = L.pull * k * k;
      this.ang[f] = (this.ang[f] + this.om[f] * dt) % (Math.PI * 2);
      this.cs[f] = Math.cos(this.ang[f]);
      this.sn[f] = Math.sin(this.ang[f]);
    }
    for (let i = 0; i < this.N; i++) {
      const f = this.tf[i],
        c = this.cs[f],
        s = this.sn[f];
      this.tx[i] = this.lx[i] * c + this.lz[i] * s;
      this.tz[i] = -this.lx[i] * s + this.lz[i] * c;
    }
  }

  /** A burst at each one still up (an announcement's flourish). */
  private puffs(c: string, n: number) {
    for (const m of this.pl) if (m.alive && Math.abs(m.a.pos.y - this.focusY) < 3) this.fx.burst(this.v.set(m.a.pos.x, m.a.pos.y + 0.2, m.a.pos.z), n, [c, "#ffffff"], { speed: 3.5, up: 3, gravity: 8, size: 0.16, life: 0.6, drag: 1.5 });
  }

  // ---- the moves -----------------------------------------------------------------------------------

  private jump(i: number) {
    const m = this.pl[i],
      a = m.a;
    if (m.knock > 0 || m.wind > 0 || m.lunge > 0) return false;
    if (a.grounded || (m.coyote > 0 && m.fallT < 0 && a.vy <= 0)) {
      a.vy = JUMP_V;
      a.grounded = false;
      a.body.jump();
      m.coyote = 0;
      m.buf = 0;
      m.jumps++;
      m.jumped = true;
      if (m.p.human) beep(330, 620, 0.12, 0.18, "triangle");
      this.fx.burst(this.v.set(a.pos.x, a.pos.y + 0.05, a.pos.z), 6, ["#ffffff", "#e8e0ff"], { speed: 2, up: 1, gravity: 4, size: 0.15, life: 0.35, drag: 3 });
      return true;
    }
    return false;
  }

  private startShove(i: number, dx: number, dz: number, at = -1) {
    const m = this.pl[i];
    m.shoveAt = at;
    m.wind = WIND;
    m.sx = dx;
    m.sz = dz;
    m.cd = SHOVE_CD;
    this.stats.shoves++;
    if (m.p.human) beep(220, 330, 0.12, 0.16, "square");
    // the ones it's aimed at see it coming (a pro hops in time)
    for (let j = 0; j < 4; j++) {
      const o = this.pl[j];
      if (j === i || o.p.human || !o.alive || o.level !== m.level) continue;
      const rx = o.a.pos.x - m.a.pos.x,
        rz = o.a.pos.z - m.a.pos.z;
      const rd = Math.hypot(rx, rz) || 1;
      const safe = o.tile >= 0 && this.life(o.tile, o) > 1.05;
      if (safe && rd < REACH + 0.6 && (rx * dx + rz * dz) / rd > 0.6 && this.rnd() < o.p.skill * 0.8) o.dodge = 0.04 + (1 - o.p.skill) * 0.22 + this.rnd() * 0.05;
    }
  }

  /** The lunge meets j: it slides off, flailing. */
  private shoved(i: number, j: number) {
    const m = this.pl[i],
      o = this.pl[j];
    const k = o.p.human ? 0.85 : 1;
    o.vx = m.sx * KNOCK_V * k + o.vx * 0.2;
    o.vz = m.sz * KNOCK_V * k + o.vz * 0.2;
    o.knock = KNOCK_T;
    o.guard = GUARD;
    o.wind = 0;
    o.lunge = 0;
    o.pn = 0;
    o.by = i;
    o.byAt = this.t;
    o.spin = (Math.random() < 0.5 ? -1 : 1) * 9;
    o.a.hit();
    m.lunge = 0;
    m.rec = REC;
    m.vx *= -0.2;
    m.vz *= -0.2;
    this.stats.hits++;
    const x = (m.a.pos.x + o.a.pos.x) / 2,
      z = (m.a.pos.z + o.a.pos.z) / 2,
      y = o.a.pos.y + 1.2;
    this.pow(x, y, z, 1.4);
    this.fx.burst(this.v.set(x, y, z), 16, ["#ffffff", "#ffe0b8", m.p.color], { speed: 6, up: 3, size: 0.17, life: 0.6 });
    const near = m.p.human || o.p.human;
    this.cam.shake(near ? 0.4 : 0.14);
    sfx.hit();
    if (near) sfx.thud();
  }

  private pow(x: number, y: number, z: number, s: number) {
    let p = this.pows[0];
    for (const q of this.pows) if (q.t > p.t) p = q;
    p.t = 0;
    p.s = s;
    p.m.position.set(x, y, z);
    p.m.visible = true;
  }

  // ---- the frame -----------------------------------------------------------------------------------

  update(dt: number, input: Input) {
    // (the bench can run the game several steps a frame: &lff=3)
    for (let k = 0; k < this.ff; k++) this.step(dt, input);
  }

  private step(dt: number, input: Input) {
    dt = Math.max(0, Math.min(dt, 0.05));
    if (!this.started) this.started = true;
    this.clock += dt;
    this.crackCool -= dt;
    if (this.over < 0) this.t = Math.min(LIMIT, this.t + dt);
    else if ((this.over += dt) > 0.45 && !this.done) this.done = this.order;
    if (this.over < 0) this.events(dt);
    this.spinTick(dt);
    // the controls: your arrows (screen-relative: the camera looks down -z), A, B; the AIs' minds
    for (let i = 0; i < 4; i++) {
      const m = this.pl[i];
      if (m.p.human) {
        if (this.botSkill >= 0) {
          // (the bench's bot: the AI's advice, pressed through the keys by the bot)
          if ((m.think -= dt) <= 0) this.plan(i, this.botSkill, true);
          this.steer(i, dt, this.botSkill, true);
          this.skate(i, this.botSkill);
          m.bx = m.wx;
          m.bz = m.wz;
          m.bt = m.thr;
        }
        const ax = input.axis();
        const l = Math.hypot(ax.x, ax.y);
        m.wx = l ? ax.x / l : 0;
        m.wz = l ? ax.y / l : 0;
        m.thr = l ? 1 : 0;
        if (m.alive && this.over < 0) {
          if (input.pressed("a")) m.buf = BUFFER;
          if (input.pressed("b")) m.bufB = BUFFER_B;
          if (m.bufB > 0 && m.cd <= 0 && m.wind <= 0 && m.lunge <= 0 && m.knock <= 0 && m.a.grounded) ((m.bufB = 0), this.humanShove(i));
        }
      } else {
        if ((m.think -= dt) <= 0) this.plan(i, m.p.skill);
        this.steer(i, dt, m.p.skill, false);
        this.skate(i, m.p.skill);
      }
    }
    for (let i = 0; i < 4; i++) this.move(i, dt);
    this.collide();
    this.tilesTick(dt);
    this.beamsTick(dt);
    this.decide();
    if (this.news.length && (this.news[0].t += dt) > this.news[0].d) this.news.shift();
    if (this.news.length > 3) this.news.splice(1, this.news.length - 3);
    this.look(dt);
  }

  /** The timeline: EXPOSURE and the beams, the floors that go on their own, the announcer. */
  private events(dt: number) {
    const t = this.t;
    // the TRACKER BEAMs
    if (t >= this.nextBeam) {
      const first = this.beamCount === 0;
      const f = this.beamFloor(-1);
      if (f >= 0 && this.startBeam(f)) {
        if (first) {
          this.say(T("EXPOSURE!", "曝光了！"), "#ff6b35", 2.2, T("The TRACKER BEAM breaks every tile but ORCHARD", "追踪光束击碎一切地砖，ORCHARD 除外"));
          // (a siren, the arena shudders)
          beep(520, 1040, 0.32, 0.1, "square");
          beep(520, 1040, 0.32, 0.1, "square", 0.38);
          this.cam.shake(0.3);
        }
        if (t >= DOUBLE_AT) {
          if (!this.said.double) ((this.said.double = true), this.say(T("DOUBLE TRACKER!", "双重追踪！"), "#ff6b35", 1.4));
          const f2 = this.beamFloor(f);
          this.startBeam(f2 >= 0 ? f2 : f);
        }
      }
      this.nextBeam = t + lerp(GAP[0], GAP[1], clamp((t - QDAY) / 35, 0, 1)) * (0.85 + this.rnd() * 0.3);
    }
    // the floors that go on their own
    for (let f = 0; f < 2; f++) {
      const c = this.collapse[f];
      let anyone = false;
      for (const m of this.pl) if (m.alive && m.level <= f) anyone = true;
      if (!c.warned && t >= c.at - C_WARN) {
        c.warned = true;
        if (anyone) this.say(f === 0 ? T("TOP FLOOR FALLING!", "顶层要塌了！") : T("MIDDLE FLOOR FALLING!", "中层要塌了！"), "#ff5a4a", 1.8);
      }
      if (c.warned && !c.fell) {
        if ((this.alarm -= dt) <= 0 && anyone && Math.abs(FY[f] - this.focusY) < 2) ((this.alarm = 0.42 - clamp((t - c.at + C_WARN) / C_WARN, 0, 1) * 0.28), sfx.tick());
      }
      if (!c.fell && t >= c.at) {
        c.fell = true;
        // a ripple across, from a random side
        const a = this.rnd() * Math.PI * 2;
        const ux = Math.cos(a),
          uz = Math.sin(a);
        const R = this.ext[f] - HR + 1;
        for (const i of this.list[f]) {
          if (this.st[i] !== UP) continue;
          const p = (this.lx[i] * ux + this.lz[i] * uz + R) / (2 * R);
          this.pend[i] = clamp(p, 0, 1) * RIPPLE;
        }
        if (Math.abs(FY[f] - this.focusY) < 2) {
          this.cam.shake(0.45);
          sfx.thud();
          dropS(0.6);
          // dust off the rim, all round
          let k = 0;
          for (const i of this.list[f]) if (this.rim[i] && this.st[i] === UP && k++ % 3 === 0) this.shards.burst(this.tx[i], FY[f] - 0.2, this.tz[i], 3, this.col.set(this.L.floorC[f]), 0.6, 3, 0.22, 2);
        }
      }
    }
    if (!this.said.intro && t >= 0.25 && this.L.intro) {
      const n = this.L.intro;
      this.said.intro = true;
      this.say(T(n.s, n.zh), n.c, 2.2, T(n.sub, n.subZh));
      beep(880, 1320, 0.16, 0.1, "triangle");
      beep(1320, 1760, 0.22, 0.09, "triangle", 0.12);
      this.cam.shake(0.12);
      this.puffs(this.L.glowC[0], 10);
    }
    if (!this.said.faster && t >= 30) {
      this.said.faster = true;
      this.say(this.L.pull > 0 ? T("SPIN UP!", "转得更快了！") : T("FASTER!", "更快了！"), "#ffd23f", 1.2);
      sfx.whoosh();
      this.cam.shake(0.2);
      this.puffs("#ffd23f", 8);
    }
    // the last stretch (ten seconds to go, or two left): the music picks up
    if (!this.said.music && (t >= LIMIT - 10 || this.said.two)) ((this.said.music = true), music.rate(1.15));
  }

  /** The floor for a beam: where the players are (most often yours); -1: nobody up. */
  private beamFloor(not: number) {
    const n = [0, 0, 0];
    for (const m of this.pl) if (m.alive && m.fallT < 0 && m.a.grounded) n[m.level]++;
    const h = this.human >= 0 ? this.pl[this.human] : null;
    if (h && h.alive && h.fallT < 0 && h.level !== not && !this.collapsing(h.level) && this.rnd() < 0.55) return h.level;
    let best = -1,
      bn = 0;
    for (let f = 0; f < NF; f++) if (f !== not && n[f] > bn && !this.collapsing(f)) ((bn = n[f]), (best = f));
    return best;
  }

  private collapsing(f: number) {
    return f < 2 && this.collapse[f].fell;
  }

  private beamOn(f: number) {
    for (const b of this.beams) if (b.on && !b.fired && b.f === f) return true;
    return false;
  }

  /** A beam over floor f: a line (one of the lattice's three axes) through a player there, or next to them. */
  private startBeam(f: number) {
    const b = this.beams.find((x) => !x.on);
    if (!b) return false;
    const on = this.pl.filter((m) => m.alive && m.level === f && m.fallT < 0);
    if (!on.length) return false;
    for (let tries = 0; tries < 6; tries++) {
      const who = on[Math.floor(this.rnd() * on.length)];
      this.loc(f, who.a.pos.x, who.a.pos.z);
      this.roundAx(this.lp[0], this.lp[1]);
      const axis = Math.floor(this.rnd() * 3);
      const off = Math.floor(this.rnd() * 3) - 1;
      const q0 = this.ax[0] + (axis === 0 ? off : 0),
        r0 = this.ax[1] + (axis === 1 ? off : 0),
        s0 = -this.ax[0] - this.ax[1] + (axis === 2 ? off : 0);
      // the line's way: constant q runs along z; constant r along (1.5, √3/2); constant s along (1.5, -√3/2)
      const dx = axis === 0 ? 0 : 0.866,
        dz = axis === 0 ? 1 : axis === 1 ? 0.5 : -0.5;
      b.n = 0;
      let lo = 1e9,
        hi = -1e9;
      for (const i of this.list[f]) {
        const q = this.tq[i],
          r = this.tr[i];
        if ((axis === 0 && q !== q0) || (axis === 1 && r !== r0) || (axis === 2 && -q - r !== s0)) continue;
        if (b.n >= b.tiles.length) break;
        const p = this.lx[i] * dx + this.lz[i] * dz;
        b.tiles[b.n] = i;
        b.at[b.n++] = p;
        lo = Math.min(lo, p);
        hi = Math.max(hi, p);
      }
      if (b.n < 5) continue;
      // sweep from the end nearer the camera's left, sorted along the line
      for (let x = 1; x < b.n; x++)
        for (let y = x; y > 0 && b.at[y - 1] > b.at[y]; y--) {
          const ta = b.tiles[y],
            pa = b.at[y];
          b.tiles[y] = b.tiles[y - 1];
          b.at[y] = b.at[y - 1];
          b.tiles[y - 1] = ta;
          b.at[y - 1] = pa;
        }
      const i0 = b.tiles[0];
      const cx = this.lx[i0] - dx * b.at[0],
        cz = this.lz[i0] - dz * b.at[0];
      b.on = true;
      b.f = f;
      b.t = 0;
      b.fired = false;
      b.hit = 0;
      b.warn = lerp(WARN[0], WARN[1], clamp((this.t - QDAY) / 35, 0, 1));
      b.dx = dx;
      b.dz = dz;
      b.x0 = cx + dx * (lo - 2.2);
      b.z0 = cz + dz * (lo - 2.2);
      b.len = hi - lo + 4.4;
      for (let k = 0; k < b.n; k++) {
        const i = b.tiles[k];
        this.beamFrom[i] = this.t;
        this.beamAt[i] = this.t + b.warn + (SWEEP * (b.at[k] - lo + 2.2)) / b.len;
      }
      // the look: the stripe, the probes at both ends
      b.group.visible = true;
      this.placeBeam(b);
      b.strip.scale.set(b.len - 2.6, HR * 1.75, 1);
      b.strip.position.set(b.len / 2, 0.06, 0);
      b.stripTex.repeat.set((b.len - 2.6) / 1.6, 1);
      b.ems[0].position.set(0, 1.4, 0);
      b.ems[1].position.set(b.len, 1.4, 0);
      b.core.visible = b.halo.visible = false;
      this.beamCount++;
      this.stats.beams++;
      const near = Math.abs(FY[f] - this.focusY) < 2;
      if (near) {
        const o = beep(140, 700, b.warn, 0.09, "sawtooth");
        if (o) this.charges.push(o);
      }
      return true;
    }
    return false;
  }

  /** A beam's look where its line is now (on a turning deck, it turns with it). */
  private placeBeam(b: Beam) {
    const a = this.ang[b.f],
      c = Math.cos(a),
      s = Math.sin(a);
    b.group.position.set(b.x0 * c + b.z0 * s, FY[b.f], -b.x0 * s + b.z0 * c);
    b.group.rotation.y = Math.atan2(-b.dz, b.dx) + a;
  }

  private beamsTick(dt: number) {
    for (const b of this.beams) {
      if (!b.on) continue;
      b.t += dt;
      const near = Math.abs(FY[b.f] - this.focusY) < 2;
      if (!b.fired && b.t >= b.warn) {
        b.fired = true;
        if (near) (zapS(0.55), this.cam.shake(0.3));
      }
      if (b.fired) {
        // the front runs down the line; every tile it passes breaks, but ORCHARD
        const k = clamp((b.t - b.warn) / SWEEP, 0, 1);
        const front = k * b.len;
        const lo = b.at[0] - 2.2;
        while (b.hit < b.n && b.at[b.hit] - lo <= front) {
          const i = b.tiles[b.hit++];
          this.beamFrom[i] = this.beamAt[i] = 99;
          if (this.over >= 0) continue;
          const y = FY[b.f];
          if (this.kind[i] === MLDSA && this.solid(i)) {
            this.shield[i] = 1;
            if (near) tingS(0.6);
            this.fx.burst(this.v.set(this.tx[i], y + 0.3, this.tz[i]), 10, ["#c4b1fc", "#ffffff"], { speed: 3, up: 3, size: 0.14, life: 0.5 });
          } else if (this.solid(i)) {
            this.drop(i);
            this.cause[i] = 1;
            this.ft[i] = SHATTER * 0.6;
            this.col.setRGB(this.base[i * 3], this.base[i * 3 + 1], this.base[i * 3 + 2]);
            this.shards.burst(this.tx[i], y - 0.1, this.tz[i], this.old(i) ? 12 : 8, this.col, 0.7, 6, 0.3, 4.5);
            this.fx.burst(this.v.set(this.tx[i], y + 0.4, this.tz[i]), 6, ["#ffffff", "#ff6b35", "#ffd0a0"], { speed: 4, up: 4, size: 0.16, life: 0.5 });
            if (near && b.hit % 2 === 0) shatterS(0.35);
          }
        }
        if (b.t >= b.warn + SWEEP + 0.35) {
          b.on = false;
          b.group.visible = false;
        }
      }
    }
  }

  /** Arrows and A for you; B shoves where you face (or at a rival right there). */
  private humanShove(i: number) {
    const m = this.pl[i];
    let dx = Math.sin(m.a.yaw),
      dz = Math.cos(m.a.yaw);
    if (m.thr > 0) ((dx = m.wx), (dz = m.wz));
    // (a little aim: the rival nearest that way, if close)
    let best = -1,
      bd = REACH + 0.8;
    for (let j = 0; j < 4; j++) {
      const o = this.pl[j];
      if (j === i || !o.alive || o.level !== m.level) continue;
      const rx = o.a.pos.x - m.a.pos.x,
        rz = o.a.pos.z - m.a.pos.z;
      const d = Math.hypot(rx, rz);
      if (d < bd && d > 0.01 && (rx * dx + rz * dz) / d > 0.55) ((bd = d), (best = j));
    }
    if (best >= 0) {
      const o = this.pl[best];
      const rx = o.a.pos.x - m.a.pos.x,
        rz = o.a.pos.z - m.a.pos.z;
      const d = Math.hypot(rx, rz) || 1;
      dx = rx / d;
      dz = rz / d;
    }
    this.startShove(i, dx, dz, best);
  }

  /** A lunge where it is now: the first rival it meets is shoved (true). */
  private lungeMeets(i: number) {
    const m = this.pl[i],
      a = m.a;
    for (let j = 0; j < 4; j++) {
      const o = this.pl[j];
      if (j === i || !o.alive || o.level !== m.level || o.guard > 0) continue;
      const rx = o.a.pos.x - a.pos.x,
        rz = o.a.pos.z - a.pos.z;
      const d = Math.hypot(rx, rz);
      // (a hop dodges it)
      if (d < CONTACT && Math.abs(o.a.pos.y - a.pos.y) < 0.55 && (rx * m.sx + rz * m.sz) / (d || 1) > 0.2) {
        this.shoved(i, j);
        return true;
      }
    }
    return false;
  }

  /** One player's frame: the run, the jump, the shove, gravity, the floor under it, the falls. */
  private move(i: number, dt: number) {
    const m = this.pl[i],
      a = m.a;
    if (m.gone) return;
    m.cd = Math.max(0, m.cd - dt);
    m.knock = Math.max(0, m.knock - dt);
    m.guard = Math.max(0, m.guard - dt);
    m.rec = Math.max(0, m.rec - dt);
    m.buf = Math.max(0, m.buf - dt);
    m.bufB = Math.max(0, m.bufB - dt);
    m.squash = Math.max(0, m.squash - dt * 4);
    m.pop = Math.max(0, m.pop - dt);
    const live = m.alive && this.over < 0;
    // the shove's phases (the wind-up keeps its aim on the one it was meant for, if still in front)
    if (m.wind > 0 && m.shoveAt >= 0) {
      const o = this.pl[m.shoveAt];
      const rx = o.a.pos.x - a.pos.x,
        rz = o.a.pos.z - a.pos.z;
      const d = Math.hypot(rx, rz);
      if (o.alive && d > 0.2 && d < REACH + 1 && (rx * m.sx + rz * m.sz) / d > 0.5) ((m.sx = rx / d), (m.sz = rz / d));
    }
    if (m.wind > 0 && (m.wind -= dt) <= 0) {
      m.wind = 0;
      m.lunge = LUNGE_T;
      if (Math.abs(a.pos.y - this.focusY) < 3) sfx.whoosh();
    }
    if (m.lunge > 0) {
      const left = Math.min(dt, m.lunge);
      m.lunge -= dt;
      // (the frame it ends on: the stretch it still had, and whoever stands at its far end; so it
      // carries and reaches as far at any frame rate)
      if (!this.lungeMeets(i) && m.lunge <= 0) {
        a.pos.x += m.sx * LUNGE_V * left;
        a.pos.z += m.sz * LUNGE_V * left;
        this.lungeMeets(i);
      }
      if (m.lunge <= 0) ((m.lunge = 0), (m.rec = Math.max(m.rec, REC)));
    }
    // the run
    let thr = live ? m.thr : 0;
    if (m.wind > 0) thr *= 0.15;
    if (m.rec > 0) thr *= 0.4;
    const sp = SPEED * (m.p.human ? 1 : 0.83 + 0.15 * m.p.skill);
    if (m.lunge > 0) {
      m.vx = m.sx * LUNGE_V;
      m.vz = m.sz * LUNGE_V;
    } else {
      let k = a.grounded ? this.grip(m) : this.L.ice > 0 ? AIR_ACC * 0.65 : AIR_ACC;
      if (m.knock > 0) ((k = 3), (thr *= 0.2));
      if (!live) k = a.grounded ? 8 : 0.6;
      const f = 1 - Math.exp(-k * dt);
      const tx = m.wx * thr * sp,
        tz = m.wz * thr * sp;
      m.vx += (tx - m.vx) * f;
      m.vz += (tz - m.vz) * f;
      // (on ice, a skid sprays frost from the feet)
      if (this.L.ice > 0 && a.grounded && live && k < ACC && (m.skid -= dt) <= 0 && Math.hypot(tx - m.vx, tz - m.vz) > 2.6 && Math.abs(a.pos.y - this.focusY) < 3) {
        m.skid = 0.06;
        if (m.p.human && this.clock - this.skidS > 0.2) ((this.skidS = this.clock), hiss(0.16, 0.045, "highpass", 4200, 0.7));
        this.fx.burst(this.v.set(a.pos.x, a.pos.y + 0.08, a.pos.z), 2, ["#ffffff", "#cdeeff"], { speed: 1.6, up: 1.4, gravity: 8, size: 0.13, life: 0.4, drag: 2, dir: this.v2.set(m.vx * 0.3, 0, m.vz * 0.3) });
      }
    }
    a.pos.x += m.vx * dt;
    a.pos.z += m.vz * dt;
    // a turning deck carries whoever is on it (or over it, in a hop) round with it; its spin pulls them out toward the rim
    const om = this.om[m.level];
    if (om !== 0 && m.fallT < 0 && a.pos.y > FY[m.level] - 0.3) {
      const da = om * dt,
        c = Math.cos(da),
        s = Math.sin(da);
      const x = a.pos.x,
        z = a.pos.z;
      a.pos.x = x * c + z * s;
      a.pos.z = -x * s + z * c;
      a.yaw += da;
      if (a.grounded && live) {
        const pk = this.pullK[m.level] * dt;
        a.pos.x += x * pk;
        a.pos.z += z * pk;
      }
    }
    // the jump (a press a moment early still counts, and a moment after the edge)
    if (live && m.buf > 0) this.jump(i);
    // gravity and the floor
    const L = m.level,
      y0 = FY[L];
    let fl: number | null = null;
    m.tile = -1;
    if (a.pos.y >= y0 - 0.02 && !m.gone) {
      // (your feet get a little more grace on an edge than the rivals', as a platformer's do)
      const t = this.support(L, a.pos.x, a.pos.z, m.p.human ? FOOT_H : FOOT);
      if (t >= 0) ((fl = y0), (m.tile = t));
    }
    const wasG = a.grounded,
      vy0 = a.vy;
    a.physics(dt, fl, G);
    if (a.grounded) {
      m.coyote = COYOTE;
      m.lastTile = m.tile;
      m.jumped = false;
      if (!wasG) this.landed(i, -vy0);
      if (m.tile >= 0 && live) {
        const was = this.st[m.tile];
        this.trigger(m.tile);
        // (a tile starting to crack under feet spits a few chips)
        if (was === UP && this.st[m.tile] === CRACKING && Math.abs(FY[L] - this.focusY) < 2) {
          const t = m.tile;
          this.col.setRGB(this.base[t * 3], this.base[t * 3 + 1], this.base[t * 3 + 2]);
          this.fx.burst(this.v.set(a.pos.x, y0 + 0.06, a.pos.z), 3, [this.col.getHex(), "#ffffff", "#ffd0a0"], { speed: 2.2, up: 1.6, gravity: 12, size: 0.12, life: 0.4, drag: 2 });
        }
      }
    } else {
      m.coyote -= dt;
      if (wasG && a.vy <= 0 && m.fallT < 0 && !m.gone) {
        // (just lost its footing: which hole it goes through)
        const h = this.nearest(L, a.pos.x, a.pos.z);
        m.hole = h >= 0 && !this.solid(h) ? h : -1;
      }
    }
    // through the hole: kept inside it while the body passes the tile's thickness
    if (!a.grounded && m.hole >= 0) {
      const hy = FY[this.tf[m.hole]];
      if (a.pos.y < hy - 0.02 && a.pos.y > hy - TH - 1.9 * SCALE) {
        const dx = a.pos.x - this.tx[m.hole],
          dz = a.pos.z - this.tz[m.hole];
        const d = Math.hypot(dx, dz);
        const lim = HR - 0.34;
        if (d > lim) ((a.pos.x = this.tx[m.hole] + (dx / d) * lim), (a.pos.z = this.tz[m.hole] + (dz / d) * lim));
      } else if (a.pos.y <= hy - TH - 1.9 * SCALE) m.hole = -1;
    }
    if (!a.grounded && a.pos.y < y0 - 0.3) {
      if (L < NF - 1) {
        // past this floor: falling to the next
        m.level = L + 1;
        if (m.fallT < 0) (this.why(i, L), this.fell(i));
        if (m.hole < 0) {
          const h = this.nearest(L, a.pos.x, a.pos.z);
          m.hole = h >= 0 && !this.solid(h) ? h : -1;
        }
      } else if (m.alive && a.pos.y < y0 - 2.2) (m.fallT < 0 && this.why(i, L), this.eliminate(i));
    }
    if (m.fallT >= 0) m.fallT += dt;
    if (!m.alive && a.pos.y < CITY_Y + 18) ((m.gone = true), (a.root.visible = false), this.arrows[i] && (this.arrows[i].visible = false));
  }

  /** (the bench: why it fell) */
  private why(i: number, f: number) {
    const m = this.pl[i];
    const lt = m.lastTile;
    let r = "hole";
    if (this.t - m.byAt < 1.2) r = "shove";
    else if (lt >= 0 && this.st[lt] >= FALLING) r = this.cause[lt] === 1 ? "beam" : this.cause[lt] === 2 ? "collapse" : this.old(lt) ? "old" : m.jumped ? "jumpback" : "late";
    else if (m.jumped) r = "jump";
    else if (this.nearest(f, m.a.pos.x, m.a.pos.z) < 0) r = "edge";
    const w = m.pn > 0 ? m.path[Math.min(m.pi, m.pn - 1)] : -1;
    const det = w >= 0 ? `${m.pi}/${m.pn}:${Math.hypot(this.tx[w] - m.a.pos.x, this.tz[w] - m.a.pos.z).toFixed(1)}:${Math.hypot(m.vx, m.vz).toFixed(1)}:${this.st[w]}` : "";
    this.stats.why.push(`${i}@${f}:${r}@${this.t.toFixed(1)}${m.panic > 0 ? "P" : m.pn > 0 ? "W" + det : "S"}`);
  }

  /** Off a floor, on the way to the next: a scream, a whistle, the arms up. */
  private fell(i: number) {
    const m = this.pl[i];
    m.fallT = 0;
    m.pn = 0;
    m.panic = 0;
    m.think = 0.05 + (1 - m.p.skill) * 0.25;
    if (m.p.human || Math.abs(m.a.pos.y - this.focusY) < 4) whistleS(m.p.human ? 0.16 : 0.07);
  }

  private landed(i: number, v: number) {
    const m = this.pl[i],
      a = m.a;
    const big = m.fallT >= 0 || v > 14;
    const wasFall = m.fallT >= 0;
    m.fallT = -1;
    m.hole = -1;
    m.squash = big ? 1 : 0.4;
    this.fx.burst(this.v.set(a.pos.x, a.pos.y + 0.1, a.pos.z), big ? 18 : 5, ["#ffffff", "#f1e8ff", this.L.floorC[m.level]], { speed: big ? 5 : 2, up: big ? 2.5 : 1, gravity: 6, size: big ? 0.22 : 0.15, life: big ? 0.6 : 0.35, drag: 3 });
    if (!m.p.human) this.patience(i, m.p.skill);
    else if (this.botSkill >= 0) this.patience(i, this.botSkill);
    if (wasFall) {
      this.stats.floorAt[i][m.level] = this.t;
      m.pop = 1.4;
      m.popS = `${3 - m.level}F`;
      if (m.p.human) {
        this.cam.shake(0.45);
        sfx.thud();
        if (m.level === NF - 1 && !this.said.last) ((this.said.last = true), this.say(T("LAST FLOOR!", "最后一层！"), "#ff6b35", 1.5));
      } else if (Math.abs(a.pos.y - this.focusY) < 2) sfx.thud();
    }
    // everyone left on the bottom floor: the last one
    if (!this.said.last && this.pl.every((o) => !o.alive || (o.level === NF - 1 && o.fallT < 0))) ((this.said.last = true), this.say(T("LAST FLOOR!", "最后一层！"), "#ff6b35", 1.5));
  }

  private eliminate(i: number) {
    const m = this.pl[i];
    m.alive = false;
    m.outT = this.t;
    m.a.out = true;
    m.a.hit();
    m.spin = (Math.random() < 0.5 ? -1 : 1) * 7;
    this.stats.outAt[i] = this.t;
    if (this.over >= 0) return;
    this.out.push(i);
    const credit = m.by >= 0 && this.t - m.byAt < 2.5 ? m.by : -1;
    this.say(m.p.human ? T("YOU'RE OUT!", "你出局了！") : T(`${short(m.p)} OUT!`, `${short(m.p)} 出局！`), m.p.color, 1.3, undefined, true);
    // a puff and stars where it went over
    this.fx.burst(this.v.set(m.a.pos.x, m.a.pos.y + 1, m.a.pos.z), 22, [m.p.color, "#ffffff", "#ffe08a"], { speed: 6, up: 5, gravity: 9, size: 0.22, life: 0.9, drag: 1.2 });
    this.pow(m.a.pos.x, m.a.pos.y + 1.4, m.a.pos.z, 1.8);
    if (credit >= 0 && this.pl[credit].p.human) this.say(T("NICE SHOVE!", "推得漂亮！"), this.players[credit].color, 1.0);
    const left = this.pl.filter((o) => o.alive).length;
    if (left === 2 && !this.said.two) ((this.said.two = true), this.say(T("2 LEFT!", "只剩两个！"), "#ffd23f", 1.3), sfx.star());
    // (the last one standing: no more news, the finish takes over)
    if (left <= 1) this.news.length = 0;
    this.cam.shake(m.p.human ? 0.5 : 0.2);
    if (m.p.human) sfx.lose();
    else sfx.whoosh();
  }

  /** Bodies bump (on the same floor, at about the same height). */
  private collide() {
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const a = this.pl[i],
          b = this.pl[j];
        if (!a.alive || !b.alive || a.level !== b.level || Math.abs(a.a.pos.y - b.a.pos.y) > 1.2) continue;
        const dx = b.a.pos.x - a.a.pos.x,
          dz = b.a.pos.z - a.a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d >= PR * 2 || d < 1e-4) continue;
        const nx = dx / d,
          nz = dz / d,
          lap = (PR * 2 - d) / 2;
        a.a.pos.x -= nx * lap;
        a.a.pos.z -= nz * lap;
        b.a.pos.x += nx * lap;
        b.a.pos.z += nz * lap;
        const vr = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (vr > 0) {
          a.vx -= nx * vr * 0.5;
          a.vz -= nz * vr * 0.5;
          b.vx += nx * vr * 0.5;
          b.vz += nz * vr * 0.5;
        }
      }
  }

  /** The tiles' clocks: cracks run out, drops burst into shards, collapses ripple on. */
  private tilesTick(dt: number) {
    const frozen = this.over >= 0;
    for (let i = 0; i < this.N; i++) {
      const st = this.st[i];
      this.popT[i] = Math.max(0, this.popT[i] - dt * 5);
      this.shield[i] = Math.max(0, this.shield[i] - dt * 2.2);
      if (st === UP) {
        if (this.pend[i] >= 0 && !frozen && (this.pend[i] -= dt) < 0) {
          this.trigger(i, this.kind[i] === MLDSA ? C_CRACK * 1.7 : this.old(i) ? 0.12 : C_CRACK);
          this.cause[i] = 2;
        }
      } else if (st === CRACKING) {
        if (!frozen && (this.ck[i] += dt) >= this.cd[i]) this.drop(i, this.pl.some((m) => m.tile === i) ? 0.4 : 0.12);
      } else if (st === FALLING) {
        this.ft[i] += dt;
        if (this.ft[i] >= SHATTER) {
          this.st[i] = GONE;
          const y = FY[this.tf[i]] - 0.5 * G * SHATTER * SHATTER;
          this.col.setRGB(this.base[i * 3], this.base[i * 3 + 1], this.base[i * 3 + 2]).lerp(HOT, 0.35);
          if (this.alpha[this.tf[i]] > 0.5) this.shards.burst(this.tx[i], y, this.tz[i], 7, this.col, 0.75, 2.5, 0.28, 2.5);
        }
      }
    }
  }

  /** Decided: one left (on its feet), nobody, or the time is up (the ones still up by floor, then by the fresh tiles round them). */
  private decide() {
    if (this.over >= 0) return;
    const alive = this.pl.filter((m) => m.alive);
    const last = alive.length === 1 && alive[0].a.grounded;
    if (!(alive.length === 0 || last || this.t >= LIMIT)) return;
    const room = (m: Pl) => {
      let n = 0;
      for (const t of this.list[m.level]) if (this.st[t] === UP && Math.hypot(this.tx[t] - m.a.pos.x, this.tz[t] - m.a.pos.z) < 3.4) n++;
      return n;
    };
    const up = this.pl
      .map((m, i) => ({ i, m, r: m.alive ? room(m) : 0 }))
      .filter((x) => x.m.alive)
      .sort((a, b) => a.m.level - b.m.level || b.r - a.r || b.m.a.pos.y - a.m.a.pos.y || a.i - b.i)
      .map((x) => x.i);
    this.order = [...up, ...[...this.out].reverse()];
    this.news.length = 0;
    this.over = 0;
    const win = this.order[0];
    const w = this.pl[win];
    if (this.t >= LIMIT && up.length > 1) this.say(T("TIME!", "时间到！"), "#ffffff", 1.2);
    if (w.alive) {
      w.a.cheer(3);
      this.fx.burst(this.v.set(w.a.pos.x, w.a.pos.y + 2.2, w.a.pos.z), 60, ["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#c4b1fc", "#ffffff"], { speed: 7, up: 8, size: 0.2, life: 1.6, gravity: 10 });
    }
    cheerS(0.22);
    // the tiles stop where they are, the beams fizzle
    for (const b of this.beams)
      if (b.on && !b.fired) {
        b.on = false;
        b.group.visible = false;
        for (let k = 0; k < b.n; k++) this.beamFrom[b.tiles[k]] = this.beamAt[b.tiles[k]] = 99;
      }
  }

  // ---- the look ------------------------------------------------------------------------------------

  private look(dt: number) {
    this.pose(dt);
    this.focus(dt);
    this.tiles3(dt);
    this.beams3();
    this.decor(dt);
    this.playCam(this.eye, this.at);
    this.cam.to(this.eye, this.at, dt, 3.2);
    this.cam.apply(dt);
    this.fx.update(dt);
    this.shards.update(dt);
  }

  /** Each snark: facing its move, the shove's leans, the flail of a fall, the landing's squash. */
  private pose(dt: number) {
    const now = this.clock;
    for (let i = 0; i < 4; i++) {
      const m = this.pl[i],
        a = m.a,
        b = a.body;
      if (m.gone) continue;
      const sp = Math.hypot(m.vx, m.vz);
      const falling = !a.grounded && (m.fallT >= 0 || !m.alive) && a.vy < -3;
      if (!m.alive) {
        // out: tumbling away toward the city
        a.yaw += dt * m.spin * 0.4;
        m.tumble.rotation.x -= dt * 6;
        m.tumble.rotation.z = Math.sin(now * 9 + i) * 0.4;
      } else if (m.knock > 0) {
        a.yaw += m.spin * dt;
        m.spin *= Math.exp(-3 * dt);
        m.tumble.rotation.x += (-0.55 - m.tumble.rotation.x) * Math.min(1, 16 * dt);
        m.tumble.rotation.z = Math.sin(now * 31 + i) * 0.32;
      } else {
        const lean = m.wind > 0 ? -0.36 : m.lunge > 0 ? 0.62 : m.rec > 0 ? 0.25 : falling ? Math.sin(now * 7 + i) * 0.25 : 0;
        m.tumble.rotation.x += (lean - m.tumble.rotation.x) * Math.min(1, 16 * dt);
        m.tumble.rotation.z = falling ? Math.sin(now * 11 + i * 2) * 0.22 : m.tumble.rotation.z * Math.exp(-10 * dt);
        if (m.wind > 0 || m.lunge > 0) a.face(yawOf(m.sx, m.sz), dt, 26);
        else if (sp > 0.6) a.face(yawOf(m.vx, m.vz), dt);
        else if (this.over >= 0 && i === this.order[0]) a.face(0, dt, 4);
      }
      const sq = m.squash;
      const w = m.wind > 0 ? 1 - m.wind / WIND : 0;
      m.tumble.scale.set(1 + sq * 0.16 + w * 0.08, 1 - sq * 0.22 - w * 0.1 + (m.lunge > 0 ? 0.06 : 0), 1 + sq * 0.16 + w * 0.08);
      a.legs = falling ? 7 : null;
      a.sync(dt, now);
      // a fall: the arms up, flailing
      const flail = falling || m.knock > 0;
      b.holdArms(flail);
      if (flail) {
        const f = now * (m.knock > 0 ? 26 : 19);
        b.armR.rotation.set(-2.6 + Math.sin(f) * 0.7, 0, -0.9);
        b.armL.rotation.set(-2.6 + Math.sin(f + 2) * 0.7, 0, 0.9);
        b.foreArmR.rotation.set(-0.3, 0, 0);
        b.foreArmL.rotation.set(-0.3, 0, 0);
      }
      if (m.wind > 0 || m.lunge > 0) {
        // both fists out in the lunge, back in the wind-up
        b.holdArms(true);
        const k = m.lunge > 0 ? -1.55 : -0.4;
        b.armR.rotation.set(k, 0, 0.12);
        b.armL.rotation.set(k, 0, -0.12);
        b.foreArmR.rotation.set(m.lunge > 0 ? 0 : -1.4, 0, 0);
        b.foreArmL.rotation.set(m.lunge > 0 ? 0 : -1.4, 0, 0);
      }
      // the shove's arrow on the floor: in the wind-up, where it will go
      const ar = this.arrows[i];
      ar.visible = m.alive && m.wind > 0;
      if (ar.visible) {
        const k = 1 - m.wind / WIND;
        ar.position.set(a.pos.x + m.sx * (REACH / 2 + 0.2), FY[m.level] + 0.07, a.pos.z + m.sz * (REACH / 2 + 0.2));
        ar.rotation.y = Math.atan2(-m.sz, m.sx);
        ar.scale.set(REACH * (0.6 + k * 0.4), 1, 0.95);
      }
    }
    for (const p of this.pows) {
      if (!p.m.visible) continue;
      p.t += dt;
      const k = p.t / 0.32;
      if (k >= 1) {
        p.m.visible = false;
        continue;
      }
      p.m.quaternion.copy(this.w.camera.quaternion);
      p.m.rotateZ(p.t * 3);
      p.m.scale.setScalar(p.s * (0.4 + Math.min(1, k * 3) * 0.6) * (1 - k * k * 0.3));
    }
  }

  /** The camera's floor (yours, or the action's once you're out); the floors over it fade to a ghost. */
  private focus(dt: number) {
    let fy = FY[0];
    const h = this.human >= 0 ? this.pl[this.human] : null;
    if (h && h.alive) fy = Math.max(FY[h.level], Math.min(h.a.pos.y, FY[Math.max(0, h.level - 1)]));
    else {
      // the floor with the most still up (the lower on a tie)
      const n = [0, 0, 0];
      for (const m of this.pl) if (m.alive) n[m.level]++;
      let best = NF - 1;
      for (let f = NF - 1; f >= 0; f--) if (n[f] > n[best]) best = f;
      fy = FY[best];
    }
    this.focusY += (fy - this.focusY) * Math.min(1, dt * 6);
    // (the sun's shadow map is laid round the floor the camera is on, not the bottom one: its texels stay fine)
    this.w.scene.userData.shadowY = this.focusY;
    for (let f = 0; f < NF; f++) {
      const ghost = FY[f] > this.focusY + 2.5;
      const a = (this.alpha[f] += ((ghost ? 0.07 : 1) - this.alpha[f]) * Math.min(1, dt * 6));
      const mt = this.mats[f];
      const solid = a > 0.97;
      for (const x of [mt.side, ...mt.tops]) {
        x.opacity = solid ? 1 : a;
        x.depthWrite = solid;
      }
      for (const m of this.meshes[f]) if (m) m.renderOrder = solid ? 0 : 6;
    }
  }

  /** Every tile's place and colour: cracking hot and shaking, falling and tumbling, the warnings blinking. */
  private tiles3(dt: number) {
    void dt;
    const now = this.clock;
    for (let i = 0; i < this.N; i++) {
      const f = this.tf[i],
        st = this.st[i];
      const mesh = this.meshes[f][this.kind[i]];
      if (!mesh) continue;
      const k = this.mi[i];
      let y = 0,
        ox = 0,
        oz = 0,
        tilt = 0,
        scale = 1,
        dk = 0;
      this.col.setRGB(this.base[i * 3], this.base[i * 3 + 1], this.base[i * 3 + 2]);
      if (this.kind[i] >= RSA) y = -0.06;
      if (st === UP) {
        // a beam's line: blinking red, faster as it comes
        if (this.beamAt[i] < 99) {
          const u = clamp((this.t - this.beamFrom[i]) / Math.max(0.1, this.beamAt[i] - this.beamFrom[i]), 0, 1);
          const blink = Math.sin(now * (10 + u * 26)) > 0 ? 0.35 + u * 0.55 : 0.12;
          this.col.lerp(this.kind[i] === MLDSA ? SHIELD_C : WARN_C, this.kind[i] === MLDSA ? blink * 0.5 : blink);
        }
        // a floor about to go: all of it blinks
        const c = f < 2 ? this.collapse[f] : null;
        if (c && c.warned && (!c.fell || this.pend[i] >= 0)) {
          const u = c.fell ? 1 : clamp((this.t - c.at + C_WARN) / C_WARN, 0, 1);
          const blink = Math.sin(now * (8 + u * 14) + (c.fell ? this.pend[i] * 9 : 0)) > 0 ? 0.25 + u * 0.4 : 0.05;
          this.col.lerp(WARN_C, blink);
          ox = Math.sin(now * 47 + i * 1.7) * 0.02 * u;
          oz = Math.cos(now * 53 + i) * 0.02 * u;
        }
        if (this.shield[i] > 0) this.col.lerp(SHIELD_C, this.shield[i]);
      } else if (st === CRACKING) {
        // hotter as it goes: orange, then red
        const u = clamp(this.ck[i] / this.cd[i], 0, 1);
        if (u < 0.45) this.col.lerp(HOT, 0.4 + u * 1.3);
        else this.col.copy(HOT).lerp(RED_HOT, (u - 0.45) / 0.55);
        if (this.popT[i] > 0) this.col.lerp(FLASH_C, this.popT[i] * 0.8);
        const sh = 0.02 + u * u * 0.07;
        ox = Math.sin(now * 61 + i * 1.3) * sh;
        oz = Math.cos(now * 57 + i * 2.1) * sh;
        y -= u * u * 0.12;
        tilt = Math.sin(now * 40 + i) * 0.04 * u;
        dk = 0.45 + u * 0.6;
        if (this.shield[i] > 0) this.col.lerp(SHIELD_C, this.shield[i]);
      } else if (st === FALLING) {
        const ft = this.ft[i];
        y -= 0.5 * G * ft * ft;
        tilt = ft * 2.4;
        this.col.copy(RED_HOT);
        dk = 1.05;
      } else scale = 0;
      if (scale === 0) this.m4.copy(this.zero);
      else {
        this.e.set(tilt * this.spinX[i], this.yawT[i] + this.ang[f], tilt * this.spinZ[i]);
        this.q.setFromEuler(this.e);
        this.m4.compose(this.v.set(this.tx[i] + ox, y, this.tz[i] + oz), this.q, this.sc.set(scale, scale, scale));
      }
      mesh.setMatrixAt(k, this.m4);
      mesh.setColorAt(k, this.col);
      // the cracks over it
      if (dk > 0 && this.alpha[f] > 0.6) {
        this.m4.compose(this.v.set(this.tx[i] + ox, FY[f] + y + 0.015, this.tz[i] + oz), this.q, this.sc.set(1.9 * S * dk * 0.9, 1, 1.9 * S * dk * 0.9));
        this.decals.setMatrixAt(i, this.m4);
      } else this.decals.setMatrixAt(i, this.zero);
    }
    for (const row of this.meshes)
      for (const m of row)
        if (m) {
          m.instanceMatrix.needsUpdate = true;
          if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
    this.decals.instanceMatrix.needsUpdate = true;
  }

  /** The beams: the stripe pulsing, the probes charging (spinning, swelling), the sweep. */
  private beams3() {
    const now = this.clock;
    for (const b of this.beams) {
      if (!b.on) continue;
      if (this.ang[b.f] !== 0) this.placeBeam(b);
      const u = clamp(b.t / b.warn, 0, 1);
      b.stripTex.offset.x = -now * (1.5 + u * 3);
      const sm = b.strip.material as THREE.MeshBasicMaterial;
      sm.opacity = b.fired ? Math.max(0, 1 - (b.t - b.warn) / 0.3) : 0.45 + 0.45 * Math.abs(Math.sin(now * (5 + u * 10)));
      for (const e of b.ems) {
        const s = b.fired ? Math.max(0.01, 1 - (b.t - b.warn - SWEEP) / 0.35) : 0.35 + ease(u) * 0.75 + Math.sin(now * 30) * 0.05 * u;
        e.scale.setScalar(s);
        e.rotation.y = now * (2 + u * 9);
        e.rotation.z = Math.sin(now * 3) * 0.4;
      }
      if (b.fired) {
        const k = clamp((b.t - b.warn) / SWEEP, 0, 1);
        const fade = clamp(1 - (b.t - b.warn - SWEEP) / 0.35, 0, 1);
        const front = Math.max(0.01, k * b.len);
        b.core.visible = b.halo.visible = true;
        b.core.position.set(front / 2, 0.75, 0);
        b.core.scale.set(front, 0.42 * fade + 0.02, 0.42 * fade + 0.02);
        b.halo.position.set(front / 2, 0.75, 0);
        b.halo.scale.set(front, 1.3 * fade + 0.02, 1.3 * fade + 0.02);
      }
    }
  }

  private decor(dt: number) {
    const now = this.clock;
    for (const s of this.signs) s.position.y = s.userData.y + Math.sin(now * 1.3 + s.userData.a) * 0.3;
    this.deco?.update(now, dt, this.ang, this.alpha);
  }

  /** The play camera: high, three-quarter, on you (and whoever is near you), following you down. */
  private playCam(eye: THREE.Vector3, at: THREE.Vector3) {
    const h = this.human >= 0 ? this.pl[this.human] : null;
    let cx = 0,
      cz = 0,
      n = 0;
    if (h && h.alive) {
      cx = h.a.pos.x * 0.7;
      cz = h.a.pos.z * 0.7;
      let ox = 0,
        oz = 0,
        on = 0;
      for (const m of this.pl)
        if (m !== h && m.alive && m.level === h.level) {
          ox += m.a.pos.x;
          oz += m.a.pos.z;
          on++;
        }
      if (on) ((cx += (ox / on) * 0.3), (cz += (oz / on) * 0.3));
      else ((cx /= 0.7), (cz /= 0.7));
    } else {
      for (const m of this.pl)
        if (m.alive && Math.abs(FY[m.level] - this.focusY) < 2.5) {
          cx += m.a.pos.x;
          cz += m.a.pos.z;
          n++;
        }
      if (n) ((cx /= n), (cz /= n));
    }
    at.set(cx * 0.82, this.focusY + 0.7, cz * 0.82 + 0.4);
    let D = this.L.dist,
      P = this.L.pitch;
    if (this.over >= 0) {
      // the winner, close, low in the frame (the FINISH banner is in the middle)
      const w = this.pl[this.order[0]].a;
      at.set(w.pos.x, Math.max(FY[NF - 1] - 1, w.pos.y) + 3.2, w.pos.z - 0.6);
      D = this.L.dist * 0.55;
      P = 0.62;
    }
    eye.set(at.x, at.y + D * Math.sin(P), at.z + D * Math.cos(P));
  }

  private cardCam(k: number) {
    this.cam.orbit(this.v.set(0, 7, 0), 0.55 + k * 0.3, 36, 15);
  }

  idle(dt: number, phase: "card" | "count", k: number) {
    dt = Math.max(0, Math.min(dt, 0.05));
    this.clock += dt;
    if (phase === "card") this.cardCam(k);
    else {
      // down from the fly-over onto the game's own camera
      if (!this.countFrom) this.countFrom = { eye: this.cam.eye.clone(), at: this.cam.at.clone() };
      this.playCam(this.eye, this.at);
      const e = ease(k);
      this.cam.eye.lerpVectors(this.countFrom.eye, this.eye, e);
      this.cam.at.lerpVectors(this.countFrom.at, this.at, e);
    }
    for (const m of this.pl) {
      m.a.physics(dt, FY[0], G);
      m.wx = m.wz = m.thr = 0;
    }
    this.pose(dt);
    this.focus(dt);
    this.tiles3(dt);
    this.decor(dt);
    this.cam.apply(dt);
    this.fx.update(dt);
    this.shards.update(dt);
  }

  view() {
    return this.w;
  }

  /** The intro's own shots: a rise past the three floors (the title lands on it), then the whole of it from a way off, low enough for its sky: the sun over the city, the rinks over the frozen lake, the decks over the Earth's limb. */
  intro(): IntroShot[] {
    const k = this.L.key;
    const wide: IntroShot =
      k === "astana"
        ? { eye: [-34, 20, 46], eye2: [-27, 21, 41], at: [0, 6, -6], at2: [0, 7, -6], fov: 52, fov2: 48, w: 1.2 }
        : k === "orbit"
          ? { eye: [33, 24, 42], eye2: [27, 26, 38], at: [0, 6, 0], at2: [0, 6, 0], fov: 54, fov2: 51, w: 1.2 }
          : { eye: [27, 15, 39], eye2: [22, 17, 34], at: [0, 10, 0], at2: [0, 11, 0], fov: 52, fov2: 48, w: 1.2 };
    return [{ eye: [-21, FY[2] + 1, 17], eye2: [-18, FY[0] + 6, 15], at: [0, FY[2] + 3, 0], at2: [0, FY[0] - 2, 0], fov: 50, fov2: 46 }, wide];
  }

  /** The announcer: one thing at a time; `now` cuts in (the eliminations, 2 LEFT!) ahead of the rest. */
  private say(s: string, c: string, d: number, sub?: string, now = false) {
    if (this.over >= 0 && s !== T("TIME!", "时间到！")) return;
    const n = { s, c, t: 0, d, sub };
    if (now && this.news.length && this.news[0].t > 0.25) this.news.splice(0, 1, n);
    else if (now) this.news.splice(this.news.length ? 1 : 0, 0, n);
    else this.news.push(n);
  }

  draw(g: CanvasRenderingContext2D) {
    const cam = this.w.camera;
    let ys = 0,
      ny = 0;
    for (let i = 0; i < 4; i++) {
      const m = this.pl[i];
      if (!m.alive) continue;
      const s = toScreen(m.a.head(this.v), cam);
      if (!s.on) continue;
      // (the ones up on a ghost floor, faded)
      const ghost = FY[m.level] > this.focusY + 2.5 && m.fallT < 0;
      tag(g, m.p, s.x, s.y - 4, ghost ? 0.55 : 1);
      if (m.pop > 0 && m.p.human) {
        g.globalAlpha = clamp(m.pop * 2, 0, 1);
        text(g, `▼ ${m.popS}`, s.x, s.y - 30 - (1.4 - m.pop) * 14, 18, "#ffffff", "center", 900);
        g.globalAlpha = 1;
      }
      ys += s.y;
      ny++;
    }
    // (the announcer keeps off the action: high when it is low on the screen, low when it is high)
    const by = ny && ys / ny < 220 ? 410 : 118;
    this.bannerY += (by - this.bannerY) * 0.2;
    for (let i = 0; i < 4; i++) {
      this.outs[i] = !this.pl[i].alive;
      const at = this.out.indexOf(i);
      this.vals[i] = at >= 0 ? ord(3 - at) : "";
    }
    corners(g, this.players, this.vals, { out: this.outs, lead: this.over >= 0 ? [this.order[0]] : undefined });
    // in each panel: the floor it's on (a little stack), its shove's charge
    for (let i = 0; i < 4; i++) {
      const m = this.pl[i];
      if (!m.alive) continue;
      const [x, y] = cornerSpot(i);
      for (let f = 0; f < NF; f++) {
        const here = m.level === f;
        const blink = here && m.fallT >= 0 ? Math.floor(this.clock * 8) % 2 === 0 : true;
        rr(g, x + 150 + f * 2, y + 12 + f * 12, 32 - f * 4, 8, 3);
        g.fillStyle = here && blink ? this.L.floorC[f] : "rgba(255,255,255,0.16)";
        g.fill();
        if (here) {
          g.lineWidth = 1.5;
          g.strokeStyle = "#ffffff";
          g.stroke();
        }
      }
      const k = m.cd <= 0 ? 1 : 1 - m.cd / SHOVE_CD;
      rr(g, x + 58, y + 37, 80, 8, 4);
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fill();
      rr(g, x + 58, y + 37, Math.max(8, 80 * k), 8, 4);
      g.fillStyle = k >= 1 ? m.p.color : "rgba(255,255,255,0.45)";
      g.fill();
    }
    clock(g, LIMIT - this.t);
    // the countdown to EXPOSURE, under the clock
    if (this.t < QDAY && this.over < 0) {
      const left = Math.ceil(QDAY - this.t);
      const hot = left <= 3;
      // (clear of the clock as drawn: it grows on a small screen)
      const py = 34 + 25 * clockK() + 5;
      rr(g, 480 - 66, py, 132, 24, 12);
      g.fillStyle = hot ? (Math.floor(this.clock * 6) % 2 ? "#ff6b35" : "#c0391b") : "rgba(12,9,28,0.78)";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = hot ? "#ffffff" : "#c4b1fc";
      g.stroke();
      text(g, T(`EXPOSURE IN ${left}`, `曝光倒计时 ${left}`), 480, py + 13, 13, "#ffffff", "center", 900);
    }
    const n = this.news[0];
    if (n) {
      banner(g, n.s, n.t / n.d, n.c, this.bannerY, n.s.length > 14 ? 44 : 58);
      if (n.sub && n.t / n.d < 0.85) {
        g.globalAlpha = clamp(Math.min(n.t * 4, (n.d * 0.85 - n.t) * 4), 0, 1);
        rr(g, 480 - 250, this.bannerY + 34, 500, 30, 15);
        g.fillStyle = "rgba(12,9,28,0.72)";
        g.fill();
        text(g, n.sub, 480, this.bannerY + 49, 15, "#ffe2d4", "center", 800);
        g.globalAlpha = 1;
      }
    }
    // the first seconds: the controls, and what the tiles mean
    if (this.human >= 0 && this.t < 5 && this.over < 0) {
      g.globalAlpha = clamp(5 - this.t, 0, 1);
      // (a touch screen: its buttons say what they do, so the hint names them; the strip as wide as its words, between the stick and the buttons)
      const hint = touchy()
        ? T(`Keep moving! · ${actWord("jump")}: over gaps · ${actWord("shove")}: rivals`, `不停移动！·「${actWord("jump")}」过缺口 ·「${actWord("shove")}」推对手`)
        : T("Keep moving: tiles crack! · A jumps · B shoves", "不停移动：地砖会碎！· A 跳 · B 推");
      g.font = `800 15px ${FONT}`;
      const hw = HUD.thumbs ? g.measureText(hint).width + 40 : 500;
      const hx = between(480, hw);
      rr(g, hx - hw / 2, 470, hw, 34, 17);
      g.fillStyle = "rgba(12,9,28,0.74)";
      g.fill();
      text(g, hint, hx, 488, 15, "#fff", "center", 800);
      this.legend(g, 480, 444);
      g.globalAlpha = 1;
    }
  }

  /** Three little hexes: what each tile does. */
  private legend(g: CanvasRenderingContext2D, x: number, y: number) {
    const items: [string, string, string][] = [
      [this.L.floorC[0], "#ffffff", T("cracks", "会裂")],
      ["#ffffff", "#6a48f4", T("ORCHARD: tough", "ORCHARD：结实")],
      // (a touch screen: the short way, so the key fits between the stick and the buttons)
      [OLD_C, "#8c2f22", HUD.thumbs ? T("t-addr / P2PKH: breaks", "透明地址：一踩就碎") : T("t-addr / P2PKH: breaks at once", "透明地址（t-addr / P2PKH）：一踩就碎")],
    ];
    g.font = `800 13px ${FONT}`;
    const ws = items.map((it) => g.measureText(it[2]).width + 30);
    const total = ws.reduce((a, b) => a + b, 0) + 20;
    let cx = between(x, total + 20) - total / 2;
    rr(g, cx - 10, y - 15, total + 20, 30, 15);
    g.fillStyle = "rgba(12,9,28,0.62)";
    g.fill();
    items.forEach(([c, ink, s], k) => {
      hexPath(g, cx + 9, y, 9);
      g.fillStyle = c;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = ink;
      g.stroke();
      text(g, s, cx + 24, y + 1, 13, "#ffffff", "left", 800);
      cx += ws[k] + 10;
    });
  }

  result() {
    return this.done;
  }

  /** You fell off the bottom and the rivals play on: the host may fast-forward. */
  humanOut() {
    return this.human >= 0 && !this.pl[this.human].alive && this.over < 0;
  }

  dispose() {
    for (const o of this.charges)
      try {
        o.stop();
      } catch {
        /* (already over) */
      }
    this.charges = [];
    for (const m of this.pl) m.a.dispose();
    disposeScene(this.w.scene);
    const win = window as unknown as Record<string, unknown>;
    if (win.__lattice === this) delete win.__lattice;
  }
}

export const LATTICE: MiniDef = {
  key: "lattice",
  title: "HALO FALL",
  titleZh: "光环坠落",
  tag: "EXPOSURE survival: the tiles crack under your feet",
  tagZh: "曝光求生：脚下的地砖会碎",
  help: "Tiles crack under you: keep moving, A jumps gaps, B shoves. Transparent tiles (t-addr, P2PKH) break at once; ORCHARD holds longer and survives the TRACKER BEAM. Last one up wins!",
  helpZh: "脚下的地砖会碎：不停移动，A 跳过缺口，B 推人。透明地址地砖（t-addr、P2PKH）一踩就碎；ORCHARD 更结实，挡得住追踪光束。最后留下的获胜！",
  pad: ["left", "right", "up", "down", "a", "b"],
  tap: false,
  color: "#c4b1fc",
  song: "lattice",
  ambience: "city-day",
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `lattice-${l.key}`, song: l.song, ambience: l.ambience })),
  make: (players, rnd, variant) => new Lattice(players, rnd, LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]),
};
export default LATTICE;
