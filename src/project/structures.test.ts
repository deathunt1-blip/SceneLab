import { expect, it } from "vitest";
import { makeObject, makeProject, validateProject } from "./data";
import { beamArrayPoint, mountPoint, nearestMount } from "./structures";
import { pointInside } from "../simulation/engine";
import { add, rotate, unrotate, sub } from "../simulation/math";
import { pasteObjects } from "./clipboard";
import type { Vec3 } from "../models";

it("places cameras outside a rotated rectangular tube and clamps them to its length", () => {
  const tube = {
    ...makeObject("tube"),
    position: [2, 1, 3] as Vec3,
    size: [6, 0.08, 0.05] as Vec3,
    rotation: [35, 70, 15] as Vec3,
  };
  const cameraPosition = add(tube.position, rotate([5, 0, -1], tube.rotation));
  const mounted = mountPoint(tube, cameraPosition);
  const local = unrotate(sub(mounted, tube.position), tube.rotation);
  expect(local[0]).toBeCloseTo(3);
  expect(local[1]).toBeCloseTo(0);
  expect(local[2]).toBeCloseTo(-0.035);
  expect(pointInside(mounted, tube)).toBe(false);
  expect(nearestMount([tube], cameraPosition)!.structure.id).toBe(tube.id);
  tube.visible = false;
  expect(nearestMount([tube], cameraPosition)).toBeUndefined();
});

it("arrays cameras along the entire edited tube and supports a single camera", () => {
  const tube = {
    ...makeObject("tube"),
    size: [8, 0.1, 0.2] as Vec3,
    rotation: [90, 0, 0] as Vec3,
  };
  for (let i = 0; i < 5; i++) {
    const point = beamArrayPoint(tube, i, 5);
    const local = unrotate(sub(point, tube.position), tube.rotation);
    expect(local[0]).toBeCloseTo(-4 + i * 2);
    expect(local[2]).toBeCloseTo(-0.11);
    expect(pointInside(point, tube)).toBe(false);
  }
  expect(
    unrotate(sub(beamArrayPoint(tube, 0, 1), tube.position), tube.rotation)[0],
  ).toBeCloseTo(0);
});

it("preserves legacy truss placement and round-trips tube objects and copied mount references", () => {
  const truss = makeObject("truss");
  expect(mountPoint(truss, [2, 4, 0])).toEqual([2, 0, 1]);
  const p = makeProject();
  const tube = makeObject("tube");
  p.schemes[0].objects.push(tube);
  const restored = JSON.parse(JSON.stringify(p));
  expect(() => validateProject(restored)).not.toThrow();
  expect(restored.schemes[0].objects.at(-1).size).toEqual([4, 0.05, 0.05]);
  const marker = { ...makeObject("marker"), mount: tube.id };
  const copies = pasteObjects([tube, marker], [tube, marker], [0.1, 0.1, 0]);
  expect(copies[1].mount).toBe(copies[0].id);
});
