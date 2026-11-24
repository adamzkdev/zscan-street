import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { maps } from "../real/tex";
import { BOARDWALKS, CREEK, F, Land, SITES, TRAILS } from "./land";

/**
 * What people built in the woods: the trailhead gate and its map, the boardwalks over the gorge
 * and along the plunge pool, Viewing Key Point's deck over the bluff, the falls overlook, the ranger
 * cabin with its porch and chimney, the campfire ring with log benches and tents, lanterns along
 * the trails, the Genesis Tree's fence and plaque. Wood and stone are merged into one mesh;
 * lanterns are instanced; signs are canvas planes.
 */

const WOOD = ["#8a6040", "#7a5436", "#946a46", "#6e4a30"];
const DARK = "#4a3424";

export interface Built {
  group: THREE.Group;
  /** Solid things to walk round: circles (x, z, r) and boxes (x0, z0, x1, z1). */
  circles: [number, number, number][];
  rects: [number, number, number, number][];
  /** Lantern positions (world), for lights and fireflies. */
  lanterns: THREE.Vector3[];
  lanternMat: THREE.MeshBasicMaterial;
  windows: THREE.MeshBasicMaterial;
  /** The campfire: where the flames go, where the hikers sit. */
  fire: THREE.Vector3;
  seats: { x: number; z: number; y: number }[];
  chimney: THREE.Vector3;
}

