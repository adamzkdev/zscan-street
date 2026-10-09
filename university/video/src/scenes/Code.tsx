import React from "react";
import { head, Label, mono, Rise, Z } from "../kit";
import type { Scene } from "../types";

export const Code: React.FC<{ scene: Extract<Scene, { kind: "code" }> }> = ({ scene }) => {
  const lines = scene.code.split("\n");
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.max(24, Math.min(40, Math.floor(1500 / (Math.max(longest, 30) * 0.6)), Math.floor(560 / (lines.length * 1.45))));
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Rise at={0}>
        <div style={{ fontFamily: head, fontWeight: 600, fontSize: 68, letterSpacing: -2, color: Z.ink, marginBottom: 36 }}>{scene.title}</div>
      </Rise>
      <Rise at={12}>
        <div style={{ background: "#151513", borderRadius: 22, padding: "40px 48px" }}>
          <Label color={Z.gold} style={{ fontSize: 22, marginBottom: 22 }}>{scene.lang}</Label>
          <pre style={{ margin: 0, fontFamily: mono, fontSize: size, lineHeight: 1.45, color: "#F2EFE7", whiteSpace: "pre-wrap" }}>{scene.code}</pre>
        </div>
      </Rise>
    </div>
  );
};
