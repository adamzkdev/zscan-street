import * as THREE from "three";
import { box, glowMat, makeScene, room, std, textPlane, wall } from "./kit";
import { armchair, backBar, barCounter, bench, bookshelf, chair, coffeeMachine, coffeeTable, desk, diningTable, floorLamp, fridge, nightstand, pendant, place, plant, rug, sconce, sofa, stool } from "./furniture";
import type { Interior, InteriorContext, Rect } from "./types";
import { chainOf, mallOf } from "../scene/real/martdata";
import type { Snark } from "../scene/snark";
import { dressMart } from "./mart";
import { dressMall } from "./islemall";

/**
 * Any building of the city, walked into from the game (src/gta): one place whose ground floor is
 * dressed again on every visit after the building you came through — a convenience store for a
 * shop, an office lobby, an apartment block's hall, a café or a bar — its colours and layout drawn
 * from the building's own seed, its name over the counter. Every piece of furniture is its own
 * thing: it stops you, and it breaks when you hit it (src/gta/breakables.ts).
 *
 * A shop whose door carries a convenience-store chain's name or a mall's (src/scene/real/martdata.ts)
 * is that chain's store (./mart.ts) or that mall's atrium (./islemall.ts, a bigger room).
 */

export type BuildingKind = "shop" | "office" | "home" | "cafe" | "bar";
export interface BuildingVisit {
  kind: BuildingKind;
  name: string;
  seed: number;
}

let next: BuildingVisit = { kind: "office", name: "ZStreet", seed: 1 };
let dressNow: (() => void) | null = null;

/** The building about to be walked into (called before entering). */
export function dressBuilding(v: BuildingVisit) {
  next = v;
  dressNow?.();
}

/** Which kind of ground floor a building of the city has, by its archetype. */
export function kindOf(type: string, seed: number): BuildingKind {
  // (Orchard Keys' diner and bar say what they are)
  if (type === "cafe" || type === "bar") return type;
  if (type === "streetshop" || type === "kiosk" || type === "bookshop") return "shop";
  if (type === "izakaya" || type === "machiya") return seed % 2 ? "bar" : "cafe";
  if (type === "apartment" || type === "house") return "home";
  if (type === "shophouse") return seed % 3 === 0 ? "cafe" : "shop";
  return "office";
}

/**
 * The street seen through a shop window (512 × 256): the sky, the facades across the road with
 * their windows (lit at night), a lamp post, a parked car, the kerb and the pavement — drawn then
 * blurred, the way a street reads through glass from inside.
 */
