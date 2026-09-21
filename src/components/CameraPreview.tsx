import { useMemo, useState } from "react";
import { Expand } from "lucide-react";
import { activeScheme, useStore } from "../store";
import { useT } from "../i18n";
import { cameraImage } from "../simulation/imaging";
import { CameraDiagram } from "./CameraImage";
import { PixelViewer } from "./PixelViewer";
import type { CameraEye } from "../models";

export function CameraPreview({ cameraId, eye }: { cameraId: string; eye?: CameraEye }) {
  const st = useStore(),
    t = useT(),
    s = activeScheme(st);
  const [expanded, setExpanded] = useState(false);
  const [selectedEye, setSelectedEye] = useState<CameraEye>("left");
  const activeEye = eye ?? selectedEye;
  const scene = useMemo(
    () => cameraImage(s, cameraId, activeEye),
    [s, cameraId, activeEye],
  );
  if (!scene) return <div className="muted">{t("previewHint")}</div>;
  const m = scene.model;
  return (
    <>
      {m.stereo && !eye && (
        <div className="segmented" aria-label={t("stereoViews")}>
          {(["left", "right"] as const).map((side) => (
            <button
              key={side}
              className={activeEye === side ? "active" : ""}
              onClick={() => {
                setSelectedEye(side);
                setExpanded(false);
              }}
            >
              {t(side + "Eye")}
            </button>
          ))}
        </div>
      )}
      <div className="camera-preview">
        <div className="preview-meta">
          <span>
            {scene.camera.name}
            {scene.eye ? ` · ${t(scene.eye + "Eye")}` : ""}
          </span>
          <span>
            {m.resolution_width} × {m.resolution_height}
          </span>
        </div>
        <button
          className="preview-open"
          onClick={() => setExpanded(true)}
          aria-label={t("expandPreview")}
        >
          <CameraDiagram scene={scene} label={t("preview")} />
        </button>
        <span className="preview-caption">
          {m.model_name} · {m.hfov_deg.toFixed(0)}° × {m.vfov_deg.toFixed(0)}°
        </span>
      </div>
      <button className="full" onClick={() => setExpanded(true)}>
        <Expand size={14} />
        {t("expandPreview")}
      </button>
      <p className="muted tiny">{t("cameraPreviewNote")}</p>
      {expanded && <PixelViewer scene={scene} onClose={() => setExpanded(false)} />}
    </>
  );
}
