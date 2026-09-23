import { planDeployment } from "./planner";
self.onmessage = ({ data }) => {
  try {
    const output = planDeployment(data, (p) =>
      self.postMessage({ type: "progress", progress: p }),
    );
    self.postMessage(
      { type: "result", output },
      {
        transfer: output.recommendations.flatMap((r) => [
          r.result.positions.buffer,
          r.result.counts.buffer,
          r.result.errors.buffer,
        ]),
      },
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "calculationError",
    });
  }
};
