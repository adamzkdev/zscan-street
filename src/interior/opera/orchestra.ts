import * as THREE from "three";
import { KIND_COLOR } from "../../scene/snark";
import type { Snark } from "../../scene/snark";
import type { TxKind } from "../../data/types";
import { ZScan } from "../../data/zscan";
import type { PickInfo } from "../types";
import { type Level, canvasTex, rng, std } from "./kit";
import { YS } from "./hall";

/**
 * The orchestra on stage: two dozen zkSNARKs at their desks round the conductor, each with a real
 * instrument that moves with the music (bows that saw, mallets that roll, brass that lifts), the
 * conductor's baton beating time. `energy` (0–1) is the music's loudness: the show raises it into
 * a crescendo when a block lands. Notes rise from the desks, one per transaction, coloured by kind.
 */

type Kind = "violin" | "viola" | "cello" | "bass" | "flute" | "oboe" | "clarinet" | "bassoon" | "horn" | "trumpet" | "trombone" | "timpani" | "harp";

const SECTION: Record<Kind, string> = {
  violin: "Violin",
  viola: "Viola",
  cello: "Cello",
  bass: "Double bass",
  flute: "Flute",
  oboe: "Oboe",
  clarinet: "Clarinet",
  bassoon: "Bassoon",
  horn: "French horn",
  trumpet: "Trumpet",
  trombone: "Trombone",
  timpani: "Timpani",
  harp: "Harp",
};

const LINES: Partial<Record<Kind, string[]>> = {
  violin: ["Bar 32, the block lands.", "Shielded, con sordino."],
  cello: ["The low notes are the fees.", "Every transaction a note."],
  horn: ["Wait for the crescendo.", "Here comes a block."],
  timpani: ["One roll per block.", "Mind the cymbal."],
  harp: ["Forty-seven strings, all shielded."],
  trumpet: ["Fanfare at the next block!"],
};

const wood = std("#8a4a22", 0.45, 0.1);
const darkWood = std("#3a1e10", 0.5);
const gold = std("#d8a838", 0.25, 0.9);
const black = std("#16141a", 0.4, 0.3);
const silver = std("#d0d4dc", 0.2, 0.9);
const hair = std("#efe6d0", 0.6);
const copper = std("#b06a3a", 0.3, 0.85);
const skin = std("#f2ead8", 0.6);
const cbody = std("#7a3a18", 0.35, 0.1);

interface Desk {
  kind: Kind;
  root: THREE.Group;
  /** Called every frame: time, energy, this player's phase. */
  anim: (t: number, e: number, ph: number) => void;
  ph: number;
  s: Snark | null;
}

const paper = std("#f4efe2", 0.9);
/** A music stand beside the player, its desk turned to them. */
function stand(g: THREE.Group, x: number, z: number) {
  const s = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 6), black);
  post.position.set(0, 0.5, 0);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.32, 0.02), black);
  desk.position.set(0, 1.05, 0);
  desk.rotation.x = 0.5;
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), paper);
  sheet.position.set(0, 1.06, -0.015);
  sheet.rotation.set(0.5 + Math.PI, 0, 0);
  s.add(post, desk, sheet);
  s.position.set(x, 0, z);
  s.rotation.y = 0.5;
  g.add(s);
}

function chair(g: THREE.Group) {
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.42), black);
  seat.position.set(0, 0.46, -0.05);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.04), black);
  back.position.set(0, 0.7, -0.27);
  g.add(seat, back);
}

/** A bow: a stick with its hair, pivoting at the player's hand. */
function bow(len: number) {
  const b = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.BoxGeometry(len, 0.015, 0.015), darkWood);
  const h = new THREE.Mesh(new THREE.BoxGeometry(len * 0.95, 0.006, 0.006), hair);
  h.position.y = -0.03;
  b.add(stick, h);
  return b;
}

