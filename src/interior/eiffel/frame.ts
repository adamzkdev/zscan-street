import * as THREE from "three";
import { std } from "../kit";
import { EiffelKit, hw, lw, makeCanvas, P1, P2, PT } from "./kit";

/**
 * The tower itself, drawn on every floor: the four latticed pillars on their stone piers, the
 * great arches, the first and second floor platforms (frieze with the 72 savants' names), the long
 * shaft with its intermediate gallery, the glazed summit, the campanile and the antenna; and below
 * it the Champ de Mars: the esplanade, lawns, alleys of trees, the carousel.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const LEGS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
/** The 72 names on the first floor frieze, side by side (Trocadéro, Grenelle, Champ de Mars, École Militaire). */
const SAVANTS = [
  "SEGUIN LALANDE TRESCA PONCELET BRESSE LAGRANGE BÉLANGER CUVIER LAPLACE DULONG CHASLES LAVOISIER AMPÈRE CHEVREUL FLACHAT NAVIER LEGENDRE CHAPTAL",
  "JAMIN GAY-LUSSAC FIZEAU SCHNEIDER LE CHATELIER BERTHIER BARRAL DE DION GOÜIN JOUSSELIN BROCA BECQUEREL CORIOLIS CAIL TRIGER GIFFARD PERRIER STURM",
  "CAUCHY BELGRAND REGNAULT FRESNEL DE PRONY VICAT EBELMEN COULOMB POINSOT FOUCAULT DELAUNAY MORIN HAÜY COMBES THÉNARD ARAGO POISSON MONGE",
  "PETIET DAGUERRE WURTZ LE VERRIER PERDONNET DELAMBRE MALUS BREGUET POLONCEAU DUMAS CLAPEYRON BORDA FOURIER BICHAT SAUVAGE PELOUZE CARNOT LAMÉ",
];

