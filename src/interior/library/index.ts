import * as THREE from "three";
import { get } from "../../data/zscan";
import { sayAt } from "../../scene/speech";
import type { Theme } from "../../scene/theme";
import { ZScan } from "../../data/zscan";
import { makeScene } from "../kit";
import type { Interior, InteriorContext, PickInfo } from "../types";
import { buildAtrium } from "./atrium";
import { buildAuditorium, AUD } from "./auditorium";
import { buildCrowd } from "./crowd";
import { UPGRADES, WHISPERS, type Upgrade } from "./data";
import { AUD_Y, G_Y, LEN, Level, READ_Y, SPHERE, T1_Y, T2_Y, TIERS, ZIP_Y, frontAt, glow, gridRects, offset, pathAt, std, toPath, fmt, Quads, S0 } from "./kit";
import { buildReading } from "./reading";
import { buildShelves, reserved } from "./shelves";
import { buildSphere, porchBox } from "./sphere";
import { buildStairs, LIB_STAIR } from "./stairs";
import { buildZipArchive } from "./zips";

/**
 * The LIBRARY on the river, after Tianjin Binhai's "Eye": a white atrium whose terraced shelves
 * flow from the floor to the ceiling all round it, thousands of books in their recesses, and the
 * luminous sphere of the auditorium in the middle. G — the atrium, its steps full of readers, the
 * reading desks. 1 — the first terrace: the chain year by year, the network upgrades. 2 — the
 * second terrace: the papers behind Zcash, every ZIP (they open in the reader). 3 — the reading
 * room over the atrium: today's news. A — inside the sphere: the chain as a planetarium.
 * Z — the ZIP archive on the top floor: every ZIP as a numbered volume, by status, and the index.
 * G, 1 and 2 are one space: besides the lifts, a white stair climbs from the floor to both terraces.
 */
