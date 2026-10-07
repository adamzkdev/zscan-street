import * as THREE from "three";
import { ZScan } from "../../data/zscan";
import { Snark, loadArt } from "../../scene/snark";
import type { InteriorContext, PickInfo } from "../types";
import { AX, AZ, canvasTex, HYPO, POD, SHIELDED_KINDS } from "./geo";

/**
 * The Proof Games, live. Two zkSNARK gladiators rise from the trapdoors on the lifts: the Shielded
 * murmillo in gold (gladius, big scutum with the Z) and the Transparent retiarius in silver (trident
 * and net, nothing hidden). They fight on the sand until the next block lands; the side with more
 * transactions in that block wins the bout: the loser goes down, the emperor gives his thumb, the
 * crowd rises, petals rain in the winner's colour and a banner reads the round. Then both go back
 * down the lifts and the next pair comes up for the next block.
 */

const TEAM = [
  { name: "Shielded", color: "#f4b728", metal: "#e0b040", kind: "murmillo" },
  { name: "Transparent", color: "#c8ccd8", metal: "#d8dce6", kind: "retiarius" },
] as const;
/** Lift (trapdoor) positions for each side, and the other trapdoors. */
export const LIFTS: [number, number][] = [
  [-4.5, 0],
  [4.5, 0],
];
export const TRAPS: [number, number][] = [
  [-4.5, -8],
  [4.5, -8],
  [-4.5, 8],
  [4.5, 8],
];

type Phase = "rise" | "walkIn" | "fight" | "finish" | "walkOut" | "sink";

interface Fighter {
  team: 0 | 1;
  id: number;
  s: Snark | null;
  gear: THREE.Group;
  arm: THREE.Group; // weapon pivot
  guard: THREE.Group; // shield / net
  fall: number;
}

export interface Show {
  group: THREE.Group;
  /** Lift platforms' heights (0 = arena level, HYPO = down in the hypogeum), for the hypogeum's lifts. */
  lift: number[];
  hatch: number[];
  pickables: THREE.Object3D[];
  pick(o: THREE.Object3D): PickInfo | null;
  hover(o: THREE.Object3D): string | null;
  update(dt: number, t: number, camQuat: THREE.Quaternion, camRight: THREE.Vector3, cheer: (v: number) => void, wave: () => void): void;
  people: Snark[];
  /** Seen from the hypogeum: its own lifts and ceiling take over. */
  below: boolean;
  /** What happens on the sand, for the crowd's voice. */
  on: { rise?: (height: number) => void; hit?: () => void; result?: (r: { height: number; sh: number; tr: number; winner: number }) => void };
}

