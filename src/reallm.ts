// Dev page: one realistic landmark (src/scene/real/landmarks.ts) alone on its lot, with the city's real materials,
// the HDR sky, its trees and props. reallm.html?kind=noir&night&cam=front|three|iso|street|top|x,y,z;tx,ty,tz&voxel
import * as THREE from "three";
import { LOTS } from "./scene/city/plan";
import { landmark, type LandmarkKind } from "./scene/voxel/landmarks";
import { buildJob } from "./scene/city/build";
import type { BuildingJob } from "./scene/city/plan";
import { meshModel, MATERIALS } from "./scene/voxel/mesher";
import { VOX, type Kind } from "./scene/voxel/model";
import { realLandmark } from "./scene/real/landmarks";
import { realMat } from "./scene/real/mats";
import { isSlot } from "./scene/real/buildings";
import { texSetup } from "./scene/real/tex";
import { loadSkies, skyEnv } from "./scene/envmap";
import { plantTrees, type Species } from "./scene/real/trees";
import { placeProps } from "./scene/real/props";
import { GLASS_NIGHT } from "./scene/voxel/surface";
import { neonTexture } from "./scene/textures";
import { GROUND } from "./scene/real/ground";

const q = new URLSearchParams(location.search);
const kind = (q.get("kind") ?? "noir") as LandmarkKind;
const night = q.has("night");
const lot = LOTS.find((l) => l.kind === kind);
const FACE: Record<string, string> = { stadium: "s", museum: "e", foodhall: "n", reserve: "n", mall: "s", needle: "s", marina: "n", gardens: "n", port: "n", pyramid: "s", eiffel: "s", colosseum: "s", parliament: "s", shibuya: "e", zkorchard: "s", zksapling: "n", zkhalo: "s", binhai: "n", cemetery: "s", zodl: "s", vizor: "n", noir: "s", zlab: "s", university: "s", zsalab: "n", convention: "n", gamehouse: "s" };
const ns = !lot || FACE[kind] === "s" || FACE[kind] === "n";
const w = Number(q.get("w") ?? (lot ? (ns ? lot.x1 - lot.x0 : lot.z1 - lot.z0) : 40)),
  d = Number(q.get("d") ?? (lot ? (ns ? lot.z1 - lot.z0 : lot.x1 - lot.x0) : 40));
const canvas = document.getElementById("c") as HTMLCanvasElement;
const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
r.setPixelRatio(1);
r.setSize(innerWidth, innerHeight, false);
r.toneMapping = THREE.ACESFilmicToneMapping;
r.toneMappingExposure = night ? 1.0 : 0.92;
r.shadowMap.enabled = true;
r.shadowMap.type = THREE.PCFSoftShadowMap;
texSetup(r);
const scene = new THREE.Scene();
scene.background = new THREE.Color(night ? "#0c0a18" : "#9ebfe6");
scene.fog = new THREE.Fog(scene.background as THREE.Color, 300, 1400);
GLASS_NIGHT.value = night ? 1 : 0;
scene.add(new THREE.HemisphereLight(night ? "#4a4c8a" : "#d6e4ff", night ? "#140c20" : "#a89c8c", night ? 0.6 : 0.9));
const sun = new THREE.DirectionalLight(night ? "#9fa8ff" : "#ffe8c8", night ? 0.5 : 3.6);
const R = Math.max(w, d);
sun.position.set(-R * 0.7, R * 1.4, R * 0.9);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -R * 1.2, right: R * 1.2, top: R * 1.2, bottom: -R * 1.2, near: 1, far: R * 6 });
sun.shadow.bias = -0.0005;
scene.add(sun);
let pending = 2;
loadSkies(r, () => {
  const s = skyEnv(night ? -10 : 40);
  if (s) scene.environment = s;
  if (--pending === 0) ready();
});
scene.environmentIntensity = night ? 0.2 : 0.4;

