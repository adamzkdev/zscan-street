/**
 * MEMPOOL RUSH · PROOF FACTORY's hall: what stands round the steel deck. Far below, the casting
 * floor: dark plates cut by a grid of melt channels (some live and glowing, some cooled to crust).
 * Out of it rise two crucibles behind the deck, their mouths full of melt, a stream pouring into each;
 * on the left a ladle crane rides its gantry, on the right ingots slide down a roller table past a press
 * that stamps them. Pillars, roof beams, lamps on rods and four walls with lit slits make it a hall, its
 * roof lost in the dark. Everything is outside the deck and clear of the play camera's view of it.
 */
import * as THREE from "three";
import { rng } from "../../kit";
import { GEO, canvasTex, toon, toonSteps } from "../../k3";
import { markGlow } from "../../post";
import { Fall, Parts, pools } from "../sign-levels/parts";
import { far, lamp } from "../turf-levels/scape";

/** The casting floor's height, the side bays' reach. */
const FY = -24;

export function foundryHall(scene: THREE.Scene, o: { xw: number; zd: number; ink: THREE.Material; seed: number }): (dt: number, t: number) => void {
  const rnd = rng(o.seed);
  const { xw: XW, zd: ZD } = o;
  const M = new THREE.Matrix4(),
    Q = new THREE.Quaternion(),
    P = new THREE.Vector3(),
    S = new THREE.Vector3(),
    C = new THREE.Color();
  const IDENT = new THREE.Quaternion();

  // ---- the casting floor: plates, and the lattice of channels (a node every 8 m, a tile of 32 m)
  const N = 1024;
  const node = N / 4;
  const segs: { x0: number; y0: number; x1: number; y1: number; live: boolean }[] = [];
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      if ((i + j) % 2) continue;
      segs.push({ x0: i * node, y0: j * node, x1: (i + 1) * node, y1: (j + 1) * node, live: rnd() < 0.62 });
      segs.push({ x0: i * node, y0: j * node, x1: (i + 1) * node, y1: (j - 1) * node, live: rnd() < 0.62 });
    }
  const strokes = (g: CanvasRenderingContext2D, pick: (live: boolean) => string | null, w: number) => {
    g.lineCap = "round";
    g.lineWidth = w;
    for (const s of segs) {
      const c = pick(s.live);
      if (!c) continue;
      g.strokeStyle = c;
      for (const ox of [-N, 0, N])
        for (const oy of [-N, 0, N]) {
          g.beginPath();
          g.moveTo(s.x0 + ox, s.y0 + oy);
          g.lineTo(s.x1 + ox, s.y1 + oy);
          g.stroke();
        }
    }
  };
  const plates = canvasTex(
    N,
    N,
    (g) => {
      g.fillStyle = "#1b1c27";
      g.fillRect(0, 0, N, N);
      const pl = N / 8;
      for (let j = 0; j < 8; j++)
        for (let i = 0; i < 8; i++) {
          g.fillStyle = (i + j) % 2 ? "#2b2d3d" : "#272939";
          g.fillRect(i * pl + 3, j * pl + 3, pl - 6, pl - 6);
          g.fillStyle = "rgba(255,255,255,0.05)";
          g.fillRect(i * pl + 3, j * pl + 3, pl - 6, 3);
        }
      // the channels: a dark curb, then the crust (the live ones' glow is the other picture)
      strokes(g, () => "#12111a", 54);
      strokes(g, (live) => (live ? "#7a2c12" : "#3a2420"), 34);
    },
    true,
  );
  const glowMap = canvasTex(
    N,
    N,
    (g) => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, N, N);
      strokes(g, (live) => (live ? "#e2541a" : null), 30);
      strokes(g, (live) => (live ? "#ffab3a" : null), 14);
      strokes(g, (live) => (live ? "#ffe9a0" : null), 4);
    },
    true,
  );
  const reach = 448;
  for (const t of [plates, glowMap]) (t.repeat.set(reach / 32, reach / 32), (t.anisotropy = 8));
  const floorMat = markGlow(new THREE.MeshToonMaterial({ map: plates, gradientMap: toonSteps(), emissive: 0xffffff, emissiveMap: glowMap }), 0.75);
  const floor = far(new THREE.Mesh(GEO.plane, floorMat));
  floor.rotation.x = -Math.PI / 2;
  floor.scale.set(reach, reach, 1);
  floor.position.y = FY;
  scene.add(floor);

  // ---- the hall: pillars and roof beams behind and beside, four walls with lit slits
  const F = new Parts();
  const steel = "#2c2e40",
    steelD = "#22232f";
  const TOP = 30;
  for (const z of [-34, -62]) for (const x of [-48, -24, 0, 24, 48]) F.box(steel, 1.6, TOP - FY, 1.6, x, FY, z);
  for (const x of [-48, 48]) for (const z of [-10, 14, 38]) F.box(steel, 1.6, TOP - FY, 1.6, x, FY, z);
  for (const z of [-34, -62]) F.box(steelD, 98, 1.4, 1.2, 0, TOP - 1.4, z);
  for (const x of [-48, -24, 0, 24, 48]) F.box(steelD, 1.2, 1.4, 104, x, TOP - 2.8, -12);
  const slits = canvasTex(
    256,
    128,
    (g) => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, 256, 128);
      for (let k = 0; k < 8; k++) {
        g.fillStyle = k % 3 === 1 ? "#ffb060" : "#7a4a3a";
        g.fillRect(k * 32 + 11, 30, 10, 46);
      }
    },
    true,
  );
  slits.repeat.set(3, 1);
  const wallMat = markGlow(new THREE.MeshToonMaterial({ color: "#211f2e", gradientMap: toonSteps(), emissive: 0xffffff, emissiveMap: slits, side: THREE.DoubleSide }), 0.4);
  const WD = 92;
  for (let k = 0; k < 4; k++) {
    const w = far(new THREE.Mesh(GEO.plane, wallMat));
    w.scale.set(WD * 2, 70, 1);
    w.position.set(k === 1 ? WD : k === 3 ? -WD : 0, FY + 35, k === 0 ? -WD : k === 2 ? WD : 0);
    w.rotation.y = (k * -Math.PI) / 2;
    scene.add(w);
  }

  // ---- the two crucibles behind the deck: iron drums off the floor, their mouths below the deck's level
  const CR = 3.9,
    CZ = -ZD - 9.6,
    CTOP = -3.6;
  const crux = [-8.6, 8.6];
  for (const x of crux) {
    F.cyl("#34323f", CR, CTOP - FY, x, FY, CZ);
    F.cyl("#4b4858", CR + 0.35, 1.0, x, CTOP - 0.7, CZ);
    F.cyl("#4b4858", CR + 0.25, 0.7, x, CTOP - 6, CZ);
    F.cyl("#26252f", CR + 0.9, 1.4, x, FY, CZ);
    // the spout overhead and its pipe back into the dark
    F.box(steelD, 1.0, 0.9, 12, x + 1.3, 4.2, CZ - 5.2);
    F.box("#4b4858", 1.3, 1.3, 1.3, x + 1.3, 3.9, CZ + 0.6);
  }
  for (const m of F.build(scene, o.ink)) far(m);
  const meltTex = canvasTex(256, 256, (g) => {
    const rg = g.createRadialGradient(128, 128, 6, 128, 128, 128);
    rg.addColorStop(0, "#fff3b8");
    rg.addColorStop(0.4, "#ffb432");
    rg.addColorStop(0.8, "#ff6a1a");
    rg.addColorStop(1, "#a8320e");
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 256);
    // the crust: dark rafts adrift on it
    g.fillStyle = "rgba(58,18,10,0.8)";
    for (let k = 0; k < 16; k++) {
      const a = rnd() * Math.PI * 2,
        d = 50 + rnd() * 66;
      g.beginPath();
      g.ellipse(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 7 + rnd() * 16, 4 + rnd() * 8, a + 1.2, 0, Math.PI * 2);
      g.fill();
    }
  });
  const meltMat = markGlow(new THREE.MeshBasicMaterial({ map: meltTex }), 0.9);
  const discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  const melts = crux.map((x) => {
    const m = far(new THREE.Mesh(discGeo, meltMat));
    m.scale.setScalar(CR - 0.25);
    m.position.set(x, CTOP - 0.25, CZ);
    scene.add(m);
    return m;
  });

  // ---- the side bays: a platform each on its pylons, by the furnaces; the left one's crane, the right one's press and rollers
  const B = new Parts();
  const BX0 = XW + 2.9,
    BX1 = XW + 13.5,
    BZ = 8.2;
  const bw = BX1 - BX0,
    bm = (BX0 + BX1) / 2;
  for (const s of [-1, 1]) {
    B.box("#30323f", bw, 0.5, BZ * 2, s * bm, -0.75, 0, 0.04);
    // (its edge: one clean line of yellow)
    B.lit("#d99a2e", bw, 0.05, 0.14, s * bm, -0.25, BZ - 0.1);
    B.lit("#d99a2e", bw, 0.05, 0.14, s * bm, -0.25, -BZ + 0.1);
    B.lit("#d99a2e", 0.14, 0.05, BZ * 2, s * (BX1 - 0.1), -0.25, 0);
    for (const z of [-BZ + 1.2, BZ - 1.2]) for (const x of [BX0 + 1.2, BX1 - 1.2]) B.box(steelD, 0.9, -0.75 - FY, 0.9, s * x, FY, z);
    // a rail along its outer edge and its back
    for (let z = -BZ + 0.2; z <= BZ - 0.1; z += 1.6) B.box("#565a6e", 0.1, 1.0, 0.1, s * (BX1 - 0.15), -0.25, z);
    B.box("#565a6e", 0.08, 0.08, BZ * 2 - 0.3, s * (BX1 - 0.15), 0.7, 0);
    for (let x = BX0 + 0.2; x <= BX1; x += 1.6) B.box("#565a6e", 0.1, 1.0, 0.1, s * x, -0.25, -BZ + 0.15);
    B.box("#565a6e", bw - 0.3, 0.08, 0.08, s * bm, 0.7, -BZ + 0.15);
    // the lamp over it, on a rod from the roof
    B.box(steelD, 0.12, TOP - 9.4, 0.12, s * bm, 9.4, 0);
    B.add("cone", "#3a3c4e", 2.6, 1.0, 2.6, s * bm, 9.1, 0, { ink: 0.03 });
    B.add("ball", "#ffe2b0", 0.9, 0.5, 0.9, s * bm, 8.55, 0, { lit: true });
    // drums and a cabinet at its back
    B.cyl("#5a4a6a", 0.55, 1.2, s * (BX1 - 1.3), -0.25, -BZ + 1.3, 0.03);
    B.cyl("#3f6a78", 0.55, 1.2, s * (BX1 - 2.6), -0.25, -BZ + 1.2, 0.03);
    B.box("#3a3c4e", 1.6, 1.9, 0.8, s * (BX0 + 1.6), -0.25, -BZ + 1.0, 0.03);
    B.lit("#7ff0ff", 0.9, 0.5, 0.05, s * (BX0 + 1.6), 1.0, -BZ + 1.42);
  }
  // the left bay: the gantry's four legs and two rails; two moulds waiting on the floor
  const GX0 = -(BX0 + 1.0),
    GX1 = -(BX1 - 1.4),
    GY = 6.2;
  for (const x of [GX0, GX1]) {
    for (const z of [-BZ + 0.9, BZ - 0.9]) B.box("#c9772e", 0.5, GY + 0.25, 0.5, x, -0.25, z, 0.03);
    B.box("#c9772e", 0.6, 0.5, BZ * 2 - 0.8, x, GY, 0, 0.03);
  }
  for (const z of [-5.6, 5.6]) {
    B.box("#3a3c4e", 2.4, 0.7, 2.0, (GX0 + GX1) / 2, -0.25, z, 0.03);
    B.lit("#ff8a2a", 1.8, 0.06, 1.4, (GX0 + GX1) / 2, 0.45, z);
  }
  // the right bay: the press's frame and anvil, the roller table's bed and its rollers
  const PX = BX0 + 2.4,
    PZ = -2.6;
  for (const z of [PZ - 1.5, PZ + 1.5]) B.box("#4a6fa0", 0.8, 5.6, 0.8, PX, -0.25, z, 0.03);
  B.box("#4a6fa0", 1.6, 1.1, 4.2, PX, 5.2, PZ, 0.03);
  B.box("#3a3c4e", 1.8, 0.9, 1.8, PX, -0.25, PZ, 0.03);
  const TX = BX1 - 3.2;
  B.box("#3a3c4e", 1.9, 0.5, BZ * 2 - 1.6, TX, -0.25, 0, 0.03);
  for (let z = -BZ + 1.2; z <= BZ - 1.1; z += 0.9) B.add("cyl", "#8a8ea4", 0.36, 1.7, 0.36, TX, 0.42, z, { rz: Math.PI / 2 });
  B.build(scene, o.ink);
  pools(scene, [
    { x: -bm, y: -0.22, z: 0, r: 5.4, c: "#ffd9a0", a: 0.3 },
    { x: bm, y: -0.22, z: 0, r: 5.4, c: "#ffd9a0", a: 0.3 },
  ]);

  // ---- what moves: the crane's bridge and ladle, the press's ram (toon); the melt in the ladle, the
  // ingots, the pouring streams and their splashes, the press's sparks (lights)
  const NI = 7,
    NSPL = 8,
    NSPK = 16;
  const movers = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), 6);
  const cols = ["#c9772e", "#3a3c4e", "#22232f", "#22232f", "#3d3a48", "#8a8ea4"];
  cols.forEach((c, i) => movers.setColorAt(i, C.set(c)));
  movers.frustumCulled = false;
  movers.raycast = () => {};
  const NL = 1 + NI + 2 + 2 * NSPL + NSPK;
  const lights = far(new THREE.InstancedMesh(GEO.box, lamp("#ffffff", 0.85), NL));
  for (let i = 0; i < NL; i++) lights.setColorAt(i, C.set("#ffb040"));
  scene.add(movers, lights);
  const hot = new THREE.Color("#fff0b0"),
    warm = new THREE.Color("#ff8a2a"),
    dull = new THREE.Color("#8a2a14");
  // (each splash's own way out; each spark's)
  const splDir = Array.from({ length: NSPL }, (_, i) => ({ a: (i / NSPL) * Math.PI * 2 + rnd(), r: 0.9 + rnd() * 0.9 }));
  const spk = Array.from({ length: NSPK }, () => ({ a: rnd() * Math.PI * 2, r: 2.2 + rnd() * 3.4, up: 3 + rnd() * 4 }));
  const emb = new Fall(scene, 40, new THREE.MeshBasicMaterial({ color: "#ffb04a", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), { x: 0, z: -8, w: 70, d: 46, y0: FY, y1: 7, v: -2.6, size: [0.16, 0.16, 0.16], drift: 0.8 });
  emb.mesh.userData.noShadow = true;

  return (dt, t) => {
    floorMat.emissiveIntensity = 0.82 + 0.18 * Math.sin(t * 1.1);
    for (let k = 0; k < melts.length; k++) {
      melts[k].rotation.y = t * (k ? -0.16 : 0.2);
      melts[k].scale.setScalar((CR - 0.25) * (1 + Math.sin(t * 1.7 + k * 2) * 0.012));
    }
    // the crane: its bridge rides the rails up and down the bay, the ladle swings under it a little
    const cz = Math.sin(t * 0.42) * (BZ - 2.6);
    const cx = (GX0 + GX1) / 2;
    const sway = Math.cos(t * 0.42) * 0.12;
    movers.setMatrixAt(0, M.compose(P.set(cx, GY + 0.55, cz), IDENT, S.set(GX0 - GX1 + 0.9, 0.6, 0.9)));
    movers.setMatrixAt(1, M.compose(P.set(cx, GY + 0.1, cz), IDENT, S.set(1.3, 0.5, 1.2)));
    movers.setMatrixAt(2, M.compose(P.set(cx - 0.5, 4.5, cz + sway * 0.5), IDENT, S.set(0.07, 3.2, 0.07)));
    movers.setMatrixAt(3, M.compose(P.set(cx + 0.5, 4.5, cz + sway * 0.5), IDENT, S.set(0.07, 3.2, 0.07)));
    movers.setMatrixAt(4, M.compose(P.set(cx, 2.2, cz + sway), IDENT, S.set(2.0, 1.7, 2.0)));
    lights.setMatrixAt(0, M.compose(P.set(cx, 3.06, cz + sway), IDENT, S.set(1.6, 0.06, 1.6)));
    // the press: down hard, up slowly; sparks fly at the blow
    const u = (t / 2.6) % 1;
    const down = u < 0.12 ? u / 0.12 : u < 0.2 ? 1 : 1 - (u - 0.2) / 0.8;
    movers.setMatrixAt(5, M.compose(P.set(PX, 3.9 - down * 2.3, PZ), IDENT, S.set(1.3, 1.6, 1.3)));
    movers.instanceMatrix.needsUpdate = true;
    let li = 1;
    // the ingots: down the rollers, cooling as they go
    for (let i = 0; i < NI; i++) {
      const k = (t * 0.085 + i / NI) % 1;
      lights.setMatrixAt(li, M.compose(P.set(TX, 0.8, -BZ + 1.4 + k * (BZ * 2 - 2.8)), IDENT, S.set(1.3, 0.34, 0.62)));
      lights.setColorAt(li++, k < 0.4 ? C.copy(hot).lerp(warm, k / 0.4) : C.copy(warm).lerp(dull, (k - 0.4) / 0.6));
    }
    // the streams into the crucibles (a flickering bar of melt), and the splash round each foot
    for (let c = 0; c < crux.length; c++) {
      const sx = crux[c] + 1.3,
        sz = CZ + 0.6;
      const w = 0.3 + Math.sin(t * 23 + c * 3) * 0.05 + Math.sin(t * 9.7 + c) * 0.04;
      lights.setMatrixAt(li, M.compose(P.set(sx, (3.9 + CTOP) / 2, sz), IDENT, S.set(w, 3.9 - CTOP, w)));
      lights.setColorAt(li++, hot);
      for (let i = 0; i < NSPL; i++) {
        const d = splDir[i];
        const k = (t * 1.5 + i / NSPL + c * 0.37) % 1;
        const s = 0.3 * (1 - k);
        lights.setMatrixAt(li, M.compose(P.set(sx + Math.cos(d.a) * d.r * k, CTOP - 0.1 + 2.4 * k - 3.6 * k * k, sz + Math.sin(d.a) * d.r * k), IDENT, S.set(s, s, s)));
        lights.setColorAt(li++, warm);
      }
    }
    // the press's sparks: a burst at each blow, gone before the next
    const bt = ((u - 0.12 + 1) % 1) * 2.6;
    for (let i = 0; i < NSPK; i++) {
      const p = spk[i];
      const k = bt / 0.7;
      const s = k < 1 ? 0.2 * (1 - k) : 0;
      lights.setMatrixAt(li, M.compose(P.set(PX + Math.cos(p.a) * p.r * bt, 0.9 + p.up * bt - 9 * bt * bt, PZ + Math.sin(p.a) * p.r * bt), Q.identity(), S.set(s, s, s)));
      lights.setColorAt(li++, hot);
    }
    lights.instanceMatrix.needsUpdate = true;
    if (lights.instanceColor) lights.instanceColor.needsUpdate = true;
    emb.tick(dt, t, 0.3);
  };
}
