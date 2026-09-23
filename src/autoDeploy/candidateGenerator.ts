import type { CameraModel, SceneObject, Scheme, Vec3 } from "../models";
import { beamAxis, isBeam } from "../project/structures";
import { add, length, lookAt, rotate, sub, unrotate } from "../simulation/math";
import { obstacles, pointInside } from "../simulation/engine";
import type { Candidate, Constraints, Layout, MountInfo, Parameters } from "./types";

export const structuresIn = (s: Scheme) =>
  s.objects.filter((o) => o.visible && o.enabled && (isBeam(o) || o.kind === "surface"));
export function layoutsFor(c: Constraints, s: Scheme): Layout[] {
  return c.installation === "auto"
    ? [
        "perimeter",
        "ceiling",
        "hybrid",
        "free",
        ...(structuresIn(s).length ? ["existing" as const] : []),
      ]
    : [c.installation];
}
export function initialParameters(
  c: Constraints,
  m: CameraModel,
  layout: Layout,
  count: number,
): Parameters {
  // Vertical field width at a typical cross-volume distance guides the starting layers.
  const verticalSpan =
    2 *
    Math.min(c.boundary[0], c.boundary[1]) *
    0.6 *
    Math.tan((m.vfov_deg * Math.PI) / 360);
  const layers =
    c.layers === "auto"
      ? layout === "ceiling"
        ? 1
        : Math.min(3, Math.max(1, Math.ceil(c.boundary[2] / Math.max(1, verticalSpan))))
      : c.layers;
  return {
    modelId: m.id,
    count,
    layout,
    layers,
    height: 0.87,
    spread: 0.5,
    aim: 0.4,
    cross: 0.2,
    phase: ((c.seed % 997) / 997) * 0.3,
    ceilingRatio: 0.4,
    freeShape: "rectangle",
  };
}
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
const object = (
  id: string,
  kind: SceneObject["kind"],
  position: Vec3,
  size: Vec3,
): SceneObject => ({
  id,
  kind,
  name: id,
  position,
  size,
  rotation: [0, 0, 0],
  visible: true,
  enabled: true,
  locked: false,
  occlusion: kind === "tube",
});
const spacingFor = (m: CameraModel) =>
  Math.max(0.3, (m.housing_mm?.[0] || 220) / 1000 + 0.1);

