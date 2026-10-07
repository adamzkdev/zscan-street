import * as THREE from "three";
import { Flora, P } from "./flora";
import { F, type GardensKit, LEVELS, SANS } from "./kit";
import { bench, dome, grassTex, haze, lamp, palm, Paths, pavingTex, plant, rng } from "./shell";

/**
 * The Flower Dome: the largest glass greenhouse in the world, a cool dry Mediterranean spring under
 * a low gridshell. In the middle the Flower Field, this season ten thousand tulips in stripes round
 * a Dutch windmill; on the terraces round it the thousand-year-old olive trees over lavender, the
 * baobabs, the succulent garden of agaves and cacti, bougainvillea and palms.
 */

const f = F.flower;
const D = { x: 0, z: -36, rx: 56, rz: 44, h: 36 };
const FIELD = { x: 0, z: -34, rx: 20, rz: 11.5 };

export function flower(k: GardensKit, flora: Flora) {
  const zone = LEVELS[f].zone;
  const g = k.g(f);
  const y0 = k.y(f);
  const r = rng(4242);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // ---- floor, dome, boundary ----------------------------------------------------------------------
  const soil = new THREE.Mesh(new THREE.CircleGeometry(1, 80).scale(D.rx + 1, D.rz + 1, 1), new THREE.MeshLambertMaterial({ map: grassTex(40, 32, true) }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.set(D.x, y0, D.z);
  soil.raycast = () => {};
  g.add(soil);
  dome(k, f, D.x, D.z, D.rx, D.rz, D.h, { ribs: 56, rings: 7, arches: 6, flat: 0.7 });
  const veil = haze(new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(D.rx - 0.6, D.h - 0.8, D.rz - 0.6).translate(D.x, 0, D.z), D.h, 0.55, 0.3);
  veil.mesh.position.y = y0;
  g.add(veil.mesh);
  k.themeFns.push((n) => {
    veil.u.uColor.value.set(n ? "#141826" : "#eef0ea");
    veil.u.uOp.value = n ? 0.35 : 0.42;
  });
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    const x = D.x + Math.sin(a) * (D.rx - 2.5),
      z = D.z + Math.cos(a) * (D.rz - 2.5);
    // the way in from the entrance hall stays open
    if (z > 0 && Math.abs(x) < 3) continue;
    k.solid(f, x - 0.3, z - 0.3, x + 0.3, z + 0.3);
  }
  // the entrance hall's side walls, from the glass down to the door wall
  for (const s of [-1, 1]) k.solid(f, s > 0 ? 12 : -12.6, 3.6, s > 0 ? 12.6 : -12, 9.8);

  const paths = new Paths();
  const ell = (cx: number, cz: number, rx: number, rz: number, n = 72, a0 = 0, a1 = Math.PI * 2): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [cx + Math.sin(a0 + ((a1 - a0) * i) / n) * rx, cz + Math.cos(a0 + ((a1 - a0) * i) / n) * rz]);
  paths.add(k, f, [[0, 9], [0, -20.5]], 5);
  paths.add(k, f, ell(FIELD.x, FIELD.z, FIELD.rx + 2.6, FIELD.rz + 2.6), 3.4);
  paths.add(k, f, ell(D.x, D.z, 40, 31, 96), 3);
  for (const a of [0.9, -0.9, 2.2, -2.2, Math.PI]) paths.add(k, f, [[FIELD.x + Math.sin(a) * (FIELD.rx + 2.6), FIELD.z + Math.cos(a) * (FIELD.rz + 2.6)], [D.x + Math.sin(a) * 40, D.z + Math.cos(a) * 31]], 2.4);
  paths.build(k, f, new THREE.MeshLambertMaterial({ map: pavingTex(1, 1, "#ddd2bc"), polygonOffset: true, polygonOffsetFactor: -2 }));

  // ---- the Flower Field: tulips in stripes, a kerb, the windmill -----------------------------------
  {
    const kerb = new THREE.TorusGeometry(1, 0.012, 4, 96).rotateX(Math.PI / 2);
    kerb.scale(FIELD.rx + 0.5, 20, FIELD.rz + 0.5);
    kerb.translate(FIELD.x, 0.2, FIELD.z);
    k.geo(f, kerb, "#b8ac98", "matte");
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const x = FIELD.x + Math.sin(a) * (FIELD.rx + 0.4),
        z = FIELD.z + Math.cos(a) * (FIELD.rz + 0.4);
      k.solid(f, x - 0.35, z - 0.35, x + 0.35, z + 0.35);
    }
    const bands = ["#e8142a", "#ffd21a", "#ff7ab8", "#f8f4ec", "#ff6a14", "#8a3ab8", "#e8142a", "#ffb0d0", "#ffd21a", "#c8102a", "#f8f4ec", "#ff8a1a"];
    const tulips: [number, number, string, number][] = [];
    const mound = (x: number, z: number) => 0.05 + Math.sqrt(Math.max(0, 1 - ((x - FIELD.x) / FIELD.rx) ** 2 - ((z - FIELD.z) / FIELD.rz) ** 2)) * 1.5;
    for (let z = FIELD.z - FIELD.rz; z < FIELD.z + FIELD.rz; z += 0.3)
      for (let x = FIELD.x - FIELD.rx; x < FIELD.x + FIELD.rx; x += 0.3) {
        const px = x + (r() - 0.5) * 0.2,
          pz = z + (r() - 0.5) * 0.2;
        const e = ((px - FIELD.x) / FIELD.rx) ** 2 + ((pz - FIELD.z) / FIELD.rz) ** 2;
        if (e > 0.97) continue;
        // the windmill's island
        if (Math.hypot(px - FIELD.x, pz - (FIELD.z - 3)) < 3.4) continue;
        // diagonal stripes swept round the field
        const band = Math.floor((px * 0.8 + pz * 1.6 + 400 + Math.sin(px * 0.2) * 2) / 2.6) % bands.length;
        tulips.push([px, pz, bands[band], 0.04 + Math.sqrt(Math.max(0, 1 - e)) * 1.5]);
      }
    const stem = new THREE.BoxGeometry(0.02, 0.42, 0.02).translate(0, 0.21, 0);
    const cup = new THREE.CylinderGeometry(0.055, 0.035, 0.1, 6).translate(0, 0.46, 0);
    const geo = new THREE.BufferGeometry();
    // stem green, cup coloured per instance: keep one mesh with a colour attribute on the stem
    const sNon = stem.toNonIndexed(),
      cNon = cup.toNonIndexed();
    const sc = new Float32Array(sNon.attributes.position.count * 3).fill(0);
    for (let i = 0; i < sc.length; i += 3) sc.set([0.28 / 0.9, 0.55 / 0.9, 0.22 / 0.9], i);
    const cc = new Float32Array(cNon.attributes.position.count * 3).fill(1);
    sNon.setAttribute("color", new THREE.BufferAttribute(sc, 3));
    cNon.setAttribute("color", new THREE.BufferAttribute(cc, 3));
    sNon.setAttribute("aCup", new THREE.BufferAttribute(new Float32Array(sNon.attributes.position.count), 1));
    cNon.setAttribute("aCup", new THREE.BufferAttribute(new Float32Array(cNon.attributes.position.count).fill(1), 1));
    sNon.deleteAttribute("uv");
    cNon.deleteAttribute("uv");
    const merged = [sNon, cNon];
    const pos: number[] = [],
      nrm: number[] = [],
      col: number[] = [],
      cupA: number[] = [];
    for (const m of merged) {
      pos.push(...(m.attributes.position.array as Float32Array));
      nrm.push(...(m.attributes.normal.array as Float32Array));
      col.push(...(m.attributes.color.array as Float32Array));
      cupA.push(...(m.attributes.aCup.array as Float32Array));
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute("aCup", new THREE.Float32BufferAttribute(cupA, 1));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // the instance colour only tints the cups; stems stay green
    mat.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aCup;")
        .replace("#include <color_vertex>", "#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nvColor.rgb = mix(color.rgb, instanceColor.rgb, aCup);\n#endif");
    };
    const mesh = new THREE.InstancedMesh(geo, mat, tulips.length);
    const m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      e = new THREE.Euler();
    const c = new THREE.Color();
    tulips.forEach(([x, z, col, ty], i) => {
      e.set((r() - 0.5) * 0.25, r() * 6, (r() - 0.5) * 0.25);
      q.setFromEuler(e);
      const s = 0.85 + r() * 0.35;
      m4.compose(v(x, y0 + ty, z), q, v(s, s * (0.9 + r() * 0.3), s));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, c.set(col).offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.08));
    });
    mesh.raycast = () => {};
    mesh.computeBoundingSphere();
    g.add(mesh);
    // leaves under the tulips
    for (let i = 0; i < 1400; i++) {
      const a = r() * Math.PI * 2,
        d = Math.sqrt(r());
      const x = FIELD.x + Math.sin(a) * d * FIELD.rx * 0.97,
        z = FIELD.z + Math.cos(a) * d * FIELD.rz * 0.97;
      flora.add(zone, "cross", P.grass, x, y0 + mound(x, z) - 0.05, z, r() * 6, 0.8, 0.35, "#9ad070");
    }
    // the field is a low mound, its earth showing between the rows
    k.geo(f, new THREE.SphereGeometry(1, 48, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(FIELD.rx, 1.5, FIELD.rz).translate(FIELD.x, 0.02, FIELD.z), "#4a3a26", "matte");
    windmill(k, FIELD.x, FIELD.z - 3);
  }

  // ---- the olive grove (left): gnarled trunks on stone terraces, lavender below --------------------
  terrace(k, -36, -30, 16, 26);
  const olives: [number, number][] = [[-42, -40], [-32, -44], [-40, -26], [-30, -32], [-44, -18], [-34, -20], [-38, -34]];
  for (const [x, z] of olives) olive(k, flora, x, z, r);
  for (let i = 0; i < 520; i++) {
    const x = -44 + r() * 16,
      z = -43 + r() * 26;
    if (olives.some(([ox, oz]) => Math.hypot(x - ox, z - oz) < 1)) continue;
    plant(flora, zone, r() < 0.7 ? P.salvia : P.grass, x, 0.6 + y0, z, r, 0.8);
  }
  k.label(f, "OLIVE GROVE", -36, 0.9, -16.6, { h: 0.3, color: "#3a3a2a", bg: "#e8e0cc" });

  // ---- the baobabs (right) ------------------------------------------------------------------------
  terrace(k, 36, -32, 16, 22);
  for (const [x, z, s] of [
    [34, -38, 1.2],
    [42, -27, 1],
    [31, -24, 0.85],
  ] as const)
    baobab(k, flora, x, z, s, r);
  for (let i = 0; i < 260; i++) {
    const x = 28 + r() * 16,
      z = -42 + r() * 20;
    if (Math.hypot(x - 34, z + 38) < 2.6 || Math.hypot(x - 42, z + 27) < 2.2 || Math.hypot(x - 31, z + 24) < 2) continue;
    plant(flora, zone, [P.grass, P.agave, P.marigold, P.grass][Math.floor(r() * 4)], x, 0.6 + y0, z, r, 0.8);
  }
  k.label(f, "BAOBABS", 36, 0.9, -20.6, { h: 0.3, color: "#3a3a2a", bg: "#e8e0cc" });

  // ---- the succulent garden (front right): agaves, barrel cacti, columns --------------------------
  for (let i = 0; i < 140; i++) {
    const x = 14 + r() * 26,
      z = -14 + r() * 14;
    if (paths.dist(x, z) < 0.6 || Math.hypot(x - D.x, (z - D.z) * (D.rx / D.rz)) > D.rx - 5) continue;
    const t = r();
    if (t < 0.45) plant(flora, zone, P.agave, x, y0, z, r, 1.2);
    else if (t < 0.7) {
      const s = 0.3 + r() * 0.3;
      k.geo(f, new THREE.SphereGeometry(s, 10, 8).scale(1, 0.85, 1).translate(x, s * 0.7, z), r() < 0.5 ? "#7a9a3a" : "#5a8a4a", "matte");
      k.geo(f, new THREE.SphereGeometry(s * 0.35, 6, 4).translate(x, s * 1.4, z), "#e8c838", "matte");
    } else if (t < 0.82) cactus(k, x, z, 1.2 + r() * 2.2, r);
    else plant(flora, zone, P.marigold, x, y0, z, r, 0.7);
  }
  // pebbles under them
  // ---- the Mediterranean corner (front left): bougainvillea, palms, a fountain ----------------------
  for (let i = 0; i < 150; i++) {
    const x = -40 + r() * 26,
      z = -14 + r() * 14;
    if (paths.dist(x, z) < 0.6 || Math.hypot(x - D.x, (z - D.z) * (D.rx / D.rz)) > D.rx - 5) continue;
    plant(flora, zone, [P.bougain, P.bougain, P.salvia, P.marigold, P.bush, P.grass][Math.floor(r() * 6)], x, y0, z, r, 1.3);
  }
  for (const [x, z] of [[-24, -6], [-34, -9], [24, -5], [-18, -2], [18, -2]] as const) palm(k, flora, f, x, z, 6 + r() * 4, r);

  // ---- round the back: flowering shrubs, more palms, a planted rim --------------------------------
  for (let i = 0; i < 1600; i++) {
    const a = r() * Math.PI * 2,
      d = 0.72 + r() * 0.22;
    const x = D.x + Math.sin(a) * D.rx * d,
      z = D.z + Math.cos(a) * D.rz * d;
    if (paths.dist(x, z) < 0.6 || (z > -16 && Math.abs(x) < 46)) continue;
    plant(flora, zone, [P.bougain, P.bush, P.salvia, P.palm, P.broad, P.marigold, P.heliconia, P.grass][Math.floor(r() * 8)], x, y0, z, r, 1.3);
  }
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.62 + (i / 8) * Math.PI * 0.76;
    palm(k, flora, f, D.x + Math.sin(a) * D.rx * 0.86, D.z + Math.cos(a) * D.rz * 0.86, 7 + r() * 5, r);
  }

  // ---- entrance, benches, lamps --------------------------------------------------------------------
  k.box(f, 12, 4, 0.3, 0, 0, 9.4, "#e8ecef", "metal");
  k.label(f, "FLOWER DOME", 0, 4.6, 9.1, { h: 0.6, color: "#ff8ac8", glow: true, ry: Math.PI, font: `700 96px ${SANS}` });
  k.solid(f, -12, 9.2, 12, 9.8);
  k.door(f, F.grove, 4, 3.4, 0, 0, 9.0, 0, "Out to");
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) bench(k, f, s * 3.6, 2 - i * 6, s * -Math.PI / 2);
    for (let i = 0; i < 3; i++) lamp(k, f, s * 3.1, -1 - i * 6);
  }
  // planters of tulips by the door
  for (const s of [-1, 1]) {
    k.box(f, 2, 0.6, 4, s * 7.5, 0, 5, "#b8ac98", "matte");
    k.solid(f, s * 7.5 - 1, 3, s * 7.5 + 1, 7);
    for (let i = 0; i < 14; i++) flora.add(zone, "cross", P.tulips, s * 7.5 + (r() - 0.5) * 1.6, y0 + 0.6, 5 + (r() - 0.5) * 3.6, r() * 6, 0.9, 0.7);
  }

  // ---- light ------------------------------------------------------------------------------------------
  const l1 = k.light(f, 0, 14, -34, "#fff4e0", 120, 60);
  const l2 = k.light(f, -36, 10, -30, "#fff0d8", 50, 34);
  const l3 = k.light(f, 36, 10, -30, "#fff0d8", 50, 34);
  const sun = new THREE.DirectionalLight("#fff4e0", 1.3);
  sun.position.set(-40, 100, 30);
  sun.target.position.set(0, y0, -30);
  g.add(sun, sun.target);
  k.themeFns.push((n) => {
    sun.intensity = n ? 0.15 : 1.3;
    [l1, l2, l3].forEach((l, i) => l && (l.intensity = n ? [260, 90, 90][i] : [60, 0, 0][i]));
  });
  return paths;
}

