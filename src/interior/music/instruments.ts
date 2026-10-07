import * as THREE from "three";
import { toObject } from "../../scene/voxel/mesher";
import { C, G, VoxelModel } from "../../scene/voxel/model";

/**
 * Voxel instruments for the musicians (./band.ts), finer than the furniture (24 to 48 voxels a
 * metre) so a trumpet's valves or a violin's f-holes read: brass and chrome in the shiny voxel
 * material, wood in the matte one. Each is built once and shared, and returned positioned in the
 * player's own frame (feet at the origin, facing +z), with where its hands go and how it moves.
 */

type V3 = [number, number, number];

/** Fill every voxel within `r` of the segment a → b (voxel coordinates). */
function tube(v: VoxelModel, a: V3, b: V3, r: number, c: number, r1 = r) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.ceil(len * 2));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const rr = r + (r1 - r) * u;
    const cx = a[0] + (b[0] - a[0]) * u,
      cy = a[1] + (b[1] - a[1]) * u,
      cz = a[2] + (b[2] - a[2]) * u;
    for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++)
      for (let z = Math.floor(cz - rr); z <= Math.ceil(cz + rr); z++)
        for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 + (z + 0.5 - cz) ** 2 <= rr * rr + 0.25) v.set(x, y, z, c);
  }
}

/** An ellipsoid (radii in voxels). */
function egg(v: VoxelModel, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5 - cz) / rz) ** 2 <= 1) v.set(x, y, z, c);
}

const cache = new Map<string, { o: THREE.Object3D; res: number; w: number; d: number }>();
/**
 * A model at `res` voxels a metre, as an object whose origin is the voxel `pin` (so a trumpet
 * turns about its mouthpiece, a bow about its frog).
 */
function made(key: string, res: number, build: () => VoxelModel, pin: V3) {
  let e = cache.get(key);
  if (!e) {
    const m = build();
    const o = toObject(m, { shadows: false });
    o.scale.setScalar(6 / res);
    o.traverse((x) => (x.raycast = () => {}));
    e = { o, res, w: m.w, d: m.d };
    cache.set(key, e);
  }
  const inner = e.o.clone();
  // the mesher centres x and z and stands the model on y = 0
  inner.position.set(-(pin[0] + 0.5 - e.w / 2) / res, -(pin[1] + 0.5) / res, -(pin[2] + 0.5 - e.d / 2) / res);
  const g = new THREE.Group();
  g.add(inner);
  return g;
}

// ---- palette ------------------------------------------------------------------------------------
const brass = () => G("#d8a838");
const brassDark = () => G("#a87a20");
const chrome = () => G("#d8dce4");
const pearl = () => C("#f4efe2");
const black = () => C("#16141a");
const varnish = () => C("#a8541c");
const varnishDark = () => C("#6a2e0e");
const ebony = () => C("#1c1414");
const ivory = () => C("#efe6d0");
const horse = () => C("#f2ecdc");

// ---- the instruments ----------------------------------------------------------------------------

/** Trumpet, 40 voxels a metre: leadpipe, the tuning slide, three valves with pearl buttons, the bell. */
function trumpetModel() {
  const v = new VoxelModel(9, 11, 24);
  const b = brass(),
    d = brassDark();
  tube(v, [4, 7, 0], [4, 7, 1], 0.9, chrome()); // mouthpiece
  tube(v, [4, 7, 1], [4, 7, 17], 0.6, b); // leadpipe forward
  tube(v, [4, 7, 17], [4, 4, 17], 0.6, b); // front bend down
  tube(v, [4, 4, 17], [4, 4, 4], 0.6, b); // back along the bottom
  tube(v, [4, 4, 4], [4, 5.5, 3], 0.6, b); // the tuning slide's bend
  tube(v, [4, 6, 9], [4, 6, 21], 0.6, b); // to the bell
  tube(v, [4, 6, 18], [4, 6, 23], 1, b, 3.6); // the bell's flare
  v.box(1, 6, 23, 8, 7, 24, d);
  // three valve casings with their buttons
  for (const z of [8, 10, 12]) {
    v.box(3, 2, z, 6, 9, z + 2, b);
    v.box(3, 9, z, 6, 10, z + 2, chrome());
    v.box(4, 10, z, 5, 11, z + 1, pearl());
  }
  return v;
}

