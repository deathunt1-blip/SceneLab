import { useId, useMemo } from "react";
import type { Language, Scheme } from "../models";
import { translate } from "../i18n";
import { cameraImage, type CameraImage } from "../simulation/imaging";
import { fmt } from "./Common";

/** Readable overview symbols are intentionally larger than the sensor image. */
export function CameraDiagram({ scene, label }: { scene: CameraImage; label: string }) {
  const clip = useId().replace(/:/g, "");
  const m = scene.model;
  return (
    <svg
      viewBox={`0 0 ${m.resolution_width} ${m.resolution_height}`}
      aria-label={label}
      role="img"
    >
      <defs>
        <clipPath id={clip}>
          <rect width={m.resolution_width} height={m.resolution_height} />
        </clipPath>
      </defs>
      <rect width={m.resolution_width} height={m.resolution_height} fill="#17262b" />
      <g clipPath={`url(#${clip})`}>
        {scene.projected.map((l, i) => (
          <line
            key={i}
            x1={l.a.u}
            y1={l.a.v}
            x2={l.b.u}
            y2={l.b.v}
            stroke={l.color}
            strokeWidth={8}
          />
        ))}
        <path
          d={`M ${m.cx - 70} ${m.cy} H ${m.cx + 70} M ${m.cx} ${m.cy - 70} V ${m.cy + 70}`}
          stroke="#4a7373"
          strokeWidth={6}
        />
        {scene.points
          .filter((p) => !p.reasons.includes("behind"))
          .map((p) => (
            <g key={p.id}>
              <circle
                cx={p.u}
                cy={p.v}
                r={Math.max(22, p.pixels / 2)}
                fill={p.valid ? "#4ce1b5" : "#ec8973"}
              />
              <text x={p.u + 38} y={p.v - 35} fill="#c0d5d7" fontSize={100}>
                {p.name}
              </text>
            </g>
          ))}
      </g>
    </svg>
  );
}

export function ReportCameraImage({
  scheme,
  cameraId,
  lang,
}: {
  scheme: Scheme;
  cameraId: string;
  lang: Language;
}) {
  const scene = useMemo(() => cameraImage(scheme, cameraId), [scheme, cameraId]);
  const t = (key: string) => translate(lang, key);
  if (!scene) return <p>{t("previewHint")}</p>;
  return (
    <div className="report-camera-image">
      <figure>
        <CameraDiagram scene={scene} label={`${scene.camera.name} · ${t("preview")}`} />
        <figcaption>
          <strong>{scene.camera.name}</strong> · {scene.model.model_name} ·{" "}
          {scene.model.resolution_width} × {scene.model.resolution_height} px ·{" "}
          {t(scene.camera.enabled ? "enable" : "off")}
        </figcaption>
      </figure>
      <table>
        <thead>
          <tr>
            <th>Marker</th>
            <th>{t("diameter")} / mm</th>
            <th>u / v (px)</th>
            <th>{t("imageDiameter")} (px)</th>
            <th>{t("observationStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {scene.points.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{fmt(p.diameter, 1)}</td>
              <td>
                {p.reasons.includes("behind") ? "—" : `${fmt(p.u, 1)} / ${fmt(p.v, 1)}`}
              </td>
              <td>
                {fmt(p.width)} × {fmt(p.height)}
              </td>
              <td>{p.valid ? t("valid") : p.reasons.map(t).join(" / ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!scene.points.length && <p className="report-note">{t("noSceneMarkers")}</p>}
    </div>
  );
}
