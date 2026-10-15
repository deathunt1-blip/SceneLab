import { describe, expect, it } from "vitest";
import {
  circlePoints,
  gridPoints,
  gridDimensions,
  linearPoints,
  rectanglePerimeterPoints,
} from "./arrayLayout";
import { cameraInventory } from "./inventory";
import { makeCamera, makeObject } from "./data";
import { newModel, createP3Model } from "../camera/repository";

describe("engineering arrays", () => {
  it("places 1/2/3/4 cameras at unique corners, using diagonals for two", () => {
    const corners = [
      [-10, -5, 3],
      [10, -5, 3],
      [10, 5, 3],
      [-10, 5, 3],
    ];
    expect(rectanglePerimeterPoints(1, 20, 10, 3)).toEqual([corners[0]]);
    expect(rectanglePerimeterPoints(2, 20, 10, 3)).toEqual([corners[0], corners[2]]);
    expect(rectanglePerimeterPoints(3, 20, 10, 3)).toEqual(corners.slice(0, 3));
    expect(rectanglePerimeterPoints(4, 20, 10, 3)).toEqual(corners);
  });
  it("apportions exact totals without duplicated corners; long edges get more cameras", () => {
    for (let n = 4; n <= 200; n++) {
      const p = rectanglePerimeterPoints(n, 20, 10, 3);
      expect(p).toHaveLength(n);
      expect(new Set(p.map((v) => v.join(","))).size).toBe(n);
      expect(p.every(([x, y]) => Math.abs(x) === 10 || Math.abs(y) === 5)).toBe(true);
    }
    const inside = rectanglePerimeterPoints(12, 20, 10).slice(4);
    expect(inside.filter((p) => Math.abs(p[1]) === 5).length).toBe(6);
    expect(inside.filter((p) => Math.abs(p[0]) === 10).length).toBe(2);
  });
  it("matches grid aspect and preserves exact count, including nonfactorable counts", () => {
    expect(gridDimensions(12, 20, 10)).toEqual({ rows: 3, cols: 4 });
    for (const n of [1, 7, 12, 17, 200]) {
      const p = gridPoints(n, 20, 10, 3);
      expect(p.length).toBe(n);
      expect(new Set(p.map((v) => v.join(","))).size).toBe(n);
    }
    expect(gridPoints(12, 20, 10, 3, 3, 4)).toHaveLength(12);
    expect(linearPoints(1, 20, 3)).toEqual([[0, 0, 3]]);
    expect(new Set(circlePoints(12, 5, 3).map((p) => p.join(","))).size).toBe(12);
    expect(circlePoints(3, 5, 3, 0, 180).at(-1)![0]).toBeCloseTo(-5);
  });
});
describe("snapshot camera inventory", () => {
  it("counts physical devices and mixed objects without any library lookup", () => {
    const a = { ...newModel(), display_name: "K18 · 8 mm" },
      b = { ...newModel(), display_name: "K26 · 8 mm" };
    const cameras = [
      ...Array.from({ length: 8 }, () => makeCamera(a, [0, 0, 0], [0, 1, 0])),
      ...Array.from({ length: 4 }, () => makeCamera(b, [0, 0, 0], [0, 1, 0])),
    ];
    const inv = cameraInventory([
      ...cameras,
      ...Array.from({ length: 4 }, () => makeObject("tube")),
    ]);
    expect(inv).toMatchObject({
      total: 12,
      viewpoints: 12,
      structures: 4,
      models: [
        { name: a.display_name, count: 8 },
        { name: b.display_name, count: 4 },
      ],
    });
    expect(cameraInventory(cameras.slice(0, 1)).total).toBe(1);
    expect(
      cameraInventory(
        Array.from({ length: 4 }, () =>
          makeCamera(createP3Model(), [0, 0, 0], [0, 1, 0]),
        ),
      ),
    ).toMatchObject({ total: 4, viewpoints: 8 });
  });
});