function instrument(kind: Kind): { g: THREE.Group; anim: (t: number, e: number, ph: number) => void } {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    g.add(o);
    return o;
  };
  switch (kind) {
    case "violin":
    case "viola": {
      const k = kind === "viola" ? 1.12 : 1;
      const v = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.2 * k, 0.06, 0.36 * k), wood);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.24), darkWood);
      neck.position.z = -0.28 * k;
      v.add(body, neck);
      v.position.set(-0.2, 0.98, 0.18);
      v.rotation.set(0.25, 0.9, 0.35);
      g.add(v);
      const b = bow(0.66 * k);
      g.add(b);
      return {
        g,
        anim: (t, e, ph) => {
          const s = Math.sin(t * (2.2 + e * 5) + ph * 6);
          b.position.set(-0.08 + s * (0.1 + 0.14 * e), 0.96 + s * 0.03, 0.26);
          b.rotation.set(0, 0, -0.35 + s * 0.08);
        },
      };
    }
    case "cello":
    case "bass": {
      const k = kind === "bass" ? 1.45 : 1;
      // the body: lower and upper bouts round a narrow waist, f-holes, a black fingerboard
      add(new THREE.CylinderGeometry(0.22 * k, 0.22 * k, 0.12 * k, 16), cbody, 0, 0.12 + 0.2 * k, 0.28, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.17 * k, 0.17 * k, 0.12 * k, 16), cbody, 0, 0.12 + 0.52 * k, 0.28, Math.PI / 2);
      add(new THREE.BoxGeometry(0.26 * k, 0.2 * k, 0.11 * k), cbody, 0, 0.12 + 0.36 * k, 0.28);
      add(new THREE.BoxGeometry(0.05, 0.62 * k, 0.02), black, 0, 0.12 + 0.5 * k, 0.35);
      for (const fx of [-0.08, 0.08]) add(new THREE.BoxGeometry(0.015, 0.12 * k, 0.01), black, fx * k, 0.12 + 0.36 * k, 0.35);
      add(new THREE.BoxGeometry(0.06, 0.55 * k, 0.04), darkWood, 0, 0.12 + 0.62 * k + 0.27 * k, 0.28);
      add(new THREE.CylinderGeometry(0.01, 0.01, 0.14, 4), silver, 0, 0.06, 0.28);
      const b = bow(0.7 * k);
      g.add(b);
      return {
        g,
        anim: (t, e, ph) => {
          const s = Math.sin(t * (1.6 + e * 3.4) + ph * 6);
          b.position.set(s * (0.12 + 0.12 * e), 0.12 + 0.36 * k, 0.4);
          b.rotation.set(0, 0, 0.12 + s * 0.06);
        },
      };
    }
    case "flute": {
      const f = add(new THREE.CylinderGeometry(0.012, 0.012, 0.66, 6), silver, 0.12, 1.02, 0.2, 0, 0, Math.PI / 2 - 0.2);
      return { g, anim: (t, e, ph) => (f.position.y = 1.02 + Math.sin(t * 3 + ph) * 0.015 * (0.3 + e)) };
    }
    case "oboe":
    case "clarinet": {
      const c = add(new THREE.CylinderGeometry(0.018, 0.035, 0.6, 8), black, 0, 0.72, 0.28, 0.45);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 4), silver, 0.02, 0.72, 0.29, 0.45);
      return { g, anim: (t, e, ph) => (c.rotation.x = 0.45 + Math.sin(t * 2.6 + ph) * 0.05 * (0.3 + e)) };
    }
    case "bassoon": {
      const c = add(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), wood, 0.12, 0.75, 0.24, 0, 0, 0.25);
      return { g, anim: (t, e, ph) => (c.rotation.z = 0.25 + Math.sin(t * 2 + ph) * 0.04 * (0.3 + e)) };
    }
    case "horn": {
      const h = new THREE.Group();
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 20), gold);
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.15, 0.22, 14, 1, true), gold);
      bell.position.set(0.18, -0.05, 0);
      bell.rotation.z = -Math.PI / 2;
      h.add(coil, bell);
      h.position.set(0.05, 0.85, 0.24);
      g.add(h);
      return { g, anim: (t, e) => (h.rotation.z = Math.sin(t * 1.5) * 0.05 + e * 0.15) };
    }
    case "trumpet":
    case "trombone": {
      const k = kind === "trombone" ? 1.5 : 1;
      const h = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.5 * k, 6), gold);
      tube.rotation.x = Math.PI / 2;
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.1 * k, 0.18, 14, 1, true), gold);
      bell.rotation.x = Math.PI / 2;
      bell.position.z = 0.3 * k;
      h.add(tube, bell);
      if (kind === "trombone") {
        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.5), gold);
        slide.position.set(0, -0.06, 0.2);
        slide.name = "slide";
        h.add(slide);
      }
      h.position.set(0, 1.0, 0.18);
      g.add(h);
      const slide = h.getObjectByName("slide");
      return {
        g,
        anim: (t, e, ph) => {
          // lifted to play when the music swells
          h.rotation.x = -0.35 * e + Math.sin(t * 2 + ph) * 0.03;
          if (slide) slide.position.z = 0.2 + Math.max(0, Math.sin(t * 3 + ph)) * 0.2 * e;
        },
      };
    }
    case "timpani": {
      for (const [x, r] of [
        [-0.75, 0.36],
        [0, 0.42],
        [0.75, 0.34],
      ] as const) {
        add(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), copper, x, 0.82, 0.45);
        add(new THREE.CircleGeometry(r, 18), skin, x, 0.83, 0.45, -Math.PI / 2);
        add(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), silver, x, 0.4, 0.45);
      }
      const mallets = [0, 1].map((i) => {
        const mg = new THREE.Group();
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.36, 4), darkWood);
        stick.rotation.x = Math.PI / 2;
        stick.position.z = 0.18;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), skin);
        head.position.z = 0.36;
        mg.add(stick, head);
        mg.position.set(i ? 0.25 : -0.25, 1.0, 0.1);
        g.add(mg);
        return mg;
      });
      return {
        g,
        anim: (t, e, ph) => {
          // a roll when loud, slow strokes otherwise
          const f = e > 0.65 ? 18 : 2.4;
          mallets.forEach((mg, i) => (mg.rotation.x = 0.3 + Math.max(0, Math.sin(t * f + ph + i * Math.PI)) * (0.25 + 0.3 * e)));
        },
      };
    }
    case "harp": {
      add(new THREE.BoxGeometry(0.08, 1.6, 0.12), gold, 0.3, 0.8, 0.3, 0, 0, 0);
      add(new THREE.BoxGeometry(0.12, 0.08, 0.7), gold, 0.3, 1.62, 0.55, 0.35);
      add(new THREE.BoxGeometry(0.14, 1.5, 0.16), wood, 0.3, 0.86, 0.75, -0.42);
      add(new THREE.BoxGeometry(0.3, 0.12, 0.36), gold, 0.3, 0.06, 0.45);
      const strings = new THREE.Group();
      for (let i = 0; i < 12; i++) {
        const z = 0.36 + i * 0.05;
        const top = 1.6 - i * 0.02;
        const bot = 0.2 + i * 0.1;
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.004, top - bot, 0.004), i % 7 === 0 ? std("#c03030") : hair);
        s.position.set(0.3, (top + bot) / 2, z);
        strings.add(s);
      }
      g.add(strings);
      return { g, anim: (t, e) => (strings.position.x = Math.sin(t * 40) * 0.003 * e) };
    }
  }
}

