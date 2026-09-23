import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCatalogModels,
  importModels,
  modelsCSV,
  newModel,
  readLibrary,
  storageStatus,
  validateModel,
  writeLibrary,
} from "./repository";
import source from "./data/chingmu-v1.json";
import { makeCamera, makeProject } from "../project/data";
import { prepareCameras } from "../simulation/engine";
import { catalogVersion } from "./catalog";
import { p3CatalogVersion } from "./p3";
const key = "camera-planner.camera-library.v1";
let entries: Map<string, string>;
let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };
beforeEach(() => {
  entries = new Map();
  storage = {
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => entries.set(key, value)),
  };
  vi.stubGlobal("localStorage", storage);
  storageStatus.error = "";
});
afterEach(() => vi.unstubAllGlobals());

describe("Chingmu catalog mapping", () => {
  it("imports all 18 models and 29 profiles, preserving every source record and null", () => {
    const models = createCatalogModels();
    expect(models).toHaveLength(29);
    expect(new Set(models.map((m) => m.catalog!.camera.camera_model_id)).size).toBe(18);
    expect(new Set(models.map((m) => m.id)).size).toBe(29);
    for (const m of models) {
      expect(validateModel(m)).toEqual([]);
      expect(m.catalog!.optical).toEqual(
        source.tables.OpticalProfile.find(
          (p) => p.profile_id === m.catalog!.optical.profile_id,
        ),
      );
      expect(m.catalog!.camera).toEqual(
        source.tables.CameraModel.find(
          (c) => c.camera_model_id === m.catalog!.camera.camera_model_id,
        ),
      );
      expect(m.catalog!.optical.min_range_m).toBeNull();
    }
  });
  it("keeps lens variants and passive ranges distinct from active ranges", () => {
    const models = createCatalogModels();
    const std = models.find((m) => m.catalog!.optical.profile_id === "K18-STD")!;
    const narrow = models.find((m) => m.catalog!.optical.profile_id === "K18-N")!;
    expect(std).toMatchObject({
      focal_length_mm: 8,
      hfov_deg: 72,
      max_working_distance_m: 47,
      range_mode: "passive",
    });
    expect(narrow).toMatchObject({
      focal_length_mm: 12,
      hfov_deg: 49,
      max_working_distance_m: 30,
    });
    expect(std.catalog!.optical.active_range_m).toBe(94);
    expect(std.default_pixel_localization_error_px).toBe(0.1);
    expect(std.catalog!.camera.accuracy_3d_mm).not.toBe(
      std.default_pixel_localization_error_px,
    );
  });
  it("uses cropped resolution, FOV and frame rates for every R3 mode", () => {
    const r3 = createCatalogModels().filter((m) => m.catalog!.camera.model === "R3");
    expect(r3).toHaveLength(5);
    for (const m of r3) {
      const frame = source.tables.R3FrameMode.find(
        (f) => f.frame_mode_id === m.catalog!.frame!.frame_mode_id,
      )!;
      expect([m.resolution_width, m.resolution_height, m.hfov_deg, m.vfov_deg]).toEqual([
        frame.resolution_width_px,
        frame.resolution_height_px,
        frame.hfov_deg,
        frame.vfov_deg,
      ]);
      expect(m.catalog!.frame).toEqual(frame);
      expect(m.enabled_for_layout_default).toBe(false);
    }
    expect(r3.find((m) => m.resolution_width === 640)!.catalog!.frame!.blob_fps).toBe(
      663,
    );
    expect(r3.find((m) => m.resolution_width === 2048)!.catalog!.frame!.blob_fps).toBe(
      216,
    );
  });
  it("keeps R1 out of the solver even when enabled and R3 opt-in", () => {
    const models = createCatalogModels();
    const reference = models.find((m) => m.catalog!.camera.model === "R1")!;
    const hybrid = models.find((m) => m.catalog!.optical.profile_id === "R3-FULL")!;
    expect(reference.max_working_distance_m).toBeNull();
    const s = makeProject(newModel()).schemes[0];
    s.objects = [
      makeCamera(reference, [0, 0, 0], [0, 1, 0]),
      makeCamera(hybrid, [1, 0, 0], [0, 1, 0]),
    ];
    expect(s.objects.every((c) => !c.enabled)).toBe(true);
    expect(prepareCameras(s)).toEqual([]);
    s.objects.forEach((c) => (c.enabled = true));
    expect(prepareCameras(s).map((c) => c.model.id)).toEqual([hybrid.id]);
  });
  it("uses underwater effective FOV without manufacturing passive/active data", () => {
    for (const m of createCatalogModels().filter(
      (m) => m.catalog!.optical.environment === "Underwater",
    )) {
      expect(m.hfov_deg).toBe(m.catalog!.optical.underwater_hfov_deg);
      expect(m.max_working_distance_m).toBe(m.catalog!.optical.general_tracking_range_m);
      expect(m.catalog!.optical.passive_range_m).toBeNull();
      expect(m.catalog!.optical.active_range_m).toBeNull();
    }
  });
  it.each(["json", "csv"])(
    "round-trips all source metadata and reference exclusions through %s",
    (format) => {
      const models = [...createCatalogModels(), newModel()];
      const text =
        format === "csv"
          ? modelsCSV(models)
          : JSON.stringify({ schema_version: 1, models });
      const imported = importModels(text, format === "csv");
      expect(imported).toHaveLength(30);
      imported.forEach((m, i) => {
        expect(validateModel(m)).toEqual([]);
        expect(m.catalog).toEqual(models[i].catalog);
        expect(m.max_working_distance_m).toBe(models[i].max_working_distance_m);
        expect(m.enabled_for_layout_default).toBe(models[i].enabled_for_layout_default);
      });
    },
  );
});

