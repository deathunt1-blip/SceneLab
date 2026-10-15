import type { Vec3 } from "../models";

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

/** Corners once, then interior points apportioned by edge length. XY is centered. */
export function rectanglePerimeterPoints(
  count: number,
  length: number,
  width: number,
  height = 0,
): Vec3[] {
  if (count <= 0) return [];
  const corners: Vec3[] = [
    [-length / 2, -width / 2, height],
    [length / 2, -width / 2, height],
    [length / 2, width / 2, height],
    [-length / 2, width / 2, height],
  ];
  if (count === 1) return [corners[0]];
  if (count === 2) return [corners[0], corners[2]];
  if (count === 3) return corners.slice(0, 3);
  const out = [...corners];
  // Opposite long edges win tied remainders before the short edges.
  const sides = [0, 2, 1, 3],
    amounts = apportion(count - 4, [length, length, width, width]);
  sides.forEach((side, index) => {
    const a = corners[side],
      b = corners[(side + 1) % 4],
      n = amounts[index];
    for (let i = 1; i <= n; i++)
      out.push(a.map((v, j) => v + ((b[j] - v) * i) / (n + 1)) as Vec3);
  });
  return out;
}
export function gridDimensions(count: number, length: number, width: number) {
  let best = { rows: 1, cols: count },
    score = Infinity;
  for (let rows = 1; rows <= count; rows++) {
    const cols = Math.ceil(count / rows);
    const aspect = Math.abs(
      Math.log(Math.max(1, cols - 1) / Math.max(1, rows - 1) / (length / width)),
    );
    const candidate = aspect + (rows * cols - count) / count;
    if (candidate < score) {
      score = candidate;
      best = { rows, cols };
    }
  }
  return best;
}
export function gridPoints(
  count: number,
  length: number,
  width: number,
  height = 0,
  rows?: number,
  cols?: number,
): Vec3[] {
  const dims = rows && cols ? { rows, cols } : gridDimensions(count, length, width);
  const perRow = apportion(
    Math.min(count, dims.rows * dims.cols),
    Array(dims.rows).fill(1),
  );
  return perRow.flatMap((n, row) =>
    Array.from({ length: n }, (_, col): Vec3 => [
      n === 1 ? 0 : -length / 2 + (length * col) / (n - 1),
      dims.rows === 1 ? 0 : -width / 2 + (width * row) / (dims.rows - 1),
      height,
    ]),
  );
}
export const linearPoints = (count: number, length: number, height = 0): Vec3[] =>
  Array.from({ length: count }, (_, i) => [
    count === 1 ? 0 : -length / 2 + (length * i) / (count - 1),
    0,
    height,
  ]);
export const circlePoints = (
  count: number,
  radius: number,
  height = 0,
  start = 0,
  end = 360,
): Vec3[] =>
  Array.from({ length: count }, (_, i) => {
    const angle =
      ((start +
        ((end - start) * i) /
          (Math.abs(end - start) >= 360 ? count : Math.max(1, count - 1))) *
        Math.PI) /
      180;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, height];
  });
