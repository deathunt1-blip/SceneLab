import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { makeCamera, makeObject } from "../project/data";
import { createP3Model } from "../camera/repository";
import { makeSceneObject, disposeGroup } from "./scene";
import { pickCandidate, pickSceneObjects } from "./picking";

const ray = (x: number, y: number, z = 5) =>
  new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 0, -1));
describe("viewport picking", () => {
  it("does not select a box through its old one-metre edge tolerance", () => {
    const box = makeObject("box");
    box.position = [0, 0, 0];
    box.size = [1, 1, 1];
    const root = makeSceneObject(box, false, false);
    root.updateMatrixWorld(true);
    const missed = ray(0.9, 0);
    expect(
      missed
        .intersectObject(root, true)
        .some((hit) => hit.object instanceof THREE.LineSegments),
    ).toBe(true);
    expect(pickSceneObjects(missed, [root])).toEqual([]);
    expect(pickSceneObjects(ray(0.4, 0), [root])[0].id).toBe(box.id);
    disposeGroup(root);
  });
  it("ignores a selected camera's transparent frustum in front of another object", () => {
    const camera = makeCamera(createP3Model(), [0, 0, 0], [0, 0, 1]);
    const cam = makeSceneObject(camera, true, true);
    const target = makeObject("box");
    target.position = [1, 0, -1];
    target.size = [0.3, 0.3, 0.3];
    const box = makeSceneObject(target, false, false);
    cam.updateMatrixWorld(true);
    box.updateMatrixWorld(true);
    expect(
      ray(1, 0).intersectObjects([cam, box], true)[0].object.parent?.userData.noPick,
    ).toBe(true);
    expect(pickSceneObjects(ray(1, 0), [cam, box]).map((h) => h.id)).toEqual([target.id]);
    disposeGroup(cam);
    disposeGroup(box);
  });
  it("picks nearest real surfaces, deduplicates meshes and cycles overlapping objects", () => {
    const front = makeObject("tube");
    front.position = [0, 0, 2];
    front.size = [1, 1, 1];
    const back = {
      ...makeObject("box"),
      position: [0, 0, 0] as [number, number, number],
      size: [1, 1, 1] as [number, number, number],
    };
    const roots = [
      makeSceneObject(back, false, false),
      makeSceneObject(front, false, false),
    ];
    const ids = pickSceneObjects(ray(0, 0), roots).map((h) => h.id);
    expect(ids).toEqual([front.id, back.id]);
    expect(pickCandidate(ids, back.id, false)).toBe(front.id);
    expect(pickCandidate(ids, front.id, true)).toBe(back.id);
    expect(pickCandidate(ids, back.id, true)).toBe(front.id);
    roots[1].visible = false;
    expect(pickSceneObjects(ray(0, 0), roots).map((h) => h.id)).toEqual([back.id]);
    roots.forEach(disposeGroup);
  });
  it("skips invisible descendants and honors ancestor noPick flags", () => {
    const root = new THREE.Group();
    root.userData.id = "owner";
    const helper = new THREE.Group();
    helper.userData.noPick = true;
    helper.add(
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()),
    );
    root.add(helper);
    expect(pickSceneObjects(ray(0, 0), [root])).toEqual([]);
    helper.userData.noPick = false;
    helper.children[0].visible = false;
    expect(pickSceneObjects(ray(0, 0), [root])).toEqual([]);
    disposeGroup(root);
  });
});