/** Where everyone sits, round the conductor at (0, −8.6): angle (rad, 0 straight back), radius. */
const LAYOUT: [Kind, number, number][] = [
  ["violin", -1.25, 2.6],
  ["violin", -0.85, 2.6],
  ["violin", -0.45, 2.6],
  ["cello", 0.45, 2.6],
  ["cello", 0.85, 2.6],
  ["cello", 1.25, 2.6],
  ["violin", -1.15, 4.2],
  ["violin", -0.75, 4.2],
  ["violin", -0.38, 4.2],
  ["viola", 0.38, 4.2],
  ["viola", 0.75, 4.2],
  ["viola", 1.15, 4.2],
  ["harp", -1.45, 4.3],
  ["flute", -0.3, 5.7],
  ["oboe", -0.1, 5.7],
  ["clarinet", 0.1, 5.7],
  ["bassoon", 0.3, 5.7],
  ["horn", -0.5, 7.1],
  ["horn", -0.33, 7.1],
  ["trumpet", 0.25, 7.1],
  ["trombone", 0.42, 7.1],
  ["timpani", 0, 8.4],
  ["bass", 1.0, 6.3],
  ["bass", 1.2, 6.6],
];

export const CONDUCTOR = new THREE.Vector3(0, 0, -8.4);

