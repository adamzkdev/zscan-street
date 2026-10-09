import React from "react";
import { fit, head, mono, Rise, sans, Z } from "../kit";
import type { Scene } from "../types";

export const Steps: React.FC<{ scene: Extract<Scene, { kind: "steps" }>; dur: number }> = ({ scene, dur }) => {
  const n = scene.steps.length;
  const every = Math.min(46, (dur * 0.62) / n);
  const longest = Math.max(...scene.steps.map((s) => s.length));
  const size = Math.min(fit(longest + " ".repeat(Math.max(0, n - 4) * 12), 48, 36, 50), n >= 5 ? 42 : 48);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Rise at={0}>
        <div style={{ fontFamily: head, fontWeight: 600, fontSize: fit(scene.title, 76, 56, 32), letterSpacing: -2.4, color: Z.ink, lineHeight: 1.08, marginBottom: 48 }}>{scene.title}</div>
      </Rise>
      <div style={{ display: "flex", flexDirection: "column", gap: n >= 5 ? 22 : 30 }}>
        {scene.steps.map((s, i) => (
          <Rise key={i} at={14 + i * every}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 30, paddingBottom: n >= 5 ? 18 : 24, borderBottom: i < n - 1 ? `2px solid ${Z.rule}` : "none" }}>
              <div style={{ fontFamily: mono, fontWeight: 600, fontSize: size * 0.8, color: Z.goldInk, minWidth: size * 1.5 }}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{ fontFamily: sans, fontWeight: 500, fontSize: size, lineHeight: 1.3, color: Z.ink }}>{s}</div>
            </div>
          </Rise>
        ))}
      </div>
    </div>
  );
};
