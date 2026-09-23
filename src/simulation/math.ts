import type { Vec3 } from "../models";
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3) => Math.hypot(...a);
export const normalize = (a: Vec3): Vec3 => mul(a, 1 / (length(a) || 1));
export const rad = (d: number) => (d * Math.PI) / 180;
// World Z is up; camera +Z is forward, +X is image right, +Y is image down.
// Rotation is yaw about world Z, pitch elevation, roll about optical axis (degrees).
export function basis(rotation: Vec3): [Vec3, Vec3, Vec3] {
  const [y, p, r] = rotation.map(rad);
  const forward: Vec3 = [
    Math.sin(y) * Math.cos(p),
    Math.cos(y) * Math.cos(p),
    Math.sin(p),
  ];
  const right: Vec3 = [Math.cos(y), -Math.sin(y), 0];
  const down = cross(forward, right);
  return [
    add(mul(right, Math.cos(r)), mul(down, Math.sin(r))),
    add(mul(down, Math.cos(r)), mul(right, -Math.sin(r))),
    forward,
  ];
}
export function lookAt(position: Vec3, target: Vec3): Vec3 {
  const d = sub(target, position);
  return [
    (Math.atan2(d[0], d[1]) * 180) / Math.PI,
    (Math.atan2(d[2], Math.hypot(d[0], d[1])) * 180) / Math.PI,
    0,
  ];
}
// Obstacle/rigid body rotations: Rz(yaw) Ry(pitch) Rx(roll).
export function rotate(v: Vec3, r: Vec3): Vec3 {
  const [z, y, x] = r.map(rad);
  const a: Vec3 = [
    v[0],
    Math.cos(x) * v[1] - Math.sin(x) * v[2],
    Math.sin(x) * v[1] + Math.cos(x) * v[2],
  ];
  const b: Vec3 = [
    Math.cos(y) * a[0] + Math.sin(y) * a[2],
    a[1],
    -Math.sin(y) * a[0] + Math.cos(y) * a[2],
  ];
  return [
    Math.cos(z) * b[0] - Math.sin(z) * b[1],
    Math.sin(z) * b[0] + Math.cos(z) * b[1],
    b[2],
  ];
}
// Occlusion calls this twice per ray against the same stationary structures.
// Cache precisely the existing basis calculation; retain the original dot-product
// order and invalidate on in-place edits as well as newly allocated rotations.
const inverseAxes = new WeakMap<Vec3, { angles: Vec3; axes: [Vec3, Vec3, Vec3] }>();
export function unrotate(v: Vec3, r: Vec3): Vec3 {
  let cached = inverseAxes.get(r);
  if (
    !cached ||
    cached.angles[0] !== r[0] ||
    cached.angles[1] !== r[1] ||
    cached.angles[2] !== r[2]
  ) {
    cached = {
      angles: [...r],
      axes: [rotate([1, 0, 0], r), rotate([0, 1, 0], r), rotate([0, 0, 1], r)],
    };
    inverseAxes.set(r, cached);
  }
  return [dot(v, cached.axes[0]), dot(v, cached.axes[1]), dot(v, cached.axes[2])];
}
export function inverseSymmetric(
  h: number[],
): { inverse: number[]; condition: number } | null {
  const scale = Math.max(Math.abs(h[0]), Math.abs(h[4]), Math.abs(h[8]));
  if (!scale || !Number.isFinite(scale)) return null;
  const a = h.map((x) => x / scale);
  const [a00, a01, a02, , a11, a12, , , a22] = a;
  const c00 = a11 * a22 - a12 * a12,
    c01 = a02 * a12 - a01 * a22,
    c02 = a01 * a12 - a02 * a11;
  const c11 = a00 * a22 - a02 * a02,
    c12 = a01 * a02 - a00 * a12,
    c22 = a00 * a11 - a01 * a01;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  if (det <= 1e-15) return null;
  const inv = [c00, c01, c02, c01, c11, c12, c02, c12, c22].map((v) => v / det);
  const norm = (m: number[]) =>
    Math.max(
      ...[0, 3, 6].map((i) => Math.abs(m[i]) + Math.abs(m[i + 1]) + Math.abs(m[i + 2])),
    );
  const condition = norm(a) * norm(inv);
  if (!Number.isFinite(condition) || condition > 1e10) return null;
  return { inverse: inv.map((x) => x / scale), condition };
}
