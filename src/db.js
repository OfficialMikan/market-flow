import { createClient } from "@supabase/supabase-js";
import { speedByName, findGone } from "./pipeline.js";
export const client = () =>
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : null;

export async function save(sb, rows) {
  const old = new Map();
  for (let i = 0; i < rows.length; i += 100) {
    const { data, error } = await sb.from("listings").select("hash,price,alerted").in("hash", rows.slice(i, i + 100).map(r => r.hash));
    if (error) throw error;
    for (const d of data) old.set(d.hash, d);
  }
  const now = new Date().toISOString();
  const recs = rows.map(r => ({ hash: r.hash, source: r.source, url: r.url, title: r.title, name: r.name, category: r.category,
    price: r.price, resale: r.resale, margin_pct: r.marginPct, demand: r.demand, score: r.score, distance_km: r.distanceKm,
    location_text: r.locationText || null, image_url: r.imageUrl || null, comments: r.comments || 0, posted_at: r.postedAt || null, last_seen: now, q: r.q || null, removed_at: null, sell_days: r.sellDays ?? null }));
  for (let i = 0; i < recs.length; i += 100) {
    const { error } = await sb.from("listings").upsert(recs.slice(i, i + 100), { onConflict: "hash" });
    if (error) throw new Error(error.message + " (did you run supabase/migration-2.sql in Supabase?)");
  }
  const hist = rows.filter(r => !old.has(r.hash) || +old.get(r.hash).price !== r.price).map(r => ({ hash: r.hash, price: r.price }));
  if (hist.length) { const { error } = await sb.from("price_history").insert(hist); if (error) throw error; }
  return rows.map(r => ({ ...r, alerted: old.get(r.hash)?.alerted || false }));
}
export async function markAlerted(sb, hashes) {
  if (hashes.length) await sb.from("listings").update({ alerted: true }).in("hash", hashes);
}

export async function loadSettings(sb) {
  const { data, error } = await sb.from("settings").select("*").eq("id", 1).maybeSingle();
  if (error) { console.error("Could not read settings (run supabase/migration-2.sql):", error.message); return {}; }
  return data || {};
}
export async function loadSpeed(sb) {
  const { data } = await sb.from("listings").select("name,posted_at,first_seen,removed_at").not("removed_at", "is", null).limit(3000);
  return speedByName(data || []);
}
// A listing counts as sold/removed only if the recency-sorted search window must have shown it and it is missing.
export async function markRemoved(sb, coverage, seen) {
  let total = 0;
  for (const c of coverage) {
    const { data } = await sb.from("listings").select("hash,posted_at").eq("source", c.source).eq("q", c.q).is("removed_at", null).gte("posted_at", c.oldest).limit(500);
    const gone = findGone(data || [], seen);
    if (gone === null) { console.error(`  ${c.source} "${c.q}": most listings vanished at once, treating it as a scrape problem`); continue; }
    if (gone.length) { await sb.from("listings").update({ removed_at: new Date().toISOString() }).in("hash", gone); total += gone.length; }
  }
  return total;
}
