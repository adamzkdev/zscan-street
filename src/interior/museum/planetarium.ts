import * as THREE from "three";
import { ZScan } from "../../data/zscan";
import type { Snark } from "../../scene/snark";
import { TOUCH } from "../../scene/quality";
import { C, shades, VoxelModel } from "../../scene/voxel/model";
import type { Collection } from "./data";
import { CORRIDOR, FEDOS_SNARK, LINKS, SAYS, type Work, WORKS, workImage, workPrints } from "./fedosart";
import { boxGeo, canvas, canvasTex, FACE, type MuseumKit } from "./kit";
import { SERIF } from "./parts";
import { dust, livingMaterial, membrane, Motes } from "./planetfx";
import { beams, DomeShow, ticker, workTexture } from "./planetshow";

/**
 * Floor 6, the FedosArt Planetarium: the artist behind zkSNARKs. Out of the lift, a dark corridor
 * (his two wide works either side) and a red pixel portal, his own zkSNARK #9593, into a rotunda
 * under a planetarium dome: a slowly turning night of violet and crimson nebulae, stars and his
 * four-pointed sparks, a skyline of citadels round its foot. His 31 other works hang round the
 * wall, each in its own light. In the middle, a star projector on its pedestal and rings of seats.
 * FedosArt himself (#9593) paints at an easel on the far
 * side, beside a black stele that says where to find him (Gumroad, Instagram, Patreon, PayPal,
 * prints on INPRNT). Every work: hover for its title, click for it and its print.
 *
 * And it moves (./planetshow.ts, ./planetfx.ts): the dome is a show, his works blooming across the
 * sky one after another in random order (a click sends one up), an LED ticker naming each, the
 * projector's beams and the room's lights taking its colour; coming through the portal (a swirling
 * membrane) the stars warp and the first work blooms; dust drifts through the room; the works on
 * the walls glint, and the one you
 * walk up to wakes (a sheen, its edges lit, motes rising out of it, a chime).
 */
const sound = (name: string) => window.dispatchEvent(new CustomEvent("zstreet:sound", { detail: { name } }));

const F = 6;
/** The corridor's half width and height; the rotunda's radius, centre, wall height. */
const VX = 3.2,
  VH = 5.2;
const R = 15,
  CZ = -22,
  HW = 5.5;
/** Where the corridor meets the rotunda's wall. */
const ZM = CZ + Math.sqrt(R * R - VX * VX);
const PORTAL_Z = ZM + 0.55;
const PIX = '"DotGothic16", monospace';

