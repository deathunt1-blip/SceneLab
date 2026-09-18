import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "./store";
import { newModel, storageStatus } from "./camera/repository";
import { makeProject } from "./project/data";

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
  state().set({ toast: "", clipboard: [], pasteCount: 0 });
});

describe("scene clipboard and history", () => {
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
