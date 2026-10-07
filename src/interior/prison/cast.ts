import * as THREE from "three";
import type { PickInfo } from "../types";
import { cellMatrix, cellNumber, FACES, type PrisonKit } from "./kit";

/**
 * Who is in which cell. Plates and panels keep to the public record (company, verdict or plea,
 * sentence, year); what they say in their bubbles is their own public lines and memes.
 */
export interface Inmate {
  key: string;
  face: number;
  i: number;
  tier: number;
  name: string;
  plate: string;
  sub: string;
  /** zkSNARK that plays them (none: the cell is empty). */
  id: number | null;
  open: boolean;
  tag: [string, "ok" | "warn" | "info" | "muted"];
  stats: [string, string][];
  lines: string[];
  blanket?: string;
}

/** Face 2 is B block on Broadway (west side), face 3 is C block on Broadway (east side). */
export const CAST: Inmate[] = [
  {
    key: "sbf",
    face: 2,
    i: 13,
    tier: 0,
    name: "Sam Bankman-Fried",
    plate: "S.B.F.",
    sub: "FTX · 25 YEARS",
    id: 3623,
    open: false,
    tag: ["SERVING", "warn"],
    stats: [["Company", "FTX"], ["Verdict", "Fraud & conspiracy, 7 counts (2023)"], ["Sentence", "25 years (2024)"]],
    lines: ["I'll make everyone whole.", "FTX is fine. Assets are fine.", "It was a margin thing.", "Anyone up for League?"],
  },
  {
    key: "dok",
    face: 2,
    i: 11,
    tier: 0,
    name: "Do Kwon",
    plate: "DO KWON",
    sub: "TERRAFORM LABS",
    id: 4146,
    open: false,
    tag: ["GUILTY PLEA", "warn"],
    stats: [["Company", "Terraform Labs"], ["Collapse", "TerraUSD / LUNA (May 2022)"], ["Plea", "Guilty, fraud (2025)"]],
    lines: ["Steady lads, deploying more capital.", "I don't debate the poor.", "Algorithmic. Stable. Trust me."],
  },
  {
    key: "mash",
    face: 2,
    i: 9,
    tier: 0,
    name: "Alex Mashinsky",
    plate: "A. MASHINSKY",
    sub: "CELSIUS · 12 YEARS",
    id: 5669,
    open: false,
    tag: ["SERVING", "warn"],
    stats: [["Company", "Celsius Network"], ["Plea", "Guilty, fraud (2024)"], ["Sentence", "12 years (2025)"]],
    lines: ["Banks are not your friends.", "Unbank yourself!", "Withdrawals are… paused."],
  },
  {
    key: "bcc",
    face: 2,
    i: 7,
    tier: 0,
    name: "BitConnect",
    plate: "BITCONNECT",
    sub: "COLLAPSED · 2018",
    id: 7192,
    open: false,
    tag: ["SHUT DOWN", "muted"],
    stats: [["Lending platform", "BitConnect"], ["Collapse", "January 2018"]],
    lines: ["BITCONNEEEEECT!", "Hey hey heeey!", "Wassa wassa wassup!"],
  },
  {
    key: "gox",
    face: 2,
    i: 5,
    tier: 0,
    name: "Mt. Gox",
    plate: "MT. GOX",
    sub: "850,000 BTC · 2014",
    id: 8715,
    open: false,
    tag: ["BANKRUPT", "muted"],
    stats: [["Exchange", "Mt. Gox, Tokyo"], ["Collapse", "February 2014"], ["Lost", "~850,000 BTC"], ["Repayments", "from 2024"]],
    lines: ["Transaction malleability!", "Where did the coins go?", "Repayments… any decade now."],
  },
  {
    key: "you",
    face: 3,
    i: 13,
    tier: 0,
    name: "Your cell",
    plate: "YOUR CELL",
    sub: "DISTURBING TRAFFIC",
    id: null,
    open: true,
    tag: ["RESERVED", "info"],
    stats: [["Charge", "Disturbing the traffic"], ["Bunk", "made"]],
    lines: [],
    blanket: "#8a8478",
  },
  {
    key: "cz",
    face: 3,
    i: 11,
    tier: 0,
    name: "Changpeng Zhao",
    plate: "C.Z.",
    sub: "4 MONTHS · RELEASED",
    id: null,
    open: true,
    tag: ["RELEASED", "ok"],
    stats: [["Company", "Binance"], ["Plea", "Guilty, AML failures (2023)"], ["Sentence", "4 months (2024)"]],
    lines: [],
    blanket: "#e0b030",
  },
  {
    key: "zhu",
    face: 3,
    i: 9,
    tier: 0,
    name: "Su Zhu",
    plate: "SU ZHU",
    sub: "3AC · RELEASED",
    id: null,
    open: true,
    tag: ["RELEASED", "ok"],
    stats: [["Fund", "Three Arrows Capital"], ["Sentence", "4 months, Singapore (2023)"]],
    lines: [],
  },
  {
    key: "ross",
    face: 3,
    i: 7,
    tier: 0,
    name: "Ross Ulbricht",
    plate: "R. ULBRICHT",
    sub: "SILK ROAD · PARDONED",
    id: null,
    open: true,
    tag: ["PARDONED", "ok"],
    stats: [["Site", "Silk Road"], ["Sentence", "Life (2015)"], ["Pardon", "January 2025"]],
    lines: [],
  },
];