/** A k.panel drawn now, and again once the pixel font is in (until then canvas text falls back). */
function pixPanel(k: MuseumKit, f: number, w: number, h: number, widthM: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, o: { glow?: boolean; transparent?: boolean } = {}) {
  const m = k.panel(f, w, h, widthM, draw, o);
  whenPixel(() => {
    const t = (m.material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture;
    const c = t.image as HTMLCanvasElement;
    c.width = w;
    draw(c.getContext("2d")!, w, h);
    t.needsUpdate = true;
  });
  return m;
}
function whenPixel(fn: () => void) {
  if (typeof document !== "undefined" && document.fonts) void document.fonts.load('400 40px "DotGothic16"').then(fn, () => {});
}

export function planetarium(k: MuseumKit, data: Collection) {
  const f = F;
  const g = k.groups[f];

  // ---- materials ---------------------------------------------------------------------------------
  const plaster = new THREE.MeshStandardMaterial({
    color: "#16121f",
    roughness: 0.92,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: "#0b0a10",
    roughness: 0.22,
    metalness: 0.35,
    envMapIntensity: 0.6,
  });
  const iron = new THREE.MeshStandardMaterial({
    color: "#1b1820",
    roughness: 0.42,
    metalness: 0.75,
  });
  const darkGold = new THREE.MeshStandardMaterial({
    color: "#8a6a2a",
    roughness: 0.35,
    metalness: 0.9,
    emissive: "#120c04",
  });

  // ---- the corridor from the lift ----------------------------------------------------------------
  k.plane(f, floorMat, 2 * VX, -ZM, 0, 0, ZM / 2);
  k.plane(f, plaster, 2 * VX, -ZM, 0, VH, ZM / 2, Math.PI / 2);
  k.wall(f, plaster, -VX, 0, VX, 0, VH, 0.4);
  k.wall(f, plaster, -VX, 0, -VX, ZM - 0.2, VH, 0.4);
  k.wall(f, plaster, VX, 0, VX, ZM - 0.2, VH, 0.4);
  // skirting lit from below: a thin violet line along both walls
  const line = k.lit("#7f6cff", 1.2);
  for (const s of [-1, 1]) k.geo(f, line, boxGeo(0.03, 0.03, -ZM, s * (VX - 0.22), 0.06, ZM / 2));

  // the sign hung in the portal's mouth, on two rods from the ceiling
  const SIGN_Y = 3.62,
    SIGN_Z = PORTAL_Z + 0.4;
  const sign = pixPanel(
    k,
    f,
    1600,
    300,
    3.3,
    (c, w, h) => {
      c.fillStyle = "#0d0b13";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#e8585a";
      c.fillRect(0, h - 10, w, 10);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "#e8585a";
      c.font = `400 150px ${PIX}`;
      c.letterSpacing = "18px";
      c.fillText("FEDOSART", w / 2, h * 0.4);
      c.fillStyle = "#9a90c4";
      c.font = `400 50px ${PIX}`;
      c.letterSpacing = "26px";
      c.fillText("PLANETARIUM", w / 2, h * 0.82);
    },
    { glow: true, transparent: false },
  );
  sign.position.set(0, SIGN_Y, SIGN_Z);
  for (const s of [-1, 1]) k.geo(f, iron, new THREE.CylinderGeometry(0.012, 0.012, VH - SIGN_Y, 6).translate(s * 1.4, SIGN_Y + (VH - SIGN_Y) / 2, SIGN_Z - 0.02));
  k.geo(f, iron, boxGeo(3.36, 0.66, 0.04, 0, SIGN_Y - 0.33, SIGN_Z - 0.03));

  // the two wide works on the corridor walls
  const hung: {
    w: Work;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pw: number;
    ph: number;
  }[] = [];
  const shuttle = CORRIDOR[0],
    fill3 = CORRIDOR[1];
  hung.push({
    w: shuttle,
    x: -VX + 0.22,
    y: 2.2,
    z: -4.1,
    yaw: FACE.px,
    pw: 1.75,
    ph: (1.75 * shuttle.h) / shuttle.w,
  });
  hung.push({
    w: fill3,
    x: VX - 0.22,
    y: 2.2,
    z: -4.1,
    yaw: FACE.nx,
    pw: 2.6,
    ph: (2.6 * fill3.h) / fill3.w,
  });

  // ---- the portal: #9593's red oval, in pixels, a swirling membrane in it, lights running to it ---------
  const ring = portal(k, f);
  const memb = membrane(2.25, 2.5);
  memb.mesh.position.set(0, 1.65, PORTAL_Z);
  g.add(memb.mesh);
  const runway = runwayLights(k, f);

  // ---- the rotunda --------------------------------------------------------------------------------
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R + 0.3, 96), floorMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(0, 0, CZ);
  g.add(disc);
  // an astrolabe inlaid in the floor, faint gold lines
  const inlay = new THREE.Mesh(
    new THREE.CircleGeometry(R - 0.8, 96),
    new THREE.MeshBasicMaterial({
      map: astrolabe(),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      color: "#c9a25a",
    }),
  );
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.set(0, 0.006, CZ);
  inlay.raycast = () => {};
  g.add(inlay);
  // the wall: 96 facets, the corridor's mouth left open under a lintel
  const N = 96;
  const seg = (2 * Math.PI * R) / N + 0.04;
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2;
    const x = Math.sin(a) * R,
      z = CZ + Math.cos(a) * R;
    const mouth = Math.abs(x) < VX - 0.05 && z > CZ;
    const y0 = mouth ? VH : 0;
    k.geo(
      f,
      plaster,
      new THREE.BoxGeometry(seg, HW - y0, 0.5)
        .translate(0, y0 + (HW - y0) / 2, 0)
        .rotateY(a)
        .translate(x, 0, z),
    );
    if (!mouth) {
      const cx = Math.sin(a) * (R + 0.05),
        cz = CZ + Math.cos(a) * (R + 0.05);
      k.solid(f, cx - 0.36, cz - 0.36, cx + 0.36, cz + 0.36);
    }
  }
  // the cove at the foot of the dome: a dark ledge, a violet line of light along its lip
  const ledge = new THREE.Mesh(new THREE.RingGeometry(R - 0.7, R - 0.2, 128), iron);
  ledge.rotation.x = Math.PI / 2;
  ledge.position.set(0, HW - 0.12, CZ);
  g.add(ledge);
  const lipBase = new THREE.Color("#8a78ff").multiplyScalar(1.6);
  const lipMat = new THREE.MeshBasicMaterial({ color: lipBase.clone(), toneMapped: false });
  const lip = new THREE.Mesh(new THREE.TorusGeometry(R - 0.7, 0.035, 6, 160), lipMat);
  lip.rotation.x = Math.PI / 2;
  lip.position.set(0, HW - 0.12, CZ);
  g.add(lip);

  // ---- the dome --------------------------------------------------------------------------------------
  const all = [...WORKS, ...CORRIDOR];
  // in random order, a new one every round
  const order = [...all];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const show = new DomeShow(order);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R - 0.25, TOUCH ? 64 : 96, TOUCH ? 24 : 40, 0, Math.PI * 2, 0, Math.PI / 2), show.material);
  dome.position.set(0, HW - 0.15, CZ);
  dome.raycast = () => {};
  g.add(dome);
  // his sparks: four-pointed stars that turn with the sky and breathe
  const sparkTex = sparkTexture();
  const sparkMat = new THREE.MeshBasicMaterial({
    map: sparkTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    color: new THREE.Color(1.6, 1.55, 1.9),
  });
  const sparks: { m: THREE.Mesh; s: number; ph: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const az = (i / 14) * Math.PI * 2 + Math.sin(i * 7.1) * 0.3;
    const el = 0.35 + ((i * 0.37) % 1) * 0.85;
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sparkMat);
    m.position.copy(dir).multiplyScalar(R - 0.6);
    m.lookAt(0, 0, 0);
    m.raycast = () => {};
    const s = 0.7 + ((i * 0.61) % 1) * 1.5;
    m.scale.setScalar(s);
    dome.add(m);
    sparks.push({ m, s, ph: i * 1.7 });
  }
  // the citadels round the foot of the sky (they stay put while the sky turns)
  const skyline = new THREE.Mesh(
    new THREE.CylinderGeometry(R - 0.45, R - 0.45, 3.1, 128, 1, true),
    new THREE.MeshBasicMaterial({
      map: citadels(),
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  skyline.position.set(0, HW + 1.45, CZ);
  skyline.raycast = () => {};
  g.add(skyline);
  // the ticker under the cove: what is in the sky
  const tick = ticker(R - 0.32, 0.36);
  tick.mesh.position.set(0, HW - 0.52, CZ);
  g.add(tick.mesh);
  tick.draw("FedosArt Planetarium", "#e8585a");
  whenPixel(() => tick.draw(show.current?.title ?? "FedosArt Planetarium", "#e8585a"));
  // the projector's cones of light, onto the work up there
  const domeC = new THREE.Vector3(0, HW - 0.15, CZ);
  const aim = domeC.clone().addScaledVector(show.centre, R - 1.2);
  const cones = beams(new THREE.Vector3(0, 2.55, CZ), [aim, aim.clone().addScaledVector(show.right, 4.2), aim.clone().addScaledVector(show.right, -4.2)], show.color);
  g.add(cones.group);
  // a shooting star now and then
  const shoot = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 0.09),
    new THREE.MeshBasicMaterial({
      map: streakTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      color: new THREE.Color(2, 2, 2.2),
    }),
  );
  shoot.visible = false;
  shoot.raycast = () => {};
  g.add(shoot);
  let shootNext = 6,
    shootStart = -10;
  const shootFrom = new THREE.Vector3(),
    shootDir = new THREE.Vector3();
  const tmpA = new THREE.Vector3(),
    tmpB = new THREE.Vector3(),
    basis = new THREE.Matrix4(),
    centre = new THREE.Vector3(0, HW - 0.15, CZ);

  // ---- the works round the wall ----------------------------------------------------------------------
  const A0 = (22 * Math.PI) / 180,
    A1 = (338 * Math.PI) / 180;
  const PH = 1.72;
  WORKS.forEach((w, i) => {
    const a = A0 + ((A1 - A0) * i) / (WORKS.length - 1);
    const rr = R - 0.3;
    const pw = (PH * w.w) / w.h;
    hung.push({
      w,
      x: Math.sin(a) * rr,
      y: 2.25,
      z: CZ + Math.cos(a) * rr,
      yaw: a + Math.PI,
      pw,
      ph: PH,
    });
  });
  const pics = paintings(k, f, hung, iron, darkGold);
  const wake = pics.wake;
  const awake = hung.map(() => false);
  const tints = hung.map(() => new THREE.Color("#b8a8ff"));
  const motes = new Motes();
  g.add(motes.points);
  /** Motes out of work i (a burst, or a trickle), `lift` sending them up to the sky. */
  const fromWork = (i: number, count: number, lift = 0) => {
    const h = hung[i];
    const nrm = new THREE.Vector3(Math.sin(h.yaw), 0, Math.cos(h.yaw));
    const right = new THREE.Vector3(Math.cos(h.yaw), 0, -Math.sin(h.yaw));
    motes.emit(count, new THREE.Vector3(h.x, h.y, h.z).addScaledVector(nrm, 0.08), right, new THREE.Vector3(0, 1, 0), nrm, h.pw / 2, h.ph / 2, tints[i], lift);
  };
  /** A work sent up to the sky: from its wall copy a stream of motes, then it blooms up there. */
  const launch = (w: Work) => {
    const i = hung.findIndex((h) => h.w === w);
    if (i >= 0) fromWork(i, 70, 1.6);
    show.play(w);
  };
  k.pick(
    f,
    pics.mesh,
    (hit) => {
      const h = hung[pics.at(hit)];
      return h ? `<b>${h.w.title}</b><span>FedosArt</span>` : null;
    },
    (hit) => {
      const h = hung[pics.at(hit)];
      if (!h) return null;
      launch(h.w);
      return workInfo(h.w);
    },
  );
  // the dust of space
  const motesOfSpace = dust(new THREE.Vector3(0, 0, CZ), R - 1.5, 13);
  g.add(motesOfSpace.points);
  // each work in its own light: a wash down the wall, a pool on the floor
  for (const h of hung) {
    const nx = Math.sin(h.yaw),
      nz = Math.cos(h.yaw);
    k.wash(f, h.x - nx * 0.02, h.z - nz * 0.02, h.yaw, Math.max(1.8, h.pw + 0.9), 3.2, h.y + h.ph / 2 + 0.9, "#d8d0ff");
    k.pool(f, h.x + nx * 1.1, h.z + nz * 1.1, 1.15, "#9a8cff", 0.012, 0.7);
  }

  // ---- the centre: the star projector, the seats ------------------------------------------------------
  const proj = projector(k, f);
  k.solid(f, -0.9, CZ - 0.9, 0.9, CZ + 0.9);
  const seat = (len: number) => () => planetSeat(len);
  /** Seats' centres and the way they face (toward the projector). */
  const seats: [number, number, number][] = [];
  // two rings, a gap between every two seats: aisles to the portal and to the artist
  for (const [rr, n, len] of [
    [5.2, 8, 2.6],
    [8.0, 12, 2.8],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      // the outer ring opens on the north: the artist's corner
      if (rr > 6 && Math.abs(a - Math.PI) < 0.5) continue;
      seats.push([Math.sin(a) * (rr - 0.12), CZ + Math.cos(a) * (rr - 0.12), a]);
      const x = Math.sin(a) * rr,
        z = CZ + Math.cos(a) * rr;
      k.vox(f, `pseat${len}`, seat(len), x, 0, z, a + Math.PI, 0.5);
      // two squares down its length for the walker
      const tx = Math.cos(a),
        tz = -Math.sin(a);
      for (const o of [-len * 0.28, len * 0.28]) k.solid(f, x + tx * o - 0.45, z + tz * o - 0.45, x + tx * o + 0.45, z + tz * o + 0.45);
    }
  }

  // ---- FedosArt at his easel, and the stele: where to find him -------------------------------------------
  const EX = 2.2,
    EZ = CZ - 10.6;
  const easelYaw = Math.PI * 0.2;
  easel(
    k,
    f,
    EX,
    EZ,
    easelYaw,
    WORKS.find((w) => w.slug === "stellar-knight")!,
  );
  // he stands at the canvas's right, a little in front, turned three-quarters to it
  const ef = [Math.sin(easelYaw), Math.cos(easelYaw)],
    er = [Math.cos(easelYaw), -Math.sin(easelYaw)];
  const AX = EX + er[0] * 0.95 + ef[0] * 0.7,
    AZ = EZ + er[1] * 0.95 + ef[1] * 0.7;
  k.light(f, EX + 0.6, 4.2, EZ + 1.6, "#ffd8b0", 16, 9);
  k.pool(f, AX, AZ, 2.2, "#ffd0a0", 0.012, 0.9);

  const SX = -2.6,
    SZ = CZ - 11.4;
  const plaques = stele(k, f, SX, SZ);
  plaques.forEach((m, i) => {
    const l = LINKS[i];
    k.pick(f, m, `<b>${l.name}</b><span>${l.line}</span>`, () => ({
      eyebrow: "FedosArt",
      title: l.name.charAt(0) + l.name.slice(1).toLowerCase(),
      image: ZScan.zkSnarkImage(FEDOS_SNARK),
      body: `<p>${l.line}</p>`,
      link: {
        href: l.href,
        label: l.href.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, ""),
      },
    }));
  });
  k.light(f, SX + 1.6, 3.6, SZ + 2.6, "#c4b8ff", 8, 7);

  const artistInfo = () => ({
    eyebrow: "The artist behind zkSNARKs",
    title: "FedosArt",
    image: ZScan.zkSnarkImage(FEDOS_SNARK),
    tag: [`zkSNARKs #${FEDOS_SNARK}`, "info"] as [string, "info"],
    stats: [["Works here", String(WORKS.length + CORRIDOR.length)]] as [string, string][],
    body: `<dl class="kvlist">${LINKS.map((l) => `<div><dt>${l.name.charAt(0) + l.name.slice(1).toLowerCase()}</dt><dd><a href="${l.href}" target="_blank" rel="noopener">${l.line} ↗</a></dd></div>`).join("")}</dl>`,
    link: { href: LINKS[0].href, label: "Gumroad" },
  });
  let artist: Snark | null = null;
  const nameTag = nameSprite();
  void k
    .person(f, FEDOS_SNARK, [AX, AZ], {
      face: [EX + ef[0] * 0.1, EZ + ef[1] * 0.1],
    })
    .then((s) => {
      if (!s) return;
      artist = s;
      s.role = "Artist";
      nameTag.position.set(0, 2.42, 0);
      s.root.add(nameTag);
      // a hit box round him, for hover and click
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1, 2.3, 1), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, 1.15, 0);
      s.root.add(hit);
      k.pick(f, hit, "<b>FedosArt</b><span>the artist behind zkSNARKs</span>", artistInfo);
    });
  // now and then he turns from the canvas to whoever came, and says a line of his own
  let ft = 0,
    nextLine = 7,
    said = 0,
    talking = 0;
  const toEasel = new THREE.Vector3(EX + ef[0] * 0.1 - AX, 0, EZ + ef[1] * 0.1 - AZ).normalize();

  // ---- visitors -----------------------------------------------------------------------------------
  const crowd: Snark[] = [];
  let n = 0;
  const id = () => k.visitor(6000 + n++);
  // on the seats, looking at the sky (a few to a seat, never in the aisles)
  for (const [si, off] of [
    [1, -0.5],
    [2, 0.4],
    [6, 0],
    [9, -0.6],
    [9, 0.5],
    [12, 0],
    [14, 0.3],
    [17, -0.4],
  ] as const) {
    const [x, z, a] = seats[si];
    void k
      .person(f, id(), [x + Math.cos(a) * off, z - Math.sin(a) * off], {
        perch: 0.55,
        face: [0, CZ],
      })
      .then((s) => s && crowd.push(s));
  }
  for (const i of [3, 9, 21, 25, 28]) {
    const h = hung[2 + i];
    const nx = Math.sin(h.yaw),
      nz = Math.cos(h.yaw);
    void k.person(f, id(), [h.x + nx * 2.1, h.z + nz * 2.1], {
      face: [h.x, h.z],
      phone: i === 9 || i === 25,
      selfie: i === 21,
    });
  }

  // ---- lights (six a floor) ------------------------------------------------------------------------
  k.light(f, 0, 4.4, -3.6, "#b4a8ff", 9, 9);
  const fills = [k.light(f, -9, 4.6, CZ + 3, "#5a50c8", 12, 18), k.light(f, 9, 4.6, CZ - 3, "#5a50c8", 12, 18)];
  const fillBase = new THREE.Color("#5a50c8");

  // ---- the show's cues: the ticker, the room's colour, the people ----------------------------------------
  show.onWork = (w) => {
    tick.draw(w.title, `#${show.color.getHexString()}`);
    sound("show");
    (artist as Snark | null)?.emote("star", 3);
    for (const s of crowd) if (Math.random() < 0.4) s.emote(Math.random() < 0.5 ? "heart" : "star", 2.5 + Math.random() * 2);
  };
  show.onWarp = () => {
    sound("warp");
    for (const s of crowd) s.emote("!", 2);
  };
  /** Arriving on the floor (the ticks run only here): the sky waits for the portal, 25 s at most. */
  let lastT = -10,
    crossed = false,
    prevZ = 0,
    pulse = 0,
    domeYaw = 0,
    trickle = 0;

  k.ticks[f].push((dt, t) => {
    if (t - lastT > 1) {
      show.reset(25);
      crossed = false;
      prevZ = k.cam.z;
    }
    lastT = t;
    // through the portal: the warp, then the first work
    const cz = k.cam.z;
    if (!crossed && prevZ > PORTAL_Z && cz <= PORTAL_Z) {
      crossed = true;
      show.reset(1.8);
      show.warp();
      pulse = 1;
    }
    prevZ = cz;
    const warp = show.material.uniforms.uWarp.value as number;
    domeYaw += dt * (0.008 + warp * 0.45);
    dome.rotation.y = domeYaw;
    show.update(dt, t, domeYaw);
    pulse *= Math.exp(-dt * 1.4);
    memb.material.uniforms.uTime.value = t;
    memb.material.uniforms.uPulse.value = pulse + Math.max(0, 1 - Math.abs(cz - PORTAL_Z) / 2.5) * 0.12;
    ring(t, pulse);
    runway(t);
    // the room in the work's colour
    const rv = show.reveal;
    cones.material.uniforms.uK.value = rv;
    tick.tex.offset.x = t * 0.012;
    inlay.rotation.z = t * 0.012;
    (inlay.material as THREE.MeshBasicMaterial).opacity = 0.42 + 0.3 * rv;
    lipMat.color.copy(lipBase).lerp(show.color, rv * 0.7);
    for (const l of fills) if (l) l.color.copy(fillBase).lerp(show.color, rv * 0.75);
    motesOfSpace.update(t, warp);
    // the works on the walls: the one you stand at wakes; the one in the sky glows
    for (let i = 0; i < hung.length; i++) {
      const h = hung[i];
      const d = Math.hypot(k.cam.x - h.x, k.cam.z - h.z);
      const near = d < 3.2;
      const target = Math.max(near ? 1 : 0, show.current === h.w && rv > 0.05 ? 0.7 * rv : 0);
      wake[i] += (target - wake[i]) * Math.min(1, dt * 2.2);
      if (near && !awake[i]) {
        awake[i] = true;
        void workTexture(h.w).then((x) => tints[i].copy(x.color));
        fromWork(i, 40);
        sound("wake");
      } else if (d > 4) awake[i] = false;
      if (near && wake[i] > 0.5) {
        trickle += dt;
        if (trickle > 0.07) {
          trickle = 0;
          fromWork(i, 1);
        }
      }
    }
    motes.update(dt);
    pics.time.value = t;
    for (const s of sparks) s.m.scale.setScalar(s.s * (0.75 + 0.35 * Math.sin(t * 0.9 + s.ph) ** 2));
    proj.rotation.y = t * 0.05;

    // a shooting star: from a point high on the dome, down and across in under a second
    if (t > shootNext) {
      const az = Math.random() * Math.PI * 2,
        el = 0.6 + Math.random() * 0.5;
      shootFrom.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
      const side = Math.random() < 0.5 ? 1 : -1;
      shootDir.set(Math.cos(az) * side, -0.55, -Math.sin(az) * side);
      shootStart = t;
      shootNext = t + 8 + Math.random() * 9;
    }
    const life = (t - shootStart) / 0.9;
    shoot.visible = life >= 0 && life <= 1;
    if (shoot.visible) {
      tmpA
        .copy(shootFrom)
        .addScaledVector(shootDir, life * 0.45)
        .normalize();
      tmpB
        .copy(shootFrom)
        .addScaledVector(shootDir, life * 0.45 + 0.01)
        .normalize()
        .sub(tmpA)
        .normalize();
      shoot.position
        .copy(tmpA)
        .multiplyScalar(R - 0.9)
        .add(centre);
      const zAxis = tmpA.clone().negate();
      const yAxis = new THREE.Vector3().crossVectors(zAxis, tmpB).normalize();
      const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
      shoot.quaternion.setFromRotationMatrix(basis.makeBasis(xAxis, yAxis, zAxis));
      (shoot.material as THREE.MeshBasicMaterial).opacity = Math.sin(life * Math.PI);
    }
    if (k.current !== f) return;
    // the artist
    ft += dt;
    const s = artist as Snark | null;
    if (!s) return;
    if (talking && ft > talking) {
      talking = 0;
      s.faceDir = toEasel.clone();
      nameTag.visible = true;
    }
    const dx = k.cam.x - s.root.position.x,
      dz = k.cam.z - s.root.position.z;
    if (!talking && ft > nextLine && Math.hypot(dx, dz) < 9) {
      s.faceDir = new THREE.Vector3(dx, 0, dz).normalize();
      nameTag.visible = false;
      s.say(SAYS[said++ % SAYS.length], 5.5);
      talking = ft + 6;
      nextLine = ft + 16 + Math.random() * 10;
    }
  });

  k.finish(f);
  return { spawn: new THREE.Vector3(0, 0, -2.6), yaw: 0 };
}

