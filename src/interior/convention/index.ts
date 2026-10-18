import * as THREE from "three";
import { loadArt, poseCell, Snark } from "../../scene/snark";
import { FLASH_CELL } from "../../scene/sprites";
import { box, makeScene, std } from "../kit";
import { buildAudience, type Seat } from "../opera/crowd";
import type { Interior, InteriorContext, PickInfo, Rect } from "../types";
import { lineup, roadster } from "./vehicles";

const MONO = '"JetBrains Mono", Menlo, monospace';
const SANS = "Roboto, Inter, sans-serif";
const RED = "#ff2a3a";
const ICE = "#dff3ff";

/** One show, then the interval (seconds). The show runs on its own clock from the first visit. */
const SHOW = 92;
const INTERVAL = 22;
const CYCLE = SHOW + INTERVAL;

/** The arena (metres): stage at the far end, the track down the middle, stands either side. */
const H = { x0: -32, x1: 32, z0: -122, z1: 16, h: 28 };
const STAGE = { x0: -24, x1: 24, z0: -122, z1: -94, y: 1.4 };
const TURN = { x: 0, z: -104, r: 3.4, y: STAGE.y + 0.25 };
const TRACK = { half: 5, z0: -92, z1: 1 };
const LOOP = { z: -52, R: 6.5, off: 2.6 };
/** The row of cars it flies over: centre lines along z. */
const ROW = [-12, -15.6, -19.4, -23.4, -28.6];
const LIFT_Z = -38;
const LAND_Z = -8;
const START_Z = -88;
/** The VIP terrace you come in on, over the end of the track; stairs down to the aisles. */
const TERR = { z: 3, y: 3.6, stair: [5.5, 8.2] as const, run: 6 };

const sound = (name: string, arg?: unknown) => window.dispatchEvent(new CustomEvent("zstreet:sound", { detail: { name, arg } }));
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function canvasTex(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, g: c.getContext("2d")!, t };
}

function softDot(rgba: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, rgba);
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * THE ZEC CONVENTION CENTER: the zkCar reveal, after Tesla's of 15 October 2026 (the white
 * roadster that drove up an inverted ramp on its air thrusters, spun in the air and flew over a
 * row of cars). An arena: thousands of zkSNARKs in the stands either side of a track that runs from
 * the stage to the pit where you stand, a giant screen behind the stage, beams sweeping from the
 * rig.
 *
 * The show, every two minutes: the countdown, the presenter, the drum roll, the cover flies off in
 * smoke and lasers and the hall stands up, phones flashing; the zkCar drives off the turntable,
 * waits under the start lights and launches (0–60 mph in 0.81 s, timed on the screen), goes round
 * the loop upside down, its thrusters holding it to the track, then lifts off, spins full circle in
 * the air over the robotaxi, two saloons, the pickup and the semi, and lands in front of you; the
 * ovation, confetti, then it turns on the spot on its jets and drives back to the stage.
 */
