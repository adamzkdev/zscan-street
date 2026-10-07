import * as THREE from "three";
import { holeAt } from "./bowl";
import { buildFans, crowdIds, type FanSeat } from "./fans";
import { GOAL_AGAINST, GOAL_FOR, OOH, STADIUM_GOLD, STADIUM_SILVER, WAVE, liveLines, pickOf, type Line } from "./lines";
import { GOLD, HX, LOWER, RC, SILVER, UPPER, along, rng } from "./layout";
import { Shouts } from "./shout";

/**
 * The crowd: one zkSNARK per seat (most of them), each a different item of the collection, in
 * gold and black for Shielded, silver and navy for Transparent in the away end, the ultras behind
 * the west goal. Everything moves on the GPU (see fans.ts): standing, jumping, scarves, flags and
 * the Mexican wave round the bowl. And they shout: comic bubbles pop over the stands, chants run
 * through the gold end, every goal, save and block sets off a burst.
 */

export interface Crowd {
  count: number;
  /** A side scored: 0 Shielded, 1 Transparent. */
  goal(team: 0 | 1): void;
  /** A block landed: the wave goes round. */
  wave(): void;
  /** A near miss: the whole ground rises for a second. */
  ooh(): void;
  /** The block being played, for the lines. */
  setHeight(h: number | null): void;
  tick(dt: number, t: number, camera?: THREE.Camera): void;
}

interface Seat {
  rot: number;
  ang: number;
  team: number;
  x: number;
  y: number;
  z: number;
  upper: boolean;
  row: number;
}