/** The panel for a work: the image, its print. */
function workInfo(w: Work) {
  return {
    eyebrow: "FedosArt Planetarium",
    title: w.title,
    image: workImage(w),
    tag: ["To the sky", "info"] as [string, "info"],
    body: `<p><img src="${workImage(w)}" alt="" style="width:100%;height:auto;display:block"></p>`,
    link: { href: workPrints(w), label: "Prints on INPRNT" },
  };
}

// ---- pieces ----------------------------------------------------------------------------------------

/** Little lights let into the corridor floor along both walls, a pulse running in them to the portal. */
function runwayLights(k: MuseumKit, f: number) {
  const zs: number[] = [];
  for (let z = -0.9; z > PORTAL_Z + 0.5; z -= 0.55) zs.push(z);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.02, 0.07), new THREE.MeshBasicMaterial({ toneMapped: false }), zs.length * 2);
  const m = new THREE.Matrix4();
  zs.forEach((z, i) => {
    for (const s of [0, 1]) im.setMatrixAt(i * 2 + s, m.makeTranslation((s ? 1 : -1) * (VX - 0.5), 0.01, z));
  });
  const base = new THREE.Color("#3a1418"),
    hot = new THREE.Color("#ff5060").multiplyScalar(1.6),
    c = new THREE.Color();
  im.raycast = () => {};
  k.groups[f].add(im);
  return (t: number) => {
    zs.forEach((z, i) => {
      const k2 = Math.pow(0.5 + 0.5 * Math.sin(z * 2.2 + t * 5), 10);
      c.copy(base).lerp(hot, k2);
      im.setColorAt(i * 2, c);
      im.setColorAt(i * 2 + 1, c);
    });
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  };
}

