import * as THREE from "three";
import { BBKit, canvasTex, HALL, londonTime, MONO, openWall, quadGeo, rnd, SANS, SC, SERIF, STEPS, TOWER, Y0, type Zone } from "./kit";

/**
 * Floor 0: Westminster Hall (1097), entered by the great north door: flagstones, the hammerbeam roof
 * of 1393 with its carved angels, the brass plaques of the trials and lyings-in-state in the floor,
 * St Stephen's steps up to the great window; through the arch at the top, the passage to the foot
 * of the Elizabeth Tower, where the 334 steps begin.
 */
export function buildHall(k: BBKit, blocks: { last: number | null; strikes: number }) {
  const z: Zone = "hall";
  const g = k.groups.hall;
  const { x0, x1, z0, z1, wall: WH, ridge: RY } = HALL;
  const W = x1 - x0,
    L = z1 - z0;

  // ---- floor: York stone flags ------------------------------------------------------------------
  const flags = canvasTex(1024, 1024, (c, w, h) => {
    const r = rnd(11);
    const rows = 6;
    for (let j = 0; j < rows; j++) {
      let x = -r() * 120;
      while (x < w) {
        const fw = 140 + r() * 140;
        const k2 = 0.88 + r() * 0.16;
        c.fillStyle = `rgb(${190 * k2},${180 * k2},${160 * k2})`;
        c.fillRect(x, (j * h) / rows, fw, h / rows);
        for (let n = 0; n < 60; n++) {
          c.fillStyle = `rgba(${r() < 0.5 ? "80,70,55" : "250,240,220"},0.05)`;
          c.fillRect(x + r() * fw, (j * h) / rows + r() * (h / rows), 3 + r() * 10, 2 + r() * 5);
        }
        c.strokeStyle = "rgba(60,50,40,0.6)";
        c.lineWidth = 3;
        c.strokeRect(x, (j * h) / rows, fw, h / rows);
        x += fw;
      }
    }
  }, [W / 5, L / 5]);
  const floorMat = new THREE.MeshStandardMaterial({ map: flags, roughness: 0.7, metalness: 0.02 });
  const floor = new THREE.PlaneGeometry(W, L);
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, 0, (z0 + z1) / 2);
  k.geo(z, floorMat, floor);

  // ---- the walls: Norman masonry, high windows between the trusses ----------------------------
  const wallMat = k.stoneRep(L / 2.4, WH / 2.4);
  const bays = 12;
  const bayZ = (i: number) => z0 + 2 + (i * (L - 4)) / bays;
  const winMat = new THREE.MeshBasicMaterial({ color: "#cfdcec" });
  k.dayNight.push((n) => winMat.color.set(n ? "#1c2440" : "#d8e4f2"));
  const leaded = canvasTex(128, 256, (c, w, h) => {
    c.fillStyle = "#fff";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#222";
    c.lineWidth = 4;
    for (let y = 0; y < h; y += 24) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y + 12);
      c.stroke();
      c.beginPath();
      c.moveTo(w, y);
      c.lineTo(0, y + 12);
      c.stroke();
    }
    c.lineWidth = 10;
    c.strokeRect(0, 0, w, h);
    c.beginPath();
    c.moveTo(w / 2, 0);
    c.lineTo(w / 2, h);
    c.stroke();
  });
  winMat.map = leaded;
  for (const side of [-1, 1]) {
    const x = side * (W / 2 + 0.3);
    const holes: [number, number, number, number][] = [];
    for (let i = 0; i < bays; i++) if (i % 2 === 0) holes.push([(bayZ(i) + bayZ(i + 1)) / 2, 1.3, 7.0, 9.6]);
    openWall(k, z, wallMat, "z", x, z0, z1, 0, WH, holes, 0.6);
    for (const [c, w, h0, h1] of holes) {
      const p = new THREE.PlaneGeometry(w, h1 - h0);
      p.rotateY(side < 0 ? Math.PI / 2 : -Math.PI / 2);
      p.translate(side * (W / 2 + 0.5), h0 + (h1 - h0) / 2, c);
      k.geo(z, winMat, p);
      // a pointed head over the opening
      for (let j = 0; j < 4; j++) k.box(z, k.stoneLt, 0.62, 0.12, w - j * 0.3, side * (W / 2 + 0.3), h1 + j * 0.12, c);
      k.box(z, k.stoneLt, 0.75, 0.1, w + 0.3, side * (W / 2 + 0.2), h0 - 0.1, c);
    }
    // string course, plinth bench along the wall (the stone seat of the medieval hall)
    k.box(z, k.stoneLt, 0.3, 0.2, L, side * (W / 2 - 0.05), 6.6, (z0 + z1) / 2);
    k.box(z, k.stoneDk, 0.55, 0.45, L - 0.4, side * (W / 2 - 0.27), 0, (z0 + z1) / 2);
    k.solid(z, side < 0 ? x0 : x1 - 0.55, z0, side < 0 ? x0 + 0.55 : x1, z1);
  }
  // the north wall (the way you came in): the great doors
  openWall(k, z, wallMat, "x", z1 + 0.3, x0, x1, 0, WH, [[0, 4.4, 0, 6.2]], 0.6);
  {
    for (const s of [-1, 1]) {
      k.box(z, k.oakDk, 2.15, 6.1, 0.15, s * 1.1, 0, z1 + 0.15);
      for (let y = 0.4; y < 6; y += 0.7) k.box(z, k.iron, 1.8, 0.06, 0.05, s * 1.1, y, z1 + 0.05);
      k.box(z, k.brass, 0.1, 0.4, 0.1, s * 0.25, 2.6, z1 + 0.04);
    }
    // the arch over the door
    for (let j = 0; j < 6; j++) k.box(z, k.stoneLt, 4.8 - j * 0.75, 0.22, 0.7, 0, 6.2 + j * 0.22, z1 + 0.3);
  }
  // the south wall: the arch to the tower, the great window
  openWall(k, z, wallMat, "x", z0 - 0.3, x0, x1, Y0, WH - Y0, [[0, 3, 0, 3.6, true]], 0.6);
  k.box(z, wallMat, W, Y0, 0.6, 0, 0, z0 - 0.3);
  for (const s of [-1, 1]) {
    // gables over both ends
    const tri = new THREE.Shape();
    tri.moveTo(x0, WH);
    tri.lineTo(x1, WH);
    tri.lineTo(0, RY + 0.3);
    tri.lineTo(x0, WH);
    const gg = new THREE.ShapeGeometry(tri);
    const uv = gg.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.4, uv.getY(i) / 2.4);
    if (s > 0) gg.rotateY(Math.PI);
    gg.translate(0, 0, s < 0 ? z0 : z1);
    k.geo(z, k.stone, gg);
  }
  // the great south window: Perpendicular tracery, stained glass
  const glassTex = canvasTex(512, 768, (c, w, h) => {
    const r = rnd(5);
    const cols = ["#9a1c22", "#1d3c8a", "#c8a030", "#1e6a40", "#6a2a7a", "#d8d0b0", "#b84a1a"];
    for (let y = 0; y < h; y += 16)
      for (let x = 0; x < w; x += 16) {
        c.fillStyle = cols[Math.floor(r() * (r() < 0.4 ? 2 : cols.length))];
        c.fillRect(x, y, 16, 16);
      }
    // figures: a row of crowned kings in the lights
    for (let i = 0; i < 7; i++) {
      const cx = ((i + 0.5) * w) / 7;
      c.fillStyle = "#e8dcb8";
      c.fillRect(cx - 14, 430, 28, 120);
      c.beginPath();
      c.arc(cx, 412, 15, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#e0b030";
      c.fillRect(cx - 14, 390, 28, 10);
      c.fillStyle = cols[i % 3];
      c.fillRect(cx - 18, 460, 36, 90);
    }
    // leading and the stone tracery
    c.strokeStyle = "rgba(20,15,10,0.85)";
    c.lineWidth = 2;
    for (let y = 0; y < h; y += 16) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    c.strokeStyle = "#c8b890";
    c.lineWidth = 9;
    for (let i = 1; i < 7; i++) {
      c.beginPath();
      c.moveTo((i * w) / 7, h * 0.3);
      c.lineTo((i * w) / 7, h);
      c.stroke();
    }
    for (const y of [h * 0.55, h * 0.78]) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    for (let i = 0; i < 7; i++) {
      c.beginPath();
      c.arc(((i + 0.5) * w) / 7, h * 0.3, w / 14, Math.PI, 0);
      c.stroke();
    }
    c.beginPath();
    c.arc(w / 2, h * 0.17, w * 0.12, 0, Math.PI * 2);
    c.stroke();
  });
  const sgMat = new THREE.MeshBasicMaterial({ map: glassTex, color: "#ffffff" });
  k.dayNight.push((n) => sgMat.color.set(n ? "#5a5466" : "#ffffff"));
  {
    const ww = 10,
      wh = 13,
      wy = 6.4;
    const sh = new THREE.Shape();
    sh.moveTo(-ww / 2, 0);
    sh.lineTo(ww / 2, 0);
    sh.lineTo(ww / 2, wh * 0.68);
    sh.quadraticCurveTo(ww / 2, wh * 0.9, 0, wh);
    sh.quadraticCurveTo(-ww / 2, wh * 0.9, -ww / 2, wh * 0.68);
    sh.lineTo(-ww / 2, 0);
    const wg = new THREE.ShapeGeometry(sh, 16);
    const uv = wg.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + ww / 2) / ww, uv.getY(i) / wh);
    wg.translate(0, wy, z0 + 0.02);
    k.geo(z, sgMat, wg);
    // the moulded frame round it
    const fr = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sh.getPoints(24).map((p) => new THREE.Vector3(p.x, p.y + wy, z0 + 0.08))), 64, 0.16, 6, false);
    k.geo(z, k.stoneLt, fr);
    // kings in niches either side
    for (const s of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const nx = s * (6.2 + i * 0.95),
          ny = 7.2;
        k.box(z, k.stoneDk, 0.75, 2.2, 0.2, nx, ny, z0 + 0.1);
        k.box(z, k.stoneLt, 0.32, 1.25, 0.3, nx, ny + 0.2, z0 + 0.3);
        k.box(z, k.stoneLt, 0.22, 0.24, 0.24, nx, ny + 1.45, z0 + 0.3);
        k.box(z, k.gold, 0.26, 0.1, 0.26, nx, ny + 1.69, z0 + 0.3);
        k.box(z, k.stoneLt, 0.9, 0.12, 0.4, nx, ny - 0.1, z0 + 0.2);
        k.box(z, k.stoneLt, 0.85, 0.3, 0.3, nx, ny + 2.2, z0 + 0.15);
      }
  }

  // ---- St Stephen's steps and the landing ------------------------------------------------------
  const stepH = Y0 / STEPS.n;
  const stepD = (STEPS.z1 - STEPS.z0) / STEPS.n;
  for (let i = 0; i < STEPS.n; i++) {
    const zz = STEPS.z1 - (i + 0.5) * stepD;
    k.box(z, k.stoneLt, W - 1.1, (i + 1) * stepH, stepD, 0, 0, zz);
  }
  k.box(z, k.stone, W - 1.1, Y0, z0 - STEPS.z0 + 0.3, 0, 0, (STEPS.z0 + z0) / 2 - 0.15);
  // brass rails on the steps, a carpet runner up the middle
  const runner = new THREE.MeshStandardMaterial({ color: "#7a1a20", roughness: 0.95 });
  for (let i = 0; i < STEPS.n; i++) k.box(z, runner, 2.2, 0.012, stepD, 0, (i + 1) * stepH, STEPS.z1 - (i + 0.5) * stepD);
  k.box(z, runner, 2.2, 0.012, z0 - STEPS.z0 + 0.4, 0, Y0, (STEPS.z0 + z0) / 2);
  k.box(z, runner, 2.2, 0.006, 30, 0, 0, -21);
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(s * 1.6, 0.95, STEPS.z1 + 0.2),
      b = new THREE.Vector3(s * 1.6, Y0 + 0.95, STEPS.z0);
    k.beam(z, k.brass, a, b, 0.05, 0.05);
    for (let i = 0; i <= 4; i++) {
      const p = a.clone().lerp(b, i / 4);
      k.box(z, k.brass, 0.04, 0.95, 0.04, p.x, p.y - 0.95, p.z);
    }
  }

  // ---- the hammerbeam roof ------------------------------------------------------------------------
  const roofTex = canvasTex(256, 256, (c, w, h) => {
    const r = rnd(2);
    for (let x = 0; x < w; x += 32) {
      const k2 = 0.8 + r() * 0.3;
      c.fillStyle = `rgb(${92 * k2},${64 * k2},${40 * k2})`;
      c.fillRect(x, 0, 32, h);
      c.fillStyle = "rgba(20,10,5,0.6)";
      c.fillRect(x, 0, 2, h);
      for (let n = 0; n < 30; n++) {
        c.fillStyle = `rgba(30,18,8,${0.1 + r() * 0.15})`;
        c.fillRect(x + r() * 32, r() * h, 1 + r() * 2, 10 + r() * 40);
      }
    }
  }, [6, 12]);
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.85, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const e = new THREE.Vector3(s * (W / 2 + 0.6), WH - 0.1, z0),
      r = new THREE.Vector3(0, RY + 0.35, z0);
    const p = quadGeo(e, e.clone().setZ(z1), r.clone().setZ(z1), r, 3);
    k.geo(z, roofMat, p);
  }
  const V = (x: number, y: number, zz: number) => new THREE.Vector3(x, y, zz);
  const angelMat = new THREE.MeshStandardMaterial({ color: "#a07a48", roughness: 0.6, metalness: 0.2 });
  const angels: THREE.Vector3[] = [];
  for (let i = 0; i <= bays; i++) {
    const zz = bayZ(i);
    for (const s of [-1, 1]) {
      const X = (x: number) => s * x;
      k.box(z, k.stoneLt, 0.5, 0.4, 0.6, X(8.75), 6.4, zz); // corbel
      k.beam(z, k.oak, V(X(8.8), 6.8, zz), V(X(8.8), 10.6, zz), 0.36, 0.45); // wall post
      k.beam(z, k.oak, V(X(9.1), 10.45, zz), V(X(6.3), 10.45, zz), 0.45, 0.5); // hammer beam
      k.beam(z, k.oak, V(X(6.6), 10.7, zz), V(X(6.6), 15.2, zz), 0.32, 0.38); // hammer post
      // the great arch: from the wall post up to the collar, in segments
      let prev = V(X(8.6), 7.0, zz);
      for (let j = 1; j <= 10; j++) {
        const t = (j / 10) * (Math.PI / 2);
        const p = V(X(8.6 - 4.9 * Math.sin(t)), 7.0 + 9.4 * (1 - Math.cos(t)), zz);
        k.beam(z, k.oakDk, prev, p, 0.24, 0.42);
        prev = p;
      }
      // the brace under the hammer beam
      prev = V(X(8.7), 8.4, zz);
      for (let j = 1; j <= 5; j++) {
        const t = (j / 5) * (Math.PI / 2);
        const p = V(X(8.7 - 2.1 * Math.sin(t)), 8.4 + 1.85 * (1 - Math.cos(t)), zz);
        k.beam(z, k.oakDk, prev, p, 0.2, 0.3);
        prev = p;
      }
      k.beam(z, k.oak, V(X(W / 2 + 0.3), WH, zz), V(0, RY, zz), 0.36, 0.42); // principal rafter
      angels.push(V(X(6.25), 10.2, zz));
    }
    k.beam(z, k.oak, V(-3.9, 16.4, zz), V(3.9, 16.4, zz), 0.34, 0.42); // collar
    k.beam(z, k.oak, V(0, 16.4, zz), V(0, RY, zz), 0.26, 0.3); // king post
    for (const s of [-1, 1]) k.beam(z, k.oakDk, V(s * 0.1, 18.0, zz), V(s * 2.6, 19.0, zz), 0.18, 0.24);
  }
  // purlins and ridge
  for (const s of [-1, 1])
    for (const t of [0.22, 0.45, 0.68, 0.88]) {
      const x = s * (W / 2 + 0.3) * (1 - t),
        y = WH + (RY - WH) * t - 0.32;
      k.beam(z, k.oak, V(x, y, z0), V(x, y, z1), 0.26, 0.3);
    }
  k.beam(z, k.oak, V(0, RY - 0.1, z0), V(0, RY - 0.1, z1), 0.3, 0.3);
  // the carved angels on the hammer beams: holding shields, wings spread
  const wing = new THREE.Shape();
  wing.moveTo(0, 0);
  wing.quadraticCurveTo(0.5, 0.25, 0.75, 0.9);
  wing.quadraticCurveTo(0.35, 0.55, 0, 0.35);
  for (const p of angels) {
    const s = Math.sign(p.x);
    k.box(z, angelMat, 0.28, 0.62, 0.28, p.x - s * 0.05, p.y - 0.6, p.z);
    k.box(z, angelMat, 0.2, 0.2, 0.2, p.x - s * 0.05, p.y + 0.02, p.z);
    k.box(z, k.gold, 0.06, 0.3, 0.32, p.x - s * 0.22, p.y - 0.5, p.z); // the shield
    k.box(z, k.red, 0.065, 0.12, 0.2, p.x - s * 0.225, p.y - 0.42, p.z);
    for (const side of [-1, 1]) {
      const wg = new THREE.ShapeGeometry(wing);
      wg.scale(side, 1, 1);
      wg.rotateY(Math.PI / 2);
      wg.translate(p.x + s * 0.05, p.y - 0.35, p.z + side * 0.08);
      k.geo(z, angelMat, wg);
    }
  }
  // lanterns hanging from the collars on long chains
  for (const zz of [bayZ(2), bayZ(5), bayZ(8), bayZ(11)])
    for (const s of [-1, 1]) {
      const x = s * 3.6;
      k.beam(z, k.iron, V(x, 7.6, zz), V(x * 1.05, 16.3, zz), 0.03, 0.03);
      k.box(z, k.brass, 0.75, 0.08, 0.75, x, 7.55, zz);
      k.box(z, k.warm, 0.5, 0.75, 0.5, x, 6.8, zz);
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) k.box(z, k.brass, 0.05, 0.85, 0.05, x + dx * 0.3, 6.72, zz + dz * 0.3);
      k.box(z, k.brass, 0.62, 0.06, 0.62, x, 6.7, zz);
      k.cyl(z, k.brass, 0.18, 0.3, x, 7.62, zz, 8, 0.02);
    }

  // ---- the brass plaques in the floor ---------------------------------------------------------
  const PLAQUES: { lines: string[]; title: string; stats: [string, string][]; z: number }[] = [
    { lines: ["SIR WILLIAM WALLACE", "TRIED HERE · 1305"], title: "Sir William Wallace", stats: [["Trial", "23 August 1305"], ["Verdict", "Treason"]], z: -9 },
    { lines: ["SIR THOMAS MORE", "TRIED HERE · 1535"], title: "Sir Thomas More", stats: [["Trial", "1 July 1535"], ["Verdict", "Treason"]], z: -14 },
    { lines: ["GUY FAWKES", "TRIED HERE · 1606"], title: "Guy Fawkes", stats: [["Trial", "27 January 1606"], ["Plot", "Gunpowder, 5 November 1605"]], z: -19 },
    { lines: ["KING CHARLES I", "TRIED HERE · 1649"], title: "King Charles I", stats: [["Trial", "20–27 January 1649"], ["Verdict", "Treason"]], z: -24 },
    { lines: ["WARREN HASTINGS", "TRIED HERE · 1788–1795"], title: "Warren Hastings", stats: [["Impeachment", "1788–1795"], ["Verdict", "Acquitted"]], z: -29 },
    { lines: ["QUEEN ELIZABETH II", "LYING IN STATE · 2022"], title: "Queen Elizabeth II", stats: [["Lying in state", "14–19 September 2022"]], z: -33.5 },
  ];
  for (const p of PLAQUES) {
    const m = k.plaque(p.lines, 1.5, 0.46);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.z === -33.5 ? 0 : 0, 0.012, p.z);
    g.add(m);
    k.pick(z, m, `<b>${p.title}</b><span>brass plaque</span>`, () => ({ eyebrow: "Westminster Hall", title: p.title, stats: p.stats }));
  }

  // ---- the tour desk and the strike board ---------------------------------------------------
  {
    const dx = -6.2,
      dz = -32;
    k.box(z, k.oakDk, 2.4, 1.05, 0.7, dx, 0, dz);
    k.box(z, k.oak, 2.5, 0.06, 0.8, dx, 1.05, dz);
    k.solid(z, dx - 1.3, dz - 0.45, dx + 1.3, dz + 0.45);
    const sign = k.panel(1024, 200, 0.42, (c, w, h) => {
      c.fillStyle = "#14203e";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "#c9a04a";
      c.lineWidth = 6;
      c.strokeRect(8, 8, w - 16, h - 16);
      c.fillStyle = "#e8c66a";
      c.font = `700 92px ${SERIF}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("ELIZABETH TOWER TOURS", w / 2, h / 2 + 4);
    });
    sign.position.set(dx, 1.4, dz + 0.36);
    g.add(sign);
    k.box(z, k.brass, 0.05, 0.4, 0.05, dx - 1.05, 1.1, dz + 0.36);
    k.box(z, k.brass, 0.05, 0.4, 0.05, dx + 1.05, 1.1, dz + 0.36);
  }
  // the board: block height, last strike, London time (redrawn every second)
  const board = document.createElement("canvas");
  board.width = 640;
  board.height = 800;
  const bt = new THREE.CanvasTexture(board);
  bt.colorSpace = THREE.SRGBColorSpace;
  const drawBoard = () => {
    const c = board.getContext("2d")!;
    const w = board.width,
      h = board.height;
    c.fillStyle = "#121a30";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#c9a04a";
    c.lineWidth = 10;
    c.strokeRect(10, 10, w - 20, h - 20);
    c.textAlign = "center";
    c.fillStyle = "#e8c66a";
    c.font = `700 64px ${SERIF}`;
    c.fillText("THE GREAT BELL", w / 2, 110);
    c.fillStyle = "#8b93ad";
    c.font = `500 30px ${SANS}`;
    c.fillText("LAST STRIKE", w / 2, 210);
    c.fillStyle = "#f4b728";
    c.font = `700 70px ${MONO}`;
    c.fillText(blocks.last ? `#${blocks.last.toLocaleString("en-US")}` : "—", w / 2, 290);
    c.fillStyle = "#8b93ad";
    c.font = `500 30px ${SANS}`;
    c.fillText("STRIKES", w / 2, 390);
    c.fillStyle = "#ffffff";
    c.font = `700 64px ${MONO}`;
    c.fillText(String(blocks.strikes), w / 2, 465);
    c.fillStyle = "#8b93ad";
    c.font = `500 30px ${SANS}`;
    c.fillText("LONDON", w / 2, 565);
    const t = londonTime();
    c.fillStyle = "#ffffff";
    c.font = `700 84px ${MONO}`;
    c.fillText(`${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}:${String(Math.floor(t.s)).padStart(2, "0")}`, w / 2, 655);
    c.fillStyle = "#e8c66a";
    c.font = `600 34px ${SERIF}`;
    c.fillText("334 STEPS · 13.7 TONNES · E", w / 2, 740);
    bt.needsUpdate = true;
  };
  drawBoard();
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), new THREE.MeshBasicMaterial({ map: bt }));
  boardMesh.position.set(6.2, 1.55, -32);
  g.add(boardMesh);
  k.beam(z, k.oak, V(5.7, 0, -31.7), V(5.75, 2.4, -32.05), 0.06, 0.06);
  k.beam(z, k.oak, V(6.7, 0, -31.7), V(6.65, 2.4, -32.05), 0.06, 0.06);
  k.beam(z, k.oak, V(6.2, 0, -32.6), V(6.2, 2.3, -32.08), 0.06, 0.06);
  k.solid(z, 5.6, -32.7, 6.8, -31.6);
  let acc = 0;
  k.ticks.hall.push((dt) => {
    acc += dt;
    if (acc > 1) {
      acc = 0;
      drawBoard();
    }
  });
  k.pick(z, boardMesh, "<b>The Great Bell</b><span>strikes on every block</span>", () => ({
    eyebrow: "Elizabeth Tower",
    title: "The Great Bell",
    stats: [
      ["Last strike", blocks.last ? `#${blocks.last.toLocaleString("en-US")}` : "—"],
      ["Strikes", String(blocks.strikes)],
      ["Weight", "13.7 t"],
      ["Note", "E"],
    ],
  }));
  // brass stanchions and red ropes guiding to the steps
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const zz = -34.5 + i * 1.6;
      k.cyl(z, k.brass, 0.04, 0.95, s * 2.4, 0, zz, 8);
      k.cyl(z, k.brass, 0.16, 0.05, s * 2.4, 0, zz, 12);
      k.box(z, k.brass, 0.1, 0.1, 0.1, s * 2.4, 0.95, zz);
      if (i < 4) k.beam(z, k.red, V(s * 2.4, 0.9, zz), V(s * 2.4, 0.9, zz + 1.6), 0.04, 0.04);
    }
    k.solid(z, s * 2.4 - 0.1, -34.6, s * 2.4 + 0.1, -28);
  }

  // ---- the passage and the tower foot -----------------------------------------------------------
  const PZ0 = TOWER.z1,
    PZ1 = z0 - 0.6;
  const pas = k.stoneRep(2, 1.6);
  k.wall(z, pas, -1.75, PZ0, -1.75, PZ1, Y0, 3.8, 0.5);
  k.wall(z, pas, 1.75, PZ0, 1.75, PZ1, Y0, 3.8, 0.5);
  k.box(z, k.stoneDk, 3.5, 0.3, PZ1 - PZ0 + 0.4, 0, Y0 + 3.6, (PZ0 + PZ1) / 2);
  k.box(z, k.stone, 3.5, 0.05, PZ1 - PZ0 + 0.6, 0, Y0 - 0.05, (PZ0 + PZ1) / 2);
  k.box(z, runner, 1.8, 0.012, PZ1 - PZ0 + 0.6, 0, Y0, (PZ0 + PZ1) / 2);
  k.box(z, k.warm, 0.5, 0.1, 0.5, 0, Y0 + 3.48, (PZ0 + PZ1) / 2);

  const T = TOWER;
  const TH = 4.4;
  const base = k.stoneRep(16 / 2.4, TH / 2.4);
  // floor and ceiling of the tower foot (the well cut out of the ceiling)
  const tf = new THREE.PlaneGeometry(T.x1 - T.x0, T.z1 - T.z0);
  tf.rotateX(-Math.PI / 2);
  tf.translate(0, Y0, (T.z0 + T.z1) / 2);
  k.geo(z, floorMat, tf);
  // walls: windows on the outer sides, the doorway from the passage
  openWall(k, z, base, "x", T.z1, T.x0, T.x1, Y0, TH, [[0, 3, 0, 3.4, true]], 0.5);
  openWall(k, z, base, "x", T.z0, T.x0, T.x1, Y0, TH, [[-4, 1, 1.2, 3.4], [0, 1, 1.2, 3.4]], 0.5);
  openWall(k, z, base, "z", T.x0, T.z0, T.z1, Y0, TH, [[-60, 1, 1.2, 3.4], [-56, 1, 1.2, 3.4], [-52, 1, 1.2, 3.4]], 0.5);
  openWall(k, z, base, "z", T.x1, T.z0, T.z1, Y0, TH, [[-60, 1, 1.2, 3.4], [-56, 1, 1.2, 3.4]], 0.5);
  windowBars(k, z, [
    ["x", T.z0, -4, Y0 + 1.2, Y0 + 3.4],
    ["x", T.z0, 0, Y0 + 1.2, Y0 + 3.4],
    ["z", T.x0, -60, Y0 + 1.2, Y0 + 3.4],
    ["z", T.x0, -56, Y0 + 1.2, Y0 + 3.4],
    ["z", T.x0, -52, Y0 + 1.2, Y0 + 3.4],
    ["z", T.x1, -60, Y0 + 1.2, Y0 + 3.4],
    ["z", T.x1, -56, Y0 + 1.2, Y0 + 3.4],
  ]);
  // a vaulted ceiling: ribs crossing
  k.box(z, k.stoneDk, 16, 0.3, 16, 0, Y0 + TH, -56);
  for (const s of [-1, 1]) k.beam(z, k.stoneLt, V(-8, Y0 + TH - 0.05, -56 + s * 8), V(8, Y0 + TH - 0.05, -56 - s * 8), 0.25, 0.2);
  k.box(z, k.gold, 0.6, 0.1, 0.6, 0, Y0 + TH - 0.15, -56);
  // the tower model on a plinth, the guide's lectern, the strike notice
  model(k, z, -4.5, Y0, -58.5);
  k.solid(z, -5.3, -59.3, -3.7, -57.7);
  const sign = k.panel(1024, 400, 0.9, (c, w, h) => {
    c.fillStyle = "#14203e";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#c9a04a";
    c.lineWidth = 8;
    c.strokeRect(10, 10, w - 20, h - 20);
    c.textAlign = "center";
    c.fillStyle = "#e8c66a";
    c.font = `700 150px ${SERIF}`;
    c.fillText("334 STEPS", w / 2, 175);
    c.font = `500 64px ${SERIF}`;
    c.fillStyle = "#ffffff";
    c.fillText("PRISON ROOM 118 · CLOCK 262 · BELL 334", w / 2, 300);
  });
  sign.position.set(-2, Y0 + 2.6, T.z0 + 0.26);
  g.add(sign);
  // benches along the west wall
  for (const zz of [-61, -53]) {
    k.box(z, k.oak, 0.5, 0.45, 2.2, T.x0 + 0.6, Y0, zz);
    k.box(z, k.oakDk, 0.08, 0.5, 2.2, T.x0 + 0.38, Y0 + 0.45, zz);
    k.solid(z, T.x0, zz - 1.1, T.x0 + 0.9, zz + 1.1);
  }
  // a carpet from the passage to the stair, banners with the portcullis
  k.box(z, runner, 2, 0.012, 3.2, 0, Y0, -49.7);
  k.beam(z, runner, V(0, Y0 + 0.006, -51.2), V(2.9, Y0 + 0.006, -53.1), 1.6, 0.012);
  const banner = canvasTex(256, 512, (c, w, h) => {
    c.fillStyle = "#1d6a3a";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#8e1f22";
    c.fillRect(0, h * 0.82, w, h * 0.18);
    c.strokeStyle = "#e0b448";
    c.lineWidth = 10;
    c.strokeRect(14, 14, w - 28, h - 28);
    // the portcullis
    c.lineWidth = 12;
    const x0 = 58,
      x1 = w - 58,
      y0 = 150,
      y1 = 330;
    for (let i = 0; i <= 4; i++) {
      const x = x0 + ((x1 - x0) * i) / 4;
      c.beginPath();
      c.moveTo(x, y0);
      c.lineTo(x, y1 + 20);
      c.stroke();
    }
    for (let j = 0; j <= 3; j++) {
      const y = y0 + ((y1 - y0) * j) / 3;
      c.beginPath();
      c.moveTo(x0 - 10, y);
      c.lineTo(x1 + 10, y);
      c.stroke();
    }
    c.lineWidth = 6;
    for (const s2 of [-1, 1]) {
      c.beginPath();
      c.moveTo(w / 2 + s2 * 60, y0);
      c.quadraticCurveTo(w / 2 + s2 * 110, 90, w / 2 + s2 * 70, 70);
      c.stroke();
    }
    c.fillStyle = "#e0b448";
    c.beginPath();
    c.arc(w / 2, 80, 16, 0, Math.PI * 2);
    c.fill();
  });
  const bMat = new THREE.MeshStandardMaterial({ map: banner, roughness: 0.9, side: THREE.DoubleSide });
  for (const [bx, bz, ry] of [
    [T.x0 + 0.27, -57.5, Math.PI / 2],
    [2.6, T.z0 + 0.27, 0],
    [6, T.z0 + 0.27, 0],
  ] as [number, number, number][]) {
    const bp = new THREE.PlaneGeometry(1.1, 2.2);
    bp.rotateY(ry);
    bp.translate(bx, Y0 + 2.2, bz);
    k.geo(z, bMat, bp);
    const rodG = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6);
    rodG.rotateZ(Math.PI / 2);
    rodG.rotateY(ry);
    rodG.translate(bx, Y0 + 3.33, bz);
    k.geo(z, k.brass, rodG);
  }
  // a rope on brass posts round the well's door, the lamp
  k.box(z, k.warm, 0.4, 0.08, 0.4, 2, Y0 + TH - 0.1, -54);
  k.box(z, k.warm, 0.4, 0.08, 0.4, -3, Y0 + TH - 0.1, -60);
  void SC;
}

