import type { Built } from "../buildings";
import { C, E, G, hash, rand, VoxelModel, type Paint } from "../model";
import { P, lantern, type SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";

/**
 * HAWKER 屋台 · ZEC FOOD HALL: a Lau Pa Sat style octagonal cast-iron market crossed with a
 * yokocho. Slender cream columns and filigree arches carry a slate roof in two rings with a
 * louvered clerestory, crowned by a clock tower and spire. Round the inside, fourteen stalls, each
 * its own colour and trade (woks on glowing burners, ramen pots, charcoal grills, bamboo steamers,
 * hanging roast ducks, a drinks fridge), face a floor of round marble tables and stools under
 * ceiling fans and strings of bulbs; a teh tarik bar stands under the tower. The front side is open
 * onto a forecourt of satay and yatai carts with red lanterns and tables under umbrellas.
 *
 * Built at voxel scale 1. Octagon sides are numbered n = 0..7 by their outward normal, starting
 * with the front (+z) and turning towards +x; stalls are drawn in a local frame per side: t along
 * the side, r inward from the outer edge.
 */
export function foodhall(seed: number, o: LandmarkOpts): Built {
  const k = 1;
  const { W, D } = lotSize(o, k);
  const H = 124;
  const m = new VoxelModel(W, H, D);
  const r = rand(seed);

  const A = Math.min(52, Math.floor((W - 34) / 2), Math.floor((D - 46) / 2)); // apothem of the hall
  const cx = Math.round(W / 2),
    cz = 16 + A;
  const EAVE = 30;
  const CLR = 30; // clerestory ring apothem
  const half = A * Math.tan(Math.PI / 8); // half a side
  const r8 = (px: number, pz: number) => Math.max(Math.abs(px), Math.abs(pz), (Math.abs(px) + Math.abs(pz)) / Math.SQRT2);

  // ---- palette -------------------------------------------------------------------------------
  const iron = C("#e8dfc8"),
    ironS = C("#d2c7ae"),
    ironD = C("#3f5a4a"),
    slate = C("#4a5262"),
    slateB = C("#545d6e"),
    lead = C("#9aa0aa"),
    wood = P.wood,
    steel = C("#b8bcc4"),
    steelD = C("#7a7e88"),
    black = C("#1e1c22"),
    floorA = C("#a49e90"),
    floorB = C("#968f82"),
    tile = C("#e6e4dc"),
    goldC = C("#f4b728");
  const ember = (x: number, y: number, z: number) => (hash(x, y, z, seed) > 0.5 ? E("#ff6a1a", 1.8) : E("#ffb03a", 1.5));

  // ---- local frame per octagon side ----------------------------------------------------------
  const nrm = (n: number) => [Math.sin((n * Math.PI) / 4), Math.cos((n * Math.PI) / 4)];
  const tng = (n: number) => [Math.cos((n * Math.PI) / 4), -Math.sin((n * Math.PI) / 4)];
  const world = (n: number, t: number, rr: number) => {
    const [nx, nz] = nrm(n),
      [tx, tz] = tng(n);
    return [cx + nx * (A - rr) + tx * t, cz + nz * (A - rr) + tz * t];
  };
  /** Box in a side's local frame: t ∈ [t0,t1), r ∈ [r0,r1) (r inward from the outer edge). */
  const lbox = (n: number, t0: number, t1: number, r0: number, r1: number, y0: number, y1: number, c: Paint) => {
    const [nx, nz] = nrm(n),
      [tx, tz] = tng(n);
    const cs = [world(n, t0, r0), world(n, t1, r0), world(n, t0, r1), world(n, t1, r1)];
    const xs = cs.map((p) => p[0]),
      zs = cs.map((p) => p[1]);
    const diag = n % 2 === 1;
    // thin bands on a diagonal need a little extra width or they fall apart into a dotted line
    const padT = diag && t1 - t0 < 1.6 ? (1.6 - (t1 - t0)) / 2 : 0,
      padR = diag && r1 - r0 < 1.6 ? (1.6 - (r1 - r0)) / 2 : 0;
    for (let z = Math.floor(Math.min(...zs)) - 1; z <= Math.ceil(Math.max(...zs)); z++)
      for (let x = Math.floor(Math.min(...xs)) - 1; x <= Math.ceil(Math.max(...xs)); x++) {
        const px = x + 0.5 - cx,
          pz = z + 0.5 - cz;
        const rr = A - (px * nx + pz * nz),
          t = px * tx + pz * tz;
        if (t >= t0 - padT && t < t1 + padT && rr >= r0 - padR && rr < r1 + padR) m.box(x, y0, z, x + 1, y1, z + 1, c);
      }
  };
  const lpt = (n: number, t: number, rr: number) => world(n, t, rr).map((v) => Math.floor(v)) as [number, number];

  // ---- forecourt paving and the platform ---------------------------------------------------------
  const paveA = C("#bdb6a8"),
    paveB = C("#b0a99a");
  m.box(0, 0, 0, W, 1, D, (x, _y, z) => ((Math.floor(x / 12) + Math.floor(z / 12)) % 2 ? paveA : paveB));
  m.box(0, 0, D - 2, W, 1, D, C("#7a7466"));
  // hall floor: a plinth two voxels up, terrazzo tiles in a big check, a stone step round it
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const px = x + 0.5 - cx,
        pz = z + 0.5 - cz;
      const q = r8(px, pz);
      if (q < A + 3) m.box(x, 0, z, x + 1, 2, z + 1, q >= A + 1 ? C("#8a8478") : (Math.floor(x / 8) + Math.floor(z / 8)) % 2 ? floorA : floorB);
      else if (q < A + 5) m.set(x, 0, z, C("#9a9488"));
    }
  const FL = 2; // floor top

  // ---- stalls --------------------------------------------------------------------------------
  type Kind = "wok" | "pot" | "grill" | "steam" | "drink" | "roast" | "griddle" | "fryer";
  const STALLS: { name: string; color: string; kind: Kind }[] = [
    { name: "CHICKEN RICE 鶏飯", color: "#c0302a", kind: "roast" },
    { name: "RAMEN ラーメン", color: "#1f2a5a", kind: "pot" },
    { name: "SATAY", color: "#e07020", kind: "grill" },
    { name: "LAKSA", color: "#2f8a4a", kind: "pot" },
    { name: "YAKITORI 焼鳥", color: "#7a1f2a", kind: "grill" },
    { name: "DIM SUM 点心", color: "#d04a8a", kind: "steam" },
    { name: "CHAR KWAY TEOW", color: "#2f5aa8", kind: "wok" },
    { name: "GYOZA 餃子", color: "#6a3a9a", kind: "griddle" },
    { name: "KAYA TOAST", color: "#e8b820", kind: "griddle" },
    { name: "BAK KUT TEH", color: "#7a4a2a", kind: "pot" },
    { name: "TAKOYAKI たこ焼", color: "#1f8a8a", kind: "fryer" },
    { name: "HOKKIEN MEE", color: "#3a9ad0", kind: "wok" },
    { name: "ICE KACANG", color: "#7ab030", kind: "drink" },
    { name: "NASI LEMAK", color: "#a83a1a", kind: "wok" },
  ];
  // stalls on every side but the open front (n = 0); two per side between the columns
  const stallSides = [4, 3, 5, 2, 6, 1, 7];
  const signs: SignSpot[] = [];
  const points: Record<string, [number, number, number]> = {};
  const walls: [number, number, number, number][] = [];
  const steams: [number, number, number][] = [];
  const lights: Built["lights"] = [];
  const cooks: [number, number, number][] = [];
  const DEPTH = 15; // stall depth from the outer edge to the counter front
  let si = 0;
  for (const n of stallSides)
    for (const sgn of [-1, 1]) {
      const st = STALLS[si++ % STALLS.length];
      const col = C(st.color);
      const t0 = sgn < 0 ? -half + 2 : 1.5,
        t1 = sgn < 0 ? -1.5 : half - 2;
      const tm = (t0 + t1) / 2;
      const y = FL;
      // back wall: white tiles with a band in the stall colour, low enough to see over from outside
      lbox(n, t0, t1, 0, 2, y, y + 14, tile);
      lbox(n, t0, t1, 0, 2, y + 10, y + 12, col);
      lbox(n, t0, t1, -0.5, 0.5, y, y + 2, C("#5a5a62"));
      // side partitions
      for (const tt of [t0 - 0.5, t1 - 0.5]) lbox(n, tt, tt + 1, 0, DEPTH - 1, y, y + 16, tile);
      // menu board over the back wall, lit with pictures of the dishes
      lbox(n, t0 + 1, t1 - 1, 2, 3, y + 15, y + 22, black);
      for (let i = 0; i < Math.floor((t1 - t0 - 3) / 3); i++) {
        const tt = t0 + 2 + i * 3;
        lbox(n, tt, tt + 2, 2.5, 3.5, y + 18, y + 20, E(["#ffd28a", "#ff9a6a", "#fff0c0", "#ffb070"][(i + si) % 4], 1.1));
        lbox(n, tt, tt + 2, 2.5, 3.5, y + 16, y + 17, E("#fff4e0", 0.9));
      }
      // the board's back, seen from outside over the back wall: the stall colour with a lit
      // border and a row of lit kitchen windows below it
      lbox(n, t0 + 1, t1 - 1, 1.2, 2, y + 15, y + 22, col);
      lbox(n, t0 + 1, t1 - 1, 0.6, 1.2, y + 21, y + 22, E("#ffb45a", 1.3));
      lbox(n, t0 + 2.5, t1 - 2.5, 0.6, 1.2, y + 17, y + 20, E(st.color === "#e8b820" ? "#ff8a3a" : "#ffc060", 1.0));
      for (let tt = t0 + 2; tt < t1 - 2; tt += 4) lbox(n, tt, tt + 1, -0.6, 0.6, y + 4, y + 9, E("#ffb45a", 1.1));
      // counter: coloured front, steel top, a glass case with the food
      lbox(n, t0, t1, DEPTH - 3, DEPTH, y, y + 6, col);
      lbox(n, t0, t1, DEPTH - 3, DEPTH, y, y + 1, C("#3a3a42"));
      lbox(n, t0, t1, DEPTH - 3.5, DEPTH + 0.5, y + 6, y + 7, steel);
      lbox(n, tm - 4, tm + 1, DEPTH - 3, DEPTH - 1, y + 7, y + 10, G("#cfe4f0"));
      for (let i = 0; i < 4; i++) lbox(n, tm - 4 + i, tm - 3 + i, DEPTH - 2.5, DEPTH - 1.5, y + 7, y + 8, C(["#e8b04a", "#c05a3a", "#f0e0c0", "#6aa04a"][(i + si) % 4]));
      lbox(n, t1 - 3, t1 - 1, DEPTH - 2.5, DEPTH - 1, y + 7, y + 8, C("#e8e4d8")); // stacked bowls
      // canopy and signboard over the counter, with lanterns hanging from it
      lbox(n, t0 - 0.5, t1 + 0.5, 2, DEPTH + 2, y + 22, y + 23, col);
      lbox(n, t0 - 0.5, t1 + 0.5, DEPTH + 1, DEPTH + 2, y + 17, y + 23, col);
      lbox(n, t0 + 1, t1 - 1, DEPTH + 1.6, DEPTH + 2.6, y + 18, y + 22, C("#f4ecd8"));
      // pseudo lettering on the board for the sides a neon sign can't face
      for (let i = 0; i < Math.floor((t1 - t0 - 4) / 2); i++) if (hash(i, si, n, 3) > 0.35) lbox(n, t0 + 2 + i * 2, t0 + 3 + i * 2, DEPTH + 2.1, DEPTH + 3, y + 19, y + 19 + 1 + Math.floor(hash(i, si, 2) * 2), col);
      for (const lt of [t0 + 1.5, t1 - 3]) {
        const [lx, lz] = lpt(n, lt, DEPTH + 2.5);
        lantern(m, lx - 1, y + 11, lz - 1, (si + n) % 3 === 0 ? "#f4ecd8" : "#ff4a2a");
        m.box(lx, y + 17, lz, lx + 1, y + 18, lz + 1, black);
      }
      // the cooking line along the back wall
      const [bx, bz] = lpt(n, tm, 6);
      const kitchen = (dt: number) => lpt(n, tm + dt, 6);
      lbox(n, t0 + 0.5, t1 - 0.5, 2, 8, y, y + 6, steelD);
      lbox(n, t0 + 0.5, t1 - 0.5, 2, 8, y + 6, y + 7, steel);
      // exhaust hood
      lbox(n, t0 + 1, t1 - 1, 2, 9, y + 19, y + 21, steel);
      lbox(n, t0 + 1, t1 - 1, 8, 9, y + 18, y + 19, steelD);
      if (st.kind === "wok") {
        for (const dt of [-4, 4]) {
          const [wx, wz] = kitchen(dt);
          m.cylinder(wx + 0.5, y + 7, wz + 0.5, 2.6, 1, ember);
          m.cylinder(wx + 0.5, y + 8, wz + 0.5, 3.2, 1, C("#2a2a30"), true);
          m.cylinder(wx + 0.5, y + 8, wz + 0.5, 2, 1, C("#e8c060"));
          steams.push([wx + 0.5, y + 12, wz + 0.5]);
        }
        const [ax, az] = kitchen(0);
        m.box(ax, y + 7, az, ax + 1, y + 9, az + 1, C("#e8e0c0")); // bottles of sauce
      } else if (st.kind === "pot") {
        for (const dt of [-4, 4]) {
          const [wx, wz] = kitchen(dt);
          m.cylinder(wx + 0.5, y + 7, wz + 0.5, 2.4, 1, ember);
          m.cylinder(wx + 0.5, y + 8, wz + 0.5, 2.6, 5, steel);
          m.cylinder(wx + 0.5, y + 12, wz + 0.5, 1.8, 1, C(st.name.startsWith("LAKSA") ? "#e07a2a" : "#e8d8b0"));
          steams.push([wx + 0.5, y + 15, wz + 0.5]);
        }
        const [ax, az] = kitchen(0);
        m.box(ax - 1, y + 7, az - 1, ax + 1, y + 9, az + 1, C("#e8e4d8"));
      } else if (st.kind === "grill") {
        lbox(n, tm - 6, tm + 6, 3, 7, y + 7, y + 8, ember);
        for (let i = -5; i <= 5; i += 2) lbox(n, tm + i, tm + i + 1, 3.5, 6.5, y + 8, y + 9, C(i % 4 ? "#8a3a1a" : "#b85a2a"));
        lbox(n, tm - 6, tm + 6, 2.5, 3.5, y + 7, y + 10, C("#2a2a30"));
        steams.push([bx + 0.5, y + 12, bz + 0.5]);
      } else if (st.kind === "steam") {
        for (const dt of [-4, 0, 4]) {
          const [wx, wz] = kitchen(dt);
          for (let l = 0; l < 3 + ((dt + 4) % 3); l++) {
            m.cylinder(wx + 0.5, y + 7 + l * 2, wz + 0.5, 2.3, 2, C(l % 2 ? "#c8a060" : "#d8b878"));
            m.cylinder(wx + 0.5, y + 8 + l * 2, wz + 0.5, 2.4, 1, C("#a8844a"), true);
          }
          steams.push([wx + 0.5, y + 15, wz + 0.5]);
        }
      } else if (st.kind === "roast") {
        // roast ducks and chickens hanging in the window over the counter, a chopping block
        lbox(n, t0 + 1, t1 - 1, DEPTH - 2, DEPTH - 1, y + 16, y + 17, steelD);
        for (let i = 0; i < 5; i++) {
          const [hx, hz] = lpt(n, t0 + 2.5 + i * ((t1 - t0 - 5) / 4), DEPTH - 1.5);
          m.box(hx, y + 13, hz, hx + 1, y + 16, hz + 1, steelD);
          m.blob(hx + 0.5, y + 11.5, hz + 0.5, 1.8, C(i % 2 ? "#b8602a" : "#9a4a20"), 0.15, i);
        }
        const [ax, az] = kitchen(-3);
        m.cylinder(ax + 0.5, y + 7, az + 0.5, 2.5, 2, C("#c8a070"));
        const [rx, rz] = kitchen(4);
        m.cylinder(rx + 0.5, y + 7, rz + 0.5, 2.2, 4, steel); // rice warmer
        steams.push([rx + 0.5, y + 13, rz + 0.5]);
      } else if (st.kind === "drink") {
        // glass-door fridges, juice machine, an ice shaver
        lbox(n, t0 + 1, tm, 2, 5, y, y + 14, C("#d8dce4"));
        lbox(n, t0 + 1.5, tm - 0.5, 5, 5.8, y + 1, y + 13, G("#9ac8e8"));
        for (let yy = y + 3; yy < y + 13; yy += 3) lbox(n, t0 + 1.5, tm - 0.5, 4, 5, yy, yy + 1, E(["#ff6a6a", "#6ad0ff", "#ffe06a", "#8aff8a"][(yy / 3) % 4 | 0], 0.9));
        const [jx, jz] = kitchen(4);
        for (const [dx, cc] of [
          [-2, "#ff8a3a"],
          [1, "#8ad04a"],
        ] as [number, string][]) {
          m.box(jx + dx, y + 7, jz, jx + dx + 2, y + 11, jz + 2, G("#cfe4f0"));
          m.box(jx + dx, y + 7, jz, jx + dx + 2, y + 10, jz + 2, C(cc));
        }
      } else if (st.kind === "griddle") {
        lbox(n, tm - 6, tm + 6, 2.5, 7, y + 7, y + 8, C("#2a2a30"));
        for (let i = -5; i <= 4; i += 3) lbox(n, tm + i, tm + i + 2, 3.5, 5.5, y + 8, y + 9, C(st.name.startsWith("KAYA") ? "#d8a050" : "#e8d8b0"));
        lbox(n, tm - 6, tm + 6, 2.2, 2.6, y + 6, y + 7, E("#ff6a1a", 1.4));
        steams.push([bx + 0.5, y + 12, bz + 0.5]);
      } else if (st.kind === "fryer") {
        // takoyaki plate: a grid of round wells, and a deep fryer
        lbox(n, tm - 6, tm, 2.5, 7, y + 7, y + 8, C("#2a2a30"));
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
          const [px, pz] = lpt(n, tm - 5 + i * 2, 3.5 + j * 2);
          m.set(px, y + 8, pz, C("#d89a4a"));
        }
        const [fx, fz] = kitchen(4);
        m.box(fx - 2, y + 7, fz - 2, fx + 2, y + 10, fz + 2, steel);
        m.box(fx - 1, y + 10, fz - 1, fx + 1, y + 11, fz + 1, E("#ffb03a", 1.2));
        steams.push([fx + 0.5, y + 13, fz + 0.5]);
      }
      // gas cylinders and crates behind the stall, outside the back wall
      const [gx, gz] = lpt(n, t0 + 2, -2);
      m.cylinder(gx + 0.5, FL, gz + 0.5, 1.3, 6, C(si % 2 ? "#c0302a" : "#3a6a9a"));
      const [cx2, cz2] = lpt(n, t1 - 3, -2.5);
      m.box(cx2 - 1, FL, cz2 - 1, cx2 + 2, FL + 3, cz2 + 2, C("#3a7a4a"));
      m.box(cx2 - 1, FL + 3, cz2 - 1, cx2 + 2, FL + 5, cz2 + 2, C("#c0802a"));
      // the cook stands between the cooking line and the counter
      const [kx, kz] = world(n, tm, 10);
      const idx = cooks.length;
      cooks.push([kx, FL, kz]);
      points[`stall${idx}`] = [kx, FL, kz];
      // a neon name where the board faces the street or the side
      const [sx, sz] = world(n, tm, DEPTH + 2.6);
      if (n === 4) signs.push({ text: st.name, color: st.color === "#1f2a5a" ? "#7ab0ff" : "#ffd28a", x: sx, y: y + 20, z: sz + 0.1, w: t1 - t0 - 2, h: 3.4, vertical: false, facing: "front" });
      if (n === 6) signs.push({ text: st.name, color: "#ffd28a", x: sx + 0.1, y: y + 20, z: sz, w: t1 - t0 - 2, h: 3.4, vertical: false, facing: "side" });
      // collision: the stall footprint in a few axis-aligned pieces
      for (let q = 0; q < 3; q++) {
        const ta = t0 + ((t1 - t0) * q) / 3,
          tb = t0 + ((t1 - t0) * (q + 1)) / 3;
        const cs = [world(n, ta, -1), world(n, tb, -1), world(n, ta, DEPTH), world(n, tb, DEPTH)];
        const xs = cs.map((p) => p[0]),
          zs = cs.map((p) => p[1]);
        walls.push([Math.floor(Math.min(...xs)), Math.floor(Math.min(...zs)), Math.ceil(Math.max(...xs)), Math.ceil(Math.max(...zs))]);
      }
    }

  // ---- the teh tarik bar under the tower ------------------------------------------------------
  const barR = 8;
  m.cylinder(cx, FL, cz, barR, 6, C("#7a2a1a"));
  m.cylinder(cx, FL, cz, barR - 2.5, 6, 0 as unknown as number);
  for (let z = cz - barR - 1; z <= cz + barR + 1; z++)
    for (let x = cx - barR - 1; x <= cx + barR + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d <= barR + 0.6 && d >= barR - 3) m.set(x, FL + 6, z, steel);
      if (d < barR - 2.5) m.set(x, FL - 1, z, C("#6a5a4a"));
    }
  m.cylinder(cx, FL, cz, 2.5, 54, iron); // the tower's iron foot
  for (let y = FL + 8; y < 56; y += 10) m.cylinder(cx, y, cz, 3.2, 1, ironS);
  // urns, cups, the pulled-tea pitchers
  for (const [dx, dz] of [
    [-4, -1],
    [3, 1],
    [-1, 3],
  ]) {
    m.cylinder(cx + dx, FL + 7, cz + dz, 1.3, 4, C("#c8a050"));
    steams.push([cx + dx, FL + 13, cz + dz]);
  }
  for (let a = 0; a < 12; a++) m.set(cx + Math.round(Math.cos(a) * 7), FL + 7, cz + Math.round(Math.sin(a) * 7), C(a % 2 ? "#f4ecd8" : "#e8b04a"));
  // ring canopy with the bar's name
  for (let z = cz - 12; z <= cz + 12; z++)
    for (let x = cx - 12; x <= cx + 12; x++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d < 11) m.set(x, FL + 22, z, C("#7a2a1a"));
      if (d >= 9.8 && d < 11) m.box(x, FL + 18, z, x + 1, FL + 22, z + 1, C("#f4ecd8"));
      if (d >= 10.6 && d < 11.4) m.set(x, FL + 17, z, E("#ffd08a", 1.4));
    }
  for (let a = 0; a < 8; a++) lantern(m, cx + Math.round(Math.cos(a * 0.785) * 10) - 1, FL + 11, cz + Math.round(Math.sin(a * 0.785) * 10) - 1, a % 2 ? "#ff4a2a" : "#ffd08a");
  signs.push({ text: "TEH TARIK 拉茶", color: "#ffb347", x: cx, y: FL + 20, z: cz + 11.2, w: 14, h: 3.2, vertical: false, facing: "front" });
  const barIdx = cooks.length;
  points[`stall${barIdx}`] = [cx + 0.5, FL, cz - 4.5];
  points[`stall${barIdx + 1}`] = [cx + 4.5, FL, cz + 0.5];
  walls.push([cx - barR, cz - barR, cx + barR, cz + barR]);

  // ---- tables and stools ---------------------------------------------------------------------
  const seats: [number, number, number][] = [];
  const marble = C("#e8e4dc"),
    stoolCols = ["#c0302a", "#2f5aa8", "#e8b820", "#2f8a4a"];
  const table = (tx: number, tz: number, round: boolean, sc: string, outside = false) => {
    const y = outside ? 1 : FL;
    m.box(tx, y, tz, tx + 1, y + 4, tz + 1, C("#5a5a62"));
    m.box(tx - 1, y, tz - 1, tx + 2, y + 1, tz + 2, C("#5a5a62"));
    if (round) m.cylinder(tx + 0.5, y + 4, tz + 0.5, 3.4, 1, marble);
    else m.box(tx - 3, y + 4, tz - 3, tx + 4, y + 5, tz + 4, marble);
    // condiments and a bowl or two
    m.set(tx, y + 5, tz, C("#c0302a"));
    if (hash(tx, tz, 1, seed) > 0.4) m.set(tx + 2, y + 5, tz - 1, C("#f0ece0"));
    if (hash(tx, tz, 2, seed) > 0.5) m.set(tx - 2, y + 5, tz + 1, C("#e8c060"));
    for (const [dx, dz] of [
      [-6, 0],
      [6, 0],
      [0, -6],
      [0, 6],
    ]) {
      const sx = tx + dx,
        sz = tz + dz;
      m.box(sx, y, sz, sx + 1, y + 2, sz + 1, C("#5a5a62"));
      m.box(sx - 1, y + 2, sz - 1, sx + 2, y + 3, sz + 2, C(sc));
      seats.push([sx + 0.5, y + 3, sz + 0.5]);
    }
  };
  const spots: [number, number][] = [];
  const innerCols = Array.from({ length: 8 }, (_, n) => world(n, -CLR * Math.tan(Math.PI / 8), A - CLR));
  for (let j = -4; j <= 4; j++)
    for (let i = -4; i <= 4; i++) {
      const tx = cx + i * 14 + (j % 2 ? 7 : 0),
        tz = cz + j * 13;
      const px = tx + 0.5 - cx,
        pz = tz + 0.5 - cz;
      if (r8(px, pz) > A - DEPTH - 8 || Math.hypot(px, pz) < barR + 8.5) continue;
      if (innerCols.some(([qx, qz]) => Math.hypot(tx - qx, tz - qz) < 8.5)) continue;
      spots.push([tx, tz]);
    }
  spots.forEach(([tx, tz], i) => table(tx, tz, i % 3 !== 2, stoolCols[i % stoolCols.length]));

  // ---- the iron frame: columns, arches with filigree, clerestory, roofs ------------------------
  const column = (x: number, z: number, y1: number) => {
    m.box(x - 1, FL, z - 1, x + 2, FL + 3, z + 2, ironS);
    m.box(x, FL, z, x + 1, y1, z + 1, iron);
    m.box(x - 1, FL + 12, z - 1, x + 2, FL + 13, z + 2, ironS);
    m.box(x - 1, y1 - 2, z - 1, x + 2, y1, z + 2, ironS);
  };
  const outerCols: [number, number][] = [];
  for (let n = 0; n < 8; n++) {
    for (const t of [-half, 0]) {
      const [x, z] = lpt(n, t, 1);
      column(x, z, EAVE);
      outerCols.push([x, z]);
    }
    // inner ring: columns up to the clerestory at its corners
    const [ix, iz] = world(n, -CLR * Math.tan(Math.PI / 8), A - CLR);
    column(Math.floor(ix), Math.floor(iz), 46);
  }
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const px = x + 0.5 - cx,
        pz = z + 0.5 - cz;
      const q = r8(px, pz);
      if (q > A + 6) continue;
      const ang = Math.atan2(px, pz); // 0 at the front, turning to +x
      // position within a bay between two columns (16 bays round)
      const bay = (((ang / (Math.PI / 8)) % 1) + 1) % 1;
      // eave beam and filigree arches between the outer columns
      if (q >= A - 0.5 && q < A + 1) {
        m.box(x, EAVE - 2, z, x + 1, EAVE + 1, z + 1, iron);
        // a round arch springing from each column; the spandrels above it filled with lace
        const archTop = EAVE - 11 + Math.round(8 * Math.sqrt(Math.max(0, 1 - (2 * bay - 1) ** 2)));
        const bi = Math.floor(bay * 48);
        for (let y = archTop; y < EAVE - 2; y++) {
          const lace = y === archTop || y === archTop + 1 || ((y + bi) % 4 === 0 && (y - bi + 400) % 4 === 0);
          if (lace) m.set(x, y, z, y === archTop ? ironS : iron);
        }
      }
      // cast-iron valance hanging from the eave, scalloped
      if (q >= A + 4 && q < A + 5) {
        const sc = Math.floor(bay * 64) % 4;
        m.box(x, EAVE - (sc === 1 ? 1 : 0), z, x + 1, EAVE + 1, z + 1, ironS);
      }
      // lower roof: from the eave up to the clerestory, slate in courses, lead on the hips
      const hip = Math.abs(((((ang - Math.PI / 8) / (Math.PI / 4)) % 1) + 1) % 1 - 0.5) > 0.47;
      if (q >= CLR && q < A + 5) {
        const yr = Math.round(46 - ((q - CLR) * 15) / (A + 5 - CLR));
        m.box(x, yr - 1, z, x + 1, yr + 1, z + 1, Math.round(q) % 4 === 0 ? slateB : slate);
        if (hip) m.box(x, yr, z, x + 1, yr + 2, z + 1, lead);
        m.set(x, yr - 2, z, wood); // the boarded ceiling seen from inside
      }
      // clerestory: louvred band between the roofs, filigree posts
      if (q >= CLR - 1 && q < CLR + 0.5) {
        for (let y = 45; y < 57; y++) m.set(x, y, z, y === 45 || y === 56 ? iron : Math.floor(bay * 48) % 6 === 0 ? iron : y % 2 ? C("#5a6a62") : 0);
      }
      // upper roof up to the tower
      if (q >= 11 && q < CLR + 0.5) {
        const yr = Math.round(56 + ((CLR - q) * 10) / (CLR - 11));
        m.box(x, yr - 1, z, x + 1, yr + 1, z + 1, Math.round(q) % 4 === 0 ? slateB : slate);
        if (hip) m.box(x, yr, z, x + 1, yr + 2, z + 1, lead);
        m.set(x, yr - 2, z, wood);
      }
      // eave gutter, cream
      if (q >= A + 4.5 && q < A + 5.5) m.box(x, EAVE + 1, z, x + 1, EAVE + 3, z + 1, iron);
    }
  // a ring of bulbs under the eave and red lanterns hanging off every outer column
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const q = r8(x + 0.5 - cx, z + 0.5 - cz);
      if (q >= A + 4.6 && q < A + 5.6 && (x + z) % 4 === 0) m.set(x, EAVE - 1, z, E("#ffb45a", 1.6));
    }
  for (let n = 0; n < 8; n++)
    for (const t of [-half, 0]) {
      const [lx, lz] = lpt(n, t, -3.5);
      m.box(lx + 1, EAVE - 6, lz + 1, lx + 2, EAVE, lz + 2, black);
      lantern(m, lx, EAVE - 12, lz, n === 0 || t === 0 ? "#ff3a2a" : "#ff6a2a");
    }
  // ridge cresting along the hips and finials at the corners
  for (let n = 0; n < 8; n++) {
    const a = (n * Math.PI) / 4 + Math.PI / 8;
    for (const [q, yb] of [
      [A + 5, EAVE + 2],
      [CLR, 47],
    ]) {
      const rr = q / Math.cos(Math.PI / 8);
      const x = Math.floor(cx + Math.sin(a) * rr),
        z = Math.floor(cz + Math.cos(a) * rr);
      m.box(x, yb, z, x + 1, yb + 5, z + 1, iron);
      m.box(x - 1, yb + 4, z - 1, x + 2, yb + 5, z + 2, goldC);
      m.set(x, yb + 6, z, goldC);
    }
  }

  // ---- clock tower and spire -----------------------------------------------------------------
  const TA = 11;
  for (let z = cz - TA - 2; z <= cz + TA + 2; z++)
    for (let x = cx - TA - 2; x <= cx + TA + 2; x++) {
      const px = x + 0.5 - cx,
        pz = z + 0.5 - cz;
      const q = r8(px, pz);
      const ang = Math.atan2(px, pz);
      const corner = Math.abs(((((ang - Math.PI / 8) / (Math.PI / 4)) % 1) + 1) % 1 - 0.5) > 0.42;
      if (q < TA) {
        for (let y = 60; y < 96; y++) {
          let c = q >= TA - 1 ? (corner ? ironS : C("#ece4d0")) : ironS;
          if (q >= TA - 1 && !corner && y >= 62 && y < 70) c = y % 2 ? C("#5a6a62") : iron; // louvred belfry
          m.set(x, y, z, c);
        }
      }
      // cornices
      for (const yc of [60, 70, 88, 95]) if (q < TA + (yc === 95 ? 2 : 1)) m.box(x, yc, z, x + 1, yc + 1, z + 1, yc === 95 ? ironS : iron);
      // spire: an octagonal pyramid in slate with lead hips
      for (let y = 96; y < 118; y++) {
        const rr = TA * (1 - (y - 96) / 22);
        if (q < rr) m.set(x, y, z, corner ? lead : (y >> 1) % 2 ? slate : slateB);
      }
    }
  m.box(cx, 118, cz, cx + 1, 123, cz + 1, goldC);
  m.box(cx - 1, 119, cz - 1, cx + 2, 121, cz + 2, goldC);
  // clock faces on the four flats, lit at night, hands at ten past ten
  for (const n of [0, 2, 4, 6]) {
    const [nx, nz] = nrm(n),
      [tx, tz] = tng(n);
    const fx = cx + nx * TA,
      fz = cz + nz * TA;
    for (let v = -7; v <= 7; v++)
      for (let u = -7; u <= 7; u++) {
        const d = Math.hypot(u, v);
        if (d > 6.8) continue;
        const X = Math.floor(fx + tx * (u + 0.5) + nx * 0.5 - (nx > 0 ? 0.5 : 0)),
          Z = Math.floor(fz + tz * (u + 0.5) + nz * 0.5 - (nz > 0 ? 0.5 : 0));
        const y = 79 + v;
        let c = d > 5.8 ? goldC : E("#ffd27a", 1.05);
        const ang = Math.atan2(u, v);
        if (d > 4.6 && d <= 5.8 && Math.abs(((ang / (Math.PI / 6)) % 1 + 1) % 1 - 0.5) > 0.38) c = black;
        // hour hand to 10, minute hand to 2
        const hand = (a: number, len: number) => d <= len && Math.abs(u * Math.cos(a) - v * Math.sin(a)) < 0.6 && u * Math.sin(a) + v * Math.cos(a) >= 0;
        if (hand((-60 * Math.PI) / 180, 3.5) || hand((60 * Math.PI) / 180, 5) || d < 0.8) c = black;
        m.set(X, y, Z, c);
      }
  }

  // ---- inside life: ceiling fans and strings of bulbs ------------------------------------------
  for (let n = 0; n < 8; n++) {
    const [fx, fz] = world(n, 0, A - 22).map(Math.floor);
    m.box(fx, 30, fz, fx + 1, 50, fz + 1, black);
    m.box(fx - 1, 30, fz - 1, fx + 2, 31, fz + 2, C("#5a4a3a"));
    const rot = n % 2;
    m.box(fx - 6, 30, fz, fx + 7, 31, fz + 1, rot ? C("#6a5040") : C("#5a4434"));
    m.box(fx, 30, fz - 6, fx + 1, 31, fz + 7, rot ? C("#5a4434") : C("#6a5040"));
    m.set(fx, 29, fz, E("#ffe0a8", 1.4));
  }
  const bulb = E("#ffd08a", 1.7),
    wire = C("#2a2a30");
  const stringLights = (x0: number, z0: number, x1: number, z1: number, y: number, sag: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let i = 0; i <= len; i++) {
      const t = i / len;
      const yy = Math.round(y - sag * 4 * t * (1 - t));
      m.set(x0 + (x1 - x0) * t, yy, z0 + (z1 - z0) * t, i % 3 === 0 ? bulb : wire);
    }
  };
  const inner = Array.from({ length: 8 }, (_, n) => world(n, -CLR * Math.tan(Math.PI / 8), A - CLR).map(Math.floor));
  for (let n = 0; n < 8; n++) {
    const [ax, az] = inner[n],
      [bx, bz] = inner[(n + 1) % 8];
    stringLights(ax, az, bx, bz, 34, 4);
    const [ox, oz] = lpt(n, -half, 1);
    stringLights(ax, az, ox, oz, 32, 3);
  }

  // ---- the front: open side with steps, a gable over the entrance and the name -----------------
  const fz = cz + A; // front edge of the platform (first layer outside)
  for (let x = cx - Math.floor(half) + 2; x < cx + Math.ceil(half) - 2; x++) m.box(x, 0, fz + 1, x + 1, 1, fz + 4, C("#9a9488"));
  // a gabled pediment on the front roof slope holding the name board
  const gw = 46;
  for (let y = EAVE + 1; y < EAVE + 22; y++) {
    const hw = Math.round(gw / 2 - (y - EAVE - 1) * 1.15);
    if (hw <= 0) break;
    m.box(cx - hw, y, fz - 1, cx + hw, y + 1, fz + 3, iron);
    m.box(cx - hw - 1, y, fz + 3, cx - hw + 1, y + 1, fz + 4, slate);
    m.box(cx + hw - 1, y, fz + 3, cx + hw + 1, y + 1, fz + 4, slate);
  }
  // fanlight in the pediment: a half wheel of iron spokes over glass
  for (let y = EAVE + 1; y < EAVE + 12; y++)
    for (let x = cx - 12; x <= cx + 12; x++) {
      const dx = x + 0.5 - cx,
        dy = y - EAVE - 1;
      const d = Math.hypot(dx, dy);
      if (d > 11) continue;
      const spoke = Math.abs(((Math.atan2(dy, dx) / (Math.PI / 8)) % 1) - 0.5) > 0.4 || d > 10 || d < 2.5;
      m.set(x, y, fz + 3, spoke ? iron : E("#ffcf8a", 1.0));
    }
  m.set(cx, EAVE + 22, fz + 1, goldC);
  // the name board, standing on the eave in front of the pediment
  const nb0 = cx - 44,
    nb1 = cx + 44;
  m.box(nb0, EAVE + 12, fz + 4, nb1, EAVE + 19, fz + 5, black);
  m.box(nb0 - 1, EAVE + 11, fz + 4, nb1 + 1, EAVE + 12, fz + 6, ironD);
  m.box(nb0 - 1, EAVE + 19, fz + 4, nb1 + 1, EAVE + 20, fz + 6, ironD);
  for (const x of [nb0 - 1, nb1]) m.box(x, EAVE + 1, fz + 4, x + 1, EAVE + 20, fz + 5, ironD);
  for (let x = nb0; x < nb1; x += 4) m.set(x, EAVE + 20, fz + 5, E("#ffd08a", 1.6));
  signs.push({ text: "HAWKER 屋台 · ZEC FOOD HALL", color: "#ffb347", x: cx, y: EAVE + 15.5, z: fz + 5.1, w: nb1 - nb0 - 2, h: 6, vertical: false, facing: "front" });

  // ---- forecourt: satay and yatai carts, umbrella tables, lamps, palms --------------------------
  const yatai = (x: number, z: number, cloth: string, kindSeed: number) => {
    // a wooden cart facing the street, on two wheels, a charcoal grill, a little roof with noren
    m.box(x, 4, z, x + 18, 10, z + 8, wood);
    m.box(x, 10, z - 1, x + 18, 11, z + 9, P.woodLight);
    m.box(x + 1, 11, z + 1, x + 10, 12, z + 5, C("#2a2a30"));
    m.box(x + 1, 12, z + 2, x + 10, 13, z + 4, ember);
    for (let i = 1; i < 10; i += 2) m.box(x + i, 13, z + 1, x + i + 1, 14, z + 5, C(i % 4 === 1 ? "#8a3a1a" : "#b85a2a"));
    m.box(x + 12, 11, z + 1, x + 16, 14, z + 4, C("#d8d0b8"));
    for (const wx of [x + 2, x + 13]) {
      m.box(wx, 1, z - 1, wx + 4, 5, z, C("#3a2a20"));
      m.box(wx + 1, 2, z - 1, wx + 3, 4, z, C("#6a5040"));
    }
    m.box(x, 1, z + 2, x + 1, 4, z + 3, C("#3a2a20"));
    for (const px of [x, x + 17]) m.box(px, 11, z + 7, px + 1, 26, z + 8, wood);
    for (let dz = -2; dz < 11; dz++) m.box(x - 1, 26 + (dz < 4 ? 0 : 0), z + dz, x + 19, 27, z + dz + 1, dz % 3 ? C("#6a2a1a") : C("#4a1e14"));
    m.box(x - 1, 27, z + 3, x + 19, 28, z + 5, C("#4a1e14"));
    const nc = C(cloth);
    for (let i = 0; i < 6; i++) m.box(x + i * 3, 21, z + 10, x + i * 3 + 2, 26, z + 11, nc);
    m.set(x + 8, 23, z + 10, P.white);
    lantern(m, x - 1, 19, z + 9);
    lantern(m, x + 16, 19, z + 9);
    m.box(x + 2, 1, z + 9, x + 16, 4, z + 11, P.woodLight); // bench seat in front
    steams.push([x + 5.5, 16, z + 3]);
    // stools around a crate table beside the cart
    void kindSeed;
  };
  const front0 = fz + 6;
  const carts: [number, number, string][] = [
    [6, D - 30, "#2a3a6a"],
    [W - 25, D - 30, "#6a1f24"],
    [Math.round(cx - 9), D - 20, "#3a5a3a"],
  ];
  for (const [x, z, cl] of carts) {
    yatai(x, Math.max(front0, z), cl, x);
    seats.push([x + 4.5, 4, Math.max(front0, z) + 10], [x + 13.5, 4, Math.max(front0, z) + 10]);
  }
  const umbrella = (x: number, z: number, cA: string, cB: string) => {
    m.box(x, 1, z, x + 1, 22, z + 1, C("#d8d4cc"));
    for (let y = 0; y < 3; y++)
      m.cylinder(x + 0.5, 22 + y, z + 0.5, 9 - y * 3, 1, (xx, _y, zz) => (Math.floor((Math.atan2(zz + 0.5 - z - 0.5, xx + 0.5 - x - 0.5) / Math.PI) * 4 + 4) % 2 ? C(cA) : C(cB)));
    m.set(x, 25, z, C(cA));
    table(x, z, true, cA === "#f4ecd8" ? "#c0302a" : cA, true);
  };
  umbrella(18, cz - 18, "#c0302a", "#f4ecd8");
  umbrella(W - 19, cz - 18, "#2f6aa8", "#f4ecd8");
  umbrella(18, cz + 14, "#2f8a4a", "#f4ecd8");
  umbrella(W - 19, cz + 14, "#e8b820", "#3a2a20");
  // Victorian lamp posts at the forecourt corners, cream iron with lantern heads
  const lamp = (x: number, z: number) => {
    m.box(x - 1, 1, z - 1, x + 2, 3, z + 2, ironD);
    m.box(x, 3, z, x + 1, 24, z + 1, ironD);
    m.box(x - 2, 21, z, x + 3, 22, z + 1, ironD);
    for (const lx of [x - 2, x + 2]) {
      m.box(lx, 22, z, lx + 1, 25, z + 1, E("#ffd08a", 1.6));
      m.set(lx, 25, z, ironD);
    }
    m.set(x, 25, z, ironD);
  };
  lamp(4, fz + 2);
  lamp(W - 5, fz + 2);
  lamp(4, 10);
  lamp(W - 5, 10);
  // palms in round planters
  const palm = (x: number, z: number, s: number) => {
    m.cylinder(x + 0.5, 1, z + 0.5, 4, 4, C("#8a8478"));
    m.cylinder(x + 0.5, 4, z + 0.5, 3.2, 1, P.soil);
    const h = 28 + Math.floor(hash(x, z, s) * 8);
    for (let y = 4; y < h; y++) m.set(x + Math.round(Math.sin(y * 0.12) * 1.2), y, z, (y >> 1) % 2 ? C("#7a6040") : C("#6a5034"));
    const tx = x + Math.round(Math.sin(h * 0.12) * 1.2);
    for (let a = 0; a < 7; a++) {
      const an = a * 0.9 + s;
      for (let i = 1; i < 11; i++) m.set(tx + Math.round(Math.cos(an) * i), h + 2 - Math.round((i * i) / 18), z + Math.round(Math.sin(an) * i), i % 2 ? C("#3d8a4a") : C("#2f6b3c"));
    }
    m.box(tx - 1, h, z - 1, tx + 2, h + 2, z + 2, C("#2f6b3c"));
  };
  palm(10, cz - 2, 1);
  palm(W - 11, cz - 2, 2);
  palm(cx - 34, D - 6, 3);
  palm(cx + 34, D - 6, 4);
  // bike rack and a bin by the side
  for (let z = 22; z < 40; z += 3) m.box(W - 8, 1, z, W - 7, 5, z + 1, C("#5a5a62"));
  m.box(6, 1, 26, 10, 7, 30, C("#2f6a4a"));

  // ---- points and the rest -------------------------------------------------------------------
  seats.forEach((s, i) => (points[`seat${i}`] = s));
  steams.forEach((s, i) => (points[`steam${i}`] = s));
  lights.push([cx, 26, cz, "#ffd08a"], [cx, 20, cz - A + 20, "#ffc070"], [cx - A + 20, 20, cz, "#ffc070"], [cx + A - 20, 20, cz, "#ffc070"], [cx, 18, fz + 10, "#ffb060"]);
  // collision: stall counters and back walls (above), the bar, carts, planters
  for (const [x, z] of carts) walls.push([x - 1, Math.max(front0, z) - 1, x + 19, Math.max(front0, z) + 9]);
  void r;
  return { model: m, signs, door: [cx, Math.min(D - 2, fz + 6)], body: [0, 0, W, D], lights, walls, points, scale: k };
}