export function buildConvention(ctx: InteriorContext): Interior {
  void ctx;
  const scene = makeScene(ctx.renderer, "#050508");
  scene.environmentIntensity = 0.25;
  const hemi = scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
  const rects: Rect[] = [];
  const picks = new Map<THREE.Object3D, PickInfo>();
  const hovers = new Map<THREE.Object3D, string>();
  const pickables: THREE.Object3D[] = [];
  const pickable = (o: THREE.Object3D, info: PickInfo, hover: string) =>
    o.traverse((m) => {
      if (!(m as THREE.Mesh).isMesh) return;
      picks.set(m, info);
      hovers.set(m, hover);
      pickables.push(m);
    });
  const camPos = new THREE.Vector3();
  const v = new THREE.Vector3();

  // ---- the shell: black walls, a red LED line round them, the rig overhead -------------------------
  const floorM = std("#16171b", 0.55, 0.2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0, H.z1 - H.z0), floorM);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (H.z0 + H.z1) / 2);
  scene.add(floor);
  const wallM = std("#0c0d11", 0.8, 0.1);
  const redLine = new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(1.6), toneMapped: false });
  for (const [x, z, w, d] of [
    [H.x0, (H.z0 + H.z1) / 2, 0.4, H.z1 - H.z0],
    [H.x1, (H.z0 + H.z1) / 2, 0.4, H.z1 - H.z0],
    [0, H.z0, H.x1 - H.x0, 0.4],
    [0, H.z1, H.x1 - H.x0, 0.4],
  ] as const) {
    box(scene, w, H.h, d, wallM, x, 0, z);
    rects.push([x - w / 2 - 0.1, z - d / 2 - 0.1, x + w / 2 + 0.1, z + d / 2 + 0.1]);
    for (const y of [H.h - 3, 9]) box(scene, w === 0.4 ? 0.42 : w, 0.08, d === 0.4 ? 0.42 : d, redLine, x, y, z);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0, H.z1 - H.z0), std("#060608", 0.95));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, H.h, (H.z0 + H.z1) / 2);
  scene.add(ceil);
  const truss = std("#2a2c31", 0.4, 0.8);
  for (let z = H.z0 + 8; z < H.z1; z += 12) box(scene, H.x1 - H.x0, 0.6, 0.6, truss, 0, H.h - 4, z);
  for (const x of [-12, 12]) box(scene, 0.6, 0.6, H.z1 - H.z0, truss, x, H.h - 4.6, (H.z0 + H.z1) / 2);

  // house lights (up for the interval, down for the show)
  const house: THREE.PointLight[] = [];
  for (const [x, z] of [
    [-18, -70],
    [18, -70],
    [-18, -30],
    [18, -30],
    [0, 6],
  ] as const) {
    const l = new THREE.PointLight("#ffe7cc", 260, 60, 1.6);
    l.position.set(x, H.h - 5, z);
    scene.add(l);
    house.push(l);
  }

  // ---- the stands: twelve tiers each side, the crowd from the collection ----------------------------
  const ROWS = 12;
  const tierM = std("#1c1d22", 0.75, 0.1);
  const seats: Seat[] = [];
  for (const side of [-1, 1]) {
    for (let r = 0; r < ROWS; r++) {
      const x = side * (8.8 + r * 1.0);
      const y = 0.5 + r * 0.55;
      box(scene, 1.0, y, 84, tierM, x, 0, -46);
      box(scene, 1.0, 0.03, 84, r % 3 ? std("#26272d", 0.7) : new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(0.7), toneMapped: false }), x, y, -46);
      for (let z = -87.5; z < -4.5; z += 0.64) seats.push({ x, y, z: z + (r % 2) * 0.32, rot: side < 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
    rects.push(side < 0 ? [H.x0, -88.5, -8.2, -3.6] : [8.2, -88.5, H.x1, -3.6]);
  }
  const crowd = buildAudience(scene, seats, 2026, 0.93);
  crowd.uniforms.uLight.value = 0.75;

  // phone flashes all over the stands
  const FLASHES = 360;
  const flashAt = Array.from({ length: FLASHES }, (_, i) => crowd.seats[Math.floor((i * 7919) % crowd.seats.length)]);
  const flashPos = new Float32Array(FLASHES * 3).fill(-100);
  const flashGeo = new THREE.BufferGeometry();
  flashGeo.setAttribute("position", new THREE.BufferAttribute(flashPos, 3));
  const flashPts = new THREE.Points(flashGeo, new THREE.PointsMaterial({ map: softDot("rgba(255,255,255,1)"), color: new THREE.Color(2.4, 2.4, 2.6), size: 1.1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  flashPts.frustumCulled = false;
  scene.add(flashPts);
  const flashOff = new Float32Array(FLASHES);
  const flashNext = Float32Array.from({ length: FLASHES }, () => Math.random() * 4);

  // ---- the track: black, white edges, the red centre line; barriers with an LED strip ---------------
  const trackLen = TRACK.z1 - TRACK.z0;
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(TRACK.half * 2, trackLen), std("#0b0b0d", 0.35, 0.3));
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(0, 0.01, (TRACK.z0 + TRACK.z1) / 2);
  scene.add(asphalt);
  const white = new THREE.MeshBasicMaterial({ color: "#d8dadd" });
  for (const x of [-TRACK.half + 0.3, TRACK.half - 0.3]) box(scene, 0.12, 0.005, trackLen, white, x, 0.012, (TRACK.z0 + TRACK.z1) / 2);
  for (let z = TRACK.z0 + 2; z < TRACK.z1 - 1; z += 4) box(scene, 0.14, 0.005, 2, new THREE.MeshBasicMaterial({ color: RED }), 0, 0.012, z);
  box(scene, TRACK.half * 2, 0.006, 0.5, white, 0, 0.012, START_Z); // the start line
  const barrierM = std("#24262b", 0.5, 0.4);
  const ledM = new THREE.MeshBasicMaterial({ color: new THREE.Color(ICE).multiplyScalar(1.2), toneMapped: false });
  for (const side of [-1, 1]) {
    const x = side * (TRACK.half + 0.2);
    box(scene, 0.35, 1.0, trackLen - 2, barrierM, x, 0, (TRACK.z0 + TRACK.z1) / 2 - 1);
    box(scene, 0.37, 0.05, trackLen - 2, ledM, x, 0.7, (TRACK.z0 + TRACK.z1) / 2 - 1);
    rects.push([x - 0.25, TRACK.z0, x + 0.25, TRACK.z1 - 1.5]);
  }
  // the pit's barrier and its glass, where the roadster stops nose to the crowd
  box(scene, TRACK.half * 2 + 0.7, 1.0, 0.35, barrierM, 0, 0, TRACK.z1);
  const glassM = new THREE.MeshPhysicalMaterial({ color: "#a9c8d8", transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0, depthWrite: false });
  box(scene, TRACK.half * 2 + 0.7, 1.4, 0.04, glassM, 0, 1.0, TRACK.z1);
  rects.push([-TRACK.half - 0.4, TRACK.z1 - 0.3, TRACK.half + 0.4, TRACK.z1 + 0.3]);

  // the VIP terrace: you look down the whole track from it, the roadster lands below it
  {
    const deck = std("#141519", 0.5, 0.3);
    box(scene, H.x1 - H.x0, TERR.y, H.z1 - TERR.z, deck, 0, 0, (TERR.z + H.z1) / 2);
    const [a, b] = TERR.stair;
    for (const sx of [-1, 1]) {
      const n = 9;
      for (let k = 0; k < n; k++) box(scene, b - a, ((k + 1) / n) * TERR.y, TERR.run / n, deck, sx * (a + b) / 2, 0, TERR.z - TERR.run + (k + 0.5) * (TERR.run / n));
      for (const x of [a, b]) {
        box(scene, 0.08, 1.0, TERR.run, std("#3a3d44", 0.3, 0.8), sx * x, TERR.y / 2, TERR.z - TERR.run / 2);
        rects.push([sx * x - 0.12, TERR.z - TERR.run, sx * x + 0.12, TERR.z]);
      }
    }
    // the railing: glass and an LED line, open at the stairs
    for (const [x0, x1] of [
      [H.x0, -b],
      [-a, a],
      [b, H.x1],
    ] as const) {
      box(scene, x1 - x0, 1.1, 0.04, glassM, (x0 + x1) / 2, TERR.y, TERR.z);
      box(scene, x1 - x0, 0.05, 0.08, redLine, (x0 + x1) / 2, TERR.y + 1.1, TERR.z);
      rects.push([x0, TERR.z - 0.2, x1, TERR.z + 0.2]);
    }
  }

  // the start gantry: five lights, red one by one, then green
  const gantry = new THREE.Group();
  gantry.position.set(0, 0, START_Z + 1.2);
  box(gantry, 0.3, 6, 0.3, truss, -TRACK.half - 0.6, 0, 0);
  box(gantry, 0.3, 6, 0.3, truss, TRACK.half + 0.6, 0, 0);
  box(gantry, TRACK.half * 2 + 1.5, 0.8, 0.5, std("#111216", 0.5), 0, 5.6, 0);
  const startLights: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshBasicMaterial({ color: "#200608", toneMapped: false });
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), m);
    l.position.set(-2.4 + i * 1.2, 6.0, 0.26);
    gantry.add(l);
    startLights.push(m);
  }
  scene.add(gantry);

  // ---- the loop: a ring of track 13 m high, slewed sideways, LED edges, on its pylons ---------------
  const loopPos = (th: number, r = LOOP.R) => v.set(-LOOP.off + (2 * LOOP.off * th) / (Math.PI * 2), LOOP.R - r * Math.cos(th), LOOP.z + r * Math.sin(th));
  {
    const segM = std("#1a1b1f", 0.45, 0.6);
    const edgeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(2), toneMapped: false });
    const N = 72;
    const segLen = ((Math.PI * 2 * (LOOP.R + 0.15)) / N) * 1.08;
    const seg = new THREE.BoxGeometry(3.4, 0.25, segLen);
    const edge = new THREE.BoxGeometry(0.08, 0.1, segLen);
    const segs = new THREE.InstancedMesh(seg, segM, N);
    const edges = new THREE.InstancedMesh(edge, edgeM, N * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < N; i++) {
      const th = ((i + 0.5) / N) * Math.PI * 2;
      const p = loopPos(th, LOOP.R + 0.13).clone();
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -th);
      segs.setMatrixAt(i, m.compose(p, q, one));
      for (const [k, sx] of [
        [0, -1.72],
        [1, 1.72],
      ] as const) {
        const pe = loopPos(th, LOOP.R - 0.02).clone();
        pe.x += sx;
        edges.setMatrixAt(i * 2 + k, m.compose(pe, q, one));
      }
    }
    segs.raycast = edges.raycast = () => {};
    scene.add(segs, edges);
    // pylons either side, a crossbeam over the top
    for (const sx of [-1, 1]) {
      const x = sx * (LOOP.off + 2.6);
      for (const dz of [-4.5, 4.5]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, LOOP.R * 2 + 2, 0.4), truss);
        leg.position.set(x, LOOP.R + 1, LOOP.z + dz * 0.5);
        leg.rotation.x = dz > 0 ? -0.18 : 0.18;
        scene.add(leg);
      }
    }
    box(scene, (LOOP.off + 2.6) * 2 + 0.4, 0.4, 0.5, truss, 0, LOOP.R * 2 + 1.6, LOOP.z);
    const sign = canvasTex(1024, 160);
    sign.g.fillStyle = "#0a0a0c";
    sign.g.fillRect(0, 0, 1024, 160);
    sign.g.fillStyle = "#ffffff";
    sign.g.font = `900 96px ${SANS}`;
    sign.g.textAlign = "center";
    sign.g.textBaseline = "middle";
    sign.g.fillText("THE LOOP", 512, 84);
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.0), new THREE.MeshBasicMaterial({ map: sign.t, toneMapped: false }));
    sm.position.set(0, LOOP.R * 2 + 2.6, LOOP.z + 0.3);
    scene.add(sm);
  }

  // ---- the row it flies over ---------------------------------------------------------------------
  lineup().forEach((c, i) => {
    c.group.rotation.y = i % 2 ? -Math.PI / 2 : Math.PI / 2;
    c.group.position.set(0, 0, ROW[i]);
    scene.add(c.group);
    pickable(c.group, { eyebrow: "THE ROW", title: c.name, body: "<p>Parked across the track. The zkCar flies over all five of them.</p>" }, c.name);
  });

  // ---- the stage: a black deck, the turntable, the screen ------------------------------------------
  box(scene, STAGE.x1 - STAGE.x0, STAGE.y, STAGE.z1 - STAGE.z0, std("#0e0f12", 0.4, 0.3), 0, 0, (STAGE.z0 + STAGE.z1) / 2);
  box(scene, STAGE.x1 - STAGE.x0, 0.06, 0.1, redLine, 0, STAGE.y - 0.3, STAGE.z1 + 0.02);
  rects.push([STAGE.x0, STAGE.z0, -3.2, STAGE.z1], [3.2, STAGE.z0, STAGE.x1, STAGE.z1]);
  // the ramp down to the track
  {
    const len = TRACK.z0 - STAGE.z1;
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, Math.hypot(Math.abs(len) + 2, STAGE.y)), std("#121316", 0.4, 0.3));
    ramp.position.set(0, STAGE.y / 2, (STAGE.z1 + TRACK.z0) / 2);
    ramp.rotation.x = -Math.atan2(STAGE.y, Math.abs(len) + 2);
    scene.add(ramp);
  }
  const turntable = new THREE.Group();
  turntable.position.set(TURN.x, STAGE.y, TURN.z);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(TURN.r, TURN.r, 0.25, 64), std("#1a1b1f", 0.2, 0.8));
  disc.position.y = 0.125;
  turntable.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(TURN.r, 0.05, 6, 80), new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(2), toneMapped: false }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.26;
  turntable.add(ring);
  scene.add(turntable);

  const SCREEN = { w: 52, h: 15.5, y: 4.2 };
  const screen = canvasTex(2048, 610);
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), new THREE.MeshBasicMaterial({ map: screen.t, toneMapped: false, color: new THREE.Color(0.82, 0.82, 0.82) }));
  screenMesh.position.set(0, SCREEN.y + SCREEN.h / 2, H.z0 + 0.4);
  scene.add(screenMesh);
  box(scene, SCREEN.w + 0.8, SCREEN.h + 0.8, 0.3, std("#08080a", 0.6), 0, SCREEN.y - 0.4, H.z0 + 0.15);
  pickable(screenMesh, { eyebrow: "CONVENTION CENTER", title: "The zkCar reveal", tag: ["EVERY 2 MINUTES", "info"], body: "<p>After Tesla's reveal of 15 October 2026 at a SpaceX test site in Texas: the white roadster drove up an inverted ramp on ten air thrusters (600 litres of compressed air), spun in the air and jumped a row of Tesla vehicles. Production is planned for 2028.</p>" }, "The show");

  // ---- the roadster, under its silk cover ----------------------------------------------------------
  const car = roadster();
  scene.add(car.group);
  pickable(
    car.group,
    {
      eyebrow: "THE REVEAL",
      title: "zkCar",
      tag: ["FLIGHT MODE", "ok"],
      stats: [
        ["0–60 mph", "0.81 s"],
        ["Top speed", "230+ mph"],
        ["Thrusters", "10"],
        ["Production", "2028"],
      ],
      body: "<p>Ten nozzles fed by 600 litres of compressed air lift it, spin it and hold it to the loop; a compressor refills the tank. \"This will be the actual car that's on the roads.\"</p>",
    },
    "The zkCar",
  );
  const silkM = new THREE.MeshStandardMaterial({ color: "#8a0c16", roughness: 0.45, metalness: 0.1, transparent: true });
  const silk = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), silkM);
  silk.scale.set(1.4, 1.45, 2.7);
  scene.add(silk);

  // ---- light: beams from the rig, the stage key, the lasers, smoke ---------------------------------
  const beamGeo = new THREE.ConeGeometry(2.6, 24, 24, 1, true).translate(0, -12, 0);
  const beams: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; ph: number }[] = [];
  for (const z of [-80, -64, -48, -32, -16]) {
    for (const x of [-12, 12]) {
      const mat = new THREE.MeshBasicMaterial({ map: softDot("rgba(255,255,255,0.5)"), color: new THREE.Color(ICE), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const m = new THREE.Mesh(beamGeo, mat);
      m.position.set(x, H.h - 4.6, z);
      m.raycast = () => {};
      scene.add(m);
      beams.push({ m, mat, ph: x * 0.1 + z * 0.05 });
    }
  }
  const key = new THREE.SpotLight("#ffffff", 0, 60, 0.32, 0.5, 1.2);
  key.position.set(0, H.h - 5, TURN.z + 14);
  key.target.position.set(TURN.x, STAGE.y, TURN.z);
  scene.add(key, key.target);
  const follow = new THREE.SpotLight("#fff2e0", 0, 70, 0.22, 0.6, 1.1);
  follow.position.set(0, H.h - 5, -40);
  scene.add(follow, follow.target);
  const carLight = new THREE.PointLight("#dff3ff", 0, 18, 1.5);
  scene.add(carLight);

  const laserGeo = new THREE.BoxGeometry(0.035, 0.035, 60).translate(0, 0, 30);
  const lasers: THREE.Mesh[] = [];
  const laserM = new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const sx of [-1, 1])
    for (let i = 0; i < 8; i++) {
      const l = new THREE.Mesh(laserGeo, laserM);
      l.position.set(sx * 20, STAGE.y + 0.4, STAGE.z1 - 2);
      l.userData = { sx, i };
      l.visible = false;
      l.raycast = () => {};
      scene.add(l);
      lasers.push(l);
    }

  // puffs: the reveal's smoke, the thrusters' air
  const puffTex = softDot("rgba(235,240,248,0.85)");
  const puffs: { s: THREE.Sprite; vel: THREE.Vector3; life: number; max: number; grow: number; alpha: number }[] = [];
  for (let i = 0; i < 140; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false;
    scene.add(s);
    puffs.push({ s, vel: new THREE.Vector3(), life: 0, max: 1, grow: 1, alpha: 0.4 });
  }
  let puffI = 0;
  const puff = (p: THREE.Vector3, vel: THREE.Vector3, size: number, life: number, grow = 3, alpha = 0.4) => {
    const q = puffs[puffI++ % puffs.length];
    q.alpha = alpha;
    q.s.position.copy(p);
    q.s.scale.setScalar(size);
    q.vel.copy(vel);
    q.life = 0;
    q.max = life;
    q.grow = grow;
    q.s.visible = true;
  };

  // confetti over the track after the landing
  const CONF = 700;
  const confPos = new Float32Array(CONF * 3).fill(-100);
  const confCol = new Float32Array(CONF * 3);
  const palette = [RED, "#ffffff", "#f4b728", ICE].map((c) => new THREE.Color(c).multiplyScalar(1.6));
  for (let i = 0; i < CONF; i++) confCol.set([palette[i % 4].r, palette[i % 4].g, palette[i % 4].b], i * 3);
  const confGeo = new THREE.BufferGeometry();
  confGeo.setAttribute("position", new THREE.BufferAttribute(confPos, 3));
  confGeo.setAttribute("color", new THREE.BufferAttribute(confCol, 3));
  const confPts = new THREE.Points(confGeo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, toneMapped: false }));
  confPts.frustumCulled = false;
  scene.add(confPts);
  let confOn = false;
  const confetti = () => {
    confOn = true;
    for (let i = 0; i < CONF; i++) confPos.set([(Math.random() - 0.5) * 30, H.h - 5 + Math.random() * 3, -40 + Math.random() * 44], i * 3);
  };

  // ---- people: the presenter, the pit crowd with their phones, security ----------------------------
  const people: Snark[] = [];
  const pitFlashes: { m: THREE.Mesh; next: number; off: number }[] = [];
  const flashTex = softDot("rgba(255,255,255,1)");
  const pitFlashGeo = new THREE.PlaneGeometry(0.9, 0.9);
  const pitFlashMat = new THREE.MeshBasicMaterial({ map: flashTex, color: new THREE.Color(2.2, 2.2, 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  let presenter: Snark | null = null;
  const spawn = async (id: number, role: string, x: number, z: number, o: { y?: number; face?: [number, number]; cap?: boolean; phone?: "snap" | "selfie" } = {}) => {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      s.root.position.set(x, o.y ?? 0, z);
      if (o.face) s.faceDir = new THREE.Vector3(o.face[0] - x, 0, o.face[1] - z).normalize();
      if (o.cap) s.setCap("#111111");
      if (o.phone) {
        s.carry = o.phone;
        s.redrawHold();
        const cell = FLASH_CELL[o.phone];
        if (cell) {
          const fl = new THREE.Mesh(pitFlashGeo, pitFlashMat);
          fl.position.copy(poseCell(cell[0], cell[1])).setZ(0.06);
          fl.visible = false;
          fl.raycast = () => {};
          s.attachToHold(fl);
          pitFlashes.push({ m: fl, next: Math.random() * 3, off: 0 });
        }
      }
      scene.add(s.root);
      people.push(s);
      return s;
    } catch {
      return null;
    }
  };
  void spawn(1, "Presenter", -14, -112, { y: STAGE.y, face: [0, 0] }).then((s) => (presenter = s));
  // the pit: two rows along the glass, nearly every phone up
  const PIT = [3311, 5120, 808, 4444, 2718, 6021, 9090, 1618, 7007, 3690, 5432, 2112, 8118, 4242, 6660, 1999];
  PIT.forEach((id, i) => {
    const side = i % 2 ? 1 : -1;
    const k = Math.floor(i / 2);
    const x = side * (9 + (k % 4) * 1.1 + (k >= 4 ? 0.55 : 0));
    void spawn(id, "Fan", x, TERR.z + 0.6 + (k >= 4 ? 0.9 : 0), { y: TERR.y, face: [x * 0.6, -20], phone: i % 6 === 4 ? "selfie" : "snap" }).then((s) => {
      if (s && i % 6 === 4) s.faceDir = new THREE.Vector3(0, 0, 1);
    });
  });
  void spawn(7777, "Security", -4.8, TERR.z + 0.7, { y: TERR.y, cap: true, face: [0, -10] });
  void spawn(8888, "Security", 4.8, TERR.z + 0.7, { y: TERR.y, cap: true, face: [0, -10] });
  void spawn(4321, "Stage manager", 18, -97, { y: STAGE.y, face: [0, -97] });

  // ---- the screen ----------------------------------------------------------------------------------
  let screenAt = -1;
  function drawScreen(tau: number, speed: number, alt: number) {
    const g = screen.g;
    const W = 2048,
      Hh = 610;
    g.fillStyle = "#050507";
    g.fillRect(0, 0, W, Hh);
    g.textAlign = "center";
    g.textBaseline = "middle";
    const big = (text: string, size: number, color = "#ffffff", y = Hh / 2, weight = 900) => {
      g.fillStyle = color;
      g.font = `${weight} ${size}px ${SANS}`;
      g.fillText(text, W / 2, y, W - 120);
    };
    const small = (text: string, y: number, color = "#9aa0a8", size = 46) => {
      g.fillStyle = color;
      g.font = `600 ${size}px ${MONO}`;
      g.fillText(text, W / 2, y, W - 120);
    };
    if (tau < 0) {
      const s = Math.ceil(-tau);
      big("zkCAR", 240, "#ffffff", 230);
      small(`NEXT SHOW IN 0:${String(s).padStart(2, "0")}`, 420, RED, 64);
      small("0–60 MPH IN 0.81 S · 230+ MPH · FLIGHT MODE", 520);
    } else if (tau < 6) {
      const n = Math.max(1, 5 - Math.floor(tau));
      big(String(n), 480, tau % 1 < 0.5 ? "#ffffff" : RED);
    } else if (tau < 21) {
      big("TONIGHT", 90, "#9aa0a8", 160, 600);
      big("zkCAR", 280, `rgba(255,255,255,${0.15 + 0.1 * Math.sin(tau * 3)})`, 360);
    } else if (tau < 36) {
      big("zkCAR", 320, "#ffffff", 270);
      small('"THIS WILL BE THE ACTUAL CAR THAT\'S ON THE ROADS"', 500, "#c9ced6", 50);
    } else if (tau < 39.5) {
      const t = Math.max(0, Math.min(0.81, tau - 36));
      big(tau < 36 ? "READY" : `${t.toFixed(2)} s`, 300, t >= 0.81 ? RED : "#ffffff", 260);
      small(`0–60 MPH · ${Math.round(speed * 2.237)} MPH`, 500, "#ffffff", 70);
    } else if (tau < 45) {
      big("THE LOOP", 250, "#ffffff", 240);
      small("UPSIDE DOWN · 10 THRUSTERS · 600 L OF AIR", 470, ICE, 56);
    } else if (tau < 53) {
      big("FLIGHT MODE", 230, ICE, 230);
      small(`ALTITUDE ${alt.toFixed(1)} M`, 450, "#ffffff", 80);
    } else if (tau < 68) {
      big("LANDED.", 300, "#ffffff", 260);
      small('"BETTER THAN ANY BOND CAR"', 500, "#c9ced6", 56);
    } else {
      big("zkCAR", 240, "#ffffff", 220);
      small("PRODUCTION 2028 · DEPOSITS OPEN", 430, RED, 64);
      small("SEE YOU AT THE NEXT SHOW", 520);
    }
    screen.t.needsUpdate = true;
  }

  // ---- the roadster's path: where it is, which way it points, which jets fire ----------------------
  const pose = { p: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), yaw: 0, jetsDown: 0, jetsUp: 0, speed: 0 };
  const basis = new THREE.Matrix4();
  const right = new THREE.Vector3();
  const yawQ = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  /** The turntable after the reveal: two whole turns, so it stops nose to the track. */
  const spinAt = (tau: number) => smooth((tau - 21) / 11) * Math.PI * 4;
  function carPose(tau: number) {
    pose.up.set(0, 1, 0);
    pose.fwd.set(0, 0, 1);
    pose.yaw = 0;
    pose.jetsDown = 0;
    pose.jetsUp = 0;
    pose.speed = 0;
    const onTurn = (spin: number) => {
      pose.p.set(TURN.x, TURN.y, TURN.z);
      pose.yaw = spin;
    };
    if (tau < 32) onTurn(spinAt(tau));
    else if (tau < 34.5) {
      // off the turntable (it stops nose to the track), down the ramp to the start line
      const u = smooth((tau - 32) / 2.5);
      const z = TURN.z + (START_Z - TURN.z) * u;
      pose.p.set(0, z < STAGE.z1 ? TURN.y : z < TRACK.z0 ? TURN.y * clamp01((TRACK.z0 - z) / (TRACK.z0 - STAGE.z1)) : 0, z);
      pose.speed = 6;
    } else if (tau < 36) pose.p.set(0, 0, START_Z);
    else if (tau < 38.2) {
      // the launch: 33 m/s² to 60 mph in 0.81 s, then braking into the loop
      const t = tau - 36;
      let d: number;
      if (t < 0.81) {
        d = 0.5 * 33 * t * t;
        pose.speed = 33 * t;
      } else {
        const t2 = t - 0.81;
        d = 10.8 + 27 * t2 - 0.5 * 10.6 * t2 * t2;
        pose.speed = 27 - 10.6 * t2;
      }
      const u = d / (LOOP.z - START_Z);
      pose.p.set(-LOOP.off * smooth(u * 1.4), 0, START_Z + d);
    } else if (tau < 41.2) {
      // the loop, on the thrusters: they press it to the track (the jets on its back)
      const th = ((tau - 38.2) / 3) * Math.PI * 2;
      pose.p.copy(loopPos(th));
      pose.fwd.set((2 * LOOP.off) / (Math.PI * 2) / LOOP.R, Math.sin(th), Math.cos(th)).normalize();
      pose.up.set(0, Math.cos(th), -Math.sin(th));
      pose.jetsUp = th > 0.6 && th < Math.PI * 2 - 0.6 ? 1 : 0;
      pose.speed = 12;
    } else if (tau < 43.5) {
      const u = (tau - 41.2) / 2.3;
      const d = 14 * (1 - (1 - u) * (1 - u));
      pose.p.set(LOOP.off * (1 - smooth(u)), 0, LOOP.z + d);
      pose.speed = 12 * (1 - u) + 3;
      pose.jetsDown = u > 0.75 ? (u - 0.75) * 4 : 0;
    } else if (tau < 50.5) {
      // flight: up on the six jets under it, a full turn in the air over the row, down in front of the pit
      const u = (tau - 43.5) / 7;
      const z = LIFT_Z + (LAND_Z - LIFT_Z) * smooth(u);
      const y = 9.5 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.7);
      pose.p.set(0, y, z);
      pose.yaw = smooth((u - 0.28) / 0.42) * Math.PI * 2;
      pose.jetsDown = 1;
      pose.speed = 4;
    } else if (tau < 60) {
      pose.p.set(0, 0, LAND_Z);
      if (tau < 51.5) pose.p.y = Math.max(0, Math.sin((tau - 50.5) * 9) * 0.08 * (1 - (tau - 50.5)));
    } else if (tau < 66) {
      // a turn on the spot, hovering on its jets
      const u = smooth((tau - 60) / 6);
      pose.p.set(0, 0.7 * Math.sin(Math.PI * u), LAND_Z);
      pose.yaw = Math.PI * u;
      pose.jetsDown = 1;
    } else if (tau < 80) {
      // back up the track and the ramp onto the turntable
      const u = smooth((tau - 66) / 14);
      const z = LAND_Z + (TURN.z - LAND_Z) * u;
      pose.p.set(0, z < STAGE.z1 ? TURN.y : z < TRACK.z0 ? TURN.y * clamp01((TRACK.z0 - z) / (TRACK.z0 - STAGE.z1)) : 0, z);
      pose.yaw = Math.PI;
      pose.speed = 9;
    } else onTurn(Math.PI + smooth((tau - 80) / 6) * Math.PI);
  }

  // ---- the clock and the cues --------------------------------------------------------------------
  let clock = INTERVAL - 8; // the first show starts a few seconds after you come in
  let lastTau = -999;
  const cue = (tau: number, at: number) => lastTau < at && tau >= at;
  let dist = 0;
  const prevP = new THREE.Vector3(TURN.x, TURN.y, TURN.z);
  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  let strobe = 0;
  let ovation = 0;

  function update(dt: number, t: number, camera: THREE.PerspectiveCamera) {
    clock += dt;
    const tau = (clock % CYCLE) - INTERVAL;
    if (tau < lastTau - 1) lastTau = -INTERVAL - 1; // a new cycle
    camera.getWorldQuaternion(camQuat);
    camera.getWorldPosition(camPos);
    camRight.set(1, 0, 0).applyQuaternion(camQuat);

    // cues: sound, speech, effects
    if (cue(tau, 0)) sound("roll", 0.01);
    if (presenter) {
      if (cue(tau, 6)) void presenter.walk([new THREE.Vector3(-4, STAGE.y, STAGE.z1 - 2.5)], 1.6);
      if (cue(tau, 9)) presenter.say("Welcome to ZStreet!", 3, "shout");
      if (cue(tau, 12.5)) presenter.say("Nine years ago we promised you a car.", 3.5);
      if (cue(tau, 16.5)) presenter.say("Tonight… it's real.", 2.5);
      if (cue(tau, 25)) presenter.say("Zero to sixty in under a second.", 3);
      if (cue(tau, 29)) presenter.say("And it flies.", 2.5, "shout");
      if (cue(tau, 31)) void presenter.walk([new THREE.Vector3(-12, STAGE.y, STAGE.z1 - 3)], 1.6);
      if (cue(tau, 54)) presenter.say("Better than any Bond car!", 3, "shout");
      if (cue(tau, 70)) presenter.say("Production 2028. Deposits are open!", 3.5);
      if (cue(tau, 78)) void presenter.walk([new THREE.Vector3(-14, STAGE.y, -112)], 1.4);
      presenter.faceDir = v.set(0, 0, 1).clone();
    }
    if (cue(tau, 18)) sound("roll", 3);
    if (cue(tau, 21)) {
      sound("hit");
      sound("applause");
      strobe = 1.2;
      ovation = 9;
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        puff(v.set(TURN.x + Math.cos(a) * 2.5, STAGE.y + 0.4, TURN.z + Math.sin(a) * 2.5), new THREE.Vector3(Math.cos(a) * 1.8, 0.4 + Math.random() * 0.6, Math.sin(a) * 1.8), 1.2, 3 + Math.random() * 1.5, 2.5, 0.22);
      }
    }
    if (cue(tau, 36)) sound("launch");
    if (cue(tau, 38.6)) sound("thrust", 2.4);
    if (cue(tau, 43.2)) sound("thrust", 7.5);
    if (cue(tau, 50.6)) {
      sound("applause");
      sound("hit");
      ovation = 12;
      confetti();
    }
    if (cue(tau, 60)) sound("thrust", 6);
    if (cue(tau, 84)) sound("applause");
    lastTau = tau;

    const live = tau >= 0 && tau < SHOW;
    // the house dims for the show; the stage key on the car once it is revealed
    const dim = live ? (tau < 2 ? 1 - tau / 2 : tau > SHOW - 4 ? (tau - (SHOW - 4)) / 4 : 0) : 1;
    for (const l of house) l.intensity = 40 + 240 * dim;
    hemi.intensity = 0.18 + 0.55 * dim + strobe * 2.5;
    strobe = Math.max(0, strobe - dt * 3);
    key.intensity = tau > 18 && tau < 34 ? (tau < 21 ? 300 : 1000) : tau >= 80 && tau < SHOW ? 700 : 0;
    crowd.uniforms.uLight.value = 0.35 + 0.45 * dim;

    // the cover: on during the interval, off at the hit (up into the rig), back down after the show
    let silkY = 0,
      silkA = 1;
    if (tau >= 21 && tau < 86) {
      const u = clamp01((tau - 21) / 1.6);
      silkY = u * u * 26;
      silkA = 1 - u;
    } else if (tau >= 86 && tau < SHOW) {
      const u = clamp01((tau - 86) / 3);
      silkY = (1 - u) * 18;
      silkA = u;
    }
    silk.position.set(TURN.x, TURN.y + silkY, TURN.z);
    silk.rotation.y = silkY * 0.08;
    silkM.opacity = silkA;
    silk.visible = silkA > 0.02;

    // the car
    carPose(live ? tau : 0);
    if (!live) pose.yaw = 0;
    turntable.rotation.y = live && tau < 32 ? spinAt(tau) : tau >= 80 && tau < 86 ? Math.PI + smooth((tau - 80) / 6) * Math.PI : 0;
    right.crossVectors(pose.up, pose.fwd).normalize();
    basis.makeBasis(right, pose.up, pose.fwd);
    car.group.quaternion.setFromRotationMatrix(basis);
    if (pose.yaw) car.group.quaternion.multiply(yawQ.setFromAxisAngle(Y, pose.yaw));
    car.group.position.copy(pose.p);
    dist += car.group.position.distanceTo(prevP);
    prevP.copy(car.group.position);
    for (const w of car.wheels) w.rotation.x = dist / 0.36;
    const flick = 0.75 + Math.random() * 0.5;
    car.jetsDown.forEach((j) => {
      j.visible = pose.jetsDown > 0.05;
      j.scale.set(1, pose.jetsDown * flick, 1);
    });
    car.jetsUp.forEach((j) => {
      j.visible = pose.jetsUp > 0.05;
      j.scale.set(1, pose.jetsUp * flick, 1);
    });
    // air puffs from the jets
    if ((pose.jetsDown > 0.3 || pose.jetsUp > 0.3) && Math.random() < 0.6)
      for (let k = 0; k < 1; k++) {
        const list = pose.jetsDown > 0.3 ? car.nozzlesDown : car.nozzlesUp;
        const n = list[Math.floor(Math.random() * list.length)];
        const wp = car.group.localToWorld(v.copy(n));
        const dir = new THREE.Vector3(0, pose.jetsDown > 0.3 ? -1 : 1, 0).applyQuaternion(car.group.quaternion).multiplyScalar(3 + Math.random() * 2);
        puff(wp, dir, 0.35, 1.0, 2.5, 0.16);
      }
    // the headlights blink twice for the crowd after the landing
    const blink = tau > 52 && tau < 54 && Math.floor((tau - 52) * 4) % 2 === 0;
    car.head.color.setScalar(blink ? 2.4 : 1.0);
    carLight.position.copy(car.group.position).add(v.set(0, 3, 0));
    carLight.intensity = live && tau > 21 ? 22 : 0;
    follow.intensity = live && tau > 34 && tau < 80 ? 520 : 0;
    follow.target.position.copy(car.group.position);

    // start lights
    startLights.forEach((m, i) => {
      const on = tau > 34.5 + i * 0.28 && tau < 36;
      const go = tau >= 36 && tau < 37.5;
      m.color.set(go ? "#22ff66" : on ? "#ff1a22" : "#200608").multiplyScalar(go || on ? 2.5 : 1);
    });

    // beams sweep during the show, red for the reveal and the landing, ice for the run
    const beamOn = live ? (tau < 21 ? 0.14 : 0.3) : 0;
    for (const b of beams) {
      b.m.rotation.set(Math.sin(t * 0.7 + b.ph) * 0.45, 0, Math.cos(t * 0.53 + b.ph * 1.3) * 0.45);
      b.mat.opacity += (beamOn - b.mat.opacity) * Math.min(1, dt * 2);
      b.mat.color.set((tau > 21 && tau < 30) || (tau > 50.5 && tau < 58) ? RED : ICE);
    }
    // lasers fan from the stage for the reveal
    const laserOn = tau > 21 && tau < 31;
    for (const l of lasers) {
      l.visible = laserOn;
      if (!laserOn) continue;
      const { sx, i } = l.userData as { sx: number; i: number };
      l.rotation.set(-0.05 - 0.12 * Math.sin(t * 1.3 + i), sx * -0.4 + (i - 3.5) * 0.09 * sx + Math.sin(t * 2 + i) * 0.08, 0);
    }

    // the crowd: claps at the reveal, the landing, the end; stands for the two big moments
    ovation = Math.max(0, ovation - dt);
    const clap = ovation > 0 ? Math.min(1, ovation / 3) : tau > 34 && tau < 50 ? 0.25 : 0;
    crowd.uniforms.uClap.value += (clap - crowd.uniforms.uClap.value) * Math.min(1, dt * 4);
    crowd.uniforms.uStand.value += ((ovation > 2 ? 1 : 0) - crowd.uniforms.uStand.value) * Math.min(1, dt * 3);
    crowd.tick(dt);

    // phones: the closer the moment, the more flashes
    const hot = live && ((tau > 21 && tau < 32) || (tau > 36 && tau < 58)) ? 1 : live ? 0.12 : 0.02;
    for (let i = 0; i < FLASHES; i++) {
      if (t > flashNext[i]) {
        if (Math.random() < hot) {
          const s = flashAt[i];
          flashPos.set([s.x, s.y + 1.25, s.z], i * 3);
          flashOff[i] = t + 0.06;
        }
        flashNext[i] = t + 0.4 + Math.random() * 2.5;
      }
      if (t > flashOff[i]) flashPos[i * 3 + 1] = -100;
    }
    flashGeo.attributes.position.needsUpdate = true;
    for (const f of pitFlashes) {
      if (hot > 0.5 && t > f.next) {
        f.off = t + 0.07;
        f.next = t + 0.3 + Math.random() * 1.6;
      }
      f.m.visible = t < f.off;
    }

    // smoke and air
    for (const q of puffs) {
      if (!q.s.visible) continue;
      q.life += dt;
      const u = q.life / q.max;
      if (u >= 1) {
        q.s.visible = false;
        continue;
      }
      q.s.position.addScaledVector(q.vel, dt);
      q.vel.multiplyScalar(1 - dt * 1.2);
      q.s.scale.multiplyScalar(1 + dt * q.grow * 0.3);
      (q.s.material as THREE.SpriteMaterial).opacity = q.alpha * (1 - u);
    }
    // confetti falls, spinning
    if (confOn) {
      let any = false;
      for (let i = 0; i < CONF; i++) {
        const y = confPos[i * 3 + 1];
        if (y < 0) continue;
        any = true;
        confPos[i * 3 + 1] = y - dt * (1.2 + (i % 5) * 0.2);
        confPos[i * 3] += Math.sin(t * 3 + i) * dt * 0.6;
      }
      confGeo.attributes.position.needsUpdate = true;
      if (!any) confOn = false;
    }

    // the screen, 15 times a second
    if (t - screenAt > 1 / 15) {
      screenAt = t;
      drawScreen(tau, pose.speed, Math.max(0, pose.p.y));
    }
    for (const s of people) s.update(dt, t, camQuat, camRight);
  }

  drawScreen(-INTERVAL, 0, 0);
  if (import.meta.env.DEV || location.search.includes("debug"))
    (window as unknown as { convention?: unknown }).convention = {
      seek: (tau: number) => (clock = tau + INTERVAL),
      car: car.group,
      get tau() {
        return (clock % CYCLE) - INTERVAL;
      },
    };

  return {
    key: "convention",
    title: "CONVENTION CENTER",
    scene,
    floors: [{ label: "Arena", name: "THE zkCAR REVEAL · every two minutes", y: TERR.y, spawn: new THREE.Vector3(0, TERR.y, 6.5), yaw: 0 }],
    // the terrace is the floor; the stairs go down to the aisles and the track's level
    groundAt: (_f, x, z) => {
      if (z >= TERR.z) return null;
      const ax = Math.abs(x);
      if (ax >= TERR.stair[0] && ax <= TERR.stair[1] && z > TERR.z - TERR.run) return (TERR.y * (z - (TERR.z - TERR.run))) / TERR.run;
      return 0;
    },
    colliders: () => rects,
    pickables: () => pickables,
    pick: (hit) => picks.get(hit.object) ?? null,
    hover: (hit) => hovers.get(hit.object) ?? null,
    update,
  };
}
