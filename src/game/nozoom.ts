/**
 * No browser zoom on our pages. iPhone Safari ignores the viewport's `user-scalable=no` (an
 * accessibility choice), so a double tap or a pinch zoomed the page: a game then sat half off the
 * screen with no way back. Double-tap zoom goes with `touch-action: manipulation` on the whole
 * page (taps stay instant; the stages and sticks keep their own `touch-action: none`), and Safari's
 * pinch with its gesture events. Android and the others follow the viewport tag.
 */
let done = false;
export function noZoom() {
  if (done || typeof document === "undefined") return;
  done = true;
  const st = document.createElement("style");
  st.textContent = "html,body{touch-action:manipulation;-webkit-text-size-adjust:100%;text-size-adjust:100%}";
  document.head.append(st);
  const stop = (e: Event) => e.preventDefault();
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, stop, { passive: false });
  // (a two-finger pinch that starts as touches, before Safari calls it a gesture)
  document.addEventListener("touchmove", (e) => e.touches.length > 1 && e.cancelable && e.preventDefault(), { passive: false });
}
