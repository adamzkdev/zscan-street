/**
 * The mini-games' thumbnails: public/party/thumbs/<key>.jpg (640×360, shot from the bench by the
 * capture script), for the hall's cards (DOM) and the rules card (canvas). A game without one yet
 * gets a stand-in: its colour, a pattern, its title.
 */
import { T } from "../i18n/lang";
import type { MiniDef } from "./kit";
import { patternOf } from "./hud";

const BASE = `${import.meta.env?.BASE_URL ?? "/"}party/thumbs/`;
export const thumbUrl = (key: string) => `${BASE}${key}.jpg`;

/** Thumbnails known to be missing (a 404, or the dev server's page instead of a picture). */
const missing = new Set<string>();
const imgs = new Map<string, HTMLImageElement>();

/** The thumbnail for a canvas: null while it loads, and for a game that has none. */
export function thumbImg(key: string): HTMLImageElement | null {
  if (missing.has(key)) return null;
  let im = imgs.get(key);
  if (!im) {
    im = new Image();
    im.decoding = "async";
    im.onerror = () => missing.add(key);
    im.src = thumbUrl(key);
    imgs.set(key, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** A thumbnail for the DOM: the stand-in under the picture (shown when the picture fails). */
export function thumbHtml(def: Pick<MiniDef, "key" | "title" | "titleZh" | "color">, cls = "") {
  const title = esc(T(def.title, def.titleZh));
  const img = missing.has(def.key) ? "" : `<img src="${thumbUrl(def.key)}" alt="" decoding="async" draggable="false" />`;
  return `<span class="pt-th ${cls}" style="--c:${def.color}" data-k="${def.key}" data-pat="${patternOf(def.key)}"><span class="pt-th-fb"><b>${title}</b></span>${img}</span>`;
}

/** After a render: each picture shows once loaded; a missing one leaves its stand-in. */
export function wireThumbs(root: ParentNode) {
  root.querySelectorAll<HTMLImageElement>(".pt-th img").forEach((im) => {
    const key = (im.parentElement as HTMLElement).dataset.k ?? "";
    const ok = () => im.classList.add("ok");
    const fail = () => (missing.add(key), im.remove());
    if (im.complete) im.naturalWidth ? ok() : fail();
    else {
      im.addEventListener("load", ok, { once: true });
      im.addEventListener("error", fail, { once: true });
    }
  });
}
