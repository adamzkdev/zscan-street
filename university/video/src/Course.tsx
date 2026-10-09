import React from "react";
import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { clamp, Grain, head, Label, mono, prog, Rise, sans, SceneFrame, Z } from "./kit";
import { timeline } from "./timing";
import { domainOf, FACULTIES, LEVELS, LOGOS, type Course as CourseT, type Scene } from "./types";
import { Title } from "./scenes/Title";
import { Say } from "./scenes/Say";
import { Analogy } from "./scenes/Analogy";
import { Steps } from "./scenes/Steps";
import { Compare } from "./scenes/Compare";
import { NumberScene } from "./scenes/NumberScene";
import { Quote } from "./scenes/Quote";
import { Code } from "./scenes/Code";
import { Quiz } from "./scenes/Quiz";
import { Recap } from "./scenes/Recap";

export const Portrait: React.FC<{ snark: number; size: number }> = ({ snark, size }) => (
  <div style={{ width: size, height: size, borderRadius: size / 2, background: "#000", overflow: "hidden", boxShadow: `0 0 0 4px ${Z.gold}`, flexShrink: 0 }}>
    <Img src={staticFile(`snarks/${snark}.png`)} style={{ width: size, height: size, imageRendering: "pixelated", transform: "scale(1.08) translateY(4%)" }} />
  </div>
);

const Header: React.FC<{ course: CourseT }> = ({ course }) => {
  const f = FACULTIES[course.faculty];
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 128, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 70px", borderBottom: `2px solid ${Z.rule}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        {LOGOS[course.faculty] ? (
          <Img src={staticFile(LOGOS[course.faculty]!.mark)} style={{ width: 64, height: 64, objectFit: "contain" }} />
        ) : (
          <div style={{ width: 22, height: 22, borderRadius: 4, background: f.color, boxShadow: `inset 0 0 0 2px rgba(20,20,19,0.25)` }} />
        )}
        <div style={{ fontFamily: mono, fontWeight: 600, fontSize: 26, letterSpacing: 4, color: Z.ink }}>ZK UNIVERSITY</div>
        <div style={{ width: 2, height: 36, background: Z.rule }} />
        <div style={{ fontFamily: head, fontWeight: 600, fontSize: 36, letterSpacing: -0.8, color: Z.ink }}>Faculty of {f.name}</div>
        <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: 2, color: Z.muted, border: `2px solid ${Z.rule}`, borderRadius: 8, padding: "4px 12px" }}>{LEVELS[course.level].toUpperCase()}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: mono, fontSize: 20, letterSpacing: 3, color: Z.muted }}>YOUR PROFESSOR</div>
          <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 34, color: Z.ink }}>{course.prof.name}</div>
        </div>
        <Portrait snark={course.prof.snark} size={86} />
      </div>
    </div>
  );
};

const Footer: React.FC<{ course: CourseT; total: number; index: number; count: number }> = ({ course, total, index, count }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, total - 1], [0, 1], clamp);
  return (
    <>
      <div style={{ position: "absolute", left: 70, right: 70, bottom: 40, display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 24, color: Z.muted }}>
        <div>{course.title}</div>
        <div>{index < count ? `${String(index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}` : ""}</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 12, background: Z.rule }}>
        <div style={{ width: `${p * 100}%`, height: "100%", background: Z.gold }} />
      </div>
    </>
  );
};

const SceneView: React.FC<{ scene: Scene; course: CourseT; dur: number }> = ({ scene, course, dur }) => {
  switch (scene.kind) {
    case "title":
      return <Title scene={scene} course={course} />;
    case "say":
      return <Say scene={scene} />;
    case "analogy":
      return <Analogy scene={scene} />;
    case "steps":
      return <Steps scene={scene} dur={dur} />;
    case "compare":
      return <Compare scene={scene} />;
    case "number":
      return <NumberScene scene={scene} course={course} />;
    case "quote":
      return <Quote scene={scene} course={course} />;
    case "code":
      return <Code scene={scene} />;
    case "quiz":
      return <Quiz scene={scene} dur={dur} />;
    case "recap":
      return <Recap scene={scene} dur={dur} />;
  }
};

const Closing: React.FC<{ course: CourseT; dur: number }> = ({ course, dur }) => {
  const frame = useCurrentFrame();
  const domains = [...new Set(course.sources.map((s) => domainOf(s.url)))];
  const out = prog(frame, dur - 12, 12);
  return (
    <AbsoluteFill style={{ background: Z.ink, alignItems: "center", justifyContent: "center", opacity: prog(frame, 0, 14), }}>
      <div style={{ opacity: 1 - out, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 140px" }}>
        <Rise at={4}>
          <Portrait snark={course.prof.snark} size={150} />
        </Rise>
        <Rise at={10}>
          <div style={{ fontFamily: head, fontWeight: 600, fontSize: 112, letterSpacing: -4, color: "#F6F4EE", marginTop: 50 }}>
            ZK UNIVERSITY <span style={{ color: Z.gold }}>·</span> ZStreet
          </div>
        </Rise>
        <Rise at={18}>
          <div style={{ fontFamily: sans, fontSize: 40, color: "#C9C4B8", marginTop: 18 }}>
            {course.title} — with {course.prof.name}
          </div>
        </Rise>
        <Rise at={30}>
          <Label color={Z.gold} style={{ marginTop: 70, fontSize: 26 }}>Sources</Label>
          <div style={{ fontFamily: mono, fontSize: 34, lineHeight: 1.6, color: "#F6F4EE", marginTop: 16, maxWidth: 1600 }}>{domains.join("  ·  ")}</div>
        </Rise>
      </div>
    </AbsoluteFill>
  );
};

export const Course: React.FC<CourseT> = (course) => {
  const frame = useCurrentFrame();
  const t = timeline(course);
  const index = t.scenes.findIndex((s) => frame >= s.from && frame < s.from + s.dur);
  return (
    <AbsoluteFill style={{ background: Z.paper, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 85% 75% at 50% 45%, transparent 55%, rgba(60,50,30,0.12))" }} />
      <Header course={course} />
      {t.scenes.map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={s.dur} layout="none">
          <SceneFrame dur={s.dur}>
            <SceneView scene={s.scene} course={course} dur={s.dur} />
          </SceneFrame>
        </Sequence>
      ))}
      <Footer course={course} total={t.total} index={index === -1 ? t.scenes.length : index} count={t.scenes.length} />
      <Grain />
      <Sequence from={t.closing.from} durationInFrames={t.closing.dur}>
        <Closing course={course} dur={t.closing.dur} />
      </Sequence>
    </AbsoluteFill>
  );
};
