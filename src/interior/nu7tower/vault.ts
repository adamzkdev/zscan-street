import * as THREE from "three";
import { links } from "../../data/zscan";
import type { PickInfo } from "../types";
import { marbleTex, paint, Surface, type SkyKit } from "../zktowers/kit";
import { cutCorner, rope } from "./props";
import { bezel, board, cap, F, glow, GOLD, header, LIFT, LIFT_STYLE, ledBg, neon, NU7, num, Nu7Live, PX, scan, VIOLET, zec, type BlockRow } from "./shared";

/**
 * 7 · the NSM VAULT: since NU7, 60 % of every block's fees is burned to the Network Sustainability
 * Mechanism (ZIP 235). In the middle the burn chamber: each new block's burned fees drop from the
 * chute as coins and go up in violet fire, and the burn runs along the floor into the vault door.
 * On the walls: the burned total since NU7 and day by day, the last block's burn, and the deposit
 * boxes, one per block, each with what it burned.
 */

const f = F.vault;
const X0 = -14,
  X1 = 14,
  Z0 = -28,
  Z1 = 0,
  H = 8;
const CZ = -13.5;
const DOOR = { y: 3.4, r: 3.0 };

export function vault(k: SkyKit, live: Nu7Live) {
  // ---- floor, ceiling --------------------------------------------------------------------------------
  const stone = marbleTex(77, "#121018", "#3a2a5a", 512, 4, 6, 6, "rgba(0,0,0,0.5)");
  k.flat(f, X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ map: stone, roughness: 0.16, metalness: 0.2 }), 0, (Z0 + Z1) / 2);
  k.box(f, X1 - X0, 0.3, Z1 - Z0, 0, H, (Z0 + Z1) / 2, "#100c16");
  // spot cans in the ceiling
  for (let x = -10; x <= 10; x += 5) for (let z = -24; z <= -4; z += 5) {
    k.cyl(f, 0.16, 0.16, 0.12, x, H - 0.12, z, "#2a2632", "metal", 14);
    k.cyl(f, 0.11, 0.11, 0.02, x, H - 0.13, z, "#fff0d0", "glow", 14);
  }
  // the inlay round the chamber, the burn channel to the door
  k.cyl(f, 3.7, 3.7, 0.01, 0, 0, CZ, "#0a080e", "polish", 64);
  k.cyl(f, 3.74, 3.74, 0.012, 0, 0, CZ, GOLD, "metal", 64);
  k.cyl(f, 3.6, 3.6, 0.014, 0, 0, CZ, "#0a080e", "polish", 64);
  k.box(f, 0.5, 0.016, Z0 + 1 - (CZ - 3.7), 0, 0, (CZ - 3.7 + Z0 + 1) / 2, "#0a080e", "polish");
  k.box(f, 0.08, 0.02, Z0 + 1 - (CZ - 3.7), 0, 0, (CZ - 3.7 + Z0 + 1) / 2, "#5a3a9a", "glow");
  const pulse = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(VIOLET).multiplyScalar(3), toneMapped: false }));
  pulse.raycast = () => {};
  pulse.visible = false;
  k.add(f, pulse, 0, 0.02, CZ - 4);

  // ---- walls ------------------------------------------------------------------------------------------
  const steel = "#2a2633";
  k.wall(f, -10, Z0, 10, Z0, H, steel, "metal", 0.5);
  cutCorner(k, f, X0, -24, -10, Z0, H, steel, 0, CZ);
  cutCorner(k, f, 10, Z0, X1, -24, H, steel, 0, CZ);
  k.wall(f, X0, -24, X0, Z1, H, "#1e1a26", "polish", 0.4);
  k.wall(f, X0, Z1, X1, Z1, H, "#1e1a26", "polish", 0.4);
  k.curtain(f, X1, -24, X1, Z1, H, "#2a2236", 2.4, { transom: 3.4 });
  // riveted steel bands round the room at the top
  for (const [a, b, c, d] of [
    [-10, Z0 + 0.26, 10, Z0 + 0.26],
    [X0 + 0.21, -24, X0 + 0.21, Z1],
    [X0, Z1 - 0.21, X1, Z1 - 0.21],
  ] as const) {
    k.wall(f, a, b, c, d, 0.5, "#3a3644", "metal", 0.06, H - 0.9, false);
    k.wall(f, a, b, c, d, 0.04, GOLD, "metal", 0.07, H - 0.95, false);
    k.wall(f, a, b, c, d, 0.05, VIOLET, "glow", 0.07, 0.1, false);
  }
  const title = neon("焼却金庫 · NSM VAULT", 0.6, VIOLET);
  k.add(f, title, 0, H - 0.55, Z0 + 0.3, 0);

  // ---- the vault door ---------------------------------------------------------------------------------
  const wheel = vaultDoor(k);

  // ---- the counters either side of the door ---------------------------------------------------------------
  const zw = Z0 + 0.3;
  bezel(k, f, 5.4, 3.4, -6.9, 3.5, zw + 0.02, 0, GOLD);
  board(k, f, 5.4, 3.4, -6.9, 3.5, zw + 0.02, 0, (g, W, Hh) => drawTotal(g, W, Hh, live), 2, 1024);
  bezel(k, f, 5.4, 3.4, 6.9, 3.5, zw + 0.02, 0, VIOLET);
  board(k, f, 5.4, 3.4, 6.9, 3.5, zw + 0.02, 0, (g, W, Hh) => drawDays(g, W, Hh, live), 6, 1024);
  k.hit(f, 5.4, 3.4, 0.3, -6.9, 1.8, zw + 0.15, `<b>Burned since NU7</b><span>60 % of the fees · NSM</span>`, () => totalInfo(live));
  k.hit(f, 5.4, 3.4, 0.3, 6.9, 1.8, zw + 0.15, `<b>Burned per day</b><span>since NU7</span>`, () => totalInfo(live));

  // ---- the deposit boxes, west: one per block --------------------------------------------------------------
  {
    const BX = X0 + 0.26;
    const W = 20,
      Hh = 5.0;
    bezel(k, f, W, Hh, BX, 3.2, -12, Math.PI / 2, GOLD);
    board(k, f, W, Hh, BX, 3.2, -12, Math.PI / 2, (g, Wp, Hp) => drawBoxes(g, Wp, Hp, live), 3, 2048);
    // brass grid over the boxes, for relief
    for (let c = 0; c <= 12; c++) k.box(f, 0.06, Hh, 0.05, BX + 0.06, 0.7, -12 - W / 2 + (c * W) / 12, "#8a6a2a", "metal");
    for (let r = 0; r <= 5; r++) k.box(f, 0.06, 0.04, W, BX + 0.06, 0.7 + (r * Hh) / 5 - 0.02, -12, "#8a6a2a", "metal");
    k.hit(f, 0.4, Hh, W, BX + 0.2, 0.7, -12, `<b>Deposit boxes</b><span>a box per block · what it burned</span>`, () => boxesInfo(live));
  }

  // ---- the last block, south: either side of the lifts ---------------------------------------------------
  bezel(k, f, 4.6, 2.6, -7.6, 3.2, Z1 - 0.26, Math.PI, VIOLET);
  board(k, f, 4.6, 2.6, -7.6, 3.2, Z1 - 0.26, Math.PI, (g, W, Hh) => drawLast(g, W, Hh, live), 2, 1024);
  bezel(k, f, 4.6, 2.6, 7.6, 3.2, Z1 - 0.26, Math.PI, GOLD);
  board(k, f, 4.6, 2.6, 7.6, 3.2, Z1 - 0.26, Math.PI, (g, W, Hh) => drawToday(g, W, Hh, live), 5, 1024);
  k.hit(f, 4.6, 2.6, 0.3, -7.6, 1.9, Z1 - 0.4, `<b>Last block</b><span>fees · burned</span>`, () => lastInfo(live));

  // ---- the lifts ---------------------------------------------------------------------------------------
  const [lx, lz, lry] = LIFT[f];
  k.lifts(f, lx, lz, lry, LIFT_STYLE);

  // ---- the burn chamber ---------------------------------------------------------------------------------
  const chamber = burnChamber(k, live);
  rope(
    k,
    f,
    Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
      return [Math.sin(a) * 3.1, CZ + Math.cos(a) * 3.1] as [number, number];
    }),
    true,
  );
  k.hit(f, 3.6, 6.4, 3.6, 0, 0, CZ, `<b>Burn chamber</b><span>each block's burned fees</span>`, () => lastInfo(live));

  // a burn: the coins drop, the fire flares, the burn runs to the door and turns its wheel
  let pulseT = -1;
  let wheelTo = 0;
  chamber.onBurn = () => {
    pulseT = 0;
    wheelTo += Math.PI / 3;
  };
  k.ticks[f].push((dt) => {
    if (pulseT >= 0) {
      pulseT += dt;
      const t = pulseT / 1.6;
      if (t > 1) {
        pulseT = -1;
        pulse.visible = false;
      } else {
        pulse.visible = true;
        pulse.position.z = CZ - 3.8 + (Z0 + 1.2 - (CZ - 3.8)) * t;
      }
    }
    wheel.rotation.z += (wheelTo - wheel.rotation.z) * Math.min(1, dt * 2.5);
  });

  // ---- light --------------------------------------------------------------------------------------------
  k.light(f, 0, 6.5, CZ, "#fff1d6", 16, 14);
  chamber.lamp = k.light(f, 0, 1.4, CZ, VIOLET, 18, 9);
  k.light(f, 0, 5.5, Z0 + 3, "#ffe2b8", 16, 12);
  k.light(f, -10, 4.5, -12, "#ffe2b8", 14, 14);
  k.light(f, 0, 4, -3, "#fff1d6", 10, 12);
  k.light(f, 9, 4.5, -12, "#fff1d6", 10, 14);

  // ---- people ---------------------------------------------------------------------------------------------
  k.onCast(f, () => {
    void k.person(f, 7301, [3.4, Z0 + 2.2], "Vault keeper", {
      face: [0, 1],
      cap: true,
      wander: [
        [3.4, Z0 + 2.2],
        [-3.4, Z0 + 2.2],
        [4.2, CZ - 4.6],
      ],
      lines: [
        "60 % of every block's fees comes down that chute.",
        () => {
          const b = live.burnedSince;
          return b ? `${zec(b.zat, 4)} ZEC burned since NU7, over ${b.days} days on the board.` : "Burned since NU7: on the board, left of the door.";
        },
        "The Network Sustainability Mechanism. ZIP 235.",
      ],
    });
    void k.person(f, 7302, [X0 + 1.6, -8.4], "Auditor", {
      face: [-1, 0],
      lines: [
        () => {
          const l = live.last;
          return l ? `Block ${num(l.height)}: ${zec(l.burned)} ZEC burned.` : "One box per block. I check them all.";
        },
        "An empty block burns nothing. Its box stays dark.",
      ],
    });
    void k.person(f, 7303, [2.6, CZ + 3.9], "Visitor", { face: [-0.5, -1], lines: ["Watch: another block.", "They just vanish in the fire."] });
    void k.person(f, 7304, [X1 - 1.6, -6], "Visitor", { face: [1, 0] });
  });
}

