// node shots/_libzips.mjs "name:x,z,yaw,floor,pitch[,click]|..." [day|night] [port]
// Library ZIP archive / news checks: screenshot per view; with click=1 also clicks the screen centre and shoots the panel.
import puppeteer from "puppeteer-core";
const [viewsArg, theme = "day", port = "3034"] = process.argv.slice(2);
const OUT = process.env.OUT ?? "shots";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=${theme}&interior=library`);
for (let k = 0; k < 120 && !(await p.evaluate(() => !!window.street?.interiors?.active).catch(() => false)); k++) await wait(1000);
await wait(4000);
for (const v of viewsArg.split("|")) {
  const [name, rest] = v.split(":");
  const [x, z, yaw, floor, pitch, click] = rest.split(",").map(Number);
  await p.evaluate((v) => {
    const I = street.interiors;
    I.goTo(v.floor);
    const y = I.active.floors[I.floor].y;
    const V = I.walk.camera.position.constructor;
    I.walk.place(new V(v.x, y, v.z), v.yaw, y);
    I.walk.pitch = v.pitch;
  }, { x, z, yaw: yaw || 0, floor: floor || 0, pitch: pitch || 0 });
  await wait(3500);
  await p.screenshot({ path: `${OUT}/lz-${name}.png` });
  console.log(`${OUT}/lz-${name}.png`);
  if (click) {
    const info = await p.evaluate(() => {
      const i = street.interiors.pickAt(innerWidth / 2, innerHeight / 2);
      return i ? JSON.stringify({ eyebrow: i.eyebrow, title: i.title, tag: i.tag, stats: i.stats, link: i.link, body: (i.body ?? "").slice(0, 300), floor: i.floor }) : null;
    });
    console.log("  pick:", info);
    if (!info) continue;
    await p.mouse.move(720, 430);
    await wait(300);
    await p.mouse.down();
    await p.mouse.up();
    await wait(1200);
    await p.screenshot({ path: `${OUT}/lz-${name}-panel.png` });
    await p.keyboard.press("Escape");
    await wait(500);
  }
}
console.log("floors", await p.evaluate(() => JSON.stringify(street.interiors.active.floors.map((f) => f.label + " " + f.name))));
await b.close();