/**
 * The paintings: one merged mesh over one atlas (every work in a cell, its own proportions kept),
 * an iron frame with a gilt fillet round each, and a cartel under it. `at(hit)` is the work's index.
 */
function paintings(
  k: MuseumKit,
  f: number,
  hung: {
    w: Work;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pw: number;
    ph: number;
  }[],
  iron: THREE.Material,
  gold: THREE.Material,
) {
  const COLS = 7,
    ROWS = Math.ceil(hung.length / COLS);
  const CW = TOUCH ? 192 : 384,
    CH = TOUCH ? 256 : 512;
  const [cv, cg] = canvas(COLS * CW, ROWS * CH);
  cg.fillStyle = "#0d0b12";
  cg.fillRect(0, 0, cv.width, cv.height);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // where each work sits in its cell ("contain", a hair inside)
  const rects = hung.map((h, i) => {
    const c = i % COLS,
      r = Math.floor(i / COLS);
    const k2 = Math.min((CW - 4) / h.w.w, (CH - 4) / h.w.h);
    const dw = h.w.w * k2,
      dh = h.w.h * k2;
    return { dx: c * CW + (CW - dw) / 2, dy: r * CH + (CH - dh) / 2, dw, dh };
  });
  const W = cv.width,
    H = cv.height;
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const labels = new THREE.CanvasTexture(canvas(4 * 512, Math.ceil(hung.length / 4) * 128)[0]);
  labels.colorSpace = THREE.SRGBColorSpace;
  labels.anisotropy = 8;
  const lc = (labels.image as HTMLCanvasElement).getContext("2d")!;
  const lpos: number[] = [],
    luv: number[] = [],
    lidx: number[] = [];
  const LW = (labels.image as HTMLCanvasElement).width,
    LH = (labels.image as HTMLCanvasElement).height;
  const quad = (
    P: number[],
    U: number[],
    I: number[],
    h: { x: number; z: number; yaw: number },
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    out: number,
    u0: number,
    u1: number,
    v0: number,
    v1: number,
  ) => {
    const nx = Math.sin(h.yaw),
      nz = Math.cos(h.yaw);
    const rx = Math.cos(h.yaw),
      rz = -Math.sin(h.yaw);
    const b = P.length / 3;
    for (const [lx, ly, u, v] of [
      [x0, y0, u0, v0],
      [x1, y0, u1, v0],
      [x1, y1, u1, v1],
      [x0, y1, u0, v1],
    ]) {
      P.push(h.x + rx * lx + nx * out, ly, h.z + rz * lx + nz * out);
      U.push(u, v);
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  // which work each vertex belongs to, and where on it (for the living material)
  const aIdx: number[] = [],
    aLuv: number[] = [];
  hung.forEach((h, i) => {
    const r = rects[i];
    quad(pos, uv, idx, h, -h.pw / 2, h.pw / 2, h.y - h.ph / 2, h.y + h.ph / 2, 0.07, r.dx / W, (r.dx + r.dw) / W, 1 - (r.dy + r.dh) / H, 1 - r.dy / H);
    aIdx.push(i, i, i, i);
    aLuv.push(0, 0, 1, 0, 1, 1, 0, 1);
    // the frame: iron, a gilt fillet inside it, a backing board
    const fw = 0.07;
    const rot = new THREE.Matrix4().makeRotationY(h.yaw).setPosition(h.x, 0, h.z);
    const add = (mat: THREE.Material, w: number, hh: number, d: number, x: number, y: number, z: number) => k.geo(f, mat, new THREE.BoxGeometry(w, hh, d).translate(x, y, z).applyMatrix4(rot));
    add(iron, h.pw + 2 * fw, fw, 0.09, 0, h.y + h.ph / 2 + fw / 2, 0.045);
    add(iron, h.pw + 2 * fw, fw, 0.09, 0, h.y - h.ph / 2 - fw / 2, 0.045);
    add(iron, fw, h.ph, 0.09, -h.pw / 2 - fw / 2, h.y, 0.045);
    add(iron, fw, h.ph, 0.09, h.pw / 2 + fw / 2, h.y, 0.045);
    add(gold, h.pw + 0.03, 0.015, 0.1, 0, h.y + h.ph / 2 + 0.0075, 0.05);
    add(gold, h.pw + 0.03, 0.015, 0.1, 0, h.y - h.ph / 2 - 0.0075, 0.05);
    add(gold, 0.015, h.ph, 0.1, -h.pw / 2 - 0.0075, h.y, 0.05);
    add(gold, 0.015, h.ph, 0.1, h.pw / 2 + 0.0075, h.y, 0.05);
    add(iron, h.pw, h.ph, 0.04, 0, h.y, 0.02);
    // the cartel (drawn below, once all are placed)
    const c = i % 4,
      rr = Math.floor(i / 4);
    const lw = 0.52,
      lh = lw / 4,
      ly = h.y - h.ph / 2 - 0.2;
    quad(lpos, luv, lidx, h, -lw / 2, lw / 2, ly - lh, ly, 0.03, (c * 512) / LW, ((c + 1) * 512) / LW, 1 - ((rr + 1) * 128) / LH, 1 - (rr * 128) / LH);
  });
  const cartels = () => {
    hung.forEach((h, i) => {
      lc.save();
      lc.translate((i % 4) * 512, Math.floor(i / 4) * 128);
      lc.fillStyle = "#14111c";
      lc.fillRect(0, 0, 512, 128);
      lc.fillStyle = "#e8585a";
      lc.fillRect(0, 0, 6, 128);
      lc.fillStyle = "#ece6f6";
      lc.textBaseline = "alphabetic";
      let size = 40;
      lc.font = `italic 500 ${size}px ${SERIF}`;
      while (lc.measureText(h.w.title).width > 470 && size > 20) lc.font = `italic 500 ${--size}px ${SERIF}`;
      lc.fillText(h.w.title, 24, 58);
      lc.fillStyle = "#9a90c4";
      lc.font = `400 26px ${PIX}`;
      lc.fillText("FEDOSART", 24, 100);
      lc.restore();
    });
    labels.needsUpdate = true;
  };
  cartels();
  whenPixel(cartels);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("aIdx", new THREE.Float32BufferAttribute(aIdx, 1));
  geo.setAttribute("aLuv", new THREE.Float32BufferAttribute(aLuv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const living = livingMaterial(tex, hung.length);
  const mesh = new THREE.Mesh(geo, living.material);
  k.groups[f].add(mesh);
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute("position", new THREE.Float32BufferAttribute(lpos, 3));
  lgeo.setAttribute("uv", new THREE.Float32BufferAttribute(luv, 2));
  lgeo.setIndex(lidx);
  lgeo.computeBoundingSphere();
  const lmesh = new THREE.Mesh(lgeo, new THREE.MeshBasicMaterial({ map: labels, color: "#d8d2e4" }));
  lmesh.raycast = () => {};
  k.groups[f].add(lmesh);
  // the images, once the floor is first visited, a few at a time; the texture goes up every few
  void (async () => {
    await k.whenVisited(f);
    let done = 0;
    const load = (h: (typeof hung)[number], i: number) =>
      new Promise<void>((res) => {
        const im = new Image();
        im.decoding = "async";
        im.onload = () => {
          const r = rects[i];
          cg.drawImage(im, r.dx, r.dy, r.dw, r.dh);
          if (++done % 6 === 0 || done === hung.length) tex.needsUpdate = true;
          res();
        };
        im.onerror = () => res();
        im.src = workImage(h.w);
      });
    for (let i = 0; i < hung.length; i += 4) await Promise.all(hung.slice(i, i + 4).map((h, j) => load(h, i + j)));
    tex.needsUpdate = true;
  })();
  return {
    mesh,
    at: (hit: THREE.Intersection) => (hit.faceIndex != null ? Math.floor(hit.faceIndex / 2) : -1),
    /** Each work's wake (0…1), read by the material; the clock too. */
    wake: living.uniforms.uWake.value,
    time: living.uniforms.uTime,
  };
}

/** #9593's red oval as a pixel portal over the corridor, its dark trail streaming off to the left. */
function portal(k: MuseumKit, f: number) {
  const P = 0.2;
  const rx = 2.75,
    ry = 3.05,
    cy = 1.65;
  const cells: [number, number, number, THREE.Color][] = [];
  const light = new THREE.Color("#e8585a"),
    deep = new THREE.Color("#c8343c"),
    trail = new THREE.Color("#2e1a1c");
  for (let x = -rx - 0.4; x <= rx + 0.4; x += P)
    for (let y = P / 2; y <= cy + ry + 0.2; y += P) {
      const d = Math.hypot(x / rx, (y - cy) / ry);
      if (d > 0.9 && d <= 1.0) cells.push([x, y, 0, light]);
      else if (d > 0.8 && d <= 0.9) cells.push([x, y, -0.05, deep]);
    }
  // the trail: short dark dashes off the left of the oval, at random heights
  for (let i = 0; i < 26; i++) {
    const y = P / 2 + Math.floor(((i * 0.618) % 1) * 22) * P;
    if (y > cy + ry * 0.8) continue;
    const xe = -Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)) * rx;
    const len = 1 + Math.floor(((i * 0.377) % 1) * 3);
    for (let j = 1; j <= len; j++) if (xe - j * P > -VX + 0.25) cells.push([xe - j * P - P * Math.floor(((i * 0.29) % 1) * 2), y, -0.1, trail]);
  }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(P, P, 0.26), new THREE.MeshBasicMaterial({ toneMapped: false }), cells.length);
  const m = new THREE.Matrix4();
  cells.forEach(([x, y, z, c], i) => {
    im.setMatrixAt(i, m.makeTranslation(x, y, PORTAL_Z + z));
    im.setColorAt(i, c);
  });
  im.computeBoundingSphere();
  im.raycast = () => {};
  k.groups[f].add(im);
  // its feet against the corridor walls
  for (const s of [-1, 1]) k.solid(f, s > 0 ? 2.1 : -VX, PORTAL_Z - 0.2, s > 0 ? VX : -2.1, PORTAL_Z + 0.2);
  k.pool(f, 0, PORTAL_Z - 0.6, 2.6, "#ff4050", 0.012, 0.8);
  // alive: a wave of light running round the ring, everything flaring when someone comes through
  const ang = cells.map(([x, y]) => Math.atan2(y - cy, x));
  const c = new THREE.Color();
  return (t: number, pulse: number) => {
    cells.forEach(([, , , base], i) => {
      if (base === trail) return;
      const w = Math.pow(0.5 + 0.5 * Math.sin(ang[i] * 2 - t * 2.2), 8);
      c.copy(base).multiplyScalar(1 + w * 0.9 + pulse * 1.4);
      im.setColorAt(i, c);
    });
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  };
}

/** A star projector: pedestal, fork and the twin starballs studded with lenses. Turns (see the tick). */
function projector(k: MuseumKit, f: number) {
  const grp = new THREE.Group();
  grp.position.set(0, 0, CZ);
  k.groups[f].add(grp);
  const metal = new THREE.MeshStandardMaterial({
    color: "#26252d",
    roughness: 0.3,
    metalness: 0.9,
    envMapIntensity: 1.2,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: "#9a7a3a",
    roughness: 0.35,
    metalness: 0.9,
  });
  // the pedestal stays still
  k.geo(f, metal, new THREE.CylinderGeometry(0.75, 0.85, 0.35, 32).translate(0, 0.175, CZ));
  k.geo(f, brass, new THREE.TorusGeometry(0.76, 0.03, 6, 48).rotateX(Math.PI / 2).translate(0, 0.35, CZ));
  k.geo(f, metal, new THREE.CylinderGeometry(0.22, 0.32, 1.5, 24).translate(0, 1.1, CZ));
  const head = new THREE.Group();
  head.position.set(0, 1.95, 0);
  head.rotation.z = 0.32;
  grp.add(head);
  const fork = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 32, Math.PI), metal);
  fork.rotation.z = Math.PI;
  head.add(fork);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.6, 16).rotateZ(Math.PI / 2), metal);
  head.add(axle);
  const lensM = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.6, 1.5, 2.2),
    toneMapped: false,
  });
  const lensG = new THREE.CylinderGeometry(0.045, 0.045, 0.06, 8).rotateX(Math.PI / 2);
  const lenses = new THREE.InstancedMesh(lensG, lensM, 2 * 38);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 0, 1);
  let li = 0;
  for (const s of [-1, 1]) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), metal);
    ball.position.set(s * 1.3, 0, 0);
    head.add(ball);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 32), brass);
    band.position.copy(ball.position);
    band.rotation.y = Math.PI / 2;
    head.add(band);
    // lenses spread over the ball (a Fibonacci sphere), the half facing outward
    for (let i = 0; i < 38; i++) {
      const y = 1 - (i / 37) * 2,
        r = Math.sqrt(1 - y * y),
        a = i * 2.39996;
      const n = new THREE.Vector3(Math.cos(a) * r * 0.6 + s * 0.8, y, Math.sin(a) * r).normalize();
      q.setFromUnitVectors(up, n);
      m.compose(n.clone().multiplyScalar(0.51).add(ball.position), q, new THREE.Vector3(1, 1, 1));
      lenses.setMatrixAt(li++, m);
    }
  }
  lenses.count = li;
  lenses.raycast = () => {};
  head.add(lenses);
  return grp;
}

