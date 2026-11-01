import { CONFIG } from "./config.js";
import { SOURCES } from "./sources/index.js";
import { loadCustom } from "./sources/custom.js";
import { openContext } from "./browser.js";
import { dedupe, rank } from "./pipeline.js";
import { enrich } from "./ai.js";
import { client, save, loadSettings, loadSpeed, markRemoved } from "./db.js";
import { alertDeals, passesRules, notify } from "./alerts.js";
import { checkBudget } from "./sources/apifyCore.js";
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function scan() {
  const sb = client();
  const st = sb ? await loadSettings(sb) : {};
  const watch = st.watch?.length ? st.watch : CONFIG.watch; // searches edited in the dashboard win
  const rules = { minScore: CONFIG.alertMinScore, minMargin: +st.min_margin || 0,
    maxPrice: st.max_price == null ? null : +st.max_price, maxKm: st.max_km == null ? null : +st.max_km };
  const all = { ...SOURCES, ...loadCustom() };
  for (const n of CONFIG.sources) if (!all[n]) console.error(`Unknown source "${n}" (check SOURCES and sources.json)`);
  let srcs = CONFIG.sources.map(n => all[n]).filter(Boolean);
  if (srcs.some(s => s.usesApify) && process.env.APIFY_TOKEN) {
    const b = await checkBudget();
    if (b.note) console.log("Budget guard:", b.note);
    if (!b.ok) {
      const msg = `Apify budget guard: $${b.used.toFixed(2)} of $${b.cap} used this month, so Apify scans are paused until next month.`;
      console.error(msg); await notify("Market Flow paused", msg);
      srcs = srcs.filter(s => !s.usesApify);
    }
  }
  const ctx = srcs.some(s => s.needsBrowser) ? await openContext() : null;
  const raw = [], cov = [];
  for (const s of srcs) for (const q of watch) {
    try {
      const r = await s.search(q, { ctx });
      console.log(`${s.name} "${q}": ${r.length} listings`);
      raw.push(...r.map(x => ({ ...x, source: s.name, q })));
      if (s.recencySorted) { // newest-first results: anything newer than the oldest result must be present
        const t = r.map(x => x.postedAt ? +new Date(x.postedAt) : NaN).filter(Number.isFinite);
        if (r.length >= 3 && t.length >= r.length * 0.8) cov.push({ source: s.name, q, oldest: new Date(Math.min(...t)).toISOString() });
      }
    } catch (e) { console.error(`${s.name} "${q}" failed:`, e.message); }
    if (s.needsBrowser) await sleep(3000 + Math.random() * 3000);
  }
  if (ctx) await ctx.close();
  const uniq = dedupe(raw);
  const speed = sb ? await loadSpeed(sb) : {};
  const ranked = rank(await enrich(uniq), CONFIG.radiusKm, speed);
  if (!sb) {
    console.log("No Supabase keys set, dry run. Top 10:");
    for (const r of ranked.slice(0, 10)) console.log(`score ${r.score} | ₱${r.price} → ₱${r.resale ?? "?"} (${r.marginPct}%) | demand ${r.demand} | ${r.distanceKm ?? "?"} km | ${r.title}`);
    return ranked;
  }
  const rows = await save(sb, ranked);
  const gone = await markRemoved(sb, cov, new Set(uniq.map(u => u.hash)));
  if (gone) console.log(`Marked ${gone} listings as sold or removed.`);
  await alertDeals(rows.filter(r => !r.alerted && passesRules(r, rules)), sb);
  console.log(`Saved ${rows.length} listings.`);
  return ranked;
}
if (import.meta.url === `file://${process.argv[1]}`) scan().catch(e => { console.error(e); process.exit(1); });
