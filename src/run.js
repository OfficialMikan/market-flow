import { CONFIG } from "./config.js";
import { SOURCES } from "./sources/index.js";
import { loadCustom } from "./sources/custom.js";
import { openContext } from "./browser.js";
import { dedupe, rank, hash, pickForDetails, restore, fixTinyPrices } from "./pipeline.js";
import { buildQueryList, pickSlice, ALL_CATEGORIES } from "./catalog.js";
import { enrich } from "./ai.js";
import { inspect, mergeVision } from "./vision.js";
import { locateAll } from "./geo.js";
import { discover, evaluate } from "./discover.js";
import { client, save, loadSettings, loadContext, markRemoved, setCursor, loadKnown, loadHome, loadGeoCache, saveGeoCache, loadGroups, upsertGroups } from "./db.js";
import { alertDeals, passesRules, notify } from "./alerts.js";
import { checkBudget } from "./sources/apifyCore.js";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEEP = ["description", "conditionRaw", "attributes", "images", "seller", "meetup", "negotiable", "oldPrice", "lat", "lng", "locationText"];

// Finds public groups near you about once a week, checks a couple of new ones per scan, switches on the good ones.
async function maintainGroups(sb, rows, home) {
  if (!sb || !process.env.APIFY_TOKEN || CONFIG.discoverEvery <= 0) return rows;
  const out = [...rows], last = Math.max(0, ...rows.filter(r => r.source === "discovered").map(r => +new Date(r.found_at)));
  if (Date.now() - last > CONFIG.discoverEvery * 864e5) {
    try {
      const urls = await discover(home), have = new Set(rows.map(r => r.url));
      const add = urls.filter(u => !have.has(u)).slice(0, 20).map(url => ({ url, status: "candidate", source: "discovered", found_at: new Date().toISOString() }));
      await upsertGroups(sb, add); out.push(...add);
      console.log(`Group finder: ${urls.length} public groups found, ${add.length} new`);
    } catch (e) { console.error("Group finder failed:", e.message); }
  }
  let n = 0;
  for (const g of out.filter(r => r.status === "candidate")) {
    if (n++ >= CONFIG.discoverEval) break;
    try {
      const ev = await evaluate(g.url, home);
      Object.assign(g, { status: ev.status, score: ev.score, posts_seen: ev.postsSeen, sell_ratio: ev.sellRatio, local_ratio: ev.localRatio, reason: ev.reason, checked_at: new Date().toISOString() });
      await upsertGroups(sb, [{ url: g.url, status: g.status, score: g.score, posts_seen: g.posts_seen, sell_ratio: g.sell_ratio, local_ratio: g.local_ratio, reason: g.reason, checked_at: g.checked_at }]);
      console.log(`Group ${g.url}: ${ev.status} (score ${ev.score}, ${ev.postsSeen} posts)`);
    } catch (e) { console.error(`Group check failed for ${g.url}:`, e.message); }
  }
  return out;
}

