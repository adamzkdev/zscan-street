import * as THREE from "three";
import { box, glowMat, makeScene, room, std, textPlane, wall } from "./kit";
import { armchair, bookshelf, chair, coffeeMachine, coffeeTable, desk, diningTable, floorLamp, fridge, pendant, place, plant, rug, sofa, stool } from "./furniture";
import type { Interior, InteriorContext, Rect } from "./types";

/**
 * Any building of the city, walked into from the game (src/gta): one place whose ground floor is
 * dressed again on every visit after the building you came through — a convenience store for a
 * shop, an office lobby, an apartment block's hall, a café or a bar — its colours and layout drawn
 * from the building's own seed, its name over the counter. Every piece of furniture is its own
 * thing: it stops you, and it breaks when you hit it (src/gta/breakables.ts).
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

const W = 7;
const D = 13;

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
    const P = palettes[v.kind];
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const H = v.kind === "office" ? 4.4 : 3.5;
    const floorM = mat(pick(P.floor), v.kind === "office" ? 0.2 : 0.6, 0.05);
    const wallM = mat(pick(P.wall), 0.85);
    rects.push(...room(shell, { x0: -W, z0: -D, x1: W, z1: 0, h: H, floor: floorM, wall: wallM, ceiling: mat(P.ceil, 0.9), door: [-1.3, 1.3] }));
    // the shop front: glass either side of the door, the street's light through it
    const glassM = new THREE.MeshBasicMaterial({ color: ctx.theme === "night" ? "#1c2a44" : "#cfe4f2", toneMapped: false });
    own.push(glassM);
    for (const sx of [-1, 1]) {
      const g = box(shell, W - 2.2, H - 1.4, 0.06, glassM, sx * (W / 2 + 0.9), 0.6, -0.12);
      g.name = "window";
    }
    for (const l of lights) {
      l.color.set(P.light);
      l.intensity = v.kind === "shop" ? 6 : v.kind === "bar" ? 9 : 11;
    }
    // the ceiling's light panels
    const panel = glowMat(P.light, v.kind === "bar" ? 0.8 : v.kind === "shop" ? 1.2 : 1.6);
    own.push(panel);
    for (let z = -2; z > -D + 1; z -= 3.5)
      for (const x of [-3, 3]) {
        const p = box(shell, 1.6, 0.04, 0.6, panel, x, H - 0.05, z);
        p.name = "ceiling-light";
      }
    // the name over the back wall
    const sign = textPlane(title, { h: v.kind === "office" ? 0.55 : 0.48, color: v.kind === "bar" ? "#ff5aa8" : "#f4b728", glow: v.kind === "bar" || v.kind === "cafe", font: '800 96px Archivo, "Roboto", sans-serif' });
    sign.position.set(0, H - 0.9, -D + 0.12);
    sign.name = "wall-sign";
    shell.add(sign);
    own.push(sign.geometry, sign.material as THREE.Material, (sign.material as THREE.MeshBasicMaterial).map!);
    const solid = (x0: number, z0: number, x1: number, z1: number) => rects.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
    const put = (key: string, build: Parameters<typeof place>[2], x: number, z: number, rot: number, w: number, d: number) => {
      place(fit, key, build, x, 0, z, rot);
      const sw = Math.abs(Math.sin(rot)) > 0.5;
      solid(x - (sw ? d : w) / 2, z - (sw ? w : d) / 2, x + (sw ? d : w) / 2, z + (sw ? w : d) / 2);
    };
    const goods = ["#e8463a", "#f4b728", "#3fa8ff", "#43d17a", "#ff8a1f", "#b07bff", "#f2f0ea", "#ff5aa8"];
    if (v.kind === "shop") {
      // aisles of shelves with goods, the fridges along the left wall, the counter by the door
      const shelfM = mat("#d8dce2", 0.4, 0.4);
      for (const x of [-3.6, 0, 3.6]) {
        if (x === 0 && r() < 0.3) continue;
        const z0 = -4.2,
          len = 6.4;
        box(fit, 0.9, 1.6, len, shelfM, x, 0, z0 - len / 2);
        solid(x - 0.5, z0 - len, x + 0.5, z0);
        for (let k = 0; k < 18; k++) {
          const gm = mat(pick(goods), 0.6);
          const g = box(fit, 0.22 + r() * 0.12, 0.26 + r() * 0.12, 0.2, gm, x + (r() < 0.5 ? -0.5 : 0.5), 0.3 + Math.floor(r() * 3) * 0.48, z0 - 0.3 - r() * (len - 0.6));
          g.name = "goods";
        }
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
      const counterM = mat("#2a2c33", 0.4, 0.2);
      box(fit, 3.2, 1.05, 0.8, counterM, W - 2.4, 0, -2.2);
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
    } else {
      // a café or a bar: the counter along the back, tables and chairs, pendants over them
      const bar = v.kind === "bar";
      const counterM = mat(bar ? "#1a1418" : "#5c4030", 0.35, 0.1);
      box(fit, W * 2 - 3, 1.1, 0.8, counterM, 0, 0, -D + 2.2);
      solid(-W + 1.5, -D + 1.7, W - 1.5, -D + 2.7);
      for (let x = -W + 2.5; x < W - 2; x += 1.3) put("stool-" + (bar ? "r" : "b"), () => stool(bar ? "#c2304a" : "#2f4a3e"), x, -D + 3.2, 0, 0.4, 0.4);
      // bottles on the back wall (glowing in a bar)
      const shelfM = mat("#2a2024", 0.5);
      box(shell, W * 2 - 2, 0.06, 0.3, shelfM, 0, 1.6, -D + 0.2);
      box(shell, W * 2 - 2, 0.06, 0.3, shelfM, 0, 2.2, -D + 0.2);
      for (let k = 0; k < 26; k++) {
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
    update: () => {},
    setTheme: () => dress(),
  } as Interior;
}
