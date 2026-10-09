import * as THREE from "three";
import { Market } from "../../data/market";
import type { Snark } from "../../scene/snark";
import { balustrade, glassRail } from "./arch";
import { snarkExchange } from "./snarks";
import { board, chart, drawMarket, drawPools, drawPrice, drawSupply, drawTape, POOL_COLOR, poolsInfo, priceInfo, supplyInfo, tape } from "./data";
import { big, C, F, GOLD, LEVELS, MONO, num, paint, SANS, SERIF, Surface, usd, zec, type ReserveKit } from "./kit";

/**
 * Floor 2: the trading floor, New York style. Six trading posts, each a ring of counters with
 * clerks inside and a crown of screens on the live figures; the big board and the bell podium on
 * the back wall; a visitors' gallery up the east side; a ticker tape running round the room;
 * order slips all over the carpet. Traders shout; on every new block the bell rings.
 */

const f = F.trading;
const L = LEVELS[f];
const H = L.h;
const POSTS: { x: number; z: number; name: string; draw: (g: CanvasRenderingContext2D, W: number, H: number, k: ReserveKit) => void }[] = [
  { x: -11, z: -15, name: "ZEC / USD", draw: (g, W, H) => drawPrice(g, W, H, "ZEC / USD") },
  { x: 0, z: -15, name: "MARKET", draw: (g, W, H) => drawMarket(g, W, H) },
  { x: 11, z: -15, name: "POOLS", draw: (g, W, H) => drawPools(g, W, H) },
  { x: -11, z: -28, name: "SUPPLY", draw: (g, W, H, k) => drawSupply(g, W, H, k.height) },
  { x: 0, z: -28, name: "SHIELDED", draw: (g, W, H) => drawShielded(g, W, H) },
  { x: 11, z: -28, name: "BLOCKS", draw: (g, W, H, k) => drawBlocks(g, W, H, k) },
];
const POST_R = 2.5;

