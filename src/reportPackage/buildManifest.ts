import { version } from "../../package.json";
import type { Project, Scheme } from "../models";
import { FORMAT_VERSION, type ImageEntry, type PackageOptions } from "./types";

export function buildManifest(
  project: Project,
  scheme: Scheme,
  images: ImageEntry[],
  options: PackageOptions,
  generatedAt: string,
  viewCount: number,
) {
  return {
    format: "scenelab-report",
    format_version: FORMAT_VERSION,
    producer: { name: "SceneLab", version },
    project: {
      name: project.name,
      scheme_name: scheme.name,
      scheme_revision: scheme.revision,
      generated_at: generatedAt,
    },
    files: { project: "project.json", analysis: "analysis.json" },
    images,
    camera_views: options.cameraViews
      ? { included: true, index: "camera_views/index.json", count: viewCount }
      : { included: false },
    diagnostics: { included: options.diagnostics },
  };
}
