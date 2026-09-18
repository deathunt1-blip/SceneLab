import { expect, it } from "vitest";
import { makeObject } from "./data";
import { pasteObjects } from "./clipboard";

it("remaps copied mounts, detaches external mounts and preserves nested marker data", () => {
  const truss = makeObject("truss"),
    cam = makeObject("camera"),
    rigid = makeObject("rigidBody");
  cam.mount = truss.id;
  rigid.markers = [{ position: [0, 0, 0.2], diameter: 6 }];
  const copies = pasteObjects([truss, cam, rigid], [truss, cam, rigid], [0.1, 0.1, 0]);
  expect(copies[1].mount).toBe(copies[0].id);
  expect(pasteObjects([cam], [truss, cam], [0, 0, 0])[0].mount).toBeUndefined();
  copies[2].markers![0].diameter = 12;
  expect(rigid.markers[0].diameter).toBe(6);
});