/** The round door: a steel disc in its frame, bolts round the rim, the wheel (it turns with each burn). */
function vaultDoor(k: SkyKit) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: "#9aa0aa", metalness: 0.92, roughness: 0.22, envMapIntensity: 1.5 });
  const dark = new THREE.MeshStandardMaterial({ color: "#3a3844", metalness: 0.85, roughness: 0.35 });
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.95, roughness: 0.2, envMapIntensity: 1.5 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.raycast = () => {};
    g.add(m);
    return m;
  };
  const R = DOOR.r;
  // the frame, flush with the wall, and the disc set in it
  add(new THREE.TorusGeometry(R + 0.15, 0.32, 16, 72), dark, 0, 0, 0.1);
  add(new THREE.TorusGeometry(R + 0.5, 0.06, 8, 72), gold, 0, 0, 0.12);
  const disc = add(new THREE.CylinderGeometry(R, R, 0.5, 72), steel, 0, 0, 0.2);
  disc.rotation.x = Math.PI / 2;
  for (const [r, mat] of [
    [R * 0.86, dark],
    [R * 0.62, gold],
    [R * 0.44, dark],
  ] as const) add(new THREE.TorusGeometry(r, 0.05, 8, 72), mat, 0, 0, 0.46);
  // the bolts
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const b = add(new THREE.CylinderGeometry(0.11, 0.11, 0.24, 12), gold, Math.cos(a) * R * 0.94, Math.sin(a) * R * 0.94, 0.48);
    b.rotation.x = Math.PI / 2;
  }
  // the hinge on the right
  add(new THREE.BoxGeometry(0.5, R * 1.2, 0.5), dark, R + 0.45, 0, 0.3);
  // the wheel: a rim, six spokes, a hub with the tower's 七
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 10, 48), gold);
  wheel.add(rim);
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), gold);
    s.position.set(Math.cos((i / 6) * Math.PI * 2) * 0.47, Math.sin((i / 6) * Math.PI * 2) * 0.47, 0);
    s.rotation.z = (i / 6) * Math.PI * 2 - Math.PI / 2;
    wheel.add(s);
  }
  for (let i = 0; i < 6; i++) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), gold);
    knob.position.set(Math.cos((i / 6) * Math.PI * 2) * 1.05, Math.sin((i / 6) * Math.PI * 2) * 1.05, 0);
    wheel.add(knob);
  }
  const hubTex = paint(256, 256, (c, W) => {
    c.fillStyle = "#1a1424";
    c.beginPath();
    c.arc(W / 2, W / 2, W / 2 - 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = VIOLET;
    c.font = PX(150);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("七", W / 2, W / 2 + 6);
  });
  const hub = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshBasicMaterial({ map: hubTex, toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) }));
  hub.position.z = 0.06;
  wheel.add(hub);
  wheel.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
  wheel.position.set(0, 0, 0.62);
  g.add(wheel);
  // the plate under the wheel
  const plate = paint(512, 128, (c, W, Hh) => {
    c.fillStyle = "#2a2010";
    c.fillRect(0, 0, W, Hh);
    c.strokeStyle = GOLD;
    c.lineWidth = 6;
    c.strokeRect(4, 4, W - 8, Hh - 8);
    c.fillStyle = "#ffe08a";
    c.font = PX(54);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("NSM · ZIP 235", W / 2, Hh / 2 + 3);
  });
  add(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: plate, metalness: 0.6, roughness: 0.3, emissive: new THREE.Color("#3a2a10"), emissiveMap: plate }), 0, -1.6, 0.47);
  k.add(f, g, 0, DOOR.y, Z0 + 0.28, 0);
  k.solid(f, -R - 0.8, Z0, R + 1.0, Z0 + 1.0);
  k.hit(f, R * 2, R * 2, 0.8, 0, DOOR.y - R, Z0 + 0.6, `<b>The vault</b><span>NSM · ZIP 235 · ZIP 237</span>`, () => ({
    eyebrow: "NSM VAULT",
    title: "Network Sustainability Mechanism",
    stats: [
      ["Fees burned", "60 % · ZIP 235"],
      ["Reissuance", "ZIP 237"],
      ["Since", `block ${num(NU7.height)}`],
      ["Activated", NU7.date],
    ],
  }));
  return wheel;
}

