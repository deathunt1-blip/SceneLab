import type { CameraModel, Scheme } from "../models";
import { sampleCount } from "../simulation/engine";
import { profiles, type Constraints } from "./types";

export function defaultConstraints(s: Scheme): Constraints {
  return {
    boundary: [...s.boundary],
    markerDiameter: s.settings.markerDiameter,
    errorThreshold: s.settings.errorThreshold,
    accuracyTarget: 90,
    minViews: 3,
    coverageTarget: 95,
    modelIds: [],
    countMode: "auto",
    count: 16,
    minCount: 8,
    maxCount: 64,
    installation: "auto",
    layers: "auto",
    profile: "balanced",
    weighting: "center",
    activity: null,
    seed: 140,
  };
}
export function validateConstraints(
  c: Constraints,
  models: CameraModel[],
  scheme?: Scheme,
) {
  const number = (x: unknown, min: number, max: number) =>
    typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
  if (
    !c ||
    !Array.isArray(c.boundary) ||
    c.boundary.length !== 3 ||
    !c.boundary.every((x) => number(x, 0.1, 1000))
  )
    throw new Error("adInvalidBoundary");
  if (
    !number(c.markerDiameter, 0.1, 1000) ||
    !number(c.errorThreshold, 0.001, 1000) ||
    !number(c.coverageTarget, 1, 100) ||
    (c.accuracyTarget !== null && !number(c.accuracyTarget, 1, 100)) ||
    ![2, 3, 4].includes(c.minViews) ||
    !profiles.includes(c.profile) ||
    !["center", "uniform"].includes(c.weighting) ||
    !["auto", "perimeter", "ceiling", "hybrid", "free", "existing"].includes(
      c.installation,
    ) ||
    !["auto", "exact", "range"].includes(c.countMode) ||
    ![c.count, c.minCount, c.maxCount].every(
      (x) => Number.isInteger(x) && number(x, 1, 200),
    ) ||
    c.minCount > c.maxCount ||
    (c.layers !== "auto" && (!Number.isInteger(c.layers) || !number(c.layers, 1, 8))) ||
    !Number.isSafeInteger(c.seed) ||
    c.seed < 0 ||
    c.seed > 2147483647
  )
    throw new Error("adInvalidConstraints");
  if (
    c.activity !== null &&
    (!Array.isArray(c.activity) ||
      c.activity.length !== 2 ||
      !c.activity.every((x) => number(x, 0, c.boundary[2])) ||
      c.activity[0] >= c.activity[1])
  )
    throw new Error("adInvalidActivity");
  if (
    !Array.isArray(c.modelIds) ||
    c.modelIds.some(
      (id) => !models.some((m) => m.id === id && m.layout_supported !== false),
    )
  )
    throw new Error("adInvalidModels");
  if (
    !models.some(
      (m) =>
        m.layout_supported !== false && (!c.modelIds.length || c.modelIds.includes(m.id)),
    )
  )
    throw new Error("adInvalidModels");
  if (scheme && sampleCount({ ...scheme, boundary: c.boundary }) > 1_200_000)
    throw new Error("voxelLimit");
}
export function countOptions(c: Constraints) {
  if (c.countMode === "exact") return [c.count];
  const min = c.countMode === "range" ? c.minCount : 8;
  const max = c.countMode === "range" ? c.maxCount : 64;
  return [
    ...new Set([
      min,
      ...[8, 12, 16, 20, 24, 28, 32, 40, 48, 64, 96, 128, 160, 200].filter(
        (n) => n >= min && n <= max,
      ),
      max,
    ]),
  ].sort((a, b) => a - b);
}
export function coarseSpacing(boundary: number[]) {
  let step = Math.max(0.5, Math.cbrt(boundary.reduce((a, b) => a * b, 1) / 1800));
  while (boundary.reduce((a, b) => a * Math.ceil(b / step), 1) > 2200) step *= 1.05;
  return Math.ceil(step * 100) / 100;
}
