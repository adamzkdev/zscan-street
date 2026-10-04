import * as THREE from "three";
import { Snark, loadArt } from "../scene/snark";
import { toObject } from "../scene/voxel/mesher";
import { C, E, shades, VoxelModel } from "../scene/voxel/model";
import { box, glowMat, makeScene, room, std, textPlane } from "./kit";
import type { Interior, InteriorContext, PickInfo, Rect } from "./types";

/**
 * Inside the ZSA EXCHANGE, still a building site. Zcash Shielded Assets (custom tokens living in
 * the Orchard pool, as private as ZEC) are specified in ZIP 227 (issuance), ZIP 226 (transfer and
 * burn) and ZIP 228 (asset swaps). The zkSNARKs are fitting out the shop where they will trade.
 */

const ZIPS: { n: number; title: string; line: string; body: string; color: string }[] = [
  {
    n: 227,
    title: "Issuance",
    line: "Anyone can issue an asset",
    body: "Issue a custom asset on Zcash: an issuer key defines it, and its supply is public while every holding and transfer stays shielded.",
    color: "#3ee08f",
  },
  {
    n: 226,
    title: "Transfer & burn",
    line: "As private as ZEC",
    body: "Assets move in the Orchard pool with the same privacy as ZEC, several assets in one transaction, and can be burned to take them out of supply.",
    color: "#59e3ff",
  },
  {
    n: 228,
    title: "Asset swaps",
    line: "Trade one asset for another",
    body: "Swap one shielded asset for another inside a single transaction: two parties, one atomic trade, nothing revealed to the chain.",
    color: "#f4b728",
  },
];

