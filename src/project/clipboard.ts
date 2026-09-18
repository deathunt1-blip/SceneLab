import type { SceneObject, Vec3 } from "../models";
import { uid } from "../models";

/** Clone a selection as one batch, preserving relationships within that batch. */
export function pasteObjects(
  source: SceneObject[],
  existing: SceneObject[],
  offset: Vec3,
) {
  const ids = new Map(source.map((o) => [o.id, uid()]));
  const groups = new Map(source.filter((o) => o.group).map((o) => [o.group!, uid()]));
  const names = new Set(existing.map((o) => o.name));
  return source.map((original) => {
    const o = structuredClone(original);
    let n = 2;
    while (names.has(`${original.name} · ${n}`)) n++;
    o.name = `${original.name} · ${n}`;
    names.add(o.name);
    o.id = ids.get(original.id)!;
    o.locked = false;
    o.group = o.group ? groups.get(o.group) : undefined;
    o.mount = o.mount ? ids.get(o.mount) : undefined;
    o.position = o.position.map((v, i) => v + offset[i]) as Vec3;
    return o;
  });
}
