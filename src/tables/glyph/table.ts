/**
 * LAST SNARK's table, painted on one canvas whenever the layout changes (never per frame): the dark
 * room under a warm lamp, the table's shadow, a stitched leather rail with its front lip, a thin
 * flare inlay, the felt (fibres, the rail's shadow on it, the lamp's pool), and what is screen-printed
 * on the felt: the deck's slot, the discard's ring with its four pool marks, the direction track and
 * the table's name. The moving things (the lit ink, the chevrons, the turn token) live in the DOM.
 */
import { mulberry } from "./engine";
import { pipTrace } from "./art";

export interface TableGeom {
  W: number;
  H: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** The draw pile and the discard (centres), the pile card's size. */
  px: number;
  py: number;
  dx: number;
  dy: number;
  pw: number;
  ph: number;
  /** The direction track (an ellipse round the middle). */
  tx: number;
  ty: number;
  /** The discard's printed ring. */
  ringR: number;
  rail: number;
  compact: boolean;
}

let feltTile: HTMLCanvasElement | null = null;
/** Felt fibres: a tile of fine noise with short hairs. */
function felt(): HTMLCanvasElement {
  if (feltTile) return feltTile;
  const N = 192;
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const g = cv.getContext("2d")!;
  const r = mulberry(7);
  const im = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = 128 + (r() - 0.5) * 70;
    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v;
    im.data[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  g.lineWidth = 0.7;
  for (let k = 0; k < 700; k++) {
    const x = r() * N,
      y = r() * N,
      a = r() * Math.PI * 2,
      l = 1.5 + r() * 3.5;
    g.strokeStyle = r() < 0.5 ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.25)";
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return (feltTile = cv);
}
let leatherTile: HTMLCanvasElement | null = null;
/** Leather: a soft pebble grain. */
function leather(): HTMLCanvasElement {
  if (leatherTile) return leatherTile;
  const N = 160;
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, N, N);
  const r = mulberry(29);
  for (let k = 0; k < 900; k++) {
    const x = r() * N,
      y = r() * N,
      s = 1 + r() * 2.6;
    g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.16)";
    g.beginPath();
    g.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return (leatherTile = cv);
}

/** A stadium (a rectangle with round ends) round (cx, cy), half sizes rx × ry. */
function stadium(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  g.beginPath();
  g.roundRect(cx - rx, cy - ry, rx * 2, ry * 2, Math.min(rx, ry));
}

/** Text set along an ellipse, centred on angle `a` (radians, screen y down), reading left to right. */
function arcText(g: CanvasRenderingContext2D, s: string, cx: number, cy: number, rx: number, ry: number, a: number, bottom: boolean) {
  const widths = [...s].map((ch) => g.measureText(ch).width);
  const total = widths.reduce((x, y) => x + y, 0);
  const r = (rx + ry) / 2;
  let ang = a + ((bottom ? 1 : -1) * total) / r / 2;
  for (let i = 0; i < s.length; i++) {
    const w = widths[i];
    const half = w / r / 2;
    ang += bottom ? -half : half;
    const x = cx + Math.cos(ang) * rx,
      y = cy + Math.sin(ang) * ry;
    g.save();
    g.translate(x, y);
    g.rotate(ang + (bottom ? -Math.PI / 2 : Math.PI / 2));
    g.fillText(s[i], 0, 0);
    g.restore();
    ang += bottom ? -half : half;
  }
}

