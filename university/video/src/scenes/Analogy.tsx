import React from "react";
import { fit, head, Label, Rise, sans, Z } from "../kit";
import type { Scene } from "../types";

const Card: React.FC<{ label: string; text: string; at: number; accent?: boolean }> = ({ label, text, at, accent }) => (
  <Rise at={at} style={{ flex: 1, display: "flex" }}>
    <div style={{ flex: 1, background: Z.paperHi, border: `2px solid ${accent ? Z.ink : Z.rule}`, borderRadius: 22, padding: "36px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
      <Label color={accent ? Z.goldInk : Z.muted} style={{ fontSize: 24 }}>{label}</Label>
      <div style={{ fontFamily: head, fontWeight: 600, fontSize: fit(text, 50, 38, 70), lineHeight: 1.18, letterSpacing: -1, color: Z.ink }}>{text}</div>
    </div>
  </Rise>
);

export const Analogy: React.FC<{ scene: Extract<Scene, { kind: "analogy" }> }> = ({ scene }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
    <Rise at={0}>
      <Label style={{ marginBottom: 14 }}>An analogy</Label>
      <div style={{ fontFamily: head, fontWeight: 600, fontSize: fit(scene.title, 76, 56, 32), letterSpacing: -2.4, color: Z.ink, lineHeight: 1.08 }}>{scene.title}</div>
    </Rise>
    <div style={{ display: "flex", alignItems: "stretch", gap: 34, marginTop: 44 }}>
      <Card label="In everyday life" text={scene.left} at={14} />
      <Rise at={34} style={{ display: "flex", alignItems: "center" }}>
        <div style={{ fontFamily: head, fontWeight: 600, fontSize: 80, color: Z.goldInk }}>≈</div>
      </Rise>
      <Card label="In cryptography" text={scene.right} at={40} accent />
    </div>
    <Rise at={80}>
      <div style={{ fontFamily: sans, fontSize: fit(scene.caption, 42, 34, 100), lineHeight: 1.4, color: Z.ink2, marginTop: 40, maxWidth: 1500 }}>{scene.caption}</div>
    </Rise>
  </div>
);