/** A raised bed with a dry-stone wall. */
function terrace(k: GardensKit, x: number, z: number, w: number, d: number) {
  k.box(F.flower, w, 0.6, d, x, 0, z, "#3a2a1c", "matte");
  for (const [a, b, c, e] of [
    [x - w / 2, z - d / 2, x + w / 2, z - d / 2],
    [x - w / 2, z + d / 2, x + w / 2, z + d / 2],
    [x - w / 2, z - d / 2, x - w / 2, z + d / 2],
    [x + w / 2, z - d / 2, x + w / 2, z + d / 2],
  ])
    k.wall(F.flower, a, b, c, e, 0.75, "#a89a80", "matte", 0.4);
}

/** An ancient olive: a squat, twisted trunk splitting into gnarled limbs, a silvery crown. */
function olive(k: GardensKit, flora: Flora, x: number, z: number, r: () => number) {
  const f = F.flower;
  const y0 = k.y(f) + 0.6;
  const v = (a: number, b: number, c: number) => new THREE.Vector3(a, b, c);
  k.cyl(f, 0.9, 0.6, 1.4, x, 0.6, z, "#6a6052", "matte", 9);
  k.disc(f, x, z, 0.9);
  const limbs = 3 + Math.floor(r() * 2);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + r();
    let p = v(x, 1.9, z);
    for (let s = 0; s < 3; s++) {
      const q = p.clone().add(v(Math.cos(a + (r() - 0.5)) * (0.9 + r() * 0.6), 0.8 + r() * 0.6, Math.sin(a + (r() - 0.5)) * (0.9 + r() * 0.6)));
      k.beam(f, p, q, 0.34 - s * 0.08, s ? "#7a6e5e" : "#6a6052", "matte");
      p = q;
    }
    for (let j = 0; j < 5; j++) flora.add(LEVELS[f].zone, "clump", P.olive, p.x + (r() - 0.5) * 1.6, k.y(f) + p.y + 0.3 + r() * 0.8, p.z + (r() - 0.5) * 1.6, r() * 6, 2.2 + r() * 0.8, 1.5);
  }
  void y0;
}

