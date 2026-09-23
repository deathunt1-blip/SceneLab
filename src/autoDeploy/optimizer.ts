import type { Parameters } from "./types";

export function neighbors(p: Parameters): Parameters[] {
  return [
    { ...p, aim: Math.max(0.1, p.aim - 0.18) },
    { ...p, aim: Math.min(0.8, p.aim + 0.18) },
    { ...p, height: Math.min(0.96, p.height + 0.08) },
    { ...p, height: Math.max(0.45, p.height - 0.16) },
    { ...p, cross: 0 },
    { ...p, cross: 0.5 },
    { ...p, phase: (p.phase + 0.45) % 1 },
    ...(p.layers > 1
      ? [
          { ...p, spread: 0.3 },
          { ...p, spread: 0.65 },
        ]
      : []),
    ...(p.layout === "hybrid"
      ? [
          { ...p, ceilingRatio: 0.25 },
          { ...p, ceilingRatio: 0.65 },
        ]
      : []),
    ...(p.layout === "free"
      ? [
          { ...p, freeShape: "ellipse" as const },
          { ...p, freeShape: "arc" as const },
        ]
      : []),
  ];
}
