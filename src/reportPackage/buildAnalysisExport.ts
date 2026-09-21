import type { Scheme, SimulationResult } from "../models";
import { assertCurrentAnalysis, finiteOrNull } from "./validation";

export function buildAnalysisExport(
  scheme: Scheme,
  result: SimulationResult | null,
  diagnostics = false,
) {
  assertCurrentAnalysis(scheme, result);
  return {
    scheme_id: scheme.id,
    scheme_name: scheme.name,
    scheme_revision: scheme.revision,
    generated_at: result.timestamp,
    settings: {
      boundary_m: [...result.boundary],
      voxel_m: scheme.settings.voxel,
      actual_voxel_size_m: [...result.voxelSize],
      marker_diameter_mm: scheme.settings.markerDiameter,
      error_threshold_mm: scheme.settings.errorThreshold,
    },
    sampling: {
      valid_voxels: result.validVoxels,
      excluded_voxels: result.excludedVoxels,
      invalid_accuracy_voxels: result.invalidAccuracy,
    },
    coverage_percent: {
      ge1: result.coverage[0],
      ge2: result.coverage[1],
      ge3: result.coverage[2],
      ge4: result.coverage[3],
      ge5: result.coverage[4],
    },
    average_view_count: result.averageCount,
    accuracy_mm: {
      mean: finiteOrNull(result.meanError),
      p90: finiteOrNull(result.p90),
      p95: finiteOrNull(result.p95),
    },
    threshold_percent: { under_0_3mm: result.under03, under_0_5mm: result.under05 },
    elapsed_ms: result.elapsed,
    statistics: {
      coverage_denominator: "valid_voxels",
      threshold_denominator: "valid_voxels",
      accuracy_population: "localizable valid voxels only; null when none",
      accuracy_metric: "theoretical 1-sigma 3D position RMS",
      coverage_unit: "viewpoints (stereo contributes up to two)",
    },
    ...(diagnostics
      ? {
          diagnostics: {
            included: true as const,
            issues: result.issues.map((i) => ({
              type: i.type,
              count: i.count,
              position_m: [...i.position],
            })),
          },
        }
      : {}),
  };
}
