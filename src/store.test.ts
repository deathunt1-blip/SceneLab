import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "./store";
import { createP3Model, newModel, storageStatus } from "./camera/repository";
import { makeCamera, makeObject, makeProject, validateProject } from "./project/data";
import { defaultConstraints } from "./autoDeploy/constraints";
import { generateCandidate, initialParameters } from "./autoDeploy/candidateGenerator";

let useStore: typeof import("./store").useStore;
let entries: Map<string, string>;
const state = (): AppState => useStore.getState();

beforeEach(() => {
  entries = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  });
  storageStatus.error = "";
  const project = makeProject(newModel());
  project.schemes[0].settings.voxel = 0.1;
  state().loadProject(project);
  state().set({
    toast: "",
    clipboard: [],
    clipboardGroups: [],
    pasteCount: 0,
    models: [],
  });
});

describe("scene clipboard and history", () => {
  it("applies auto deployment as one undoable transaction, then redoes editable cameras", () => {
    const original = structuredClone(state().project),
      source = original.schemes[0],
      m = newModel();
    const c = { ...defaultConstraints(source), countMode: "exact" as const, count: 16 };
    const candidate = generateCandidate(
      source,
      c,
      m,
      initialParameters(c, m, "ceiling", 16),
    );
    expect(candidate.feasible).toBe(true);
    state().applyDeployment(source, c, candidate, {
      mode: "new",
      structures: true,
      name: "Automatic",
    });
    expect(state().project.schemes.length).toBe(original.schemes.length + 1);
    expect(state().result).toBeNull();
    const applied = structuredClone(state().project);
    state().undo();
    expect(state().project).toEqual(original);
    state().redo();
    expect(state().project).toEqual(applied);
    expect(() =>
      validateProject(JSON.parse(entries.get("camera-planner.project.v1")!)),
    ).not.toThrow();
  });
  it("groups mixed assets, persists names, renames, copies and undoes the whole operation", () => {
    const originals = state().project.schemes[0].objects;
    const ids = [originals[0].id, originals.find((o) => o.kind === "box")!.id];
    state().set({ selected: ids });
    state().groupSelection("Stage A");
    let scheme = state().project.schemes[0];
    const groupId = scheme.objects[0].group!;
    expect(scheme.groups).toEqual([{ id: groupId, name: "Stage A" }]);
    expect(scheme.objects.filter((o) => o.group === groupId).map((o) => o.id)).toEqual(
      ids,
    );
    state().renameGroup(groupId, "Stage B");
    state().copy();
    state().paste();
    scheme = state().project.schemes[0];
    const copiedGroup = scheme.objects.at(-1)!.group!;
    expect(scheme.groups?.find((g) => g.id === copiedGroup)?.name).toBe("Stage B · 2");
    state().undo();
    expect(state().project.schemes[0].groups).toHaveLength(1);
    state().redo();
    const restored = JSON.parse(entries.get("camera-planner.project.v1")!);
    expect(() => validateProject(restored)).not.toThrow();
    expect(restored.schemes[0].groups).toHaveLength(2);
  });
  it("moves members between groups, skips locks, removes empty metadata and supports old groups", () => {
    const [a, b] = state().project.schemes[0].objects;
    state().set({ selected: [a.id] });
    state().groupSelection("One");
    const id = state().project.schemes[0].objects[0].group!;
    state().set({ selected: [b.id] });
    state().groupSelection("Two");
    state().groupSelection("One", id);
    expect(state().project.schemes[0].groups).toEqual([{ id, name: "One" }]);
    state().updateObjects([b.id], { locked: true });
    state().set({ selected: [a.id, b.id] });
    state().ungroupSelection();
    expect(state().project.schemes[0].objects[0].group).toBeUndefined();
    expect(state().project.schemes[0].objects[1].group).toBe(id);
    const legacy = makeProject(newModel());
    expect(legacy.schemes[0].objects[0].group).toBeTruthy();
    expect(legacy.schemes[0].groups).toBeUndefined();
    expect(() => validateProject(legacy)).not.toThrow();
    legacy.schemes[0].groups = [{ id: "broken", name: " " }];
    expect(() => validateProject(legacy)).toThrow("invalidFile");
  });
  it("batch updates each camera from its own model, skips locks and missing models, and restores snapshots on undo", () => {
    const p3 = createP3Model(),
      mono = newModel();
    const cameras = [p3, mono, p3, { ...mono, id: "missing" }].map((m, i) =>
      makeCamera(m, [i, -1, 1], [0, 1, 1]),
    );
    cameras[2].locked = true;
    const box = makeObject("box");
    state().edit((s) => {
      s.objects = [...cameras, box];
    });
    const before = structuredClone(state().project);
    state().set({
      models: [
        { ...p3, minimum_marker_pixels: 8 },
        { ...mono, minimum_marker_pixels: 2 },
      ],
      selected: [...cameras, box].map((o) => o.id),
    });
    state().updateCameraSnapshots();
    const objects = state().project.schemes[0].objects;
    expect(objects[0].camera_model_snapshot!.minimum_marker_pixels).toBe(8);
    expect(objects[1].camera_model_snapshot!.minimum_marker_pixels).toBe(2);
    expect(objects[2]).toEqual(cameras[2]);
    expect(objects[3]).toEqual(cameras[3]);
    expect(objects[4]).toEqual(box);
    expect(objects[0].position).toEqual(cameras[0].position);
    state().undo();
    expect(state().project).toEqual(before);
  });
  it("copies a tube and mounted stereo camera, preserves calibration and undoes dimension edits", () => {
    const tube = makeObject("tube");
    const camera = {
      ...makeCamera(createP3Model(), [0, 0, 1], [0, 2, 1]),
      mount: tube.id,
    };
    state().edit((s) => {
      s.objects.push(tube, camera);
    });
    state().set({ selected: [tube.id, camera.id] });
    state().copy();
    state().paste();
    const copies = state().project.schemes[0].objects.slice(-2);
    expect(copies[1].mount).toBe(copies[0].id);
    expect(copies[1].camera_model_snapshot!.stereo).toEqual({ baseline_mm: 144 });
    state().updateObjects([copies[0].id], { size: [9, 0.08, 0.06] });
    expect(state().project.schemes[0].objects.at(-2)!.size).toEqual([9, 0.08, 0.06]);
    state().undo();
    expect(state().project.schemes[0].objects.at(-2)!.size).toEqual([4, 0.05, 0.05]);
    state().redo();
    expect(state().project.schemes[0].objects.at(-2)!.size).toEqual([9, 0.08, 0.06]);
  });
  it("copies a snapshot, pastes fresh objects and supports undo/redo as one batch", () => {
    const originals = state().project.schemes[0].objects.slice(0, 2);
    const before = state().project.schemes[0].objects.length;
    state().set({ selected: originals.map((o) => o.id) });
    state().copy();
    expect(state().past).toHaveLength(0);
    state().updateObjects([originals[0].id], { name: "Changed after copy" });
    state().paste();
    const copies = state().project.schemes[0].objects.slice(before);
    expect(copies).toHaveLength(2);
    expect(copies[0].name).toBe(originals[0].name + " · 2");
    expect(copies[0].id).not.toBe(originals[0].id);
    expect(copies[0].camera_model_snapshot).toEqual(originals[0].camera_model_snapshot);
    expect(copies[0].group).toBe(copies[1].group);
    expect(copies[0].group).not.toBe(originals[0].group);
    expect(state().selected).toEqual(copies.map((o) => o.id));
    state().undo();
    expect(state().project.schemes[0].objects).toHaveLength(before);
    state().redo();
    expect(state().project.schemes[0].objects.slice(before)).toEqual(copies);
  });

  it("repeated pastes remain independent and keep unique names and copied payloads", () => {
    const o = state().project.schemes[0].objects[0];
    state().select(o.id);
    state().copy();
    state().paste();
    state().paste();
    const copies = state().project.schemes[0].objects.slice(-2);
    expect(copies.map((c) => c.name)).toEqual([o.name + " · 2", o.name + " · 3"]);
    expect(copies[1].position[0]).toBeGreaterThan(copies[0].position[0]);
    expect(state().clipboard[0]).toEqual(o);
    state().duplicate();
    expect(state().clipboard[0]).toEqual(o);
  });

  it("does not add history for empty copy, paste, duplicate or delete", () => {
    state().copy();
    state().paste();
    state().duplicate();
    state().remove();
    expect(state().past).toHaveLength(0);
  });
});
beforeAll(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  ({ useStore } = await import("./store"));
});
afterEach(() => vi.unstubAllGlobals());