/** A planetarium seat, a long reclined bench (12 voxels a metre, placed at k = 0.5). */
function planetSeat(len: number) {
  const L = Math.round(len * 12);
  const v = new VoxelModel(L, 13, 10);
  const steel = C("#2a2832");
  const velvet = shades(["#2a1f4a", "#251b42", "#2f2352"], 1, 21);
  for (const x of [1, L - 3]) v.box(x, 0, 2, x + 2, 4, 8, steel);
  v.box(0, 4, 1, L, 5, 9, steel);
  v.box(0, 5, 1, L, 7, 9, velvet);
  // the backrest, leaning back toward −z
  for (let y = 7; y < 13; y++) {
    const z = Math.round(1 - (y - 7) * 0.2);
    v.box(0, y, Math.max(0, z), L, y + 1, Math.max(0, z) + 2, velvet);
  }
  return v;
}

/** An easel facing `yaw`, a work on it (loaded with the floor). */
function easel(k: MuseumKit, f: number, x: number, z: number, yaw: number, w: Work) {
  const rot = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
  const add = (geo: THREE.BufferGeometry) => k.geo(f, k.oak, geo.applyMatrix4(rot));
  // two front legs splayed, a back leg, the ledge and the top clamp
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 2.3, 0.05).rotateZ(s * 0.09).translate(s * 0.42, 1.12, 0));
  add(new THREE.BoxGeometry(0.05, 2.2, 0.05).rotateX(-0.32).translate(0, 1.05, -0.38));
  add(new THREE.BoxGeometry(1.0, 0.05, 0.12).translate(0, 0.86, 0.05));
  add(new THREE.BoxGeometry(0.16, 0.05, 0.1).translate(0, 2.08, 0.05));
  const ph = 1.2,
    pw = (ph * w.w) / w.h;
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex, color: "#3a3540" }));
  pic.position.set(0, 0.89 + ph / 2, 0.1);
  pic.applyMatrix4(rot);
  k.groups[f].add(pic);
  k.geo(f, k.white, new THREE.BoxGeometry(pw + 0.02, ph + 0.02, 0.03).translate(0, 0.89 + ph / 2, 0.08).applyMatrix4(rot));
  void k.whenVisited(f).then(() => {
    const im = new Image();
    im.onload = () => {
      tex.image = im;
      tex.needsUpdate = true;
      (pic.material as THREE.MeshBasicMaterial).color.set("#e8e4ee");
    };
    im.src = workImage(w);
  });
  // a palette and a jar of brushes on a stool beside it
  const sx = -0.85;
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16).translate(sx, 0.62, 0.15));
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.62, 0.04).translate(sx + s * 0.13, 0.31, 0.15));
  k.geo(f, k.black, new THREE.CylinderGeometry(0.06, 0.05, 0.16, 12).translate(sx + 0.05, 0.72, 0.1).applyMatrix4(rot));
  for (let i = 0; i < 4; i++)
    k.geo(
      f,
      k.oak,
      new THREE.CylinderGeometry(0.008, 0.008, 0.3, 5)
        .rotateZ((i - 1.5) * 0.12)
        .translate(sx + 0.05 + (i - 1.5) * 0.015, 0.86, 0.1)
        .applyMatrix4(rot),
    );
  const pal = canvasTex(128, 128, (c) => {
    c.fillStyle = "#c8a878";
    c.beginPath();
    c.ellipse(64, 64, 60, 46, 0, 0, Math.PI * 2);
    c.fill();
    for (const [px, py, col] of [
      [34, 50, "#6a5cff"],
      [54, 34, "#e8585a"],
      [80, 36, "#f2f0ff"],
      [96, 58, "#1a1626"],
      [40, 78, "#b8a8ff"],
    ] as const) {
      c.fillStyle = col;
      c.beginPath();
      c.arc(px, py, 9, 0, Math.PI * 2);
      c.fill();
    }
  });
  const palette = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 20),
    new THREE.MeshStandardMaterial({
      map: pal,
      transparent: true,
      roughness: 0.6,
    }),
  );
  palette.rotation.x = -Math.PI / 2;
  palette.position.set(sx - 0.05, 0.645, 0.2);
  palette.applyMatrix4(rot);
  k.groups[f].add(palette);
  k.solid(f, x - 0.75, z - 0.75, x + 0.75, z + 0.75);
}

