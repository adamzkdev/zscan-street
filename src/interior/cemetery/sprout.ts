import * as THREE from "three";
import { get } from "../../data/zscan";

/** /v1/street/sprout */
interface SproutData {
  height: number;
  pool: number;
  nu7_height: number | null;
  out_30d: number;
  exits: { txid: string; height: number; time: string; amount: number; to: "sapling" | "orchard" | "ironwood" | "transparent" }[];
}

const COLOR = { sapling: "#3987e5", orchard: "#eb6834", ironwood: "#1baf7a", transparent: "#eda100" };
const GREEN = "#9adf9a";
const MONO = '"JetBrains Mono", Menlo, monospace';
/** One ghost leaves the tomb every this many seconds. */
const EVERY = 7;
/** How long a ghost takes to rise out of the crypt. */
const RISE = 6.5;
/** Refetch while the crypt is open (seconds). */
const REFRESH = 300;
/** NU7's announced day, until its height is known. */
const NU7_DAY = Date.parse("2026-11-05T12:00:00Z");

const zec = (zat: number, d = 2) => (zat / 1e8).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

function ago(iso: string): string {
  const d = Math.max(0, (Date.now() - Date.parse(iso)) / 86400_000);
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  if (d < 60) return `${Math.floor(d)} days ago`;
  return `${Math.floor(d / 30)} months ago`;
}

/** A 16×16 pixel ghost (the zkSNARKs are pixel art too), eyes in `eye`. */
function ghostArt(g: CanvasRenderingContext2D, x: number, y: number, px: number, eye: string) {
  const rows = [
    ".....######.....",
    "...##########...",
    "..############..",
    ".##############.",
    ".###EE####EE###.",
    "####EE####EE####",
    "################",
    "################",
    "################",
    "################",
    "################",
    "################",
    "################",
    "##.###.##.###.##",
    "#...#...#...#..#",
  ];
  rows.forEach((r, j) =>
    [...r].forEach((ch, i) => {
      if (ch === ".") return;
      g.fillStyle = ch === "E" ? eye : "rgba(226,255,236,0.92)";
      g.fillRect(x + i * px, y + j * px, px, px);
    }),
  );
}

/**
 * The Sprout evacuation in the crypt. NU7 leaves whatever is still in Sprout unspendable, so over
 * Sprout's tomb a board counts what is still inside and when the gate closes, and the real
 * transactions that got out rise from the tomb one after another as ghosts, each with its amount,
 * where it went (Sapling, Orchard, Ironwood or transparent) and when.
 */
