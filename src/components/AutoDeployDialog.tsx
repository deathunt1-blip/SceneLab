import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Play, Sparkles, X } from "lucide-react";
import { activeScheme, useStore } from "../store";
import { useT } from "../i18n";
import { defaultConstraints, validateConstraints } from "../autoDeploy/constraints";
import {
  profiles,
  type ApplyMode,
  type Constraints,
  type PlannerOutput,
  type PlannerProgress,
} from "../autoDeploy/types";
import type { Vec3 } from "../models";
import { Field, Num, fmt } from "./Common";
import { AutoDeployPreview } from "./AutoDeployPreview";
import { AutoDeployAI } from "./AutoDeployAI";

export function AutoDeployDialog() {
  const st = useStore(),
    t = useT();
  const [source] = useState(() => structuredClone(activeScheme(st))),
    [models] = useState(() => structuredClone(st.models));
  const [c, setC] = useState(() => defaultConstraints(source)),
    [output, setOutput] = useState<PlannerOutput | null>(null),
    [selected, setSelected] = useState(0),
    [progress, setProgress] = useState<PlannerProgress | null>(null),
    [error, setError] = useState("");
  const [mode, setMode] = useState<ApplyMode>("new"),
    [withStructures, setWithStructures] = useState(true),
    [name, setName] = useState("Auto Deploy"),
    [specific, setSpecific] = useState(false),
    [editingModels, setEditingModels] = useState(false),
    [draftModelIds, setDraftModelIds] = useState<string[]>([]);
  const worker = useRef<Worker | null>(null),
    closeRef = useRef<() => void>(() => {});
  const running = progress !== null,
    patch = (p: Partial<Constraints>) => setC((old) => ({ ...old, ...p }));
  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
  };
  const close = () => {
    cancel();
    st.set({ autoDeployOpen: false });
  };
  closeRef.current = close;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      worker.current?.terminate();
      window.removeEventListener("keydown", key);
    };
  }, []);
  const pendingModels = specific && (editingModels || !c.modelIds.length);
  const dirty = output && JSON.stringify(c) !== JSON.stringify(output.constraints);
  const chosen = output?.recommendations[selected];
  const generate = () => {
    if (pendingModels) {
      setError("adConfirmModelsFirst");
      return;
    }
    try {
      validateConstraints(c, models, source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "adInvalidConstraints");
      return;
    }
    cancel();
    setOutput(null);
    setSelected(0);
    setError("");
    setProgress({ stage: "screen", done: 0, total: 1 });
    const w = new Worker(new URL("../autoDeploy/worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = ({ data }) => {
      if (worker.current !== w) return;
      if (data.type === "progress") setProgress(data.progress);
      else {
        if (data.type === "result") setOutput(data.output);
        else setError(data.error);
        cancel();
      }
    };
    w.onerror = () => {
      if (worker.current !== w) return;
      setError("calculationError");
      cancel();
    };
    w.postMessage({ scheme: source, models, constraints: c });
  };
  const enumSelect = (key: keyof Constraints, values: string[], prefix: string) => (
    <select value={String(c[key])} onChange={(e) => patch({ [key]: e.target.value })}>
      {values.map((v) => (
        <option key={v} value={v}>
          {t(prefix + v)}
        </option>
      ))}
    </select>
  );
  return (
    <div className="ad-backdrop">
      <section
        className="ad-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("autoDeploy")}
      >
        <header className="ad-header">
          <div>
            <span className="eyebrow">SCENELAB · AUTO DEPLOY</span>
            <h2>
              <Sparkles size={22} />
              {t("autoDeploy")}
            </h2>
            <p>{t("adSubtitle")}</p>
          </div>
          <button className="icon-button" onClick={close} aria-label={t("closeDialog")}>
            <X size={22} />
          </button>
        </header>
        <div className="ad-body">
          <aside className="ad-form">
            <fieldset disabled={running}>
              <Field label={t("adBoundary")}>
                <div className="xyz-inputs">
                  {c.boundary.map((n, i) => (
                    <Num
                      key={i}
                      aria-label={`${t("adBoundary")} ${"XYZ"[i]}`}
                      value={n}
                      min={0.1}
                      max={1000}
                      unit="m"
                      onChange={(v) =>
                        patch({
                          boundary: c.boundary.map((a, j) => (j === i ? v : a)) as Vec3,
                        })
                      }
                    />
                  ))}
                </div>
              </Field>
              <p className="muted tiny">{t("adBoundaryHint")}</p>
              <h3>{t("adTargets")}</h3>
              <div className="form-grid">
                <Field label={t("adMarker")}>
                  <Num
                    aria-label={t("adMarker")}
                    value={c.markerDiameter}
                    min={0.1}
                    max={1000}
                    unit="mm"
                    onChange={(v) => patch({ markerDiameter: v })}
                  />
                </Field>
                <Field label={t("adThreshold")}>
                  <Num
                    aria-label={t("adThreshold")}
                    value={c.errorThreshold}
                    min={0.001}
                    max={1000}
                    step={0.1}
                    unit="mm"
                    onChange={(v) => patch({ errorThreshold: v })}
                  />
                </Field>
              </div>
              <div className="form-grid">
                <div className="ad-presets">
                  {[6, 9, 12, 14].map((n) => (
                    <button
                      key={n}
                      className={c.markerDiameter === n ? "active" : ""}
                      onClick={() => patch({ markerDiameter: n })}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="ad-presets">
                  {[0.3, 0.5, 1].map((n) => (
                    <button
                      key={n}
                      className={c.errorThreshold === n ? "active" : ""}
                      onClick={() => patch({ errorThreshold: n })}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-grid">
                <Field label={t("adMinViews")}>
                  <select
                    value={c.minViews}
                    onChange={(e) =>
                      patch({ minViews: Number(e.target.value) as 2 | 3 | 4 })
                    }
                  >
                    {[2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        ≥ {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("adCoverageTarget")}>
                  <Num
                    value={c.coverageTarget}
                    min={1}
                    max={100}
                    step={1}
                    unit="%"
                    onChange={(v) => patch({ coverageTarget: v })}
                  />
                </Field>
              </div>
              <label className="ad-check">
                <input
                  type="checkbox"
                  checked={c.accuracyTarget !== null}
                  onChange={(e) =>
                    patch({ accuracyTarget: e.target.checked ? 90 : null })
                  }
                />
                {t("adAccuracyOptional")}
              </label>
              {c.accuracyTarget !== null && (
                <Field label={t("adAccuracyTarget")}>
                  <Num
                    value={c.accuracyTarget}
                    min={1}
                    max={100}
                    unit="%"
                    step={1}
                    onChange={(v) => patch({ accuracyTarget: v })}
                  />
                </Field>
              )}
              <p className="muted tiny">{t("adViewsNote")}</p>
              <h3>{t("adModels")}</h3>
              <select
                aria-label={t("adModels")}
                value={specific ? "specific" : "auto"}
                onChange={(e) => {
                  const value = e.target.value === "specific";
                  setSpecific(value);
                  setEditingModels(value);
                  setDraftModelIds([]);
                  if (!value) patch({ modelIds: [] });
                }}
              >
                <option value="auto">{t("adAutoModel")}</option>
                <option value="specific">{t("adSpecificModels")}</option>
              </select>
              {specific && editingModels && (
                <>
                  <div className="ad-model-list">
                    {models
                      .filter((m) => m.layout_supported !== false)
                      .map((m) => (
                        <label key={m.id} className="ad-check">
                          <input
                            type="checkbox"
                            checked={draftModelIds.includes(m.id)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setDraftModelIds((ids) =>
                                checked
                                  ? [...new Set([...ids, m.id])]
                                  : ids.filter((id) => id !== m.id),
                              );
                            }}
                          />
                          {m.display_name}
                          {m.stereo ? " · Stereo" : ""}
                        </label>
                      ))}
                  </div>
                  <div className="ad-model-selection" role="status" aria-live="polite">
                    <strong>
                      {t("adDraftModels")} · {draftModelIds.length}
                    </strong>
                    <p>
                      {models
                        .filter((m) => draftModelIds.includes(m.id))
                        .map((m) => m.display_name)
                        .join(" / ") || t("adNoModelsSelected")}
                    </p>
                  </div>
                  <div className="ad-model-actions">
                    <button
                      onClick={() => setDraftModelIds([])}
                      disabled={!draftModelIds.length}
                    >
                      {t("adClearModels")}
                    </button>
                    <button
                      onClick={() => {
                        setEditingModels(false);
                        setSpecific(c.modelIds.length > 0);
                        setDraftModelIds([...c.modelIds]);
                      }}
                    >
                      {t("adCancelModelEdit")}
                    </button>
                    <button
                      className="primary"
                      disabled={!draftModelIds.length}
                      onClick={() => {
                        patch({ modelIds: [...draftModelIds] });
                        setEditingModels(false);
                        setError("");
                      }}
                    >
                      {t("adConfirmModels")}
                    </button>
                  </div>
                </>
              )}
              {specific && !editingModels && (
                <div className="ad-model-selection" role="status" aria-live="polite">
                  <strong>
                    {t("adConfirmedModels")} · {c.modelIds.length}
                  </strong>
                  <p>
                    {models
                      .filter((m) => c.modelIds.includes(m.id))
                      .map((m) => m.display_name)
                      .join(" / ")}
                  </p>
                  <button
                    onClick={() => {
                      setDraftModelIds([...c.modelIds]);
                      setEditingModels(true);
                    }}
                  >
                    {t("adEditModels")}
                  </button>
                </div>
              )}
              <p className="muted tiny">{t("adModelHint")}</p>
              <Field label={t("adCount")}>
                {enumSelect("countMode", ["auto", "exact", "range"], "adCount_")}
              </Field>
              {c.countMode === "exact" && (
                <Field label={t("adCount")}>
                  <Num
                    aria-label={t("adCount")}
                    value={c.count}
                    min={1}
                    max={200}
                    step={1}
                    onChange={(v) => patch({ count: Math.round(v) })}
                  />
                </Field>
              )}
              {c.countMode === "range" && (
                <div className="form-grid">
                  <Field label={t("adMin")}>
                    <Num
                      value={c.minCount}
                      min={1}
                      max={200}
                      step={1}
                      onChange={(v) => patch({ minCount: Math.round(v) })}
                    />
                  </Field>
                  <Field label={t("adMax")}>
                    <Num
                      value={c.maxCount}
                      min={1}
                      max={200}
                      step={1}
                      onChange={(v) => patch({ maxCount: Math.round(v) })}
                    />
                  </Field>
                </div>
              )}
              <Field label={t("adInstallation")}>
                {enumSelect(
                  "installation",
                  ["auto", "perimeter", "ceiling", "hybrid", "free", "existing"],
                  "adLayout_",
                )}
              </Field>
              <div className="form-grid">
                <Field label={t("adLayers")}>
                  <select
                    value={c.layers === "auto" ? "auto" : "custom"}
                    onChange={(e) =>
                      patch({ layers: e.target.value === "auto" ? "auto" : 2 })
                    }
                  >
                    <option value="auto">{t("adAuto")}</option>
                    <option value="custom">{t("adCustom")}</option>
                  </select>
                </Field>
                {c.layers !== "auto" && (
                  <Field label={t("adLayers")}>
                    <Num
                      value={c.layers}
                      min={1}
                      max={8}
                      step={1}
                      onChange={(v) => patch({ layers: Math.round(v) })}
                    />
                  </Field>
                )}
              </div>
              <Field label={t("adProfile")}>
                {enumSelect("profile", [...profiles], "adProfile_")}
              </Field>
              <Field label={t("adWeighting")}>
                {enumSelect("weighting", ["center", "uniform"], "adWeight_")}
              </Field>
              <details>
                <summary>{t("adAdvanced")}</summary>
                <label className="ad-check">
                  <input
                    type="checkbox"
                    checked={!!c.activity}
                    onChange={(e) =>
                      patch({ activity: e.target.checked ? [0, c.boundary[2]] : null })
                    }
                  />
                  {t("adActivity")}
                </label>
                {c.activity && (
                  <div className="xyz-inputs">
                    {c.activity.map((n, i) => (
                      <Num
                        key={i}
                        value={n}
                        min={0}
                        max={c.boundary[2]}
                        unit="m"
                        onChange={(v) =>
                          patch({
                            activity: c.activity!.map((a, j) => (i === j ? v : a)) as [
                              number,
                              number,
                            ],
                          })
                        }
                      />
                    ))}
                  </div>
                )}
                <p className="muted tiny">{t("adActivityHint")}</p>
                <Field label={t("adSeed")}>
                  <Num
                    value={c.seed}
                    min={0}
                    max={2147483647}
                    step={1}
                    onChange={(v) => patch({ seed: Math.round(v) })}
                  />
                </Field>
              </details>
            </fieldset>
            <AutoDeployAI
              constraints={c}
              models={models}
              output={output}
              disabled={running}
              onAccept={(next) => {
                setC(next);
                setSpecific(next.modelIds.length > 0);
                setDraftModelIds([...next.modelIds]);
                setEditingModels(false);
              }}
            />
          </aside>
          <main className="ad-results">
            {error && (
              <p className="ad-alert" role="alert">
                {t(error)}
              </p>
            )}
            {running && progress && (
              <div className="ad-progress" role="status" aria-live="polite">
                <LoaderCircle className="spin" size={24} />
                <div>
                  <h3>{t("adStage_" + progress.stage)}</h3>
                  <p>
                    {progress.done + 1} / {Math.max(1, progress.total)}
                    {progress.fraction !== undefined ? ` · ${progress.fraction}%` : ""}
                  </p>
                  <progress
                    value={progress.done + (progress.fraction || 0) / 100}
                    max={Math.max(1, progress.total)}
                  />
                </div>
              </div>
            )}
            {!running && !output && (
              <div className="ad-empty">
                <Sparkles size={42} />
                <h2>{t("adCompare")}</h2>
                <p>{t("adEmpty")}</p>
              </div>
            )}
            {output && (
              <>
                <div className="ad-run-summary">
                  <span>
                    {t("adEvaluated")} <b>{output.evaluated}</b>
                  </span>
                  <span>
                    {t("adModelCount")} <b>{output.modelCount}</b>
                  </span>
                  <span>
                    {t("adCoarse")} {output.coarseVoxel} m
                  </span>
                  <span>
                    {t("adFine")} {output.fineVoxel} m
                  </span>
                  <span>
                    {fmt(output.elapsed / 1000, 1)} {t("adSeconds")}
                  </span>
                </div>
                {dirty && <p className="ad-alert">{t("adDirty")}</p>}
                {!output.recommendations.length && (
                  <div className="ad-empty">
                    <h2>{t("adInfeasible")}</h2>
                    <p>{t("adNoMount")}</p>
                    {[...new Set(output.infeasible.map((i) => i.reason))].map((r) => (
                      <p key={r}>{t(r)}</p>
                    ))}
                  </div>
                )}
                {chosen && (
                  <>
                    <div className="ad-recommendations">
                      {output.recommendations.map((r, i) => (
                        <button
                          key={r.candidate.id}
                          className={selected === i ? "active" : ""}
                          onClick={() => setSelected(i)}
                        >
                          <strong>
                            {r.profiles.map((p) => t("adProfile_" + p)).join(" · ")}
                          </strong>
                          <span>
                            {r.candidate.cameras[0]?.camera_model_snapshot?.display_name}{" "}
                            · {r.candidate.params.count} {t("adCountLabel")}
                          </span>
                          <small
                            className={r.metrics.meetsTarget ? "ad-pass" : "ad-effort"}
                          >
                            {t(r.metrics.meetsTarget ? "adMeets" : "adBestEffort")}
                          </small>
                        </button>
                      ))}
                    </div>
                    <AutoDeployPreview
                      source={source}
                      constraints={output.constraints}
                      plan={chosen}
                    />
                    <div className="ad-candidate-summary">
                      <b>{t("adLayout_" + chosen.candidate.params.layout)}</b>
                      <span>
                        {chosen.candidate.params.layers} {t("adLayerLabel")}
                      </span>
                      <span>Marker {output.constraints.markerDiameter} mm</span>
                      <span>RMS ≤ {output.constraints.errorThreshold} mm</span>
                    </div>
                    <div className="ad-metrics">
                      {[
                        ["≥ 2", fmt(chosen.metrics.coverage[1], 1) + "%"],
                        ["≥ 3", fmt(chosen.metrics.coverage[2], 1) + "%"],
                        ["≥ 4", fmt(chosen.metrics.coverage[3], 1) + "%"],
                        [t("adPass"), fmt(chosen.metrics.accuracyPass, 1) + "%"],
                        ["RMS", fmt(chosen.metrics.meanError) + " mm"],
                        ["P90", fmt(chosen.metrics.p90) + " mm"],
                        ["P95", fmt(chosen.metrics.p95) + " mm"],
                        [t("adAverageViews"), fmt(chosen.metrics.averageCount, 1)],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                    <p className="muted tiny">
                      {t("adFineNote")} · {t("adInvalid")}:{" "}
                      {chosen.metrics.invalidAccuracy.toLocaleString()} /{" "}
                      {chosen.metrics.validVoxels.toLocaleString()}
                    </p>
                    <section className="ad-section">
                      <h3>{t("adWhy")}</h3>
                      {chosen.profiles.length > 1 && <p>{t("adShared")}</p>}
                      <p>
                        {t(
                          chosen.metrics.meetsTarget
                            ? "adWhy_" +
                                (chosen.profiles.includes(c.profile)
                                  ? c.profile
                                  : chosen.profiles[0])
                            : "adWhyEffort",
                        )}
                      </p>
                      <p>
                        {t("adWeight_center")}: {fmt(chosen.metrics.centerCoverage, 1)}% ·{" "}
                        {t("adCoverageTarget")}: {output.constraints.coverageTarget}% ·{" "}
                        {t("adAccuracyTarget")}:{" "}
                        {output.constraints.accuracyTarget === null
                          ? "—"
                          : output.constraints.accuracyTarget + "%"}
                      </p>
                      {chosen.comparisons.length > 0 && (
                        <details>
                          <summary>{t("adVs")}</summary>
                          <table className="ad-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>{t("adCoverageDelta")}</th>
                                <th>{t("adAccuracyDelta")}</th>
                                <th>{t("adCountDelta")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {chosen.comparisons.map((row) => (
                                <tr key={row.candidateId}>
                                  <td>
                                    {row.name} · {row.count} {t("adCountLabel")}
                                    <br />
                                    {t("adLayout_" + row.layout)} · {row.layers}{" "}
                                    {t("adLayerLabel")}
                                  </td>
                                  <td>
                                    {row.coverageDelta > 0 ? "+" : ""}
                                    {fmt(row.coverageDelta, 1)} pp
                                  </td>
                                  <td>
                                    {row.accuracyDelta > 0 ? "+" : ""}
                                    {fmt(row.accuracyDelta, 1)} pp
                                  </td>
                                  <td>
                                    {row.countDelta > 0 ? "+" : ""}
                                    {row.countDelta}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </details>
                      )}
                    </section>
                    <section className="ad-section">
                      <h3>{t("adDiagnostics")}</h3>
                      <p className="muted tiny">{t("adDiagnosticNote")}</p>
                      {!chosen.diagnoses.length && <p>{t("adNoDiagnosis")}</p>}
                      {chosen.diagnoses.map((d) => (
                        <div className="ad-diagnosis" key={d.code}>
                          <b>{t("adDiag_" + d.code)}</b>
                          <span>
                            {d.affected}/{d.sampled}
                          </span>
                          {d.objectNames && <p>{d.objectNames.join(" · ")}</p>}
                          {d.requiredDiameter !== undefined && (
                            <p>
                              {t("adRequiredMarker")}: {fmt(d.requiredDiameter, 1)} mm ·{" "}
                              {t("adSuggestedMarker")}: {d.suggestedDiameter} mm
                            </p>
                          )}
                        </div>
                      ))}
                    </section>
                    {output.trials.length > 0 && (
                      <section className="ad-section">
                        <h3>{t("adTrials")}</h3>
                        <p className="muted tiny">{t("adTrialsHint")}</p>
                        {output.trials.map((trial, i) => (
                          <div key={i} className="ad-trial">
                            <strong>
                              {t("adTrial_" + trial.change)} · {trial.label}
                            </strong>
                            <span>
                              ≥{output.constraints.minViews}:{" "}
                              {fmt(trial.before.targetCoverage, 1)}% →{" "}
                              {fmt(trial.after.targetCoverage, 1)}%
                            </span>
                            <span>
                              {t("adPass")}: {fmt(trial.before.accuracyPass, 1)}% →{" "}
                              {fmt(trial.after.accuracyPass, 1)}%
                            </span>
                          </div>
                        ))}
                      </section>
                    )}
                    <section className="ad-section ad-apply">
                      <h3>{t("adApply")}</h3>
                      <div className="form-grid">
                        <Field label={t("adApplyMode")}>
                          <select
                            value={mode}
                            onChange={(e) => setMode(e.target.value as ApplyMode)}
                          >
                            {["new", "replace", "add"].map((v) => (
                              <option key={v} value={v}>
                                {t("adApply_" + v)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label={t("adName")}>
                          <input
                            value={name}
                            maxLength={120}
                            onChange={(e) => setName(e.target.value)}
                          />
                        </Field>
                      </div>
                      <label className="ad-check">
                        <input
                          type="checkbox"
                          checked={withStructures}
                          disabled={!chosen.candidate.structures.length}
                          onChange={(e) => setWithStructures(e.target.checked)}
                        />
                        {t("adStructures")}
                      </label>
                      {!withStructures && (
                        <p className="muted tiny">{t("adCamerasOnly")}</p>
                      )}
                      <p className="muted tiny">{t("adApplyNote")}</p>
                      <button
                        className="primary"
                        disabled={!!dirty || running || pendingModels}
                        onClick={() => {
                          try {
                            st.applyDeployment(
                              source,
                              output.constraints,
                              chosen.candidate,
                              { mode, structures: withStructures, name },
                            );
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "adStale");
                          }
                        }}
                      >
                        {t("adApply")} · {t("adApply_" + mode)}
                      </button>
                    </section>
                  </>
                )}
                <p className="muted tiny">
                  {t("adHeuristic")} · Planner {output.version} · Seed {output.seed}
                </p>
              </>
            )}
          </main>
        </div>
        <footer className="ad-footer">
          <span>
            {pendingModels ? (
              t("adConfirmModelsFirst")
            ) : (
              <>
                {t("adFine")}: {source.settings.voxel} m · {t("aiDisabled")}
              </>
            )}
          </span>
          <button onClick={close}>{t("adClose")}</button>
          {running ? (
            <button
              onClick={() => {
                cancel();
                setError("adCancelled");
              }}
            >
              {t("adCancel")}
            </button>
          ) : (
            <button className="primary" onClick={generate} disabled={pendingModels}>
              <Play size={15} />
              {t("adGenerate")}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
