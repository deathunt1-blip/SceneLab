import type { Scheme, SimulationResult } from "../models";
import type { Asset, ImageEntry, ReportImage } from "./types";
import { ReportPackageError } from "./validation";

export const CORE_IMAGES = [
  ["deployment", "perspective", "none"],
  ["coverage", "top", "coverage"],
  ["coverage", "perspective", "coverage"],
  ["accuracy", "perspective", "accuracy"],
  ["accuracy", "front", "accuracy"],
  ["accuracy", "side", "accuracy"],
] as const;
export function pngData(data: string) {
  try {
    if (!data.startsWith("data:image/png;base64,")) throw new Error();
    const bytes = Uint8Array.from(atob(data.slice(22)), (c) => c.charCodeAt(0));
    if (
      bytes.length < 33 ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
    )
      throw new Error();
    const header = new DataView(bytes.buffer);
    if (header.getUint32(12) !== 0x49484452) throw new Error();
    const size: [number, number] = [header.getUint32(16), header.getUint32(20)];
    if (!size.every((n) => n > 0 && n <= 65535)) throw new Error();
    return { bytes, size };
  } catch {
    throw new ReportPackageError("packageInvalidImage");
  }
}
export function exportImages(
  images: ReportImage[],
  scheme: Scheme,
  result: SimulationResult,
) {
  const current = images.filter(
    (i) =>
      i.schemeId === scheme.id &&
      i.revision === scheme.revision &&
      (i.layer === "none" || i.analysisTimestamp === result.timestamp),
  );
  const entries: ImageEntry[] = [],
    assets: Asset[] = [];
  const add = (image: ReportImage, role: ImageEntry["role"], file: string) => {
    const { bytes, size } = pngData(image.data);
    entries.push({
      role,
      view: image.view,
      file,
      clip_m: image.clip,
      image_size_px: size,
    });
    assets.push({ path: file, data: bytes });
  };
  for (const [role, view, layer] of CORE_IMAGES) {
    const image = current.find((i) => !i.manual && i.view === view && i.layer === layer);
    if (!image) throw new ReportPackageError("packageImagesMissing");
    add(image, role, `images/${role}_${view}.png`);
  }
  current
    .filter((i) => i.manual)
    .forEach((image, i) =>
      add(image, "manual", `images/manual_${String(i + 1).padStart(2, "0")}.png`),
    );
  return { entries, assets };
}
