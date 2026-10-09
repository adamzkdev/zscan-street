// node shots/_twin.mjs <place> [floor]: stands in each car of a bank, rides it one floor up, reports + screenshots
import puppeteer from "puppeteer-core";
const [key, floor = "0"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1200, height: 760 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
await p.goto(`http://localhost:${process.env.PORT ?? 3007}/?debug&theme=day&interior=${key}`);
await p.waitForFunction(() => window.street?.interiors?.active, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const info = await p.evaluate((f) => {
  const I = street.interiors;
  I.goTo(Number(f));
  const c = I.circ;
  return c.cars.filter((x) => x.floor === Number(f)).map((x) => ({ slot: x.slot, shaft: x.shaft, x: x.spot.x, z: x.spot.z, yaw: x.spot.yaw }));
}, floor);
console.log("cars on floor", floor, JSON.stringify(info));
for (const car of info) {
  // in front of the car, facing it
  await p.evaluate((car) => {
    const I = street.interiors;
    const y = I.active.floors[I.floor].y;
    const V = I.walk.camera.position.constructor;
    const fx = car.x - Math.sin(car.yaw) * 2.2, fz = car.z - Math.cos(car.yaw) * 2.2;
    I.walk.place(new V(fx, y, fz), car.yaw + Math.PI, y);
  }, car);
  await wait(1500);
  await p.screenshot({ path: `shots/twin-${key}-${car.slot}-front.png` });
  // inside it, then ride up
  const r = await p.evaluate(async (car) => {
    const I = street.interiors;
    const y = I.active.floors[I.floor].y;
    const V = I.walk.camera.position.constructor;
    I.walk.place(new V(car.x + Math.sin(car.yaw) * 0.0, y, car.z), car.yaw, y);
    await new Promise((r) => setTimeout(r, 600));
    const inCar = I.circ.carIn();
    const before = I.floor;
    const list = inCar ? I.circ.servedBy(inCar) : [];
    const to = list.find((n) => n !== before);
    if (inCar && to !== undefined) I.circ.call(to);
    await new Promise((r) => setTimeout(r, 7000));
    const now = I.circ.carIn();
    return { inCar: !!inCar, slotIn: inCar?.slot, before, to, after: I.floor, arrivedSlot: now?.slot };
  }, car);
  console.log(JSON.stringify(r));
  await p.screenshot({ path: `shots/twin-${key}-${car.slot}-ride.png` });
  await p.evaluate((f) => street.interiors.goTo(Number(f)), floor);
  await wait(800);
}
await b.close();
