import JSZip from "jszip";
import { buildManifest } from "./buildManifest";
import { buildAnalysisExport } from "./buildAnalysisExport";
import { buildProjectExport } from "./buildProjectExport";
import { exportImages } from "./exportImages";
import { assertCurrentAnalysis, safeName } from "./validation";
import type { CameraViewExporter, PackageInput } from "./types";

export async function createPackage(
  input: PackageInput,
  cameraExporter?: CameraViewExporter,
) {
  const { project, result, options, signal, onProgress, assertUnchanged } = input;
  const source = project.schemes.find((s) => s.id === project.activeSchemeId)!;
  assertCurrentAnalysis(source, result);
  assertUnchanged?.();
  signal?.throwIfAborted();
  const projectData = buildProjectExport(project, source);
  const scheme = projectData.scheme;
  const analysis = buildAnalysisExport(scheme, result, options.diagnostics);
  const images = exportImages(input.images, scheme, result);
  const generatedAt = new Date().toISOString();
  const zip = new JSZip();
  const json = (path: string, data: unknown) =>
    zip.file(path, JSON.stringify(data, null, 2), { compression: "DEFLATE" });
  const png = (path: string, data: Uint8Array) =>
    zip.file(path, data, { compression: "STORE" });
  json("project.json", projectData);
  json("analysis.json", analysis);
  for (const asset of images.assets) png(asset.path, asset.data);
  let count = 0;
  if (options.cameraViews) {
    const exporter =
      cameraExporter ?? (await import("./exportCameraViews")).exportCameraViews;
    const camera = await exporter(scheme, signal, (p) => onProgress?.(p * 0.7));
    for (const asset of camera.assets) png(asset.path, asset.data);
    count = camera.views.length;
    json("camera_views/index.json", {
      scheme_id: scheme.id,
      scheme_revision: scheme.revision,
      generated_at: generatedAt,
      coordinate_units: "sensor pixels",
      image_kind: "diagram_overview",
      views: camera.views,
    });
  }
  json(
    "manifest.json",
    buildManifest(project, scheme, images.entries, options, generatedAt, count),
  );
  const bytes = await zip.generateAsync(
    { type: "uint8array", compressionOptions: { level: 6 } },
    ({ percent }) => {
      signal?.throwIfAborted();
      onProgress?.(options.cameraViews ? 70 + percent * 0.3 : percent);
    },
  );
  signal?.throwIfAborted();
  assertUnchanged?.();
  return {
    bytes,
    filename: `${safeName(projectData.name)}_${safeName(scheme.name, "Scheme")}_R${scheme.revision}.scenelab-report`,
  };
}
