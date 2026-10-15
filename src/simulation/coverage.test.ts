import { describe, expect, it } from "vitest";
import { newModel } from "../camera/repository";
import { makeCamera, makeObject, makeProject, validateProject } from "../project/data";
import { analyzePoint, observe, prepareCamera, simulate } from "./engine";
import {
  coverageAt,
  coverageDefaults,
  coverageDisplayKey,
  coverageIssues,
  coverageSettings,
} from "./coverage";
import { heatColor } from "../renderer/scene";
import { defaultConstraints, validateConstraints } from "../autoDeploy/constraints";
import {
  candidateScheme,
  generateCandidate,
  initialParameters,
} from "../autoDeploy/candidateGenerator";
import { metricsFor } from "../autoDeploy/scoring";
import { applyToProject } from "../autoDeploy/apply";
import { buildAnalysisExport } from "../reportPackage/buildAnalysisExport";

const model = () => ({
  ...newModel(),
  fx: 1000,
  fy: 1000,
  minimum_marker_pixels: 1.5,
  max_working_distance_m: 15,
});
describe("independent coverage and imaging criteria", () => {
  it("admits a 1 px marker inside tracking range while retaining imaging failure", () => {
    const c = prepareCamera(makeCamera(model(), [0, 0, 0], [0, 1, 0]))[0];
    const im = observe([0, 10, 0], 10, c, []);
    const tr = observe([0, 10, 0], 10, c, [], { coverageBasis: "trackingRange" });
    expect(im).toMatchObject({
      coverageValid: false,
      imagingValid: false,
      pixels: 1,
      reasons: ["small"],
    });
    expect(tr).toMatchObject({
      coverageValid: true,
      imagingValid: false,
      valid: false,
      pixels: 1,
      reasons: ["small"],
      coverageReasons: [],
    });
    expect(
      observe([0, 10, 0], 1, c, [], { coverageBasis: "trackingRange" }).coverageValid,
    ).toBe(true);
    expect(
      observe([0, 16, 0], 16, c, [], { coverageBasis: "trackingRange" }).coverageValid,
    ).toBe(false);
    const obstacle = {
      ...makeObject("box"),
      position: [0, 5, 0] as [number, number, number],
    };
    expect(
      observe([0, 10, 0], 10, c, [obstacle], { coverageBasis: "trackingRange" })
        .coverageReasons,
    ).toContain("occluded");
  });
  it("uses manual distance for coverage only and keeps model limits for accuracy", () => {
    const c = prepareCamera(makeCamera(model(), [0, 0, 0], [0, 1, 0]))[0];
    const settings = {
      coverageBasis: "trackingRange" as const,
      trackingRangeSource: "manual" as const,
      trackingRangeOverrideM: 20,
    };
    expect(observe([0, 19, 0], 100, c, [], settings)).toMatchObject({
      coverageValid: true,
      imagingValid: false,
      reasons: ["far"],
    });
    expect(observe([0, 21, 0], 100, c, [], settings).coverageReasons).toContain("far");
    expect(observe([0, -10, 0], 100, c, [], settings).coverageReasons).toContain(
      "behind",
    );
    expect(observe([100, 1, 0], 100, c, [], settings).coverageReasons).toContain("fov");
    const unlimited = { ...c, model: { ...c.model, max_working_distance_m: null } };
    expect(
      observe([0, 30, 0], 1, unlimited, [], { coverageBasis: "trackingRange" })
        .coverageValid,
    ).toBe(true);
  });
  it("uses snapshot ranges separately for mixed models and ignores marker clipping only for coverage", () => {
    const c = prepareCamera(makeCamera(model(), [0, 0, 0], [0, 1, 0]))[0];
    const long = { ...c, model: { ...c.model, max_working_distance_m: 25 } };
    expect(
      [c, long].map(
        (cam) =>
          observe([0, 20, 0], 16, cam, [], { coverageBasis: "trackingRange" })
            .coverageValid,
      ),
    ).toEqual([false, true]);
    const edge = { ...c, model: { ...c.model, cx: 0.1 } };
    expect(
      observe([0, 10, 0], 100, edge, [], { coverageBasis: "trackingRange" }),
    ).toMatchObject({ coverageValid: true, imagingValid: false, reasons: ["edge"] });
  });
  it("keeps 7-view accuracy valid below a business threshold of 8", () => {
    const s = makeProject().schemes[0];
    s.boundary = [2, 2, 2];
    s.settings = { ...s.settings, voxel: 1, markerDiameter: 100, coverageThreshold: 8 };
    s.objects = Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2;
      return makeCamera(model(), [3 * Math.cos(a), 3 * Math.sin(a), 2], [0, 0, 1]);
    });
    const p = analyzePoint([0, 0, 1], 100, s);
    expect(p.count).toBe(7);
    expect(p.accuracy).not.toBeNull();
    const r = simulate(s);
    expect(coverageAt(r, 8)).toBe(0);
    expect(coverageAt(r, 7)).toBe(100);
    expect(r.invalidAccuracy).toBe(0);
    expect(coverageIssues(r, 8)[0]).toMatchObject({ type: "requirement", count: 8 });
    expect(coverageIssues(r, 7).some((i) => i.type === "requirement")).toBe(false);
    expect(r.viewCountHistogram![7]).toBe(8);
  });
  it("saturates at the configured scale independent of device totals and normalizes the legend", () => {
    expect(heatColor(8, 0, "coverage", 8, 1).getHexString()).toBe(
      heatColor(100, 0, "coverage", 8, 1).getHexString(),
    );
    expect(heatColor(7, 0, "coverage", 8, 1, 8, true).getHexString()).not.toBe(
      heatColor(8, 0, "coverage", 8, 1, 8, true).getHexString(),
    );
    expect(
      coverageSettings({ coverageThreshold: 12, coverageScaleMax: 6 }).coverageScaleMax,
    ).toBe(12);
    const p = makeProject();
    p.schemes[0].settings = {
      voxel: 1,
      markerDiameter: 12,
      errorThreshold: 0.5,
      autoUpdate: false,
    };
    validateProject(p);
    expect(p.schemes[0].settings).toMatchObject(coverageDefaults);
    expect(
      coverageDisplayKey({ ...p.schemes[0].settings, coverageScaleMax: 12 }),
    ).not.toBe(coverageDisplayKey(p.schemes[0].settings));
  });
  it("carries the same arbitrary threshold and basis through planner, apply and report exports", () => {
    const p = makeProject(),
      s = p.schemes[0];
    s.boundary = [5, 10, 3];
    s.settings.voxel = 1;
    const m = model(),
      c = {
        ...defaultConstraints(s),
        minViews: 8,
        coverageBasis: "trackingRange" as const,
        trackingRangeSource: "manual" as const,
        trackingRangeOverrideM: 20,
        coverageScaleMax: 12,
        highlightCoverageThreshold: true,
      };
    validateConstraints(c, [m]);
    expect(() => validateConstraints({ ...c, minViews: 2.5 }, [m])).toThrow();
    const candidate = generateCandidate(s, c, m, {
      ...initialParameters(c, m, "perimeter", 20),
      layers: 1,
    });
    expect(candidate.feasible).toBe(true);
    const trial = candidateScheme(s, c, candidate),
      r = simulate(trial),
      metrics = metricsFor(r, c);
    expect(metrics.targetCoverage).toBe(coverageAt(r, 8));
    const applied = applyToProject(p, s, c, candidate, {
      mode: "replace",
      structures: true,
      name: "test",
    }).project.schemes[0];
    expect(applied.settings).toEqual(trial.settings);
    const data = buildAnalysisExport(trial, r);
    expect(data.settings).toMatchObject({
      coverage_basis: "trackingRange",
      coverage_threshold: 8,
      coverage_scale_max: 12,
      tracking_range_override_m: 20,
      highlight_coverage_threshold: true,
    });
    expect(data.coverage_at_threshold).toBe(metrics.targetCoverage);
    expect(data.coverage_percent.ge3).toBe(r.coverage[2]);
  });
});
