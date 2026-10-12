import type { Scheme, SimulationResult } from "../models";

export type SharedVisibilityInput = Pick<
  SimulationResult,
  "boundary" | "voxelSize" | "positions" | "cameraCounts"
>;

export interface SharedCoverageStats {
  totalSamples: number;
  matchingSamples: number;
  totalVolume: number;
  volume: number;
  percent: number;
  maxCameraCount: number;
}

/** Enabled physical devices, irrespective of scene display visibility. */
export function enabledCameraCount(scheme: Scheme): number {
  return scheme.objects.filter(
    (object) =>
      object.kind === "camera" &&
      object.enabled &&
      object.camera_model_snapshot &&
      object.camera_model_snapshot.layout_supported !== false,
  ).length;
}

/**
 * Estimate common visibility from original (unmerged) simulation samples.
 * A threshold of zero includes every available sample. Excluded obstacle
 * interiors are absent from the simulation arrays and from this denominator.
 */
export function sharedCoverageStats(
  result: SharedVisibilityInput,
  minimum: number,
  clip: number = result.boundary[2],
): SharedCoverageStats {
  const stats: SharedCoverageStats = {
    totalSamples: 0,
    matchingSamples: 0,
    totalVolume: 0,
    volume: 0,
    percent: 0,
    maxCameraCount: 0,
  };
  const top = Math.max(
    0,
    Math.min(Number.isNaN(clip) ? result.boundary[2] : clip, result.boundary[2]),
  );
  const threshold = Number.isFinite(minimum) ? Math.max(0, Math.ceil(minimum)) : 0;
  const [width, depth, height] = result.voxelSize;
  if (top <= 0 || width <= 0 || depth <= 0 || height <= 0) return stats;

  for (let index = 0; index < result.cameraCounts.length; index++) {
    const z = result.positions[index * 3 + 2];
    // Positions are Float32 centres. Recover the grid row so round-off at an
    // exact cut cannot count a sliver of the next row or change the legend.
    const row = Math.max(0, Math.round(z / height - 0.5));
    const lower = row * height;
    const clippedHeight = Math.max(
      0,
      Math.min(top, result.boundary[2], lower + height) - lower,
    );
    if (clippedHeight <= 0) continue;

    const volume = width * depth * clippedHeight;
    const count = result.cameraCounts[index];
    stats.totalSamples++;
    stats.totalVolume += volume;
    stats.maxCameraCount = Math.max(stats.maxCameraCount, count);
    if (count >= threshold) {
      stats.matchingSamples++;
      stats.volume += volume;
    }
  }
  stats.percent = stats.totalVolume ? (stats.volume / stats.totalVolume) * 100 : 0;
  return stats;
}
