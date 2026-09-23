import type { CameraModel } from "../models";
import type { Constraints } from "../autoDeploy/types";
export interface AIFact {
  id: string;
  text: string;
}
export interface AIProvider {
  parseIntent(
    text: string,
    current: Constraints,
    models: CameraModel[],
  ): Promise<Constraints>;
  explainPlan(facts: AIFact[]): Promise<string[]>;
}
export interface AIStatus {
  enabled: boolean;
  hasKey: boolean;
  model: string;
}
export interface AIBridge {
  status(): Promise<AIStatus>;
  configure(config: {
    enabled: boolean;
    model: string;
    key?: string;
    remove?: boolean;
  }): Promise<AIStatus>;
  request(
    operation: "parse" | "explain",
    payload: unknown,
  ): Promise<{ content?: string; error?: string }>;
  cancel(): Promise<void>;
}
declare global {
  interface Window {
    sceneLabAI?: AIBridge;
  }
}
