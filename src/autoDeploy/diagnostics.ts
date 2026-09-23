import type { Scheme, SimulationResult, Vec3 } from "../models";
import { observe, obstacles, prepareCameras } from "../simulation/engine";
import type { Constraints, Diagnosis } from "./types";

export function diagnose(s: Scheme, r: SimulationResult, c: Constraints): Diagnosis[] {
  const cameras = prepareCameras(s),
    obs = obstacles(s),
    count = new Map<string, number>(),
    occluded = new Map<string, number>(),
    required: number[] = [];
  let sampled = 0,
    upper = 0,
    lower = 0,
    upperHit = 0,
    lowerHit = 0;
  const stride = Math.max(1, Math.ceil(r.validVoxels / 320));
  for (let i = 0; i < r.validVoxels; i += stride) {
    sampled++;
    const p: Vec3 = [r.positions[i * 3], r.positions[i * 3 + 1], r.positions[i * 3 + 2]];
    const observations = cameras.map((cam) => observe(p, c.markerDiameter, cam, obs));
    const issue = (code: string) => count.set(code, (count.get(code) || 0) + 1);
    if (
      observations.some((o) => o.reasons.includes("close") || o.reasons.includes("far"))
    )
      issue("distance");
    if (
      observations.some(
        (o) =>
          o.reasons.includes("small") && !o.reasons.some((reason) => reason !== "small"),
      )
    )
      issue("small");
    const useful = observations
      .filter((o) => o.reasons.every((reason) => reason === "small"))
      .map((o) => o.minimumDiameter)
      .sort((a, b) => a - b);
    if (useful.length >= c.minViews && useful[c.minViews - 1] > c.markerDiameter)
      required.push(useful[c.minViews - 1]);
    const blocked = new Set(
      observations
        .filter(
          (o) =>
            o.occluderId &&
            !o.reasons.some((reason) =>
              ["fov", "behind", "far", "close"].includes(reason),
            ),
        )
        .map((o) => o.occluderId!),
    );
    if (blocked.size) issue("occlusion");
    blocked.forEach((id) => occluded.set(id, (occluded.get(id) || 0) + 1));
    if (
      r.counts[i] >= 2 &&
      (!Number.isFinite(r.errors[i]) || r.errors[i] > c.errorThreshold)
    )
      issue("geometry");
    if (p[2] >= c.boundary[2] * 0.65) {
      upper++;
      if (r.counts[i] >= c.minViews) upperHit++;
    } else {
      lower++;
      if (r.counts[i] >= c.minViews) lowerHit++;
    }
  }
  const diagnoses: Diagnosis[] = [];
  if (cameras.length < c.minViews)
    diagnoses.push({ code: "count", affected: sampled, sampled });
  for (const code of ["small", "occlusion", "distance", "geometry"] as const) {
    const affected = count.get(code) || 0;
    if (!affected) continue;
    const d: Diagnosis = { code, affected, sampled };
    if (code === "small" && required.length) {
      required.sort((a, b) => a - b);
      d.requiredDiameter =
        required[Math.min(required.length - 1, Math.ceil(required.length * 0.9) - 1)];
      const sizes = [6, 9, 12, 14, 16, 18, 20, 25, 30, 40, 50, 60, 80, 100];
      d.suggestedDiameter =
        sizes.find((n) => n >= d.requiredDiameter!) ??
        Math.ceil(d.requiredDiameter / 10) * 10;
    }
    if (code === "occlusion")
      d.objectNames = [...occluded]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => obs.find((o) => o.id === id)?.name || id);
    diagnoses.push(d);
  }
  if (upper && lower && upperHit / upper + 0.15 < lowerHit / lower)
    diagnoses.push({ code: "layers", affected: upper - upperHit, sampled: upper });
  if (r.coverage[c.minViews - 1] < c.coverageTarget)
    diagnoses.push({
      code: "coverage",
      affected: Math.round((1 - r.coverage[c.minViews - 1] / 100) * r.validVoxels),
      sampled: r.validVoxels,
    });
  return diagnoses;
}
