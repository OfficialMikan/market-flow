import { CONFIG } from "./config.js";
import { SOURCES } from "./sources/index.js";
import { loadCustom } from "./sources/custom.js";
import { openContext } from "./browser.js";
import { dedupe, rank, hash, pickForDetails } from "./pipeline.js";
import { buildQueryList, pickSlice, ALL_CATEGORIES } from "./catalog.js";
import { enrich } from "./ai.js";
import { client, save, loadSettings, loadContext, markRemoved, setCursor } from "./db.js";
import { alertDeals, passesRules, notify } from "./alerts.js";
import { checkBudget } from "./sources/apifyCore.js";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEEP = ["description", "conditionRaw", "attributes", "images", "seller", "meetup", "negotiable", "oldPrice"];

export async function scan() {
  const sb = client();
  const st = sb ? await loadSettings(sb) : {};
  const cats = st.categories?.length ? st.categories : (CONFIG.categories.length ? CONFIG.categories : ALL_CATEGORIES);
  const mine = (st.watch?.length ? st.watch : CONFIG.watch).slice(0, CONFIG.perRun);   // your own searches run every time
  const { queries: rotating, next } = pickSlice(buildQueryList(cats).filter(q => !mine.includes(q)), st.cursor || 0, Math.max(0, CONFIG.perRun - mine.length));
  const watch = [...mine, ...rotating];
  const groups = st.groups?.length ? st.groups : CONFIG.groups;
  const rules = { minScore: CONFIG.alertMinScore, minMargin: +st.min_margin || 0, minNet: st.min_net == null ? null : +st.min_net,
    maxPrice: st.max_price == null ? null : +st.max_price, maxKm: st.max_km == null ? null : +st.max_km };
  const all = { ...SOURCES, ...loadCustom() };
  for (const n of CONFIG.sources) if (!all[n]) console.error(`Unknown source "${n}" (check SOURCES and sources.json)`);
  let srcs = CONFIG.sources.map(n => all[n]).filter(Boolean).filter(s => !s.once || groups.length);
  if (srcs.some(s => s.usesApify) && process.env.APIFY_TOKEN) {
    const b = await checkBudget();
    if (b.note) console.log("Budget guard:", b.note);
    if (!b.ok) {
      const msg = `Apify budget guard: $${b.used.toFixed(2)} of $${b.cap} used this month, so Apify scans are paused until next month.`;
      console.error(msg); await notify("Market Flow paused", msg);
      srcs = srcs.filter(s => !s.usesApify);
    }
  }
  console.log(`Searches this run: ${watch.join(", ") || "(none)"}${groups.length ? ` | groups: ${groups.length}` : ""}`);
  const ctx = srcs.some(s => s.needsBrowser) ? await openContext() : null;
  const raw = [], cov = [];
  for (const s of srcs) {
    if (s.once) { // group sources read whole feeds, not searches
      try { raw.push(...(await s.scanAll({ groups })).map(x => ({ ...x, source: s.name, q: "groups" }))); }
      catch (e) { console.error(`${s.name} failed:`, e.message); }
      continue;
    }
    for (const q of watch) {
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
  }
  if (ctx) await ctx.close();
  const uniq = dedupe(raw);
  // Paid detail fetch (description, seller, specs) only for the few listings priced well below their search's median.
  if (CONFIG.detailTopN > 0) {
    const can = srcs.filter(s => s.details).map(s => s.name), by = {};
    for (const l of pickForDetails(uniq, CONFIG.detailTopN, can)) (by[l.source] ??= []).push(l);
    for (const [sn, items] of Object.entries(by)) {
      try {
        const m = await srcs.find(s => s.name === sn).details(items.map(i => i.url));
        for (const it of items) { const d = m.get(hash(it.url)); if (d) for (const k of KEEP) if (d[k] != null && d[k] !== "" && !(Array.isArray(d[k]) && !d[k].length)) it[k] = d[k]; }
        console.log(`${sn} details: ${m.size} of ${items.length}`);
      } catch (e) { console.error(`${sn} details failed:`, e.message); }
    }
  }
  const kept = (await enrich(uniq)).filter(l => l.intent !== "other" && !l.multi && (l.intent === "wanted" || l.price > 0));
  const ranked = rank(kept, CONFIG.radiusKm, sb ? await loadContext(sb) : {});
  if (!sb) {
    console.log("No Supabase keys set, dry run. Top 10:");
    for (const r of ranked.slice(0, 10)) console.log(`${r.intent === "wanted" ? "WANTED" : "sell"} score ${r.score} | ₱${r.price} → ₱${r.resale ?? "?"} (${r.sellBasis || "-"}) net ₱${r.net ?? "?"} | buyers ${r.matches?.length || 0} | ${r.distanceKm ?? "?"} km | ${r.title}`);
    return ranked;
  }
  const rows = await save(sb, ranked);
  const gone = await markRemoved(sb, cov, new Set(uniq.map(u => u.hash)));
  if (gone) console.log(`Marked ${gone} listings as sold or removed.`);
  await setCursor(sb, next);
  await alertDeals(rows.filter(r => (!r.alerted && passesRules(r, rules)) || (r.newDrop >= 10 && passesRules(r, { ...rules, minScore: 0 }))), sb);
  console.log(`Saved ${rows.length} listings.`);
  return ranked;
}
if (import.meta.url === `file://${process.argv[1]}`) scan().catch(e => { console.error(e); process.exit(1); });
