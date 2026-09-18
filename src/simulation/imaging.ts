import type { Observation, Scheme, Vec3 } from "../models";
import { observe, obstacles, project, worldMarkers, type PreparedCamera } from "./engine";
import { add, basis, rotate } from "./math";

export interface ImageMarker extends Observation {
  id: string;
  name: string;
  diameter: number;
  width: number;
  height: number;
  drawable: boolean;
}

export function cameraImage(s: Scheme, cameraId: string) {
  const object = s.objects.find((o) => o.id === cameraId && o.kind === "camera");
  if (!object?.camera_model_snapshot) return null;
  const c: PreparedCamera = {
    object,
    model: object.camera_model_snapshot,
    axes: basis(object.rotation),
  };
  const segments: { a: Vec3; b: Vec3; color: string }[] = [];
  const box = (position: Vec3, size: Vec3, rotation: Vec3, color: string) => {
    const corners = Array.from({ length: 8 }, (_, i) =>
      add(
        position,
        rotate(
          [
            (size[0] / 2) * (i & 1 ? 1 : -1),
            (size[1] / 2) * (i & 2 ? 1 : -1),
            (size[2] / 2) * (i & 4 ? 1 : -1),
          ],
          rotation,
        ),
      ),
    );
    for (let i = 0; i < 8; i++)
      for (let axis = 0; axis < 3; axis++) {
        if (!(i & (1 << axis)))
          segments.push({ a: corners[i], b: corners[i | (1 << axis)], color });
      }
  };
  box([0, 0, s.boundary[2] / 2], s.boundary, [0, 0, 0], "#34454b");
  for (const o of s.objects)
    if (o.visible && ["box", "cylinder", "wall", "truss", "surface"].includes(o.kind))
      box(o.position, o.size, o.rotation, o.kind === "truss" ? "#50656b" : "#77929a");
  const projected = segments.flatMap(({ a, b, color }) => {
    let pa = project(a, c),
      pb = project(b, c);
    const near = 0.01;
    if (pa.z < near && pb.z < near) return [];
    if (pa.z < near || pb.z < near) {
      const fraction = (near - pa.z) / (pb.z - pa.z);
      const cut = a.map((v, i) => v + (b[i] - v) * fraction) as Vec3;
      if (pa.z < near) pa = project(cut, c);
      else pb = project(cut, c);
    }
    return [pa.u, pa.v, pb.u, pb.v].every(Number.isFinite)
      ? [{ a: pa, b: pb, color }]
      : [];
  });
  const occluders = obstacles(s);
  const points: ImageMarker[] = s.objects
    .filter((o) => o.visible && ["marker", "rigidBody"].includes(o.kind))
    .flatMap((o) =>
      worldMarkers(o).map((p, i) => {
        const obs = observe(p.position, p.diameter, c, occluders);
        const { z } = project(p.position, c);
        const width = z > 0 ? (c.model.fx * p.diameter) / 1000 / z : 0;
        const height = z > 0 ? (c.model.fy * p.diameter) / 1000 / z : 0;
        const drawable =
          z > 0 &&
          !obs.reasons.includes("occluded") &&
          [obs.u, obs.v, width, height].every(Number.isFinite) &&
          obs.u + width / 2 >= 0 &&
          obs.u - width / 2 < c.model.resolution_width &&
          obs.v + height / 2 >= 0 &&
          obs.v - height / 2 < c.model.resolution_height;
        return {
          ...obs,
          id: `${o.id}:${i}`,
          name: o.kind === "rigidBody" ? `${o.name} / M${i + 1}` : o.name,
          diameter: p.diameter,
          width,
          height,
          drawable,
        };
      }),
    );
  return { camera: object, model: c.model, projected, points };
}
export type CameraImage = NonNullable<ReturnType<typeof cameraImage>>;

/** One raster pixel is one sensor pixel; markers have no minimum symbol size here. */
export function drawCameraImage(
  ctx: CanvasRenderingContext2D,
  scene: CameraImage,
  guides = true,
) {
  const { model: m } = scene;
  ctx.fillStyle = "#101c21";
  ctx.fillRect(0, 0, m.resolution_width, m.resolution_height);
  if (guides) {
    ctx.lineWidth = 1;
    for (const l of scene.projected) {
      ctx.strokeStyle = l.color;
      ctx.beginPath();
      ctx.moveTo(l.a.u, l.a.v);
      ctx.lineTo(l.b.u, l.b.v);
      ctx.stroke();
    }
  }
  for (const p of scene.points)
    if (p.drawable && p.width > 0 && p.height > 0) {
      ctx.fillStyle = p.valid ? "#4ce1b5" : "#ec8973";
      ctx.beginPath();
      ctx.ellipse(p.u, p.v, p.width / 2, p.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
}

export function zoomImageAt(
  view: { x: number; y: number; zoom: number },
  zoom: number,
  anchor: { x: number; y: number },
) {
  return {
    zoom,
    x: anchor.x - ((anchor.x - view.x) * zoom) / view.zoom,
    y: anchor.y - ((anchor.y - view.y) * zoom) / view.zoom,
  };
}
