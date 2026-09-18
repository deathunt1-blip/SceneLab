import { expect, it } from "vitest";
import * as THREE from "three";
import { makeObject } from "../project/data";
import { makeSceneObject, disposeGroup } from "./scene";

it("renders standalone and rigid-body marker spheres at their millimetre dimensions", () => {
  for (const diameter of [3, 6, 12, 24]) {
    for (const kind of ["marker", "rigidBody"] as const) {
      const obj = {
        ...makeObject(kind),
        diameter,
        markers: [{ position: [0, 0, 0.2] as [number, number, number], diameter }],
      };
      const group = makeSceneObject(obj, false, false);
      const sphere = group.children.find(
        (c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.SphereGeometry,
      ) as THREE.Mesh<THREE.SphereGeometry>;
      expect(sphere.geometry.parameters.radius * 2000).toBeCloseTo(diameter);
      disposeGroup(group);
    }
  }
});
