import * as THREE from "three";

/** Only rendered object surfaces are pickable; helpers never claim a scene object. */
export function pickableMeshes(roots: THREE.Object3D[]) {
  const meshes: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    if (!o.visible || o.userData.noPick) return;
    if (o instanceof THREE.Mesh) meshes.push(o);
    for (const child of o.children) visit(child);
  };
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    visit(root);
  }
  return meshes;
}

export function pickSceneObjects(ray: THREE.Raycaster, roots: THREE.Object3D[]) {
  const meshes = pickableMeshes(roots);
  const seen = new Set<string>();
  return ray.intersectObjects(meshes, false).flatMap((hit) => {
    let owner = hit.object;
    while (owner.parent && !owner.userData.id) owner = owner.parent;
    const id = owner.userData.id as string | undefined;
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, distance: hit.distance }];
  });
}

export function pickCandidate(
  ids: string[],
  selected: string | undefined,
  cycle: boolean,
) {
  if (!ids.length) return undefined;
  const index = selected ? ids.indexOf(selected) : -1;
  return cycle && index >= 0 ? ids[(index + 1) % ids.length] : ids[0];
}