export function trading(k: ReserveKit) {
  // ---- floor: navy carpet with gold flecks, order slips everywhere ----
  const carpet = paint(
    128,
    128,
    (c, W, Hh) => {
      c.fillStyle = "#18233c";
      c.fillRect(0, 0, W, Hh);
      for (let n = 0; n < 300; n++) {
        c.fillStyle = k.rnd(n, 1) < 0.1 ? "rgba(244,183,40,0.5)" : "rgba(0,0,0,0.25)";
        c.fillRect(k.rnd(n, 2) * W, k.rnd(n, 3) * Hh, 2, 2);
      }
      c.strokeStyle = "rgba(244,183,40,0.25)";
      c.lineWidth = 2;
      c.strokeRect(0, 0, W, Hh);
    },
    22,
    22,
  );
  k.flat(f, 44, 44, new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 }), 0, -22, 0);
  const slips = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#f2efe6", roughness: 0.9, side: THREE.DoubleSide }), 520);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 520; i++) {
    const p = POSTS[i % 6];
    const a = k.rnd(i, 7) * Math.PI * 2,
      r = POST_R + 0.2 + Math.pow(k.rnd(i, 8), 1.8) * 5;
    const x = i % 5 === 0 ? -20 + k.rnd(i, 9) * 40 : p.x + Math.cos(a) * r,
      z = i % 5 === 0 ? -42 + k.rnd(i, 10) * 40 : p.z + Math.sin(a) * r;
    m.compose(new THREE.Vector3(x, L.y + 0.008 + (i % 3) * 0.002, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), k.rnd(i, 11) * 6), new THREE.Vector3(1, 1, 1));
    slips.setMatrixAt(i, m);
  }
  slips.raycast = () => {};
  k.groups[f].add(slips);

  // ---- walls: walnut panelling below, deep blue above, the windows on the street ----
  const wood = "#3a2416",
    blue = "#101a30";
  for (const [x0, z0, x1, z1] of [
    [-22, -44, 22, -44],
    [-22, -44, -22, 0],
    [22, -44, 22, 0],
  ] as const) {
    k.wall(f, x0, z0, x1, z1, 3.4, wood, "polish", 0.4);
    k.wall(f, x0, z0, x1, z1, H - 3.4, blue, "matte", 0.3, 3.4, false);
    k.box(f, Math.max(0.5, Math.abs(x1 - x0)), 0.12, Math.max(0.5, Math.abs(z1 - z0)), (x0 + x1) / 2, 3.4, (z0 + z1) / 2, GOLD, "metal");
  }
  // panels on the walnut
  for (let x = -21; x <= 21; x += 1.5) k.box(f, 1.2, 2.4, 0.05, x, 0.5, -43.78, "#4a2e1c", "polish");
  for (let z = -42; z <= -1; z += 1.5)
    for (const x of [-21.78, 21.78]) k.box(f, 0.05, 2.4, 1.2, x, 0.5, z, "#4a2e1c", "polish");
  // the street side: three tall windows between stone piers
  k.wall(f, -22, 0, 22, 0, 1.0, C.travertine, "polish", 0.5);
  k.box(f, 44, H - 8.2, 0.5, 0, 8.2, -0.25, C.travertine, "polish");
  for (const x of [-22, -9, 9, 22]) k.box(f, x === -22 || x === 22 ? 2 : 4, 7.2, 0.6, x, 1.0, -0.3, C.travertine, "polish");
  for (const [x0, x1] of [
    [-21, -11],
    [-7, 7],
    [11, 21],
  ]) {
    const w = x1 - x0,
      cx = (x0 + x1) / 2;
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, 7.2), new THREE.MeshStandardMaterial({ color: "#a8c8e0", transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.5, depthWrite: false }));
    gl.raycast = () => {};
    k.add(f, gl, cx, 4.6, -0.2, 0);
    for (let x = x0; x <= x1 + 0.01; x += w / 5) k.box(f, 0.08, 7.2, 0.1, x, 1.0, -0.25, "#2a2018", "metal");
    for (const y of [1.0, 4.6, 8.1]) k.box(f, w, 0.1, 0.12, cx, y, -0.25, "#2a2018", "metal");
  }
  k.solid(f, -22, -0.1, 22, 0.6);
  // ceiling: dark coffers, cable trays, rows of lights
  k.box(f, 44, 0.3, 44, 0, H, -22, "#0c1222", "matte");
  for (let x = -18; x <= 18; x += 6) k.box(f, 0.5, 0.7, 44, x, H - 0.7, -22, "#1a2440", "matte");
  for (let z = -40; z <= -4; z += 6) k.box(f, 44, 0.7, 0.5, 0, H - 0.7, z, "#1a2440", "matte");
  for (let x = -15; x <= 15; x += 6) for (let z = -37; z <= -7; z += 6) k.box(f, 2.4, 0.04, 2.4, x, H - 0.75, z, "#fff4dc", "glow");

  // ---- the ticker tape round three walls ----
  const tapeS = new Surface(4096, 64);
  tapeS.tex.wrapS = THREE.RepeatWrapping;
  const redraw = () => tapeS.draw((c, W, Hh) => drawTape(c, W, Hh, tape(k.height)));
  redraw();
  const bands: THREE.Mesh[] = [];
  for (const [w, x, z, ry] of [
    [44, 0, -43.7, 0],
    [44, -21.7, -22, Math.PI / 2],
    [44, 21.7, -22, -Math.PI / 2],
  ] as const) {
    const tm = new THREE.MeshBasicMaterial({ map: tapeS.tex.clone(), toneMapped: false });
    tm.map!.wrapS = THREE.RepeatWrapping;
    tm.map!.repeat.set(w / 40, 1);
    tm.map!.needsUpdate = true;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.6), tm);
    k.add(f, b, x, 3.85, z, ry);
    bands.push(b);
    k.box(f, ry ? 0.1 : w, 0.8, ry ? w : 0.1, x - Math.sin(ry) * 0.05, 3.55, z - Math.cos(ry) * 0.05, "#050608", "polish");
  }
  let tt = 0;
  k.ticks[f].push((dt, t) => {
    for (const b of bands) (b.material as THREE.MeshBasicMaterial).map!.offset.x = (t * 0.03) % 1;
    tt += dt;
    if (tt > 8) {
      tt = 0;
      redraw();
      for (const b of bands) (b.material as THREE.MeshBasicMaterial).map!.needsUpdate = true;
    }
  });

  // ---- the posts ----
  const crowdAt: [number, number, number, number, number][] = [];
  const postScreens: Surface[] = [];
  POSTS.forEach((p, pi) => {
    const segs = 18;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ox = p.x + Math.cos(a) * POST_R,
        oz = p.z + Math.sin(a) * POST_R;
      k.box(f, 0.9, 1.1, 0.35, ox, 0, oz, "#3a2416", "polish", -a + Math.PI / 2);
      k.box(f, 0.95, 0.06, 0.55, p.x + Math.cos(a) * (POST_R + 0.05), 1.1, p.z + Math.sin(a) * (POST_R + 0.05), "#e8e2d0", "polish", -a + Math.PI / 2);
      k.box(f, 0.9, 0.04, 0.04, p.x + Math.cos(a) * (POST_R + 0.2), 0.95, p.z + Math.sin(a) * (POST_R + 0.2), GOLD, "metal", -a + Math.PI / 2);
      // a small screen on the counter every other segment
      if (i % 2 === 0) {
        k.box(f, 0.42, 0.3, 0.04, p.x + Math.cos(a) * (POST_R - 0.05), 1.16, p.z + Math.sin(a) * (POST_R - 0.05), "#0a0c12", "polish", -a + Math.PI / 2);
        k.box(f, 0.36, 0.24, 0.01, p.x + Math.cos(a) * (POST_R - 0.03), 1.19, p.z + Math.sin(a) * (POST_R - 0.03), i % 4 ? "#2a7a5a" : "#3a5a9a", "glow", -a + Math.PI / 2);
      }
    }
    k.solid(f, p.x - POST_R - 0.3, p.z - POST_R - 0.3, p.x + POST_R + 0.3, p.z + POST_R + 0.3);
    // the core: a column to the ceiling, a crown of six screens, the post's name on a hood
    k.cyl(f, 0.55, 0.5, H, p.x, 0, p.z, "#1a1a20", "polish", 16);
    k.cyl(f, 1.7, 1.7, 0.15, p.x, 3.0, p.z, "#14141a", "metal", 6, Math.PI / 6);
    k.cyl(f, 1.75, 1.75, 0.08, p.x, 3.15, p.z, GOLD, "metal", 6, Math.PI / 6);
    k.cyl(f, 1.75, 1.75, 0.1, p.x, 4.55, p.z, GOLD, "metal", 6, Math.PI / 6);
    k.cyl(f, 1.9, 1.7, 0.6, p.x, 4.65, p.z, "#14141a", "metal", 6, Math.PI / 6);
    const s = k.surface(f, 512, 352, (g, W, Hh) => p.draw(g, W, Hh, k), 3 + pi * 0.25);
    postScreens.push(s);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.2), s.mat);
      sc.rotation.order = "YXZ";
      k.add(f, sc, p.x + Math.sin(a) * 1.5, 3.25 + 0.62, p.z + Math.cos(a) * 1.5, a);
      sc.rotation.x = -0.12;
      const info = pi === 0 ? priceInfo : pi === 1 ? priceInfo : pi === 2 ? poolsInfo : pi === 3 ? () => supplyInfo(k.height) : pi === 4 ? shieldedInfo : () => blocksInfo(k);
      k.pick(f, sc, `<b>Post ${pi + 1} · ${p.name}</b><span>live</span>`, info);
      const nm = k.label(f, `POST ${pi + 1} · ${p.name}`, p.x + Math.sin(a) * 1.82, 4.82, p.z + Math.cos(a) * 1.82, { h: 0.22, color: GOLD, font: `800 80px ${SANS}`, ry: a });
      void nm;
    }
    // the clerks inside the ring: busts from the collection over the counters
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + pi;
      crowdAt.push([p.x + Math.cos(a) * 1.55, 0.95, p.z + Math.sin(a) * 1.55, 1 + ((pi * 997 + i * 331) % 10000), 0.9]);
    }
  });

  // ---- the back wall: the big board, the bell podium ----
  const bigBoard = k.surface(f, 2048, 448, (g, W, Hh) => drawBigBoard(g, W, Hh, k), 4);
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(32, 7), bigBoard.mat);
  k.add(f, bb, 0, 4.6 + 3.5 - 0.6, -43.6, 0);
  k.box(f, 32.6, 7.6, 0.2, 0, 3.7, -43.75, "#06070b", "polish");
  k.box(f, 32.8, 0.14, 0.3, 0, 11.3 - 0.6 - 0.2, -43.7, GOLD, "metal");
  k.hit(f, 32, 7, 0.1, 0, 4.0, -43.5, "<b>The big board</b><span>live</span>", priceInfo);
  // the podium: a balcony at 3.2 m with a balustrade, the bell on its yoke, the lectern
  const PY = 2.4;
  k.box(f, 13, 0.4, 3.4, 0, PY - 0.4, -42.1, "#3a2416", "polish");
  k.box(f, 13.2, 0.1, 3.6, 0, PY - 0.5, -42.1, GOLD, "metal");
  for (const x of [-6, 6]) k.box(f, 0.5, PY - 0.4, 0.5, x, 0, -40.6, "#3a2416", "polish");
  balustrade(k, f, -6.4, -40.45, 6.4, -40.45, PY, 1.0, "#e8e2d0", "polish", false);
  k.solid(f, -6.6, -44, 6.6, -40.3);
  const drape = paint(512, 128, (c, W, Hh) => {
    c.fillStyle = "#14382a";
    c.fillRect(0, 0, W, Hh);
    c.fillStyle = GOLD;
    c.font = `700 56px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("ZEC RESERVE", W / 2, Hh / 2);
    c.fillRect(0, 6, W, 4);
    c.fillRect(0, Hh - 10, W, 4);
  });
  k.plane(f, 9, 1.2, new THREE.MeshStandardMaterial({ map: drape, roughness: 0.9 }), 0, 1.0, -40.2).raycast = () => {};
  // the bell
  const bell = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector2(0.12 + Math.pow(t, 2.2) * 0.42 + (t > 0.92 ? 0.05 : 0), -t * 0.75));
  }
  const bronze = new THREE.MeshStandardMaterial({ color: "#c08a3a", metalness: 0.95, roughness: 0.25 });
  const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), bronze);
  shell.material.side = THREE.DoubleSide;
  bell.add(shell);
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), bronze);
  clapper.position.y = -0.62;
  bell.add(clapper);
  bell.traverse((o) => (o.raycast = () => {}));
  k.add(f, bell, 4.2, PY + 2.25, -41.4, 0);
  for (const x of [3.5, 4.9]) k.box(f, 0.12, 2.4, 0.12, x, PY, -41.4, "#3a2416", "polish");
  k.box(f, 1.6, 0.14, 0.16, 4.2, PY + 2.3, -41.4, "#3a2416", "polish");
  k.hit(f, 1.4, 1.2, 1.2, 4.2, PY + 1.4, -41.4, "<b>The bell</b><span>rings on every block</span>", () => blocksInfo(k));
  // lectern with the Reserve's seal
  k.box(f, 0.8, 1.15, 0.5, -1.0, PY, -41.3, "#3a2416", "polish");
  k.box(f, 0.9, 0.06, 0.6, -1.0, PY + 1.15, -41.3, GOLD, "metal");
  k.geo(f, new THREE.CircleGeometry(0.22, 24).translate(-1.0, PY + 0.65, -41.04), GOLD, "metal");
  // dignitaries on the podium (busts behind the balustrade)
  for (const [x, id] of [
    [-5, 2027],
    [-3.6, 7311],
    [1.6, 6420],
    [-2.3, 512],
  ] as const)
    crowdAt.push([x, PY + 0.25, -41.6, id, 1.0]);

  // ---- the visitors' gallery up the east wall ----
  const GY = 4.6;
  k.box(f, 3.2, 0.35, 30, 20.4, GY - 0.35, -22, "#3a2416", "polish");
  k.box(f, 3.3, 0.08, 30.2, 20.4, GY - 0.43, -22, GOLD, "metal");
  // hung from the ceiling on bronze rods: nothing stands under it but the zkSNARKs exchange
  for (let z = -36; z <= -8; z += 7) k.box(f, 0.06, H - GY, 0.06, 19.0, GY, z, "#8a6a3a", "metal");
  glassRail(k, f, 18.8, -37, 18.8, -7, GY, 1.05, false);
  k.label(f, "VISITORS' GALLERY", 18.78, GY + 1.4, -22, { h: 0.3, color: GOLD, font: `700 80px ${SERIF}`, ry: -Math.PI / 2 });
  for (let i = 0; i < 34; i++) crowdAt.push([19.5 + (i % 2) * 0.9 + k.rnd(i, 3) * 0.2, GY - 0.05 + (i % 2) * 0.1, -36 + (i / 34) * 28 + k.rnd(i, 4) * 0.4, 1 + ((i * 2741 + 77) % 10000), 0.95]);
  // and up the west wall above the lifts
  k.box(f, 2.4, 0.35, 18, -20.8, GY - 0.35, -32, "#3a2416", "polish");
  glassRail(k, f, -19.6, -41, -19.6, -23, GY, 1.05, false);
  for (let i = 0; i < 16; i++) crowdAt.push([-20.4 - (i % 2) * 0.7, GY - 0.05 + (i % 2) * 0.1, -40.5 + (i / 16) * 17, 1 + ((i * 1597 + 311) % 10000), 0.95]);
  const crowd = k.crowd(f, crowdAt);
  snarkExchange(k, (n) => crowd.cheer(n));

  // ---- the lifts ----
  k.lifts(f, -21.75, L.spawn[1], Math.PI / 2);

  // ---- light ----
  k.light(f, -11, 7, -15, "#ffe8c8", 22, 20);
  k.light(f, 11, 7, -15, "#ffe8c8", 22, 20);
  k.light(f, -11, 7, -28, "#ffe8c8", 22, 20);
  k.light(f, 11, 7, -28, "#ffe8c8", 22, 20);
  k.light(f, 0, 7, -37, "#ffd9a0", 26, 18);
  k.light(f, 0, 7, -6, "#dfe8ff", 16, 18);

  // ---- people and the bell ----
  let ringFor = 0;
  const ringer: { s: Snark | null } = { s: null };
  const traders: Snark[] = [];
  k.blockFns.push((h) => {
    ringFor = 4;
    crowd.cheer(1.4);
    for (const s of postScreens) s.draw((g, W, Hh) => flash(g, W, Hh, h));
    setTimeout(() => postScreens.forEach((s, i) => s.draw((g, W, Hh) => POSTS[i].draw(g, W, Hh, k))), 3500);
    if (k.current !== f) return;
    ringer.s?.say("DING! DING! DING!", 3, "shout");
    traders.forEach((s, i) => setTimeout(() => s.say(["BLOCK!", `#${num(h)}!`, "SHIELD IT!", "BUY BUY BUY!", "Here we go!"][i % 5], 2.4, "shout"), 300 + i * 180));
  });
  k.ticks[f].push((dt, t) => {
    ringFor = Math.max(0, ringFor - dt);
    bell.rotation.z = ringFor > 0 ? Math.sin(t * 9) * 0.45 * Math.min(1, ringFor) : 0;
    clapper.position.x = ringFor > 0 ? Math.sin(t * 9 + 0.6) * 0.12 : 0;
  });

  k.onCast(f, () => {
    void k.person(f, 6001, [3.0, -41.4], "Bell ringer", { dy: PY, face: [0, 1], lines: ["Next block, I ring.", () => `Block ${num(k.height)} rung.`, "Every 75 seconds. Never late."], every: [16, 26] }).then((s) => (ringer.s = s));
    k.person(f, 6002, [-1.0, -42.0], "Governor", { dy: PY, face: [0, 1] });
    const SHOUTS = [
      "BUY!",
      "SELL!",
      "SHIELD IT!",
      "Ten thousand at market!",
      "Who's selling transparent?",
      "Long Ironwood!",
      "Bid! Bid!",
      "I'll take Orchard!",
      () => `${usd(Market.state.price?.usd ?? 0)} bid!`,
      () => `Offer ${usd((Market.state.price?.usd ?? 0) + 0.25)}!`,
      "Fill me!",
      "Done!",
    ];
    const spots: [number, number][] = [];
    for (const p of POSTS)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        spots.push([p.x + Math.cos(a) * (POST_R + 0.9), p.z + Math.sin(a) * (POST_R + 0.9)]);
      }
    for (let i = 0; i < 20; i++) {
      const [x, z] = spots[(i * 7) % spots.length];
      const lines = [SHOUTS[i % SHOUTS.length], SHOUTS[(i + 5) % SHOUTS.length], SHOUTS[(i + 8) % SHOUTS.length]];
      void k
        .person(f, 6100 + i * 37, [x, z], "Trader", { wander: spots, lines, tone: "shout", near: 18, every: [4, 9] })
        .then((s) => s && traders.push(s));
    }
    // two pairs talking it over by the windows
    k.dialog(f, [k.person(f, 6201, [-4.5, -3.4], "Analyst", { face: [1, 0] }), k.person(f, 6202, [-3.3, -3.6], "Analyst", { face: [-1, 0] })], [
      [0, () => `Market cap ${big(Market.state.price?.market_cap_usd ?? 0)}.`],
      [1, () => `Volume ${big(Market.state.price?.volume_24h_usd ?? 0)} today.`],
      [0, "And most of it never touches a board."],
      [1, "Shielded. As it should be."],
    ]);
    k.dialog(f, [k.person(f, 6203, [5.0, -36.6], "Floor broker", { face: [-1, 0] }), k.person(f, 6204, [3.8, -36.9], "Floor broker", { face: [1, 0] })], [
      [0, () => `Ironwood took ${zec(Math.max(0, Market.state.pools?.change_24h.ironwood ?? 0))} today.`],
      [1, "Orchard's draining into it."],
      [0, "The turnstile works."],
      [1, "Bell's about to ring."],
    ]);
  });
}

