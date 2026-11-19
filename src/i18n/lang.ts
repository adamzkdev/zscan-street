/**
 * The fight's words in English or in Chinese. The language is the page's: ?lang=, then the one picked on
 * the hunt's card (localStorage "hunt.lang"), then the browser's. Read again each time the menu opens or a
 * game starts, so a switch made elsewhere on the page follows.
 */
export type Lang = "en" | "zh";

let lang: Lang = pick();

function pick(): Lang {
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "zh" || q === "en") return q;
  try {
    const saved = localStorage.getItem("hunt.lang");
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // (a private window: the browser's)
  }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/** Look again; true when it changed. */
export function relang(): boolean {
  const was = lang;
  lang = pick();
  return lang !== was;
}

export const isZh = () => lang === "zh";

/** The words, in the page's language. */
export const T = (en: string, zh: string) => (lang === "zh" ? zh : en);

/** Every element under root marked data-zh shows its Chinese or its English (kept in data-en). */
export function localize(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>("[data-zh]")) {
    el.dataset.en ??= el.innerHTML;
    el.innerHTML = lang === "zh" ? el.dataset.zh! : el.dataset.en;
  }
  // (a button that is only an icon: its name for a screen reader, data-zh-label)
  for (const el of root.querySelectorAll<HTMLElement>("[data-zh-label]")) {
    el.dataset.enLabel ??= el.getAttribute("aria-label") ?? "";
    el.setAttribute("aria-label", lang === "zh" ? el.dataset.zhLabel! : el.dataset.enLabel);
  }
  root.lang = lang === "zh" ? "zh-CN" : "en";
}
