import * as THREE from "three";
import { Flora, P } from "./flora";
import { F, type GardensKit, LEVELS, SANS } from "./kit";
import { bench, dome, haze, Paths, pavingTex, plant, rng, soilTex } from "./shell";

/**
 * The Cloud Forest: a cool, misty glass dome round a 35 m mountain clothed from foot to summit in
 * ferns, orchids, bromeliads, mosses and vines, with the waterfall pouring 35 m off its lip in front
 * of a cave into a pool. Tree ferns and pitcher plants below, mist drifting through, and the Cloud
 * Walk: a ring of steel and glass hung round the mountain at 18 m, right past the falling water.
 */

const f = F.cloud;
const fw = F.walk;
const WALK = 18;
export const MTN = { x: 0, z: -30 };
const DOME = { r: 40, h: 54 };
/** The walkway's inner and outer radius. */
const W0 = 16.6,
  W1 = 19.2;
const FALL = { r: 14.4, top: 34.5, w: 5.2 };

/** Radius of the mountain at height y, angle a (from +z): a cave behind the falls, an overhanging lip. */
export function mtnR(y: number, a: number) {
  const base = 13.5 - (y / 38) * 5.5 + Math.sin(a * 5 + y * 0.3) * 0.6 + Math.sin(a * 3 - y * 0.17) * 0.8;
  const front = Math.max(0, 1 - Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) / 0.42);
  if (front > 0) {
    // under the lip: recessed into a cave; at the top: the lip pushes out over the pool
    const lip = y > 29 ? (y - 29) / 6 : 0;
    const cave = y < 29 ? 1 : 1 - lip;
    return base * (1 - 0.5 * cave * front) + lip * front * 3.5;
  }
  return base;
}