/** The stele: a black slab with the five ways to him, each its own plaque (returned, in LINKS' order). */
function stele(k: MuseumKit, f: number, x: number, z: number) {
  const obs = new THREE.MeshStandardMaterial({
    color: "#0c0a12",
    roughness: 0.55,
    metalness: 0.25,
    envMapIntensity: 0.7,
  });
  k.geo(f, obs, boxGeo(1.7, 3.0, 0.32, x, 0, z));
  k.geo(f, obs, boxGeo(2.0, 0.18, 0.5, x, 0, z));
  k.solid(f, x - 1.0, z - 0.3, x + 1.0, z + 0.3);
  const head = pixPanel(
    k,
    f,
    800,
    220,
    1.5,
    (c, w) => {
      c.fillStyle = "#0c0a12";
      c.fillRect(0, 0, w, 220);
      c.textAlign = "center";
      c.fillStyle = "#e8585a";
      c.font = `400 92px ${PIX}`;
      c.letterSpacing = "8px";
      c.fillText("FEDOSART", w / 2, 110);
      c.fillStyle = "#9a90c4";
      c.font = `400 40px ${PIX}`;
      c.letterSpacing = "6px";
      c.fillText("FIND HIM", w / 2, 180);
    },
    { glow: true, transparent: false },
  );
  head.position.set(x, 2.55, z + 0.17);
  return LINKS.map((l, i) => {
    const m = pixPanel(
      k,
      f,
      640,
      150,
      1.4,
      (c, w, h) => {
        c.fillStyle = "#15121e";
        c.fillRect(0, 0, w, h);
        c.fillStyle = l.color;
        c.fillRect(0, 0, 10, h);
        c.strokeStyle = "rgba(255,255,255,0.08)";
        c.lineWidth = 2;
        c.strokeRect(1, 1, w - 2, h - 2);
        c.textBaseline = "alphabetic";
        c.fillStyle = "#f2eefa";
        c.font = `400 54px ${PIX}`;
        c.letterSpacing = "4px";
        c.fillText(l.name, 40, 70);
        c.fillStyle = "#a69cc8";
        c.font = `400 34px ${PIX}`;
        c.letterSpacing = "1px";
        c.fillText(l.line, 40, 120);
        c.fillStyle = l.color;
        c.font = `400 54px ${PIX}`;
        c.textAlign = "right";
        c.fillText("↗", w - 30, 96);
      },
      { glow: true, transparent: false },
    );
    m.position.set(x, 2.02 - i * 0.38, z + 0.17);
    return m;
  });
}

