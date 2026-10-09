import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { StreetPay, type Mark } from "../../data/streetpay";
import { qrCanvas, WALLETS } from "../../ui/paydesk";
import { F, GOLD, JP, SERIF, type ReserveKit } from "./kit";

/**
 * The wallet gallery in the banking hall's west aisle: Zodl and Vizor as giant phones on plinths,
 * each with its emblem turning over it and a live QR code on its screen that pays ZStreet from
 * the visitor's own wallet (a plain payment is a tip: fireworks). Clicking one opens the wallet
 * desk (where a browser wallet like Noir connects in one click, no QR needed).
 * By the doors, the guestbook wall: the latest lines signed with a shielded memo.
 */

const f = F.hall;
const AISLE_X = -17.6;
const PHONES: { key: "zodl" | "vizor"; z: number }[] = [
  { key: "zodl", z: -24.6 },
  { key: "vizor", z: -29.4 },
];
const FACE = Math.PI / 2; // towards the hall (+x)

export function wallets(k: ReserveKit) {
  let tipUri: string | null = null;
  let qr: HTMLCanvasElement | null = null;
  void StreetPay.info().then(async (i) => {
    tipUri = i?.enabled ? i.tip_uri : null;
    if (tipUri) qr = await qrCanvas(tipUri, 360);
  });

  // the gallery's sign and a runner on the floor
  k.label(f, "WALLET GALLERY", -19.85, 5.6, -27, { h: 0.34, color: GOLD, font: `700 80px ${SERIF}`, ry: FACE });
  k.label(f, "財布 · YOUR KEYS, YOUR CITY", -19.85, 5.15, -27, { h: 0.16, color: "#e9dfca", font: `600 60px ${JP}`, ry: FACE });
  k.box(f, 3.4, 0.012, 9.4, AISLE_X + 0.4, 0, -27, "#5a1414", "matte");
  k.box(f, 3.0, 0.014, 9.0, AISLE_X + 0.4, 0, -27, "#7a1c1c", "matte");

  for (const p of PHONES) {
    const w = WALLETS.find((x) => x.key === p.key)!;
    // plinth
    k.box(f, 1.5, 0.5, 1.5, AISLE_X, 0, p.z, "#1f3b31", "polish");
    k.box(f, 1.62, 0.06, 1.62, AISLE_X, 0.5, p.z, GOLD, "metal");
    k.solid(f, AISLE_X - 0.8, p.z - 0.8, AISLE_X + 0.8, p.z + 0.8);
    // the phone: a slab with rounded shoulders, a bezel, and its screen facing the hall
    k.box(f, 0.24, 2.7, 1.32, AISLE_X, 0.56, p.z, "#0d0d10", "polish");
    k.box(f, 0.26, 2.55, 1.18, AISLE_X + 0.005, 0.635, p.z, "#16161b", "glass");
    k.box(f, 0.1, 0.02, 0.32, AISLE_X + 0.13, 3.14, p.z, "#2a2a30", "matte");
    k.light(f, AISLE_X + 2.4, 2.6, p.z, w.color, 6, 7);
    const scr = k.screen(f, 1.08, 2.3, (g, W, H) => drawPhone(g, W, H, w.name, w.color, w.kind, qr, !!tipUri), 2, 512);
    k.add(f, scr, AISLE_X + 0.135, 0.56 + 0.12 + 1.15, p.z, FACE);
    k.hit(f, 0.6, 3.2, 1.6, AISLE_X + 0.2, 0, p.z, `<b>${w.name}</b><span>${w.kind} · scan, or click for what it can do</span>`, () => ({ eyebrow: "Wallet gallery", title: w.name, panel: "wallets", wallet: w.key }));
    // its emblem, turning over the phone
    const logo = emblem(p.key);
    k.add(f, logo, AISLE_X, 4.15, p.z, 0);
    const phase = p.z;
    k.ticks[f].push((dt, t) => {
      logo.rotation.y += dt * 1.1;
      logo.position.y = k.y(f) + 4.15 + Math.sin(t * 1.4 + phase) * 0.08;
    });
    k.pick(f, logo.children[0], `<b>${w.name}</b><span>${w.kind}</span>`, () => ({ eyebrow: "Wallet gallery", title: w.name, panel: "wallets", wallet: w.key }));
    k.label(f, w.name.toUpperCase(), AISLE_X + 0.8, 0.28, p.z, { h: 0.13, color: "#2a1a08", bg: "#c9a24a", font: `700 64px ${SERIF}`, ry: FACE });
  }

  guestbook(k);
}

