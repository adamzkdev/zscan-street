import React from "react";
import { fit, head, Rise, sans, Z } from "../kit";
import type { Scene } from "../types";

const Col: React.FC<{ label: string; points: string[]; at: number; accent?: boolean; size: number }> = ({ label, points, at, accent, size }) => (
  <div style={{ flex: 1, borderTop: `8px solid ${accent ? Z.gold : Z.ink2}`, paddingTop: 30 }}>
    <Rise at={at}>
      <div style={{ fontFamily: head, fontWeight: 600, fontSize: 56, letterSpacing: -1.6, color: Z.ink, marginBottom: 30 }}>{label}</div>
    </Rise>
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {points.map((p, i) => (
        <Rise key={i} at={at + 12 + i * 12}>
          <div style={{ display: "flex", gap: 22, alignItems: "baseline" }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: accent ? Z.gold : Z.ink2, flexShrink: 0, transform: "translateY(-6px)" }} />
            <div style={{ fontFamily: sans, fontSize: size, lineHeight: 1.3, color: Z.ink }}>{p}</div>
          </div>
        </Rise>
      ))}
    </div>
  </div>
);

export const Compare: React.FC<{ scene: Extract<Scene, { kind: "compare" }> }> = ({ scene }) => {
  const all = [...scene.a.points, ...scene.b.points];
  const longest = Math.max(...all.map((p) => p.length));
  const rows = Math.max(scene.a.points.length, scene.b.points.length);
  const size = Math.min(fit("x".repeat(longest), 44, 34, 34), rows >= 4 ? 38 : 44);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Rise at={0}>
        <div style={{ fontFamily: head, fontWeight: 600, fontSize: fit(scene.title, 76, 56, 32), letterSpacing: -2.4, color: Z.ink, lineHeight: 1.08, marginBottom: 56 }}>{scene.title}</div>
      </Rise>
      <div style={{ display: "flex", gap: 80 }}>
        <Col label={scene.a.label} points={scene.a.points} at={12} size={size} />
        <Col label={scene.b.label} points={scene.b.points} at={40} accent size={size} />
      </div>
    </div>
  );
};