/** Alto saxophone, 40/m: the neck and mouthpiece, the conical body, the U-bow, the flared bell, keys. */
function saxModel() {
  const v = new VoxelModel(16, 30, 14);
  const b = brass(),
    d = brassDark();
  tube(v, [8, 28, 1], [8, 29, 0], 0.8, black()); // mouthpiece
  tube(v, [8, 28, 1], [8, 27, 5], 0.8, b, 1); // the neck, back to the player
  tube(v, [8, 27, 5], [8, 6, 7], 1.3, b, 2.4); // the body
  tube(v, [8, 6, 7], [10, 2, 8], 2.4, b, 2.6); // the bow
  tube(v, [10, 2, 8], [13, 9, 9], 2.6, b, 3); // up to the bell
  tube(v, [13, 9, 9], [14, 14, 9], 3, b, 4.6); // the bell
  for (let y = 12; y < 15; y++) for (let x = 11; x < 16; x++) for (let z = 7; z < 12; z++) if ((x - 13.5) ** 2 + (z - 9.5) ** 2 < 4) v.set(x, y, z, 0);
  // the keys: pearl touches and chrome rods down the front
  for (let y = 9; y < 25; y += 3) {
    v.set(8, y, 9, pearl());
    v.set(8, y + 1, 9, chrome());
  }
  v.box(6, 12, 8, 7, 22, 9, chrome());
  v.box(9, 4, 9, 11, 6, 11, d);
  return v;
}

/** Violin (or viola), 48/m: the body with its waist and f-holes, fingerboard, scroll, chinrest. */
function violinModel(viola: boolean) {
  const L = viola ? 20 : 17;
  const v = new VoxelModel(11, 4, L + 12);
  const w = varnish(),
    dk = varnishDark();
  for (let z = 0; z < L; z++) {
    const u = z / (L - 1);
    // the lower bout, the waist, the upper bout
    const half = 4.8 - 1.6 * Math.exp(-((u - 0.5) ** 2) / 0.02) - (u < 0.08 ? 1.2 : 0) - (u > 0.92 ? 1.6 : 0) - (u > 0.6 ? 0.6 : 0);
    v.box(Math.round(5.5 - half), 0, z, Math.round(5.5 + half), 3, z + 1, (x: number, y: number) => (y === 0 ? dk : w));
  }
  // f-holes
  v.box(3, 3, Math.round(L * 0.4), 4, 4, Math.round(L * 0.62), ebony());
  v.box(7, 3, Math.round(L * 0.4), 8, 4, Math.round(L * 0.62), ebony());
  // the bridge, the tailpiece, the chinrest
  v.box(4, 3, Math.round(L * 0.5), 7, 4, Math.round(L * 0.5) + 1, ivory());
  v.box(5, 3, 1, 6, 4, Math.round(L * 0.35), ebony());
  v.box(1, 3, 0, 4, 4, 3, ebony());
  // the fingerboard, the neck and the scroll
  v.box(5, 3, Math.round(L * 0.55), 6, 4, L + 7, ebony());
  v.box(5, 2, L, 6, 3, L + 8, dk);
  v.box(4, 1, L + 8, 7, 4, L + 11, dk);
  v.box(5, 2, L + 11, 6, 4, L + 12, w);
  return v;
}

/** The bow: stick, white hair, the frog at the hand. 48/m. */
function bowModel(len: number) {
  const n = Math.round(len * 48);
  const v = new VoxelModel(2, 4, n);
  v.box(0, 2, 0, 1, 3, n, varnishDark());
  v.box(0, 0, 2, 1, 1, n - 1, horse());
  v.box(0, 0, 0, 2, 3, 3, ebony());
  v.box(0, 2, n - 2, 1, 4, n, varnishDark());
  return v;
}

/** Upright bass, 24/m: big bouts, f-holes, fingerboard, scroll, the endpin. */
function bassModel() {
  const v = new VoxelModel(17, 46, 8);
  const w = varnish(),
    dk = varnishDark();
  for (let y = 2; y < 28; y++) {
    const u = (y - 2) / 25;
    const half = 7.6 - 2.4 * Math.exp(-((u - 0.52) ** 2) / 0.015) - (u > 0.62 ? 1.4 + (u - 0.62) * 6 : 0) - (u < 0.06 ? 1.6 : 0);
    v.box(Math.round(8.5 - half), y, 1, Math.round(8.5 + half), y + 1, 6, (x: number, yy: number, z: number) => (z === 1 ? dk : w));
  }
  for (const x of [5, 12]) v.box(x, 11, 6, x + 1, 17, 7, ebony());
  v.box(7, 12, 6, 10, 13, 7, ivory()); // bridge
  v.box(8, 5, 6, 9, 12, 7, ebony()); // tailpiece
  v.box(8, 12, 6, 9, 41, 7, ebony()); // fingerboard
  v.box(7, 27, 3, 10, 42, 6, dk); // neck
  v.box(7, 42, 2, 10, 46, 6, dk); // the pegbox and scroll
  v.box(8, 0, 3, 9, 2, 4, chrome()); // endpin
  return v;
}

