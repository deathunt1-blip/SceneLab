import { Box, Camera, Copy, Crosshair, Layers, Link, Scan, Trash2 } from "lucide-react";
import { activeScheme, useStore } from "../store";
import { useT } from "../i18n";
import { Field, Num, Toggle, fmt } from "./Common";
import type { SceneObject, Vec3 } from "../models";
import { uid } from "../models";
import { add, lookAt, mul, sub } from "../simulation/math";
import { CameraPreview } from "./CameraPreview";
import { analyzePoint, rigidTrackability, worldMarkers } from "../simulation/engine";
import { makeObject } from "../project/data";
import { nearestMount } from "../project/structures";
export function Inspector() {
  const st = useStore(),
    t = useT(),
    s = activeScheme(st),
    selected = s.objects
      .filter((o) => st.selected.includes(o.id))
      .map((o) => ({ ...o, ...st.livePose?.[o.id] })),
    o = selected[0];
  const update = (patch: Partial<SceneObject>) => st.updateObjects(st.selected, patch);
  const axis = (key: "position" | "rotation" | "size", i: number, value: number) =>
    st.edit((s) => {
      for (const obj of s.objects)
        if (st.selected.includes(obj.id) && !obj.locked)
          obj[key] = obj[key].map((v, j) => (j === i ? value : v)) as Vec3;
    });
  const transform = (
    key: "position" | "rotation" | "size",
    title: string,
    unit: string,
  ) => (
    <div className="property-section">
      <h4>
        {t(title)} <span>{unit}</span>
      </h4>
      <div className="xyz-inputs">
        {[0, 1, 2].map((i) => (
          <div key={i} className={"axis axis-" + i}>
            <label>
              {key === "rotation"
                ? ["Yaw", "Pitch", "Roll"][i]
                : key === "size" && o.kind === "tube"
                  ? t(["length", "width", "height"][i])
                  : ["X", "Y", "Z"][i]}
              {selected.some((item) => item[key][i] !== o[key][i]) && (
                <small title={t("mixed")}>≠</small>
              )}
            </label>
            <Num
              aria-label={`${t(title)} ${["X", "Y", "Z"][i]}`}
              value={o[key][i]}
              onChange={(v) => axis(key, i, v)}
              step={key === "rotation" ? 1 : 0.1}
              min={key === "size" ? 0.01 : undefined}
              disabled={selected.every((o) => o.locked)}
            />
          </div>
        ))}
      </div>
    </div>
  );
  if (!o)
    return (
      <>
        <div className="panel-heading">
          <h3>
            <Scan size={16} />
            {t("sceneSettings")}
          </h3>
          <span className="badge">m</span>
        </div>
        <div className="inspector-content">
          <div className="volume-card">
            <Box size={27} />
            <div>
              <strong>
                {s.boundary.join(" × ")} <small>m</small>
              </strong>
              <span>{t("boundary")}</span>
            </div>
          </div>
          <div className="form-grid">
            {s.boundary.map((v, i) => (
              <Field key={i} label={t(["length", "width", "height"][i])}>
                <Num
                  value={v}
                  min={0.1}
                  max={1000}
                  unit="m"
                  aria-label={t(["length", "width", "height"][i])}
                  onChange={(n) =>
                    st.edit((s) => {
                      s.boundary[i] = n;
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <p className="muted tiny">{t("boundaryNote")}</p>
          <div className="section-divider" />
          <h4 className="section-title">{t("simulation")}</h4>
          <Field label={t("voxel")}>
            <div className="input-with-options">
              <Num
                value={s.settings.voxel}
                min={0.05}
                max={10}
                step={0.1}
                unit="m"
                onChange={(n) =>
                  st.edit((s) => {
                    s.settings.voxel = n;
                  })
                }
              />
              <div className="preset-options">
                {[0.1, 0.2, 0.5, 1].map((n) => (
                  <button
                    className={s.settings.voxel === n ? "active" : ""}
                    key={n}
                    onClick={() =>
                      st.edit((s) => {
                        s.settings.voxel = n;
                      })
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </Field>
          <Field label={t("markerDiameter")}>
            <Num
              value={s.settings.markerDiameter}
              min={0.1}
              max={1000}
              step={1}
              unit="mm"
              onChange={(n) =>
                st.edit((s) => {
                  s.settings.markerDiameter = n;
                })
              }
            />
          </Field>
          <Field label={t("threshold")}>
            <Num
              value={s.settings.errorThreshold}
              min={0.001}
              unit="mm"
              step={0.1}
              onChange={(n) =>
                st.edit((s) => {
                  s.settings.errorThreshold = n;
                })
              }
            />
          </Field>
          <Toggle
            label={t("autoUpdate")}
            checked={s.settings.autoUpdate}
            onChange={(v) =>
              st.edit((s) => {
                s.settings.autoUpdate = v;
              })
            }
          />
          <div className="inspector-tip">
            <Crosshair size={17} />
            <p>{t("emptySelection")}</p>
          </div>
        </div>
      </>
    );
  const model = o.camera_model_snapshot,
    libraryModel = st.models.find((m) => m.id === o.camera_model_id),
    changed = libraryModel && JSON.stringify(libraryModel) !== JSON.stringify(model);
  const markerAnalysis =
    o.kind === "marker" ? analyzePoint(o.position, o.diameter || 12, s) : null;
  const rigid = o.kind === "rigidBody" ? rigidTrackability(o, s) : null;
  return (
    <>
      <div className="panel-heading">
        <h3>
          {o.kind === "camera" ? <Camera size={16} /> : <Box size={16} />}{" "}
          {t("inspector")}
        </h3>
        <span className="badge">
          {selected.length > 1 ? `${selected.length} ${t("selected")}` : t(o.kind)}
        </span>
      </div>
      <div className="inspector-content">
        <Field label={t("name")}>
          <input
            value={o.name}
            disabled={selected.length > 1 || o.locked}
            onChange={(e) => update({ name: e.target.value })}
          />
        </Field>
        {transform("position", "position", "m")}
        {transform("rotation", "rotation", "°")}
        {!["camera", "marker", "rigidBody"].includes(o.kind) &&
          transform("size", "dimensions", "m")}
        {o.kind === "tube" && <p className="tiny muted">{t("tubeHint")}</p>}
        {o.kind === "camera" && (
          <>
            <div className="section-divider" />
            <Field label={t("replaceModel")}>
              <select
                value={o.camera_model_id}
                onChange={(e) => {
                  const m = st.models.find((m) => m.id === e.target.value);
                  if (m)
                    update({
                      camera_model_id: m.id,
                      camera_model_snapshot: structuredClone(m),
                      enabled:
                        m.layout_supported !== false &&
                        m.enabled_for_layout_default !== false,
                    });
                }}
              >
                <option value={o.camera_model_id}>
                  {model?.model_name} · {t("snapshot")}
                </option>
                {st.models.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.manufacturer} / {m.model_name}
                  </option>
                ))}
              </select>
            </Field>
            {changed && (
              <div className="notice small">
                {t("modelChanged")}
                <button
                  className="text-button"
                  onClick={() =>
                    update({
                      camera_model_snapshot: structuredClone(libraryModel),
                    })
                  }
                >
                  {t("updateSnapshot")}
                </button>
              </div>
            )}
            {!libraryModel && <p className="tiny muted">{t("modelMissing")}</p>}
            {model?.layout_supported === false && (
              <p className="notice">{t("referenceCameraHint")}</p>
            )}
            <div className="spec-grid">
              <span>{t("resolution")}</span>
              <b>
                {model?.resolution_width} × {model?.resolution_height}
              </b>
              <span>
                {t("hfov")} / {t("vfov")}
              </span>
              <b>
                {fmt(model?.hfov_deg, 1)}° / {fmt(model?.vfov_deg, 1)}°
              </b>
              <span>{t("pixelError")}</span>
              <b>{model?.default_pixel_localization_error_px} px</b>
              {model?.stereo && (
                <>
                  <span>{t("baseline")}</span>
                  <b>{model.stereo.baseline_mm} mm</b>
                </>
              )}
            </div>
            <button
              className="full"
              onClick={() =>
                st.edit((s) => {
                  s.objects
                    .filter((c) => st.selected.includes(c.id) && !c.locked)
                    .forEach(
                      (c) =>
                        (c.rotation = lookAt(c.position, [0, 0, s.boundary[2] * 0.3])),
                    );
                })
              }
            >
              <Crosshair size={14} />
              {t("lookAt")}
            </button>
            <div className="button-row">
              <button
                onClick={() => {
                  if (!nearestMount(s.objects, o.position)) {
                    st.set({ toast: "noStructure" });
                    return;
                  }
                  st.edit((s) => {
                    for (const c of s.objects.filter(
                      (o) => o.kind === "camera" && st.selected.includes(o.id) && !o.locked,
                    )) {
                      const nearest = nearestMount(s.objects, c.position);
                      if (nearest) {
                        c.position = nearest.position;
                        c.mount = nearest.structure.id;
                      }
                    }
                  });
                }}
              >
                <Link size={14} />
                {t("attach")}
              </button>
              {o.mount && (
                <button onClick={() => update({ mount: undefined })}>
                  {t("detach")}
                </button>
              )}
            </div>
            <p className="tiny muted">{t("cameraSnapshotNote")}</p>
            {o.group && (
              <button
                className="full"
                onClick={() =>
                  st.set({
                    selected: s.objects
                      .filter((c) => c.group === o.group)
                      .map((c) => c.id),
                  })
                }
              >
                <Layers size={14} />
                {t("selectGroup")}
              </button>
            )}
            {selected.length > 1 && (
              <div className="button-row">
                <button onClick={() => update({ group: uid() })}>
                  {t("createGroup")}
                </button>
                <button
                  onClick={() =>
                    st.edit((s) => {
                      s.objects
                        .filter((c) => st.selected.includes(c.id) && !c.locked)
                        .forEach((c) => {
                          c.position[0] *= -1;
                          c.rotation[0] *= -1;
                          c.rotation[2] *= -1;
                        });
                    })
                  }
                >
                  {t("mirror")}
                </button>
              </div>
            )}
            <div className="section-divider" />
            <h4 className="section-title">{t("preview")}</h4>
            <CameraPreview cameraId={o.id} />
          </>
        )}
        {o.kind === "marker" && (
          <>
            <Field label={t("diameter")}>
              <Num
                value={o.diameter || 12}
                aria-label={t("markerObjectDiameter")}
                min={0.1}
                unit="mm"
                onChange={(diameter) => update({ diameter })}
              />
            </Field>
            <p className="muted tiny">{t("markerScaleNote")}</p>
            <div className="mini-stats">
              <div>
                <span>{t("effectiveCameras")}</span>
                <strong>{markerAnalysis!.count}</strong>
              </div>
              <div>
                <span>{t("expectedError")}</span>
                <strong>
                  {fmt(markerAnalysis!.accuracy?.rms)} <small>mm</small>
                </strong>
              </div>
            </div>
            {selected.filter((o) => o.kind === "marker").length >= 3 && (
              <button
                className="full primary"
                onClick={() => {
                  const markers = selected.filter(
                    (o) => o.kind === "marker" && !o.locked,
                  );
                  if (markers.length < 3) {
                    st.set({ toast: "rigidHint" });
                    return;
                  }
                  const center = mul(
                    markers.reduce((p, o) => add(p, o.position), [0, 0, 0] as Vec3),
                    1 / markers.length,
                  );
                  const rigid = {
                    ...makeObject("rigidBody"),
                    position: center,
                    markers: markers.map((m) => ({
                      position: sub(m.position, center),
                      diameter: m.diameter || 12,
                    })),
                  };
                  st.edit((s) => {
                    s.objects = s.objects.filter(
                      (o) => !markers.some((m) => m.id === o.id),
                    );
                    s.objects.push(rigid);
                  });
                  st.set({ selected: [rigid.id] });
                }}
              >
                {t("createRigid")}
              </button>
            )}
            <button
              className="full"
              onClick={() => st.set({ mode: "analysis", point: o.position })}
            >
              {t("pointAnalysis")}
            </button>
          </>
        )}
        {rigid && (
          <>
            <h4 className="section-title">{t("markerObjectDiameter")}</h4>
            {(o.markers || []).map((marker, index) => (
              <Field key={index} label={`M${index + 1}`}>
                <Num
                  value={marker.diameter}
                  min={0.1}
                  unit="mm"
                  disabled={o.locked}
                  aria-label={`M${index + 1} ${t("diameter")}`}
                  onChange={(diameter) =>
                    st.updateObjects([o.id], {
                      markers: o.markers!.map((m, i) =>
                        i === index ? { ...m, diameter } : m,
                      ),
                    })
                  }
                />
              </Field>
            ))}
            <p className="muted tiny">{t("markerScaleNote")}</p>
            <div className="mini-stats">
              <div>
                <span>{t("totalMarkers")}</span>
                <strong>{o.markers?.length}</strong>
              </div>
              <div>
                <span>{t("effectiveMarkers")}</span>
                <strong>{rigid.effective}</strong>
              </div>
            </div>
            <div className={"trackability " + rigid.status}>{t(rigid.status)}</div>
            {worldMarkers(o).map((m, i) => {
              const a = analyzePoint(m.position, m.diameter, s);
              return (
                <button
                  className="marker-result"
                  key={i}
                  onClick={() => st.set({ mode: "analysis", point: m.position })}
                >
                  <span>M{i + 1}</span>
                  <span>
                    {a.count} {t("cameras")}
                  </span>
                  <b>{fmt(a.accuracy?.rms)} mm</b>
                </button>
              );
            })}
          </>
        )}
        <div className="section-divider" />
        <Toggle
          label={t("visible")}
          checked={o.visible}
          onChange={(visible) => update({ visible })}
        />
        <Toggle
          label={t("locked")}
          checked={o.locked}
          onChange={(locked) => update({ locked })}
        />
        <Toggle
          label={t("participate")}
          checked={o.enabled && model?.layout_supported !== false}
          disabled={model?.layout_supported === false}
          onChange={(enabled) => update({ enabled })}
        />
        {!["camera", "marker", "rigidBody"].includes(o.kind) && (
          <Toggle
            label={t("occlusion")}
            checked={o.occlusion}
            onChange={(occlusion) => update({ occlusion })}
          />
        )}
        <div className="button-row">
          <button onClick={st.duplicate}>
            <Copy size={14} />
            {t("duplicate")}
          </button>
          <button className="danger" onClick={st.remove}>
            <Trash2 size={14} />
            {t("delete")}
          </button>
        </div>
      </div>
    </>
  );
}
