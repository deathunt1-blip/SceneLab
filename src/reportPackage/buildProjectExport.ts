import type { Project, Scheme } from "../models";
import { ReportPackageError } from "./validation";

export function buildProjectExport(project: Project, scheme: Scheme) {
  const snapshot = structuredClone(scheme);
  const cameras = snapshot.objects
    .filter((o) => o.kind === "camera")
    .map((o) => {
      if (!o.camera_model_snapshot) throw new ReportPackageError("packageCameraMissing");
      return {
        id: o.id,
        name: o.name,
        enabled: o.enabled,
        visible: o.visible,
        locked: o.locked,
        group: o.group ?? null,
        mount: o.mount ?? null,
        pose: { position_m: o.position, rotation_deg: o.rotation },
        camera_model: o.camera_model_snapshot,
      };
    });
  return {
    project_id: project.id,
    name: project.name,
    scheme_id: scheme.id,
    scheme_name: scheme.name,
    scheme_revision: scheme.revision,
    boundary_m: snapshot.boundary,
    units: {
      position: "m",
      size: "m",
      rotation: "deg",
      marker_diameter: "mm",
      accuracy: "mm",
      image: "px",
    },
    coordinate_system: {
      world:
        "right-handed; Z up; origin at floor center; X in [-length/2,length/2], Y in [-width/2,width/2], Z in [0,height]",
      camera:
        "+Z optical forward, +X image right, +Y image down; position is stereo midpoint when present",
      camera_rotation:
        "[yaw,pitch,roll] degrees; zero looks along world +Y; positive yaw turns toward +X; positive pitch elevates; roll about optical axis",
      object_rotation: "[yaw,pitch,roll] degrees; Rz(yaw) * Ry(pitch) * Rx(roll)",
      image: "u right, v down, origin top-left; coordinates refer to sensor resolution",
    },
    settings: snapshot.settings,
    cameras,
    // Preserve the existing definitions and all object kinds without a second asset schema.
    scheme: snapshot,
  };
}