/** Post 5: shielded share, shielded transactions, the network. */
function drawShielded(g: CanvasRenderingContext2D, W: number, Hh: number) {
  board(g, W, Hh, "SHIELDED", "24H");
  const P = Market.state.pools,
    N = Market.state.network;
  const s = Math.min(Hh / 300, W / 520);
  if (P) {
    g.fillStyle = GOLD;
    g.font = `800 ${Math.round(70 * s)}px ${MONO}`;
    g.fillText(`${(P.shielded_ratio * 100).toFixed(2)}%`, 18 * s, 120 * s);
    g.fillStyle = "#8f8a80";
    g.font = `600 ${Math.round(20 * s)}px ${MONO}`;
    g.fillText(`${zec(P.shielded)} ZEC IN SHIELDED POOLS`, 18 * s, 150 * s);
  }
  if (N) {
    const rows: [string, string][] = [
      ["TX 24H", num(N.txs_24h)],
      ["SHIELDED TX", `${(N.shielded_tx_ratio_24h * 100).toFixed(1)}%`],
      ["FEES 24H", `${(N.fees_24h > 1e5 ? N.fees_24h / 1e8 : N.fees_24h).toFixed(3)}`],
    ];
    rows.forEach(([a, b], i) => {
      const x = 18 * s + i * ((W - 36 * s) / 3);
      g.fillStyle = "#8f8a80";
      g.font = `600 ${Math.round(16 * s)}px ${MONO}`;
      g.fillText(a, x, 210 * s);
      g.fillStyle = "#f6f1e6";
      g.font = `800 ${Math.round(30 * s)}px ${MONO}`;
      g.fillText(b, x, 250 * s);
    });
  }
}