// (?type=mempool|kiosk|streetshop&shop=ramen|bookshop|pavilion: a heart building, scale 1)
const htype = q.get("type");
const b = htype ? buildJob({ id: 1, type: htype, seed: 7, opts: { kind: q.get("shop") ?? "ramen", width: Number(q.get("bw") ?? 26) }, along: 0, front: 0, face: "s", district: "heart", frontRow: true, width: Number(q.get("bw") ?? (htype === "bookshop" ? 108 : htype === "pavilion" ? 40 : htype === "kiosk" ? 30 : 26)) } as unknown as BuildingJob) : landmark(7, { kind, w, d });
if (htype) Object.assign(b, { kind: q.get("shop") ?? "ramen" });
const k = b.scale ?? 1;
const m = b.model;
const obj = new THREE.Group();
const t0 = performance.now();
let tris = 0;
if (q.has("voxel")) {
  for (const [kd, geo] of Object.entries(meshModel(m)) as [Kind, THREE.BufferGeometry][]) {
    geo.scale(k, k, k);
    const mesh = new THREE.Mesh(geo, MATERIALS[kd]);
    mesh.castShadow = mesh.receiveShadow = kd !== "emit";
    obj.add(mesh);
  }
} else {
  const res = realLandmark(htype ? `h:${htype}` : kind, b, { lod: q.has("far") ? 1 : 0, clipY: q.has("cut") ? 2.67 : undefined });
  for (const [slot, g] of Object.entries(res.geos)) {
    if (!isSlot(slot) || !g) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(g.pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(g.nor, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(g.uv, 2));
    geo.setAttribute("color", new THREE.BufferAttribute(g.col, 3));
    geo.setIndex(g.idx);
    tris += g.idx.length / 3;
    const mesh = new THREE.Mesh(geo, realMat(slot));
    mesh.castShadow = mesh.receiveShadow = slot !== "neon";
    obj.add(mesh);
  }
  plantTrees(obj, res.extras.trees.map(([x, y, z, sp, seed]) => ({ x, y, z, species: sp as Species, seed })));
  placeProps(obj, res.extras.props.map(([type, x, y, z, rot, arg]) => ({ type, args: arg ? [arg] : [], x, y, z, rot })));
}
const ms = Math.round(performance.now() - t0);
// the body front centre sits on the lot's front edge (z = d/2)
const local = (x: number, y: number, z: number) => new THREE.Vector3((x - m.w / 2) * VOX * k, y * VOX * k, (z - m.d / 2) * VOX * k);
obj.position.set(0, 0.2, 0);
scene.add(obj);
for (const s of b.signs) {
  const { texture, aspect } = neonTexture(s.text, s.color, { vertical: s.vertical });
  const sw = s.w * VOX * k,
    sh = s.h * VOX * k;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(sw, sh * aspect), sh), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }));
  plane.position.copy(local(s.x, s.y, s.z)).add(obj.position);
  if (s.facing === "side") plane.rotation.y = Math.PI / 2;
  if ((s as { back?: boolean }).back) plane.rotation.y = Math.PI;
  plane.position.z += 0.02;
  scene.add(plane);
}
// the streets round it
const road = new THREE.Mesh(new THREE.PlaneGeometry(w + 120, d + 120), GROUND.asphalt());
road.rotation.x = -Math.PI / 2;
road.receiveShadow = true;
const uv = road.geometry.getAttribute("uv");
for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w + 120) / 6, uv.getY(i) * (d + 120) / 6);
scene.add(road);
const person = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.3), new THREE.MeshStandardMaterial({ color: "#f4b728" }));
person.position.set(2, 1.05, d / 2 + 1);
scene.add(person);
for (const [x, y, z, c] of b.lights) {
  const l = new THREE.PointLight(c, night ? 30 : 0, 22);
  l.position.copy(local(x, y, z)).add(obj.position);
  scene.add(l);
}
const box = new THREE.Box3().setFromObject(obj);
const H = box.max.y;
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 4000);
const view = q.get("cam") ?? "three";
const target = new THREE.Vector3(0, Math.min(H * 0.35, 40), 0);
const far = Math.max(R * 1.5, H * 2.1);
if (view === "three") (cam.position.set(far * 0.55, Math.max(10, H * 0.42), d / 2 + far * 0.85), target.set(0, H * 0.4, 0));
else if (view === "iso") cam.position.set(R * 1.1, R * 0.9 + H * 0.6, R * 1.3);
else if (view === "front") cam.position.set(0, Math.max(4, H * 0.35), d / 2 + R * 1.1 + H * 0.5);
else if (view === "top") cam.position.set(0.01, R * 2.2 + H, 0.01), target.set(0, 0, 0);
else if (view === "street") cam.position.set(w * 0.25, 1.7, d / 2 + 10), target.set(0, Math.min(H * 0.5, 14), 0);
else if (view === "back") cam.position.set(-R * 1.1, R * 0.8 + H * 0.5, -R * 1.2);
else {
  const [p, t] = view.split(";").map((v) => v.split(",").map(Number));
  cam.position.set(p[0], p[1], p[2]);
  if (t) target.set(t[0], t[1], t[2]);
}
cam.lookAt(target);
setTimeout(() => {
  if (--pending === 0) ready();
}, 2500);
function ready() {
  r.render(scene, cam);
  Object.assign(window, { lmReady: { ms, tris, H: Math.round(H), size: [w, d], scale: k } });
}
function loop() {
  r.render(scene, cam);
  requestAnimationFrame(loop);
}
loop();
