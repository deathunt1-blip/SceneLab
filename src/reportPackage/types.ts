import type { CameraEye, Project, Scheme, SimulationResult } from "../models";

export const FORMAT_VERSION = "1.0";
export interface ReportImage {
  manual?: boolean;
  data: string;
  view: string;
  layer: string;
  revision: number;
  schemeId: string;
  clip: number;
  analysisTimestamp?: string;
}
export interface PackageOptions {
  cameraViews: boolean;
  diagnostics: boolean;
}
export interface ImageEntry {
  role: "deployment" | "coverage" | "accuracy" | "manual";
  view: string;
  file: string;
  clip_m: number;
  image_size_px: [number, number];
}
export interface Asset {
  path: string;
  data: Uint8Array;
}
export interface CameraViewEntry {
  camera_id: string;
  camera_name: string;
  enabled: boolean;
  eye: CameraEye | null;
  model: string;
  resolution: [number, number];
  image: string;
  image_size_px: [number, number];
  image_kind: "diagram_overview";
  markers: {
    name: string;
    diameter_mm: number;
    u_px: number | null;
    v_px: number | null;
    width_px: number | null;
    height_px: number | null;
    valid: boolean;
    reasons: string[];
  }[];
}
export interface PackageInput {
  project: Project;
  result: SimulationResult | null;
  images: ReportImage[];
  options: PackageOptions;
  signal?: AbortSignal;
  assertUnchanged?: () => void;
  onProgress?: (percent: number) => void;
}
export interface CameraViewAssets {
  views: CameraViewEntry[];
  assets: Asset[];
}
export type CameraViewExporter = (
  scheme: Scheme,
  signal?: AbortSignal,
  progress?: (percent: number) => void,
) => Promise<CameraViewAssets>;