export function castAt(face: number, i: number, tier: number) {
  return CAST.find((c) => c.face === face && c.i === i && c.tier === tier);
}

/** The plate over a famous cell: name, then the sentence in ZEC gold. */
function plateDraw(title: string, sub: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = "#16161b";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#f4b728";
    g.lineWidth = 6;
    g.strokeRect(5, 5, W - 10, H - 10);
    g.textAlign = "center";
    g.fillStyle = "#f2f2f6";
    g.font = '900 54px "JetBrains Mono", Menlo, monospace';
    g.fillText(title, W / 2, H * 0.5, W - 30);
    g.fillStyle = "#f4b728";
    g.font = '700 28px "JetBrains Mono", Menlo, monospace';
    g.fillText(sub, W / 2, H * 0.83, W - 30);
  };
}

export function info(c: Inmate, number: string, k: PrisonKit, said?: string): PickInfo {
  return {
    eyebrow: `Cell ${number} · ${FACES[c.face].aisle}`,
    title: c.name,
    image: c.id ? k.image(c.id) : undefined,
    tag: c.tag,
    stats: c.stats,
    body: said ? `<p><i>“${said}”</i></p>` : undefined,
  };
}

/**
 * The famous cells: their plates, what makes each cell theirs (posters, a beanbag, a microphone,
 * an empty chest, a note on the wall), and the inmates themselves at the bars.
 */
