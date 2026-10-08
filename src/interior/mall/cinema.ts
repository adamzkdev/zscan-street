import * as THREE from "three";
import { FILM_SLOTS, FILMS, filmImage, filmInfo, filmPoster, filmUrl, ACCENT } from "../../scene/films";
import { fitText } from "../../scene/fit";
import { memeIndex, memePoster } from "../../scene/memes";
import { hash } from "../../scene/voxel/model";
import { LEVELS, MallKit, MONO, NORTH, SANS } from "./kit";

/**
 * ZK CINEMA's screening rooms, behind the lobby on level 4 (x −5…25 of the north band): a corridor
 * along the front, then one room per film of the zkSNARKs network's holder spotlights
 * (data/films.ts), each with its tiered seats, a zkSNARK audience, the film on the big screen and
 * a screening board at its door.
 *
 * A film only plays while you are in its room: the <video> is made when you walk in, paused when
 * you walk out (or leave the floor, or the mall), and thrown away a little later; never more than
 * one at a time. Muted autoplay; the sound comes through the city's soundscape when it is on
 * (audio.ts, "zstreet:film"), the mall's bed ducked under it. On touch devices the screen shows
 * the film's still until it is tapped.
 */

const TOUCH = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
/** The north band's depth (local z 0 … −D), the corridor's depth, and the rooms' front wall. */
const D = 16;
const CORR = 3.2;
const ROOM_W = 10;
/** The rooms' screens: 16 : 9, their centre height. */
const SW = 8,
  SH = 4.5,
  SY = 2.85;
const ROWS = 6,
  SEATS = 8;
const rowZ = (r: number) => -10.4 + r * 0.95;
const tierY = (r: number) => r * 0.2;

const n2 = (v: number) => String(v).padStart(2, "0");
const secs = (rt: string) => {
  const [m, s] = rt.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
};

interface Room {
  film: number;
  x0: number;
  x1: number;
  mat: THREE.MeshBasicMaterial;
  still: THREE.Texture;
  video: HTMLVideoElement | null;
  vtex: THREE.VideoTexture | null;
  playing: boolean;
  /** Seconds since you last were in the room (the video is thrown away after a while). */
  away: number;
  /** Touch devices: the screen was tapped. */
  tapped: boolean;
}

export class Cinema {
  readonly rooms: Room[] = [];
  private seen = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(readonly k: MallKit) {}

  /** The corridor and the rooms, in the frame of the north band (local z = world z + 40). */
  build() {
    const k = this.k,
      f = 4;
    const nRooms = Math.min(3, Math.max(1, FILMS.length));
    // the wall between the lobby and the corridor, the way through at its front end
    k.at(f, 0, NORTH, 0);
    k.box(k.paint, "#1a0e1e", 0.25, 6, D - CORR, -5, 0, -(D + CORR) / 2);
    k.box(k.paint, "#1a0e1e", 0.25, 6, 0.6, -5, 0, -0.3);
    k.box(k.paint, "#1a0e1e", 0.25, 3.2, CORR - 0.6, -5, 2.6, -(CORR + 0.6) / 2);
    k.solid(f, -5.15, -D, -4.85, -CORR);
    k.solid(f, -5.15, -0.6, -4.85, 0);
    k.sign("SCREENS 1–3 ▶", 0.26, -5.16, 2.95, -(CORR + 0.6) / 2, -Math.PI / 2, { color: "#ff4a5a" });
    k.sign("◀ SCREENS 1–3", 0.26, -4.84, 2.95, -(CORR + 0.6) / 2, Math.PI / 2, { color: "#ff4a5a" });
    // the corridor: carpet runner, wall lights, an "absolute cinema" in a frame at its end
    k.at(f, 0, NORTH, 0, f);
    k.box(k.glow, "#ffb070", 30, 0.03, 0.05, 10, 0.05, -0.32, 0, 1.0);
    for (let x = -2; x <= 22; x += 4) {
      k.box(k.glow, "#ffb070", 0.3, 0.5, 0.04, x, 2.6, -0.34, 0, 1.3);
      k.box(k.paint, "#3a1a20", 0.4, 0.6, 0.04, x, 2.55, -0.32);
    }
    const ac = memePoster(Math.max(0, memeIndex("absolute-cinema")), 1.7, { kind: "lightbox", frame: "#ff4a5a" });
    ac.position.copy(k.world(24.85, 2.3, -CORR / 2));
    ac.rotation.y = -Math.PI / 2;
    k.groups[f].add(ac);
    for (let j = 0; j < nRooms; j++) this.room(j, -5 + j * ROOM_W, -5 + (j + 1) * ROOM_W);
    k.at(f);
    // the rooms ask every frame where you are; a timer catches leaving the mall altogether
    this.watchdog = setInterval(() => {
      if (performance.now() - this.seen > 600) this.idle(0.5);
    }, 500);
  }