export function buildZsa(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0c0b0e");
  const rects: Rect[] = [];
  const pickables: THREE.Object3D[] = [];
  const boards = new Map<THREE.Object3D, (typeof ZIPS)[number]>();

  // ---- the shell: raw concrete, exposed ceiling, dust on the floor ----------------------------
  rects.push(
    ...room(scene, {
      x0: -9,
      z0: -15,
      x1: 9,
      z1: 0,
      h: 6,
      floor: new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.95 }),
      wall: std("#6e6a74", 0.95),
      ceiling: std("#2a2830", 0.95),
      door: [-1.4, 1.4],
    }),
  );
  // exposed beams and ducts
  const steel = std("#3a3844", 0.6, 0.4);
  for (let z = -13; z <= -1; z += 4) box(scene, 18, 0.35, 0.25, steel, 0, 5.6, z);
  box(scene, 0.7, 0.7, 15, std("#8a8e96", 0.4, 0.6), -5, 5.1, -7.5);
  // work lamps on stands, harsh and warm
  for (const [x, z] of [
    [-5, -4],
    [5, -10],
    [-4, -12],
  ]) {
    box(scene, 0.06, 1.8, 0.06, steel, x, 0, z);
    box(scene, 0.4, 0.3, 0.3, glowMat("#fff0c8", 3), x, 1.8, z);
    const l = new THREE.PointLight("#ffe0a8", 9, 9, 1.6);
    l.position.set(x, 2.1, z);
    scene.add(l);
  }
  // site signs
  const title = textPlane("ZSA EXCHANGE · UNDER CONSTRUCTION", { h: 0.42, color: "#f4b728", glow: true });
  title.position.set(0, 4.6, -14.85);
  scene.add(title);
  const sub = textPlane("Zcash Shielded Assets · opening soon", { h: 0.22, color: "#d0ccd8", font: '500 80px Roboto, sans-serif' });
  sub.position.set(0, 4.1, -14.85);
  scene.add(sub);

  // ---- three boards, one per ZIP, on the back wall ------------------------------------------
  ZIPS.forEach((z, i) => {
    const b = zipBoard(z);
    b.position.set(-5.4 + i * 5.4, 2.3, -14.88);
    scene.add(b);
    pickables.push(b);
    boards.set(b, z);
  });

  // ---- the swap counter, half built; the token wall, empty frames waiting for assets ----------
  const counter = toObject(counterModel());
  counter.position.set(0, 0, -8.5);
  scene.add(counter);
  rects.push([-3.4, -9.1, 3.4, -7.9]);
  const swap = textPlane("SWAP  ⇄", { h: 0.3, color: "#0d0d0d", bg: "#f4b728" });
  swap.position.set(0, 1.35, -7.88);
  scene.add(swap);
  const wall = toObject(tokenWallModel());
  wall.position.set(8.6, 0, -7);
  wall.rotation.y = -Math.PI / 2;
  scene.add(wall);
  rects.push([8.0, -11, 9, -3]);
  const tokens = tokenShelf();
  scene.add(tokens);
  const tokenLabel = textPlane("YOUR ASSET HERE", { h: 0.2, color: "#f4b728" });
  tokenLabel.position.set(8.45, 3.25, -7);
  tokenLabel.rotation.y = -Math.PI / 2;
  scene.add(tokenLabel);

  // ---- the building site: scaffolding, a mixer, planks, cones, crates ---------------------------
  const site = toObject(siteModel());
  site.position.set(-6.2, 0, -7.5);
  scene.add(site);
  rects.push([-8.9, -11.5, -4.2, -3.6]);
  for (const [x, z, r] of [
    [3.4, -3.2, 0.3],
    [-2.8, -12.6, 0.6],
    [5.6, -12.4, 0.2],
  ]) {
    const c = toObject(crateStack());
    c.position.set(x, 0, z);
    c.rotation.y = r;
    scene.add(c);
    rects.push([x - 0.6, z - 0.6, x + 0.6, z + 0.6]);
  }
  const cone = toObject(coneModel());
  for (const [x, z] of [
    [-2.4, -5.8],
    [2.6, -5.8],
    [-3.6, -6.4],
    [3.9, -6.5],
  ]) {
    const c = cone.clone();
    c.position.set(x, 0, z);
    scene.add(c);
  }
  // hazard tape around the counter
  const tape = new THREE.MeshBasicMaterial({ map: hazardTexture(), side: THREE.DoubleSide });
  for (const [x, z, w, yaw] of [
    [0, -6.6, 8, 0],
    [-4, -8.6, 4, Math.PI / 2],
    [4, -8.6, 4, Math.PI / 2],
  ] as const) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.12), tape);
    t.position.set(x, 0.9, z);
    t.rotation.y = yaw;
    scene.add(t);
  }

  // ---- welding sparks at the counter ----------------------------------------------------------
  const sparks = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(60 * 3), 3)),
    new THREE.PointsMaterial({ color: new THREE.Color(3, 2.2, 1), size: 0.05, toneMapped: false }),
  );
  scene.add(sparks);
  const spark = { at: new THREE.Vector3(2.6, 1.05, -8.4), v: Array.from({ length: 60 }, () => new THREE.Vector3()), life: new Float32Array(60) };
  const flash = new THREE.PointLight("#9fd8ff", 0, 6, 2);
  flash.position.copy(spark.at).add(new THREE.Vector3(0, 0.3, 0.5));
  scene.add(flash);

  // ---- the builders ------------------------------------------------------------------------------
  const people: Snark[] = [];
  const jobs = [
    new THREE.Vector3(2.9, 0, -7.4), // welding the counter
    new THREE.Vector3(-3.8, 0, -6.4), // the scaffold
    new THREE.Vector3(7.4, 0, -5), // the token wall
    new THREE.Vector3(7.4, 0, -9), // the token wall
    new THREE.Vector3(3.4, 0, -4.2), // the crates
    new THREE.Vector3(-2.2, 0, -11.6), // the crates at the back
    new THREE.Vector3(0, 0, -12.5), // the boards
  ];
  const builder = async (id: number, start: number, welder = false) => {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = welder ? "Welder" : "Builder";
      s.root.position.copy(jobs[start]);
      scene.add(s.root);
      people.push(s);
      if (welder) {
        s.faceDir = new THREE.Vector3(-1, 0, -0.4);
        return;
      }
      let k = start;
      for (;;) {
        // fetch something from the crates, carry it to a job, work a little
        const crate = jobs[Math.random() > 0.5 ? 4 : 5];
        await s.walk([crate], 1.1);
        s.showParcels(true);
        await new Promise((r) => setTimeout(r, 800));
        k = 1 + Math.floor(Math.random() * 3);
        await s.walk([jobs[k]], 1.0);
        s.showParcels(false);
        s.faceDir = new THREE.Vector3(k === 1 ? -1 : 1, 0, 0);
        await new Promise((r) => setTimeout(r, 2500 + Math.random() * 3000));
        s.faceDir = null;
      }
    } catch {}
  };
  void builder(1337, 0, true);
  void builder(2468, 1);
  void builder(8642, 2);
  void builder(1111, 5);

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const pos = sparks.geometry.attributes.position as THREE.BufferAttribute;
  return {
    key: "zsa",
    title: "ZSA EXCHANGE",
    scene,
    floors: [{ label: "G", name: "Building site · Zcash Shielded Assets", y: 0, spawn: new THREE.Vector3(0, 0, -1.3), yaw: 0 }],
    colliders: () => rects,
    pickables: () => pickables,
    pick: (hit): PickInfo | null => {
      let o: THREE.Object3D | null = hit.object;
      while (o && !boards.has(o)) o = o.parent;
      const z = o && boards.get(o);
      if (!z) return null;
      return {
        eyebrow: `ZIP ${z.n} · Zcash Shielded Assets`,
        title: z.title,
        tag: ["Coming to Zcash", "info"],
        body: `<div class="note">${z.body}</div><div class="note">ZIPs 226, 227 and 228 together bring user-defined assets to Zcash, shielded like ZEC. This exchange is where the city will issue and trade them, once they are live.</div>`,
        link: { href: `https://zips.z.cash/zip-0${z.n}`, label: `Read ZIP ${z.n}` },
      };
    },
    hover: (hit) => {
      let o: THREE.Object3D | null = hit.object;
      while (o && !boards.has(o)) o = o.parent;
      const z = o && boards.get(o);
      return z ? `<b>ZIP ${z.n} · ${z.title}</b><span>${z.line} · click to read</span>` : null;
    },
    update(dt, t, camera) {
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of people) s.update(dt, t, camQuat, camRight);
      // sparks in bursts, with a blue flash
      const on = Math.sin(t * 2.3) > 0.2 && Math.sin(t * 7.1) > -0.6;
      flash.intensity = on ? 4 + Math.random() * 6 : 0;
      for (let i = 0; i < 60; i++) {
        if (spark.life[i] <= 0 && on && Math.random() < 0.3) {
          spark.life[i] = 0.4 + Math.random() * 0.5;
          pos.setXYZ(i, spark.at.x, spark.at.y, spark.at.z);
          spark.v[i].set((Math.random() - 0.3) * 2, Math.random() * 1.6, (Math.random() - 0.5) * 2);
        }
        if (spark.life[i] > 0) {
          spark.life[i] -= dt;
          spark.v[i].y -= 6 * dt;
          pos.setXYZ(i, pos.getX(i) + spark.v[i].x * dt, Math.max(0.02, pos.getY(i) + spark.v[i].y * dt), pos.getZ(i) + spark.v[i].z * dt);
        } else pos.setXYZ(i, 0, -10, 0);
      }
      pos.needsUpdate = true;
    },
  };
}

