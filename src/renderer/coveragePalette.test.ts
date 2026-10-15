import { expect, it } from "vitest";
import { heatColor } from "./scene";
import { coverageGradient, coveragePaletteColors } from "./coveragePalette";
import { coverageSettings, validCoverageSettings } from "../simulation/coverage";
import { Color } from "three";

it("keeps the classic palette by default and supports the blue palette in old/new projects", () => {
  expect(coverageSettings({}).coveragePalette).toBe("spectrum");
  expect(validCoverageSettings({ coveragePalette: "blue" })).toBe(true);
  expect(validCoverageSettings({ coveragePalette: "invalid" as "blue" })).toBe(false);
  for (const n of [0, 1, 3, 8, 20]) {
    expect(heatColor(n, 0, "coverage", 8, 1).getHexString()).toBe(
      heatColor(n, 0, "coverage", 8, 1, 3, false, "spectrum").getHexString(),
    );
  }
  expect(heatColor(8, 0, "coverage", 8, 1).getHexString()).toBe("e76c4e");
});

it("darkens monotonically as coverage grows, saturates at the scale and preserves other layers", () => {
  const luminance = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  let previous = Infinity;
  for (let n = 1; n <= 8; n++) {
    const color = heatColor(n, 0, "coverage", 8, 1, 3, false, "blue");
    expect(luminance(color)).toBeLessThan(previous);
    expect(color.b).toBeGreaterThan(color.r);
    previous = luminance(color);
  }
  expect(heatColor(8, 0, "coverage", 8, 1, 3, false, "blue").getHexString()).toBe(
    "123b70",
  );
  expect(heatColor(100, 0, "coverage", 8, 1, 3, false, "blue").getHexString()).toBe(
    "123b70",
  );
  for (const n of [0, 2])
    expect(heatColor(n, 0, "coverage", 8, 1, 3, true, "blue")).toEqual(
      heatColor(n, 0, "coverage", 8, 1, 3, true, "spectrum"),
    );
  expect(heatColor(8, 0.3, "accuracy", 8, 1, 3, false, "blue")).toEqual(
    heatColor(8, 0.3, "accuracy", 8, 1),
  );
  for (const palette of ["spectrum", "blue"] as const) {
    for (const color of coveragePaletteColors(palette))
      expect(coverageGradient(palette)).toContain(color);
  }
});
