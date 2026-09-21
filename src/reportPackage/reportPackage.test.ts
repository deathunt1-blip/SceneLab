import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { createP3Model, newModel } from "../camera/repository";
import { makeCamera, makeObject, makeProject, validateProject } from "../project/data";
import type { SimulationResult } from "../models";
import { buildAnalysisExport } from "./buildAnalysisExport";
import { buildProjectExport } from "./buildProjectExport";
import { createPackage } from "./createPackage";
import { CORE_IMAGES, exportImages, pngData } from "./exportImages";
import { exportCameraViews } from "./exportCameraViews";
import { safeName } from "./validation";
import type { ReportImage } from "./types";

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZAAAAABJRU5ErkJggg==";
function fixture() {
  const model = {
    ...newModel(),
    id: "custom-model-only",
    manufacturer: "User Lab",
    model_name: "My custom lens",
    notes: "Custom calibration",
    minimum_marker_pixels: 3.25,
  };
  const project = makeProject(model),
    scheme = project.schemes[0];
  project.name = "Lab: / Test";
  scheme.name = "A?";
  scheme.revision = 42;
  const custom = makeCamera(model, [0, -4, 2], [0, 0, 1]);
  const stereo = makeCamera(createP3Model(), [3, 0, 2], [0, 0, 1], 2);
  custom.name = stereo.name = "CAM / same";
  const marker = makeObject("marker");
  marker.position = [0, 0, 1];
  scheme.objects = [
    custom,
    stereo,
    ...(
      ["box", "wall", "cylinder", "truss", "tube", "surface", "rigidBody"] as const
    ).map((kind, i) => ({
      ...makeObject(kind),
      position: [50 + i, 50, 50] as [number, number, number],
    })),
    marker,
  ];
  scheme.objects.find((o) => o.kind === "rigidBody")!.markers = [
    { position: [0, 0, 0], diameter: 12 },
    { position: [0.1, 0, 0], diameter: 12 },
    { position: [0, 0.1, 0], diameter: 12 },
  ];
  const result: SimulationResult = {
    schemeId: scheme.id,
    revision: 42,
    timestamp: "2026-09-22T10:30:00.000Z",
    elapsed: 2840,
    boundary: [...scheme.boundary],
    voxelSize: [0.4, 0.5, 0.25],
    positions: new Float32Array([0, 0, 1]),
    counts: new Uint16Array([4]),
    errors: new Float32Array([0.21]),
    validVoxels: 42871,
    excludedVoxels: 3129,
    coverage: [99.8, 98.1, 94.7, 88.2, 74.6],
    averageCount: 4.6,
    meanError: 0.21,
    p90: 0.34,
    p95: 0.42,
    under03: 82.4,
    under05: 96.7,
    invalidAccuracy: 214,
    issues: [{ type: "coverage", count: 214, position: [4.5, 2.5, 0.8] }],
  };
  const images: ReportImage[] = CORE_IMAGES.map(([, view, layer]) => ({
    view,
    layer,
    data: png,
    revision: 42,
    schemeId: scheme.id,
    clip: 5,
    analysisTimestamp: result.timestamp,
  }));
  return {
    project,
    scheme,
    result,
    images,
    options: { cameraViews: false, diagnostics: false },
  };
}
const read = async (zip: JSZip, path: string) =>
  JSON.parse(await zip.file(path)!.async("string"));

