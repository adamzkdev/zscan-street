import * as THREE from "three";
import { Band, type Player } from "../music/band";
import { STAGE_Z1, YS } from "./hall";
import type { Level } from "./kit";
import type { Staging } from "./programme";

/**
 * Who stands in front of the orchestra for each piece (a violin or flute soloist, singers, the
 * corps de ballet, waltzing couples), the red curtain that falls between pieces, and the hall's
 * one live music source: the recording is heard from the stage (positional, src/audio/live.ts),
 * and muffled through the doors in the foyer.
 */

/** In front of the conductor's podium, along the stage's lip. */
const FRONT = STAGE_Z1 - 0.55;

export function buildStage(hall: Level, foyerFloor: number, hallFloor: number) {
  const band = new Band(hall.group);
  const k = 0.82;
  const solo = (kind: "violin" | "flute" | "singer", id: number, x: number, role: string) => band.add(kind, { id, x, y: YS, z: FRONT, yaw: 0, k, role, resting: true });
  const violin = solo("violin", 2269, -3.4, "Violin soloist");
  const flute = solo("flute", 8125, -3.4, "Flute soloist");
  const baritone = solo("singer", 5150, 2.8, "Baritone");
  const soprano = solo("singer", 3317, -2.8, "Soprano");
  const tenor = solo("singer", 7277, 2.8, "Tenor");
  const dancers: Player[] = [];
  const dancerIds = [6011, 6012, 6013, 6014, 6015, 6016];
  dancerIds.forEach((id, i) => dancers.push(band.add("ballet", { id, x: -8 + i * 3.2, y: YS, z: FRONT, yaw: 0, k: 0.72, role: i % 2 ? "Dancer" : "Prima ballerina" })));
  const all = [violin, flute, baritone, soprano, tenor, ...dancers];

  // the music: from the middle of the stage, filling the hall; the foyer hears it through the doors
  const source = band.play({ place: "opera", floor: hallFloor, track: null, level: 1.0, ref: 16, rolloff: 0.5, wet: 0.35, bleed: { [foyerFloor]: { level: 0.28, lp: 900 } }, at: [0, YS + 3, -11] });

  // ---- the curtain: two red velvet drapes with deep folds, drawn to the sides --------------------
  const W = 11.4,
    Hc = 8.6;
  const geo = new THREE.PlaneGeometry(W, Hc, 96, 1);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(((pos.getX(i) + W / 2) / W) * Math.PI * 28) * 0.12);
  geo.computeVertexNormals();
  geo.translate(W / 2, Hc / 2, 0);
  const velvet = new THREE.MeshStandardMaterial({ color: "#8a0c22", roughness: 0.75, side: THREE.DoubleSide, emissive: new THREE.Color("#2a0208") });
  const drapes = [-1, 1].map((sx) => {
    const d = new THREE.Mesh(geo, velvet);
    d.position.set(sx * 11.3, YS - 0.02, STAGE_Z1 - 0.12);
    d.scale.x = -sx * 0.1;
    d.raycast = () => {};
    hall.group.add(d);
    return d;
  });
  // the pelmet over it, gold fringe
  const pelmet = new THREE.Mesh(new THREE.BoxGeometry(23, 1.1, 0.3), velvet);
  pelmet.position.set(0, YS + Hc + 0.35, STAGE_Z1 - 0.12);
  const fringe = new THREE.Mesh(new THREE.BoxGeometry(23, 0.12, 0.32), new THREE.MeshStandardMaterial({ color: "#d8a838", metalness: 0.8, roughness: 0.3 }));
  fringe.position.set(0, YS + Hc - 0.24, STAGE_Z1 - 0.12);
  hall.group.add(pelmet, fringe);
  /** 0 open … 1 closed, eased towards `curtainTo`. */
  let curtain = 0;
  let curtainTo = 0;

  // ---- staging --------------------------------------------------------------------------------------
  let staging: Staging = "orchestra";
  const onStage = (s: Staging): Player[] => {
    switch (s) {
      case "violin":
        return [violin];
      case "flute":
        return [flute];
      case "baritone":
        return [baritone];
      case "soprano":
        return [soprano];
      case "duet":
        return [soprano, tenor];
      case "ballet":
        return dancers.slice(0, 4);
      case "waltz":
        return dancers;
      default:
        return [];
    }
  };
  const setStaging = (s: Staging) => {
    staging = s;
    const on = onStage(s);
    for (const p of all) p.setVisible(on.includes(p));
  };
  setStaging("orchestra");

  /** Taking a bow (0..1) and playing or not. */
  let bow = 0;
  let playing = false;
  band.onTick = (dt, t, e) => {
    curtain += (curtainTo - curtain) * Math.min(1, dt * 1.6);
    for (const [i, d] of drapes.entries()) d.scale.x = (i ? -1 : 1) * (0.1 + 0.9 * curtain);
    for (const p of all) {
      p.resting = !playing || bow > 0.05;
      p.bowing = bow;
    }
    // the dancers' figures: the swans drift across the lip in a line; the waltz turns in couples
    const on = onStage(staging);
    if (staging === "ballet") {
      on.forEach((p, i) => {
        const u = t * 0.12 + i * 0.25;
        const x = Math.sin(u * Math.PI * 2) * 8.2;
        p.moveTo(x, YS, FRONT - 0.15 + Math.sin(u * 9) * 0.08);
        p.lift = playing ? Math.max(0, Math.sin(t * 3.2 + i)) * 0.18 * e : 0;
      });
    } else if (staging === "waltz") {
      on.forEach((p, i) => {
        const c = Math.floor(i / 2);
        const cx = -6 + c * 6 + Math.sin(t * 0.25 + c) * 1.2;
        const a = t * 2.1 * (playing ? 1 : 0.2) + (i % 2) * Math.PI + c;
        p.moveTo(cx + Math.cos(a) * 0.45, YS, FRONT - 0.15 + Math.sin(a) * 0.12);
        p.lift = 0;
      });
    }
  };

  return {
    band,
    source,
    get staging() {
      return staging;
    },
    setStaging,
    /** The performers play (or rest, arms down). */
    setPlaying(on: boolean) {
      playing = on;
    },
    setBow(v: number) {
      bow = v;
    },
    /** Close (1) or open (0) the curtain. */
    setCurtain(v: number) {
      curtainTo = v;
    },
    get curtain() {
      return curtain;
    },
  };
}
