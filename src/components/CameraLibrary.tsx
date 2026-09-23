import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Plus,
  Search,
  Upload,
  Download,
  Copy,
  Trash2,
  ArrowUpRight,
} from "lucide-react";
import { useStore } from "../store";
import { useT } from "../i18n";
import {
  derive,
  exportModels,
  importModels,
  newModel,
  validateModel,
} from "../camera/repository";
import type { CameraModel } from "../models";
import { uid } from "../models";
import { Field, Modal, Num, Toggle } from "./Common";
export function CameraLibrary() {
  const state = useStore(),
    t = useT(),
    file = useRef<HTMLInputElement>(null),
    selectedCard = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState(""),
    [manufacturer, setManufacturer] = useState("all"),
    [draft, setDraft] = useState<CameraModel>(
      structuredClone(state.models[0] || newModel()),
    ),
    [errors, setErrors] = useState<string[]>([]),
    [saved, setSaved] = useState(false);
  const readonly = draft.source === "preset";
  const stored = state.models.find((m) => m.id === draft.id);
  const dirty = !stored || JSON.stringify(stored) !== JSON.stringify(draft);
  useEffect(() => {
    if (saved) selectedCard.current?.scrollIntoView({ block: "nearest" });
  }, [saved, draft.id]);
  const update = (patch: Partial<CameraModel>) => {
    setDraft((d) => {
      const n = { ...d, ...patch };
      return n.input_mode === "basic" ? derive(n) : n;
    });
    setErrors([]);
    setSaved(false);
  };
  const save = () => {
    if (readonly) return;
    let m = {
      ...draft,
      manufacturer: draft.manufacturer.trim(),
      model_name: draft.model_name.trim(),
      display_name: draft.model_name.trim(),
      updated_at: new Date().toISOString(),
    };
    if (m.input_mode === "basic") m = derive(m);
    else
      m = {
        ...m,
        hfov_deg: (2 * Math.atan(m.resolution_width / 2 / m.fx) * 180) / Math.PI,
        vfov_deg: (2 * Math.atan(m.resolution_height / 2 / m.fy) * 180) / Math.PI,
      };
    const issues = validateModel(m);
    setErrors(issues);
    if (issues.length) return;
    const models = useStore.getState().models;
    if (
      !state.changeModels(
        models.some((x) => x.id === m.id)
          ? models.map((x) => (x.id === m.id ? m : x))
          : [...models, m],
      )
    ) {
      setErrors(["librarySaveFailed"]);
      return;
    }
    setDraft(m);
    setQuery("");
    setManufacturer("all");
    setSaved(true);
    state.set({ toast: "modelSaved" });
  };
  const duplicate = () => {
    setDraft({
      ...structuredClone(draft),
      id: uid(),
      source: "user",
      model_name: draft.model_name + " · Custom",
    });
    setErrors([]);
    setSaved(false);
  };
  const numeric = (
    key: keyof CameraModel,
    label: string,
    unit: string,
    min = 0,
    step = 0.1,
  ) => (
    <Field label={t(label)}>
      <Num
        value={draft[key] as number}
        onChange={(v) => update({ [key]: v })}
        min={min}
        step={step}
        unit={unit}
        disabled={readonly}
        aria-label={t(label)}
      />
    </Field>
  );
  const filtered = state.models.filter(
    (m) =>
      (manufacturer === "all" || m.manufacturer === manufacturer) &&
      (m.manufacturer + " " + m.model_name).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Modal
      title={t("library")}
      subtitle={t("librarySubtitle")}
      onClose={() => state.set({ libraryOpen: false })}
      wide
    >
      <div className="library-layout">
        <aside className="library-list">
          <div className="search-box">
            <Search size={15} />
            <input
              placeholder={t("search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label={t("manufacturer")}
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
          >
            <option value="all">{t("all")}</option>
            {[...new Set(state.models.map((m) => m.manufacturer))].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <button
            className="primary full"
            onClick={() => {
              setDraft(newModel());
              setErrors([]);
              setSaved(false);
            }}
          >
            <Plus size={16} />
            {t("newModel")}
          </button>
          <div className="model-cards">
            {filtered.map((m) => (
              <button
                key={m.id}
                ref={draft.id === m.id ? selectedCard : undefined}
                className={"model-card " + (draft.id === m.id ? "active" : "")}
                onClick={() => {
                  setDraft(structuredClone(m));
                  setErrors([]);
                  setSaved(false);
                }}
              >
                <Camera size={22} />
                <span>
                  <small>{m.manufacturer}</small>
                  <strong>{m.model_name}</strong>
                  <small>
                    {m.resolution_width} × {m.resolution_height} · {m.hfov_deg.toFixed(0)}
                    °
                  </small>
                </span>
                <ArrowUpRight size={15} />
              </button>
            ))}
            {!filtered.length && <p className="muted">{t("emptyLibrary")}</p>}
          </div>
          <div className="library-file-actions">
            <button onClick={() => file.current?.click()}>
              <Upload size={15} />
              {t("import")}
            </button>
            <button onClick={() => exportModels(state.models, "json")}>
              <Download size={15} />
              JSON
            </button>
            <button onClick={() => exportModels(state.models, "csv")}>CSV</button>
          </div>
          <p className="small muted">{t("importHint")}</p>
          <input
            hidden
            ref={file}
            type="file"
            accept=".json,.csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const imported = importModels(
                  await f.text(),
                  f.name.toLowerCase().endsWith(".csv"),
                );
                if (!state.changeModels([...useStore.getState().models, ...imported]))
                  throw new Error("librarySaveFailed");
                setDraft(imported[0]);
                setQuery("");
                setManufacturer("all");
                setErrors([]);
                setSaved(true);
                state.set({ toast: "importSuccess" });
              } catch (err) {
                setErrors([(err as Error).message]);
              }
              e.target.value = "";
            }}
          />
        </aside>
        <div className="model-editor">
          <div className="model-editor-scroll">
            <div className="editor-heading">
              <div>
                <span className="eyebrow">{draft.manufacturer}</span>
                <h3>{draft.model_name}</h3>
              </div>
              <span className={"badge " + (readonly ? "amber" : "")}>
                {t(draft.source)}
              </span>
            </div>
            {readonly && <div className="notice">{t("presetHint")}</div>}
            {draft.catalog && (
              <details className="catalog-details">
                <summary>
                  {t("catalogSource")} · {String(draft.catalog.optical.profile_id)}
                </summary>
                <p>{draft.catalog.filename}</p>
                <p>{String(draft.catalog.optical.source ?? "")}</p>
                <div className="catalog-specs">
                  <span>{t("opticalEnvironment")}</span>
                  <b>{String(draft.catalog.optical.environment)}</b>
                  <span>{t("passiveRange")}</span>
                  <b>{draft.catalog.optical.passive_range_m ?? "—"} m</b>
                  <span>{t("activeRange")}</span>
                  <b>{draft.catalog.optical.active_range_m ?? "—"} m</b>
                  <span>{t("referenceMarker")}</span>
                  <b>{draft.catalog.optical.marker_diameter_mm ?? "—"} mm</b>
                  <span>{t("referenceAccuracy")}</span>
                  <b>{draft.catalog.camera.accuracy_3d_mm ?? "—"} mm</b>
                  <span>{t("frameRates")}</span>
                  <b>
                    {draft.catalog.frame
                      ? `${draft.catalog.frame.image_fps} / ${draft.catalog.frame.blob_fps}`
                      : (draft.catalog.camera.max_fps_full_resolution ?? "—")}{" "}
                    fps
                  </b>
                </div>
                {draft.stereo && (
                  <div className="catalog-specs">
                    {(
                      [
                        ["imageMode", draft.catalog.optical.image_mode],
                        ["sensorType", draft.catalog.camera.sensor],
                        ["aperture", draft.catalog.optical.aperture],
                        [
                          "focalTolerance",
                          draft.catalog.optical.focal_tolerance_mm == null
                            ? null
                            : `±${draft.catalog.optical.focal_tolerance_mm} mm`,
                        ],
                        ["irFilter", draft.catalog.optical.ir_cut],
                        ["illumination", draft.catalog.optical.ir_led],
                        ["transmission", draft.catalog.camera.transmission],
                        ["powerSupply", draft.catalog.camera.power_supply],
                        ["communication", draft.catalog.camera.communication],
                        ["interface", draft.catalog.camera.interface],
                        ["sync", draft.catalog.camera.sync],
                        [
                          "standbyPower",
                          `${draft.catalog.camera.standby_power_w ?? "—"} W`,
                        ],
                        ["maxPower", `${draft.catalog.camera.max_power_w ?? "—"} W`],
                        ["weight", `${draft.catalog.camera.weight_g ?? "—"} g`],
                        [
                          "bodyDimensions",
                          `${draft.catalog.camera.dimensions_mm ?? "—"} mm`,
                        ],
                      ] as const
                    ).map(([label, value]) => (
                      <div className="catalog-spec-row" key={label}>
                        <span>{t(label)}</span>
                        <b>{String(value ?? "—")}</b>
                      </div>
                    ))}
                  </div>
                )}
                <p>{t("catalogAssumptions")}</p>
              </details>
            )}
            {draft.layout_supported === false && (
              <div className="notice">{t("referenceCameraHint")}</div>
            )}
            <div className="segmented">
              <button
                className={draft.input_mode === "basic" ? "active" : ""}
                disabled={readonly}
                onClick={() => update({ input_mode: "basic", source: "user" })}
              >
                {t("basic")}
              </button>
              <button
                className={draft.input_mode === "advanced" ? "active" : ""}
                disabled={readonly}
                onClick={() => update({ input_mode: "advanced", source: "calibration" })}
              >
                {t("advanced")}
              </button>
            </div>
            <p className="muted small">
              {t(draft.input_mode === "basic" ? "basicHint" : "advancedHint")}
            </p>
            <div className="form-grid">
              <Field label={t("manufacturer")}>
                <input
                  value={draft.manufacturer}
                  disabled={readonly}
                  onChange={(e) => update({ manufacturer: e.target.value })}
                />
              </Field>
              <Field label={t("modelName")}>
                <input
                  value={draft.model_name}
                  disabled={readonly}
                  onChange={(e) => update({ model_name: e.target.value })}
                />
              </Field>
              {numeric("resolution_width", "resolution", "W / px", 1, 1)}
              {numeric("resolution_height", "resolution", "H / px", 1, 1)}
              {draft.input_mode === "basic" ? (
                <>
                  {numeric("hfov_deg", "hfov", "°", 1)}
                  {numeric("vfov_deg", "vfov", "°", 1)}
                </>
              ) : (
                <>
                  {["fx", "fy", "cx", "cy"].map((k) => (
                    <Field key={k} label={k}>
                      <Num
                        value={draft[k as keyof CameraModel] as number}
                        unit="px"
                        min={k.startsWith("f") ? 0.01 : 0}
                        onChange={(v) => update({ [k]: v })}
                        disabled={readonly}
                      />
                    </Field>
                  ))}
                </>
              )}
              {numeric("focal_length_mm", "focalLength", "mm", 0.01)}
              {numeric("minimum_marker_pixels", "minPixels", "px", 0.01)}
              <p className="small muted">{t("minPixelsHint")}</p>
              {numeric("min_working_distance_m", "minDistance", "m", 0)}
              {draft.max_working_distance_m !== null &&
                numeric("max_working_distance_m", "maxDistance", "m", 0.01)}
              {numeric(
                "default_pixel_localization_error_px",
                "pixelError",
                "px",
                0.001,
                0.01,
              )}
              <Field label={t("distortion")}>
                <select
                  value={draft.distortion_model}
                  disabled={readonly}
                  onChange={(e) =>
                    update({
                      distortion_model: e.target.value as "none" | "brown",
                    })
                  }
                >
                  <option value="none">{t("none")}</option>
                  <option value="brown">{t("brown")}</option>
                </select>
              </Field>
            </div>
            <Toggle
              label={t("unlimitedRange")}
              disabled={readonly}
              checked={draft.max_working_distance_m === null}
              onChange={(unlimited) =>
                update({
                  max_working_distance_m: unlimited
                    ? null
                    : Math.max(20, draft.min_working_distance_m + 1),
                })
              }
            />
            <Toggle
              label={t("stereoCamera")}
              disabled={readonly}
              checked={!!draft.stereo}
              onChange={(stereo) =>
                update({ stereo: stereo ? { baseline_mm: 100 } : undefined })
              }
            />
            {draft.stereo && (
              <>
                <Field label={t("baseline")}>
                  <Num
                    aria-label={t("baseline")}
                    unit="mm"
                    min={0.1}
                    value={draft.stereo.baseline_mm}
                    disabled={readonly}
                    onChange={(baseline_mm) => update({ stereo: { baseline_mm } })}
                  />
                </Field>
                <p className="small muted">{t("stereoAssumptions")}</p>
              </>
            )}
            {draft.catalog?.optical.passive_range_m != null &&
              draft.catalog.optical.active_range_m != null && (
                <Field label={t("trackingRangeMode")}>
                  <select
                    value={draft.range_mode ?? "passive"}
                    disabled={readonly}
                    onChange={(e) => {
                      const range_mode = e.target.value as "passive" | "active";
                      update({
                        range_mode,
                        max_working_distance_m: Number(
                          draft.catalog!.optical[`${range_mode}_range_m`],
                        ),
                      });
                    }}
                  >
                    <option value="passive">{t("passiveRange")}</option>
                    <option value="active">{t("activeRange")}</option>
                  </select>
                </Field>
              )}
            {draft.layout_supported !== false && !readonly && (
              <Toggle
                label={t("defaultLayoutEnabled")}
                checked={draft.enabled_for_layout_default !== false}
                onChange={(enabled_for_layout_default) =>
                  update({ enabled_for_layout_default })
                }
              />
            )}
            {draft.distortion_model === "brown" && (
              <>
                <div className="form-grid">
                  {["k1", "k2", "p1", "p2", "k3"].map((k, i) => (
                    <Field key={k} label={k}>
                      <Num
                        value={draft.distortion_parameters[i]}
                        step={0.001}
                        disabled={readonly}
                        onChange={(v) => {
                          const a = [
                            ...draft.distortion_parameters,
                          ] as CameraModel["distortion_parameters"];
                          a[i] = v;
                          update({ distortion_parameters: a });
                        }}
                      />
                    </Field>
                  ))}
                </div>
                <p className="small muted">{t("distortionSizeNote")}</p>
              </>
            )}
            <div className="intrinsics-bar">
              <span>{t("intrinsics")}</span>
              <code>
                fx {draft.fx.toFixed(1)} · fy {draft.fy.toFixed(1)} · cx{" "}
                {draft.cx.toFixed(1)} · cy {draft.cy.toFixed(1)}
              </code>
            </div>
            <Field label={t("notes")}>
              <textarea
                rows={2}
                disabled={readonly}
                value={draft.notes}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </Field>
          </div>
          <div className="model-editor-actions">
            {errors.map((err) => (
              <div className="error-message" role="alert" key={err}>
                {t(err)}
              </div>
            ))}
            <p className="model-save-status" role="status">
              {t(dirty ? "modelUnsaved" : saved ? "modelSaved" : "modelStored")}
            </p>
            <div className="editor-footer">
              <button onClick={duplicate}>
                <Copy size={15} />
                {t("duplicate")}
              </button>
              <button
                onClick={() => exportModels([draft], "json")}
                title={t("exportSelected")}
              >
                <Download size={15} />
                {t("export")}
              </button>
              {!readonly && state.models.some((m) => m.id === draft.id) && (
                <button
                  className="danger icon-button"
                  title={t("deleteModelHint")}
                  aria-label={t("delete")}
                  onClick={() => {
                    const remaining = state.models.filter((m) => m.id !== draft.id);
                    if (!state.changeModels(remaining)) {
                      setErrors(["librarySaveFailed"]);
                      return;
                    }
                    setDraft(structuredClone(remaining[0] || newModel()));
                    setErrors([]);
                    setSaved(false);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button className="primary push-right" disabled={readonly} onClick={save}>
                {t("saveModel")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
