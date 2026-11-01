import { CONFIG } from "./config.js";
import { SOURCES } from "./sources/index.js";
import { loadCustom } from "./sources/custom.js";
import { openContext } from "./browser.js";
import { dedupe, rank } from "./pipeline.js";
import { enrich } from "./ai.js";
import { client, save } from "./db.js";
import { alertDeals } from "./alerts.js";
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function scan() {
  const all = { ...SOURCES, ...loadCustom() };
  for (const n of CONFIG.sources) if (!all[n]) console.error(`Unknown source "${n}" (check SOURCES and sources.json)`);
  const srcs = CONFIG.sources.map(n => all[n]).filter(Boolean);
  const ctx = srcs.some(s => s.needsBrowser) ? await openContext() : null;
  const raw = [];
  for (const s of srcs) for (const q of CONFIG.watch) {
    try { const r = await s.search(q, { ctx }); console.log(`${s.name} "${q}": ${r.length} listings`); raw.push(...r.map(x => ({ ...x, source: s.name }))); }
    catch (e) { console.error(`${s.name} "${q}" failed:`, e.message); }
    if (s.needsBrowser) await sleep(3000 + Math.random() * 3000); // stay polite
  }
  if (ctx) await ctx.close();
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
