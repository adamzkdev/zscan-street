import * as THREE from "three";
import { chandelier, coffers } from "./arch";
import { C, F, GOLD, JP, LEVELS, paint, SERIF, type ReserveKit } from "./kit";

/**
 * The governors' stair: the grand stair from the banking hall down to the gold vault, as old banks
 * have it. A stair hall west of the hall, behind its wall: a bronze doorway under the live pools
 * board, a short passage, a landing, then one straight flight of 67 cream marble steps under a red
 * runner with brass rods, down to a landing on the vault's floor and a steel-and-bronze doorway in
 * the vault's west wall (its north-west corner, by the transparent pile). Travertine walls, a green
 * marble dado, bronze handrails and lanterns following the flight, the governors' portraits, a
 * coffered ceiling with chandeliers. Walked for real (liftplan.ts: the flight over its zone joins
 * the vault and the hall); built with the hall, and index.ts draws the floor at its other end while
 * you are near it.
 */
export const VAULT_STAIR = {
  /** The flight [x0, z0, x1, z1], climbing toward +z: its foot on the vault (z0), its head in the hall (z1). */
  zone: [-26.2, -43.6, -22.2, -23.6] as const,
  west: -26.4,
  east: -22,
  north: -46.4,
  south: -20,
  /** The doorways: in the hall's west wall, in the vault's west wall: [z0, z1, height]. */
  hallDoor: [-23.3, -20.5, 3.6] as [number, number, number],
  vaultDoor: [-46.2, -43.8, 3.4] as [number, number, number],
};

