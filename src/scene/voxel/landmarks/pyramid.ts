import type { Built } from "../buildings";
import { C, E, hash, rand, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { lampPost, palm } from "./needle";

/**
 * GREAT PYRAMID of Giza on its desert plaza. The pyramid climbs in 34 courses of weathered
 * limestone (blocks a metre high, each its own tone, edges chipped, corners worn) to ~36 m; the top
 * courses keep their smooth white casing and a gold pyramidion with the ⓩ. At its foot a dark
 * tourist tunnel under the chevron gable of the real north entrance; two queens' pyramids beside
 * it; in front the Sphinx (lion body, zkSNARK head in a striped nemes) facing the street; a pylon
 * gateway, a slab path between rope barriers, a ticket booth, lamps, palms and camels on sand.
 *
 * Points (model voxels, scale 2):
 *  - `keeper`: just inside the entrance tunnel.
 *  - `entrance`: the tunnel mouth.
 *  - `apex`: the tip of the gold pyramidion.
 *  - `sphinx`: the top of the Sphinx's head.
 *  - `camPos` / `camLook`: a nice exterior viewpoint.
 */
export function pyramid(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 132;
  const m = new VoxelModel(W, H, D);
  const r = rand(seed);
  const lights: Built["lights"] = [];
  const walls: NonNullable<Built["walls"]> = [];
  const signs: SignSpot[] = [];

  // ---- sand, with ripples and darker drifts; a paved strip along the street
  const sandP: Paint = (x, _y, z) => {
    const ripple = Math.sin(x * 0.35 + Math.sin(z * 0.08) * 3) > 0.75;
    const h = hash(x >> 2, z >> 2, seed);
    return C(ripple ? "#c9a46c" : h < 0.33 ? "#dbb980" : h < 0.66 ? "#d4b078" : "#e0c088");
  };
  m.box(0, 0, 0, W, 1, D, sandP);
  m.box(0, 0, D - 6, W, 1, D, shades(["#cfc6b4", "#c6bdab", "#d6cdbb"], 2, seed));
  for (let x = 0; x < W; x += 6) m.box(x, 0, D - 6, x + 1, 1, D, C("#a89f8c"));

  // ---- the Great Pyramid
  const B = Math.min(W - 62, D - 56, 122);
  const half0 = Math.floor(B / 2);
  const cx = Math.floor(W / 2) + 4,
    pz0 = 8,
    cz = pz0 + half0;
  const pz1 = cz + half0;
  const NCOURSE = 34,
    CH = 3;
  const halfAt = (i: number) => half0 - Math.round(i * ((half0 - 3) / NCOURSE));
  const lime = ["#c9b48a", "#bfa87c", "#d2bd92", "#b39c70", "#c4ae84", "#cbb68c", "#a89068", "#d8c49a", "#b8a074"];
  const limeIds = lime.map((h) => C(h));
  const stained = [C("#a88e64"), C("#9e865c")];
  // each block (1 m) its own tone; low courses stained by sand
  const block: (i: number) => Paint = (i) => (x, y, z) => {
    const h = hash(Math.floor(x / 3), i, Math.floor(z / 3), seed);
    if (i < 4 && h < 0.5 - i * 0.1) return stained[Math.floor(h * 4) % 2];
    return limeIds[Math.floor(hash(Math.floor((x + i) / 3), y >> 2, Math.floor((z + i * 2) / 3), seed + 1) * limeIds.length)];
  };
  const CASING_FROM = 26;
  for (let i = 0; i < NCOURSE; i++) {
    const h = halfAt(i);
    const y0 = 1 + i * CH;
    if (i < CASING_FROM) {
      m.box(cx - h, y0, cz - h, cx + h, y0 + CH, cz + h, block(i));
      // weathering: chipped blocks along the outer ring, worn corners
      for (let t = -h; t < h; t += 3) {
        for (const [ex, ez, side] of [
          [cx + t, cz + h - 1, 0],
          [cx + t, cz - h, 1],
          [cx - h, cz + t, 2],
          [cx + h - 1, cz + t, 3],
        ]) {
          const q = hash(t, i, side, seed + 5);
          if (q < 0.2) {
            const deep = q < 0.05 ? 2 : 1;
            const ax = side < 2 ? 3 : deep,
              az = side < 2 ? deep : 3;
            const top = q < 0.06 ? 3 : 1;
            m.clear(side === 3 ? ex - ax + 1 : ex, y0 + CH - top, side === 0 ? ez - az + 1 : ez, (side === 3 ? ex - ax + 1 : ex) + ax, y0 + CH, (side === 0 ? ez - az + 1 : ez) + az);
          }
        }
      }
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        if (hash(i, sx, sz, seed) < 0.55) {
          const x = sx < 0 ? cx - h : cx + h - 2,
            z = sz < 0 ? cz - h : cz + h - 2;
          m.clear(x, y0 + 1, z, x + 2, y0 + CH, z + 2);
        }
    } else {
      // the casing: smooth white slope (each voxel row steps in by its share)
      for (let y = y0; y < y0 + CH; y++) {
        const hh = Math.round(halfAt(i) - ((y - y0) / CH) * (halfAt(i) - halfAt(i + 1)));
        m.box(cx - hh, y, cz - hh, cx + hh, y + 1, cz + hh, shades(["#e6dcc4", "#ded2b8", "#ece2cc"], 2, seed + 9));
      }
    }
  }
  // ragged lower edge of the casing: a few casing stones still on the course below
  {
    const i = CASING_FROM - 1,
      h = halfAt(i),
      y = 1 + i * CH + CH - 1;
    for (let t = -h; t < h; t += 2)
      if (hash(t, 3, seed) < 0.45) {
        m.box(cx + t, y, cz + h - 1, cx + t + 2, y + 1, cz + h + 1, C("#e2d6bc"));
        m.box(cx + t, y, cz - h - 1, cx + t + 2, y + 1, cz - h + 1, C("#e2d6bc"));
        m.box(cx - h - 1, y, cz + t, cx - h + 1, y + 1, cz + t + 2, C("#e2d6bc"));
        m.box(cx + h - 1, y, cz + t, cx + h + 1, y + 1, cz + t + 2, C("#e2d6bc"));
      }
  }
  // the gold pyramidion with the ⓩ on its face
  const capY = 1 + NCOURSE * CH;
  const gold = shades(["#f4b728", "#e8a818", "#ffc840"], 1, 3);
  for (let y = 0; y < 10; y++) {
    const hh = Math.max(0, 5 - Math.floor(y / 2));
    m.box(cx - hh - 1, capY + y, cz - hh - 1, cx + hh + 1, capY + y + 1, cz + hh + 1, gold);
  }
  const zc = E("#ffe08a", 2.2);
  {
    const fz = cz + 5,
      y = capY + 1;
    // a 5 × 6 Z with its bars, proud of the front face
    for (let x = -2; x <= 2; x++) {
      m.set(cx + x, y, fz + 1, zc);
      m.set(cx + x, y + 4, fz, zc);
    }
    m.set(cx - 1, y + 1, fz + 1, zc);
    m.set(cx, y + 2, fz + 1, zc);
    m.set(cx + 1, y + 3, fz, zc);
    m.set(cx, y + 5, fz - 1, zc);
    m.set(cx, y - 1, fz + 1, zc);
  }

  // the tip of the pyramidion catches the light
  m.paint(cx - 3, capY + 6, cz - 3, cx + 3, capY + 10, cz + 3, E("#f4b728", 1.25));
  // floodlights at the foot of the front corners (the sound-and-light show)
  for (const s of [-1, 1]) {
    const fx = s < 0 ? cx - half0 - 4 : cx + half0 + 3;
    m.box(fx, 1, pz1 + 3, fx + 2, 3, pz1 + 5, C("#2a2622"));
    m.box(fx, 3, pz1 + 3, fx + 2, 4, pz1 + 4, E("#ffd8a0", 2.4));
    lights.push([fx + 1, 6, pz1 + 2, "#ffcf8a"]);
  }

  // ---- the tourist entrance: a dark tunnel under the chevron gable
  const tw = 5,
    th = 11,
    tz = pz1 - 22;
  m.clear(cx - tw, 1, tz, cx + tw, 1 + th, pz1 + 2);
  m.box(cx - tw, 0, tz, cx + tw, 1, pz1 + 1, shades(["#8a7a62", "#7e6e58"], 1, 2));
  m.box(cx - tw, 1, tz, cx + tw, 1 + th, tz + 1, C("#0c0806"));
  // dressed jambs and a granite lintel
  for (const s of [-1, 1]) {
    const x = s < 0 ? cx - tw - 2 : cx + tw;
    m.box(x, 1, pz1 - 6, x + 2, 1 + th, pz1 + 2, shades(["#b8a684", "#ae9c7a", "#c2b08e"], 1, 4));
    // torches inside the tunnel
    m.box(s < 0 ? cx - tw : cx + tw - 1, 7, pz1 - 10, s < 0 ? cx - tw + 1 : cx + tw, 9, pz1 - 9, E("#ff8a2a", 2.4));
    m.box(s < 0 ? cx - tw : cx + tw - 1, 7, pz1 - 18, s < 0 ? cx - tw + 1 : cx + tw, 9, pz1 - 17, E("#ff8a2a", 2.4));
  }
  m.box(cx - tw - 2, 1 + th, pz1 - 6, cx + tw + 2, 3 + th, pz1 + 2, shades(["#a8967a", "#9e8c70"], 1, 5));
  // the chevron: two rows of great inclined slabs meeting over the door
  const gable = shades(["#d6c49c", "#cbb890"], 1, 6);
  for (let t = 0; t <= 10; t++) {
    const y = 4 + th + t;
    for (const s of [-1, 1]) {
      const x = cx + s * (11 - t);
      const face = cz + halfAt(Math.floor((y - 1) / CH));
      m.box(x - 1, y, face - 4, x + 1, y + 2, face + 2, gable);
    }
  }
  m.box(cx - 1, 4 + th + 10, cz + halfAt(Math.floor((4 + th + 10) / CH)) - 4, cx + 1, 4 + th + 13, cz + halfAt(Math.floor((4 + th + 10) / CH)) + 2, gable);
  // a sign over the tunnel
  signs.push({ text: "ENTRANCE · 入口", color: "#f4b728", x: cx, y: th + 2, z: pz1 + 2.1, w: 2 * tw + 4, h: 2, vertical: false, facing: "front" });
  lights.push([cx, 8, pz1 - 4, "#ff9a3a"]);

  // ---- queens' pyramids
  const queen = (qx: number, qz: number, base: number, courses: number, ruined: boolean) => {
    const h0 = Math.floor(base / 2);
    for (let i = 0; i < courses; i++) {
      const hh = h0 - Math.round((i * (h0 - 1)) / courses);
      if (ruined && i > courses - 4) {
        // the top has fallen: a rubble cap
        for (let t = 0; t < 10; t++) m.set(qx - hh + Math.floor(r() * hh * 2), 1 + i * 2, qz - hh + Math.floor(r() * hh * 2), block(i));
        continue;
      }
      m.box(qx - hh, 1 + i * 2, qz - hh, qx + hh, 3 + i * 2, qz + hh, block(i + 3));
      for (let t = -hh; t < hh; t += 2) if (hash(t, i, qx, seed) < 0.18) m.clear(qx + t, 2 + i * 2, qz + hh - 1, qx + t + 2, 3 + i * 2, qz + hh);
    }
    walls.push([qx - h0, qz - h0, qx + h0, qz + h0]);
  };
  const qb = Math.min(28, cx - half0 - 4);
  if (qb >= 14) {
    queen(2 + qb / 2, 10 + qb / 2, qb, Math.round(qb / 2), false);
    queen(2 + qb / 2, 16 + qb * 1.5, qb - 2, Math.round(qb / 2) - 1, true);
  }
  walls.push([cx - half0, pz0, cx + half0, tz], [cx - half0, tz, cx - tw - 2, pz1], [cx + tw + 2, tz, cx + half0, pz1]);

  // ---- the Sphinx, with a zkSNARK's head, on its rock plinth, facing the street
  const sx0 = 4,
    sx1 = sx0 + 18,
    sz1 = D - 12,
    sz0 = sz1 - 50;
  const scx = (sx0 + sx1) / 2;
  const rock = shades(["#c2a372", "#b8986a", "#ccad7c"], 1, 11);
  const lion = shades(["#d4b07a", "#c9a46e", "#dcb984", "#c49e68"], 1, 12);
  const blue = C("#2f5f9e"),
    goldS = C("#d8a62a");
  m.box(sx0 - 3, 1, sz0 - 3, sx1 + 3, 3, sz1 + 3, rock);
  for (let x = sx0 - 3; x < sx1 + 3; x += 3) m.set(x, 2, sz1 + 2, C("#a88a5c"));
  // the lion's body: rounded haunches, a long back with its spine, the shoulders
  for (let z = sz0; z < sz0 + 34; z++) {
    const t = (z - sz0) / 34;
    const top = z < sz0 + 12 ? 14 - Math.round(((z - sz0 - 6) / 6) ** 2 * 2) : 12 + Math.round(t * 2);
    for (let x = sx0 + 1; x < sx1 - 1; x++) {
      const e = Math.abs(x + 0.5 - scx) / ((sx1 - sx0) / 2 - 1);
      const h = Math.round(top - e * e * 3);
      m.box(x, 3, z, x + 1, h, z + 1, lion);
    }
  }
  // the haunch and hind paw on each side, the tail curled along the right flank
  for (const s of [-1, 1]) {
    const x = s < 0 ? sx0 : sx1 - 2;
    m.box(x, 3, sz0 + 2, x + 2, 9, sz0 + 12, lion);
    m.box(x, 3, sz0 + 12, x + 2, 5, sz0 + 18, lion);
  }
  for (let z = sz0 + 1; z < sz0 + 16; z++) m.set(sx1 - 1 + (z % 5 < 2 ? 1 : 0), 4 + (z > sz0 + 13 ? 1 : 0), z, C("#b89466"));
  // chest and forelegs, paws stretched out in front with toes
  m.box(sx0 + 3, 3, sz0 + 30, sx1 - 3, 16, sz0 + 37, lion);
  for (const px of [sx0 + 2, sx1 - 7]) {
    m.box(px, 3, sz0 + 34, px + 5, 7, sz1, lion);
    for (let t = 0; t < 5; t += 2) m.set(px + t, 4, sz1 - 1, C("#a8865a"));
  }
  // the head: a zkSNARK's square face in a striped nemes
  const hw = 6,
    hz0 = sz0 + 31,
    hz1 = hz0 + 9;
  const stripe = (y: number) => (Math.floor(y / 2) % 2 ? blue : goldS);
  // hood over the head and down the back of the neck
  for (let y = 16; y < 30; y++) {
    const w = y >= 27 ? hw + 1 - (y - 27) : hw + 1;
    m.box(scx - w, y, hz0 - (y < 20 ? 3 : 1), scx + w, y + 1, hz1 - 2, stripe(y));
  }
  // lappets falling in front of the shoulders
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? scx - hw - 2 : scx + hw;
    for (let y = 12; y < 26; y++) m.box(x0, y, hz1 - 5, x0 + 2, y + 1, hz1 - 1, stripe(y));
  }
  // the face
  const skin = shades(["#d8a868", "#cf9e5e"], 1, 13);
  m.box(scx - hw, 15, hz1 - 3, scx + hw, 27, hz1, skin);
  m.box(scx - hw, 25, hz1 - 3, scx + hw, 27, hz1 + 1, C("#b8322a"));
  for (const s of [-1, 1]) {
    const ex = s < 0 ? scx - 4 : scx + 1;
    m.box(ex, 20, hz1, ex + 3, 23, hz1 + 1, C("#14100c"));
    m.set(ex + 1, 22, hz1, E("#f4b728", 2));
  }
  m.box(scx - 2, 17, hz1, scx + 2, 18, hz1 + 1, C("#5a2a1a"));
  // the ⓩ uraeus on the brow, the worn nose
  m.box(scx - 1, 26, hz1 + 1, scx + 1, 29, hz1 + 2, C("#f4b728"));
  m.set(scx - 1, 19, hz1 - 1, C("#a87c48"));
  m.set(scx, 19, hz1 - 1, C("#a87c48"));
  // the false beard, broken off below the chin
  m.box(scx - 1, 13, hz1 - 2, scx + 1, 15, hz1, C("#8a6a40"));
  walls.push([sx0 - 3, sz0 - 3, sx1 + 3, sz1 + 3]);

  // ---- the processional way: slabs from the street to the tunnel, a pylon gate, rope barriers
  const pw = 8;
  m.box(cx - pw, 0, pz1, cx + pw, 1, D - 6, shades(["#d8ccb0", "#cfc2a6", "#e0d4b8"], 3, seed + 2));
  for (let z = pz1; z < D - 6; z += 4) m.box(cx - pw, 0, z, cx + pw, 1, z + 1, C("#b4a688"));
  // pylons
  const pyl = shades(["#d0b888", "#c6ae7e", "#d8c090"], 1, 14);
  const gz = D - 16;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? cx - pw - 12 : cx + pw + 1,
      x1 = x0 + 11;
    for (let y = 1; y < 24; y++) {
      const inset = Math.floor(y / 8);
      m.box(x0 + inset, y, gz - 4 + inset, x1 - inset, y + 1, gz + 4 - inset, pyl);
    }
    m.box(x0 + 2, 24, gz - 2, x1 - 2, 25, gz + 2, C("#b89e70"));
    // painted bands
    for (const y of [6, 12, 18]) m.paint(x0, y, gz - 4, x1, y + 1, gz + 5, s < 0 ? blue : C("#a8382a"));
    walls.push([x0, gz - 4, x1, gz + 4]);
  }
  m.box(cx - pw - 3, 19, gz - 2, cx + pw + 3, 23, gz + 2, pyl);
  m.box(cx - pw - 3, 23, gz - 2, cx + pw + 3, 24, gz + 2, C("#b89e70"));
  // a winged ⓩ disk on the lintel (lit)
  m.box(cx - 2, 20, gz + 2, cx + 2, 23, gz + 3, E("#f4b728", 1.8));
  for (const s of [-1, 1]) m.box(s < 0 ? cx - 7 : cx + 2, 21, gz + 2, s < 0 ? cx - 2 : cx + 7, 22, gz + 3, C("#2f5f9e"));
  signs.push({ text: "GREAT PYRAMID · ピラミッド", color: "#f4b728", x: cx, y: 17.2, z: gz + 2.2, w: 2 * pw + 2, h: 2.4, vertical: false, facing: "front" });

  // rope barriers either side of the way
  const post = C("#2a2622"),
    brass = C("#c8a040"),
    rope = C("#a8202a");
  for (const s of [-1, 1]) {
    const x = cx + s * (pw - 1);
    for (let z = pz1 + 4; z < gz - 6; z += 6) {
      m.box(x, 1, z, x + 1, 4, z + 1, post);
      m.set(x, 4, z, brass);
      if (z + 6 < gz - 6) for (let t = 1; t < 6; t++) m.set(x, t === 3 ? 2 : 3, z + t, rope);
    }
  }
  // lamps along the way
  for (const s of [-1, 1])
    for (const z of [pz1 + 8, pz1 + 26]) {
      const p = lampPost(m, cx + s * (pw + 3), 1, z, k, "#ffc070", 4.2);
      if (z === pz1 + 26) lights.push([p[0], p[1], p[2], "#ffc070"]);
    }

  // ---- the ticket booth (right of the way)
  const bx0 = cx + pw + 4,
    bx1 = bx0 + 14,
    bz0 = pz1 + 8,
    bz1 = bz0 + 9;
  m.box(bx0, 1, bz0, bx1, 9, bz1, shades(["#d8c8a4", "#cfbf9a"], 1, 15));
  m.box(bx0 + 2, 4, bz1 - 1, bx1 - 2, 8, bz1, E("#ffd08a", 1.3));
  m.box(bx0 + 2, 4, bz1, bx1 - 2, 5, bz1 + 1, C("#6a4a2c"));
  m.box(bx0 + 6, 5, bz1 - 1, bx0 + 8, 8, bz1, C("#2a2622"));
  for (let x = bx0 - 1; x < bx1 + 1; x++) m.box(x, 9, bz0 - 1, x + 1, 10, bz1 + 3, Math.floor((x - bx0) / 2) % 2 ? blue : goldS);
  m.box(bx0 - 1, 10, bz0 - 1, bx1 + 1, 11, bz1 + 1, C("#d8c8a4"));
  signs.push({ text: "TICKETS · 入場券", color: "#ffd08a", x: (bx0 + bx1) / 2, y: 12.4, z: bz1 + 0.1, w: 12, h: 2, vertical: false, facing: "front" });
  walls.push([bx0, bz0, bx1, bz1]);

  // ---- camels resting and standing on the right
  const camel = (x: number, z: number, lying: boolean, sd: number) => {
    const hide = shades(["#c08a54", "#b67e4a", "#ca945e"], 1, sd);
    const leg = lying ? 0 : 4;
    if (!lying)
      for (const [lx, lz] of [
        [0, 0],
        [2, 0],
        [0, 6],
        [2, 6],
      ])
        m.box(x + lx, 1, z + lz, x + lx + 1, 1 + leg, z + lz + 1, hide);
    const by = 1 + leg;
    m.box(x, by, z, x + 3, by + 3, z + 7, hide);
    m.box(x, by + 3, z + 2, x + 3, by + 5, z + 5, hide);
    // saddle blanket
    m.box(x - 1, by + 2, z + 2, x + 4, by + 4, z + 5, C(sd % 2 ? "#a8202a" : "#2f5f9e"));
    m.box(x - 1, by + 2, z + 3, x + 4, by + 3, z + 4, goldS);
    // neck and head reaching forward (+z)
    m.box(x + 1, by + 2, z + 7, x + 2, by + 6, z + 8, hide);
    m.box(x + 1, by + 5, z + 8, x + 2, by + 7, z + 10, hide);
    m.set(x + 1, by + 6, z + 10, C("#3a2a1a"));
    walls.push([x - 1, z, x + 4, z + 10]);
  };
  const cmx = Math.min(W - 10, bx1 + 8);
  camel(cmx, pz1 + 6, false, 1);
  camel(cmx + 1, pz1 + 22, true, 2);
  camel(cmx - 6, pz1 + 30, false, 3);

  // ---- palms: an oasis by the camels, a row by the Sphinx, pairs at the gate
  const palms: [number, number][] = [
    [W - 6, pz1 - 4],
    [W - 12, pz1 + 14],
    [W - 5, D - 14],
    [sx1 + 6, sz0 + 4],
    [sx1 + 7, sz1 - 6],
    [cx - pw - 16, gz - 10],
    [cx + pw + 16, gz - 10],
    [cx - half0 - 6, pz0 + 8],
    [cx + half0 + 4, pz0 + 30],
    [cx + half0 + 6, pz0 + 70],
  ];
  palms.forEach(([x, z], i) => {
    if (x < 2 || x > W - 3 || z < 2 || z > D - 3) return;
    palm(m, x, 1, z, k, seed + i * 17, 6 + (i % 3) * 1.5);
  });
  // sand drifted against the pyramid's foot
  for (let t = -half0; t < half0; t++)
    for (const [x, z] of [
      [cx + t, pz1],
      [cx - half0 - 1, cz + t],
      [cx + half0, cz + t],
    ]) {
      const h = hash(t >> 2, x, seed) * 3;
      if (Math.abs(x - cx) < tw + 3 && z === pz1) continue;
      for (let y = 1; y < 1 + h; y++) m.set(x, y, z, C("#d8b47c"));
    }

  const top = capY + 10;
  return {
    model: m,
    signs,
    door: [cx, pz1 + 1],
    body: [0, 0, W, D],
    walls,
    lights,
    scale: k,
    points: {
      keeper: [cx, 1, pz1 - 6],
      entrance: [cx, 1, pz1],
      apex: [cx, top, cz],
      sphinx: [scx, 30, hz1 - 3],
      camPos: [cx + 150, 120, D + 230],
      camLook: [cx, 45, cz + 10],
    },
  };
}
