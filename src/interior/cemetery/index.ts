import * as THREE from "three";
import { loadArt } from "../../scene/snark";
import { Zombie } from "../../scene/cemetery/zombie";
import { box, makeScene, std } from "../kit";
import type { Interior, InteriorContext, PickInfo, Rect } from "../types";

/**
 * THE CRYPT under the ZK Cemetery's mausoleum: a vaulted catacomb lined with urn niches and
 * candles (the lost wallets' little plaques), then the ossuary hall where Zcash buries what it
 * retired: seven sarcophagi with real dates (the Sprout pool, BCTV14, the 2016 ceremony's toxic
 * waste, the trusted setup, the Founders' Reward, slow start, 150-second blocks). Click one for
 * its story. Zombie zkSNARKs shuffle between them; a green light hangs over Sprout's tomb.
 */

interface Tomb {
  title: string;
  epitaph: string;
  born: string;
  died: string;
  block: string;
  body: string;
}

const TOMBS: Tomb[] = [
  {
    title: "THE SPROUT POOL",
    epitaph: "Migrated to a better place",
    born: "Oct 28, 2016",
    died: "Nov 18, 2020",
    block: "0 → 1,046,400",
    body: "Zcash's first shielded pool: JoinSplits, BCTV14 proofs, addresses starting with zc. ZIP 211, activated with Canopy, stopped any new value going in; what was left can only be moved out, to Sapling or Orchard.",
  },
  {
    title: "BCTV14",
    epitaph: "Proved itself, then retired",
    born: "2016 (Sprout)",
    died: "Oct 28, 2018",
    block: "419,200 (Sapling)",
    body: "The original zk-SNARK proving system of Sprout. Sapling replaced it with Groth16, faster and much smaller. A subtle flaw in its parameter setup, found in 2018, was closed by that same upgrade before it was ever exploited, and disclosed in 2019.",
  },
  {
    title: "THE TOXIC WASTE",
    epitaph: "Burned, as promised",
    born: "Oct 2016",
    died: "Oct 2016",
    block: "before block 0",
    body: "Sprout's public parameters came out of a six-participant ceremony a few days before launch. Each held a piece of the secret randomness, the 'toxic waste', and destroyed it: as long as one of them was honest, nobody can forge a proof.",
  },
  {
    title: "THE TRUSTED SETUP",
    epitaph: "No longer needed",
    born: "2016",
    died: "May 31, 2022",
    block: "1,687,104 (NU5)",
    body: "Sapling's parameters came from Powers of Tau and a Sapling MPC, with dozens of participants. Halo 2, activated with NU5, needs no trusted setup at all: Orchard proofs are made without one.",
  },
  {
    title: "FOUNDERS' REWARD",
    epitaph: "Its work is done",
    born: "Oct 28, 2016",
    died: "Nov 18, 2020",
    block: "1,046,400 (Canopy)",
    body: "For Zcash's first four years, 20% of every block's subsidy went to its founders, early investors and the company building it. It ended at the first halving; the Dev Fund (ZIP 1014) took its place.",
  },
  {
    title: "SLOW START",
    epitaph: "Ramped up, then let go",
    born: "Block 0",
    died: "Block 20,000",
    block: "0 → 20,000",
    body: "Mining rewards rose linearly over the first 20,000 blocks (about a month), so the earliest miners could not grab the lion's share before the network found its feet.",
  },
  {
    title: "150-SECOND BLOCKS",
    epitaph: "Halved, not forgotten",
    born: "Oct 28, 2016",
    died: "Dec 11, 2019",
    block: "653,600 (Blossom)",
    body: "Zcash first aimed for a block every two and a half minutes. Blossom halved the target to 75 seconds, and the block subsidy with it, so the issuance schedule stayed the same.",
  },
];

/** The niches' little plaques: things lost, not people. */
const LOST = ["wallet.dat · 2017", "seed on a napkin", "USB stick · laundry", "PIN tried 3 times", "phone in the lake", "password: ********", "paper wallet · rain", "keys in a screenshot", "laptop · reinstalled", "brain wallet · forgot"];