/** Flute, 48/m, along x. */
function fluteModel() {
  const v = new VoxelModel(32, 3, 3);
  v.box(0, 1, 1, 32, 2, 2, chrome());
  v.box(2, 2, 1, 4, 3, 2, chrome()); // lip plate
  for (let x = 10; x < 30; x += 3) v.set(x, 2, 1, pearl());
  return v;
}

/** A singer's microphone, 48/m: grille and handle. */
function micModel() {
  const v = new VoxelModel(4, 12, 4);
  v.box(1, 0, 1, 3, 8, 3, black());
  egg(v, 2, 9.5, 2, 2, 2.2, 2, chrome());
  return v;
}

/** Drumstick, 32/m. */
function stickModel() {
  const v = new VoxelModel(1, 1, 13);
  v.box(0, 0, 0, 1, 1, 13, C("#d8b888"));
  return v;
}

/** The drum kit (without its cymbals), 24/m: kick drum with its head to the room, snare, toms, the hi-hat stand, the throne. */
function kitModel() {
  const v = new VoxelModel(40, 26, 32);
  const shell = C("#8a1424"),
    head = C("#ece6da"),
    hw = chrome();
  // the kick, lying with its front head to +z
  for (let z = 18; z < 28; z++)
    for (let y = 0; y < 14; y++) for (let x = 13; x < 27; x++) if ((x + 0.5 - 20) ** 2 + (y + 0.5 - 7) ** 2 <= 49) v.set(x, y, z, z === 27 ? head : (x + y) % 9 === 0 ? hw : shell);
  egg(v, 20, 7, 27.6, 3, 3, 0.6, C("#f4b728")); // the logo on the front head
  // the snare on its stand (left of the kick), the floor tom (right), two rack toms on the kick
  v.cylinder(12, 13, 15, 4.2, 4, shell);
  v.box(8, 17, 11, 17, 18, 20, head);
  for (let y = 0; y < 13; y++) v.set(12, y, 15, hw);
  v.cylinder(29, 6, 14, 5, 8, shell);
  v.box(24, 14, 9, 35, 15, 20, head);
  for (const [x, z] of [
    [25, 10],
    [33, 10],
    [29, 19],
  ])
    v.box(x, 0, z, x + 1, 6, z + 1, hw);
  for (const x of [16, 24]) {
    v.cylinder(x, 15, 22, 3.6, 4, shell);
    v.box(x - 3, 19, 19, x + 4, 20, 26, head);
  }
  v.box(19, 14, 22, 21, 16, 23, hw);
  // the hi-hat stand and the cymbal stands (their cymbals are separate, they move)
  for (let y = 0; y < 21; y++) v.set(5, y, 13, hw);
  v.box(3, 0, 11, 8, 1, 16, hw);
  for (let y = 0; y < 25; y++) v.set(34, y, 22, hw);
  for (let y = 0; y < 25; y++) v.set(8, y, 24, hw);
  // the throne
  v.cylinder(20, 10, 4, 4, 2, black());
  for (let y = 0; y < 10; y++) v.set(20, y, 4, hw);
  return v;
}

// ---- rigs: an instrument in the player's frame, its hands and its motion ---------------------------

export interface Rig {
  /** The instrument (and its moving parts), in the player's frame. */
  obj: THREE.Group;
  /** Seated (the drums, the piano) or standing. */
  sit: boolean;
  /** Where the near and far hands are at time `t`, with the music at loudness `e` (0..1). */
  hands(t: number, e: number, L: THREE.Vector3, R: THREE.Vector3): void;
  /** Moving parts (a bow, sticks, cymbals, a bell lifted on a loud passage). */
  anim(t: number, e: number): void;
  /** Extra arm segments drawn from a hand (a drumstick's tip is not a hand). */
  rest?: number;
}

