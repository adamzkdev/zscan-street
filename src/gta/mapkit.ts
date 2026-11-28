/**
 * What the game's map shows and how (src/gta): the kinds of places (each a coloured disc with a
 * white pictogram, the way the open-world games mark them), the waypoint's pin, the GPS's line.
 * Drawn on a 2D canvas: the radar and the big map share them.
 */

export type Cat = "hq" | "home" | "sight" | "fun" | "shop" | "food" | "bar" | "work" | "metro" | "ferry" | "car" | "yacht";

export const CAT: Record<Cat, { color: string; label: string }> = {
  hq: { color: "#f4b728", label: "MEMPOOL HQ" },
  home: { color: "#3ecf8e", label: "Your home" },
  sight: { color: "#3b9ae8", label: "Landmarks" },
  fun: { color: "#a35ef0", label: "Going out" },
  shop: { color: "#f08a2c", label: "Shops" },
  food: { color: "#e0513f", label: "Cafés" },
  bar: { color: "#c23d78", label: "Bars" },
  work: { color: "#5f7590", label: "Towers & offices" },
  metro: { color: "#232a3a", label: "Metro" },
  ferry: { color: "#1ea896", label: "Ferry" },
  car: { color: "#f4b728", label: "Your ZK-GT" },
  yacht: { color: "#2f7fe0", label: "Your yacht" },
};

/** The walk-in places by their key: what kind of place each is. */
export const PLACE_CAT: Record<string, Cat> = {
  mempool: "hq",
  home: "home",
  museum: "sight",
  palm: "sight",
  pyramid: "sight",
  colosseum: "sight",
  library: "sight",
  bigben: "sight",
  gardens: "sight",
  eiffel: "sight",
  arab: "sight",
  cemetery: "sight",
  needle: "sight",
  statue: "sight",
  prison: "sight",
  stadium: "fun",
  convention: "fun",
  opera: "fun",
  gamehouse: "fun",
  nu7tower: "fun",
  mall: "shop",
  reserve: "work",
  hotel: "work",
  university: "work",
  zlab: "work",
  tower: "work",
  noir: "work",
  vizor: "work",
  zsalab: "work",
  zodl: "work",
  factory: "work",
  "tower-halo": "work",
  "tower-orchard": "work",
  "tower-sapling": "work",
};

