import type { AIProvider, AIFact } from "./types";
import { parseIntentResponse } from "./intentSchema";

async function request(operation: "parse" | "explain", payload: unknown) {
  if (!window.sceneLabAI) throw new Error("aiUnavailable");
  const r = await window.sceneLabAI.request(operation, payload);
  if (r.error) throw new Error(r.error);
  if (!r.content) throw new Error("aiInvalidResponse");
  return r.content;
}
export function validateExplanation(content: string, facts: AIFact[]): string[] {
  try {
    const result = JSON.parse(content);
    if (
      !result ||
      Object.keys(result).some((k) => k !== "factIds") ||
      !Array.isArray(result.factIds) ||
      !result.factIds.length ||
      result.factIds.length !== facts.length ||
      result.factIds.some(
        (id: unknown) => typeof id !== "string" || !facts.some((f) => f.id === id),
      ) ||
      new Set(result.factIds).size !== result.factIds.length
    )
      throw new Error();
    // Render trusted local sentences, never model-generated metrics or HTML.
    return result.factIds.map((id: string) => facts.find((f) => f.id === id)!.text);
  } catch {
    throw new Error("aiInvalidResponse");
  }
}
export const kimi: AIProvider = {
  async parseIntent(text, current, models) {
    const content = await request("parse", {
      text,
      current,
      models: models
        .filter((m) => m.layout_supported !== false)
        .map((m) => ({ id: m.id, name: m.display_name })),
    });
    return parseIntentResponse(content, current, models);
  },
  async explainPlan(facts) {
    return validateExplanation(await request("explain", { facts }), facts);
  },
};
