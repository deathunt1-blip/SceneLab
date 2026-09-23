import data from "./data/chingmu-v1.json";
import type { CameraModel } from "../models";

export const catalogVersion = data.dataset;

// Keep original records separate from the editable simulation parameters.
export function catalogEntries(): Partial<CameraModel>[] {
  return data.tables.OpticalProfile.map((optical) => {
    const camera = data.tables.CameraModel.find(
      (row) => row.camera_model_id === optical.camera_model_id,
    )!;
    const frame =
      camera.model === "R3"
        ? data.tables.R3FrameMode.find(
            (row) =>
              `${row.resolution_width_px}x${row.resolution_height_px}` ===
              optical.profile_name,
          )
        : undefined;
    if (camera.model === "R3" && !frame) throw new Error("Missing R3 frame mode");
    const name = `${camera.model} · ${optical.profile_name}`;
    const maxRange = optical.passive_range_m ?? optical.general_tracking_range_m;
    const notes = [
      `来源：${data.filename} / ${optical.profile_id}`,
      optical.source,
      camera.notes,
      optical.optical_notes,
      optical.marker_diameter_mm
        ? `标称距离对应 ${optical.marker_diameter_mm} mm Marker。`
        : null,
      optical.passive_range_m !== null
        ? `被动 ${optical.passive_range_m} m；主动 ${optical.active_range_m} m。默认按被动距离仿真。`
        : null,
      optical.range_qualifier === ">="
        ? `标称距离为 ≥${maxRange} m；当前仿真暂以 ${maxRange} m 为保守上限，可按实测修改。`
        : null,
      optical.environment === "Underwater"
        ? "采用表内水下有效视场角；当前模型不模拟水体浑浊、散射与折射变化。"
        : null,
      "仿真假设（非厂商标定值）：最近距离 0 m（未限制）、图像点误差 0.1 px、最小 Marker 投影宽、高各 1.5 px、无畸变。请按实测调整。",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      id: `${catalogVersion}:${optical.profile_id}`,
      manufacturer: camera.brand,
      model_name: name,
      display_name: name,
      resolution_width: frame?.resolution_width_px ?? camera.resolution_width_px,
      resolution_height: frame?.resolution_height_px ?? camera.resolution_height_px,
      hfov_deg: optical.hfov_deg,
      vfov_deg: optical.vfov_deg,
      focal_length_mm: optical.focal_length_mm,
      min_working_distance_m: optical.min_range_m ?? 0,
      max_working_distance_m: maxRange,
      layout_supported: camera.layout_supported,
      enabled_for_layout_default: camera.enabled_for_layout_default,
      range_mode: optical.passive_range_m !== null ? "passive" : "general",
      source: "imported",
      notes,
      catalog: {
        dataset: data.dataset,
        filename: data.filename,
        camera,
        optical,
        ...(frame ? { frame } : {}),
      },
    };
  });
}