describe("analysis point lifecycle", () => {
  it("moves the point inside on resize without moving cameras or changing sampling", () => {
    const objects = structuredClone(state().project.schemes[0].objects);
    state().set({ point: [5, 3, 1.2], clip: 1.5 });
    state().edit((s) => {
      s.boundary = [1.5, 1, 1];
    });
    expect(state().point).toEqual([0, 0, 0.5]);
    expect(state().clip).toBe(1);
    expect(state().toast).toBe("pointReset");
    expect(state().project.schemes[0].objects).toEqual(objects);
    expect(state().project.schemes[0].settings.voxel).toBe(0.1);
    expect(
      JSON.parse(entries.get("camera-planner.project.v1")!).schemes[0].boundary,
    ).toEqual([1.5, 1, 1]);
  });

  it("preserves a point that is still inside the resized scene", () => {
    state().set({ point: [0.2, -0.3, 0.4] });
    state().edit((s) => {
      s.boundary = [1.5, 1, 1];
    });
    expect(state().point).toEqual([0.2, -0.3, 0.4]);
    expect(state().toast).toBe("");
  });

  it("cannot restore an out-of-volume point through an old diagnostic or selection", () => {
    state().edit((s) => {
      s.boundary = [1.5, 1, 1];
    });
    state().set({ point: [5, 3, 1.2], clip: 1.2 });
    expect(state().point).toEqual([0, 0, 0.5]);
    expect(state().clip).toBe(1);
  });

  it("reconciles the point on undo and redo across volume changes", () => {
    state().edit((s) => {
      s.boundary = [1.5, 1, 1];
    });
    state().edit((s) => {
      s.boundary = [12, 10, 5];
    });
    state().set({ point: [5, 3, 1.2] });
    state().undo();
    expect(state().point).toEqual([0, 0, 0.5]);
    state().redo();
    state().undo();
    state().undo();
    state().set({ point: [5, 3, 1.2] });
    state().redo();
    expect(state().point).toEqual([0, 0, 0.5]);
  });

  it("clears the previous point when switching to a smaller scheme", () => {
    const project = structuredClone(state().project);
    const small = structuredClone(project.schemes[0]);
    small.id = "small";
    small.boundary = [1.5, 1, 1];
    project.schemes.push(small);
    state().loadProject(project);
    state().set({ point: [5, 3, 1.2] });
    state().switchScheme("small");
    expect(state().point).toBeNull();
    expect(state().clip).toBe(1);
    expect(state().project.schemes[1].settings.voxel).toBe(0.1);
  });
});