export function governorsStair(k: ReserveKit) {
  const f = F.hall;
  const [x0, z0, x1, z1] = VAULT_STAIR.zone;
  const { west: W, east: E, north: Nz, south: Sz } = VAULT_STAIR;
  const low = LEVELS[F.vault].y - LEVELS[f].y;
  const ceil = 7.5;
  const run = z1 - z0,
    drop = -low;
  const N = 67;
  const rise = drop / N,
    go = run / N;
  const slope = Math.atan2(drop, run);
  const pitch = (z: number) => low + THREE.MathUtils.clamp((z - z0) / run, 0, 1) * drop;
  const cx = (W + E) / 2,
    wide = E - W,
    mid = (x0 + x1) / 2;

  // ---- travertine ashlar, the hall's own, courses in line from piece to piece ----
  const ashlar = paint(512, 512, (c, Wd, Hh) => {
    c.fillStyle = "#d9cbb0";
    c.fillRect(0, 0, Wd, Hh);
    for (let n = 0; n < 1400; n++) {
      c.fillStyle = `rgba(${150 + k.rnd(n, 1) * 60},${130 + k.rnd(n, 2) * 50},${100 + k.rnd(n, 3) * 40},0.25)`;
      c.fillRect(k.rnd(n, 4) * Wd, k.rnd(n, 5) * Hh, 1 + k.rnd(n, 6) * 5, 1 + k.rnd(n, 7) * 2);
    }
    c.fillStyle = "rgba(90,75,55,0.55)";
    for (let r = 0; r < 5; r++) {
      c.fillRect(0, r * 102.4, Wd, 3);
      const off = r % 2 ? 128 : 0;
      for (let x = off; x < Wd + 256; x += 256) c.fillRect(x % Wd, r * 102.4, 3, 102.4);
    }
  });
  ashlar.wrapS = ashlar.wrapT = THREE.RepeatWrapping;
  /** A wall piece: `a`..`b` along it, `ya`..`yb` high, at (x | z) facing `ry`. */
  const piece = (a: number, b: number, ya: number, yb: number, at: (m: number) => [number, number], ry: number) => {
    if (b - a < 0.01 || yb - ya < 0.01) return;
    const t = ashlar.clone();
    t.repeat.set((b - a) / 4, (yb - ya) / 4);
    t.offset.set(a / 4, ya / 4);
    t.needsUpdate = true;
    const [px, pz] = at((a + b) / 2);
    k.plane(f, b - a, yb - ya, new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 }), px, (ya + yb) / 2, pz, 0, ry);
  };
  const westAt = (m: number): [number, number] => [W, m];
  const eastAt = (m: number): [number, number] => [E - 0.16, m];
  piece(Nz, Sz, low, ceil, westAt, Math.PI / 2);
  // the east wall, round the two doorways
  const [vd0, vd1, vdh] = VAULT_STAIR.vaultDoor;
  const [hd0, hd1, hdh] = VAULT_STAIR.hallDoor;
  piece(Nz, vd0, low, ceil, eastAt, -Math.PI / 2);
  piece(vd0, vd1, low + vdh, ceil, eastAt, -Math.PI / 2);
  piece(vd1, hd0, low, ceil, eastAt, -Math.PI / 2);
  piece(hd0, hd1, hdh, ceil, eastAt, -Math.PI / 2);
  piece(hd1, Sz, low, ceil, eastAt, -Math.PI / 2);
  piece(W, E, low, ceil, (m) => [m, Nz], 0);
  piece(W, E, -0.2, ceil, (m) => [m, Sz], Math.PI);
  k.solid(f, W - 0.2, Nz - 0.2, W, Sz + 0.2);
  k.solid(f, W - 0.2, Sz, -20.3, Sz + 0.2);
  k.solid(f, E - 0.15, Nz - 0.2, E + 0.15, hd0);
  k.solid(f, E - 0.15, hd1, E + 0.15, Sz + 0.2);
  k.solid(F.vault, W - 0.2, Nz - 0.2, W, Sz);
  k.solid(F.vault, W - 0.2, Nz - 0.2, E + 0.15, Nz);
  // the frieze and cornice round the top, the coffered ceiling and its chandeliers
  for (const [w, d, x, z] of [
    [0.4, Sz - Nz, W + 0.2, (Nz + Sz) / 2],
    [0.4, Sz - Nz, E - 0.36, (Nz + Sz) / 2],
    [wide, 0.4, cx, Nz + 0.2],
    [wide, 0.4, cx, Sz - 0.2],
  ] as const) {
    k.box(f, w, 0.4, d, x, ceil - 1.0, z, C.cream, "polish");
    k.box(f, w + 0.04, 0.1, d + 0.04, x, ceil - 1.1, z, GOLD, "metal");
  }
  coffers(k, f, W, Nz, E - 0.16, Sz, ceil, 2.2);
  chandelier(k, f, cx, -39.5, ceil, 0.8);
  chandelier(k, f, cx, -31, ceil, 0.9);
  chandelier(k, f, cx, -22, ceil, 0.7);
  k.label(f, "THE GOVERNORS' STAIR  ·  準備銀行", W + 0.03, ceil - 1.75, -33, { h: 0.5, color: GOLD, font: `700 96px ${SERIF}`, ry: Math.PI / 2 });

  // ---- the landings and the passage ----
  k.box(f, wide, 0.25, -z0 + Nz, cx, low - 0.25, (Nz + z0) / 2, C.cream, "polish");
  k.box(f, wide, 0.25, Sz - z1, cx, -0.25, (z1 + Sz) / 2, C.cream, "polish");
  for (const [za, zb, y] of [
    [Nz + 0.5, z0 - 0.3, low],
    [z1 + 0.3, Sz - 0.4, 0],
  ] as const) {
    // a green marble inlay framed in brass on each landing
    k.box(f, wide - 1.0, 0.012, zb - za, cx, y, (za + zb) / 2, C.greenMarble, "polish");
    k.box(f, wide - 1.3, 0.016, zb - za - 0.3, cx, y, (za + zb) / 2, C.deepGreen, "polish");
    k.box(f, 0.06, 0.02, zb - za, cx - (wide - 1.0) / 2, y, (za + zb) / 2, C.brass, "metal");
    k.box(f, 0.06, 0.02, zb - za, cx + (wide - 1.0) / 2, y, (za + zb) / 2, C.brass, "metal");
  }
  // the passage through the hall's wall, two metres of masonry
  const pw = -20.3 - E;
  k.box(f, pw, 0.25, hd1 - hd0, E + pw / 2, -0.25, (hd0 + hd1) / 2, C.cream, "polish");
  k.box(f, pw, 0.012, hd1 - hd0 - 0.6, E + pw / 2, 0, (hd0 + hd1) / 2, "#6e1422", "matte");
  for (const [z, ry] of [
    [hd0, 0],
    [hd1, Math.PI],
  ] as const) {
    k.plane(f, pw + 0.3, hdh, new THREE.MeshStandardMaterial({ color: "#d6c7a8", roughness: 0.5 }), E + pw / 2 - 0.15, hdh / 2, z, 0, ry);
    k.box(f, pw + 0.3, 0.9, 0.06, E + pw / 2 - 0.15, 0, z + (ry ? -0.03 : 0.03), C.greenMarble, "polish");
  }
  k.box(f, pw + 0.3, 0.2, hd1 - hd0, E + pw / 2 - 0.15, hdh, (hd0 + hd1) / 2, C.cream, "polish");
  k.solid(f, E, hd0 - 0.2, -20.3, hd0);
  k.solid(f, E, hd1, -20.3, hd1 + 0.2);

  // ---- the flight: cream marble steps, the red runner with gilt borders, brass rods ----
  for (let i = 0; i < N; i++) {
    const top = low + (i + 1) * rise;
    const zf = z0 + i * go;
    k.box(f, wide, rise + 0.35, go + 0.004, cx, top - rise - 0.35, zf + go / 2, i % 2 ? "#efe7d6" : "#ebe2cf", "polish");
    k.box(f, wide, 0.03, 0.05, cx, top - 0.03, zf + 0.025, GOLD, "metal");
    k.box(f, 2.6, rise + 0.012, go + 0.012, mid, top - rise, zf - 0.012 + (go + 0.012) / 2, "#6e1422", "matte");
    for (const s of [-1, 1]) k.box(f, 0.07, rise + 0.016, go + 0.016, mid + s * 1.18, top - rise, zf - 0.014 + (go + 0.016) / 2, "#c9a24a", "metal");
    k.geo(f, new THREE.CylinderGeometry(0.016, 0.016, 2.8, 8).rotateZ(Math.PI / 2).translate(mid, top - rise + 0.035, zf - 0.03), C.brass, "metal");
  }

  // ---- along both walls: a green marble dado with a gilt cap, a bronze handrail on brackets ----
  const len = Math.hypot(run, drop);
  const along = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => geo.rotateX(-slope).translate(x, y, z);
  for (const [x, nx] of [
    [W + 0.03, 1],
    [E - 0.19, -1],
  ] as const) {
    k.geo(f, along(new THREE.BoxGeometry(0.06, 1.5 * Math.cos(slope), len), x, (low + 0) / 2 + 0.45, (z0 + z1) / 2), C.greenMarble, "polish");
    k.geo(f, along(new THREE.BoxGeometry(0.1, 0.07, len), x + nx * 0.02, low / 2 + 1.2, (z0 + z1) / 2), GOLD, "metal");
    // the landings' dado runs flat
    for (const [za, zb, y] of [
      [Nz, z0, low],
      [z1, Sz, 0],
    ] as const) {
      const cut = nx < 0 ? (y === low ? [vd0, vd1] : [hd0, hd1]) : null;
      const parts = cut ? [[za, cut[0]], [cut[1], zb]] : [[za, zb]];
      for (const [a, b] of parts)
        if (b - a > 0.02) {
          k.box(f, 0.06, 1.2, b - a, x, y, (a + b) / 2, C.greenMarble, "polish");
          k.box(f, 0.1, 0.07, b - a, x + nx * 0.02, y + 1.2, (a + b) / 2, GOLD, "metal");
        }
    }
    const hx = x + nx * 0.15;
    k.geo(f, new THREE.CylinderGeometry(0.04, 0.04, len + 0.5, 12).rotateX(Math.PI / 2 - slope).translate(hx, low / 2 + 0.95, (z0 + z1) / 2), C.bronze, "metal");
    for (let t = 0.03; t < 1; t += 0.1) {
      const zz = z0 + t * run;
      k.box(f, 0.16, 0.035, 0.035, (x + hx) / 2, pitch(zz) + 0.88, zz, C.bronze, "metal");
    }
    // bronze lanterns stepping up the flight
    for (const zz of [-41.5, -37, -32.5, -28, -24.6]) {
      const y = Math.max(pitch(zz), low) + 2.7;
      const lx = x + nx * 0.22;
      k.box(f, 0.14, 0.05, 0.05, x + nx * 0.08, y + 0.5, zz, C.bronze, "metal");
      k.box(f, 0.3, 0.06, 0.3, lx, y + 0.6, zz, C.bronze, "metal");
      k.box(f, 0.22, 0.48, 0.22, lx, y + 0.1, zz, "#fff0c8", "glow");
      for (const [dx, dz] of [
        [-0.13, -0.13],
        [0.13, -0.13],
        [-0.13, 0.13],
        [0.13, 0.13],
      ])
        k.box(f, 0.03, 0.56, 0.03, lx + dx, y + 0.06, zz + dz, C.bronze, "metal");
      k.cyl(f, 0.0, 0.12, 0.16, lx, y + 0.66, zz, C.bronze, "metal", 4);
      k.box(f, 0.32, 0.06, 0.32, lx, y + 0.04, zz, C.bronze, "metal");
    }
  }

  // ---- the governors, down the west wall; the seal at the foot ----
  const govs: [number, string][] = [
    [1888, "First Governor"],
    [4096, "Second Governor"],
    [2718, "Third Governor"],
    [6174, "Fourth Governor"],
  ];
  govs.forEach(([id, name], i) => {
    const zz = -40.2 + i * 4.6;
    k.painting(f, id, W + 0.03, pitch(zz) + 3.3, zz, Math.PI / 2, 1.3, name);
  });
  const seal = paint(512, 512, (c, Wd, Hh) => {
    c.clearRect(0, 0, Wd, Hh);
    c.fillStyle = "#c9a24a";
    c.beginPath();
    c.arc(Wd / 2, Hh / 2, 250, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#13261e";
    c.beginPath();
    c.arc(Wd / 2, Hh / 2, 232, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#c9a24a";
    c.lineWidth = 6;
    c.beginPath();
    c.arc(Wd / 2, Hh / 2, 190, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "#e8c35a";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `900 230px ${SERIF}`;
    c.fillText("ⓩ", Wd / 2, Hh / 2 + 8);
    c.font = `700 34px ${SERIF}`;
    const motto = "ZEC RESERVE · 準備銀行 · GOLD VAULT · ";
    for (let i = 0; i < motto.length; i++) {
      const a = (i / motto.length) * Math.PI * 2 - Math.PI / 2;
      c.save();
      c.translate(Wd / 2 + Math.cos(a) * 211, Hh / 2 + Math.sin(a) * 211);
      c.rotate(a + Math.PI / 2);
      c.fillText(motto[i], 0, 0);
      c.restore();
    }
  });
  k.plane(f, 3.2, 3.2, new THREE.MeshStandardMaterial({ map: seal, transparent: true, alphaTest: 0.5, roughness: 0.35, metalness: 0.5 }), cx, low + 3.6, Nz + 0.03);
  k.label(f, "金庫  ·  THE GOLD VAULT", cx, low + 1.75, Nz + 0.04, { h: 0.34, color: GOLD, font: `700 96px ${SERIF}` });
  k.label(f, "準備銀行  ·  BANKING HALL", cx, hdh - 0.1, Sz - 0.04, { h: 0.3, color: GOLD, font: `700 96px ${SERIF}`, ry: Math.PI });

  // torchères on the landings, out of the way in the corners
  const torch = (x: number, z: number, y: number) => {
    k.box(f, 0.5, 0.12, 0.5, x, y, z, C.greenMarble, "polish");
    k.cyl(f, 0.06, 0.04, 1.9, x, y + 0.12, z, C.bronze, "metal", 10);
    k.cyl(f, 0.24, 0.12, 0.16, x, y + 2.0, z, GOLD, "metal", 16);
    k.geo(f, new THREE.SphereGeometry(0.22, 16, 12).translate(x, y + 2.38, z), "#fff1cc", "glow");
  };
  torch(W + 0.45, Nz + 0.45, low);
  torch(W + 0.45, Sz - 0.45, 0);
  k.solid(F.vault, W, Nz, W + 0.75, Nz + 0.75);
  k.solid(f, W, Sz - 0.75, W + 0.75, Sz);

  // ---- the doorway from the hall: bronze, under the live pools board ----
  for (const z of [hd0 - 0.15, hd1 + 0.15]) k.box(f, 0.24, hdh + 0.3, 0.3, -19.87, 0, z, C.bronze, "metal");
  k.box(f, 0.24, 0.3, hd1 - hd0 + 0.6, -19.87, hdh, (hd0 + hd1) / 2, C.bronze, "metal");
  k.box(f, 0.05, 0.28, hd1 - hd0 - 0.2, -19.73, hdh + 0.01, (hd0 + hd1) / 2, "#16130e", "polish");
  k.label(f, "▼ 金庫 · GOLD VAULT", -19.7, hdh + 0.15, (hd0 + hd1) / 2, { h: 0.2, color: GOLD, font: `700 80px ${SERIF}`, ry: Math.PI / 2 });
  k.solid(f, -20, hd0 - 0.3, -19.75, hd0);
  k.solid(f, -20, hd1, -19.75, hd1 + 0.3);
  k.hit(f, 0.3, hdh, hd1 - hd0, -19.9, 0, (hd0 + hd1) / 2, "<b>The governors' stair</b><span>down to the gold vault</span>", () => ({ eyebrow: "ZEC Reserve", title: "The governors' stair", stats: [["Down to", "-1 · Gold vault"], ["Steps", `${N}`], ["Drop", `${drop} m`]] }));

  // ---- the doorway in the vault's west wall: a steel frame with bronze facings ----
  const v = F.vault;
  for (const z of [vd0 - 0.17, vd1 + 0.17]) {
    k.box(v, 0.5, vdh + 0.34, 0.34, -21.7, 0, z, "#5c6068", "metal");
    k.box(v, 0.06, vdh + 0.2, 0.2, -21.43, 0, z, C.bronze, "metal");
  }
  k.box(v, 0.5, 0.34, vd1 - vd0 + 0.68, -21.7, vdh, (vd0 + vd1) / 2, "#5c6068", "metal");
  k.box(v, 0.05, 0.4, vd1 - vd0, -21.43, vdh + 0.4, (vd0 + vd1) / 2, "#16161b", "polish");
  k.label(v, "▲ GRAND STAIR · BANKING HALL", -21.4, vdh + 0.6, (vd0 + vd1) / 2, { h: 0.2, color: GOLD, font: `700 80px ${JP}`, ry: Math.PI / 2 });
  for (let i = 0; i < 6; i++) k.box(v, 0.4, 0.01, 0.12, -21.2 + i * 0.5, 0.006, (vd0 + vd1) / 2, i % 2 ? "#111" : "#e8b923", "matte");
  k.solid(v, -21.95, vd0 - 0.34, -21.45, vd0);
  k.solid(v, -21.95, vd1, -21.45, vd1 + 0.34);
}
