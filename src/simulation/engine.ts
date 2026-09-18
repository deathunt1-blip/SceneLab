import type {
  Accuracy,
  CameraModel,
  Observation,
  PointResult,
  SceneObject,
  Scheme,
  SimulationResult,
  Vec3,
} from "../models";
import {
  add,
  basis,
  cross,
  dot,
  inverseSymmetric,
  length,
  mul,
  rotate,
  sub,
  unrotate,
} from "./math";
export interface PreparedCamera {
  object: SceneObject;
  model: CameraModel;
  axes: [Vec3, Vec3, Vec3];
}
export const prepareCameras = (s: Scheme): PreparedCamera[] =>
  s.objects
    .filter(
      (o) =>
        o.kind === "camera" &&
        o.enabled &&
        o.camera_model_snapshot &&
        o.camera_model_snapshot.layout_supported !== false,
    )
    .map((object) => ({
      object,
      model: object.camera_model_snapshot!,
      axes: basis(object.rotation),
    }));
export const obstacles = (s: Scheme) =>
  s.objects.filter(
    (o) =>
      o.enabled &&
      o.occlusion &&
      ["box", "cylinder", "wall", "surface", "truss"].includes(o.kind),
  );
export function pointInside(p: Vec3, o: SceneObject) {
  const v = unrotate(sub(p, o.position), o.rotation);
  if (o.kind === "cylinder")
    return (
      (v[0] / (o.size[0] / 2)) ** 2 + (v[1] / (o.size[1] / 2)) ** 2 <= 1 &&
      Math.abs(v[2]) <= o.size[2] / 2
    );
  return v.every((x, i) => Math.abs(x) <= o.size[i] / 2);
}
// Finite segment intersection in obstacle-local coordinates; t is a fraction of camera→point.
export function intersectObstacle(start: Vec3, end: Vec3, o: SceneObject): number | null {
  const a = unrotate(sub(start, o.position), o.rotation),
    d = unrotate(sub(end, start), o.rotation);
  let enter = 0,
    exit = 1;
  if (o.kind === "cylinder") {
    const rx = o.size[0] / 2,
      ry = o.size[1] / 2,
      A = (d[0] / rx) ** 2 + (d[1] / ry) ** 2,
      B = 2 * ((a[0] * d[0]) / rx ** 2 + (a[1] * d[1]) / ry ** 2),
      C = (a[0] / rx) ** 2 + (a[1] / ry) ** 2 - 1;
    if (A < 1e-14) {
      if (C > 0) return null;
    } else {
      const disc = B * B - 4 * A * C;
      if (disc < 0) return null;
      const r = Math.sqrt(disc);
      enter = Math.max(enter, (-B - r) / (2 * A));
      exit = Math.min(exit, (-B + r) / (2 * A));
    }
    if (Math.abs(d[2]) < 1e-12) {
      if (Math.abs(a[2]) > o.size[2] / 2) return null;
    } else {
      const t1 = (-o.size[2] / 2 - a[2]) / d[2],
        t2 = (o.size[2] / 2 - a[2]) / d[2];
      enter = Math.max(enter, Math.min(t1, t2));
      exit = Math.min(exit, Math.max(t1, t2));
    }
  } else
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-12) {
        if (Math.abs(a[i]) > o.size[i] / 2) return null;
      } else {
        const t1 = (-o.size[i] / 2 - a[i]) / d[i],
          t2 = (o.size[i] / 2 - a[i]) / d[i];
        enter = Math.max(enter, Math.min(t1, t2));
        exit = Math.min(exit, Math.max(t1, t2));
      }
    }
  return enter <= exit && exit > 1e-7 && enter < 1 - 1e-7 ? Math.max(0, enter) : null;
}
export function project(p: Vec3, c: PreparedCamera) {
  const d = sub(p, c.object.position);
  const [x, y, z] = c.axes.map((a) => dot(a, d));
  const nx = x / z,
    ny = y / z;
  let dx = nx,
    dy = ny;
  if (c.model.distortion_model === "brown") {
    const [k1, k2, p1, p2, k3] = c.model.distortion_parameters;
    const r2 = nx * nx + ny * ny,
      radial = 1 + k1 * r2 + k2 * r2 * r2 + k3 * r2 * r2 * r2;
    dx = nx * radial + 2 * p1 * nx * ny + p2 * (r2 + 2 * nx * nx);
    dy = ny * radial + p1 * (r2 + 2 * ny * ny) + 2 * p2 * nx * ny;
  }
  return {
    x,
    y,
    z,
    u: c.model.fx * dx + c.model.cx,
    v: c.model.fy * dy + c.model.cy,
    distance: length(d),
  };
}
export function observe(
  p: Vec3,
  diameter: number,
  c: PreparedCamera,
  occluders: SceneObject[],
): Observation {
  const { z, u, v, distance } = project(p, c),
    m = c.model;
  const pixels = z > 0 ? (Math.min(m.fx, m.fy) * diameter) / 1000 / z : 0;
  const out: Observation = {
    cameraId: c.object.id,
    valid: false,
    reasons: [],
    distance,
    u,
    v,
    pixels,
    minimumDiameter:
      z > 0 ? ((m.minimum_marker_pixels * z) / Math.min(m.fx, m.fy)) * 1000 : 0,
    margin: Math.min(u, v, m.resolution_width - u, m.resolution_height - v) - pixels / 2,
  };
  if (z <= 0) out.reasons.push("behind");
  else {
    if (u < 0 || u >= m.resolution_width || v < 0 || v >= m.resolution_height)
      out.reasons.push("fov");
    else if (out.margin <= 0) out.reasons.push("edge");
    if (pixels < m.minimum_marker_pixels) out.reasons.push("small");
  }
  if (distance < m.min_working_distance_m) out.reasons.push("close");
  if (m.max_working_distance_m !== null && distance > m.max_working_distance_m)
    out.reasons.push("far");
  let nearest = Infinity;
  for (const o of occluders) {
    const t = intersectObstacle(c.object.position, p, o);
    if (t !== null && t < nearest) {
      nearest = t;
      out.occluderId = o.id;
    }
  }
  if (out.occluderId) {
    out.reasons.push("occluded");
    out.intersection = add(c.object.position, mul(sub(p, c.object.position), nearest));
  }
  out.valid = out.reasons.length === 0;
  return out;
}
export function jacobian(p: Vec3, c: PreparedCamera): [Vec3, Vec3] {
  const { x, y, z } = project(p, c),
    m = c.model;
  if (m.distortion_model === "brown") {
    // Central differences include distortion in the same projection model.
    const epsilon = 1e-5;
    const du: Vec3 = [0, 0, 0],
      dv: Vec3 = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const a = [...p] as Vec3,
        b = [...p] as Vec3;
      a[i] += epsilon;
      b[i] -= epsilon;
      const pa = project(a, c),
        pb = project(b, c);
      du[i] = (pa.u - pb.u) / (2 * epsilon);
      dv[i] = (pa.v - pb.v) / (2 * epsilon);
    }
    return [du, dv];
  }
  return [
    add(mul(c.axes[0], m.fx / z), mul(c.axes[2], (-m.fx * x) / (z * z))),
    add(mul(c.axes[1], m.fy / z), mul(c.axes[2], (-m.fy * y) / (z * z))),
  ];
}
export function accuracy(p: Vec3, cs: PreparedCamera[]): Accuracy | null {
  if (cs.length < 2) return null;
  const h = Array(9).fill(0);
  for (const c of cs) {
    const js = jacobian(p, c),
      w = 1 / c.model.default_pixel_localization_error_px ** 2;
    for (const j of js)
      for (let a = 0; a < 3; a++)
        for (let b = 0; b < 3; b++) h[a * 3 + b] += w * j[a] * j[b];
  }
  const result = inverseSymmetric(h);
  if (!result) return null;
  const variances = [result.inverse[0], result.inverse[4], result.inverse[8]];
  if (variances.some((v) => v < 0 || !Number.isFinite(v))) return null;
  const [x, y, z] = variances.map((v) => Math.sqrt(v) * 1000);
  return { x, y, z, rms: Math.hypot(x, y, z), condition: result.condition };
}
export function analyzePoint(p: Vec3, diameter: number, s: Scheme): PointResult {
  const cs = prepareCameras(s),
    obs = obstacles(s),
    observations = cs.map((c) => observe(p, diameter, c, obs));
  const valid = cs.filter((_, i) => observations[i].valid);
  return {
    position: p,
    count: valid.length,
    accuracy: accuracy(p, valid),
    observations,
  };
}
export const worldMarkers = (o: SceneObject) =>
  o.kind === "rigidBody"
    ? (o.markers || []).map((m) => ({
        position: add(o.position, rotate(m.position, o.rotation)),
        diameter: m.diameter,
      }))
    : [{ position: o.position, diameter: o.diameter || 12 }];
