import * as THREE from "three";
import { assetColor, assetName, units, Zsa, type ZsaAsset, type ZsaEvent } from "../../data/zsa";
import { loadArt, Snark } from "../../scene/snark";
import { box, makeScene, std } from "../kit";
import type { Interior, InteriorContext, PickInfo, Rect } from "../types";

const MONO = '"JetBrains Mono", Menlo, monospace';
const SANS = "Roboto, Inter, sans-serif";
const TEAL = "#3ef0c8";
const MAGENTA = "#ff3e8a";
const GOLD = "#f4b728";
const AMBER = "#ffb347";
const REFRESH = 20;
/** Coins riding the conveyor at once. */
const BELT_COINS = 16;
/** The register: deposit boxes, columns × rows. */
const BOXES = [6, 4] as const;
/** Buckets on the overhead chain. */
const BUCKETS = 28;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;
const KIND: Record<ZsaEvent["kind"], [string, string]> = {
  issue: ["STRUCK", TEAL],
  finalize: ["DIE BROKEN", GOLD],
  burn: ["MELTED", "#ff7a4a"],
  transfer: ["SENT", "#9fb8ff"],
};

function ticker(name: string) {
  const w = name.replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const caps = w.match(/\p{Lu}/gu)?.join("") ?? "";
  return (caps.length >= 2 ? caps : w.replace(/ /g, "")).slice(0, 4).toUpperCase() || "ZSA";
}
/** A token's tag: from its name, else from its id (#0CC). */
const tag = (a: { name: string | null; asset_id: string }) => (a.name?.trim() ? ticker(a.name) : `#${a.asset_id.slice(0, 3).toUpperCase()}`);

function canvasTex(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, g: c.getContext("2d")!, t };
}

/** A coin face (canvas): rim in the token's colour, milled ring, its tag, its name. */
function drawCoin(g: CanvasRenderingContext2D, s: number, a: { name: string | null; asset_id: string }, sealed = false) {
  const col = assetColor(a.asset_id);
  const r = s / 2;
  g.clearRect(0, 0, s, s);
  const grad = g.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
  grad.addColorStop(0, "#3a3226");
  grad.addColorStop(1, "#14110c");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r - 2, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = s * 0.07;
  g.strokeStyle = col;
  g.beginPath();
  g.arc(r, r, r - s * 0.05, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = sealed ? GOLD : "rgba(255,255,255,0.35)";
  g.lineWidth = s * 0.012;
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    g.beginPath();
    g.moveTo(r + Math.cos(t) * (r - s * 0.11), r + Math.sin(t) * (r - s * 0.11));
    g.lineTo(r + Math.cos(t) * (r - s * 0.14), r + Math.sin(t) * (r - s * 0.14));
    g.stroke();
  }
  g.fillStyle = col;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const t = tag(a);
  g.font = `900 ${t.length > 3 ? s * 0.22 : s * 0.28}px ${MONO}`;
  g.fillText(t, r, r * 0.92);
  g.fillStyle = "#efe6d0";
  g.font = `600 ${s * 0.075}px ${SANS}`;
  g.fillText(assetName(a).slice(0, 18).toUpperCase(), r, r * 1.5, s * 0.7);
}

/** A soft vertical gradient (for light shafts and pours). */
function shaftTex(color: string) {
  const { g, t } = canvasTex(64, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, color);
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 256);
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, "rgba(0,0,0,1)");
  h.addColorStop(0.5, "rgba(0,0,0,0)");
  h.addColorStop(1, "rgba(0,0,0,1)");
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = h;
  g.fillRect(0, 0, 64, 256);
  t.needsUpdate = true;
  return t;
}

/**
 * THE ZSA MINT: a cyberpunk mint, three storeys of it, where visitors strike their own Zcash
 * Shielded Asset (ZIP 227) on the public ZSA test network, proved and signed in their browser.
 *
 * In the middle the great press, 13 m of steel: its ram comes down on every real issuance on the
 * chain (yours included, at once), sparks fly, the neon all over the hall pulses with the blow and a
 * cascade of coins spills into the bin; the new coin drops onto the conveyor, which carries the
 * chain's latest tokens past two robot arms into the vault, where a mountain of gold glows behind
 * the open door. Overhead a chain of buckets carries coins round the hall. Light falls in shafts
 * from the high windows through the dust; at the back the melt pours molten metal into ingot moulds
 * (burn, ZIP 226) and the die room breaks dies (finalize: no more of a token, ever). Catwalks run
 * along both walls on two levels; zkSNARKs work everywhere: carrying ingots, patrolling the
 * catwalks, watching the control desk, queueing at the STRIKE counter. On the left wall the
 * register, a deposit box per token; on the right the departures board of everything struck, sent,
 * melted and sealed. When you strike your own coin, the camera dives to the press and follows it.
 */
