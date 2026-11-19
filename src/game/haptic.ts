/**
 * A tick under the thumb when a game's button is pressed. Android: the Vibration API. iPhone (iOS 18
 * and later): Safari has no vibration for pages, but toggling a native switch (`<input switch>`)
 * gives the system's own haptic, so a hidden one is flipped. Both only work inside a touch's own
 * handler, which is where the pad calls this from.
 */
let sw: HTMLLabelElement | null = null;
const canVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
const canSwitch = typeof HTMLInputElement !== "undefined" && "switch" in HTMLInputElement.prototype;

export function haptic(ms = 8) {
  if (canVibrate) {
    navigator.vibrate(ms);
    return;
  }
  if (!canSwitch) return;
  if (!sw) {
    sw = document.createElement("label");
    sw.setAttribute("aria-hidden", "true");
    sw.style.cssText = "position:fixed;left:-99px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
    const i = document.createElement("input");
    i.type = "checkbox";
    i.setAttribute("switch", "");
    i.tabIndex = -1;
    sw.append(i);
    document.body.append(sw);
  }
  sw.click();
}
