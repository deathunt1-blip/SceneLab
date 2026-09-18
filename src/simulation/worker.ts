import { simulate } from "./engine";
self.onmessage = ({ data }) => {
  try {
    const result = simulate(data.scheme, (progress) =>
      self.postMessage({ type: "progress", progress }),
    );
    self.postMessage(
      { type: "result", result },
      {
        transfer: [
          result.positions.buffer,
          result.counts.buffer,
          result.errors.buffer,
        ],
      },
    );
  } catch (error) {
    self.postMessage({ type: "error", error: String(error) });
  }
};
