// Tx clip: follow a live mempool tx, press Clip, save the video: node shots/_clip.mjs
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
const mp = await (await fetch("https://api.zscan.cash/v1/mempool")).json();
const txid = mp.txs?.[0]?.txid ?? (await (await fetch("https://api.zscan.cash/v1/blocks?limit=1")).json())[0].hash;
console.log("tx", txid, "mempool", mp.txs?.length);
const dir = "/private/tmp/claude-501/-Users-adam-Documents-GitHub-zcash/f9f52292-a19f-4db1-a3b5-6b6b8afa232e/scratchpad/clip";
fs.mkdirSync(dir, { recursive: true });
const cdp = await p.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
await p.evaluateOnNewDocument(() => {
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) {
      fetch(this.href).then((r) => r.arrayBuffer()).then((b) => { window.__clip = { name: this.download, size: b.byteLength, b64: btoa(String.fromCharCode(...new Uint8Array(b.slice(0, 0)))) }; window.__clipBuf = b; });
      return;
    }
    return click.call(this);
  };
});
await p.goto(`http://localhost:3007/?theme=night&tx=${txid}`);
await new Promise((r) => setTimeout(r, 25000));
await p.screenshot({ path: "shots/clip-card.png" });
await p.click('.track-card [data-t="clip"]');
await new Promise((r) => setTimeout(r, 4000));
await p.screenshot({ path: "shots/clip-rec.png" });
await new Promise((r) => setTimeout(r, 12000));
const info = await p.evaluate(() => window.__clip);
console.log("clip", info?.name, info?.size);
if (info) {
  const arr = await p.evaluate(() => Array.from(new Uint8Array(window.__clipBuf)));
  fs.writeFileSync(`${dir}/${info.name}`, Buffer.from(arr));
}
console.log(fs.readdirSync(dir).map((f) => `${f} ${fs.statSync(`${dir}/${f}`).size}`));
await b.close();
