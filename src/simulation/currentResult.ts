import type { Scheme, SimulationResult } from "../models";

// Keep stale results in the store for the rerun notice, but never display them as
// measurements of the current scene or use them to draw its heatmap.
export function currentResult(scheme: Scheme, result: SimulationResult | null) {
  return result?.schemeId === scheme.id && result.revision === scheme.revision
    ? result
    : null;
}