export async function scan() {
  const sb = client();
  const st = sb ? await loadSettings(sb) : {};
  const homeDb = sb ? await loadHome(sb).catch(() => null) : null;
  if (homeDb) CONFIG.home = homeDb;                                  // distance and zones are measured from your saved location
  const home = CONFIG.home, fees = { haggle: st.haggle_pct ?? CONFIG.haggle, fee: st.fee_pct ?? CONFIG.fee };
  const near = st.near_km ?? CONFIG.near, far = st.far_km ?? CONFIG.far;
  const cats = st.categories?.length ? st.categories : (CONFIG.categories.length ? CONFIG.categories : ALL_CATEGORIES);
  const mine = (st.watch?.length ? st.watch : CONFIG.watch).slice(0, CONFIG.perRun);
  const { queries: rotating, next } = pickSlice(buildQueryList(cats).filter(q => !mine.includes(q)), st.cursor || 0, Math.max(0, CONFIG.perRun - mine.length));
  const watch = [...mine, ...rotating];
  const rules = { minScore: CONFIG.alertMinScore, minMargin: +st.min_margin || 0, minNet: st.min_net == null ? null : +st.min_net,
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
  const groupRows = srcs.some(s => s.usesApify) ? await maintainGroups(sb, sb ? await loadGroups(sb) : [], home) : [];
  const manual = st.groups?.length ? st.groups : CONFIG.groups;
  const groups = [...new Set([...manual, ...groupRows.filter(g => g.status === "active").map(g => g.url)])].slice(0, CONFIG.maxGroups);
  srcs = srcs.filter(s => !s.once || groups.length);
  console.log(`Searches this run: ${watch.join(", ") || "(none)"}${groups.length ? ` | groups: ${groups.length}` : ""}`);
  const ctx = srcs.some(s => s.needsBrowser) ? await openContext() : null;
  const raw = [], cov = [];
  for (const s of srcs) {
    if (s.once) {
      try { raw.push(...(await s.scanAll({ groups })).map(x => ({ ...x, source: s.name, q: "groups" }))); }
      catch (e) { console.error(`${s.name} failed:`, e.message); }
      continue;
    }
    for (const q of watch) {
      try {
        const r = await s.search(q, { ctx });
        console.log(`${s.name} "${q}": ${r.length} listings`);
        raw.push(...r.map(x => ({ ...x, source: s.name, q })));
        if (s.recencySorted) {
          const t = r.map(x => x.postedAt ? +new Date(x.postedAt) : NaN).filter(Number.isFinite);
          if (r.length >= 3 && t.length >= r.length * 0.8) cov.push({ source: s.name, q, oldest: new Date(Math.min(...t)).toISOString() });
        }
      } catch (e) { console.error(`${s.name} "${q}" failed:`, e.message); }
      if (s.needsBrowser) await sleep(3000 + Math.random() * 3000);
    }
  }
  if (ctx) await ctx.close();
  const uniq = dedupe(raw), known = sb ? await loadKnown(sb, uniq.map(u => u.hash)) : new Map();
  let rows = uniq.map(l => known.has(l.hash) ? restore(l, known.get(l.hash)) : l);        // listings seen before are not analysed twice
  // Full details (description, specs, seller, coordinates) for new listings, best price first; the rest fill in on later scans.
  const can = srcs.filter(s => s.details).map(s => s.name), by = {};
  for (const l of pickForDetails(rows.filter(r => !r.detailed), CONFIG.detailMax, can, 1)) (by[l.source] ??= []).push(l);
  for (const [sn, items] of Object.entries(by)) {
    try {
      const m = await srcs.find(s => s.name === sn).details(items.map(i => i.url));
      for (const it of items) {
        const d = m.get(hash(it.url)); if (!d) continue;
        for (const k of KEEP) if (d[k] != null && d[k] !== "" && !(Array.isArray(d[k]) && !d[k].length)) it[k] = d[k];
        if (d.lat != null) it.geoPrecision = undefined;                                   // exact coordinates replace an earlier town guess
        it.detailed = true; it.needsAI = true;
      }
      console.log(`${sn} details: ${m.size} of ${items.length}`);
    } catch (e) { console.error(`${sn} details failed:`, e.message); }
  }
  const done = new Map((await enrich(rows.filter(r => !r.enriched || r.needsAI))).map(e => [e.hash, e]));
  const list = rows.map(r => done.get(r.hash) || r).filter(l => l.intent !== "other" && !l.multi && (l.intent === "wanted" || l.price > 0));
  let looked = 0;                                                                         // photo check for a few listings per scan
  for (let i = 0; i < list.length && looked < CONFIG.visionTopN; i++) {
    const l = list[i];
    if (l.visionDone || l.intent === "wanted" || !(l.imageUrl || l.images?.length) || !(done.has(l.hash))) continue;
    looked++;
    const v = await inspect(l);
    list[i] = { ...mergeVision(l, v), visionDone: !!v };
  }
  fixTinyPrices(list);
  const cache = sb ? await loadGeoCache(sb) : new Map();
  const fresh = await locateAll(list, { home, cache, cap: CONFIG.geocodeCap });
  if (sb) await saveGeoCache(sb, fresh);
  const ranked = rank(list, CONFIG.radiusKm, { ...(sb ? await loadContext(sb) : {}), fees, near, far });
  if (!sb) {
    console.log("No Supabase keys set, dry run. Top 10:");
    for (const r of ranked.slice(0, 10)) console.log(`${r.intent === "wanted" ? "WANTED" : "sell"} score ${r.score} | ₱${r.price} → ₱${r.resale ?? "?"} (${r.sellBasis || "-"}) net ₱${r.net ?? "?"} | buyers ${r.matches?.length || 0} | ${r.place || "?"} ${r.distanceKm ?? "?"} km ${r.zone} (${r.geoPrecision}) | ${r.title}${r.priceNote ? " [" + r.priceNote + "]" : ""}`);
    return ranked;
  }
  const rows2 = await save(sb, ranked);
  const gone = await markRemoved(sb, cov, new Set(uniq.map(u => u.hash)));
  if (gone) console.log(`Marked ${gone} listings as sold or removed.`);
  await setCursor(sb, next);
  await alertDeals(rows2.filter(r => (!r.alerted && passesRules(r, rules)) || (r.newDrop >= 10 && passesRules(r, { ...rules, minScore: 0 }))), sb);
  console.log(`Saved ${rows2.length} listings.`);
  return ranked;
}
if (import.meta.url === `file://${process.argv[1]}`) scan().catch(e => { console.error(e); process.exit(1); });
