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
import { reconcileAnalysisView } from "./simulation/volume";
import { pasteObjects } from "./project/clipboard";
const models = readLibrary();
const KEY = "camera-planner.project.v1";
let initialProject: Project;
try {
  const raw = readStored(KEY);
  initialProject = raw ? JSON.parse(raw) : makeProject(models[0]);
  validateProject(initialProject);
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
  pasteCount: number;
  set: (patch: Partial<AppState>) => void;
  edit: (fn: (s: Scheme) => void) => void;
  updateObjects: (ids: string[], patch: Partial<SceneObject>) => void;
  changeModels: (models: CameraModel[]) => boolean;
  undo: () => void;
  redo: () => void;
  select: (id: string, multi?: boolean) => void;
  remove: () => void;
  duplicate: () => void;
  copy: () => void;
  paste: () => void;
  loadProject: (p: Project) => void;
  addScheme: () => void;
  switchScheme: (id: string) => void;
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
    });
    set({ selected: [] });
  },
  duplicate: () => {
    const saved = { clipboard: get().clipboard, pasteCount: get().pasteCount };
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
    set({ clipboard: structuredClone(source), pasteCount: 0, toast: "objectsCopied" });
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
    });
    set({ selected: copies.map((o) => o.id), pasteCount: count, toast: "objectsPasted" });
  },
  loadProject: (p) => {
    validateProject(p);
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
}));
