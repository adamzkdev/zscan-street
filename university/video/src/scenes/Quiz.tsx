import React from "react";
import { useCurrentFrame } from "remotion";
import { Check, fit, head, Label, mono, prog, Rise, sans, Z } from "../kit";
import type { Scene } from "../types";

export const Quiz: React.FC<{ scene: Extract<Scene, { kind: "quiz" }>; dur: number }> = ({ scene, dur }) => {
  const frame = useCurrentFrame();
  const revealAt = Math.round(dur * 0.58);
  const r = prog(frame, revealAt, 12);
  const longest = Math.max(...scene.options.map((o) => o.length));
  const size = fit("x".repeat(longest), 44, 34, 40);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Rise at={0}>
        <Label style={{ marginBottom: 18 }}>Quick quiz</Label>
        <div style={{ fontFamily: head, fontWeight: 600, fontSize: fit(scene.q, 70, 52, 50), lineHeight: 1.1, letterSpacing: -2, color: Z.ink, marginBottom: 46, maxWidth: 1560 }}>{scene.q}</div>
      </Rise>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {scene.options.map((o, i) => {
          const right = i === scene.answer;
          return (
            <Rise key={i} at={14 + i * 8}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 28,
                  padding: "20px 30px",
                  borderRadius: 18,
                  border: `3px solid ${right && r > 0.5 ? Z.ink : Z.rule}`,
                  background: right ? `rgba(244,183,40,${0.9 * r})` : Z.paperHi,
                  opacity: right ? 1 : 1 - 0.55 * r,
                }}
              >
                <div style={{ fontFamily: mono, fontWeight: 600, fontSize: 34, color: Z.goldInk, width: 40 }}>{String.fromCharCode(65 + i)}</div>
                <div style={{ flex: 1, fontFamily: sans, fontWeight: 500, fontSize: size, lineHeight: 1.25, color: Z.ink }}>{o}</div>
                {right && <Check size={46} p={r} />}
              </div>
            </Rise>
          );
        })}
      </div>
    </div>
  );
};
