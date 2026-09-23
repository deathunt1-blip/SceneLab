import { uid, type Project, type Scheme } from "../models";
import type { ApplyMode, Candidate, Constraints } from "./types";
import { PLANNER_VERSION } from "./types";

export interface ApplyOptions {
  mode: ApplyMode;
  structures: boolean;
  name: string;
}
export function applyToProject(
  project: Project,
  source: Scheme,
  c: Constraints,
  candidate: Candidate,
  options: ApplyOptions,
) {
  const current = project.schemes.find((s) => s.id === source.id);
  if (
    !current ||
    project.activeSchemeId !== source.id ||
    current.revision !== source.revision ||
    JSON.stringify(current) !== JSON.stringify(source)
  )
    throw new Error("adStale");
  if (!candidate.feasible) throw new Error("adMountSpace");
  if (
    candidate.cameras.some(
      (o) =>
        !o.camera_model_snapshot ||
        o.camera_model_id !== candidate.params.modelId ||
        o.camera_model_snapshot.id !== o.camera_model_id ||
        (c.modelIds.length > 0 && !c.modelIds.includes(o.camera_model_id)),
    )
  )
    throw new Error("adModelMismatch");
  const p = structuredClone(project);
  let s = p.schemes.find((s) => s.id === source.id)!;
  if (options.mode === "new") {
    s = structuredClone(s);
    s.id = uid();
    s.name = options.name.trim() || "Auto Deploy";
    s.revision = 0;
    p.schemes.push(s);
    p.activeSchemeId = s.id;
  }
  if (options.mode !== "add") s.objects = s.objects.filter((o) => o.kind !== "camera");
  const generated = [
    ...(options.structures ? candidate.structures : []),
    ...candidate.cameras,
  ];
  const ids = new Map(generated.map((o) => [o.id, uid()])),
    group = uid();
  const existing = new Set(s.objects.map((o) => o.id));
  for (const source of generated) {
    const o = structuredClone(source),
      mount = candidate.mounts.find((m) => m.cameraId === o.id);
    o.id = ids.get(source.id)!;
    o.group = group;
    o.locked = false;
    o.mount = source.mount
      ? ids.get(source.mount) || (existing.has(source.mount) ? source.mount : undefined)
      : undefined;
    if (mount)
      o.deployment = {
        plannerVersion: PLANNER_VERSION,
        mountType: mount.type,
        side: mount.side,
        layer: mount.layer,
      };
    s.objects.push(o);
  }
  const used = new Set(s.objects.map((o) => o.group));
  s.groups = [
    ...(s.groups || []).filter((g) => used.has(g.id)),
    { id: group, name: options.name.trim() || "Auto Deploy" },
  ];
  s.boundary = [...c.boundary];
  s.settings = {
    ...s.settings,
    markerDiameter: c.markerDiameter,
    errorThreshold: c.errorThreshold,
  };
  s.revision++;
  p.updated_at = new Date().toISOString();
  return { project: p, selected: candidate.cameras.map((o) => ids.get(o.id)!) };
}