/** Post 6: the last block, block time, hash rate, the mempool. */
function drawBlocks(g: CanvasRenderingContext2D, W: number, Hh: number, k: ReserveKit) {
  board(g, W, Hh, "BLOCKS", "LIVE");
  const s = Math.min(Hh / 300, W / 520);
  g.fillStyle = "#f6f1e6";
  g.font = `800 ${Math.round(62 * s)}px ${MONO}`;
  g.fillText(`#${num(k.height)}`, 18 * s, 118 * s);
  const N = Market.state.network;
  const since = k.ctx.director.lastBlockTime ? Math.round((Date.now() - k.ctx.director.lastBlockTime) / 1000) : null;
  const rows: [string, string][] = [
    ["LAST BLOCK", since != null ? `${since}s` : "—"],
    ["AVG TIME", N ? `${N.avg_block_time.toFixed(1)}s` : "—"],
    ["MEMPOOL", `${k.ctx.director.mempoolList().length} tx`],
  ];
  rows.forEach(([a, b], i) => {
    const x = 18 * s + i * ((W - 36 * s) / 3);
    g.fillStyle = "#8f8a80";
    g.font = `600 ${Math.round(16 * s)}px ${MONO}`;
    g.fillText(a, x, 180 * s);
    g.fillStyle = GOLD;
    g.font = `800 ${Math.round(30 * s)}px ${MONO}`;
    g.fillText(b, x, 220 * s);
  });
  if (N) {
    g.fillStyle = "#8f8a80";
    g.font = `600 ${Math.round(16 * s)}px ${MONO}`;
    g.fillText(`HASHRATE ${(N.solps / 1e9).toFixed(2)} GSOL/S`, 18 * s, 270 * s);
  }
}

