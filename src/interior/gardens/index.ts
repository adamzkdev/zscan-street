import * as THREE from "three";
import { makeScene } from "../kit";
import type { Interior, InteriorContext } from "../types";
import { cloud, MTN } from "./cloud";
import { Flora } from "./flora";
import { flower } from "./flower";
import { grove, TREES } from "./grove";
import { F, GardensKit, LEVELS, type Line } from "./kit";
import { buildCrowns, LightShow } from "./supertree";

/**
 * GARDENS BY THE BAY, next to the Marina ZEC Hotel: the Supertree Grove (walk among the giant
 * Supertrees, lie on the lawn for Garden Rhapsody, the light show that plays on every new block),
 * the OCBC Skyway 22 m up between them, the Cloud Forest (the 35 m waterfall off a mountain of
 * plants, the mist, the Cloud Walk round it at 18 m) and the Flower Dome (tulips round a windmill,
 * ancient olives, baobabs, succulents). Only the zone you are in is drawn, lit and animated.
 */
export function buildGardens(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0a0c12");
  let hemi: THREE.HemisphereLight | null = null;
  scene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight) hemi = o;
  });
  const k = new GardensKit(ctx, scene);
  const flora = new Flora();
  const show = new LightShow();
  grove(k, flora, show);
  const cf = cloud(k, flora);
  flower(k, flora);
  cast(k, show, cf.poolC);
  k.flush();
  flora.build(k.groups);
  show.build(k.groups[0]);
  buildCrowns(k.groups[0]);
  k.padLights();
  ctx.onBlock(() => show.start());

  let current = 0;
  let takenAt = 0,
    stale = false;
  const FOG: Record<number, [string, string, number, number]> = {
    0: ["#c8d6de", "#0a0e1a", 120, 520],
    1: ["#d8e2e6", "#1a2430", 6, 95],
    2: ["#e8e4dc", "#141826", 70, 260],
  };
  const view = (n: number) => {
    const bg = ctx.cityView("gardens", LEVELS[n].view, LEVELS[n].back);
    scene.background = bg ?? new THREE.Color(k.night ? "#0a0c18" : "#9ac0d8");
    takenAt = performance.now();
    stale = takenAt < 45_000;
    const [day, night, near, far] = FOG[LEVELS[n].zone];
    scene.fog = new THREE.Fog(k.night ? night : day, near, far);
  };
  const theme = (t: string) => {
    const n = t === "night";
    k.setNight(n);
    const h = hemi as THREE.HemisphereLight | null;
    if (h) {
      h.color.set(n ? "#4a5a9a" : "#e8f2ff");
      h.groundColor.set(n ? "#100c18" : "#4a5a3a");
      h.intensity = n ? 0.45 : 1.25;
    }
    scene.environmentIntensity = n ? 0.15 : 0.4;
  };
  theme(ctx.theme);
  const setFloor = (n: number) => {
    current = n;
    k.groups.forEach((g, i) => (g.visible = i === LEVELS[n].zone));
    k.enter(n);
    view(n);
  };
  setFloor(0);

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) if (k.picks.has(x)) return x;
    return null;
  };
  return {
    key: "gardens",
    title: "GARDENS BY THE BAY",
    scene,
    floors: LEVELS.map((l) => ({ label: l.label, name: l.name, y: l.y, spawn: new THREE.Vector3(l.spawn[0], l.y, l.spawn[1]), yaw: l.yaw })),
    colliders: (f) => k.rects[f],
    setFloor,
    setTheme: (t) => {
      theme(t);
      view(current);
      stale = true;
    },
    groundAt: (f, x, z) => {
      for (const fn of k.grounds[f]) {
        const y = fn(x, z);
        if (y != null) return y;
      }
      return null;
    },
    pickables: () => k.pickables.filter((o) => k.zoneOfPick.get(o) === k.zone),
    pick: (hit) => {
      const o = find(hit.object);
      return o ? (k.picks.get(o)!() ?? null) : null;
    },
    hover: (hit) => {
      const o = find(hit.object);
      return o ? (k.hovers.get(o) ?? null) : null;
    },
    update(dt, t, camera) {
      camera.getWorldPosition(k.eye);
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      LEVELS.forEach((l, f) => {
        if (l.zone === k.zone) for (const s of k.people[f]) s.update(dt, t, camQuat, camRight);
      });
      for (const tick of k.ticks[k.zone]) tick(dt, t);
      Flora.tick(t);
      if (k.zone === 0) show.update(dt, t, ctx.renderer.domElement.height);
      if (stale && performance.now() - takenAt > 61_000) view(current);
    },
  };
}