  private room(j: number, x0: number, x1: number) {
    const k = this.k,
      f = 4;
    const film = j;
    const F = FILMS[film];
    const acc = ACCENT[film % ACCENT.length];
    const cx = (x0 + x1) / 2;
    const doorA = x1 - 2.25,
      doorB = x1 - 0.55;
    // walls: the front one (to the corridor) with its door, the side ones between rooms
    k.at(f, 0, NORTH, 0);
    k.box(k.paint, "#1a0e1e", doorA - x0, 5.4, 0.25, (x0 + doorA) / 2, 0, -CORR);
    k.box(k.paint, "#1a0e1e", x1 - doorB, 5.4, 0.25, (doorB + x1) / 2, 0, -CORR);
    k.box(k.paint, "#1a0e1e", doorB - doorA, 2.9, 0.25, (doorA + doorB) / 2, 2.5, -CORR);
    k.solid(f, x0, -CORR - 0.15, doorA, -CORR + 0.15);
    k.solid(f, doorB, -CORR - 0.15, x1, -CORR + 0.15);
    if (x1 < 24.9) {
      k.box(k.paint, "#1a0e1e", 0.25, 5.4, D - CORR, x1, 0, -(D + CORR) / 2);
      k.solid(f, x1 - 0.15, -D, x1 + 0.15, -CORR);
    }
    k.at(f, 0, NORTH, 0, f);
    // the door: a dark curtain frame, the room's number lit above
    k.box(k.gloss, "#2a1418", 0.12, 2.5, 0.32, doorA, 0, -CORR);
    k.box(k.gloss, "#2a1418", 0.12, 2.5, 0.32, doorB, 0, -CORR);
    k.sign(`SCREEN ${j + 1}`, 0.3, (doorA + doorB) / 2, 3.0, -CORR + 0.14, 0, { color: acc });
    // inside: the wall cloth, the screen's black masking, the steps' lights, the seats
    k.box(k.paint, "#140a10", x1 - x0 - 0.3, 5.4, 0.1, cx, 0, -D + 0.08);
    k.box(k.paint, "#000000", SW + 0.6, SH + 0.5, 0.06, cx, SY - SH / 2 - 0.25, -D + 0.16);
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) k.box(k.paint, i % 2 ? "#5a0a16" : "#6a1020", 0.22, 5.2, 0.26, cx + sx * (SW / 2 + 0.45 + i * 0.2), 0, -D + 0.3);
    k.box(k.paint, "#3a0a14", SW + 2.4, 0.5, 0.3, cx, 4.85, -D + 0.3);
    const sx0 = x0 + 0.55,
      sx1 = x1 - 2.55;
    for (let r = 0; r < ROWS; r++) {
      const z = rowZ(r),
        ty = tierY(r);
      if (ty > 0) k.box(k.paint, "#1e1220", sx1 - sx0 + 0.2, ty, 0.95, (sx0 + sx1) / 2, 0, z);
      k.box(k.glow, "#ffb070", 0.6, 0.02, 0.04, sx1 + 0.3, ty + 0.01, z + 0.46, 0, 1.2);
      for (let s = 0; s < SEATS; s++) {
        const x = sx0 + 0.42 + s * ((sx1 - sx0 - 0.84) / (SEATS - 1));
        k.box(k.paint, "#a01428", 0.6, 0.42, 0.55, x, ty, z - 0.05);
        k.box(k.paint, "#b81c32", 0.6, 0.5, 0.14, x, ty + 0.42, z + 0.24);
        k.box(k.paint, "#1a1a1e", 0.06, 0.2, 0.5, x + 0.33, ty + 0.42, z - 0.05);
      }
    }
    k.solid(f, sx0 - 0.1, rowZ(0) - 0.5, sx1 + 0.1, rowZ(ROWS - 1) + 0.5);
    // the projection booth's window over the door, its beam
    k.box(k.glow, "#fff4d8", 0.5, 0.3, 0.04, cx, 4.3, -CORR - 0.14, 0, 1.6);
    const len = D - CORR - 0.4;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 2.2, len, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.24, 0.3), transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.geometry.rotateX(Math.PI / 2);
    const from = k.world(cx, 4.3, -CORR - 0.2),
      to = k.world(cx, SY, -D + 0.2);
    beam.position.copy(from).lerp(to, 0.5);
    beam.lookAt(to);
    beam.raycast = () => {};
    k.groups[f].add(beam);

    // the screen: the film's still until you walk in, then the film itself
    const still = new THREE.TextureLoader().load(filmUrl(F.still));
    still.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: still, toneMapped: false, color: new THREE.Color(0.55, 0.55, 0.55) });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), mat);
    scr.position.copy(k.world(cx, SY, -D + 0.2));
    k.groups[f].add(scr);
    const room: Room = { film, x0, x1, mat, still, video: null, vtex: null, playing: false, away: 0, tapped: false };
    this.rooms.push(room);
    const hover = `<b>${esc(F.name)}</b><span>Screen ${j + 1} · ${esc(F.runtime)}${TOUCH ? " · tap to play" : ""}</span>`;
    k.pick(f, scr, hover, () => {
      room.tapped = true;
      return filmInfo(film, `ZK CINEMA · Screen ${j + 1}`);
    });

    // the poster and the screening board beside the door, in the corridor
    const P = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), new THREE.MeshBasicMaterial({ map: filmPoster(film), toneMapped: false }));
    P.position.copy(k.world(x0 + 1.6, 1.75, -CORR + 0.15));
    k.groups[f].add(P);
    k.box(k.gloss, "#c9a227", 1.32, 1.92, 0.04, x0 + 1.6, 0.81, -CORR + 0.12);
    k.pick(f, P, `<b>${esc(F.name)}</b><span>holder spotlight · ${esc(F.runtime)}</span>`, () => filmInfo(film, `ZK CINEMA · Screen ${j + 1}`));
    const total = secs(F.runtime) || 60;
    const art = filmImage(F.art);
    const board = k.screen(f, 1.5, 1.1, x0 + 3.6, 1.75, -CORR + 0.15, 0, (g, W, H) => {
      g.fillStyle = "#08060a";
      g.fillRect(0, 0, W, H);
      g.fillStyle = acc;
      g.fillRect(0, 0, W, 8);
      g.textAlign = "left";
      g.font = `800 ${H * 0.08}px ${MONO}`;
      g.fillText(`SCREEN ${j + 1} · SÉANCE`, W * 0.05, H * 0.15);
      const ps = H * 0.36;
      if (art.complete && art.naturalWidth) {
        g.imageSmoothingEnabled = false;
        g.drawImage(art, W * 0.05, H * 0.22, ps, ps);
        g.imageSmoothingEnabled = true;
      }
      g.fillStyle = "#ffffff";
      g.font = `900 ${H * 0.13}px ${SANS}`;
      fitText(g, F.name.toUpperCase(), W * 0.05 + ps + W * 0.04, H * 0.34, W * 0.9 - ps - W * 0.04);
      g.fillStyle = "#c8c4d0";
      g.font = `600 ${H * 0.07}px ${MONO}`;
      fitText(g, `RUNTIME ${F.runtime}`, W * 0.05 + ps + W * 0.04, H * 0.46);
      fitText(g, `zkSNARK #${F.snark}`, W * 0.05 + ps + W * 0.04, H * 0.55);
      // a show every (runtime + 2 min), the rooms a minute apart: the next one, counted down
      const cycle = total + 120;
      const now = Date.now() / 1000 + j * 60;
      const left = Math.ceil(cycle - (now % cycle));
      const at = new Date(Date.now() + left * 1000);
      g.fillStyle = "#2a2630";
      g.fillRect(W * 0.05, H * 0.66, W * 0.9, H * 0.26);
      g.fillStyle = left > cycle - total ? "#3ee08f" : "#ffd27a";
      g.font = `800 ${H * 0.075}px ${MONO}`;
      fitText(g, left > cycle - total ? "NOW SHOWING · LOOP" : `NEXT SCREENING ${n2(at.getHours())}:${n2(at.getMinutes())}`, W * 0.08, H * 0.75);
      g.fillStyle = "#ffffff";
      g.font = `800 ${H * 0.11}px ${MONO}`;
      fitText(g, `IN ${n2(Math.floor(left / 60))}:${n2(left % 60)}`, W * 0.08, H * 0.88);
    }, 1, 384);
    k.pick(f, board, `<b>${esc(F.name)}</b><span>screening board</span>`, () => filmInfo(film, `ZK CINEMA · Screen ${j + 1}`));

    // the audience: zkSNARKs in their seats, facing the screen
    for (let i = 0; i < 9; i++) {
      const r = Math.floor(hash(i, j, 5, 5) * ROWS),
        s = Math.floor(hash(i, j, 6, 5) * SEATS);
      const x = sx0 + 0.42 + s * ((sx1 - sx0 - 0.84) / (SEATS - 1));
      k.at(f, 0, NORTH, 0);
      void k
        .person(f, 1 + Math.floor(hash(i, j, 7, 5) * 9999), [x, rowZ(r) - 0.02], "Moviegoer", { sit: true, dy: tierY(r) + 0.42, face: new THREE.Vector3(0, 0, -1), scale: 0.8 })
        .then((p) => p?.sit(true, 0.42));
    }
    k.at(f, 0, NORTH, 0);
  }

  /** You (the walking camera) on level `floor`: the room you are in plays, the others stop. */
  update(dt: number, camera: THREE.Camera, floor: number) {
    this.seen = performance.now();
    const p = camera.position;
    const lz = p.z - NORTH;
    const inside = floor === 4 && Math.abs(p.y - LEVELS[4].y - 1.6) < 2.5 && lz < -CORR && lz > -D;
    for (const r of this.rooms) {
      const here = inside && p.x > r.x0 && p.x < r.x1;
      if (here) this.play(r);
      else this.pause(r, dt);
    }
  }

  /** Nobody in the cinema (another floor, or the mall left): stop everything. */
  idle(dt: number) {
    for (const r of this.rooms) this.pause(r, dt);
  }

  private play(r: Room) {
    r.away = 0;
    if (TOUCH && !r.tapped) return;
    if (!r.video) {
      const v = document.createElement("video");
      v.src = filmUrl(FILMS[r.film].video);
      v.loop = true;
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.setAttribute("playsinline", "");
      r.video = v;
      r.vtex = new THREE.VideoTexture(v);
      r.vtex.colorSpace = THREE.SRGBColorSpace;
      r.vtex.generateMipmaps = false;
      r.vtex.minFilter = THREE.LinearFilter;
    }
    if (!r.playing) {
      r.playing = true;
      void r.video.play().catch(() => {});
      window.dispatchEvent(new CustomEvent("zstreet:film", { detail: { el: r.video } }));
    }
    // the still stays up until the film has a frame to show
    if (r.video.readyState >= 2 && r.mat.map !== r.vtex) {
      r.mat.map = r.vtex;
      r.mat.color.setRGB(1, 1, 1);
    }
  }

  private pause(r: Room, dt: number) {
    if (r.playing) {
      r.playing = false;
      r.tapped = false;
      r.video?.pause();
      window.dispatchEvent(new CustomEvent("zstreet:film", { detail: { el: null } }));
    }
    if (!r.video) return;
    r.away += dt;
    // out for a while: give the decoder and the texture back
    if (r.away > 20) {
      r.mat.map = r.still;
      r.mat.color.setRGB(0.55, 0.55, 0.55);
      r.vtex?.dispose();
      window.dispatchEvent(new CustomEvent("zstreet:film-gone", { detail: { el: r.video } }));
      r.video.removeAttribute("src");
      r.video.load();
      r.video = null;
      r.vtex = null;
    }
  }

  /** For tests (?debug): each room's state. */
  get debug() {
    return this.rooms.map((r) => ({ film: FILMS[r.film].name, playing: r.playing, video: !!r.video, t: r.video ? Math.round(r.video.currentTime * 10) / 10 : null, ready: r.video?.readyState ?? 0, muted: r.video?.muted ?? null, showing: r.mat.map === r.vtex ? "film" : "still" }));
  }

  dispose() {
    if (this.watchdog) clearInterval(this.watchdog);
    for (const r of this.rooms) {
      r.away = 1e9;
      this.pause(r, 0);
    }
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
void FILM_SLOTS;