/** The shape inside a disc (white), for a kind, at (x, y), `s` its radius. */
export function glyph(g: CanvasRenderingContext2D, cat: Cat, x: number, y: number, s: number, color = "#ffffff") {
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineCap = "round";
  g.lineJoin = "round";
  const u = s / 10;
  g.lineWidth = 1.6 * u;
  switch (cat) {
    case "hq": {
      g.font = `800 ${13 * u}px Archivo, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("Z", 0, 0.5 * u);
      break;
    }
    case "sight": {
      // a portico: a pediment over three columns
      g.beginPath();
      g.moveTo(-6 * u, -2.5 * u);
      g.lineTo(0, -6.5 * u);
      g.lineTo(6 * u, -2.5 * u);
      g.closePath();
      g.fill();
      for (const cx of [-4.2, 0, 4.2]) g.fillRect((cx - 0.9) * u, -1.6 * u, 1.8 * u, 6 * u);
      g.fillRect(-6.4 * u, 4.6 * u, 12.8 * u, 1.6 * u);
      break;
    }
    case "fun": {
      // a star
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const r = (k % 2 ? 2.9 : 6.6) * u,
          a = -Math.PI / 2 + (k * Math.PI) / 5;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      break;
    }
    case "shop": {
      // a bag with its handle
      g.fillRect(-5 * u, -2 * u, 10 * u, 8 * u);
      g.beginPath();
      g.arc(0, -2 * u, 3 * u, Math.PI, 0);
      g.stroke();
      break;
    }
    case "food": {
      // a cup on its saucer, steam
      g.fillRect(-5 * u, -2 * u, 8 * u, 6.5 * u);
      g.beginPath();
      g.arc(3.4 * u, 1.2 * u, 2.2 * u, -Math.PI / 2, Math.PI / 2);
      g.stroke();
      g.fillRect(-6.5 * u, 5 * u, 11 * u, 1.4 * u);
      g.beginPath();
      g.moveTo(-2 * u, -4 * u);
      g.lineTo(-2 * u, -6.5 * u);
      g.moveTo(1 * u, -4 * u);
      g.lineTo(1 * u, -6.5 * u);
      g.stroke();
      break;
    }
    case "bar": {
      // a cocktail glass
      g.beginPath();
      g.moveTo(-6 * u, -5.5 * u);
      g.lineTo(6 * u, -5.5 * u);
      g.lineTo(0, 1 * u);
      g.closePath();
      g.fill();
      g.fillRect(-0.8 * u, 0.5 * u, 1.6 * u, 4.5 * u);
      g.fillRect(-3.5 * u, 4.6 * u, 7 * u, 1.5 * u);
      break;
    }
    case "work": {
      // a tower with its windows
      g.fillRect(-4.5 * u, -6.5 * u, 9 * u, 13 * u);
      g.fillStyle = CAT.work.color;
      for (let r = 0; r < 4; r++) for (const c of [-2.2, 1.2]) g.fillRect(c * u, (-4.8 + r * 2.8) * u, 1.6 * u, 1.5 * u);
      break;
    }
    case "metro": {
      g.font = `800 ${12 * u}px Archivo, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("M", 0, 0.6 * u);
      break;
    }
    case "yacht": {
      // a yacht in profile: a long hull, the saloon, the flybridge's hardtop
      g.beginPath();
      g.moveTo(-7.5 * u, 0.5 * u);
      g.lineTo(7.5 * u, 0.5 * u);
      g.lineTo(5 * u, 4.5 * u);
      g.lineTo(-6.5 * u, 4.5 * u);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(-4.5 * u, 0.5 * u);
      g.lineTo(-4.5 * u, -2.5 * u);
      g.lineTo(2 * u, -2.5 * u);
      g.lineTo(4.5 * u, 0.5 * u);
      g.closePath();
      g.fill();
      g.fillRect(-3.5 * u, -5 * u, 5 * u, 1.3 * u);
      break;
    }
    case "ferry": {
      // a boat: its hull, its cabin
      g.beginPath();
      g.moveTo(-7 * u, 1 * u);
      g.lineTo(7 * u, 1 * u);
      g.lineTo(4.5 * u, 5 * u);
      g.lineTo(-4.5 * u, 5 * u);
      g.closePath();
      g.fill();
      g.fillRect(-3.5 * u, -3.5 * u, 6 * u, 3.6 * u);
      g.fillRect(-0.6 * u, -6.5 * u, 1.4 * u, 3 * u);
      break;
    }
    case "home": {
      // a house: its roof, its walls, its door
      g.beginPath();
      g.moveTo(-6 * u, -0.5 * u);
      g.lineTo(0, -6 * u);
      g.lineTo(6 * u, -0.5 * u);
      g.lineTo(4.5 * u, -0.5 * u);
      g.lineTo(4.5 * u, 5.5 * u);
      g.lineTo(1.4 * u, 5.5 * u);
      g.lineTo(1.4 * u, 1.6 * u);
      g.lineTo(-1.4 * u, 1.6 * u);
      g.lineTo(-1.4 * u, 5.5 * u);
      g.lineTo(-4.5 * u, 5.5 * u);
      g.lineTo(-4.5 * u, -0.5 * u);
      g.closePath();
      g.fill();
      break;
    }
    case "car": {
      // a car from the side
      g.beginPath();
      g.moveTo(-7 * u, 3 * u);
      g.lineTo(-7 * u, 0);
      g.lineTo(-4 * u, -1 * u);
      g.lineTo(-2 * u, -4 * u);
      g.lineTo(3 * u, -4 * u);
      g.lineTo(5 * u, -1 * u);
      g.lineTo(7 * u, 0);
      g.lineTo(7 * u, 3 * u);
      g.closePath();
      g.fill();
      g.fillStyle = CAT.car.color;
      for (const cx of [-4, 4]) {
        g.beginPath();
        g.arc(cx * u, 3.2 * u, 2.1 * u, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = color;
      for (const cx of [-4, 4]) {
        g.beginPath();
        g.arc(cx * u, 3.2 * u, 1.3 * u, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
  }
  g.restore();
}

/** A place's mark: a disc in its kind's colour, a white pictogram, a dark ring. */
export function blip(g: CanvasRenderingContext2D, cat: Cat, x: number, y: number, r: number, dpr: number, ring = "#101217", fill?: string) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill ?? CAT[cat].color;
  g.fill();
  g.lineWidth = Math.max(1, 1.4 * dpr);
  g.strokeStyle = ring;
  g.stroke();
  glyph(g, cat, x, y, r * 0.78);
}

/** The waypoint: a purple pin, its point at (x, y). */
export const WAYPOINT = "#a45cf0";
export function pin(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-0.35 * s, -0.55 * s, -0.6 * s, -0.8 * s, -0.6 * s, -1.15 * s);
  g.arc(0, -1.15 * s, 0.6 * s, Math.PI, 0);
  g.bezierCurveTo(0.6 * s, -0.8 * s, 0.35 * s, -0.55 * s, 0, 0);
  g.closePath();
  g.fillStyle = WAYPOINT;
  g.fill();
  g.lineWidth = Math.max(1, s * 0.09);
  g.strokeStyle = "#ffffff";
  g.stroke();
  g.beginPath();
  g.arc(0, -1.15 * s, 0.24 * s, 0, Math.PI * 2);
  g.fillStyle = "#ffffff";
  g.fill();
  g.restore();
}

/** The GPS line along points already in canvas pixels: a dark casing, the colour inside. */
export function routeLine(g: CanvasRenderingContext2D, pts: (readonly [number, number])[], color: string, w: number) {
  if (pts.length < 2) return;
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
  g.strokeStyle = "rgba(20,14,34,0.55)";
  g.lineWidth = w + 3;
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = w;
  g.stroke();
  g.restore();
}

/** A label with a halo (for the light map). */
export function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, fill: string, halo = "rgba(250,249,245,0.92)", hw = 3) {
  g.font = font;
  g.lineJoin = "round";
  g.lineWidth = hw;
  g.strokeStyle = halo;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}
