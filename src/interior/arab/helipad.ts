import * as THREE from "three";
import { F, GOLD, MONO, paint, type ArabKit } from "./kit";

/**
 * The helipad, cantilevered off the sail near the top: a disc 24 m across over the bay, laid out
 * as a grass tennis court (the 2005 exhibition match), a golf tee at the seaward edge (and a
 * golfer driving balls into the water), lights round the rim, a safety net below it; the top of
 * the sail and the mast with its exoskeleton rise beside it; the hotel's gold helicopter circles
 * the tower. All around, the whole city and the bay (the panorama from 50 m).
 */

const f = F.helipad;
const C0 = new THREE.Vector3(0, 0, -14);
const R = 12;

export function helipad(k: ArabKit) {
  const g = k.groups[f];
  const y0 = k.y(f);

  // ---- the deck: grey disc, the court, the H circle, the rim lights ----------------------------
  const deck = paint(1024, 1024, (c, W) => {
    const r = W / 2;
    c.fillStyle = "#3a3e46";
    c.fillRect(0, 0, W, W);
    // the grass court, 20 × 9 m on a 24 m disc
    const s = W / (2 * R);
    const cw = 9 * s,
      cl = 20 * s;
    c.fillStyle = "#3f8f3a";
    c.fillRect(r - cw / 2 - 1.2 * s, r - cl / 2 - 1.2 * s, cw + 2.4 * s, cl + 2.4 * s);
    for (let i = 0; i < 12; i++) {
      c.fillStyle = i % 2 ? "#47993f" : "#3f8f3a";
      c.fillRect(r - cw / 2, r - cl / 2 + (i * cl) / 12, cw, cl / 12);
    }
    c.strokeStyle = "#f4f4ee";
    c.lineWidth = 0.08 * s;
    c.strokeRect(r - cw / 2, r - cl / 2, cw, cl);
    const sw = cw * (8.23 / 10.97);
    c.beginPath();
    c.moveTo(r - sw / 2, r - cl / 2);
    c.lineTo(r - sw / 2, r + cl / 2);
    c.moveTo(r + sw / 2, r - cl / 2);
    c.lineTo(r + sw / 2, r + cl / 2);
    const sl = cl * (6.4 / 23.77);
    c.moveTo(r - sw / 2, r - sl);
    c.lineTo(r + sw / 2, r - sl);
    c.moveTo(r - sw / 2, r + sl);
    c.lineTo(r + sw / 2, r + sl);
    c.moveTo(r, r - sl);
    c.lineTo(r, r + sl);
    c.stroke();
    // the helipad's own markings round it: a yellow ring, the H at the ends
    c.strokeStyle = "#f4c428";
    c.lineWidth = 0.5 * s;
    c.beginPath();
    c.arc(r, r, (R - 1.0) * s, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = "#f4f4ee";
    c.lineWidth = 0.18 * s;
    c.setLineDash([1.2 * s, 0.8 * s]);
    c.beginPath();
    c.arc(r, r, (R - 0.35) * s, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = "#f4f4ee";
    c.font = `900 ${2.2 * s}px ${MONO}`;
    c.textAlign = "center";
    c.fillText("H", r - 7.6 * s, r + 0.8 * s);
    c.fillText("H", r + 7.6 * s, r + 0.8 * s);
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshStandardMaterial({ map: deck, roughness: 0.85 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(C0.x, y0, C0.z);
  disc.raycast = () => {};
  g.add(disc);
  // the deck's edge, the structure under it, the safety net
  k.geo(f, new THREE.CylinderGeometry(R, R - 0.4, 0.8, 96, 1, true).translate(C0.x, -0.4, C0.z), "#c8ccd4", "metal");
  k.geo(f, new THREE.CircleGeometry(R - 0.4, 64).rotateX(Math.PI / 2).translate(C0.x, -0.8, C0.z), "#5a5e66", "matte");
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.geo(f, new THREE.BoxGeometry(0.25, 0.25, R).translate(0, 0, R / 2).rotateY(a).translate(C0.x, -1.0, C0.z), "#a8acb4", "metal");
  }
  const net = new THREE.Mesh(
    new THREE.RingGeometry(R, R + 2.2, 96, 1),
    new THREE.MeshStandardMaterial({
      map: paint(128, 128, (c, W) => {
        c.strokeStyle = "rgba(30,30,36,0.9)";
        c.lineWidth = 3;
        for (let i = 0; i <= W; i += 16) {
          c.beginPath();
          c.moveTo(i, 0);
          c.lineTo(i, W);
          c.moveTo(0, i);
          c.lineTo(W, i);
          c.stroke();
        }
      }, 40, 2),
      transparent: true,
      alphaTest: 0.3,
      side: THREE.DoubleSide,
      roughness: 0.9,
    }),
  );
  net.rotation.x = -Math.PI / 2 + 0.12;
  net.position.set(C0.x, y0 - 0.6, C0.z);
  net.raycast = () => {};
  g.add(net);
  // lights round the rim
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    k.box(f, 0.22, 0.1, 0.22, C0.x + Math.sin(a) * (R - 0.2), 0, C0.z + Math.cos(a) * (R - 0.2), i % 2 ? "#ffe6a0" : "#7fff9a", "glow");
  }
  k.ring(f, C0.x, C0.z, R - 0.45);

  // ---- the tennis net, the umpire's chair, balls -------------------------------------------------
  // the court runs along z (20 m), the net across it at the disc's middle
  k.box(f, 10.2, 0.9, 0.04, C0.x, 0, C0.z, "#1a1a20", "matte");
  k.box(f, 10.2, 0.08, 0.06, C0.x, 0.9, C0.z, "#f4f4ee", "matte");
  for (const s of [-1, 1]) k.cyl(f, 0.05, 0.05, 1.07, C0.x + s * 5.2, 0, C0.z, "#e8e8e4", "metal", 8);
  k.solid(f, C0.x - 5.3, C0.z - 0.1, C0.x + 5.3, C0.z + 0.1);
  {
    const ux = C0.x - 6.4;
    for (const [dx, dz] of [
      [-0.3, -0.3],
      [0.3, -0.3],
      [-0.3, 0.3],
      [0.3, 0.3],
    ] as const) k.box(f, 0.08, 2.0, 0.08, ux + dx, 0, C0.z + dz, "#e8e8e4", "metal");
    k.box(f, 0.8, 0.08, 0.8, ux, 2.0, C0.z, "#2a6a3a", "matte");
    k.box(f, 0.8, 0.7, 0.08, ux - 0.36, 2.0, C0.z, "#2a6a3a", "matte", Math.PI / 2);
    k.solid(f, ux - 0.45, C0.z - 0.45, ux + 0.45, C0.z + 0.45);
  }
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: "#d8f048", roughness: 0.7 }), 14);
  for (let i = 0; i < 14; i++) balls.setMatrixAt(i, new THREE.Matrix4().makeTranslation(C0.x - 4 + k.rnd(i, 71) * 8, y0 + 0.035, C0.z - 9 + k.rnd(i, 72) * 3));
  balls.raycast = () => {};
  g.add(balls);
  k.hit(f, 10, 0.4, 20, C0.x, 0, C0.z, `<b>The helipad court</b><span>Federer v Agassi, 2005</span>`, () => ({ eyebrow: "Helipad · 210 m", title: "The highest tennis court", stats: [["Match", "Federer v Agassi"], ["Year", "2005"], ["Balls lost", "to the sea"], ["Surface", "grass on steel"]] }));

  // ---- the golf tee at the seaward edge, and the drives ------------------------------------------
  const TX = C0.x - 9.5,
    TZ = C0.z - 3;
  k.box(f, 1.8, 0.03, 1.4, TX, 0, TZ, "#58b048", "matte");
  k.cyl(f, 0.012, 0.012, 0.06, TX, 0.03, TZ, "#f4f4ee", "matte", 6);
  k.box(f, 0.3, 0.9, 0.3, TX + 1.3, 0, TZ + 0.9, "#1a1a20", "matte");
  for (let i = 0; i < 4; i++) k.cyl(f, 0.015, 0.015, 0.4, TX + 1.25 + (i % 2) * 0.1, 0.9, TZ + 0.85 + (i >> 1) * 0.1, "#c8ccd4", "metal", 4);
  k.solid(f, TX + 1.1, TZ + 0.7, TX + 1.5, TZ + 1.1);
  const drive = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  drive.raycast = () => {};
  g.add(drive);
  const trail = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.4 }));
  trail.raycast = () => {};
  g.add(trail);
  let golfer: import("../../scene/snark").Snark | null = null;
  k.ticks[f].push((_dt, t) => {
    const u = t % 12;
    if (u < 4.5) {
      const p = u / 4.5;
      // out over the bay to the west, a long arc down to the water
      drive.visible = trail.visible = true;
      drive.position.set(TX - p * 120, y0 + 0.1 + Math.sin(p * Math.PI * 0.55) * 30 - p * p * 60, TZ - p * 30);
      trail.position.lerp(drive.position, 0.4);
      if (golfer && u < 0.05) golfer.say(["Fore!", "Fore! Sorry, Statue of Liberty.", "Into the bay. Again.", "That one's shielded: nobody saw where it went."][Math.floor(t / 12) % 4], 2.6, "shout");
    } else {
      drive.visible = trail.visible = false;
      drive.position.set(TX, y0 + 0.08, TZ);
      trail.position.copy(drive.position);
    }
  });
  k.hit(f, 1.8, 0.3, 1.4, TX, 0, TZ, `<b>The golf tee</b><span>Tiger Woods, 2004</span>`, () => ({ eyebrow: "Helipad · 210 m", title: "The golf tee over the sea", stats: [["Drive", "Tiger Woods, 2004"], ["Water", "everywhere"], ["Balls", "never seen again"]] }));

  // ---- the top of the sail and the mast, to the east ---------------------------------------------
  {
    // the white wall of the tower curving up past the deck
    const wallGeo = new THREE.CylinderGeometry(9, 4, 26, 40, 1, true, Math.PI * 1.15, Math.PI * 0.7).translate(0, 13, 0);
    k.geo(f, wallGeo.translate(C0.x + 21, -12, C0.z), "#f4f4f0", "matte");
    k.geo(f, new THREE.CylinderGeometry(4.2, 9.2, 26, 40, 1, true, Math.PI * 1.15, Math.PI * 0.7).translate(C0.x + 21.2, 1, C0.z), "#e0e4ea", "polish");
    // the mast and the spire
    k.cyl(f, 1.2, 0.8, 30, C0.x + 22, -12, C0.z + 3, "#f4f4f0", "matte", 16);
    k.cyl(f, 0.5, 0.15, 16, C0.x + 22, 18, C0.z + 3, "#e8e8e4", "metal", 10);
    k.cyl(f, 0.3, 0.3, 0.6, C0.x + 22, 34, C0.z + 3, "#ff4a3a", "glow", 10);
    // exoskeleton: white tubes in X braces
    const tube = (a: THREE.Vector3, b: THREE.Vector3, r = 0.35) => {
      const d = b.clone().sub(a);
      const geo = new THREE.CylinderGeometry(r, r, d.length(), 8).translate(0, d.length() / 2, 0);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
      geo.translate(a.x, a.y, a.z);
      k.geo(f, geo, "#f4f4f0", "matte");
    };
    for (const s of [-1, 1]) {
      const zz = C0.z + s * 8.5;
      for (let y = -12; y < 12; y += 8) {
        tube(new THREE.Vector3(C0.x + 15, y, zz), new THREE.Vector3(C0.x + 19, y + 8, zz + s * 0.5));
        tube(new THREE.Vector3(C0.x + 19, y, zz + s * 0.5), new THREE.Vector3(C0.x + 15, y + 8, zz));
      }
      tube(new THREE.Vector3(C0.x + 15, -12, zz), new THREE.Vector3(C0.x + 16, 14, zz - s * 3), 0.5);
    }
    // the gangway from the deck to the tower, gold handrails
    k.box(f, 4, 0.2, 3, C0.x + R + 1.4, -0.2, C0.z, "#c8ccd4", "metal");
    for (const s of [-1, 1]) k.box(f, 4, 0.06, 0.06, C0.x + R + 1.4, 1.0, C0.z + s * 1.45, GOLD, "metal");
    k.box(f, 0.2, 2.6, 2.4, C0.x + R + 3.4, 0, C0.z, "#d9a92e", "metal");
    k.box(f, 0.1, 2.3, 2.0, C0.x + R + 3.28, 0, C0.z, "#1a1a20", "polish");
    k.solid(f, C0.x + R - 0.6, C0.z - 1.6, C0.x + R + 3.6, C0.z - 1.4);
    k.solid(f, C0.x + R - 0.6, C0.z + 1.4, C0.x + R + 3.6, C0.z + 1.6);
    k.solid(f, C0.x + R + 3.2, C0.z - 1.6, C0.x + R + 3.6, C0.z + 1.6);
    k.label(f, "BURJ AL ZEC · HELIPAD · 210 m", C0.x + R + 3.24, 2.9, C0.z, { h: 0.26, color: GOLD, ry: -Math.PI / 2 });
    k.hit(f, 0.3, 2.3, 2.0, C0.x + R + 3.2, 0, C0.z, `<b>Back inside</b><span>lift to the Royal Suite</span>`, () => ({ eyebrow: "Lift", title: "26 · Royal Suite", floor: F.bedroom }));
  }

  // ---- the hotel's helicopter, circling the tower --------------------------------------------------
  const heli = new THREE.Group();
  const goldB = new THREE.MeshStandardMaterial({ color: "#e0b030", metalness: 0.8, roughness: 0.3 });
  const darkG = new THREE.MeshStandardMaterial({ color: "#1a2030", roughness: 0.2, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), goldB);
  body.scale.set(1.6, 1, 1);
  const glassF = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), darkG);
  glassF.rotation.z = -Math.PI / 2;
  glassF.position.set(1.3, 0.1, 0);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.35, 5, 8), goldB);
  boom.rotation.z = Math.PI / 2;
  boom.position.set(-4, 0.3, 0);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.1), goldB);
  fin.position.set(-6.4, 0.8, 0);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.05, 0.3), darkG);
  rotor.position.y = 1.6;
  const rotor2 = rotor.clone();
  rotor2.rotation.y = Math.PI / 2;
  const hub = new THREE.Group();
  hub.add(rotor, rotor2);
  const skids = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 0.1), darkG);
  skids.position.set(0, -1.4, 0.8);
  const skids2 = skids.clone();
  skids2.position.z = -0.8;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff4a3a").multiplyScalar(2), toneMapped: false }));
  beacon.position.set(0, -1.0, 0);
  heli.add(body, glassF, boom, fin, hub, skids, skids2, beacon);
  heli.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
  g.add(heli);
  k.ticks[f].push((dt, t) => {
    const a = t * 0.12;
    const r = 46;
    heli.position.set(C0.x + 21 + Math.cos(a) * r, y0 + 6 + Math.sin(t * 0.3) * 2.5, C0.z + Math.sin(a) * r);
    heli.rotation.set(0, -a - Math.PI / 2, 0.06);
    hub.rotation.y += dt * 24;
    beacon.visible = t % 1 < 0.15;
  });

  // ---- light and people ---------------------------------------------------------------------------
  k.light(f, C0.x, 6, C0.z - 5, "#fff2d8", 18, 26);
  k.light(f, C0.x, 6, C0.z + 6, "#fff2d8", 18, 26);
  k.light(f, C0.x + 16, 4, C0.z, "#ffffff", 10, 20);

  k.onCast(f, () => {
    const a = k.person(f, 4004, [C0.x + 0.6, C0.z - 8.6], "Tennis pro", { face: [0, 1] });
    const b = k.person(f, 5005, [C0.x - 0.8, C0.z + 8.4], "Tennis pro", { face: [0, -1] });
    k.dialog(f, [a, b], [
      [0, "Federer and Agassi played here in 2005."],
      [1, "Who won?"],
      [0, "The sea. It kept every ball."],
      [1, "Your serve."],
      [0, "If I miss, it lands on the Palm."],
      [1, "Aim for the villa with the shielded pool."],
    ], { near: 22 });
    void k.person(f, 6006, [TX + 0.6, TZ + 0.5], "Golfer", { face: [-1, -0.2], lines: ["Tiger hit one from here in 2004. I'm aiming for the Opera House.", "My handicap is public. My balance isn't.", "Every ball I hit is a private transaction with the sea."] }).then((s) => (golfer = s));
    void k.person(f, 7007, [C0.x + 8.6, C0.z + 3.2], "Pilot", { face: [-1, 0], lines: ["Next departure in one block.", "Over the Palm, the bridge and the Colosseum. No flight plan published.", "Seatbelts on. Viewing keys off."] });
    void k.person(f, 8008, [C0.x + 6.8, C0.z - 5.6], "Photographer", { face: [-1, -0.6], lines: ["Smile! The photo is public, your wallet isn't.", "Golden hour over ZStreet. Hold still.", "Lean back a little. Not that much!"] });
  });
}