interface Chamber {
  onBurn: (() => void) | null;
  lamp: THREE.PointLight | null;
}

/** The glass chamber, its chute and its fire; coins drop for each block's burn. */
function burnChamber(k: SkyKit, live: Nu7Live): Chamber {
  const out: Chamber = { onBurn: null, lamp: null };
  const R = 1.6,
    B = 0.7,
    TOP = 5.9;
  // the base: dark steel, a gold lip, the LED band of the last burns
  k.cyl(f, 2.1, 2.0, B, 0, 0, CZ, "#1c1824", "metal", 64);
  k.cyl(f, 2.04, 2.04, 0.05, 0, B, CZ, GOLD, "metal", 64);
  const band = new Surface(2048, 96, 1.4);
  band.tex.wrapS = THREE.RepeatWrapping;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.115, 2.115, 0.3, 96, 1, true), band.mat);
  ring.raycast = () => {};
  k.add(f, ring, 0, 0.36, CZ);
  const drawBand = () =>
    band.draw((g, W, Hh) => {
      g.fillStyle = "#06040b";
      g.fillRect(0, 0, W, Hh);
      g.font = PX(58);
      g.textBaseline = "middle";
      let x = 20;
      const rows = live.blocks.slice(0, 10);
      for (const b of rows) {
        const s = `#${num(b.height)} · −${zec(Math.floor((b.fees ?? 0) * NU7.burn))} ZEC   `;
        g.fillStyle = (b.fees ?? 0) > 0 ? VIOLET : "#5a5370";
        g.fillText(s, x, Hh / 2 + 3);
        x += g.measureText(s).width;
        if (x > W) break;
      }
      if (!rows.length) {
        g.fillStyle = VIOLET;
        g.fillText("NSM · 60 % · ZIP 235", 20, Hh / 2 + 3);
      }
      scan(g, W, Hh, 3);
    });
  drawBand();
  live.on(drawBand);
  // the glass, its ribs and rings
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, TOP - B, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: "#cfe4f4", transparent: true, opacity: 0.12, roughness: 0.04, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  );
  glass.raycast = () => {};
  glass.renderOrder = 2;
  k.add(f, glass, 0, B + (TOP - B) / 2, CZ);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.box(f, 0.07, TOP - B, 0.07, Math.sin(a) * R, B, CZ + Math.cos(a) * R, "#8a8e98", "metal");
  }
  for (const y of [B + 0.05, TOP - 0.1, (B + TOP) / 2]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.045, 8, 64), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.95, roughness: 0.2 }));
    t.rotation.x = Math.PI / 2;
    t.raycast = () => {};
    k.add(f, t, 0, y, CZ);
  }
  // the lid, the funnel and the chute up into the ceiling
  k.cyl(f, R + 0.1, R + 0.1, 0.16, 0, TOP, CZ, "#1c1824", "metal", 64);
  k.cyl(f, 0.32, 1.0, 0.8, 0, TOP + 0.16, CZ, GOLD, "metal", 32);
  k.cyl(f, 0.24, 0.24, H - TOP - 0.9, 0, TOP + 0.9, CZ, "#3a3844", "metal", 20);
  k.ring(f, 0, CZ, 2.15);
  // the fire: a lit bed and its glow
  const bedTex = paint(256, 256, (g, W) => {
    const grad = g.createRadialGradient(W / 2, W / 2, 4, W / 2, W / 2, W / 2);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.25, "#ffd0ff");
    grad.addColorStop(0.55, VIOLET);
    grad.addColorStop(1, "rgba(60,20,120,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, W);
  });
  const bedMat = new THREE.MeshBasicMaterial({ map: bedTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(1.2, 1.2, 1.2) });
  const bed = new THREE.Mesh(new THREE.CircleGeometry(R - 0.05, 48), bedMat);
  bed.rotation.x = -Math.PI / 2;
  bed.raycast = () => {};
  k.add(f, bed, 0, B + 0.02, CZ);
  // embers rising
  const NE = 70;
  const ePos = new Float32Array(NE * 3);
  const eSeed = new Float32Array(NE);
  for (let i = 0; i < NE; i++) {
    eSeed[i] = Math.random();
    ePos[i * 3 + 1] = -10;
  }
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute("position", new THREE.BufferAttribute(ePos, 3));
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ color: new THREE.Color("#e0b0ff").multiplyScalar(2), size: 0.06, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  embers.frustumCulled = false;
  embers.raycast = () => {};
  k.add(f, embers, 0, 0, CZ);
  // the coins
  const N = 160;
  const coinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.024, 20);
  const coinMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.95, roughness: 0.22, emissive: new THREE.Color("#5a3a08"), envMapIntensity: 1.6 });
  const coins = new THREE.InstancedMesh(coinGeo, coinMat, N);
  coins.frustumCulled = false;
  coins.raycast = () => {};
  const st = Array.from({ length: N }, () => ({ on: 0, x: 0, y: 0, z: 0, vy: 0, wait: 0, burn: 0, ax: Math.random() * 6, az: Math.random() * 6, sp: 2 + Math.random() * 6 }));
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    p = new THREE.Vector3(),
    s = new THREE.Vector3();
  const hideAll = () => {
    for (let i = 0; i < N; i++) coins.setMatrixAt(i, m4.makeScale(0, 0, 0));
    coins.instanceMatrix.needsUpdate = true;
  };
  hideAll();
  k.add(f, coins, 0, 0, CZ);
  // the label over the chute: the block and what it burned
  const tag = new Surface(1024, 192, 1.6);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tag.tex, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) }));
  sprite.scale.set(3.6, 0.675, 1);
  sprite.raycast = () => {};
  k.add(f, sprite, 0, TOP + 1.25, CZ);
  const drawTag = (b: BlockRow | null) =>
    tag.draw((g, W, Hh) => {
      g.clearRect(0, 0, W, Hh);
      g.fillStyle = "rgba(6,4,11,0.82)";
      g.fillRect(0, 0, W, Hh);
      g.fillStyle = VIOLET;
      g.fillRect(0, 0, W, 6);
      g.fillRect(0, Hh - 6, W, 6);
      if (!b) return;
      glow(g, `#${num(b.height)}`, 30, 118, 84, GOLD, "left", 0.25);
      glow(g, `−${zec(Math.floor((b.fees ?? 0) * NU7.burn))}`, W - 30, 108, 70, VIOLET, "right", 0.3);
      cap(g, "ZEC BURNED", W - 30, 166, 34, "#c9bde6", "right");
    });
  drawTag(null);

  // the queue of blocks to burn
  const queue: BlockRow[] = [];
  live.onNew((b) => {
    if (b.height < NU7.height) return;
    queue.push(b);
    if (queue.length > 8) queue.splice(0, queue.length - 8);
  });
  let next = 0;
  let flare = 0;
  const drop = (b: BlockRow) => {
    const burned = Math.floor((b.fees ?? 0) * NU7.burn);
    drawTag(b);
    if (burned <= 0) return;
    const n = Math.max(3, Math.min(24, Math.round(2 + Math.log10(burned) * 1.7)));
    let made = 0;
    for (let i = 0; i < N && made < n; i++) {
      const c = st[i];
      if (c.on) continue;
      c.on = 1;
      const a = Math.random() * Math.PI * 2,
        r = Math.sqrt(Math.random()) * 0.22;
      c.x = Math.cos(a) * r;
      c.z = Math.sin(a) * r;
      c.y = TOP - 0.05;
      c.vy = -0.4 - Math.random() * 0.6;
      c.wait = made * 0.07;
      c.burn = 0;
      made++;
    }
    setTimeout(() => out.onBurn?.(), 1200);
  };
  k.arrive[f].push(() => {
    // arriving: the last block burns again for you
    const l = live.blocks[0];
    if (l) drop(l);
    next = 1.6;
  });
  const lampBase = 18;
  k.ticks[f].push((dt, t) => {
    if ((next -= dt) <= 0 && queue.length) {
      drop(queue.shift()!);
      next = 1.4;
    }
    let any = false;
    for (let i = 0; i < N; i++) {
      const c = st[i];
      if (!c.on) continue;
      any = true;
      if (c.wait > 0) {
        c.wait -= dt;
        coins.setMatrixAt(i, m4.makeScale(0, 0, 0));
        continue;
      }
      if (c.on === 1) {
        c.vy -= 6.5 * dt;
        c.y += c.vy * dt;
        // fanning out as they fall
        c.x *= 1 + dt * 0.5;
        c.z *= 1 + dt * 0.5;
        const rr = Math.hypot(c.x, c.z);
        if (rr > R - 0.2) (c.x *= (R - 0.2) / rr), (c.z *= (R - 0.2) / rr);
        if (c.y <= B + 0.06) {
          c.y = B + 0.06;
          c.on = 2;
          flare = Math.min(1.6, flare + 0.25);
        }
        e.set(t * c.sp + c.ax, 0, t * c.sp * 0.7 + c.az);
        s.setScalar(1);
      } else {
        c.burn += dt / 0.5;
        e.set(Math.PI / 2, 0, 0);
        s.setScalar(Math.max(0, 1 - c.burn));
        if (c.burn >= 1) {
          c.on = 0;
          s.setScalar(0);
        }
      }
      p.set(c.x, c.y, c.z);
      coins.setMatrixAt(i, m4.compose(p, q.setFromEuler(e), s));
    }
    if (any) coins.instanceMatrix.needsUpdate = true;
    // the fire breathes, and flares when coins land
    flare = Math.max(0, flare - dt * 0.9);
    const breathe = 0.85 + Math.sin(t * 3.1) * 0.08 + Math.sin(t * 7.3) * 0.05;
    bedMat.color.setScalar((1 + flare) * breathe);
    if (out.lamp) out.lamp.intensity = lampBase * (breathe + flare * 1.5);
    // embers: up from the bed, fading, round again
    for (let i = 0; i < NE; i++) {
      const life = (t * (0.18 + eSeed[i] * 0.2) + eSeed[i] * 7) % 1;
      const a = eSeed[i] * 40 + t * 0.4;
      const r = (R - 0.3) * Math.sqrt((eSeed[i] * 13.7) % 1);
      ePos[i * 3] = Math.cos(a) * r * (1 - life * 0.4);
      ePos[i * 3 + 1] = B + 0.05 + life * (1.4 + flare * 2);
      ePos[i * 3 + 2] = Math.sin(a) * r * (1 - life * 0.4);
    }
    eGeo.attributes.position.needsUpdate = true;
  });
  return out;
}