function drawName(c: CanvasRenderingContext2D, w: number, h: number) {
  c.fillStyle = "rgba(12,10,18,0.82)";
  c.fillRect(40, 18, w - 80, h - 36);
  c.fillStyle = "#e8585a";
  c.fillRect(40, h - 22, w - 80, 4);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#ffffff";
  c.font = `400 60px ${PIX}`;
  c.letterSpacing = "4px";
  c.fillText("FedosArt", w / 2, h / 2 - 2);
}

/** "FedosArt" over his head, in the city's pixel letters. */
export function nameSprite() {
  const t = canvasTex(512, 128, drawName, { repeat: false });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, toneMapped: false }));
  s.scale.set(1.15, 0.29, 1);
  whenPixel(() => {
    const c = t.image as HTMLCanvasElement;
    c.width = 512;
    drawName(c.getContext("2d")!, 512, 128);
    t.needsUpdate = true;
  });
  s.raycast = () => {};
  return s;
}

// ---- textures --------------------------------------------------------------------------------------

/** A four-pointed spark, his signature light. */
export function sparkTexture() {
  return canvasTex(
    256,
    256,
    (c, w) => {
      const m = w / 2;
      const r = c.createRadialGradient(m, m, 0, m, m, m * 0.45);
      r.addColorStop(0, "rgba(255,255,255,1)");
      r.addColorStop(0.2, "rgba(230,225,255,0.55)");
      r.addColorStop(1, "rgba(200,190,255,0)");
      c.fillStyle = r;
      c.fillRect(0, 0, w, w);
      c.fillStyle = "rgba(245,240,255,0.95)";
      for (const rot of [0, Math.PI / 2]) {
        c.save();
        c.translate(m, m);
        c.rotate(rot);
        c.beginPath();
        c.moveTo(0, -m * 0.98);
        c.quadraticCurveTo(m * 0.05, -m * 0.05, m * 0.98, 0);
        c.quadraticCurveTo(m * 0.05, m * 0.05, 0, m * 0.98);
        c.quadraticCurveTo(-m * 0.05, m * 0.05, -m * 0.98, 0);
        c.quadraticCurveTo(-m * 0.05, -m * 0.05, 0, -m * 0.98);
        c.fill();
        c.restore();
      }
    },
    { repeat: false },
  );
}

