import { create } from "zustand";
import type {
  CameraModel,
  Language,
  Project,
  SceneObject,
  Scheme,
  SimulationResult,
  Vec3,
} from "./models";
import { uid } from "./models";
import {
  persist,
  preserveUnreadable,
  readStored,
  readLibrary,
  storageStatus,
  writeLibrary,
} from "./camera/repository";
import { makeProject, validateProject } from "./project/data";
import { migrateProjectMarkerDefaults } from "./camera/markerDefault";
import { reconcileAnalysisView } from "./simulation/volume";
import { pasteObjects } from "./project/clipboard";
import { applyToProject, type ApplyOptions } from "./autoDeploy/apply";
import type { Candidate, Constraints } from "./autoDeploy/types";
const models = readLibrary();
const KEY = "camera-planner.project.v1";
let initialProject: Project;
try {
  const raw = readStored(KEY);
  initialProject = raw ? JSON.parse(raw) : makeProject(models[0]);
  validateProject(initialProject);
  const migrated = migrateProjectMarkerDefaults(initialProject);
  if (migrated !== initialProject) {
    initialProject = migrated;
    persist(KEY, initialProject);
  }
} catch {
  preserveUnreadable(KEY);
  storageStatus.error = "projectCorrupt";
  initialProject = makeProject(models[0]);
}
export interface AppState {
  project: Project;
  models: CameraModel[];
  lang: Language;
  mode: "design" | "analysis" | "report";
  selected: string[];
  livePose: Record<string, Partial<SceneObject>> | null;
  result: SimulationResult | null;
  progress: number | null;
  toast: string;
  libraryOpen: boolean;
  arrayOpen: boolean;
  autoDeployOpen: boolean;
  view: "perspective" | "orthographic" | "top" | "front" | "side";
  tool: "translate" | "rotate" | "scale";
  space: "world" | "local";
  snap: number;
  angleSnap: number;
  layer: "none" | "coverage" | "accuracy";
  clip: number;
  opacity: number;
  frustums: boolean;
  point: Vec3 | null;
  focusTick: number;
  past: Project[];
  future: Project[];
  clipboard: SceneObject[];
  clipboardGroups: { id: string; name: string }[];
  pasteCount: number;
  set: (patch: Partial<AppState>) => void;
  edit: (fn: (s: Scheme) => void) => void;
  updateObjects: (ids: string[], patch: Partial<SceneObject>) => void;
  changeModels: (models: CameraModel[]) => boolean;
  undo: () => void;
  redo: () => void;
  select: (id: string, multi?: boolean) => void;
  groupSelection: (name: string, existingId?: string) => void;
  ungroupSelection: () => void;
  renameGroup: (id: string, name: string) => void;
  updateCameraSnapshots: () => void;
  remove: () => void;
  duplicate: () => void;
  copy: () => void;
  paste: () => void;
  loadProject: (p: Project) => void;
  addScheme: () => void;
  switchScheme: (id: string) => void;
  applyDeployment: (
    source: Scheme,
    constraints: Constraints,
    candidate: Candidate,
    options: ApplyOptions,
  ) => void;
}
export const activeScheme = (state: Pick<AppState, "project">) =>
  state.project.schemes.find((s) => s.id === state.project.activeSchemeId)!;
