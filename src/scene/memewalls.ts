import * as THREE from "three";
import type { City } from "./city";
import { CITY, CURB, SHOTENGAI } from "./city/plan";
import { clickable, freezePosters, memeCount, memePoster } from "./memes";
import { FILMS, filmInfo, filmPosterMesh } from "./films";

/**
 * Where the memes hang in the street (scene/memes.ts): framed on the shōtengai's columns, pasted
 * on blank walls in the heart, in the backlit box of the downtown bus shelter, on poster kiosks in
 * Central Park's Mall, on the hoarding round the building site, and ZK CINEMA's film posters on
 * standees by the mall's doors. The metro (stations, viaduct pillars) and the bus stops of the
 * bigger city carry their own (metro.ts, alive/people.ts); the LED screens show them too (decor.ts,
 * shibuya.ts: memeAd).
 */

let next = 0;
/** The memes go round in order, so neighbours differ and every one turns up somewhere. */
export const nextMeme = () => next++ % memeCount;

export function cityMemes(city: City) {
  const root = new THREE.Group();
  root.name = "memes";
  city.group.add(root);
  const put = (o: THREE.Object3D, x: number, y: number, z: number, yaw: number, parent: THREE.Object3D = root) => {
    o.position.set(x, y, z);
    o.rotation.y = yaw;
    parent.add(o);
    return o;
  };

  // ---- the shōtengai: framed posters on the arcade's columns, facing the street's middle --------
  const A = SHOTENGAI;
  const w = A.half * 2 - 0.4;
  let k = 0;
  for (let z = A.z0 + 4; z <= A.z1 - 4; z += 4, k++) {
    if (k % 2) continue;
    for (const side of [-1, 1]) {
      if ((k / 2 + (side > 0 ? 1 : 0)) % 2) continue;
      put(memePoster(nextMeme(), 1.25, { kind: "frame", frame: "#2a2018" }), A.x + (side * w) / 2 - side * 0.09, CURB + 2.5, z, side > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }

  // ---- the heart: pasted on blank street walls, never by a door ----------------------------------
  const doors = Object.values(city.entries).flat();
  let walls = 0;
  for (const f of city.facades) {
    if (walls >= 26) break;
    if (f.face !== "s" || (f.ext && walls >= 14)) continue;
    if (!["warehouse", "office", "apartment"].includes(f.type)) continue;
    const width = f.x1 - f.x0;
    if (width < 5) continue;
    for (const x of [f.x0 + 1.3, f.x1 - 1.3]) {
      if (doors.some((d) => Math.abs(d.x - x) < 2 && Math.abs(d.z - f.z) < 3)) continue;
      // the pavement in front must be free (no stall, no shelter against the wall)
      if (!city.nav.free(x, f.z + 1.2, 0.5)) continue;
      put(memePoster(nextMeme(), 1.1, { kind: "paste" }), x, CURB + 1.75, f.z + 0.03, 0);
      walls++;
    }
  }

  // ---- the downtown bus shelter's ad box (plan.ts: x 14.2, its back to the square) ----------------
  put(memePoster(nextMeme(), 1.15, { kind: "lightbox", frame: "#f4b728" }), 14.2 - 2.36, CURB + 1.45, CITY.south.z1 - 0.95, -Math.PI / 2);

  // ---- poster kiosks along Central Park's Mall and round the fountain: four faces each ---------------
  const kioskSpots: [number, number][] = [
    // along the Mall, the park's straight path from the south gate to the fountain
    [-3.4, -55],
    [3.4, -62],
    [-3.4, -69],
    // on the fountain terrace's rim
    [9.2, -80],
    [-9.2, -80],
  ];
  let kiosks = 0;
  for (const [x, z] of kioskSpots) {
    if (kiosks >= 4 || !city.nav.free(x, z, 1.4)) continue;
    kiosks++;
    root.add(kiosk(x, z));
    city.nav.addCircle(x, z, 0.85);
  }

  // ---- ZK CINEMA's films on standees by the mall's doors -------------------------------------------
  const mall = city.landmarks.get("mall");
  if (mall && FILMS.length) {
    const front = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), mall.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), mall.yaw);
    [-1, 1].forEach((s, i) => {
      const film = i % FILMS.length;
      const at = mall.door.clone().addScaledVector(front, 2.2).addScaledVector(right, s * 7.4);
      const st = standee(film);
      put(st, at.x, CURB, at.z, mall.yaw - s * 0.25);
    });
  }

  // ---- the building site on Wall Street (alive/works.ts): a hoarding of pasted posters along its
  // north edge, on the alley behind the avenue's towers
  const site = { x0: 136.8, x1: 146.3, z0: 11.4 };
  if (city.nav.free((site.x0 + site.x1) / 2, site.z0 - 0.6, 0.3)) {
    const len = site.x1 - site.x0;
    const cx = (site.x0 + site.x1) / 2;
    const board = new THREE.Mesh(new THREE.BoxGeometry(len, 2.4, 0.1), new THREE.MeshStandardMaterial({ color: "#d8d2c4", roughness: 0.9 }));
    put(board, cx, CURB + 1.2, site.z0 + 0.1, 0);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 0.11), new THREE.MeshStandardMaterial({ color: "#f4b728", roughness: 0.6 }));
    put(stripe, cx, CURB + 2.32, site.z0 + 0.1, 0);
    board.userData.memePart = stripe.userData.memePart = true;
    const n = Math.floor(len / 1.2);
    for (let i = 0; i < n; i++) put(memePoster(nextMeme(), 1.0 + (i % 2) * 0.15, { kind: "paste" }), site.x0 + 0.7 + i * ((len - 1.4) / Math.max(1, n - 1)), CURB + 1.25, site.z0 + 0.04, Math.PI);
  }
  freezePosters(root);
  return root;
}

