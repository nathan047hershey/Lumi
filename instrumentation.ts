export async function register() {
  // Long-lived workers (queues, scrapers) do not run on Vercel serverless.
  if (process.env.VERCEL || process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startWorkers } = await import("./lib/workers");
    startWorkers();
  } catch {
    // Old rewrite workers are optional once the Express desk is the source of truth.
  }
}
