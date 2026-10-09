import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

/**
 * The wallets' own marks, in 3D. Zodl: its app icon, the origami bird (three triangles, traced
 * from zodl-inc/zodl-android's launcher icon), black on its white disc. Vizor: its head-with-visor
 * icon (the path of chainapsis/vizor-wallet assets/icons/vizor.svg), in silver on its crimson disc.
 * Each mark goes through its disc, so it reads from both sides as it turns.
 */
export const ZODL_BIRD: [number, number][][] = [
  [[0.5162, 0.3241], [0.6273, 0.3611], [0.5833, 0.4583]],
  [[0.4954, 0.3264], [0.6597, 0.6481], [0.3958, 0.4028]],
  [[0.287, 0.6528], [0.4606, 0.4907], [0.6389, 0.6528]],
];
export const VIZOR_ICON = { w: 13.7365, h: 16.4912, d: "M6.3133 0.0415055C6.84272 -0.117143 7.20955 0.204748 7.20955 0.571027V0.971819C7.20955 1.27582 7.32915 1.54024 7.8011 1.36006C11.4217 -0.0222227 15.3887 3.59281 13.0212 7.9332L12.3096 9.28859C11.8239 10.2328 11.704 10.9919 12.5168 11.6968L12.8515 12.0338C13.1926 12.5281 12.9738 12.936 12.5168 13.0538C11.2717 13.3746 8.27224 13.8229 4.72026 16.3792C4.2063 16.7491 3.71881 16.1282 3.95005 15.609C4.39051 14.62 4.85783 13.9995 5.00423 13.508C5.0534 13.3422 4.93101 13.1726 4.75677 13.1726H3.49088C3.31137 13.1726 3.15394 13.1718 3.0095 13.1282C2.87007 13.0861 2.73897 13.0026 2.61838 12.8281C1.72808 11.0737 0.77519 9.225 0.0542115 7.76847C-0.104449 7.44795 0.0989953 7.14403 0.484096 7.14403H4.16407C4.50219 7.14403 4.73948 6.88856 4.79287 6.63406C4.8198 6.5054 4.8014 6.36793 4.71615 6.26175C4.64086 6.1682 4.52209 6.10958 4.36414 6.09627L4.29344 6.09326L2.02453 6.09853C1.57022 6.09853 0.994853 5.85948 1.25432 5.21111C2.28948 2.62436 3.62356 0.848426 6.3133 0.0415055ZM3.55197 10.2957C3.21851 10.2958 2.95065 10.5711 2.95065 10.9073C2.95073 11.2435 3.21856 11.5182 3.55197 11.5183C3.88544 11.5183 4.15395 11.2436 4.15403 10.9073C4.15403 10.571 3.88549 10.2957 3.55197 10.2957ZM2.65073 9.16876C2.3173 9.16889 2.04941 9.44421 2.0494 9.78045C2.04941 10.1167 2.3173 10.392 2.65073 10.3921C2.98422 10.3921 3.25278 10.1168 3.25279 9.78045C3.25278 9.44414 2.98422 9.1688 2.65073 9.16876ZM4.52893 9.16876C4.19544 9.16882 3.92761 9.44417 3.92761 9.78045C3.92762 10.1167 4.19544 10.3921 4.52893 10.3921C4.86247 10.3921 5.13024 10.1168 5.13025 9.78045C5.13025 9.44413 4.86247 9.16876 4.52893 9.16876ZM3.55197 7.90684C3.21851 7.90694 2.95065 8.18226 2.95065 8.51853C2.95078 8.85468 3.21859 9.12939 3.55197 9.12948C3.88541 9.12946 4.15389 8.85473 4.15403 8.51853C4.15403 8.18221 3.88549 7.90686 3.55197 7.90684Z" };

/**
 * Noir's mark: a silver crescent (an eclipse) opening to the right, a thin line down its middle and
 * a green light on its upper tip (traced from @noir_wallet's avatar), in the 0..1 box, y down.
 */
const NOIR = { cx: 0.5, cy: 0.5, r: 0.36, inner: 0.3, shift: 0.075, dot: [0.74, 0.27] as [number, number], green: "#00d38c" };
function noirCrescent(): [number, number][] {
  const pts: [number, number][] = [];
  const { cx, cy, r, inner, shift } = NOIR;
  // the outer circle the long way round (through the left) from the lower tip to the upper one,
  // then the inner circle, shifted right, back down
  const tip = 1.05,
    n = 48;
  for (let i = 0; i <= n; i++) {
    const a = tip + (i / n) * (Math.PI * 2 - 2 * tip);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * 2 - tip - (i / n) * (Math.PI * 2 - 2 * tip);
    pts.push([cx + shift + Math.cos(a) * inner, cy + Math.sin(a) * inner]);
  }
  return pts;
}

