// Dev page: one landmark alone on its lot, lit like the city by day or night.
// http://localhost:3007/lmtest.html?kind=stadium&w=92&d=68&night&cam=iso|front|top|street|x,y,z;tx,ty,tz
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { meshModel, MATERIALS } from "./scene/voxel/mesher";
import { VOX, type Kind } from "./scene/voxel/model";
import { landmark, type LandmarkKind } from "./scene/voxel/landmarks";
import { neonTexture } from "./scene/textures";

const q = new URLSearchParams(location.search);
const kind = (q.get("kind") ?? "stadium") as LandmarkKind;
const w = Number(q.get("w") ?? 60),
  d = Number(q.get("d") ?? 40);
const night = q.has("night");
const canvas = document.getElementById("c") as HTMLCanvasElement;
const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
r.setPixelRatio(1);
r.setSize(innerWidth, innerHeight, false);
r.toneMapping = THREE.ACESFilmicToneMapping;
r.shadowMap.enabled = true;
r.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(night ? "#140a20" : "#dfe2f0");
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = night ? 0.15 : 0.5;
scene.add(new THREE.HemisphereLight(night ? "#5a4c9a" : "#f4f0ff", night ? "#140c20" : "#9a94a8", night ? 0.7 : 1.9));
const sun = new THREE.DirectionalLight(night ? "#9fa8ff" : "#fff2dc", night ? 0.5 : 2.4);
const R = Math.max(w, d);
sun.position.set(-R * 0.6, R * 1.2, R * 0.8);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: R * 4 });
scene.add(sun);

const t0 = performance.now();
const b = landmark(7, { kind, w, d });
const k = b.scale ?? 1;
const geos = meshModel(b.model);
const obj = new THREE.Group();
for (const [kd, geo] of Object.entries(geos) as [Kind, THREE.BufferGeometry][]) {
  geo.scale(k, k, k);
  const mesh = new THREE.Mesh(geo, MATERIALS[kd]);
  mesh.castShadow = kd !== "emit";
  mesh.receiveShadow = kd !== "emit";
  obj.add(mesh);
}
const ms = Math.round(performance.now() - t0);
// the model's body front centre sits on the lot's front edge (z = d/2 here)
const m = b.model;
const local = (x: number, y: number, z: number) => new THREE.Vector3((x - m.w / 2) * VOX * k, y * VOX * k, (z - m.d / 2) * VOX * k);
const fc = local((b.body[0] + b.body[2]) / 2, 0, b.body[3]);
obj.position.set(-fc.x, 0.2, d / 2 - fc.z);
scene.add(obj);
// signs, as the city mounts them
for (const s of b.signs) {
  const { texture, aspect } = neonTexture(s.text, s.color, { vertical: s.vertical });
  const sw = s.w * VOX * k,
    sh = s.h * VOX * k;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(sw, sh * aspect), sh), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }));
  plane.position.copy(local(s.x, s.y, s.z)).add(obj.position);
  plane.position.z += 0.02;
  scene.add(plane);
}
// the lot (paving) and the streets round it
const lot = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), new THREE.MeshStandardMaterial({ color: night ? "#4a4652" : "#d8d4de" }));
lot.position.y = 0.1;
lot.receiveShadow = true;
scene.add(lot);
const road = new THREE.Mesh(new THREE.PlaneGeometry(w + 40, d + 40), new THREE.MeshStandardMaterial({ color: night ? "#2a2833" : "#8e8da6" }));
road.rotation.x = -Math.PI / 2;
road.receiveShadow = true;
scene.add(road);
// a person for scale, by the front
const person = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.3), new THREE.MeshStandardMaterial({ color: "#f4b728" }));
person.position.set(2, 1.05, d / 2 + 1);
scene.add(person);
for (const [x, y, z, c] of b.lights) {
  const l = new THREE.PointLight(c, night ? 20 : 4, 18);
  l.position.copy(local(x, y, z)).add(obj.position);
  scene.add(l);
}

const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 3000);
const H = m.h * VOX * k;
const view = q.get("cam") ?? "iso";
const target = new THREE.Vector3(0, H * 0.3, 0);
if (view === "iso") cam.position.set(R * 1.1, R * 0.9 + H * 0.6, R * 1.3);
else if (view === "front") cam.position.set(0, Math.max(4, H * 0.4), d / 2 + R * 1.2);
else if (view === "top") cam.position.set(0.01, R * 2.2 + H, 0.01), target.set(0, 0, 0);
else if (view === "street") cam.position.set(w * 0.3, 1.7, d / 2 + 6), target.set(0, Math.min(H * 0.5, 12), 0);
else if (view === "back") cam.position.set(-R * 1.1, R * 0.8 + H * 0.5, -R * 1.2);
else {
  const [p, t] = view.split(";").map((v) => v.split(",").map(Number));
  cam.position.set(p[0], p[1], p[2]);
  if (t) target.set(t[0], t[1], t[2]);
}
cam.lookAt(target);
r.render(scene, cam);
const tris = r.info.render.triangles;
Object.assign(window, { lmReady: { ms, tris, voxels: [m.w, m.h, m.d], scale: k, metres: [m.w * VOX * k, H, m.d * VOX * k] } });
