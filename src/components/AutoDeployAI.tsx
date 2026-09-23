import { useEffect, useRef, useState } from "react";
import type { CameraModel } from "../models";
import type { Constraints, PlannerOutput } from "../autoDeploy/types";
import { useT } from "../i18n";
import { aiProvider } from "../ai/provider";
import type { AIFact, AIStatus } from "../ai/types";
import { Field, fmt } from "./Common";

export function AutoDeployAI({
  constraints,
  models,
  output,
  disabled,
  onAccept,
}: {
  constraints: Constraints;
  models: CameraModel[];
  output: PlannerOutput | null;
  disabled: boolean;
  onAccept: (c: Constraints) => void;
}) {
  const t = useT(),
    [status, setStatus] = useState<AIStatus>({
      enabled: false,
      hasKey: false,
      model: "kimi-k2.6",
    }),
    [key, setKey] = useState(""),
    [text, setText] = useState(""),
    [draft, setDraft] = useState<Constraints | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [explanation, setExplanation] = useState<string[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    window.sceneLabAI
      ?.status()
      .then((s) => {
        if (alive.current) setStatus(s);
      })
      .catch(() => {
        if (alive.current) setError("aiUnavailable");
      });
    return () => {
      alive.current = false;
      void window.sceneLabAI?.cancel().catch(() => {});
    };
  }, []);
  useEffect(() => {
    setExplanation([]);
  }, [output]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "aiUnavailable");
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const facts: AIFact[] =
    output?.recommendations.flatMap((r, i) => [
      {
        id: `${i}-status`,
        text: `${r.profiles.map((p) => t("adProfile_" + p)).join(" / ")}: ${t(r.metrics.meetsTarget ? "adMeets" : "adBestEffort")}。`,
      },
      {
        id: `${i}-layout`,
        text: `${r.candidate.cameras[0].camera_model_snapshot?.display_name} · ${r.candidate.params.count} ${t("adCountLabel")} · ${t("adLayout_" + r.candidate.params.layout)} · ${r.candidate.params.layers} ${t("adLayerLabel")}。`,
      },
      {
        id: `${i}-coverage`,
        text: `≥${output.constraints.minViews}: ${fmt(r.metrics.targetCoverage, 1)}%; ${t("adPass")}: ${fmt(r.metrics.accuracyPass, 1)}%; P95: ${fmt(r.metrics.p95)} mm。`,
      },
      ...r.diagnoses.map((d) => ({
        id: `${i}-${d.code}`,
        text: `${t("adDiag_" + d.code)} (${d.affected}/${d.sampled})${d.objectNames ? ": " + d.objectNames.join(" / ") : ""}。`,
      })),
    ]) || [];
  const draftLabels: Record<keyof Constraints, string> = {
    boundary: "adBoundary",
    markerDiameter: "adMarker",
    errorThreshold: "adThreshold",
    accuracyTarget: "adAccuracyTarget",
    minViews: "adMinViews",
    coverageTarget: "adCoverageTarget",
    modelIds: "adModels",
    countMode: "adCount",
    count: "adCount",
    minCount: "adMin",
    maxCount: "adMax",
    installation: "adInstallation",
    layers: "adLayers",
    profile: "adProfile",
    weighting: "adWeighting",
    activity: "adActivity",
    seed: "adSeed",
  };
  const draftValue = (field: keyof Constraints, value: unknown) => {
    if (field === "modelIds")
      return (value as string[]).length
        ? (value as string[])
            .map((id) => models.find((m) => m.id === id)?.display_name || id)
            .join(" / ")
        : t("adAutoModel");
    const prefix = {
      installation: "adLayout_",
      profile: "adProfile_",
      weighting: "adWeight_",
      countMode: "adCount_",
    }[field as string];
    if (prefix) return t(prefix + value);
    if (value === null) return "—";
    if (value === "auto") return t("adAuto");
    if (Array.isArray(value))
      return value.join(field === "boundary" ? " × " : " – ") + " m";
    return (
      String(value) +
      (["markerDiameter", "errorThreshold"].includes(field)
        ? " mm"
        : ["coverageTarget", "accuracyTarget"].includes(field)
          ? "%"
          : "")
    );
  };
  return (
    <details className="ad-ai">
      <summary>{t("aiTitle")}</summary>
      <p className="muted tiny">{t("aiDisabled")}</p>
      {!window.sceneLabAI ? (
        <p>{t("aiDesktop")}</p>
      ) : (
        <>
          <fieldset disabled={busy || disabled}>
            <label className="ad-check">
              <input
                type="checkbox"
                checked={status.enabled}
                onChange={(e) => setStatus({ ...status, enabled: e.target.checked })}
              />
              {t("aiEnable")}
            </label>
            <Field label={t("aiKey")}>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                placeholder={status.hasKey ? t("aiKeySaved") : "sk-…"}
                onChange={(e) => setKey(e.target.value)}
              />
            </Field>
            <Field label={t("aiModel")}>
              <input
                value={status.model}
                maxLength={80}
                onChange={(e) => setStatus({ ...status, model: e.target.value })}
              />
            </Field>
            <div className="ad-ai-actions">
              <button
                onClick={() =>
                  void run(async () => {
                    const next = await window.sceneLabAI!.configure({
                      enabled: status.enabled,
                      model: status.model,
                      ...(key ? { key } : {}),
                    });
                    if (alive.current) {
                      setStatus(next);
                      setKey("");
                      setError("aiConfigured");
                    }
                  })
                }
              >
                {t("aiSave")}
              </button>
              <button
                onClick={() =>
                  void run(async () => {
                    const next = await window.sceneLabAI!.configure({
                      enabled: false,
                      model: status.model,
                      remove: true,
                    });
                    if (alive.current) {
                      setStatus(next);
                      setKey("");
                    }
                  })
                }
              >
                {t("aiRemove")}
              </button>
            </div>
            <p className="muted tiny">{t("aiPrivacy")}</p>
            <Field label={t("aiIntent")}>
              <textarea
                value={text}
                rows={4}
                maxLength={4000}
                onChange={(e) => setText(e.target.value)}
                placeholder="20×12×6 m，12 mm Marker，3 视点覆盖 95%，自动推荐型号和数量"
              />
            </Field>
            <button
              disabled={!status.enabled || !text.trim()}
              onClick={() =>
                void run(async () => {
                  const next = await aiProvider.parseIntent(text, constraints, models);
                  if (alive.current) setDraft(next);
                })
              }
            >
              {t("aiParse")}
            </button>
            {output && facts.length > 0 && (
              <button
                disabled={!status.enabled}
                onClick={() =>
                  void run(async () => {
                    const next = await aiProvider.explainPlan(facts);
                    if (alive.current) setExplanation(next);
                  })
                }
              >
                {t("aiExplain")}
              </button>
            )}
          </fieldset>
          {busy && <p role="status">{t("aiWorking")}</p>}
          {error && <p role="status">{t(error)}</p>}
          {draft && (
            <div className="ad-ai-draft">
              <p>{t("aiReview")}</p>
              <dl>
                {Object.entries(draft)
                  .filter(
                    ([k, v]) =>
                      JSON.stringify(v) !==
                      JSON.stringify(constraints[k as keyof Constraints]),
                  )
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{t(draftLabels[k as keyof Constraints])}</dt>
                      <dd>{draftValue(k as keyof Constraints, v)}</dd>
                    </div>
                  ))}
              </dl>
              <button
                disabled={disabled || busy}
                onClick={() => {
                  onAccept(draft);
                  setDraft(null);
                }}
              >
                {t("aiAccept")}
              </button>
              <button onClick={() => setDraft(null)}>{t("aiDiscard")}</button>
            </div>
          )}
          {explanation.length > 0 && (
            <div>
              <h4>{t("aiExplanation")}</h4>
              {explanation.map((s, i) => (
                <p key={i}>{s}</p>
              ))}
            </div>
          )}
        </>
      )}
    </details>
  );
}
