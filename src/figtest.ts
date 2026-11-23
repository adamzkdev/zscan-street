// Dev page: the game's zkSNARK figures (src/gta/figure.ts) in a sunlit studio, close up — figtest.html?ids=1192,9703&view=front|three|side|back|walk
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { faces } from "./gta/faces";
import { SnarkFigure } from "./gta/figure";

const q = new URLSearchParams(location.search);
const ids = (q.get("ids") ?? "1192,9703,5506,42,777").split(",").map(Number);
const view = q.get("view") ?? "three";
const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#a9c3e6");
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight("#cfe2ff", "#6a5a48", 0.9));
const sun = new THREE.DirectionalLight("#fff1dc", 2.6);
sun.position.set(4, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -6;
sun.shadow.camera.right = sun.shadow.camera.top = 6;
sun.shadow.bias = -0.0004;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: "#b8b2aa", roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 100);
const figs: SnarkFigure[] = [];
const gap = 1.05;
(async () => {
  faces.want(ids, true);
  for (const id of ids) await faces.wait(id, 15000);
  ids.forEach((id, i) => {
    const f = new SnarkFigure(id);
    f.root.position.set((i - (ids.length - 1) / 2) * gap, 0, 0);
    const yaw = view === "front" ? 0 : view === "side" || view === "swim" || view.endsWith("lie") ? Math.PI / 2 : view === "back" ? Math.PI : view === "walk" ? Math.PI / 2 : 0.6;
    f.root.rotation.y = yaw;
    scene.add(f.root);
    figs.push(f);
  });
  const w = ids.length * gap;
  const near = q.has("close") ? 0.62 : 1.15;
  cam.position.set(0, q.has("close") ? 1.05 : 1.2, q.has("close") ? 3.4 : Math.max(2.1, w * near));
  cam.lookAt(0, q.has("close") ? 0.78 : 0.85, 0);
  console.log("verts", figs.map((f) => f.look.head.getAttribute("position").count + f.look.body.getAttribute("position").count).join(","));
  (window as unknown as { __figReady: boolean }).__figReady = true;
})();
let last = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const f of figs) {
    if (view === "swim" || view === "tread") f.act.swim = 1;
    if (view === "back-lie") f.act.lie = 1;
    if (view === "front-lie") f.act.lie = 2;
    if (view === "sit") f.act.seat = 0.03;
    f.update(dt, { speed: view === "walk" || view === "swim" ? 1.4 : 0, grounded: true });
  }
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
frame();
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight, false);
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
});
