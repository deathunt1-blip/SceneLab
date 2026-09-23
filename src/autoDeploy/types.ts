import type { CameraModel, SceneObject, Scheme, SimulationResult, Vec3 } from "../models";

export const PLANNER_VERSION = "1.4.0";
export const profiles = ["balanced", "coverage", "accuracy", "minimum"] as const;
export type Profile = (typeof profiles)[number];
export type Layout = "perimeter" | "ceiling" | "hybrid" | "free" | "existing";
export interface Constraints {
  boundary: Vec3;
  markerDiameter: number;
  errorThreshold: number;
  accuracyTarget: number | null;
  minViews: 2 | 3 | 4;
  coverageTarget: number;
  modelIds: string[]; // Empty = search the current library, including edited profiles.
  countMode: "auto" | "exact" | "range";
  count: number;
  minCount: number;
  maxCount: number;
  installation: "auto" | Layout;
  layers: number | "auto";
  profile: Profile;
  weighting: "center" | "uniform";
  activity: [number, number] | null;
  seed: number;
}
export interface Parameters {
  modelId: string;
  count: number;
  layout: Layout;
  layers: number;
  height: number; // Fraction of scene height for the top mounting layer.
  spread: number; // Fractional separation between lowest and highest layer.
  aim: number;
  cross: number;
  phase: number;
  ceilingRatio: number;
  freeShape: "rectangle" | "ellipse" | "arc";
}
export interface MountInfo {
  cameraId: string;
  type: "truss" | "ceiling" | "tripod" | "existing";
  reference?: string;
  side?: string;
  layer: number;
  position: Vec3;
}
export interface Candidate {
  id: string;
  params: Parameters;
  cameras: SceneObject[];
  structures: SceneObject[];
  mounts: MountInfo[];
  feasible: boolean;
  infeasibleReason?: string;
}
export interface Metrics {
  coverage: number[];
  targetCoverage: number;
  centerCoverage: number;
  weightedCoverage: number;
  weightedAccuracy: number;
  accuracyPass: number;
  averageCount: number;
  meanError: number | null;
  p90: number | null;
  p95: number | null;
  invalidAccuracy: number;
  validVoxels: number;
  issues: SimulationResult["issues"];
  meetsTarget: boolean;
}
export interface Evaluation {
  candidate: Candidate;
  metrics: Metrics;
}
export interface Diagnosis {
  code: "count" | "distance" | "small" | "occlusion" | "geometry" | "layers" | "coverage";
  affected: number;
  sampled: number;
  objectNames?: string[];
  requiredDiameter?: number;
  suggestedDiameter?: number;
}
export interface Recommendation extends Evaluation {
  profiles: Profile[];
  result: SimulationResult;
  diagnoses: Diagnosis[];
  // Actual local differences against the other finely simulated finalists.
  comparisons: {
    candidateId: string;
    name: string;
    count: number;
    layout: Layout;
    layers: number;
    coverageDelta: number;
    accuracyDelta: number;
    countDelta: number;
  }[];
}
export interface Trial {
  change: "marker" | "count" | "layers" | "layout" | "model";
  label: string;
  baseId: string;
  before: Metrics;
  after: Metrics;
  markerDiameter: number;
  modelId: string;
  count: number;
  layers: number;
  layout: Layout;
}
export interface PlannerOutput {
  version: string;
  seed: number;
  constraints: Constraints;
  recommendations: Recommendation[];
  trials: Trial[];
  evaluated: number;
  coarseVoxel: number;
  fineVoxel: number;
  modelCount: number;
  infeasible: { modelId: string; layout: Layout; reason: string }[];
  elapsed: number;
}
export interface PlannerInput {
  scheme: Scheme;
  models: CameraModel[];
  constraints: Constraints;
}
export interface PlannerProgress {
  stage: "screen" | "search" | "optimize" | "refine" | "fine" | "diagnose";
  done: number;
  total: number;
  fraction?: number;
}
export type ApplyMode = "new" | "replace" | "add";