function drawPhone(g: CanvasRenderingContext2D, W: number, H: number, name: string, color: string, kind: string, qr: HTMLCanvasElement | null, on: boolean) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#14131a");
  bg.addColorStop(1, "#07070a");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // status bar
  g.fillStyle = "#cfcfd6";
  g.font = `600 22px ui-monospace, monospace`;
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillText("ZEC", 26, 34);
  g.textAlign = "right";
  g.fillText("◐ 100%", W - 26, 34);
  // the wallet's name
  g.textAlign = "center";
  g.fillStyle = color;
  g.font = `800 76px ${SERIF}`;
  g.fillText(name, W / 2, 140);
  g.fillStyle = "#8f8f99";
  g.font = `500 24px ui-sans-serif, sans-serif`;
  g.fillText(kind, W / 2, 196);
  // the code
  const s = W - 90;
  const y = 250;
  g.fillStyle = "#f6efe0";
  g.fillRect(45 - 10, y - 10, s + 20, s + 20);
  if (qr && on) g.drawImage(qr, 45, y, s, s);
  else {
    g.fillStyle = "#2a2a30";
    g.font = `600 30px ui-sans-serif, sans-serif`;
    g.fillText(on ? "…" : "Soon", W / 2, y + s / 2);
  }
  g.fillStyle = "#f1f1f1";
  g.font = `700 34px ui-sans-serif, sans-serif`;
  g.fillText(on ? "Scan to tip the city" : "Wallet desk opening", W / 2, y + s + 60);
  g.fillStyle = "#a3a3a3";
  g.font = `500 24px ui-sans-serif, sans-serif`;
  g.fillText("shielded · fireworks for everyone", W / 2, y + s + 100);
  // the action row
  const by = H - 150;
  g.fillStyle = color;
  roundRect(g, 60, by, W - 120, 70, 35);
  g.fill();
  g.fillStyle = "#0d0b08";
  g.font = `700 28px ui-sans-serif, sans-serif`;
  g.fillText("Tap · guestbook · tips", W / 2, by + 36);
  g.fillStyle = "#5a5a64";
  roundRect(g, W / 2 - 80, H - 40, 160, 8, 4);
  g.fill();
}

/**
 * The wallets' own marks, in 3D. Zodl: its app icon, the origami bird (three triangles, traced
 * from zodl-inc/zodl-android's launcher icon), black on its yellow disc. Vizor: its head-with-visor
 * icon (the path of chainapsis/vizor-wallet assets/icons/vizor.svg), in silver on a dark disc.
 * Each mark goes through its disc, so it reads from both sides as it turns.
 */