// ---- the boards -------------------------------------------------------------------------------------------

function drawTotal(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H, GOLD);
  header(g, W, 60, "焼却", "BURNED SINCE NU7", GOLD);
  const b = live.burnedSince;
  glow(g, b ? zec(b.zat, 4) : "—", W / 2, 268, 170, GOLD, "center", 0.3);
  cap(g, "ZEC", W / 2, 336, 44, "#e9c55a", "center");
  const days = live.nu7Days.filter((d) => d.has);
  const fees = days.reduce((a, d) => a + d.fees, 0);
  const rows: [string, string][] = [
    ["FEES", b ? `${zec(fees, 4)} ZEC` : "—"],
    ["→ NSM", "60 %"],
    ["DAYS", b ? `${b.days} / ${b.of}` : "—"],
  ];
  const xs = [60, W * 0.5, W * 0.76];
  rows.forEach(([l, v], i) => {
    cap(g, l, xs[i], 440, 32);
    glow(g, v, xs[i], 506, 46, i === 1 ? VIOLET : "#efe6ff", "left", 0.25);
  });
  scan(g, W, H, 4);
}

function drawDays(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H);
  header(g, W, 60, "焼却 / 日", "BURNED PER DAY", VIOLET);
  const d = live.nu7Days;
  const x0 = 80,
    x1 = W - 40,
    y0 = 120,
    y1 = H - 80;
  const max = Math.max(0.1e8, ...d.map((x) => (x.has ? x.burned : 0)));
  cap(g, `${zec(max, 2)}`, x0 - 10, y0 + 24, 26, "#8d84a3", "right");
  cap(g, "0", x0 - 10, y1, 26, "#8d84a3", "right");
  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fillRect(x0, y1, x1 - x0, 2);
  const n = Math.max(d.length, 7);
  const bw = (x1 - x0) / n;
  d.forEach((x, i) => {
    const bx = x0 + i * bw;
    if (x.has) {
      const h = (x.burned / max) * (y1 - y0);
      const grad = g.createLinearGradient(0, y1 - h, 0, y1);
      grad.addColorStop(0, GOLD);
      grad.addColorStop(1, VIOLET);
      g.fillStyle = grad;
      g.fillRect(bx + bw * 0.14, y1 - h, bw * 0.72, h);
    } else {
      g.fillStyle = "rgba(141,132,163,0.25)";
      for (let y = y1 - 6; y > y1 - 40; y -= 10) g.fillRect(bx + bw * 0.3, y, bw * 0.4, 4);
    }
    const every = Math.ceil(n / 8);
    if (i % every === 0 || i === d.length - 1) cap(g, x.day.slice(5), bx + bw / 2, y1 + 40, 24, "#a99cc8", "center");
  });
  if (!d.length) cap(g, "—", W / 2, H / 2, 60, "#8d84a3", "center");
  scan(g, W, H, 4);
}

