import { useEffect, useMemo, useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { Modal } from "../components/Common";
import { activeScheme, useStore } from "../store";
import { useT } from "../i18n";
import { exportImages } from "./exportImages";
import { assertCurrentAnalysis, ReportPackageError } from "./validation";
import type { ReportImage } from "./types";

export function ReportPackageButton({
  images,
  onRefresh,
}: {
  images: ReportImage[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false),
    t = useT();
  return (
    <>
      <button onClick={() => setOpen(true)}>
        <Download size={16} />
        {t("exportReportPackage")}
      </button>
      {open && (
        <ReportPackageDialog
          images={images}
          onRefresh={onRefresh}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
function ReportPackageDialog({
  images,
  onRefresh,
  onClose,
}: {
  images: ReportImage[];
  onRefresh: () => void;
  onClose: () => void;
}) {
  const st = useStore(),
    t = useT(),
    scheme = activeScheme(st);
  const [cameraViews, setCameraViews] = useState(false),
    [diagnostics, setDiagnostics] = useState(false);
  const [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const validation = useMemo(() => {
    try {
      assertCurrentAnalysis(scheme, st.result);
      exportImages(images, scheme, st.result);
      return "";
    } catch (e) {
      return e instanceof ReportPackageError ? e.code : "packageExportFailed";
    }
  }, [scheme, st.result, images]);
  const busy = progress !== null;
  const start = async () => {
    if (busy || validation || st.progress !== null) return;
    const controller = new AbortController();
    abort.current = controller;
    setError("");
    setDone(false);
    setProgress(0);
    const source = useStore.getState(),
      sourceScheme = activeScheme(source),
      sourceResult = source.result;
    const assertUnchanged = () => {
      const latest = useStore.getState();
      assertCurrentAnalysis(activeScheme(latest), latest.result);
      if (
        latest.project.id !== source.project.id ||
        latest.project.name !== source.project.name ||
        activeScheme(latest) !== sourceScheme ||
        latest.result !== sourceResult
      )
        throw new ReportPackageError("packageStale");
    };
    try {
      const { createPackage } = await import("./createPackage");
      const { bytes, filename } = await createPackage({
        project: source.project,
        result: sourceResult,
        images,
        options: { cameraViews, diagnostics },
        signal: controller.signal,
        assertUnchanged,
        onProgress: setProgress,
      });
      controller.signal.throwIfAborted();
      assertUnchanged();
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setDone(true);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof ReportPackageError ? e.code : "packageExportFailed");
    } finally {
      if (!controller.signal.aborted) setProgress(null);
    }
  };
  const close = () => {
    abort.current?.abort();
    onClose();
  };
  return (
    <Modal
      title={t("exportReportPackage")}
      subtitle={t("packageSubtitle")}
      onClose={close}
    >
      <div className="report-package-dialog">
        <dl>
          <dt>{t("project")}</dt>
          <dd>{st.project.name}</dd>
          <dt>{t("scheme")}</dt>
          <dd>{scheme.name}</dd>
          <dt>Revision</dt>
          <dd>{scheme.revision}</dd>
        </dl>
        {validation ? (
          <p className="notice" role="alert">
            {t(validation)}
          </p>
        ) : (
          <div className="package-ready">
            <p>✓ {t("packageAnalysisValid")}</p>
            <p>
              ✓ {scheme.objects.filter((o) => o.kind === "camera" && o.enabled).length}{" "}
              {t("packageEnabledCameras")}
            </p>
            <p>✓ {t("packageImagesReady")}</p>
          </div>
        )}
        {validation === "packageImagesMissing" && (
          <button
            onClick={() => {
              close();
              onRefresh();
            }}
          >
            {t("packageRefreshImages")}
          </button>
        )}
        <fieldset disabled={busy}>
          <legend>{t("packageExtras")}</legend>
          <label>
            <input
              type="checkbox"
              checked={cameraViews}
              onChange={(e) => setCameraViews(e.target.checked)}
            />
            {t("packageCameraViews")}
          </label>
          <p className="muted small">{t("packageCameraViewsHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={diagnostics}
              onChange={(e) => setDiagnostics(e.target.checked)}
            />
            {t("packageDiagnostics")}
          </label>
          <p className="muted small">{t("packageDiagnosticsHint")}</p>
        </fieldset>
        <p className="muted small">{t("packageContentsHint")}</p>
        {error && (
          <p className="notice" role="alert">
            {t(error)}
          </p>
        )}
        {done && (
          <p className="package-ready" role="status">
            {t("packageExported")}
          </p>
        )}
        {busy && (
          <p role="status">
            <LoaderCircle size={15} className="spin" /> {t("packageExporting")}{" "}
            {Math.round(progress)}%
          </p>
        )}
        <div className="button-row">
          <button onClick={close}>{t(busy ? "cancel" : "closeDialog")}</button>
          <button
            className="primary"
            disabled={busy || !!validation || st.progress !== null}
            onClick={() => void start()}
          >
            <Download size={15} />
            {t("export")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