export function buildFrame(k: EiffelKit) {
  const F = "frame";
  const iron = k.iron,
    dark = k.ironDark;

  // ---- the pillars: four box trusses leaning in, up to the second floor --------------------------------
  const stations: number[] = [];
  for (let y = 1.2; y < 31; y += 2.5) stations.push(y);
  stations.push(31);
  const corners = (sx: number, sz: number, y: number) => {
    const o = hw(y),
      i = hw(y) - lw(y);
    return [V(sx * o, y, sz * o), V(sx * i, y, sz * o), V(sx * i, y, sz * i), V(sx * o, y, sz * i)];
  };
  for (const [sx, sz] of LEGS) {
    for (let s = 0; s < stations.length - 1; s++) {
      const a = corners(sx, sz, stations[s]),
        b = corners(sx, sz, stations[s + 1]);
      for (let c = 0; c < 4; c++) k.beam(F, a[c], b[c], c === 0 ? 0.5 : 0.34, c === 0 ? dark : iron);
      for (let c = 0; c < 4; c++) {
        const n = (c + 1) % 4;
        k.beam(F, a[c], a[n], 0.16, iron);
        // the cross-bracing of each face, and a finer lattice inside each bay
        k.beam(F, a[c], b[n], 0.1, iron);
        k.beam(F, a[n], b[c], 0.1, iron);
        for (const t of [0.25, 0.5, 0.75]) {
          const p = a[c].clone().lerp(a[n], t),
            q = b[c].clone().lerp(b[n], t);
          k.beam(F, p, q, 0.05, iron);
        }
      }
    }
    // the stone pier at the foot, with its moulded cap
    const o = hw(0),
      i = hw(0) - lw(0);
    const cx = (sx * (o + i)) / 2,
      cz = (sz * (o + i)) / 2;
    k.slab(F, lw(0) + 1.2, 1.2, lw(0) + 1.2, cx, 0, cz, k.stone);
    k.slab(F, lw(0) + 1.5, 0.2, lw(0) + 1.5, cx, 1.2, cz, std("#b4a890", 0.9));
  }

  // ---- the shaft: from the second floor to the summit ----------------------------------------------------
  const top = 64.2;
  const shaft: number[] = [];
  for (let y = 27.6; y < top; y += 2.6) shaft.push(y);
  shaft.push(top);
  const sq = (y: number) => {
    const h = hw(y);
    return [V(-h, y, -h), V(h, y, -h), V(h, y, h), V(-h, y, h)];
  };
  for (let s = 0; s < shaft.length - 1; s++) {
    const a = sq(shaft[s]),
      b = sq(shaft[s + 1]);
    for (let c = 0; c < 4; c++) {
      const n = (c + 1) % 4;
      k.beam(F, a[c], b[c], 0.55, dark);
      // each corner is a box column: an inner chord too
      k.beam(F, a[c].clone().multiplyScalar(0.86).setY(a[c].y), b[c].clone().multiplyScalar(0.86).setY(b[c].y), 0.22, iron);
      k.beam(F, a[c], a[n], 0.18, iron);
      k.beam(F, a[c], b[n], 0.11, iron);
      k.beam(F, a[n], b[c], 0.11, iron);
      for (const t of [0.33, 0.66]) k.beam(F, a[c].clone().lerp(a[n], t), b[c].clone().lerp(b[n], t), 0.05, iron);
    }
  }
  // the intermediate gallery round the shaft
  {
    const y = 46,
      h = hw(y) + 0.9;
    for (let c = 0; c < 4; c++) {
      const a = [V(-h, y, -h), V(h, y, -h), V(h, y, h), V(-h, y, h)];
      k.beam(F, a[c], a[(c + 1) % 4], 0.3, dark);
      k.beam(F, a[c].clone().setY(y + 1), a[(c + 1) % 4].clone().setY(y + 1), 0.06, dark);
    }
    k.slab(F, h * 2, 0.15, h * 2, 0, y, 0, k.deck);
  }
  // the lift shaft in the middle, rails and a counterweight
  for (const x of [-0.7, 0.7]) k.beam(F, V(x, 27.6, -0.9), V(x, top, -0.9), 0.12, k.chrome);
  k.slab(F, 2.2, top - 27.6, 0.12, 0, 27.6, 1.1, std("#2e2620", 0.8));

  // ---- the great arches between the pillars ------------------------------------------------------------
  const archGeo = (side: number) => {
    // in the plane of each face, from leg to leg, apex just under the first floor
    const plane = hw(5.5);
    const half = hw(4) - lw(4) + 0.6;
    const pts: THREE.Vector3[] = [];
    const inner: THREE.Vector3[] = [];
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const t = -1 + (2 * i) / n;
      const u = t * half;
      const yy = 3.2 + 8.2 * Math.sqrt(Math.max(0, 1 - t * t));
      const yi = yy + 0.7;
      const at = (uu: number, y: number) => (side === 0 ? V(uu, y, plane) : side === 1 ? V(uu, y, -plane) : side === 2 ? V(plane, y, uu) : V(-plane, y, uu));
      pts.push(at(u, yy));
      inner.push(at(u * 0.97, yi));
    }
    for (let i = 0; i < n; i++) {
      k.beam(F, pts[i], pts[i + 1], 0.28, dark);
      k.beam(F, inner[i], inner[i + 1], 0.16, iron);
      k.beam(F, pts[i], inner[i + 1], 0.06, iron);
      // the spandrel: vertical rods up to the platform, rings between
      if (i % 2 === 0 && i > 0) {
        const p = pts[i];
        k.beam(F, inner[i], p.clone().setY(11.9), 0.07, iron);
      }
    }
    // a row of decorative rings in the spandrels
    for (const t of [-0.82, -0.6, 0.6, 0.82]) {
      const u = t * half;
      const yy = 3.2 + 8.2 * Math.sqrt(1 - t * t);
      const r = Math.min(0.9, (11.9 - yy) / 2 - 0.15);
      if (r < 0.3) continue;
      const ring = new THREE.TorusGeometry(r, 0.05, 4, 16);
      if (side >= 2) ring.rotateY(Math.PI / 2);
      ring.translate(side === 0 ? u : side === 1 ? u : side === 2 ? plane : -plane, yy + (11.9 - yy) / 2, side === 0 ? plane : side === 1 ? -plane : u);
      k.addGeo(F, ring, iron);
    }
  };
  for (let s = 0; s < 4; s++) archGeo(s);

  // ---- platforms ------------------------------------------------------------------------------------------
  const frieze = (y0: number, h: number, half: number, names: boolean) => {
    for (let s = 0; s < 4; s++) {
      const tex = makeCanvas(2048, 128, (g) => {
        g.fillStyle = "#4e3a2c";
        g.fillRect(0, 0, 2048, 128);
        g.fillStyle = "#3a2a20";
        g.fillRect(0, 0, 2048, 10);
        g.fillRect(0, 118, 2048, 10);
        for (let x = 0; x < 2048; x += 113) g.fillRect(x, 10, 6, 108);
        if (names) {
          g.fillStyle = "#d8b060";
          g.font = '700 46px "Times New Roman", Georgia, serif';
          g.textBaseline = "middle";
          const words = SAVANTS[s].split(" ");
          const step = 2048 / words.length;
          words.forEach((w, i) => {
            const tw = g.measureText(w).width;
            g.fillText(w, i * step + (step - Math.min(tw, step - 8)) / 2, 66, step - 8);
          });
        } else {
          g.strokeStyle = "#6a5040";
          g.lineWidth = 4;
          for (let x = 56; x < 2048; x += 113) {
            g.beginPath();
            g.arc(x + 3, 64, 30, 0, Math.PI * 2);
            g.stroke();
          }
        }
      }).t;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.3 });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, h), mat);
      const a = (s * Math.PI) / 2;
      // sides: 0 = north (-z) … facing out
      const nx = [0, 1, 0, -1][s],
        nz = [-1, 0, 1, 0][s];
      p.position.set(nx * (half + 0.01), y0 + h / 2, nz * (half + 0.01));
      p.rotation.y = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][s];
      void a;
      k.frame.add(p);
      // the back of the frieze, and the lamp lines along it
      k.slab(F, nx ? 0.2 : half * 2, h, nz ? 0.2 : half * 2, nx * (half - 0.1), y0, nz * (half - 0.1), dark);
      const lamp = k.glow("#ffc860", 0.9, 2.6);
      k.slab(F, nx ? 0.08 : half * 2, 0.08, nz ? 0.08 : half * 2, nx * (half + 0.06), y0 - 0.02, nz * (half + 0.06), lamp);
      k.slab(F, nx ? 0.08 : half * 2, 0.08, nz ? 0.08 : half * 2, nx * (half + 0.06), y0 + h - 0.04, nz * (half + 0.06), lamp);
      // little arcades hanging under the frieze
      const n = Math.round((half * 2) / 1.6);
      for (let i = 0; i < n; i++) {
        const u = -half + (i + 0.5) * ((half * 2) / n);
        const arc = new THREE.TorusGeometry(0.62, 0.05, 4, 12, Math.PI);
        arc.rotateZ(Math.PI);
        if (nx) arc.rotateY(Math.PI / 2);
        arc.translate(nx ? nx * (half - 0.05) : u, y0, nz ? nz * (half - 0.05) : u);
        k.addGeo(F, arc, dark);
      }
    }
  };
  // first floor: deck ring (glass round the hole), the underside grid, the frieze
  const y1 = 13.7;
  frieze(y1 - 1.8, 1.8, P1, true);
  const ringSlab = (y: number, outer: number, inner: number, th: number, mat: THREE.Material) => {
    const w = outer - inner;
    k.slab(F, outer * 2, th, w, 0, y - th, -(inner + w / 2), mat);
    k.slab(F, outer * 2, th, w, 0, y - th, inner + w / 2, mat);
    k.slab(F, w, th, inner * 2, -(inner + w / 2), y - th, 0, mat);
    k.slab(F, w, th, inner * 2, inner + w / 2, y - th, 0, mat);
  };
  ringSlab(y1, P1, 9.5, 0.3, k.deck);
  ringSlab(y1 - 0.3, P1 - 0.2, 9.5, 0.06, dark);
  // the glass floor round the void (walkable), on a fine iron grid
  const glassFloor = new THREE.MeshStandardMaterial({ color: "#cfe8f4", transparent: true, opacity: 0.1, roughness: 0.02, metalness: 0.2, depthWrite: false });
  ringSlab(y1, 9.5, 7, 0.05, glassFloor);
  for (let u = -9.5; u <= 9.5; u += 1.25)
    for (const s of [-1, 1]) {
      k.beam(F, V(u, y1 - 0.06, s * 7), V(u, y1 - 0.06, s * 9.5), 0.05, dark);
      k.beam(F, V(s * 7, y1 - 0.06, u), V(s * 9.5, y1 - 0.06, u), 0.05, dark);
    }
  for (const d of [7, 8.25, 9.5])
    for (const s of [-1, 1]) {
      k.beam(F, V(-d, y1 - 0.06, s * d), V(d, y1 - 0.06, s * d), 0.06, dark);
      k.beam(F, V(s * d, y1 - 0.06, -d), V(s * d, y1 - 0.06, d), 0.06, dark);
    }
  // underside: deep girders in a grid, seen from the esplanade
  for (let u = -P1 + 1; u <= P1 - 1; u += 2.6) {
    for (const s of [-1, 1]) {
      k.girder(F, V(u, y1 - 1.0, s * 7), V(u, y1 - 1.0, s * (P1 - 0.2)), V(0, 1, 0), 1.2, { chord: 0.12, web: 0.05 });
      k.girder(F, V(s * 7, y1 - 1.0, u), V(s * (P1 - 0.2), y1 - 1.0, u), V(0, 1, 0), 1.2, { chord: 0.12, web: 0.05 });
    }
  }
  for (const d of [7, 13.3])
    for (const s of [-1, 1]) {
      k.girder(F, V(-d, y1 - 1.0, s * d), V(d, y1 - 1.0, s * d), V(0, 1, 0), 1.6, { chord: 0.2 });
      k.girder(F, V(s * d, y1 - 1.0, -d), V(s * d, y1 - 1.0, d), V(0, 1, 0), 1.6, { chord: 0.2 });
    }

  // second floor
  const y2 = 27.6;
  frieze(y2 - 1.3, 1.3, P2, false);
  ringSlab(y2, P2, 2.8, 0.3, k.deck);
  ringSlab(y2 - 0.3, P2 - 0.2, 2.8, 0.06, dark);
  for (let u = -P2 + 1; u <= P2 - 1; u += 2.2)
    for (const s of [-1, 1]) {
      k.girder(F, V(u, y2 - 0.75, s * 2.8), V(u, y2 - 0.75, s * (P2 - 0.2)), V(0, 1, 0), 0.9, { chord: 0.1, web: 0.04 });
      k.girder(F, V(s * 2.8, y2 - 0.75, u), V(s * (P2 - 0.2), y2 - 0.75, u), V(0, 1, 0), 0.9, { chord: 0.1, web: 0.04 });
    }

  // summit: the glazed lower level, the deck, the campanile, beacon and antenna
  const yt = 68.3;
  k.slab(F, PT * 2, 0.4, PT * 2, 0, yt - 4.4, 0, dark);
  k.slab(F, PT * 2, 0.35, PT * 2, 0, yt - 0.35, 0, k.deck);
  const glazed = new THREE.MeshStandardMaterial({ color: "#ffe2b0", emissive: new THREE.Color("#ffcf88"), emissiveIntensity: 0.35, transparent: true, opacity: 0.5, roughness: 0.1 });
  for (let s = 0; s < 4; s++) {
    const nx = [0, 1, 0, -1][s],
      nz = [-1, 0, 1, 0][s];
    const g = new THREE.Mesh(new THREE.PlaneGeometry((PT - 0.6) * 2, 3.6), glazed);
    g.position.set(nx * (PT - 0.6), yt - 4 + 1.8, nz * (PT - 0.6));
    g.rotation.y = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][s];
    g.raycast = () => {};
    k.frame.add(g);
    for (let u = -(PT - 0.6); u <= PT - 0.6; u += 1.1) k.beam(F, V(nx ? nx * (PT - 0.55) : u, yt - 4, nz ? nz * (PT - 0.55) : u), V(nx ? nx * (PT - 0.55) : u, yt - 0.4, nz ? nz * (PT - 0.55) : u), 0.09, dark);
  }
  // the lamp line under the summit
  const goldLine = k.glow("#ffc860", 1, 3);
  for (let s = 0; s < 4; s++) {
    const nx = [0, 1, 0, -1][s],
      nz = [-1, 0, 1, 0][s];
    k.slab(F, nx ? 0.08 : PT * 2, 0.08, nz ? 0.08 : PT * 2, nx * (PT + 0.04), yt - 4.45, nz * (PT + 0.04), goldLine);
  }
  // consoles from the shaft out to the summit platform
  for (const [sx, sz] of LEGS) {
    k.beam(F, V(sx * hw(60), 60, sz * hw(60)), V(sx * PT * 0.95, yt - 4.4, sz * PT * 0.95), 0.25, dark);
  }

  // ---- gold sodium lamps along the corner chords (night lighting) -----------------------------------------
  const sodium = k.glow("#ffb648", 0.6, 3.2);
  const lampGeo: THREE.Vector3[] = [];
  for (const [sx, sz] of LEGS) {
    for (let y = 2; y < 64; y += 1.6) {
      const h = hw(y) + 0.32;
      lampGeo.push(V(sx * h, y, sz * h));
      if (y < 30) {
        const i = hw(y) - lw(y) - 0.2;
        lampGeo.push(V(sx * i, y, sz * h), V(sx * h, y, sz * i));
      }
    }
  }
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), sodium, lampGeo.length);
  lampGeo.forEach((p, i) => lamps.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  k.frame.add(lamps);

  // ---- the ground: esplanade, lawns, alleys of trees, the carousel (seen from every floor) ----------------
  const ground = makeCanvas(1024, 1024, (g) => {
    // gravel with a stone compass rose
    g.fillStyle = "#cdbf9f";
    g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = Math.random() > 0.5 ? "#c4b593" : "#d8cbad";
      g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
    }
    g.strokeStyle = "#a4957a";
    g.lineWidth = 6;
    for (const r of [120, 300]) {
      g.beginPath();
      g.arc(512, 512, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = "#b8a888";
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.beginPath();
      g.moveTo(512, 512);
      g.lineTo(512 + Math.cos(a - 0.05) * (i % 4 ? 200 : 300), 512 + Math.sin(a - 0.05) * (i % 4 ? 200 : 300));
      g.lineTo(512 + Math.cos(a + 0.05) * (i % 4 ? 200 : 300), 512 + Math.sin(a + 0.05) * (i % 4 ? 200 : 300));
      g.fill();
    }
    g.fillStyle = "#c9a227";
    g.beginPath();
    g.arc(512, 512, 26, 0, Math.PI * 2);
    g.fill();
  }).t;
  const esp = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), new THREE.MeshStandardMaterial({ map: ground, roughness: 0.95 }));
  esp.rotation.x = -Math.PI / 2;
  esp.position.y = 0.01;
  k.frame.add(esp);
  // gardens to both sides and in front/behind: lawns with box hedges and gravel alleys
  const lawnTex = makeCanvas(256, 256, (g) => {
    g.fillStyle = "#4f8a3a";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? "#57943f" : "#4a8336";
      g.fillRect(i * 16, 0, 16, 256);
    }
    g.strokeStyle = "#2c5a2c";
    g.lineWidth = 10;
    g.strokeRect(5, 5, 246, 246);
  }).t;
  const lawnMat = new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 1 });
  const gravel = new THREE.MeshStandardMaterial({ color: "#cfc2a2", roughness: 1 });
  const big = new THREE.Mesh(new THREE.PlaneGeometry(240, 120), gravel);
  big.rotation.x = -Math.PI / 2;
  big.position.y = -0.01;
  k.frame.add(big);
  for (const sx of [-1, 1])
    for (const [z0, z1] of [
      [-26, -3],
      [3, 26],
    ])
      for (const [x0, x1] of [
        [31, 52],
        [58, 80],
      ]) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), lawnMat);
        l.rotation.x = -Math.PI / 2;
        l.position.set((sx * (x0 + x1)) / 2, 0.02, (z0 + z1) / 2);
        k.frame.add(l);
      }
  // alleys of chestnut trees along the gardens
  const trees: [number, number, number][] = [];
  for (const sx of [-1, 1]) for (let x = 32; x < 84; x += 6) for (const z of [-30, 30]) trees.push([sx * x, z, 3 + ((x * 7) % 5) * 0.25]);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 1, 6), std("#4a3426", 0.9), trees.length);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), std("#356f35", 0.95), trees.length);
  trees.forEach(([x, z, s], i) => {
    trunks.setMatrixAt(i, new THREE.Matrix4().compose(V(x, 1.4, z), new THREE.Quaternion(), V(1, 2.8, 1)));
    crowns.setMatrixAt(i, new THREE.Matrix4().compose(V(x, 2.8 + s * 0.8, z), new THREE.Quaternion(), V(s, s * 0.85, s)));
  });
  k.frame.add(trunks, crowns);
  // the carousel in the west garden
  const car = new THREE.Group();
  car.position.set(-44, 0, 14);
  const deckC = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.4, 24), std("#d8c8a8", 0.7));
  deckC.position.y = 0.2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.8, 2, 16), std("#c83a3a", 0.7));
  roof.position.y = 4.6;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.5, 16, 1, true), k.glow("#ffe0a0", 0.9, 2.2));
  rim.position.y = 3.4;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3.4, 12), std("#d8b860", 0.4, 0.7));
  pole.position.y = 1.9;
  car.add(deckC, roof, rim, pole);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), k.brass);
    p.position.set(Math.cos(a) * 3.4, 1.9, Math.sin(a) * 3.4);
    const horse = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.9), std(["#f4f0e8", "#3a2a20", "#c8a070"][i % 3], 0.6));
    horse.position.set(Math.cos(a) * 3.4, 1.2 + (i % 2) * 0.3, Math.sin(a) * 3.4);
    horse.rotation.y = -a;
    car.add(p, horse);
  }
  k.frame.add(car);
  k.ticks.forEach((t) => t.push((dt) => (car.rotation.y += dt * 0.4)));
  // tiny strollers on the alleys (seen from above)
  const n = 70;
  const walkers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 1.6, 0.35), new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
  const wk = Array.from({ length: n }, (_, i) => ({ x: (Math.random() - 0.5) * 150, z: [-28, -1.5, 1.5, 28, -22, 22][i % 6], v: (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.6) }));
  const col = new THREE.Color();
  wk.forEach((_, i) => walkers.setColorAt(i, col.set(["#2a3a5a", "#7a2a2a", "#d8c8a8", "#2a2a30", "#3a6a4a", "#b05a8a", "#e0e0e0"][i % 7])));
  const mm = new THREE.Matrix4();
  const moveWalkers = (dt: number) => {
    wk.forEach((w, i) => {
      w.x += w.v * dt;
      if (w.x > 80) w.x = -80;
      if (w.x < -80) w.x = 80;
      // nobody walks through the piers or the carousel
      const hidden = Math.abs(w.z) < 24 && Math.abs(w.x) < 24;
      walkers.setMatrixAt(i, mm.makeTranslation(w.x, hidden ? -10 : 0.8, w.z));
    });
    walkers.instanceMatrix.needsUpdate = true;
  };
  moveWalkers(0);
  k.frame.add(walkers);
  for (let f = 1; f < 4; f++) k.ticks[f].push(moveWalkers);
}
