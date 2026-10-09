import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Theme } from "../../scene/theme";
import { makeScene } from "../kit";
import type { Interior, InteriorContext, PickInfo } from "../types";
import { buildBowl } from "./bowl";
import { ArenaCrowd } from "./crowd";
import { AX, AZ, CAVEA_STAIR, canvasTex, HYPO, HYPO_STAIR, POD } from "./geo";
import { buildHypogeum } from "./hypogeum";
import { buildShow } from "./show";

/**
 * THE COLOSSEUM. Floor 0: the arena, on the sand, where the Proof Games run live (a bout per
 * block, Shielded against Transparent). Floor 1: the hypogeum underneath, its lifts, cages and
 * armoury. Floor 2: the podium terrace round the arena, with the emperor's box. The sky over the
 * bowl is the real city's, seen from the place.
 */
export function buildColosseum(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#9ec8f0");
  const bowl = buildBowl();
  const show = buildShow(ctx);
  const hypo = buildHypogeum();
  scene.add(bowl.group, show.group, hypo.group);
  // the cavea shouts: lines over the zkSNARK crowd, bursts at every blow and verdict
  const crowd = new ArenaCrowd(bowl.fans, bowl.group);
  // …and the soundscape hears them (src/audio.ts: fanfare, clash, cheer)
  const cue = (type: string, detail: object = {}) => window.dispatchEvent(new CustomEvent("zstreet:colosseum", { detail: { type, ...detail } }));
  show.on.rise = (h) => (crowd.rise(h), cue("rise"));
  show.on.hit = () => (crowd.hit(), cue("hit"));
  show.on.result = (r) => (crowd.result(r), cue("result", { winner: r.winner }));

  const hemi = scene.children.find((o) => o instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
  const sun = new THREE.DirectionalLight("#fff1d8", 2.4);
  sun.position.set(-30, 50, 24);
  scene.add(sun);
  const arenaLights: THREE.PointLight[] = [];
  for (const [x, z] of [
    [-6, -9],
    [6, -9],
    [-6, 9],
    [6, 9],
    [-9, 0],
    [9, 0],
  ]) {
    const l = new THREE.PointLight("#ffb060", 0, 30, 1.4);
    l.position.set(x, 7, z);
    bowl.group.add(l);
    arenaLights.push(l);
  }

  // ---- ways between floors: two stairs, walked (liftplan: colosseum) --------------------------------
  const extraPicks = new Map<THREE.Object3D, { info: PickInfo; hover: string; floor: number }>();
  const ironMat = new THREE.MeshStandardMaterial({ color: "#2a2830", roughness: 0.5, metalness: 0.7 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: "#d9cfb6", roughness: 0.85 });
  const stoneD = new THREE.MeshStandardMaterial({ color: "#b5a787", roughness: 0.9 });
  /** An iron railing from (x0, z0) to (x1, z1) standing at height y: posts and a top rail. */
  const railing = (into: THREE.BufferGeometry[], x0: number, z0: number, x1: number, z1: number, y: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = -Math.atan2(z1 - z0, x1 - x0);
    into.push(new THREE.BoxGeometry(len + 0.06, 0.06, 0.06).rotateY(ry).translate((x0 + x1) / 2, y + 0.95, (z0 + z1) / 2));
    into.push(new THREE.BoxGeometry(len, 0.04, 0.04).rotateY(ry).translate((x0 + x1) / 2, y + 0.5, (z0 + z1) / 2));
    const n = Math.max(1, Math.round(len / 0.9));
    for (let i = 0; i <= n; i++) into.push(new THREE.BoxGeometry(0.06, 0.95, 0.06).translate(x0 + ((x1 - x0) * i) / n, y + 0.475, z0 + ((z1 - z0) * i) / n));
  };
  const sign = (text: string, w: number) =>
    new THREE.Mesh(
      new THREE.PlaneGeometry(w, w / 4),
      new THREE.MeshBasicMaterial({
        map: canvasTex(256, 64, (g) => {
          g.fillStyle = "#2a1e14";
          g.fillRect(0, 0, 256, 64);
          g.fillStyle = "#e6d6a8";
          g.font = '700 30px "JetBrains Mono", monospace';
          g.textAlign = "center";
          g.fillText(text, 128, 43);
        }).t,
      }),
    );
  // the cavea stair: an arched doorway in the podium wall on the east side, the flight inside the
  // podium climbing north in a slot open to the sky, iron railings round the slot on the terrace
  {
    const S = CAVEA_STAIR;
    const rise = POD / S.steps,
      run = (S.z1 - S.z0) / S.steps;
    const steps: THREE.BufferGeometry[] = [],
      noses: THREE.BufferGeometry[] = [],
      iron: THREE.BufferGeometry[] = [];
    for (let i = 0; i < S.steps; i++) {
      const top = (i + 1) * rise;
      const z = S.z1 - (i + 0.5) * run;
      steps.push(new THREE.BoxGeometry(S.x1 - S.x0, top, run + 0.002).translate((S.x0 + S.x1) / 2, top / 2, z));
      noses.push(new THREE.BoxGeometry(S.x1 - S.x0, 0.04, 0.05).translate((S.x0 + S.x1) / 2, top - 0.02, z - run / 2 + 0.025));
    }
    // a handrail on each wall of the slot, along the pitch
    const len = Math.hypot(S.z1 - S.z0, POD);
    const slope = Math.atan2(POD, S.z1 - S.z0);
    for (const x of [S.x0 + 0.05, S.x1 - 0.05]) iron.push(new THREE.CylinderGeometry(0.03, 0.03, len - 0.4, 6).rotateX(Math.PI / 2 + slope).translate(x, POD / 2 + 0.9, (S.z0 + S.z1) / 2));
    // round the slot on the terrace: both sides (open at the head, north), across its foot
    railing(iron, S.x0 - 0.03, S.z0 + 0.45, S.x0 - 0.03, S.z1 + 0.03, POD);
    railing(iron, S.x1 + 0.03, S.z0 + 0.45, S.x1 + 0.03, S.z1 + 0.03, POD);
    railing(iron, S.x0 - 0.03, S.z1 + 0.03, S.x1 + 0.03, S.z1 + 0.03, POD);
    const flight = new THREE.Mesh(mergeGeometries(steps), stoneMat);
    bowl.group.add(flight, new THREE.Mesh(mergeGeometries(noses), stoneD));
    const rail = new THREE.Mesh(mergeGeometries(iron), ironMat);
    bowl.group.add(rail);
    // "▲ CAVEA" over the doorway, on the podium's face
    const [d0, d1] = S.door;
    const zc = (d0 + d1) / 2;
    const s = sign("▲ CAVEA", 0.9);
    s.position.set(AX * Math.sqrt(1 - (zc / AZ) ** 2) - 0.03, 3.05, zc);
    s.rotation.y = -Math.PI / 2;
    bowl.group.add(s);
    extraPicks.set(s, { info: { eyebrow: "Stairs", title: "▲ Cavea · the senators' terrace", stats: [["Steps", `${S.steps}`], ["Rise", `${POD} m`]] }, hover: "<b>Stairs ▲ Cavea</b><span>through the doorway, up to the podium terrace</span>", floor: 0 });
    extraPicks.set(rail, { info: { eyebrow: "Stairs", title: "▼ Arena" }, hover: "<b>Stairs ▼ Arena</b><span>down to the sand</span>", floor: 2 });
  }
  // the hypogeum stair's slot in the sand by the gate: a low stone parapet round it, open at its head
  // (north); seen from afar it is a dark well, close by the hypogeum shows down it
  const H = HYPO_STAIR;
  const wellCap = new THREE.Mesh(new THREE.BoxGeometry(H.x1 - H.x0, 1.2, H.z1 - H.z0), new THREE.MeshBasicMaterial({ color: "#0c0a08", side: THREE.BackSide }));
  wellCap.position.set((H.x0 + H.x1) / 2, -0.6, (H.z0 + H.z1) / 2);
  wellCap.raycast = () => {};
  bowl.group.add(wellCap);
  {
    const wall: THREE.BufferGeometry[] = [],
      cope: THREE.BufferGeometry[] = [];
    const run = (x0: number, z0: number, x1: number, z1: number) => {
      wall.push(new THREE.BoxGeometry(x1 - x0, 0.85, z1 - z0).translate((x0 + x1) / 2, 0.425, (z0 + z1) / 2));
      cope.push(new THREE.BoxGeometry(x1 - x0 + 0.06, 0.1, z1 - z0 + 0.06).translate((x0 + x1) / 2, 0.9, (z0 + z1) / 2));
    };
    run(H.x0 - 0.14, H.z0 + 0.45, H.x0, H.z1 + 0.14);
    run(H.x1, H.z0 + 0.45, H.x1 + 0.14, H.z1 + 0.14);
    run(H.x0, H.z1, H.x1, H.z1 + 0.14);
    const parapet = new THREE.Mesh(mergeGeometries(wall), stoneD);
    bowl.group.add(parapet, new THREE.Mesh(mergeGeometries(cope), stoneMat));
    const s = sign("▼ HYPOGEUM", 0.9);
    s.position.set(H.x1 + 0.15, 0.55, H.z0 + 1.2);
    s.rotation.y = Math.PI / 2;
    bowl.group.add(s);
    for (const o of [parapet, s]) extraPicks.set(o, { info: { eyebrow: "Stairs", title: "▼ Hypogeum", stats: [["Steps", "24"], ["Down", "6 m"]] }, hover: "<b>Stairs ▼ Hypogeum</b><span>the lifts, the cages, the armoury</span>", floor: 0 });
  }

  // ---- floors -------------------------------------------------------------------------------------
  let current = 0;
  let theme: Theme = ctx.theme;
  const sky = () => {
    if (current === 1) return void (scene.background = new THREE.Color("#07050a"));
    const view = ctx.cityView("colosseum", 18, 30);
    scene.background = view ?? new THREE.Color(theme === "night" ? "#0b0a1a" : "#9ec8f0");
  };
  const setTheme = (t: Theme) => {
    theme = t;
    const night = t === "night";
    sun.color.set(night ? "#8fa6d8" : "#fff1d8");
    sun.intensity = current === 1 ? 0 : night ? 0.45 : 2.4;
    for (const l of arenaLights) l.intensity = night ? 34 : 0;
    bowl.fans.uniforms.uBright.value = night ? 0.6 : 1.1;
    scene.environmentIntensity = current === 1 ? 0.06 : night ? 0.18 : 0.35;
    hemi.intensity = current === 1 ? 0.22 : night ? 0.5 : 0.9;
    sky();
  };
  // the floor you are on is drawn; near the hypogeum stair's slot, the one above or below it too
  // (with its own lights off: the light count, and so the shaders, stay the same)
  let nearWell = false;
  const showFloors = () => {
    bowl.group.visible = current !== 1 || nearWell;
    hypo.group.visible = current === 1 || nearWell;
    wellCap.visible = !hypo.group.visible;
    for (const l of hypo.lights) l.visible = current === 1;
    for (const l of arenaLights) l.visible = current !== 1;
  };
  const setFloor = (f: number) => {
    current = f;
    showFloors();
    show.below = f === 1;
    setTheme(theme);
  };
  setFloor(0);

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const flick = (fl: THREE.Object3D[], t: number) => {
    for (const f of fl) {
      const ph = f.userData.ph as number;
      const k = 0.85 + 0.15 * Math.sin(t * 11 + ph) + 0.08 * Math.sin(t * 23 + ph * 2);
      f.scale.set(1, k, 1);
    }
  };
  const lookup = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) {
      const e = extraPicks.get(x);
      if (e) return e;
    }
    return null;
  };

  return {
    key: "colosseum",
    title: "COLOSSEUM",
    scene,
    floors: [
      { label: "G", name: "Arena · the Proof Games", y: 0, spawn: new THREE.Vector3(0, 0, AZ + 0.9), yaw: 0 },
      { label: "−1", name: "Hypogeum · lifts, cages, armoury", y: HYPO, spawn: new THREE.Vector3(0, HYPO, 14), yaw: 0 },
      { label: "1", name: "Podium · emperor's box", y: POD, spawn: new THREE.Vector3(0.6, POD, AZ + 1.7), yaw: 0 },
    ],
    colliders: (f) => (f === 0 ? bowl.arenaRects : f === 1 ? hypo.rects : bowl.terraceRects),
    setFloor,
    setTheme,
    pickables: () => {
      const extra = [...extraPicks.entries()].filter(([, e]) => e.floor === current).map(([o]) => o);
      return current === 1 ? hypo.pickables : [...show.pickables, ...extra];
    },
    pick: (hit) => {
      const e = lookup(hit.object);
      if (e) return e.info;
      return current === 1 ? hypo.pick(hit.object) : show.pick(hit.object);
    },
    hover: (hit) => {
      const e = lookup(hit.object);
      if (e) return e.hover;
      return current === 1 ? hypo.hover(hit.object) : show.hover(hit.object);
    },
    update(dt, t, camera) {
      const p = camera.position;
      const near = Math.hypot(p.x - THREE.MathUtils.clamp(p.x, H.x0, H.x1), p.z - THREE.MathUtils.clamp(p.z, H.z0, H.z1)) < 12;
      if (near !== nearWell) {
        nearWell = near;
        showFloors();
      }
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      show.update(
        dt,
        t,
        camQuat,
        camRight,
        (v) => crowd.setCheer(v),
        () => crowd.wave(),
      );
      crowd.tick(dt, t, current === 1 ? null : camera);
      if (current === 1) {
        hypo.update(dt, t, show.lift, show.hatch);
        for (const s of hypo.people) s.update(dt, t, camQuat, camRight);
        flick(hypo.flames, t);
      } else flick(bowl.flames, t);
    },
  };
}
