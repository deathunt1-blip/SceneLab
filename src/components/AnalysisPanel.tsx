import { CoverageControls } from "./CoverageControls";
import { coverageSettings, coverageIssues } from "../simulation/coverage";
import { useState, useMemo } from "react";
import { AlertTriangle, ChevronDown, Crosshair, Focus } from "lucide-react";
import { activeScheme, useStore } from "../store";
import { useT } from "../i18n";
import { analyzePoint } from "../simulation/engine";
import { pointInVolume, volumeCenter } from "../simulation/volume";
import { CameraPreview } from "./CameraPreview";
import { Num, fmt } from "./Common";
import type { Vec3 } from "../models";
export function AnalysisPanel() {
  const st = useStore(),
    t = useT(),
    s = activeScheme(st);
  const point =
    st.point && pointInVolume(st.point, s.boundary) ? st.point : volumeCenter(s.boundary);
  const data = analyzePoint(point, s.settings.markerDiameter, s);
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <>
      <div className="panel-heading">
        <h3>
          <Crosshair size={16} />
          {t("pointAnalysis")}
        </h3>
        <span className="badge">XYZ</span>
      </div>
      <div className="inspector-content">
        <details className="coverage-analysis-controls">
          <summary>
            {t("coverageBasis")} / {t("coverageThreshold")}
          </summary>
          <CoverageControls settings={s.settings} onChange={st.updateSettings} />
        </details>
        <p className="small muted">{t("pointHint")}</p>
        {s.objects.some((o) => o.camera_model_snapshot?.stereo) && (
          <p className="tiny muted">{t("stereoCountNote")}</p>
        )}
        <div className="xyz-inputs">
          {point.map((v, i) => (
            <Num
              key={i}
              value={v}
              unit={["X", "Y", "Z"][i]}
              aria-label={`${t("pointAnalysis")} ${["X", "Y", "Z"][i]}`}
              min={i === 2 ? 0 : -s.boundary[i] / 2}
              max={i === 2 ? s.boundary[2] : s.boundary[i] / 2}
              onChange={(n) =>
                st.set({
                  point: point.map((v, j) => (i === j ? n : v)) as Vec3,
                })
              }
            />
          ))}
        </div>
        <button
          className="text-button"
          onClick={() => st.set({ point: volumeCenter(s.boundary) })}
        >
          <Crosshair size={13} />
          {t("pointToCenter")}
        </button>
        <div className="mini-stats analysis">
          <div>
            <span>{t("effectiveCameras")}</span>
            <strong>
              {data.count}
              <small> / {data.observations.length}</small>
            </strong>
          </div>
          <div>
            <span>3D RMS</span>
            <strong>
              {fmt(data.accuracy?.rms)} <small>mm</small>
            </strong>
          </div>
        </div>
        <div className="axis-errors">
          {["x", "y", "z"].map((k) => (
            <span key={k}>
              σ{k.toUpperCase()} <b>{fmt(data.accuracy?.[k as "x" | "y" | "z"])}</b> mm
            </span>
          ))}
        </div>
        {!data.accuracy && (
          <p className="notice small">
            {t(
              data.observations.filter((o) => o.imagingValid).length >= 2
                ? "geometry"
                : "minCameraNote",
            )}
          </p>
        )}
        <h4 className="section-title observations-title">
          {t("observations")} <span>{data.observations.length}</span>
        </h4>
        <div className="observations">
          {data.observations.map((obs) => {
            const c = s.objects.find((c) => c.id === obs.cameraId)!;
            const observationId = `${c.id}:${obs.eye ?? "mono"}`;
            return (
              <div
                className={"observation " + (obs.coverageValid ? "valid" : "invalid")}
                key={observationId}
              >
                <button
                  className="observation-head"
                  onClick={() => {
                    setExpanded(expanded === observationId ? null : observationId);
                    st.set({ point });
                  }}
                >
                  <span className="status-dot" />
                  <strong>
                    {c.name}
                    {obs.eye ? ` · ${t(obs.eye + "Eye")}` : ""}
                  </strong>
                  <span>
                    {obs.coverageValid ? t("valid") : t(obs.coverageReasons[0])}
                  </span>
                  <ChevronDown size={13} />
                </button>
                {expanded === observationId && (
                  <div className="observation-body">
                    {!obs.valid && (
                      <div className="failure-tags">
                        {obs.reasons.map((r) => (
                          <span key={r}>{t(r)}</span>
                        ))}
                      </div>
                    )}
                    {obs.coverageValid && !obs.imagingValid && (
                      <p className="notice small">
                        {t(
                          obs.reasons.includes("small")
                            ? "trackingOnlySizeHint"
                            : "trackingOnlyHint",
                        )}
                      </p>
                    )}
                    <div className="spec-grid">
                      <span>{t("coverageBasis")}</span>
                      <b>
                        {t(
                          coverageSettings(s.settings).coverageBasis === "imaging"
                            ? "basisImaging"
                            : "basisTracking",
                        )}
                      </b>
                      <span>{t("coverageDynamic")}</span>
                      <b>{t(obs.coverageValid ? "valid" : "invalid")}</b>
                      <span>{t("imagingValidity")}</span>
                      <b>{t(obs.imagingValid ? "valid" : "invalid")}</b>
                      <span>{t("minimumImagingThreshold")}</span>
                      <b>
                        {c.camera_model_snapshot?.minimum_marker_pixels} ×{" "}
                        {c.camera_model_snapshot?.minimum_marker_pixels} px
                      </b>
                      <span>{t("distance")}</span>
                      <b>{fmt(obs.distance)} m</b>
                      <span>{t("pixelSize")}</span>
                      <b>{fmt(obs.pixels)} px</b>
                      <span>{t("minimumDiameter")}</span>
                      <b>{fmt(obs.minimumDiameter, 1)} mm</b>
                      <span>{t("pixelPosition")}</span>
                      <b>
                        {fmt(obs.u, 0)}, {fmt(obs.v, 0)}
                      </b>
                      <span>{t("imageMargin")}</span>
                      <b>{fmt(obs.margin, 1)} px</b>
                    </div>
                    {obs.occluderId && (
                      <button
                        className="text-button"
                        onClick={() =>
                          st.set({
                            selected: [obs.occluderId!],
                            focusTick: st.focusTick + 1,
                          })
                        }
                      >
                        <Focus size={13} />
                        {s.objects.find((o) => o.id === obs.occluderId)?.name}
                      </button>
                    )}
                    <CameraPreview cameraId={c.id} eye={obs.eye} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
export function Issues() {
  const st = useStore(),
    t = useT(),
    s = activeScheme(st),
    result = st.result;
  const threshold = coverageSettings(s.settings).coverageThreshold;
  const issues = useMemo(
    () => (result ? coverageIssues(result, threshold) : []),
    [result, threshold],
  );
  if (!result || result.schemeId !== s.id || result.revision !== s.revision) return null;
  return (
    <div className="issues-section">
      <div className="section-label">
        <span>
          <AlertTriangle size={14} />
          {t("issues")}
        </span>
        <span>{issues.length}</span>
      </div>
      {issues.map((issue) => (
        <button
          key={issue.type}
          className="issue-row"
          onClick={() =>
            st.set({
              mode: "analysis",
              point: issue.position,
              clip: issue.position[2],
              selected: [],
              layer: issue.type === "accuracy" ? "accuracy" : "coverage",
            })
          }
        >
          <span className={"issue-indicator " + issue.type} />
          <span>
            {t("issue_" + issue.type)}
            {issue.type === "requirement" && (
              <small>
                {" "}
                ≥{threshold} · {t("affectedVolume")}{" "}
                {fmt((issue.count / Math.max(1, result.validVoxels)) * 100, 1)}%
              </small>
            )}
          </span>
          <b>{issue.count.toLocaleString()}</b>
        </button>
      ))}
      {!issues.length && <p className="muted small">{t("noIssues")}</p>}
      <p className="tiny muted">{t("issueHint")}</p>
    </div>
  );
}