/** Every screen on the floor flashes the new block for a few seconds. */
function flash(g: CanvasRenderingContext2D, W: number, Hh: number, h: number) {
  g.fillStyle = "#f4b728";
  g.fillRect(0, 0, W, Hh);
  g.fillStyle = "#0b0a08";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `900 ${Math.round(Hh * 0.2)}px ${SANS}`;
  g.fillText("NEW BLOCK", W / 2, Hh * 0.32);
  g.font = `900 ${Math.round(Hh * 0.22)}px ${MONO}`;
  g.fillText(`#${num(h)}`, W / 2, Hh * 0.66);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
}

/** The big board: the price and its chart, the market, the pools in colour. */
function drawBigBoard(g: CanvasRenderingContext2D, W: number, Hh: number, k: ReserveKit) {
  g.fillStyle = "#04060a";
  g.fillRect(0, 0, W, Hh);
  const p = Market.state.price;
  g.fillStyle = GOLD;
  g.fillRect(0, 0, W, 6);
  g.font = `800 40px ${SANS}`;
  g.fillText("ZEC / USD", 30, 60);
  if (p) {
    g.fillStyle = "#f6f1e6";
    g.font = `800 120px ${MONO}`;
    g.fillText(usd(p.usd), 30, 180);
    g.fillStyle = p.usd_24h_change >= 0 ? "#3ee08f" : "#ff5d6c";
    g.font = `700 52px ${MONO}`;
    g.fillText(`${p.usd_24h_change >= 0 ? "▲" : "▼"} ${Math.abs(p.usd_24h_change).toFixed(2)}%`, 30, 250);
    g.fillStyle = "#8f8a80";
    g.font = `600 30px ${MONO}`;
    g.fillText(`CAP ${big(p.market_cap_usd)}`, 30, 320);
    g.fillText(`VOL ${big(p.volume_24h_usd)}`, 30, 365);
    g.fillText(`BLOCK #${num(k.height)}`, 30, 410);
  }
  chart(g, 640, 40, 860, Hh - 70, 5);
  const P = Market.state.pools;
  if (P) {
    const keys = ["ironwood", "orchard", "sapling", "sprout", "transparent"] as const;
    const total = keys.reduce((a, q) => a + P.pools[q], 0) || 1;
    keys.forEach((q, i) => {
      const y = 50 + i * 78;
      g.fillStyle = POOL_COLOR[q];
      g.font = `800 30px ${SANS}`;
      g.fillText(q.toUpperCase(), 1560, y + 26);
      g.fillStyle = "#f6f1e6";
      g.font = `700 28px ${MONO}`;
      g.textAlign = "right";
      g.fillText(zec(P.pools[q]), W - 30, y + 26);
      g.textAlign = "left";
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fillRect(1560, y + 38, W - 1590, 14);
      g.fillStyle = POOL_COLOR[q];
      g.fillRect(1560, y + 38, Math.max(4, (W - 1590) * (P.pools[q] / total)), 14);
    });
  }
}

function shieldedInfo() {
  const P = Market.state.pools,
    N = Market.state.network;
  return {
    eyebrow: "Post 5 · Shielded",
    title: P ? `${(P.shielded_ratio * 100).toFixed(2)}% shielded` : "Shielded",
    stats: [
      ["Shielded ZEC", P ? zec(P.shielded) : "—"],
      ["Tx 24h", N ? num(N.txs_24h) : "—"],
      ["Shielded tx", N ? `${(N.shielded_tx_ratio_24h * 100).toFixed(1)}%` : "—"],
    ] as [string, string][],
  };
}

function blocksInfo(k: ReserveKit) {
  const N = Market.state.network;
  return {
    eyebrow: "Post 6 · Blocks",
    title: `#${num(k.height)}`,
    mono: true,
    stats: [
      ["Avg block time", N ? `${N.avg_block_time.toFixed(1)} s` : "—"],
      ["Mempool", `${k.ctx.director.mempoolList().length} tx`],
      ["Hashrate", N ? `${(N.solps / 1e9).toFixed(2)} GSol/s` : "—"],
    ] as [string, string][],
  };
}