export function emblem(key: "zodl" | "vizor" | "noir", o: { glow?: number } = {}) {
  if (key === "noir") return noirEmblem(o);
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
    // the app icon: black bird on white
    disc = "#ffffff";
    rim = "#c9c9cc";
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
    // the app icon: a silver knight's helmet on crimson
    disc = "#b90b4a";
    rim = "#d8d8e0";
    mark = new THREE.MeshStandardMaterial({ color: "#e6e6ec", metalness: 0.92, roughness: 0.2, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.08 });
  }
  const markGeo = new THREE.ExtrudeGeometry(shapes, extrude);
  markGeo.translate(0, 0, -(T + 0.07) / 2);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(R, R, T, 64).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: disc, metalness: 0.55, roughness: 0.3, emissive: new THREE.Color(disc), emissiveIntensity: (key === "zodl" ? 0.12 : 0.3) * (o.glow ?? 1) }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.03, 12, 64), new THREE.MeshStandardMaterial({ color: rim, metalness: 0.9, roughness: 0.25, emissive: new THREE.Color(rim), emissiveIntensity: 0.5 * (o.glow ?? 1) }));
  g.add(new THREE.Mesh(markGeo, mark), face, ring);
  g.scale.setScalar(1.2);
  return g;
}


function noirEmblem(o: { glow?: number }) {
  const g = new THREE.Group();
  const R = 0.5,
    T = 0.08;
  const k = 1;
  const v = ([x, y]: [number, number]) => new THREE.Vector2((x - 0.5) * k, -(y - 0.5) * k);
  const crescent = new THREE.Shape(noirCrescent().map(v));
  const line = new THREE.Shape([v([0.495, 0.36]), v([0.512, 0.36]), v([0.512, 0.84]), v([0.495, 0.84])]);
  const silver = new THREE.MeshStandardMaterial({ color: "#e6e6ea", metalness: 0.95, roughness: 0.18, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.06 * (o.glow ?? 1) });
  const geo = new THREE.ExtrudeGeometry([crescent, line], { depth: T + 0.07, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.006, bevelSegments: 2, curveSegments: 24 });
  geo.translate(0, 0, -(T + 0.07) / 2);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(R, R, T, 64).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#1a1a1a", metalness: 0.4, roughness: 0.35 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.03, 12, 64), new THREE.MeshStandardMaterial({ color: "#c8ccd0", metalness: 0.9, roughness: 0.25, emissive: new THREE.Color(NOIR.green), emissiveIntensity: 0.25 * (o.glow ?? 1) }));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(NOIR.green).multiplyScalar(2.2), toneMapped: false }));
  dot.position.set(...(v(NOIR.dot).toArray() as [number, number]), 0);
  g.add(new THREE.Mesh(geo, silver), face, ring, dot);
  g.scale.setScalar(1.2);
  return g;
}

/** The marks as flat paths on a canvas (posters, screens): the mark centred at (x, y), `size` tall. */
export function drawMark(g: CanvasRenderingContext2D, key: "zodl" | "vizor" | "noir", x: number, y: number, size: number, color: string) {
  g.save();
  g.fillStyle = color;
  if (key === "noir") {
    const k = size / (NOIR.r * 2);
    const at = ([px, py]: [number, number]) => [x + (px - 0.5) * k, y + (py - 0.5) * k] as const;
    g.beginPath();
    noirCrescent().forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, ...at(p)));
    g.closePath();
    g.fill();
    g.fillRect(...at([0.495, 0.36]), 0.017 * k, 0.48 * k);
    g.fillStyle = NOIR.green;
    g.beginPath();
    g.arc(...at(NOIR.dot), 0.05 * k, 0, Math.PI * 2);
    g.fill();
  } else if (key === "zodl") {
    const cx = (0.287 + 0.6597) / 2,
      cy = (0.3241 + 0.6528) / 2,
      k = size / (0.6528 - 0.3241);
    for (const t of ZODL_BIRD) {
      g.beginPath();
      t.forEach(([px, py], i) => (i ? g.lineTo : g.moveTo).call(g, x + (px - cx) * k, y + (py - cy) * k));
      g.closePath();
      g.fill();
    }
  } else {
    const k = size / VIZOR_ICON.h;
    g.translate(x - (VIZOR_ICON.w / 2) * k, y - (VIZOR_ICON.h / 2) * k);
    g.scale(k, k);
    g.fill(new Path2D(VIZOR_ICON.d));
  }
  g.restore();
}
