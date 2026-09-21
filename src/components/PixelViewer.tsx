import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus } from "lucide-react";
import { useT } from "../i18n";
import { drawCameraImage, zoomImageAt, type CameraImage } from "../simulation/imaging";
import { fmt, Modal } from "./Common";

export function PixelViewer({
  scene,
  onClose,
}: {
  scene: CameraImage;
  onClose: () => void;
}) {
  const t = useT();
  const [guides, setGuides] = useState(true),
    [grid, setGrid] = useState(true);
  const image = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = scene.model.resolution_width;
    canvas.height = scene.model.resolution_height;
    const ctx = canvas.getContext("2d");
    if (ctx) drawCameraImage(ctx, scene, guides);
    return canvas;
  }, [scene, guides]);
  const canvasRef = useRef<HTMLCanvasElement>(null),
    host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 700, height: 440 });
  const [view, setView] = useState({ x: 0, y: 0, zoom: 0.5 });
  const [selected, setSelected] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(
    null,
  );
  const fit = () => {
    const zoom =
      Math.min(
        size.width / scene.model.resolution_width,
        size.height / scene.model.resolution_height,
      ) * 0.94;
    setView({
      zoom,
      x: (size.width - scene.model.resolution_width * zoom) / 2,
      y: (size.height - scene.model.resolution_height * zoom) / 2,
    });
  };
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(fit, [
    size.width,
    size.height,
    scene.model.resolution_width,
    scene.model.resolution_height,
  ]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#090e12";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.imageSmoothingEnabled = false;
    const { x, y, zoom } = view;
    const width = scene.model.resolution_width,
      height = scene.model.resolution_height;
    ctx.drawImage(image, x, y, width * zoom, height * zoom);
    if (grid && zoom >= 8) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, width * zoom, height * zoom);
      ctx.clip();
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = "#8da1b155";
      ctx.beginPath();
      for (
        let u = Math.max(0, Math.ceil(-x / zoom));
        u <= Math.min(width, (size.width - x) / zoom);
        u++
      ) {
        ctx.moveTo(x + u * zoom, 0);
        ctx.lineTo(x + u * zoom, size.height);
      }
      for (
        let v = Math.max(0, Math.ceil(-y / zoom));
        v <= Math.min(height, (size.height - y) / zoom);
        v++
      ) {
        ctx.moveTo(0, y + v * zoom);
        ctx.lineTo(size.width, y + v * zoom);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, [image, size, view, grid, scene]);
  const zoomTo = (zoom: number) =>
    setView((v) =>
      zoomImageAt(v, Math.max(0.01, Math.min(64, zoom)), {
        x: size.width / 2,
        y: size.height / 2,
      }),
    );
  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      setView((v) =>
        zoomImageAt(
          v,
          Math.max(0.01, Math.min(64, v.zoom * Math.exp(-e.deltaY * 0.002))),
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
        ),
      );
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);
  const point = scene.points.find((p) => p.id === selected);
  return createPortal(
    <Modal
      title={`${scene.camera.name}${scene.eye ? ` · ${t(scene.eye + "Eye")}` : ""} · ${t("pixelPreview")}`}
      subtitle={`${scene.model.resolution_width} × ${scene.model.resolution_height} px · ${t("pixelPreviewHint")}`}
      wide
      onClose={onClose}
    >
      <div className="pixel-preview">
        <div className="pixel-toolbar">
          <button onClick={fit}>{t("fitImage")}</button>
          <button onClick={() => zoomTo(view.zoom / 2)} aria-label={t("zoomOut")}>
            <Minus size={14} />
          </button>
          {[1, 4, 16, 64].map((zoom) => (
            <button
              key={zoom}
              className={Math.abs(view.zoom - zoom) < 0.001 ? "active" : ""}
              onClick={() => zoomTo(zoom)}
            >
              {zoom === 1 ? "1:1" : `${zoom}×`}
            </button>
          ))}
          <button onClick={() => zoomTo(view.zoom * 2)} aria-label={t("zoomIn")}>
            <Plus size={14} />
          </button>
          <span>{Math.round(view.zoom * 100)}%</span>
          <label>
            <input
              type="checkbox"
              checked={grid}
              onChange={(e) => setGrid(e.target.checked)}
            />
            {t("pixelGrid")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={guides}
              onChange={(e) => setGuides(e.target.checked)}
            />
            {t("imageGuides")}
          </label>
        </div>
        <div className="pixel-layout">
          <div ref={host} className="pixel-canvas-host">
            <canvas
              ref={canvasRef}
              aria-label={t("pixelPreview")}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  originX: view.x,
                  originY: view.y,
                };
              }}
              onPointerMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setCursor({
                  x: Math.floor((e.clientX - rect.left - view.x) / view.zoom),
                  y: Math.floor((e.clientY - rect.top - view.y) / view.zoom),
                });
                if (drag.current) {
                  const d = drag.current;
                  setView((v) => ({
                    ...v,
                    x: d.originX + e.clientX - d.x,
                    y: d.originY + e.clientY - d.y,
                  }));
                }
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
            />
          </div>
          <aside className="pixel-marker-list">
            <h4>{t("locateMarker")}</h4>
            {scene.points.map((p) => (
              <button
                key={p.id}
                className={selected === p.id ? "active" : ""}
                disabled={
                  p.reasons.includes("behind") ||
                  !Number.isFinite(p.u) ||
                  !Number.isFinite(p.v)
                }
                onClick={() => {
                  setSelected(p.id);
                  setView({
                    zoom: 16,
                    x: size.width / 2 - p.u * 16,
                    y: size.height / 2 - p.v * 16,
                  });
                }}
              >
                <strong>{p.name}</strong>
                <span>
                  {fmt(p.width)} × {fmt(p.height)} px
                </span>
                <small>{p.valid ? t("valid") : p.reasons.map(t).join(" / ")}</small>
              </button>
            ))}
            {!scene.points.length && <p>{t("noSceneMarkers")}</p>}
          </aside>
        </div>
        <div className="pixel-readout">
          <span>
            {cursor &&
            cursor.x >= 0 &&
            cursor.y >= 0 &&
            cursor.x < scene.model.resolution_width &&
            cursor.y < scene.model.resolution_height
              ? `u ${cursor.x} · v ${cursor.y}`
              : "u — · v —"}
          </span>
          <span>
            {point
              ? `${point.name} · ${fmt(point.diameter, 1)} mm · ${fmt(point.width)} × ${fmt(point.height)} px`
              : t("pixelGridHint")}
          </span>
        </div>
        <p className="muted tiny">{t("pixelSimulationNote")}</p>
      </div>
    </Modal>,
    document.body,
  );
}