class Boxes {
  geos: THREE.BufferGeometry[] = [];
  private col = new THREE.Color();
  add(w: number, h: number, d: number, x: number, y: number, z: number, color: string, rotY = 0, shade = true) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    if (rotY) g.rotateY(rotY);
    g.translate(x, y + h / 2, z);
    this.col.set(color);
    const n = g.getAttribute("position").count;
    const c = new Float32Array(n * 3);
    const nrm = g.getAttribute("normal");
    for (let i = 0; i < n; i++) {
      const k = !shade ? 1 : nrm.getY(i) > 0.5 ? 1 : nrm.getY(i) < -0.5 ? 0.6 : 0.8;
      c[i * 3] = this.col.r * k;
      c[i * 3 + 1] = this.col.g * k;
      c[i * 3 + 2] = this.col.b * k;
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    g.deleteAttribute("uv");
    this.geos.push(g);
  }
  /** A beam from a to b (a box of section w×h). */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, color: string) {
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(w, h, len).toNonIndexed();
    const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
    g.applyMatrix4(m);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.col.set(color);
    const n = g.getAttribute("position").count;
    const c = new Float32Array(n * 3);
    const nrm = g.getAttribute("normal");
    for (let i = 0; i < n; i++) {
      const k = nrm.getY(i) > 0.5 ? 1 : 0.78;
      c[i * 3] = this.col.r * k;
      c[i * 3 + 1] = this.col.g * k;
      c[i * 3 + 2] = this.col.b * k;
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    g.deleteAttribute("uv");
    this.geos.push(g);
  }
  mesh() {
    const m = new THREE.Mesh(mergeGeometries(this.geos, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    m.castShadow = m.receiveShadow = true;
    return m;
  }
}

const wood = (i: number) => WOOD[Math.abs(i) % WOOD.length];

/** A routed park sign: cream letters cut into dark-stained wood. */
export function signTexture(lines: string[], w = 512, h = 160, big = 64) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4a2e1c";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 6) {
    g.fillStyle = `rgba(0,0,0,${0.06 + ((y * 7) % 5) * 0.02})`;
    g.fillRect(0, y, w, 2);
  }
  g.strokeStyle = "#2a1a10";
  g.lineWidth = 10;
  g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = "#f2dfae";
  g.textAlign = "center";
  g.textBaseline = "middle";
  lines.forEach((l, i) => {
    const size = i === 0 ? big : big * 0.5;
    let fit = size;
    g.font = `800 ${fit}px "Trebuchet MS", "Verdana", sans-serif`;
    while (fit > 12 && g.measureText(l).width > w - 44) g.font = `800 ${(fit -= 2)}px "Trebuchet MS", "Verdana", sans-serif`;
    const y = lines.length === 1 ? h / 2 : i === 0 ? h * 0.4 : h * 0.4 + big * 0.55 + (i - 1) * size * 1.2;
    g.fillText(l, w / 2, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The trail map at the trailhead, drawn from the plan itself. */
function mapTexture(land: Land) {
  const W = 512,
    H = 300;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4a2e1c";
  g.fillRect(0, 0, W, H);
  const k = (W - 40) / (F.x1 - F.x0);
  const px = (x: number) => 20 + (x - F.x0) * k;
  // north is the city: draw it at the top
  const pz = (z: number) => 50 + (z - F.z0) * k * 1.0;
  g.fillStyle = "#2e5a6e";
  g.fillRect(14, 44, W - 28, H - 58);
  for (let x = F.x0; x < F.x1; x += 2)
    for (let z = F.z0; z < F.z1; z += 2) {
      const h = land.raw(x + 1, z + 1);
      if (h < -1.2) continue;
      g.fillStyle = h > 9 ? "#2c5a2a" : h > 4 ? "#386a32" : h > 0 ? "#4f7a3a" : "#b8984e";
      g.fillRect(px(x), pz(z), 2 * k + 0.6, 2 * k + 0.6);
    }
  g.strokeStyle = "#7ac0e0";
  g.lineWidth = 3;
  g.beginPath();
  CREEK.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
  g.stroke();
  g.strokeStyle = "#f2dfae";
  g.lineWidth = 3;
  g.setLineDash([6, 4]);
  for (const t of TRAILS) {
    g.beginPath();
    t.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
    g.stroke();
  }
  g.setLineDash([]);
  const dot = (x: number, z: number, label: string, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(px(x), pz(z), 6, 0, Math.PI * 2);
    g.fill();
    g.font = '700 15px "Trebuchet MS", sans-serif';
    g.fillStyle = "#fff4d6";
    g.textAlign = "center";
    g.fillText(label, px(x), pz(z) - 11);
  };
  dot(SITES.plaza.x, SITES.plaza.z, "YOU ARE HERE", "#f4b728");
  dot(SITES.lookout.x, SITES.lookout.z, "Viewing Key Point", "#fff4d6");
  dot(SITES.camp.x, SITES.camp.z, "Campfire", "#ff7a2a");
  dot(213, 223, "Sprout Falls", "#7ac0e0");
  dot(SITES.cabin.x, SITES.cabin.z, "Ranger", "#fff4d6");
  dot(SITES.genesis.x, SITES.genesis.z, "Genesis Tree", "#fff4d6");
  g.font = '800 30px "Trebuchet MS", sans-serif';
  g.fillStyle = "#f2dfae";
  g.textAlign = "left";
  g.fillText("SHIELDED WOODS", 18, 30);
  g.font = '700 16px "Trebuchet MS", sans-serif';
  g.textAlign = "right";
  g.fillText("TRAIL MAP · 6.2 km", W - 18, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function signPlane(tex: THREE.Texture, w: number, h: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  m.castShadow = true;
  return m;
}

// ---- the cabin, the tents, the campfire, the viewers: real shapes (branch gta-real) ------------------------

const pmats = new Map<string, THREE.Material>();
function pm(key: string, make: () => THREE.Material) {
  let m = pmats.get(key);
  if (!m) pmats.set(key, (m = make()));
  return m;
}
const logMat = () =>
  pm("log", () => {
    const mp = maps("Wood049");
    return new THREE.MeshStandardMaterial({ map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, color: "#9a6a48", roughness: 1 });
  });
const stoneMat = () =>
  pm("stone", () => {
    const mp = maps("Rock030");
    return new THREE.MeshStandardMaterial({ map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, color: new THREE.Color(1.9, 1.85, 1.8), roughness: 1 });
  });
const plankMat = () =>
  pm("plank", () => {
    const mp = maps("Planks021");
    return new THREE.MeshStandardMaterial({ map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, color: "#a88060", roughness: 1 });
  });
const shingleMat = () =>
  pm("shingle", () => {
    const mp = maps("RoofingTiles006");
    return new THREE.MeshStandardMaterial({ map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, color: "#7a8a76", roughness: 1, side: THREE.DoubleSide });
  });
const plain = (hex: string, rough = 0.7, metal = 0) => pm(`p:${hex}:${rough}:${metal}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }));
const glowM = (hex: string, k: number) => pm(`g:${hex}:${k}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false }));
/** Parts by material, merged into a group of meshes. */
class Parts {
  private m = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, g: THREE.BufferGeometry, uvScale = 0) {
    const gg = g.index ? g.toNonIndexed() : g;
    if (!gg.getAttribute("uv")) gg.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(gg.getAttribute("position").count * 2), 2));
    if (uvScale) {
      const p = gg.getAttribute("position"),
        n = gg.getAttribute("normal"),
        uv = gg.getAttribute("uv");
      for (let i = 0; i < p.count; i++) {
        const ax = Math.abs(n.getX(i)),
          ay = Math.abs(n.getY(i));
        uv.setXY(i, (ax > 0.5 ? p.getZ(i) : p.getX(i)) / uvScale, (ay > 0.5 ? p.getZ(i) : p.getY(i)) / uvScale);
      }
    }
    const l = this.m.get(mat);
    if (l) l.push(gg);
    else this.m.set(mat, [gg]);
  }
  group() {
    const g = new THREE.Group();
    for (const [mat, geos] of this.m) {
      const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, mat);
      mesh.castShadow = !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }
}
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
/** A log along x (or z) from a to b at height y, radius r: its bark-less peeled surface, wood grain along it. */
function logX(P: Parts, x0: number, x1: number, y: number, z: number, r: number) {
  const g = new THREE.CylinderGeometry(r, r, x1 - x0, 12, 1, false).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, y, z);
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * ((x1 - x0) / 1.5), uv.getX(i) * 0.6);
  P.add(logMat(), g);
}
function logZ(P: Parts, z0: number, z1: number, y: number, x: number, r: number) {
  const g = new THREE.CylinderGeometry(r, r, z1 - z0, 12, 1, false).rotateX(Math.PI / 2).translate(x, y, (z0 + z1) / 2);
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * ((z1 - z0) / 1.5), uv.getX(i) * 0.6);
  P.add(logMat(), g);
}

