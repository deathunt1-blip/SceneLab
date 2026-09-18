import type { Vec3 } from "../models";

export const volumeCenter = (boundary: Vec3): Vec3 => [0, 0, boundary[2] / 2];

export function pointInVolume(point: Vec3, boundary: Vec3) {
  return (
    point.every(Number.isFinite) &&
    Math.abs(point[0]) <= boundary[0] / 2 + 1e-9 &&
    Math.abs(point[1]) <= boundary[1] / 2 + 1e-9 &&
    point[2] >= -1e-9 &&
    point[2] <= boundary[2] + 1e-9
  );
}

export function reconcileAnalysisView(
  boundary: Vec3,
  point: Vec3 | null,
  clip: number,
  previousBoundary?: Vec3,
) {
  const reset = point !== null && !pointInVolume(point, boundary);
  return {
    point: reset ? volumeCenter(boundary) : point,
    clip:
      previousBoundary && clip >= previousBoundary[2]
        ? boundary[2]
        : Math.max(0, Math.min(Number.isFinite(clip) ? clip : boundary[2], boundary[2])),
    reset,
  };
}