function drawBoxes(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  g.fillStyle = "#1a140c";
  g.fillRect(0, 0, W, H);
  const cols = 12,
    rows = 5;
  const bw = W / cols,
    bh = H / rows;
  const list = live.blocks.slice(0, cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const b = list[i];
      const x = c * bw,
        y = r * bh;
      // the box front: brushed brass
      const grad = g.createLinearGradient(x, y, x + bw, y + bh);
      grad.addColorStop(0, "#5a4524");
      grad.addColorStop(1, "#3a2c16");
      g.fillStyle = grad;
      g.fillRect(x + 6, y + 6, bw - 12, bh - 12);
      g.strokeStyle = "rgba(255,220,140,0.25)";
      g.lineWidth = 2;
      g.strokeRect(x + 12, y + 12, bw - 24, bh - 24);
      // keyhole
      g.fillStyle = "#1a140c";
      g.beginPath();
      g.arc(x + bw - 34, y + bh / 2, 8, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x + bw - 37, y + bh / 2, 6, 16);
      if (!b) continue;
      const burned = Math.floor((b.fees ?? 0) * NU7.burn);
      // the label plate
      g.fillStyle = "#e8dcc0";
      g.fillRect(x + 18, y + 18, bw - 70, 34);
      g.fillStyle = "#2a2010";
      g.font = PX(28);
      g.textBaseline = "middle";
      g.textAlign = "left";
      g.fillText(`#${num(b.height)}`, x + 24, y + 36);
      // what it burned, lit if anything
      const lit = burned > 0;
      g.shadowColor = lit ? VIOLET : "transparent";
      g.shadowBlur = lit ? 14 : 0;
      g.fillStyle = lit ? (i === 0 ? GOLD : "#d9c0ff") : "#6a5a40";
      g.font = PX(34);
      g.fillText(lit ? zec(burned) : "0", x + 22, y + bh - 30);
      g.shadowBlur = 0;
      // the LED
      g.fillStyle = lit ? (i === 0 ? GOLD : VIOLET) : "#2a2010";
      g.beginPath();
      g.arc(x + bw - 34, y + 28, 7, 0, Math.PI * 2);
      g.fill();
    }
  scan(g, W, H, 4);
}