function streetThrough(seed: number, night: boolean) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  const r = rnd(seed * 131 + 7);
  const sky = g.createLinearGradient(0, 0, 0, 140);
  sky.addColorStop(0, night ? "#0c1424" : "#9ec4e4");
  sky.addColorStop(1, night ? "#1c2638" : "#dce8f0");
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 256);
  g.filter = "blur(2.5px)";
  // the facades across the road
  const fac = night ? ["#2a2630", "#33303a", "#262a34", "#3a3236"] : ["#c8b8a4", "#a8aeb6", "#d6cbb8", "#8e7a6a", "#b4a08a", "#e0dcd2"];
  for (let x = -10; x < 520; ) {
    const w = 70 + r() * 90,
      top = 10 + r() * 70;
    g.fillStyle = fac[Math.floor(r() * fac.length)];
    g.fillRect(x, top, w, 170 - top);
    for (let wy = top + 10; wy < 150; wy += 18)
      for (let wx = x + 8; wx < x + w - 10; wx += 16) {
        g.fillStyle = night ? (r() < 0.45 ? "#ffd590" : "#141820") : r() < 0.2 ? "#5a6a7a" : "#3c4a5a";
        g.fillRect(wx, wy, 9, 11);
      }
    // a shop sign at the foot of it
    g.fillStyle = ["#e8463a", "#f4b728", "#3fa8ff", "#43d17a", "#2a2830"][Math.floor(r() * 5)];
    g.fillRect(x + 6, 150, w - 12, 9);
    x += w + 2;
  }
  // the road, the kerb, the pavement right outside
  g.fillStyle = night ? "#15161a" : "#4a4c50";
  g.fillRect(0, 170, 512, 44);
  g.fillStyle = night ? "#2a2a2e" : "#a8a49c";
  g.fillRect(0, 212, 512, 6);
  g.fillStyle = night ? "#22222a" : "#8e8a84";
  g.fillRect(0, 218, 512, 38);
  // a parked car, a lamp post
  const cx = 60 + r() * 330;
  g.fillStyle = ["#c8202e", "#2a4a7a", "#e8e4dc", "#1a1a1e", "#3a6a4a"][Math.floor(r() * 5)];
  g.beginPath();
  g.roundRect(cx, 176, 120, 26, 8);
  g.roundRect(cx + 24, 160, 66, 22, 8);
  g.fill();
  g.fillStyle = night ? "#3a4660" : "#9ab4c8";
  g.fillRect(cx + 30, 164, 54, 13);
  g.fillStyle = "#101014";
  for (const wx of [cx + 22, cx + 98]) {
    g.beginPath();
    g.arc(wx, 202, 10, 0, Math.PI * 2);
    g.fill();
  }
  const lx = (cx + 220) % 480 + 16;
  g.fillStyle = "#26282c";
  g.fillRect(lx, 70, 5, 150);
  g.fillStyle = night ? "#ffe0a0" : "#d8d8d0";
  g.fillRect(lx - 8, 66, 20, 6);
  g.filter = "none";
  if (night) {
    const glow = g.createRadialGradient(lx + 2, 74, 2, lx + 2, 74, 60);
    glow.addColorStop(0, "rgba(255,210,140,0.5)");
    glow.addColorStop(1, "rgba(255,210,140,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, 512, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const rnd = (seed: number) => {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const W0 = 7;
const D0 = 13;

export function buildBuilding(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0d0e13");
  const shell = new THREE.Group();
  shell.name = "building-shell";
  const fit = new THREE.Group();
  fit.name = "building-fit";
  scene.add(shell, fit);
  const rects: Rect[] = [];
  const own: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  let title = "BUILDING";
  const lights: THREE.PointLight[] = [];
  /** The zkSNARKs of the current dress (a store's cashier, a mall's shoppers), ticked while inside. */
  let people: Snark[] = [];
  const camQuat = new THREE.Quaternion(),
    camRight = new THREE.Vector3();
  for (let i = 0; i < 3; i++) {
    const l = new THREE.PointLight("#fff0d6", 14, 16, 1.6);
    l.position.set(0, 3, -2 - i * 4);
    scene.add(l);
    lights.push(l);
  }

  const dress = () => {
    const v = next;
    const r = rnd(v.seed * 7919 + v.kind.length);
    title = v.name.toUpperCase();
    // a chain's store or a mall, by the name on the door
    const chain = v.kind === "shop" ? chainOf(v.name) : null;
    const mall = v.kind === "shop" ? mallOf(v.name) : null;
    for (const s of people) s.dispose();
    people = [];
    // the old fit-out out
    for (const g of [shell, fit])
      for (const c of [...g.children]) {
        g.remove(c);
        c.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && !m.geometry.userData.shared && m.parent === null) m.geometry.dispose();
        });
      }
    for (const x of own) x.dispose();
    own.length = 0;
    rects.length = 0;
    const mat = (c: string, rough = 0.7, metal = 0.05) => {
      const m = std(c, rough, metal);
      own.push(m);
      return m;
    };
    const palettes: Record<BuildingKind, { floor: string[]; wall: string[]; ceil: string; light: string }> = {
      shop: { floor: ["#b9b6ae", "#a8aab0", "#c4bfb4"], wall: ["#d9d6ce", "#cfd8dc"], ceil: "#e4e4e2", light: "#f6fbff" },
      office: { floor: ["#c9c4bc", "#2a2c33", "#d8d2c6"], wall: ["#e9e4da", "#3a3d46", "#f0ede6"], ceil: "#eceae4", light: "#fff3df" },
      home: { floor: ["#8a6a4a", "#a07a54", "#6e5440"], wall: ["#e4ddd0", "#d6dcd8", "#efe6d8"], ceil: "#f2ede4", light: "#ffe7c4" },
      cafe: { floor: ["#7a5236", "#5c4030", "#b08a64"], wall: ["#efe4d2", "#2f4a3e", "#e8d8c0"], ceil: "#3a2c22", light: "#ffd9a0" },
      bar: { floor: ["#2a2024", "#1e1c24"], wall: ["#3a2630", "#232634"], ceil: "#141218", light: "#ff9f6a" },
    };
    const P = mall ? { floor: [mall.floor], wall: [mall.wall], ceil: "#f6f4f0", light: "#fff2dc" } : chain ? { floor: [chain.floor], wall: ["#f4f6f8"], ceil: "#f4f4f2", light: "#f6fbff" } : palettes[v.kind];
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const H = mall ? 13 : v.kind === "office" ? 4.4 : 3.5;
    // (a mall's atrium: a much bigger room; the rest the shop's own)
    const W = mall ? 12 : W0,
      D = mall ? 46 : D0;
    const floorM = mat(pick(P.floor), v.kind === "office" ? 0.2 : 0.6, 0.05);
    const wallM = mat(pick(P.wall), 0.85);
    rects.push(...room(shell, { x0: -W, z0: -D, x1: W, z1: 0, h: H, floor: floorM, wall: wallM, ceiling: mat(P.ceil, 0.9), door: [-1.3, 1.3] }));
    // the shop front: glass either side of the door, and through it the street (the pavement, a
    // parked car, the facades across the road under the sky, softly out of focus), not a white sheet
    const streetT = streetThrough(v.seed, ctx.theme === "night");
    const glassM = new THREE.MeshBasicMaterial({ map: streetT, color: "#e8eef2" });
    const frameM = mat("#24262c", 0.4, 0.6);
    own.push(glassM, streetT);
    for (const sx of [-1, 1]) {
      const gw = W - 2.2,
        gh = Math.min(H - 1.4, 4.2),
        gx = sx * (W / 2 + 0.9);
      const g = box(shell, gw, gh, 0.06, glassM, gx, 0.6, -0.12);
      g.name = "window";
      // the frame and its mullions
      box(shell, gw + 0.1, 0.08, 0.12, frameM, gx, 0.56, -0.16);
      box(shell, gw + 0.1, 0.08, 0.12, frameM, gx, 0.6 + gh - 0.04, -0.16);
      for (const k of [-0.5, 0, 0.5]) box(shell, 0.06, gh, 0.12, frameM, gx + k * gw, 0.6, -0.16);
    }
    lights.forEach((l, i) => {
      l.color.set(P.light);
      l.intensity = mall ? 16 : chain ? 8 : v.kind === "shop" ? 6 : v.kind === "bar" ? 9 : 11;
      l.distance = mall ? 30 : 16;
      l.decay = mall ? 1.3 : 1.6;
      l.position.set(0, mall ? 9 : 3, mall ? -8 - i * 14 : -2 - i * 4);
    });
    // the ceiling's light panels
    const panel = glowMat(P.light, v.kind === "bar" ? 0.8 : v.kind === "shop" ? 1.2 : 1.6);
    own.push(panel);
    for (let z = -2; z > -D + 1 && !mall; z -= 3.5)
      for (const x of [-3, 3]) {
        const p = box(shell, 1.6, 0.04, 0.6, panel, x, H - 0.05, z);
        p.name = "ceiling-light";
      }
    // the name over the back wall
    const sign = textPlane(title, { h: v.kind === "office" ? 0.55 : 0.48, color: v.kind === "bar" ? "#ff5aa8" : "#f4b728", glow: v.kind === "bar" || v.kind === "cafe", font: '800 96px Archivo, "Roboto", sans-serif' });
    sign.position.set(0, H - 0.9, -D + 0.12);
    sign.name = "wall-sign";
    // (a chain's store and a mall have their own signs)
    if (!chain && !mall) shell.add(sign);
    own.push(sign.geometry, sign.material as THREE.Material, (sign.material as THREE.MeshBasicMaterial).map!);
    const solid = (x0: number, z0: number, x1: number, z1: number) => rects.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
    const put = (key: string, build: Parameters<typeof place>[2], x: number, z: number, rot: number, w: number, d: number) => {
      place(fit, key, build, x, 0, z, rot);
      const sw = Math.abs(Math.sin(rot)) > 0.5;
      solid(x - (sw ? d : w) / 2, z - (sw ? w : d) / 2, x + (sw ? d : w) / 2, z + (sw ? w : d) / 2);
    };
    const goods = ["#e8463a", "#f4b728", "#3fa8ff", "#43d17a", "#ff8a1f", "#b07bff", "#f2f0ea", "#ff5aa8"];
    const mine = people;
    const env = { shell, fit, own, solid, mat, r, W, D, H, people, live: () => people === mine };
    if (mall) dressMall(env, mall, v.seed);
    else if (chain) dressMart(env, chain, v.seed);
    else if (v.kind === "shop") {
      // aisles of gondola shelving (a base, a pegboard spine, four shelves each side, a price rail)
      // filled shelf by shelf with packs, cans and bottles; the fridges along the left wall; the
      // counter by the door
      const shelfM = mat("#e4e6ea", 0.35, 0.5);
      const spineM = mat("#c8ccd2", 0.6, 0.2);
      const railM = mat("#f4b728", 0.5, 0.1);
      const packGeo = new THREE.BoxGeometry(1, 1, 1);
      const canGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
      const bottleGeo = new THREE.CylinderGeometry(0.32, 0.5, 1, 10);
      // (every product of a kind in one instanced draw, its colour per instance: hundreds of them)
      const stock: { geo: THREE.BufferGeometry; m: THREE.Matrix4[]; c: THREE.Color[]; mat: THREE.MeshStandardMaterial }[] = [
        { geo: packGeo, m: [], c: [], mat: new THREE.MeshStandardMaterial({ roughness: 0.55 }) },
        { geo: canGeo, m: [], c: [], mat: new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.5 }) },
        { geo: bottleGeo, m: [], c: [], mat: new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.05 }) },
      ];
      own.push(packGeo, canGeo, bottleGeo, ...stock.map((q) => q.mat));
      const q = new THREE.Quaternion(),
        sc = new THREE.Vector3(),
        ps = new THREE.Vector3();
      for (const x of [-3.6, 0, 3.6]) {
        if (x === 0 && r() < 0.3) continue;
        const z0 = -4.2,
          len = 6.4,
          zc = z0 - len / 2;
        box(fit, 0.95, 0.12, len, spineM, x, 0, zc);
        box(fit, 0.06, 1.75, len, spineM, x, 0.12, zc);
        solid(x - 0.5, z0 - len, x + 0.5, z0);
        for (const side of [-1, 1])
          for (let shelf = 0; shelf < 4; shelf++) {
            const y = 0.14 + shelf * 0.42;
            box(fit, 0.42, 0.025, len, shelfM, x + side * 0.24, y, zc);
            box(fit, 0.012, 0.035, len, railM, x + side * 0.455, y, zc);
            // a run of one product, then the next (shops stock in facings)
            for (let zz = z0 - 0.15; zz > z0 - len + 0.15; ) {
              const kind = r(),
                n = 2 + Math.floor(r() * 4),
                col = new THREE.Color(pick(goods));
              const w = kind < 0.4 ? 0.14 + r() * 0.08 : 0.07 + r() * 0.03,
                h = kind < 0.4 ? 0.2 + r() * 0.12 : kind < 0.7 ? 0.12 : 0.24 + r() * 0.06;
              const st = stock[kind < 0.4 ? 0 : kind < 0.7 ? 1 : 2];
              for (let i = 0; i < n && zz > z0 - len + 0.12; i++) {
                st.m.push(new THREE.Matrix4().compose(ps.set(x + side * 0.27, y + 0.025 + h / 2, zz - w / 2), q, sc.set(kind < 0.4 ? 0.3 : w, h, w)));
                st.c.push(col);
                zz -= w + 0.012;
              }
              zz -= 0.03;
            }
          }
      }
      for (const st of stock) {
        const im = new THREE.InstancedMesh(st.geo, st.mat, st.m.length);
        st.m.forEach((mm, i) => (im.setMatrixAt(i, mm), im.setColorAt(i, st.c[i])));
        im.castShadow = true;
        im.name = "goods";
        im.userData.noBreak = true;
        fit.add(im);
      }
      // fridges: lit glass doors
      const fridgeM = glowMat("#dff6ff", 1.1);
      own.push(fridgeM);
      for (let z = -2; z > -D + 1.5; z -= 1.4) {
        const f = box(fit, 0.08, 2, 1.2, fridgeM, -W + 0.3, 0.1, z);
        f.name = "fridge-door";
      }
      solid(-W, -D, -W + 0.8, -1.4);
      // the counter, its till, a coffee machine
      place(fit, "shop-counter", () => barCounter(3.2, "#f4b728"), W - 2.4, 0, -2.2, 0);
      solid(W - 4.1, -2.7, W - 0.7, -1.7);
      place(fit, "coffee-machine", coffeeMachine, W - 1.4, 1.05, -2.2, Math.PI);
      const till = box(fit, 0.45, 0.32, 0.4, mat("#16161c", 0.3, 0.6), W - 3.2, 1.05, -2.2);
      till.name = "till";
    } else if (v.kind === "office") {
      // the reception desk, the lifts behind it, a lounge either side
      put("desk-" + (v.seed % 3), () => desk(v.seed % 3), 0, -6.5, Math.PI, 2.2, 1.1);
      put("desk-b" + (v.seed % 3), () => desk((v.seed + 1) % 3), 1.9, -6.5, Math.PI, 2.2, 1.1);
      const liftM = mat("#8f939c", 0.25, 0.9);
      for (const x of [-2.2, 0, 2.2]) {
        const d = box(shell, 1.4, 2.6, 0.08, liftM, x, 0, -D + 0.1);
        d.name = "lift-door";
      }
      const sofaC = pick(["#2f4a7a", "#7a2f3a", "#3a3a44", "#c7a26b"]);
      put("sofa3-" + sofaC, () => sofa(sofaC, 3), -4.5, -3.2, Math.PI / 2, 2.6, 1.1);
      put("sofa3b-" + sofaC, () => sofa(sofaC, 3), 4.5, -3.2, -Math.PI / 2, 2.6, 1.1);
      put("coffee-table", coffeeTable, -3, -3.2, 0, 1.1, 0.7);
      put("coffee-table", coffeeTable, 3, -3.2, 0, 1.1, 0.7);
      for (const [x, z] of [
        [-6, -1.2],
        [6, -1.2],
        [-6, -11.5],
        [6, -11.5],
      ])
        put("monstera-" + ((x + z) & 3), () => plant("monstera", (x + z) & 3), x, z, 0, 0.8, 0.8);
      put("floor-lamp", floorLamp, -5.8, -5, 0, 0.4, 0.4);
      put("floor-lamp", floorLamp, 5.8, -5, 0, 0.4, 0.4);
      place(fit, "rug-office", () => rug(4, 3, "#3a3d46", "#f4b728"), 0, 0.01, -3.2, 0);
    } else if (v.kind === "home") {
      // the mailboxes, a bench, the stairs up (blocked off), bikes, plants
      const mbM = mat("#9aa0aa", 0.35, 0.8);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 3; j++) {
          const b = box(fit, 0.5, 0.32, 0.36, mbM, -W + 0.3, 0.9 + j * 0.36, -2.4 - i * 0.55);
          b.name = "mailbox";
        }
      solid(-W, -4.8, -W + 0.6, -2);
      put("armchair-a", () => armchair("#6a5a48"), 5.6, -3, -Math.PI / 2, 0.9, 0.9);
      put("bookshelf-" + (v.seed % 4), () => bookshelf(v.seed % 4, 12), 6.6, -6.5, -Math.PI / 2, 1.1, 0.5);
      put("ficus-" + (v.seed % 3), () => plant("ficus", v.seed % 3), 6.2, -1.2, 0, 0.7, 0.7);
      // stairs up the back, gated
      const stM = mat("#6e5440", 0.8);
      for (let k = 0; k < 8; k++) {
        const st = box(shell, 3, 0.18 * (k + 1), 0.3, stM, -3.5, 0, -D + 0.4 + k * 0.3);
        st.name = "stair";
      }
      solid(-5, -D, -2, -D + 2.8);
      place(fit, "rug-home", () => rug(2, 5, "#7a3a2f", "#e8d8b0"), 1, 0.01, -6, 0);
      // a bench by the mailboxes, a lamp on a little table, wall lights, a second plant
      put("bench", bench, -W + 1.1, -6.8, Math.PI / 2, 1.4, 0.5);
      put("nightstand", nightstand, 6.4, -9.2, -Math.PI / 2, 0.5, 0.45);
      put("monstera-h" + (v.seed & 3), () => plant("monstera", v.seed & 3), -W + 0.8, -D + 3.6, 0, 0.8, 0.8);
      for (const z of [-3.5, -8.5]) {
        place(shell, "sconce", () => sconce(), W - 0.21, 2.2, z, -Math.PI / 2);
        place(shell, "sconce", () => sconce(), -W + 0.21, 2.2, z, Math.PI / 2);
      }
    } else {
      // a café or a bar: the counter along the back, tables and chairs, pendants over them
      const bar = v.kind === "bar";
      place(fit, "bar-counter-" + (bar ? "r" : "w") + Math.round(W * 2 - 3), () => barCounter(W * 2 - 3, bar ? "#ff3e8a" : "#f4b728"), 0, 0, -D + 2.2, 0);
      solid(-W + 1.5, -D + 1.7, W - 1.5, -D + 2.7);
      // the back bar: a cabinet, mirrored shelves of bottles (replaces the plain shelves and the
      // bottle blocks below in the realistic pass)
      place(fit, "back-bar-" + Math.round(W * 2 - 2), () => backBar(W * 2 - 2), 0, 0, -D + 0.25, 0);
      for (let x = -W + 2.5; x < W - 2; x += 1.3) put("stool-" + (bar ? "r" : "b"), () => stool(bar ? "#c2304a" : "#2f4a3e"), x, -D + 3.2, 0, 0.4, 0.4);
      // bottles on the back wall (glowing in a bar)
      for (let k = 0; k < 0; k++) {
        const bm = bar ? glowMat(pick(goods), 0.9) : mat(pick(goods), 0.3);
        own.push(bm);
        const b = box(fit, 0.1, 0.32, 0.1, bm, -W + 1.2 + r() * (W * 2 - 2.4), r() < 0.5 ? 1.66 : 2.26, -D + 0.25);
        b.name = "bottle";
      }
      if (!bar) place(fit, "coffee-machine", coffeeMachine, 3, 1.1, -D + 2.2, 0);
      for (const [x, z] of [
        [-4, -4],
        [0, -5.5],
        [4, -4],
        [-4, -8],
        [4, -8],
      ]) {
        put("dining-4", () => diningTable(4), x, z, 0, 1.4, 1.4);
        for (const [dx, dz, rot] of [
          [0, 1, Math.PI],
          [0, -1, 0],
        ] as const)
          place(fit, "chair-" + (bar ? "r" : "w"), () => chair(bar ? "#3a2630" : "#7a5236"), x + dx * 0, 0, z + dz * 0.95, rot);
        place(fit, "pendant-" + (bar ? "r" : "w"), () => pendant(0.9, bar ? "#ff8a6a" : "#ffe2b0"), x, H - 1.1, z, 0);
      }
      if (bar) {
        const neon = textPlane(pick(["OPEN LATE", "SHIELDED ONLY", "NO KYC", "HAPPY BLOCK"]), { h: 0.4, color: "#3ef0ff", glow: true, font: '800 96px Archivo, "Roboto", sans-serif' });
        neon.position.set(-W + 0.12, 2.4, -6);
        neon.rotation.y = Math.PI / 2;
        neon.name = "wall-neon";
        shell.add(neon);
        own.push(neon.geometry, neon.material as THREE.Material, (neon.material as THREE.MeshBasicMaterial).map!);
      } else put("fridge", fridge, W - 0.6, -D + 1.2, -Math.PI / 2, 0.8, 0.8);
    }
    // the walls round the door are walls: the lifts, stairs, signs and windows don't break
    shell.userData.noBreak = true;
    scene.updateMatrixWorld(true);
  };
  next = { ...next };
  dress();
  dressNow = dress;
  void wall;

  return {
    key: "building",
    get title() {
      return title;
    },
    scene,
    floors: [{ label: "G", name: "Ground floor", y: 0, spawn: new THREE.Vector3(0, 0, -1.6), yaw: 0 }],
    colliders: () => rects,
    pickables: () => [],
    pick: () => null,
    update: (dt: number, t: number, camera: THREE.Camera) => {
      if (!people.length) return;
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of people) s.update(dt, t, camQuat, camRight);
    },
    setTheme: () => dress(),
  } as Interior;
}
