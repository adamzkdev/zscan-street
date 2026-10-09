import React from "react";
import { useCurrentFrame } from "remotion";
import { fit, head, mono, prog, Rise, sans, Z } from "../kit";
import { domainOf, type Course, type Scene } from "../types";

export const NumberScene: React.FC<{ scene: Extract<Scene, { kind: "number" }>; course: Course }> = ({ scene, course }) => {
  const frame = useCurrentFrame();
  const src = course.sources[scene.source];
  const size = fit(scene.value, 260, 150, 6);
  const bar = prog(frame, 18, 22);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Rise at={2}>
        <div style={{ fontFamily: head, fontWeight: 700, fontSize: size, lineHeight: 1, letterSpacing: -size * 0.045, color: Z.ink, whiteSpace: "nowrap" }}>{scene.value}</div>
      </Rise>
      <div style={{ width: 220 * bar, height: 10, background: Z.gold, marginTop: 34, marginBottom: 38 }} />
      <Rise at={20}>
        <div style={{ fontFamily: sans, fontWeight: 500, fontSize: fit(scene.label, 54, 40, 50), lineHeight: 1.3, color: Z.ink, maxWidth: 1450 }}>{scene.label}</div>
      </Rise>
      {src && (
        <Rise at={34}>
          <div style={{ fontFamily: mono, fontSize: 26, color: Z.muted, marginTop: 34 }}>
            Source: {domainOf(src.url)} · {src.title}
          </div>
        </Rise>
      )}
    </div>
  );
};
