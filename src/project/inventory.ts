import type { SceneObject } from "../models";

/** Device counts always describe the saved scene snapshots, independent of the library. */
export function cameraInventory(objects: SceneObject[]) {
  const models = new Map<string, { name: string; count: number; viewpoints: number }>();
  let total = 0,
    viewpoints = 0,
    structures = 0,
    markers = 0,
    obstacles = 0;
  for (const o of objects) {
    if (o.kind === "camera") {
      const name = o.camera_model_snapshot?.display_name || "—";
      const views = o.camera_model_snapshot?.stereo ? 2 : 1;
      const entry = models.get(name) || { name, count: 0, viewpoints: 0 };
      entry.count++;
      entry.viewpoints += views;
      models.set(name, entry);
      total++;
      viewpoints += views;
    } else if (["truss", "tube", "surface"].includes(o.kind)) structures++;
    else if (["marker", "rigidBody"].includes(o.kind)) markers++;
    else obstacles++;
  }
  return {
    total,
    viewpoints,
    models: [...models.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    ),
    structures,
    markers,
    obstacles,
  };
}
