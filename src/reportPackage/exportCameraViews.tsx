import { renderToStaticMarkup } from "react-dom/server.browser";
import { CameraDiagram } from "../components/CameraImage";
import { cameraImage, type CameraImage } from "../simulation/imaging";
import type { CameraEye, Scheme } from "../models";
import type { CameraViewAssets, CameraViewEntry } from "./types";
import { finiteOrNull, ReportPackageError, safeName } from "./validation";

export function cameraViewEntry(
  scene: CameraImage,
  image: string,
  size: [number, number],
): CameraViewEntry {
  return {
    camera_id: scene.camera.id,
    camera_name: scene.camera.name,
    enabled: scene.camera.enabled,
    eye: scene.eye ?? null,
    model: scene.model.model_name,
    resolution: [scene.model.resolution_width, scene.model.resolution_height],
    image,
    image_size_px: size,
    image_kind: "diagram_overview",
    markers: scene.points.map((p) => ({
      name: p.name,
      diameter_mm: p.diameter,
      u_px: p.reasons.includes("behind") ? null : finiteOrNull(p.u),
      v_px: p.reasons.includes("behind") ? null : finiteOrNull(p.v),
      width_px: finiteOrNull(p.width),
      height_px: finiteOrNull(p.height),
      valid: p.valid,
      reasons: [...p.reasons],
    })),
  };
}
/** Rasterize the existing report diagram; sensor coordinates stay in index.json. */
export async function renderCameraDiagram(scene: CameraImage) {
  const scale = Math.min(
    1,
    2048 / Math.max(scene.model.resolution_width, scene.model.resolution_height),
  );
  const size: [number, number] = [
    Math.max(1, Math.round(scene.model.resolution_width * scale)),
    Math.max(1, Math.round(scene.model.resolution_height * scale)),
  ];
  const svg = renderToStaticMarkup(
    <CameraDiagram scene={scene} label={scene.camera.name} />,
  ).replace(
    "<svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size[0]}" height="${size[1]}"`,
  );
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  const canvas = document.createElement("canvas");
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new ReportPackageError("packageInvalidImage"));
      image.src = url;
    });
    canvas.width = size[0];
    canvas.height = size[1];
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ReportPackageError("packageInvalidImage");
    ctx.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new ReportPackageError("packageInvalidImage")),
        "image/png",
      ),
    );
    return { data: new Uint8Array(await blob.arrayBuffer()), size };
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 1;
  }
}
export async function exportCameraViews(
  scheme: Scheme,
  signal?: AbortSignal,
  progress?: (percent: number) => void,
  render = renderCameraDiagram,
): Promise<CameraViewAssets> {
  const jobs = scheme.objects
    .filter((o) => o.kind === "camera")
    .flatMap((camera, index) =>
      (camera.camera_model_snapshot?.stereo
        ? (["left", "right"] as const)
        : [undefined]
      ).map((eye) => ({ camera, index, eye: eye as CameraEye | undefined })),
    );
  const views: CameraViewEntry[] = [],
    assets: CameraViewAssets["assets"] = [];
  for (const [index, job] of jobs.entries()) {
    signal?.throwIfAborted();
    const scene = cameraImage(scheme, job.camera.id, job.eye);
    if (!scene) throw new ReportPackageError("packageCameraMissing");
    const name = `${String(job.index + 1).padStart(3, "0")}_${safeName(job.camera.name, "Camera")}${job.eye ? `_${job.eye}` : ""}.png`;
    const rendered = await render(scene);
    signal?.throwIfAborted();
    views.push(cameraViewEntry(scene, name, rendered.size));
    assets.push({ path: `camera_views/${name}`, data: rendered.data });
    progress?.(((index + 1) / jobs.length) * 100);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return { views, assets };
}