/** A baobab: the bottle trunk, a crown of stubby branches with sparse leaves. */
function baobab(k: GardensKit, flora: Flora, x: number, z: number, s: number, r: () => number) {
  const f = F.flower;
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const y = (i / 12) * 7.5;
    const rad = 1.0 + 0.9 * Math.sin(Math.min(1, y / 4.2) * Math.PI * 0.85) - (y / 7.5) * 0.7;
    prof.push(new THREE.Vector2(rad * s, y * s));
  }
  const lathe = new THREE.LatheGeometry(prof, 16).translate(x, 0.6, z);
  k.geo(f, lathe, "#9a8672", "matte");
  k.disc(f, x, z, 1.9 * s);
  const top = 0.6 + 7.5 * s;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r();
    const p = new THREE.Vector3(x + Math.cos(a) * 0.4 * s, top - 0.3, z + Math.sin(a) * 0.4 * s);
    const q = p.clone().add(new THREE.Vector3(Math.cos(a) * (1.6 + r()) * s, (1 + r()) * s, Math.sin(a) * (1.6 + r()) * s));
    k.beam(f, p, q, 0.3 * s, "#8a7662", "matte");
    const q2 = q.clone().add(new THREE.Vector3(Math.cos(a + 0.5) * s, 0.8 * s, Math.sin(a + 0.5) * s));
    k.beam(f, q, q2, 0.16 * s, "#8a7662", "matte");
    flora.add(LEVELS[f].zone, "clump", P.canopy, q2.x, k.y(f) + q2.y + 0.4, q2.z, r() * 6, 2 * s, 1.1 * s, "#c8d890");
  }
}

