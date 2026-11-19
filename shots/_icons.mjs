// node shots/_icons.mjs: the Home Screen / install icons (public/*.png) drawn from ZStreet's own mark
// (public/icon.svg's shield and Z, the boot screen's colours on the city's dark ground)
import puppeteer from "puppeteer-core";
const mark = (k) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${k}" height="${k}"><path d="M16 2.5 27.5 7v8.6c0 7-4.8 11.9-11.5 13.9C9.3 27.5 4.5 22.6 4.5 15.6V7L16 2.5Z" fill="none" stroke="#f4b728" stroke-width="2" stroke-linejoin="round"/><path d="M11 11h10l-10 10h10" fill="none" stroke="#f2f2f2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 16h17" stroke="#1baf7a" stroke-width="1.2" stroke-dasharray="2 2" opacity=".85"/></svg>`;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage();
for (const [file, size, share] of [["apple-touch-icon.png", 180, 0.78], ["icon-192.png", 192, 0.8], ["icon-512.png", 512, 0.8], ["icon-maskable-512.png", 512, 0.6]]) {
  await p.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await p.setContent(`<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:#0d0d0d">${mark(Math.round(size * share))}</body>`);
  await p.screenshot({ path: `public/${file}`, omitBackground: false });
  console.log(file);
}
await b.close();
