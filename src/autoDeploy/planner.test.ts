import { describe, expect, it } from "vitest";
import {
  derive,
  newModel,
  createP3Model,
  createCatalogModels,
} from "../camera/repository";
import { makeObject, makeProject, validateProject } from "../project/data";
import { simulate } from "../simulation/engine";
import { unrotate, sub } from "../simulation/math";
import type { Scheme, Vec3 } from "../models";
import { defaultConstraints, validateConstraints } from "./constraints";
import {
  apportion,
  candidateScheme,
  generateCandidate,
  initialParameters,
} from "./candidateGenerator";
import { planDeployment } from "./planner";
import { metricsFor, rank } from "./scoring";
import { applyToProject } from "./apply";
import { profiles } from "./types";

const model = () => ({ ...newModel(), id: "test-model" });
function scene(boundary: Vec3 = [5, 5, 3], voxel = 0.5): Scheme {
  return {
    id: "source",
    name: "A",
    revision: 4,
    boundary,
    objects: [],
    settings: { voxel, markerDiameter: 12, errorThreshold: 0.5, autoUpdate: false },
  };
}
const setup = (s = scene()) => {
  const m = model(),
    c = {
      ...defaultConstraints(s),
      installation: "perimeter" as const,
      countMode: "exact" as const,
      count: 16,
      layers: 1 as const,
      modelIds: [m.id],
    };
  return { s, m, c };
};

describe("parameterized layouts", () => {
  it("apportions rectangular edges by physical length and preserves exact counts", () => {
    expect(apportion(16, [20, 10, 20, 10])).toEqual([5, 3, 5, 3]);
    const { s, m, c } = setup(scene([20, 10, 5]));
    c.count = 32;
    const p = { ...initialParameters(c, m, "perimeter", 32), layers: 2 };
    const a = generateCandidate(s, c, m, p);
    expect(a.feasible).toBe(true);
    expect(a.cameras).toHaveLength(32);
    const atLayer = a.mounts.filter((m) => m.layer === 0);
    expect(atLayer.filter((m) => ["north", "south"].includes(m.side!))).toHaveLength(10);
    expect(atLayer.filter((m) => ["east", "west"].includes(m.side!))).toHaveLength(6);
    expect(new Set(a.cameras.map((o) => o.position[2])).size).toBe(2);
    expect(generateCandidate(s, c, m, p)).toEqual(a);
  });
  it("respects explicitly requested ceiling layers and recovers from crowded one-layer seeds", () => {
    const { s, m, c } = setup();
    const constrained = { ...c, layers: 2 };
    const ceiling = generateCandidate(
      s,
      constrained,
      m,
      initialParameters(constrained, m, "ceiling", 16),
    );
    expect(ceiling.feasible).toBe(true);
    expect(new Set(ceiling.cameras.map((o) => o.position[2])).size).toBe(2);
    const out = planDeployment({
      scheme: s,
      models: [m],
      constraints: { ...c, count: 64, layers: "auto" },
    });
    expect(out.recommendations.length).toBeGreaterThan(0);
    expect(
      out.recommendations.every(
        (r) => r.candidate.cameras.length === 64 && r.candidate.params.layers >= 2,
      ),
    ).toBe(true);
  }, 30000);
  it("keeps ceiling cameras overhead with crossed orientations", () => {
    const { s, m, c } = setup();
    const a = generateCandidate(s, c, m, initialParameters(c, m, "ceiling", 16));
    expect(a.feasible).toBe(true);
    expect(a.mounts.every((m) => m.type === "ceiling")).toBe(true);
    expect(a.cameras.every((o) => o.position[2] > s.boundary[2] * 0.8)).toBe(true);
    expect(a.cameras.some((o) => Math.abs(o.rotation[1] + 90) > 10)).toBe(true);
    expect(a.cameras.every((o) => a.structures.some((b) => b.id === o.mount))).toBe(true);
  });
  it("uses actual rotated tube/surface mounts and rejects impossible capacities", () => {
    const { s, m, c } = setup();
    const beam = {
      ...makeObject("tube"),
      id: "beam",
      position: [0, 0, 2] as Vec3,
      size: [4, 0.08, 0.08] as Vec3,
      rotation: [35, 0, 0] as Vec3,
    };
    s.objects = [beam];
    const a = generateCandidate(s, c, m, initialParameters(c, m, "existing", 8));
    expect(a.feasible).toBe(true);
    expect(a.structures).toHaveLength(0);
    for (const camera of a.cameras) {
      expect(camera.mount).toBe(beam.id);
      const p = unrotate(sub(camera.position, beam.position), beam.rotation);
      expect(Math.abs(p[0])).toBeLessThan(2);
      expect(Math.max(Math.abs(p[1]), Math.abs(p[2]))).toBeCloseTo(0.17);
    }
    beam.size[0] = 1;
    expect(
      generateCandidate(s, c, m, initialParameters(c, m, "existing", 40)),
    ).toMatchObject({ feasible: false, infeasibleReason: "adMountCapacity" });
    s.objects = [
      {
        ...makeObject("surface"),
        id: "ceiling",
        size: [4, 4, 0.1],
        position: [0, 0, 2.8],
      },
    ];
    const surface = generateCandidate(s, c, m, initialParameters(c, m, "existing", 16));
    expect(surface.feasible).toBe(true);
    expect(
      surface.cameras.every((o) => o.mount === "ceiling" && o.position[2] < 2.8),
    ).toBe(true);
  });
  it("retains occluders in every evaluation and identifies the blocking column", () => {
    const { s, m, c } = setup(scene([10, 10, 5], 1));
    const a = generateCandidate(s, c, m, initialParameters(c, m, "perimeter", 16));
    const before = simulate(candidateScheme(s, c, a));
    s.objects.push({
      ...makeObject("box"),
      id: "column",
      name: "Large column",
      size: [4, 4, 5],
      position: [0, 0, 2.5],
    });
    const built = candidateScheme(s, c, a);
    expect(built.objects.some((o) => o.id === "column")).toBe(true);
    const after = simulate(built);
    expect(after.excludedVoxels).toBeGreaterThan(before.excludedVoxels);
    expect(after.averageCount).toBeLessThan(before.averageCount);
    expect(after.issues.find((i) => i.type === "occluded")?.count).toBeGreaterThan(0);
  });
});

