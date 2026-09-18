import { describe, expect, it, vi } from "vitest";
import { makeCamera, makeObject, makeProject } from "../project/data";
import { derive, newModel } from "../camera/repository";
import { cameraImage, drawCameraImage, zoomImageAt } from "./imaging";

function fixture() {
  const model = derive({
    ...newModel(),
    resolution_width: 1000,
    resolution_height: 1000,
    hfov_deg: 90,
    vfov_deg: 90,
  });
  const scheme = makeProject().schemes[0];
  const camera = makeCamera(model, [0, -1, 0], [0, 0, 0]);
  const marker = {
    ...makeObject("marker"),
    position: [0, 0, 0] as [number, number, number],
    diameter: 6,
  };
  scheme.objects = [camera, marker];
  return { scheme, camera, marker };
}

describe("pixel imaging", () => {
  it("uses actual projected size, including subpixel markers and changed diameters", () => {
    const { scheme, camera, marker } = fixture();
    const before = cameraImage(scheme, camera.id)!.points[0];
    expect(before.width).toBeCloseTo(3);
    expect(before.height).toBeCloseTo(3);
    marker.diameter = 12;
    expect(cameraImage(scheme, camera.id)!.points[0].width).toBeCloseTo(6);
    marker.diameter = 0.2;
    expect(cameraImage(scheme, camera.id)!.points[0].width).toBeCloseTo(0.1);
  });

  it("retains diagnostic reasons but does not rasterize occluded or behind-camera markers", () => {
    const { scheme, camera, marker } = fixture();
    scheme.objects.push({
      ...makeObject("box"),
      position: [0, -0.5, 0],
      size: [0.2, 0.2, 0.2],
    });
    let p = cameraImage(scheme, camera.id)!.points[0];
    expect(p.reasons).toContain("occluded");
    expect(p.drawable).toBe(false);
    marker.position = [0, -2, 0];
    p = cameraImage(scheme, camera.id)!.points[0];
    expect(p.reasons).toContain("behind");
    expect(p.drawable).toBe(false);
  });

  it("previews disabled cameras without enabling them in the project", () => {
    const { scheme, camera } = fixture();
    camera.enabled = false;
    expect(cameraImage(scheme, camera.id)!.points[0].width).toBeCloseTo(3);
    expect(camera.enabled).toBe(false);
  });

  it("rasterizes a three-pixel marker with radius 1.5 instead of an enlarged overview symbol", () => {
    const { scheme, camera } = fixture();
    const ctx = {
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
    };
    drawCameraImage(
      ctx as unknown as CanvasRenderingContext2D,
      cameraImage(scheme, camera.id)!,
      false,
    );
    expect(ctx.ellipse.mock.calls[0][2]).toBeCloseTo(1.5);
    expect(ctx.ellipse.mock.calls[0][3]).toBeCloseTo(1.5);
  });

  it("keeps the sensor pixel under the zoom anchor fixed", () => {
    const before = { x: -200, y: -100, zoom: 4 },
      anchor = { x: 300, y: 200 };
    const after = zoomImageAt(before, 16, anchor);
    expect((anchor.x - after.x) / after.zoom).toBe((anchor.x - before.x) / before.zoom);
    expect((anchor.y - after.y) / after.zoom).toBe((anchor.y - before.y) / before.zoom);
  });
});