/** The people: guides, gardeners, visitors on the lawn, on the Skyway, in the domes. */
function cast(k: GardensKit, show: LightShow, poolC: THREE.Vector3) {
  const h = () => (k.height ? k.height.toLocaleString("en-US") : "…");
  const price = () => (k.price ? `ZEC is $${k.price.toFixed(2)} today. The orchids don't care.` : "ZEC price? Ask the orchids.");
  const watchers: Promise<import("../../scene/snark").Snark | null>[] = [];

  // ---- the Grove ----
  k.onCast(F.grove, () => {
    void k.person(F.grove, 2718, [3.2, -3], "Garden guide", {
      face: [-0.6, 1],
      cap: true,
      lines: ["Welcome to the Supertree Grove!", "The Supertrees are 25 to 50 metres tall.", "Garden Rhapsody plays on every new block. Look up!", "The Skyway lift is in the first tree, on the left.", () => `Block ${h()}. The trees are waiting for the next one.`, "Cloud Forest and Flower Dome: through the pavilions at the back."],
    });
    void k.person(F.grove, 808, [-6, -46], "Gardener", { face: [1, -0.4], lines: ["Over 160,000 plants live on these trees.", "Ferns, bromeliads, orchids. I water them all.", "The trees collect rainwater, like real ones."] });
    void k.person(F.grove, 3141, [20, -40], "Photographer", { face: [-0.4, -1], lines: ["Long exposure, no geotag.", "My photos are shielded too.", "Wait for the show. The colours are wild."] });
    void k.person(F.grove, 6502, [0, -8], "Visitor", { wander: [[0, -8], [0, -38], [0, -20], [-1.5, -30]], lines: ["These trees are huge!", "Is that a hotel or a ship on the roof?", "I came for the trees, I stay for the lights."] });
    void k.person(F.grove, 9876, [-18, -64], "Visitor", { wander: [[-18, -64], [-14, -74], [-16, -50], [-12, -60]], lines: ["Every tree has its own colour at night.", "The tallest one is fifty metres. That one, at the back."] });
    void k.person(F.grove, 4321, [30, -82], "Tourist", { wander: [[30, -82], [38, -70], [26, -96]], lines: ["Wow. Just wow.", "I need a picture with every tree."] });
    // a couple on a bench by the promenade
    const a = k.person(F.grove, 1111, [-4.6, -13.3], "Visitor", { sit: true, face: [1, 0] });
    const b = k.person(F.grove, 2222, [-4.6, -12.3], "Visitor", { sit: true, face: [1, 0] });
    k.dialog(F.grove, [a, b], [
      [0, "Did you see that? A new block."],
      [1, "Then the trees are about to dance."],
      [0, "Every single block?"],
      [1, "Every block. Shielded or not."],
    ]);
    // on the lawn, lying back for the show
    const lawnIds = [5050, 7070, 3030, 6161, 8282, 1212, 4747, 9393];
    lawnIds.forEach((id, i) => {
      const ang = (i / lawnIds.length) * Math.PI * 2 + 0.3;
      const d = 6 + (i % 3) * 3;
      watchers.push(
        k.person(F.grove, id, [Math.sin(ang) * d, -62 + Math.cos(ang) * d], "On the lawn", {
          sit: true,
          face: [-Math.sin(ang), -Math.cos(ang)],
          near: 9,
          every: [14, 26],
          lines: ["Best seat in town: the grass.", "Lie back, the show is above you.", "Shh, it starts on the next block.", () => `Block ${h()}! Here we go.`, price],
        }),
      );
    });
    const pc = k.person(F.grove, 4040, [-3, -76], "Visitor", { sit: true, face: [0.4, 1] });
    const pd = k.person(F.grove, 5151, [-1.6, -76.6], "Visitor", { sit: true, face: [-0.4, 1] });
    k.dialog(F.grove, [pc, pd], [
      [0, "Skyway first, or the domes?"],
      [1, "Skyway at sunset. Domes after dark."],
      [0, "And the Cloud Forest?"],
      [1, "Bring a jacket. It's a mountain in there."],
    ]);
    // zkSNARK busts on the lawn: the crowd for the show
    const at: [number, number, number, number, number][] = [];
    const rnd = (i: number, j: number) => k.rnd(i, j, 77);
    for (let i = 0; i < 90; i++) {
      const ang = rnd(i, 1) * Math.PI * 2,
        d = 3 + Math.sqrt(rnd(i, 2)) * 10.5;
      at.push([Math.sin(ang) * d, 0, -62 + Math.cos(ang) * d, 1 + Math.floor(rnd(i, 3) * 9999), 0.75 + rnd(i, 4) * 0.25]);
    }
    k.crowd(F.grove, at);
  });
  show.onStart = () => {
    void Promise.all(watchers).then((ss) => {
      const s = ss.filter((x) => x)[Math.floor(Math.random() * ss.length)] ?? ss.find((x) => x);
      s?.say("Garden Rhapsody! Look up!", 3.6, "shout");
    });
  };

  // ---- the Skyway ----
  k.onCast(F.skyway, () => {
    const along = (s: number, u: number, side: number): [number, number] => {
      const A = TREES[s],
        B = TREES[s + 1];
      const dx = B.x - A.x,
        dz = B.z - A.z;
      const L = Math.hypot(dx, dz);
      return [A.x + dx * u - (dz / L) * side * 0.55, A.z + dz * u + (dx / L) * side * 0.55];
    };
    const out = (s: number, side: number): [number, number] => {
      const A = TREES[s],
        B = TREES[s + 1];
      const L = Math.hypot(B.x - A.x, B.z - A.z);
      return [(-(B.z - A.z) / L) * side, ((B.x - A.x) / L) * side];
    };
    void k.person(F.skyway, 3333, along(0, 0.45, 1), "Visitor", { face: out(0, 1), lines: ["Twenty-two metres. Don't look down.", "OK, look down. Wow.", "The hotel looks like a ship on three towers."] });
    void k.person(F.skyway, 4444, along(1, 0.3, -1), "Visitor", { wander: [along(1, 0.25, -0.2), along(1, 0.75, -0.2)], lines: ["128 metres of walkway, end to end.", "From up here the lawn crowd looks like pixels."] });
    void k.person(F.skyway, 5555, along(2, 0.6, -1), "Skyway guide", { face: out(2, -1), cap: true, lines: ["Hold the rail, enjoy the view.", "The crowns are lit from inside at night.", () => `Block ${h()}. Showtime is on the next one.`] });
    const sa = k.person(F.skyway, 6666, along(1, 0.62, 1), "Visitor", { face: out(1, 1) });
    const sb = k.person(F.skyway, 7777, along(1, 0.66, 1), "Visitor", { face: out(1, 1) });
    k.dialog(F.skyway, [sa, sb], [
      [0, "Is the bridge moving?"],
      [1, "Just the wind. Hold the rail."],
      [0, "I'm holding my seed phrase tighter."],
    ]);
  });

  // ---- the Cloud Forest ----
  k.onCast(F.cloud, () => {
    void k.person(F.cloud, 1618, [poolC.x - 7.5, poolC.z + 8.5], "Cloud Forest guide", {
      face: [0.5, -1],
      cap: true,
      lines: ["The waterfall is 35 metres tall.", "Cool and misty, like a mountain 2,000 m up.", "The misting comes on with every block.", "Take the lift in the mountain to the Cloud Walk."],
    });
    void k.person(F.cloud, 2020, [MTN.x - 24, MTN.z + 10], "Botanist", { face: [1, 0], lines: ["Pitcher plants eat insects. Not addresses.", "Those orchids only grow in the clouds.", "Ferns were here before the dinosaurs."] });
    void k.person(F.cloud, 3535, [MTN.x + 22, MTN.z + 14], "Visitor", { wander: [[MTN.x + 22, MTN.z + 14], [MTN.x + 26, MTN.z - 6], [MTN.x + 14, MTN.z + 22]], lines: ["It's raining inside!", "The air smells like a forest after rain."] });
    const ca = k.person(F.cloud, 4646, [poolC.x + 6.5, poolC.z + 8.2], "Visitor", { face: [-0.4, -1] });
    const cb = k.person(F.cloud, 5757, [poolC.x + 7.6, poolC.z + 7.8], "Visitor", { face: [-0.6, -1] });
    k.dialog(F.cloud, [ca, cb], [
      [0, "Is it raining in here?"],
      [1, "That's the misting. Every block."],
      [0, "A cloud you can walk into."],
      [1, "Wait for the Cloud Walk, it goes right past the falls."],
    ]);
  });
  k.onCast(F.walk, () => {
    const at = (a: number): [number, number] => [MTN.x + Math.sin(a) * 18.4, MTN.z + Math.cos(a) * 18.4];
    void k.person(F.walk, 6868, at(0.35), "Visitor", { face: [-0.3, -1], lines: ["The falls sound like applause from here.", "Mist below us, glass above us."] });
    void k.person(F.walk, 7979, at(-0.6), "Visitor", { face: [0.6, -0.8], lines: ["Look at the orchids on the cliff!", "This walk goes all the way round."] });
    void k.person(F.walk, 8080, at(2.6), "Gardener", { face: [-0.5, -0.8], cap: true, lines: ["I abseil down the mountain to prune it.", "Every plant up here was planted by hand."] });
  });

  // ---- the Flower Dome ----
  k.onCast(F.flower, () => {
    const lines: Line[] = ["Tulipmania! Thousands of bulbs from Holland.", "Every bulb is planted by hand.", "The display changes every season."];
    void k.person(F.flower, 1999, [6, -18], "Florist", { face: [-0.3, -1], cap: true, lines });
    void k.person(F.flower, 1000, [-27, -22], "Guide", { face: [-1, -0.3], lines: ["Some of these olives are over a thousand years old.", "They came from Spain, roots and all.", "Lavender under the olives: smell that?"] });
    void k.person(F.flower, 2468, [27, -20], "Visitor", { face: [1, -0.5], lines: ["Baobabs store water in their trunks.", "They look like upside-down trees!"] });
    void k.person(F.flower, 1357, [16, -8], "Visitor", { face: [1, -0.2], lines: ["Don't hug the cactus.", "That agave flowers once in its life."] });
    void k.person(F.flower, 9119, [0, -6], "Visitor", { wander: [[0, -6], [-14, -30], [14, -38], [0, -48]], lines: ["The biggest glass greenhouse in the world!", "Spring all year round in here."] });
    const fa = k.person(F.flower, 3690, [-4, -50.4], "Visitor", { face: [1, 0.3] });
    const fb = k.person(F.flower, 2580, [-2.6, -50.8], "Visitor", { face: [-1, 0.3] });
    k.dialog(F.flower, [fa, fb], [
      [0, "A windmill in Singapore?"],
      [1, "The tulips are Dutch. So is the windmill."],
      [0, "And the ZEC?"],
      [1, price],
    ]);
  });
}
