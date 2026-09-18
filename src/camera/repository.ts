import type { CameraModel } from "../models";
import { uid } from "../models";
import { catalogEntries, catalogVersion } from "./catalog";
const KEY = "camera-planner.camera-library.v1";
let appliedCatalogs: string[] = [];
export const storageStatus = { error: "" };
export function readStored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    storageStatus.error = "storageError";
    return null;
  }
}
export function preserveUnreadable(key: string) {
  const raw = readStored(key);
  if (raw !== null)
    try {
      localStorage.setItem(key + ".recovery." + Date.now(), raw);
    } catch {
      /* Preserve the original key when backup storage is unavailable. */
    }
}
export function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (storageStatus.error === "storageError") storageStatus.error = "";
    return true;
  } catch {
    storageStatus.error = "storageError";
    return false;
  }
}
export function derive(m: CameraModel): CameraModel {
  return {
    ...m,
    fx: m.resolution_width / 2 / Math.tan((m.hfov_deg * Math.PI) / 360),
    fy: m.resolution_height / 2 / Math.tan((m.vfov_deg * Math.PI) / 360),
    cx: m.resolution_width / 2,
    cy: m.resolution_height / 2,
  };
}
export function newModel(): CameraModel {
  const now = new Date().toISOString();
  return derive({
    id: uid(),
    manufacturer: "Custom",
    model_name: "ABC-400",
    display_name: "ABC-400",
    resolution_width: 4096,
    resolution_height: 3072,
    fx: 0,
    fy: 0,
    cx: 2048,
    cy: 1536,
    hfov_deg: 70,
    vfov_deg: 58,
    focal_length_mm: 8,
    min_working_distance_m: 0.5,
    max_working_distance_m: 20,
    default_pixel_localization_error_px: 0.1,
    minimum_marker_pixels: 4,
    distortion_model: "none",
    distortion_parameters: [0, 0, 0, 0, 0],
    source: "user",
    input_mode: "basic",
    notes: "",
    created_at: now,
    updated_at: now,
  });
}
export function validateModel(m: CameraModel): string[] {
  const errors: string[] = [];
  if (
    !m.id ||
    typeof m.id !== "string" ||
    typeof m.model_name !== "string" ||
    !m.model_name.trim() ||
    typeof m.manufacturer !== "string" ||
    !m.manufacturer.trim()
  )
    errors.push("nameRequired");
  const positive = [
    "resolution_width",
    "resolution_height",
    "fx",
    "fy",
    "minimum_marker_pixels",
    "default_pixel_localization_error_px",
    "focal_length_mm",
  ] as const;
  if (
    positive.some(
      (k) => typeof m[k] !== "number" || !Number.isFinite(m[k]) || m[k] <= 0,
    ) ||
    !Number.isInteger(m.resolution_width) ||
    !Number.isInteger(m.resolution_height)
  )
    errors.push("positiveRequired");
  if (
    !Number.isFinite(m.min_working_distance_m) ||
    m.min_working_distance_m < 0 ||
    (m.max_working_distance_m === null
      ? m.layout_supported !== false
      : !Number.isFinite(m.max_working_distance_m) ||
        m.max_working_distance_m <= m.min_working_distance_m)
  )
    errors.push("rangeInvalid");
  if (
    !Number.isFinite(m.hfov_deg) ||
    !Number.isFinite(m.vfov_deg) ||
    m.hfov_deg <= 1 ||
    m.hfov_deg >= 179 ||
    m.vfov_deg <= 1 ||
    m.vfov_deg >= 179
  )
    errors.push("fovInvalid");
  if (
    !Number.isFinite(m.cx) ||
    !Number.isFinite(m.cy) ||
    m.cx < 0 ||
    m.cx > m.resolution_width ||
    m.cy < 0 ||
    m.cy > m.resolution_height
  )
    errors.push("principalInvalid");
  if (
    !["none", "brown"].includes(m.distortion_model) ||
    !Array.isArray(m.distortion_parameters) ||
    m.distortion_parameters.length !== 5 ||
    m.distortion_parameters.some((v) => !Number.isFinite(v))
  )
    errors.push("distortionInvalid");
  if (!["basic", "advanced"].includes(m.input_mode)) errors.push("invalidFile");
  if (
    [m.layout_supported, m.enabled_for_layout_default].some(
      (v) => v !== undefined && typeof v !== "boolean",
    )
  )
    errors.push("invalidFile");
  if (
    m.input_mode === "basic" &&
    [Math.abs(m.fx - derive(m).fx) / m.fx, Math.abs(m.fy - derive(m).fy) / m.fy].some(
      (x) => x > 0.02,
    )
  )
    errors.push("intrinsicsConflict");
  return [...new Set(errors)];
}
export function readLibrary(): CameraModel[] {
  appliedCatalogs = [];
  const raw = readStored(KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (
        data.schema_version !== 1 ||
        !Array.isArray(data.models) ||
        data.models.some((m: CameraModel) => validateModel(m).length)
      )
        throw new Error();
      appliedCatalogs = Array.isArray(data.applied_catalogs) ? data.applied_catalogs : [];
      return addCatalog(data.models);
    } catch {
      preserveUnreadable(KEY);
      storageStatus.error = "libraryCorrupt";
      return [];
    }
  }
  const model = derive({
    ...newModel(),
    id: "demo-m4",
    manufacturer: "DEMO",
    model_name: "M4 · Demo",
    display_name: "M4 · Demo",
    hfov_deg: 60,
    vfov_deg: 48,
    source: "preset",
    notes: "Synthetic demonstration parameters. Not a commercial camera specification.",
  });
  return addCatalog([model]);
}
export const createCatalogModels = () =>
  catalogEntries().map((entry) => derive({ ...newModel(), ...entry }));
