import type {
  CameraModel,
  ObjectKind,
  Project,
  SceneObject,
  Scheme,
  Vec3,
} from "../models";
import { uid } from "../models";
import { lookAt } from "../simulation/math";
import { validateModel } from "../camera/repository";
export function makeObject(kind: ObjectKind, n = 1): SceneObject {
  return {
    id: uid(),
    name:
      kind === "camera"
        ? `CAM ${String(n).padStart(2, "0")}`
        : kind === "marker"
          ? `M${String(n).padStart(2, "0")}`
          : `${kind} ${String(n).padStart(2, "0")}`,
    kind,
    position: [0, 0, kind === "marker" ? 1.2 : 1],
    rotation: [0, 0, 0],
    size:
      kind === "wall"
        ? [4, 0.2, 3]
        : kind === "tube"
          ? [4, 0.05, 0.05]
          : kind === "truss"
            ? [10, 0.25, 0.25]
            : kind === "surface"
              ? [10, 8, 0.1]
              : [1.5, 1.5, 2],
    visible: true,
    locked: false,
    enabled: true,
    occlusion: ["box", "cylinder", "wall"].includes(kind),
    diameter: 12,
  };
}
export function makeCamera(
  model: CameraModel,
  p: Vec3,
  target: Vec3,
  n = 1,
): SceneObject {
  return {
    ...makeObject("camera", n),
    position: p,
    rotation: lookAt(p, target),
    camera_model_id: model.id,
    camera_model_snapshot: structuredClone(model),
    enabled:
      model.layout_supported !== false && model.enabled_for_layout_default !== false,
    size: [0.22, 0.18, 0.15],
  };
}
export type ArrayType = "circle" | "rectangle" | "linear" | "grid";
export function cameraArray(
  model: CameraModel,
  type: ArrayType,
  count: number,
  radius: number,
  height: number,
  target: Vec3,
  offset = 0,
  start = 0,
  end = 360,
): SceneObject[] {
  const group = uid();
  return Array.from({ length: count }, (_, i) => {
    let p: Vec3;
    if (type === "circle") {
      const angle =
        ((start +
          ((end - start) * i) /
            (Math.abs(end - start) >= 360 ? count : Math.max(1, count - 1))) *
          Math.PI) /
        180;
      p = [Math.cos(angle) * radius, Math.sin(angle) * radius, height];
    } else if (type === "linear")
      p = [-radius + (2 * radius * i) / Math.max(1, count - 1), -radius, height];
    else if (type === "grid") {
      const cols = Math.ceil(Math.sqrt(count)),
        rows = Math.ceil(count / cols);
      p = [
        -radius + ((i % cols) * 2 * radius) / Math.max(1, cols - 1),
        -radius + (Math.floor(i / cols) * 2 * radius) / Math.max(1, rows - 1),
        height,
      ];
    } else {
      const d = (i / count) * 8 * radius;
      if (d < 2 * radius) p = [-radius + d, -radius, height];
      else if (d < 4 * radius) p = [radius, -radius + d - 2 * radius, height];
      else if (d < 6 * radius) p = [radius - (d - 4 * radius), radius, height];
      else p = [-radius, radius - (d - 6 * radius), height];
    }
    return { ...makeCamera(model, p, target, offset + i + 1), group };
  });
}
export function makeProject(model?: CameraModel): Project {
  const scheme: Scheme = {
    id: uid(),
    name: "A",
    boundary: [12, 10, 5],
    revision: 0,
    settings: {
      voxel: 0.5,
      markerDiameter: 12,
      errorThreshold: 0.5,
      autoUpdate: false,
    },
    objects: [],
  };
  if (model)
    scheme.objects.push(...cameraArray(model, "rectangle", 16, 5, 3.6, [0, 0, 1.5]));
  for (const [position, size] of [
    [
      [0, -5, 3.6],
      [10.3, 0.18, 0.18],
    ],
    [
      [0, 5, 3.6],
      [10.3, 0.18, 0.18],
    ],
    [
      [-5, 0, 3.6],
      [0.18, 10.3, 0.18],
    ],
    [
      [5, 0, 3.6],
      [0.18, 10.3, 0.18],
    ],
  ] as [Vec3, Vec3][])
    scheme.objects.push({
      ...makeObject("truss"),
      position,
      size,
      name: `Truss ${scheme.objects.filter((o) => o.kind === "truss").length + 1}`,
    });
  scheme.objects.push({
    ...makeObject("box"),
    name: "Platform",
    position: [0, 0, 0.3],
    size: [3, 2, 0.6],
  });
  scheme.objects.push({
    ...makeObject("cylinder"),
    name: "Column",
    position: [2.5, 1.5, 1.2],
    size: [0.65, 0.65, 2.4],
  });
  scheme.objects.push({
    ...makeObject("marker"),
    name: "M01",
    position: [0, 0, 1.3],
    diameter: 12,
  });
  return {
    schema_version: 1,
    id: uid(),
    name: "Motion Studio",
    activeSchemeId: scheme.id,
    schemes: [scheme],
    updated_at: new Date().toISOString(),
  };
}
export function validateProject(p: Project): void {
  const vec = (v: unknown) =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((x) => typeof x === "number" && Number.isFinite(x));
  if (
    p?.schema_version !== 1 ||
    typeof p.id !== "string" ||
    typeof p.name !== "string" ||
    !Array.isArray(p.schemes) ||
    !p.schemes.length ||
    !p.schemes.some((s) => s.id === p.activeSchemeId)
  )
    throw new Error("invalidFile");
  const ids = new Set<string>();
  for (const s of p.schemes) {
    if (
      typeof s.id !== "string" ||
      typeof s.name !== "string" ||
      !Number.isSafeInteger(s.revision) ||
      s.revision < 0 ||
      ids.has(s.id) ||
      !vec(s.boundary) ||
      s.boundary.some((v) => v <= 0 || v > 1000) ||
      !s.settings ||
      typeof s.settings.autoUpdate !== "boolean" ||
      !Number.isFinite(s.settings.voxel) ||
      s.settings.voxel < 0.01 ||
      !Number.isFinite(s.settings.markerDiameter) ||
      s.settings.markerDiameter <= 0 ||
      !Number.isFinite(s.settings.errorThreshold) ||
      s.settings.errorThreshold <= 0 ||
      !Array.isArray(s.objects) ||
      s.objects.length > 10000
    )
      throw new Error("invalidFile");
    ids.add(s.id);
    if (
      s.groups !== undefined &&
      (!Array.isArray(s.groups) ||
        new Set(s.groups.map((g) => g?.id)).size !== s.groups.length ||
        s.groups.some(
          (g) =>
            !g ||
            typeof g.id !== "string" ||
            !g.id ||
            typeof g.name !== "string" ||
            !g.name.trim(),
        ))
    )
      throw new Error("invalidFile");
    const objectIds = new Set();
    for (const o of s.objects) {
      if (
        !o.id ||
        objectIds.has(o.id) ||
        typeof o.name !== "string" ||
        ![
          "camera",
          "box",
          "cylinder",
          "wall",
          "marker",
          "rigidBody",
          "truss",
          "tube",
          "surface",
        ].includes(o.kind) ||
        !vec(o.position) ||
        !vec(o.rotation) ||
        !vec(o.size) ||
        o.size.some((v) => v <= 0) ||
        ["visible", "locked", "enabled", "occlusion"].some(
          (k) => typeof o[k as keyof SceneObject] !== "boolean",
        )
      )
        throw new Error("invalidFile");
      objectIds.add(o.id);
      if (o.group !== undefined && (typeof o.group !== "string" || !o.group))
        throw new Error("invalidFile");
      if (
        o.kind === "camera" &&
        (!o.camera_model_snapshot || validateModel(o.camera_model_snapshot).length)
      )
        throw new Error("invalidFile");
      if (o.kind === "marker" && (!Number.isFinite(o.diameter) || o.diameter! <= 0))
        throw new Error("invalidFile");
      if (
        o.kind === "rigidBody" &&
        (!o.markers ||
          o.markers.length < 3 ||
          o.markers.some(
            (m) => !vec(m.position) || !Number.isFinite(m.diameter) || m.diameter <= 0,
          ))
      )
        throw new Error("invalidFile");
    }
  }
}
