import { useState } from "react";
import { Check, FileText, Printer } from "lucide-react";
import { activeScheme, useStore } from "../store";
import { translate, useT } from "../i18n";
import { fmt } from "./Common";
import type { CameraEye, Language } from "../models";
import { viewCount } from "../simulation/engine";
import { ReportCameraImage } from "./CameraImage";
export interface ReportImage {
  manual?: boolean;
  data: string;
  view: string;
  layer: string;
  revision: number;
  schemeId: string;
  clip: number;
}
export function Report({ images, onRun }: { images: ReportImage[]; onRun: () => void }) {
  const st = useStore(),
    ui = useT(),
    s = activeScheme(st),
    r = st.result;
  const [lang, setLang] = useState<Language>(st.lang),
    [sections, setSections] = useState([
      "views",
      "cameraViews",
      "issues",
      "method",
      "deployment",
    ]);
  const t = (k: string) => translate(lang, k);
  const current = !!r && r.schemeId === s.id && r.revision === s.revision;
  const cameras = s.objects.filter((o) => o.kind === "camera"),
    models = [
      ...new Map(
        cameras.map((c) => [
          JSON.stringify(c.camera_model_snapshot),
          c.camera_model_snapshot!,
        ]),
      ).values(),
    ];
  return (
    <div className="report-workspace">
      <div className="report-toolbar">
        <div>
          <h2>
            <FileText size={22} />
            {ui("report")}
          </h2>
          <p>{ui("reportSubtitle")}</p>
        </div>
        <div className="button-row">
          <select
            aria-label={ui("reportLanguage")}
            value={lang}
            onChange={(e) => setLang(e.target.value as Language)}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
          <button className="primary" disabled={!current} onClick={() => window.print()}>
            <Printer size={16} />
            {ui("printPDF")}
          </button>
        </div>
      </div>
      {!current ? (
        <div className="report-empty">
          <FileText size={40} />
          <h3>{ui("reportNeedsAnalysis")}</h3>
          <button className="primary" onClick={onRun}>
            {ui("run")}
          </button>
        </div>
      ) : (
        <div className="report-layout">
          <aside className="report-options">
            <h4>{ui("reportSections")}</h4>
            {["views", "cameraViews", "issues", "method", "deployment"].map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={sections.includes(k)}
                  onChange={(e) =>
                    setSections(
                      e.target.checked
                        ? [...sections, k]
                        : sections.filter((s) => s !== k),
                    )
                  }
                />
                {ui(
                  {
                    views: "reportViews",
                    cameraViews: "reportCameraViews",
                    issues: "issues",
                    method: "method",
                    deployment: "deploymentList",
                  }[k]!,
                )}
              </label>
            ))}
            <div className="notice small">
              <Check size={15} />
              {ui("reportFresh")}
            </div>
            <p className="muted small">{ui("pdfHint")}</p>
          </aside>
          <article className="report-paper" lang={lang === "zh" ? "zh-CN" : "en"}>
            <div className="report-brand">
              SCENELAB <span>TECHNICAL REPORT / 01</span>
            </div>
            <div className="report-title">
              <span className="eyebrow">
                {t("scheme")} {s.name} · {s.boundary.join(" × ")} m
              </span>
              <h1>{st.project.name}</h1>
              <h2>{t("reportTitle")}</h2>
              <p>
                {t("generated")} ·{" "}
                {new Date(r!.timestamp).toLocaleString(lang === "zh" ? "zh-CN" : "en-US")}
              </p>
            </div>
            <div className="report-kpis">
              {[
                [t("cameraCount"), String(cameras.filter((c) => c.enabled).length)],
                [t("coverage3"), fmt(r!.coverage[2], 1) + "%"],
                [t("meanError"), fmt(r!.meanError) + " mm"],
                [t("p95"), fmt(r!.p95) + " mm"],
              ].map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            <section>
              <h3>01 / {t("reportOverview")}</h3>
              <div className="report-specs">
                <span>{t("boundary")}</span>
                <b>{s.boundary.join(" × ")} m</b>
                <span>{t("markerDiameter")}</span>
                <b>{s.settings.markerDiameter} mm</b>
                <span>{t("voxel")}</span>
                <b>{s.settings.voxel} m</b>
                <span>{t("threshold")}</span>
                <b>{s.settings.errorThreshold} mm</b>
                <span>{t("validVoxels")}</span>
                <b>{r!.validVoxels.toLocaleString()}</b>
                <span>{t("excludedVoxels")}</span>
                <b>{r!.excludedVoxels.toLocaleString()}</b>
                <span>{t("invalidAccuracy")}</span>
                <b>{r!.invalidAccuracy.toLocaleString()}</b>
                <span>{t("elapsed")}</span>
                <b>{fmt(r!.elapsed / 1000, 2)} s</b>
              </div>
            </section>
            <section>
              <h3>
                02 / {t("coverage")} & {t("accuracy")}
              </h3>
              {models.some((m) => m.stereo) && (
                <p className="report-note">
                  {t("stereoCountNote")} {t("stereoAssumptions")}
                </p>
              )}
              <div className="report-charts">
                <div>
                  {r!.coverage.map((v, i) => (
                    <div className="coverage-bar" key={i}>
                      <span>
                        ≥{i + 1} {t("viewpoints")}
                      </span>
                      <div>
                        <i style={{ width: v + "%" }} />
                      </div>
                      <b>{fmt(v, 1)}%</b>
                    </div>
                  ))}
                </div>
                <div className="report-specs">
                  <span>{t("averageCount")}</span>
                  <b>{fmt(r!.averageCount)}</b>
                  <span>{t("meanError")}</span>
                  <b>{fmt(r!.meanError)} mm</b>
                  <span>P90</span>
                  <b>{fmt(r!.p90)} mm</b>
                  <span>P95</span>
                  <b>{fmt(r!.p95)} mm</b>
                  <span>{t("errorRate03")}</span>
                  <b>{fmt(r!.under03, 1)}%</b>
                  <span>{t("errorRate05")}</span>
                  <b>{fmt(r!.under05, 1)}%</b>
                </div>
              </div>
              <p className="report-note">{t("statisticsNote")}</p>
            </section>
            {sections.includes("views") && (
              <section>
                <h3>03 / {t("reportViews")}</h3>
                {images
                  .filter((i) => i.schemeId === s.id && i.revision === s.revision)
                  .map((img, i) => (
                    <figure key={i}>
                      <img src={img.data} alt={`${t(img.view)} · ${t(img.layer)}`} />
                      <figcaption>
                        {String(i + 1).padStart(2, "0")} · {t(img.view)} /{" "}
                        {t(img.layer === "none" ? "normal" : img.layer)} · Z ≤{" "}
                        {img.clip.toFixed(1)} m
                      </figcaption>
                      {img.layer !== "none" && (
                        <div className="report-legend">
                          <span>
                            {t(
                              img.layer === "coverage"
                                ? "legendCoverage"
                                : "legendAccuracy",
                            )}
                          </span>
                          <i className={"gradient " + img.layer} />
                          <span>
                            {img.layer === "coverage"
                              ? `0 → ${Math.max(5, viewCount(s))}`
                              : `0 → ${s.settings.errorThreshold * 2} mm`}
                          </span>
                        </div>
                      )}
                    </figure>
                  ))}
              </section>
            )}
            <section>
              <h3>04 / {t("configuration")}</h3>
              {models.map((m, i) => (
                <div className="report-model" key={i}>
                  <h4>
                    {m.manufacturer} / {m.model_name} <small>{t(m.source)}</small>
                  </h4>
                  <table>
                    <tbody>
                      <tr>
                        <th>{t("resolution")}</th>
                        <td>
                          {m.resolution_width} × {m.resolution_height}
                        </td>
                        <th>
                          {t("hfov")} / {t("vfov")}
                        </th>
                        <td>
                          {fmt(m.hfov_deg, 1)}° / {fmt(m.vfov_deg, 1)}°
                        </td>
                      </tr>
                      <tr>
                        <th>fx / fy</th>
                        <td>
                          {fmt(m.fx, 1)} / {fmt(m.fy, 1)}
                        </td>
                        <th>cx / cy</th>
                        <td>
                          {fmt(m.cx, 1)} / {fmt(m.cy, 1)}
                        </td>
                      </tr>
                      <tr>
                        <th>{t("distance")}</th>
                        <td>
                          {m.max_working_distance_m === null
                            ? t("unlimitedRange")
                            : `${m.min_working_distance_m}–${m.max_working_distance_m} m`}
                        </td>
                        <th>{t("focalLength")}</th>
                        <td>{m.focal_length_mm} mm</td>
                      </tr>
                      <tr>
                        <th>{t("minPixels")}</th>
                        <td>{m.minimum_marker_pixels} px</td>
                        <th>{t("pixelError")}</th>
                        <td>{m.default_pixel_localization_error_px} px</td>
                      </tr>
                      {m.stereo && (
                        <tr>
                          <th>{t("baseline")}</th>
                          <td>{m.stereo.baseline_mm} mm</td>
                          <th>{t("stereoViews")}</th>
                          <td>
                            {t("leftEye")} / {t("rightEye")}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <th>{t("distortion")}</th>
                        <td colSpan={3}>
                          {t(m.distortion_model)} · {m.distortion_parameters.join(", ")}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {m.notes && <p className="report-note">{m.notes}</p>}
                </div>
              ))}
            </section>
            {sections.includes("cameraViews") && (
              <section className="report-camera-section">
                <h3>05 / {t("reportCameraViews")}</h3>
                <p className="report-note">{t("cameraPreviewNote")}</p>
                {cameras.flatMap((c) =>
                  (
                    (c.camera_model_snapshot?.stereo
                      ? ["left", "right"]
                      : [undefined]) as (CameraEye | undefined)[]
                  ).map((eye) => (
                    <ReportCameraImage
                      key={`${c.id}:${eye ?? "mono"}`}
                      scheme={s}
                      cameraId={c.id}
                      lang={lang}
                      eye={eye}
                    />
                  )),
                )}
              </section>
            )}
            {sections.includes("issues") && (
              <section>
                <h3>06 / {t("issues")}</h3>
                <table>
                  <thead>
                    <tr>
                      <th>{t("issues")}</th>
                      <th>{t("points")}</th>
                      <th>XYZ / m</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r!.issues.map((i) => (
                      <tr key={i.type}>
                        <td>{t("issue_" + i.type)}</td>
                        <td>{i.count.toLocaleString()}</td>
                        <td>{i.position.map((v) => fmt(v, 2)).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="report-note">{t("issueHint")}</p>
              </section>
            )}
            {sections.includes("method") && (
              <section>
                <h3>07 / {t("method")}</h3>
                <p>{t("methodText")}</p>
                <div className="formula">
                  Cₖ = |&#123;P ∈ Vvalid : N(P) ≥ k&#125;| / |Vvalid| × 100%
                  <br />
                  Σₚ = (Σᵢ Jᵢᵀ Wᵢ Jᵢ)⁻¹　·　σ₃D = √trace(Σₚ)
                </div>
                <p className="report-note">{t("distortionSizeNote")}</p>
              </section>
            )}
            {sections.includes("deployment") && (
              <section>
                <h3>08 / {t("deploymentList")}</h3>
                <table>
                  <thead>
                    <tr>
                      <th>{t("camera")}</th>
                      <th>{t("modelName")}</th>
                      <th>XYZ / m</th>
                      <th>Yaw / Pitch / Roll</th>
                      <th>{t("enable")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cameras.map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>{c.camera_model_snapshot?.model_name}</td>
                        <td>{c.position.map((v) => fmt(v, 2)).join(" / ")}</td>
                        <td>{c.rotation.map((v) => fmt(v, 1)).join(" / ")}</td>
                        <td>{t(c.enabled ? "enable" : "off")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            <div className="report-disclaimer">{t("reportDisclaimer")}</div>
            <footer>
              SCENELAB v1.2{" "}
              <span>
                {st.project.name} / {t("scheme")} {s.name}
              </span>
            </footer>
          </article>
        </div>
      )}
    </div>
  );
}
