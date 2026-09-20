import { runTick } from "./auto-apply";

const globalForWorkers = globalThis as unknown as { lumiWorkers?: boolean };

export function startWorkers() {
  if (globalForWorkers.lumiWorkers) return;
  globalForWorkers.lumiWorkers = true;
  const tick = async () => {
    try {
      await runTick();
    } catch (error) {
      console.warn("[lumi-worker]", error instanceof Error ? error.message : error);
    }
  };
  setTimeout(tick, 2500);
  setInterval(tick, 20_000);
}
