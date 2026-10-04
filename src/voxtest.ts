// Dev page: renders voxel parts in isolation (http://localhost:3007/voxtest.html?part=...).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { C, E, G, shades, VoxelModel } from "./scene/voxel/model";
import { toObject } from "./scene/voxel/mesher";
import * as B from "./scene/voxel/buildings";
import * as Pr from "./scene/voxel/props";
import { VOX } from "./scene/voxel/model";

function gallery(kind: string) {
  const g = new THREE.Group();
  const items: THREE.Object3D[] = [];
  if (kind === "buildings") {
    const list = [
      B.shophouse(11, { shop: "ramen", vsign: "x", fireEscape: true }),
      B.konbini(3),
      B.izakaya(5),
      B.apartment(7, { floors: 6 }),
      B.office(9, { floors: 9, billboard: "x" }),
      B.shophouse(13, { shop: "karaoke", floors: 4 }),
      B.warehouse(15),
      B.house(17),
    ];
    for (const b of list) items.push(toObject(b.model));
  } else {
    const list = [Pr.tree("round", 1), Pr.tree("blossom", 2), Pr.tree("pine", 3), Pr.tree("persimmon", 4), Pr.streetLamp(), Pr.vendingMachine("red"), Pr.vendingMachine("blue"), Pr.bench(), Pr.bicycle("#c03a3a"), Pr.utilityPole(), Pr.busShelter(), Pr.stall("#c0503a", 3), Pr.container("#6a3a8a", 1), Pr.planter(1, true), Pr.trashBags(2), Pr.crates(3), Pr.mailbox(), Pr.hydrant(), Pr.cone(), Pr.bollard()];
    for (const p of list) items.push(toObject(p.model));
  }
  let x = 0;
  for (const o of items) {
    const box = new THREE.Box3().setFromObject(o);
    const w = box.max.x - box.min.x;
    o.position.x = x + w / 2;
    x += w + (kind === "props" ? 0.6 : 1.5);
    g.add(o);
  }
  g.position.x = -x / 2;
  void VOX;
  return g;
}

const q = new URLSearchParams(location.search);
const name = q.get("part");
const canvas = document.getElementById("c") as HTMLCanvasElement;
const r = new THREE.WebGLRenderer({ canvas, antialias: true });
r.setSize(innerWidth, innerHeight, false);
r.toneMapping = THREE.ACESFilmicToneMapping;
r.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0a12");
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;
scene.add(new THREE.HemisphereLight("#8a84c8", "#201828", 1.6));
const sun = new THREE.DirectionalLight("#ffe0c0", 1.2);
sun.position.set(-6, 12, 8);
sun.castShadow = true;
scene.add(sun);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 200);
const view = q.get("cam") ?? "";
if (name === "buildings") cam.position.set(18, 30, 70);
else if (name === "props") cam.position.set(6, 6, 16);
else cam.position.set(9, 8, 12);
if (view === "close") cam.position.set(-16, 7, 16);
if (view === "close2") cam.position.set(4, 7, 18);
const ctl = new OrbitControls(cam, canvas);
ctl.target.set(name === "buildings" ? 0 : 0, name === "buildings" ? 6 : name === "props" ? 1 : 2, 0);
if (view === "close") ctl.target.set(-22, 4, 0);
if (view === "close2") ctl.target.set(-2, 6, 0);

let obj: THREE.Object3D;
if (name === "buildings" || name === "props") obj = gallery(name);
else {
  const m = new VoxelModel(30, 36, 24);
  m.box(0, 0, 0, 30, 36, 24, shades(["#5a5266", "#564e62", "#5e566a"], 2));
  for (let f = 0; f < 3; f++)
    for (let k = 0; k < 3; k++) {
      const x = 3 + k * 9,
        y = 6 + f * 10;
      m.box(x - 1, y - 1, 23, x + 8, y + 8, 24, C("#2a2630"));
      m.clear(x, y, 22, x + 7, y + 7, 24);
      m.box(x, y, 21, x + 7, y + 7, 22, (k + f) % 2 ? E("#ffb05a", 1.6) : G("#1c2638"));
      m.box(x - 1, y - 2, 24, x + 8, y - 1, 25, C("#8a8494"));
    }
  m.blob(15, 32, 12, 6, shades(["#2f6b3c", "#3d8a4a"]), 0.3);
  obj = toObject(m);
}
scene.add(obj);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: "#2a2833" }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const loop = () => {
  ctl.update();
  r.render(scene, cam);
  requestAnimationFrame(loop);
};
loop();