export function buildZsaLab(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#06070a");
  scene.environmentIntensity = 0.12;
  scene.fog = new THREE.Fog("#090a0e", 22, 70);
  const rects: Rect[] = [];
  const picks = new Map<THREE.Object3D, PickInfo>();
  const hovers = new Map<THREE.Object3D, string>();
  const pickables: THREE.Object3D[] = [];
  const pickable = (o: THREE.Object3D, info: PickInfo, hover: string) => {
    o.traverse((m) => {
      if (!(m as THREE.Mesh).isMesh) return;
      picks.set(m, info);
      hovers.set(m, hover);
      pickables.push(m);
    });
  };
  const ticks: ((dt: number, t: number) => void)[] = [];
  /** Where the visitor's eye is (coins turn their face to it). */
  const camPos = new THREE.Vector3(0, 1.7, 10);
  /** Every neon in the hall: they all flare with a strike. */
  const neons: { m: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  const neon = (color: string, k = 2) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });
    neons.push({ m, base: m.color.clone() });
    return m;
  };
  let flare = 0;

  // ---- the hall: 36 × 56 m, 16 m high; concrete, steel, hazard stripes --------------------------------
  const H = { x0: -18, x1: 18, z0: -44, z1: 12, h: 16 };
  const concrete = canvasTex(512, 512);
  {
    const g = concrete.g;
    g.fillStyle = "#23252a";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,0,0"},${Math.random() * 0.05})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 3;
    g.strokeRect(0, 0, 512, 512);
  }
  concrete.t.wrapS = concrete.t.wrapT = THREE.RepeatWrapping;
  concrete.t.repeat.set(9, 14);
  const floorM = new THREE.MeshStandardMaterial({ map: concrete.t, roughness: 0.45, metalness: 0.2 });
  const steel = canvasTex(256, 512);
  {
    const g = steel.g;
    g.fillStyle = "#2a2e35";
    g.fillRect(0, 0, 256, 512);
    g.strokeStyle = "#181b20";
    g.lineWidth = 6;
    g.strokeRect(3, 3, 250, 506);
    g.fillStyle = "#3a3f48";
    for (const y of [24, 256, 488]) for (let x = 20; x < 256; x += 54) g.fillRect(x, y, 8, 8);
  }
  steel.t.wrapS = steel.t.wrapT = THREE.RepeatWrapping;
  steel.t.repeat.set(14, 2);
  const wallM = new THREE.MeshStandardMaterial({ map: steel.t, roughness: 0.55, metalness: 0.6 });
  const darkSteel = std("#15171b", 0.45, 0.75);
  const gunmetal = std("#3a3e46", 0.32, 0.88);
  const brass = std("#c4922e", 0.28, 0.92);
  const gold = std("#e7b84a", 0.22, 1);
  const hazard = canvasTex(256, 32);
  for (let i = -1; i < 9; i++) {
    hazard.g.fillStyle = i % 2 ? "#141414" : "#e8b10f";
    hazard.g.beginPath();
    hazard.g.moveTo(i * 32, 32);
    hazard.g.lineTo(i * 32 + 32, 0);
    hazard.g.lineTo(i * 32 + 64, 0);
    hazard.g.lineTo(i * 32 + 32, 32);
    hazard.g.fill();
  }
  hazard.t.wrapS = THREE.RepeatWrapping;
  const lane = (w: number, d: number, x: number, z: number, rot = 0) => {
    const t = hazard.t.clone();
    t.repeat.set(w / 1.2, 1);
    t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.position.set(x, 0.012, z);
    scene.add(m);
  };

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0, H.z1 - H.z0), floorM);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (H.z0 + H.z1) / 2);
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0, H.z1 - H.z0), std("#0a0b0e", 0.9));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, H.h, (H.z0 + H.z1) / 2);
  scene.add(ceil);
  const wallPanel = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(x0 === x1 ? 0.3 : len, H.h, x0 === x1 ? len : 0.3), wallM);
    m.position.set((x0 + x1) / 2, H.h / 2, (z0 + z1) / 2);
    scene.add(m);
    rects.push([Math.min(x0, x1) - 0.15, Math.min(z0, z1) - 0.15, Math.max(x0, x1) + 0.15, Math.max(z0, z1) + 0.15]);
  };
  wallPanel(H.x0, H.z0, H.x0, H.z1);
  wallPanel(H.x1, H.z0, H.x1, H.z1);
  wallPanel(H.x0, H.z0, H.x1, H.z0);
  wallPanel(H.x0, H.z1, -1.8, H.z1);
  wallPanel(1.8, H.z1, H.x1, H.z1);
  rects.push([-1.8, H.z1 - 0.1, 1.8, H.z1 + 0.1]);
  // neon lines along the walls at three heights, roof trusses with lamps
  for (const [x, z, w, d] of [
    [H.x0 + 0.17, (H.z0 + H.z1) / 2, 0.05, H.z1 - H.z0],
    [H.x1 - 0.17, (H.z0 + H.z1) / 2, 0.05, H.z1 - H.z0],
    [0, H.z0 + 0.17, H.x1 - H.x0, 0.05],
  ] as const) {
    box(scene, w, 0.07, d, neon(MAGENTA, 2.2), x, 0.35, z);
    box(scene, w, 0.07, d, neon(TEAL, 1.8), x, 6.9, z);
    box(scene, w, 0.07, d, neon(TEAL, 1.4), x, H.h - 1.2, z);
  }
  for (let z = H.z0 + 4; z < H.z1; z += 6) {
    box(scene, H.x1 - H.x0, 0.5, 0.5, darkSteel, 0, H.h - 0.8, z);
    for (const x of [-9, 0, 9]) box(scene, 0.5, 0.05, 0.5, neon("#fff1d8", 1.3), x, H.h - 0.85, z);
  }
  scene.add(new THREE.HemisphereLight("#bcd6ff", "#3a2c20", 1.05));
  for (const [x, z, i] of [
    [-9, -30, 10],
    [9, -30, 10],
    [-9, -14, 10],
    [9, -14, 10],
    [0, 2, 9],
  ] as const) {
    const l = new THREE.PointLight("#ffe6c0", i * 1.5, 26, 1.6);
    l.position.set(x, H.h - 2, z);
    scene.add(l);
  }

  // ---- high windows and shafts of light through the dust (left wall) ---------------------------------
  const shaftM = new THREE.MeshBasicMaterial({ map: shaftTex("rgba(255,236,200,0.55)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, opacity: 0.7 });
  for (const z of [-34, -22, -10, 2]) {
    box(scene, 0.06, 3.4, 4, neon("#fff4dc", 1.6), H.x0 + 0.2, 11.4, z);
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(4, 16), shaftM);
    shaft.position.set(H.x0 + 6.5, 6.5, z);
    shaft.rotation.set(0, Math.PI / 2, -0.62);
    scene.add(shaft);
    const s2 = shaft.clone();
    s2.rotation.y = 0;
    s2.position.x = H.x0 + 6.5;
    scene.add(s2);
  }
  const DUST = 700;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) dustPos.set([H.x0 + 1 + Math.random() * 14, Math.random() * 13, H.z0 + 4 + Math.random() * 50], i * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.45, 1.2), size: 0.05, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
  scene.add(dust);
  ticks.push((dt, t) => {
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3 + 1] += dt * (0.05 + Math.sin(i + t * 0.3) * 0.04);
      dustPos[i * 3] += Math.sin(t * 0.2 + i) * dt * 0.05;
      if (dustPos[i * 3 + 1] > 13) dustPos[i * 3 + 1] = 0;
    }
    dustGeo.attributes.position.needsUpdate = true;
  });

  // ---- catwalks on two levels along both walls, with stairs at the front ----------------------------
  const catM = std("#1d2026", 0.5, 0.7);
  for (const side of [-1, 1]) {
    const x = side * (H.x1 - 1.4);
    for (const y of [6.2, 11.2]) {
      box(scene, 2.6, 0.18, H.z1 - H.z0 - 8, catM, x, y, (H.z0 + H.z1) / 2 - 2);
      box(scene, 0.06, 1.1, H.z1 - H.z0 - 8, gunmetal, x - side * 1.3, y + 0.18, (H.z0 + H.z1) / 2 - 2);
      box(scene, 0.06, 0.06, H.z1 - H.z0 - 8, neon(AMBER, 1.6), x - side * 1.3, y + 1.28, (H.z0 + H.z1) / 2 - 2);
      for (let z = H.z0 + 4; z < H.z1 - 6; z += 4) box(scene, 0.12, y, 0.12, gunmetal, x - side * 1.25, 0, z);
    }
    // a stair up to the first level, at the front
    for (let k = 0; k < 14; k++) box(scene, 2.2, 0.16, 0.5, catM, side * (H.x1 - 1.4), k * 0.44, 4.5 - k * 0.5);
  }

  // ---- THE PRESS: 13 m of steel -------------------------------------------------------------------
  const P = { x: 0, z: -14 };
  const press = new THREE.Group();
  box(press, 9, 1, 7, darkSteel, 0, 0, 0); // bed
  box(press, 3.6, 1.6, 3.6, gunmetal, 0, 1, 0); // anvil block
  const anvil = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.35, 0.35, 40), brass);
  anvil.position.y = 2.78;
  press.add(anvil);
  for (const x of [-3.6, 3.6]) {
    box(press, 1.2, 12, 1.6, gunmetal, x, 1, 0); // columns
    box(press, 0.1, 11, 1.62, neon(TEAL, 1.6), x + (x < 0 ? 0.62 : -0.62), 1.4, 0);
    // hydraulic hoses
    const hose = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 24, Math.PI), darkSteel);
    hose.position.set(x * 0.7, 11.6, 0.9);
    hose.rotation.z = x < 0 ? 0 : Math.PI;
    press.add(hose);
  }
  box(press, 9.4, 2.6, 2.6, darkSteel, 0, 12.4, 0); // crown
  const crownSign = canvasTex(1024, 256);
  {
    const g = crownSign.g;
    g.fillStyle = "#0b0b0f";
    g.fillRect(0, 0, 1024, 256);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = MAGENTA;
    g.font = `900 120px ${MONO}`;
    g.fillText("ZSA MINT", 512, 112);
    g.fillStyle = TEAL;
    g.font = `700 46px ${SANS}`;
    g.fillText("造幣局 · ZIP 227 · SHIELDED ASSETS", 512, 210);
    crownSign.t.needsUpdate = true;
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 2.2), new THREE.MeshBasicMaterial({ map: crownSign.t, toneMapped: false, color: new THREE.Color(1.2, 1.2, 1.2) }));
  sign.position.set(0, 13.7, 1.32);
  press.add(sign);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 3.6, 28), std("#5a606a", 0.22, 0.92));
  cyl.position.y = 10.6;
  press.add(cyl);
  const ram = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 5, 24), std("#d4d9e0", 0.12, 1));
  rod.position.y = 2.5;
  ram.add(rod);
  const head = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 3), gunmetal);
  ram.add(head);
  const die = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.45, 40), brass);
  die.position.y = -0.78;
  ram.add(die);
  const RAM_UP = 7.2,
    RAM_DOWN = 4.0;
  ram.position.y = RAM_UP;
  press.add(ram);
  const pressLight = new THREE.PointLight(TEAL, 6, 14, 1.6);
  pressLight.position.set(0, 4, 3.5);
  press.add(pressLight);
  // the coin bin in front, heaped with coins
  box(press, 3.2, 0.9, 1.6, darkSteel, 0, 1, 3.4);
  press.position.set(P.x, 0, P.z);
  scene.add(press);
  rects.push([P.x - 4.6, P.z - 3.6, P.x + 4.6, P.z + 4.3]);
  lane(10, 0.4, P.x, P.z + 4.6);
  lane(10, 0.4, P.x, P.z - 4);
  pickable(press, { eyebrow: "ZSA MINT · THE PRESS", title: "Every token struck on the chain", body: "<p>The ram comes down on every real issuance on the ZSA test network (ZIP 227): the new coin drops onto the conveyor and rides into the vault. Strike yours at the counter by the door.</p>" }, "THE PRESS · strikes every new token on the chain");

  // ---- coins: token coins (canvas faces) and plain gold ones (instanced) -----------------------------
  const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.07, 40);
  coinGeo.rotateX(Math.PI / 2); // faces ±z, standing on its edge
  const edgeM = std("#c9a24a", 0.3, 0.9);
  const makeCoin = (a: { name: string | null; asset_id: string }, sealed = false) => {
    const { g, t } = canvasTex(256, 256);
    drawCoin(g, 256, a, sealed);
    // the cylinder's cap is mapped a quarter turn off once the coin stands on its edge
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
    t.needsUpdate = true;
    const face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.6, emissive: new THREE.Color("#ffffff"), emissiveMap: t, emissiveIntensity: 0.35 });
    const m = new THREE.Mesh(coinGeo, [edgeM, face, face]);
    m.userData.dispose = () => {
      t.dispose();
      face.dispose();
    };
    return m;
  };
  const goldCoinGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  // the bin's heap
  const binCoins = new THREE.InstancedMesh(goldCoinGeo, gold, 160);
  for (let i = 0; i < 160; i++) {
    e.set(Math.random() * 0.8, Math.random() * 6, Math.random() * 0.8);
    mtx.compose(v.set(P.x + (Math.random() - 0.5) * 2.8, 1.9 + Math.random() * 0.25, P.z + 3.4 + (Math.random() - 0.5) * 1.3), q.setFromEuler(e), one);
    binCoins.setMatrixAt(i, mtx);
  }
  scene.add(binCoins);
  // the cascade: coins spraying out of the press on a strike
  const CASCADE = 90;
  const cascade = new THREE.InstancedMesh(goldCoinGeo, gold, CASCADE);
  cascade.frustumCulled = false;
  const cas = Array.from({ length: CASCADE }, () => ({ p: new THREE.Vector3(0, -20, 0), v: new THREE.Vector3(), r: 0, life: 0 }));
  scene.add(cascade);
  const spill = () => {
    for (const c of cas) {
      c.p.set(P.x + (Math.random() - 0.5) * 1.6, 3.2, P.z + 1.2);
      c.v.set((Math.random() - 0.5) * 3, 3 + Math.random() * 3, 2 + Math.random() * 2.5);
      c.r = Math.random() * 6;
      c.life = 1.6 + Math.random() * 0.8;
    }
  };
  ticks.push((dt) => {
    for (let i = 0; i < CASCADE; i++) {
      const c = cas[i];
      if (c.life > 0) {
        c.life -= dt;
        c.v.y -= 9.8 * dt;
        c.p.addScaledVector(c.v, dt);
        if (c.p.y < 1.95 && Math.abs(c.p.z - (P.z + 3.4)) < 0.8 && Math.abs(c.p.x - P.x) < 1.6) c.p.y = 1.95; // into the bin
        c.r += dt * 12;
      } else c.p.y = -20;
      mtx.compose(c.p, q.setFromEuler(e.set(c.r, c.r * 0.6, 0)), one);
      cascade.setMatrixAt(i, mtx);
    }
    cascade.instanceMatrix.needsUpdate = true;
  });

  // sparks
  const SPARKS = 260;
  const sparkPos = new Float32Array(SPARKS * 3).fill(-20);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: new THREE.Color(3.2, 2, 0.6), size: 0.1, transparent: true, depthWrite: false, toneMapped: false }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkHead = 0;
  const burst = (x: number, y: number, z: number, n: number, speed = 5) => {
    for (let k = 0; k < n; k++) {
      const i = (sparkHead = (sparkHead + 1) % SPARKS);
      sparkPos.set([x, y, z], i * 3);
      const a = Math.random() * Math.PI * 2,
        u = Math.random();
      sparkVel.set([Math.cos(a) * (1 + u * speed), 1 + Math.random() * speed * 0.8, Math.sin(a) * (1 + u * speed)], i * 3);
      sparkLife[i] = 0.4 + Math.random() * 0.8;
    }
  };
  ticks.push((dt) => {
    for (let i = 0; i < SPARKS; i++) {
      if (sparkLife[i] <= 0) {
        sparkPos[i * 3 + 1] = -20;
        continue;
      }
      sparkLife[i] -= dt;
      sparkVel[i * 3 + 1] -= 9.8 * dt;
      for (let k = 0; k < 3; k++) sparkPos[i * 3 + k] += sparkVel[i * 3 + k] * dt;
      if (sparkPos[i * 3 + 1] < 0.02) {
        sparkPos[i * 3 + 1] = 0.02;
        sparkVel[i * 3 + 1] *= -0.3;
      }
    }
    sparkGeo.attributes.position.needsUpdate = true;
  });

  // ---- THE CONVEYOR: press → right → down the hall → into the vault ----------------------------------
  const path = new THREE.CurvePath<THREE.Vector3>();
  const pts: [number, number][] = [
    [P.x, P.z + 4.2],
    [P.x + 7, P.z + 4.2],
    [P.x + 7, -33],
    [P.x + 1.5, -33],
    [P.x + 1.5, -41.6],
  ];
  for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(pts[i][0], 1.25, pts[i][1]), new THREE.Vector3(pts[i + 1][0], 1.25, pts[i + 1][1])));
  const beltTex = canvasTex(64, 256);
  {
    const g = beltTex.g;
    g.fillStyle = "#111215";
    g.fillRect(0, 0, 64, 256);
    g.fillStyle = "#25272c";
    for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 64, 3);
  }
  beltTex.t.wrapS = beltTex.t.wrapT = THREE.RepeatWrapping;
  const belts: THREE.Texture[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i],
      [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const along = x0 === x1;
    box(scene, along ? 1.3 : len + 1.3, 1.1, along ? len + 1.3 : 1.3, darkSteel, (x0 + x1) / 2, 0, (z0 + z1) / 2);
    const t = beltTex.t.clone();
    t.needsUpdate = true;
    t.repeat.set(1, len / 1.2);
    belts.push(t);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1.1, len), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
    top.rotation.x = -Math.PI / 2;
    if (!along) top.rotation.z = Math.PI / 2;
    top.position.set((x0 + x1) / 2, 1.11, (z0 + z1) / 2);
    scene.add(top);
    for (const s of [-0.6, 0.6]) box(scene, along ? 0.06 : len, 0.06, along ? len : 0.06, neon(TEAL, 1.3), (x0 + x1) / 2 + (along ? s : 0), 1.12, (z0 + z1) / 2 + (along ? 0 : s));
    rects.push([Math.min(x0, x1) - 0.7, Math.min(z0, z1) - 0.7, Math.max(x0, x1) + 0.7, Math.max(z0, z1) + 0.7]);
  }
  ticks.push((dt) => {
    for (const t of belts) t.offset.y -= dt * 0.6;
  });
  const beltLen = path.getLength();
  const belt: { m: THREE.Mesh; s: number }[] = [];
  let beltQueue: { name: string | null; asset_id: string; finalized?: boolean }[] = [];
  let beltNext = 0;

  // two robot arms by the belt, turning coins over
  const arms: { yaw: THREE.Group; up: THREE.Group; fore: THREE.Group; phase: number }[] = [];
  for (const [x, z, ph] of [
    [P.x + 9, -18, 0],
    [P.x + 9, -27, 2.1],
  ] as const) {
    const base = new THREE.Group();
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.6, 20), std("#e8a020", 0.4, 0.5));
    foot.position.y = 0.3;
    base.add(foot);
    const yaw = new THREE.Group();
    yaw.position.y = 0.6;
    base.add(yaw);
    const up = new THREE.Group();
    up.position.y = 0.4;
    yaw.add(up);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.2, 0.35), std("#e8a020", 0.4, 0.5));
    upper.position.y = 1.1;
    up.add(upper);
    const fore = new THREE.Group();
    fore.position.y = 2.2;
    up.add(fore);
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.8, 0.28), std("#e8a020", 0.4, 0.5));
    forearm.position.y = 0.9;
    fore.add(forearm);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.16), darkSteel);
    grip.position.y = 1.85;
    fore.add(grip);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), neon(TEAL, 3));
    led.position.set(0, 1.95, 0.1);
    fore.add(led);
    base.position.set(x, 0, z);
    scene.add(base);
    rects.push([x - 0.9, z - 0.9, x + 0.9, z + 0.9]);
    arms.push({ yaw, up, fore, phase: ph });
  }
  ticks.push((_dt, t) => {
    for (const a of arms) {
      const s = t * 0.7 + a.phase;
      a.yaw.rotation.y = Math.PI / 2 + Math.sin(s) * 0.7;
      a.up.rotation.z = 0.5 + Math.sin(s * 1.3) * 0.25;
      a.fore.rotation.z = -1.4 + Math.sin(s * 1.3 + 1) * 0.35;
    }
  });

  // ---- the overhead chain: buckets of coins round the hall at 12 m -----------------------------------
  const chain = new THREE.CurvePath<THREE.Vector3>();
  const loop: [number, number][] = [
    [-11, -38],
    [11, -38],
    [11, 0],
    [-11, 0],
    [-11, -38],
  ];
  for (let i = 0; i < loop.length - 1; i++) chain.add(new THREE.LineCurve3(new THREE.Vector3(loop[i][0], 12.6, loop[i][1]), new THREE.Vector3(loop[i + 1][0], 12.6, loop[i + 1][1])));
  for (let i = 0; i < loop.length - 1; i++) {
    const [x0, z0] = loop[i],
      [x1, z1] = loop[i + 1];
    box(scene, Math.abs(x1 - x0) + 0.2, 0.2, Math.abs(z1 - z0) + 0.2, darkSteel, (x0 + x1) / 2, 12.9, (z0 + z1) / 2);
  }
  const chainLen = chain.getLength();
  const bucketGeo = new THREE.CylinderGeometry(0.42, 0.32, 0.55, 12, 1, true);
  const buckets = new THREE.InstancedMesh(bucketGeo, std("#6a6e76", 0.4, 0.8), BUCKETS);
  const bucketCoins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 12), gold, BUCKETS);
  buckets.frustumCulled = bucketCoins.frustumCulled = false;
  scene.add(buckets, bucketCoins);
  ticks.push((_dt, t) => {
    for (let i = 0; i < BUCKETS; i++) {
      const u = ((i / BUCKETS + t * 0.012) % 1 + 1) % 1;
      const p = chain.getPointAt(u);
      mtx.compose(v.set(p.x, p.y - 0.9 + Math.sin(t * 2 + i) * 0.03, p.z), q.identity(), one);
      buckets.setMatrixAt(i, mtx);
      mtx.compose(v.set(p.x, p.y - 0.7, p.z), q.identity(), one);
      bucketCoins.setMatrixAt(i, mtx);
    }
    buckets.instanceMatrix.needsUpdate = true;
    bucketCoins.instanceMatrix.needsUpdate = true;
  });
  void chainLen;

  // ---- THE VAULT (back wall): an open round door, a mountain of gold behind ---------------------------
  const vault = new THREE.Group();
  const door = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.9, 56), std("#6c717a", 0.28, 0.92));
  door.rotation.set(0, -0.9, Math.PI / 2);
  door.position.set(6.2, 4, 2);
  vault.add(door);
  for (let k = 0; k < 8; k++) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 10), brass);
    const a = (k / 8) * Math.PI * 2;
    bolt.position.set(6.2 + Math.cos(a) * 0.8, 4 + Math.sin(a) * 3.0, 2 + Math.cos(a) * 1.1);
    vault.add(bolt);
  }
  const frame = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.42, 16, 56), gunmetal);
  frame.position.set(1.5, 4, 0.2);
  vault.add(frame);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(3.45, 56), new THREE.MeshBasicMaterial({ color: "#050403" }));
  hole.position.set(1.5, 4, 0.15);
  vault.add(hole);
  // the gold: a heap of coins and ingot stacks, glowing
  const HEAP = 900;
  const heap = new THREE.InstancedMesh(goldCoinGeo, gold, HEAP);
  for (let i = 0; i < HEAP; i++) {
    const r = Math.sqrt(Math.random()) * 2.9,
      a = Math.random() * Math.PI * 2;
    const y = 0.7 + (2.9 - r) * 0.9 + Math.random() * 0.15;
    mtx.compose(v.set(1.5 + Math.cos(a) * r, y, 0.6 + Math.sin(a) * r * 0.25), q.setFromEuler(e.set(Math.random(), Math.random() * 6, Math.random())), one.clone().multiplyScalar(1.6));
    heap.setMatrixAt(i, mtx);
  }
  vault.add(heap);
  const barGeo = new THREE.BoxGeometry(0.5, 0.18, 0.26);
  const bars = new THREE.InstancedMesh(barGeo, gold, 48);
  for (let i = 0; i < 48; i++) {
    const row = Math.floor(i / 8),
      col = i % 8;
    mtx.makeTranslation(1.5 - 2.1 + col * 0.52 + (row % 2) * 0.26, 0.7 + row * 0.19, 0.4);
    bars.setMatrixAt(i, mtx);
  }
  vault.add(bars);
  const vaultGlow = new THREE.PointLight(GOLD, 9, 9, 1.6);
  vaultGlow.position.set(1.5, 3, 1.6);
  vault.add(vaultGlow);
  vault.position.set(0, 0, H.z0 + 0.3);
  scene.add(vault);
  rects.push([-3, H.z0, 9, H.z0 + 3.2]);
  pickable(vault, { eyebrow: "ZSA MINT · THE VAULT", title: "Where the coins go", body: "<p>Who holds a shielded asset, and how much moves, stays private: only issuance is public. The conveyor carries every token struck on the chain in here.</p>" }, "THE VAULT");

  // ---- the register (left wall) and the departures board (right wall), between the catwalks ----------
  const reg = canvasTex(2048, 1024);
  const register = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), new THREE.MeshBasicMaterial({ map: reg.t, toneMapped: false, color: new THREE.Color(0.9, 0.9, 0.9) }));
  register.position.set(H.x0 + 0.17, 9, -22);
  register.rotation.y = Math.PI / 2;
  scene.add(register);
  let regAssets: ZsaAsset[] = [];
  let tipH: number | null = null;
  pickable(register, { eyebrow: "ZSA MINT", title: "The register" }, "THE REGISTER · a box per token");
  function drawRegister() {
    const { g, c, t } = reg;
    g.fillStyle = "#0d0c0a";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = GOLD;
    g.font = `800 52px ${MONO}`;
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.fillText("THE REGISTER · EVERY TOKEN ON THE ZSA TESTNET", 48, 60);
    g.textAlign = "right";
    g.fillStyle = "#bfa36a";
    g.font = `500 34px ${MONO}`;
    g.fillText(`${regAssets.length} tokens${tipH ? ` · block #${tipH.toLocaleString("en-US")}` : ""}`, c.width - 48, 60);
    const [cols, rows] = BOXES;
    const bw = (c.width - 96) / cols,
      bh = (c.height - 130) / rows;
    for (let i = 0; i < cols * rows; i++) {
      const x = 48 + (i % cols) * bw,
        y = 110 + Math.floor(i / cols) * bh;
      const a = regAssets[i];
      g.fillStyle = "#2a2318";
      g.fillRect(x + 6, y + 6, bw - 12, bh - 12);
      g.strokeStyle = "#8a6a2a";
      g.lineWidth = 4;
      g.strokeRect(x + 8, y + 8, bw - 16, bh - 16);
      g.fillStyle = "#14110c";
      g.beginPath();
      g.arc(x + bw - 40, y + bh / 2, 9, 0, Math.PI * 2);
      g.fill();
      if (!a) continue;
      const col = assetColor(a.asset_id);
      g.fillStyle = col;
      g.fillRect(x + 8, y + 8, 10, bh - 16);
      g.textAlign = "left";
      g.fillStyle = "#f4ead6";
      g.font = `700 36px ${SANS}`;
      g.fillText(assetName(a).slice(0, 16), x + 34, y + 50, bw - 90);
      g.fillStyle = col;
      g.font = `800 30px ${MONO}`;
      g.fillText(`${units(a.issued)} ${tag(a)}`, x + 34, y + 100, bw - 90);
      g.fillStyle = a.finalized ? GOLD : "#8fa";
      g.font = `600 22px ${MONO}`;
      g.fillText(a.finalized ? "DIE BROKEN · fixed supply" : "die intact · open supply", x + 34, y + 140, bw - 90);
    }
    if (!regAssets.length) {
      g.textAlign = "center";
      g.fillStyle = "#8a7a5a";
      g.font = `500 40px ${MONO}`;
      g.fillText(tipH ? "no token yet: strike the first" : "connecting to the ZSA testnet…", c.width / 2, c.height / 2);
    }
    t.needsUpdate = true;
  }
  const dep = canvasTex(2048, 1024);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), new THREE.MeshBasicMaterial({ map: dep.t, toneMapped: false, color: new THREE.Color(0.9, 0.9, 0.9) }));
  board.position.set(H.x1 - 0.17, 9, -22);
  board.rotation.y = -Math.PI / 2;
  scene.add(board);
  let feed: ZsaEvent[] = [];
  pickable(board, { eyebrow: "ZSA MINT", title: "Live on the ZSA testnet" }, "DEPARTURES · live");
  function drawBoard() {
    const { g, c, t } = dep;
    g.fillStyle = "#0a0a0a";
    g.fillRect(0, 0, c.width, c.height);
    g.textBaseline = "middle";
    g.fillStyle = AMBER;
    g.font = `800 52px ${MONO}`;
    g.textAlign = "left";
    g.fillText("DEPARTURES · 出発", 48, 60);
    g.textAlign = "right";
    g.fillStyle = "#a07a3a";
    g.font = `500 30px ${MONO}`;
    g.fillText("ZSA test network · no real value", c.width - 48, 60);
    const cx = [48, 330, 700, 1620];
    g.fillStyle = "#7a5a2a";
    g.font = `700 26px ${MONO}`;
    g.textAlign = "left";
    ["BLOCK", "", "TOKEN", "AMOUNT"].forEach((h, i) => g.fillText(h, cx[i], 120));
    feed.slice(0, 11).forEach((ev, i) => {
      const y = 180 + i * 76;
      g.fillStyle = "#151310";
      g.fillRect(40, y - 32, c.width - 80, 64);
      const [label, col] = KIND[ev.kind];
      g.textAlign = "left";
      g.fillStyle = AMBER;
      g.font = `700 36px ${MONO}`;
      g.fillText(`#${ev.height}`, cx[0], y);
      g.fillStyle = col;
      g.font = `800 32px ${MONO}`;
      g.fillText(label, cx[1], y);
      g.fillStyle = "#f4ead6";
      g.font = `600 36px ${SANS}`;
      g.fillText(ev.name ?? (ev.asset_id ? `Token ${ev.asset_id.slice(0, 6)}` : "a shielded asset"), cx[2], y, 880);
      g.fillStyle = "#c9a56a";
      g.font = `600 32px ${MONO}`;
      g.fillText(ev.amount != null ? units(ev.amount) : ev.kind === "transfer" ? "private" : "", cx[3], y, 380);
    });
    t.needsUpdate = true;
  }

  // ---- THE MELT: a crucible that tips and pours into ingot moulds (burn) ------------------------------
  const melt = new THREE.Group();
  box(melt, 4, 1.6, 4, darkSteel, 0, 0, 0);
  const pivot = new THREE.Group();
  pivot.position.set(0, 4.2, 0);
  melt.add(pivot);
  const crucible = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 0.95, 1.5, 32, 1, true), std("#3a3430", 0.6, 0.5));
  pivot.add(crucible);
  const molten = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.8, 1.5, 0.35), toneMapped: false }));
  molten.rotation.x = -Math.PI / 2;
  molten.position.y = 0.55;
  pivot.add(molten);
  for (const s of [-1, 1]) box(melt, 0.3, 4.6, 0.3, gunmetal, s * 1.6, 1.6, 0);
  // the pour: a glowing stream from the lip down to the moulds
  const pourTex = shaftTex("rgba(255,170,60,1)");
  pourTex.wrapT = THREE.RepeatWrapping;
  const pour = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 3, 10, 1, true), new THREE.MeshBasicMaterial({ map: pourTex, color: new THREE.Color(3.4, 1.6, 0.5), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  pour.position.set(1.7, 2.6, 0);
  melt.add(pour);
  // the moulds on a short line: they glow and cool to gold
  const moulds: THREE.Mesh[] = [];
  for (let k = 0; k < 6; k++) {
    const mm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: "#c08a30", metalness: 1, roughness: 0.3, emissive: new THREE.Color("#ff6a10"), emissiveIntensity: 0 }));
    mm.position.set(1.7 + k * 0.7, 1.15, 0);
    melt.add(mm);
    moulds.push(mm);
  }
  box(melt, 4.6, 1.05, 0.8, darkSteel, 3.4, 0, 0);
  const meltLight = new THREE.PointLight("#ff6a20", 10, 12, 1.6);
  meltLight.position.set(0.8, 4, 1.2);
  melt.add(meltLight);
  melt.position.set(-13, 0, -36);
  scene.add(melt);
  rects.push([-15.2, -38.2, -6.8, -33.8]);
  let pourT = 0;
  ticks.push((dt, t) => {
    pourT += dt;
    const cyc = pourT % 14;
    const tip = cyc < 2 ? cyc / 2 : cyc < 6 ? 1 : cyc < 8 ? 1 - (cyc - 6) / 2 : 0;
    pivot.rotation.z = -tip * 0.75;
    pour.visible = cyc > 1.6 && cyc < 6.4;
    pourTex.offset.y -= dt * 2.5;
    const fill = Math.floor(Math.max(0, cyc - 1.6) / 0.75);
    moulds.forEach((mm, k) => {
      const mat = mm.material as THREE.MeshStandardMaterial;
      const hot = k <= fill && cyc < 12 ? 1 - Math.max(0, cyc - 1.6 - k * 0.75) / 9 : 0;
      mat.emissiveIntensity = Math.max(0, hot) * 3;
    });
    meltLight.intensity = 8 + Math.sin(t * 9) * 1 + tip * 6;
    if (pour.visible && Math.random() < 0.4) burst(-13 + 1.7, 1.3, -36, 3, 2);
  });
  pickable(melt, { eyebrow: "ZSA MINT · ZIP 226", title: "The melt", panel: "zsalab", zsa: "burn" }, "THE MELT · burn your coins");

  // ---- THE DIE ROOM (seal): a die under a drop hammer ------------------------------------------------
  const dieRoom = new THREE.Group();
  box(dieRoom, 2, 1.3, 2, gunmetal, 0, 0, 0);
  const masterDie = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 32), brass);
  masterDie.position.y = 1.5;
  dieRoom.add(masterDie);
  for (const s of [-1, 1]) box(dieRoom, 0.25, 6, 0.25, gunmetal, s * 1.1, 0, 0);
  box(dieRoom, 2.6, 0.4, 0.5, darkSteel, 0, 6, 0);
  const hammer = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.0), darkSteel);
  hammer.position.y = 4.6;
  dieRoom.add(hammer);
  const dieLight = new THREE.PointLight(GOLD, 5, 8, 1.6);
  dieLight.position.set(0, 3, 1.6);
  dieRoom.add(dieLight);
  dieRoom.position.set(-5.5, 0, -38);
  scene.add(dieRoom);
  rects.push([-6.7, -39.2, -4.3, -36.8]);
  pickable(dieRoom, { eyebrow: "ZSA MINT · ZIP 227", title: "Break the die", panel: "zsalab", zsa: "finalize" }, "BREAK THE DIE · seal a supply for good");
  ticks.push((_dt, t) => {
    const c = t % 9;
    hammer.position.y = c < 7 ? 2.2 + Math.min(1, c / 6) * 2.4 : 4.6 - ((c - 7) / 0.25) * 2.4 > 2.2 ? 4.6 - ((c - 7) / 0.25) * 2.4 : 2.2;
    if (c > 7.25 && c < 7.3) burst(-5.5, 1.8, -38, 30, 4);
  });

  const neonSign = (text: string, sub: string, color: string, w: number) => {
    const { g, c, t } = canvasTex(1024, 256);
    g.fillStyle = "#08080b";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = color;
    g.lineWidth = 8;
    g.strokeRect(8, 8, c.width - 16, c.height - 16);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = color;
    g.font = `900 96px ${MONO}`;
    g.fillText(text, c.width / 2, 108, c.width - 60);
    g.fillStyle = "#e8e8f0";
    g.font = `600 40px ${SANS}`;
    g.fillText(sub, c.width / 2, 200, c.width - 60);
    t.needsUpdate = true;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(1.1, 1.1, 1.1) }));
  };
  const meltSign = neonSign("THE MELT", "burn: gone for good · ZIP 226", "#ff7a3a", 5);
  meltSign.position.set(-11, 8, H.z0 + 0.2);
  scene.add(meltSign);
  const dieSign = neonSign("THE DIE", "break it: no more can be struck", GOLD, 4);
  dieSign.position.set(-5.5, 8, H.z0 + 0.2);
  scene.add(dieSign);

  // ---- the control desk: screens with the chain live -------------------------------------------------
  const deskScreen = canvasTex(1024, 384);
  const desk = new THREE.Group();
  box(desk, 4.2, 1.0, 1.2, std("#1c1e23", 0.4, 0.6), 0, 0, 0);
  const deskMon = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.42), new THREE.MeshBasicMaterial({ map: deskScreen.t, toneMapped: false, color: new THREE.Color(0.9, 0.9, 0.9) }));
  deskMon.position.set(0, 1.9, -0.3);
  desk.add(deskMon);
  box(desk, 3.9, 1.5, 0.08, darkSteel, 0, 1.15, -0.36);
  desk.position.set(-10, 0, -16);
  desk.rotation.y = Math.PI / 2.4;
  scene.add(desk);
  rects.push([-12.2, -18, -7.8, -14]);
  function drawDesk() {
    const { g, c, t } = deskScreen;
    g.fillStyle = "#04100c";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = TEAL;
    g.font = `800 40px ${MONO}`;
    g.textAlign = "left";
    g.textBaseline = "top";
    g.fillText("MINT CONTROL · ZSA TESTNET", 24, 20);
    g.fillStyle = "#9fe";
    g.font = `500 32px ${MONO}`;
    g.fillText(`chain tip   #${tipH?.toLocaleString("en-US") ?? "…"}`, 24, 100);
    g.fillText(`tokens      ${regAssets.length}`, 24, 150);
    g.fillText(`struck      ${feed.filter((x) => x.kind === "issue").length} (last 40 events)`, 24, 200);
    g.fillText(`sealed      ${regAssets.filter((x) => x.finalized).length}`, 24, 250);
    g.fillStyle = MAGENTA;
    g.fillText("press  ● ready", 24, 310);
    t.needsUpdate = true;
  }

  // ---- the front: the STRIKE counter (right of the door) and the EXCHANGE (left) --------------------
  const counter = (x: number, title: string, sub: string, color: string, info: PickInfo, hover: string) => {
    const g = new THREE.Group();
    box(g, 5, 1.15, 1.1, std("#1c1e23", 0.4, 0.6), 0, 0, 0);
    box(g, 5, 0.06, 1.2, brass, 0, 1.15, 0);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(5, 0.06, 0.02), neon(color, 2.4));
    strip.position.set(0, 0.28, 0.56);
    g.add(strip);
    box(g, 0.1, 2.6, 0.1, gunmetal, -2.4, 1.15, -0.3);
    box(g, 0.1, 2.6, 0.1, gunmetal, 2.4, 1.15, -0.3);
    const s = neonSign(title, sub, color, 4.8);
    s.position.set(0, 3.4, -0.3);
    g.add(s);
    g.position.set(x, 0, 3);
    scene.add(g);
    rects.push([x - 2.6, 2.4, x + 2.6, 3.6]);
    pickable(g, info, hover);
  };
  counter(8, "STRIKE", "your own coin · click", TEAL, { eyebrow: "ZSA MINT", title: "Strike your coin", panel: "zsalab", zsa: "mint" }, "STRIKE · make your own shielded asset");
  counter(-8, "EXCHANGE", "swap coins with a player", MAGENTA, { eyebrow: "ZSA MINT", title: "The exchange", panel: "zsalab", zsa: "exchange" }, "EXCHANGE · swap with another player");

  // ---- steam vents by the press ----------------------------------------------------------------------
  const steamM = new THREE.MeshBasicMaterial({ color: "#c8d0d8", transparent: true, opacity: 0, depthWrite: false });
  const puffs = [-1, 1].map((s) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), steamM.clone());
    m.position.set(P.x + s * 5, 1, P.z + 2);
    scene.add(m);
    return m;
  });
  let steamT = 9;
  ticks.push((dt) => {
    steamT += dt;
    const k = Math.min(1, steamT / 3);
    for (const p of puffs) {
      p.scale.setScalar(0.4 + k * 2.4);
      p.position.y = 1 + k * 4.5;
      (p.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.4;
    }
  });

  // ---- the workers: zkSNARKs everywhere (you can talk to them) ---------------------------------------
  const workers: Snark[] = [];
  const spawn = async (id: number, role: string, at: [number, number], o: { y?: number; face?: [number, number]; cap?: boolean; carry?: "bag" | "book" | "coffee"; loop?: [number, number][]; speed?: number } = {}) => {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      s.root.position.set(at[0], o.y ?? 0, at[1]);
      if (o.face) s.faceDir = new THREE.Vector3(o.face[0] - at[0], 0, o.face[1] - at[1]).normalize();
      if (o.cap) s.setCap();
      if (o.carry) {
        s.carry = o.carry;
        s.redrawHold();
      }
      scene.add(s.root);
      workers.push(s);
      if (o.loop) {
        const loopPts = o.loop;
        void (async () => {
          for (let i = 0; ; i++) {
            const [x, z] = loopPts[i % loopPts.length];
            await s.walk([new THREE.Vector3(x, o.y ?? 0, z)], o.speed ?? 1.1);
            await new Promise((r) => setTimeout(r, 1500 + Math.random() * 3000));
          }
        })();
      }
    } catch {}
  };
  const rail = H.x1 - 1.4;
  void Promise.all([
    spawn(777, "Press operator", [-5.2, P.z + 3], { face: [P.x, P.z] }),
    spawn(4207, "Belt inspector", [9.2, -22], { loop: [[9.2, -22], [9.2, -30], [9.2, -12]], speed: 0.8 }),
    spawn(7781, "Vault guard", [-4.2, -40.5], { face: [0, 0], cap: true }),
    spawn(8888, "Vault guard", [10, -40.5], { face: [0, 0], cap: true }),
    spawn(1337, "Smelter", [-9.2, -33.5], { face: [-13, -36] }),
    spawn(3141, "Ingot carrier", [-6, -30], { carry: "bag", loop: [[-6, -30], [2, -38], [-6, -22]], speed: 0.9 }),
    spawn(2400, "Ingot carrier", [4, -26], { carry: "bag", loop: [[4, -26], [3, -39], [4, -6]], speed: 1 }),
    spawn(5566, "Exchange clerk", [-8, 1.7], { face: [-8, 10] }),
    spawn(2024, "Mint clerk", [8, 1.7], { face: [8, 10] }),
    spawn(6100, "Control engineer", [-11.4, -15], { face: [-10, -16], carry: "coffee" }),
    spawn(4810, "Catwalk patrol", [-rail, -30], { y: 6.4, loop: [[-rail, -30], [-rail, 2], [-rail, -38]], speed: 0.9 }),
    spawn(9321, "Catwalk patrol", [rail, -8], { y: 6.4, loop: [[rail, -8], [rail, -38], [rail, 2]], speed: 0.9 }),
    spawn(3777, "Chain mechanic", [rail, -20], { y: 11.4, face: [0, -20] }),
    // visitors queueing at the STRIKE counter
    spawn(1203, "Visitor", [8, 5.2], { face: [8, 3] }),
    spawn(6644, "Visitor", [8.3, 6.4], { face: [8, 3] }),
    spawn(2981, "Visitor", [7.7, 7.6], { face: [8, 3] }),
    spawn(8402, "Visitor", [8.2, 8.8], { face: [8, 3] }),
  ]);

  // ---- the strike: wind-up, the blow, sparks, flare, cascade; the coin onto the belt ----------------
  let strikeT = -1;
  let strikeCoin: THREE.Mesh | null = null;
  const strikes: { name: string | null; asset_id: string; mine?: boolean }[] = [];
  const queueStrike = (a: { name: string | null; asset_id: string; mine?: boolean }) => {
    if (strikes.length < 6) strikes.push(a);
  };
  // the visitor's own mint: a cinematic (the panel announces it as soon as it's broadcast)
  window.addEventListener("zsalab:minted", (ev) => {
    const d = (ev as CustomEvent<{ name: string; asset_id: string }>).detail;
    if (d?.asset_id) strikes.unshift({ name: d.name, asset_id: d.asset_id, mine: true });
  });
  let cine: { t: number; from: THREE.Vector3; fromQ: THREE.Quaternion; coin: THREE.Mesh } | null = null;
  ticks.push((dt) => {
    if (strikeT < 0 && strikes.length) {
      const a = strikes.shift()!;
      strikeCoin = makeCoin(a);
      strikeCoin.rotation.x = -Math.PI / 2;
      strikeCoin.position.set(P.x, 3.0, P.z);
      strikeCoin.scale.setScalar(2.4);
      scene.add(strikeCoin);
      strikeT = 0;
      beltQueue.unshift(a);
      if (a.mine) cine = { t: 0, from: camPos.clone(), fromQ: new THREE.Quaternion(), coin: strikeCoin };
    }
    if (strikeT < 0) {
      ram.position.y = RAM_UP + Math.sin(performance.now() / 700) * 0.06;
      return;
    }
    strikeT += dt;
    const k = strikeT < 0.8 ? 0 : strikeT < 1.05 ? (strikeT - 0.8) / 0.25 : strikeT < 1.5 ? 1 : Math.max(0, 1 - (strikeT - 1.5) / 1.6);
    ram.position.y = RAM_UP - (RAM_UP - RAM_DOWN) * k;
    if (strikeT >= 1.05 && strikeT - dt < 1.05) {
      burst(P.x, 3.2, P.z, 180, 6);
      spill();
      steamT = 0;
      pressLight.intensity = 60;
      flare = 1;
    }
    pressLight.intensity = Math.max(6, pressLight.intensity - dt * 60);
    if (strikeCoin && strikeT > 2.2) {
      // the struck coin rises off the anvil, turns to face the hall, then drops to the belt
      const u = Math.min(1, (strikeT - 2.2) / 1.4);
      const w = Math.min(1, Math.max(0, (strikeT - 3.6) / 0.8));
      strikeCoin.position.set(P.x, 3.0 + u * 1.6 - w * 3.3, P.z + u * 2.2 + w * 2);
      strikeCoin.rotation.set(-Math.PI / 2 + u * (Math.PI / 2), 0, 0);
      strikeCoin.scale.setScalar(2.4 - w * 1.4);
      if (w >= 1) {
        scene.remove(strikeCoin);
        strikeCoin.userData.dispose?.();
        strikeCoin = null;
        beltNext = 0;
      }
    }
    if (strikeT > 4.6) strikeT = -1;
  });
  // the flare: every neon in the hall jumps with the blow, then settles
  ticks.push((dt) => {
    flare = Math.max(0, flare - dt * 0.9);
    for (const n of neons) n.m.color.copy(n.base).multiplyScalar(1 + flare * 1.8);
  });

  // coins on the belt: the latest tokens, one every couple of seconds
  ticks.push((dt, t) => {
    beltNext -= dt;
    if (beltNext <= 0 && belt.length < BELT_COINS && beltQueue.length) {
      const a = beltQueue.shift()!;
      beltQueue.push(a);
      const m = makeCoin(a, a.finalized);
      scene.add(m);
      belt.push({ m, s: 0 });
      beltNext = 2.6;
    }
    for (const c of [...belt]) {
      c.s += dt * 0.6;
      if (c.s >= beltLen) {
        scene.remove(c.m);
        c.m.userData.dispose?.();
        belt.splice(belt.indexOf(c), 1);
        continue;
      }
      const p = path.getPointAt(c.s / beltLen);
      // standing on its edge, face turned to whoever watches, a slight sway from the belt
      c.m.position.set(p.x, p.y + 0.42, p.z);
      c.m.rotation.set(0, Math.atan2(camPos.x - p.x, camPos.z - p.z), Math.sin(t * 2 + c.s * 3) * 0.04);
    }
  });

  // ---- data -----------------------------------------------------------------------------------------
  let fetched = -REFRESH;
  let seenIssue: string | null = null;
  async function load() {
    const [info, assets, events] = await Promise.all([Zsa.info(), Zsa.assets(), Zsa.events(40)]);
    if (info) tipH = info.tip;
    if (assets) {
      regAssets = [...assets.filter((x) => x.name), ...assets.filter((x) => !x.name)];
      if (!beltQueue.length) beltQueue = regAssets.slice(0, 30);
    }
    if (events) {
      // a new issuance on the chain since last look: the press strikes it
      const top = events.find((x) => x.kind === "issue");
      if (top && seenIssue && top.txid !== seenIssue && top.asset_id) queueStrike({ name: top.name, asset_id: top.asset_id });
      if (top) seenIssue = top.txid;
      feed = events;
    }
    drawRegister();
    drawBoard();
    drawDesk();
  }
  drawRegister();
  drawBoard();
  drawDesk();

  function assetInfo(a: ZsaAsset): PickInfo {
    return {
      eyebrow: "ZSA TESTNET · SHIELDED ASSET",
      title: assetName(a),
      tag: a.finalized ? ["DIE BROKEN", "ok"] : ["OPEN SUPPLY", "info"],
      stats: [
        ["Issued", units(a.issued)],
        ["Burned", a.burned != null ? units(a.burned) : "–"],
        ["First block", `#${a.first_height}`],
        ["Transactions", String(a.txs)],
      ],
      body: `<p class="mono">asset ${esc(short(a.asset_id))}<br>issuer ${esc(short(a.issuer))}</p><p>Who holds it and how much moves is private: only the issuance is public.</p>`,
    };
  }

  // ---- the cinematic for your own coin: dive to the press, the blow, the coin up close, then the belt
  const cinePos = new THREE.Vector3();
  const cineLook = new THREE.Vector3();
  const lookM = new THREE.Matrix4();
  const cineQ = new THREE.Quaternion();
  function runCine(dt: number, camera: THREE.PerspectiveCamera) {
    if (!cine) return;
    if (cine.t === 0) {
      cine.from.copy(camera.position);
      cine.fromQ.copy(camera.quaternion);
      window.dispatchEvent(new CustomEvent("zsalab:cine", { detail: { on: true } }));
    }
    cine.t += dt;
    const T = cine.t;
    const ease = (x: number) => x * x * (3 - 2 * x);
    if (T < 1.2) {
      // the dive: from where you stand to the front of the press
      const u = ease(T / 1.2);
      cinePos.lerpVectors(cine.from, v.set(P.x + 2.5, 3.6, P.z + 7.5), u);
      cineLook.set(P.x, 3.2, P.z);
    } else if (T < 4.2) {
      // the blow and the coin rising: close on it
      const c = cine.coin.parent ? cine.coin.position : v.set(P.x, 4.4, P.z + 2.2);
      cinePos.set(P.x + 1.2 - (T - 1.2) * 0.3, 4.2, P.z + 6.2 - (T - 1.2) * 0.4);
      cineLook.copy(c);
    } else if (T < 9) {
      // along the belt behind the first coin
      const s = Math.min(1, (T - 4.2) / 4.8);
      const p = path.getPointAt(0.05 + s * 0.6);
      cinePos.set(p.x - 3.5, p.y + 2.6, p.z + 4.5);
      cineLook.set(p.x, p.y + 0.4, p.z - 2);
    } else if (T < 10.2) {
      // back to where you were
      const u = ease((T - 9) / 1.2);
      cinePos.lerp(cine.from, u);
      camera.position.copy(cinePos);
      camera.quaternion.slerp(cine.fromQ, u);
      return;
    } else {
      camera.position.copy(cine.from);
      camera.quaternion.copy(cine.fromQ);
      cine = null;
      window.dispatchEvent(new CustomEvent("zsalab:cine", { detail: { on: false } }));
      return;
    }
    camera.position.copy(cinePos);
    lookM.lookAt(cinePos, cineLook, camera.up);
    cineQ.setFromRotationMatrix(lookM);
    camera.quaternion.slerp(cineQ, Math.min(1, dt * 6));
  }

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  return {
    key: "zsalab",
    title: "ZSA MINT",
    scene,
    floors: [{ label: "Mint", name: "ZSA MINT · strike your own shielded asset", y: 0, spawn: new THREE.Vector3(0, 0, 10), yaw: 0 }],
    colliders: () => rects,
    pickables: () => pickables,
    pick: (hit) => {
      if (hit.object === register && hit.uv) {
        const [cols, rows] = BOXES;
        const u = hit.uv.x,
          vv = 1 - hit.uv.y;
        const i = Math.floor((u * 2048 - 48) / ((2048 - 96) / cols)) + cols * Math.floor((vv * 1024 - 110) / ((1024 - 130) / rows));
        const a = regAssets[i];
        if (a && i >= 0 && i < cols * rows) return assetInfo(a);
      }
      return picks.get(hit.object) ?? null;
    },
    hover: (hit) => hovers.get(hit.object) ?? null,
    update(dt, t, camera) {
      if (t - fetched > REFRESH) {
        fetched = t;
        void load();
      }
      runCine(dt, camera);
      camera.getWorldQuaternion(camQuat);
      camera.getWorldPosition(camPos);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const f of ticks) f(dt, t);
      for (const s of workers) s.update(dt, t, camQuat, camRight);
      molten.rotation.z += dt * 0.2;
    },
  };
}
