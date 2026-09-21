import { useEffect, useRef, useState } from "react";
import {
  Aperture,
  ArrowDownToLine,
  ArrowUpFromLine,
  Axis3D,
  Box,
  Camera,
  CameraIcon,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Copy,
  ClipboardPaste,
  Cuboid,
  Eye,
  EyeOff,
  FilePlus2,
  FileText,
  Focus,
  Frame,
  Globe2,
  Grid2X2,
  Layers,
  LoaderCircle,
  LockKeyhole,
  Maximize,
  MousePointer2,
  Move3D,
  PanelLeftClose,
  Play,
  Plus,
  Redo2,
  Rotate3D,
  Ruler,
  Save,
  Scan,
  Settings2,
  Square,
  Undo2,
  X,
} from "lucide-react";
import { activeScheme, useStore } from "./store";
import { useT } from "./i18n";
import { download } from "./camera/repository";
import { makeCamera, makeObject, makeProject } from "./project/data";
import { add, rotate } from "./simulation/math";
import { useSimulation } from "./simulation/useSimulation";
import { Viewport, captureViewport } from "./renderer/Viewport";
import { MAX_HEATMAP_CELLS } from "./renderer/heatmap";
import { viewCount } from "./simulation/engine";
import { Inspector } from "./components/Inspector";
import { AnalysisPanel, Issues } from "./components/AnalysisPanel";
import { CameraLibrary } from "./components/CameraLibrary";
import { ArrayDialog } from "./components/ArrayDialog";
import { Report, type ReportImage } from "./components/Report";
import { fmt } from "./components/Common";
import type { ObjectKind, Vec3 } from "./models";
import "./styles.css";
const icons = {
  camera: Camera,
  box: Box,
  cylinder: Cuboid,
  wall: Square,
  marker: CircleDot,
  rigidBody: Layers,
  truss: Frame,
  tube: Cuboid,
  surface: Square,
};
function SceneTree() {
  const st = useStore(),
    t = useT(),
    s = activeScheme(st);
  const [closed, setClosed] = useState<string[]>([]);
  const groups = [
    ["structures", ["truss", "tube", "surface"]],
    ["obstacles", ["box", "cylinder", "wall"]],
    ["cameras", ["camera"]],
    ["markers", ["marker"]],
    ["rigidBodies", ["rigidBody"]],
  ] as const;
  const addObject = (kind: ObjectKind) => {
    let obj = makeObject(kind, s.objects.filter((o) => o.kind === kind).length + 1);
    if (kind === "camera") {
      if (!st.models.length) {
        st.set({ libraryOpen: true, toast: "noModels" });
        return;
      }
      obj = makeCamera(
        st.models[0],
        [0, -s.boundary[1] / 2, 3],
        [0, 0, 1.2],
        s.objects.filter((o) => o.kind === "camera").length + 1,
      );
    }
    if (kind === "truss" || kind === "tube")
      obj.position = [0, 0, Math.min(3.6, s.boundary[2])];
    if (kind === "surface") obj.position = [0, 0, s.boundary[2]];
    if (kind === "marker") {
      obj.position = [0, 0, s.boundary[2] / 2];
      obj.diameter = s.settings.markerDiameter;
    }
    if (kind === "rigidBody") {
      obj.position = [0, 0, s.boundary[2] / 2];
      obj.markers = [
        { position: [-0.15, -0.1, 0], diameter: s.settings.markerDiameter },
        { position: [0.16, -0.08, 0], diameter: s.settings.markerDiameter },
        { position: [0, 0.18, 0], diameter: s.settings.markerDiameter },
        { position: [0, 0, 0.2], diameter: s.settings.markerDiameter },
      ];
    }
    st.edit((s) => {
      s.objects.push(obj);
    });
    st.set({ selected: [obj.id], mode: "design" });
  };
  return (
    <aside className="left-panel">
      <div className="panel-heading">
        <h3>
          <Layers size={16} />
          {t("sceneTree")}
        </h3>
        <span className="count-pill">{s.objects.length}</span>
      </div>
      <div className="scene-tree">
        <button
          className={
            "tree-boundary " +
            (!st.selected.length && st.mode === "design" ? "active" : "")
          }
          onClick={() => st.set({ selected: [], mode: "design" })}
        >
          <Scan size={16} />
          <span>{t("boundary")}</span>
          <small>{s.boundary.join("×")}</small>
        </button>
        {groups.map(([key, kinds]) => {
          const objects = s.objects.filter((o) =>
            (kinds as readonly string[]).includes(o.kind),
          );
          return (
            <div className="tree-group" key={key}>
              <button
                className="tree-group-title"
                onClick={() =>
                  setClosed(
                    closed.includes(key)
                      ? closed.filter((k) => k !== key)
                      : [...closed, key],
                  )
                }
              >
                {closed.includes(key) ? (
                  <ChevronRight size={13} />
                ) : (
                  <ChevronDown size={13} />
                )}
                <span>{t(key)}</span>
                <small>{objects.length.toString().padStart(2, "0")}</small>
              </button>
              {!closed.includes(key) &&
                objects.map((o) => {
                  const Icon = icons[o.kind];
                  return (
                    <div
                      className={
                        "tree-row " +
                        (st.selected.includes(o.id) ? "active " : "") +
                        (!o.enabled ? "disabled" : "")
                      }
                      key={o.id}
                    >
                      <button
                        className="tree-object"
                        aria-pressed={st.selected.includes(o.id)}
                        onClick={(e) =>
                          st.select(o.id, e.shiftKey || e.ctrlKey || e.metaKey)
                        }
                        onDoubleClick={() => st.set({ focusTick: st.focusTick + 1 })}
                      >
                        <Icon size={14} />
                        <span>{o.name}</span>
                        {o.locked && <LockKeyhole size={11} />}
                      </button>
                      <button
                        className="tree-visibility"
                        aria-label={`${t("visible")} ${o.name}`}
                        onClick={() => st.updateObjects([o.id], { visible: !o.visible })}
                      >
                        {o.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
      <div className="object-library">
        <div className="section-label">
          <span>{t("objectLibrary")}</span>
          <Plus size={13} />
        </div>
        <div className="add-grid">
          {(
            [
              "camera",
              "box",
              "cylinder",
              "wall",
              "truss",
              "tube",
              "surface",
              "marker",
              "rigidBody",
            ] as ObjectKind[]
          ).map((kind) => {
            const Icon = icons[kind];
            return (
              <button
                key={kind}
                title={kind === "rigidBody" ? t("rigidBodyPreset") : t(kind)}
                onClick={() => addObject(kind)}
              >
                <Icon size={18} />
                <span>{t(kind)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <Issues />
      <div className="left-footer">
        <span className="status-dot" />
        {t("local")}
        <span>v1.1</span>
      </div>
    </aside>
  );
}
export default function App() {
  const st = useStore(),
    t = useT(),
    s = activeScheme(st),
    { run, cancel } = useSimulation();
  const input = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ReportImage[]>([]),
    [capturing, setCapturing] = useState(false),
    [projectMenu, setProjectMenu] = useState(false),
    [inspectorOpen, setInspectorOpen] = useState(false);
  const r = st.result,
    current = r?.schemeId === s.id && r.revision === s.revision;
  const cameras = s.objects.filter((o) => o.kind === "camera" && o.enabled).length;
  const exportProject = () => {
    download(
      st.project.name + ".cameraplanner.json",
      JSON.stringify(st.project, null, 2),
    );
    st.set({ toast: "projectSaved" });
  };
  const shot = (manual = false): ReportImage => {
    const state = useStore.getState();
    return {
      manual,
      data: captureViewport(),
      view: state.view,
      layer: state.layer,
      clip: state.clip,
      revision: activeScheme(state).revision,
      schemeId: state.project.activeSchemeId,
    };
  };
  const openReport = async () => {
    if (!current) {
      st.set({ mode: "report" });
      return;
    }
    setCapturing(true);
    const previous = {
      view: st.view,
      layer: st.layer,
      mode: st.mode,
      selected: st.selected,
      clip: st.clip,
      point: st.point,
    };
    const frames = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    const next: ReportImage[] = [];
    for (const [view, layer] of [
      ["perspective", "none"],
      ["top", "coverage"],
      ["perspective", "coverage"],
      ["perspective", "accuracy"],
      ["front", "accuracy"],
      ["side", "accuracy"],
    ] as const) {
      useStore.getState().set({
        mode: "analysis",
        selected: [],
        point: null,
        view,
        layer,
        clip: layer === "none" ? s.boundary[2] : Math.min(st.clip, s.boundary[2]),
      });
      await frames();
      next.push(shot());
    }
    setImages([
      ...next,
      ...images.filter(
        (i) => i.manual && i.schemeId === s.id && i.revision === s.revision,
      ),
    ]);
    useStore.getState().set({ ...previous, mode: "report" });
    setCapturing(false);
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable],[role=dialog]",
        )
      )
        return;
      if (document.querySelector('[role="dialog"]')) return;
      const state = useStore.getState();
      if (e.key === "Escape") {
        state.set({ libraryOpen: false, arrayOpen: false, selected: [] });
        return;
      }
      if (state.libraryOpen || state.arrayOpen || state.mode === "report") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && ["z", "y", "d", "s", "c", "v"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (e.repeat) return;
        if (e.key.toLowerCase() === "c") state.copy();
        if (e.key.toLowerCase() === "v") state.paste();
        if (e.key.toLowerCase() === "z") e.shiftKey ? state.redo() : state.undo();
        if (e.key.toLowerCase() === "y") state.redo();
        if (e.key.toLowerCase() === "d") state.duplicate();
        if (e.key.toLowerCase() === "s")
          download(
            state.project.name + ".cameraplanner.json",
            JSON.stringify(state.project, null, 2),
          );
        return;
      }
      if (mod || e.altKey) return;
      if (e.key === "Delete") state.remove();
      if (e.key.toLowerCase() === "w") state.set({ tool: "translate" });
      if (e.key.toLowerCase() === "e") state.set({ tool: "rotate" });
      if (e.key.toLowerCase() === "r") state.set({ tool: "scale" });
      if (e.key.toLowerCase() === "f") state.set({ focusTick: state.focusTick + 1 });
      if (e.code === "Space") {
        e.preventDefault();
        state.set({ space: state.space === "world" ? "local" : "world" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!st.toast) return;
    const timeout = setTimeout(() => useStore.getState().set({ toast: "" }), 6500);
    return () => clearTimeout(timeout);
  }, [st.toast]);
  return (
    <div className={"application " + (inspectorOpen ? "inspector-open" : "")}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Aperture size={23} />
          </div>
          <div>
            <strong>
              SCENE<span>LAB</span>
            </strong>
            <small>{t("appSubtitle")}</small>
          </div>
        </div>
        <nav className="main-tabs">
          {(
            [
              ["design", Box],
              ["analysis", ChartNoAxesCombined],
              ["report", FileText],
            ] as const
          ).map(([mode, Icon]) => (
            <button
              key={mode}
              className={st.mode === mode ? "active" : ""}
              onClick={() =>
                mode === "report"
                  ? void openReport()
                  : st.set({
                      mode,
                      layer:
                        mode === "design"
                          ? "none"
                          : st.layer === "none"
                            ? "coverage"
                            : st.layer,
                    })
              }
            >
              <Icon size={16} />
              {t(mode)}
              <span>{mode === "design" ? "01" : mode === "analysis" ? "02" : "03"}</span>
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button aria-label={t("library")} onClick={() => st.set({ libraryOpen: true })}>
            <Camera size={16} />
            <span>{t("library")}</span>
          </button>
          <div className="top-divider" />
          <button
            className="language-button"
            onClick={() => st.set({ lang: st.lang === "zh" ? "en" : "zh" })}
          >
            <Globe2 size={15} />
            {st.lang === "zh" ? "EN" : "中文"}
          </button>
        </div>
      </header>
      <div className="projectbar">
        <div className="project-info">
          <div className="project-menu-wrap">
            <button
              className="project-menu-button"
              onClick={() => setProjectMenu(!projectMenu)}
            >
              <PanelLeftClose size={17} />
              <ChevronDown size={11} />
            </button>
            {projectMenu && (
              <div className="project-menu">
                <button
                  onClick={() => {
                    const previous = st.project;
                    const p = makeProject();
                    p.name = "Untitled";
                    p.schemes[0].objects = [];
                    st.loadProject(p);
                    st.set({ past: [previous], mode: "design" });
                    setProjectMenu(false);
                  }}
                >
                  <FilePlus2 size={15} />
                  {t("newProjectConfirm")}
                </button>
                <button
                  onClick={() => {
                    const previous = st.project;
                    st.loadProject(makeProject(st.models[0]));
                    st.set({ past: [previous], mode: "design" });
                    setProjectMenu(false);
                  }}
                >
                  <Aperture size={15} />
                  {t("resetDemo")}
                </button>
                <button
                  onClick={() => {
                    input.current?.click();
                    setProjectMenu(false);
                  }}
                >
                  <ArrowUpFromLine size={15} />
                  {t("openProject")}
                </button>
                <button
                  onClick={() => {
                    exportProject();
                    setProjectMenu(false);
                  }}
                >
                  <ArrowDownToLine size={15} />
                  {t("saveProject")}
                </button>
              </div>
            )}
          </div>
          <input
            className="project-name"
            value={st.project.name}
            aria-label={t("rename")}
            onChange={(e) => {
              const p = structuredClone(st.project);
              p.name = e.target.value;
              st.set({ project: p });
            }}
            onBlur={() => {
              const name = useStore.getState().project.name;
              st.edit(() => {});
              if (!name) st.set({ toast: "nameRequired" });
            }}
          />
          <ChevronRight size={13} />
          <select
            aria-label={t("scheme")}
            className="scheme-select"
            value={s.id}
            onChange={(e) => st.switchScheme(e.target.value)}
          >
            {st.project.schemes.map((s) => (
              <option key={s.id} value={s.id}>
                {t("scheme")} {s.name}
              </option>
            ))}
          </select>
          <button className="icon-button" title={t("addScheme")} onClick={st.addScheme}>
            <Plus size={14} />
          </button>
          <span className="saved-label">
            <Check size={12} />
            {t("saved")}
          </span>
        </div>
        <div className="button-row">
          <button onClick={exportProject} title={t("saveProject")}>
            <Save size={15} />
            <span>{t("export")}</span>
          </button>
          <button
            className="primary run-button"
            onClick={() => (st.progress === null ? run() : cancel())}
          >
            {st.progress === null ? (
              <Play size={14} fill="currentColor" />
            ) : (
              <LoaderCircle size={15} className="spin" />
            )}
            {st.progress === null ? t("run") : `${t("cancel")} · ${st.progress}%`}
          </button>
        </div>
      </div>
      {st.mode === "report" ? (
        <Report images={images} onRun={() => run()} />
      ) : (
        <>
          <div className="toolbar">
            <div className="tool-group">
              <button
                className={"icon-button " + (st.tool === "translate" ? "active" : "")}
                title={t("move") + " (W)"}
                onClick={() => st.set({ tool: "translate" })}
              >
                <Move3D size={17} />
              </button>
              <button
                className={"icon-button " + (st.tool === "rotate" ? "active" : "")}
                title={t("rotate") + " (E)"}
                onClick={() => st.set({ tool: "rotate" })}
              >
                <Rotate3D size={17} />
              </button>
              <button
                className={"icon-button " + (st.tool === "scale" ? "active" : "")}
                title={t("scale") + " (R)"}
                onClick={() => st.set({ tool: "scale" })}
              >
                <Maximize size={16} />
              </button>
              <span className="tool-divider" />
              <button
                className="icon-button"
                title={t("copyObjects") + " (Ctrl+C)"}
                disabled={!st.selected.length}
                onClick={st.copy}
              >
                <Copy size={15} />
              </button>
              <button
                className="icon-button"
                title={t("pasteObjects") + " (Ctrl+V)"}
                disabled={!st.clipboard.length}
                onClick={st.paste}
              >
                <ClipboardPaste size={15} />
              </button>
              <button
                className="icon-button"
                title={t("undo")}
                disabled={!st.past.length}
                onClick={st.undo}
              >
                <Undo2 size={15} />
              </button>
              <button
                className="icon-button"
                title={t("redo")}
                disabled={!st.future.length}
                onClick={st.redo}
              >
                <Redo2 size={15} />
              </button>
            </div>
            <div className="tool-group snapping">
              <button
                className="text-button"
                onClick={() =>
                  st.set({ space: st.space === "world" ? "local" : "world" })
                }
              >
                <Axis3D size={15} />
                {t(st.space === "world" ? "world" : "localSpace")}
              </button>
              <span className="tool-divider" />
              <Grid2X2 size={14} />
              <select
                aria-label={t("gridSnap")}
                value={st.snap}
                onChange={(e) => st.set({ snap: Number(e.target.value) })}
              >
                {[0, 0.01, 0.05, 0.1, 0.5, 1].map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? t("off") : `${v} m`}
                  </option>
                ))}
              </select>
              <select
                aria-label={t("angleSnap")}
                value={st.angleSnap}
                onChange={(e) => st.set({ angleSnap: Number(e.target.value) })}
              >
                {[0, 1, 5, 15, 30, 45].map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? t("off") : `${v}°`}
                  </option>
                ))}
              </select>
            </div>
            <div className="tool-group push-right">
              <button
                className="inspector-toggle"
                aria-label={t("inspector")}
                onClick={() => setInspectorOpen(!inspectorOpen)}
              >
                <Settings2 size={16} />
              </button>
              <button onClick={() => st.set({ arrayOpen: true })}>
                <Grid2X2 size={15} />
                {t("array")}
              </button>
              <button
                className={"icon-button " + (st.frustums ? "active" : "")}
                title={t("frustums")}
                onClick={() => st.set({ frustums: !st.frustums })}
              >
                <Frame size={16} />
              </button>
              <button
                className="icon-button"
                title={t("snapshotButton")}
                onClick={() => {
                  setImages([...images, shot(true)]);
                  st.set({ toast: "captureSaved" });
                }}
              >
                <CameraIcon size={16} />
              </button>
              <button
                className="icon-button"
                title={t("shortcuts")}
                onClick={() => st.set({ toast: "shortcuts" })}
              >
                <MousePointer2 size={16} />
              </button>
            </div>
          </div>
          <main className="workspace">
            <SceneTree />
            <section className="center-panel">
              <div className="viewport-frame">
                <Viewport />
                <div className="viewport-title">
                  <span className="eyebrow">
                    {t("scheme")} {s.name} / {t(st.mode)}
                  </span>
                  <h1>{st.project.name}</h1>
                  <p>{t(st.mode === "design" ? "designHint" : "analysisHint")}</p>
                </div>
                <div className="view-controls">
                  <select
                    value={st.view}
                    aria-label={t("perspective")}
                    onChange={(e) => st.set({ view: e.target.value as typeof st.view })}
                  >
                    {["perspective", "orthographic", "top", "front", "side"].map((v) => (
                      <option value={v} key={v}>
                        {t(v)}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-button"
                    title={t("fit")}
                    onClick={() => st.set({ selected: [], focusTick: st.focusTick + 1 })}
                  >
                    <Focus size={16} />
                  </button>
                </div>
                <div className="view-cube">
                  <button
                    className={st.view === "top" ? "active" : ""}
                    onClick={() => st.set({ view: "top" })}
                  >
                    {t("top")}
                  </button>
                  <div>
                    <button
                      className={st.view === "front" ? "active" : ""}
                      onClick={() => st.set({ view: "front" })}
                    >
                      {t("front")}
                    </button>
                    <button
                      className={st.view === "side" ? "active" : ""}
                      onClick={() => st.set({ view: "side" })}
                    >
                      {t("side")}
                    </button>
                  </div>
                </div>
                <div className="layer-switch">
                  <button
                    className={st.layer === "none" ? "active" : ""}
                    onClick={() => st.set({ layer: "none" })}
                  >
                    <Box size={14} />
                    {t("normal")}
                  </button>
                  <button
                    className={st.layer === "coverage" ? "active" : ""}
                    onClick={() => st.set({ layer: "coverage", mode: "analysis" })}
                  >
                    <Layers size={14} />
                    {t("coverage")}
                  </button>
                  <button
                    className={st.layer === "accuracy" ? "active" : ""}
                    onClick={() => st.set({ layer: "accuracy", mode: "analysis" })}
                  >
                    <CrosshairIcon />
                    {t("accuracy")}
                  </button>
                </div>
                {st.layer !== "none" && (
                  <div className="heatmap-controls">
                    <div className="legend-title">
                      {t(st.layer === "coverage" ? "legendCoverage" : "legendAccuracy")}
                      <span>
                        {st.layer === "coverage"
                          ? `0 – ${Math.max(5, viewCount(s))}`
                          : "mm"}
                      </span>
                    </div>
                    <div className={"gradient " + st.layer} />
                    <div className="legend-labels">
                      <span>{st.layer === "coverage" ? "0" : "0.00"}</span>
                      <span>
                        {st.layer === "coverage"
                          ? Math.max(5, viewCount(s))
                          : fmt(s.settings.errorThreshold * 2)}
                      </span>
                    </div>
                    {r && r.counts.length > MAX_HEATMAP_CELLS && (
                      <p className="muted tiny">{t("heatmapSampled")}</p>
                    )}
                    <div className="heatmap-slider">
                      <label>
                        {t("clip")}
                        <b>{st.clip.toFixed(1)} m</b>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max={s.boundary[2]}
                        step=".1"
                        value={st.clip}
                        onChange={(e) => st.set({ clip: Number(e.target.value) })}
                      />
                    </div>
                    <div className="heatmap-slider">
                      <label>
                        {t("opacity")}
                        <b>{Math.round(st.opacity * 100)}%</b>
                      </label>
                      <input
                        type="range"
                        min=".1"
                        max="1"
                        step=".05"
                        value={st.opacity}
                        onChange={(e) => st.set({ opacity: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                )}
                {r && !current && (
                  <div className="stale-badge">
                    <Circle size={10} />
                    {t("outdated")}
                  </div>
                )}
                {st.progress !== null && (
                  <div className="calculation-progress">
                    <LoaderCircle size={15} className="spin" />
                    <span>{t("running")}</span>
                    <div>
                      <i style={{ width: st.progress + "%" }} />
                    </div>
                    <b>{st.progress}%</b>
                  </div>
                )}
                <div className="viewport-hint">
                  <MousePointer2 size={12} />
                  {t("navigation")}
                </div>
              </div>
              <div className={"dashboard " + (r && !current ? "stale" : "")}>
                <div className="dashboard-heading">
                  <span>
                    <ChartNoAxesCombined size={15} />
                    {t("dashboard")}
                  </span>
                  <span>
                    {t("allSpace")}
                    <span className="dot-separator">·</span>
                    {r?.validVoxels.toLocaleString() || "—"} {t("sampled")}
                  </span>
                </div>
                <div className="metric-grid">
                  {[
                    {
                      label: "cameraCount",
                      value: String(cameras),
                      unit: "",
                      sub: `${s.boundary.join(" × ")} m`,
                      icon: Camera,
                    },
                    {
                      label: "coverage3",
                      value: fmt(r?.coverage[2], 1),
                      unit: "%",
                      sub: `≥2: ${fmt(r?.coverage[1], 1)}%  ·  ≥4: ${fmt(r?.coverage[3], 1)}%`,
                      icon: Layers,
                    },
                    {
                      label: "meanError",
                      value: fmt(r?.meanError),
                      unit: "mm",
                      sub: `P95: ${fmt(r?.p95)} mm`,
                      icon: Scan,
                    },
                    {
                      label: "errorRate05",
                      value: fmt(r?.under05, 1),
                      unit: "%",
                      sub: `≤0.3 mm: ${fmt(r?.under03, 1)}%`,
                      icon: Ruler,
                    },
                  ].map(({ label, value, unit, sub, icon: Icon }) => (
                    <div className="metric" key={label}>
                      <span className="metric-label">
                        {t(label)}
                        <Icon size={14} />
                      </span>
                      <strong>
                        {value}
                        <small>{unit}</small>
                      </strong>
                      <span className="metric-sub">{sub}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <aside className="right-panel">
              {st.mode === "analysis" && !st.selected.length ? (
                <AnalysisPanel />
              ) : (
                <Inspector />
              )}
            </aside>
          </main>
        </>
      )}
      <footer className="statusbar">
        <div>
          <span className={"status-dot " + (!current ? "pending" : "")} />
          {st.progress !== null
            ? t("running")
            : r
              ? current
                ? t("ready")
                : t("outdated")
              : t("notRun")}
        </div>
        <div>
          <Camera size={12} />
          {cameras}
          <span className="status-separator" />
          Marker {s.settings.markerDiameter} mm
          <span className="status-separator" />
          {t("voxel")} {s.settings.voxel} m
        </div>
        <div>
          {r && `${t("elapsed")} ${(r.elapsed / 1000).toFixed(2)} s`}
          <span className="status-separator" />
          {t("appVersion")}
        </div>
      </footer>
      {st.libraryOpen && <CameraLibrary />}
      {st.arrayOpen && <ArrayDialog />}
      {st.toast && (
        <div className="toast">
          <span>{t(st.toast)}</span>
          <button className="icon-button" onClick={() => st.set({ toast: "" })}>
            <X size={14} />
          </button>
        </div>
      )}
      {capturing && (
        <div className="capture-overlay">
          <LoaderCircle size={24} className="spin" />
          {t("reportViews")}
        </div>
      )}
      <input
        type="file"
        accept=".json"
        hidden
        ref={input}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            st.loadProject(JSON.parse(await f.text()));
            st.set({ mode: "design" });
          } catch {
            st.set({ toast: "invalidFile" });
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
function CrosshairIcon() {
  return <Scan size={14} />;
}