export function cast(k: PrisonKit) {
  const poster = (m: THREE.Matrix4, w: number, h: number, x: number, y: number, z: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, glow = false, px = 256) => {
    const p = k.picture(w, h, draw, 0, 0, 0, 0, { px, glow, transparent: true });
    p.mesh.position.set(x, y, z).applyMatrix4(m);
    p.mesh.rotation.y = new THREE.Euler().setFromRotationMatrix(m).y;
    return p.mesh;
  };
  for (const c of CAST) {
    const f = FACES[c.face];
    const m = cellMatrix(f, c.i, c.tier);
    const number = cellNumber(f, c.i, c.tier);
    const plate = poster(m, 1.3, 0.4, 0, 2.32, 0.125, plateDraw(c.plate, c.sub), true, 512);
    let lastLine: string | undefined;
    k.pick(plate, `<b>${c.name}</b><span>${c.plate} · ${number}</span>`, () => info(c, number, k, lastLine));
    const hw = f.cw / 2 - 0.07;
    const rot = new THREE.Euler().setFromRotationMatrix(m).y;
    const at = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyMatrix4(m);
    const box = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => k.b.box(mat, w, h, d, x, y, z, m, 1);
    const mat = (hex: string, r = 0.8, mt = 0.05, e?: string) => new THREE.MeshStandardMaterial({ color: hex, roughness: r, metalness: mt, emissive: e ?? "#000000", emissiveIntensity: e ? 1.4 : 0 });

    if (c.key === "sbf") {
      // a beanbag on the floor, a laptop with a game on, energy drinks, an FTX poster
      const bean = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), mat("#2d3a5a", 0.95));
      bean.scale.set(1, 0.55, 1.1);
      bean.position.copy(at(0.25, -1.9)).setY(0.22);
      k.root.add(bean);
      box(k.darkSteel, 0.34, 0.02, 0.24, hw - 0.18, 0.79, -1.3);
      const scr = poster(m, 0.32, 0.2, hw - 0.18, 0.9, -1.42, (g, W, H) => {
        g.fillStyle = "#0b1a2a";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#1e6a3a";
        g.fillRect(0, H * 0.3, W, H * 0.7);
        g.fillStyle = "#c89a3a";
        g.font = "bold 40px monospace";
        g.fillText("LoL", 12, 46);
        for (let i = 0; i < 6; i++) {
          g.fillStyle = i % 2 ? "#4aa8ff" : "#ff4a4a";
          g.fillRect(30 + i * 34, 90 + (i % 3) * 14, 10, 10);
        }
      }, true);
      scr.rotation.x = -0.15;
      for (let n = 0; n < 5; n++) {
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 8), mat(n % 2 ? "#2a7a3a" : "#d8d4cc", 0.3, 0.6));
        can.position.copy(at(-0.5 + n * 0.12, -0.5 - (n % 2) * 0.15)).setY(n === 4 ? 0.03 : 0.06);
        if (n === 4) can.rotation.z = Math.PI / 2;
        k.root.add(can);
      }
      poster(m, 0.6, 0.8, 0.25, 1.45, -2.62, (g, W, H) => {
        g.fillStyle = "#11a9bc";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#fff";
        g.font = "900 96px sans-serif";
        g.textAlign = "center";
        g.fillText("FTX", W / 2, H * 0.45);
        g.font = "700 22px sans-serif";
        g.fillText("ASSETS ARE FINE", W / 2, H * 0.62);
        g.strokeStyle = "#d02020";
        g.lineWidth = 10;
        g.beginPath();
        g.moveTo(20, H - 30);
        g.lineTo(W - 20, 30);
        g.stroke();
      });
    } else if (c.key === "dok") {
      // the moon, eclipsed; a stablecoin a long way from its peg
      poster(m, 0.62, 0.62, -0.2, 1.5, -2.62, (g, W, H) => {
        g.fillStyle = "#0d0b1e";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#f4d860";
        g.beginPath();
        g.arc(W / 2, H / 2, W * 0.36, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#0d0b1e";
        g.beginPath();
        g.arc(W / 2 + W * 0.2, H / 2 - H * 0.08, W * 0.33, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#e8e4f0";
        g.font = "800 30px monospace";
        g.fillText("LUNA", 14, H - 16);
      });
      poster(m, 0.5, 0.36, hw - 0.01, 1.35, -1.4, (g, W, H) => {
        g.fillStyle = "#f2efe6";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#1a1a1a";
        g.font = "800 34px monospace";
        g.fillText("UST", 14, 40);
        g.fillStyle = "#c0201a";
        g.font = "900 54px monospace";
        g.fillText("$0.02", 14, 110);
        g.strokeStyle = "#c0201a";
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(W - 90, 30);
        g.lineTo(W - 60, 90);
        g.lineTo(W - 20, 160);
        g.stroke();
      }).rotation.y = rot - Math.PI / 2;
    } else if (c.key === "mash") {
      // the T-shirt pinned to the wall; a thermometer, frozen
      poster(m, 0.62, 0.62, 0.2, 1.4, -2.62, (g, W, H) => {
        g.fillStyle = "#1c2a4a";
        g.beginPath();
        g.moveTo(W * 0.3, 10);
        g.lineTo(W * 0.7, 10);
        g.lineTo(W - 6, H * 0.3);
        g.lineTo(W * 0.8, H * 0.4);
        g.lineTo(W * 0.78, H - 6);
        g.lineTo(W * 0.22, H - 6);
        g.lineTo(W * 0.2, H * 0.4);
        g.lineTo(6, H * 0.3);
        g.closePath();
        g.fill();
        g.fillStyle = "#fff";
        g.textAlign = "center";
        g.font = "800 21px sans-serif";
        g.fillText("BANKS ARE", W / 2, H * 0.48);
        g.fillText("NOT YOUR", W / 2, H * 0.6);
        g.fillText("FRIENDS", W / 2, H * 0.72);
      });
      box(mat("#e8e8ec", 0.3), 0.05, 0.5, 0.02, -hw + 0.35, 1.2, -2.62);
      box(mat("#3a8ad8", 0.3, 0, "#2a6ab8"), 0.02, 0.06, 0.025, -hw + 0.35, 1.24, -2.61);
    } else if (c.key === "bcc") {
      // a microphone stand for the seminars, the logo on the wall
      const stand = at(0.2, -0.6);
      k.posts.put(stand.x, 0.75, stand.z, 1, 1.5);
      const mic = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), k.darkSteel);
      mic.position.set(stand.x, 1.52, stand.z);
      k.root.add(mic);
      k.b.box(k.darkSteel, 0.3, 0.03, 0.3, 0.2, 0, -0.6, m);
      poster(m, 0.7, 0.5, -0.2, 1.5, -2.62, (g, W, H) => {
        g.fillStyle = "#f08a1a";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#fff";
        g.beginPath();
        g.arc(W / 2, H * 0.42, H * 0.26, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#f08a1a";
        g.font = "900 64px sans-serif";
        g.textAlign = "center";
        g.fillText("B", W / 2, H * 0.55);
        g.fillStyle = "#fff";
        g.font = "800 30px sans-serif";
        g.fillText("BITCONNECT", W / 2, H * 0.9);
      });
    } else if (c.key === "gox") {
      // an open chest, empty; stacks of trading cards (it started as a card exchange)
      box(k.wood, 0.5, 0.3, 0.34, -0.25, 0, -1.0);
      box(k.darkSteel, 0.42, 0.02, 0.26, -0.25, 0.29, -1.0);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.34), k.wood);
      lid.position.copy(at(-0.25, -1.2)).setY(0.45);
      lid.rotation.y = rot;
      lid.rotateX(-1.2);
      k.root.add(lid);
      for (let n = 0; n < 3; n++) box(k.items[n], 0.07, 0.03 + n * 0.02, 0.1, hw - 0.3 + n * 0.09, 0.79, -1.3);
      poster(m, 0.6, 0.45, -0.1, 1.5, -2.62, (g, W, H) => {
        g.fillStyle = "#e9e4d6";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#1a1a1a";
        g.font = "800 30px monospace";
        g.fillText("MT.GOX", 16, 44);
        g.fillStyle = "#c0201a";
        g.font = "900 40px monospace";
        g.fillText("0 BTC", 16, 110);
        g.font = "600 22px monospace";
        g.fillStyle = "#555";
        g.fillText("withdrawals halted", 16, 150);
      });
    } else if (c.key === "cz") {
      poster(m, 1.2, 0.5, 0, 1.75, -2.62, (g, W, H) => {
        g.clearRect(0, 0, W, H);
        g.fillStyle = "#2a2622";
        g.font = "700 58px 'Comic Sans MS', 'Marker Felt', sans-serif";
        g.textAlign = "center";
        g.fillText("FUNDS ARE SAFU", W / 2, H * 0.55, W - 10);
      });
      poster(m, 0.4, 0.5, hw - 0.01, 1.4, -1.6, (g, W, H) => {
        g.clearRect(0, 0, W, H);
        g.fillStyle = "#2a2622";
        g.font = "800 200px 'Marker Felt', sans-serif";
        g.textAlign = "center";
        g.fillText("4", W / 2, H * 0.78);
      }).rotation.y = rot - Math.PI / 2;
    } else if (c.key === "zhu") {
      poster(m, 0.62, 0.62, -0.1, 1.5, -2.62, (g, W, H) => {
        g.fillStyle = "#f2efe6";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#1a1a1a";
        g.font = "800 30px sans-serif";
        g.textAlign = "center";
        g.fillText("SUPERCYCLE", W / 2, 44);
        g.strokeStyle = "#1a9a4a";
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(20, H - 40);
        g.lineTo(W * 0.45, 80);
        g.stroke();
        g.strokeStyle = "#c0201a";
        g.beginPath();
        g.moveTo(W * 0.45, 80);
        g.lineTo(W - 20, H - 20);
        g.stroke();
      });
    } else if (c.key === "ross") {
      // books stacked by the bunk
      for (let n = 0; n < 6; n++) box(k.items[n], 0.22, 0.05, 0.16, hw - 0.25, 0.79 + n * 0.05, -1.3);
    } else if (c.key === "you") {
      // the tally marks of someone who honked once too often
      poster(m, 0.9, 0.6, 0, 1.45, -2.62, (g, W, H) => {
        g.clearRect(0, 0, W, H);
        g.strokeStyle = "#2a2622";
        g.lineWidth = 5;
        for (let gIdx = 0; gIdx < 4; gIdx++)
          for (let r = 0; r < 2; r++) {
            const x0 = 18 + gIdx * 58,
              y0 = 20 + r * 76;
            for (let n = 0; n < 4; n++) {
              g.beginPath();
              g.moveTo(x0 + n * 11, y0);
              g.lineTo(x0 + n * 11 + 2, y0 + 56);
              g.stroke();
            }
            g.beginPath();
            g.moveTo(x0 - 6, y0 + 44);
            g.lineTo(x0 + 44, y0 + 10);
            g.stroke();
          }
      });
    }

    if (c.id) {
      const p = at(-0.15, -0.65);
      const face = new THREE.Vector3(0, 0, 1).transformDirection(m);
      void k.person(c.id, [p.x, 0, p.z], c.name, {
        face,
        talk: c.lines,
        near: 6,
        info: () => info(c, number, k, lastLine),
      }).then((s) => {
        if (!s) return;
        const say = s.say.bind(s);
        s.say = (text, sec, tone) => {
          lastLine = text;
          say(text, sec, c.key === "bcc" ? "shout" : tone);
        };
      });
    }
  }
}