function streakTexture() {
  return canvasTex(
    256,
    16,
    (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(0.85, "rgba(220,215,255,0.8)");
      gr.addColorStop(1, "rgba(255,255,255,1)");
      c.fillStyle = gr;
      c.fillRect(0, h * 0.3, w, h * 0.4);
    },
    { repeat: false },
  );
}

/** Citadels, spires and hills against a last crimson glow, all the way round (u wraps). */
function citadels() {
  const W = 4096,
    H = 256;
  return canvasTex(W, H, (c) => {
    const glow = c.createLinearGradient(0, 0, 0, H);
    glow.addColorStop(0, "rgba(120,20,40,0)");
    glow.addColorStop(0.55, "rgba(120,20,40,0.10)");
    glow.addColorStop(1, "rgba(150,30,50,0.32)");
    c.fillStyle = glow;
    c.fillRect(0, 0, W, H);
    let seed = 9;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    c.fillStyle = "#07050b";
    // rolling hills
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) c.lineTo(x, H - 26 - 18 * Math.sin(x * 0.0021) - 12 * Math.sin(x * 0.0067 + 1.3));
    c.lineTo(W, H);
    c.fill();
    // citadels: clusters of towers with pointed spires, a few lit windows
    for (let i = 0; i < 9; i++) {
      const cx = (i + 0.2 + rnd() * 0.6) * (W / 9);
      const n = 3 + Math.floor(rnd() * 5);
      for (let j = 0; j < n; j++) {
        const tw = 10 + rnd() * 18;
        const th = 40 + rnd() * 110 * (1 - Math.abs(j - n / 2) / n);
        const tx = cx + (j - n / 2) * (tw + 4 + rnd() * 10);
        c.fillStyle = "#07050b";
        c.fillRect(tx, H - 30 - th, tw, th + 30);
        c.beginPath();
        c.moveTo(tx - 2, H - 30 - th);
        c.lineTo(tx + tw / 2, H - 30 - th - (18 + rnd() * 40));
        c.lineTo(tx + tw + 2, H - 30 - th);
        c.fill();
        if (rnd() < 0.5) {
          c.fillStyle = "rgba(255,120,110,0.55)";
          c.fillRect(tx + tw / 2 - 1.5, H - 30 - th * (0.3 + rnd() * 0.5), 3, 5);
        }
      }
    }
  });
}

/** The astrolabe in the floor: rings, ticks, a spark in the middle (transparent). */
function astrolabe() {
  const S = 2048;
  const t = canvasTex(
    S,
    S,
    (c) => {
      const m = S / 2;
      c.strokeStyle = "rgba(255,255,255,0.9)";
      for (const [r, lw] of [
        [0.985, 3],
        [0.95, 1.5],
        [0.72, 2],
        [0.7, 1],
        [0.45, 2],
        [0.17, 1.5],
      ]) {
        c.lineWidth = lw;
        c.beginPath();
        c.arc(m, m, r * m, 0, Math.PI * 2);
        c.stroke();
      }
      for (let i = 0; i < 360; i += 2) {
        const a = (i * Math.PI) / 180;
        const r0 = i % 30 === 0 ? 0.9 : i % 10 === 0 ? 0.93 : 0.94;
        c.lineWidth = i % 30 === 0 ? 2.5 : 1;
        c.beginPath();
        c.moveTo(m + Math.cos(a) * r0 * m, m + Math.sin(a) * r0 * m);
        c.lineTo(m + Math.cos(a) * 0.95 * m, m + Math.sin(a) * 0.95 * m);
        c.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(m + Math.cos(a) * 0.17 * m, m + Math.sin(a) * 0.17 * m);
        c.lineTo(m + Math.cos(a) * 0.7 * m, m + Math.sin(a) * 0.7 * m);
        c.stroke();
      }
      // a four-pointed spark at the heart
      c.fillStyle = "rgba(255,255,255,0.9)";
      c.beginPath();
      const s = 0.12 * m;
      c.moveTo(m, m - s);
      c.quadraticCurveTo(m + s * 0.08, m - s * 0.08, m + s, m);
      c.quadraticCurveTo(m + s * 0.08, m + s * 0.08, m, m + s);
      c.quadraticCurveTo(m - s * 0.08, m + s * 0.08, m - s, m);
      c.quadraticCurveTo(m - s * 0.08, m - s * 0.08, m, m - s);
      c.fill();
    },
    { repeat: false },
  );
  return t;
}