describe("verified offline planning", () => {
  it("searches lower counts on sloped existing beams without treating height bands as a minimum camera count", () => {
    const { s, m, c } = setup();
    s.objects = [
      {
        ...makeObject("tube"),
        id: "sloped",
        size: [10, 0.05, 0.05],
        position: [0, -2, 2],
        rotation: [0, 5, 0],
      },
    ];
    const constraints = {
      ...c,
      installation: "existing" as const,
      countMode: "range" as const,
      minCount: 8,
      maxCount: 24,
      layers: "auto" as const,
      coverageTarget: 1,
      accuracyTarget: null,
    };
    const output = planDeployment({ scheme: s, models: [m], constraints });
    expect(
      output.recommendations.find((r) => r.profiles.includes("minimum"))?.candidate.params
        .count,
    ).toBe(8);
  }, 30000);
  it("A: fine-simulates the exact 16-camera small scene and preserves the source", () => {
    const { s, m, c } = setup();
    const original = structuredClone(s);
    const out = planDeployment({ scheme: s, models: [m], constraints: c });
    expect(s).toEqual(original);
    expect(out.recommendations.length).toBeGreaterThan(0);
    for (const r of out.recommendations) {
      expect(r.candidate.cameras).toHaveLength(16);
      const actual = simulate(candidateScheme(s, c, r.candidate));
      expect(r.metrics).toEqual(metricsFor(actual, c));
      expect(r.result.voxelSize).toEqual(actual.voxelSize);
    }
    expect(new Set(out.recommendations.flatMap((r) => r.profiles))).toEqual(
      new Set(profiles),
    );
    const again = planDeployment({ scheme: s, models: [m], constraints: c });
    expect(
      again.recommendations.map((r) => ({
        candidate: r.candidate,
        metrics: r.metrics,
        profiles: r.profiles,
      })),
    ).toEqual(
      out.recommendations.map((r) => ({
        candidate: r.candidate,
        metrics: r.metrics,
        profiles: r.profiles,
      })),
    );
  }, 30000);
  it("C: searches counts in a 20×20×8 volume, using current library snapshots", () => {
    const s = scene([20, 20, 8], 2),
      m = derive({
        ...model(),
        resolution_width: 6000,
        resolution_height: 5000,
        max_working_distance_m: 60,
      });
    const c = {
      ...defaultConstraints(s),
      modelIds: [m.id],
      installation: "ceiling" as const,
    };
    const out = planDeployment({
      scheme: s,
      models: [m, { ...m, id: "unsupported", layout_supported: false }],
      constraints: c,
    });
    expect(out.modelCount).toBe(1);
    expect(out.evaluated).toBeGreaterThan(10);
    expect(out.recommendations.length).toBeGreaterThan(0);
    expect(
      out.recommendations.every(
        (r) =>
          r.candidate.params.layout === "ceiling" &&
          r.candidate.cameras.length >= 8 &&
          r.candidate.cameras.length <= 64,
      ),
    ).toBe(true);
    expect(
      out.recommendations[0].candidate.cameras[0].camera_model_snapshot?.resolution_width,
    ).toBe(6000);
  }, 30000);
  it("G/H: returns best effort for an underconstrained large scene, with shared-profile reasons and measured trials", () => {
    const { s, m, c } = setup(scene([30, 20, 8], 2));
    const out = planDeployment({ scheme: s, models: [m], constraints: c });
    expect(out.recommendations.length).toBeGreaterThan(0);
    expect(out.recommendations.every((r) => !r.metrics.meetsTarget)).toBe(true);
    expect(
      out.recommendations[0].diagnoses.some(
        (d) => d.code === "small" || d.code === "distance",
      ),
    ).toBe(true);
    expect(out.trials.length).toBeGreaterThan(0);
    expect(
      out.trials.every((t) => t.before.validVoxels > 0 && t.after.validVoxels > 0),
    ).toBe(true);
    expect(new Set(out.recommendations.flatMap((r) => r.profiles))).toEqual(
      new Set(profiles),
    );
  }, 30000);
  it("rejects too many formal voxels before starting; never silently coarsens final metrics", () => {
    const { s, m, c } = setup(scene([100, 100, 30], 0.01));
    expect(() => validateConstraints(c, [m], s)).toThrow("voxelLimit");
    c.activity = [3, 1];
    expect(() => validateConstraints(c, [m])).toThrow("adInvalidActivity");
  });
  it("keeps full-volume metrics independent of weighting and respects stereo observations", () => {
    const { s, c } = setup(),
      m = createP3Model();
    const a = generateCandidate(s, c, m, initialParameters(c, m, "perimeter", 8)),
      r = simulate(candidateScheme(s, c, a));
    const uniform = metricsFor(r, { ...c, weighting: "uniform" }),
      weighted = metricsFor(r, { ...c, activity: [0.8, 1.8] });
    expect(uniform.coverage).toEqual(weighted.coverage);
    expect(uniform.accuracyPass).toBe(weighted.accuracyPass);
    expect(uniform.p95).toBe(weighted.p95);
    expect(a.cameras).toHaveLength(8);
    expect(Math.max(...r.counts)).toBeGreaterThan(8);
  });
  it("does not let precise but tiny covered regions win the accuracy profile", () => {
    const { s, m, c } = setup();
    const candidate = generateCandidate(
        s,
        c,
        m,
        initialParameters(c, m, "perimeter", 16),
      ),
      metrics = metricsFor(simulate(candidateScheme(s, c, candidate)), c);
    const useful = {
      candidate,
      metrics: {
        ...metrics,
        meetsTarget: false,
        centerCoverage: 90,
        targetCoverage: 85,
        accuracyPass: 60,
      },
    };
    const pocket = {
      candidate: { ...candidate, id: "pocket" },
      metrics: {
        ...metrics,
        meetsTarget: false,
        centerCoverage: 20,
        targetCoverage: 20,
        accuracyPass: 20,
        meanError: 0.001,
        p95: 0.001,
      },
    };
    expect(rank([pocket, useful], c, "accuracy")[0]).toBe(useful);
  });
});