export function rigidTrackability(o: SceneObject, s: Scheme) {
  const points = worldMarkers(o)
    .filter((m) => analyzePoint(m.position, m.diameter, s).accuracy)
    .map((m) => m.position);
  if (points.length < 3) return { effective: points.length, status: "invalid" };
  let maxArea = 0,
    maxEdge = 0;
  for (let a = 0; a < points.length; a++)
    for (let b = a + 1; b < points.length; b++) {
      maxEdge = Math.max(maxEdge, length(sub(points[a], points[b])));
      for (let c = b + 1; c < points.length; c++)
        maxArea = Math.max(
          maxArea,
          length(cross(sub(points[b], points[a]), sub(points[c], points[a]))),
        );
    }
  return {
    effective: points.length,
    status: maxArea < 0.02 * maxEdge * maxEdge ? "weak" : "trackable",
  };
}
export function sampleCount(s: Scheme) {
  return s.boundary.reduce((v, d) => v * Math.ceil(d / s.settings.voxel), 1);
}
export function simulate(s: Scheme, progress?: (p: number) => void): SimulationResult {
  const start = performance.now(),
    step = s.settings.voxel,
    [lx, ly, lz] = s.boundary;
  const total = sampleCount(s);
  if (total > 1_200_000) throw new Error("voxelLimit");
  const positions = new Float32Array(total * 3),
    counts = new Uint16Array(total),
    errors = new Float32Array(total),
    cs = prepareCameras(s),
    obs = obstacles(s);
  const ns = s.boundary.map((v) => Math.ceil(v / step));
  const finiteErrors: number[] = [],
    coverage = Array(5).fill(0);
  let used = 0,
    excluded = 0,
    sumCount = 0,
    under03 = 0,
    under05 = 0;
  const issueMap = new Map<
    string,
    {
      type: SimulationResult["issues"][number]["type"];
      count: number;
      position: Vec3;
    }
  >();
  const issue = (type: SimulationResult["issues"][number]["type"], position: Vec3) => {
    const found = issueMap.get(type);
    if (found) found.count++;
    else issueMap.set(type, { type, count: 1, position });
  };
  for (let iz = 0; iz < ns[2]; iz++) {
    for (let iy = 0; iy < ns[1]; iy++)
      for (let ix = 0; ix < ns[0]; ix++) {
        const p: Vec3 = [
          ((ix + 0.5) * lx) / ns[0] - lx / 2,
          ((iy + 0.5) * ly) / ns[1] - ly / 2,
          ((iz + 0.5) * lz) / ns[2],
        ];
        if (obs.some((o) => pointInside(p, o))) {
          excluded++;
          continue;
        }
        const observations = cs.map((c) => observe(p, s.settings.markerDiameter, c, obs)),
          valid = cs.filter((_, i) => observations[i].valid),
          acc = accuracy(p, valid);
        positions.set(p, used * 3);
        counts[used] = valid.length;
        errors[used] = acc?.rms ?? NaN;
        sumCount += valid.length;
        for (let k = 1; k <= 5; k++) if (valid.length >= k) coverage[k - 1]++;
        if (acc) {
          finiteErrors.push(acc.rms);
          if (acc.rms <= 0.3) under03++;
          if (acc.rms <= 0.5) under05++;
          if (acc.rms > s.settings.errorThreshold) issue("accuracy", p);
        } else if (valid.length >= 2) issue("geometry", p);
        if (valid.length < 2) issue("coverage", p);
        if (observations.some((o) => o.reasons.includes("occluded")))
          issue("occluded", p);
        if (observations.some((o) => o.reasons.includes("small"))) issue("small", p);
        used++;
      }
    progress?.(Math.round(((iz + 1) / ns[2]) * 100));
  }
  finiteErrors.sort((a, b) => a - b);
  const percentile = (q: number) =>
    finiteErrors.length
      ? finiteErrors[
          Math.min(finiteErrors.length - 1, Math.ceil(q * finiteErrors.length) - 1)
        ]
      : null;
  return {
    schemeId: s.id,
    revision: s.revision,
    timestamp: new Date().toISOString(),
    elapsed: performance.now() - start,
    voxelSize: [lx / ns[0], ly / ns[1], lz / ns[2]],
    positions: positions.slice(0, used * 3),
    counts: counts.slice(0, used),
    errors: errors.slice(0, used),
    validVoxels: used,
    excludedVoxels: excluded,
    coverage: coverage.map((n) => (used ? (n / used) * 100 : 0)),
    averageCount: used ? sumCount / used : 0,
    meanError: finiteErrors.length
      ? finiteErrors.reduce((a, b) => a + b, 0) / finiteErrors.length
      : null,
    p90: percentile(0.9),
    p95: percentile(0.95),
    under03: used ? (under03 / used) * 100 : 0,
    under05: used ? (under05 / used) * 100 : 0,
    invalidAccuracy: used - finiteErrors.length,
    issues: [...issueMap.values()],
  };
}