/** A ZIP board: number, title, one line, in the ZIP's colour. */
function zipBoard(z: (typeof ZIPS)[number]) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0b0e";
  g.fillRect(0, 0, 512, 320);
  g.strokeStyle = z.color;
  g.lineWidth = 6;
  g.strokeRect(10, 10, 492, 300);
  g.fillStyle = z.color;
  g.font = '800 92px "JetBrains Mono", monospace';
  g.fillText(`ZIP ${z.n}`, 34, 120);
  g.fillStyle = "#f1f1f1";
  g.font = "700 46px Roboto, sans-serif";
  g.fillText(z.title, 36, 190);
  g.fillStyle = "#a3a3a3";
  g.font = "400 30px Roboto, sans-serif";
  g.fillText(z.line, 36, 240);
  g.fillStyle = z.color;
  g.font = '600 22px "JetBrains Mono", monospace';
  g.fillText("CLICK TO READ ▸", 36, 288);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.25), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  return m;
}

/** Coins standing in the token wall's frames: blank, waiting for their issuers. */
function tokenShelf() {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 20);
  const tones = ["#3ee08f", "#59e3ff", "#f4b728", "#b07bff", "#ff3e8a", "#ff9a3c"];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 6; c++) {
      if ((r * 6 + c) % 4 === 3) continue;
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: tones[(r + c) % tones.length], metalness: 0.7, roughness: 0.3, emissive: tones[(r + c) % tones.length], emissiveIntensity: 0.15 }));
      m.rotation.z = Math.PI / 2;
      m.position.set(8.45, 0.75 + r * 0.62, -8.75 + c * 0.7);
      g.add(m);
    }
  return g;
}

