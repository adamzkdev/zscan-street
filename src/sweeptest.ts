// Dev page: the final sweep's realistic objects alone under the HDR sky (yachts, the cruise ship, the
// sky's traffic, the woods' animals, the building sites…): sweeptest.html?set=boats|air|life|works&view=three|side|top&night
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { realCruise, realJetSki, realMotorYacht, realSailYacht, realSpeedBoat } from "./scene/real/yachts";
import { realDrone, realHeli, realParcel, realPlane } from "./scene/real/aircraft";
import { realBird, realDeer } from "./scene/real/animals";

const q = new URLSearchParams(location.search);
const set = q.get("set") ?? "boats";
const view = q.get("view") ?? "three";
const night = q.has("night");
const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = night ? 0.6 : 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(renderer);
new RGBELoader().load("/hdr/kloofendal_48d_partly_cloudy_puresky.hdr", (t) => {
  t.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pm.fromEquirectangular(t).texture;
  scene.background = night ? new THREE.Color("#0a0c14") : t;
  scene.environmentIntensity = night ? 0.25 : 1;
  (window as unknown as { __ready: boolean }).__ready = true;
});
const sun = new THREE.DirectionalLight("#fff1dc", night ? 0.2 : 2.6);
sun.position.set(30, 40, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -40;
sun.shadow.camera.right = sun.shadow.camera.top = 40;
scene.add(sun);
const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#2a5a70", roughness: 0.15, metalness: 0.3 }));
water.rotation.x = -Math.PI / 2;
water.receiveShadow = true;
const items: [THREE.Object3D, number][] = [];
if (set === "boats") {
  scene.add(water);
  items.push([realSailYacht("#f4f4f6", "#f4b728"), 0.35], [realMotorYacht(), 0.25], [realSpeedBoat("#d0202a"), 0.25], [realJetSki("#f4b728"), 0.25]);
  const c = realCruise();
  c.scale.setScalar(2);
  items.push([c, 0.9]);
}
if (set === "air") {
  const pl = realPlane();
  pl.scale.setScalar(3);
  items.push([realHeli("#f2f2f6", "#d0202a"), 0], [realHeli("#1e1d24", "#f4b728"), 0], [pl, 0], [realDrone(), 0], [realParcel(), 0]);
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#6a6a70", roughness: 0.9 }));
  gr.rotation.x = -Math.PI / 2;
  gr.receiveShadow = true;
  scene.add(gr);
}
if (set === "life") {
  for (const [h, b] of [["up", true], ["down", false], ["up", false]] as const) items.push([realDeer(h, b), 0]);
  const r = realBird("#1a1a22", 5, true);
  r.position.y = 2;
  items.push([r, -2], [realBird("#c84a2a", 2, false), -1]);
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#5a7a3a", roughness: 0.95 }));
  gr.rotation.x = -Math.PI / 2;
  gr.receiveShadow = true;
  scene.add(gr);
}
let x = 0;
const span: number[] = [];
for (const [o, sink] of items) {
  const b = new THREE.Box3().setFromObject(o);
  const w = b.max.x - b.min.x;
  o.position.set(x + w / 2 - (b.max.x + b.min.x) / 2, -sink, 0);
  x += w + 4;
  span.push(w);
  scene.add(o);
}
const cx = x / 2;
for (const [o] of items) o.position.x -= cx;
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 2000);
const d = Math.max(set === "life" ? 7 : 30, x * 0.75);
if (view === "side") cam.position.set(0, 6, d);
else if (view === "top") cam.position.set(0, d, 0.01);
else cam.position.set(d * 0.55, d * 0.35, d * 0.75);
cam.lookAt(0, set === "life" ? 1 : 3, 0);
function frame() {
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
frame();
