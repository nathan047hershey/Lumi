import { runTick } from "../lib/auto-apply";

async function loop() {
  try {
    const result = await runTick();
    console.log("[lumi-worker]", result);
  } catch (error) {
    console.warn("[lumi-worker]", error instanceof Error ? error.message : error);
  }
}

await loop();
setInterval(loop, 20_000);
