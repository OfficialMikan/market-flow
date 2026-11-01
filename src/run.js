import { CONFIG } from "./config.js";
import { SOURCES } from "./sources/index.js";
import { dedupe, rank } from "./pipeline.js";
import { enrich } from "./ai.js";
import { client, save } from "./db.js";
import { alertDeals } from "./alerts.js";
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function scan() {
  const srcs = CONFIG.sources.map(s => SOURCES[s]).filter(Boolean);
  let browser = null;
  if (srcs.some(s => s.needsBrowser)) { const { chromium } = await import("playwright"); browser = await chromium.launch({ headless: true }); }
  const raw = [];
  for (const s of srcs) for (const q of CONFIG.watch) {
    try { const r = await s.search(q, { browser }); console.log(`${s.name} "${q}": ${r.length} listings`); raw.push(...r.map(x => ({ ...x, source: s.name }))); }
    catch (e) { console.error(`${s.name} "${q}" failed:`, e.message); }
    if (s.needsBrowser) await sleep(3000 + Math.random() * 3000); // stay polite
  }
  if (browser) await browser.close();
  const ranked = rank(await enrich(dedupe(raw)));
  const sb = client();
  if (!sb) {
    console.log("No Supabase keys set, dry run. Top 10:");
    for (const r of ranked.slice(0, 10)) console.log(`score ${r.score} | ₱${r.price} → ₱${r.resale ?? "?"} (${r.marginPct}%) | demand ${r.demand} | ${r.distanceKm ?? "?"} km | ${r.title}`);
    return ranked;
  }
  const rows = await save(sb, ranked);
  await alertDeals(rows.filter(r => r.score >= CONFIG.alertMinScore && !r.alerted), sb);
  console.log(`Saved ${rows.length} listings.`);
  return ranked;
}
if (import.meta.url === `file://${process.argv[1]}`) scan().catch(e => { console.error(e); process.exit(1); });