// ---- pixel gear ----------------------------------------------------------------------------------
const P = 1.75 / 26;
function pix(w: number, h: number, rows: string[], pal: Record<string, string>) {
  const t = canvasTex(w, h, (g) => {
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        const c = pal[r[x]];
        if (!c) continue;
        g.fillStyle = c;
        g.fillRect(x, y, 1, 1);
      }
    });
  }, true);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w * P, h * P), new THREE.MeshBasicMaterial({ map: t.t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  return m;
}
const SWORD = [".s.", ".s.", "sws", "sws", "sws", "sws", "sws", "sws", "sws", "sws", "sws", ".s.", "ggg", "ggg", "ggggg", ".b.", ".b.", ".b.", ".g."].map((r) => r.padEnd(5, "."));
function gladius() {
  const m = pix(5, SWORD.length, SWORD, { s: "#c8ccd4", w: "#f4f6fa", g: "#d4a830", b: "#5a3a24" });
  m.geometry.translate(0, (SWORD.length * P) / 2 - 4 * P, 0);
  return m;
}
function scutum() {
  const rows: string[] = [];
  const W = 12,
    H = 17;
  for (let y = 0; y < H; y++) {
    let r = "";
    for (let x = 0; x < W; x++) {
      const edge = x === 0 || x === W - 1 || y === 0 || y === H - 1;
      const boss = Math.hypot(x - 5.5, y - 8) < 1.6;
      // the Z, gold on the shield's dark field
      const zx = x - 3,
        zy = y - 4;
      const z = zx >= 0 && zx < 6 && zy >= 0 && zy < 9 && (zy === 0 || zy === 8 || Math.abs(zx - (5 - Math.round((zy * 5) / 8))) < 1);
      r += edge ? "e" : boss ? "b" : z ? "z" : "f";
    }
    rows.push(r);
  }
  return pix(W, H, rows, { e: "#f4d060", b: "#fff0b0", z: "#f4b728", f: "#7a1e22" });
}
function trident() {
  const rows = ["s.s.s", "s.s.s", "s.s.s", "sssss", "..s..", ...Array(26).fill("..w.."), "..s.."];
  const m = pix(5, rows.length, rows, { s: "#dfe3ea", w: "#7a5a3a" });
  m.geometry.translate(0, (rows.length * P) / 2 - 12 * P, 0);
  return m;
}
function net() {
  const rows: string[] = [];
  for (let y = 0; y < 12; y++) {
    let r = "";
    for (let x = 0; x < 10; x++) r += (x + y) % 3 === 0 || (x - y + 30) % 3 === 0 ? "n" : ".";
    rows.push(r);
  }
  return pix(10, 12, rows, { n: "#d8d0b0" });
}
function crest(color: string) {
  return pix(7, 5, ["..ccc..", ".ccccc.", "ccccccc", "...m...", "...m..."], { c: color, m: "#d4a830" });
}
function thumb(up: boolean) {
  const rows = ["....tt....", "....tt....", "....tt....", "..ffttff..", ".ffffffff.", ".ffffffff.", ".ffffffff.", ".ffffffff.", "..ffffff..", "..cccccc..", "..cccccc.."];
  const r = up ? rows : [...rows].reverse();
  return pix(10, 11, r, { t: "#f0c8a0", f: "#e0b890", c: "#5a1e6e" });
}

/** A gladiator's kit on a zkSNARK's cut-out (its `visual`): murmillo (0) or retiarius (1). */
export function kit(team: 0 | 1) {
  const g = new THREE.Group();
  if (team === 0) {
    const sw = gladius();
    sw.position.set(0.62, 1.05, 0.06);
    sw.rotation.z = 0.4;
    const sc = scutum();
    sc.position.set(0.42, 0.95, 0.1);
    const cr = crest("#c0302a");
    cr.position.set(0.17, 2.2, 0.02);
    g.add(sw, sc, cr);
  } else {
    const tr = trident();
    tr.position.set(0.62, 1.0, 0.06);
    const n = net();
    n.position.set(-0.45, 0.85, 0.06);
    g.add(tr, n);
  }
  return g;
}

export function buildShow(ctx: InteriorContext): Show {
  const group = new THREE.Group();
  const pickables: THREE.Object3D[] = [];
  const picks = new Map<THREE.Object3D, () => PickInfo | null>();
  const hovers = new Map<THREE.Object3D, () => string>();
  const people: Snark[] = [];
  const lift = [HYPO, HYPO];
  const hatch = [0, 0];

  // ---- trapdoors, lifts ------------------------------------------------------------------------
  const woodM = new THREE.MeshStandardMaterial({ color: "#6a4a30", roughness: 0.85 });
  const woodL = new THREE.MeshStandardMaterial({ color: "#8a6644", roughness: 0.85 });
  const ironM = new THREE.MeshStandardMaterial({ color: "#2a2830", roughness: 0.5, metalness: 0.7 });
  const pitM = new THREE.MeshBasicMaterial({ color: "#0a0806" });
  const S = 1.6;
  const leaves: THREE.Object3D[][] = [];
  const pits: THREE.Mesh[] = [];
  const platforms: THREE.Mesh[] = [];
  const trapdoor = (x: number, z: number, live: boolean) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(S + 0.24, 0.04, S + 0.24), ironM);
    frame.position.set(x, 0.0, z);
    group.add(frame);
    const ls: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(x + (side * S) / 2, 0.03, z);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(S / 2, 0.06, S), woodL);
      leaf.position.x = (-side * S) / 4;
      hinge.add(leaf);
      // iron straps and a ring
      for (const dz of [-0.5, 0.5]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(S / 2 - 0.05, 0.075, 0.08), ironM);
        strap.position.set((-side * S) / 4, 0, dz);
        hinge.add(strap);
      }
      group.add(hinge);
      ls.push(hinge);
      if (live) {
        pickables.push(leaf);
        picks.set(leaf, () => ({ eyebrow: "Trapdoor", title: "Lift ▼ Hypogeum", floor: 1 }));
        hovers.set(leaf, () => "<b>Trapdoor</b><span>lift down to the hypogeum</span>");
      }
    }
    leaves.push(ls);
    if (live) {
      const pit = new THREE.Mesh(new THREE.BoxGeometry(S, 3, S), pitM);
      pit.geometry.translate(0, -1.5, 0);
      pit.position.set(x, 0.005, z);
      pit.visible = false;
      group.add(pit);
      pits.push(pit);
      const pl = new THREE.Mesh(new THREE.BoxGeometry(S - 0.06, 0.16, S - 0.06), woodM);
      pl.position.set(x, HYPO, z);
      group.add(pl);
      platforms.push(pl);
    }
  };
  LIFTS.forEach(([x, z]) => trapdoor(x, z, true));
  TRAPS.forEach(([x, z]) => trapdoor(x, z, false));

  // ---- the tabula: the scoreboard over the Porta Libitinensis ----------------------------------------
  const board = canvasTex(1024, 512, () => {});
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ map: board.t, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
  boardMesh.position.set(0, POD + 2.05, -(AZ + 0.32));
  group.add(boardMesh);
  const frameG = new THREE.Mesh(new THREE.BoxGeometry(4.9, 2.6, 0.18), woodM);
  frameG.position.set(0, POD + 2.05, -(AZ + 0.45));
  group.add(frameG);
  for (const sx of [-2.2, 2.2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.4, 0.16), woodM);
    post.position.set(sx, POD + 0.2, -(AZ + 0.45));
    group.add(post);
  }
  pickables.push(boardMesh);
  hovers.set(boardMesh, () => `<b>The tabula</b><span>round #${round}</span>`);
  picks.set(boardMesh, () => ({
    eyebrow: "The Proof Games",
    title: `Round #${round}`,
    mono: true,
    stats: [
      ["Shielded wins", String(tally[0])],
      ["Transparent wins", String(tally[1])],
      ["Draws", String(tally[2])],
      ["Last block", last ? `${last.sh} · ${last.tr}` : "—"],
    ],
    body: history.length ? `<p>${history.map((h) => `#${h.height} ${h.winner === 0 ? "Shielded" : h.winner === 1 ? "Transparent" : "draw"} (${h.sh}–${h.tr})`).slice(-5).reverse().join("<br>")}</p>` : undefined,
    link: last ? { href: `https://zscan.cash/block/${last.height}`, label: `Block #${last.height} on ZScan` } : undefined,
  }));

  // ---- state ------------------------------------------------------------------------------------
  let round = (ctx.director.blockHeight ?? 0) + 1;
  const tally = [0, 0, 0];
  let last: { height: number; sh: number; tr: number; winner: number } | null = null;
  const history: { height: number; sh: number; tr: number; winner: number }[] = [];
  const pending: { height: number; sh: number; tr: number; winner: number }[] = [];
  let phase: Phase = "rise";
  let pt = 0; // time in phase
  let fightT = 0;
  let result: { height: number; sh: number; tr: number; winner: number } | null = null;
  let lastUpdate = -1;

  const drawBoard = () => {
    const g = board.g;
    g.fillStyle = "#2a1e14";
    g.fillRect(0, 0, 1024, 512);
    g.fillStyle = "#3a2a1c";
    g.fillRect(14, 14, 996, 484);
    g.textAlign = "center";
    g.fillStyle = "#e6d6a8";
    g.font = '700 46px "Times New Roman", serif';
    g.fillText("THE PROOF GAMES", 512, 74);
    g.font = '700 34px "JetBrains Mono", monospace';
    g.fillStyle = "#c8b890";
    g.fillText(`ROUND #${round.toLocaleString("en-US")}`, 512, 124);
    for (const k of [0, 1] as const) {
      const x = k === 0 ? 256 : 768;
      g.fillStyle = TEAM[k].color;
      g.font = '800 40px "JetBrains Mono", monospace';
      g.fillText(TEAM[k].name.toUpperCase(), x, 200);
      g.font = '800 150px "JetBrains Mono", monospace';
      g.fillText(String(tally[k]), x, 350);
    }
    g.fillStyle = "#8a7a5a";
    g.fillRect(510, 160, 4, 220);
    g.font = '600 30px "JetBrains Mono", monospace';
    g.fillStyle = "#e6d6a8";
    if (last) g.fillText(`#${last.height.toLocaleString("en-US")}   ${last.sh} shielded · ${last.tr} transparent`, 512, 430);
    // the last results as coins
    const hs = history.slice(-12);
    hs.forEach((h, i) => {
      g.fillStyle = h.winner === 0 ? TEAM[0].color : h.winner === 1 ? TEAM[1].color : "#6a5a44";
      g.beginPath();
      g.arc(512 - (hs.length - 1) * 18 + i * 36, 474, 12, 0, Math.PI * 2);
      g.fill();
    });
    board.t.needsUpdate = true;
  };
  drawBoard();

  // ---- the fighters -----------------------------------------------------------------------------
  const fighters: Fighter[] = [0, 1].map((team) => {
    const gear = new THREE.Group();
    const arm = new THREE.Group();
    const guard = new THREE.Group();
    gear.add(arm, guard);
    if (team === 0) {
      arm.add(gladius());
      arm.position.set(0.62, 1.05, 0.06);
      const sc = scutum();
      guard.add(sc);
      guard.position.set(0.42, 0.95, 0.1);
      const cr = crest("#c0302a");
      cr.position.set(0.17, 2.2, 0.02);
      gear.add(cr);
    } else {
      arm.add(trident());
      arm.position.set(0.62, 1.0, 0.06);
      const n = net();
      guard.add(n);
      guard.position.set(-0.45, 0.85, 0.06);
    }
    // a team-coloured ring on the sand
    const ringM = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM[team].color).multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.8 }));
    ringM.rotation.x = -Math.PI / 2;
    ringM.position.set(0.15, 0.03, 0);
    ringM.userData.ring = true;
    return { team: team as 0 | 1, id: 0, s: null, gear, arm, guard, fall: 0, ring: ringM } as Fighter & { ring: THREE.Mesh };
  });
  const idsFor = (h: number) => [1 + ((h * 7919) % 9999), 1 + ((h * 104729 + 17) % 9999)];
  let loadSeq = 0;
  const cast = async (h: number) => {
    const seq = ++loadSeq;
    const ids = idsFor(h);
    await Promise.all(
      fighters.map(async (f, k) => {
        let id = ids[k];
        for (let tries = 0; tries < 3; tries++) {
          try {
            const art = await loadArt(id);
            if (seq !== loadSeq) return;
            const s = new Snark(id, art);
            s.noClip = true;
            s.state = "resident";
            s.role = `${TEAM[k].name} gladiator`;
            const old = f.s;
            if (old) {
              group.remove(old.root);
              const i = people.indexOf(old);
              if (i >= 0) people.splice(i, 1);
            }
            s.visual.add(f.gear);
            s.root.add((f as Fighter & { ring: THREE.Mesh }).ring);
            s.root.position.set(LIFTS[k][0], lift[k], LIFTS[k][1]);
            group.add(s.root);
            people.push(s);
            f.s = s;
            f.id = id;
            pickables.push(s.body);
            hovers.set(s.body, () => `<b>${TEAM[k].name} gladiator</b><span>zkSNARK #${f.id}</span>`);
            picks.set(s.body, () => ({
              eyebrow: `The Proof Games · Round #${round}`,
              title: `${TEAM[k].name} · zkSNARK #${f.id}`,
              image: ZScan.zkSnarkImage(f.id),
              tag: [TEAM[k].kind, k === 0 ? "ok" : "muted"],
              stats: [
                ["Fights for", k === 0 ? "Shielded txs" : "Transparent txs"],
                ["Side's wins", String(tally[k])],
                ["Last block", last ? String(k === 0 ? last.sh : last.tr) : "—"],
              ],
            }));
            return;
          } catch {
            id = 1 + ((id * 31 + 7) % 9999);
          }
        }
      }),
    );
  };
  void cast(round);

  // the referee, the emperor, his guards, the musicians
  const extra = async (id: number, pos: THREE.Vector3, role: string, face: THREE.Vector3, o: { sit?: number } = {}) => {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      s.root.position.copy(pos);
      s.faceDir = face;
      if (o.sit) s.sit(true, o.sit);
      group.add(s.root);
      people.push(s);
      return s;
    } catch {
      return null;
    }
  };
  let emperor: Snark | null = null;
  const thumbUp = thumb(true),
    thumbDown = thumb(false);
  const thumbG = new THREE.Group();
  thumbG.add(thumbUp, thumbDown);
  thumbG.scale.setScalar(0.01);
  thumbG.visible = false;
  let thumbT = -1;
  void extra(1, new THREE.Vector3(-(AX + 2.75), POD + 0.62, 0), "Emperor", new THREE.Vector3(1, 0, 0), { sit: 0.62 }).then((s) => {
    emperor = s;
    if (!s) return;
    // the laurel painted round his own head (it used to float a hand above it)
    s.wear({ hat: "laurel" });
    const toga = pix(14, 4, ["pppppppppppppp", "pppppppppppppp", ".pppppppppppp.", "..pppppppppp.."], { p: "#5a1e6e" });
    toga.position.set(0.17, 0.62, 0.04);
    s.visual.add(toga);
    thumbG.position.set(0.6, 1.9, 0.05);
    s.root.add(thumbG);
    pickables.push(s.body);
    hovers.set(s.body, () => `<b>The emperor</b><span>zkSNARK #1</span>`);
    picks.set(s.body, () => ({
      eyebrow: "Pulvinar",
      title: "The emperor · zkSNARK #1",
      image: ZScan.zkSnarkImage(1),
      stats: [
        ["Thumbs up", String(tally[0] + tally[2])],
        ["Thumbs down", String(tally[1])],
        ["Round", `#${round}`],
      ],
    }));
  });
  for (const z of [-2.6, 2.6]) void extra(z < 0 ? 2112 : 3112, new THREE.Vector3(-(AX + 1.2), POD, z), "Praetorian", new THREE.Vector3(1, 0, 0));
  let referee: Snark | null = null;
  void extra(777, new THREE.Vector3(3.2, 0, -3), "Summa rudis", new THREE.Vector3(-1, 0, 0)).then((s) => {
    referee = s;
    if (!s) return;
    const rod = pix(1, 16, Array(16).fill("w"), { w: "#a07a4a" });
    rod.position.set(0.6, 1.0, 0.05);
    rod.rotation.z = -0.3;
    s.visual.add(rod);
  });

  // ---- petals and sparks ---------------------------------------------------------------------------
  const NP = 420;
  const petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.07), new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide, toneMapped: false }), NP);
  petals.frustumCulled = false;
  petals.raycast = () => {};
  const pv = Array.from({ length: NP }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: Math.random() * 6 }));
  petals.visible = false;
  group.add(petals);
  let petalsT = -1;
  const startPetals = (color: string) => {
    const c = new THREE.Color(color).multiplyScalar(1.2);
    const rose = new THREE.Color("#d03048");
    pv.forEach((p, i) => {
      p.p.set((Math.random() - 0.5) * AX * 2.2, 8 + Math.random() * 9, (Math.random() - 0.5) * AZ * 2.2);
      p.v.set((Math.random() - 0.5) * 0.4, -0.9 - Math.random() * 0.8, (Math.random() - 0.5) * 0.4);
      petals.setColorAt(i, Math.random() < 0.7 ? c : rose);
    });
    petals.instanceColor!.needsUpdate = true;
    petals.visible = true;
    petalsT = 0;
  };
  const sparks = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(30 * 3), 3)),
    new THREE.PointsMaterial({ color: new THREE.Color("#ffe8a0").multiplyScalar(3), size: 0.07, toneMapped: false, transparent: true }),
  );
  const sv = Array.from({ length: 30 }, () => new THREE.Vector3());
  sparks.visible = false;
  sparks.frustumCulled = false;
  group.add(sparks);
  let sparkT = -1;
  const spark = (at: THREE.Vector3) => {
    const pos = sparks.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 30; i++) {
      pos.setXYZ(i, at.x, at.y, at.z);
      sv[i].set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4);
    }
    pos.needsUpdate = true;
    sparks.visible = true;
    sparkT = 0;
  };

  // ---- the banner (DOM) ----------------------------------------------------------------------------
  let banner: HTMLDivElement | null = null;
  let bannerTimer = 0;
  const showBanner = (r: { height: number; winner: number }) => {
    banner?.remove();
    const b = document.createElement("div");
    const w = r.winner;
    const color = w === 0 ? TEAM[0].color : w === 1 ? TEAM[1].color : "#e6d6a8";
    b.textContent = `ROUND #${r.height.toLocaleString("en-US")} · ${w === 0 ? "SHIELDED WINS" : w === 1 ? "TRANSPARENT WINS" : "DRAW"}`;
    Object.assign(b.style, {
      position: "fixed",
      top: "16%",
      left: "50%",
      transform: "translate(-50%, -8px) scale(0.96)",
      padding: "14px 30px",
      font: '800 30px "JetBrains Mono", Menlo, monospace',
      letterSpacing: "0.08em",
      color,
      background: "rgba(14,10,6,0.82)",
      border: `2px solid ${color}`,
      boxShadow: `0 0 28px ${color}55`,
      borderRadius: "4px",
      pointerEvents: "none",
      zIndex: "60",
      opacity: "0",
      transition: "opacity .35s, transform .35s",
      whiteSpace: "nowrap",
    } as Partial<CSSStyleDeclaration>);
    document.body.append(b);
    requestAnimationFrame(() => {
      b.style.opacity = "1";
      b.style.transform = "translate(-50%, 0) scale(1)";
    });
    banner = b;
    clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => {
      b.style.opacity = "0";
      setTimeout(() => b.remove(), 400);
      if (banner === b) banner = null;
    }, 6000);
  };
  const isInside = () => performance.now() - lastUpdate < 400;

  // ---- blocks ------------------------------------------------------------------------------------
  const decide = async (height: number) => {
    let b = null;
    for (let k = 0; k < 3 && !b; k++) {
      b = await ZScan.block(height).catch(() => null);
      if (!b) await new Promise((r) => setTimeout(r, 2500));
    }
    const txs = b?.txs ?? [];
    const sh = txs.filter((t) => SHIELDED_KINDS.has(t.kind)).length;
    const tr = txs.length - sh;
    pending.push({ height, sh, tr, winner: sh > tr ? 0 : tr > sh ? 1 : 2 });
  };
  ctx.onBlock((h) => void decide(h));
  // the latest block decides the board until the first bout ends
  if (ctx.director.blockHeight) {
    void ZScan.block(ctx.director.blockHeight).then((b) => {
      if (!b || last) return;
      const sh = b.txs.filter((t) => SHIELDED_KINDS.has(t.kind)).length;
      last = { height: b.height, sh, tr: b.txs.length - sh, winner: 2 };
      drawBoard();
    });
  }

  // ---- update ---------------------------------------------------------------------------------------
  const tmp = new THREE.Vector3();
  const rotZ = new THREE.Quaternion();
  const ZAX = new THREE.Vector3(0, 0, 1);
  const centre = new THREE.Vector3();
  const set = (f: Fighter, x: number, z: number) => f.s && f.s.root.position.set(x, f.s.root.position.y, z);
  let sparked = -1;
  let cheerV = 0;

  const update: Show["update"] = (dt, t, camQuat, camRight, cheer, wave) => {
    lastUpdate = performance.now();
    pt += dt;
    // pending results resolve a fight that has lasted long enough
    if (!result && pending.length && phase === "fight" && fightT > 6) result = pending.shift()!;
    const [A, B] = fighters;

    if (phase === "rise") {
      const k = Math.min(1, pt / 3);
      for (const i of [0, 1]) {
        hatch[i] = Math.min(1, pt / 0.8);
        lift[i] = HYPO + (0 - HYPO) * THREE.MathUtils.smoothstep(k, 0, 1);
        fighters[i].fall = 0;
      }
      if (pt > 3.2) {
        phase = "walkIn";
        pt = 0;
        wave();
        api.on.rise?.(round);
        for (const f of fighters)
          if (f.s) {
            f.s.root.position.y = 0;
            void f.s.walk([new THREE.Vector3(f.team === 0 ? -1.3 : 1.3, 0, 0)], 1.6);
          }
      }
    } else if (phase === "walkIn") {
      for (const i of [0, 1]) hatch[i] = Math.max(0, 1 - pt / 0.8);
      if (pt > 2.2) {
        phase = "fight";
        pt = 0;
        fightT = 0;
      }
    } else if (phase === "fight") {
      fightT += dt;
      const cyc = fightT / 2.3;
      const n = Math.floor(cyc),
        u = cyc - n;
      const attacker = (n * 7 + round) % 3 === 0 ? 1 : n % 2;
      const sep = 2.5 - 1.25 * THREE.MathUtils.smoothstep(u, 0.1, 0.45) * (1 - THREE.MathUtils.smoothstep(u, 0.65, 0.95));
      centre.set(0.6 * Math.sin(fightT * 0.31), 0, 1.0 * Math.sin(fightT * 0.21));
      const ang = 0.35 * Math.sin(fightT * 0.17);
      const ax = Math.cos(ang),
        az = Math.sin(ang);
      set(A, centre.x - (ax * sep) / 2, centre.z - (az * sep) / 2);
      set(B, centre.x + (ax * sep) / 2, centre.z + (az * sep) / 2);
      for (const f of fighters) {
        const att = f.team === attacker;
        const swing = att && u > 0.33 && u < 0.62 ? 1.5 - 2.4 * THREE.MathUtils.smoothstep(u, 0.36, 0.55) : att && u > 0.2 && u <= 0.33 ? 1.5 * THREE.MathUtils.smoothstep(u, 0.2, 0.33) : 0.35 + 0.1 * Math.sin(t * 3 + f.team);
        f.arm.rotation.z = f.team === 0 ? swing : swing * 0.6 - 0.3;
        // a trident thrusts rather than swings
        if (f.team === 1) f.arm.position.x = 0.62 + (att && u > 0.36 && u < 0.6 ? 0.35 : 0);
        const block = !att && u > 0.3 && u < 0.66;
        f.guard.position.y = (f.team === 0 ? 0.95 : 0.85) + (block ? 0.35 : 0);
        f.guard.rotation.z = f.team === 1 ? Math.sin(t * 4) * 0.25 : 0;
      }
      if (u > 0.5 && sparked !== n && A.s && B.s) {
        sparked = n;
        spark(tmp.copy(A.s.root.position).add(B.s.root.position).multiplyScalar(0.5).setY(1.3));
        cheerV = Math.max(cheerV, 0.35);
        api.on.hit?.();
      }
      if (result) {
        phase = "finish";
        pt = 0;
        const r = result;
        if (r.winner < 2) tally[r.winner]++;
        else tally[2]++;
        last = r;
        history.push(r);
        drawBoard();
        if (isInside()) showBanner(r);
        thumbT = 0;
        thumbUp.visible = r.winner !== 1;
        thumbDown.visible = r.winner === 1;
        if (r.winner < 2) startPetals(TEAM[r.winner].color);
        cheerV = 1;
        wave();
        api.on.result?.(r);
      }
    } else if (phase === "finish") {
      const r = result!;
      for (const f of fighters) {
        const won = r.winner === f.team,
          lost = r.winner < 2 && !won;
        if (lost) f.fall = Math.min(1, f.fall + dt * 2.2);
        if (won || r.winner === 2) {
          f.arm.rotation.z = (f.team === 0 ? 1.6 : 1.2) + Math.sin(t * 6) * 0.15;
          if (f.s) f.s.root.position.y = Math.abs(Math.sin(t * 5)) * 0.12;
        }
        if (lost) f.guard.position.y = 0.2;
      }
      if (pt > 8) {
        phase = "walkOut";
        pt = 0;
        for (const f of fighters) {
          f.fall = 0;
          if (!f.s) continue;
          f.s.root.position.y = 0;
          void f.s.walk([new THREE.Vector3(LIFTS[f.team][0], 0, LIFTS[f.team][1])], 1.6);
        }
      }
    } else if (phase === "walkOut") {
      for (const i of [0, 1]) hatch[i] = Math.min(1, pt / 0.8);
      if (pt > 3.4) {
        phase = "sink";
        pt = 0;
        for (const f of fighters) f.s && f.s.root.position.set(LIFTS[f.team][0], 0, LIFTS[f.team][1]);
      }
    } else if (phase === "sink") {
      const k = Math.min(1, pt / 2.6);
      for (const i of [0, 1]) lift[i] = HYPO * THREE.MathUtils.smoothstep(k, 0, 1);
      if (pt > 2.8) {
        // the next bout: the block after the one just decided
        round = Math.max(round + 1, (result?.height ?? round) + 1);
        result = null;
        drawBoard();
        phase = "rise";
        pt = 0;
        void cast(round);
      }
    }

    // lifts and hatches
    for (const i of [0, 1]) {
      platforms[i].position.y = lift[i] - 0.08;
      platforms[i].visible = !api.below;
      pits[i].visible = hatch[i] > 0.02 && !api.below;
      const [l0, l1] = leaves[i];
      l0.rotation.z = -hatch[i] * 1.75;
      l1.rotation.z = hatch[i] * 1.75;
      const f = fighters[i];
      if ((phase === "rise" || phase === "sink") && f.s) f.s.root.position.y = lift[i];
    }

    for (const s of people) s.update(dt, t, camQuat, camRight);
    // gladiators face each other; the fallen lie on the sand
    for (const f of fighters) {
      if (!f.s) continue;
      const o = fighters[1 - f.team].s;
      if (o && !f.s.isWalking) f.s.faceDir = tmp.copy(o.root.position).sub(f.s.root.position).setY(0).normalize().clone();
      if (f.fall > 0) {
        const facing = f.s.faceDir && f.s.faceDir.dot(camRight) < 0 ? -1 : 1;
        rotZ.setFromAxisAngle(ZAX, facing * THREE.MathUtils.smoothstep(f.fall, 0, 1) * 1.45);
        f.s.visual.quaternion.multiply(rotZ);
      }
    }
    // the emperor's thumb
    if (thumbT >= 0) {
      thumbT += dt;
      thumbG.visible = thumbT > 1.2 && thumbT < 8;
      const k = Math.min(1, Math.max(0, (thumbT - 1.2) * 4)) * Math.min(1, Math.max(0, (8 - thumbT) * 4));
      thumbG.scale.setScalar(Math.max(0.01, k * 1.6));
      thumbG.position.y = 1.9 + Math.sin(thumbT * 6) * 0.05;
      if (thumbT > 8) thumbT = -1;
    }
    // petals and sparks
    if (petalsT >= 0) {
      petalsT += dt;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      pv.forEach((p, i) => {
        p.p.addScaledVector(p.v, dt);
        p.p.x += Math.sin(t * 1.3 + p.w) * dt * 0.4;
        if (p.p.y < 0.02) p.p.y = 0.02;
        p.r.set(t * 2 + p.w, t * 1.3 + p.w, p.p.y < 0.03 ? Math.PI / 2 : 0);
        q.setFromEuler(p.r);
        m.compose(p.p, q, one);
        petals.setMatrixAt(i, m);
      });
      petals.instanceMatrix.needsUpdate = true;
      if (petalsT > 16) {
        petals.visible = false;
        petalsT = -1;
      }
    }
    if (sparkT >= 0) {
      sparkT += dt;
      const pos = sparks.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 30; i++) {
        sv[i].y -= 9 * dt;
        pos.setXYZ(i, pos.getX(i) + sv[i].x * dt, pos.getY(i) + sv[i].y * dt, pos.getZ(i) + sv[i].z * dt);
      }
      pos.needsUpdate = true;
      (sparks.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - sparkT * 2.5);
      if (sparkT > 0.45) {
        sparks.visible = false;
        sparkT = -1;
      }
    }
    // the referee keeps to the side of the fight
    if (referee && !referee.isWalking && phase === "fight" && Math.random() < dt * 0.25) {
      const rf = referee as Snark;
      void rf.walk([new THREE.Vector3(centre.x + (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random()), 0, centre.z - 2.5 - Math.random() * 1.5)], 1.2);
    }
    cheerV = Math.max(0.08, cheerV - dt * 0.12);
    cheer(cheerV);
    void emperor;
  };

  const api: Show = {
    below: false,
    on: {},
    group,
    lift,
    hatch,
    pickables,
    people,
    pick: (o) => {
      for (let x: THREE.Object3D | null = o; x; x = x.parent) {
        const p = picks.get(x);
        if (p) return p();
      }
      return null;
    },
    hover: (o) => {
      for (let x: THREE.Object3D | null = o; x; x = x.parent) {
        const p = hovers.get(x);
        if (p) return p();
      }
      return null;
    },
    update,
  };
  return api;
}
