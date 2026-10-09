import React from "react";
import { Img, staticFile } from "remotion";
import { Label, Rise, TypeHead, TYPE_CPS, fit, sans, Z } from "../kit";
import { FACULTIES, LOGOS, type Course, type Scene } from "../types";

export const Title: React.FC<{ scene: Extract<Scene, { kind: "title" }>; course: Course }> = ({ scene, course }) => {
  const size = fit(scene.title, 150, 96, 22);
  const typed = 10 + scene.title.length / TYPE_CPS;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {LOGOS[course.faculty] && (
        <Rise at={0}>
          <div style={{ display: "flex", alignItems: "center", gap: 36, marginBottom: 46 }}>
            <Img src={staticFile(LOGOS[course.faculty]!.mark)} style={{ width: 170, height: 170, objectFit: "contain" }} />
            {LOGOS[course.faculty]!.word ? (
              <Img src={staticFile(LOGOS[course.faculty]!.word!)} style={{ height: 92, objectFit: "contain" }} />
            ) : (
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 96, letterSpacing: -2, color: FACULTIES[course.faculty].color }}>{FACULTIES[course.faculty].name}</div>
            )}
          </div>
        </Rise>
      )}
      {scene.kicker && (
        <Rise at={0}>
          <Label style={{ marginBottom: 34 }}>{scene.kicker}</Label>
        </Rise>
      )}
      <TypeHead text={scene.title} at={10} size={size} style={{ maxWidth: 1500 }} />
      <Rise at={typed + 4}>
        <div style={{ fontFamily: sans, fontSize: 44, lineHeight: 1.35, color: Z.ink2, marginTop: 40, maxWidth: 1400 }}>{course.subtitle}</div>
      </Rise>
    </div>
  );
};