describe("application transaction", () => {
  it("uses only the specified MC1300 from a library that also contains Demo, including after applying", () => {
    const demo = { ...model(), id: "demo-m4", display_name: "M4 · Demo" };
    const mc1300 = createCatalogModels().find(
      (m) => m.display_name === "MC1300 · Standard",
    )!;
    const { s, c } = setup();
    const constraints = { ...c, modelIds: [mc1300.id] };
    const out = planDeployment({ scheme: s, models: [demo, mc1300], constraints });
    expect(out.modelCount).toBe(1);
    expect(out.recommendations.length).toBeGreaterThan(0);
    const project = makeProject();
    project.schemes = [s];
    project.activeSchemeId = s.id;
    for (const recommendation of out.recommendations) {
      expect(recommendation.candidate.params.modelId).toBe(mc1300.id);
      const applied = applyToProject(project, s, constraints, recommendation.candidate, {
        mode: "new",
        structures: true,
        name: "MC1300 only",
      });
      const cameras = applied.project.schemes[1].objects.filter(
        (o) => o.kind === "camera",
      );
      expect(cameras).toHaveLength(16);
      for (const camera of cameras) {
        expect(camera.camera_model_id).toBe(mc1300.id);
        expect(camera.camera_model_snapshot).toEqual(mc1300);
      }
    }
  });
  it("refuses to apply a candidate containing an unselected model without changing the project", () => {
    const { s, m, c } = setup();
    const candidate = generateCandidate(
      s,
      c,
      m,
      initialParameters(c, m, "perimeter", 16),
    );
    const project = makeProject();
    project.schemes = [s];
    project.activeSchemeId = s.id;
    const before = structuredClone(project);
    expect(() =>
      applyToProject(project, s, { ...c, modelIds: ["mc1300"] }, candidate, {
        mode: "replace",
        structures: false,
        name: "Wrong model",
      }),
    ).toThrow("adModelMismatch");
    candidate.cameras[0].camera_model_snapshot!.id = "demo-m4";
    expect(() =>
      applyToProject(project, s, c, candidate, {
        mode: "replace",
        structures: false,
        name: "Wrong snapshot",
      }),
    ).toThrow("adModelMismatch");
    expect(project).toEqual(before);
  });
  it("creates editable cameras with remapped mounts without mutating the original; clears omitted mounts", () => {
    const { s, m, c } = setup(),
      project = makeProject();
    project.schemes = [s];
    project.activeSchemeId = s.id;
    const a = generateCandidate(s, c, m, initialParameters(c, m, "perimeter", 16)),
      original = structuredClone(project);
    const next = applyToProject(project, s, c, a, {
      mode: "new",
      structures: true,
      name: "Suggested",
    });
    expect(project).toEqual(original);
    expect(next.project.schemes).toHaveLength(2);
    expect(next.project.schemes[0]).toEqual(s);
    const created = next.project.schemes[1];
    expect(
      created.objects
        .filter((o) => o.kind === "camera")
        .every((o) => !o.locked && created.objects.some((b) => b.id === o.mount)),
    ).toBe(true);
    expect(() => validateProject(next.project)).not.toThrow();
    const only = applyToProject(project, s, c, a, {
      mode: "replace",
      structures: false,
      name: "Cameras",
    });
    expect(
      only.project.schemes[0].objects.every((o) => o.kind === "camera" && !o.mount),
    ).toBe(true);
    const stale = structuredClone(project);
    stale.schemes[0].revision++;
    expect(() =>
      applyToProject(stale, s, c, a, { mode: "add", structures: false, name: "" }),
    ).toThrow("adStale");
  });
});
