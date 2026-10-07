import * as THREE from "three";
import { textPlane } from "../../kit";
import { MONO, num, paint, type SkyKit } from "../kit";
import { LIFT, outline, PAL, triPoints, triSlab } from "./shared";

/**
 * H · the helipad on the roof, 140 m over Wall Street: the deck (its H, the touchdown ring, cyan
 * lights all round), the safety net, the glass lift kiosk, the wind sock; below the edge, the top
 * of the tower turning away and the halo of light round it. HALO-1, the tower's helicopter, sits on
 * the H, then spins up, lifts off, flies a loop round the city and lands again.
 */

const f = 3;
const C0 = new THREE.Vector3(0, 0, -13.5);
const R = 12.5;

export function helipad(k: SkyKit) {
  const g = k.groups[f];
  const y0 = k.y(f);

  // ---- the deck ------------------------------------------------------------------------------------
  const deck = paint(1024, 1024, (c, W) => {
    const r = W / 2,
      s = W / (2 * R);
    c.fillStyle = "#3a3e46";
    c.fillRect(0, 0, W, W);
    // concrete panels
    c.strokeStyle = "rgba(0,0,0,0.25)";
    c.lineWidth = 2;
    for (let i = 0; i < W; i += 2.5 * s) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, W);
      c.moveTo(0, i);
      c.lineTo(W, i);
      c.stroke();
    }
    // the touchdown ring and the H
    c.strokeStyle = "#f4c428";
    c.lineWidth = 0.55 * s;
    c.beginPath();
    c.arc(r, r, 6.4 * s, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "#f4f4ee";
    const hw = 2.4 * s,
      hh = 3.6 * s,
      bar = 0.75 * s;
    c.fillRect(r - hw, r - hh, bar, hh * 2);
    c.fillRect(r + hw - bar, r - hh, bar, hh * 2);
    c.fillRect(r - hw, r - bar / 2, hw * 2, bar);
    // the perimeter: a white edge line, cyan dashes
    c.strokeStyle = "#f4f4ee";
    c.lineWidth = 0.3 * s;
    c.beginPath();
    c.arc(r, r, (R - 0.5) * s, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = "#3ef0ff";
    c.setLineDash([1.4 * s, 1.0 * s]);
    c.lineWidth = 0.18 * s;
    c.beginPath();
    c.arc(r, r, (R - 1.2) * s, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    // the name and the weight limit, painted
    c.fillStyle = "#f4f4ee";
    c.textAlign = "center";
    c.font = `900 ${1.3 * s}px ${MONO}`;
    c.fillText("ZK HALO", r, r - 8.4 * s);
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshStandardMaterial({ map: deck, roughness: 0.85 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(C0.x, y0, C0.z);
  disc.raycast = () => {};
  g.add(disc);
  k.geo(f, new THREE.CylinderGeometry(R, R - 0.3, 0.7, 96, 1, true).translate(C0.x, -0.35, C0.z), PAL.chrome, "metal");
  k.geo(f, new THREE.CircleGeometry(R - 0.3, 64).rotateX(Math.PI / 2).translate(C0.x, -0.7, C0.z), "#5a5e66", "matte");
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.geo(f, new THREE.BoxGeometry(0.25, 0.3, R).translate(0, 0, R / 2).rotateY(a).translate(C0.x, -1.0, C0.z), "#a8acb4", "metal");
  }
  // the safety net round the edge
  const net = new THREE.Mesh(
    new THREE.RingGeometry(R, R + 2, 96, 1),
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
  net.rotation.x = -Math.PI / 2 + 0.14;
  net.position.set(C0.x, y0 - 0.5, C0.z);
  net.raycast = () => {};
  g.add(net);
  // lights round the rim: cyan and white, a slow chase
  const rim: THREE.Mesh[] = [];
  const cyanM = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.cyan).multiplyScalar(2.2), toneMapped: false });
  const whiteM = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff").multiplyScalar(1.6), toneMapped: false });
  const lampGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.12, 10);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const m = new THREE.Mesh(lampGeo, i % 2 ? whiteM : cyanM);
    m.position.set(C0.x + Math.sin(a) * (R - 0.25), y0 + 0.06, C0.z + Math.cos(a) * (R - 0.25));
    m.raycast = () => {};
    g.add(m);
    rim.push(m);
  }
  k.ticks[f].push((_dt, t) => {
    const lead = Math.floor(t * 8) % 36;
    rim.forEach((m, i) => (m.scale.y = i === lead || i === (lead + 18) % 36 ? 2.6 : 1));
  });
  k.ring(f, C0.x, C0.z, R - 0.45, 0.32, Math.PI * 2 - 0.32);

  // ---- below the edge: the top of the tower turning away, the halo round it ------------------------
  {
    const turn = 1.92;
    triSlab(k, f, 11, turn, C0.x, C0.z, -2.4, 1.0, "#c8d2dc", "metal");
    for (let i = 0; i < 9; i++) {
      const yy = -3.4 - i * 4;
      const rot = turn - (i * 4 * 1.92) / 136;
      triSlab(k, f, 10.8 + i * 0.18, rot, C0.x, C0.z, yy - 3.85, 3.85, i % 3 === 2 ? "#2c4a66" : "#4a7aa0", "glass");
      outline(k, f, triPoints(10.9 + i * 0.18, rot, 60), C0.x, C0.z, yy, 0.18, 0.18, "#eef2f6", "matte");
    }
    // the drum and the struts under the deck
    k.cyl(f, 2.3, 2.3, 2.2, C0.x, -2.4, C0.z, "#8a929c", "metal", 24);
    // the halo: a free ring of cyan light on spokes, fourteen metres down
    const HY = -14;
    k.geo(f, new THREE.TorusGeometry(15.5, 0.22, 8, 128).rotateX(Math.PI / 2).translate(C0.x, HY, C0.z), PAL.cyan, "glow");
    k.geo(f, new THREE.TorusGeometry(15.5, 0.12, 6, 128).rotateX(Math.PI / 2).translate(C0.x, HY - 0.35, C0.z), "#d8dee6", "metal");
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      k.geo(f, new THREE.BoxGeometry(0.16, 0.16, 6).translate(0, 0, 12.5).rotateY(a).translate(C0.x, HY - 0.35, C0.z), "#d8dee6", "metal");
    }
  }

  // ---- the lift kiosk at the deck's edge, its gangway --------------------------------------------------
  {
    k.box(f, 7.2, 0.2, 3.2, 0, -0.2, 0.2, "#4a4e56", "matte");
    k.curtain(f, -3.6, -1.4, -3.6, 1.8, 3.0, PAL.chrome, 1.6);
    k.curtain(f, 3.6, -1.4, 3.6, 1.8, 3.0, PAL.chrome, 1.6);
    k.wall(f, -3.6, 1.8, 3.6, 1.8, 3.0, "#dfe3e8", "polish", 0.2);
    k.box(f, 7.6, 0.25, 3.6, 0, 3.0, 0.2, "#eef2f6", "matte");
    k.box(f, 7.6, 0.05, 0.05, 0, 3.0, -1.6, PAL.cyan, "glow");
    k.lifts(f, 0, 1.68, Math.PI, LIFT);
    k.label(f, "ZK TOWER HALO · HELIPAD · 140 m", 0, 3.45, -1.62, { h: 0.26, color: PAL.cyan, ry: Math.PI });
    // the gangway's handrails into the deck
    for (const s of [-1, 1]) {
      k.box(f, 0.06, 1.0, 1.4, s * 3.55, 0, -2.0, PAL.chrome, "metal");
      k.solid(f, s * 3.55 - 0.1, -2.7, s * 3.55 + 0.1, -1.3);
    }
  }

  // ---- the wind sock ---------------------------------------------------------------------------------
  const WX = C0.x + 9.4,
    WZ = C0.z - 7.4;
  k.cyl(f, 0.06, 0.05, 4.2, WX, 0, WZ, "#e8e8e4", "metal", 8);
  k.box(f, 0.4, 0.4, 0.4, WX, 0, WZ, "#2a2e34", "matte");
  k.solid(f, WX - 0.3, WZ - 0.3, WX + 0.3, WZ + 0.3);
  const sock = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const r0 = 0.32 - i * 0.045,
      r1 = 0.32 - (i + 1) * 0.045;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, 0.36, 12, 1, true), new THREE.MeshStandardMaterial({ color: i % 2 ? "#f4f4ee" : "#ff6a1a", side: THREE.DoubleSide, roughness: 0.8 }));
    seg.rotation.z = Math.PI / 2;
    seg.position.x = 0.18 + i * 0.36;
    seg.raycast = () => {};
    sock.add(seg);
  }
  k.add(f, sock, WX, 4.0, WZ);
  k.ticks[f].push((_dt, t) => {
    sock.rotation.y = 0.6 + Math.sin(t * 0.3) * 0.35 + Math.sin(t * 1.7) * 0.06;
    sock.rotation.z = -0.12 + Math.sin(t * 2.3) * 0.05;
  });

  // ---- HALO-1 ----------------------------------------------------------------------------------------
  const heli = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: "#f2f4f6", metalness: 0.3, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: "#1c2028", metalness: 0.5, roughness: 0.35 });
  const glassM = new THREE.MeshStandardMaterial({ color: "#14283a", metalness: 0.6, roughness: 0.05 });
  const cyanB = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.cyan).multiplyScalar(1.6), toneMapped: false });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    heli.add(m);
    return m;
  };
  // the cabin: a stretched sphere, the nose glass, the engine cowl; nose to +x
  add(new THREE.SphereGeometry(1, 24, 16), white, 0, 1.45, 0).scale.set(2.3, 1.05, 1.05);
  const nose = add(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassM, 1.25, 1.55, 0);
  nose.rotation.z = -Math.PI / 2;
  nose.scale.set(0.85, 1.05, 0.95);
  add(new THREE.BoxGeometry(2.2, 0.55, 1.1), white, -0.3, 2.35, 0);
  add(new THREE.BoxGeometry(2.0, 0.06, 1.12), cyanB, -0.3, 2.1, 0);
  // the side windows and the sliding door
  for (const s of [-1, 1]) {
    for (let w = 0; w < 3; w++) add(new THREE.BoxGeometry(0.55, 0.42, 0.02), glassM, -0.8 + w * 0.7, 1.6, s * 1.02);
    add(new THREE.BoxGeometry(3.6, 0.08, 0.02), cyanB, -0.2, 1.1, s * 1.03);
    const tag = textPlane("HALO-1", { h: 0.26, color: "#14202a" });
    tag.position.set(-1.6, 1.0, s * 0.98);
    tag.rotation.y = s > 0 ? 0 : Math.PI;
    heli.add(tag);
  }
  // the tail boom, the fin, the stabiliser, the tail rotor
  const boom = add(new THREE.CylinderGeometry(0.16, 0.42, 5.2, 12), white, -4.4, 1.85, 0);
  boom.rotation.z = Math.PI / 2 + 0.06;
  add(new THREE.BoxGeometry(0.9, 1.3, 0.1), white, -6.9, 2.4, 0).rotation.z = 0.35;
  add(new THREE.BoxGeometry(0.5, 0.06, 1.6), white, -6.3, 1.95, 0);
  add(new THREE.BoxGeometry(0.4, 0.06, 1.64), cyanB, -6.3, 1.99, 0);
  const tail = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.04), dark);
    b.rotation.x = (i * Math.PI) / 2;
    tail.add(b);
  }
  tail.position.set(-7.0, 2.5, 0.18);
  heli.add(tail);
  // skids
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 8), dark, 0.1, 0.06, s * 0.95).rotation.z = Math.PI / 2;
    for (const x of [-0.9, 1.0]) add(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 6), dark, x, 0.45, s * 0.85).rotation.x = s * 0.25;
  }
  // the main rotor: mast, hub, five blades
  add(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 10), dark, -0.2, 2.75, 0);
  const rotor = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.04, 0.28).translate(2.7, 0, 0), dark);
    b.rotation.y = (i / 5) * Math.PI * 2;
    rotor.add(b);
  }
  rotor.position.set(-0.2, 2.98, 0);
  heli.add(rotor);
  const beacon = add(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff4a3a").multiplyScalar(2.4), toneMapped: false }), -0.6, 2.7, 0);
  const strobe = add(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff").multiplyScalar(3), toneMapped: false }), -7.2, 3.0, 0);
  const pickBox = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 2.4), k.hidden);
  pickBox.position.set(-2.4, 1.5, 0);
  heli.add(pickBox);
  heli.traverse((o) => o !== pickBox && ((o as THREE.Mesh).raycast = () => {}));
  // parked on the H, nose towards the kiosk side, a little turned
  const PARK = new THREE.Vector3(C0.x + 1.6, 0, C0.z - 1);
  const PARK_YAW = 0.5;
  g.add(heli);
  k.solid(f, PARK.x - 4.2, PARK.z - 2.6, PARK.x + 3.2, PARK.z + 2.6);

  let state = "Parked on the H";
  const CYCLE = 90;
  const ease = (x: number) => x * x * (3 - 2 * x);
  const pos = new THREE.Vector3();
  k.ticks[f].push((dt, t) => {
    const u = t % CYCLE;
    let spin = 0,
      yaw = PARK_YAW,
      bank = 0;
    pos.copy(PARK);
    if (u < 34) {
      state = "Parked on the H";
      spin = u > 26 ? (u - 26) / 8 : 0;
    } else if (u < 40) {
      state = "Lifting off";
      spin = 1;
      pos.y = ease((u - 34) / 6) * 8;
    } else if (u < 74) {
      // out over the city: a loop round the tower, climbing, then back
      state = "Flying over the city";
      spin = 1;
      const v = (u - 40) / 34;
      const a = v * Math.PI * 2;
      const rr = 70 * Math.sin(v * Math.PI);
      pos.set(PARK.x + Math.sin(a) * rr, 8 + Math.sin(v * Math.PI) * 26, PARK.z - (1 - Math.cos(a)) * rr * 0.6);
      const ahead = new THREE.Vector3(PARK.x + Math.sin(a + 0.05) * 70 * Math.sin((v + 0.0015) * Math.PI), 0, PARK.z - (1 - Math.cos(a + 0.05)) * 70 * Math.sin((v + 0.0015) * Math.PI) * 0.6);
      yaw = Math.atan2(-(ahead.z - pos.z), ahead.x - pos.x);
      bank = Math.sin(v * Math.PI) * 0.25;
    } else if (u < 82) {
      state = "Landing";
      spin = 1;
      pos.y = 8 * (1 - ease((u - 74) / 8));
      yaw = PARK_YAW + (1 - ease((u - 74) / 8)) * 0.6;
    } else {
      state = "Parked on the H";
      spin = 1 - (u - 82) / 8;
    }
    heli.position.set(pos.x, y0 + pos.y, pos.z);
    heli.rotation.set(bank, yaw, 0, "YXZ");
    rotor.rotation.y += dt * 28 * spin;
    tail.rotation.z += dt * 60 * spin;
    beacon.visible = t % 1 < 0.15;
    strobe.visible = (t + 0.5) % 1.3 < 0.08;
  });
  k.pick(f, pickBox, `<b>HALO-1</b><span>the tower's helicopter</span>`, () => ({
    eyebrow: "ZK TOWER HALO · helipad",
    title: "HALO-1",
    stats: [
      ["Status", state],
      ["Seats", "8"],
      ["Rotor", "5 blades"],
      ["Flight plan", "shielded"],
    ],
  }));
  k.hit(f, 6, 0.3, 6, C0.x, 0, C0.z + 4, `<b>The helipad</b><span>140 m</span>`, () => ({ eyebrow: "ZK TOWER HALO", title: "Helipad · roof", stats: [["Height", "140 m"], ["Deck", "25 m across"], ["Block", `#${num(k.height)}`]] }));

  // ---- light and people -------------------------------------------------------------------------------
  k.light(f, C0.x, 6, C0.z - 4, "#eaf6ff", 10, 26);
  k.light(f, C0.x, 6, C0.z + 7, "#eaf6ff", 9, 24);
  k.light(f, 0, 2.6, 0.2, "#dff4ff", 8, 8);
  k.light(f, C0.x, -12, C0.z, PAL.cyan, 14, 22);

  k.onCast(f, () => {
    void k.person(f, 1313, [PARK.x + 0.6, PARK.z + 2.6], "Pilot", { face: [0, 1], cap: true, lines: ["HALO-1, ready in one block.", "Round the Needle, over the bridge, back for the next block.", "No flight plan published. Shielded skies."] });
    const a = k.person(f, 2424, [-4.6, -4.4], "Passenger", { face: [1, -0.6] });
    const b = k.person(f, 3535, [-3.2, -5.4], "Passenger", { face: [-1, 0.4] });
    k.dialog(f, [a, b], [
      [0, "Is that our ride?"],
      [1, "HALO-1. To the bay and back."],
      [0, "Do they take shielded ZEC?"],
      [1, "They only take shielded ZEC."],
    ]);
    void k.person(f, 4646, [C0.x - 5.8, C0.z - 4.2], "Ground crew", { face: [1, 0.2], lines: ["Clear of the rotor, please!", "Headsets on. It gets loud up here.", "Wind from the bay, ten knots."], tone: "shout" });
    void k.person(f, 5757, [C0.x - 8.4, C0.z + 4.6], "Photographer", { face: [-0.6, -1], lines: ["Golden hour over Wall Street.", "Hold still, the helicopter's taking off!"] });
  });
}
