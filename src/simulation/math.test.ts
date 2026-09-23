import { expect, it } from "vitest";
import { dot, rotate, unrotate } from "./math";
import type { Vec3 } from "../models";
it("retains exact inverse-transform values and invalidates mutable rotation caches", () => {
  const r: Vec3 = [0, 0, 0];
  for (let i = 0; i < 100; i++) {
    if (i % 3 === 0) r[i % 3] = (i * 37) % 360;
    if (i % 5 === 0) r[1] = (i * 19) % 180;
    r[2] = i * 3.7;
    const p: Vec3 = [i / 3 - 20, Math.sin(i) * 10, Math.cos(i) * 20];
    const expected = [
      dot(p, rotate([1, 0, 0], r)),
      dot(p, rotate([0, 1, 0], r)),
      dot(p, rotate([0, 0, 1], r)),
    ];
    expect(unrotate(p, r)).toEqual(expected);
    expect(unrotate(p, r)).toEqual(expected);
  }
});