/** The ranger station: a log cabin (round logs crossing at the corners), stone footing and chimney, a shingled gable roof, the porch with its posts, bench and steps, the firewood. Front faces +z (as the voxel cabin: 8.7 × 7.3 m, centred). */
function cabinObject() {
  const P = new Parts();
  const V = (v: number) => v / 6;
  const x0 = V(4 - 26),
    x1 = V(46 - 26),
    z0 = V(4 - 22),
    z1 = V(30 - 22);
  const r = 0.17;
  P.add(stoneMat(), bx(x1 - x0 + 0.3, 0.5, z1 - z0 + 0.3, (x0 + x1) / 2, 0, (z0 + z1) / 2), 1.6);
  // the walls: logs stacked, the ends running past the corners
  for (let y = 0.5 + r; y < V(22); y += 2 * r) {
    const odd = Math.round((y - 0.5) / (2 * r)) % 2;
    logX(P, x0 - 0.35, x1 + 0.35, y + (odd ? r : 0) * 0, z1 - r, r);
    logX(P, x0 - 0.35, x1 + 0.35, y, z0 + r, r);
    logZ(P, z0 - 0.35, z1 + 0.35, y + r * 0.5, x0 + r, r);
    logZ(P, z0 - 0.35, z1 + 0.35, y + r * 0.5, x1 - r, r);
  }
  // the gable ends: logs shortening to the ridge
  const top = V(40);
  for (let y = V(22) + r; y < top - 0.2; y += 2 * r) {
    const k = (y - V(22)) / (top - V(22));
    const hz = ((z1 - z0) / 2 + 0.2) * (1 - k);
    const zc = (z0 + z1) / 2;
    for (const x of [x0 + r, x1 - r]) logZ(P, zc - hz, zc + hz, y, x, r);
  }
  // the door and the windows' frames (the panes are the street's lit glass), shutters
  const trim = plain("#5a3a24", 0.8);
  P.add(plain("#4a2e1c", 0.7), bx(1.15, 2.15, 0.08, V(25.5 - 26), 0.5, z1 + 0.02));
  P.add(plain("#d8b030", 0.3, 0.9), new THREE.SphereGeometry(0.05, 8, 6).translate(V(28 - 26), 1.55, z1 + 0.1));
  for (const wx of [V(12.5 - 26), V(38.5 - 26)]) {
    P.add(trim, bx(1.4, 0.1, 0.12, wx, 1.42, z1 + 0.02));
    P.add(trim, bx(1.4, 0.1, 0.12, wx, 2.62, z1 + 0.02));
    for (const s of [-1, 1]) P.add(trim, bx(0.1, 1.3, 0.12, wx + s * 0.65, 1.42, z1 + 0.02));
    P.add(trim, bx(0.06, 1.2, 0.1, wx, 1.47, z1 + 0.04));
  }
  for (const zz of [V(13 - 22), V(23 - 22)]) for (const x of [x0 - 0.01, x1 + 0.01]) P.add(plain("#2a3440", 0.1, 0.5), bx(0.04, 1.1, 1.0, x, 1.5, zz));
  // the roof: two shingled slopes over the gables, the ridge
  const zc = (z0 + z1) / 2;
  const eave = V(22),
    over = 0.5;
  for (const s of [-1, 1]) {
    const zo = s > 0 ? z1 + over : z0 - over;
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0 - over, eave - 0.15, zo), new THREE.Vector3(x1 + over, eave - 0.15, zo), new THREE.Vector3(x1 + over, top + 0.2, zc), new THREE.Vector3(x0 - over, eave - 0.15, zo), new THREE.Vector3(x1 + over, top + 0.2, zc), new THREE.Vector3(x0 - over, top + 0.2, zc)]);
    const uv: number[] = [];
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) uv.push(p.getX(i) / 2, Math.hypot(p.getY(i) - eave, p.getZ(i) - zo) / 2);
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    P.add(shingleMat(), g);
  }
  P.add(plain("#2a3428", 0.8), bx(x1 - x0 + 2 * over + 0.1, 0.16, 0.36, (x0 + x1) / 2, top + 0.12, zc));
  // the chimney on the east end
  P.add(stoneMat(), bx(0.9, V(44), 1.2, x1 + 0.4, 0, V(16.5 - 22)), 1.4);
  P.add(stoneMat(), bx(1.05, 0.15, 1.35, x1 + 0.4, V(44), V(16.5 - 22)), 1.4);
  // the porch: its deck, posts, lean-to roof, a bench, the steps
  const pz1 = z1 + V(11);
  P.add(plankMat(), bx(x1 - x0, 0.12, pz1 - z1, (x0 + x1) / 2, 0.5, (z1 + pz1) / 2), 1.6);
  for (const px of [x0 + 0.17, V(16 - 26), V(35 - 26), x1 - 0.17]) P.add(logMat(), new THREE.CylinderGeometry(0.11, 0.12, V(20) - 0.62, 10).translate(px, 0.62 + (V(20) - 0.62) / 2, pz1 - 0.2));
  {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0 - 0.2, V(23), z1), new THREE.Vector3(x1 + 0.2, V(23), z1), new THREE.Vector3(x1 + 0.2, V(20), pz1 + 0.3), new THREE.Vector3(x0 - 0.2, V(23), z1), new THREE.Vector3(x1 + 0.2, V(20), pz1 + 0.3), new THREE.Vector3(x0 - 0.2, V(20), pz1 + 0.3)]);
    const p = g.getAttribute("position");
    const uv: number[] = [];
    for (let i = 0; i < p.count; i++) uv.push(p.getX(i) / 2, p.getZ(i) / 2);
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    P.add(shingleMat(), g);
  }
  P.add(plankMat(), bx(2, 0.06, 0.4, x0 + 1.3, 0.95, z1 + 0.35), 1.2);
  P.add(plankMat(), bx(2, 0.4, 0.06, x0 + 1.3, 1.0, z1 + 0.15), 1.2);
  for (let i = 0; i < 3; i++) P.add(plankMat(), bx(1.35, 0.17, 0.3, V(26 - 26), i * 0.17, pz1 + 0.45 - i * 0.3), 1.2);
  // firewood stacked by the chimney: round ends showing
  for (let y = 0; y < 5; y++) for (let k = 0; k < 6; k++) P.add(k % 2 ? logMat() : plain("#c8925a", 0.9), new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8).rotateZ(Math.PI / 2).translate(x1 + 0.35, 0.09 + y * 0.16, V(23 - 22) + k * 0.17));
  return P.group();
}

