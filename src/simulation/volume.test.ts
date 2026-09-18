import { describe, expect, it } from "vitest";
import type { Vec3 } from "../models";
import { pointInVolume, reconcileAnalysisView, volumeCenter } from "./volume";

describe("analysis volume", () => {
  const boundary: Vec3 = [1.5, 1, 1];

  it("uses the current height for the default diagnostic point in a small scene", () => {
    expect(volumeCenter(boundary)).toEqual([0, 0, 0.5]);
    expect(pointInVolume(volumeCenter(boundary), boundary)).toBe(true);
  });

  it("rejects all out-of-bounds axes, including clicks above or below front and side views", () => {
    const outside: Vec3[] = [
      [0.76, 0, 0.5],
      [-0.76, 0, 0.5],
      [0, 0.51, 0.5],
      [0, -0.51, 0.5],
      [0, 0, 1.01],
      [0, 0, -0.01],
      [NaN, 0, 0.5],
    ];
    for (const point of outside) expect(pointInVolume(point, boundary)).toBe(false);
    expect(pointInVolume([-0.75, -0.5, 0], boundary)).toBe(true);
    expect(pointInVolume([0.75, 0.5, 1], boundary)).toBe(true);
  });

  it("recenters an old point after shrinking the scene and keeps the clip inside", () => {
    expect(reconcileAnalysisView(boundary, [5, 3, 1.2], 4, [12, 10, 5])).toEqual({
      point: [0, 0, 0.5],
      clip: 1,
      reset: true,
    });
  });

  it("preserves an in-bounds point, partial clip and absence of a selected point", () => {
    expect(reconcileAnalysisView(boundary, [0.2, -0.3, 0.4], 0.6, [12, 10, 5])).toEqual({
      point: [0.2, -0.3, 0.4],
      clip: 0.6,
      reset: false,
    });
    expect(reconcileAnalysisView(boundary, null, 0.6).point).toBeNull();
  });
});
