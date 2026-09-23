import { simulate } from "../simulation/engine";
import {
  candidateScheme,
  generateCandidate,
  initialParameters,
  layoutsFor,
} from "./candidateGenerator";
import { coarseSpacing, countOptions, validateConstraints } from "./constraints";
import { diagnose } from "./diagnostics";
import { neighbors } from "./optimizer";
import { metricsFor, rank } from "./scoring";
import {
  PLANNER_VERSION,
  profiles,
  type Constraints,
  type Evaluation,
  type Parameters,
  type PlannerInput,
  type PlannerOutput,
  type PlannerProgress,
  type Recommendation,
  type Trial,
} from "./types";

/** Runs entirely in a worker. Terminating that worker cancels even a synchronous fine simulation. */
export function planDeployment(
  input: PlannerInput,
  progress: (p: PlannerProgress) => void = () => {},
): PlannerOutput {
  const started = performance.now(),
    { scheme, constraints: c } = input;
  validateConstraints(c, input.models, scheme);
  const models = input.models
    .filter(
      (m) =>
        m.layout_supported !== false && (!c.modelIds.length || c.modelIds.includes(m.id)),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const coarseVoxel = Math.max(scheme.settings.voxel, coarseSpacing(c.boundary)),
    counts = countOptions(c),
    layouts = layoutsFor(c, scheme);
  const pool: Evaluation[] = [],
    seen = new Map<string, Evaluation | null>(),
    infeasible: PlannerOutput["infeasible"] = [];
  let evaluated = 0;
  const evaluate = (p: Parameters): Evaluation | null => {
    const m = models.find((m) => m.id === p.modelId)!;
    const candidate = generateCandidate(scheme, c, m, p);
    if (seen.has(candidate.id)) return seen.get(candidate.id)!;
    seen.set(candidate.id, null);
    if (!candidate.feasible) {
      if (
        !infeasible.some(
          (e) =>
            e.modelId === m.id &&
            e.layout === p.layout &&
            e.reason === candidate.infeasibleReason,
        )
      )
        infeasible.push({
          modelId: m.id,
          layout: p.layout,
          reason: candidate.infeasibleReason!,
        });
      return null;
    }
    const result = simulate(candidateScheme(scheme, c, candidate, coarseVoxel));
    evaluated++;
    const e = { candidate, metrics: metricsFor(result, c) };
    pool.push(e);
    seen.set(candidate.id, e);
    return e;
  };
  let done = 0;
  const representative = counts.reduce((a, b) =>
    Math.abs(a - 24) <= Math.abs(b - 24) ? a : b,
  );
  for (const m of models)
    for (const layout of layouts) {
      progress({ stage: "screen", done: done++, total: models.length * layouts.length });
      const initial = initialParameters(c, m, layout, representative);
      if (!evaluate(initial)) {
        const fallback = [
          ...(c.layers === "auto" && layout !== "existing"
            ? [1, 2, 3].map((layers) => ({ ...initial, layers }))
            : []),
          { ...initial, height: 0.65 },
          { ...initial, height: 0.95 },
          ...(counts[0] !== representative ? [{ ...initial, count: counts[0] }] : []),
        ];
        for (const p of fallback) if (evaluate(p)) break;
      }
    }
  // Preserve a winner for every layout and objective before expanding count/layer search.
  const seeds = new Map<string, Evaluation>();
  for (const layout of layouts)
    for (const profile of profiles) {
      const best = rank(
        pool.filter((e) => e.candidate.params.layout === layout),
        c,
        profile,
      )[0];
      if (best) seeds.set(best.candidate.id, best);
    }
  const search: Parameters[] = [];
  for (const seed of seeds.values()) {
    const p = seed.candidate.params;
    const layers =
      p.layout === "existing"
        ? [p.layers]
        : c.layers === "auto"
          ? p.layout === "ceiling"
            ? [1, 2]
            : [1, 2, 3]
          : [c.layers];
    for (const count of counts)
      for (const layer of layers)
        if (p.layout === "existing" || layer <= count)
          search.push({ ...p, count, layers: layer });
  }
  search.forEach((p, i) => {
    progress({ stage: "search", done: i, total: search.length });
    evaluate(p);
  });
  const leads = new Map<string, Evaluation>();
  for (const profile of profiles)
    for (const lead of rank(pool, c, profile).slice(0, 2))
      leads.set(lead.candidate.id, lead);
  const local = [...leads.values()].flatMap((e) => neighbors(e.candidate.params));
  local.forEach((p, i) => {
    progress({ stage: "optimize", done: i, total: local.length });
    evaluate(p);
  });
  if (c.countMode !== "exact") {
    const passing = rank(
      pool.filter((e) => e.metrics.meetsTarget),
      c,
      "minimum",
    )[0];
    if (passing) {
      const p = passing.candidate.params,
        min = counts.filter((n) => n < p.count).at(-1) ?? counts[0];
      const refinement = Array.from(
        { length: Math.max(0, p.count - min - 1) },
        (_, i) => min + i + 1,
      );
      refinement.forEach((count, i) => {
        progress({ stage: "refine", done: i, total: refinement.length });
        evaluate({ ...p, count });
      });
    }
  }
  const finalists = new Map<string, Evaluation>();
  for (const profile of [c.profile, ...profiles]) {
    const best = rank(pool, c, profile)[0];
    if (best) finalists.set(best.candidate.id, best);
  }
  for (const e of rank(pool, c, c.profile)) {
    if (finalists.size >= 5) break;
    finalists.set(e.candidate.id, e);
  }
  const fine: Recommendation[] = [];
  for (const [i, e] of [...finalists.values()].entries()) {
    const s = candidateScheme(scheme, c, e.candidate);
    const result = simulate(s, (fraction) =>
      progress({ stage: "fine", done: i, total: finalists.size, fraction }),
    );
    fine.push({
      ...e,
      metrics: metricsFor(result, c),
      result,
      profiles: [],
      diagnoses: diagnose(s, result, c),
      comparisons: [],
    });
  }
  // Re-rank only the fine metrics; coarse scores never reach the result cards.
  for (const profile of profiles) {
    const winner = rank(fine, c, profile)[0];
    fine.find((e) => e.candidate.id === winner?.candidate.id)?.profiles.push(profile);
  }
  const recommendations = fine
    .filter((e) => e.profiles.length)
    .sort(
      (a, b) =>
        Number(b.profiles.includes(c.profile)) - Number(a.profiles.includes(c.profile)),
    );
  for (const r of recommendations)
    r.comparisons = fine
      .filter((e) => e !== r)
      .map((e) => ({
        candidateId: e.candidate.id,
        name: e.candidate.cameras[0].camera_model_snapshot!.display_name,
        count: e.candidate.params.count,
        layout: e.candidate.params.layout,
        layers: e.candidate.params.layers,
        coverageDelta: r.metrics.targetCoverage - e.metrics.targetCoverage,
        accuracyDelta: r.metrics.accuracyPass - e.metrics.accuracyPass,
        countDelta: r.candidate.params.count - e.candidate.params.count,
      }));
  const trials: Trial[] = [];
  const best = recommendations[0];
  if (best && !best.metrics.meetsTarget) {
    const p = best.candidate.params,
      candidates: {
        change: Trial["change"];
        label: string;
        c: Constraints;
        p: Parameters;
      }[] = [];
    const size = best.diagnoses.find((d) => d.code === "small")?.suggestedDiameter;
    if (size && size > c.markerDiameter && size <= 1000)
      candidates.push({
        change: "marker",
        label: `${size} mm`,
        c: { ...c, markerDiameter: size },
        p,
      });
    if (p.count < 200)
      candidates.push({
        change: "count",
        label: `${p.count + Math.max(2, Math.ceil(p.count / 4))}`,
        c,
        p: { ...p, count: Math.min(200, p.count + Math.max(2, Math.ceil(p.count / 4))) },
      });
    if (p.layout !== "existing" && p.layout !== "ceiling" && p.layers < 4)
      candidates.push({
        change: "layers",
        label: `${p.layers + 1}`,
        c,
        p: { ...p, layers: p.layers + 1 },
      });
    else if (p.layout !== "hybrid" && p.layout !== "existing")
      candidates.push({
        change: "layout",
        label: "hybrid",
        c,
        p: { ...p, layout: "hybrid" },
      });
    const alternative = rank(
      pool.filter((e) => e.candidate.params.modelId !== p.modelId),
      c,
      c.profile,
    )[0];
    if (alternative)
      candidates.push({
        change: "model",
        label: alternative.candidate.params.modelId,
        c,
        p: { ...p, modelId: alternative.candidate.params.modelId },
      });
    for (const [i, trial] of candidates.slice(0, 3).entries()) {
      const model = models.find((m) => m.id === trial.p.modelId)!;
      const candidate = generateCandidate(scheme, trial.c, model, trial.p);
      if (!candidate.feasible) continue;
      const result = simulate(candidateScheme(scheme, trial.c, candidate), (fraction) =>
        progress({
          stage: "diagnose",
          done: i,
          total: Math.min(3, candidates.length),
          fraction,
        }),
      );
      trials.push({
        change: trial.change,
        label: trial.label,
        baseId: best.candidate.id,
        before: best.metrics,
        after: metricsFor(result, trial.c),
        markerDiameter: trial.c.markerDiameter,
        modelId: trial.p.modelId,
        count: trial.p.count,
        layers: trial.p.layers,
        layout: trial.p.layout,
      });
    }
  }
  return {
    version: PLANNER_VERSION,
    seed: c.seed,
    constraints: c,
    recommendations,
    trials,
    evaluated,
    coarseVoxel,
    fineVoxel: scheme.settings.voxel,
    modelCount: models.length,
    infeasible,
    elapsed: performance.now() - started,
  };
}