/** Largest remainder apportionment keeps long sides proportional and preserves exact totals. */
export function apportion(count: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const quotas = weights.map((w) => (count * w) / sum),
    out = quotas.map(Math.floor);
  const order = quotas
    .map((q, i) => ({ i, fraction: q - out[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  const remaining = count - out.reduce((a, b) => a + b, 0);
  for (let j = 0; j < remaining; j++) out[order[j].i]++;
  return out;
}
type Slot = { position: Vec3; reference: string; side: string; layer: number };
function existingSlots(s: Scheme, m: CameraModel, aim: Vec3): Slot[] {
  const gap = spacingFor(m),
    slots: Slot[] = [];
  for (const structure of structuresIn(s).sort((a, b) => a.id.localeCompare(b.id))) {
    const localAim = unrotate(sub(aim, structure.position), structure.rotation);
    const addSlot = (p: Vec3) =>
      slots.push({
        position: add(structure.position, rotate(p, structure.rotation)),
        reference: structure.id,
        side: "mount",
        layer: 0,
      });
    if (structure.kind === "surface") {
      const nx = Math.floor(structure.size[0] / gap),
        ny = Math.floor(structure.size[1] / gap);
      const z = (localAim[2] >= 0 ? 1 : -1) * (structure.size[2] / 2 + 0.13);
      // Cap candidates for unusually large surfaces; capacity beyond 200 is unnecessary.
      const stride = Math.max(1, Math.ceil(Math.sqrt((nx * ny) / 1600)));
      for (let y = 0; y < ny; y += stride)
        for (let x = 0; x < nx; x += stride)
          addSlot([
            ((x + 0.5) / nx - 0.5) * structure.size[0],
            ((y + 0.5) / ny - 0.5) * structure.size[1],
            z,
          ]);
    } else {
      const axis = beamAxis(structure),
        n = Math.min(1600, Math.floor(structure.size[axis] / gap));
      const sides = [0, 1, 2].filter((i) => i !== axis);
      const side = sides.sort((a, b) => Math.abs(localAim[b]) - Math.abs(localAim[a]))[0];
      for (let i = 0; i < n; i++) {
        const p: Vec3 = [0, 0, 0];
        p[axis] = ((i + 0.5) / n - 0.5) * structure.size[axis];
        p[side] = (localAim[side] >= 0 ? 1 : -1) * (structure.size[side] / 2 + 0.13);
        addSlot(p);
      }
    }
  }
  return slots.filter((slot) => !obstacles(s).some((o) => pointInside(slot.position, o)));
}

export function generateCandidate(
  s: Scheme,
  c: Constraints,
  m: CameraModel,
  params: Parameters,
): Candidate {
  const id = `auto-${hash(JSON.stringify(params))}`;
  const candidate: Candidate = {
    id,
    params: { ...params },
    cameras: [],
    structures: [],
    mounts: [],
    feasible: true,
  };
  const [lx, ly, lz] = c.boundary,
    gap = spacingFor(m);
  const top = Math.min(lz - 0.18, Math.max(0.25, lz * params.height));
  const targetZ = c.activity
    ? c.activity[0] + params.aim * (c.activity[1] - c.activity[0])
    : params.aim * lz;
  const fail = (reason: string) => {
    candidate.feasible = false;
    candidate.infeasibleReason = reason;
    return candidate;
  };
  const addCamera = (
    p: Vec3,
    mount: Omit<MountInfo, "cameraId" | "position">,
    index: number,
  ) => {
    const target: Vec3 = [-p[0] * params.cross, -p[1] * params.cross, targetZ];
    const camId = `${id}-cam-${index}`;
    candidate.cameras.push({
      ...object(camId, "camera", p, [0.22, 0.18, 0.15]),
      name: `CAM ${String(index + 1).padStart(2, "0")}`,
      rotation: lookAt(p, target),
      camera_model_id: m.id,
      camera_model_snapshot: structuredClone(m),
      mount: mount.reference,
    });
    candidate.mounts.push({ ...mount, cameraId: camId, position: [...p] });
  };
  const beam = (p: Vec3, size: Vec3, rotation: Vec3 = [0, 0, 0]) => {
    const b = object(`${id}-beam-${candidate.structures.length}`, "tube", p, size);
    b.rotation = rotation;
    b.name = `Auto · ${candidate.structures.length + 1}`;
    candidate.structures.push(b);
    return b.id;
  };
  if (
    (params.layout !== "existing" && params.count < params.layers) ||
    top < 0.15 ||
    lx < gap ||
    ly < gap
  )
    return fail("adMountSpace");
  if (params.layout === "existing") {
    let available = existingSlots(s, m, [0, 0, targetZ]);
    // Quantize real mounting heights into 10 cm bands, rather than inventing extra layers.
    const bands = new Map<number, Slot[]>();
    for (const slot of available) {
      const key = Math.round(slot.position[2] * 10);
      bands.set(key, [...(bands.get(key) || []), slot]);
    }
    if (c.layers !== "auto") {
      const requestedLayers = c.layers;
      if (bands.size < c.layers) return fail("adMountLayers");
      const heights = [...bands.keys()].sort((a, b) => a - b);
      const chosenHeights =
        c.layers === 1
          ? [
              heights.reduce((a, b) =>
                Math.abs(a / 10 - top) <= Math.abs(b / 10 - top) ? a : b,
              ),
            ]
          : Array.from(
              { length: c.layers },
              (_, i) =>
                heights[Math.round((i * (heights.length - 1)) / (requestedLayers - 1))],
            );
      available = chosenHeights.flatMap((h) => bands.get(h)!);
    }
    if (available.length < params.count) return fail("adMountCapacity");
    // Greedy farthest placement gives actual spatial separation across available structures.
    const chosen: Slot[] = [];
    const start = Math.floor(params.phase * available.length) % available.length;
    chosen.push(available.splice(start, 1)[0]);
    while (chosen.length < params.count && available.length) {
      let best = -1,
        distance = -1;
      for (let i = 0; i < available.length; i++) {
        const d = Math.min(
          ...chosen.map((p) => length(sub(p.position, available[i].position))),
        );
        if (d >= gap && d > distance) {
          distance = d;
          best = i;
        }
      }
      if (best < 0) return fail("adMountCapacity");
      chosen.push(available.splice(best, 1)[0]);
    }
    const usedHeights = [
      ...new Set(chosen.map((slot) => Math.round(slot.position[2] * 10))),
    ].sort((a, b) => a - b);
    if (c.layers !== "auto" && usedHeights.length !== c.layers)
      return fail("adMountLayers");
    candidate.params.layers = usedHeights.length;
    chosen.forEach((slot, i) =>
      addCamera(
        slot.position,
        {
          type: "existing",
          reference: slot.reference,
          side: slot.side,
          layer: usedHeights.indexOf(Math.round(slot.position[2] * 10)),
        },
        i,
      ),
    );
  } else {
    const ceilingCount =
      params.layout === "ceiling"
        ? params.count
        : params.layout === "hybrid"
          ? Math.max(1, Math.round(params.count * params.ceilingRatio))
          : 0;
    const perimeterCount = params.count - ceilingCount;
    const perLayer = apportion(perimeterCount, Array(params.layers).fill(1));
    for (let layer = 0; layer < params.layers; layer++) {
      const n = perLayer[layer],
        z =
          params.layers === 1
            ? top
            : top - lz * params.spread * (1 - layer / (params.layers - 1));
      if (n && z < 0.2) return fail("adMountSpace");
      if (params.layout === "free" && params.freeShape !== "rectangle") {
        for (let i = 0; i < n; i++) {
          const angle =
            (i / n + params.phase) *
            Math.PI *
            2 *
            (params.freeShape === "arc" ? 0.75 : 1);
          addCamera(
            [(lx / 2 - 0.08) * Math.cos(angle), (ly / 2 - 0.08) * Math.sin(angle), z],
            { type: "tripod", layer, side: params.freeShape },
            candidate.cameras.length,
          );
        }
      } else {
        const counts = apportion(n, [lx, ly, lx, ly]);
        for (let side = 0; side < 4; side++) {
          const amount = counts[side],
            longX = side % 2 === 0,
            extent = longX ? lx : ly;
          if (!amount) continue;
          if (extent / amount < gap) return fail("adMountCapacity");
          const reference =
            params.layout === "free"
              ? undefined
              : beam(
                  longX
                    ? [0, (side === 0 ? -1 : 1) * (ly / 2 - 0.08), z + 0.18]
                    : [(side === 1 ? 1 : -1) * (lx / 2 - 0.08), 0, z + 0.18],
                  [extent, 0.08, 0.08],
                  longX ? [0, 0, 0] : [90, 0, 0],
                );
          for (let i = 0; i < amount; i++) {
            const along =
              ((i + 0.5 + Math.sin(layer + side) * params.phase * 0.3) / amount - 0.5) *
              (extent - 0.3);
            const p: Vec3 = longX
              ? [along, (side === 0 ? -1 : 1) * (ly / 2 - 0.08), z]
              : [(side === 1 ? 1 : -1) * (lx / 2 - 0.08), along, z];
            addCamera(
              p,
              {
                type: params.layout === "free" ? "tripod" : "truss",
                reference,
                layer,
                side: ["south", "east", "north", "west"][side],
              },
              candidate.cameras.length,
            );
          }
        }
      }
    }
    if (ceilingCount) {
      const ceilingLayers = params.layout === "ceiling" ? params.layers : 1;
      const atHeight = apportion(ceilingCount, Array(ceilingLayers).fill(1));
      for (let level = 0; level < ceilingLayers; level++) {
        const z =
          ceilingLayers === 1
            ? top
            : top -
              lz * Math.min(0.22, params.spread) * (1 - level / (ceilingLayers - 1));
        const amountAtHeight = atHeight[level];
        const cols = Math.max(1, Math.ceil(Math.sqrt((amountAtHeight * lx) / ly))),
          rows = Math.ceil(amountAtHeight / cols);
        if (lx / cols < gap || ly / rows < gap) return fail("adMountCapacity");
        const rowCounts = apportion(amountAtHeight, Array(rows).fill(1));
        for (let row = 0; row < rows; row++) {
          const y = ((row + 0.5) / rows - 0.5) * (ly - 0.25),
            amount = rowCounts[row];
          const reference = beam([0, y, z + 0.18], [lx, 0.08, 0.08]);
          for (let col = 0; col < amount; col++) {
            const x =
              ((col + 0.5 + (row % 2 ? params.phase * 0.5 : -params.phase * 0.5)) /
                amount -
                0.5) *
              (lx - 0.4);
            addCamera(
              [x, y, z],
              {
                type: "ceiling",
                reference,
                side: "ceiling",
                layer: params.layout === "hybrid" ? params.layers - 1 : level,
              },
              candidate.cameras.length,
            );
          }
        }
      }
    }
  }
  if (candidate.cameras.length !== params.count) return fail("adMountCapacity");
  const occluders = [...obstacles(s), ...candidate.structures.filter((o) => o.occlusion)];
  for (let i = 0; i < candidate.cameras.length; i++) {
    const cam = candidate.cameras[i];
    if (occluders.some((o) => pointInside(cam.position, o)))
      return fail("adMountCollision");
    if (
      candidate.cameras
        .slice(0, i)
        .some((o) => length(sub(o.position, cam.position)) < gap)
    )
      return fail("adMountCapacity");
  }
  return candidate;
}

export function candidateScheme(
  s: Scheme,
  c: Constraints,
  candidate: Candidate,
  voxel = s.settings.voxel,
): Scheme {
  return {
    ...s,
    id: candidate.id,
    revision: 0,
    boundary: [...c.boundary],
    settings: {
      ...s.settings,
      voxel,
      markerDiameter: c.markerDiameter,
      errorThreshold: c.errorThreshold,
    },
    objects: [
      ...s.objects.filter((o) => o.kind !== "camera"),
      ...candidate.structures,
      ...candidate.cameras,
    ],
  };
}