function addCatalog(models: CameraModel[]) {
  if (appliedCatalogs.includes(catalogVersion)) return models;
  const additions = createCatalogModels().filter(
    (entry) =>
      !models.some(
        (m) =>
          m.id === entry.id ||
          (m.catalog?.dataset === catalogVersion &&
            m.catalog.optical.profile_id === entry.catalog!.optical.profile_id),
      ),
  );
  const merged = [...models, ...additions];
  const nextCatalogs = [...appliedCatalogs, catalogVersion];
  if (
    persist(KEY, { schema_version: 1, models: merged, applied_catalogs: nextCatalogs })
  ) {
    appliedCatalogs = nextCatalogs;
    return merged;
  }
  return models;
}
export const writeLibrary = (models: CameraModel[]) =>
  persist(KEY, { schema_version: 1, models, applied_catalogs: appliedCatalogs });
export function download(name: string, data: string, type = "application/json") {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([data], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportModels(models: CameraModel[], format: "json" | "csv") {
  if (format === "json")
    download(
      "camera-library.json",
      JSON.stringify({ schema_version: 1, models }, null, 2),
    );
  else download("camera-library.csv", modelsCSV(models), "text/csv;charset=utf-8");
}
export function modelsCSV(models: CameraModel[]) {
  const keys = [
    ...new Set([...Object.keys(newModel()), ...models.flatMap((m) => Object.keys(m))]),
  ] as (keyof CameraModel)[];
  const quote = (v: unknown) =>
    '"' +
    (v === undefined
      ? ""
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v)
    ).replaceAll('"', '""') +
    '"';
  return (
    "\uFEFF" +
    [keys.join(","), ...models.map((m) => keys.map((k) => quote(m[k])).join(","))].join(
      "\r\n",
    )
  );
}
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("invalidFile");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function importModels(text: string, csv: boolean): CameraModel[] {
  let values: Record<string, unknown>[];
  if (csv) {
    const [headers, ...rows] = parseCSV(text.replace(/^\uFEFF/, ""));
    if (!headers) throw new Error("invalidFile");
    const base = newModel();
    values = rows.map((row) =>
      Object.fromEntries(
        headers.map((k, i) => [
          k,
          k === "catalog"
            ? row[i]
              ? JSON.parse(row[i])
              : undefined
            : ["layout_supported", "enabled_for_layout_default"].includes(k)
              ? row[i] === ""
                ? undefined
                : JSON.parse(row[i])
              : k === "max_working_distance_m" && row[i] === "null"
                ? null
                : k === "distortion_parameters"
                  ? JSON.parse(row[i] || "[0,0,0,0,0]")
                  : typeof base[k as keyof CameraModel] === "number"
                    ? Number(row[i])
                    : row[i],
        ]),
      ),
    );
  } else {
    const parsed = JSON.parse(text);
    if (parsed.schema_version !== undefined && parsed.schema_version !== 1)
      throw new Error("schemaUnsupported");
    values = Array.isArray(parsed) ? parsed : parsed.models || [parsed];
  }
  if (!Array.isArray(values) || !values.length) throw new Error("invalidFile");
  return values.map((v) => {
    const model = {
      ...newModel(),
      ...v,
      id: uid(),
      source: "imported",
      display_name: v.display_name || v.model_name,
      updated_at: new Date().toISOString(),
    } as CameraModel;
    if (v.fx === undefined && v.fy === undefined) Object.assign(model, derive(model));
    const errors = validateModel(model);
    if (errors.length) throw new Error(errors[0]);
    return model;
  });
}