const ZODL_BIRD: [number, number][][] = [
  [[0.5162, 0.3241], [0.6273, 0.3611], [0.5833, 0.4583]],
  [[0.4954, 0.3264], [0.6597, 0.6481], [0.3958, 0.4028]],
  [[0.287, 0.6528], [0.4606, 0.4907], [0.6389, 0.6528]],
];
const VIZOR_ICON = { w: 13.7365, h: 16.4912, d: "M6.3133 0.0415055C6.84272 -0.117143 7.20955 0.204748 7.20955 0.571027V0.971819C7.20955 1.27582 7.32915 1.54024 7.8011 1.36006C11.4217 -0.0222227 15.3887 3.59281 13.0212 7.9332L12.3096 9.28859C11.8239 10.2328 11.704 10.9919 12.5168 11.6968L12.8515 12.0338C13.1926 12.5281 12.9738 12.936 12.5168 13.0538C11.2717 13.3746 8.27224 13.8229 4.72026 16.3792C4.2063 16.7491 3.71881 16.1282 3.95005 15.609C4.39051 14.62 4.85783 13.9995 5.00423 13.508C5.0534 13.3422 4.93101 13.1726 4.75677 13.1726H3.49088C3.31137 13.1726 3.15394 13.1718 3.0095 13.1282C2.87007 13.0861 2.73897 13.0026 2.61838 12.8281C1.72808 11.0737 0.77519 9.225 0.0542115 7.76847C-0.104449 7.44795 0.0989953 7.14403 0.484096 7.14403H4.16407C4.50219 7.14403 4.73948 6.88856 4.79287 6.63406C4.8198 6.5054 4.8014 6.36793 4.71615 6.26175C4.64086 6.1682 4.52209 6.10958 4.36414 6.09627L4.29344 6.09326L2.02453 6.09853C1.57022 6.09853 0.994853 5.85948 1.25432 5.21111C2.28948 2.62436 3.62356 0.848426 6.3133 0.0415055ZM3.55197 10.2957C3.21851 10.2958 2.95065 10.5711 2.95065 10.9073C2.95073 11.2435 3.21856 11.5182 3.55197 11.5183C3.88544 11.5183 4.15395 11.2436 4.15403 10.9073C4.15403 10.571 3.88549 10.2957 3.55197 10.2957ZM2.65073 9.16876C2.3173 9.16889 2.04941 9.44421 2.0494 9.78045C2.04941 10.1167 2.3173 10.392 2.65073 10.3921C2.98422 10.3921 3.25278 10.1168 3.25279 9.78045C3.25278 9.44414 2.98422 9.1688 2.65073 9.16876ZM4.52893 9.16876C4.19544 9.16882 3.92761 9.44417 3.92761 9.78045C3.92762 10.1167 4.19544 10.3921 4.52893 10.3921C4.86247 10.3921 5.13024 10.1168 5.13025 9.78045C5.13025 9.44413 4.86247 9.16876 4.52893 9.16876ZM3.55197 7.90684C3.21851 7.90694 2.95065 8.18226 2.95065 8.51853C2.95078 8.85468 3.21859 9.12939 3.55197 9.12948C3.88541 9.12946 4.15389 8.85473 4.15403 8.51853C4.15403 8.18221 3.88549 7.90686 3.55197 7.90684Z" };

function emblem(key: "zodl" | "vizor") {
  const g = new THREE.Group();
  const R = 0.5;
  const T = 0.08;
  const extrude = { depth: T + 0.07, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 2, curveSegments: 24 };
  let shapes: THREE.Shape[];
  let disc: string, mark: THREE.MeshStandardMaterial, rim: string;
  if (key === "zodl") {
    // the bird's box is centred and sized to 0.72 of the disc
    const cx = (0.287 + 0.6597) / 2,
      cy = (0.3241 + 0.6528) / 2,
      k = 0.72 / (0.6528 - 0.3241);
    shapes = ZODL_BIRD.map((t) => new THREE.Shape(t.map(([x, y]) => new THREE.Vector2((x - cx) * k, -(y - cy) * k))));
    disc = "#fcbb1a";
    rim = "#ffd257";
    mark = new THREE.MeshStandardMaterial({ color: "#0b0b0d", metalness: 0.3, roughness: 0.35 });
  } else {
    const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIZOR_ICON.w} ${VIZOR_ICON.h}"><path d="${VIZOR_ICON.d}"/></svg>`);
    const k = 0.66 / VIZOR_ICON.h;
    shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p)).map((sh) => {
      const pts = sh.extractPoints(24);
      const flip = (v: THREE.Vector2) => new THREE.Vector2((v.x - VIZOR_ICON.w / 2) * k, -(v.y - VIZOR_ICON.h / 2) * k);
      const out = new THREE.Shape(pts.shape.map(flip));
      out.holes = pts.holes.map((h) => new THREE.Path(h.map(flip)));
      return out;
    });
    disc = "#121218";
    rim = "#8f7bff";
    mark = new THREE.MeshStandardMaterial({ color: "#e6e6ec", metalness: 0.9, roughness: 0.22, emissive: new THREE.Color("#8f7bff"), emissiveIntensity: 0.18 });
  }
  const markGeo = new THREE.ExtrudeGeometry(shapes, extrude);
  markGeo.translate(0, 0, -(T + 0.07) / 2);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(R, R, T, 64).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: disc, metalness: 0.55, roughness: 0.3, emissive: new THREE.Color(disc), emissiveIntensity: key === "zodl" ? 0.25 : 0.05 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.03, 12, 64), new THREE.MeshStandardMaterial({ color: rim, metalness: 0.9, roughness: 0.25, emissive: new THREE.Color(rim), emissiveIntensity: 0.5 }));
  g.add(new THREE.Mesh(markGeo, mark), face, ring);
  g.scale.setScalar(1.2);
  return g;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---- the guestbook wall, by the doors ----------------------------------------------------------

