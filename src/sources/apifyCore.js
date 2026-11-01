// Shared Apify runner. When a run returns nothing it prints the run's status and log tail, so the cause is visible in the GitHub log.
const BASE = "https://api.apify.com/v2";
const headers = () => ({ authorization: `Bearer ${process.env.APIFY_TOKEN}`, "content-type": "application/json" });

async function diagnose(actor) {
  try {
    const run = (await (await fetch(`${BASE}/acts/${actor}/runs/last`, { headers: headers() })).json()).data;
    console.error(`  DEBUG ${actor}: run ${run.id} status=${run.status} message="${run.statusMessage || ""}" cost=$${run.usageTotalUsd ?? "?"}`);
    const log = await (await fetch(`${BASE}/actor-runs/${run.id}/log`, { headers: headers() })).text();
    console.error("  DEBUG log tail: " + log.slice(-700).replace(/\s*\n\s*/g, " | "));
  } catch (e) { console.error("  DEBUG could not read the Apify run log:", e.message); }
}
export async function runActor(actor, input) {
  if (!process.env.APIFY_TOKEN) throw new Error("APIFY_TOKEN is not set");
  const r = await fetch(`${BASE}/acts/${actor}/run-sync-get-dataset-items`, {
    method: "POST", signal: AbortSignal.timeout(290000), headers: headers(), body: JSON.stringify(input) });
  if (!r.ok) throw new Error(`Apify HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const items = await r.json();
  if (!items.length) await diagnose(actor);
  return items;
}
