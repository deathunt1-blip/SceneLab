import { useCallback, useEffect, useRef } from "react";
import { activeScheme, useStore } from "../store";
import { sampleCount } from "./engine";
export function useSimulation() {
  const worker = useRef<Worker | null>(null);
  const revision = useStore((s) => activeScheme(s).revision),
    schemeId = useStore((s) => s.project.activeSchemeId),
    auto = useStore((s) => activeScheme(s).settings.autoUpdate);
  const cancel = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    useStore.getState().set({ progress: null });
  }, []);
  const run = useCallback(
    (show = true) => {
      const st = useStore.getState(),
        scheme = activeScheme(st);
      if (sampleCount(scheme) > 1_200_000) {
        st.set({ toast: "voxelLimit" });
        return;
      }
      cancel();
      if (show)
        st.set({
          mode: "analysis",
          layer: st.layer === "none" ? "coverage" : st.layer,
          clip: Math.min(st.clip, scheme.boundary[2]),
        });
      st.set({ progress: 0 });
      const w = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      worker.current = w;
      w.onmessage = ({ data }) => {
        if (worker.current !== w) return;
        const current = useStore.getState();
        if (data.type === "progress") current.set({ progress: data.progress });
        else if (data.type === "result") {
          if (
            current.project.activeSchemeId === scheme.id &&
            activeScheme(current).revision === scheme.revision
          )
            current.set({ result: data.result, progress: null });
          cancel();
        } else {
          current.set({
            toast: data.error?.includes("voxelLimit") ? "voxelLimit" : "calculationError",
          });
          cancel();
        }
      };
      w.onerror = () => {
        useStore.getState().set({ toast: "calculationError" });
        cancel();
      };
      w.postMessage({ scheme });
    },
    [cancel],
  );
  useEffect(() => {
    cancel();
    const timer = setTimeout(() => run(false), 200);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [schemeId, run, cancel]);
  useEffect(() => {
    if (!auto) return;
    const timer = setTimeout(() => run(false), 700);
    return () => clearTimeout(timer);
  }, [revision, auto, run]);
  return { run, cancel };
}
