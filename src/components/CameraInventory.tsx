import type { SceneObject } from "../models";
import { cameraInventory } from "../project/inventory";
import { useT } from "../i18n";

export function CameraInventory({
  objects,
  compact = false,
}: {
  objects: SceneObject[];
  compact?: boolean;
}) {
  const t = useT(),
    inv = cameraInventory(objects),
    single = objects.length === 1 && objects[0].kind === "camera" ? objects[0] : null;
  if (compact)
    return (
      <details className="inventory-compact">
        <summary>
          {t("cameras")} {inv.total} ·{" "}
          {inv.models
            .slice(0, 2)
            .map((m) => `${m.name} ×${m.count}`)
            .join(" · ")}
          {inv.models.length > 2 &&
            ` · +${inv.models.length - 2} ${t("inventoryModels")}`}
        </summary>
        <div className="inventory-popover">
          {inv.models.map((m) => (
            <div key={m.name}>
              {m.name} ×{m.count}
              {m.viewpoints !== m.count && ` · ${m.viewpoints} ${t("viewpoints")}`}
            </div>
          ))}
        </div>
      </details>
    );
  return (
    <section className="inventory-card" aria-label={t("cameraInventory")}>
      <h4>{single?.name || `${objects.length} ${t("selected")}`}</h4>
      {inv.total > 0 && (
        <>
          <strong>
            {single?.camera_model_snapshot?.display_name ||
              `${t("cameras")} ${inv.total}`}
          </strong>
          {single ? (
            <>
              <p>{single.camera_model_snapshot?.manufacturer}</p>
              <span>
                {single.camera_model_snapshot?.resolution_width} ×{" "}
                {single.camera_model_snapshot?.resolution_height}
              </span>
            </>
          ) : (
            inv.models.map((m) => (
              <p key={m.name}>
                {m.name} ×{m.count}
              </p>
            ))
          )}
          {inv.viewpoints !== inv.total && (
            <p className="tiny">
              {inv.viewpoints} {t("viewpoints")}
            </p>
          )}
        </>
      )}
      {[
        ["inventoryStructures", inv.structures],
        ["inventoryMarkers", inv.markers],
        ["inventoryObstacles", inv.obstacles],
      ].map(
        ([key, n]) =>
          Number(n) > 0 && (
            <p key={String(key)}>
              {t(String(key))} {n}
            </p>
          ),
      )}
    </section>
  );
}
