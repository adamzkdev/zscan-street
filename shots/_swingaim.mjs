// The swing's aim (src/scene/swing/aim.ts): GPU picking from the frame's own depth matches the
// visible surface under the pixel (the nearest occluder, not what is behind it), for whatever camera
// drew the frame, the sky gives nothing, the render state is left as it was, and the stall-free pick
// agrees with the immediate one.
//   npx vite --port 3013 & PORT=3013 node shots/_swingaim.mjs
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
try {
  const p = await b.newPage();
  await p.goto(`${process.env.BASE ?? `http://localhost:${process.env.PORT ?? 3013}`}/icon.svg`);
  const results = await p.evaluate(async () => {
    const src = await (await fetch("/src/scene/swing/aim.ts")).text();
    const T = await import(src.match(/from "([^"]*three\.js[^"]*)"/)[1]);
    const { SwingAim } = await import("/src/scene/swing/aim.ts");
    const renderer = new T.WebGLRenderer();
    renderer.setSize(640, 480);
    const rt = new T.WebGLRenderTarget(640, 480, { depthTexture: new T.DepthTexture(640, 480, T.FloatType) });
    const picker = new SwingAim(renderer),
      scene = new T.Scene();
    const wall = new T.Mesh(new T.BoxGeometry(60, 30, 2), new T.MeshBasicMaterial());
    wall.position.set(0, 10, -20);
    scene.add(wall);
    const front = new T.Mesh(new T.BoxGeometry(4, 4, 2), new T.MeshBasicMaterial());
    front.position.set(0, 6, -10);
    scene.add(front);
    const camera = new T.PerspectiveCamera(62, 640 / 480, 0.05, 400),
      ray = new T.Raycaster(),
      ndc = new T.Vector2(),
      point = new T.Vector3(),
      later = new T.Vector3();
    const checks = [];
    // the eye on the street, and another camera elsewhere (the picture is what is picked)
    for (const pos of [[0, 2, 0], [3, 4, 5]]) {
      camera.position.set(...pos);
      camera.lookAt(0, 8, -20);
      camera.updateMatrixWorld();
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      picker.capture(camera, rt.depthTexture);
      for (const at of [[0, 0], [-0.35, 0.25], [0.35, 0.25]]) {
        ndc.set(...at);
        ray.setFromCamera(ndc, camera);
        const expected = ray.intersectObjects([front, wall])[0];
        const actual = picker.hit(ndc, point);
        const deferred = await picker.hitLater(ndc, later);
        checks.push({ pos, at, error: actual && expected ? actual.distanceTo(expected.point) : null, later: deferred && actual ? deferred.distanceTo(actual) : null, nearest: expected?.object === front, restored: renderer.getRenderTarget() === null });
      }
    }
    camera.lookAt(0, 100, 0);
    camera.updateMatrixWorld();
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    picker.capture(camera, rt.depthTexture);
    const sky = picker.hit(new T.Vector2(), point) === null && (await picker.hitLater(new T.Vector2(), later)) === null;
    picker.clear();
    const cleared = picker.hit(new T.Vector2(), point) === null;
    renderer.dispose();
    rt.dispose();
    return { checks, sky, cleared };
  });
  for (const check of results.checks) {
    assert.ok(check.error !== null && check.error < 0.03, JSON.stringify(check));
    assert.ok(check.later !== null && check.later < 1e-4, `the stall-free pick agrees: ${JSON.stringify(check)}`);
    assert.ok(check.restored);
  }
  assert.ok(results.checks.some((c) => c.nearest), "nearest visible occluder tested");
  assert.ok(results.sky, "the sky holds nothing");
  assert.ok(results.cleared, "nothing to pick from once cleared");
  console.log(JSON.stringify(results.checks.map((c) => +c.error.toFixed(4))));
  console.log("PASS visible-surface aiming: exact pixel, occlusion, any camera, sky, render state, stall-free pick");
} finally {
  await b.close();
}
