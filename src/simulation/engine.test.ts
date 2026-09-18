import { describe, expect, it } from "vitest";
import {
  accuracy,
  analyzePoint,
  intersectObstacle,
  jacobian,
  observe,
  pointInside,
  prepareCameras,
  project,
  rigidTrackability,
  simulate,
} from "./engine";
import {
  derive,
  importModels,
  newModel,
  parseCSV,
  validateModel,
} from "../camera/repository";
import {
  cameraArray,
  makeCamera,
  makeObject,
  makeProject,
  validateProject,
} from "../project/data";
import { basis, dot, lookAt } from "./math";
import type { CameraModel, Scheme, Vec3 } from "../models";
const model = (): CameraModel => ({
  ...derive({
    ...newModel(),
    resolution_width: 2000,
    resolution_height: 2000,
    hfov_deg: 90,
    vfov_deg: 90,
  }),
  minimum_marker_pixels: 1,
});
const scene = (): Scheme => ({
  id: "s",
  name: "A",
  boundary: [2, 2, 2],
  revision: 0,
  objects: [],
  settings: {
    voxel: 1,
    markerDiameter: 12,
    errorThreshold: 0.5,
    autoUpdate: false,
  },
});
describe("projection and observation", () => {
  it("maps the optical axis to principal point and world Z upwards in the image", () => {
    const s = scene();
    s.objects = [makeCamera(model(), [0, 0, 0], [0, 1, 0])];
    const c = prepareCameras(s)[0];
    expect(project([0, 5, 0], c)).toMatchObject({ u: 1000, v: 1000 });
    expect(project([0, 5, 1], c).v).toBeCloseTo(800);
  });
  it("uses look-at and roll as an orthonormal camera basis", () => {
    for (const rotation of [
      [0, 0, 0],
      [40, -30, 25],
      [90, 90, 60],
    ] as Vec3[]) {
      const b = basis(rotation);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          expect(dot(b[i], b[j])).toBeCloseTo(i === j ? 1 : 0, 12);
    }
    const b = basis(lookAt([2, -3, 4], [0, 0, 1]));
    expect(dot(b[2], [-2, 3, -3])).toBeCloseTo(Math.sqrt(22));
  });
  it("reports minimum marker size and simultaneous failure reasons", () => {
    const s = scene(),
      m = model();
    m.minimum_marker_pixels = 4;
    m.max_working_distance_m = 3;
    s.objects = [makeCamera(m, [0, 0, 0], [0, 1, 0])];
    const o = observe([0, 5, 0], 12, prepareCameras(s)[0], []);
    expect(o.reasons).toEqual(expect.arrayContaining(["small", "far"]));
    expect(o.pixels).toBeCloseTo(2.4);
    expect(o.minimumDiameter).toBeCloseTo(20);
  });
  it("detects behind camera, out of FOV and image clipping separately", () => {
    const s = scene();
    s.objects = [makeCamera(model(), [0, 0, 0], [0, 1, 0])];
    const c = prepareCameras(s)[0];
    expect(observe([0, -1, 0], 12, c, []).reasons).toContain("behind");
    expect(observe([8, 5, 0], 12, c, []).reasons).toContain("fov");
    expect(observe([4.998, 5, 0], 12, c, []).reasons).toContain("edge");
  });
  it("returns the nearest occluder and intersection rather than array order", () => {
    const s = scene();
    s.objects = [makeCamera(model(), [0, 0, 0], [0, 1, 0])];
    const far = {
        ...makeObject("box"),
        position: [0, 4, 0] as Vec3,
        size: [1, 1, 1] as Vec3,
      },
      near = { ...far, id: "near", position: [0, 2, 0] as Vec3 };
    const o = observe([0, 5, 0], 12, prepareCameras(s)[0], [far, near]);
    expect(o.occluderId).toBe("near");
    expect(o.intersection?.[1]).toBeCloseTo(1.5);
  });
});
describe("geometry and theoretical accuracy", () => {
  it("matches closed-form rectified stereo uncertainty", () => {
    const s = scene();
    s.objects = [
      makeCamera(model(), [-1, 0, 0], [-1, 1, 0]),
      makeCamera(model(), [1, 0, 0], [1, 1, 0]),
    ];
    const a = accuracy([0, 5, 0], prepareCameras(s))!;
    expect(a.x).toBeCloseTo((0.1 * 5) / Math.SQRT2, 8);
    expect(a.z).toBeCloseTo((0.1 * 5) / Math.SQRT2, 8);
    expect(a.y).toBeCloseTo((0.1 * 25) / Math.SQRT2, 8);
    expect(a.rms).toBeCloseTo(Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z));
  });
  it("scales uncertainty linearly with pixel noise", () => {
    const s = scene();
    s.objects = cameraArray(model(), "circle", 4, 4, 3, [0, 0, 1]);
    const a = accuracy([0, 0, 1], prepareCameras(s))!;
    s.objects.forEach(
      (c) =>
        (c.camera_model_snapshot!.default_pixel_localization_error_px *= 2),
    );
    expect(accuracy([0, 0, 1], prepareCameras(s))!.rms).toBeCloseTo(
      a.rms * 2,
      8,
    );
  });
  it("rejects coincident camera centers and single-camera geometry", () => {
    const s = scene(),
      c = makeCamera(model(), [0, 0, 0], [0, 1, 0]);
    s.objects = [c, { ...c, id: "c2" }];
    expect(accuracy([0, 5, 0], prepareCameras(s))).toBeNull();
    expect(accuracy([0, 5, 0], prepareCameras(s).slice(0, 1))).toBeNull();
  });
  it("analytic world Jacobian matches independent finite differences for rotated cameras", () => {
    const s = scene();
    s.objects = [makeCamera(model(), [2, -3, 4], [0, 0, 1])];
    s.objects[0].rotation[2] = 17;
    const c = prepareCameras(s)[0],
      p: Vec3 = [0.2, 0.1, 1],
      j = jacobian(p, c);
    for (let k = 0; k < 3; k++) {
      const a = [...p] as Vec3,
        b = [...p] as Vec3;
      a[k] += 1e-5;
      b[k] -= 1e-5;
      expect(j[0][k]).toBeCloseTo(
        (project(a, c).u - project(b, c).u) / 2e-5,
        5,
      );
      expect(j[1][k]).toBeCloseTo(
        (project(a, c).v - project(b, c).v) / 2e-5,
        5,
      );
    }
  });
  it("accounts for radial distortion consistently", () => {
    const s = scene(),
      m = model();
    m.distortion_model = "brown";
    m.distortion_parameters = [0.1, 0, 0, 0, 0];
    s.objects = [makeCamera(m, [0, 0, 0], [0, 1, 0])];
    const c = prepareCameras(s)[0];
    expect(project([1, 5, 0], c).u).toBeCloseTo(1200.8);
    expect(jacobian([1, 5, 0], c)[0][0]).toBeCloseTo(202.4, 4);
  });
  it("intersects rotated boxes and exact finite elliptical cylinders", () => {
    const o = {
      ...makeObject("box"),
      position: [0, 0, 0] as Vec3,
      size: [4, 0.1, 2] as Vec3,
      rotation: [90, 0, 0] as Vec3,
    };
    expect(intersectObstacle([-2, 0, 0], [2, 0, 0], o)).toBeCloseTo(0.4875);
    expect(intersectObstacle([-2, 3, 0], [2, 3, 0], o)).toBeNull();
    const c = {
      ...makeObject("cylinder"),
      position: [0, 0, 0] as Vec3,
      size: [2, 2, 2] as Vec3,
    };
    expect(intersectObstacle([-2, 0.9, 0], [2, 0.9, 0], c)).not.toBeNull();
    expect(intersectObstacle([-2, 1.1, 0], [2, 1.1, 0], c)).toBeNull();
    expect(intersectObstacle([0, 0, 3], [0, 0, -3], c)).toBeCloseTo(1 / 3);
    expect(pointInside([0.9, 0.9, 0], c)).toBe(false);
  });
});
describe("volume and rigid bodies", () => {
  it("excludes obstacle interiors and handles zero valid/solvable samples without NaNs", () => {
    const s = scene();
    s.objects = [
      {
        ...makeObject("box"),
        position: [-0.5, -0.5, 0.5],
        size: [0.9, 0.9, 0.9],
      },
    ];
    const r = simulate(s);
    expect(r.validVoxels).toBe(7);
    expect(r.excludedVoxels).toBe(1);
    expect(r.coverage).toEqual([0, 0, 0, 0, 0]);
    expect(r.meanError).toBeNull();
    expect(r.invalidAccuracy).toBe(7);
    s.objects = [
      { ...makeObject("box"), position: [0, 0, 1], size: [3, 3, 3] },
    ];
    expect(simulate(s).averageCount).toBe(0);
  });
  it("keeps hidden cameras in simulation but excludes disabled ones", () => {
    const s = scene();
    s.objects = cameraArray(model(), "circle", 4, 4, 3, [0, 0, 1]);
    s.objects[0].visible = false;
    expect(analyzePoint([0, 0, 1], 12, s).count).toBe(4);
    s.objects[0].enabled = false;
    expect(analyzePoint([0, 0, 1], 12, s).count).toBe(3);
  });
  it("detects collinear and non-collinear rigid-body marker layouts", () => {
    const s = scene();
    s.objects = cameraArray(model(), "circle", 4, 4, 3, [0, 0, 1]);
    const o = {
      ...makeObject("rigidBody"),
      position: [0, 0, 1] as Vec3,
      markers: [
        { position: [-0.1, 0, 0] as Vec3, diameter: 12 },
        { position: [0, 0, 0] as Vec3, diameter: 12 },
        { position: [0.1, 0, 0] as Vec3, diameter: 12 },
      ],
    };
    expect(rigidTrackability(o, s).status).toBe("weak");
    o.markers[1].position = [0, 0.1, 0];
    expect(rigidTrackability(o, s).status).toBe("trackable");
  });
});
describe("data boundaries", () => {
  it("persists parameter snapshots independently of mutable library models", () => {
    const m = model(),
      p = makeProject(m),
      c = p.schemes[0].objects[0];
    const before = c.camera_model_snapshot!.fx;
    m.fx = 1;
    expect(c.camera_model_snapshot!.fx).toBe(before);
    expect(() => validateProject(p)).not.toThrow();
  });
  it("validates malformed numeric values and FOV conflicts", () => {
    const m = model();
    m.fx *= 2;
    expect(validateModel(m)).toContain("intrinsicsConflict");
    m.fx = NaN;
    expect(validateModel(m)).toContain("positiveRequired");
  });
  it("supports escaped CSV quotes and embedded newlines without splitting records", () => {
    expect(parseCSV('name,notes\r\n"A","one, two\nthree ""quoted"""')).toEqual([
      ["name", "notes"],
      ["A", 'one, two\nthree "quoted"'],
    ]);
  });
  it("imports atomically and rejects invalid schema/data", () => {
    const m = model();
    expect(
      importModels(JSON.stringify({ schema_version: 1, models: [m] }), false)[0]
        .id,
    ).not.toBe(m.id);
    expect(() =>
      importModels(JSON.stringify({ schema_version: 2, models: [m] }), false),
    ).toThrow("schemaUnsupported");
    expect(() =>
      importModels(JSON.stringify([m, { ...m, fx: -1 }]), false),
    ).toThrow();
    const p = makeProject(m);
    p.schemes[0].objects[0].position = [NaN, 0, 0];
    expect(() => validateProject(p)).toThrow();
  });
});