export function paintTable(cv: HTMLCanvasElement, L: TableGeom) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = L.W,
    H = L.H;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  const g = cv.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { cx, cy, rx, ry, rail } = L;
  const lip = rail * 0.55;

  // the room: dark, the lamp's warmth falling on the floor round the table
  g.fillStyle = "#0b0a09";
  g.fillRect(0, 0, W, H);
  const room = g.createRadialGradient(cx, cy - ry * 0.3, 10, cx, cy, Math.max(W, H) * 0.75);
  room.addColorStop(0, "rgba(120,82,52,0.30)");
  room.addColorStop(0.5, "rgba(60,40,26,0.16)");
  room.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = room;
  g.fillRect(0, 0, W, H);

  // the table's shadow on the floor
  g.save();
  g.shadowColor = "rgba(0,0,0,0.85)";
  g.shadowBlur = rail * 2.4;
  g.shadowOffsetY = rail * 1.1;
  stadium(g, cx, cy + lip, rx + rail, ry + rail);
  g.fillStyle = "#050404";
  g.fill();
  g.restore();

  // the rail's front lip (its thickness, seen from above the table)
  stadium(g, cx, cy + lip, rx + rail, ry + rail);
  const lipG = g.createLinearGradient(0, cy, 0, cy + ry + rail + lip);
  lipG.addColorStop(0, "#120d0b");
  lipG.addColorStop(1, "#070505");
  g.fillStyle = lipG;
  g.fill();

  // the rail: padded leather, lit from above
  stadium(g, cx, cy, rx + rail, ry + rail);
  const rg = g.createLinearGradient(0, cy - ry - rail, 0, cy + ry + rail);
  rg.addColorStop(0, "#3b2d26");
  rg.addColorStop(0.5, "#2a201b");
  rg.addColorStop(1, "#1a1310");
  g.fillStyle = rg;
  g.fill();
  g.save();
  g.clip();
  g.globalCompositeOperation = "overlay";
  g.globalAlpha = 0.5;
  g.fillStyle = g.createPattern(leather(), "repeat")!;
  g.fillRect(cx - rx - rail, cy - ry - rail, (rx + rail) * 2, (ry + rail) * 2);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  // the padding's roundness: light along the middle of the rail, shade at both edges
  g.lineWidth = rail * 0.5;
  g.strokeStyle = "rgba(255,226,196,0.06)";
  stadium(g, cx, cy, rx + rail * 0.52, ry + rail * 0.52);
  g.stroke();
  // the lamp catching the far rail
  const hl = g.createRadialGradient(cx, cy - ry - rail * 0.4, 4, cx, cy - ry, rx * 0.9);
  hl.addColorStop(0, "rgba(255,220,180,0.22)");
  hl.addColorStop(1, "rgba(255,220,180,0)");
  g.fillStyle = hl;
  g.fillRect(cx - rx - rail, cy - ry - rail, (rx + rail) * 2, rail * 2.2);
  g.restore();
  // the stitching
  g.save();
  g.setLineDash([3.2, 3.4]);
  g.lineWidth = 1;
  g.strokeStyle = "rgba(230,200,170,0.22)";
  stadium(g, cx, cy, rx + rail * 0.78, ry + rail * 0.78);
  g.stroke();
  stadium(g, cx, cy, rx + rail * 0.26, ry + rail * 0.26);
  g.stroke();
  g.restore();
  // the outer edge
  g.lineWidth = 1;
  g.strokeStyle = "rgba(255,230,200,0.10)";
  stadium(g, cx, cy, rx + rail - 0.5, ry + rail - 0.5);
  g.stroke();

  // the inlay between rail and felt: a dark wood band and a fine flare line
  stadium(g, cx, cy, rx + 3.5, ry + 3.5);
  g.fillStyle = "#140e0b";
  g.fill();
  stadium(g, cx, cy, rx + 1.6, ry + 1.6);
  g.lineWidth = 1.1;
  g.strokeStyle = "rgba(255,107,53,0.55)";
  g.stroke();

  // the felt
  g.save();
  stadium(g, cx, cy, rx, ry);
  g.clip();
  const fg = g.createRadialGradient(cx, cy - ry * 0.12, 4, cx, cy, Math.max(rx, ry) * 1.05);
  fg.addColorStop(0, "#1f5a4b");
  fg.addColorStop(0.45, "#16463b");
  fg.addColorStop(0.8, "#0f3129");
  fg.addColorStop(1, "#0a221d");
  g.fillStyle = fg;
  g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
  g.globalCompositeOperation = "overlay";
  g.globalAlpha = 0.32;
  g.fillStyle = g.createPattern(felt(), "repeat")!;
  g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;

  // what is printed on the felt
  const ink = "rgba(214,236,224,";
  // the direction track: a fine double line
  g.lineWidth = 1;
  g.strokeStyle = ink + "0.07)";
  g.beginPath();
  g.ellipse(cx, cy, L.tx + 7, L.ty + 7, 0, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.ellipse(cx, cy, L.tx - 7, L.ty - 7, 0, 0, Math.PI * 2);
  g.stroke();
  // the table's name along the track, below
  if (!L.compact) {
    g.fillStyle = ink + "0.10)";
    g.font = `600 ${Math.round(Math.min(15, ry * 0.07))}px Geist, Roboto, sans-serif`;
    g.letterSpacing = "6px";
    g.textAlign = "center";
    g.textBaseline = "middle";
    arcText(g, "LAST SNARK", cx, cy, L.tx + 22, L.ty + 22, Math.PI / 2, true);
    g.letterSpacing = "0px";
  }
  // the deck's slot
  const pad = L.pw * 0.09;
  g.lineWidth = 1.2;
  g.strokeStyle = ink + "0.13)";
  g.beginPath();
  g.roundRect(L.px - L.pw / 2 - pad, L.py - L.ph / 2 - pad, L.pw + pad * 2, L.ph + pad * 2, L.pw * 0.1);
  g.stroke();
  g.setLineDash([2, 4]);
  g.beginPath();
  g.roundRect(L.px - L.pw / 2 - pad * 2, L.py - L.ph / 2 - pad * 2, L.pw + pad * 4, L.ph + pad * 4, L.pw * 0.14);
  g.stroke();
  g.setLineDash([]);
  // the discard's ring, its four pool marks at the compass points (IRONWOOD up, then clockwise)
  g.lineWidth = 1.2;
  g.strokeStyle = ink + "0.12)";
  g.beginPath();
  g.arc(L.dx, L.dy, L.ringR, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 0.8;
  g.beginPath();
  g.arc(L.dx, L.dy, L.ringR - 5, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 2;
    pipTrace(g, i, L.dx + Math.cos(a) * L.ringR, L.dy + Math.sin(a) * L.ringR, Math.max(5, L.pw * 0.075));
    g.fillStyle = "#123a31";
    g.fill();
    g.strokeStyle = ink + "0.2)";
    g.stroke();
  }

  // the rail's shadow on the felt
  g.shadowColor = "rgba(0,0,0,0.85)";
  g.shadowBlur = rail * 1.4;
  g.lineWidth = 8;
  g.strokeStyle = "#000";
  stadium(g, cx, cy, rx + 4, ry + 4);
  g.stroke();
  g.shadowColor = "transparent";
  g.restore();

  // the lamp's pool, and the room falling into the dark at the edges
  const lamp = g.createRadialGradient(cx, cy - ry * 0.2, 0, cx, cy - ry * 0.1, Math.max(rx, ry) * 1.1);
  lamp.addColorStop(0, "rgba(255,226,186,0.10)");
  lamp.addColorStop(0.6, "rgba(255,226,186,0.03)");
  lamp.addColorStop(1, "rgba(255,226,186,0)");
  g.globalCompositeOperation = "screen";
  g.fillStyle = lamp;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "source-over";
  const vig = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, Math.hypot(W, H) * 0.62);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.6)");
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);
}
