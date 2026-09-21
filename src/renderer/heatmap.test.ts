import { describe, expect, it } from "vitest";
import type { Vec3 } from "../models";
import { buildHeatmapCells, MAX_HEATMAP_CELLS, type HeatmapCell } from "./heatmap";

function samples(boundary: Vec3, step: number, exclude?: (index: Vec3) => boolean) {
  const n = boundary.map((v) => Math.ceil(v / step)) as Vec3;
  const voxelSize = boundary.map((v, axis) => v / n[axis]) as Vec3;
  const coordinates: number[] = [];
  for (let z = 0; z < n[2]; z++)
    for (let y = 0; y < n[1]; y++)
      for (let x = 0; x < n[0]; x++) {
        if (exclude?.([x, y, z])) continue;
        coordinates.push(
          (x + 0.5) * voxelSize[0] - boundary[0] / 2,
          (y + 0.5) * voxelSize[1] - boundary[1] / 2,
          (z + 0.5) * voxelSize[2],
        );
      }
  const positions = new Float32Array(coordinates);
  return {
    boundary,
    voxelSize,
    positions,
    counts: new Uint16Array(positions.length / 3).fill(8),
    errors: new Float32Array(positions.length / 3).fill(0.25),
  };
}

// Check the actual occupied volume and the interval tiling seen from every axis,
// rather than only checking the number of instances sent to the renderer.
function expectFilled(cells: HeatmapCell[], boundary: Vec3, height = boundary[2]) {
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.length).toBeLessThanOrEqual(MAX_HEATMAP_CELLS);
  const totalVolume = cells.reduce(
    (sum, c) => sum + c.size[0] * c.size[1] * c.size[2],
    0,
  );
  expect(totalVolume).toBeCloseTo(boundary[0] * boundary[1] * height, 7);
  let combinations = 1;
  for (let axis = 0; axis < 3; axis++) {
    const intervals = new Map<string, [number, number]>();
    for (const cell of cells) {
      const lower = cell.position[axis] - cell.size[axis] / 2;
      const upper = cell.position[axis] + cell.size[axis] / 2;
      intervals.set(lower.toFixed(9), [lower, upper]);
    }
    const sorted = [...intervals.values()].sort((a, b) => a[0] - b[0]);
    expect(sorted[0][0]).toBeCloseTo(axis === 2 ? 0 : -boundary[axis] / 2, 9);
    expect(sorted.at(-1)![1]).toBeCloseTo(axis === 2 ? height : boundary[axis] / 2, 9);
    for (let i = 1; i < sorted.length; i++)
      expect(sorted[i][0]).toBeCloseTo(sorted[i - 1][1], 9);
    combinations *= sorted.length;
  }
  expect(cells.length).toBe(combinations);
}

describe("heatmap spatial display", () => {
  it.each([0.2, 0.1])(
    "fills a 12 × 10 × 5 m scene at %s m spacing without missing planes",
    (step) => {
      const result = samples([12, 10, 5], step);
      expect(result.counts.length).toBeGreaterThan(MAX_HEATMAP_CELLS);
      expectFilled(buildHeatmapCells(result, 5), result.boundary);
    },
  );

  it("fills a small scene at 0.05 m spacing above the display limit", () => {
    const result = samples([3, 2, 1.5], 0.05);
    expectFilled(buildHeatmapCells(result, 1.5), result.boundary);
  });

  it("covers non-divisible boundaries and clips cells at the exact selected height", () => {
    const result = samples([12.03, 10.07, 5.11], 0.1);
    expectFilled(buildHeatmapCells(result, 5.11), result.boundary);
    expectFilled(buildHeatmapCells(result, 1.23), result.boundary, 1.23);
    expectFilled(buildHeatmapCells(result, 0.02), result.boundary, 0.02);
    expect(buildHeatmapCells(result, 0)).toEqual([]);
  });

  it("preserves individual cells and their values below the display limit", () => {
    const result = samples([1, 1, 1], 0.1);
    result.counts[3] = 2;
    result.errors[3] = 0.7;
    const cells = buildHeatmapCells(result, 1);
    expectFilled(cells, result.boundary);
    expect(cells).toHaveLength(result.counts.length);
    expect(cells[3].count).toBe(2);
    expect(cells[3].error).toBeCloseTo(0.7);
    cells[3].size.forEach((size, axis) =>
      expect(size).toBeCloseTo(result.voxelSize[axis], 12),
    );
  });

  it("retains isolated poor samples, undefined accuracy and full simulation data", () => {
    const result = samples([2, 2, 2], 0.1);
    result.counts[1] = 0; // This sample was skipped by the old flat stride.
    result.errors[1] = NaN;
    result.errors[7999] = 5;
    const before = {
      positions: result.positions.slice(),
      counts: result.counts.slice(),
      errors: result.errors.slice(),
    };
    const cells = buildHeatmapCells(result, 2, 1000);
    expect(cells.some((c) => c.count === 0 && Number.isNaN(c.error))).toBe(true);
    expect(cells.some((c) => c.error === 5)).toBe(true);
    expect(result.positions).toEqual(before.positions);
    expect(result.counts).toEqual(before.counts);
    expect(result.errors).toEqual(before.errors);
    expectFilled(cells, result.boundary);
  });

  it("uses spatial coordinates after obstacle cells are removed from the flat arrays", () => {
    const result = samples(
      [2, 2, 2],
      0.1,
      ([x, y, z]) => (x < 4 && y < 4 && z < 4) || (x === 11 && y === 3 && z === 7),
    );
    const cells = buildHeatmapCells(result, 2, 1000);
    expect(cells.length).toBeLessThanOrEqual(1000);
    expect(
      cells.some(
        (c) => c.position[0] < -0.6 && c.position[1] < -0.6 && c.position[2] < 0.4,
      ),
    ).toBe(false);
    const occupied = cells.reduce((sum, c) => sum + c.size[0] * c.size[1] * c.size[2], 0);
    // Fully excluded cells stay empty; a partly occupied coarse cell is retained.
    expect(occupied).toBeCloseTo(8 - 0.4 ** 3);
  });

  it("respects the budget for a thin volume with only one cell on two axes", () => {
    const result = samples([70, 0.001, 0.001], 0.001);
    expectFilled(buildHeatmapCells(result, 0.001), result.boundary);
  });

  it("does not include hidden samples above the cut in merged diagnostics", () => {
    const result = samples([1, 1, 4], 1);
    result.counts[2] = 0;
    result.errors[2] = NaN;
    const cells = buildHeatmapCells(result, 1.2, 1);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ count: 8, error: 0.25, size: [1, 1, 1.2] });
  });

  it("returns an empty display for a completely excluded volume", () => {
    expect(
      buildHeatmapCells(
        samples([1, 1, 1], 0.1, () => true),
        1,
      ),
    ).toEqual([]);
  });
});
