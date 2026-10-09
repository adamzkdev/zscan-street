import React from "react";
import { fit, head, mono, Rise, sans, serif, WordFade, Z } from "../kit";
import { domainOf, type Course, type Scene } from "../types";

export const Quote: React.FC<{ scene: Extract<Scene, { kind: "quote" }>; course: Course }> = ({ scene, course }) => {
  const src = course.sources[scene.source];
  if (!src) return null;
  const size = fit(src.quote, 76, 50, 120);
  const words = src.quote.split(" ").length;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Rise at={0}>
        <div style={{ fontFamily: head, fontWeight: 700, fontSize: 150, lineHeight: 0.6, color: Z.gold, height: 70 }}>“</div>
      </Rise>
      <div style={{ fontFamily: serif, fontSize: size, lineHeight: 1.18, color: Z.ink, maxWidth: 1560 }}>
        <WordFade text={src.quote} at={8} every={Math.min(1.6, 60 / words)} />
      </div>
      <Rise at={Math.min(70, 8 + words * 1.6) + 6}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 22, marginTop: 44 }}>
          <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 34, color: Z.ink }}>{src.title}</div>
          <div style={{ fontFamily: mono, fontSize: 28, color: Z.muted }}>{domainOf(src.url)}</div>
        </div>
      </Rise>
    </div>
  );
};
