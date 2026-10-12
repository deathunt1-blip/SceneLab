import { describe, expect, it } from "vitest";
import { createP3Model } from "../camera/repository";
import type { Scheme, SimulationResult } from "../models";
import { makeCamera, makeObject } from "../project/data";
import { simulate } from "./engine";
import { enabledCameraCount, sharedCoverageStats } from "./sharedVisibility";

function sampledResult(counts: number[], zs: number[] = counts.map(() => 0.5)) {
  return {
    schemeId: "shared",
    revision: 0,
    timestamp: "2026-10-12T00:00:00Z",
    elapsed: 0,
    boundary: [counts.length || 1, 1, 2],
    voxelSize: [1, 1, 1],
    positions: new Float32Array(zs.flatMap((z, i) => [i, 0, z])),
    counts: new Uint16Array(counts),
    cameraCounts: new Uint16Array(counts),
    errors: new Float32Array(counts.length).fill(NaN),
    validVoxels: counts.length,
    excludedVoxels: 0,
    coverage: [0, 0, 0, 0, 0],
    averageCount: 0,
    meanError: null,
    p90: null,
    p95: null,
    under03: 0,
    under05: 0,
    invalidAccuracy: counts.length,
    issues: [],
  } as SimulationResult;
}

function stereoScene(): Scheme {
  return {
    id: "stereo",
    name: "Stereo test",
    boundary: [0.2, 0.2, 0.2],
    objects: [makeCamera(createP3Model(), [0, -2, 0.1], [0, 0, 0.1])],
    settings: {
      voxel: 1,
      markerDiameter: 20,
      errorThreshold: 0.5,
      autoUpdate: false,
    },
    revision: 0,
  };
}

describe("common visibility thresholds", () => {
  it("selects at least three or eight physical cameras and includes zero coverage in the denominator", () => {
    const result = sampledResult([0, 2, 3, 7, 8, 10]);
    const three = sharedCoverageStats(result, 3);
    expect(three).toMatchObject({
      totalSamples: 6,
      matchingSamples: 4,
      totalVolume: 6,
      volume: 4,
      maxCameraCount: 10,
    });
    expect(three.percent).toBeCloseTo((4 / 6) * 100);
    const eight = sharedCoverageStats(result, 8);
    expect(eight.matchingSamples).toBe(2);
    expect(eight.volume).toBe(2);
    expect(eight.percent).toBeCloseTo((2 / 6) * 100);
    expect(sharedCoverageStats(result, 11).percent).toBe(0);
  });

  it("uses physical camera counts even when the original analysis counts include stereo eyes", () => {
    const result = sampledResult([2, 8]);
    result.cameraCounts = new Uint16Array([1, 4]);
    expect(sharedCoverageStats(result, 3).matchingSamples).toBe(1);
    expect(sharedCoverageStats(result, 8).matchingSamples).toBe(0);
    expect(sharedCoverageStats(result, 0)).toMatchObject({
      totalSamples: 2,
      matchingSamples: 2,
      totalVolume: 2,
      volume: 2,
      percent: 100,
      maxCameraCount: 4,
    });
  });

  it("weights partly clipped voxels by their intersecting height rather than their sample centre", () => {
    const result = sampledResult([8, 2], [0.5, 1.5]);
    expect(sharedCoverageStats(result, 8, 1.25)).toEqual({
      totalSamples: 2,
      matchingSamples: 1,
      totalVolume: 1.25,
      volume: 1,
      percent: 80,
      maxCameraCount: 8,
    });
    expect(sharedCoverageStats(result, 8, 0.25)).toMatchObject({
      totalSamples: 1,
      matchingSamples: 1,
      totalVolume: 0.25,
      volume: 0.25,
      percent: 100,
    });
    expect(sharedCoverageStats(result, 8, 50).totalVolume).toBe(2);
  });

  it("does not include Float32 round-off from a row above an exact height cut", () => {
    const result = sampledResult([3, 12], [0.25, 0.35]);
    result.voxelSize = [1, 1, 0.1];
    const stats = sharedCoverageStats(result, 3, 0.3);
    expect(stats.totalSamples).toBe(1);
    expect(stats.maxCameraCount).toBe(3);
    expect(stats.volume).toBeCloseTo(0.1);
  });

  it("computes the maximum only within the displayed height and handles an empty clip", () => {
    const result = sampledResult([3, 12], [0.5, 1.5]);
    expect(sharedCoverageStats(result, 3, 1).maxCameraCount).toBe(3);
    expect(sharedCoverageStats(result, 0, 0)).toEqual({
      totalSamples: 0,
      matchingSamples: 0,
      totalVolume: 0,
      volume: 0,
      percent: 0,
      maxCameraCount: 0,
    });
    expect(sharedCoverageStats(sampledResult([]), 8).percent).toBe(0);
  });
});

describe("physical camera simulation", () => {
  it("counts both valid P3 stereo eyes as one physical camera while preserving viewpoint accuracy", () => {
    const scheme = stereoScene();
    const result = simulate(scheme);
    expect(result.counts).toEqual(new Uint16Array([2]));
    expect(result.cameraCounts).toEqual(new Uint16Array([1]));
    expect(result.coverage).toEqual([100, 100, 0, 0, 0]);
    expect(Number.isFinite(result.errors[0])).toBe(true);
    expect(sharedCoverageStats(result, 2).percent).toBe(0);
    expect(sharedCoverageStats(result, 1).percent).toBe(100);
  });

  it("includes hidden cameras but excludes disabled, unsupported and unconfigured devices", () => {
    const scheme = stereoScene();
    const camera = scheme.objects[0];
    camera.visible = false;
    expect(enabledCameraCount(scheme)).toBe(1);
    expect(simulate(scheme).cameraCounts[0]).toBe(1);
    scheme.objects.push(
      { ...camera, id: "disabled", enabled: false },
      {
        ...camera,
        id: "unsupported",
        camera_model_snapshot: {
          ...camera.camera_model_snapshot!,
          layout_supported: false,
        },
      },
      { ...camera, id: "no-model", camera_model_snapshot: undefined },
      makeObject("marker"),
    );
    expect(enabledCameraCount(scheme)).toBe(1);
    expect(simulate(scheme).cameraCounts[0]).toBe(1);
    camera.enabled = false;
    expect(enabledCameraCount(scheme)).toBe(0);
    expect(simulate(scheme).cameraCounts[0]).toBe(0);
  });

  it("excludes obstacle interiors from common visibility volume and handles a completely excluded volume", () => {
    const scheme = stereoScene();
    scheme.boundary = [2, 2, 2];
    scheme.objects = [
      {
        ...makeObject("box"),
        position: [-0.5, -0.5, 0.5],
        size: [0.9, 0.9, 0.9],
      },
    ];
    const result = simulate(scheme);
    expect(result.excludedVoxels).toBe(1);
    expect(sharedCoverageStats(result, 0)).toMatchObject({
      totalSamples: 7,
      matchingSamples: 7,
      totalVolume: 7,
      volume: 7,
      percent: 100,
    });
    scheme.objects[0].position = [0, 0, 1];
    scheme.objects[0].size = [3, 3, 3];
    const empty = simulate(scheme);
    expect(empty.cameraCounts).toHaveLength(0);
    expect(sharedCoverageStats(empty, 0)).toMatchObject({
      totalSamples: 0,
      totalVolume: 0,
      volume: 0,
      percent: 0,
    });
  });
});
