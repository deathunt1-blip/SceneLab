import { ArrayPreview } from "./ArrayPreview";
import {
  rectanglePerimeterPoints,
  gridPoints,
  gridDimensions,
  linearPoints,
  circlePoints,
} from "../project/arrayLayout";
import { useState } from "react";
import { Circle, Grid2X2, Minus, RectangleHorizontal } from "lucide-react";
import { useStore, activeScheme } from "../store";
import { useT } from "../i18n";
import { makeCamera, type ArrayType } from "../project/data";
import { Modal, Field, Num } from "./Common";
import type { Vec3 } from "../models";
import { uid } from "../models";
import { isBeam, beamArrayPoint } from "../project/structures";
export function ArrayDialog() {
  const st = useStore(),
    t = useT(),
    s = activeScheme(st);
  const truss = s.objects.find(
    (o) => st.selected.includes(o.id) && isBeam(o) && o.visible && o.enabled,
  );
  const [type, setType] = useState<ArrayType | "truss">(truss ? "truss" : "rectangle"),
    [model, setModel] = useState(st.models[0]?.id || ""),
    [count, setCount] = useState(16),
    [radius, setRadius] = useState(Math.min(s.boundary[0], s.boundary[1]) / 2),
    [length, setLength] = useState(s.boundary[0]),
    [width, setWidth] = useState(s.boundary[1]),
    [manualGrid, setManualGrid] = useState(false),
    [rows, setRows] = useState(4),
    [cols, setCols] = useState(4),
    [height, setHeight] = useState(Math.min(3.6, s.boundary[2])),
    [target, setTarget] = useState<Vec3>([0, 0, 1.5]),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(360);
  const actualCount = type === "grid" && manualGrid ? rows * cols : count;
  const points =
    type === "rectangle"
      ? rectanglePerimeterPoints(actualCount, length, width, height)
      : type === "grid"
        ? gridPoints(
            actualCount,
            length,
            width,
            height,
            manualGrid ? rows : undefined,
            manualGrid ? cols : undefined,
          )
        : type === "linear"
          ? linearPoints(actualCount, length, height)
          : type === "circle"
            ? circlePoints(actualCount, radius, height, start, end)
            : truss
              ? Array.from({ length: actualCount }, (_, i) =>
                  beamArrayPoint(truss, i, actualCount),
                )
              : [];
  const dims = gridDimensions(actualCount, length, width);
  return (
    <Modal
      wide
      title={t("arrayTitle")}
      subtitle={t("arraySubtitle")}
      onClose={() => st.set({ arrayOpen: false })}
    >
      <div className="modal-body array-dialog-layout">
        <div>
          <Field label={t("selectModel")}>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {st.models.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.manufacturer} / {m.display_name}
                </option>
              ))}
            </select>
          </Field>
          <div className="array-types">
            {(
              [
                ["rectangle", RectangleHorizontal],
                ["circle", Circle],
                ["linear", Minus],
                ["grid", Grid2X2],
              ] as const
            ).map(([key, Icon]) => (
              <button
                className={type === key ? "active" : ""}
                key={key}
                onClick={() => setType(key)}
              >
                <Icon size={23} />
                {t(key)}
              </button>
            ))}
          </div>
          <button
            className={"full " + (type === "truss" ? "active" : "")}
            disabled={!truss}
            title={truss?.name || t("needsTruss")}
            onClick={() => setType("truss")}
          >
            {t("trussArray")}
            {truss ? ` · ${truss.name}` : ""}
          </button>
          <div className="form-grid">
            <Field label={t("count")}>
              <Num
                value={actualCount}
                disabled={type === "grid" && manualGrid}
                step={1}
                min={1}
                max={200}
                onChange={(n) => setCount(Math.round(n))}
              />
            </Field>
            {type !== "truss" && (
              <>
                {type === "circle" ? (
                  <Field label={t("radius")}>
                    <Num
                      value={radius}
                      min={0.1}
                      max={500}
                      onChange={setRadius}
                      unit="m"
                    />
                  </Field>
                ) : (
                  <Field label={t("arrayLength")}>
                    <Num
                      aria-label={t("arrayLength")}
                      value={length}
                      min={0.1}
                      max={1000}
                      onChange={setLength}
                      unit="m"
                    />
                  </Field>
                )}
                {["rectangle", "grid"].includes(type) && (
                  <Field label={t("arrayWidth")}>
                    <Num
                      aria-label={t("arrayWidth")}
                      value={width}
                      min={0.1}
                      max={1000}
                      onChange={setWidth}
                      unit="m"
                    />
                  </Field>
                )}
                <Field label={t("height")}>
                  <Num value={height} onChange={setHeight} unit="m" />
                </Field>
              </>
            )}
            {type === "circle" && (
              <>
                <Field label={t("startAngle")}>
                  <Num value={start} onChange={setStart} unit="°" />
                </Field>
                <Field label={t("endAngle")}>
                  <Num value={end} onChange={setEnd} unit="°" />
                </Field>
              </>
            )}
          </div>
          {type === "grid" && (
            <>
              <Field label={t("gridMode")}>
                <select
                  value={manualGrid ? "manual" : "auto"}
                  onChange={(e) => setManualGrid(e.target.value === "manual")}
                >
                  <option value="auto">
                    {t("gridAuto")} · {dims.rows} × {dims.cols}
                  </option>
                  <option value="manual">{t("gridManual")}</option>
                </select>
              </Field>
              {manualGrid && (
                <>
                  <div className="form-grid">
                    <Field label={t("gridRows")}>
                      <Num
                        value={rows}
                        min={1}
                        max={Math.floor(200 / cols)}
                        step={1}
                        onChange={(n) => setRows(Math.round(n))}
                      />
                    </Field>
                    <Field label={t("gridCols")}>
                      <Num
                        value={cols}
                        min={1}
                        max={Math.floor(200 / rows)}
                        step={1}
                        onChange={(n) => setCols(Math.round(n))}
                      />
                    </Field>
                  </div>
                  <p className="tiny muted">{t("gridManualHint")}</p>
                </>
              )}
            </>
          )}
          <Field label={t("target")}>
            <div className="xyz-inputs">
              {target.map((v, i) => (
                <Num
                  key={i}
                  value={v}
                  unit={["X", "Y", "Z"][i]}
                  onChange={(n) =>
                    setTarget(target.map((v, j) => (i === j ? n : v)) as Vec3)
                  }
                />
              ))}
            </div>
          </Field>
          <div className="modal-actions">
            <button onClick={() => st.set({ arrayOpen: false })}>{t("cancel")}</button>
            <button
              className="primary"
              disabled={!model}
              onClick={() => {
                const m = st.models.find((m) => m.id === model)!;
                const offset = s.objects.filter((o) => o.kind === "camera").length,
                  group = uid();
                const cameras = points.map((p, i) => ({
                  ...makeCamera(m, p, target, offset + i + 1),
                  group,
                  ...(type === "truss" && truss ? { mount: truss.id } : {}),
                }));
                st.edit((s) => {
                  s.objects.push(...cameras);
                });
                st.set({
                  selected: cameras.map((c) => c.id),
                  arrayOpen: false,
                  toast: "deploySuccess",
                });
              }}
            >
              {t("deploy")} · {actualCount}
            </button>
          </div>
        </div>
        <ArrayPreview
          points={points}
          length={
            type === "circle"
              ? radius * 2
              : type === "truss"
                ? Math.max(1, ...points.map((p) => Math.abs(p[0]) * 2))
                : length
          }
          width={
            type === "circle"
              ? radius * 2
              : type === "linear"
                ? 0.1
                : type === "truss"
                  ? Math.max(1, ...points.map((p) => Math.abs(p[1]) * 2))
                  : width
          }
          target={target}
          rectangle={type === "rectangle"}
          onSize={
            ["rectangle", "grid", "linear"].includes(type)
              ? (axis, value) =>
                  axis === 0 ? setLength(value) : type !== "linear" && setWidth(value)
              : undefined
          }
          onTarget={setTarget}
        />
      </div>
    </Modal>
  );
}
