import React from "react";
import { fit, head, Rise, sans, WordFade, Z } from "../kit";
import type { Scene } from "../types";

export const Say: React.FC<{ scene: Extract<Scene, { kind: "say" }> }> = ({ scene }) => {
  const size = fit(scene.text, 96, 64, 70);
  const wordsIn = 4 + scene.text.split(" ").length * 1.6;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontFamily: head, fontWeight: 600, fontSize: size, lineHeight: 1.12, letterSpacing: -size * 0.03, color: Z.ink, maxWidth: 1560, textWrap: "balance" } as React.CSSProperties}>
        <WordFade text={scene.text} />
      </div>
      {scene.sub && (
        <Rise at={wordsIn + 6}>
          <div style={{ fontFamily: sans, fontSize: fit(scene.sub, 46, 38, 90), lineHeight: 1.4, color: Z.ink2, marginTop: 44, maxWidth: 1400, paddingLeft: 28, borderLeft: `6px solid ${Z.gold}` }}>{scene.sub}</div>
        </Rise>
      )}
    </div>
  );
};
