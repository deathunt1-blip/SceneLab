import type { SimulationResult, Vec3 } from "../models";

export const MAX_HEATMAP_CELLS = 60_000;
type Samples = Pick<
  SimulationResult,
  "boundary" | "voxelSize" | "positions" | "counts" | "errors"
>;
export interface HeatmapCell {
  position: Vec3;
  size: Vec3;
  count: number;
  error: number;
}

const volume = (n: Vec3) => n[0] * n[1] * n[2];

// Reduce all three axes together. A stride through the flat sample array can
// repeatedly select the same X columns and leave entire planes unrendered.
function displayGrid(source: Vec3, limit: number): Vec3 {
  if (volume(source) <= limit) return source;
  const atScale = (scale: number) =>
    source.map((n) => Math.max(1, Math.floor(n / scale))) as Vec3;
  let low = 1;
  let high = Math.max(...source);
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (volume(atScale(mid)) > limit) low = mid;
    else high = mid;
  }
  return atScale(high);
}

/** Display-only spatial aggregation; never changes simulation samples/statistics. */
export function buildHeatmapCells(
  result: Samples,
  clip: number,
  limit = MAX_HEATMAP_CELLS,
): HeatmapCell[] {
  const { boundary, voxelSize, positions, counts, errors } = result;
  const height = Math.max(0, Math.min(clip, boundary[2]));
  if (!counts.length || height === 0) return [];
  const origin: Vec3 = [-boundary[0] / 2, -boundary[1] / 2, 0];
  const source = boundary.map((length, axis) =>
    Math.max(1, Math.round(length / voxelSize[axis])),
  ) as Vec3;
  const grid = counts.length <= limit ? source : displayGrid(source, Math.max(1, limit));
  const cells = new Map<number, HeatmapCell>();

  for (let i = 0; i < counts.length; i++) {
    const index = source.map((n, axis) =>
      Math.max(
        0,
        Math.min(
          n - 1,
          Math.round((positions[i * 3 + axis] - origin[axis]) / voxelSize[axis] - 0.5),
        ),
      ),
    ) as Vec3;
    // Include the portion of a source voxel intersecting the height cut.
    if (index[2] * voxelSize[2] >= height - 1e-9) continue;
    const group = index.map(
      (n, axis) => Math.ceil(((n + 1) * grid[axis]) / source[axis]) - 1,
    ) as Vec3;
    const key = group[0] + grid[0] * (group[1] + grid[1] * group[2]);
    const existing = cells.get(key);
    if (existing) {
      // Keep weak coverage and undefined accuracy visible when cells are merged.
      existing.count = Math.min(existing.count, counts[i]);
      existing.error = Math.max(existing.error, errors[i]); // NaN remains NaN.
      continue;
    }
    const lower = group.map(
      (g, axis) =>
        origin[axis] + Math.floor((g * source[axis]) / grid[axis]) * voxelSize[axis],
    ) as Vec3;
    const upper = group.map(
      (g, axis) =>
        origin[axis] +
        Math.floor(((g + 1) * source[axis]) / grid[axis]) * voxelSize[axis],
    ) as Vec3;
    upper[2] = Math.min(upper[2], height);
    cells.set(key, {
      position: lower.map((v, axis) => (v + upper[axis]) / 2) as Vec3,
      size: lower.map((v, axis) => upper[axis] - v) as Vec3,
      count: counts[i],
      error: errors[i],
    });
  }
  return [...cells.values()];
}
