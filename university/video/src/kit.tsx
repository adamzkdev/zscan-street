import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPlex } from "@remotion/google-fonts/IBMPlexMono";
import { loadFont as loadInstrument } from "@remotion/google-fonts/InstrumentSerif";

// Same taste as "Zero to Shielded": paper, ink, Zcash yellow; calm motion, typed titles, no clutter.
export const head = loadGeist("normal", { weights: ["500", "600", "700"], subsets: ["latin"] }).fontFamily;
export const sans = loadInter("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;
export const mono = loadPlex("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;
export const serif = loadInstrument("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;

export const Z = {
  paper: "#ECE8DF",
  paperHi: "#F6F4EE",
  rule: "#CFC9BC",
  ink: "#141413",
  ink2: "#3B3934",
  muted: "#6E695F",
  gold: "#F4B728",
  goldInk: "#9A700B",
  green: "#1F8A5B",
};

export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeIn = Easing.bezier(0.7, 0, 0.84, 0);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const prog = (frame: number, at: number, dur = 14, easing = easeOut) => interpolate(frame, [at, at + dur], [0, 1], { ...clamp, easing });

/** Font size that shrinks with text length so blocks never overflow their box. */
export const fit = (text: string, max: number, min: number, ref: number) => Math.round(Math.max(min, Math.min(max, max * Math.sqrt(ref / Math.max(1, text.length)))));

// Content box (below the header strip, above the footer).
export const BOX = { left: 150, right: 150, top: 168, bottom: 118 };

// Static paper grain (a moving grain would bloat the mp4 several times over for a 3D screen).
export const Grain: React.FC = () => {
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", mixBlendMode: "multiply", opacity: 0.28 }}>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={7} stitchTiles="stitch" />
        <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.42  0 0 0 0 0.36  0 0 0 0.55 0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  );
};

/** Fades a scene in and out, with a 10px rise on entry. */
export const SceneFrame: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const frame = useCurrentFrame();
  const inT = prog(frame, 0, 12);
  const outT = prog(frame, dur - 9, 9, easeIn);
  return (
    <div style={{ position: "absolute", left: BOX.left, right: BOX.right, top: BOX.top, bottom: BOX.bottom, opacity: inT * (1 - outT), transform: `translateY(${(1 - inT) * 10}px)` }}>
      {children}
    </div>
  );
};

/** Fades + rises a block in at `at` frames. */
export const Rise: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, children, style }) => {
  const frame = useCurrentFrame();
  const t = prog(frame, at, 16);
  return <div style={{ opacity: t, transform: `translateY(${(1 - t) * 12}px)`, ...style }}>{children}</div>;
};

export const Label: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = Z.goldInk, style }) => (
  <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 28, letterSpacing: 4, textTransform: "uppercase", color, ...style }}>{children}</div>
);

export const TYPE_CPS = 1.1; // characters per frame

/** Headline that types itself out with a yellow caret. Wraps normally. */
export const TypeHead: React.FC<{ text: string; at?: number; size: number; style?: React.CSSProperties }> = ({ text, at = 6, size, style }) => {
  const frame = useCurrentFrame();
  const shown = Math.max(0, Math.min(text.length, Math.floor((frame - at) * TYPE_CPS)));
  const doneAt = at + text.length / TYPE_CPS;
  const caretOn = frame >= at && (frame < doneAt || (frame < doneAt + 45 && Math.floor(frame / 10) % 2 === 0));
  return (
    <div style={{ fontFamily: head, fontWeight: 600, fontSize: size, letterSpacing: -size * 0.035, lineHeight: 1.06, color: Z.ink, position: "relative", ...style }}>
      {/* Invisible full text reserves the final layout so lines never jump while typing. */}
      <span style={{ visibility: "hidden" }}>{text}</span>
      <span style={{ position: "absolute", left: 0, top: 0, right: 0 }}>
        {text.slice(0, shown)}
        <span style={{ display: "inline-block", width: size * 0.07, height: size * 0.86, marginLeft: size * 0.06, verticalAlign: "-0.1em", background: Z.gold, opacity: caretOn ? 1 : 0 }} />
      </span>
    </div>
  );
};

/** Words fade in one after another (fast, calm). */
export const WordFade: React.FC<{ text: string; at?: number; every?: number }> = ({ text, at = 4, every = 1.6 }) => {
  const frame = useCurrentFrame();
  const ws = text.split(" ");
  return (
    <>
      {ws.map((w, i) => {
        const t = prog(frame, at + i * every, 10);
        return (
          <span key={i} style={{ opacity: 0.08 + 0.92 * t }}>
            {w}
            {i < ws.length - 1 ? " " : ""}
          </span>
        );
      })}
    </>
  );
};

export const Check: React.FC<{ size?: number; color?: string; p?: number }> = ({ size = 40, color = Z.ink, p = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path d="M4.5 12.5l5 5 10-11" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} />
  </svg>
);