/** Body landmarks of a zkSNARK in its own frame at scale 1 (shoulders, chin, mouth). */
export const BODY = { shoulder: 0.81, chin: 1.08, mouth: 1.24 };
const Y = (k: number, y: number) => y * k;

export type Kind = "trumpet" | "sax" | "violin" | "viola" | "bass" | "drums" | "flute" | "singer" | "piano" | "ballet" | "bow";

/**
 * The rig for `kind`, for a player at scale `k` (instruments are drawn about 1.25× life size so
 * they read next to the zkSNARKs' big heads).
 */
export function rig(kind: Kind, k = 1): Rig {
  const obj = new THREE.Group();
  const S = 1.25 * k;
  const mouth = Y(k, BODY.mouth),
    chin = Y(k, BODY.chin);
  switch (kind) {
    case "trumpet": {
      const t = made("trumpet", 40, trumpetModel, [4, 7, 0]);
      t.scale.setScalar(S);
      t.position.set(0, mouth - 0.06 * k, 0.1 * k);
      obj.add(t);
      return {
        obj,
        sit: false,
        hands(time, e, L, R) {
          // the near hand's fingers on the valves, the far one round the casings
          const f = Math.sin(time * 9) > 0.3 ? 0.012 : 0;
          R.set(0.0, t.position.y + 0.1 * S - f, t.position.z + 0.27 * S);
          L.set(-0.02, t.position.y - 0.02 * S, t.position.z + 0.32 * S);
          void e;
        },
        anim(time, e) {
          // the bell lifts on the loud phrases
          t.rotation.x = -0.12 - 0.25 * e + Math.sin(time * 1.3) * 0.03;
        },
      };
    }
    case "sax": {
      const s = made("sax", 40, saxModel, [8, 29, 0]);
      s.scale.setScalar(S * 1.15);
      s.position.set(0, mouth - 0.04 * k, 0.12 * k);
      s.rotation.z = 0.12;
      obj.add(s);
      return {
        obj,
        sit: false,
        hands(time, e, L, R) {
          const f = Math.sin(time * 7) * 0.012;
          L.set(-0.05, s.position.y - 0.38 * S + f, s.position.z + 0.2 * S);
          R.set(0.05, s.position.y - 0.56 * S - f, s.position.z + 0.22 * S);
          void e;
        },
        anim(time, e) {
          // the player leans into it, the bell swings out on the long notes
          s.rotation.x = 0.1 + Math.sin(time * 0.9) * 0.05 + 0.08 * e;
          s.rotation.y = Math.sin(time * 0.6) * 0.12;
        },
      };
    }
    case "violin":
    case "viola": {
      const vl = made(kind, 48, () => violinModel(kind === "viola"), [5, 3, 1]);
      vl.scale.setScalar(S);
      // under the chin on the far (left) shoulder, scroll forward and to the left
      vl.position.set(0.14 * k, chin - 0.08 * k, 0.16 * k);
      vl.rotation.set(0.15, 0.75, 0.55);
      obj.add(vl);
      const bow = made("bow", 48, () => bowModel(0.72), [0, 2, 0]);
      bow.scale.setScalar(S);
      obj.add(bow);
      const bridge = new THREE.Vector3();
      const dir = new THREE.Vector3(1, 0.12, 0.35).normalize();
      const Z = new THREE.Vector3(0, 0, 1);
      const len = kind === "viola" ? 20 : 17;
      return {
        obj,
        sit: false,
        hands(time, e, L, R) {
          // the far hand on the neck by the scroll, the near one on the bow's frog
          vl.updateMatrix();
          L.set(0.5 / 48, 0, (len + 5) / 48).applyMatrix4(vl.matrix);
          bow.updateMatrix();
          R.set(0, 0, 0.03).applyMatrix4(bow.matrix);
          void time;
          void e;
        },
        anim(time, e) {
          // the bow crosses the strings at the bridge, square to them, sawing along its length
          vl.updateMatrix();
          bridge.set(0.5 / 48, 1.5 / 48, (len * 0.42) / 48).applyMatrix4(vl.matrix);
          const stroke = Math.sin(time * (1.4 + 2.2 * e) + Math.sin(time * 0.37) * 2);
          // which point of the bow touches the strings: frog to tip and back
          const along = 0.5 + 0.38 * stroke;
          bow.position.copy(bridge).addScaledVector(dir, -along * 0.72 * S);
          bow.quaternion.setFromUnitVectors(Z, dir);
        },
      };
    }
    case "bass": {
      const b = made("bass", 24, bassModel, [8, 0, 4]);
      b.scale.setScalar(k * 1.05);
      b.position.set(-0.12 * k, 0, 0.32 * k);
      b.rotation.set(-0.12, 0.35, 0.1);
      obj.add(b);
      return {
        obj,
        sit: false,
        hands(time, e, L, R) {
          b.updateMatrix();
          // the far hand high on the neck, sliding; the near one plucking over the f-holes
          L.set(0, (33 + Math.sin(time * 0.8) * 3) / 24, 6.5 / 24).applyMatrix4(b.matrix);
          const pl = Math.max(0, Math.sin(time * (5 + 3 * e)));
          R.set((1 + pl * 1.5) / 24, (17 + pl * 0.6) / 24, 7 / 24).applyMatrix4(b.matrix);
        },
        anim(time) {
          b.rotation.z = 0.1 + Math.sin(time * 0.7) * 0.03;
        },
      };
    }
    case "drums": {
      const kit = made("kit", 24, kitModel, [20, 10, 4]);
      kit.scale.setScalar(k);
      // the throne under the drummer: the kit sits in front
      kit.position.set(0, 0, 0);
      obj.add(kit);
      const cymbal = (r: number) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, 0.012, 24), new THREE.MeshStandardMaterial({ color: "#d8a838", metalness: 0.85, roughness: 0.3 }));
        m.raycast = () => {};
        obj.add(m);
        return m;
      };
      // the kit's own voxel grid (24/m) with its throne at the origin: positions in the player's frame
      const at = (x: number, y: number, z: number) => new THREE.Vector3(((x - 20) / 24) * k, ((y - 10.5) / 24) * k, ((z - 4) / 24) * k);
      const hat = cymbal(0.17 * k);
      const hat2 = cymbal(0.17 * k);
      const ride = cymbal(0.26 * k);
      const crash = cymbal(0.21 * k);
      const HAT = at(5, 21, 13),
        RIDE = at(34, 25, 22),
        CRASH = at(8, 25, 24),
        SNARE = at(12, 18, 15);
      hat.position.copy(HAT);
      hat2.position.copy(HAT).add(new THREE.Vector3(0, 0.03 * k, 0));
      ride.position.copy(RIDE);
      crash.position.copy(CRASH);
      ride.rotation.z = -0.2;
      crash.rotation.z = 0.25;
      const sticks = [0, 1].map(() => {
        const s = made("stick", 32, stickModel, [0, 0, 0]);
        s.scale.setScalar(k);
        obj.add(s);
        return s;
      });
      const hitR = new THREE.Vector3(),
        hitL = new THREE.Vector3();
      const ZZ = new THREE.Vector3(0, 0, 1);
      const swing = (time: number, e: number) => {
        // swing time on the ride with the near hand, the far hand on the snare and the hi-hat
        const beat = time * (2.2 + e * 0.6);
        const ph = beat % 1;
        const up = ph < 0.66 ? ph / 0.66 : (1 - ph) / 0.34;
        hitR.copy(RIDE).add(new THREE.Vector3(-0.06 * k, 0.08 * k + up * 0.16 * k, -0.12 * k));
        const ghost = Math.floor(beat) % 2 === 1;
        const ph2 = (beat + 0.5) % 1;
        const lift = (ghost ? 0.18 : 0.05) * k * Math.abs(Math.sin(ph2 * Math.PI));
        hitL.copy(Math.floor(beat / 4) % 2 ? HAT : SNARE).add(new THREE.Vector3(0.04 * k, 0.06 * k + lift, -0.1 * k));
        return up;
      };
      return {
        obj,
        sit: true,
        hands(time, e, L, R) {
          swing(time, e);
          R.copy(hitR).add(new THREE.Vector3(-0.1 * k, 0.04 * k, -0.24 * k));
          L.copy(hitL).add(new THREE.Vector3(0.1 * k, 0.04 * k, -0.22 * k));
        },
        anim(time, e) {
          const up = swing(time, e);
          ride.rotation.x = Math.max(0, 1 - up * 3) * 0.08;
          crash.rotation.x = Math.sin(time * 9) * 0.02 * e;
          hat2.position.y = HAT.y + 0.03 * k * (Math.sin(time * 4.4) > 0 ? 1 : 0.2);
          // each stick from its hand to what it hits
          const R = hitR.clone().add(new THREE.Vector3(-0.1 * k, 0.04 * k, -0.24 * k));
          const L = hitL.clone().add(new THREE.Vector3(0.1 * k, 0.04 * k, -0.22 * k));
          sticks[0].position.copy(R);
          sticks[0].quaternion.setFromUnitVectors(ZZ, hitR.clone().sub(R).normalize());
          sticks[1].position.copy(L);
          sticks[1].quaternion.setFromUnitVectors(ZZ, hitL.clone().sub(L).normalize());
        },
      };
    }
    case "flute": {
      const f = made("flute", 48, fluteModel, [3, 1, 1]);
      f.scale.setScalar(S);
      f.position.set(-0.02 * k, mouth - 0.1 * k, 0.12 * k);
      f.rotation.set(0, -0.35, -0.18);
      obj.add(f);
      return {
        obj,
        sit: false,
        hands(time, e, L, R) {
          f.updateMatrix();
          const w = Math.sin(time * 8) * 0.5;
          L.set((11 + w) / 48, 0.5 / 48, 1 / 48).applyMatrix4(f.matrix);
          R.set((24 - w) / 48, 0.5 / 48, 1 / 48).applyMatrix4(f.matrix);
          void e;
        },
        anim(time, e) {
          f.rotation.z = -0.18 + Math.sin(time * 1.1) * 0.04 * (0.4 + e);
        },
      };
    }
    case "singer": {
      const m = made("mic", 48, micModel, [2, 0, 2]);
      m.scale.setScalar(S);
      m.position.set(0.1 * k, mouth - 0.32 * k, 0.2 * k);
      m.rotation.x = -0.5;
      obj.add(m);
      return {
        obj,
        sit: false,
        hands(time, e, L, R) {
          R.set(0.1 * k, mouth - 0.3 * k, 0.21 * k);
          // the free hand opens out on the long notes
          const o = 0.5 + 0.5 * Math.sin(time * 0.8);
          L.set(-0.35 * k - 0.15 * k * e * o, Y(k, BODY.shoulder) + 0.1 * k + 0.35 * k * e * o, 0.28 * k);
        },
        anim() {},
      };
    }
    case "piano": {
      // the keyboard is the piano's (placed with it): the hands play along it in front of the player
      return {
        obj,
        sit: true,
        hands(time, e, L, R) {
          const run = Math.sin(time * 0.7) * 0.12 * k;
          const pl = (ph: number) => Math.max(0, Math.sin(time * (6 + 4 * e) + ph)) * 0.035 * k;
          // the keys are a little above the bench (the player's frame stands on it)
          L.set(-0.24 * k + run * 0.5, 0.36 + pl(0), 0.42 * k);
          R.set(0.2 * k + run, 0.36 + pl(2.1), 0.42 * k);
        },
        anim() {},
      };
    }
    case "ballet": {
      // arms en couronne over the head, opening to the sides and closing again
      return {
        obj,
        sit: false,
        hands(time, e, L, R) {
          const o = 0.5 + 0.5 * Math.sin(time * 1.6);
          const hy = Y(k, 1.95) - o * 0.75 * k;
          L.set(-0.18 * k - o * 0.55 * k, hy, 0.12 * k);
          R.set(0.18 * k + o * 0.55 * k, hy, 0.12 * k);
          void e;
        },
        anim() {},
      };
    }
    case "bow":
    default: {
      return {
        obj,
        sit: false,
        hands(_t, _e, L, R) {
          L.set(-0.3 * k, Y(k, 0.45), 0.15 * k);
          R.set(0.3 * k, Y(k, 0.45), 0.15 * k);
        },
        anim() {},
      };
    }
  }
}

/** A tutu: a stiff white tulle disc at the waist, for the ballet. */
export function tutu(k = 1) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.62 * k, 0.5 * k, 0.1 * k, 20, 1, true), new THREE.MeshStandardMaterial({ color: "#f8f2f6", roughness: 0.9, side: THREE.DoubleSide }));
  const top = new THREE.Mesh(new THREE.RingGeometry(0.3 * k, 0.62 * k, 20), new THREE.MeshStandardMaterial({ color: "#ffe8f2", roughness: 0.9, side: THREE.DoubleSide }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.05 * k;
  g.add(m, top);
  g.traverse((o) => (o.raycast = () => {}));
  return g;
}
