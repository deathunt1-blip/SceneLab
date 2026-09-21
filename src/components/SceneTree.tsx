import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import {
  Box,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  ClipboardPaste,
  Cuboid,
  Eye,
  EyeOff,
  Folder,
  FolderPlus,
  Frame,
  Layers,
  LockKeyhole,
  Plus,
  Scan,
  Square,
  CheckCheck,
  Trash2,
  RefreshCw,
  Focus,
  Pencil,
  Ungroup,
  Unlock,
} from "lucide-react";
import { activeScheme, useStore } from "../store";
import { useT } from "../i18n";
import type { ObjectKind, SceneObject } from "../models";
import { makeCamera, makeObject } from "../project/data";
import { treeSelection } from "../project/selection";
import { Issues } from "./AnalysisPanel";
import { ContextMenu } from "./ContextMenu";
import { Field, Modal } from "./Common";

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
const categories = [
  ["structures", ["truss", "tube", "surface"]],
  ["obstacles", ["box", "cylinder", "wall"]],
  ["cameras", ["camera"]],
  ["markers", ["marker"]],
  ["rigidBodies", ["rigidBody"]],
] as const;
type DialogState = {
  type: "create" | "renameGroup" | "renameObject" | "move";
  id?: string;
};

export function SceneTree() {
  const st = useStore(),
    t = useT(),
    s = activeScheme(st);
  const [closed, setClosed] = useState<string[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; groupId?: string } | null>(
    null,
  );
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const anchor = useRef<string | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  useEffect(() => {
    anchor.current = null;
    setClosed([]);
    closeMenu();
    setDialog(null);
  }, [s.id, closeMenu]);
  const customGroups = [
    ...new Set(s.objects.flatMap((o) => (o.group ? [o.group] : []))),
  ].map((id, i) => ({
    id,
    name: s.groups?.find((g) => g.id === id)?.name ?? `${t("group")} ${i + 1}`,
    objects: s.objects.filter((o) => o.group === id),
  }));
  const sections = categories.map(([key, kinds]) => ({
    key,
    kinds,
    all: s.objects.filter((o) => (kinds as readonly string[]).includes(o.kind)),
    objects: s.objects.filter(
      (o) => !o.group && (kinds as readonly string[]).includes(o.kind),
    ),
  }));
  const ordered = [
    ...customGroups.filter((g) => !closed.includes(g.id)).flatMap((g) => g.objects),
    ...sections.filter((g) => !closed.includes(g.key)).flatMap((g) => g.objects),
  ].map((o) => o.id);
  const selected = s.objects.filter((o) => st.selected.includes(o.id));
  const editable = selected.filter((o) => !o.locked);
  const updates = editable.filter(
    (o) =>
      o.kind === "camera" &&
      st.models.some(
        (m) =>
          m.id === o.camera_model_id &&
          JSON.stringify(m) !== JSON.stringify(o.camera_model_snapshot),
      ),
  );
  const choose = (ids: string[], additive = false) => {
    st.set({ selected: additive ? [...new Set([...st.selected, ...ids])] : ids });
    anchor.current = ids[0] ?? null;
  };
  const toggle = (id: string) =>
    setClosed((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const context = (e: MouseEvent, ids?: string[], groupId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (ids && (groupId || ids.length !== 1 || !st.selected.includes(ids[0])))
      choose(ids);
    setMenu({ x: e.clientX, y: e.clientY, groupId });
  };
  const openDialog = (type: DialogState["type"], id?: string) => {
    setDialog({ type, id });
    setName(
      type === "renameGroup"
        ? customGroups.find((g) => g.id === id)!.name
        : type === "renameObject"
          ? selected[0].name
          : `${t("group")} ${customGroups.length + 1}`,
    );
    setDestination(customGroups[0]?.id ?? "");
    closeMenu();
  };
  const action = (fn: () => void) => {
    closeMenu();
    fn();
  };
  const row = (o: SceneObject) => {
    const Icon = icons[o.kind];
    return (
      <div
        className={`tree-row ${st.selected.includes(o.id) ? "active " : ""}${!o.enabled ? "disabled" : ""}`}
        key={o.id}
        onContextMenu={(e) => context(e, [o.id])}
      >
        <button
          className="tree-object"
          aria-pressed={st.selected.includes(o.id)}
          title={o.name}
          onClick={(e) => {
            const next = treeSelection(
              ordered,
              st.selected,
              anchor.current,
              o.id,
              e.shiftKey,
              e.ctrlKey || e.metaKey,
            );
            anchor.current = next.anchor;
            st.set({ selected: next.selected });
          }}
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
  };
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
    <aside
      className="left-panel"
      onKeyDown={(e) => {
        if (
          dialog ||
          (e.target as HTMLElement).closest("input,select,textarea,[role=menu]")
        )
          return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
          e.preventDefault();
          e.stopPropagation();
          choose(s.objects.map((o) => o.id));
        }
      }}
    >
      <div className="panel-heading">
        <h3>
          <Layers size={16} />
          {t("sceneTree")}
        </h3>
        <span className="count-pill">
          {st.selected.length ? `${st.selected.length} / ` : ""}
          {s.objects.length}
        </span>
      </div>
      <div className="tree-selection-tools" aria-label={t("quickSelect")}>
        <button
          onClick={() => choose(s.objects.map((o) => o.id))}
          title={t("selectAllObjects")}
        >
          <CheckCheck size={13} />
          {t("selectAll")}
        </button>
        {sections
          .filter((g) => ["cameras", "obstacles"].includes(g.key))
          .map((g) => (
            <button
              key={g.key}
              disabled={!g.all.length}
              aria-label={`${t("selectAll")} ${t(g.key)}`}
              onClick={() => choose(g.all.map((o) => o.id))}
            >
              {t(g.key)}
            </button>
          ))}
      </div>
      <p className="tree-selection-hint">{t("treeSelectionHint")}</p>
      <div className="scene-tree" onContextMenu={(e) => context(e)}>
        <button
          className={`tree-boundary ${!st.selected.length && st.mode === "design" ? "active" : ""}`}
          onClick={() => {
            anchor.current = null;
            st.set({ selected: [], mode: "design" });
          }}
        >
          <Scan size={16} />
          <span>{t("boundary")}</span>
          <small>{s.boundary.join("×")}</small>
        </button>
        {customGroups.map((g) => (
          <div className="tree-group custom-tree-group" key={g.id}>
            <div
              className={`tree-folder-header ${g.objects.every((o) => st.selected.includes(o.id)) ? "active" : ""}`}
              onContextMenu={(e) =>
                context(
                  e,
                  g.objects.map((o) => o.id),
                  g.id,
                )
              }
            >
              <button
                className="tree-folder-toggle"
                aria-label={`${t("toggleGroup")} ${g.name}`}
                aria-expanded={!closed.includes(g.id)}
                onClick={() => toggle(g.id)}
              >
                {closed.includes(g.id) ? (
                  <ChevronRight size={13} />
                ) : (
                  <ChevronDown size={13} />
                )}
              </button>
              <button
                className="tree-folder-name"
                title={g.name}
                aria-pressed={g.objects.every((o) => st.selected.includes(o.id))}
                onClick={(e) =>
                  choose(
                    g.objects.map((o) => o.id),
                    e.ctrlKey || e.metaKey,
                  )
                }
              >
                <Folder size={14} />
                <span>{g.name}</span>
                <small>{g.objects.length}</small>
              </button>
            </div>
            {!closed.includes(g.id) && g.objects.map(row)}
          </div>
        ))}
        {sections.map((g) => (
          <div className="tree-group" key={g.key}>
            <div
              className="tree-category-header"
              onContextMenu={(e) =>
                context(
                  e,
                  g.all.map((o) => o.id),
                )
              }
            >
              <button
                className="tree-group-title"
                aria-expanded={!closed.includes(g.key)}
                onClick={() => toggle(g.key)}
              >
                {closed.includes(g.key) ? (
                  <ChevronRight size={13} />
                ) : (
                  <ChevronDown size={13} />
                )}
                <span>
                  {customGroups.length ? `${t("ungrouped")} · ` : ""}
                  {t(g.key)}
                </span>
                <small>{g.objects.length}</small>
              </button>
              <button
                className="tree-category-select"
                disabled={!g.all.length}
                title={`${t("selectAll")} ${t(g.key)}`}
                aria-label={`${t("selectAll")} ${t(g.key)}`}
                onClick={() => choose(g.all.map((o) => o.id))}
              >
                <CheckCheck size={12} />
              </button>
            </div>
            {!closed.includes(g.key) && g.objects.map(row)}
          </div>
        ))}
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
        <span>v1.2</span>
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={closeMenu}>
          <div className="context-selection-count">
            {selected.length} {t("selected")}
          </div>
          <button
            role="menuitem"
            disabled={!selected.length}
            onClick={() => action(() => st.set({ focusTick: st.focusTick + 1 }))}
          >
            <Focus size={14} />
            {t("focus")}
          </button>
          <button
            role="menuitem"
            disabled={!selected.length}
            onClick={() => action(st.copy)}
          >
            <Copy size={14} />
            {t("copyObjects")}
            <kbd>Ctrl+C</kbd>
          </button>
          <button
            role="menuitem"
            disabled={!st.clipboard.length}
            onClick={() => action(st.paste)}
          >
            <ClipboardPaste size={14} />
            {t("pasteObjects")}
            <kbd>Ctrl+V</kbd>
          </button>
          <button
            role="menuitem"
            disabled={!selected.length}
            onClick={() => action(st.duplicate)}
          >
            <Copy size={14} />
            {t("duplicateObjects")}
            <kbd>Ctrl+D</kbd>
          </button>
          <hr />
          <button
            role="menuitem"
            disabled={!editable.length}
            onClick={() => openDialog("create")}
          >
            <FolderPlus size={14} />
            {t("newGroupFromSelection")}
          </button>
          <button
            role="menuitem"
            disabled={!editable.length || !customGroups.length}
            onClick={() => openDialog("move")}
          >
            <Folder size={14} />
            {t("moveToGroup")}
          </button>
          {menu.groupId && (
            <button
              role="menuitem"
              onClick={() => openDialog("renameGroup", menu.groupId)}
            >
              <Pencil size={14} />
              {t("renameGroup")}
            </button>
          )}
          <button
            role="menuitem"
            disabled={!editable.some((o) => o.group)}
            onClick={() => action(st.ungroupSelection)}
          >
            <Ungroup size={14} />
            {t("removeFromGroup")}
          </button>
          {selected.length === 1 && (
            <button
              role="menuitem"
              disabled={!editable.length}
              onClick={() => openDialog("renameObject", selected[0].id)}
            >
              <Pencil size={14} />
              {t("renameObject")}
            </button>
          )}
          <hr />
          <button
            role="menuitem"
            disabled={!updates.length}
            onClick={() => action(st.updateCameraSnapshots)}
          >
            <RefreshCw size={14} />
            {t("updateSnapshot")}
            <small>{updates.length}</small>
          </button>
          <button
            role="menuitem"
            disabled={!selected.length}
            onClick={() =>
              action(() =>
                st.updateObjects(st.selected, {
                  visible: !selected.some((o) => o.visible),
                }),
              )
            }
          >
            <Eye size={14} />
            {t(selected.some((o) => o.visible) ? "hideSelected" : "showSelected")}
          </button>
          <button
            role="menuitem"
            disabled={!selected.length}
            onClick={() =>
              action(() =>
                st.updateObjects(st.selected, {
                  locked: !selected.every((o) => o.locked),
                }),
              )
            }
          >
            <Unlock size={14} />
            {t(
              selected.length && selected.every((o) => o.locked)
                ? "unlockSelected"
                : "lockSelected",
            )}
          </button>
          <button
            role="menuitem"
            className="danger"
            disabled={!editable.length}
            onClick={() => action(st.remove)}
          >
            <Trash2 size={14} />
            {t("deleteSelected")}
            <kbd>Del</kbd>
          </button>
          {selected.some((o) => o.locked) && (
            <p className="context-help">{t("lockedBatchHint")}</p>
          )}
        </ContextMenu>
      )}
      {dialog && (
        <Modal
          title={t(
            {
              create: "newGroupFromSelection",
              renameGroup: "renameGroup",
              renameObject: "renameObject",
              move: "moveToGroup",
            }[dialog.type],
          )}
          onClose={() => setDialog(null)}
        >
          <form
            className="group-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              if (dialog.type === "move") {
                const group = customGroups.find((g) => g.id === destination);
                if (!group) return;
                st.groupSelection(group.name, group.id);
              } else {
                if (!name.trim()) return;
                if (dialog.type === "create") st.groupSelection(name);
                else if (dialog.type === "renameGroup") st.renameGroup(dialog.id!, name);
                else st.updateObjects([dialog.id!], { name: name.trim() });
              }
              setDialog(null);
            }}
          >
            <Field label={t(dialog.type === "move" ? "group" : "name")}>
              {dialog.type === "move" ? (
                <select
                  autoFocus
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                >
                  {customGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  autoFocus
                  value={name}
                  maxLength={120}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </Field>
            <p className="muted small">{t("groupHint")}</p>
            <div className="button-row">
              <button type="button" onClick={() => setDialog(null)}>
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="primary"
                disabled={dialog.type === "move" ? !destination : !name.trim()}
              >
                {t("save")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </aside>
  );
}