export function sproutEvacuation(scene: THREE.Scene, tomb: THREE.Vector3, wallZ: number) {
  // the board, on the wall behind the tomb
  const bc = document.createElement("canvas");
  bc.width = 1024;
  bc.height = 448;
  const bg = bc.getContext("2d")!;
  const btex = new THREE.CanvasTexture(bc);
  btex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.92), new THREE.MeshBasicMaterial({ map: btex, toneMapped: false }));
  board.position.set(tomb.x, 2.95, wallZ + 0.03);
  scene.add(board);

  // the ghost: one canvas, redrawn for each exit
  const gc = document.createElement("canvas");
  gc.width = 512;
  gc.height = 512;
  const gg = gc.getContext("2d")!;
  const gtex = new THREE.CanvasTexture(gc);
  gtex.colorSpace = THREE.SRGBColorSpace;
  gtex.magFilter = THREE.NearestFilter;
  const gm = new THREE.MeshBasicMaterial({ map: gtex, transparent: true, depthWrite: false, toneMapped: false });
  const ghost = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), gm);
  ghost.visible = false;
  ghost.renderOrder = 3;
  scene.add(ghost);

  let data: SproutData | null = null;
  let nu7Date: number | null = null;
  let next = 2;
  let age = -1;
  let i = 0;
  let fetched = -REFRESH;
  let drift = 0;

  const load = async () => {
    const [d, u] = await Promise.all([get<SproutData>("/v1/street/sprout"), get<{ upgrades: { name: string; eta: string | null }[] }>("/v1/upgrades")]);
    if (d) data = d;
    const eta = u?.upgrades.find((x) => x.name.toLowerCase() === "nu7")?.eta;
    nu7Date = eta ? Date.parse(eta) : NU7_DAY;
    drawBoard();
  };

  function drawBoard() {
    const g = bg,
      w = bc.width,
      h = bc.height;
    g.fillStyle = "#0b100c";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#8a6a2a";
    g.lineWidth = 8;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = GREEN;
    g.font = `800 40px ${MONO}`;
    g.fillText("LAST CALL FOR SPROUT", w / 2, 62);
    if (!data) {
      g.fillStyle = "#6f8a72";
      g.font = `500 30px ${MONO}`;
      g.fillText("reading the pool…", w / 2, h / 2);
      btex.needsUpdate = true;
      return;
    }
    g.fillStyle = "#f4b728";
    g.font = `900 92px ${MONO}`;
    g.fillText(`${zec(data.pool)} ZEC`, w / 2, 170);
    g.fillStyle = "#cfe8d2";
    g.font = `500 30px ${MONO}`;
    g.fillText("still inside", w / 2, 236);
    g.fillStyle = "#9fb8a2";
    g.font = `500 28px ${MONO}`;
    g.fillText(`${zec(Math.max(0, data.out_30d), 0)} ZEC got out in the last 30 days`, w / 2, 290);
    const days = nu7Date ? Math.max(0, Math.ceil((nu7Date - Date.now()) / 86400_000)) : null;
    const when = data.nu7_height ? `at block #${data.nu7_height.toLocaleString("en-US")}` : "on 5 Nov 2026";
    g.fillStyle = "#ff8a7a";
    g.font = `700 30px ${MONO}`;
    g.fillText(`THE GATE CLOSES WITH NU7 ${when}${days !== null ? ` · ${days} days` : ""}`, w / 2, 362);
    btex.needsUpdate = true;
  }

  function drawGhost(e: SproutData["exits"][number]) {
    const g = gg;
    g.clearRect(0, 0, 512, 512);
    ghostArt(g, 256 - 80, 40, 10, COLOR[e.to]);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(6,10,8,0.78)";
    g.fillRect(36, 236, 440, 176);
    g.fillStyle = "#f4b728";
    g.font = `900 64px ${MONO}`;
    g.fillText(`${zec(e.amount)} ZEC`, 256, 290, 420);
    g.fillStyle = COLOR[e.to];
    g.font = `800 38px ${MONO}`;
    g.fillText(`→ ${e.to.toUpperCase()}`, 256, 348, 420);
    g.fillStyle = "#b9d2bc";
    g.font = `500 28px ${MONO}`;
    g.fillText(`${ago(e.time)} · #${e.height}`, 256, 392, 420);
    gtex.needsUpdate = true;
  }

  drawBoard();
  return {
    update(dt: number, t: number, camQuat: THREE.Quaternion) {
      if (t - fetched > REFRESH) {
        fetched = t;
        void load();
      }
      const exits = data?.exits ?? [];
      if (age < 0 && exits.length && (next -= dt) <= 0) {
        drawGhost(exits[i % exits.length]);
        i++;
        age = 0;
        // out to one side, so the board behind stays readable
        drift = (i % 2 ? 1 : -1) * (2.2 + Math.random() * 0.8);
        ghost.visible = true;
      }
      if (age < 0) return;
      age += dt;
      const k = age / RISE;
      if (k >= 1) {
        age = -1;
        next = EVERY - RISE;
        ghost.visible = false;
        return;
      }
      // out of the lid, up and toward the aisle, swaying; fades in then out
      const side = Math.min(1, k * 2.5);
      ghost.position.set(tomb.x + drift * side + Math.sin(t * 1.6) * 0.2, 1.1 + k * 2.2, tomb.z + 0.6 + k * 3.4);
      ghost.quaternion.copy(camQuat);
      gm.opacity = Math.min(1, k * 5) * Math.min(1, (1 - k) * 3);
    },
  };
}