export const useStore = create<AppState>((set, get) => ({
  project: initialProject,
  models,
  lang: readStored("camera-planner.language") === "en" ? "en" : "zh",
  mode: "design",
  selected: [],
  livePose: null,
  result: null,
  progress: null,
  toast: storageStatus.error,
  libraryOpen: false,
  arrayOpen: false,
  autoDeployOpen: false,
  view: "perspective",
  tool: "translate",
  space: "world",
  snap: 0.1,
  angleSnap: 5,
  layer: "none",
  clip: Math.min(
    1.5,
    initialProject.schemes.find((s) => s.id === initialProject.activeSchemeId)!
      .boundary[2],
  ),
  opacity: 0.72,
  frustums: false,
  point: null,
  focusTick: 0,
  past: [],
  future: [],
  clipboard: [],
  clipboardGroups: [],
  pasteCount: 0,
  set: (patch) => {
    if (patch.lang)
      try {
        localStorage.setItem("camera-planner.language", patch.lang);
      } catch {
        storageStatus.error = "storageError";
      }
    const next = { ...get(), ...patch };
    const view = reconcileAnalysisView(
      activeScheme(next).boundary,
      next.point,
      next.clip,
    );
    set({
      ...patch,
      point: view.point,
      clip: view.clip,
      ...(view.reset ? { toast: "pointReset" } : {}),
    });
  },
  edit: (fn) => {
    const previous = get().project,
      p = structuredClone(previous),
      s = activeScheme({ project: p });
    fn(s);
    if (s.groups) {
      const usedGroups = new Set(s.objects.map((o) => o.group));
      s.groups = s.groups.filter((g) => usedGroups.has(g.id));
    }
    const oldScheme = activeScheme({ project: previous });
    const view = reconcileAnalysisView(
      s.boundary,
      get().point,
      get().clip,
      oldScheme.boundary,
    );
    s.revision++;
    p.updated_at = new Date().toISOString();
    persist(KEY, p);
    set({
      project: p,
      point: view.point,
      clip: view.clip,
      past: [...get().past.slice(-39), previous],
      future: [],
      toast: storageStatus.error || (view.reset ? "pointReset" : get().toast),
    });
  },
  updateObjects: (ids, patch) =>
    get().edit((s) => {
      s.objects = s.objects.map((o) =>
        ids.includes(o.id) &&
        (!o.locked ||
          Object.keys(patch).every((k) => ["locked", "visible", "enabled"].includes(k)))
          ? { ...o, ...patch }
          : o,
      );
    }),
  changeModels: (models) => {
    if (!writeLibrary(models)) {
      set({ toast: "storageError" });
      return false;
    }
    set({ models });
    return true;
  },
  undo: () => {
    const state = get();
    if (!state.past.length) return;
    const p = state.past.at(-1)!;
    const view = reconcileAnalysisView(
      activeScheme({ project: p }).boundary,
      state.point,
      state.clip,
      activeScheme(state).boundary,
    );
    persist(KEY, p);
    set({
      project: p,
      point: view.point,
      clip: view.clip,
      ...(view.reset ? { toast: "pointReset" } : {}),
      past: state.past.slice(0, -1),
      future: [state.project, ...state.future],
      result: null,
      selected: [],
    });
  },
  redo: () => {
    const state = get();
    if (!state.future.length) return;
    const p = state.future[0];
    const view = reconcileAnalysisView(
      activeScheme({ project: p }).boundary,
      state.point,
      state.clip,
      activeScheme(state).boundary,
    );
    persist(KEY, p);
    set({
      project: p,
      point: view.point,
      clip: view.clip,
      ...(view.reset ? { toast: "pointReset" } : {}),
      past: [...state.past, state.project],
      future: state.future.slice(1),
      result: null,
      selected: [],
    });
  },
  select: (id, multi = false) =>
    set({
      selected: multi
        ? get().selected.includes(id)
          ? get().selected.filter((x) => x !== id)
          : [...get().selected, id]
        : [id],
    }),
  remove: () => {
    const ids = get().selected;
    if (!activeScheme(get()).objects.some((o) => ids.includes(o.id) && !o.locked)) return;
    get().edit((s) => {
      s.objects = s.objects.filter((o) => !ids.includes(o.id) || o.locked);
      for (const o of s.objects)
        if (o.mount && !s.objects.some((structure) => structure.id === o.mount))
          o.mount = undefined;
    });
    set({ selected: [] });
  },
  duplicate: () => {
    const saved = {
      clipboard: get().clipboard,
      clipboardGroups: get().clipboardGroups,
      pasteCount: get().pasteCount,
    };
    if (!get().selected.length) return;
    get().copy();
    get().paste();
    set(saved);
  },
  copy: () => {
    const source = activeScheme(get()).objects.filter((o) =>
      get().selected.includes(o.id),
    );
    if (!source.length) return;
    set({
      clipboard: structuredClone(source),
      clipboardGroups: structuredClone(activeScheme(get()).groups ?? []),
      pasteCount: 0,
      toast: "objectsCopied",
    });
  },
  paste: () => {
    if (!get().clipboard.length) return;
    const s = activeScheme(get());
    const count = get().pasteCount + 1;
    const distance =
      Math.min(0.5, Math.max(0.01, Math.min(s.boundary[0], s.boundary[1]) / 20)) * count;
    const copies = pasteObjects(get().clipboard, s.objects, [distance, distance, 0]);
    get().edit((s) => {
      s.objects.push(...copies);
      for (const group of get().clipboardGroups) {
        const index = get().clipboard.findIndex((o) => o.group === group.id);
        if (index < 0 || !copies[index].group) continue;
        const names = new Set(s.groups?.map((g) => g.name));
        let suffix = 2;
        while (names.has(`${group.name} · ${suffix}`)) suffix++;
        (s.groups ??= []).push({
          id: copies[index].group!,
          name: `${group.name} · ${suffix}`,
        });
      }
    });
    set({ selected: copies.map((o) => o.id), pasteCount: count, toast: "objectsPasted" });
  },
  groupSelection: (name, existingId) => {
    const ids = get().selected;
    const scheme = activeScheme(get());
    if (!name.trim() || !scheme.objects.some((o) => ids.includes(o.id) && !o.locked))
      return;
    if (existingId && !scheme.objects.some((o) => o.group === existingId)) return;
    const id = existingId ?? uid();
    get().edit((s) => {
      if (!s.groups?.some((g) => g.id === id))
        (s.groups ??= []).push({ id, name: name.trim() });
      for (const o of s.objects) if (ids.includes(o.id) && !o.locked) o.group = id;
    });
  },
  ungroupSelection: () => {
    const ids = get().selected;
    if (
      !activeScheme(get()).objects.some((o) => ids.includes(o.id) && o.group && !o.locked)
    )
      return;
    get().edit((s) => {
      for (const o of s.objects) if (ids.includes(o.id) && !o.locked) o.group = undefined;
    });
  },
  renameGroup: (id, name) => {
    if (!name.trim() || !activeScheme(get()).objects.some((o) => o.group === id)) return;
    get().edit((s) => {
      const group = s.groups?.find((g) => g.id === id);
      if (group) group.name = name.trim();
      else (s.groups ??= []).push({ id, name: name.trim() });
    });
  },
  updateCameraSnapshots: () => {
    const state = get();
    const updates = new Map(
      activeScheme(state)
        .objects.filter(
          (o) => state.selected.includes(o.id) && !o.locked && o.kind === "camera",
        )
        .flatMap((o) => {
          const model = state.models.find((m) => m.id === o.camera_model_id);
          return model &&
            JSON.stringify(model) !== JSON.stringify(o.camera_model_snapshot)
            ? [[o.id, model] as const]
            : [];
        }),
    );
    if (!updates.size) return;
    state.edit((s) => {
      for (const o of s.objects) {
        const model = updates.get(o.id);
        if (!model) continue;
        o.camera_model_snapshot = structuredClone(model);
        if (model.layout_supported === false) o.enabled = false;
      }
    });
    set({ toast: "cameraSnapshotsUpdated" });
  },
  loadProject: (p) => {
    validateProject(p);
    p = migrateProjectMarkerDefaults(p);
    persist(KEY, p);
    set({
      project: p,
      selected: [],
      result: null,
      past: [],
      future: [],
      point: null,
      clip: activeScheme({ project: p }).boundary[2],
    });
  },
  addScheme: () => {
    const p = structuredClone(get().project),
      s = structuredClone(activeScheme({ project: p }));
    s.id = uid();
    s.name = String.fromCharCode(65 + p.schemes.length);
    s.revision = 0;
    p.schemes.push(s);
    p.activeSchemeId = s.id;
    get().loadProject(p);
  },
  switchScheme: (id) => {
    const p = structuredClone(get().project);
    p.activeSchemeId = id;
    get().loadProject(p);
  },
  applyDeployment: (source, constraints, candidate, options) => {
    const previous = get().project;
    const { project, selected } = applyToProject(
      previous,
      source,
      constraints,
      candidate,
      options,
    );
    validateProject(project);
    persist(KEY, project);
    set({
      project,
      selected,
      past: [...get().past.slice(-39), previous],
      future: [],
      result: null,
      point: null,
      clip: constraints.boundary[2],
      autoDeployOpen: false,
      mode: "design",
      layer: "none",
      focusTick: get().focusTick + 1,
      toast: storageStatus.error || "adApplied",
    });
  },
}));
