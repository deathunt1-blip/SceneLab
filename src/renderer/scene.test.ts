import { expect, it } from "vitest";
import * as THREE from "three";
import { makeCamera, makeObject } from "../project/data";
import { createP3Model } from "../camera/repository";
import { makeSceneObject, disposeGroup } from "./scene";

it("renders a resized tube at its actual dimensions and two P3 optical centres at the baseline", () => {
  const tube = {
    ...makeObject("tube"),
    size: [6, 0.08, 0.04] as [number, number, number],
  };
  const g = makeSceneObject(tube, false, false);
  const mesh = g.children[0] as THREE.Mesh<THREE.BoxGeometry>;
  expect(mesh.geometry.parameters).toMatchObject({ width: 6, height: 0.08, depth: 0.04 });
  disposeGroup(g);
  const camera = makeCamera(createP3Model(), [0, 0, 1], [0, 2, 1]);
  const cameraGroup = makeSceneObject(camera, true, true);
  const lenses = cameraGroup.children.filter(
    (o) =>
      o instanceof THREE.Mesh &&
      o.geometry instanceof THREE.CircleGeometry &&
      o.geometry.parameters.radius === 0.012,
  );
  expect(lenses).toHaveLength(2);
  expect(lenses[1].position.x - lenses[0].position.x).toBeCloseTo(0.144);
  const frustums = cameraGroup.children.filter((o) => o instanceof THREE.Group);
  expect(frustums).toHaveLength(2);
  expect(frustums.map((o) => o.position.x)).toEqual([-0.072, 0.072]);
  disposeGroup(cameraGroup);
});

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