const kioskMat = new THREE.MeshStandardMaterial({ color: "#1e3a2e", roughness: 0.6, metalness: 0.3 });
const capMat = new THREE.MeshStandardMaterial({ color: "#16241c", roughness: 0.5, metalness: 0.5 });
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.4, 0.5), toneMapped: false });

/** A four-sided poster kiosk (a Litfaß column, squared): a meme on each face, a lit crown. */
function kiosk(x: number, z: number) {
  const g = new THREE.Group();
  g.name = "kiosk";
  g.position.set(x, CURB, z);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.7, 1.2), kioskMat);
  body.position.y = 1.35;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.8, 0.3, 8), capMat);
  cap.position.y = 2.85;
  const ring = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.06, 1.26), ringMat);
  ring.position.y = 2.62;
  g.add(body, cap, ring);
  for (const o of [body, cap, ring]) o.userData.memePart = true;
  for (let s = 0; s < 4; s++) {
    const p = memePoster(nextMeme(), 1.05, { kind: "bare" });
    const a = (s * Math.PI) / 2;
    p.position.set(Math.sin(a) * 0.6, 1.5, Math.cos(a) * 0.6);
    p.rotation.y = a;
    g.add(p);
  }
  return g;
}

/** A cinema standee: the film's poster, lit, on a black stand, clickable. */
function standee(film: number) {
  const g = new THREE.Group();
  g.name = "standee";
  const P = filmPosterMesh(film, 1.3);
  P.group.position.y = 0.55 + 0.98;
  g.add(P.group);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.5), new THREE.MeshStandardMaterial({ color: "#14101a", roughness: 0.5, metalness: 0.4 }));
  stand.position.set(0, 0.275, -0.1);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.08, 0.52), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 0.4, 0.5), toneMapped: false }));
  band.position.set(0, 0.5, -0.1);
  g.add(stand, band);
  for (const o of [stand, band, P.group.children[0]]) o.userData.memePart = true;
  const F = FILMS[film];
  clickable(P.pic, `<b>ZK CINEMA · ${esc(F.name)}</b><span>holder spotlight · in the mall, level 4</span>`, () => filmInfo(film, "ZK CINEMA · ZK MALL level 4"));
  return g;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
