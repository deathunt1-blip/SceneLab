import { describe, expect, it } from "vitest";
import {
  createP3Model,
  importModels,
  modelsCSV,
  validateModel,
} from "../camera/repository";
import { makeCamera, makeObject, makeProject, validateProject } from "../project/data";
import { analyzePoint, prepareCameras, viewCount, simulate } from "./engine";
import { cameraImage } from "./imaging";
import { dot, length, sub } from "./math";
import type { Vec3 } from "../models";

function setup() {
  const model = createP3Model();
  const project = makeProject();
  const scheme = project.schemes[0];
  const camera = makeCamera(model, [0, 0, 1], [0, 2, 1]);
  scheme.objects = [camera];
  return { model, project, scheme, camera };
}

describe("P3 IR stereo", () => {
  it("uses the confirmed per-eye specification and preserves hardware metadata", () => {
    const { model } = setup();
    expect(validateModel(model)).toEqual([]);
    expect(model).toMatchObject({
      resolution_width: 2048,
      resolution_height: 1536,
      hfov_deg: 57.31,
      vfov_deg: 44.58,
      focal_length_mm: 4.2,
      stereo: { baseline_mm: 144 },
      housing_mm: [188, 56, 38.5],
      max_working_distance_m: null,
    });
    expect(model.fx).toBeCloseTo(1024 / Math.tan((57.31 * Math.PI) / 360), 10);
    expect(model.catalog?.camera).toMatchObject({
      max_fps_full_resolution: 120,
      standby_power_w: 3.7,
      max_power_w: 15.7,
      weight_g: 484.3,
    });
  });
  it.each([
    [0, 0, 0],
    [90, 0, 0],
    [30, -25, 70],
  ] as Vec3[])(
    "rotates both optical centres with the device (%s, %s, %s)",
    (yaw, pitch, roll) => {
      const { scheme, camera } = setup();
      camera.rotation = [yaw, pitch, roll];
      const [left, right] = prepareCameras(scheme);
      expect(left.eye).toBe("left");
      expect(right.eye).toBe("right");
      const separation = sub(right.object.position, left.object.position);
      expect(length(separation)).toBeCloseTo(0.144, 12);
      expect(dot(separation, left.axes[0])).toBeCloseTo(0.144, 12);
      expect(dot(separation, left.axes[2])).toBeCloseTo(0, 12);
      for (let i = 0; i < 3; i++)
        expect((left.object.position[i] + right.object.position[i]) / 2).toBeCloseTo(
          camera.position[i],
          12,
        );
    },
  );
  it("locates a point with one stereo device and matches the analytic stereo depth uncertainty", () => {
    const { model, scheme } = setup();
    const near = analyzePoint([0, 2, 1], 20, scheme);
    const far = analyzePoint([0, 4, 1], 20, scheme);
    expect(viewCount(scheme)).toBe(2);
    expect(near.count).toBe(2);
    expect(near.accuracy!.y).toBeCloseTo(
      ((Math.SQRT2 * 0.1 * 2 ** 2) / (model.fx * 0.144)) * 1000,
      7,
    );
    expect(far.accuracy!.y / near.accuracy!.y).toBeCloseTo(4, 8);
  });
  it("checks each eye's occlusion separately, and disables the whole device together", () => {
    const { scheme, camera } = setup();
    scheme.objects.push({
      ...makeObject("box"),
      position: [-0.065, 0.2, 1],
      size: [0.02, 0.04, 0.15],
    });
    const result = analyzePoint([0, 2, 1], 20, scheme);
    expect(result.observations.find((o) => o.eye === "left")!.reasons).toContain(
      "occluded",
    );
    expect(result.observations.find((o) => o.eye === "right")!.valid).toBe(true);
    expect(result.count).toBe(1);
    expect(result.accuracy).toBeNull();
    camera.enabled = false;
    expect(prepareCameras(scheme)).toEqual([]);
    expect(viewCount(scheme)).toBe(0);
  });
  it("uses the same per-eye projection for previews, point diagnostics and volume analysis", () => {
    const { model, scheme, camera } = setup();
    const marker = { ...makeObject("marker"), position: [0, 2, 1] as Vec3, diameter: 20 };
    scheme.objects.push(marker);
    const left = cameraImage(scheme, camera.id, "left")!;
    const right = cameraImage(scheme, camera.id, "right")!;
    const point = analyzePoint(marker.position, marker.diameter, scheme);
    expect(left.points[0].u - right.points[0].u).toBeCloseTo((model.fx * 0.144) / 2, 9);
    expect(left.points[0].u).toBe(point.observations[0].u);
    expect(right.points[0].u).toBe(point.observations[1].u);
    const volume = simulate(scheme);
    for (let i = 0; i < volume.counts.length; i++) {
      const p = Array.from(volume.positions.slice(i * 3, i * 3 + 3)) as Vec3;
      expect(volume.counts[i]).toBe(
        analyzePoint(p, scheme.settings.markerDiameter, scheme).count,
      );
    }
  });
  it.each(["json", "csv"])(
    "round-trips stereo, housing and source data through %s",
    (format) => {
      const { model, project } = setup();
      const data =
        format === "csv"
          ? modelsCSV([model])
          : JSON.stringify({ schema_version: 1, models: [model] });
      const restored = importModels(data, format === "csv")[0];
      expect(restored.stereo).toEqual(model.stereo);
      expect(restored.housing_mm).toEqual(model.housing_mm);
      expect(restored.catalog).toEqual(model.catalog);
      expect(restored.max_working_distance_m).toBeNull();
      expect(() => validateProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
    },
  );
  it("rejects invalid stereo calibration and leaves mono cameras as one viewpoint", () => {
    const { model, scheme, camera } = setup();
    expect(validateModel({ ...model, stereo: { baseline_mm: 0 } })).toContain(
      "baselineInvalid",
    );
    expect(validateModel({ ...model, stereo: { baseline_mm: NaN } })).toContain(
      "baselineInvalid",
    );
    delete camera.camera_model_snapshot!.stereo;
    expect(prepareCameras(scheme)).toHaveLength(1);
    expect(analyzePoint([0, 2, 1], 20, scheme).accuracy).toBeNull();
  });
});