/** A columnar cactus with an arm or two. */
function cactus(k: GardensKit, x: number, z: number, h: number, r: () => number) {
  const f = F.flower;
  k.cyl(f, 0.2, 0.17, h, x, 0, z, "#4a7a3a", "matte", 8);
  k.geo(f, new THREE.SphereGeometry(0.17, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, h, z), "#4a7a3a", "matte");
  if (h > 2) {
    for (let i = 0; i < 1 + Math.floor(r() * 2); i++) {
      const a = r() * Math.PI * 2,
        y = h * (0.35 + r() * 0.3);
      const dx = Math.cos(a) * 0.5,
        dz = Math.sin(a) * 0.5;
      k.beam(f, new THREE.Vector3(x, y, z), new THREE.Vector3(x + dx, y, z + dz), 0.24, "#4a7a3a", "matte");
      k.cyl(f, 0.13, 0.12, 0.8, x + dx, y, z + dz, "#4a7a3a", "matte", 7);
    }
  }
  k.disc(f, x, z, 0.3);
}

/** The Dutch windmill in the middle of the tulips: a tapered tower, a cap, four turning sails. */
function windmill(k: GardensKit, x: number, z: number) {
  const f = F.flower;
  k.cyl(f, 2.6, 2.7, 1.8, x, 0, z, "#8a7a62", "matte", 8);
  k.cyl(f, 2.2, 1.4, 8, x, 1.8, z, "#3a5a3a", "matte", 8);
  k.cyl(f, 1.7, 1.2, 0.4, x, 4.9, z, "#e8e0cc", "matte", 8);
  k.cyl(f, 1.6, 0.4, 2, x, 9.8, z, "#5a3a2a", "matte", 8);
  k.box(f, 0.9, 1.6, 0.1, x, 1.8, z + 2.05, "#5a3a2a", "matte");
  for (const [wy, wx] of [
    [6.3, 0],
    [3.5, -0.9],
  ])
    k.box(f, 0.5, 0.6, 0.1, x + wx, wy, z + 1.95 - (5 - wy) * 0.1, "#fff0c0", "glow");
  k.disc(f, x, z, 2.8);
  const sails = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: "#6a4a32", roughness: 0.8 });
  const cloth = new THREE.MeshStandardMaterial({ color: "#f0e8dc", roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 6.4, 0.16).translate(0, 3.2, 0), wood);
    arm.add(spar);
    for (let j = 0; j < 9; j++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.05).translate(0.55, 1 + j * 0.62, 0), wood);
      arm.add(bar);
    }
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 5.2).translate(0.62, 3.6, 0.03), cloth);
    arm.add(sail);
    arm.rotation.z = (i * Math.PI) / 2;
    sails.add(arm);
  }
  sails.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 10).rotateX(Math.PI / 2), wood));
  sails.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
  k.add(f, sails, x, 9.5, z + 1.9);
  k.ticks[LEVELS[f].zone].push((dt) => (sails.rotation.z -= dt * 0.35));
}