function stoneTexture(base: string, seed: number, rows = 4) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2a2622";
  g.fillRect(0, 0, 256, 256);
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const h = 256 / rows;
  const col = new THREE.Color(base);
  for (let y = 0; y < rows; y++) {
    const off = (y % 2) * 40;
    for (let x = -off; x < 256; x += 80) {
      const k = 0.82 + r() * 0.3;
      g.fillStyle = `#${col.clone().multiplyScalar(k).getHexString()}`;
      g.fillRect(x + 2, y * h + 2, 76, h - 4);
      // pits and stains
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.12})`;
        g.fillRect(x + 2 + r() * 70, y * h + 2 + r() * (h - 10), 2 + r() * 6, 2 + r() * 4);
      }
      if (r() < 0.25) {
        g.fillStyle = "rgba(70,110,60,0.25)";
        g.fillRect(x + 2, y * h + h - 12, 76, 10);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function plaque(lines: { text: string; font: string; color: string }[], w: number, h: number, bg = "#1c1814") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = Math.round((512 * h) / w);
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#8a6a2a";
  g.lineWidth = 6;
  g.strokeRect(8, 8, c.width - 16, c.height - 16);
  g.textAlign = "center";
  g.textBaseline = "middle";
  const step = c.height / (lines.length + 1);
  lines.forEach((l, i) => {
    g.font = l.font;
    let size = parseInt(l.font.match(/(\d+)px/)?.[1] ?? "40");
    while (g.measureText(l.text).width > c.width - 40 && size > 12) {
      size -= 2;
      g.font = l.font.replace(/\d+px/, `${size}px`);
    }
    g.fillStyle = "rgba(0,0,0,0.6)";
    g.fillText(l.text, c.width / 2 + 2, step * (i + 1) + 2);
    g.fillStyle = l.color;
    g.fillText(l.text, c.width / 2, step * (i + 1));
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.2 }));
}

export function buildCemetery(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#040505");
  scene.environmentIntensity = 0.08;
  scene.traverse((o) => {
    if ((o as THREE.HemisphereLight).isHemisphereLight) {
      const h = o as THREE.HemisphereLight;
      h.color.set("#9ab8a8");
      h.groundColor.set("#1a1612");
      h.intensity = 0.5;
    }
  });
  scene.fog = new THREE.Fog("#050807", 8, 34);
  const rects: Rect[] = [];
  const picks = new Map<THREE.Object3D, PickInfo>();
  const hovers = new Map<THREE.Object3D, string>();
  const pickables: THREE.Object3D[] = [];

  const wallTex = stoneTexture("#77716a", 7);
  wallTex.repeat.set(4, 1.2);
  const floorTex = stoneTexture("#5a554e", 11, 6);
  floorTex.repeat.set(3, 8);
  const wallM = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
  const floorM = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 });
  const ceilM = std("#3e3a35", 0.95);
  const stoneM = std("#86807a", 0.85);
  const darkM = std("#1a1714", 0.95);
  const lidM = std("#9a948c", 0.8);
  const goldM = std("#b08a3a", 0.35, 0.8);
  const candleM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.0, 0.8), toneMapped: false });
  const waxM = std("#e8e0cc", 0.7);
  const greenGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.6, 1.2), toneMapped: false, transparent: true, opacity: 0.85 });

  // ---- the catacomb: a long vaulted passage, niches either side ----------------------------------
  const C = { x0: -1.7, x1: 1.7, z0: -8, z1: 5.6, h: 3.1 };
  const floorA = new THREE.Mesh(new THREE.PlaneGeometry(C.x1 - C.x0, C.z1 - C.z0), floorM);
  floorA.rotation.x = -Math.PI / 2;
  floorA.position.set(0, 0, (C.z0 + C.z1) / 2);
  scene.add(floorA);
  // the barrel vault: a half cylinder
  const vaultTex = stoneTexture("#6e6862", 19, 4);
  vaultTex.repeat.set(5, 2.2);
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(C.x1, C.x1, C.z1 - C.z0, 16, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ map: vaultTex, roughness: 0.95, side: THREE.BackSide }));
  vault.rotation.x = -Math.PI / 2;
  vault.position.set(0, C.h - 0.6, (C.z0 + C.z1) / 2);
  vault.scale.set(1, 1, 0.55);
  scene.add(vault);
  for (const x of [C.x0, C.x1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, C.h - 0.6, C.z1 - C.z0), wallM);
    w.position.set(x + (x < 0 ? -0.15 : 0.15), (C.h - 0.6) / 2, (C.z0 + C.z1) / 2);
    scene.add(w);
  }
  rects.push([C.x0 - 0.3, C.z0, C.x0, C.z1], [C.x1, C.z0, C.x1 + 0.3, C.z1]);
  // the entrance wall behind you, with the steps up to the bronze door
  box(scene, C.x1 - C.x0 + 0.6, C.h, 0.3, wallM, 0, 0, C.z1 + 0.15);
  rects.push([C.x0 - 0.3, C.z1, C.x1 + 0.3, C.z1 + 0.3]);
  for (let s = 0; s < 4; s++) box(scene, 1.6, 0.18 * (s + 1), 0.3, stoneM, 0, 0, C.z1 - 0.15 - s * 0.3);
  rects.push([-0.8, C.z1 - 1.25, 0.8, C.z1]);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), new THREE.MeshStandardMaterial({ color: "#5a4a2a", roughness: 0.5, metalness: 0.6 }));
  door.position.set(0, 0.72 + 1.1, C.z1 - 0.01);
  door.rotation.y = Math.PI;
  scene.add(door);
  // ribs across the vault every two metres
  for (let z = C.z1 - 1.5; z > C.z0; z -= 2) {
    for (const x of [C.x0 + 0.12, C.x1 - 0.12]) box(scene, 0.24, C.h - 0.6, 0.3, stoneM, x, 0, z);
  }
  // niches: three rows of urns and candles, a few little plaques of things lost
  let lost = 0;
  const urnGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.28, 10);
  const urnM = [std("#6a5a4a", 0.7), std("#4a5a52", 0.6, 0.3), std("#8a7a5a", 0.6, 0.4)];
  const candleGeo = new THREE.BoxGeometry(0.05, 0.12, 0.05);
  const flameGeo = new THREE.BoxGeometry(0.03, 0.05, 0.03);
  const candles: THREE.Vector3[] = [];
  for (let z = C.z1 - 2.5; z > C.z0 + 0.8; z -= 2) {
    for (const side of [-1, 1]) {
      const x = side < 0 ? C.x0 + 0.01 : C.x1 - 0.01;
      for (let row = 0; row < 3; row++) {
        const y = 0.5 + row * 0.75;
        const niche = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 1.2), darkM);
        niche.position.set(x - side * 0.005, y + 0.25, z);
        scene.add(niche);
        const k = (Math.abs(Math.round(z * 3)) + row + (side > 0 ? 5 : 0)) % 4;
        if (k === 0) {
          const t = plaque([{ text: LOST[lost++ % LOST.length], font: "italic 44px Georgia, serif", color: "#d8c890" }], 0.7, 0.16, "#2a2420");
          t.position.set(x - side * 0.03, y + 0.1, z);
          t.rotation.y = -side * (Math.PI / 2);
          scene.add(t);
        }
        for (let u = 0; u < 3; u++) {
          if ((k + u) % 3 === 2) {
            const c = new THREE.Mesh(candleGeo, waxM);
            c.position.set(x - side * 0.15, y + 0.06, z - 0.35 + u * 0.35);
            const f = new THREE.Mesh(flameGeo, candleM);
            f.position.set(0, 0.085, 0);
            c.add(f);
            scene.add(c);
            if (row === 1) candles.push(c.position.clone().setY(y + 0.2));
          } else {
            const urn = new THREE.Mesh(urnGeo, urnM[(u + row) % 3]);
            urn.position.set(x - side * 0.17, y + 0.14, z - 0.35 + u * 0.35);
            scene.add(urn);
          }
        }
      }
    }
  }
  // the name over the hall's arch
  const sign = plaque(
    [
      { text: "HERE LIES WHAT ZCASH RETIRED", font: "700 46px Georgia, serif", color: "#d8c890" },
      { text: "they served · they were upgraded", font: "italic 34px Georgia, serif", color: "#a89a70" },
    ],
    3,
    0.5,
    "#14110e",
  );
  sign.position.set(0, C.h - 0.2, C.z0 + 0.02);
  scene.add(sign);

  // ---- the ossuary hall ----------------------------------------------------------------------------
  const H = { x0: -8, x1: 8, z0: -27, z1: C.z0, h: 5.2 };
  const floorB = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0, H.z1 - H.z0), floorM);
  floorB.rotation.x = -Math.PI / 2;
  floorB.position.set(0, 0, (H.z0 + H.z1) / 2);
  scene.add(floorB);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0, H.z1 - H.z0), ceilM);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, H.h, (H.z0 + H.z1) / 2);
  scene.add(ceil);
  const hallWall = (x0: number, z0: number, x1: number, z1: number) => {
    const w = Math.max(0.3, x1 - x0),
      d = Math.max(0.3, z1 - z0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H.h, d), wallM);
    m.position.set((x0 + x1) / 2, H.h / 2, (z0 + z1) / 2);
    scene.add(m);
    rects.push([x0, z0, x1, z1]);
  };
  hallWall(H.x0 - 0.3, H.z0, H.x0, H.z1);
  hallWall(H.x1, H.z0, H.x1 + 0.3, H.z1);
  hallWall(H.x0 - 0.3, H.z0 - 0.3, H.x1 + 0.3, H.z0);
  hallWall(H.x0 - 0.3, H.z1, C.x0 - 0.3, H.z1 + 0.3);
  hallWall(C.x1 + 0.3, H.z1, H.x1 + 0.3, H.z1 + 0.3);
  // over the passage's mouth, the wall goes on above the vault
  box(scene, C.x1 - C.x0 + 0.6, H.h - C.h, 0.3, wallM, 0, C.h, H.z1 + 0.15);
  // columns with capitals, transverse arches between them
  const colGeo = new THREE.CylinderGeometry(0.32, 0.36, H.h - 0.6, 12);
  for (const z of [-12, -17, -22]) {
    for (const x of [-3.2, 3.2]) {
      const c = new THREE.Mesh(colGeo, stoneM);
      c.position.set(x, (H.h - 0.6) / 2, z);
      scene.add(c);
      box(scene, 0.9, 0.3, 0.9, stoneM, x, 0, z);
      box(scene, 0.95, 0.35, 0.95, stoneM, x, H.h - 0.6, z);
      rects.push([x - 0.45, z - 0.45, x + 0.45, z + 0.45]);
    }
    box(scene, 6.4, 0.45, 0.5, stoneM, 0, H.h - 0.45, z);
    box(scene, H.x1 - 3.2 - 0.4, 0.45, 0.5, stoneM, (H.x1 + 3.2) / 2, H.h - 0.45, z);
    box(scene, H.x1 - 3.2 - 0.4, 0.45, 0.5, stoneM, -(H.x1 + 3.2) / 2, H.h - 0.45, z);
  }
  // wall niches in the hall too: tall arched recesses with a candle each
  for (const z of [-10.5, -14.5, -19.5, -24.5])
    for (const side of [-1, 1]) {
      const x = side < 0 ? H.x0 + 0.01 : H.x1 - 0.01;
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.2, 1.3), darkM);
      n.position.set(x, 1.6, z);
      scene.add(n);
      const c = new THREE.Mesh(candleGeo, waxM);
      c.scale.setScalar(1.6);
      c.position.set(x - side * 0.12, 0.62, z);
      const f = new THREE.Mesh(flameGeo, candleM);
      f.position.set(0, 0.085, 0);
      c.add(f);
      scene.add(c);
      box(scene, 0.25, 0.5, 1.3, stoneM, x - side * 0.12, 0, z);
      candles.push(new THREE.Vector3(x - side * 0.3, 0.9, z));
    }

  // ---- the sarcophagi: six along the walls, Sprout's on a dais at the end -------------------------
  const tomb = (t: Tomb, x: number, z: number, big: boolean) => {
    const g = new THREE.Group();
    const L = big ? 2.8 : 2.2,
      W = big ? 1.4 : 1.0,
      Ht = big ? 1.0 : 0.85;
    // big: long axis along x, facing +z; small: long axis along x, the plate facing the aisle
    const base = new THREE.Mesh(new THREE.BoxGeometry(L + 0.2, 0.18, W + 0.2), stoneM);
    base.position.y = 0.09;
    const body = new THREE.Mesh(new THREE.BoxGeometry(L, Ht, W), stoneM);
    body.position.y = 0.18 + Ht / 2;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(L + 0.12, 0.16, W + 0.12), lidM);
    lid.position.y = 0.18 + Ht + 0.08;
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(L, 0.12, W * 0.5), lidM);
    ridge.position.y = 0.18 + Ht + 0.2;
    g.add(base, body, lid, ridge);
    // a carved ⓩ medallion and a band of gold
    const band = new THREE.Mesh(new THREE.BoxGeometry(L + 0.02, 0.05, W + 0.02), goldM);
    band.position.y = 0.18 + Ht - 0.12;
    g.add(band);
    // the name plate on the front
    const p = plaque(
      [
        { text: t.title, font: "700 64px Georgia, serif", color: "#e0cc8a" },
        { text: t.epitaph, font: "italic 40px Georgia, serif", color: "#b8a878" },
        { text: `${t.born} – ${t.died}`, font: "36px Georgia, serif", color: "#9a8c6a" },
      ],
      big ? 1.9 : 1.6,
      big ? 0.62 : 0.52,
    );
    p.position.set(0, 0.18 + Ht / 2, W / 2 + 0.006);
    g.add(p);
    // candles at the corners
    for (const [cx, cz] of [
      [-L / 2 + 0.15, W / 2 - 0.12],
      [L / 2 - 0.15, W / 2 - 0.12],
    ]) {
      const c = new THREE.Mesh(candleGeo, waxM);
      c.position.set(cx, 0.18 + Ht + 0.22, cz);
      const f = new THREE.Mesh(flameGeo, candleM);
      f.position.set(0, 0.085, 0);
      c.add(f);
      g.add(c);
    }
    g.position.set(x, big ? 0.3 : 0, z);
    scene.add(g);
    const info: PickInfo = {
      eyebrow: "Here lies",
      title: t.title,
      tag: [t.epitaph, "muted"],
      stats: [
        ["Born", t.born],
        ["Retired", t.died],
        ["Block", t.block],
      ],
      body: `<p>${t.body}</p>`,
    };
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        picks.set(o, info);
        hovers.set(o, `Here lies ${t.title}`);
        pickables.push(o);
      }
    });
    return g;
  };
  const sideTombs: [number, number, number][] = [
    [-5.6, -12.2, 1],
    [5.6, -12.2, 2],
    [-5.6, -17.2, 3],
    [5.6, -17.2, 4],
    [-5.6, -22.2, 5],
    [5.6, -22.2, 6],
  ];
  for (const [x, z, i] of sideTombs) {
    const g = tomb(TOMBS[i], x, z, false);
    // their plates face the aisle
    g.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    rects.push([x - 0.65, z - 1.25, x + 0.65, z + 1.25]);
  }
  // the dais and Sprout's tomb, under a green light
  box(scene, 4.4, 0.3, 3, stoneM, 0, 0, -24.6);
  box(scene, 4.6, 0.15, 0.4, stoneM, 0, 0, -22.9);
  tomb(TOMBS[0], 0, -24.6, true);
  rects.push([-2.2, -26.1, 2.2, -23.1]);
  const sproutSign = plaque([{ text: "SPROUT  ·  2016 – 2020", font: "700 52px Georgia, serif", color: "#9adf9a" }], 2.6, 0.36, "#0e1410");
  sproutSign.position.set(0, 3.3, H.z0 + 0.02);
  scene.add(sproutSign);
  // a shaft of green light over it, motes in it
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, H.h, 20, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 0.45), transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  shaft.position.set(0, H.h / 2, -24.6);
  scene.add(shaft);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.04, 6, 32), greenGlow);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, H.h - 0.02, -24.6);
  scene.add(ring);

  // ---- light: a lantern you carry, the green over Sprout, two warm ones in the hall ---------------
  const lantern = new THREE.PointLight("#ffb46a", 2.2, 7, 1.6);
  const green = new THREE.PointLight("#5aff9a", 9, 12, 1.6);
  green.position.set(0, 3.6, -24);
  const warmA = new THREE.PointLight("#ff9c48", 5, 11, 1.6);
  warmA.position.set(-4, 2.4, -14.5);
  const warmB = new THREE.PointLight("#ff9c48", 5, 11, 1.6);
  warmB.position.set(4, 2.4, -19.5);
  const passage = new THREE.PointLight("#ff9c48", 3, 8, 1.6);
  passage.position.set(0, 2.2, -1.5);
  scene.add(lantern, green, warmA, warmB, passage);

  // ---- mist on the floor ---------------------------------------------------------------------------
  const mistM = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { t: { value: 0 } },
    vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform float t; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){ vec2 p = vW.xz * 0.45; float m = n(p + vec2(t*0.12, t*0.05)) * 0.6 + n(p*2.1 - vec2(t*0.07, -t*0.09)) * 0.4; m = smoothstep(0.35, 0.9, m); gl_FragColor = vec4(0.62, 0.82, 0.7, m * 0.22); }`,
  });
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0, H.z1 - H.z0 + (C.z1 - C.z0)).rotateX(-Math.PI / 2), mistM);
  mist.position.set(0, 0.25, (H.z0 + C.z1) / 2);
  mist.renderOrder = 2;
  scene.add(mist);

  // ---- the residents: zombie zkSNARKs shuffling between the tombs ----------------------------------
  const zombies: Zombie[] = [];
  const route: THREE.Vector3[] = [new THREE.Vector3(0, 0, -10), new THREE.Vector3(-1.6, 0, -14.6), new THREE.Vector3(1.6, 0, -19.6), new THREE.Vector3(-1.2, 0, -21.5), new THREE.Vector3(0.8, 0, -15), new THREE.Vector3(1.4, 0, -11)];
  const LINES = ["Braaains... I mean, private keys...", "Sprout... I miss... Sprout...", "Back in my day... blocks were 150 seconds...", "Who... trusted... the setup?", "Shhh... the toxic waste... is sleeping...", "Halo... 2... uuurgh...", "Did you... migrate... your funds?"];
  void (async () => {
    for (const [i, id] of [1666, 2016, 4444].entries()) {
      try {
        const art = await loadArt(id);
        const z = new Zombie(id, art.texture.image as HTMLCanvasElement, art.skin);
        z.state = "out";
        z.speed = 0.35;
        z.setNight(true);
        z.root.visible = true;
        z.root.position.copy(route[(i * 2) % route.length]);
        z.sayCool = 3 + i * 4;
        scene.add(z.root);
        zombies.push(z);
      } catch {}
    }
  })();

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) if (picks.has(x)) return x;
    return null;
  };
  return {
    key: "cemetery",
    title: "THE CRYPT",
    scene,
    floors: [{ label: "Crypt", name: "Crypt · Catacombs & ossuary", y: 0, spawn: new THREE.Vector3(0, 0, 3.9), yaw: 0 }],
    colliders: () => rects,
    pickables: () => pickables,
    pick: (hit) => {
      const o = find(hit.object);
      return o ? (picks.get(o) ?? null) : null;
    },
    hover: (hit) => {
      const o = find(hit.object);
      return o ? (hovers.get(o) ?? null) : null;
    },
    update(dt, t, camera) {
      mistM.uniforms.t.value = t;
      const p = camera.position;
      lantern.position.set(p.x, p.y + 0.2, p.z);
      lantern.intensity = 2.0 + Math.sin(t * 9) * 0.2 + Math.sin(t * 23) * 0.12;
      green.intensity = 8 + Math.sin(t * 1.7) * 2.5;
      warmA.intensity = 4.6 + Math.sin(t * 13) * 0.5;
      warmB.intensity = 4.6 + Math.sin(t * 11 + 1) * 0.5;
      candleM.color.setRGB(3.0 + Math.sin(t * 17) * 0.3, 1.9 + Math.sin(t * 13) * 0.15, 0.8);
      ring.rotation.z += dt * 0.3;
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const z of zombies) {
        if (!z.walking) {
          z.idle -= dt;
          if (z.idle <= 0) {
            z.path = [route[Math.floor(Math.random() * route.length)].clone().add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5))];
            z.idle = 2 + Math.random() * 5;
          }
        }
        const d = Math.hypot(p.x - z.root.position.x, p.z - z.root.position.z);
        z.look = d < 6 ? p : null;
        z.sayCool -= dt;
        if (d < 7 && z.sayCool <= 0) {
          z.say(LINES[Math.floor(Math.random() * LINES.length)], 3.2);
          z.sayCool = 9 + Math.random() * 8;
        }
        z.update(dt, camQuat, camRight, true, () => 0);
      }
    },
  };
}
