import React from "react";
import { useCurrentFrame } from "remotion";
import { Check, fit, head, prog, Rise, sans, Z } from "../kit";
import type { Scene } from "../types";

export const Recap: React.FC<{ scene: Extract<Scene, { kind: "recap" }>; dur: number }> = ({ scene, dur }) => {
  const frame = useCurrentFrame();
  const n = scene.points.length;
  const every = Math.min(40, (dur * 0.6) / n);
  const longest = Math.max(...scene.points.map((p) => p.length));
  const size = Math.min(fit("x".repeat(longest), 48, 36, 50), n >= 5 ? 42 : 48);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Rise at={0}>
        <div style={{ fontFamily: head, fontWeight: 600, fontSize: 84, letterSpacing: -3, color: Z.ink, marginBottom: 48 }}>Recap</div>
      </Rise>
      <div style={{ display: "flex", flexDirection: "column", gap: n >= 5 ? 26 : 34 }}>
        {scene.points.map((p, i) => (
          <Rise key={i} at={12 + i * every}>
            <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
              <div style={{ width: 62, height: 62, borderRadius: 31, background: Z.gold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Check size={40} p={prog(frame, 18 + i * every, 14)} />
              </div>
              <div style={{ fontFamily: sans, fontWeight: 500, fontSize: size, lineHeight: 1.3, color: Z.ink }}>{p}</div>
            </div>
          </Rise>
        ))}
      </div>
    </div>
  );
};
