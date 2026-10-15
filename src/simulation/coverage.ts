import type { Settings, SimulationResult, Vec3 } from "../models";

export type CoveragePalette = "spectrum" | "blue";
export interface CoverageSettings {
  coverageBasis: "imaging" | "trackingRange";
  coverageThreshold: number;
  coverageScaleMax: number;
  coveragePalette: CoveragePalette;
  highlightCoverageThreshold: boolean;
  trackingRangeSource: "model" | "manual";
  trackingRangeOverrideM: number | null;
}
export const coverageDefaults: CoverageSettings = {
  coverageBasis: "imaging",
  coverageThreshold: 3,
  coverageScaleMax: 8,
  coveragePalette: "spectrum",
  highlightCoverageThreshold: false,
  trackingRangeSource: "model",
  trackingRangeOverrideM: null,
};
export const MAX_COVERAGE_VIEWS = 400;
export function coverageSettings(s: Partial<CoverageSettings>): CoverageSettings {
  const out: CoverageSettings = {
    coverageBasis: s.coverageBasis ?? "imaging",
    coverageThreshold: s.coverageThreshold ?? 3,
    coverageScaleMax: s.coverageScaleMax ?? 8,
    coveragePalette: s.coveragePalette ?? "spectrum",
    highlightCoverageThreshold: s.highlightCoverageThreshold ?? false,
    trackingRangeSource: s.trackingRangeSource ?? "model",
    trackingRangeOverrideM: s.trackingRangeOverrideM ?? null,
  };
  out.coverageScaleMax = Math.max(out.coverageThreshold, out.coverageScaleMax);
  return out;
}
export function validCoverageSettings(s: Partial<CoverageSettings>) {
  const c = coverageSettings(s);
  return (
    ["imaging", "trackingRange"].includes(c.coverageBasis) &&
    ["model", "manual"].includes(c.trackingRangeSource) &&
    ["spectrum", "blue"].includes(c.coveragePalette) &&
    Number.isInteger(c.coverageThreshold) &&
    c.coverageThreshold >= 1 &&
    c.coverageThreshold <= MAX_COVERAGE_VIEWS &&
    Number.isInteger(c.coverageScaleMax) &&
    c.coverageScaleMax >= 1 &&
    c.coverageScaleMax <= MAX_COVERAGE_VIEWS &&
    typeof c.highlightCoverageThreshold === "boolean" &&
    (c.trackingRangeOverrideM === null ||
      (Number.isFinite(c.trackingRangeOverrideM) &&
        c.trackingRangeOverrideM > 0 &&
        c.trackingRangeOverrideM <= 10000)) &&
    (c.trackingRangeSource !== "manual" || c.trackingRangeOverrideM !== null)
  );
}
export function coverageAt(
  r: Pick<SimulationResult, "counts" | "validVoxels" | "viewCountHistogram">,
  k: number,
) {
  const passed = r.viewCountHistogram
    ? r.viewCountHistogram.reduce((sum, n, i) => sum + (i >= k ? n : 0), 0)
    : r.counts.reduce((sum, n) => sum + Number(n >= k), 0);
  return r.validVoxels ? (100 * passed) / r.validVoxels : 0;
}
export function coverageIssues(r: SimulationResult, threshold: number) {
  let count = 0,
    position: Vec3 = [0, 0, 0];
  for (let i = 0; i < r.counts.length; i++)
    if (r.counts[i] < threshold) {
      if (!count) position = Array.from(r.positions.slice(i * 3, i * 3 + 3)) as Vec3;
      count++;
    }
  return [
    ...(count ? [{ type: "requirement" as const, count, position }] : []),
    ...r.issues,
  ];
}
/** Capture identity includes display settings, even when simulation revision is unchanged. */
export function coverageDisplayKey(s: Settings) {
  const c = coverageSettings(s);
  return JSON.stringify([
    c.coverageBasis,
    c.coverageThreshold,
    c.coverageScaleMax,
    c.coveragePalette,
    c.highlightCoverageThreshold,
    c.trackingRangeSource,
    c.trackingRangeOverrideM,
  ]);
}
