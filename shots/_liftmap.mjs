// node shots/_liftmap.mjs key:floor[,key:floor] [--port 3035] : a top view of a floor (everything above
// floor + 2.6 m cut away) with its colliders (red), lift cars / cores (cyan), the spawn (green) and a
// 5 m grid with coordinates; saved to $OUT/map-key-floor.png
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3035";
const list = args.find((a) => !a.startsWith("--") && a !== port).split(",");
const OUT = process.env.OUT ?? "/tmp";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1100, height: 1100 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=day`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await wait(3000);
for (const kf of list) {
  const [k, f, ...win] = kf.split(":");
  await p.evaluate(
    (k, n, win) => {
      const I = street.interiors;
      if (I.active?.key !== k) I.enter(k, n);
      I.goTo(n);
      document.getElementById("ui").style.display = "none";
      const W = I.walk;
      W.enabled = false;
      const rects = I.collidersOf(n);
      const fl = I.active.floors[n];
      const xs = rects.flatMap((r) => [r[0], r[2]]),
        zs = rects.flatMap((r) => [r[1], r[3]]);
      const x0 = Math.max(Math.min(...xs), fl.spawn.x - 60), x1 = Math.min(Math.max(...xs), fl.spawn.x + 60), z0 = Math.max(Math.min(...zs), fl.spawn.z - 60), z1 = Math.min(Math.max(...zs), fl.spawn.z + 60);
      let cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ext = Math.max(x1 - x0, z1 - z0) + 4;
      // a window to zoom into: x0:z0:x1:z1
      if (win.length === 4) {
        const [a, b2, c2, d] = win.map(Number);
        cx = (a + c2) / 2;
        cz = (b2 + d) / 2;
        ext = Math.max(c2 - a, d - b2);
      }
      const H = 400;
      const cam = W.camera;
      cam.position.set(cx, fl.y + H, cz);
      cam.rotation.set(-Math.PI / 2, 0, 0);
      cam.fov = (2 * Math.atan(ext / 2 / H) * 180) / Math.PI;
      cam.near = H - 2.6;
      cam.far = H + 30;
      cam.aspect = 1;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      window.__map = { cx, cz, ext, rects, spawn: [fl.spawn.x, fl.spawn.z], circ: [...I.circ.cars.filter((c) => c.floor === n).map((c) => c.rects), ...I.circ.flights.filter((f) => f.decl.from === n || f.decl.to === n).map((f) => [f.decl.zone])], cars: I.circ.cars.filter((c) => c.floor === n).map((c) => [c.spot.x, c.spot.z, c.spot.yaw]) };
    },
    k,
    Number(f),
    win,
  );
  await wait(1500);
  await p.evaluate(() => {
    const m = window.__map;
    let c = document.getElementById("__ov");
    if (!c) {
      c = document.createElement("canvas");
      c.id = "__ov";
      c.style.cssText = "position:fixed;left:0;top:0;z-index:99999;pointer-events:none";
      document.body.appendChild(c);
    }
    const S = Math.min(innerWidth, innerHeight);
    c.width = innerWidth;
    c.height = innerHeight;
    const g = c.getContext("2d");
    const ox = innerWidth / 2, oy = innerHeight / 2, k = S / m.ext;
    const X = (x) => ox + (x - m.cx) * k, Y = (z) => oy + (z - m.cz) * k;
    g.lineWidth = 1;
    g.strokeStyle = "rgba(255,40,40,0.9)";
    for (const r of m.rects) g.strokeRect(X(r[0]), Y(r[1]), (r[2] - r[0]) * k, (r[3] - r[1]) * k);
    g.strokeStyle = "rgba(0,240,255,1)";
    g.lineWidth = 2;
    for (const rs of m.circ) for (const r of rs) g.strokeRect(X(r[0]), Y(r[1]), (r[2] - r[0]) * k, (r[3] - r[1]) * k);
    g.fillStyle = "#f0f";
    for (const [x, z, yaw] of m.cars) {
      g.beginPath();
      g.moveTo(X(x), Y(z));
      g.lineTo(X(x - Math.sin(yaw) * 2.5), Y(z - Math.cos(yaw) * 2.5));
      g.strokeStyle = "#f0f";
      g.lineWidth = 3;
      g.stroke();
    }
    g.fillStyle = "#0f0";
    g.beginPath();
    g.arc(X(m.spawn[0]), Y(m.spawn[1]), 6, 0, 7);
    g.fill();
    g.font = "bold 13px monospace";
    g.strokeStyle = "rgba(0,0,160,0.35)";
    g.lineWidth = 1;
    const st = m.ext > 80 ? 10 : m.ext > 30 ? 5 : m.ext > 12 ? 2 : 1;
    const label = (t, x, y) => {
      g.fillStyle = "rgba(255,255,0,0.85)";
      g.fillRect(x - 1, y - 12, g.measureText(t).width + 3, 15);
      g.fillStyle = "#000";
      g.fillText(t, x, y);
    };
    for (let x = Math.ceil((m.cx - m.ext / 2) / st) * st; x < m.cx + m.ext / 2; x += st) {
      g.beginPath();
      g.moveTo(X(x), 0);
      g.lineTo(X(x), innerHeight);
      g.stroke();
      label(String(x), X(x) + 2, 14);
    }
    for (let z = Math.ceil((m.cz - m.ext / 2) / st) * st; z < m.cz + m.ext / 2; z += st) {
      g.beginPath();
      g.moveTo(0, Y(z));
      g.lineTo(innerWidth, Y(z));
      g.stroke();
      label(String(z), 2, Y(z) - 2);
    }
  });
  await p.screenshot({ path: `${OUT}/map-${k}-${f}.png` });
  console.log("saved", `${OUT}/map-${k}-${f}.png`);
}
await b.close();
