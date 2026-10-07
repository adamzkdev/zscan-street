import * as THREE from "three";
import { F, GOLD, LEVELS, paint, type PalmKit } from "./kit";
import { deckTex, palmTree, sandTex, sea, ground, lounger, umbrella } from "./props";
import { yacht } from "./boats";

/**
 * The crescent at sunset: a teak boardwalk along the inside of the breakwater, palms and lanterns
 * on the left, the beach and the open Gulf on the right with the sun going down into it, the
 * monorail on its viaduct overhead (a train every minute or so), and at the end the coral twin
 * towers of ATLANTIS with the great arch between them. Fireworks over the arch on every block.
 */

const f = F.crescent;
/** Atlantis' front (z), the arch's middle (x). */
const AZ = -128;
const AX = -8;
const MX = -13; // the monorail's line
const SUN: [number, number, number] = [0.62, 0.07, -0.78];

export function crescent(k: PalmKit) {
  const g = k.groups[f];
  const y0 = k.y(f);
  k.sun(f, ["#ffb070", 2.2, [SUN[0] * 100, SUN[1] * 100 + 6, SUN[2] * 100]], ["#7a90d0", 0.3, [-40, 60, -30]]);

  // ---- the sky: sunset over the Gulf, the skyline behind you ---------------------------------
  const sky = (night: boolean) =>
    paint(2048, 1024, (c, W, H) => {
      const gr = c.createLinearGradient(0, 0, 0, H / 2);
      if (night) {
        gr.addColorStop(0, "#03040c");
        gr.addColorStop(0.6, "#0a1030");
        gr.addColorStop(1, "#24264a");
      } else {
        gr.addColorStop(0, "#1e2a6a");
        gr.addColorStop(0.35, "#5a4a9a");
        gr.addColorStop(0.62, "#d8708a");
        gr.addColorStop(0.82, "#ff9a5a");
        gr.addColorStop(1, "#ffd08a");
      }
      c.fillStyle = gr;
      c.fillRect(0, 0, W, H / 2);
      c.fillStyle = night ? "#0a0e20" : "#3a2a4a";
      c.fillRect(0, H / 2, W, H / 2);
      // the sun (or the moon) and its glow
      const u = Math.atan2(SUN[2], SUN[0]) / (Math.PI * 2) + 0.5;
      const v = Math.asin(SUN[1]) / Math.PI + 0.5;
      const sx = u * W,
        sy = (1 - v) * H;
      if (!night) {
        for (const [r, a] of [
          [520, 0.18],
          [220, 0.3],
          [90, 0.45],
        ] as const) {
          const h = c.createRadialGradient(sx, sy, 0, sx, sy, r);
          h.addColorStop(0, `rgba(255,220,150,${a})`);
          h.addColorStop(1, "rgba(255,160,90,0)");
          c.fillStyle = h;
          c.fillRect(sx - r, sy - r, r * 2, r * 2);
        }
        c.fillStyle = "#fff0c8";
        c.beginPath();
        c.arc(sx, sy, 22, 0, Math.PI * 2);
        c.fill();
        // long thin clouds lit from below
        for (let i = 0; i < 60; i++) {
          const cy = H * (0.18 + Math.random() * 0.28),
            cx = Math.random() * W,
            w = 60 + Math.random() * 320;
          const warm = 1 - Math.min(1, Math.abs(cx - sx) / (W * 0.4));
          c.fillStyle = `rgba(${Math.round(200 + warm * 55)},${Math.round(110 + warm * 70)},${Math.round(120 - warm * 30)},${0.18 + Math.random() * 0.3})`;
          c.beginPath();
          c.ellipse(cx, cy, w, 3 + Math.random() * 6, 0, 0, Math.PI * 2);
          c.fill();
        }
      } else {
        for (let i = 0; i < 1400; i++) {
          c.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.75})`;
          const r = Math.random() < 0.04 ? 1.8 : 0.9;
          c.fillRect(Math.random() * W, Math.random() * H * 0.47, r, r);
        }
        c.fillStyle = "#f4f0e0";
        c.beginPath();
        c.arc(sx - 120, sy - 220, 16, 0, Math.PI * 2);
        c.fill();
      }
      // the skyline behind you (+z): towers, the needle, lit windows
      const back = Math.atan2(1, 0) / (Math.PI * 2) + 0.5;
      const bx = back * W;
      const hz = H / 2;
      for (let i = 0; i < 140; i++) {
        const x = bx - 420 + Math.random() * 840;
        const fall = 1 - Math.abs(x - bx) / 440;
        const h = (8 + Math.random() * 46) * (0.4 + fall);
        const w = 6 + Math.random() * 14;
        c.fillStyle = night ? "#10122a" : "#5a4a6e";
        c.fillRect(x, hz - h, w, h);
        c.fillStyle = night ? "rgba(255,210,140,0.85)" : "rgba(255,200,150,0.35)";
        for (let y = hz - h + 3; y < hz - 2; y += 4) for (let xx = x + 2; xx < x + w - 2; xx += 3) if (Math.random() < 0.35) c.fillRect(xx, y, 1.2, 1.4);
      }
      // the tallest tower, a needle
      c.fillStyle = night ? "#14163a" : "#5e4e74";
      c.beginPath();
      c.moveTo(bx - 14, hz);
      c.lineTo(bx - 6, hz - 120);
      c.lineTo(bx, hz - 190);
      c.lineTo(bx + 6, hz - 120);
      c.lineTo(bx + 14, hz);
      c.fill();
      if (night) {
        c.fillStyle = "#ff4a3a";
        c.fillRect(bx - 1, hz - 192, 2, 3);
      }
    });
  const day = sky(false),
    night = sky(true);
  for (const t of [day, night]) t.mapping = THREE.EquirectangularReflectionMapping;
  k.skies[f] = k.night ? night : day;
  k.themeFns.push((n) => (k.skies[f] = n ? night : day));

  // ---- the ground: the boardwalk, the lawn and palm promenade, the beach --------------------------
  const Z0 = 46,
    Z1 = AZ + 14;
  const deck = deckTex().clone();
  deck.rotation = Math.PI / 2;
  deck.repeat.set((Z0 - Z1) / 3, 6 / 3);
  deck.needsUpdate = true;
  k.box(f, 6.4, 0.3, Z0 - Z1, 0, -0.3, (Z0 + Z1) / 2, "#5a3e24");
  k.flat(f, 6, Z0 - Z1, new THREE.MeshStandardMaterial({ map: deck, roughness: 0.65 }), 0, (Z0 + Z1) / 2, 0.003);
  k.box(f, 0.1, 0.06, Z0 - Z1, -3.05, 0, (Z0 + Z1) / 2, "#ffcf8a", "glow");
  k.box(f, 0.1, 0.06, Z0 - Z1, 3.05, 0, (Z0 + Z1) / 2, "#ffcf8a", "glow");
  const lawn = paint(256, 256, (c, W) => {
    c.fillStyle = "#4e8a3a";
    c.fillRect(0, 0, W, W);
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = ["#5a9a44", "#467e34", "#62a24a", "#3e7230"][i % 4];
      c.fillRect(Math.random() * W, Math.random() * W, 1, 2 + Math.random() * 3);
    }
  });
  const lt = lawn.clone();
  lt.wrapS = lt.wrapT = THREE.RepeatWrapping;
  lt.repeat.set(30 / 4, (Z0 - Z1 + 60) / 4);
  lt.needsUpdate = true;
  k.flat(f, 40, Z0 - Z1 + 60, new THREE.MeshStandardMaterial({ map: lt, roughness: 1 }), -23.2, (Z0 + Z1) / 2 - 10, -0.01);
  ground(k, f, sandTex(), 3.2, Z1 - 30, 22, Z0 + 20, 5, -0.02, "#f0c8a0");
  sea(k, f, { x0: -200, z0: -320, x1: 260, z1: 120, y: -0.18, shore: [1, 0, -21, 22], fade: 215, deep: "#2a3a6a", shallow: "#5a8aa0", sky: "#f0a080", sunDir: SUN, day: { sun: "#ffb878" }, night: { deep: "#04081a", shallow: "#0a2030", sky: "#1a2040", sun: "#c8d8ff" } });
  // the walker stays on the boardwalk, the promenade and the dry sand
  k.solid(f, -60, Z0 + 1, 40, Z0 + 2);
  k.solid(f, 19, Z1 - 30, 20, Z0 + 2);
  k.solid(f, -36, Z1 - 30, -35, Z0 + 2);

  // ---- the promenade: palms, lanterns, benches -----------------------------------------------------
  for (let z = Z0 - 6, i = 0; z > Z1 + 4; z -= 11, i++) {
    palmTree(k, f, -5.2, z, 9 + (i % 3), 600 + i, { lean: 0.8, dir: Math.PI });
    k.solid(f, -5.6, z - 0.4, -4.8, z + 0.4);
    // a lantern post: a dark bronze pole, a pierced brass lantern (glows at night)
    const lz = z - 5.5;
    k.cyl(f, 0.06, 0.08, 3.6, -3.7, 0, lz, "#3a2c20", "metal", 8);
    k.box(f, 0.34, 0.5, 0.34, -3.7, 3.6, lz, "#b8862a", "metal");
    k.box(f, 0.24, 0.36, 0.24, -3.7, 3.67, lz, "#ffd28a", "glow");
    k.cyl(f, 0.0, 0.24, 0.24, -3.7, 4.1, lz, "#b8862a", "metal", 4, Math.PI / 4);
    k.solid(f, -3.9, lz - 0.2, -3.5, lz + 0.2);
    if (i % 2 === 0) {
      k.box(f, 0.6, 0.45, 2.0, -4.2, 0, z - 2.4, "#8a6440");
      k.box(f, 0.1, 0.5, 2.0, -4.5, 0.45, z - 2.4, "#8a6440");
      k.solid(f, -4.5, z - 3.4, -3.9, z - 1.4);
    }
  }
  // the beach: loungers and umbrellas, a few sandcastles
  for (let z = Z0 - 10, i = 0; z > Z1 + 10; z -= 16, i++) {
    umbrella(k, f, 9, z, i % 2 ? "#e8573a" : "#f6f2ea", "#f6e8d2");
    lounger(k, f, 9, z - 0.95, -Math.PI / 2, "#f6f2ea");
    lounger(k, f, 9, z + 0.95, -Math.PI / 2, "#f6f2ea", i % 3 ? null : "#f4b728");
    k.solid(f, 8, z - 1.4, 10, z + 1.4);
  }

  // ---- the resorts behind the promenade: low sand-coloured buildings, arches, domes ---------------
  for (let z = Z0 + 10, i = 0; z > Z1 - 10; z -= 26, i++) {
    const h = 10 + (i % 3) * 4;
    const x = -46;
    const c = ["#e8c49a", "#e0b88c", "#ecd0a8"][i % 3];
    k.box(f, 20, h, 22, x, 0, z, c);
    k.box(f, 21, 0.6, 23, x, h, z, "#d8a878");
    // the arcade on the ground floor and rows of arched windows above
    for (let j = 0; j < 6; j++) {
      const wz = z - 9 + j * 3.6;
      k.box(f, 0.1, 2.6, 2.2, x + 10.02, 0.2, wz, "#3a2418");
      k.cyl(f, 1.1, 1.1, 0.1, x + 10.03, 2.8, wz, "#3a2418", "matte", 12, Math.PI / 2);
      for (let r = 1; r < h / 3.6; r++) k.box(f, 0.08, 1.6, 1.2, x + 10.02, r * 3.6 + 0.6, wz, "#ffcf8a", "window");
    }
    // crenellations, a dome, a little tower
    for (let j = 0; j < 11; j++) k.box(f, 0.6, 0.8, 1.0, x + 10.2, h + 0.6, z - 10 + j * 2, "#d8a878");
    if (i % 2 === 0) {
      k.geo(f, new THREE.SphereGeometry(4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, h + 0.6, z), "#e8d0a0", "polish");
      k.cyl(f, 0.1, 0.1, 1.6, x, h + 4.4, z, GOLD, "metal", 6);
    } else {
      k.box(f, 5, 8, 5, x + 5, h, z + 6, c);
      k.cyl(f, 3, 0.1, 3, x + 5, h + 8, z + 6, "#d8a878", "matte", 4, Math.PI / 4);
    }
  }

  monorail(k);
  atlantis(k);
  fireworks(k);
  cast(k);

  // dhows and a yacht out on the gold water
  const dhows: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const d = dhow();
    d.position.set(60 + i * 35, y0 - 0.18, -20 - i * 40);
    d.rotation.y = 0.4 + i;
    g.add(d);
    dhows.push(d);
  }
  const y = yacht(42, "#f6f6f2", "#1a2430");
  y.group.position.set(90, y0 - 0.18, -90);
  y.group.rotation.y = -1.1;
  g.add(y.group);
  k.ticks[f].push((_dt, t) => {
    dhows.forEach((d, i) => {
      d.position.z = -20 - i * 40 + Math.sin(t * 0.02 + i) * 20;
      d.rotation.z = Math.sin(t * 0.8 + i) * 0.03;
    });
    y.group.position.y = y0 - 0.18 + Math.sin(t * 0.5) * 0.05;
  });

  k.light(f, 0, 4, 20, "#ffc890", 10, 22);
  k.light(f, 0, 4, -40, "#ffc890", 10, 22);
  k.light(f, AX, 14, AZ + 18, "#ffb890", 30, 60);
}

/** A wooden dhow under a lateen sail (a silhouette against the sun). */
function dhow() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: "#6a4428", roughness: 0.8 });
  const sail = new THREE.MeshStandardMaterial({ color: "#f0e0c0", roughness: 0.9, side: THREE.DoubleSide });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 10), wood);
  hull.position.y = 0.4;
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 4), wood);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.6, 6.4);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 9), wood);
  mast.position.set(0, 5, 1);
  const s = new THREE.BufferGeometry();
  s.setAttribute("position", new THREE.Float32BufferAttribute([0, 9.5, 5.5, 0, 2.2, -4.5, 0, 1.8, 3.0], 3));
  s.computeVertexNormals();
  const sm = new THREE.Mesh(s, sail);
  g.add(hull, bow, mast, sm);
  g.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
  return g;
}

// ---- the monorail overhead -------------------------------------------------------------------------

function monorail(k: PalmKit) {
  const g = k.groups[f];
  const top = 9.4;
  const Z0 = 140,
    Z1 = AZ + 6;
  k.box(f, 1.3, 1.1, Z0 - Z1, MX, top - 1.1, (Z0 + Z1) / 2, "#e4e0d8");
  k.box(f, 0.5, 0.25, Z0 - Z1, MX, top, (Z0 + Z1) / 2, "#b8b4ac");
  for (let z = Z0 - 6; z > Z1 + 4; z -= 24) {
    k.box(f, 1.1, top - 1.6, 1.1, MX, 0, z, "#e4e0d8");
    k.box(f, 2.6, 0.6, 1.4, MX, top - 1.7, z, "#e4e0d8");
    k.solid(f, MX - 0.6, z - 0.6, MX + 0.6, z + 0.6);
  }
  // the train: three white cars, a gold band, blue windows, faces in them
  const train = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: "#f6f6f2", roughness: 0.3, metalness: 0.1 });
  const band = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.6 });
  const win = new THREE.MeshStandardMaterial({ color: "#1a3a5a", roughness: 0.08, metalness: 0.6, emissive: "#3a6aa0", emissiveIntensity: 0.25 });
  for (let c = 0; c < 3; c++) {
    const z = c * 13;
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.9, 12.4), white);
    body.position.set(0, 1.45 + 0.4, z);
    const w = new THREE.Mesh(new THREE.BoxGeometry(2.74, 1.0, 11.4), win);
    w.position.set(0, 2.25, z);
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.76, 0.18, 12.4), band);
    b.position.set(0, 1.45, z);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 12), white);
    skirt.position.set(0, -0.2, z);
    train.add(body, w, b, skirt);
    if (c === 0) {
      const nose = new THREE.Mesh(new THREE.SphereGeometry(1.45, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), white);
      nose.rotation.x = -Math.PI / 2;
      nose.scale.set(0.95, 1.6, 1);
      nose.position.set(0, 1.85, z - 6.2);
      const nw = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 3), win);
      nw.rotation.x = -Math.PI / 2;
      nw.position.set(0, 2.3, z - 6.6);
      train.add(nose, nw);
    }
  }
  train.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
  train.position.set(MX, k.y(f) + top + 0.25, 200);
  g.add(train);
  // passengers: zkSNARK busts at the windows
  const pax: [number, number, number, number, number][] = [];
  for (let i = 0; i < 18; i++) pax.push([MX + (i % 2 ? 1.2 : -1.2), top + 1.0, -5 + (i >> 1) * 4.4, 120 + i * 37, 0.8]);
  const busts = k.crowd(f, pax);
  k.ticks[f].push((_dt, t) => {
    const u = t % 70;
    // in from the trunk behind you, along to the Atlantis station, a pause, then out of sight
    const z = u < 22 ? 200 - (u / 22) * (200 - (AZ + 30)) : u < 32 ? AZ + 30 : -400;
    train.position.z = z;
    busts.position.z = z;
  });
  k.hit(f, 1.6, 1.4, 60, MX, top - 1.1, 0, `<b>The Palm Monorail</b><span>trunk → Atlantis</span>`, () => ({ eyebrow: "The crescent", title: "Palm Monorail", stats: [["Line", "trunk → Atlantis"], ["Opened", "2009"], ["Length", "5.4 km"], ["Next train", "about a minute"]] }));
  void LEVELS;
}

// ---- Atlantis ---------------------------------------------------------------------------------------

function atlantis(k: PalmKit) {
  const g = k.groups[f];
  const y0 = k.y(f);
  // the façade: coral with rows of arched balcony windows, lit at night
  const facade = (cols: number, rows: number) => {
    const draw = (lit: boolean) =>
      paint(512, 512, (c, W, H) => {
        c.fillStyle = lit ? "#000000" : "#e8a08a";
        c.fillRect(0, 0, W, H);
        const cw = W / cols,
          rh = H / rows;
        for (let r = 0; r < rows; r++)
          for (let q = 0; q < cols; q++) {
            const x = q * cw + cw * 0.18,
              y = r * rh + rh * 0.22,
              w = cw * 0.64,
              h = rh * 0.62;
            if (lit) {
              if (Math.random() < 0.45) {
                c.fillStyle = Math.random() < 0.2 ? "#ffe0b0" : "#ffc880";
                c.fillRect(x, y + w / 2, w, h - w / 2);
                c.beginPath();
                c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
                c.fill();
              }
            } else {
              c.fillStyle = "#3a3048";
              c.fillRect(x, y + w / 2, w, h - w / 2);
              c.beginPath();
              c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
              c.fill();
              c.fillStyle = "#d08a74";
              c.fillRect(q * cw, r * rh + rh * 0.86, cw, rh * 0.08);
              c.fillStyle = "#f4e2be";
              c.fillRect(q * cw, r * rh + rh * 0.84, cw, rh * 0.03);
            }
          }
      });
    const map = draw(false),
      em = draw(true);
    for (const t of [map, em]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: "#ffffff", emissiveIntensity: k.night ? 1.2 : 0, roughness: 0.8 });
    k.themeFns.push((n) => (m.emissiveIntensity = n ? 1.2 : 0));
    return m;
  };
  const coral = facade(8, 8);
  const plain = new THREE.MeshStandardMaterial({ color: "#e8a08a", roughness: 0.8 });
  const cream = new THREE.MeshStandardMaterial({ color: "#f4e2be", roughness: 0.7 });
  const goldM = new THREE.MeshStandardMaterial({ color: "#e8b850", metalness: 0.85, roughness: 0.25 });
  const block = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, rx = 1, ry = 1) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (rx !== 1 || ry !== 1) {
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry);
    }
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y0 + y + h / 2, z);
    o.raycast = () => {};
    g.add(o);
    return o;
  };
  const D = 18;
  const zc = AZ - D / 2;
  // the two towers either side of the arch, their stepped wings
  for (const s of [-1, 1]) {
    const tx = AX + s * 24;
    block(26, 62, D, tx, 0, zc, coral, 4, 9);
    block(27, 1.2, D + 1, tx, 62, zc, cream);
    block(20, 6, D - 4, tx, 63.2, zc, coral, 3, 1);
    block(21, 0.8, D - 3, tx, 69.2, zc, cream);
    block(12, 6, D - 8, tx, 70, zc, plain);
    block(6, 5, 6, tx, 76, zc, goldM);
    block(2, 6, 2, tx, 81, zc, goldM);
    // the wings, stepping down
    for (let w = 0; w < 4; w++) {
      const wx = tx + s * (13 + w * 12 + 6);
      const h = 48 - w * 10;
      block(12, h, D - 2, wx, 0, zc, coral, 2, Math.max(1, Math.round(h / 7)));
      block(12.6, 1, D - 1, wx, h, zc, cream);
    }
  }
  // the arch: the opening (31 m high), the bridge suite over it, its crown
  const AW = 22;
  block(AW, 18, D - 2, AX, 46, zc, coral, 3, 3);
  block(AW + 1, 1.2, D - 1, AX, 64, zc, cream);
  block(AW - 6, 7, D - 6, AX, 65.2, zc, plain);
  block(AW - 12, 6, D - 10, AX, 72.2, zc, cream);
  block(6, 8, 6, AX, 78.2, zc, goldM);
  block(1.6, 9, 1.6, AX, 86, zc, goldM);
  // the arch's curve: a half-ring under the bridge, gilt rim
  const archG = new THREE.Mesh(new THREE.CylinderGeometry(AW / 2, AW / 2, D - 2, 32, 1, true, -Math.PI / 2, Math.PI), plain);
  archG.material = new THREE.MeshStandardMaterial({ color: "#f0b8a0", roughness: 0.7, side: THREE.DoubleSide });
  archG.rotation.x = Math.PI / 2;
  archG.position.set(AX, y0 + 35, zc);
  g.add(archG);
  for (const s of [-1, 1]) block(1.6, 35, D - 2, AX + s * (AW / 2 + 0.8), 0, zc, cream);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(AW / 2, 0.4, 8, 48, Math.PI), goldM);
  rim.position.set(AX, y0 + 35, AZ + 0.3);
  g.add(rim);
  // fill above the arch's curve up to the bridge
  for (const s of [-1, 1]) block(AW / 2 - 2, 11, D - 2, AX + s * (AW / 4 + 1), 35, zc, plain);
  const sign = k.label(f, "ATLANTIS", AX, 58, AZ + 0.4, { h: 3.2, color: "#ffd8a8", font: '700 96px Georgia, "Times New Roman", serif' });
  void sign;
  // the porte-cochère and the fountain court in front
  block(40, 7, 8, AX, 0, AZ + 4, plain);
  block(41, 0.8, 9, AX, 7, AZ + 4, cream);
  for (let i = 0; i < 8; i++) block(1, 7, 1, AX - 17.5 + i * 5, 0, AZ + 8.4, cream);
  {
    const fz = AZ + 20;
    k.cyl(f, 9, 9, 0.6, AX, 0, fz, "#e8dcc6", "polish", 40);
    sea(k, f, { x0: AX - 8, z0: fz - 8, x1: AX + 8, z1: fz + 8, y: 0.5, deep: "#3aa0c0", shallow: "#3aa0c0", sky: "#ffc0a0", calm: 0.6, fade: 500, sunDir: SUN });
    k.cyl(f, 1.4, 1.8, 2.2, AX, 0.6, fz, "#e8dcc6", "polish", 20);
    // the jets: a ring of water columns rising and falling
    const jets = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.22, 1, 8).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: "#e8f8ff", transparent: true, opacity: 0.75 }), 16);
    jets.raycast = () => {};
    g.add(jets);
    const m4 = new THREE.Matrix4();
    k.ticks[f].push((_dt, t) => {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const h = 1.5 + Math.abs(Math.sin(t * 1.3 + i * 0.6)) * 4;
        m4.makeScale(1, h, 1).setPosition(AX + Math.cos(a) * 5.5, y0 + 0.5, fz + Math.sin(a) * 5.5);
        jets.setMatrixAt(i, m4);
      }
      jets.instanceMatrix.needsUpdate = true;
    });
    k.solid(f, AX - 9, fz - 9, AX + 9, fz + 9);
  }
  k.solid(f, -60, AZ + 6, 60, AZ + 9);
  k.hit(f, 60, 60, 4, AX, 0, AZ + 2, `<b>Atlantis</b><span>the arch on the crescent</span>`, () => ({ eyebrow: "The crescent", title: "Atlantis, The Palm", stats: [["Opened", "2008"], ["Rooms", "about 1,500"], ["Bridge suite", "over the arch"], ["Block", k.height ? k.height.toLocaleString("en-US") : "…"]] }));
}

// ---- fireworks over the arch -------------------------------------------------------------------------

function fireworks(k: PalmKit) {
  const N = 260;
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), N);
  mesh.raycast = () => {};
  mesh.frustumCulled = false;
  k.groups[f].add(mesh);
  const P = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: -99, c: new THREE.Color() }));
  let next = 0;
  const burst = (x: number, y: number, z: number, color: string) => {
    const c = new THREE.Color(color).multiplyScalar(2.2);
    for (let i = 0; i < 52; i++) {
      const q = P[next];
      next = (next + 1) % N;
      q.p.set(x, y, z);
      const u = Math.random() * 2 - 1,
        a = Math.random() * Math.PI * 2;
      const s = 9 + Math.random() * 3;
      q.v.set(Math.sqrt(1 - u * u) * Math.cos(a) * s, u * s, Math.sqrt(1 - u * u) * Math.sin(a) * s);
      q.t = 0;
      q.c.copy(c);
    }
  };
  const show = () => {
    const y = k.y(f);
    [0, 0.6, 1.3, 2.0, 2.6].forEach((d, i) =>
      setTimeout(() => k.current === f && burst(AX - 20 + Math.random() * 40, y + 80 + Math.random() * 25, AZ - 10 + Math.random() * 10, [GOLD, "#ff5a8a", "#5ad8ff", "#ffffff", "#7dff9a"][i % 5]), d * 1000),
    );
  };
  k.blockFns.push(() => k.current === f && show());
  let every = 8;
  const m4 = new THREE.Matrix4();
  const black = new THREE.Color(0, 0, 0);
  const col = new THREE.Color();
  k.ticks[f].push((dt) => {
    every -= dt;
    if (every < 0) {
      every = 30 + Math.random() * 20;
      show();
    }
    for (let i = 0; i < N; i++) {
      const q = P[i];
      if (q.t < 0 || q.t > 3) {
        m4.makeScale(0.0001, 0.0001, 0.0001);
        mesh.setMatrixAt(i, m4);
        continue;
      }
      q.t += dt;
      q.v.y -= 6 * dt;
      q.v.multiplyScalar(1 - dt * 1.2);
      q.p.addScaledVector(q.v, dt);
      const s = Math.max(0.0001, 1 - q.t / 3);
      m4.makeScale(s, s, s).setPosition(q.p);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.copy(q.c).lerp(black, q.t / 3));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  mesh.setColorAt(0, black);
}

// ---- people --------------------------------------------------------------------------------------------

function cast(k: PalmKit) {
  k.onCast(f, () => {
    const walk: [number, number][] = [
      [1.2, 30],
      [-1.2, 0],
      [1.0, -30],
      [-1.0, -60],
      [1.4, -90],
      [-0.8, -100],
    ];
    const a = k.person(f, 1111, [-0.8, 24], "Stroller", { face: [0, -1], wander: walk });
    const b = k.person(f, 2222, [0.8, 24.4], "Stroller", { face: [0, -1], wander: walk });
    k.dialog(f, [a, b], [
      [0, "Best sunset in Dubai."],
      [1, "Best sunset on any chain."],
      [0, "The monorail's coming. Look up!"],
      [1, "Dinner under the arch?"],
      [0, "Only if they take shielded ZEC."],
      [1, "At Atlantis? They take everything."],
    ], { near: 12 });
    void k.person(f, 3333, [2.2, 6], "Photographer", { face: [1, -0.6], lines: ["Golden hour. Sixty seconds of perfect light.", "Hold still, the sun is doing all the work.", "Shot of the year. Not posting the location."], near: 9 });
    void k.person(f, 4444, [-4.2, -14.4], "Oud player", { dy: 0.1, sit: true, face: [1, 0], lines: ["♪ A song for the setting sun… ♪", "♪ Every block a new verse. ♪", "Tips in ZEC, please. Shielded, of course."], near: 10, tone: "talk" });
    void k.person(f, 5555, [6, -42], "Karak tea seller", { face: [-1, 0], lines: ["Karak tea! Hot, sweet, and private!", "One cup, zero fees."], tone: "shout", near: 10 });
    void k.person(f, 6666, [12, -70], "Sunset watcher", { sit: true, dy: 0.42, face: [1, 0], lines: ["The sun sets over the Gulf every day. The chain never sets."], near: 8 });
    void k.person(f, 7777, [AX + 3, AZ + 30], "Doorman", { face: [0, 1], lines: ["Welcome to Atlantis. The aquarium is that way, the fireworks are up there.", "Fireworks on every new block, sir."], near: 12 });
    // a camel and its handler strolling the sand
    const handler = k.person(f, 8888, [14, 10], "Camel handler", { lines: ["Camel ride? Fifteen minutes, payable in ZEC.", "He only walks on shielded sand."], near: 12 });
    const camel = camelModel();
    k.groups[f].add(camel);
    void handler.then((s) => {
      k.ticks[f].push((_dt, t) => {
        const u = (t * 0.7) % 220;
        const fw = u < 110;
        const z = 30 - (fw ? u : 220 - u);
        camel.position.set(15, k.y(f), z + (fw ? 2.6 : -2.6));
        camel.rotation.y = fw ? Math.PI : 0;
        camel.userData.walk(t);
        if (s) {
          s.root.position.set(14.2, k.y(f), z);
          s.faceDir = null;
        }
      });
    });
    // the crowd on the far beach and the Atlantis forecourt
    const crowd: [number, number, number, number, number][] = [];
    for (let i = 0; i < 40; i++) crowd.push([-14 + k.rnd(i, 1) * 28, 0, AZ + 12 + k.rnd(i, 2) * 30, 300 + i * 61, 1.6]);
    for (let i = 0; i < 20; i++) crowd.push([6 + k.rnd(i, 3) * 12, 0, -60 - k.rnd(i, 4) * 40, 2300 + i * 47, 1.6]);
    k.crowd(f, crowd);
  });
}

/** A voxel-ish dromedary: body, hump, neck, head, four legs that walk. */
function camelModel() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: "#c89a64", roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: "#8a6440", roughness: 0.9 });
  const red = new THREE.MeshStandardMaterial({ color: "#b02a2a", roughness: 0.8 });
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, mat = m) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    o.position.set(x, y, z);
    o.raycast = () => {};
    g.add(o);
    return o;
  };
  add(0.8, 0.8, 1.9, 0, 1.75, 0);
  add(0.6, 0.55, 0.8, 0, 2.35, 0);
  add(0.82, 0.12, 0.9, 0, 2.18, 0, red);
  add(0.3, 0.9, 0.3, 0, 2.2, 1.05).rotation.x = 0.5;
  add(0.32, 0.3, 0.6, 0, 2.6, 1.45);
  add(0.2, 0.15, 0.1, 0, 2.5, 1.78, dark);
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [
    [-0.25, 0.7],
    [0.25, 0.7],
    [-0.25, -0.7],
    [0.25, -0.7],
  ]) {
    const l = add(0.16, 1.4, 0.16, x, 0.7, z);
    l.geometry.translate(0, -0.7, 0);
    l.position.y = 1.4;
    legs.push(l);
  }
  g.userData.walk = (t: number) => legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 4 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.3));
  return g;
}