/** Iron bars and a stone sill in each window opening listed: [axis, fixed, centre, y0, y1]. */
export function windowBars(k: BBKit, z: Zone, list: [("x" | "z"), number, number, number, number][], w = 1) {
  for (const [axis, fixed, c, y0, y1] of list) {
    for (let i = 1; i < 4; i++) {
      const o = -w / 2 + (i * w) / 4;
      if (axis === "x") k.box(z, k.iron, 0.03, y1 - y0, 0.03, c + o, y0, fixed);
      else k.box(z, k.iron, 0.03, y1 - y0, 0.03, fixed, y0, c + o);
    }
    if (axis === "x") {
      k.box(z, k.iron, w, 0.03, 0.03, c, (y0 + y1) / 2, fixed);
      k.box(z, k.stoneLt, w + 0.2, 0.08, 0.7, c, y0 - 0.08, fixed);
    } else {
      k.box(z, k.iron, 0.03, 0.03, w, fixed, (y0 + y1) / 2, c);
      k.box(z, k.stoneLt, 0.7, 0.08, w + 0.2, fixed, y0 - 0.08, c);
    }
  }
}

/** A table model of the Elizabeth Tower, 1.6 m tall on a 1 m plinth. */
function model(k: BBKit, z: Zone, x: number, y: number, zz: number) {
  k.box(z, k.oakDk, 1.4, 1.0, 1.4, x, y, zz);
  k.box(z, k.glass, 1.3, 1.9, 1.3, x, y + 1.0, zz);
  const b = y + 1.0;
  k.box(z, k.stoneLt, 0.32, 0.9, 0.32, x, b, zz);
  k.box(z, k.stoneLt, 0.36, 0.34, 0.36, x, b + 0.9, zz);
  for (const [dx, dz] of [
    [0, 0.181],
    [0, -0.181],
    [0.181, 0],
    [-0.181, 0],
  ]) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), k.warmSoft);
    d.position.set(x + dx, b + 1.07, zz + dz);
    d.lookAt(x + dx * 10, b + 1.07, zz + dz * 10);
    k.groups[z].add(d);
  }
  k.box(z, k.stoneLt, 0.3, 0.2, 0.3, x, b + 1.24, zz);
  k.box(z, k.warmSoft, 0.2, 0.1, 0.2, x, b + 1.44, zz);
  const sp = new THREE.ConeGeometry(0.17, 0.4, 4);
  sp.rotateY(Math.PI / 4);
  sp.translate(x, b + 1.74, zz);
  k.geo(z, k.blue, sp);
  k.box(z, k.gold, 0.02, 0.1, 0.02, x, b + 1.94, zz);
}