describe("report package", () => {
  it("exports a self-contained default ZIP with six role-addressed PNGs and no optional/private payloads", async () => {
    const f = fixture(),
      other = structuredClone(f.scheme);
    other.id = "other-scheme";
    other.name = "Do not export";
    f.project.schemes.push(other);
    const before = structuredClone(f.project),
      exporter = vi.fn();
    const output = await createPackage(f, exporter),
      zip = await JSZip.loadAsync(output.bytes, { checkCRC32: true });
    const manifest = await read(zip, "manifest.json");
    expect(manifest).toMatchObject({
      format: "scenelab-report",
      format_version: "1.0",
      producer: { name: "SceneLab" },
      project: { name: "Lab: / Test", scheme_name: "A?", scheme_revision: 42 },
      files: { project: "project.json", analysis: "analysis.json" },
      camera_views: { included: false },
      diagnostics: { included: false },
    });
    expect(manifest.producer.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(
      manifest.images.map((i: { role: string; view: string }) => [i.role, i.view]),
    ).toEqual(CORE_IMAGES.map(([role, view]) => [role, view]));
    for (const i of manifest.images) expect(zip.file(i.file)).not.toBeNull();
    expect(Object.keys(zip.files).filter((p) => p.endsWith(".png"))).toHaveLength(6);
    expect(
      Object.keys(zip.files).some(
        (p) => p.startsWith("camera_views/") || p.endsWith(".pdf"),
      ),
    ).toBe(false);
    expect(exporter).not.toHaveBeenCalled();
    const analysis = await read(zip, "analysis.json"),
      project = await read(zip, "project.json");
    for (const key of ["positions", "counts", "errors", "issues", "diagnostics"])
      expect(analysis).not.toHaveProperty(key);
    expect(JSON.stringify(project)).not.toContain("Do not export");
    expect(f.project).toEqual(before);
    validateProject(f.project);
    expect(output.filename).toBe("Lab_ _ Test_A__R42.scenelab-report");
  });
  it("maps exact existing statistics and units without recomputing or rounding", () => {
    const { scheme, result } = fixture(),
      data = buildAnalysisExport(scheme, result);
    expect(data).toMatchObject({
      scheme_revision: 42,
      generated_at: "2026-09-22T10:30:00.000Z",
      settings: { actual_voxel_size_m: [0.4, 0.5, 0.25] },
      sampling: {
        valid_voxels: 42871,
        excluded_voxels: 3129,
        invalid_accuracy_voxels: 214,
      },
      coverage_percent: { ge1: 99.8, ge2: 98.1, ge3: 94.7, ge4: 88.2, ge5: 74.6 },
      average_view_count: 4.6,
      accuracy_mm: { mean: 0.21, p90: 0.34, p95: 0.42 },
      threshold_percent: { under_0_3mm: 82.4, under_0_5mm: 96.7 },
      elapsed_ms: 2840,
    });
    result.meanError = result.p90 = result.p95 = null;
    expect(buildAnalysisExport(scheme, result).accuracy_mm).toEqual({
      mean: null,
      p90: null,
      p95: null,
    });
  });
  it("keeps all asset kinds and complete independent custom/other-model/stereo snapshots", () => {
    const { project, scheme } = fixture(),
      data = buildProjectExport(project, scheme);
    expect(data.cameras[0].camera_model).toEqual(scheme.objects[0].camera_model_snapshot);
    expect(data.cameras[1].camera_model).toEqual(scheme.objects[1].camera_model_snapshot);
    expect(data.cameras[1].camera_model.stereo).toEqual({ baseline_mm: 144 });
    expect(data.cameras[0].pose.position_m).toEqual([0, -4, 2]);
    expect(data.scheme.objects).toEqual(scheme.objects);
    expect(data.scheme.objects.map((o) => o.kind)).toContain("tube");
    expect(JSON.stringify(data)).not.toMatch(
      /canonical_product_id|official_camera_id|product_id_mapping/,
    );
    data.cameras[0].camera_model.notes = "edited clone";
    expect(scheme.objects[0].camera_model_snapshot!.notes).toBe("Custom calibration");
  });
  it("rejects missing analysis, a different scheme and stale revisions before creating assets", async () => {
    const f = fixture(),
      exporter = vi.fn();
    await expect(createPackage({ ...f, result: null }, exporter)).rejects.toThrow(
      "packageNoAnalysis",
    );
    await expect(
      createPackage({ ...f, result: { ...f.result, schemeId: "other" } }, exporter),
    ).rejects.toThrow("packageStale");
    f.scheme.revision++;
    await expect(createPackage(f, exporter)).rejects.toThrow("packageStale");
    expect(exporter).not.toHaveBeenCalled();
  });
  it("rejects old, missing, manually substituted or invalid core images", async () => {
    const f = fixture();
    for (const images of [
      f.images.slice(1),
      f.images.map((i) => ({ ...i, revision: 41 })),
      f.images.map((i) => ({ ...i, analysisTimestamp: "older" })),
      f.images.map((i) => ({ ...i, manual: true })),
    ])
      await expect(createPackage({ ...f, images })).rejects.toThrow(
        "packageImagesMissing",
      );
    await expect(
      createPackage({ ...f, images: f.images.map((i) => ({ ...i, data: "data:," })) }),
    ).rejects.toThrow("packageInvalidImage");
  });
  it("includes only current manual images and assigns stable manual roles", () => {
    const f = fixture();
    f.images.push(
      { ...f.images[0], manual: true },
      { ...f.images[0], manual: true, revision: 41 },
    );
    const result = exportImages(f.images, f.scheme, f.result);
    expect(result.entries).toHaveLength(7);
    expect(result.entries[6]).toMatchObject({
      role: "manual",
      view: "perspective",
      file: "images/manual_01.png",
    });
  });
  it("exports optional mono and both stereo diagrams with sensor pixel metadata and unique safe names", async () => {
    const f = fixture();
    f.options.cameraViews = true;
    const renderer = vi.fn(async () => ({
      data: pngData(png).bytes,
      size: [1, 1] as [number, number],
    }));
    const output = await createPackage(f, (s, signal, p) =>
      exportCameraViews(s, signal, p, renderer),
    );
    const zip = await JSZip.loadAsync(output.bytes),
      index = await read(zip, "camera_views/index.json");
    expect(index.views.map((v: { eye: string | null }) => v.eye)).toEqual([
      null,
      "left",
      "right",
    ]);
    expect(renderer).toHaveBeenCalledTimes(3);
    expect(new Set(index.views.map((v: { image: string }) => v.image)).size).toBe(3);
    expect(index.views[1].resolution).toEqual([2048, 1536]);
    expect(index.views[1].image_size_px).toEqual([1, 1]);
    for (const view of index.views) {
      expect(view.image).not.toMatch(/[<>:"/\\|?*]/);
      expect(zip.file(`camera_views/${view.image}`)).not.toBeNull();
      expect(view.markers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "M01",
            diameter_mm: 12,
            u_px: expect.any(Number),
            v_px: expect.any(Number),
            width_px: expect.any(Number),
            height_px: expect.any(Number),
            valid: expect.any(Boolean),
            reasons: expect.any(Array),
          }),
        ]),
      );
    }
    expect((await read(zip, "manifest.json")).camera_views).toEqual({
      included: true,
      index: "camera_views/index.json",
      count: 3,
    });
  });
  it("includes issue points only when the diagnostics option is explicitly enabled", async () => {
    const f = fixture();
    f.options.diagnostics = true;
    const zip = await JSZip.loadAsync((await createPackage(f)).bytes);
    expect((await read(zip, "manifest.json")).diagnostics).toEqual({ included: true });
    expect((await read(zip, "analysis.json")).diagnostics).toEqual({
      included: true,
      issues: [{ type: "coverage", count: 214, position_m: [4.5, 2.5, 0.8] }],
    });
  });
  it("rechecks freshness after asynchronous image generation and supports cancellation", async () => {
    const f = fixture();
    f.options.cameraViews = true;
    let changed = false;
    await expect(
      createPackage(
        {
          ...f,
          assertUnchanged: () => {
            if (changed) throw new Error("changed");
          },
        },
        async () => {
          changed = true;
          return { views: [], assets: [] };
        },
      ),
    ).rejects.toThrow("changed");
    const controller = new AbortController();
    controller.abort();
    await expect(createPackage({ ...f, signal: controller.signal })).rejects.toThrow();
  });
  it("sanitizes Windows reserved filenames and traversal characters", () => {
    expect(safeName("CON.txt")).toBe("_CON.txt");
    expect(safeName('..\\NUL: /?*<>"|. ')).not.toMatch(/[\\/:?*<>"|]|[. ]$/);
    expect(safeName("...")).toBe("SceneLab");
    expect(safeName("项目甲")).toBe("项目甲");
  });
});
