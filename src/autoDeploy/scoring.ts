import type { SimulationResult } from "../models";
import type { Constraints, Evaluation, Metrics, Profile } from "./types";

export function metricsFor(r: SimulationResult, c: Constraints): Metrics {
  let pass = 0,
    center = 0,
    centerHit = 0,
    weight = 0,
    covered = 0,
    precise = 0;
  for (let i = 0; i < r.validVoxels; i++) {
    const x = (2 * r.positions[i * 3]) / c.boundary[0],
      y = (2 * r.positions[i * 3 + 1]) / c.boundary[1],
      z = r.positions[i * 3 + 2];
    const active = !c.activity || (z >= c.activity[0] && z <= c.activity[1]);
    const w =
      (c.weighting === "center"
        ? 1 + 2 * Math.max(0, 1 - x * x) * Math.max(0, 1 - y * y)
        : 1) * (active && c.activity ? 3 : 1);
    const hit = r.counts[i] >= c.minViews,
      accurate = Number.isFinite(r.errors[i]) && r.errors[i] <= c.errorThreshold;
    weight += w;
    if (hit) covered += w;
    if (accurate) {
      pass++;
      precise += w;
    }
    if (Math.abs(x) <= 0.5 && Math.abs(y) <= 0.5) {
      center++;
      if (hit) centerHit++;
    }
  }
  const accuracyPass = r.validVoxels ? (pass / r.validVoxels) * 100 : 0;
  const targetCoverage = r.coverage[c.minViews - 1];
  return {
    coverage: r.coverage,
    targetCoverage,
    centerCoverage: center ? (centerHit / center) * 100 : targetCoverage,
    weightedCoverage: weight ? (covered / weight) * 100 : 0,
    weightedAccuracy: weight ? (precise / weight) * 100 : 0,
    accuracyPass,
    averageCount: r.averageCount,
    meanError: r.meanError,
    p90: r.p90,
    p95: r.p95,
    invalidAccuracy: r.invalidAccuracy,
    validVoxels: r.validVoxels,
    issues: r.issues,
    meetsTarget:
      r.validVoxels > 0 &&
      targetCoverage >= c.coverageTarget &&
      (c.accuracyTarget === null || accuracyPass >= c.accuracyTarget),
  };
}
// Positive means a is preferred. All operands come from the physical simulator.
export function comparePlans(
  a: Evaluation,
  b: Evaluation,
  c: Constraints,
  profile: Profile,
): number {
  const x = a.metrics,
    y = b.metrics;
  if (x.meetsTarget !== y.meetsTarget) return x.meetsTarget ? 1 : -1;
  if (!x.meetsTarget) {
    // Best effort retains useful volume before trading it for precise isolated pockets.
    const priorities = [
      ...(c.weighting === "center" ? [x.centerCoverage - y.centerCoverage] : []),
      x.targetCoverage - y.targetCoverage,
      x.averageCount - y.averageCount,
      x.accuracyPass - y.accuracyPass,
    ];
    const difference = priorities.find((v) => Math.abs(v) > 1e-6);
    if (difference !== undefined) return difference;
  }
  const count =
    c.countMode === "exact" ? 0 : b.candidate.params.count - a.candidate.params.count;
  if (profile === "minimum" && count) return count;
  if (profile === "coverage")
    return (
      x.weightedCoverage - y.weightedCoverage ||
      x.targetCoverage - y.targetCoverage ||
      x.averageCount - y.averageCount ||
      x.accuracyPass - y.accuracyPass ||
      count
    );
  if (profile === "accuracy")
    return (
      x.weightedAccuracy - y.weightedAccuracy ||
      x.accuracyPass - y.accuracyPass ||
      (y.p95 ?? 1e9) - (x.p95 ?? 1e9) ||
      x.targetCoverage - y.targetCoverage ||
      count
    );
  const utility = (e: Evaluation) =>
    0.36 * e.metrics.weightedCoverage +
    0.24 * e.metrics.targetCoverage +
    0.3 * e.metrics.weightedAccuracy +
    Math.min(8, e.metrics.averageCount) * 1.25 -
    (c.countMode === "exact" ? 0 : e.candidate.params.count * 0.08);
  return utility(a) - utility(b) || count;
}
export function rank(plans: Evaluation[], c: Constraints, profile: Profile) {
  return [...plans].sort(
    (a, b) =>
      comparePlans(b, a, c, profile) || a.candidate.id.localeCompare(b.candidate.id),
  );
}
