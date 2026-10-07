import * as THREE from "three";
import { makeScene } from "../kit";
import type { Theme } from "../../scene/theme";
import type { Snark } from "../../scene/snark";
import type { Interior, InteriorContext } from "../types";
import { buildAyrton, buildBelfry, buildPrison, bellSound } from "./belfry";
import { buildClock, buildDials } from "./clock";
import { buildHall } from "./hall";
import { BBKit, LEVELS, londonTime, LY, ROOM_H, STEPS, VIEW_BACK, Y0, ZONES, type Zone } from "./kit";
import { buildStair, Climb } from "./stair";

/**
 * BIG BEN: in through Westminster Hall (the hammerbeam roof of 1393, the brass plaques of the great
 * trials), up St Stephen's steps to the foot of the Elizabeth Tower, then the climb: 334 steps
 * winding up the corner well, landings at the Prison Room (118), the Clock Room with the Great
 * Clock running and its pendulum swinging in the pit (262), the four dials with the city through
 * the opal glass and the hands turning on London time (286), the belfry where the Great Bell strikes
 * on every new block (334), and the Ayrton Light (382). The lift buttons jump between landings; the
 * stair is walked for real (the ground follows the helix).
 */
export function buildBigBen(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0d0b0a");
  scene.environmentIntensity = 0.4;
  let hemi: THREE.HemisphereLight | null = null;
  scene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight) hemi = o;
  });
  const k = new BBKit(ctx, scene);
  const blocks = { last: ctx.director.blockHeight ?? null, strikes: 0 } as { last: number | null; strikes: number };

  buildHall(k, blocks);
  buildStair(k);
  const clock = buildClock(k);
  buildDials(k);
  buildPrison(k);
  const bel = buildBelfry(k);
  buildAyrton(k);
  cast(k);
  k.finish();

  // ---- walking: the hall's steps, then the helix --------------------------------------------
  const stepD = (STEPS.z1 - STEPS.z0) / STEPS.n,
    stepH = Y0 / STEPS.n;
  const hallGround = (_x: number, z: number) => {
    if (z > STEPS.z1) return 0;
    if (z > STEPS.z0) return Math.min(STEPS.n, Math.floor((STEPS.z1 - z) / stepD) + 1) * stepH;
    return Y0;
  };
  const climb = new Climb(k, hallGround);
  climb.reset(0);

  // ---- a few real lights, moved to wherever you are -----------------------------------------
  const pool = [0, 1, 2, 3].map(() => {
    const l = new THREE.PointLight("#ffd6a0", 0, 0, 2);
    scene.add(l);
    return l;
  });
  const LIGHTS: Record<Zone, [number, number, number, number][]> = {
    hall: [
      [-3.6, 6.4, -9, 40],
      [3.6, 6.4, -24, 40],
      [0, 5, -37, 30],
      [0, Y0 + 3.6, -56, 22],
    ],
    stair: [],
    prison: [
      [-4.5, LY.prison + 2.8, -58.6, 14],
      [3, LY.prison + 3, -59, 12],
    ],
    clock: [
      [-1, LY.clock + 3.3, -55.2, 12],
      [-2, LY.clock + 3.3, -61, 10],
      [-1, LY.clock - 3, -60.5, 4],
    ],
    dials: [
      [0, LY.dials + 6, -56, 30],
      [-4, LY.dials + 2, -52, 10],
    ],
    belfry: [
      [-1, LY.belfry + 6.5, -57.4, 30],
      [3, LY.belfry + 6, -51, 12],
    ],
    ayrton: [
      [0, LY.ayrton + 2.3, -56, 30],
      [0, LY.ayrton + 6, -56, 10],
    ],
  };
  let lightZone: Zone | null = null;
  const placeLights = (zone: Zone, eyeY: number) => {
    if (zone === "stair") {
      // in the well: two lamps above and below you, following
      pool[0].position.set(5.5, eyeY + 1.6, -50.5);
      pool[0].intensity = 8;
      pool[1].position.set(5.5, eyeY - 2.4, -50.5);
      pool[1].intensity = 5;
      pool[2].intensity = pool[3].intensity = 0;
      lightZone = zone;
      return;
    }
    if (zone === lightZone) return;
    lightZone = zone;
    const list = LIGHTS[zone];
    pool.forEach((l, i) => {
      const s = list[i];
      if (s) {
        l.position.set(s[0], s[1], s[2]);
        l.intensity = s[3] * (k.night ? 1.25 : 1);
      } else l.intensity = 0;
    });
  };

  // ---- what is drawn: the level you are on (and the well) ------------------------------------
  const roomOf = (y: number): Zone[] => {
    const out: Zone[] = ["stair"];
    if (y < Y0 + 4.5) out.push("hall");
    for (const z of ["prison", "clock", "dials", "belfry", "ayrton"] as const) if (y > LY[z] - 4.4 && y < LY[z] + ROOM_H[z] + (z === "ayrton" ? 12 : 0)) out.push(z);
    return out;
  };
  let shown: Zone[] = [];
  const show = (zs: Zone[]) => {
    if (zs.join() === shown.join()) return;
    shown = zs;
    for (const z of ZONES) k.groups[z].visible = zs.includes(z);
  };

  // the view out: the real street at the tower's height (the outside tower is shorter than the
  // climb inside: dials at 32 m, belfry ~40 m)
  let viewKey = -1;
  const outside = (y: number) => (y < 8 ? 3 : y < 30 ? 16 : y < LY.belfry - 1 ? 32 : 42);
  const setView = (y: number) => {
    const up = outside(y);
    if (up === viewKey) return;
    viewKey = up;
    const v = ctx.cityView("bigben", up, VIEW_BACK);
    if (v) scene.background = v;
  };

  let theme: Theme = ctx.theme;
  const applyTheme = () => {
    k.night = theme === "night";
    for (const fn of k.dayNight) fn(k.night);
    if (hemi) hemi.intensity = k.night ? 0.45 : 0.85;
    scene.environmentIntensity = k.night ? 0.25 : 0.4;
    lightZone = null;
  };
  applyTheme();

  let current = 0;
  const setFloor = (n: number) => {
    current = n;
    climb.reset(LEVELS[n].y);
    show(roomOf(LEVELS[n].y));
    setView(LEVELS[n].y);
    lightZone = null;
    placeLights(climb.zone, LEVELS[n].y + 1.6);
  };
  setFloor(0);

  // ---- the Great Bell strikes on every block; the quarters chime on London time ---------------
  let lastSeen = 0;
  const active = () => performance.now() - lastSeen < 500;
  const VOL: Record<Zone, number> = { hall: 0.12, stair: 0.3, prison: 0.25, clock: 0.4, dials: 0.45, belfry: 0.9, ayrton: 0.65 };
  ctx.onBlock((h) => {
    if (blocks.last === h) return;
    blocks.last = h;
    blocks.strikes++;
    bel.strike(h);
    clock.strike();
  });
  bel.onHit((h) => {
    bel.bubble("BONG!");
    if (!active()) return;
    const zone = climb.inWell(k.eye.x, k.eye.z) ? "stair" : climb.levelAt(climb.last);
    bellSound(164.8, VOL[zone]);
    // someone near you reacts
    const near = k.people[zone].filter((s) => s.root.position.distanceTo(k.eye) < 14);
    const s = near[Math.floor(Math.random() * near.length)];
    if (s) s.say(Math.random() < 0.5 ? `Block ${h.toLocaleString("en-US")}!` : "There she goes!", 3);
  });
  const CHANGES = [
    [0, 1, 2, 3],
    [2, 0, 1, 3],
    [2, 1, 0, 2],
    [0, 2, 1, 3],
    [3, 1, 0, 2],
  ];
  const QUARTER = [[0], [1, 2], [3, 4, 0], [1, 2, 3, 4]];
  let chimed = "";
  const chime = (q: number) => {
    const notes = QUARTER[q].flatMap((c) => [...CHANGES[c], -1]);
    clock.chime(notes.length * 0.8);
    notes.forEach((n, i) => {
      if (n < 0) return;
      setTimeout(() => {
        bel.quarter(n);
        if (!active()) return;
        const zone = climb.inWell(k.eye.x, k.eye.z) ? "stair" : climb.levelAt(climb.last);
        bellSound(bel.notes[n], VOL[zone] * 0.55, 3.2);
      }, i * 800);
    });
  };

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) if (k.picks.has(x)) return x;
    return null;
  };
  let chimeAcc = 0;
  return {
    key: "bigben",
    title: "BIG BEN",
    scene,
    floors: LEVELS.map((l, i) => {
      const spawn = i === 0 ? new THREE.Vector3(0, 0, -2.5) : i === 1 ? new THREE.Vector3(0.6, Y0, -50.2) : new THREE.Vector3(2.75, l.y, -53.25);
      return { label: l.label, name: l.name, y: l.y, spawn, yaw: i === 0 ? 0 : i === 1 ? -0.98 : Math.PI / 4 };
    }),
    colliders: () => climb.rects,
    setFloor,
    setTheme(t) {
      theme = t;
      applyTheme();
      placeLights(climb.zone, k.eye.y);
    },
    groundAt: (_f, x, z) => climb.ground(x, z),
    pickables: () => k.pickables.filter((o) => shown.includes(k.zoneOf.get(o)!)),
    pick(hit) {
      const o = find(hit.object);
      return o ? (k.picks.get(o)!(hit) ?? null) : null;
    },
    hover(hit) {
      const o = find(hit.object);
      return o ? (k.hovers.get(o) ?? null) : null;
    },
    update(dt, t, camera) {
      lastSeen = performance.now();
      void current;
      k.eye.copy(camera.position);
      const feet = climb.last;
      climb.inWellZone = climb.inWell(camera.position.x, camera.position.z);
      show(roomOf(feet));
      setView(feet);
      placeLights(climb.zone, camera.position.y);
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const z of shown) {
        for (const s of k.people[z]) s.update(dt, t, camQuat, camRight);
        for (const tick of k.ticks[z]) tick(dt, t);
      }
      bel.tick(dt);
      chimeAcc += dt;
      if (chimeAcc > 0.5) {
        chimeAcc = 0;
        const lt = londonTime();
        const key = `${lt.h}:${lt.m}`;
        if (lt.m % 15 === 0 && lt.s < 3 && key !== chimed) {
          chimed = key;
          chime(lt.m === 0 ? 3 : lt.m / 15 - 1);
        }
      }
    },
  };
}