function drawLast(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H);
  header(g, W, 60, "最新ブロック", "LAST BLOCK", VIOLET);
  const l = live.last;
  if (!l) return scan(g, W, H, 4);
  glow(g, `#${num(l.height)}`, 50, 200, 110, GOLD, "left", 0.25);
  const rows: [string, string, string][] = [
    ["FEES", zec(l.fees ?? 0), "#efe6ff"],
    ["BURNED", zec(l.burned), VIOLET],
    ["POOL", (l.miner_pool ?? "—").toUpperCase().slice(0, 14), "#efe6ff"],
  ];
  rows.forEach(([a, v, c], i) => {
    const y = 300 + i * 84;
    cap(g, a, 54, y, 34);
    glow(g, v, W - 50, y + 8, 56, c, "right", 0.25);
  });
  scan(g, W, H, 4);
}

function drawToday(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H, GOLD);
  const d = live.nu7Days.filter((x) => x.has).at(-1);
  header(g, W, 60, "本日", d ? `DAY ${d.day}` : "DAY", GOLD);
  if (!d) return scan(g, W, H, 4);
  const rows: [string, string, string][] = [
    ["BLOCKS", num(d.blocks), "#efe6ff"],
    ["FEES", `${zec(d.fees, 4)} ZEC`, "#efe6ff"],
    ["BURNED", `${zec(d.burned, 4)} ZEC`, VIOLET],
    ["ISSUED", `${zec(d.issued, 2)} ZEC`, GOLD],
  ];
  rows.forEach(([a, v, c], i) => {
    const y = 150 + i * 92;
    cap(g, a, 54, y, 34);
    glow(g, v, W - 50, y + 8, 58, c, "right", 0.25);
  });
  scan(g, W, H, 4);
}

