export type Vec3 = [number, number, number];
export type Language = "zh" | "en";
export type ObjectKind =
  | "camera"
  | "box"
  | "cylinder"
  | "wall"
  | "marker"
  | "rigidBody"
  | "truss"
  | "tube"
  | "surface";
export type CameraEye = "left" | "right";
export interface CameraModel {
  id: string;
  manufacturer: string;
  model_name: string;
  display_name: string;
  resolution_width: number;
  resolution_height: number;
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  hfov_deg: number;
  vfov_deg: number;
  focal_length_mm: number;
  min_working_distance_m: number;
  max_working_distance_m: number | null;
  default_pixel_localization_error_px: number;
  minimum_marker_pixels: number;
  distortion_model: "none" | "brown";
  distortion_parameters: [number, number, number, number, number];
  source: "preset" | "user" | "imported" | "calibration";
  input_mode: "basic" | "advanced";
  notes: string;
  created_at: string;
  updated_at: string;
  layout_supported?: boolean;
  enabled_for_layout_default?: boolean;
  range_mode?: "passive" | "active" | "general";
  stereo?: { baseline_mm: number };
  housing_mm?: Vec3;
  catalog?: {
    dataset: string;
    filename: string;
    camera: Record<string, string | number | boolean | null>;
    optical: Record<string, string | number | boolean | null>;
    frame?: Record<string, string | number | boolean | null>;
  };
}
export interface SceneObject {
  id: string;
  name: string;
  kind: ObjectKind;
  position: Vec3;
  rotation: Vec3;
  size: Vec3;
  visible: boolean;
  locked: boolean;
  enabled: boolean;
  occlusion: boolean;
  camera_model_id?: string;
  camera_model_snapshot?: CameraModel;
  diameter?: number;
  group?: string;
  mount?: string;
  deployment?: {
    plannerVersion: string;
    mountType: string;
    side?: string;
    layer: number;
  };
  markers?: { position: Vec3; diameter: number }[];
}
export interface Settings {
  voxel: number;
  markerDiameter: number;
  errorThreshold: number;
  autoUpdate: boolean;
}
export interface Scheme {
  id: string;
  name: string;
  boundary: Vec3;
  objects: SceneObject[];
  groups?: { id: string; name: string }[];
  settings: Settings;
  revision: number;
}
export interface Project {
  schema_version: 1;
  id: string;
  name: string;
  activeSchemeId: string;
  schemes: Scheme[];
  updated_at: string;
}
export type Failure = "behind" | "fov" | "close" | "far" | "occluded" | "small" | "edge";
export interface Observation {
  cameraId: string;
  eye?: CameraEye;
  cameraPosition?: Vec3;
  valid: boolean;
  reasons: Failure[];
  distance: number;
  u: number;
  v: number;
  pixels: number;
  minimumDiameter: number;
  margin: number;
  occluderId?: string;
  intersection?: Vec3;
}
export interface Accuracy {
  x: number;
  y: number;
  z: number;
  rms: number;
  condition: number;
}
export interface PointResult {
  position: Vec3;
  count: number;
  accuracy: Accuracy | null;
  observations: Observation[];
}
export interface SimulationResult {
  schemeId: string;
  revision: number;
  timestamp: string;
  elapsed: number;
  boundary: Vec3;
  voxelSize: Vec3;
  positions: Float32Array;
  counts: Uint16Array;
  errors: Float32Array;
  validVoxels: number;
  excludedVoxels: number;
  coverage: number[];
  averageCount: number;
  meanError: number | null;
  p90: number | null;
  p95: number | null;
  under03: number;
  under05: number;
  invalidAccuracy: number;
  issues: {
    type: "coverage" | "accuracy" | "occluded" | "small" | "geometry";
    count: number;
    position: Vec3;
  }[];
}
export const uid = () => crypto.randomUUID();