/** The people: guides, a doorkeeper, the clockmaker, Bradlaugh and the Serjeant, the tourists. */
function cast(k: BBKit) {
  const V = (x: number, z: number) => new THREE.Vector3(x, 0, z).normalize();
  const P = (zone: Zone, id: number, at: [number, number, number], role: string, o: Parameters<BBKit["person"]>[4] = {}) => k.person(zone, id, at, role, o);
  // Westminster Hall
  P("hall", 1201, [3, 0, -3.2], "Doorkeeper", { face: V(0, 1), talk: ["Welcome to Westminster Hall.", "Built in 1097. The roof, 1393.", "The tower tour starts up the steps."] });
  P("hall", 2718, [-4.2, 0, -31], "Tour guide", { face: V(0.3, 1), talk: ["334 steps to the belfry. No lift.", "The bell is Big Ben. The tower is the Elizabeth Tower.", "On every new block, the Great Bell strikes."] });
  const hallPairs: [number, number, [number, number, number], [number, string][][]][] = [
    [
      3141,
      5926,
      [-4.5, 0, -14],
      [
        [
          [0, "Is that really the roof from 1393?"],
          [1, "Oak. Over six hundred years old."],
          [0, "Older than any blockchain, then."],
        ],
        [
          [0, "Look at the angels on the hammer beams."],
          [1, "Twenty-six of them, all holding shields."],
        ],
      ],
    ],
    [
      5358,
      9793,
      [4.6, 0, -23],
      [
        [
          [0, "Charles I was tried right here."],
          [1, "I'm standing on his plaque."],
          [0, "Step off it, then!"],
        ],
        [
          [1, "Did you hear that bell?"],
          [0, "A new block. About every 75 seconds."],
          [1, "London keeps the time, Zcash keeps the blocks."],
        ],
      ],
    ],
  ];
  for (const [a, b, at, script] of hallPairs) {
    const pa = P("hall", a, [at[0] - 0.6, 0, at[2]], "Visitor", { face: V(1, 0) });
    const pb = P("hall", b, [at[0] + 0.6, 0, at[2]], "Visitor", { face: V(-1, 0) });
    k.converse("hall", [pa, pb], script, at);
  }
  const spots: [number, number][] = [
    [-5, -6],
    [5, -8],
    [-6, -18],
    [6, -16],
    [-5, -27],
    [6, -28],
    [0, -12],
  ];
  for (const [i, id] of [2384, 6264, 3383, 2795].entries()) P("hall", id, [spots[i][0], 0, spots[i][1]], "Visitor", { wander: spots, talk: i % 2 ? ["Six hundred years of oak up there.", "Where do the stairs start?"] : ["Is it far to the top?", "I want to see the clock faces."] });
  // the tower foot
  P("hall", 4626, [-1.6, Y0, -52.4], "Tour guide", { face: V(0.4, 1), talk: ["Ready? 334 steps to the belfry.", "Landings at 118, 262 and 286.", "Hold the rail coming down."] });
  {
    const a = P("hall", 4338, [-3.2, Y0, -55], "Visitor", { face: V(1, 0) });
    const b = P("hall", 3279, [-2.2, Y0, -55.6], "Visitor", { face: V(-1, 0) });
    k.converse(
      "hall",
      [a, b],
      [
        [
          [0, "How many steps?"],
          [1, "Three hundred and thirty-four."],
          [0, "I'll count them."],
          [1, "One… two… three…"],
        ],
        [
          [1, "Is there really no lift?"],
          [0, "Not for visitors. Legs only."],
        ],
      ],
      [-2.7, Y0, -55.3],
    );
  }
  // the Prison Room
  {
    const b = P("prison", 1880, [-4.5, LY.prison, -57.9], "Charles Bradlaugh MP", { face: V(0, -1), talk: ["Northampton elected me. Four times.", "I asked to affirm, not to swear."] });
    const s = P("prison", 1415, [0.2, LY.prison, -56.4], "Serjeant-at-Arms", { face: V(-1, 0), talk: ["By order of the House.", "One night, Mr Bradlaugh."] });
    k.converse(
      "prison",
      [b, s],
      [
        [
          [0, "I was elected. Let me take my seat."],
          [1, "By order of the House, you stay here tonight."],
          [0, "Then history will remember this room."],
        ],
        [
          [1, "Still refusing the oath, Mr Bradlaugh?"],
          [0, "I will affirm. My conscience is my own."],
        ],
      ],
      [-2, LY.prison, -57],
    );
  }
  // the Clock Room
  P("clock", 1859, [0.9, LY.clock, -56.2], "Clockmaker", { face: V(-0.5, -1), talk: ["One old penny on the bob: 0.4 seconds a day.", "The pendulum beats every two seconds.", "Running since 31 May 1859.", "Oiled by hand, every week."] });
  {
    const g = P("clock", 7071, [3.2, LY.clock, -58], "Tour guide", { face: V(-1, 0) });
    const v = P("clock", 6180, [2.4, LY.clock, -59.2], "Visitor", { face: V(1, 0.6) });
    k.converse(
      "clock",
      [g, v],
      [
        [
          [1, "Who winds it?"],
          [0, "An electric motor, since 1913."],
          [1, "And before that?"],
          [0, "Two men, by hand, for hours."],
        ],
        [
          [1, "Why the glass in the floor?"],
          [0, "The pendulum: 3.9 metres, swinging below us."],
        ],
      ],
      [2.8, LY.clock, -58.6],
    );
  }
  // behind the dials
  P("dials", 3027, [-1.2, LY.dials, -50.2], "Visitor", { face: V(0, 1), talk: ["The whole city, through the clock face!", "The hands are longer than a car."] });
  P("dials", 1618, [-5, LY.dials, -57.5], "Tour guide", { face: V(1, 0), talk: ["Each dial: 312 pieces of opal glass.", "The minute hand is 4.2 metres long.", "That's London time out there."] });
  // the belfry
  P("belfry", 2236, [-4.6, LY.belfry, -54.5], "Tour guide", { face: V(1, -0.5), talk: ["Earplugs in for the quarters!", "Big Ben is the bell, not the tower.", "Cracked in 1859: turned an eighth, a lighter hammer.", "On every block, she strikes."] });
  {
    const a = P("belfry", 1732, [0.6, LY.belfry, -61.6], "Visitor", { face: V(1, 0) });
    const b = P("belfry", 2449, [1.6, LY.belfry, -62.4], "Visitor", { face: V(-1, 0.3) });
    k.converse(
      "belfry",
      [a, b],
      [
        [
          [0, "When does it ring?"],
          [1, "On every new block."],
          [0, "And how long is a block?"],
          [1, "About 75 seconds. Get ready."],
        ],
        [
          [1, "Thirteen and a half tonnes of bell."],
          [0, "And it's called Big Ben, not the tower."],
        ],
      ],
      [1.1, LY.belfry, -62],
    );
  }
  // the Ayrton Light
  P("ayrton", 1873, [-4, LY.ayrton, -60], "Tour guide", { face: V(1, 0.5), talk: ["The Ayrton Light: lit when the House sits after dark.", "Here since 1873.", "From up here, the whole street."] });
  P("ayrton", 8128, [-6, LY.ayrton, -52], "Visitor", { face: V(-1, 0), talk: ["You can see the whole city.", "The river's right below us."] });
  void (null as Snark | null);
}
