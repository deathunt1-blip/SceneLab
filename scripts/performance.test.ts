import { expect, it } from "vitest";
import { derive, newModel } from "../src/camera/repository";
import { cameraArray } from "../src/project/data";
import { simulate } from "../src/simulation/engine";
import type { Scheme } from "../src/models";
import { mkdirSync, writeFileSync } from "node:fs";
it("calculates a 20 × 20 × 15 m volume with 32 cameras in a worker-compatible pure engine", () => {
  const m = derive({ ...newModel(), hfov_deg: 60, vfov_deg: 48 });
  const s: Scheme = {
    id: "benchmark",
    name: "A",
    boundary: [20, 20, 15],
    revision: 0,
    settings: { voxel: 0.5, markerDiameter: 12, errorThreshold: 0.5, autoUpdate: false },
    objects: cameraArray(m, "circle", 32, 10, 7, [0, 0, 4]),
  };
  const r = simulate(s);
  expect(r.validVoxels).toBe(48000);
  expect(r.counts.length).toBe(48000);
  expect(r.meanError).not.toBeNull();
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/performance.json",
    JSON.stringify(
      {
        cameras: 32,
        volume: s.boundary,
        voxel: 0.5,
        points: r.validVoxels,
        elapsedMs: Math.round(r.elapsed),
        coverage2: r.coverage[1],
        coverage3: r.coverage[2],
        meanErrorMm: r.meanError,
      },
      null,
      2,
    ),
  );
}, 60000);