const GB_X = -15;
const GB_Z = -0.32;

function guestbook(k: ReserveKit) {
  let lines: Mark[] = [];
  const load = async () => {
    const l = await StreetPay.guestbook();
    if (l) lines = l;
  };
  void load();
  window.addEventListener("zstreet:guestbook", () => void load());
  setInterval(() => void load(), 120_000);

  // gilt frame round a dark green board
  k.box(f, 5.6, 3.5, 0.16, GB_X, 1.15, GB_Z + 0.08, GOLD, "metal");
  k.box(f, 5.3, 3.2, 0.1, GB_X, 1.3, GB_Z - 0.02, "#0f2a20", "polish");
  const scr = k.screen(f, 5.1, 3.0, (g, W, H) => drawGuestbook(g, W, H, lines), 5, 1024);
  k.add(f, scr, GB_X, 1.3 + 1.5, GB_Z - 0.08, Math.PI);
  k.hit(f, 5.6, 3.6, 0.6, GB_X, 1.1, GB_Z - 0.3, "<b>Guestbook</b><span>sign it from your wallet</span>", () => ({ eyebrow: "ZEC Reserve", title: "Guestbook", panel: "guestbook" }));
  k.label(f, "芳名録 · GUESTBOOK", GB_X, 5.0, GB_Z - 0.05, { h: 0.26, color: GOLD, font: `700 80px ${SERIF}`, ry: Math.PI });
  k.light(f, GB_X, 4.2, -2.4, "#ffd7a0", 5, 7);
}

function drawGuestbook(g: CanvasRenderingContext2D, W: number, H: number, lines: Mark[]) {
  g.fillStyle = "#0f2a20";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(201,162,74,0.55)";
  g.lineWidth = 3;
  g.strokeRect(16, 16, W - 32, H - 32);
  g.textBaseline = "top";
  g.textAlign = "left";
  if (!lines.length) {
    g.textAlign = "center";
    g.fillStyle = "#e8c45a";
    g.font = `italic 600 44px ${SERIF}`;
    g.fillText("Be the first to sign.", W / 2, H / 2 - 50);
    g.fillStyle = "#9fb3a8";
    g.font = `500 28px ui-sans-serif, sans-serif`;
    g.fillText("A line here is the memo of a shielded payment.", W / 2, H / 2 + 14);
    return;
  }
  let y = 44;
  for (const m of lines.slice(0, 7)) {
    const text = m.text.replace(/\s+/g, " ");
    g.fillStyle = "#f2e9d6";
    g.font = `italic 500 34px ${SERIF}`;
    g.fillText(`“${text.length > 64 ? `${text.slice(0, 62)}…` : text}”`, 50, y);
    g.fillStyle = "#c9a24a";
    g.font = `500 20px ui-monospace, monospace`;
    g.fillText(`block ${m.height.toLocaleString("en-US")}`, 50, y + 42);
    y += 80;
    if (y > H - 80) break;
  }
  g.textAlign = "right";
  g.fillStyle = "#9fb3a8";
  g.font = `500 22px ui-sans-serif, sans-serif`;
  g.fillText("click to sign from your wallet", W - 44, H - 52);
}