/** A dome tent, front +z: its nylon shell in `color`, the poles crossing over it in `trim`, the door. */
function tentObject(color: string, trim: string) {
  const P = new Parts();
  const shell = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.35, 1.6, 1.0);
  P.add(pm(`nylon:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.55, side: THREE.DoubleSide })), shell);
  for (const a of [Math.PI / 4, -Math.PI / 4]) P.add(plain(trim, 0.4, 0.3), new THREE.TorusGeometry(1, 0.022, 6, 24, Math.PI).scale(1.36, 1.62, 1.01).rotateY(a));
  P.add(plain("#2a2420", 0.8), new THREE.CircleGeometry(0.55, 16, 0, Math.PI).translate(0, 0, 1.005));
  return P.group();
}

/** The campfire: a ring of stones, crossed logs, the embers glowing between them. */
function fireObject() {
  const P = new Parts();
  for (let a = 0; a < 14; a++) {
    const ang = (a / 14) * Math.PI * 2;
    const g = new THREE.DodecahedronGeometry(0.17, 0).scale(1.2, 0.8, 1).rotateY(a).translate(Math.cos(ang) * 0.95, 0.1, Math.sin(ang) * 0.95);
    P.add(stoneMat(), g, 0.8);
  }
  P.add(glowM("#ff6a1a", 1.6), new THREE.CircleGeometry(0.7, 18).rotateX(-Math.PI / 2).translate(0, 0.03, 0));
  for (const a of [0.3, 1.9, 3.4]) P.add(plain("#3a2418", 0.95), new THREE.CylinderGeometry(0.07, 0.08, 1.1, 8).rotateZ(Math.PI / 2 - 0.35).rotateY(a).translate(0, 0.25, 0));
  P.add(glowM("#ffb03a", 2.4), new THREE.ConeGeometry(0.2, 0.45, 8).translate(0, 0.32, 0));
  return P.group();
}

/** A coin-op viewer on its post: the green body, the eyepieces, the brass cap. */
function viewerObject() {
  const P = new Parts();
  const green = plain("#2e5a3a", 0.4, 0.5);
  P.add(green, new THREE.CylinderGeometry(0.06, 0.09, 1.45, 12).translate(0, 0.725, 0));
  P.add(green, new THREE.CapsuleGeometry(0.17, 0.32, 4, 12).rotateZ(Math.PI / 2).translate(0, 1.65, 0));
  for (const s of [-1, 1]) P.add(plain("#1a1a20", 0.4, 0.3), new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10).rotateX(Math.PI / 2).translate(s * 0.11, 1.68, -0.22));
  P.add(plain("#d8b030", 0.3, 0.9), new THREE.CylinderGeometry(0.1, 0.12, 0.05, 12).translate(0, 1.84, 0));
  return P.group();
}

export function buildProps(land: Land): Built {
  const group = new THREE.Group();
  const B = new Boxes();
  const circles: [number, number, number][] = [];
  const rects: [number, number, number, number][] = [];
  const lanterns: THREE.Vector3[] = [];
  const at = (x: number, z: number) => land.raw(x, z);

  // ---- boardwalks: planks, stringers, posts down to the ground, rails both sides --------------
  for (const w of land.walks) {
    for (let s = 1; s < w.pts.length; s++) {
      const [ax, az] = w.pts[s - 1],
        [bx, bz] = w.pts[s];
      const len = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(bx - ax, bz - az);
      const n = Math.ceil(len / 0.4);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = ax + (bx - ax) * t,
          z = az + (bz - az) * t;
        const y = w.y[s - 1] + (w.y[s] - w.y[s - 1]) * t;
        B.add(1.9, 0.08, 0.36, x, y - 0.08, z, wood(i + s), yaw);
      }
      const nx = Math.cos(yaw),
        nz = -Math.sin(yaw);
      const posts = Math.ceil(len / 1.6);
      for (let i = 0; i <= posts; i++) {
        const t = i / posts;
        const x = ax + (bx - ax) * t,
          z = az + (bz - az) * t;
        const y = w.y[s - 1] + (w.y[s] - w.y[s - 1]) * t;
        for (const sd of [-1, 1]) {
          const px = x + nx * 0.95 * sd,
            pz = z + nz * 0.95 * sd;
          const g = Math.min(at(px, pz), y - 0.1);
          B.add(0.14, y - g + 0.95, 0.14, px, g, pz, DARK);
        }
      }
      for (const sd of [-1, 1]) {
        const a = new THREE.Vector3(ax + nx * 0.95 * sd, w.y[s - 1] + 0.9, az + nz * 0.95 * sd),
          b = new THREE.Vector3(bx + nx * 0.95 * sd, w.y[s] + 0.9, bz + nz * 0.95 * sd);
        B.beam(a, b, 0.1, 0.1, "#9a6e48");
        B.beam(a.clone().setY(a.y - 0.42), b.clone().setY(b.y - 0.42), 0.06, 0.06, "#7a5436");
        B.beam(a.clone().setY(a.y - 1.0), b.clone().setY(b.y - 1.0), 0.22, 0.22, DARK);
      }
    }
  }

  // ---- Viewing Key Point: a deck out over the bluff, rails on three sides, binoculars facing the city --
  const deck = (d: (typeof land.decks)[number], rails: ("n" | "e" | "w" | "s")[]) => {
    for (let z = d.z0 + 0.2; z < d.z1; z += 0.4) B.add(d.x1 - d.x0, 0.08, 0.36, (d.x0 + d.x1) / 2, d.y - 0.08, z, wood(Math.round(z * 3)));
    for (let x = d.x0 + 0.1; x <= d.x1; x += (d.x1 - d.x0 - 0.2) / Math.ceil((d.x1 - d.x0) / 1.6))
      for (let z = d.z0 + 0.1; z <= d.z1; z += (d.z1 - d.z0 - 0.2) / Math.ceil((d.z1 - d.z0) / 1.6)) {
        const g = Math.min(at(x, z), d.y - 0.2) - 0.4;
        B.add(0.2, d.y - g, 0.2, x, g, z, DARK);
      }
    const rail = (ax: number, az: number, bx: number, bz: number) => {
      const a = new THREE.Vector3(ax, d.y + 1.0, az),
        b = new THREE.Vector3(bx, d.y + 1.0, bz);
      B.beam(a, b, 0.12, 0.12, "#9a6e48");
      B.beam(a.clone().setY(d.y + 0.5), b.clone().setY(d.y + 0.5), 0.06, 0.06, "#7a5436");
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2);
      for (let i = 0; i <= n; i++) B.add(0.12, 1.0, 0.12, ax + ((bx - ax) * i) / n, d.y, az + ((bz - az) * i) / n, DARK);
    };
    if (rails.includes("n")) rail(d.x0, d.z0, d.x1, d.z0);
    if (rails.includes("s")) rail(d.x0, d.z1, d.x1, d.z1);
    if (rails.includes("w")) rail(d.x0, d.z0, d.x0, d.z1);
    if (rails.includes("e")) rail(d.x1, d.z0, d.x1, d.z1);
  };
  const L = land.decks[0];
  deck(L, ["n", "e", "w"]);
  for (const x of [L.x0 + 1.4, L.x1 - 1.4]) {
    const b = viewerObject();
    b.position.set(x, L.y, L.z0 + 0.7);
    b.rotation.y = Math.PI;
    group.add(b);
    circles.push([x, L.z0 + 0.7, 0.35]);
  }
  // a bench facing the view
  B.add(2.4, 0.1, 0.5, (L.x0 + L.x1) / 2, L.y + 0.42, L.z1 - 1.2, "#9a6e48");
  B.add(2.4, 0.5, 0.08, (L.x0 + L.x1) / 2, L.y + 0.52, L.z1 - 0.95, "#8a6040");
  for (const dx of [-1, 1]) B.add(0.1, 0.42, 0.45, (L.x0 + L.x1) / 2 + dx * 1.05, L.y, L.z1 - 1.2, DARK);
  rects.push([(L.x0 + L.x1) / 2 - 1.25, L.z1 - 1.5, (L.x0 + L.x1) / 2 + 1.25, L.z1 - 0.9]);
  // the falls overlook
  const FD = land.decks[1];
  deck(FD, ["n", "e", "w"]);

  // ---- signs ---------------------------------------------------------------------------------------
  const sign = (lines: string[], x: number, z: number, yaw: number, w = 2.4, h = 0.75, postH = 1.4, big = 64) => {
    const y = at(x, z);
    const p = signPlane(signTexture(lines, 512, Math.round((512 * h) / w), big), w, h);
    p.position.set(x, y + postH + h / 2, z);
    p.rotation.y = yaw;
    const back = p.clone();
    back.rotation.y = yaw + Math.PI;
    back.position.add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-0.09));
    group.add(p, back);
    const bx = Math.cos(yaw),
      bz = -Math.sin(yaw);
    B.add(w + 0.2, h + 0.16, 0.08, x - Math.sin(yaw) * 0.045, y + postH - 0.08, z - Math.cos(yaw) * 0.045, "#3a2416", yaw);
    for (const s of [-1, 1]) {
      B.add(0.16, postH + h + 0.2, 0.16, x + bx * (w / 2 - 0.1) * s - Math.sin(yaw) * 0.12, y - 0.2, z + bz * (w / 2 - 0.1) * s - Math.cos(yaw) * 0.12, "#5a3a24");
      circles.push([x + bx * (w / 2 - 0.1) * s, z + bz * (w / 2 - 0.1) * s, 0.2]);
    }
  };
  // the trailhead: a log arch over the trail, the name on it; the map board beside
  {
    const P = SITES.plaza;
    const gx = 170.5,
      gz = 221;
    const y = at(gx, gz);
    const yaw = Math.atan2(174.5 - 166, 215.5 - 226);
    const ax = Math.cos(yaw),
      az = -Math.sin(yaw);
    for (const s of [-1, 1]) {
      B.add(0.42, 4.2, 0.42, gx + ax * 1.7 * s, y - 0.3, gz + az * 1.7 * s, "#6e4228");
      circles.push([gx + ax * 1.7 * s, gz + az * 1.7 * s, 0.3]);
    }
    B.beam(new THREE.Vector3(gx - ax * 2.3, y + 3.75, gz - az * 2.3), new THREE.Vector3(gx + ax * 2.3, y + 3.75, gz + az * 2.3), 0.4, 0.4, "#7a4a2e");
    const name = signPlane(signTexture(["SHIELDED WOODS"], 1024, 170, 104), 3.2, 0.55);
    name.position.set(gx, y + 3.1, gz);
    name.rotation.y = yaw + Math.PI;
    const nameBack = name.clone();
    nameBack.rotation.y = yaw;
    group.add(name, nameBack);
    B.add(3.36, 0.66, 0.06, gx, y + 2.77, gz, "#3a2416", yaw);
    // the map under a little roof
    const mx = P.x - 3.8,
      mz = P.z + 1.4;
    const my = at(mx, mz);
    const map = signPlane(mapTexture(land), 2.2, 1.3);
    map.position.set(mx, my + 1.55, mz);
    map.rotation.y = Math.PI * 0.8;
    group.add(map);
    B.add(2.4, 1.5, 0.08, mx + Math.sin(Math.PI * 0.8) * -0.05, my + 0.82, mz + Math.cos(Math.PI * 0.8) * -0.05, "#3a2416", Math.PI * 0.8);
    B.add(2.8, 0.1, 0.9, mx, my + 2.35, mz, "#4a3424", Math.PI * 0.8);
    for (const s of [-1, 1]) {
      const px = mx + Math.cos(Math.PI * 0.8) * 1.15 * s,
        pz = mz - Math.sin(Math.PI * 0.8) * 1.15 * s;
      B.add(0.16, 2.4, 0.16, px, my - 0.1, pz, "#5a3a24");
      circles.push([px, pz, 0.2]);
    }
  }
  sign(["VIEWING KEY POINT", "VIEW OF THE CITY · ELEV 14 m"], SITES.lookout.x + 2.6, SITES.lookout.z + 3.4, Math.PI * 0.85, 1.9, 0.62, 1.0, 58);
  sign(["SPROUT FALLS", "6 m DROP"], SITES.fallsDeck.x - 2.1, SITES.fallsDeck.z - 1.6, Math.PI * 0.25, 1.7, 0.55, 1.0, 58);
  sign(["RANGER STATION"], SITES.cabin.x - 7.5, SITES.cabin.z + 2.2, -Math.PI / 2, 2.2, 0.5, 1.2, 64);
  sign(["CAMPGROUND", "NO FIRES OUTSIDE THE RING"], 190.5, 210.8, Math.PI * 0.6, 1.8, 0.55, 1.0, 54);
  sign(["GENESIS TREE", "THE OLDEST · BLOCK 0 · 28 OCT 2016"], SITES.genesis.x + 3.4, SITES.genesis.z - 3.0, Math.PI * 1.1, 2.2, 0.6, 0.9, 58);

  // ---- the Genesis Tree's fence: a low split-rail round the giant ---------------------------------
  {
    const G0 = SITES.genesis;
    const n = 14;
    for (let i = 0; i < n; i++) {
      if (i === 3 || i === 4) continue; // the opening, toward the boardwalk
      const a0 = (i / n) * Math.PI * 2,
        a1 = ((i + 1) / n) * Math.PI * 2;
      const p0 = new THREE.Vector3(G0.x + Math.cos(a0) * 4.2, 0, G0.z + 4.2 * Math.sin(a0) - 1);
      const p1 = new THREE.Vector3(G0.x + Math.cos(a1) * 4.2, 0, G0.z + 4.2 * Math.sin(a1) - 1);
      p0.y = at(p0.x, p0.z) + 0.7;
      p1.y = at(p1.x, p1.z) + 0.7;
      B.beam(p0, p1, 0.12, 0.12, "#9a7a54");
      B.beam(p0.clone().setY(p0.y - 0.35), p1.clone().setY(p1.y - 0.35), 0.1, 0.1, "#8a6a44");
      B.add(0.16, 0.85, 0.16, p0.x, p0.y - 0.75, p0.z, "#6a4a30");
    }
  }

  // ---- the ranger cabin -----------------------------------------------------------------------------
  const CB = SITES.cabin;
  const cabinY = at(CB.x, CB.z) - 0.05;
  const cabin = cabinObject();
  cabin.position.set(CB.x, cabinY, CB.z);
  cabin.rotation.y = -Math.PI / 2; // the porch faces the trail, west
  group.add(cabin);
  // model (mx, my, mz) lands at world (x - (mz - 22) / 6, y + my / 6, z + (mx - 26) / 6): the porch faces -x
  rects.push([CB.x - 3.3, CB.z - 3.9, CB.x + 3.2, CB.z + 4.3]);
  const windows = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.2, 0.12), toneMapped: false });
  for (const mx of [12.5, 38.5]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(7 / 6, 7 / 6), windows);
    pane.position.set(CB.x - 8 / 6 - 0.02, cabinY + 12.5 / 6, CB.z + (mx - 26) / 6);
    pane.rotation.y = -Math.PI / 2;
    group.add(pane);
  }
  // flag pole with the ZEC flag
  {
    const fx = CB.x - 6.8,
      fz = CB.z - 4;
    const fy = at(fx, fz);
    B.add(0.12, 7, 0.12, fx, fy, fz, "#c8c8d0");
    const flagC = document.createElement("canvas");
    flagC.width = 96;
    flagC.height = 64;
    const fg = flagC.getContext("2d")!;
    fg.fillStyle = "#f4b728";
    fg.fillRect(0, 0, 96, 64);
    fg.fillStyle = "#1a1820";
    fg.font = "900 46px sans-serif";
    fg.textAlign = "center";
    fg.textBaseline = "middle";
    fg.fillText("ⓩ", 48, 34);
    const ft = new THREE.CanvasTexture(flagC);
    ft.colorSpace = THREE.SRGBColorSpace;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1, 6, 1), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(fx + 0.78, fy + 6.4, fz);
    flag.name = "flag";
    group.add(flag);
    circles.push([fx, fz, 0.2]);
  }

  // ---- campfire, log benches, tents ----------------------------------------------------------------
  const CP = SITES.camp;
  const fy = at(CP.x, CP.z);
  const ring = fireObject();
  ring.position.set(CP.x, fy - 0.05, CP.z);
  group.add(ring);
  circles.push([CP.x, CP.z, 1.25]);
  const seats: { x: number; z: number; y: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const x = CP.x + Math.cos(a) * 2.7,
      z = CP.z + Math.sin(a) * 2.7;
    const y = at(x, z);
    // a split log, flat side up
    B.add(1.7, 0.42, 0.5, x, y - 0.02, z, i % 2 ? "#7a4a2e" : "#8a5634", -a + Math.PI / 2);
    B.add(1.6, 0.04, 0.42, x, y + 0.4, z, "#c8925a", -a + Math.PI / 2);
    seats.push({ x: CP.x + Math.cos(a) * 2.85, z: CP.z + Math.sin(a) * 2.85, y: y + 0.44 });
  }
  for (const [dx, dz, yaw, col, trim] of [
    [-5.2, -3.6, 0.6, "#e07a2a", "#3a4a5a"],
    [4.8, -4.4, -0.5, "#3a7a4a", "#e8d06a"],
    [-1.5, -6.2, 0.05, "#c83a3a", "#e8e4dc"],
  ] as const) {
    const t = tentObject(col, trim);
    t.position.set(CP.x + dx, at(CP.x + dx, CP.z + dz) - 0.05, CP.z + dz);
    t.rotation.y = yaw;
    group.add(t);
    circles.push([CP.x + dx, CP.z + dz, 1.4]);
  }

  // ---- lanterns along the trails: a post every ten metres or so, alternating sides ----------------
  let side = 1;
  for (const t of TRAILS) {
    let carry = 4;
    for (let s = 1; s < t.length; s++) {
      const [ax, az] = t[s - 1],
        [bx, bz] = t[s];
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = carry; d < len; d += 9.5) {
        const x = ax + ((bx - ax) * d) / len + ((bz - az) / len) * 1.25 * side,
          z = az + ((bz - az) * d) / len - ((bx - ax) / len) * 1.25 * side;
        side = -side;
        if (land.walkAt(x, z) !== null) continue;
        if (Math.hypot(x - CP.x, z - CP.z) < 7) continue;
        lanterns.push(new THREE.Vector3(x, land.floor(x, z), z));
        carry = d + 9.5 - len;
      }
      carry = Math.max(0, carry);
    }
  }
  // the boardwalks get theirs on the rail posts
  for (const w of land.walks)
    for (let s = 1; s < w.pts.length; s++) {
      const [ax, az] = w.pts[s - 1],
        [bx, bz] = w.pts[s];
      const yaw = Math.atan2(bx - ax, bz - az);
      lanterns.push(new THREE.Vector3((ax + bx) / 2 + Math.cos(yaw) * 0.95, (w.y[s - 1] + w.y[s]) / 2 + 0.05 - 0.2, (az + bz) / 2 - Math.sin(yaw) * 0.95));
    }
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.36, 0.18), toneMapped: false });
  const postGeo = new THREE.BoxGeometry(0.12, 1.25, 0.12).translate(0, 0.625, 0);
  const capGeo = mergeGeometries([new THREE.BoxGeometry(0.34, 0.06, 0.34).translate(0, 1.66, 0), new THREE.BoxGeometry(0.3, 0.05, 0.3).translate(0, 1.27, 0), new THREE.BoxGeometry(0.06, 0.12, 0.06).translate(0, 1.74, 0)]);
  const glassGeo = new THREE.BoxGeometry(0.22, 0.32, 0.22).translate(0, 1.46, 0);
  const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: "#4a3424", roughness: 0.9 }), lanterns.length);
  const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: "#2a2a30", roughness: 0.5, metalness: 0.6 }), lanterns.length);
  const glass = new THREE.InstancedMesh(glassGeo, lanternMat, lanterns.length);
  const mtx = new THREE.Matrix4();
  lanterns.forEach((p, i) => {
    mtx.makeTranslation(p.x, p.y - 0.05, p.z);
    posts.setMatrixAt(i, mtx);
    caps.setMatrixAt(i, mtx);
    glass.setMatrixAt(i, mtx);
    circles.push([p.x, p.z, 0.15]);
  });
  posts.castShadow = caps.castShadow = true;
  group.add(posts, caps, glass);
  for (const p of lanterns) p.y += 1.46;

  group.add(B.mesh());
  return {
    group,
    circles,
    rects,
    lanterns,
    lanternMat,
    windows,
    fire: new THREE.Vector3(CP.x, fy + 0.25, CP.z),
    seats,
    chimney: new THREE.Vector3(CB.x + 0.92, cabinY + 44 / 6, CB.z + 3.75),
  };
}

export { BOARDWALKS };
