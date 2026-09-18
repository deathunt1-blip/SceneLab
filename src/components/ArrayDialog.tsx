import { useState } from "react";
import { Circle, Grid2X2, Minus, RectangleHorizontal } from "lucide-react";
import { useStore, activeScheme } from "../store";
import { useT } from "../i18n";
import { cameraArray, makeCamera, type ArrayType } from "../project/data";
import { Modal, Field, Num } from "./Common";
import type { Vec3 } from "../models";
import { uid } from "../models";
import { add, rotate } from "../simulation/math";
export function ArrayDialog() {
  const st = useStore(),
    t = useT(),
    s = activeScheme(st);
  const truss = s.objects.find(
    (o) => st.selected.includes(o.id) && o.kind === "truss",
  );
  const [type, setType] = useState<ArrayType | "truss">(
      truss ? "truss" : "rectangle",
    ),
    [model, setModel] = useState(st.models[0]?.id || ""),
    [count, setCount] = useState(16),
    [radius, setRadius] = useState(Math.min(s.boundary[0], s.boundary[1]) / 2),
    [height, setHeight] = useState(Math.min(3.6, s.boundary[2])),
    [target, setTarget] = useState<Vec3>([0, 0, 1.5]),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(360);
  return (
    <Modal
      title={t("arrayTitle")}
      subtitle={t("arraySubtitle")}
      onClose={() => st.set({ arrayOpen: false })}
    >
      <div className="modal-body">
        <Field label={t("selectModel")}>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {st.models.map((m) => (
              <option value={m.id} key={m.id}>
                {m.manufacturer} / {m.model_name}
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
              value={count}
              step={1}
              min={1}
              max={200}
              onChange={(n) => setCount(Math.round(n))}
            />
          </Field>
          {type !== "truss" && (
            <>
              <Field label={t("radius")}>
                <Num value={radius} min={0.1} onChange={setRadius} unit="m" />
              </Field>
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
          <button onClick={() => st.set({ arrayOpen: false })}>
            {t("cancel")}
          </button>
          <button
            className="primary"
            disabled={!model}
            onClick={() => {
              const m = st.models.find((m) => m.id === model)!;
              const offset = s.objects.filter(
                  (o) => o.kind === "camera",
                ).length,
                group = uid();
              const cameras =
                type === "truss" && truss
                  ? Array.from({ length: count }, (_, i) => {
                      const axis = truss.size[0] >= truss.size[1] ? 0 : 1;
                      const local: Vec3 = [0, 0, 0];
                      local[axis] =
                        count === 1
                          ? 0
                          : (i / (count - 1) - 0.5) * truss.size[axis];
                      return {
                        ...makeCamera(
                          m,
                          add(truss.position, rotate(local, truss.rotation)),
                          target,
                          offset + i + 1,
                        ),
                        group,
                        mount: truss.id,
                      };
                    })
                  : cameraArray(
                      m,
                      type as ArrayType,
                      count,
                      radius,
                      height,
                      target,
                      s.objects.filter((o) => o.kind === "camera").length,
                      start,
                      end,
                    );
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
            {t("deploy")} · {count}
          </button>
        </div>
      </div>
    </Modal>
  );
}
