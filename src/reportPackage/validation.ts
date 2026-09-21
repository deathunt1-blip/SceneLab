import type { Scheme, SimulationResult } from "../models";

export class ReportPackageError extends Error {
  constructor(
    public code:
      | "packageNoAnalysis"
      | "packageStale"
      | "packageImagesMissing"
      | "packageInvalidImage"
      | "packageCameraMissing",
  ) {
    super(code);
  }
}
export function assertCurrentAnalysis(
  scheme: Scheme,
  result: SimulationResult | null,
): asserts result is SimulationResult {
  if (!result) throw new ReportPackageError("packageNoAnalysis");
  if (result.schemeId !== scheme.id || result.revision !== scheme.revision)
    throw new ReportPackageError("packageStale");
}
export function safeName(value: string, fallback = "SceneLab") {
  const safe = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/g, "");
  if (!safe || safe === "." || safe === "..") return fallback;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe) ? `_${safe}` : safe;
}
export const finiteOrNull = (value: number | null) =>
  value !== null && Number.isFinite(value) ? value : null;