export function buildCrowd(scene: THREE.Scene, opts: { reserve?: (x: number, z: number, upper: boolean, row: number) => boolean } = {}): Crowd {
  const R = rng(2024);
  const seats: Seat[] = [];
  const empty: Seat[] = [];
  const tiers = [
    { t: LOWER, upper: false },
    { t: UPPER, upper: true },
  ];
  for (const { t, upper } of tiers)
    for (let r = 0; r < t.rows; r++) {
      const d = t.d0 + r * t.dd;
      const y = t.y0 + r * t.dy;
      along(d + t.dd * 0.55, 0.56, (x, z, nx, nz, s) => {
        // aisles: stairs every 15 m along the front
        if (s % 15 < 1.1) return;
        if (holeAt(x, z, d)) return;
        if (opts.reserve?.(x, z, upper, r)) return;
        // the last rows under the south walkway stay free: nobody stands up in the watchers' view
        const clear = !upper && r >= t.rows - 3 && z > 0 && Math.abs(x) < HX - RC;
        // the away end (east) is silver; the ultras stand behind the west goal
        let team = x > HX - 8 ? 1 : x < -(HX - 8) ? 3 : 0;
        if (team === 0 && R() < 0.06) team = 1;
        if (team === 0 && R() < 0.1) team = 2;
        const seat = { rot: Math.atan2(-nx, -nz), ang: Math.atan2(z, x), team, x, y, z, upper, row: r };
        const full = team === 3 ? 0.98 : 0.86;
        (!clear && R() < full ? seats : empty).push(seat);
      });
    }

  // ---- the people: zkSNARKs ------------------------------------------------------------------
  const palettes: Record<number, [string, number][]> = {
    0: [
      [GOLD, 0.5],
      ["#1b1a21", 0.28],
      ["#c88d12", 0.14],
      ["#f2efe6", 0.08],
    ],
    1: [
      [SILVER, 0.5],
      ["#2a3040", 0.3],
      ["#f2f4f8", 0.2],
    ],
    2: [
      [GOLD, 0.3],
      ["#1b1a21", 0.25],
      ["#e8e4dc", 0.2],
      [SILVER, 0.25],
    ],
    3: [
      [GOLD, 0.6],
      ["#1b1a21", 0.4],
    ],
  };
  const pick = (team: number) => {
    let r = R();
    for (const [c, w] of palettes[team]) if ((r -= w) <= 0) return c;
    return palettes[team][0][0];
  };
  const ids = crowdIds(seats.length, 2024);
  const fanSeats: FanSeat[] = seats.map((s, i) => {
    const r = R();
    // flags: a few, never in the lower south tier right under the watchers
    const flagOk = s.upper || s.z < 0;
    const kind = s.team === 3 ? (r < 0.06 && flagOk ? 2 : r < 0.3 ? 1 : 0) : s.team === 1 ? (r < 0.025 && flagOk ? 2 : r < 0.2 ? 1 : 0) : r < 0.012 && flagOk ? 2 : r < 0.14 ? 1 : 0;
    return { x: s.x, y: s.y, z: s.z, rot: s.rot, ang: s.ang, team: s.team, kind, shirt: pick(s.team), id: ids[i] };
  });
  const fans = buildFans(fanSeats, { lod: 46 });
  scene.add(fans.group);
  const uniforms = fans.uniforms;
  const shouts = new Shouts(fans, 5);
  scene.add(shouts.group);
  const gold = (i: number) => fanSeats[i].team !== 1;
  const silver = (i: number) => fanSeats[i].team === 1;
  let height: number | null = null;
  const say = ([text, style]: Line, near?: (i: number) => boolean, delay = 0) => shouts.say(text, style, { near, delay });

  // ---- empty seats: gold and black bucket seats ----------------------------------------------
  {
    const g = new THREE.BoxGeometry(0.44, 0.1, 0.4).translate(0, 0.42, 0.06);
    const back = new THREE.BoxGeometry(0.44, 0.42, 0.06).translate(0, 0.62, -0.15);
    const merged = new THREE.BufferGeometry();
    const a = g.toNonIndexed(),
      b = back.toNonIndexed();
    const pos = new Float32Array([...(a.attributes.position.array as Float32Array), ...(b.attributes.position.array as Float32Array)]);
    const nor = new Float32Array([...(a.attributes.normal.array as Float32Array), ...(b.attributes.normal.array as Float32Array)]);
    merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    merged.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    const im = new THREE.InstancedMesh(merged, new THREE.MeshStandardMaterial({ roughness: 0.6 }), empty.length);
    const c = new THREE.Color();
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      Y = new THREE.Vector3(0, 1, 0),
      one = new THREE.Vector3(1, 1, 1);
    empty.forEach((s, i) => {
      im.setMatrixAt(i, m.compose(new THREE.Vector3(s.x, s.y, s.z), q.setFromAxisAngle(Y, s.rot), one));
      im.setColorAt(i, c.set(s.team === 1 ? SILVER : Math.floor((s.x + 200) / 15) % 2 ? GOLD : "#1d1c23"));
    });
    scene.add(im);
  }

  let waveAt = -100,
    goalAt = -100,
    goalTeam: 0 | 1 = 0,
    oohAt = -100,
    now = 0,
    nextLine = 1,
    nextChant = 8;
  return {
    count: seats.length,
    setHeight(h) {
      height = h;
    },
    goal(team) {
      goalAt = now;
      goalTeam = team;
      const fr = team === 0 ? gold : silver,
        ag = team === 0 ? silver : gold;
      for (let k = 0; k < 9; k++) {
        const l: Line = team === 1 && k % 3 === 0 ? ["TRANSPARENT!!", "silver"] : pickOf(GOAL_FOR);
        say(l, fr, k * 0.18);
      }
      if (team === 0 && height) say([`BLOCK ${height.toLocaleString("en-US")} BABY!`, "shout"], gold, 0.5);
      for (let k = 0; k < 3; k++) say(pickOf(GOAL_AGAINST), ag, 0.4 + k * 0.3);
    },
    wave() {
      waveAt = now;
      say(pickOf(WAVE), undefined, 0.2);
      if (height) say([`BLOCK ${height.toLocaleString("en-US")}!`, "shout"], gold, 0.6);
    },
    ooh() {
      oohAt = now;
      for (let k = 0; k < 4; k++) say(pickOf(OOH), undefined, k * 0.15);
    },
    tick(dt, _t, camera) {
      now += dt;
      fans.tick(now);
      // the wave: two laps in ten seconds, anticlockwise like the loop
      const wt = now - waveAt;
      if (wt < 10) {
        uniforms.uWave.value.set(Math.PI - (wt / 5) * Math.PI * 2, Math.min(1, wt * 2, (10 - wt) * 1.5));
      } else uniforms.uWave.value.y = 0;
      const gt = now - goalAt;
      const g = gt < 9 ? Math.min(1, gt * 4) * Math.min(1, (9 - gt) / 3) : 0;
      const o = now - oohAt < 1.6 ? Math.sin(((now - oohAt) / 1.6) * Math.PI) * 0.55 : 0;
      uniforms.uCheer.value.set(goalTeam === 0 ? g : 0, goalTeam === 1 ? g : 0, o);
      // scarves go up for the goal and stay up a while
      const target = gt < 14 ? 1 : 0.15 + 0.15 * Math.max(0, Math.sin(now * 0.07));
      uniforms.uScarf.value += (target - uniforms.uScarf.value) * Math.min(1, dt * 2);
      if (!camera) return;
      // the murmur: a line every half second or so, more when the ground is up
      nextLine -= dt * (1 + 2 * g);
      if (nextLine <= 0 && shouts.busy < shouts.max - 3) {
        nextLine = 0.35 + Math.random() * 0.45;
        const r = Math.random();
        if (r < 0.14) {
          const live = liveLines(height);
          if (live.length) say(pickOf(live), gold);
        } else if (r < 0.3) say(pickOf(STADIUM_SILVER), silver);
        else say(pickOf(STADIUM_GOLD), gold);
      }
      // a chant runs through the gold end
      nextChant -= dt;
      if (nextChant <= 0) {
        nextChant = 16 + Math.random() * 12;
        const c: Line = pickOf([
          ["SHIELD-ED! SHIELD-ED!", "chant"],
          ["ZEC ZEC ZEC!", "chant"],
          ["PRIVACY IS NORMAL!", "chant"],
          ["ZERO KNOWLEDGE, FULL VOLUME!", "chant"],
        ] as Line[]);
        for (let k = 0; k < 5; k++) say(c, gold, k * 0.35);
        uniforms.uScarf.value = Math.max(uniforms.uScarf.value, 0.8);
      }
      shouts.tick(dt, camera);
    },
  };
}