export function cloud(k: GardensKit, flora: Flora) {
  const zone = LEVELS[f].zone;
  const g = k.g(f);
  const y0 = k.y(f);
  const r = rng(777);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const C = MTN;

  // ---- the floor: dark soil beds, paved paths, the dome round it ---------------------------------
  const soil = new THREE.Mesh(new THREE.CircleGeometry(DOME.r + 1, 72), new THREE.MeshLambertMaterial({ map: soilTex(20, 20) }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.set(C.x, y0, C.z);
  soil.raycast = () => {};
  g.add(soil);
  dome(k, f, C.x, C.z, DOME.r, DOME.r, DOME.h, { ribs: 44, rings: 9, arches: 5 });
  k.ring(f, C.x, C.z, DOME.r - 2);
  // condensation on the glass: the city outside goes milky
  const fogged = haze(new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(DOME.r - 0.6, DOME.h - 0.6, DOME.r - 0.6).translate(C.x, 0, C.z), DOME.h, 0.62, 0.5);
  fogged.mesh.position.y = y0;
  (fogged.mesh.material as THREE.ShaderMaterial).side = THREE.BackSide;
  g.add(fogged.mesh);
  k.themeFns.push((n) => {
    fogged.u.uColor.value.set(n ? "#1a2836" : "#dfe8ea");
    fogged.u.uOp.value = n ? 0.5 : 0.62;
  });

  const paths = new Paths();
  const ring = (rad: number, n = 72, a0 = 0, a1 = Math.PI * 2): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [C.x + Math.sin(a0 + ((a1 - a0) * i) / n) * rad, C.z + Math.cos(a0 + ((a1 - a0) * i) / n) * rad]);
  paths.add(k, f, ring(26), 3.2);
  paths.add(k, f, [[0, 8], [0, -4.2]], 4);
  paths.add(k, f, ring(33.5, 64, -2.3, 2.3), 2.4);
  for (const a of [-1.6, 1.6, 2.6, -2.6]) paths.add(k, f, [[C.x + Math.sin(a) * 26, C.z + Math.cos(a) * 26], [C.x + Math.sin(a) * 33.5, C.z + Math.cos(a) * 33.5]], 2.2);
  paths.build(k, f, new THREE.MeshLambertMaterial({ map: pavingTex(1, 1, "#a8a090"), polygonOffset: true, polygonOffsetFactor: -2 }));

  // ---- the mountain -------------------------------------------------------------------------------
  const H = 38;
  {
    const seg = 72,
      rows = 40;
    const geo = new THREE.CylinderGeometry(1, 1, H, seg, rows, false);
    geo.translate(0, H / 2, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      const a = Math.atan2(x, z);
      const top = y >= H - 0.01;
      const rad = top ? 0 : mtnR(y, a) + (Math.sin(i * 12.9898) * 0.5 + 0.5) * 0.5;
      p.setXYZ(i, C.x + Math.sin(a) * rad, top ? H + 2 : y, C.z + Math.cos(a) * rad);
    }
    geo.computeVertexNormals();
    // rock and moss by height
    k.geo(f, geo, "#34502c", "matte");
  }
  // the cave behind the falls: a dark back wall
  k.cyl(f, 6, 5, 28, C.x, 0, C.z + 2, "#262a22", "matte", 16);
  k.disc(f, C.x, C.z, 13.6);
  k.ring(f, C.x, C.z, 13.8, -2.75, 2.75);
  // everything on it: vine curtains, ferns, bromeliads, orchids, moss
  const cover = [P.vine, P.bush, P.vine, P.fern, P.bromeliad, P.orchid, P.vine, P.broad, P.bush, P.fern, P.vine, P.canopy];
  for (let y = 0.4; y < H - 1; y += 0.8) {
    const rad = mtnR(y, 0.8);
    const n = Math.round((Math.PI * 2 * rad) / 0.75);
    for (let s = 0; s < n; s++) {
      const a = (s / n) * Math.PI * 2 + r() * 0.12;
      const fa = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      if (fa < 0.24 && y < FALL.top + 1) continue;
      if (r() < 0.03) continue;
      const R = mtnR(y, a) + 0.25;
      const x = C.x + Math.sin(a) * R,
        z = C.z + Math.cos(a) * R;
      const kind = cover[Math.floor(r() * cover.length)];
      const tint = new THREE.Color().setHSL(0.25 + r() * 0.1, 0.3, 0.75 + r() * 0.35);
      if (kind === P.fern || kind === P.bromeliad || kind === P.broad) flora.add(zone, "frond", kind, x, y0 + y, z, a, kind === P.broad ? 0.8 : 0.5, 1.2 + r() * 0.9, tint, -0.25 - r() * 0.5, (r() - 0.5) * 0.9);
      else if (kind === P.bush || kind === P.canopy) flora.add(zone, "clump", kind === P.bush ? P.canopy : P.bush, x, y0 + y + 0.3, z, a, 1.6 + r() * 0.8, 1.2 + r() * 0.5, tint);
      else flora.add(zone, "panel", kind, x, y0 + y - 0.2, z, a, 2.0 + r() * 0.8, 2.0 + r() * 1.0, kind === P.vine ? tint : "#ffffff", -0.15 - r() * 0.2);
    }
  }
  // the summit garden
  for (let i = 0; i < 160; i++) {
    const a = r() * Math.PI * 2,
      d = Math.sqrt(r()) * 8;
    plant(flora, zone, [P.fern, P.bush, P.bromeliad, P.orchid, P.palm, P.grass][Math.floor(r() * 6)], C.x + Math.sin(a) * d, y0 + H + 1.4 - d * 0.18, C.z + Math.cos(a) * d, r, 1.1);
  }

  // ---- the waterfall, the pool, the mist -----------------------------------------------------------
  const fallZ = C.z + FALL.r;
  const fallMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform float uTime; uniform float uNight;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float x = vUv.x, y = vUv.y;
        float s = n(vec2(x * 26.0, y * 5.0 + uTime * 3.2)) * 0.6 + n(vec2(x * 60.0, y * 14.0 + uTime * 6.0)) * 0.4;
        float edge = smoothstep(0.0, 0.18, x) * smoothstep(1.0, 0.82, x);
        float a = (0.35 + s * 0.65) * edge * (0.75 + 0.25 * y);
        vec3 c = mix(vec3(0.72, 0.86, 0.95), vec3(1.0), s);
        c *= mix(1.0, 0.55, uNight);
        gl_FragColor = vec4(c, a * 0.9);
      }`,
  });
  fallMat.toneMapped = false;
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(FALL.w, FALL.top, 1, 1), fallMat);
  fall.position.set(C.x, y0 + FALL.top / 2, fallZ);
  fall.raycast = () => {};
  g.add(fall);
  // a second sheet a little in front, wider at the bottom where it spreads
  const fall2 = new THREE.Mesh(new THREE.PlaneGeometry(FALL.w * 1.3, FALL.top * 0.96, 1, 1), fallMat);
  fall2.position.set(C.x, y0 + FALL.top * 0.48, fallZ + 0.5);
  fall2.raycast = () => {};
  g.add(fall2);
  // the lip it pours from
  k.box(f, FALL.w + 1.6, 1.4, 2.6, C.x, FALL.top - 0.2, fallZ - 1.1, "#3a4234", "matte");
  // the pool
  const poolC = v(C.x, 0, fallZ + 2.5);
  k.cyl(f, 7.4, 7.4, 0.55, poolC.x, 0, poolC.z, "#6a6a62", "matte", 40);
  const water = new THREE.Mesh(new THREE.CircleGeometry(7, 48), new THREE.MeshStandardMaterial({ color: "#2a6a78", roughness: 0.08, metalness: 0.3, envMapIntensity: 1.5 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(poolC.x, y0 + 0.42, poolC.z);
  water.raycast = () => {};
  g.add(water);
  k.disc(f, poolC.x, poolC.z, 7.2);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    k.geo(f, new THREE.DodecahedronGeometry(0.6 + r() * 0.6, 0).translate(poolC.x + Math.sin(a) * 7.3, 0.4, poolC.z + Math.cos(a) * 7.3), i % 2 ? "#6a6a5a" : "#5a5a4c", "matte");
  }
  // mist: soft puffs drifting through the dome, thickest at the falls
  const mistN = 260;
  const mp: number[] = [],
    ma: number[] = [];
  for (let i = 0; i < mistN; i++) {
    const nearFall = i < 40;
    const a = nearFall ? (r() - 0.5) * 0.9 : r() * Math.PI * 2;
    const d = nearFall ? 15 + r() * 8 : 15 + r() * 22;
    mp.push(C.x + Math.sin(a) * d, y0 + (nearFall ? r() * 8 : 1 + r() * 40), C.z + Math.cos(a) * d);
    ma.push(r(), 3 + r() * 6);
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute("position", new THREE.Float32BufferAttribute(mp, 3));
  mg.setAttribute("aInfo", new THREE.Float32BufferAttribute(ma, 2));
  const mistU = { uTime: { value: 0 }, uScale: { value: 800 }, uK: { value: 1 }, uNight: { value: 0 } };
  const mist = new THREE.Points(
    mg,
    new THREE.ShaderMaterial({
      uniforms: mistU,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec2 aInfo; uniform float uTime, uScale; varying float vA;
        void main(){
          vec3 p = position;
          float ph = aInfo.x * 6.2832;
          p.x += sin(uTime * 0.07 + ph) * 3.0;
          p.z += cos(uTime * 0.05 + ph * 1.3) * 3.0;
          p.y += sin(uTime * 0.11 + ph) * 1.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(uScale * aInfo.y / -mv.z, 2.0, 900.0);
          // puffs right in front of the eye fade out instead of filling the screen
          vA = (0.5 + 0.5 * sin(uTime * 0.2 + ph)) * smoothstep(4.0, 14.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uK, uNight; varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.0, d);
          gl_FragColor = vec4(mix(vec3(0.92, 0.96, 1.0), vec3(0.35, 0.45, 0.55), uNight), a * a * 0.1 * uK * vA);
        }`,
    }),
  );
  mist.frustumCulled = false;
  mist.raycast = () => {};
  mist.renderOrder = 5;
  g.add(mist);
  // misting on each block: the cloud thickens for a while
  let burst = 0;
  k.blockFns.push(() => (burst = 1));
  k.ticks[zone].push((dt, t) => {
    fallMat.uniforms.uTime.value = t;
    mistU.uTime.value = t;
    mistU.uScale.value = k.ctx.renderer.domElement.height * 0.75;
    burst = Math.max(0, burst - dt / 40);
    mistU.uK.value = 1 + burst * 2.5;
  });
  k.themeFns.push((n) => {
    fallMat.uniforms.uNight.value = n ? 1 : 0;
    mistU.uNight.value = n ? 1 : 0;
  });

  // ---- planting on the floor: tree ferns, pitcher plants, orchids, ferns everywhere ----------------
  const avoid = (x: number, z: number) => {
    const d = Math.hypot(x - C.x, z - C.z);
    return d < 14.5 || d > DOME.r - 2.2 || Math.hypot(x - poolC.x, z - poolC.z) < 8;
  };
  for (let i = 0; i < 2600; i++) {
    const a = r() * Math.PI * 2,
      d = 14 + Math.sqrt(r()) * (DOME.r - 15);
    const x = C.x + Math.sin(a) * d,
      z = C.z + Math.cos(a) * d;
    if (avoid(x, z) || paths.dist(x, z) < 0.4) continue;
    plant(flora, zone, [P.fern, P.fern, P.broad, P.orchid, P.bromeliad, P.bush, P.grass, P.heliconia, P.orchid][Math.floor(r() * 9)], x, y0, z, r, 1.0 + r() * 0.3);
  }
  // tree ferns: shaggy trunks, crowns of long fronds
  for (let i = 0; i < 34; i++) {
    const a = r() * Math.PI * 2,
      d = 20 + r() * 16;
    const x = C.x + Math.sin(a) * d,
      z = C.z + Math.cos(a) * d;
    if (avoid(x, z) || paths.dist(x, z) < 1) continue;
    const h = 3 + r() * 4;
    k.cyl(f, 0.28, 0.2, h, x, 0, z, "#4a3a2a", "matte", 7);
    flora.rosette(zone, P.fern, x, y0 + h, z, 12, 2.6 + r(), 0.45, 0.35, r);
    k.disc(f, x, z, 0.4);
  }
  // planters of orchids by the entrance
  for (const s of [-1, 1]) {
    k.box(f, 2.4, 0.6, 6, s * 4.2, 0, 2, "#7a7468", "matte");
    k.solid(f, s * 4.2 - 1.2, -1, s * 4.2 + 1.2, 5);
    for (let i = 0; i < 26; i++) flora.add(zone, "cross", P.orchid, s * 4.2 + (r() - 0.5) * 2, y0 + 0.6, 2 + (r() - 0.5) * 5.6, r() * 6, 0.9 + r() * 0.4, 0.8 + r() * 0.5);
  }
  for (let i = 0; i < 6; i++) bench(k, f, C.x + Math.sin(-2.4 + i * 0.25) * 29.6, C.z + Math.cos(-2.4 + i * 0.25) * 29.6, -2.4 + i * 0.25);

  // ---- the entrance and the lift ------------------------------------------------------------------
  k.box(f, 10, 4, 0.3, 0, 0, 8.6, "#e8ecef", "metal");
  k.label(f, "CLOUD FOREST", 0, 4.6, 8.3, { h: 0.6, color: "#3ef0d0", glow: true, ry: Math.PI, font: `700 96px ${SANS}` });
  k.solid(f, -12, 8.4, 12, 9);
  k.door(f, F.grove, 4, 3.4, 0, 0, 8.2, 0, "Out to");
  // the lift in the mountain's flank
  const la = Math.PI / 2;
  const lr = mtnR(1, la) - 0.2;
  const lx = C.x + Math.sin(la) * lr,
    lz = C.z + Math.cos(la) * lr;
  k.box(f, 0.6, 3.2, 2.6, lx + 0.2, 0, lz, "#3a3a40", "metal");
  k.box(f, 0.1, 2.4, 1.4, lx + 0.52, 0, lz, "#c0c4c8", "metal");
  k.label(f, "▲ CLOUD WALK · 18 m", lx + 0.6, 3.5, lz, { h: 0.26, color: "#3ef0d0", glow: true, ry: Math.PI / 2 });
  k.door(f, fw, 0.8, 2.6, lx + 0.6, 0, lz, Math.PI / 2, "Lift to");

  // ---- the Cloud Walk at 18 m -----------------------------------------------------------------------
  const deck = new THREE.RingGeometry(W0, W1, 120, 1).rotateX(-Math.PI / 2).translate(C.x, 0, C.z);
  k.geo(fw, deck, "#5a5a62", "matte");
  k.geo(fw, new THREE.CylinderGeometry(W1, W1, 0.35, 120, 1, true).translate(C.x, -0.18, C.z), "#d8dce2", "metal");
  k.geo(fw, new THREE.CylinderGeometry(W0, W0, 0.35, 120, 1, true).translate(C.x, -0.18, C.z), "#d8dce2", "metal");
  // the glass balustrade both sides, handrail, lights under the deck
  for (const [R, glow] of [
    [W1, "#3ef0d0"],
    [W0, "#ffe8c0"],
  ] as const) {
    k.geo(fw, new THREE.CylinderGeometry(R, R, 1.05, 120, 1, true).translate(C.x, 0.55, C.z), "#b8dce8", "glass");
    k.geo(fw, new THREE.TorusGeometry(R, 0.05, 6, 120).rotateX(Math.PI / 2).translate(C.x, 1.1, C.z), "#d8dce2", "metal");
    k.geo(fw, new THREE.TorusGeometry(R, 0.03, 4, 120).rotateX(Math.PI / 2).translate(C.x, -0.4, C.z), glow, "glow");
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      k.box(fw, 0.06, 1.1, 0.06, C.x + Math.sin(a) * R, 0, C.z + Math.cos(a) * R, "#d8dce2", "metal");
    }
  }
  // brackets back to the mountain
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + 0.13;
    const rm = mtnR(WALK - 3, a);
    k.beam(fw, v(C.x + Math.sin(a) * W1, -0.3, C.z + Math.cos(a) * W1), v(C.x + Math.sin(a) * rm, -3.5, C.z + Math.cos(a) * rm), 0.16, "#d8dce2");
    k.beam(fw, v(C.x + Math.sin(a) * W0, -0.3, C.z + Math.cos(a) * W0), v(C.x + Math.sin(a) * W1, -0.3, C.z + Math.cos(a) * W1), 0.14, "#d8dce2");
  }
  k.ring(fw, C.x, C.z, W1 - 0.05);
  // the inner rail, open where the bridge goes into the mountain (the lift)
  k.ring(fw, C.x, C.z, W0 + 0.05, la + 0.1, la - 0.1 + Math.PI * 2);
  // the bridge to the lift
  const br0 = mtnR(WALK, la) - 0.3;
  k.box(fw, W0 - br0 + 0.4, 0.2, 1.8, C.x + Math.sin(la) * (W0 + br0) / 2, -0.2, C.z, "#5a5a62", "matte");
  k.solid(fw, C.x + br0 - 0.3, C.z - 1.15, C.x + W0, C.z - 0.95);
  k.solid(fw, C.x + br0 - 0.3, C.z + 0.95, C.x + W0, C.z + 1.15);
  k.solid(fw, C.x + br0 - 0.6, C.z - 1.2, C.x + br0 - 0.3, C.z + 1.2);
  k.box(fw, 0.4, 3, 2.4, C.x + br0 - 0.4, 0, C.z, "#3a3a40", "metal");
  k.box(fw, 0.1, 2.4, 1.4, C.x + br0 - 0.12, 0, C.z, "#c0c4c8", "metal");
  k.label(fw, "▼ CF · CLOUD FOREST", C.x + br0 - 0.05, 2.75, C.z, { h: 0.2, color: "#7dffb0", glow: true, ry: Math.PI / 2 });
  k.door(fw, f, 0.6, 2.4, C.x + br0, 0, C.z, Math.PI / 2, "Lift to");
  // step out on the walk, at the bridge, looking round towards the falls
  LEVELS[fw].spawn = [C.x + (W0 + W1) / 2, C.z + 1.2];
  LEVELS[fw].yaw = 2.68;

  // ---- light ------------------------------------------------------------------------------------------
  const l1 = k.light(f, poolC.x, 6, poolC.z + 3, "#d8f0ff", 60, 30);
  const l2 = k.light(f, C.x, 26, C.z + 22, "#e8f4ff", 80, 40);
  const l3 = k.light(f, C.x - 20, 10, C.z, "#c8ffd8", 40, 30);
  const l4 = k.light(f, C.x + 20, 10, C.z - 10, "#c8ffd8", 40, 30);
  k.themeFns.push((n) => {
    [l1, l2, l3, l4].forEach((l, i) => l && (l.intensity = n ? [90, 50, 60, 60][i] : [40, 50, 20, 20][i]));
    if (l1) l1.color.set(n ? "#7fd8ff" : "#d8f0ff");
    if (l3) l3.color.set(n ? "#9a7aff" : "#c8ffd8");
    if (l4) l4.color.set(n ? "#3ef0d0" : "#c8ffd8");
  });
  return { paths, poolC };
}