describe("camera library persistence", () => {
  it("uses 1.5 px for every new/default camera and migrates old 4 px thresholds only once", () => {
    expect(newModel().minimum_marker_pixels).toBe(1.5);
    expect(readLibrary().every((m) => m.minimum_marker_pixels === 1.5)).toBe(true);
    const models = readLibrary().map((m, i) => {
      const { marker_threshold_version, ...legacy } = m;
      return { ...legacy, minimum_marker_pixels: i === 1 ? 2.25 : 4 };
    });
    const raw = JSON.parse(entries.get(key)!);
    entries.set(key, JSON.stringify({ ...raw, models }));
    const upgraded = readLibrary();
    expect(
      upgraded.every((m, i) => m.minimum_marker_pixels === (i === 1 ? 2.25 : 1.5)),
    ).toBe(true);
    expect(upgraded.every((m) => m.marker_threshold_version === 1)).toBe(true);
    upgraded[0].minimum_marker_pixels = 4;
    writeLibrary(upgraded);
    expect(readLibrary()).toEqual(upgraded);
    for (const csv of [false, true]) {
      const imported = importModels(
        csv ? modelsCSV(upgraded) : JSON.stringify({ models: upgraded }),
        csv,
      );
      expect(imported.map((m) => m.minimum_marker_pixels)).toEqual(
        upgraded.map((m) => m.minimum_marker_pixels),
      );
      expect(imported.every((m) => m.marker_threshold_version === 1)).toBe(true);
    }
  });
  it("adds P3 to an existing v1.0 library once, without restoring deleted or overwriting edited models", () => {
    const previous = createCatalogModels().slice(1);
    previous[0].notes = "用户修改保留";
    entries.set(
      key,
      JSON.stringify({
        schema_version: 1,
        models: previous,
        applied_catalogs: [catalogVersion],
      }),
    );
    const upgraded = readLibrary();
    expect(upgraded).toHaveLength(previous.length + 1);
    expect(upgraded.slice(0, previous.length)).toEqual(previous);
    expect(upgraded.at(-1)!.catalog!.dataset).toBe(p3CatalogVersion);
    expect(readLibrary()).toEqual(upgraded);
    expect(writeLibrary(previous)).toBe(true);
    expect(readLibrary()).toEqual(previous);
  });
  it("migrates an existing library once without changing custom models", () => {
    const custom = { ...newModel(), model_name: "Existing user model" };
    entries.set(key, JSON.stringify({ schema_version: 1, models: [custom] }));
    const first = readLibrary();
    expect(first).toHaveLength(31);
    expect(first[0]).toEqual(custom);
    expect(readLibrary()).toEqual(first);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });
  it("persists additions, edits and deletions across reload without resurrecting catalog rows", () => {
    const first = readLibrary();
    const custom = { ...newModel(), model_name: "Saved new camera" };
    const edited = { ...first[1], model_name: "Edited catalog model", notes: "用户修改" };
    const next = [first[0], edited, ...first.slice(3), custom];
    expect(writeLibrary(next)).toBe(true);
    expect(readLibrary()).toEqual(next);
    expect(readLibrary().some((m) => m.id === first[2].id)).toBe(false);
  });
  it("reports failed writes and preserves the previously saved library", () => {
    const models = readLibrary();
    const previous = entries.get(key);
    storage.setItem.mockImplementationOnce(() => {
      throw new Error("Quota exceeded");
    });
    expect(writeLibrary([...models, newModel()])).toBe(false);
    expect(storageStatus.error).toBe("storageError");
    expect(entries.get(key)).toBe(previous);
    expect(writeLibrary(models)).toBe(true);
    expect(storageStatus.error).toBe("");
  });
  it("does not mark a failed catalog migration complete and retries later", () => {
    const custom = newModel();
    entries.set(key, JSON.stringify({ schema_version: 1, models: [custom] }));
    storage.setItem.mockImplementationOnce(() => {
      throw new Error("Quota exceeded");
    });
    expect(readLibrary()).toEqual([custom]);
    expect(readLibrary()).toHaveLength(31);
  });
  it("preserves corrupted libraries instead of overwriting them during migration", () => {
    entries.set(key, "broken-json");
    expect(readLibrary()).toEqual([]);
    expect(entries.get(key)).toBe("broken-json");
    expect(storageStatus.error).toBe("libraryCorrupt");
  });
  it("does not update the app state or claim success when storage rejects a save", async () => {
    const { useStore } = await import("../store");
    const before = useStore.getState().models;
    storage.setItem.mockImplementationOnce(() => {
      throw new Error("Quota exceeded");
    });
    expect(useStore.getState().changeModels([...before, newModel()])).toBe(false);
    expect(useStore.getState().models).toBe(before);
    expect(useStore.getState().toast).toBe("storageError");
  });
});