export function buildOrchestra(L: Level, onConductor: () => PickInfo) {
  const g = L.group;
  const R = rng(1973);
  const desks: Desk[] = [];
  for (const [kind, a, r] of LAYOUT) {
    const x = Math.sin(a) * r,
      z = -9 - Math.cos(a) * r;
    const lift = r > 6.8 ? 0.6 : r > 5 ? 0.3 : 0;
    const root = new THREE.Group();
    root.position.set(x, YS + lift, z);
    // turned towards the conductor (the instrument faces the hall either way)
    root.rotation.y = Math.atan2(-x, CONDUCTOR.z - z + 6) * 0.4;
    const standing = kind === "bass" || kind === "timpani" || kind === "harp";
    if (!standing) chair(root);
    if (kind !== "timpani" && kind !== "harp") stand(root, 0.45, 0.42);
    const ins = instrument(kind);
    root.add(ins.g);
    g.add(root);
    const d: Desk = { kind, root, anim: ins.anim, ph: R() * 10, s: null };
    desks.push(d);
    const id = 1 + Math.floor(R() * 10000);
    // seated players on the chair's cushion (0.49 over the riser), not sunk into it
    void L.person(id, x, YS + lift + (standing ? 0 : 0.49), z - 0.05, SECTION[kind], {
      sit: !standing,
      seat: 0.49,
      scale: 0.78,
      lines: LINES[kind],
      near: 6,
      plain: () => ({
        eyebrow: "BLOCK SYMPHONY ORCHESTRA",
        title: `zkSNARK #${id}`,
        mono: true,
        image: ZScan.zkSnarkImage(id),
        tag: [SECTION[kind], "info"],
      }),
    }).then((s) => (d.s = s));
  }

  // the conductor's podium, rail and score; the zkSNARK with the baton
  const podium = new THREE.Group();
  podium.position.set(CONDUCTOR.x, YS, CONDUCTOR.z);
  {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 1.0), std("#2a1a14", 0.6));
    p.position.y = 0.15;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.04), std("#c9a24a", 0.3, 0.8));
    rail.position.set(0, 1.25, 0.45);
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, 0.04), std("#c9a24a", 0.3, 0.8));
    r2.position.set(-0.43, 0.75, 0.45);
    const r3 = r2.clone();
    r3.position.x = 0.43;
    podium.add(p, rail, r2, r3);
    const score = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.42), std("#f4efe2", 0.9));
    score.position.set(0, 1.25, -0.45);
    score.rotation.x = 0.4;
    const sstand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), black);
    sstand.position.set(0, 0.6, -0.5);
    podium.add(score, sstand);
  }
  g.add(podium);
  const baton = new THREE.Group();
  {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.45, 5), std("#ffffff", 0.4));
    stick.rotation.z = Math.PI / 2;
    stick.position.x = 0.22;
    const grip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), std("#c9a24a", 0.3, 0.8));
    baton.add(stick, grip);
    baton.position.set(CONDUCTOR.x + 0.35, YS + 1.7, CONDUCTOR.z - 0.15);
    g.add(baton);
  }
  let conductor: Snark | null = null;
  void L.person(1, CONDUCTOR.x, YS + 0.3, CONDUCTOR.z + 0.05, "Conductor", {
    scale: 0.9,
    face: new THREE.Vector3(0, 0, -1),
    plain: onConductor,
  }).then((s) => {
    conductor = s;
    if (s) L.pick(podium, "<b>Conductor</b><span>click: a melody of the block</span>", onConductor);
  });

  // ---- notes rising: one per transaction ------------------------------------------------------------------
  const NOTES = 360;
  const glyph = canvasTex(128, 128, (c) => {
    c.clearRect(0, 0, 128, 128);
    c.fillStyle = "#ffffff";
    c.font = '700 104px "DotGothic16", serif';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("♪", 64, 70);
  });
  const notes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: glyph.t, transparent: true, depthWrite: false, toneMapped: false }), NOTES);
  notes.frustumCulled = false;
  notes.raycast = () => {};
  const life: { p: THREE.Vector3; v: THREE.Vector3; age: number; max: number }[] = [];
  const free: number[] = [];
  const col = new THREE.Color();
  for (let i = 0; i < NOTES; i++) {
    life.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), age: 1, max: 1 });
    free.push(i);
    notes.setColorAt(i, col.set("#ffffff"));
  }
  g.add(notes);
  const mt = new THREE.Matrix4(),
    sc = new THREE.Vector3(),
    camQ = new THREE.Quaternion();
  const emit = (kind: TxKind) => {
    const i = free.pop();
    if (i === undefined) return;
    const d = desks[Math.floor(Math.random() * desks.length)];
    const n = life[i];
    n.p.copy(d.root.position).add(new THREE.Vector3(0, 1.6, 0.2));
    n.v.set((Math.random() - 0.5) * 0.5, 0.9 + Math.random() * 0.7, 0.4 + Math.random() * 0.6);
    n.age = 0;
    n.max = 5 + Math.random() * 3;
    notes.setColorAt(i, col.set(KIND_COLOR[kind] ?? "#f4b728").multiplyScalar(1.6));
    notes.instanceColor!.needsUpdate = true;
  };

  return {
    desks,
    get conductor() {
      return conductor;
    },
    emit,
    tick(dt: number, t: number, e: number, camera: THREE.Camera) {
      for (const d of desks) d.anim(t, e, d.ph);
      // beating time: a figure of four, wider when loud
      const beat = t * (1.6 + e * 0.8);
      const amp = 0.25 + e * 0.45;
      baton.rotation.set(0, 0, Math.sin(beat * Math.PI) * amp * 0.8 - 0.2);
      baton.position.y = YS + 1.65 + Math.abs(Math.cos(beat * Math.PI)) * amp * 0.35;
      baton.position.x = CONDUCTOR.x + 0.35 + Math.sin(beat * Math.PI * 0.5) * amp * 0.3;
      if (conductor) conductor.root.position.y = YS + 0.3 + Math.abs(Math.sin(beat * Math.PI)) * 0.04 * (1 + e);
      camera.getWorldQuaternion(camQ);
      for (let i = 0; i < NOTES; i++) {
        const n = life[i];
        if (n.age >= n.max) {
          mt.makeScale(0, 0, 0);
          notes.setMatrixAt(i, mt);
          continue;
        }
        n.age += dt;
        if (n.age >= n.max) {
          free.push(i);
          continue;
        }
        n.p.addScaledVector(n.v, dt);
        n.p.x += Math.sin(t * 2 + i) * dt * 0.25;
        const k = Math.min(1, n.age * 3, (n.max - n.age) * 1.2);
        mt.compose(n.p, camQ, sc.set(k, k, k));
        notes.setMatrixAt(i, mt);
      }
      notes.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---- a short melody, played when you click the conductor ---------------------------------------------
let audio: AudioContext | null = null;
/** Plays the block as a phrase: one note per transaction (up to 16), pitch from its txid. */
export function playMelody(txids: string[]) {
  try {
    audio ??= new AudioContext();
    const ac = audio;
    if (ac.state === "suspended") void ac.resume();
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    const base = 261.63;
    const now = ac.currentTime + 0.05;
    const master = ac.createGain();
    master.gain.value = 0.18;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    master.connect(lp).connect(ac.destination);
    const src = txids.length ? txids.slice(0, 16) : ["0a1b2c3d", "4e5f6a7b", "8c9d0e1f", "2a3b4c5d"];
    const step = 0.2;
    src.forEach((id, i) => {
      const h = parseInt(id.slice(0, 2), 16) || i * 37;
      const semi = scale[h % scale.length];
      const f = base * Math.pow(2, semi / 12);
      const o = ac.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      const gn = ac.createGain();
      const t0 = now + i * step;
      gn.gain.setValueAtTime(0, t0);
      gn.gain.linearRampToValueAtTime(0.9, t0 + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.001, t0 + step * 2.2);
      o.connect(gn).connect(master);
      o.start(t0);
      o.stop(t0 + step * 2.4);
    });
    // a bass note under it, and a final chord
    const end = now + src.length * step;
    for (const [semi, len, at] of [
      [-12, src.length * step, now],
      [0, 1.4, end],
      [4, 1.4, end],
      [7, 1.4, end],
    ] as const) {
      const o = ac.createOscillator();
      o.type = semi < 0 ? "sine" : "triangle";
      o.frequency.value = base * Math.pow(2, semi / 12);
      const gn = ac.createGain();
      gn.gain.setValueAtTime(0, at);
      gn.gain.linearRampToValueAtTime(semi < 0 ? 0.5 : 0.35, at + 0.05);
      gn.gain.exponentialRampToValueAtTime(0.001, at + len);
      o.connect(gn).connect(master);
      o.start(at);
      o.stop(at + len + 0.05);
    }
  } catch {
    /* no audio */
  }
}
