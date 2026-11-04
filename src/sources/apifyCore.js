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
export async function runActor(actor, input, opts = {}) {
  if (!process.env.APIFY_TOKEN) throw new Error("APIFY_TOKEN is not set");
  const r = await fetch(`${BASE}/acts/${actor}/run-sync-get-dataset-items`, {
    method: "POST", signal: AbortSignal.timeout(290000), headers: headers(), body: JSON.stringify(input) });
  if (!r.ok) throw new Error(`Apify HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const items = await r.json();
  if (!items.length && !opts.quiet) await diagnose(actor);
  return items;
}

export const toPrice = v => {
  if (typeof v === "number") return v;
  const k = /(\d+(?:\.\d+)?)\s*k\b/i.exec(String(v ?? "").replace(/,/g, ""));   // 13k and 1.2k
  if (k) return +k[1] * 1000;
  const m = String(v ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? +m[0] : NaN;
};
// Items came back but none were usable: show the first one so the field names can be fixed.
export function noteUnmapped(label, items, mapped) {
  if (items.length && !mapped.length)
    console.error(`  DEBUG ${label}: ${items.length} items came back but none were usable. First item: ${JSON.stringify(items[0]).slice(0, 500)}`);
}

// Stops Apify scans before the monthly credit runs out. Fails open (scans continue) if Apify's response is not understood.
export async function checkBudget() {
  try {
    const r = await fetch(`${BASE}/users/me/limits`, { headers: headers() });
    if (!r.ok) return { ok: true, note: `budget check unavailable (HTTP ${r.status})` };
    const d = (await r.json()).data;
    const used = d?.current?.monthlyUsageUsd, cap = +process.env.APIFY_BUDGET_USD || d?.limits?.maxMonthlyUsageUsd;
    if (typeof used !== "number" || !(cap > 0)) return { ok: true, note: "budget check unavailable (unexpected response)" };
    return { ok: used < cap * (+(process.env.APIFY_STOP_AT_PCT || 90) / 100), used, cap };
  } catch (e) { return { ok: true, note: "budget check failed: " + e.message }; }
}

export const yearsSince = v => { const t = +new Date(v); return Number.isFinite(t) && t > 0 ? Math.round((Date.now() - t) / 31557600000 * 10) / 10 : null; };
