import * as THREE from "three";
import * as F from "../furniture";
import { std } from "../kit";
import { EiffelKit, hw, lw } from "./kit";
import { miniTower, parisLamp, queueLine } from "./props";

/**
 * 0 — the esplanade under the tower: the four pillars on their stone piers, the great arches and
 * the first floor's girders overhead, the ticket booths, the queue, the lift going up the east
 * pillar (its cabin climbs the leg), the stairs in the south pillar, vendors, a guide, the fence.
 */
export const SPAWN0 = { pos: new THREE.Vector3(3, 0, 20.6), yaw: 0 };

export function esplanade(k: EiffelKit) {
  const f = 0,
    g = k.groups[f],
    key = "0";
  // the security fence: glass panels on posts all round (the gap at the front is the way out)
  const X = 25.5,
    Zb = -25.5,
    Zf = 22.6;
  const fence = (a: [number, number], b: [number, number]) => {
    k.pane(g, a, b, 0, 2.2, new THREE.MeshStandardMaterial({ color: "#d8ecf4", transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false }));
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.round(len / 2);
    for (let i = 0; i <= n; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / n,
        z = a[1] + ((b[1] - a[1]) * i) / n;
      k.slab(key, 0.1, 2.3, 0.1, x, 0, z, k.ironDark);
    }
    k.slab(key, Math.abs(b[0] - a[0]) + 0.08, 0.06, Math.abs(b[1] - a[1]) + 0.08, (a[0] + b[0]) / 2, 2.2, (a[1] + b[1]) / 2, k.ironDark);
    k.rects[f].push([Math.min(a[0], b[0]) - 0.1, Math.min(a[1], b[1]) - 0.1, Math.max(a[0], b[0]) + 0.1, Math.max(a[1], b[1]) + 0.1]);
  };
  fence([-X, Zb], [X, Zb]);
  fence([-X, Zb], [-X, Zf]);
  fence([X, Zb], [X, Zf]);
  fence([-X, Zf], [X, Zf]);

  // the piers block the way (the pillars themselves are in the frame)
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const o = hw(0) + 0.6,
      i = hw(0) - lw(0) - 0.6;
    k.rects[f].push([Math.min(sx * o, sx * i), Math.min(sz * o, sz * i), Math.max(sx * o, sx * i), Math.max(sz * o, sz * i)]);
    const pier = new THREE.Mesh(new THREE.BoxGeometry(lw(0) + 1.2, 1.2, lw(0) + 1.2), new THREE.MeshBasicMaterial({ visible: false }));
    pier.position.set((sx * (o + i)) / 2, 0.6, (sz * (o + i)) / 2);
    g.add(pier);
    const name = sx > 0 ? (sz > 0 ? "Pilier Est" : "Pilier Nord") : sz > 0 ? "Pilier Sud" : "Pilier Ouest";
    k.pick(f, pier, `<b>${name}</b><span>${sx > 0 && sz > 0 ? "lift" : sx < 0 && sz > 0 ? "stairs" : "lift"}</span>`, () => ({
      eyebrow: "Tour Eiffel",
      title: name,
      stats: [
        ["Height", "330 m"],
        ["Iron", "7,300 t"],
        ["Rivets", "2.5 M"],
        ["Steps", "1,665"],
      ],
    }));
  }

  // ---- the lift in the east pillar: its door in the pier, the cabin climbing the leg -------------------
  const pierIn = hw(0) - lw(0) - 0.6;
  k.liftDoor(f, pierIn - 0.12, 17.8, -Math.PI / 2, 1, { name: "Lift · Pilier Est" });
  k.label(f, "ASCENSEUR · LIFT", pierIn - 0.2, 3.3, 17.8, { h: 0.3, color: "#f4b728", rot: -Math.PI / 2 });
  const cabin = new THREE.Group();
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), std("#b8322a", 0.5, 0.3));
  cab.position.y = 1.2;
  const win = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.9, 2.42), k.glow("#ffe6b0", 1.0, 2.0));
  win.position.y = 1.5;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 2.6), k.brass);
  cap.position.y = 2.5;
  cabin.add(cab, win, cap);
  k.frame.add(cabin);
  const cabin2 = cabin.clone();
  k.frame.add(cabin2);
  const along = (sx: number, sz: number, t: number, out: THREE.Vector3) => {
    const y = 1.3 + t * 11;
    const c = hw(y) - lw(y) / 2;
    return out.set(sx * c, y, sz * c);
  };
  // the cabins ride their rails all the time, whichever floor you are on
  let tt = 0;
  const ride = (dt: number) => {
    tt += dt;
    const p = (Math.sin(tt * 0.18) + 1) / 2;
    along(1, 1, p, cabin.position);
    along(-1, -1, 1 - p, cabin2.position);
  };
  k.ticks.forEach((t) => t.push(ride));
  // rails up the east and west legs
  for (const [sx, sz] of [
    [1, 1],
    [-1, -1],
  ])
    for (const d of [-0.8, 0.8]) {
      const a = along(sx, sz, 0, new THREE.Vector3()),
        b = along(sx, sz, 1.1, new THREE.Vector3());
      k.beam("frame", a.clone().add(new THREE.Vector3(d * sz, 0, -d * sx)), b.clone().add(new THREE.Vector3(d * sz, 0, -d * sx)), 0.12, k.chrome);
    }

  // the stairs in the south pillar: flights zigzagging up inside the leg
  {
    const sx = -1,
      sz = 1;
    let y = 1.2,
      dir = 1;
    const tread = std("#4a3a30", 0.7, 0.4);
    while (y < 12.6) {
      const c = hw(y) - lw(y) / 2;
      const x0 = sx * c - 1.4 * dir,
        x1 = sx * c + 1.4 * dir;
      for (let s = 0; s < 8; s++) {
        const t = s / 8;
        k.slab("frame", 0.32, 0.05, 1, x0 + (x1 - x0) * t, y + s * 0.18, sz * c + dir * 0.55, tread);
      }
      k.beam("frame", new THREE.Vector3(x0, y, sz * c + dir * 0.55 + 0.5), new THREE.Vector3(x1, y + 1.44, sz * c + dir * 0.55 + 0.5), 0.05, k.ironDark);
      k.slab("frame", 1.1, 0.06, 2.2, x1, y + 1.44, sz * c, tread);
      y += 1.44;
      dir = -dir;
    }
    k.label(f, "ESCALIER · STAIRS", sx * (hw(0) - lw(0) - 0.65), 3.0, sz * 17.8, { h: 0.28, color: "#ffd28a", rot: Math.PI / 2 });
  }

  // ---- ticket booths at the foot of the east and south pillars -----------------------------------------
  const booth = (x: number, z: number, n: number) => {
    const body = new THREE.Group();
    body.position.set(x, 0, z);
    g.add(body);
    const wood = std("#2c3e30", 0.6, 0.2);
    const add = (w: number, h: number, d: number, px: number, py: number, pz: number, m: THREE.Material) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(px, py + h / 2, pz);
      body.add(b);
      return b;
    };
    add(3.6, 1.0, 2.2, 0, 0, 0, wood);
    add(3.6, 0.1, 2.3, 0, 1.0, 0.05, k.brass);
    add(3.4, 1.2, 0.04, 0, 1.1, 1.08, k.glass);
    for (const px of [-1.75, -0.6, 0.6, 1.75]) add(0.08, 1.3, 0.08, px, 1.0, 1.08, k.brass);
    add(3.6, 1.1, 2.2, 0, 1.0, -0.4, std("#e8e0d0", 0.8)).scale.set(1, 1, 0.6);
    add(3.9, 0.14, 2.6, 0, 2.3, 0, wood);
    const roof = add(3.6, 0.5, 2.3, 0, 2.44, 0, std("#1f3a2c", 0.5, 0.4));
    roof.scale.set(1, 1, 1);
    add(3.0, 0.32, 0.05, 0, 2.48, 1.17, std("#1a1418", 0.5));
    const sign = k.label(f, "BILLETS · TICKETS", x, 2.64, z + 1.2, { h: 0.24, color: "#f4b728" });
    void sign;
    const lamp = add(3.2, 0.05, 0.3, 0, 2.28, 0.9, k.glow("#fff0d0", 1.2, 2.2));
    void lamp;
    k.rects[f].push([x - 1.9, z - 1.2, x + 1.9, z + 1.2]);
    k.pick(f, roof, `<b>Billetterie ${n}</b><span>tickets</span>`, () => ({
      eyebrow: "Billetterie",
      title: "Tour Eiffel · tickets",
      stats: [
        ["Lift · summit", "€36.10"],
        ["Lift · 2nd", "€23.10"],
        ["Stairs · 2nd", "€14.50"],
        ["Block", k.height ? `#${k.height.toLocaleString("en-US")}` : "…"],
      ],
    }));
  };
  booth(9.2, 15.4, 1);
  booth(-9.2, 15.4, 2);
  void k.person(f, 1889, [9.2, 14.9], "Ticket", { title: "Ticket seller" });
  void k.person(f, 1887, [-9.2, 14.9], "Ticket", { title: "Ticket seller" });

  // the queue: posts and ropes snaking from the booth towards the entrance
  const qz = [17.4, 18.6, 19.8];
  queueLine(k, f, [
    [5.6, qz[0]],
    [12.6, qz[0]],
  ]);
  queueLine(
    k,
    f,
    [
      [6.6, qz[1]],
      [12.6, qz[1]],
    ],
    true,
  );
  queueLine(k, f, [
    [5.6, qz[2]],
    [11.6, qz[2]],
  ]);
  const queuers = [2101, 3402, 777, 5120, 6060, 4242, 909, 1312];
  queuers.forEach((id, i) => {
    const row = i < 3 ? 0 : i < 6 ? 1 : 2;
    const x = row === 1 ? 7.4 + (i - 3) * 1.4 : 7 + (i % 3) * 1.4;
    const z = row === 0 ? 16.8 : row === 1 ? 18.0 : 19.2;
    void k.person(f, id, [x + (row === 2 ? 0.6 : 0), z], i === 4 ? "Kid" : i === 2 ? "Couple" : "Visitor", { face: new THREE.Vector3(row === 1 ? 1 : -1, 0, 0), bob: i === 4 ? 3 : undefined });
  });
  // the lift attendant
  void k.person(f, 1890, [pierIn - 1.2, 16.2], "Lift", { title: "Lift attendant", face: new THREE.Vector3(1, 0, 0) });

  // ---- under the tower: benches, lamps, a guide with her flag, vendors ------------------------------------
  for (const [x, z, r] of [
    [-6, -21, 0],
    [6, -21, 0],
    [-23.5, -4, Math.PI / 2],
    [23.5, 4, -Math.PI / 2],
    [-23.5, 6, Math.PI / 2],
  ] as [number, number, number][])
    k.put(f, "eBench", F.bench, x, z, r);
  for (const [x, z] of [
    [-12, -23.5],
    [12, -23.5],
    [-23.5, -12],
    [23.5, -12],
    [-23.5, 12],
    [23.5, 12],
    [-4, 21.6],
    [12, 21.6],
  ] as [number, number][])
    parisLamp(k, f, x, z);
  // the guide and her group in the middle, on the compass rose
  void k.person(f, 1789, [0, -2], "Guide", { face: new THREE.Vector3(0, 0, 1) });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.34), new THREE.MeshBasicMaterial({ color: "#f4b728", side: THREE.DoubleSide }));
  flag.position.set(0.3, 2.6, -2);
  g.add(flag);
  k.slab(key, 0.03, 2.8, 0.03, 0.05, 0, -2, k.ironDark);
  [314, 2718, 1618, 1414, 4669].forEach((id, i) => {
    const a = -0.9 + i * 0.45;
    void k.person(f, id, [Math.sin(a) * 2.4, -2 + Math.cos(a) * 2.4], i === 3 ? "Kid" : "Visitor", { face: new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)) });
  });
  // a souvenir vendor with his cloth of little towers
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(2, 0.02, 1.2), std("#e8e0d0", 0.9));
  cloth.position.set(-14, 0.01, 4);
  g.add(cloth);
  const bronze = std("#8a6a3a", 0.4, 0.8),
    goldM = std("#d8b060", 0.3, 0.9);
  for (let i = 0; i < 12; i++) miniTower(k, key, -14.8 + (i % 6) * 0.32, 0.02, 3.7 + Math.floor(i / 6) * 0.5, 0.25 + (i % 3) * 0.08, i % 4 ? bronze : goldM);
  k.rects[f].push([-15.1, 3.3, -12.9, 4.7]);
  void k.person(f, 1066, [-14, 5.1], "Vendor", { title: "Souvenir seller", face: new THREE.Vector3(1, 0, 0) });
  // a few wandering visitors under the arches
  void k.person(f, 2020, [-6, 8], "Visitor", { wander: [[-6, 8], [6, 8], [0, -10], [-10, -8], [10, -6]] });
  void k.person(f, 3131, [10, -10], "Visitor", { wander: [[10, -10], [-8, -12], [0, 10], [8, 4]] });
  void k.person(f, 4004, [-10, -12], "Painter", { title: "Painter", face: new THREE.Vector3(1, 0, 0) });

  // light: warm under the platform, the booths, the lift door
  k.light(f, 0, 9, 0, "#ffd9a0", 14, 30);
  k.light(f, 9.2, 3.2, 15.4, "#fff0d0", 6, 10);
  k.light(f, -9.2, 3.2, 15.4, "#fff0d0", 6, 10);
  k.light(f, pierIn - 1, 3, 17.8, "#ffd28a", 5, 9);
}
