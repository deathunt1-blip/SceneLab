import { coverageSettings, coverageAt, coverageIssues } from "../simulation/coverage";
import type { Scheme, SimulationResult } from "../models";
import { assertCurrentAnalysis, finiteOrNull } from "./validation";

export function buildAnalysisExport(
  scheme: Scheme,
  result: SimulationResult | null,
  diagnostics = false,
) {
  assertCurrentAnalysis(scheme, result);
  const c = coverageSettings(scheme.settings);
  return {
    scheme_id: scheme.id,
    scheme_name: scheme.name,
    scheme_revision: scheme.revision,
    generated_at: result.timestamp,
    settings: {
      coverage_basis: c.coverageBasis,
      coverage_threshold: c.coverageThreshold,
      coverage_scale_max: c.coverageScaleMax,
      highlight_coverage_threshold: c.highlightCoverageThreshold,
      tracking_range_source: c.trackingRangeSource,
      tracking_range_override_m: c.trackingRangeOverrideM,
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
    coverage_at_threshold: coverageAt(result, c.coverageThreshold),
    view_count_histogram:
      result.viewCountHistogram ??
      Array.from(result.counts).reduce<number[]>((h, n) => {
        h[n] = (h[n] || 0) + 1;
        return h;
      }, []),
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
            issues: coverageIssues(result, c.coverageThreshold).map((i) => ({
              type: i.type,
              count: i.count,
              position_m: [...i.position],
            })),
          },
        }
      : {}),
  };
}
