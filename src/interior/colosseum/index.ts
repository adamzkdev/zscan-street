import * as THREE from "three";
import type { Theme } from "../../scene/theme";
import { makeScene } from "../kit";
import type { Interior, InteriorContext, PickInfo, Rect } from "../types";
import { buildBowl } from "./bowl";
import { ArenaCrowd } from "./crowd";
import { at, AZ, canvasTex, HYPO, POD } from "./geo";
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

  // ---- ways between floors ----------------------------------------------------------------------
  const extraPicks = new Map<THREE.Object3D, { info: PickInfo; hover: string; floor: number }>();
  const doorMat = new THREE.MeshStandardMaterial({ color: "#5a3e28", roughness: 0.85 });
  const ironMat = new THREE.MeshStandardMaterial({ color: "#2a2830", roughness: 0.5, metalness: 0.7 });
  // a door in the podium wall, right of the gate: the stair up to the cavea
  {
    const ph = Math.PI / 2 - 0.42;
    const p = at(ph, -0.03);
    const q = at(ph + 0.01, -0.03);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, 0.08), doorMat);
    door.position.set(p.x, 1.15, p.z);
    door.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
    const sign = canvasTex(256, 64, (g) => {
      g.fillStyle = "#2a1e14";
      g.fillRect(0, 0, 256, 64);
      g.fillStyle = "#e6d6a8";
      g.font = '700 30px "JetBrains Mono", monospace';
      g.textAlign = "center";
      g.fillText("▲ CAVEA", 128, 43);
    });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: sign.t }));
    s.position.set(0, 1.35, 0.05);
    door.add(s);
    for (const dx of [-0.35, 0.35]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.1), ironMat);
      strap.position.x = dx;
      door.add(strap);
    }
    bowl.group.add(door);
    extraPicks.set(door, { info: { eyebrow: "Stairs", title: "▲ Cavea · emperor's box", floor: 2 }, hover: "<b>Stairs ▲ Cavea</b><span>the podium, the emperor's box</span>", floor: 0 });
  }
  // the stairhead on the terrace, back down to the sand
  const stairRect: Rect = [-3.0, AZ + 1.85, -1.4, AZ + 2.95];
  {
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 1.0), new THREE.MeshBasicMaterial({ color: "#0c0a08" }));
    hole.position.y = 0.01;
    g.add(hole);
    for (const [x, z, w, d] of [
      [0, -0.5, 1.6, 0.06],
      [-0.78, 0, 0.06, 1.0],
      [0.78, 0, 0.06, 1.0],
    ]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), ironMat);
      r.position.set(x, 0.95, z);
      g.add(r);
      for (const k of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.06), ironMat);
        post.position.set(x + (w > 1 ? (k * w) / 2 : 0), 0.47, z + (d > 0.5 ? (k * d) / 2 : 0));
        g.add(post);
      }
    }
    g.position.set((stairRect[0] + stairRect[2]) / 2, POD, (stairRect[1] + stairRect[3]) / 2);
    bowl.group.add(g);
    g.traverse((o) => extraPicks.set(o, { info: { eyebrow: "Stairs", title: "▼ Arena", floor: 0 }, hover: "<b>Stairs ▼ Arena</b><span>down to the sand</span>", floor: 2 }));
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
  const setFloor = (f: number) => {
    current = f;
    bowl.group.visible = f !== 1;
    hypo.group.visible = f === 1;
    show.below = f === 1;
    setTheme(theme);
  };
  setFloor(0);

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const terrace = [...bowl.terraceRects, stairRect];
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
    colliders: (f) => (f === 0 ? bowl.arenaRects : f === 1 ? hypo.rects : terrace),
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
