import type { SceneObject, Vec3 } from "../models";
import { add, length, rotate, sub, unrotate } from "../simulation/math";

export const isBeam = (o: SceneObject) => o.kind === "truss" || o.kind === "tube";
export const beamAxis = (o: SceneObject) =>
  o.kind === "tube" ? 0 : o.size[0] >= o.size[1] ? 0 : 1;

/** Mounts are one-time placement, as with existing trusses and mounting surfaces. */
export function mountPoint(structure: SceneObject, position: Vec3): Vec3 {
  const local = unrotate(sub(position, structure.position), structure.rotation);
  const clamp = (axis: number) =>
    Math.max(-structure.size[axis] / 2, Math.min(structure.size[axis] / 2, local[axis]));
  let p: Vec3 = [0, 0, 0];
  if (structure.kind === "surface") p = [clamp(0), clamp(1), structure.size[2] / 2];
  else {
    p[beamAxis(structure)] = clamp(beamAxis(structure));
    if (structure.kind === "tube") {
      // Put the optical centre outside the solid tube, on the nearest side face.
      const side =
        Math.abs(local[1]) / structure.size[1] > Math.abs(local[2]) / structure.size[2]
          ? 1
          : 2;
      p[side] = (local[side] > 0 ? 1 : -1) * (structure.size[side] / 2 + 0.01);
    }
  }
  return add(structure.position, rotate(p, structure.rotation));
}

export function nearestMount(structures: SceneObject[], position: Vec3) {
  return structures
    .filter((o) => o.visible && o.enabled && (isBeam(o) || o.kind === "surface"))
    .map((o) => ({ structure: o, position: mountPoint(o, position) }))
    .sort(
      (a, b) => length(sub(a.position, position)) - length(sub(b.position, position)),
    )[0];
}

export function beamArrayPoint(
  structure: SceneObject,
  index: number,
  count: number,
): Vec3 {
  const local: Vec3 = [
    0,
    0,
    structure.kind === "tube" ? -structure.size[2] / 2 - 0.01 : 0,
  ];
  const axis = beamAxis(structure);
  local[axis] = count === 1 ? 0 : (index / (count - 1) - 0.5) * structure.size[axis];
  return add(structure.position, rotate(local, structure.rotation));
}
