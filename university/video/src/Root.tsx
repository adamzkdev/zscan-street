import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { Course } from "./Course";
import { FPS, timeline } from "./timing";
import type { Course as CourseT } from "./types";
// Default props for the studio; renders pass a course JSON as input props (scripts/render.mjs).
import sample from "../../courses/what-is-a-zksnark.json";

const calculateMetadata: CalculateMetadataFunction<CourseT> = ({ props }) => ({
  durationInFrames: Math.max(1, timeline(props).total),
  fps: FPS,
});

export const Root: React.FC = () => (
  <Composition
    id="Course"
    component={Course}
    width={1920}
    height={1080}
    fps={FPS}
    durationInFrames={FPS * 60}
    defaultProps={sample as CourseT}
    calculateMetadata={calculateMetadata}
  />
);