// ---- what a click shows ----------------------------------------------------------------------------------

function totalInfo(live: Nu7Live): PickInfo {
  const b = live.burnedSince;
  const days = live.nu7Days;
  return {
    eyebrow: "NSM VAULT · burned since NU7",
    title: b ? `${zec(b.zat)} ZEC` : "Burned since NU7",
    mono: true,
    stats: [
      ["Days on the board", b ? `${b.days} of ${b.of}` : "—"],
      ["Share of fees", "60 % · ZIP 235"],
      ["Since", `block ${num(NU7.height)}`],
      ["Reissuance", "ZIP 237"],
    ],
    body: days.length
      ? `<p>${days
          .map((d) => `${d.day}: ${d.has ? `${zec(d.burned)} ZEC` : "no data yet"}`)
          .join("<br>")}</p>`
      : undefined,
  };
}

function lastInfo(live: Nu7Live): PickInfo {
  const l = live.last;
  if (!l) return { eyebrow: "NSM VAULT", title: "Burn chamber", stats: [["Fees burned", "60 % · ZIP 235"]] };
  return {
    eyebrow: "NSM VAULT · last block",
    title: `Block ${num(l.height)}`,
    mono: true,
    stats: [
      ["Fees", `${zec(l.fees ?? 0)} ZEC`],
      ["Burned (60 %)", `${zec(l.burned)} ZEC`],
      ["Pool", l.miner_pool ?? "—"],
      ["Transactions", String(Math.max(0, l.tx_count - 1))],
    ],
    link: { href: links.block(l.height), label: `Block ${num(l.height)} on ZScan` },
  };
}

function boxesInfo(live: Nu7Live): PickInfo {
  const list = live.blocks.slice(0, 60);
  const burned = list.reduce((a, b) => a + Math.floor((b.fees ?? 0) * NU7.burn), 0);
  return {
    eyebrow: "NSM VAULT · deposit boxes",
    title: list.length ? `#${num(list[list.length - 1].height)} → #${num(list[0].height)}` : "Deposit boxes",
    mono: true,
    stats: [
      ["Blocks", String(list.length)],
      ["Burned", `${zec(burned)} ZEC`],
      ["Empty", String(list.filter((b) => !(b.fees ?? 0)).length)],
      ["Share", "60 % of fees"],
    ],
  };
}
