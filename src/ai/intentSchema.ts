import type { CameraModel } from "../models";
import type { Constraints } from "../autoDeploy/types";
import { validateConstraints } from "../autoDeploy/constraints";

export function parseIntentResponse(
  content: string,
  current: Constraints,
  models: CameraModel[],
): Constraints {
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    // No coordinates, scores, object edits, executable code, or unknown fields can enter a plan.
    const fields = Object.keys(current).filter((k) => k !== "seed");
    if (Object.keys(value).some((k) => !fields.includes(k))) throw new Error();
    const merged = { ...structuredClone(current), ...value } as Constraints;
    validateConstraints(merged, models);
    return merged;
  } catch {
    throw new Error("aiInvalidResponse");
  }
}