export function buildLibrary(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#e9e6df");
  const hemi = scene.children.find((o) => o instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
  const G = new Level(G_Y),
    T1 = new Level(T1_Y),
    T2 = new Level(T2_Y),
    RD = new Level(READ_Y),
    AU = new Level(AUD_Y),
    ZA = new Level(ZIP_Y);
  const levels = [G, T1, T2, RD, AU, ZA];
  /** Floors that are rooms of their own: the atrium is hidden there. */
  const solo = (n: number) => n === 4 || n === 5;
  for (const l of levels) scene.add(l.group);

  // ---- the shell, the sphere, the shelves ------------------------------------------------------------
  const atrium = buildAtrium(reserved);
  scene.add(atrium.group);
  const sphere = buildSphere();
  G.group.add(sphere.group);
  let ups: Upgrade[] = UPGRADES;
  const tip = () => ctx.director.blockHeight || 0;
  const shelves = buildShelves(T1, T2, tip);

  // parapets along the terraces' edges: a white wave with a warm line on top
  const para = new Quads(),
    paraLed = new Quads();
  // (open where the stairs' landing and bridge meet them)
  for (const [ti, gap] of [
    [4, LIB_STAIR.gapT1],
    [9, LIB_STAIR.gapT2],
  ] as const) {
    const t = TIERS[ti];
    const y = t.y0 + t.h;
    const cuts = [S0, gap[0], gap[1], LEN - S0];
    for (let s = S0, s2 = S0; s < LEN - S0 - 0.01; s = s2) {
      s2 = Math.min(LEN - S0, s + 0.5, cuts.find((c) => c > s + 0.001)!);
      if (s >= gap[0] - 0.001 && s < gap[1] - 0.001) continue;
      const a = frontAt(t, s, 0.02),
        b = frontAt(t, s2, 0.02);
      const ai = frontAt(t, s, 0.16),
        bi = frontAt(t, s2, 0.16);
      const P = (p: { x: number; z: number }, yy: number) => [p.x, yy, p.z];
      para.quad(P(a, y), P(b, y), P(b, y + 0.95), P(a, y + 0.95), 1);
      para.quad(P(ai, y), P(bi, y), P(bi, y + 0.95), P(ai, y + 0.95), 0.9);
      para.quad(P(a, y + 0.95), P(b, y + 0.95), P(bi, y + 0.95), P(ai, y + 0.95), 1);
      paraLed.quad(P(ai, y + 0.955), P(bi, y + 0.955), P(frontAt(t, s2, 0.1), y + 0.955), P(frontAt(t, s, 0.1), y + 0.955), 1);
    }
  }
  const paraMesh = new THREE.Mesh(para.geometry(), std("#f6f3ee", 0.55, 0, { vertexColors: true, side: THREE.DoubleSide }));
  const paraLedMesh = new THREE.Mesh(paraLed.geometry(), atrium.ledMat);
  paraMesh.raycast = paraLedMesh.raycast = () => {};
  atrium.group.add(paraMesh, paraLedMesh);

  // ---- readers on the steps: zkSNARKs from the collection ------------------------------------------------
  const spots: THREE.Vector3[] = [];
  {
    let a = 11;
    const R = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    for (const ti of [0, 1, 2, 3, 5, 6]) {
      const t = TIERS[ti];
      for (let s = 1.5; s < LEN - 1.5; s += 0.9 + R() * 2.4) {
        if (R() < 0.35) continue;
        // keep the steps by the sphere's porch and the lifts clear
        const f = frontAt(t, s, ti >= 5 ? 0.15 : 0.32);
        if (ti >= 5) continue;
        spots.push(new THREE.Vector3(f.x, t.y0 + t.h, f.z));
      }
    }
  }
  const crowd = buildCrowd(spots, 1777, 0.6);
  G.group.add(crowd.mesh);

  // ---- the ground floor: the info desk, reading desks, lamps ----------------------------------------------
  const deskWhite = std("#f7f5f0", 0.4),
    oak = std("#b08a5a", 0.5),
    lampGlow = glow("#ffe3b0", 1.8),
    dark = std("#2a2622", 0.5, 0.4);
  const gm = G.m;
  const desks: [number, number][] = [];
  for (const sx of [-1, 1])
    for (let k = 0; k < 3; k++) {
      desks.push([sx * 9.5, -7.5 - k * 4.6]);
      desks.push([sx * 9.5, -41.5 - k * 3.4]);
    }
  for (const [x, z] of desks) {
    gm.box(oak, 4.2, 0.06, 1.3, x, 0.74, z);
    gm.box(deskWhite, 4.0, 0.7, 0.12, x, 0.04, z);
    for (const lx of [-1.3, 1.3]) {
      gm.box(dark, 0.03, 0.42, 0.03, x + lx, 0.8, z);
      gm.box(lampGlow, 0.36, 0.04, 0.12, x + lx, 1.2, z);
      gm.box(dark, 0.42, 0.06, 0.18, x + lx, 1.24, z);
    }
    for (const sz of [-1, 1])
      for (const cx of [-1.2, 0, 1.2]) {
        gm.box(deskWhite, 0.44, 0.05, 0.44, x + cx, 0.44, z + sz * 0.95);
        gm.box(deskWhite, 0.44, 0.48, 0.05, x + cx, 0.47, z + sz * 1.17);
        gm.box(dark, 0.05, 0.44, 0.05, x + cx, 0, z + sz * 0.95);
      }
    // open books on the desks
    for (const bx of [-0.9, 0.6]) gm.box(std("#f2ecdc", 0.9), 0.4, 0.015, 0.28, x + bx, 0.8, z + (bx > 0 ? 0.25 : -0.25));
    G.rects.push([x - 2.15, z - 1.3, x + 2.15, z + 1.3]);
  }
  // the information desk: a white oval by the entrance
  {
    const ring = new THREE.Shape();
    ring.absellipse(0, 0, 2.6, 1.2, 0, Math.PI * 2, false, 0);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, 2.2, 0.85, 0, Math.PI * 2, true, 0);
    ring.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(ring, { depth: 1.05, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(-9.5, 0, -2.6 + 0.0);
    const top = new THREE.ExtrudeGeometry(ring, { depth: 0.05, bevelEnabled: false });
    top.rotateX(-Math.PI / 2);
    top.translate(-9.5, 1.05, -2.6);
    gm.add(deskWhite, g);
    gm.add(oak, top);
    G.rects.push([-12.2, -3.9, -6.8, -1.3]);
  }
  gm.flush(G.group);

  // ---- the terraces' lifts at the front corners, and their people -------------------------------------------
  const band = (lo: number, hi: number, s: number) => {
    const t1 = TIERS[lo],
      t0 = TIERS[hi];
    return (offset(t1, s) + offset(t0, s)) / 2;
  };
  const at = (lo: number, hi: number, s: number) => {
    const p = pathAt(s);
    const d = band(lo, hi, s);
    return { x: p.x + p.nx * d, z: p.z + p.nz * d };
  };
  const t1Spawn = at(5, 4, 1.8),
    t2Spawn = at(10, 9, 1.8);
  for (const [lv, lo, hi] of [
    [T1, 5, 4],
    [T2, 10, 9],
  ] as const) {
    // the lift doors on the front wall at both ends of the walkway
    for (const s of [0.4, LEN - 0.4]) {
      const c = at(lo, hi, s);
      lv.m.box(std("#b8a27a", 0.35, 0.7), 1.6, 2.3, 0.08, c.x, lv.y, -0.12);
      lv.m.box(std("#4a4038", 0.4, 0.5), 0.03, 2.3, 0.1, c.x, lv.y, -0.14);
      lv.m.box(glow("#ffd9a0", 1.4), 0.4, 0.06, 0.04, c.x, lv.y + 2.45, -0.18);
    }
    lv.m.flush(lv.group);
    // the walkway's walls: everything off the band
    lv.rects = gridRects(-30, -64, 30, 0, (x, z) => {
      if (z > -0.5) return true;
      const { s, d } = toPath(x, z);
      return !(d > offset(TIERS[lo], s) + 0.2 && d < offset(TIERS[hi], s) - 0.3);
    });
    // browsers along the shelves, readers sitting on the parapet's foot
    const ids = lv === T1 ? [3101, 1415, 9265, 3589, 7932] : [2384, 6264, 3383, 2795, 288];
    const roles = ["Reader", "Student", "Reader", "Researcher", "Reader"];
    ids.forEach((id, i) => {
      const s = 12 + (i * (LEN - 24)) / (ids.length - 1) + (i % 2 ? 2 : -2);
      const p = at(lo, hi, s);
      const wander: [number, number][] = [-6, -3, 3, 6].map((ds) => {
        const q = at(lo, hi, Math.max(2, Math.min(LEN - 2, s + ds)));
        return [q.x, q.z];
      });
      const out = pathAt(s);
      void lv.person(id, p.x, lv.y, p.z, roles[i], { lines: roles[i] === "Student" ? WHISPERS.student : WHISPERS.reader, wander, face: new THREE.Vector3(-out.nx, 0, -out.nz) });
    });
  }

  // ---- ground-floor people: the librarian, readers at the desks, visitors round the sphere --------------------
  void G.person(1337, -9.5, 0, -2.6, "Librarian", { lines: WHISPERS.librarian, face: new THREE.Vector3(0, 0, 1) });
  const seated: [number, number, number, number][] = [
    [0, 0, 1, 1],
    [1, 1, -1, 2],
    [2, 2, 1, 0],
    [4, 0, -1, 1],
    [5, 1, 1, 2],
    [6, 2, -1, 0],
    [9, 0, 1, 1],
    [11, 2, -1, 1],
  ];
  const readerIds = [808, 2718, 5150, 31, 4096, 6502, 1984, 7777];
  seated.forEach(([di, , sz, ci], i) => {
    const [x, z] = desks[di];
    const cx = [-1.2, 0, 1.2][ci];
    void G.person(readerIds[i], x + cx, 0, z + sz * 0.98, "Reader", { sit: true, face: new THREE.Vector3(0, 0, -sz), lines: WHISPERS.reader, near: 5 });
  });
  const ringPts: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    ringPts.push([SPHERE.x + Math.cos(a) * 11, SPHERE.z + Math.sin(a) * 11]);
  }
  for (const [id, k] of [
    [4321, 0],
    [1111, 3],
    [8888, 6],
  ])
    void G.person(id, ringPts[k][0], 0, ringPts[k][1], "Visitor", { lines: WHISPERS.student, wander: ringPts });

  // ground colliders: the steps, the sphere and its porch, the front wall
  const [px0, pz0, px1, pz1] = porchBox();
  const groundRects = gridRects(-30, -64, 30, 0, (x, z) => {
    if (z > -0.5) return true;
    const { s, d } = toPath(x, z);
    if (d < offset(TIERS[0], s) + 0.2) return true;
    if (Math.hypot(x - SPHERE.x, z - SPHERE.z) < 5.4) return true;
    return x > px0 && x < px1 && z > pz0 && z < pz1;
  });
  G.rects = [...groundRects, ...G.rects];
  // the stairs up to the terraces (walked: liftplan.ts), drawn with the atrium
  G.rects.push(...buildStairs(atrium.group, atrium.ledMat));

  // ---- the reading room and the auditorium -------------------------------------------------------------------
  buildReading(RD);
  RD.m.flush(RD.group);
  const aud = buildAuditorium(AU);
  AU.m.flush(AU.group);
  buildZipArchive(ZA);
  ZA.m.flush(ZA.group);

  // ---- lights -----------------------------------------------------------------------------------------------
  const atriumLights: THREE.PointLight[] = [];
  for (const [x, y, z] of [
    [0, 26, -12],
    [0, 26, -48],
    [-18, 20, -30],
  ]) {
    const l = new THREE.PointLight("#ffe6c4", 60, 70, 1.2);
    l.position.set(x, y, z);
    atrium.group.add(l);
    atriumLights.push(l);
  }

  // ---- picks on the ground floor: the sphere, its doors, the readers on the steps ------------------------------
  const sphereInfo = (): PickInfo => {
    const h = tip();
    const done = ups.filter((u) => u.activated && u.activation_height);
    const next = ups.find((u) => !u.activated);
    return {
      eyebrow: "THE EYE · AUDITORIUM",
      title: "The Sphere",
      tag: ["live", "ok"],
      stats: [
        ["Height", h ? `#${fmt(h)}` : "—"],
        ["Upgrades", String(done.length)],
        ["Current", done[done.length - 1]?.label ?? "—"],
        ["Next", next?.label ?? "—"],
      ],
      floor: 4,
    };
  };
  G.pick(sphere.shell, "<b>The Sphere</b><span>the auditorium · step inside</span>", sphereInfo);
  G.pick(sphere.door, "<b>Auditorium</b><span>step inside the sphere</span>", () => ({ eyebrow: "THE EYE", title: "Auditorium", floor: 4 }));
  G.pick(
    crowd.mesh,
    (hit) => (hit.instanceId !== undefined ? `<b>zkSNARK #${crowd.ids[hit.instanceId]}</b><span>reading on the steps</span>` : null),
    (hit) => (hit.instanceId !== undefined ? { eyebrow: "LIBRARY · READER", title: `zkSNARK #${crowd.ids[hit.instanceId]}`, mono: true, image: ZScan.zkSnarkImage(crowd.ids[hit.instanceId]) } : null),
  );
  AU.pick(
    aud.crowd.mesh,
    (hit) => (hit.instanceId !== undefined ? `<b>zkSNARK #${aud.crowd.ids[hit.instanceId]}</b><span>in the auditorium</span>` : null),
    (hit) => (hit.instanceId !== undefined ? { eyebrow: "AUDITORIUM", title: `zkSNARK #${aud.crowd.ids[hit.instanceId]}`, mono: true, image: ZScan.zkSnarkImage(aud.crowd.ids[hit.instanceId]) } : null),
  );

  // ---- live: upgrades, blocks -------------------------------------------------------------------------------
  void get<{ upgrades: Upgrade[] }>("/v1/upgrades").then((r) => {
    if (r?.upgrades?.length) ups = r.upgrades;
    aud.redraw(tip(), ups);
  });
  aud.redraw(tip(), ups);
  ctx.onBlock((h) => {
    sphere.pulse();
    aud.redraw(h, ups);
    // someone on the steps near you notices
    whisper(`Block ${fmt(h)}.`);
  });

  /** A whisper from a reader on the steps the walker can see. */
  const look = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const whisper = (text: string) => {
    if (floor > 2 || !crowd.spots.length) return;
    let best: THREE.Vector3 | null = null;
    for (let k = 0; k < 40; k++) {
      const p = crowd.spots[Math.floor(Math.random() * crowd.spots.length)];
      const dx = p.x - eye.x,
        dz = p.z - eye.z,
        d = Math.hypot(dx, dz);
      if (d > 3 && d < 16 && (dx * look.x + dz * look.z) / d > 0.6) {
        best = p;
        break;
      }
    }
    if (!best) return;
    const anchor = new THREE.Group();
    anchor.position.copy(best);
    G.group.add(anchor);
    sayAt(anchor, text, "talk", 0.75, 3.2, 0.6);
    setTimeout(() => G.group.remove(anchor), 3800);
  };
  let ambient = 6;

  // ---- floors and theme ---------------------------------------------------------------------------------------
  let floor = 0;
  let theme: Theme = ctx.theme;
  const applyTheme = () => {
    const night = theme === "night";
    const inAud = floor === 4;
    const inZips = floor === 5;
    hemi.intensity = inAud ? 0.25 : night ? 0.42 : 0.62;
    hemi.color.set(night ? "#fff1dc" : "#ffffff");
    hemi.groundColor.set(night ? "#3a3026" : "#bdb6aa");
    scene.environmentIntensity = inAud ? 0.1 : night ? 0.22 : 0.32;
    for (const l of atriumLights) l.intensity = night ? 60 : 45;
    atrium.ledMat.color.set("#ffe0b0").multiplyScalar(night ? 1.7 : 1.15);
    sphere.uniforms.uNight.value = night ? 1 : 0.35;
    const v = inAud || inZips ? null : ctx.cityView("library", 8, 6);
    scene.background = v ?? new THREE.Color(inAud ? "#05060c" : inZips ? "#2a241c" : night ? "#0b0a14" : "#cfe2f2");
  };
  const setFloor = (n: number) => {
    floor = n;
    atrium.group.visible = !solo(n);
    levels.forEach((l, i) => {
      l.group.visible = solo(n) ? i === n : !solo(i);
      l.here = i === n;
    });
    applyTheme();
  };
  setFloor(0);

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  return {
    key: "library",
    title: "LIBRARY",
    scene,
    floors: [
      { label: "G", name: "Atrium · the sphere, the reading desks", y: G_Y, spawn: new THREE.Vector3(0, G_Y, -2.2), yaw: 0 },
      { label: "1", name: "Terrace I · the chain by year, network upgrades", y: T1_Y, spawn: new THREE.Vector3(t1Spawn.x, T1_Y, t1Spawn.z), yaw: 0 },
      { label: "2", name: "Terrace II · the papers, the ZIPs by status", y: T2_Y, spawn: new THREE.Vector3(t2Spawn.x, T2_Y, t2Spawn.z), yaw: 0 },
      { label: "3", name: "Reading room · THE ZCASH TIMES, live news", y: READ_Y, spawn: new THREE.Vector3(0, READ_Y, -78), yaw: Math.PI },
      { label: "A", name: "Auditorium · inside the sphere", y: AUD_Y, spawn: new THREE.Vector3(AUD.cx, AUD_Y, AUD.cz + 5.6), yaw: 0 },
      { label: "Z", name: "ZIP Archive · every Zcash Improvement Proposal", y: ZIP_Y, spawn: new THREE.Vector3(0, ZIP_Y, -68.2), yaw: 0 },
    ],
    colliders: (f) => levels[f].rects,
    setFloor,
    setTheme: (t) => {
      theme = t;
      applyTheme();
    },
    pickables: () => {
      const out = [...levels[floor].picks.keys()];
      // the sphere and the readers on the steps can be clicked from the terraces too
      if (floor === 1 || floor === 2) out.push(sphere.shell, crowd.mesh);
      return out;
    },
    pick(hit) {
      const p = levels[floor].find(hit.object) ?? G.find(hit.object);
      return p ? p.info(hit) : null;
    },
    hover(hit) {
      const p = levels[floor].find(hit.object) ?? G.find(hit.object);
      if (!p) return null;
      return typeof p.hover === "string" ? p.hover : p.hover(hit);
    },
    update(dt, t, camera) {
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      eye.copy(camera.position);
      look.set(0, 0, -1).applyQuaternion(camQuat).setY(0).normalize();
      const inAud = floor === 4;
      for (const l of levels) {
        l.eye.copy(camera.position);
        if (!l.group.visible) continue;
        for (const s of l.people) s.update(dt, t, camQuat, camRight);
        for (const k of l.ticks) k(dt, t);
      }
      if (inAud) aud.crowd.tick(dt);
      else if (floor === 5) {
        /* the archive: its readers only */
      } else {
        sphere.tick(dt);
        crowd.tick(dt);
        shelves.tick();
        ambient -= dt;
        if (ambient < 0) {
          ambient = 10 + Math.random() * 12;
          if (Level.quiet()) whisper(WHISPERS.reader[Math.floor(Math.random() * WHISPERS.reader.length)]);
        }
      }
    },
  };
}
