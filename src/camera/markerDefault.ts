import type { CameraModel, Project } from "../models";

export const DEFAULT_MARKER_PIXELS = 1.5;
export const MARKER_THRESHOLD_VERSION = 1;

// Older files did not record whether 4 px was a default or an explicit choice.
// Migrate that legacy value once; a later user choice of 4 px must survive reload.
export function migrateMarkerDefault(model: CameraModel): CameraModel {
  if (model.marker_threshold_version !== undefined) return model;
  const legacyDefault = model.minimum_marker_pixels === 4;
  return {
    ...model,
    marker_threshold_version: MARKER_THRESHOLD_VERSION,
    minimum_marker_pixels: legacyDefault
      ? DEFAULT_MARKER_PIXELS
      : model.minimum_marker_pixels,
    notes: legacyDefault
      ? model.notes.replaceAll("最小 Marker 4 px", "最小 Marker 投影宽、高各 1.5 px")
      : model.notes,
  };
}

export function migrateProjectMarkerDefaults(project: Project): Project {
  let changed = false;
  const schemes = project.schemes.map((scheme) => {
    let parametersChanged = false;
    const objects = scheme.objects.map((object) => {
      if (object.kind !== "camera" || !object.camera_model_snapshot) return object;
      const snapshot = migrateMarkerDefault(object.camera_model_snapshot);
      if (snapshot === object.camera_model_snapshot) return object;
      changed = true;
      parametersChanged ||=
        snapshot.minimum_marker_pixels !==
        object.camera_model_snapshot.minimum_marker_pixels;
      return { ...object, camera_model_snapshot: snapshot };
    });
    return { ...scheme, objects, revision: scheme.revision + Number(parametersChanged) };
  });
  return changed ? { ...project, schemes } : project;
}
