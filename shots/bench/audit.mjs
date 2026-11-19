// The bench's eye: after every screenshot, what a player would see wrong in the HUD.
// - panels (fixed / absolute boxes with a background) that overlap one another
// - panels cut by the edge of the screen
// - text spilling out of its box, or cut without an ellipsis
// Full-screen overlays (menus, end screen, the vault opened) are left out of the overlap test: they
// cover the HUD on purpose; what is inside them is still checked.
// Use: import { snap, report } from "./bench/audit.mjs"; await snap(page, { path }); ... report()
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const found = [];

export async function audit(page) {
  return page.evaluate(() => {
    const vw = innerWidth,
      vh = innerHeight;
    const issues = [];
    const shown = (el) => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.05) return false;
      }
      return true;
    };
    const name = (el) => (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : el.tagName.toLowerCase());
    const panels = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (el.tagName === "CANVAS" || el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "absolute") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 16) continue;
      const painted = (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") || cs.boxShadow !== "none" || cs.backgroundImage !== "none";
      if (!painted || !shown(el)) continue;
      // a tooltip lies over its neighbours on purpose
      if (el.getAttribute("role") === "tooltip") continue;
      // (labels pinned to things in the 3D world — buses, places — drift under the HUD as the world moves: not panels)
      if (el.closest(".labels")) continue;
      panels.push({ el, r, cover: (Math.min(r.right, vw) - Math.max(r.left, 0)) * (Math.min(r.bottom, vh) - Math.max(r.top, 0)) / (vw * vh) });
    }
    // top-level only: a panel inside another panel is the panel's own business
    const top = panels.filter((p) => !panels.some((q) => q !== p && q.el.contains(p.el)));
    const overlays = top.filter((p) => p.cover > 0.4);
    // with an overlay up, only what is inside it counts
    const inScope = overlays.length ? panels.filter((p) => overlays.some((o) => o.el.contains(p.el) && o !== p) && !panels.some((q) => q !== p && q.el.contains(p.el) && !overlays.includes(q))) : top;
    for (const p of inScope) {
      const { r } = p;
      if (p.cover > 0.4) continue;
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) issues.push(`cut by the screen: ${name(p.el)} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}]`);
    }
    for (let i = 0; i < inScope.length; i++)
      for (let j = i + 1; j < inScope.length; j++) {
        const a = inScope[i],
          b = inScope[j];
        if (a.cover > 0.4 || b.cover > 0.4 || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left),
          h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w <= 2 || h <= 2) continue;
        const small = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
        if ((w * h) / small > 0.04) issues.push(`overlap: ${name(a.el)} × ${name(b.el)} (${Math.round(w)}×${Math.round(h)} px)`);
      }
    // text out of its box
    const root = overlays.length ? overlays.map((o) => o.el) : [document.body];
    for (const r0 of root)
      for (const el of r0.querySelectorAll("*")) {
        if (!el.firstChild || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        if (el.tagName === "KBD" || el.closest("canvas, svg")) continue;
        if (el.clientWidth === 0 || !shown(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "inline") continue;
        const over = el.scrollWidth - el.clientWidth;
        if (over <= 1) continue;
        if (cs.overflowX === "visible") issues.push(`text spills: ${name(el)} "${el.textContent.trim().slice(0, 40)}" (+${over}px)`);
        else if (cs.textOverflow !== "ellipsis") issues.push(`text cut: ${name(el)} "${el.textContent.trim().slice(0, 40)}"`);
      }
    return [...new Set(issues)];
  });
}

/** A screenshot, audited: the issues are kept for report(). */
export async function snap(page, opts) {
  await page.screenshot(opts);
  const issues = await audit(page).catch((e) => [`audit failed: ${e.message.slice(0, 80)}`]);
  found.push({ shot: opts.path, issues });
  return issues;
}

/** Prints what the shots showed wrong and appends it to captures/bench/audit.log. */
export function report(tag = "") {
  const bad = found.filter((f) => f.issues.length);
  const log = `\n== ${new Date().toISOString()} ${tag} — ${found.length} shots, ${bad.length} with issues\n` + bad.map((f) => `${f.shot}\n  ${f.issues.join("\n  ")}`).join("\n");
  console.log(log);
  try {
    mkdirSync(dirname("captures/bench/audit.log"), { recursive: true });
    appendFileSync("captures/bench/audit.log", log + "\n");
  } catch {}
  return bad;
}