// ---- voxel pieces ---------------------------------------------------------------------------------

/** The swap counter: steel frame, half the cladding on, a terminal waiting to be wired. */
function counterModel() {
  const m = new VoxelModel(40, 8, 7);
  for (let x = 0; x < 40; x += 6) m.box(x, 0, 0, x + 1, 6, 7, C("#4a4656"));
  m.box(0, 6, 0, 40, 7, 7, C("#55525e"));
  m.box(0, 0, 6, 22, 6, 7, shades(["#1e1c24", "#24222a"], 1, 3));
  m.box(0, 5, 6, 22, 6, 7, E("#f4b728", 0.8));
  m.box(16, 7, 2, 20, 8, 5, C("#2a2a30"));
  m.box(17, 7, 1, 19, 8, 2, E("#59e3ff", 0.6));
  return m;
}

/** The token wall: frames for the assets, most of them still empty. */
function tokenWallModel() {
  const m = new VoxelModel(54, 20, 3);
  m.box(0, 0, 0, 54, 20, 3, C("#2a2832"));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) m.clear(2 + c * 8.6, 2 + r * 3.7, 1, 2 + c * 8.6 + 6, 2 + r * 3.7 + 3, 3);
  m.box(0, 19, 2, 54, 20, 3, E("#f4b728", 0.9));
  return m;
}

/** Scaffold tower with boards, a ladder, a cement mixer and a stack of planks. */
function siteModel() {
  const m = new VoxelModel(28, 30, 46);
  const tube = C("#9aa0aa");
  for (const x of [0, 13, 26]) for (const z of [0, 22, 44]) m.box(x, 0, z, x + 1, 30, z + 1, tube);
  for (const y of [10, 20, 29]) {
    m.box(0, y, 0, 27, y + 1, 45, shades(["#8a6a44", "#7a5c3a", "#96744c"], 1, y));
    m.box(0, y + 1, 0, 27, y + 2, 1, tube);
  }
  for (let y = 1; y < 29; y += 2) m.box(27, y, 30, 28, y + 1, 34, C("#c8a070"));
  // the mixer
  m.cylinder(8, 2, 34, 4, 6, C("#ff7a1a"));
  m.box(4, 0, 30, 12, 2, 38, C("#3a3a42"));
  // planks
  for (let k = 0; k < 4; k++) m.box(16, k, 6 + k, 26, k + 1, 9 + k, C("#a0784c"));
  return m;
}

function crateStack() {
  const m = new VoxelModel(7, 9, 7);
  m.box(0, 0, 0, 7, 4, 7, shades(["#a8804c", "#9a7444"], 1, 5));
  m.box(1, 4, 1, 6, 8, 6, shades(["#b88c54", "#a8804c"], 1, 6));
  m.box(0, 3, 0, 7, 4, 7, C("#6a4a2a"));
  m.box(2, 7, 1, 5, 8, 2, C("#f4b728"));
  return m;
}

function coneModel() {
  const m = new VoxelModel(4, 5, 4);
  m.box(0, 0, 0, 4, 1, 4, C("#1a1a1e"));
  m.box(1, 1, 1, 3, 3, 3, C("#ff7a1a"));
  m.box(1, 3, 1, 3, 4, 3, C("#ffffff"));
  m.set(1, 4, 1, C("#ff7a1a"));
  return m;
}

function concreteTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#5e5a62";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const v = Math.random();
    g.fillStyle = v > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)";
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  // dust and a chalk line
  g.fillStyle = "rgba(220,210,190,0.12)";
  for (let i = 0; i < 30; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 30, 14);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 4);
  return t;
}

function hazardTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 16;
  const g = c.getContext("2d")!;
  for (let x = -16; x < 128; x += 16) {
    g.fillStyle = "#f4b728";
    g.beginPath();
    g.moveTo(x, 16);
    g.lineTo(x + 8, 0);
    g.lineTo(x + 16, 0);
    g.lineTo(x + 8, 16);
    g.fill();
    g.fillStyle = "#111";
    g.beginPath();
    g.moveTo(x + 8, 16);
    g.lineTo(x + 16, 0);
    g.lineTo(x + 24, 0);
    g.lineTo(x + 16, 16);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(10, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
